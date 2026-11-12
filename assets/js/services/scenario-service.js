/* DataLab — Scenario service: the career problems and the terminal lessons from the database.
   The game ships the same data (problems-data.js, generated into supabase/seed_scenarios.sql) and plays
   with it offline; when a Supabase project is configured, the tables replace it (catalog: public read,
   no login needed). Rows are turned back into the shape of problems-data.js and handed to
   DL.applyScenarioData, which keeps the bundled copy of anything that doesn't look right. */
(function () {
  'use strict';
  const DL = window.DL;

  // database rows → { lessons, problems, ranks, help } (the shape of problems-data.js)
  function toData(t) {
    const help = {};
    for (const h of t.help) if (!h.os) help[h.key] = { cmd: h.cmd, ex: h.example, what: h.what, when: h.when_to_use };
    const cards = {};
    for (const s of t.stepHelp.slice().sort((a, b) => a.sort - b.sort)) (cards[s.step_id] = cards[s.step_id] || []).push(s.help_key);
    const step = (s) => {
      const o = { text: s.text, help: cards[s.id] || [] };
      if (s.expected_cmd) o.cmd = s.expected_cmd;
      if (s.auto_cmd) o.auto = s.auto_cmd;
      if (s.action) o.action = s.action;
      if (s.device_role) o.device = s.device_role;
      if (s.step_type === 'answer') { o.type = 'answer'; o.answer = s.answer; } else o.check = s.check_rule;
      return o;
    };
    const stepsOf = (field, id) => t.steps.filter((s) => s[field] === id).sort((a, b) => a.ord - b.ord).map(step);
    const lessons = {};
    for (const l of t.lessons) lessons[l.id] = { title: l.title, goal: l.goal, vars: l.vars || {}, steps: stepsOf('lesson_id', l.id) };
    const problems = t.problems.slice().sort((a, b) => a.n - b.n).map((p) => {
      const o = {
        id: p.id, n: p.n, rank: p.rank_id, title: p.title, summary: p.summary, difficulty: p.difficulty, xp: p.xp, credits: p.credits,
        skill: p.skill, roles: p.roles || [], bot_minutes: p.bot_minutes, weight: Number(p.weight) || 1, trigger: p.trigger_kind, complete: p.complete,
        target: p.target, vars: p.vars || {},
      };
      if (p.handoff) o.handoff = p.handoff;
      if (p.lesson_id) o.lesson = p.lesson_id;
      if (p.when_rule) o.when = p.when_rule;
      if (p.setup) o.setup = p.setup;
      if (p.devices && Object.keys(p.devices).length) o.devices = p.devices;
      if (p.bot_action) o.bot = p.bot_action;
      const steps = stepsOf('problem_id', p.id);
      if (steps.length) o.steps = steps;
      return o;
    });
    const ranks = t.ranks.slice().sort((a, b) => a.level - b.level).map((r) => ({ id: r.id, level: r.level, name: r.name, xp_to_next: r.xp_to_next, distinct_to_next: r.distinct_to_next }));
    return { lessons, problems, ranks, help };
  }

  const S = { status: 'bundled', error: null };

  async function load() {
    if (!DL.Cloud || !(await DL.Cloud.init()) || !DL.Cloud.configured) return false;
    const get = async (table, cols, filter) => {
      let q = DL.Cloud.from(table).select(cols);
      if (filter) q = filter(q);
      const { data, error } = await q;
      if (error) throw new Error(table + ': ' + (error.code || error.message));
      return data || [];
    };
    try {
      const [ranks, help, lessons, problems, steps, stepHelp] = await Promise.all([
        get('career_ranks', 'id, level, name, xp_to_next, distinct_to_next'),
        get('command_help', 'key, cmd, example, what, when_to_use, os, sort'),
        get('scenario_lessons', 'id, title, goal, vars'),
        get('problems', 'id, n, rank_id, title, summary, handoff, difficulty, xp, credits, skill, roles, bot_minutes, weight, trigger_kind, complete, lesson_id, when_rule, target, setup, vars, devices, bot_action', (q) => q.eq('active', true)),
        get('scenario_steps', 'id, lesson_id, problem_id, ord, step_type, text, expected_cmd, action, check_rule, answer, device_role, auto_cmd'),
        get('scenario_step_help', 'step_id, help_key, sort'),
      ]);
      // an empty catalog (seed not run yet) keeps the bundled data
      if (!problems.length || !lessons.length) { S.status = 'bundled'; return false; }
      const ok = DL.applyScenarioData(toData({ ranks, help, lessons, problems, steps, stepHelp }), 'db');
      S.status = ok ? 'db' : 'bundled';
      return ok;
    } catch (e) {
      // offline, tables missing (migration not applied)… the bundled copy keeps working
      S.status = 'bundled';
      S.error = String(e.message || e);
      console.info('DataLab: cenários do jogo (sem o banco: ' + S.error + ')');
      return false;
    }
  }

  DL.ScenarioService = { load, toData, get status() { return S.status; }, get error() { return S.error; } };
  if (window.DATALAB_CONFIG) load();
})();
