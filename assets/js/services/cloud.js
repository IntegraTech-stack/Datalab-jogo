/* DataLab — Cloud: the single entry point to Supabase in the browser.
   - Loads supabase-js (pinned version + Subresource Integrity) only when a project is configured.
   - Uses ONLY the publishable key (config.js). Refuses to start with a secret / service_role key.
   - Reads go through RLS (DL.Cloud.from); every write that matters goes through an Edge Function
     (DL.Cloud.call), which validates the session and does the work on the server.
   - Without configuration the game stays offline, exactly as before. */
(function () {
  'use strict';
  const DL = (window.DL = window.DL || {});
  const SDK = {
    src: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/dist/umd/supabase.js',
    integrity: 'sha384-0w2KAL2YHP6wKOkUDzkCDGgVvfmHnj02DHeQ6XcHOgTfFsGyonKOpShMH1x6nk9o',
  };
  const MESSAGES = {
    offline: 'Sem conexão com o servidor do DataLab.',
    unauthorized: 'Faça login para continuar.',
    network: 'Falha de rede: verifique a conexão e tente de novo.',
    internal: 'Erro no servidor. Tente de novo em instantes.',
  };
  const C = { client: null, session: null, user: null, status: 'offline', listeners: {}, ready: null, url: '', key: '' };

  const emit = (ev, info) => (C.listeners[ev] || []).forEach((fn) => { try { fn(info); } catch (e) { console.error(e); } });

  // A secret key in the browser would give anyone full access: never accept one.
  function looksSecret(key) {
    if (/^sb_secret_/i.test(key)) return true;
    const parts = String(key).split('.');
    if (parts.length === 3) {
      try {
        const claims = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
        return claims.role === 'service_role' || claims.role === 'supabase_admin';
      } catch (e) { /* not a JWT */ }
    }
    return false;
  }

  function loadSdk() {
    if (window.supabase && window.supabase.createClient) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = SDK.src;
      s.integrity = SDK.integrity;
      s.crossOrigin = 'anonymous';
      s.referrerPolicy = 'no-referrer';
      s.onload = () => resolve();
      s.onerror = () => reject(new Error('sdk'));
      document.head.appendChild(s);
    });
  }

  function setSession(session) {
    C.session = session || null;
    C.user = (session && session.user) || null;
    C.status = C.user ? 'online' : 'signed-out';
  }

  async function init() {
    if (!window.DATALAB_CONFIG) {
      // config.js never ran: on a deploy this means the file was not published (check .vercelignore)
      C.status = 'misconfigured';
      console.error('DataLab: assets/js/supabase/config.js não foi carregado (' + location.origin + '). Confira se o arquivo foi publicado — padrões sem "/" inicial no .vercelignore removem pastas em qualquer nível.');
      return false;
    }
    const cfg = window.DATALAB_CONFIG;
    const url = String(cfg.supabaseUrl || '').trim(), key = String(cfg.supabasePublishableKey || '').trim();
    if (!url || !key) { C.status = 'offline'; return false; }
    if (looksSecret(key)) {
      C.status = 'misconfigured';
      console.error('DataLab: a chave em assets/js/supabase/config.js é SECRETA (service_role). Remova-a e use a publishable key. O modo online foi desativado.');
      return false;
    }
    if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(url)) {
      C.status = 'misconfigured';
      console.error('DataLab: supabaseUrl inválida em config.js');
      return false;
    }
    try { await loadSdk(); } catch (e) { C.status = 'offline'; console.warn('DataLab: SDK do Supabase indisponível — jogando offline'); return false; }
    C.url = url; C.key = key;
    C.client = window.supabase.createClient(url, key, {
      auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce', storageKey: 'datalab.auth' },
    });
    C.client.auth.onAuthStateChange((event, session) => {
      setSession(session);
      emit('auth', { event, user: C.user });
    });
    const { data } = await C.client.auth.getSession();
    setSession(data && data.session);
    emit('auth', { event: 'INITIAL', user: C.user });
    return true;
  }

  // A "network" error from a deployed site is almost always CORS: the site's address is missing from
  // the Edge Functions' ALLOWED_ORIGINS secret (the browser hides the real reason). Said once.
  let hinted = false;
  function networkHint(fn) {
    if (hinted || !navigator.onLine) return;
    hinted = true;
    console.warn('DataLab: a Edge Function "' + fn + '" não respondeu. Se o jogo está publicado (ex.: Vercel), confira se ' + location.origin + ' está no secret ALLOWED_ORIGINS do Supabase (supabase secrets set ALLOWED_ORIGINS=...).');
  }

  // what the player reads when an Edge Function can't be reached: offline, or (on a deploy) the server
  // refusing this site's address — the browser reports both the same way
  function networkMessage() {
    if (!navigator.onLine) return MESSAGES.network;
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return MESSAGES.network;
    return 'O servidor do DataLab não respondeu a este site (' + location.host + '). Se persistir, o endereço do site precisa ser liberado no servidor (ALLOWED_ORIGINS).';
  }

  // A request that survives the tab closing (fetch keepalive): the browser caps those bodies at 64 KB,
  // so a bigger one goes the normal way. Same answer shape as call().
  async function callKeepalive(fn, payload) {
    const r = await fetch(C.url + '/functions/v1/' + fn, {
      method: 'POST',
      keepalive: true,
      headers: { Authorization: 'Bearer ' + C.session.access_token, apikey: C.key, 'Content-Type': 'application/json' },
      body: payload,
    });
    const info = await r.json().catch(() => null);
    if (r.ok) return { ok: true, data: info };
    if (r.status === 401) emit('expired', {});
    const code = (info && info.error) || 'http_' + r.status;
    if (code === 'session_replaced') replaced();
    return { ok: false, code, status: r.status, message: (info && info.message) || MESSAGES[code] || 'Erro no servidor (' + code + ').' };
  }

  // the account logged in on another computer (the server only accepts its latest login): this one leaves
  // without touching that session — scope 'local' — and the login screen says why (auth-gate.js)
  let leaving = false;
  function replaced() {
    if (leaving) return;
    leaving = true;
    try { sessionStorage.setItem('datalab.replaced', '1'); } catch (e) { /* private mode */ }
    emit('replaced', {});
    C.client.auth.signOut({ scope: 'local' }).catch(() => location.replace(location.pathname));
  }

  // Call an Edge Function. Always resolves: { ok: true, data } | { ok: false, code, message, status }
  // opts.keepalive: the request still reaches the server if the page is closing (saves on exit)
  async function call(fn, body, opts) {
    if (!C.client) return { ok: false, code: 'offline', message: MESSAGES.offline, status: 0 };
    if (!C.user) return { ok: false, code: 'unauthorized', message: MESSAGES.unauthorized, status: 401 };
    try {
      if (opts && opts.keepalive && C.session && C.session.access_token) {
        const payload = JSON.stringify(body);
        if (payload.length < 60000) return await callKeepalive(fn, payload);
      }
      const { data, error } = await C.client.functions.invoke(fn, { body });
      if (!error) return { ok: true, data };
      let info = null, status = 0;
      if (error.context && typeof error.context.json === 'function') {
        status = error.context.status || 0;
        try { info = await error.context.json(); } catch (e) { info = null; }
      }
      const code = (info && info.error) || (status ? 'http_' + status : 'network');
      if (code === 'network') networkHint(fn);
      if (status === 401) emit('expired', {});
      if (code === 'session_replaced') replaced();
      return { ok: false, code, status, message: (info && info.message) || (code === 'network' ? networkMessage() : MESSAGES[code] || 'Erro no servidor (' + code + ').') };
    } catch (e) {
      networkHint(fn);
      return { ok: false, code: 'network', status: 0, message: networkMessage() };
    }
  }

  // RLS-protected reads (the player's own rows + the catalog)
  const from = (table) => (C.client ? C.client.from(table) : null);

  const requestId = () => (crypto.randomUUID ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-8xxx-xxxxxxxxxxxx'.replace(/x/g, () => ((Math.random() * 16) | 0).toString(16)));

  DL.Cloud = {
    init() { if (!C.ready) C.ready = init(); return C.ready; },
    call, from, requestId,
    on(ev, fn) { (C.listeners[ev] = C.listeners[ev] || []).push(fn); },
    emit,
    get client() { return C.client; },
    get configured() { return !!C.client; },
    get user() { return C.user; },
    get signedIn() { return !!C.user; },
    get status() { return C.status; },
    // for automated checks: plug a fake client (no network)
    _useClient(client, session) { C.client = client; setSession(session); C.ready = Promise.resolve(true); emit('auth', { event: 'SIGNED_IN', user: C.user }); },
    _looksSecret: looksSecret,
  };
})();
