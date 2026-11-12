// DataLab · Agent Gateway — the only place where AI agents run for the game's crew.
//
//   GET  /v1/health                         liveness (no login)
//   GET  /v1/agents                         agents + models this server offers, default model
//   GET  /v1/settings  ·  PUT /v1/settings  the player's limits (clamped to the server caps) + today's usage
//   POST /v1/tasks                          { employee:{id,name,role}, agent, model, prompt } → task
//   GET  /v1/tasks?employee=ID              history (newest first)
//   GET  /v1/tasks/:id                      one task with its events and result
//   GET  /v1/tasks/:id/events?after=N       live progress (Server-Sent Events)
//   POST /v1/tasks/:id/abort                stop it
//   POST /v1/tasks/:id/approvals/:aid       { reply: 'once' | 'reject' } a command waiting for the player
//   GET  /v1/workspace/:employee/files      what the employee produced
//   GET  /v1/workspace/:employee/file?path= one text file (≤ 256 KB)
//
// Every route but /health requires the player's Supabase access token (Authorization: Bearer).
import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig } from './config.mjs';
import { createAuth } from './auth.mjs';
import { createStore } from './store.mjs';
import { createAgents } from './agents/index.mjs';
import { createTasks } from './tasks.mjs';
import { capsInfo, modelAllowed } from './policy.mjs';
import { HttpError, originMatcher, corsHeaders, sendJson, sendError, readJson, str, ID } from './http.mjs';

