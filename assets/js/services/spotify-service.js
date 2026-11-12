/* DataLab — Spotify service: connects the player's own Spotify account (OAuth 2.0 Authorization Code
   + PKCE) and drives the playback that is already running on one of their devices (Web API "player").
   - Only the PUBLIC Client ID is used (config.js → spotifyClientId). There is no client secret in PKCE,
     and this file refuses to start if one shows up in the browser config.
   - Login runs in a popup that lands on spotify-callback.html (its own page: jogo.html's ?code= belongs
     to Supabase Auth). The callback swaps the code for tokens and this tab picks them up via "storage".
   - Tokens stay in this browser only (localStorage "datalab.spotify"): never sent to the DataLab server,
     never put in saves. Disconnecting erases them.
   - Least privilege: read the playback state + play/pause/next. Controls need Spotify Premium (the API
     answers 403 PREMIUM_REQUIRED otherwise); reading what is playing works on any account. */
(function () {
  'use strict';
  const DL = (window.DL = window.DL || {});
  const CFG = window.DATALAB_CONFIG || {};
  const AUTH_URL = 'https://accounts.spotify.com/authorize';
  const TOKEN_URL = 'https://accounts.spotify.com/api/token';
  const API = 'https://api.spotify.com/v1';
  const SCOPES = ['user-read-playback-state', 'user-read-currently-playing', 'user-modify-playback-state'];
  const KEY = 'datalab.spotify', PENDING = 'datalab.spotify.pending';
  const PENDING_MS = 10 * 60 * 1000;   // a login left open longer than this is thrown away
  const EARLY_MS = 60 * 1000;          // refresh the access token a minute before it expires
  const MESSAGES = {
    premium: 'Os controles exigem Spotify Premium.',
    device: 'Nenhum dispositivo ativo: dê play no app do Spotify.',
    denied: 'Login no Spotify cancelado.',
    expired: 'A conexão com o Spotify expirou. Conecte de novo.',
    limit: 'Muitas chamadas ao Spotify: aguardando um pouco.',
    network: 'Falha de rede ao falar com o Spotify.',
    popup: 'O navegador bloqueou a janela de login. Permita pop-ups para este site.',
    user: 'Esta conta ainda não tem acesso ao app do DataLab no Spotify.',
  };

  const clientId = String(CFG.spotifyClientId || '').trim();
  // a client secret in the browser would let anyone impersonate the app: never accept one
  const leaked = Object.keys(CFG).some((k) => /spotify.*secret/i.test(k) && CFG[k]);
  const validId = /^[0-9a-f]{32}$/i.test(clientId);
  if (leaked) console.error('[DataLab] spotifyClientSecret NÃO pode ficar no navegador. Remova do config.js e revogue o secret no painel do Spotify. Integração desligada.');
  else if (clientId && !validId) console.warn('[DataLab] spotifyClientId inválido (esperado: 32 caracteres hexadecimais). Integração desligada.');
  const enabled = validId && !leaked;

  const redirectUri = () => String(CFG.spotifyRedirectUri || new URL('spotify-callback.html', location.href).href);

  const store = {
    get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage blocked */ } },
  };

  /* ---------------- PKCE ---------------- */
  const b64url = (bytes) => btoa(String.fromCharCode.apply(null, new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  function randomString(len) {
    const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
    const r = crypto.getRandomValues(new Uint8Array(len));
    let s = '';
    for (let i = 0; i < len; i++) s += abc[r[i] % abc.length];   // 256 % 66 bias is irrelevant at 64 chars of entropy
    return s;
  }
  const challenge = async (verifier) => b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));

  /* ---------------- tokens ---------------- */
  const S = { tokens: enabled ? store.get(KEY) : null, refreshing: null, popup: null, listeners: {} };
  const emit = (ev, info) => (S.listeners[ev] || []).forEach((fn) => { try { fn(info); } catch (e) { console.error(e); } });

  function keep(t, prev) {
    const tokens = {
      access: t.access_token,
      // Spotify may or may not rotate the refresh token: keep the old one when no new one comes back
      refresh: t.refresh_token || (prev && prev.refresh) || null,
      expiresAt: Date.now() + (Number(t.expires_in) || 3600) * 1000,
      scope: t.scope || '',
    };
    S.tokens = tokens;
    store.set(KEY, tokens);
    return tokens;
  }

  async function tokenRequest(body) {
    let res;
    try {
      res = await fetch(TOKEN_URL, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
    } catch (e) { return { ok: false, code: 'network' }; }
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, code: data.error === 'invalid_grant' ? 'expired' : 'network', detail: data.error_description || data.error };
    return { ok: true, data };
  }

  function forget() {
    S.tokens = null;
    store.del(KEY);
  }

  // rejected: the access token that just expired or got a 401 (never handed back again)
  async function refresh(rejected) {
    if (S.refreshing) return S.refreshing;
    S.refreshing = (async () => {
      // another tab may have refreshed already (and rotated the refresh token): use its copy
      const latest = store.get(KEY);
      if (latest && latest.access !== rejected && latest.expiresAt - EARLY_MS > Date.now()) { S.tokens = latest; return { ok: true }; }
      const prev = latest || S.tokens;
      if (!prev || !prev.refresh) { forget(); return { ok: false, code: 'expired' }; }
      const r = await tokenRequest({ grant_type: 'refresh_token', refresh_token: prev.refresh, client_id: clientId });
      if (!r.ok) {
        if (r.code === 'expired') { forget(); emit('change', { connected: false, reason: 'expired' }); }
        return r;
      }
      keep(r.data, prev);
      return { ok: true };
    })();
    try { return await S.refreshing; } finally { S.refreshing = null; }
  }

  async function accessToken() {
    if (!S.tokens) return null;
    if (S.tokens.expiresAt - EARLY_MS <= Date.now()) {
      const r = await refresh(S.tokens.access);
      if (!r.ok) return null;
    }
    return S.tokens && S.tokens.access;
  }

  /* ---------------- Web API ---------------- */
  // Result: { ok, status, data } or { ok:false, code } with code in MESSAGES (or 'expired' / 'none')
  async function api(method, path, retried) {
    const token = await accessToken();
    if (!token) return { ok: false, code: S.tokens ? 'network' : 'expired' };
    let res;
    try {
      res = await fetch(API + path, { method, headers: { Authorization: 'Bearer ' + token } });
    } catch (e) { return { ok: false, code: 'network' }; }
    if (res.status === 401 && !retried) {
      // revoked or expired early: refresh once and try again
      const r = await refresh(token);
      return r.ok ? api(method, path, true) : { ok: false, code: r.code };
    }
    if (res.status === 204) return { ok: true, status: 204, data: null };
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { /* control endpoints may answer with an empty or plain body */ }
    if (res.ok) return { ok: true, status: res.status, data };
    const reason = data && data.error && data.error.reason;
    // Development Mode answers some 403s in plain text ("User not registered in the Developer Dashboard")
    const msg = String((data && data.error && data.error.message) || (data ? '' : text) || '');
    if (res.status === 429) return { ok: false, code: 'limit', retryAfter: Number(res.headers.get('Retry-After')) || 30 };
    if (res.status === 401) { forget(); emit('change', { connected: false, reason: 'expired' }); return { ok: false, code: 'expired' }; }
    if (reason === 'PREMIUM_REQUIRED') return { ok: false, code: 'premium' };
    if (reason === 'NO_ACTIVE_DEVICE' || res.status === 404) return { ok: false, code: 'device' };
    // app in Development Mode and this account isn't in its User Management list
    if (res.status === 403 && /user.*(not|isn).*registered|developer\.spotify\.com/i.test(msg)) return { ok: false, code: 'user' };
    // reading the playback state works on any account: a 403 there is the allowlist, never Premium
    if (res.status === 403) return { ok: false, code: method === 'GET' ? 'user' : 'premium' };
    return { ok: false, code: 'network', detail: msg };
  }

  function pickImage(images) {
    const list = (images || []).filter((i) => i && i.url);
    if (!list.length) return null;
    // the API sorts largest first: take the smallest one that still looks sharp at 2x of 44 px
    const fit = list.filter((i) => !i.width || i.width >= 88);
    return (fit.length ? fit[fit.length - 1] : list[0]).url;
  }

  // Playback state, reduced to what the compact player shows. null = nothing playing / no device.
  async function nowPlaying() {
    const r = await api('GET', '/me/player?additional_types=track,episode');
    if (!r.ok) return r;
    let p = r.data;
    // /me/player sometimes answers 204 or leaves out the item while something IS playing (some Connect
    // devices, right after play): currently-playing is more reliable for the track itself
    if (!p || !p.item) {
      const c = await api('GET', '/me/player/currently-playing?additional_types=track,episode');
      if (c.ok && c.data && (c.data.item || !p)) p = Object.assign({}, c.data, { device: p && p.device });
    }
    if (!p || !p.item) {
      const dev = p && p.device;
      // private session hides the track from the API; ads have no item either
      const why = dev && dev.is_private_session ? 'private' : p && p.currently_playing_type === 'ad' ? 'ad' : '';
      return { ok: true, data: dev || why ? { idle: true, why, device: dev ? dev.name : '' } : null };
    }
    const it = p.item, ep = it.type === 'episode';
    const dis = (p.actions && p.actions.disallows) || {};
    return {
      ok: true,
      data: {
        id: it.id,
        title: it.name,
        artist: ep ? (it.show && it.show.name) || '' : (it.artists || []).map((a) => a.name).join(', '),
        album: ep ? '' : (it.album && it.album.name) || '',
        image: pickImage(ep ? it.images || (it.show && it.show.images) : it.album && it.album.images),
        url: (it.external_urls && it.external_urls.spotify) || '',
        playing: !!p.is_playing,
        device: p.device ? p.device.name : '',
        canToggle: !(p.is_playing ? dis.pausing : dis.resuming),
        canNext: !dis.skipping_next,
      },
    };
  }

  /* ---------------- login ---------------- */
  async function connect() {
    if (!enabled) return { ok: false, code: 'disabled' };
    // open the popup right away (still inside the click) and point it at Spotify once PKCE is ready
    const popup = window.open('', 'datalab-spotify', 'popup,width=480,height=720');
    if (!popup) return { ok: false, code: 'popup' };
    const verifier = randomString(64), state = randomString(24);
    store.set(PENDING, { verifier, state, redirect: redirectUri(), at: Date.now() });
    const q = new URLSearchParams({
      response_type: 'code',
      client_id: clientId,
      scope: SCOPES.join(' '),
      redirect_uri: redirectUri(),
      code_challenge_method: 'S256',
      code_challenge: await challenge(verifier),
      state,
    });
    popup.location.href = AUTH_URL + '?' + q.toString();
    S.popup = popup;
    return { ok: true };
  }

  // Runs on spotify-callback.html. Checks state, swaps code + verifier for tokens, cleans the URL.
  async function finishLogin(search) {
    const q = new URLSearchParams(search);
    const pending = store.get(PENDING);
    store.del(PENDING);   // one shot: a reused or replayed callback finds nothing
    if (q.get('error')) return { ok: false, code: q.get('error') === 'access_denied' ? 'denied' : 'network', detail: q.get('error') };
    if (!enabled) return { ok: false, code: 'disabled' };
    if (!pending || Date.now() - pending.at > PENDING_MS) return { ok: false, code: 'expired' };
    if (!q.get('state') || q.get('state') !== pending.state) return { ok: false, code: 'state' };
    if (!q.get('code')) return { ok: false, code: 'network' };
    const r = await tokenRequest({
      grant_type: 'authorization_code',
      code: q.get('code'),
      redirect_uri: pending.redirect,
      client_id: clientId,
      code_verifier: pending.verifier,
    });
    if (!r.ok) return r;
    keep(r.data, null);
    return { ok: true };
  }

  function disconnect() {
    forget();
    store.del(PENDING);
    emit('change', { connected: false, reason: 'logout' });
  }

  // tokens written by the callback page (popup) or by another DataLab tab
  addEventListener('storage', (ev) => {
    if (!enabled || ev.key !== KEY) return;
    S.tokens = store.get(KEY);
    emit('change', { connected: !!S.tokens });
    if (S.tokens && S.popup && !S.popup.closed) { try { S.popup.close(); } catch (e) { /* COOP may hide it */ } }
  });

  DL.Spotify = {
    enabled,
    MESSAGES,
    get connected() { return !!S.tokens; },
    redirectUri,
    connect,
    finishLogin,
    disconnect,
    nowPlaying,
    play: () => api('PUT', '/me/player/play'),
    pause: () => api('PUT', '/me/player/pause'),
    next: () => api('POST', '/me/player/next'),
    on(ev, fn) { (S.listeners[ev] = S.listeners[ev] || []).push(fn); },
  };
})();
