/* DataLab — props: the big catalog expansion. Kitchen (fridge, vending, espresso bar, sink,
   microwave…), TVs and monitors, notebooks, tables (gamer, office, technical, L, round), poufs,
   storage, posters and paintings, plants, clocks, lamps and RGB, rugs, boards, maintenance and
   datacenter accessories, and lots of small things for the desks.
   Same conventions as the rest of the art: procedural pixel sprites in world pixels, drawn facing
   south (rot 0) on their tile; iso.js turns them into volumes (boxes / cards / billboards / flat).
   Loaded after hardware.js and before furniture.js, so the generic rotation and the variants of
   the existing kinds (posters, plants, rugs, tables, monitors, water) flow through the usual layers.
   Interactions (coffee, sofas, TVs, boards…) live in interact.js. */
(function () {
  'use strict';
  const DL = window.DL, T = DL.T, R = DL.R, shade = DL.shade, hash = DL.hash, C = DL.C;
  const hsl = (h, a) => 'hsla(' + (((h % 360) + 360) % 360).toFixed(0) + ',95%,62%,' + Math.max(0, Math.min(1, a)).toFixed(3) + ')';
  const rgba = (hex, a) => (DL.rgba ? DL.rgba(hex, a) : hex);
  const SH = 'rgba(0,0,0,0.3)';

  /* ------------------------------------------------------------------ */
  /* Shared bits                                                         */
  /* ------------------------------------------------------------------ */
  // what a TV shows: news, a match, a dashboard or a nature channel (animated)
  function tvShow(g, x, y, w, h, t, seed, show) {
    const s = show || ['news', 'match', 'dash', 'nature'][seed % 4];
    if (s === 'match') {
      R(g, x, y, w, h, '#1f6f3c');
      R(g, x + Math.floor(w / 2), y, 1, h, '#5fbf7f');
      R(g, x, y + Math.floor(h / 2), w, 1, 'rgba(255,255,255,0.15)');
      for (let i = 0; i < 4; i++) R(g, x + 1 + Math.floor(((Math.sin(t * 0.9 + i * 1.7) + 1) / 2) * (w - 3)), y + 1 + ((i * 3 + seed) % Math.max(1, h - 2)), 1, 1, i % 2 ? '#ff3b5c' : '#ffffff');
      R(g, x + Math.floor(((Math.sin(t * 1.6) + 1) / 2) * (w - 2)), y + Math.floor(h / 2), 1, 1, '#ffd23f');
      R(g, x, y, Math.min(w, 7), 2, '#0c0e12');
      R(g, x + 1, y, 1, 1, '#ffffff'); R(g, x + 4, y, 1, 1, '#ffffff');
    } else if (s === 'dash') {
      R(g, x, y, w, h, '#0b1424');
      for (let i = 0; i < Math.min(5, Math.floor(w / 3)); i++) { const v = 2 + Math.round((Math.sin(t * 0.8 + i * 1.3 + seed) + 1) * (h - 4) / 4); R(g, x + 1 + i * 3, y + h - 1 - v, 2, v, [C.breeze, C.ok, C.twilight, C.warnSoft, C.breeze][i]); }
      for (let i = 0; i < w - 2; i++) if (i > 15) R(g, x + i, y + 3 + Math.round(Math.sin(t * 2 + i * 0.6) * 1.5), 1, 1, C.ok);
    } else if (s === 'nature') {
      R(g, x, y, w, h, '#7fb6e8');
      R(g, x, y + Math.floor(h * 0.6), w, h - Math.floor(h * 0.6), '#3c8059');
      for (let i = 0; i < w; i++) R(g, x + i, y + Math.floor(h * 0.6) - Math.round(Math.abs(Math.sin(i * 0.45 + seed)) * 3), 1, 2, '#5d6878');
      const sx = x + Math.floor(((t * 0.05 + seed * 0.1) % 1) * w);
      R(g, sx, y + 1, 2, 2, '#ffd23f');
    } else {
      R(g, x, y, w, h, '#1d2a44');
      R(g, x + 1, y + 1, Math.floor(w * 0.45), h - 4, '#2c3e66');
      R(g, x + 3, y + 2, 3, 3, '#f2c8a0'); R(g, x + 2, y + 5, 5, 3, '#c0392b');
      R(g, x, y + h - 3, w, 3, '#c0392b');
      const off = Math.floor(t * 10) % 8;
      for (let i = -off; i < w; i += 8) R(g, x + Math.max(0, i), y + h - 2, Math.min(4, w - Math.max(0, i)), 1, '#ffffff');
      R(g, x + w - 6, y + 1, 5, 2, '#ffd23f');
    }
    R(g, x, y, w, 1, 'rgba(255,255,255,0.12)');
  }

  // a narrow side view for the box-like props turned east / west (2D view and thumbnails)
  function sideBox(g, e, col, top) {
    const px = e.px, py = e.py, H = e.th * T, east = e.rot === 2;
    R(g, px + 3, py + H - 3, 11, 2, SH);
    R(g, px + 3, py - top, 10, H + top - 3, shade(col, -0.18));
    R(g, px + 3, py - top, 10, 1, shade(col, 0.2));
    R(g, east ? px + 12 : px + 3, py - top + 1, 1, H + top - 4, col);
  }

  // table art with the same geometry as sprites.js' tables (top band from py-4, front edge, legs),
  // so the isometric view maps its top onto the slab
  function tableArt(g, e, top, edge, leg, extra) {
    const px = e.px, py = e.py, w = e.tw * T, h = e.th * T, depth = h - T + 9;
    R(g, px + 1, py + h - 2, w - 2, 2, SH);
    R(g, px + 2, py + h - 10, 2, 8, leg);
    R(g, px + w - 4, py + h - 10, 2, 8, leg);
    R(g, px, py - 4, w, depth, top);
    R(g, px, py - 4, w, 1, shade(top, 0.16));
    R(g, px, py - 4 + depth, w, 2, edge);
    if (extra) extra(px, py, w, h, depth);
  }

  /* ------------------------------------------------------------------ */
  /* Kitchen                                                              */
  /* ------------------------------------------------------------------ */
  function fridge(g, e) {
    const px = e.px, py = e.py, c = e.color || '#dfe3e8', d = shade(c, -0.2), l = shade(c, 0.18), dk = shade(c, -0.45);
    if (e.rot === 2 || e.rot === 3) return sideBox(g, e, c, 24);
    R(g, px + 1, py + 13, 15, 2, SH);
    R(g, px + 1, py - 24, 14, 37, c);
    R(g, px + 1, py - 24, 14, 1, l);
    R(g, px + 14, py - 23, 1, 36, d);
    if (e.rot === 1) { for (let i = 0; i < 8; i++) R(g, px + 3, py - 20 + i * 4, 10, 1, dk); return; }
    R(g, px + 1, py - 12, 14, 1, dk);
    R(g, px + 3, py - 21, 1, 6, dk); R(g, px + 3, py - 9, 1, 9, dk);
    R(g, px + 9, py - 21, 4, 3, '#14171c'); R(g, px + 10, py - 20, 2, 1, C.breeze);
    R(g, px + 7, py - 6, 2, 2, '#ff3b5c'); R(g, px + 10, py - 4, 3, 3, '#ffd23f'); R(g, px + 7, py - 1, 3, 3, '#a0c3ec');
    R(g, px + 2, py + 11, 12, 2, dk);
  }
  function vending(g, e, t) {
    const px = e.px, py = e.py, c = e.color || '#b8323f', d = shade(c, -0.3), l = shade(c, 0.2);
    if (e.rot === 2 || e.rot === 3) return sideBox(g, e, c, 24);
    R(g, px + 1, py + 13, 15, 2, SH);
    R(g, px + 1, py - 24, 14, 37, c);
    R(g, px + 14, py - 23, 1, 36, d);
    if (e.rot === 1) { for (let i = 0; i < 5; i++) R(g, px + 4, py - 18 + i * 5, 8, 1, d); return; }
    R(g, px + 1, py - 24, 14, 3, l);
    R(g, px + 3, py - 23, 9, 1, blink(t, 0.5, 0) ? '#ffffff' : '#ffe2c2');
    R(g, px + 3, py - 19, 9, 20, '#0c1118');
    const cols = ['#ff3b5c', '#ffd23f', '#00a8c6', '#7ee0a1', '#ff7a17', '#c4b5fd'];
    for (let r = 0; r < 4; r++) {
      R(g, px + 3, py - 14 + r * 5, 9, 1, '#2a2f38');
      for (let k = 0; k < 3; k++) R(g, px + 4 + k * 3, py - 17 + r * 5, 2, 3, cols[(r * 3 + k + e.seed) % cols.length]);
    }
    R(g, px + 3, py - 19, 1, 20, 'rgba(220,235,255,0.18)');
    R(g, px + 12, py - 19, 2, 10, '#14171c');
    R(g, px + 12, py - 18, 1, 1, C.ok); R(g, px + 12, py - 15, 2, 1, '#9aa3b0'); R(g, px + 12, py - 12, 2, 2, '#ffd23f');
    R(g, px + 4, py + 4, 8, 4, '#0a0b0e');
    R(g, px + 2, py + 11, 12, 2, d);
  }
  function blink(t, hz, ph) { return Math.sin((t * hz + ph) * Math.PI * 2) > 0; }
  // professional espresso machine on its own cabinet
  function espresso(g, e, t) {
    const px = e.px, py = e.py, wood = e.color || '#6b5038';
    if (e.rot === 2 || e.rot === 3) return sideBox(g, e, wood, 14);
    R(g, px + 1, py + 13, 15, 2, SH);
    R(g, px + 1, py - 2, 14, 15, wood);
    R(g, px + 1, py - 2, 14, 1, shade(wood, 0.2));
    R(g, px + 8, py, 1, 12, shade(wood, -0.3));
    if (e.rot === 1) { R(g, px + 3, py - 12, 10, 10, '#9aa3b0'); return; }
    R(g, px + 6, py + 5, 1, 2, '#c9a06a'); R(g, px + 10, py + 5, 1, 2, '#c9a06a');
    R(g, px + 2, py - 13, 12, 11, '#c9ced6');
    R(g, px + 2, py - 13, 12, 1, '#ffffff');
    R(g, px + 2, py - 10, 12, 2, '#2a2f38');
    R(g, px + 7, py - 12, 2, 2, '#ffd23f');
    R(g, px + 4, py - 7, 2, 2, '#14171c'); R(g, px + 10, py - 7, 2, 2, '#14171c');
    R(g, px + 4, py - 4, 2, 2, '#e9e9e6'); R(g, px + 10, py - 4, 2, 1, '#e9e9e6');
    R(g, px + 3, py - 15, 2, 2, '#e9e9e6'); R(g, px + 6, py - 15, 2, 2, '#e9e9e6'); R(g, px + 9, py - 15, 2, 2, '#e9e9e6');
    for (let k = 0; k < 2; k++) { const ph = (t * 0.6 + k * 0.5) % 1; g.fillStyle = 'rgba(255,255,255,' + (0.4 * Math.sin(ph * Math.PI)).toFixed(3) + ')'; g.fillRect(px + 4 + k * 6, py - 18 - Math.round(ph * 5), 1, 1); }
  }
  // a coffee corner: counter with the machine, cups and a little menu board (2 × 1)
  function coffeebar(g, e, t) {
    const px = e.px, py = e.py, W = e.tw * T, wood = e.color || '#3b2c22';
    if (e.rot === 2 || e.rot === 3) return sideBox(g, e, wood, 14);
    R(g, px + 1, py + 13, W - 1, 2, SH);
    R(g, px + 1, py - 2, W - 2, 15, wood);
    R(g, px + 1, py - 2, W - 2, 1, shade(wood, 0.3));
    R(g, px + 1, py + 4, W - 2, 1, '#c9a06a');
    if (e.rot === 1) return;
    for (let x = px + 4; x < px + W - 4; x += 8) { R(g, x, py + 6, 6, 6, shade(wood, -0.15)); R(g, x + 2, py + 8, 2, 1, '#c9a06a'); }
    R(g, px + 3, py - 13, 11, 11, '#2a2f38'); R(g, px + 3, py - 13, 11, 1, '#4a515c');
    R(g, px + 5, py - 11, 7, 3, '#14171c'); R(g, px + 6, py - 10, 2, 1, C.ok);
    R(g, px + 6, py - 6, 4, 3, '#e9e9e6'); R(g, px + 6, py - 6, 4, 1, '#5a3a25');
    for (let k = 0; k < 4; k++) R(g, px + 17 + (k % 2) * 4, py - 5 - Math.floor(k / 2) * 3, 3, 3, ['#e9e9e6', '#ff7a17', '#a0c3ec', '#e9e9e6'][k]);
    R(g, px + W - 8, py - 12, 6, 7, '#1d2026'); R(g, px + W - 7, py - 11, 4, 1, '#e9e9e6'); R(g, px + W - 7, py - 9, 3, 1, '#ffd23f'); R(g, px + W - 7, py - 7, 4, 1, '#e9e9e6');
    const ph = (t * 0.6) % 1; g.fillStyle = 'rgba(255,255,255,' + (0.4 * Math.sin(ph * Math.PI)).toFixed(3) + ')'; g.fillRect(px + 8, py - 9 - Math.round(ph * 6), 1, 1);
  }
  // kitchen counter with a sink and a dish rack (2 × 1)
  function sink(g, e) {
    const px = e.px, py = e.py, W = e.tw * T, c = e.color || '#e9e9e6', d = shade(c, -0.2);
    if (e.rot === 2 || e.rot === 3) return sideBox(g, e, c, 12);
    R(g, px + 1, py + 13, W - 1, 2, SH);
    R(g, px + 1, py - 1, W - 2, 14, c);
    R(g, px + 1, py - 1, W - 2, 1, '#ffffff');
    R(g, px + 1, py + 2, W - 2, 1, d);
    if (e.rot === 1) return;
    for (let x = px + 3; x < px + W - 3; x += 7) { R(g, x, py + 4, 6, 7, shade(c, -0.08)); R(g, x + 2, py + 6, 2, 1, '#9aa3b0'); }
    R(g, px + 4, py - 1, 10, 2, '#9aa3b0');
    R(g, px + 8, py - 7, 1, 6, '#c9ced6'); R(g, px + 8, py - 7, 4, 1, '#c9ced6'); R(g, px + 11, py - 6, 1, 2, '#c9ced6');
    R(g, px + 18, py - 6, 10, 5, '#5d6878');
    for (let k = 0; k < 4; k++) R(g, px + 19 + k * 2, py - 9, 1, 6, k % 2 ? '#e9e9e6' : '#a0c3ec');
  }
  function microwave(g, e, t) {
    const px = e.px, py = e.py, on = e.busy;
    R(g, px + 2, py - 10, 12, 9, e.color || '#2a2f38');
    R(g, px + 2, py - 10, 12, 1, '#4a515c');
    R(g, px + 3, py - 8, 7, 6, on ? '#ffd27a' : '#0d1219');
    if (on) R(g, px + 5 + Math.floor((t * 3) % 3), py - 6, 2, 2, '#c0392b');
    R(g, px + 11, py - 8, 2, 6, '#14171c');
    R(g, px + 11, py - 8, 2, 1, C.ok);
    R(g, px + 11, py - 5, 1, 1, '#9aa3b0'); R(g, px + 11, py - 3, 1, 1, '#9aa3b0');
  }
  function kettle(g, e) {
    const px = e.px, py = e.py, c = e.color || '#c9ced6';
    R(g, px + 5, py - 3, 7, 2, '#2a2f38');
    R(g, px + 5, py - 9, 6, 6, c);
    R(g, px + 5, py - 9, 6, 1, shade(c, 0.3));
    R(g, px + 4, py - 8, 1, 3, c); R(g, px + 11, py - 8, 1, 4, '#2a2f38');
    R(g, px + 6, py - 10, 4, 1, '#2a2f38');
  }
  function snacks(g, e) {
    const px = e.px, py = e.py;
    R(g, px + 4, py - 9, 8, 8, 'rgba(220,235,255,0.45)');
    R(g, px + 4, py - 10, 8, 1, '#c9a06a');
    for (let k = 0; k < 6; k++) R(g, px + 5 + (k % 3) * 2, py - 7 + Math.floor(k / 3) * 3, 2, 2, ['#c9a06a', '#8a5a3c', '#ffd23f'][k % 3]);
  }

  /* ------------------------------------------------------------------ */
  /* Screens: TVs, more monitors, notebooks                               */
  /* ------------------------------------------------------------------ */
  function tvstand(g, e, t) {
    const px = e.px, py = e.py, W = (e.rot === 2 || e.rot === 3 ? e.th : e.tw) * T, big = W > 16;
    if (e.rot === 2 || e.rot === 3) {
      const H = e.th * T, east = e.rot === 2;
      R(g, px + 6, py + H - 3, 4, 2, SH);
      R(g, px + 7, py - 6, 2, H + 4, '#2a2f38');
      R(g, px + 6, py - 20, 3, H + 2, '#0c0e12');
      R(g, east ? px + 9 : px + 5, py - 19, 1, H, 'rgba(160,195,236,0.3)');
      return;
    }
    const sw = big ? W - 3 : 14, sh = big ? 17 : 11, sx = px + Math.floor((W - sw) / 2), sy = py - 7 - sh;
    R(g, px + Math.floor(W / 2) - 5, py + 11, 10, 2, SH);
    R(g, px + Math.floor(W / 2) - 1, py - 7, 2, 18, '#2a2f38');
    R(g, px + Math.floor(W / 2) - 5, py + 10, 10, 2, '#1d2027');
    R(g, sx - 1, sy - 1, sw + 2, sh + 2, '#0c0e12');
    if (e.rot === 1) { R(g, sx + 2, sy + 2, sw - 4, sh - 4, '#1a1d23'); return; }
    tvShow(g, sx, sy, sw, sh, t, e.seed, e.show);
  }
  function tvwall(g, e, t) {
    const W = e.tw * T, x = e.px + 1, y = e.py - 27, w = W - 2, h = W > 32 ? 19 : W > 16 ? 17 : 12;
    R(g, x, y, w, h, '#0c0e12');
    R(g, x + 1, y + 1, w - 2, h - 2, '#1a1d23');
    tvShow(g, x + 1, y + 1, w - 2, h - 3, t, e.seed, e.show);
    R(g, x + Math.floor(w / 2) - 1, y + h - 1, 2, 1, C.ok);
  }
  const MON_NEW = {
    curved(g, e, t) {
      const px = e.px, py = e.py;
      R(g, px + 6, py - 5, 4, 3, '#16191f'); R(g, px + 3, py - 2, 10, 2, '#3c424c');
      R(g, px, py - 15, 16, 10, '#0c0e12'); R(g, px - 1, py - 14, 1, 8, '#0c0e12'); R(g, px + 16, py - 14, 1, 8, '#0c0e12');
      if (e.work) DL.workScreen(g, px + 1, py - 14, 14, 7, t, e.work, e.seed, e.typing);
      else R(g, px + 1, py - 14, 14, 7, '#0b1424');
      R(g, px + 1, py - 6, 14, 1, hsl(t * 60, 0.6));
    },
    vertical(g, e, t) {
      const px = e.px, py = e.py;
      R(g, px + 6, py - 4, 4, 2, '#16191f'); R(g, px + 4, py - 2, 8, 2, '#3c424c');
      R(g, px + 4, py - 19, 8, 15, '#0c0e12');
      if (e.work) DL.workScreen(g, px + 5, py - 18, 6, 13, t, 'code', e.seed, e.typing);
      else { R(g, px + 5, py - 18, 6, 13, '#0b1220'); for (let k = 0; k < 5; k++) R(g, px + 6, py - 16 + k * 2, 2 + ((k * 3) % 4), 1, '#2c3e66'); }
    },
    crt(g, e, t) {
      const px = e.px, py = e.py;
      R(g, px + 2, py - 3, 12, 2, '#b5ae94');
      R(g, px + 1, py - 15, 14, 12, '#c9c2a8'); R(g, px + 1, py - 15, 14, 1, '#e0d9c0');
      R(g, px + 3, py - 13, 10, 8, '#0b1a10');
      for (let k = 0; k < 3; k++) R(g, px + 4, py - 12 + k * 2, 3 + ((k * 5 + e.seed) % 5), 1, '#3cff7a');
      if (blink(t, 1.2, 0)) R(g, px + 4, py - 6, 2, 1, '#3cff7a');
      R(g, px + 12, py - 4, 1, 1, C.ok);
    },
  };
  function laptop(g, e, t) {
    const px = e.px, py = e.py, v = e.variant || '';
    const body = v === 'silver' ? '#c9ced6' : v === 'gamer' ? '#14171c' : '#3a404b';
    R(g, px + 2, py - 3, 12, 2, shade(body, 0.1));
    R(g, px + 2, py - 3, 12, 1, shade(body, 0.3));
    R(g, px + 3, py - 12, 10, 9, body);
    R(g, px + 4, py - 11, 8, 7, e.work ? '#13233a' : '#0b1220');
    if (e.work) DL.workScreen(g, px + 4, py - 11, 8, 6, t, e.work, e.seed, e.typing);
    else for (let k = 0; k < 3; k++) R(g, px + 5, py - 10 + k * 2, 2 + ((k * 3 + e.seed) % 5), 1, '#2c3e66');
    if (v === 'gamer') { R(g, px + 2, py - 2, 12, 1, hsl(t * 80, 0.8)); R(g, px + 7, py - 12, 2, 1, '#ff3b5c'); }
    if (v === 'silver') R(g, px + 7, py - 12, 2, 1, '#ffffff');
  }

  /* ------------------------------------------------------------------ */
  /* Tables: gamer, office, technical / repair bench, L, round            */
  /* ------------------------------------------------------------------ */
  const TABLE_NEW = {
    gamer: (g, e, t) => tableArt(g, e, e.color || '#16181d', '#0a0b0e', '#0a0b0e', (px, py, w, h, d) => {
      g.fillStyle = hsl(t * 70, 0.85); g.fillRect(px, py - 4 + d, w, 1);
      R(g, px + 2, py - 3, Math.min(w - 4, 12), d - 2, '#22252d');
    }),
    office: (g, e) => tableArt(g, e, e.color || '#e2d6c2', '#b8a888', '#e9e9e6', (px, py, w, h) => { R(g, px + 4, py + h - 9, w - 8, 3, '#d9dde3'); }),
    tech: (g, e) => tableArt(g, e, '#5d6573', '#2f343c', '#22262d', (px, py, w, h, d) => {
      R(g, px + 2, py - 2, w - 4, d - 4, '#c96b2c'); R(g, px + 2, py - 2, w - 4, 1, '#e08a4a');
      R(g, px + 2, py + h - 6, w - 4, 2, '#3a414c');
    }),
    repair: (g, e, t) => tableArt(g, e, '#4a515c', '#2f343c', '#22262d', (px, py, w, h, d) => {
      R(g, px + 2, py - 2, w - 4, d - 4, '#2f6a4a'); R(g, px + 2, py - 2, w - 4, 1, '#3f8a60');
      R(g, px + 2, py + h - 6, w - 4, 2, '#3a414c');
      // soldering station, a board on the mat, the magnifier lamp
      R(g, px + 3, py - 9, 7, 6, '#c0392b'); R(g, px + 4, py - 8, 4, 2, '#14171c'); R(g, px + 5, py - 7, 2, 1, '#ff7a17');
      R(g, px + 13, py - 1, 6, 3, '#1f6f3c'); R(g, px + 14, py, 1, 1, '#ffd23f'); R(g, px + 17, py, 1, 1, '#c9ced6');
      R(g, px + w - 7, py - 20, 1, 17, '#3a414c'); R(g, px + w - 11, py - 21, 6, 2, '#3a414c'); R(g, px + w - 11, py - 19, 5, 1, 'rgba(220,235,255,0.6)');
      if (Math.sin(t * 9) > 0.6) R(g, px + 15, py - 2, 1, 1, '#ffe9a8');
    }),
    L: (g, e) => {
      // drawn from above-front: the back row runs the full width, the left wing comes forward
      const px = e.px, py = e.py, w = e.tw * T, h = e.th * T, top = e.color || '#6b5038', edge = shade(top, -0.35), leg = '#2a1f17';
      const hole = DL.itemHole(e) || [1, 1];
      R(g, px + 1, py + h - 2, w - 2, 2, SH);
      const cells = [[0, 0], [1, 0], [0, 1], [1, 1]].filter(([x, y]) => !(x === hole[0] && y === hole[1]));
      for (const [x, y] of cells) {
        R(g, px + x * 16 + 2, py + y * 16 + 4, 2, 8, leg);
        R(g, px + x * 16, py - 4 + y * 13, 16, 13, top);
        R(g, px + x * 16, py - 4 + y * 13 + 13, 16, 2, edge);
      }
      R(g, px, py - 4, w, 1, shade(top, 0.2));
    },
    round: (g, e) => {
      const px = e.px, py = e.py, w = e.tw * T, top = e.color || '#4a3626';
      R(g, px + w / 2 - 2, py + 6, 4, 18, '#1d1610');
      R(g, px + w / 2 - 8, py + 23, 16, 3, '#1d1610');
      for (let i = 0; i < 18; i++) {
        const yy = i - 9, half = Math.round(Math.sqrt(Math.max(0, 81 - yy * yy)) * (w / 18));
        R(g, px + w / 2 - half, py + 2 + i, half * 2, 1, i < 2 ? shade(top, 0.18) : top);
      }
      R(g, px + 3, py + 20, w - 6, 2, shade(top, -0.35));
    },
  };
  // the corner of an L table that stays open (where the chair goes): front-right, turning with rot
  DL.itemHole = function (e) {
    if (!e || e.kind !== 'table' || e.variant !== 'L') return null;
    return [[1, 1], [0, 0], [1, 0], [0, 1]][e.rot | 0];
  };

  /* ------------------------------------------------------------------ */
  /* Seating and storage                                                  */
  /* ------------------------------------------------------------------ */
  function pouf(g, e) {
    const px = e.px, py = e.py, c = e.color || '#ff7a17', d = shade(c, -0.3), l = shade(c, 0.22);
    R(g, px + 3, py + 12, 10, 2, SH);
    R(g, px + 3, py + 2, 10, 11, c);
    R(g, px + 2, py + 4, 12, 7, c);
    R(g, px + 3, py + 2, 10, 2, l);
    R(g, px + 2, py + 7, 12, 1, d);
    R(g, px + 7, py + 3, 2, 1, d);
  }
  function cubes(g, e) {
    const px = e.px, py = e.py, W = e.tw * T, frame = e.color || '#e9e9e6';
    R(g, px + 1, py + 13, W - 1, 2, SH);
    R(g, px + 1, py - 20, W - 2, 34, frame);
    R(g, px + 1, py - 20, W - 2, 1, '#ffffff');
    const cols = ['#ff7a17', '#a0c3ec', '#7ee0a1', '#c4b5fd', '#ffd23f', '#ff3b5c'];
    const n = Math.max(1, Math.round((W - 4) / 7)), cw = Math.floor((W - 4) / n);
    for (let r = 0; r < 3; r++) {
      for (let k = 0; k < n; k++) {
        const x = px + 2 + k * cw, y = py - 18 + r * 10;
        R(g, x, y, cw - 1, 9, shade(frame, -0.35));
        if (hash(e.seed * 7 + r * 5 + k) > 0.3) { const c = cols[(r * 3 + k + e.seed) % cols.length]; R(g, x + 1, y + 2, cw - 3, 7, c); R(g, x + 2, y + 4, cw - 5, 1, shade(c, -0.3)); }
      }
    }
  }
  function wallcab(g, e) {
    const W = e.tw * T, x = e.px + 1, y = e.py - 26, c = e.color || '#e9e9e6';
    R(g, x, y, W - 2, 12, c);
    R(g, x, y, W - 2, 1, '#ffffff');
    R(g, x, y + 11, W - 2, 1, shade(c, -0.3));
    for (let k = 1; k < W / 8; k++) R(g, x + k * 8 - 1, y + 1, 1, 10, shade(c, -0.2));
    for (let k = 0; k < W / 8; k++) R(g, x + k * 8 + 5, y + 8, 1, 2, '#5d6878');
  }

  /* ------------------------------------------------------------------ */
  /* Walls: posters, paintings, boards, clocks, lights                    */
  /* ------------------------------------------------------------------ */
  const POSTERS = {
    net(g, x, y) {
      R(g, x + 1, y + 1, 10, 13, '#0d1726');
      const n = [[5, 2], [2, 7], [8, 7], [2, 11], [8, 11]];
      R(g, x + 6, y + 4, 1, 3, '#a0c3ec'); R(g, x + 3, y + 6, 7, 1, '#a0c3ec'); R(g, x + 3, y + 8, 1, 3, '#a0c3ec'); R(g, x + 9, y + 8, 1, 3, '#a0c3ec');
      n.forEach(([a, b], i) => R(g, x + a, y + b, 3, 2, i ? '#7ee0a1' : '#ff7a17'));
    },
    cloud(g, x, y) {
      R(g, x + 1, y + 1, 10, 13, '#a0c3ec');
      R(g, x + 3, y + 5, 6, 3, '#ffffff'); R(g, x + 2, y + 6, 8, 2, '#ffffff'); R(g, x + 4, y + 4, 3, 1, '#ffffff');
      R(g, x + 5, y + 9, 1, 3, '#2a5d8a'); R(g, x + 7, y + 9, 1, 2, '#2a5d8a'); R(g, x + 3, y + 12, 6, 1, '#2a5d8a');
    },
    invader(g, x, y) {
      R(g, x + 1, y + 1, 10, 13, '#14171c');
      const p = ['..X...X..', '...XXX...', '..XXXXX..', '.XX.X.XX.', 'XXXXXXXXX', 'X.X...X.X'];
      p.forEach((row, j) => { for (let i = 0; i < row.length; i++) if (row[i] === 'X' && i < 9) R(g, x + 2 + i, y + 3 + j, 1, 1, '#7ee0a1'); });
      R(g, x + 5, y + 12, 1, 1, '#ff3b5c');
    },
    gamepad(g, x, y) {
      R(g, x + 1, y + 1, 10, 13, '#ff7a17');
      R(g, x + 2, y + 6, 8, 4, '#2a2f38'); R(g, x + 2, y + 9, 2, 2, '#2a2f38'); R(g, x + 8, y + 9, 2, 2, '#2a2f38');
      R(g, x + 3, y + 7, 1, 1, '#ffffff'); R(g, x + 8, y + 7, 1, 1, '#ff3b5c'); R(g, x + 7, y + 8, 1, 1, '#00e5ff');
      R(g, x + 3, y + 2, 6, 2, '#ffd23f');
    },
    fine(g, x, y) {
      R(g, x + 1, y + 1, 10, 13, '#ffd27a');
      R(g, x + 1, y + 9, 10, 5, '#ff7a17'); for (let i = 0; i < 5; i++) R(g, x + 1 + i * 2, y + 7 + (i % 2), 1, 2, '#ff3b5c');
      R(g, x + 4, y + 3, 4, 4, '#c9a06a'); R(g, x + 5, y + 4, 1, 1, '#14171c'); R(g, x + 6, y + 6, 2, 1, '#14171c');
      R(g, x + 8, y + 4, 2, 2, '#e9e9e6');
    },
    brew(g, x, y) {
      R(g, x + 1, y + 1, 10, 13, '#3b2418');
      R(g, x + 3, y + 6, 6, 5, '#e9e9e6'); R(g, x + 9, y + 7, 1, 3, '#e9e9e6'); R(g, x + 3, y + 6, 6, 1, '#8a5a3c');
      R(g, x + 4, y + 3, 1, 2, '#9aa3b0'); R(g, x + 7, y + 2, 1, 3, '#9aa3b0');
      R(g, x + 2, y + 12, 2, 1, '#ffd23f'); R(g, x + 5, y + 12, 1, 1, '#ffd23f'); R(g, x + 7, y + 12, 3, 1, '#ffd23f');
    },
    prompt(g, x, y) {
      R(g, x + 1, y + 1, 10, 13, '#0f1412');
      R(g, x + 2, y + 3, 2, 1, '#7ee0a1'); R(g, x + 5, y + 3, 5, 1, '#e9e9e6');
      R(g, x + 2, y + 6, 2, 1, '#7ee0a1'); R(g, x + 5, y + 6, 3, 1, '#ff7a17');
      R(g, x + 2, y + 9, 2, 1, '#7ee0a1'); R(g, x + 5, y + 9, 1, 2, '#e9e9e6');
    },
    err404(g, x, y) {
      R(g, x + 1, y + 1, 10, 13, '#1d2440');
      const d4 = (dx) => { R(g, x + dx, y + 4, 1, 3, '#ff3b5c'); R(g, x + dx, y + 6, 3, 1, '#ff3b5c'); R(g, x + dx + 2, y + 4, 1, 5, '#ff3b5c'); };
      d4(1); R(g, x + 5, y + 4, 2, 5, '#ff3b5c'); R(g, x + 5, y + 5, 2, 3, '#1d2440'); d4(8);
      R(g, x + 2, y + 11, 8, 1, '#a0c3ec');
    },
  };
  const PAINT_NEW = {
    circuit(g, ix, iy, iw, ih) {
      R(g, ix, iy, iw, ih, '#0f3a2a');
      for (let i = 0; i < iw; i += 4) R(g, ix + i, iy + 2 + ((i * 3) % (ih - 4)), 3, 1, '#c9a13c');
      for (let i = 2; i < iw; i += 5) R(g, ix + i, iy + 1, 1, ih - 2, 'rgba(201,161,60,0.5)');
      R(g, ix + Math.floor(iw / 2) - 2, iy + Math.floor(ih / 2) - 2, 5, 4, '#14171c');
    },
    synth(g, ix, iy, iw, ih) {
      R(g, ix, iy, iw, ih, '#2a1f3d');
      R(g, ix, iy, iw, Math.floor(ih / 2), '#5a2a6b');
      R(g, ix + Math.floor(iw / 2) - 3, iy + 2, 6, 5, '#ff7a17'); R(g, ix + Math.floor(iw / 2) - 3, iy + 4, 6, 1, '#5a2a6b');
      for (let i = 0; i < 4; i++) R(g, ix, iy + Math.floor(ih / 2) + i * 2, iw, 1, '#ff2bd6');
    },
  };
  function kanban(g, e) {
    const W = e.tw * T, x = e.px + 1, y = e.py - 26, w = W - 2;
    R(g, x, y, w, 17, '#9aa3b0'); R(g, x + 1, y + 1, w - 2, 15, '#e4e7eb');
    const cols = 3, cw = Math.floor((w - 2) / cols);
    for (let c = 0; c < cols; c++) {
      R(g, x + 1 + c * cw, y + 1, cw - 1, 2, ['#ff7a17', '#a0c3ec', '#7ee0a1'][c]);
      if (c) R(g, x + c * cw, y + 1, 1, 15, '#c9ced6');
      for (let k = 0; k < 3 - c; k++) R(g, x + 2 + c * cw + (k % 2), y + 4 + k * 4, cw - 4, 3, ['#ffd23f', '#ff7aa8', '#7ee0a1'][(k + c + e.seed) % 3]);
    }
  }
  function wboard(g, e) {
    const W = e.tw * T, x = e.px + 1, y = e.py - 26, w = W - 2;
    R(g, x, y, w, 17, '#9aa3b0'); R(g, x + 1, y + 1, w - 2, 14, '#f1f2f4');
    R(g, x + 3, y + 3, 6, 3, C.breeze); R(g, x + 12, y + 3, 6, 3, C.breeze); R(g, x + 6, y + 6, 1, 3, '#5d6878'); R(g, x + 6, y + 9, 9, 1, '#5d6878'); R(g, x + 15, y + 6, 1, 3, '#5d6878');
    R(g, x + w - 10, y + 4, 7, 1, '#c0392b'); R(g, x + w - 10, y + 7, 5, 1, '#2a5d8a'); R(g, x + w - 10, y + 10, 6, 1, '#2a5d8a');
    R(g, x + 1, y + 15, w - 2, 1, '#7d8590');
    R(g, x + 4, y + 14, 3, 1, '#ff3b5c'); R(g, x + 8, y + 14, 3, 1, '#2a5d8a');
  }
  function glassboard(g, e) {
    const px = e.px, py = e.py, W = (e.rot === 2 || e.rot === 3 ? e.th : e.tw) * T;
    R(g, px + 2, py + 12, W - 4, 2, SH);
    R(g, px + 3, py - 4, 1, 17, '#c9ced6'); R(g, px + W - 4, py - 4, 1, 17, '#c9ced6');
    R(g, px + 1, py + 12, 5, 1, '#c9ced6'); R(g, px + W - 6, py + 12, 5, 1, '#c9ced6');
    R(g, px + 1, py - 22, W - 2, 19, 'rgba(200,225,255,0.35)');
    R(g, px + 1, py - 22, W - 2, 1, 'rgba(255,255,255,0.7)');
    if (e.rot === 1) return;
    for (let k = 0; k < 6; k++) R(g, px + 4 + (k % 3) * 9, py - 19 + Math.floor(k / 3) * 7, 5, 4, ['#ffd23f', '#ff7aa8', '#7ee0a1', '#a0c3ec', '#ffd23f', '#ff7a17'][(k + e.seed) % 6]);
    R(g, px + 4, py - 6, W - 8, 1, '#2a5d8a');
  }
  function neonclock(g, e, t) {
    const cx = e.px + 8, cy = e.py - 16, col = e.color || '#00e5ff';
    g.fillStyle = rgba(col, 0.25);
    for (let s = 0; s < 32; s++) { const a = (s / 32) * Math.PI * 2; g.fillRect(Math.round(cx + Math.cos(a) * 6) - 1, Math.round(cy + Math.sin(a) * 6) - 1, 3, 3); }
    g.fillStyle = col;
    for (let s = 0; s < 32; s++) { const a = (s / 32) * Math.PI * 2; g.fillRect(Math.round(cx + Math.cos(a) * 6), Math.round(cy + Math.sin(a) * 6), 1, 1); }
    const d = new Date(), hr = ((d.getHours() % 12) / 12) * Math.PI * 2, mn = (d.getMinutes() / 60) * Math.PI * 2;
    for (let r = 0; r <= 3; r++) R(g, Math.round(cx + Math.sin(hr) * r), Math.round(cy - Math.cos(hr) * r), 1, 1, '#ffffff');
    for (let r = 0; r <= 4; r++) R(g, Math.round(cx + Math.sin(mn) * r), Math.round(cy - Math.cos(mn) * r), 1, 1, col);
  }
  function flipclock(g, e) {
    const px = e.px, py = e.py, d = new Date(), s = String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
    R(g, px + 2, py - 8, 12, 7, '#14171c');
    R(g, px + 2, py - 8, 12, 1, '#2a2f38');
    for (let k = 0; k < 4; k++) { R(g, px + 3 + k * 3, py - 7, 2, 5, '#2a2f38'); R(g, px + 3 + k * 3, py - 5 - (+s[k] % 2), 2, 1, '#e9e9e6'); }
    R(g, px + 2, py - 5, 12, 1, '#0a0b0e');
  }
  function sconce(g, e) {
    const x = e.px + 6, y = e.py - 22, c = e.color || '#ffc285';
    R(g, x + 1, y - 2, 2, 3, '#2a2f38');
    R(g, x - 1, y + 1, 6, 4, c);
    R(g, x - 1, y + 1, 6, 1, shade(c, 0.4));
    R(g, x, y + 5, 4, 1, shade(c, -0.3));
  }
  function ledpanel(g, e, t) {
    const W = e.tw * T, x = e.px + 2, y = e.py - 25;
    for (let j = 0; j < 3; j++) for (let i = 0; i < Math.floor((W - 3) / 5); i++) {
      const c = e.variant === 'rainbow' || !e.color ? hsl(t * 60 + i * 30 + j * 50, 0.95) : rgba(e.color, 0.55 + 0.45 * Math.sin(t * 2 + i + j));
      R(g, x + i * 5, y + j * 5, 4, 4, '#14171c');
      g.fillStyle = c;
      g.fillRect(x + i * 5 + 1, y + j * 5 + 1, 2, 2);
    }
  }
  function partsbin(g, e) {
    const W = e.tw * T, x = e.px + 1, y = e.py - 25;
    R(g, x, y, W - 2, 15, '#3a414c');
    const cols = ['#2a5d8a', '#c0392b', '#ffd23f', '#1f6f5c'];
    for (let j = 0; j < 3; j++) for (let i = 0; i < Math.floor((W - 4) / 4); i++) { R(g, x + 1 + i * 4, y + 1 + j * 5, 3, 4, cols[(i + j * 2 + e.seed) % 4]); R(g, x + 2 + i * 4, y + 3 + j * 5, 1, 1, '#e9e9e6'); }
  }

  /* ------------------------------------------------------------------ */
  /* Floor things: lamps, bins, plants, rugs, datacenter accessories      */
  /* ------------------------------------------------------------------ */
  function tripod(g, e) {
    const px = e.px, py = e.py, c = e.color || '#ffe9b0';
    R(g, px + 4, py + 11, 9, 2, SH);
    for (let i = 0; i < 10; i++) { R(g, px + 7 - Math.floor(i / 3), py + 2 + i, 1, 1, '#6b5038'); R(g, px + 9 + Math.floor(i / 3), py + 2 + i, 1, 1, '#6b5038'); }
    R(g, px + 8, py - 12, 1, 15, '#6b5038');
    R(g, px + 3, py - 20, 11, 8, '#e9e9e6');
    R(g, px + 3, py - 20, 11, 1, '#ffffff');
    R(g, px + 4, py - 12, 9, 1, rgba(c, 0.8));
  }
  function lavalamp(g, e, t) {
    const px = e.px, py = e.py, c = e.color || '#ff2bd6';
    R(g, px + 6, py - 3, 4, 2, '#2a2f38');
    R(g, px + 6, py - 13, 4, 10, rgba(c, 0.35));
    for (let k = 0; k < 2; k++) R(g, px + 7, py - 12 + Math.round((Math.sin(t * 0.8 + k * 2.4) + 1) * 3.5), 2, 2, c);
    R(g, px + 6, py - 14, 4, 1, '#2a2f38');
  }
  function recycle(g, e) {
    const px = e.px, py = e.py;
    R(g, px + 1, py + 12, 15, 2, SH);
    [['#2a5d8a', 1], ['#ffd23f', 6], ['#c0392b', 11]].forEach(([c, x]) => {
      R(g, px + x, py + 1, 4, 11, c); R(g, px + x, py, 4, 2, shade(c, 0.25)); R(g, px + x + 1, py + 5, 2, 2, '#ffffff');
    });
  }
  const PLANT_NEW = {
    bamboo(g, e) {
      const px = e.px, py = e.py;
      R(g, px + 3, py + 13, 11, 2, SH);
      for (let i = 0; i < 3; i++) { const x = px + 5 + i * 3, h = 18 + i * 4; R(g, x, py + 3 - h, 1, h, '#7a9a3c'); for (let k = 0; k < h; k += 5) R(g, x, py + 3 - h + k, 1, 1, '#4a6a2c'); R(g, x + 1, py + 3 - h + 2, 2, 1, '#58a578'); R(g, x - 2, py + 3 - h + 6, 2, 1, '#58a578'); }
      R(g, px + 4, py + 3, 8, 10, '#e9e9e6'); R(g, px + 4, py + 3, 8, 1, '#ffffff');
    },
    fern(g, e) {
      const px = e.px, py = e.py;
      R(g, px + 3, py + 13, 11, 2, SH);
      for (let k = 0; k < 7; k++) { const a = -Math.PI * 0.1 - (k / 6) * Math.PI * 0.8; for (let r = 0; r < 8; r++) R(g, Math.round(px + 8 + Math.cos(a) * r), Math.round(py + 1 + Math.sin(a) * r * 0.8 + r * r * 0.06), 1, 1, k % 2 ? '#3c8059' : '#58a578'); }
      R(g, px + 4, py + 3, 8, 10, '#5a3b2e'); R(g, px + 4, py + 3, 8, 1, '#7a5040');
    },
    olive(g, e) {
      const px = e.px, py = e.py;
      R(g, px + 2, py + 13, 13, 2, SH);
      R(g, px + 7, py - 12, 2, 16, '#6b5038');
      for (const [x, y, w, h] of [[1, -26, 14, 8], [3, -30, 10, 5], [0, -20, 6, 5], [10, -21, 6, 5]]) { R(g, px + x, py + y, w, h, '#6f8a5c'); R(g, px + x + 1, py + y, w - 2, 1, '#8aa874'); }
      for (let k = 0; k < 4; k++) R(g, px + 3 + k * 3, py - 24 + (k % 2) * 3, 1, 1, '#2a2f38');
      R(g, px + 3, py + 3, 10, 10, '#c9a06a'); R(g, px + 3, py + 3, 10, 1, '#e0bd86');
    },
    lavender(g, e) {
      const px = e.px, py = e.py;
      R(g, px + 3, py + 13, 11, 2, SH);
      for (let i = 0; i < 7; i++) { const x = px + 4 + i, h = 8 + ((i * 5) % 5); R(g, x, py + 3 - h, 1, h, '#58a578'); R(g, x, py + 3 - h, 1, 3, '#9b7fd6'); }
      R(g, px + 4, py + 3, 8, 10, '#c9c7c2');
    },
  };
  function succulent(g, e) {
    const px = e.px, py = e.py;
    R(g, px + 5, py - 5, 6, 4, '#c9a06a');
    R(g, px + 5, py - 5, 6, 1, '#e0bd86');
    for (const [x, y, c] of [[6, -8, '#7fb68a'], [8, -9, '#9bd1a5'], [4, -7, '#5f9a6c'], [10, -7, '#5f9a6c'], [7, -7, '#9bd1a5']]) R(g, px + x, py + y, 2, 3, c);
  }
  const RUG_NEW = {
    round(g, e) {
      const px = e.px, py = e.py, w = e.tw * T, h = e.th * T, base = e.color || '#7c5cff';
      for (let j = 1; j < h - 1; j++) {
        const yy = (j - h / 2) / (h / 2 - 1), half = Math.sqrt(Math.max(0, 1 - yy * yy)) * (w / 2 - 1);
        R(g, px + Math.round(w / 2 - half), py + j, Math.round(half * 2), 1, Math.abs(yy) > 0.82 ? shade(base, 0.25) : base);
      }
      for (let j = 6; j < h - 6; j += 4) R(g, px + w / 2 - 6, py + j, 12, 1, shade(base, 0.15));
    },
    stripe(g, e) {
      const px = e.px, py = e.py, w = e.tw * T, h = e.th * T, base = e.color || '#2a5d8a';
      R(g, px + 1, py + 1, w - 2, h - 2, '#e9e9e6');
      for (let x = 2; x < w - 2; x += 6) R(g, px + x, py + 2, 3, h - 4, base);
    },
    circuit(g, e) {
      const px = e.px, py = e.py, w = e.tw * T, h = e.th * T;
      R(g, px + 1, py + 1, w - 2, h - 2, '#0f3a2a');
      for (let i = 3; i < w - 3; i += 5) R(g, px + i, py + 3, 1, h - 6, '#1f6f4c');
      for (let j = 4; j < h - 3; j += 6) R(g, px + 3, py + j, w - 6, 1, '#c9a13c');
      R(g, px + w / 2 - 4, py + h / 2 - 3, 8, 6, '#14171c'); R(g, px + w / 2 - 3, py + h / 2 - 2, 6, 4, '#2a2f38');
    },
    runner(g, e) {
      const px = e.px, py = e.py, w = e.tw * T, h = e.th * T, base = e.color || '#8a2d3b';
      R(g, px + 1, py + 2, w - 2, h - 4, base);
      R(g, px + 2, py + 3, w - 4, 1, '#ffd23f'); R(g, px + 2, py + h - 4, w - 4, 1, '#ffd23f');
      for (let x = 6; x < w - 6; x += 8) R(g, px + x, py + 6, 3, h - 12, shade(base, 0.2));
    },
  };
  function ventile(g, e) {
    const px = e.px, py = e.py;
    R(g, px + 1, py + 1, 14, 14, '#2a313b');
    for (let i = 0; i < 5; i++) for (let j = 0; j < 5; j++) R(g, px + 3 + i * 2 + (j % 2), py + 3 + j * 2, 1, 1, '#0c1118');
  }
  function pdu(g, e, t) {
    const px = e.px, py = e.py, c = '#2a2f38';
    if (e.rot === 2 || e.rot === 3) return sideBox(g, e, c, 18);
    R(g, px + 1, py + 13, 15, 2, SH);
    R(g, px + 1, py - 18, 14, 31, c); R(g, px + 1, py - 18, 14, 1, '#4a515c');
    if (e.rot === 1) return;
    R(g, px + 3, py - 15, 10, 5, '#0b1424');
    R(g, px + 4, py - 14, 1 + Math.floor(((Math.sin(t) + 1) / 2) * 7), 1, C.ok); R(g, px + 4, py - 12, 5, 1, C.breeze);
    for (let k = 0; k < 6; k++) { R(g, px + 3 + (k % 2) * 5, py - 7 + Math.floor(k / 2) * 5, 4, 3, '#14171c'); R(g, px + 4 + (k % 2) * 5, py - 6 + Math.floor(k / 2) * 5, 1, 1, '#ff7a17'); }
    R(g, px + 1, py + 11, 14, 2, '#ffd23f');
  }
  function netcab(g, e, t) {
    const px = e.px, py = e.py;
    if (e.rot === 2 || e.rot === 3) return sideBox(g, e, '#1d2229', 10);
    R(g, px + 1, py + 13, 15, 2, SH);
    R(g, px + 2, py + 5, 1, 8, '#1d2229'); R(g, px + 13, py + 5, 1, 8, '#1d2229');
    R(g, px + 1, py - 10, 14, 16, '#1d2229'); R(g, px + 1, py - 10, 14, 1, '#343b46');
    if (e.rot === 1) return;
    R(g, px + 3, py - 8, 10, 12, '#0c0f13');
    for (let k = 0; k < 3; k++) { R(g, px + 4, py - 7 + k * 4, 8, 2, k === 1 ? '#59606b' : '#2a313b'); for (let i = 0; i < 3; i++) R(g, px + 5 + i * 2, py - 6 + k * 4, 1, 1, Math.sin(t * 6 + i + k * 2) > 0 ? C.ok : C.okDim); }
    R(g, px + 3, py - 8, 1, 12, 'rgba(220,235,255,0.2)');
  }
  function tapelib(g, e, t) {
    const px = e.px, py = e.py, c = '#3a414c';
    if (e.rot === 2 || e.rot === 3) return sideBox(g, e, c, 22);
    R(g, px + 1, py + 13, 15, 2, SH);
    R(g, px + 1, py - 22, 14, 35, c); R(g, px + 1, py - 22, 14, 1, '#59606b');
    if (e.rot === 1) return;
    R(g, px + 3, py - 19, 10, 12, '#14171c');
    for (let r = 0; r < 4; r++) for (let k = 0; k < 4; k++) R(g, px + 4 + k * 2, py - 18 + r * 3, 1, 2, ['#2a5d8a', '#ffd23f', '#7ee0a1', '#c0392b'][(r + k) % 4]);
    R(g, px + 4 + Math.floor((t * 2) % 8), py - 8, 2, 1, '#ffffff');
    R(g, px + 3, py - 4, 10, 3, '#0b1424'); R(g, px + 4, py - 3, 4, 1, C.breeze);
    R(g, px + 11, py + 2, 1, 1, C.ok);
  }
  function fm200(g, e) {
    const px = e.px, py = e.py;
    R(g, px + 2, py + 12, 13, 2, SH);
    for (const x of [3, 9]) { R(g, px + x, py - 12, 5, 24, '#c0392b'); R(g, px + x, py - 12, 2, 24, '#e0503f'); R(g, px + x + 1, py - 15, 3, 3, '#2a2f38'); }
    R(g, px + 3, py - 2, 11, 3, '#e9e9e6'); R(g, px + 5, py - 1, 7, 1, '#c0392b');
  }
  function kvm(g, e) {
    const px = e.px, py = e.py;
    R(g, px + 2, py + 12, 13, 2, SH);
    R(g, px + 3, py + 10, 2, 2, '#121418'); R(g, px + 11, py + 10, 2, 2, '#121418');
    R(g, px + 3, py - 2, 10, 12, '#5d6573'); R(g, px + 3, py - 2, 10, 1, '#8a919c');
    R(g, px + 3, py - 4, 10, 2, '#3a404b');
    R(g, px + 4, py - 15, 8, 9, '#0c0e12'); R(g, px + 5, py - 14, 6, 6, '#0b1a10'); R(g, px + 6, py - 13, 3, 1, '#3cff7a'); R(g, px + 6, py - 11, 4, 1, '#3cff7a');
    R(g, px + 7, py - 6, 2, 2, '#16191f');
  }
  function serverlift(g, e) {
    const px = e.px, py = e.py;
    R(g, px + 2, py + 12, 13, 2, SH);
    R(g, px + 3, py - 20, 1, 32, '#ffd23f'); R(g, px + 12, py - 20, 1, 32, '#ffd23f');
    R(g, px + 2, py + 9, 12, 3, '#2a2f38');
    R(g, px + 4, py - 6, 8, 2, '#5d6573');
    R(g, px + 4, py - 9, 8, 3, '#1c222b'); R(g, px + 10, py - 8, 1, 1, C.ok);
    R(g, px + 2, py - 21, 12, 2, '#2a2f38');
  }

  /* ------------------------------------------------------------------ */
  /* Small things for desks and tables                                    */
  /* ------------------------------------------------------------------ */
  const SMALL = {
    duck(g, e) { const px = e.px, py = e.py; R(g, px + 5, py - 6, 6, 4, '#ffd23f'); R(g, px + 8, py - 9, 4, 4, '#ffd23f'); R(g, px + 12, py - 7, 2, 1, '#ff7a17'); R(g, px + 10, py - 8, 1, 1, '#14171c'); R(g, px + 5, py - 6, 2, 1, '#ffe27a'); },
    headset(g, e) { const px = e.px, py = e.py; R(g, px + 6, py - 3, 5, 2, '#2a2f38'); R(g, px + 8, py - 10, 1, 7, '#3a404b'); R(g, px + 5, py - 13, 7, 2, '#14171c'); R(g, px + 4, py - 12, 2, 4, e.color || '#7c3aed'); R(g, px + 11, py - 12, 2, 4, e.color || '#7c3aed'); },
    mechkb(g, e, t) { const px = e.px, py = e.py; R(g, px + 1, py - 4, 14, 3, '#14171c'); for (let i = 0; i < 6; i++) { g.fillStyle = hsl(t * 90 + i * 30, 0.9); g.fillRect(px + 2 + i * 2, py - 4, 1, 1); } R(g, px + 1, py - 2, 14, 1, '#2a2f38'); },
    photo(g, e) { const px = e.px, py = e.py; R(g, px + 5, py - 9, 7, 8, '#c9a06a'); R(g, px + 6, py - 8, 5, 5, '#a0c3ec'); R(g, px + 7, py - 6, 2, 2, '#f2c8a0'); R(g, px + 6, py - 4, 5, 1, '#3c8059'); },
    rpi(g, e, t) { const px = e.px, py = e.py; R(g, px + 4, py - 4, 8, 3, '#1f6f3c'); R(g, px + 5, py - 5, 3, 1, '#c9ced6'); R(g, px + 9, py - 5, 2, 1, '#14171c'); R(g, px + 11, py - 3, 1, 1, Math.sin(t * 7) > 0 ? '#ff3b5c' : '#5a1a24'); },
    speaker(g, e, t) { const px = e.px, py = e.py; R(g, px + 5, py - 12, 6, 11, '#14171c'); R(g, px + 6, py - 10, 4, 4, '#2a2f38'); R(g, px + 7, py - 9, 2, 2, '#0a0b0e'); R(g, px + 7, py - 4, 2, 2, '#2a2f38'); R(g, px + 5, py - 1, 6, 1, hsl(t * 60, 0.5)); },
    pizza(g, e) { const px = e.px, py = e.py; R(g, px + 2, py - 4, 12, 3, '#c9a06a'); R(g, px + 2, py - 4, 12, 1, '#e0bd86'); R(g, px + 5, py - 3, 6, 1, '#c0392b'); },
    cans(g, e) { const px = e.px, py = e.py; [[3, '#00e5ff'], [7, '#7ee0a1'], [11, '#ff3b5c']].forEach(([x, c], i) => { R(g, px + x, py - 7 + (i % 2), 3, 5 - (i % 2), c); R(g, px + x, py - 7 + (i % 2), 3, 1, '#c9ced6'); }); },
  };

  /* ------------------------------------------------------------------ */
  /* Water cooler variants                                                */
  /* ------------------------------------------------------------------ */
  const WATER_NEW = {
    blue(g, e, t) {
      const px = e.px, py = e.py;
      R(g, px + 3, py + 12, 10, 2, SH);
      R(g, px + 4, py - 4, 8, 16, '#2a2f38'); R(g, px + 4, py - 4, 8, 1, '#4a515c');
      R(g, px + 5, py, 2, 2, '#c0392b'); R(g, px + 9, py, 2, 2, '#2a5d8a');
      R(g, px + 5, py - 16, 6, 12, 'rgba(60,140,230,0.75)'); R(g, px + 5, py - 16, 6, 1, 'rgba(200,230,255,0.8)');
      const b = Math.floor((t * 0.8 + e.seed) % 3); R(g, px + 7, py - 7 - b * 3, 1, 1, 'rgba(255,255,255,0.8)');
    },
    slim(g, e) {
      const px = e.px, py = e.py;
      R(g, px + 4, py + 12, 8, 2, SH);
      R(g, px + 5, py - 14, 6, 26, '#c9ced6'); R(g, px + 5, py - 14, 6, 1, '#ffffff'); R(g, px + 10, py - 13, 1, 25, '#9aa1ab');
      R(g, px + 6, py - 8, 4, 4, '#14171c'); R(g, px + 7, py - 7, 2, 1, C.breeze); R(g, px + 7, py - 3, 2, 1, '#2a2f38');
    },
  };

  /* ------------------------------------------------------------------ */
  /* Drawing dispatch                                                     */
  /* ------------------------------------------------------------------ */
  const DRAW = {
    fridge, vending, espresso, coffeebar, sink, microwave, kettle, snacks, tvstand, tvwall, laptop, pouf, cubes, wallcab,
    kanban, wboard, glassboard, neonclock, flipclock, sconce, ledpanel, partsbin, tripod, lavalamp, recycle, succulent,
    ventile, pdu, netcab, tapelib, fm200, kvm, serverlift,
  };
  Object.assign(DRAW, SMALL);
  // new looks for kinds that already exist (their other variants keep the original art)
  const VARIANT = { poster: POSTERS, table: TABLE_NEW, plant: PLANT_NEW, rug: RUG_NEW, water: WATER_NEW, monitor: MON_NEW };
  // the furniture layer leaves these to us whatever the rotation (they draw their own back / side)
  DL.PROPS_ROT_NATIVE = ['fridge', 'vending', 'espresso', 'coffeebar', 'sink', 'tvstand', 'glassboard', 'pdu', 'netcab', 'tapelib'];

  const base = DL.drawItem, baseGeom = DL.itemGeom;
  DL.drawItem = function (g, e, t) {
    const f = DRAW[e.kind];
    if (f) return f(g, e, t || 0);
    const vs = VARIANT[e.kind], vf = vs && e.variant && vs[e.variant];
    if (vf) {
      if (e.kind === 'poster') { const x = e.px + 2, y = e.py - 24; R(g, x - 1, y - 1, 14, 17, '#0a0b0e'); R(g, x, y, 12, 15, '#e9e9e6'); vf(g, x, y); return; }
      // turned monitors keep their edge-on art
      if (e.kind === 'monitor' && e.rot) return base(g, e, t);
      return vf(g, e, t || 0);
    }
    if (e.kind === 'painting' && PAINT_NEW[e.variant]) {
      const W = e.tw * T, x = e.px + 2, y = e.py - 24, w = W - 4, h = 14, frame = e.color || '#2a2f38';
      R(g, x - 1, y - 1, w + 2, h + 2, shade(frame, -0.35));
      R(g, x, y, w, h, frame);
      PAINT_NEW[e.variant](g, x + 1, y + 1, w - 2, h - 2);
      return;
    }
    if (e.kind === 'shelf' && e.variant === 'cubes' && !e.rot) return cubes(g, e);
    base(g, e, t);
  };

  const BOUNDS = {
    fridge: (e) => ({ x: e.px, y: e.py - 25, w: 16, h: 40 }), vending: (e) => ({ x: e.px, y: e.py - 25, w: 16, h: 40 }),
    espresso: (e) => ({ x: e.px, y: e.py - 19, w: 16, h: 34 }), coffeebar: (e) => ({ x: e.px, y: e.py - 14, w: e.tw * T, h: e.th * T + 14 }),
    sink: (e) => ({ x: e.px, y: e.py - 10, w: e.tw * T, h: e.th * T + 10 }), microwave: (e) => ({ x: e.px + 1, y: e.py - 11, w: 14, h: 11 }),
    kettle: (e) => ({ x: e.px + 3, y: e.py - 11, w: 10, h: 10 }), snacks: (e) => ({ x: e.px + 3, y: e.py - 11, w: 10, h: 10 }),
    tvstand: (e) => ({ x: e.px, y: e.py - 26, w: e.tw * T, h: e.th * T + 26 }), tvwall: (e) => ({ x: e.px, y: e.py - 28, w: e.tw * T, h: 20 }),
    laptop: (e) => ({ x: e.px + 2, y: e.py - 13, w: 12, h: 12 }), pouf: (e) => ({ x: e.px + 1, y: e.py + 1, w: 14, h: 14 }),
    wallcab: (e) => ({ x: e.px, y: e.py - 27, w: e.tw * T, h: 14 }), kanban: (e) => ({ x: e.px, y: e.py - 27, w: e.tw * T, h: 19 }),
    wboard: (e) => ({ x: e.px, y: e.py - 27, w: e.tw * T, h: 19 }), glassboard: (e) => ({ x: e.px, y: e.py - 23, w: e.tw * T, h: e.th * T + 22 }),
    neonclock: (e) => ({ x: e.px + 1, y: e.py - 24, w: 14, h: 15 }), flipclock: (e) => ({ x: e.px + 1, y: e.py - 9, w: 14, h: 8 }),
    sconce: (e) => ({ x: e.px + 4, y: e.py - 25, w: 8, h: 10 }), ledpanel: (e) => ({ x: e.px, y: e.py - 26, w: e.tw * T, h: 16 }),
    partsbin: (e) => ({ x: e.px, y: e.py - 26, w: e.tw * T, h: 17 }), tripod: (e) => ({ x: e.px + 2, y: e.py - 21, w: 13, h: 35 }),
    lavalamp: (e) => ({ x: e.px + 5, y: e.py - 15, w: 6, h: 14 }), recycle: (e) => ({ x: e.px, y: e.py - 1, w: 16, h: 15 }),
    succulent: (e) => ({ x: e.px + 3, y: e.py - 10, w: 10, h: 9 }), ventile: (e) => ({ x: e.px, y: e.py, w: 16, h: 16 }),
    pdu: (e) => ({ x: e.px, y: e.py - 19, w: 16, h: 34 }), netcab: (e) => ({ x: e.px, y: e.py - 11, w: 16, h: 26 }),
    tapelib: (e) => ({ x: e.px, y: e.py - 23, w: 16, h: 38 }), fm200: (e) => ({ x: e.px + 2, y: e.py - 16, w: 13, h: 30 }),
    kvm: (e) => ({ x: e.px + 2, y: e.py - 16, w: 12, h: 30 }), serverlift: (e) => ({ x: e.px + 1, y: e.py - 22, w: 14, h: 36 }),
  };
  for (const k of Object.keys(SMALL)) BOUNDS[k] = (e) => ({ x: e.px + 1, y: e.py - 13, w: 14, h: 12 });
  DL.itemGeom = function (e) {
    baseGeom(e);
    const b = BOUNDS[e.kind];
    if (b) e.bounds = b(e);
    if (e.kind === 'plant' && e.variant === 'olive') e.bounds = { x: e.px, y: e.py - 31, w: 16, h: 46 };
    if (e.kind === 'plant' && e.variant === 'bamboo') e.bounds = { x: e.px + 2, y: e.py - 28, w: 12, h: 42 };
    if (e.wall) { e.ix = e.px + e.tw * 8; e.iy = e.py + 10; }
  };

  // isometric volumes for the new kinds (iso.js reads this when it loads)
  DL.ISO_EXTRA = {
    box: ['fridge', 'vending', 'espresso', 'coffeebar', 'sink', 'pdu', 'netcab', 'tapelib', 'ups'],
    split: { espresso: -2, coffeebar: -2, sink: -1 },
    card: ['tvstand', 'glassboard'],
    flat: ['ventile'],
  };

  // light from the new lamps and screens (decor.js draws the glow table)
  if (DL.DECOR_GLOW) Object.assign(DL.DECOR_GLOW, {
    lavalamp: (e) => [e.px + 8, e.py - 8, 14, e.color || '#ff2bd6', 0.14],
    tripod: (e) => [e.px + 8, e.py - 12, 30, e.color || '#ffe9b0', 0.1],
    sconce: (e) => [e.px + 8, e.py - 18, 22, e.color || '#ffc285', 0.12],
    ledpanel: (e) => [e.px + e.tw * 8, e.py - 20, 24, e.color || '#00e5ff', 0.12],
    neonclock: (e) => [e.px + 8, e.py - 16, 18, e.color || '#00e5ff', 0.12],
    vending: (e) => [e.px + 8, e.py - 8, 18, '#a0c3ec', 0.08],
    tvstand: (e) => [e.px + e.tw * 8, e.py - 14, 20, '#a0c3ec', 0.07],
    tvwall: (e) => [e.px + e.tw * 8, e.py - 18, 22, '#a0c3ec', 0.07],
  });

  /* ------------------------------------------------------------------ */
  /* Catalog                                                             */
  /* ------------------------------------------------------------------ */
  const it = (cat, id, group, name, price, desc, o) => Object.assign({ id, cat, group, name, price, desc }, o || {});
  const E = (...a) => it('equip', ...a), F = (...a) => it('furn', ...a), D = (...a) => it('deco', ...a);
  const SURF = { mount: 'surface' }, WALL = { mount: 'wall' };
  DL.PROPS_CATALOG = [
    // workstations (desk setups added to sprites.js' DESK_SETUPS below)
    E('deskwork', 'Estações', 'Workstation', 4600, 'Dois monitores grandes e torre de alto desempenho.', { kind: 'desk', w: 2, h: 1, setup: 'work' }),
    E('deskoffice', 'Estações', 'Estação de escritório', 1700, 'Monitor, notebook e documentos.', { kind: 'desk', w: 2, h: 1, setup: 'office' }),
    E('deskstream', 'Estações', 'Setup de streaming', 5600, 'Três telas com RGB, para quem vive conectado.', { kind: 'desk', w: 2, h: 1, setup: 'stream', chair: 'gamer' }),
    // screens
    E('tvstand', 'TVs e telas', 'TV 32" com pedestal', 900, 'TV pequena num pedestal. A equipe para para assistir.'),
    E('tvstand_big', 'TVs e telas', 'TV 55" com pedestal', 1800, 'TV grande, 2 tiles.', { kind: 'tvstand', w: 2, h: 1 }),
    E('tvwall', 'TVs e telas', 'TV de parede 32"', 800, 'TV pendurada na parede do fundo.', WALL),
    E('tvwall_big', 'TVs e telas', 'TV de parede 55"', 1500, 'TV grande na parede, 2 tiles.', { kind: 'tvwall', mount: 'wall', w: 2, h: 1 }),
    E('tvwall_cinema', 'TVs e telas', 'Telão 75"', 2600, 'Telão de 3 tiles para a sala de descanso.', { kind: 'tvwall', mount: 'wall', w: 3, h: 1 }),
    E('mon_curved', 'TVs e telas', 'Monitor curvo', 700, 'Ultrawide curvo com RGB. Em cima de uma mesa.', { kind: 'monitor', mount: 'surface', set: { variant: 'curved' } }),
    E('mon_vertical', 'TVs e telas', 'Monitor vertical', 450, 'Monitor em pé para código e logs.', { kind: 'monitor', mount: 'surface', set: { variant: 'vertical' } }),
    E('mon_crt', 'TVs e telas', 'Monitor CRT', 250, 'Fósforo verde, para os nostálgicos.', { kind: 'monitor', mount: 'surface', set: { variant: 'crt' } }),
    E('laptop', 'Notebooks', 'Notebook', 1600, 'Em cima de uma mesa. Com cadeira em frente vira estação.', SURF),
    E('laptop_silver', 'Notebooks', 'Notebook alumínio', 2400, 'Fino e prateado.', { kind: 'laptop', mount: 'surface', set: { variant: 'silver' } }),
    E('laptop_gamer', 'Notebooks', 'Notebook gamer', 3200, 'Teclado RGB e placa de vídeo dedicada.', { kind: 'laptop', mount: 'surface', set: { variant: 'gamer' } }),
    // datacenter accessories
    E('ups', 'Energia', 'Nobreak modular', 7800, 'Segura a carga até o gerador assumir. 2 tiles.', { w: 2, h: 1 }),
    E('pdu', 'Energia', 'Quadro PDU', 2400, 'Distribuição de energia para os racks.'),
    E('netcab', 'Racks', 'Rack de parede', 1100, 'Mini rack com porta de vidro para a rede do andar.'),
    E('tapelib', 'Storage', 'Biblioteca de fitas', 9500, 'Backup em fita LTO, robô incluso.'),
    E('fm200', 'Segurança', 'Cilindros FM-200', 3200, 'Supressão de incêndio por gás para a sala de servidores.'),
    E('kvm', 'Racks', 'Carrinho KVM', 900, 'Monitor e teclado de emergência para os racks.'),
    E('serverlift', 'Racks', 'Elevador de servidor', 1300, 'Para instalar equipamentos pesados no rack.'),
    E('ventile', 'Racks', 'Placa perfurada', 120, 'Piso elevado ventilado no corredor frio.', { solid: false, rug: true }),
    // tables
    F('table_gamer', 'Mesas', 'Mesa gamer', 1300, 'Preta com LED na borda.', { kind: 'table', w: 2, h: 1, set: { variant: 'gamer' } }),
    F('table_office', 'Mesas', 'Mesa de escritório', 700, 'Tampo claro e painel frontal.', { kind: 'table', w: 2, h: 1, set: { variant: 'office' } }),
    F('table_big', 'Mesas', 'Mesa grande', 1100, 'Mesa comprida de madeira, 3 × 1.', { kind: 'table', w: 3, h: 1, set: { variant: 'wood' } }),
    F('table_L', 'Mesas', 'Mesa em L', 1600, 'Mesa de canto 2 × 2: a cadeira vai no vão.', { kind: 'table', w: 2, h: 2, set: { variant: 'L' } }),
    F('table_round', 'Mesas', 'Mesa redonda', 1500, 'Reunião em roda, 2 × 2.', { kind: 'table', w: 2, h: 2, set: { variant: 'round' } }),
    F('table_tech', 'Bancadas', 'Mesa técnica', 1100, 'Metal com manta ESD laranja.', { kind: 'table', w: 2, h: 1, set: { variant: 'tech' } }),
    F('workbench', 'Bancadas', 'Bancada de reparo', 2600, 'Estação de solda, lupa e peças: os técnicos consertam aqui.', { kind: 'table', w: 2, h: 1, set: { variant: 'repair' } }),
    // seats
    F('chair_red', 'Cadeiras', 'Cadeira vermelha', 300, 'Cadeira de escritório, assento vermelho.', { kind: 'chair', solid: false, set: { color: '#c0392b' } }),
    F('chair_white', 'Cadeiras', 'Cadeira branca', 300, 'Cadeira de escritório clara.', { kind: 'chair', solid: false, set: { color: '#d9dde3' } }),
    F('chair_gamer_green', 'Gamer', 'Cadeira gamer verde', 1100, 'Concha esportiva verde.', { kind: 'chair', solid: false, set: { variant: 'gamer', color: '#1f9a5a' } }),
    F('chair_gamer_pink', 'Gamer', 'Cadeira gamer rosa', 1100, 'Concha esportiva rosa.', { kind: 'chair', solid: false, set: { variant: 'gamer', color: '#ff2bd6' } }),
    F('sofa_blue', 'Sofás', 'Sofá azul', 1200, 'Dois lugares, tecido azul.', { kind: 'sofa', w: 2, h: 1, set: { color: '#2a5d8a' } }),
    F('sofa_green', 'Sofás', 'Sofá verde', 1200, 'Dois lugares, veludo verde.', { kind: 'sofa', w: 2, h: 1, set: { color: '#1f6f5c' } }),
    F('sofa_big', 'Sofás', 'Sofá 4 lugares', 2400, 'Para o time inteiro, 4 × 1.', { kind: 'sofa', w: 4, h: 1, set: { color: '#5d6878' } }),
    F('armchair_gray', 'Sofás', 'Poltrona cinza', 650, 'Poltrona de um lugar.', { kind: 'sofa', w: 1, h: 1, set: { color: '#8a8f98' } }),
    F('armchair_red', 'Sofás', 'Poltrona vermelha', 650, 'Poltrona de um lugar.', { kind: 'sofa', w: 1, h: 1, set: { color: '#8a2d3b' } }),
    F('pouf', 'Puffs', 'Puff redondo', 160, 'Senta e descansa.', { set: { color: '#ff7a17' } }),
    F('pouf_teal', 'Puffs', 'Puff turquesa', 160, 'Senta e descansa.', { kind: 'pouf', set: { color: '#00a8c6' } }),
    F('beanbag_pink', 'Puffs', 'Pufe rosa', 180, 'Pufe de bolinhas.', { kind: 'beanbag', set: { color: '#ff7aa8' } }),
    F('beanbag_gray', 'Puffs', 'Pufe cinza', 180, 'Pufe de bolinhas.', { kind: 'beanbag', set: { color: '#5d6878' } }),
    // storage
    F('shelf_cubes', 'Estantes', 'Nicho organizador', 550, 'Cubos com caixas coloridas.', { kind: 'shelf', w: 2, h: 1, set: { variant: 'cubes' } }),
    F('wallcab', 'Prateleiras', 'Armário de parede', 400, 'Armário suspenso, 2 tiles.', { mount: 'wall', w: 2, h: 1 }),
    // kitchen
    F('fridge', 'Copa', 'Geladeira', 2600, 'Bebidas geladas para a equipe.'),
    F('vending', 'Copa', 'Máquina de lanches', 3200, 'Refrigerantes e salgadinhos.'),
    F('espresso', 'Copa', 'Máquina de espresso', 2200, 'Café de verdade, num balcão próprio.'),
    F('coffeebar', 'Copa', 'Cantinho do café', 2900, 'Balcão com cafeteira, copos e cardápio. 2 tiles.', { w: 2, h: 1 }),
    F('sink', 'Copa', 'Pia da copa', 1400, 'Balcão com pia e escorredor, 2 tiles.', { w: 2, h: 1 }),
    F('microwave', 'Copa', 'Micro-ondas', 450, 'Em cima de uma mesa ou balcão.', SURF),
    F('kettle', 'Copa', 'Chaleira elétrica', 120, 'Chá para os dias longos. Em cima de uma mesa.', SURF),
    F('snacks', 'Copa', 'Pote de biscoitos', 40, 'Em cima de uma mesa.', SURF),
    F('water_blue', 'Copa', 'Bebedouro galão', 260, 'Galão azul clássico.', { kind: 'water', set: { variant: 'blue' } }),
    F('water_slim', 'Copa', 'Purificador de água', 380, 'Purificador alto de inox.', { kind: 'water', set: { variant: 'slim' } }),
    // maintenance
    F('partsbin', 'Bancadas', 'Gaveteiro de peças', 220, 'Parafusos e conectores na parede, 2 tiles.', { mount: 'wall', w: 2, h: 1 }),
    // decoration: posters and paintings
    D('poster_net', 'Quadros', 'Pôster topologia', 60, 'Core, distribuição e acesso.', { kind: 'poster', mount: 'wall', set: { variant: 'net' } }),
    D('poster_cloud', 'Quadros', 'Pôster nuvem', 60, 'Não existe nuvem, é o computador de alguém.', { kind: 'poster', mount: 'wall', set: { variant: 'cloud' } }),
    D('poster_invader', 'Gamer', 'Pôster invasor', 60, 'Arcade dos anos 80.', { kind: 'poster', mount: 'wall', set: { variant: 'invader' } }),
    D('poster_gamepad', 'Gamer', 'Pôster controle', 60, 'Pausa para uma partida.', { kind: 'poster', mount: 'wall', set: { variant: 'gamepad' } }),
    D('poster_fine', 'Quadros', 'Pôster "tudo bem"', 60, 'Quando o incidente é grande demais.', { kind: 'poster', mount: 'wall', set: { variant: 'fine' } }),
    D('poster_brew', 'Quadros', 'Pôster café → código', 60, 'Combustível do turno.', { kind: 'poster', mount: 'wall', set: { variant: 'brew' } }),
    D('poster_prompt', 'Quadros', 'Pôster terminal', 60, '$ sudo vire-se.', { kind: 'poster', mount: 'wall', set: { variant: 'prompt' } }),
    D('poster_404', 'Quadros', 'Pôster 404', 60, 'Decoração não encontrada.', { kind: 'poster', mount: 'wall', set: { variant: 'err404' } }),
    D('painting_circuit', 'Quadros', 'Quadro placa-mãe', 280, 'Trilhas douradas.', { kind: 'painting', mount: 'wall', w: 2, h: 1, set: { variant: 'circuit', color: '#2a2f38' } }),
    D('painting_synth', 'Quadros', 'Quadro synthwave', 280, 'Pôr do sol neon.', { kind: 'painting', mount: 'wall', w: 2, h: 1, set: { variant: 'synth', color: '#14171c' } }),
    // boards
    D('kanban', 'Quadros brancos', 'Quadro kanban', 260, 'A fazer · fazendo · feito. Na parede, 2 tiles.', { mount: 'wall', w: 2, h: 1 }),
    D('wboard', 'Quadros brancos', 'Quadro branco de parede', 240, 'Diagramas e listas, 2 tiles.', { mount: 'wall', w: 2, h: 1 }),
    D('glassboard', 'Quadros brancos', 'Painel de vidro', 600, 'Quadro de vidro com post-its, 2 × 1.', { w: 2, h: 1 }),
    // plants
    D('plant_bamboo', 'Plantas', 'Bambu da sorte', 110, 'Alto e elegante.', { kind: 'plant', set: { variant: 'bamboo' } }),
    D('plant_fern', 'Plantas', 'Samambaia', 90, 'Folhas pendentes.', { kind: 'plant', set: { variant: 'fern' } }),
    D('plant_olive', 'Plantas', 'Oliveira', 260, 'Árvore de interior bem alta.', { kind: 'plant', set: { variant: 'olive' } }),
    D('plant_lavender', 'Plantas', 'Lavanda', 80, 'Cheirinho bom na sala.', { kind: 'plant', set: { variant: 'lavender' } }),
    D('succulent', 'Plantas', 'Suculenta', 30, 'Em cima de uma mesa.', SURF),
    // clocks and lights
    D('neonclock', 'Relógios', 'Relógio neon', 220, 'Anel de neon na parede.', WALL),
    D('flipclock', 'Relógios', 'Relógio flip', 90, 'Em cima de uma mesa.', SURF),
    D('tripod', 'Luminárias', 'Luminária tripé', 260, 'Madeira e cúpula clara.'),
    D('lavalamp', 'RGB', 'Lâmpada de lava', 120, 'Bolhas lentas. Em cima de uma mesa.', SURF),
    D('sconce', 'Luminárias', 'Arandela', 140, 'Luz quente na parede.', WALL),
    D('ledpanel', 'RGB', 'Painel de LED', 380, 'Grade de LEDs na parede, 2 tiles.', { mount: 'wall', w: 2, h: 1 }),
    // rugs
    D('rug_round', 'Tapetes', 'Tapete redondo', 260, 'Redondo, 2 × 2.', { kind: 'rug', w: 2, h: 2, solid: false, set: { variant: 'round' } }),
    D('rug_stripe', 'Tapetes', 'Tapete listrado', 220, 'Listras, 2 × 2.', { kind: 'rug', w: 2, h: 2, solid: false, set: { variant: 'stripe' } }),
    D('rug_circuit', 'Tapetes', 'Tapete circuito', 320, 'Placa de circuito no chão, 2 × 2.', { kind: 'rug', w: 2, h: 2, solid: false, set: { variant: 'circuit' } }),
    D('rug_runner', 'Tapetes', 'Passadeira', 240, 'Tapete comprido para corredores, 3 × 1.', { kind: 'rug', w: 3, h: 1, solid: false, set: { variant: 'runner' } }),
    // bins and small things
    D('recycle', 'Lixeiras', 'Lixeira de recicláveis', 120, 'Papel, plástico e metal.'),
    D('duck', 'Objetos', 'Pato de borracha', 15, 'Explique o bug para ele. Em cima de uma mesa.', SURF),
    D('headset', 'Objetos', 'Headset no suporte', 180, 'Em cima de uma mesa.', SURF),
    D('mechkb', 'Objetos', 'Teclado mecânico', 350, 'RGB e switches barulhentos. Em cima de uma mesa.', SURF),
    D('photo', 'Objetos', 'Porta-retrato', 25, 'Em cima de uma mesa.', SURF),
    D('rpi', 'Objetos', 'Raspberry Pi', 90, 'Um servidorzinho de estimação. Em cima de uma mesa.', SURF),
    D('speaker', 'Objetos', 'Caixa de som', 160, 'Em cima de uma mesa.', SURF),
    D('pizza', 'Objetos', 'Caixa de pizza', 20, 'Plantão de sexta. Em cima de uma mesa.', SURF),
    D('cans', 'Objetos', 'Latas de energético', 15, 'Em cima de uma mesa.', SURF),
  ];

  // more desk setups (sprites.js draws them from these fields)
  if (DL.DESK_SETUPS) Object.assign(DL.DESK_SETUPS, {
    work: { mons: [[1, -18, 14, 12], [17, -18, 14, 12]], main: 0, tower: 'under', docs: true },
    office: { mons: [[16, -16, 12, 10]], main: 0, tower: 'under', laptop: 1, docs: true },
    stream: { mons: [[0, -15, 10, 9], [11, -18, 11, 12], [23, -15, 9, 9]], main: 1, tower: 'rgbUnder', rgb: true },
  });
  DL.PROPS_SETUP_NAMES = { work: 'Workstation', office: 'Estação de escritório', stream: 'Setup de streaming' };

  const NAMES = {
    fridge: 'Geladeira', vending: 'Máquina de lanches', espresso: 'Máquina de espresso', coffeebar: 'Cantinho do café', sink: 'Pia', microwave: 'Micro-ondas',
    kettle: 'Chaleira', snacks: 'Biscoitos', tvstand: 'TV', tvwall: 'TV de parede', laptop: 'Notebook', pouf: 'Puff', wallcab: 'Armário de parede',
    kanban: 'Quadro kanban', wboard: 'Quadro branco', glassboard: 'Painel de vidro', neonclock: 'Relógio neon', flipclock: 'Relógio flip', sconce: 'Arandela',
    ledpanel: 'Painel de LED', partsbin: 'Gaveteiro de peças', tripod: 'Luminária tripé', lavalamp: 'Lâmpada de lava', recycle: 'Recicláveis',
    succulent: 'Suculenta', ventile: 'Placa perfurada', pdu: 'Quadro PDU', netcab: 'Rack de parede', tapelib: 'Biblioteca de fitas', fm200: 'FM-200',
    kvm: 'Carrinho KVM', serverlift: 'Elevador de servidor', ups: 'Nobreak', duck: 'Pato de borracha', headset: 'Headset', mechkb: 'Teclado mecânico',
    photo: 'Porta-retrato', rpi: 'Raspberry Pi', speaker: 'Caixa de som', pizza: 'Pizza', cans: 'Energéticos',
  };
  if (DL.DECOR_NAMES) Object.assign(DL.DECOR_NAMES, NAMES);

  // inspector options (applied by build.js once furniture.js has set up its own lists)
  DL.applyPropsStyles = function () {
    const S = DL.ITEM_STYLES;
    if (!S) return;
    const opt = (k, key) => (S[k] || []).find((o) => o.key === key);
    const add = (k, key, more) => { const o = opt(k, key); if (o) for (const m of more) if (!o.options.some((x) => x[0] === m[0])) o.options.push(m); };
    add('table', 'variant', [['gamer', 'Gamer'], ['office', 'Escritório'], ['tech', 'Técnica'], ['repair', 'Reparo']]);
    add('poster', 'variant', [['net', 'Topologia'], ['cloud', 'Nuvem'], ['invader', 'Invasor'], ['gamepad', 'Controle'], ['fine', 'Tudo bem'], ['brew', 'Café'], ['prompt', 'Terminal'], ['err404', '404']]);
    add('plant', 'variant', [['bamboo', 'Bambu'], ['fern', 'Samambaia'], ['olive', 'Oliveira'], ['lavender', 'Lavanda']]);
    add('painting', 'variant', [['circuit', 'Placa'], ['synth', 'Synthwave']]);
    add('monitor', 'variant', [['curved', 'Curvo'], ['vertical', 'Vertical'], ['crt', 'CRT']]);
    add('shelf', 'variant', [['cubes', 'Nichos']]);
    const desk = opt('desk', 'setup');
    if (desk) for (const m of [['work', 'Workstation'], ['office', 'Escritório'], ['stream', 'Streaming']]) if (!desk.options.some((x) => x[0] === m[0])) desk.options.push(m);
    const SHOWS = { key: 'show', label: 'Canal', options: [['', 'Auto'], ['news', 'Notícias'], ['match', 'Futebol'], ['dash', 'Métricas'], ['nature', 'Natureza']] };
    const RGB = ['#ff2bd6', '#00e5ff', '#7c5cff', '#7ee0a1', '#ffd23f', '#ff7a17'];
    Object.assign(S, {
      tvstand: [SHOWS], tvwall: [SHOWS],
      laptop: [{ key: 'variant', label: 'Modelo', options: [['', 'Comum'], ['silver', 'Alumínio'], ['gamer', 'Gamer']] }],
      pouf: [{ key: 'color', label: 'Cor', colors: ['#ff7a17', '#00a8c6', '#7c3aed', '#ff3b5c', '#7ee0a1', '#e9e9e6'] }],
      fridge: [{ key: 'color', label: 'Cor', colors: ['#dfe3e8', '#2a2f38', '#c0392b', '#a0c3ec'] }],
      vending: [{ key: 'color', label: 'Cor', colors: ['#b8323f', '#2a5d8a', '#1f6f5c', '#14171c'] }],
      coffeebar: [{ key: 'color', label: 'Balcão', colors: ['#3b2c22', '#6b5038', '#e9e9e6', '#2a2f38'] }],
      espresso: [{ key: 'color', label: 'Móvel', colors: ['#6b5038', '#3b2c22', '#2a2f38', '#e9e9e6'] }],
      sink: [{ key: 'color', label: 'Balcão', colors: ['#e9e9e6', '#2a2f38', '#6b5038', '#a0c3ec'] }],
      lavalamp: [{ key: 'color', label: 'Cor', colors: RGB }], ledpanel: [{ key: 'variant', label: 'Modo', options: [['', 'Cor fixa'], ['rainbow', 'Arco-íris']] }, { key: 'color', label: 'Cor', colors: RGB }],
      neonclock: [{ key: 'color', label: 'Cor', colors: RGB }], sconce: [{ key: 'color', label: 'Luz', colors: ['#ffc285', '#ffe9b0', '#a0c3ec'] }],
      headset: [{ key: 'color', label: 'Cor', colors: ['#7c3aed', '#ff3b5c', '#00a8c6', '#14171c'] }],
    });
    if (S.rug) S.rug = S.rug.concat(S.rug.some((o) => o.key === 'variant') ? [] : [{ key: 'variant', label: 'Estampa', options: [['', 'Liso'], ['round', 'Redondo'], ['stripe', 'Listras'], ['circuit', 'Circuito']] }]);
  };
})();
