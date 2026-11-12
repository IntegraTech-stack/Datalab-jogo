// Simulates every career problem of the given ranks in a fake datacenter (no browser): starts it, plays it the
// way the dev auto-play would (step.auto / cmd / help examples), does the out-of-console actions a player would,
// and checks that each step completes, the problem finishes and its faults are gone.
// usage: node tests/sim-problems.js [rank,rank…]   (default: every rank)
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const ranks = process.argv[2] ? process.argv[2].split(',') : null;
const inRank = (x) => !ranks || ranks.includes(x.rank);

const noop = () => el;
const el = new Proxy(function () {}, { get: (t, k) => (k === 'hidden' ? true : k === Symbol.toPrimitive ? () => '' : el), apply: () => el, set: () => true });
const sandbox = { console, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, document: { getElementById: () => el, createElement: () => el, head: el, body: el, activeElement: el } };
sandbox.window = sandbox;
// (crew.js needs the sprites: only the role names it defines)
sandbox.DL = { money: (v) => '$' + Math.round(v), ROLES: { redes: { name: 'Redes' }, servidores: { name: 'Servidores' }, sysadmin: { name: 'Sysadmin' }, tecnico: { name: 'Técnico de TI' }, seguranca: { name: 'Segurança' }, atendente: { name: 'Atendente' } } };
vm.createContext(sandbox);
for (const f of ['hardware.js', 'props.js', 'jobs.js', 'terminal.js', 'problems-data.js', 'problems.js', 'ops.js', 'winserver.js', 'infra.js'])
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/js', f), 'utf8'), sandbox, { filename: f });
const DL = sandbox.DL;
const HELP = DL.CMD_HELP;

