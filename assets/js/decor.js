/* DataLab — decor: each room's own identity. Floors, walls, light tone and RGB lighting per room,
   ready-made themes, special themed objects (rugs, posters, neon, arcade…) and colour / style
   variants for the regular furniture. Rooms keep `style` (or a preset `theme`); everything here
   is optional, so a room without a style looks exactly as before. */
(function () {
  'use strict';
  const DL = window.DL, T = DL.T, R = DL.R, shade = DL.shade, hash = DL.hash;

  /* ------------------------------------------------------------------ */
  /* Colour helpers                                                      */
  /* ------------------------------------------------------------------ */
  function rgbOf(hex) {
    const n = parseInt(String(hex || '#ffffff').slice(1), 16);
    return [n >> 16, (n >> 8) & 255, n & 255];
  }
  const rgba = (hex, a) => { const [r, g, b] = rgbOf(hex); return 'rgba(' + r + ',' + g + ',' + b + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')'; };
  const hsl = (h, a) => 'hsla(' + (((h % 360) + 360) % 360).toFixed(0) + ',95%,62%,' + Math.max(0, Math.min(1, a)).toFixed(3) + ')';
  DL.rgba = rgba;

  /* ------------------------------------------------------------------ */
  /* Options                                                             */
  /* ------------------------------------------------------------------ */
  const FLOORS = [['tile', 'Técnico'], ['carpet', 'Carpete'], ['wood', 'Madeira'], ['concrete', 'Cimento'], ['marble', 'Porcelanato'], ['checker', 'Xadrez'], ['grid', 'Grade neon']];
  const WALLS = [['plain', 'Lisa'], ['panel', 'Acústica'], ['brick', 'Tijolo'], ['wood', 'Ripada'], ['concrete', 'Concreto'], ['neon', 'Faixa neon']];
  const LIGHTS = [['auto', 'Automática'], ['cold', 'Fria'], ['neutral', 'Neutra'], ['warm', 'Quente'], ['dim', 'Baixa'], ['bright', 'Clara']];
  const AREAS = [['ceiling', 'Teto'], ['walls', 'Paredes'], ['floor', 'Piso'], ['furniture', 'Móveis']];
  const EFFECTS = [['static', 'Estático'], ['breath', 'Suave'], ['wave', 'Onda'], ['rainbow', 'Arco-íris']];
  const FLOOR_COLORS = ['#151a22', '#1b2340', '#2a1f3d', '#1f3a33', '#3a1f24', '#3b2c22', '#6b5038', '#2a2c30', '#5c6068', '#a9adb5', '#0e2a33', '#7c5cff'];
  const WALL_COLORS = ['#171b22', '#1d2440', '#261a3a', '#1f2b28', '#3a2a24', '#5a3b2e', '#4a3a2c', '#2e3138', '#8a8f98', '#c9c7c2', '#141026', '#0f2630'];
  const RGB_COLORS = ['#7c5cff', '#00e5ff', '#ff2bd6', '#ff7a17', '#7ee0a1', '#ff3b5c', '#ffd23f', '#ffffff'];
  const DEFAULT_COLOR = { tile: '#151a22', carpet: '#101219', wood: '#3b2c22', concrete: '#2a2c30', marble: '#5c6068', checker: '#2a2c30', grid: '#00e5ff' };
  const WALL_DEFAULT = { plain: '#171b22', panel: '#1d2440', brick: '#5a3b2e', wood: '#4a3a2c', concrete: '#2e3138', neon: '#141026' };

  const LIGHT_COLOR = { cold: '160,195,236', neutral: '226,230,236', warm: '255,194,133', dim: '255,194,133', bright: '236,240,246' };
  const LIGHT_ALPHA = { cold: 0.05, neutral: 0.045, warm: 0.045, dim: 0.025, bright: 0.075 };

  /* ------------------------------------------------------------------ */
  /* Themes                                                              */
  /* ------------------------------------------------------------------ */
  const rgbOn = (color, intensity, areas, effect) => ({ on: true, color, intensity, areas, effect });
  const THEMES = {
    noc: {
      name: 'NOC', desc: 'Azul/roxo, monitores e RGB', swatch: ['#1d2440', '#7c5cff', '#00e5ff'],
      style: { floor: 'carpet', floorColor: '#1b2340', wall: 'panel', wallColor: '#1d2440', light: 'cold', rgb: rgbOn('#7c5cff', 55, ['ceiling', 'walls'], 'wave') },
      decor: ['neon', 'poster', 'clock', 'monitor'],
    },
    servers: {
      name: 'Servidores', desc: 'Industrial, luz fria', swatch: ['#2a2c30', '#5c6068', '#a0c3ec'],
      style: { floor: 'tile', floorColor: '#151a22', wall: 'concrete', wallColor: '#2e3138', light: 'cold', rgb: rgbOn('#a0c3ec', 30, ['ceiling'], 'static') },
      decor: ['toolcart', 'poster'],
    },
    gamer: {
      name: 'Gamer RGB', desc: 'RGB e decoração temática', swatch: ['#141026', '#ff2bd6', '#00e5ff'],
      style: { floor: 'checker', floorColor: '#2a1f3d', wall: 'neon', wallColor: '#141026', light: 'dim', rgb: rgbOn('#ff2bd6', 70, ['ceiling', 'walls', 'floor', 'furniture'], 'rainbow') },
      decor: ['rug_rgb', 'arcade', 'beanbag', 'neon', 'ledtube', 'pcgamer'],
    },
    cyberpunk: {
      name: 'Cyberpunk', desc: 'Grade neon e holograma', swatch: ['#0b0d14', '#00e5ff', '#ff2bd6'],
      style: { floor: 'grid', floorColor: '#00e5ff', wall: 'neon', wallColor: '#141026', light: 'dim', rgb: rgbOn('#ff2bd6', 60, ['ceiling', 'floor'], 'wave') },
      decor: ['hologram', 'neon', 'ledtube', 'poster'],
    },
    industrial: {
      name: 'Industrial', desc: 'Tijolo, cimento e metal', swatch: ['#5a3b2e', '#2a2c30', '#ffc285'],
      style: { floor: 'concrete', floorColor: '#2a2c30', wall: 'brick', wallColor: '#5a3b2e', light: 'warm', rgb: { on: false, color: '#ffc285', intensity: 40, areas: ['ceiling'], effect: 'static' } },
      decor: ['toolcart', 'clock', 'lamp'],
    },
    minimal: {
      name: 'Minimalista', desc: 'Claro, madeira e pouco', swatch: ['#a9adb5', '#c9c7c2', '#6b5038'],
      style: { floor: 'wood', floorColor: '#6b5038', wall: 'plain', wallColor: '#8a8f98', light: 'bright', rgb: { on: false, color: '#ffffff', intensity: 30, areas: ['ceiling'], effect: 'static' } },
      decor: ['plant', 'bonsai', 'clock'],
    },
    corporate: {
      name: 'Corporativo', desc: 'Carpete, madeira e marca', swatch: ['#1b2340', '#4a3a2c', '#7ee0a1'],
      style: { floor: 'carpet', floorColor: '#1b2340', wall: 'wood', wallColor: '#4a3a2c', light: 'neutral', rgb: { on: false, color: '#7ee0a1', intensity: 30, areas: ['ceiling'], effect: 'static' } },
      decor: ['banner', 'plant', 'clock', 'poster'],
    },
  };
  const THEME_ORDER = ['noc', 'servers', 'gamer', 'cyberpunk', 'industrial', 'minimal', 'corporate'];
  DL.ROOM_THEMES = THEMES;

  const clone = (s) => (s ? JSON.parse(JSON.stringify(s)) : null);
  // The style a room is drawn with (its own, or its preset theme's), or null for the classic look.
  const styleOf = (r) => (r && r.style) || (r && r.theme && THEMES[r.theme] ? THEMES[r.theme].style : null);
  DL.roomStyle = styleOf;

  /* ------------------------------------------------------------------ */
  /* Floors (16×16 tile)                                                 */
  /* ------------------------------------------------------------------ */
  function floorTile(g, s, px, py, x, y, perf) {
    const kind = s.floor, c = s.floorColor || DEFAULT_COLOR[kind] || '#151a22';
    switch (kind) {
      case 'tile': {
        const b = c, e = shade(b, -0.3), l = shade(b, 0.12);
        R(g, px, py, 16, 16, e);
        R(g, px + 1, py + 1, 15, 15, perf ? shade(b, 0.06) : b);
        R(g, px + 1, py + 1, 15, 1, l);
        if (perf) { for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) R(g, px + 3 + i * 3, py + 3 + j * 3, 1, 1, shade(b, -0.35)); }
        else for (const [a, d] of [[2, 2], [13, 2], [2, 13], [13, 13]]) R(g, px + a, py + d, 1, 1, l);
        break;
      }
      case 'carpet': {
        R(g, px, py, 16, 16, c);
        R(g, px, py + 15, 16, 1, shade(c, -0.18));
        for (let i = 0; i < 8; i++) R(g, px + Math.floor(hash(x * 131 + y * 71 + i * 17) * 16), py + Math.floor(hash(x * 37 + y * 113 + i * 29) * 15), 1, 1, shade(c, 0.12));
        break;
      }
      case 'wood': {
        // long planks (48 px), 4 px tall, each row offset so the seams stagger
        const L = 48;
        for (let k = 0; k < 4; k++) {
          const row = y * 4 + k, off = (row * 19) % L, gx = x * 16 + off;
          for (let i = 0; i < 16; ) {
            const plank = Math.floor((gx + i) / L), end = Math.min(16, i + L - ((gx + i) % L));
            const col = shade(c, (hash(plank * 31 + row * 7) - 0.5) * 0.14);
            R(g, px + i, py + k * 4, end - i, 3, col);
            if ((gx + i) % L === 0) R(g, px + i, py + k * 4, 1, 3, shade(c, -0.32));
            i = end;
          }
          R(g, px, py + k * 4 + 3, 16, 1, shade(c, -0.3));
          if (hash(x * 5 + row * 11) > 0.75) R(g, px + 3 + Math.floor(hash(x + row) * 9), py + k * 4 + 1, 4, 1, shade(c, 0.08));
        }
        break;
      }
      case 'concrete': {
        R(g, px, py, 16, 16, c);
        for (let i = 0; i < 10; i++) {
          const h1 = hash(x * 53 + y * 29 + i * 7), h2 = hash(x * 17 + y * 61 + i * 13);
          R(g, px + Math.floor(h1 * 16), py + Math.floor(h2 * 16), 1, 1, i % 2 ? shade(c, 0.1) : shade(c, -0.15));
        }
        if (x % 2 === 0) R(g, px, py, 1, 16, shade(c, -0.22));
        if (y % 2 === 0) R(g, px, py, 16, 1, shade(c, -0.22));
        break;
      }
      case 'marble': {
        R(g, px, py, 16, 16, c);
        R(g, px, py, 16, 1, shade(c, -0.18));
        R(g, px, py, 1, 16, shade(c, -0.18));
        R(g, px + 1, py + 1, 15, 1, shade(c, 0.12));
        // a soft vein
        const v = hash(x * 41 + y * 19);
        for (let i = 0; i < 12; i++) R(g, px + 2 + i, py + 3 + Math.round(Math.sin(i * 0.6 + v * 6) * 2 + v * 8), 1, 1, shade(c, 0.16));
        break;
      }
      case 'checker': {
        const a = c, b = shade(c, -0.55);
        for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) R(g, px + i * 8, py + j * 8, 8, 8, (i + j) % 2 ? b : a);
        R(g, px, py, 16, 1, 'rgba(255,255,255,0.05)');
        break;
      }
      case 'grid': {
        R(g, px, py, 16, 16, '#0b0d14');
        R(g, px + 1, py + 1, 15, 15, '#0d1019');
        g.fillStyle = rgba(c, 0.28);
        g.fillRect(px, py, 16, 1);
        g.fillRect(px, py, 1, 16);
        g.fillStyle = rgba(c, 0.07);
        g.fillRect(px, py + 8, 16, 1);
        g.fillRect(px + 8, py, 1, 16);
        break;
      }
      default:
        DL.floorTile(g, px, py, perf);
    }
  }

  /* ------------------------------------------------------------------ */
  /* Wall faces (one tile wide, from ft to B)                            */
  /* ------------------------------------------------------------------ */
  function wallFace(g, s, px, ft, B, accent) {
    const kind = s.wall, c = s.wallColor || WALL_DEFAULT[kind] || '#171b22', h = B - ft;
    R(g, px, ft - 1, 16, 1, shade(c, 0.25));
    R(g, px, ft, 16, h, c);
    switch (kind) {
      case 'panel':
        for (let i = 0; i < 4; i++) R(g, px + i * 4, ft + 2, 3, h - 7, shade(c, 0.07));
        for (let i = 0; i < 4; i++) R(g, px + i * 4 + 3, ft + 2, 1, h - 7, shade(c, -0.25));
        break;
      case 'brick':
        for (let row = 0; row * 4 < h - 4; row++) {
          const y = ft + row * 4, off = row % 2 ? 4 : 0;
          R(g, px, y + 3, 16, 1, shade(c, -0.35));
          for (let bx = -off; bx < 16; bx += 8) if (bx + 7 >= 0 && bx + 7 < 16) R(g, px + bx + 7, y, 1, 3, shade(c, -0.35));
          if (hash(px * 3 + row) > 0.6) R(g, px + ((row * 5) % 12) + 1, y + 1, 3, 1, shade(c, 0.1));
        }
        break;
      case 'wood':
        for (let i = 0; i < 16; i += 3) { R(g, px + i, ft + 1, 2, h - 6, shade(c, (hash(px + i) - 0.5) * 0.2)); R(g, px + i + 2, ft + 1, 1, h - 6, shade(c, -0.4)); }
        break;
      case 'concrete':
        for (let i = 0; i < 8; i++) R(g, px + Math.floor(hash(px + i * 7) * 16), ft + Math.floor(hash(px * 3 + i) * (h - 5)), 1, 1, shade(c, i % 2 ? 0.12 : -0.18));
        if ((px / 16) % 3 === 0) { R(g, px + 4, ft + 5, 1, 1, shade(c, -0.4)); R(g, px + 11, ft + 5, 1, 1, shade(c, -0.4)); }
        R(g, px, ft, 1, h, shade(c, -0.12));
        break;
      case 'neon':
        R(g, px, ft + Math.floor(h * 0.42), 16, 1, accent || '#ff2bd6');
        g.fillStyle = rgba(accent || '#ff2bd6', 0.25);
        g.fillRect(px, ft + Math.floor(h * 0.42) - 1, 16, 3);
        break;
      default:
        R(g, px, ft, 1, h, shade(c, -0.1));
    }
    // baseboard + contact shadow (same rhythm as the classic wall)
    R(g, px, B - 4, 16, 1, shade(c, 0.12));
    R(g, px, B - 3, 16, 3, shade(c, -0.45));
    R(g, px, B, 16, 2, 'rgba(0,0,0,0.25)');
  }

  // Baked light for a styled room (replaces the classic pools). Returns true when it handled the room.
  function bakeLight(g, r, s) {
    const tone = s.light && s.light !== 'auto' ? s.light : null;
    if (!tone) return false;
    if (tone === 'dim') {
      g.globalCompositeOperation = 'source-over';
      g.fillStyle = 'rgba(0,0,0,0.22)';
      g.fillRect(r.x * T, r.y * T, r.w * T, r.h * T);
      g.globalCompositeOperation = 'lighter';
    }
    const col = 'rgba(' + LIGHT_COLOR[tone] + ',' + LIGHT_ALPHA[tone] + ')';
    for (let ly = r.y + 1.5; ly < r.y + r.h; ly += 4) for (let lx = r.x + 2; lx < r.x + r.w; lx += 4) DL.pool(g, lx * T, ly * T, tone === 'bright' ? 60 : 50, col);
    return true;
  }

  DL.decorRender = { floorTile, wallFace, bakeLight, styleOf, rgbColor, WALL_DEFAULT };

  /* ------------------------------------------------------------------ */
  /* Dynamic light: room RGB + glowing objects (drawn every frame)       */
  /* ------------------------------------------------------------------ */
  function rgbColor(rgb, t, k) {
    const I = Math.max(0, Math.min(100, rgb.intensity == null ? 50 : rgb.intensity)) / 100;
    let a = 0.08 + I * 0.32;
    if (rgb.effect === 'breath') a *= 0.55 + 0.45 * Math.sin(t * 1.7);
    if (rgb.effect === 'wave') a *= 0.6 + 0.4 * Math.sin(t * 2.4 - k * 0.35);
    if (rgb.effect === 'rainbow') return (alpha) => hsl(t * 45 + k * 14, a * alpha);
    return (alpha) => rgba(rgb.color, a * alpha);
  }

  function roomLight(g, w, r, rgb, t) {
    const at = (x, y) => (x < 0 || y < 0 || x >= w.W || y >= w.H ? '#' : w.tiles[y * w.W + x]);
    const X0 = r.x * T, Y0 = r.y * T, X1 = (r.x + r.w) * T, Y1 = (r.y + r.h) * T;
    const areas = rgb.areas || [];
    const tallNorth = at(r.x, r.y - 1) === '#' && at(r.x, r.y - 2) === '#';
    if (areas.indexOf('ceiling') >= 0) {
      // cove light along the top of the north wall, spilling down
      const y = tallNorth ? Y0 - 25 : Y0 - 11;
      for (let x = r.x; x < r.x + r.w; x++) {
        const c = rgbColor(rgb, t, x);
        g.fillStyle = c(1.6);
        g.fillRect(x * T, y, T, 1);
        g.fillStyle = c(0.35);
        g.fillRect(x * T, y + 1, T, 3);
      }
      for (let x = r.x + 1; x < r.x + r.w; x += 3) DL.pool(g, x * T + 8, Y0 + 2, 26, rgbColor(rgb, t, x)(0.45));
    }
    if (areas.indexOf('walls') >= 0) {
      for (let x = r.x; x < r.x + r.w; x++) {
        const c = rgbColor(rgb, t, x);
        g.fillStyle = c(1.4);
        g.fillRect(x * T, Y0 - 4, T, 1);
      }
      for (let y = r.y; y < r.y + r.h; y++) {
        const c = rgbColor(rgb, t, y + r.w);
        g.fillStyle = c(0.9);
        g.fillRect(X0, y * T, 1, T);
        g.fillRect(X1 - 1, y * T, 1, T);
      }
      for (let y = r.y + 1; y < r.y + r.h; y += 3) {
        DL.pool(g, X0 + 2, y * T, 18, rgbColor(rgb, t, y)(0.3));
        DL.pool(g, X1 - 2, y * T, 18, rgbColor(rgb, t, y + 3)(0.3));
      }
    }
    if (areas.indexOf('floor') >= 0) {
      // underglow along the floor perimeter
      for (let x = r.x; x < r.x + r.w; x++) {
        const c = rgbColor(rgb, t, x);
        g.fillStyle = c(0.8);
        g.fillRect(x * T, Y1 - 2, T, 2);
        g.fillStyle = c(0.25);
        g.fillRect(x * T, Y1 - 6, T, 4);
      }
      for (let y = r.y; y < r.y + r.h; y++) {
        const c = rgbColor(rgb, t, y);
        g.fillStyle = c(0.45);
        g.fillRect(X0 + 1, y * T, 2, T);
        g.fillRect(X1 - 3, y * T, 2, T);
      }
    }
    if (areas.indexOf('furniture') >= 0) {
      for (const e of w.items) {
        if (e.kind !== 'desk' && e.kind !== 'table' && e.kind !== 'sofa' && e.kind !== 'beanbag' && e.kind !== 'shelf') continue;
        if (e.tx < r.x || e.tx >= r.x + r.w || e.ty < r.y || e.ty >= r.y + r.h) continue;
        DL.pool(g, e.px + e.tw * 8, e.py + e.th * T - 2, 14 + e.tw * 4, rgbColor(rgb, t, e.tx)(0.55));
      }
    }
  }

  const GLOW = {
    neon: (e) => [e.px + 8, e.py - 14, 22, e.color || '#ff2bd6', 0.16],
    ledtube: (e) => [e.px + 8, e.py - 6, 20, e.color || '#00e5ff', 0.14],
    arcade: (e) => [e.px + 8, e.py - 12, 18, '#7c5cff', 0.1],
    hologram: (e) => [e.px + 8, e.py - 10, 22, '#00e5ff', 0.12],
    pcgamer: (e) => [e.px + 8, e.py - 8, 12, '#ff2bd6', 0.1],
    rug_rgb: (e) => [e.px + 16, e.py + 16, 26, '#7c5cff', 0.06],
  };
  DL.DECOR_GLOW = GLOW; // other modules add their own lights here

  DL.drawRoomLights = function (g, w, t) {
    for (const r of w.rooms || []) {
      const s = styleOf(r);
      if (s && s.rgb && s.rgb.on) roomLight(g, w, r, s.rgb, t);
    }
    for (const e of w.items) {
      const f = GLOW[e.kind];
      if (!f) continue;
      const [x, y, rad, col, a] = f(e);
      const fl = e.kind === 'neon' ? 0.85 + 0.15 * Math.sin(t * 7 + e.seed) : 1;
      DL.pool(g, x, y, rad, e.kind === 'rug_rgb' ? hsl(t * 60, a) : rgba(col, a * fl));
    }
  };

  /* ------------------------------------------------------------------ */
  /* Themed objects                                                      */
  /* ------------------------------------------------------------------ */
  const OUT = '#06070a';

  function rugBase(g, e, base, edge) {
    const px = e.px, py = e.py;
    R(g, px + 1, py + 1, 30, 30, edge);
    R(g, px + 2, py + 2, 28, 28, base);
  }

  function rugRobot(g, e) {
    const px = e.px, py = e.py;
    rugBase(g, e, e.color || '#26303f', '#a0c3ec');
    R(g, px + 15, py + 5, 2, 3, '#9aa3b0');
    R(g, px + 14, py + 4, 4, 2, '#ff7a17');
    R(g, px + 8, py + 8, 16, 13, '#9aa3b0');
    R(g, px + 8, py + 8, 16, 1, '#c9ced6');
    R(g, px + 6, py + 12, 2, 5, '#7d8187');
    R(g, px + 24, py + 12, 2, 5, '#7d8187');
    R(g, px + 10, py + 11, 4, 4, '#0c1118');
    R(g, px + 18, py + 11, 4, 4, '#0c1118');
    R(g, px + 11, py + 12, 2, 2, '#00e5ff');
    R(g, px + 19, py + 12, 2, 2, '#00e5ff');
    for (let i = 0; i < 4; i++) R(g, px + 11 + i * 3, py + 17, 2, 2, i % 2 ? '#3a414c' : '#e9e9e6');
    R(g, px + 10, py + 22, 12, 5, '#7d8187');
    R(g, px + 13, py + 23, 6, 2, '#ff7a17');
  }

  // Claude-inspired rug: warm coral with a cream starburst.
  function rugClaude(g, e) {
    const px = e.px, py = e.py, cx = px + 16, cy = py + 15;
    rugBase(g, e, '#d97757', '#f4e9dc');
    R(g, px + 3, py + 3, 26, 1, '#e8916f');
    const ink = '#f4e9dc';
    // twelve tapered rays around a solid core
    const rays = 12;
    for (let k = 0; k < rays; k++) {
      const a = (k / rays) * Math.PI * 2 - Math.PI / 2;
      const len = k % 3 === 1 ? 8 : 10;
      for (let r = 2; r <= len; r += 0.5) {
        const x = Math.round(cx + 0.5 + Math.cos(a) * r - 0.5), y = Math.round(cy + 0.5 + Math.sin(a) * r - 0.5);
        R(g, x, y, r < 6 ? 2 : 1, r < 6 ? 2 : 1, ink);
      }
    }
    R(g, cx - 2, cy - 2, 5, 5, ink);
  }

  // ChatGPT-inspired rug: dark with a white six-loop knot.
  function rugGpt(g, e) {
    const px = e.px, py = e.py, cx = px + 16, cy = py + 16;
    rugBase(g, e, '#0f1412', '#10a37f');
    R(g, px + 3, py + 3, 26, 1, '#14382e');
    const ink = '#f1f1ee';
    // six rounded loops woven around a hexagonal centre
    const pts = new Set();
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2 + Math.PI / 6;
      for (let s = 0; s < 64; s++) {
        const u = (s / 64) * Math.PI * 2;
        const ex = 5.5 + Math.cos(u) * 5.5, ey = Math.sin(u) * 2.6;
        const x = Math.round(cx - 0.5 + ex * Math.cos(a) - ey * Math.sin(a));
        const y = Math.round(cy - 0.5 + ex * Math.sin(a) + ey * Math.cos(a));
        pts.add(x + ',' + y);
      }
    }
    g.fillStyle = ink;
    for (const p of pts) { const [x, y] = p.split(','); g.fillRect(+x, +y, 1, 1); }
    R(g, cx - 2, cy - 2, 4, 4, '#0f1412');
  }

  function rugRgb(g, e, t) {
    const px = e.px, py = e.py;
    R(g, px + 1, py + 1, 30, 30, '#0d0b18');
    // rainbow border running around the rug
    for (let i = 0; i < 30; i++) {
      const h = t * 90 + i * 12;
      g.fillStyle = hsl(h, 0.95); g.fillRect(px + 1 + i, py + 1, 1, 2);
      g.fillStyle = hsl(h + 180, 0.95); g.fillRect(px + 30 - i, py + 29, 1, 2);
      g.fillStyle = hsl(h + 90, 0.95); g.fillRect(px + 1, py + 30 - i, 2, 1);
      g.fillStyle = hsl(h + 270, 0.95); g.fillRect(px + 29, py + 1 + i, 2, 1);
    }
    // controller icon
    R(g, px + 9, py + 12, 14, 7, '#2a2340');
    R(g, px + 7, py + 14, 4, 6, '#2a2340');
    R(g, px + 21, py + 14, 4, 6, '#2a2340');
    R(g, px + 10, py + 15, 3, 1, '#c4b5fd'); R(g, px + 11, py + 14, 1, 3, '#c4b5fd');
    R(g, px + 19, py + 14, 1, 1, '#ff2bd6'); R(g, px + 21, py + 15, 1, 1, '#00e5ff');
  }

  // Wall objects hang on the north wall above their tile.
  function poster(g, e) {
    const x = e.px + 2, y = e.py - 24, v = e.variant || 'server';
    R(g, x - 1, y - 1, 14, 17, '#0a0b0e');
    R(g, x, y, 12, 15, '#e9e9e6');
    const ink = '#1c2129';
    if (v === 'server') {
      R(g, x + 1, y + 1, 10, 13, '#0d1726');
      R(g, x + 3, y + 2, 6, 10, '#2a2f38');
      for (let i = 0; i < 4; i++) { R(g, x + 4, y + 3 + i * 2, 4, 1, '#3a414c'); R(g, x + 7, y + 3 + i * 2, 1, 1, i === 2 ? '#ff7a17' : '#7ee0a1'); }
      R(g, x + 2, y + 13, 8, 1, '#a0c3ec');
    } else if (v === 'game') {
      R(g, x + 1, y + 1, 10, 13, '#3b2a6b');
      R(g, x + 2, y + 6, 8, 4, '#c4b5fd');
      R(g, x + 3, y + 7, 2, 1, ink); R(g, x + 4, y + 6, 0, 0, ink);
      R(g, x + 7, y + 7, 1, 1, '#ff2bd6'); R(g, x + 8, y + 8, 1, 1, '#00e5ff');
      R(g, x + 2, y + 2, 8, 2, '#ffd23f');
    } else if (v === 'space') {
      R(g, x + 1, y + 1, 10, 13, '#0b1030');
      for (const [a, b] of [[2, 2], [8, 3], [3, 9], [9, 11], [6, 1]]) R(g, x + a, y + b, 1, 1, '#ffffff');
      R(g, x + 5, y + 4, 2, 6, '#e9e9e6'); R(g, x + 5, y + 3, 2, 1, '#ff3b5c');
      R(g, x + 4, y + 9, 1, 2, '#ff3b5c'); R(g, x + 7, y + 9, 1, 2, '#ff3b5c');
      R(g, x + 5, y + 10, 2, 2, '#ffc285');
    } else if (v === 'uptime') {
      R(g, x + 1, y + 1, 10, 13, '#0f1412');
      for (let i = 0; i < 5; i++) R(g, x + 2 + i * 2, y + 11 - (3 + i), 1, 3 + i, '#7ee0a1');
      R(g, x + 2, y + 12, 8, 1, '#7ee0a1');
      R(g, x + 2, y + 2, 5, 1, '#e9e9e6');
    } else {
      // cat
      R(g, x + 1, y + 1, 10, 13, '#ffc285');
      R(g, x + 3, y + 5, 6, 5, '#2a2f38');
      R(g, x + 3, y + 4, 1, 1, '#2a2f38'); R(g, x + 8, y + 4, 1, 1, '#2a2f38');
      R(g, x + 4, y + 7, 1, 1, '#7ee0a1'); R(g, x + 7, y + 7, 1, 1, '#7ee0a1');
      R(g, x + 5, y + 11, 2, 1, ink);
    }
  }

  const NEON_SHAPES = {
    heart: ['.XX.XX.', 'XXXXXXX', 'XXXXXXX', '.XXXXX.', '..XXX..', '...X...'],
    code: ['..X...X..', '.X.....X.', 'X...X...X', '.X.X...X.', '..X...X..'],
    bolt: ['...XX', '..XX.', '.XXXX', '..XX.', '.XX..', 'XX...'],
    wifi: ['.XXXXX.', 'X.....X', '..XXX..', '.X...X.', '...X...'],
    smile: ['.XXXXX.', 'X.....X', 'X.X.X.X', 'X.....X', 'X.XXX.X', '.XXXXX.'],
  };
  function neon(g, e, t) {
    const shape = NEON_SHAPES[e.variant || 'heart'] || NEON_SHAPES.heart;
    const col = e.color || '#ff2bd6';
    const w = shape[0].length, h = shape.length;
    const x0 = e.px + 8 - Math.ceil(w / 2), y0 = e.py - 20;
    const on = !(Math.sin(t * 13 + e.seed) > 0.985);
    g.fillStyle = rgba(col, on ? 0.28 : 0.1);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (shape[j][i] === 'X') g.fillRect(x0 + i - 1, y0 + j - 1, 3, 3);
    g.fillStyle = on ? shade(col, 0.45) : shade(col, -0.3);
    for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) if (shape[j][i] === 'X') g.fillRect(x0 + i, y0 + j, 1, 1);
  }

  function clock(g, e, t) {
    const cx = e.px + 8, cy = e.py - 15;
    R(g, cx - 4, cy - 5, 9, 11, '#0a0b0e');
    R(g, cx - 5, cy - 4, 11, 9, '#0a0b0e');
    R(g, cx - 3, cy - 4, 7, 9, e.color || '#e9e9e6');
    R(g, cx - 4, cy - 3, 9, 7, e.color || '#e9e9e6');
    R(g, cx, cy - 4, 1, 1, '#5d6878'); R(g, cx, cy + 4, 1, 1, '#5d6878'); R(g, cx - 4, cy, 1, 1, '#5d6878'); R(g, cx + 4, cy, 1, 1, '#5d6878');
    const a = t * 0.5, b = t * 0.04;
    for (let r = 0; r <= 3; r++) R(g, Math.round(cx + Math.sin(a) * r), Math.round(cy - Math.cos(a) * r), 1, 1, '#ff3b5c');
    for (let r = 0; r <= 2; r++) R(g, Math.round(cx + Math.sin(b) * r), Math.round(cy - Math.cos(b) * r), 1, 1, '#1c2129');
  }

  function arcade(g, e, t) {
    const px = e.px, py = e.py, c = e.color || '#3b2a6b', d = shade(c, -0.35), l = shade(c, 0.2);
    R(g, px + 1, py + 13, 15, 2, 'rgba(0,0,0,0.35)');
    R(g, px + 2, py - 22, 12, 35, c);
    R(g, px + 2, py - 22, 1, 35, l);
    R(g, px + 13, py - 22, 1, 35, d);
    R(g, px + 2, py - 22, 12, 4, '#ffd23f');
    R(g, px + 4, py - 21, 8, 2, Math.sin(t * 4) > 0 ? '#ff2bd6' : '#ff7a17');
    R(g, px + 3, py - 16, 10, 9, '#06070a');
    // tiny game: a ship and falling blocks
    const k = Math.floor(t * 6);
    R(g, px + 4 + (k % 7), py - 9, 2, 1, '#7ee0a1');
    R(g, px + 4 + ((k * 3) % 8), py - 15 + (k % 5), 1, 1, '#ff3b5c');
    R(g, px + 5 + ((k * 5) % 6), py - 14 + ((k + 2) % 5), 1, 1, '#00e5ff');
    R(g, px + 2, py - 6, 12, 3, d);
    R(g, px + 5, py - 8, 1, 2, '#121418'); R(g, px + 4, py - 9, 3, 1, '#ff3b5c');
    R(g, px + 9, py - 6, 1, 1, '#00e5ff'); R(g, px + 11, py - 6, 1, 1, '#ffd23f');
    R(g, px + 3, py - 2, 10, 14, shade(c, -0.15));
    R(g, px + 6, py + 3, 4, 2, '#121418');
  }

  function hologram(g, e, t) {
    const px = e.px, py = e.py, cx = px + 8;
    R(g, px + 3, py + 12, 10, 2, 'rgba(0,0,0,0.3)');
    R(g, px + 3, py + 8, 10, 4, '#2a2f38');
    R(g, px + 3, py + 8, 10, 1, '#3d434d');
    R(g, px + 5, py + 7, 6, 1, '#00e5ff');
    // light cone
    for (let i = 0; i < 12; i++) { g.fillStyle = rgba('#00e5ff', 0.05 + i * 0.006); g.fillRect(cx - 1 - Math.floor(i / 3), py + 6 - i, 3 + Math.floor(i / 3) * 2, 1); }
    // rotating wireframe globe
    const cy = py - 12, rad = 6;
    const fl = Math.sin(t * 17) > 0.9 ? 0.4 : 0.9;
    g.fillStyle = rgba('#7ff6ff', fl);
    for (let s = 0; s < 28; s++) { const a = (s / 28) * Math.PI * 2; g.fillRect(Math.round(cx + Math.cos(a) * rad), Math.round(cy + Math.sin(a) * rad), 1, 1); }
    for (let m = 0; m < 3; m++) {
      const ph = t * 1.4 + (m * Math.PI) / 3, rx = Math.abs(Math.cos(ph)) * rad;
      for (let s = 0; s < 18; s++) { const a = (s / 18) * Math.PI * 2; g.fillRect(Math.round(cx + Math.cos(a) * rx), Math.round(cy + Math.sin(a) * rad), 1, 1); }
    }
    g.fillRect(cx - rad, cy, rad * 2 + 1, 1);
  }

  function pcgamer(g, e, t) {
    const px = e.px + 4, py = e.py - 15;
    R(g, px, py, 8, 13, '#121418');
    R(g, px, py, 8, 1, '#2a2f38');
    R(g, px + 1, py + 1, 6, 11, '#0a0b10');
    for (let i = 0; i < 3; i++) {
      g.fillStyle = hsl(t * 80 + i * 60, 0.95);
      g.fillRect(px + 2, py + 2 + i * 3, 3, 2);
    }
    g.fillStyle = hsl(t * 80 + 200, 0.7);
    g.fillRect(px + 6, py + 1, 1, 11);
  }

  function bonsai(g, e) {
    const px = e.px, py = e.py;
    R(g, px + 4, py - 4, 8, 3, '#5a3b2e');
    R(g, px + 4, py - 4, 8, 1, '#7a5040');
    R(g, px + 7, py - 8, 2, 4, '#4a3a2c');
    R(g, px + 6, py - 9, 2, 1, '#4a3a2c');
    R(g, px + 3, py - 13, 6, 4, '#2c5f45'); R(g, px + 8, py - 12, 5, 3, '#3c8059'); R(g, px + 4, py - 14, 3, 1, '#58a578');
  }

  function beanbag(g, e) {
    const px = e.px, py = e.py, c = e.color || '#7c3aed', d = shade(c, -0.35), l = shade(c, 0.22);
    R(g, px + 1, py + 12, 14, 3, 'rgba(0,0,0,0.3)');
    R(g, px + 2, py + 1, 12, 12, c);
    R(g, px + 1, py + 4, 14, 8, c);
    R(g, px + 3, py, 9, 2, c);
    R(g, px + 3, py + 1, 6, 1, l);
    R(g, px + 4, py + 5, 8, 3, d);
    R(g, px + 1, py + 11, 14, 1, d);
  }

  function toolcart(g, e) {
    const px = e.px, py = e.py, c = e.color || '#c0392b', d = shade(c, -0.35), l = shade(c, 0.2);
    R(g, px + 1, py + 13, 14, 2, 'rgba(0,0,0,0.35)');
    R(g, px + 2, py - 10, 12, 21, c);
    R(g, px + 2, py - 10, 12, 1, l);
    R(g, px + 13, py - 10, 1, 21, d);
    for (let i = 0; i < 4; i++) { R(g, px + 3, py - 7 + i * 5, 10, 1, d); R(g, px + 6, py - 5 + i * 5, 4, 1, '#c9ced6'); }
    R(g, px + 1, py - 12, 14, 2, '#3a414c');
    R(g, px + 4, py - 14, 2, 2, '#ffd23f'); R(g, px + 8, py - 15, 4, 3, '#5d6878');
    R(g, px + 3, py + 11, 2, 2, '#121418'); R(g, px + 11, py + 11, 2, 2, '#121418');
  }

  function banner(g, e) {
    const px = e.px, py = e.py, c = e.color || '#7ee0a1';
    R(g, px + 3, py + 12, 10, 2, 'rgba(0,0,0,0.3)');
    R(g, px + 3, py + 9, 10, 3, '#2a2f38');
    R(g, px + 4, py - 22, 8, 31, '#e9e9e6');
    R(g, px + 4, py - 22, 8, 1, '#c9ced6');
    R(g, px + 5, py - 19, 6, 6, c);
    R(g, px + 6, py - 18, 4, 4, '#ffffff');
    R(g, px + 7, py - 17, 2, 2, c);
    R(g, px + 5, py - 10, 6, 1, '#5d6878'); R(g, px + 5, py - 8, 4, 1, '#9aa3b0'); R(g, px + 5, py - 6, 5, 1, '#9aa3b0');
    R(g, px + 4, py + 1, 8, 2, c);
  }

  function ledtube(g, e, t) {
    const px = e.px, py = e.py, c = e.color || '#00e5ff';
    R(g, px + 5, py + 11, 6, 2, 'rgba(0,0,0,0.3)');
    R(g, px + 6, py + 9, 4, 3, '#2a2f38');
    const col = e.variant === 'rainbow' ? hsl(t * 70, 1) : c;
    R(g, px + 7, py - 20, 2, 29, col);
    g.fillStyle = 'rgba(255,255,255,0.55)';
    g.fillRect(px + 7, py - 20, 1, 29);
  }

  const DRAW = {
    rug_robot: rugRobot, rug_claude: rugClaude, rug_gpt: rugGpt, rug_rgb: rugRgb,
    poster, neon, clock, arcade, hologram, pcgamer, bonsai, beanbag, toolcart, banner, ledtube,
  };
  const BOUNDS = {
    rug: (e) => ({ x: e.px, y: e.py, w: e.tw * T, h: e.th * T }),
    poster: (e) => ({ x: e.px + 1, y: e.py - 25, w: 14, h: 17 }),
    neon: (e) => ({ x: e.px, y: e.py - 22, w: 16, h: 10 }),
    clock: (e) => ({ x: e.px + 2, y: e.py - 21, w: 12, h: 12 }),
    arcade: (e) => ({ x: e.px + 1, y: e.py - 23, w: 14, h: 37 }),
    hologram: (e) => ({ x: e.px + 1, y: e.py - 20, w: 14, h: 34 }),
    pcgamer: (e) => ({ x: e.px + 3, y: e.py - 16, w: 10, h: 15 }),
    bonsai: (e) => ({ x: e.px + 3, y: e.py - 15, w: 10, h: 12 }),
    beanbag: (e) => ({ x: e.px, y: e.py - 1, w: 16, h: 16 }),
    toolcart: (e) => ({ x: e.px + 1, y: e.py - 16, w: 14, h: 30 }),
    banner: (e) => ({ x: e.px + 3, y: e.py - 23, w: 10, h: 37 }),
    ledtube: (e) => ({ x: e.px + 4, y: e.py - 21, w: 8, h: 34 }),
  };
  DL.DECOR_KINDS = DRAW;

  // extend the shared item drawing / geometry without touching the classic kinds
  const baseDraw = DL.drawItem, baseGeom = DL.itemGeom;
  DL.drawItem = function (g, e, t) {
    const f = DRAW[e.kind];
    if (f) f(g, e, t || 0);
    else baseDraw(g, e, t);
  };
  DL.itemGeom = function (e) {
    baseGeom(e);
    const b = BOUNDS[e.kind] || (e.kind.indexOf('rug_') === 0 ? BOUNDS.rug : null);
    if (b) e.bounds = b(e);
    if (e.wall) { e.ix = e.px + 8; e.iy = e.py + 10; }
  };

  /* ------------------------------------------------------------------ */
  /* Catalog entries + per-item style options                            */
  /* ------------------------------------------------------------------ */
  DL.DECOR_CATALOG = [
    { id: 'rug_robot', cat: 'theme', name: 'Tapete robô', w: 2, h: 2, solid: false, rug: true, desc: 'Um robozinho para a sala da equipe.' },
    { id: 'rug_claude', cat: 'theme', name: 'Tapete Claude', w: 2, h: 2, solid: false, rug: true, desc: 'Coral e creme, com o brilho em estrela.' },
    { id: 'rug_gpt', cat: 'theme', name: 'Tapete ChatGPT', w: 2, h: 2, solid: false, rug: true, desc: 'Escuro com o nó de seis voltas.' },
    { id: 'rug_rgb', cat: 'theme', name: 'Tapete gamer', w: 2, h: 2, solid: false, rug: true, desc: 'Borda RGB animada.' },
    { id: 'poster', cat: 'theme', name: 'Quadro / pôster', mount: 'wall', desc: 'Vai na parede do fundo. Selecione para trocar a arte.' },
    { id: 'neon', cat: 'theme', name: 'Letreiro neon', mount: 'wall', desc: 'Na parede do fundo. Escolha forma e cor.' },
    { id: 'clock', cat: 'theme', name: 'Relógio', mount: 'wall', desc: 'Relógio de parede.' },
    { id: 'arcade', cat: 'theme', name: 'Fliperama', desc: 'Decoração gamer jogável… quase.' },
    { id: 'beanbag', cat: 'theme', name: 'Pufe', desc: 'Para os intervalos.' },
    { id: 'ledtube', cat: 'theme', name: 'Tubo de LED', desc: 'Luz RGB de piso.' },
    { id: 'pcgamer', cat: 'theme', name: 'PC gamer', mount: 'surface', desc: 'Gabinete com fans RGB, em cima de uma mesa.' },
    { id: 'hologram', cat: 'theme', name: 'Holograma', desc: 'Projetor cyberpunk.' },
    { id: 'toolcart', cat: 'theme', name: 'Carrinho de ferramentas', desc: 'Industrial e útil.' },
    { id: 'bonsai', cat: 'theme', name: 'Bonsai', mount: 'surface', desc: 'Minimalista, em cima de uma mesa.' },
    { id: 'banner', cat: 'theme', name: 'Banner da empresa', desc: 'Corporativo, com a sua cor.' },
  ];
  DL.DECOR_NAMES = {};
  for (const d of DL.DECOR_CATALOG) DL.DECOR_NAMES[d.id] = d.name;

  const FURN_COLORS = ['#2a2e36', '#3b2c22', '#6b5038', '#c9c7c2', '#1d2440', '#3a1f24', '#1f3a33', '#141026'];
  const SEAT_COLORS = ['#1d2028', '#7c3aed', '#ff3b5c', '#00a8c6', '#1f6f5c', '#5a3b2e', '#e9e9e6', '#ff7a17'];
  const LIGHT_COLORS = ['#ff2bd6', '#00e5ff', '#7c5cff', '#7ee0a1', '#ffd23f', '#ff7a17', '#ff3b5c', '#ffffff'];
  const CHAIRS = [['', 'Escritório'], ['gamer', 'Gamer'], ['exec', 'Executiva']];
  DL.ITEM_STYLES = {
    desk: [{ key: 'color', label: 'Mesa', colors: FURN_COLORS }, { key: 'chair.variant', label: 'Cadeira', options: CHAIRS }, { key: 'chair.color', label: 'Assento', colors: SEAT_COLORS }, { key: 'os', label: 'Sistema', options: [['', 'Windows'], ['linux', 'Linux'], ['mac', 'macOS']] }],
    chair: [{ key: 'variant', label: 'Modelo', options: CHAIRS }, { key: 'color', label: 'Assento', colors: SEAT_COLORS }],
    table: [{ key: 'color', label: 'Tampo', colors: FURN_COLORS }],
    monitor: [{ key: 'variant', label: 'Modelo', options: [['', 'Padrão'], ['white', 'Branco'], ['rgb', 'Com RGB']] }, { key: 'color', label: 'Luz', colors: LIGHT_COLORS }, { key: 'os', label: 'Sistema', options: [['', 'Windows'], ['linux', 'Linux'], ['mac', 'macOS']] }],
    plant: [{ key: 'variant', label: 'Espécie', options: [['', 'Folhagem'], ['cactus', 'Cacto'], ['palm', 'Palmeira'], ['flower', 'Flores']] }],
    lamp: [{ key: 'color', label: 'Luz', colors: ['#ffc285', '#ffe9b0', '#a0c3ec', '#ff2bd6', '#7ee0a1'] }],
    sofa: [{ key: 'color', label: 'Tecido', colors: ['#2f3a4d', '#5a3b2e', '#1f6f5c', '#7c3aed', '#3a1f24', '#8a8f98'] }],
    rug: [{ key: 'color', label: 'Cor', colors: ['#1d2433', '#3a1f24', '#1f3a33', '#2a1f3d', '#5a3b2e', '#6b5038'] }],
    rug_robot: [{ key: 'color', label: 'Fundo', colors: ['#26303f', '#2a1f3d', '#1f3a33', '#3a1f24'] }],
    poster: [{ key: 'variant', label: 'Arte', options: [['server', 'Datacenter'], ['game', 'Game'], ['space', 'Espaço'], ['uptime', '99,9%'], ['cat', 'Gato']] }],
    neon: [{ key: 'variant', label: 'Forma', options: [['heart', 'Coração'], ['code', '</>'], ['bolt', 'Raio'], ['wifi', 'Wi-Fi'], ['smile', 'Sorriso']] }, { key: 'color', label: 'Cor', colors: LIGHT_COLORS }],
    clock: [{ key: 'color', label: 'Mostrador', colors: ['#e9e9e6', '#ffd23f', '#a0c3ec', '#c4b5fd'] }],
    arcade: [{ key: 'color', label: 'Gabinete', colors: ['#3b2a6b', '#8a2d3b', '#1f3a5c', '#1f6f5c', '#141026'] }],
    beanbag: [{ key: 'color', label: 'Cor', colors: SEAT_COLORS }],
    ledtube: [{ key: 'variant', label: 'Modo', options: [['', 'Cor fixa'], ['rainbow', 'Arco-íris']] }, { key: 'color', label: 'Cor', colors: LIGHT_COLORS }],
    toolcart: [{ key: 'color', label: 'Cor', colors: ['#c0392b', '#2f3a4d', '#ffd23f', '#1f6f5c'] }],
    banner: [{ key: 'color', label: 'Marca', colors: ['#7ee0a1', '#7c5cff', '#ff7a17', '#00a8c6', '#ff3b5c'] }],
  };
  // read / write "chair.variant" style keys
  DL.itemStyleGet = (e, key) => key.split('.').reduce((o, k) => (o ? o[k] : undefined), e);
  DL.itemStyleSet = (e, key, v) => {
    const ks = key.split('.'), last = ks.pop(), o = ks.reduce((x, k) => (x ? x[k] : null), e);
    if (o) o[last] = v || undefined;
  };

  /* ------------------------------------------------------------------ */
  /* Room style panel (build mode → "Estilo da sala")                    */
  /* ------------------------------------------------------------------ */
  DL.createDecor = function (game, builder) {
    const scene = game.scene;
    const world = () => scene.world;
    const el = document.getElementById('buildStyle');
    const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

    const room = () => world().rooms[builder.api.roomIndex()] || world().rooms[0];
    // a room's own editable style (materialised from its theme, or the classic look)
    function own(r) {
      if (!r.style) {
        const base = styleOf(r);
        r.style = base ? clone(base) : { floor: r.floor === 'carpet' ? 'carpet' : 'tile', floorColor: null, wall: 'plain', wallColor: null, light: 'auto', rgb: { on: false, color: '#7c5cff', intensity: 50, areas: ['ceiling'], effect: 'static' }, classic: true };
      }
      return r.style;
    }

    function repaint() { scene.refreshWorld(true); }

    // the fine controls (floor, walls, light, RGB) stay folded until the player asks for them
    let custom = false;
    const chip = (attr, v, label, on, extra, xs) => '<button type="button" class="chip' + (xs ? ' chip--xs' : '') + (on ? ' is-on' : '') + '" ' + attr + '="' + v + '"' + (extra || '') + '>' + label + '</button>';
    const swatches = (attr, cols, cur) => '<div class="swatches">' + cols.map((c) => '<button type="button" class="swatch swatch--sm' + (cur === c ? ' is-on' : '') + '" ' + attr + '="' + c + '" style="--c:' + c + '" aria-label="' + c + '"></button>').join('') + '</div>';
    const group = (label, body, cls) => '<div class="st-group' + (cls ? ' ' + cls : '') + '"><span class="eyebrow-sm">' + label + '</span>' + body + '</div>';

    function render() {
      if (!el || el.hidden) return;
      const W = world(), r = room();
      if (!r) { el.innerHTML = ''; return; }
      const s = styleOf(r) || { floor: r.floor === 'carpet' ? 'carpet' : 'tile', wall: 'plain', light: 'auto', rgb: { on: false, color: '#7c5cff', intensity: 50, areas: ['ceiling'], effect: 'static' }, classic: true };
      const rgb = s.rgb || {};
      let h = '<div class="room-sec"><span class="eyebrow-sm room-sec__k">Sala</span><div class="room-list">' + W.rooms.map((x, i) => chip('data-st-room', i, esc(x.name), x === r, '', true)).join('') + '<span class="st-tip">ou clique numa sala no mapa</span></div></div>';
      h += '<div class="room-sec"><span class="eyebrow-sm room-sec__k">Tema</span><div class="st-themes">' + chip('data-st-theme', '', 'Padrão', !r.style && !r.theme, '', true) + THEME_ORDER.map((id) => {
        const th = THEMES[id];
        const dots = '<span class="st-dots">' + th.swatch.map((c) => '<i style="background:' + c + '"></i>').join('') + '</span>';
        return chip('data-st-theme', id, dots + th.name, r.theme === id && (!r.style || r.style.fromTheme === id), ' title="' + th.desc + '"', true);
      }).join('') + '</div></div>';
      h += '<div class="room-sec st-acts"><button type="button" class="btn btn--sm" data-st-act="decorate">Decorar com o tema</button>' +
        '<button type="button" class="btn btn--sm' + (custom ? ' is-on' : '') + '" data-st-act="custom" aria-expanded="' + custom + '">Personalizar piso, paredes e luz ' + (custom ? '▴' : '▾') + '</button></div>';
      if (!custom) { el.innerHTML = h; return; }
      h += '<div class="st-grid">';
      h += group('Piso', '<div class="chips">' + FLOORS.map(([v, l]) => chip('data-st-floor', v, l, s.floor === v)).join('') + '</div>' + swatches('data-st-floorcol', FLOOR_COLORS, s.floorColor));
      h += group('Paredes', '<div class="chips">' + WALLS.map(([v, l]) => chip('data-st-wall', v, l, s.wall === v)).join('') + '</div>' + swatches('data-st-wallcol', WALL_COLORS, s.wallColor));
      h += group('Teto / iluminação', '<div class="chips">' + LIGHTS.map(([v, l]) => chip('data-st-light', v, l, (s.light || 'auto') === v)).join('') + '</div>');
      h += group('Iluminação RGB',
        '<div class="chips">' + chip('data-st-rgb', 'toggle', rgb.on ? 'Ligada' : 'Desligada', !!rgb.on) + EFFECTS.map(([v, l]) => chip('data-st-fx', v, l, rgb.effect === v)).join('') + '</div>' +
        '<div class="st-rgb">' + swatches('data-st-rgbcol', RGB_COLORS, rgb.color) +
        '<label class="st-color" title="Outra cor"><input type="color" id="stRgbColor" value="' + (rgb.color || '#7c5cff') + '"></label>' +
        '<label class="st-range"><span class="eyebrow-sm">Intensidade</span><input type="range" id="stRgbInt" min="10" max="100" step="5" value="' + (rgb.intensity == null ? 50 : rgb.intensity) + '"><b id="stRgbVal">' + (rgb.intensity == null ? 50 : rgb.intensity) + '%</b></label></div>' +
        '<div class="chips"><span class="st-sub">Áreas</span>' + AREAS.map(([v, l]) => chip('data-st-area', v, l, (rgb.areas || []).indexOf(v) >= 0)).join('') + '</div>');
      h += '</div>';
      el.innerHTML = h;
    }

    // every edit turns the room into a custom style (keeps the theme name only as a starting point)
    function edit(fn, noRepaint) {
      const r = room();
      own(r);
      const s = r.style = clone(r.style); // never edit a style object another room shares
      const wasClassic = !!s.classic;
      fn(s, r);
      delete s.classic;
      s.fromTheme = null;
      if (!noRepaint || wasClassic || s.wall === 'neon') repaint();
      render();
    }

    function applyTheme(id) {
      const r = room();
      if (!id) { delete r.style; delete r.theme; repaint(); render(); game.toast('info', r.name, 'Visual padrão'); return; }
      r.theme = id;
      r.style = clone(THEMES[id].style);
      r.style.fromTheme = id;
      repaint();
      render();
      game.toast('ok', r.name, 'Tema ' + THEMES[id].name + ' aplicado · misture à vontade');
    }

    // place a few of the theme's objects in free spots of the room (same rules as the player)
    function decorate() {
      const r = room(), id = r.theme || (r.style && r.style.fromTheme);
      const th = THEMES[id];
      if (!th) { game.toast('info', 'Escolha um tema', 'Os objetos vêm do tema da sala'); return; }
      let n = 0;
      for (const kind of th.decor) {
        const def = (DL.CATALOG || []).find((d) => d.id === kind);
        if (!def) continue;
        const spots = [];
        if (def.mount === 'wall') for (let x = r.x; x < r.x + r.w; x++) spots.push([x, r.y]);
        else if (def.mount === 'surface') {
          for (const tb of world().items) if (tb.kind === 'table' && tb.tx >= r.x && tb.tx < r.x + r.w && tb.ty >= r.y && tb.ty < r.y + r.h) for (let i = 0; i < tb.tw; i++) for (let j = 0; j < tb.th; j++) spots.push([tb.tx + i, tb.ty + j]);
        } else for (let y = r.y + 1; y < r.y + r.h - (def.h || 1) + 1; y++) for (let x = r.x; x < r.x + r.w - (def.w || 1) + 1; x++) spots.push([x, y]);
        spots.sort(() => Math.random() - 0.5);
        for (const [x, y] of spots.slice(0, 40)) {
          if (!builder.api.place(kind, x, y, 0)) { n++; break; }
        }
      }
      game.toast(n ? 'ok' : 'info', r.name, n ? n + ' objeto(s) do tema ' + th.name + ' adicionados' : 'Sem espaço livre para a decoração do tema');
    }

    el.addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      const d = b.dataset;
      if (d.stRoom != null) {
        builder.api.setRoomIndex(+d.stRoom);
        const r = room();
        // centre the room in the space the build panel leaves free (demo.js)
        if (game.focusArea) game.focusArea(r.x * T, r.y * T, r.w * T, r.h * T);
        else game.focus((r.x + r.w / 2) * T, (r.y + r.h / 2) * T);
        render();
      }
      else if (d.stTheme != null) applyTheme(d.stTheme);
      else if (d.stAct === 'decorate') decorate();
      else if (d.stAct === 'custom') { custom = !custom; render(); }
      else if (d.stFloor) edit((s) => { s.floor = d.stFloor; if (!s.floorColor || FLOOR_COLORS.indexOf(s.floorColor) < 0) s.floorColor = DEFAULT_COLOR[d.stFloor]; });
      else if (d.stFloorcol) edit((s) => { s.floorColor = d.stFloorcol; });
      else if (d.stWall) edit((s) => { s.wall = d.stWall; if (!s.wallColor) s.wallColor = WALL_DEFAULT[d.stWall]; });
      else if (d.stWallcol) edit((s) => { s.wallColor = d.stWallcol; });
      else if (d.stLight) edit((s) => { s.light = d.stLight; });
      else if (d.stRgb) edit((s) => { s.rgb = s.rgb || {}; s.rgb.on = !s.rgb.on; if (!s.rgb.areas || !s.rgb.areas.length) s.rgb.areas = ['ceiling']; }, true);
      else if (d.stFx) edit((s) => { s.rgb.effect = d.stFx; s.rgb.on = true; }, true);
      else if (d.stRgbcol) edit((s) => { s.rgb.color = d.stRgbcol; s.rgb.on = true; if (s.rgb.effect === 'rainbow') s.rgb.effect = 'static'; }, true);
      else if (d.stArea) edit((s) => {
        const a = s.rgb.areas = s.rgb.areas || [];
        const i = a.indexOf(d.stArea);
        if (i >= 0) a.splice(i, 1); else a.push(d.stArea);
        s.rgb.on = a.length > 0;
      }, true);
      b.blur();
    });
    el.addEventListener('input', (ev) => {
      const r = room();
      own(r);
      r.style = clone(r.style);
      if (ev.target.id === 'stRgbInt') {
        const s = r.style;
        s.rgb.intensity = +ev.target.value;
        s.rgb.on = true;
        delete s.classic;
        const v = document.getElementById('stRgbVal');
        if (v) v.textContent = ev.target.value + '%';
      } else if (ev.target.id === 'stRgbColor') {
        const s = r.style;
        s.rgb.color = ev.target.value;
        s.rgb.on = true;
        if (s.rgb.effect === 'rainbow') s.rgb.effect = 'static';
        delete s.classic;
      }
    });
    el.addEventListener('change', (ev) => { if (ev.target.id === 'stRgbColor' || ev.target.id === 'stRgbInt') render(); });
    el.addEventListener('pointerdown', (ev) => ev.stopPropagation());

    game.on('style-room', render);
    game.on('world', () => { if (el && !el.hidden) render(); });
    return { render, applyTheme, decorate };
  };
})();
