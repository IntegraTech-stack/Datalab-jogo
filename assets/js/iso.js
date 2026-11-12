/* DataLab — isometric 2.5D view.
   The simulation keeps living on the top-down tile grid (world pixels, collision, paths, rooms,
   build rules); only the camera changes. A scene created with `iso: true` projects the world with
   a 2:1 isometric camera — x → (1, ½), y → (−1, ½), z straight up — and gives everything volume:
   · the baked floor canvas is laid on the ground plane; outer walls are extruded (tall at the back
     of each room, a low rim at the front so the room stays visible), inner walls and doors too;
   · every object keeps its procedural pixel art, mapped onto real geometry: boxes (racks, cabinets:
     the front art on the front face), surfaces (desks and tables: legs, slab, the art of the top on
     the top and the monitors standing on it), cards (monitors, whiteboards, wall decoration) and
     billboards (plants, chairs, people);
   · a topological depth sort, contact shadows, wall ambient occlusion and additive lights.
   Picking, anchors and overlays get iso-aware helpers (pickAt, itemTop, spriteSpace, markItem…). */
(function () {
  'use strict';
  const DL = window.DL;
  if (!DL || !DL.Scene) return;
  const T = DL.T, R = DL.R, shade = DL.shade, SP = DL.Scene.prototype;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  // heights in world pixels (a person is ~31 tall)
  const H_BACK = 44, H_LOW = 5, H_IN = 32, H_CUT = 7, WT = 4, H_DOOR = 26, BASE = 12, LIFT = 8;
  DL.ISO = { H_BACK, H_IN, H_DOOR, LIFT };

  /* ------------------------------------------------------------------ */
  /* Projection helpers                                                  */
  /* ------------------------------------------------------------------ */
  const IX = (x, y) => x - y;
  const IY = (x, y, z) => (x + y) / 2 - (z || 0);

  // iso-pixel space (what all polygons below are drawn in)
  function isoT(g, sc) { g.setTransform(sc.S, 0, 0, sc.S, -sc.ox, -sc.oy); }
  // world ground plane (z = height)
  function groundT(g, sc, z) { const S = sc.S; g.setTransform(S, S / 2, -S, S / 2, -sc.ox, -sc.oy - S * (z || 0)); }
  // sprite space → world: point = O + sx·U + sy·V (3-vectors), then projected
  function mapM(sc, O, U, V) {
    const S = sc.S;
    return [S * (U[0] - U[1]), S * ((U[0] + U[1]) / 2 - U[2]), S * (V[0] - V[1]), S * ((V[0] + V[1]) / 2 - V[2]), S * (O[0] - O[1]) - sc.ox, S * ((O[0] + O[1]) / 2 - O[2]) - sc.oy];
  }
  function setMap(g, sc, O, U, V) { const m = mapM(sc, O, U, V); g.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]); }
  // other modules map their own art onto the world with it (street.js)
  DL.isoMap = setMap;

  function path(g, pts) {
    g.beginPath();
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], x = IX(p[0], p[1]), y = IY(p[0], p[1], p[2]);
      if (i) g.lineTo(x, y); else g.moveTo(x, y);
    }
    g.closePath();
  }
  // filled polygon (iso-pixel space); the hairline stroke in the same colour hides AA seams
  function poly(g, pts, fill, seam) {
    path(g, pts);
    g.fillStyle = fill;
    g.fill();
    if (seam !== false) { g.strokeStyle = fill; g.stroke(); }
  }
  function line(g, a, b, col, w) {
    g.beginPath();
    g.moveTo(IX(a[0], a[1]), IY(a[0], a[1], a[2]));
    g.lineTo(IX(b[0], b[1]), IY(b[0], b[1], b[2]));
    g.strokeStyle = col;
    const lw = g.lineWidth;
    if (w) g.lineWidth = w;
    g.stroke();
    g.lineWidth = lw;
  }
  // world-aligned box: the visible faces are south (y = y1), east (x = x1) and the top
  function box(g, x0, y0, x1, y1, z0, z1, c) {
    if (c.s) poly(g, [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], c.s);
    if (c.e) poly(g, [[x1, y1, z0], [x1, y0, z0], [x1, y0, z1], [x1, y1, z1]], c.e);
    if (c.t) poly(g, [[x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]], c.t);
  }
  // the same drawing tools for other modules (street.js), in iso-pixel space after DL.isoKit.isoT(g, sc)
  DL.isoKit = { box, poly, line, isoT: (g, sc) => isoT(g, sc), setMap, drawActor: (g, sc, a, ghost) => drawActor(g, sc, a, ghost) };
  // screen silhouette of a box (convex hexagon, iso pixels)
  function hull(x0, y0, x1, y1, z0, z1) {
    return [[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y1, z1]].map((p) => [IX(p[0], p[1]), IY(p[0], p[1], p[2])]);
  }
  function bboxOf(pts) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const p of pts) { if (p[0] < x0) x0 = p[0]; if (p[0] > x1) x1 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[1] > y1) y1 = p[1]; }
    return [x0, y0, x1, y1];
  }
  function inPoly(pts, x, y) {
    let s = 0;
    for (let i = 0; i < pts.length; i++) {
      const a = pts[i], b = pts[(i + 1) % pts.length];
      const c = (b[0] - a[0]) * (y - a[1]) - (b[1] - a[1]) * (x - a[0]);
      if (c === 0) continue;
      if (s === 0) s = Math.sign(c);
      else if (Math.sign(c) !== s) return false;
    }
    return true;
  }
  const hexA = (c, a) => (DL.rgba ? DL.rgba(c, a) : c);

  /* ------------------------------------------------------------------ */
  /* Scratch canvas: each object's pixel art is painted here, then mapped */
  /* ------------------------------------------------------------------ */
  const SW = 224, SH = 224, OX = 88, OY = 144;
  // Each object of a frame paints into its own scratch: repainting one shared canvas while the copy
  // just blitted from it is still pending makes the browser duplicate (or flush) it every time.
  const POOL = [];
  let SC = null, next = 0;
  function scratch() {
    if (next >= POOL.length) { const c = DL.mk(SW, SH); POOL.push({ c, g: c.getContext('2d') }); }
    const s = POOL[next];
    next = (next + 1) % 256;
    SC = s.c;
    return s.g;
  }
  const PR = DL.mk(SW, SH), pg = PR.getContext('2d', { willReadFrequently: true });
  let warned = false;
  // Each object of the map keeps its painted art in its own canvas and repaints it at most every ART_MS
  // (its little animations — screens, LEDs, fans — still run at ~20 fps). A canvas that doesn't change
  // stays in the graphics card between frames: re-uploading every object's art every frame was the most
  // expensive part of drawing. Ghosts and previews (not on the map) are painted fresh every time.
  const ART_MS = 50, ART_FRAMES = 3;
  let artNow = 0, artFrame = 0, onMap = null, onMapV = -1, onMapW = null;
  const ART = new WeakMap();
  function paint(ctx, c, t) {
    const e = Object.getPrototypeOf(c);
    if (ctx !== pg && onMap && onMap.has(e)) {
      const k = (c.rot | 0) + ',' + c.tw + ',' + c.th + ',' + (c.variant || '');
      let m = ART.get(e);
      // (at least ART_MS and ART_FRAMES apart, so a slow device isn't repainting everything every frame;
      // each object starts at its own point of the cycle so they don't all repaint on the same frame)
      if (m && m.k === k && (artNow - m.at < ART_MS || artFrame - m.f < ART_FRAMES)) { SC = m.c; return; }
      if (!m) { const cv = DL.mk(SW, SH); m = { c: cv, g: cv.getContext('2d'), k: '', at: 0, f: 0 }; ART.set(e, m); }
      const fresh = !m.k;
      m.k = k;
      m.at = artNow;
      m.f = artFrame - (fresh ? Math.floor(Math.random() * ART_FRAMES) : 0);
      ctx = m.g;
      SC = m.c;
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, SW, SH);
    try { DL.drawItem(ctx, c, t || 0); } catch (err) { if (!warned) { warned = true; console.warn('iso: could not paint', c.kind, err); } }
  }
  // the object as if it stood at the scratch origin (optionally turned to `rot` with a footprint)
  function clone(e, rot, tw, th) {
    const c = Object.create(e);
    c.px = OX;
    c.py = OY;
    if (rot != null) { c.rot = rot; c.tw = tw; c.th = th; }
    if (e.cx != null) { c.cx = OX + (e.cx - e.px); c.cy = OY + (e.cy - e.py); }
    return c;
  }
  // copy a rectangle of the scratch (in coordinates relative to the object origin)
  function blit(g, x, y, w, h) {
    let sx = OX + x, sy = OY + y;
    if (sx < 0) { w += sx; x -= sx; sx = 0; }
    if (sy < 0) { h += sy; y -= sy; sy = 0; }
    w = Math.min(w, SW - sx);
    h = Math.min(h, SH - sy);
    if (w > 0 && h > 0) g.drawImage(SC, sx, sy, w, h, x, y, w, h);
  }

  // Measured once per look: opaque extent of the art and its main colours.
  const LOOKS = new Map();
  const hex = (r, g, b) => '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
  const keyOf = (e, rot, tw, th, tag) => (tag || '') + e.kind + '|' + (e.variant || '') + '|' + (e.model || '') + '|' + (e.setup || '') + '|' + (e.color || '') + '|' + rot + '|' + tw + '|' + th + (DL.skinKey ? '|' + DL.skinKey(e) : '');
  function look(key, c) {
    let L = LOOKS.get(key);
    if (L) return L;
    paint(pg, c, 0);
    const d = pg.getImageData(0, 0, SW, SH).data;
    let x0 = SW, x1 = -1, y0 = SH, y1 = -1, n = 0, r = 0, gr = 0, b = 0;
    for (let y = 0; y < SH; y++) {
      for (let x = 0; x < SW; x++) {
        const i = (y * SW + x) * 4;
        if (d[i + 3] < 150) continue;
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
        r += d[i]; gr += d[i + 1]; b += d[i + 2]; n++;
      }
    }
    if (!n) L = { empty: true, x0: 0, x1: 16, y0: -16, y1: 14, body: '#2a2f38', top: '#3a414c' };
    else {
      let tr = 0, tg = 0, tb = 0, tn = 0;
      for (let y = y0; y <= Math.min(y1, y0 + 1); y++) {
        for (let x = x0; x <= x1; x++) {
          const i = (y * SW + x) * 4;
          if (d[i + 3] < 150) continue;
          tr += d[i]; tg += d[i + 1]; tb += d[i + 2]; tn++;
        }
      }
      L = {
        x0: x0 - OX, x1: x1 + 1 - OX, y0: y0 - OY, y1: y1 + 1 - OY,
        body: hex(Math.round(r / n), Math.round(gr / n), Math.round(b / n)),
        top: tn ? hex(Math.round(tr / tn), Math.round(tg / tn), Math.round(tb / tn)) : '#3a414c',
      };
    }
    LOOKS.set(key, L);
    return L;
  }

  /* ------------------------------------------------------------------ */
  /* Object frame: which way the object faces                            */
  /* ------------------------------------------------------------------ */
  // u runs along the object's front (the art's x), v goes from the front edge to the back.
  // Facing south / north the front is drawn on the south face ("S view"); facing east / west on the
  // east face ("E view"). The art is the front (rot 0) or, when the front is turned away, the back.
  function frameOf(e) {
    const r = e.rot | 0, side = r === 2 || r === 3;
    return { side, art: r === 0 || r === 2 ? 0 : 1, Wf: (side ? e.th : e.tw) * T, Df: (side ? e.tw : e.th) * T, x0: e.px, y0: e.py, x1: e.px + e.tw * T, y1: e.py + e.th * T };
  }
  const fw = (f, u, v, z) => (f.side ? [f.x1 - v, f.y1 - u, z] : [f.x0 + u, f.y1 - v, z]);
  const fU = (f) => (f.side ? [0, -1, 0] : [1, 0, 0]);
  function frect(f, u0, u1, v0, v1) { return f.side ? [f.x1 - v1, f.y1 - u1, f.x1 - v0, f.y1 - u0] : [f.x0 + u0, f.y1 - v1, f.x0 + u1, f.y1 - v0]; }
  // a box in the object's frame; `face` colours the side with the art, `side` the other visible one
  function fbox(g, f, u0, u1, v0, v1, z0, z1, face, side, top) {
    const r = frect(f, u0, u1, v0, v1);
    box(g, r[0], r[1], r[2], r[3], z0, z1, f.side ? { s: side, e: face, t: top } : { s: face, e: side, t: top });
    return r;
  }
  // card standing in the object's frame at depth v: sprite rows map to height (row `base` = z0)
  function cardMap(sc, f, v, z0, base) { return [fw(f, 0, v, z0 + base), fU(f), [0, 0, -1]]; }
  // remember how the object's own sprite coordinates land on screen (overlays reuse it)
  function remember(sc, e, M, dx, dy) {
    const O = M[0], U = M[1], V = M[2];
    const O2 = [O[0] - U[0] * dx - V[0] * dy, O[1] - U[1] * dx - V[1] * dy, O[2] - U[2] * dx - V[2] * dy];
    e._isoSp = { m: mapM(sc, O2, U, V), f: sc._isoFrame };
  }

  /* ------------------------------------------------------------------ */
  /* Categories                                                          */
  /* ------------------------------------------------------------------ */
  const BOX = { rack: 1, switch: 1, router: 1, core: 1, storage: 1, crac: 1, ups: 1, cabinet: 1, drawers: 1, steelrack: 1, tvrack: 1, printer: 1, oldserver: 1, shelf: 1, arcade: 1, toolcart: 1, water: 1, pallet: 1 };
  const SPLIT = { tvrack: 1, water: -4 }; // rows above stand on the box as a card (TV, water bottle)
  const CARD = { monitor: 1, whiteboard: 1, banner: 1 };
  const FLAT = {};
  // kinds added by other modules (props.js)
  const X = DL.ISO_EXTRA || {};
  for (const k of X.box || []) BOX[k] = 1;
  for (const k of X.card || []) CARD[k] = 1;
  for (const k of X.flat || []) FLAT[k] = 1;
  Object.assign(SPLIT, X.split || {});
  const isRug = (e) => e.kind === 'rug' || !!e.rug || !!FLAT[e.kind] || (e.kind && e.kind.indexOf('rug_') === 0);
  const WALLISH = { wallseg: 1, door: 1, glass: 1, glassH: 1 };

  function surfTop(e) {
    if (!e) return 0;
    if (e.kind === 'table') return e.variant === 'standing' ? 17 : e.variant === 'small' ? 10 : 12;
    if (e.kind === 'tvrack') return 13;
    return 12;
  }
  DL.isoSurfaceTop = surfTop;

  /* ------------------------------------------------------------------ */
  /* Boxes                                                               */
  /* ------------------------------------------------------------------ */
  function drawBox(g, sc, e, t) {
    const f = frameOf(e), tw = f.Wf / T, th = f.Df / T;
    const c = clone(e, f.art, tw, th);
    const L = look(keyOf(e, f.art, tw, th), c);
    paint(scratch(), c, t);
    const u0 = clamp(Math.floor(L.x0), 0, f.Wf - 2), u1 = clamp(Math.ceil(L.x1), u0 + 2, f.Wf);
    const m = Math.min(u0, f.Wf - u1, 4), v0 = Math.max(0, m - 1), v1 = f.Df - m;
    const sp = SPLIT[e.kind], split = sp != null && sp > L.y0 && sp < L.y1 - 2 ? sp : null;
    const z0 = e.host ? surfTop(e.host) : 0;
    const base = L.y1, top = split != null ? split : L.y0, H = Math.max(2, base - top);
    const faceC = f.side ? shade(L.body, -0.22) : L.body, sideC = f.side ? shade(L.body, -0.12) : shade(L.body, -0.38);
    isoT(g, sc);
    const r = fbox(g, f, u0, u1, v0, v1, z0, z0 + H, faceC, sideC, shade(L.top, 0.14));
    // the art on the front face
    const M = cardMap(sc, f, v0, z0, base);
    setMap(g, sc, M[0], M[1], M[2]);
    blit(g, u0, top, u1 - u0, base - top);
    remember(sc, e, M, e.px, e.py);
    isoT(g, sc);
    if (f.side) poly(g, [fw(f, u0, v0, z0), fw(f, u1, v0, z0), fw(f, u1, v0, z0 + H), fw(f, u0, v0, z0 + H)], 'rgba(0,0,0,0.16)', false);
    // a soft highlight on the top front edge
    line(g, fw(f, u0, v0, z0 + H), fw(f, u1, v0, z0 + H), 'rgba(255,255,255,0.16)');
    // a dark silhouette line keeps volumes readable on dark floors
    const hb = hull(r[0], r[1], r[2], r[3], z0, z0 + H);
    g.beginPath();
    hb.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
    g.closePath();
    g.strokeStyle = 'rgba(4,5,9,0.55)';
    g.stroke();
    let hz = z0 + H;
    if (split != null) {
      const Mc = cardMap(sc, f, (v0 + v1) / 2, z0 + H, split);
      setMap(g, sc, Mc[0], Mc[1], Mc[2]);
      blit(g, L.x0, L.y0, L.x1 - L.x0, split - L.y0);
      hz += split - L.y0;
    }
    return { poly: hull(r[0], r[1], r[2], r[3], z0, hz) };
  }

  /* ------------------------------------------------------------------ */
  /* Desks and tables: legs, slab, the top's art on top, monitors on it   */
  /* ------------------------------------------------------------------ */
  const TABLE = {
    '': ['#323842', '#15181d'], wood: ['#6b5038', '#3b2c22'], glass: ['#a0c3ec', '#9aa3b0'], bench: ['#4a515c', '#22262d'], lab: ['#d9dde3', '#7d8590'],
    standing: ['#e9e9e6', '#2a2f38'], meeting: ['#4a3626', '#1d1610'], small: ['#3b2c22', '#1d1610'], reception: ['#e9e9e6', '#2a2f38'],
    gamer: ['#16181d', '#0a0b0e'], office: ['#e2d6c2', '#e9e9e6'], tech: ['#5d6573', '#22262d'], repair: ['#4a515c', '#22262d'],
  };
  // L-shaped and round tables: their own geometry (legs, slab pieces / a disc on a pedestal)
  function drawOddTable(g, sc, e) {
    const topC = e.color || (e.variant === 'round' ? '#4a3626' : '#6b5038'), edge = shade(topC, -0.32), Z = 12;
    const x0 = e.px, y0 = e.py, W = e.tw * T, H = e.th * T;
    isoT(g, sc);
    if (e.variant === 'round') {
      const cx = x0 + W / 2, cy = y0 + H / 2, r = Math.min(W, H) / 2 - 1, ring = (z, rr) => Array.from({ length: 28 }, (_, i) => [cx + Math.cos((i / 28) * Math.PI * 2) * rr, cy + Math.sin((i / 28) * Math.PI * 2) * rr, z]);
      box(g, cx - 2, cy - 2, cx + 2, cy + 2, 0, Z - 2, { s: '#1d1610', e: '#120d09', t: '#2a1f17' });
      poly(g, ring(0.2, 6), 'rgba(0,0,0,0.25)', false);
      poly(g, ring(Z - 2, r), edge);
      poly(g, ring(Z, r), topC);
      path(g, ring(Z, r - 2));
      g.strokeStyle = shade(topC, 0.15);
      g.stroke();
      remember(sc, e, [[x0, y0 + H, Z], [1, 0, 0], [0, 0, -1]], e.px, e.py);
      return { poly: hull(x0, y0, x0 + W, y0 + H, 0, Z) };
    }
    const hole = DL.itemHole(e) || [1, 1], cells = [];
    for (let j = 0; j < e.th; j++) for (let i = 0; i < e.tw; i++) if (i !== hole[0] || j !== hole[1]) cells.push([x0 + i * T, y0 + j * T]);
    const legC = { s: '#2a1f17', e: '#1a130e', t: '#3b2c22' };
    for (const [x, y] of cells) for (const [dx, dy] of [[1, 1], [13, 1], [1, 13], [13, 13]]) box(g, x + dx, y + dy, x + dx + 2, y + dy + 2, 0, Z - 2, legC);
    // slab pieces, back ones first; then the tops so the seams disappear
    cells.sort((a, b) => a[0] + a[1] - b[0] - b[1]);
    for (const [x, y] of cells) box(g, x, y, x + T, y + T, Z - 2, Z, { s: edge, e: shade(edge, -0.2) });
    for (const [x, y] of cells) poly(g, [[x, y, Z], [x + T, y, Z], [x + T, y + T, Z], [x, y + T, Z]], topC);
    remember(sc, e, [[x0, y0 + H, Z], [1, 0, 0], [0, 0, -1]], e.px, e.py);
    return { poly: hull(x0, y0, x0 + W, y0 + H, 0, Z) };
  }

  function drawSurface(g, sc, e, t) {
    if (e.kind === 'table' && (e.variant === 'L' || e.variant === 'round')) return drawOddTable(g, sc, e);
    const f = frameOf(e), tw = f.Wf / T, th = f.Df / T;
    const c = clone(e, f.art, tw, th);
    const L = look(keyOf(e, f.art, tw, th), c);
    paint(scratch(), c, t);
    const desk = e.kind === 'desk', v = desk ? '' : e.variant || '';
    const Z = surfTop(e);
    const tl = desk ? ['#2a2e36', '#15181d'] : TABLE[v] || TABLE[''];
    const glass = v === 'glass' && !e.color;
    const topC = e.color || tl[0], leg = tl[1];
    const edge = glass ? 'rgba(160,195,236,0.45)' : shade(topC, -0.32);
    const legs = { f: leg, s: shade(leg, -0.3), t: shade(leg, 0.2) };
    const rt = -4, rf = desk ? 5 : -4 + f.Df - 7;
    const reception = v === 'reception', pv = f.art === 0 ? [0, 3] : [f.Df - 3, f.Df];
    isoT(g, sc);
    const panel = () => {
      fbox(g, f, 0, f.Wf, pv[0], pv[1], 0, Z + 6, '#2a2f38', '#1f232a', '#3a414c');
      line(g, fw(f, 0, pv[0], 9), fw(f, f.Wf, pv[0], 9), e.accent || '#7ee0a1', 1);
    };
    if (reception && f.art === 1) panel();
    const legAt = (u, vv) => fbox(g, f, u, u + 2, vv, vv + 2, 0, Z - 2, legs.f, legs.s, legs.t);
    legAt(1, f.Df - 3);
    legAt(f.Wf - 3, f.Df - 3);
    if (desk) {
      const S = (DL.DESK_SETUPS && (DL.DESK_SETUPS[e.setup] || DL.DESK_SETUPS.mono2)) || {};
      if (S.tower && S.tower !== 'rgbTop') {
        const uT = f.art === 0 ? 21 : 5;
        fbox(g, f, uT, uT + 7, 3, 12, 0, 9, '#14171c', '#0d0f13', '#262a31');
        const Mt = cardMap(sc, f, 3, 0, 14);
        setMap(g, sc, Mt[0], Mt[1], Mt[2]);
        blit(g, uT, 5, 7, 9);
        isoT(g, sc);
      }
    }
    legAt(1, 1);
    legAt(f.Wf - 3, 1);
    // slab + its top (the art of the desk top, stretched back to its real depth)
    fbox(g, f, 0, f.Wf, 0, f.Df, Z - 2, Z, edge, glass ? edge : shade(edge, -0.2), glass ? 'rgba(160,195,236,0.18)' : topC);
    const k = f.Df / (rf - rt);
    setMap(g, sc, fw(f, 0, rf * k, Z), fU(f), f.side ? [k, 0, 0] : [0, k, 0]);
    blit(g, 0, rt, f.Wf, rf - rt);
    isoT(g, sc);
    line(g, fw(f, 0, 0, Z), fw(f, f.Wf, 0, Z), 'rgba(255,255,255,0.14)');
    // whatever stands on the top (monitors, lamp arms, the vise…) as a card near the far edge
    let hz = Z;
    if (L.y0 < rt) {
      const vc = f.art === 0 ? f.Df - 4 : 4;
      const M = cardMap(sc, f, vc, Z, rt);
      setMap(g, sc, M[0], M[1], M[2]);
      blit(g, Math.min(0, L.x0), L.y0, Math.max(f.Wf, L.x1) - Math.min(0, L.x0), rt - L.y0);
      remember(sc, e, M, e.px, e.py);
      hz = Z + rt - L.y0;
    } else remember(sc, e, cardMap(sc, f, 0, 0, f.Df - 2), e.px, e.py);
    if (reception && f.art === 0) { isoT(g, sc); panel(); hz = Math.max(hz, Z + 6); }
    const r = frect(f, 0, f.Wf, 0, f.Df);
    return { poly: hull(r[0], r[1], r[2], r[3], 0, hz) };
  }

  /* ------------------------------------------------------------------ */
  /* Sofas: built from boxes (seat, backrest, arms)                       */
  /* ------------------------------------------------------------------ */
  function drawParts(g, parts) {
    parts.sort((a, b) => {
      const A = a.r, B = b.r;
      if (A[2] <= B[0] || A[3] <= B[1]) return -1;
      if (B[2] <= A[0] || B[3] <= A[1]) return 1;
      return a.z1 - b.z1;
    });
    for (const p of parts) box(g, p.r[0], p.r[1], p.r[2], p.r[3], p.z0, p.z1, p.c);
  }
  function drawSofa(g, sc, e, t) {
    const f = frameOf(e), base = e.color || '#2f3a4d', d = shade(base, -0.3), l = shade(base, 0.14);
    const back = f.art === 0 ? [f.Df - 5, f.Df] : [0, 5], seat = f.art === 0 ? [1, f.Df - 5] : [5, f.Df - 1];
    const col = (c, top) => (f.side ? { e: c, s: shade(c, -0.15), t: top } : { s: c, e: shade(c, -0.3), t: top });
    const parts = [
      { r: frect(f, 3, f.Wf - 3, seat[0], seat[1]), z0: 1, z1: 7, c: col(base, l) },
      { r: frect(f, 0, f.Wf, back[0], back[1]), z0: 1, z1: 17, c: col(d, shade(d, 0.2)) },
      { r: frect(f, 0, 3, seat[0], seat[1]), z0: 1, z1: 11, c: col(base, l) },
      { r: frect(f, f.Wf - 3, f.Wf, seat[0], seat[1]), z0: 1, z1: 11, c: col(base, l) },
    ];
    isoT(g, sc);
    for (const [u, vv] of [[1, 1], [f.Wf - 3, 1], [1, f.Df - 3], [f.Wf - 3, f.Df - 3]]) fbox(g, f, u, u + 2, vv, vv + 2, 0, 1, '#121418', '#0b0c0f', '#1d2026');
    drawParts(g, parts);
    // cushion seams
    const n = Math.max(1, Math.round((f.Wf - 6) / 14)), cw = (f.Wf - 6) / n;
    for (let k = 1; k < n; k++) line(g, fw(f, 3 + k * cw, seat[0], 7), fw(f, 3 + k * cw, seat[1], 7), d);
    if (e.variant === 'gamer') {
      const fv = f.art === 0 ? 0.5 : f.Df - 0.5;
      line(g, fw(f, 0, fv, 0.6), fw(f, f.Wf, fv, 0.6), 'hsla(' + ((t * 70) % 360).toFixed(0) + ',90%,60%,0.85)', 1);
    }
    remember(sc, e, cardMap(sc, f, 0, 0, f.Df - 2), e.px, e.py);
    const r = frect(f, 0, f.Wf, 0, f.Df);
    return { poly: hull(r[0], r[1], r[2], r[3], 0, 17) };
  }

  /* ------------------------------------------------------------------ */
  /* Cards: flat things standing upright (monitors, whiteboards, banners) */
  /* ------------------------------------------------------------------ */
  function drawCard(g, sc, e, t) {
    const f = frameOf(e), tw = f.Wf / T, th = f.Df / T;
    const c = clone(e, f.art, tw, th);
    const L = look(keyOf(e, f.art, tw, th), c);
    paint(scratch(), c, t);
    const z0 = e.host ? surfTop(e.host) : 0, vc = f.Df / 2;
    const M = cardMap(sc, f, vc, z0, L.y1);
    setMap(g, sc, M[0], M[1], M[2]);
    blit(g, L.x0, L.y0, L.x1 - L.x0, L.y1 - L.y0);
    remember(sc, e, M, e.px, e.py);
    const a = fw(f, L.x0, vc, z0), b = fw(f, L.x1, vc, z0), h = L.y1 - L.y0;
    const pts = [a, b, [b[0], b[1], b[2] + h], [a[0], a[1], a[2] + h]].map((p) => [IX(p[0], p[1]), IY(p[0], p[1], p[2])]);
    const bb = bboxOf(pts);
    return { rect: [bb[0] - 1, bb[1] - 1, bb[2] + 1, bb[3] + 1] };
  }

  /* ------------------------------------------------------------------ */
  /* Billboards: plants, chairs, small things (art drawn upright)         */
  /* ------------------------------------------------------------------ */
  // the chair's billboard is anchored where its sitter sits, so the two line up like before
  function seatPoint(e) {
    const r = e.rot | 0;
    if (r === 2 || r === 3) return { x: e.px + (r === 2 ? 5 : 11), y: e.py + (e.th === 2 ? 12 : 4) };
    const x = e.cx != null ? e.cx : e.px + e.tw * 8;
    return { x, y: e.py + (r === 1 ? 14 : 4) };
  }
  DL.isoSeatPoint = seatPoint;
  function anchorOf(e) {
    if (e.kind === 'chair') { const s = seatPoint(e); return { wx: s.x, wy: s.y, sx: s.x, sy: s.y, z: 0 }; }
    if (e.host) return { wx: e.px + 8, wy: e.py + 8, sx: e.px + 8, sy: e.py - 1, z: surfTop(e.host) };
    const W = e.tw * T, H = e.th * T;
    return { wx: e.px + W / 2, wy: e.py + H / 2, sx: e.px + W / 2, sy: e.py + H - 3, z: 0 };
  }
  function drawBill(g, sc, e, t) {
    const c = clone(e);
    const L = look(keyOf(e, e.rot | 0, e.tw, e.th, 'b:'), c);
    paint(scratch(), c, t);
    const A = anchorOf(e), S = sc.S;
    const tx = Math.round((IX(A.wx, A.wy) - (A.sx - e.px)) * S) / S, ty = Math.round((IY(A.wx, A.wy, A.z) - (A.sy - e.py)) * S) / S;
    const m = [S, 0, 0, S, S * tx - sc.ox, S * ty - sc.oy];
    g.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
    blit(g, -OX, -OY, SW, SH);
    e._isoSp = { m: [S, 0, 0, S, S * (tx - e.px) - sc.ox, S * (ty - e.py) - sc.oy], f: sc._isoFrame };
    if (L.empty) return null;
    return { rect: [tx + L.x0 - 1, ty + L.y0 - 1, tx + L.x1 + 1, ty + L.y1 + 1] };
  }

  /* ------------------------------------------------------------------ */
  /* On the walls and on the floor                                        */
  /* ------------------------------------------------------------------ */
  function drawWallItem(g, sc, e, t) {
    const c = clone(e);
    const L = look(keyOf(e, e.rot | 0, e.tw, e.th, 'w:'), c);
    paint(scratch(), c, t);
    const M = [[e.px, e.py, LIFT], [1, 0, 0], [0, 0, -1]];
    setMap(g, sc, M[0], M[1], M[2]);
    blit(g, -6, -80, e.tw * T + 12, 80 + LIFT);
    remember(sc, e, M, e.px, e.py);
    if (L.empty) return null;
    const pts = [[e.px + L.x0, e.py, LIFT - L.y0], [e.px + L.x1, e.py, LIFT - L.y0], [e.px + L.x1, e.py, LIFT - Math.min(L.y1, LIFT)], [e.px + L.x0, e.py, LIFT - Math.min(L.y1, LIFT)]].map((p) => [IX(p[0], p[1]), IY(p[0], p[1], p[2])]);
    const bb = bboxOf(pts);
    return { rect: [bb[0] - 1, bb[1] - 1, bb[2] + 1, bb[3] + 1] };
  }
  function drawFlat(g, sc, e, t) {
    paint(scratch(), clone(e), t);
    const M = [[e.px, e.py, 0], [1, 0, 0], [0, 1, 0]];
    setMap(g, sc, M[0], M[1], M[2]);
    blit(g, 0, 0, e.tw * T, e.th * T);
    remember(sc, e, M, e.px, e.py);
    const x0 = e.px, y0 = e.py, x1 = x0 + e.tw * T, y1 = y0 + e.th * T;
    return { poly: [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].map((p) => [IX(p[0], p[1]), IY(p[0], p[1], 0)]) };
  }

  /* ------------------------------------------------------------------ */
  /* Walls                                                               */
  /* ------------------------------------------------------------------ */
  // rooms without a style get this slate wall in the 2.5D view (styled rooms use decor.js's look)
  const CLASSIC_WALL = '#323d5c';
  const styleKey = (s) => (s ? [s.wall, s.wallColor, s.rgb && s.rgb.on ? s.rgb.color : ''].join(',') : 'classic');
  function wallColor(s) {
    if (!s) return CLASSIC_WALL;
    const def = DL.decorRender && DL.decorRender.WALL_DEFAULT;
    return s.wallColor || (def && def[s.wall]) || '#171b22';
  }
  const TEX = new Map();
  // one 16-px-wide strip of wall face, `H` tall (row 0 = the top), in the room's own style
  function wallTex(s, H) {
    const key = styleKey(s) + '|' + H;
    let c = TEX.get(key);
    if (c) return c;
    c = DL.mk(T, H);
    const g = c.getContext('2d');
    if (s && DL.decorRender) DL.decorRender.wallFace(g, s, 0, 1, H, s.rgb && s.rgb.on ? s.rgb.color : null);
    else {
      const b = CLASSIC_WALL;
      R(g, 0, 0, 16, H, b);
      R(g, 0, 0, 16, 1, shade(b, 0.22));
      R(g, 15, 1, 1, H - 5, shade(b, -0.18));
      R(g, 7, 1, 1, H - 5, shade(b, -0.08));
      R(g, 0, Math.round(H * 0.42), 16, 1, shade(b, 0.08));
      R(g, 0, Math.round(H * 0.42) + 1, 16, 1, shade(b, -0.14));
      R(g, 0, H - 5, 16, 1, shade(b, 0.14));
      R(g, 0, H - 4, 16, 4, shade(b, -0.42));
    }
    TEX.set(key, c);
    return c;
  }
  function wallCols(s) {
    const c = wallColor(s);
    return { face: c, end: shade(c, -0.3), top: shade(c, 0.38), low: shade(c, 0.06) };
  }
  // textured face of a wall slab: along x (south face at y) or along y (east face at x)
  function texFace(g, sc, s, H, axis, at, from, to) {
    const tex = wallTex(s, H);
    for (let a = from; a < to; a = Math.floor(a / T) * T + T) {
      const b = Math.min(to, Math.floor(a / T) * T + T), sx = a - Math.floor(a / T) * T;
      if (axis === 'x') setMap(g, sc, [a, at, H], [1, 0, 0], [0, 0, -1]);
      else setMap(g, sc, [at, a, H], [0, 1, 0], [0, 0, -1]);
      g.drawImage(tex, sx, 0, b - a, H, 0, 0, b - a, H);
    }
  }

  // light falling on a wall face: brighter near the top, darker at the floor
  function faceShade(g, sc, axis, at, from, to, H, dark) {
    if (axis === 'x') setMap(g, sc, [from, at, H], [1, 0, 0], [0, 0, -1]);
    else setMap(g, sc, [at, from, H], [0, 1, 0], [0, 0, -1]);
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, 'rgba(255,255,255,0.07)');
    gr.addColorStop(0.45, 'rgba(0,0,0,' + (dark || 0) + ')');
    gr.addColorStop(1, 'rgba(0,0,0,' + (0.24 + (dark || 0)) + ')');
    g.fillStyle = gr;
    g.fillRect(0, 0, to - from, H);
  }

  // A room's RGB light on one wall face (decor.js owns the colours): the cove line under the ceiling with
  // its wash down the wall, and the baseboard line. Drawn WITH the wall, in its depth order, only along
  // this piece of wall: whatever stands in front covers it, and it never runs past the wall's ends,
  // across a door or over another room. axis 'x': face at y = at; 'y': face at x = at; from..to along it.
  const rgbOf = (s) => (s && s.rgb && s.rgb.on && DL.decorRender && DL.decorRender.rgbColor ? s.rgb : null);
  function wallRgb(g, sc, s, axis, at, from, to, H) {
    const rgb = rgbOf(s);
    if (!rgb || to <= from) return;
    const areas = rgb.areas || [], cove = areas.indexOf('ceiling') >= 0 && H > H_CUT, base = areas.indexOf('walls') >= 0 && H > 5;
    if (!cove && !base) return;
    const P = (u, z) => (axis === 'x' ? [u, at, z] : [at, u, z]), t = sc.t;
    g.save();
    g.globalCompositeOperation = 'lighter';
    isoT(g, sc);
    for (let a = from; a < to; a = Math.floor(a / T) * T + T) {
      const b = Math.min(to, Math.floor(a / T) * T + T), c = rgbColor(rgb, t, Math.floor(a / T));
      if (cove) {
        line(g, P(a, H - 1), P(b, H - 1), c(1.6), 1.4);
        poly(g, [P(a, H - 2), P(b, H - 2), P(b, Math.max(2, H - 16)), P(a, Math.max(2, H - 16))], c(0.3), false);
      }
      if (base) line(g, P(a, 4), P(b, 4), c(1.4), 1.4);
    }
    g.restore();
  }

  function drawRun(g, sc, w) {
    if (w.face === 'j') { drawWallSeg(g, sc, w.seg); return; }
    const r = w.r, c = wallCols(w.style);
    isoT(g, sc);
    if (w.face === 's') {
      box(g, r[0], r[1], r[2], r[3], 0, w.H, { s: c.face, e: c.end, t: c.top });
      texFace(g, sc, w.style, w.H, 'x', r[3], r[0], r[2]);
      faceShade(g, sc, 'x', r[3], r[0], r[2], w.H, 0);
      wallRgb(g, sc, w.style, 'x', r[3], r[0], r[2], w.H);
      isoT(g, sc);
      line(g, [r[0], r[3], w.H], [r[2], r[3], w.H], 'rgba(255,255,255,0.22)');
    } else if (w.face === 'e') {
      box(g, r[0], r[1], r[2], r[3], 0, w.H, { s: c.end, e: c.face, t: c.top });
      texFace(g, sc, w.style, w.H, 'y', r[2], r[1], r[3]);
      faceShade(g, sc, 'y', r[2], r[1], r[3], w.H, 0.1);
      wallRgb(g, sc, w.style, 'y', r[2], r[1], r[3], w.H);
      isoT(g, sc);
      line(g, [r[2], r[1], w.H], [r[2], r[3], w.H], 'rgba(255,255,255,0.16)');
    } else box(g, r[0], r[1], r[2], r[3], 0, w.H, { s: c.low, e: c.end, t: c.top });
  }

  // inner walls (wall pieces drawn per tile, joined to their neighbours)
  function segPieces(e) {
    const px = e.px, py = e.py, out = [];
    if (e.kind === 'glass') return [[px + 6, py, px + 10, py + 16]];
    if (e.kind === 'glassH') return [[px, py + 6, px + 16, py + 10]];
    const vert = e.u || e.d, horiz = e.l || e.r || !vert;
    if (horiz) out.push([px + (e.l ? 0 : 6), py + 6, px + (e.r ? 16 : 10), py + 10]);
    if (vert) out.push([px + 6, py + (e.u ? 0 : 6), px + 10, py + (e.d ? 16 : 10)]);
    return out;
  }
  function roomStyleAt(w, x, y) {
    if (!w.roomAt || !w.rooms || !DL.roomStyle || x < 0 || y < 0 || x >= w.W || y >= w.H) return null;
    const i = w.roomAt[y * w.W + x];
    const s = i >= 0 ? DL.roomStyle(w.rooms[i]) : null;
    return s && !s.classic ? s : null;
  }
  function drawWallSeg(g, sc, e) {
    const glass = e.mat === 'glass' || e.kind === 'glass' || e.kind === 'glassH';
    const H = sc.wallCut ? H_CUT : H_IN, w = sc.world;
    const sS = roomStyleAt(w, e.tx, e.ty + 1), sE = roomStyleAt(w, e.tx + 1, e.ty);
    isoT(g, sc);
    for (const r of segPieces(e)) {
      if (glass) {
        const fr = '#3a4250';
        box(g, r[0], r[1], r[2], r[3], 0, 2, { s: fr, e: shade(fr, -0.3), t: shade(fr, 0.2) });
        path(g, [[r[0], r[3], 2], [r[2], r[3], 2], [r[2], r[3], H], [r[0], r[3], H]]);
        g.fillStyle = 'rgba(160,195,236,0.14)';
        g.fill();
        path(g, [[r[2], r[3], 2], [r[2], r[1], 2], [r[2], r[1], H], [r[2], r[3], H]]);
        g.fillStyle = 'rgba(120,160,210,0.12)';
        g.fill();
        box(g, r[0], r[1], r[2], r[3], H - 1, H, { s: fr, e: shade(fr, -0.3), t: shade(fr, 0.35) });
        const len = Math.max(r[2] - r[0], r[3] - r[1]), hx = r[2] - r[0] >= r[3] - r[1];
        const k = 3 + ((e.tx * 5 + e.ty * 3) % 7);
        if (len > 8) line(g, hx ? [r[0] + k, r[3], H - 4] : [r[2], r[1] + k, H - 4], hx ? [r[0] + k + 3, r[3], H - 10] : [r[2], r[1] + k + 3, H - 10], 'rgba(220,235,255,0.35)');
        continue;
      }
      const horiz = r[2] - r[0] > r[3] - r[1];
      const s = horiz ? sS : sE, c = wallCols(s);
      if (horiz) {
        box(g, r[0], r[1], r[2], r[3], 0, H, { s: c.face, e: c.end, t: c.top });
        if (H > H_CUT) texFace(g, sc, s, H, 'x', r[3], r[0], r[2]);
        wallRgb(g, sc, s, 'x', r[3], r[0], r[2], H);
      } else {
        box(g, r[0], r[1], r[2], r[3], 0, H, { s: c.end, e: c.face, t: c.top });
        if (H > H_CUT) { texFace(g, sc, s, H, 'y', r[2], r[1], r[3]); isoT(g, sc); poly(g, [[r[2], r[3], 0], [r[2], r[1], 0], [r[2], r[1], H], [r[2], r[3], H]], 'rgba(0,0,0,0.14)', false); }
        wallRgb(g, sc, s, 'y', r[2], r[1], r[3], H);
      }
      isoT(g, sc);
    }
    return null;
  }

  // doors: a frame in the wall and leaves that swing (e.open 0..1)
  function drawDoor(g, sc, e) {
    const o = clamp(e.open || 0, 0, 1), len = e.len || 1, L = len * T, flip = e.rot & 1, back = e.rot & 2;
    const Hw = sc.wallCut ? H_CUT : H_IN, Hd = Math.min(H_DOOR, Hw);
    const fr = { s: '#343b47', e: '#252b35', t: '#4b5361' };
    const leafC = '#6b5644', leafD = '#4f3f32';
    const h = e.axis === 'h';
    // frame rectangles: posts at both ends, lintel over the opening
    const R0 = h ? [e.px, e.py + 6, e.px + 2, e.py + 10] : [e.px + 6, e.py, e.px + 10, e.py + 2];
    const R1 = h ? [e.px + L - 2, e.py + 6, e.px + L, e.py + 10] : [e.px + 6, e.py + L - 2, e.px + 10, e.py + L];
    const leaves = len > 1 ? [[0, (L - 4) / 2, 0], [1, (L - 4) / 2, 1]] : [[0, L - 4, flip]];
    const ang = o * Math.PI * 0.46;
    const quads = leaves.map(([, lw, hingeEnd]) => {
      // hinge at the start (or the end) of the opening; closed the leaf runs along the wall
      const hx = h ? (hingeEnd ? e.px + L - 2 : e.px + 2) : e.px + 8, hy = h ? e.py + 8 : hingeEnd ? e.py + L - 2 : e.py + 2;
      const dc = h ? [hingeEnd ? -1 : 1, 0] : [0, hingeEnd ? -1 : 1];
      const sw = h ? [0, back ? -1 : 1] : [back ? -1 : 1, 0];
      const dx = dc[0] * Math.cos(ang) + sw[0] * Math.sin(ang), dy = dc[1] * Math.cos(ang) + sw[1] * Math.sin(ang);
      return { a: [hx, hy], b: [hx + dx * lw, hy + dy * lw], d: [dx, dy] };
    });
    const leaf = (q) => {
      const A = q.a, B = q.b;
      // lit when it faces south / west-ish
      const lit = Math.abs(q.d[0]) > Math.abs(q.d[1]);
      poly(g, [[A[0], A[1], 0], [B[0], B[1], 0], [B[0], B[1], Hd - 1], [A[0], A[1], Hd - 1]], lit ? leafC : leafD);
      line(g, [A[0], A[1], Hd - 1], [B[0], B[1], Hd - 1], '#8a7058');
      const kx = A[0] + (B[0] - A[0]) * 0.85, ky = A[1] + (B[1] - A[1]) * 0.85;
      line(g, [kx, ky, 11], [kx, ky, 13], '#c9b48a', 1);
    };
    isoT(g, sc);
    const behind = quads.filter(() => back), front = quads.filter(() => !back);
    behind.forEach(leaf);
    box(g, R0[0], R0[1], R0[2], R0[3], 0, Hw, fr);
    box(g, R1[0], R1[1], R1[2], R1[3], 0, Hw, fr);
    if (Hw > Hd + 1) {
      const RL = h ? [e.px, e.py + 6, e.px + L, e.py + 10] : [e.px + 6, e.py, e.px + 10, e.py + L];
      const s = h ? roomStyleAt(sc.world, e.tx, e.ty + 1) : roomStyleAt(sc.world, e.tx + 1, e.ty), c = wallCols(s);
      box(g, RL[0], RL[1], RL[2], RL[3], Hd, Hw, h ? { s: c.face, e: c.end, t: c.top } : { s: c.end, e: c.face, t: c.top });
    }
    front.forEach(leaf);
    const x0 = h ? e.px : e.px + 5, y0 = h ? e.py + 5 : e.py, x1 = h ? e.px + L : e.px + 11, y1 = h ? e.py + 11 : e.py + L;
    return { poly: hull(x0, y0, x1, y1, 0, Hw) };
  }

  /* ------------------------------------------------------------------ */
  /* Dispatch                                                            */
  /* ------------------------------------------------------------------ */
  function drawItem(g, sc, e, t) {
    if (e.drawIso) return e.drawIso(g, sc, e, t); // things that draw themselves (street.js)
    if (e.kind === 'wallseg' || e.kind === 'glass' || e.kind === 'glassH') return drawWallSeg(g, sc, e);
    if (e.kind === 'door') return drawDoor(g, sc, e);
    if (isRug(e)) return drawFlat(g, sc, e, t);
    if (e.wall) return drawWallItem(g, sc, e, t);
    if (e.kind === 'desk' || e.kind === 'table') return drawSurface(g, sc, e, t);
    if (e.kind === 'sofa') return drawSofa(g, sc, e, t);
    if (CARD[e.kind]) return drawCard(g, sc, e, t);
    if (BOX[e.kind]) return drawBox(g, sc, e, t);
    return drawBill(g, sc, e, t);
  }

  /* ------------------------------------------------------------------ */
  /* People                                                              */
  /* ------------------------------------------------------------------ */
  function drawActor(g, sc, a, ghost) {
    const S = sc.S, C = DL.CHAR;
    const X = Math.round(IX(a.x, a.y) * S) / S, Y = Math.round(IY(a.x, a.y, a.z || 0) * S) / S;
    // sc.peopleAlpha: everyone fades out together while building (demo.js), and back in afterwards
    const ga = g.globalAlpha, alpha = (a.alpha == null ? 1 : a.alpha) * (sc.peopleAlpha == null ? 1 : sc.peopleAlpha);
    isoT(g, sc);
    if (!ghost && !a.noShadow) {
      g.globalAlpha = ga * 0.32 * alpha;
      g.fillStyle = '#000';
      g.beginPath();
      g.ellipse(X, Y + 0.5, 6.5, 3.2, 0, 0, Math.PI * 2);
      g.fill();
    }
    g.globalAlpha = ga * alpha * (ghost ? 0.24 : 1);
    // legendary bots: golden aura behind and sparkles in front (cosmetics.js)
    const aura = !ghost && a.legend && DL.drawAura;
    if (aura) DL.drawAura(g, X, Y, sc.t || 0, 'back');
    // the season pass' Aura Boot (trails.js), on me and on other players who wear it
    const boot = !ghost && !a.hidden && DL.actorAura && DL.actorAura(a) === 'boot';
    if (boot) DL.drawAuraBoot(g, X, Y, sc.t || 0, 'back');
    g.drawImage(a.frame(), X - C.AX, Y - C.AY);
    if (aura) DL.drawAura(g, X, Y, sc.t || 0, 'front');
    if (boot) DL.drawAuraBoot(g, X, Y, sc.t || 0, 'front');
    // live effects: animated skins (cosmetics.js) and the actor's own (emotes)
    if (!ghost && DL.charFx) DL.charFx(g, a, X, Y, sc.t || 0);
    if (!ghost && a.fx) a.fx(g, X, Y, sc.t || 0);
    g.globalAlpha = ga;
    return { rect: [X - 7, Y - C.AY + 1, X + 7, Y + 1] };
  }

  /* ------------------------------------------------------------------ */
  /* The static part of a map: floor without the old wall faces + walls   */
  /* ------------------------------------------------------------------ */
  function statics(sc) {
    const st0 = sc._isoSt;
    if (st0 && st0.src === sc.floor && st0.w === sc.world && st0.v === sc.world.version) return st0;
    const w = sc.world, W = w.W, H = w.H;
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? '#' : w.tiles[y * W + x]);
    const open = (x, y) => at(x, y) !== '#';
    const inLot = (x, y) => !w.lot || (x < w.lot.w && y < w.lot.h);
    // Where inner walls cross, the room plan leaves one lone solid tile ('#') with walls / doors / floor all
    // round it. It used to get the tall outer-wall treatment (a column standing out of the inner walls).
    // Now it is a piece of inner wall joined to its neighbours, like the wall segments next to it.
    const wallish = (x, y) => { const c = at(x, y); return c === 'w' || c === 'd' || c === 'D' || c === 'g' || c === 'G'; };
    const junc = (x, y) => at(x, y) === '#' && x > 0 && y > 0 && x < W - 1 && y < H - 1 &&
      open(x - 1, y) && open(x + 1, y) && open(x, y - 1) && open(x, y + 1) &&
      (wallish(x - 1, y) || wallish(x + 1, y) || wallish(x, y - 1) || wallish(x, y + 1));
    // (for the outer walls a junction counts as inside the building)
    const openR = (x, y) => open(x, y) || junc(x, y);
    // floor: the baked floor, minus whatever the top-down view painted on wall tiles; plain ground around
    const fl = DL.mk(W * T, H * T), g = fl.getContext('2d');
    g.drawImage(sc.floor, 0, 0);
    // rooms read lighter than the ground around them, with soft light from the ceiling
    g.globalCompositeOperation = 'lighter';
    g.fillStyle = 'rgb(15,16,24)';
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (open(x, y)) g.fillRect(x * T, y * T, T, T);
    for (const r of w.rooms || []) {
      const s = DL.roomStyle ? DL.roomStyle(r) : null, tone = s && s.light && s.light !== 'auto' ? s.light : null;
      const col = tone === 'warm' ? '255,200,150' : tone === 'dim' ? '120,110,170' : tone === 'bright' ? '235,240,255' : '170,190,255';
      const a = tone === 'dim' ? 0.02 : tone === 'bright' ? 0.06 : 0.04;
      for (let ly = r.y + 1.5; ly < r.y + r.h; ly += 3) {
        for (let lx = r.x + 1.5; lx < r.x + r.w; lx += 3) {
          if (!w.roomAt || w.roomAt[Math.floor(ly) * W + Math.floor(lx)] >= 0) DL.pool(g, lx * T, ly * T, 52, 'rgba(' + col + ',' + a + ')');
        }
      }
    }
    g.globalCompositeOperation = 'source-over';
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (open(x, y)) continue;
        const px = x * T, py = y * T;
        g.clearRect(px, py, T, T);
        if (junc(x, y)) {
          for (let q = 0; q < 4; q++) {
            const qx = q & 1, qy = q >> 1, sx = x + (qx ? 1 : -1), sy = y + (qy ? 1 : -1);
            if (open(sx, sy) && !wallish(sx, sy)) g.drawImage(sc.floor, sx * T + qx * 8, sy * T + qy * 8, 8, 8, px + qx * 8, py + qy * 8, 8, 8);
            else R(g, px + qx * 8, py + qy * 8, 8, 8, '#12151c');
          }
          continue;
        }
        if (!inLot(x, y)) continue;
        R(g, px, py, T, T, '#12151c');
        R(g, px, py, T, 1, '#171b24');
        R(g, px, py, 1, T, '#171b24');
        if ((x * 7 + y * 3) % 5 === 0) R(g, px + 6 + ((x + y) % 5), py + 5 + (x % 4), 1, 1, '#1b2029');
      }
    }
    // outer walls: tall at the back of a room (north, west), a low rim at the front (south, east)
    const runs = [];
    const styleS = (x, y) => roomStyleAt(w, x, y + 1), styleE = (x, y) => roomStyleAt(w, x + 1, y);
    const runAlong = (face, test, styleOf, rect, wallH) => {
      const horiz = face === 's' || face === 'n';
      const A = horiz ? H : W, B = horiz ? W : H;
      for (let a = 0; a < A; a++) {
        let b = 0;
        while (b < B) {
          const ok = (k) => { const x = horiz ? k : a, y = horiz ? a : k; return !openR(x, y) && test(x, y); };
          if (!ok(b)) { b++; continue; }
          const s0 = styleOf(horiz ? b : a, horiz ? a : b), k0 = styleKey(s0);
          let b1 = b;
          while (b1 + 1 < B && ok(b1 + 1) && styleKey(styleOf(horiz ? b1 + 1 : a, horiz ? a : b1 + 1)) === k0) b1++;
          runs.push({ t: 'run', face, r: rect(a, b, b1), H: wallH, style: s0 });
          b = b1 + 1;
        }
      }
    };
    runAlong('s', (x, y) => openR(x, y + 1), styleS, (y, x0, x1) => [x0 * T, (y + 1) * T - WT, (x1 + 1) * T, (y + 1) * T], H_BACK);
    // ('o': a doorway in a front wall, lojas.js — the wall beside it stays a low rim, not a tall back wall)
    runAlong('e', (x, y) => openR(x + 1, y) && at(x + 1, y) !== 'o', styleE, (x, y0, y1) => [(x + 1) * T - WT, y0 * T, (x + 1) * T, (y1 + 1) * T], H_BACK);
    runAlong('n', (x, y) => openR(x, y - 1), () => null, (y, x0, x1) => [x0 * T, y * T, (x1 + 1) * T, y * T + WT], H_LOW);
    runAlong('w', (x, y) => openR(x - 1, y), () => null, (x, y0, y1) => [x * T, y0 * T, x * T + WT, (y1 + 1) * T], H_LOW);
    // corner posts close the gaps where two walls meet around a corner
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (openR(x, y)) continue;
        const X0 = x * T, Y0 = y * T, X1 = X0 + T, Y1 = Y0 + T;
        if (openR(x + 1, y + 1) && !openR(x + 1, y) && !openR(x, y + 1)) runs.push({ t: 'run', face: 'p', r: [X1 - WT, Y1 - WT, X1, Y1], H: H_BACK, style: roomStyleAt(w, x + 1, y + 1) });
        if (openR(x - 1, y + 1) && !openR(x - 1, y) && !openR(x, y + 1)) runs.push({ t: 'run', face: 'p', r: [X0, Y1 - WT, X0 + WT, Y1], H: H_BACK, style: roomStyleAt(w, x - 1, y + 1) });
        if (openR(x + 1, y - 1) && !openR(x + 1, y) && !openR(x, y - 1)) runs.push({ t: 'run', face: 'p', r: [X1 - WT, Y0, X1, Y0 + WT], H: H_BACK, style: roomStyleAt(w, x + 1, y - 1) });
        if (openR(x - 1, y - 1) && !openR(x - 1, y) && !openR(x, y - 1)) runs.push({ t: 'run', face: 'p', r: [X0, Y0, X0 + WT, Y0 + WT], H: H_LOW, style: null });
      }
    }
    // the junction pieces themselves (drawn like an inner wall segment: drawRun → drawWallSeg)
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        if (!junc(x, y)) continue;
        const l = wallish(x - 1, y), r = wallish(x + 1, y), u = wallish(x, y - 1), d = wallish(x, y + 1);
        const glass = !['w', 'd', 'D'].some((c) => at(x - 1, y) === c || at(x + 1, y) === c || at(x, y - 1) === c || at(x, y + 1) === c);
        const X = x * T, Y = y * T;
        runs.push({ t: 'run', face: 'j', r: [X + (l ? 0 : 6), Y + (u ? 0 : 6), X + (r ? T : 10), Y + (d ? T : 10)], H: H_IN, style: null,
          seg: { kind: 'wallseg', mat: glass ? 'glass' : 'solid', px: X, py: Y, tx: x, ty: y, tw: 1, th: 1, l, r, u, d } });
      }
    }
    const st = { src: sc.floor, w, v: w.version, W, H, floor: fl, runs };
    sc._isoSt = st;
    return st;
  }

  /* ------------------------------------------------------------------ */
  /* Camera                                                              */
  /* ------------------------------------------------------------------ */
  function camera(sc, st) {
    const S = sc.S, cw = sc.canvas.width, ch = sc.canvas.height;
    const Wm = st.W * T, Hm = st.H * T;
    const minX = -Hm - 6, maxX = Wm + 6, minY = -H_BACK - 10, maxY = (Wm + Hm) / 2 + BASE + 6;
    const vw = cw / S, vh = ch / S;
    const pt = ((sc.o.padTop || 0) * sc.dpr) / S, pb = ((sc.o.padBottom || 0) * sc.dpr) / S;
    // lift (css px): what the camera aims at sits that much higher, centred in the space above a docked panel
    const lift = ((sc.o.lift || 0) * sc.dpr) / S;
    // shift (css px): the same sideways, centred in the space right of a panel docked on the left
    const shift = ((sc.o.shift || 0) * sc.dpr) / S;
    let cx = sc.cam.x - sc.cam.y - shift, cy = (sc.cam.x + sc.cam.y) / 2 + lift;
    cx = vw - 2 * shift >= maxX - minX ? (minX + maxX) / 2 - shift : clamp(cx, minX + vw / 2 - 2 * shift, maxX - vw / 2);
    cy = vh - pt - pb >= maxY - minY ? (minY + maxY) / 2 - pt / 2 + pb / 2 : clamp(cy, minY + vh / 2 - pt, maxY - vh / 2 + pb);
    sc.ox = Math.round(cx * S - cw / 2);
    sc.oy = Math.round(cy * S - ch / 2);
  }

  /* ------------------------------------------------------------------ */
  /* Depth order                                                         */
  /* ------------------------------------------------------------------ */
  // A is drawn before B when it lies entirely west or north of it; when the footprints overlap,
  // hosted things go after their host, people after the furniture they stand in (sofas), else depth.
  function order(A, B) {
    if (A.gx1 <= B.gx0 || A.gy1 <= B.gy0) return -1;
    if (B.gx1 <= A.gx0 || B.gy1 <= A.gy0) return 1;
    if (A.host && A.host === B.o) return 1;
    if (B.host && B.host === A.o) return -1;
    if (A.t === 'actor' && B.t === 'item' && !WALLISH[B.o.kind]) return 1;
    if (B.t === 'actor' && A.t === 'item' && !WALLISH[A.o.kind]) return -1;
    return A.key - B.key || A.n - B.n;
  }
  function topo(list) {
    const n = list.length, idx = new Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    idx.sort((a, b) => list[a].sx0 - list[b].sx0);
    const adj = new Array(n), deg = new Int32Array(n);
    for (let i = 0; i < n; i++) adj[i] = [];
    for (let p = 0; p < n; p++) {
      const i = idx[p], A = list[i];
      for (let q = p + 1; q < n; q++) {
        const j = idx[q], B = list[j];
        if (B.sx0 >= A.sx1) break;
        if (B.sy1 <= A.sy0 || B.sy0 >= A.sy1) continue;
        if (order(A, B) < 0) { adj[i].push(j); deg[j]++; } else { adj[j].push(i); deg[i]++; }
      }
    }
    // Kahn's algorithm, nearest-first among the free ones (a min-heap on depth)
    const heap = [], out = [], done = new Uint8Array(n);
    const less = (a, b) => list[a].key < list[b].key || (list[a].key === list[b].key && list[a].n < list[b].n);
    const push = (i) => {
      let k = heap.length;
      heap.push(i);
      while (k) { const p = (k - 1) >> 1; if (!less(i, heap[p])) break; heap[k] = heap[p]; k = p; }
      heap[k] = i;
    };
    const pop = () => {
      const top = heap[0], last = heap.pop();
      if (heap.length) {
        let k = 0;
        for (;;) {
          let c = 2 * k + 1;
          if (c >= heap.length) break;
          if (c + 1 < heap.length && less(heap[c + 1], heap[c])) c++;
          if (!less(heap[c], last)) break;
          heap[k] = heap[c];
          k = c;
        }
        heap[k] = last;
      }
      return top;
    };
    for (let i = 0; i < n; i++) if (!deg[i]) push(i);
    while (out.length < n) {
      if (!heap.length) {
        // a cycle (rare overlaps): release the nearest one left
        let best = -1;
        for (let i = 0; i < n; i++) if (!done[i] && (best < 0 || less(i, best))) best = i;
        deg[best] = 0;
        push(best);
      }
      const i = pop();
      if (done[i]) continue;
      done[i] = 1;
      out.push(i);
      for (const j of adj[i]) if (--deg[j] === 0 && !done[j]) push(j);
    }
    return out;
  }

  // ground rectangle used for ordering
  function rectOf(e) {
    if (e.isoRect) return e.isoRect; // things that bring their own footprint (street.js: the door to the street)
    if (e.kind === 'chair') {
      const s = seatPoint(e), r = e.rot | 0;
      if (r === 1) return [s.x - 4, s.y - 5, s.x + 4, s.y - 2.5];
      if (r === 3) return [s.x - 8, s.y - 3, s.x - 3.5, s.y + 3];
      return [s.x - 4, s.y + 1.5, s.x + 4, s.y + 4];
    }
    if (e.wall) return [e.px, e.py, e.px + e.tw * T, e.py + 0.5];
    if (e.host) return [e.px + 1, e.py + 1, e.px + T - 1, e.py + T - 1];
    if (e.kind === 'door') { const L = (e.len || 1) * T; return e.axis === 'h' ? [e.px, e.py + 5, e.px + L, e.py + 11] : [e.px + 5, e.py, e.px + 11, e.py + L]; }
    if (e.kind === 'wallseg' || e.kind === 'glass' || e.kind === 'glassH') {
      const ps = segPieces(e);
      return [Math.min(...ps.map((p) => p[0])), Math.min(...ps.map((p) => p[1])), Math.max(...ps.map((p) => p[2])), Math.max(...ps.map((p) => p[3]))];
    }
    return [e.px, e.py, e.px + e.tw * T, e.py + e.th * T];
  }
  function entry(list, t, o, r, h, extra) {
    const en = { t, o, gx0: r[0], gy0: r[1], gx1: r[2], gy1: r[3], key: (r[0] + r[2] + r[1] + r[3]) / 2, n: list.length };
    en.sx0 = r[0] - r[3] - 8;
    en.sx1 = r[2] - r[1] + 8;
    en.sy0 = (r[0] + r[1]) / 2 - h;
    en.sy1 = (r[2] + r[3]) / 2 + 2;
    if (extra) Object.assign(en, extra);
    list.push(en);
    return en;
  }

  /* ------------------------------------------------------------------ */
  /* Light                                                               */
  /* ------------------------------------------------------------------ */
  const LIGHT_HSL = (h, a) => 'hsla(' + (((h % 360) + 360) % 360).toFixed(0) + ',95%,62%,' + clamp(a, 0, 1).toFixed(3) + ')';
  // a room's RGB colour at time t for light k along the room (decor.js owns the effects)
  const rgbColor = (rgb, t, k) => DL.decorRender.rgbColor(rgb, t, k);
  // a soft glow in iso-pixel space
  function glow(g, x, y, r, col) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, col);
    gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // The light an object gives: pools on the floor and glows in the air (iso: x, y, height). The pools are
  // painted in the floor layer, under everything standing; the glows right after the object itself, in its
  // own depth order — so whatever stands in front of a lamp or a neon sign covers its light.
  function itemLight(sc, e, t) {
    const pools = [], glows = [];
    if (e.kind === 'lamp') {
      pools.push([e.px + 8, e.py + 8, 46, e.color ? hexA(e.color, 0.08) : 'rgba(255,194,133,0.08)']);
      glows.push([e.px + 8, e.py + 8, 30, 16, e.color ? hexA(e.color, 0.12) : 'rgba(255,194,133,0.12)']);
    } else if (e.kind === 'desk' || e.kind === 'monitor' || e.kind === 'laptop') {
      // screens light the desk around them; brighter while someone works
      const k = e.work ? 1 : 0.45;
      pools.push([e.px + e.tw * 8, e.py + e.th * 8, 28, 'rgba(160,195,236,' + (0.06 * k).toFixed(3) + ')']);
      glows.push([e.px + e.tw * 8, e.py + e.th * 8, (e.host ? surfTop(e.host) : 12) + 8, 18, 'rgba(160,195,236,' + (0.07 * k).toFixed(3) + ')']);
    }
    if (e.kind === 'monitor' && e.variant === 'rgb') pools.push([e.px + 8, e.py + 8, 16, hexA(e.color || '#ff2bd6', 0.1)]);
    const f = DL.DECOR_GLOW && DL.DECOR_GLOW[e.kind];
    if (f) {
      const [x, y, rad, col, a] = f(e);
      const fl = e.kind === 'neon' ? 0.85 + 0.15 * Math.sin(t * 7 + e.seed) : 1;
      const c = e.kind === 'rug_rgb' ? LIGHT_HSL(t * 60, a) : hexA(col, a * fl);
      // the light source in 3D: on the wall plane for wall pieces, above the footprint otherwise
      if (e.wall) {
        pools.push([x, e.py + 6, rad, c]);
        glows.push([x, e.py, LIFT + (e.py - y), rad * 0.7, c]);
      } else if (isRug(e)) pools.push([x, y, rad, c]);
      else {
        const gx = e.px + e.tw * 8, gy = e.py + e.th * 8;
        pools.push([gx, gy, rad, c]);
        glows.push([gx, gy, Math.max(4, e.py + e.th * T - 2 - y), rad * 0.7, c]);
      }
    }
    // the classic NOC map: incident light at the failing switch
    const w = sc.world;
    if (sc.incident && sc.incident.active && !sc.incident.resolved && w.byId && w.byId['SW-ACC-B'] === e) {
      const a = 0.13 + 0.07 * Math.sin(t * 3);
      pools.push([e.px + 8, e.py + 8, 46, 'rgba(255,122,23,' + a.toFixed(3) + ')']);
      glows.push([e.px + 8, e.py + 8, 30, 30, 'rgba(255,122,23,' + (a * 0.7).toFixed(3) + ')']);
    }
    return pools.length || glows.length ? { pools, glows } : null;
  }
  // an object's glows, painted right after the object (additive)
  function drawGlows(g, sc, list) {
    if (!list || !list.length) return;
    g.save();
    g.globalCompositeOperation = 'lighter';
    isoT(g, sc);
    for (const [x, y, z, r, c] of list) glow(g, IX(x, y), IY(x, y, z), r, c);
    g.restore();
  }

  // A room's RGB on the floor (the wall parts are drawn with the walls: wallRgb). Only on the room's own
  // tiles, so a strip never crosses a doorway into the next room.
  function roomRgbFloor(g, sc, r, ri, rgb, t) {
    const w = sc.world, W = w.W, H = w.H, areas = rgb.areas || [];
    const X0 = r.x * T, Y0 = r.y * T, X1 = (r.x + r.w) * T;
    const mine = (x, y) => x >= 0 && y >= 0 && x < W && y < H && (!w.roomAt || w.roomAt[y * W + x] === ri);
    const inRoom = (px, py) => mine(Math.floor(px / T), Math.floor(py / T));
    groundT(g, sc);
    if (areas.indexOf('ceiling') >= 0) for (let x = r.x + 1; x < r.x + r.w; x += 3) if (inRoom(x * T + 8, Y0 + 4)) DL.pool(g, x * T + 8, Y0 + 4, 26, rgbColor(rgb, t, x)(0.45));
    if (areas.indexOf('walls') >= 0) {
      for (let y = r.y + 1; y < r.y + r.h; y += 3) {
        if (inRoom(X0 + 3, y * T)) DL.pool(g, X0 + 3, y * T, 18, rgbColor(rgb, t, y)(0.3));
        if (inRoom(X1 - 3, y * T)) DL.pool(g, X1 - 3, y * T, 18, rgbColor(rgb, t, y + 3)(0.3));
      }
      for (let x = r.x + 1; x < r.x + r.w; x += 3) if (inRoom(x * T, Y0 + 3)) DL.pool(g, x * T, Y0 + 3, 18, rgbColor(rgb, t, x)(0.3));
    }
    if (areas.indexOf('floor') >= 0) {
      // light strips along the room's south, west and east edges (tile by tile)
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          if (!mine(x, y)) continue;
          const px = x * T, py = y * T;
          if (!mine(x, y + 1)) { const c = rgbColor(rgb, t, x); g.fillStyle = c(0.8); g.fillRect(px, py + T - 2, T, 2); g.fillStyle = c(0.25); g.fillRect(px, py + T - 6, T, 4); }
          if (!mine(x - 1, y)) { g.fillStyle = rgbColor(rgb, t, y)(0.45); g.fillRect(px + 1, py, 2, T); }
          if (!mine(x + 1, y)) { g.fillStyle = rgbColor(rgb, t, y)(0.45); g.fillRect(px + T - 3, py, 2, T); }
        }
      }
    }
    if (areas.indexOf('furniture') >= 0) {
      for (const e of w.items) {
        if (e.kind !== 'desk' && e.kind !== 'table' && e.kind !== 'sofa' && e.kind !== 'beanbag' && e.kind !== 'shelf') continue;
        if (e.tx < r.x || e.tx >= r.x + r.w || e.ty < r.y || e.ty >= r.y + r.h) continue;
        DL.pool(g, e.px + e.tw * 8, e.py + e.th * 8, 16 + e.tw * 5, rgbColor(rgb, t, e.tx)(0.55));
      }
    }
  }
  // The floor layer of light (drawn before anything standing): every pool, the rooms' RGB on the floor,
  // and the glows of light sources that are not drawn as objects (a shop's ceiling lamps, lojas.js).
  function floorLights(g, sc, drawn) {
    const w = sc.world, t = sc.t, loose = [];
    g.save();
    g.globalCompositeOperation = 'lighter';
    groundT(g, sc);
    for (const e of w.items) {
      const L = itemLight(sc, e, t);
      e._isoLight = L;
      if (!L) continue;
      for (const [x, y, r, c] of L.pools) DL.pool(g, x, y, r, c);
      if (e.hidden || !drawn.has(e)) loose.push.apply(loose, L.glows);
    }
    (w.rooms || []).forEach((r, i) => {
      const s = DL.roomStyle ? DL.roomStyle(r) : null, rgb = rgbOf(s);
      if (rgb) roomRgbFloor(g, sc, r, i, rgb, t);
    });
    g.restore();
    drawGlows(g, sc, loose);
  }

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */
  function renderIso(sc) {
    const g = sc.ctx, S = sc.S, cw = sc.canvas.width, ch = sc.canvas.height, w = sc.world, t = sc.t;
    const st = statics(sc);
    camera(sc, st);
    const frame = (sc._isoFrame = (sc._isoFrame || 0) + 1);
    next = 0;
    artNow = performance.now();
    artFrame = frame;
    // (which objects are really on the map: only those keep a cached picture)
    if (onMapW !== w || onMapV !== w.version || !onMap) { onMap = new Set(w.items); onMapV = w.version; onMapW = w; }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    const bg = g.createLinearGradient(0, 0, 0, ch);
    bg.addColorStop(0, '#1e1a36');
    bg.addColorStop(0.55, '#121427');
    bg.addColorStop(1, '#07080d');
    g.fillStyle = bg;
    g.fillRect(0, 0, cw, ch);
    g.imageSmoothingEnabled = false;
    g.lineWidth = 1 / S;
    g.lineJoin = 'round';

    // the plinth the whole map stands on
    const Wm = st.W * T, Hm = st.H * T;
    isoT(g, sc);
    poly(g, [[0, Hm, 0], [Wm, Hm, 0], [Wm, Hm, -BASE], [0, Hm, -BASE]], '#1a1f2b');
    poly(g, [[Wm, Hm, 0], [Wm, 0, 0], [Wm, 0, -BASE], [Wm, Hm, -BASE]], '#11141c');
    line(g, [0, Hm, 0], [Wm, Hm, 0], 'rgba(255,255,255,0.08)');
    line(g, [Wm, 0, 0], [Wm, Hm, 0], 'rgba(255,255,255,0.05)');
    groundT(g, sc);
    g.drawImage(st.floor, 0, 0);

    // what is on screen (iso pixels, with room for tall things)
    const vx0 = sc.ox / S - 16, vx1 = (sc.ox + cw) / S + 16, vy0 = sc.oy / S - 16, vy1 = (sc.oy + ch) / S + 80;
    const list = [], rugs = [];
    for (const d of sc.drawables) {
      if (d instanceof DL.Actor) {
        // (faded out while building: not drawn, not picked, they hide nothing)
        if (d.hidden || sc.peopleAlpha === 0) continue;
        entry(list, 'actor', d, [d.x - 3, d.y - 2, d.x + 3, d.y + 1], 36);
        continue;
      }
      if (d.kind === 'videowall') continue;
      if (isRug(d)) { rugs.push(d); continue; }
      const r = rectOf(d);
      entry(list, 'item', d, r, WALLISH[d.kind] ? H_IN + 2 : d.isoH || 72, d.host ? { host: d.host } : null);
    }
    for (const run of st.runs) entry(list, 'run', run, run.r, run.H + 2);
    if (w.hasVideoWall !== false && DL.drawVideoWall && w.byId && w.byId['NOC-WALL']) entry(list, 'vw', w.byId['NOC-WALL'], [32, 32, 146, 32.5], 40);
    const vis = list.filter((en) => en.sx1 >= vx0 && en.sx0 <= vx1 && en.sy1 >= vy0 && en.sy0 <= vy1);
    vis.forEach((en, i) => (en.n = i));

    // rugs, then soft contact shadows and the darker floor along the walls
    for (const e of rugs.sort((a, b) => a.py - b.py)) {
      const h = drawItem(g, sc, e, t);
      if (h) e._isoBox = { b: bboxOf(h.poly), f: frame };
    }
    groundT(g, sc);
    for (const en of vis) {
      if (en.t === 'run') {
        const r = en.o.r, s = en.o.face;
        if (s === 's' || s === 'e') {
          const gr = s === 's' ? g.createLinearGradient(0, r[3], 0, r[3] + 10) : g.createLinearGradient(r[2], 0, r[2] + 10, 0);
          gr.addColorStop(0, 'rgba(0,0,0,0.38)');
          gr.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = gr;
          if (s === 's') g.fillRect(r[0], r[3], r[2] - r[0], 10);
          else g.fillRect(r[2], r[1], 10, r[3] - r[1]);
        }
        continue;
      }
      if (en.t !== 'item') continue;
      const e = en.o;
      if (e.wall || e.host || e.kind === 'door') continue;
      if (WALLISH[e.kind]) {
        g.fillStyle = 'rgba(0,0,0,0.16)';
        g.fillRect(en.gx0 - 3, en.gy0 - 3, en.gx1 - en.gx0 + 6, en.gy1 - en.gy0 + 6);
        continue;
      }
      if (e.kind === 'chair') continue;
      g.fillStyle = 'rgba(0,0,0,0.13)';
      g.fillRect(en.gx0, en.gy0 + 1, en.gx1 - en.gx0 + 3, en.gy1 - en.gy0 + 2);
      g.fillStyle = 'rgba(0,0,0,0.16)';
      g.fillRect(en.gx0 + 1, en.gy0 + 1, en.gx1 - en.gx0, en.gy1 - en.gy0);
    }
    // light on the floor (lamps, screens, decor, the rooms' RGB): part of the floor, under everything standing
    floorLights(g, sc, new Set(list.filter((en) => en.t === 'item').map((en) => en.o)));
    if (sc.underlay) { g.save(); groundT(g, sc); sc.underlay(g, sc); g.restore(); }

    // everything standing, back to front
    const hits = [], people = [];
    const drawn = topo(vis);
    for (const i of drawn) {
      const en = vis[i];
      // someone drawn earlier and overlapped by a wall / tall box drawn now is hidden behind it
      if (en.t === 'actor') people.push(en);
      else if (en.t === 'run' || (en.t === 'item' && (WALLISH[en.o.kind] || BOX[en.o.kind]))) {
        for (const p of people) if (!p.hid && en.sx0 < p.gx1 - p.gy0 && en.sx1 > p.gx0 - p.gy1) p.hid = en.sy0 < (p.gy0 + p.gx0) / 2 && en.sy1 > (p.gy1 + p.gx1) / 2 - 30;
      }
      let h = null;
      if (en.t === 'actor') h = drawActor(g, sc, en.o, false);
      else if (en.t === 'run') drawRun(g, sc, en.o);
      else if (en.t === 'vw') {
        setMap(g, sc, [0, 32, 32 + LIFT], [1, 0, 0], [0, 0, -1]);
        DL.drawVideoWall(g, t, sc.incident && sc.incident.active && !sc.incident.resolved);
      } else {
        h = drawItem(g, sc, en.o, t);
        // a rack's heat colour and soot (incendio.js), right on it: what stands in front still covers it
        if (h && h.poly && en.o.units && DL.rackFx) { DL.rackFx(g, sc, en.o, h.poly); isoT(g, sc); }
        // its glow goes with it: what is drawn later (in front) covers it
        if (en.o._isoLight) drawGlows(g, sc, en.o._isoLight.glows);
      }
      if (h) {
        const b = h.poly ? bboxOf(h.poly) : h.rect;
        hits.push({ o: en.o, h, b });
        if (en.t === 'item') en.o._isoBox = { b, f: frame };
      }
    }
    for (const e of rugs) if (e._isoBox && e._isoBox.f === frame) hits.unshift({ o: e, h: { poly: null, rect: e._isoBox.b }, b: e._isoBox.b });
    sc._isoHits = hits;

    // people behind walls or racks still show through, faintly
    for (const en of people) if (en.hid) drawActor(g, sc, en.o, true);
    if (sc.overlay) { g.save(); groundT(g, sc); sc.overlay(g, sc); g.restore(); }
  }

  /* ------------------------------------------------------------------ */
  /* Scene API (iso when the scene opts in, the old behaviour otherwise)  */
  /* ------------------------------------------------------------------ */
  const base2d = { render: SP.render, s2w: SP.screenToWorld, w2s: SP.worldToScreen, resize: SP.resize, delta: SP.screenDelta, range: SP.tileRange };
  Object.defineProperty(SP, 'iso', { configurable: true, get() { return !!(this.o && this.o.iso); } });
  // drawInstead (street.js): another picture on this scene's canvas (true = drawn, skip the world)
  SP.render = function () { if (this.drawInstead && this.drawInstead()) return; return this.iso ? renderIso(this) : base2d.render.call(this); };
  SP.resize = function () {
    base2d.resize.call(this);
    if (!this.iso) return;
    // the diagonal of a tile is twice as wide on screen: fewer device pixels per world pixel
    const sW = Math.round(this.canvas.width / (this.o.tilesWide * T * 1.5));
    const sH = Math.floor(this.canvas.height / (this.o.minTilesHigh * T * 0.95));
    this.autoS = Math.max(2, Math.min(sW, sH || sW));
    this.S = Math.max(this.o.minS || 2, this.autoS + (this.o.zoom || 0));
  };
  // screen (css px) → world, on the floor or on the plane at height z
  SP.screenToWorld = function (sx, sy, z) {
    if (!this.iso) return base2d.s2w.call(this, sx, sy);
    const X = (sx * this.dpr + this.ox) / this.S, Y = (sy * this.dpr + this.oy) / this.S + (z || 0);
    return { x: Y + X / 2, y: Y - X / 2 };
  };
  SP.worldToScreen = function (wx, wy, lift) {
    if (!this.iso) return base2d.w2s.call(this, wx, wy, lift);
    return { x: (IX(wx, wy) * this.S - this.ox) / this.dpr, y: (IY(wx, wy, lift) * this.S - this.oy) / this.dpr };
  };
  SP.screenDelta = function (dx, dy) {
    if (!this.iso) return base2d.delta.call(this, dx, dy);
    const X = (dx * this.dpr) / this.S, Y = (dy * this.dpr) / this.S;
    return { x: Y + X / 2, y: Y - X / 2 };
  };
  // a screen direction (keys, joystick) as a world direction of the same length
  SP.screenDir = function (dx, dy) {
    if (!this.iso) return { x: dx, y: dy };
    const x = dy + dx * 0.5, y = dy - dx * 0.5, l = Math.hypot(x, y), m = Math.hypot(dx, dy);
    return l ? { x: (x / l) * m, y: (y / l) * m } : { x: 0, y: 0 };
  };
  SP.tileRange = function () {
    if (!this.iso) return base2d.range.call(this);
    const cw = this.canvas.width / this.dpr, ch = this.canvas.height / this.dpr;
    const ps = [this.screenToWorld(0, 0), this.screenToWorld(cw, 0), this.screenToWorld(0, ch), this.screenToWorld(cw, ch)];
    const W = this.world.W, H = this.world.H;
    return {
      x0: clamp(Math.floor(Math.min(...ps.map((p) => p.x)) / T), 0, W - 1), x1: clamp(Math.ceil(Math.max(...ps.map((p) => p.x)) / T), 0, W - 1),
      y0: clamp(Math.floor(Math.min(...ps.map((p) => p.y)) / T), 0, H - 1), y1: clamp(Math.ceil(Math.max(...ps.map((p) => p.y)) / T), 0, H - 1),
    };
  };
  // the ground transform, for overlays that draw on the floor
  SP.groundTransform = function (g, z) { if (this.iso) groundT(g, this, z); else g.setTransform(this.S, 0, 0, this.S, -this.ox, -this.oy); };
  // one object drawn the iso way (build ghosts); keeps the caller's alpha
  SP.drawItemIso = function (g, e, t) {
    g.save();
    if (!e.bounds && DL.itemGeom) try { DL.itemGeom(e); } catch (err) { /* ghost without geometry */ }
    drawItem(g, this, e, t == null ? this.t : t);
    g.restore();
  };
  // draw in the object's own sprite coordinates (e.px / e.py based, as the top-down overlays do)
  SP.spriteSpace = function (g, e) {
    if (!this.iso) return false;
    const sp = e && e._isoSp;
    if (sp && sp.f === this._isoFrame) { g.setTransform(sp.m[0], sp.m[1], sp.m[2], sp.m[3], sp.m[4], sp.m[5]); return true; }
    groundT(g, this);
    return false;
  };
  // draw around a person in their sprite coordinates (cups, carried units, tears)
  SP.actorSpace = function (g, a) {
    if (!this.iso) return;
    const S = this.S, X = Math.round(IX(a.x, a.y) * S) / S, Y = Math.round(IY(a.x, a.y, a.z || 0) * S) / S;
    g.setTransform(S, 0, 0, S, S * (X - a.x) - this.ox, S * (Y - a.y) - this.oy);
  };
  // corner brackets around an object as it appears on screen
  SP.markItem = function (g, e, col) {
    const bx = e && e._isoBox;
    if (!bx || bx.f !== this._isoFrame) return;
    const b = bx.b, x0 = Math.floor(b[0]) - 1, y0 = Math.floor(b[1]) - 1, x1 = Math.ceil(b[2]), y1 = Math.ceil(b[3]), L = 4;
    g.save();
    isoT(g, this);
    g.fillStyle = col;
    g.fillRect(x0, y0, L, 1); g.fillRect(x0, y0, 1, L);
    g.fillRect(x1 - L + 1, y0, L, 1); g.fillRect(x1, y0, 1, L);
    g.fillRect(x0, y1, L, 1); g.fillRect(x0, y1 - L + 1, 1, L);
    g.fillRect(x1 - L + 1, y1, L, 1); g.fillRect(x1, y1 - L + 1, 1, L);
    g.restore();
  };
  // css-px point just above an object on screen (labels, the inspector card)
  SP.itemTop = function (e, lift) {
    const bx = e && e._isoBox;
    if (this.iso && bx && bx.f === this._isoFrame) {
      const b = bx.b;
      return { x: (((b[0] + b[2]) / 2) * this.S - this.ox) / this.dpr, y: ((b[1] - (lift || 0)) * this.S - this.oy) / this.dpr };
    }
    if (!this.iso && e && e.bounds) return this.worldToScreen(e.bounds.x + e.bounds.w / 2, e.bounds.y - (lift || 0));
    return this.worldToScreen(e.px + (e.tw || 1) * 8, e.py + (e.th || 1) * 8, 40 + (lift || 0));
  };
  // topmost thing drawn under the cursor (css px), optionally filtered
  SP.pickAt = function (sx, sy, filter) {
    const hits = this._isoHits;
    if (!this.iso || !hits) return null;
    const X = (sx * this.dpr + this.ox) / this.S, Y = (sy * this.dpr + this.oy) / this.S;
    for (let i = hits.length - 1; i >= 0; i--) {
      const h = hits[i];
      if (filter && !filter(h.o)) continue;
      const b = h.b;
      if (X < b[0] || X > b[2] || Y < b[1] || Y > b[3]) continue;
      if (h.h.poly && !inPoly(h.h.poly, X, Y)) continue;
      return h.o;
    }
    return null;
  };
  // the floor tile right below the back wall the cursor is on (where wall decoration hangs)
  SP.wallPointAt = function (sx, sy) {
    if (!this.iso || !this._isoSt) return null;
    const X = (sx * this.dpr + this.ox) / this.S, Y = (sy * this.dpr + this.oy) / this.S;
    let best = null;
    for (const run of this._isoSt.runs) {
      if (run.face !== 's') continue;
      const yw = run.r[3], x = X + yw, z = (x + yw) / 2 - Y;
      if (x < run.r[0] || x >= run.r[2] || z < 0 || z > run.H) continue;
      if (!best || yw > best.y - 8) best = { x, y: yw + 8 };
    }
    return best;
  };
})();