// ---------- static checks ----------
const errors = [];
const D = DL.SCENARIO_DATA;
const fail = (id, msg) => errors.push(id + ': ' + msg);
const states = new Set(Object.keys(DL.SCENARIO_PROBES));
function walk(c, id) {
  if (!c || typeof c !== 'object') return;
  if (c.any) c.any.forEach((k) => walk(k, id));
  if (c.all) c.all.forEach((k) => walk(k, id));
  if (c.not) walk(c.not, id);
  if (c.state && !states.has(c.state)) fail(id, 'estado desconhecido ' + c.state);
}
const okVar = (s) => /^(max|maxRole|sum):/.test(s) ? states.has(s.split(':')[1]) : /^(ips|faulty\w*|faultRole)(:|$)/.test(s) || states.has(s.split(/[:@]/)[0]);
for (const p of D.problems.filter((x) => inRank(x))) {
  for (const s of p.steps || []) {
    for (const k of s.help || []) if (!HELP[k]) fail(p.id, 'ajuda desconhecida ' + k);
    if (s.type !== 'answer') walk(s.check, p.id);
    if (s.device && s.device !== 'any' && !(p.devices || {})[s.device]) fail(p.id, 'device sem papel: ' + s.device);
  }
  for (const v of Object.values(p.vars || {})) if (!okVar(v)) fail(p.id, 'var desconhecida ' + v);
  for (const r of Object.values(p.devices || {})) if (!DL.SCENARIO_RESOLVE[r]) fail(p.id, 'resolver desconhecido ' + r);
  for (const j of p.setup ? p.setup.faults || (p.setup.fault ? [p.setup] : []) : []) for (const f of [].concat(j.fault)) if (!DL.FAULTS[f.split('@')[0]]) fail(p.id, 'falha desconhecida ' + f);
  if (p.lesson && !DL.LESSONS[p.lesson]) fail(p.id, 'lição desconhecida ' + p.lesson);
  // templates: only roots the problem knows
  const roots = new Set(['gw', 'dev', 'rack'].concat(Object.keys(p.vars || {}), Object.keys(p.devices || {})));
  const txt = JSON.stringify([p.title, p.summary, p.steps || []]);
  for (const m of txt.matchAll(/\{\{\s*([\w]+)/g)) if (!roots.has(m[1])) fail(p.id, 'template desconhecido {{' + m[1] + '}}');
}
// the database's own validation (problems.js okProblem / okLesson) on a JSON round trip
const before = D.problems.length;
const json = JSON.parse(JSON.stringify({ lessons: D.lessons, problems: D.problems, ranks: D.ranks }));
const warn = console.warn; let warned = ''; console.warn = (m) => { warned += m; };
DL.applyScenarioData(json, 'test');
console.warn = warn;
if (warned) fail('applyScenarioData', warned);
if (DL.SCENARIO_DATA.problems.length !== before) fail('applyScenarioData', 'problemas recusados: ' + (before - DL.SCENARIO_DATA.problems.length));

// ---------- the fake datacenter ----------
function makeWorld() {
  const rack = (id, tx, units, models) => ({ kind: 'rack', id, uid: id, tx, ty: 2, px: tx * 16, py: 32, units: units.concat(new Array(9 - units.length).fill(null)), unitModel: (models || []).concat(new Array(9).fill(null)).slice(0, 9) });
  const W = 30, H = 20;
  // RACK-A01: a PoE switch and five Linux servers · RACK-A02: a Linux server and two Windows Servers (a domain
  // controller and a member) · RACK-A03: a second switch, a virtualization node and two more servers · four desks
  return { W, H, roomAt: new Array(W * H).fill(0), rooms: [{ id: 'room1' }], items: [
    rack('RACK-A01', 2, ['switch', 'server', 'server', 'server', 'server', 'server'], ['sw_24poe']),
    rack('RACK-A02', 4, ['server', 'server', 'server']),
    rack('RACK-A03', 6, ['switch', 'server', 'server', 'server', 'server'], [null, null, null, null, 'srv_gpu']),
  ].concat([0, 1, 2, 3].map((i) => ({ kind: 'desk', defId: 'desk', tx: 10 + i * 2, ty: 8 }))) };
}
function setup() {
  const handlers = {};
  const world = makeWorld();
  const state = { paused: true };
  const game = {
    scene: { t: 1000, world }, on: (e, f) => (handlers[e] = handlers[e] || []).push(f), emit: (e, x) => (handlers[e] || []).forEach((f) => f(x)),
    toast() {}, sfx() {}, clock: () => '12:00', paused: () => state.paused, setMode() {}, focus() {}, flash() {},
    problems: { list: () => [], devicesOf: () => [], key: () => '', setupLesson: () => null, consoleFor: () => null },
  };
  const captured = {};
  const sys = { crew: { members: [], api: { cancelJob() {} }, assignedCount: 0 }, terminal: { open: (d, lesson, done) => Object.assign(captured, { d, lesson, done }) }, cabling: { open() {} } };
  const ops = DL.createOps(game, sys);
  sys.ops = ops;
  // what winserver.js / problems.js reach through window.DataLabDemo
  sandbox.DataLabDemo = { ops, scene: game.scene };
  game.reach = (d, h) => ops.reach(d, h);
  game.peer = (d, port) => { const l = ops.linkAt(d.key, port); if (!l) return ''; const o = ops.get(l.a.dev === d.key ? l.b.dev : l.a.dev); return o ? o.name : ''; };
  ops.preinstall = true;
  ops.sync();
  ops.prewire(null);
  ops.preinstall = false;
  // two Windows Servers in RACK-A02: a domain controller and a member, both installed
  const winSrv = ops.devices().filter((d) => d.kind === 'server' && d.rack.id === 'RACK-A02').slice(1);
  for (const d of winSrv) {
    DL.winInstall(d);
    d.svc = 'win';
    const w = d.os.win;
    const sh = (l) => DL.winShell(d, l, ctxOf(ops));
    sh('setup.exe /install /index:3'); sh('net user Administrator Datalab@2026');
    sh('New-NetIPAddress -InterfaceAlias Ethernet -IPAddress ' + d.ip + ' -PrefixLength 24 -DefaultGateway 10.0.1.1');
    sh('Rename-Computer -NewName ' + d.name + ' -Restart');
    d.state = 'online';
    if (w.stage !== 'ready') throw new Error('Windows não ficou pronto: ' + w.stage);
  }
  { const dc = winSrv[0], sh = (l) => DL.winShell(dc, l, ctxOf(ops)); sh('Install-WindowsFeature AD-Domain-Services -IncludeManagementTools'); sh('Install-ADDSForest -DomainName corp.datalab.local -InstallDns'); if (!dc.os.win.domain) throw new Error('domínio não criado'); }
  ops.recompute();
  // the specialisations and VMs: a virtualization node in RACK-A03 and a Web/API server
  const infra = DL.createInfra(game, { ops });
  sandbox.DataLabDemo.infra = infra;
  const a03 = ops.devices().filter((d) => d.kind === 'server' && d.rack.id === 'RACK-A03');
  a03[0].svc = 'virt';
  ops.devices().find((d) => d.kind === 'server' && d.rack.id === 'RACK-A01').svc = 'web';
  const career = { level: 10, LEVELS: [], xpFor: (d) => d.xp, solve: (d) => d.xp, solvedCount: () => 0 };
  sys.career = career;
  const problems = DL.createProblems(game, sys);
  game.problems = problems;
  return { game, sys, ops, problems, world, state, captured, infra };
}
const ctxOf = (ops) => ({ reach: (d, h) => ops.reach(d, h), peer: (d, port) => { const l = ops.linkAt(d.key, port); if (!l) return ''; const o = ops.get(l.a.dev === d.key ? l.b.dev : l.a.dev); return o ? o.name : ''; }, clear() {}, close() {}, history: [] });

function commandsOf(s) {
  if (s.answer) return [];
  if (s.auto) return s.auto.split('\n').map((l) => l.trim()).filter(Boolean);
  const list = s.cmd ? [s.cmd] : [];
  for (const k of (s.help || []).slice(s.cmd ? 1 : 0)) { if (!HELP[k]) continue; for (const l of HELP[k].ex.split('\n')) if (l.trim() && list.indexOf(l.trim()) < 0) list.push(l.trim()); }
  return list;
}
function run(env, d, line, key, log) {
  if (d.lessonKey !== key) { d.ran = new Set(); d.lessonKey = key; }
  const shell = d.kind === 'switch' ? DL.termShells.swcli : DL.isWin(d) ? DL.winShell : DL.termShells.linux;
  const r = shell(d, line, ctxOf(env.ops));
  if (line.trim() && r.ran.indexOf('error') < 0 && r.ran.indexOf('unknown') < 0) { const w = line.trim().split(/\s+/).find((x) => x !== 'sudo'); if (w) r.ran.push('cmd:' + w.toLowerCase()); }
  for (const e of r.ran) d.ran.add(e);
  env.ops.recompute();
  log.push(d.name + '> ' + line + '  [' + r.ran.join(',') + ']' + (r.ran.includes('error') ? ' :: ' + r.out.join(' | ').replace(/<[^>]+>/g, '').slice(0, 160) : ''));
}
// what a player does outside the console
function act(env, s, d, p) {
  const { ops, world, infra, sys } = env;
  const chk = JSON.stringify(s.check || {});
  const arg = (st) => { const m = new RegExp('"state":"' + st.replace('.', '\\.') + '","arg":"([^"]+)"').exec(chk); return m && m[1]; };
  const settle = () => { for (let i = 0; i < 6; i++) infra.update(1); ops.recompute(); };
  // Infra (I): the specialisations and the VMs
  if (arg('provided')) { const x = ops.devices().find((q) => q.kind === 'server' && q.state === 'online' && !DL.isWin(q) && !q.svc && !q.fault); x.svc = arg('provided'); return 'especializou ' + x.name + ' como ' + x.svc; }
  if (arg('svcs')) { const x = ops.devices().find((q) => q.kind === 'server' && q.state === 'online' && !DL.isWin(q)); x.svc = arg('svcs'); return 'especializou ' + x.name; }
  if (arg('svc.model')) { const [ty, model] = arg('svc.model').split(','); const x = ops.devices().find((q) => q.model && q.model.id === model); x.svc = ty; return 'especializou ' + x.name + ' (' + model + ') como ' + ty; }
  if (arg('svc.ok')) {
    const ty = arg('svc.ok');
    for (const x of ops.devices().filter((q) => q.kind === 'server' && q.state === 'online' && !DL.isWin(q) && q.svc !== 'virt' && !q.fault)) { const was = x.svc; x.svc = ty; if (!infra.needsOf(x).length) return 'especializou ' + x.name + ' como ' + ty; x.svc = was; }
    return null;
  }
  if (arg('vms')) {
    const [svc] = arg('vms').split(':'), node = infra.nodes()[0];
    const why = infra.createVm({ node: node.key, name: 'vm-' + svc + '-' + Math.floor(Math.random() * 1e4), svc, cores: 2, ram: 4, disk: 20 }); settle();
    return why || 'criou uma VM ' + svc;
  }
  // VMs by name: the test ones shut down, the old ones removed
  if (arg('vmsNamed')) {
    const pre = arg('vmsNamed').split(':')[0];
    settle();
    for (const v of infra.vms.filter((q) => q.name.indexOf(pre) === 0)) { if (v.status === 'running') infra.act(v, 'shutdown'); }
    settle();
    if (/:"?,"eq":0|antigo:"/.test(chk) && pre === 'antigo') for (const v of infra.vms.filter((q) => q.name.indexOf(pre) === 0)) infra.act(v, 'remove');
    return 'mexeu nas VMs ' + pre + '-*';
  }
  if (/node\.alloc/.test(chk)) { settle(); for (const v of infra.vms.filter((q) => q.node === d.key && /^carga/.test(q.name))) infra.act(v, 'shutdown'); settle(); return 'desligou as VMs de carga'; }
  // Equipe: orders
  if (arg('ordersSince')) { sys.crew.assignedCount += 3; return 'deu ordens à equipe'; }
  // a VLAN on the newest switch, through its console
  if (arg('vlan.any')) {
    const [id, nm] = arg('vlan.any').split(':'), sw = ops.devices().filter((q) => q.kind === 'switch').pop();
    for (const l of ['enable', 'configure terminal', 'vlan ' + id, 'name ' + nm, 'end']) DL.termShells.swcli(sw, l, ctxOf(ops));
    return 'criou a VLAN ' + id + ' no ' + sw.name;
  }
  if (s.action === 'build') {
    const m = /"state":"(items|devs)","arg":"([^"]+)"/.exec(chk);
    if (m && m[1] === 'items') { const id = m[2].split(',')[0]; world.items.push({ kind: id, defId: id, powered: true, tx: 1, ty: 1 }); return 'construiu ' + id; }
    if (m && m[1] === 'devs') {
      const r = world.items.find((e) => e.kind === 'rack' && e.units.indexOf(null) >= 0); const k = r.units.indexOf(null);
      r.units[k] = /^srv/.test(m[2]) ? 'server' : 'switch'; r.unitModel[k] = m[2]; ops.sync(); return 'instalou ' + m[2];
    }
  }
  if (s.action === 'cabling') {
    if (/on\.model/.test(chk)) {
      const model = arg('on.model');
      const sw = ops.devices().find((x) => x.kind === 'switch' && x.model.id === model);
      const srv = ops.devices().find((x) => x.kind === 'server' && x.state === 'online' && !DL.isWin(x));
      const l = ops.linkNear(srv.key, 'eth0'), end = l.a.dev === srv.key ? 'b' : 'a';
      ops.moveEnd(l, end, { dev: sw.key, port: 'gi0/1' }); return 'moveu ' + srv.name + ' para o ' + model;
    }
    if (/rack\.tidy/.test(chk)) { ops.tidy([d]); return 'organizou ' + d.id; }
    if (d.kind === 'server' && d.state === 'new') {
      const sw = ops.devices().find((x) => x.kind === 'switch'); const port = sw.ports.find((q) => q !== 'te1' && !ops.linkAt(sw.key, q));
      ops.addLink({ dev: d.key, port: 'eth0' }, { dev: sw.key, port }); return 'cabeou ' + d.name;
    }
    if (d.fault && ['cable', 'flap', 'cablewrong'].includes(d.fault.type)) { ops.fix(d); return 'consertou o cabo de ' + d.name; }
  }
  return null;
}

