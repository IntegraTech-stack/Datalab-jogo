/* DataLab — staff: the datacenter run as a small company (manager → technicians → equipment → services).
   - Maintenance: PCs and switches break now and then (hardware). An IT technician takes the unit out,
     carries it to a bench, repairs it and installs it back (crew.js animates the job, kind 'repair').
   - Work orders: the manager (or the player) opens orders — repair, fix a fault, cable a server, install
     a server / rack / precision AC, expand a room — and they are dispatched to whoever can do them.
     Each order is followed until done (or it fails and is retried).
   - Incidents: every problem the Monitor raises becomes an order too (the manager on duty hands it out):
     the right person walks there and works on it for a few game minutes, one incident at a time.
   - Clients: visitors come in through the reception, wait there and leave; they never leave that room.
   - Team chat: the player can talk to the crew; whoever is addressed (or knows the subject) answers. */
(function () {
  'use strict';
  const DL = window.DL, T = DL.T;
  const rand = Math.random;
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const between = (a, b) => a + rand() * (b - a);
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  // slang-aware ("vc", "tbm", "pra"…) when talk.js is loaded
  const norm = (s) => (DL.normSlang ? DL.normSlang(String(s || '')) : String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, ''));

  const SYSTEM = { name: 'Sistema', color: '#ff7a17', role: 'Monitor' };
  const RESERVE = 40000; // the manager never spends below this cash balance
  const STATUS = { open: 'Aberta', run: 'Em andamento', done: 'Concluída', fail: 'Falhou', cancel: 'Cancelada' };
  const ORDER = {
    repair: { label: 'Consertar', icon: '🔧' },
    fix: { label: 'Resolver falha', icon: '⚠️' },
    cable: { label: 'Ligar cabo', icon: '🔌' },
    'install-server': { label: 'Instalar servidor', icon: '🖥️', cost: 6000, cat: 'server' },
    'install-rack': { label: 'Instalar rack', icon: '🗄️', cost: 1800, cat: 'rack' },
    'install-crac': { label: 'Instalar ar de precisão', icon: '❄️', cost: 9000, cat: 'crac' },
    'expand-room': { label: 'Ampliar sala', icon: '📐', cost: 4000 },
    incident: { label: 'Incidente', icon: '🚨' },
  };
  const priceOf = (id) => { const c = (DL.CATALOG || []).find((x) => x.id === id); return c ? c.price : 0; };

  DL.createStaff = function (game, sys) {
    const scene = game.scene, crew = sys.crew, ops = sys.ops;
    const world = () => scene.world;
    const chat = () => game.chat;
    const api = () => crew.api;
    const alive = (m) => crew.members.indexOf(m) >= 0;
    const tasksOf = (m) => api().tasksOf(m);
    const playerName = () => (crew.playerProfile ? crew.playerProfile.name : 'Você');
    const cash = () => (game.economy ? game.economy.company.cash : 1e9);
    const typeOf = (r) => (DL.roomTypeOf ? DL.roomTypeOf(r) : null);
    const $ = (id) => document.getElementById(id);
    const el = { list: $('ordersList'), count: $('ordersCount') };

    /* ================================================================== */
    /* Maintenance: broken hardware                                        */
    /* ================================================================== */
    const M = { broken: [], seq: 0, next: 150, acc: 0 };
    const broken = () => M.broken;
    const canRepair = (m) => tasksOf(m).some((t) => t.kind === 'repair');

    // opts.quiet: no announcement of its own (the fire, incendio.js, tells the story itself)
    function breakItem(x, opts) {
      if (!x) return null;
      const isDev = !!x.key && !!x.rack;
      if (isDev ? x.broken : x.broken) return null;
      const rec = { id: ++M.seq, kind: isDev ? (x.kind === 'server' ? 'server' : 'switch') : 'pc', since: scene.t, taken: null, out: false };
      if (isDev) {
        x.broken = true;
        Object.assign(rec, { dev: x, place: x.rack, label: x.name });
        ops.recompute();
      } else {
        x.broken = true;
        Object.assign(rec, { item: x, place: x, label: x.id || 'PC' });
      }
      M.broken.push(rec);
      if (opts && opts.quiet) {
        // (still a work order for the technicians, as with any broken unit)
        const mgr = manager();
        if (mgr) chat().later(between(2.5, 4), () => { if (alive(mgr) && M.broken.indexOf(rec) >= 0) createOrder('repair', rec, { by: mgr }); });
      } else announceBroken(rec);
      return rec;
    }

    function announceBroken(rec) {
      const st = rec.item && crew.stationOf(rec.item);
      const user = st && crew.userOf(st);
      const what = rec.kind === 'switch' ? 'O switch ' + rec.label + ' (' + rec.place.id + ') apagou: defeito de hardware' : 'O computador ' + rec.label + ' queimou a fonte';
      ops.logEvent('warn', '🔧 ' + what);
      game.toast('warn', '🔧 Equipamento quebrado', what + (rec.kind === 'switch' ? ' · os servidores ligados nele caíram' : ''));
      if (user) {
        api().cancelJob(user, true);
        chat().post(user, pick(['Meu PC (' + rec.label + ') desligou do nada e não liga mais 😩', 'Cheiro de queimado aqui… o ' + rec.label + ' apagou.']), { tone: 'warn' });
      } else {
        const w = crew.members.find((m) => m.crew.profile.role === 'redes') || crew.members.find((m) => !m.crew.hold);
        if (w) chat().post(w, '⚠️ ' + what + '.', { tone: 'warn' });
        else chat().post(SYSTEM, '⚠️ ' + what + '.', { tone: 'warn' });
      }
      // the manager reacts right away: opens a work order for the technicians
      const mgr = manager();
      if (mgr) chat().later(between(1.8, 2.8), () => { if (alive(mgr) && M.broken.indexOf(rec) >= 0) createOrder('repair', rec, { by: mgr }); });
      else if (!crew.members.some(canRepair)) chat().later(2, () => chat().post(SYSTEM, 'Ninguém da equipe conserta hardware. Contrate um(a) Técnico(a) de TI (C → Contratar).', { tone: 'warn' }));
    }

    function takeOut(rec, a) {
      if (M.broken.indexOf(rec) < 0) return false;
      rec.out = true;
      if (rec.dev) rec.dev.out = true;
      if (rec.item) rec.item.pcOut = true;
      ops.logEvent('info', (a ? a.crew.name : 'Técnico') + ' retirou o ' + rec.label + ' para a bancada');
      game.emit('world-soft');
      return true;
    }
    function putBack(rec) {
      if (!rec.out) return;
      rec.out = false;
      if (rec.dev) rec.dev.out = false;
      if (rec.item) rec.item.pcOut = false;
    }
    function repaired(rec, a) {
      const i = M.broken.indexOf(rec);
      if (i < 0) return { say: 'O ' + rec.label + ' já tinha sido consertado.' };
      M.broken.splice(i, 1);
      rec.out = false;
      if (rec.dev) { rec.dev.broken = false; rec.dev.out = false; rec.dev.care = scene.t + 400; }
      if (rec.item) { rec.item.broken = false; rec.item.pcOut = false; rec.item.care = scene.t + 400; }
      ops.recompute();
      ops.logEvent('ok', '🔧 ' + rec.label + ' consertado e reinstalado' + (a ? ' · por ' + a.crew.name : ''));
      game.toast('ok', 'Equipamento consertado', rec.label + ' de volta' + (a ? ' · ' + a.crew.name : ''));
      game.sfx('done');
      game.emit('repaired', { rec });
      const say = rec.kind === 'server'
        ? pick(['Troquei a placa queimada do ' + rec.label + ' e reinstalei no ' + rec.place.id + '. Falta o cabo e a configuração.', rec.label + ' de volta no rack com peça nova. Agora é cabear e configurar.'])
        : rec.kind === 'switch'
        ? pick(['Troquei a fonte do ' + rec.label + ' e reinstalei no ' + rec.place.id + '. Links subindo!', rec.label + ' reinstalado: cabos de volta nas mesmas portas, LEDs verdes.'])
        : pick(['PC ' + rec.label + ' consertado: fonte nova e teste de memória ok.', 'Reinstalei o ' + rec.label + '. Pode voltar a usar!']);
      return { say, tone: 'ok', fixed: true };
    }
    // preventive maintenance keeps a unit from breaking for a while
    function prevent(x) { x.care = scene.t + 300; }

    // A workbench: technical desk, table, tool cart or shelf — the closest one (inside the sector first).
    function benchFor(a, rec) {
      const nav = api().nav, W = world();
      const ok = (e) => !e.host && (e.kind === 'table' || e.kind === 'cart' || e.kind === 'toolcart' || e.kind === 'shelf' || (e.kind === 'desk' && e.setup === 'tech' && !e.broken)) && e !== rec.item;
      let best = null, bestD = Infinity;
      const free = (tx, ty) => nav.free(tx, ty) && !(W.keepClear && W.keepClear.has(tx + ',' + ty)) && !W.items.some((x) => x.kind === 'chair' && x.tx === tx && x.ty === ty);
      for (const e of W.items) {
        if (!ok(e)) continue;
        // a desk someone is working at is not a bench
        const st = e.kind === 'desk' && crew.stationOf(e);
        if (st && crew.userOf(st)) continue;
        const tw = e.tw || 1, th = e.th || 1;
        // stand in front of it, or beside it (never on a chair)
        const spots = [[e.tx + Math.floor(tw / 2), e.ty + th, 'up'], [e.tx + tw, e.ty + th - 1, 'left'], [e.tx - 1, e.ty + th - 1, 'right']];
        const s = spots.find(([x, y]) => free(x, y));
        if (!s) continue;
        const p = nav.center(s[0], s[1]);
        let d = Math.hypot(p.x - a.x, p.y - a.y) * (e.kind === 'desk' || e.kind === 'cart' || e.kind === 'toolcart' ? 0.6 : 1);
        if (!api().inZone(a, p)) d *= 1.6;
        if (d < bestD) { bestD = d; best = { x: p.x, y: p.y, dir: s[2], label: e.id || DL.itemName(e), ux: e.px + tw * 8, uy: e.py + 2, item: e }; }
      }
      return best;
    }

    function tickBreakage(dt) {
      if (game.paused() || !crew.members.some(canRepair) || M.broken.length >= 2) return;
      M.next -= dt;
      if (M.next > 0) return;
      const dir = game.director;
      M.next = dir ? between(260, 420) : between(160, 260);
      const t = scene.t;
      const pcs = world().items.filter((e) => e.kind === 'desk' && !e.broken && !(e.care > t));
      const sws = ops.devices().filter((d) => d.kind === 'switch' && !d.broken && !(d.care > t) && d.sw.linked && d.sw.linked.size > 0);
      // a switch dying takes servers down with it: critical (rarer, may jump the queue — director.js)
      const critical = sws.length && rand() < 0.3;
      if (dir && !dir.canStart('hardware', { critical })) {
        if (!critical || !dir.canStart('hardware')) { M.next = between(40, 80); return; }
      }
      const pool = critical ? sws.map((x) => [x, 1]) : pcs.map((x) => [x, 1]).concat(sws.map((x) => [x, 0.4]));
      if (!pool.length) return;
      let k = rand() * pool.reduce((s, p) => s + p[1], 0);
      for (const [x, w] of pool) {
        if ((k -= w) <= 0) { const rec = breakItem(x); if (rec && dir) dir.started('hardware', rec.label); return; }
      }
    }

    // keep the list honest when the world changes (unit removed, desk sold…)
    function syncBroken() {
      const devs = new Set(ops.devices());
      M.broken = M.broken.filter((rec) => {
        const gone = rec.dev ? !devs.has(rec.dev) : world().items.indexOf(rec.item) < 0;
        if (gone && rec.taken && alive(rec.taken)) api().cancelJob(rec.taken, true);
        return !gone;
      });
    }

    /* ================================================================== */
    /* Work orders                                                         */
    /* ================================================================== */
    const O = { list: [], seq: 0, acc: 0, key: '', lastServer: -999, problems: [] };
    const active = (o) => o.status === 'open' || o.status === 'run';
    const manager = () => crew.members.find((m) => m.crew.profile.role === 'gerente' && !m.crew.leaving && !m.crew.off) || null;
    const orderOf = (m) => (m.crew.job && m.crew.job.order) || null;
    const claimed = (target) => O.list.some((o) => o.target === target && o.status === 'run');
    const hasOrder = (type, target) => O.list.some((o) => active(o) && o.type === type && (target == null || o.target === target));

    // Jobs used only by orders
    const CABLE_DEF = {
      id: 'order_cable', name: 'Ligar cabo do servidor', verb: 'Ligando o cabo', kind: 'equip', skill: 'redes', xp: 16, dur: [6, 10], auto: 0, desc: '',
      place: (d) => d.rack,
      finish(ctx, d) {
        if (d.state !== 'new') return { say: 'O ' + d.name + ' já estava cabeado.' };
        const sw = ops.switchesNear(d).find((s) => !s.broken && DL.portsOf(s).some((p) => p !== 'te1' && !ops.linkAt(s.key, p)));
        if (!sw) return { say: 'Não tem switch com porta livre perto do ' + d.name + '. Precisamos de outro switch.', tone: 'warn', error: 'Sem switch com porta livre' };
        const port = DL.portsOf(sw).find((p) => p !== 'te1' && !ops.linkAt(sw.key, p));
        ops.addLink({ dev: d.key, port: 'eth0' }, { dev: sw.key, port }, { who: ctx.a.crew.name });
        return { say: 'Cabo do ' + d.name + ' ligado no ' + sw.name + ' ' + port + '. ' + playerName() + ', agora é configurar no terminal.', tone: 'ok' };
      },
    };
    const BUILD_DEF = {
      id: 'order_build', name: 'Executar obra', verb: 'Instalando', kind: 'spot', skill: 'servidores', xp: 20, dur: [8, 12], auto: 0, desc: '',
      finish: (ctx, spot) => build(spot.order, ctx.a),
    };

    function eligible(o, m) {
      const ts = tasksOf(m);
      switch (o.type) {
        case 'repair': return ts.find((t) => t.kind === 'repair') || null;
        case 'fix': return api().fixDefFor(m, o.target) || null;
        case 'cable': return ts.some((t) => t.kind === 'fix' && t.types.indexOf('cable') >= 0) ? CABLE_DEF : null;
        case 'install-server': return ts.find((t) => t.id === 'install') || null;
        case 'incident': return incidentDef(o, m);
        default: return ts.some((t) => t.id === 'install' || t.kind === 'repair') ? BUILD_DEF : null;
      }
    }

    function valid(o) {
      switch (o.type) {
        case 'incident': return !o.target.end;
        case 'repair': return M.broken.indexOf(o.target) >= 0;
        case 'fix': return !!o.target.fault && ops.devices().indexOf(o.target) >= 0;
        case 'cable': return ops.devices().indexOf(o.target) >= 0 && o.target.state === 'new';
        case 'install-server': return world().items.indexOf(o.target) >= 0 && o.target.units && o.target.units.indexOf(null) >= 0;
        default: return true;
      }
    }

    function titleOf(type, target, plan) {
      const L = ORDER[type].label;
      if (type === 'incident') return (target.rack ? target.rack.id : target.dev.name) + ' (' + symptomOf(target) + '): ' + ACTS[plan.act].label;
      if (type === 'repair') return L + ' ' + (target.kind === 'switch' ? 'switch ' : 'PC ') + target.label;
      if (type === 'fix') return L + ' no ' + target.name + ' (' + (DL.JOBS.FIX_NAME[target.fault.type] || target.fault.type) + ')';
      if (type === 'cable') return L + ' do ' + target.name;
      if (type === 'install-server') return L + ' no ' + target.id;
      if (type === 'expand-room') return L + ' ' + target.name;
      return L + (target && target.room ? ' na ' + target.room.name : '');
    }

    function createOrder(type, target, opts) {
      opts = opts || {};
      if (hasOrder(type, type === 'install-rack' || type === 'install-crac' || type === 'expand-room' ? null : target)) return null;
      const by = opts.by || null;
      const o = {
        id: ++O.seq, type, target, status: 'open', assignee: null, by, byName: by ? by.crew.name : opts.byName || playerName(),
        title: titleOf(type, target, opts.plan), created: game.clock(), createdT: scene.t, tries: 0, note: '', queue: '', prefer: opts.prefer || null,
        cost: opts.cost != null ? opts.cost : ORDER[type].cost || 0, plan: opts.plan || null,
      };
      O.list.unshift(o);
      if (O.list.length > 30) O.list = O.list.filter((x, i) => i < 30 || active(x));
      ops.logEvent('info', '📋 Ordem #' + o.id + ' aberta: ' + o.title + ' · por ' + o.byName);
      if (by && !opts.silent) chat().post(by, '📋 Ordem #' + o.id + ': ' + o.title + '.' + (o.cost ? ' Orçamento ' + DL.money(o.cost) + '.' : ''));
      dispatch(o);
      render(true);
      return o;
    }

    // Hand an open order to the best available person (technicians first, idle people first).
    function dispatch(o) {
      if (o.status !== 'open' || game.paused()) return false;
      if (!valid(o)) { close(o, 'cancel', 'Não é mais necessária'); return false; }
      if (o.type === 'incident' && !incidentReady(o)) return false;
      // someone already took it on their own: the order follows that person
      const taker = o.type === 'repair' ? o.target.taken : o.type === 'fix' ? crew.members.find((m) => m.crew.job && m.crew.job.target === o.target) : null;
      if (taker && alive(taker) && taker.crew.job && taker.crew.job.target === o.target && !orderOf(taker)) {
        taker.crew.job.order = o;
        o.status = 'run';
        o.assignee = taker;
        o.started = scene.t;
        o.note = '';
        ops.logEvent('info', '📋 Ordem #' + o.id + ' → ' + taker.crew.name + ' (já estava cuidando disso)');
        render(true);
        return true;
      }
      const cands = crew.members.filter((m) => !m.crew.hold && !m.crew.off && !orderOf(m) && eligible(o, m));
      if (!cands.length) { o.queue = waitNote(o); return false; }
      const score = (m) => {
        const j = m.crew.job;
        let s = 0;
        if (o.prefer === m) s -= 100;
        if (m.crew.profile.role === 'tecnico' && o.type !== 'fix') s -= 20;
        if (j && !j.auto) s += 40;                       // ordered by someone: don't pull them away
        if (j && (j.def.kind === 'fix' || j.def.kind === 'repair')) s += 60;
        // an incident: whoever knows it best (the skill of the task that does it), then whoever is closest
        if (o.type === 'incident') s -= (m.crew.stats.skills[eligible(o, m).skill] || 0) / 5;
        const p = o.type === 'incident' ? o.plan.place || o.plan.rack : o.target && (o.target.rack || o.target.place || o.target);
        if (p && p.px != null) s += Math.hypot(p.px - m.x, p.py - m.y) / 40;
        return s;
      };
      cands.sort((x, y) => score(x) - score(y));
      for (const m of cands) {
        const j = m.crew.job;
        if (j && (!j.auto || j.def.kind === 'fix' || j.def.kind === 'repair')) continue;
        const base = eligible(o, m);
        const def = Object.assign({}, base, {
          finish(ctx, t) {
            let r = null;
            try { r = base.finish(ctx, t); } catch (err) { console.warn('order', o.id, err); r = { error: 'Erro inesperado' }; }
            o.result = r && (r.failed || r.error) ? 'fail' : 'ok';
            if (r && r.error) o.note = r.error;
            if (o.type === 'install-server' && o.result === 'ok' && r && r.tone === 'ok') charge(priceOf('server'), 'Servidor (ordem #' + o.id + ')');
            return r;
          },
        });
        let target = o.target;
        if (o.type === 'install-rack' || o.type === 'install-crac' || o.type === 'expand-room' || (o.type === 'incident' && o.plan.act === 'cracnew')) {
          const sp = workSpot(o);
          if (!sp) { o.note = 'Sem lugar para trabalhar'; continue; }
          target = Object.assign(sp, { order: o });
        }
        o.result = null;
        const why = api().startJob(m, def, { auto: false, quiet: true, target });
        if (why) { o.note = why; continue; }
        m.crew.job.order = o;
        o.status = 'run';
        o.assignee = m;
        o.started = scene.t;
        o.note = '';
        o.queue = '';
        const boss = o.by && alive(o.by) ? o.by : null;
        if (boss && boss !== m) chat().later(between(0.8, 1.4), () => { if (alive(boss)) chat().post(boss, pick([m.crew.name + ', ', 'Passando a ordem #' + o.id + ' para ' + m.crew.name + ': ']) + o.title.toLowerCase() + '.'); });
        chat().later(between(2, 3), () => { if (alive(m) && orderOf(m) === o) chat().post(m, pick(['Deixa comigo! Ordem #' + o.id + ' em andamento.', 'Indo agora: ' + o.title.toLowerCase() + '.', 'Peguei a ordem #' + o.id + '.'])); });
        ops.logEvent('info', '📋 Ordem #' + o.id + ' → ' + m.crew.name + ' (' + DL.ROLES[m.crew.profile.role].name + ')');
        render(true);
        return true;
      }
      o.queue = waitNote(o);
      return false;
    }

    // why an open order is still waiting: nobody on the team does it (and who to hire), nobody on shift, or
    // everyone who can is busy (one order per person)
    const rolesFor = (ok) => Object.keys(DL.JOBS.BY_ROLE).filter((r) => DL.ROLES[r] && !DL.ROLES[r].custom && ok(DL.JOBS.BY_ROLE[r])).map((r) => DL.ROLES[r].name);
    function waitNote(o) {
      const able = crew.members.filter((m) => !m.crew.leaving && eligible(o, m));
      if (!able.length) {
        const who = o.type === 'incident' ? rolesFor((ts) => taskFor(ts, ACTS[o.plan.act])) : o.type === 'repair' ? rolesFor((ts) => ts.some((t) => t.kind === 'repair')) : [];
        return 'Ninguém da equipe faz isso' + (who.length ? ' · contrate: ' + who.join(' ou ') : '');
      }
      if (able.every((m) => m.crew.off)) return 'Aguardando alguém do turno';
      return 'Na fila · quem faz isso está ocupado';
    }

    function close(o, status, note) {
      o.status = status;
      o.done = game.clock();
      o.doneT = scene.t;
      if (note) o.note = note;
      o.assignee && alive(o.assignee) && o.assignee.crew.job && o.assignee.crew.job.order === o && (o.assignee.crew.job.order = null);
      if (status === 'done') {
        ops.logEvent('ok', '📋 Ordem #' + o.id + ' concluída: ' + o.title + (o.assignee ? ' · ' + o.assignee.crew.name : ''));
        if (game.economy) game.economy.earn('credits', 3, 'Ordem de serviço #' + o.id + ' concluída', { quiet: true });
        const boss = o.by && alive(o.by) ? o.by : null;
        if (boss && boss !== o.assignee) chat().later(between(1.5, 2.5), () => { if (alive(boss)) chat().post(boss, pick(['Ordem #' + o.id + ' fechada. Valeu, ' + (o.assignee ? o.assignee.crew.name : 'time') + '!', 'Ótimo, ordem #' + o.id + ' concluída.']), { tone: 'ok' }); });
      } else if (status === 'fail') ops.logEvent('warn', '📋 Ordem #' + o.id + ' falhou: ' + o.title + (o.note ? ' · ' + o.note : ''));
      render(true);
    }

    // most urgent first: the Monitor's severity for incidents, a broken switch or a fault next to them
    const rankOf = (o) => (o.type === 'incident' ? SEV_RANK[o.target.sev] || 0 : o.type === 'fix' || (o.type === 'repair' && o.target.kind === 'switch') ? 3 : 1);
    function followOrders() {
      for (const o of O.list) {
        if (o.status !== 'run') continue;
        const m = o.assignee;
        if (m && alive(m) && m.crew.job && m.crew.job.order === o) {
          // the incident got fixed some other way (the player, a cable put back) while they were on it — a hot
          // rack too, once its cause is gone (it only needs time to cool down)
          if (o.type === 'incident' && (!valid(o) || (o.target.kind === 'temp' && game.monitor && game.monitor.cooling(o.target)))) {
            api().cancelJob(m, true);
            close(o, 'cancel', 'Resolvido antes');
            if (rand() < 0.5) chat().post(m, pick(['Já resolveram o ' + where(o) + '. Voltando ao que eu fazia.', 'O ' + where(o) + ' voltou antes de eu terminar. Melhor assim!']));
            continue;
          }
          o.progress = api().progressOf(m);
          continue;
        }
        // the job ended (finished, cancelled or the person left)
        if (o.result === 'ok') { close(o, 'done'); continue; }
        if ((o.type === 'repair' || o.type === 'fix') && !valid(o)) { close(o, 'done', 'Resolvido'); continue; }
        if (o.type === 'incident' && !valid(o)) { close(o, 'cancel', 'Resolvido antes'); continue; }
        o.tries++;
        o.assignee = null;
        o.progress = 0;
        if (o.tries >= 3) close(o, 'fail', o.note || 'Não deu certo depois de 3 tentativas');
        else { o.status = 'open'; o.note = o.note || 'Interrompida · será reatribuída'; }
      }
      // then the queue: one order per free person, the most urgent and the oldest first
      const queue = O.list.filter((o) => o.status === 'open').sort((a, b) => rankOf(b) - rankOf(a) || a.createdT - b.createdT);
      for (const o of queue) {
        if (!valid(o)) close(o, 'cancel', o.type === 'repair' || o.type === 'fix' || o.type === 'incident' ? 'Resolvido antes' : 'Não é mais necessária');
        else dispatch(o);
      }
    }

    /* ---------- construction work done by technicians ---------- */
    function serverRooms() {
      const rooms = world().rooms || [];
      const typed = rooms.filter((r) => typeOf(r) === 'servers');
      if (typed.length) return typed;
      const withRacks = new Set(world().items.filter((e) => e.kind === 'rack').map((e) => ops.roomOf(e)).filter(Boolean));
      return Array.from(withRacks);
    }
    const tileFree = (tx, ty) => {
      const W = world();
      if (tx < 0 || ty < 0 || tx >= W.W || ty >= W.H || W.solid[ty * W.W + tx]) return false;
      if (W.keepClear && W.keepClear.has(tx + ',' + ty)) return false;
      return !W.items.some((e) => !e.host && !e.wall && !e.rug && e.kind !== 'rug' && tx >= e.tx && tx < e.tx + (e.tw || 1) && ty >= e.ty && ty < e.ty + (e.th || 1));
    };
    const inRoom = (r, tx, ty) => { const W = world(); const i = W.roomAt ? W.roomAt[ty * W.W + tx] : -1; return i >= 0 && W.rooms[i] === r; };
    // candidate tiles for a new rack / AC: next to the existing racks first, then along the walls (an AC: the
    // right wall, then the left one). room: only in that room (the one a hot rack is in)
    function spotsFor(kind, room) {
      const out = [];
      for (const r of room ? [room] : serverRooms()) {
        const free = (tx, ty) => inRoom(r, tx, ty) && tileFree(tx, ty) && tileFree(tx, ty + 1) && inRoom(r, tx, ty + 1);
        if (kind === 'rack') {
          for (const e of world().items) {
            if (e.kind !== 'rack' || ops.roomOf(e) !== r) continue;
            for (const dx of [1, -1]) if (free(e.tx + dx, e.ty)) out.push({ r, tx: e.tx + dx, ty: e.ty });
          }
        }
        if (kind === 'crac') for (const tx of [r.x + r.w - 1, r.x]) for (let ty = r.y + 1; ty < r.y + r.h - 1; ty++) { if (free(tx, ty)) out.push({ r, tx, ty }); }
        else for (let ty = r.y + 1; ty < r.y + r.h - 1; ty++) for (let tx = r.x + 1; tx <= r.x + r.w - 2; tx++) if (free(tx, ty)) out.push({ r, tx, ty });
      }
      return out;
    }

    function workSpot(o) {
      const nav = api().nav;
      let tx, ty, label;
      if (o.type === 'expand-room') {
        const r = o.target;
        tx = r.x + Math.floor(r.w / 2); ty = r.y + r.h - 1; label = r.name;
      } else {
        const ac = o.type === 'install-crac' || (o.type === 'incident' && o.plan.act === 'cracnew');
        const sp = o.spot || spotsFor(ac ? 'crac' : 'rack', o.type === 'incident' ? o.plan.room : null)[0];
        if (!sp) return null;
        o.spot = sp;
        tx = sp.tx; ty = sp.ty + 1; label = sp.r.name;
      }
      const f = nav.nearestFree(tx, ty, 4);
      if (!f) return null;
      return Object.assign(nav.center(f[0], f[1]), { label });
    }

    function charge(price, name) {
      if (price > 0) game.emit('purchase', { price, name });
    }

    function build(o, a) {
      if (!o) return { error: 'Ordem perdida' };
      const B = game.builder;
      if (!B || B.active) return { say: 'Espero você sair do modo construção para mexer na sala.', error: 'Modo construção aberto' };
      if (o.type === 'expand-room') {
        const r = o.target, rooms = world().rooms, i = rooms.indexOf(r);
        if (i < 0) return { error: 'A sala mudou' };
        const size = () => (world().areas || []).reduce((s, x) => s + x.w * x.h, 0);
        const before = size();
        for (const [dw, dh] of [[0, 2], [2, 0], [0, 1], [1, 0]]) {
          B.api.resizeRoom(world().rooms.indexOf(r) >= 0 ? world().rooms.indexOf(r) : i, dw, dh);
          if (size() > before) {
            charge(o.cost, 'Ampliação da ' + r.name);
            return { say: 'Ampliei a ' + r.name + '. Mais espaço para racks!', tone: 'ok' };
          }
        }
        return { say: 'Não consegui ampliar a ' + r.name + ': falta terreno livre em volta. ' + playerName() + ', dá para aumentar o terreno no modo construção (B → Espaços).', tone: 'warn', error: 'Sem terreno livre em volta da sala' };
      }
      const kind = o.type === 'install-crac' ? 'crac' : 'rack';
      const tries = (o.spot ? [o.spot] : []).concat(spotsFor(kind)).slice(0, 12);
      for (const sp of tries) {
        const why = B.api.place(kind, sp.tx, sp.ty, 0);
        if (!why) {
          charge(priceOf(kind), kind === 'crac' ? 'Ar de precisão' : 'Rack');
          const e = world().items.filter((x) => x.kind === kind).slice(-1)[0];
          return { say: (kind === 'crac' ? 'Ar de precisão' : 'Rack ' + (e ? e.id : '')) + ' instalado na ' + sp.r.name + '. ' + (kind === 'rack' ? 'Já dá para receber servidores.' : 'A sala vai esfriar.'), tone: 'ok' };
        }
      }
      return { say: 'Não achei lugar livre para o ' + (kind === 'crac' ? 'ar de precisão' : 'rack') + '.', tone: 'warn', error: 'Sem lugar livre na sala' };
    }

    /* ================================================================== */
    /* Incidents: every problem on the Monitor becomes a work order         */
    /* ================================================================== */
    // What the team does about each kind of problem (monitor.js p.kind): the label in the orders, how long it
    // takes (game minutes = real seconds; the more skilled, the nearer the short end), who can do it — a fix task
    // for these fault types (jobs.js), or one of these tasks / task kinds — and what the job is called.
    const ACTS = {
      replug: { label: 'conferir cabo e energia', verb: 'Conferindo cabo e energia', span: [60, 120], types: ['cable'] },
      reboot: { label: 'religar e reiniciar o servidor', verb: 'Reiniciando o servidor', span: [60, 180], types: ['link'] },
      swport: { label: 'reativar a porta do switch', verb: 'Reativando a porta do switch', span: [60, 120], types: ['port'] },
      web: { label: 'reiniciar o serviço web', verb: 'Reiniciando o nginx', span: [60, 180], types: ['service'], tasks: ['svc'] },
      disk: { label: 'limpar o disco', verb: 'Limpando o disco', span: [120, 240], types: ['disk'] },
      cpu: { label: 'reiniciar o serviço travado', verb: 'Reiniciando o serviço travado', span: [120, 240], types: ['service', 'disk'], tasks: ['svc'] },
      winsvc: { label: 'reiniciar o serviço do Windows', verb: 'Reiniciando o serviço do Windows', span: [60, 180], types: ['winsvc'] },
      unlock: { label: 'desbloquear a conta no AD', verb: 'Desbloqueando a conta no AD', span: [60, 120], types: ['lockout'] },
      cracfix: { label: 'manutenção do ar de precisão', verb: 'Fazendo manutenção no ar de precisão', span: [180, 360], tasks: ['cool'], kinds: ['repair'] },
      cracnew: { label: 'instalar ar de precisão', verb: 'Instalando o ar de precisão', span: [300, 480], tasks: ['install'], kinds: ['repair'] },
      airflow: { label: 'manutenção do rack (fluxo de ar)', verb: 'Arrumando o fluxo de ar do rack', span: [180, 360], tasks: ['cool', 'cables'], kinds: ['repair'] },
      tidy: { label: 'organizar os cabos', verb: 'Organizando os cabos', span: [120, 240], tasks: ['cables'], types: ['cable'] },
    };
    const SYMPTOM = { ping: 'sem ping', http: 'site fora do ar', disk: 'disco cheio', cpu: 'CPU alta', temp: 'temperatura alta', cables: 'cabos desorganizados', port: 'porta em erro', 'win:lockout': 'conta bloqueada' };
    const symptomOf = (p) => SYMPTOM[p.kind] || (/^win:/.test(p.kind || '') ? 'serviço parado' : 'problema');
    const SEV_RANK = { info: 0, warning: 1, average: 2, high: 3 };
    // the task of this list that does it (its skill is the one that counts), or null
    const taskFor = (ts, A) => ts.find((t) => (A.types && t.kind === 'fix' && t.types.some((x) => A.types.indexOf(x) >= 0)) || (A.tasks && A.tasks.indexOf(t.id) >= 0) || (A.kinds && A.kinds.indexOf(t.kind) >= 0)) || null;
    const where = (o) => (o.target.rack ? o.target.rack.id : o.target.dev.name);
    const cracPrice = () => priceOf('crac') || ORDER['install-crac'].cost;

    // What to do about it right now: { act, place, dev } — place: where the person works (a rack, an AC), dev: the
    // device the repair touches · { repair: switch } when the host hangs on a broken switch (the switch's repair
    // order covers it) · { wait: why } when the team can't take it (a career problem left to the player…).
    function planFor(p) {
      const d = p.dev, r = p.rack;
      if (p.kind === 'temp') {
        const room = ops.roomOf(r);
        if (room) {
          const cracs = world().items.filter((e) => e.kind === 'crac' && ops.roomOf(e) === room);
          if (!cracs.length) return { act: 'cracnew', room, rack: r };
          const c = cracs.find((e) => !e.tuned);
          if (c) return { act: 'cracfix', place: c, crac: c, room, rack: r };
        }
        if (r.hold) return { wait: 'problema de carreira no ' + r.id + ' · Tarefas' };
        if (!r.blank || r.cableLook === 'messy') return { act: 'airflow', place: r, rack: r };
        return { wait: room ? 'rack no limite de refrigeração: tire um servidor dele' : 'rack fora de uma sala: crie a sala para ter refrigeração' };
      }
      if (p.kind === 'cables') return r.hold ? { wait: 'problema de carreira no ' + r.id + ' · Tarefas' } : { act: 'tidy', place: r, rack: r };
      // (a stuck process is never part of a career problem: only the symptoms one can set up wait for the player)
      if (d.hold && p.kind !== 'cpu') return { wait: 'problema de carreira · Tarefas → Atribuir a…' };
      if (p.kind === 'hw') return { repair: d };
      if (p.kind === 'port') return { act: 'swport', place: d.rack, dev: d, sw: d };
      if (p.kind === 'ping') {
        const h = ops.health(d);
        if (h.why === 'switch') return { repair: d.path.sw };
        if (h.why === 'port') {
          const t = d.path || ops.trace(d);
          return t.sw.hold ? { wait: 'problema de carreira no ' + t.sw.name + ' · Tarefas' } : { act: 'swport', place: t.sw.rack, dev: d, sw: t.sw };
        }
        return { act: h.why === 'cable' ? 'replug' : 'reboot', place: d.rack, dev: d };
      }
      // (a load peak passes by itself: only a stuck process needs someone — monitor.js decides which it is)
      if (p.kind === 'cpu' && !(d.mb && d.mb.stuck)) return { wait: 'pico de carga: deve passar sozinho' };
      const act = { http: 'web', disk: 'disk', cpu: 'cpu', 'win:lockout': 'unlock' }[p.kind] || (/^win:/.test(p.kind || '') ? 'winsvc' : null);
      return act ? { act, place: d.rack, dev: d } : null;
    }

    // monitor.js calls this after every check (every 2 s) with its problem list: each open problem gets an order
    function incidents(list) {
      O.problems = list;
      if (game.guest) return;
      const t = scene.t;
      // (a new order goes out right away: the most severe and the oldest get the free people first)
      for (const p of list.slice().sort((a, b) => (SEV_RANK[b.sev] || 0) - (SEV_RANK[a.sev] || 0) || a.start - b.start)) {
        if (p.end || (p.dismissed && p.dismissed > t)) continue;
        const o = p.order;
        if (o && active(o)) continue;
        // a correction that just ended: the Monitor sees it on its next check (a rack takes a while to cool down)
        if (o && o.status === 'done' && o.result === 'ok' && (t - o.doneT < 8 || (p.kind === 'temp' && game.monitor && game.monitor.cooling(p)))) continue;
        // three tries that didn't work: again in a minute
        if (o && o.status === 'fail' && t - o.doneT < 60) continue;
        // the cause is gone (the player built the AC, tidied the cables): the rack is cooling down by itself
        if (p.kind === 'temp' && game.monitor && game.monitor.cooling(p)) { p.wait = 'esfriando aos poucos'; p.order = null; continue; }
        const plan = planFor(p);
        p.wait = plan && plan.wait ? plan.wait : '';
        if (!plan || plan.wait) { p.order = null; continue; }
        p.order = plan.repair ? repairOrder(plan.repair) : sameJob(plan) || createOrder('incident', p, { by: manager(), byName: 'Monitor', silent: true, plan, cost: plan.act === 'cracnew' ? cracPrice() : 0 });
      }
    }
    // a switch that broke: its repair order (the manager's, or a new one) covers it and every host behind it
    function repairOrder(sw) {
      const rec = M.broken.find((r) => r.dev === sw);
      if (!rec) return null;
      return O.list.find((o) => active(o) && o.type === 'repair' && o.target === rec) || createOrder('repair', rec, { by: manager(), byName: 'Monitor', silent: true });
    }
    // one cause, one order: two hot racks in a room without AC need one AC (one service of the same AC), and a
    // switch port in error is one trip to the switch for the switch's alert and the host that fell with it
    function sameJob(plan) {
      const same = plan.act === 'cracnew' || plan.act === 'cracfix' ? (x) => x.room === plan.room && x.crac === plan.crac : plan.act === 'swport' ? (x) => x.sw === plan.sw : null;
      return same ? O.list.find((o) => active(o) && o.type === 'incident' && o.plan.act === plan.act && same(o.plan)) || null : null;
    }

    // Before handing it out: the cause may have changed (a cable put back, but the interface still down) and
    // some jobs need things first (cash for the AC, a free spot, the build mode closed). false: it waits.
    function incidentReady(o) {
      if (o.target.kind === 'temp' && game.monitor && game.monitor.cooling(o.target)) { close(o, 'cancel', 'Resolvido antes: esfriando aos poucos'); return false; }
      const plan = planFor(o.target);
      if (!plan || plan.wait || plan.repair) { close(o, 'cancel', plan && plan.wait ? plan.wait : 'Coberta pelo conserto do switch'); return false; }
      if (plan.act !== o.plan.act || plan.place !== o.plan.place) { o.plan = plan; o.spot = null; o.title = titleOf('incident', o.target, plan); o.cost = plan.act === 'cracnew' ? cracPrice() : 0; }
      if (plan.act !== 'cracnew') return true;
      if (game.builder && game.builder.active) { o.queue = 'Aguardando você sair do modo construção'; return false; }
      if (cash() < o.cost) { o.queue = 'Aguardando caixa: o ar de precisão custa ' + DL.money(o.cost); return false; }
      // (looking for a free spot is not cheap: every few seconds)
      if (!o.spot && scene.t - (o.spotT || -9) > 3) { o.spotT = scene.t; o.spot = spotsFor('crac', plan.room)[0] || null; }
      if (!o.spot) { o.queue = 'Sem lugar livre em ' + plan.room.name + ' para o ar de precisão: libere um canto junto à parede'; return false; }
      return true;
    }

    // the job of an incident for this person (null: not something they do)
    function incidentDef(o, m) {
      const plan = o.plan, A = plan && ACTS[plan.act], task = A && taskFor(tasksOf(m), A);
      if (!task) return null;
      const skill = task.skill;
      return {
        id: 'incident', name: A.label.charAt(0).toUpperCase() + A.label.slice(1), verb: A.verb, kind: plan.act === 'cracnew' ? 'spot' : 'equip',
        skill, xp: 20 + Math.round(A.span[1] / 30), dur: A.span, auto: 0, desc: o.title,
        durFor: (a) => A.span[0] + (A.span[1] - A.span[0]) * Math.min(1, rand() * 0.7 + (1 - (a.crew.stats.skills[skill] || 0) / 99) * 0.3),
        place: (x) => plan.place || x,
        finish: (ctx) => fixIncident(o, ctx.a, skill),
      };
    }

    // The work is done: change what the Monitor watches (the same end state as the player's fix) and say so.
    function fixIncident(o, a, skill) {
      const p = o.target, plan = o.plan, d = p.dev, name = a.crew.name, at = where(o);
      if (p.end) return { say: 'Cheguei no ' + at + ' e já estava resolvido. Melhor assim!' };
      // beginners sometimes don't make it (the odds of any fix, jobs.js): the order goes out again
      if (rand() < Math.max(0, (42 - (a.crew.stats.skills[skill] || 0)) / 70)) {
        return { say: 'Tentei ' + ACTS[plan.act].label + ' no ' + at + ', mas não consegui ainda. Vou tentar de novo.', tone: 'help', error: name + ' não conseguiu de primeira' };
      }
      const ok = (say) => ({ say, tone: 'ok', fixed: true });
      const restore = (x) => ops.restore(x, x.kind === 'switch' ? 'port' : 'ping', a);
      const r = plan.act === 'replug' || plan.act === 'reboot' || plan.act === 'swport' ? restore(d)
        : plan.act === 'web' ? ops.restore(d, 'http', a) : plan.act === 'disk' ? ops.restore(d, 'disk', a) : null;
      // one trip to the switch: the ports of every host that shares the order come back too
      if (plan.act === 'swport' && r && r.did) for (const x of O.problems) if (x.order === o && x !== p && !x.end) r.did = r.did.concat(restore(x.dev).did || []);
      if (r && r.wait) return { say: 'O ' + d.name + ' depende do ' + r.wait.name + ', que está com defeito de hardware. Quando o conserto terminar ele volta.', tone: 'warn', error: 'Depende do conserto do ' + r.wait.name };
      if (r && r.error) return { say: r.error + '. ' + playerName() + ', dá uma olhada no cabeamento comigo?', tone: 'warn', error: r.error };
      const did = r ? r.did : [];
      switch (plan.act) {
        case 'replug': return ok('Conferi cabo e energia do ' + d.name + (did.length ? ': ' + did.join(', ') + ' de volta' : '') + '. Ping respondendo ✅');
        case 'reboot': return ok('Reiniciei o ' + d.name + (did.indexOf('IP') >= 0 ? ' e reconfigurei o IP ' + d.ip : '') + '. Já responde ao ping ✅');
        case 'swport': return ok('Reativei ' + (did.length ? did.join(', ') : 'a porta') + ' com shutdown / no shutdown. Link de volta ✅');
        case 'web': return ok('Reiniciei o nginx do ' + d.name + (did.indexOf('firewall') >= 0 ? ' e liberei a porta 80 no firewall' : '') + '. Site respondendo 200 ✅');
        case 'disk': return ok('Limpei logs antigos do ' + d.name + '. Disco caiu para ' + d.os.disk + '% ✅');
        case 'cpu':
          if (game.monitor) game.monitor.relieve(d);
          return ok('Achei o processo travado no ' + d.name + ' e reiniciei o serviço. CPU voltando ao normal ✅');
        case 'winsvc': case 'unlock':
          if (!DL.winRepair || !DL.winRepair(d, p.kind)) return { say: 'Não consegui mexer no ' + d.name + ' agora.', tone: 'warn', error: 'Windows indisponível' };
          if (d.fault) d.fault.fixedBy = name;
          return ok(plan.act === 'unlock' ? 'Desbloqueei a conta no AD do ' + d.name + ' (Unlock-ADAccount) e avisei o usuário ✅' : 'Subi o serviço parado do ' + d.name + ' (Start-Service). Função de volta ✅');
        case 'cracfix':
          plan.crac.tuned = true;
          return ok('Limpei os filtros e ajustei o setpoint do ' + (plan.crac.id || 'ar de precisão') + '. O ' + plan.rack.id + ' vai esfriar aos poucos.');
        case 'cracnew': return installCrac(o, plan.room);
        case 'airflow':
          if (!plan.rack.hold && plan.rack.cableLook === 'messy') ops.tidy([plan.rack], name);
          plan.rack.blank = true;
          return ok('Coloquei placas cegas e organizei os cabos do ' + plan.rack.id + ': o ar quente não volta mais para a frente. Vai esfriar aos poucos.');
        case 'tidy':
          ops.tidy([plan.rack], name);
          return ok('Organizei os cabos do ' + plan.rack.id + '. Bem melhor para o fluxo de ar ✅');
      }
      return null;
    }

    function installCrac(o, room) {
      const B = game.builder, price = o.cost || cracPrice();
      if (!B || B.active) return { say: 'Espero você sair do modo construção para instalar o ar de precisão.', error: 'Modo construção aberto' };
      if (cash() < price) return { say: 'Faltou caixa para o ar de precisão (' + DL.money(price) + ').', tone: 'warn', error: 'Caixa insuficiente' };
      for (const sp of (o.spot ? [o.spot] : []).concat(spotsFor('crac', room)).slice(0, 12)) {
        if (B.api.place('crac', sp.tx, sp.ty, 0)) continue;
        charge(price, 'Ar de precisão');
        const e = world().items.filter((x) => x.kind === 'crac').slice(-1)[0];
        return { say: 'Instalei o ' + (e && e.id ? e.id : 'ar de precisão') + ' em ' + room.name + '. A sala vai esfriar aos poucos.', tone: 'ok', fixed: true };
      }
      return { say: 'Não achei lugar livre para o ar de precisão em ' + room.name + '.', tone: 'warn', error: 'Sem lugar livre em ' + room.name };
    }

    // incident orders about a device: running right now (ops.js / director.js don't hold the next incident back
    // for it) · open or running (crew.js: nobody starts the same repair on their own)
    const aboutDev = (o, d) => o.type === 'incident' && (o.plan.dev === d || o.plan.sw === d);
    const handling = (d) => O.list.some((o) => o.status === 'run' && (aboutDev(o, d) || (o.type === 'fix' && o.target === d)));
    const incidentOn = (d) => O.list.some((o) => active(o) && aboutDev(o, d));
    // a rack whose cabling / airflow has an order (jobs.js: the routine tidy-up leaves it to that order)
    const incidentAt = (rack) => O.list.some((o) => active(o) && o.type === 'incident' && o.plan.place === rack && (o.plan.act === 'tidy' || o.plan.act === 'airflow'));
    // "ordem #12 · com Ana" for the Tarefas panel (ops.js)
    function orderOn(d) {
      const o = O.list.find((x) => active(x) && aboutDev(x, d));
      return o ? 'ordem #' + o.id + (o.status === 'run' && o.assignee ? ' · com ' + o.assignee.crew.name : ' · na fila') : '';
    }

    /* ---------- what the manager looks at ---------- */
    function assess(a, opts) {
      opts = opts || {};
      const made = [];
      const t = scene.t;
      const add = (type, target) => { const o = createOrder(type, target, { by: a, silent: true }); if (o) made.push(o); return o; };
      // 1. broken hardware
      for (const rec of M.broken) if (!rec.taken && !hasOrder('repair', rec)) add('repair', rec);
      // 2. faults found a while ago that nobody is handling (the ones the Monitor sees have their incident order)
      for (const d of ops.devices()) {
        if (!d.fault || !d.fault.found || d.hold || t - (d.fault.foundAt || t) < 15 || api().busyWith(d) || hasOrder('fix', d) || incidentOn(d)) continue;
        if (crew.members.some((m) => api().fixDefFor(m, d))) add('fix', d);
      }
      // 3. servers waiting for a cable for over a minute
      for (const d of ops.devices()) {
        if (d.kind !== 'server' || d.state !== 'new' || d.hold || hasOrder('cable', d) || (d.newAt != null && t - d.newAt < 60)) continue;
        if (d.newAt == null) { d.newAt = t; continue; }
        if (crew.members.some((m) => eligible({ type: 'cable', target: d }, m))) add('cable', d);
      }
      // 4. capacity: room for servers, racks, cooling and floor space
      const racks = world().items.filter((e) => e.kind === 'rack' && e.units);
      const freeSlots = racks.reduce((n, e) => n + e.units.filter((u) => !u).length, 0);
      const servers = ops.devices().filter((d) => d.kind === 'server');
      const healthy = servers.every((d) => !d.fault && (d.state !== 'online' || ops.health(d).up));
      const builders = crew.members.some((m) => tasksOf(m).some((x) => x.id === 'install' || x.kind === 'repair'));
      const notes = [];
      if (builders && serverRooms().length) {
        if (racks.length && !freeSlots && !hasOrder('install-rack')) {
          if (cash() - priceOf('rack') < RESERVE) notes.push('precisamos de outro rack, mas o caixa está apertado');
          else if (spotsFor('rack').length) add('install-rack', null);
          else if (!hasOrder('expand-room')) {
            const r = serverRooms()[0];
            if (cash() - ORDER['expand-room'].cost >= RESERVE) add('expand-room', r);
          }
        }
        for (const r of serverRooms()) {
          const inR = racks.filter((e) => ops.roomOf(e) === r).length;
          const cool = world().items.some((e) => e.kind === 'crac' && ops.roomOf(e) === r);
          const acOrdered = hasOrder('install-crac') || O.list.some((o) => active(o) && o.type === 'incident' && o.plan.act === 'cracnew');
          if (inR >= 2 && !cool && !acOrdered && cash() - priceOf('crac') >= RESERVE && spotsFor('crac').length) { add('install-crac', null); break; }
        }
        const rackFree = racks.find((e) => e.units.indexOf(null) >= 0);
        // never buy another server while bought ones still wait for cable / configuration
        const pending = servers.some((d) => d.state !== 'online');
        if ((opts.expand || rand() < 0.25) && rackFree && healthy && !pending && servers.length < 40 && cash() - 6000 >= RESERVE * 2 && t - O.lastServer > 300 && !hasOrder('install-server')) {
          O.lastServer = t;
          add('install-server', rackFree);
        }
      }
      if (made.length) {
        return { say: '📋 Abri ' + made.length + ' ordem(ns) de serviço: ' + made.map((o) => '#' + o.id + ' ' + o.title.toLowerCase()).join('; ') + '.', tone: 'warn' };
      }
      const run = O.list.filter((o) => o.status === 'run').length;
      return { say: pick(['Infra analisada: ' + racks.length + ' rack(s), ' + freeSlots + ' posição(ões) livre(s), ' + servers.length + ' servidor(es). ' + (run ? run + ' ordem(ns) em andamento.' : 'Nada novo para pedir agora.'), 'Revisei a operação: ' + (notes[0] ? notes[0] + '.' : 'nenhuma necessidade nova.') + (run ? ' Acompanhando ' + run + ' ordem(ns).' : '')]) };
    }

    const busyMembers = () => crew.members.filter((m) => orderOf(m) && !m.crew.hold);
    function followUp(a, m) {
      const o = orderOf(m);
      if (!o) return { say: m.crew.name + ', tudo certo por aí? Qualquer coisa me chama.', reply: [m, 'Tudo certo!'] };
      const pct = Math.round(api().progressOf(m) * 100);
      return {
        say: 'Ordem #' + o.id + ' (' + o.title.toLowerCase() + '): ' + pct + '% feito. ' + pick(['Bom ritmo, ' + m.crew.name + '!', 'Precisa de alguma peça, ' + m.crew.name + '?', 'Me avisa quando terminar.']),
        reply: [m, pick(['Quase lá!', 'Sem problemas, chefe.', 'Tá saindo!'])],
      };
    }

    /* ---------- orders list (in the Tasks panel) ---------- */
    function render(force) {
      if (!el.list) return;
      const list = O.list.slice(0, 12);
      const key = list.map((o) => o.id + o.status + (o.assignee ? o.assignee.crew.id : '') + Math.round((o.progress || 0) * 20) + o.note + o.queue + o.title).join('|');
      if (!force && key === O.key) return;
      O.key = key;
      const nAct = O.list.filter(active).length;
      if (el.count) el.count.textContent = nAct ? nAct + ' ativa(s)' : '';
      if (!list.length) { el.list.innerHTML = '<li class="ord-empty">Nenhuma ordem. ' + (manager() ? 'O gerente abre ordens quando algo quebra ou falta.' : 'Contrate um(a) gerente para a equipe se organizar sozinha.') + '</li>'; return; }
      el.list.innerHTML = list.map((o) => {
        const who = o.assignee ? o.assignee.crew.name : '—';
        const pct = o.status === 'done' ? 100 : Math.round((o.progress || 0) * 100);
        return '<li class="ord is-' + o.status + '"><div class="ord__head"><span class="ord__id">#' + o.id + '</span><b>' + esc(ORDER[o.type].icon + ' ' + o.title) + '</b><span class="ord__st">' + STATUS[o.status] + '</span></div>' +
          '<p class="ord__meta">Por ' + esc(o.byName) + ' · ' + o.created + ' · Técnico: ' + esc(who) + (o.cost ? ' · ' + DL.money(o.cost) : '') + (o.note && o.status !== 'done' ? ' · ' + esc(o.note) : '') + (o.queue && o.status === 'open' ? ' · ' + esc(o.queue) : '') + '</p>' +
          (active(o) ? '<div class="ord__foot"><div class="ord__bar"><i style="transform:scaleX(' + (pct / 100).toFixed(2) + ')"></i></div><button type="button" class="linkbtn ord__x" data-ord-cancel="' + o.id + '">Cancelar</button></div>' : '') + '</li>';
      }).join('');
    }
    if (el.list) {
      el.list.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-ord-cancel]');
        if (!b) return;
        const o = O.list.find((x) => x.id === +b.dataset.ordCancel);
        if (!o || !active(o)) return;
        if (o.assignee && alive(o.assignee) && orderOf(o.assignee) === o) api().cancelJob(o.assignee, true);
        close(o, 'cancel', 'Cancelada por ' + playerName());
        // an incident the player called off: no new order for it for five minutes
        if (o.type === 'incident') for (const p of O.problems) if (p.order === o) { p.dismissed = scene.t + 300; p.wait = 'ordem cancelada por você'; }
      });
    }

    /* ================================================================== */
    /* Clients: visitors at the reception                                  */
    /* ================================================================== */
    const CL = { list: [], next: 12, served: 0, lost: 0 };
    const CLIENT_LINES = [
      'Bom dia! Vim falar sobre o contrato de colocation.', 'Preciso de um servidor dedicado para minha loja virtual.', 'Quanto custa uma VM com 8 GB de RAM?',
      'Vim buscar meu crachá de visitante.', 'Meu site ficou lento ontem, queria entender o que houve.', 'Vocês hospedam servidor de jogos?',
      'Tenho uma reunião com o gerente às 10h.', 'Queria conhecer a estrutura de vocês.', 'Precisamos de backup dos nossos arquivos aqui.',
    ];
    const receptionRoom = () => (world().rooms || []).find((r) => typeOf(r) === 'reception') || null;

    /* ---------- in-person service: the attendant notices, walks over, talks, solves or forwards ---------- */
    // what visitors come for. kind: solve (the attendant handles it) · manager (forward to the manager)
    // · ticket (opens a help-desk ticket for the technical team) · outage (a real fault in the datacenter)
    const VISITS = [
      { id: 'colo', kind: 'solve', pay: [2500, 5000], lines: [
        'C:[Bom dia! Vim falar sobre o contrato de colocation.|Oi! Queria saber como funciona o colocation de vocês.]',
        'S:[Claro, {c}! Temos racks compartilhados e dedicados, com energia redundante e 99,9% de disponibilidade.|Com prazer! Você traz o servidor e a gente cuida de energia, refrigeração e rede.]',
        'C:[E quanto sai por mês um rack inteiro?|Tem suporte de madrugada também?]',
        'S:[Te passo a tabela agora, e o primeiro mês sai com desconto.|Tem sim, plantão 24 h. Vou te mandar a proposta por e-mail.]',
        'C:[Perfeito, pode mandar que eu fecho hoje.|Fechado! Vou assinar a proposta.]',
      ], done: 'Contrato de colocation fechado com {c} na recepção ✅' },
      { id: 'vm', kind: 'solve', pay: [800, 2000], lines: [
        'C:[Quanto custa uma VM com 8 GB de RAM?|Vocês alugam máquina virtual?]',
        'S:[Alugamos sim! Uma VM de 8 GB com 4 vCPUs sai por um preço bem em conta.|Temos planos a partir de 2 GB. Para 8 GB, recomendo o plano Pro.]',
        'C:[E dá pra aumentar depois se precisar?|Tem backup incluso?]',
        'S:[Dá sim, é só pedir que a gente redimensiona sem reinstalar.|Backup diário incluso, com retenção de 7 dias.]',
        'C:[Ótimo, quero contratar.|Fechou, vou levar.]',
      ], done: '{c} contratou uma VM · venda feita na recepção ✅' },
      { id: 'badge', kind: 'solve', lines: [
        'C:[Oi, vim buscar meu crachá de visitante.|Bom dia, tenho uma visita técnica agendada.]',
        'S:[Bem-vindo(a), {c}! Só preciso de um documento com foto.|Claro! Pode me mostrar um documento, por favor?]',
        'C:[Aqui está.|Tá na mão.]',
        'S:[Prontinho, seu crachá. É só passar na catraca.|Crachá liberado. Qualquer coisa, estou aqui na recepção.]',
      ], done: '{c} recebeu o crachá de visitante' },
      { id: 'tour', kind: 'solve', lines: [
        'C:[Queria conhecer a estrutura de vocês.|Dá pra ver o datacenter por dentro?]',
        'S:[Dá sim! Por segurança, a visita é acompanhada e só pelo corredor de vidro.|Claro, {c}. Vou te mostrar a sala de servidores pelo vidro.]',
        'C:[Que organizado! E esse barulho todo?|Nossa, quanto rack!]',
        'S:[São as ventoinhas: o ar frio entra pela frente e sai quente por trás.|Cada rack tem energia dupla e monitoramento 24 h.]',
        'C:[Gostei muito, obrigado pela visita!|Muito bom. Vou recomendar vocês.]',
      ], done: 'Visita guiada com {c} na recepção' },
      { id: 'meeting', kind: 'manager', lines: [
        'C:[Tenho uma reunião com o gerente às 10h.|Vim conversar com o responsável sobre um contrato grande.]',
        'S:[Só um instante, {c}, vou chamar {m}.|Claro! Vou avisar {m} que você chegou.]',
      ], boss: [
        'M:[Olá, {c}! Que bom que veio. Vamos conversar?|{c}, prazer! Vamos falar do contrato.]',
        'C:[Queria ampliar nosso espaço para mais dois racks.|Precisamos de mais capacidade até o fim do mês.]',
        'M:[Temos espaço, sim. Te mando a proposta ainda hoje.|Fechado: reservo os racks e o time instala.]',
      ], pay: [3000, 6000], done: '{m} fechou a ampliação com {c} ✅', nobody: 'S:[{c}, o gerente não está agora. Anotei seu recado e ele te liga ainda hoje.|O responsável saiu, mas deixei tudo anotado e já te retornam.]' },
      { id: 'slow', kind: 'ticket', ticket: 'slow', lines: [
        'C:[Meu sistema ficou lento ontem, queria entender o que houve.|O ERP que vocês hospedam está demorando muito.]',
        'S:[Entendi, {c}. Está lento para todos ou só para você?|Vamos ver isso. Desde quando está assim?]',
        'C:[Para todo mundo do escritório, desde ontem à tarde.|Começou depois do almoço, para o setor inteiro.]',
        'S:[Abri o chamado #{t} e já encaminhei para o time técnico. Eles te retornam rapidinho.|Registrei no chamado #{t} para o pessoal de servidores investigar.]',
      ], done: 'Chamado #{t} aberto para {c} (atendimento presencial)' },
      { id: 'mail', kind: 'ticket', ticket: 'email', lines: [
        'C:[Nossos e-mails pararam de chegar!|Não recebo e-mail desde ontem.]',
        'S:[Vixe. Você consegue enviar normalmente?|Vou verificar. Apareceu algum aviso na caixa?]',
        'C:[Envio sim, só não recebo.|Apareceu um aviso de caixa cheia semana passada.]',
        'S:[Já abri o chamado #{t} e passei para quem cuida do servidor de e-mail.|Encaminhei pro time de sistemas no chamado #{t}.]',
      ], done: 'Chamado #{t} aberto para {c} (atendimento presencial)' },
      { id: 'game', kind: 'solve', pay: [1500, 3500], lines: [
        'C:[Vocês hospedam servidor de jogos?|Quero colocar um servidor de Minecraft pra minha comunidade.]',
        'S:[Hospedamos! Servidor dedicado com baixa latência e proteção contra DDoS.|Temos sim, {c}. Com IP fixo e painel de controle.]',
        'C:[Aguenta umas 100 pessoas jogando junto?|Tem como testar antes?]',
        'S:[Aguenta tranquilo no plano high-end. Te passo um teste de 7 dias.|Tem! Libero um teste gratuito agora.]',
        'C:[Show, bora!|Fechado então!]',
      ], done: 'Servidor de jogos vendido para {c} na recepção ✅' },
    ];
    const OUTAGE = { id: 'outage', kind: 'outage', lines: [
      'C:[O site da minha loja está fora do ar!|Ninguém consegue acessar nosso sistema, o que aconteceu?]',
      'S:[Sinto muito, {c}. Deixa eu confirmar com o monitoramento…|Calma, {c}, vou verificar agora.]',
      'S:[Confirmado: o {d} está com problema e a equipe técnica já está cuidando.|Identificamos uma falha no {d}. O time já está corrigindo.]',
      'C:[Ok… me avisa assim que voltar, por favor.|Tudo bem, fico no aguardo.]',
    ], done: 'Cliente {c} avisado(a) sobre a falha no {d}' };

    const isAttendant = (m) => !m.crew.off && !m.crew.leaving && ['desk', 'both'].indexOf(m.crew.attend) >= 0 && tasksOf(m).some((t) => t.id === 'frontdesk');
    const attendants = () => crew.members.filter(isAttendant);
    // free to walk to a visitor: not on an order, a fix, a repair, a computer ticket or another visitor
    function canServe(m) {
      const j = m.crew.job;
      if (!isAttendant(m) || m.crew.hold || orderOf(m)) return false;
      if (!j) return true;
      return j.auto && j.def.kind !== 'fix' && j.def.kind !== 'repair' && j.def.kind !== 'client' && j.def.id !== 'support';
    }
    const waiting = () => CL.list.filter((a) => a.client.state === 'wait' && !a.client.served && !a.client.gaveUp);
    // the reception desk: in front of a desk / table in the reception (crew.js frontdesk task goes there)
    function frontPost(m) {
      const r = receptionRoom();
      if (!r) return null;
      const nav = api().nav;
      const desks = world().items.filter((e) => (e.kind === 'desk' || e.kind === 'table') && !e.host && inRoom(r, e.tx, e.ty));
      for (const e of desks) {
        for (const [dx, dy] of [[0, -1], [1, -1], [0, (e.th || 1)], [-1, 0], [(e.tw || 1), 0]]) {
          const tx = e.tx + dx, ty = e.ty + dy;
          if (nav.free(tx, ty) && inRoom(r, tx, ty) && !(world().keepClear && world().keepClear.has(tx + ',' + ty))) return Object.assign(nav.center(tx, ty), { label: 'Balcão da ' + r.name, room: r });
        }
      }
      const f = nav.nearestFree(r.x + Math.floor(r.w / 2), r.y + Math.floor(r.h / 2), 3);
      return f && inRoom(r, f[0], f[1]) ? Object.assign(nav.center(f[0], f[1]), { label: r.name, room: r }) : null;
    }
    const clientWaitingFor = (m) => waiting().length > 0 && canServe(m);

    const CLIENT_COLOR = '#9aa3b0';
    const fill = (s, v) => s.replace(/\[([^\]]+)\]/g, (x, b) => pick(b.split('|'))).replace(/\{(\w)\}/g, (x, k) => (v[k] != null ? v[k] : x));
    function clientSay(cl, text) {
      cl.bubble = { text: text.length > 64 ? text.slice(0, 61) + '…' : text, left: Math.min(5.5, 2.4 + text.length * 0.045), tone: 'chat' };
      chat().post({ name: cl.client.name, color: CLIENT_COLOR, role: 'Cliente · Recepção' }, text, { tone: 'client' });
    }
    // play a list of "C:/S:/M:" lines, each after the previous one; then `end`
    function play(cl, lines, who, v, end) {
      let at = 0;
      lines.forEach((l) => {
        const sp = l[0], text = fill(l.slice(2), v);
        at += between(2, 3) + Math.min(1.4, text.length * 0.018);
        chat().later(at, () => {
          if (CL.list.indexOf(cl) < 0) return;
          const by = sp === 'C' ? null : sp === 'M' ? who.boss : who.att;
          if (!by) clientSay(cl, text);
          else if (alive(by)) chat().post(by, text);
        });
      });
      chat().later(at + 1.6, end);
    }

    function serve(cl, m) {
      const c = cl.client;
      c.served = m;
      c.servedT = 0;
      c.t = 999;
      const def = {
        id: 'attend-client', name: 'Atender cliente', verb: 'Atendendo cliente', kind: 'client', skill: 'gestao', xp: 12, dur: [999, 999], auto: false, label: c.name,
        arrived: (a) => talk(cl, a),
        finish: () => null,
      };
      const why = api().startJob(m, def, { auto: false, quiet: true, target: cl });
      if (why) { c.served = null; c.t = between(3, 6); return false; }
      ops.logEvent('info', '🛎️ ' + m.crew.name + ' foi receber ' + c.name + ' na recepção');
      if (rand() < 0.5) chat().post(m, pick(['Chegou cliente, já vou lá!', c.name + ' chegou, deixa comigo.', 'Vou atender na recepção.']));
      return true;
    }

    function endService(cl, m, ok, note) {
      const c = cl.client;
      if (m && alive(m) && m.crew.job && m.crew.job.def.kind === 'client') m.crew.job.end = true;
      c.done = true;
      c.stay = Math.min(c.stay, between(1.5, 3));
      c.t = 0.5;
      CL.served++;
      if (note) ops.logEvent(ok ? 'ok' : 'info', '🛎️ ' + note);
      if (game.economy) game.economy.earn('credits', 3, 'Cliente atendido na recepção', { quiet: true });
    }

    function talk(cl, m) {
      const c = cl.client;
      if (c.talking) return;
      c.talking = true;
      cl.dir = DL.dirOf(m.x - cl.x, m.y - cl.y);
      const v = { c: c.name.split(' ')[0], a: m.crew.name };
      // a real outage beats small talk: the customer came because their site is down
      const down = ops.devices().find((d) => d.kind === 'server' && d.fault && d.state === 'online');
      const sc = down && rand() < 0.6 ? OUTAGE : c.visit;
      v.d = down ? down.name : '';
      if (sc.kind === 'ticket' && game.helpdesk && game.helpdesk.api) {
        const t = game.helpdesk.api.spawn(sc.ticket);
        v.t = t ? t.id : '—';
        if (t) t.msgs.unshift({ from: 'system', text: 'Aberto presencialmente na recepção por ' + m.crew.name + '.', t: game.clock(), at: scene.t });
      }
      const lines = sc.lines.slice();
      if (sc.kind === 'manager') {
        const boss = manager();
        v.m = boss ? boss.crew.name : 'o gerente';
        if (!boss || boss.crew.off) {
          play(cl, [lines[0], sc.nobody], { att: m }, v, () => endService(cl, m, true, 'Recado de ' + c.name + ' anotado (gerente ausente)'));
          return;
        }
        play(cl, lines, { att: m }, v, () => {
          // the attendant goes back; the manager walks over to the visitor
          if (m.crew.job && m.crew.job.def.kind === 'client') m.crew.job.end = true;
          const def = { id: 'attend-client', name: 'Reunião com cliente', verb: 'Em reunião', kind: 'client', skill: 'gestao', xp: 14, dur: [999, 999], auto: false, label: c.name,
            arrived: (b) => play(cl, sc.boss, { att: m, boss: b }, v, () => { pay(sc, v); endService(cl, b, true, fill(sc.done, v)); }), finish: () => null };
          if (!alive(boss) || boss.crew.off || api().startJob(boss, def, { auto: false, quiet: true, target: cl })) endService(cl, null, true, 'Recado de ' + c.name + ' anotado para ' + boss.crew.name);
          else { c.served = boss; chat().post(boss, pick(['Já vou receber ' + v.c + '!', 'Indo para a recepção.'])); }
        });
        return;
      }
      if (sc.kind === 'outage' && down && down.fault && !down.fault.found) ops.report(down, m, 'cliente na recepção');
      play(cl, lines, { att: m }, v, () => { pay(sc, v); endService(cl, m, true, fill(sc.done, v)); });
    }

    // a sale at the counter pays the company (scaled by the learning mode, like all revenue)
    function pay(sc, v) {
      if (!sc.pay || !game.economy) return;
      const k = DL.learn ? DL.learn().reward : 1;
      const amount = Math.round(between(sc.pay[0], sc.pay[1]) * k / 50) * 50;
      game.economy.income(amount, 'venda na recepção');
      game.toast('ok', 'Venda na recepção', fill(sc.done, v).replace(' ✅', '') + ' · +' + DL.money(amount));
    }

    function tickReception() {
      if (game.paused()) return;
      for (const cl of waiting()) {
        const free = attendants().filter(canServe).sort((x, y) => Math.hypot(x.x - cl.x, x.y - cl.y) - Math.hypot(y.x - cl.x, y.y - cl.y));
        if (free[0]) serve(cl, free[0]);
      }
    }
    function clientSpot(r) {
      const nav = api().nav;
      // near a sofa / chair / table of the room, else anywhere inside it
      const seats = world().items.filter((e) => (e.kind === 'sofa' || e.kind === 'chair' || e.kind === 'water' || e.kind === 'plant') && !e.host && inRoom(r, e.tx, e.ty));
      if (seats.length && rand() < 0.7) {
        const e = pick(seats), f = nav.nearestFree(e.tx, e.ty + (e.th || 1), 2);
        if (f && inRoom(r, f[0], f[1])) return nav.center(f[0], f[1]);
      }
      for (let n = 0; n < 20; n++) {
        const tx = r.x + Math.floor(rand() * r.w), ty = r.y + 1 + Math.floor(rand() * Math.max(1, r.h - 1));
        if (nav.free(tx, ty) && inRoom(r, tx, ty)) return nav.center(tx, ty);
      }
      return null;
    }
    function clientDoor(r) {
      const nav = api().nav;
      for (let dy = r.h - 1; dy >= 1; dy--) {
        for (const dx of [0, -1, 1, -2, 2]) {
          const tx = r.x + Math.floor(r.w / 2) + dx, ty = r.y + dy;
          if (nav.free(tx, ty) && inRoom(r, tx, ty)) return nav.center(tx, ty);
        }
      }
      return null;
    }
    function spawnClient() {
      const r = receptionRoom();
      if (!r) return;
      const door = clientDoor(r), goal = clientSpot(r);
      if (!door || !goal) return;
      const p = api().randomProfile();
      const L = Object.assign(DL.crewLook(p), { badge: '#9aa3b0', lanyard: null, role: null, roleColor: null, vest: null });
      const a = new DL.Actor(L, door.x, door.y, 'up');
      // what they came for decides the conversation at the counter
      Object.assign(a, { client: { name: p.name, room: r.id, state: 'enter', t: 0.8, stay: between(45, 70), door, said: false, visit: pick(VISITS), served: null, done: false }, alpha: 0 });
      CL.list.push(a);
      scene.actors.push(a);
      scene.refreshWorld(false);
      a.route = api().nav.route(a.x, a.y, goal.x, goal.y);
    }
    function removeClient(a) {
      if (DL.Interact) DL.Interact.release(a);
      CL.list = CL.list.filter((x) => x !== a);
      scene.actors = scene.actors.filter((x) => x !== a);
      scene.refreshWorld(false);
    }
    function walkClient(a, dt) {
      const r = a.route;
      if (!r || !r.length) { a.moving = false; return true; }
      let step = 26 * dt;
      while (step > 0 && r.length) {
        const p = r[0], dx = p.x - a.x, dy = p.y - a.y, d = Math.hypot(dx, dy);
        if (d < 0.01) { r.shift(); continue; }
        if (Math.abs(dx) + Math.abs(dy) > 0.01) a.dir = DL.dirOf(dx, dy);
        if (d <= step) { a.x = p.x; a.y = p.y; step -= d; r.shift(); } else { a.x += (dx / d) * step; a.y += (dy / d) * step; step = 0; }
      }
      if (!a.moving) a.dist = 0;
      a.moving = true;
      a.dist += 26 * dt;
      return !r.length;
    }
    /* visitors use the reception's furniture too (interact.js) */
    function visitorActivity(a, r) {
      if (!DL.Interact) return false;
      const W = world(), c = a.client, nav = api().nav, inR = (e) => inRoom(r, (e.host || e).tx, (e.host || e).ty);
      const roll = rand();
      if (roll < 0.5) {
        for (const e of DL.Interact.offers(W, 'rest', (e) => inR(e))) {
          const s = DL.Interact.freeSeat(e, W, a, a);
          const route = s && nav.route(a.x, a.y, s.fromPt.x, s.fromPt.y);
          if (!route) continue;
          DL.Interact.claim(e, s.k, a);
          c.seat = s;
          a.route = route;
          c.state = 'toSeat';
          return true;
        }
      } else if (roll < 0.75 && !a.held) {
        const ok = { water: 1, coffee: 1, espresso: 1, coffeebar: 1, vending: 1, kettle: 1 };
        for (const e of DL.Interact.offers(W, 'drink', (e) => ok[e.kind] && inR(e))) {
          const sp = DL.Interact.standPoint(e, W);
          const route = sp && nav.route(a.x, a.y, sp.x, sp.y);
          if (!route) continue;
          c.drink = { e, sp };
          a.route = route;
          c.state = 'toDrink';
          return true;
        }
      }
      return false;
    }
    function sitVisitor(a) {
      const s = a.client.seat;
      if (!s) return;
      if (!a.sitSheet) a.sitSheet = DL.makeSitSheet(a.look);
      a.x = s.sit.x;
      a.y = s.sit.y;
      a.seated = true;
      a.noShadow = true;
      a.sortKey = s.sortKey;
      a.frame = function () { return this.seated ? (this.blinkT > 0 ? this.sitSheet[s.dir].blink : this.sitSheet[s.dir].R) : DL.Actor.prototype.frame.call(this); };
    }
    // up from the seat before walking anywhere
    function standVisitor(a) {
      if (!a.seated) return;
      const s = a.client.seat;
      if (s) { a.x = s.onTile ? s.sit.x : s.fromPt.x; a.y = s.onTile ? s.sit.y : s.fromPt.y; }
      a.seated = false;
      a.noShadow = false;
      a.sortKey = null;
      a.client.seat = null;
      if (DL.Interact) DL.Interact.release(a);
    }

    function tickClients(dt) {
      const r = receptionRoom();
      if (!game.paused() && r) {
        CL.next -= dt;
        if (CL.next <= 0) { CL.next = between(35, 70); if (CL.list.length < 2) spawnClient(); }
      }
      if ((CL.acc = (CL.acc || 0) + dt) > 0.5) { CL.acc = 0; tickReception(); }
      for (const a of CL.list.slice()) {
        a.tick(dt);
        const c = a.client;
        if (a.bubble && (a.bubble.left -= dt) <= 0) a.bubble = null;
        if (a.held && (a.held.sipT -= dt) <= -0.9) a.held.sipT = between(1.6, 2.8);
        // the reception changed or vanished: the visitor leaves
        if ((!r || r.id !== c.room) && c.state !== 'out') { c.state = 'out'; c.t = 0.8; }
        switch (c.state) {
          case 'enter':
            c.t -= dt;
            a.alpha = Math.min(1, 1 - c.t / 0.8);
            if (c.t <= 0) { a.alpha = 1; c.state = 'walk'; }
            walkClient(a, dt);
            break;
          case 'walk':
            if (walkClient(a, dt)) { a.moving = false; c.state = 'wait'; c.t = between(5, 10); a.dir = 'down'; }
            break;
          case 'wait': {
            a.moving = false;
            c.t -= dt;
            c.stay -= dt;
            // being served: stay until the conversation ends (or the attendant got pulled away)
            if (c.served && !c.done) {
              const m = c.served, j = m && alive(m) && m.crew.job;
              c.servedT = (c.servedT || 0) + dt;
              // safety: nobody reached the visitor in a reasonable time → free them for someone else
              if (j && j.def.kind === 'client' && j.target === a && !c.talking && c.servedT > 45) { api().cancelJob(m, true); }
              if (!j || j.def.kind !== 'client' || j.target !== a || (!c.talking && c.servedT > 45)) { c.served = null; c.talking = false; c.servedT = 0; c.t = between(2, 4); }
              else { c.stay = Math.max(c.stay, 4); if (m.crew.state === 'serving') a.dir = DL.dirOf(m.x - a.x, m.y - a.y); break; }
            }
            if (c.done) { if (c.stay <= 0) { standVisitor(a); c.state = 'leave'; a.route = api().nav.route(a.x, a.y, c.door.x, c.door.y); if (!a.route) { c.state = 'out'; c.t = 0.8; } } break; }
            // somebody attends in person: wait for them patiently
            if (attendants().length) {
              if (!c.said && c.stay < 40) { c.said = true; a.bubble = { text: pick(['Com licença… tem alguém atendendo?', 'Bom dia! Estou esperando ser atendido(a).', 'Oi! Aguardo aqui?']), left: 3.5, tone: 'chat' }; }
              // while waiting: a seat or a coffee, if the reception offers one
              if (!c.served && !a.seated && c.t <= 0 && c.stay > 8) {
                c.t = between(6, 12);
                const rr = (world().rooms || []).find((x) => x.id === c.room);
                if (rr && visitorActivity(a, rr)) break;
              }
              if (c.stay <= 0) {
                c.gaveUp = true;
                CL.lost++;
                ops.logEvent('warn', '🛎️ ' + c.name + ' foi embora sem ser atendido(a) na recepção');
                a.bubble = { text: pick(['Vou voltar outra hora…', 'Demorou demais, tchau.']), left: 3, tone: 'chat' };
                standVisitor(a); c.state = 'leave';
                a.route = api().nav.route(a.x, a.y, c.door.x, c.door.y);
                if (!a.route) { c.state = 'out'; c.t = 0.8; }
              }
              break;
            }
            if (!c.said && c.stay < 30) {
              c.said = true;
              const line = pick(CLIENT_LINES);
              a.bubble = { text: line, left: 4.5, tone: 'chat' };
              // whoever looks after the reception answers
              const host = crew.members.find((m) => !m.crew.seated && m.crew.zone === c.room && Math.hypot(m.x - a.x, m.y - a.y) < 120) ||
                crew.members.find((m) => m.crew.zone === c.room) || crew.members.find((m) => m.crew.profile.role === 'funcionario');
              if (host) chat().later(between(1.5, 2.5), () => { if (alive(host)) chat().post(host, pick(['Bem-vindo(a), ' + c.name + '! Já vou te atender.', c.name + ' chegou na recepção. Já estou indo!', 'Olá, ' + c.name + '! Fique à vontade, um minuto.'])); });
            }
            if (c.stay <= 0) {
              standVisitor(a); c.state = 'leave';
              a.route = api().nav.route(a.x, a.y, c.door.x, c.door.y);
              if (!a.route) { c.state = 'out'; c.t = 0.8; }
            } else if (c.t <= 0) {
              const rr = (world().rooms || []).find((x) => x.id === c.room);
              if (a.seated) { c.t = between(6, 12); break; } // comfortable: stays put until served
              if (rr && visitorActivity(a, rr)) break;
              const g = rr && clientSpot(rr);
              a.route = g ? api().nav.route(a.x, a.y, g.x, g.y) : null;
              c.state = a.route ? 'walk' : 'wait';
              c.t = between(5, 10);
            }
            break;
          }
          /* while waiting: sit down for a while, or grab a coffee / water (interact.js) */
          case 'toSeat':
            if (walkClient(a, dt)) { a.moving = false; sitVisitor(a); c.state = 'wait'; c.t = between(14, 24); }
            break;
          case 'toDrink':
            if (walkClient(a, dt)) { a.moving = false; a.dir = c.drink.sp.dir; c.state = 'drinkFill'; c.t = 1.4; c.drink.e.busy = true; }
            break;
          case 'drinkFill':
            a.moving = false;
            c.t -= dt;
            if (c.t <= 0) {
              c.drink.e.busy = false;
              a.held = { what: DL.Interact.cupOf(DL.Interact.of(c.drink.e) || { cup: 'water' }), sipT: 1 };
              c.state = 'wait';
              c.t = between(6, 10);
            }
            break;
          case 'leave':
            if (walkClient(a, dt)) { a.moving = false; c.state = 'out'; c.t = 0.8; a.dir = 'down'; }
            break;
          case 'out':
            a.moving = false;
            c.t -= dt;
            a.alpha = Math.max(0, c.t / 0.8);
            if (c.t <= 0) removeClient(a);
            break;
        }
      }
    }
    game.extraTalkers = () => CL.list;
    game.on('world', () => {
      syncBroken();
      for (const a of CL.list) if (a.route && a.route.length) { const last = a.route[a.route.length - 1]; a.route = api().nav.route(a.x, a.y, last.x, last.y); }
      render(true);
    });

    /* ================================================================== */
    /* The player talks in the team chat                                   */
    /* ================================================================== */
    const ROLE_FOR = {
      network: ['redes', 'tecnico'], servers: ['servidores', 'sysadmin', 'tecnico'], temp: ['servidores', 'tecnico'],
      problems: ['sysadmin', 'redes', 'tecnico'], fix: ['sysadmin', 'redes', 'tecnico'], where: ['redes', 'sysadmin'],
      money: ['gerente'], next: ['gerente'], progress: ['gerente'], orders: ['gerente'], repair: ['tecnico', 'servidores'], vms: ['sysadmin', 'servidores'],
    };
    function intentOf(text) {
      const n = norm(text);
      if (/\b(vai|va|vem|venha|fica|fique)\b.*\b(para|pra|na|no)\b/.test(n) && (world().rooms || []).some((r) => n.indexOf(norm(r.name)) >= 0)) return 'goto';
      if (/\bordem|\bordens|chamado tecnico/.test(n)) return 'orders';
      if (/\bvms?\b|virtual|proxmox|hypervisor|maquina virtual/.test(n)) return 'vms';
      if (/quebr|manutenc|bancada|conserta (o|a) (pc|switch|computador)/.test(n)) return 'repair';
      if (/(volta|voltem|voltar) (ao|pro|para o) trabalho|bora trabalhar|ao trabalho/.test(n)) return 'work';
      if (!sys.talk) return 'unknown';
      // "Bom dia, pessoal! Como estão os servidores?" → answer the question, not just the greeting
      const rest = n.replace(/^\s*(oi|ola|e ai|eai|bom dia|boa tarde|boa noite|hey|opa)\b[\s,!.]*((pessoal|time|galera|equipe|todos)\b)?[\s,!.]*/, '');
      const q = rest && rest !== n ? sys.talk.detect(rest) : 'unknown';
      return q !== 'unknown' ? q : sys.talk.detect(text);
    }
    function mentioned(n, m) {
      const name = norm(m.crew.name);
      return n.indexOf('@' + name) >= 0 || new RegExp('(^|[^a-z])' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '([^a-z]|$)').test(n);
    }
    // chit-chat goes to anybody, not always the manager
    const CHAT = /^(greet|smalltalk|joke|laugh|compliment|insult|sorry|thanks|hobby|coffee|bored|feelUser|feelBot|isbot|who|personal|jobfeel|time|weather|wait|bye|yes|no|confirm)$/;
    function responder(intent, except) {
      const pool = crew.members.filter((m) => m !== except && !m.crew.leaving && !m.crew.off);
      if (CHAT.test(intent) && pool.length) return pick(pool);
      for (const role of ROLE_FOR[intent] || []) { const m = pool.find((x) => x.crew.profile.role === role); if (m) return m; }
      return manager() || pick(pool) || null;
    }
    function ordersSummary() {
      const run = O.list.filter((o) => o.status === 'run'), open = O.list.filter((o) => o.status === 'open'), done = O.list.filter((o) => o.status === 'done');
      if (!run.length && !open.length) return 'Nenhuma ordem de serviço ativa. ' + (done.length ? done.length + ' concluída(s) hoje.' : 'Tudo em dia!');
      return (run.length ? run.length + ' em andamento: ' + run.slice(0, 3).map((o) => '#' + o.id + ' ' + o.title.toLowerCase() + ' (' + o.assignee.crew.name + ', ' + Math.round((o.progress || 0) * 100) + '%)').join('; ') + '. ' : '') +
        (open.length ? open.length + ' aguardando técnico.' : '') + (done.length ? ' ' + done.length + ' concluída(s).' : '');
    }
    function reply(m, intent, text) {
      if (!alive(m)) return;
      // called by name while off duty: answers from home, briefly
      if (m.crew.off) {
        const s = m.crew.shift;
        chat().post(m, pick(['Tô de folga agora 😴', 'Fora do turno, mas vi a mensagem!', 'Estou em casa agora.']) + (s && s.id !== 'integral' ? ' Volto às ' + String(s.start % 24).padStart(2, '0') + ':00.' : '') + ' Fala com quem está no turno.', { noBubble: true });
        return;
      }
      const n = norm(text);
      let r = null;
      switch (intent) {
        case 'goto': {
          const room = (world().rooms || []).slice().sort((a, b) => b.name.length - a.name.length).find((x) => n.indexOf(norm(x.name)) >= 0);
          if (!room) break;
          api().setZone(m, room.id);
          if (m.crew.job && m.crew.job.auto && m.crew.job.def.kind !== 'repair' && m.crew.job.def.kind !== 'fix' && !m.crew.seated) { api().cancelJob(m, true); m.crew.wait = 0.2; }
          r = { text: pick(['Indo para a ' + room.name + '!', 'Beleza, meu setor agora é a ' + room.name + '.']) };
          break;
        }
        case 'orders': r = { text: ordersSummary() }; break;
        case 'vms': r = { text: DL.infraSummary ? DL.infraSummary() : 'Ainda não temos virtualização.' }; break;
        case 'work':
          if (m.crew.job && m.crew.job.def.social) api().cancelJob(m, true);
          r = { text: pick(['Voltando ao trabalho!', 'Já estou nisso.', 'Bora!']) };
          break;
        case 'repair': {
          const rec = M.broken[0];
          if (!rec) { r = { text: 'Nenhum equipamento quebrado agora. 👌', tone: 'ok' }; break; }
          if (canRepair(m)) {
            const o = createOrder('repair', rec, { byName: playerName(), prefer: m });
            r = { text: o ? 'Pode deixar, vou buscar o ' + rec.label + ' e levar para a bancada.' : 'Já tem uma ordem para o ' + rec.label + '.', tone: 'ok' };
          } else {
            const t = crew.members.find(canRepair);
            if (t) createOrder('repair', rec, { byName: playerName(), prefer: t });
            r = { text: t ? 'Não é comigo, mas passei para ' + t.crew.name + ' consertar o ' + rec.label + '.' : 'Ninguém aqui conserta hardware. Precisamos de um técnico de TI.', tone: t ? 'ok' : 'warn' };
          }
          break;
        }
      }
      if (!r && sys.talk) {
        try { r = sys.talk.answer(m, intent, text); } catch (err) { r = null; }
      }
      if (!r || !r.text) r = { text: pick(['Hmm, ' + playerName() + ', pode explicar melhor? Posso falar de servidores, rede, problemas, ordens ou VMs.', 'Não entendi bem 😅 Quer que eu veja algo no datacenter?']) };
      if (!r) return;
      chat().post(m, r.text, { tone: r.tone === 'warn' ? 'warn' : r.tone === 'ok' ? 'ok' : undefined });
    }
    game.on('team-say', (text) => {
      const pl = game.player;
      if (pl) pl.bubble = { text: text.length > 64 ? text.slice(0, 61) + '…' : text, left: Math.min(5, 2 + text.length * 0.04), tone: 'chat' };
      const ms = crew.members;
      if (!ms.length) { chat().later(1, () => chat().post(SYSTEM, 'Ninguém na equipe ainda. Contrate alguém com N.')); return; }
      const n = norm(text), intent = intentOf(text);
      let to = ms.filter((m) => mentioned(n, m));
      if (!to.length) {
        const first = responder(intent);
        to = first ? [first] : [];
        if (/\b(todos|pessoal|equipe|time|galera)\b/.test(n) && ms.length > 1 && intent !== 'goto') { const s = responder(intent, first); if (s && s !== first) to.push(s); }
      }
      to.slice(0, 3).forEach((m, i) => chat().later(0.9 + i * 1.4 + rand() * 0.6, () => reply(m, intent, text)));
    });

    // broken units on the map: a wisp of smoke and a blinking warning; an empty slot while at the bench
    function overlay(g, sc) {
      const t = sc.t;
      for (const rec of M.broken) {
        const e = rec.place;
        if (!e || !e.bounds) continue;
        // isometric: the marks live in the object's own sprite coordinates
        if (sc.iso) { g.save(); sc.spriteSpace(g, e); brokenFx(g, rec, e, t); g.restore(); }
        else brokenFx(g, rec, e, t);
      }
      // what the visitors hold (a coffee / water while they wait)
      // (people fade out while building: sc.peopleAlpha, demo.js)
      const pa = sc.peopleAlpha == null ? 1 : sc.peopleAlpha;
      for (const a of CL.list) {
        if (!a.held || a.seated || a.hidden || pa <= 0) continue;
        g.save();
        g.globalAlpha = pa;
        if (sc.iso) sc.actorSpace(g, a);
        DL.drawHeld(g, a, a.held.what, a.held.sipT < 0, t, 3);
        g.restore();
      }
    }
    function brokenFx(g, rec, e, t) {
      const b = e.bounds;
      let x = b.x + b.w / 2, y = b.y + 2;
      if (rec.dev && !e.rot) {
        y = e.py - 15 + rec.dev.slot * 3;
        x = e.px + 8;
        if (rec.out) { g.fillStyle = '#07080a'; g.fillRect(e.px + 3, y, 10, 2); }
      }
      if (rec.item && rec.out) {
        g.globalAlpha = 0.6 + 0.3 * Math.sin(t * 4);
        g.fillStyle = '#ff7a17';
        g.fillRect(b.x + 1, b.y + b.h - 2, 3, 1); g.fillRect(b.x + b.w - 4, b.y + b.h - 2, 3, 1);
        g.globalAlpha = 1;
      }
      if (!rec.out) {
        for (let i = 0; i < 3; i++) {
          const k = (t * 0.45 + i / 3) % 1;
          g.globalAlpha = 0.35 * (1 - k);
          g.fillStyle = '#9aa3b0';
          g.fillRect(Math.round(x - 1 + Math.sin(t * 2 + i) * 2), Math.round(y - 3 - k * 10), 2, 2);
        }
        g.globalAlpha = 1;
      }
      if (Math.sin(t * 6) > 0) { g.fillStyle = '#ff7a17'; g.fillRect(Math.round(x) - 1, Math.round(b.y) - 4, 2, 2); }
    }

    /* ================================================================== */
    function update(dt) {
      if (game.player && game.player.bubble && (game.player.bubble.left -= dt) <= 0) game.player.bubble = null;
      tickClients(dt);
      tickBreakage(dt);
      O.acc += dt;
      if (O.acc > 0.5) {
        O.acc = 0;
        followOrders();
        render();
      }
    }

    render(true);
    return {
      update, overlay, broken, breakItem, takeOut, putBack, repaired, prevent, benchFor, claimed,
      createOrder, assess, busyMembers, followUp, ordersSummary, spotsFor,
      // Monitor problems → work orders
      incidents, handling, incidentOn, incidentAt, orderOn, planFor, ACTS,
      get orders() { return O.list; },
      get clients() { return CL.list; },
      spawnClient, receptionRoom,
      manager,
      // in-person service at the reception
      frontPost, clientWaitingFor, attendants,
      get reception() { return { served: CL.served, lost: CL.lost, waiting: waiting().length }; },
    };
  };
})();
