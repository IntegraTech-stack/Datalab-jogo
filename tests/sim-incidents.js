// Simulates every kind of Monitor incident in a fake datacenter (no browser): the problem opens, becomes a work
// order, the right person walks there and works on it for the expected game minutes, and it ends RESOLVED.
// Also checks the queue (one incident per person), the "hire someone" note and that the pace of new faults
// isn't held back by repairs in progress.
// usage: node tests/sim-incidents.js
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');

const el = new Proxy(function () {}, { get: (t, k) => (k === 'hidden' ? true : k === Symbol.toPrimitive ? () => '' : el), apply: () => el, set: () => true });
const sandbox = { console, setTimeout: () => 0, clearTimeout: () => {}, setInterval: () => 0, addEventListener: () => {}, document: { getElementById: () => el, createElement: () => el, head: el, body: el, activeElement: el } };
sandbox.window = sandbox;
const ROLES = { redes: 'Analista de redes', servidores: 'Analista de servidores', sysadmin: 'Sysadmin', tecnico: 'Técnico(a) de TI', seguranca: 'Segurança', atendente: 'Atendente', funcionario: 'Assistente', gerente: 'Gerente' };
sandbox.DL = { T: 16, money: (v) => '$' + Math.round(v), ROLES: Object.fromEntries(Object.entries(ROLES).map(([k, name]) => [k, { name }])) };
vm.createContext(sandbox);
for (const f of ['hardware.js', 'props.js', 'jobs.js', 'terminal.js', 'problems-data.js', 'ops.js', 'winserver.js', 'monitor.js', 'staff.js', 'director.js'])
  vm.runInContext(fs.readFileSync(path.join(root, 'assets/js', f), 'utf8'), sandbox, { filename: f });
const DL = sandbox.DL;

/* ---------- the fake datacenter: one server room, three racks, room for an AC on the right wall ---------- */
function makeWorld(opts) {
  const W = 30, H = 20, room = { id: 'r1', name: 'Sala de servidores', x: 1, y: 1, w: 20, h: 12 };
  const roomAt = new Array(W * H).fill(-1);
  for (let y = room.y; y < room.y + room.h; y++) for (let x = room.x; x < room.x + room.w; x++) roomAt[y * W + x] = 0;
  const rack = (id, tx, units) => ({ kind: 'rack', id, uid: id, tx, ty: 3, tw: 1, th: 2, px: tx * 16, py: 48, units: units.concat(new Array(9 - units.length).fill(null)), unitModel: new Array(9).fill(null) });
  const items = [
    rack('RACK-A01', 3, ['switch', 'server', 'server', 'server', 'server']),
    rack('RACK-A02', 5, ['server', 'server', 'server']),
    rack('RACK-A03', 7, ['switch', 'server', 'server']),
  ];
  if (opts.crac) items.push({ kind: 'crac', id: 'CRAC-0001', tx: 20, ty: 6, tw: 1, th: 2, px: 320, py: 96 });
  return { W, H, roomAt, rooms: [room], items, solid: new Array(W * H).fill(0), keepClear: new Set() };
}

