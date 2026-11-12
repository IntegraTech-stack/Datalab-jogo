// DataLab · OpenCode adapter. Every task gets its OWN `opencode serve` process:
//   - bound to 127.0.0.1 on a random port, protected by a random password (never leaves the gateway)
//   - working directory = the employee's workspace; the permission rules (policy.mjs) keep every
//     tool inside it
//   - a clean environment: no variable of the gateway is inherited except what a process needs to
//     start; HOME / XDG / APPDATA point to the gateway's own folder, so the host user's OpenCode
//     config, credentials and plugins are never seen
//   - project config, plugins and Claude Code files in the workspace are ignored
//     (OPENCODE_DISABLE_PROJECT_CONFIG, OPENCODE_PURE…), so an agent cannot loosen its own rules
//   - provider keys go in a config file outside the workspace (not in the environment that the
//     agent's shell commands inherit)
// The process is killed (whole tree) when the task ends, fails, times out or is stopped.
// OpenCode events are translated into the gateway's own small event set (see tasks.mjs), which is
// what lets other agents (Claude Code, Codex) plug in later with the same UI.
import { spawn, execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import net from 'node:net';
import path from 'node:path';
import crypto from 'node:crypto';

const WIN = process.platform === 'win32';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function freePort() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.unref();
    s.on('error', reject);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
  });
}

function killTree(child) {
  if (!child || child.exitCode !== null || child.killed) return;
  if (WIN) execFile('taskkill', ['/pid', String(child.pid), '/T', '/F'], () => {});
  else { try { process.kill(-child.pid, 'SIGKILL'); } catch { try { child.kill('SIGKILL'); } catch { /* gone */ } } }
}

// only what a process needs to start — nothing of the gateway's own environment (keys, tokens…)
function cleanEnv(home, extra) {
  const keep = WIN ? ['PATH', 'Path', 'PATHEXT', 'SystemRoot', 'SYSTEMROOT', 'windir', 'ComSpec', 'SystemDrive', 'NUMBER_OF_PROCESSORS', 'PROCESSOR_ARCHITECTURE', 'OS', 'OPENCODE_GIT_BASH_PATH']
    : ['PATH', 'LANG', 'LC_ALL', 'TZ'];
  const env = {};
  for (const k of keep) if (process.env[k] != null) env[k] = process.env[k];
  const tmp = path.join(home, 'tmp');
  Object.assign(env, {
    HOME: home, USERPROFILE: home, XDG_CONFIG_HOME: path.join(home, '.config'), XDG_DATA_HOME: path.join(home, '.local', 'share'),
    XDG_CACHE_HOME: path.join(home, '.cache'), XDG_STATE_HOME: path.join(home, '.local', 'state'), TMPDIR: tmp, TEMP: tmp, TMP: tmp,
    OPENCODE_DISABLE_PROJECT_CONFIG: '1', OPENCODE_PURE: '1', OPENCODE_DISABLE_AUTOUPDATE: '1', OPENCODE_DISABLE_CLAUDE_CODE: '1',
    OPENCODE_DISABLE_EXTERNAL_SKILLS: '1', OPENCODE_DISABLE_LSP_DOWNLOAD: '1', OPENCODE_DISABLE_EMBEDDED_WEB_UI: '1', OPENCODE_AUTO_SHARE: '0',
  });
  if (WIN) Object.assign(env, { APPDATA: path.join(home, 'AppData', 'Roaming'), LOCALAPPDATA: path.join(home, 'AppData', 'Local') });
  return Object.assign(env, extra);
}

// a tiny SSE reader over fetch (OpenCode's /event)
async function readSse(res, onEvent, signal) {
  const rd = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  while (!signal.aborted) {
    const { value, done } = await rd.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = chunk.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5)).join('\n');
      if (!data) continue;
      let ev = null;
      try { ev = JSON.parse(data); } catch { continue; }
      onEvent(ev);
    }
  }
}

const clip = (s, n) => { s = String(s ?? ''); return s.length > n ? s.slice(0, n) + '…' : s; };