export async function createGateway(over = {}, deps = {}) {
  const cfg = loadConfig(over);
  await fs.mkdir(cfg.dataDir, { recursive: true });
  const allowed = originMatcher(cfg.allowedOrigins);
  const auth = deps.auth || createAuth(cfg, deps.fetch);
  const store = createStore(cfg.dataDir);
  const agents = deps.agents || createAgents(cfg);
  const tasks = createTasks({ cfg, store, agents });
  const isAllowed = (m) => modelAllowed(m, cfg);

  // a small per-player rate limit on the whole API (the task limits are separate)
  const hits = new Map();
  function rate(uid) {
    const now = Date.now(), w = hits.get(uid) || { t: now, n: 0 };
    if (now - w.t > 60_000) { w.t = now; w.n = 0; }
    w.n++;
    hits.set(uid, w);
    if (w.n > 240) throw new HttpError(429, 'rate_limited', 'Muitas requisições. Espere um pouco.');
  }

  async function agentsInfo() {
    const out = [];
    for (const a of agents.list) {
      let models = [], reason = a.reason || null;
      if (a.available) {
        try { models = await a.models(isAllowed); } catch (e) { reason = 'Indisponível no momento'; console.error('[gateway] models', a.id, e && e.message); }
      }
      out.push({ id: a.id, label: a.label, available: !!a.available && !reason, reason, models });
    }
    return { agents: out, defaultAgent: 'opencode', defaultModel: cfg.defaultModel };
  }

  async function handle(req, res) {
    const url = new URL(req.url, 'http://x');
    const p = url.pathname;
    if (req.method === 'OPTIONS') { res.writeHead(204, corsHeaders(req, allowed)); res.end(); return; }
    if (p === '/v1/health' && req.method === 'GET') return sendJson(res, req, allowed, 200, { ok: true, running: tasks.running });
    // a browser on a site that is not ours never gets an answer it can read
    if (req.headers.origin && !allowed(req.headers.origin)) throw new HttpError(403, 'origin_not_allowed', 'Origem não permitida.');
    const user = await auth.requireUser(req);
    rate(user.id);
    let m;
    if (p === '/v1/agents' && req.method === 'GET') return sendJson(res, req, allowed, 200, await agentsInfo());
    if (p === '/v1/settings' && req.method === 'GET') {
      const s = await tasks.settingsOf(user.id);
      return sendJson(res, req, allowed, 200, { limits: s.limits, caps: capsInfo(cfg), usage: await store.getUsage(user.id) });
    }
    if (p === '/v1/settings' && req.method === 'PUT') {
      const body = await readJson(req, 8000);
      const s = await tasks.putSettings(user, body);
      return sendJson(res, req, allowed, 200, { limits: s.limits, caps: capsInfo(cfg), usage: await store.getUsage(user.id) });
    }
    if (p === '/v1/tasks' && req.method === 'POST') return sendJson(res, req, allowed, 201, await tasks.create(user, await readJson(req, 64_000)));
    if (p === '/v1/tasks' && req.method === 'GET') {
      const emp = url.searchParams.get('employee');
      return sendJson(res, req, allowed, 200, { tasks: await tasks.list(user, emp ? str(emp, 'employee', ID, 40) : null) });
    }
    if ((m = /^\/v1\/tasks\/(t_[a-z0-9]{6,40})$/.exec(p)) && req.method === 'GET') {
      const t = await tasks.get(user, m[1]);
      const { limits, ...rest } = t;
      return sendJson(res, req, allowed, 200, { task: { ...rest, limits } });
    }
    if ((m = /^\/v1\/tasks\/(t_[a-z0-9]{6,40})\/abort$/.exec(p)) && req.method === 'POST') return sendJson(res, req, allowed, 200, await tasks.abort(user, m[1]));
    if ((m = /^\/v1\/tasks\/(t_[a-z0-9]{6,40})\/approvals\/([A-Za-z0-9_-]{1,80})$/.exec(p)) && req.method === 'POST') {
      const body = await readJson(req, 1000);
      return sendJson(res, req, allowed, 200, await tasks.approve(user, m[1], m[2], body.reply));
    }
    if ((m = /^\/v1\/tasks\/(t_[a-z0-9]{6,40})\/events$/.exec(p)) && req.method === 'GET') return stream(req, res, user, m[1], Number(url.searchParams.get('after')) || 0);
    if ((m = /^\/v1\/workspace\/([A-Za-z0-9_-]{1,40})\/files$/.exec(p)) && req.method === 'GET') return sendJson(res, req, allowed, 200, { files: await tasks.files(user, m[1]) });
    if ((m = /^\/v1\/workspace\/([A-Za-z0-9_-]{1,40})\/file$/.exec(p)) && req.method === 'GET') return sendJson(res, req, allowed, 200, await tasks.readFile(user, m[1], url.searchParams.get('path')));
    throw new HttpError(404, 'not_found', 'Rota não encontrada.');
  }

  // Server-Sent Events: replays what happened after `after`, then follows the task until it ends
  async function stream(req, res, user, id, after) {
    const task = await tasks.get(user, id); // 404 when it is not this player's
    res.writeHead(200, { ...corsHeaders(req, allowed), 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
    const send = (ev) => res.write('id: ' + ev.seq + '\ndata: ' + JSON.stringify(ev) + '\n\n');
    const unsub = tasks.subscribe(user, id, after, (ev) => { if (ev) send(ev); else { res.write('event: end\ndata: {}\n\n'); res.end(); } });
    if (!unsub) {
      // already finished: the stored events, then the end
      for (const e of task.events || []) if (e.seq > after) send(e);
      res.write('event: end\ndata: {}\n\n');
      res.end();
      return;
    }
    const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
    req.on('close', () => { clearInterval(ping); unsub(); });
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => { if (!res.headersSent) sendError(res, req, allowed, e); else res.end(); });
  });
  server.requestTimeout = 0; // SSE streams stay open
  server.headersTimeout = 20_000;
  return { server, cfg, tasks, store, listen: () => new Promise((r) => server.listen(cfg.port, cfg.host, () => r(server.address()))) };
}

// started directly: `node src/server.mjs`
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const g = await createGateway();
  const a = await g.listen();
  const c = g.cfg;
  console.log('[gateway] DataLab Agent Gateway em http://' + a.address + ':' + a.port);
  console.log('[gateway] dados: ' + c.dataDir + ' · modelos: ' + c.allowedModels.join(', ') + ' · sandbox confiável: ' + (c.sandboxTrusted ? 'sim' : 'não'));
  if (!c.supabaseUrl || !c.supabaseAnonKey) console.warn('[gateway] SUPABASE_URL / SUPABASE_ANON_KEY ausentes: todas as rotas autenticadas vão responder 503');
  if (!c.allowedOrigins.length) console.warn('[gateway] ALLOWED_ORIGINS vazio: o navegador não vai conseguir ler as respostas (CORS)');
  if (c.mockAgent) console.warn('[gateway] AGENT_MOCK=1: agente de testes ativo — nunca use em produção');
}