function setup(opts) {
  opts = opts || {};
  const handlers = {};
  const world = makeWorld(opts);
  const later = [];
  const said = [];
  const game = {
    scene: { t: 1000, world, actors: [] }, on: (e, f) => (handlers[e] = handlers[e] || []).push(f), emit: (e, x) => (handlers[e] || []).forEach((f) => f(x)),
    toast() {}, sfx() {}, clock: () => '12:00', paused: () => false, setMode() {}, focus() {}, flash() {},
    problems: { list: () => [], devicesOf: () => [], key: () => '', setupLesson: () => null, consoleFor: () => null },
    // no random faults or broken hardware: each scenario sets up its own
    director: { canStart: () => false, started() {} },
    economy: { company: { cash: opts.cash != null ? opts.cash : 1e6 }, earn() {} },
    chat: { post: (who, text) => said.push((who && who.crew ? who.crew.name : who && who.name) + ': ' + text), later: (t, f) => later.push(f) },
    builder: {
      active: false,
      api: {
        place(kind, tx, ty) {
          if (world.items.some((e) => e.tx === tx && (e.ty === ty || e.ty === ty + 1))) return 'ocupado';
          world.items.push({ kind, id: 'CRAC-00' + (world.items.filter((e) => e.kind === kind).length + 2), tx, ty, tw: 1, th: 2, px: tx * 16, py: ty * 16 });
          return null;
        },
      },
    },
  };
  game.on('purchase', (p) => { game.economy.company.cash -= p.price; });
  // the crew: walks to the place in 6 s, then works the job's time down (crew.js does the same with real paths)
  const members = [];
  let id = 0;
  const hire = (role, skill) => {
    const s = { redes: 10, servidores: 10, sistemas: 10, seguranca: 10, gestao: 10 };
    s[DL.ROLE_SKILL[role]] = skill == null ? 50 : skill;
    const a = { x: 100, y: 100, crew: { id: ++id, name: role + id, profile: { role }, stats: { level: 1, xp: 0, skills: s, done: 0, fixed: 0 }, job: null, off: false, hold: false, state: 'idle', missing: [] } };
    members.push(a);
    return a;
  };
  const crewApi = {
    tasksOf: (a) => DL.JOBS.BY_ROLE[a.crew.profile.role] || [],
    startJob(a, def, o) {
      const dur = def.durFor ? def.durFor(a, o.target) : def.dur[0] + Math.random() * (def.dur[1] - def.dur[0]);
      a.crew.job = { def, target: o.target, total: dur, left: dur, auto: !!o.auto, walk: 6, name: def.name };
      a.crew.state = def.kind === 'spot' ? 'toSpot' : 'toEquip';
      return null;
    },
    cancelJob(a) { a.crew.job = null; a.crew.state = 'idle'; },
    progressOf: (a) => (a.crew.job && a.crew.job.walk <= 0 ? 1 - a.crew.job.left / a.crew.job.total : 0),
    busyWith: (t) => members.some((m) => m.crew.job && m.crew.job.target === t),
    fixDefFor: (a, d) => crewApi.tasksOf(a).find((t) => t.kind === 'fix' && d.fault && t.types.indexOf(d.fault.type) >= 0),
    nav: { center: (tx, ty) => ({ x: tx * 16 + 8, y: ty * 16 + 8 }), nearestFree: (tx, ty) => [tx, ty], free: () => true, route: () => [] },
    inZone: () => true,
  };
  const sys = { crew: { members, api: crewApi, stationOf: () => null, userOf: () => null, playerProfile: { name: 'Você' } }, terminal: { open() {} }, cabling: { open() {} } };
  const ops = DL.createOps(game, sys);
  sys.ops = ops;
  game.ops = ops;
  sandbox.DataLabDemo = { ops, scene: game.scene };
  ops.preinstall = true;
  ops.sync();
  ops.prewire(null);
  ops.preinstall = false;
  const monitor = DL.createMonitor(game, { ops, cabling: sys.cabling });
  sys.monitor = monitor;
  const staff = DL.createStaff(game, { crew: sys.crew, ops });
  game.staff = staff;
  const ctxOf = (a) => ({ a, c: a.crew, stats: a.crew.stats, world, ops, staff, eco: game.economy, members, player: 'Você', reception: () => null, install: () => null, hour: 9 });
  function tick(dt) {
    game.scene.t += dt;
    ops.update(dt);
    monitor.update(dt);
    staff.update(dt);
    for (const a of members) {
      const j = a.crew.job;
      if (!j) continue;
      if (j.walk > 0) { j.walk -= dt; if (j.walk <= 0) a.crew.state = a.crew.state === 'toSpot' ? 'atSpot' : 'inspecting'; continue; }
      j.left -= dt;
      if (j.left > 0) continue;
      a.crew.job = null;
      a.crew.state = 'idle';
      const r = j.def.finish(ctxOf(a), j.target);
      if (r && r.say) said.push(a.crew.name + ': ' + r.say);
    }
    while (later.length) later.shift()();
  }
  const run = (secs, until) => { for (let t = 0; t < secs; t += 0.25) { tick(0.25); if (until && until()) return t; } return null; };
  const servers = () => ops.devices().filter((d) => d.kind === 'server');
  return { game, ops, monitor, staff, world, members, hire, tick, run, servers, said };
}

