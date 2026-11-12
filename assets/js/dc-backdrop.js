/* DataLab — the datacenter backdrop of the title screen (index.html) and the download page (baixar.html).
   The datacenter is painted into a tiny canvas (~200 art pixels tall) that the browser scales up by a whole
   number of device pixels with image-rendering: pixelated, so every art pixel stays a hard square.
   Floor, ceiling and the far wall are cast per pixel in one-point perspective; each row of racks is a
   pre-rendered strip that slides by camera sway ÷ depth (parallax). LEDs, packets and the technician are
   redrawn on top every tick. Needs assets/js/sprites.js (the technician is the game's own character).
   Usage: DL.dcBackdrop(canvas, { tech: false })  — tech: the walking technician (default on). */
(function () {
  'use strict';
  const DL = (window.DL = window.DL || {});

  DL.dcBackdrop = function (cvs, opts) {
    const showTech = !opts || opts.tech !== false;
    const calm = matchMedia('(prefers-reduced-motion: reduce)');
    let still = calm.matches;

    /* ================= background ================= */
    const ctx = cvs.getContext('2d', { alpha: false });

    const INK = '#05070d', FOG = '#070a13', PLENUM = '#04050a';
    const STEEL = ['#05070d', '#090d17', '#0e1422', '#141b2d', '#1c2438', '#262f46', '#333d57', '#46506b', '#5f6a86', '#808ba6', '#aab4cc', '#d5ddeb'];
    const GREEN = '#3dffa2', GREEN_OFF = '#0e3527', AMBER = '#ffb547', AMBER_OFF = '#47300f';
    const CABLE = ['#12404a', '#1d2b4f'];

    const rgb = (h) => { const n = parseInt(h.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
    const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
    const u32 = (h) => { const [r, g, b] = rgb(h); return (0xff000000 | (b << 16) | (g << 8) | r) >>> 0; };
    const hash = (a, b) => {
      let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul(b | 0, 0x85ebca77);
      h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d); h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
      return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
    };
    const rng = (seed) => {
      let s = seed >>> 0;
      return () => {
        s = (s + 0x6d2b79f5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
    };

    const TARGET_H = 200;          // art pixels from top to bottom of the screen
    const R = 36;                  // rack height in the front row
    const RW = 16;                 // rack width (world px = front-row px)
    const POD = 8, POD_GAP = 24;   // racks per pod, cross-aisle between pods
    const TX = 16, TXC = 32;       // floor / ceiling tile width
    const CAM_AMP = 14, CAM_T = 38, PTR_AMP = 7;
    const MAX_ROWS = 9;

    let W = 0, H = 0, cx = 0, yh = 0, E = 0, CE = 0, D = 0.4, zWall = 4, zCut = 1, base0 = 0, plenumY = 0, aisle = 40;
    let rows = [], lines = [], pal = null, bg = null, bg32 = null, ledId = 0;
    let alertSlot = null, alertX = 0, plenumPackets = [], plenumHalf = 0;

    // the canvas covers the *large* viewport, so a phone's toolbar sliding in and out while the page
    // scrolls changes nothing; the scene is only rebuilt for a real new size
    const tall = document.createElement('div');
    tall.style.cssText = 'position:fixed;top:0;width:0;height:100vh;height:100lvh;visibility:hidden;pointer-events:none';
    document.body.appendChild(tall);
    let builtW = 0, builtH = 0;

    function resize() {
      const dpr = window.devicePixelRatio || 1;
      const dw = Math.max(1, Math.round(innerWidth * dpr)), dh = Math.max(1, Math.round(Math.max(innerHeight, tall.offsetHeight) * dpr));
      if (dw === builtW && dh === builtH) return;
      builtW = dw; builtH = dh;
      const s = Math.max(1, Math.round(dh / TARGET_H));
      W = Math.ceil(dw / s); H = Math.ceil(dh / s);
      cvs.width = W; cvs.height = H;
      cvs.style.width = (W * s / dpr) + 'px';
      cvs.style.height = (H * s / dpr) + 'px';
      build();
      draw(clock);
    }

    function build() {
      cx = W / 2;
      plenumY = H - 12;
      base0 = H - 30;
      yh = Math.round(H * 0.4);
      E = Math.max(R + 12, base0 - yh);
      CE = yh / 1.22;
      D = Math.min(0.9, Math.max(0.3, 0.62 * R / (E - R)));
      zCut = E / (plenumY - yh);
      aisle = W < 200 ? 28 : 44;
      ledId = 0;

      let n = 0;
      while (n < MAX_ROWS && R / (1 + n * D) >= 6) n++;
      zWall = 1 + (n - 1 + 0.65) * D;

      pickAlert();
      rows = [];
      for (let k = 0; k < n; k++) rows.push(makeRow(k));
      buildBg();
      buildPlenum();
      placeTech();
    }

    /* the faulty rack: front row, right of centre, always on screen */
    function pickAlert() {
      const target = Math.min(W * 0.27, W / 2 - 24);
      let best = null;
      for (let i = 0; i < 40; i++) {
        const p = Math.floor(i / POD), j = i % POD;
        const a0 = aisle / 2 + p * (POD * RW + POD_GAP) + j * RW;
        const d = Math.abs(a0 + RW / 2 - target);
        if (!best || d < best.d) best = { d, i, X: a0 + RW / 2 };
      }
      alertSlot = { side: 1, i: best.i };
      alertX = best.X;
    }

    /* ---------- one row of racks at depth z = 1 + k·D ---------- */
    function makeRow(k) {
      const z = 1 + k * D, s = 1 / z;
      const fog = Math.min(0.86, (z - 1) / (zWall - 1) * 0.95);
      const f = (c, t = fog) => mix(c, FOG, t);
      const top = Math.round(yh + (E - R) * s), base = Math.round(yh + E * s);
      const h = base - top, ts = k === 0 ? 2 : 1;
      const pad = Math.ceil((CAM_AMP + PTR_AMP) * s) + 2;
      const can = document.createElement('canvas');
      can.width = W + 2 * pad; can.height = h + ts;
      const c = can.getContext('2d');
      const tone = {
        seam: f(INK, fog * 0.5), frame: f(STEEL[6]), frameHi: f(STEEL[7]), frameLo: f(STEEL[5]),
        top: f(STEEL[8]), topHi: f(STEEL[9]), inner: f(STEEL[1], fog * 0.5), rail: f(STEEL[4]),
        bezel: f(STEEL[5]), bezelHi: f(STEEL[7]), bezelLo: f(STEEL[3]), blank: f(STEEL[3]), port: f(STEEL[0], fog * 0.5),
        plinth: f(STEEL[3]), label: f(STEEL[10]), mesh: f(STEEL[4]),
        gOff: f(GREEN_OFF), aOff: f(AMBER_OFF), screen: f('#0f3d2b'),
        rail0: f(STEEL[7]), rail1: f(STEEL[5]), cable0: f(CABLE[0]), cable1: f(CABLE[1]), rod: f(STEEL[4]),
        pkt: f(GREEN, fog * 0.7), pktTrail: f(mix(GREEN, CABLE[0], 0.6), fog * 0.7),
      };
      const row = {
        k, z, s, top, base, h, ts, pad, can, tone,
        leds: [[], [], []], cols: [f(GREEN, fog * 0.8), f(AMBER, fog * 0.8), AMBER],
        ceilY: Math.round(yh - CE * s), trayY: Math.round(yh - (CE - 9) * s), trayH: Math.max(1, Math.round(4 * s)),
        rods: [], packets: [], drops: [], half: 0,
      };

      const half = (W / 2 + pad) / s + RW;
      row.half = half;
      const ox = pad + W / 2;
      for (const side of [1, -1]) {
        for (let i = 0; ; i++) {
          const p = Math.floor(i / POD), j = i % POD;
          const a0 = aisle / 2 + p * (POD * RW + POD_GAP) + j * RW;
          if (a0 > half) break;
          const A = side > 0 ? a0 : -(a0 + RW);
          const x0 = Math.round(ox + A * s), x1 = Math.round(ox + (A + RW) * s);
          const closeRight = side > 0 ? j === POD - 1 : j === 0;
          const isAlert = k === 0 && side === alertSlot.side && i === alertSlot.i;
          const r = rng((k * 7919 + side * 104729 + i * 31337) ^ 0x5eed);
          drawRack(row, c, x0, x1 - x0, closeRight, r, isAlert);
          if (k >= 3 && r() < 0.22) row.drops.push(A + RW / 2);
        }
      }

      const r = rng(k * 977 + 13);
      for (let X = -half + ((half % 64) - 64); X < half; X += 64) row.rods.push(X);
      const count = Math.round((2 * half * s) / (k === 0 ? 30 : 44));
      for (let i = 0; i < count; i++) {
        const dir = r() < 0.5 ? 1 : -1;
        row.packets.push({ u: r() * 2 * half, v: dir * (14 + r() * 26), lane: dir > 0 ? 0 : 1 });
      }
      return row;
    }

    function drawRack(row, c, x, w, closeRight, r, isAlert) {
      const { h, ts, tone: T, leds: L } = row;
      const px = (col, X, Y, ww = 1, hh = 1) => { c.fillStyle = col; c.fillRect(X, Y, ww, hh); };
      const led = (X, Y, kind, ww = 1) => {
        // kind: 'act' (network activity) | 'pwr' | 'any' | 'alert'
        let cls = 0, m, p = 1, ph = r() * 4, th = 0.5;
        if (kind === 'alert') { cls = 2; m = 4; p = 0.26; ph = 0; }
        else if (kind === 'pwr') { m = r() < 0.75 ? 0 : 3; p = 1.6 + r() * 1.4; }
        else if (kind === 'act' || r() < 0.4) { m = 2; p = 5 + r() * 10; th = 0.35 + r() * 0.35; }
        else { const q = r(); m = q < 0.35 ? 0 : q < 0.8 ? 1 : 3; p = 0.8 + r() * 2.2; }
        if (cls === 0 && kind !== 'pwr' && r() < 0.04) { cls = 1; m = 1; p = 1.6 + r() * 1.8; }
        px(cls ? T.aOff : T.gOff, X, Y, ww, 1);
        L[cls].push({ x: X, y: Y, w: ww, m, p, ph, th, id: ledId++ });
      };

      const y0 = ts;
      px(T.top, x, 0, w, ts);
      if (ts > 1) px(T.topHi, x, 0, w, 1);
      px(T.frame, x, y0, w, h);

      if (h >= 28) {
        /* front row: rails, real equipment, plinth */
        const ix = x + 3, iw = w - 6, iy = y0 + 2, ih = h - 5, end = iy + ih;
        px(T.frameHi, x + 1, y0, 1, h - 3);
        px(T.frameLo, x + w - 2, y0, 1, h - 3);
        px(T.inner, ix - 1, iy, iw + 2, ih);
        px(T.rail, ix - 1, iy, 1, ih); px(T.rail, ix + iw, iy, 1, ih);
        for (let yy = iy + 1; yy < end; yy += 3) { px(T.inner, ix - 1, yy); px(T.inner, ix + iw, yy); }
        if (r() < 0.7) px(T.label, x + 5, y0, 4, 1);
        px(T.plinth, x + 1, y0 + h - 3, w - 2, 3);
        px(T.frameLo, x + 1, y0 + h - 3, w - 2, 1);
        for (let vx = x + 3; vx < x + w - 3; vx += 2) px(T.inner, vx, y0 + h - 2);

        const q = r();
        const kind = isAlert ? 'compute' : q < 0.46 ? 'compute' : q < 0.62 ? 'network' : q < 0.76 ? 'storage' : q < 0.9 ? 'mesh' : 'sparse';
        const first = L[0].length;
        let yy = iy, n = 0;
        while (yy < end) {
          const left = end - yy;
          let u;
          if (kind === 'network') u = n % 3 === 2 ? 'blank' : n % 2 ? 'patch' : 'sw';
          else if (kind === 'storage') u = n === 0 ? 'srv2' : r() < 0.8 ? 'stor' : 'blank';
          else if (kind === 'sparse') u = r() < 0.75 ? 'blank' : 'srv1';
          else u = n === 0 ? 'sw' : left <= 6 && r() < 0.5 ? 'ups' : (() => { const v = r(); return v < 0.42 ? 'srv1' : v < 0.78 ? 'srv2' : 'blank'; })();
          const uh = { srv1: 2, srv2: 3, sw: 2, patch: 2, stor: 5, ups: 4, blank: 1 + ((r() * 3) | 0) }[u];
          if (uh > left) u = 'blank';
          const hh = Math.min(uh, left);
          const ledKind = isAlert ? 'alert' : 'any';
          switch (u) {
            case 'srv1':
              px(T.bezel, ix, yy, iw, 1); px(T.bezelLo, ix, yy, 1, 1);
              for (let d = 0; d < 3; d++) px(T.bezelHi, ix + 5 + d * 2, yy);
              led(ix + 1, yy, isAlert ? 'alert' : 'pwr');
              if (r() < 0.7) led(ix + 2, yy, 'act');
              break;
            case 'srv2':
              px(T.bezel, ix, yy, iw, 2); px(T.bezelLo, ix, yy, 1, 2);
              for (let d = ix + 4; d < ix + iw; d++) px((d - ix) % 2 ? T.bezelLo : T.bezelHi, d, yy, 1, 2);
              led(ix + 1, yy, isAlert ? 'alert' : 'pwr');
              led(ix + 1, yy + 1, ledKind === 'alert' && r() < 0.5 ? 'alert' : 'act');
              break;
            case 'sw':
              px(T.bezelLo, ix, yy, iw, 1);
              for (let d = 0; d < iw; d++) d % 2 ? led(ix + d, yy, 'act') : px(T.port, ix + d, yy);
              break;
            case 'patch':
              px(T.bezelHi, ix, yy, iw, 1);
              for (let d = 1; d < iw; d += 2) px(T.port, ix + d, yy);
              break;
            case 'stor':
              for (let d = 0; d < iw; d++) px(d % 2 ? T.bezelLo : T.bezelHi, ix + d, yy, 1, 4);
              for (let d = 0; d < iw; d += 2) led(ix + d, yy + 3, 'act');
              break;
            case 'ups':
              px(T.bezel, ix, yy, iw, 3);
              px(T.screen, ix + 2, yy + 1, 4, 1);
              led(ix + 3, yy + 1, 'pwr');
              break;
            default:
              px(T.blank, ix, yy, iw, hh);
          }
          yy += hh; n++;
        }
        if (kind === 'mesh') {
          for (let my = iy; my < end; my++) for (let mx = ix; mx < ix + iw; mx++) if (((mx + my) & 1) === 0) px(T.mesh, mx, my);
          L[0].splice(first, L[0].length - first, ...L[0].slice(first).filter((l) => ((l.x + l.y) & 1) === 1));
        }
        if (isAlert) {
          // stack light on the roof of the rack
          px(T.aOff, x + 6, 0, 4, 2);
          L[2].push({ x: x + 6, y: 0, w: 4, m: 4, p: 0.26, ph: 0, th: 0, id: ledId++ });
          L[2].push({ x: x + 6, y: 1, w: 4, m: 4, p: 0.26, ph: 0, th: 0, id: ledId++ });
        }
      } else if (h >= 15) {
        /* middle rows: 1U lines with a LED or two */
        const ix = x + 2, iw = Math.max(2, w - 4), iy = y0 + 1, end = y0 + h - 2;
        px(T.frameHi, x + 1, y0, 1, h - 2);
        px(T.inner, ix, iy, iw, end - iy);
        px(T.plinth, x + 1, end, w - 2, 2);
        for (let yy = iy; yy < end; yy += 2) {
          const v = r();
          if (v < 0.62) { px(T.bezel, ix, yy, iw, 1); led(ix, yy, 'any'); if (iw >= 5 && r() < 0.5) led(ix + iw - 2, yy, 'act'); }
          else if (v < 0.8) { px(T.bezelLo, ix, yy, iw, 1); for (let d = 1; d < iw; d += 2) led(ix + d, yy, 'act'); }
          else px(T.blank, ix, yy, iw, 1);
        }
        if (r() < 0.15) for (let my = iy; my < end; my++) for (let mx = ix; mx < ix + iw; mx++) if (((mx + my) & 1) === 0) px(T.mesh, mx, my);
      } else if (h >= 8) {
        /* far rows: dots */
        const ix = x + 1, iw = Math.max(1, w - 2), iy = y0 + 1, end = y0 + h - 1;
        px(T.inner, ix, iy, iw, end - iy);
        for (let yy = iy; yy < end; yy += 2) if (r() < 0.75) { px(T.bezel, ix, yy, iw, 1); if (r() < 0.6) led(ix + ((r() * iw) | 0), yy, 'any'); }
      } else {
        px(T.inner, x + 1, y0 + 1, Math.max(1, w - 2), Math.max(1, h - 2));
        if (r() < 0.6) led(x + 1, y0 + 1 + ((r() * Math.max(1, h - 2)) | 0), 'any');
      }

      px(T.seam, x, 0, 1, ts + h);
      if (closeRight) px(T.seam, x + w - 1, 0, 1, ts + h);
    }

    /* ---------- floor, ceiling and far wall, cast per pixel ---------- */
    function buildBg() {
      bg = ctx.createImageData(W, H);
      bg32 = new Uint32Array(bg.data.buffer);
      const FL = 8;
      const ramp = (hex, max) => Uint32Array.from({ length: FL }, (_, i) => u32(mix(hex, FOG, (i / (FL - 1)) * max)));
      pal = {
        flA: ramp(STEEL[5], 0.88), flB: ramp(STEEL[4], 0.88), flSeam: ramp(STEEL[2], 0.7), flHole: ramp(STEEL[2], 0.7),
        ceA: ramp(STEEL[3], 0.75), ceSeam: ramp(STEEL[1], 0.6), lamp: ramp(STEEL[10], 0.9),
        wall: u32(mix(STEEL[3], FOG, 0.5)), wallSeam: u32(mix(STEEL[2], FOG, 0.4)), wallBase: u32(mix(STEEL[1], FOG, 0.2)),
        door: u32(mix(STEEL[2], FOG, 0.3)), doorRim: u32(mix(STEEL[5], FOG, 0.45)), exit: u32(mix(GREEN, FOG, 0.3)),
        plenum: u32(PLENUM),
      };
      const fogAt = (z) => Math.min(FL - 1, Math.max(0, Math.floor((z - 0.9) / (zWall - 0.9) * FL)));
      const crosses = (a, b, step, lo = 0, hi = 0) => {
        // does [a, b) (in units of `step`) contain a tile edge, or overlap the band [n+lo, n+hi)?
        const ua = a / step, ub = b / step;
        if (hi === 0) return Math.floor(ua) !== Math.floor(ub);
        for (let n = Math.floor(ua) - 1; n <= Math.floor(ub); n++) if (Math.max(ua, n + lo) < Math.min(ub, n + hi)) return true;
        return false;
      };
      lines = [];
      for (let y = 0; y < H; y++) {
        if (y >= plenumY) { lines.push({ k: 3 }); continue; }
        const ceil = y < yh;
        const za = ceil ? CE / Math.max(0.01, yh - y) : E / Math.max(0.01, y - yh);          // far edge of the pixel row
        const zb = ceil ? CE / Math.max(0.01, yh - y - 1) : E / Math.max(0.01, y + 1 - yh);  // near edge
        const z = ceil ? CE / (yh - y - 0.5) : E / (y - yh + 0.5);
        if (z >= zWall || (ceil && yh - y - 0.5 <= 0)) { lines.push({ k: 2, Y: E - (y + 0.5 - yh) * zWall }); continue; }
        const lo = Math.min(za, zb) - 1, hi = Math.max(za, zb) - 1;
        if (ceil) {
          lines.push({ k: 0, z, fl: fogAt(z), seam: crosses(lo, hi, D / 2), lamp: crosses(lo, hi, D, 0.62, 0.76) });
        } else {
          const tz = D / 3, uz = (z - 1) / tz, iz = Math.floor(uz), fz = uz - iz;
          lines.push({ k: 1, z, fl: fogAt(z), seam: crosses(lo, hi, tz), iz, perf: z < 1.05 && fz > 0.15 && fz < 0.85 });
        }
      }
    }

    function paintBg(cam) {
      const b = bg32;
      for (let y = 0; y < H; y++) {
        const L = lines[y], o = y * W;
        if (L.k === 3) { b.fill(pal.plenum, o, o + W); continue; }
        if (L.k === 2) {
          const Y = L.Y;
          let X = cam + (0.5 - cx) * zWall;
          for (let x = 0; x < W; x++, X += zWall) {
            const ax = Math.abs(X), m = ((X % 48) + 48) % 48;
            let col = Y < 3 ? pal.wallBase : m < zWall ? pal.wallSeam : pal.wall;
            if (ax < 14 && Y < 40) col = ax > 11 || Y > 37 ? pal.doorRim : pal.door;
            else if (ax < 7 && Y > 46 && Y < 53) col = pal.exit;
            b[o + x] = col;
          }
          continue;
        }
        const z = L.z, fl = L.fl;
        if (L.k === 1) {
          const A = pal.flA[fl], B = pal.flB[fl], SEAM = pal.flSeam[fl], HOLE = pal.flHole[fl];
          if (L.seam) { b.fill(SEAM, o, o + W); continue; }
          let X = cam + (0.5 - cx) * z;
          for (let x = 0; x < W; x++, X += z) {
            const u = X / TX, ix = Math.floor(u), fx = u - ix, odd = (ix + L.iz) & 1;
            let col = fx * TX < z ? SEAM : odd ? A : B;
            if (L.perf && !odd && fx > 0.15 && fx < 0.85 && ((x + y) & 1) === 0) col = HOLE;
            b[o + x] = col;
          }
        } else {
          const A = pal.ceA[fl], SEAM = pal.ceSeam[fl], LAMP = pal.lamp[fl];
          if (L.seam) { b.fill(SEAM, o, o + W); continue; }
          let X = cam + (0.5 - cx) * z;
          for (let x = 0; x < W; x++, X += z) {
            const u = X / TXC, ix = Math.floor(u), fx = u - ix;
            b[o + x] = fx * TXC < z ? SEAM : L.lamp && !(ix & 1) && fx > 0.14 && fx < 0.86 ? LAMP : A;
          }
        }
      }
      ctx.putImageData(bg, 0, 0);
    }

    function paintPackets(list, half, s, cam, t, y, head, trail, len, size) {
      const span = 2 * half;
      for (const p of list) {
        let X = (p.u + p.v * t) % span; if (X < 0) X += span;
        const sx = Math.round(cx + (X - half - cam) * s);
        if (sx < -6 || sx > W + 6) continue;
        const yy = typeof y === 'function' ? y(p) : y;
        ctx.fillStyle = trail; ctx.fillRect(p.v > 0 ? sx - len : sx + size, yy, len, size);
        ctx.fillStyle = head; ctx.fillRect(sx, yy, size, size);
      }
    }

    function lit(L, t) {
      switch (L.m) {
        case 0: return true;
        case 1: return (t + L.ph) % L.p < L.p * 0.5;
        case 2: return hash(L.id, (t * L.p) | 0) < L.th;
        case 3: { const f = ((t + L.ph) % L.p) / L.p; return f < 0.07 || (f > 0.15 && f < 0.22); }
        default: return (t + L.ph) % L.p < L.p * 0.5;
      }
    }

    function paintRow(row, cam, t) {
      const { s, tone: T } = row;
      // overhead tray for this row, with its hangers and packets
      ctx.fillStyle = T.rod;
      for (const X of row.rods) {
        const sx = Math.round(cx + (X - cam) * s);
        if (sx >= 0 && sx < W) ctx.fillRect(sx, row.ceilY, 1, row.trayY - row.ceilY);
      }
      ctx.fillStyle = T.rail0; ctx.fillRect(0, row.trayY, W, 1);
      if (row.trayH > 1) { ctx.fillStyle = T.cable0; ctx.fillRect(0, row.trayY + 1, W, row.trayH - 1); }
      if (row.trayH > 2) { ctx.fillStyle = T.cable1; ctx.fillRect(0, row.trayY + 2, W, 1); }
      if (row.trayH > 3) { ctx.fillStyle = T.rail1; ctx.fillRect(0, row.trayY + row.trayH - 1, W, 1); }
      const lane = row.trayH > 2 ? (p) => row.trayY + 1 + p.lane : row.trayY + (row.trayH > 1 ? 1 : 0);
      paintPackets(row.packets, row.half, s, cam, still ? 0 : t, lane, T.pkt, T.pktTrail, row.k === 0 ? 3 : 1, 1);
      // cable drops from the tray to the roof of a far rack
      if (row.drops.length) {
        ctx.fillStyle = T.cable0;
        for (const X of row.drops) {
          const sx = Math.round(cx + (X - cam) * s);
          if (sx >= 0 && sx < W) ctx.fillRect(sx, row.trayY + row.trayH, 1, row.top - row.trayY - row.trayH);
        }
      }
      // the racks
      const ox = -row.pad - Math.round(cam * s), oy = row.top - row.ts;
      ctx.drawImage(row.can, ox, oy);
      for (let c = 0; c < 3; c++) {
        const list = row.leds[c];
        if (!list.length) continue;
        ctx.fillStyle = row.cols[c];
        for (const L of list) {
          const x = ox + L.x;
          if (x < -4 || x > W) continue;
          if (lit(L, t)) ctx.fillRect(x, oy + L.y, L.w, 1);
        }
      }
    }

    function buildPlenum() {
      const s = 1 / zCut, r = rng(4242);
      plenumHalf = (W / 2) / s + CAM_AMP + PTR_AMP + 12;
      plenumPackets = [];
      const count = Math.round(W / 22);
      for (let i = 0; i < count; i++) {
        const dir = r() < 0.5 ? 1 : -1;
        plenumPackets.push({ u: r() * 2 * plenumHalf, v: dir * (18 + r() * 30), lane: r() < 0.6 ? 0 : 1 });
      }
    }

    function paintPlenum(cam, t) {
      const y0 = plenumY, s = 1 / zCut;
      ctx.fillStyle = STEEL[7]; ctx.fillRect(0, y0, W, 1);
      ctx.fillStyle = STEEL[4]; ctx.fillRect(0, y0 + 1, W, 1);
      ctx.fillStyle = PLENUM; ctx.fillRect(0, y0 + 2, W, H - y0 - 2);
      ctx.fillStyle = STEEL[3];
      for (let n = Math.floor((cam - cx / s) / TX) - 1; ; n++) {
        const sx = Math.round(cx + (n * TX - cam) * s);
        if (sx > W + 2) break;
        ctx.fillRect(sx, y0 + 2, 1, H - y0 - 2);
        ctx.fillRect(sx - 1, y0 + 2, 3, 1);
        ctx.fillRect(sx - 1, H - 2, 3, 2);
      }
      ctx.fillStyle = CABLE[0]; ctx.fillRect(0, H - 8, W, 2);
      ctx.fillStyle = CABLE[1]; ctx.fillRect(0, H - 4, W, 1);
      paintPackets(plenumPackets, plenumHalf, s, cam, still ? 0 : t, (p) => (p.lane ? H - 4 : H - 8), GREEN, mix(GREEN, CABLE[0], 0.55), 3, 1);
    }

    /* ================= the technician ================= */
    // the game's own character (DL.makeSheet / DL.makeActSheet in assets/js/sprites.js)
    const C_TEC = '#5eead4';   // the "Técnico de TI" role colour (crew.js)
    const LOOK = {
      body: 'm', skin: '#e0ac7e', hair: '#5a3a25', hairStyle: 'short', outfit: 'uniform', shirt: '#2f3a4d', pants: '#232a36', shoes: '#16181d',
      role: 'tecnico', roleColor: C_TEC, badge: C_TEC, lanyard: C_TEC, capColor: C_TEC,
    };
    const SHEET = DL.makeSheet(LOOK), ACT = DL.makeActSheet(LOOK), { AX, AY } = DL.CHAR;

    const tech = { X: 0, z: 1, feet: 0, dir: 1, act: 'walk', wait: 0, anim: 0, wp: 0, path: [], placed: false };

    function placeTech() {
      tech.feet = Math.min(plenumY - 3, base0 + 10);
      tech.z = E / (tech.feet + 0.5 - yh);
      const toX = (sx) => (sx - cx) * tech.z;
      const xl = toX(Math.max(10, W * 0.12)), xr = toX(Math.min(W - 10, W * 0.88));
      const xa = Math.min(xr - 6, Math.max(xl + 6, alertX * tech.z));
      tech.path = [{ X: xa, act: 'fix', t: 3.6 }, { X: xr, act: 'stand', t: 1.4 }, { X: xl, act: 'stand', t: 1.8 }];
      if (still) { tech.X = (xl + xa) / 2; tech.dir = 1; tech.act = 'stand'; tech.wait = 0; return; }
      if (!tech.placed || tech.X < xl || tech.X > xr) { tech.X = xl; tech.wp = 0; tech.act = 'walk'; tech.wait = 0; tech.placed = true; }
    }

    function updateTech(dt) {
      tech.anim += dt;
      if (tech.wait > 0) {
        tech.wait -= dt;
        if (tech.wait <= 0) { tech.act = 'walk'; tech.anim = 0; }
        return;
      }
      const goal = tech.path[tech.wp], d = goal.X - tech.X, step = 13 * dt;
      if (Math.abs(d) <= step) {
        tech.X = goal.X; tech.act = goal.act; tech.wait = goal.t; tech.anim = 0;
        tech.wp = (tech.wp + 1) % tech.path.length;
      } else {
        tech.dir = d > 0 ? 1 : -1;
        tech.X += tech.dir * step;
        tech.act = 'walk';
      }
    }

    function paintTech(cam) {
      const sx = Math.round(cx + (tech.X - cam) / tech.z);
      // walking: side view · fixing: back to the camera, hands going to the rack · standing: facing us, blinking
      let frame;
      if (tech.act === 'walk') frame = SHEET[tech.dir < 0 ? 'left' : 'right'].walk[Math.floor(tech.anim * 8) % 4];
      else if (tech.act === 'fix') frame = Math.floor(tech.anim * 3) % 2 ? ACT.up.reach : SHEET.up.idle;
      else frame = tech.anim % 3 > 2.85 ? SHEET.down.blink : SHEET.down.idle;
      ctx.fillStyle = 'rgba(5, 7, 13, .55)';   // the shadow of DL.drawActor
      ctx.fillRect(sx - 4, tech.feet - 2, 8, 1);
      ctx.fillRect(sx - 5, tech.feet - 1, 10, 1);
      ctx.fillRect(sx - 4, tech.feet, 8, 1);
      ctx.drawImage(frame, sx - AX, tech.feet - AY);
    }

    /* ================= loop ================= */
    let clock = 0, last = 0, acc = 0, raf = 0, ptr = 0, ptrGoal = 0;

    function draw(t) {
      if (!W) return;
      const cam = still ? 0 : CAM_AMP * Math.sin(t * 2 * Math.PI / CAM_T) + ptr * PTR_AMP;
      paintBg(cam);
      for (let k = rows.length - 1; k >= 0; k--) paintRow(rows[k], cam, still ? 0 : t);
      if (showTech) paintTech(cam);
      paintPlenum(cam, t);
    }

    function tick(now) {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.1, last ? (now - last) / 1000 : 0);
      last = now;
      acc += dt;
      if (acc < 1 / 30) return;   // a steady 30 fps is plenty for pixel art
      clock += acc;
      ptr += (ptrGoal - ptr) * Math.min(1, acc * 2.5);
      updateTech(acc);
      acc = 0;
      draw(clock);
    }

    function setMotion() {
      still = calm.matches;
      cancelAnimationFrame(raf);
      last = 0;
      placeTech();
      if (still) draw(0);
      else raf = requestAnimationFrame(tick);
    }

    addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') ptrGoal = (e.clientX / innerWidth) * 2 - 1; }, { passive: true });
    let rz = 0;
    addEventListener('resize', () => { cancelAnimationFrame(rz); rz = requestAnimationFrame(resize); });
    if (calm.addEventListener) calm.addEventListener('change', setMotion);
    resize();
    setMotion();
  };
})();
