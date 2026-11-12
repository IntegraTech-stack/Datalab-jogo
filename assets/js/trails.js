/* DataLab — trails (Rastros): an effect left on the floor while a character walks, gone after a second or
   two. One trail equipped at a time (inventory slot 'trail'); other players in an online room see it too
   (multiplayer.js sends the trail with the look). The shop sells six simple ones (cosmetics.js, tab
   Rastros); the season pass (battlepass.js) gives seven fancier ones: more particles, more motion, glow and
   its gold. Particles are born from the distance walked (never from the frame rate), a few pixels behind the
   feet (so the character never hides them), and are capped on screen, so a room full of players never
   slows the game down. A particle is plain numbers: where and when it was born and how it moves — its state
   at any age is computed, so the shop preview draws the same effect without simulating anything. Drawn in
   the scene's underlay (demo.js), on the isometric floor, under people and furniture.
   Also here: the season pass' Aura Boot (slot 'aura'): golden particles rising around the character and a
   ring of light at the feet, drawn with the character (iso.js / sprites.js drawActor → DL.drawAuraBoot). */
(function () {
  'use strict';
  const DL = window.DL;
  const R = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const MAX = 220; // particles on screen, all trails together
  const BEHIND = 4; // world px behind the feet where a particle is born
  const PAL = {
    turq: '#2de2c8', turqL: '#a5f7ea', turqD: '#14897a', blue: '#3d7bd9', blueL: '#7fb2f0', blueD: '#21477f', slate: '#56657d', slateL: '#8797b0',
    navy: '#0b1730', navyL: '#1a2b4d', ice: '#b8f3ff', white: '#ffffff',
    gold: '#f2b51e', goldL: '#ffe680', goldD: '#bd7c10', goldW: '#fff8d6', red: '#ff4d5e',
  };
  const RAINBOW = ['#ff4d5e', '#ff9a2e', '#ffe14d', '#4dff88', '#3fc8ff', '#9b6bff'];
  const CODE = 'DATALB01<>_/';
  const rgba = (hex, a) => 'rgba(' + parseInt(hex.slice(1, 3), 16) + ',' + parseInt(hex.slice(3, 5), 16) + ',' + parseInt(hex.slice(5, 7), 16) + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')';
  const glyph = (g, ch, x, y, c) => { if (DL.pixText) DL.pixText(g, ch, x, y, c); };
  // a soft square of light around a point (cheap: two rects)
  const halo = (g, X, Y, r, hex, a) => { R(g, X - r, Y - r + 1, r * 2 + 1, r * 2 - 1, rgba(hex, a * 0.5)); R(g, X - r + 1, Y - r, r * 2 - 1, r * 2 + 1, rgba(hex, a * 0.5)); };
  // the Rastro Relâmpago's zigzags, one per frame: each step goes 1 px up and 1 px out (+1), back (-1) or
  // straight (0), so the bolt is clean pixel diagonals
  const BOLT = [
    [0, 1, 1, 0, -1, -1, -1, 0, 1, 1, 1],
    [1, 1, 0, -1, -1, 0, 1, 1, 1, 0, -1],
    [0, -1, 0, 1, 1, 1, 0, -1, -1, 0, 1],
    [1, 0, -1, -1, 0, 1, 1, 0, -1, -1, 0],
  ];
  // a 4-point sparkle
  const star = (g, X, Y, hex, a, big) => { R(g, X - 1, Y, 3, 1, rgba(hex, a)); R(g, X, Y - 1, 1, 3, rgba(hex, a)); if (big) { R(g, X - 2, Y, 5, 1, rgba(hex, a * 0.55)); R(g, X, Y - 2, 1, 5, rgba(hex, a * 0.55)); R(g, X, Y, 1, 1, rgba(PAL.white, a)); } };

  // p: { x, y, h, vx, vy, vh, gh, life, s (seed 0..1), flat, f (draw) }
  // pos(p, age) → world x, y and the height above the floor
  function pos(p, age) {
    let h = (p.h || 0) + (p.vh || 0) * age + 0.5 * (p.gh || 0) * age * age;
    if (h < 0) h = 0;
    return [p.x + (p.vx || 0) * age, p.y + (p.vy || 0) * age, h];
  }

  /* ------------------------------------------------------------------ */
  /* The effects. every: world px walked between births; spawn(add,…)    */
  /* adds particles behind the feet (x, y) walking along (dx, dy); i      */
  /* counts the steps, r(k) is a seeded random number for that step.     */
  /* ------------------------------------------------------------------ */
  const FX = {
    // ---------- shop: simple ----------
    steps: { every: 7, spawn(add, x, y, dx, dy, i) {
      // a footprint on each side, turquoise, fading
      const side = i % 2 ? 2 : -2;
      add({ x: x - dy * side, y: y + dx * side, life: 1.8, flat: true, f(g, X, Y, h, k) {
        const a = 1 - k * k;
        R(g, X - 1, Y - 1, 3, 3, rgba(PAL.turqD, 0.7 * a)); R(g, X - 1, Y - 1, 2, 2, rgba(PAL.turq, 0.85 * a)); R(g, X, Y - 3, 2, 1, rgba(PAL.turqL, 0.8 * a));
      } });
    } },
    dust: { every: 5, spawn(add, x, y, dx, dy, i, r) {
      for (let j = 0; j < 3; j++) add({ x: x + (r(j) - 0.5) * 6, y: y + (r(j + 9) - 0.5) * 3, h: r(j), vx: (r(j + 4) - 0.5) * 10 - dx * 5, vh: 7 + r(j + 6) * 6, life: 1.1, s: r(j + 8),
        f(g, X, Y, h, k, p) { const s = k < 0.4 ? 2 : 1; R(g, X, Y - h, s, s, rgba(p.s > 0.5 ? PAL.slateL : '#c3ccd9', 0.9 * (1 - k))); } });
    } },
    stars: { every: 8, spawn(add, x, y, dx, dy, i, r) {
      for (let j = 0; j < 2; j++) add({ x: x + (r(j) - 0.5) * 10, y: y + (r(j + 2) - 0.5) * 4, h: 2 + r(j + 4) * 6, vh: 2, life: 1.5, s: r(j + 6), f(g, X, Y, h, k, p, t) {
        const a = 1 - k, tw = Math.sin(t * 12 + p.s * 9) > 0.1;
        star(g, X, Y - h, p.s > 0.5 ? PAL.ice : PAL.blueL, a, tw);
      } });
    } },
    bubbles: { every: 8, spawn(add, x, y, dx, dy, i, r) {
      add({ x: x + (r(0) - 0.5) * 8, y, h: 2, vh: 10 + r(1) * 5, vx: (r(2) - 0.5) * 5, life: 1.5, s: r(3), f(g, X, Y, h, k) {
        const y0 = Y - h;
        if (k > 0.86) { const d = 1 + (k - 0.86) * 24; for (const [ox, oy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) R(g, X + ox * d, y0 + oy * d, 1, 1, rgba(PAL.ice, 1 - k)); return; }
        R(g, X - 1, y0 - 2, 3, 1, rgba(PAL.blueL, 0.9)); R(g, X - 1, y0 + 2, 3, 1, rgba(PAL.blueL, 0.9));
        R(g, X - 2, y0 - 1, 1, 3, rgba(PAL.blueL, 0.9)); R(g, X + 2, y0 - 1, 1, 3, rgba(PAL.blueL, 0.9));
        R(g, X - 1, y0 - 1, 3, 3, rgba(PAL.blue, 0.18)); R(g, X - 1, y0 - 1, 1, 1, rgba(PAL.white, 0.85));
      } });
    } },
    smoke: { every: 6, spawn(add, x, y, dx, dy, i, r) {
      add({ x: x - dx * 2, y: y - dy * 2, h: 3, vh: 4 + r(0) * 2, vx: -dx * 6 + (r(1) - 0.5) * 4, vy: -dy * 3, life: 1.7, f(g, X, Y, h, k) {
        const s = 3 + Math.round(k * 4);
        R(g, X - s / 2, Y - h - s / 2, s, s - 1, rgba(PAL.slateL, 0.5 * (1 - k)));
        R(g, X - s / 2 + 1, Y - h - s / 2 - 1, s - 2, 1, rgba('#c3ccd9', 0.4 * (1 - k)));
      } });
    } },
    lights: { every: 6, spawn(add, x, y, dx, dy, i, r) {
      add({ x: x + (r(0) - 0.5) * 10, y: y + (r(1) - 0.5) * 3, h: 4 + r(2) * 10, vh: 1.5, life: 2, f(g, X, Y, h, k) {
        const a = 1 - k * k;
        halo(g, X, Y - h, 2, PAL.blue, 0.45 * a);
        R(g, X, Y - h, 2, 2, rgba(PAL.blueL, a)); R(g, X, Y - h, 1, 1, rgba(PAL.white, a));
      } });
    } },

    // ---------- season pass: more particles, motion, glow and gold ----------
    binary: { every: 6, spawn(add, x, y, dx, dy, i, r) {
      // a 0 or 1 falls from the air, lands where the foot was and glows there, with a golden spark
      add({ x: x + (r(0) - 0.5) * 8, y, h: 16 + r(1) * 6, vh: -30, life: 1.7, s: r(2), f(g, X, Y, h, k, p) {
        const ch = p.s > 0.5 ? '1' : '0', landed = h <= 0, a = landed ? 1 - k : 1, gold = p.s > 0.7;
        if (landed) { halo(g, X, Y - 3, 3, gold ? PAL.gold : PAL.turq, 0.45 * a); R(g, X - 2, Y, 5, 1, rgba(gold ? PAL.goldL : PAL.turq, 0.8 * a)); }
        else R(g, X, Y - h - 8, 1, 3, rgba(PAL.turq, 0.35));
        glyph(g, ch, X - 1, Y - h - 5, rgba(gold ? PAL.goldL : landed ? PAL.turqL : PAL.ice, a));
      } });
      if (i % 3 === 0) add({ x: x + (r(3) - 0.5) * 6, y, h: 1, vh: 9, life: 0.7, f(g, X, Y, h, k) { star(g, X, Y - h, PAL.goldL, 1 - k, k < 0.3); } });
    } },
    sparks: { every: 5, spawn(add, x, y, dx, dy, i, r) {
      // golden sparks jump and fall, each with a little tail; every few steps a lightning bolt cracks the floor
      for (let j = 0; j < 4; j++) add({ x, y, h: 1, vx: (r(j) - 0.5) * 60, vy: (r(j + 4) - 0.5) * 18, vh: 26 + r(j + 8) * 24, gh: -150, life: 0.6, s: r(j + 12), f(g, X, Y, h, k, p) {
        const c = p.s > 0.66 ? PAL.white : p.s > 0.33 ? PAL.goldL : PAL.gold;
        R(g, X, Y - h, 2, 2, rgba(c, 1 - k * 0.5));
        R(g, X - Math.sign(p.vx), Y - h + 2, 1, 1, rgba(PAL.goldD, 0.7 * (1 - k)));
      } });
      if (i % 3 === 0) add({ x, y, life: 0.3, s: r(16), f(g, X, Y, h, k, p) {
        let px = X;
        halo(g, X, Y - 5, 4, PAL.gold, 0.35 * (1 - k));
        for (let s = 0; s < 6; s++) { R(g, px, Y - 2 - s * 2, 1, 2, s % 2 ? PAL.goldL : PAL.white); px += (DL.hash(p.s * 97 + s) > 0.5 ? 1 : -1); }
        R(g, X - 3, Y, 7, 1, rgba(PAL.goldL, 0.7));
      } });
    } },
    bolt: { every: 7, spawn(add, x, y, dx, dy, i, r) {
      // little golden lightning bolts leap out of the feet in a zigzag, flicker fast and are gone in a
      // second; the zigzag jumps between 4 shapes (the frames) while it lives
      for (let j = 0; j < 2; j++) add({ x: x + (j ? 2 : -2), y, life: 1, s: r(j + 2), side: j ? 1 : -1, len: 8 + Math.round(r(j + 6) * 3), f(g, X, Y, h, k, p, t) {
        const fr = Math.floor(t * 18 + p.s * 4) % 4;
        if (k > 0.25 && fr === 3) return; // the flicker
        // the shape of this frame, mirrored to its side of the foot, drawn pixel by pixel from the foot up
        const path = BOLT[(fr + Math.floor(p.s * 4)) % 4], n = Math.min(path.length, p.len);
        const grow = Math.min(n, Math.ceil(k * 10 * n)), from = k > 0.6 ? Math.floor(((k - 0.6) / 0.4) * n) : 0;
        const core = k < 0.18 ? PAL.white : k < 0.5 ? PAL.goldW : PAL.goldL, edge = k < 0.5 ? PAL.gold : PAL.goldD;
        let px = X, py = Y - 1;
        for (let s = 0; s < grow; s++) {
          px += path[s] * p.side; py -= 1;
          if (s >= from) { R(g, px + p.side, py, 1, 1, edge); R(g, px, py, 1, 1, core); }
        }
        if (k < 0.4 && grow >= n) star(g, px, py - 1, PAL.goldW, 1 - k * 2, fr === 0);
      } });
      // the flash on the floor where the foot was
      add({ x, y, life: 0.22, flat: true, f(g, X, Y, h, k) { const a = 1 - k; R(g, X - 3, Y, 7, 1, rgba(PAL.goldL, 0.8 * a)); R(g, X - 1, Y - 1, 3, 3, rgba(PAL.goldW, 0.6 * a)); } });
      // and now and then a turquoise spark jumps off
      if (i % 4 === 1) add({ x, y, h: 3, vx: (r(8) - 0.5) * 40, vh: 30 + r(9) * 16, gh: -120, life: 0.7, s: r(10), f(g, X, Y, h, k, p, t) {
        star(g, X, Y - h, k < 0.3 ? PAL.white : PAL.turq, 1 - k, Math.sin(t * 30 + p.s * 9) > 0);
        R(g, X, Y - h + 2, 1, 1, rgba(PAL.turqL, 0.6 * (1 - k)));
      } });
    } },
    ghost: { every: 8, spawn(add, x, y, dx, dy, i, r) {
      // see-through blue footprints, and a little ghost of light rising off each one
      const side = i % 2 ? 2 : -2, fx = x - dy * side, fy = y + dx * side;
      add({ x: fx, y: fy, life: 2, flat: true, f(g, X, Y, h, k) {
        const a = 1 - k;
        R(g, X - 2, Y - 2, 5, 5, rgba(PAL.blue, 0.2 * a));
        R(g, X - 1, Y - 1, 3, 3, rgba(PAL.blueL, 0.6 * a)); R(g, X, Y - 3, 2, 1, rgba(PAL.ice, 0.7 * a));
      } });
      add({ x: fx, y: fy, h: 2, vh: 9, vx: (r(0) - 0.5) * 4, life: 1.4, s: r(1), f(g, X, Y, h, k, p, t) {
        // the ghost's frilled hem waves
        const a = 0.75 * (1 - k), y0 = Y - h, wave = Math.sin(t * 8 + p.s * 6) > 0 ? 1 : 0;
        R(g, X - 1, y0 - 4, 4, 4, rgba(PAL.ice, a)); R(g, X - 1, y0, 1, 1 + wave, rgba(PAL.blueL, a)); R(g, X + 1, y0, 1, 2 - wave, rgba(PAL.blueL, a)); R(g, X + 2, y0, 1, 1 + wave, rgba(PAL.blueL, a));
        R(g, X, y0 - 3, 1, 1, rgba(PAL.navy, a)); R(g, X + 2, y0 - 3, 1, 1, rgba(PAL.navy, a));
      } });
    } },
    code: { every: 5, spawn(add, x, y, dx, dy, i, r) {
      // turquoise and golden letters rise from the floor like code scrolling up a screen
      add({ x: x + (r(0) - 0.5) * 10, y, h: 1, vh: 12 + r(1) * 5, vx: (r(2) - 0.5) * 3, life: 1.6, s: r(3), f(g, X, Y, h, k, p) {
        const ch = CODE[Math.floor(p.s * CODE.length)], gold = p.s > 0.72, c = k < 0.2 ? PAL.white : gold ? PAL.goldL : k < 0.6 ? PAL.turqL : PAL.turq;
        halo(g, X + 1, Y - h - 3, 3, gold ? PAL.gold : PAL.turq, 0.3 * (1 - k));
        glyph(g, ch, X - 1, Y - h - 5, rgba(c, 1 - k * k));
      } });
      if (i % 2 === 0) add({ x: x + (r(4) - 0.5) * 8, y: y + (r(5) - 0.5) * 3, life: 0.9, flat: true, f(g, X, Y, h, k) { R(g, X - 3, Y, 7, 1, rgba(PAL.turq, 0.6 * (1 - k))); } });
    } },
    glitch: { every: 6, spawn(add, x, y, dx, dy, i, r) {
      // the floor "fails": bands of colour jump sideways and flicker where the feet were
      for (let j = 0; j < 3; j++) add({ x: x + (r(j) - 0.5) * 8, y: y + (r(j + 3) - 0.5) * 6, life: 0.95, flat: true, s: r(j + 6), f(g, X, Y, h, k, p, t) {
        const n = Math.floor(t * 22 + p.s * 50);
        if (DL.hash(n * 7) > 0.8) return; // flicker
        const off = Math.round((DL.hash(n * 13) - 0.5) * 6), w = 5 + Math.round(p.s * 9), a = 1 - k;
        R(g, X - w / 2 + off, Y, w, 2, rgba(p.s > 0.66 ? PAL.red : p.s > 0.33 ? PAL.turq : PAL.gold, 0.85 * a));
        R(g, X - w / 2 - off, Y + 2, Math.max(2, w - 3), 1, rgba(PAL.blueL, 0.8 * a));
        if (DL.hash(n * 31) > 0.55) R(g, X + off + 2, Y - 1, 2, 1, rgba(PAL.white, 0.85 * a));
      } });
    } },
    rainbow: { every: 2, spawn(add, x, y, dx, dy, i, r) {
      // a pixel rainbow ribbon that waves behind you, with sparkles now and then
      add({ x, y, life: 1.5, s: i, f(g, X, Y, h, k, p, t) {
        const a = 1 - k, lift = 3 + Math.round(Math.sin(t * 5 + p.s * 0.6) * 1.5);
        for (let c = 0; c < 6; c++) R(g, X, Y - lift - c, 2, 1, rgba(RAINBOW[5 - c], 0.95 * a));
      } });
      if (i % 5 === 0) add({ x: x + (r(0) - 0.5) * 8, y, h: 4 + r(1) * 10, vh: 5, life: 1, s: r(2), f(g, X, Y, h, k, p, t) {
        star(g, X, Y - h, p.s > 0.5 ? PAL.white : PAL.goldL, 1 - k, Math.sin(t * 16 + p.s * 9) > 0);
      } });
    } },
  };
  // (the Rastro de Cabos became the Rastro Relâmpago: a player on an older version still sends 'cables')
  FX.cables = FX.bolt;
  DL.TRAIL_FX = FX;

  // draws one particle: flat ones in the floor's space (base), the others standing up at their spot
  function drawP(g, sc, base, p, now) {
    const age = now - p.born, k = age / p.life;
    if (k < 0 || k >= 1) return;
    const [x, y, h] = pos(p, age);
    if (p.flat) { if (base) g.setTransform(base); }
    else if (sc && sc.iso) sc.actorSpace(g, { x, y, z: 0 });
    p.f(g, Math.round(x), Math.round(y), Math.round(h), k, p, now);
  }

  /* ------------------------------------------------------------------ */
  /* Aura Boot (slot 'aura'): drawn with the character, no particles kept */
  /* ------------------------------------------------------------------ */
  // layer 'back': a soft golden glow and a ring of light running round the feet (before the sprite);
  // 'front': golden particles rising around the body (after it)
  DL.drawAuraBoot = function (g, X, Y, t, layer) {
    const ga = g.globalAlpha;
    if (layer === 'back') {
      const k = 0.75 + 0.25 * Math.sin(t * 2.2);
      g.globalAlpha = ga * 0.16 * k;
      R(g, X - 9, Y - 26, 19, 28, PAL.gold); R(g, X - 7, Y - 29, 15, 33, PAL.gold);
      g.globalAlpha = ga;
      for (let i = 0; i < 24; i++) {
        const ang = (i / 24) * Math.PI * 2, lit = (i + Math.floor(t * 10)) % 8 < 3;
        R(g, Math.round(X + Math.cos(ang) * 8), Math.round(Y + Math.sin(ang) * 3.4), 1, 1, lit ? PAL.goldW : rgba(PAL.gold, 0.55));
      }
      return;
    }
    for (let i = 0; i < 7; i++) {
      const ph = (t * 0.55 + i / 7) % 1, x = X + Math.round(Math.sin(i * 2.3 + t * 0.9) * (6 + (i % 3) * 2)), y = Y - 2 - Math.round(ph * 30);
      g.globalAlpha = ga * Math.sin(ph * Math.PI);
      R(g, x, y, i % 3 ? 1 : 2, i % 3 ? 1 : 2, i % 2 ? PAL.goldW : PAL.goldL);
    }
    g.globalAlpha = ga;
  };

  /* ------------------------------------------------------------------ */
  /* The live system (demo.js creates it)                               */
  /* ------------------------------------------------------------------ */
  DL.createTrails = function (game) {
    const scene = game.scene, player = game.player;
    const list = [];
    const track = new WeakMap(); // actor → { x, y, d (distance since the last birth), i (steps) }
    let clock = 0;
    const equipped = (slot) => { const id = DL.Skins && DL.Skins.equipped[slot], it = id && DL.cosmetic(id); return it ? it.value : null; };
    // whose trail: mine (the inventory) or another player's (their look, multiplayer.js)
    function trailOf(a) {
      if (a === player) { const v = equipped('trail'); return FX[v] ? v : null; }
      const look = a.remotePlayer && a.remotePlayer.look;
      return look && FX[look.trail] ? look.trail : null;
    }
    // whose aura (the same way): iso.js / sprites.js ask while drawing each character
    DL.actorAura = function (a) {
      if (a === player) return equipped('aura');
      const look = a.remotePlayer && a.remotePlayer.look;
      return (look && look.aura) || null;
    };
    function feed(a, kind, dt) {
      let s = track.get(a);
      if (!s) { s = { x: a.x, y: a.y, d: 0, i: 0 }; track.set(a, s); }
      const mx = a.x - s.x, my = a.y - s.y, d = Math.hypot(mx, my);
      s.x = a.x; s.y = a.y;
      // only walking leaves a trail (not a teleport, a seat or standing still)
      if (!kind || !a.moving || a.hidden || a.seated || d > 30 || !(dt > 0)) { s.d = 0; return; }
      const fx = FX[kind];
      s.d += d;
      const dx = d ? mx / d : 0, dy = d ? my / d : 0;
      while (s.d >= fx.every) {
        s.d -= fx.every;
        s.i++;
        const seed = (s.i * 131 + (a === player ? 7 : 3)) % 9973;
        // born a few pixels behind the feet: the character, walking on, never covers it
        fx.spawn((p) => {
          p.born = clock;
          if (list.length >= MAX) list.shift(); // the oldest goes first: never more than MAX
          list.push(p);
        }, a.x - dx * BEHIND, a.y - dy * BEHIND, dx, dy, s.i, (k) => DL.hash(seed + k * 17.3));
      }
    }
    function update(dt) {
      if (dt > 0) clock += dt;
      // me (not in scene.actors) and the other players in an online room
      if (player) feed(player, trailOf(player), dt);
      for (const a of scene.actors) if (a.remotePlayer) feed(a, trailOf(a), dt);
      // drop the ones that are over (they are ordered by birth, almost: trim from the front)
      while (list.length && clock - list[0].born > list[0].life) list.shift();
      for (let i = list.length - 1; i >= 0; i--) if (clock - list[i].born > list[i].life) list.splice(i, 1);
    }
    // the scene's underlay (iso: g is in the floor's space)
    function draw(g, sc) {
      if (!list.length) return;
      const base = g.getTransform();
      for (const p of list) drawP(g, sc, base, p, clock);
      g.setTransform(base);
    }
    // (clear: a new game / a new map)
    return { update, draw, clear() { list.length = 0; }, get count() { return list.length; }, MAX };
  };

  /* ------------------------------------------------------------------ */
  /* Shop / inventory preview: the player walks across the card leaving  */
  /* the trail, on a loop (nothing is simulated: births are computed)    */
  /* ------------------------------------------------------------------ */
  const LOOP = 2.6, X0 = 4, X1 = 44, GY = 40;
  DL.drawTrailPreview = function (g, kind, t, sheet) {
    const fx = FX[kind];
    if (!fx) return;
    const speed = (X1 - X0) / LOOP, cyc = Math.floor(t / LOOP), now = t - cyc * LOOP;
    const at = (tau) => X0 + speed * tau;
    // floor line
    R(g, 2, GY + 1, 44, 1, 'rgba(127,178,240,0.12)');
    // births of this pass and of the previous one (still fading)
    for (const back of [1, 0]) {
      const n = Math.floor((X1 - X0) / fx.every);
      for (let i = 1; i <= n; i++) {
        const tau = (i * fx.every) / speed, born = tau - back * LOOP;
        if (born > now) break;
        const seed = (i * 131 + (cyc - back) * 17) % 9973;
        fx.spawn((p) => { p.born = born; if (now - born < p.life) drawP(g, null, null, p, now); }, at(tau) - BEHIND, GY, 1, 0, i, (k) => DL.hash(seed + k * 17.3));
      }
    }
    // the walker on top
    if (sheet && sheet.right && sheet.right.walk) {
      const C = DL.CHAR, f = sheet.right.walk[Math.floor(now * 8) % sheet.right.walk.length];
      g.drawImage(f, Math.round(at(now)) - C.AX, GY - C.AY);
    }
  };
})();
