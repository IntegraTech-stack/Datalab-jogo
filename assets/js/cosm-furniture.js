/* DataLab — cosmetic furniture: the decoration sold in the shop's "Cosméticos" tab (paid in Gold,
   inventory.js). Each piece is also a build-mode catalog entry (cat 'cosm', build.js) with the same id
   as the shop item: once bought it is placed for free from the build mode's Cosméticos tab, turned,
   moved and put back in the inventory (removing it gives nothing back — it is still owned). One of
   each in the map. Drawn here in pixel art, in the game's palette (navy, turquoise, blue, slate);
   iso.js shows them as billboards, the rug flat on the floor and the two wall pieces on the back wall.
   Loaded before furniture.js, so its generic turn handles the rotation. */
(function () {
  'use strict';
  const DL = window.DL, T = DL.T, R = DL.R;

  // the game's palette (the same values as cosmetics.js' DL.HX, which loads later)
  const P = {
    navy: '#0b1730', navyD: '#060d1c', navyL: '#1a2b4d', turq: '#2de2c8', turqL: '#a5f7ea', turqD: '#14897a',
    blue: '#3d7bd9', blueL: '#7fb2f0', blueD: '#21477f', slate: '#56657d', slateL: '#8797b0', slateD: '#323d50',
    ink: '#05080f', screen: '#06121a', leaf: '#1c6f66', leafD: '#0f4a45',
  };
  const SHADOW = 'rgba(0,0,0,0.35)';
  const blink = (t, hz, off) => Math.sin(t * hz + (off || 0)) > 0;

  // a few lines of "code" scrolling on a small screen
  function codeLines(g, x, y, w, h, t, seed) {
    const k = Math.floor(t * 3);
    for (let r = 0; r < h; r += 2) {
      const n = (r * 7 + k * 3 + seed * 5) % 11, len = 2 + (n % Math.max(2, w - 3));
      R(g, x + (n % 3 === 0 ? 1 : 0), y + r, Math.min(len, w - 1), 1, n % 4 === 0 ? P.blueL : n % 3 === 0 ? P.turqL : P.turq);
    }
  }

  function chair(g, e) {
    const px = e.px, py = e.py;
    R(g, px + 2, py + 13, 12, 2, SHADOW);
    R(g, px + 4, py + 12, 8, 1, P.slateD);
    R(g, px + 3, py + 13, 2, 1, P.ink); R(g, px + 7, py + 13, 2, 1, P.ink); R(g, px + 11, py + 13, 2, 1, P.ink);
    R(g, px + 7, py + 8, 2, 4, P.slateD);
    // backrest: navy shell, side wings, two turquoise racing stripes and the head pad
    R(g, px + 4, py - 12, 8, 17, P.navy);
    R(g, px + 3, py - 10, 1, 13, P.navyL); R(g, px + 12, py - 10, 1, 13, P.navyD);
    R(g, px + 6, py - 11, 1, 15, P.turq); R(g, px + 9, py - 11, 1, 15, P.turq);
    R(g, px + 5, py - 11, 6, 2, P.slate); R(g, px + 5, py - 11, 6, 1, P.slateL);
    // seat and armrests
    R(g, px + 3, py + 4, 10, 4, P.navy); R(g, px + 3, py + 4, 10, 1, P.navyL); R(g, px + 3, py + 7, 10, 1, P.navyD);
    R(g, px + 1, py + 1, 2, 1, P.slateD); R(g, px + 13, py + 1, 2, 1, P.slateD);
    R(g, px + 2, py + 2, 1, 3, P.slateD); R(g, px + 13, py + 2, 1, 3, P.slateD);
  }

  function desk3(g, e, t) {
    const px = e.px, py = e.py;
    R(g, px + 1, py + 13, 30, 2, SHADOW);
    // three monitors with code
    for (const [x, w, s] of [[1, 9, 1], [11, 10, 2], [22, 9, 3]]) {
      R(g, px + x, py - 13, w, 9, P.navyD);
      R(g, px + x + 1, py - 12, w - 2, 7, P.screen);
      codeLines(g, px + x + 2, py - 11, w - 3, 6, t, s);
      R(g, px + x + Math.floor(w / 2) - 1, py - 4, 2, 3, P.ink);
      R(g, px + x + Math.floor(w / 2) - 2, py - 1, 4, 1, P.slateD);
    }
    // desk top, front panel, a turquoise strip and the legs
    R(g, px, py + 1, 32, 3, P.slate); R(g, px, py + 1, 32, 1, P.slateL);
    R(g, px + 11, py + 1, 10, 1, P.ink); R(g, px + 14, py + 1, 4, 1, P.turqD);
    R(g, px + 22, py + 1, 2, 1, P.ink);
    R(g, px + 1, py + 4, 30, 8, P.slateD);
    R(g, px + 1, py + 4, 30, 1, P.turqD);
    R(g, px + 1, py + 4, 2, 10, P.navyD); R(g, px + 29, py + 4, 2, 10, P.navyD);
    R(g, px + 4, py + 10, 24, 1, blink(t, 1.6) ? P.turq : P.turqD);
  }

  function sofa(g, e) {
    const px = e.px, py = e.py;
    R(g, px + 1, py + 13, 30, 2, SHADOW);
    R(g, px + 1, py - 6, 30, 10, P.navy); R(g, px + 1, py - 6, 30, 1, P.navyL);
    R(g, px + 1, py + 4, 30, 9, P.navy);
    R(g, px + 3, py + 3, 13, 5, P.navyL); R(g, px + 16, py + 3, 13, 5, P.navyL); R(g, px + 16, py + 3, 1, 5, P.navyD);
    R(g, px + 1, py + 8, 30, 1, P.turqD);
    R(g, px, py - 2, 3, 14, P.navyD); R(g, px + 29, py - 2, 3, 14, P.navyD);
    R(g, px, py - 2, 3, 1, P.slate); R(g, px + 29, py - 2, 3, 1, P.slate);
    // two cushions: turquoise and blue
    R(g, px + 4, py - 3, 6, 5, P.turqD); R(g, px + 4, py - 3, 6, 1, P.turq);
    R(g, px + 22, py - 3, 6, 5, P.blueD); R(g, px + 22, py - 3, 6, 1, P.blue);
    R(g, px + 2, py + 13, 2, 1, P.ink); R(g, px + 28, py + 13, 2, 1, P.ink);
  }

  function coffee(g, e, t) {
    const px = e.px, py = e.py;
    R(g, px + 2, py + 13, 12, 2, SHADOW);
    R(g, px + 2, py + 1, 12, 12, P.slateD); R(g, px + 2, py + 1, 12, 1, P.slate);
    R(g, px + 8, py + 3, 1, 8, P.navyD); R(g, px + 6, py + 6, 1, 2, P.slateL); R(g, px + 10, py + 6, 1, 2, P.slateL);
    // the machine: display, spout, a cup and the steam
    R(g, px + 3, py - 12, 10, 13, P.navy); R(g, px + 3, py - 12, 10, 2, P.slate); R(g, px + 12, py - 10, 1, 11, P.navyD);
    R(g, px + 5, py - 9, 6, 2, P.screen); R(g, px + 6, py - 9, 1, 1, P.turq); R(g, px + 8, py - 9, 2, 1, blink(t, 3) ? P.turqL : P.turqD);
    R(g, px + 7, py - 6, 2, 2, P.ink);
    R(g, px + 6, py - 3, 4, 3, P.slateL); R(g, px + 6, py - 3, 4, 1, '#c9d6e6');
    for (let i = 0; i < 2; i++) {
      const ph = (t * 0.8 + i * 0.5) % 1;
      R(g, px + 7 + i, Math.round(py - 5 - ph * 7), 1, 1, 'rgba(165,247,234,' + (0.6 * (1 - ph)).toFixed(2) + ')');
    }
  }

  function plant(g, e, t) {
    const px = e.px, py = e.py, s = Math.sin(t * 1.3 + (e.seed || 0)) > 0.6 ? 1 : 0;
    R(g, px + 3, py + 12, 10, 2, SHADOW);
    // teal leaves (the palette's greens are turquoise)
    R(g, px + 7, py - 6, 2, 9, P.leafD);
    R(g, px + 2 + s, py - 9, 5, 3, P.leaf); R(g, px + 3 + s, py - 10, 3, 1, P.turqD);
    R(g, px + 9 - s, py - 12, 5, 3, P.leaf); R(g, px + 10 - s, py - 13, 3, 1, P.turqD);
    R(g, px + 5, py - 14, 5, 4, P.leaf); R(g, px + 6, py - 15, 3, 1, P.turq);
    R(g, px + 2, py - 3, 5, 3, P.leafD); R(g, px + 9, py - 4, 5, 3, P.leaf); R(g, px + 10, py - 4, 2, 1, P.turqD);
    // navy pot with a turquoise band
    R(g, px + 3, py + 1, 10, 2, P.navyL);
    R(g, px + 4, py + 3, 8, 9, P.navy); R(g, px + 11, py + 3, 1, 9, P.navyD);
    R(g, px + 4, py + 6, 8, 1, P.turq);
  }

  function fridge(g, e, t) {
    const px = e.px, py = e.py;
    R(g, px + 1, py + 13, 14, 2, SHADOW);
    R(g, px + 2, py - 20, 12, 33, P.navyD); R(g, px + 2, py - 20, 12, 1, P.slateD);
    R(g, px + 2, py - 20, 12, 4, P.navy);
    // the lightning sign on top
    const on = blink(t, 2.2) || blink(t, 9);
    R(g, px + 8, py - 19, 1, 1, on ? P.turqL : P.turqD); R(g, px + 7, py - 18, 2, 1, on ? P.turq : P.turqD); R(g, px + 7, py - 17, 1, 1, on ? P.turqL : P.turqD);
    // glass door with three shelves of cans
    R(g, px + 3, py - 15, 10, 25, '#0d2236');
    for (let r = 0; r < 3; r++) {
      const y = py - 13 + r * 8;
      for (let c = 0; c < 4; c++) R(g, px + 4 + c * 2 + (r % 2), y, 1, 4, [P.turq, P.blue, P.slateL, P.blueL][(c + r) % 4]);
      R(g, px + 3, y + 5, 10, 1, P.slateD);
    }
    R(g, px + 3, py - 15, 10, 1, 'rgba(165,247,234,0.25)');
    R(g, px + 3, py - 15, 1, 25, 'rgba(165,247,234,0.12)');
    R(g, px + 12, py - 9, 1, 8, P.slateL);
    R(g, px + 2, py + 11, 12, 2, P.slateD);
  }

  function codeArt(g, e, t) {
    const W = e.tw * T, x = e.px + 2, y = e.py - 24, w = W - 4, h = 14;
    R(g, x - 1, y - 1, w + 2, h + 2, P.navyD);
    R(g, x, y, w, h, P.slateD);
    R(g, x + 1, y + 1, w - 2, h - 2, P.screen);
    // a function, indented, with the cursor blinking at the end
    const rows = [[0, 9, P.blueL], [2, 12, P.turq], [4, 7, P.turqL], [4, 10, P.turq], [2, 5, P.slateL], [0, 2, P.blueL]];
    rows.forEach(([ind, len, c], i) => { R(g, x + 2 + ind, y + 2 + i * 2, Math.min(len, w - 5 - ind), 1, c); if (len > 6) R(g, x + 2 + ind, y + 2 + i * 2, 2, 1, P.blue); });
    if (blink(t, 4)) R(g, x + 6, y + 12, 2, 1, P.turqL);
  }

  function rug(g, e) {
    const px = e.px, py = e.py, W = e.tw * T, H = e.th * T;
    R(g, px + 1, py + 1, W - 2, H - 2, P.navy);
    // pixel border: turquoise / blue checker
    for (let i = 0; i < W - 2; i += 2) { R(g, px + 1 + i, py + 1, 1, 1, P.turq); R(g, px + 2 + i, py + H - 2, 1, 1, P.blue); }
    for (let i = 0; i < H - 2; i += 2) { R(g, px + 1, py + 2 + i, 1, 1, P.blue); R(g, px + W - 2, py + 1 + i, 1, 1, P.turq); }
    R(g, px + 3, py + 3, W - 6, H - 6, P.navyL);
    R(g, px + 4, py + 4, W - 8, H - 8, P.navy);
    // a big terminal prompt ">_" in the middle
    const cx = px + Math.floor(W / 2) - 7, cy = py + Math.floor(H / 2) - 5;
    for (let i = 0; i < 4; i++) { R(g, cx + i, cy + i, 2, 1, P.turq); R(g, cx + i, cy + 7 - i, 2, 1, P.turq); }
    R(g, cx + 7, cy + 8, 7, 2, P.turqL);
    R(g, px + 6, py + 6, 2, 2, P.slate); R(g, px + W - 8, py + H - 8, 2, 2, P.slate);
  }

  function arcade(g, e, t) {
    const px = e.px, py = e.py;
    R(g, px + 1, py + 13, 15, 2, SHADOW);
    R(g, px + 2, py - 22, 12, 35, P.navy); R(g, px + 2, py - 22, 1, 35, P.navyL); R(g, px + 13, py - 22, 1, 35, P.navyD);
    // marquee
    R(g, px + 2, py - 22, 12, 4, P.turqD); R(g, px + 4, py - 21, 8, 2, blink(t, 4) ? P.turqL : P.turq);
    // screen: a little snake game
    R(g, px + 3, py - 16, 10, 9, P.screen);
    const k = Math.floor(t * 5) % 16;
    for (let i = 0; i < 4; i++) { const s = (k - i + 16) % 16, sx = s < 8 ? s : 15 - s; R(g, px + 4 + sx, py - 12 + (s < 8 ? 0 : 2), 1, 1, i ? P.turqD : P.turqL); }
    R(g, px + 4 + ((k * 5) % 8), py - 15, 1, 1, P.blueL);
    // controls and the coin slot
    R(g, px + 2, py - 6, 12, 3, P.slateD);
    R(g, px + 5, py - 8, 1, 2, P.ink); R(g, px + 4, py - 9, 3, 1, P.turq);
    R(g, px + 9, py - 6, 1, 1, P.blue); R(g, px + 11, py - 6, 1, 1, P.turq);
    R(g, px + 3, py - 2, 10, 14, P.navyD);
    R(g, px + 6, py + 3, 4, 2, P.ink); R(g, px + 7, py + 3, 2, 1, P.turqD);
  }

  function lamp(g, e, t) {
    const px = e.px, py = e.py, a = 0.75 + 0.25 * Math.sin(t * 2.4 + (e.seed || 0));
    R(g, px + 4, py + 12, 8, 2, SHADOW);
    R(g, px + 5, py + 10, 6, 3, P.slateD); R(g, px + 5, py + 10, 6, 1, P.slate);
    R(g, px + 7, py - 8, 2, 18, P.slateD);
    // a neon ring on top
    g.globalAlpha = a;
    R(g, px + 5, py - 21, 6, 1, P.turqL); R(g, px + 5, py - 12, 6, 1, P.turqL);
    R(g, px + 4, py - 20, 1, 8, P.turq); R(g, px + 11, py - 20, 1, 8, P.turq);
    R(g, px + 5, py - 20, 1, 1, P.turq); R(g, px + 10, py - 20, 1, 1, P.turq); R(g, px + 5, py - 13, 1, 1, P.turq); R(g, px + 10, py - 13, 1, 1, P.turq);
    g.globalAlpha = 1;
  }

  // 3×5 pixel letters for the sign
  const FONT = { D: ['110', '101', '101', '101', '110'], A: ['010', '101', '111', '101', '101'], T: ['111', '010', '010', '010', '010'], L: ['100', '100', '100', '100', '111'], B: ['110', '101', '110', '101', '110'] };
  function sign(g, e, t) {
    const W = e.tw * T, x = e.px + 1, y = e.py - 23, w = W - 2;
    R(g, x, y, w, 10, P.navyD); R(g, x, y, w, 1, P.navyL);
    // a flicker now and then
    const n = Math.floor(t * 12), off = DL.hash ? DL.hash(n * 13 + (e.seed || 0)) < 0.04 : false;
    let cx = x + 2;
    for (const ch of 'DATALAB') {
      const rows = FONT[ch];
      rows.forEach((row, r) => { for (let c = 0; c < 3; c++) if (row[c] === '1') R(g, cx + c, y + 2 + r, 1, 1, off ? P.turqD : P.turqL); });
      cx += 4;
    }
    R(g, x + 1, y + 8, w - 2, 1, off ? P.navyL : 'rgba(45,226,200,0.35)');
  }

  const DRAW = {
    cz_chair: chair, cz_desk3: desk3, cz_sofa: sofa, cz_coffee: coffee, cz_plant: plant, cz_fridge: fridge,
    cz_codeart: codeArt, rug_pixel: rug, cz_arcade: arcade, cz_lamp: lamp, cz_sign: sign,
  };
  const BOUNDS = {
    cz_chair: (e) => ({ x: e.px + 1, y: e.py - 13, w: 14, h: 28 }),
    cz_desk3: (e) => ({ x: e.px, y: e.py - 14, w: e.tw * T, h: e.th * T + 14 }),
    cz_sofa: (e) => ({ x: e.px - 1, y: e.py - 7, w: e.tw * T + 2, h: e.th * T + 7 }),
    cz_coffee: (e) => ({ x: e.px + 1, y: e.py - 13, w: 14, h: 28 }),
    cz_plant: (e) => ({ x: e.px + 1, y: e.py - 16, w: 14, h: 30 }),
    cz_fridge: (e) => ({ x: e.px + 1, y: e.py - 21, w: 14, h: 36 }),
    cz_codeart: (e) => ({ x: e.px, y: e.py - 26, w: e.tw * T, h: 18 }),
    cz_arcade: (e) => ({ x: e.px + 1, y: e.py - 23, w: 14, h: 37 }),
    cz_lamp: (e) => ({ x: e.px + 3, y: e.py - 22, w: 10, h: 36 }),
    cz_sign: (e) => ({ x: e.px, y: e.py - 24, w: e.tw * T, h: 12 }),
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

  // light from the glowing pieces (decor.js draws the glow table)
  if (DL.DECOR_GLOW) Object.assign(DL.DECOR_GLOW, {
    cz_lamp: (e) => [e.px + 8, e.py - 16, 22, P.turq, 0.14],
    cz_sign: (e) => [e.px + e.tw * 8, e.py - 18, 24, P.turq, 0.12],
    cz_arcade: (e) => [e.px + 8, e.py - 12, 16, P.turq, 0.1],
    cz_fridge: (e) => [e.px + 8, e.py - 4, 14, P.blueL, 0.08],
  });

  // build mode: the Cosméticos tab (build.js). Free to place: the piece was bought in the shop.
  const it = (id, name, desc, o) => Object.assign({ id, cat: 'cosm', group: 'Cosméticos', name, price: 0, cosm: true, desc }, o || {});
  DL.COSM_CATALOG = [
    it('cz_chair', 'Cadeira gamer', 'Concha azul-marinho com listras turquesa.'),
    it('cz_desk3', 'Mesa com 3 monitores', 'Código rolando nas três telas, 2 tiles.', { w: 2, h: 1 }),
    it('cz_sofa', 'Sofá', 'Sofá azul-marinho com almofadas turquesa e azul, 2 tiles.', { w: 2, h: 1 }),
    it('cz_coffee', 'Máquina de café', 'Café quente com vapor saindo da xícara.'),
    it('cz_plant', 'Planta em vaso', 'Folhas em tons de turquesa num vaso azul-marinho.'),
    it('cz_fridge', 'Geladeira de energético', 'Porta de vidro cheia de latas e um raio aceso no topo.'),
    it('cz_codeart', 'Quadro com código', 'Na parede do fundo: uma função com o cursor piscando, 2 tiles.', { mount: 'wall', w: 2, h: 1, rot: false }),
    it('cz_rug', 'Tapete pixel', 'Tapete 2 × 2 com o prompt >_ no meio. Fica por baixo dos móveis.', { kind: 'rug_pixel', w: 2, h: 2, solid: false, rug: true }),
    it('cz_arcade', 'Fliperama', 'Gabinete turquesa com um jogo da cobrinha rodando.'),
    it('cz_lamp', 'Luminária neon', 'Anel de neon turquesa num pedestal.'),
    it('cz_sign', 'Placa neon DATALAB', 'Letreiro neon na parede do fundo, 2 tiles.', { mount: 'wall', w: 2, h: 1, rot: false }),
  ];
  if (DL.DECOR_NAMES) for (const d of DL.COSM_CATALOG) DL.DECOR_NAMES[d.kind || d.id] = d.name;
})();