// raw: the steps as written in the data (their checks tell the player's action), when there are
function playSteps(env, steps, key, devsList, mainDev, log, raw) {
  for (let k = 0; k < steps.length; k++) {
    const s = Object.assign({}, steps[k], { check: raw && raw[k] ? raw[k].check : undefined });
    const consoles = s.on ? [s.on] : devsList.length ? devsList : [mainDev];
    const isDone = () => consoles.some((d) => s.done(d, d.lessonKey === key ? d.ran : new Set()));
    if (s.answer) {
      const v = s.answer.accept[0];
      if (v == null || v === '' || /null|undefined|NaN/.test(v)) return 'passo ' + (k + 1) + ': resposta vazia (' + JSON.stringify(s.answer.accept) + ')';
      if (!DL.checkAnswer(s.answer, v)) return 'passo ' + (k + 1) + ': resposta não confere com ela mesma';
      const d = consoles[0];
      if (d.lessonKey !== key) { d.ran = new Set(); d.lessonKey = key; }
      d.ran.add('answer:' + k);
      log.push(d.name + '> responder ' + v);
      if (!isDone()) return 'passo ' + (k + 1) + ': resposta não marcou o passo';
      continue;
    }
    for (const d of consoles) {
      for (const c of commandsOf(s)) { if (isDone()) break; run(env, d, c, key, log); }
      if (isDone()) break;
    }
    if (!isDone()) { const what = act(env, s, s.on || mainDev, null); if (what) log.push('[ação] ' + what); env.ops.recompute(); }
    if (!isDone()) return 'passo ' + (k + 1) + ' não concluiu: "' + s.text + '"';
  }
  return null;
}

