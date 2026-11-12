/* DataLab — the season pass' furniture (Passe Boot Inicial · Temporada 1, battlepass.js). Rewards only:
   never sold in the shop. Exactly like the shop's cosmetic furniture (cosm-furniture.js): each piece is a
   build-mode catalog entry (cat 'cosm') with the same id as its inventory item; once earned it is placed
   for free from the build mode's Cosméticos tab, turned, moved and put back in the inventory. One of each
   in the map. Pixel art in the pass' own colours (gold and amber on black, a touch of turquoise), lit from
   the top left. The pieces that left the pass (rug, lamp, coffee machine, floppy shelf, vault) stay drawable
   for whoever already earned them, and are hidden from the build menu for everyone else. Loaded after
   cosm-furniture.js and before furniture.js (its generic turn handles the rotation). */
(function () {
  'use strict';
  const DL = window.DL, T = DL.T, R = DL.R;
  const P = {
    navy: '#0b1730', navyD: '#060d1c', navyL: '#1a2b4d', turq: '#2de2c8', turqL: '#a5f7ea', turqD: '#14897a',
    blue: '#3d7bd9', blueL: '#7fb2f0', blueD: '#21477f', slate: '#56657d', slateL: '#8797b0', slateD: '#323d50',
    ink: '#05080f', screen: '#06121a', black: '#11141b', blackL: '#232a38', ice: '#b8f3ff', green: '#6dff8f', greenD: '#1f6b3a',
    beige: '#bdb8a9', beigeD: '#8f8c80', beigeL: '#d6d1c2',
    gold: '#f2b51e', goldL: '#ffe680', goldD: '#bd7c10', goldDD: '#6e4507', goldW: '#fff8d6',
    char: '#1a1611', charL: '#2b241b', charD: '#0c0a08', red: '#a3202a', redL: '#e8444f', brick: '#4a2a20', brickL: '#6b3d2e', brickD: '#2a1712',
  };
  const SHADOW = 'rgba(0,0,0,0.35)';
  const blink = (t, hz, off) => Math.sin(t * hz + (off || 0)) > 0;
  const text = (g, s, x, y, c) => { if (DL.pixText) DL.pixText(g, s, x, y, c); };

  function codeRows(g, x, y, w, h, t, seed, cols) {
    const k = Math.floor(t * 4);
    for (let r = 0; r < h; r += 2) {
      const n = (r * 5 + k * 3 + seed * 7) % 13, len = 2 + (n % Math.max(2, w - 3));
      R(g, x + (n % 4 === 0 ? 2 : n % 3 === 0 ? 1 : 0), y + r, Math.min(len, w - 1), 1, cols[n % cols.length]);
    }
  }

  // nível 3 · Quadro "Hello World" (wall, 2 tiles): a golden frame, the screen and the cursor blinking
  function hello(g, e, t) {
    const W = e.tw * T, x = e.px + 2, y = e.py - 25, w = W - 4, h = 17;
    R(g, x - 1, y - 1, w + 2, h + 2, P.goldD); R(g, x - 1, y - 1, w + 2, 1, P.goldL); R(g, x - 1, y - 1, 1, h + 2, P.gold);
    R(g, x, y, w, h, P.charD);
    R(g, x + 1, y + 1, w - 2, h - 2, P.screen);
    text(g, 'HELLO', x + 3, y + 2, P.turqL);
    text(g, 'WORLD', x + 3, y + 9, P.turq);
    if (blink(t, 4)) R(g, x + 24, y + 13, 2, 1, P.goldL);
    R(g, x - 1, y + h, w + 2, 1, P.goldDD);
    R(g, x + w / 2 - 2, y - 3, 4, 2, P.gold);
  }
  // nível 7 · Grafite "BOOT" (wall, 2 tiles): bricks with the word sprayed in golden neon, paint dripping
  function graffiti(g, e, t) {
    const W = e.tw * T, x = e.px + 1, y = e.py - 26, w = W - 2, h = 19;
    R(g, x, y, w, h, P.brick); R(g, x, y, w, 1, P.brickL); R(g, x, y + h - 1, w, 1, P.brickD);
    for (let r = 0; r < 4; r++) {
      R(g, x, y + 4 + r * 5, w, 1, P.brickD);
      for (let c = r % 2 ? 2 : 6; c < w; c += 8) R(g, x + c, y + r * 5, 1, 4, P.brickD);
    }
    // the neon flickers off now and then
    const n = Math.floor(t * 10), off = DL.hash(n * 13 + (e.seed || 0)) < 0.06;
    if (!off) R(g, x + 3, y + 5, w - 6, 8, 'rgba(255,214,77,0.14)');
    text(g, 'BOOT', x + 7, y + 7, P.goldDD);
    text(g, 'BOOT', x + 6, y + 6, off ? P.goldD : P.goldL);
    // drips (they grow, then start over)
    for (const [dx, sp] of [[7, 1.3], [14, 0.9], [23, 1.6]]) { const len = 1 + Math.floor((t * sp) % 4); R(g, x + dx, y + 11, 1, len, P.gold); }
    R(g, x + w - 7, y + 14, 4, 2, P.turq);
  }
  // nível 22 · Mesa Hacker: black desk, three monitors full of scrolling code, a lit keyboard (2 tiles)
  function hackerDesk(g, e, t) {
    const px = e.px, py = e.py;
    R(g, px + 1, py + 13, 30, 2, SHADOW);
    for (const [x, w, s] of [[1, 9, 1], [11, 10, 2], [22, 9, 3]]) {
      R(g, px + x, py - 14, w, 10, P.black); R(g, px + x, py - 14, w, 1, P.goldD);
      R(g, px + x + 1, py - 13, w - 2, 8, P.screen);
      codeRows(g, px + x + 2, py - 12, w - 3, 7, t, s, [P.green, P.turq, P.goldL, P.turqL]);
      R(g, px + x + Math.floor(w / 2) - 1, py - 4, 2, 3, P.ink);
    }
    R(g, px, py + 1, 32, 3, P.black); R(g, px, py + 1, 32, 1, P.blackL);
    for (let i = 0; i < 12; i++) R(g, px + 10 + i, py + 1, 1, 1, Math.floor(t * 10 - i) % 12 === 0 ? P.goldW : i % 2 ? P.turqD : P.turq);
    R(g, px + 25, py - 1, 3, 3, P.slateL); R(g, px + 28, py, 1, 1, P.slateL);
    R(g, px + 1, py + 4, 30, 8, P.charD); R(g, px + 1, py + 4, 30, 1, P.gold);
    R(g, px + 1, py + 4, 2, 10, P.ink); R(g, px + 29, py + 4, 2, 10, P.ink);
  }
  // nível 27 · Cadeira do Fundador: black gamer chair, golden trim, 001 on the backrest
  function founderChair(g, e, t) {
    const px = e.px, py = e.py;
    R(g, px + 2, py + 13, 12, 2, SHADOW);
    R(g, px + 4, py + 12, 8, 1, P.slateD);
    R(g, px + 3, py + 13, 2, 1, P.ink); R(g, px + 7, py + 13, 2, 1, P.ink); R(g, px + 11, py + 13, 2, 1, P.ink);
    R(g, px + 7, py + 8, 2, 4, P.slateD);
    R(g, px + 4, py - 13, 8, 18, P.black); R(g, px + 4, py - 13, 1, 18, P.blackL);
    R(g, px + 3, py - 11, 1, 14, P.gold); R(g, px + 12, py - 11, 1, 14, P.goldD);
    R(g, px + 5, py - 12, 6, 2, P.blackL); R(g, px + 5, py - 12, 6, 1, P.goldL);
    // "001" in tiny lit dots
    const c = blink(t, 1.5) ? P.goldW : P.gold;
    R(g, px + 5, py - 6, 1, 3, c); R(g, px + 7, py - 6, 1, 3, c); R(g, px + 10, py - 6, 1, 3, c); R(g, px + 5, py - 6, 2, 1, c); R(g, px + 5, py - 4, 2, 1, c); R(g, px + 6, py - 5, 1, 1, P.black);
    R(g, px + 3, py + 4, 10, 4, P.black); R(g, px + 3, py + 4, 10, 1, P.blackL); R(g, px + 3, py + 7, 10, 1, P.goldD);
    R(g, px + 1, py + 1, 2, 1, P.slateD); R(g, px + 13, py + 1, 2, 1, P.slateD);
    R(g, px + 2, py + 2, 1, 3, P.slateD); R(g, px + 13, py + 2, 1, 3, P.slateD);
  }
  // nível 33 · Terminal de Tubo: an old beige computer, green CRT with the prompt and static crackling
  function crt(g, e, t) {
    const px = e.px, py = e.py;
    R(g, px + 1, py + 13, 14, 2, SHADOW);
    R(g, px + 2, py + 1, 12, 12, P.slateD); R(g, px + 2, py + 1, 12, 1, P.slate);
    R(g, px + 2, py - 14, 12, 14, P.beige); R(g, px + 2, py - 14, 12, 1, P.beigeL); R(g, px + 13, py - 13, 1, 13, P.beigeD);
    R(g, px + 3, py - 12, 9, 8, '#03140a'); R(g, px + 3, py - 12, 9, 1, 'rgba(109,255,143,0.2)');
    R(g, px + 4, py - 11, 4, 1, P.green); R(g, px + 4, py - 9, 6, 1, P.greenD); R(g, px + 4, py - 7, 1, 1, P.green);
    if (blink(t, 3)) R(g, px + 6, py - 7, 2, 1, P.green);
    // static: a few noisy pixels and, now and then, a band rolling through
    const n = Math.floor(t * 14);
    for (let i = 0; i < 4; i++) { const h = DL.hash(n * 7 + i * 13 + (e.seed || 0)); R(g, px + 3 + Math.floor(h * 9), py - 12 + Math.floor(DL.hash(n * 3 + i) * 8), 1, 1, h > 0.5 ? 'rgba(182,255,200,0.55)' : 'rgba(0,0,0,0.5)'); }
    if (DL.hash(Math.floor(t * 3) * 17) < 0.3) R(g, px + 3, py - 12 + Math.floor((t * 20) % 8), 9, 1, 'rgba(182,255,200,0.18)');
    R(g, px + 4, py - 3, 3, 1, P.beigeD); R(g, px + 10, py - 3, 1, 1, blink(t, 0.8) ? '#ffb347' : '#6b4a1e');
    R(g, px + 3, py + 2, 10, 2, P.beigeD); R(g, px + 4, py + 2, 8, 1, P.beige);
  }
  // nível 36 · Fliperama Boot: the DataLab logo on a golden marquee and a little game running on the screen
  function arcadeBoot(g, e, t) {
    const px = e.px, py = e.py;
    R(g, px + 1, py + 13, 15, 2, SHADOW);
    R(g, px + 2, py - 22, 12, 35, P.black); R(g, px + 2, py - 22, 1, 35, P.goldD); R(g, px + 13, py - 22, 1, 35, P.ink);
    R(g, px + 2, py - 22, 12, 6, P.goldD); R(g, px + 2, py - 22, 12, 1, P.goldL); text(g, 'DL', px + 4, py - 21, blink(t, 3) ? P.goldW : P.charD);
    R(g, px + 3, py - 15, 10, 9, P.screen);
    // the game: a bit runs along and jumps over a block
    const ph = (t * 0.8) % 1, bx = px + 4 + Math.floor(ph * 7), jump = ph > 0.45 && ph < 0.7;
    R(g, px + 3, py - 8, 10, 1, P.turqD);
    R(g, px + 9, py - 10, 2, 2, P.gold);
    R(g, bx, py - (jump ? 13 : 10), 2, 2, P.turqL);
    R(g, px + 5, py - 14, 1, 1, P.turq); R(g, px + 10, py - 14, 1, 1, P.turq);
    R(g, px + 2, py - 5, 12, 3, P.slateD);
    R(g, px + 5, py - 7, 1, 2, P.ink); R(g, px + 4, py - 8, 3, 1, P.redL);
    R(g, px + 9, py - 5, 1, 1, P.goldL); R(g, px + 11, py - 5, 1, 1, P.turq);
    R(g, px + 3, py - 1, 10, 13, P.charD);
    R(g, px + 6, py + 3, 4, 2, P.ink); R(g, px + 7, py + 3, 2, 1, P.gold);
  }
  // nível 42 · Trono do Servidor: a throne built from racks, lights blinking on the back and the arms
  function throne(g, e, t) {
    const px = e.px, py = e.py;
    R(g, px, py + 12, 16, 3, SHADOW);
    // the backrest: a tall rack with a golden crown
    R(g, px + 3, py - 24, 10, 30, P.black); R(g, px + 3, py - 24, 1, 30, P.blackL); R(g, px + 12, py - 24, 1, 30, P.ink);
    R(g, px + 3, py - 24, 10, 1, P.goldL);
    R(g, px + 4, py - 27, 2, 3, P.gold); R(g, px + 7, py - 28, 2, 4, P.goldL); R(g, px + 10, py - 27, 2, 3, P.gold);
    for (let i = 0; i < 7; i++) {
      R(g, px + 4, py - 21 + i * 3, 8, 2, P.ink);
      R(g, px + 5 + ((i + Math.floor(t * 3)) % 3) * 3, py - 21 + i * 3, 1, 1, (i + Math.floor(t * 2)) % 2 ? P.turq : P.goldL);
    }
    // the arms: short racks
    for (const x of [0, 13]) {
      R(g, px + x, py - 4, 3, 14, P.black); R(g, px + x, py - 4, 3, 1, P.gold);
      for (let i = 0; i < 4; i++) R(g, px + x + 1, py - 2 + i * 3, 1, 1, blink(t, 3, i + x) ? P.goldL : P.turqD);
    }
    // the seat
    R(g, px + 3, py + 2, 10, 4, P.red); R(g, px + 3, py + 2, 10, 1, P.redL);
    R(g, px + 2, py + 6, 12, 6, P.charD); R(g, px + 2, py + 6, 12, 1, P.gold); R(g, px + 2, py + 11, 12, 1, P.goldDD);
  }
  // nível 45 · Placa Neon "BOOT 001" (wall, 2 tiles)
  function neonBoot(g, e, t) {
    const W = e.tw * T, x = e.px + 1, y = e.py - 23, w = W - 2;
    R(g, x, y, w, 10, P.charD); R(g, x, y, w, 1, P.charL);
    const n = Math.floor(t * 12), off = DL.hash(n * 17 + (e.seed || 0)) < 0.05;
    const c = off ? P.goldD : P.goldL, c2 = off ? P.turqD : P.turqL;
    text(g, 'BOOT', x + 1, y + 2, c);
    text(g, '001', x + 18, y + 2, c2);
    R(g, x + 1, y + 8, w - 2, 1, off ? P.charL : 'rgba(255,214,77,0.35)');
  }

  // --- the pieces that left the pass: drawn as before, for whoever already has one ---
  function mobo(g, e, t) {
    const px = e.px, py = e.py, W = e.tw * T, H = e.th * T;
    R(g, px + 1, py + 1, W - 2, H - 2, P.navyD);
    R(g, px + 2, py + 2, W - 4, H - 4, '#0c2a2a');
    for (const [x, y, w, h] of [[4, 6, 12, 1], [16, 6, 1, 9], [6, 14, 10, 1], [20, 4, 1, 8], [20, 12, 8, 1], [4, 22, 9, 1], [13, 18, 1, 5], [22, 20, 6, 1], [27, 20, 1, 8], [8, 26, 14, 1]]) R(g, px + x, py + y, w, h, P.turqD);
    R(g, px + 9, py + 9, 8, 8, P.slate); R(g, px + 10, py + 10, 6, 6, P.slateD); R(g, px + 11, py + 11, 4, 4, P.ice);
    for (let i = 0; i < 3; i++) R(g, px + 21 + i * 3, py + 4, 1, 12, P.blueD);
    R(g, px + 4, py + 18, 5, 3, P.slateD); R(g, px + 23, py + 23, 4, 4, P.slateD); R(g, px + 15, py + 22, 5, 3, P.black);
    R(g, px + 5, py + 27, 1, 1, blink(t, 3) ? P.turqL : P.turqD); R(g, px + 26, py + 14, 1, 1, blink(t, 2, 1) ? P.blueL : P.blueD);
    const k = Math.floor((t * 8) % 12);
    R(g, px + 4 + k, py + 6, 1, 1, P.ice);
    for (let i = 1; i < W - 2; i += 3) { R(g, px + i, py + 1, 1, 1, P.turq); R(g, px + i, py + H - 2, 1, 1, P.turq); }
  }
  function ledLamp(g, e, t) {
    const px = e.px, py = e.py;
    R(g, px + 4, py + 12, 8, 2, SHADOW);
    R(g, px + 5, py + 9, 6, 4, P.slateD); R(g, px + 5, py + 9, 6, 1, P.slate);
    R(g, px + 6, py - 20, 4, 30, P.navy); R(g, px + 6, py - 20, 1, 30, P.navyL); R(g, px + 9, py - 20, 1, 30, P.navyD);
    const cyc = (t % 5) / 5, lit = cyc < 0.75 ? Math.floor((cyc / 0.75) * 7) : 7, on = cyc < 0.75 || blink(t, 6);
    for (let i = 0; i < 7; i++) {
      const y = py + 6 - i * 4, l = i < lit && on;
      R(g, px + 7, y, 2, 2, l ? (i === lit - 1 ? P.ice : P.turq) : P.turqD);
    }
  }
  function coffee8(g, e, t) {
    const px = e.px, py = e.py;
    R(g, px + 2, py + 13, 12, 2, SHADOW);
    R(g, px + 2, py - 14, 12, 26, P.navy); R(g, px + 2, py - 14, 12, 2, P.turqD); R(g, px + 12, py - 12, 2, 24, P.navyD);
    R(g, px + 4, py - 10, 8, 4, P.screen); text(g, '8', px + 5, py - 10, P.turqL);
    R(g, px + 9, py - 9, 2, 2, blink(t, 2) ? P.turq : P.turqD);
    R(g, px + 6, py - 4, 4, 2, P.ink);
    R(g, px + 4, py + 2, 8, 6, P.navyD);
    R(g, px + 6, py + 3, 4, 4, P.ice); R(g, px + 6, py + 3, 4, 1, '#ffffff'); R(g, px + 10, py + 4, 1, 2, P.ice);
    for (let i = 0; i < 3; i++) {
      const ph = (t * 0.7 + i / 3) % 1, s = ph < 0.5 ? 2 : 1;
      R(g, px + 7 + (i % 2 ? 1 : -1) * Math.round(ph * 2), Math.round(py + 1 - ph * 12), s, s, 'rgba(165,247,234,' + (0.7 * (1 - ph)).toFixed(2) + ')');
    }
  }
  function floppyShelf(g, e) {
    const px = e.px, py = e.py;
    R(g, px + 1, py + 13, 14, 2, SHADOW);
    R(g, px + 1, py - 20, 14, 33, P.slateD); R(g, px + 1, py - 20, 14, 1, P.slate); R(g, px + 2, py - 19, 12, 31, P.navyD);
    const cols = [P.turq, P.blue, P.blueL, P.slateL, P.ice, '#f2c14e', P.turqD];
    for (let r = 0; r < 4; r++) {
      const y = py - 18 + r * 8;
      for (let c = 0; c < 3; c++) {
        const col = cols[(r * 3 + c * 2) % cols.length], x = px + 3 + c * 4;
        R(g, x, y, 3, 6, col); R(g, x + 1, y, 1, 2, '#c9d6e6'); R(g, x, y + 5, 3, 1, 'rgba(0,0,0,0.3)');
      }
      R(g, px + 2, y + 6, 12, 1, P.slate);
    }
  }
  function vault(g, e, t) {
    const px = e.px, py = e.py;
    R(g, px + 1, py + 13, 14, 2, SHADOW);
    R(g, px + 1, py - 10, 14, 23, P.slate); R(g, px + 1, py - 10, 14, 1, P.slateL); R(g, px + 14, py - 9, 1, 22, P.slateD);
    R(g, px + 2, py - 8, 11, 19, P.slateD); R(g, px + 3, py - 7, 9, 17, P.slate);
    R(g, px + 4, py - 5, 7, 6, P.screen);
    const locked = (t % 6) < 4.5, c = locked ? (blink(t, 4) ? P.turq : P.turqD) : P.green;
    R(g, px + 6, py - 4, 3, 1, c); R(g, px + 6, py - 3, 1, 1, c); R(g, px + 8, py - 3, 1, 1, c); R(g, px + 5, py - 2, 5, 3, c); R(g, px + 7, py - 1, 1, 1, P.screen);
    R(g, px + 6, py + 3, 3, 3, P.slateL); R(g, px + 7, py + 4, 1, 1, P.ink);
    R(g, px + 10, py + 2, 1, 5, P.slateL);
    R(g, px + 2, py + 11, 2, 2, P.ink); R(g, px + 12, py + 11, 2, 2, P.ink);
  }

  const DRAW = {
    bp_hello: hello, bp_graffiti: graffiti, bp_hacker_desk: hackerDesk, bp_founder_chair: founderChair, bp_crt_terminal: crt, bp_arcade_boot: arcadeBoot,
    bp_server_throne: throne, bp_neon_boot: neonBoot,
    rug_mobo: mobo, bp_led_lamp: ledLamp, bp_coffee8: coffee8, bp_floppy_shelf: floppyShelf, bp_data_vault: vault,
  };
  const BOUNDS = {
    bp_hello: (e) => ({ x: e.px, y: e.py - 27, w: e.tw * T, h: 21 }),
    bp_graffiti: (e) => ({ x: e.px, y: e.py - 27, w: e.tw * T, h: 21 }),
    bp_hacker_desk: (e) => ({ x: e.px, y: e.py - 15, w: e.tw * T, h: e.th * T + 15 }),
    bp_founder_chair: (e) => ({ x: e.px + 1, y: e.py - 14, w: 14, h: 29 }),
    bp_crt_terminal: (e) => ({ x: e.px + 1, y: e.py - 15, w: 14, h: 30 }),
    bp_arcade_boot: (e) => ({ x: e.px + 1, y: e.py - 23, w: 14, h: 37 }),
    bp_server_throne: (e) => ({ x: e.px, y: e.py - 29, w: 16, h: 43 }),
    bp_neon_boot: (e) => ({ x: e.px, y: e.py - 24, w: e.tw * T, h: 12 }),
    bp_led_lamp: (e) => ({ x: e.px + 4, y: e.py - 21, w: 8, h: 35 }),
    bp_coffee8: (e) => ({ x: e.px + 1, y: e.py - 15, w: 14, h: 30 }),
    bp_floppy_shelf: (e) => ({ x: e.px + 1, y: e.py - 21, w: 14, h: 36 }),
    bp_data_vault: (e) => ({ x: e.px + 1, y: e.py - 11, w: 14, h: 26 }),
  };

  const baseDraw = DL.drawItem, baseGeom = DL.itemGeom;
  DL.drawItem = function (g, e, t) {
    const f = DRAW[e.kind];
    if (f) f(g, e, t || 0);
    else baseDraw(g, e, t);
  };
  DL.itemGeom = function (e) {
    baseGeom(e);
    const b = BOUNDS[e.kind];
    if (b) e.bounds = b(e);
    if (e.wall && DRAW[e.kind]) { e.ix = e.px + e.tw * 8; e.iy = e.py + 10; }
  };

  if (DL.DECOR_GLOW) Object.assign(DL.DECOR_GLOW, {
    bp_led_lamp: (e) => [e.px + 8, e.py - 8, 20, P.turq, 0.12],
    bp_neon_boot: (e) => [e.px + e.tw * 8, e.py - 18, 24, P.gold, 0.12],
    bp_graffiti: (e) => [e.px + e.tw * 8, e.py - 18, 22, P.gold, 0.1],
    bp_arcade_boot: (e) => [e.px + 8, e.py - 12, 16, P.gold, 0.1],
    bp_crt_terminal: (e) => [e.px + 8, e.py - 8, 12, P.green, 0.07],
    bp_hacker_desk: (e) => [e.px + 16, e.py - 8, 22, P.turq, 0.08],
    bp_server_throne: (e) => [e.px + 8, e.py - 10, 20, P.gold, 0.1],
  });

  // build mode → Cosméticos: placed for free once the pass gave the piece (pass: the reward level);
  // oldPass: no longer in the pass, only listed for whoever owns one
  const it = (id, level, name, desc, o) => Object.assign({ id, cat: 'cosm', group: 'Cosméticos', name, price: 0, cosm: true, pass: level, desc }, o || {});
  for (const d of [
    it('bp_hello', 3, 'Quadro "Hello World"', 'Na parede do fundo: o primeiro programa de todo mundo, 2 tiles.', { mount: 'wall', w: 2, h: 1, rot: false }),
    it('bp_graffiti', 7, 'Grafite "BOOT"', 'Na parede do fundo: BOOT em neon dourado, com a tinta escorrendo, 2 tiles.', { mount: 'wall', w: 2, h: 1, rot: false }),
    it('bp_hacker_desk', 22, 'Mesa hacker', 'Três monitores com código rolando e teclado aceso, 2 tiles.', { w: 2, h: 1 }),
    it('bp_founder_chair', 27, 'Cadeira do Fundador', 'Cadeira gamer preta com detalhes dourados.'),
    it('bp_crt_terminal', 33, 'Terminal de tubo', 'Computador antigo de tela verde, com chiado.'),
    it('bp_arcade_boot', 36, 'Fliperama Boot', 'Com o logo do DataLab no letreiro e um joguinho na tela.'),
    it('bp_server_throne', 42, 'Trono do Servidor', 'Um trono feito de racks, com luzes piscando.'),
    it('bp_neon_boot', 45, 'Placa neon BOOT 001', 'Letreiro neon na parede do fundo, 2 tiles.', { mount: 'wall', w: 2, h: 1, rot: false }),
    it('bp_rug_mobo', 0, 'Tapete Placa-Mãe', 'Tapete 2 × 2 com trilhas, chips e slots de uma placa-mãe. Fica por baixo dos móveis.', { kind: 'rug_mobo', w: 2, h: 2, solid: false, rug: true, oldPass: true }),
    it('bp_led_lamp', 0, 'Luminária de LED', 'Coluna de LEDs que acende devagar, como um servidor ligando.', { oldPass: true }),
    it('bp_coffee8', 0, 'Máquina de café 8-bit', 'Quadradona, com fumacinha em pixel.', { oldPass: true }),
    it('bp_floppy_shelf', 0, 'Estante de disquetes', 'Prateleira com disquetes coloridos.', { oldPass: true }),
    it('bp_data_vault', 0, 'Cofre de dados', 'Cofre de aço com cadeado digital piscando.', { oldPass: true }),
  ]) {
    (DL.COSM_CATALOG = DL.COSM_CATALOG || []).push(d);
    if (DL.DECOR_NAMES) DL.DECOR_NAMES[d.kind || d.id] = d.name;
  }
})();