/* ---------- checks ---------- */
const errors = [];
const results = [];
const check = (name, ok, msg) => { if (!ok) errors.push(name + ': ' + msg); };
const probOf = (env, kind, dev) => env.monitor.problems.find((p) => p.kind === kind && (!dev || p.dev === dev || p.rack === dev));

// open a problem and run until it is RESOLVED; span: the act's game minutes; walk: 6 s to get there
function scenario(name, opts, prepare, kind, act) {
  const env = setup(opts);
  for (const r of opts.crew || ['redes', 'servidores', 'sysadmin', 'tecnico', 'gerente']) env.hire(r, opts.skill);
  const target = prepare(env);
  env.run(6, () => probOf(env, kind, target));
  const p = probOf(env, kind, target);
  if (!p) { errors.push(name + ': o Monitor não abriu o problema ' + kind); return env; }
  const t0 = env.game.scene.t;
  env.run(4, () => p.order && p.order.status === 'run');
  check(name, p.order && p.order.type === (kind === 'hw' ? 'repair' : 'incident'), 'sem ordem de serviço (' + (p.wait || (p.order && p.order.queue) || '?') + ')');
  if (p.order && p.order.plan) check(name, p.order.plan.act === act, 'ação ' + p.order.plan.act + ', esperava ' + act);
  const who = p.order && p.order.assignee;
  check(name, !!who, 'ninguém atribuído: ' + (p.order && p.order.queue));
  // while the work goes on, the Monitor says who is on it
  env.run(10);
  const mid = env.monitor.problems.find((x) => x === p);
  check(name, !mid.end && mid.order && mid.order.status === 'run', 'deveria estar EM ATENDIMENTO');
  env.run(900, () => p.end);
  const took = env.game.scene.t - t0;
  check(name, !!p.end, 'não foi resolvido em 15 min (' + (p.order ? p.order.status + ' ' + p.order.note + ' ' + p.order.queue : p.wait) + ')');
  if (act && p.end) {
    const A = env.staff.ACTS[act];
    // 6 s walking + the work + up to 2 s for the next check (a rack also cools down for a while)
    const max = A.span[1] + 6 + 4 + (kind === 'temp' ? 120 : 0);
    check(name, took >= A.span[0] && took <= max, 'levou ' + Math.round(took) + ' s, esperado ' + A.span[0] + '–' + max);
    check(name, p.by === (who && who.crew.name), 'RESOLVIDO sem o nome de quem fez (' + p.by + ')');
  }
  results.push(name + ' · ' + (act || kind) + ' · ' + (who ? who.crew.profile.role : '—') + ' · ' + Math.round(took) + ' s');
  return env;
}

const firstSrv = (env, rack) => env.servers().find((d) => d.rack.id === (rack || 'RACK-A01'));

