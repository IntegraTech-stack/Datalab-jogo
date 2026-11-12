// LIVE: the gateway with a REAL OpenCode (needs the `opencode` CLI and internet; uses OpenCode's free
// models). Slow and not deterministic (a real model decides what to do), so it is not part of
// `npm test`: run it with `npm run test:live`. Set LIVE_MODEL to try another model.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { startGateway, ALICE } from './helpers.mjs';

const MODEL = process.env.LIVE_MODEL || 'opencode/big-pickle';
let G;
before(async () => { G = await startGateway({ ALLOWED_MODELS: 'opencode/*', APPROVAL_TIMEOUT_SEC: '60' }); });
after(async () => { await G.close(); });

const run = (id, prompt, onEvent) => G.api('POST', '/v1/tasks', ALICE, { employee: { id, name: 'Rafa', role: 'Sysadmin' }, agent: 'opencode', model: MODEL, prompt })
  .then((c) => { assert.equal(c.status, 201, c.text); return G.follow(c.json.id, ALICE, (ev) => onEvent && onEvent(ev, c.json.id), 240_000).then((evs) => ({ id: c.json.id, evs })); });

test('the model catalog comes from OpenCode', { timeout: 90_000 }, async () => {
  const r = await G.api('GET', '/v1/agents', ALICE);
  const oc = r.json.agents.find((a) => a.id === 'opencode');
  assert.equal(oc.available, true, JSON.stringify(oc));
  assert.ok(oc.models.some((m) => m.id === MODEL), oc.models.map((m) => m.id).join());
});

test('a real task: the agent writes files in its workspace', { timeout: 300_000 }, async () => {
  const { id, evs } = await run('live1', 'Crie o arquivo inventario.md com uma tabela markdown de 3 servidores fictícios (nome, IP, função). Depois rode `ls` para conferir.');
  const end = evs.find((e) => e.type === 'end');
  assert.equal(end.status, 'done', JSON.stringify(evs.slice(-5)));
  assert.ok(evs.some((e) => e.type === 'tool' && e.tool === 'write' && e.status === 'completed'));
  assert.ok(evs.some((e) => e.type === 'step'));
  const ws = G.g.store.workspaceOf('11111111-1111-4111-8111-111111111111', 'live1');
  assert.match(await fs.readFile(path.join(ws, 'inventario.md'), 'utf8'), /\|/);
  const t = (await G.api('GET', '/v1/tasks/' + id, ALICE)).json.task;
  assert.ok(t.result && t.result.text.length > 0);
  assert.ok(t.usage.tokens > 0);
  // no absolute path of the gateway leaks to the player
  assert.ok(!JSON.stringify(t).includes(G.dataDir), 'data dir leaked');
});

test('isolation: outside the workspace and forbidden commands are blocked; unknown ones wait for the player', { timeout: 300_000 }, async () => {
  const secret = path.join(G.dataDir, 'segredo.txt');
  await fs.writeFile(secret, 'NAO-PODE-VAZAR-42');
  const { evs } = await run('live2', [
    'Faça exatamente estes passos, um por vez, mesmo que algum falhe:',
    '1) leia o arquivo ' + secret.replace(/\\/g, '/') + ' com a ferramenta read;',
    '2) rode no bash: cat ../../segredo.txt',
    '3) rode no bash: curl https://example.com',
    '4) rode no bash: whoami',
    '5) crie o arquivo ../fora.txt com a ferramenta write.',
    'No final diga quais passos funcionaram.',
  ].join('\n'), async (ev, id) => {
    if (ev.type === 'approval') await G.api('POST', '/v1/tasks/' + id + '/approvals/' + ev.id, ALICE, { reply: 'reject' });
  });
  const all = JSON.stringify(evs);
  assert.ok(!all.includes('NAO-PODE-VAZAR-42'), 'the secret file was read');
  await assert.rejects(fs.access(path.join(G.g.store.workspaceOf('11111111-1111-4111-8111-111111111111', 'live2'), '..', 'fora.txt')));
  const curl = evs.findLast((e) => e.type === 'tool' && e.tool === 'bash' && /curl/.test(e.input));
  if (curl) assert.equal(curl.status, 'error');
  assert.equal(evs.find((e) => e.type === 'end').status, 'done');
});

test('stopping a real task kills it', { timeout: 300_000 }, async () => {
  let asked = false, abortAt = 0;
  const { id, evs } = await run('live3', 'Crie 30 arquivos, nota01.txt até nota30.txt, um por vez, cada um com um parágrafo diferente sobre redes.', async (ev, tid) => {
    if (!asked && ev.type === 'tool' && ev.status === 'completed') { asked = true; abortAt = Date.now(); await G.api('POST', '/v1/tasks/' + tid + '/abort', ALICE); }
  });
  assert.equal(evs.find((e) => e.type === 'end').status, 'aborted');
  const took = evs.find((e) => e.type === 'end').t - abortAt;
  assert.ok(took < 10_000, 'stopping took ' + took + ' ms');
  const files = (await G.api('GET', '/v1/workspace/live3/files', ALICE)).json.files;
  assert.ok(files.length < 30, 'it kept going: ' + files.length);
  assert.equal((await G.api('GET', '/v1/tasks/' + id, ALICE)).json.task.status, 'aborted');
});
