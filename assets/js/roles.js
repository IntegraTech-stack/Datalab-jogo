/* DataLab — player-made roles (Cargos). A role is a plain configuration — name, description, tasks,
   equipment, areas, skills and the problems it detects — validated by `sanitize` and turned into
   real crew tasks by `compose`, using building blocks from jobs.js. Nothing here runs player code:
   the "advanced" role only edits the same configuration as JSON (a code field is stored, never run).
   "Criar cargo com IA" turns a description into a configuration with a local interpreter
   (DL.RoleAI); a remote model can be plugged in later through DL.RoleAI.remote. */
(function () {
  'use strict';
  const DL = window.DL;
  const JOBS = DL.JOBS, H = JOBS.h;
  const KEY = 'datalab.roles.v1';
  const rand = Math.random;
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

  /* ------------------------------------------------------------------ */
  /* Vocabulary                                                          */
  /* ------------------------------------------------------------------ */
  const SKILL_IDS = DL.SKILLS.map((s) => s[0]);
  const SKILL_NAME = Object.fromEntries(DL.SKILLS);
  const WORK = [['net', 'Gráficos de rede'], ['srv', 'Status dos servidores'], ['code', 'Terminal'], ['cam', 'Câmeras'], ['doc', 'Documentos'], ['kpi', 'Indicadores']];
  const EQUIP = [
    ['pc', 'Computadores'], ['st:noc', 'Estação de NOC'], ['st:tech', 'Estação técnica'], ['st:admin', 'Estação de admin'], ['st:gamer', 'Setups gamer'],
    ['rack', 'Racks e servidores'], ['switch', 'Switches'], ['storage', 'Storage'], ['crac', 'Refrigeração'], ['coffee', 'Copa'],
  ];
  // room types from build mode (Espaços → Tipo); rooms without one are guessed from name / theme
  const AREAS = [['any', 'Qualquer sala'], ['noc', 'NOC'], ['servers', 'Servidores'], ['office', 'Escritório'], ['reception', 'Recepção'], ['power', 'Sala elétrica'], ['support', 'Atendimento'], ['custom', 'Personalizada']];
  const FAULTS = [['link', 'Interface desligada'], ['cable', 'Cabo solto'], ['port', 'Porta do switch em erro'], ['service', 'Serviço parado'], ['disk', 'Disco cheio']];
  const FREQ = [[0, 'Só quando pedir'], [1, 'Às vezes'], [3, 'Frequente']];
  const COLORS = ['#a0c3ec', '#ffc285', '#c4b5fd', '#ff7a17', '#7ee0a1', '#f2c14e', '#f472b6', '#5eead4', '#fca5a5', '#dadbdf'];
  const SKILL_COLOR = { redes: '#a0c3ec', servidores: '#ffc285', sistemas: '#c4b5fd', seguranca: '#ff7a17', gestao: '#7ee0a1' };
  const SETUP_OF = { 'st:noc': ['noc'], 'st:tech': ['tech'], 'st:admin': ['admin'], 'st:gamer': ['gamer', 'gamerpc'] };

  /* ------------------------------------------------------------------ */
  /* Task library: the built-in tasks + a few generic ones               */
  /* ------------------------------------------------------------------ */
  // what each built-in task needs from the "equipment" list
  const USES = {
    switch: ['switch'], cables: ['rack'], ping: ['rack'], topo: ['pc'], install: ['rack'], hw: ['rack'], svc: ['pc'], cool: ['crac'],
    sys: ['pc'], alerts: ['pc'], backup: ['pc'], patch: ['rack'], round: [], cams: ['pc'], access: [], seals: ['rack'],
    tickets: ['pc'], inv: ['rack'], coffee: ['coffee'], docs: ['pc'], kpi: ['pc'], capacity: ['pc'], meeting: [], walk: [],
    needs: ['pc'], follow: [], expand: ['pc'], repair: [], pcmaint: ['pc'], swmaint: ['switch'], bench: ['pc'],
  };
  const LIB = {};
  const BUILTIN = Object.keys(JOBS.BY_ROLE);
  for (const role of BUILTIN) {
    for (const def of JOBS.BY_ROLE[role]) {
      if (def.kind === 'fix' || LIB[def.id]) continue;
      LIB[def.id] = { def, uses: USES[def.id] || [], from: DL.ROLES[role] ? DL.ROLES[role].name : role };
    }
  }
  // problems this role can spot: hidden faults of its types, on one rack or anywhere (monitoring)
  const hidden = (ctx, types, rack) => (ctx.ops ? ctx.ops.devices().filter((d) => d.fault && !d.fault.found && types.indexOf(d.fault.type) >= 0 && (!rack || d.rack === rack)) : []);
  const GENERIC = {
    pccheck: {
      uses: ['pc'], from: 'Novo',
      make: () => ({
        id: 'pccheck', name: 'Verificar computadores', verb: 'Verificando computadores', kind: 'equip', skill: 'sistemas', xp: 12, dur: [6, 10], auto: 2,
        desc: 'Atualizações, antivírus e periféricos das estações.', none: 'Nenhum computador no datacenter',
        targets: (ctx) => H.items(ctx, 'desk'),
        finish: (ctx, d) => ({ say: pick([(d.id || 'Computador') + ' atualizado e sem ameaças no antivírus.', 'Troquei o mouse com defeito do ' + (d.id || 'computador') + '. Funcionando!', (d.id || 'Computador') + ': limpeza feita, drivers em dia.']) }),
      }),
    },
    helpdesk: {
      uses: [], from: 'Novo',
      make: () => ({
        id: 'helpdesk', name: 'Ajudar funcionários', verb: 'Ajudando um colega', kind: 'visit', skill: 'gestao', xp: 10, dur: [4, 7], auto: 2,
        desc: 'Vai até alguém da equipe e resolve uma dúvida ou problema.', none: 'Ninguém mais na equipe',
        targets: (ctx) => ctx.members.filter((m) => m !== ctx.a),
        finish: (ctx, m) => ({ say: pick([m.crew.name + ', configurei sua impressora. Testa aí!', 'Resetei a senha da VPN do(a) ' + m.crew.name + '.', m.crew.name + ', seu e-mail voltou a sincronizar.']), reply: [m, pick(['Valeu demais!', 'Salvou meu dia!', 'Funcionou, obrigado(a)!'])] }),
      }),
    },
    inspect: {
      uses: ['rack'], from: 'Novo',
      make: (cfg) => ({
        id: 'inspect', name: 'Inspecionar equipamentos', verb: 'Inspecionando', kind: 'equip', skill: cfg.skill, xp: 14, dur: [6, 10], auto: 2,
        desc: 'Procura os problemas que o cargo sabe detectar.', none: 'Nenhum rack instalado',
        targets: (ctx) => H.racks(ctx),
        finish(ctx, rack) {
          const f = hidden(ctx, cfg.detects, rack);
          if (f.length) { ctx.ops.report(f[0], ctx.a, 'inspeção'); return null; }
          return { say: 'Inspecionei o ' + rack.id + ': nada de ' + cfg.detects.map((t) => (JOBS.FIX_NAME[t] || t)).join(', ') + ' com problema.' };
        },
      }),
    },
    watch: {
      uses: ['pc'], from: 'Novo',
      make: (cfg) => ({
        id: 'watch', name: 'Acompanhar monitoramento', verb: 'Acompanhando o monitoramento', kind: 'pc', skill: cfg.skill, xp: 12, dur: [12, 18], auto: 2,
        desc: 'Fica de olho nos painéis atrás dos problemas do cargo.',
        finish(ctx) {
          const f = hidden(ctx, cfg.detects);
          if (f.length) { ctx.ops.report(f[0], ctx.a, 'monitoramento'); return null; }
          return { say: pick(['Painéis estáveis. Nada fora do normal.', 'Monitoramento tranquilo nos últimos minutos.']) };
        },
      }),
    },
    power: {
      uses: ['crac'], from: 'Novo',
      make: () => ({
        id: 'power', name: 'Checar energia', verb: 'Checando a energia', kind: 'equip', skill: 'servidores', xp: 10, dur: [6, 9], auto: 1,
        desc: 'Quadro elétrico, nobreaks e consumo.', none: 'Nenhum equipamento de energia ou refrigeração',
        targets: (ctx) => H.items(ctx, 'crac').concat(H.items(ctx, 'storage')),
        finish: () => ({ say: 'Energia ok: carga em ' + (38 + Math.round(rand() * 30)) + '% e nobreaks com bateria cheia.' }),
      }),
    },
    train: {
      uses: [], from: 'Novo',
      make: (cfg) => ({
        id: 'train', name: 'Treinar a equipe', verb: 'Treinando um colega', kind: 'visit', skill: 'gestao', xp: 10, dur: [5, 8], auto: 1,
        desc: 'Ensina alguém da equipe (a pessoa ganha habilidade).', none: 'Ninguém mais na equipe',
        targets: (ctx) => ctx.members.filter((m) => m !== ctx.a),
        finish(ctx, m) {
          DL.XP.train(m.crew.stats, cfg.skill, 2);
          return { say: m.crew.name + ', bora praticar ' + SKILL_NAME[cfg.skill].toLowerCase() + '? Te mostro o atalho.', reply: [m, 'Aprendi! Valeu.'] };
        },
      }),
    },
    clean: {
      uses: [], from: 'Novo',
      make: () => ({
        id: 'clean', name: 'Organizar o ambiente', verb: 'Organizando o ambiente', kind: 'patrol', skill: 'gestao', xp: 8, dur: [0, 0], auto: 1,
        desc: 'Passa pelas salas arrumando o que estiver fora do lugar.',
        finish: (ctx) => ({ say: 'Passei por ' + ctx.world.rooms.length + ' sala(s): tudo em ordem.' }),
      }),
    },
  };
  for (const [id, g] of Object.entries(GENERIC)) LIB[id] = { make: g.make, uses: g.uses, from: g.from, name: g.make({ skill: 'sistemas', detects: [] }).name, desc: g.make({ skill: 'sistemas', detects: [] }).desc };
  for (const [id, l] of Object.entries(LIB)) { if (l.def) { l.name = l.def.name; l.desc = l.def.desc; } l.id = id; }
  const LIB_ORDER = Object.keys(GENERIC).concat(Object.keys(LIB).filter((id) => !GENERIC[id]));

  /* ------------------------------------------------------------------ */
  /* Config → safe, complete config                                      */
  /* ------------------------------------------------------------------ */
  const str = (v, max, def) => (typeof v === 'string' && v.trim() ? v.trim().replace(/\s+/g, ' ').slice(0, max) : def);
  const oneOf = (v, list, def) => (list.indexOf(v) >= 0 ? v : def);
  const subset = (v, list) => (Array.isArray(v) ? Array.from(new Set(v.filter((x) => list.indexOf(x) >= 0))) : []);
  const slug = (s) => norm(s).replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'cargo';

  function sanitize(raw, opts) {
    raw = raw && typeof raw === 'object' ? raw : {};
    const warn = [];
    const name = str(raw.name, 28, 'Novo cargo');
    const skill = oneOf(raw.skill, SKILL_IDS, 'sistemas');
    let skill2 = oneOf(raw.skill2, SKILL_IDS, skill === 'redes' ? 'servidores' : 'redes');
    if (skill2 === skill) skill2 = SKILL_IDS.find((s) => s !== skill);
    const tasks = [];
    for (const t of Array.isArray(raw.tasks) ? raw.tasks : []) {
      const id = typeof t === 'string' ? t : t && t.id;
      if (!LIB[id]) { if (id) warn.push('Tarefa desconhecida ignorada: ' + id); continue; }
      if (tasks.some((x) => x.id === id)) continue;
      const f = Number(typeof t === 'object' && t.freq != null ? t.freq : 1);
      tasks.push({ id, freq: f >= 3 ? 3 : f >= 1 ? 1 : 0 });
    }
    const req = {};
    if (raw.req && typeof raw.req === 'object') for (const k of SKILL_IDS) { const v = Number(raw.req[k]); if (v > 0) req[k] = Math.max(0, Math.min(80, Math.round(v))); }
    const cfg = {
      id: typeof raw.id === 'string' && /^c_[a-z0-9-]{1,40}$/.test(raw.id) ? raw.id : 'c_' + slug(name) + '-' + Date.now().toString(36).slice(-4),
      name,
      title: str(raw.title, 40, name),
      desc: str(raw.desc, 220, 'Cargo criado pelo jogador.'),
      color: typeof raw.color === 'string' && /^#[0-9a-f]{6}$/i.test(raw.color) ? raw.color : SKILL_COLOR[skill],
      work: oneOf(raw.work, WORK.map((w) => w[0]), 'doc'),
      skill, skill2, req, tasks,
      equip: subset(raw.equip, EQUIP.map((e) => e[0])),
      areas: subset(raw.areas, AREAS.map((a) => a[0])),
      detects: subset(raw.detects, FAULTS.map((f) => f[0])),
      fix: raw.fix !== false && subset(raw.detects, FAULTS.map((f) => f[0])).length > 0,
      social: raw.social !== false,
      // advanced: kept as text for the future programmable mode — never evaluated
      script: typeof raw.script === 'string' ? raw.script.slice(0, 4000) : '',
      source: oneOf(raw.source, ['manual', 'ai', 'advanced'], 'manual'),
      created: Number(raw.created) || Date.now(),
    };
    if (!cfg.areas.length) cfg.areas = ['any'];
    if (!cfg.equip.length) cfg.equip = ['pc'];
    if (!cfg.tasks.length) warn.push('Sem tarefas: a pessoa só vai circular e resolver problemas.');
    for (const t of cfg.tasks) if (!usable(cfg, t.id)) warn.push(LIB[t.id].name + ' precisa de ' + LIB[t.id].uses.map((u) => (EQUIP.find((e) => e[0] === u) || [u, u])[1]).join(', ') + ' (não marcado)');
    if (opts && opts.warnings) return { cfg, warn };
    return cfg;
  }

  // equipment rules: "Computadores" or any station type counts for desk work; switches come with racks
  function hasUse(cfg, u) {
    if (u === 'pc') return cfg.equip.indexOf('pc') >= 0 || cfg.equip.some((e) => e.indexOf('st:') === 0);
    if (u === 'switch') return cfg.equip.indexOf('switch') >= 0 || cfg.equip.indexOf('rack') >= 0;
    return cfg.equip.indexOf(u) >= 0;
  }
  const usable = (cfg, id) => LIB[id] && LIB[id].uses.every((u) => hasUse(cfg, u));

  /* ------------------------------------------------------------------ */
  /* Config → crew tasks                                                 */
  /* ------------------------------------------------------------------ */
  const THEME_TYPE = { noc: 'noc', servers: 'servers', corporate: 'office', minimal: 'reception', industrial: 'power' };
  function roomTypeOf(r) {
    if (!r) return null;
    if (r.type) return r.type;
    if (r.theme && THEME_TYPE[r.theme]) return THEME_TYPE[r.theme];
    const n = norm(r.name);
    if (/\bnoc\b/.test(n)) return 'noc';
    if (/servid|salao|rack/.test(n)) return 'servers';
    if (/escrit/.test(n)) return 'office';
    if (/recep|entrada/.test(n)) return 'reception';
    if (/eletric|energia/.test(n)) return 'power';
    if (/atendiment|suporte|help ?desk|call ?center/.test(n)) return 'support';
    return 'custom';
  }
  DL.roomTypeOf = roomTypeOf;

  function tileOfTarget(t) {
    if (!t) return null;
    if (t.crew) return null; // people: anywhere
    if (t.rack) return [t.rack.tx, t.rack.ty];
    if (t.tx != null) return [t.tx, t.ty];
    if (t.x != null) return [Math.floor(t.x / DL.T), Math.floor((t.y - 2) / DL.T)];
    return null;
  }

  function compose(cfg, worldRef) {
    const anyArea = cfg.areas.indexOf('any') >= 0;
    const areaOk = (tile) => {
      if (anyArea || !tile) return true;
      const w = worldRef();
      if (!w || !w.roomAt) return true;
      const i = tile[0] >= 0 && tile[1] >= 0 && tile[0] < w.W && tile[1] < w.H ? w.roomAt[tile[1] * w.W + tile[0]] : -1;
      // standing on a door / wall tile: look at the tile in front
      const r = w.rooms[i >= 0 ? i : w.roomAt[(tile[1] + 1) * w.W + tile[0]]];
      return !r || cfg.areas.indexOf(roomTypeOf(r)) >= 0;
    };
    const setups = cfg.equip.indexOf('pc') >= 0 ? null : [].concat(...cfg.equip.filter((e) => SETUP_OF[e]).map((e) => SETUP_OF[e]));
    const stationOk = (s) => {
      const k = s.key;
      if (setups && !(k.kind === 'desk' && setups.indexOf(k.setup || 'mono2') >= 0)) return false;
      return areaOk([k.tx, k.ty]);
    };
    const out = [];
    for (const t of cfg.tasks) {
      if (!usable(cfg, t.id)) continue;
      const L = LIB[t.id];
      const base = L.make ? L.make(cfg) : L.def;
      const def = Object.assign({}, base, { auto: t.freq });
      if (def.kind === 'pc') def.stationOk = stationOk;
      else if (base.targets) def.targets = (ctx) => (base.targets(ctx) || []).filter((x) => areaOk(tileOfTarget(base.place ? base.place(x) : x)));
      out.push(def);
    }
    if (cfg.fix && cfg.detects.length && hasUse(cfg, 'rack')) {
      const f = JOBS.fixTask('fix_' + cfg.id, 'Resolver problemas', cfg.detects, cfg.skill, cfg.detects.map((x) => FAULTS.find((y) => y[0] === x)[1]).join(', ') + '.');
      const tg = f.targets;
      f.targets = (ctx) => tg(ctx).filter((d) => areaOk(tileOfTarget(d)));
      out.push(f);
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Registry (live in DL.ROLES / DL.JOBS.BY_ROLE, saved in the browser)  */
  /* ------------------------------------------------------------------ */
  const REG = { list: [] };
  let worldRef = () => null;
  DL.rolesVersion = DL.rolesVersion || 0;

  function register(cfg) {
    DL.ROLES[cfg.id] = { name: cfg.name, title: cfg.title, color: cfg.color, work: cfg.work, desc: cfg.desc, custom: true, detects: cfg.detects.slice(), cfg };
    DL.ROLE_SKILL[cfg.id] = cfg.skill;
    DL.SECOND_SKILL[cfg.id] = cfg.skill2;
    JOBS.BY_ROLE[cfg.id] = compose(cfg, () => worldRef());
    const i = REG.list.findIndex((c) => c.id === cfg.id);
    if (i >= 0) REG.list[i] = cfg; else REG.list.push(cfg);
    DL.rolesVersion++;
  }
  function unregister(id) {
    delete DL.ROLES[id];
    delete DL.ROLE_SKILL[id];
    delete DL.SECOND_SKILL[id];
    delete JOBS.BY_ROLE[id];
    REG.list = REG.list.filter((c) => c.id !== id);
    DL.rolesVersion++;
  }
  function persist() { try { localStorage.setItem(KEY, JSON.stringify(REG.list)); } catch (e) { /* private mode */ } }
  try { for (const raw of JSON.parse(localStorage.getItem(KEY) || '[]')) register(sanitize(raw)); } catch (e) { /* nothing saved */ }

  // people hired into a role start with at least the skills it asks for
  const newStats0 = DL.XP.newStats;
  DL.XP.newStats = function (role, level) {
    const st = newStats0(role, level);
    const r = DL.ROLES[role];
    if (r && r.custom) for (const [k, v] of Object.entries(r.cfg.req)) st.skills[k] = Math.max(st.skills[k] || 0, v + Math.round(rand() * 8));
    return st;
  };

  /* ------------------------------------------------------------------ */
  /* "Criar cargo com IA": description → configuration                   */
  /* A local interpreter (keyword rules, runs offline). `remote` can be  */
  /* set to an async (text) => config function backed by a real model;   */
  /* whatever it returns still goes through sanitize() and the preview.  */
  /* ------------------------------------------------------------------ */
  const RULES = [
    { re: /computador|\bpcs?\b|desktop|notebook|maquina|estac(ao|oes) de trabalho|periferic|impressora/, tasks: ['pccheck'], equip: ['pc'], skill: { sistemas: 3 }, work: 'doc', tag: 'computadores' },
    { re: /\brede|switch|cabo|cabeamento|conex|internet|wi-?fi|\bping\b|\blan\b|roteador/, tasks: ['ping', 'switch'], equip: ['rack', 'switch'], detects: ['cable', 'port', 'link'], skill: { redes: 4 }, work: 'net', tag: 'rede' },
    { re: /servidor|hardware|\brack|instala/, tasks: ['hw', 'install'], equip: ['rack', 'storage'], skill: { servidores: 4 }, work: 'srv', tag: 'servidores' },
    { re: /disco|armazenamento|storage/, equip: ['storage'], detects: ['disk'], skill: { servidores: 1, sistemas: 1 } },
    { re: /ajud|suporte|atend|usuari|funcionari|colega|chamado|help ?desk|duvida/, tasks: ['helpdesk', 'tickets'], skill: { gestao: 2, sistemas: 1 }, work: 'doc', tag: 'suporte' },
    { re: /monitor|alerta|zabbix|grafana|\bnoc\b|incidente|painel|observ/, tasks: ['watch', 'alerts'], equip: ['st:noc', 'pc'], skill: { sistemas: 2, redes: 1 }, work: 'kpi', tag: 'monitoramento' },
    { re: /seguran|camera|acesso|ronda|vigi|portaria|cracha/, tasks: ['round', 'cams', 'access', 'seals'], skill: { seguranca: 4 }, work: 'cam', tag: 'segurança' },
    { re: /energia|eletric|nobreak|\bups\b|gerador|quadro/, tasks: ['power'], equip: ['crac'], skill: { servidores: 2 }, work: 'srv', tag: 'energia' },
    { re: /refrigera|temperatura|ar[- ]condicionado|clima|calor|resfria/, tasks: ['cool'], equip: ['crac'], skill: { servidores: 2 }, work: 'srv', tag: 'refrigeração' },
    { re: /backup|sistema|linux|servico|atualiza|patch|script|automa|deploy/, tasks: ['sys', 'backup', 'patch'], equip: ['pc', 'rack'], detects: ['service', 'disk'], skill: { sistemas: 4 }, work: 'code', tag: 'sistemas' },
    { re: /document|wiki|invent|manual|procediment/, tasks: ['docs', 'inv'], equip: ['pc', 'rack'], skill: { gestao: 1 }, work: 'doc', tag: 'documentação' },
    { re: /trein|ensin|mentor|capacit/, tasks: ['train'], skill: { gestao: 1 }, tag: 'treinamento' },
    { re: /limp|arrum|organiza(r|cao) (o|do) ambiente|zelad/, tasks: ['clean'], skill: { gestao: 1 }, tag: 'organização' },
    { re: /cafe|copa|agua|lanche/, tasks: ['coffee'], equip: ['coffee'], skill: { gestao: 1 }, tag: 'copa' },
    { re: /gerenc|gestor|indicador|\bkpi|capacidade|lider|coorden|planej/, tasks: ['kpi', 'capacity', 'meeting'], skill: { gestao: 4 }, work: 'kpi', tag: 'gestão' },
    { re: /gamer|stream|jogo/, equip: ['st:gamer'], tag: 'gamer' },
  ];
  // areas only when the description says where ("no NOC", "na sala elétrica"…)
  const AREA_WORDS = [[/\b(no|na|do|da|pelo|pela|nas|nos)\s+noc\b/, 'noc'], [/sala(s)? de servidor|salao de servidor/, 'servers'], [/\b(no|do|nos)\s+escritorio/, 'office'], [/\b(na|da)\s+(recepcao|entrada)/, 'reception'], [/sala eletrica/, 'power']];
  const NAME_BY_TAG = { computadores: 'Técnico(a) de TI', rede: 'Técnico(a) de redes', servidores: 'Técnico(a) de hardware', suporte: 'Analista de suporte', monitoramento: 'Operador(a) de NOC', 'segurança': 'Vigilante', energia: 'Eletricista', 'refrigeração': 'Técnico(a) de climatização', sistemas: 'Engenheiro(a) de sistemas', 'documentação': 'Documentador(a)', treinamento: 'Instrutor(a)', 'organização': 'Zelador(a)', copa: 'Copeiro(a)', 'gestão': 'Coordenador(a)' };

  function localGenerate(text) {
    const raw = String(text || '').trim(), n = norm(raw);
    const score = {}, tasks = [], equip = new Set(), areas = new Set(), detects = new Set(), tags = [];
    let work = null;
    // the subject mentioned first is the main job (its tasks run most of the shift)
    const hits = RULES.map((r) => ({ r, at: n.search(r.re) })).filter((h) => h.at >= 0).sort((a, b) => a.at - b.at);
    const lead = (hits.find((h) => h.r.tasks) || {}).r;
    hits.forEach(({ r }) => {
      if (r.tag) tags.push(r.tag);
      for (const t of r.tasks || []) if (!tasks.some((x) => x.id === t)) tasks.push({ id: t, freq: t === 'install' ? 0 : r === lead ? 3 : 1 });
      for (const e of r.equip || []) equip.add(e);
      for (const a of r.areas || []) areas.add(a);
      for (const d of r.detects || []) detects.add(d);
      for (const [k, v] of Object.entries(r.skill || {})) score[k] = (score[k] || 0) + v;
      if (!work && r.work) work = r.work;
    });
    for (const [re, a] of AREA_WORDS) if (re.test(n)) areas.add(a);
    // "verificar / detectar / identificar" → it also inspects for the problems it knows
    if (/detect|identific|encontr|inspecion|verific|diagnost|investig/.test(n) && detects.size) {
      if (!tasks.some((t) => t.id === 'inspect')) tasks.splice(1, 0, { id: 'inspect', freq: 2 });
      if ([...equip].some((e) => e === 'pc' || e.indexOf('st:') === 0) && !tasks.some((t) => t.id === 'watch')) tasks.push({ id: 'watch', freq: 1 });
    }
    if (detects.size) equip.add('rack');
    // whatever the chosen tasks need is allowed too
    for (const t of tasks) for (const u of LIB[t.id].uses) if (u === 'pc' ? ![...equip].some((e) => e === 'pc' || e.indexOf('st:') === 0) : !equip.has(u)) equip.add(u);
    const fix = detects.size > 0 && (/resolv|corrig|consert|repar|soluc|arrum/.test(n) || !/so detect|apenas detect|somente detect|so avis/.test(n));
    const ranked = Object.entries(score).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
    const skill = ranked[0] || 'sistemas', skill2 = ranked[1] || (skill === 'redes' ? 'servidores' : 'redes');
    // name: "Técnico de TI responsável por…" → "Técnico de TI"; otherwise from what it does
    let name = null;
    const m = raw.match(/^(?:cargo\s*:\s*)?([^.,;:\n]{3,40}?)\s+(?:respons[aá]vel|que\s|para\s|encarregad|cuida|focad|dedicad|com\s)/i) || raw.match(/^cargo\s*:\s*([^.,;:\n]{3,40})/i);
    const m2 = !m && raw.match(/^([^.,;:\n]{3,40}):/);
    if (m || m2) name = (m || m2)[1].trim().replace(/^(um|uma|o|a)\s+/i, '');
    if (!name) name = tags.indexOf('computadores') >= 0 && (tags.indexOf('rede') >= 0 || tags.indexOf('suporte') >= 0) ? 'Técnico(a) de TI' : NAME_BY_TAG[tags[0]] || 'Especialista';
    name = name.charAt(0).toUpperCase() + name.slice(1);
    const first = raw.split(/(?<=[.!?])\s/)[0] || raw;
    return {
      name, title: name, desc: first.length > 8 ? first : 'Cargo criado a partir de uma descrição.',
      color: SKILL_COLOR[skill], work: work || 'doc', skill, skill2,
      req: { [skill]: 30, [skill2]: 15 },
      tasks, equip: [...equip], areas: areas.size ? [...areas] : ['any'], detects: [...detects], fix, social: true, source: 'ai',
      _tags: tags,
    };
  }

  DL.RoleAI = {
    provider: 'local',
    remote: null, // async (text) => config, e.g. a call to a language model; validated like everything else
    async generate(text) {
      if (typeof this.remote === 'function') {
        try { const r = await this.remote(String(text)); if (r) return sanitize(Object.assign({}, r, { source: 'ai' }), { warnings: true }); } catch (e) { console.warn('RoleAI.remote', e); }
      }
      const g = localGenerate(text);
      const out = sanitize(g, { warnings: true });
      out.tags = g._tags;
      return out;
    },
  };

  /* ------------------------------------------------------------------ */
  /* Routine explanation (preview + detail)                              */
  /* ------------------------------------------------------------------ */
  function routineOf(cfg) {
    const steps = [];
    if (cfg.fix && cfg.detects.length) steps.push('Problemas primeiro: assume ' + cfg.detects.map((d) => FAULTS.find((f) => f[0] === d)[1].toLowerCase()).join(', ') + ' que ninguém pegou.');
    const ok = cfg.tasks.filter((t) => usable(cfg, t.id));
    const often = ok.filter((t) => t.freq >= 3).map((t) => LIB[t.id].name), some = ok.filter((t) => t.freq === 1).map((t) => LIB[t.id].name), order = ok.filter((t) => !t.freq).map((t) => LIB[t.id].name);
    if (often.length) steps.push('Na maior parte do turno: ' + often.join(', ') + '.');
    if (some.length) steps.push('De vez em quando: ' + some.join(', ') + '.');
    if (order.length) steps.push('Só quando você pedir: ' + order.join(', ') + '.');
    if (cfg.social) steps.push('Pausas curtas para café e conversa com a equipe.');
    steps.push('Sem nada para fazer: percorre o datacenter.');
    return steps;
  }

  /* ------------------------------------------------------------------ */
  /* UI: Cargos (Equipe → Cargos)                                        */
  /* ------------------------------------------------------------------ */
  DL.createRoles = function (game, sys) {
    const crew = sys.crew;
    worldRef = () => game.scene.world;
    for (const c of REG.list) JOBS.BY_ROLE[c.id] = compose(c, () => worldRef());
    const $ = (id) => document.getElementById(id);
    const el = { ov: $('roles'), body: $('rolesBody'), btn: $('rolesBtn') };
    const U = { view: 'list', draft: null, warn: [], aiText: '', busy: false, editing: null, back: 'list' };

    const chip = (attr, v, label, on, extra) => '<button type="button" class="chip chip--xs' + (on ? ' is-on' : '') + '" ' + attr + '="' + esc(v) + '"' + (extra || '') + '>' + label + '</button>';
    const dot = (c) => '<span class="rl-dot" style="--c:' + c + '"></span>';
    const builtIn = () => Object.keys(DL.ROLES).filter((id) => !DL.ROLES[id].custom);
    const membersWith = (id) => crew.members.filter((a) => a.crew.profile.role === id);

    function head(title, sub, back) {
      return '<div class="rl-head">' + (back ? '<button type="button" class="rl-back" data-rl="' + back + '">← Voltar</button>' : '') +
        '<div class="rl-titles"><p class="eyebrow-sm">' + sub + '</p><h2 class="card__title card__title--sm" id="rolesTitle">' + title + '</h2></div>' +
        '<button class="cc__x" type="button" data-rl="close" aria-label="Fechar">×</button></div>';
    }

    function viewList() {
      let h = head('Cargos', 'Equipe · funções dos bots');
      h += '<div class="rl-actions">' +
        '<button type="button" class="rl-cta rl-cta--ai" data-rl="ai"><b>Criar cargo com IA</b><span>Descreva o cargo; o assistente monta tarefas, habilidades, equipamentos e rotina para você aprovar.</span></button>' +
        '<button type="button" class="rl-cta" data-rl="new"><b>Novo cargo</b><span>Monte do zero: nome, tarefas, equipamentos, áreas e habilidades.</span></button>' +
        '<button type="button" class="rl-cta rl-cta--adv" data-rl="advanced"><b>Cargo avançado <em>beta</em></b><span>Para quem programa: edite a configuração em JSON. Comportamento por código chega depois.</span></button></div>';
      h += '<span class="eyebrow-sm rl-sub">Criados por você · ' + REG.list.length + '</span>';
      if (!REG.list.length) h += '<p class="rl-empty">Nenhum cargo criado ainda. Que tal um <b>Técnico de TI</b>, uma <b>Operadora de NOC</b> ou um <b>Eletricista</b>?</p>';
      else {
        h += '<div class="rl-grid">' + REG.list.map((c) => {
          const n = membersWith(c.id).length;
          return '<article class="rl-card" style="--c:' + c.color + '"><div class="rl-card__top">' + dot(c.color) + '<b>' + esc(c.name) + '</b><span class="rl-tag">' + (c.source === 'ai' ? 'IA' : c.source === 'advanced' ? 'Avançado' : 'Criado') + '</span></div>' +
            '<p>' + esc(c.desc) + '</p><span class="rl-meta">' + c.tasks.length + ' tarefa(s) · ' + SKILL_NAME[c.skill] + (c.detects.length ? ' · detecta ' + c.detects.length + ' problema(s)' : '') + (n ? ' · ' + n + ' na equipe' : '') + '</span>' +
            '<div class="rl-card__acts"><button type="button" class="btn btn--sm btn--primary" data-rl="hire" data-id="' + c.id + '">Contratar</button>' +
            '<button type="button" class="btn btn--sm" data-rl="edit" data-id="' + c.id + '">Editar</button>' +
            '<button type="button" class="btn btn--sm" data-rl="json" data-id="' + c.id + '">JSON</button>' +
            '<button type="button" class="btn btn--sm" data-rl="del" data-id="' + c.id + '">Excluir</button></div></article>';
        }).join('') + '</div>';
      }
      h += '<span class="eyebrow-sm rl-sub">Cargos padrão do DataLab</span><div class="rl-grid rl-grid--base">' + builtIn().map((id) => {
        const r = DL.ROLES[id];
        return '<div class="rl-base" style="--c:' + r.color + '">' + dot(r.color) + '<b>' + esc(r.name) + '</b><span>' + esc(r.desc) + '</span><em>' + (JOBS.BY_ROLE[id] || []).length + ' tarefas</em></div>';
      }).join('') + '</div>';
      return h;
    }

    const EXAMPLES = [
      'Técnico de TI responsável por verificar computadores, resolver problemas de rede e ajudar funcionários.',
      'Operadora de NOC que acompanha alertas no monitoramento e detecta serviços parados e discos cheios.',
      'Eletricista que cuida do quadro elétrico, nobreaks e refrigeração na sala elétrica.',
      'Analista de backup focado em sistemas Linux, atualizações e documentação.',
    ];
    function viewAi() {
      let h = head('Criar cargo com IA', 'Assistente de cargos', 'list');
      h += '<label class="rl-field"><span class="eyebrow-sm">Descreva o cargo e como a pessoa deve trabalhar</span>' +
        '<textarea class="input rl-text" id="rlAiText" rows="4" maxlength="600" placeholder="Ex.: Técnico responsável por verificar computadores, resolver problemas de rede e ajudar funcionários.">' + esc(U.aiText) + '</textarea></label>';
      h += '<div class="rl-examples"><span class="eyebrow-sm">Exemplos</span>' + EXAMPLES.map((x, i) => '<button type="button" class="chip chip--xs" data-rl="ex" data-i="' + i + '">' + esc(x.split(/\s(?:respons|que|focad)/)[0]) + '</button>').join('') + '</div>';
      h += '<div class="rl-foot"><button type="button" class="btn btn--primary" data-rl="gen"' + (U.busy ? ' disabled' : '') + '>' + (U.busy ? 'Gerando…' : 'Gerar cargo <span class="arrow">→</span>') + '</button>' +
        '<span class="rl-note">' + (DL.RoleAI.remote ? 'Usa o modelo conectado e valida o resultado.' : 'Interpretado no próprio jogo, a partir das palavras da descrição — nada é enviado para fora.') + ' Você revisa tudo antes de adicionar.</span></div>';
      return h;
    }

    function summary(cfg) {
      const lab = (list, v) => (list.find((x) => x[0] === v) || [v, v])[1];
      const rows = [
        ['Tarefas', cfg.tasks.length ? cfg.tasks.map((t) => '<span class="rl-pill' + (usable(cfg, t.id) ? '' : ' is-off') + '">' + esc(LIB[t.id].name) + ' <i>' + lab(FREQ, t.freq) + '</i></span>').join('') : '<span class="rl-mute">nenhuma</span>'],
        ['Habilidades', '<span class="rl-pill">' + SKILL_NAME[cfg.skill] + ' <i>principal</i></span><span class="rl-pill">' + SKILL_NAME[cfg.skill2] + ' <i>secundária</i></span>' + Object.entries(cfg.req).map(([k, v]) => '<span class="rl-pill">' + SKILL_NAME[k] + ' ≥ ' + v + ' <i>necessária</i></span>').join('')],
        ['Equipamentos', cfg.equip.map((e) => '<span class="rl-pill">' + lab(EQUIP, e) + '</span>').join('')],
        ['Áreas', cfg.areas.map((a) => '<span class="rl-pill">' + lab(AREAS, a) + '</span>').join('')],
        ['Detecta', cfg.detects.length ? cfg.detects.map((d) => '<span class="rl-pill rl-pill--warn">' + lab(FAULTS, d) + '</span>').join('') + (cfg.fix ? '<span class="rl-pill rl-pill--ok">e resolve</span>' : '<span class="rl-pill">só avisa</span>') : '<span class="rl-mute">nenhum tipo de problema</span>'],
        ['Tela de trabalho', '<span class="rl-pill">' + lab(WORK, cfg.work) + '</span>'],
      ];
      return '<div class="rl-sum" style="--c:' + cfg.color + '"><div class="rl-sum__head">' + dot(cfg.color) + '<div><b>' + esc(cfg.name) + '</b><p>' + esc(cfg.desc) + '</p></div></div>' +
        '<dl class="rl-dl">' + rows.map(([k, v]) => '<dt class="eyebrow-sm">' + k + '</dt><dd>' + v + '</dd>').join('') + '</dl>' +
        '<div class="rl-routine"><span class="eyebrow-sm">Rotina de trabalho</span><ol>' + routineOf(cfg).map((s) => '<li>' + esc(s) + '</li>').join('') + '</ol></div></div>';
    }

    function viewPreview() {
      const cfg = U.draft;
      let h = head('Prévia do cargo', 'Revise antes de adicionar ao jogo', U.back);
      if (U.fromText) h += '<p class="rl-quote">“' + esc(U.fromText) + '”</p>';
      h += summary(cfg);
      const missing = cfg.areas.filter((a) => a !== 'any' && !(game.scene.world.rooms || []).some((r) => roomTypeOf(r) === a));
      const warns = U.warn.concat(missing.length ? ['Ainda não há sala do tipo ' + missing.map((a) => (AREAS.find((x) => x[0] === a) || [a, a])[1]).join(', ') + ' no datacenter — crie uma (Construir → Espaços → Tipo) para o cargo trabalhar lá.'] : []);
      if (warns.length) h += '<ul class="rl-warn">' + warns.map((w) => '<li>' + esc(w) + '</li>').join('') + '</ul>';
      h += '<div class="rl-foot"><button type="button" class="btn btn--primary" data-rl="approve">Aprovar e adicionar ao jogo <span class="arrow">→</span></button>' +
        '<button type="button" class="btn" data-rl="tweak">Ajustar antes</button>' + (U.fromText ? '<button type="button" class="btn" data-rl="ai">Gerar de novo</button>' : '') +
        '<button type="button" class="linkbtn" data-rl="list">Descartar</button></div>';
      return h;
    }

    function viewEdit() {
      const c = U.draft;
      let h = head(U.editing ? 'Editar cargo' : 'Novo cargo', 'Configuração do cargo', U.editing ? 'list' : U.back);
      h += '<div class="rl-form">';
      h += '<label class="rl-field"><span class="eyebrow-sm">Nome</span><input class="input" data-f="name" maxlength="28" value="' + esc(c.name) + '"></label>';
      h += '<label class="rl-field"><span class="eyebrow-sm">Descrição</span><textarea class="input rl-text" data-f="desc" rows="2" maxlength="220">' + esc(c.desc) + '</textarea></label>';
      h += '<div class="rl-field"><span class="eyebrow-sm">Cor</span><div class="swatches">' + COLORS.map((x) => '<button type="button" class="swatch' + (c.color === x ? ' is-on' : '') + '" data-set="color" data-v="' + x + '" style="--c:' + x + '" aria-label="' + x + '"></button>').join('') + '</div></div>';
      h += '<div class="rl-field"><span class="eyebrow-sm">Habilidade principal</span><div class="chips">' + DL.SKILLS.map(([k, l]) => chip('data-set="skill" data-v', k, l, c.skill === k)).join('') + '</div></div>';
      h += '<div class="rl-field"><span class="eyebrow-sm">Habilidade secundária</span><div class="chips">' + DL.SKILLS.map(([k, l]) => chip('data-set="skill2" data-v', k, l, c.skill2 === k)).join('') + '</div></div>';
      h += '<div class="rl-field"><span class="eyebrow-sm">Nível mínimo para contratar (habilidade principal)</span><div class="chips">' + [0, 20, 30, 45, 60].map((v) => chip('data-set="reqmain" data-v', v, v ? '≥ ' + v : 'Livre', (c.req[c.skill] || 0) === v)).join('') + '</div></div>';
      h += '<div class="rl-field"><span class="eyebrow-sm">Equipamentos que pode usar</span><div class="chips">' + EQUIP.map(([k, l]) => chip('data-tog="equip" data-v', k, l, c.equip.indexOf(k) >= 0)).join('') + '</div></div>';
      h += '<div class="rl-field"><span class="eyebrow-sm">Áreas onde pode trabalhar</span><div class="chips">' + AREAS.map(([k, l]) => chip('data-tog="areas" data-v', k, l, c.areas.indexOf(k) >= 0)).join('') + '</div></div>';
      h += '<div class="rl-field"><span class="eyebrow-sm">Problemas que detecta</span><div class="chips">' + FAULTS.map(([k, l]) => chip('data-tog="detects" data-v', k, l, c.detects.indexOf(k) >= 0)).join('') +
        chip('data-set="fix" data-v', c.fix ? '0' : '1', c.fix ? 'Também resolve ✓' : 'Só avisa', c.fix) + '</div></div>';
      h += '<div class="rl-field"><span class="eyebrow-sm">Tela enquanto trabalha</span><div class="chips">' + WORK.map(([k, l]) => chip('data-set="work" data-v', k, l, c.work === k)).join('') + '</div></div>';
      h += '<div class="rl-field rl-field--wide"><span class="eyebrow-sm">Tarefas · frequência na rotina</span><ul class="rl-tasks">' + LIB_ORDER.map((id) => {
        const L = LIB[id], t = c.tasks.find((x) => x.id === id), ok = L.uses.every((u) => hasUse(c, u));
        return '<li class="' + (t ? 'is-on' : '') + (ok ? '' : ' is-off') + '"><button type="button" class="rl-task" data-task="' + id + '"><b>' + esc(L.name) + '</b><span>' + esc(L.desc || '') + (ok ? '' : ' · precisa de ' + L.uses.map((u) => (EQUIP.find((e) => e[0] === u) || [u, u])[1]).join(', ')) + '</span><em>' + esc(L.from) + '</em></button>' +
          (t ? '<span class="rl-freq">' + FREQ.map(([v, l]) => chip('data-freq="' + id + '" data-v', v, l, t.freq === v)).join('') + '</span>' : '') + '</li>';
      }).join('') + '</ul></div>';
      h += '<label class="rl-check"><input type="checkbox" data-f="social"' + (c.social ? ' checked' : '') + '> Pausas sociais (café e conversa) na rotina</label>';
      h += '</div><div class="rl-foot"><button type="button" class="btn btn--primary" data-rl="save">' + (U.editing ? 'Salvar cargo' : 'Ver prévia <span class="arrow">→</span>') + '</button><button type="button" class="linkbtn" data-rl="list">Cancelar</button></div>';
      return h;
    }

    const SCRIPT_SAMPLE = [
      '// Modo programável — em breve.',
      '// Este código NÃO é executado nesta versão: o jogo só usa a configuração JSON ao lado.',
      '// Ganchos previstos (somente leitura + ações permitidas):',
      '//   onShiftStart(bot)            · onFaultFound(bot, device)',
      '//   pickTask(bot, tasks) → id     · onTaskDone(bot, task, result)',
      'export function pickTask(bot, tasks) {',
      "  if (bot.world.faults.length) return 'fix';",
      "  return tasks.find((t) => t.id === 'pccheck')?.id;",
      '}',
    ].join('\n');
    function viewAdvanced() {
      const base = U.draft || sanitize({ name: 'Meu cargo', tasks: [{ id: 'pccheck', freq: 3 }, { id: 'helpdesk', freq: 1 }], equip: ['pc'], detects: ['service'], source: 'advanced' });
      const json = JSON.stringify(Object.assign({}, base, { script: undefined, created: undefined, id: U.editing ? base.id : undefined }), null, 2);
      let h = head('Cargo avançado', 'Para quem programa · beta', 'list');
      h += '<p class="rl-note rl-note--block">A configuração é validada campo a campo: só valores conhecidos entram no jogo. Ids de tarefa disponíveis: ' + LIB_ORDER.map((id) => '<code>' + id + '</code>').join(' ') + '.</p>';
      h += '<div class="rl-adv"><label class="rl-field"><span class="eyebrow-sm">Configuração (JSON)</span><textarea class="input rl-code" id="rlJson" spellcheck="false" rows="16">' + esc(U.json || json) + '</textarea></label>' +
        '<label class="rl-field"><span class="eyebrow-sm">Comportamento por código · em breve <span class="rl-lock">não executado</span></span><textarea class="input rl-code rl-code--muted" id="rlScript" spellcheck="false" rows="16">' + esc(base.script || SCRIPT_SAMPLE) + '</textarea></label></div>';
      if (U.advErr) h += '<p class="rl-err">' + esc(U.advErr) + '</p>';
      h += '<div class="rl-foot"><button type="button" class="btn btn--primary" data-rl="advcheck">Validar e ver prévia <span class="arrow">→</span></button><button type="button" class="linkbtn" data-rl="list">Cancelar</button></div>';
      return h;
    }

    function render() {
      const v = { list: viewList, ai: viewAi, preview: viewPreview, edit: viewEdit, advanced: viewAdvanced }[U.view];
      el.body.innerHTML = v();
      el.body.scrollTop = 0;
    }

    function open(view) {
      U.view = view || 'list';
      render();
      el.ov.classList.add('is-open');
      game.keysReset && game.keysReset();
    }
    function close() {
      el.ov.classList.remove('is-open');
      U.draft = null; U.editing = null; U.json = null; U.advErr = null;
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    }

    function approve(cfg) {
      const fresh = !DL.ROLES[cfg.id];
      register(cfg);
      persist();
      // people already in this role pick up the new rules on their next task
      for (const a of membersWith(cfg.id)) if (a.crew.job && a.crew.job.auto) crew.api.cancelJob(a, true);
      game.toast('ok', fresh ? 'Cargo criado' : 'Cargo atualizado', cfg.name + ' · ' + cfg.tasks.length + ' tarefa(s) · disponível para contratar');
      U.draft = null; U.editing = null; U.json = null; U.fromText = null;
      U.view = 'list';
      render();
      game.emit('roles', { id: cfg.id });
    }

    function remove(id) {
      const c = REG.list.find((x) => x.id === id);
      if (!c) return;
      // nobody is left without a role: they go back to Assistente
      for (const a of membersWith(id)) {
        a.crew.profile.role = 'funcionario';
        if (a.crew.job) crew.api.cancelJob(a, true);
      }
      const me = crew.playerProfile;
      if (me && me.role === id) me.role = 'gerente';
      unregister(id);
      persist();
      game.toast('info', 'Cargo excluído', c.name + (membersWith(id).length ? '' : '') + ' · quem tinha esse cargo virou Assistente');
      render();
    }

    async function generate() {
      const ta = $('rlAiText');
      U.aiText = ta ? ta.value.trim() : U.aiText;
      if (U.aiText.length < 12) { game.toast('warn', 'Descreva um pouco mais', 'Conte o que o cargo faz, onde trabalha e que problemas resolve'); return; }
      U.busy = true;
      render();
      const t0 = performance.now();
      const res = await DL.RoleAI.generate(U.aiText);
      await new Promise((r) => setTimeout(r, Math.max(0, 450 - (performance.now() - t0))));
      U.busy = false;
      U.draft = res.cfg;
      U.warn = res.warn;
      U.fromText = U.aiText;
      U.back = 'ai';
      U.view = 'preview';
      render();
    }

    function draftFromForm() {
      const c = U.draft;
      const nm = el.body.querySelector('[data-f="name"]'), ds = el.body.querySelector('[data-f="desc"]'), so = el.body.querySelector('[data-f="social"]');
      if (nm) { c.name = nm.value; c.title = nm.value; }
      if (ds) c.desc = ds.value;
      if (so) c.social = so.checked;
    }

    el.ov.addEventListener('click', (ev) => {
      if (ev.target === el.ov) { close(); return; }
      const b = ev.target.closest('button');
      if (!b) return;
      const a = b.dataset.rl;
      if (U.view === 'edit' && !a) draftFromForm();
      if (a === 'close') return close();
      if (a === 'list') { U.view = 'list'; U.draft = null; U.editing = null; return render(); }
      if (a === 'ai') { U.view = 'ai'; return render(); }
      if (a === 'new') { U.editing = null; U.back = 'list'; U.draft = sanitize({ name: 'Novo cargo', tasks: [{ id: 'pccheck', freq: 3 }, { id: 'helpdesk', freq: 1 }], equip: ['pc'] }); U.view = 'edit'; return render(); }
      if (a === 'advanced') { U.editing = null; U.draft = null; U.json = null; U.advErr = null; U.view = 'advanced'; return render(); }
      if (a === 'ex') { U.aiText = EXAMPLES[+b.dataset.i]; return render(); }
      if (a === 'gen') return generate();
      if (a === 'approve') return approve(sanitize(U.draft));
      if (a === 'tweak') { U.view = 'edit'; U.back = 'preview'; return render(); }
      if (a === 'save') {
        draftFromForm();
        const r = sanitize(U.draft, { warnings: true });
        if (U.editing) return approve(r.cfg);
        U.draft = r.cfg; U.warn = r.warn; U.fromText = null; U.back = 'edit'; U.view = 'preview';
        return render();
      }
      if (a === 'edit' || a === 'json') {
        const c = REG.list.find((x) => x.id === b.dataset.id);
        if (!c) return;
        U.draft = JSON.parse(JSON.stringify(c));
        U.editing = c.id;
        U.json = null; U.advErr = null;
        U.view = a === 'edit' ? 'edit' : 'advanced';
        return render();
      }
      if (a === 'del') {
        if (b.dataset.sure) return remove(b.dataset.id);
        b.dataset.sure = '1';
        b.textContent = 'Confirmar exclusão';
        b.classList.add('btn--primary');
        return;
      }
      if (a === 'hire') { close(); return crew.api.hireAs(b.dataset.id); }
      if (a === 'advcheck') {
        const txt = $('rlJson').value, script = $('rlScript').value;
        let obj;
        try { obj = JSON.parse(txt); } catch (err) { U.json = txt; U.advErr = 'JSON inválido: ' + err.message; return render(); }
        if (!obj || typeof obj !== 'object' || Array.isArray(obj)) { U.json = txt; U.advErr = 'A configuração precisa ser um objeto { … }'; return render(); }
        if (U.editing) obj.id = U.editing;
        obj.script = script === SCRIPT_SAMPLE ? '' : script;
        obj.source = 'advanced';
        const r = sanitize(obj, { warnings: true });
        U.draft = r.cfg; U.warn = r.warn; U.fromText = null; U.json = txt; U.advErr = null; U.back = 'advanced';
        U.view = 'preview';
        return render();
      }
      // form controls
      const c = U.draft;
      if (!c) return;
      if (b.dataset.set) {
        draftFromForm();
        const k = b.dataset.set, v = b.dataset.v;
        if (k === 'reqmain') { if (+v) c.req[c.skill] = +v; else delete c.req[c.skill]; }
        else if (k === 'fix') c.fix = v === '1';
        else c[k] = v;
        if (k === 'skill' && c.skill2 === v) c.skill2 = SKILL_IDS.find((s) => s !== v);
        // the colour follows the main skill until the player picks one by hand
        if (k === 'skill' && Object.values(SKILL_COLOR).indexOf(c.color) >= 0) c.color = SKILL_COLOR[v];
        return render();
      }
      if (b.dataset.tog) {
        draftFromForm();
        const list = c[b.dataset.tog], v = b.dataset.v, i = list.indexOf(v);
        if (i >= 0) list.splice(i, 1); else list.push(v);
        if (b.dataset.tog === 'areas') {
          if (v === 'any' && i < 0) c.areas = ['any'];
          else if (v !== 'any') c.areas = c.areas.filter((x) => x !== 'any');
          if (!c.areas.length) c.areas = ['any'];
        }
        if (b.dataset.tog === 'detects') c.fix = c.fix || !!c.detects.length;
        return render();
      }
      if (b.dataset.task) {
        draftFromForm();
        const id = b.dataset.task, i = c.tasks.findIndex((t) => t.id === id);
        if (i >= 0) c.tasks.splice(i, 1);
        else {
          c.tasks.push({ id, freq: 1 });
          // turning on a task also turns on what it needs
          for (const u of LIB[id].uses) if (!hasUse(c, u)) c.equip.push(u);
        }
        return render();
      }
      if (b.dataset.freq) { draftFromForm(); const t = c.tasks.find((x) => x.id === b.dataset.freq); if (t) t.freq = +b.dataset.v; return render(); }
    });
    el.ov.addEventListener('input', (ev) => { if (ev.target.id === 'rlAiText') U.aiText = ev.target.value; });

    addEventListener('keydown', (ev) => {
      if (!el.ov.classList.contains('is-open')) return;
      if (ev.code === 'Escape') {
        ev.preventDefault();
        ev.stopImmediatePropagation();
        if (U.view === 'list') close(); else { U.view = U.view === 'preview' ? U.back : 'list'; render(); }
        return;
      }
      if (ev.code === 'Enter' && (ev.metaKey || ev.ctrlKey) && U.view === 'ai') { ev.preventDefault(); generate(); }
    }, true);

    if (el.btn) el.btn.addEventListener('click', () => { el.btn.blur(); open('list'); });

    return {
      open, close,
      get isOpen() { return el.ov.classList.contains('is-open'); },
      get list() { return REG.list.slice(); },
      // exposed for automated checks
      api: { sanitize, compose: (c) => compose(c, worldRef), register: (c) => { register(sanitize(c)); persist(); }, remove, generate: (t) => DL.RoleAI.generate(t), routineOf, LIB, roomTypeOf },
    };
  };
})();
