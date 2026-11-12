// Desktop AFK (assets/js/desktop.js): while in the background the player's character does simple tasks,
// only of a level BELOW the player's rank. Runs desktop.js + the real task catalog (jobs.js) in a sandbox,
// with the real tier table of career.js. Usage: node tests/desktop-afk.mjs
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8');

// the real tier of every crew task (career.js TASK_TIER)
const m = /const TASK_TIER = (\{[\s\S]*?\});/.exec(read('assets/js/career.js'));
if (!m) throw new Error('TASK_TIER not found in career.js');
const TASK_TIER = new Function('return ' + m[1])();
const tierOf = (def) => (def && TASK_TIER[def.id]) || 0;

let fails = 0;
const ok = (cond, msg) => { console.log((cond ? 'ok   ' : 'FAIL ') + msg); if (!cond) fails++; };

function setup(level, opts) {
  opts = opts || {};
  const calls = [], events = [];
  const K = { level, done: !!opts.done };
  const sb = {
    console, performance: { now: () => 0 }, Math, JSON, Map, Array, Object, String, Promise,
    setInterval: () => 0, clearInterval: () => {}, setTimeout: () => 0,
    document: { documentElement: { classList: { add() {} } }, getElementById: () => null },
  };
  sb.window = sb;
  sb.__TAURI__ = {
    core: { invoke: (cmd, args) => { calls.push([cmd, args]); return Promise.resolve(cmd === 'desktop_hello' ? 'normal' : null); } },
    event: { listen: () => Promise.resolve(() => {}) },
  };
  const world = { items: [], rooms: [{ name: 'Sala' }, { name: 'Copa' }] };
  sb.DL = { ROLES: { redes: {}, servidores: {}, sysadmin: {}, tecnico: {}, seguranca: {}, funcionario: {}, gerente: {}, atendente: {} } };
  sb.DataLabDemo = {
    scene: { world, running: true, stop() {}, start() {}, update() {} },
    step() {},
    state: { phase: opts.phase || 'play' },
    player: { x: 10, y: 10, look: null },
    crew: { members: [], playerProfile: { name: 'Abner' }, reception: () => null },
    career: { botCan: (def) => K.done || tierOf(def) < K.level },
    ops: { devices: () => [], tasks: () => [], inspect: () => false, health: () => ({ up: true }) },
    staff: null, economy: null,
    game: {
      guest: opts.guest || null, paused: () => !!opts.paused, clock: () => '10:30',
      emit: (ev, info) => events.push([ev, info]), on() {},
    },
  };
  vm.createContext(sb);
  vm.runInContext(read('assets/js/jobs.js'), sb, { filename: 'jobs.js' });
  vm.runInContext(read('assets/js/desktop.js'), sb, { filename: 'desktop.js' });
  return { sb, calls, events, K, afk: sb.DL.Desktop.afk, desk: sb.DL.Desktop };
}

const KINDS = ['pc', 'equip', 'patrol', 'spot'];
// the first task with each id, as desktop.js keeps it (an id can repeat: 'topo' is on the computer for
// network people and, later in the list, on a whiteboard)
const byId = (sb) => { const all = {}; for (const r in sb.DL.JOBS.BY_ROLE) for (const d of sb.DL.JOBS.BY_ROLE[r]) if (d && !all[d.id]) all[d.id] = d; return all; };

// 1. never a task at (or above) the player's own level
for (let level = 1; level <= 10; level++) {
  const { afk, sb } = setup(level);
  const ids = afk.tasks(), all = byId(sb);
  ok(ids.every((id) => tierOf(all[id]) < level), 'nível ' + level + ': ' + ids.length + ' tarefa(s), todas abaixo do nível (maior tier: ' + Math.max(-1, ...ids.map((id) => tierOf(all[id]))) + ')');
  ok(ids.every((id) => KINDS.indexOf(all[id].kind) >= 0 && !all[id].social), 'nível ' + level + ': só tarefas simples (computador, rack, ronda, lugar)');
  ok(['install', 'repair', 'fixnet', 'fixhw', 'fixinc', 'fixtec', 'needs', 'expand', 'frontdesk'].every((id) => ids.indexOf(id) < 0), 'nível ' + level + ': nada de consertos, instalações, ordens ou recepção');
}
// a level 1 player still does the basic chores
ok(setup(1).afk.tasks().length > 0, 'nível 1: tem tarefa básica para fazer');
// the next level unlocks more
ok(setup(5).afk.tasks().length > setup(2).afk.tasks().length, 'nível mais alto libera mais tarefas');

// 2. only in background mode: the timer does nothing in the normal window
{
  const { afk, calls } = setup(3);
  afk.tick(500);
  ok(!calls.some((c) => c[0] === 'desktop_notify'), 'fora do segundo plano: nenhuma tarefa');
}

// 3. in background: one task after the first wait, notified in the balloon and rewarded like a crew task
{
  const { afk, desk, calls, events } = setup(3);
  desk.setBackground(true);
  afk.tick(5);
  ok(afk.state.done === 0, 'segundo plano: espera um pouco antes da primeira tarefa');
  afk.tick(30);
  ok(afk.state.done === 1, 'segundo plano: fez 1 tarefa (' + afk.state.last + ')');
  const n = calls.filter((c) => c[0] === 'desktop_notify');
  ok(n.length === 1 && /^Você · /.test(n[0][1].label) && n[0][1].text.length > 0, 'balão do personagem: "' + (n[0] ? n[0][1].label + ' — ' + n[0][1].text : '') + '"');
  const j = events.filter((e) => e[0] === 'job-done');
  ok(j.length === 1 && j[0][1].auto === true && j[0][1].afk === true, 'recompensa igual à tarefa automática da equipe (job-done auto)');
  afk.tick(30);
  ok(afk.state.done === 1, 'intervalo entre tarefas (não faz uma atrás da outra)');
  afk.tick(100);
  ok(afk.state.done === 2, 'depois do intervalo faz a próxima');
  desk.setBackground(false);
  afk.tick(500);
  ok(afk.state.done === 2, 'voltou ao jogo: para de fazer tarefas');
}

// 4. never outside a running game, while paused or as a guest in someone else's room
ok(setup(5, { phase: 'intro' }).afk.step() === null, 'no menu / intro: não faz nada');
ok(setup(5, { paused: true }).afk.step() === null, 'jogo pausado (tutorial): não faz nada');
ok(setup(5, { guest: { update() {} } }).afk.step() === null, 'convidado no multiplayer: não faz nada');

console.log(fails ? '\n' + fails + ' falha(s)' : '\ntudo ok');
process.exitCode = fails ? 1 : 0;
