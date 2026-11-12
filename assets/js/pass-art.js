/* DataLab — the season pass' item art (Passe Boot Inicial · Temporada 1, battlepass.js).
   Every reward has its own 48×48 pixel-art icon, drawn bigger and with more care than the shop's previews:
   a dark outline, 3–4 tones per material, the light always from the top left, a few highlight pixels and
   2–4 frames of animation (blinking, glowing, moving). Each frame is baked once (with its outline and floor
   shadow) and cached; the glow behind the item and the light that sweeps across it every few seconds are
   drawn live. Used by the pass (cards, the big preview, the celebrations), the inventory / shop cards of
   pass items and the pass button (the golden chip, DL.drawPassChip). */
(function () {
  'use strict';
  const DL = window.DL;
  const N = 48;
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
  const R = (g, x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  const OL = '#120b04';
  // ramps: [dark, mid, light, highlight] — light comes from the top left
  const P = {
    gold: ['#6e4507', '#bd7c10', '#f2b51e', '#ffe680'],
    goldW: '#fff8d6',
    amber: ['#7a3b05', '#c8650c', '#ff9a1f', '#ffd27a'],
    char: ['#0c0a08', '#1a1611', '#2b241b', '#43382a'],
    black: ['#050508', '#0f0f15', '#1c1c26', '#33334a'],
    turq: ['#0a4f48', '#14897a', '#2de2c8', '#b4fff3'],
    blue: ['#14305e', '#21477f', '#3d7bd9', '#9cc6ff'],
    steel: ['#2a2f3a', '#4a5262', '#7a8496', '#c3ccd9'],
    beige: ['#5e5848', '#8f8a78', '#bdb6a0', '#e6dfc8'],
    skin: ['#8a5634', '#c48659', '#e8b080', '#ffd9b3'],
    green: ['#0d3d1c', '#1f7a3a', '#3fd36a', '#b6ffc8'],
    red: ['#5c0f14', '#a3202a', '#e8444f', '#ff9aa0'],
    purple: ['#2e1450', '#5a2a96', '#9b6bff', '#d9c7ff'],
    screen: '#04110d',
  };
  const RAINBOW = ['#ff4d5e', '#ff9a2e', '#ffe14d', '#4dff88', '#3fc8ff', '#9b6bff'];

  /* ------------------------------------------------------------------ */
  /* Drawing kit                                                         */
  /* ------------------------------------------------------------------ */
  // a lit box: mid fill, light top / left edges, dark bottom / right edges, a highlight corner
  function box(g, x, y, w, h, r, o) {
    R(g, x, y, w, h, r[1]);
    R(g, x, y, w, 1, r[2]); R(g, x, y, 1, h, r[2]);
    R(g, x, y + h - 1, w, 1, r[0]); R(g, x + w - 1, y, 1, h, r[0]);
    if (!(o && o.flat)) { R(g, x, y, 2, 1, r[3]); R(g, x, y, 1, 2, r[3]); }
  }
  // a lit disc / ellipse: the tone follows the direction to the top-left light
  function disc(g, cx, cy, rx, ry, r) {
    ry = ry || rx;
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry, d = dx * dx + dy * dy;
        if (d > 1) continue;
        const l = dx + dy;
        R(g, x, y, 1, 1, l < -0.95 && d > 0.25 ? r[3] : l < -0.15 ? r[2] : l > 0.85 || d > 0.82 && l > 0.2 ? r[0] : r[1]);
      }
    }
  }
  // a little sprite from rows of characters (map: char → colour, '.' is empty), k = pixel size
  function spr(g, x, y, rows, map, k) {
    k = k || 1;
    rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const c = map[row[i]]; if (c) R(g, x + i * k, y + j * k, k, k, c); } });
  }
  const text = (g, s, x, y, c, k) => DL.pixText(g, s, x, y, c, k);
  const spark = (g, x, y, c, big) => { R(g, x, y, 1, 1, c); R(g, x - 1, y, 3, 1, c); R(g, x, y - 1, 1, 3, c); if (big) { R(g, x - 2, y, 5, 1, c); R(g, x, y - 2, 1, 5, c); R(g, x, y, 1, 1, '#ffffff'); } };
  function glow(g, x, y, r, rgb, a) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(' + rgb + ',' + a + ')');
    gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }

  /* ------------------------------------------------------------------ */
  /* The golden chip (the pass' own symbol): ⏻ in the middle, circuits    */
  /* leaving it on every side                                            */
  /* ------------------------------------------------------------------ */
  function chip48(g, f) {
    const G = P.gold;
    // circuit traces going out to the sides, each ending in a pad
    for (const [x, y, w, h, px, py] of [[2, 15, 9, 1, 1, 14], [4, 22, 7, 1, 3, 21], [2, 30, 9, 1, 1, 29], [37, 17, 9, 1, 45, 16], [37, 25, 7, 1, 43, 24], [37, 32, 9, 1, 45, 31],
      [16, 2, 1, 9, 15, 1], [24, 4, 1, 7, 23, 3], [31, 2, 1, 9, 30, 1], [18, 37, 1, 9, 17, 45], [26, 37, 1, 7, 25, 43], [32, 37, 1, 8, 31, 44]]) {
      R(g, x, y, w, h, G[0]); R(g, x, y, w > h ? w : 1, w > h ? 1 : h, G[1]);
      box(g, px, py, 3, 3, G, { flat: true });
    }
    // the pins
    for (let i = 0; i < 5; i++) {
      box(g, 14 + i * 5, 9, 3, 3, G, { flat: true }); box(g, 14 + i * 5, 36, 3, 3, G, { flat: true });
      box(g, 9, 14 + i * 5, 3, 3, G, { flat: true }); box(g, 36, 14 + i * 5, 3, 3, G, { flat: true });
    }
    // the package: dark rim, golden body with a bevel
    box(g, 11, 11, 26, 26, P.char);
    box(g, 13, 13, 22, 22, G);
    R(g, 15, 15, 18, 18, G[2]); R(g, 16, 16, 16, 16, G[1]);
    R(g, 15, 15, 18, 1, G[3]); R(g, 15, 15, 1, 18, G[3]); R(g, 15, 32, 18, 1, G[0]); R(g, 32, 15, 1, 18, G[0]);
    // the power symbol, engraved: dark ring with a gap at the top, the bar through it, a lit edge
    const on = f % 2 ? G[3] : P.goldW;
    for (let a = 0; a < 64; a++) {
      const ang = (a / 64) * Math.PI * 2;
      if (Math.abs(Math.sin(ang / 2)) < 0.3) continue; // the gap (top)
      const x = Math.round(24 + Math.sin(ang) * 6.5 - 0.5), y = Math.round(25 - Math.cos(ang) * 6.5 - 0.5);
      R(g, x, y, 2, 2, G[0]);
    }
    R(g, 23, 16, 2, 9, G[0]);
    R(g, 22, 16, 1, 9, on); R(g, 18, 22, 1, 4, on);
    R(g, 16, 13, 1, 1, P.goldW); R(g, 13, 16, 1, 1, P.goldW);
  }
  // the small one (the Passe button): 20×20
  function chip20(g, f) {
    const G = P.gold;
    for (let i = 0; i < 3; i++) { R(g, 6 + i * 3, 1, 1, 3, G[1]); R(g, 6 + i * 3, 16, 1, 3, G[1]); R(g, 1, 6 + i * 3, 3, 1, G[1]); R(g, 16, 6 + i * 3, 3, 1, G[1]); }
    R(g, 0, 6, 1, 1, G[3]); R(g, 19, 12, 1, 1, G[3]); R(g, 12, 0, 1, 1, G[3]); R(g, 6, 19, 1, 1, G[3]);
    R(g, 4, 4, 12, 12, P.char[0]);
    R(g, 5, 5, 10, 10, G[1]); R(g, 5, 5, 10, 1, G[3]); R(g, 5, 5, 1, 10, G[2]); R(g, 5, 14, 10, 1, G[0]); R(g, 14, 5, 1, 10, G[0]);
    const k = G[0];
    R(g, 8, 8, 1, 4, k); R(g, 11, 8, 1, 4, k); R(g, 8, 12, 4, 1, k); R(g, 9, 7, 2, 1, G[1]);
    R(g, 9, 6, 2, 4, k); R(g, 9, 6, 1, 3, f % 2 ? P.goldW : G[3]);
  }

  /* ------------------------------------------------------------------ */
  /* The items                                                           */
  /* ------------------------------------------------------------------ */
  const ART = {};

  // Moldura Dourada T1: a golden frame with stepped corners and gems; a bright spark runs around it
  ART.bp_frame_t1 = (g, f) => {
    const G = P.gold;
    box(g, 6, 6, 36, 36, G); R(g, 10, 10, 28, 28, P.char[0]); box(g, 9, 9, 30, 30, P.char, { flat: true });
    R(g, 10, 10, 28, 28, '#15110c');
    R(g, 8, 8, 32, 1, G[3]); R(g, 8, 8, 1, 32, G[3]); R(g, 8, 39, 32, 1, G[0]); R(g, 39, 8, 1, 32, G[0]);
    for (let i = 12; i < 37; i += 4) { R(g, i, 7, 2, 1, G[0]); R(g, 7, i, 1, 2, G[0]); }
    for (const [x, y] of [[3, 3], [39, 3], [3, 39], [39, 39]]) { box(g, x, y, 6, 6, G); disc(g, x + 3, y + 3, 1.6, 1.6, P.turq); }
    // a face silhouette in the frame
    disc(g, 24, 21, 6, 6, P.char); box(g, 15, 29, 18, 9, P.char, { flat: true });
    R(g, 21, 21, 2, 1, P.turq[2]); R(g, 26, 21, 2, 1, P.turq[2]);
    // the T1 seal
    box(g, 30, 33, 12, 9, P.char); R(g, 31, 34, 10, 1, G[2]);
    text(g, 'T1', 32, 36, G[3]);
    // the running spark (frame = where it is on the border)
    const at = [[8, 8], [39, 8], [39, 39], [8, 39]][f];
    spark(g, at[0], at[1], P.goldW, true);
  };

  // 50 moedas: a golden coin that turns
  function coin(g, f, n) {
    const w = [11, 8, 3, 8][f], G = P.gold;
    R(g, 24 - w + 2, 10 + 1, w * 2 - 2, 28, G[0]);
    disc(g, 24, 24, w, 14, G);
    if (w > 4) {
      disc(g, 24, 24, w - 3, 11, [G[2], G[1], G[1], G[2]]);
      if (w > 9) { text(g, String(n), 24 - String(n).length * 2, 22, G[0]); text(g, String(n), 23 - String(n).length * 2, 21, P.goldW); }
      else R(g, 23, 18, 2, 12, G[0]);
    } else R(g, 23, 11, 2, 26, G[3]);
    // a little pile below
    disc(g, 14, 40, 6, 2.5, G); disc(g, 33, 41, 6, 2.5, G); disc(g, 24, 42, 6, 2.5, G);
    spark(g, 33, 12, f === 0 ? P.goldW : G[3], f === 0);
  }
  ART.gold = (g, f) => coin(g, f, 50);

  // Quadro "Hello World": a framed screen with the cursor blinking
  ART.bp_hello = (g, f) => {
    box(g, 3, 9, 42, 28, P.gold); box(g, 5, 11, 38, 24, P.char, { flat: true });
    R(g, 6, 12, 36, 22, P.screen);
    for (let y = 13; y < 34; y += 2) R(g, 6, y, 36, 1, 'rgba(45,226,200,0.05)');
    text(g, '>', 8, 15, P.turq[1]);
    text(g, 'HELLO', 13, 15, P.turq[3]);
    text(g, 'WORLD', 13, 23, P.turq[2]);
    if (f % 2 === 0) R(g, 34, 27, 3, 2, P.goldW);
    R(g, 21, 6, 6, 3, P.gold[1]); R(g, 23, 4, 2, 3, P.gold[0]);
    R(g, 4, 10, 38, 1, P.gold[3]);
  };

  // Ícone de Perfil "Chip Boot"
  ART.bp_icon_chip = (g, f) => chip48(g, f);

  // Grafite "BOOT": a chunk of brick wall with the word sprayed in golden neon, paint dripping
  ART.bp_graffiti = (g, f) => {
    const B = ['#2a1712', '#4a2a20', '#6b3d2e', '#8a5240'];
    box(g, 2, 8, 44, 32, B);
    for (let y = 10; y < 39; y += 5) {
      R(g, 3, y + 4, 42, 1, B[0]);
      for (let x = (y / 5) % 2 ? 3 : 8; x < 45; x += 10) R(g, x, y, 1, 4, B[0]);
    }
    const lit = f !== 3, c = lit ? P.gold[3] : P.gold[1], c2 = lit ? P.goldW : P.gold[2];
    // spray halo
    if (lit) { R(g, 5, 16, 38, 13, 'rgba(255,214,77,0.12)'); R(g, 7, 18, 34, 9, 'rgba(255,214,77,0.12)'); }
    text(g, 'BOOT', 8, 18, P.gold[0], 2);
    text(g, 'BOOT', 7, 17, c, 2);
    for (const x of [8, 15, 23, 31]) R(g, x, 17, 1, 1, c2);
    // drips
    for (const [x, len] of [[9, 4 + f], [20, 3 + ((f + 2) % 4)], [36, 5 + ((f + 1) % 3)]]) { R(g, x, 27, 1, len, P.gold[1]); R(g, x, 27 + len, 1, 1, P.gold[3]); }
    R(g, 33, 31, 6, 2, P.turq[1]); R(g, 34, 31, 4, 1, P.turq[2]);
  };

  // Óculos 001: dark shades, "001" scrolling across the lenses
  ART.bp_glasses001 = (g, f) => {
    const K = P.black;
    R(g, 3, 19, 42, 3, K[1]); R(g, 3, 19, 42, 1, K[3]);
    R(g, 1, 20, 3, 6, K[2]); R(g, 44, 20, 3, 6, K[0]);
    for (const x of [5, 26]) {
      box(g, x, 20, 17, 13, K); R(g, x + 1, 21, 15, 11, '#06060a');
      g.save(); g.beginPath(); g.rect(x + 1, 22, 15, 9); g.clip();
      // "001 " is 16 px: scrolling a glyph (4 px) per frame loops cleanly
      text(g, '001 001 001', x + 2 - f * 4 - (x > 20 ? 8 : 0), 24, P.gold[3]);
      g.restore();
      R(g, x + 2, 22, 3, 1, 'rgba(255,255,255,0.35)'); R(g, x + 2, 23, 1, 2, 'rgba(255,255,255,0.25)');
    }
    R(g, 22, 22, 4, 2, K[2]); R(g, 22, 22, 4, 1, K[3]);
    R(g, 5, 20, 17, 1, P.gold[2]); R(g, 26, 20, 17, 1, P.gold[2]);
    R(g, 21, 33, 6, 1, 'rgba(255,214,77,0.3)');
  };

  // ★ BIT ZERO: a little robot floating, its square face blinking 0 and 1, a jet of light underneath
  ART.bp_pet_bitzero = (g, f) => {
    const y = [0, -1, -2, -1][f], S = P.steel;
    // jet
    R(g, 21, 38 + y, 6, 2, P.turq[2]); R(g, 22, 40 + y, 4, 2, P.turq[1]); R(g, 23, 42 + y, 2, 1 + (f % 2), P.turq[3]);
    // antenna
    R(g, 23, 5 + y, 2, 6, S[2]); disc(g, 24, 4 + y, 2.2, 2.2, f % 2 ? P.gold : P.turq);
    // head (screen) and body
    box(g, 11, 10 + y, 26, 20, S); R(g, 14, 13 + y, 20, 14, P.screen);
    R(g, 14, 13 + y, 20, 1, 'rgba(45,226,200,0.25)');
    const bit = f < 2 ? '0' : '1';
    text(g, bit, 18, 15 + y, P.turq[3], 2); text(g, bit === '0' ? '1' : '0', 26, 17 + y, P.turq[1]);
    box(g, 15, 30 + y, 18, 8, P.char); R(g, 21, 32 + y, 6, 3, P.gold[1]); R(g, 22, 33 + y, 4, 1, f % 2 ? P.goldW : P.gold[3]);
    // arms
    box(g, 7, 18 + y, 4, 8, S); box(g, 37, 18 + y, 4, 8, S);
    R(g, 6, 25 + y, 5, 2, P.gold[2]); R(g, 37, 25 + y, 5, 2, P.gold[1]);
    R(g, 9, 9 + y, 4, 2, P.gold[2]); R(g, 35, 9 + y, 4, 2, P.gold[1]);
  };

  // Luvas de Circuito (douradas): a dark glove whose golden traces light up one after the other
  ART.bp_gloves_t1 = (g, f) => {
    const K = P.black, G = P.gold;
    // fingers
    for (const [x, y, h] of [[13, 7, 16], [19, 4, 19], [25, 5, 18], [31, 9, 14]]) { box(g, x, y, 6, h, K); R(g, x + 1, y + 1, 2, 2, K[3]); }
    // thumb
    box(g, 6, 20, 7, 12, K); R(g, 7, 21, 2, 2, K[3]);
    // palm and cuff
    box(g, 12, 21, 25, 18, K);
    box(g, 11, 38, 27, 7, G); R(g, 13, 40, 23, 1, G[0]);
    // the traces: a path per finger, lit in sequence
    const paths = [[[16, 10, 1, 14], [16, 24, 4, 1]], [[22, 7, 1, 17], [22, 24, 1, 6]], [[28, 8, 1, 15], [28, 23, 3, 1], [30, 23, 1, 8]], [[34, 12, 1, 12], [33, 24, 1, 1]]];
    paths.forEach((p, i) => { const on = i === f || i === (f + 3) % 4; for (const [x, y, w, h] of p) R(g, x, y, w, h, on ? G[3] : G[0]); if (on) R(g, p[0][0], p[0][1], 1, 1, P.goldW); });
    disc(g, 24, 31, 3, 3, G); R(g, 23, 30, 2, 2, f % 2 ? P.goldW : G[3]);
    R(g, 9, 26, 1, 4, G[1]);
  };

  // Bônus de XP: a cartridge marked 2× with a lightning bolt
  ART.bp_xp2 = (g, f) => {
    const K = P.char, G = P.gold;
    box(g, 9, 6, 30, 36, K); R(g, 9, 6, 30, 3, G[2]); R(g, 9, 6, 30, 1, G[3]);
    for (let i = 0; i < 6; i++) R(g, 12 + i * 4, 37, 2, 6, G[1]);
    box(g, 13, 12, 22, 20, G); R(g, 15, 14, 18, 16, '#2a1a05');
    text(g, '2', 17, 16, P.goldW, 2);
    spr(g, 26, 17, ['1.1', '.1.', '1.1'], { 1: G[3] }, 2);
    // the bolt
    spr(g, 30, 1, ['..11', '.11.', '1111', '.11.', '11..'], { 1: f % 2 ? P.goldW : G[3] }, 2);
    if (f === 0 || f === 2) spark(g, 8, 10, P.goldW, f === 0);
  };

  // Emote "Reboot": a face-screen that turns off, shows the blue screen and turns on again
  ART.bp_emote_reboot = (g, f) => {
    const S = P.steel;
    box(g, 7, 6, 34, 28, S); R(g, 10, 9, 28, 22, '#000');
    if (f === 0) { // on: a happy face
      R(g, 10, 9, 28, 22, '#0d2a1e'); R(g, 16, 15, 3, 4, P.green[2]); R(g, 29, 15, 3, 4, P.green[2]); R(g, 17, 24, 14, 2, P.green[2]); R(g, 15, 22, 2, 2, P.green[2]); R(g, 31, 22, 2, 2, P.green[2]);
    } else if (f === 1) { // turning off: the picture collapses into a line
      R(g, 10, 19, 28, 2, '#e8f4ff'); R(g, 20, 18, 8, 4, '#ffffff');
    } else if (f === 2) { // blue screen
      R(g, 10, 9, 28, 22, '#1d4fd8'); text(g, ':(', 13, 12, '#ffffff', 2);
      R(g, 13, 24, 20, 1, '#9cc6ff'); R(g, 13, 27, 14, 1, '#9cc6ff');
    } else { // booting: a bar fills
      R(g, 10, 9, 28, 22, '#0b0b10'); chip20(g, 1); R(g, 13, 26, 22, 3, '#232333'); R(g, 13, 26, 16, 3, P.gold[2]);
    }
    R(g, 11, 10, 6, 1, 'rgba(255,255,255,0.18)');
    box(g, 18, 34, 12, 4, S); box(g, 12, 38, 24, 4, S);
    // the power button
    disc(g, 36, 31, 2, 2, f === 1 ? P.red : P.gold);
  };

  // Mochila Cooler: a backpack with a spinning fan and a LED
  ART.bp_cooler = (g, f) => {
    const K = P.char, G = P.gold;
    R(g, 13, 4, 4, 10, K[2]); R(g, 31, 4, 4, 10, K[1]); R(g, 13, 4, 22, 3, K[2]);
    box(g, 8, 9, 32, 34, K);
    box(g, 10, 36, 28, 7, K); R(g, 12, 38, 24, 1, G[1]);
    // the fan
    disc(g, 24, 22, 11, 11, P.steel); disc(g, 24, 22, 9, 9, [P.char[0], P.char[1], P.char[1], P.char[2]]);
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + f * (Math.PI / 8);
      for (let r = 2; r < 9; r++) R(g, Math.round(24 + Math.cos(a + r * 0.12) * r - 0.5), Math.round(22 + Math.sin(a + r * 0.12) * r - 0.5), 2, 1, r > 6 ? P.turq[1] : P.turq[2]);
    }
    disc(g, 24, 22, 2.5, 2.5, G);
    for (let i = 0; i < 4; i++) R(g, 13 + i * 6, 33, 4, 1, K[0]);
    R(g, 34, 12, 3, 2, f % 2 ? P.turq[3] : P.turq[1]);
    R(g, 9, 11, 1, 6, G[2]);
  };

  // Terminal Boot: a terminal window saying "BOOT" with its loading bar filling
  ART.bp_term_boot = (g, f) => {
    box(g, 3, 7, 42, 34, P.char); R(g, 4, 8, 40, 5, '#062614');
    for (const [x, c] of [[6, '#e8444f'], [10, P.gold[2]], [14, P.green[2]]]) R(g, x, 9, 2, 2, c);
    R(g, 4, 13, 40, 27, '#020c06');
    for (let y = 14; y < 40; y += 2) R(g, 4, y, 40, 1, 'rgba(0,0,0,0.35)');
    text(g, 'BOOT 001', 7, 16, P.green[3]);
    text(g, 'INICIANDO', 7, 24, P.green[2]);
    R(g, 7, 32, 34, 5, '#0d3d1c'); R(g, 8, 33, [8, 16, 24, 32][f], 3, f === 3 ? P.gold[3] : P.green[2]);
    if (f % 2) R(g, 43, 24, 1, 5, P.green[3]);
    R(g, 4, 8, 40, 1, P.gold[2]);
  };

  // Rastros: each one shows a footstep and its effect
  function foot(g, x, y) { box(g, x, y, 6, 9, P.char, { flat: true }); R(g, x + 1, y + 1, 4, 2, P.char[3]); R(g, x + 1, y + 10, 4, 3, P.char[1]); }
  ART.bp_trail_binary = (g, f) => {
    foot(g, 9, 30); foot(g, 31, 24);
    for (let i = 0; i < 6; i++) {
      const x = 6 + i * 7, y = ((i * 11 + f * 6) % 30) + 2, ch = (i + f) % 2 ? '1' : '0';
      text(g, ch, x + 1, y + 1, P.gold[0]); text(g, ch, x, y, i % 3 ? P.gold[3] : P.turq[2]);
    }
    R(g, 7, 41, 12, 1, P.gold[2]); R(g, 29, 35, 12, 1, P.turq[2]);
  };
  ART.bp_trail_sparks = (g, f) => {
    // a zigzag bolt: light face, dark right edge
    spr(g, 16, 2, ['....3333', '...3221.', '..3221..', '.32211..', '32222221', '...3221.', '..3221..', '.321....', '31......'],
      { 1: P.gold[0], 2: f % 2 ? P.goldW : P.gold[3], 3: P.goldW }, 2);
    for (let i = 0; i < 7; i++) {
      const a = i * 0.9 + f * 0.4, r = 10 + ((i * 5 + f * 4) % 12);
      spark(g, Math.round(24 + Math.cos(a) * r), Math.round(30 + Math.sin(a) * r * 0.5), i % 2 ? P.turq[3] : P.goldW, i === f);
    }
    R(g, 10, 40, 28, 1, P.gold[1]); R(g, 14, 41, 20, 1, P.gold[0]);
  };
  // Rastro Relâmpago: small golden zigzag bolts leaping out of the boots (frames: they grow, crack bright,
  // jump to another shape, die out), a turquoise spark now and then
  // tone: 2 white-hot, 1 lit, 0 dying
  function bolt(g, x, y, steps, n, tone) {
    let px = x, py = y;
    const core = [P.gold[2], P.gold[3], P.goldW][tone], lit = [P.gold[1], P.gold[2], P.gold[3]][tone];
    for (let s = 0; s < Math.min(n, steps.length); s++) {
      const [dx, dy] = steps[s], m = Math.max(Math.abs(dx), Math.abs(dy));
      for (let i = 1; i <= m; i++) {
        const qx = px + Math.round((dx * i) / m), qy = py + Math.round((dy * i) / m);
        R(g, qx + 1, qy, 1, 1, P.gold[0]); R(g, qx, qy, 1, 1, core); R(g, qx - 1, qy, 1, 1, lit);
      }
      px += dx; py += dy;
    }
    return [px, py];
  }
  ART.bp_trail_bolt = (g, f) => {
    foot(g, 13, 30); foot(g, 29, 30);
    // the floor crackles under the boots
    R(g, 8, 43, 32, 1, P.gold[1]); R(g, 12, 44, 24, 1, P.gold[0]);
    if (f === 1) { R(g, 10, 42, 6, 1, P.goldW); R(g, 30, 42, 8, 1, P.goldW); }
    const SHAPES = [
      [[[-4, -5], [3, -3], [-5, -5], [3, -3], [-3, -4]], [[1, -6], [-3, -3], [3, -5], [-2, -3], [2, -4]], [[4, -5], [-3, -3], [5, -5], [-3, -3], [3, -4]]],
      [[[-3, -4], [4, -4], [-5, -4], [2, -4], [-4, -3]], [[-2, -5], [3, -4], [-3, -5], [3, -3], [-1, -4]], [[3, -4], [-4, -4], [5, -4], [-2, -4], [4, -3]]],
    ];
    // how far each bolt reaches in this frame (0: born, 1: full and white-hot, 2: another shape, 3: dying)
    const reach = [[3, 4, 2], [5, 5, 5], [4, 5, 4], [2, 3, 3]][f], sh = SHAPES[f >= 2 ? 1 : 0];
    const roots = [[15, 29], [24, 27], [33, 29]];
    roots.forEach(([x, y], i) => {
      const [tx, ty] = bolt(g, x, y, sh[i], reach[i], f === 1 ? 2 : f === 3 ? 0 : 1);
      if (reach[i] >= 5) spark(g, tx, ty - 1, f === 1 ? '#ffffff' : P.goldW, f === 1 && i === 1);
    });
    // the turquoise spark
    if (f === 2) { spark(g, 41, 18, P.turq[3], true); R(g, 39, 22, 1, 1, P.turq[2]); }
    if (f === 3) { spark(g, 43, 12, P.turq[2], false); R(g, 6, 20, 1, 1, P.turq[3]); }
  };
  ART.bp_trail_ghost = (g, f) => {
    const a = [0.55, 0.75, 0.9, 0.7][f];
    for (const [x, y] of [[10, 34], [26, 26]]) {
      R(g, x, y, 7, 9, 'rgba(61,123,217,' + (a * 0.5) + ')'); R(g, x + 1, y + 1, 5, 3, 'rgba(165,247,234,' + a + ')'); R(g, x + 1, y + 10, 5, 3, 'rgba(127,178,240,' + a + ')');
    }
    // a ghost wisp rising
    const y = 6 - f;
    disc(g, 30, y + 10, 8, 8, ['#3b5c99', '#7fb2f0', '#c8e2ff', '#ffffff']);
    R(g, 22, y + 10, 17, 8, '#7fb2f0'); R(g, 22, y + 10, 1, 8, '#c8e2ff');
    for (let i = 0; i < 4; i++) R(g, 22 + i * 4 + (f % 2), y + 18, 3, 2, '#7fb2f0');
    R(g, 26, y + 8, 2, 3, P.char[0]); R(g, 32, y + 8, 2, 3, P.char[0]); R(g, 27, y + 8, 1, 1, P.turq[3]); R(g, 33, y + 8, 1, 1, P.turq[3]);
  };
  // ★ Rastro de Código: </> glowing with lines of code rising
  ART.bp_trail_code = (g, f) => {
    for (let i = 0; i < 5; i++) {
      const y = 40 - ((i * 9 + f * 3) % 40), w = 6 + ((i * 7) % 12);
      R(g, 4 + (i % 2) * 4, y, w, 2, i % 2 ? P.turq[1] : P.gold[1]);
      R(g, 30 + (i % 3) * 2, (y + 20) % 44, w - 2, 2, i % 2 ? P.gold[1] : P.turq[1]);
    }
    const c = f % 2 ? P.goldW : P.gold[3];
    spr(g, 6, 13, ['...11', '..11.', '.11..', '11...', '.11..', '..11.', '...11'], { 1: c }, 3);
    spr(g, 18, 10, ['.....1', '....11', '....1.', '...11.', '..11..', '..1...', '.11...', '11....'], { 1: P.turq[2] }, 2);
    spr(g, 29, 13, ['11...', '.11..', '..11.', '...11', '..11.', '.11..', '11...'], { 1: c }, 3);
    R(g, 7, 13, 3, 1, P.goldW); R(g, 30, 13, 3, 1, P.goldW);
  };
  ART.bp_trail_glitch = (g, f) => {
    const off = [0, 3, -2, 1][f];
    box(g, 10 + off, 10, 28, 28, P.char);
    R(g, 12 - off, 14, 24, 4, 'rgba(255,77,94,0.75)'); R(g, 12 + off, 20, 24, 3, 'rgba(63,200,255,0.75)');
    R(g, 14 + off * 2, 26, 22, 3, P.gold[2]); R(g, 12, 31, 18 - off, 2, P.turq[2]);
    for (let i = 0; i < 6; i++) { const x = (i * 13 + f * 7) % 44, y = (i * 17 + f * 5) % 44; R(g, x, y, 3 + (i % 3), 1, i % 2 ? P.turq[3] : P.goldW); }
    if (f === 1) { R(g, 2, 22, 44, 2, 'rgba(255,255,255,0.4)'); }
  };
  // ★ Rastro Arco-íris Pixel: a pixel rainbow with sparkles
  ART.bp_trail_rainbow = (g, f) => {
    RAINBOW.forEach((c, i) => {
      const r = 20 - i * 2.4;
      for (let a = 0; a <= 64; a++) {
        const ang = Math.PI + (a / 64) * Math.PI, x = Math.round(24 + Math.cos(ang) * r), y = Math.round(34 + Math.sin(ang) * r);
        R(g, x - 1, y - 1, 2, 2, c);
      }
    });
    disc(g, 8, 38, 6, 4, ['#9fb3c8', '#dfe9f2', '#ffffff', '#ffffff']); disc(g, 40, 38, 6, 4, ['#9fb3c8', '#dfe9f2', '#ffffff', '#ffffff']);
    const sp = [[12, 10], [36, 8], [24, 4], [42, 22]];
    sp.forEach(([x, y], i) => { if ((i + f) % 2 === 0) spark(g, x, y, i % 2 ? P.goldW : '#ffffff', i === f); });
  };

  // ★ Emote Invasão: a holographic keyboard, code flying up and the lock opening
  ART.bp_emote_hack = (g, f) => {
    const T = P.turq;
    // the lock
    const open = f >= 2;
    for (let a = 0; a < 40; a++) {
      const ang = Math.PI + (a / 39) * Math.PI, x = Math.round(24 + Math.cos(ang) * 6), y = Math.round(14 + Math.sin(ang) * 6) - (open ? 4 : 0);
      R(g, x - 1, y, 2, 2, P.steel[2]);
    }
    if (open) R(g, 17, 10, 2, 4, P.steel[2]); else { R(g, 17, 14, 2, 3, P.steel[2]); R(g, 29, 14, 2, 3, P.steel[2]); }
    box(g, 14, 16, 20, 14, open ? P.gold : P.steel); R(g, 23, 20, 2, 5, open ? P.gold[0] : P.char[0]);
    if (open) { text(g, 'OK', 21, 3, P.green[3]); spark(g, 36, 12, P.goldW, f === 2); }
    // the keyboard (holographic)
    R(g, 4, 34, 40, 10, 'rgba(45,226,200,0.18)'); R(g, 4, 34, 40, 1, T[2]); R(g, 4, 43, 40, 1, T[1]);
    for (let r = 0; r < 3; r++) for (let c = 0; c < 9; c++) R(g, 6 + c * 4 + (r % 2), 36 + r * 2, 3, 1, (c + r + f) % 4 === 0 ? T[3] : T[1]);
    for (let i = 0; i < 3; i++) R(g, 8 + i * 13, 30 - ((f * 3 + i * 5) % 12), 3, 1, i % 2 ? T[2] : P.gold[3]);
  };

  // Mesa Hacker: three monitors with code scrolling
  ART.bp_hacker_desk = (g, f) => {
    const K = P.char;
    for (const [x, y, w] of [[2, 10, 14], [17, 7, 14], [32, 10, 14]]) {
      box(g, x, y, w, 12, K); R(g, x + 1, y + 1, w - 2, 9, P.screen);
      for (let r = 0; r < 4; r++) { const n = (r * 5 + f * 3 + x) % 9; R(g, x + 2 + (n % 3), y + 2 + r * 2, 3 + (n % 6), 1, [P.green[2], P.turq[2], P.gold[3], P.turq[1]][(r + f) % 4]); }
      R(g, x + w / 2 - 1, y + 12, 2, 3, K[1]);
    }
    box(g, 1, 25, 46, 5, K); R(g, 1, 25, 46, 1, P.gold[2]);
    for (let i = 0; i < 14; i++) R(g, 14 + i, 26, 1, 1, (i + f * 3) % 7 === 0 ? P.goldW : i % 2 ? P.turq[1] : P.turq[2]);
    R(g, 3, 30, 3, 14, K[0]); R(g, 42, 30, 3, 14, K[0]); R(g, 4, 30, 1, 14, K[2]);
    box(g, 37, 21, 4, 4, P.steel); R(g, 41, 22, 1, 2, P.steel[2]);
    if (f % 2) R(g, 38, 18, 1, 2, 'rgba(255,255,255,0.4)');
  };

  // Pet Gato Glitch: a pixel cat that sometimes "fails" and changes colour
  const CAT = [
    '..1.......1...',
    '.121.....121..',
    '.1221111.1221.',
    '.12222222222.1',
    '.1222222222221',
    '.12e2222e22221',
    '.122222222221.',
    '..122n22222221',
    '..1122222222221',
    '...12222222221',
    '...12233322221',
    '...12233322221.',
    '...1222222222221',
    '...12.12..12.121',
    '...11.11..11..1.',
  ];
  ART.bp_pet_glitchcat = (g, f) => {
    const glitch = f === 3, base = glitch ? P.purple : f === 2 ? P.turq : P.steel;
    const map = { 1: OL, 2: base[2], 3: base[3], e: glitch ? '#ff4d5e' : P.gold[3], n: P.gold[1] };
    if (glitch) { spr(g, 8, 10, CAT, { 1: 'rgba(255,77,94,0.6)', 2: 'rgba(255,77,94,0.6)', 3: 'rgba(255,77,94,0.6)' }, 2); }
    spr(g, glitch ? 6 : 7, 10, CAT, map, 2);
    // shade the right side / bottom
    R(g, 30, 24, 4, 12, 'rgba(0,0,0,0.18)');
    R(g, 11, 15, 2, 2, base[3]);
    // tail
    for (let i = 0; i < 6; i++) R(g, 37 + Math.round(Math.sin(i * 0.8 + f) * 2), 30 - i * 2, 3, 2, base[1]);
    if (glitch) { R(g, 2, 22, 44, 1, 'rgba(63,200,255,0.8)'); R(g, 4, 30, 40, 1, 'rgba(255,214,77,0.7)'); }
    if (f === 1) R(g, 13, 20, 2, 1, OL); // a blink
  };

  // Cadeira do Fundador: black gamer chair with golden details
  ART.bp_founder_chair = (g, f) => {
    const K = P.black, G = P.gold;
    box(g, 15, 3, 18, 26, K);
    R(g, 13, 6, 2, 22, G[2]); R(g, 33, 6, 2, 22, G[0]);
    box(g, 17, 3, 14, 5, K); R(g, 18, 4, 12, 1, G[2]);
    text(g, '001', 18, 12, f % 2 ? P.goldW : G[3]);
    R(g, 19, 19, 10, 1, G[1]); R(g, 19, 22, 10, 1, G[1]);
    box(g, 11, 29, 26, 6, K); R(g, 11, 34, 26, 1, G[1]);
    box(g, 8, 24, 5, 4, K); box(g, 35, 24, 5, 4, K); R(g, 9, 24, 3, 1, G[2]);
    R(g, 23, 35, 3, 6, P.steel[1]); R(g, 23, 35, 1, 6, P.steel[2]);
    R(g, 12, 41, 24, 2, P.steel[1]); R(g, 12, 41, 24, 1, P.steel[2]);
    for (const x of [11, 23, 35]) disc(g, x + 1, 44, 2, 1.5, K);
    spark(g, 16, 5, P.goldW, f === 0);
  };

  // Capa de Cabos: a cape made of coloured wires, swinging
  ART.bp_cable_cape = (g, f) => {
    const cols = [P.gold, P.turq, P.red, P.blue, P.green, P.gold, P.purple, P.turq];
    box(g, 12, 4, 24, 5, P.char); R(g, 14, 5, 20, 1, P.gold[2]);
    disc(g, 16, 6, 2, 2, P.gold); disc(g, 32, 6, 2, 2, P.gold);
    cols.forEach((c, i) => {
      const x0 = 13 + i * 3;
      for (let y = 9; y < 44; y++) {
        const sway = Math.round(Math.sin(y * 0.15 + f * 1.4 + i * 0.4) * (y - 8) * 0.12 + (i - 3.5) * (y - 9) * 0.12);
        R(g, x0 + sway, y, 2, 1, c[1]); R(g, x0 + sway, y, 1, 1, c[2]);
      }
      const end = Math.round(Math.sin(44 * 0.15 + f * 1.4 + i * 0.4) * 36 * 0.12 + (i - 3.5) * 35 * 0.12);
      R(g, x0 + end, 44, 2, 2, P.steel[2]);
    });
  };

  // ★ Servidor Relíquia: an old cracked tower with golden light leaking from the cracks
  ART.bp_relic = (g, f) => {
    const B = P.beige, k = [0.5, 0.8, 1, 0.75][f];
    glow(g, 24, 24, 20, '255,190,60', 0.25 * k);
    box(g, 11, 3, 26, 41, B);
    R(g, 13, 6, 22, 6, B[0]); R(g, 14, 7, 20, 1, B[3]);
    for (let i = 0; i < 4; i++) R(g, 14, 15 + i * 3, 20, 1, B[0]);
    R(g, 15, 28, 10, 3, P.char[1]); R(g, 16, 29, 8, 1, B[0]);
    disc(g, 30, 30, 2, 2, P.amber); R(g, 29, 29, 1, 1, f % 2 ? P.goldW : P.amber[3]);
    // the cracks
    const crack = [[19, 3], [20, 4], [20, 5], [21, 6], [22, 7], [21, 8], [22, 9], [23, 10], [24, 11], [24, 12], [25, 13], [26, 14], [27, 15],
      [33, 20], [32, 21], [32, 22], [31, 23], [30, 24], [30, 25], [29, 26], [12, 34], [13, 35], [14, 35], [15, 36], [16, 37], [17, 37], [18, 38], [19, 39], [19, 40], [20, 41], [21, 42]];
    const c = 'rgba(255,' + Math.round(190 + 60 * k) + ',' + Math.round(60 + 120 * k) + ',1)';
    for (const [x, y] of crack) { R(g, x, y, 1, 1, c); R(g, x + 1, y, 1, 1, 'rgba(255,214,77,' + (0.4 * k) + ')'); }
    R(g, 11, 43, 26, 1, B[0]);
    spark(g, 27, 15, P.goldW, f === 2); spark(g, 21, 42, P.goldW, f === 0);
  };

  // Terminal de Tubo: an old green-screen computer with static crackling on the screen
  ART.bp_crt_terminal = (g, f) => {
    const B = P.beige;
    box(g, 5, 5, 38, 30, B); R(g, 8, 8, 32, 23, P.char[0]);
    R(g, 9, 9, 30, 21, '#031a0c');
    for (let y = 9; y < 30; y += 2) R(g, 9, y, 30, 1, 'rgba(0,0,0,0.35)');
    text(g, '>_', 11, 12, P.green[3]); text(g, 'RUN', 11, 19, P.green[2]);
    if (f % 2) R(g, 27, 19, 3, 5, P.green[3]);
    // static
    for (let i = 0; i < 26; i++) { const n = DL.hash(i * 31 + f * 97); R(g, 9 + Math.floor(n * 30), 9 + Math.floor(DL.hash(i * 7 + f * 13) * 21), 1, 1, n > 0.5 ? 'rgba(182,255,200,0.6)' : 'rgba(0,0,0,0.6)'); }
    R(g, 10, 9, 8, 1, 'rgba(255,255,255,0.15)');
    box(g, 9, 35, 30, 4, B); box(g, 5, 39, 38, 6, B);
    for (let i = 0; i < 8; i++) R(g, 8 + i * 4, 41, 3, 2, B[0]);
    R(g, 36, 31, 3, 2, f % 2 ? P.amber[3] : P.amber[1]);
  };

  // Fliperama Boot: an arcade cabinet with an animated screen and the DataLab logo
  ART.bp_arcade_boot = (g, f) => {
    const K = P.char, G = P.gold;
    box(g, 11, 2, 26, 43, K);
    box(g, 11, 2, 26, 8, G); text(g, 'DL', 20, 4, f % 2 ? P.goldW : K[0]);
    R(g, 13, 11, 22, 16, '#03070c');
    // the game: a bit runs and jumps over a block
    const bx = 15 + f * 4;
    R(g, 13, 23, 22, 1, P.turq[1]);
    R(g, 26, 20, 3, 3, P.gold[2]);
    R(g, bx, f === 2 ? 17 : 20, 3, 3, P.turq[3]);
    for (let i = 0; i < 3; i++) R(g, 15 + i * 7, 13, 1, 1, P.turq[2]);
    R(g, 13, 11, 22, 1, 'rgba(255,255,255,0.12)');
    box(g, 9, 27, 30, 6, K); R(g, 15, 28, 2, 3, P.steel[2]); disc(g, 16, 28, 1.5, 1.5, P.red);
    disc(g, 28, 30, 1.5, 1.5, P.turq); disc(g, 32, 30, 1.5, 1.5, P.gold);
    R(g, 20, 37, 8, 3, K[0]); R(g, 22, 38, 4, 1, G[2]);
    R(g, 11, 12, 1, 31, G[1]);
  };

  // Coroa de LED: a crown with LEDs lighting in sequence
  ART.bp_led_crown = (g, f) => {
    const G = P.gold;
    spr(g, 6, 8, ['1.....1.....1', '11...111...11', '111.11111.111', '1111111111111'], { 1: G[2] }, 3);
    box(g, 6, 20, 39, 14, G);
    R(g, 6, 20, 39, 1, G[3]); R(g, 6, 33, 39, 1, G[0]);
    R(g, 8, 28, 35, 1, G[0]);
    const cols = [P.turq, P.red, P.gold, P.blue, P.green];
    cols.forEach((c, i) => {
      const lit = i === f || i === f + 1;
      disc(g, 11 + i * 7, 25, 2.2, 2.2, lit ? c : [P.char[1], P.char[2], P.char[2], P.char[3]]);
      if (lit) R(g, 10 + i * 7, 24, 1, 1, '#ffffff');
    });
    for (const x of [7, 25, 43]) disc(g, x, 7, 2, 2, G);
    R(g, 7, 21, 2, 5, P.goldW);
  };

  // Asas de Dados: wings made of pixels of code, beating slowly
  ART.bp_data_wings = (g, f) => {
    const lift = [0, -2, -4, -2][f];
    for (const side of [-1, 1]) {
      for (let row = 0; row < 7; row++) {
        const len = 18 - row * 2;
        for (let i = 0; i < len; i++) {
          if ((i * 7 + row * 3) % 5 === 4) continue; // gaps: it reads as code
          const x = 24 + side * (4 + i), y = 14 + row * 3 + Math.round((i / len) * (lift + row * 0.6) * (i / 6)) - Math.round(i * 0.35);
          R(g, side > 0 ? x : x - 1, y, 1, 2, (i + row) % 3 === 0 ? P.gold[3] : row < 2 ? P.turq[3] : row < 5 ? P.turq[2] : P.turq[1]);
        }
      }
    }
    disc(g, 24, 24, 3.5, 6, P.gold); R(g, 23, 20, 1, 3, P.goldW);
  };

  // Trono do Servidor: a throne built from racks with lights blinking
  ART.bp_server_throne = (g, f) => {
    const K = P.char, G = P.gold;
    box(g, 14, 2, 20, 28, K); R(g, 16, 4, 16, 1, G[2]);
    for (let i = 0; i < 6; i++) { R(g, 16, 7 + i * 3, 16, 2, K[0]); R(g, 17 + ((i + f) % 4) * 4, 7 + i * 3, 1, 1, (i + f) % 2 ? P.turq[3] : P.gold[3]); }
    // the crown on top
    spr(g, 18, 0, ['1.1.1', '11111'], { 1: G[3] }, 2);
    // the arm racks
    for (const x of [5, 34]) {
      box(g, x, 18, 9, 22, K); R(g, x + 1, 18, 7, 1, G[2]);
      for (let i = 0; i < 5; i++) { R(g, x + 2, 21 + i * 4, 5, 2, K[0]); R(g, x + 6, 21 + i * 4, 1, 1, (i + f) % 3 === 0 ? P.gold[3] : P.turq[2]); }
    }
    // the seat
    box(g, 14, 30, 20, 6, [P.red[0], P.red[1], P.red[2], P.red[3]]);
    box(g, 12, 36, 24, 8, K); R(g, 12, 36, 24, 1, G[2]); R(g, 12, 43, 24, 1, G[0]);
    spark(g, 24, 2, P.goldW, f === 1);
  };

  // Placa Neon "BOOT 001": flickering neon
  ART.bp_neon_boot = (g, f) => {
    box(g, 2, 12, 44, 24, P.char); R(g, 4, 14, 40, 20, '#0c0905');
    R(g, 10, 6, 1, 6, P.steel[1]); R(g, 37, 6, 1, 6, P.steel[1]);
    const off = f === 2, c = off ? P.gold[1] : P.gold[3], c2 = off ? P.turq[1] : P.turq[3];
    if (!off) { R(g, 5, 16, 38, 8, 'rgba(255,214,77,0.12)'); R(g, 5, 25, 38, 7, 'rgba(45,226,200,0.1)'); }
    text(g, 'BOOT', 8, 16, c, 2);
    text(g, '001', 17, 27, c2);
    R(g, 6, 33, 36, 1, off ? P.char[2] : 'rgba(255,214,77,0.4)');
  };

  // Aura Boot: a silhouette with golden particles rising around it
  ART.bp_aura_boot = (g, f) => {
    glow(g, 24, 28, 18, '255,200,60', 0.3);
    for (let i = 0; i < 8; i++) {
      const ph = ((i / 8) + f * 0.25) % 1, x = 24 + Math.round(Math.sin(i * 2.4) * (10 + (i % 3) * 3)), y = 42 - Math.round(ph * 36);
      R(g, x, y, i % 3 ? 1 : 2, i % 3 ? 1 : 2, i % 2 ? P.goldW : P.gold[3]);
    }
    // the person
    disc(g, 24, 15, 5, 5, P.char); box(g, 18, 20, 12, 13, P.char); R(g, 19, 33, 4, 9, P.char[1]); R(g, 25, 33, 4, 9, P.char[1]);
    R(g, 21, 15, 2, 1, P.turq[3]); R(g, 26, 15, 2, 1, P.turq[3]);
    // the ring at the feet
    for (let a = 0; a < 48; a++) { const ang = (a / 48) * Math.PI * 2; R(g, Math.round(24 + Math.cos(ang) * 12), Math.round(43 + Math.sin(ang) * 3), 1, 1, (a + f * 6) % 12 < 6 ? P.gold[3] : P.gold[1]); }
  };

  // ★ Skin Fundador: long black coat with a golden lining, high collar, "001" on the chest badge,
  // turquoise eyes, gloves and boots with golden details; the hem swings
  ART.bp_skin_founder = (g, f) => {
    const K = P.black, G = P.gold, sw = [0, 1, 0, -1][f];
    // boots
    box(g, 16, 42, 6, 5, K); box(g, 26, 42, 6, 5, K); R(g, 16, 45, 6, 1, G[2]); R(g, 26, 45, 6, 1, G[2]);
    // the coat's flared hem (swings)
    R(g, 12 + sw, 34, 24, 9, K[1]); R(g, 12 + sw, 34, 1, 9, K[2]); R(g, 35 + sw, 34, 1, 9, K[0]);
    R(g, 12 + sw, 42, 24, 1, G[2]); R(g, 22 + sw, 34, 4, 9, G[1]); R(g, 23 + sw, 34, 2, 9, '#1d2433');
    // body
    box(g, 14, 18, 20, 18, K);
    R(g, 21, 19, 6, 17, '#1d2433');
    R(g, 20, 19, 1, 17, G[3]); R(g, 27, 19, 1, 17, G[1]);
    // the 001 badge, pulsing
    box(g, 28, 24, 5, 4, f % 2 ? G : [G[0], G[1], G[1], G[2]]); text(g, '1', 29, 24, K[0]);
    // arms and gloves
    box(g, 10, 19, 5, 15, K); box(g, 33, 19, 5, 15, K);
    box(g, 10, 33, 5, 4, K); box(g, 33, 33, 5, 4, K); R(g, 10, 33, 5, 1, G[2]); R(g, 33, 33, 5, 1, G[2]);
    // high collar with the golden lining
    R(g, 13, 13, 4, 8, K[2]); R(g, 31, 13, 4, 8, K[1]); R(g, 16, 14, 1, 7, G[2]); R(g, 31, 14, 1, 7, G[1]);
    // head
    box(g, 17, 5, 14, 13, P.skin);
    R(g, 16, 3, 16, 5, P.char[1]); R(g, 16, 3, 16, 1, P.char[3]); R(g, 16, 7, 2, 4, P.char[1]); R(g, 30, 7, 2, 4, P.char[1]);
    R(g, 20, 11, 2, 2, P.turq[2]); R(g, 26, 11, 2, 2, P.turq[2]);
    R(g, 20, 11, 1, 1, P.turq[3]); R(g, 26, 11, 1, 1, P.turq[3]);
    if (f % 2) { R(g, 18, 11, 2, 1, 'rgba(45,226,200,0.5)'); R(g, 28, 11, 2, 1, 'rgba(45,226,200,0.5)'); }
    R(g, 22, 15, 4, 1, P.skin[0]);
    spark(g, 33, 9, P.goldW, f === 0);
  };

  // ★ Título "Pioneiro": a golden plaque with laurels
  ART.bp_title_pioneer = (g, f) => {
    const G = P.gold;
    // laurels
    for (let i = 0; i < 6; i++) {
      R(g, 4 + i, 30 - i * 3, 3, 2, P.green[i % 2 ? 2 : 1]); R(g, 41 - i, 30 - i * 3, 3, 2, P.green[i % 2 ? 1 : 2]);
    }
    box(g, 3, 18, 42, 13, G); R(g, 5, 20, 38, 9, '#2a1a05');
    text(g, 'PIONEIRO', 8, 22, G[0]); text(g, 'PIONEIRO', 7, 21, P.goldW);
    // star on top
    spr(g, 19, 5, ['...1...', '..121..', '1112111', '.12221.', '.1...1.'], { 1: G[3], 2: P.goldW }, 2);
    // ribbon tails
    box(g, 9, 31, 7, 9, P.red); box(g, 32, 31, 7, 9, P.red); R(g, 9, 39, 3, 2, P.red[1]); R(g, 36, 39, 3, 2, P.red[1]);
    spark(g, [8, 40, 40, 8][f], [18, 18, 31, 31][f], '#ffffff', true);
  };

  /* ------------------------------------------------------------------ */
  /* Bake (outline + floor shadow), cache, draw                          */
  /* ------------------------------------------------------------------ */
  const cache = new Map();
  function bake(id, f) {
    const key = id + ':' + f;
    let c = cache.get(key);
    if (c) return c;
    const src = mk(N, N), sg = src.getContext('2d');
    ART[id](sg, f);
    // the shadow on the floor under what was drawn (its width), then the outline, then the art
    const data = sg.getImageData(0, 0, N, N).data;
    let x0 = N, x1 = -1, y1 = -1;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (data[(y * N + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y > y1) y1 = y; }
    const sil = mk(N, N), silg = sil.getContext('2d');
    silg.drawImage(src, 0, 0);
    silg.globalCompositeOperation = 'source-in';
    silg.fillStyle = OL;
    silg.fillRect(0, 0, N, N);
    c = mk(N, N);
    const g = c.getContext('2d');
    if (x1 >= 0) {
      const w = Math.max(6, (x1 - x0) * 0.42), cy = Math.min(N - 2, y1 + 1.5);
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath(); g.ellipse((x0 + x1 + 1) / 2, cy, w, 1.8, 0, 0, Math.PI * 2); g.fill();
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) g.drawImage(sil, dx, dy);
    g.drawImage(src, 0, 0);
    cache.set(key, c);
    return c;
  }
  // the light that sweeps across the item now and then (only over its pixels)
  const sweepC = mk(N, N), sweepG = sweepC.getContext('2d');
  function sweep(g, img, t, every) {
    const ph = (t % every) / 1.1;
    if (ph > 1) return;
    sweepG.globalCompositeOperation = 'source-over';
    sweepG.clearRect(0, 0, N, N);
    sweepG.drawImage(img, 0, 0);
    sweepG.globalCompositeOperation = 'source-atop';
    const x = -24 + ph * 96;
    sweepG.fillStyle = 'rgba(255,248,214,0.55)';
    sweepG.beginPath(); sweepG.moveTo(x, 0); sweepG.lineTo(x + 6, 0); sweepG.lineTo(x - 18, N); sweepG.lineTo(x - 24, N); sweepG.fill();
    sweepG.fillStyle = 'rgba(255,248,214,0.25)';
    sweepG.beginPath(); sweepG.moveTo(x + 8, 0); sweepG.lineTo(x + 10, 0); sweepG.lineTo(x - 14, N); sweepG.lineTo(x - 16, N); sweepG.fill();
    g.drawImage(sweepC, 0, 0);
  }
  const GLOW = { bp_relic: '255,190,60', bp_aura_boot: '255,200,60', bp_trail_rainbow: '255,255,255', bp_pet_bitzero: '45,226,200', bp_neon_boot: '255,214,77', bp_graffiti: '255,214,77' };

  DL.PASS_ART = ART;
  DL.hasPassArt = (id) => !!ART[id];
  // draws the icon of a pass reward ('gold' = the coins) on g, in a 48×48 space (scale g yourself);
  // opts.fps: animation speed, opts.halo: the golden glow behind it
  DL.drawPassArt = function (g, id, t, opts) {
    if (!ART[id]) return false;
    const o = opts || {}, f = Math.floor(t * (o.fps || 5)) % 4;
    if (o.halo !== false) glow(g, 24, 26, 24, GLOW[id] || '242,181,30', 0.2 + 0.08 * Math.sin(t * 2.2));
    const img = bake(id, f);
    g.drawImage(img, 0, 0);
    sweep(g, img, t + (id.length % 5) * 0.6, o.every || 3.4);
    return true;
  };
  // the golden chip: size 'big' (48×48) or the button's 20×20
  const chipSmall = [];
  DL.drawPassChip = function (g, t, small) {
    const f = Math.floor(t * 2) % 2;
    if (!small) return DL.drawPassArt(g, 'bp_icon_chip', t, { fps: 2, every: 2.6 });
    if (!chipSmall[f]) {
      const c = mk(20, 20), cg = c.getContext('2d'); chip20(cg, f);
      const s = mk(20, 20), sg = s.getContext('2d');
      sg.drawImage(c, 0, 0); sg.globalCompositeOperation = 'source-in'; sg.fillStyle = OL; sg.fillRect(0, 0, 20, 20);
      const o = mk(20, 20), og = o.getContext('2d');
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) og.drawImage(s, dx, dy);
      og.drawImage(c, 0, 0);
      chipSmall[f] = o;
    }
    const img = chipSmall[f];
    g.drawImage(img, 0, 0);
    // the shine passing over it every few seconds
    const ph = (t % 3.2) / 0.9;
    if (ph <= 1) {
      sweepG.globalCompositeOperation = 'source-over'; sweepG.clearRect(0, 0, N, N); sweepG.drawImage(img, 0, 0);
      sweepG.globalCompositeOperation = 'source-atop'; sweepG.fillStyle = 'rgba(255,250,220,0.75)';
      const x = -8 + ph * 36;
      sweepG.beginPath(); sweepG.moveTo(x, 0); sweepG.lineTo(x + 4, 0); sweepG.lineTo(x - 6, 20); sweepG.lineTo(x - 10, 20); sweepG.fill();
      g.drawImage(sweepC, 0, 0, 20, 20, 0, 0, 20, 20);
    }
    return true;
  };
  // paints a canvas (CSS size px, crisp) with a pass icon: used by the pass UI and the inventory cards
  DL.paintPassCanvas = function (cv, id, t, px, opts) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), size = Math.round(px * dpr);
    if (cv.width !== size) { cv.width = cv.height = size; }
    const g = cv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, size, size);
    g.imageSmoothingEnabled = false;
    g.setTransform(size / N, 0, 0, size / N, 0, 0);
    return DL.drawPassArt(g, id, t, opts);
  };
  DL.paintPassChip = function (cv, t, px) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), size = Math.round(px * dpr);
    if (cv.width !== size) { cv.width = cv.height = size; }
    const g = cv.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, size, size);
    g.imageSmoothingEnabled = false;
    g.setTransform(size / 20, 0, 0, size / 20, 0, 0);
    DL.drawPassChip(g, t, true);
  };
})();