scenario('cabo solto', {}, (env) => { const d = firstSrv(env); env.ops.injectFault(d, 'cable'); return d; }, 'ping', 'replug');
scenario('cabo na porta de uplink', {}, (env) => { const d = env.servers().find((x) => x.rack.id === 'RACK-A03'); env.ops.injectFault(d, 'cablewrong'); return d; }, 'ping', 'replug');
scenario('interface desligada', {}, (env) => { const d = firstSrv(env); env.ops.injectFault(d, 'link'); return d; }, 'ping', 'reboot');
scenario('IP removido (sem falha registrada)', {}, (env) => { const d = firstSrv(env); d.os.ifaces.eth0.ips = []; env.ops.recompute(); return d; }, 'ping', 'reboot');
scenario('reinstalado sem rede', {}, (env) => { const d = firstSrv(env); env.ops.injectFault(d, 'noip3'); return d; }, 'ping', 'reboot');
scenario('porta do switch desligada', {}, (env) => {
  const d = firstSrv(env), t = env.ops.trace(d);
  t.sw.sw.ports[t.port] = 'disabled'; env.ops.recompute();
  return d;
}, 'ping', 'swport');
scenario('porta em err-disabled (switch)', {}, (env) => { const sw = env.ops.devices().find((x) => x.kind === 'switch'); env.ops.injectFault(sw, 'port'); return sw; }, 'port', 'swport');
scenario('nginx parado', {}, (env) => { const d = firstSrv(env); env.ops.injectFault(d, 'service'); return d; }, 'http', 'web');
scenario('firewall bloqueando o site', {}, (env) => { const d = firstSrv(env); env.ops.injectFault(d, 'fwblock'); return d; }, 'http', 'web');
scenario('disco cheio', {}, (env) => { const d = firstSrv(env); env.ops.injectFault(d, 'disk'); return d; }, 'disk', 'disk');
scenario('CPU alta (processo travado)', {}, (env) => {
  const d = firstSrv(env, 'RACK-A02');
  env.run(2);
  d.mb.spike = env.game.scene.t + 10;
  d.mb.stuck = true;   // (about one spike in ten: monitor.js STUCK)
  return d;
}, 'cpu', 'cpu');
// most spikes are a load peak: no order, it ends by itself
{
  const env = setup({ crac: true });
  env.hire('servidores'); env.hire('gerente');
  const d = firstSrv(env, 'RACK-A02');
  env.run(2);
  d.mb.spike = env.game.scene.t + 10;
  env.run(6);
  const p = probOf(env, 'cpu', d);
  if (p && !d.mb.stuck) {
    check('pico de CPU passageiro', !p.order && /passar sozinho/.test(p.wait), 'não deveria abrir ordem (' + (p.order ? p.order.status : p.wait) + ')');
    env.run(20, () => p.end);
    check('pico de CPU passageiro', p.end && !p.by && /sozinho/.test(p.how), 'deveria terminar sozinho');
    results.push('pico de CPU passageiro · sem ordem · terminou sozinho');
  } else if (!p) errors.push('pico de CPU passageiro: o Monitor não abriu o problema');
}
scenario('temperatura alta sem ar de precisão', { cash: 50000 }, (env) => env.world.items.find((e) => e.id === 'RACK-A01'), 'temp', 'cracnew');
// (one person: the AC service goes first — warning before info — and the tidy-up of the same rack waits)
scenario('temperatura alta com ar de precisão', { crac: true, crew: ['servidores', 'gerente'] }, (env) => {
  const r = env.world.items.find((e) => e.id === 'RACK-A01');
  r.units = ['switch', 'server', 'server', 'server', 'server', 'server', 'server', 'server', 'server'];
  r.unitModel = new Array(9).fill(null);
  env.ops.sync(); for (const d of env.servers()) if (d.state !== 'online') { d.state = 'online'; DL.newOS(d, true); }
  env.ops.prewire(r);   // (messy cables in this rack)
  return r;
}, 'temp', 'cracfix');
scenario('cabos desorganizados', { crac: true }, (env) => { const r = env.world.items.find((e) => e.id === 'RACK-A02'); r.tidy = false; env.ops.recompute(); return r; }, 'cables', 'tidy');

