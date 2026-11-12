// The gateway end to end over HTTP, with the scripted agent (AGENT_MOCK=1) and a fake Supabase Auth:
// login, CORS, live progress, results, history, workspace files, approvals, stopping, limits,
// secrets and isolation between players.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startGateway, ALICE, BOB, ORIGIN } from './helpers.mjs';

let G;
const emp = (id = 'ana1') => ({ id, name: 'Ana', role: 'Sysadmin' });
const task = (prompt, extra = {}) => ({ employee: emp(extra.emp), agent: 'mock', model: 'mock/fast', prompt, ...extra.body });

before(async () => { G = await startGateway({ AGENT_MOCK: '1', ALLOWED_MODELS: 'opencode/*,mock/*', APPROVAL_TIMEOUT_SEC: '2', CAP_DAILY_TASKS: '12' }); });
after(async () => { await G.close(); });

test('health is public; everything else needs a valid Supabase session', async () => {
  assert.equal((await G.api('GET', '/v1/health')).status, 200);
  assert.equal((await G.api('GET', '/v1/settings')).status, 401);
  assert.equal((await G.api('GET', '/v1/settings', 'token-invalid-xxxxxxxxxxxxxxxx')).status, 401);
  assert.equal((await G.api('GET', '/v1/settings', ALICE)).status, 200);
});

test('CORS: allowed origin gets the header, other sites are refused', async () => {
  const ok = await G.api('OPTIONS', '/v1/tasks', null, null, { origin: ORIGIN });
  assert.equal(ok.headers.get('access-control-allow-origin'), ORIGIN);
  const evil = await G.api('GET', '/v1/settings', ALICE, null, { origin: 'https://evil.example' });
  assert.equal(evil.status, 403);
  assert.equal(evil.headers.get('access-control-allow-origin'), null);
});

test('agents list: OpenCode-shaped catalog, planned agents are unavailable', async () => {
  const r = await G.api('GET', '/v1/agents', ALICE);
  assert.equal(r.status, 200);
  const ids = r.json.agents.map((a) => a.id);
  assert.ok(ids.includes('opencode') && ids.includes('claude-code') && ids.includes('codex') && ids.includes('mock'));
  assert.equal(r.json.agents.find((a) => a.id === 'codex').available, false);
  assert.equal(r.json.agents.find((a) => a.id === 'mock').models[0].id, 'mock/fast');
  const bad = await G.api('POST', '/v1/tasks', ALICE, { employee: emp('x1'), agent: 'codex', model: 'mock/fast', prompt: 'oi' });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error, 'agent_unavailable');
});

test('a task runs, streams progress, produces a file and lands in the history', async () => {
  const c = await G.api('POST', '/v1/tasks', ALICE, task('Escreva um relatório'));
  assert.equal(c.status, 201);
  const evs = await G.follow(c.json.id, ALICE);
  const types = evs.map((e) => e.type);
  for (const t of ['status', 'step', 'tool', 'file', 'usage', 'text', 'end']) assert.ok(types.includes(t), 'missing ' + t + ' in ' + types);
  assert.deepEqual(evs.filter((e) => e.type === 'status').map((e) => e.state).slice(0, 3), ['queued', 'starting', 'running']);
  const end = evs.find((e) => e.type === 'end');
  assert.equal(end.status, 'done');
  assert.match(end.result.text, /resultado\.txt/);
  // secrets the agent printed never reach the player
  assert.ok(!JSON.stringify(evs).includes('mock-secret-value-123'));
  assert.ok(JSON.stringify(evs).includes('[segredo removido]'));
  const full = await G.api('GET', '/v1/tasks/' + c.json.id, ALICE);
  assert.equal(full.json.task.status, 'done');
  assert.ok(full.json.task.events.length > 3);
  const hist = await G.api('GET', '/v1/tasks?employee=ana1', ALICE);
  assert.ok(hist.json.tasks.some((t) => t.id === c.json.id && t.status === 'done'));
  const files = await G.api('GET', '/v1/workspace/ana1/files', ALICE);
  assert.ok(files.json.files.some((f) => f.path === 'resultado.txt'));
  const f = await G.api('GET', '/v1/workspace/ana1/file?path=resultado.txt', ALICE);
  assert.match(f.json.content, /Escreva um relatório/);
});

test('workspace files: no way out of the folder', async () => {
  for (const p of ['../../settings.json', '..\\..\\x', '/etc/passwd', 'C:\\Windows\\win.ini', '%2e%2e/x']) {
    const r = await G.api('GET', '/v1/workspace/ana1/file?path=' + encodeURIComponent(p), ALICE);
    assert.ok([403, 404, 400].includes(r.status), p + ' → ' + r.status);
  }
  assert.equal((await G.api('GET', '/v1/workspace/..%2F..%2Fx/files', ALICE)).status, 404);
});

