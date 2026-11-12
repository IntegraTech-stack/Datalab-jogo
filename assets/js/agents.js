/* DataLab — AI for the hired crew: an employee can take a REAL task and run it with an AI agent
   (OpenCode today; Claude Code and Codex later) on the Agent Gateway (agents/ folder,
   services/agent-service.js). Nothing runs in the browser: the page only sends the task and follows it.
   - Panel per employee (card → "IA"): Tarefa (send, follow live, approve commands, stop),
     Histórico (past tasks, answers, files produced) and Configuração (agent, model, usage limits).
   - In the world: while the agent works the employee sits at a computer ("Executando tarefa de IA"),
     asks in the team chat when a command needs approval, and reports the result when it ends
     (experience like any other task). Without a gateway configured, none of this shows up.
   - The employee's agent choice is saved with the team (crew[].ai); the history lives on the gateway. */
(function () {
  'use strict';
  const DL = window.DL;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const ACTIVE = { queued: 1, starting: 1, running: 1, waiting: 1 };
  const STATUS = { queued: 'Na fila', starting: 'Iniciando agente', running: 'Executando', waiting: 'Aguardando sua aprovação', done: 'Concluída', failed: 'Falhou', aborted: 'Interrompida' };
  const TOOL = { write: '✏️', edit: '✏️', patch: '✏️', read: '📄', bash: '⌨️', list: '📂', glob: '🔎', grep: '🔎', todowrite: '☑️', webfetch: '🌐', websearch: '🌐' };
  const SHELL = { none: 'Sem terminal', files: 'Arquivos e git (ls, cat, mkdir, git…)', scripts: 'Executar scripts (node, python, npm run…)' };
  const fmtN = (n) => Math.round(n || 0).toLocaleString('pt-BR');
  const fmtT = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? s + ' s' : Math.floor(s / 60) + ' min ' + String(s % 60).padStart(2, '0') + ' s'; };
  const when = (t) => { const d = new Date(t); return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }); };
  const newId = () => 'e' + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 7);

  // the employee's agent identity (saved with the team)
  function aiOf(a) {
    const c = a.crew;
    if (!c.ai || typeof c.ai !== 'object' || !/^[A-Za-z0-9_-]{1,40}$/.test(c.ai.id || '')) c.ai = { id: newId(), agent: 'opencode', model: null };
    return c.ai;
  }
  DL.sanitizeAi = (v) => (v && typeof v === 'object' && /^[A-Za-z0-9_-]{1,40}$/.test(v.id || '')
    ? { id: v.id, agent: /^[a-z0-9-]{1,30}$/.test(v.agent || '') ? v.agent : 'opencode', model: typeof v.model === 'string' && v.model.length < 120 ? v.model : null } : null);

  DL.createCrewAI = function (game, sys) {
    const crew = sys.crew, svc = DL.AgentService;
    const chat = () => game.chat;
    const $ = (id) => document.getElementById(id);
    const el = { ov: $('agentsOv'), body: $('agentsBody') };
    const A = {
      open: false, member: null, tab: 'task', msg: '', busy: false,
      catalog: null, settings: null, live: new Map(), byEmp: new Map(), drafts: {},
      hist: null, histFor: null, view: null, file: null, resumed: false, key: '',
    };
    const alive = (a) => crew.members.indexOf(a) >= 0;
    const memberByEmp = (id) => crew.members.find((m) => m.crew.ai && m.crew.ai.id === id) || null;
    const liveOf = (a) => { const ai = a && a.crew.ai; const id = ai && A.byEmp.get(ai.id); return id ? A.live.get(id) || null : null; };
    const enabled = () => !!(svc && svc.enabled);

    /* ---------------- live tasks ---------------- */
    function track(task, member) {
      if (A.live.has(task.id)) return A.live.get(task.id);
      const L = { id: task.id, empId: task.employee.id, name: task.employee.name, task, status: task.status, events: [], usage: task.usage || { tokens: 0, costUsd: 0, steps: 0 },
        started: task.startedAt || task.createdAt || Date.now(), approvals: new Map(), result: null, error: null, last: '', limits: task.limits || (A.settings && A.settings.limits) || null };
      A.live.set(task.id, L);
      A.byEmp.set(L.empId, task.id);
      L.stream = svc.follow(task.id, 0, (ev) => onEvent(L, ev), () => ended(L));
      if (member) ensureJob(member, L);
      return L;
    }

    function add(L, ev) {
      if (ev.type === 'usage') { L.usage = { tokens: ev.tokens, costUsd: ev.costUsd, steps: ev.steps }; return; }
      const i = (ev.type === 'text' || ev.type === 'tool' || ev.type === 'thinking') ? L.events.findIndex((e) => e.type === ev.type && e.id === ev.id) : -1;
      if (i >= 0) L.events[i] = ev; else L.events.push(ev);
      if (L.events.length > 400) L.events.splice(0, L.events.length - 400);
    }

    function onEvent(L, ev) {
      add(L, ev);
      const m = memberByEmp(L.empId);
      switch (ev.type) {
        case 'status':
          L.status = ev.state;
          if (ev.message) L.error = ev.message;
          break;
        case 'step': L.usage.steps = ev.n; break;
        case 'tool': L.last = (TOOL[ev.tool] || '🛠️') + ' ' + ev.tool + (ev.input ? ' ' + ev.input : ''); break;
        case 'approval':
          if (ev.auto) break;
          L.approvals.set(ev.id, ev);
          if (m && alive(m)) chat().post(m, '🔐 Preciso da sua aprovação para rodar: ' + (ev.command || ev.patterns.join(' ')) + ' (IA → Tarefa)', { tone: 'warn' });
          game.toast('warn', 'Aprovação pedida', L.name + ' quer rodar: ' + (ev.command || ev.permission).slice(0, 80));
          break;
        case 'approval_done': L.approvals.delete(ev.id); break;
        case 'end':
          L.status = ev.status;
          L.result = ev.result || null;
          if (ev.usage) L.usage = ev.usage;
          break;
      }
      if (m) ensureJob(m, L);
      if (A.open && A.member && A.member.crew.ai && A.member.crew.ai.id === L.empId && A.tab === 'task' && !A.view) renderLive();
    }

    function ended(L) {
      if (L.done) return;
      L.done = true;
      const m = memberByEmp(L.empId);
      const ok = L.status === 'done';
      const text = L.result && L.result.text ? L.result.text.replace(/\s+/g, ' ').trim() : '';
      const say = ok ? '✅ Tarefa de IA concluída: ' + (text.length > 220 ? text.slice(0, 217) + '…' : text || 'pronto.') + (L.result && L.result.files.length ? ' · ' + L.result.files.length + ' arquivo(s)' : '')
        : L.status === 'aborted' ? '⏹️ Parei a tarefa de IA, como pedido.' : '⚠️ A tarefa de IA não terminou: ' + (L.error || 'falhou');
      const job = m && alive(m) && m.crew.job;
      if (job && job.def.ai === L) { job.def.say = { say, tone: ok ? 'ok' : 'warn', failed: !ok }; job.left = 0; job.total = job.total || 1; }
      else if (m && alive(m)) chat().post(m, say, { tone: ok ? 'ok' : 'warn' });
      game.toast(ok ? 'ok' : 'warn', ok ? 'Tarefa de IA concluída' : 'Tarefa de IA ' + (STATUS[L.status] || '').toLowerCase(), L.name + (ok && text ? ' · ' + text.slice(0, 70) : L.error ? ' · ' + L.error.slice(0, 70) : ''));
      if (ok) game.sfx && game.sfx('done');
      A.byEmp.delete(L.empId);
      A.hist = null; // the history changed
      // the task stays visible in the panel until another one starts
      A.lastOf = A.lastOf || {};
      A.lastOf[L.empId] = L;
      setTimeout(() => A.live.delete(L.id), 0);
      if (A.open) render(true);
      crew.api.renderAll();
    }

    // the employee works at a computer while the agent runs (never pulled away from a fix or a client)
    function ensureJob(m, L) {
      if (!alive(m) || !ACTIVE[L.status] || m.crew.off || m.crew.leaving) return;
      const j = m.crew.job;
      if (j && j.def.ai === L) return;
      if (j && (!j.auto || j.def.kind === 'fix' || j.def.kind === 'repair' || j.def.kind === 'client')) return;
      if (L.noJobUntil && Date.now() < L.noJobUntil) return;
      const def = {
        id: 'ai-task', name: 'Tarefa de IA', verb: 'Executando tarefa de IA', kind: 'pc', skill: DL.ROLE_SKILL[m.crew.profile.role] || 'sistemas', xp: 24, dur: [1e7, 1e7], auto: 0, desc: '',
        ai: L, say: null,
        statusText: () => (STATUS[L.status] || 'Tarefa de IA') + ' · passo ' + (L.usage.steps || 0) + (L.last ? ' · ' + L.last.slice(0, 48) : ''),
        progress: () => (ACTIVE[L.status] ? Math.min(0.95, (L.usage.steps || 0) / Math.max(1, (L.limits && L.limits.maxSteps) || 25)) : 1),
        finish: () => def.say || { say: 'Tarefa de IA encerrada.' },
      };
      const why = crew.api.startJob(m, def, { auto: false, quiet: true });
      if (why) L.noJobUntil = Date.now() + 8000; // no free computer: try again later
    }

    // after a reload: follow the tasks still running for this team
    async function resume() {
      A.resumed = true;
      const r = await svc.list();
      if (!r.ok) { A.resumed = false; return; }
      for (const t of r.data.tasks) if (ACTIVE[t.status] && !A.live.has(t.id)) { const m = memberByEmp(t.employee.id); if (m) track(t, m); }
    }
    const dot = $('aiDot');
    setInterval(() => {
      // top bar: a dot while any task runs (orange when one waits for approval)
      if (dot) {
        const ls = Array.from(A.live.values());
        dot.hidden = !ls.length;
        dot.classList.toggle('is-ask', ls.some((L) => L.approvals.size));
      }
      if (!enabled()) return;
      if (!A.resumed && DL.Cloud && DL.Cloud.signedIn && crew.members.some((m) => m.crew.ai)) resume();
      for (const L of A.live.values()) { const m = memberByEmp(L.empId); if (m) ensureJob(m, L); }
      if (A.open && A.tab === 'task' && liveOf(A.member)) renderLive();
    }, 1000);

    /* ---------------- data ---------------- */
    async function loadCatalog(force) {
      if (A.catalog && !force) return;
      const [c, s] = await Promise.all([svc.agents(), svc.settings()]);
      if (c.ok) A.catalog = c.data; else A.msg = c.message;
      if (s.ok) A.settings = s.data; else if (c.ok) A.msg = s.message;
    }
    async function loadHistory(a) {
      const ai = aiOf(a);
      A.histFor = ai.id;
      const r = await svc.list(ai.id);
      A.hist = r.ok ? r.data.tasks : [];
      if (!r.ok) A.msg = r.message;
    }
    const agentInfo = (id) => (A.catalog ? A.catalog.agents.find((x) => x.id === id) : null);
    function modelOf(a) {
      const ai = aiOf(a), ag = agentInfo(ai.agent);
      const ms = ag ? ag.models : [];
      if (ai.model && ms.some((m) => m.id === ai.model)) return ai.model;
      const def = A.catalog && A.catalog.defaultModel;
      return ms.some((m) => m.id === def) ? def : ms[0] ? ms[0].id : def || '';
    }

    /* ---------------- panel ---------------- */
    // a = an employee, or nothing: then the panel lists the team to pick from
    function open(a) {
      if (a && !alive(a)) a = null;
      A.open = true;
      A.member = a || null;
      A.tab = 'task';
      A.view = null; A.file = null; A.msg = '';
      if (a && A.histFor !== aiOf(a).id) A.hist = null;
      el.ov.classList.add('is-open');
      game.keysReset && game.keysReset();
      render(true);
      if (!enabled()) return;
      loadCatalog().then(() => render(true));
    }
    function close() {
      A.open = false;
      el.ov.classList.remove('is-open');
      if (el.ov.contains(document.activeElement)) document.activeElement.blur();
    }

    function head(a) {
      const R = DL.ROLES[a.crew.profile.role] || {}, L = liveOf(a);
      return '<div class="ai-head"><div><p class="eyebrow-sm"><button type="button" class="linkbtn" data-ai-act="team">← Equipe</button> · inteligência artificial</p><h2 class="card__title card__title--sm" id="agentsTitle">' +
        '<span class="cc__dot" style="background:' + (R.color || '#ccc') + '"></span> ' + esc(a.crew.name) + ' <small>' + esc(R.title || '') + '</small></h2></div>' +
        '<button class="cc__x" type="button" data-ai-act="close" aria-label="Fechar">×</button></div>' +
        '<div class="ai-tabs" role="tablist">' + [['task', 'Tarefa' + (L ? ' •' : '')], ['history', 'Histórico'], ['settings', 'Configuração']].map(([id, l]) =>
          '<button type="button" role="tab" class="chip' + (A.tab === id ? ' is-on' : '') + '" aria-selected="' + (A.tab === id) + '" data-ai-tab="' + id + '">' + l + '</button>').join('') + '</div>';
    }

    const SETUP = '<div class="ai-setup"><p><b>A IA da equipe ainda não está ligada neste jogo.</b> Os funcionários executam as tarefas num servidor de agentes (o Agent Gateway, pasta <code>agents/</code>), que roda o OpenCode isolado. Para ligar:</p><ol>' +
      '<li>No computador ou servidor: <code>cd agents</code> → <code>cp .env.example .env</code> (preencha <code>SUPABASE_URL</code> e <code>SUPABASE_ANON_KEY</code>) → <code>npm start</code></li>' +
      '<li>Jogando em <code>localhost</code>: pronto, o jogo encontra o servidor em <code>127.0.0.1:8787</code>.</li>' +
      '<li>No site publicado: defina <code>agentGatewayUrl</code> em <code>assets/js/supabase/config.js</code> e adicione o endereço ao <code>connect-src</code> da CSP em <code>jogo.html</code>.</li></ol></div>';

    // no employee chosen: the team, to pick who gets the task
    function pickHtml() {
      let h = '<div class="ai-head"><div><p class="eyebrow-sm">Equipe · inteligência artificial</p><h2 class="card__title card__title--sm" id="agentsTitle">🤖 IA da equipe</h2></div>' +
        '<button class="cc__x" type="button" data-ai-act="close" aria-label="Fechar">×</button></div>';
      h += '<p class="ai-lead">Escolha quem vai receber a tarefa. O funcionário executa de verdade com o <b>OpenCode</b> (Claude Code e Codex em breve) e reporta o resultado no chat da equipe.</p>';
      if (!enabled()) h += SETUP;
      const ms = crew.members;
      if (!ms.length) return h + '<p class="ai-empty">Ninguém contratado ainda. Contrate alguém com <kbd>N</kbd> (Equipe → Contratar) e volte aqui.</p>';
      return h + '<ul class="ai-hist">' + ms.map((m) => {
        const R = DL.ROLES[m.crew.profile.role] || {}, L = liveOf(m);
        return '<li><button type="button" class="ai-hrow" data-ai-pick="' + m.crew.id + '"><span class="ai-st' + (L ? ' is-' + esc(L.status) : '') + '">' + (L ? esc(STATUS[L.status] || L.status) : 'Livre') + '</span>' +
          '<span class="ai-hq"><span class="cc__dot" style="background:' + (R.color || '#ccc') + '"></span> ' + esc(m.crew.name) + '</span><span class="ai-hm">' + esc(R.title || '') + '</span></button></li>';
      }).join('') + '</ul>';
    }

    function html() {
      const a = A.member;
      if (!a) return pickHtml();
      let h = head(a);
      if (A.msg) h += '<p class="ai-msg" role="alert">' + esc(A.msg) + '</p>';
      if (!enabled()) return h + SETUP;
      if (!(DL.Cloud && DL.Cloud.signedIn)) return h + '<p class="ai-empty">Entre na sua conta para usar a IA da equipe: o servidor de agentes confere quem você é antes de executar qualquer tarefa.</p>';
      if (!A.catalog) return h + '<p class="ai-empty">Conectando ao servidor de agentes…</p>';
      if (A.file) return h + fileHtml();
      if (A.tab === 'settings') return h + settingsHtml(a);
      if (A.tab === 'history') return h + (A.view ? taskHtml(A.view, false) : historyHtml(a));
      return h + taskTabHtml(a);
    }

    function render(force) {
      if (!A.open) return;
      if (A.member && !alive(A.member)) { close(); return; }
      const ae = document.activeElement;
      if (!force && el.body.contains(ae) && (ae.tagName === 'SELECT' || ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT')) return;
      const ta = el.body.querySelector('textarea[data-ai="prompt"]');
      if (ta) A.drafts[aiOf(A.member).id] = ta.value;
      const focused = ta && ae === ta;
      const sc = el.body.scrollTop;
      el.body.innerHTML = html();
      el.body.scrollTop = sc;
      const nta = el.body.querySelector('textarea[data-ai="prompt"]');
      if (nta && focused) nta.focus();
      if (A.tab === 'history' && !A.hist && !A.view && enabled() && A.catalog) loadHistory(A.member).then(() => render());
      renderLive();
    }

    /* ----- Tarefa ----- */
    function agentSelect(a) {
      const ai = aiOf(a), cur = modelOf(a);
      const ag = agentInfo(ai.agent) || agentInfo('opencode');
      let h = '<div class="ai-pick"><label class="cc__sel"><span class="eyebrow-sm">Agente</span><select data-ai="agent">' +
        A.catalog.agents.filter((x) => x.id !== 'mock' || x.id === ai.agent || /[?&]aimock=1/.test(location.search)).map((x) =>
          '<option value="' + esc(x.id) + '"' + (x.id === ai.agent ? ' selected' : '') + (x.available ? '' : ' disabled') + '>' + esc(x.label) + (x.available ? '' : ' · ' + esc(x.reason || 'indisponível')) + '</option>').join('') + '</select></label>';
      h += '<label class="cc__sel"><span class="eyebrow-sm">Modelo</span><select data-ai="model">' + (ag && ag.models.length ? ag.models.map((m) =>
        '<option value="' + esc(m.id) + '"' + (m.id === cur ? ' selected' : '') + '>' + esc(m.name) + ' · ' + esc(m.provider) + (m.free ? ' · grátis' : '') + '</option>').join('') : '<option value="">Nenhum modelo disponível</option>') + '</select></label></div>';
      return h;
    }

    function taskTabHtml(a) {
      const L = liveOf(a), ai = aiOf(a);
      let h = '';
      if (L) {
        h += '<div class="ai-live" data-ai-live>' + liveHeadHtml(L) + '<ol class="ai-tl" data-ai-tl>' + timelineHtml(L.events, true) + '</ol></div>';
        return h;
      }
      h += agentSelect(a);
      h += '<label class="ai-prompt"><span class="eyebrow-sm">O que ' + esc(a.crew.name) + ' deve fazer?</span><textarea data-ai="prompt" rows="4" maxlength="' + ((A.settings && A.settings.caps.promptChars) || 4000) + '" placeholder="Ex.: Crie um script de backup em bash para /srv/dados e um README explicando como agendar no cron.">' + esc(A.drafts[ai.id] || '') + '</textarea></label>';
      const u = A.settings && A.settings.usage, lim = A.settings && A.settings.limits;
      h += '<div class="ai-send"><button type="button" class="btn btn--sm btn--primary" data-ai-act="send"' + (A.busy ? ' disabled' : '') + '>Enviar tarefa <span class="arrow">→</span></button>' +
        (u && lim ? '<span class="ai-quota">Hoje: ' + u.tasks + ' / ' + lim.dailyTasks + ' tarefas · ' + fmtN(u.tokens) + ' tokens' + (u.costUsd ? ' · US$ ' + u.costUsd.toFixed(2) : '') + '</span>' : '') + '</div>';
      h += '<p class="ai-note">Roda de verdade num espaço de trabalho isolado só de ' + esc(a.crew.name) + ': lê e escreve arquivos ali, usa os comandos permitidos e pede sua aprovação para o resto. Sem acesso à internet, ao servidor ou aos arquivos do jogo.</p>';
      const last = A.lastOf && A.lastOf[ai.id];
      if (last) h += '<div class="ai-lastwrap"><p class="eyebrow-sm">Última tarefa</p>' + taskHtml({ id: last.id, prompt: last.task.prompt, status: last.status, events: last.events, result: last.result, usage: last.usage, error: last.error, model: last.task.model, createdAt: last.task.createdAt, endedAt: Date.now(), employee: last.task.employee }, true) + '</div>';
      return h;
    }

    function liveHeadHtml(L) {
      const lim = L.limits || {};
      return '<div class="ai-lhead"><span class="ai-st is-' + esc(L.status) + '">' + esc(STATUS[L.status] || L.status) + '</span>' +
        '<span class="ai-meta" data-ai-meta>' + esc(metaText(L)) + '</span>' +
        (ACTIVE[L.status] ? '<button type="button" class="btn btn--sm is-warn" data-ai-act="abort" data-id="' + esc(L.id) + '">Parar</button>' : '') + '</div>' +
        '<p class="ai-prompt-q">“' + esc(L.task.prompt.slice(0, 400)) + '”</p>' +
        '<div class="ai-bar"><i style="transform:scaleX(' + Math.min(1, (L.usage.steps || 0) / Math.max(1, lim.maxSteps || 25)).toFixed(3) + ')"></i></div>';
    }
    function metaText(L) {
      const lim = L.limits || {};
      return 'Passo ' + (L.usage.steps || 0) + (lim.maxSteps ? '/' + lim.maxSteps : '') + ' · ' + fmtN(L.usage.tokens) + ' tokens' + (L.usage.costUsd ? ' · US$ ' + L.usage.costUsd.toFixed(3) : '') + ' · ' + fmtT(Date.now() - L.started) + ' · ' + L.task.model;
    }

    // only the live parts (no rebuild of the whole panel while a task streams)
    function renderLive() {
      if (!A.open || A.tab !== 'task' || A.view || A.file) return;
      const L = liveOf(A.member), box = el.body.querySelector('[data-ai-live]');
      if (!L || !box) {
        // a task started (or was picked up after a reload) while the form was on screen: draw the live view once
        if (L && A.catalog && !A.redraw) { A.redraw = true; try { render(true); } finally { A.redraw = false; } }
        return;
      }
      const k = L.status + ':' + L.events.length + ':' + (L.events.length ? L.events[L.events.length - 1].seq : 0) + ':' + L.approvals.size;
      const meta = box.querySelector('[data-ai-meta]');
      if (meta) { const mt = metaText(L); if (meta.textContent !== mt) meta.textContent = mt; }
      if (box.dataset.k === k) return;
      const tl = box.querySelector('[data-ai-tl]');
      const stick = tl && tl.scrollHeight - tl.scrollTop - tl.clientHeight < 40;
      box.dataset.k = k;
      const open = new Set(Array.from(box.querySelectorAll('details[open]')).map((d) => d.dataset.k));
      box.innerHTML = liveHeadHtml(L) + '<ol class="ai-tl" data-ai-tl>' + timelineHtml(L.events, true) + '</ol>';
      box.dataset.k = k;
      box.querySelectorAll('details[data-k]').forEach((d) => { if (open.has(d.dataset.k)) d.open = true; });
      const ntl = box.querySelector('[data-ai-tl]');
      if (ntl && (stick || !tl)) ntl.scrollTop = ntl.scrollHeight;
    }

    function timelineHtml(events, live) {
      let h = '';
      for (const e of events) {
        switch (e.type) {
          case 'text': h += '<li class="ai-ev ai-ev--text"><div class="ai-say">' + esc(e.text) + '</div></li>'; break;
          case 'thinking': h += '<li class="ai-ev ai-ev--think"><details data-k="th' + esc(e.id) + '"><summary>💭 Pensando…</summary><p>' + esc(e.text) + '</p></details></li>'; break;
          case 'tool': {
            const ok = e.status === 'completed', bad = e.status === 'error';
            h += '<li class="ai-ev ai-ev--tool' + (ok ? ' is-ok' : bad ? ' is-bad' : ' is-run') + '"><details data-k="tl' + esc(e.id) + '"><summary><span class="ai-ico">' + (TOOL[e.tool] || '🛠️') + '</span><b>' + esc(e.tool) + '</b> <code>' + esc(e.input || e.title || '') + '</code>' +
              '<span class="ai-ts">' + (ok ? '✓' : bad ? '✗ bloqueado/erro' : '…') + '</span></summary>' + (e.output ? '<pre>' + esc(e.output) + '</pre>' : '') + '</details></li>';
            break;
          }
          case 'todo': h += '<li class="ai-ev ai-ev--todo"><ul>' + e.items.map((x) => '<li class="is-' + esc(x.status) + '">' + (x.status === 'completed' ? '☑' : x.status === 'in_progress' ? '▶' : '☐') + ' ' + esc(x.content) + '</li>').join('') + '</ul></li>'; break;
          case 'file': h += '<li class="ai-ev ai-ev--file">📁 Arquivo alterado: <button type="button" class="linkbtn" data-ai-file="' + esc(e.path) + '">' + esc(e.path) + '</button></li>'; break;
          case 'approval': {
            if (e.auto) { h += '<li class="ai-ev ai-ev--warn">🔐 Recusado automaticamente: <code>' + esc(e.command || e.patterns.join(' ')) + '</code></li>'; break; }
            const L = live && liveOf(A.member), pending = L && L.approvals.has(e.id);
            h += '<li class="ai-ev ai-ev--ask' + (pending ? ' is-pending' : '') + '"><p>🔐 <b>' + esc(e.permission) + '</b> pede aprovação para: <code>' + esc(e.command || e.patterns.join(' ')) + '</code></p>' +
              (pending ? '<div class="ai-ask"><button type="button" class="btn btn--sm btn--primary" data-ai-ap="once" data-ap="' + esc(e.id) + '">Aprovar uma vez</button><button type="button" class="btn btn--sm" data-ai-ap="reject" data-ap="' + esc(e.id) + '">Recusar</button></div>' : '') + '</li>';
            break;
          }
          case 'approval_done': h += '<li class="ai-ev ai-ev--sys">' + (e.reply === 'once' ? '✔ Comando aprovado' : '✖ Comando recusado' + (e.by === 'timeout' ? ' (sem resposta a tempo)' : '')) + '</li>'; break;
          case 'retry': h += '<li class="ai-ev ai-ev--warn">↻ Tentando de novo: ' + esc(e.message) + '</li>'; break;
          case 'error': h += '<li class="ai-ev ai-ev--bad">⚠️ ' + esc(e.message) + '</li>'; break;
          case 'stopping': h += '<li class="ai-ev ai-ev--warn">⏹️ ' + esc(e.message) + '</li>'; break;
          case 'status': if (e.state === 'starting') h += '<li class="ai-ev ai-ev--sys">▶ Iniciando o agente no espaço de trabalho isolado</li>'; break;
          case 'end': h += '<li class="ai-ev ai-ev--sys">■ ' + esc(STATUS[e.status] || e.status) + '</li>'; break;
        }
      }
      return h || '<li class="ai-ev ai-ev--sys">Aguardando o agente…</li>';
    }

    /* ----- Histórico ----- */
    function historyHtml() {
      if (!A.hist) return '<p class="ai-empty">Carregando histórico…</p>';
      if (!A.hist.length) return '<p class="ai-empty">Nenhuma tarefa ainda. Mande a primeira na aba Tarefa.</p>';
      return '<ul class="ai-hist">' + A.hist.map((t) => '<li><button type="button" class="ai-hrow" data-ai-task="' + esc(t.id) + '"><span class="ai-st is-' + esc(t.status) + '">' + esc(STATUS[t.status] || t.status) + '</span>' +
        '<span class="ai-hq">' + esc(t.prompt) + '</span><span class="ai-hm">' + when(t.createdAt) + (t.endedAt && t.startedAt ? ' · ' + fmtT(t.endedAt - t.startedAt) : '') + ' · ' + fmtN(t.usage && t.usage.tokens) + ' tokens · ' + esc(t.model) +
        (t.result && t.result.files.length ? ' · ' + t.result.files.length + ' arquivo(s)' : '') + '</span></button></li>').join('') + '</ul>';
    }

    function taskHtml(t, compact) {
      let h = '<div class="ai-task">';
      if (!compact) h += '<button type="button" class="linkbtn" data-ai-act="back">← Voltar ao histórico</button>';
      h += '<div class="ai-lhead"><span class="ai-st is-' + esc(t.status) + '">' + esc(STATUS[t.status] || t.status) + '</span><span class="ai-meta">' + (t.createdAt ? when(t.createdAt) + ' · ' : '') +
        fmtN(t.usage && t.usage.tokens) + ' tokens · ' + ((t.usage && t.usage.steps) || 0) + ' passos' + (t.usage && t.usage.costUsd ? ' · US$ ' + t.usage.costUsd.toFixed(3) : '') + ' · ' + esc(t.model || '') + '</span></div>';
      h += '<p class="ai-prompt-q">“' + esc(t.prompt) + '”</p>';
      if (t.error && t.status !== 'done') h += '<p class="ai-msg">' + esc(t.error) + '</p>';
      if (t.result) {
        h += '<div class="ai-result"><span class="eyebrow-sm">Resposta entregue</span><div class="ai-say">' + esc(t.result.text || '(sem texto)') + '</div>';
        if (t.result.files && t.result.files.length) h += '<span class="eyebrow-sm">Arquivos</span><ul class="ai-files">' + t.result.files.map((f) => '<li><button type="button" class="linkbtn" data-ai-file="' + esc(f) + '">📄 ' + esc(f) + '</button></li>').join('') + '</ul>';
        h += '</div>';
      }
      if (!compact && t.events) h += '<details class="ai-steps"><summary>Passo a passo da execução (' + t.events.filter((e) => e.type === 'tool').length + ' ações)</summary><ol class="ai-tl">' + timelineHtml(t.events, false) + '</ol></details>';
      return h + '</div>';
    }

    function fileHtml() {
      const f = A.file;
      return '<div class="ai-file"><button type="button" class="linkbtn" data-ai-act="unfile">← Voltar</button><p class="eyebrow-sm">' + esc(f.path) + (f.size != null ? ' · ' + fmtN(f.size) + ' bytes' : '') + '</p>' +
        (f.error ? '<p class="ai-msg">' + esc(f.error) + '</p>' : f.content == null ? '<p class="ai-empty">Carregando…</p>' : '<pre class="ai-pre">' + esc(f.content) + '</pre>') + '</div>';
    }

    /* ----- Configuração ----- */
    function settingsHtml(a) {
      const S = A.settings;
      let h = '<p class="ai-lead">O agente e o modelo valem para <b>' + esc(a.crew.name) + '</b>. Os limites valem para toda a sua equipe e nunca passam do teto do servidor.</p>';
      h += agentSelect(a);
      if (!S) return h + '<p class="ai-empty">Sem dados de limite.</p>';
      const L = S.limits, C = S.caps;
      const num = (k, label, max, step, hint) => '<label class="ai-lim"><span class="eyebrow-sm">' + label + '</span><input type="number" data-lim="' + k + '" min="' + (k === 'dailyCostUsd' ? 0 : 1) + '" max="' + max + '" step="' + (step || 1) + '" value="' + L[k] + '"><small>máx. ' + (k === 'maxTokens' ? fmtN(max) : max) + (hint ? ' · ' + hint : '') + '</small></label>';
      h += '<div class="ai-lims">' + num('dailyTasks', 'Tarefas por dia', C.dailyTasks) + num('concurrent', 'Ao mesmo tempo', C.concurrent) + num('maxMinutes', 'Minutos por tarefa', C.maxMinutes) +
        num('maxSteps', 'Passos por tarefa', C.maxSteps) + num('maxTokens', 'Tokens por tarefa', C.maxTokens, 1000) + num('dailyCostUsd', 'Custo por dia (US$)', C.dailyCostUsd, 0.05, 'modelos grátis não contam') + '</div>';
      h += '<label class="cc__sel ai-wide"><span class="eyebrow-sm">Comandos no terminal</span><select data-lim="shell">' + Object.keys(SHELL).map((k) =>
        '<option value="' + k + '"' + (L.shell === k ? ' selected' : '') + (C.shellLevels.indexOf(k) < 0 ? ' disabled' : '') + '>' + SHELL[k] + (C.shellLevels.indexOf(k) < 0 ? ' · só no container isolado' : '') + '</option>').join('') + '</select></label>';
      h += '<label class="cc__sel ai-wide"><span class="eyebrow-sm">Comando fora da lista</span><select data-lim="approvals"><option value="ask"' + (L.approvals === 'ask' ? ' selected' : '') + '>Perguntar para mim</option><option value="reject"' + (L.approvals === 'reject' ? ' selected' : '') + '>Recusar automaticamente</option></select></label>';
      h += '<label class="ai-check"><input type="checkbox" data-lim="web"' + (L.web ? ' checked' : '') + (C.web ? '' : ' disabled') + '> Permitir acesso à web (buscar páginas)' + (C.web ? '' : ' · desativado no servidor') + '</label>';
      h += '<div class="ai-send"><button type="button" class="btn btn--sm btn--primary" data-ai-act="save">Salvar limites</button><span class="ai-quota">Hoje: ' + S.usage.tasks + ' tarefa(s) · ' + fmtN(S.usage.tokens) + ' tokens · US$ ' + (S.usage.costUsd || 0).toFixed(2) + '</span></div>';
      h += '<p class="ai-note">Sempre bloqueado: rede (curl, ssh…), sudo, instalar pacotes, ler variáveis de ambiente e qualquer arquivo fora do espaço de trabalho do funcionário.</p>';
      return h;
    }

    /* ---------------- actions ---------------- */
    async function send() {
      const a = A.member, ai = aiOf(a);
      const ta = el.body.querySelector('textarea[data-ai="prompt"]');
      const prompt = ta ? ta.value.trim() : '';
      if (!prompt) { A.msg = 'Descreva a tarefa.'; render(true); return; }
      A.busy = true; A.msg = ''; render(true);
      const r = await svc.create({ id: ai.id, name: a.crew.name, role: (DL.ROLES[a.crew.profile.role] || {}).title || a.crew.profile.role }, ai.agent, modelOf(a), prompt);
      A.busy = false;
      if (!r.ok) { A.msg = r.message; render(true); return; }
      A.drafts[ai.id] = '';
      const cur = el.body.querySelector('textarea[data-ai="prompt"]');
      if (cur) cur.value = ''; // render() keeps what is in the box as the draft
      if (A.lastOf) delete A.lastOf[ai.id];
      const L = track(r.data, a);
      L.limits = A.settings ? A.settings.limits : null;
      chat().post(a, 'Recebi a tarefa! Vou executar com o ' + ((agentInfo(ai.agent) || {}).label || 'agente') + '. 🤖');
      if (A.settings) A.settings.usage.tasks++;
      A.hist = null;
      render(true);
      crew.api.renderAll();
    }

    async function saveLimits() {
      const lim = {};
      el.body.querySelectorAll('[data-lim]').forEach((i) => {
        const k = i.dataset.lim;
        lim[k] = i.type === 'checkbox' ? i.checked : i.type === 'number' ? Number(i.value) : i.value;
      });
      const r = await svc.saveSettings(lim);
      if (r.ok) { A.settings = r.data; A.msg = ''; game.toast('ok', 'Limites salvos', 'Valem para toda a equipe'); } else A.msg = r.message;
      render(true);
    }

    async function showFile(path) {
      const a = A.member;
      A.file = { path, content: null };
      render(true);
      const r = await svc.file(aiOf(a).id, path);
      if (!A.file || A.file.path !== path) return;
      A.file = r.ok ? r.data : { path, error: r.message };
      render(true);
    }

    if (el.ov) {
      el.ov.addEventListener('pointerdown', (ev) => { if (ev.target === el.ov) close(); });
      el.body.addEventListener('keydown', (ev) => { ev.stopPropagation(); if (ev.code === 'Escape') close(); });
      el.body.addEventListener('input', (ev) => { if (ev.target.dataset.ai === 'prompt' && A.member) A.drafts[aiOf(A.member).id] = ev.target.value; });
      el.body.addEventListener('change', (ev) => {
        const s = ev.target, a = A.member;
        if (!a) return;
        if (s.dataset.ai === 'agent') { aiOf(a).agent = s.value; aiOf(a).model = null; render(true); }
        else if (s.dataset.ai === 'model') { aiOf(a).model = s.value; render(true); }
      });
      el.body.addEventListener('click', async (ev) => {
        const t = ev.target.closest('button');
        if (!t) return;
        if (t.dataset.aiTab) { A.tab = t.dataset.aiTab; A.view = null; A.file = null; A.msg = ''; if (t.dataset.aiTab === 'settings') loadCatalog(true).then(() => render(true)); render(true); return; }
        if (t.dataset.aiFile) { showFile(t.dataset.aiFile); return; }
        if (t.dataset.aiPick) { const m = crew.members.find((x) => x.crew.id === +t.dataset.aiPick); if (m) { crew.select(m); open(m); } return; }
        if (t.dataset.aiAct === 'team') { open(null); return; }
        if (t.dataset.aiTask) {
          const r = await svc.get(t.dataset.aiTask);
          if (r.ok) A.view = r.data.task; else A.msg = r.message;
          render(true);
          return;
        }
        if (t.dataset.aiAp) {
          const L = liveOf(A.member);
          if (!L) return;
          t.disabled = true;
          const r = await svc.approve(L.id, t.dataset.ap, t.dataset.aiAp);
          if (!r.ok) { A.msg = r.message; render(true); }
          else L.approvals.delete(t.dataset.ap);
          renderLive();
          return;
        }
        switch (t.dataset.aiAct) {
          case 'close': close(); break;
          case 'send': send(); break;
          case 'save': saveLimits(); break;
          case 'back': A.view = null; render(true); break;
          case 'unfile': A.file = null; render(true); break;
          case 'abort': {
            t.disabled = true;
            const r = await svc.abort(t.dataset.id);
            if (!r.ok) { A.msg = r.message; render(true); }
            break;
          }
        }
      });
    }

    return {
      open, close,
      get isOpen() { return A.open; },
      get enabled() { return enabled(); },
      // what the employee card shows (crew.js): running / waiting for approval
      badgeOf(a) { const L = liveOf(a); return !L ? '' : L.approvals.size ? 'ask' : 'run'; },
      liveOf,
    };
  };
})();