let ok = 0;
const results = [];
for (const def of D.problems.filter((x) => inRank(x))) {
  const env = setup();
  const { ops, problems, world, state, captured } = env;
  const log = [];
  let err = null;
  try {
    // equipment the auto problems wait for
    if (def.trigger === 'auto' && def.target.kind === 'server') {
      const r = world.items.find((e) => e.id === 'RACK-A02'); const k = r.units.indexOf(null); r.units[k] = 'server'; ops.sync();
      const nd = ops.devices().find((x) => x.kind === 'server' && x.state === 'new');
      if (def.target.os === 'windows') { DL.winInstall(nd); nd.svc = 'win'; }
      if (def.target.state === 'link') { const sw = ops.devices().find((x) => x.kind === 'switch'); const port = sw.ports.find((q) => q !== 'te1' && !ops.linkAt(sw.key, q)); ops.addLink({ dev: nd.key, port: 'eth0' }, { dev: sw.key, port }); }
    }
    const list = problems.api.candidates(def.id);
    if (!list.length) throw new Error('sem candidatos no datacenter de teste');
    let p = null;
    for (const x of list) { p = problems.api.start(def.id, x); if (p) break; }
    if (!p) throw new Error('não iniciou (setup recusou)');
    const devs = problems.devicesOf(p);
    if (def.complete === 'lesson') {
      const key = 'p:' + def.id, L = DL.LESSONS[key](p.x);
      if (/\{\{|undefined|null/.test(L.title + L.goal + L.steps.map((s) => s.text).join())) throw new Error('texto com template vazio: ' + L.title + ' / ' + L.steps.map((s) => s.text).join(' | '));
      err = playSteps(env, L.steps, key, devs.filter((d) => d.kind !== 'rack'), p.x, log, def.steps);
      if (!err) problems.api.finish(p, 'player');
    } else if (def.complete === 'online' || def.complete === 'fixed') {
      ops.openTerminal(p.x);
      if (!captured.lesson) throw new Error('o terminal não abriu lição');
      if (def.complete === 'online' && captured.lesson !== def.lesson) throw new Error('abriu a lição ' + captured.lesson + ' em vez de ' + def.lesson);
      const L = DL.LESSONS[captured.lesson](p.x);
      // the compiled lessons of the code (winserver.js) have no `on`; the data ones may
      err = playSteps(env, L.steps, captured.lesson, [], p.x, log);
      if (!err && captured.done) captured.done();
    } else if (def.complete === 'steps') {
      for (let k = 0; k < def.steps.length && !err; k++) {
        const s = def.steps[k];
        const d = s.device ? p.extra[s.device] : p.x;
        const what = act(env, Object.assign({}, s, { check: s.check }), d, p);
        log.push('[ação] ' + what);
        ops.recompute();
        if (!problems.list().includes(p)) break;
      }
    }
    // let the game notice (faults resolved → 'fixed', checklists done)
    for (let i = 0; i < 4; i++) { state.paused = true; ops.update(0.6); state.paused = false; problems.update(0.6); }
    if (!err && problems.list().some((q) => q === p)) err = 'o problema continuou aberto';
    const left = devs.filter((d) => d.fault && d.fault.problem === p.uid);
    // (handoff: the fix stays with the team on purpose)
    if (!err && left.length && !def.handoff) err ='falha continuou: ' + left.map((d) => d.name + ' ' + d.fault.type).join(', ');
  } catch (e) { err = e.message + (e.stack ? ' @ ' + e.stack.split('\n')[1].trim() : ''); }
  if (err) results.push('✗ ' + def.id + ' — ' + err + '\n    ' + log.slice(-8).join('\n    '));
  else { ok++; results.push('✓ ' + def.id); }
}
// ---------- save / restore: a problem without a fault comes back the same (texts, answers, other devices) ----------
const sig = (p) => { const L = DL.LESSONS['p:' + p.def.id](p.x); return JSON.stringify([L.title, L.steps.map((s) => [s.text, s.answer && s.answer.accept, s.on && s.on.name])]); };
for (const def of D.problems.filter((x) => inRank(x) && x.complete === 'lesson' && !DL.problemBreaks(x))) {
  const env = setup();
  const list = env.problems.api.candidates(def.id);
  const p = list.length && env.problems.api.start(def.id, list[0]);
  if (!p) { errors.push(def.id + ': restore — não iniciou'); continue; }
  const a = sig(p), snap = JSON.parse(JSON.stringify(env.problems.snapshot()));
  env.problems.restore(snap);
  const q = env.problems.list().find((x) => x.def.id === def.id);
  if (!q) { errors.push(def.id + ': restore — não voltou'); continue; }
  const b = sig(q);
  if (a !== b) errors.push(def.id + ': restore mudou o problema\n    antes:  ' + a + '\n    depois: ' + b);
}
console.log(results.join('\n'));
console.log('\nestático: ' + (errors.length ? errors.length + ' erro(s)\n  ' + errors.join('\n  ') : 'ok'));
console.log('simulação: ' + ok + '/' + D.problems.filter((x) => inRank(x)).length + ' problemas resolvidos de ponta a ponta');
process.exit(errors.length || ok < D.problems.filter((x) => inRank(x)).length ? 1 : 0);
