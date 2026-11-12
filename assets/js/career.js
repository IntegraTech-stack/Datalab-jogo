/* DataLab — career: the player's own level. Every level hands the player ONE mission (a real thing
   to do in the datacenter); finishing it is the promotion to the next level. Ranks that have problems
   of their own (problems.js) also ask for XP from solving them. The crew learns from the boss: on
   their own, bots only pick tasks of a level BELOW the player's (what the player has already
   mastered). Orders given by the player ("Atribuir tarefa") are never blocked.
   The tier of each crew task lives here (TASK_TIER), so jobs.js stays a plain catalog. */
(function () {
  'use strict';
  const DL = window.DL;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // tier of every crew task: bots do it alone once the player's level is above it
  // (tier 0 = always: breaks, getting to know the place, reception, the basic chores)
  const TASK_TIER = {
    chat: 0, break: 0, rest: 0, tv: 0, arcade: 0, explore: 0, coffee: 0, frontdesk: 0, visitors: 0, round: 0, support: 0, bench: 0,
    inv: 1, tickets: 1, cams: 1, access: 1, docs: 1, walk: 1, meeting: 1, seals: 1, pcmaint: 1, benchtest: 1, repair: 1, cool: 1,
    hw: 2, switch: 2, install: 2, swmaint: 2, cables: 2,
    ping: 3, topo: 3,
    svc: 4, sys: 4, patch: 4, runbook: 4,
    fixnet: 5, fixhw: 5, fixinc: 5, fixtec: 5, alerts: 5,
    backup: 6, kpi: 6, needs: 6, follow: 6, board: 6,
    capacity: 7,
    expand: 8,
  };
  // XP of a problem solved again: the first time is worth it all, then half, then a quarter
  const REPEAT = [1, 0.5, 0.25];
  const tierOf = (def) => (def && TASK_TIER[def.id]) || 0;


  /* ------------------------------------------------------------------ */
  /* Insignia: a pixel-art emblem per rank, drawn on a 32×25 grid of    */
  /* square cells (crisp SVG rects). The shape grows with the band:     */
  /*   Estágio: hexagon + ring · Júnior: hexagon + chevrons ·           */
  /*   Pleno: hexagon + laurel + chevrons · Sênior: shield + star +     */
  /*   laurel · Especialista: winged shield + two stars ·               */
  /*   Tech Lead: winged shield + crown + star.                         */
  /* ------------------------------------------------------------------ */
  const PW = 32, PH = 25, CX = 16, CY = 13.5, INK = '#0b0c10', DARK = '#14161c';
  const SPR = {
    ring: ['..###..', '.#...#.', '#.....#', '#..#..#', '#.....#', '.#...#.', '..###..'],
    chev: ['..###..', '.##.##.', '##...##'],
    star: ['....#....', '...###...', '#########', '.#######.', '..#####..', '..##.##..', '.##...##.'],
    starS: ['..#..', '#####', '.###.', '.#.#.'],
    wing: ['......#', '....###', '..#####', '#######', '....###', '..#####', '#######', '....###', '..#####', '....##.'],
    crown: ['#...#...#', '##.###.##', '#########'],
  };
  // blend two #rrggbb colours (t = 0 → a, 1 → b)
  function mix(a, b, t) {
    const p = (h, i) => parseInt(h.slice(1 + i * 2, 3 + i * 2), 16);
    return '#' + [0, 1, 2].map((i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t).toString(16).padStart(2, '0')).join('');
  }
  const hexIn = (x, y) => { const dx = Math.abs(x - CX); return dx <= 8.6 && Math.abs(y - CY) <= 10 - dx * 0.577; };
  const shieldIn = (x, y) => {
    const dx = Math.abs(x - CX);
    if (y < 3 + dx * 0.12) return false;
    if (y <= 13) return dx <= 8.6;
    return dx <= 8.6 * Math.sqrt(Math.max(0, 1 - ((y - 13) / 10.5) ** 2));
  };

  DL.rankEmblem = function (rank, size) {
    const c = rank.color, band = rank.band;
    const shield = band === 'sr' || band === 'esp' || band === 'lead';
    const wings = band === 'esp' || band === 'lead';
    const inside = shield ? shieldIn : hexIn;
    const px = new Map();
    const at = (x, y) => (x < PW ? px.get(y * PW + x) : undefined);
    const put = (x, y, col) => { if (x >= 0 && y >= 0 && x < PW && y < PH) px.set(y * PW + x, col); };
    const isIn = (x, y) => inside(x + 0.5, y + 0.5);
    // a sprite in one colour with a dark 1-pixel outline around it
    function stamp(rows, x0, y0, col, flip) {
      const on = [], has = new Set();
      rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] === '#') { const cx = x0 + (flip ? r.length - 1 - x : x); on.push([cx, y0 + y]); has.add(cx + ',' + (y0 + y)); } });
      for (const [x, y] of on) for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!has.has((x + dx) + ',' + (y + dy))) put(x + dx, y + dy, INK);
      for (const [x, y] of on) put(x, y, col);
    }

    if (wings) { stamp(SPR.wing, 0, 7, mix(c, DARK, 0.25)); stamp(SPR.wing, 25, 7, mix(c, DARK, 0.25), true); }
    if (band === 'pl' || band === 'sr') {
      for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
        const ang = Math.PI / 2 - side * (0.75 + i * 0.36);
        const x = Math.round(CX - 0.5 + Math.cos(ang) * 11), y = Math.round(CY - 0.5 + Math.sin(ang) * 11);
        stamp(['#', '#'], x, y - 1, i % 2 ? mix(c, DARK, 0.3) : c);
      }
    }
    if (band === 'lead') { stamp(SPR.crown, 12, 0, c); put(16, 0, '#ffffff'); }
    // body: dark ring outside, band colour on the edge, a gradient from the colour to near-black inside
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
      if (isIn(x, y)) continue;
      let near = false;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (isIn(x + dx, y + dy)) near = true;
      if (near && !at(x, y)) put(x, y, INK);
    }
    for (let y = 0; y < PH; y++) for (let x = 0; x < PW; x++) {
      if (!isIn(x, y)) continue;
      const edge = !isIn(x + 1, y) || !isIn(x - 1, y) || !isIn(x, y + 1) || !isIn(x, y - 1);
      const lit = !edge && !isIn(x, y - 2);
      put(x, y, edge ? c : lit ? mix(c, '#ffffff', 0.35) : mix(c, DARK, Math.min(0.92, 0.45 + (y / PH) * 0.6)));
    }

    if (band === 'est') stamp(SPR.ring, 13, 10, c);
    else if (band === 'jr' || band === 'pl') {
      const n = rank.step, top = Math.round(CY - (3 + (n - 1) * 4) / 2);
      for (let i = 0; i < n; i++) stamp(SPR.chev, 13, top + i * 4, c);
    } else if (band === 'sr') stamp(SPR.star, 12, 9, c);
    else if (band === 'esp') { stamp(SPR.starS, 9, 9, c); stamp(SPR.starS, 18, 9, c); stamp(['##########'], 11, 16, c); }
    else { stamp(SPR.star, 12, 8, c); stamp(['##########'], 11, 18, c); }

    // one rect per horizontal run of the same colour
    let rects = '';
    for (let y = 0; y < PH; y++) {
      for (let x = 0; x < PW;) {
        const col = at(x, y);
        let w = 1;
        while (col && at(x + w, y) === col) w++;
        if (col) rects += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="1" fill="' + col + '"/>';
        x += w;
      }
    }
    return '<svg class="emb emb--' + band + '" viewBox="0 0 ' + PW + ' ' + PH + '" width="' + Math.round(size * 1.28) + '" height="' + size + '" shape-rendering="crispEdges" role="img" aria-label="Patente ' + esc(rank.name) + '">' + rects + '</svg>';
  };

  DL.createCareer = function (game, sys) {
    const world = () => game.scene.world;
    const count = (kind) => world().items.filter((e) => e.kind === kind).length;
    const servers = () => (sys.ops ? sys.ops.devices().filter((d) => d.kind === 'server') : []);
    // the player's own servers (not the ones that came installed with the map / preset)
    const mine = () => servers().filter((d) => !d.pre);
    const online = (list) => list.filter((d) => d.state === 'online').length;
    const lotArea = () => world().lot.w * world().lot.h;

    // Patentes (the player's rank): one per level, grouped in bands with their own colour; the numeral
    // (I, II, III) is the step inside the band and shows as chevrons on the insignia.
    const BANDS = {
      est: { name: 'Estágio', color: '#8a919c' }, jr: { name: 'Júnior', color: '#7ee0a1' }, pl: { name: 'Pleno', color: '#6aa7e8' },
      sr: { name: 'Sênior', color: '#c4b5fd' }, esp: { name: 'Especialista', color: '#ff7a17' }, lead: { name: 'Liderança', color: '#ffd23f' },
    };
    const R = (name, short, band, step) => ({ name, short, band, step, color: BANDS[band].color });

    // everything a mission measures. Missions count only what happens AFTER they start (K.base is a
    // snapshot of these counters), so a level never passes by itself and promotions don't chain.
    // (hired: people on the team — legendary bots come from the inventory, not from hiring)
    const counters = () => ({
      v: 4, rack: count('rack'), desk: count('desk'), hired: sys.crew.members.filter((m) => !m.legend).length,
      linked: mine().filter((d) => sys.ops.switchesNear(d).length).length,
      cabled: mine().filter((d) => d.state !== 'new').length,
      online: online(mine()), fixed: K.fixed, orders: K.orders, area: lotArea(), pays: K.pays,
    });
    const since = (k, goal) => Math.max(0, Math.min(goal, counters()[k] - (K.base[k] || 0)));

    // one rank and one mission per level: progress() → [done so far, goal]
    const LEVELS = [
      { rank: R('Estagiário(a)', 'EST', 'est', 0), mission: 'Monte dois postos (dois racks e dois computadores novos) e contrate seu primeiro funcionário',
        how: 'Construir (B) → Equipamentos → Rack e Computador · Equipe (C) → Contratar (N). Os problemas aparecem em Tarefas (T): resolva para ganhar XP.',
        progress: () => [since('rack', 2) + since('desk', 2) + since('hired', 1), 5] },
      { rank: R('Júnior I', 'JR I', 'jr', 1), mission: 'Instale mais 2 servidores numa sala com switch',
        how: 'Construir (B) → Equipamentos → Servidor e Switch, clicando no rack.',
        progress: () => [since('linked', 2), 2] },
      { rank: R('Júnior II', 'JR II', 'jr', 2), mission: 'Ligue o cabo de rede de mais 3 servidores',
        how: 'Tarefas (T) → Ligar cabos: eth0 do servidor até uma porta do switch.',
        progress: () => [since('cabled', 3), 3] },
      { rank: R('Júnior III', 'JR III', 'jr', 3), mission: 'Coloque mais 3 servidores online pelo terminal',
        how: 'Tarefas (T) → Abrir terminal: interface, IP, rota e ping.',
        progress: () => [since('online', 3), 3] },
      { rank: R('Pleno I', 'PL I', 'pl', 1), mission: 'Resolva você mesmo(a) 3 problemas no datacenter',
        how: 'Quando aparecer uma ocorrência em Tarefas (T), investigue e corrija pelo terminal ou cabeamento. A equipe ainda não resolve falhas sozinha.',
        progress: () => [since('fixed', 3), 3] },
      { rank: R('Pleno II', 'PL II', 'pl', 2), mission: 'Tenha 8 servidores seus online ao mesmo tempo',
        how: 'Instale, cabeie e configure mais servidores.',
        progress: () => [Math.min(8, online(mine())), 8] },
      { rank: R('Pleno III', 'PL III', 'pl', 3), mission: 'Dê 15 ordens à equipe',
        how: 'Equipe (C) → clique numa pessoa → Atribuir tarefa.',
        progress: () => [since('orders', 15), 15] },
      { rank: R('Sênior', 'SR', 'sr', 1), mission: 'Expanda o terreno e resolva mais 5 problemas',
        how: 'Construir (B) → Espaços → + no Terreno. As ocorrências aparecem em Tarefas (T).',
        progress: () => [(lotArea() > (K.base.area || 0) ? 1 : 0) + since('fixed', 5), 6] },
      { rank: R('Especialista', 'ESP', 'esp', 1), mission: 'Feche 3 meses com o caixa positivo',
        how: 'Mantenha os servidores no ar até o fechamento de cada mês (00:00 no relógio).',
        progress: () => [since('pays', 3), 3] },
      { rank: R('Tech Lead', 'LEAD', 'lead', 1), mission: 'Tenha 15 servidores seus online ao mesmo tempo',
        how: 'Cresça a operação: mais racks, mais servidores, tudo no ar.',
        progress: () => [Math.min(15, online(mine())), 15] },
    ];
    const MAX = LEVELS.length;
    // the XP a level asks for besides its mission (problems-data.js ranks — or the database's: only levels with
    // problems of their own); read each time, the data may arrive from the server after the game started
    const reqOf = (level) => {
      const r = ((DL.SCENARIO_DATA && DL.SCENARIO_DATA.ranks) || []).find((x) => x.level === level && x.xp_to_next);
      return r ? { xp: r.xp_to_next, distinct: r.distinct_to_next || 0 } : null;
    };

    // level · mission complete at max · counters that missions measure from a baseline
    // xp: all the XP of this save · lvlXp / lvlSolved: XP and distinct problems since this level started
    // solved: how many times each problem was solved (repeats are worth less)
    // prev: where the mission / XP of the level before stood at the last promotion — if the server refuses that
    // promotion (applyServer), the player goes back exactly there instead of starting the mission again
    const K = { level: 1, done: false, fixed: 0, orders: 0, pays: 0, base: {}, seenOrders: 0, acc: 0, key: '', xp: 0, lvlXp: 0, lvlSolved: [], solved: {}, prev: null };

    // what the missions measure from, taken when each mission starts
    const baseFor = () => counters();
    const cur = () => LEVELS[K.level - 1];
    const req = () => reqOf(K.level);
    const xpDone = () => { const r = req(); return !r || (K.lvlXp >= r.xp && K.lvlSolved.length >= r.distinct); };
    function xpFor(def, share) {
      const n = K.solved[def.id] || 0;
      return Math.max(1, Math.round(def.xp * REPEAT[Math.min(n, REPEAT.length - 1)] * (share == null ? 1 : share)));
    }
    // a problem solved: share 1 = by the player, less when someone on the team did it for them
    function solve(def, share) {
      share = share == null ? 1 : share;
      const xp = xpFor(def, share);
      K.solved[def.id] = (K.solved[def.id] || 0) + 1;
      K.xp += xp;
      K.lvlXp += xp;
      // an event (a blackout's breaker, a fire put out…) is not a problem of the catalog: it gives XP but is not one
      // of the "different problems" a rank asks for, and it goes to the server in the next save (economy.js)
      const event = !def.rank;
      if (!event && share >= 1 && K.lvlSolved.indexOf(def.id) < 0) K.lvlSolved.push(def.id);
      if (event) game.emit('career-event', { id: def.id, xp });
      render(true);
      return xp;
    }
    // the insignia: band colour, short name and one chevron per step inside the band
    const rankHtml = (L, cls) => '<span class="rank' + (cls ? ' ' + cls : '') + '" style="--c:' + L.rank.color + '" title="Patente: ' + esc(L.rank.name) + '">' +
      '<i class="rank__chev" aria-hidden="true">' + '<b></b>'.repeat(L.rank.step) + '</i>' + esc(L.rank.short) + '</span>';
    const isDone = () => { const [n, goal] = cur().progress(); return n >= goal && xpDone(); };

    // the tasks that the crew starts doing alone at a given level
    function unlocksAt(level) {
      const names = new Map();
      for (const id in DL.JOBS.BY_ROLE) for (const d of DL.JOBS.BY_ROLE[id]) if (tierOf(d) === level - 1) names.set(d.id, d.name);
      return Array.from(names.values());
    }

    function promote(silent) {
      if (K.level >= MAX) { K.done = true; if (!silent) game.toast('ok', 'Carreira completa', 'Você chegou ao topo: ' + LEVELS[MAX - 1].rank.name + '. A equipe faz de tudo sozinha.'); return; }
      K.prev = { level: K.level, base: K.base, lvlXp: K.lvlXp, lvlSolved: K.lvlSolved.slice() };
      K.level++;
      K.base = baseFor(K.level);
      K.lvlXp = 0;
      K.lvlSolved = [];
      if (silent) return;
      const un = unlocksAt(K.level);
      const items = DL.unlockLevel ? (DL.CATALOG || []).filter((d) => DL.unlockLevel(d) === K.level).length : 0;
      game.toast('ok', 'Promoção · ' + cur().rank.name, 'Nova patente (nível ' + K.level + ') · nova missão: ' + cur().mission + (items ? ' · ' + items + ' novos itens liberados em Construir' : '') + (un.length ? ' · a equipe agora faz sozinha: ' + un.join(', ').toLowerCase() : ''));
      game.sfx('done');
      showPromo(cur());
      game.emit('career', { level: K.level });
    }

    // levels whose mission is already met (presets, older saves) are passed without fanfare
    function settle(silent) {
      let guard = MAX + 1;
      while (!K.done && isDone() && guard--) promote(silent);
      render(true);
    }

    game.on('fixed', (info) => { if (!info.by) K.fixed++; });
    game.on('payday', (info) => { if (info.cash > 0) K.pays++; });

    /* ---------- UI: badge on the Tarefas button + a card on top of the panel ---------- */
    const btn = document.getElementById('opsBtn'), list = document.getElementById('opsList');
    const badge = document.createElement('span');
    badge.className = 'ops-lvl';
    btn.insertBefore(badge, btn.querySelector('kbd'));
    // the insignia also sits on the player's own button (top left)
    const me = document.getElementById('meBtn');
    const meRank = document.createElement('span');
    meRank.className = 'me-rank';
    if (me) me.insertAdjacentElement('afterend', meRank);
    meRank.setAttribute('role', 'button');
    meRank.tabIndex = 0;
    const openCareer = () => { if (sys.ops) sys.ops.toggle(true); };
    meRank.addEventListener('click', openCareer);
    meRank.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); openCareer(); } });
    const box = document.createElement('section');
    box.className = 'career';
    box.setAttribute('aria-label', 'Sua carreira');
    const sec = document.getElementById('opsCount');
    list.parentNode.insertBefore(box, sec && sec.parentNode.parentNode === list.parentNode ? sec.parentNode : list);

    // the big moment: the new insignia in the middle of the screen for a few seconds
    let promoT = null;
    function showPromo(L) {
      const host = game.root || document.body;
      let el = host.querySelector('.promo');
      if (!el) { el = document.createElement('div'); el.className = 'promo'; el.setAttribute('aria-live', 'polite'); host.appendChild(el); }
      el.style.setProperty('--c', L.rank.color);
      el.innerHTML = '<div class="promo__rays" aria-hidden="true"></div>' + DL.rankEmblem(L.rank, 150) +
        '<p class="eyebrow-sm promo__k">Promoção · nível ' + K.level + '</p><p class="promo__name">' + esc(L.rank.name) + '</p><p class="promo__m">' + esc(L.mission) + '</p>';
      el.classList.remove('is-on');
      void el.offsetWidth;
      el.classList.add('is-on');
      clearTimeout(promoT);
      promoT = setTimeout(() => el.classList.remove('is-on'), 3600);
    }

    function render(force) {
      const L = cur(), [n, goal] = L.progress(), r = req();
      const key = K.level + ':' + K.done + ':' + n + ':' + K.xp + ':' + K.lvlXp + ':' + K.lvlSolved.length;
      // the mission alone is not the promotion: say plainly what is still missing
      const mDone = n >= goal, needXp = r ? Math.max(0, r.xp - K.lvlXp) : 0, needDis = r ? Math.max(0, r.distinct - K.lvlSolved.length) : 0;
      const missing = K.done ? '' : !mDone
        ? (r && (needXp || needDis) ? 'Para subir de patente: termine a missão' + (needXp ? ', junte mais ' + needXp + ' XP' : '') + (needDis ? ' e resolva mais ' + needDis + ' problema' + (needDis > 1 ? 's diferentes' : ' diferente') : '') + '.' : '')
        : needXp || needDis
          ? 'Missão concluída ✓ Para a promoção ainda falta: ' + [needXp ? needXp + ' XP' : '', needDis ? needDis + ' problema' + (needDis > 1 ? 's diferentes' : ' diferente') + ' resolvido' + (needDis > 1 ? 's' : '') + ' por você' : ''].filter(Boolean).join(' e ') + '. Os problemas aparecem em Tarefas (T).'
          : '';
      if (!force && key === K.key) return;
      K.key = key;
      badge.textContent = L.rank.short;
      badge.style.setProperty('--c', L.rank.color);
      btn.title = 'Tarefas · sua patente: ' + L.rank.name + ' (nível ' + K.level + ')';
      meRank.innerHTML = DL.rankEmblem(L.rank, 34) + '<span class="me-rank__txt" style="--c:' + L.rank.color + '">' + esc(L.rank.short) + '</span>';
      meRank.title = 'Sua patente: ' + L.rank.name + ' (nível ' + K.level + ') · clique para ver a carreira';
      const crewTop = K.done ? K.level : K.level - 1;
      const next = !K.done && unlocksAt(K.level + 1);
      // Clean card: the rank with ONE XP bar on top, the current mission as its own card with one bar, and the
      // long texts (how to do it, the ladder, what the crew does alone) folded under "?" / "Ver detalhes".
      const xpNow = r ? Math.min(K.lvlXp, r.xp) : K.xp, xpMax = r ? r.xp : 0;
      const xpBar = r
        ? '<div class="career__bar career__bar--xp" role="progressbar" aria-label="XP da patente" aria-valuemin="0" aria-valuemax="' + xpMax + '" aria-valuenow="' + xpNow + '"><i style="transform:scaleX(' + Math.min(1, xpNow / xpMax).toFixed(3) + ')"></i></div>' +
          '<p class="career__xpline"><span class="mono">' + xpNow + ' / ' + xpMax + ' XP</span>' + (K.level < MAX ? '<span>Próxima: <b>' + esc(LEVELS[K.level].rank.name) + '</b></span>' : '') + '</p>'
        : '<p class="career__xpline"><span class="mono">' + K.xp + ' XP no total</span>' + (K.level < MAX ? '<span>Próxima: <b>' + esc(LEVELS[K.level].rank.name) + '</b></span>' : '') + '</p>';
      box.innerHTML =
        '<div class="career__top">' + DL.rankEmblem(L.rank, 44) +
          '<div class="career__who"><span class="eyebrow-sm">Patente · nível ' + K.level + '/' + MAX + '</span>' +
          '<p class="career__name" style="--c:' + L.rank.color + '">' + esc(L.rank.name) + '</p></div>' +
          '<details class="career__q" data-det="career-help"><summary aria-label="Como subir de patente">?</summary>' +
            '<div class="career__pop">' +
              '<ol class="career__ladder" aria-hidden="true">' + LEVELS.map((x, i) => '<li class="' + (i < K.level - 1 ? 'is-done' : i === K.level - 1 ? 'is-cur' : '') + '" style="--c:' + x.rank.color + '" title="' + esc(x.rank.name) + '"></li>').join('') + '</ol>' +
              '<p>Suba de patente cumprindo a <b>missão</b>' + (r ? ' e juntando <b>' + r.xp + ' XP</b> com ' + r.distinct + ' problemas diferentes resolvidos' : '') + '. Você tem <b>' + K.xp + ' XP</b> no total.</p>' +
              '<p>' + (crewTop < 1 ? 'A equipe ainda só faz o básico sozinha (recepção, rondas, café).' : 'A equipe faz sozinha as tarefas até o nível ' + crewTop + '.') +
              (next && next.length ? ' No nível ' + (K.level + 1) + ' ela passa a fazer: ' + esc(next.join(', ').toLowerCase()) + '.' : '') + '</p>' +
            '</div></details>' +
        '</div>' +
        xpBar +
        (K.done
          ? '<div class="mission"><span class="eyebrow-sm">Carreira</span><p class="mission__title">Carreira completa. Toda a rotina do datacenter está nas mãos da equipe.</p></div>'
          : '<div class="mission"><div class="mission__row"><span class="eyebrow-sm">Missão atual</span><span class="mono mission__n">' + n + '/' + goal + '</span></div>' +
            '<p class="mission__title">' + esc(L.mission) + '</p>' +
            '<div class="career__bar career__bar--mission" role="progressbar" aria-label="Missão" aria-valuemin="0" aria-valuemax="' + goal + '" aria-valuenow="' + n + '"><i style="transform:scaleX(' + (n / goal).toFixed(3) + ')"></i></div>' +
            (missing ? '<p class="mission__need' + (mDone ? ' is-wait' : '') + '">' + esc(missing) + '</p>' : '') +
            '<details class="ops-more" data-det="career-how"><summary>Ver detalhes</summary><p>' + esc(L.how) + '</p>' +
            (r ? '<p>Problemas diferentes resolvidos nesta patente: <b>' + Math.min(K.lvlSolved.length, r.distinct) + '/' + r.distinct + '</b></p>' : '') + '</details></div>');
      if (DL.keepOpen) DL.keepOpen.apply(box);
    }

    function update(dt) {
      // orders given since the last check (the crew counter starts again at 0 on every load)
      const seen = sys.crew.assignedCount || 0;
      if (seen > K.seenOrders) K.orders += seen - K.seenOrders;
      K.seenOrders = seen;
      K.acc += dt;
      if (K.acc < 0.5) return;
      K.acc = 0;
      if (!K.done && isDone()) promote(false);
      render();
    }

    function reset() {
      Object.assign(K, { level: 1, done: false, fixed: 0, orders: 0, pays: 0, base: {}, seenOrders: sys.crew.assignedCount || 0, key: '', xp: 0, lvlXp: 0, lvlSolved: [], solved: {}, prev: null });
      K.base = baseFor(1);
      render(true);
    }

    reset();
    return {
      update, reset, render, LEVELS, TASK_TIER, tierOf, xpFor, solve,
      // the player's rank and XP, read-only (the character screen shows them: crew.js)
      get info() {
        const L = cur(), r = req();
        return { level: K.level, done: K.done, rank: L.rank, xp: K.xp, lvlXp: r ? Math.min(K.lvlXp, r.xp) : K.xp, need: r ? r.xp : 0 };
      },
      // a new game: presets that already have servers online skip the levels they already meet
      start() { reset(); settle(true); game.emit('career', { level: K.level }); },
      // may a bot pick this task on its own?
      botCan: (def) => K.done || tierOf(def) < K.level,
      // the player level a task needs before bots do it alone
      levelFor: (def) => tierOf(def) + 1,
      solvedCount: (id) => K.solved[id] || 0,
      // the cloud save's answer (game_save_career): the server never allows more XP than it saw solved,
      // nor a promotion past a rank whose XP isn't there — its numbers win
      // `pendXp`: XP of what was solved but the server has not counted yet (it counts a few per save; the rest
      // goes in the next one — economy.js), so that XP is not taken away meanwhile
      applyServer(c, pendXp) {
        if (!c || typeof c !== 'object') return;
        const pend = Math.max(0, pendXp | 0);
        const xp = Math.max(0, c.xp | 0) + pend, level = Math.max(1, Math.min(MAX, c.level | 0 || K.level));
        // XP the server did not see solved comes off — off this level's XP too, by the same amount
        const cut = Math.max(0, K.xp - xp), before = K.lvlXp;
        if (cut) { K.xp = xp; K.lvlXp = Math.max(0, K.lvlXp - cut); }
        // a promotion the server refused (XP / different problems not there yet). While something is still on its
        // way to the server, wait for the next save; otherwise go back to where the level before stood — the
        // mission keeps its progress, only what is really missing has to be done
        if (level < K.level && !pend) {
          const pv = K.prev && K.prev.level === level ? K.prev : null;
          K.level = level;
          K.done = false;
          if (pv) {
            K.base = pv.base;
            K.lvlXp = Math.max(0, pv.lvlXp + before - cut);
            K.lvlSolved = pv.lvlSolved.concat(K.lvlSolved.filter((x) => pv.lvlSolved.indexOf(x) < 0));
          } else { K.base = baseFor(K.level); K.lvlXp = Math.min(K.lvlXp, K.xp); }
          K.prev = null;
          // the XP is there and it was still refused: the server saw fewer different problems than this save
          // remembers (an old save, a problem solved offline). One more solved by the player settles it —
          // without this the promotion would be claimed and refused again at every save
          if (xpDone() && K.lvlSolved.length) K.lvlSolved.pop();
          game.toast('info', 'Patente em conferência', 'O servidor ainda não confirmou a promoção: falta XP ou problemas diferentes resolvidos por você. Sua missão continua de onde estava.');
          game.emit('career', { level: K.level });
        }
        render(true);
      },
      snapshot: () => ({ level: K.level, done: K.done, fixed: K.fixed, orders: K.orders, pays: K.pays, base: K.base, xp: K.xp, lvlXp: K.lvlXp, lvlSolved: K.lvlSolved.slice(), solved: Object.assign({}, K.solved), prev: K.prev }),
      restore(s) {
        reset();
        if (s) {
          const v = s.base && s.base.v;
          let lvl = (s.level | 0) || 1;
          // v3 saves had Trainee as level 2; it is part of Estagiário now, so from level 2 on every level moves down one.
          // Saves older than v3 came before Trainee existed and already use today's numbering.
          if (v === 3 && lvl >= 2) lvl--;
          K.level = Math.max(1, Math.min(MAX, lvl));
          K.done = !!s.done && K.level === MAX;
          K.fixed = s.fixed | 0; K.orders = s.orders | 0; K.pays = s.pays | 0;
          // older saves: the mission then starts counting from now
          K.base = v === 4 ? s.base : baseFor(K.level);
          K.xp = Math.max(0, s.xp | 0);
          K.lvlXp = v === 4 ? Math.max(0, s.lvlXp | 0) : 0;
          K.lvlSolved = v === 4 && Array.isArray(s.lvlSolved) ? s.lvlSolved.filter((x) => typeof x === 'string').slice(0, 100) : [];
          const pv = s.prev;
          if (v === 4 && pv && typeof pv === 'object' && (pv.level | 0) === K.level - 1 && pv.base && typeof pv.base === 'object')
            K.prev = { level: pv.level | 0, base: pv.base, lvlXp: Math.max(0, pv.lvlXp | 0), lvlSolved: Array.isArray(pv.lvlSolved) ? pv.lvlSolved.filter((x) => typeof x === 'string').slice(0, 100) : [] };
          if (s.solved && typeof s.solved === 'object') for (const k of Object.keys(s.solved).slice(0, 200)) K.solved[k] = Math.max(0, s.solved[k] | 0);
        }
        settle(true);
        game.emit('career', { level: K.level });
      },
      get done() { return K.done; },
      get level() { return K.level; },
      get xp() { return K.xp; },
      get levelXp() { return { xp: K.lvlXp, solved: K.lvlSolved.slice(), need: req() }; },
      get title() { return cur().rank.name; },
      get rank() { return cur().rank; },
    };
  };
})();
