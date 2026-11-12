// DataLab — build supabase/seed_scenarios.sql from the game's own files (no browser needed):
//   assets/js/problems-data.js  → career_ranks, scenario_lessons, problems, scenario_steps
//   assets/js/terminal.js + winserver.js (HELP) → command_help, scenario_step_help
// usage: node supabase/scripts/build-scenarios.mjs   (writes supabase/seed_scenarios.sql, UTF-8)
// The game keeps the same data bundled (offline play); online it reads these tables (scenario-service.js).
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import vm from 'node:vm';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
// run the browser scripts in a sandbox: they only fill window.DL (ops.js + winserver.js: the Windows help cards
// and lessons, which steps on a Windows Server use)
const sandbox = { window: { DL: {} }, console };
vm.createContext(sandbox);
for (const f of ['assets/js/terminal.js', 'assets/js/problems-data.js', 'assets/js/ops.js', 'assets/js/winserver.js']) vm.runInContext(readFileSync(path.join(root, f), 'utf8'), sandbox, { filename: f });
const { lessons, problems, ranks } = sandbox.window.DL.SCENARIO_DATA;
const HELP = sandbox.window.DL.CMD_HELP;
// lessons a problem names that live in code (winserver.js: winsetup, win-link, winsvc…): a row each, so the
// foreign key holds — without steps the game ignores the row and keeps the lesson from the code
const inCode = [...new Set(problems.map((x) => x.lesson).filter((l) => l && !lessons[l]))];
for (const l of inCode) if (!sandbox.window.DL.LESSONS[l]) throw new Error('lição desconhecida "' + l + '"');