test('another player sees nothing of Alice', async () => {
  const hist = await G.api('GET', '/v1/tasks', ALICE);
  const id = hist.json.tasks[0].id;
  assert.equal((await G.api('GET', '/v1/tasks/' + id, BOB)).status, 404);
  assert.equal((await G.api('GET', '/v1/tasks', BOB)).json.tasks.length, 0);
  assert.equal((await G.api('GET', '/v1/workspace/ana1/files', BOB)).json.files.length, 0);
  assert.equal((await G.api('POST', '/v1/tasks/' + id + '/abort', BOB)).status, 409);
});

test('approval: the player approves a command', async () => {
  const c = await G.api('POST', '/v1/tasks', ALICE, task('aprovar este comando', { emp: 'ap1' }));
  const evs = await G.follow(c.json.id, ALICE, async (ev) => {
    if (ev.type === 'approval') assert.equal((await G.api('POST', '/v1/tasks/' + c.json.id + '/approvals/' + ev.id, ALICE, { reply: 'once' })).status, 200);
  });
  assert.ok(evs.some((e) => e.type === 'status' && e.state === 'waiting'));
  assert.ok(evs.some((e) => e.type === 'approval_done' && e.reply === 'once'));
  assert.ok(evs.some((e) => e.type === 'tool' && e.tool === 'bash' && e.status === 'completed'));
  assert.equal(evs.find((e) => e.type === 'end').status, 'done');
});

test('approval: no answer in time = refused', async () => {
  const c = await G.api('POST', '/v1/tasks', ALICE, task('aprovar e esperar', { emp: 'ap2' }));
  const evs = await G.follow(c.json.id, ALICE);
  const d = evs.find((e) => e.type === 'approval_done');
  assert.equal(d.reply, 'reject');
  assert.equal(d.by, 'timeout');
  assert.ok(evs.some((e) => e.type === 'tool' && e.tool === 'bash' && e.status === 'error'));
});

test('the player stops a running task', async () => {
  const c = await G.api('POST', '/v1/tasks', ALICE, task('demorar bastante', { emp: 'st1' }));
  const evs = await G.follow(c.json.id, ALICE, async (ev) => {
    if (ev.type === 'file') assert.equal((await G.api('POST', '/v1/tasks/' + c.json.id + '/abort', ALICE)).status, 200);
  });
  const end = evs.find((e) => e.type === 'end');
  assert.equal(end.status, 'aborted');
  const t = (await G.api('GET', '/v1/tasks/' + c.json.id, ALICE)).json.task;
  assert.equal(t.error, 'Interrompida pelo jogador');
});

test('limits: steps per task (server side) and the same employee twice', async () => {
  assert.equal((await G.api('PUT', '/v1/settings', ALICE, { limits: { maxSteps: 5 } })).json.limits.maxSteps, 5);
  const c = await G.api('POST', '/v1/tasks', ALICE, task('gastar passos', { emp: 'lm1' }));
  const twice = await G.api('POST', '/v1/tasks', ALICE, task('outra', { emp: 'lm1' }));
  assert.equal(twice.status, 409);
  const evs = await G.follow(c.json.id, ALICE);
  const end = evs.find((e) => e.type === 'end');
  assert.equal(end.status, 'failed');
  assert.match((await G.api('GET', '/v1/tasks/' + c.json.id, ALICE)).json.task.error, /5 passos/);
  await G.api('PUT', '/v1/settings', ALICE, { limits: { maxSteps: 25 } });
});

test('limits: player settings never exceed the caps; tasks per day', async () => {
  const s = await G.api('PUT', '/v1/settings', BOB, { limits: { dailyTasks: 5000, shell: 'scripts', maxMinutes: 9999 } });
  assert.equal(s.json.limits.dailyTasks, 12);
  assert.equal(s.json.limits.shell, 'files');
  assert.equal(s.json.limits.maxMinutes, 15);
  await G.api('PUT', '/v1/settings', BOB, { limits: { dailyTasks: 2 } });
  for (const id of ['d1', 'd2']) { const c = await G.api('POST', '/v1/tasks', BOB, task('ok', { emp: id })); assert.equal(c.status, 201); await G.follow(c.json.id, BOB); }
  const third = await G.api('POST', '/v1/tasks', BOB, task('ok', { emp: 'd3' }));
  assert.equal(third.status, 429);
  assert.equal(third.json.error, 'daily_limit');
  assert.equal((await G.api('GET', '/v1/settings', BOB)).json.usage.tasks, 2);
});

test('validation: model allow-list, prompt size, employee id', async () => {
  assert.equal((await G.api('POST', '/v1/tasks', ALICE, { ...task('x', { emp: 'v1' }), model: 'evil/model' })).json.error, 'model_not_allowed');
  assert.equal((await G.api('POST', '/v1/tasks', ALICE, { ...task('x', { emp: 'v1' }), agent: 'mock', model: 'opencode/big-pickle' })).json.error, 'model_not_allowed');
  assert.equal((await G.api('POST', '/v1/tasks', ALICE, task('x'.repeat(5000), { emp: 'v1' }))).status, 413);
  assert.equal((await G.api('POST', '/v1/tasks', ALICE, { ...task('x'), employee: { id: '../../etc', name: 'x' } })).json.error, 'bad_employee');
});
