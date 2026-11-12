/* DataLab — the bigger furniture & decoration catalog, and rotation for every object.
   Rotation (e.rot) is the way the object's front faces: 0 south (towards the viewer), 1 north,
   2 east, 3 west; R turns it clockwise S → W → N → E (DL.ROT_NEXT, used by build.js). Objects with
   their own art for each side handle e.rot themselves (ROT_NATIVE); everything else is drawn by the
   generic turn below: seen from the back it is mirrored, from the side it is narrower (seen at an
   angle). Flat things (rugs) really turn 90°. Footprints of non-square floor objects swap on the sides.
   New catalog entries reuse the existing kinds where the simulation cares (tables host monitors,
   chairs become stations, storage is equipment) and add plain decorative kinds otherwise. */
(function () {
  'use strict';
  const DL = window.DL, T = DL.T, R = DL.R, shade = DL.shade, hash = DL.hash, C = DL.C;

  DL.ROT_NEXT = [3, 2, 0, 1];
  DL.ROT_LABEL = ['frente para o sul', 'frente para o norte', 'frente para o leste', 'frente para o oeste'];
  DL.rotSide = (r) => r === 2 || r === 3;

  const hsl = (h, a) => 'hsla(' + (((h % 360) + 360) % 360).toFixed(0) + ',95%,62%,' + Math.max(0, Math.min(1, a)).toFixed(3) + ')';
  const rgba = DL.rgba || ((hex, a) => hex);

  /* ------------------------------------------------------------------ */
  /* Furniture with art for every side                                   */
  /* ------------------------------------------------------------------ */
  // Tall cabinet (variants: '' office, 'wide' 2 tiles, 'locker' steel lockers).
  function cabinet(g, e) {
    const px = e.px, py = e.py, rot = e.rot | 0, v = e.variant || '';
    const col = e.color || (v === 'locker' ? '#5d6878' : '#c9c7c2'), lo = shade(col, -0.22), hi = shade(col, 0.15), dk = shade(col, -0.45);
    if (rot === 2 || rot === 3) {
      const H = e.th * T, east = rot === 2;
      R(g, px + 3, py + H - 3, 11, 2, 'rgba(0,0,0,0.3)');
      R(g, px + 3, py - 20, 10, H + 18, lo);
      R(g, px + 3, py - 20, 10, 2, hi);
      const fx = east ? px + 12 : px + 3;
      R(g, fx, py - 18, 1, H + 16, col);
      for (let y = py - 14; y < py + H - 4; y += v === 'locker' ? 8 : 12) R(g, east ? fx - 1 : fx + 1, y, 1, 3, dk);
      if (v === 'locker') for (let y = py - 16; y < py + H - 6; y += 8) R(g, px + 5, y, 6, 1, dk);
      return;
    }
    const W = e.tw * T;
    R(g, px + 1, py + 13, W - 1, 2, 'rgba(0,0,0,0.3)');
    R(g, px + 1, py - 20, W - 2, 34, col);
    R(g, px + 1, py - 20, W - 2, 2, hi);
    R(g, px + W - 2, py - 18, 1, 32, lo);
    R(g, px + 1, py + 12, W - 2, 2, dk);
    if (rot === 1) {
      R(g, px + 3, py - 17, W - 6, 28, lo);
      for (let x = px + 8; x < px + W - 4; x += 8) R(g, x, py - 17, 1, 28, shade(lo, -0.15));
      return;
    }
    if (v === 'locker') {
      const cols = Math.max(2, Math.round(W / 8)), cw = Math.floor((W - 4) / cols);
      for (let i = 0; i < cols; i++) {
        for (let j = 0; j < 2; j++) {
          const x = px + 2 + i * cw, y = py - 17 + j * 15;
          R(g, x, y, cw - 1, 14, lo);
          R(g, x, y, cw - 1, 1, hi);
          for (let k = 0; k < 3; k++) R(g, x + 1, y + 2 + k * 2, cw - 3, 1, dk);
          R(g, x + cw - 3, y + 8, 1, 2, '#e9e9e6');
          R(g, x + 1, y + 10, 3, 2, '#e9e9e6');
        }
      }
      return;
    }
    // two doors per tile with handles in the middle
    for (let x = px + 2; x < px + W - 2; x += 7) {
      R(g, x, py - 17, 6, 28, shade(col, -0.06));
      R(g, x, py - 17, 6, 1, hi);
    }
    for (let x = px + 8; x < px + W - 2; x += 14) { R(g, x - 1, py - 4, 1, 4, dk); R(g, x + 1, py - 4, 1, 4, dk); }
  }

  // Drawers (variants: '' steel filing cabinet, 'low' rolling pedestal, 'wood' chest of drawers).
  function drawers(g, e) {
    const px = e.px, py = e.py, rot = e.rot | 0, v = e.variant || '';
    const col = e.color || (v === 'wood' ? '#6b5038' : v === 'low' ? '#2a2f38' : '#8a919c'), lo = shade(col, -0.22), hi = shade(col, 0.16), dk = shade(col, -0.45);
    const top = v === 'low' ? py - 1 : v === 'wood' ? py - 6 : py - 12, n = v === 'low' ? 3 : 4;
    const hgt = py + 13 - top;
    R(g, px + 2, py + 12, 13, 2, 'rgba(0,0,0,0.3)');
    if (rot === 2 || rot === 3) {
      R(g, px + 3, top, 10, hgt, lo);
      R(g, px + 3, top, 10, 2, hi);
      const fx = rot === 2 ? px + 12 : px + 3;
      R(g, fx, top + 2, 1, hgt - 2, col);
      for (let k = 0; k < n; k++) R(g, rot === 2 ? fx - 1 : fx + 1, top + 4 + k * Math.floor((hgt - 4) / n), 1, 2, dk);
      if (v === 'low') { R(g, px + 4, py + 12, 2, 2, '#121418'); R(g, px + 10, py + 12, 2, 2, '#121418'); }
      return;
    }
    const x = v === 'wood' ? px + 1 : px + 2, w = v === 'wood' ? 14 : 12;
    R(g, x, top, w, hgt, col);
    R(g, x, top, w, 2, hi);
    R(g, x + w - 1, top + 2, 1, hgt - 2, lo);
    if (rot === 1) { R(g, x + 1, top + 3, w - 2, hgt - 5, lo); return; }
    const dh = Math.floor((hgt - 4) / n);
    for (let k = 0; k < n; k++) {
      const y = top + 3 + k * dh;
      R(g, x + 1, y, w - 2, dh - 1, shade(col, 0.04));
      R(g, x + 1, y + dh - 1, w - 2, 1, dk);
      R(g, x + w / 2 - 2, y + 2, 4, 1, v === 'wood' ? '#c9a06a' : dk);
      if (!v) R(g, x + 2, y + 1, 3, 1, '#e9e9e6');
    }
    if (v === 'low') { R(g, x + 1, py + 12, 2, 2, '#121418'); R(g, x + w - 3, py + 12, 2, 2, '#121418'); }
  }

  // Open steel shelving with boxes (variant 'cable': cable reels and coils).
  function steelrack(g, e, t) {
    const px = e.px, py = e.py, rot = e.rot | 0, v = e.variant || '';
    const post = '#5d6573', plank = '#3a414c';
    const boxes = ['#b08a5a', '#c9a06a', '#3a414c', '#2a5d8a', '#c9ced6'];
    if (rot === 2 || rot === 3) {
      const H = e.th * T;
      R(g, px + 3, py + H - 3, 11, 2, 'rgba(0,0,0,0.3)');
      R(g, px + 4, py - 20, 1, H + 18, post);
      R(g, px + 11, py - 20, 1, H + 18, post);
      for (let s = 0; s < 4; s++) {
        const y = py - 18 + s * 10;
        R(g, px + 4, y + 9, 8, 1, plank);
        if (s < 3) for (let k = 0; k < Math.max(1, e.th); k++) R(g, px + 6, y + 3 + k * 3, 4, 5, boxes[(s + k + e.seed) % boxes.length]);
      }
      return;
    }
    const W = e.tw * T;
    R(g, px + 1, py + 13, W - 1, 2, 'rgba(0,0,0,0.3)');
    R(g, px + 1, py - 20, 1, 34, post);
    R(g, px + W - 2, py - 20, 1, 34, post);
    if (rot === 1) { R(g, px + 2, py - 18, W - 4, 30, 'rgba(20,24,30,0.6)'); }
    for (let s = 0; s < 4; s++) {
      const y = py - 18 + s * 10;
      R(g, px + 1, y + 9, W - 2, 1, plank);
      if (s === 3) break;
      let x = px + 3;
      for (let k = 0; x < px + W - 4 && k < 8; k++) {
        if (v === 'cable') {
          const c = ['#2a5d8a', '#c9a13c', '#7c3aed', '#1f6f5c'][(k + s) % 4];
          R(g, x, y + 2, 6, 7, shade(c, -0.3));
          R(g, x + 1, y + 3, 4, 5, c);
          R(g, x + 2, y + 5, 2, 1, '#121418');
          x += 7;
        } else {
          const w = 4 + Math.floor(hash(e.seed * 3 + s * 7 + k) * 4), h = 4 + Math.floor(hash(e.seed + s * 5 + k) * 4);
          const bc = boxes[(k + s * 2 + e.seed) % boxes.length];
          R(g, x, y + 9 - h, Math.min(w, px + W - 3 - x), h, rot === 1 ? shade(bc, -0.3) : bc);
          R(g, x, y + 9 - h, Math.min(w, px + W - 3 - x), 1, shade(bc, 0.2));
          x += w + 1;
        }
      }
    }
  }

  // Low media cabinet with a TV (variant 'audio': hi-fi rack, 1 tile).
  function tvrack(g, e, t) {
    const px = e.px, py = e.py, rot = e.rot | 0, v = e.variant || '';
    const col = e.color || '#2a2e36', lo = shade(col, -0.25), hi = shade(col, 0.18);
    if (rot === 2 || rot === 3) {
      const H = e.th * T, east = rot === 2;
      R(g, px + 2, py + H - 3, 12, 2, 'rgba(0,0,0,0.3)');
      R(g, px + 2, py - 2, 12, H - 2, lo);
      R(g, px + 2, py - 2, 12, 1, hi);
      R(g, east ? px + 13 : px + 2, py - 1, 1, H - 3, col);
      if (v !== 'audio') {
        R(g, px + 7, py - 4, 2, 3, '#16191f');
        R(g, px + 6, py - 20, 3, 20, '#0c0e12');
        R(g, east ? px + 9 : px + 5, py - 19, 1, 18, 'rgba(160,195,236,' + (0.25 + 0.1 * Math.sin(t * 2)).toFixed(3) + ')');
      }
      return;
    }
    const W = e.tw * T;
    R(g, px + 1, py + 13, W - 2, 2, 'rgba(0,0,0,0.3)');
    R(g, px + 1, py + 1, W - 2, 12, col);
    R(g, px + 1, py + 1, W - 2, 1, hi);
    R(g, px + 1, py + 12, W - 2, 1, lo);
    if (v === 'audio') {
      R(g, px + 3, py - 14, 10, 15, '#14171c');
      R(g, px + 3, py - 14, 10, 1, '#262a31');
      if (rot !== 1) {
        R(g, px + 5, py - 12, 6, 6, '#22262e'); R(g, px + 7, py - 10, 2, 2, '#0a0b0e');
        R(g, px + 5, py - 4, 6, 3, '#22262e');
        for (let i = 0; i < 4; i++) R(g, px + 4 + i * 2, py + 4, 1, 1 + Math.floor((Math.sin(t * 8 + i * 1.3) + 1) * 2), C.ok);
      }
      return;
    }
    if (rot !== 1) for (let x = px + 3; x < px + W - 3; x += 10) { R(g, x, py + 3, 9, 8, lo); R(g, x + 4, py + 6, 1, 2, hi); }
    // the TV on its foot
    const tw = W - 6;
    R(g, px + W / 2 - 3, py - 1, 6, 2, '#16191f');
    R(g, px + 3, py - 18, tw, 17, rot === 1 ? '#1a1d23' : '#0c0e12');
    if (rot === 1) { R(g, px + 3, py - 18, tw, 1, '#262a31'); R(g, px + W / 2 - 4, py - 13, 8, 6, '#20242b'); return; }
    const sx = px + 4, sy = py - 17, sw = tw - 2, sh = 14;
    R(g, sx, sy, sw, sh, '#0b1424');
    // a slow dashboard: a moving line chart and a status bar
    for (let i = 0; i < sw; i++) R(g, sx + i, sy + 7 + Math.round(Math.sin(t * 1.5 + i * 0.5 + e.seed) * 3), 1, 1, C.breeze);
    R(g, sx + 1, sy + 1, Math.round((sw - 2) * (0.5 + 0.4 * Math.sin(t * 0.3))), 1, C.ok);
    R(g, sx + sw - 4, sy + sh - 3, 3, 2, C.warnSoft);
  }

  // Printer / copier (asymmetric, so it gets its own sides).
  function printer(g, e, t) {
    const px = e.px, py = e.py, rot = e.rot | 0;
    R(g, px + 1, py + 12, 14, 2, 'rgba(0,0,0,0.3)');
    if (rot === 2 || rot === 3) {
      const east = rot === 2;
      R(g, px + 3, py - 10, 10, 23, '#d9dde3');
      R(g, px + 3, py - 10, 10, 1, '#ffffff');
      R(g, px + 3, py - 4, 10, 1, '#9aa3b0');
      R(g, east ? px + 12 : px + 3, py - 9, 1, 21, '#b8bec7');
      R(g, east ? px + 13 : px + 1, py - 2, 2, 2, '#e9e9e6');
      return;
    }
    R(g, px + 1, py - 10, 14, 23, '#d9dde3');
    R(g, px + 1, py - 10, 14, 2, '#ffffff');
    R(g, px + 1, py - 4, 14, 1, '#9aa3b0');
    if (rot === 1) { R(g, px + 3, py - 2, 10, 10, '#c4c9d0'); R(g, px + 5, py + 2, 3, 2, '#2a2f38'); return; }
    R(g, px + 2, py - 9, 8, 3, '#2a2f38');
    R(g, px + 11, py - 9, 3, 2, '#2a2f38');
    R(g, px + 12, py - 8, 1, 1, Math.sin(t * 2) > 0 ? C.ok : '#1f4a35');
    R(g, px + 3, py - 3, 10, 2, '#f1f1ee');
    for (let k = 0; k < 2; k++) { R(g, px + 2, py + 2 + k * 5, 12, 4, '#c4c9d0'); R(g, px + 6, py + 3 + k * 5, 4, 1, '#7d8590'); }
  }

  /* ------------------------------------------------------------------ */
  /* Decoration (drawn facing south; the generic turn handles the rest)  */
  /* ------------------------------------------------------------------ */
  function plantNew(g, e) {
    const px = e.px, py = e.py, v = e.variant;
    R(g, px + 3, py + 13, 11, 2, 'rgba(0,0,0,0.3)');
    const pot = (c) => { R(g, px + 4, py + 3, 8, 10, c || '#2d323b'); R(g, px + 4, py + 3, 8, 1, shade(c || '#2d323b', 0.25)); };
    if (v === 'monstera') {
      const L1 = '#1f5a3c', L2 = '#2f7a50', L3 = '#4a9a68';
      for (const [x, y, w, h, c] of [[1, -8, 6, 5, L2], [9, -10, 6, 5, L2], [4, -14, 7, 5, L3], [0, -3, 5, 4, L1], [11, -4, 5, 4, L1], [5, -6, 6, 5, L1]]) {
        R(g, px + x, py + y, w, h, c);
        R(g, px + x + Math.floor(w / 2), py + y + 1, 1, h - 2, shade(c, -0.35));
      }
      pot('#c9c7c2');
      return;
    }
    if (v === 'snake') {
      const L = ['#2c5f45', '#3c8059', '#58a578'];
      for (let i = 0; i < 6; i++) { const h = 9 + ((i * 5) % 7); R(g, px + 4 + i, py + 3 - h, 1, h, L[i % 3]); R(g, px + 4 + i, py + 3 - h, 1, 1, '#d8e8a0'); }
      pot('#3a414c');
      return;
    }
    // ficus: a tall indoor tree
    R(g, px + 7, py - 10, 2, 13, '#5a4434');
    for (const [x, y, w, h, c] of [[2, -22, 12, 7, '#2c5f45'], [0, -17, 7, 6, '#3c8059'], [9, -18, 7, 6, '#3c8059'], [4, -25, 8, 4, '#58a578'], [3, -12, 4, 3, '#2c5f45'], [10, -12, 4, 3, '#2c5f45']]) R(g, px + x, py + y, w, h, c);
    pot('#5a3b2e');
  }

  const POSTER_NEW = {
    osi(g, x, y) {
      const cols = ['#ff3b5c', '#ff7a17', '#ffd23f', '#7ee0a1', '#00a8c6', '#6aa7e8', '#7c5cff'];
      R(g, x + 1, y + 1, 10, 13, '#10141c');
      cols.forEach((c, i) => R(g, x + 2, y + 2 + i * 2 - (i > 5 ? 1 : 0), 8, 1, c));
    },
    penguin(g, x, y) {
      R(g, x + 1, y + 1, 10, 13, '#ffd23f');
      R(g, x + 3, y + 3, 6, 9, '#14171c');
      R(g, x + 4, y + 6, 4, 5, '#e9e9e6');
      R(g, x + 4, y + 4, 1, 1, '#e9e9e6'); R(g, x + 7, y + 4, 1, 1, '#e9e9e6');
      R(g, x + 5, y + 5, 2, 1, '#ff7a17');
      R(g, x + 3, y + 12, 2, 1, '#ff7a17'); R(g, x + 7, y + 12, 2, 1, '#ff7a17');
    },
    motivation(g, x, y) {
      R(g, x + 1, y + 1, 10, 13, '#1d2440');
      R(g, x + 2, y + 9, 8, 4, '#3a414c');
      R(g, x + 4, y + 5, 4, 4, '#5d6878');
      R(g, x + 5, y + 3, 2, 2, '#ffd23f');
      R(g, x + 6, y + 2, 1, 1, '#ff3b5c');
      R(g, x + 2, y + 13, 8, 1, '#e9e9e6');
    },
  };
  function posterNew(g, e) {
    const x = e.px + 2, y = e.py - 24;
    R(g, x - 1, y - 1, 14, 17, '#0a0b0e');
    R(g, x, y, 12, 15, '#e9e9e6');
    POSTER_NEW[e.variant](g, x, y);
  }

  function painting(g, e, t) {
    const v = e.variant || 'abstract', W = e.tw * T, x = e.px + 2, y = e.py - 24, w = W - 4, h = 14;
    const frame = e.color || '#c9a06a';
    R(g, x - 1, y - 1, w + 2, h + 2, shade(frame, -0.35));
    R(g, x, y, w, h, frame);
    const ix = x + 1, iy = y + 1, iw = w - 2, ih = h - 2;
    if (v === 'land') {
      R(g, ix, iy, iw, ih, '#a0c3ec');
      R(g, ix, iy + 6, iw, ih - 6, '#3c8059');
      for (let i = 0; i < iw; i++) R(g, ix + i, iy + 5 - Math.round(Math.abs(Math.sin(i * 0.5)) * 3), 1, 2, '#5d6878');
      R(g, ix + iw - 4, iy + 1, 2, 2, '#ffd23f');
    } else if (v === 'night') {
      R(g, ix, iy, iw, ih, '#0b1030');
      for (let i = 0; i < iw; i += 3) R(g, ix + i, iy + ((i * 7) % (ih - 4)), 1, 1, '#ffffff');
      R(g, ix + 2, iy + 2, 3, 3, '#e9e9e6');
      for (let i = 0; i < iw; i += 4) R(g, ix + i, iy + ih - 3 - (i % 3), 3, 3 + (i % 3), '#1d2440');
    } else {
      R(g, ix, iy, iw, ih, '#e9e9e6');
      R(g, ix + 1, iy + 2, Math.floor(iw / 2), 6, '#ff3b5c');
      R(g, ix + Math.floor(iw / 3), iy + 5, Math.floor(iw / 2), 5, '#2a5d8a');
      R(g, ix + iw - 4, iy + 1, 3, 3, '#ffd23f');
      R(g, ix + 2, iy + ih - 2, iw - 4, 1, '#14171c');
    }
  }

  function dclock(g, e) {
    const x = e.px + 1, y = e.py - 20, d = new Date();
    const hh = String(d.getHours()).padStart(2, '0'), mm = String(d.getMinutes()).padStart(2, '0');
    R(g, x, y, 14, 7, '#0a0b0e');
    R(g, x, y, 14, 1, '#2a2f38');
    const col = e.color || '#ff3b5c';
    // tiny 3×5 digits
    const D = { 0: 'xxxx xx xx xxxx', 1: ' x xx  x  x xxx', 2: 'xxx  xxxxx  xxx', 3: 'xxx  xxxx  xxxx', 4: 'x xx xxxx  x  x', 5: 'xxxx  xxx  xxxx', 6: 'xxxx  xxxx xxxx', 7: 'xxx  x  x  x  x', 8: 'xxxx xxxxx xxxx', 9: 'xxxx xxxx  xxxx' };
    const digit = (n, dx) => { const p = (D[n] || D[0]).padEnd(15, ' '); for (let i = 0; i < 15; i++) if (p[i] === 'x') R(g, x + dx + (i % 3), y + 1 + Math.floor(i / 3), 1, 1, col); };
    digit(hh[0], 1); digit(hh[1], 4);
    if (d.getSeconds() % 2) { R(g, x + 7, y + 2, 1, 1, col); R(g, x + 7, y + 4, 1, 1, col); }
    digit(mm[0], 8); digit(mm[1], 11);
  }

  function wclock(g, e, t) {
    const d = new Date(), base = d.getUTCHours() + d.getUTCMinutes() / 60;
    [[-3, '#e9e9e6'], [0, '#a0c3ec'], [9, '#ffc285']].forEach(([off, face], i) => {
      const cx = e.px + 5 + i * 11, cy = e.py - 16;
      R(g, cx - 4, cy - 4, 9, 9, '#0a0b0e');
      R(g, cx - 3, cy - 3, 7, 7, face);
      const hr = ((base + off + 24) % 12) / 12 * Math.PI * 2;
      for (let r = 0; r <= 2; r++) R(g, Math.round(cx + Math.sin(hr) * r), Math.round(cy - Math.cos(hr) * r), 1, 1, '#1c2129');
      const mn = (d.getUTCMinutes() / 60) * Math.PI * 2;
      for (let r = 0; r <= 3; r++) R(g, Math.round(cx + Math.sin(mn) * r), Math.round(cy - Math.cos(mn) * r), 1, 1, '#ff3b5c');
      R(g, cx - 2, cy + 6, 5, 1, '#5d6878');
    });
  }

  function lamparc(g, e) {
    const px = e.px, py = e.py, c = e.color || '#ffc285';
    R(g, px + 1, py + 11, 8, 3, 'rgba(0,0,0,0.3)');
    R(g, px + 1, py + 10, 7, 3, '#3a414c');
    R(g, px + 4, py - 18, 1, 28, '#c9ced6');
    R(g, px + 5, py - 21, 4, 1, '#c9ced6'); R(g, px + 9, py - 20, 3, 1, '#c9ced6'); R(g, px + 12, py - 19, 2, 2, '#c9ced6');
    R(g, px + 11, py - 17, 5, 3, '#2a2f38');
    R(g, px + 12, py - 14, 3, 1, c);
  }

  function desklamp(g, e) {
    const px = e.px, py = e.py, c = e.color || '#ffc285';
    R(g, px + 4, py - 3, 6, 2, '#2a2f38');
    R(g, px + 6, py - 10, 1, 7, '#3a414c');
    R(g, px + 7, py - 12, 4, 1, '#3a414c');
    R(g, px + 9, py - 12, 4, 3, '#2a2f38');
    R(g, px + 10, py - 9, 2, 1, c);
  }

  function rgblamp(g, e, t) {
    const px = e.px, py = e.py;
    R(g, px + 4, py + 11, 8, 2, 'rgba(0,0,0,0.3)');
    R(g, px + 5, py + 9, 6, 3, '#14171c');
    for (let i = 0; i < 26; i++) { g.fillStyle = e.color && e.variant !== 'rainbow' ? e.color : hsl(t * 80 + i * 8, 1); g.fillRect(px + 6, py + 8 - i, 4, 1); }
    R(g, px + 6, py - 18, 4, 1, 'rgba(255,255,255,0.6)');
  }

  function toolboard(g, e) {
    const x = e.px + 1, y = e.py - 24;
    R(g, x, y, 14, 16, '#8a6a42');
    R(g, x, y, 14, 1, '#a88456');
    for (let j = 0; j < 4; j++) for (let i = 0; i < 4; i++) R(g, x + 2 + i * 3, y + 2 + j * 4, 1, 1, '#5a4434');
    R(g, x + 2, y + 3, 1, 8, '#9aa3b0'); R(g, x + 1, y + 3, 3, 1, '#c0392b');
    R(g, x + 6, y + 2, 2, 6, '#c9ced6'); R(g, x + 6, y + 7, 2, 3, '#ffd23f');
    R(g, x + 10, y + 3, 3, 3, '#5d6878'); R(g, x + 11, y + 6, 1, 5, '#5d6878');
    R(g, x + 2, y + 13, 10, 2, '#2a2f38');
  }

  function toolbox(g, e) {
    const px = e.px, py = e.py, c = e.color || '#c0392b';
    R(g, px + 2, py - 8, 12, 7, c);
    R(g, px + 2, py - 8, 12, 1, shade(c, 0.25));
    R(g, px + 2, py - 5, 12, 1, shade(c, -0.35));
    R(g, px + 6, py - 11, 4, 1, '#2a2f38'); R(g, px + 6, py - 11, 1, 3, '#2a2f38'); R(g, px + 9, py - 11, 1, 3, '#2a2f38');
    R(g, px + 7, py - 4, 2, 1, '#c9ced6');
  }

  function ladder(g, e) {
    const px = e.px, py = e.py;
    R(g, px + 2, py + 12, 12, 2, 'rgba(0,0,0,0.3)');
    R(g, px + 3, py - 18, 1, 31, '#c9ced6'); R(g, px + 12, py - 18, 1, 31, '#c9ced6');
    R(g, px + 4, py - 20, 8, 3, '#ffd23f');
    for (let k = 0; k < 5; k++) R(g, px + 4, py - 12 + k * 5, 8, 1, '#9aa3b0');
  }

  function spool(g, e) {
    const px = e.px, py = e.py, c = e.color || '#2a5d8a';
    R(g, px + 1, py + 12, 14, 2, 'rgba(0,0,0,0.3)');
    R(g, px + 1, py - 6, 14, 18, '#8a6a42');
    R(g, px + 1, py - 6, 14, 1, '#a88456');
    R(g, px + 3, py - 3, 10, 12, c);
    for (let k = 0; k < 4; k++) R(g, px + 3, py - 2 + k * 3, 10, 1, shade(c, -0.3));
    R(g, px + 7, py + 1, 2, 2, '#5a4434');
  }

  function fireext(g, e) {
    const px = e.px, py = e.py;
    R(g, px + 5, py + 12, 7, 2, 'rgba(0,0,0,0.3)');
    R(g, px + 5, py - 6, 6, 18, '#c0392b');
    R(g, px + 5, py - 6, 2, 18, '#e0503f');
    R(g, px + 6, py - 9, 4, 3, '#2a2f38');
    R(g, px + 10, py - 8, 3, 1, '#2a2f38'); R(g, px + 12, py - 8, 1, 6, '#2a2f38');
    R(g, px + 6, py, 4, 3, '#e9e9e6');
  }

  // things that go on a table
  function surfaceThing(g, e, t) {
    const px = e.px, py = e.py;
    switch (e.kind) {
      case 'mug': R(g, px + 6, py - 6, 4, 4, e.color || '#e9e9e6'); R(g, px + 10, py - 5, 1, 2, e.color || '#e9e9e6'); R(g, px + 6, py - 6, 4, 1, '#5a3a25'); break;
      case 'papers':
        for (let k = 0; k < 4; k++) R(g, px + 3 + (k % 2), py - 3 - k, 9, 2, k % 2 ? '#e9e9e6' : '#d9dde3');
        R(g, px + 4, py - 6, 6, 1, '#8a919c');
        break;
      case 'books': {
        const cols = ['#c0392b', '#2a5d8a', '#1f6f5c', '#ffd23f', '#7c3aed'];
        for (let k = 0; k < 5; k++) R(g, px + 3 + k * 2, py - 9 + (k % 2), 2, 8 - (k % 2), cols[(k + e.seed) % cols.length]);
        break;
      }
      case 'globe': R(g, px + 6, py - 3, 4, 2, '#5a4434'); R(g, px + 7, py - 5, 1, 2, '#5a4434'); R(g, px + 4, py - 13, 8, 8, '#2a5d8a'); R(g, px + 5, py - 11, 3, 3, '#3c8059'); R(g, px + 9, py - 9, 2, 2, '#3c8059'); R(g, px + 4, py - 13, 8, 1, '#5a8ec5'); break;
      case 'trophy': R(g, px + 5, py - 3, 6, 2, '#3a2a1f'); R(g, px + 7, py - 6, 2, 3, '#d8b23a'); R(g, px + 5, py - 12, 6, 6, '#ffd23f'); R(g, px + 4, py - 11, 1, 3, '#ffd23f'); R(g, px + 11, py - 11, 1, 3, '#ffd23f'); R(g, px + 6, py - 11, 1, 3, '#fff2a8'); break;
      case 'console': {
        const hue = t * 60;
        R(g, px + 3, py - 7, 10, 5, '#14171c'); R(g, px + 3, py - 7, 10, 1, '#2a2f38');
        g.fillStyle = hsl(hue, 0.9); g.fillRect(px + 3, py - 3, 10, 1);
        R(g, px + 1, py - 2, 5, 2, '#2a2f38'); R(g, px + 2, py - 2, 1, 1, '#ff3b5c'); R(g, px + 4, py - 2, 1, 1, '#00e5ff');
        break;
      }
      case 'figure': R(g, px + 6, py - 3, 4, 2, '#2a2f38'); R(g, px + 6, py - 10, 4, 7, e.color || '#7c3aed'); R(g, px + 6, py - 14, 4, 4, '#f2c8a0'); R(g, px + 6, py - 15, 4, 2, '#1a1210'); R(g, px + 5, py - 9, 1, 4, e.color || '#7c3aed'); R(g, px + 10, py - 9, 1, 4, e.color || '#7c3aed'); break;
    }
  }

  const SIGNS = {
    exit: { bg: '#1f8a4c', fg: '#ffffff', art: (g, x, y) => { R(g, x + 2, y + 2, 2, 1, '#ffffff'); R(g, x + 3, y + 3, 2, 3, '#ffffff'); R(g, x + 2, y + 5, 1, 2, '#ffffff'); R(g, x + 5, y + 5, 2, 1, '#ffffff'); R(g, x + 9, y + 2, 3, 5, '#ffffff'); R(g, x + 10, y + 3, 1, 3, '#1f8a4c'); } },
    volt: { bg: '#ffd23f', fg: '#14171c', art: (g, x, y) => { R(g, x + 6, y + 1, 2, 2, '#14171c'); R(g, x + 5, y + 3, 2, 2, '#14171c'); R(g, x + 5, y + 5, 4, 1, '#14171c'); R(g, x + 7, y + 6, 1, 2, '#14171c'); } },
    server: { bg: '#2a5d8a', fg: '#ffffff', art: (g, x, y) => { for (let k = 0; k < 3; k++) { R(g, x + 3, y + 1 + k * 2, 8, 1, '#ffffff'); R(g, x + 9, y + 1 + k * 2, 1, 1, '#7ee0a1'); } } },
    nofood: { bg: '#e9e9e6', fg: '#c0392b', art: (g, x, y) => { R(g, x + 4, y + 1, 6, 6, '#c0392b'); R(g, x + 5, y + 2, 4, 4, '#e9e9e6'); R(g, x + 6, y + 3, 2, 2, '#5a3a25'); for (let k = 0; k < 4; k++) R(g, x + 5 + k, y + 2 + k, 1, 1, '#c0392b'); } },
  };
  function sign(g, e) {
    const s = SIGNS[e.variant] || SIGNS.exit, x = e.px + 1, y = e.py - 21;
    R(g, x, y, 14, 8, s.bg);
    R(g, x, y, 14, 1, shade(s.bg, 0.25));
    R(g, x, y + 7, 14, 1, shade(s.bg, -0.3));
    s.art(g, x, y);
  }

  function barrel(g, e) {
    const px = e.px, py = e.py, c = e.color || '#2a5d8a';
    R(g, px + 2, py + 12, 13, 2, 'rgba(0,0,0,0.3)');
    R(g, px + 3, py - 8, 10, 20, c);
    R(g, px + 3, py - 8, 3, 20, shade(c, 0.18));
    R(g, px + 3, py - 10, 10, 2, shade(c, -0.2));
    for (const y of [py - 3, py + 5]) R(g, px + 3, y, 10, 1, shade(c, -0.4));
    R(g, px + 7, py - 1, 3, 3, '#ffd23f');
  }

  function pallet(g, e) {
    const px = e.px, py = e.py;
    R(g, px + 1, py + 12, 14, 2, 'rgba(0,0,0,0.3)');
    R(g, px + 1, py + 8, 14, 4, '#a88456');
    for (const x of [1, 7, 13]) R(g, px + x, py + 10, 2, 2, '#5a4434');
    R(g, px + 2, py - 4, 6, 12, '#c9a06a'); R(g, px + 8, py - 1, 6, 9, '#b08a5a'); R(g, px + 4, py - 10, 8, 6, '#c9a06a');
    R(g, px + 2, py - 4, 6, 1, '#d9b47e'); R(g, px + 4, py - 10, 8, 1, '#d9b47e');
    R(g, px + 5, py - 7, 3, 1, '#e9e9e6');
  }

  function pipes(g, e) {
    const x = e.px, y = e.py - 24, W = e.tw * T;
    R(g, x, y + 2, W, 3, '#6b7280'); R(g, x, y + 2, W, 1, '#8a919c');
    R(g, x, y + 8, W, 2, '#c98a3c'); R(g, x, y + 8, W, 1, '#e0a85a');
    for (let i = 4; i < W; i += 12) { R(g, x + i, y + 1, 2, 5, '#4a515c'); R(g, x + i, y + 7, 2, 4, '#4a515c'); }
    R(g, x + W - 6, y + 4, 3, 3, '#c0392b');
  }

  function gear(g, e, t) {
    const cx = e.px + 8, cy = e.py - 16, a = t * 0.4, c = e.color || '#8a919c';
    for (let k = 0; k < 8; k++) { const an = a + (k / 8) * Math.PI * 2; R(g, Math.round(cx + Math.cos(an) * 6) - 1, Math.round(cy + Math.sin(an) * 6) - 1, 2, 2, c); }
    R(g, cx - 4, cy - 4, 9, 9, c);
    R(g, cx - 3, cy - 5, 7, 11, c);
    R(g, cx - 1, cy - 1, 3, 3, '#14171c');
  }

  function robot(g, e, t) {
    const px = e.px, py = e.py, c = e.color || '#9aa3b0', eye = Math.sin(t * 3) > 0.9 ? '#14171c' : '#00e5ff';
    R(g, px + 3, py + 12, 10, 2, 'rgba(0,0,0,0.3)');
    R(g, px + 5, py + 6, 2, 6, '#5d6878'); R(g, px + 9, py + 6, 2, 6, '#5d6878');
    R(g, px + 3, py - 6, 10, 12, c); R(g, px + 3, py - 6, 10, 1, shade(c, 0.25));
    R(g, px + 5, py - 3, 6, 4, '#14171c'); R(g, px + 6, py - 2, 1, 1, '#ff7a17'); R(g, px + 8, py - 1, 2, 1, '#7ee0a1');
    R(g, px + 1, py - 4, 2, 7, shade(c, -0.2)); R(g, px + 13, py - 4, 2, 7, shade(c, -0.2));
    R(g, px + 4, py - 15, 8, 8, c); R(g, px + 4, py - 15, 8, 1, shade(c, 0.25));
    R(g, px + 5, py - 12, 2, 2, eye); R(g, px + 9, py - 12, 2, 2, eye);
    R(g, px + 7, py - 18, 2, 3, '#5d6878'); R(g, px + 7, py - 19, 2, 1, '#ff3b5c');
  }

  function oldserver(g, e, t) {
    const px = e.px, py = e.py;
    R(g, px + 1, py + 12, 14, 2, 'rgba(0,0,0,0.3)');
    R(g, px + 1, py - 14, 14, 26, '#c9c2a8');
    R(g, px + 1, py - 14, 14, 1, '#e0d9c0');
    R(g, px + 3, py - 11, 10, 3, '#8a8470'); R(g, px + 3, py - 6, 10, 3, '#8a8470');
    R(g, px + 4, py - 10, 6, 1, '#14171c'); R(g, px + 4, py - 5, 6, 1, '#14171c');
    R(g, px + 11, py - 10, 1, 1, Math.sin(t * 6) > 0 ? '#7ee0a1' : '#1f4a35');
    R(g, px + 3, py, 10, 8, '#b5ae94');
    for (let k = 0; k < 3; k++) R(g, px + 4, py + 1 + k * 2, 8, 1, '#8a8470');
    R(g, px + 3, py + 10, 3, 1, '#ff7a17');
  }

  function wallscreen(g, e, t) {
    const W = e.tw * T, x = e.px + 1, y = e.py - 26, w = W - 2, h = 16;
    R(g, x, y, w, h, '#0c0e12');
    R(g, x, y, w, 1, '#262a31');
    const sx = x + 1, sy = y + 1, sw = w - 2, sh = h - 3;
    R(g, sx, sy, sw, sh, '#0b1424');
    for (let i = 0; i < 4; i++) { const v = 2 + Math.round((Math.sin(t * 0.8 + i * 1.7 + e.seed) + 1) * 2.5); R(g, sx + 2 + i * 3, sy + sh - 1 - v, 2, v, [C.breeze, C.ok, C.twilight || '#7c5cff', C.warnSoft][i]); }
    for (let i = 0; i < sw - 16; i++) R(g, sx + 15 + i, sy + 5 + Math.round(Math.sin(t * 2 + i * 0.6) * 2), 1, 1, C.ok);
    R(g, sx + 15, sy + 1, Math.round((sw - 17) * (0.6 + 0.3 * Math.sin(t * 0.2))), 1, C.breeze);
    R(g, x + w / 2 - 1, y + h - 1, 2, 1, '#3a414c');
  }

  function rgbstrip(g, e, t) {
    const W = e.tw * T, y = e.py - 26;
    for (let i = 0; i < W; i++) {
      g.fillStyle = e.variant === 'rainbow' || !e.color ? hsl(t * 90 + i * 9, 1) : rgba(e.color, 0.6 + 0.4 * Math.sin(t * 3 + i * 0.3));
      g.fillRect(e.px + i, y, 1, 2);
    }
    g.fillStyle = 'rgba(255,255,255,0.35)';
    g.fillRect(e.px, y, W, 1);
  }

  function hexpanel(g, e, t) {
    const cells = [[2, -24], [8, -24], [5, -19], [11, -19], [2, -14], [8, -14]];
    cells.forEach(([dx, dy], i) => {
      const col = e.variant === 'rainbow' || !e.color ? hsl(t * 50 + i * 55, 0.95) : rgba(e.color, 0.55 + 0.45 * Math.sin(t * 2 + i));
      const x = e.px + dx, y = e.py + dy;
      g.fillStyle = '#14171c'; g.fillRect(x, y + 1, 5, 3); g.fillRect(x + 1, y, 3, 5);
      g.fillStyle = col; g.fillRect(x + 1, y + 1, 3, 3);
    });
  }

  function rgbsign(g, e, t) {
    const W = e.tw * T, x0 = e.px + 3, y0 = e.py - 22;
    // "DATA" in 3×5 letters
    const L = { D: 'xx x xx xx xxx ', A: ' x x xxxxx xx x', T: 'xxx x  x  x  x ' };
    const word = 'DATA';
    R(g, e.px + 1, y0 - 2, W - 2, 9, '#0a0b0e');
    for (let k = 0; k < word.length; k++) {
      const p = L[word[k]];
      g.fillStyle = e.variant === 'rainbow' || !e.color ? hsl(t * 80 + k * 50, 1) : e.color;
      for (let i = 0; i < 15; i++) if (p[i] === 'x') g.fillRect(x0 + k * 7 + (i % 3) * 2, y0 + Math.floor(i / 3), 2, 1);
    }
  }

  function rgbbar(g, e, t) {
    const px = e.px, py = e.py;
    R(g, px + 3, py + 11, 10, 2, 'rgba(0,0,0,0.3)');
    R(g, px + 3, py + 8, 10, 4, '#14171c');
    for (let i = 0; i < 24; i++) { g.fillStyle = e.variant === 'rainbow' || !e.color ? hsl(t * 100 - i * 12, 1) : rgba(e.color, 0.4 + 0.6 * ((i + Math.floor(t * 12)) % 6 === 0)); g.fillRect(px + 4, py + 8 - i, 1, 1); g.fillRect(px + 11, py + 8 - i, 1, 1); }
    R(g, px + 5, py - 15, 6, 23, 'rgba(20,23,28,0.85)');
  }

  function wallshelf(g, e, t) {
    const x = e.px, y = e.py - 14, v = e.variant || '';
    R(g, x + 1, y, 14, 2, e.color || '#6b5038');
    R(g, x + 1, y, 14, 1, shade(e.color || '#6b5038', 0.25));
    R(g, x + 3, y + 2, 1, 3, '#2a2f38'); R(g, x + 12, y + 2, 1, 3, '#2a2f38');
    if (v === 'plants') {
      R(g, x + 3, y - 4, 4, 4, '#c9c7c2'); R(g, x + 2, y - 8, 6, 4, '#3c8059'); R(g, x + 4, y - 10, 2, 2, '#58a578');
      R(g, x + 10, y - 3, 3, 3, '#b8562c'); R(g, x + 10, y - 7, 1, 4, '#3c8059'); R(g, x + 12, y - 6, 1, 3, '#58a578');
      for (let k = 0; k < 4; k++) R(g, x + 3 + (k % 2), y + 2 + k * 2, 1, 2, '#2c5f45');
    } else if (v === 'books') {
      const cols = ['#c0392b', '#2a5d8a', '#1f6f5c', '#ffd23f', '#7c3aed', '#e9e9e6'];
      for (let k = 0; k < 6; k++) R(g, x + 2 + k * 2, y - 6 + (k % 3 === 1 ? 1 : 0), 2, 6 - (k % 3 === 1 ? 1 : 0), cols[(k + e.seed) % cols.length]);
    } else {
      R(g, x + 2, y - 5, 4, 5, '#b08a5a'); R(g, x + 2, y - 5, 4, 1, '#d9b47e');
      R(g, x + 8, y - 6, 3, 6, '#ffd23f'); R(g, x + 7, y - 6, 5, 1, '#ffd23f');
      R(g, x + 12, y - 3, 2, 3, '#e9e9e6');
    }
  }

  function wallplant(g, e) {
    const x = e.px, y = e.py - 22;
    R(g, x + 7, y - 2, 2, 2, '#2a2f38');
    R(g, x + 4, y, 8, 5, '#c9c7c2'); R(g, x + 4, y, 8, 1, '#e9e9e6');
    for (let k = 0; k < 5; k++) { R(g, x + 3 + k * 2, y + 5, 1, 3 + ((k * 3) % 5), '#3c8059'); R(g, x + 3 + k * 2, y + 7 + ((k * 3) % 5), 2, 1, '#58a578'); }
    R(g, x + 3, y - 2, 4, 2, '#58a578'); R(g, x + 9, y - 3, 4, 3, '#3c8059');
  }

  /* ------------------------------------------------------------------ */
  /* Drawing dispatch + the generic turn                                 */
  /* ------------------------------------------------------------------ */
  const DRAW = {
    cabinet, drawers, steelrack, tvrack, printer,
    painting, dclock, wclock, lamparc, desklamp, rgblamp, toolboard, toolbox, ladder, spool, fireext,
    mug: surfaceThing, papers: surfaceThing, books: surfaceThing, globe: surfaceThing, trophy: surfaceThing, console: surfaceThing, figure: surfaceThing,
    sign, barrel, pallet, pipes, gear, robot, oldserver, wallscreen, rgbstrip, hexpanel, rgbsign, rgbbar, wallshelf, wallplant,
  };
  // kinds that draw every side themselves (the generic turn leaves them alone)
  const ROT_NATIVE = {
    desk: 1, chair: 1, table: 1, monitor: 1, sofa: 1, shelf: 1, whiteboard: 1, rack: 1, switch: 1, router: 1, core: 1, storage: 1, crac: 1, ups: 1,
    door: 1, wallseg: 1, glass: 1, glassH: 1, videowall: 1, camera: 1, ap: 1,
    cabinet: 1, drawers: 1, steelrack: 1, tvrack: 1, printer: 1,
  };
  for (const k of DL.PROPS_ROT_NATIVE || []) ROT_NATIVE[k] = 1; // props.js kinds draw their own sides
  DL.ROT_NATIVE = ROT_NATIVE;
  // text / logos read wrong mirrored: those are only turned to the side, never flipped
  const NO_MIRROR = { sign: 1, rgbsign: 1, dclock: 1, banner: 1, poster: 1, painting: 1, wallscreen: 1 };

  const isRugKind = (k) => k === 'rug' || k.indexOf('rug_') === 0;
  const SC = document.createElement('canvas');
  SC.width = 112; SC.height = 120;
  const sg = SC.getContext('2d');
  sg.imageSmoothingEnabled = false;
  const OX = 40, OY = 80; // where the item's tile origin lands on the scratch canvas

  // Draws the unrotated sprite on the scratch canvas, then copies it back turned.
  function drawTurned(base, g, e, t) {
    const r = e.rot | 0;
    sg.setTransform(1, 0, 0, 1, 0, 0);
    sg.clearRect(0, 0, SC.width, SC.height);
    const k = { px: e.px, py: e.py };
    e.px = OX; e.py = OY;
    if (isRugKind(e.kind)) {
      // flat: a real quarter turn around the centre of its (square) footprint
      e.rot = 0;
      try { base(sg, e, t); } finally { e.rot = r; e.px = k.px; e.py = k.py; }
      const W = e.tw * T, H = e.th * T, ang = { 1: Math.PI, 2: -Math.PI / 2, 3: Math.PI / 2 }[r] || 0;
      g.save();
      g.translate(k.px + W / 2, k.py + H / 2);
      g.rotate(ang);
      g.drawImage(SC, OX, OY, W, H, -W / 2, -H / 2, W, H);
      g.restore();
      return;
    }
    e.rot = 0;
    try { base(sg, e, t); } finally { e.rot = r; e.px = k.px; e.py = k.py; }
    const side = r === 2 || r === 3, flip = (r === 1 || r === 3) && !NO_MIRROR[e.kind];
    const cx = k.px + e.tw * 8, sx = side ? 0.72 : 1;
    g.save();
    g.translate(cx, 0);
    g.scale(flip ? -sx : sx, 1);
    g.drawImage(SC, k.px - OX - cx, k.py - OY);
    g.restore();
  }

  const base = DL.drawItem, baseGeom = DL.itemGeom;
  function drawPlain(g, e, t) {
    const f = DRAW[e.kind];
    if (f) return f(g, e, t || 0);
    if (e.kind === 'plant' && (e.variant === 'monstera' || e.variant === 'snake' || e.variant === 'ficus')) return plantNew(g, e);
    if (e.kind === 'poster' && POSTER_NEW[e.variant]) return posterNew(g, e);
    base(g, e, t);
  }
  DL.drawItem = function (g, e, t) {
    if (e.rot && !ROT_NATIVE[e.kind] && e.kind && e.kind.indexOf('unit-') !== 0) return drawTurned(drawPlain, g, e, t || 0);
    drawPlain(g, e, t);
  };

  const BOUNDS = {
    cabinet: (e) => ({ x: e.px, y: e.py - 21, w: e.tw * T, h: e.th * T + 20 }),
    drawers: (e) => ({ x: e.px + 1, y: e.py - (e.variant === 'low' ? 2 : e.variant === 'wood' ? 7 : 13), w: 14, h: e.variant === 'low' ? 17 : e.variant === 'wood' ? 22 : 28 }),
    steelrack: (e) => ({ x: e.px, y: e.py - 21, w: e.tw * T, h: e.th * T + 20 }),
    tvrack: (e) => ({ x: e.px, y: e.py - 20, w: e.tw * T, h: e.th * T + 20 }),
    printer: (e) => ({ x: e.px, y: e.py - 11, w: 16, h: 26 }),
    painting: (e) => ({ x: e.px, y: e.py - 26, w: e.tw * T, h: 18 }),
    dclock: (e) => ({ x: e.px, y: e.py - 21, w: 16, h: 9 }),
    wclock: (e) => ({ x: e.px, y: e.py - 21, w: e.tw * T, h: 14 }),
    lamparc: (e) => ({ x: e.px, y: e.py - 22, w: 16, h: 36 }),
    desklamp: (e) => ({ x: e.px + 3, y: e.py - 13, w: 11, h: 12 }),
    rgblamp: (e) => ({ x: e.px + 4, y: e.py - 19, w: 8, h: 33 }),
    toolboard: (e) => ({ x: e.px, y: e.py - 25, w: 16, h: 18 }),
    toolbox: (e) => ({ x: e.px + 1, y: e.py - 12, w: 14, h: 12 }),
    ladder: (e) => ({ x: e.px + 2, y: e.py - 21, w: 12, h: 35 }),
    spool: (e) => ({ x: e.px, y: e.py - 7, w: 16, h: 21 }),
    fireext: (e) => ({ x: e.px + 4, y: e.py - 10, w: 9, h: 24 }),
    mug: (e) => ({ x: e.px + 5, y: e.py - 7, w: 7, h: 6 }),
    papers: (e) => ({ x: e.px + 2, y: e.py - 7, w: 12, h: 6 }),
    books: (e) => ({ x: e.px + 2, y: e.py - 10, w: 12, h: 10 }),
    globe: (e) => ({ x: e.px + 3, y: e.py - 14, w: 10, h: 14 }),
    trophy: (e) => ({ x: e.px + 3, y: e.py - 13, w: 10, h: 13 }),
    console: (e) => ({ x: e.px + 1, y: e.py - 8, w: 13, h: 8 }),
    figure: (e) => ({ x: e.px + 4, y: e.py - 16, w: 8, h: 16 }),
    sign: (e) => ({ x: e.px, y: e.py - 22, w: 16, h: 10 }),
    barrel: (e) => ({ x: e.px + 2, y: e.py - 11, w: 12, h: 25 }),
    pallet: (e) => ({ x: e.px, y: e.py - 11, w: 16, h: 25 }),
    pipes: (e) => ({ x: e.px, y: e.py - 25, w: e.tw * T, h: 12 }),
    gear: (e) => ({ x: e.px, y: e.py - 24, w: 16, h: 16 }),
    robot: (e) => ({ x: e.px, y: e.py - 20, w: 16, h: 34 }),
    oldserver: (e) => ({ x: e.px, y: e.py - 15, w: 16, h: 29 }),
    wallscreen: (e) => ({ x: e.px, y: e.py - 27, w: e.tw * T, h: 18 }),
    rgbstrip: (e) => ({ x: e.px, y: e.py - 28, w: e.tw * T, h: 6 }),
    hexpanel: (e) => ({ x: e.px, y: e.py - 25, w: 16, h: 16 }),
    rgbsign: (e) => ({ x: e.px, y: e.py - 25, w: e.tw * T, h: 12 }),
    rgbbar: (e) => ({ x: e.px + 2, y: e.py - 17, w: 12, h: 31 }),
    wallshelf: (e) => ({ x: e.px, y: e.py - 26, w: 16, h: 20 }),
    wallplant: (e) => ({ x: e.px + 1, y: e.py - 25, w: 14, h: 18 }),
  };
  DL.itemGeom = function (e) {
    baseGeom(e);
    const b = BOUNDS[e.kind];
    if (b) e.bounds = b(e);
    if (e.kind === 'plant' && e.variant === 'ficus') e.bounds = { x: e.px, y: e.py - 26, w: 16, h: 42 };
    if (e.wall) { e.ix = e.px + e.tw * 8; e.iy = e.py + 10; }
  };

  // RGB / lamps glow like the themed objects (decor.js exposes its glow table)
  if (DL.DECOR_GLOW) Object.assign(DL.DECOR_GLOW, {
    rgblamp: (e) => [e.px + 8, e.py - 6, 22, e.color || '#ff2bd6', 0.14],
    rgbbar: (e) => [e.px + 8, e.py - 4, 20, e.color || '#00e5ff', 0.14],
    rgbsign: (e) => [e.px + e.tw * 8, e.py - 20, 26, e.color || '#7c5cff', 0.14],
    hexpanel: (e) => [e.px + 8, e.py - 18, 18, e.color || '#00e5ff', 0.12],
    rgbstrip: (e) => [e.px + e.tw * 8, e.py - 24, 24, e.color || '#ff2bd6', 0.1],
    lamparc: (e) => [e.px + 13, e.py - 10, 26, e.color || '#ffc285', 0.1],
    desklamp: (e) => [e.px + 11, e.py - 6, 12, e.color || '#ffc285', 0.1],
    wallscreen: (e) => [e.px + e.tw * 8, e.py - 18, 22, '#a0c3ec', 0.07],
  });

  /* ------------------------------------------------------------------ */
  /* Catalog                                                             */
  /* ------------------------------------------------------------------ */
  const F = (id, group, name, price, desc, o) => Object.assign({ id, cat: 'furn', group, name, price, desc }, o || {});
  const D = (id, group, name, price, desc, o) => Object.assign({ id, cat: 'deco', group, name, price, desc }, o || {});
  const SURF = { mount: 'surface' }, WALL = { mount: 'wall' };

  DL.FURN_CATALOG = [
    // tables (kind 'table': monitors, coffee and decoration go on top, chairs in front become stations)
    F('table_wood', 'Mesas', 'Mesa de madeira', 650, 'Tampo de madeira maciça.', { kind: 'table', w: 2, h: 1, set: { variant: 'wood' } }),
    F('table_glass', 'Mesas', 'Mesa de vidro', 900, 'Tampo de vidro temperado.', { kind: 'table', w: 2, h: 1, set: { variant: 'glass' } }),
    F('table_small', 'Mesas', 'Mesa lateral', 220, 'Mesinha de apoio de 1 tile.', { kind: 'table', w: 1, h: 1, set: { variant: 'small' } }),
    F('table_stand', 'Mesas', 'Mesa regulável', 1400, 'Sobe e desce: trabalhe em pé.', { kind: 'table', w: 2, h: 1, set: { variant: 'standing' } }),
    F('table_meet', 'Mesas', 'Mesa de reunião', 2200, 'Mesa grande 3×2 com caixa de tomadas.', { kind: 'table', w: 3, h: 2, set: { variant: 'meeting' } }),
    F('bench', 'Bancadas', 'Bancada técnica', 1200, 'Manta ESD verde e morsa para montar servidores.', { kind: 'table', w: 2, h: 1, set: { variant: 'bench' } }),
    F('bench_lab', 'Bancadas', 'Bancada de laboratório', 1900, 'Bancada 3×1 com manta ESD azul.', { kind: 'table', w: 3, h: 1, set: { variant: 'lab' } }),
    F('reception', 'Recepção', 'Balcão de recepção', 2600, 'Balcão 3×1 com painel alto do lado da frente. Aceita monitor e cadeira.', { kind: 'table', w: 3, h: 1, set: { variant: 'reception' } }),
    F('reception2', 'Recepção', 'Balcão compacto', 1600, 'Balcão de recepção 2×1.', { kind: 'table', w: 2, h: 1, set: { variant: 'reception' } }),
    // chairs (kind 'chair': in front of a table with a monitor they become a workstation)
    F('chair_mesh', 'Cadeiras', 'Cadeira ergonômica', 650, 'Encosto de tela e apoio lombar.', { kind: 'chair', solid: false, set: { variant: 'mesh' } }),
    F('chair_exec', 'Cadeiras', 'Cadeira executiva', 900, 'Encosto alto de couro.', { kind: 'chair', solid: false, set: { variant: 'exec' } }),
    F('chair_visit', 'Cadeiras', 'Cadeira de visitante', 280, 'Quatro pés, sem rodinhas.', { kind: 'chair', solid: false, set: { variant: 'visit' } }),
    F('chair_stool', 'Cadeiras', 'Banqueta', 180, 'Para bancadas e balcões.', { kind: 'chair', solid: false, set: { variant: 'stool' } }),
    F('chair_gamer', 'Gamer', 'Cadeira gamer', 1100, 'Encosto de concha com faixas coloridas.', { kind: 'chair', solid: false, set: { variant: 'gamer' } }),
    F('chair_gamer_red', 'Gamer', 'Cadeira gamer vermelha', 1100, 'A mesma concha, em vermelho.', { kind: 'chair', solid: false, set: { variant: 'gamer', color: '#ff3b5c' } }),
    F('chair_gamer_cyan', 'Gamer', 'Cadeira gamer ciano', 1100, 'A mesma concha, em ciano.', { kind: 'chair', solid: false, set: { variant: 'gamer', color: '#00a8c6' } }),
    F('chair_rgb', 'Gamer', 'Cadeira gamer RGB', 1600, 'Encosto alto com LEDs animados.', { kind: 'chair', solid: false, set: { variant: 'rgb' } }),
    // sofas
    F('sofa3', 'Sofás', 'Sofá 3 lugares', 1800, 'Sofá longo, 3×1.', { kind: 'sofa', w: 3, h: 1 }),
    F('armchair', 'Sofás', 'Poltrona', 700, 'Um lugar só.', { kind: 'sofa', w: 1, h: 1, set: { color: '#5a3b2e' } }),
    F('sofa_leather', 'Sofás', 'Sofá de couro', 2400, 'Couro marrom, 2 lugares.', { kind: 'sofa', w: 2, h: 1, set: { color: '#5a3b2e' } }),
    F('sofa_gamer', 'Gamer', 'Sofá gamer RGB', 2600, 'Escuro com luz RGB por baixo.', { kind: 'sofa', w: 2, h: 1, set: { variant: 'gamer', color: '#141026' } }),
    // storage furniture
    F('cabinet', 'Armários', 'Armário alto', 750, 'Duas portas, para material de escritório.'),
    F('cabinet_wide', 'Armários', 'Armário duplo', 1300, 'Quatro portas, 2×1.', { kind: 'cabinet', w: 2, h: 1, set: { variant: 'wide', color: '#6b5038' } }),
    F('locker', 'Armários', 'Armário de aço', 900, 'Escaninhos com chave para a equipe.', { kind: 'cabinet', set: { variant: 'locker' } }),
    F('drawers', 'Gaveteiros', 'Arquivo de aço', 520, 'Quatro gavetas com etiqueta.'),
    F('drawers_low', 'Gaveteiros', 'Gaveteiro volante', 320, 'Três gavetas sobre rodinhas.', { kind: 'drawers', set: { variant: 'low' } }),
    F('drawers_wood', 'Gaveteiros', 'Cômoda de madeira', 600, 'Gavetões de madeira.', { kind: 'drawers', set: { variant: 'wood' } }),
    F('shelf_wide', 'Estantes', 'Estante larga', 800, 'Estante 2×1 cheia de livros.', { kind: 'shelf', w: 2, h: 1 }),
    F('shelf_boxes', 'Estantes', 'Estante de arquivos', 500, 'Caixas-arquivo etiquetadas.', { kind: 'shelf', set: { variant: 'boxes' } }),
    F('shelf_parts', 'Estantes', 'Estante de peças de TI', 600, 'Discos, transceivers e servidores reserva.', { kind: 'shelf', set: { variant: 'parts' } }),
    F('shelf_glass', 'Estantes', 'Vitrine', 900, 'Porta de vidro e colecionáveis.', { kind: 'shelf', set: { variant: 'glass' } }),
    F('wallshelf', 'Prateleiras', 'Prateleira de parede', 140, 'Vai na parede do fundo.', WALL),
    F('wallshelf_books', 'Prateleiras', 'Prateleira de livros', 160, 'Livros na parede do fundo.', { kind: 'wallshelf', mount: 'wall', set: { variant: 'books' } }),
    F('wallshelf_plants', 'Prateleiras', 'Prateleira com plantas', 180, 'Vasinhos e uma pendente.', { kind: 'wallshelf', mount: 'wall', set: { variant: 'plants' } }),
    F('steelrack', 'Racks', 'Rack de aço', 700, 'Estante aberta 2×1 para estoque.', { w: 2, h: 1 }),
    F('steelrack_cable', 'Racks', 'Rack de cabos', 450, 'Bobinas e rolos de cabo.', { kind: 'steelrack', set: { variant: 'cable' } }),
    F('tvrack', 'Racks', 'Rack com TV', 1900, 'Móvel baixo com TV de status, 2×1.', { w: 2, h: 1 }),
    F('audiorack', 'Racks', 'Rack de som', 900, 'Caixa de som e equalizador.', { kind: 'tvrack', set: { variant: 'audio' } }),
  ];

  DL.DECO_CATALOG = [
    D('plant_cactus', 'Plantas', 'Cacto', 60, 'Quase não precisa de água.', { kind: 'plant', set: { variant: 'cactus' } }),
    D('plant_palm', 'Plantas', 'Palmeira', 120, 'Folhas largas.', { kind: 'plant', set: { variant: 'palm' } }),
    D('plant_flower', 'Plantas', 'Vaso de flores', 90, 'Um pouco de cor.', { kind: 'plant', set: { variant: 'flower' } }),
    D('plant_monstera', 'Plantas', 'Costela-de-adão', 140, 'Folhas recortadas em vaso claro.', { kind: 'plant', set: { variant: 'monstera' } }),
    D('plant_snake', 'Plantas', 'Espada-de-são-jorge', 90, 'Resiste a qualquer turno.', { kind: 'plant', set: { variant: 'snake' } }),
    D('plant_ficus', 'Plantas', 'Ficus', 180, 'Árvore de interior, bem alta.', { kind: 'plant', set: { variant: 'ficus' } }),
    D('wallplant', 'Plantas', 'Vaso suspenso', 120, 'Planta pendente na parede do fundo.', WALL),
    D('poster_osi', 'Quadros', 'Pôster camadas OSI', 60, 'Da física à aplicação.', { kind: 'poster', mount: 'wall', set: { variant: 'osi' } }),
    D('poster_penguin', 'Quadros', 'Pôster pinguim', 60, 'Para quem vive no terminal.', { kind: 'poster', mount: 'wall', set: { variant: 'penguin' } }),
    D('poster_motivation', 'Quadros', 'Pôster motivacional', 60, 'Topo da montanha.', { kind: 'poster', mount: 'wall', set: { variant: 'motivation' } }),
    D('poster_game', 'Gamer', 'Pôster gamer', 60, 'Arte de videogame.', { kind: 'poster', mount: 'wall', set: { variant: 'game' } }),
    D('painting', 'Quadros', 'Quadro abstrato', 220, 'Tela com moldura dourada.', { mount: 'wall', set: { variant: 'abstract' } }),
    D('painting_land', 'Quadros', 'Quadro paisagem', 260, 'Montanhas e céu.', { kind: 'painting', mount: 'wall', set: { variant: 'land' } }),
    D('painting_wide', 'Quadros', 'Quadro panorâmico', 380, 'Céu noturno, 2 tiles de parede.', { kind: 'painting', mount: 'wall', w: 2, h: 1, set: { variant: 'night', color: '#2a2f38' } }),
    D('dclock', 'Relógios', 'Relógio digital', 140, 'Mostra a hora certa.', WALL),
    D('wclock', 'Relógios', 'Relógios de fuso', 320, 'Três cidades lado a lado, 2 tiles.', { mount: 'wall', w: 2, h: 1 }),
    D('lamparc', 'Luminárias', 'Luminária de arco', 320, 'Luz quente sobre o sofá.'),
    D('desklamp', 'Luminárias', 'Luminária de mesa', 90, 'Vai em cima de uma mesa.', SURF),
    D('rgblamp', 'RGB', 'Luminária RGB', 240, 'Coluna de LED arco-íris.'),
    D('toolboard', 'Ferramentas', 'Painel de ferramentas', 260, 'Pegboard com alicates e chaves.', WALL),
    D('toolbox', 'Ferramentas', 'Caixa de ferramentas', 180, 'Vai em cima de uma mesa ou bancada.', SURF),
    D('ladder', 'Ferramentas', 'Escada', 200, 'Para passar cabo no teto.'),
    D('spool', 'Ferramentas', 'Bobina de cabo', 150, 'Cabo de rede para o próximo rack.'),
    D('fireext', 'Placas', 'Extintor', 120, 'CO₂: o certo para equipamentos elétricos.'),
    D('printer', 'Escritório', 'Impressora multifuncional', 1200, 'Imprime, copia e digitaliza.'),
    D('mug', 'Escritório', 'Caneca', 15, 'Em cima de uma mesa.', SURF),
    D('papers', 'Escritório', 'Pilha de documentos', 10, 'Em cima de uma mesa.', SURF),
    D('books', 'Escritório', 'Livros', 60, 'Em cima de uma mesa.', SURF),
    D('globe', 'Escritório', 'Globo', 80, 'Em cima de uma mesa.', SURF),
    D('trophy', 'Escritório', 'Troféu', 120, 'Melhor uptime do ano.', SURF),
    D('sign_exit', 'Placas', 'Placa de saída', 50, 'Na parede do fundo.', { kind: 'sign', mount: 'wall', set: { variant: 'exit' } }),
    D('sign_volt', 'Placas', 'Placa alta tensão', 50, 'Na parede do fundo.', { kind: 'sign', mount: 'wall', set: { variant: 'volt' } }),
    D('sign_server', 'Placas', 'Placa sala de servidores', 80, 'Na parede do fundo.', { kind: 'sign', mount: 'wall', set: { variant: 'server' } }),
    D('sign_nofood', 'Placas', 'Placa proibido comer', 40, 'Na parede do fundo.', { kind: 'sign', mount: 'wall', set: { variant: 'nofood' } }),
    D('console', 'Gamer', 'Console de videogame', 2400, 'Em cima de uma mesa ou do rack de TV.', SURF),
    D('figure', 'Gamer', 'Action figure', 150, 'Em cima de uma mesa.', SURF),
    D('barrel', 'Industrial', 'Tambor industrial', 160, 'Metal pintado.'),
    D('pallet', 'Industrial', 'Palete com caixas', 220, 'Equipamento chegando.'),
    D('pipes', 'Industrial', 'Tubulação aparente', 300, 'Canos na parede do fundo, 2 tiles.', { mount: 'wall', w: 2, h: 1 }),
    D('gear', 'Industrial', 'Engrenagem', 180, 'Gira devagar na parede.', WALL),
    D('robot', 'Tecnologia', 'Robô decorativo', 900, 'Pisca para quem passa.'),
    D('oldserver', 'Tecnologia', 'Servidor vintage', 600, 'Peça de museu dos anos 90.'),
    D('wallscreen', 'Tecnologia', 'TV de status', 1800, 'Painel de métricas na parede, 2 tiles.', { mount: 'wall', w: 2, h: 1 }),
    D('rgbstrip', 'RGB', 'Fita LED de parede', 200, 'Faixa de luz na parede, 2 tiles.', { mount: 'wall', w: 2, h: 1 }),
    D('hexpanel', 'RGB', 'Painéis hexagonais', 450, 'Painéis de luz na parede.', WALL),
    D('rgbsign', 'RGB', 'Letreiro DATA', 600, 'Letreiro RGB, 2 tiles de parede.', { mount: 'wall', w: 2, h: 1 }),
    D('rgbbar', 'RGB', 'Barra RGB de canto', 220, 'Luz de canto que corre de baixo para cima.'),
  ];

  const NAMES = {
    cabinet: 'Armário', drawers: 'Gaveteiro', steelrack: 'Rack de aço', tvrack: 'Rack com TV', printer: 'Impressora', painting: 'Quadro',
    dclock: 'Relógio digital', wclock: 'Relógios de fuso', lamparc: 'Luminária de arco', desklamp: 'Luminária de mesa', rgblamp: 'Luminária RGB',
    toolboard: 'Painel de ferramentas', toolbox: 'Caixa de ferramentas', ladder: 'Escada', spool: 'Bobina de cabo', fireext: 'Extintor',
    mug: 'Caneca', papers: 'Documentos', books: 'Livros', globe: 'Globo', trophy: 'Troféu', console: 'Console', figure: 'Action figure',
    sign: 'Placa', barrel: 'Tambor', pallet: 'Palete', pipes: 'Tubulação', gear: 'Engrenagem', robot: 'Robô', oldserver: 'Servidor vintage',
    wallscreen: 'TV de status', rgbstrip: 'Fita LED', hexpanel: 'Painéis hexagonais', rgbsign: 'Letreiro DATA', rgbbar: 'Barra RGB',
    wallshelf: 'Prateleira', wallplant: 'Vaso suspenso',
  };
  if (DL.DECOR_NAMES) Object.assign(DL.DECOR_NAMES, NAMES);

  // per-item style options for the inspector (and more choices on the existing kinds)
  const S = DL.ITEM_STYLES;
  if (S) {
    const RGB = ['#ff2bd6', '#00e5ff', '#7c5cff', '#7ee0a1', '#ffd23f', '#ff7a17', '#ff3b5c', '#ffffff'];
    const WOOD = ['#c9c7c2', '#8a919c', '#5d6878', '#6b5038', '#3b2c22', '#2a2e36', '#1d2440', '#1f3a33'];
    const rgbMode = { key: 'variant', label: 'Modo', options: [['', 'Cor fixa'], ['rainbow', 'Arco-íris']] };
    Object.assign(S, {
      cabinet: [{ key: 'variant', label: 'Modelo', options: [['', 'Alto'], ['wide', 'Duplo'], ['locker', 'Escaninhos']] }, { key: 'color', label: 'Cor', colors: WOOD }],
      drawers: [{ key: 'variant', label: 'Modelo', options: [['', 'Arquivo'], ['low', 'Volante'], ['wood', 'Cômoda']] }, { key: 'color', label: 'Cor', colors: WOOD }],
      steelrack: [{ key: 'variant', label: 'Conteúdo', options: [['', 'Caixas'], ['cable', 'Cabos']] }],
      tvrack: [{ key: 'variant', label: 'Modelo', options: [['', 'TV'], ['audio', 'Som']] }, { key: 'color', label: 'Móvel', colors: WOOD }],
      painting: [{ key: 'variant', label: 'Arte', options: [['abstract', 'Abstrato'], ['land', 'Paisagem'], ['night', 'Noite']] }, { key: 'color', label: 'Moldura', colors: ['#c9a06a', '#2a2f38', '#e9e9e6', '#6b5038'] }],
      dclock: [{ key: 'color', label: 'Dígitos', colors: ['#ff3b5c', '#7ee0a1', '#00e5ff', '#ffd23f'] }],
      lamparc: [{ key: 'color', label: 'Luz', colors: ['#ffc285', '#ffe9b0', '#a0c3ec'] }],
      desklamp: [{ key: 'color', label: 'Luz', colors: ['#ffc285', '#ffe9b0', '#a0c3ec', '#ff2bd6'] }],
      rgblamp: [rgbMode, { key: 'color', label: 'Cor', colors: RGB }],
      rgbbar: [rgbMode, { key: 'color', label: 'Cor', colors: RGB }],
      rgbstrip: [rgbMode, { key: 'color', label: 'Cor', colors: RGB }],
      hexpanel: [rgbMode, { key: 'color', label: 'Cor', colors: RGB }],
      rgbsign: [rgbMode, { key: 'color', label: 'Cor', colors: RGB }],
      sign: [{ key: 'variant', label: 'Placa', options: [['exit', 'Saída'], ['volt', 'Alta tensão'], ['server', 'Servidores'], ['nofood', 'Sem comida']] }],
      toolbox: [{ key: 'color', label: 'Cor', colors: ['#c0392b', '#2f3a4d', '#ffd23f', '#1f6f5c'] }],
      spool: [{ key: 'color', label: 'Cabo', colors: ['#2a5d8a', '#c9a13c', '#7c3aed', '#1f6f5c', '#ff7a17'] }],
      barrel: [{ key: 'color', label: 'Cor', colors: ['#2a5d8a', '#c0392b', '#1f6f5c', '#ffd23f', '#3a414c'] }],
      gear: [{ key: 'color', label: 'Metal', colors: ['#8a919c', '#c9a06a', '#5d6878'] }],
      robot: [{ key: 'color', label: 'Cor', colors: ['#9aa3b0', '#e9e9e6', '#ffd23f', '#7c3aed'] }],
      mug: [{ key: 'color', label: 'Cor', colors: ['#e9e9e6', '#c0392b', '#2a5d8a', '#ffd23f', '#14171c'] }],
      figure: [{ key: 'color', label: 'Roupa', colors: ['#7c3aed', '#c0392b', '#2a5d8a', '#1f6f5c'] }],
      wallshelf: [{ key: 'variant', label: 'Itens', options: [['', 'Objetos'], ['books', 'Livros'], ['plants', 'Plantas']] }, { key: 'color', label: 'Madeira', colors: ['#6b5038', '#3b2c22', '#c9c7c2', '#2a2e36'] }],
    });
    const opt = (k, key) => (S[k] || []).find((o) => o.key === key);
    const chairV = opt('chair', 'variant');
    if (chairV) chairV.options = [['', 'Escritório'], ['mesh', 'Ergonômica'], ['exec', 'Executiva'], ['gamer', 'Gamer'], ['rgb', 'RGB'], ['visit', 'Visitante'], ['stool', 'Banqueta']];
    const deskChair = opt('desk', 'chair.variant');
    if (deskChair) deskChair.options = chairV ? chairV.options.filter(([v]) => v !== 'stool' && v !== 'visit') : deskChair.options;
    const plantV = opt('plant', 'variant');
    if (plantV) plantV.options = plantV.options.concat([['monstera', 'Costela'], ['snake', 'Espada'], ['ficus', 'Ficus']]);
    const posterV = opt('poster', 'variant');
    if (posterV) posterV.options = posterV.options.concat([['osi', 'OSI'], ['penguin', 'Pinguim'], ['motivation', 'Motivação']]);
    S.table = [{ key: 'variant', label: 'Tampo', options: [['', 'Padrão'], ['wood', 'Madeira'], ['glass', 'Vidro'], ['standing', 'Regulável'], ['bench', 'Bancada'], ['lab', 'ESD'], ['reception', 'Balcão']] }].concat(S.table || []);
    S.sofa = (S.sofa || []).concat([{ key: 'variant', label: 'Estilo', options: [['', 'Comum'], ['gamer', 'RGB']] }]);
    S.shelf = [{ key: 'variant', label: 'Conteúdo', options: [['', 'Livros'], ['boxes', 'Arquivos'], ['parts', 'Peças'], ['glass', 'Vitrine']] }, { key: 'color', label: 'Cor', colors: ['#2a2f38', '#6b5038', '#c9c7c2', '#1d2440'] }];
  }
})();