const q = (v) => (v === null || v === undefined ? 'null' : typeof v === 'number' ? String(v) : typeof v === 'boolean' ? String(v) : "'" + String(v).replace(/'/g, "''") + "'");
const j = (v) => (v === null || v === undefined ? 'null' : q(JSON.stringify(v)) + '::jsonb');
const arr = (a) => 'array[' + (a || []).map(q).join(', ') + ']::text[]';
const out = [];
const p = (s) => out.push(s);

// every help key a step uses must exist
for (const [owner, steps] of Object.entries(lessons).map(([k, l]) => [k, l.steps]).concat(problems.map((x) => [x.id, x.steps || []])))
  for (const s of steps) for (const k of s.help || []) if (!HELP[k]) throw new Error('ajuda desconhecida "' + k + '" em ' + owner);

p('-- DataLab · seed dos cenários (gerado por supabase/scripts/build-scenarios.mjs a partir de assets/js/problems-data.js e');
p('-- assets/js/terminal.js — não edite à mão). Pode rodar de novo: atualiza as linhas e reescreve os passos.');
p('begin;');

p('\n-- career ranks (only the ones with problems of their own)');
for (const r of ranks)
  p(`insert into public.career_ranks (id, level, name, xp_to_next, distinct_to_next) values (${q(r.id)}, ${r.level}, ${q(r.name || r.id)}, ${q(r.xp_to_next || null)}, ${r.distinct_to_next || 0}) on conflict (id) do update set level = excluded.level, name = excluded.name, xp_to_next = excluded.xp_to_next, distinct_to_next = excluded.distinct_to_next;`);

p('\n-- command help (Linux / switch; os = win: the Windows Server cards, kept for the steps — the game reads them from winserver.js)');
Object.keys(HELP).forEach((k, i) => {
  const h = HELP[k];
  p(`insert into public.command_help (key, cmd, example, what, when_to_use, os, sort) values (${q(k)}, ${q(h.cmd)}, ${q(h.ex)}, ${q(h.what)}, ${q(h.when)}, ${q(h.os || null)}, ${i}) on conflict (key) do update set cmd = excluded.cmd, example = excluded.example, what = excluded.what, when_to_use = excluded.when_to_use, os = excluded.os, sort = excluded.sort;`);
});

p('\n-- lessons');
for (const [id, l] of Object.entries(lessons))
  p(`insert into public.scenario_lessons (id, title, goal, vars) values (${q(id)}, ${q(l.title)}, ${q(l.goal)}, ${j(l.vars || {})}) on conflict (id) do update set title = excluded.title, goal = excluded.goal, vars = excluded.vars;`);
for (const id of inCode)
  p(`insert into public.scenario_lessons (id, title, goal, vars) values (${q(id)}, ${q('(no código: winserver.js)')}, ${q('Lição definida no jogo; esta linha só referencia.')}, '{}'::jsonb) on conflict (id) do nothing;`);

p('\n-- problems');
for (const x of problems)
  p(`insert into public.problems (id, n, rank_id, title, summary, handoff, difficulty, xp, credits, skill, roles, bot_minutes, weight, trigger_kind, complete, lesson_id, when_rule, target, setup, vars, devices, bot_action, active, updated_at) values (` +
    [q(x.id), x.n, q(x.rank), q(x.title), q(x.summary), q(x.handoff || null), x.difficulty, x.xp, x.credits || 0, q(x.skill), arr(x.roles), x.bot_minutes || 10, x.weight || 1,
      q(x.trigger || 'random'), q(x.complete), q(x.lesson || null), q(x.when || null), j(x.target), j(x.setup || null), j(x.vars || {}), j(x.devices || {}), q(x.bot || null), 'true', 'now()'].join(', ') +
    `) on conflict (id) do update set n = excluded.n, rank_id = excluded.rank_id, title = excluded.title, summary = excluded.summary, handoff = excluded.handoff, difficulty = excluded.difficulty, xp = excluded.xp, credits = excluded.credits, skill = excluded.skill, roles = excluded.roles, bot_minutes = excluded.bot_minutes, weight = excluded.weight, trigger_kind = excluded.trigger_kind, complete = excluded.complete, lesson_id = excluded.lesson_id, when_rule = excluded.when_rule, target = excluded.target, setup = excluded.setup, vars = excluded.vars, devices = excluded.devices, bot_action = excluded.bot_action, active = true, updated_at = now();`);
// problems taken out of the game stay in the table (solved runs point at them), switched off
p(`update public.problems set active = false, updated_at = now() where active and id <> all (${arr(problems.map((x) => x.id))});`);

p('\n-- steps (rewritten) + their help cards');
p(`delete from public.scenario_steps where lesson_id = any (${arr(Object.keys(lessons))}) or problem_id = any (${arr(problems.map((x) => x.id))});`);
const step = (owner, id, s, k) => {
  const cols = `${owner === 'lesson' ? q(id) : 'null'}, ${owner === 'problem' ? q(id) : 'null'}, ${k}, ${q(s.type === 'answer' ? 'answer' : 'command')}, ${q(s.text)}, ${q(s.cmd || null)}, ${q(s.action || null)}, ${j(s.type === 'answer' ? null : s.check)}, ${j(s.type === 'answer' ? s.answer : null)}, ${q(s.device || null)}, ${q(s.auto || null)}`;
  const ins = `insert into public.scenario_steps (lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role, auto_cmd) values (${cols})`;
  if (!(s.help || []).length) return p(ins + ';');
  p(`with s as (${ins} returning id) insert into public.scenario_step_help (step_id, help_key, sort) select s.id, h.key, h.n - 1 from s, unnest(${arr(s.help)}) with ordinality as h(key, n);`);
};
for (const [id, l] of Object.entries(lessons)) l.steps.forEach((s, k) => step('lesson', id, s, k));
for (const x of problems) (x.steps || []).forEach((s, k) => step('problem', x.id, s, k));

p('\ncommit;');
writeFileSync(path.join(root, 'supabase/seed_scenarios.sql'), out.join('\n') + '\n');
console.log('seed_scenarios.sql: ' + Object.keys(lessons).length + ' lições, ' + problems.length + ' problemas');
