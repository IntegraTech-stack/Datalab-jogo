// Simulates the player's career (career.js) with a fake datacenter and a fake server answer (no browser):
// the mission + XP rule, XP from events (blackout / fire), and what happens when the cloud save's answer
// (applyServer) says less XP or a lower level than the game has.
// usage: node tests/sim-career.js
'use strict';
const vm = require('vm'), fs = require('fs'), path = require('path');
const root = path.resolve(__dirname, '..');
const el = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : el), apply: () => el, set: () => true });
const sandbox = { console, setTimeout: () => 0, clearTimeout: () => {}, document: { getElementById: () => el, createElement: () => el, body: el } };
sandbox.window = sandbox;
sandbox.DL = { JOBS: { BY_ROLE: {} }, keepOpen: null };
vm.createContext(sandbox);
for (const f of ['problems-data.js', 'career.js']) vm.runInContext(fs.readFileSync(path.join(root, 'assets/js', f), 'utf8'), sandbox, { filename: f });
const DL = sandbox.DL;
const EST = DL.SCENARIO_DATA.problems.filter((p) => p.rank === 'est');

function make() {
  const handlers = {}, toasts = [], events = [];
  const world = { items: [], lot: { w: 10, h: 10 } };
  const crew = { members: [], assignedCount: 0 };
  const game = {
    scene: { world }, root: el, sfx() {}, toast: (...a) => toasts.push(a),
    on: (n, fn) => (handlers[n] = handlers[n] || []).push(fn),
    emit: (n, info) => { if (n === 'career-event') events.push(info); (handlers[n] || []).forEach((fn) => fn(info)); },
  };
  const career = DL.createCareer(game, { crew, ops: { devices: () => [], switchesNear: () => [], toggle() {} } });
  career.start();
  const tick = () => career.update(1);
  // the level-1 mission: two racks, two desks, one hire
  const mission1 = () => { world.items.push({ kind: 'rack' }, { kind: 'rack' }, { kind: 'desk' }, { kind: 'desk' }); crew.members.push({}); };
  return { career, game, world, crew, toasts, events, tick, mission1 };
}

let bad = 0;
const check = (name, ok, extra) => { if (!ok) bad++; console.log((ok ? '✓ ' : '✗ ') + name + (ok || extra == null ? '' : ' → ' + JSON.stringify(extra))); };

// 1. the mission alone does not promote; mission + XP + different problems does
{
  const S = make();
  S.mission1(); S.tick();
  check('missão cumprida sem XP: continua no nível 1', S.career.level === 1);
  let n = 0;
  while (S.career.level === 1 && n < EST.length) { S.career.solve(EST[n++], 1); S.tick(); }
  check('missão + XP + problemas diferentes: sobe para o nível 2', S.career.level === 2, { level: S.career.level, n, xp: S.career.xp });
}

// 2. XP of an event (blackout breaker) counts as XP, but not as a "different problem"
{
  const S = make();
  const xp = S.career.solve({ id: 'apagao_disjuntor', xp: 25 }, 1);
  check('evento dá XP e avisa o save', xp === 25 && S.events.length === 1 && S.events[0].xp === 25);
  check('evento não conta como problema diferente', S.career.levelXp.solved.length === 0);
}

// 3. the server saw less XP (an event it does not know): the XP comes off, the level and the mission stay
{
  const S = make();
  S.mission1();
  for (let i = 0; i < 5; i++) S.career.solve(EST[i], 1);
  const server = S.career.xp;            // what the server counted
  S.career.solve({ id: 'apagao_disjuntor', xp: 25 }, 1);
  S.career.applyServer({ xp: server, level: 1, runs: 5 }, 0);
  check('XP que o servidor não viu é retirado', S.career.xp === server && S.career.levelXp.xp === server);
  check('nível não muda', S.career.level === 1);
}

// 4. THE BUG: promoted here with XP the server does not have → the server answers level 1.
//    Before: the mission started again from zero (two MORE racks, desks and a hire), so the level never came.
{
  const S = make();
  S.mission1();
  let n = 0, server = 0;
  // the server knows the catalog problems; the event XP (2 × 25) only the game has
  S.career.solve({ id: 'apagao_disjuntor', xp: 25 }, 1);
  S.career.solve({ id: 'apagao_servidor', xp: 25 }, 1);
  while (S.career.level === 1 && n < EST.length) { server += S.career.solve(EST[n++], 1); S.tick(); }
  check('subiu para 2 no jogo (com XP de evento)', S.career.level === 2 && server < 300, { server });
  S.career.applyServer({ xp: server, level: 1, runs: n, clamped: true }, 0);
  check('servidor recusou: volta para o nível 1', S.career.level === 1);
  S.tick();
  check('não tenta a promoção de novo logo em seguida', S.career.level === 1);
  const info = S.career.levelXp;
  check('XP da patente = o que o servidor tem', info.xp === server, info.xp);
  check('problemas diferentes continuam contados', info.solved.length === n, info.solved.length);
  // the mission is still done: only the missing XP is needed (one more problem), no new racks / desks / hire
  while (S.career.level === 1 && n < EST.length) { server += S.career.solve(EST[n++], 1); S.tick(); }
  check('com o XP que faltava, sobe SEM refazer a missão', S.career.level === 2, { level: S.career.level, xp: S.career.xp });
  S.career.applyServer({ xp: server, level: 2, runs: 1 }, 0);
  check('servidor confirma: fica no nível 2', S.career.level === 2);
}

// 5. solved problems still on their way to the server (it counts a few per save): nothing is taken away
{
  const S = make();
  S.mission1();
  let n = 0, total = 0;
  while (S.career.level === 1 && n < EST.length) { total += S.career.solve(EST[n++], 1); S.tick(); }
  const pend = 80;
  S.career.applyServer({ xp: total - pend, level: 1, runs: n - 2, clamped: true }, pend);
  check('com XP a caminho do servidor: mantém nível e XP', S.career.level === 2 && S.career.xp === total, { level: S.career.level, xp: S.career.xp });
}

// 6. save → load keeps everything (and the state to fall back to)
{
  const S = make();
  S.mission1();
  let n = 0;
  while (S.career.level === 1 && n < EST.length) { S.career.solve(EST[n++], 1); S.tick(); }
  const snap = JSON.parse(JSON.stringify(S.career.snapshot()));
  const T = make();
  T.mission1();
  T.career.restore(snap);
  check('carregar o save: mesmo nível e XP', T.career.level === 2 && T.career.xp === S.career.xp);
  T.career.applyServer({ xp: 100, level: 1, runs: 0, clamped: true }, 0);
  T.tick();
  check('recusa depois de carregar: nível 1 com a missão ainda cumprida', T.career.level === 1 && T.career.LEVELS[0].progress()[0] === 5, T.career.LEVELS[0].progress());
}

console.log(bad ? bad + ' falha(s)' : 'carreira: ok');
process.exit(bad ? 1 : 0);
