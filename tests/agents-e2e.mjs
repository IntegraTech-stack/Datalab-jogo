// DataLab · browser E2E for the crew AI (agents.js + the Agent Gateway): the real jogo.html in headless Chrome,
// the real gateway (scripted mock agent; add --live for a real OpenCode task), a fake Supabase session that the
// gateway checks against a fake Auth server. Usage: node tests/agents-e2e.mjs [--live]  (CHROME=path to override)
// Screenshots go to the OS temp folder (dl-agents-e2e/).
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { pathToFileURL, fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(os.tmpdir(), 'dl-agents-e2e');
await fs.mkdir(OUT, { recursive: true });
const SITE_PORT = 5510, CDP_PORT = 9333;
const TOKEN = 'token-alice-aaaaaaaaaaaaaaaaaaaa';
const UID = '11111111-1111-4111-8111-111111111111';
const LIVE = process.argv.includes('--live');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log('[e2e]', ...a);
const results = [];
const check = (name, ok, extra) => { results.push({ name, ok: !!ok }); console.log((ok ? '  ✔ ' : '  ✖ ') + name + (extra ? ' · ' + extra : '')); };

// --- static site ---
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };
const site = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  const f = path.join(REPO, decodeURIComponent(u.pathname));
  if (!f.startsWith(path.resolve(REPO))) { res.writeHead(403); res.end(); return; }
  try { const b = await fs.readFile(f); res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(b); } catch { res.writeHead(404); res.end(); }
});
await new Promise((r) => site.listen(SITE_PORT, '127.0.0.1', r));

// --- fake Supabase Auth ---
const auth = http.createServer((req, res) => {
  const ok = req.url === '/auth/v1/user' && req.headers.authorization === 'Bearer ' + TOKEN;
  res.writeHead(ok ? 200 : 401, { 'content-type': 'application/json' });
  res.end(ok ? JSON.stringify({ id: UID, email: 'alice@test' }) : '{}');
});
await new Promise((r) => auth.listen(0, '127.0.0.1', r));

// --- gateway (the real one, from the repo) ---
const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'dl-e2e-'));
const { createGateway } = await import(pathToFileURL(path.join(REPO, 'agents', 'src', 'server.mjs')).href);
const gw = await createGateway({ PORT: '8787', HOST: '127.0.0.1', AGENT_DATA_DIR: dataDir, SUPABASE_URL: 'http://127.0.0.1:' + auth.address().port, SUPABASE_ANON_KEY: 'anon-key-public',
  ALLOWED_ORIGINS: 'http://localhost:' + SITE_PORT, AGENT_MOCK: '1', ALLOWED_MODELS: 'opencode/*,mock/*', APPROVAL_TIMEOUT_SEC: '60' });
await gw.listen();
log('gateway on 8787, data', dataDir);

// --- Chrome ---
const profile = await fs.mkdtemp(path.join(os.tmpdir(), 'dl-chrome-'));
const chrome = spawn(process.env.CHROME || 'C:/Program Files/Google/Chrome/Application/chrome.exe', ['--headless=new', '--remote-debugging-port=' + CDP_PORT, '--user-data-dir=' + profile, '--window-size=1440,900', '--no-first-run', '--no-default-browser-check', 'about:blank'], { stdio: 'ignore' });
let wsUrl = null;
for (let i = 0; i < 50 && !wsUrl; i++) { try { const l = await (await fetch('http://127.0.0.1:' + CDP_PORT + '/json/list')).json(); const p = l.find((t) => t.type === 'page'); if (p) wsUrl = p.webSocketDebuggerUrl; } catch { /* starting */ } await sleep(200); }
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let seq = 0;
const pending = new Map();
const consoleErrors = [];
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) { const p = pending.get(msg.id); pending.delete(msg.id); msg.error ? p.rej(new Error(JSON.stringify(msg.error))) : p.res(msg.result); }
  if (msg.method === 'Runtime.exceptionThrown') consoleErrors.push(msg.params.exceptionDetails.exception ? msg.params.exceptionDetails.exception.description : msg.params.exceptionDetails.text);
  if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') consoleErrors.push(msg.params.args.map((a) => a.value || a.description).join(' '));
});
const cdp = (method, params = {}) => new Promise((res, rej) => { const id = ++seq; pending.set(id, { res, rej }); ws.send(JSON.stringify({ id, method, params })); });
const ev = async (expr) => { const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception ? r.exceptionDetails.exception.description : r.exceptionDetails.text); return r.result.value; };
const waitFor = async (expr, ms = 20000, what) => { const t0 = Date.now(); for (;;) { const v = await ev(expr).catch(() => null); if (v) return v; if (Date.now() - t0 > ms) throw new Error('timeout: ' + (what || expr)); await sleep(200); } };
const shot = async (name) => { const r = await cdp('Page.captureScreenshot', { format: 'png' }); await fs.writeFile(path.join(OUT, name + '.png'), Buffer.from(r.data, 'base64')); };
await cdp('Runtime.enable');
await cdp('Page.enable');