// On Windows `opencode` is an npm .cmd shim: find the real .exe so no shell is involved
let resolvedBin = null;
async function resolveBin(bin) {
  if (resolvedBin) return resolvedBin;
  resolvedBin = { file: bin, shell: false };
  if (!WIN || /\.exe$/i.test(bin) || /[\\/]/.test(bin)) return resolvedBin;
  const where = await new Promise((r) => execFile('where', [bin], (e, out) => r(e ? '' : String(out))));
  for (const shim of where.split(/\r?\n/).map((s) => s.trim()).filter(Boolean)) {
    if (/\.exe$/i.test(shim)) { resolvedBin = { file: shim, shell: false }; return resolvedBin; }
    const exe = path.join(path.dirname(shim), 'node_modules', 'opencode-ai', 'node_modules', 'opencode-windows-x64', 'bin', 'opencode.exe');
    try { await fs.access(exe); resolvedBin = { file: exe, shell: false }; return resolvedBin; } catch { /* next */ }
  }
  resolvedBin = { file: bin, shell: true }; // last resort: let cmd.exe find the shim
  return resolvedBin;
}

export function createOpenCodeAgent(cfg) {
  const homeDir = path.join(cfg.dataDir, 'opencode-home');
  const runRoot = path.join(cfg.dataDir, 'run');
  let catalog = { at: 0, models: null, pending: null };

  // start one OpenCode server; resolves { url, auth, child, stop() }
  async function boot(workspace, config) {
    await fs.mkdir(path.join(homeDir, 'tmp'), { recursive: true });
    await fs.mkdir(workspace, { recursive: true });
    // project-level OpenCode files are ignored anyway; remove them so nothing stale lingers
    for (const f of ['opencode.json', 'opencode.jsonc', '.opencode']) await fs.rm(path.join(workspace, f), { recursive: true, force: true }).catch(() => {});
    const runDir = path.join(runRoot, crypto.randomBytes(8).toString('hex'));
    await fs.mkdir(runDir, { recursive: true });
    const cfgFile = path.join(runDir, 'opencode.json');
    await fs.writeFile(cfgFile, JSON.stringify(config), { mode: 0o600 });
    const port = await freePort();
    const password = crypto.randomBytes(24).toString('base64url');
    const env = cleanEnv(homeDir, { OPENCODE_CONFIG: cfgFile, OPENCODE_SERVER_PASSWORD: password });
    const bin = await resolveBin(cfg.opencodeBin);
    const child = spawn(bin.file, ['serve', '--hostname', '127.0.0.1', '--port', String(port), '--pure'], {
      cwd: workspace, env, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: !WIN, shell: bin.shell,
    });
    let log = '';
    const keepLog = (d) => { log = (log + d.toString()).slice(-4000); };
    child.stdout.on('data', keepLog);
    child.stderr.on('data', keepLog);
    const url = 'http://127.0.0.1:' + port;
    const auth = 'Basic ' + Buffer.from('opencode:' + password).toString('base64');
    const stop = async () => { killTree(child); await sleep(300); await fs.rm(runDir, { recursive: true, force: true }).catch(() => {}); };
    const t0 = Date.now();
    for (;;) {
      if (child.exitCode !== null) { await stop(); throw new Error('OpenCode encerrou ao iniciar: ' + clip(log, 400)); }
      try { const r = await fetch(url + '/global/health', { headers: { authorization: auth } }); if (r.ok) break; } catch { /* not up yet */ }
      if (Date.now() - t0 > 45_000) { await stop(); throw new Error('OpenCode não respondeu em 45 s'); }
      await sleep(250);
    }
    return { url, auth, child, stop, secrets: [password] };
  }

  function baseConfig(extra) {
    const provider = {};
    for (const [id, key] of Object.entries(cfg.providerKeys)) provider[id] = { options: { apiKey: key } };
    return { autoupdate: false, share: 'disabled', snapshot: false, ...(Object.keys(provider).length ? { provider } : {}), ...extra };
  }

  // the models this gateway offers (OpenCode's catalog ∩ ALLOWED_MODELS), cached for 10 minutes
  async function models(isAllowed) {
    if (catalog.models && Date.now() - catalog.at < 600_000) return catalog.models.filter((m) => isAllowed(m.id));
    if (!catalog.pending) {
      catalog.pending = (async () => {
        const srv = await boot(path.join(cfg.dataDir, 'catalog'), baseConfig({}));
        try {
          const r = await fetch(srv.url + '/config/providers', { headers: { authorization: srv.auth } });
          const body = await r.json();
          const out = [];
          for (const p of body.providers || []) {
            for (const [mid, m] of Object.entries(p.models || {})) {
              const cost = m.cost || {};
              out.push({ id: p.id + '/' + mid, name: (m.name || mid), provider: p.name || p.id, free: !(cost.input > 0 || cost.output > 0) });
            }
          }
          out.sort((a, b) => (b.free - a.free) || a.id.localeCompare(b.id));
          catalog = { at: Date.now(), models: out, pending: null };
        } finally { await srv.stop(); }
      })().catch((e) => { catalog.pending = null; throw e; });
    }
    await catalog.pending;
    return catalog.models.filter((m) => isAllowed(m.id));
  }

  /**
   * Run one task. opts: { workspace, model "provider/model", prompt, system, rules, maxSteps, onEvent }
   * Returns { abort(reason), reply(approvalId, 'once'|'reject'), done: Promise<{ text, files, usage }> }
   */
  function start(opts) {
    const emit = opts.onEvent;
    const ac = new AbortController();
    let srv = null, sessionID = null, aborted = null;
    const state = { busySeen: false, steps: new Set(), msgs: new Map(), files: new Set(), texts: new Map(), pendingApprovals: new Set() };
    const rel = (p) => {
      const s = String(p || '');
      const w = path.resolve(opts.workspace);
      if (s.toLowerCase().startsWith(w.toLowerCase())) return s.slice(w.length).replace(/^[\\/]+/, '').replace(/\\/g, '/') || '.';
      return s;
    };
    const usage = () => {
      let tokens = 0, cost = 0;
      for (const m of state.msgs.values()) { tokens += m.tokens; cost += m.cost; }
      return { tokens, costUsd: Math.round(cost * 1e6) / 1e6, steps: state.steps.size };
    };

    function toolInput(tool, input) {
      if (!input || typeof input !== 'object') return '';
      if (tool === 'bash') return clip(input.command, 300);
      if (input.filePath) return rel(input.filePath);
      if (input.path) return rel(input.path);
      if (input.pattern) return clip(input.pattern, 120);
      if (input.url) return clip(input.url, 200);
      return '';
    }

    function onOcEvent(ev) {
      const p = ev.properties || {};
      if (p.sessionID && p.sessionID !== sessionID) return;
      switch (ev.type) {
        case 'session.status':
          if (p.status && p.status.type === 'busy') state.busySeen = true;
          if (p.status && p.status.type === 'retry') emit({ type: 'retry', message: clip(p.status.message, 300), attempt: p.status.attempt });
          break;
        case 'message.updated': {
          const i = p.info;
          if (!i || i.role !== 'assistant') break;
          const t = i.tokens || {};
          state.msgs.set(i.id, { tokens: (t.input || 0) + (t.output || 0) + (t.reasoning || 0), cost: i.cost || 0 });
          emit({ type: 'usage', ...usage() });
          if (i.error && i.error.name !== 'MessageAbortedError') emit({ type: 'error', message: clip((i.error.data && i.error.data.message) || i.error.name, 500) });
          break;
        }
        case 'message.part.updated': {
          const part = p.part;
          if (!part) break;
          if (part.type === 'step-start' && !state.steps.has(part.id)) { state.steps.add(part.id); emit({ type: 'step', n: state.steps.size }); }
          else if (part.type === 'text' && state.msgs.has(part.messageID)) { state.texts.set(part.id, part.text || ''); emit({ type: 'text', id: part.id, text: part.text || '' }); }
          else if (part.type === 'reasoning' && part.text) emit({ type: 'thinking', id: part.id, text: clip(part.text, 600) });
          else if (part.type === 'tool') {
            const st = part.state || {};
            emit({ type: 'tool', id: part.id, tool: part.tool, status: st.status, title: clip(st.title || '', 200), input: toolInput(part.tool, st.input),
              output: st.status === 'completed' ? clip(st.output, 2000) : st.status === 'error' ? clip(st.error, 600) : '' });
            if (part.tool === 'todowrite' && st.input && Array.isArray(st.input.todos)) emit({ type: 'todo', items: st.input.todos.slice(0, 20).map((x) => ({ content: clip(x.content, 160), status: x.status })) });
          }
          break;
        }
        case 'message.part.delta':
          if (p.field === 'text' && state.texts.has(p.partID)) {
            const t = state.texts.get(p.partID) + p.delta;
            state.texts.set(p.partID, t);
            emit({ type: 'text', id: p.partID, text: t });
          }
          break;
        case 'file.edited':
          if (p.file) { const f = rel(p.file); if (!state.files.has(f)) { state.files.add(f); emit({ type: 'file', path: f }); } }
          break;
        case 'permission.asked':
          state.pendingApprovals.add(p.id);
          emit({ type: 'approval', id: p.id, permission: p.permission, patterns: (p.patterns || []).slice(0, 5).map((x) => clip(rel(x), 200)), command: clip((p.metadata && p.metadata.command) || '', 400) });
          break;
        case 'permission.replied':
          state.pendingApprovals.delete(p.requestID || p.id);
          break;
        case 'session.error':
          if (p.error && p.error.name !== 'MessageAbortedError') emit({ type: 'error', message: clip((p.error.data && p.error.data.message) || p.error.name, 500) });
          break;
      }
    }

    const done = (async () => {
      emit({ type: 'status', state: 'starting' });
      const config = baseConfig({ agent: { build: { steps: Math.max(1, opts.maxSteps + 1) } } });
      srv = await boot(opts.workspace, config);
      if (aborted) throw Object.assign(new Error(aborted), { aborted: true });
      opts.onSecrets && opts.onSecrets(srv.secrets);
      const H = { authorization: srv.auth, 'content-type': 'application/json' };
      const call = async (p, init) => {
        const r = await fetch(srv.url + p, { ...init, headers: H });
        if (!r.ok) throw new Error('OpenCode ' + p.split('?')[0] + ' → HTTP ' + r.status + ' ' + clip(await r.text().catch(() => ''), 300));
        return r.status === 204 ? null : r.json();
      };
      // events first, so nothing is missed
      const evRes = await fetch(srv.url + '/event', { headers: { authorization: srv.auth }, signal: ac.signal });
      let idle;
      const idleP = new Promise((r) => { idle = r; });
      readSse(evRes, (ev) => {
        onOcEvent(ev);
        if (ev.type === 'session.idle' && ev.properties && ev.properties.sessionID === sessionID && state.busySeen) idle();
        if (ev.type === 'session.status' && ev.properties && ev.properties.sessionID === sessionID && ev.properties.status.type === 'idle' && state.busySeen) idle();
      }, ac.signal).catch(() => {}).finally(() => idle());
      const ses = await call('/session', { method: 'POST', body: JSON.stringify({ title: clip(opts.title || 'DataLab', 80), permission: opts.rules }) });
      sessionID = ses.id;
      const [providerID, ...rest] = opts.model.split('/');
      await call('/session/' + sessionID + '/prompt_async', { method: 'POST', body: JSON.stringify({ model: { providerID, modelID: rest.join('/') }, system: opts.system, parts: [{ type: 'text', text: opts.prompt }] }) });
      emit({ type: 'status', state: 'running' });
      await idleP;
      // the final answer: text of the last assistant message (the whole conversation is in the events)
      let text = '';
      try {
        const msgs = await call('/session/' + sessionID + '/message');
        for (const m of msgs) {
          if (m.info.role !== 'assistant') continue;
          const t = m.info.tokens || {};
          state.msgs.set(m.info.id, { tokens: (t.input || 0) + (t.output || 0) + (t.reasoning || 0), cost: m.info.cost || 0 });
          const tx = m.parts.filter((x) => x.type === 'text' && !x.synthetic).map((x) => x.text).join('\n').trim();
          if (tx) text = tx;
        }
      } catch { text = [...state.texts.values()].pop() || ''; }
      if (aborted) throw Object.assign(new Error(aborted), { aborted: true, partial: { text, files: [...state.files], usage: usage() } });
      return { text, files: [...state.files], usage: usage() };
    })().finally(async () => {
      ac.abort();
      if (srv) await srv.stop();
    });

    return {
      done,
      async abort(reason) {
        if (aborted) return;
        aborted = reason || 'Interrompida';
        try {
          if (srv && sessionID) await fetch(srv.url + '/session/' + sessionID + '/abort', { method: 'POST', headers: { authorization: srv.auth } });
        } catch { /* the process is killed below anyway */ }
        // give OpenCode a moment to close the turn, then stop the process no matter what
        setTimeout(() => { ac.abort(); if (srv) killTree(srv.child); }, 1500);
      },
      async reply(id, answer, message) {
        if (!srv || !state.pendingApprovals.has(id)) return false;
        const r = await fetch(srv.url + '/permission/' + encodeURIComponent(id) + '/reply', {
          method: 'POST', headers: { authorization: srv.auth, 'content-type': 'application/json' },
          body: JSON.stringify({ reply: answer === 'once' ? 'once' : 'reject', ...(answer === 'once' ? {} : { message: message || 'O jogador recusou este comando.' }) }),
        });
        state.pendingApprovals.delete(id);
        return r.ok;
      },
      usage,
    };
  }

  return { id: 'opencode', label: 'OpenCode', available: true, models, start };
}
