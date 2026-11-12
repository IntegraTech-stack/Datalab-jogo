/* DataLab — multiplayer: one world, shared by everyone in a room (services/net-service.js connects them:
   the host's browser is the room, the others join with its code).
   The host's game is the world: it runs the whole simulation (crew, devices, economy, problems) exactly
   as in solo, and sends the others what they need to see it:
   - "struct": the shape of the world in the save format (services/save-service.js, without the company
     balance): lot, rooms, walls, objects, devices, cables, VMs, the team. Sent whenever it changes;
   - "live", 10× a second: where each crew member is and what they are doing, device states, the clock
     and the company's cash.
   A guest doesn't simulate: it plays its own character and edits the world locally with the same build,
   crew and terminal tools as in solo. Each change is turned into a diff of that same save format ("ops")
   and sent to the host, which applies it (charging the company) and sends the world back.
   Every player's character travels as "pos", its emotes as "emote"; "say" is the shared team chat. lobby.js has the screens. */
(function () {
  'use strict';
  const DL = window.DL, D = window.DataLabDemo;
  if (!D || DL.HERO || !DL.Net || !DL.SaveService) return;
  const G = D.game, SS = DL.SaveService, T = DL.T;
  const LOOK_KEYS = ['name', 'body', 'skin', 'hair', 'hairStyle', 'outfit', 'shirt', 'pants', 'pantsStyle', 'shoes', 'vest', 'glasses', 'beard', 'headset', 'earrings', 'hat', 'hatColor', 'shades', 'scarf', 'backpack', 'chain', 'role', 'gear'];
  const DIRS = ['down', 'up', 'left', 'right'];
  const LIVE_EVERY = 0.1, STRUCT_EVERY = 0.5, POS_EVERY = 0.1;
  const r1 = (v) => Math.round(v * 10) / 10;
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  const handlers = {};
  const MP = {
    role: null, conn: null, id: null, room: null, hostId: null,
    players: new Map(), // id → { id, name, role, look, actor }
    rev: 0, hash: '', acks: {}, seq: 0, applied: null, latest: null, pendingSync: [],
    applying: false, t: { live: 0, struct: 0, pos: 0, keep: 0, check: 0 }, dirty: false, lastPos: '', savedAt: 0, stopped: false,
  };
  const emit = (ev, info) => (handlers[ev] || []).forEach((fn) => fn(info));
  const toast = (tone, title, text) => G.toast(tone, title, text);
  const playing = () => D.state.phase === 'play';
  const myProfile = () => D.crew.playerProfile || {};
  const myName = () => myProfile().name || 'Jogador';
  // + the accessories, and the trail, aura, profile frame, icon and title equipped in the inventory (trails.js / battlepass.js)
  // "live" rides along with the look (so whoever joins later gets it too) but never redraws the character
  function myLook() { const p = myProfile(), o = {}; for (const k of LOOK_KEYS) if (p[k] !== undefined) o[k] = p[k]; if (DL.lookExtras) Object.assign(o, DL.lookExtras()); o.live = myLive(); return o; }

  // what the room sees of my music: never the device's name (often the owner's) and nothing for a private
  // session or an ad (those arrive here as idle). Spotify and YouTube Music both on: whichever is playing.
  const clip = (s, n) => String(s || '').slice(0, n);
  function myMusic() {
    const read = (src, now) => {
      const t = now ? now() : null;
      return t && !t.idle && t.title ? { src, title: clip(t.title, 120), artist: clip(t.artist, 120), image: clip(t.image, 400), url: clip(t.url, 400), on: t.playing ? 1 : 0 } : null;
    };
    const a = read('spotify', DL.SpotifyNow), b = read('ytm', DL.YTMusicNow);
    return a && a.on ? a : b && b.on ? b : a || b;
  }
  // levels: the account's and the season pass' are the player's own wherever they play. The career belongs to
  // the world being played (a guest's copy is the host's), so only the host tells it.
  function myLive() {
    const o = {}, music = myMusic();
    if (MP.accountLevel) o.level = MP.accountLevel;
    if (DL.Pass && DL.Pass.activated) o.pass = DL.Pass.level;
    if (MP.role === 'host' && D.career) o.rank = D.career.title;
    if (music) o.music = music;
    if (MP.username) o.user = MP.username; // so that a friend request can be sent from my card (lobby.js)
    return o;
  }
  function loadAccountLevel() {
    const q = DL.Cloud && DL.Cloud.from ? DL.Cloud.from('player_progress') : null;
    if (q) q.select('level').maybeSingle().then((r) => { if (r && r.data && r.data.level) MP.accountLevel = r.data.level; }, () => {});
    if (DL.Auth && DL.Auth.profile) DL.Auth.profile().then((p) => { if (p && p.username) MP.username = p.username; }, () => {});
  }
  function sendLook() {
    if (!MP.role || !MP.conn) return;
    const look = myLook();
    MP.lastLook = JSON.stringify(look);
    MP.conn.send({ t: 'look', look });
  }
  // a new song, a pause, a level up: nobody announces those, so look for changes (also in a hidden tab)
  setInterval(() => { if (MP.role && MP.conn && JSON.stringify(myLook()) !== MP.lastLook) sendLook(); }, 2000);

  /* ------------------------------------------------------------------ */
  /* the world's shape: the save snapshot minus what changes every tick   */
  /* ------------------------------------------------------------------ */
  function structOf(snap) {
    return {
      v: snap.v, name: snap.name, lot: snap.lot, areas: snap.areas, walls: snap.walls, gaps: snap.gaps, perf: snap.perf, rooms: snap.rooms,
      items: snap.items, devices: snap.devices, links: snap.links, vms: snap.vms, crew: snap.crew, career: snap.career,
    };
  }
  // what counts as "the world changed" (xp and skills creep up all the time: they ride along, unhashed)
  function hashOf(st) {
    return JSON.stringify(Object.assign({}, st, {
      name: 0, career: st.career ? st.career.level : 0,
      crew: st.crew.map((c) => Object.assign({}, c, { xp: 0, skills: 0, stats: 0 })),
    }));
  }
  const snapshot = () => SS.serialize(D, MP.room ? MP.room.name : null);

  /* ------------------------------------------------------------------ */
  /* other players' characters                                           */
  /* ------------------------------------------------------------------ */
  function remoteFrame() {
    const n = this.net;
    if (n && n.seated && this.sitSheet) { const set = this.sitSheet[n.sitDir] || this.sitSheet.up; return this.blinkT > 0 ? set.blink : set.R; }
    return DL.remoteEmoteFrame(this) || DL.Actor.prototype.frame.call(this);
  }
  function lookActor(a, look) {
    const L = DL.crewLook(Object.assign({}, look));
    a.look = L;
    a.sheet = DL.makeSheet(L);
    a.sitSheet = DL.makeSitSheet(L);
  }
  const withoutLive = (look) => Object.assign({}, look, { live: 0 });
  function upsertPlayer(info) {
    if (!info || info.id === MP.id) return null;
    let p = MP.players.get(info.id);
    if (!p) { p = { id: info.id, name: info.name, role: info.role, look: null, actor: null }; MP.players.set(info.id, p); }
    if (info.name) p.name = info.name;
    if (info.role) p.role = info.role;
    if (info.look) {
      const redraw = !same(withoutLive(info.look), withoutLive(p.look));
      p.look = info.look;
      if (redraw && p.actor) lookActor(p.actor, p.look);
    }
    return p;
  }
  function spawnActor(p, at) {
    if (p.actor || !playing()) return;
    const a = new DL.Actor(DL.LOOKS.player, at.x, at.y, DIRS[at.d | 0] || 'down');
    lookActor(a, p.look || { name: p.name });
    a.remotePlayer = p;
    a.frame = remoteFrame;
    a.net = { x: at.x, y: at.y };
    p.actor = a;
    D.scene.actors.push(a);
    D.scene.refreshWorld(false);
  }
  function dropActor(p) {
    if (!p.actor) return;
    const a = p.actor;
    p.actor = null;
    D.scene.actors = D.scene.actors.filter((x) => x !== a);
    D.scene.refreshWorld(false);
  }
  function removePlayer(id) {
    const p = MP.players.get(id);
    if (!p) return;
    dropActor(p);
    MP.players.delete(id);
  }

  // smooth the 10 Hz positions into every frame (snap when far: a teleport, a seat, a reload)
  function glide(a, n, dt) {
    const dx = n.x - a.x, dy = n.y - a.y, d = Math.hypot(dx, dy);
    if (d > 48) { a.x = n.x; a.y = n.y; }
    else if (d > 0.05) { const k = Math.min(1, dt * 12); a.x += dx * k; a.y += dy * k; a.dist += d * k; }
    a.moving = !!n.moving && d > 0.05;
    if (n.dir) a.dir = n.dir;
  }

  /* ------------------------------------------------------------------ */
  /* the local character → everyone                                      */
  /* ------------------------------------------------------------------ */
  function sendPos(force) {
    const pl = D.player, seat = D.seat.state;
    const msg = { t: 'pos', x: r1(pl.x), y: r1(pl.y), d: Math.max(0, DIRS.indexOf(pl.dir)), m: pl.moving ? 1 : 0 };
    // on the street outside the datacenter (street.js): the others draw me there, not inside
    if (DL.Street && DL.Street.outside) {
      msg.o = 1;
      // inside a shop (lojas.js): the others see me on the sidewalk at its door
      const q = DL.Street.netPos && DL.Street.netPos();
      if (q) { msg.x = r1(q.x); msg.y = r1(q.y); msg.m = 0; }
    }
    if (pl.seated) { msg.s = 1; msg.sd = (seat.seat && seat.seat.dir) || (seat.rest && seat.rest.dir) || 'up'; msg.k = pl.sortKey || 0; }
    const k = JSON.stringify(msg);
    if (!force && k === MP.lastPos) return;
    MP.lastPos = k;
    MP.conn.send(k);
  }
  function onPos(m) {
    const p = MP.players.get(m.from) || upsertPlayer({ id: m.from, name: '?' });
    if (!p) return;
    // outside on the street (street.js): only ever inside its walkable strip, whatever position arrives
    // (lag, an old version, a bad message)
    const out = !!m.o && !!DL.Street;
    if (out) { const f = DL.Street.clampFeet(Number(m.x), Number(m.y)); m.x = f.x; m.y = f.y; }
    if (!p.actor) spawnActor(p, m);
    const a = p.actor;
    if (!a) return;
    // …hidden in the datacenter and drawn on the sidewalk
    a.outside = out;
    a.hidden = out;
    a.net = { x: m.x, y: m.y, dir: DIRS[m.d | 0], moving: !!m.m, seated: !!m.s, sitDir: m.sd };
    a.seated = !!m.s;
    a.noShadow = !!m.s;
    a.sortKey = m.s ? m.k || null : null;
  }
  // an emote starting (or ending: id null) on someone's character
  function sendEmote(id) {
    if (MP.role && MP.conn) MP.conn.send({ t: 'emote', id });
  }
  function onEmote(m) {
    const p = MP.players.get(m.from);
    if (p && p.actor) DL.remoteEmote(p.actor, m.id);
  }

  /* ------------------------------------------------------------------ */
  /* HOST: the world goes out                                            */
  /* ------------------------------------------------------------------ */
  function pushStruct(force, to) {
    if (!playing()) return;
    const st = structOf(snapshot()), h = hashOf(st);
    if (!force && h === MP.hash) return;
    MP.hash = h;
    MP.rev++;
    MP.conn.send({ t: 'struct', rev: MP.rev, data: st, ack: MP.acks, to });
  }

  function liveRows() {
    const crew = D.crew.members.map((a) => {
      const c = a.crew, b = a.bubble;
      return [c.saveKey || 0, r1(a.x), r1(a.y), DIRS.indexOf(a.dir), a.moving ? 1 : 0, c.seated ? 1 : 0, c.sitDir || 'up', c.pose || 'R', c.state || 'idle',
        a.hidden ? 1 : 0, a.alpha == null ? 1 : r1(a.alpha), a.sortKey == null ? null : a.sortKey, a.noShadow ? 1 : 0, b ? b.text : null, b ? b.tone || '' : null, c.talkT > 0 ? 1 : 0];
    });
    const dev = D.ops.devices().map((d) => [d.key, d.state, d.broken ? 1 : 0, d.out ? 1 : 0, d.fault ? { type: d.fault.type, found: !!d.fault.found } : null]);
    const co = D.economy.company;
    // dc: the datacenter's name, for the sign on the building outside (street.js cleans it before drawing)
    return { t: 'live', time: r1(D.state.time), cash: Math.round(co.cash), phase: co.phase, month: co.month, crew, dev, dc: DL.DcName ? DL.DcName.current : '' };
  }

  // a guest's changes, in the save format: apply what still makes sense here, charging the company
  function applyOps(ops, from) {
    const W = D.scene.world, A = D.builder.api, B = D.builder.state, co = D.economy.company;
    const who = (MP.players.get(from) || {}).name || 'Convidado';
    const denied = [];
    const keep = { def: B.def, ghost: B.ghost, rot: B.rot };
    const byUid = (uid) => W.items.find((x) => x.uid === uid && !x.parent);
    const charge = (price, name) => {
      if (!(price > 0)) return true;
      if (co.cash < price) { denied.push(name + ': saldo insuficiente'); return false; }
      G.emit('purchase', { price, name: name + ' · ' + who });
      return true;
    };
    try {
      if (ops.layout) {
        const L = ops.layout;
        W.lot = Object.assign({}, L.lot);
        W.areas = L.areas.map((a) => Object.assign({}, a));
        W.wallSet = new Map(L.walls || []);
        W.gapsSeen = new Set(L.gaps || []);
        W.perf = new Set(L.perf || []);
        A.commit({ layout: true });
      }
      for (const uid of ops.del || []) { const e = byUid(uid); if (e) A.removeItem(e); }
      const adds = ops.add || [];
      const order = adds.filter((x) => x.def === 'door' || x.def === 'door2').concat(adds.filter((x) => x.def !== 'door' && x.def !== 'door2' && !x.host), adds.filter((x) => x.host));
      for (const it of order) {
        if (byUid(it.uid)) continue;
        const name = (DL.itemName && DL.itemName({ kind: it.def, defId: it.def })) || it.def;
        const price = (it.cost || 0) + (it.unitCost || []).reduce((s, c) => s + (+c || 0), 0);
        if (co.cash < price) { denied.push(name + ': saldo insuficiente'); continue; }
        const before = W.items.length;
        let why;
        if (it.def === 'door' || it.def === 'door2') why = A.placeDoor(it.tx, it.ty, it.len || (it.def === 'door2' ? 2 : 1), it.rot || 0);
        else {
          let tx = it.tx, ty = it.ty;
          if (it.host) { const h = byUid(it.host); if (!h) { denied.push(name + ': a mesa sumiu'); continue; } tx = h.tx + (it.dx | 0); ty = h.ty + (it.dy | 0); }
          why = A.place(it.def, tx, ty, it.rot || 0);
        }
        if (why || W.items.length === before) { denied.push(name + ': ' + (why || 'não coube')); continue; }
        let e = null;
        for (let i = W.items.length - 1; i >= 0; i--) if (!W.items[i].parent) { e = W.items[i]; break; }
        e.uid = it.uid;
        e.cost = it.cost || 0;
        if (it.units && e.units) { A.restoreUnits(e, it.units, it.unitCost); A.commit({ installed: e }); }
        if (it.skin) e.skin = it.skin;
        if (it.tidy === false) e.tidy = false;
        if (e.kind === 'door') { e.hold = !!it.hold; e.auto = !!it.auto; }
        if (it.style) for (const k of Object.keys(it.style)) DL.itemStyleSet(e, k, it.style[k]);
        charge(price, name);
      }
      for (const it of ops.mod || []) {
        const e = byUid(it.uid);
        if (!e) continue;
        const name = DL.itemName ? DL.itemName(e) : it.def;
        if (e.tx !== it.tx || e.ty !== it.ty || (e.rot | 0) !== (it.rot | 0)) {
          const why = A.relocate(e, it.tx, it.ty, it.rot | 0);
          if (why) denied.push(name + ': ' + why);
        }
        if (it.units && e.units && !same(it.units, e.units.map((u, k) => (u ? (e.unitModel && e.unitModel[k]) || u : null)))) {
          const was = (e.unitCost || []).reduce((s, c) => s + (+c || 0), 0), now = (it.unitCost || []).reduce((s, c) => s + (+c || 0), 0);
          if (now <= was || charge(now - was, name)) {
            if (now < was) G.emit('refund', { amount: Math.round((was - now) * 0.5), name });
            A.restoreUnits(e, it.units, it.unitCost);
            A.commit({ installed: e });
          }
        }
        if ((it.skin || null) !== (e.skin || null)) { if (it.skin) e.skin = it.skin; else delete e.skin; }
        if (it.tidy === false) e.tidy = false; else if (e.tidy === false) delete e.tidy;
        if (e.kind === 'door') { e.hold = !!it.hold; e.auto = !!it.auto; }
        if (it.style) for (const k of Object.keys(it.style)) DL.itemStyleSet(e, k, it.style[k]);
      }
      if (ops.rooms && ops.rooms.length) {
        for (const s of ops.rooms) {
          const r = W.rooms.find((x) => x.x === s.x && x.y === s.y && x.w === s.w && x.h === s.h);
          if (r) Object.assign(r, { name: s.name, type: s.type || undefined, theme: s.theme || undefined, style: s.style || undefined, floor: s.floor || r.floor });
        }
        A.commit({ layout: true, restyle: true });
      } else if (ops.mod && ops.mod.length) A.commit({});
      // the team: hires are paid here (the hiring rules apply), dismissals, schedules and sectors
      for (const c of ops.hire || []) {
        const a = D.crew.api.hire(Object.assign({}, c.profile, { name: c.name, role: c.role }), { pay: c.pay, legend: c.legendItem || null });
        if (!a) denied.push('Contratar ' + c.name + ': recusado');
      }
      for (const key of ops.fire || []) { const a = D.crew.members.find((m) => m.crew.saveKey === key); if (a) D.crew.api.fire(a); }
      for (const c of ops.crew || []) {
        const a = D.crew.members.find((m) => m.crew.saveKey === c.key);
        if (!a) continue;
        if (c.shift) a.crew.shift = Object.assign({}, c.shift);
        if (c.oncall) a.crew.oncall = c.oncall.slice(0, 3);
        if (c.attend) a.crew.attend = c.attend;
        if (c.zone !== undefined) { a.crew.zone = c.zone && W.rooms.some((r) => r.id === c.zone) ? c.zone : null; a.crew.placeAuto = !a.crew.zone; }
      }
      // devices (names, IPs, roles, configuration done in a guest's terminal) and cables
      for (const s of ops.dev || []) {
        const d = D.ops.get(s.key);
        if (!d) continue;
        if (s.name) d.name = s.name;
        if (s.ip != null) d.ip = s.ip;
        d.svc = s.svc || null;
        if (s.state && s.state !== d.state && d.kind === 'server') {
          const was = d.state;
          d.state = s.state;
          if (s.state === 'online' && was !== 'online') G.emit('server-online', { d });
        }
        if (s.os === 'windows' && DL.winRestore && s.win) DL.winRestore(d, s.win);
      }
      const lk = (l) => l.a.dev + '|' + l.a.port + '|' + l.b.dev + '|' + l.b.port;
      for (const k of ops.unlink || []) { const l = D.ops.links.find((x) => lk(x) === k); if (l) D.ops.removeLink(l); }
      for (const l of ops.link || []) {
        const r = D.ops.addLink(l.a, l.b, {});
        if (r.reason) denied.push('Cabo: ' + r.reason);
        else if (l.loose) r.link.loose = l.loose;
      }
      if (ops.dev || ops.link || ops.unlink) D.ops.recompute();
      if (ops.vms) D.infra.restoreVms(ops.vms);
    } catch (e) {
      console.error('multiplayer: alteração do convidado', e);
      denied.push('erro ao aplicar');
    } finally { Object.assign(B, keep); }
    if (denied.length) MP.conn.send({ t: 'denied', to: from, list: denied.slice(0, 6) });
  }

  /* ------------------------------------------------------------------ */
  /* GUEST: the world comes in                                           */
  /* ------------------------------------------------------------------ */
  // while the player is in the middle of an edit the world waits (moving an object, the hiring card…)
  const busy = () => { const B = D.builder.state; return !!(B && B.move) || D.crew.creatorOpen || B.lotBusy; };

  function startPlaying() {
    if (playing()) return;
    const title = document.getElementById('title');
    if (title && !title.hidden) { title.hidden = true; G.root.classList.remove('is-title'); D.scene.o.attract = false; }
    if (D.menu && D.menu.close) D.menu.close(true);
    D.choosePreset('zero');
    D.begin(false);
    D.setMode('explore');
  }

  function applyWorld(data, full) {
    MP.applying = true;
    try {
      const refused = SS.apply(D, data, { keepPlayer: !full });
      if (refused.length) console.warn('multiplayer: itens que não couberam aqui', refused);
    } catch (e) {
      console.error('multiplayer: mundo do anfitrião', e);
      toast('warn', 'Sala', 'Não foi possível montar o mundo do anfitrião');
    } finally { MP.applying = false; }
    MP.applied = structOf(snapshot());
    for (const d of D.ops.devices()) d.netState = d.state;
    for (const p of MP.players.values()) if (p.actor && !D.scene.actors.includes(p.actor)) D.scene.actors.push(p.actor);
    D.scene.refreshWorld(false);
  }

  function onSnap(m) {
    startPlaying();
    applyWorld(m.data, true);
    MP.latest = null;
    if (m.live) onLive(m.live);
    emit('ready', {});
  }
  function onStruct(m) {
    MP.latest = m;
    tryApplyLatest();
  }
  function tryApplyLatest() {
    const m = MP.latest;
    if (!m || !playing() || busy()) return;
    // an edit made since the last check goes out first (applying now would wipe it)
    checkLocalEdits();
    // our own changes still on their way: the host's next world will already have them
    if ((m.ack && m.ack[MP.id] || 0) < MP.seq) return;
    MP.latest = null;
    applyWorld(m.data, false);
  }

  function onLive(m) {
    if (!playing()) return;
    MP.hostDc = typeof m.dc === 'string' ? m.dc.slice(0, 40) : '';
    D.state.time = m.time;
    const co = D.economy.company;
    if (co.cash !== m.cash || (m.phase === 'live' && co.phase !== 'live') || m.month > co.month) D.economy.applyServer({ cash: m.cash, phase: m.phase, month: m.month });
    const byKey = new Map(D.crew.members.map((a) => [a.crew.saveKey, a]));
    for (const r of m.crew) {
      const a = byKey.get(r[0]);
      if (!a) continue;
      a.net = { x: r[1], y: r[2], dir: DIRS[r[3]], moving: !!r[4] };
      const c = a.crew;
      c.seated = !!r[5]; c.sitDir = r[6]; c.pose = r[7]; c.state = r[8];
      a.hidden = !!r[9]; a.alpha = r[10]; a.sortKey = r[11]; a.noShadow = !!r[12];
      a.bubble = r[13] ? { text: r[13], left: 3, tone: r[14] } : null;
      c.talkT = r[15] ? 1 : 0;
    }
    for (const [key, state, broken, out, fault] of m.dev) {
      const d = D.ops.get(key);
      if (!d) continue;
      d.state = d.netState = state; d.broken = !!broken; d.out = !!out;
      d.fault = fault ? Object.assign(d.fault || { at: D.scene.t }, fault) : null;
    }
  }

  // what this guest changed since the world it last received, as operations on that same snapshot
  function diffOps(a, b) {
    const ops = {};
    let n = 0;
    if (!same([a.lot, a.areas, a.walls, a.gaps, a.perf], [b.lot, b.areas, b.walls, b.gaps, b.perf])) { ops.layout = { lot: b.lot, areas: b.areas, walls: b.walls, gaps: b.gaps, perf: b.perf }; n++; }
    const rk = (r) => r.x + ',' + r.y + ',' + r.w + ',' + r.h;
    const ra = new Map(a.rooms.map((r) => [rk(r), JSON.stringify(r)]));
    const rooms = b.rooms.filter((r) => ra.get(rk(r)) !== JSON.stringify(r));
    if (rooms.length) { ops.rooms = rooms; n++; }
    const ia = new Map(a.items.map((i) => [i.uid, i])), ib = new Map(b.items.map((i) => [i.uid, i]));
    const add = b.items.filter((i) => !ia.has(i.uid)), del = a.items.filter((i) => !ib.has(i.uid)).map((i) => i.uid);
    const mod = b.items.filter((i) => ia.has(i.uid) && !same(ia.get(i.uid), i));
    if (add.length) { ops.add = add; n++; }
    if (del.length) { ops.del = del; n++; }
    if (mod.length) { ops.mod = mod; n++; }
    const ca = new Map(a.crew.map((c) => [c.key, c])), cb = new Map(b.crew.map((c) => [c.key, c]));
    const hire = b.crew.filter((c) => !ca.has(c.key)), fire = a.crew.filter((c) => !cb.has(c.key)).map((c) => c.key);
    const crew = b.crew.filter((c) => { const o = ca.get(c.key); return o && !same([o.shift, o.oncall, o.attend, o.zone], [c.shift, c.oncall, c.attend, c.zone]); })
      .map((c) => ({ key: c.key, shift: c.shift, oncall: c.oncall, attend: c.attend, zone: c.zone }));
    if (hire.length) { ops.hire = hire; n++; }
    if (fire.length) { ops.fire = fire; n++; }
    if (crew.length) { ops.crew = crew; n++; }
    // a device's state follows the host (live): only a change made here — the terminal — is an edit
    const da = new Map(a.devices.map((d) => [d.key, d])), noState = (d) => Object.assign({}, d, { state: 0 });
    const dev = b.devices.filter((d) => { const o = da.get(d.key), here = D.ops.get(d.key); return o && (!same(noState(o), noState(d)) || (here && here.netState && here.state !== here.netState)); });
    if (dev.length) { ops.dev = dev; n++; }
    const lk = (l) => l.a.dev + '|' + l.a.port + '|' + l.b.dev + '|' + l.b.port;
    const la = new Map(a.links.map((l) => [lk(l), l])), lb = new Map(b.links.map((l) => [lk(l), l]));
    const link = b.links.filter((l) => !la.has(lk(l)) || !same(la.get(lk(l)), l)), unlink = a.links.filter((l) => !lb.has(lk(l)) || !same(lb.get(lk(l)), l)).map(lk);
    if (link.length) { ops.link = link; n++; }
    if (unlink.length) { ops.unlink = unlink; n++; }
    if (!same(a.vms, b.vms)) { ops.vms = b.vms; n++; }
    return n ? ops : null;
  }

  function checkLocalEdits() {
    if (!MP.applied || MP.applying || !playing() || busy()) return;
    const cur = structOf(snapshot());
    const ops = diffOps(MP.applied, cur);
    MP.applied = cur;
    if (!ops) return;
    for (const d of D.ops.devices()) d.netState = d.state;
    MP.seq++;
    MP.conn.send({ t: 'ops', seq: MP.seq, ops });
  }

  /* ------------------------------------------------------------------ */
  /* team chat: the crew's lines come from the host, players talk to all */
  /* ------------------------------------------------------------------ */
  let relaying = false;
  function hookChat() {
    const chat = D.crew.chat;
    if (chat.mpHooked) return;
    chat.mpHooked = true;
    const post = chat.post;
    chat.post = function (who, text, opts) {
      // a guest's crew only says what the host's crew said
      if (MP.role === 'guest' && who && who.crew && !relaying) return null;
      const m = post.call(this, who, text, opts);
      if (MP.role === 'host' && m && who && who.crew) MP.conn.send({ t: 'crew-say', key: who.crew.saveKey || 0, text, tone: (opts && opts.tone) || 'chat' });
      return m;
    };
    G.on('team-say', (text) => {
      if (!MP.role || relaying) return;
      MP.conn.send({ t: 'say', text: String(text).slice(0, 160) });
    });
  }
  function onSay(m) {
    const p = MP.players.get(m.from);
    if (!p) return;
    const r = DL.ROLES[(p.look && p.look.role) || ''] || {};
    D.crew.chat.post({ name: p.name, color: r.color || '#ffffff', role: p.role === 'host' ? 'Anfitrião' : 'Jogador' }, m.text, { tone: 'chat' });
    if (p.actor) p.actor.bubble = { text: m.text.length > 64 ? m.text.slice(0, 61) + '…' : m.text, left: Math.min(6, 2.4 + m.text.length * 0.045), tone: 'chat' };
    // on the host, the crew hears a guest just like the host's own player ("Ana, vá para a Recepção")
    if (MP.role === 'host') { relaying = true; try { G.emit('team-say', m.text); } finally { relaying = false; } }
  }
  function onCrewSay(m) {
    const a = D.crew.members.find((x) => x.crew.saveKey === m.key);
    relaying = true;
    try { D.crew.chat.post(a || { name: 'Equipe', color: '#dadbdf' }, m.text, { tone: m.tone }); } finally { relaying = false; }
  }

  /* ------------------------------------------------------------------ */
  /* saving: the room's world is the host's game, kept in the host's account */
  /* (the same cloud save as solo; its autosave keeps running)            */
  /* ------------------------------------------------------------------ */
  let saving = null;
  function saveWorld() {
    if (MP.role !== 'host' || !playing()) return Promise.resolve({ ok: false, message: 'Nada para salvar agora.' });
    if (saving) return saving;
    saving = (async () => {
      if (!DL.CloudSync) return { ok: false, message: 'Sem conexão com o servidor do DataLab.' };
      const s = await DL.CloudSync.ensureSlot();
      if (!s.ok) return s;
      // an autosave on its way: wait for it, then save the latest world
      for (let i = 0; i < 40 && SS.busy; i++) await new Promise((res) => setTimeout(res, 250));
      return SS.save({});
    })();
    try { return saving; } finally { saving.then(() => { saving = null; }); }
  }

  /* ------------------------------------------------------------------ */
  /* session                                                             */
  /* ------------------------------------------------------------------ */
  function tick(dt) {
    if (!MP.role || !MP.conn || !MP.conn.open || !playing()) return;
    const t = MP.t;
    for (const k in t) t[k] += dt;
    // local character
    if (t.pos >= POS_EVERY) { t.pos = 0; sendPos(t.keep >= 2); if (t.keep >= 2) t.keep = 0; }
    if (MP.role === 'host') {
      const guests = MP.players.size > 0;
      if (guests && (t.struct >= STRUCT_EVERY || MP.dirty)) { t.struct = 0; MP.dirty = false; pushStruct(false); }
      if (guests && t.live >= LIVE_EVERY && MP.conn.backlog < 256 * 1024) { t.live = 0; MP.conn.send(liveRows()); }
      for (const q of MP.pendingSync.splice(0)) sendSnap(q);
    } else {
      if (t.check >= 0.3) { t.check = 0; checkLocalEdits(); tryApplyLatest(); }
    }
    for (const p of MP.players.values()) {
      if (!p.actor) continue;
      if (p.actor.net) glide(p.actor, p.actor.net, dt);
      DL.remoteEmoteUpdate(p.actor, dt);
    }
  }

  // a guest's frame: its crew moves where the host's crew is (crew.update doesn't run here)
  function guestUpdate(dt) {
    for (const a of D.crew.members) {
      if (a.net) glide(a, a.net, dt);
      if (a.bubble && (a.bubble.left -= dt) <= 0) a.bubble = null;
      a.tick(dt);
    }
    D.crew.chat.update(dt);
  }

  function sendSnap(to) {
    if (!playing()) { MP.pendingSync.push(to); return; }
    const data = snapshot();
    const st = structOf(data);
    MP.hash = hashOf(st);
    MP.conn.send({ t: 'snap', to, rev: ++MP.rev, data, live: liveRows() });
  }

  function wire(conn, role) {
    conn.on('welcome', (m) => {
      MP.id = m.id; MP.role = role; MP.room = m.room; MP.hostId = m.hostId;
      for (const p of m.players) upsertPlayer(p);
      hookChat();
      loadAccountLevel();
      if (role === 'guest') {
        G.guest = { update: guestUpdate };
        conn.send({ t: 'sync' });
      } else {
        MP.dirty = true;
      }
      sendLook();
      emit('state', { open: true });
    });
    conn.on('roster', (m) => {
      const ids = new Set(m.players.map((p) => p.id));
      for (const id of Array.from(MP.players.keys())) if (!ids.has(id)) removePlayer(id);
      for (const p of m.players) upsertPlayer(p);
      emit('roster', {});
    });
    conn.on('join', (m) => {
      upsertPlayer({ id: m.id, name: m.name, role: 'guest' });
      toast('info', 'Sala', m.name + ' entrou');
      relaying = true;
      try { D.crew.chat.post({ name: 'Sala', color: '#7ee0a1' }, m.name + ' entrou no datacenter.', { tone: 'ok' }); } finally { relaying = false; }
      sendPos(true);
    });
    conn.on('leave', (m) => {
      removePlayer(m.id);
      toast('warn', 'Sala', m.name + ' saiu' + (m.why && m.why !== 'closed' ? ' (' + m.why + ')' : ''));
      relaying = true;
      try { D.crew.chat.post({ name: 'Sala', color: '#ffc285' }, m.name + ' saiu da sala.', { tone: 'warn' }); } finally { relaying = false; }
      // the host keeps the world safe whenever someone leaves
      if (MP.role === 'host') { delete MP.acks[m.id]; if (Date.now() - MP.savedAt > 10000) saveWorld(); }
      emit('roster', {});
    });
    conn.on('pos', onPos);
    conn.on('look', (m) => { upsertPlayer({ id: m.from, look: m.look }); emit('roster', {}); });
    conn.on('say', onSay);
    conn.on('emote', onEmote);
    // voice chat (voice.js): the call handshake and who is talking
    conn.on('vsig', (m) => emit('voice', m));
    conn.on('vtalk', (m) => emit('voice', m));
    if (role === 'host') {
      conn.on('sync', (m) => { sendSnap(m.from); sendPos(true); });
      conn.on('ops', (m) => {
        if (!playing()) return;
        applyOps(m.ops || {}, m.from);
        MP.acks[m.from] = Math.max(MP.acks[m.from] || 0, m.seq | 0);
        // always answer: even a refused change has to go back to how the world really is
        pushStruct(true);
      });
      conn.on('lot', async (m) => {
        // land bought by a guest: charged here exactly like the host's own expansion
        let r;
        if (G.cloudLot) { r = await G.cloudLot(m.dw, m.dh, D.builder.api.builtArea()); if (r && r.ok) D.builder.api.resizeLot(m.dw, m.dh, false); }
        else r = { ok: D.builder.api.buyLot(m.dw, m.dh) };
        if (r && r.ok === false && !r.message) r.message = 'Expansão recusada';
        conn.send({ t: 'lot-r', to: m.from, req: m.req, ok: !!(r && r.ok), message: r && r.message });
        pushStruct(true);
      });
    } else {
      conn.on('snap', onSnap);
      conn.on('struct', onStruct);
      conn.on('live', onLive);
      conn.on('crew-say', onCrewSay);
      conn.on('denied', (m) => toast('warn', 'O anfitrião recusou', m.list.join(' · ')));
      conn.on('lot-r', (m) => { const w = lotWait.get(m.req); if (w) { lotWait.delete(m.req); w(m); } });
    }
    conn.on('close', (ev) => onClose(ev, role));
  }

  // land on a guest: the host pays (G.cloudLot is what build.js asks before growing the lot)
  const lotWait = new Map();
  let lotReq = 0;
  function guestLot(dw, dh) {
    const req = ++lotReq;
    MP.conn.send({ t: 'lot', dw, dh, req });
    return new Promise((res) => {
      lotWait.set(req, (m) => res(m.ok ? { ok: true } : { ok: false, message: m.message || 'Expansão recusada pelo anfitrião' }));
      setTimeout(() => { if (lotWait.delete(req)) res({ ok: false, message: 'O anfitrião não respondeu' }); }, 8000);
    });
  }

  function resetSession() {
    for (const p of MP.players.values()) dropActor(p);
    MP.players.clear();
    // a guest's copy of the world never becomes its own: it stays still until the page goes back to the
    // menu (its crew carries the host's jobs, which this game can't run)
    if (MP.role === 'guest') G.guest = { update() {} };
    else if (MP.role === 'host') G.guest = null;
    MP.role = null; MP.conn = null; MP.id = null; MP.applied = null; MP.latest = null; MP.acks = {}; MP.seq = 0; MP.hash = ''; MP.pendingSync = [];
  }

  // closed by the host for a reason that another try won't change
  const FINAL = { 4000: 1, 4001: 1, 4002: 1, 4004: 1, 4005: 1, 4006: 1, 4008: 1, 4010: 1 };
  const RETRIES = 5;
  function onClose(ev, role) {
    // our own leave() already cleaned up
    if (ev.clean || MP.stopped) return;
    const code = ev.code, inRoom = MP.role === role, back = MP.back;
    if (role === 'host') {
      if (!inRoom) { MP.conn = null; emit('fail', { code, reason: ev.reason || 'Não foi possível abrir a sala' }); return; }
      // the room couldn't go on: this game goes on, solo (the cloud autosave keeps working)
      resetSession();
      emit('state', { open: false });
      toast('warn', 'Sala encerrada', 'A sala caiu · o jogo continua no modo solo');
      return;
    }
    // a guest that never got in: the lobby says why
    if (!inRoom && !back) { MP.conn = null; emit('fail', { code, reason: ev.reason || 'Não foi possível conectar à sala' }); return; }
    // a guest that was in (or is trying to get back in): the network dropped → try again a few times
    if (inRoom) resetSession();
    const tries = back ? back.n : 0;
    if (!FINAL[code] && tries < RETRIES) {
      MP.back = { n: tries + 1 };
      emit('reconnecting', { n: tries + 1, of: RETRIES });
      setTimeout(() => { if (!MP.stopped && MP.back) connectGuest(MP.addr, MP.pass); }, 1000 + tries * 1000);
      return;
    }
    MP.back = null;
    // getting back in found no room: the host closed the game (or lost the internet)
    if (back && code === 4004) { emit('ended', { reason: 'O anfitrião saiu do jogo' }); return; }
    emit('ended', { reason: ev.reason || (code === 4005 ? 'O anfitrião encerrou a sala' : 'A conexão com a sala caiu') });
  }

  /* ------------------------------------------------------------------ */
  /* public API (lobby.js)                                               */
  /* ------------------------------------------------------------------ */
  function host(opts) {
    if (MP.role) return;
    MP.stopped = false;
    const conn = DL.Net.hostRoom({ name: opts.name, pass: opts.pass || '' }, { name: myName(), look: myLook() });
    MP.conn = conn;
    wire(conn, 'host');
  }
  function connectGuest(code, pass) {
    MP.addr = code; MP.pass = pass || '';
    const conn = DL.Net.joinRoom(code, { name: myName(), look: myLook(), pass: pass || '' });
    MP.conn = conn;
    wire(conn, 'guest');
    conn.on('snap', () => { MP.back = null; });
  }
  function join(text, pass) {
    if (MP.role) return;
    const code = DL.Net.parseCode(text);
    if (!code) { emit('fail', { reason: 'código de sala inválido' }); return; }
    MP.stopped = false;
    MP.back = null;
    connectGuest(code, pass);
  }
  async function leave() {
    if (!MP.role) return;
    MP.stopped = true;
    MP.back = null;
    if (MP.role === 'host') await saveWorld();
    const c = MP.conn;
    if (c) c.close();
    resetSession();
    emit('state', { open: false });
  }

  // guests don't save: the world belongs to the host (and the cloud save is the host's account)
  const GUEST_SAVE = { ok: false, code: 'guest', message: 'Na sala de outra pessoa, quem salva o mundo é o anfitrião.' };
  const save = SS.save;
  SS.save = async function (o) {
    if (MP.role === 'guest') return GUEST_SAVE;
    const r = await save.call(this, o);
    if (MP.role === 'host' && r.ok) { MP.savedAt = Date.now(); emit('saved', r); }
    return r;
  };
  if (DL.CloudSync) {
    const ensure = DL.CloudSync.ensureSlot;
    DL.CloudSync.ensureSlot = function () { return MP.role === 'guest' ? Promise.resolve(GUEST_SAVE) : ensure.apply(this, arguments); };
  }

  // the build tools tell the guest's edits apart (world events while the host's world is applied are not edits)
  G.on('world', () => { if (MP.role === 'host') MP.dirty = true; });
  G.on('player-look', sendLook);
  G.on('look-extras', sendLook);
  G.on('player-emote', sendEmote);

  // runs inside the game loop (demo.js step)
  G.on('step', tick);
  // the game loop stops in a hidden tab (requestAnimationFrame); a host's world can't stop for everyone
  // else, so while hosting it keeps going on a timer (browsers run it at least once a second)
  let bgLast = performance.now();
  setInterval(() => {
    const now = performance.now(), sec = Math.min(2, (now - bgLast) / 1000);
    bgLast = now;
    if (MP.role === 'host' && document.hidden && playing()) D.advance(sec, 0.05);
  }, 250);

  // land through the host while a guest (build.js checks game.cloudLot; cloud-sync.js sets the account's)
  let cloudLot = G.cloudLot || null;
  Object.defineProperty(G, 'cloudLot', {
    configurable: true,
    get() { return MP.role === 'guest' ? guestLot : cloudLot; },
    set(fn) { cloudLot = fn; },
  });

  DL.MP = {
    host, join, leave, saveWorld,
    on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); },
    kick(id) { if (MP.role === 'host') MP.conn.send({ t: 'kick', id }); },
    // voice chat (voice.js): a message to the room ({ to } for one player)
    send(m) { return !!(MP.role && MP.conn && MP.conn.open && MP.conn.send(m)); },
    get role() { return MP.role; },
    get id() { return MP.id; },
    get room() { return MP.room; },
    // the host's datacenter name (guests show it on the sign outside)
    get hostDc() { return MP.role === 'guest' ? MP.hostDc || '' : ''; },
    get rtt() { return MP.conn ? MP.conn.rtt : 0; },
    get savedAt() { return MP.savedAt; },
    players() {
      const me = { id: MP.id, name: myName(), role: MP.role, me: true, look: myLook() };
      return [me].concat(Array.from(MP.players.values()).map((p) => ({ id: p.id, name: p.name, role: p.role, look: p.look })))
        .sort((a, b) => (a.role === 'host' ? -1 : 0) - (b.role === 'host' ? -1 : 0));
    },
    // exposed for automated checks
    _: { structOf, hashOf, diffOps, applyOps, state: MP },
  };
})();
