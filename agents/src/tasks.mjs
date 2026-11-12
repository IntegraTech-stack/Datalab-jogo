// DataLab · tasks: what an employee was asked to do, run by an agent, followed live.
//   queued → starting → running ⇄ waiting (a command waits for the player's approval) → done | failed | aborted
// The limits are enforced HERE (server side), whatever the browser says: daily tasks and cost,
// tasks at the same time (per player and for the whole gateway), minutes, steps and tokens per task.
// Every event is redacted (no key / password ever reaches the browser), stored in the task (the
// history) and pushed to whoever follows it (SSE).
import fs from 'node:fs/promises';
import path from 'node:path';
import { HttpError } from './http.mjs';
import { clampLimits, permissionRules, createRedactor, modelAllowed, checkPrompt } from './policy.mjs';

const ACTIVE = new Set(['queued', 'starting', 'running', 'waiting']);
const MAX_EVENTS = 400;

const SYSTEM = (emp) => [
  'Você é ' + emp.name + ', funcionário(a) (' + (emp.role || 'equipe') + ') do datacenter DataLab, e recebeu uma tarefa do seu gestor no jogo.',
  'Execute a tarefa de verdade usando as ferramentas disponíveis. Trabalhe SOMENTE dentro do diretório atual (o seu espaço de trabalho);',
  'você não tem acesso à internet, a outros diretórios nem a comandos administrativos. Se um comando for bloqueado, siga por outro caminho e não insista.',
  'Responda em português do Brasil. No final, entregue um resumo curto do que foi feito e liste os arquivos criados ou alterados.',
].join(' ');