// a switch with broken hardware: the hosts behind it follow its repair order
{
  const env = setup({ crac: true });
  env.hire('tecnico'); env.hire('gerente');
  const sw = env.ops.devices().find((x) => x.kind === 'switch');
  const rec = env.staff.breakItem(sw);
  env.run(6);
  const p = probOf(env, 'hw', sw), hosts = env.monitor.problems.filter((x) => x.kind === 'ping');
  check('switch quebrado', p && p.order && p.order.type === 'repair', 'sem ordem de conserto');
  check('switch quebrado', hosts.length > 0 && hosts.every((h) => h.order === p.order), 'os hosts atrás do switch não seguem a ordem de conserto');
  env.run(120, () => p.end);
  check('switch quebrado', !!p.end && hosts.every((h) => h.end), 'não voltou depois do conserto');
  results.push('switch quebrado · conserto · tecnico · ' + (rec ? 'ok' : '—'));
}

// Windows Server: a role service stopped, an account locked out
{
  const winEnv = (fault) => {
    const env = setup({ crac: true });
    env.hire('sysadmin'); env.hire('gerente');
    const d = env.servers().find((x) => x.rack.id === 'RACK-A02');
    DL.winInstall(d); d.svc = 'win';
    const ctx = { reach: (x, h) => env.ops.reach(x, h), peer: () => '', clear() {}, close() {}, history: [] }, sh = (l) => DL.winShell(d, l, ctx);
    sh('setup.exe /install /index:3'); sh('net user Administrator Datalab@2026');
    sh('New-NetIPAddress -InterfaceAlias Ethernet -IPAddress ' + d.ip + ' -PrefixLength 24 -DefaultGateway 10.0.1.1');
    sh('Rename-Computer -NewName ' + d.name + ' -Restart');
    sh('Install-WindowsFeature AD-Domain-Services -IncludeManagementTools'); sh('Install-ADDSForest -DomainName corp.datalab.local -InstallDns');
    d.os.win.users.ana = { sam: 'ana', name: 'Ana', ou: null, enabled: true, locked: false, pwd: true };
    d.state = 'online'; env.ops.recompute();
    env.run(4);
    const f = env.ops.injectFault(d, fault);
    return { env, d, f };
  };
  for (const [fault, kind, act] of [['winsvc', null, 'winsvc'], ['lockout', 'win:lockout', 'unlock']]) {
    const { env, d, f } = winEnv(fault);
    if (!f) { errors.push('Windows ' + fault + ': não deu para preparar'); continue; }
    env.run(6);
    const p = env.monitor.problems.find((x) => x.dev === d && (kind ? x.kind === kind : /^win:(DNS|DHCPServer|NTDS)$/.test(x.kind)));
    if (!p) { errors.push('Windows ' + fault + ': o Monitor não abriu o problema'); continue; }
    const t0 = env.game.scene.t;
    env.run(400, () => p.end);
    env.run(2);   // (ops.js clears the fault on its next half-second check)
    check('Windows ' + fault, !!p.end && p.order && p.order.plan.act === act, 'não resolvido (' + (p.order ? p.order.plan.act + ' ' + p.order.status + ' ' + p.order.queue : p.wait) + ')');
    check('Windows ' + fault, !d.fault, 'a falha ficou registrada');
    results.push('Windows ' + fault + ' · ' + act + ' · sysadmin · ' + Math.round(env.game.scene.t - t0) + ' s');
  }
}

// one person, two incidents: the second waits in the queue, then gets done
{
  const env = setup({ crac: true });
  env.hire('redes'); env.hire('gerente');
  const [a, b] = env.servers().filter((d) => d.rack.id === 'RACK-A01');
  env.ops.injectFault(a, 'link'); env.ops.injectFault(b, 'cable');
  env.run(6);
  const pa = probOf(env, 'ping', a), pb = probOf(env, 'ping', b);
  const run = [pa, pb].filter((p) => p.order && p.order.status === 'run'), wait = [pa, pb].filter((p) => p.order && p.order.status === 'open');
  check('fila', run.length === 1 && wait.length === 1, 'esperava 1 em atendimento e 1 na fila (' + run.length + '/' + wait.length + ')');
  check('fila', wait[0] && /Na fila/.test(wait[0].order.queue), 'a ordem na fila não diz por quê: ' + (wait[0] && wait[0].order.queue));
  env.run(500, () => pa.end && pb.end);
  check('fila', pa.end && pb.end, 'as duas deveriam terminar resolvidas');
  results.push('fila · 2 incidentes, 1 pessoa · ' + Math.round(Math.max(pa.end, pb.end) - Math.min(pa.start, pb.start)) + ' s');
}

