/* DataLab — voice chat, push to talk: while the player HOLDS the key (Espaço by default) the microphone
   is on and everyone in the room hears it; letting go turns the microphone off for real (the browser's
   "microphone in use" mark goes away). Only inside an online room: playing solo, Espaço stays "interact".
   Every two players of a room get their own audio call (WebRTC, straight between them); the room's
   connection (services/net-service.js → multiplayer.js) only carries the handshake ("vsig") and who is
   talking ("vtalk"). The lower id calls the higher one, so two calls never cross. No TURN server yet:
   networks that block direct connections (some mobile carriers, offices) get a note instead of voice.
   Settings (volume, key, muted players) live in Configurações and stay in this browser. */
(function () {
  'use strict';
  const DL = window.DL, D = window.DataLabDemo;
  if (!D || DL.HERO || !DL.MP) return;
  const G = D.game, MP = DL.MP;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const toast = (tone, title, text) => G.toast(tone, title, text);
  const ICE = (DL.Net && DL.Net.ICE) || [{ urls: 'stun:stun.l.google.com:19302' }];
  // the browser's own echo cancelling, noise suppression and level control
  const MIC = { audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } };
  const CONNECT_MS = 20000; // a call that isn't up in this long failed
  const RETRY_MS = 4000;    // the caller tries once more after a failure

  /* ------------------------------------------------------------------ */
  /* settings (Configurações → Chat de voz)                              */
  /* ------------------------------------------------------------------ */
  const STORE = 'datalab.voice.v1';
  const V = { vol: 8, key: 'Space', muted: [], ok: false };
  try { Object.assign(V, JSON.parse(localStorage.getItem(STORE) || '{}')); } catch (e) { /* defaults */ }
  V.vol = Math.max(0, Math.min(10, Math.round(Number(V.vol)))); if (!Number.isFinite(V.vol)) V.vol = 8;
  if (typeof V.key !== 'string' || !V.key) V.key = 'Space';
  if (!Array.isArray(V.muted)) V.muted = [];
  const keep = () => { try { localStorage.setItem(STORE, JSON.stringify(V)); } catch (e) { /* private mode */ } };

  // keys the game already uses (or that the browser needs) can't become the talk key
  const TAKEN = /^(Escape|Enter|NumpadEnter|Tab|Backspace|Delete|Shift\w*|Control\w*|Alt\w*|Meta\w*|OS\w*|Arrow\w+|Digit\d|Numpad\d|Key[ABCDEFHIJKLMNOPRSTUVWX])$/;
  function keyName(code) {
    if (code === 'Space') return 'Espaço';
    if (/^Key[A-Z]$/.test(code)) return code.slice(3);
    if (code === 'CapsLock') return 'Caps Lock';
    if (code === 'Backquote') return '`';
    return code.replace(/^(Numpad)/, 'Num ');
  }

  /* ------------------------------------------------------------------ */
  /* state                                                               */
  /* ------------------------------------------------------------------ */
  const peers = new Map();    // player id → { id, pc, sender, audio, caller, ok, timer, tries, born }
  const speaking = new Set(); // ids of the other players talking right now
  const noted = new Set();    // ids we already told "voice unavailable"
  let talking = false, held = false, sentOn = false, want = 0, mic = null;
  let micState = 'unknown';   // 'granted' | 'denied' | 'prompt' | 'unknown'
  let asking = false;         // the browser's own permission question is up

  const supported = () => !!(window.RTCPeerConnection && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  const inRoom = () => !!(MP.role && MP.id);
  const playing = () => D.state.phase === 'play' && !($('title') && !$('title').hidden);
  const active = () => inRoom() && playing() && !(DL.AuthGate && DL.AuthGate.open) && !(DL.Welcome && DL.Welcome.isOpen);
  const nameOf = (id) => { const p = MP.players().find((x) => x.id === id); return p ? p.name : 'Jogador'; };
  const isMuted = (id) => V.muted.indexOf(nameOf(id)) >= 0;

  if (navigator.permissions && navigator.permissions.query) {
    navigator.permissions.query({ name: 'microphone' }).then((st) => {
      micState = st.state;
      st.onchange = () => { micState = st.state; };
    }).catch(() => { /* Firefox doesn't say: the remembered answer decides */ });
  }
  // the explanation shows once: after the first yes, a browser that forgets (Safari, "only this time")
  // asks again by itself
  const micReady = () => micState === 'granted' || V.ok;

  /* ------------------------------------------------------------------ */
  /* the microphone: on only while the key is held                       */
  /* ------------------------------------------------------------------ */
  const stopStream = (s) => { if (s) s.getTracks().forEach((t) => t.stop()); };
  const micTrack = () => (mic ? mic.getAudioTracks()[0] || null : null);
  function feed(track) {
    for (const P of peers.values()) if (P.sender) P.sender.replaceTrack(track).catch(() => { /* call closing */ });
  }
  function say(on) {
    if (sentOn === on) return;
    sentOn = on;
    MP.send({ t: 'vtalk', on });
  }

  async function startTalk() {
    if (talking) return;
    if (!supported()) {
      toast('warn', 'Chat de voz', window.isSecureContext ? 'Este navegador não tem suporte a voz.' : 'O microfone só funciona no site com https ou em localhost.');
      return;
    }
    if (micState === 'denied') { blocked(); return; }
    // the browser is still answering the first "Permitir": no second question
    if (asking) return;
    if (!micReady()) { openAsk(); return; }
    talking = true;
    const my = ++want;
    render();
    let s;
    try { s = await navigator.mediaDevices.getUserMedia(MIC); } catch (e) {
      if (my === want) { talking = false; render(); }
      micError(e);
      return;
    }
    // let go before the microphone came up: it closes straight away
    if (my !== want || !talking) { stopStream(s); return; }
    mic = s;
    V.ok = true; keep();
    feed(micTrack());
    say(true);
    render();
  }

  function stopTalk() {
    held = false;
    if (!talking) return;
    talking = false;
    want++;
    feed(null);
    stopStream(mic);
    mic = null;
    say(false);
    render();
  }

  function micError(e) {
    const n = e && e.name;
    // the browser's question was closed without an answer: it asks again next time
    if (n === 'NotAllowedError' && /dismiss/i.test(e.message || '')) toast('info', 'Chat de voz', 'O pedido do microfone foi fechado. Segure ' + keyName(V.key) + ' de novo quando quiser falar.');
    else if (n === 'NotAllowedError' || n === 'SecurityError') { micState = 'denied'; V.ok = false; keep(); blocked(); }
    else if (n === 'NotFoundError' || n === 'OverconstrainedError') toast('warn', 'Chat de voz', 'Nenhum microfone encontrado neste computador.');
    else if (n === 'NotReadableError') toast('warn', 'Chat de voz', 'O microfone está ocupado por outro programa.');
    else toast('warn', 'Chat de voz', 'Não foi possível ligar o microfone.');
  }
  let blockedAt = 0;
  function blocked() {
    if (Date.now() - blockedAt < 4000) return;
    blockedAt = Date.now();
    toast('warn', 'Microfone bloqueado', 'Para falar, libere o microfone no cadeado ao lado do endereço do site e recarregue a página. O jogo continua normal.');
  }

  /* ------------------------------------------------------------------ */
  /* first time: say why before the browser asks                         */
  /* ------------------------------------------------------------------ */
  const ask = document.createElement('div');
  ask.className = 'vc-ask';
  ask.hidden = true;
  ask.setAttribute('role', 'dialog');
  ask.setAttribute('aria-modal', 'true');
  ask.setAttribute('aria-labelledby', 'vcAskTitle');
  ask.innerHTML = '<div class="vc-ask__box"><p class="vc-ask__eyebrow">Chat de voz</p><h2 class="vc-ask__title" id="vcAskTitle">Usar o microfone?</h2>' +
    '<p class="vc-ask__text">Para falar com quem está na sala, o DataLab precisa do seu microfone. Ele <b>só liga enquanto você segura <span class="vc-ask__key"></span></b> e desliga assim que você solta.</p>' +
    '<p class="vc-ask__text vc-ask__small">O navegador vai pedir a permissão em seguida.</p>' +
    '<div class="vc-ask__acts"><button class="btn btn--sm" type="button" data-vc="no">Agora não</button><button class="btn btn--sm btn--primary" type="button" data-vc="yes">Permitir microfone</button></div></div>';
  document.body.appendChild(ask);
  const askOpen = () => !ask.hidden;
  function openAsk() {
    ask.querySelector('.vc-ask__key').textContent = keyName(V.key);
    ask.hidden = false;
  }
  function closeAsk() { ask.hidden = true; }
  async function allow() {
    closeAsk();
    if (asking) return;
    asking = true;
    try {
      // just the permission: the microphone closes again right away
      stopStream(await navigator.mediaDevices.getUserMedia(MIC));
      micState = 'granted';
      V.ok = true; keep();
      toast('ok', 'Microfone liberado', 'Segure ' + keyName(V.key) + ' para falar com a sala.');
    } catch (e) { micError(e); }
    asking = false;
  }
  ask.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-vc]');
    if (b) { b.blur(); if (b.dataset.vc === 'yes') allow(); else closeAsk(); }
  });

  /* ------------------------------------------------------------------ */
  /* the calls: one per pair of players                                  */
  /* ------------------------------------------------------------------ */
  // the offer / answer go out once the network candidates are in (one message each way)
  function gathered(pc, ms) {
    return new Promise((res) => {
      if (pc.iceGatheringState === 'complete') return res();
      const t = setTimeout(res, ms);
      pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
    });
  }

  const sink = document.createElement('div');
  sink.hidden = true;
  document.body.appendChild(sink);
  const waiting = new Set(); // audio the browser didn't let play yet (no click on the page so far)
  function play(audio) {
    const r = audio.play();
    if (r && r.catch) r.catch(() => waiting.add(audio));
  }
  const unblock = () => { for (const a of waiting) { waiting.delete(a); play(a); } };
  addEventListener('pointerdown', unblock, true);
  addEventListener('keydown', unblock, true);

  function setVolume(P) {
    if (!P.audio) return;
    P.audio.volume = V.vol / 10;
    P.audio.muted = isMuted(P.id);
  }

  function newPeer(id, caller, tries) {
    const pc = new RTCPeerConnection({ iceServers: ICE });
    const P = { id, pc, sender: null, audio: null, caller, ok: false, timer: 0, tries: tries || 0, born: Date.now() };
    peers.set(id, P);
    pc.ontrack = (ev) => {
      if (!P.audio) { P.audio = document.createElement('audio'); P.audio.autoplay = true; sink.appendChild(P.audio); }
      P.audio.srcObject = (ev.streams && ev.streams[0]) || new MediaStream([ev.track]);
      setVolume(P);
      play(P.audio);
    };
    pc.onconnectionstatechange = () => {
      if (peers.get(id) !== P) return;
      if (pc.connectionState === 'connected') {
        P.ok = true;
        clearTimeout(P.timer);
        if (noted.delete(id)) render();
      } else if (pc.connectionState === 'failed') failed(P);
    };
    P.timer = setTimeout(() => { if (peers.get(id) === P && !P.ok) failed(P); }, CONNECT_MS);
    return P;
  }

  function closePeer(P) {
    if (peers.get(P.id) === P) peers.delete(P.id);
    clearTimeout(P.timer);
    P.pc.ontrack = null;
    P.pc.onconnectionstatechange = null;
    try { P.pc.close(); } catch (e) { /* closed */ }
    if (P.audio) { waiting.delete(P.audio); P.audio.srcObject = null; P.audio.remove(); }
  }

  // the two computers couldn't reach each other: the caller tries once more, then a note
  function failed(P) {
    closePeer(P);
    if (P.caller && P.tries < 1) {
      setTimeout(() => { if (inRoom() && !peers.has(P.id) && others().has(P.id)) call(P.id, P.tries + 1); }, RETRY_MS);
      return;
    }
    if (!noted.has(P.id)) {
      noted.add(P.id);
      toast('warn', 'Chat de voz', 'Voz indisponível com ' + nameOf(P.id) + ': a rede de um de vocês bloqueia a ligação direta. O jogo continua normal.');
      render();
    }
  }

  async function call(id, tries) {
    const P = newPeer(id, true, tries);
    const pc = P.pc;
    try {
      P.sender = pc.addTransceiver('audio', { direction: 'sendrecv' }).sender;
      if (micTrack()) P.sender.replaceTrack(micTrack());
      await pc.setLocalDescription(await pc.createOffer());
      await gathered(pc, 3000);
      if (peers.get(id) === P) MP.send({ t: 'vsig', to: id, kind: 'offer', sdp: pc.localDescription.toJSON() });
    } catch (e) { if (peers.get(id) === P) failed(P); }
  }

  async function answer(from, sdp) {
    const old = peers.get(from);
    if (old) closePeer(old);
    const P = newPeer(from, false);
    const pc = P.pc;
    try {
      await pc.setRemoteDescription(sdp);
      const tr = pc.getTransceivers().find((t) => t.receiver && t.receiver.track && t.receiver.track.kind === 'audio');
      if (!tr) throw new Error('no audio');
      tr.direction = 'sendrecv';
      P.sender = tr.sender;
      if (micTrack()) P.sender.replaceTrack(micTrack());
      await pc.setLocalDescription(await pc.createAnswer());
      await gathered(pc, 3000);
      if (peers.get(from) === P) MP.send({ t: 'vsig', to: from, kind: 'answer', sdp: pc.localDescription.toJSON() });
    } catch (e) { if (peers.get(from) === P) failed(P); }
  }

  function onVoice(m) {
    if (!inRoom() || !m.from || m.from === MP.id) return;
    if (m.t === 'vtalk') {
      if (m.on) speaking.add(m.from); else speaking.delete(m.from);
      render();
      return;
    }
    if (m.to && m.to !== MP.id) return;
    if (!supported() || !m.sdp) return;
    if (m.kind === 'offer') answer(m.from, m.sdp);
    else if (m.kind === 'answer') {
      const P = peers.get(m.from);
      if (P && P.caller && P.pc.signalingState === 'have-local-offer') P.pc.setRemoteDescription(m.sdp).catch(() => failed(P));
    }
  }

  // who else is in the room right now
  const others = () => new Set(inRoom() ? MP.players().filter((p) => !p.me && p.id).map((p) => p.id) : []);
  let lastIds = '';
  function sync() {
    const ids = others();
    if (!inRoom()) {
      if (talking || held) stopTalk();
      sentOn = false;
    }
    // a call that just arrived may come before the roster that lists its caller
    for (const P of Array.from(peers.values())) if (!ids.has(P.id) && Date.now() - P.born > 5000) closePeer(P);
    for (const id of Array.from(speaking)) if (!ids.has(id)) speaking.delete(id);
    for (const id of Array.from(noted)) if (!ids.has(id)) noted.delete(id);
    if (supported()) for (const id of ids) if (!peers.has(id) && !noted.has(id) && MP.id < id) call(id);
    const key = Array.from(ids).sort().join(',') + '|' + MP.players().map((p) => p.name).join(',');
    if (key !== lastIds) { lastIds = key; renderMutes(); }
    render();
  }
  MP.on('voice', onVoice);
  MP.on('roster', sync);
  MP.on('state', sync);
  MP.on('ended', sync);
  setInterval(sync, 1500);

  /* ------------------------------------------------------------------ */
  /* the key                                                             */
  /* ------------------------------------------------------------------ */
  const TEXT_INPUTS = /^(|text|search|password|email|number|tel|url|date|time|datetime-local|month|week)$/;
  function typing() {
    const el = document.activeElement;
    if (!el) return false;
    if (el.isContentEditable || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
    return el.tagName === 'INPUT' && TEXT_INPUTS.test((el.getAttribute('type') || '').toLowerCase());
  }
  let rebinding = false;

  // capture phase: runs before the game's own keys (demo.js would "interact" on Espaço)
  addEventListener('keydown', (ev) => {
    if (rebinding) { ev.preventDefault(); ev.stopImmediatePropagation(); if (!ev.repeat) setKey(ev.code); return; }
    if (askOpen()) {
      if (ev.code === 'Escape') { closeAsk(); ev.preventDefault(); ev.stopImmediatePropagation(); }
      else if (ev.code === 'Enter' || ev.code === 'NumpadEnter') { allow(); ev.preventDefault(); ev.stopImmediatePropagation(); }
      else if (ev.code === V.key) { ev.preventDefault(); ev.stopImmediatePropagation(); }
      return;
    }
    if (ev.code !== V.key || ev.ctrlKey || ev.metaKey || ev.altKey) return;
    if (!active() || typing()) return;
    // the key is the voice's: no interact, no page scroll, no button press
    ev.preventDefault();
    ev.stopImmediatePropagation();
    if (ev.repeat || held) return;
    held = true;
    startTalk();
  }, true);
  addEventListener('keyup', (ev) => {
    if (ev.code !== V.key || !held) return;
    ev.preventDefault();
    ev.stopImmediatePropagation();
    stopTalk();
  }, true);
  // the window loses the keyboard (Alt+Tab, another tab): the microphone goes off
  addEventListener('blur', stopTalk);
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopTalk(); });

  /* ------------------------------------------------------------------ */
  /* on screen: my microphone + who is talking                          */
  /* ------------------------------------------------------------------ */
  const MIC_SVG = '<svg class="vc-icon" viewBox="0 0 10 14" shape-rendering="crispEdges" aria-hidden="true"><path d="M3 0h4v1h1v7H7v1H3V8H2V1h1z"/>' +
    '<rect x="0" y="5" width="1" height="3"/><rect x="1" y="8" width="1" height="1"/><rect x="2" y="9" width="6" height="1"/><rect x="8" y="8" width="1" height="1"/>' +
    '<rect x="9" y="5" width="1" height="3"/><rect x="4" y="10" width="2" height="2"/><rect x="2" y="12" width="6" height="1"/></svg>';
  const hud = document.createElement('div');
  hud.className = 'vc';
  hud.hidden = true;
  hud.innerHTML = '<ul class="vc__talkers" aria-live="polite"></ul>' +
    '<button class="vc__mic" type="button" tabindex="-1" aria-pressed="false">' + MIC_SVG + '<span class="vc__lbl"></span></button>';
  ($('game') || document.body).appendChild(hud);
  const talkersEl = hud.querySelector('.vc__talkers'), micBtn = hud.querySelector('.vc__mic'), lblEl = hud.querySelector('.vc__lbl');

  // the button works too: press and hold (mouse or touch)
  micBtn.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (!active() || held) return;
    held = true;
    try { micBtn.setPointerCapture(ev.pointerId); } catch (e) { /* fine */ }
    startTalk();
  });
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((t) => micBtn.addEventListener(t, () => { if (held) stopTalk(); }));
  micBtn.addEventListener('contextmenu', (ev) => ev.preventDefault());

  let lastHud = '';
  function render() {
    const show = inRoom() && playing();
    hud.hidden = !show;
    if (!show) return;
    const wait = talking && !mic;
    const list = Array.from(speaking).map((id) => {
      const muted = isMuted(id), off = noted.has(id) || !(peers.get(id) || {}).ok;
      return '<li class="vc__talker' + (muted ? ' is-muted' : '') + '">' + MIC_SVG + '<span>' + esc(nameOf(id)) + '</span>' +
        (muted ? '<small>silenciado</small>' : off ? '<small>sem áudio</small>' : '') + '</li>';
    }).join('');
    const k = talking + '|' + wait + '|' + V.key + '|' + list;
    if (k === lastHud) return;
    lastHud = k;
    talkersEl.innerHTML = list;
    micBtn.classList.toggle('is-on', talking && !wait);
    micBtn.classList.toggle('is-wait', wait);
    micBtn.setAttribute('aria-pressed', talking ? 'true' : 'false');
    lblEl.textContent = talking ? (wait ? 'ligando…' : 'falando') : 'segure ' + keyName(V.key);
    micBtn.title = 'Chat de voz: segure ' + keyName(V.key) + ' (ou este botão) para falar com a sala';
  }

  /* ------------------------------------------------------------------ */
  /* Configurações → Chat de voz                                         */
  /* ------------------------------------------------------------------ */
  const volIn = $('voiceVol'), volOut = $('voiceVolVal'), keyBtn = $('voiceKeyBtn'), keyReset = $('voiceKeyReset'), mutesEl = $('voiceMutes');
  if (volIn && volOut) {
    volIn.value = volOut.textContent = V.vol;
    volIn.addEventListener('input', () => {
      V.vol = Number(volIn.value);
      volOut.textContent = V.vol;
      keep();
      for (const P of peers.values()) setVolume(P);
    });
  }
  function showKey() {
    if (keyBtn) keyBtn.textContent = rebinding ? 'Aperte uma tecla…' : keyName(V.key);
    if (keyReset) keyReset.hidden = V.key === 'Space';
    const kbd = $('voiceKeyHelp');
    if (kbd) kbd.textContent = keyName(V.key);
    lastHud = '';
    render();
  }
  function setKey(code) {
    rebinding = false;
    if (code !== 'Escape') {
      if (TAKEN.test(code)) toast('warn', 'Chat de voz', 'A tecla ' + keyName(code) + ' já é usada no jogo. Experimente Espaço, G, Q, Y, Z ou Caps Lock.');
      else { stopTalk(); V.key = code; keep(); toast('ok', 'Chat de voz', 'Segure ' + keyName(code) + ' para falar.'); }
    }
    showKey();
  }
  if (keyBtn) keyBtn.addEventListener('click', () => { rebinding = !rebinding; keyBtn.blur(); showKey(); });
  if (keyReset) keyReset.addEventListener('click', () => { keyReset.blur(); setKey('Space'); });
  showKey();

  function renderMutes() {
    if (!mutesEl) return;
    const list = inRoom() ? MP.players().filter((p) => !p.me) : [];
    if (!list.length) { mutesEl.innerHTML = '<li class="vc-mutes__none">' + (inRoom() ? 'Ninguém mais na sala por enquanto.' : 'Entre numa sala online para ver os jogadores.') + '</li>'; return; }
    mutesEl.innerHTML = list.map((p) => {
      const m = V.muted.indexOf(p.name) >= 0;
      return '<li><span>' + esc(p.name) + '</span><button class="btn btn--sm" type="button" data-mute="' + esc(p.name) + '" aria-pressed="' + m + '">' + (m ? 'Ativar som' : 'Silenciar') + '</button></li>';
    }).join('');
  }
  if (mutesEl) mutesEl.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-mute]');
    if (!b) return;
    const n = b.dataset.mute, i = V.muted.indexOf(n);
    if (i >= 0) V.muted.splice(i, 1); else V.muted.push(n);
    keep();
    for (const P of peers.values()) setVolume(P);
    renderMutes();
    lastHud = '';
    render();
    const again = mutesEl.querySelector('[data-mute="' + CSS.escape(n) + '"]');
    if (again) again.focus();
  });
  renderMutes();

  DL.Voice = {
    // lobby.js lights up the name tag of whoever is talking
    talking: (id) => speaking.has(id),
    get on() { return talking; },
    get key() { return V.key; },
    // exposed for automated checks
    _: { peers, speaking, state: () => ({ talking, held, mic: !!mic, micState, key: V.key }) },
  };
})();
