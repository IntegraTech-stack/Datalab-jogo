/* DataLab — compact Spotify player in the game HUD: connect the account, show cover / track / artist
   and play-pause / next for whatever is playing on the player's own Spotify device.
   The card works as a "tocando agora" notice: it pops up when a song starts or changes and hides itself
   after a few seconds; the HUD button opens it for good (until clicked again).
   Talks only to services/spotify-service.js. Hidden when no spotifyClientId is configured. */
(function () {
  'use strict';
  const DL = window.DL, SP = DL.Spotify;
  const box = document.getElementById('spot');
  const btn = document.getElementById('spotBtn');
  if (!box || !SP || !SP.enabled || DL.HERO) return;
  const PEEK_MS = 5000;   // how long the "tocando agora" notice stays up
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const safeUrl = (u, host) => { try { const x = new URL(u); return x.protocol === 'https:' && host.test(x.hostname) ? x.href : ''; } catch (e) { return ''; } };
  const POLL_PLAYING = 5000, POLL_IDLE = 6000, PENDING_MS = 10 * 60 * 1000;
  // peek: timer of the notice hiding itself (0 = card closed, or opened with the HUD button)
  const V = { track: undefined, msg: '', busy: false, timer: 0, pendingSince: 0, key: '', peek: 0 };
  const IDLE_NOTE = {
    private: 'Sessão privada ligada: o Spotify não mostra a música. Desligue a sessão privada no app.',
    ad: 'Tocando um anúncio. A música aparece aqui logo depois.',
  };
  const trackKey = (t) => (t && !t.idle ? t.id || t.title + '|' + t.artist : '');
  // the balloon over my own character (click the character to open / close it; demo.js places it every frame)
  const B = { el: null, open: false, key: '' };

  const LOGO = '<svg class="spot__logo" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#1ed760"/><path d="M6.2 9.3c3.9-1.2 8.4-.8 11.8 1.2M7 12.6c3.1-.9 6.6-.6 9.4 1M7.8 15.7c2.4-.6 5-.4 7.1.8" fill="none" stroke="#0a0a0a" stroke-width="1.7" stroke-linecap="round"/></svg>';
  const ICON = {
    play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 3 L13 8 L4.5 13 Z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="3" width="3" height="10" fill="currentColor"/><rect x="9" y="3" width="3" height="10" fill="currentColor"/></svg>',
    next: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3 L10 8 L3 13 Z" fill="currentColor"/><rect x="11" y="3" width="2" height="10" fill="currentColor"/></svg>',
  };

  /* ---------------- views ---------------- */
  const head = (extra) => '<div class="spot__head">' + LOGO + '<span class="eyebrow-sm">Spotify</span>' + (extra || '') + '</div>';
  const msg = () => (V.msg ? '<p class="spot__msg" role="status">' + esc(V.msg) + '</p>' : '');

  function viewConnect() {
    return head() + '<p class="spot__note">Ouça a sua música enquanto cuida do datacenter.</p>' +
      '<button class="btn btn--sm spot__connect" type="button" data-sp="connect">Conectar Spotify</button>' + msg();
  }
  function viewPending() {
    return head() + '<p class="spot__note">Aguardando o login na janela do Spotify…</p>' +
      '<button class="btn btn--sm" type="button" data-sp="cancel">Cancelar</button>' + msg();
  }
  function viewPlayer() {
    const t = V.track;
    const x = '<button class="spot__x" type="button" data-sp="disconnect" title="Desconectar Spotify" aria-label="Desconectar Spotify">×</button>';
    if (!t || t.idle) {
      return head((t && t.device ? '<span class="spot__dev">' + esc(t.device) + '</span>' : '') + x) +
        '<p class="spot__note">' + (t && IDLE_NOTE[t.why] || 'Nada tocando. Dê play no app do Spotify (celular, PC ou web) e a música aparece aqui.') + '</p>' + msg();
    }
    const img = safeUrl(t.image, /(^|\.)(scdn\.co|spotifycdn\.com)$/);
    const link = safeUrl(t.url, /^open\.spotify\.com$/);
    const title = link ? '<a class="spot__title" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer" title="Abrir no Spotify">' + esc(t.title) + '</a>' : '<span class="spot__title">' + esc(t.title) + '</span>';
    return head((t.device ? '<span class="spot__dev" title="Tocando em ' + esc(t.device) + '">' + esc(t.device) + '</span>' : '') + x) +
      '<div class="spot__now">' +
        '<span class="spot__art">' + (img ? '<img src="' + esc(img) + '" alt="' + esc(t.album ? 'Capa de ' + t.album : 'Capa') + '" referrerpolicy="no-referrer" loading="lazy">' : '') + '</span>' +
        '<span class="spot__meta">' + title + '<span class="spot__artist" title="' + esc(t.artist) + '">' + esc(t.artist) + '</span></span>' +
        '<span class="spot__ctl">' +
          '<button class="spot__b" type="button" data-sp="toggle" aria-label="' + (t.playing ? 'Pausar' : 'Tocar') + '" title="' + (t.playing ? 'Pausar' : 'Tocar') + '"' + (t.canToggle && !V.busy ? '' : ' disabled') + '>' + (t.playing ? ICON.pause : ICON.play) + '</button>' +
          '<button class="spot__b" type="button" data-sp="next" aria-label="Próxima faixa" title="Próxima faixa"' + (t.canNext && !V.busy ? '' : ' disabled') + '>' + ICON.next + '</button>' +
        '</span>' +
      '</div>' + msg();
  }

  // balloon over my character: same data as the card, one compact line
  function viewBubble() {
    if (!SP.connected) {
      return V.pendingSince
        ? '<p class="spot-bubble__note">' + LOGO + 'Aguardando o login no Spotify…</p>'
        : '<p class="spot-bubble__note">' + LOGO + 'Spotify desconectado</p><button class="btn btn--sm spot__connect" type="button" data-sp="connect">Conectar</button>';
    }
    const t = V.track;
    // first poll failed (account not allowed, network…): say why instead of "Carregando" forever
    if (t === undefined) return '<p class="spot-bubble__note' + (V.msg ? ' is-msg' : '') + '">' + LOGO + esc(V.msg || 'Carregando…') + '</p>';
    if (!t || t.idle) return '<p class="spot-bubble__note">' + LOGO + (t && t.why === 'private' ? 'Sessão privada ligada' : t && t.why === 'ad' ? 'Tocando um anúncio' : 'Nada tocando agora') + '</p>';
    const img = safeUrl(t.image, /(^|\.)(scdn\.co|spotifycdn\.com)$/);
    return '<span class="spot__art">' + (img ? '<img src="' + esc(img) + '" alt="" referrerpolicy="no-referrer">' : '') + '</span>' +
      '<span class="spot__meta"><span class="spot__title" title="' + esc(t.title) + '">' + esc(t.title) + '</span><span class="spot__artist" title="' + esc(t.artist) + '">' + esc(t.artist) + '</span></span>' +
      '<span class="spot__ctl">' +
        '<button class="spot__b" type="button" data-sp="toggle" aria-label="' + (t.playing ? 'Pausar' : 'Tocar') + '"' + (t.canToggle && !V.busy ? '' : ' disabled') + '>' + (t.playing ? ICON.pause : ICON.play) + '</button>' +
        '<button class="spot__b" type="button" data-sp="next" aria-label="Próxima faixa"' + (t.canNext && !V.busy ? '' : ' disabled') + '>' + ICON.next + '</button>' +
      '</span>';
  }
  function renderBubble() {
    if (!B.open) return;
    const html = viewBubble();
    if (html === B.key) return;
    B.key = html;
    B.el.innerHTML = html;
    B.el.classList.toggle('is-playing', !!(SP.connected && V.track && V.track.playing));
  }

  function render() {
    renderBubble();
    const html = SP.connected ? viewPlayer() : V.pendingSince ? viewPending() : viewConnect();
    // the poll re-renders every few seconds: skip the DOM work (and the cover reload) when nothing changed
    if (html === V.key) return;
    V.key = html;
    box.innerHTML = html;
    box.classList.toggle('is-on', SP.connected);
    box.classList.toggle('is-playing', !!(V.track && V.track.playing));
    if (btn) btn.classList.toggle('is-playing', !!(SP.connected && V.track && V.track.playing));
  }

  /* ---------------- card open / closed (HUD button, "tocando agora" notice) ---------------- */
  function setOpen(open, flash) {
    clearTimeout(V.peek);
    V.peek = 0;
    box.hidden = !open;
    box.classList.remove('is-out');
    if (btn) { btn.classList.toggle('is-on', open); btn.setAttribute('aria-expanded', String(open)); }
    if (open && flash) {
      box.classList.remove('is-flash');
      void box.offsetWidth;   // restart the animation
      box.classList.add('is-flash');
    }
  }
  // a song started or changed: show the card for a few seconds (left alone if opened with the HUD button)
  function peek() {
    if (!box.hidden && !V.peek) return;
    if (box.hidden) setOpen(true, true);
    box.classList.remove('is-out');
    clearTimeout(V.peek);
    V.peek = setTimeout(hidePeek, PEEK_MS);
  }
  function hidePeek() {
    // the mouse is on it (about to hit pause / next): wait for it to leave
    if (box.matches(':hover')) { V.peek = setTimeout(hidePeek, 1500); return; }
    box.classList.add('is-out');
    V.peek = setTimeout(() => setOpen(false), 350);
  }
  async function connect() {
    V.msg = '';
    const r = await SP.connect();
    if (r.ok) V.pendingSince = Date.now();
    else V.msg = SP.MESSAGES[r.code] || SP.MESSAGES.network;
    render();
  }

  /* ---------------- polling ---------------- */
  // a hidden tab stops asking, except in an online room: the others still see what this player is hearing
  const asleep = () => document.hidden && !(DL.MP && DL.MP.role);
  // what multiplayer.js tells the room (it reads this every couple of seconds)
  DL.SpotifyNow = () => (SP.connected ? V.track : null);
  function schedule(ms) {
    clearTimeout(V.timer);
    V.timer = 0;
    if (!SP.connected || asleep()) return;
    V.timer = setTimeout(poll, ms);
  }
  async function poll() {
    clearTimeout(V.timer);
    if (!SP.connected || asleep()) return;
    const r = await SP.nowPlaying();
    if (r.ok) {
      const prev = V.track;
      V.track = r.data;
      if (V.msg === SP.MESSAGES.limit || V.msg === SP.MESSAGES.network || V.msg === SP.MESSAGES.device) V.msg = '';
      render();
      const t = V.track;
      if (t && t.playing && trackKey(t) && (!prev || !prev.playing || trackKey(prev) !== trackKey(t))) peek();
      schedule(V.track && V.track.playing ? POLL_PLAYING : POLL_IDLE);
      return;
    }
    if (r.code === 'expired') return;   // the service already emitted 'change' (back to "Conectar")
    V.msg = SP.MESSAGES[r.code] || SP.MESSAGES.network;
    render();
    schedule(r.code === 'limit' ? r.retryAfter * 1000 : POLL_IDLE);
  }

  async function control(act) {
    const t = V.track;
    if (!t || V.busy) return;
    V.busy = true;
    const want = act === 'toggle' ? !t.playing : t.playing;
    if (act === 'toggle') t.playing = want;   // optimistic: the button flips right away
    V.msg = '';
    render();
    const r = await (act === 'next' ? SP.next() : want ? SP.play() : SP.pause());
    V.busy = false;
    if (!r.ok) {
      if (act === 'toggle') t.playing = !want;
      if (r.code !== 'expired') V.msg = SP.MESSAGES[r.code] || SP.MESSAGES.network;
    }
    render();
    // Spotify takes a moment to switch tracks / report the new state
    schedule(r.ok ? 700 : POLL_IDLE);
  }

  /* ---------------- wiring ---------------- */
  function onClick(ev) {
    const b = ev.target.closest('[data-sp]');
    if (!b || b.disabled) return;
    b.blur();   // keep Space / Enter for the game, not for the last clicked button
    const act = b.dataset.sp;
    if (act === 'connect') {
      connect();
    } else if (act === 'cancel') {
      V.pendingSince = 0;
      render();
    } else if (act === 'disconnect') {
      SP.disconnect();
    } else {
      control(act);
    }
  }
  box.addEventListener('click', onClick);

  SP.on('change', (info) => {
    V.pendingSince = 0;
    V.track = undefined;
    V.msg = info && info.reason === 'expired' ? SP.MESSAGES.expired : '';
    render();
    // just logged in with the card open: let it hide by itself (the first poll resets it if music is on)
    if (SP.connected && !box.hidden && !V.peek) V.peek = setTimeout(hidePeek, PEEK_MS * 2);
    if (SP.connected) poll();
    else clearTimeout(V.timer);
  });

  document.addEventListener('visibilitychange', () => { if (!document.hidden) poll(); });
  // a login window left behind (closed without finishing) stops "Aguardando" after a while
  setInterval(() => { if (V.pendingSince && Date.now() - V.pendingSince > PENDING_MS) { V.pendingSince = 0; render(); } }, 30000);

  // sit right next to the finances card, whatever its height (it changes with the screen and its lines)
  const econ = document.getElementById('econBtn');
  if (econ && window.ResizeObserver) new ResizeObserver(() => box.style.setProperty('--econ-h', econ.offsetHeight + 6 + 'px')).observe(econ);

  if (btn) {
    btn.hidden = false;
    btn.addEventListener('click', () => {
      btn.blur();
      if (box.hidden) {
        setOpen(true, true);
        // one click from the top bar straight to the Spotify login (the popup needs this user gesture)
        if (!SP.connected && !V.pendingSince) connect();
      } else {
        setOpen(false);
      }
    });
  }
  const worldUi = document.getElementById('worldUi');
  if (worldUi) {
    B.el = document.createElement('div');
    B.el.className = 'spot-bubble';
    B.el.setAttribute('role', 'status');
    B.el.setAttribute('aria-label', 'Spotify: tocando agora');
    B.el.hidden = true;
    B.el.addEventListener('click', onClick);
    worldUi.appendChild(B.el);
    DL.SpotifyBubble = {
      toggle() {
        B.open = !B.open;
        B.key = '';
        B.el.hidden = !B.open;
        if (B.open) { renderBubble(); if (SP.connected) poll(); }
      },
      // p = screen point over my head, or null to hide it this frame (other modes, panels open…)
      place(p) {
        if (!B.open) return;
        B.el.classList.toggle('is-away', !p);
        if (p) B.el.style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px) translate(-50%,-100%)';
      },
    };
  }

  // closed until a song plays (notice) or the HUD button opens it
  try { localStorage.removeItem('datalab.spot.closed'); } catch (e) { /* storage off */ }
  setOpen(false);
  render();
  if (SP.connected) poll();
})();
