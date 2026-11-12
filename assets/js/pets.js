/* DataLab — the pet: the companion equipped in the inventory (slot 'pet', one at a time) walks behind
   the player and stops when the player stops. It is an Actor for drawing and depth sorting (scene.js /
   iso.js), never a crew member: nothing else in the game sees it. Frames: DL.petSheet (cosmetics.js). */
(function () {
  'use strict';
  const DL = window.DL;
  const GAP = 13; // how far behind the player it settles (world px)

  DL.createPet = function (game) {
    const scene = game.scene, player = game.player;
    const P = { kind: null, actor: null, anim: 0, stuck: 0, still: 0, hanging: false, parts: [], emit: 0, nc: 0, fxT: 0 };
    const rnd = (a, b) => a + Math.random() * (b - a);
    // Guaca.exe: every ~7 s standing still, the pit hops out, flips and lands back (0..1 while in the air)
    const pitHop = (a) => { const ph = P.anim % 7; return !a.moving && P.kind === 'guaca' && ph > 5 && ph < 6.2 ? (ph - 5) / 1.2 : -1; };
    // a floor spot the pet can stand on (its feet a little above the point, like a person's) — on the
    // street's sidewalk when the player has gone outside (street.js)
    const outside = () => !!(DL.Street && DL.Street.outside);
    const free = (x, y) => !(outside() ? DL.Street.scene : scene).solidAt(x, y - 2);

    function make(kind) {
      // an Actor without a character sheet: frame() comes from the pet sheet
      const a = Object.create(DL.Actor.prototype);
      Object.assign(a, { x: player.x - GAP, y: player.y, vx: 0, vy: 0, dir: 'right', dist: 0, moving: false, blinkIn: 99, blinkT: 0, pet: kind });
      const sheet = DL.petSheet(kind);
      a.frame = function () {
        const s = this.dir === 'left' ? sheet.left : sheet.right;
        // the Gato Glitch "fails" now and then: a few frames in other colours
        if (s.glitch && DL.hash(Math.floor(P.anim * 5) * 13 + 7) < 0.08) return s.glitch[Math.floor(P.anim * 10) % 2];
        if (P.hanging && s.hang) return s.hang[Math.floor(P.anim * 2) % s.hang.length];
        if (s.noPit && pitHop(this) >= 0) return s.noPit[Math.floor(P.anim * 3) % 2];
        return this.moving ? s.walk[Math.floor(Math.abs(this.dist) / 4) % 4] : s.idle[Math.floor(P.anim * 3) % 2];
      };
      // silly effects, drawn by iso.js over the frame (X, Y: the feet)
      a.fx = function (g, X, Y) {
        const s = this.dir === 'left' ? sheet.left : sheet.right, right = this.dir !== 'left';
        const dt = Math.min(0.05, Math.max(0, P.anim - P.fxT)), ox = X - DL.CHAR.AX, oy = Y - DL.CHAR.AY, ga = g.globalAlpha;
        P.fxT = P.anim;
        if (kind === 'dracache' && this.moving) {
          for (P.emit -= dt; P.emit <= 0; P.emit += 0.035) P.parts.push({ k: 'p', x: ox + 11 + rnd(-2, 2), y: oy + 17 + rnd(-2, 2), vx: rnd(-3, 3), vy: rnd(-1, 5), age: 0, life: rnd(0.6, 1.1) });
        }
        if (kind === 'sudo' && (P.emit -= dt) <= 0) {
          P.emit = 0.9;
          P.parts.push({ k: 'n', x: ox + (right ? 16 : 3), y: oy + 13, vx: 0, vy: -7, age: 0, life: 1.9, c: P.nc++ % 3 });
        }
        for (const p of P.parts) { p.age += dt; p.x += p.vx * dt; p.y += p.vy * dt; }
        P.parts = P.parts.filter((p) => p.age < p.life);
        const SPARK = ['#f0d6ff', '#c084fc', '#8b5cf6', '#5b2ea8'];
        for (const p of P.parts) {
          const r = p.age / p.life;
          if (p.k === 'p') { g.globalAlpha = ga * (1 - r * 0.8); g.fillStyle = SPARK[Math.min(3, Math.floor(r * 4))]; g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1); }
          else { g.globalAlpha = ga * (r < 0.65 ? 1 : 1 - (r - 0.65) / 0.35); g.drawImage(s.notes[p.c], Math.round(p.x + Math.sin(p.age * 4.5) * 1.4), Math.round(p.y)); }
        }
        g.globalAlpha = ga;
        const k = pitHop(this);
        if (k >= 0) {
          const i = Math.floor(P.anim * 3) % 2, v = k < 0.1 || k > 0.9 ? 0 : Math.floor(k * 12) % 4;
          g.drawImage(s.pit[v], ox + 8, oy + 18 + i - Math.round(Math.sin(Math.PI * k) * 11));
        }
      };
      return a;
    }
    function remove() {
      if (!P.actor) return;
      scene.actors = scene.actors.filter((x) => x !== P.actor);
      P.actor = null;
      P.kind = null;
      scene.refreshWorld(false);
    }
    // the equipped pet (inventory.js keeps it in DL.Skins.equipped.pet)
    function sync() {
      const id = DL.Skins.equipped.pet, it = id ? DL.cosmetic(id) : null, kind = it ? it.value : null;
      if (kind === P.kind) return;
      remove();
      if (!kind) return;
      P.kind = kind;
      Object.assign(P, { hanging: false, still: 0, parts: [], emit: 0 });
      P.actor = make(kind);
      scene.actors.push(P.actor);
      scene.refreshWorld(false);
    }

    function update(dt) {
      const a = P.actor;
      // the loop's first frame can hand a dt ≤ 0 (its rAF timestamp predates its start time)
      if (!a || !(dt > 0)) return;
      P.anim += dt;
      // it is only there when the player is (title screen, hidden while sitting in some views)
      a.hidden = !!player.hidden;
      if (!scene.actors.includes(a)) { scene.actors.push(a); scene.refreshWorld(false); }
      // the spot behind the player, on the side they came from — or beside them, or at their feet:
      // never inside a wall or a piece of furniture
      const back = { down: [0, -1], up: [0, 1], left: [1, 0], right: [-1, 0] }[player.dir] || [0, -1];
      const spots = [[back[0] * GAP, back[1] * GAP], [back[1] * GAP, back[0] * GAP], [-back[1] * GAP, -back[0] * GAP], [back[0] * 6, back[1] * 6], [0, 0]];
      const spot = spots.find(([ox, oy]) => free(player.x + ox, player.y + oy)) || [0, 0];
      let tx = player.x + spot[0], ty = player.y + spot[1];
      // Drácache: once the player has stopped, it flies to the nearest rack close by and hangs from it
      P.still = player.moving ? 0 : P.still + dt;
      if (player.moving) P.hanging = false;
      let perch = null;
      if (P.kind === 'dracache' && P.still > 0.5 && !outside()) {
        const T = DL.T;
        for (const e of scene.world.items) {
          if (e.kind !== 'rack') continue;
          const x = e.px + T / 2, y = e.py + e.th * T + 2;
          if (Math.hypot(x - player.x, y - player.y) < 70 && free(x, y) && (!perch || Math.hypot(x - a.x, y - a.y) < Math.hypot(perch[0] - a.x, perch[1] - a.y))) perch = [x, y];
        }
        if (perch) { tx = perch[0]; ty = perch[1]; }
      }
      if (P.hanging) return;
      const dx = tx - a.x, dy = ty - a.y, d = Math.hypot(dx, dy);
      if (d > 160) { a.x = tx; a.y = ty; a.moving = false; return; } // left far behind (a teleport, a new game)
      if (perch && d < 1.5) { a.x = tx; a.y = ty; a.moving = false; P.hanging = true; return; }
      // it settles on its spot, then waits there (idle animation) until the player moves on
      if (!perch && (d < 3 || (!player.moving && !a.moving && d < 9))) { a.moving = false; return; }
      const sp = Math.min(d * 5, 95) * dt, step = Math.min(sp, d);
      if (!a.moving) a.dist = 0;
      // walk on the floor: slide along a wall when the straight line is blocked, hop over when stuck
      const nx = a.x + (dx / d) * step, ny = a.y + (dy / d) * step, ox = a.x, oy = a.y;
      if (free(nx, ny)) { a.x = nx; a.y = ny; }
      else if (free(nx, a.y)) a.x = nx;
      else if (free(a.x, ny)) a.y = ny;
      P.stuck = Math.hypot(a.x - ox, a.y - oy) < step * 0.3 ? P.stuck + dt : 0;
      if (P.stuck > 0.35) { a.x = tx; a.y = ty; P.stuck = 0; }
      a.dist += step;
      a.moving = true;
      if (Math.abs(dx) > 0.5) a.dir = dx < 0 ? 'left' : 'right';
    }

    game.on('inventory', sync);
    sync();
    return { update, sync, get actor() { return P.actor; } };
  };
})();
