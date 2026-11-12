/* DataLab — Agent service: the browser side of the Agent Gateway (agents/ folder), where the crew's
   AI agents (OpenCode) really run.
   - The only credential sent is the player's own Supabase session (Authorization: Bearer); provider
     keys and the agent's sandbox live on the gateway and never reach the browser.
   - The gateway address is public config: DATALAB_CONFIG.agentGatewayUrl. Empty = no AI for the crew
     (the game stays exactly as before). On localhost it defaults to http://127.0.0.1:8787.
   - Live progress is a Server-Sent Events stream read with fetch (EventSource cannot send the
     Authorization header); it reconnects on its own and resumes after the last event seen. */
(function () {
  'use strict';
  const DL = (window.DL = window.DL || {});

  function baseUrl() {
    const cfg = window.DATALAB_CONFIG || {};
    let u = String(cfg.agentGatewayUrl || '').trim().replace(/\/+$/, '');
    if (!u && /^(localhost|127\.0\.0\.1)$/.test(location.hostname)) u = 'http://127.0.0.1:8787';
    if (!/^https:\/\/[a-z0-9.-]+(:\d+)?$/i.test(u) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(u)) return '';
    return u;
  }

  async function token() {
    const c = DL.Cloud && DL.Cloud.client;
    if (!c || !DL.Cloud.signedIn) return null;
    try { const { data } = await c.auth.getSession(); return (data && data.session && data.session.access_token) || null; } catch (e) { return null; }
  }

  const MESSAGES = {
    unauthorized: 'Entre na sua conta para usar a IA da equipe.',
    network: 'O servidor de agentes não respondeu. Ele está rodando? (pasta agents/ · npm start)',
    disabled: 'A IA da equipe não está configurada neste jogo.',
  };

  // Always resolves: { ok: true, data } | { ok: false, code, message, status }
  async function req(method, path, body) {
    const base = baseUrl();
    if (!base) return { ok: false, code: 'disabled', message: MESSAGES.disabled, status: 0 };
    const t = await token();
    if (!t) return { ok: false, code: 'unauthorized', message: MESSAGES.unauthorized, status: 401 };
    try {
      const r = await fetch(base + path, {
        method,
        headers: Object.assign({ Authorization: 'Bearer ' + t }, body ? { 'Content-Type': 'application/json' } : {}),
        body: body ? JSON.stringify(body) : undefined,
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
      const data = await r.json().catch(() => null);
      if (r.ok) return { ok: true, data };
      const code = (data && data.error) || 'http_' + r.status;
      return { ok: false, code, status: r.status, message: (data && data.message) || MESSAGES[code] || 'Erro no servidor de agentes (' + r.status + ').' };
    } catch (e) {
      return { ok: false, code: 'network', status: 0, message: MESSAGES.network };
    }
  }

  // Follow a task. onEvent(ev) for each event, onEnd() once it is over. Returns { close() }.
  function follow(taskId, after, onEvent, onEnd) {
    const S = { closed: false, after: after || 0, ac: null, tries: 0 };
    async function loop() {
      while (!S.closed) {
        const base = baseUrl(), t = await token();
        if (!base || !t) { await wait(3000); continue; }
        S.ac = new AbortController();
        let ended = false;
        try {
          const r = await fetch(base + '/v1/tasks/' + encodeURIComponent(taskId) + '/events?after=' + S.after, { headers: { Authorization: 'Bearer ' + t }, signal: S.ac.signal, credentials: 'omit' });
          if (r.status === 404) { ended = true; break; }
          if (!r.ok || !r.body) throw new Error('http ' + r.status);
          S.tries = 0;
          const rd = r.body.getReader(), dec = new TextDecoder();
          let buf = '';
          for (;;) {
            const { value, done } = await rd.read();
            if (done) break;
            buf += dec.decode(value, { stream: true });
            let i;
            while ((i = buf.indexOf('\n\n')) >= 0) {
              const chunk = buf.slice(0, i);
              buf = buf.slice(i + 2);
              if (chunk.indexOf('event: end') === 0) { ended = true; break; }
              const line = chunk.split('\n').filter((l) => l.indexOf('data: ') === 0).map((l) => l.slice(6)).join('\n');
              if (!line) continue;
              let ev = null;
              try { ev = JSON.parse(line); } catch (e) { continue; }
              if (ev.seq) S.after = Math.max(S.after, ev.seq);
              try { onEvent(ev); } catch (e) { console.error(e); }
            }
            if (ended) break;
          }
        } catch (e) {
          if (S.closed) return;
        }
        if (ended) break;
        // dropped: try again, a bit later each time
        await wait(Math.min(15000, 1000 * Math.pow(2, S.tries++)));
      }
      if (!S.closed) { S.closed = true; try { S.ac && S.ac.abort(); } catch (e) { /* done */ } onEnd && onEnd(); }
    }
    const wait = (ms) => new Promise((r) => setTimeout(r, ms));
    loop();
    return { close() { S.closed = true; try { S.ac && S.ac.abort(); } catch (e) { /* done */ } } };
  }

  const enc = encodeURIComponent;
  DL.AgentService = {
    get url() { return baseUrl(); },
    get enabled() { return !!baseUrl(); },
    agents: () => req('GET', '/v1/agents'),
    settings: () => req('GET', '/v1/settings'),
    saveSettings: (limits) => req('PUT', '/v1/settings', { limits }),
    create: (employee, agent, model, prompt) => req('POST', '/v1/tasks', { employee, agent, model, prompt }),
    list: (employeeId) => req('GET', '/v1/tasks' + (employeeId ? '?employee=' + enc(employeeId) : '')),
    get: (id) => req('GET', '/v1/tasks/' + enc(id)),
    abort: (id) => req('POST', '/v1/tasks/' + enc(id) + '/abort'),
    approve: (id, approvalId, reply) => req('POST', '/v1/tasks/' + enc(id) + '/approvals/' + enc(approvalId), { reply }),
    files: (employeeId) => req('GET', '/v1/workspace/' + enc(employeeId) + '/files'),
    file: (employeeId, path) => req('GET', '/v1/workspace/' + enc(employeeId) + '/file?path=' + enc(path)),
    follow,
  };
})();
