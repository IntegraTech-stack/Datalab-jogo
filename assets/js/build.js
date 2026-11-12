/* DataLab — build mode: floor areas, free walls, doors, grid placement and the furniture catalog.
   Areas are rectangles of floor (the building's footprint). Walls are free segments on the tile
   grid (`world.wallSet`), doors are independent items sitting on a wall, and rooms are whatever
   connected floor regions the walls and doors enclose. */
(function () {
  'use strict';
  const DL = window.DL, T = DL.T, R = DL.R;

  const LIM = { mapW: 64, mapH: 48, minW: 3, minH: 3, maxW: 30, maxH: 24 };
  const FLOOR = { '.': 1, ',': 1, '_': 1 };
  const SKIP = { glass: 1, glassH: 1, videowall: 1, wallseg: 1 };
  const tkey = (x, y) => x + ',' + y;

  /* ------------------------------------------------------------------ */
  /* Areas → tiles                                                       */
  /* ------------------------------------------------------------------ */

  // Two areas separated by exactly one tile share a partition (walled + a door when it first appears).
  function sharedWall(a, b) {
    let l = null, r = null;
    if (b.x === a.x + a.w + 1) { l = a; r = b; } else if (a.x === b.x + b.w + 1) { l = b; r = a; }
    if (l) {
      const from = Math.max(l.y, r.y), to = Math.min(l.y + l.h, r.y + r.h);
      if (to > from) return { axis: 'v', at: l.x + l.w, from, to };
    }
    let t = null, u = null;
    if (b.y === a.y + a.h + 1) { t = a; u = b; } else if (a.y === b.y + b.h + 1) { t = b; u = a; }
    if (t) {
      const from = Math.max(t.x, u.x), to = Math.min(t.x + t.w, u.x + u.w);
      if (to > from) return { axis: 'h', at: t.y + t.h, from, to };
    }
    return null;
  }

  // Areas need at least one wall tile between them.
  const tooClose = (a, b) => !(a.x + a.w + 1 <= b.x || b.x + b.w + 1 <= a.x || a.y + a.h + 1 <= b.y || b.y + b.h + 1 <= a.y);

  function connected(areas) {
    const seen = new Set([0]), q = [0];
    while (q.length) {
      const i = q.pop();
      areas.forEach((r, j) => {
        if (!seen.has(j) && sharedWall(areas[i], r)) { seen.add(j); q.push(j); }
      });
    }
    return seen.size === areas.length;
  }

  /* ---------- doors: items of their own, sitting on a wall ---------- */
  // axis 'h' = door in a horizontal (east–west) wall, people pass north–south; 'v' = the opposite.
  // rot: bit 0 = hinge on the other side, bit 1 = swings the other way.
  function makeDoor(tx, ty, axis, len, rot) {
    len = len || 1;
    const e = { kind: 'door', tx, ty, axis, len, tw: axis === 'h' ? len : 1, th: axis === 'h' ? 1 : len, rot: rot || 0, solid: false, built: true, seed: 0, state: 'ok', open: 0 };
    e.px = tx * T;
    e.py = ty * T;
    DL.itemGeom(e);
    return e;
  }
  DL.makeDoor = makeDoor;
  const doorCells = (e) => Array.from({ length: e.len || 1 }, (_, n) => (e.axis === 'h' ? [e.tx + n, e.ty] : [e.tx, e.ty + n]));

  // Centred door on a brand-new partition, as close to the middle as the furniture allows.
  function centredDoor(s, occ) {
    const len = s.to - s.from, dl = Math.min(2, len), mid = s.from + (len - dl) / 2;
    const ks = [];
    for (let k = s.from; k <= s.to - dl; k++) ks.push(k);
    ks.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid));
    const side = (k, d) => (s.axis === 'v' ? tkey(s.at + d, k) : tkey(k, s.at + d));
    for (const k of ks) {
      let ok = true;
      for (let q = k; q < k + dl && ok; q++) if (occ && (occ.has(side(q, -1)) || occ.has(side(q, 1)))) ok = false;
      if (ok) return s.axis === 'v' ? makeDoor(s.at, k, 'v', dl) : makeDoor(k, s.at, 'h', dl);
    }
    return null;
  }

  let roomSeq = 1;
  const newRoomId = () => 'r' + Date.now().toString(36) + (roomSeq++);
  const lookOf = (r) => {
    const o = {};
    for (const k of ['floor', 'theme', 'type']) if (r[k] != null) o[k] = r[k];
    if (r.style) o.style = JSON.parse(JSON.stringify(r.style));
    return o;
  };

  // Floor regions → rooms. A region keeps the identity (name, type, look) of the room it overlaps
  // most; a piece split off copies the look under a new name; a region on new floor takes its area's.
  function matchRooms(w, regions, W, areaAt) {
    const prev = w.rooms || [], pAt = w.roomAt, pW = w.W || 0, pH = w.H || 0;
    const cand = [];
    regions.forEach((cells, i) => {
      const cnt = new Map();
      if (pAt && prev.length) {
        for (const idx of cells) {
          const x = idx % W, y = (idx - x) / W;
          if (x >= pW || y >= pH) continue;
          const p = pAt[y * pW + x];
          if (p >= 0 && prev[p]) cnt.set(p, (cnt.get(p) || 0) + 1);
        }
      }
      for (const [p, n] of cnt) cand.push([n, i, p]);
    });
    cand.sort((a, b) => b[0] - a[0]);
    const out = new Array(regions.length).fill(null), usedPrev = new Set();
    for (const [, i, p] of cand) {
      if (out[i] || usedPrev.has(p)) continue;
      out[i] = Object.assign({}, prev[p]);
      usedPrev.add(p);
    }
    const ids = new Set(out.filter(Boolean).map((r) => r.id)), names = new Set(out.filter(Boolean).map((r) => r.name));
    const geo = regions.map((cells) => {
      let x0 = Infinity, y0 = Infinity, x1 = -1, y1 = -1;
      for (const idx of cells) { const x = idx % W, y = (idx - x) / W; x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
      return { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1, n: cells.length };
    });
    regions.forEach((cells, i) => {
      if (out[i]) return;
      const best = cand.find((c) => c[1] === i);
      let base = best ? prev[best[2]] : null, fromArea = false;
      if (!base && w.areas) {
        const cnt = new Map();
        for (const idx of cells) { const a = areaAt[idx]; if (a >= 0) cnt.set(a, (cnt.get(a) || 0) + 1); }
        let bestA = -1, bn = 0;
        for (const [a, n] of cnt) if (n > bn) { bn = n; bestA = a; }
        if (bestA >= 0) { base = w.areas[bestA]; fromArea = true; }
      }
      const r = base ? lookOf(base) : {};
      if (!r.floor) r.floor = 'tile';
      r.id = fromArea && base.id && !ids.has(base.id) ? base.id : newRoomId();
      const g = geo[i], corridor = Math.min(g.w, g.h) <= 2 && g.n >= 3;
      if (fromArea && base.name && !names.has(base.name)) r.name = base.name;
      else {
        const stem = corridor ? 'Corredor' : 'Sala';
        for (let n = 1; ; n++) if (!names.has(stem + ' ' + n)) { r.name = stem + ' ' + n; break; }
      }
      ids.add(r.id);
      names.add(r.name);
      out[i] = r;
    });
    out.forEach((r, i) => {
      const g = geo[i];
      Object.assign(r, { x: g.x, y: g.y, w: g.w, h: g.h, n: g.n, doors: 0 });
      // label: bottom-centre for a plain rectangle, otherwise the floor tile nearest the middle
      if (g.n === g.w * g.h) { r.lx = (g.x + g.w / 2) * T; r.ly = (g.y + g.h - 0.6) * T; }
      else {
        let cx = 0, cy = 0;
        for (const idx of regions[i]) { cx += idx % W; cy += Math.floor(idx / W); }
        cx /= g.n; cy /= g.n;
        let bd = Infinity, bx = g.x, by = g.y;
        for (const idx of regions[i]) { const x = idx % W, y = (idx - x) / W, d = (x - cx) ** 2 + (y - cy) ** 2; if (d < bd) { bd = d; bx = x; by = y; } }
        r.lx = (bx + 0.5) * T; r.ly = (by + 0.6) * T;
      }
    });
    return out;
  }

  // How a wall tile links to its neighbours. Two parallel walls side by side (or a wall running
  // along the outer wall) stay separate instead of being stitched together tile by tile.
  // Each wall tile remembers which way it was drawn ('h', 'v', both at corners); links follow that.
  const wallVal = (mat, ax) => (mat || 'solid') + ':' + (ax || '');
  const wallMat = (v) => String(v || 'solid').split(':')[0];
  const wallAx = (v) => String(v || '').split(':')[1] || '';
  function wallJoins(at, axAt) {
    const isW = (t) => t === 'w' || t === 'd' || t === 'D';
    const ax = (x, y) => { const t = at(x, y); return t === 'D' ? 'h' : t === 'd' ? 'v' : t === 'w' ? axAt(x, y) : ''; };
    return {
      h(x, y, nx) {
        const t = at(nx, y), a = ax(x, y);
        if (t === '#') return a.indexOf('h') >= 0;
        return isW(t) && (a.indexOf('h') >= 0 || ax(nx, y).indexOf('h') >= 0);
      },
      v(x, y, ny) {
        const t = at(x, ny), a = ax(x, y);
        if (t === '#') return a.indexOf('v') >= 0;
        return isW(t) && (a.indexOf('v') >= 0 || ax(x, ny).indexOf('v') >= 0);
      },
    };
  }

  function layout(w) {
    const areas = w.areas;
    let W = w.lot ? w.lot.w : 0, H = w.lot ? w.lot.h : 0;
    for (const r of areas) { W = Math.max(W, r.x + r.w + 1); H = Math.max(H, r.y + r.h + 1); }
    const N = W * H;
    const base = new Uint8Array(N); // 0 ground / outer wall · 1 area floor · 2 partition between areas
    const areaAt = new Int16Array(N).fill(-1);
    areas.forEach((r, i) => {
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) { base[y * W + x] = 1; areaAt[y * W + x] = i; }
    });
    const runs = [];
    for (let i = 0; i < areas.length; i++) {
      for (let j = i + 1; j < areas.length; j++) {
        const s = sharedWall(areas[i], areas[j]);
        if (!s) continue;
        s.a = areas[i].id;
        s.b = areas[j].id;
        for (let k = s.from; k < s.to; k++) base[s.axis === 'v' ? k * W + s.at : s.at * W + k] = 2;
        runs.push(s);
      }
    }

    // walls: only on floor or partition tiles; partitions that just appeared start walled
    const ws = w.wallSet || (w.wallSet = new Map());
    for (const k of Array.from(ws.keys())) {
      const [x, y] = k.split(',').map(Number);
      if (!(x >= 0 && y >= 0 && x < W && y < H && base[y * W + x])) ws.delete(k);
    }
    const seen = w.gapsSeen, gaps = new Set(), fresh = [];
    for (const s of runs) {
      let isNew = true;
      for (let k = s.from; k < s.to; k++) {
        const kk = s.axis === 'v' ? tkey(s.at, k) : tkey(k, s.at);
        gaps.add(kk);
        if (seen && seen.has(kk)) isNew = false;
        else ws.set(kk, ws.get(kk) || wallVal('glass', s.axis));
      }
      if (isNew) fresh.push(s);
    }
    w.gapsSeen = gaps;
    w.freshRuns = fresh;

    // doors that no longer sit on a wall are dropped
    const doorAt = new Map(), items = [];
    for (const e of w.items) {
      if (SKIP[e.kind] && e.kind !== 'videowall') continue;
      if (e.kind === 'door') {
        const cs = doorCells(e);
        if (!cs.every(([x, y]) => x >= 0 && y >= 0 && x < W && y < H && ws.has(tkey(x, y))) || cs.some(([x, y]) => doorAt.has(tkey(x, y)))) continue;
        for (const [x, y] of cs) doorAt.set(tkey(x, y), e);
      }
      items.push(e);
    }

    const tiles = new Array(N).fill('#');
    for (let i = 0; i < N; i++) if (base[i]) tiles[i] = '.';
    for (const k of ws.keys()) { const [x, y] = k.split(',').map(Number); tiles[y * W + x] = 'w'; }
    for (const [k, e] of doorAt) { const [x, y] = k.split(',').map(Number); tiles[y * W + x] = e.axis === 'h' ? 'D' : 'd'; }

    // rooms: connected floor regions (walls and doors separate them)
    const roomAt = new Int16Array(N).fill(-1), regions = [];
    for (let i = 0; i < N; i++) {
      if (tiles[i] !== '.' || roomAt[i] >= 0) continue;
      const id = regions.length, cells = [i], q = [i];
      roomAt[i] = id;
      while (q.length) {
        const c = q.pop(), x = c % W;
        const nb = [x > 0 ? c - 1 : -1, x < W - 1 ? c + 1 : -1, c - W, c + W];
        for (const n of nb) {
          if (n < 0 || n >= N || tiles[n] !== '.' || roomAt[n] >= 0) continue;
          roomAt[n] = id;
          cells.push(n);
          q.push(n);
        }
      }
      regions.push(cells);
    }
    const rooms = matchRooms(w, regions, W, areaAt);
    rooms.forEach((r, i) => {
      for (const idx of regions[i]) {
        const x = idx % W, y = (idx - x) / W;
        tiles[idx] = r.floor === 'carpet' ? '_' : w.perf.has(tkey(x, y)) ? ',' : '.';
      }
    });

    // tiles right in front of a door stay walkable
    const clear = new Set(), doorsOf = rooms.map(() => new Set());
    for (const [k, e] of doorAt) {
      const [x, y] = k.split(',').map(Number);
      const sides = e.axis === 'h' ? [[x, y - 1], [x, y + 1]] : [[x - 1, y], [x + 1, y]];
      for (const [sx, sy] of sides) {
        if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
        clear.add(tkey(sx, sy));
        const ri = roomAt[sy * W + sx];
        if (ri >= 0) doorsOf[ri].add(e);
      }
    }
    rooms.forEach((r, i) => { r.doors = doorsOf[i].size; });

    // wall pieces are items, so they depth-sort with people and furniture
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? '#' : tiles[y * W + x]);
    const J = wallJoins(at, (x, y) => wallAx(ws.get(tkey(x, y))));
    for (const [k, v] of ws) {
      if (doorAt.has(k)) continue;
      const [x, y] = k.split(',').map(Number);
      const e = { kind: 'wallseg', tx: x, ty: y, tw: 1, th: 1, solid: false, mat: wallMat(v), built: true,
        l: J.h(x, y, x - 1), r: J.h(x, y, x + 1), u: J.v(x, y, y - 1), d: J.v(x, y, y + 1) };
      e.px = x * T; e.py = y * T;
      DL.itemGeom(e);
      items.push(e);
    }
    // the way out to the street (street.js): a door in the left (west) wall of the first room. The lot only
    // grows east and south, so that wall always faces outside; the tile in front of it stays free.
    let exitDoor = null;
    const r0 = areas[0];
    if (r0) {
      const x = r0.x - 1, mid = r0.y + Math.floor((r0.h - 1) / 2);
      const ys = [];
      for (let y = r0.y; y < r0.y + r0.h; y++) ys.push(y);
      ys.sort((a, b) => Math.abs(a - mid) - Math.abs(b - mid) || a - b);
      // (an old save may already have furniture there: then the next free spot along the wall)
      const taken = (tx, ty) => items.some((e) => e.solid !== false && !e.wall && !e.host && !SKIP[e.kind] && tx >= e.tx && tx < e.tx + (e.tw || 1) && ty >= e.ty && ty < e.ty + (e.th || 1));
      const ok = (yy) => x >= 0 && at(x, yy) === '#' && FLOOR[at(x + 1, yy)] && !clear.has(tkey(x + 1, yy));
      let y = ys.find((yy) => ok(yy) && !taken(x + 1, yy));
      if (y === undefined) y = ys.find(ok);
      if (y !== undefined) { exitDoor = { tx: x, ty: y }; clear.add(tkey(x + 1, y)); }
    }
    Object.assign(w, { W, H, tiles, roomAt, areaAt, rooms, walls: runs, keepClear: clear, items, exitDoor });
  }

  function rebuildSolid(w) {
    const W = w.W, H = w.H, solid = new Uint8Array(W * H);
    for (let i = 0; i < W * H; i++) {
      const t = w.tiles[i];
      if (t === '#' || t === 'w' || t === 'g' || t === 'G') solid[i] = 1;
    }
    for (const e of w.items) {
      if (!e.solid || e.host || SKIP[e.kind]) continue;
      const hole = DL.itemHole ? DL.itemHole(e) : null;
      for (let j = 0; j < e.th; j++) {
        for (let i = 0; i < e.tw; i++) {
          if (hole && hole[0] === i && hole[1] === j) continue;
          const x = e.tx + i, y = e.ty + j;
          if (x >= 0 && y >= 0 && x < W && y < H) solid[y * W + x] = 1;
        }
      }
    }
    w.solid = solid;
  }

  function refreshIndex(w) {
    w.byId = {};
    for (const e of w.items) if (e.id) w.byId[e.id] = e;
    w.interactables = w.items.filter((e) => e.id);
  }

  /* ---------- wall + door sprites ---------- */
  // Walls stand on the tile's lower part: cap from py-6, face down to py+10, so a person north of
  // a wall is partly hidden by it and one south of it is drawn in front.
  const WALL = {
    solid: { cap: '#454d5b', capHi: '#596273', face: '#222833', faceHi: '#2b323e', base: '#11141a' },
    glass: { cap: '#2a3039', capHi: '#3a4250', face: 'rgba(160,195,236,0.09)', faceHi: 'rgba(220,235,255,0.16)', base: '#2a3039' },
  };
  function drawWallSeg(g, e) {
    const c = WALL[e.mat] || WALL.solid, px = e.px, py = e.py;
    if (e.l || e.r || !e.d) {
      const x0 = e.l ? px : px + 6, x1 = e.r ? px + 16 : px + 10;
      R(g, x0, py + 10, x1 - x0, 2, 'rgba(0,0,0,0.22)');
      R(g, x0, py - 3, x1 - x0, 13, c.face);
      if (e.mat === 'glass') {
        R(g, x0 + ((e.tx * 5) % 7) + 1, py, 1, 1, c.faceHi);
        R(g, x0 + ((e.tx * 5) % 7) + 2, py - 1, 1, 1, c.faceHi);
      } else {
        R(g, x0, py - 3, x1 - x0, 1, c.faceHi);
        if (!e.l) R(g, x0, py - 3, 1, 13, '#151920');
        if (!e.r) R(g, x1 - 1, py - 3, 1, 13, '#151920');
      }
      R(g, x0, py + 9, x1 - x0, 1, c.base);
      R(g, x0, py - 6, x1 - x0, 3, c.cap);
      R(g, x0, py - 6, x1 - x0, 1, c.capHi);
    }
    if (e.d) {
      R(g, px + 6, py - 6, 4, 16, c.cap);
      R(g, px + 7, py - 6, 2, 16, c.capHi);
      if (e.mat === 'glass') R(g, px + 7, py - 6, 2, 16, 'rgba(160,195,236,0.22)');
    }
  }

  function drawDoor(g, e) {
    const px = e.px, py = e.py, o = Math.max(0, Math.min(1, e.open || 0));
    const flip = e.rot & 1, back = e.rot & 2, len = e.len || 1;
    const leaf = '#5a4a3c', leafHi = '#6e5b4a', leafLo = '#3f342b', frame = '#2a3039', cap = '#3b424e';
    if (e.axis === 'h') {
      const W = len * T;
      R(g, px, py + 10, W, 2, 'rgba(0,0,0,0.2)');
      // leaves: one per side for a double door, otherwise a single one hinged left (or right)
      const leaves = len > 1 ? [[px + 2, (W - 4) / 2, 0], [px + W / 2, (W - 4) / 2, 1]] : [[px + 2, W - 4, flip]];
      for (const [lx, lw, hingeR] of leaves) {
        const vis = Math.max(1, Math.round(lw * (1 - 0.88 * o)));
        const x = hingeR ? lx + lw - vis : lx;
        R(g, x, py - 3, vis, 13, leaf);
        R(g, x, py - 3, vis, 1, leafHi);
        R(g, x, py + 9, vis, 1, leafLo);
        if (vis > 5) R(g, hingeR ? x + 1 : x + vis - 3, py + 3, 2, 1, '#c9b48a');
        // the swung leaf, seen edge-on, sticks out to the swing side
        if (o > 0.05) {
          const hx = hingeR ? lx + lw - 2 : lx, sw = Math.round(o * 11);
          if (back) R(g, hx, py - 3 - sw, 2, sw + 2, leafHi);
          else R(g, hx, py + 9, 2, sw + 1, leafLo);
        }
      }
      R(g, px, py - 6, W, 3, cap);
      R(g, px, py - 6, W, 1, '#4b5361');
      R(g, px, py - 6, 2, 16, frame);
      R(g, px + W - 2, py - 6, 2, 16, frame);
    } else {
      const H = len * T;
      const leaves = len > 1 ? [[py - 6, H / 2, 0], [py - 6 + H / 2, H / 2, 1]] : [[py - 6, H, flip]];
      for (const [ly, lh, hingeB] of leaves) {
        const vis = Math.max(1, Math.round(lh * (1 - 0.88 * o)));
        const y = hingeB ? ly + lh - vis : ly;
        R(g, px + 6, y, 4, vis, leaf);
        R(g, px + 7, y, 2, vis, leafHi);
        if (o > 0.05) {
          const hy = hingeB ? ly + lh - 2 : ly, sw = Math.round(o * 10);
          if (back) R(g, px + 6 - sw, hy, sw, 2, leafLo);
          else R(g, px + 10, hy, sw, 2, leafLo);
        }
      }
      R(g, px + 5, py - 7, 6, 2, frame);
      R(g, px + 5, py - 7 + H, 6, 2, frame);
    }
  }

  const draw0 = DL.drawItem;
  DL.drawItem = function (g, e, t) {
    if (e.kind === 'wallseg') return drawWallSeg(g, e);
    if (e.kind === 'door') return drawDoor(g, e);
    return draw0(g, e, t);
  };
  const geom0 = DL.itemGeom;
  DL.itemGeom = function (e) {
    if (e.kind === 'wallseg') { e.sortY = e.py + 10; e.ix = e.px + 8; e.iy = e.py + 23; e.bounds = null; return; }
    if (e.kind === 'door') {
      const w = e.tw * T, h = e.th * T;
      e.sortY = e.axis === 'h' ? e.py + 10 : e.py + h - 6;
      e.bounds = e.axis === 'h' ? { x: e.px, y: e.py - 7, w, h: 19 } : { x: e.px + 2, y: e.py - 8, w: 12, h: h + 4 };
      e.ix = e.px + w / 2;
      e.iy = e.py + h + 7;
      return;
    }
    geom0(e);
  };

  /* ---------- floor + walls, generalised from DL.renderStatic ---------- */
  DL.renderRooms = function (w) {
    const W = w.W, H = w.H;
    const c = DL.mk(W * T, H * T), g = c.getContext('2d');
    const at = (x, y) => (x < 0 || y < 0 || x >= W || y >= H ? '#' : w.tiles[y * W + x]);
    const open = (t) => t !== '#';
    // rooms can carry their own look (decor.js); without one, the classic floor
    const D = DL.decorRender;
    const styleAt = (x, y) => {
      if (!D || x < 0 || y < 0 || x >= W || y >= H || !w.roomAt) return null;
      const i = w.roomAt[y * W + x];
      const s = i >= 0 ? D.styleOf(w.rooms[i]) : null;
      return s && !s.classic ? s : null;
    };
    const floor = (t, px, py, x, y, sx, sy) => {
      const st = styleAt(sx == null ? x : sx, sy == null ? y : sy);
      if (st) D.floorTile(g, st, px, py, x, y, t === ',');
      else if (t === '_') DL.carpet(g, px, py, x, y);
      else DL.floorTile(g, px, py, t === ',');
    };
    const isFloor = (t) => t === '.' || t === ',' || t === '_';
    const floorKind = (t) => (t === '_' || t === ',' ? t : '.');
    // a wall or door tile shows the floor of the rooms on each side of it
    const splitFloor = (x, y, px, py) => {
      const L = at(x - 1, y), Rt = at(x + 1, y), U = at(x, y - 1), Dn = at(x, y + 1);
      if (isFloor(L) || isFloor(Rt)) {
        const a = isFloor(L) ? [L, x - 1] : [Rt, x + 1], b = isFloor(Rt) ? [Rt, x + 1] : a;
        floor(floorKind(a[0]), px, py, x, y, a[1], y);
        floor(floorKind(b[0]), px + 8, py, x, y, b[1], y);
      } else if (isFloor(U) || isFloor(Dn)) {
        const a = isFloor(U) ? [U, y - 1] : [Dn, y + 1], b = isFloor(Dn) ? [Dn, y + 1] : a;
        floor(floorKind(a[0]), px, py, x, y, x, a[1]);
        floor(floorKind(b[0]), px, py + 8, x, y, x, b[1]);
      } else R(g, px, py, T, T, '#0b0c10');
    };

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = at(x, y), px = x * T, py = y * T;
        if (t === '#') {
          let near = false;
          for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) if (open(at(x + dx, y + dy))) { near = true; break; }
          if (near) R(g, px, py, T, T, '#0b0c10');
          else if (w.lot && x < w.lot.w && y < w.lot.h) {
            // empty lot: buildable ground, waiting for a room
            R(g, px, py, T, T, '#0c0e12');
            R(g, px, py, 1, 1, '#1a1d24');
            if ((x + y) % 5 === 0) R(g, px + 9, py + 6, 1, 1, '#14171c');
          }
        } else if (t === 'g') {
          floor(floorKind(at(x - 1, y)), px, py, x, y, x - 1, y);
          floor(floorKind(at(x + 1, y)), px + 8, py, x, y, x + 1, y);
          R(g, px + 7, py, 3, 16, '#1c2129');
        } else if (t === 'G') {
          floor(floorKind(at(x, y - 1)), px, py, x, y, x, y - 1);
          floor(floorKind(at(x, y + 1)), px, py + 8, x, y, x, y + 1);
          R(g, px, py + 7, 16, 3, '#1c2129');
        } else if (t === 'w' || t === 'd' || t === 'D') {
          splitFloor(x, y, px, py);
          if (t !== 'w') R(g, px + (t === 'd' ? 6 : 0), py + (t === 'D' ? 6 : 0), t === 'd' ? 4 : 16, t === 'D' ? 4 : 16, 'rgba(10,12,16,0.35)');
        } else floor(t, px, py, x, y);
      }
    }
    // wall faces: any wall with open floor right below it
    const faceTop = (x, y) => ((y >= 1 && at(x, y - 1) === '#') ? (y + 1) * T - 26 : (y + 1) * T - 12);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (at(x, y) !== '#' || !open(at(x, y + 1))) continue;
        const px = x * T, B = (y + 1) * T, ft = faceTop(x, y);
        const tall = ft === B - 26, ct = tall ? (y - 1) * T : y * T;
        const noc = at(x, y + 1) === '_';
        R(g, px, ct, 16, ft - 1 - ct, '#0b0c10');
        const ws = styleAt(x, y + 1);
        if (ws) { D.wallFace(g, ws, px, ft, B, ws.rgb && ws.rgb.on ? ws.rgb.color : null); continue; }
        R(g, px, ft - 1, 16, 1, '#242832');
        R(g, px, ft, 16, B - ft, noc ? '#14161d' : '#171b22');
        R(g, px, ft, 1, B - ft, noc ? '#121419' : '#14171d');
        R(g, px, B - 4, 16, 1, '#1d2028');
        R(g, px, B - 3, 16, 3, '#101217');
        R(g, px, B, 16, 2, 'rgba(0,0,0,0.25)');
      }
    }
    // partition headers where an inner wall meets a wall face
    for (let y = 1; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const t = at(x, y);
        if ((t !== 'g' && t !== 'w' && t !== 'd') || at(x, y - 1) !== '#') continue;
        if (t === 'w' && !(at(x, y + 1) === 'w' || at(x, y + 1) === 'd' || isFloor(at(x - 1, y)) || isFloor(at(x + 1, y)))) continue;
        const ft = faceTop(x, y - 1);
        R(g, x * T + 6, ft, 5, y * T - ft, '#1d222a');
      }
    }
    // inner wall edges
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (at(x, y) !== '#') continue;
        const px = x * T, py = y * T;
        if (open(at(x + 1, y))) R(g, px + 15, py, 1, 16, '#20242c');
        if (open(at(x - 1, y))) R(g, px, py, 1, 16, '#20242c');
        if (open(at(x, y - 1))) R(g, px, py, 16, 1, '#20242c');
      }
    }
    // cable trays + lamps on the tall north wall of technical rooms
    const lampsOf = (r) => {
      const xs = [];
      for (let lx = r.x + 2; lx <= r.x + r.w - 3; lx += 4) xs.push(lx);
      return xs;
    };
    for (const r of w.rooms) {
      const rs = D && D.styleOf(r);
      const lit = rs && !rs.classic && rs.light && rs.light !== 'auto' ? rs.light !== 'dim' : r.floor === 'tile';
      if (!lit || at(r.x, r.y - 1) !== '#' || at(r.x, r.y - 2) !== '#') continue;
      const ft = r.y * T - 26;
      // only along the stretch of north wall this room actually touches
      let x0 = r.x;
      while (x0 < r.x + r.w) {
        while (x0 < r.x + r.w && !(isFloor(at(x0, r.y)) && at(x0, r.y - 1) === '#')) x0++;
        let x1 = x0;
        while (x1 < r.x + r.w && isFloor(at(x1, r.y)) && at(x1, r.y - 1) === '#') x1++;
        if (x1 > x0) {
          R(g, x0 * T, ft + 2, (x1 - x0) * T, 1, '#2f4566');
          R(g, x0 * T, ft + 3, (x1 - x0) * T, 2, '#262b34');
          R(g, x0 * T, ft + 5, (x1 - x0) * T, 1, '#111318');
          for (const lx of lampsOf({ x: x0, w: x1 - x0 })) {
            R(g, lx * T + 4, ft + 11, 8, 2, '#dfe7f2');
            R(g, lx * T + 4, ft + 13, 8, 1, '#7f8a9c');
          }
        }
        x0 = x1;
      }
    }
    if (w.lot) {
      g.fillStyle = '#1d2129';
      g.fillRect(0, w.lot.h * T - 1, w.lot.w * T, 1);
      g.fillRect(w.lot.w * T - 1, 0, 1, w.lot.h * T);
    }
    // baked light pools (inside each room's own floor only)
    g.globalCompositeOperation = 'lighter';
    const inRoom = (r, i, lx, ly) => w.roomAt && w.roomAt[Math.floor(ly) * W + Math.floor(lx)] === i;
    w.rooms.forEach((r, i) => {
      const rs = D && D.styleOf(r);
      if (rs && !rs.classic && D.bakeLight(g, r, rs)) return;
      if (r.floor === 'tile') {
        for (const lx of lampsOf(r)) for (let ly = r.y + 1.4; ly < r.y + r.h; ly += 5) if (inRoom(r, i, lx, ly)) DL.pool(g, lx * T + 8, ly * T, 54, 'rgba(160,195,236,0.045)');
      } else if (r.id === 'noc') {
        for (const [lx, ly] of [[4, 8], [7, 13], [5, 16]]) DL.pool(g, lx * T, ly * T, 72, 'rgba(255,194,133,0.03)');
      } else {
        for (let ly = r.y + 2; ly < r.y + r.h; ly += 5) for (let lx = r.x + 2; lx < r.x + r.w; lx += 5) if (inRoom(r, i, lx, ly)) DL.pool(g, lx * T, ly * T, 64, 'rgba(255,194,133,0.03)');
      }
    });
    g.globalCompositeOperation = 'source-over';
    return c;
  };

  // Walls on fresh partitions get a centred door (new worlds, presets, a room drawn next to another).
  function doorsForFresh(w, occ) {
    const add = [];
    // (auto: the free door a new partition gets — saves tell it apart from bought doors)
    for (const s of w.freshRuns || []) { const d = centredDoor(s, occ); if (d) { d.auto = true; add.push(d); } }
    if (add.length) { w.items = w.items.concat(add); layout(w); }
    return add;
  }

  // Convert the hand-made DC-01 map into the area model.
  DL.initRooms = function (w) {
    w.areas = [
      { id: 'noc', name: 'NOC', x: 1, y: 2, w: 9, h: 17, floor: 'carpet', fixed: true },
      { id: 'hall', name: 'Salão de servidores', x: 11, y: 2, w: 18, h: 17, floor: 'tile' },
    ];
    w.perf = new Set();
    for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) if (w.tiles[y * w.W + x] === ',') w.perf.add(x + ',' + y);
    for (const d of w.items) {
      if (d.kind !== 'desk') continue;
      const c = w.items.find((x) => x.kind === 'chair' && x.tx === d.tx && x.ty === d.ty + 1);
      if (!c) continue;
      d.rot = 0;
      d.chair = c;
      Object.assign(c, { parent: d, tw: 2, rot: 0 });
    }
    for (const e of w.items) if (!e.bounds && !SKIP[e.kind]) DL.itemGeom(e);
    w.rooms = null;
    layout(w);
    doorsForFresh(w, null);
    rebuildSolid(w);
    refreshIndex(w);
    w.version = 1;
  };

  // A world built from scratch: a small lot with one entrance room (or a preset's rooms).
  // Furniture for presets is placed afterwards through the builder, with the player's own rules.
  DL.newWorld = function (def) {
    const w = {
      items: [], npcs: [], rows: { A: [], B: [] }, labels: [], perf: new Set(), wallSet: new Map(),
      lot: def ? Object.assign({}, def.lot) : { w: 10, h: 9 }, hasVideoWall: false,
      areas: def ? def.rooms.map((r, i) => Object.assign({ id: 'r' + (i + 1), floor: 'tile' }, r)) : [{ id: 'r1', name: 'Entrada', x: 1, y: 2, w: 7, h: 5, floor: 'carpet' }],
    };
    for (const [kind, tx, ty] of def ? [] : [['plant', 1, 2], ['water', 7, 2]]) {
      const e = { kind, tx, ty, tw: 1, th: 1, solid: true, seed: w.items.length * 7 + 3, state: 'ok', built: true };
      e.px = tx * T;
      e.py = ty * T;
      e.sortY = e.py + T;
      DL.itemGeom(e);
      w.items.push(e);
    }
    layout(w);
    doorsForFresh(w, null);
    rebuildSolid(w);
    refreshIndex(w);
    const r0 = w.areas[0];
    w.spawn = def && def.spawn ? { x: def.spawn[0] * T + 8, y: def.spawn[1] * T + 10 } : { x: Math.floor(r0.x + r0.w / 2) * T + 8, y: (r0.y + r0.h - 2) * T + 10 };
    w.version = 1;
    return w;
  };

  /* ------------------------------------------------------------------ */
  /* Catalog                                                             */
  /* ------------------------------------------------------------------ */
  // price: what placing it costs the company ($); group: the filter chip inside the tab.
  const CATALOG = [
    { id: 'desk', cat: 'equip', group: 'Estações', name: 'Computador', w: 2, h: 1, price: 2200, desc: 'Estação com dois monitores, PC e cadeira. A equipe trabalha aqui.' },
    // workstation setups: all are desks (kind 'desk') with their own PC, so the crew uses any of them
    { id: 'desk1', kind: 'desk', setup: 'mono1', cat: 'equip', group: 'Estações', name: 'Mesa · 1 monitor', w: 2, h: 1, price: 1500, desc: 'Um monitor e o PC embaixo da mesa.' },
    { id: 'desk3', kind: 'desk', setup: 'mono3', cat: 'equip', group: 'Estações', name: 'Mesa · 3 monitores', w: 2, h: 1, price: 2900, desc: 'Três monitores lado a lado e PC embaixo.' },
    { id: 'desk4', kind: 'desk', setup: 'mono4', cat: 'equip', group: 'Estações', name: 'Mesa · 4 monitores', w: 2, h: 1, price: 3600, desc: 'Quatro monitores num braço articulado.' },
    { id: 'deskgamer', kind: 'desk', setup: 'gamer', chair: 'gamer', cat: 'equip', group: 'Estações', name: 'Setup gamer', w: 2, h: 1, price: 4200, desc: 'Monitor ultrawide curvo, teclado RGB e PC com luz.' },
    { id: 'deskgamerpc', kind: 'desk', setup: 'gamerpc', chair: 'gamer', cat: 'equip', group: 'Estações', name: 'Setup com PC gamer', w: 2, h: 1, price: 5200, desc: 'Dois monitores e um gabinete RGB de vidro sobre a mesa.' },
    { id: 'desktech', kind: 'desk', setup: 'tech', cat: 'equip', group: 'Estações', name: 'Estação técnica', w: 2, h: 1, price: 2600, desc: 'Monitor, notebook de campo, multímetro e cabos.' },
    { id: 'desknoc', kind: 'desk', setup: 'noc', cat: 'equip', group: 'Estações', name: 'Estação de NOC', w: 2, h: 1, price: 4800, desc: 'Painel superior com indicadores e três monitores de operação.' },
    { id: 'desksupport', kind: 'desk', setup: 'support', cat: 'equip', group: 'Estações', name: 'Estação de atendimento', w: 2, h: 1, price: 1800, desc: 'Monitor, telefone e headset: a equipe atende os clientes daqui primeiro.' },
    { id: 'deskadmin', kind: 'desk', setup: 'admin', chair: 'exec', cat: 'equip', group: 'Estações', name: 'Estação de administrador', w: 2, h: 1, price: 3200, desc: 'Dois monitores, notebook, documentos e cadeira executiva.' },
    { id: 'rack', cat: 'equip', group: 'Racks', name: 'Rack', price: 1800, desc: 'Rack 42U vazio. Instale servidores e switches nele.' },
    { id: 'server', cat: 'equip', group: 'Servidores', name: 'Servidor intermediário', mount: 'rack', thumb: 'unit-server', price: 6000, desc: 'O servidor padrão: 12 núcleos, 64 GB, SSD e 1 Gb/s. Clique em um rack com espaço livre.' },
    { id: 'switch', cat: 'equip', group: 'Rede', name: 'Switch gerenciável 24p', mount: 'rack', thumb: 'unit-switch', price: 1500, desc: '24 portas de 1 Gb/s com console e uplink de 10 Gb/s. Clique em um rack com espaço livre.' },
    { id: 'patch', cat: 'equip', group: 'Rede', name: 'Patch panel', mount: 'rack', thumb: 'unit-patch', price: 300, desc: 'Painel de passagem: organiza os cabos entre servidores e switch.' },
    { id: 'monitor', cat: 'equip', group: 'Estações', name: 'Monitor', mount: 'surface', price: 350, desc: 'Coloque sobre uma mesa. Com uma cadeira em frente vira estação.' },
    { id: 'storage', cat: 'equip', group: 'Storage', name: 'Storage SAN', price: 26000, desc: '96 TB úteis em iSCSI 2× 25 Gb/s. Gaveta de discos para os dados da sala.' },
    { id: 'crac', cat: 'equip', group: 'Racks', name: 'Ar de precisão', price: 9000, desc: 'Refrigeração para o corredor frio. Depois de instalado dá para melhorar o modelo (clique nele): in-row, chiller, líquida e crio, liberados pela sua patente.' },
    { id: 'table', cat: 'furn', group: 'Mesas', name: 'Mesa', w: 2, h: 1, price: 400, desc: 'Superfície para monitores, café e vasos.' },
    { id: 'chair', cat: 'furn', group: 'Cadeiras', name: 'Cadeira', solid: false, price: 250, desc: 'Em frente a uma mesa com monitor, vira estação.' },
    { id: 'sofa', cat: 'furn', group: 'Sofás', name: 'Sofá', w: 2, h: 1, price: 1200, desc: 'Canto de descanso da equipe.' },
    { id: 'shelf', cat: 'furn', group: 'Estantes', name: 'Estante', price: 450, desc: 'Manuais, pastas e caixas de cabos.' },
    { id: 'whiteboard', cat: 'furn', group: 'Escritório', name: 'Quadro branco', w: 2, h: 1, price: 300, desc: 'Para desenhar topologias.' },
    { id: 'plant', cat: 'deco', group: 'Plantas', name: 'Planta', price: 80, desc: 'Um pouco de verde na sala.' },
    { id: 'vase', cat: 'deco', group: 'Plantas', name: 'Vaso', mount: 'surface', price: 40, desc: 'Vai em cima de uma mesa.' },
    { id: 'coffee', cat: 'deco', group: 'Escritório', name: 'Cafeteira', mount: 'surface', price: 150, desc: 'Vai em cima de uma mesa.' },
    { id: 'water', cat: 'deco', group: 'Escritório', name: 'Bebedouro', price: 220, desc: 'Água gelada para o turno.' },
    { id: 'lamp', cat: 'deco', group: 'Luminárias', name: 'Luminária', price: 120, desc: 'Luz quente de piso.' },
    { id: 'rug', cat: 'deco', group: 'Tapetes', name: 'Tapete', w: 2, h: 2, solid: false, price: 200, desc: 'Fica por baixo dos móveis.' },
    { id: 'bin', cat: 'deco', group: 'Escritório', name: 'Lixeira', price: 30, desc: 'Organização também é infraestrutura.' },
    // doors live in the Espaços tab (they go on a wall, not on the floor)
    { id: 'door', cat: 'wall', name: 'Porta', mount: 'wallslot', len: 1, price: 600, desc: 'Vai sobre uma parede interna e abre passagem.' },
    { id: 'door2', cat: 'wall', name: 'Porta dupla', mount: 'wallslot', len: 2, price: 900, desc: 'Porta de duas folhas, ocupa 2 tiles de parede.' },
  ];
  // more models and furniture (hardware.js, furniture.js), then the themed objects (decor.js)
  for (const d of (DL.HW_CATALOG || []).concat(DL.FURN_CATALOG || [], DL.DECO_CATALOG || [], DL.PROPS_CATALOG || [])) CATALOG.push(d);
  const THEME_PRICE = { rug_robot: 300, rug_claude: 300, rug_gpt: 300, rug_rgb: 450, poster: 60, neon: 250, clock: 70, arcade: 2500, beanbag: 180, ledtube: 160, pcgamer: 3800, hologram: 1900, toolcart: 650, bonsai: 90, banner: 220 };
  for (const d of DL.DECOR_CATALOG || []) CATALOG.push(Object.assign({ price: THEME_PRICE[d.id] || 100 }, d));
  // the shop's cosmetic furniture (cosm-furniture.js): bought with Gold, placed for free
  for (const d of DL.COSM_CATALOG || []) CATALOG.push(d);
  // everything turns (rack units live inside a rack, so they don't)
  for (const d of CATALOG) if (d.rot == null) d.rot = d.mount !== 'rack';
  const DEF = {};
  for (const d of CATALOG) DEF[d.id] = d;
  DL.CATALOG = CATALOG;
  DL.CATALOG_DEF = DEF;

  // Items unlock with the player's level (career.js): a new game starts with only the basics and the
  // rest opens as the career goes on. UNLOCK names the level of the key items; anything else is placed
  // by its price (equipment and the rest have their own bands). Doors are always available.
  const UNLOCK = {
    // nível 1: o mínimo para montar a primeira sala
    rack: 1, desk1: 1, desk: 1, srv_basic: 1, server: 1, sw_8: 1, switch: 1, patch: 1, monitor: 1,
    table: 1, chair: 1, plant: 1, bin: 1,
    // 2: servidores com switch (Júnior I) · 3: cabos · 4: terminal · 5: problemas
    desksupport: 2, deskoffice: 2, sw_16: 2, laptop: 2, crac: 2,
    desktech: 2, desk3: 2, nas_2: 2,
    sw_24poe: 3, ap: 3, camera: 3, netcab: 3, kvm: 3, ventile: 3,
    desk4: 4, deskadmin: 4, sw_48: 4, nas_4: 4, pdu: 4,
    srv_adv: 5, desknoc: 5, deskwork: 5, serverlift: 5,
    // 6: 8 servidores · 7: ordens · 8: sênior · 9: especialista · 10: tech lead
    sw_10g: 6, nas_8: 6, ups: 6, sw_48poe: 6,
    srv_hi: 7, storage: 7, fm200: 7, tapelib: 8,
    sw_25g: 8, deskgamer: 8, deskgamerpc: 8, deskstream: 8,
    srv_gpu: 9, st_flash: 10,
  };
  const BANDS_EQUIP = [[2000, 2], [5000, 4], [15000, 6], [40000, 8]];
  const BANDS_OTHER = [[400, 2], [900, 4], [2000, 6]];
  DL.unlockLevel = function (def) {
    if (!def || def.cat === 'wall' || def.cosm) return 1;
    if (UNLOCK[def.id]) return UNLOCK[def.id];
    const p = def.price || 0;
    for (const [max, lvl] of def.cat === 'equip' ? BANDS_EQUIP : BANDS_OTHER) if (p <= max) return lvl;
    return def.cat === 'equip' ? 10 : 8;
  };

  const NAMES = {
    rack: 'Rack', switch: 'Switch', router: 'Roteador', core: 'Switch core', storage: 'Storage', crac: 'Ar de precisão', ups: 'Nobreak',
    desk: 'Computador', chair: 'Cadeira', plant: 'Planta', table: 'Mesa', monitor: 'Monitor', sofa: 'Sofá', shelf: 'Estante',
    water: 'Bebedouro', whiteboard: 'Quadro branco', rug: 'Tapete', lamp: 'Luminária', coffee: 'Cafeteira', vase: 'Vaso', bin: 'Lixeira',
    door: 'Porta', wallseg: 'Parede',
  };
  Object.assign(NAMES, DL.DECOR_NAMES || {}, DL.HW_NAMES || {});
  const SETUP_NAMES = Object.assign({ mono1: 'Mesa · 1 monitor', mono3: 'Mesa · 3 monitores', mono4: 'Mesa · 4 monitores', gamer: 'Setup gamer', gamerpc: 'Setup com PC gamer', tech: 'Estação técnica', noc: 'Estação de NOC', admin: 'Estação de administrador', support: 'Estação de atendimento' }, DL.PROPS_SETUP_NAMES || {});
  DL.SETUP_NAMES = SETUP_NAMES;
  DL.itemName = (e) => {
    if (e.kind === 'door' && e.len > 1) return 'Porta dupla';
    if (e.kind === 'desk' && SETUP_NAMES[e.setup]) return SETUP_NAMES[e.setup];
    if (e.kind === 'storage' && e.model && DL.hwModel) return DL.hwModel('storage', e.model).name;
    if (e.kind === 'crac' && e.model && DL.cracModel) return DL.cracModel(e).name;
    const d = e.defId && DEF[e.defId];
    return d && d.kind ? d.name : NAMES[e.kind] || (d && d.name) || e.kind;
  };
  // the inspector can swap a desk's setup in place (same footprint, same station)
  if (DL.ITEM_STYLES && DL.ITEM_STYLES.desk && !DL.ITEM_STYLES.desk.some((o) => o.key === 'setup')) {
    DL.ITEM_STYLES.desk.unshift({ key: 'setup', label: 'Setup', options: [['', '2 mon.'], ['mono1', '1 mon.'], ['mono3', '3 mon.'], ['mono4', '4 mon.'], ['gamer', 'Gamer'], ['gamerpc', 'PC gamer'], ['tech', 'Técnica'], ['noc', 'NOC'], ['admin', 'Admin'], ['support', 'Atendimento']] });
  }
  // the bigger catalog's inspector options (props.js)
  if (DL.applyPropsStyles) DL.applyPropsStyles();
  // rugs lie under everything; wall pieces hang on the north wall (neither blocks the floor)
  const isRug = (e) => e.kind === 'rug' || !!e.rug;

  function initTel(e, temp, power, unit, jitter) {
    e.tel = { temp, power, unit, jitter };
    e.temp = temp;
    e.power = power;
    e.hist = { temp: [], power: [] };
    for (let i = 0; i < 40; i++) {
      e.hist.temp.push(temp + (DL.hash(e.seed * 3 + i) - 0.5) * jitter * 3);
      e.hist.power.push(power * (1 + (DL.hash(e.seed * 5 + i) - 0.5) * 0.04));
    }
    e.uptime = 1;
  }

  function syncRack(e) {
    const n = e.units.filter(Boolean).length;
    e.servers = [];
    e.units.forEach((u, k) => {
      if (u) e.servers.push({ u: 'U' + String(40 - k * 4).padStart(2, '0'), host: (u === 'switch' ? 'sw-' : u === 'patch' ? 'pp-' : 'srv-') + e.id.slice(-2).toLowerCase() + '-' + (k + 1) });
    });
    // the rack's draw is what is installed in it (hardware.js models); heat follows the load
    let kw = 0.3;
    e.units.forEach((u, k) => {
      if (!u) return;
      const m = DL.hwModel ? DL.hwModel(u, e.unitModel && e.unitModel[k]) : null;
      kw += m && m.power != null ? m.power : 0.42;
    });
    e.tel.power = Math.round(kw * 100) / 100;
    e.tel.temp = Math.round((24 + (kw - 0.3) * 1.6 + n * 0.25) * 10) / 10;
  }
  DL.syncRack = syncRack;

  DL.createBuilder = function (game) {
    const scene = game.scene, world = scene.world;
    const $ = (id) => document.getElementById(id);
    const el = {
      dock: $('build'), items: $('buildItems'), room: $('buildRoom'), style: $('buildStyle'), hint: $('buildHint'), insp: $('inspector'), tip: $('ghostTip'),
      tools: $('buildTools'), keys: $('buildKeys'), search: $('buildSearch'), ask: $('buildAsk'), cash: $('buildCash'), sess: $('buildSession'),
      tray: $('buildTray'), find: $('buildFind'), findBtn: $('buildFindBtn'), cur: $('buildCur'), help: $('buildHelp'), helpBtn: $('buildHelpBtn'),
    };
    const B = {
      active: false, tab: 'room', tool: 'select', def: null, rot: 0,
      roomTool: 'select', wallMat: 'solid', wd: null, shift: false, draw: null, resize: null, roomHover: null, roomReason: null, previewKey: '',
      ghost: null, move: null, sel: null, hover: null, roomIdx: 1,
      mouse: null, down: null, pan: null,
      closed: false, roomMore: false,
    };
    // the dock folded away (Q) and "Mais" open or shut are remembered between sessions
    const DOCK_KEY = 'datalab.buildDock';
    try { const d = JSON.parse(localStorage.getItem(DOCK_KEY) || '{}'); B.closed = !!d.closed; B.roomMore = !!d.more; } catch (e) { /* storage blocked: defaults */ }
    const saveDock = () => { try { localStorage.setItem(DOCK_KEY, JSON.stringify({ closed: B.closed, more: B.roomMore })); } catch (e) { /* private mode */ } };
    // show the selected room whole above the catalog (demo.js glides there, zooming out only if it must)
    function showRoom() {
      const r = B.tab === 'room' && world.rooms[B.roomIdx];
      if (r && game.focusArea) game.focusArea(r.x * T, r.y * T, r.w * T, r.h * T);
    }
    // The item strip: folded by the player (Q, or the open category clicked again) or by itself while an
    // item is in the hand (B.auto). Esc, Tab, the right button or a category click bring it back.
    function syncTray() {
      const folded = B.closed || (B.auto && !!B.def);
      el.dock.classList.toggle('is-folded', folded);
      el.dock.classList.toggle('is-userfold', B.closed);
      if (el.tray) el.tray.setAttribute('aria-hidden', folded ? 'true' : 'false');
      if (folded) hideTipCard();
    }
    function setClosed(v) {
      B.closed = !!v;
      if (!B.closed) B.auto = false;
      syncTray();
      saveDock();
    }
    function unfold() { B.auto = false; if (B.closed) setClosed(false); else syncTray(); }
    let seedN = 400;
    // Shift while dragging a wall erases instead of building
    addEventListener('keydown', (ev) => { if (ev.key === 'Shift') B.shift = true; });
    addEventListener('keyup', (ev) => { if (ev.key === 'Shift') B.shift = false; });
    addEventListener('blur', () => { B.shift = false; });

    /* ---------- items ---------- */
    function nextId(prefix, start) {
      for (let n = start || 1; ; n++) {
        const id = prefix + String(n).padStart(2, '0');
        if (!world.byId[id]) return id;
      }
    }

    function newItem(def, tx, ty, rot, preview) {
      const k = def.kind || def.id;
      const e = { kind: k, defId: def.id, tx, ty, tw: def.w || 1, th: def.h || 1, rot: def.rot ? rot || 0 : 0, solid: def.solid !== false, seed: preview ? 77 : seedN++ * 7 + 3, state: 'ok', built: true };
      if (def.set) Object.assign(e, JSON.parse(JSON.stringify(def.set)));
      if (def.mount === 'surface') e.solid = false;
      if (def.mount === 'wall') { e.wall = true; e.solid = false; }
      if (def.rug) e.rug = true;
      // turned to the east / west, a non-square floor footprint runs the other way
      if (DL.rotSide(e.rot) && !e.wall) { const w = e.tw; e.tw = e.th; e.th = w; }
      if (k === 'desk') e.chair = { kind: 'chair', tw: 2, th: 1, rot: e.rot, solid: false, parent: e, seed: e.seed + 1, built: true };
      if (k === 'desk' && def.setup) e.setup = def.setup;
      if (k === 'desk' && def.chair) e.chair.variant = def.chair;
      if (k === 'rack') { e.units = new Array(9).fill(null); e.unitModel = new Array(9).fill(null); }
      if (!preview) {
        if (k === 'rack') {
          e.id = nextId('RACK-N');
          Object.assign(e, { name: 'Rack ' + e.id.slice(5), short: e.id.slice(5), category: 'Rack de servidores' });
          initTel(e, 24, 0.3, 'kW', 0.2);
          syncRack(e);
        } else if (k === 'desk') {
          e.id = nextId('PC-');
          Object.assign(e, { name: 'Estação de trabalho', category: 'Computador' });
          initTel(e, 44, 120, 'W', 0.8);
        } else if (k === 'storage') {
          e.id = nextId('ST-', 5);
          const m = DL.hwModel('storage', e.model);
          Object.assign(e, { name: m.name + ' ' + e.id, category: 'Storage' });
          initTel(e, m.power < 0.2 ? 34 : 29, m.power, 'kW', 0.2);
        } else if (k === 'crac') {
          e.id = nextId('CRAC-', 4);
          Object.assign(e, { name: 'Ar-condicionado de precisão', category: 'Refrigeração' });
          initTel(e, 18.2, 6.2, 'kW', 0.15);
        }
      }
      return e;
    }

    function pos(e) {
      e.px = e.tx * T;
      e.py = e.ty * T;
      e.sortY = e.py + e.th * T;
      if (e.kind === 'chair') {
        e.cx = e.px + e.tw * 8;
        e.cy = e.py + (e.th - 1) * 8 + 11;
        e.sortY = e.cy;
      }
      if (isRug(e)) e.sortY = -100000 + e.py;
      if (e.wall) e.sortY = e.py - 6;
      if (e.host) e.sortY = e.host.sortY + (e.kind === 'monitor' && e.rot === 1 ? 0.6 : 0.01);
      DL.itemGeom(e);
      if (e.chair) {
        // the chair sits on the desk's front side: south (0), north (1), east (2) or west (3)
        const c = e.chair, r = e.rot | 0, side = DL.rotSide(r);
        c.rot = r;
        c.tw = side ? 1 : 2;
        c.th = side ? 2 : 1;
        c.tx = r === 2 ? e.tx + e.tw : r === 3 ? e.tx - 1 : e.tx;
        c.ty = r === 1 ? e.ty - 1 : r === 0 ? e.ty + e.th : e.ty;
        pos(c);
      }
      for (const s of surfaceOf(e)) {
        s.tx = e.tx + s.dx;
        s.ty = e.ty + s.dy;
        pos(s);
      }
    }

    const surfaceOf = (e) => (e.kind === 'table' ? world.items.filter((s) => s.host === e) : []);
    const groupOf = (e) => [e].concat(e.chair ? [e.chair] : [], surfaceOf(e));
    function cells(e) {
      const out = [];
      if (e.host) return out;
      // an L table leaves its inner corner free (for the chair)
      const hole = DL.itemHole ? DL.itemHole(e) : null;
      for (let j = 0; j < e.th; j++) for (let i = 0; i < e.tw; i++) if (!hole || hole[0] !== i || hole[1] !== j) out.push([e.tx + i, e.ty + j]);
      return out;
    }

    function lockReason(e) {
      if (!e || SKIP[e.kind]) return 'Este elemento faz parte da sala';
      return game.lockReason ? game.lockReason(e) : null;
    }

    // cosmetic furniture (the shop's Cosméticos tab, cosm-furniture.js): placed only once bought, one of
    // each in the map; the shop item has the def's id
    const isCosm = (e) => { const d = e && ((e.defId && DEF[e.defId]) || DEF[e.kind]); return !!(d && d.cosm); };
    function cosmState(def) {
      if (world.items.some((x) => x.defId === def.id)) return 'placed';
      return DL.Inventory && DL.Inventory.owns(def.id) ? 'free' : 'locked';
    }

    function actorCells(skip) {
      const set = new Set();
      // build mode hides everyone (demo.js): nobody blocks a placement then (whoever ends up under an
      // object is moved to the nearest free spot: game.unstick, on commit)
      if (B.active) return set;
      for (const a of game.actors()) {
        if (a.hidden || (skip && skip(a))) continue;
        for (const [ox, oy] of [[-5, -4], [5, -4], [-5, -1], [5, -1]]) set.add(Math.floor((a.x + ox) / T) + ',' + Math.floor((a.y + oy) / T));
      }
      return set;
    }

    // Returns null when the group can sit where it is, or a short reason why not.
    function check(group, exclude, skipActor) {
      if (group.length === 1 && group[0].kind === 'door') return doorCheck(group[0]);
      const occ = new Map(), rug = new Map(), wall = new Map();
      for (const e of world.items) {
        if (exclude.has(e) || e.host || SKIP[e.kind]) continue;
        const m = isRug(e) ? rug : e.wall ? wall : occ;
        for (const [x, y] of cells(e)) m.set(x + ',' + y, e);
      }
      const people = actorCells(skipActor);
      const tileAt = (x, y) => (x < 0 || y < 0 || x >= world.W || y >= world.H ? '#' : world.tiles[y * world.W + x]);
      for (const e of group) {
        const layer = isRug(e) ? rug : e.wall ? wall : occ;
        for (const [x, y] of cells(e)) {
          if (x < 0 || y < 0 || x >= world.W || y >= world.H) return 'Fora da sala';
          const k = x + ',' + y, t = world.tiles[y * world.W + x];
          if (e.wall) {
            if (!FLOOR[t]) return 'Fora da sala';
            if (tileAt(x, y - 1) !== '#' || tileAt(x, y - 2) !== '#') return 'Encoste na parede do fundo da sala';
            if (layer.has(k)) return 'Já tem algo nesta parede';
            continue;
          }
          if (t === 'd' || t === 'D' || world.keepClear.has(k)) return 'Deixe a passagem da porta livre';
          if (t === 'w') return 'Tem uma parede aqui';
          if (!FLOOR[t]) return 'Fora da sala';
          if (layer.has(k)) return 'Espaço ocupado';
          if (!isRug(e) && people.has(k)) return 'Tem alguém neste lugar';
        }
      }
      // cosmetic furniture never stands where the crew works on the equipment: in front of a rack,
      // a storage or the precision air (the side its front faces)
      const standing = group.filter((e) => isCosm(e) && !e.wall && !isRug(e));
      if (standing.length) {
        const front = new Set();
        for (const r of world.items) {
          if (exclude.has(r) || (r.kind !== 'rack' && r.kind !== 'storage' && r.kind !== 'crac')) continue;
          const o = r.rot | 0;
          for (let j = 0; j < r.th; j++) for (let i = 0; i < r.tw; i++) {
            const x = r.tx + i, y = r.ty + j;
            front.add(o === 0 ? x + ',' + (r.ty + r.th) : o === 1 ? x + ',' + (r.ty - 1) : o === 2 ? (r.tx + r.tw) + ',' + y : (r.tx - 1) + ',' + y);
          }
        }
        for (const e of standing) for (const [x, y] of cells(e)) if (front.has(x + ',' + y)) return 'Deixe a frente dos racks e servidores livre';
      }
      return null;
    }

    function itemOnTile(tx, ty, pred) {
      for (const e of world.items) {
        if (e.host || SKIP[e.kind] || (pred && !pred(e))) continue;
        const hole = DL.itemHole ? DL.itemHole(e) : null;
        if (hole && tx === e.tx + hole[0] && ty === e.ty + hole[1]) continue;
        if (tx >= e.tx && tx < e.tx + e.tw && ty >= e.ty && ty < e.ty + e.th) return e;
      }
      return null;
    }

    // isometric: what is drawn under the cursor (tall things cover the floor behind them);
    // undefined when the point did not come from the mouse (automated placement)
    const underMouse = (wx, wy, pred) => {
      const m = B.mouse;
      if (!scene.iso || !m || m.wx !== wx || m.wy !== wy) return undefined;
      return scene.pickAt(m.sx, m.sy, pred);
    };

    function pick(wx, wy) {
      const hit = underMouse(wx, wy, (e) => !SKIP[e.kind] && !!e.bounds && world.items.indexOf(e) >= 0);
      if (hit) return hit.parent || hit;
      // a wall piece left standing alone (a loose post) can be picked, so it can be removed: by its foot
      // or (seen in 3D) by its middle
      const m = B.mouse, mid = scene.iso && m && m.wx === wx && m.wy === wy ? scene.screenToWorld(m.sx, m.sy, 16) : null;
      const post = world.items.find((p) => lonePost(p) && [[wx, wy], mid && [mid.x, mid.y]].some((q) => q && Math.floor(q[0] / T) === p.tx && Math.floor(q[1] / T) === p.ty));
      if (post) return post;
      if (hit !== undefined) return null;
      const list = world.items.filter((e) => !SKIP[e.kind] && e.bounds).sort((a, b) => b.sortY - a.sortY);
      for (const e of list) {
        const b = e.bounds;
        if (wx >= b.x && wx < b.x + b.w && wy >= b.y && wy < b.y + b.h) return e.parent || e;
      }
      const e = itemOnTile(Math.floor(wx / T), Math.floor(wy / T));
      return e ? e.parent || e : null;
    }
    // a wall tile with no wall on any side: drawn as a lone post
    function lonePost(e) { return !!e && e.kind === 'wallseg' && !e.l && !e.r && !e.u && !e.d; }
    function removePost(e) {
      return rec(true, 'Apagar coluna', () => {
        world.wallSet.delete(tkey(e.tx, e.ty));
        if (B.sel === e) select(null);
        commit({ layout: true, walls: true });
        game.sfx('remove');
      });
    }

    /* ---------- commit ---------- */
    function commit(info) {
      info = info || {};
      const door = (l) => l && l.some((x) => x.kind === 'door');
      if (info.layout || door(info.added) || door(info.removed)) { info.layout = true; layout(world); }
      rebuildSolid(world);
      refreshIndex(world);
      world.version = (world.version || 0) + 1;
      scene.refreshWorld(!!info.layout);
      // building: someone (hidden) standing where an object or a wall just went steps to the nearest free
      // spot, before the crew plans its routes again (demo.js)
      if (B.active && game.unstick) game.unstick();
      game.emit('world', info);
    }

    /* ---------- undo / redo: what the player did in this build session ---------- */
    // Each action keeps a picture of the map before and after it (which objects exist and where they
    // stand; for rooms and walls also the floor plan) and the money it moved. Undo puts the "before"
    // back and returns the money in full; redo does it again. The list is cleared when the player
    // confirms (or leaves build mode), so nothing reaches the save until then (see DL.buildBusy).
    const KEEP = ['tx', 'ty', 'rot', 'tw', 'th', 'host', 'dx', 'dy', 'axis', 'len', 'open', 'hold', 'cost'];
    const H = { undo: [], redo: [], open: null, cap: null, busy: false };
    game.on('purchase', (i) => { if (H.cap && i.src === 'build') H.cap.push(['purchase', i]); });
    game.on('refund', (i) => { if (H.cap && i.src === 'build') H.cap.push(['refund', i]); });
    const roomCopy = (r) => Object.assign({}, r, r.style ? { style: JSON.parse(JSON.stringify(r.style)) } : {});
    function snap(struct) {
      const st = new Map();
      for (const e of world.items) {
        if (SKIP[e.kind] && e.kind !== 'videowall') continue;
        const o = {};
        for (const k of KEEP) o[k] = e[k];
        if (e.units) { o.units = e.units.slice(); o.unitModel = e.unitModel ? e.unitModel.slice() : null; o.unitCost = e.unitCost ? e.unitCost.slice() : null; }
        st.set(e, o);
      }
      const s = { items: Array.from(st.keys()), st, ops: game.ops && game.ops.keep ? game.ops.keep() : null };
      if (struct) {
        Object.assign(s, {
          areas: world.areas.map((a) => Object.assign({}, a)), wallSet: new Map(world.wallSet), gapsSeen: new Set(world.gapsSeen || []),
          rooms: world.rooms.map(roomCopy), roomAt: world.roomAt.slice(), W: world.W, H: world.H,
        });
      }
      return s;
    }
    function restore(s, keepLook) {
      world.items = s.items.slice();
      for (const [e, o] of s.st) {
        for (const k of KEEP) { if (o[k] === undefined) delete e[k]; else e[k] = o[k]; }
        if (o.units) {
          e.units = o.units.slice();
          if (o.unitModel) e.unitModel = o.unitModel.slice();
          if (o.unitCost) e.unitCost = o.unitCost.slice();
          syncRack(e);
        }
      }
      if (s.areas) {
        // the room's look chosen later (Estilo da sala) stays; the rest of the plan goes back
        const look = keepLook ? new Map(world.rooms.map((r) => [r.id, r])) : null;
        world.areas = s.areas.map((a) => Object.assign({}, a));
        world.wallSet = new Map(s.wallSet);
        world.gapsSeen = new Set(s.gapsSeen);
        world.rooms = s.rooms.map(roomCopy);
        world.roomAt = s.roomAt.slice();
        world.W = s.W;
        world.H = s.H;
        layout(world);
        if (look) for (const r of world.rooms) { const c = look.get(r.id); if (c) { r.theme = c.theme; if (c.style) r.style = c.style; else delete r.style; } }
      }
      for (const e of world.items) if (!e.parent && !e.host) pos(e);
      for (const e of world.items) if (e.host) pos(e);
      // racks put back keep their configured servers and cables (ops.js)
      if (s.ops && game.ops.merge) game.ops.merge(s.ops);
      commit({ layout: true, undo: true });
      if (B.sel && world.items.indexOf(B.sel) < 0) select(null);
      else if (B.sel) renderInspector();
      renderRoom();
      renderCatalogSoon();
    }
    // begin … end around one action (nested actions belong to the outer one)
    function begin(struct, label) {
      if (!B.active || B.free || H.busy || H.open) return null;
      H.open = { before: snap(struct), struct: !!struct, label, v: world.version, money: [] };
      H.cap = H.open.money;
      return H.open;
    }
    function end() {
      const o = H.open;
      if (!o) return;
      H.open = null;
      H.cap = null;
      if (world.version === o.v) return;
      o.after = snap(o.struct);
      H.undo.push(o);
      if (H.undo.length > 100) H.undo.shift();
      H.redo = [];
      syncHist();
    }
    function abort() { H.open = null; H.cap = null; }
    function rec(struct, label, fn) {
      const own = begin(struct, label);
      try { return fn(); } finally { if (own) end(); }
    }
    // an action that only changes a value (an object's colour): undone by setting it back
    function recSmall(label, undoFn, redoFn) {
      if (!B.active || H.busy) return;
      H.undo.push({ label, money: [], undoFn, redoFn });
      H.redo = [];
      syncHist();
    }
    const moneyOf = (o) => o.money.reduce((s, [k, i]) => s + (k === 'purchase' ? (i.kit ? 0 : i.price || 0) : -(i.amount || 0)), 0);
    // what this session has cost so far (purchases minus sales still on the undo list)
    const sessionCost = () => H.undo.reduce((s, o) => s + moneyOf(o), 0);
    function undo() {
      if (H.open || B.move) { if (B.move) cancelMove(); abort(); }
      const o = H.undo.pop();
      if (!o) { nope('Nada para desfazer'); return false; }
      H.busy = true;
      try {
        if (o.undoFn) o.undoFn();
        else restore(o.before, true);
        for (const [k, i] of o.money.slice().reverse()) game.emit(k + '-undo', i);
      } finally { H.busy = false; }
      H.redo.push(o);
      syncHist();
      game.sfx('remove');
      tip('Desfeito · ' + o.label);
      return true;
    }
    function redo() {
      if (B.move) cancelMove();
      abort();
      const o = H.redo[H.redo.length - 1];
      if (!o) { nope('Nada para refazer'); return false; }
      const co = company(), need = moneyOf(o);
      if (co && need > 0 && co.cash < need) { nope('Saldo insuficiente para refazer · custa ' + DL.money(need)); return false; }
      H.redo.pop();
      H.busy = true;
      try {
        if (o.redoFn) o.redoFn();
        else restore(o.after, true);
        for (const [k, i] of o.money) { delete i.kit; game.emit(k, i); }
      } finally { H.busy = false; }
      H.undo.push(o);
      syncHist();
      game.sfx('place');
      tip('Refeito · ' + o.label);
      return true;
    }
    function clearHist() { H.undo = []; H.redo = []; abort(); syncHist(); }
    function tip(t) { B.tipUntil = performance.now() + 1100; B.tipText = t; B.tipOk = true; }
    // the save waits while there is something to undo (demo autosave, save-service.js)
    DL.buildBusy = () => B.active && H.undo.length > 0;

    /* ---------- actions ---------- */
    function ghostAt(wx, wy) {
      const g = ghostAt0(wx, wy), def = B.def;
      if (g.e && B.copy) { for (const k in B.copy) DL.itemStyleSet(g.e, k, B.copy[k]); pos(g.e); }
      // not enough cash: the ghost turns red with the reason (before the click, not after)
      if (!g.reason && def && def.price && !def.cosm && !B.free) {
        const p = priceOf(def), co = company();
        if (p && co && co.cash < p) g.reason = 'Saldo insuficiente · falta ' + DL.money(p - co.cash);
      }
      return g;
    }
    function ghostAt0(wx, wy) {
      const def = B.def;
      const m = B.mouse, live = scene.iso && m && m.wx === wx && m.wy === wy;
      if (live && def.mount === 'wall') {
        // aim at the back wall itself, not at the floor behind it
        const p = scene.wallPointAt(m.sx, m.sy);
        if (p) { wx = p.x; wy = p.y; }
      }
      let tx = Math.floor(wx / T), ty = Math.floor(wy / T);
      if (live && (def.mount === 'rack' || def.mount === 'surface')) {
        const host = scene.pickAt(m.sx, m.sy, (e) => (def.mount === 'rack' ? e.kind === 'rack' && !!e.units : e.kind === 'table'));
        if (host && def.mount === 'rack') { tx = host.tx; ty = host.ty; }
        if (host && def.mount === 'surface') {
          // the tile of the table top under the cursor
          const p = scene.screenToWorld(m.sx, m.sy, DL.isoSurfaceTop ? DL.isoSurfaceTop(host) : 12);
          tx = Math.max(host.tx, Math.min(host.tx + host.tw - 1, Math.floor(p.x / T)));
          ty = Math.max(host.ty, Math.min(host.ty + host.th - 1, Math.floor(p.y / T)));
        }
      }
      if (def.mount === 'wallslot') {
        const d = doorGhost(tx, ty, def.len, B.rot);
        return { e: d.e, group: [d.e], tx: d.e.tx, ty: d.e.ty, reason: d.reason };
      }
      if (def.mount === 'rack') {
        const r = itemOnTile(tx, ty, (e) => e.kind === 'rack' && !!e.units);
        let reason = null;
        if (!r) reason = 'Clique em um rack modular';
        else if (lockReason(r)) reason = lockReason(r);
        else if (r.units.indexOf(null) < 0) reason = 'Rack cheio';
        return { mount: r, tx, ty, reason };
      }
      if (def.mount === 'surface') {
        const table = itemOnTile(tx, ty, (e) => e.kind === 'table');
        const e = newItem(def, tx, ty, B.rot, true);
        let reason = null;
        if (!table) reason = 'Coloque sobre uma mesa';
        else if (world.items.some((s) => s.host && s.tx === tx && s.ty === ty)) reason = 'Já tem algo aqui';
        if (table) { e.host = table; e.dx = tx - table.tx; e.dy = ty - table.ty; }
        pos(e);
        return { e, group: [e], table, tx, ty, reason };
      }
      const e = newItem(def, 0, 0, B.rot, true);
      e.tx = Math.round(wx / T - e.tw / 2);
      e.ty = Math.round(wy / T - e.th / 2);
      pos(e);
      const group = [e].concat(e.chair ? [e.chair] : []);
      return { e, group, tx: e.tx, ty: e.ty, reason: check(group, new Set()) };
    }

    /* ---------- money: placing buys, removing sells back at half price ---------- */
    const RESALE = 0.5;
    const company = () => (game.economy && game.economy.company) || null;
    // the player's own placements are paid; presets and theme decoration (api.place) come free
    const priceOf = (def) => (game.economy && game.economy.priceOf ? game.economy.priceOf(def) : def.price || 0);
    function pay(def) {
      const price = priceOf(def);
      if (B.free || !def.price) return 0;
      if (!price) { game.emit('purchase', { price: 0, name: def.name, def, src: 'build' }); renderCatalogSoon(); return 0; }
      const co = company();
      if (co && co.cash < price) { nope('Saldo insuficiente · custa ' + DL.money(price)); return -1; }
      game.emit('purchase', { price, name: def.name, def, src: 'build' });
      return price;
    }
    // the player's level (career.js; without a career everything is open) and what a def needs
    const playerLevel = () => (game.career ? (game.career.done ? Infinity : game.career.level) : Infinity);
    const lockedLevel = (def) => { const n = DL.unlockLevel(def); return n > playerLevel() ? n : 0; };
    const renderCatalogSoon = () => setTimeout(() => { if (B.active && B.tab !== 'room' && B.tab !== 'style') renderCatalog(); }, 0);
    function refund(amount, name) {
      if (amount > 0 && !B.free) game.emit('refund', { amount: Math.round(amount * RESALE), name, src: 'build' });
    }
    const unitValue = (r, k) => (r.unitCost && r.unitCost[k]) || 0;

    function place() { return rec(false, 'Colocar ' + (B.def ? B.def.name : ''), place0); }
    function place0() {
      const gh = B.ghost;
      if (!gh) return;
      if (gh.reason) { nope(gh.reason); return; }
      const def = B.def;
      const cost = pay(def);
      if (cost < 0) return;
      if (def.mount === 'wallslot') {
        const d = makeDoor(gh.e.tx, gh.e.ty, gh.e.axis, gh.e.len, B.rot);
        d.cost = cost;
        world.items.push(d);
        commit({ added: [d] });
        game.sfx('place');
        return;
      }
      if (def.mount === 'rack') {
        const r = gh.mount, k = r.units.indexOf(null);
        r.units[k] = def.unit || def.id;
        r.unitModel = r.unitModel || new Array(9).fill(null);
        r.unitModel[k] = def.unit ? def.id : null;
        r.unitCost = r.unitCost || new Array(9).fill(0);
        r.unitCost[k] = cost;
        syncRack(r);
        commit({ installed: r });
        game.sfx('place');
        return;
      }
      const e = newItem(def, gh.tx, gh.ty, B.rot);
      e.cost = cost;
      if (B.copy) for (const k in B.copy) DL.itemStyleSet(e, k, B.copy[k]);
      if (def.mount === 'surface') { e.host = gh.table; e.dx = gh.tx - gh.table.tx; e.dy = gh.ty - gh.table.ty; }
      else { e.tx = gh.e.tx; e.ty = gh.e.ty; }
      pos(e);
      world.items.push(e);
      if (e.chair) world.items.push(e.chair);
      commit({ added: groupOf(e) });
      game.sfx('place');
      // a cosmetic is one of a kind: placed, it leaves the catalog's "no inventário" state
      if (def.cosm && !B.free) { B.def = null; B.ghost = null; select(e); syncUi(); renderCatalogSoon(); game.emit('inventory', { placed: def.id }); }
    }

    function removeItem(e) { return rec(false, 'Vender ' + (e ? DL.itemName(e.parent || e) : ''), () => removeItem0(e)); }
    function removeItem0(e) {
      if (!e) return;
      e = e.parent || e;
      const why = lockReason(e);
      if (why) { nope(why); return; }
      const group = groupOf(e);
      let back = 0;
      for (const x of group) {
        back += x.cost || 0;
        if (x.units) x.units.forEach((u, k) => { if (u) back += unitValue(x, k); });
      }
      world.items = world.items.filter((x) => group.indexOf(x) < 0);
      if (B.sel === e) select(null);
      commit({ removed: group });
      refund(back, DL.itemName(e));
      game.sfx('remove');
      if (isCosm(e)) {
        game.toast('info', 'Guardado', DL.itemName(e) + ' voltou para o inventário');
        renderCatalogSoon();
        game.emit('inventory', { stored: e.defId });
      }
    }

    function removeUnit(r) { return rec(false, 'Tirar unidade', () => removeUnit0(r)); }
    function removeUnit0(r) {
      const k = r.units.map(Boolean).lastIndexOf(true);
      if (k < 0) return;
      const back = unitValue(r, k), name = DL.hwModel ? DL.hwModel(r.units[k], r.unitModel && r.unitModel[k]).name : r.units[k];
      r.units[k] = null;
      if (r.unitModel) r.unitModel[k] = null;
      if (r.unitCost) r.unitCost[k] = 0;
      syncRack(r);
      commit({ installed: r });
      refund(back, name);
    }

    function startMove(e, drag) {
      e = e.parent || e;
      const why = lockReason(e);
      if (why) { nope(why); return; }
      const group = groupOf(e);
      begin(false, 'Mover ' + DL.itemName(e));
      B.move = {
        e, group, drag,
        orig: group.map((x) => ({ x, tx: x.tx, ty: x.ty, rot: x.rot, tw: x.tw, th: x.th, host: x.host, dx: x.dx, dy: x.dy, axis: x.axis })),
        offX: 0, offY: 0, reason: null,
      };
      if (B.mouse && !e.host && e.kind !== 'door') {
        B.move.offX = e.tx - Math.floor(B.mouse.wx / T);
        B.move.offY = e.ty - Math.floor(B.mouse.wy / T);
      }
      world.items = world.items.filter((x) => group.indexOf(x) < 0);
      select(null);
      if (B.tool !== 'move') B.tool = 'select';
      commit({ removed: group, moving: true });
      updateMove();
      syncUi();
    }

    function updateMove() {
      const m = B.move;
      if (!m || !B.mouse) return;
      const e = m.e, tx = Math.floor(B.mouse.wx / T), ty = Math.floor(B.mouse.wy / T);
      if (e.kind === 'door') {
        const d = doorGhost(tx, ty, e.len, e.rot);
        Object.assign(e, { tx: d.e.tx, ty: d.e.ty, axis: d.e.axis, tw: d.e.tw, th: d.e.th });
        pos(e);
        m.reason = d.reason;
        return;
      }
      if (e.host || (DEF[e.kind] && DEF[e.kind].mount === 'surface')) {
        const table = itemOnTile(tx, ty, (x) => x.kind === 'table');
        e.tx = tx; e.ty = ty;
        m.reason = !table ? 'Coloque sobre uma mesa' : world.items.some((s) => s.host && s.tx === tx && s.ty === ty) ? 'Já tem algo aqui' : null;
        if (table) { e.host = table; e.dx = tx - table.tx; e.dy = ty - table.ty; }
        pos(e);
        return;
      }
      e.tx = tx + m.offX;
      e.ty = ty + m.offY;
      pos(e);
      m.reason = check(m.group.filter((x) => !x.host), new Set(m.group));
    }

    function dropMove() {
      const m = B.move;
      if (!m) return;
      if (m.reason) {
        if (m.drag) cancelMove();
        else nope(m.reason);
        return;
      }
      B.move = null;
      world.items.push.apply(world.items, m.group);
      commit({ added: m.group, moved: true });
      end();
      select(m.e);
      game.sfx('place');
    }

    function cancelMove() {
      const m = B.move;
      if (!m) return;
      for (const o of m.orig) Object.assign(o.x, { tx: o.tx, ty: o.ty, rot: o.rot, tw: o.tw, th: o.th, host: o.host, dx: o.dx, dy: o.dy, axis: o.axis });
      B.move = null;
      world.items.push.apply(world.items, m.group);
      pos(m.e);
      commit({ added: m.group, moved: true });
      abort();
    }

    // Everything on the floor or on a wall turns (doors have their own four states); rack units turn
    // with their rack, the room's own pieces (walls, glass) don't.
    function canTurn(e) {
      if (!e || SKIP[e.kind] || e.kind === 'wallseg') return false;
      const def = (e.defId && DEF[e.defId]) || DEF[e.kind];
      return !(def && def.rot === false);
    }

    // Next orientation, clockwise seen from above (S → W → N → E). East / west swap the footprint of
    // non-square floor objects; whatever stands on a table keeps its place on the turned top.
    function turn(e) {
      const was = e.rot | 0, next = DL.ROT_NEXT[was];
      e.rot = next;
      if (!e.wall && DL.rotSide(was) !== DL.rotSide(next)) {
        const w = e.tw;
        e.tw = e.th;
        e.th = w;
        for (const s of surfaceOf(e)) { const d = s.dx; s.dx = s.dy; s.dy = d; }
      }
    }

    function rotate(e) { return rec(false, 'Girar ' + (e ? DL.itemName(e.parent || e) : ''), () => rotate0(e)); }
    function rotate0(e) {
      e = e.parent || e;
      if (!canTurn(e)) { nope('Este elemento faz parte da sala'); return; }
      const why = lockReason(e);
      if (why) { nope(why); return; }
      if (e.kind === 'door') {
        // 4 orientations: hinge left/right × swings to one side or the other
        e.rot = (e.rot + 1) % 4;
        e.open = 1;
        commit({ rotated: e });
        game.sfx('place');
        return;
      }
      const before = { rot: e.rot, tw: e.tw, th: e.th, s: surfaceOf(e).map((s) => [s, s.dx, s.dy]) };
      turn(e);
      pos(e);
      const group = groupOf(e);
      // whoever is seated at this very station doesn't block it: they get up once it turns
      const seatedHere = (a) => !!(a.crew && a.crew.station && group.indexOf(a.crew.station.key) >= 0);
      const why2 = e.host ? null : check(group.filter((x) => !x.host), new Set(group), seatedHere);
      if (why2) {
        Object.assign(e, { rot: before.rot, tw: before.tw, th: before.th });
        for (const [s, dx, dy] of before.s) { s.dx = dx; s.dy = dy; }
        pos(e);
        nope('Sem espaço para girar · ' + why2.toLowerCase());
        return;
      }
      commit({ rotated: e, moved: true, added: group, removed: group });
      game.sfx('place');
      B.tipUntil = performance.now() + 900;
      B.tipText = 'Girado · ' + DL.ROT_LABEL[e.rot | 0];
    }

    function nope(msg) {
      B.tipOk = false;
      B.tipUntil = performance.now() + 1400;
      B.tipText = msg;
      game.sfx('nope');
    }

    /* ---------- areas (floor) + rooms (what the walls enclose) ---------- */
    const cloneAreas = () => world.areas.map((r) => Object.assign({}, r));
    function roomName() {
      const used = new Set(world.rooms.map((r) => r.name).concat(world.areas.map((a) => a.name)));
      for (let n = world.rooms.length + 1; ; n++) if (!used.has('Sala ' + n)) return 'Sala ' + n;
    }
    const tileAt = (x, y) => (x < 0 || y < 0 || x >= world.W || y >= world.H ? '#' : world.tiles[y * world.W + x]);
    const roomIndexAt = (tx, ty) => (tx >= 0 && ty >= 0 && tx < world.W && ty < world.H ? world.roomAt[ty * world.W + tx] : -1);

    // The floor area a room mostly sits on (the one the size controls and edge handles act on).
    function areaOfRoom(i) {
      const r = world.rooms[i];
      if (!r) return -1;
      const cnt = new Map();
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          if (world.roomAt[y * world.W + x] !== i) continue;
          const a = world.areaAt[y * world.W + x];
          if (a >= 0) cnt.set(a, (cnt.get(a) || 0) + 1);
        }
      }
      let best = -1, bn = 0;
      for (const [a, n] of cnt) if (n > bn) { bn = n; best = a; }
      return best;
    }

    function occupied(opts) {
      const occ = new Set();
      for (const e of world.items) {
        if (e.host || SKIP[e.kind] || e.kind === 'door') continue;
        if (opts && opts.solidOnly && (isRug(e) || e.wall)) continue;
        for (const [x, y] of cells(e)) occ.add(tkey(x, y));
      }
      return occ;
    }

    // Dry run of a new area set (and lot). Returns { reason } or { tmp, lot } ready to apply.
    function planRooms(next, opts) {
      opts = opts || {};
      const lot = opts.lot || world.lot;
      for (const r of next) {
        if (r.w < LIM.minW || r.h < LIM.minH) return { reason: 'Tamanho mínimo: ' + LIM.minW + ' × ' + LIM.minH };
        if (r.w > LIM.maxW || r.h > LIM.maxH) return { reason: 'Tamanho máximo: ' + LIM.maxW + ' × ' + LIM.maxH };
        if (lot) {
          if (r.x < 1 || r.y < 2 || r.x + r.w + 1 > lot.w || r.y + r.h + 1 > lot.h) return { reason: 'Fora do terreno · expanda o terreno primeiro' };
        } else if (r.x + r.w + 1 > LIM.mapW || r.y + r.h + 1 > LIM.mapH) return { reason: 'Limite do terreno' };
      }
      for (let i = 0; i < next.length; i++) {
        for (let j = i + 1; j < next.length; j++) {
          if (tooClose(next[i], next[j])) return { reason: opts.overlap || 'Encostaria em outro espaço' };
        }
      }
      if (!connected(next)) return { reason: 'Encoste a área em outra, com uma parede entre elas' };
      const tmp = {
        areas: next, perf: world.perf, items: world.items, lot, wallSet: new Map(world.wallSet), gapsSeen: world.gapsSeen,
        rooms: world.rooms, roomAt: world.roomAt, W: world.W, H: world.H,
      };
      layout(tmp);
      doorsForFresh(tmp, occupied());
      for (const e of world.items) {
        if (e.host || SKIP[e.kind] || e.kind === 'door') continue;
        for (const [x, y] of cells(e)) {
          const t = x < tmp.W && y < tmp.H ? tmp.tiles[y * tmp.W + x] : '#';
          if (!FLOOR[t] || tmp.keepClear.has(tkey(x, y))) return { reason: opts.msg || 'Há objetos no caminho. Mova-os antes.' };
        }
      }
      // (while building nobody is in the way: see actorCells)
      if (!B.active) {
        for (const a of game.actors()) {
          const x = Math.floor(a.x / T), y = Math.floor((a.y - 2) / T);
          const t = x < tmp.W && y < tmp.H ? tmp.tiles[y * tmp.W + x] : '#';
          if (t === '#' || t === 'w') return { reason: 'Tem alguém nessa área' };
        }
      }
      return { tmp, lot };
    }

    function applyPlan(next, plan) {
      world.areas = next;
      world.wallSet = plan.tmp.wallSet;
      world.gapsSeen = plan.tmp.gapsSeen;
      world.items = plan.tmp.items.filter((e) => e.kind !== 'wallseg');
      if (plan.lot) world.lot = plan.lot;
      commit({ layout: true });
    }

    function tryRooms(next, msg, opts) { return rec(true, 'Mudar salas', () => tryRooms0(next, msg, opts)); }
    function tryRooms0(next, msg, opts) {
      const plan = planRooms(next, Object.assign({ msg }, opts));
      if (plan.reason) return nope(plan.reason), false;
      applyPlan(next, plan);
      game.sfx('place');
      return true;
    }

    const selArea = () => areaOfRoom(B.roomIdx);
    function selectRoomById(id) {
      const i = world.rooms.findIndex((r) => r.id === id);
      if (i >= 0) B.roomIdx = i;
    }

    function resizeRoom(i, dw, dh) {
      const ai = areaOfRoom(i), a = world.areas[ai];
      if (!a) return;
      if (a.fixed) { nope('O NOC tem tamanho fixo'); return; }
      const id = world.rooms[i].id;
      const next = cloneAreas();
      next[ai].w += dw;
      next[ai].h += dh;
      if (tryRooms(next, dw < 0 || dh < 0 ? 'Há objetos junto à parede. Mova-os antes de reduzir.' : null)) selectRoomById(id);
      renderRoom();
    }

    function setRoomRect(ai, rect) {
      const next = cloneAreas();
      Object.assign(next[ai], rect);
      const id = world.rooms[B.roomIdx] && world.rooms[B.roomIdx].id;
      const ok = tryRooms(next, 'Há objetos junto à parede. Mova-os antes de reduzir.');
      if (ok && id) selectRoomById(id);
      renderRoom();
      return ok;
    }

    function addRoom(i, side) {
      const r = world.areas[Math.max(0, areaOfRoom(i))];
      const nr = side === 'e'
        ? { x: r.x + r.w + 1, y: r.y, w: 9, h: Math.min(r.h, 10) }
        : { x: r.x, y: r.y + r.h + 1, w: Math.min(r.w, 12), h: 7 };
      Object.assign(nr, { id: newRoomId(), name: roomName(), floor: 'tile' });
      const next = cloneAreas();
      next.push(nr);
      if (tryRooms(next)) {
        selectRoomById(nr.id);
        game.toast('ok', 'Nova sala', nr.name + ' · ' + nr.w + ' × ' + nr.h);
        game.focus((nr.x + nr.w / 2) * T, (nr.y + nr.h / 2) * T);
      }
      renderRoom();
    }

    // A drawn rectangle touching another area edge-to-edge gives up one tile for the wall.
    function snapRect(rc) {
      const r = Object.assign({}, rc);
      for (const o of world.areas) {
        const ys = r.y < o.y + o.h && o.y < r.y + r.h, xs = r.x < o.x + o.w && o.x < r.x + r.w;
        if (ys && r.x === o.x + o.w) { r.x += 1; r.w -= 1; }
        if (ys && r.x + r.w === o.x) r.w -= 1;
        if (xs && r.y === o.y + o.h) { r.y += 1; r.h -= 1; }
        if (xs && r.y + r.h === o.y) r.h -= 1;
      }
      return r;
    }

    function drawRect() {
      const d = B.draw;
      return snapRect({ x: Math.min(d.x0, d.x1), y: Math.min(d.y0, d.y1), w: Math.abs(d.x1 - d.x0) + 1, h: Math.abs(d.y1 - d.y0) + 1 });
    }

    function planNewRoom(rc) {
      const nr = Object.assign({ id: 'new', name: roomName(), floor: 'tile' }, rc);
      return { nr, plan: planRooms(cloneAreas().concat(nr), { overlap: 'Sobrepõe outro espaço · deixe 1 tile de parede' }) };
    }

    function createRoom(rc) {
      const { nr, plan } = planNewRoom(rc);
      if (plan.reason) { nope(plan.reason); return false; }
      nr.id = newRoomId();
      const next = cloneAreas().concat(nr);
      if (!tryRooms(next)) return false;
      selectRoomById(nr.id);
      game.toast('ok', 'Nova sala', nr.name + ' · ' + nr.w + ' × ' + nr.h + ' · porta criada na divisória');
      renderRoom();
      return true;
    }

    function removeRoom(i) {
      const ai = areaOfRoom(i), r = world.areas[ai];
      if (!r || r.fixed || r.id === 'hall') { nope('Este espaço não pode ser removido'); return; }
      if (world.areas.length < 2) { nope('Mantenha pelo menos uma área'); return; }
      for (const e of world.items) {
        if (e.host || SKIP[e.kind] || e.kind === 'door') continue;
        if (cells(e).some(([x, y]) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h)) { nope('Esvazie a área antes de removê-la'); return; }
      }
      const next = cloneAreas();
      next.splice(ai, 1);
      if (tryRooms(next)) B.roomIdx = Math.min(B.roomIdx, world.rooms.length - 1);
      renderRoom();
    }

    function toggleFloor(i) { return rec(true, 'Trocar piso', () => toggleFloor0(i)); }
    function toggleFloor0(i) {
      const r = world.rooms[i];
      if (!r) return;
      r.floor = r.floor === 'carpet' ? 'tile' : 'carpet';
      commit({ layout: true });
      game.sfx('place');
      renderRoom();
    }

    // Land costs company money (economy.js): the starting lot is free, each expansion is paid per new m²
    // and gets dearer with the lot's size and the floor already built. `paid` = the player's buttons
    // (presets and automated checks call it free, like api.place).
    const builtArea = () => world.areas.reduce((s, a) => s + a.w * a.h, 0);
    function lotQuote(dw, dh) {
      if (!world.lot || (dw <= 0 && dh <= 0)) return 0;
      const eco = game.economy;
      if (eco && eco.lotCost) return eco.lotCost(world.lot, dw, dh, builtArea());
      return DL.lotPrice ? DL.lotPrice(world.lot, dw, dh, builtArea()) : 0;
    }
    function resizeLot(dw, dh, paid) {
      if (!world.lot) { nope('Este mapa não tem terreno livre'); return false; }
      const lot = { w: world.lot.w + dw, h: world.lot.h + dh };
      if (lot.w > LIM.mapW || lot.h > LIM.mapH) { nope('Limite do terreno: ' + LIM.mapW + ' × ' + LIM.mapH); return false; }
      if (lot.w < 6 || lot.h < 6) { nope('Terreno mínimo: 6 × 6'); return false; }
      const next = cloneAreas(), plan = planRooms(next, { lot });
      if (plan.reason) { nope(plan.reason); renderRoom(); return false; }
      const grow = dw > 0 || dh > 0;
      if (paid && grow && game.economy && game.economy.lotCharge) {
        const why = game.economy.lotCharge(world.lot, dw, dh, builtArea());
        if (why) { nope(why); game.toast('warn', 'Expansão recusada', why); renderRoom(); return false; }
      }
      applyPlan(next, plan);
      // land is paid on the server: what was built before it is confirmed (no undo past this point)
      clearHist();
      game.sfx('place');
      if (grow) game.focus(dw > 0 ? (lot.w - 3) * T : scene.cam.x, dh > 0 ? (lot.h - 3) * T : scene.cam.y);
      game.emit('lot', { lot: world.lot, dw, dh, paid: !!paid });
      renderRoom();
      return true;
    }

    /* ---------- room types (names + a matching look) ---------- */
    const ROOM_TYPES = [
      { id: 'noc', label: 'NOC', name: 'NOC', theme: 'noc', floor: 'carpet' },
      { id: 'servers', label: 'Servidores', name: 'Sala de servidores', theme: 'servers', floor: 'tile' },
      { id: 'office', label: 'Escritório', name: 'Escritório', theme: 'corporate', floor: 'carpet' },
      { id: 'reception', label: 'Recepção', name: 'Recepção', theme: 'minimal', floor: 'carpet' },
      { id: 'power', label: 'Sala elétrica', name: 'Sala elétrica', theme: 'industrial', floor: 'tile' },
      { id: 'support', label: 'Atendimento', name: 'Central de atendimento', theme: 'corporate', floor: 'carpet' },
      { id: 'custom', label: 'Personalizada', name: null, theme: null, floor: null },
    ];
    DL.ROOM_TYPES = ROOM_TYPES;
    const isDefaultName = (r) => /^(Sala|Corredor) \d+$/.test(r.name) || ROOM_TYPES.some((t) => t.name && (r.name === t.name || r.name.indexOf(t.name + ' ') === 0));

    function setRoomType(i, id) { return rec(true, 'Tipo da sala', () => setRoomType0(i, id)); }
    function setRoomType0(i, id) {
      const r = world.rooms[i], ty = ROOM_TYPES.find((t) => t.id === id);
      if (!r || !ty) return;
      r.type = id;
      if (ty.name && isDefaultName(r)) {
        const used = new Set(world.rooms.filter((x) => x !== r).map((x) => x.name));
        let n = ty.name;
        for (let k = 2; used.has(n); k++) n = ty.name + ' ' + k;
        r.name = n;
      }
      if (ty.theme && (!r.style || r.style.fromTheme)) { r.theme = ty.theme; delete r.style; }
      if (ty.floor) r.floor = ty.floor;
      commit({ layout: true, restyle: true });
      game.emit('style-room', B.roomIdx);
      game.sfx('place');
      renderRoom();
      if (id === 'custom') {
        const inp = el.room.querySelector('[data-room-name]');
        if (inp) { inp.focus(); inp.select(); }
      }
    }

    function renameRoom(i, name) { return rec(true, 'Renomear sala', () => renameRoom0(i, name)); }
    function renameRoom0(i, name) {
      const r = world.rooms[i];
      name = String(name || '').trim().slice(0, 24);
      if (!r || !name || name === r.name) return;
      r.name = name;
      commit({ renamed: r });
      renderRoom();
    }

    /* ---------- free walls: drag a straight line (or a box) on the grid ---------- */
    function linePath(x0, y0, x1, y1) {
      const pts = [];
      if (Math.abs(x1 - x0) >= Math.abs(y1 - y0)) { const s = Math.sign(x1 - x0) || 1; for (let x = x0; ; x += s) { pts.push([x, y0]); if (x === x1) break; } }
      else { const s = Math.sign(y1 - y0) || 1; for (let y = y0; ; y += s) { pts.push([x0, y]); if (y === y1) break; } }
      return pts;
    }
    function boxPath(x0, y0, x1, y1) {
      const ax = Math.min(x0, x1), bx = Math.max(x0, x1), ay = Math.min(y0, y1), by = Math.max(y0, y1);
      if (ax === bx || ay === by) return linePath(ax, ay, bx, by);
      const pts = [];
      for (let x = ax; x <= bx; x++) { pts.push([x, ay]); pts.push([x, by]); }
      for (let y = ay + 1; y < by; y++) { pts.push([ax, y]); pts.push([bx, y]); }
      return pts;
    }

    // Plan for the wall currently being dragged: each tile is new / skip / bad / del.
    function wallPlan(wd) {
      const erase = wd.erase;
      const pts = wd.box ? boxPath(wd.x0, wd.y0, wd.x1, wd.y1) : linePath(wd.x0, wd.y0, wd.x1, wd.y1);
      const axisOf = (x, y) => {
        if (wd.box) {
          const ax = Math.min(wd.x0, wd.x1), bx = Math.max(wd.x0, wd.x1), ay = Math.min(wd.y0, wd.y1), by = Math.max(wd.y0, wd.y1);
          return (y === ay || y === by ? 'h' : '') + (x === ax || x === bx ? 'v' : '');
        }
        return pts.length < 2 ? '' : pts[0][1] === pts[1][1] ? 'h' : 'v';
      };
      const occ = erase ? null : occupied(), people = erase ? null : actorCells();
      const tiles = [];
      let reason = null, n = 0;
      for (const [x, y] of pts) {
        const t = tileAt(x, y), k = tkey(x, y);
        let st = 'skip', why = null;
        if (erase) {
          if (t === 'w' || t === 'd' || t === 'D') st = 'del';
        } else if (t === '#' || t === 'w' || t === 'd' || t === 'D') st = 'skip';
        else if (occ.has(k)) { st = 'bad'; why = 'Tem um objeto no caminho da parede'; }
        else if (world.keepClear.has(k)) { st = 'bad'; why = 'Deixe a passagem da porta livre'; }
        else if (people.has(k)) { st = 'bad'; why = 'Tem alguém no caminho'; }
        else st = 'new';
        if (why && !reason) reason = why;
        if (st === 'new' || st === 'del') n++;
        tiles.push({ x, y, st, ax: axisOf(x, y), wall: t === 'w' });
      }
      if (!reason && !n) reason = erase ? 'Nenhuma parede aqui' : pts.every(([x, y]) => tileAt(x, y) === '#') ? 'Desenhe sobre o piso da construção' : 'Já tem parede aqui';
      const len = wd.box ? (Math.abs(wd.x1 - wd.x0) + 1) + ' × ' + (Math.abs(wd.y1 - wd.y0) + 1) : pts.length + (pts.length === 1 ? ' tile' : ' tiles');
      return { tiles, reason, n, info: (erase ? 'Apagar · ' : wd.box ? 'Dividir · ' : 'Parede · ') + len };
    }

    function applyWall(wd) { return rec(true, wd.erase ? 'Apagar parede' : 'Parede', () => applyWall0(wd)); }
    function applyWall0(wd) {
      const p = wallPlan(wd);
      if (p.reason) { nope(p.reason); return false; }
      const before = new Set(world.rooms.map((r) => r.id));
      if (wd.erase) {
        const gone = new Set(p.tiles.filter((t) => t.st === 'del').map((t) => tkey(t.x, t.y)));
        for (const k of gone) world.wallSet.delete(k);
        world.items = world.items.filter((e) => e.kind !== 'door' || !doorCells(e).some(([x, y]) => gone.has(tkey(x, y))));
        if (B.sel && B.sel.kind === 'door' && world.items.indexOf(B.sel) < 0) select(null);
        commit({ layout: true, walls: true });
        // a corner next to the erased stretch that no wall touches anymore would stand alone as a post: it goes too
        const near = new Set();
        for (const k of gone) { const [x, y] = k.split(',').map(Number); near.add(tkey(x + 1, y)); near.add(tkey(x - 1, y)); near.add(tkey(x, y + 1)); near.add(tkey(x, y - 1)); }
        const lone = world.items.filter((e) => lonePost(e) && near.has(tkey(e.tx, e.ty)));
        if (lone.length) {
          for (const e of lone) world.wallSet.delete(tkey(e.tx, e.ty));
          commit({ layout: true, walls: true });
        }
        game.sfx('remove');
        return true;
      }
      for (const t of p.tiles) {
        const k = tkey(t.x, t.y);
        if (t.st === 'new') world.wallSet.set(k, wallVal(B.wallMat, t.ax));
        else if (t.wall && t.ax) {
          // crossing or continuing an existing wall turns that tile into a junction
          const v = world.wallSet.get(k), ax = wallAx(v);
          if (ax.indexOf(t.ax) < 0) world.wallSet.set(k, wallVal(wallMat(v), (ax + t.ax).split('').sort().join('')));
        }
      }
      commit({ layout: true, walls: true });
      game.sfx('place');
      const born = world.rooms.filter((r) => !before.has(r.id));
      if (born.length) {
        const shut = born.find((r) => !r.doors);
        game.toast('ok', 'Sala formada', born.map((r) => r.name).join(', ') + (shut ? ' · coloque uma porta para entrar' : ''));
      }
      return true;
    }

    /* ---------- doors ---------- */
    // Which way the wall runs at a tile: floor above + below → horizontal wall.
    function wallAxisAt(x, y) {
      const fl = (a, b) => !!FLOOR[tileAt(a, b)];
      if (fl(x, y - 1) && fl(x, y + 1)) return 'h';
      if (fl(x - 1, y) && fl(x + 1, y)) return 'v';
      const wl = (a, b) => { const t = tileAt(a, b); return t === 'w' || t === 'd' || t === 'D'; };
      return wl(x - 1, y) || wl(x + 1, y) ? 'h' : 'v';
    }

    function doorCheck(e) {
      const occ = occupied({ solidOnly: true }), people = actorCells();
      for (const [x, y] of cells(e)) {
        const t = tileAt(x, y);
        if (t === 'd' || t === 'D') return 'Já tem uma porta aqui';
        if (t === '#') return 'Portas vão nas paredes internas';
        if (t !== 'w') return 'Coloque a porta sobre uma parede';
        const sides = e.axis === 'h' ? [[x, y - 1], [x, y + 1]] : [[x - 1, y], [x + 1, y]];
        for (const [sx, sy] of sides) {
          if (!FLOOR[tileAt(sx, sy)]) return 'A porta precisa de piso dos dois lados';
          if (occ.has(tkey(sx, sy))) return 'Tem um objeto na frente da porta';
        }
      }
      for (const [x, y] of cells(e)) if (people.has(tkey(x, y))) return 'Tem alguém aqui';
      return null;
    }

    function doorGhost(tx, ty, len, rot) {
      const axis = wallAxisAt(tx, ty);
      let e = makeDoor(tx, ty, axis, len, rot), reason = doorCheck(e);
      if (reason && len > 1) {
        const e2 = makeDoor(axis === 'h' ? tx - 1 : tx, axis === 'h' ? ty : ty - 1, axis, len, rot), r2 = doorCheck(e2);
        if (!r2) { e = e2; reason = null; }
      }
      return { e, reason };
    }

    // Doors swing open when someone comes close (or stay open when held) and close behind them.
    let doorClock = 0;
    function tickDoors() {
      const now = performance.now(), dt = doorClock ? Math.min(0.1, (now - doorClock) / 1000) : 0;
      doorClock = now;
      const doors = world.items.filter((e) => e.kind === 'door');
      if (!doors.length) return;
      const people = game.actors().filter((a) => !a.hidden);
      for (const d of doors) {
        const cx = d.px + d.tw * 8, cy = d.py + d.th * 8 + 2;
        let near = d.hold;
        for (const a of people) if (Math.abs(a.x - cx) < d.tw * 8 + 12 && Math.abs(a.y - cy) < d.th * 8 + 14) { near = true; break; }
        const target = near ? 1 : 0;
        d.open = (d.open || 0) + (target - (d.open || 0)) * Math.min(1, dt * (near ? 9 : 4));
      }
    }

    // Grab handles on the selected room's floor area edges (world px).
    function edgeAt(wx, wy) {
      const r = world.areas[selArea()];
      if (!r || r.fixed) return null;
      // the grab zone is measured on screen: ~10 px with a mouse, ~22 px under a finger, at any zoom
      const m = Math.max(4, ((DL.MOBILE ? 22 : 10) * scene.dpr) / scene.S);
      const L = r.x * T, Rr = (r.x + r.w) * T, Tp = r.y * T, Bt = (r.y + r.h) * T;
      const inY = wy > Tp - m && wy < Bt + m, inX = wx > L - m && wx < Rr + m;
      let e = '';
      if (inY && Math.abs(wy - Tp) < m) e += 't';
      else if (inY && Math.abs(wy - Bt) < m) e += 'b';
      if (inX && Math.abs(wx - L) < m) e += 'l';
      else if (inX && Math.abs(wx - Rr) < m) e += 'r';
      return e || null;
    }

    function resizeRect() {
      const z = B.resize, r = world.areas[z.i], tx = Math.round(B.mouse.wx / T), ty = Math.round(B.mouse.wy / T);
      let x0 = r.x, y0 = r.y, x1 = r.x + r.w, y1 = r.y + r.h;
      if (z.edge.indexOf('l') >= 0) x0 = Math.min(tx, x1 - LIM.minW);
      if (z.edge.indexOf('r') >= 0) x1 = Math.max(tx, x0 + LIM.minW);
      if (z.edge.indexOf('t') >= 0) y0 = Math.min(ty, y1 - LIM.minH);
      if (z.edge.indexOf('b') >= 0) y1 = Math.max(ty, y0 + LIM.minH);
      return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    }

    function roomPreview() {
      const key = JSON.stringify([B.draw, B.resize && B.resize.rect, B.wd, B.wallMat, world.version]);
      if (key === B.previewKey) return;
      B.previewKey = key;
      if (B.draw) {
        const rc = drawRect();
        B.draw.rect = rc;
        B.roomReason = planNewRoom(rc).plan.reason || null;
      } else if (B.resize) {
        const next = cloneAreas();
        Object.assign(next[B.resize.i], B.resize.rect);
        B.roomReason = planRooms(next, { msg: 'Há objetos junto à parede' }).reason || null;
      } else if (B.wd) {
        B.wd.plan = wallPlan(B.wd);
        B.roomReason = B.wd.plan.reason;
      }
    }

    /* ---------- selection ---------- */
    function select(e) {
      B.sel = e ? e.parent || e : null;
      renderInspector();
    }

    /* ---------- UI ---------- */
    // Catalog picture: the object drawn exactly as it stands on the map (the isometric drawing), cropped to
    // what was painted and scaled to the card. Rack units and anything the 3D view can't draw alone fall
    // back to the flat sprite below.
    const THUMB = 64;
    function thumb(def) {
      const c = thumbIso(def);
      if (c) return c;
      const f = thumbFlat(def);
      return cropThumb(f) || fitThumb(f, 0, 0, f.width, f.height);
    }
    // the painted part of a canvas, fitted to the card (null when nothing was painted)
    function cropThumb(cv) {
      const cw = cv.width, ch = cv.height, d = cv.getContext('2d').getImageData(0, 0, cw, ch).data;
      let x0 = cw, y0 = ch, x1 = -1, y1 = -1;
      for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) if (d[(y * cw + x) * 4 + 3] > 8) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
      return x1 < 0 ? null : fitThumb(cv, x0, y0, x1 - x0 + 1, y1 - y0 + 1);
    }
    function thumbIso(def) {
      if (!scene.iso || !scene.drawItemIso || def.thumb || def.mount === 'rack') return null;
      try {
        const e = newItem(def, 0, 0, 0, true);
        e.tx = 0; e.ty = 0;
        pos(e);
        // a scene stand-in: same drawing code, our own scale and origin (iso: x − y across, (x + y) / 2 down)
        const K = 2, PAD = 56, wPx = (e.tw + e.th) * T, hPx = ((e.tw + e.th) * T) / 2;
        const cw = (wPx + PAD * 2) * K, ch = (hPx + PAD * 2 + 40) * K;
        const sc = Object.create(scene);
        sc.S = K; sc.dpr = 1; sc.ox = -(e.th * T + PAD) * K; sc.oy = -(PAD + 40) * K;
        const cv = document.createElement('canvas');
        cv.width = cw; cv.height = ch;
        const g = cv.getContext('2d');
        g.imageSmoothingEnabled = false;
        const parts = [e].concat(e.chair ? [e.chair] : []);
        for (const p of parts.sort((a, b) => a.px + a.py - (b.px + b.py))) scene.drawItemIso.call(sc, g, p, 0.6);
        return cropThumb(cv);
      } catch (err) { return null; }
    }
    // the cropped picture centred on a square card canvas, as big as fits, whole pixels when possible
    function fitThumb(src, sx, sy, sw, sh) {
      const k = 2, SZ = THUMB * k, inner = SZ - 6;
      const c = document.createElement('canvas');
      c.width = SZ; c.height = SZ;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      let s = inner / Math.max(sw, sh);
      if (s >= 1) s = Math.floor(s);
      else { g.imageSmoothingEnabled = true; g.imageSmoothingQuality = 'high'; }
      const w = Math.round(sw * s), h = Math.round(sh * s);
      g.drawImage(src, sx, sy, sw, sh, Math.round((SZ - w) / 2), Math.round((SZ - h) / 2), w, h);
      return c;
    }
    function thumbFlat(def) {
      const c = document.createElement('canvas');
      const SZ = 48, k = 2;
      c.width = SZ * k;
      c.height = SZ * k;
      const g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.setTransform(k, 0, 0, k, 0, 0);
      let e;
      if (def.thumb) e = { kind: def.thumb, px: 8, py: 16, tw: 1, th: 1, seed: 3, model: def.unit ? def.id : null };
      else {
        e = newItem(def, 0, 0, 0, true);
        const w = e.tw * T, h = e.th * T;
        e.tx = 0; e.ty = 0;
        pos(e);
        const ox = Math.round((SZ - w) / 2), oy = SZ - 4 - h;
        g.translate(ox, def.mount === 'surface' ? 32 : oy);
        if (def.id === 'desk') g.translate(0, -2);
        if (def.id === 'rug') g.translate(0, 0);
      }
      DL.drawItem(g, e, 0.6);
      if (e.chair) DL.drawItem(g, e.chair, 0.6);
      return c;
    }

    // the second row: a category's sub-groups (Equipamentos → Racks, Rede…; Decoração also has Temas and
    // Estilo da sala), or the room tools in Espaços. Never more than this one extra row.
    el.groups = $('buildSub');
    el.groups.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-group]');
      if (!b) return;
      if (B.tab === 'theme' || B.tab === 'style') setTab('deco');
      B.group = b.dataset.group || null;
      unfold();
      renderCatalog();
      syncUi();
      el.items.scrollLeft = 0;
    });
    const thumbs = new Map();
    // search ignores accents and case; it looks through every item tab at once
    const fold = (t) => String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    const TAB_LABEL = { equip: 'Equipamentos', furn: 'Móveis', deco: 'Decoração', theme: 'Temas', cosm: 'Cosméticos' };
    const ITEM_TABS = Object.keys(TAB_LABEL);
    const cash = () => { const co = company(); return co ? co.cash : Infinity; };
    function renderCatalog() {
      const q = fold(B.q).trim(), words = q ? q.split(/\s+/) : [];
      // (pieces that left the season pass only show for whoever owns one)
      const shown = (d) => !(d.oldPass && cosmState(d) === 'locked');
      const defs = q
        ? CATALOG.filter((d) => ITEM_TABS.indexOf(d.cat) >= 0 && shown(d) && words.every((w) => fold(d.name + ' ' + (d.group || '') + ' ' + (d.desc || '') + ' ' + TAB_LABEL[d.cat]).indexOf(w) >= 0))
        : CATALOG.filter((d) => d.cat === B.tab && shown(d));
      if (!q && B.group && groupsOf(B.tab).indexOf(B.group) < 0) B.group = null;
      hideTipCard();
      el.items.innerHTML = '';
      if (!defs.length) {
        el.items.innerHTML = '<p class="cat-empty">' + (q ? 'Nada encontrado para “' + esc(B.q.trim()) + '”' : 'Nada por aqui ainda') + '</p>';
        return;
      }
      // what the player can buy first, then the locked items by the level that opens them
      const order = defs.slice().sort((a, b) => lockedLevel(a) - lockedLevel(b));
      const money = cash();
      for (const def of order) {
        if (B.group && def.group !== B.group) continue;
        const b = document.createElement('button');
        b.type = 'button';
        const lock = lockedLevel(def);
        b.className = 'cat-item' + (B.def === def ? ' is-on' : '') + (lock ? ' is-locked' : '');
        b.dataset.def = def.id;
        const price = def.price ? priceOf(def) : 0;
        // the full text lives in the hover balloon (tipCard); the card only shows picture, name and price
        b.setAttribute('aria-label', def.name + (q ? ' (' + TAB_LABEL[def.cat] + ')' : '') + ' · ' + (def.desc || ''));
        b.appendChild(thumbOf(def));
        const s = document.createElement('span');
        s.className = 'cat-item__name';
        s.textContent = def.name;
        b.appendChild(s);
        const p = document.createElement('em');
        p.className = 'cat-item__price';
        if (def.cosm) {
          // bought in the shop (Gold) → placed here for free, one of each
          const st = cosmState(def);
          p.className += st === 'free' ? ' is-free' : st === 'locked' ? ' is-lock' : '';
          p.textContent = st === 'free' ? 'No inventário' : st === 'placed' ? 'No mapa' : def.pass ? '🔒 Passe' : '🔒 Loja';
          if (st === 'locked') b.classList.add('is-locked');
        } else if (lock) {
          p.className += ' is-lock';
          p.textContent = '🔒 Nível ' + lock;
        } else if (def.price) {
          p.className += price ? '' : ' is-free';
          p.textContent = price ? DL.money(price) : 'grátis';
        }
        if (p.textContent) b.appendChild(p);
        // priced items the cash can't cover yet: greyed (refreshAfford keeps it current; the balloon says how much is missing)
        if (!lock && !def.cosm && price) {
          b.dataset.price = price;
          if (price > money) b.classList.add('is-poor');
        }
        el.items.appendChild(b);
      }
      B.cashSeen = money;
      requestAnimationFrame(syncScroll);
    }
    function refreshAfford() {
      const money = cash();
      B.cashSeen = money;
      el.items.querySelectorAll('.cat-item[data-price]').forEach((b) => b.classList.toggle('is-poor', +b.dataset.price > money));
      if (tipCard.def && tipCard.el.classList.contains('is-on')) fillTipCard(tipCard.def);
    }

    // a fresh copy of the cached picture (one canvas can only sit in one place)
    function thumbOf(def) {
      if (!thumbs.has(def.id)) {
        let c = null;
        try { c = thumb(def); } catch (err) { /* drawn below as an empty card */ }
        if (!c) { c = document.createElement('canvas'); c.width = c.height = THUMB * 2; }
        thumbs.set(def.id, c);
      }
      const c = thumbs.get(def.id), cv = document.createElement('canvas');
      cv.width = c.width; cv.height = c.height;
      cv.getContext('2d').drawImage(c, 0, 0);
      return cv;
    }
    // the sub-groups a category offers, in catalog order
    function groupsOf(cat) {
      const out = [];
      for (const d of CATALOG) if (d.cat === cat && d.group && out.indexOf(d.group) < 0 && !(d.oldPass && cosmState(d) === 'locked')) out.push(d.group);
      return out;
    }
    // Row 2 under the strip: rebuilt only when what it shows changes (keeps keyboard focus in place)
    let subSig = '';
    function renderSub() {
      const fam = B.tab === 'theme' || B.tab === 'style' ? 'deco' : B.tab;
      const searching = !!(B.q && B.q.trim());
      const btn = (attrs, label, on, tip) => '<button type="button" class="bsub' + (on ? ' is-on' : '') + '" ' + attrs + (tip ? ' title="' + esc(tip) + '"' : '') + ' aria-pressed="' + (on ? 'true' : 'false') + '">' + label + '</button>';
      let h = '';
      if (!searching && fam === 'room') {
        h = ROOM_TOOLS.map(([id, label, tip]) => btn('data-room-tool="' + id + '"', label, B.roomTool === id && !(B.def && B.def.mount === 'wallslot' && id === 'select'), tip)).join('');
      } else if (!searching) {
        const gs = groupsOf(fam);
        if (gs.length > 1) {
          h += btn('data-group=""', 'Todos', !B.group && B.tab === fam);
          h += gs.map((gname) => btn('data-group="' + esc(gname) + '"', esc(gname), B.group === gname && B.tab === fam)).join('');
        }
        if (fam === 'deco') h += '<i class="bsub__sep" aria-hidden="true"></i>' + btn('data-tab="theme"', 'Temas', B.tab === 'theme', 'Objetos temáticos') + btn('data-tab="style"', 'Estilo da sala', B.tab === 'style', 'Piso, paredes, luz e RGB da sala');
      }
      const sig = fam + '|' + h;
      if (sig === subSig) return;
      subSig = sig;
      const had = el.groups.contains(document.activeElement) ? document.activeElement : null;
      const key = had ? ['data-group', 'data-tab', 'data-room-tool'].map((a) => had.getAttribute(a)).join('|') : null;
      el.groups.innerHTML = h;
      // (an empty row keeps its place, so the strip doesn't jump between categories)
      el.groups.hidden = false;
      el.groups.classList.toggle('is-empty', !h);
      if (key != null) {
        const back = Array.from(el.groups.querySelectorAll('button')).find((b) => ['data-group', 'data-tab', 'data-room-tool'].map((a) => b.getAttribute(a)).join('|') === key);
        if (back) back.focus({ preventScroll: true });
      }
      // the chosen chip stays in view when the row scrolls
      const on = el.groups.querySelector('.is-on');
      if (on && on.scrollIntoView) on.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }

    // the balloon over a card: the full description, the price and what is missing (150 ms after the mouse arrives)
    const tipCard = { el: document.createElement('div'), def: null, timer: 0, anchor: null };
    tipCard.el.className = 'build-tipcard';
    tipCard.el.setAttribute('role', 'tooltip');
    tipCard.el.id = 'buildTipCard';
    document.body.appendChild(tipCard.el);
    function blockReason(def) {
      if (def.cosm) {
        const st = cosmState(def);
        if (st === 'locked') return def.pass ? 'Recompensa do Passe Boot Inicial (nível ' + def.pass + ')' : 'Compre na Loja (O), aba Cosméticos';
        return null;
      }
      const lock = lockedLevel(def);
      if (lock) return 'Libera no nível ' + lock + ' da carreira';
      const p = def.price ? priceOf(def) : 0, have = cash();
      if (p > have) return 'Falta dinheiro: faltam ' + DL.money(p - have);
      if (def.mount === 'rack' && !world.items.some((e) => e.units && e.units.indexOf(null) >= 0)) return 'Precisa de um rack com espaço livre';
      return null;
    }
    function fillTipCard(def) {
      const p = def.price ? priceOf(def) : 0;
      let price;
      if (def.cosm) { const st = cosmState(def); price = st === 'free' ? 'No inventário · colocar é grátis' : st === 'placed' ? 'Já está no mapa · clique para selecionar' : def.pass ? 'Recompensa do Passe' : 'Item da Loja'; }
      else price = def.price ? (p ? DL.money(p) : 'Grátis (kit inicial)') : 'Grátis';
      const why = blockReason(def);
      tipCard.el.innerHTML = '<b class="build-tipcard__name">' + esc(def.name) + '</b>' +
        '<span class="build-tipcard__price' + (why ? ' is-off' : '') + '">' + esc(price) + '</span>' +
        (def.desc ? '<p>' + esc(def.desc) + '</p>' : '') +
        (why ? '<p class="build-tipcard__why">' + esc(why) + '</p>' : '');
    }
    function placeTipCard() {
      const a = tipCard.anchor;
      if (!a || !a.isConnected) { hideTipCard(); return; }
      const r = a.getBoundingClientRect(), t = tipCard.el, M = 8;
      const w = t.offsetWidth, h = t.offsetHeight;
      let x = r.left + r.width / 2 - w / 2, y = r.top - h - 10;
      if (y < M) y = r.bottom + 10; // no room above: below the card
      x = Math.max(M, Math.min(innerWidth - w - M, x));
      y = Math.max(M, Math.min(innerHeight - h - M, y));
      t.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
    }
    function showTipCard(card) {
      const def = DEF[card.dataset.def];
      if (!def) return;
      clearTimeout(tipCard.timer);
      const now = tipCard.el.classList.contains('is-on');
      tipCard.timer = setTimeout(() => {
        if (!card.isConnected || el.dock.classList.contains('is-folded')) return;
        tipCard.def = def;
        tipCard.anchor = card;
        fillTipCard(def);
        card.setAttribute('aria-describedby', 'buildTipCard');
        tipCard.el.classList.add('is-on');
        placeTipCard();
      }, now ? 0 : 150);
    }
    function hideTipCard() {
      clearTimeout(tipCard.timer);
      if (tipCard.anchor) tipCard.anchor.removeAttribute('aria-describedby');
      tipCard.anchor = null;
      tipCard.def = null;
      tipCard.el.classList.remove('is-on');
    }
    el.items.addEventListener('pointerover', (ev) => { const c = ev.target.closest('.cat-item'); if (c && !drag.on) showTipCard(c); });
    el.items.addEventListener('pointerout', (ev) => {
      const to = ev.relatedTarget && ev.relatedTarget.closest ? ev.relatedTarget.closest('.cat-item') : null;
      if (!to || !el.items.contains(to)) hideTipCard();
    });
    el.items.addEventListener('focusin', (ev) => { const c = ev.target.closest('.cat-item'); if (c) showTipCard(c); });
    el.items.addEventListener('focusout', (ev) => { if (!el.items.contains(ev.relatedTarget)) hideTipCard(); });
    el.items.addEventListener('scroll', () => { if (tipCard.anchor) placeTipCard(); syncScroll(); }, { passive: true });

    // the strip scrolls sideways: mouse wheel, the ‹ › buttons, dragging, or ← → between cards
    const drag = { on: false, x: 0, left: 0, id: null, moved: false };
    function syncScroll() {
      const it = el.items, max = it.scrollWidth - it.clientWidth;
      el.dock.querySelectorAll('[data-scroll]').forEach((b) => { b.disabled = it.hidden || max <= 2 || (+b.dataset.scroll < 0 ? it.scrollLeft <= 1 : it.scrollLeft >= max - 1); });
    }
    el.items.addEventListener('wheel', (ev) => {
      const d = Math.abs(ev.deltaX) > Math.abs(ev.deltaY) ? ev.deltaX : ev.deltaY;
      if (el.items.scrollWidth <= el.items.clientWidth) return;
      el.items.scrollLeft += d * (ev.deltaMode === 1 ? 32 : 1);
      ev.preventDefault();
    }, { passive: false });
    el.items.addEventListener('pointerdown', (ev) => {
      if (ev.button !== 0 || ev.pointerType === 'touch') return;
      drag.on = false; drag.moved = false; drag.x = ev.clientX; drag.left = el.items.scrollLeft; drag.id = ev.pointerId;
    });
    el.items.addEventListener('pointermove', (ev) => {
      if (drag.id !== ev.pointerId || !(ev.buttons & 1)) return;
      const dx = ev.clientX - drag.x;
      if (!drag.on && Math.abs(dx) > 6) { drag.on = true; drag.moved = true; hideTipCard(); el.items.setPointerCapture(ev.pointerId); el.items.classList.add('is-drag'); }
      if (drag.on) el.items.scrollLeft = drag.left - dx;
    });
    const endDrag = () => { drag.id = null; if (drag.on) { drag.on = false; el.items.classList.remove('is-drag'); } };
    el.items.addEventListener('pointerup', endDrag);
    el.items.addEventListener('pointercancel', endDrag);
    // a drag is not a click on the card it started on
    el.items.addEventListener('click', (ev) => { if (drag.moved) { drag.moved = false; ev.stopPropagation(); ev.preventDefault(); } }, true);

    // [id, label, tooltip] · 'draw' makes new floor on empty land; 'box' only puts 4 walls on floor that exists (splits a room)
    const ROOM_TOOLS = [
      ['select', 'Selecionar', 'Escolher uma sala, ver o nome dela e redimensionar pelas bordas · Esc volta para cá'],
      ['draw', 'Nova sala', 'Criar uma sala nova no terreno vazio: piso, paredes e porta saem juntos'],
      ['wall', 'Parede', 'Desenhar uma parede reta arrastando na grade · R troca alvenaria / vidro'],
      ['box', 'Dividir sala', 'Dividir uma sala existente: arraste um retângulo e as 4 paredes aparecem de uma vez'],
      ['erase', 'Apagar parede', 'Remover só o trecho de parede onde você clicar ou arrastar'],
      ['door', 'Porta', 'Colocar uma porta simples numa parede'],
      ['door2', 'Porta dupla', 'Colocar uma porta de duas folhas (ocupa 2 tiles de parede)'],
    ];
    const WALL_MATS = [['solid', 'Alvenaria'], ['glass', 'Vidro']];
    const esc = (t) => String(t).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    // Espaços: the tool row always; below it only what the chosen tool needs. With "Selecionar": the selected
    // room's name in view; the room list, its type / exact size / floor and the land sit behind "Mais".
    function renderRoom() {
      if (B.tab !== 'room') return;
      const rooms = world.rooms;
      B.roomIdx = Math.max(0, Math.min(B.roomIdx, rooms.length - 1));
      const r = rooms[B.roomIdx], ai = areaOfRoom(B.roomIdx), a = world.areas[ai];
      const step = (label, key, val, off) =>
        '<div class="stepper"><span class="eyebrow-sm">' + label + '</span><button type="button" class="btn btn--sm" data-room="' + key + '-"' + (off ? ' disabled' : '') + ' aria-label="Diminuir ' + label + '" title="Diminuir ' + label.toLowerCase() + '">−</button><b>' + val + '</b><button type="button" class="btn btn--sm" data-room="' + key + '+"' + (off ? ' disabled' : '') + ' aria-label="Aumentar ' + label + '" title="Aumentar ' + label.toLowerCase() + '">+</button></div>';
      // (the tool row itself is the second row under the strip: renderSub)
      let h = '';
      const tool = ROOM_TOOLS.find((t) => t[0] === B.roomTool);
      if (tool && B.roomTool !== 'select') h += '<p class="room-howto"><b>' + tool[1] + '</b> · ' + esc(tool[2]) + '</p>';
      if (B.roomTool === 'wall' || B.roomTool === 'box') {
        h += '<div class="room-sec room-mats"><span class="eyebrow-sm">Material <kbd>R</kbd></span>' + WALL_MATS.map(([id, l]) => '<button type="button" class="chip chip--xs' + (B.wallMat === id ? ' is-on' : '') + '" data-wall-mat="' + id + '">' + l + '</button>').join('') + '</div>';
      }
      const ask = B.lotAsk;
      if (B.roomTool === 'select') {
        // always in view: the selected room's name, its size, a warning without a door, and "Mais"
        const noDoor = rooms.length > 1 ? rooms.filter((x) => !x.doors).length : 0;
        h += '<div class="room-sec room-edit"><span class="eyebrow-sm room-sec__k">Sala</span>';
        if (r) {
          h += '<input class="input input--sm" data-room-name type="text" maxlength="24" value="' + esc(r.name) + '" spellcheck="false" autocomplete="off" aria-label="Nome da sala" title="Nome da sala · Enter confirma">' +
            '<span class="room-size mono" title="Tamanho da sala (largura × altura)">' + (r.n === r.w * r.h ? r.w + ' × ' + r.h : r.n + ' m²') + '</span>';
          if (!r.doors && rooms.length > 1) h += '<span class="room-nodoor" title="Ninguém entra nesta sala: coloque uma porta">sem porta</span>';
        } else h += '<span class="room-none">Clique numa sala no mapa</span>';
        if (noDoor && (!r || r.doors)) h += '<span class="room-nodoor" title="Abra Mais para ver quais salas estão sem porta">' + noDoor + (noDoor > 1 ? ' salas' : ' sala') + ' sem porta</span>';
        h += '<button type="button" class="btn btn--sm room-more' + (B.roomMore ? ' is-on' : '') + '" data-room-more="1" aria-expanded="' + (B.roomMore ? 'true' : 'false') + '" title="Todas as salas, tipo, tamanho exato, piso e terreno">Mais ' + (B.roomMore ? '▴' : '▾') + '</button></div>';
        if (B.roomMore) {
          h += '<div class="room-more-box">';
          // every room
          h += '<div class="room-grp room-grp--wide"><span class="room-grp__k">Salas</span><div class="room-list">';
          rooms.forEach((x, k) => {
            h += '<button type="button" class="chip chip--xs' + (k === B.roomIdx ? ' is-on' : '') + (x.doors ? '' : ' is-warn') + '" data-room-pick="' + k + '"' + ' title="' + (x.doors ? 'Selecionar e mostrar esta sala' : 'Sala sem porta · selecionar e mostrar') + '">' + esc(x.name) + ' <span class="mono">' + (x.n === x.w * x.h ? x.w + '×' + x.h : x.n + ' m²') + '</span>' + (x.doors || rooms.length < 2 ? '' : ' <span class="room-nodoor">sem porta</span>') + '</button>';
          });
          h += '</div></div>';
          // the selected room: type, exact size, floor, more space (maps without a lot)
          if (r) {
            h += '<div class="room-grp"><span class="room-grp__k">Sala selecionada</span><div class="room-grp__row">' +
              '<label class="room-type"><span class="eyebrow-sm">Tipo</span><select class="input input--sm" data-room-type-sel aria-label="Tipo da sala">' +
              (r.type ? '' : '<option value="" selected>—</option>') + ROOM_TYPES.map((t) => '<option value="' + t.id + '"' + (r.type === t.id ? ' selected' : '') + '>' + t.label + '</option>').join('') + '</select></label>' +
              '<button type="button" class="btn btn--sm" data-room="floor" title="Trocar o piso da sala">Piso · ' + (r.floor === 'carpet' ? 'carpete' : 'técnico') + '</button></div>';
            if (a) h += '<div class="room-grp__row">' + step('Largura', 'w', a.w, a.fixed) + step('Altura', 'h', a.h, a.fixed) + '</div>';
            if (!world.lot || (a && !a.fixed && a.id !== 'hall' && world.areas.length > 1)) {
              h += '<div class="room-grp__row">';
              if (!world.lot) h += '<button type="button" class="btn btn--sm" data-room="add-e">+ Espaço a leste</button><button type="button" class="btn btn--sm" data-room="add-s">+ Espaço ao sul</button>';
              if (a && !a.fixed && a.id !== 'hall' && world.areas.length > 1) h += '<button type="button" class="btn btn--sm btn--danger" data-room="del">Remover área</button>';
              h += '</div>';
            }
            h += '</div>';
          }
          // the land
          if (world.lot) {
            const pw = lotQuote(4, 0), ph = lotQuote(0, 4), lbl = (p) => (p ? DL.money(p) : 'grátis');
            h += '<div class="room-grp room-lot"><span class="room-grp__k">Terreno</span><div class="room-grp__row">' +
              step('Largura', 'lw', world.lot.w, false) + step('Altura', 'lh', world.lot.h, false) + '</div>' +
              '<p class="lot-prices" title="O preço sobe com o tamanho do terreno e com a área construída">Aumentar terreno: +4 de largura por <b>' + lbl(pw) + '</b> · +4 de altura por <b>' + lbl(ph) + '</b></p></div>';
          }
          h += '</div>';
        }
      }
      if (B.lotBusy) h += '<div class="lot-ask" role="status"><span>Confirmando a compra do terreno com o servidor…</span></div>';
      if (ask && world.lot) {
        const price = lotQuote(ask.dw, ask.dh), co = company(), after = co ? co.cash - price : 0;
        const nw = world.lot.w + ask.dw, nh = world.lot.h + ask.dh, add = nw * nh - world.lot.w * world.lot.h;
        h += '<div class="lot-ask" role="alertdialog" aria-label="Confirmar expansão do terreno"><span>Expandir o terreno para <b>' + nw + ' × ' + nh + '</b> (+' + add + ' m²) ' + (price ? 'por ' : '— ') + '<b class="lot-ask__price">' + (price ? DL.money(price) : 'grátis · kit inicial') + '</b>' +
          (co && price ? ' · caixa depois: <b class="' + (after < 0 ? 'is-neg' : '') + '">' + DL.money(after) + '</b>' : '') + '</span>' +
          '<button type="button" class="btn btn--sm btn--primary" data-room="lot-ok"' + (co && after < 0 ? ' disabled' : '') + '>Confirmar</button><button type="button" class="btn btn--sm" data-room="lot-no">Cancelar</button></div>';
      }
      el.room.innerHTML = h;
      renderSub();
    }

    const isWallTool = () => B.roomTool === 'wall' || B.roomTool === 'box' || B.roomTool === 'erase';
    function setRoomTool(t) {
      if (B.move) cancelMove();
      B.roomTool = t;
      B.draw = null;
      B.resize = null;
      B.wd = null;
      B.roomReason = null;
      B.roomHover = null;
      const def = t === 'door' || t === 'door2' ? DEF[t] : null;
      B.def = def;
      B.rot = 0;
      B.ghost = def && B.mouse ? ghostAt(B.mouse.wx, B.mouse.wy) : null;
      if (def) select(null);
      renderRoom();
      syncUi();
    }

    function renderInspector() {
      const e = B.sel;
      if (!e || !B.active) { el.insp.classList.remove('is-on'); return; }
      const why = lockReason(e);
      let h = '<div class="insp__head"><span class="eyebrow-sm">' + (lonePost(e) ? 'Coluna solta' : DL.itemName(e)) + '</span>' + (e.id ? '<b>' + e.id + '</b>' : '') + '</div>';
      if (lonePost(e)) h += '<div class="insp__actions"><button type="button" class="btn btn--sm" data-ins="remove">Remover <kbd>Del</kbd></button></div>';
      else if (why) h += '<p class="insp__note">' + why + '</p>';
      else {
        h += '<div class="insp__actions">';
        h += '<button type="button" class="btn btn--sm" data-ins="move">Mover <kbd>M</kbd></button>';
        if (canTurn(e)) h += '<button type="button" class="btn btn--sm" data-ins="rotate" title="' + (e.kind === 'door' ? 'Troca o lado da dobradiça e da abertura' : DL.ROT_LABEL[e.rot | 0]) + '">Girar <kbd>R</kbd></button>';
        h += '<button type="button" class="btn btn--sm" data-ins="remove">' + (isCosm(e) ? 'Guardar no inventário' : 'Remover') + ' <kbd>Del</kbd></button></div>';
        if (isCosm(e)) h += '<p class="insp__note">Cosmético da loja · guardado, volta para o inventário e pode ser colocado de novo</p>';
        if (e.kind === 'door') {
          h += '<p class="insp__note">' + (e.axis === 'h' ? 'Parede horizontal' : 'Parede vertical') + ' · abre sozinha quando alguém chega · <button type="button" class="linkbtn" data-ins="hold">' + (e.hold ? 'deixar fechar' : 'manter aberta') + '</button></p>';
        }
        const opts = DL.ITEM_STYLES && DL.ITEM_STYLES[e.kind];
        if (opts) {
          h += '<div class="insp__style">';
          for (const o of opts) {
            const cur = DL.itemStyleGet(e, o.key) || '';
            h += '<div class="insp__srow"><span class="eyebrow-sm">' + o.label + '</span>';
            if (o.options) h += o.options.map(([v, l]) => '<button type="button" class="chip chip--xs' + (cur === v ? ' is-on' : '') + '" data-sty="' + o.key + '" data-v="' + v + '">' + l + '</button>').join('');
            else h += o.colors.map((c) => '<button type="button" class="swatch swatch--xs' + (cur === c ? ' is-on' : '') + '" data-sty="' + o.key + '" data-v="' + c + '" style="--c:' + c + '" aria-label="' + c + '"></button>').join('');
            h += '</div>';
          }
          h += '</div>';
        }
        // skins from the inventory: this rack / storage can wear its own (inventory.js)
        if (DL.inspectorSkin) h += DL.inspectorSkin(e);
        if (e.units) {
          const n = e.units.filter(Boolean).length;
          h += '<p class="insp__note">' + n + ' / 9 unidades · ' + DL.hwFmt.kw(e.tel ? e.tel.power : 0) + (n ? ' · <button type="button" class="linkbtn" data-ins="unit">tirar a última</button>' : ' · use Servidor ou Switch do catálogo') + '</p>';
          if (n) {
            h += '<ul class="insp__units">';
            e.units.forEach((u, k) => {
              if (!u) return;
              const m = DL.hwModel(u, e.unitModel && e.unitModel[k]);
              h += '<li><span class="mono">U' + String(40 - k * 4).padStart(2, '0') + '</span>' + m.name + '<em>' + (u === 'server' ? m.cores + ' núcl. · ' + DL.hwFmt.ram(m.ram) + ' · ' + DL.hwFmt.gb(m.nic) : u === 'switch' ? m.ports + 'p · ' + DL.hwFmt.gb(m.port) + (m.poe ? ' · PoE' : '') : m.ports + ' passagens') + '</em></li>';
            });
            h += '</ul>';
          }
        }
        const spec = e.kind === 'storage' ? DL.hwSpecs('storage', DL.hwModel('storage', e.model)) : e.kind === 'ap' || e.kind === 'camera' ? DL.hwSpecs(e.kind, DL.HW.poe[e.kind]) : null;
        if (spec && spec.length) {
          h += '<dl class="insp__spec">' + spec.map(([k, v]) => '<dt>' + k + '</dt><dd>' + v + '</dd>').join('') + '</dl>';
          if (e.kind === 'ap' || e.kind === 'camera') h += '<p class="insp__note">' + (e.powered === false ? 'Sem energia: falta um switch PoE com potência livre' : 'Alimentado por PoE') + '</p>';
        }
        if (e.cost) h += '<p class="insp__note">Comprado por ' + DL.money(e.cost) + ' · revenda ' + DL.money(Math.round(e.cost * 0.5)) + '</p>';
      }
      el.insp.innerHTML = h;
      el.insp.classList.add('is-on');
    }

    const HINTS = {
      select: 'Clique para selecionar · arraste para mover · <kbd>R</kbd> gira 90° (4 direções) · <kbd>Del</kbd> remove · <kbd>WASD</kbd> câmera · roda do mouse: zoom',
      place: 'Clique para posicionar · <kbd>R</kbd> gira 90° · botão direito ou <kbd>Esc</kbd> cancela',
      mount: 'Clique no objeto de destino · botão direito ou <kbd>Esc</kbd> cancela',
      remove: 'Clique em um objeto para removê-lo · <kbd>Esc</kbd> volta para seleção',
      move: 'Clique para soltar · <kbd>R</kbd> gira · <kbd>Esc</kbd> cancela',
      style: 'Clique numa sala para personalizá-la · aplique um tema e misture piso, paredes, luz e RGB · objetos especiais na aba Temas',
      room: 'Clique numa sala para selecioná-la · arraste as bordas da área para redimensionar · arraste uma porta para movê-la · <b>Mais</b>: tipo, tamanho e terreno · <kbd>Q</kbd> esconde o painel',
      draw: 'Nova sala: arraste no terreno vazio para criar piso novo · encostada numa sala existente ganha divisória e porta · <kbd>Esc</kbd> volta para Selecionar',
      wall: 'Parede: clique e arraste na grade para desenhar a parede · comece numa parede para continuar · <kbd>Shift</kbd>+arrastar apaga · <kbd>R</kbd> alvenaria/vidro',
      box: 'Dividir sala: arraste um retângulo dentro de uma sala · as 4 paredes aparecem de uma vez · depois coloque uma porta · <kbd>R</kbd> alvenaria/vidro',
      erase: 'Apagar parede: clique ou arraste sobre uma parede para remover só esse trecho (portas no trecho saem junto)',
      tmove: 'Mover: clique num objeto para pegá-lo e clique de novo onde ele vai ficar · <kbd>R</kbd> gira · <kbd>Esc</kbd> volta para Selecionar',
      rotate: 'Girar: clique num objeto para girá-lo 90° · <kbd>Esc</kbd> volta para Selecionar',
      copy: 'Copiar: clique num objeto para colocar outro igual (mesma direção e cor) · <kbd>Esc</kbd> volta para Selecionar',
      door: 'Porta: clique numa parede interna para colocar a porta · <kbd>R</kbd> gira (dobradiça / lado que abre) · arraste uma porta existente para movê-la · <kbd>Esc</kbd> sai',
    };

    function syncUi() {
      // Decoração groups three tabs (items, themed items, room style) under one main tab + sub-tabs
      const fam = B.tab === 'theme' || B.tab === 'style' ? 'deco' : B.tab;
      el.dock.querySelectorAll('[data-tab]').forEach((b) => {
        const on = b.dataset.family ? b.dataset.family === fam : b.dataset.tab === B.tab;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      const searching = !!(B.q && B.q.trim());
      // the search shows its results in the strip, whatever category was open
      const finding = searching || B.findOpen;
      el.items.hidden = !finding && (B.tab === 'room' || B.tab === 'style');
      el.room.hidden = finding || B.tab !== 'room';
      if (el.style) el.style.hidden = finding || B.tab !== 'style';
      el.dock.classList.toggle('is-searching', searching);
      el.dock.classList.toggle('is-finding', !!B.findOpen);
      el.dock.classList.toggle('is-panel', !finding && (B.tab === 'room' || B.tab === 'style'));
      if (searching) el.dock.querySelectorAll('.build__cats [data-tab]').forEach((b) => { b.classList.remove('is-on'); b.setAttribute('aria-selected', 'false'); });
      renderSub();
      syncTray();
      syncCur();
      syncScroll();
      syncTools();
      el.items.querySelectorAll('.cat-item').forEach((b) => b.classList.toggle('is-on', !!B.def && b.dataset.def === B.def.id));
      const mode = B.move ? 'move' : B.def ? (B.def.mount === 'wallslot' ? 'door' : B.def.mount === 'rack' ? 'mount' : 'place') : B.tab === 'room' ? (B.roomTool === 'select' ? 'room' : B.roomTool) : B.tab === 'style' ? 'style' : B.tool === 'move' ? 'tmove' : B.tool;
      el.hint.innerHTML = HINTS[mode] + (B.def && B.def.price && !B.move ? ' · <b>' + B.def.name + '</b> ' + (priceOf(B.def) ? 'custa ' + DL.money(priceOf(B.def)) : 'sai grátis (kit inicial)') : '');
      game.setCursor(B.move || B.def || (B.tab === 'room' && B.roomTool !== 'select') ? 'crosshair' : B.tool === 'remove' ? 'not-allowed' : B.tool === 'copy' ? 'copy' : B.tool === 'move' ? 'grab' : B.tool === 'rotate' ? 'pointer' : '');
    }

    function setTab(t) {
      cancelPlace();
      if (B.roomTool === 'door' || B.roomTool === 'door2') B.roomTool = 'select';
      B.wd = null;
      if (B.tab !== t) B.group = null;
      // picking a tab means browsing it: the search is cleared and put away
      if (B.q) { B.q = ''; if (el.search) el.search.value = ''; }
      if (B.findOpen) { B.findOpen = false; el.find.hidden = true; }
      B.auto = false;
      B.tab = t;
      if (ITEM_TABS.indexOf(t) >= 0) B.itemTab = t;
      if (t === 'deco' || t === 'theme' || t === 'style') B.decoTab = t;
      if (t === 'room') { B.roomIdx = Math.max(0, Math.min(B.roomIdx, world.rooms.length - 1)); renderRoom(); select(null); }
      else if (t === 'style') { B.roomIdx = Math.max(0, Math.min(B.roomIdx, world.rooms.length - 1)); select(null); }
      else renderCatalog();
      syncUi();
      if (t === 'style') game.emit('style-room', B.roomIdx);
    }

    function chooseDef(id) {
      if (B.move) cancelMove();
      const def = DEF[id];
      const lock = lockedLevel(def);
      if (lock) { nope(def.name + ' libera no nível ' + lock + ' da carreira'); return; }
      if (def.cosm && B.def !== def) {
        const st = cosmState(def);
        if (st === 'locked') { nope(def.name + (def.pass ? ': recompensa do Passe Boot Inicial (nível ' + def.pass + ')' : ': compre na Loja (O), aba Cosméticos')); return; }
        if (st === 'placed') {
          // already on the map: select it, so it can be moved, turned or put away
          const e = world.items.find((x) => x.defId === def.id);
          B.def = null; B.ghost = null;
          select(e);
          if (e) game.focus(e.px + e.tw * 8, e.py + e.th * 8);
          syncUi();
          return;
        }
      }
      if (B.def !== def && !def.cosm && def.price) {
        const p = priceOf(def), have = cash();
        if (p > have) { nope('Saldo insuficiente · ' + def.name + ' custa ' + DL.money(p) + ' (falta ' + DL.money(p - have) + ')'); return; }
      }
      B.def = B.def === def ? null : def;
      B.copy = null;
      if (B.def && !def.cosm && def.mount !== 'wallslot') B.lastDef = def;
      if (B.def) B.tool = 'select';
      // with an item in the hand the strip folds away: only its ghost on the map (Esc / Tab / right button bring it back)
      B.auto = !!B.def;
      if (B.def && el.dock.contains(document.activeElement)) document.activeElement.blur();
      B.rot = 0;
      B.ghost = B.def && B.mouse ? ghostAt(B.mouse.wx, B.mouse.wy) : null;
      select(null);
      syncUi();
    }

    function cancelPlace() {
      B.def = null;
      B.ghost = null;
      B.copy = null;
      B.auto = false;
      syncUi();
    }

    // the toolbar's little card: what is in the hand right now (click: the strip again)
    let curId = '';
    function syncCur() {
      if (!el.cur) return;
      const d = B.def;
      el.cur.hidden = !d;
      if (!d || curId === d.id) return;
      curId = d.id;
      const cv = el.cur.querySelector('canvas'), g = cv.getContext('2d'), src = thumbOf(d);
      g.clearRect(0, 0, cv.width, cv.height);
      g.imageSmoothingEnabled = false;
      g.drawImage(src, 0, 0, cv.width, cv.height);
      el.cur.querySelector('span').textContent = d.name;
      el.cur.setAttribute('aria-label', 'Colocando: ' + d.name + ' · mostrar o catálogo');
    }
    if (el.cur) el.cur.addEventListener('click', () => { unfold(); el.cur.blur(); });

    // the search box: "/" or the magnifier; it sits on top of the strip and looks through every category
    function openFind() {
      B.findOpen = true;
      el.find.hidden = false;
      unfold();
      renderCatalog();
      syncUi();
      el.search.focus();
      el.search.select();
    }
    function closeFind() {
      if (!B.findOpen && !B.q) return;
      B.findOpen = false;
      B.q = '';
      el.search.value = '';
      el.find.hidden = true;
      if (document.activeElement === el.search) el.search.blur();
      if (B.tab !== 'room' && B.tab !== 'style') renderCatalog();
      syncUi();
    }
    if (el.findBtn) el.findBtn.addEventListener('click', (ev) => { ev.stopPropagation(); if (B.findOpen) closeFind(); else openFind(); });

    // "?": the list of keyboard shortcuts (closes on a click outside it or Esc)
    function setHelp(on) {
      if (!el.help) return;
      el.help.hidden = !on;
      el.helpBtn.setAttribute('aria-expanded', on ? 'true' : 'false');
      el.helpBtn.classList.toggle('is-on', on);
    }
    const helpOpen = () => !!el.help && !el.help.hidden;
    if (el.helpBtn) el.helpBtn.addEventListener('click', (ev) => { ev.stopPropagation(); setHelp(!helpOpen()); el.helpBtn.blur(); });
    addEventListener('pointerdown', (ev) => { if (helpOpen() && !el.help.contains(ev.target) && ev.target !== el.helpBtn) setHelp(false); }, true);

    // pixel-art icons for the categories (12 × 12, drawn with the button's own colour; "b" is the dimmer shade)
    const ICONS = {
      room: ['aaaaaaaaaaaa', 'a....a.....a', 'a....a.....a', 'a....a.....a', 'a..........a', 'a....aaa.aaa', 'a....a.....a', 'a....a..bb.a', 'a.bb.a..bb.a', 'a.bb.......a', 'a....a.....a', 'aaaaaaaaaaaa'],
      equip: ['.aaaaaaaaaa.', '.a........a.', '.a.bbbbb.aa.', '.a........a.', '.a.bbbbb.aa.', '.a........a.', '.a.bbbbb.aa.', '.a........a.', '.a.bbbbb.aa.', '.a........a.', '.aaaaaaaaaa.', '.a.a....a.a.'],
      furn: ['...aaaaaa...', '...abbbba...', '...abbbba...', '...abbbba...', '...aaaaaa...', '..aaaaaaaa..', '..abbbbbba..', '..aaaaaaaa..', '.....aa.....', '.....aa.....', '...aaaaaa...', '...a....a...'],
      deco: ['.....a......', '..a..a..a...', '..aa.a.aa...', '...aaaaa....', '.a..aaa..a..', '.aa..a..aa..', '..aaaaaaa...', '.....a......', '..aaaaaaaa..', '..abbbbbba..', '...abbbba...', '...aaaaaa...'],
      cosm: ['............', '...aaaaaa...', '..abbabbaa..', '.abbbabbbaa.', 'aaaaaaaaaaaa', '.abbbabbba..', '..abbabba...', '...abbbba...', '....abba....', '.....aa.....', '............', '............'],
      find: ['..aaaa......', '.a....a.....', 'a..bb..a....', 'a.b....a....', 'a......a....', 'a......a....', '.a....a.....', '..aaaaaa....', '.......aa...', '........aa..', '.........aa.', '..........a.'],
    };
    function pixelIcon(rows) {
      let r = '';
      rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] !== '.') r += '<rect x="' + x + '" y="' + y + '" width="1" height="1"' + (row[x] === 'b' ? ' opacity="0.45"' : '') + '/>'; });
      return '<svg class="bcat__ico" viewBox="0 0 12 12" aria-hidden="true" shape-rendering="crispEdges" fill="currentColor">' + r + '</svg>';
    }
    el.dock.querySelectorAll('[data-ico]').forEach((b) => { const rows = ICONS[b.dataset.ico]; if (rows) b.insertAdjacentHTML('afterbegin', pixelIcon(rows)); });

    el.dock.addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b || b.disabled || b === el.findBtn) return;
      if (b.dataset.scroll) { el.items.scrollBy({ left: +b.dataset.scroll * Math.max(160, el.items.clientWidth * 0.8), behavior: 'smooth' }); return; }
      if (b.classList.contains('bcat')) {
        // a category: the open one clicked again folds the strip (or brings it back); another one opens there
        const fam = B.tab === 'theme' || B.tab === 'style' ? 'deco' : B.tab;
        const same = (b.dataset.family || b.dataset.tab) === fam && !B.findOpen && !(B.q && B.q.trim());
        const folded = el.dock.classList.contains('is-folded');
        if (same && folded) { unfold(); b.blur(); return; }
        if (same) { setClosed(true); b.blur(); return; }
        if (B.closed) setClosed(false);
      }
      if (b.dataset.family) setTab(B.tab === 'deco' || B.tab === 'theme' || B.tab === 'style' ? B.tab : B.decoTab || 'deco');
      else if (b.dataset.tab) setTab(b.dataset.tab);
      else if (b.dataset.def) chooseDef(b.dataset.def);
      else if (b.dataset.roomPick) {
        B.roomIdx = +b.dataset.roomPick;
        const r = world.rooms[B.roomIdx];
        // glide to the room and zoom out if it would not fit above the dock (demo.js)
        if (game.focusArea) showRoom();
        else game.focus((r.x + r.w / 2) * T, (r.y + r.h / 2) * T);
        renderRoom();
      } else if (b.dataset.roomTool) setRoomTool(b.dataset.roomTool);
      else if (b.dataset.wallMat) { B.wallMat = b.dataset.wallMat; renderRoom(); }
      else if (b.dataset.roomType) setRoomType(B.roomIdx, b.dataset.roomType);
      else if (b.dataset.roomMore) { B.roomMore = !B.roomMore; saveDock(); renderRoom(); requestAnimationFrame(showRoom); }
      else if (b.dataset.room) {
        const a = b.dataset.room, i = B.roomIdx;
        if (a === 'w-') resizeRoom(i, -1, 0);
        else if (a === 'w+') resizeRoom(i, 1, 0);
        else if (a === 'h-') resizeRoom(i, 0, -1);
        else if (a === 'h+') resizeRoom(i, 0, 1);
        else if (a === 'floor') toggleFloor(i);
        else if (a === 'add-e') addRoom(i, 'e');
        else if (a === 'add-s') addRoom(i, 's');
        // growing the land asks first (with the price); shrinking is free but gives nothing back
        else if (a === 'lw+') { B.lotAsk = { dw: 4, dh: 0 }; renderRoom(); }
        else if (a === 'lh+') { B.lotAsk = { dw: 0, dh: 4 }; renderRoom(); }
        else if (a === 'lot-ok') {
          const q = B.lotAsk;
          B.lotAsk = null;
          if (!q) renderRoom();
          else if (game.cloudLot) {
            // cloud save: the server charges the land first; the lot grows only when it says yes
            B.lotBusy = true;
            renderRoom();
            game.cloudLot(q.dw, q.dh, builtArea()).then((r) => {
              B.lotBusy = false;
              if (r && r.ok) resizeLot(q.dw, q.dh, false);
              else { nope((r && r.message) || 'Servidor indisponível'); game.toast('warn', 'Expansão recusada', (r && r.message) || 'Servidor indisponível'); renderRoom(); }
            });
          } else resizeLot(q.dw, q.dh, true);
        }
        else if (a === 'lot-no') { B.lotAsk = null; renderRoom(); }
        else if (a === 'lw-') { B.lotAsk = null; resizeLot(-2, 0, true); }
        else if (a === 'lh-') { B.lotAsk = null; resizeLot(0, -2, true); }
        else if (a === 'del') removeRoom(i);
      }
      b.blur();
    });
    el.room.addEventListener('change', (ev) => {
      if (ev.target.matches('[data-room-name]')) renameRoom(B.roomIdx, ev.target.value);
      else if (ev.target.matches('[data-room-type-sel]')) setRoomType(B.roomIdx, ev.target.value);
    });
    el.room.addEventListener('keydown', (ev) => {
      if (!ev.target.matches('[data-room-name]')) return;
      ev.stopPropagation();
      if (ev.key === 'Enter') ev.target.blur();
      if (ev.key === 'Escape') { ev.target.value = world.rooms[B.roomIdx] ? world.rooms[B.roomIdx].name : ''; ev.target.blur(); }
    });

    el.insp.addEventListener('click', (ev) => {
      const st = ev.target.closest('[data-sty]');
      if (st && B.sel) {
        const e = B.sel, k = st.dataset.sty, was = DL.itemStyleGet(e, k), v = st.dataset.v;
        const set = (x) => { DL.itemStyleSet(e, k, x); pos(e); if (B.sel === e) renderInspector(); };
        set(v);
        recSmall('Estilo · ' + DL.itemName(e), () => set(was), () => set(v));
        return;
      }
      const sk = ev.target.closest('[data-item-skin]');
      if (sk && B.sel && DL.applyItemSkin) { DL.applyItemSkin(B.sel, sk.dataset.itemSkin); renderInspector(); return; }
      const b = ev.target.closest('[data-ins]');
      if (!b || !B.sel) return;
      const e = B.sel;
      if (b.dataset.ins === 'move') startMove(e, false);
      else if (b.dataset.ins === 'rotate') { rotate(e); renderInspector(); }
      else if (b.dataset.ins === 'remove') askRemove(e);
      else if (b.dataset.ins === 'unit') { removeUnit(e); renderInspector(); }
      else if (b.dataset.ins === 'hold') { e.hold = !e.hold; renderInspector(); }
    });
    el.insp.addEventListener('pointerdown', (ev) => ev.stopPropagation());

    /* ---------- toolbar: Colocar · Mover · Girar · Apagar · Copiar · Desfazer · Refazer ---------- */
    // what an object (with whatever is installed on it) was bought for, and what selling it gives back
    function valueOf(e) {
      let v = 0;
      for (const x of groupOf(e)) {
        v += x.cost || 0;
        if (x.units) x.units.forEach((u, k) => { if (u) v += unitValue(x, k); });
      }
      return v;
    }
    const refundOf = (e) => (B.free ? 0 : Math.round(valueOf(e) * RESALE));
    // what goes with it: servers in a rack, things on a table, someone working at a desk
    function linksOf(e) {
      const out = [], g = groupOf(e);
      const n = e.units ? e.units.filter(Boolean).length : 0;
      if (n) out.push(n + (n > 1 ? ' equipamentos instalados (e os cabos deles)' : ' equipamento instalado (e os cabos dele)'));
      const s = surfaceOf(e).length;
      if (s) out.push(s + (s > 1 ? ' objetos em cima' : ' objeto em cima'));
      if (game.actors().some((a) => a.crew && a.crew.station && g.indexOf(a.crew.station.key) >= 0)) out.push('alguém da equipe trabalha nela');
      return out;
    }
    const ASK_VALUE = 5000;
    // selling asks first only when it matters: an expensive object, or one with things linked to it
    function askRemove(e) {
      if (!e) return;
      e = e.parent || e;
      if (lonePost(e)) { removePost(e); return; }
      const why = lockReason(e);
      if (why) { nope(why); return; }
      const links = linksOf(e), val = valueOf(e);
      if (isCosm(e) || (val < ASK_VALUE && !links.length)) { removeItem(e); return; }
      const back = refundOf(e);
      showAsk('Vender <b>' + esc(DL.itemName(e)) + '</b>?' + (links.length ? '<br><span class="build-ask__note">Junto: ' + links.join(' · ') + '</span>' : '') +
        '<br>Você recebe <b class="is-cash">' + DL.money(back) + '</b> de volta (metade do preço) · dá para desfazer', 'Vender', () => removeItem(e));
    }
    function showAsk(html, okLabel, onOk) {
      B.ask = { onOk };
      el.ask.innerHTML = '<p>' + html + '</p><div class="build-ask__row"><button type="button" class="btn btn--sm btn--primary" data-ask="ok">' + okLabel + ' <kbd>Enter</kbd></button><button type="button" class="btn btn--sm" data-ask="no">Cancelar <kbd>Esc</kbd></button></div>';
      el.ask.hidden = false;
      requestAnimationFrame(() => el.ask.classList.add('is-on'));
      const ok = el.ask.querySelector('[data-ask="ok"]');
      if (ok) ok.focus({ preventScroll: true });
    }
    function hideAsk() {
      B.ask = null;
      el.ask.classList.remove('is-on');
      el.ask.hidden = true;
      el.ask.innerHTML = '';
    }
    function askOk() { const a = B.ask; hideAsk(); if (a && a.onOk) a.onOk(); }

    // Copiar: the same object again, turned the same way and with the same colours
    function copyItem(e) {
      e = e.parent || e;
      const def = (e.defId && DEF[e.defId]) || DEF[e.kind];
      if (!def || SKIP[e.kind]) { nope('Este elemento faz parte da sala'); return; }
      if (def.cosm) { nope('Cosméticos são únicos: não dá para copiar'); return; }
      const lock = lockedLevel(def);
      if (lock) { nope(def.name + ' libera no nível ' + lock + ' da carreira'); return; }
      const p = def.price ? priceOf(def) : 0;
      if (p > cash()) { nope('Saldo insuficiente · ' + def.name + ' custa ' + DL.money(p)); return; }
      const sty = {};
      for (const o of (DL.ITEM_STYLES && DL.ITEM_STYLES[e.kind]) || []) { const v = DL.itemStyleGet(e, o.key); if (v !== undefined) sty[o.key] = v; }
      if (B.move) cancelMove();
      select(null);
      B.tool = 'select';
      B.def = def;
      B.lastDef = def.mount === 'wallslot' ? B.lastDef : def;
      B.rot = def.rot ? e.rot | 0 : 0;
      B.copy = Object.keys(sty).length ? sty : null;
      B.ghost = B.mouse ? ghostAt(B.mouse.wx, B.mouse.wy) : null;
      syncUi();
      tip('Copiando ' + DL.itemName(e) + ' · clique para colocar');
    }

    // a toolbar button: acts on the selected object right away, otherwise arms the tool for the next click
    function useTool(t) {
      hideAsk();
      if (t === 'place') { placeTool(); return; }
      const sel = B.sel;
      if (B.def) cancelPlace();
      if (sel && t !== 'select') {
        if (t === 'move') startMove(sel, false);
        else if (t === 'rotate') { rotate(sel); renderInspector(); }
        else if (t === 'copy') copyItem(sel);
        else if (t === 'remove') askRemove(sel);
        syncUi();
        return;
      }
      if (t !== 'select' && (B.tab === 'room' || B.tab === 'style')) setTab(B.itemTab || 'equip');
      if (B.move && t !== 'move') cancelMove();
      B.tool = t;
      select(null);
      syncUi();
    }
    // Colocar: the last item again, or the catalog with the search ready
    function placeTool() {
      if (B.def) return;
      const d = B.lastDef;
      if (B.tab === 'room' || B.tab === 'style') setTab(d && ITEM_TABS.indexOf(d.cat) >= 0 ? d.cat : B.itemTab || 'equip');
      if (d && !lockedLevel(d)) { chooseDef(d.id); if (B.def) return; }
      openFind();
    }
    function syncTools() {
      if (!el.tools) return;
      el.tools.querySelectorAll('[data-tool]').forEach((b) => {
        const t = b.dataset.tool;
        const on = t === 'place' ? !!B.def && !B.move : t === 'move' ? !!B.move || (B.tool === 'move' && !B.def) : B.tool === t && !B.def && !B.move;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
    }
    function syncHist() {
      if (!el.tools) return;
      const u = el.tools.querySelector('[data-hist="undo"]'), r = el.tools.querySelector('[data-hist="redo"]'), c = el.tools.querySelector('[data-hist="cancel"]');
      const last = H.undo[H.undo.length - 1], next = H.redo[H.redo.length - 1];
      u.disabled = !H.undo.length;
      r.disabled = !H.redo.length;
      c.disabled = !H.undo.length;
      u.title = last ? 'Desfazer: ' + last.label + ' (Ctrl+Z)' : 'Nada para desfazer (Ctrl+Z)';
      r.title = next ? 'Refazer: ' + next.label + ' (Ctrl+Y)' : 'Nada para refazer (Ctrl+Y)';
      const n = sessionCost();
      el.sess.textContent = n > 0 ? '−' + DL.money(n) : n < 0 ? '+' + DL.money(-n) : DL.money(0);
      el.sess.className = n > 0 ? 'is-spend' : n < 0 ? 'is-cash' : '';
      const cnt = el.tools.querySelector('.build-tools__count');
      if (cnt) cnt.textContent = H.undo.length ? H.undo.length + (H.undo.length > 1 ? ' mudanças' : ' mudança') : 'sem mudanças';
    }
    function syncCash() {
      const co = company(), v = co ? co.cash : null;
      const txt = v == null ? '—' : DL.money(v);
      // one number on screen: the company card (economy.js, refreshed every 0.25 s) shows the same as the toolbar
      const ec = document.getElementById('econCash');
      if (ec && v != null && ec.textContent !== txt) ec.textContent = txt;
      if (txt === B.cashShown) return;
      B.cashShown = txt;
      el.cash.textContent = txt;
      el.cash.classList.toggle('is-neg', v != null && v < 0);
      if (B.tab !== 'room' && B.tab !== 'style' || (B.q && B.q.trim())) refreshAfford();
    }
    function confirmAll() {
      if (B.move) cancelMove();
      const n = H.undo.length;
      clearHist();
      if (n) game.toast('ok', 'Construção confirmada', n + (n > 1 ? ' mudanças salvas' : ' mudança salva'));
      game.setMode('explore');
    }
    function cancelAll() {
      if (!H.undo.length) return;
      const n = H.undo.length, cost = sessionCost();
      showAsk('Desfazer <b>' + n + (n > 1 ? ' mudanças' : ' mudança') + '</b> desta sessão?' +
        (cost > 0 ? '<br>Você recebe de volta <b class="is-cash">' + DL.money(cost) + '</b>.' : cost < 0 ? '<br>As vendas voltam atrás: <b class="is-spend">−' + DL.money(-cost) + '</b>.' : ''), 'Desfazer tudo', () => {
        while (H.undo.length) if (!undo()) break;
        tip('Tudo desfeito');
      });
    }
    if (el.tools) {
      el.tools.addEventListener('click', (ev) => {
        const b = ev.target.closest('button');
        if (!b || b.disabled) return;
        if (b.dataset.tool) useTool(b.dataset.tool);
        else if (b.dataset.hist === 'undo') { hideAsk(); undo(); }
        else if (b.dataset.hist === 'redo') { hideAsk(); redo(); }
        else if (b.dataset.hist === 'cancel') cancelAll();
        else if (b.dataset.hist === 'ok') confirmAll();
        else if (b.dataset.ask === 'ok') askOk();
        else if (b.dataset.ask === 'no') hideAsk();
        if (!b.dataset.ask) b.blur();
      });
      el.tools.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    }
    // search: typing filters every item tab at once; the letters never reach the game (WASD, B…)
    if (el.search) {
      el.search.addEventListener('input', () => { B.q = el.search.value; renderCatalog(); syncUi(); el.items.scrollLeft = 0; });
      el.search.addEventListener('keydown', (ev) => {
        ev.stopPropagation();
        if (ev.key === 'Escape') { closeFind(); ev.preventDefault(); }
        else if (ev.key === 'Enter' || ev.key === 'ArrowDown') {
          // Enter picks the first result; ↓ walks into the strip
          const first = el.items.querySelector('.cat-item:not(.is-locked):not(.is-poor)') || el.items.querySelector('.cat-item');
          if (first && ev.key === 'Enter') { const id = first.dataset.def; closeFind(); chooseDef(id); }
          else if (first) first.focus();
          ev.preventDefault();
        }
      });
    }
    // ← / → (and Home / End) move between the cards; ↑ goes back to the search box when it is open
    el.items.addEventListener('keydown', (ev) => {
      const all = Array.from(el.items.querySelectorAll('.cat-item')), i = all.indexOf(document.activeElement);
      if (i < 0) return;
      let n = null;
      if (ev.key === 'ArrowRight' || ev.key === 'ArrowDown') n = all[i + 1];
      else if (ev.key === 'ArrowLeft') n = all[i - 1];
      else if (ev.key === 'Home') n = all[0];
      else if (ev.key === 'End') n = all[all.length - 1];
      else if (ev.key === 'ArrowUp') { if (B.findOpen) el.search.focus(); }
      else return;
      if (n) { n.focus(); n.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
      ev.preventDefault();
      ev.stopPropagation();
    });
    // Ctrl+Z / Ctrl+Y (or Ctrl+Shift+Z) / Ctrl+C: the game's own key handler skips Ctrl, so they live here
    addEventListener('keydown', (ev) => {
      if (!B.active || !(ev.ctrlKey || ev.metaKey) || ev.altKey) return;
      const tag = document.activeElement && document.activeElement.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (document.querySelector('.game.is-overlay, .modal.is-open')) return;
      const c = ev.code;
      if (c === 'KeyZ' && !ev.shiftKey) { hideAsk(); undo(); }
      else if (c === 'KeyY' || (c === 'KeyZ' && ev.shiftKey)) { hideAsk(); redo(); }
      else if (c === 'KeyC') { if (B.sel) copyItem(B.sel); else useTool('copy'); }
      else return;
      ev.preventDefault();
    });

    /* ---------- input ---------- */
    function pointerMove(sx, sy) {
      const w = scene.screenToWorld(sx, sy);
      B.mouse = { sx, sy, wx: w.x, wy: w.y };
      if (B.tab === 'room' && !B.pan) {
        const tx = Math.floor(w.x / T), ty = Math.floor(w.y / T);
        if (B.draw) { B.draw.x1 = tx; B.draw.y1 = ty; roomPreview(); return; }
        if (B.resize) { B.resize.rect = resizeRect(); roomPreview(); return; }
        if (B.wd) { B.wd.x1 = tx; B.wd.y1 = ty; B.wd.erase = B.wd.erase0 || B.shift; roomPreview(); return; }
        B.roomHover = { tx, ty };
        if (isWallTool()) B.roomHover.plan = wallPlan({ x0: tx, y0: ty, x1: tx, y1: ty, erase: B.roomTool === 'erase' || B.shift });
        else if (B.roomTool === 'select' && !B.down) {
          const e = edgeAt(w.x, w.y);
          game.setCursor(!e ? '' : e === 'l' || e === 'r' ? 'ew-resize' : e === 't' || e === 'b' ? 'ns-resize' : e === 'tl' || e === 'br' ? 'nwse-resize' : 'nesw-resize');
        }
      }
      if (B.pan) {
        const d = scene.screenDelta(sx - B.pan.sx, sy - B.pan.sy);
        scene.cam.x = B.pan.cx - d.x;
        scene.cam.y = B.pan.cy - d.y;
        return;
      }
      if (B.down && !B.move && B.down.item && Math.hypot(sx - B.down.sx, sy - B.down.sy) > 5) {
        const it = B.down.item;
        B.down = null;
        startMove(it, true);
        return;
      }
      if (B.down && !B.down.item && Math.hypot(sx - B.down.sx, sy - B.down.sy) > 4) {
        B.pan = { sx: B.down.sx, sy: B.down.sy, cx: B.down.cx, cy: B.down.cy };
        B.down = null;
        return;
      }
      if (B.move) updateMove();
      else if (B.def) B.ghost = ghostAt(w.x, w.y);
      else if (B.tab !== 'room' && B.tab !== 'style') B.hover = pick(w.x, w.y);
    }

    function pointerDown(sx, sy, button) {
      if (button === 2) { rightClick(); return; }
      pointerMove(sx, sy);
      const m = B.mouse;
      if (B.move) { dropMove(); return; }
      // (a cosmetic leaves the hand once placed: no ghost to follow the mouse then)
      if (B.def) { place(); if (B.def) B.ghost = ghostAt(m.wx, m.wy); return; }
      if (B.tab === 'room') {
        const tx = Math.floor(m.wx / T), ty = Math.floor(m.wy / T);
        if (B.roomTool === 'draw') { B.draw = { x0: tx, y0: ty, x1: tx, y1: ty }; B.previewKey = ''; roomPreview(); return; }
        if (isWallTool()) {
          const er = B.roomTool === 'erase' || B.shift;
          B.wd = { x0: tx, y0: ty, x1: tx, y1: ty, box: B.roomTool === 'box', erase: er, erase0: B.roomTool === 'erase' };
          B.previewKey = '';
          roomPreview();
          return;
        }
        // doors are picked and dragged right here, like furniture
        const door = pick(m.wx, m.wy);
        if (door && door.kind === 'door') {
          select(door);
          B.down = { sx, sy, item: door, cx: scene.cam.x, cy: scene.cam.y };
          return;
        }
        if (B.sel) select(null);
        const edge = edgeAt(m.wx, m.wy);
        if (edge) { const ai = selArea(); B.resize = { i: ai, edge, rect: Object.assign({}, world.areas[ai]) }; B.previewKey = ''; return; }
        const i = roomIndexAt(tx, ty);
        if (i >= 0) { B.roomIdx = i; renderRoom(); }
        B.down = { sx, sy, cx: scene.cam.x, cy: scene.cam.y };
        return;
      }
      if (B.tab === 'style') {
        const tx = Math.floor(m.wx / T), ty = Math.floor(m.wy / T);
        const i = tx >= 0 && ty >= 0 && tx < world.W && ty < world.H ? world.roomAt[ty * world.W + tx] : -1;
        if (i >= 0 && i !== B.roomIdx) { B.roomIdx = i; game.emit('style-room', i); }
        B.down = { sx, sy, cx: scene.cam.x, cy: scene.cam.y };
        return;
      }
      if (B.tool === 'remove') { askRemove(pick(m.wx, m.wy)); B.hover = pick(m.wx, m.wy); return; }
      if (B.tool === 'move' || B.tool === 'rotate' || B.tool === 'copy') {
        const it = pick(m.wx, m.wy);
        if (!it) { nope('Clique num objeto'); return; }
        if (B.tool === 'move') startMove(it, false);
        else if (B.tool === 'rotate') rotate(it);
        else copyItem(it);
        return;
      }
      const it = pick(m.wx, m.wy);
      select(it);
      B.down = { sx, sy, item: it && !lockReason(it) ? it : null, cx: scene.cam.x, cy: scene.cam.y };
    }

    function pointerUp() {
      if (B.draw) {
        const rc = drawRect();
        B.draw = null;
        B.roomReason = null;
        if (rc.w > 1 || rc.h > 1) createRoom(rc);
        else nope('Arraste para desenhar a sala');
      }
      if (B.resize) {
        const z = B.resize;
        B.resize = null;
        B.roomReason = null;
        const r = world.areas[z.i];
        if (r && (z.rect.x !== r.x || z.rect.y !== r.y || z.rect.w !== r.w || z.rect.h !== r.h)) setRoomRect(z.i, { x: z.rect.x, y: z.rect.y, w: z.rect.w, h: z.rect.h });
      }
      if (B.wd) {
        const wd = B.wd;
        B.wd = null;
        B.roomReason = null;
        wd.erase = wd.erase0 || wd.erase;
        applyWall(wd);
        if (B.mouse) { const tx = Math.floor(B.mouse.wx / T), ty = Math.floor(B.mouse.wy / T); B.roomHover = { tx, ty, plan: wallPlan({ x0: tx, y0: ty, x1: tx, y1: ty, erase: B.roomTool === 'erase' || B.shift }) }; }
        renderRoom();
      }
      if (B.move && B.move.drag) dropMove();
      B.down = null;
      B.pan = null;
    }

    // a second finger landed (pinch to zoom, demo.js): forget the half-made drag without applying it
    function pointerAbort() {
      B.draw = B.resize = B.wd = null;
      B.roomReason = null;
      if (B.move && B.move.drag) cancelMove();
      B.down = null;
      B.pan = null;
    }

    function rightClick() {
      if (helpOpen()) setHelp(false);
      if (B.draw || B.resize || B.wd) { B.draw = null; B.resize = null; B.wd = null; B.roomReason = null; return; }
      if (B.tab === 'room' && B.roomTool !== 'select') { setRoomTool('select'); return; }
      if (B.ask) hideAsk();
      else if (B.move) cancelMove();
      else if (B.def) cancelPlace();
      else if (B.tool !== 'select') { B.tool = 'select'; syncUi(); }
      else select(null);
      syncUi();
    }

    function key(ev) {
      const c = ev.code;
      // a question on screen (sell? undo everything?): Enter says yes, Esc says no
      if (B.ask) {
        if (c === 'Enter' || c === 'NumpadEnter') { askOk(); return true; }
        if (c === 'Escape') { hideAsk(); return true; }
      }
      // ?: the shortcut list · /: the search (by the character, so it works on any keyboard layout)
      if (ev.key === '?') { setHelp(!helpOpen()); return true; }
      if (c === 'Escape' && helpOpen()) { setHelp(false); return true; }
      if (ev.key === '/' || c === 'NumpadDivide') { openFind(); return true; }
      if (c === 'Escape' && B.findOpen) { closeFind(); return true; }
      // Tab with an item in the hand: the strip comes back and the item stays (otherwise Tab moves the focus as usual)
      if (c === 'Tab' && !ev.shiftKey && B.def && el.dock.classList.contains('is-folded') && !B.closed) { unfold(); return true; }
      // Q folds the catalog away / brings it back (not while a list is focused: letters pick options there)
      if (c === 'KeyQ' && !ev.repeat && !(document.activeElement && document.activeElement.tagName === 'SELECT')) { setClosed(!B.closed); return true; }
      if (B.tab === 'room') {
        if (c === 'Escape' && (B.draw || B.resize || B.wd)) { B.draw = null; B.resize = null; B.wd = null; B.roomReason = null; return true; }
        if (c === 'Escape' && B.move) { cancelMove(); syncUi(); return true; }
        if (c === 'Escape' && B.roomTool !== 'select') { setRoomTool('select'); return true; }
        if (c === 'KeyR' && (B.roomTool === 'wall' || B.roomTool === 'box')) {
          B.wallMat = B.wallMat === 'solid' ? 'glass' : 'solid';
          renderRoom();
          return true;
        }
        // doors (placing, moving or selected) use the regular item keys below
        const doorish = B.def || B.move || (B.sel && B.sel.kind === 'door');
        if (!doorish && (c === 'KeyR' || c === 'Delete' || c === 'Backspace' || c === 'KeyM' || c === 'KeyX')) return true;
        if (c === 'KeyX' || c === 'KeyV') return true;
      }
      if (c === 'Escape') {
        if (B.move) cancelMove();
        else if (B.def) cancelPlace();
        else if (B.tool !== 'select') B.tool = 'select';
        else if (B.sel) select(null);
        else { game.setMode('explore'); return true; }
        syncUi();
        return true;
      }
      if (c === 'KeyR') {
        if (B.move) {
          const e = B.move.e;
          if (e.kind === 'door') { e.rot = (e.rot + 1) % 4; updateMove(); }
          else if (canTurn(e)) { turn(e); pos(e); updateMove(); }
        } else if (B.def) {
          if (B.def.rot) { B.rot = B.def.mount === 'wallslot' ? (B.rot + 1) % 4 : DL.ROT_NEXT[B.rot | 0]; if (B.mouse) B.ghost = ghostAt(B.mouse.wx, B.mouse.wy); }
        } else if (B.sel) { rotate(B.sel); renderInspector(); }
        else useTool('rotate');
        return true;
      }
      if (c === 'Delete' || c === 'Backspace') { if (B.sel) askRemove(B.sel); return true; }
      if (c === 'KeyX') { useTool(B.tool === 'remove' ? 'select' : 'remove'); return true; }
      if (c === 'KeyV') { useTool('select'); return true; }
      if (c === 'KeyM') { if (B.sel) startMove(B.sel, false); else if (!B.move) useTool(B.tool === 'move' ? 'select' : 'move'); return true; }
      return false;
    }

    /* ---------- drawing ---------- */
    function dev(g, wx, wy, ww, wh, fill, stroke) {
      const S = scene.S;
      if (scene.iso) {
        // isometric: the same rectangle laid on the floor
        g.save();
        scene.groundTransform(g);
        if (fill) { g.fillStyle = fill; g.fillRect(wx, wy, ww, wh); }
        if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1.2 / S; g.strokeRect(wx, wy, ww, wh); }
        g.restore();
        return;
      }
      const x = Math.round(wx * S - scene.ox), y = Math.round(wy * S - scene.oy);
      const w = Math.round((wx + ww) * S - scene.ox) - x, h = Math.round((wy + wh) * S - scene.oy) - y;
      if (fill) { g.fillStyle = fill; g.fillRect(x, y, w, h); }
      if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1; g.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1); }
    }

    // the outline of room i: a line of `px` device pixels along each side of its floor that borders something else
    function roomEdge(g, i, x0, y0, x1, y1, px, color) {
      const W = world.W, H = world.H, at = (x, y) => (x >= 0 && y >= 0 && x < W && y < H ? world.roomAt[y * W + x] : -1);
      g.fillStyle = color;
      if (scene.iso) {
        const d = px / scene.S;
        for (let y = y0; y <= y1; y++) {
          for (let x = x0; x <= x1; x++) {
            if (at(x, y) !== i) continue;
            const X = x * T, Y = y * T;
            if (at(x, y - 1) !== i) g.fillRect(X, Y, T, d);
            if (at(x, y + 1) !== i) g.fillRect(X, Y + T - d, T, d);
            if (at(x - 1, y) !== i) g.fillRect(X, Y, d, T);
            if (at(x + 1, y) !== i) g.fillRect(X + T - d, Y, d, T);
          }
        }
        return;
      }
      const S = scene.S, p = Math.max(1, Math.round(px));
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          if (at(x, y) !== i) continue;
          const X = Math.round(x * T * S - scene.ox), Y = Math.round(y * T * S - scene.oy), L = Math.round(T * S);
          if (at(x, y - 1) !== i) g.fillRect(X, Y, L, p);
          if (at(x, y + 1) !== i) g.fillRect(X, Y + L - p, L, p);
          if (at(x - 1, y) !== i) g.fillRect(X, Y, p, L);
          if (at(x + 1, y) !== i) g.fillRect(X + L - p, Y, p, L);
        }
      }
    }

    function footprint(g, list, ok) {
      const fill = ok ? 'rgba(126,224,161,0.18)' : 'rgba(242,73,92,0.24)';
      const line = ok ? 'rgba(126,224,161,0.8)' : 'rgba(242,73,92,0.9)';
      for (const e of list) for (const [x, y] of cells(e)) dev(g, x * T, y * T, T, T, fill, line);
    }

    function underlay(g) {
      if (!B.active) return;
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      const S = scene.S, W = world.W, H = world.H;
      const { x0, y0, x1, y1 } = scene.tileRange();
      // tile grid: one device pixel lines (on the floor plane in the isometric view)
      if (scene.iso) scene.groundTransform(g);
      const gridCell = (x, y) => {
        if (scene.iso) { g.fillRect(x * T, y * T, T, 1 / S); g.fillRect(x * T, y * T, 1 / S, T); return; }
        const px = Math.round(x * T * S - scene.ox), py = Math.round(y * T * S - scene.oy);
        g.fillRect(px, py, Math.round(T * S), 1);
        g.fillRect(px, py, 1, Math.round(T * S));
      };
      // Espaços + Selecionar: the selected room's grid is drawn in neon, the rest stays faint
      const focus = B.tab === 'room' && B.roomTool === 'select' && world.rooms[B.roomIdx] ? B.roomIdx : -1;
      const GRID = 'rgba(255,255,255,0.075)', GRID_ON = 'rgba(126,240,170,0.26)';
      g.fillStyle = GRID;
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const t = world.tiles[y * W + x];
          if (t === '#' || t === 'g' || t === 'G' || t === 'w') continue;
          if (focus >= 0 && world.roomAt[y * W + x] === focus) continue;
          gridCell(x, y);
        }
      }
      if (focus >= 0) {
        g.fillStyle = GRID_ON;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (world.roomAt[y * W + x] === focus) gridCell(x, y);
      }
      if (B.tab === 'style') {
        world.rooms.forEach((r, i) => {
          const on = i === B.roomIdx;
          dev(g, r.x * T, r.y * T, r.w * T, r.h * T, null, on ? 'rgba(196,181,253,0.85)' : 'rgba(255,255,255,0.1)');
        });
      }
      if (B.tab === 'room') {
        if (world.lot) {
          // the whole lot gets a faint grid so empty ground reads as buildable
          g.fillStyle = 'rgba(255,255,255,0.035)';
          for (let y = y0; y <= Math.min(y1, world.lot.h - 1); y++) {
            for (let x = x0; x <= Math.min(x1, world.lot.w - 1); x++) {
              if (world.tiles[y * W + x] !== '#') continue;
              gridCell(x, y);
            }
          }
          dev(g, 0, 0, world.lot.w * T, world.lot.h * T, null, 'rgba(255,255,255,0.12)');
        }
        // selected room: a soft neon glow on its floor and a bright outline along its edge; the other rooms
        // dim a little so the selection stands out; handles on the floor area it sits on
        if (focus >= 0) {
          const glow = 'rgba(126,240,170,' + (0.075 + 0.025 * Math.sin(scene.t * 2.4)).toFixed(3) + ')';
          // one rectangle per run of tiles along a row (not one per tile): same picture, far fewer calls
          const band = (want, fill) => {
            g.fillStyle = fill;
            for (let y = y0; y <= y1; y++) {
              let x = x0;
              while (x <= x1) {
                if (!want(world.roomAt[y * W + x])) { x++; continue; }
                let e = x;
                while (e + 1 <= x1 && want(world.roomAt[y * W + e + 1])) e++;
                if (scene.iso) g.fillRect(x * T, y * T, (e - x + 1) * T, T);
                else dev(g, x * T, y * T, (e - x + 1) * T, T, fill, null);
                x = e + 1;
              }
            }
          };
          band((ri) => ri === focus, glow);
          band((ri) => ri >= 0 && ri !== focus, 'rgba(4,6,10,0.22)');
          roomEdge(g, focus, x0, y0, x1, y1, 3, 'rgba(126,240,170,0.22)');
          roomEdge(g, focus, x0, y0, x1, y1, 1.5, 'rgba(150,255,190,0.95)');
        }
        if (isWallTool() || B.roomTool === 'door' || B.roomTool === 'door2') {
          // walls stand out while editing them
          for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
              const t = world.tiles[y * W + x];
              if (t === 'w') dev(g, x * T + 1, y * T + 1, T - 2, T - 2, 'rgba(160,195,236,0.10)', 'rgba(160,195,236,0.35)');
              else if (t === 'd' || t === 'D') dev(g, x * T + 1, y * T + 1, T - 2, T - 2, 'rgba(255,194,133,0.12)', 'rgba(255,194,133,0.45)');
            }
          }
        }
        world.areas.forEach((r, i) => {
          const on = i === selArea() && B.roomTool === 'select';
          dev(g, r.x * T, r.y * T, r.w * T, r.h * T, null, on ? 'rgba(160,195,236,0.5)' : 'rgba(255,255,255,0.08)');
          if (on && !r.fixed && !B.resize) {
            // resize handles: a dark square with a neon centre, big enough to see (and to hit with a finger)
            const hs = ((DL.MOBILE ? 14 : 10) * scene.dpr) / S, hi = hs * 0.55;
            for (const [hx, hy] of [[r.x + r.w / 2, r.y], [r.x + r.w / 2, r.y + r.h], [r.x, r.y + r.h / 2], [r.x + r.w, r.y + r.h / 2], [r.x, r.y], [r.x + r.w, r.y], [r.x, r.y + r.h], [r.x + r.w, r.y + r.h]]) {
              dev(g, hx * T - hs / 2, hy * T - hs / 2, hs, hs, 'rgba(6,20,12,0.9)', 'rgba(126,240,170,0.95)');
              dev(g, hx * T - hi / 2, hy * T - hi / 2, hi, hi, '#7ef0aa', null);
            }
          }
        });
        const ok = !B.roomReason;
        const fill = ok ? 'rgba(126,224,161,0.14)' : 'rgba(255,122,23,0.16)', line = ok ? 'rgba(126,224,161,0.85)' : 'rgba(255,122,23,0.85)';
        if (B.draw && B.draw.rect) {
          const r = B.draw.rect;
          dev(g, (r.x - 1) * T, (r.y - 1) * T, (r.w + 2) * T, (r.h + 2) * T, ok ? 'rgba(126,224,161,0.06)' : 'rgba(255,122,23,0.06)', null);
          dev(g, r.x * T, r.y * T, r.w * T, r.h * T, fill, line);
        }
        if (B.resize && B.resize.rect) {
          const r = B.resize.rect;
          dev(g, r.x * T, r.y * T, r.w * T, r.h * T, fill, line);
        }
        // wall being dragged (or the tile under the cursor): green = new, orange = blocked, red = erase
        const wp = B.wd ? B.wd.plan : B.roomHover && !B.draw && !B.resize && isWallTool() ? B.roomHover.plan : null;
        if (wp) {
          const col = { new: 'rgba(126,224,161,', bad: 'rgba(255,122,23,', del: 'rgba(242,73,92,', skip: 'rgba(255,255,255,' };
          for (const t of wp.tiles) {
            const c = col[t.st];
            dev(g, t.x * T, t.y * T, T, T, c + (t.st === 'skip' ? '0.04)' : '0.24)'), c + (t.st === 'skip' ? '0.25)' : '0.85)'));
          }
          if (B.wd) {
            const a = B.wd, s = 3 / S;
            dev(g, a.x0 * T + T / 2 - s, a.y0 * T + T / 2 - s, s * 2, s * 2, '#ffffff', null);
          }
        }
      }
      if (B.tab !== 'room' && (B.def || B.move) && world.items.some((e) => e.kind === 'door')) {
        // keep door passages visible while furnishing
        for (const k of world.keepClear) { const [x, y] = k.split(',').map(Number); dev(g, x * T, y * T, T, T, 'rgba(255,194,133,0.06)', null); }
      }
      if (B.move) footprint(g, B.move.group, !B.move.reason);
      else if (B.ghost && B.ghost.group) footprint(g, B.ghost.group.filter((x) => !x.host), !B.ghost.reason);
      if (B.ghost && B.def && B.def.mount === 'rack' && B.ghost.mount) footprint(g, [B.ghost.mount], !B.ghost.reason);
      if (B.ghost && B.ghost.table) {
        const ok = !B.ghost.reason;
        dev(g, B.ghost.tx * T, B.ghost.ty * T, T, T, ok ? 'rgba(126,224,161,0.18)' : 'rgba(242,73,92,0.24)', ok ? 'rgba(126,224,161,0.8)' : 'rgba(242,73,92,0.9)');
      }
      if (B.sel && !B.move) {
        for (const e of groupOf(B.sel)) for (const [x, y] of cells(e)) dev(g, x * T, y * T, T, T, 'rgba(255,255,255,0.05)', 'rgba(255,255,255,0.45)');
      }
      if (!B.def && !B.move && B.hover && B.hover !== B.sel && B.tab !== 'room') {
        const rm = B.tool === 'remove';
        for (const e of groupOf(B.hover)) for (const [x, y] of cells(e)) dev(g, x * T, y * T, T, T, rm ? 'rgba(242,73,92,0.2)' : 'rgba(126,240,170,0.06)', rm ? 'rgba(242,73,92,0.85)' : 'rgba(126,240,170,0.55)');
      }
      g.restore();
    }

    function overlay(g, sc) {
      if (!B.active) return;
      // ghosts are drawn like the real thing: projected in the isometric view
      const drawGhost = scene.iso ? (e, t) => scene.drawItemIso(g, e, t) : (e, t) => DL.drawItem(g, e, t);
      if (B.wd && B.wd.plan && !B.wd.erase) {
        // translucent wall pieces where the new wall will stand, joined like the real thing
        const fresh = new Set(B.wd.plan.tiles.filter((t) => t.st === 'new').map((t) => tkey(t.x, t.y)));
        const axs = new Map(B.wd.plan.tiles.map((t) => [tkey(t.x, t.y), t.ax]));
        const J = wallJoins((x, y) => (fresh.has(tkey(x, y)) ? 'w' : tileAt(x, y)), (x, y) => (fresh.has(tkey(x, y)) ? axs.get(tkey(x, y)) : wallAx(world.wallSet.get(tkey(x, y)))) + (axs.has(tkey(x, y)) ? axs.get(tkey(x, y)) : ''));
        g.globalAlpha = B.wd.plan.reason ? 0.35 : 0.7;
        for (const t of B.wd.plan.tiles.filter((t) => t.st === 'new').sort((a, b) => a.y - b.y || a.x - b.x)) {
          drawGhost({ kind: 'wallseg', px: t.x * T, py: t.y * T, tx: t.x, ty: t.y, tw: 1, th: 1, mat: B.wallMat, l: J.h(t.x, t.y, t.x - 1), r: J.h(t.x, t.y, t.x + 1), u: J.v(t.x, t.y, t.y - 1), d: J.v(t.x, t.y, t.y + 1) }, sc.t);
        }
        g.globalAlpha = 1;
      }
      const ghost = B.move ? B.move.group : B.ghost && B.ghost.group;
      if (ghost) {
        g.globalAlpha = (B.move ? B.move.reason : B.ghost && B.ghost.reason) ? 0.45 : 0.8;
        const depth = scene.iso ? (e) => e.px + e.py + (e.tw || 1) * 8 + (e.th || 1) * 8 + (e.host ? 0.5 : 0) : (e) => e.sortY;
        for (const e of ghost.slice().sort((a, b) => depth(a) - depth(b))) drawGhost(e, sc.t);
        g.globalAlpha = 1;
      }
      if (B.ghost && B.def && B.def.mount === 'rack' && B.ghost.mount && !B.ghost.reason) {
        const r = B.ghost.mount, k = r.units.indexOf(null);
        const a = 0.5 + 0.35 * Math.sin(sc.t * 6);
        g.save();
        // the free slot on the rack's front (its own sprite coordinates)
        if (scene.iso) scene.spriteSpace(g, r);
        g.fillStyle = 'rgba(126,224,161,' + a.toFixed(3) + ')';
        g.fillRect(r.px + 3, r.py - 15 + k * 3, 10, 2);
        g.restore();
      }
    }

    // DOM bits anchored to the world: inspector card + reason tooltip
    function updateUi() {
      tickDoors();
      if (!B.active) return;
      if (B.sel && el.insp.classList.contains('is-on')) {
        const b = B.sel.bounds || { x: B.sel.px, y: B.sel.py, w: 16, h: 16 };
        const p = scene.iso ? scene.itemTop(B.sel, 4) : scene.worldToScreen(b.x + b.w / 2, b.y - 4);
        el.insp.style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px) translate(-50%,-100%)';
      }
      const hp = null; // wall tools colour the tiles under the cursor instead
      const reason = B.move ? B.move.reason : B.draw || B.resize || B.wd ? B.roomReason : B.def ? B.ghost && B.ghost.reason : B.tab === 'room' ? hp : B.ghost && B.ghost.reason;
      const now = performance.now();
      const flash = B.tipUntil > now, warn = flash && !B.tipOk ? B.tipText : !flash ? reason : null;
      // while dragging a wall the tip also shows its length; the sell tool says what comes back
      let info = flash && B.tipOk ? B.tipText : B.wd && B.wd.plan ? B.wd.plan.info : null;
      if (!info && !warn && B.tool === 'remove' && B.hover && !B.def && !B.move && B.tab !== 'room') {
        const h = B.hover.parent || B.hover;
        info = lockReason(h) || (isCosm(h) ? 'Guardar no inventário · ' + DL.itemName(h) : 'Vender ' + DL.itemName(h) + ' · recebe ' + DL.money(refundOf(h)));
      }
      // the item in the hand always shows its price next to the cursor (green: fits · red: why it can't go there)
      if (!info && B.def && B.ghost && B.def.price && !B.def.cosm) {
        const p = priceOf(B.def);
        info = B.def.name + ' · ' + (p ? DL.money(p) : 'grátis (kit inicial)');
      }
      const text = warn && info ? info + ' · ' + warn : warn || info;
      if (text && B.mouse) {
        if (el.tip.textContent !== text) el.tip.textContent = text;
        el.tip.style.transform = 'translate(' + (B.mouse.sx + 14) + 'px,' + (B.mouse.sy + 16) + 'px)';
        el.tip.classList.add('is-on');
        el.tip.classList.toggle('is-warn', !!warn);
      } else el.tip.classList.remove('is-on');
      syncCash();
    }

    function enter() {
      B.active = true;
      el.dock.hidden = false;
      el.dock.classList.toggle('is-userfold', B.closed);
      requestAnimationFrame(() => el.dock.classList.add('is-on'));
      if (el.tools) { el.tools.hidden = false; requestAnimationFrame(() => el.tools.classList.add('is-on')); }
      if (el.keys) el.keys.hidden = false;
      B.cashShown = undefined;
      B.auto = false;
      syncCash();
      syncHist();
      if (B.tab === 'room') renderRoom();
      else renderCatalog();
      syncUi();
      // the whole datacenter in view, centred in the space the bars leave (after they have their size)
      requestAnimationFrame(() => requestAnimationFrame(fitAll));
    }
    // every room's floor, framed with a margin (demo.js glides and zooms there)
    function fitAll() {
      const rs = world.rooms;
      if (!B.active || !rs.length || !game.fitArea) return;
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const r of rs) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); }
      // (the walls stand one tile outside the floor)
      game.fitArea((x0 - 1) * T, (y0 - 1) * T, (x1 - x0 + 2) * T, (y1 - y0 + 2) * T);
    }

    function exit() {
      if (B.move) cancelMove();
      B.draw = null;
      B.resize = null;
      B.wd = null;
      B.roomHover = null;
      B.roomReason = null;
      B.def = null;
      B.ghost = null;
      B.hover = null;
      B.pan = null;
      B.down = null;
      select(null);
      hideAsk();
      hideTipCard();
      setHelp(false);
      if (B.findOpen || B.q) closeFind();
      B.auto = false;
      // leaving build mode keeps what was built (same as Confirmar)
      clearHist();
      B.tool = 'select';
      B.copy = null;
      B.active = false;
      el.dock.classList.remove('is-on');
      el.dock.hidden = true;
      if (el.tools) { el.tools.classList.remove('is-on'); el.tools.hidden = true; }
      if (el.keys) el.keys.hidden = true;
      el.tip.classList.remove('is-on');
      game.setCursor('');
    }

    game.on('world', () => {
      if (B.sel && world.items.indexOf(B.sel) < 0) select(null);
      else if (B.sel) renderInspector();
      if (B.tab === 'room' && B.active) renderRoom();
    });
    // a promotion (or a new game / loaded save) changes what the catalog lets the player buy
    game.on('career', () => {
      if (B.def && lockedLevel(B.def)) cancelPlace();
      renderCatalogSoon();
    });
    // a cosmetic bought (or the account's inventory arriving) changes what the Cosméticos tab offers
    game.on('inventory', () => { if (B.tab === 'cosm') renderCatalogSoon(); });

    return {
      get active() { return B.active; },
      get state() { return B; },
      enter, exit, pointerMove, pointerDown, pointerUp, pointerAbort, key, underlay, overlay, updateUi, fitAll,
      // the toolbar's history (tests and the tutorial)
      undo, redo, confirmAll, useTool, get history() { return { undo: H.undo.length, redo: H.redo.length, cost: sessionCost() }; },
      // the tutorial opens the catalog straight on the item it asks for, scrolled into view
      choose(id) {
        const def = DEF[id];
        if (!def || !B.active) return;
        if (B.tab !== def.cat) setTab(def.cat);
        if (B.group && def.group !== B.group) { B.group = null; renderCatalog(); }
        if (B.def !== def) chooseDef(id);
        if (B.q) { B.q = ''; if (el.search) el.search.value = ''; renderCatalog(); syncUi(); }
        const b = el.items.querySelector('[data-def="' + id + '"]');
        if (b) b.scrollIntoView({ block: 'nearest' });
      },
      // exposed for automated checks
      api: { roomIndex: () => B.roomIdx, setRoomIndex: (i) => { B.roomIdx = Math.max(0, Math.min(i, world.rooms.length - 1)); }, place: (id, tx, ty, rot) => {
        B.def = DEF[id]; B.rot = rot || 0;
        const side = DL.rotSide(B.rot) && B.def.mount !== 'wall', w = side ? B.def.h || 1 : B.def.w || 1, h = side ? B.def.w || 1 : B.def.h || 1;
        // (free: presets and automated placement don't look at the cash)
        B.free = true;
        let r;
        try { B.ghost = ghostAt(tx * T + w * 8, ty * T + h * 8); r = B.ghost.reason; place(); } finally { B.free = false; }
        B.def = null; B.ghost = null;
        return r;
      }, removeItem, rotate, startMove, dropMove, resizeRoom, addRoom, removeRoom, select, commit, check, createRoom, resizeLot, setRoomRect,
        lotQuote, buyLot: (dw, dh) => resizeLot(dw, dh, true), builtArea,
        // loading a save: put each rack unit back in its exact slot (catalog ids, null = empty)
        restoreUnits(e, list, costs) {
          if (!e || !e.units) return;
          e.units = new Array(9).fill(null);
          e.unitModel = new Array(9).fill(null);
          (list || []).slice(0, 9).forEach((id, k) => {
            const def = id && DEF[id];
            if (!def || def.mount !== 'rack') return;
            e.units[k] = def.unit || def.id;
            e.unitModel[k] = def.unit ? def.id : null;
          });
          e.unitCost = Array.isArray(costs) ? costs.slice(0, 9).map((c) => +c || 0) : new Array(9).fill(0);
          syncRack(e);
        }, setTab, setRoomTool, chooseDef, planRooms,
        // free walls + doors
        buildWall: (x0, y0, x1, y1, mat, box) => { const keep = B.wallMat; B.wallMat = mat || 'solid'; const wd = { x0, y0, x1, y1, box: !!box }; const r = wallPlan(wd).reason; applyWall(wd); B.wallMat = keep; return r; },
        eraseWall: (x0, y0, x1, y1) => { const wd = { x0, y0, x1, y1, erase: true }; const r = wallPlan(wd).reason; applyWall(wd); return r; },
        placeDoor: (tx, ty, len, rot) => { const d = doorGhost(tx, ty, len || 1, rot || 0); if (d.reason) return d.reason; world.items.push(d.e); commit({ added: [d.e] }); return null; },
        // multiplayer.js: put an object where another player moved / turned it — the same object, so a rack
        // keeps its id and devices and a desk its station; returns the reason when it doesn't fit there
        relocate(e, tx, ty, rot) {
          e = e.parent || e;
          const group = groupOf(e);
          const orig = group.map((x) => ({ x, tx: x.tx, ty: x.ty, rot: x.rot, tw: x.tw, th: x.th, dx: x.dx, dy: x.dy }));
          if (e.kind === 'door') e.rot = rot | 0;
          else for (let n = 0; n < 4 && (e.rot | 0) !== (rot | 0) && canTurn(e); n++) turn(e);
          if (e.host) { e.dx = tx - e.host.tx; e.dy = ty - e.host.ty; }
          e.tx = tx;
          e.ty = ty;
          pos(e);
          const why = e.host || e.kind === 'door' ? null : check(group.filter((x) => !x.host), new Set(group), () => true);
          if (why) {
            for (const o of orig) Object.assign(o.x, { tx: o.tx, ty: o.ty, rot: o.rot, tw: o.tw, th: o.th, dx: o.dx, dy: o.dy });
            pos(e);
            return why;
          }
          commit({ moved: true, added: group, removed: group, layout: e.kind === 'door' });
          return null;
        },
        setRoomType, renameRoom, areaOfRoom, roomIndexAt, wallAxisAt, doorCheck },
    };
  };
})();
