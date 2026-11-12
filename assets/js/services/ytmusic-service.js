/* DataLab — YouTube Music service: talks to the YTMDesktop v2 app running on the player's OWN computer
   (its "Companion Server": http://127.0.0.1:9863/api/v1) and drives whatever YouTube Music is playing there.
   Same shape as services/spotify-service.js (DL.YTMusic ≈ DL.Spotify), so the player UI works the same way.
   - No credentials in this project. The token is created by YTMDesktop itself when the player approves the
     4-digit code in the app's own window (POST /auth/requestcode → POST /auth/request).
   - The token stays in this browser only (localStorage "datalab.ytmusic"): never sent to the DataLab server,
     never put in saves, never in config.js. Disconnecting erases it here (revoke it in YTMDesktop too).
   - Online rooms: every player's browser talks to its own 127.0.0.1, so each one controls only their own app.
   - Realtime: socket.io "state-update" events (the API asks for this: GET /state allows 1 call every 5 s).
     When the websocket can't open, the player UI falls back to polling GET /state. */
(function () {
  'use strict';
  const DL = (window.DL = window.DL || {});
  const CFG = window.DATALAB_CONFIG || {};
  const APP = { appId: 'datalab', appName: 'DataLab', appVersion: '1.0.0' };   // shown in YTMDesktop's approval window
  const KEY = 'datalab.ytmusic';
  const SIO = {   // socket.io client for the realtime API (pinned version + Subresource Integrity, like supabase-js)
    src: 'https://cdn.jsdelivr.net/npm/socket.io-client@4.7.5/dist/socket.io.min.js',
    integrity: 'sha384-2huaZvOR9iDzHqslqwpR87isEmrfxqyWOF7hr7BY6KG0+hVKLoEXMPUJw3ynWuhO',
  };
  const AUTH_WAIT_MS = 40 * 1000;   // YTMDesktop closes its approval window after 30 s
  const MESSAGES = {
    offline: 'YTMDesktop não encontrado. Abra o app e ligue Settings → Integrations → Companion server.',
    cors: 'O YTMDesktop está aberto, mas bloqueia o navegador. Ligue "Allow browser communication" em Settings → Integrations.',
    authOff: 'Ligue "Enable companion authorization" em Settings → Integrations do YTMDesktop e tente de novo.',
    denied: 'Conexão recusada na janela do YTMDesktop.',
    timeout: 'O código expirou antes da confirmação. Tente de novo.',
    busy: 'O YTMDesktop já tem pedidos de conexão abertos. Feche-os e tente de novo.',
    expired: 'O token do YouTube Music não vale mais (revogado no app?). Conecte de novo.',
    invalid: 'Token inválido: o YTMDesktop não reconheceu esse token.',
    limit: 'Muitas chamadas ao YTMDesktop: aguardando um pouco.',
    ytm: 'O YouTube Music ainda está carregando no YTMDesktop.',
    network: 'Falha ao falar com o YTMDesktop.',
    disabled: 'Integração com YouTube Music desligada no config.js.',
  };

  // Only this computer: a page on https can reach the loopback address, and the CSP lists only these hosts.
  const host = /^(127\.0\.0\.1|localhost)$/.test(String(CFG.ytmDesktopHost || '')) ? CFG.ytmDesktopHost : '127.0.0.1';
  const port = Number(CFG.ytmDesktopPort) || 9863;
  const ORIGIN = 'http://' + host + ':' + port;
  const API = ORIGIN + '/api/v1';
  if (Object.keys(CFG).some((k) => /^ytm.*token/i.test(k) && CFG[k])) {
    // config.js is public and the same for everyone: a token there would hand one person's app to every visitor
    console.error('[DataLab] Token do YTMDesktop NÃO pode ficar no config.js. Remova e revogue em YTMDesktop → Settings → Integrations → Authorized companions. Integração desligada.');
  }
  const enabled = CFG.ytmDesktopEnabled === true && !Object.keys(CFG).some((k) => /^ytm.*token/i.test(k) && CFG[k]);

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage blocked */ } },
  };
  const validToken = (t) => typeof t === 'string' && /^[A-Za-z0-9._~-]{16,2048}$/.test(t);

  const saved = enabled ? store.get(KEY) : null;
  const S = { token: saved && validToken(saved.token) ? saved.token : null, auth: null, sock: null, live: false, sioLoad: null, listeners: {} };
  const emit = (ev, info) => (S.listeners[ev] || []).forEach((fn) => { try { fn(info); } catch (e) { console.error(e); } });

  function keep(token) {
    S.token = token;
    store.set(KEY, { token, at: Date.now() });
  }
  function forget() {
    S.token = null;
    store.del(KEY);
    closeRealtime();
  }

  /* ---------------- HTTP ---------------- */
  // fetch failed before any answer: the app is closed, or it's open but refuses this origin (CORS off).
  // A no-cors request still reaches a running server (the answer is opaque), which tells the two apart.
  async function diagnose() {
    try { await fetch(ORIGIN + '/metadata', { mode: 'no-cors', cache: 'no-store' }); return 'cors'; } catch (e) { return 'offline'; }
  }

  // Result: { ok, status, data } or { ok:false, code } with code in MESSAGES
  async function call(method, path, body, opts) {
    const o = opts || {};
    const headers = {};
    if (body) headers['Content-Type'] = 'application/json';
    const token = o.token || S.token;
    if (!o.noAuth) {
      if (!token) return { ok: false, code: 'expired' };
      headers.Authorization = token;   // YTMDesktop wants the bare token (no "Bearer")
    }
    let res;
    try {
      res = await fetch(API + path, { method, headers, body: body ? JSON.stringify(body) : undefined, cache: 'no-store', signal: o.signal });
    } catch (e) {
      if (e && e.name === 'AbortError') return { ok: false, code: 'aborted' };
      return { ok: false, code: await diagnose() };
    }
    if (res.status === 204) return { ok: true, status: 204, data: null };
    const data = await res.json().catch(() => null);
    if (res.ok) return { ok: true, status: res.status, data };
    const code = (data && data.code) || '';
    if (res.status === 429) return { ok: false, code: 'limit', retryAfter: 5 };   // x-ratelimit-* headers aren't exposed to the page
    if (res.status === 401) {
      if (o.token) return { ok: false, code: 'invalid' };   // checking a pasted token: keep the current one
      forget();
      emit('change', { connected: false, reason: 'expired' });
      return { ok: false, code: 'expired' };
    }
    const map = {
      AUTHORIZATION_DISABLED: 'authOff', AUTHORIZATION_DENIED: 'denied', AUTHORIZATION_TIME_OUT: 'timeout',
      AUTHORIZATION_INVALID: 'timeout', AUTHORIZATION_TOO_MANY: 'busy', YOUTUBE_MUSIC_UNVAILABLE: 'ytm', YOUTUBE_MUSIC_TIME_OUT: 'ytm',
    };
    return { ok: false, code: map[code] || 'network', detail: (data && data.message) || code };
  }

  /* ---------------- state ---------------- */
  function pickImage(thumbs) {
    const list = (thumbs || []).filter((i) => i && i.url).slice().sort((a, b) => (a.width || 0) - (b.width || 0));
    if (!list.length) return null;
    // smallest one that still looks sharp at 2x of 44 px, else the largest there is
    const fit = list.find((i) => (i.width || 0) >= 88);
    return (fit || list[list.length - 1]).url;
  }

  // YTMDesktop state → what the compact player shows (same fields as DL.Spotify.nowPlaying). null = nothing.
  function reduce(st) {
    if (!st || !st.player) return null;
    const p = st.player, v = st.video;
    if (p.adPlaying) return { idle: true, why: 'ad', device: '' };   // "Ad metadata is never provided"
    if (!v || !v.title) return null;
    return {
      id: v.id || '',
      title: v.title,
      artist: v.author || '',
      album: v.album || '',
      image: pickImage(v.thumbnails),
      url: v.id ? 'https://music.youtube.com/watch?v=' + encodeURIComponent(v.id) : '',
      playing: p.trackState === 1 || p.trackState === 2,   // 1 playing, 2 buffering (0 paused, -1 unknown)
      device: 'YTMDesktop',
      canToggle: true,
      canNext: true,
    };
  }

  async function nowPlaying() {
    const r = await call('GET', '/state');
    return r.ok ? { ok: true, data: reduce(r.data) } : r;
  }

  /* ---------------- realtime (socket.io) ---------------- */
  function loadSio() {
    if (window.io) return Promise.resolve(true);
    if (S.sioLoad) return S.sioLoad;
    S.sioLoad = new Promise((resolve) => {
      const s = document.createElement('script');
      s.src = SIO.src;
      s.integrity = SIO.integrity;
      s.crossOrigin = 'anonymous';
      s.onload = () => resolve(!!window.io);
      s.onerror = () => { S.sioLoad = null; resolve(false); };
      document.head.appendChild(s);
    });
    return S.sioLoad;
  }

  async function openRealtime() {
    if (!enabled || !S.token || S.sock) return;
    const ok = await loadSio();
    if (!ok || !S.token || S.sock) return;
    const sock = window.io(ORIGIN + '/api/v1/realtime', {
      transports: ['websocket'],
      auth: { token: S.token },
      reconnectionDelay: 2000,
      reconnectionDelayMax: 15000,
    });
    S.sock = sock;
    sock.on('connect', () => { S.live = true; emit('live', true); });
    sock.on('disconnect', () => { S.live = false; emit('live', false); });
    sock.on('connect_error', () => { if (S.live) { S.live = false; emit('live', false); } });
    sock.on('state-update', (st) => emit('state', reduce(st)));
  }
  function closeRealtime() {
    if (S.sock) { try { S.sock.close(); } catch (e) { /* already gone */ } }
    S.sock = null;
    if (S.live) { S.live = false; emit('live', false); }
  }

  /* ---------------- login (YTMDesktop's own approval window) ---------------- */
  // 1) ask for a 4-digit code, 2) show it (event 'code'), 3) wait while the player approves it in the app
  async function connect() {
    if (!enabled) return { ok: false, code: 'disabled' };
    if (S.auth) return { ok: false, code: 'busy' };
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), AUTH_WAIT_MS);
    S.auth = ctl;
    try {
      const a = await call('POST', '/auth/requestcode', APP, { noAuth: true, signal: ctl.signal });
      if (!a.ok) return a;
      const code = String((a.data && a.data.code) || '');
      if (!/^\d{4}$/.test(code)) return { ok: false, code: 'network' };
      emit('code', code);
      const b = await call('POST', '/auth/request', { appId: APP.appId, code }, { noAuth: true, signal: ctl.signal });
      if (!b.ok) return b.code === 'aborted' && !ctl.cancelled ? { ok: false, code: 'timeout' } : b;
      const token = b.data && b.data.token;
      if (!validToken(token)) return { ok: false, code: 'network' };
      keep(token);
      emit('change', { connected: true });
      openRealtime();
      return { ok: true };
    } finally {
      clearTimeout(timer);
      S.auth = null;
    }
  }
  function cancel() {
    if (!S.auth) return;
    S.auth.cancelled = true;
    S.auth.abort();
  }

  // a token obtained some other way (e.g. the same two calls made with curl/Postman): checked before keeping it
  async function useToken(raw) {
    if (!enabled) return { ok: false, code: 'disabled' };
    const token = String(raw || '').trim();
    if (!validToken(token)) return { ok: false, code: 'invalid' };
    const r = await call('GET', '/state', null, { token });
    if (!r.ok && r.code !== 'limit') return r;
    closeRealtime();
    keep(token);
    emit('change', { connected: true });
    openRealtime();
    return { ok: true };
  }

  function disconnect() {
    cancel();
    forget();
    emit('change', { connected: false, reason: 'logout' });
  }

  const command = (name) => call('POST', '/command', { command: name });

  // token written / erased by another DataLab tab
  addEventListener('storage', (ev) => {
    if (!enabled || ev.key !== KEY) return;
    const v = store.get(KEY);
    const token = v && validToken(v.token) ? v.token : null;
    if (token === S.token) return;
    closeRealtime();
    S.token = token;
    emit('change', { connected: !!token });
    if (token) openRealtime();
  });

  if (S.token) openRealtime();

  DL.YTMusic = {
    enabled,
    MESSAGES,
    address: ORIGIN,
    get connected() { return !!S.token; },
    get authorizing() { return !!S.auth; },
    get live() { return S.live; },
    connect,
    cancel,
    useToken,
    disconnect,
    nowPlaying,
    play: () => command('play'),
    pause: () => command('pause'),
    next: () => command('next'),
    on(ev, fn) { (S.listeners[ev] = S.listeners[ev] || []).push(fn); },
  };
})();