// fake Supabase client in the page (cloud.js skips the CDN when window.supabase exists)
await cdp('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
  // the crew AI is off by default (config.js crewAI): this test turns it on
  let cfg; Object.defineProperty(window, 'DATALAB_CONFIG', { configurable: true, get: () => cfg, set: (v) => { cfg = Object.assign({}, v, { crewAI: true }); } });
  const session = { access_token: '${TOKEN}', user: { id: '${UID}', email: 'alice@test' } };
  const any = () => { const p = new Proxy(function () {}, { get: (t, k) => k === 'then' ? (res) => res({ data: null, error: null }) : p, apply: () => p }); return p; };
  const authBase = { getSession: async () => ({ data: { session } }), getUser: async () => ({ data: { user: session.user }, error: null }),
    onAuthStateChange: (cb) => { setTimeout(() => cb('SIGNED_IN', session), 0); return { data: { subscription: { unsubscribe() {} } } }; } };
  const authP = new Proxy(authBase, { get: (t, k) => (k in t ? t[k] : async () => ({ data: {}, error: null })) });
  window.supabase = { createClient: () => ({ auth: authP, functions: { invoke: async () => ({ data: null, error: { context: { status: 503, json: async () => ({ error: 'offline', message: 'offline (teste)' }) } } }) },
    from: () => any(), channel: () => any(), removeChannel() {}, rpc: async () => ({ data: null, error: null }) }) };
})();` });

async function bootGame(query) {
  await cdp('Page.navigate', { url: 'http://localhost:' + SITE_PORT + '/jogo.html?dev=0' + (query || '') });
  await waitFor('!!(window.DataLabDemo && window.DataLabDemo.game && window.DL && DL.Cloud && DL.Cloud.signedIn)', 30000, 'game + session');
  await ev(`(() => { const a = document.getElementById('auth'); if (a) { a.classList.remove('is-open'); a.hidden = true; }
    const t = document.getElementById('title'); if (t) t.hidden = true; const g = document.getElementById('game'); if (g) g.classList.remove('is-title');
    const D = window.DataLabDemo; D.scene.o.attract = false; D.choosePreset('office'); D.begin(false); D.setMode('explore'); return true; })()`);
  await sleep(800);
}

try {
  await bootGame('&aimock=1');
  check('game boots with the crew AI module', await ev('!!(DataLabDemo.game.agents && DataLabDemo.game.agents.enabled)'));
  // the top bar button is always on screen
  check('top bar shows "IA da equipe"', await ev(`(() => { const b = document.getElementById('aiBtn'); const r = b && b.getBoundingClientRect(); return !!r && r.width > 0 && r.top >= 0 && r.bottom <= innerHeight && getComputedStyle(b).visibility !== 'hidden'; })()`));
  await ev(`(() => { DataLabDemo.crew.clearAll(); DataLabDemo.crew.select(null); document.getElementById('aiBtn').click(); })()`);
  await waitFor(`document.getElementById('agentsOv').classList.contains('is-open') && document.getElementById('agentsBody').innerText.includes('Ninguém contratado')`, 5000, 'empty team picker');
  check('with no team, the panel says how to hire', true);
  await shot('00-topbar-empty');
  await ev('DataLabDemo.game.agents.close()');
  // without a gateway the panel explains how to turn it on
  await ev(`(() => { window.__svcEnabled = Object.getOwnPropertyDescriptor(DL.AgentService, 'enabled'); Object.defineProperty(DL.AgentService, 'enabled', { get: () => false, configurable: true }); document.getElementById('aiBtn').click(); })()`);
  await waitFor(`document.getElementById('agentsBody').innerText.includes('ainda não está ligada')`, 5000, 'setup help');
  check('without a gateway the button still shows and explains the setup', true);
  await shot('00-setup');
  await ev(`(() => { Object.defineProperty(DL.AgentService, 'enabled', window.__svcEnabled); DataLabDemo.game.agents.close(); })()`);
  // picking from the list opens that employee
  await ev(`(() => { const D = DataLabDemo; window.__p = D.crew.api.hire(Object.assign(D.crew.api.randomProfile(), { role: 'redes', name: 'Duda' }), { free: true, silent: true }); D.crew.select(null); document.getElementById('aiBtn').click(); })()`);
  await waitFor(`!!document.querySelector('#agentsBody [data-ai-pick]')`, 5000, 'team list');
  await ev(`document.querySelector('#agentsBody [data-ai-pick]').click()`);
  check('picking an employee from the list opens their AI panel', await waitFor(`document.getElementById('agentsTitle') && document.getElementById('agentsTitle').textContent.includes('Duda')`, 5000, 'Duda panel'));
  await ev('DataLabDemo.game.agents.close()');
  // hire someone and open their card
  await ev(`(() => { const D = DataLabDemo; D.crew.clearAll(); const a = D.crew.api.hire(Object.assign(D.crew.api.randomProfile(), { role: 'sysadmin', name: 'Rafa' }), { free: true, silent: true }); window.__a = a; D.crew.select(a); return a.crew.name; })()`);
  await waitFor(`!!document.querySelector('#crewCard [data-cc="ai"]')`, 5000, 'IA button on the card');
  check('employee card shows the IA button', true);
  check('the other card actions are still there', await ev(`['talk','assign','edit','fire'].every((k) => document.querySelector('#crewCard [data-cc="' + k + '"]'))`));
  await ev(`document.querySelector('#crewCard [data-cc="ai"]').click()`);
  await waitFor(`document.getElementById('agentsOv').classList.contains('is-open') && !!document.querySelector('#agentsBody select[data-ai="agent"]')`, 30000, 'panel + catalog');
  check('panel opens and loads agents from the gateway', true);
  const agentsOpts = await ev(`Array.from(document.querySelectorAll('#agentsBody select[data-ai="agent"] option')).map((o) => o.value + (o.disabled ? ':off' : ':on')).join(',')`);
  check('OpenCode available, Claude Code / Codex listed as coming soon', /opencode:on/.test(agentsOpts) && /claude-code:off/.test(agentsOpts) && /codex:off/.test(agentsOpts), agentsOpts);
  const models = await ev(`Array.from(document.querySelectorAll('#agentsBody select[data-ai="model"] option')).map((o) => o.value).join(',')`);
  check('OpenCode models listed for selection', /opencode\/big-pickle/.test(models), models.slice(0, 120));
  await shot('01-panel');

  // --- mock agent: approval + stop ---
  await ev(`(() => { const s = document.querySelector('#agentsBody select[data-ai="agent"]'); s.value = 'mock'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await waitFor(`document.querySelector('#agentsBody select[data-ai="model"]').value === 'mock/fast'`, 5000, 'mock model');
  await ev(`(() => { const t = document.querySelector('#agentsBody textarea[data-ai="prompt"]'); t.value = 'aprovar um comando e depois demorar'; t.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#agentsBody [data-ai-act="send"]').click(); })()`);
  await waitFor(`!!document.querySelector('#agentsBody [data-ai-ap="once"]')`, 15000, 'approval buttons');
  check('approval request appears with Aprovar / Recusar', true);
  check('employee asked in the team chat', await ev(`document.body.innerText.includes('Preciso da sua aprovação')`));
  check('employee works at a computer while the agent runs', await waitFor(`(() => { const s = DataLabDemo.crew.statusOf(window.__a); return /tarefa de IA|Aguardando|Indo até/i.test(s) ? s : null; })()`, 15000, 'status'), await ev('DataLabDemo.crew.statusOf(window.__a)'));
  check('card shows the agent is waiting for approval', await waitFor(`(() => { const b = document.querySelector('#crewCard [data-cc="ai"]'); return b && /aprovar/.test(b.textContent); })()`, 8000, 'badge'));
  await shot('02-approval');
  await ev(`document.querySelector('#agentsBody [data-ai-ap="once"]').click()`);
  await waitFor(`document.querySelector('#agentsBody').innerText.includes('Comando aprovado')`, 10000, 'approved');
  check('approving resumes the agent', true);
  await ev(`document.querySelector('#agentsBody [data-ai-act="abort"]').click()`);
  await waitFor(`document.querySelector('#agentsBody').innerText.includes('Interrompida')`, 15000, 'aborted');
  check('Parar interrupts the execution', true);
  await shot('03-aborted');

  // --- mock agent: a complete task with a result and a file ---
  await waitFor(`!!document.querySelector('#agentsBody textarea[data-ai="prompt"]')`, 8000, 'prompt back');
  await ev(`(() => { const t = document.querySelector('#agentsBody textarea[data-ai="prompt"]'); t.value = 'Escreva o relatório do turno'; document.querySelector('#agentsBody [data-ai-act="send"]').click(); })()`);
  await waitFor(`document.querySelector('#agentsBody .ai-result') && document.querySelector('#agentsBody').innerText.includes('resultado.txt')`, 20000, 'result');
  check('result and delivered files are shown', true);
  check('employee reported the result in the team chat', await waitFor(`document.body.innerText.includes('Tarefa de IA concluída')`, 10000, 'chat report'));
  check('the secret printed by the agent never reached the page', !(await ev(`document.documentElement.innerHTML.includes('mock-secret-value-123')`)));
  await ev(`document.querySelector('#agentsBody [data-ai-file="resultado.txt"]').click()`);
  await waitFor(`(document.querySelector('#agentsBody .ai-pre') || {}).textContent && document.querySelector('#agentsBody .ai-pre').textContent.includes('relatório do turno')`, 10000, 'file content');
  check('a produced file opens in the panel', true);
  await shot('04-file');
  await ev(`document.querySelector('#agentsBody [data-ai-act="unfile"]').click()`);
  check('the prompt box is empty after sending', await ev(`document.querySelector('#agentsBody textarea[data-ai="prompt"]').value === ''`));

  // --- history ---
  await ev(`document.querySelector('#agentsBody [data-ai-tab="history"]').click()`);
  await waitFor(`document.querySelectorAll('#agentsBody .ai-hrow').length >= 2`, 10000, 'history rows');
  check('history lists the tasks', true, await ev(`document.querySelectorAll('#agentsBody .ai-hrow').length + ' row(s)'`));
  await ev(`document.querySelector('#agentsBody .ai-hrow').click()`);
  await waitFor(`!!document.querySelector('#agentsBody .ai-steps')`, 10000, 'task detail');
  check('a past task opens with its step-by-step', true);
  await shot('05-history');

  // --- settings / limits ---
  await ev(`document.querySelector('#agentsBody [data-ai-tab="settings"]').click()`);
  await waitFor(`!!document.querySelector('#agentsBody [data-lim="dailyTasks"]')`, 10000, 'settings');
  check('scripts level is locked outside the container', await ev(`document.querySelector('#agentsBody [data-lim="shell"] option[value="scripts"]').disabled`));
  await ev(`(() => { const i = document.querySelector('#agentsBody [data-lim="dailyTasks"]'); i.value = '999'; document.querySelector('#agentsBody [data-lim="maxSteps"]').value = '12'; document.querySelector('#agentsBody [data-ai-act="save"]').click(); })()`);
  await sleep(800);
  const s = await (await fetch('http://127.0.0.1:8787/v1/settings', { headers: { authorization: 'Bearer ' + TOKEN } })).json();
  check('limits saved on the server, clamped to the caps', s.limits.dailyTasks === 30 && s.limits.maxSteps === 12, JSON.stringify(s.limits));
  await shot('06-settings');

  // --- save keeps the employee's agent ---
  const snap = await ev(`JSON.stringify(DL.SaveService.serialize(DataLabDemo, 'x').crew.map((c) => c.ai))`);
  check('the save keeps the employee agent (crew[].ai)', /"agent":"mock"/.test(snap) && /"id":"e/.test(snap), snap);
  // Escape closes the panel; the game keys work again
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', code: 'Escape', key: 'Escape', windowsVirtualKeyCode: 27 });
  await sleep(200);
  check('Escape closes the panel', !(await ev(`document.getElementById('agentsOv').classList.contains('is-open')`)));

  // --- the old behaviour is untouched: an employee without AI still works as before ---
  await ev(`(() => { const D = DataLabDemo; window.__b = D.crew.api.hire(Object.assign(D.crew.api.randomProfile(), { role: 'redes', name: 'Bia' }), { free: true, silent: true }); return true; })()`);
  await ev('DataLabDemo.advance(20)');
  check('a regular employee keeps doing regular jobs', await ev(`(() => { const j = window.__b.crew.job; return !j || !j.def.ai; })()`), await ev('DataLabDemo.crew.statusOf(window.__b)'));

  // --- phone width: the panel fits ---
  await cdp('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 2, mobile: true });
  await ev(`(() => { DataLabDemo.crew.select(window.__a); document.querySelector('#crewCard [data-cc="ai"]').click(); })()`);
  await waitFor(`!!document.querySelector('#agentsBody .ai-lastwrap, #agentsBody textarea')`, 8000, 'mobile panel');
  await sleep(700);
  check('phone width: no horizontal overflow', await ev(`(() => { const c = document.querySelector('.card--agents'); return c.getBoundingClientRect().right <= innerWidth + 1 && document.getElementById('agentsBody').scrollWidth <= document.getElementById('agentsBody').clientWidth + 1; })()`));
  await shot('09-mobile');
  await cdp('Emulation.clearDeviceMetricsOverride');
  await ev(`DataLabDemo.game.agents.close()`);

  // --- reload while a task runs: the panel and the employee pick it up again ---
  const empId = await ev('window.__a.crew.ai.id');
  const started = await (await fetch('http://127.0.0.1:8787/v1/tasks', { method: 'POST', headers: { authorization: 'Bearer ' + TOKEN, 'content-type': 'application/json' }, body: JSON.stringify({ employee: { id: empId, name: 'Rafa', role: 'Sysadmin' }, agent: 'mock', model: 'mock/fast', prompt: 'demorar bastante' }) })).json();
  await bootGame('&aimock=1');
  await ev(`(() => { const D = DataLabDemo; D.crew.clearAll(); const a = D.crew.api.hire(Object.assign(D.crew.api.randomProfile(), { role: 'sysadmin', name: 'Rafa' }), { free: true, silent: true }); a.crew.ai = { id: '${empId}', agent: 'mock', model: null }; window.__a = a; D.crew.select(a); return true; })()`);
  check('after a reload the running task is followed again', await waitFor(`(() => { const b = document.querySelector('#crewCard [data-cc="ai"]'); return b && /rodando/.test(b.textContent); })()`, 10000, 'resume badge'));
  await ev(`document.querySelector('#crewCard [data-cc="ai"]').click()`);
  await waitFor(`!!document.querySelector('#agentsBody [data-ai-act="abort"]')`, 8000, 'live after reload');
  await ev(`document.querySelector('#agentsBody [data-ai-act="abort"]').click()`);
  await waitFor(`document.querySelector('#agentsBody').innerText.includes('Interrompida')`, 15000, 'aborted after reload');
  check('and it can still be stopped from the panel', (await (await fetch('http://127.0.0.1:8787/v1/tasks/' + started.id, { headers: { authorization: 'Bearer ' + TOKEN } })).json()).task.status === 'aborted');
  await ev('DataLabDemo.game.agents.close()');

  // --- REAL OpenCode through the UI ---
  if (LIVE) {
    await ev(`(() => { DataLabDemo.crew.select(window.__a); document.querySelector('#crewCard [data-cc="ai"]').click(); })()`);
    await waitFor(`!!document.querySelector('#agentsBody [data-ai-tab="task"]')`, 5000);
    await ev(`document.querySelector('#agentsBody [data-ai-tab="task"]').click()`);
    await waitFor(`!!document.querySelector('#agentsBody select[data-ai="agent"]')`, 10000);
    await ev(`(() => { const s = document.querySelector('#agentsBody select[data-ai="agent"]'); s.value = 'opencode'; s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
    await waitFor(`document.querySelector('#agentsBody select[data-ai="model"]').value.startsWith('opencode/')`, 5000, 'opencode model');
    await ev(`(() => { const t = document.querySelector('#agentsBody textarea[data-ai="prompt"]'); t.value = 'Crie o arquivo checklist.md com 5 itens de verificação diária de um datacenter, em markdown. Depois rode ls.'; document.querySelector('#agentsBody [data-ai-act="send"]').click(); })()`);
    await waitFor(`document.querySelector('#agentsBody .ai-ev--tool')`, 120000, 'first real tool call');
    check('real OpenCode: live tool calls stream into the panel', true);
    await shot('07-live-opencode');
    await waitFor(`document.querySelector('#agentsBody .ai-result') && document.querySelector('#agentsBody').innerText.includes('checklist.md')`, 240000, 'real result');
    check('real OpenCode: result delivered with the file', true);
    const content = await fs.readFile(path.join(gw.store.workspaceOf(UID, await ev('window.__a.crew.ai.id')), 'checklist.md'), 'utf8').catch(() => '');
    check('real OpenCode: checklist.md really exists in the employee workspace', content.length > 20, content.slice(0, 80).replace(/\n/g, ' '));
    await shot('08-live-done');
  }
  check('no uncaught errors in the page', consoleErrors.filter((e) => !/offline|supabase|Failed to load resource|SaveService|net::/i.test(e)).length === 0, consoleErrors.slice(0, 5).join(' | '));
} catch (e) {
  console.error('[e2e] FAILED:', e.message);
  await shot('zz-fail').catch(() => {});
  try { console.error('[e2e] panel:', (await ev(`(document.getElementById('agentsBody') || {}).innerText`) || '').slice(0, 1500)); } catch { /* page gone */ }
  results.push({ name: 'run', ok: false });
  console.error('[e2e] page errors:', consoleErrors.slice(0, 8));
} finally {
  const failed = results.filter((r) => !r.ok).length;
  console.log('[e2e] ' + (results.length - failed) + '/' + results.length + ' ok');
  try { ws.close(); } catch { /* closed */ }
  chrome.kill();
  gw.server.closeAllConnections(); gw.server.close();
  site.close(); auth.close();
  await sleep(500);
  await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
  await fs.rm(dataDir, { recursive: true, force: true }).catch(() => {});
  process.exit(failed ? 1 : 0);
}
