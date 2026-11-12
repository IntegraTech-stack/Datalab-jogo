/* DataLab — compact YouTube Music player in the game HUD (YTMDesktop v2 on the player's own computer):
   connect, show cover / track / artist and play-pause / next. Mirrors spotify-player.js: a card next to the
   finances (pops up as a "tocando agora" notice when a song starts, the HUD button keeps it open) and a
   balloon over my own character (click the character). Talks only to services/ytmusic-service.js.
   Hidden unless config.js has ytmDesktopEnabled: true. Spotify keeps working untouched: when both cards or
   both balloons are up, this one stacks above the Spotify one. */
(function () {
  'use strict';
  const DL = window.DL, YT = DL.YTMusic;
  const box = document.getElementById('ytm');
  const btn = document.getElementById('ytmBtn');
  if (!box || !YT || !YT.enabled || DL.HERO) return;
  const PEEK_MS = 5000;
  const POLL_PLAYING = 5200, POLL_IDLE = 6000, STATE_GAP = 5100;   // GET /state: 1 call per 5 s per token
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const safeUrl = (u, host) => { try { const x = new URL(u); return x.protocol === 'https:' && host.test(x.hostname) ? x.href : ''; } catch (e) { return ''; } };
  const IMG_HOST = /(^|\.)(googleusercontent\.com|ytimg\.com|ggpht\.com)$/;
  // code: 4 digits being approved in YTMDesktop; form: the "paste a token" field is open
  const V = { track: undefined, msg: '', busy: false, timer: 0, key: '', peek: 0, code: '', form: false, lastState: 0 };
  const trackKey = (t) => (t && !t.idle ? t.id || t.title + '|' + t.artist : '');
  const B = { el: null, open: false, key: '' };
  const spotBox = document.getElementById('spot');
  const spotBubble = () => document.querySelector('.spot-bubble');
  const spotifyOn = () => !!(DL.Spotify && DL.Spotify.enabled && DL.Spotify.connected);

  const LOGO = '<svg class="ytm__logo" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="12" fill="#ff0033"/><circle cx="12" cy="12" r="6.2" fill="none" stroke="#fff" stroke-width="1.4"/><path d="M10.2 9.3 L15 12 L10.2 14.7 Z" fill="#fff"/></svg>';
  const ICON = {
    play: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 3 L13 8 L4.5 13 Z" fill="currentColor"/></svg>',
    pause: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="4" y="3" width="3" height="10" fill="currentColor"/><rect x="9" y="3" width="3" height="10" fill="currentColor"/></svg>',
    next: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 3 L10 8 L3 13 Z" fill="currentColor"/><rect x="11" y="3" width="2" height="10" fill="currentColor"/></svg>',
  };

  /* ---------------- views ---------------- */
  const head = (extra) => '<div class="spot__head">' + LOGO + '<span class="eyebrow-sm">YouTube Music</span>' + (extra || '') + '</div>';
  const msg = () => (V.msg ? '<p class="spot__msg" role="status">' + esc(V.msg) + '</p>' : '');
  const ctl = (t) => '<span class="spot__ctl">' +
    '<button class="spot__b" type="button" data-yt="toggle" aria-label="' + (t.playing ? 'Pausar' : 'Tocar') + '" title="' + (t.playing ? 'Pausar' : 'Tocar') + '"' + (t.canToggle && !V.busy ? '' : ' disabled') + '>' + (t.playing ? ICON.pause : ICON.play) + '</button>' +
    '<button class="spot__b" type="button" data-yt="next" aria-label="Próxima faixa" title="Próxima faixa"' + (t.canNext && !V.busy ? '' : ' disabled') + '>' + ICON.next + '</button>' +
    '</span>';

  function viewConnect() {
    const form = V.form
      ? '<form class="ytm__form" data-yt-form>' +
          '<input class="ytm__token" type="password" name="token" autocomplete="off" spellcheck="false" placeholder="Token do YTMDesktop" aria-label="Token do YTMDesktop" required>' +
          '<button class="btn btn--sm" type="submit">Salvar</button>' +
        '</form>'
      : '<button class="linkbtn ytm__link" type="button" data-yt="form">Já tenho um token</button>';
    return head() + '<p class="spot__note">Controle o YouTube Music do app YTMDesktop aberto neste computador.</p>' +
      '<button class="btn btn--sm spot__connect ytm__connect" type="button" data-yt="connect">Conectar YouTube Music</button>' + form + msg();
  }
  function viewPending() {
    return head() + (V.code
      ? '<p class="spot__note">Confirme no YTMDesktop: a janela de autorização deve mostrar o código</p><p class="ytm__code" aria-live="polite">' + esc(V.code) + '</p>'
      : '<p class="spot__note">Procurando o YTMDesktop neste computador…</p>') +
      '<button class="btn btn--sm" type="button" data-yt="cancel">Cancelar</button>' + msg();
  }
  function viewPlayer() {
    const t = V.track;
    const x = '<button class="spot__x" type="button" data-yt="disconnect" title="Desconectar YouTube Music" aria-label="Desconectar YouTube Music">×</button>';
    if (!t || t.idle) {
      const note = t === undefined && !V.msg ? 'Carregando…'
        : t && t.why === 'ad' ? 'Tocando um anúncio. A música aparece aqui logo depois.'
        : 'Nada tocando. Dê play no YTMDesktop e a música aparece aqui.';
      return head(x) + '<p class="spot__note">' + note + '</p>' + msg();
    }
    const img = safeUrl(t.image, IMG_HOST);
    const link = safeUrl(t.url, /^music\.youtube\.com$/);
    const title = link ? '<a class="spot__title" href="' + esc(link) + '" target="_blank" rel="noopener noreferrer" title="Abrir no YouTube Music">' + esc(t.title) + '</a>' : '<span class="spot__title">' + esc(t.title) + '</span>';
    return head('<span class="spot__dev">' + esc(t.device) + '</span>' + x) +
      '<div class="spot__now">' +
        '<span class="spot__art">' + (img ? '<img src="' + esc(img) + '" alt="' + esc(t.album ? 'Capa de ' + t.album : 'Capa') + '" referrerpolicy="no-referrer" loading="lazy">' : '') + '</span>' +
        '<span class="spot__meta">' + title + '<span class="spot__artist" title="' + esc(t.artist) + '">' + esc(t.artist) + '</span></span>' +
        ctl(t) +
      '</div>' + msg();
  }

  function viewBubble() {
    if (!YT.connected) {
      if (YT.authorizing) return '<p class="spot-bubble__note">' + LOGO + (V.code ? 'Confirme o código ' + esc(V.code) + ' no YTMDesktop' : 'Procurando o YTMDesktop…') + '</p>';
      return '<p class="spot-bubble__note">' + LOGO + 'YouTube Music desconectado</p><button class="btn btn--sm spot__connect ytm__connect" type="button" data-yt="connect">Conectar</button>';
    }
    const t = V.track;
    if (t === undefined) return '<p class="spot-bubble__note' + (V.msg ? ' is-msg' : '') + '">' + LOGO + esc(V.msg || 'Carregando…') + '</p>';
    if (!t || t.idle) return '<p class="spot-bubble__note">' + LOGO + (t && t.why === 'ad' ? 'Tocando um anúncio' : 'Nada tocando agora') + '</p>';
    const img = safeUrl(t.image, IMG_HOST);
    return '<span class="spot__art">' + (img ? '<img src="' + esc(img) + '" alt="" referrerpolicy="no-referrer">' : '') + '</span>' +
      '<span class="spot__meta"><span class="spot__title" title="' + esc(t.title) + '">' + esc(t.title) + '</span><span class="spot__artist" title="' + esc(t.artist) + '">' + esc(t.artist) + '</span></span>' +
      ctl(t);
  }
  // the balloon stays out of the way of a connected Spotify while YouTube Music isn't in use
  const bubbleWanted = () => B.open && (YT.connected || YT.authorizing || !spotifyOn());
  function renderBubble() {
    if (!B.el) return;
    const show = bubbleWanted();
    B.el.hidden = !show;
    if (!show) return;
    const html = viewBubble();
    if (html === B.key) return;
    B.key = html;
    B.el.innerHTML = html;
    B.el.classList.toggle('is-playing', !!(YT.connected && V.track && V.track.playing));
  }

  function render() {
    renderBubble();
    const html = YT.connected ? viewPlayer() : YT.authorizing ? viewPending() : viewConnect();
    if (html === V.key) return;
    // don't wipe a token being typed
    if (V.form && box.contains(document.activeElement) && document.activeElement.name === 'token' && !YT.connected) return;
    V.key = html;
    box.innerHTML = html;
    box.classList.toggle('is-on', YT.connected);
    box.classList.toggle('is-playing', !!(V.track && V.track.playing));
    if (btn) btn.classList.toggle('is-playing', !!(YT.connected && V.track && V.track.playing));
  }

  /* ---------------- card open / closed ---------------- */
  function setOpen(open, flash) {
    clearTimeout(V.peek);
    V.peek = 0;
    box.hidden = !open;
    box.classList.remove('is-out');
    if (btn) { btn.classList.toggle('is-on', open); btn.setAttribute('aria-expanded', String(open)); }
    if (open && flash) {
      box.classList.remove('is-flash');
      void box.offsetWidth;
      box.classList.add('is-flash');
    }
  }
  function peek() {
    if (!box.hidden && !V.peek) return;
    if (box.hidden) setOpen(true, true);
    box.classList.remove('is-out');
    clearTimeout(V.peek);
    V.peek = setTimeout(hidePeek, PEEK_MS);
  }
  function hidePeek() {
    if (box.matches(':hover') || box.contains(document.activeElement)) { V.peek = setTimeout(hidePeek, 1500); return; }
    box.classList.add('is-out');
    V.peek = setTimeout(() => setOpen(false), 350);
  }

  async function connect() {
    if (YT.authorizing) return;
    V.msg = '';
    V.code = '';
    V.form = false;
    const p = YT.connect();
    render();   // "Procurando o YTMDesktop…"
    const r = await p;
    V.code = '';
    if (!r.ok && r.code !== 'aborted') V.msg = YT.MESSAGES[r.code] || YT.MESSAGES.network;
    render();
  }

  /* ---------------- track updates: realtime first, polling as fallback ---------------- */
  function show(track) {
    const prev = V.track;
    V.track = track;
    if (V.msg === YT.MESSAGES.limit || V.msg === YT.MESSAGES.network || V.msg === YT.MESSAGES.offline || V.msg === YT.MESSAGES.ytm) V.msg = '';
    render();
    const t = V.track;
    if (t && t.playing && trackKey(t) && (!prev || !prev.playing || trackKey(prev) !== trackKey(t))) peek();
  }
  // a hidden tab stops asking, except in an online room: the others still see what this player is hearing
  const asleep = () => document.hidden && !(DL.MP && DL.MP.role);
  // what multiplayer.js tells the room (it reads this every couple of seconds)
  DL.YTMusicNow = () => (YT.connected ? V.track : null);
  function schedule(ms) {
    clearTimeout(V.timer);
    V.timer = 0;
    if (!YT.connected || asleep() || YT.live) return;
    // never ask before the 5 s window is over (the app would answer 429)
    V.timer = setTimeout(poll, Math.max(ms, V.lastState + STATE_GAP - Date.now()));
  }
  async function poll() {
    clearTimeout(V.timer);
    V.timer = 0;
    if (!YT.connected || asleep()) return;
    if (Date.now() - V.lastState < STATE_GAP) { schedule(0); return; }
    V.lastState = Date.now();
    const r = await YT.nowPlaying();
    if (r.ok) {
      show(r.data);
      schedule(V.track && V.track.playing ? POLL_PLAYING : POLL_IDLE);
      return;
    }
    if (r.code === 'expired') return;   // the service already emitted 'change'
    if (r.code === 'limit') { schedule(STATE_GAP); return; }   // just checked a pasted token: wait the window out quietly
    V.msg = YT.MESSAGES[r.code] || YT.MESSAGES.network;
    render();
    schedule(POLL_IDLE);
  }

  async function control(act) {
    const t = V.track;
    if (!t || V.busy) return;
    V.busy = true;
    const want = act === 'toggle' ? !t.playing : t.playing;
    if (act === 'toggle') t.playing = want;   // optimistic
    V.msg = '';
    render();
    const r = await (act === 'next' ? YT.next() : want ? YT.play() : YT.pause());
    V.busy = false;
    if (!r.ok) {
      if (act === 'toggle') t.playing = !want;
      if (r.code !== 'expired') V.msg = YT.MESSAGES[r.code] || YT.MESSAGES.network;
    }
    render();
    // realtime pushes the new state by itself; polling waits for the next allowed /state
    schedule(r.ok ? 900 : POLL_IDLE);
  }

  /* ---------------- wiring ---------------- */
  function onClick(ev) {
    const b = ev.target.closest('[data-yt]');
    if (!b || b.disabled) return;
    b.blur();
    const act = b.dataset.yt;
    if (act === 'connect') connect();
    else if (act === 'cancel') { YT.cancel(); V.code = ''; render(); }
    else if (act === 'disconnect') YT.disconnect();
    else if (act === 'form') {
      V.form = true;
      V.msg = '';
      render();
      const input = box.querySelector('input[name="token"]');
      if (input) input.focus();
    } else control(act);
  }
  box.addEventListener('click', onClick);
  box.addEventListener('submit', async (ev) => {
    const form = ev.target.closest('[data-yt-form]');
    if (!form) return;
    ev.preventDefault();
    const input = form.querySelector('input[name="token"]');
    const value = input ? input.value : '';
    if (input) { input.value = ''; input.blur(); }
    V.msg = '';
    const r = await YT.useToken(value);
    if (!r.ok) { V.msg = YT.MESSAGES[r.code] || YT.MESSAGES.network; V.key = ''; render(); }
    else V.form = false;
  });
  // typing the token must not walk the character / fire the game's shortcuts
  ['keydown', 'keyup', 'keypress'].forEach((type) => box.addEventListener(type, (ev) => { if (ev.target.tagName === 'INPUT') ev.stopPropagation(); }));

  YT.on('code', (code) => { V.code = code; render(); });
  YT.on('change', (info) => {
    V.track = undefined;
    V.code = '';
    V.form = false;
    V.msg = info && info.reason === 'expired' ? YT.MESSAGES.expired : '';
    V.key = '';
    render();
    if (YT.connected && !box.hidden && !V.peek) V.peek = setTimeout(hidePeek, PEEK_MS * 2);
    if (YT.connected) poll();
    else clearTimeout(V.timer);
  });
  YT.on('state', (track) => { if (YT.connected) show(track); });
  // websocket down: back to polling; back up: it pushes every change, the poll stops by itself
  YT.on('live', (on) => { if (!on) schedule(POLL_IDLE); });

  document.addEventListener('visibilitychange', () => { if (!document.hidden && !YT.live) poll(); });

  // stack above the finances card, and above the Spotify card when that one is up
  const econ = document.getElementById('econBtn');
  if (window.ResizeObserver) {
    if (econ) new ResizeObserver(() => box.style.setProperty('--econ-h', econ.offsetHeight + 6 + 'px')).observe(econ);
    if (spotBox) new ResizeObserver(() => box.style.setProperty('--spot-h', (spotBox.hidden ? 0 : spotBox.offsetHeight + 6) + 'px')).observe(spotBox);
  }

  if (btn) {
    btn.hidden = false;
    btn.addEventListener('click', () => {
      btn.blur();
      if (box.hidden) {
        setOpen(true, true);
        if (!YT.connected && !YT.authorizing) connect();
      } else {
        setOpen(false);
      }
    });
  }

  const worldUi = document.getElementById('worldUi');
  if (worldUi) {
    B.el = document.createElement('div');
    B.el.className = 'spot-bubble ytm-bubble';
    B.el.setAttribute('role', 'status');
    B.el.setAttribute('aria-label', 'YouTube Music: tocando agora');
    B.el.hidden = true;
    B.el.addEventListener('click', onClick);
    worldUi.appendChild(B.el);
    // the Spotify balloon sits right over my head: measure it once per change, not every frame
    let spotH = 0;
    const sb = spotBubble();
    if (sb && window.ResizeObserver) new ResizeObserver(() => { spotH = sb.hidden ? 0 : sb.offsetHeight; }).observe(sb);
    DL.YTMusicBubble = {
      toggle() {
        B.open = !B.open;
        B.key = '';
        renderBubble();
        if (B.open && YT.connected && !YT.live) poll();
      },
      place(p) {
        if (!B.open || B.el.hidden) return;
        B.el.classList.toggle('is-away', !p);
        if (!p) return;
        const up = sb && !sb.hidden && !sb.classList.contains('is-away') && spotH ? spotH + 10 : 0;
        B.el.style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + (p.y - up).toFixed(1) + 'px) translate(-50%,-100%)';
      },
    };
  }

  setOpen(false);
  render();
  if (YT.connected) poll();
})();
