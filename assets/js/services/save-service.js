/* DataLab — Save service: turns the running game into a snapshot and back.
   Snapshot (v1): lot, floor areas, walls, raised-floor tiles, rooms (names, types, styles), every
   placed object (with its stable uid, rack units by slot, skin, style), doors, crew (profile, level,
   skills, salary factor, shift, legendary bot), devices (state, name, IP, specialisation), cables,
   VMs and the company. Saved in the player's account through the Edge Function "game" (the server
   validates and prices it). */
(function () {
  'use strict';
  const DL = window.DL;
  const VERSION = 1;
  const SKIP = { wallseg: 1, glass: 1, glassH: 1, videowall: 1 };
  const newUid = () => 'u' + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 9);
  const doorDef = (e) => (e.len === 2 ? 'door2' : 'door');

  /* ------------------------------------------------------------------ */
  /* snapshot                                                            */
  /* ------------------------------------------------------------------ */
  function serialize(D, name) {
    const W = D.scene.world, ops = D.ops;
    const items = [];
    for (const e of W.items) {
      if (SKIP[e.kind] || e.parent) continue; // a desk's chair comes back with its desk
      if (!e.uid) e.uid = newUid();
      if (e.host && !e.host.uid) e.host.uid = newUid();
    }
    for (const e of W.items) {
      if (SKIP[e.kind] || e.parent) continue;
      const it = { uid: e.uid, def: e.kind === 'door' ? doorDef(e) : e.defId || e.kind, tx: e.tx | 0, ty: e.ty | 0, rot: e.rot | 0 };
      if (e.id) it.id = e.id;
      if (e.host) { it.host = e.host.uid; it.dx = e.dx | 0; it.dy = e.dy | 0; }
      if (e.units) { it.units = e.units.map((u, k) => (u ? (e.unitModel && e.unitModel[k]) || u : null)); if (e.unitCost && e.unitCost.some(Boolean)) it.unitCost = e.unitCost.slice(); }
      if (e.skin) it.skin = e.skin;
      if (e.kind === 'door') { it.len = e.len || 1; if (e.hold) it.hold = true; if (e.auto) it.auto = true; }
      if (e.tidy === false) it.tidy = false;
      // the team's cooling maintenance (staff.js): a serviced precision AC, blanking panels in a rack
      if (e.tuned) it.tuned = true;
      if (e.kind === 'crac' && e.model) it.model = e.model; // its cooling model (clima.js upgrades)
      if (e.blank) it.blank = true;
      if (e.cost) it.cost = e.cost;
      const st = {};
      for (const o of (DL.ITEM_STYLES && DL.ITEM_STYLES[e.kind]) || []) {
        const v = DL.itemStyleGet(e, o.key);
        if (v !== undefined && v !== null && v !== '') st[o.key] = v;
      }
      if (Object.keys(st).length) it.style = st;
      items.push(it);
    }
    // crew: stable keys (the server tells new hires from old ones by them)
    const members = D.crew.members;
    let next = members.reduce((m, a) => Math.max(m, a.crew.saveKey || 0), 0);
    for (const a of members) if (!a.crew.saveKey) a.crew.saveKey = ++next;
    const crew = members.map((a) => {
      const c = a.crew, p = Object.assign({}, c.profile);
      delete p.nameTouched;
      return {
        key: c.saveKey, name: c.name, role: p.role, level: c.stats.level, xp: Math.round(c.stats.xp), skills: Object.assign({}, c.stats.skills),
        stats: { done: c.stats.done || 0, found: c.stats.found || 0, fixed: c.stats.fixed || 0 },
        pay: c.pay, profile: p, shift: Object.assign({}, c.shift), oncall: (c.oncall || []).slice(0, 3), attend: c.attend, zone: c.zone || null,
        legend: c.legendBot || null, legendItem: c.legend || null,
        // AI agent of this employee (agents.js): id of their workspace on the Agent Gateway, agent, model
        ai: DL.sanitizeAi ? DL.sanitizeAi(c.ai) : null,
      };
    });
    const devices = ops.devices().map((d) => {
      const o = { key: d.key, kind: d.kind, name: d.name, ip: d.ip, state: d.state, svc: d.svc || null, pre: !!d.pre };
      // Windows Server (winserver.js): the whole simulated server — domain, DNS, DHCP, shares…
      if (DL.isWin && DL.isWin(d)) { o.os = 'windows'; o.win = DL.winSnapshot(d); }
      return o;
    });
    const links = ops.links.map((l) => ({ a: { dev: l.a.dev, port: l.a.port }, b: { dev: l.b.dev, port: l.b.port }, loose: l.loose || null }));
    const vms = D.infra.vms.map((v) => ({ id: v.id, name: v.name, node: v.node, svc: v.svc, os: v.os, cores: v.cores, ram: v.ram, disk: v.disk, status: v.status }));
    return {
      v: VERSION, name: name || 'Meu datacenter', savedAt: Date.now(), clock: Math.round(D.state.time || 0),
      lot: Object.assign({}, W.lot), areas: W.areas.map((a) => ({ id: a.id, name: a.name, x: a.x, y: a.y, w: a.w, h: a.h, floor: a.floor, theme: a.theme || null })),
      walls: Array.from(W.wallSet || []), gaps: Array.from(W.gapsSeen || []), perf: Array.from(W.perf || []),
      rooms: W.rooms.map((r) => ({ id: r.id, name: r.name, type: r.type || null, theme: r.theme || null, style: r.style || null, floor: r.floor, x: r.x, y: r.y, w: r.w, h: r.h, n: r.n })),
      items, crew, devices, links, vms, econ: D.economy.snapshot(), career: D.career ? D.career.snapshot() : null,
      problems: D.problems ? D.problems.snapshot() : null,
      // where the player stands: inside the datacenter or on the street outside it (street.js)
      where: DL.Street ? DL.Street.snapshot() : null,
      // the time of day (daynight.js); saves from before it have none and keep the running one
      dia: DL.DayNight ? DL.DayNight.snapshot() : null,
      // the weather of the current day (weather.js): rain / storm tonight, so a reload doesn't reroll it
      clima: DL.Clima ? DL.Clima.snapshot() : null,
      // a blackout still going (blackout.js: the UPS, the racks without power, the breaker game's progress)
      // and the servers it left damaged (a task each until they are cabled and configured again)
      apagao: D.blackout && D.blackout.snapshot ? D.blackout.snapshot() : null,
      danos: ops.devices().filter((d) => d.danificado).map((d) => d.key),
      // the racks' heat, a fire still burning, the rest time after one and what it burnt (incendio.js)
      fogo: DL.Fogo ? DL.Fogo.snapshot() : null,
    };
  }

  /* ------------------------------------------------------------------ */
  /* restore (same builder rules as the presets: everything stays editable) */
  /* ------------------------------------------------------------------ */
  function apply(D, data, opts) {
    opts = opts || {};
    if (!data || data.v !== VERSION) throw new Error('save_version');
    const scene = D.scene, W = scene.world, A = D.builder.api, ops = D.ops;
    D.crew.clearAll();
    const fresh = DL.newWorld({ lot: data.lot, rooms: data.areas.map((a) => Object.assign({}, a)) });
    fresh.items = []; // the saved doors come back below (no automatic ones)
    fresh.wallSet = new Map(data.walls || []);
    fresh.gapsSeen = new Set(data.gaps || []);
    fresh.perf = new Set(data.perf || []);
    fresh.rooms = null;
    fresh.dcDone = !!(data.econ && data.econ.dcDone);
    for (const k of Object.keys(W)) if (!(k in fresh)) delete W[k];
    Object.assign(W, fresh);
    ops.reset();
    D.infra.reset();
    ops.preinstall = true;
    A.commit({ layout: true });

    const byUid = new Map(), refused = [];
    const lastPlaced = () => { for (let i = W.items.length - 1; i >= 0; i--) if (!W.items[i].parent) return W.items[i]; return null; };
    // doors first (they need the walls), then the floor, then what stands on tables
    for (const it of data.items.filter((x) => x.def === 'door' || x.def === 'door2')) {
      const why = A.placeDoor(it.tx, it.ty, it.len || (it.def === 'door2' ? 2 : 1), it.rot || 0);
      if (why) { refused.push(it.def + ': ' + why); continue; }
      const e = W.items.find((x) => x.kind === 'door' && x.tx === it.tx && x.ty === it.ty);
      if (e) { e.uid = it.uid; e.hold = !!it.hold; e.auto = !!it.auto; e.cost = it.cost || 0; byUid.set(it.uid, e); }
    }
    const rest = data.items.filter((x) => x.def !== 'door' && x.def !== 'door2');
    for (const it of rest.filter((x) => !x.host).concat(rest.filter((x) => x.host))) {
      let tx = it.tx, ty = it.ty;
      if (it.host) { const h = byUid.get(it.host); if (!h) { refused.push(it.def + ': sem mesa'); continue; } tx = h.tx + (it.dx | 0); ty = h.ty + (it.dy | 0); }
      // cosmetic furniture comes back only while it is in the player's inventory (one of each)
      const cdef = DL.CATALOG_DEF && DL.CATALOG_DEF[it.def];
      if (cdef && cdef.cosm && (!DL.Inventory || !DL.Inventory.owns(it.def) || W.items.some((x) => x.defId === it.def))) { refused.push(it.def + ': cosmético fora do inventário'); continue; }
      const before = W.items.length;
      const why = A.place(it.def, tx, ty, it.rot || 0);
      if (why || W.items.length === before) { refused.push(it.def + '@' + tx + ',' + ty + ': ' + (why || '?')); continue; }
      const e = lastPlaced();
      e.uid = it.uid;
      byUid.set(it.uid, e);
      if (it.id && e.id !== it.id) { e.id = it.id; if (e.kind === 'rack') { e.name = 'Rack ' + it.id.slice(5); e.short = it.id.slice(5); } }
      if (it.units && e.units) A.restoreUnits(e, it.units, it.unitCost);
      if (it.skin) e.skin = it.skin;
      if (it.tidy === false) e.tidy = false;
      if (it.tuned === true) e.tuned = true;
      if (e.kind === 'crac' && typeof it.model === 'string' && DL.HW && DL.HW.crac && DL.HW.crac[it.model]) { e.model = it.model; if (DL.Clima) DL.Clima.aplicar(e); }
      if (it.blank === true) e.blank = true;
      e.cost = it.cost || 0;
      if (it.style) for (const k of Object.keys(it.style)) DL.itemStyleSet(e, k, it.style[k]);
    }
    A.commit({ layout: true });
    // room names, types and looks (matched by their footprint)
    for (const r of W.rooms) {
      const s = (data.rooms || []).find((x) => x.x === r.x && x.y === r.y && x.w === r.w && x.h === r.h);
      if (s) Object.assign(r, { id: s.id, name: s.name, type: s.type || undefined, theme: s.theme || undefined, style: s.style || undefined, floor: s.floor || r.floor });
    }
    A.commit({ layout: true, restyle: true });
    // devices: states, names, IPs, specialisations; then the cables
    const devs = new Map((data.devices || []).map((d) => [d.key, d]));
    for (const d of ops.devices()) {
      const s = devs.get(d.key);
      if (!s) continue;
      // the units are numbered again on load (SRV-01, 02… in rack order), so a configured one gets the IP and
      // hostname of that new number: give its OS the saved ones too, or it comes back without ping
      if (d.os && d.os.ifaces && s.ip != null && s.ip !== d.ip) { const e = d.os.ifaces.eth0; e.ips = e.ips.map((x) => (x === d.ip + '/24' ? s.ip + '/24' : x)); }
      if (d.os && s.name && d.os.hostname === d.name.toLowerCase()) d.os.hostname = s.name.toLowerCase();
      if (s.name) d.name = s.name;
      if (s.ip != null) d.ip = s.ip;
      if (s.svc) d.svc = s.svc;
      d.pre = !!s.pre;
      if (d.kind === 'server' && s.state !== 'online') { d.state = s.state === 'link' ? 'link' : 'new'; DL.newOS(d, false); }
      if (d.kind === 'server' && s.os === 'windows' && DL.winRestore) DL.winRestore(d, s.win);
    }
    for (const l of data.links || []) {
      const r = ops.addLink(l.a, l.b, { quiet: true });
      if (r.link && l.loose) r.link.loose = l.loose;
    }
    ops.preinstall = false;
    ops.recompute();
    D.infra.restoreVms(data.vms || []);
    // the team
    for (const c of data.crew || []) {
      const profile = Object.assign({}, c.profile, { name: c.name, role: c.role });
      const stats = { level: c.level || 1, xp: c.xp || 0, skills: Object.assign({}, c.skills), done: (c.stats && c.stats.done) || 0, found: (c.stats && c.stats.found) || 0, fixed: (c.stats && c.stats.fixed) || 0 };
      const a = D.crew.api.hire(profile, { silent: true, free: true, stats, pay: c.pay, at: D.crew.api.nav.randomSpot(), legend: c.legendItem || null });
      if (!a) continue;
      a.crew.saveKey = c.key;
      if (c.legend) a.crew.legendBot = c.legend;
      if (c.shift) a.crew.shift = Object.assign({}, c.shift);
      a.crew.oncall = c.oncall || [];
      if (c.attend) a.crew.attend = c.attend;
      if (c.ai && DL.sanitizeAi) a.crew.ai = DL.sanitizeAi(c.ai);
      if (c.zone && W.rooms.some((r) => r.id === c.zone)) { a.crew.zone = c.zone; a.crew.placeAuto = false; }
    }
    // (multiplayer.js applies the world's shape alone: without these parts the running ones stay)
    if ('econ' in data) D.economy.restore(data.econ);
    if (opts.company) D.economy.applyServer(opts.company);
    if (D.career && 'career' in data) D.career.restore(data.career);
    if (D.problems && 'problems' in data) D.problems.restore(data.problems);
    if (DL.DayNight && data.dia) DL.DayNight.restore(data.dia);
    if (DL.Clima && data.clima) DL.Clima.restore(data.clima); // (after the time of day: it checks if it is night)
    // the blackout and its damaged servers (saves from before them have none: nothing going on)
    if ('danos' in data || 'apagao' in data) {
      const hurt = new Set(Array.isArray(data.danos) ? data.danos : []);
      for (const d of ops.devices()) d.danificado = hurt.has(d.key) && d.kind === 'server' && d.state !== 'online';
      ops.render(true);
    }
    if (D.blackout && D.blackout.restore && ('apagao' in data || !opts.keepPlayer)) D.blackout.restore(data.apagao || null);
    // (after the devices and their cables: it finds racks by uid and devices by key)
    if (DL.Fogo && ('fogo' in data || !opts.keepPlayer)) DL.Fogo.restore(data.fogo || null);
    if (!opts.keepPlayer) {
      const pl = D.player;
      pl.x = W.spawn.x; pl.y = W.spawn.y; pl.vx = pl.vy = 0;
      scene.cam.x = pl.x; scene.cam.y = pl.y;
      // back where they were (street.js checks it: the street spot is clamped to the sidewalk, an inside
      // spot that is no longer free keeps the spawn); saves from before the street have no "where"
      if (DL.Street) DL.Street.restore(data.where);
    }
    if (refused.length) console.warn('save: itens não restaurados', refused);
    return refused;
  }

  /* ------------------------------------------------------------------ */
  /* cloud slots (Edge Function "game")                                  */
  /* ------------------------------------------------------------------ */
  const game = () => window.DataLabDemo;
  // name: the slot's save name, kept so the autosave doesn't rename it back to the default
  const S = { slot: null, name: null, busy: false, timer: 0, last: 0, lastError: null };

  // the account's slots (RLS: only the player's own rows); a failed read comes back as [] with .error set
  async function listCloud() {
    const q = DL.Cloud.from('game_saves');
    const failed = (msg) => Object.assign([], { error: msg });
    if (!q) return failed('Sem conexão com o servidor do DataLab.');
    try {
      const { data, error } = await q.select('slot, name, version, stats, updated_at, play_minutes').order('slot');
      if (error) { console.warn('DataLab: lista de saves', error.code, error.message); return failed('Não foi possível ler seus saves (' + (error.code || 'erro') + ').'); }
      return data || [];
    } catch (e) { return failed('Falha de rede ao ler seus saves.'); }
  }

  DL.SaveService = {
    VERSION, serialize, apply,
    get slot() { return S.slot; },
    set slot(v) { if (v !== S.slot) S.name = null; S.slot = v; },
    get busy() { return S.busy; },
    // the loaded slot's name (the datacenter's name: street.js shows it on the building's sign)
    get name() { return S.name; },
    get lastSaved() { return S.last; },
    get lastError() { return S.lastError; },
    listCloud,
    async newGame(slot, name, preset) {
      const r = await DL.Cloud.call('game', { action: 'new', slot, name, preset });
      if (r.ok) { S.slot = slot; S.name = name || null; game().economy.applyServer(r.data); }
      return r;
    },
    // save the running game into its cloud slot; the answer carries the server's balances
    async save(opts) {
      opts = opts || {};
      const D = game();
      if (!S.slot || S.busy || !DL.Cloud.signedIn || D.state.phase !== 'play') return { ok: false, code: 'idle', message: 'Nada para salvar agora.' };
      S.busy = true;
      try {
        if (opts.name) S.name = opts.name;
        const data = serialize(D, S.name);
        const claim = D.economy.takeClaim();
        const r = await DL.Cloud.call('game', { action: 'save', slot: S.slot, data, claim, request_id: DL.Cloud.requestId() }, { keepalive: true });
        if (r.ok) {
          D.economy.resetClaim((claim.problems || []).length);
          D.economy.applyServer(r.data);
          // (solved problems the server did not count in this save wait for the next one: their XP stays)
          // (and the XP of problems solved while this save was on its way: it was not in this save at all)
          const lateXp = D.career && data.career ? Math.max(0, D.career.xp - (data.career.xp | 0)) : 0;
          const pendXp = (r.data.career && D.economy.requeueProblems ? D.economy.requeueProblems(claim.problems, r.data.career) : 0) + lateXp;
          if (D.career && r.data.career) D.career.applyServer(r.data.career, pendXp);
          // what the server removed (skins / legendary bots the player doesn't own) goes away here too
          for (const c of r.data.changes || []) {
            if (c.type === 'skin_removed') { const e = D.scene.world.items.find((x) => x.uid === c.uid); if (e) delete e.skin; }
            if (c.type === 'legend_removed') { const a = D.crew.members.find((m) => m.crew.saveKey === c.key); if (a) { a.crew.legend = null; a.crew.legendBot = null; a.legend = false; } }
          }
          S.last = Date.now();
          S.lastError = null;
        } else S.lastError = r.message;
        DL.Cloud.emit('saved', r);
        return r;
      } finally { S.busy = false; }
    },
    async load(slot) {
      // loading changes nothing on the server: a network blip is retried before giving up
      let r;
      for (let i = 0; i < 3; i++) {
        r = await DL.Cloud.call('game', { action: 'load', slot });
        if (r.ok || r.code !== 'network') break;
        await new Promise((res) => setTimeout(res, 800 * (i + 1)));
      }
      if (!r.ok) return r;
      const D = game();
      if (!r.data.save.data) return { ok: false, code: 'empty', message: 'Este espaço ainda não foi salvo.' };
      const refused = apply(D, r.data.save.data, { company: r.data.company });
      S.slot = slot;
      S.name = r.data.save.name || null;
      return { ok: true, data: r.data, refused };
    },
    remove: (slot) => DL.Cloud.call('game', { action: 'delete', slot }),
    // autosave while a cloud game is running: on a timer (the game pauses in a hidden tab, so the timer
    // skips it) and whenever the player leaves — switching tabs, minimizing, closing or reloading.
    // Saves are sent with keepalive, so the one fired on exit still reaches the server.
    startAutosave(seconds) {
      clearInterval(S.timer);
      // (while build mode still has changes to undo, the timer waits: they are saved once confirmed — build.js)
      S.timer = setInterval(() => { if (S.slot && DL.Cloud.signedIn && !document.hidden && !(DL.buildBusy && DL.buildBusy())) this.save({}); }, Math.max(20, seconds || 30) * 1000);
      if (!S.exitHooked) {
        S.exitHooked = true;
        // leaving right after a save adds nothing: a few seconds apart keeps quick tab switches from flooding the server
        const onExit = () => { if (S.timer && S.slot && DL.Cloud.signedIn && Date.now() - S.last > 5000) this.save({}); };
        document.addEventListener('visibilitychange', () => { if (document.hidden) onExit(); });
        addEventListener('pagehide', onExit);
      }
    },
    stopAutosave() { clearInterval(S.timer); S.timer = 0; },
  };
})();