export function createTasks({ cfg, store, agents }) {
  const live = new Map(); // id -> { task, uid, handle, subs:Set, timers, secrets:[] }
  const queue = [];        // ids waiting for a slot
  const baseSecrets = [...Object.values(cfg.providerKeys), cfg.supabaseAnonKey].filter(Boolean);
  const dataDirRe = new RegExp(cfg.dataDir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\\/g, '[\\\\/]'), 'gi');

  const runningOf = (uid) => [...live.values()].filter((l) => l.uid === uid && l.task.status !== 'queued').length;
  const runningAll = () => [...live.values()].filter((l) => l.task.status !== 'queued').length;
  const summary = (t) => ({
    id: t.id, employee: t.employee, agent: t.agent, model: t.model, prompt: t.prompt.slice(0, 300), status: t.status,
    createdAt: t.createdAt, startedAt: t.startedAt || null, endedAt: t.endedAt || null, usage: t.usage, error: t.error || null,
    result: t.result ? { text: t.result.text.slice(0, 600), files: t.result.files } : null,
  });

  async function settingsOf(uid) {
    const s = await store.getSettings(uid);
    return { limits: clampLimits(s.limits, cfg), employees: s.employees || {} };
  }

  function persist(l, now) {
    clearTimeout(l.saveT);
    if (now) return store.putTask(l.uid, l.task);
    l.saveT = setTimeout(() => store.putTask(l.uid, l.task).catch(() => {}), 800);
    return null;
  }

  function push(l, ev) {
    const redact = createRedactor(baseSecrets.concat(l.secrets));
    const clean = redact(ev);
    // absolute paths of the gateway never reach the player
    for (const k of ['input', 'output', 'title', 'text', 'message', 'command']) if (typeof clean[k] === 'string') clean[k] = clean[k].replace(dataDirRe, '…');
    const t = l.task;
    clean.seq = ++t.seq;
    clean.t = Date.now();
    // text and tool events of the same part replace the previous one (the history stays small)
    const same = (clean.type === 'text' || clean.type === 'tool' || clean.type === 'thinking') && t.events.findIndex((e) => e.type === clean.type && e.id === clean.id);
    if (same !== false && same >= 0) t.events.splice(same, 1);
    if (clean.type === 'usage') { t.usage = { tokens: clean.tokens, costUsd: clean.costUsd, steps: clean.steps }; const i = t.events.findIndex((e) => e.type === 'usage'); if (i >= 0) t.events.splice(i, 1); }
    t.events.push(clean);
    if (t.events.length > MAX_EVENTS) t.events.splice(0, t.events.length - MAX_EVENTS);
    for (const fn of l.subs) { try { fn(clean); } catch { /* a closed stream */ } }
    persist(l);
  }

  function setStatus(l, status, extra) {
    l.task.status = status;
    Object.assign(l.task, extra || {});
    push(l, { type: 'status', state: status, ...(extra && extra.error ? { message: extra.error } : {}) });
  }

  async function finish(l, status, data) {
    for (const t of Object.values(l.timers)) clearTimeout(t);
    const t = l.task;
    const u = (data && data.usage) || (l.handle && l.handle.usage && l.handle.usage()) || t.usage;
    t.usage = u;
    t.endedAt = Date.now();
    const redact = createRedactor(baseSecrets.concat(l.secrets));
    if (data && data.error) data = { ...data, error: redact(String(data.error)).replace(dataDirRe, '…').slice(0, 600) };
    if (data && (data.text || (data.files && data.files.length))) t.result = { text: redact(String(data.text || '')).replace(dataDirRe, '…').slice(0, 20_000), files: (data.files || []).slice(0, 100) };
    setStatus(l, status, data && data.error ? { error: data.error } : {});
    push(l, { type: 'end', status, result: t.result || null, usage: u });
    await store.addUsage(l.uid, { tokens: u.tokens || 0, costUsd: u.costUsd || 0 });
    await persist(l, true);
    live.delete(t.id);
    for (const fn of l.subs) { try { fn(null); } catch { /* closed */ } }
    pump();
  }

  async function run(l) {
    const t = l.task;
    const agent = agents.get(t.agent);
    const limits = t.limits;
    t.startedAt = Date.now();
    setStatus(l, 'starting');
    const workspace = store.workspaceOf(l.uid, t.employee.id);
    l.timers.deadline = setTimeout(() => stop(l, 'Tempo limite de ' + limits.maxMinutes + ' min atingido'), limits.maxMinutes * 60_000);
    let handle;
    try {
      handle = agent.start({
        workspace, model: t.model, prompt: t.prompt, system: SYSTEM(t.employee), rules: permissionRules(limits), maxSteps: limits.maxSteps,
        title: t.employee.name + ' · ' + t.prompt.slice(0, 40),
        onSecrets: (s) => { l.secrets.push(...s); },
        onEvent: (ev) => onAgentEvent(l, ev),
      });
    } catch (e) {
      return finish(l, 'failed', { error: 'Não foi possível iniciar o agente.' });
    }
    l.handle = handle;
    if (l.stopReason) handle.abort(l.stopReason);
    try {
      const res = await handle.done;
      if (l.stopReason) return finish(l, l.stopBy === 'player' ? 'aborted' : 'failed', { ...res, error: l.stopReason });
      return finish(l, 'done', res);
    } catch (e) {
      if (e && e.aborted) return finish(l, l.stopBy === 'player' ? 'aborted' : 'failed', { ...(e.partial || {}), error: l.stopReason || e.message });
      console.error('[gateway] task', t.id, e && e.message);
      return finish(l, 'failed', { error: l.stopReason || 'O agente falhou: ' + String((e && e.message) || e).slice(0, 300) });
    }
  }

  function onAgentEvent(l, ev) {
    const t = l.task, limits = t.limits;
    if (!ACTIVE.has(t.status)) return;
    if (ev.type === 'status') { if (ev.state === 'running' && t.status !== 'waiting') setStatus(l, 'running'); return; }
    if (ev.type === 'approval') {
      if (limits.approvals === 'reject') { l.handle && l.handle.reply(ev.id, 'reject', 'Comando fora da lista permitida.'); push(l, { ...ev, type: 'approval', auto: 'reject' }); return; }
      l.approvals.add(ev.id);
      push(l, ev);
      setStatus(l, 'waiting');
      l.timers['ap_' + ev.id] = setTimeout(() => reply(l, ev.id, 'reject', 'timeout'), cfg.approvalTimeoutSec * 1000);
      return;
    }
    push(l, ev);
    if (ev.type === 'step' && ev.n > limits.maxSteps) stop(l, 'Limite de ' + limits.maxSteps + ' passos atingido');
    if (ev.type === 'usage') {
      if (ev.tokens > limits.maxTokens) stop(l, 'Limite de ' + limits.maxTokens.toLocaleString('pt-BR') + ' tokens atingido');
      if (ev.costUsd > 0 && l.dayCost + ev.costUsd > limits.dailyCostUsd) stop(l, 'Limite de custo diário (US$ ' + limits.dailyCostUsd + ') atingido');
    }
  }

  async function reply(l, id, answer, why) {
    if (!l.approvals.has(id)) return false;
    l.approvals.delete(id);
    clearTimeout(l.timers['ap_' + id]);
    const ok = l.handle ? await l.handle.reply(id, answer, why === 'timeout' ? 'Sem resposta do jogador a tempo.' : undefined) : false;
    push(l, { type: 'approval_done', id, reply: answer, by: why === 'timeout' ? 'timeout' : 'player' });
    if (!l.approvals.size && l.task.status === 'waiting') setStatus(l, 'running');
    return ok;
  }

  function stop(l, reason, by) {
    if (l.stopReason) return;
    l.stopReason = reason;
    l.stopBy = by || 'limit';
    push(l, { type: 'stopping', message: reason });
    if (l.task.status === 'queued') {
      const i = queue.indexOf(l.task.id);
      if (i >= 0) queue.splice(i, 1);
      finish(l, by === 'player' ? 'aborted' : 'failed', { error: reason });
      return;
    }
    if (l.handle) l.handle.abort(reason);
  }

  // start whatever fits (per-player and gateway-wide limits)
  function pump() {
    for (let i = 0; i < queue.length && runningAll() < cfg.maxParallel; i++) {
      const l = live.get(queue[i]);
      if (!l) { queue.splice(i--, 1); continue; }
      if (runningOf(l.uid) >= l.task.limits.concurrent) continue;
      queue.splice(i--, 1);
      run(l);
    }
  }

  return {
    async create(user, body) {
      const agent = agents.get(typeof body.agent === 'string' ? body.agent : 'opencode');
      if (!agent || !agent.available) throw new HttpError(400, 'agent_unavailable', 'Esse agente ainda não está disponível.');
      const emp = body.employee && typeof body.employee === 'object' ? body.employee : {};
      if (typeof emp.id !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(emp.id)) throw new HttpError(400, 'bad_employee', 'Funcionário inválido.');
      const employee = { id: emp.id, name: String(emp.name || 'Funcionário').replace(/[\u0000-\u001f<>]/g, '').slice(0, 40) || 'Funcionário', role: String(emp.role || '').replace(/[\u0000-\u001f<>]/g, '').slice(0, 40) };
      const model = typeof body.model === 'string' ? body.model : cfg.defaultModel;
      if (!modelAllowed(model, cfg) || (agent.id === 'mock') !== model.startsWith('mock/')) throw new HttpError(400, 'model_not_allowed', 'Modelo não permitido neste servidor.');
      const prompt = checkPrompt(body.prompt, cfg);
      const { limits } = await settingsOf(user.id);
      const usage = await store.getUsage(user.id);
      if (usage.tasks >= limits.dailyTasks) throw new HttpError(429, 'daily_limit', 'Limite de ' + limits.dailyTasks + ' tarefas por dia atingido.');
      if (usage.costUsd > 0 && usage.costUsd >= limits.dailyCostUsd) throw new HttpError(429, 'cost_limit', 'Limite de custo diário atingido.');
      const pending = [...live.values()].filter((l) => l.uid === user.id).length;
      if (pending >= limits.concurrent + 3) throw new HttpError(429, 'queue_full', 'Muitas tarefas na fila. Espere alguma terminar.');
      if ([...live.values()].some((l) => l.uid === user.id && l.task.employee.id === employee.id)) throw new HttpError(409, 'employee_busy', employee.name + ' já está executando uma tarefa.');
      const task = {
        id: store.newTaskId(), employee, agent: agent.id, model, prompt, status: 'queued', createdAt: Date.now(), limits,
        usage: { tokens: 0, costUsd: 0, steps: 0 }, events: [], seq: 0, result: null, error: null,
      };
      await store.addUsage(user.id, { tasks: 1 });
      const l = { task, uid: user.id, handle: null, subs: new Set(), timers: {}, secrets: [], approvals: new Set(), dayCost: usage.costUsd };
      live.set(task.id, l);
      push(l, { type: 'status', state: 'queued' });
      await persist(l, true);
      queue.push(task.id);
      pump();
      return summary(task);
    },

    async get(user, id) {
      const l = live.get(id);
      if (l && l.uid === user.id) return l.task;
      const t = await store.getTask(user.id, id);
      if (!t) throw new HttpError(404, 'task_not_found', 'Tarefa não encontrada.');
      // a task that was running when the gateway restarted
      if (ACTIVE.has(t.status)) { t.status = 'failed'; t.error = 'O servidor de agentes reiniciou durante a tarefa.'; t.endedAt = t.endedAt || Date.now(); await store.putTask(user.id, t); }
      return t;
    },

    async list(user, employee) {
      const tasks = await store.listTasks(user.id, { employee, limit: 50 });
      return tasks.map((t) => { const l = live.get(t.id); return summary(l && l.uid === user.id ? l.task : ACTIVE.has(t.status) ? { ...t, status: 'failed', error: 'O servidor de agentes reiniciou durante a tarefa.' } : t); });
    },

    async abort(user, id) {
      const l = live.get(id);
      if (!l || l.uid !== user.id) throw new HttpError(409, 'not_running', 'A tarefa não está em execução.');
      stop(l, 'Interrompida pelo jogador', 'player');
      return { ok: true };
    },

    async approve(user, id, approvalId, answer) {
      const l = live.get(id);
      if (!l || l.uid !== user.id) throw new HttpError(409, 'not_running', 'A tarefa não está em execução.');
      if (!(await reply(l, approvalId, answer === 'once' ? 'once' : 'reject'))) throw new HttpError(404, 'approval_not_found', 'Esse pedido de aprovação já foi respondido.');
      return { ok: true };
    },

    // follow a task: past events after `after`, then live ones; fn(null) = the task ended
    subscribe(user, id, after, fn) {
      const l = live.get(id);
      if (!l || l.uid !== user.id) return null;
      for (const e of l.task.events) if (e.seq > after) fn(e);
      l.subs.add(fn);
      return () => l.subs.delete(fn);
    },

    settingsOf,
    async putSettings(user, body) {
      const cur = await store.getSettings(user.id);
      const next = { ...cur };
      if (body.limits) next.limits = clampLimits({ ...clampLimits(cur.limits, cfg), ...body.limits }, cfg);
      await store.putSettings(user.id, next);
      return settingsOf(user.id);
    },

    // the employee's workspace: what the agent produced
    async files(user, employeeId) {
      const root = store.workspaceOf(user.id, employeeId);
      const out = [];
      async function walk(dir, depth) {
        if (depth > 5 || out.length >= 300) return;
        let ents = [];
        try { ents = await fs.readdir(dir, { withFileTypes: true }); } catch { return; }
        for (const e of ents) {
          if (out.length >= 300) return;
          if (e.name === '.git' || e.name === 'node_modules' || e.isSymbolicLink()) continue;
          const full = path.join(dir, e.name);
          const rel = path.relative(root, full).replace(/\\/g, '/');
          if (e.isDirectory()) await walk(full, depth + 1);
          else if (e.isFile()) { const st = await fs.stat(full); out.push({ path: rel, size: st.size, mtime: st.mtimeMs }); }
        }
      }
      await walk(root, 0);
      return out.sort((a, b) => b.mtime - a.mtime);
    },

    async readFile(user, employeeId, rel) {
      const root = path.resolve(store.workspaceOf(user.id, employeeId));
      if (typeof rel !== 'string' || !rel || rel.length > 300 || rel.includes('\0')) throw new HttpError(400, 'bad_path', 'Caminho inválido.');
      const full = path.resolve(root, rel);
      if (full !== root && !full.startsWith(root + path.sep)) throw new HttpError(403, 'outside_workspace', 'Fora do espaço de trabalho.');
      let real;
      try { real = await fs.realpath(full); } catch { throw new HttpError(404, 'file_not_found', 'Arquivo não encontrado.'); }
      const realRoot = await fs.realpath(root).catch(() => root);
      if (!real.startsWith(realRoot + path.sep)) throw new HttpError(403, 'outside_workspace', 'Fora do espaço de trabalho.');
      const st = await fs.stat(real);
      if (!st.isFile()) throw new HttpError(404, 'file_not_found', 'Arquivo não encontrado.');
      if (st.size > 256 * 1024) throw new HttpError(413, 'file_too_large', 'Arquivo grande demais para visualizar (máx. 256 KB).');
      const buf = await fs.readFile(real);
      if (buf.includes(0)) throw new HttpError(415, 'binary_file', 'Arquivo binário: não dá para visualizar.');
      return { path: rel.replace(/\\/g, '/'), size: st.size, content: createRedactor(baseSecrets)(buf.toString('utf8')) };
    },

    get running() { return live.size; },
  };
}