// nobody on the team restarts services: the order says who to hire
{
  const env = setup({ crac: true });
  env.hire('redes'); env.hire('gerente');
  const d = firstSrv(env);
  env.ops.injectFault(d, 'service');
  env.run(6);
  const p = probOf(env, 'http', d);
  check('sem cargo', p && p.order && p.order.status === 'open' && /contrate: .*Sysadmin/.test(p.order.queue), 'esperava "contrate: … Sysadmin" e veio: ' + (p && p.order && p.order.queue));
}

// the pace of new faults: a fault being repaired doesn't hold the next one back (director.js / ops.js)
{
  const env = setup({ crac: true });
  env.hire('redes'); env.hire('gerente');
  const dir = DL.createDirector(env.game, { ops: env.ops });
  const d = firstSrv(env);
  env.ops.injectFault(d, 'link');
  env.run(4);
  check('ritmo', env.staff.handling(d), 'a ordem deveria estar em andamento');
  dir.update(1000);
  check('ritmo', dir.canStart('fault'), 'uma falha em atendimento não deveria segurar a próxima');
}

// the player fixes it first: the technician on the way stops, the order closes
{
  const env = setup({ crac: true });
  env.hire('redes'); env.hire('gerente');
  const d = firstSrv(env);
  env.ops.injectFault(d, 'link');
  env.run(6);
  const p = probOf(env, 'ping', d), o = p.order;
  d.os.ifaces.eth0.up = true; env.ops.recompute();
  env.run(6);
  check('jogador antes', p.end && o.status === 'cancel' && !o.assignee.crew.job, 'a ordem deveria fechar e o técnico parar');
  check('jogador antes', !p.by, 'RESOLVIDO não deveria creditar o técnico');
}

// a long run with the spontaneous CPU spikes (same frequency as always): no open incident is ever left without
// an order or a reason to wait, and the team keeps closing them (a queue may form: it shows who is busy)
{
  const env = setup({ crac: true });
  for (const r of ['redes', 'servidores', 'sysadmin', 'tecnico', 'gerente']) env.hire(r);
  // (one sure incident: a stuck process is only one CPU spike in ten, an hour may bring none)
  env.ops.injectFault(firstSrv(env), 'link');
  const seen = new Set();
  let orphan = null, worst = 0;
  for (let i = 0; i < 720; i++) {
    env.run(5);
    for (const p of env.monitor.problems) {
      seen.add(p);
      if (p.end) continue;
      worst = Math.max(worst, env.game.scene.t - p.start);
      const o = p.order, ok = (o && (o.status === 'run' || o.status === 'open' || (o.status === 'done' && o.result === 'ok'))) || p.wait;
      if (!ok && env.game.scene.t - p.start > 4) orphan = orphan || p.text + ' [' + (o ? o.status + ' ' + o.note : 'sem ordem') + ']';
    }
  }
  const done = Array.from(seen).filter((p) => p.end && p.by).length;
  check('1 hora de jogo', !orphan, 'incidente aberto sem ordem nem motivo: ' + orphan);
  check('1 hora de jogo', done > 0, 'a equipe não resolveu nenhum');
  results.push('1 hora de jogo · ' + seen.size + ' incidente(s), ' + done + ' resolvido(s) pela equipe, maior espera ' + Math.round(worst) + ' s');
}

for (const r of results) console.log('✓ ' + r);
if (errors.length) { console.log('\n' + errors.length + ' erro(s):\n' + errors.map((e) => '  ✗ ' + e).join('\n')); process.exit(1); }
console.log('\nincidentes: tudo resolvido pela equipe');
