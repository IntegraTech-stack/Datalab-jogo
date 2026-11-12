/* DataLab — the street outside the datacenter.
   · The door: in the left (west) wall of the first room — build.js picks the tile (world.exitDoor) every
     time the rooms change — painted on that wall's face with the isometric camera (iso.js: e.drawIso /
     e.isoRect / DL.isoMap). It is not a world item: it is never saved, sold or moved. "E · Sair".
   · The street: a small world of its own (its own tile grid and collision), drawn by a second Scene with
     the same isometric camera on the same canvas. The datacenter keeps running behind it (crew, devices,
     economy): only the picture and the player's collision change. While outside, the player's character
     is hidden in the datacenter (so the crew, the pet and the trails don't see it there) and drawn here.
   · Walkable: only a strip of sidewalk in front of the building, CALCADA_PASSOS tiles to each side of the
     door (WALK). Every other tile of the street world is solid, so scene.js' collision slides along it.
     Positions from a save or from another player are clamped into it (clampFeet).
   Loaded after demo.js (needs window.DataLabDemo). */
(function () {
  'use strict';
  const DL = window.DL, D = window.DataLabDemo;
  if (!DL || !D || !D.scene || !DL.isoMap || !DL.isoKit) return;
  const T = DL.T, R = DL.R, K = DL.isoKit, scene = D.scene, G = D.game, player = D.player;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  // a colour lighter (k > 1) or darker (k < 1)
  const shadeHex = (hex, k) => {
    const n = parseInt(hex.slice(1), 16), f = (v) => Math.max(0, Math.min(255, Math.round(v * k)));
    return '#' + ((1 << 24) | (f(n >> 16) << 16) | (f((n >> 8) & 255) << 8) | f(n & 255)).toString(16).slice(1);
  };
  const r1 = (v) => Math.round(v * 10) / 10;

  /* ------------------------------------------------------------------ */
  /* the street's layout (tiles)                                          */
  /* ------------------------------------------------------------------ */
  // how far the player may walk along the sidewalk, to each side of the door (in steps = tiles)
  const CALCADA_PASSOS = 10;
  /* ===================== O TAMANHO DA CIDADE (fácil de mudar) =====================
     A cidade, em quadradinhos de 16 px (T). O jogador só anda na calçada em frente ao data center; o resto
     é cenário, para a tela ficar cheia de cidade em qualquer zoom.
       LARGURA    — colunas da cidade (a avenida vai de ponta a ponta; cada ponta vira uma ponte sobre a água)
       ATRAS      — linhas acrescentadas atrás dos prédios da avenida: os quarteirões de trás e a segunda
                    avenida (0 = só a avenida de sempre). Com mais linhas a cidade fica mais funda.
       PRACA_ALTO — linhas da praça do outro lado da avenida
       PONTE      — comprimento das pontes nas pontas da avenida (somem na névoa)
     Mudar LARGURA ou ATRAS reposiciona tudo sozinho (o data center fica no meio). */
  const LARGURA = 96, ATRAS = 20, PRACA_ALTO = 14, PONTE = 20;
  const SW = LARGURA, SH = ATRAS + 20 + PRACA_ALTO + 2; // + 2: the promenade along the water, south of the square
  const DOOR_X = Math.floor(SW / 2);  // the tile column of the datacenter's front door (the middle of the street)
  const DX = DOOR_X - 34;             // how far the old (68-wide) layout's tile columns moved east
  // rows (y), front avenue: buildings above `face`; sidewalk face..furn (furn = the row of posts / benches /
  // planters); the road road0..road1 (two lanes each way); the far sidewalk far0..far1; then the square (park)
  const ROWS = { face: 8 + ATRAS, walk0: 8 + ATRAS, walk1: 10 + ATRAS, furn: 11 + ATRAS, road0: 12 + ATRAS, road1: 17 + ATRAS, far0: 18 + ATRAS, far1: 19 + ATRAS, park: 20 + ATRAS };
  // …the square ends at the promenade (PROM..PROM+1), then the water
  const PROM = SH - 2;
  // rows, behind (only when ATRAS >= 20): the back blocks (bld0..bld1), the back avenue (its sidewalk
  // face2..furn2, road road2a..road2b, far sidewalk far2a..far2b), then a strip of yards and car parks
  // (yard0..yard1) behind the avenue's buildings, which start at bld2 (the deepest ones) … ROWS.face
  const TRAS = ATRAS >= 20 ? { bld0: 1, bld1: 8, face2: 8, walk2: 9, furn2: 9, road2a: 10, road2b: 13, far2a: 14, far2b: 15, yard0: 16, yard1: 20, bld2: 17 } : null;
  // the two side streets (tile columns x0..x1-1), from the front sidewalk north to the back avenue
  const LADOS = TRAS ? [{ x0: 7 + DX, x1: 13 + DX }, { x0: 57 + DX, x1: 63 + DX }] : [];
  const onLado = (tx) => LADOS.some((l) => tx >= l.x0 - 1 && tx < l.x1 + 1);
  // the largest view of the street (iso pixels): outside, the zoom never goes further out than this
  // (about the whole city: any wider and most of the screen would be water)
  const MAX_VIEW = { w: Math.round((SW + SH) * T * 0.8), h: Math.round((SW + SH) * T * 0.4) };
  // the smallest zoom (scene.S) that keeps the view inside MAX_VIEW (not rounded: crisp anyway, iso.js)
  const streetMinS = () => Math.max(1, scene.canvas.width / MAX_VIEW.w, scene.canvas.height / MAX_VIEW.h);
  // "far away": the zoom is so far out that small details (1–2 px) are not worth drawing
  const longe = (sc) => sc.S < 2;
  // the walkable zone (tiles, inclusive)
  const WALK = { x0: DOOR_X - CALCADA_PASSOS, x1: DOOR_X + CALCADA_PASSOS, y0: ROWS.walk0, y1: ROWS.walk1 };
  // …and where the player's feet can be inside it (scene.js' collision box is ±5 px wide, 4 px deep)
  const FEET = { x0: WALK.x0 * T + 5.5, x1: (WALK.x1 + 1) * T - 5.5, y0: WALK.y0 * T + 4.5, y1: (WALK.y1 + 1) * T - 0.5 };
  const SPAWN = { x: DOOR_X * T + 8, y: WALK.y0 * T + 9 }; // just outside the front door
  // the player's datacenter
  // (wider and taller than its neighbours, so it stands out on the street; its lot is a little deeper than
  // theirs — it used to start at row 1 and ran through the back avenue, which put it in the wrong depth order)
  const BLD = { x0: DOOR_X - 6, x1: DOOR_X + 7, y0: ROWS.face - 10, y1: ROWS.face, h: 100 };
  // the name sign on its facade (art pixels: x, the top z, width, height)
  const PANEL = { x: BLD.x0 * T + 14, z: 95, w: BLD.x1 * T - 14 - (BLD.x0 * T + 14), h: 24 };
  // the pedestrian crossing (tiles x0..x1-1), west of the walkable strip, past the flower bed
  const CROSS = { x0: DOOR_X - CALCADA_PASSOS - 5, x1: DOOR_X - CALCADA_PASSOS - 2 };
  // the square across the road (world px): two paths along it with a few paths between them, a fountain
  // opposite the datacenter, a playground and an ice-cream kiosk; trees, benches and lamps on the lawn
  const PK = ROWS.park;
  const PARK = {
    path1: { y0: (PK + 3) * T, y1: (PK + 4) * T - 4 },
    path2: { y0: (PK + 8) * T, y1: (PK + 8) * T + 12 },
    cross: [8 + DX, 27 + DX, 48 + DX, 60 + DX, 4, SW - 5],          // tile columns of the paths across
    fonte: { x: DOOR_X * T + 8, y: (PK + 5.5) * T + 2, r: 36 },
    parquinho: { x0: (10 + DX) * T, y0: (PK + 4.6) * T, x1: (17 + DX) * T, y1: (PK + 7.4) * T },
    quiosque: { x0: (41 + DX) * T + 4, y0: (PK + 1.5) * T, x1: (41 + DX) * T + 40, y1: (PK + 1.5) * T + 20 },
    end: PROM * T,                                                   // where the lawn ends (the promenade)
  };

  /* ------------------------------------------------------------------ */
  /* art (drawn once into small canvases, then mapped onto walls)        */
  /* ------------------------------------------------------------------ */
  const PAL = {
    out: '#05080d', frame: '#2b3a59', frameHi: '#394b6d', leaf: '#141b2c', leafHi: '#1b2540',
    glass: '#0f4a33', glassHi: '#1f9e66', neon: '#3dffa2', neonOff: '#145c3d', metal: '#8a98ad',
  };
  const DOOR_W = 16, DOOR_H = 36; // art pixels: a sign (rows 0–8) over a 26-px-tall door

  function doorArt(lit, sign) {
    const c = DL.mk(DOOR_W, DOOR_H), g = c.getContext('2d');
    const nb = lit ? PAL.neon : PAL.neonOff;
    // neon sign over the door: a dark box with a thin teal rim, the letters in bright green with room around them
    if (sign) {
      R(g, 0, 0, 16, 9, lit ? '#05b5b1' : '#04504f');
      R(g, 1, 1, 14, 7, '#03100b');
      DL.pixText(g, sign, 8 - (sign.length * 4 - 1) / 2, 2, lit ? PAL.neon : '#1f6b47');
    }
    // the door: frame, neon strip around the opening, leaf with a window, handle, kick plate, card reader
    const y0 = 10, H = 26;
    R(g, 0, y0, 16, H, PAL.frame);
    R(g, 0, y0, 16, 1, PAL.frameHi); R(g, 0, y0, 1, H, PAL.frameHi);
    R(g, 1, y0 + 1, 14, 1, nb); R(g, 1, y0 + 1, 1, H - 1, nb); R(g, 14, y0 + 1, 1, H - 1, nb);
    R(g, 2, y0 + 2, 12, H - 2, PAL.leaf);
    R(g, 2, y0 + 2, 12, 1, PAL.leafHi);
    R(g, 4, y0 + 4, 8, 11, PAL.out);
    R(g, 5, y0 + 5, 6, 9, PAL.glass);
    for (let i = 0; i < 4; i++) R(g, 6 + i, y0 + 9 - i, 1, 2, PAL.glassHi); // reflection
    R(g, 11, y0 + 16, 1, 3, PAL.metal);
    R(g, 10, y0 + 17, 1, 1, PAL.metal);
    R(g, 3, y0 + H - 4, 10, 2, PAL.leafHi);
    R(g, 4, y0 + 17, 2, 3, PAL.out);
    R(g, 4, y0 + 17, 2, 1, lit ? PAL.neon : PAL.neonOff);
    return c;
  }
  const ART = { on: doorArt(true, 'RUA'), off: doorArt(false, 'RUA'), outOn: doorArt(true, null), outOff: doorArt(false, null) };
  // neon stays on, with a short flicker now and then
  const signOn = (t) => { const k = t % 7.3; return !((k > 6.4 && k < 6.5) || (k > 6.62 && k < 6.7)); };

  /* ------------------------------------------------------------------ */
  /* where the player is                                                 */
  /* ------------------------------------------------------------------ */
  // where: 'dentro' (the datacenter) | 'rua' | a place on the street (lojas.js: 'lojaSkins', 'lojaCafe');
  // intro: the opening scene of a new world (see "the opening scene")
  // signsAt: when the player last came out (the shop signs light up then) · hl: the tutorial's arrows over
  // the shops (hlPend: waiting for the player to come out) · keepS: the zoom before going into a place
  const ST = { where: 'dentro', fade: null, intro: null, signsAt: -9, hl: null, hlPend: 0, keepS: null };
  const outside = () => ST.where === 'rua';
  // the places on the street that can be entered: lojas.js adds them (addPlace). A place: { id, nome,
  // scene (its own DL.Scene), spawn {x, y}, drawables(), target(player), update(dt), enter(), leave() }
  const PLACES = {};
  const place = () => PLACES[ST.where] || null;

  /* ------------------------------------------------------------------ */
  /* the door, inside                                                    */
  /* ------------------------------------------------------------------ */
  const door = {
    kind: 'exitdoor', exit: true, wall: true, solid: false, tx: 0, ty: 0, tw: 1, th: 1, px: 0, py: 0,
    isoRect: [0, 0, 0.5, T],
    // the prompt's key (demo.js): changes with the side, so "Sair" / "Entrar" is redrawn
    get id() { return 'EXIT-' + ST.where; },
    drawIso(g, sc, e, t) {
      const d = sc.world.exitDoor;
      if (!d) return null;
      const fx = (d.tx + 1) * T + 0.25; // just in front of the wall's face
      // the art's x runs left → right on screen (towards −y on this wall), its y runs down from the top
      DL.isoMap(g, sc, [fx, (d.ty + 1) * T, DOOR_H], [0, -1, 0], [0, 0, -1]);
      g.drawImage(signOn(t) ? ART.on : ART.off, 0, 0);
      return null; // not clickable: the door is used with E, like everything else
    },
  };
  // where the door is now (the first room can be resized or moved in build mode)
  function sync() {
    const d = scene.world.exitDoor;
    if (!d) return null;
    const fx = (d.tx + 1) * T;
    door.tx = d.tx; door.ty = d.ty; door.px = d.tx * T; door.py = d.ty * T;
    door.isoRect = [fx, d.ty * T, fx + 0.5, (d.ty + 1) * T];
    return d;
  }
  sync();
  // the scene rebuilds its draw list whenever the world changes: the door goes back in each time
  const refresh = scene.refreshWorld.bind(scene);
  scene.refreshWorld = function (floorChanged) {
    refresh(floorChanged);
    sync();
    this.drawables.push(door);
  };
  scene.drawables.push(door);

  // a soft green light on the floor in front of the door
  const lights = scene.lights;
  scene.lights = function (g, sc) {
    if (lights) lights.call(this, g, sc);
    const d = sc.world.exitDoor;
    if (d) DL.pool(g, (d.tx + 1) * T + 7, (d.ty + 0.5) * T, 22, signOn(sc.t) ? 'rgba(61,255,162,0.09)' : 'rgba(61,255,162,0.03)');
  };

  /* ------------------------------------------------------------------ */
  /* the street world                                                    */
  /* ------------------------------------------------------------------ */
  function buildWorld() {
    const W = SW, H = SH, N = W * H;
    const tiles = new Array(N).fill('.'), solid = new Uint8Array(N).fill(1);
    for (let y = WALK.y0; y <= WALK.y1; y++) for (let x = WALK.x0; x <= WALK.x1; x++) solid[y * W + x] = 0;
    return {
      W, H, tiles, solid, items: [], npcs: [], rows: { A: [], B: [] }, labels: [], interactables: [], byId: {},
      hasVideoWall: false, version: 1, street: true, spawn: { x: SPAWN.x, y: SPAWN.y },
    };
  }

  // the ground, painted once (top-down; iso.js lays it on the ground plane)
  function paintFloor(w) {
    const Wp = w.W * T, c = DL.mk(Wp, w.H * T), g = c.getContext('2d');
    const spec = (y0, y1, col, n, seed) => { for (let i = 0; i < n; i++) R(g, Math.floor(DL.hash(i * 3 + y0 + (seed || 0)) * Wp), y0 + Math.floor(DL.hash(i * 7 + 1 + y0 + (seed || 0)) * (y1 - y0)), 1, 1, col); };
    const slabs = (y0, y1, base, line) => {
      R(g, 0, y0 * T, Wp, (y1 - y0 + 1) * T, base);
      for (let y = y0; y <= y1; y++) for (let x = 0; x < w.W; x++) { R(g, x * T, y * T, T, 1, line); R(g, x * T, y * T, 1, T, line); }
    };
    // behind the sidewalk: the buildings' ground
    R(g, 0, 0, Wp, ROWS.face * T, '#0b0e15');
    // sidewalk: square slabs; a darker strip under the furniture
    slabs(ROWS.face, ROWS.furn, '#262d3c', '#2f374a');
    spec(ROWS.face * T, (ROWS.furn + 1) * T, '#1f2532', 260);
    // curbs
    R(g, 0, ROWS.road0 * T - 2, Wp, 2, '#59647d');
    R(g, 0, ROWS.road0 * T, Wp, 1, '#07080c');
    // the road: asphalt, the double line between the two directions, dashed lane lines
    const r0 = ROWS.road0 * T, r1 = (ROWS.road1 + 1) * T, mid = (ROWS.road0 + 3) * T;
    R(g, 0, r0 + 1, Wp, r1 - r0 - 1, '#121419');
    spec(r0, r1, '#191c23', 700);
    spec(r0, r1, '#0d0f13', 500, 9);
    // a few patches of newer asphalt
    for (const [px, py, pw, ph] of [[7 + DX, 1, 3, 1], [47 + DX, 4, 4, 1], [58 + DX, 1, 2, 2], [2, 3, 3, 1], [SW - 6, 2, 3, 1]]) R(g, px * T, (ROWS.road0 + py) * T + 3, pw * T, ph * T - 5, '#0f1115');
    const cx0 = CROSS.x0 * T, cx1 = CROSS.x1 * T;
    const skip = (x0, x1) => x1 > cx0 - 8 && x0 < cx1 + 8; // no lines on and around the crossing
    for (let x = 0; x < Wp; x += 4) if (!skip(x, x + 4)) { R(g, x, mid - 2, 4, 1, '#a8913f'); R(g, x, mid + 1, 4, 1, '#a8913f'); }
    for (const ly of [(ROWS.road0 + 1.5) * T, (ROWS.road0 + 4.5) * T]) for (let x = 0; x < Wp; x += 28) if (!skip(x + 4, x + 18)) R(g, x + 4, Math.round(ly), 14, 1, '#6f7686');
    // the crossing: stripes along the road (the way pedestrians see them), stop lines before it
    for (let y = r0 + 3; y < r1 - 2; y += 5) R(g, cx0, y, cx1 - cx0, 3, '#c9ccd4');
    for (let y = r0 + 3; y < r1 - 2; y += 5) for (let k = 0; k < 6; k++) R(g, cx0 + Math.floor(DL.hash(y * 5 + k) * (cx1 - cx0)), y + (k % 3), 1, 1, '#9fa3ad');
    R(g, cx0 - 8, mid + 3, 2, r1 - mid - 5, '#c9ccd4');   // cars going east (south lanes) stop before it
    R(g, cx1 + 6, r0 + 2, 2, mid - r0 - 5, '#c9ccd4');   // cars going west (north lanes) stop before it
    // arrows painted on the lanes
    const arrow = (x, y, dir) => {
      const col = '#8b919f';
      R(g, x, y, 12, 1, col);
      for (let k = 0; k < 3; k++) R(g, dir > 0 ? x + 12 - k : x + k - 2, y - k, 1, 2 * k + 1, col);
    };
    for (const ax of [6 + DX, 26 + DX, 46 + DX, 60 + DX, 3, SW - 8]) { arrow(ax * T, (ROWS.road0 + 0.8) * T, -1); arrow(ax * T + 8, (ROWS.road1 - 0.2) * T, 1); }
    // manhole covers and the drains along both curbs
    const manhole = (x, y) => {
      for (let dy = -3; dy <= 3; dy++) { const hw = dy === -3 || dy === 3 ? 1 : dy === -2 || dy === 2 ? 2 : 3; R(g, x - hw, y + dy, hw * 2 + 1, 1, '#1d2028'); }
      R(g, x - 1, y - 1, 3, 1, '#2a2e38'); R(g, x - 2, y + 1, 5, 1, '#2a2e38');
    };
    for (const [mx, my] of [[11 + DX, 2.5], [29 + DX, 4.5], [41 + DX, 1.4], [55 + DX, 3.6], [4, 3.5], [SW - 7, 2.2]]) manhole(mx * T, (ROWS.road0 + my) * T);
    for (let x = 5; x < w.W; x += 9) {
      R(g, x * T, ROWS.road0 * T + 1, 6, 2, '#05060a'); for (let k = 1; k < 6; k += 2) R(g, x * T + k, ROWS.road0 * T + 1, 1, 2, '#30343f');
      R(g, x * T + 20, (ROWS.road1 + 1) * T - 3, 6, 2, '#05060a'); for (let k = 1; k < 6; k += 2) R(g, x * T + 20 + k, (ROWS.road1 + 1) * T - 3, 1, 2, '#30343f');
    }
    /* ---------- behind the avenue's buildings: the back avenue, the side streets, the yards ---------- */
    if (TRAS) {
      const B = TRAS;
      // the back avenue, between the two side streets: sidewalks, curbs, a two-lane road
      const bx0 = LADOS[0].x0 * T, bx1 = LADOS[1].x1 * T;
      const slabsX = (x0, x1, y0, y1, base, line) => {
        R(g, x0, y0 * T, x1 - x0, (y1 - y0 + 1) * T, base);
        for (let y = y0; y <= y1; y++) for (let x = x0; x < x1; x += T) { R(g, x, y * T, T, 1, line); R(g, x, y * T, 1, T, line); }
      };
      slabsX(bx0, bx1, B.face2, B.furn2, '#242b39', '#2d3546');
      slabsX(bx0, bx1, B.far2a, B.far2b, '#232a38', '#2b3344');
      const q0 = B.road2a * T, q1 = (B.road2b + 1) * T, qm = (q0 + q1) / 2;
      R(g, bx0, q0 - 2, bx1 - bx0, 2, '#59647d'); R(g, bx0, q1 - 1, bx1 - bx0, 2, '#59647d');
      R(g, bx0, q0, bx1 - bx0, q1 - q0 - 1, '#121419');
      for (let i = 0; i < 400; i++) R(g, bx0 + Math.floor(DL.hash(i * 3 + 77) * (bx1 - bx0)), q0 + Math.floor(DL.hash(i * 7 + 78) * (q1 - q0)), 1, 1, i % 2 ? '#191c23' : '#0d0f13');
      for (let x = bx0 + 4; x < bx1 - 8; x += 28) R(g, x, Math.round(qm) - 1, 14, 1, '#6f7686');
      for (const ax of [LADOS[0].x1 + 4, DOOR_X - 4, DOOR_X + 9, LADOS[1].x0 - 8]) { arrow(ax * T, q0 + 9, -1); arrow(ax * T + 8, q1 - 8, 1); }
      for (let x = bx0 + 3 * T; x < bx1 - 2 * T; x += 11 * T) { R(g, x, q0 + 1, 6, 2, '#05060a'); R(g, x + 24, q1 - 4, 6, 2, '#05060a'); }
      // the yards' strip behind the front buildings: plain ground (the yards themselves are props)
      R(g, 0, B.yard0 * T, Wp, (B.yard1 - B.yard0 + 1) * T, '#0d1118');
      // the side streets: a sidewalk one step wide on each side, the road between, from the back avenue
      // down to the front sidewalk (a dropped curb there: the sidewalk slabs go across the mouth)
      for (const l of LADOS) {
        const x0 = l.x0 * T, x1 = l.x1 * T;
        slabsX(x0, x0 + T, B.far2a, ROWS.face - 1, '#232a38', '#2b3344');
        slabsX(x1 - T, x1, B.far2a, ROWS.face - 1, '#232a38', '#2b3344');
        R(g, x0 + T, q0, x1 - x0 - 2 * T, ROWS.face * T - q0, '#121419');
        R(g, x0 + T - 2, q1, 2, ROWS.face * T - q1, '#59647d'); R(g, x1 - T, q1, 2, ROWS.face * T - q1, '#59647d');
        for (let i = 0; i < 260; i++) R(g, x0 + T + Math.floor(DL.hash(i * 5 + x0) * (x1 - x0 - 2 * T)), q0 + Math.floor(DL.hash(i * 9 + x0 + 1) * (ROWS.face * T - q0)), 1, 1, i % 2 ? '#191c23' : '#0d0f13');
        for (let y = q1 + 8; y < ROWS.face * T - 10; y += 22) R(g, Math.round((x0 + x1) / 2) - 1, y, 1, 12, '#6f7686');
        // parking bays painted along the east side of the street
        for (let y = q1 + 14; y < ROWS.face * T - 36; y += 30) { R(g, x1 - T - 26, y, 26, 1, '#3a3f4c'); R(g, x1 - T - 26, y, 1, 30, '#3a3f4c'); }
        // the drop of the curb at the front sidewalk
        R(g, x0 + T, ROWS.face * T - 1, x1 - x0 - 2 * T, 1, '#3a4256');
      }
    }
    // the water's edge: a low seawall along the west and east sides (the sidewalks and the square end there)
    R(g, 0, ROWS.face * T, 2, w.H * T - ROWS.face * T, '#6b778f'); R(g, Wp - 2, ROWS.face * T, 2, w.H * T - ROWS.face * T, '#4a5469');
    // the far sidewalk
    R(g, 0, ROWS.far0 * T - 1, Wp, 2, '#59647d');
    slabs(ROWS.far0, ROWS.far1, '#232a38', '#2b3344');
    R(g, 0, ROWS.far0 * T - 1, Wp, 2, '#59647d');
    spec(ROWS.far0 * T, (ROWS.far1 + 1) * T, '#1c2230', 180);
    // tactile paving where the crossing meets both sidewalks
    for (const ty of [ROWS.furn * T + 9, ROWS.far0 * T + 2]) for (let x = cx0; x < cx1; x += 2) for (let y = ty; y < ty + 5; y += 2) R(g, x, y, 1, 1, '#c99a2e');
    // the square: lawn, a stone path and a plaza in front of the crossing
    const p0 = ROWS.park * T, p1 = PARK.end;
    R(g, 0, p0, Wp, p1 - p0, '#0f2117');
    spec(p0, p1, '#163024', 1400);
    spec(p0, p1, '#0b1a12', 900, 4);
    // the promenade along the water, south of the lawn: pale slabs and the edge of the quay
    slabs(PROM, w.H - 1, '#2a3040', '#333a4c');
    spec(p1, w.H * T, '#232835', 300, 6);
    R(g, 0, p1, Wp, 1, '#1d3b2a');
    R(g, 0, w.H * T - 2, Wp, 2, '#6b778f');
    R(g, 0, p0, Wp, 2, '#1d3b2a');
    R(g, 0, p0 + 3 * T, Wp, T - 4, '#2a2f38');
    for (let x = 0; x < Wp; x += 7) R(g, x, p0 + 3 * T + Math.floor(DL.hash(x) * 10), 1, 1, '#363c47');
    R(g, cx0 - T, p0, cx1 - cx0 + 2 * T, 3 * T, '#262c37');
    for (let y = 0; y < 3; y++) for (let x = CROSS.x0 - 1; x < CROSS.x1 + 1; x++) { R(g, x * T, p0 + y * T, T, 1, '#2f3644'); R(g, x * T, p0 + y * T, 1, T, '#2f3644'); }
    // the rest of the square (PARK): the second path, the paths across, the fountain's round plaza, the sand
    const pave = (x, y, pw, ph) => {
      R(g, x, y, pw, ph, '#2a2f38');
      for (let i = 0; i < (pw * ph) / 40; i++) R(g, x + Math.floor(DL.hash(i * 5 + x + y) * pw), y + Math.floor(DL.hash(i * 9 + 3 + x) * ph), 1, 1, '#363c47');
    };
    pave(0, PARK.path2.y0, Wp, PARK.path2.y1 - PARK.path2.y0);
    for (const cx of PARK.cross) pave(cx * T + 3, PARK.path1.y1, 10, p1 - PARK.path1.y1);
    const F = PARK.fonte;
    for (let y = -F.r; y <= F.r; y++) { const hw = Math.floor(Math.sqrt(F.r * F.r - y * y)); R(g, F.x - hw, Math.round(F.y) + y, hw * 2 + 1, 1, '#2a2f38'); }
    for (let i = 0; i < 96; i++) {
      const a = (i / 96) * Math.PI * 2;
      R(g, Math.round(F.x + Math.cos(a) * (F.r - 1)), Math.round(F.y + Math.sin(a) * (F.r - 1)), 1, 1, '#3a414e');
      if (i % 2) R(g, Math.round(F.x + Math.cos(a) * (F.r - 7)), Math.round(F.y + Math.sin(a) * (F.r - 7)), 1, 1, '#363c47');
    }
    const Pq = PARK.parquinho;
    R(g, Pq.x0 - 1, Pq.y0 - 1, Pq.x1 - Pq.x0 + 2, Pq.y1 - Pq.y0 + 2, '#4f3d2a');
    R(g, Pq.x0, Pq.y0, Pq.x1 - Pq.x0, Pq.y1 - Pq.y0, '#6b5a3a');
    for (let i = 0; i < 160; i++) R(g, Pq.x0 + Math.floor(DL.hash(i * 7 + 11) * (Pq.x1 - Pq.x0)), Pq.y0 + Math.floor(DL.hash(i * 13 + 2) * (Pq.y1 - Pq.y0)), 1, 1, i % 3 ? '#7d6a45' : '#5a4a32');
    return c;
  }

  /* ------------------------------------------------------------------ */
  /* the edges of the sidewalk, drawn: nothing stops the player without   */
  /* a reason you can see                                                */
  /* ------------------------------------------------------------------ */
  // · towards the road: a row of street furniture on the last strip of sidewalk (lamp posts, benches,
  //   planters) with a guard rail along the curb;
  // · at the ends of the walkable strip: a raised flower bed (west) and road works with a barrier and
  //   cones (east);
  // · behind: the buildings (Etapa 6 dresses the neighbours).
  const IX = (x, y) => x - y, IY = (x, y, z) => (x + y) / 2 - (z || 0);
  const FY = ROWS.furn * T; // the furniture strip starts here (world px)
  // a piece of scenery: its footprint and a function that draws it (iso pixels). Scenery never moves, so it
  // is painted once into one of two cached layers (see bake): 'back' = behind the player (the buildings,
  // the flower bed west of the strip), 'front' = in front of the player (everything on the furniture
  // strip and east of the strip). The walkable strip keeps the player between the two, always.
  function prop(kind, x0, y0, x1, y1, layer, draw) {
    return { kind, layer, rect: [x0, y0, x1, y1], key: (x0 + x1 + y0 + y1) / 2, draw };
  }
  // small upright pixel sprites (bushes, cones), painted once
  function sprite(w, h, rows, pal) {
    const c = DL.mk(w, h), g = c.getContext('2d');
    rows.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (pal[row[x]]) R(g, x, y, 1, 1, pal[row[x]]); });
    return c;
  }
  const BUSH = sprite(12, 9, [
    '....gGg.....',
    '..gGGGGgg...',
    '.gGGHGGGGg..',
    'gGGGGGGHGGg.',
    'gGHGGGGGGGGg',
    'gGGGGGHGGGGg',
    '.gGGGGGGGGg.',
    '..dgggggggd.',
    '...dddddd...',
  ], { g: '#1d5a3c', G: '#2c8a57', H: '#5fd08c', d: '#123323' });
  const FLOWERS = sprite(12, 9, [
    '...p..y.....',
    '..gGg.Gg.p..',
    '.gGGGgGGgGg.',
    'gGpGGGGGyGGg',
    'gGGGGyGGGGGg',
    'gGGGGGGpGGGg',
    '.gGGGGGGGGg.',
    '..dgggggggd.',
    '...dddddd...',
  ], { g: '#1d5a3c', G: '#2c8a57', p: '#ff5fa2', y: '#ffd166', d: '#123323' });
  const CONE = sprite(7, 10, [
    '...o...',
    '..ooo..',
    '..www..',
    '..ooo..',
    '.ooooo.',
    '.wwwww.',
    '.ooooo.',
    'ooooooo',
    'kkkkkkk',
    '.kkkkk.',
  ], { o: '#ff7a17', w: '#f2f2f2', k: '#2a2a2a' });
  // an upright sprite standing on the ground at (x, y), bottom-centre
  const stand = (g, img, x, y, z) => g.drawImage(img, Math.round(IX(x, y) - img.width / 2), Math.round(IY(x, y, z || 0) - img.height));

  const METAL = { s: '#59647d', e: '#434d63', t: '#7d89a3' };
  function drawLamp(g, cx, cy) {
    K.box(g, cx - 2, cy - 2, cx + 2, cy + 2, 0, 3, { s: '#2b3344', e: '#222837', t: '#3a4459' });
    K.box(g, cx - 1, cy - 1, cx + 1, cy + 1, 3, 42, METAL);
    K.box(g, cx - 1, cy - 9, cx + 1, cy - 1, 40, 42, METAL);
    K.box(g, cx - 2.5, cy - 12, cx + 2.5, cy - 7, 37, 40, { s: '#1d2433', e: '#151a26', t: '#59647d' });
    // the lamp's light under its head
    K.line(g, [cx - 2.5, cy - 7, 37], [cx + 2.5, cy - 7, 37], '#e9fff6', 1);
    K.line(g, [cx + 2.5, cy - 7, 37], [cx + 2.5, cy - 12, 37], '#bff5dc', 1);
  }
  function lampPost(cx) {
    const cy = FY + 9;
    return prop('lamp', cx - 2, cy - 12, cx + 2, cy + 2, 'front', (g) => drawLamp(g, cx, cy));
  }
  // the same lamp elsewhere (the back avenue, the side streets): LAMPS2 lists them for daynight.js
  const LAMPS2 = [];
  function lampAt(cx, cy, layer) {
    LAMPS2.push({ cx, cy });
    return prop('lamp', cx - 2, cy - 12, cx + 2, cy + 2, layer || 'back', (g) => drawLamp(g, cx, cy));
  }
  const BENCHES = []; // (daynight.js: their shadows)
  function bench(x0, y0 = FY + 4, layer = 'front') {
    BENCHES.push({ x0, y0 });
    return prop('bench', x0, y0, x0 + 2 * T, y0 + 8, layer, (g) => {
      const x1 = x0 + 2 * T, wood = { s: '#6b5240', e: '#4f3d30', t: '#8a6a52' };
      for (const lx of [x0 + 3, x1 - 5]) K.box(g, lx, y0 + 1, lx + 2, y0 + 7, 0, 5, { s: '#2b3344', e: '#222837', t: '#3a4459' });
      K.box(g, x0 + 1, y0, x1 - 1, y0 + 6, 5, 6.5, wood);
      K.box(g, x0 + 1, y0 + 6, x1 - 1, y0 + 7.5, 6.5, 12, wood);
    });
  }
  function planter(x0, flowers) {
    const y0 = FY + 3;
    return prop('planter', x0 + 1, y0, x0 + T - 1, y0 + 10, 'front', (g) => {
      K.box(g, x0 + 1, y0, x0 + T - 1, y0 + 10, 0, 7, { s: '#3a4357', e: '#2c3343', t: '#4c5770' });
      K.box(g, x0 + 2, y0 + 1, x0 + T - 2, y0 + 9, 6.9, 7, { t: '#21180f' });
      stand(g, flowers ? FLOWERS : BUSH, x0 + T / 2, y0 + 6, 6);
    });
  }
  // the guard rail along the curb, from one end of the street to the other
  function rail(x0, x1) {
    const y = ROWS.road0 * T - 3;
    return prop('rail', x0, y - 1, x1, y + 1, 'front', (g) => {
      for (let x = x0 + 2; x < x1 - 1; x += T) K.box(g, x, y - 1, x + 1.5, y + 0.5, 0, 10, METAL);
      K.box(g, x1 - 1.5, y - 1, x1, y + 0.5, 0, 10, METAL);
      K.box(g, x0, y - 1, x1, y + 0.5, 9, 10.5, METAL);
      K.box(g, x0, y - 0.8, x1, y + 0.3, 5, 6, { s: '#4a5469', e: '#3a4255', t: '#59647d' });
    });
  }
  // west end of the walkable strip: a raised flower bed across the sidewalk
  function flowerBed() {
    const x0 = (WALK.x0 - 1) * T + 3, x1 = WALK.x0 * T - 1, y0 = ROWS.face * T + 1, y1 = ROWS.road0 * T - 5;
    return prop('bed', x0, y0, x1, y1, 'back', (g) => {
      K.box(g, x0, y0, x1, y1, 0, 9, { s: '#3a4357', e: '#2c3343', t: '#4c5770' });
      K.box(g, x0 + 1, y0 + 1, x1 - 1, y1 - 1, 8.9, 9, { t: '#21180f' });
      for (let k = 0; k < 5; k++) stand(g, k % 2 ? FLOWERS : BUSH, (x0 + x1) / 2, y0 + 7 + k * 11, 8);
    });
  }
  // east end: road works — a striped barrier across the sidewalk, cones and a blinking warning light
  function roadWorks() {
    const x = (WALK.x1 + 1) * T + 5, y0 = ROWS.face * T + 1, y1 = ROWS.road0 * T - 5;
    return prop('works', x - 1, y0, x + 12, y1, 'front', (g) => {
      for (const py of [y0 + 3, y1 - 4]) K.box(g, x, py, x + 1.5, py + 1.5, 0, 11, METAL);
      // the board: amber and dark stripes
      const n = 8, step = (y1 - y0) / n;
      for (let i = 0; i < n; i++) K.box(g, x, y0 + i * step, x + 1.5, y0 + (i + 1) * step, 6, 11, i % 2 ? { s: '#1b1f29', e: '#22262f', t: '#2c313c' } : { s: '#f5a623', e: '#e0921a', t: '#ffc04d' });
      stand(g, CONE, x + 8, y0 + 12);
      stand(g, CONE, x + 10, y1 - 10);
      stand(g, CONE, x + 5, (y0 + y1) / 2 + 4);
    });
  }
  // the works' warning light, blinking (drawn live, over the cached layer)
  const WORKS_LIGHT = [(WALK.x1 + 1) * T + 5, (ROWS.face * T + 1 + ROWS.road0 * T - 5) / 2];
  function worksLight(g, t) {
    const [x, y] = WORKS_LIGHT, on = Math.floor(t * 2) % 2 === 0;
    K.box(g, x, y - 1, x + 1.5, y + 1, 11, 13, on ? { s: '#ffb347', e: '#ffa31a', t: '#ffe0a3' } : { s: '#5a3a10', e: '#4a300d', t: '#6b4614' });
  }
  /* ------------------------------------------------------------------ */
  /* the buildings: the datacenter in the middle, neighbours on each side */
  /* ------------------------------------------------------------------ */
  // a flat rectangle on a south face (the side that faces the street)
  function face(g, xa, xb, y, za, zb, col) { K.poly(g, [[xa, y, za], [xb, y, za], [xb, y, zb], [xa, y, zb]], col); }
  // pixel art mapped flat onto a south face, its top-left corner at (x, z) (only while baking)
  function onFace(g, art, x, y, z) {
    DL.isoMap(g, BAKE_AT, [x, y + 0.3, z], [1, 0, 0], [0, 0, -1]);
    g.drawImage(art, 0, 0);
    K.isoT(g, BAKE_AT);
  }
  // a parapet around a flat roof; `items` draws what stands on the roof (between the back and front rims)
  function roof(g, x0, y0, x1, y1, H, c, items) {
    const r = 2, top = H + 3;
    K.box(g, x0, y0, x1, y0 + r, H, top, c);
    K.box(g, x0, y0, x0 + r, y1, H, top, c);
    if (items) items();
    K.box(g, x1 - r, y0, x1, y1, H, top, c);
    K.box(g, x0, y1 - r, x1, y1, H, top, c);
  }
  const AC = { s: '#3a4459', e: '#2b3344', t: '#4a566e' };
  function acUnit(g, x, y, H) {
    K.box(g, x, y, x + 10, y + 8, H, H + 6, AC);
    g.fillStyle = '#161b25';
    g.beginPath(); g.ellipse(IX(x + 5, y + 4), IY(x + 5, y + 4, H + 6), 4, 2, 0, 0, Math.PI * 2); g.fill();
    K.line(g, [x + 5, y + 1, H + 6], [x + 5, y + 7, H + 6], '#4a566e', 1);
  }
  function waterTank(g, x, y, H) {
    K.box(g, x + 1, y + 1, x + 2, y + 2, H, H + 4, METAL); K.box(g, x + 8, y + 8, x + 9, y + 9, H, H + 4, METAL);
    K.box(g, x, y, x + 10, y + 10, H + 4, H + 15, { s: '#5a4030', e: '#47321f', t: '#6b5240' });
    K.line(g, [x, y + 10, H + 8], [x + 10, y + 10, H + 8], '#3b2a1f', 1);
    K.line(g, [x, y + 10, H + 12], [x + 10, y + 10, H + 12], '#3b2a1f', 1);
  }
  // antennas: the mast is baked, the red light on top blinks (drawn live)
  const ANTENNAS = [];
  function antenna(g, x, y, H, len) {
    K.box(g, x - 0.5, y - 0.5, x + 0.5, y + 0.5, H, H + len, METAL);
    K.line(g, [x - 3, y, H + len - 6], [x + 3, y, H + len - 6], '#8a98ad', 1);
    ANTENNAS.push({ x, y, z: H + len, k: ANTENNAS.length });
  }

  // windows: every neighbour's window is lit or dark, and now and then one changes (see flipWindow).
  // They are painted pixel by pixel straight into the cached back layer, so a change costs one window.
  const WINDOWS = [];
  const WIN_LIT = ['#ffcf6b', '#ffe3a1', '#ffd98a', '#9fe8ff', '#7fb2f0', '#ffb26b'];
  // skip: no windows on the first floor (the street shops' neon sign is there: lojaFront)
  // window styles: [width, height, column step, floor step]; the floors' line step in FLOOR_STEP
  const WIN_STYLE = { apt: [6, 8, 12, 14], office: [10, 7, 12, 12], tower: [4, 10, 8, 15], brick: [5, 7, 10, 13], glass: [9, 10, 10, 12] };
  const FLOOR_STEP = { apt: 14, office: 12, tower: 15, brick: 13, glass: 12 };
  function windowGrid(x0, x1, y, H, kind, seed, skip) {
    const st = WIN_STYLE[kind] || WIN_STYLE.apt;
    const [ww, wh, cw, fh] = st;
    const span = x1 - x0, cols = Math.floor((span - 10 + (cw - ww)) / cw), pad = Math.round((span - (cols * cw - (cw - ww))) / 4) * 2;
    for (let z = 30 + wh + (skip ? fh : 0); z <= H - 8; z += fh) {
      for (let i = 0; i < cols; i++) {
        const n = WINDOWS.length, h = DL.hash(seed * 977 + n * 31);
        WINDOWS.push({ x: x0 + pad + i * cw, y, z1: z, w: ww, h: wh, lit: h < 0.5, col: WIN_LIT[Math.floor(DL.hash(n * 7 + seed) * WIN_LIT.length)], blind: DL.hash(n * 13 + 3) < 0.3 });
      }
    }
  }
  // (at: the layer's camera fields — the window's iso pixels land at IX − at.ox, IY − at.oy on its canvas)
  function paintWindow(g, w, at) {
    g.setTransform(1, 0, 0, 1, 0, 0);
    const X = IX(w.x, w.y) - at.ox, Y = IY(w.x, w.y, w.z1) - at.oy;
    for (let i = 0; i < w.w; i++) {
      const top = Y + Math.round(i / 2 + 0.25);
      if (w.lit) {
        R(g, X + i, top, 1, w.h, w.col);
        R(g, X + i, top, 1, w.blind ? 3 : 1, w.blind ? shadeHex(w.col, 0.62) : shadeHex(w.col, 1.12));
      } else {
        R(g, X + i, top, 1, w.h, '#0c111c');
        R(g, X + i, top, 1, 1, '#1a2335');
      }
    }
  }
  // a shop on the ground floor: a lit shop window, a door, a striped awning and the shop's own sign
  function shopSign(text, bg, fg) {
    const w = text.length * 4 + 5, c = DL.mk(w, 9), g = c.getContext('2d');
    R(g, 0, 0, w, 9, fg); R(g, 1, 1, w - 2, 7, bg);
    DL.pixText(g, text, 3, 2, fg);
    return c;
  }
  const SHOPS = [];
  function shopFront(g, x0, x1, y, shop) {
    const mid = Math.round((x0 + x1) / 2 / 2) * 2;
    face(g, x0 + 4, x1 - 4, y, 2, 16, '#3a2a14');
    face(g, x0 + 5, x1 - 5, y, 3, 15, shop.glow);
    for (let x = x0 + 12; x < x1 - 6; x += 12) K.line(g, [x, y, 3], [x, y, 15], '#2a1f12', 1);
    face(g, mid - 4, mid + 4, y, 0, 15, '#141820');
    face(g, mid - 3, mid + 3, y, 1, 14, '#2a3346');
    // the awning: stripes in the shop's colours, sticking out over the sidewalk
    for (let x = x0 + 3, k = 0; x < x1 - 3; x += 4, k++) {
      const c = k % 2 ? shop.a : '#e6ecf5', x2 = Math.min(x + 4, x1 - 3);
      K.box(g, x, y, x2, y + 4, 17, 18.5, { s: shadeHex(c, 0.8), t: c });
    }
    const art = shopSign(shop.name, shop.bg, shop.fg);
    onFace(g, art, Math.round(mid - art.width / 2), y, 29);
    SHOPS.push({ x: mid, y, glow: shop.glow });
  }
  // the ground floor of a building with no shop: a plinth and a lobby door with a lit transom
  function lobby(g, x0, x1, y) {
    const mid = Math.round((x0 + x1) / 2 / 2) * 2;
    face(g, x0, x1, y, 0, 4, '#10151f');
    face(g, mid - 6, mid + 6, y, 0, 20, '#141820');
    face(g, mid - 5, mid + 5, y, 0, 15, '#1f2738');
    face(g, mid - 5, mid + 5, y, 16, 19, '#ffd98a');
    K.line(g, [mid, y, 0], [mid, y, 15], '#141820', 1);
  }

  /* ---------- the two shops next to the datacenter (lojas.js: the rooms inside) ---------- */
  // Each one: a neon sign with its name (lights up letter by letter when the player comes out, flickers
  // now and then), a striped awning, two lit shop windows, a glass door, and on the sidewalk against the
  // front a plant at each end plus its own furniture — the café: a bistro table with a steaming cup, a stool
  // and the menu chalkboard; the skin shop: a bench and a PROMO board. The windows live a little: in the
  // skin shop the mannequins change outfit; at the café the cup steams. Everything stands on the first
  // strip of sidewalk (≤ 4 px deep), so the player always walks in front of it.
  const NOMES = DL.LOJAS || {};
  const LOJA_CAFE = { lugar: 'lojaCafe', name: (NOMES.lojaCafe && NOMES.lojaCafe.letreiro) || 'CAFE BYTE', a: '#ff8a2a', neon: '#ffb347', glass: '#ffcf8a', wood: '#3b2414', trim: '#6b4423', light: '255,170,90' };
  const LOJA_SKINS = { lugar: 'lojaSkins', name: (NOMES.lojaSkins && NOMES.lojaSkins.letreiro) || 'SKIN.EXE', a: '#3d7bff', neon: '#4fd8ff', glass: '#bfe9ff', wood: '#101a33', trim: '#22345c', light: '110,190,255' };
  const LOJA_FRONTS = [];
  const hexRgba = (hex, a) => { const n = parseInt(hex.slice(1), 16); return 'rgba(' + (n >> 16) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')'; };
  // the neon sign: a dark board, a tube around it and the name at double size; lit = with the glow
  function lojaSignArt(text, col, lit) {
    const w = text.length * 8 - 2 + 8, h = 14, c = DL.mk(w, h), g = c.getContext('2d');
    R(g, 0, 0, w, h, '#070a12');
    const tube = lit ? col : shadeHex(col, 0.35);
    R(g, 1, 1, w - 2, 1, tube); R(g, 1, h - 2, w - 2, 1, tube); R(g, 1, 1, 1, h - 2, tube); R(g, w - 2, 1, 1, h - 2, tube);
    if (lit) for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) DL.pixText(g, text, 4 + dx, 2 + dy, hexRgba(col, 0.3), 2);
    DL.pixText(g, text, 4, 2, lit ? '#f4fbff' : shadeHex(col, 0.3), 2);
    if (lit) DL.pixText(g, text, 4, 2, hexRgba(col, 0.55), 2);
    return c;
  }
  // a small plant in a clay pot (the pot is a box, the leaves a sprite)
  const PLANT = sprite(7, 8, ['..g.G..', '.gGgGg.', 'gGHGgGg', '.gGGGHg', 'gGgHGgg', '.gGGg..', '..ggg..', '...g...'], { g: '#1d5a3c', G: '#2c8a57', H: '#5fd08c' });
  // a mannequin in the window, one sprite per outfit colour (drawn live: they change now and then)
  const MANNE_COLS = ['#2de2c8', '#7c5cff', '#ff5fa2', '#ffd166', '#3d7bff', '#ff7a17'];
  const MANNE = MANNE_COLS.map((c) => sprite(7, 13, ['..hhh..', '..hhh..', '...h...', '.sssss.', 'sssssss', 'sSsssSs', 'sSsssSs', '.sssss.', '.ppppp.', '.pp.pp.', '...m...', '...m...', '.mmmmm.'],
    { h: '#d5dde8', s: c, S: shadeHex(c, 0.7), p: '#1b2233', m: '#8a98ad' }));
  // the boards on the sidewalk: the café's menu (baked) and the skin shop's PROMO / SKINS (drawn live)
  function boardArt(w, h, bg, rim, draw) { const c = DL.mk(w, h), g = c.getContext('2d'); R(g, 0, 0, w, h, rim); R(g, 1, 1, w - 2, h - 2, bg); draw(g); return c; }
  // (low boards: the shop window behind them still shows)
  const MENU_ART = boardArt(18, 9, '#16261d', '#7a5232', (g) => {
    DL.pixText(g, 'MENU', 2, 1, '#f2efe6');
    R(g, 2, 7, 5, 1, '#ffb347'); R(g, 8, 7, 3, 1, '#c9d3e0'); R(g, 12, 7, 4, 1, '#9fe8ff');
  });
  const PROMO_ART = ['PROMO', 'SKINS'].map((txt, i) => boardArt(22, 8, i ? '#0b1730' : '#ffd166', i ? '#4fd8ff' : '#d93636', (g) => {
    DL.pixText(g, txt, 2, 1, i ? '#9fe8ff' : '#b3122b');
    for (let x = 2; x < 20; x += 3) R(g, x, 6, 2, 1, i ? '#4fd8ff' : '#d93636');
  }));
  // café window art: shelves with cups and jars, the counter with a cake (26 × 14)
  function cafeWindowArt(left) {
    const c = DL.mk(26, 14), g = c.getContext('2d');
    for (let y = 0; y < 14; y++) R(g, 0, y, 26, 1, y < 7 ? '#ffd9a0' : '#ffc27a');
    R(g, 0, 5, 26, 1, '#7a4a28');
    for (let x = 2; x < 24; x += 5) { R(g, x, 3, 3, 2, left ? '#f2efe6' : '#c98e66'); R(g, x + 3, 3, 1, 1, '#f2efe6'); }
    R(g, 0, 11, 26, 3, '#5a3520'); R(g, 0, 11, 26, 1, '#8a5a3b');
    if (left) { R(g, 4, 8, 7, 3, '#f7c6d9'); R(g, 4, 8, 7, 1, '#fff2f7'); R(g, 7, 7, 1, 1, '#d93636'); R(g, 15, 8, 5, 3, '#c9d3e0'); R(g, 16, 7, 3, 1, '#8a98ad'); }
    else { for (let x = 3; x < 23; x += 6) { R(g, x, 9, 4, 2, '#d9a066'); R(g, x, 9, 4, 1, '#f2c48a'); } }
    return c;
  }
  function skinWindowArt() {
    const c = DL.mk(26, 14), g = c.getContext('2d');
    for (let y = 0; y < 14; y++) R(g, 0, y, 26, 1, y < 2 ? '#e6f7ff' : y < 11 ? '#bfe9ff' : '#7fb2f0');
    R(g, 0, 11, 26, 3, '#2b3a59'); R(g, 0, 11, 26, 1, '#4fd8ff');
    return c;
  }
  function lojaFront(g, x0, x1, shop) {
    const y = ROWS.face * T, mid = Math.round((x0 + x1) / 2 / 2) * 2, cafe = shop.lugar === 'lojaCafe';
    const wins = [[x0 + 6, mid - 8], [mid + 8, x1 - 6]];
    // the ground floor: a frame, a step, the shop front in its own colour
    face(g, x0 + 2, x1 - 2, y, 0, 24, shop.trim);
    face(g, x0 + 3, x1 - 3, y, 2, 23, shop.wood);
    face(g, x0 + 3, x1 - 3, y, 0, 2, '#0c0f16');
    // the windows: a frame, the lit display (art), a reflection
    wins.forEach(([a, b], i) => {
      face(g, a - 1, b + 1, y, 3, 19, shop.trim);
      onFace(g, cafe ? cafeWindowArt(i === 0) : skinWindowArt(), a, y, 18);
      K.line(g, [a + 3, y + 0.4, 17], [a + 7, y + 0.4, 9], 'rgba(255,255,255,0.35)', 1);
      K.line(g, [b - 6, y + 0.4, 17], [b - 3, y + 0.4, 11], 'rgba(255,255,255,0.25)', 1);
    });
    // the door: a glass leaf in a frame, a handle, the neon transom
    face(g, mid - 6, mid + 6, y, 0, 20, shop.trim);
    face(g, mid - 5, mid + 5, y, 0, 18, '#0b0f18');
    face(g, mid - 4, mid + 4, y, 1, 17, cafe ? '#5a3a22' : '#1b3a5c');
    face(g, mid - 3, mid + 3, y, 6, 16, cafe ? '#ffc27a' : '#9fe8ff');
    K.line(g, [mid + 2, y + 0.4, 9], [mid + 2, y + 0.4, 11], '#e6ecf5', 1);
    face(g, mid - 5, mid + 5, y, 18.5, 19.5, shop.neon);
    // the awning: stripes in the shop's colour and white, sloping out over the door, a scalloped edge
    for (let x = x0 + 3, k = 0; x < x1 - 3; x += 4, k++) {
      const c = k % 2 ? shop.a : '#eef2f8', x2 = Math.min(x + 4, x1 - 3);
      K.box(g, x, y, x2, y + 2.5, 21.5, 23, { s: shadeHex(c, 0.85), t: c });
      K.box(g, x, y + 2.5, x2, y + 5, 20, 21.5, { s: shadeHex(c, 0.8), t: shadeHex(c, 0.95) });
      K.box(g, x + 0.5, y + 4.6, x2 - 0.5, y + 5, 18.5, 20, { s: shadeHex(c, 0.7) });
    }
    // the sign's board, sticking out a little (the letters are drawn live: drawLojas)
    const sw = shop.name.length * 8 - 2 + 8, sx = Math.round(mid - sw / 2);
    K.box(g, sx - 1, y, sx + sw + 1, y + 1.2, 26, 42, { s: '#05070c', e: '#04060a', t: '#1a2030' });
    LOJA_FRONTS.push({ lugar: shop.lugar, shop, mid, x0, x1, wins, sign: { x: sx, z: 41.5, on: lojaSignArt(shop.name, shop.neon, true), off: lojaSignArt(shop.name, shop.neon, false) },
      target: { id: 'LOJA-' + shop.lugar, exit: true, go: shop.lugar, verb: 'Entrar', at: [mid, y, 24], get name() { const p = PLACES[shop.lugar]; return p ? p.nome : shop.name; } } });
  }
  // what stands on the sidewalk against each shop
  function lojaProps(shop, x0, x1) {
    const y = ROWS.face * T, mid = Math.round((x0 + x1) / 2 / 2) * 2, cafe = shop.lugar === 'lojaCafe', y0 = y + 0.6, y1 = y + 4;
    const out = [];
    const pot = (px) => prop('pot', px, y0, px + 5, y1, 'back', (g) => {
      K.box(g, px, y0, px + 5, y1, 0, 5, { s: '#8a4a2b', e: '#6b3a22', t: '#a25a36' });
      K.box(g, px + 0.5, y0 + 0.5, px + 4.5, y1 - 0.5, 4.9, 5, { t: '#21180f' });
      stand(g, PLANT, px + 2.5, y0 + 2, 5);
    });
    out.push(pot(x0 + 3), pot(x1 - 8));
    if (cafe) {
      // a bistro table with a cup (its steam is live), a stool, the menu board
      const tx = x0 + 15;
      out.push(prop('bistro', tx - 5, y0, tx + 5, y1, 'back', (g) => {
        K.box(g, tx - 0.5, y0 + 1.2, tx + 0.5, y0 + 2.2, 0, 8, METAL);
        K.box(g, tx - 2.5, y0 + 0.5, tx + 2.5, y0 + 3, 0, 0.6, METAL);
        K.box(g, tx - 5, y0, tx + 5, y1 - 0.2, 8, 9, { s: '#4a2c18', e: '#3b2414', t: '#8a5a3b' });
        K.box(g, tx + 1, y0 + 1, tx + 2.6, y0 + 2.6, 9, 11, { s: '#e6ecf5', e: '#c9d3e0', t: '#3b2414' });
      }));
      const sx = tx + 8;
      out.push(prop('stool', sx, y0 + 0.6, sx + 4, y1 - 0.4, 'back', (g) => {
        K.box(g, sx + 1.5, y0 + 1.4, sx + 2.5, y0 + 2.4, 0, 5, METAL);
        K.box(g, sx, y0 + 0.6, sx + 4, y1 - 0.4, 5, 6, { s: '#c4501d', e: '#a3401a', t: shop.a });
      }));
      const bx = mid + 10;
      out.push(prop('board', bx, y0 + 0.8, bx + 18, y0 + 2.4, 'back', (g) => {
        K.box(g, bx, y0 + 0.8, bx + 18, y0 + 2.4, 0, 10, { s: '#5a3a22', e: '#4a2c18', t: '#7a5232' });
        onFace(g, MENU_ART, bx, y0 + 2.2, 9.5);
      }));
    } else {
      // the PROMO board (its face is live) and a bench
      const bx = x0 + 7;
      out.push(prop('board', bx, y0 + 0.8, bx + 22, y0 + 2.4, 'back', (g) => {
        K.box(g, bx, y0 + 0.8, bx + 22, y0 + 2.4, 0, 9, { s: '#1b2233', e: '#141a28', t: '#2b3a59' });
      }));
      const bx2 = mid + 10, bx3 = x1 - 10;
      out.push(prop('bench', bx2, y0, bx3, y1, 'back', (g) => {
        for (const lx of [bx2 + 1, bx3 - 3]) K.box(g, lx, y0 + 1, lx + 2, y1 - 0.5, 0, 4.5, { s: '#2b3344', e: '#222837', t: '#3a4459' });
        K.box(g, bx2, y0 + 0.6, bx3, y1, 4.5, 5.8, { s: '#2a5aa8', e: '#1f478a', t: '#3d7bff' });
        K.box(g, bx2, y0, bx3, y0 + 0.8, 5.8, 10, { s: '#2a5aa8', e: '#1f478a', t: '#4f8cff' });
      }));
    }
    return out;
  }
  // drawn every frame over the baked front: the signs, the mannequins, the steam, the PROMO board, the
  // light the shops throw on the sidewalk; ST.signsAt = when the player came out (the signs light up then)
  function drawLojas(g, sc) {
    const t = sc.t, y = ROWS.face * T;
    for (const f of LOJA_FRONTS) {
      const s = f.sign, since = t - ST.signsAt;
      // the light on the sidewalk (soft, breathing a little)
      sc.groundTransform(g);
      g.globalCompositeOperation = 'lighter';
      DL.pool(g, f.mid, y + 10, 40, 'rgba(' + f.shop.light + ',' + (0.07 + 0.015 * Math.sin(t * 1.3 + f.mid)).toFixed(3) + ')');
      g.globalCompositeOperation = 'source-over';
      // the sign: letter by letter after the player comes out, then a flicker now and then
      DL.isoMap(g, sc, [s.x, y + 1.4, s.z], [1, 0, 0], [0, 0, -1]);
      g.imageSmoothingEnabled = false;
      const w = s.on.width;
      if (since < 1.6) {
        const k = clamp((since - 0.25) / 1.1, 0, 1), lit = Math.round(w * k);
        g.drawImage(s.off, 0, 0);
        if (lit > 0 && DL.hash(Math.floor(t * 20) + f.mid) > 0.15) g.drawImage(s.on, 0, 0, lit, s.on.height, 0, 0, lit, s.on.height);
      } else g.drawImage(DL.hash(Math.floor(t * 9) + f.mid * 3) < 0.02 ? s.off : s.on, 0, 0);
      K.isoT(g, sc);
      if (f.lugar === 'lojaSkins') {
        // the mannequins: a new outfit every few seconds, with a little sparkle when it changes
        f.wins.forEach(([a], wi) => {
          for (let m = 0; m < 2; m++) {
            const ph = t / 2.4 + wi * 0.7 + m * 1.3, i = Math.floor(ph) % MANNE.length, fresh = ph % 1 < 0.08, mx = a + 4 + m * 12;
            DL.isoMap(g, sc, [mx, y + 0.5, 17], [1, 0, 0], [0, 0, -1]);
            g.drawImage(MANNE[i], 0, 0);
            if (fresh) { R(g, 1, 3, 1, 1, '#ffffff'); R(g, 5, 6, 1, 1, '#ffffff'); R(g, 3, 1, 1, 1, '#e6f7ff'); }
          }
        });
        // the PROMO board: PROMO / SKINS
        DL.isoMap(g, sc, [f.x0 + 7, y + 3.2, 8.5], [1, 0, 0], [0, 0, -1]);
        g.drawImage(PROMO_ART[Math.floor(t / 1.2) % 2], 0, 0);
        K.isoT(g, sc);
      } else {
        // steam from the cup on the bistro table
        const cx = f.x0 + 16.8, cy = y + 2.4;
        for (let k = 0; k < 4; k++) {
          const ph = (t * 0.45 + k / 4) % 1, z = 11 + ph * 16, sz = ph < 0.5 ? 1 : 2, dx = Math.sin(t * 2 + k * 1.7) * 1.4 * ph;
          g.fillStyle = 'rgba(240,235,225,' + (0.5 * (1 - ph)).toFixed(3) + ')';
          g.fillRect(Math.round(IX(cx + dx, cy)) - (sz >> 1), Math.round(IY(cx + dx, cy, z)), sz, sz);
        }
      }
    }
  }
  // the tutorial points at the shops for a few seconds (highlightShops): a bouncing arrow over each sign
  function drawLojaArrows(g, sc) {
    const H = ST.hl;
    if (!H || sc.t > H.until || !outside()) return;
    const y = ROWS.face * T;
    K.isoT(g, sc);
    for (const f of LOJA_FRONTS) {
      const z = 50 + Math.abs(Math.sin(sc.t * 5)) * 4, X = Math.round(IX(f.mid, y)), Y = Math.round(IY(f.mid, y, z));
      for (let r = 0; r < 6; r++) { R(g, X - 6 + r, Y + r, 13 - r * 2, 1, '#05080d'); if (r < 5) R(g, X - 5 + r, Y + r, 11 - r * 2, 1, r < 2 ? '#fff3c4' : '#ffd166'); }
      R(g, X - 2, Y - 6, 5, 6, '#05080d'); R(g, X - 1, Y - 6, 3, 6, '#ffd166');
    }
  }

  // the player's datacenter — the showpiece of the street: a green facade framed in neon, a glass lobby,
  // two floors of big green windows with the racks' lights blinking behind them (drawBuildingLights),
  // the big DATALAB sign on top (drawSign), cooling units and an antenna on the roof. Its glow at night
  // (sign, edges, the light on the sidewalk) is in daynight.js (iluminarRua).
  const DC_LEDS = [];
  // the two window floors (z from, z to) and the pillars between the window bays (x, world px)
  const DC_FLOORS = [[31, 49], [52, 68]];
  const DC_PILLARS = [];
  function dcBuilding() {
    const x0 = BLD.x0 * T, x1 = BLD.x1 * T, y0 = BLD.y0 * T, y1 = BLD.y1 * T, H = BLD.h;
    const dx0 = DOOR_X * T, dx1 = dx0 + DOOR_W, NEON = PAL.neon, MID = '#1f9e66', DARK = '#145c3d';
    for (let x = x0 + 6 + 52; x < x1 - 20; x += 52) DC_PILLARS.push(x);
    const onPillar = (x) => DC_PILLARS.some((p) => x + 6 > p - 1 && x < p + 4);
    for (const [za, zb] of DC_FLOORS) for (let x = x0 + 10; x + 5 < x1 - 8; x += 8) if (!onPillar(x)) for (let z = za + 4; z < zb - 2; z += 4) DC_LEDS.push({ x: x + 1 + (DC_LEDS.length % 3), z, k: DC_LEDS.length });
    return prop('dc', x0, y0, x1, y1, 'back', (g) => {
      K.box(g, x0, y0, x1, y1, 0, H, { s: '#0f3326', e: '#0a241b', t: '#123d2d' });
      face(g, x0, x1, y1, 0, 3, '#08130e');
      // the lobby: glass on both sides of the door
      for (const [a, b] of [[x0 + 8, dx0 - 6], [dx1 + 6, x1 - 8]]) {
        face(g, a - 1, b + 1, y1, 3, 24, NEON);
        face(g, a, b, y1, 4, 23, '#0f4a33');
        for (let x = a + 8; x < b; x += 8) K.line(g, [x, y1, 4], [x, y1, 23], MID, 1);
        face(g, a, b, y1, 4, 6, DARK);
        face(g, a, b, y1, 20, 23, '#1a7a52');
      }
      // a double neon band over the lobby
      K.line(g, [x0, y1, 27], [x1, y1, 27], NEON, 1);
      K.line(g, [x0, y1, 29], [x1, y1, 29], MID, 1);
      // the window floors: a bright frame, dark green glass, the racks behind it, pillars between the bays
      for (const [za, zb] of DC_FLOORS) {
        face(g, x0 + 5, x1 - 5, y1, za, zb, NEON);
        face(g, x0 + 6, x1 - 6, y1, za + 1, zb - 1, '#06301f');
        for (let x = x0 + 10; x + 5 < x1 - 8; x += 8) if (!onPillar(x)) face(g, x, x + 5, y1, za + 2, zb - 2, '#0a1a12');
        // a light reflection across the glass
        face(g, x0 + 6, x1 - 6, y1, zb - 3, zb - 1, '#1a7a52');
        for (const p of DC_PILLARS) face(g, p, p + 3, y1, za, zb, '#0f3326');
      }
      // the sign's board (the letters are drawn live: drawSign), with a neon tube around it
      face(g, PANEL.x - 3, PANEL.x + PANEL.w + 3, y1, PANEL.z - PANEL.h - 3, PANEL.z + 3, NEON);
      face(g, PANEL.x - 2, PANEL.x + PANEL.w + 2, y1, PANEL.z - PANEL.h - 2, PANEL.z + 2, DARK);
      face(g, PANEL.x - 1, PANEL.x + PANEL.w + 1, y1, PANEL.z - PANEL.h - 1, PANEL.z + 1, '#050a08');
      // the east side: vertical neon strips
      for (let y = y0 + 14; y < y1 - 6; y += 24) K.line(g, [x1, y, 8], [x1, y, H - 8], MID, 1);
      roof(g, x0, y0, x1, y1, H, { s: '#145c3d', e: '#0f4a33', t: '#1a6b49' }, () => {
        for (let i = 0; i < 5; i++) acUnit(g, x0 + 18 + i * 34, y0 + 20, H);
        for (let i = 0; i < 5; i++) acUnit(g, x0 + 18 + i * 34, y0 + 50, H);
        // a dish
        K.box(g, x1 - 30, y0 + 100, x1 - 26, y0 + 104, H, H + 6, METAL);
        g.fillStyle = '#c9d3e0';
        g.beginPath(); g.ellipse(IX(x1 - 28, y0 + 102), IY(x1 - 28, y0 + 102, H + 10), 6, 4, -0.5, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#8a98ad';
        g.beginPath(); g.ellipse(IX(x1 - 28, y0 + 102), IY(x1 - 28, y0 + 102, H + 10), 4, 2.5, -0.5, 0, Math.PI * 2); g.fill();
        antenna(g, x0 + 12, y0 + 12, H, 30);
      });
      // the neon outline: the top edges and the three corners that show
      K.line(g, [x0, y1, H + 3], [x1, y1, H + 3], NEON, 1);
      K.line(g, [x1, y1, H + 3], [x1, y0, H + 3], NEON, 1);
      K.line(g, [x0, y1, 0], [x0, y1, H + 3], NEON, 1);
      K.line(g, [x1, y1, 0], [x1, y1, H + 3], NEON, 1);
      K.line(g, [x1, y0, 0], [x1, y0, H + 3], MID, 1);
    });
  }
  // the server floor's lights and the antennas' red lights (drawn live, behind the people)
  function drawBuildingLights(g, t) {
    const y = BLD.y1 * T;
    const LED = ['#3dffa2', '#3dffa2', '#2de2c8', '#ffb020'];
    for (const L of DC_LEDS) {
      const on = DL.hash(L.k * 31 + Math.floor(t * (1.5 + (L.k % 5) * 0.7))) < 0.7;
      if (!on) continue;
      g.fillStyle = LED[L.k % LED.length];
      g.fillRect(Math.round(IX(L.x, y)), Math.round(IY(L.x, y, L.z)), 1, 1);
    }
    for (const A of ANTENNAS) {
      if ((t + A.k * 0.37) % 1.6 > 0.35) continue;
      g.fillStyle = '#ff3b3b';
      g.fillRect(Math.round(IX(A.x, A.y)) - 1, Math.round(IY(A.x, A.y, A.z)) - 1, 2, 2);
    }
  }
  // its front door (drawn live: the neon flickers)
  function frontDoor(g, sc, t) {
    DL.isoMap(g, sc, [DOOR_X * T, BLD.y1 * T + 0.25, DOOR_H], [1, 0, 0], [0, 0, -1]);
    g.drawImage(signOn(t) ? ART.outOn : ART.outOff, 0, 0);
    if (ST.intro && ST.intro.door > 0) doorOpening(g, ST.intro.door);
  }
  // a neighbour: an apartment block, an office, a tower, a brick walk-up, a glass block; some with a shop
  // downstairs. b.y0..b.y1 (tiles): its lot, the face (the side with the door) at y1
  function block(b, i) {
    const x0 = b.x0 * T, x1 = b.x1 * T, y0 = b.y0 * T, y1 = b.y1 * T, H = b.h, c = b.col, kind = b.kind;
    windowGrid(x0, x1, y1, H, kind, i + 1, !!(b.shop && b.shop.lugar));
    return prop('block', x0, y0, x1, y1, 'back', (g) => {
      K.box(g, x0, y0, x1, y1, 0, H, c);
      // floors: a thin line between each one
      for (let z = 26; z < H - 6; z += FLOOR_STEP[kind] || 14) K.line(g, [x0, y1, z], [x1, y1, z], shadeHex(c.s, 0.8), 1);
      // balconies on the apartments, every other floor
      if (kind === 'apt' || kind === 'brick') for (let z = 30 + 8 + 14; z <= H - 8; z += 28) K.box(g, x0 + 3, y1, x1 - 3, y1 + 3, z - 9, z - 8, { s: shadeHex(c.s, 1.3), t: shadeHex(c.t, 1.2) });
      // a crown of neon on the towers; a lighter band of glass up the glass blocks
      if (kind === 'tower') K.line(g, [x0, y1, H - 3], [x1, y1, H - 3], b.neon, 1);
      if (kind === 'glass') { face(g, x0 + 4, x1 - 4, y1, 28, H - 6, shadeHex(c.s, 1.35)); for (let z = 28; z < H - 6; z += FLOOR_STEP.glass) K.line(g, [x0 + 4, y1, z], [x1 - 4, y1, z], shadeHex(c.s, 0.9), 1); }
      if (b.shop && b.shop.lugar) lojaFront(g, x0, x1, b.shop); else if (b.shop) shopFront(g, x0, x1, y1, b.shop); else lobby(g, x0, x1, y1);
      // the sills under the windows
      for (const w of WINDOWS) if (w.y === y1 && w.x >= x0 && w.x < x1) K.line(g, [w.x - 1, w.y, w.z1 - w.h - 1], [w.x + w.w + 1, w.y, w.z1 - w.h - 1], shadeHex(c.s, 1.25), 1);
      roof(g, x0, y0, x1, y1, H, { s: shadeHex(c.s, 1.1), e: shadeHex(c.e, 1.1), t: shadeHex(c.t, 1.05) }, () => {
        const d = y1 - y0;
        if (kind === 'apt' || kind === 'brick') waterTank(g, x0 + 20, y0 + Math.round(d * 0.3), H);
        if (kind === 'office' || kind === 'glass') { acUnit(g, x0 + 12, y0 + Math.round(d * 0.2), H); acUnit(g, x1 - 26, y0 + Math.round(d * 0.55), H); }
        if (kind === 'tower') antenna(g, Math.round((x0 + x1) / 2), y0 + Math.round(d * 0.45), H, 22);
        if (kind === 'glass') antenna(g, x1 - 12, y0 + 10, H, 12);
      });
      for (const w of WINDOWS) if (w.y === y1 && w.x >= x0 && w.x < x1) paintWindow(g, w, BAKE_AT);
      K.isoT(g, BAKE_AT);
      K.line(g, [x0, y1, 0.5], [x1, y1, 0.5], '#0a0d14', 1);
    });
  }

  /* ---------- across the road: traffic lights, lamps, a bus stop, signs and the square ---------- */
  // the traffic lights' cycle (seconds): cars have green, then amber, then red while people cross
  const SIGNAL = { green: 9, amber: 2, red: 7 };
  function signalAt(t) {
    const k = t % (SIGNAL.green + SIGNAL.amber + SIGNAL.red);
    return k < SIGNAL.green ? 'green' : k < SIGNAL.green + SIGNAL.amber ? 'amber' : 'red';
  }
  // a traffic light: the pole is baked, the lamps are drawn live (drawSignals)
  const LIGHTS = [];
  function trafficLight(cx, cy, layer) {
    LIGHTS.push({ cx, cy, layer });
    return prop('signal', cx - 2, cy - 2, cx + 2, cy + 2, layer, (g) => {
      K.box(g, cx - 1.5, cy - 1.5, cx + 1.5, cy + 1.5, 0, 2, { s: '#2b3344', e: '#222837', t: '#3a4459' });
      K.box(g, cx - 1, cy - 1, cx + 1, cy + 1, 2, 30, { s: '#2c3242', e: '#232836', t: '#3b4356' });
      K.box(g, cx - 2.5, cy - 1.5, cx + 2.5, cy + 1.5, 28, 41, { s: '#14171e', e: '#0f1117', t: '#2a2f3b' });
    });
  }
  function drawSignals(g, t, layer) {
    const st = signalAt(t), cols = { red: '#ff3b3b', amber: '#ffb020', green: '#3dff7a' }, off = '#2a1d1d';
    for (const L of LIGHTS) {
      if (L.layer !== layer) continue;
      ['red', 'amber', 'green'].forEach((c, i) => {
        const z1 = 39.5 - i * 4, z0 = z1 - 2.5, x0 = L.cx - 1.5, x1 = L.cx + 1.5, y = L.cy + 1.5;
        K.poly(g, [[x0, y + 0.2, z0], [x1, y + 0.2, z0], [x1, y + 0.2, z1], [x0, y + 0.2, z1]], st === c ? cols[c] : off);
      });
    }
  }
  // lamps along the far curb: the arm reaches over the road
  function farLamp(cx) {
    const cy = ROWS.far0 * T + 3;
    return prop('lamp', cx - 2, cy - 2, cx + 2, cy + 12, 'far', (g) => {
      K.box(g, cx - 2, cy - 2, cx + 2, cy + 2, 0, 3, { s: '#2b3344', e: '#222837', t: '#3a4459' });
      K.box(g, cx - 1, cy - 1, cx + 1, cy + 1, 3, 46, METAL);
      K.box(g, cx - 1, cy - 12, cx + 1, cy - 1, 44, 46, METAL);
      K.box(g, cx - 2.5, cy - 15, cx + 2.5, cy - 10, 41, 44, { s: '#1d2433', e: '#151a26', t: '#59647d' });
      K.line(g, [cx - 2.5, cy - 10, 41], [cx + 2.5, cy - 10, 41], '#e9fff6', 1);
    });
  }
  const TREE = sprite(16, 23, [
    '.....gGGg.......',
    '...gGGHGGGg.....',
    '..gGGGGGGHGg....',
    '.gGHGGGGGGGGg...',
    'gGGGGGHGGGGGGg..',
    'gGGGGGGGGGHGGGg.',
    'gGHGGGGGGGGGGGg.',
    '.gGGGGHGGGGGGGGg',
    'gGGGGGGGGGHGGGGg',
    'gGGHGGGGGGGGGGg.',
    '.gGGGGGGHGGGGGg.',
    '.gGGGGGGGGGGGg..',
    '..gGGGGGGGGGg...',
    '...ggGGGGGgg....',
    '.....gggggg.....',
    '.......bb.......',
    '.......bb.......',
    '.......bB.......',
    '.......bB.......',
    '.......bB.......',
    '.......bB.......',
    '......bbBB......',
    '.....bbbBBB.....',
  ], { g: '#14412b', G: '#1f6a43', H: '#3da86a', b: '#3b2a1f', B: '#5a4030' });
  const TREES = []; // (daynight.js: their shadows)
  function tree(x, y, layer) {
    TREES.push({ x, y });
    return prop('tree', x - 3, y - 3, x + 3, y + 3, layer || 'park', (g) => {
      g.fillStyle = 'rgba(0,0,0,0.25)';
      g.beginPath(); g.ellipse(IX(x, y), IY(x, y, 0), 7, 3.5, 0, 0, Math.PI * 2); g.fill();
      stand(g, TREE, x, y + 1);
    });
  }
  // a low hedge between the far sidewalk and the square (with a gap at the plaza)
  const HEDGES = []; // (daynight.js: their shadows)
  function hedge(x0, x1) {
    const y0 = ROWS.park * T + 1, y1 = y0 + 5;
    HEDGES.push({ x0, x1, y0, y1 });
    // in pieces of two steps: each piece is drawn in its own place in the depth order (one long piece would
    // be drawn over the kiosk and the lamps just south of it)
    const parts = [];
    for (let a = x0; a < x1; a += 2 * T) {
      const b = Math.min(x1, a + 2 * T);
      parts.push(prop('hedge', a, y0, b, y1, 'park', (g) => {
        K.box(g, a, y0, b, y1, 0, 6, { s: '#1b5236', e: '#143f29', t: '#2a7a4f' });
        for (let x = x0 + 3; x < x1; x += 7) if (x >= a && x < b) K.box(g, x, y0 + 1, Math.min(b, x + 2), y0 + 3, 6, 7, { t: '#3da86a' });
      }));
    }
    return parts;
  }
  // a bus stop on the far sidewalk: a roof, a glass back wall, a bench and a lit panel
  const BUS_X = (DOOR_X + 3) * T;
  function busStop(x0) {
    const y0 = ROWS.far1 * T + 4, y1 = y0 + 8, x1 = x0 + 3 * T;
    return prop('bus', x0, y0, x1, y1, 'park', (g) => {
      K.box(g, x0 + 1, y1 - 1, x0 + 2, y1, 0, 26, METAL);
      K.box(g, x1 - 2, y1 - 1, x1 - 1, y1, 0, 26, METAL);
      K.box(g, x0 + 1, y0, x0 + 2, y0 + 1, 0, 26, METAL);
      K.box(g, x1 - 2, y0, x1 - 1, y0 + 1, 0, 26, METAL);
      K.box(g, x0 + 2, y1 - 1.2, x1 - 2, y1 - 0.5, 1, 24, { s: 'rgba(120,200,220,0.18)', e: 'rgba(120,200,220,0.12)', t: 'rgba(120,200,220,0.2)' });
      K.box(g, x0 + 4, y0 + 2, x1 - 4, y0 + 5, 4, 5.5, { s: '#4f3d30', e: '#3b2d23', t: '#6b5240' });
      K.box(g, x0, y0 - 1, x1, y1 + 1, 26, 28, { s: '#2b3a59', e: '#1f2a42', t: '#394b6d' });
      // the lit panel at the east end
      K.box(g, x1 - 2, y0 + 1, x1 - 0.5, y1 - 1, 6, 22, { s: '#0f3a3a', e: '#11504f', t: '#1f6b6b' });
      K.line(g, [x0, y1 + 1, 26], [x1, y1 + 1, 26], '#05b5b1', 1);
    });
  }
  const STOP_ART = (() => {
    const c = DL.mk(15, 9), g = c.getContext('2d');
    R(g, 0, 0, 15, 9, '#05b5b1'); R(g, 1, 1, 13, 7, '#032a2a');
    DL.pixText(g, 'BUS', 2, 2, '#bff5ee');
    return c;
  })();
  // a street name sign on a pole (an invented avenue)
  const NAME_ART = (() => {
    const t = 'AV BACKBONE', w = t.length * 4 + 3, c = DL.mk(w, 9), g = c.getContext('2d');
    R(g, 0, 0, w, 9, '#e6ecf5'); R(g, 1, 1, w - 2, 7, '#1f6b47');
    DL.pixText(g, t, 2, 2, '#e6ecf5');
    return c;
  })();
  const LIMIT_ART = (() => {
    const c = DL.mk(11, 11), g = c.getContext('2d');
    const ring = ['...rrrrr...', '..rrwwwrr..', '.rrwwwwwrr.', 'rrwwwwwwwrr', 'rwwwwwwwwwr', 'rwwwwwwwwwr', 'rwwwwwwwwwr', 'rrwwwwwwwrr', '.rrwwwwwrr.', '..rrwwwrr..', '...rrrrr...'];
    ring.forEach((row, y) => { for (let x = 0; x < 11; x++) if (row[x] !== '.') R(g, x, y, 1, 1, row[x] === 'r' ? '#d93636' : '#f2f2f2'); });
    DL.pixText(g, '40', 2, 3, '#14161c');
    return c;
  })();
  function signPost(x, y, art, h, layer) {
    return prop('sign', x - 1, y - 1, x + 1, y + 1, layer, (g) => {
      K.box(g, x - 0.75, y - 0.75, x + 0.75, y + 0.75, 0, h, METAL);
      g.drawImage(art, Math.round(IX(x, y) - art.width / 2), Math.round(IY(x, y, h) - art.height + 2));
    });
  }

  const PROPS = [
    dcBuilding(),
    rail(0, CROSS.x0 * T - 2), rail(CROSS.x1 * T + 2, SW * T), flowerBed(), roadWorks(),
    trafficLight(CROSS.x1 * T + 6, ROWS.furn * T + 10, 'front'),
    trafficLight(CROSS.x0 * T - 6, ROWS.far0 * T + 4, 'far'),
    busStop(BUS_X), signPost(CROSS.x0 * T - 40, ROWS.far0 * T + 6, NAME_ART, 30, 'far'),
    signPost((DOOR_X + 14) * T, ROWS.far0 * T + 6, LIMIT_ART, 24, 'far'),
    ...hedge(0, (CROSS.x0 - 1) * T), ...hedge((CROSS.x1 + 1) * T, SW * T),
  ];
  // the blocks along the avenue, the datacenter in the middle. The shops are invented (names and all).
  // (x0, x1 in tiles; the lot runs from y0 to the face row; deep lots reach further back)
  const FACE = ROWS.face, FRONT_Y0 = FACE - 7, DEEP_Y0 = TRAS ? TRAS.bld2 : FRONT_Y0;
  const SHOP = (name, a, bg, fg, glow) => ({ name, a, bg, fg, glow });
  const BLOCKS = [
    { x0: 0, x1: 7, h: 112, kind: 'glass', y0: DEEP_Y0 },
    { x0: 7, x1: 14, h: 76, kind: 'brick', shop: SHOP('BYTE BAR', '#ffb347', '#3a2210', '#ffe0a3', '#ffd9a0') },
    { x0: 14, x1: 7 + DX, h: 64, kind: 'apt' },
    // (7..13 + DX: the west side street)
    { x0: 13 + DX, x1: 19 + DX, h: 74, kind: 'apt', shop: SHOP('PIZZA PING', '#d9465f', '#3a0f17', '#ffd27a', '#ffcf8a') },
    { x0: 19 + DX, x1: 23 + DX, h: 96, kind: 'tower', neon: '#ff5fa2', y0: DEEP_Y0 },
    // the two shops next door can be entered (lugar: lojas.js builds the room inside; lojaFront draws the front)
    { x0: 23 + DX, x1: BLD.x0, h: 80, kind: 'apt', shop: LOJA_CAFE },
    { x0: BLD.x1, x1: 46 + DX, h: 76, kind: 'office', shop: LOJA_SKINS },
    { x0: 46 + DX, x1: 51 + DX, h: 100, kind: 'tower', neon: '#7fb2f0', y0: DEEP_Y0 },
    { x0: 51 + DX, x1: 57 + DX, h: 70, kind: 'apt', shop: SHOP('LAVA BITS', '#2de2c8', '#06302b', '#a5f7ea', '#d6fff7') },
    // (57..63 + DX: the east side street)
    { x0: 63 + DX, x1: 68 + DX, h: 82, kind: 'apt' },
    { x0: 68 + DX, x1: 75 + DX, h: 96, kind: 'office', y0: DEEP_Y0 },
    { x0: 75 + DX, x1: 82 + DX, h: 68, kind: 'brick', shop: SHOP('NET CAFE', '#4fd8ff', '#0b1730', '#bfe9ff', '#bfe9ff') },
    { x0: 82 + DX, x1: SW, h: 104, kind: 'glass', y0: DEEP_Y0 },
  ].filter((b) => b.x1 > b.x0 && b.x1 <= SW);
  for (const b of BLOCKS) { if (b.y0 == null) b.y0 = FRONT_Y0; b.y1 = FACE; }
  // the back blocks: the far row (rows bld0..bld1, facing the back avenue) and the stacks at both ends of
  // the back avenue; several widths, kinds, heights and colours, a few shops, and a small park behind the
  // datacenter
  const BACK_SHOPS = [SHOP('CACHE CAFE', '#ff8a2a', '#3a1a08', '#ffd9a0', '#ffcf8a'), SHOP('ROUTER ROCK', '#9b5de5', '#20103a', '#e6ccff', '#d9b8ff'), SHOP('BIT MARKET', '#2ecc8f', '#083020', '#b8ffd9', '#c8ffe4'), SHOP('PIXEL PAD', '#3d7bff', '#0b1730', '#bfe9ff', '#bfe9ff'), SHOP('KERNEL GYM', '#ffd166', '#3a2a08', '#fff1b8', '#ffe8a0')];
  const POCKET_PARK = TRAS ? { x0: DOOR_X - 2, x1: DOOR_X + 4 } : null; // tiles, in the far row
  if (TRAS) {
    const widths = [7, 5, 8, 6, 9, 5, 7, 6, 8, 5, 6, 7], kinds = ['apt', 'office', 'tower', 'brick', 'glass', 'apt', 'office', 'brick', 'tower', 'glass', 'apt', 'office'];
    let x = 0, i = 0, shop = 0;
    while (x < SW) {
      let w = widths[i % widths.length];
      if (x + w > SW) w = SW - x;
      if (w < 4) break;
      const kind = kinds[i % kinds.length];
      // the small park takes one lot behind the datacenter
      if (x < POCKET_PARK.x1 && x + w > POCKET_PARK.x0) {
        if (x < POCKET_PARK.x0) BLOCKS.push({ x0: x, x1: POCKET_PARK.x0, h: 56 + Math.round(DL.hash(i * 31 + 5) * 8), kind, y0: TRAS.bld0, y1: TRAS.bld1 });
        x = POCKET_PARK.x1; i++;
        continue;
      }
      let h = { apt: 62, office: 84, tower: 128, brick: 56, glass: 104 }[kind] + Math.round(DL.hash(i * 17 + 3) * 36);
      if (x < BLD.x1 + 4 && x + w > BLD.x0 - 4) h = Math.min(h, 64);
      const b = { x0: x, x1: x + w, h, kind, y0: TRAS.bld0, y1: TRAS.bld1 };
      if (kind === 'tower') b.neon = ['#ff5fa2', '#7fb2f0', '#2de2c8', '#ffd166'][i % 4];
      if ((i % 3 === 1) && shop < BACK_SHOPS.length) b.shop = BACK_SHOPS[shop++];
      BLOCKS.push(b);
      x += w; i++;
    }
    // the stacks at the ends of the back avenue (rows walk2..far2b), west and east of the side streets
    const ends = [[0, Math.floor(LADOS[0].x0 / 2)], [Math.floor(LADOS[0].x0 / 2), LADOS[0].x0], [LADOS[1].x1, Math.floor((LADOS[1].x1 + SW) / 2)], [Math.floor((LADOS[1].x1 + SW) / 2), SW]];
    ends.forEach(([a, b], k) => BLOCKS.push({ x0: a, x1: b, h: [88, 60, 72, 96][k], kind: ['office', 'brick', 'apt', 'glass'][k], y0: TRAS.walk2, y1: TRAS.far2b + 1 }));
  }
  // the neighbours' colours: muted greys, browns and dark blues (no greens: green is the datacenter's)
  const TONES = [['#2e3138', '#23262c', '#3c4049'], ['#3a302a', '#2b241f', '#4b3f37'], ['#222b3d', '#19202e', '#2d3850'], ['#34343a', '#28282d', '#44444b'],
    ['#3d3329', '#2e261e', '#50443a'], ['#1f2738', '#171d2a', '#2a3448'], ['#393a3f', '#2b2c30', '#4a4b51'], ['#33291f', '#271f17', '#45382c'], ['#283041', '#1e2431', '#353f55'], ['#3a3632', '#2c2926', '#4b4641']];
  BLOCKS.forEach((b, i) => { const c = TONES[i % TONES.length]; b.col = { s: c[0], e: c[1], t: c[2] }; PROPS.push(block(b, i)); });
  for (const b of BLOCKS) if (b.shop && b.shop.lugar) PROPS.push(...lojaProps(b.shop, b.x0 * T, b.x1 * T));

  /* ---------------- behind the avenue: the back avenue, the side streets, the yards, the small park ---------------- */
  // a car standing still (baked): along x (axis 'x', facing dir) or along y (axis 'y', side streets)
  const PARKED = []; // (daynight.js: their shadows) { x, y, L, Wd }
  function parkedCar(x, y, axis, seed) {
    const model = ['hatch', 'sedan', 'van'][Math.floor(DL.hash(seed * 7 + 1) * 3)], color = CAR_COLORS[Math.floor(DL.hash(seed * 11 + 2) * CAR_COLORS.length)], dir = DL.hash(seed * 3 + 5) < 0.5 ? -1 : 1;
    PARKED.push({ x, y, axis, model });
    return prop('carro', x - 14, y - 6, x + 14, y + 6, 'back', (g) => {
      const art = axis === 'y' ? carArtNS(model, color, dir) : carArt(model, color, dir);
      g.drawImage(art, Math.round(IX(x, y) - CAR_ORIGIN.x), Math.round(IY(x, y, 0) - CAR_ORIGIN.y));
    });
  }
  const CAR_COLORS = ['#d9465f', '#3d7bff', '#f2c14e', '#e6ecf5', '#2ecc8f', '#9b5de5', '#ff7a17', '#5a6478', '#1fb5c9', '#7a1f2b'];
  // a low wall around a car park or a yard (the sides that show)
  function lowWall(g, x0, y0, x1, y1, h, c) {
    K.box(g, x0, y1 - 1.5, x1, y1, 0, h, c);
    K.box(g, x1 - 1.5, y0, x1, y1, 0, h, c);
  }
  // a shed in a yard
  function shed(g, x, y, c) {
    K.box(g, x, y, x + 14, y + 10, 0, 9, c);
    K.box(g, x - 1, y - 1, x + 15, y + 11, 9, 11, { s: shadeHex(c.s, 0.7), e: shadeHex(c.e, 0.7), t: '#4a3a2c' });
  }
  const YARDS = []; // (daynight.js: their shadows) boxes { x0, y0, x1, y1, h }
  if (TRAS) {
    const B = TRAS, q0 = B.road2a * T, q1 = (B.road2b + 1) * T;
    // the back avenue: lamps on its near sidewalk, trees and benches on the far one
    for (let tx = LADOS[0].x1 + 2; tx < LADOS[1].x0 - 1; tx += 7) PROPS.push(lampAt(tx * T + 8, B.furn2 * T + 9, 'back'));
    for (let tx = LADOS[0].x1 + 4; tx < LADOS[1].x0 - 2; tx += 6) PROPS.push(tree(tx * T + 8, B.far2b * T + 6, 'back'));
    for (let tx = LADOS[0].x1 + 7; tx < LADOS[1].x0 - 3; tx += 18) PROPS.push(bench(tx * T, B.far2a * T + 4, 'back'));
    // the side streets: lamps on the west sidewalk, cars parked in the bays on the east side
    LADOS.forEach((l, li) => {
      for (let y = q1 + 20; y < FACE * T - 12; y += 48) PROPS.push(lampAt(l.x0 * T + 8, y, 'back'));
      for (let y = q1 + 14, k = 0; y < FACE * T - 36; y += 30, k++) if (DL.hash(li * 50 + k * 9 + 2) < 0.7) PROPS.push(parkedCar(l.x1 * T - T - 13, y + 15, 'y', li * 20 + k));
    });
    // a yard behind each shallow front block: a car park (a wall, cars) or a garden (trees, a shed)
    const yy0 = B.yard0 * T, yy1 = (B.yard1 + 1) * T;
    BLOCKS.filter((b) => b.y1 === FACE && b.y0 === FRONT_Y0).forEach((b, k) => {
      const x0 = b.x0 * T + 4, x1 = b.x1 * T - 4, garden = k % 3 !== 1;
      if (x1 - x0 < 3 * T) return;
      if (garden) {
        YARDS.push({ x0, y0: yy0 + 2, x1, y1: yy1 - 2, h: 6 });
        PROPS.push(prop('quintal', x0, yy0, x1, yy1, 'back', (g) => {
          K.poly(g, [[x0, yy0 + 2, 0], [x1, yy0 + 2, 0], [x1, yy1 - 2, 0], [x0, yy1 - 2, 0]], '#12301f');
          g.fillStyle = '#1b4a2e';
          for (let i = 0; i < 24; i++) { const gx = x0 + 3 + DL.hash(i * 3 + k) * (x1 - x0 - 6), gy = yy0 + 3 + DL.hash(i * 5 + k) * (yy1 - yy0 - 6); g.fillRect(Math.round(IX(gx, gy)), Math.round(IY(gx, gy, 0)), 1, 1); }
          lowWall(g, x0, yy0 + 2, x1, yy1 - 2, 6, { s: '#3a4357', e: '#2c3343', t: '#4c5770' });
          shed(g, x1 - 24, yy0 + 8, { s: '#5a4030', e: '#47321f', t: '#6b5240' });
        }));
        PROPS.push(tree(x0 + 14, yy0 + 24, 'back'));
        if (x1 - x0 > 5 * T) PROPS.push(tree(x0 + 44, yy1 - 18, 'back'));
      } else {
        YARDS.push({ x0, y0: yy0 + 2, x1, y1: yy1 - 2, h: 5 });
        PROPS.push(prop('estac', x0, yy0, x1, yy1, 'back', (g) => {
          K.poly(g, [[x0, yy0 + 2, 0], [x1, yy0 + 2, 0], [x1, yy1 - 2, 0], [x0, yy1 - 2, 0]], '#15171d');
          for (let x = x0 + 8; x < x1 - 8; x += 30) K.line(g, [x, yy0 + 8, 0.2], [x, yy0 + 34, 0.2], '#3a3f4c', 1);
          lowWall(g, x0, yy0 + 2, x1, yy1 - 2, 5, { s: '#2c3242', e: '#232836', t: '#3b4356' });
        }));
        for (let x = x0 + 22, c = 0; x < x1 - 20; x += 30, c++) if (DL.hash(k * 13 + c * 7 + 1) < 0.75) PROPS.push(parkedCar(x, yy0 + 21, 'x', 100 + k * 10 + c));
      }
    });
    // the small park in the far row: a lawn with a path, trees, a bench, a lamp and a low fence
    const P = POCKET_PARK, px0 = P.x0 * T + 2, px1 = P.x1 * T - 2, py0 = TRAS.bld0 * T + 2, py1 = TRAS.bld1 * T - 2;
    PROPS.push(prop('pracinha', px0, py0, px1, py1, 'back', (g) => {
      K.poly(g, [[px0, py0, 0], [px1, py0, 0], [px1, py1, 0], [px0, py1, 0]], '#0f2117');
      for (let i = 0; i < 90; i++) { const x = px0 + 3 + DL.hash(i * 3 + 9) * (px1 - px0 - 6), y = py0 + 3 + DL.hash(i * 5 + 4) * (py1 - py0 - 6); g.fillStyle = i % 2 ? '#163024' : '#0b1a12'; g.fillRect(Math.round(IX(x, y)), Math.round(IY(x, y, 0)), 1, 1); }
      // a path from the avenue's sidewalk to the middle, and a round plaza
      const mx = (px0 + px1) / 2, my = (py0 + py1) / 2;
      K.poly(g, [[mx - 5, my, 0], [mx + 5, my, 0], [mx + 5, py1, 0], [mx - 5, py1, 0]], '#2a2f38');
      g.fillStyle = '#2a2f38';
      g.beginPath(); g.ellipse(IX(mx, my), IY(mx, my, 0), 18, 9, 0, 0, Math.PI * 2); g.fill();
      // the fence: posts and a rail along the south and east sides
      for (let x = px0; x <= px1; x += 10) K.box(g, x, py1 - 1, x + 1, py1, 0, 5, METAL);
      for (let y = py0; y < py1; y += 10) K.box(g, px1 - 1, y, px1, y + 1, 0, 5, METAL);
      K.box(g, px0, py1 - 0.8, px1, py1, 4.2, 5, METAL);
      K.box(g, px1 - 0.8, py0, px1, py1, 4.2, 5, METAL);
    }));
    PROPS.push(tree(px0 + 12, py0 + 14, 'back'), tree(px1 - 14, py0 + 20, 'back'), tree(px0 + 16, py1 - 16, 'back'), tree(px1 - 18, py1 - 22, 'back'));
    PROPS.push(bench((P.x0 + 1) * T, (TRAS.bld0 + 3.2) * T, 'back'), lampAt((px0 + px1) / 2 + 24, (py0 + py1) / 2 + 2, 'back'));
    YARDS.push({ x0: px0, y0: py1 - 2, x1: px1, y1: py1, h: 5 });
  }

  /* ---------------- the bridges: the avenue goes on over the water at both ends, into the fog ---------------- */
  const PONTES = [];
  function bridge(x0, x1, west) {
    const y0 = ROWS.road0 * T - 4, y1 = (ROWS.road1 + 1) * T + 4, asf = { s: '#0e1016', e: '#0b0d12', t: '#15181e' };
    PONTES.push({ x0, x1, y0, y1, west });
    const deck = prop('ponte', x0, y0, x1, y1, 'back', (g) => {
      // pylons in the water, then the deck (its south side drops to the water), then the kerbs and the north railing
      for (let x = (west ? x1 : x0) + 2 * T; west ? x > x0 : x < x1; x += west ? -4 * T : 4 * T) {
        K.box(g, x - 3, y1 - 8, x + 3, y1 - 2, -40, -12, { s: '#2c3242', e: '#232836', t: '#3b4356' });
        K.box(g, x - 3, y0 + 2, x + 3, y0 + 8, -40, -12, { s: '#2c3242', e: '#232836', t: '#3b4356' });
      }
      K.box(g, x0, y0, x1, y1, -14, 0, asf);
      K.poly(g, [[x0, y0 + 4, 0], [x1, y0 + 4, 0], [x1, y1 - 4, 0], [x0, y1 - 4, 0]], '#121419');
      const mid = (ROWS.road0 + 3) * T;
      for (let x = x0; x < x1; x += 8) { K.line(g, [x, mid - 2, 0.2], [x + 4, mid - 2, 0.2], '#a8913f', 1); K.line(g, [x, mid + 1, 0.2], [x + 4, mid + 1, 0.2], '#a8913f', 1); }
      for (const ly of [(ROWS.road0 + 1.5) * T, (ROWS.road0 + 4.5) * T]) for (let x = x0 + 4; x < x1; x += 28) K.line(g, [x, ly, 0.2], [x + 14, ly, 0.2], '#6f7686', 1);
      K.box(g, x0, y0, x1, y0 + 2, 0, 1.5, { s: '#59647d', e: '#434d63', t: '#7d89a3' });
      K.box(g, x0, y1 - 2, x1, y1, 0, 1.5, { s: '#59647d', e: '#434d63', t: '#7d89a3' });
      for (let x = x0 + 4; x < x1; x += 2 * T) K.box(g, x, y0, x + 1.5, y0 + 1.5, 1.5, 9, METAL);
      K.box(g, x0, y0, x1, y0 + 1, 8, 9.5, METAL);
      K.box(g, x0, y0, x1, y0 + 1, 4.5, 5.5, { s: '#4a5469', e: '#3a4255', t: '#59647d' });
    });
    // the south railing goes after the cars (the far layer)
    const railS = prop('ponteS', x0, y1 - 2, x1, y1, 'far', (g) => {
      for (let x = x0 + 4; x < x1; x += 2 * T) K.box(g, x, y1 - 1.5, x + 1.5, y1, 1.5, 9, METAL);
      K.box(g, x0, y1 - 1, x1, y1, 8, 9.5, METAL);
      K.box(g, x0, y1 - 1, x1, y1, 4.5, 5.5, { s: '#4a5469', e: '#3a4255', t: '#59647d' });
    });
    return [deck, railS];
  }
  if (PONTE > 0) PROPS.push(...bridge(-PONTE * T, 0, true), ...bridge(SW * T, (SW + PONTE) * T, false));
  // along the furniture strip: posts every few steps, benches and planters in between (never in front of
  // the door, never on the crossing)
  const offCross = (x) => x < CROSS.x0 - 1 || x > CROSS.x1;
  const offWalk = (x) => x < WALK.x0 - 1 || x > WALK.x1 + 2;
  const LAMPS = [WALK.x0 + 2, WALK.x0 + 7, WALK.x1 - 7, WALK.x1 - 2];
  for (let x = 3; x < SW; x += 6) if (offWalk(x) && offCross(x)) LAMPS.push(x);
  for (const x of LAMPS) PROPS.push(lampPost(x * T + 8));
  PROPS.push(bench((WALK.x0 + 4) * T), bench((WALK.x1 - 5) * T));
  const PLANTERS = [[WALK.x0, false], [WALK.x0 + 8, true], [DOOR_X + 2, true], [WALK.x1, false]];
  for (const x of LAMPS) if (offWalk(x + 3) && offWalk(x) && offCross(x + 3) && x + 3 < SW) PLANTERS.push([x + 3, x % 2 === 0]);
  for (const [x, f] of PLANTERS) PROPS.push(planter(x * T, f));
  // across the road: lamps every few steps, trees in the square
  const FAR_LAMPS = [];
  for (let x = 2; x < SW; x += 8) if (offCross(x)) FAR_LAMPS.push(x);
  for (const x of FAR_LAMPS) PROPS.push(farLamp(x * T + 8));
  /* ---------------- the square across the road (PARK) ---------------- */
  // (daynight.js: their shadows; the lamps light up at night)
  const PARK_LAMPS = [];
  const CAIXAS = []; // other things on the square that cast a shadow: { x0, y0, x1, y1, h }
  // an n-sided prism around (cx, cy): the sides that face the viewer and the top (fountain, kiosk sign)
  function prism(g, cx, cy, r, n, z0, z1, c) {
    const pts = [];
    for (let i = 0; i < n; i++) { const a = ((i + 0.5) * 2 * Math.PI) / n; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); }
    if (c.s || c.e) for (let i = 0; i < n; i++) {
      const a = pts[i], b = pts[(i + 1) % n], mx = (a[0] + b[0]) / 2 - cx, my = (a[1] + b[1]) / 2 - cy;
      if (mx + my <= 0) continue; // faces away from the viewer
      K.poly(g, [[a[0], a[1], z0], [b[0], b[1], z0], [b[0], b[1], z1], [a[0], a[1], z1]], mx > my ? c.e : c.s);
    }
    if (c.t) K.poly(g, pts.map((q) => [q[0], q[1], z1]), c.t);
  }
  // the fountain: a round stone basin with water, a column and a bowl with a little jet on top
  function fonte() {
    const F = PARK.fonte, x = F.x, y = F.y;
    CAIXAS.push({ x0: x - 20, y0: y - 20, x1: x + 20, y1: y + 20, h: 6 }, { x0: x - 4, y0: y - 4, x1: x + 4, y1: y + 4, h: 22 });
    return prop('fonte', x - 26, y - 26, x + 26, y + 26, 'park', (g) => {
      const pedra = { s: '#5a6378', e: '#454d60', t: '#6f7a92' };
      prism(g, x, y, 26, 16, 0, 6, pedra);
      prism(g, x, y, 22, 16, 6, 6, { t: '#17506b' });
      g.fillStyle = '#2f86ad';
      for (let i = 0; i < 14; i++) { const a = DL.hash(i * 3 + 1) * Math.PI * 2, d = 8 + DL.hash(i * 5 + 2) * 12; g.fillRect(Math.round(IX(x + Math.cos(a) * d, y + Math.sin(a) * d)), Math.round(IY(x + Math.cos(a) * d, y + Math.sin(a) * d, 6)), 2, 1); }
      prism(g, x, y, 4, 8, 6, 14, pedra);
      prism(g, x, y, 11, 12, 14, 17, pedra);
      prism(g, x, y, 9, 12, 17, 17, { t: '#2a7fa0' });
      // water falling from the bowl into the basin (only the front half shows)
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2, c = Math.cos(a), sn = Math.sin(a);
        if (c + sn < -0.2) continue;
        K.line(g, [x + c * 11, y + sn * 11, 16], [x + c * 14, y + sn * 14, 6], 'rgba(150,220,245,0.75)', 1);
      }
      prism(g, x, y, 1.6, 6, 17, 24, { s: '#7fd6f0', e: '#5fb8d6', t: '#e6fbff' });
      g.fillStyle = '#bff0ff';
      for (const [dx, dy, z] of [[-3, 1, 23], [3, -1, 22], [1, 3, 21], [-2, -3, 20]]) g.fillRect(Math.round(IX(x + dx, y + dy)), Math.round(IY(x + dx, y + dy, z)), 1, 1);
    });
  }
  // a short lamp post on the square (a lantern on top)
  function parkLamp(cx, cy) {
    PARK_LAMPS.push({ cx, cy });
    return prop('lamp', cx - 2, cy - 2, cx + 2, cy + 2, 'park', (g) => {
      K.box(g, cx - 1.5, cy - 1.5, cx + 1.5, cy + 1.5, 0, 2, { s: '#2b3344', e: '#222837', t: '#3a4459' });
      K.box(g, cx - 0.75, cy - 0.75, cx + 0.75, cy + 0.75, 2, 28, METAL);
      K.box(g, cx - 2.5, cy - 2.5, cx + 2.5, cy + 2.5, 28, 33, { s: '#cfe8d8', e: '#a8c9b6', t: '#2b3344' });
      K.box(g, cx - 3, cy - 3, cx + 3, cy + 3, 33, 34.5, { s: '#2b3344', e: '#222837', t: '#3a4459' });
    });
  }
  // the ice-cream kiosk (an invented one): cream walls, a lit window with a striped awning, a sign on top
  const SORV_ART = (() => {
    const c = DL.mk(31, 9), g = c.getContext('2d');
    R(g, 0, 0, 31, 9, '#ff5fa2'); R(g, 1, 1, 29, 7, '#3a0f22');
    DL.pixText(g, 'SORVETE', 2, 2, '#ffe0ef');
    return c;
  })();
  function quiosque() {
    const k = PARK.quiosque, x0 = k.x0, y0 = k.y0, x1 = k.x1, y1 = k.y1;
    CAIXAS.push({ x0, y0, x1, y1, h: 22 });
    return prop('quiosque', x0, y0, x1, y1 + 6, 'park', (g) => {
      K.box(g, x0, y0, x1, y1, 0, 20, { s: '#e8dcc4', e: '#cbbd9f', t: '#e8dcc4' });
      K.poly(g, [[x0 + 5, y1, 7], [x1 - 5, y1, 7], [x1 - 5, y1, 15], [x0 + 5, y1, 15]], '#ffd27a');
      // the ice creams in the window
      for (let i = 0; i < 5; i++) { const xx = x0 + 9 + i * 5; K.poly(g, [[xx, y1, 9], [xx + 3, y1, 9], [xx + 3, y1, 11], [xx, y1, 11]], ['#ff5fa2', '#9ee6c0', '#fff1b8', '#c49a6c', '#ff9ec7'][i]); }
      K.box(g, x0 + 4, y1, x1 - 4, y1 + 3, 6, 7, { s: '#8a6a52', e: '#6b5240', t: '#a8846a' });
      const n = 6, w = (x1 - x0) / n;
      for (let i = 0; i < n; i++) K.poly(g, [[x0 + i * w, y1, 18], [x0 + (i + 1) * w, y1, 18], [x0 + (i + 1) * w, y1 + 6, 14], [x0 + i * w, y1 + 6, 14]], i % 2 ? '#f2f2f2' : '#ff5fa2');
      K.box(g, x0 - 1, y0 - 1, x1 + 1, y1 + 1, 20, 22, { s: '#2c8a8a', e: '#1f6b6b', t: '#3aa8a8' });
      for (const xx of [x0 + 6, x1 - 6]) K.box(g, xx, (y0 + y1) / 2, xx + 1, (y0 + y1) / 2 + 1, 22, 27, METAL);
      stand(g, SORV_ART, (x0 + x1) / 2, (y0 + y1) / 2 + 1, 26);
    });
  }
  // the playground on the sand: swings and a slide
  function parquinho() {
    const P = PARK.parquinho, sx0 = P.x0 + 8, sx1 = P.x0 + 44, sy = P.y0 + 12;
    const tx = P.x0 + 62, ty = P.y0 + 18;
    CAIXAS.push({ x0: sx0, y0: sy - 1, x1: sx1, y1: sy + 1, h: 22 }, { x0: tx, y0: ty, x1: tx + 10, y1: ty + 10, h: 18 });
    return [
      prop('balanco', sx0 - 4, sy - 6, sx1 + 4, sy + 6, 'park', (g) => {
        const red = '#d9465f';
        for (const xx of [sx0, sx1]) { K.line(g, [xx, sy - 5, 0], [xx, sy, 22], red, 1.5); K.line(g, [xx, sy + 5, 0], [xx, sy, 22], red, 1.5); }
        K.line(g, [sx0, sy, 22], [sx1, sy, 22], red, 1.5);
        for (const xx of [sx0 + 10, sx1 - 10]) {
          K.line(g, [xx - 3, sy, 22], [xx - 3, sy, 6], '#8a98ad', 1);
          K.line(g, [xx + 3, sy, 22], [xx + 3, sy, 6], '#8a98ad', 1);
          K.box(g, xx - 4, sy - 1.5, xx + 4, sy + 1.5, 5, 6, { s: '#ffd166', e: '#d9a53f', t: '#ffe08a' });
        }
      }),
      prop('escorrega', tx, ty, tx + 40, ty + 10, 'park', (g) => {
        const azul = { s: '#3d7fd9', e: '#2c63b0', t: '#5f9cf0' };
        for (const [xx, yy] of [[tx, ty], [tx + 9, ty], [tx, ty + 9], [tx + 9, ty + 9]]) K.box(g, xx, yy, xx + 1, yy + 1, 0, 16, azul);
        for (let z = 3; z < 16; z += 4) K.line(g, [tx, ty + 9.5, z], [tx + 1, ty + 9.5, z], '#8a98ad', 1);
        K.box(g, tx, ty, tx + 10, ty + 10, 16, 18, azul);
        K.poly(g, [[tx + 10, ty + 2, 17], [tx + 36, ty + 2, 2], [tx + 36, ty + 8, 2], [tx + 10, ty + 8, 17]], '#ffd166');
        K.line(g, [tx + 10, ty + 2, 19], [tx + 36, ty + 2, 4], '#d9a53f', 1.5);
        K.line(g, [tx + 10, ty + 8, 19], [tx + 36, ty + 8, 4], '#d9a53f', 1.5);
        K.box(g, tx + 36, ty + 2, tx + 40, ty + 8, 0, 2, { s: '#d9a53f', e: '#b88a2e', t: '#ffd166' });
      }),
    ];
  }
  // a raised flower bed, and a loose bush on the lawn
  function canteiro(cx, cy) {
    CAIXAS.push({ x0: cx - 11, y0: cy - 6, x1: cx + 11, y1: cy + 6, h: 5 });
    return prop('canteiro', cx - 11, cy - 6, cx + 11, cy + 6, 'park', (g) => {
      K.box(g, cx - 11, cy - 6, cx + 11, cy + 6, 0, 3, { s: '#4c5770', e: '#3a4357', t: '#21180f' });
      stand(g, FLOWERS, cx - 4, cy, 3);
      stand(g, BUSH, cx + 5, cy + 2, 3);
    });
  }
  function arbusto(x, y, flores) {
    CAIXAS.push({ x0: x - 3, y0: y - 2, x1: x + 3, y1: y + 2, h: 6 });
    return prop('bush', x - 4, y - 3, x + 4, y + 3, 'park', (g) => stand(g, flores ? FLOWERS : BUSH, x, y + 2));
  }
  {
    const used = []; // [x, y, radius] of everything placed, so trees and bushes keep off
    const P1 = PARK.path1, P2 = PARK.path2;
    const free = (x, y, m) => {
      if (y < P1.y1 + 4 + m || y > PARK.end - 6) return false;
      if (y > P2.y0 - m && y < P2.y1 + m) return false;
      for (const cx of PARK.cross) if (x > cx * T + 3 - m && x < cx * T + 13 + m) return false;
      const F = PARK.fonte;
      if (Math.hypot(x - F.x, y - F.y) < F.r + m) return false;
      const Pq = PARK.parquinho;
      if (x > Pq.x0 - m && x < Pq.x1 + m && y > Pq.y0 - m && y < Pq.y1 + m) return false;
      for (const u of used) if (Math.hypot(x - u[0], y - u[1]) < u[2] + m) return false;
      return true;
    };
    PROPS.push(fonte(), quiosque(), ...parquinho());
    // lamps along both paths (none on the plaza by the crossing)
    for (const tx of [4, 14, 26, 31, 37, 46, 56, 66].map((x) => x + DX).concat([2, 9, SW - 3, SW - 9])) { const x = tx * T + 8, y = P1.y0 - 3; PROPS.push(parkLamp(x, y)); used.push([x, y, 4]); }
    for (const tx of [3, 21, 40, 52, 64].map((x) => x + DX).concat([6, SW - 7])) { const x = tx * T + 8, y = P2.y1 + 3; PROPS.push(parkLamp(x, y)); used.push([x, y, 4]); }
    // benches by the paths, and along the promenade
    for (const tx of [5, 23, 29, 39, 52, 63].map((x) => x + DX).concat([6, SW - 8])) { PROPS.push(bench(tx * T, P1.y1 + 2, 'park')); used.push([tx * T + 16, P1.y1 + 6, 18]); }
    for (const tx of [19, 44, 56].map((x) => x + DX).concat([4, SW - 7])) { PROPS.push(bench(tx * T, P2.y0 - 10, 'park')); used.push([tx * T + 16, P2.y0 - 6, 18]); }
    for (let tx = 6; tx < SW - 4; tx += 12) { PROPS.push(bench(tx * T, PARK.end + 4, 'park')); PROPS.push(parkLamp((tx + 5) * T, PARK.end + 6)); }
    // flower beds by the fountain and at the ends of the paths across
    for (const [x, y] of [[PARK.fonte.x - 56, PARK.fonte.y], [PARK.fonte.x + 56, PARK.fonte.y], [(21 + DX) * T, (PK + 5.6) * T], [(54 + DX) * T, (PK + 5.6) * T], [(4 + DX) * T, (PK + 11) * T], [(33 + DX) * T, (PK + 11) * T], [3 * T, (PK + 6) * T], [(SW - 4) * T, (PK + 6) * T]]) { PROPS.push(canteiro(x, y)); used.push([x, y, 14]); }
    // the trees: a loose grid with a little wobble, never on the paths or too close to anything
    for (let gy = 0, y0 = P1.y1 + 14; y0 + gy * 17 < PARK.end - 6; gy++) {
      for (let gx = 0; gx * 21 + 10 < SW * T - 8; gx++) {
        const k = gy * 97 + gx;
        if (DL.hash(k * 7 + 3) > 0.42) continue;
        const x = Math.round(gx * 21 + 10 + (gy % 2) * 10 + (DL.hash(k * 3 + 1) - 0.5) * 8), y = Math.round(y0 + gy * 17 + (DL.hash(k * 5 + 2) - 0.5) * 6);
        if (!free(x, y, 7)) continue;
        PROPS.push(tree(x, y));
        used.push([x, y, 7]);
      }
    }
    // bushes in some of the gaps
    for (let i = 0; i < 90; i++) {
      const x = Math.round(12 + DL.hash(i * 23 + 9) * (SW * T - 24)), y = Math.round(P1.y1 + 8 + DL.hash(i * 29 + 4) * (PARK.end - P1.y1 - 12));
      if (!free(x, y, 5)) continue;
      PROPS.push(arbusto(x, y, i % 3 === 0));
      used.push([x, y, 5]);
    }
  }

  const street = new DL.Scene(scene.canvas, {
    world: buildWorld(), renderFloor: paintFloor, iso: true,
    tilesWide: scene.o.tilesWide, minTilesHigh: scene.o.minTilesHigh, padTop: scene.o.padTop,
  });
  street.lights = (g, sc) => {
    DL.pool(g, DOOR_X * T + 8, ROWS.face * T + 6, 30, signOn(sc.t) ? 'rgba(61,255,162,0.10)' : 'rgba(61,255,162,0.03)');
    // street lamps: a cool pool on the sidewalk and the road under each head
    for (const x of LAMPS) DL.pool(g, x * T + 8, FY - 1, 40, 'rgba(190,255,225,0.07)');
    for (const x of FAR_LAMPS) DL.pool(g, x * T + 8, ROWS.far0 * T - 10, 40, 'rgba(190,255,225,0.07)');
    // the traffic lights tint the crossing
    const st = signalAt(sc.t), col = st === 'red' ? '255,59,59' : st === 'amber' ? '255,176,32' : '61,255,122';
    for (const L of LIGHTS) DL.pool(g, L.cx, L.cy, 14, 'rgba(' + col + ',0.10)');
    // the works' warning light
    if (Math.floor(sc.t * 2) % 2 === 0) DL.pool(g, (WALK.x1 + 1) * T + 6, (ROWS.face + 2) * T, 26, 'rgba(255,170,40,0.10)');
    // the name sign lights the sidewalk in front of the datacenter
    if (signLit(sc.t)) DL.pool(g, PANEL.x + PANEL.w / 2, ROWS.face * T + 10, 70, 'rgba(61,255,162,0.06)');
    // the shops' windows light the sidewalk
    for (const s of SHOPS) DL.pool(g, s.x, ROWS.face * T + 8, 34, 'rgba(255,205,130,0.08)');
    carLights(g);
  };

  /* ------------------------------------------------------------------ */
  /* cars: a few, recycled, only moving while the street is on screen     */
  /* ------------------------------------------------------------------ */
  // How many cars drive at once, on the avenue in front and on the back avenue. Each one is reused: when it
  // leaves the street it comes back in at the other end as another car (model, colour, lane, speed). No
  // collision with the player — they never meet: the cars stay on the road, the player on the sidewalk.
  const CARROS = 4, CARROS_TRAS = TRAS ? 3 : 0;
  // lanes: on the avenue two going west (−x, the north half of the road) and two going east (+x, the south
  // half), ending in the fog on the bridges (road 'a'); on the back avenue one each way, between the side
  // streets (road 'b': the cars turn in from one side street and out into the other)
  const LANES = [
    { y: (ROWS.road0 + 0.75) * T, dir: -1, road: 'a' }, { y: (ROWS.road0 + 2.25) * T, dir: -1, road: 'a' },
    { y: (ROWS.road0 + 3.75) * T, dir: 1, road: 'a' }, { y: (ROWS.road0 + 5.25) * T, dir: 1, road: 'a' },
  ];
  if (TRAS) LANES.push({ y: (TRAS.road2a + 1) * T, dir: -1, road: 'b' }, { y: (TRAS.road2a + 3) * T, dir: 1, road: 'b' });
  // where each road begins and ends (world x): the cars appear at one end and go at the other
  const ROAD_X = { a: [-PONTE * T - 40, (SW + PONTE) * T + 40], b: TRAS ? [LADOS[0].x1 * T - 6 - T, LADOS[1].x0 * T + 6 + T] : [0, 0] };
  // where each direction stops for a red light (the car's front bumper), just before its stop line
  const STOP = { east: CROSS.x0 * T - 11, west: CROSS.x1 * T + 10 };
  const MODELS = {
    hatch: { L: 22, Wd: 10, body: 7, cab: [-7, 4], cabH: 5.5, vmax: [52, 66] },
    sedan: { L: 27, Wd: 10, body: 6.5, cab: [-6, 5], cabH: 5, vmax: [58, 74] },
    van: { L: 28, Wd: 11, body: 15, cab: [7, 13], cabH: 0, vmax: [44, 56] },
  };
  const MODEL_KEYS = Object.keys(MODELS);
  const COLORS = CAR_COLORS;
  // (shadeHex: at the top, the shops' art uses it while the file loads)

  // each model × colour × direction is painted once into a small canvas (1 canvas px = 1 iso px)
  const CAR_ART = new Map(), CO = { x: 26, y: 30, w: 52, h: 42 }, CAR_ORIGIN = CO;
  // the same car standing along y (parked in a side street): the body runs north–south; the south end and
  // the east side show. dir: +1 = facing south (its lights show), −1 = facing north
  function carArtNS(model, color, dir) {
    const key = 'ns' + model + color + dir;
    if (CAR_ART.has(key)) return CAR_ART.get(key);
    const m = MODELS[model], c = DL.mk(CO.w, CO.h), g = c.getContext('2d');
    K.isoT(g, { S: 1, ox: -CO.x, oy: -CO.y });
    g.lineWidth = 1;
    const hl = m.L / 2, hw = m.Wd / 2;
    const body = { s: color, e: shadeHex(color, 0.72), t: shadeHex(color, 1.18) };
    const glass = { s: '#1c2a3d', e: '#15202f', t: '#26364d' };
    const dark = { s: '#101217', e: '#0b0c10', t: '#1a1d24' };
    K.poly(g, [[-hw - 1, -hl + 1, 0], [hw + 2, -hl + 1, 0], [hw + 2, hl + 2, 0], [-hw - 1, hl + 2, 0]], 'rgba(0,0,0,0.35)', false);
    for (const wy of [-hl + 5, hl - 6]) K.box(g, hw - 1, wy - 2.5, hw + 0.5, wy + 2.5, 0, 4.5, dark);
    K.box(g, -hw, -hl, hw, hl, 1.5, m.body, body);
    if (m.cabH) {
      const a = dir > 0 ? m.cab[0] : -m.cab[1], b = dir > 0 ? m.cab[1] : -m.cab[0];
      K.box(g, -hw + 1, a, hw - 1, b, m.body, m.body + m.cabH, glass);
      K.box(g, -hw + 1.5, a + 1, hw - 1.5, b - 1, m.body + m.cabH - 0.1, m.body + m.cabH + 0.6, { t: shadeHex(color, 1.1) });
    } else {
      K.box(g, -hw + 1, hl - 0.05, hw - 1, hl, 9, 13.5, glass);
      for (let k = 0; k < 2; k++) { const sy = -hl + 3 + k * 7; K.box(g, hw - 0.05, sy, hw, sy + 5, 9.5, 13, glass); }
    }
    K.line(g, [hw, -hl + 1, 4.5], [hw, hl - 1, 4.5], shadeHex(color, 0.6), 1);
    const lc = dir > 0 ? '#fff6d6' : '#ff3b3b';
    for (const lx of [-hw + 1.5, hw - 2.5]) K.poly(g, [[lx, hl + 0.05, 3.5], [lx + 1.5, hl + 0.05, 3.5], [lx + 1.5, hl + 0.05, 5.5], [lx, hl + 0.05, 5.5]], lc, false);
    CAR_ART.set(key, c);
    return c;
  }
  function carArt(model, color, dir) {
    const key = model + color + dir;
    if (CAR_ART.has(key)) return CAR_ART.get(key);
    const m = MODELS[model], c = DL.mk(CO.w, CO.h), g = c.getContext('2d');
    const at = { S: 1, ox: -CO.x, oy: -CO.y };
    K.isoT(g, at);
    g.lineWidth = 1;
    const hl = m.L / 2, hw = m.Wd / 2;
    const body = { s: color, e: shadeHex(color, 0.72), t: shadeHex(color, 1.18) };
    const glass = { s: '#1c2a3d', e: '#15202f', t: '#26364d' };
    const dark = { s: '#101217', e: '#0b0c10', t: '#1a1d24' };
    // shadow
    K.poly(g, [[-hl - 1, -hw + 1, 0], [hl + 2, -hw + 1, 0], [hl + 2, hw + 2, 0], [-hl - 1, hw + 2, 0]], 'rgba(0,0,0,0.35)', false);
    // wheels (only the south ones show)
    for (const wx of [-hl + 5, hl - 6]) K.box(g, wx - 2.5, hw - 1, wx + 2.5, hw + 0.5, 0, 4.5, dark);
    // body
    K.box(g, -hl, -hw, hl, hw, 1.5, m.body, body);
    // the front is +x for a car going east, −x for one going west: the cabin leans towards it
    const f = dir > 0 ? 1 : -1;
    if (m.cabH) {
      const a = f > 0 ? m.cab[0] : -m.cab[1], b = f > 0 ? m.cab[1] : -m.cab[0];
      K.box(g, a, -hw + 1, b, hw - 1, m.body, m.body + m.cabH, glass);
      K.box(g, a + 1, -hw + 1.5, b - 1, hw - 1.5, m.body + m.cabH - 0.1, m.body + m.cabH + 0.6, { t: shadeHex(color, 1.1) });
      // the pillar between the side windows
      const px = (a + b) / 2;
      K.box(g, px - 0.6, hw - 1.05, px + 0.6, hw - 1, m.body, m.body + m.cabH, { s: shadeHex(color, 0.85) });
    } else {
      // van: a windscreen at the front and a row of side windows
      const wx0 = f > 0 ? hl - 7 : -hl + 1, wx1 = f > 0 ? hl - 1 : -hl + 7;
      K.box(g, wx0, hw - 0.05, wx1, hw, 9, 13.5, glass);
      for (let k = 0; k < 2; k++) { const sx = f > 0 ? -hl + 3 + k * 7 : hl - 9 - k * 7; K.box(g, sx, hw - 0.05, sx + 5, hw, 9.5, 13, glass); }
      if (f > 0) K.box(g, hl - 0.05, -hw + 1, hl, hw - 1, 9, 13.5, glass);
    }
    // a stripe along the side
    K.line(g, [-hl + 1, hw, 4.5], [hl - 1, hw, 4.5], shadeHex(color, 0.6), 1);
    // lights on the east end (the only end that shows): headlights going east, tail lights going west
    const lc = dir > 0 ? '#fff6d6' : '#ff3b3b';
    for (const ly of [-hw + 1.5, hw - 2.5]) K.poly(g, [[hl + 0.05, ly, 3.5], [hl + 0.05, ly + 1.5, 3.5], [hl + 0.05, ly + 1.5, 5.5], [hl + 0.05, ly, 5.5]], lc, false);
    CAR_ART.set(key, c);
    return c;
  }

  const rnd = Math.random;
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const cars = [];
  // a car (re)entering the street at the end its lane comes from, behind any car already there
  function spawnCar(car, anywhere) {
    const road = car.road || 'a', lanes = LANES.filter((l) => l.road === road);
    const L = lanes[Math.floor(rnd() * lanes.length)], lane = LANES.indexOf(L), model = pick(MODEL_KEYS), m = MODELS[model];
    Object.assign(car, { road, lane, model, color: pick(COLORS), dir: L.dir, y: L.y, L: m.L, v: 0, vmax: m.vmax[0] + rnd() * (m.vmax[1] - m.vmax[0]) });
    if (road === 'b') car.vmax *= 0.75;
    car.v = car.vmax;
    car.art = carArt(model, car.color, car.dir);
    const [xa, xb] = ROAD_X[road];
    // on the avenue: in the fog at the end of a bridge; on the back avenue: just out of a side street
    const start = car.dir > 0 ? xa - (road === 'a' ? rnd() * 200 : 0) : xb + (road === 'a' ? rnd() * 200 : 0);
    car.x = anywhere ? xa + 60 + rnd() * (xb - xa - 120) : start;
    // not on top of another car in the same lane
    for (let guard = 0; guard < 8; guard++) {
      const clash = cars.some((o) => o !== car && o.lane === car.lane && Math.abs(o.x - car.x) < (o.L + car.L) / 2 + 14);
      if (!clash) break;
      car.x += car.dir > 0 ? -60 : 60;
    }
  }
  for (let i = 0; i < CARROS; i++) { const c = { road: 'a' }; cars.push(c); spawnCar(c, true); }
  for (let i = 0; i < CARROS_TRAS; i++) { const c = { road: 'b' }; cars.push(c); spawnCar(c, true); }

  function updateCars(dt, t) {
    const sig = signalAt(t);
    for (const c of cars) {
      let want = c.vmax;
      // the light (avenue only): stop at the line on red (and on amber, unless it is too close to stop)
      const front = c.x + c.dir * c.L / 2;
      if (c.road === 'a') {
        const toLine = c.dir > 0 ? STOP.east - front : front - STOP.west;
        if (sig !== 'green' && toLine > -1 && toLine < 90 && !(sig === 'amber' && toLine < 10)) want = Math.min(want, Math.max(0, Math.sqrt(2 * 110 * Math.max(0, toLine - 1))));
      }
      // the car ahead in the same lane
      for (const o of cars) {
        if (o === c || o.lane !== c.lane) continue;
        const gap = (o.x - c.x) * c.dir - (o.L + c.L) / 2;
        if (gap > -4 && gap < 70) want = Math.min(want, Math.max(0, (gap - 8) * 2.2));
      }
      c.v += Math.max(-150 * dt, Math.min(40 * dt, want - c.v));
      if (c.v < 0) c.v = 0;
      c.braking = want < c.v + 1 && c.v < c.vmax - 2;
      c.x += c.dir * c.v * dt;
      const [xa, xb] = ROAD_X[c.road];
      if (c.x < xa - (c.road === 'a' ? 260 : 0) || c.x > xb + (c.road === 'a' ? 260 : 0)) spawnCar(c, false);
    }
  }
  // drawn between the furniture strip and the far side, north lanes first; only the ones on screen
  function drawCars(g, sc, road) {
    const S = sc.S, W = sc.canvas.width, H = sc.canvas.height;
    const list = cars.filter((c) => c.road === road).sort((a, b) => a.y - b.y || a.x - b.x);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.imageSmoothingEnabled = false;
    for (const c of list) {
      const dx = Math.round((IX(c.x, c.y) - CO.x) * S - sc.ox), dy = Math.round((IY(c.x, c.y, 0) - CO.y) * S - sc.oy);
      if (dx > W || dy > H || dx + CO.w * S < 0 || dy + CO.h * S < 0) continue;
      g.drawImage(c.art, dx, dy, CO.w * S, CO.h * S);
    }
  }
  // headlights on the road ahead, brake lights behind (in the street's lights pass)
  function carLights(g) {
    for (const c of cars) {
      const front = c.x + c.dir * c.L / 2, back = c.x - c.dir * c.L / 2;
      DL.pool(g, front + c.dir * 16, c.y, 22, 'rgba(255,244,210,0.09)');
      DL.pool(g, back - c.dir * 3, c.y, c.braking ? 12 : 7, c.braking ? 'rgba(255,40,40,0.16)' : 'rgba(255,40,40,0.06)');
    }
  }

  /* ------------------------------------------------------------------ */
  /* people walking by (a few, reused, only while the street is on screen) */
  /* ------------------------------------------------------------------ */
  // Some walk along the far sidewalk; others come down the near sidewalk from the west, wait at the
  // crossing for the cars' red light, cross, and go on — or the other way round. When one leaves the
  // street it comes back later as someone else (another look from a small set made once).
  const PEDESTRES = 4;
  const PED = {
    far: [ROWS.far0 * T + 11, ROWS.far0 * T + 16],          // the far sidewalk (between the lamps and the bus stop)
    near: [ROWS.walk0 * T + 22, ROWS.walk0 * T + 32],       // the near sidewalk, west of the crossing
    crossX: (CROSS.x0 + 1.5) * T,                           // the middle of the zebra crossing
    cross: 36, walk: [20, 28],                              // speeds (px/s)
  };
  const LOOKS_MAX = 8, pedSheets = [];
  const peds = [];
  // the looks are made one per frame, the first time the street shows (no hitch on the way out)
  function growLooks() {
    if (pedSheets.length >= LOOKS_MAX || !D.crew || !D.crew.api || !D.crew.api.randomProfile) return;
    pedSheets.push(DL.makeSheet(DL.crewLook(D.crew.api.randomProfile())));
  }
  // where a red light stands right now: seconds into it and seconds left (or null when it isn't red)
  function redLeft(t) {
    const cyc = SIGNAL.green + SIGNAL.amber + SIGNAL.red, k = t % cyc, r0 = SIGNAL.green + SIGNAL.amber;
    return k >= r0 ? { into: k - r0, left: cyc - k } : null;
  }
  // nobody steps onto the road while a car is still on the crossing
  const roadClear = () => !cars.some((c) => Math.abs(c.x - PED.crossX) < c.L / 2 + 3 * T);
  function startPed(p) {
    const sheet = pedSheets[Math.floor(Math.random() * pedSheets.length)];
    if (!p.a) p.a = new DL.Actor(DL.LOOKS.player, 0, 0, 'right');
    p.a.sheet = sheet;
    p.v = PED.walk[0] + Math.random() * (PED.walk[1] - PED.walk[0]);
    p.ox = (Math.random() - 0.5) * 18; // where on the crossing (not everyone on the same line)
    const kind = Math.random();
    if (TRAS && kind < 0.22) {
      // along the back avenue's near sidewalk, from one side street to the other
      const east = Math.random() < 0.5, [xa, xb] = ROAD_X.b;
      Object.assign(p, { plan: ['back'], dir: east ? 1 : -1, x: east ? xa + 8 : xb - 8, y: TRAS.walk2 * T + 6 + Math.random() * 8 });
    } else if (kind < 0.4) {
      // along the far sidewalk, from one end to the other
      const east = Math.random() < 0.5;
      Object.assign(p, { plan: ['far'], dir: east ? 1 : -1, x: east ? -30 : SW * T + 30, y: PED.far[east ? 1 : 0] });
    } else if (kind < 0.7) {
      // from the far side, west to the crossing, over the road, then west along the near sidewalk
      Object.assign(p, { plan: ['far', 'wait', 'cross', 'near'], dir: -1, x: SW * T + 30, y: PED.far[0], to: 'near' });
    } else {
      // from the west on the near sidewalk to the crossing, over the road, then along the far sidewalk
      Object.assign(p, { plan: ['near', 'wait', 'cross', 'far'], dir: 1, x: -30, y: PED.near[1], to: 'far' });
    }
    p.step = 0;
    p.a.x = p.x; p.a.y = p.y;
    p.live = true;
  }
  for (let i = 0; i < PEDESTRES; i++) peds.push({ live: false, wait: 0.5 + i * 2.2 });

  function updatePeds(dt, t) {
    growLooks();
    if (!pedSheets.length) return;
    for (const p of peds) {
      if (!p.live) { if ((p.wait -= dt) <= 0) startPed(p); continue; }
      const a = p.a, phase = p.plan[p.step];
      let mx = 0, my = 0;
      if (phase === 'far' || phase === 'near' || phase === 'back') {
        // walk along; on a route over the road, stop at the crossing
        const goal = p.plan[p.step + 1] === 'wait' ? PED.crossX + p.ox : null;
        mx = p.dir * p.v * dt;
        if (goal !== null && (goal - a.x) * p.dir <= mx * p.dir) { a.x = goal; mx = 0; p.step++; }
        const [xa, xb] = phase === 'back' ? ROAD_X.b : [-40, SW * T + 40];
        if (a.x < xa || a.x > xb) { p.live = false; p.wait = 1 + Math.random() * 5; continue; }
      } else if (phase === 'wait') {
        // wait for the cars' red, with time enough to cross, and a clear crossing
        const r = redLeft(t), dist = Math.abs((p.to === 'near' ? PED.near[0] : PED.far[1]) - a.y);
        a.dir = p.to === 'near' ? 'up' : 'down';
        if (r && r.into > 0.5 && r.left > dist / PED.cross + 0.4 && roadClear()) p.step++;
      } else if (phase === 'cross') {
        const goal = p.to === 'near' ? PED.near[0] : PED.far[1], d = goal - a.y;
        my = Math.sign(d) * Math.min(Math.abs(d), PED.cross * dt);
        if (Math.abs(d) < 0.5) { p.step++; p.dir = p.to === 'near' ? -1 : (Math.random() < 0.5 ? -1 : 1); }
      }
      a.x += mx; a.y += my;
      a.moving = !!(mx || my);
      if (a.moving) { a.dist += Math.abs(mx) + Math.abs(my); a.dir = mx ? (mx < 0 ? 'left' : 'right') : my < 0 ? 'up' : 'down'; }
      a.tick(dt);
    }
  }
  // which part of the picture each one belongs to: the near sidewalk (sorted with the player), the road,
  // or the far sidewalk (between its lamps and the square)
  const pedsOn = (where) => peds.filter((p) => p.live && p.a && (where === 'back' ? p.plan[0] === 'back' : p.plan[0] !== 'back' && (where === 'road' ? p.plan[p.step] === 'cross' : where === 'near' ? p.a.y < ROWS.road0 * T - 4 && p.plan[p.step] !== 'cross' : p.a.y > ROWS.road1 * T && p.plan[p.step] !== 'cross')));
  function drawPeds(g, sc, where) {
    const list = pedsOn(where).sort((p, q) => p.a.y - q.a.y);
    for (const p of list) {
      const X = IX(p.a.x, p.a.y) * sc.S - sc.ox, Y = IY(p.a.x, p.a.y, 0) * sc.S - sc.oy;
      if (X < -40 * sc.S || X > sc.canvas.width + 40 * sc.S || Y < -10 || Y > sc.canvas.height + 40 * sc.S) continue;
      K.drawActor(g, sc, p.a, false);
    }
  }

  // steam from the datacenter's cooling units (a few soft puffs, drawn live)
  function drawSteam(g, t) {
    const x0 = BLD.x0 * T, y0 = BLD.y0 * T, H = BLD.h + 6;
    for (let i = 0; i < 8; i++) {
      const ux = x0 + 18 + (i % 4) * 34 + 5, uy = y0 + (i < 4 ? 20 : 50) + 4;
      for (let k = 0; k < 3; k++) {
        const ph = (t * 0.33 + k / 3 + DL.hash(i * 7) ) % 1, z = H + 2 + ph * 22, s = 1 + Math.round(ph * 2);
        g.fillStyle = 'rgba(205,235,225,' + (0.22 * (1 - ph)).toFixed(3) + ')';
        g.fillRect(Math.round(IX(ux + ph * 6, uy)) - s, Math.round(IY(ux + ph * 6, uy, z)) - s, s * 2, s * 2);
      }
    }
  }

  // Scenery painted once, at one canvas pixel per iso pixel (iso.js' 2:1 projection), then scaled up by
  // the zoom with no smoothing: crisp pixels and the cost of one image per layer per frame.
  // Each layer's canvas is just big enough for what it holds (its props' footprints, plus room for the
  // tallest thing: ZMAX); its `at` says where its top-left corner is in iso pixels.
  const BAKE_AT = { S: 1, ox: 0, oy: 0 }; // iso.js' camera fields, for DL.isoKit.isoT (set per layer by bake)
  const ZMAX = 200;
  // the back avenue's cars and people go between the back blocks and the front ones: the 'back' props north
  // of the back avenue's road get a layer of their own ('tras')
  if (TRAS) for (const p of PROPS) if (p.layer === 'back' && p.rect[3] <= TRAS.road2a * T) p.layer = 'tras';
  function bake(layer) {
    const list = PROPS.filter((x) => x.layer === layer).sort((a, b) => a.key - b.key);
    if (!list.length) return null;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of list) {
      const r = p.rect;
      x0 = Math.min(x0, r[0] - r[3]); x1 = Math.max(x1, r[2] - r[1]);
      y0 = Math.min(y0, (r[0] + r[1]) / 2 - ZMAX); y1 = Math.max(y1, (r[2] + r[3]) / 2 + 12);
    }
    x0 = Math.floor(x0) - 28; y0 = Math.floor(y0) - 8; x1 = Math.ceil(x1) + 28; y1 = Math.ceil(y1) + 48;
    const c = DL.mk(x1 - x0, y1 - y0), g = c.getContext('2d');
    c.at = { S: 1, ox: x0, oy: y0 };
    BAKE_AT.ox = x0; BAKE_AT.oy = y0;
    g.lineWidth = 1;
    g.lineJoin = 'round';
    for (const p of list) { K.isoT(g, BAKE_AT); p.draw(g); }
    return c;
  }
  // tras = the back blocks and the back avenue; back = behind the player (the avenue's buildings, the yards,
  // the bridges); front = the furniture strip; far = the far curb (lamps, a traffic light, signs);
  // park = past the people on the far sidewalk (bus stop, square)
  const BAKED = { tras: bake('tras'), back: bake('back'), front: bake('front'), far: bake('far'), park: bake('park') };
  DL.Street_bakedBytes = Object.values(BAKED).reduce((n, c) => n + (c ? c.width * c.height * 4 : 0), 0); // (for the console: memory of the layers)
  function blitLayer(g, sc, img) {
    if (!img) return;
    const S = sc.S, ox = img.at.ox, oy = img.at.oy;
    g.setTransform(S, 0, 0, S, ox * S - sc.ox, oy * S - sc.oy);
    g.imageSmoothingEnabled = false;
    // only the part of the layer that is on screen
    const x0 = Math.max(0, Math.floor(sc.ox / S - ox) - 1), y0 = Math.max(0, Math.floor(sc.oy / S - oy) - 1);
    const x1 = Math.min(img.width, Math.ceil((sc.canvas.width + sc.ox) / S - ox) + 1), y1 = Math.min(img.height, Math.ceil((sc.canvas.height + sc.oy) / S - oy) + 1);
    if (x1 > x0 && y1 > y0) g.drawImage(img, x0, y0, x1 - x0, y1 - y0, x0, y0, x1 - x0, y1 - y0);
  }

  /* ---------- beyond the city: the water around it, and the far shore along the horizon ---------- */
  // The city's ground is a diamond on screen. Above the line through its north edge is the sky (daynight.js
  // paints it, with the sun, the moon and the stars); everything else outside the diamond is water. On the
  // horizon, a far shore: hills and a distant skyline (lit at night).
  const AGUA = '#0c1a2c', AGUA_RGB = '12,26,44';
  const WAVES = (() => {
    const c = DL.mk(48, 24), g = c.getContext('2d');
    for (const [x, y, w, col] of [[3, 4, 5, '#17304a'], [21, 9, 7, '#1a3650'], [36, 15, 4, '#17304a'], [10, 19, 6, '#122840'], [29, 2, 3, '#122840'], [41, 21, 5, '#1a3650']]) R(g, x, y, w, 1, col);
    return c;
  })();
  let wavePat = null;
  // the far shore, laid out once (iso px along the horizon line, which runs at IY = IX / 2)
  const SHORE = (() => {
    const Wm = SW * T, Hm = SH * T, a = -Hm - 900, b = Wm + 900, hills = [], towers = [], lights = [];
    for (let i = 0; i < 26; i++) {
      const cx = a + ((b - a) * (i + 0.5)) / 26 + (DL.hash(i * 7 + 1) - 0.5) * 60, hw = 70 + DL.hash(i * 3 + 2) * 110, h = 36 + DL.hash(i * 5 + 3) * 70;
      hills.push({ cx, hw, h });
    }
    for (let i = 0; i < 110; i++) {
      const x = a + ((b - a) * i) / 110 + DL.hash(i * 11 + 4) * 20, w = 5 + Math.round(DL.hash(i * 13 + 5) * 18), h = 8 + Math.round(DL.hash(i * 17 + 6) * 46);
      towers.push({ x, w, h });
      for (let k = 0; k < h / 6; k++) if (DL.hash(i * 31 + k * 7) < 0.35) lights.push({ x: x + 1 + Math.floor(DL.hash(i * 37 + k * 3) * (w - 2)), y: -2 - Math.floor(DL.hash(i * 41 + k * 5) * (h - 4)) });
    }
    return { hills, towers, lights };
  })();
  const vista = (sc) => ({ x: sc.ox / sc.S, y: sc.oy / sc.S, w: sc.canvas.width / sc.S, h: sc.canvas.height / sc.S });
  const mixRgb = (p, q, k) => [p[0] + (q[0] - p[0]) * k, p[1] + (q[1] - p[1]) * k, p[2] + (q[2] - p[2]) * k];
  const rgbCss = (c) => 'rgb(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ')';
  function drawBeyond(g, sc) {
    const Wm = SW * T, Hm = SH * T, v = vista(sc), L = v.x - 20, Rr = v.x + v.w + 20, B = v.y + v.h + 20, Tp = v.y - 20;
    K.isoT(g, sc);
    // the water: outside the diamond, below the horizon line (even-odd: the diamond is cut out)
    g.beginPath();
    g.moveTo(L, L / 2); g.lineTo(Rr, Rr / 2); g.lineTo(Rr, B); g.lineTo(L, B); g.closePath();
    g.moveTo(0, 0); g.lineTo(Wm, Wm / 2); g.lineTo(Wm - Hm, (Wm + Hm) / 2); g.lineTo(-Hm, Hm / 2); g.closePath();
    g.fillStyle = AGUA;
    g.fill('evenodd');
    if (!longe(sc)) {
      // the waves drift slowly; (the pattern follows the transform, the path stays where it is)
      if (!wavePat) wavePat = g.createPattern(WAVES, 'repeat');
      g.save();
      g.translate(Math.floor((sc.t * 3) % 48), 0);
      g.fillStyle = wavePat;
      g.fill('evenodd');
      g.restore();
    }
    // the far shore, only when the horizon is on screen (the sky above the line is daynight.js')
    if (Tp > Rr / 2 && Tp > L / 2) return;
    const luz = DL.DayNight && DL.DayNight.luz ? DL.DayNight.luz() : null;
    const hor = luz ? luz.horizonte : [150, 120, 140], noite = luz ? luz.noite : 0;
    g.save();
    g.beginPath();
    g.moveTo(L, L / 2); g.lineTo(Rr, Rr / 2); g.lineTo(Rr, Tp); g.lineTo(L, Tp); g.closePath();
    g.clip();
    g.fillStyle = rgbCss(mixRgb(hor, [22, 24, 44], 0.62));
    for (const h of SHORE.hills) {
      if (h.cx + h.hw < L || h.cx - h.hw > Rr) continue;
      g.beginPath(); g.moveTo(h.cx - h.hw, (h.cx - h.hw) / 2); g.lineTo(h.cx, h.cx / 2 - h.h); g.lineTo(h.cx + h.hw, (h.cx + h.hw) / 2); g.closePath(); g.fill();
    }
    g.fillStyle = rgbCss(mixRgb(hor, [12, 14, 28], 0.78));
    for (const t of SHORE.towers) {
      if (t.x + t.w < L || t.x > Rr) continue;
      const yb = (t.x + t.w) / 2 + 1;
      g.fillRect(Math.round(t.x), Math.round(yb - t.h), t.w, t.h);
    }
    if (noite > 0.05) {
      g.fillStyle = 'rgba(255,217,138,' + (0.85 * noite).toFixed(3) + ')';
      for (const t of SHORE.towers) if (t.x + t.w >= L && t.x <= Rr) for (const l of SHORE.lights) if (l.x >= t.x && l.x < t.x + t.w) g.fillRect(l.x, Math.round((t.x + t.w) / 2 + 1 + l.y), 1, 1);
    }
    g.restore();
  }
  // the fog at the end of each bridge (over the cars): the deck fades into the water's colour
  function drawFog(g, sc) {
    for (const p of PONTES) {
      const len = 7 * T, far = p.west ? p.x0 - 900 : p.x1 + 900, edge = p.west ? p.x0 + 2 * T : p.x1 - 2 * T, end = p.west ? edge + len : edge - len;
      if (p.west ? IX(end, p.y0) < vista(sc).x - 60 : IX(end, p.y1) > vista(sc).x + vista(sc).w + 60) continue;
      sc.groundTransform(g);
      const gr = g.createLinearGradient(edge, 0, end, 0);
      gr.addColorStop(0, AGUA); gr.addColorStop(1, 'rgba(' + AGUA_RGB + ',0)');
      g.fillStyle = gr;
      g.fillRect(Math.min(far, end), p.y0 - 80, Math.abs(end - far), p.y1 - p.y0 + 160);
    }
  }

  // behind the people: the far shore and the water, the shadows on the ground (daynight.js: street.shadows),
  // the back blocks with the back avenue's cars and people, the avenue's buildings, then the datacenter's door
  // (the opening scene adds a sky before them, and the door's light, a long shadow and dust after them)
  street.underlay = (g, sc) => {
    if (ST.intro) introSky(g, sc);
    drawBeyond(g, sc);
    if (street.shadows) street.shadows(g, sc);
    if (BAKED.tras) { blitLayer(g, sc, BAKED.tras); drawPeds(g, sc, 'back'); drawCars(g, sc, 'b'); }
    blitLayer(g, sc, BAKED.back); K.isoT(g, sc);
    if (!longe(sc)) { drawBuildingLights(g, sc.t); drawSteam(g, sc.t); }
    drawSign(g, sc); frontDoor(g, sc, sc.t);
    drawLojas(g, sc); K.isoT(g, sc);
    if (ST.intro) introGround(g, sc);
  };
  // now and then a neighbour's window lights up or goes dark (about half of them are lit at any time)
  const BACK_G = BAKED.back.getContext('2d');
  let winClock = 0;
  function flipWindows(dt) {
    winClock += dt;
    while (winClock > 0.3) {
      winClock -= 0.3;
      // (daynight.js: few lit by day, most of them at night; without it, about half)
      const chance = DL.DayNight ? DL.DayNight.windowChance() : 0.5;
      const w = WINDOWS[Math.floor(Math.random() * WINDOWS.length)], lit = Math.random() < chance;
      if (w && w.lit !== lit) { w.lit = lit; paintWindow(BACK_G, w, BAKED.back.at); }
    }
  }
  // in front of them: the furniture strip, the works, then the works' blinking light
  // then the cars on the road, then across the road: lamps, the bus stop, the square
  street.overlay = (g, sc) => {
    const far = longe(sc);
    blitLayer(g, sc, BAKED.front);
    K.isoT(g, sc);
    if (!far) { worksLight(g, sc.t); drawSignals(g, sc.t, 'front'); }
    drawCars(g, sc, 'a');
    drawPeds(g, sc, 'road');
    blitLayer(g, sc, BAKED.far);
    drawFog(g, sc);
    K.isoT(g, sc);
    if (!far) drawSignals(g, sc.t, 'far');
    drawPeds(g, sc, 'far');
    blitLayer(g, sc, BAKED.park);
    K.isoT(g, sc);
    if (!far) g.drawImage(STOP_ART, Math.round(IX(BUS_X + 3 * T - 1, ROWS.far1 * T + 8) - 8), Math.round(IY(BUS_X + 3 * T - 1, ROWS.far1 * T + 8, 33)));
    if (ST.intro) introBirds(g, sc);
    drawLojaArrows(g, sc);
  };

  /* ------------------------------------------------------------------ */
  /* the datacenter's name, in neon on the facade                        */
  /* ------------------------------------------------------------------ */
  // The name is only ever drawn into a canvas (never put into the page as HTML). Allowed: letters, numbers,
  // space and hyphen; accents are dropped (Ç → C); up to NOME_MAX characters. Empty → "DATALAB".
  const NOME_MAX = 20;
  const NOME_PADRAO = 'DATALAB';
  // what the player is typing (keeps a trailing space, so words can be typed one after the other)
  function cleanTyping(s) {
    return String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 -]/g, '')
      .replace(/^\s+/, '').replace(/\s{2,}/g, ' ').slice(0, NOME_MAX);
  }
  const cleanName = (s) => cleanTyping(s).trim();
  // the names a game gets when nobody typed one: the sign shows DATALAB for them
  const DEFAULTS = new Set(['meu datacenter'].concat(Object.values(DL.PRESETS || {}).map((p) => String((p && p.name) || '').toLowerCase())));
  const nameField = () => document.getElementById('dcName');
  let typedName = '';   // the name typed on the start card for this game (games without an account use it)
  let renamed = '';     // a name changed in the game, until the save that carries it comes back
  // the name on the sign: in someone else's room, the host's; otherwise this game's
  function signName() {
    let n;
    if (DL.MP && DL.MP.role === 'guest') n = DL.MP.hostDc;
    else n = renamed || (DL.SaveService && DL.SaveService.slot && DL.SaveService.name) || typedName;
    n = cleanName(n);
    return !n || DEFAULTS.has(n.toLowerCase()) ? NOME_PADRAO : n.toUpperCase();
  }

  // the panel on the facade (dcBuilding): ~180 × 24 art pixels; the letters use the 3×5 pixel font as big
  // as fits on one line (4×, then 3×), then 2× on two lines, otherwise at normal size
  // (PANEL: where the name sign sits on the facade — defined next to BLD)
  function layoutName(text) {
    const fits = (s, k) => s.length * 4 * k - k <= PANEL.w - 8;
    for (const k of [4, 3]) if (fits(text, k)) return { k, lines: [text] };
    if (fits(text, 2) && text.length <= 12) return { k: 2, lines: [text] };
    // two lines: the split where the longer line is the shortest
    const words = text.split(' ');
    let best = null;
    for (let i = 1; i < words.length; i++) {
      const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
      if (fits(a, 2) && fits(b, 2) && (!best || Math.max(a.length, b.length) < best.m)) best = { m: Math.max(a.length, b.length), lines: [a, b] };
    }
    return best ? { k: 2, lines: best.lines } : fits(text, 2) ? { k: 2, lines: [text] } : { k: 1, lines: [text] };
  }
  const c0w = (line, k) => line.length * 4 * k;
  function signArt(text, lit) {
    const c = DL.mk(PANEL.w, PANEL.h), g = c.getContext('2d'), L = layoutName(text), k = L.k;
    const lh = 5 * k, gap = k, total = L.lines.length * lh + (L.lines.length - 1) * gap * 2;
    let y = Math.round((PANEL.h - total) / 2);
    for (const line of L.lines) {
      const w = line.length * 4 * k - k, x = Math.round((PANEL.w - w) / 2);
      if (lit) {
        // the glow: the letters smeared one pixel around, dim, then the bright tubes on top
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) DL.pixText(g, line, x + dx, y + dy, 'rgba(61,255,162,0.35)', k);
        DL.pixText(g, line, x, y, '#3dffa2', k);
        // the tubes' hot core: a lighter line through the middle of each stroke (big letters only)
        if (k >= 3) { const c = DL.mk(c0w(line, k), 5 * k), cg = c.getContext('2d'); DL.pixText(cg, line, 0, 0, '#d8ffec', k); cg.globalCompositeOperation = 'destination-in'; cg.beginPath(); for (let yy = 0; yy < 5; yy++) cg.rect(0, yy * k + 1, c.width, k - 2); cg.fill(); g.drawImage(c, x, y); }
      } else DL.pixText(g, line, x, y, '#145c3d', k);
      y += lh + gap * 2;
    }
    return c;
  }
  // drawn again only when the name changes
  const SIGN = { text: null, on: null, off: null };
  function signFor(text) {
    if (SIGN.text !== text) Object.assign(SIGN, { text, on: signArt(text, true), off: signArt(text, false) });
    return SIGN;
  }
  // mostly lit; now and then a short flicker (in the opening scene the scene says when: see introSignLit)
  const signLit = (t) => (ST.intro ? introSignLit() : !(DL.hash(Math.floor(t * 9)) < 0.035 || (t % 11 > 10.6 && Math.floor(t * 14) % 2)));
  function drawSign(g, sc) {
    const s = signFor(signName());
    DL.isoMap(g, sc, [PANEL.x, BLD.y1 * T + 0.3, PANEL.z], [1, 0, 0], [0, 0, -1]);
    g.imageSmoothingEnabled = false;
    g.drawImage(signLit(sc.t) ? s.on : s.off, 0, 0);
  }

  // the start card's field: only allowed characters get in, and the keys don't move the player
  (function hookField() {
    const f = nameField();
    if (!f) return;
    f.maxLength = NOME_MAX;
    f.addEventListener('keydown', (ev) => ev.stopPropagation());
    f.addEventListener('input', () => { const v = cleanTyping(f.value); if (v !== f.value) f.value = v; });
  })();
  G.on('game-begin', () => { typedName = cleanName((nameField() || {}).value); renamed = ''; });

  // renaming during the game (Conta → Saves): the sign changes at once, the save carries it to the account
  async function rename(raw) {
    const n = cleanName(raw);
    if (!n) return { ok: false, message: 'Digite um nome: letras, números, espaço ou hífen.' };
    renamed = n;
    typedName = n;
    if (!(DL.SaveService && DL.SaveService.slot)) return { ok: true, name: n };
    const r = await DL.SaveService.save({ name: n });
    if (r.ok) renamed = '';
    return Object.assign({ name: n }, r);
  }
  DL.DcName = {
    MAX: NOME_MAX, clean: cleanName, cleanTyping, rename,
    // the name a new game takes (cloud-sync.js): what was typed on the start card, if anything
    get typed() { return cleanName((nameField() || {}).value); },
    get sign() { return signName(); },
    // the name this datacenter is known by (the multiplayer host sends it to the guests)
    get current() { return renamed || (DL.SaveService && DL.SaveService.slot && DL.SaveService.name) || typedName || ''; },
  };

  // any position → a spot on the walkable sidewalk (saves, other players, lag, old data)
  function clampFeet(x, y) {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { x: SPAWN.x, y: SPAWN.y };
    return { x: clamp(x, FEET.x0, FEET.x1), y: clamp(y, FEET.y0, FEET.y1) };
  }

  /* ------------------------------------------------------------------ */
  /* going out and coming in                                             */
  /* ------------------------------------------------------------------ */
  const FADE = 0.26; // seconds to fade out, the same to fade in
  function aim() { scene.cam.x = player.x - 7; scene.cam.y = player.y - 7; } // demo.js' camera follows from here
  function arrive(to) {
    const de = ST.where, from = PLACES[ST.where];
    if (from && from.leave) from.leave();
    ST.where = to;
    // the room changed: every speech bubble from the room left behind goes (crew.js listens)
    G.emit('sala', { de, para: to });
    const pl = PLACES[to];
    if (pl) {
      // into a shop: just inside its door, looking in
      if (ST.keepS == null) ST.keepS = scene.S;
      player.x = pl.spawn.x; player.y = pl.spawn.y; player.dir = 'up';
      player.hidden = true;
      if (pl.enter) pl.enter();
    } else if (to === 'rua') {
      // back out of a shop: on the sidewalk in front of its door; from the datacenter: at its front door
      const f = from && LOJA_FRONTS.find((x) => x.lugar === from.id);
      if (ST.keepS != null) { scene.S = ST.keepS; ST.keepS = null; }
      player.x = f ? f.mid : SPAWN.x; player.y = SPAWN.y; player.dir = 'down';
      player.hidden = true; // hidden in the datacenter, drawn in the street
      ST.signsAt = scene.t;
      if (ST.hlPend > 0) { ST.hl = { until: scene.t + ST.hlPend }; ST.hlPend = 0; }
    } else {
      ST.keepS = null;
      const d = scene.world.exitDoor;
      const p = d ? { x: (d.tx + 1) * T + 9, y: d.ty * T + 11 } : scene.world.spawn;
      player.x = p.x; player.y = p.y; player.dir = 'right';
      player.hidden = false;
      scene.resize(); // its own zoom again (renderStreet may have held it closer)
    }
    player.vx = player.vy = 0;
    player.moving = false;
    // the pet comes along (it finds its place behind the player on its own)
    const pet = D.pet && D.pet.actor;
    if (pet) { pet.x = player.x; pet.y = player.y; pet.moving = false; }
    aim();
    G.root.classList.toggle('is-street', to !== 'dentro');
  }
  // opts.dur: seconds to fade out (the same to fade in); opts.black: a plain fade to black (the opening scene)
  function go(to, instant, opts) {
    if (to === ST.where && !ST.fade) return;
    if (instant) { ST.fade = null; arrive(to); return; }
    if (ST.fade) return;
    ST.fade = { to, t: 0, swapped: false, dur: (opts && opts.dur) || FADE, black: !!(opts && opts.black) };
    DL.audio.play('click');
  }
  // back to the datacenter without a fade, as on a new game (the world under the player was replaced)
  function reset() {
    ST.fade = null;
    const pl = place();
    if (pl && pl.leave) pl.leave();
    const de = ST.where;
    ST.where = 'dentro';
    if (de !== 'dentro') G.emit('sala', { de, para: 'dentro' });
    ST.keepS = null;
    ST.hl = null;
    if (ST.intro) endIntro();
    player.hidden = false;
    G.root.classList.remove('is-street');
  }

  /* ------------------------------------------------------------------ */
  /* the opening scene: a short film, shot by shot                        */
  /* ------------------------------------------------------------------ */
  // About 16 s, played once when a new world is created (demo.js' begin → intro(then)); a loaded world
  // never shows it. Five shots (planos), one after the other, like a short film:
  //   1 planoCaminhando — the character walks along the sidewalk at dusk, the camera follows him; the sky,
  //                       the clouds and the sun slide by slower than the buildings (parallax)
  //   2 planoRosto      — close-up of the face: the character's own sprite blown up into a big pixel
  //                       portrait; blinks, breathes, looks to the side and up; wind in the hair
  //   3 planoLetreiro   — what he sees: the facade from below, the neon sign flickering and switching on
  //   4 planoDecide     — from behind, facing the building: a breath, stands straight; the camera creeps
  //                       to the door
  //   5 planoEntrando   — walks to the door, it slides open, light pours out, he goes in
  // Then the screen fades to black and comes back inside the room. EVERY TIME IS IN `TEMPOS` (just below).
  // Each shot is a function run every frame with (I, k, t, dt): k = 0…1 through the shot, t = seconds into
  // it. Shots 2 and 3 are their own pictures (desenho*), drawn instead of the street.
  // Space, Enter or a click skip straight to the fade; the game's own keys and clicks are off until the
  // end. `then` (the tutorial or build mode) is called once the room is back.
  const TEMPOS = {
    // how long each shot lasts (s) — the film is the sum of the five (now 16 s)
    caminhando: 4.0,
    rosto: 3.0,
    letreiro: 3.0,
    decide: 2.0,
    entrando: 4.0,
    // between two shots: a quick dip to black this long (s); 0 = a straight cut
    corte: 0.3,
    // the whole film
    abrir: 0.6,          // fades in from black at the very start (s)
    barras: 0.7,         // the black bars slide in (s); they slide out again as the room fades in
    fadeFinal: 0.6,      // to black at the end, or on a skip (s); the room fades in in the same time
    seguir: 2.6,         // how quickly the camera catches up while following (higher = tighter)
    // inside planoRosto (s from the start of that shot)
    rostoOlhaLado: 0.9,             // the eyes turn to the side…
    rostoOlhaCima: 1.9,             // …then up, towards the sign
    rostoPiscar: [0.55, 1.6, 2.5],  // when he blinks
    rostoNeon: 2.45,                // the sign's green light starts flickering on his face
    // inside planoLetreiro (s from the start of that shot)
    neon: [0.35, 1.5],   // the neon starts flickering … and stays on
    subir: 1.6,          // the camera tilts up from the server floor to the sign in this long
    // inside planoEntrando (s from the start of that shot)
    andarPorta: [0, 1.9],  // walks to the door
    portaAbre: [1.6, 2.2], // the door slides open
    entrar: [2.1, 3.5],    // steps through the doorway
    sumir: [2.6, 3.6],     // fades into the light
  };
  const PLANOS = [
    { nome: 'caminhando', run: planoCaminhando },
    { nome: 'rosto', run: planoRosto, desenho: desenhoRosto },
    { nome: 'letreiro', run: planoLetreiro, desenho: desenhoLetreiro },
    { nome: 'decide', run: planoDecide },
    { nome: 'entrando', run: planoEntrando },
  ];
  // when a shot starts (s from the start of the film)
  function inicio(nome) {
    let t = 0;
    for (const p of PLANOS) { if (p.nome === nome) return t; t += TEMPOS[p.nome]; }
    return t;
  }

  // where things are: the walk starts well west of the door, along the road side of the sidewalk, and
  // stops a little before it
  const INTRO_DOOR = { x: DOOR_X * T + 8, y: SPAWN.y - 3 };       // the doorstep
  const INTRO_START = { x: INTRO_DOOR.x - 150, y: FEET.y1 - 1 };  // shot 1 starts here…
  const INTRO_STOP = { x: INTRO_DOOR.x - 28, y: FEET.y1 - 1 };    // …and stops here (shots 2–4)
  const INTRO_INSIDE_Y = BLD.y1 * T + 1;                           // through the door (fading out)
  const SIGN_AT = { x: PANEL.x + PANEL.w / 2, y: BLD.y1 * T, z: PANEL.z - PANEL.h / 2 };

  const span = (t, a, b) => clamp((t - a) / (b - a), 0, 1);
  const ease = (k) => k * k * (3 - 2 * k);                                                  // smoothstep
  const easeInOut = (k) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);   // slower start and end
  const lerp = (a, b, k) => a + (b - a) * k;

  /* ---------- the camera on the street: a point on screen (iso pixels) and a zoom, glided, never snapped ---------- */
  // the zoom of a shot for this screen: close = the character and the facade fill the space between the bars
  function shotScale() {
    const cw = scene.canvas.width, ch = scene.canvas.height;
    return Math.max(Math.max(cw / 760, ch / 480) * 1.25, ch / 200);
  }
  const camAt = (x, y, z, s) => ({ X: IX(x, y), Y: IY(x, y, z), S: shotScale() * s });
  const mixCam = (a, b, k) => ({ X: lerp(a.X, b.X, k), Y: lerp(a.Y, b.Y, k), S: a.S * Math.pow(b.S / a.S, k) });
  // shot 1: beside the character, a little ahead of him (room to walk into), the facade behind him
  const walkShot = (px, py) => camAt(px + 22, py - 8, 26, 0.95);
  // iso.js' camera centres the screen on (cam.x − cam.y, (cam.x + cam.y) / 2); the zoom goes in renderStreet
  function applyCam(c) { scene.cam.x = c.Y + c.X / 2; scene.cam.y = c.Y - c.X / 2; }
  function followCam(I, dt) {
    const T0 = I.target;
    if (!T0) return;
    const k = 1 - Math.exp(-dt * TEMPOS.seguir);
    I.cam.X += (T0.X - I.cam.X) * k;
    I.cam.Y += (T0.Y - I.cam.Y) * k;
    I.cam.S *= Math.pow(T0.S / I.cam.S, k); // zoom glides evenly (in steps of ratio, not of size)
  }

  /* ---------- the shots ---------- */
  // a slow breath while standing: the body rises a hair and settles
  const idleBob = (t) => 0.3 * (0.5 - 0.5 * Math.cos(t * Math.PI));
  function standStill(I, dir) {
    player.moving = false;
    player.dir = dir;
    player.z = idleBob(I.t);
  }
  // a walk at an even pace that slows to a stop over its last part (0…1 → 0…1)
  function walkEase(k, s) {
    const d = k - s;
    return (k <= s ? k : s + d - (d * d) / (2 * (1 - s))) / (s + (1 - s) / 2);
  }
  // 1 · walking along the sidewalk towards the datacenter; the camera follows from the side, a step behind
  function planoCaminhando(I, k) {
    const x = lerp(INTRO_START.x, INTRO_STOP.x, walkEase(k, 0.72));
    walkTo(I, x, INTRO_STOP.y, 'right');
    player.z = 0;
    I.target = walkShot(player.x, player.y);
  }
  // 2 · the face, close up (desenhoRosto draws it); on the street he stands still, the wind picks up
  function planoRosto(I) {
    if (I.novo) DL.audio.play('vento');
    player.x = INTRO_STOP.x; player.y = INTRO_STOP.y;
    standStill(I, 'up');
    I.target = null;
  }
  // 3 · what he sees: the sign (desenhoLetreiro draws it; the neon's clicks are in introStep)
  function planoLetreiro(I) {
    standStill(I, 'up');
  }
  // 4 · from behind, facing the building: a deep breath, a small straightening up; the camera creeps
  //     from his back to the door (slow start, slow end)
  function planoDecide(I, k, t) {
    const breath = 0.7 * Math.sin(Math.PI * span(t, 0.15, 1.1)), straighten = 0.5 * Math.sin(Math.PI * span(t, 1.15, 1.45));
    player.moving = false;
    player.dir = 'up';
    player.z = idleBob(I.t) + breath + straighten;
    const from = camAt(INTRO_STOP.x, INTRO_STOP.y, 16, 1.08);
    const to = mixCam(from, camAt(INTRO_DOOR.x, BLD.y1 * T, 16, 1), 0.6);
    to.S = shotScale() * 1.45;
    I.cam = mixCam(from, to, easeInOut(k));
    I.target = null;
  }
  // 5 · walks to the door along a gentle curve (eases into the walk and out of it); the door slides open,
  //     light pours out onto the sidewalk; he steps in and fades into the light (the pet too).
  //     Then the fade to black (leaveIntro).
  function planoEntrando(I, k, t) {
    const E = TEMPOS;
    if (I.novo) I.cam = mixCam(camAt(INTRO_STOP.x, INTRO_STOP.y, 14, 1.15), camAt(INTRO_DOOR.x, INTRO_DOOR.y, 14, 1.15), 0.4);
    if (t < E.entrar[0]) {
      const u = easeInOut(span(t, E.andarPorta[0], E.andarPorta[1])), v = 1 - u;
      const x = v * v * INTRO_STOP.x + 2 * u * v * INTRO_DOOR.x + u * u * INTRO_DOOR.x;
      const y = v * v * INTRO_STOP.y + 2 * u * v * INTRO_STOP.y + u * u * INTRO_DOOR.y;
      walkTo(I, x, y);
    } else walkTo(I, INTRO_DOOR.x, INTRO_DOOR.y + (INTRO_INSIDE_Y - INTRO_DOOR.y) * ease(span(t, E.entrar[0], E.entrar[1])), 'up');
    if (t >= E.portaAbre[0] && !I.doorSound) { I.doorSound = true; DL.audio.play('porta'); }
    I.door = easeInOut(span(t, E.portaAbre[0], E.portaAbre[1]));
    const fade = 1 - ease(span(t, E.sumir[0], E.sumir[1])), pet = D.pet && D.pet.actor;
    player.alpha = (I.saved.alpha == null ? 1 : I.saved.alpha) * fade;
    if (pet) pet.alpha = (I.saved.petAlpha == null ? 1 : I.saved.petAlpha) * fade;
    player.z *= 0.8;
    const c = mixCam(camAt(player.x, player.y, 14, 1), camAt(INTRO_DOOR.x, INTRO_DOOR.y, 14, 1), 0.5);
    c.S = shotScale() * (1.15 + 0.2 * ease(k));
    I.target = c;
  }
  // one frame of walking: faces where it goes, counts the distance (walk frames), a step sound and a
  // puff of dust every stride
  function walkTo(I, x, y, dir) {
    const dx = x - player.x, dy = y - player.y, d = Math.hypot(dx, dy);
    player.x = x; player.y = y;
    player.moving = d > 0.005;
    if (!player.moving) return;
    player.dir = dir || (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up');
    const before = player.dist || 0;
    player.dist = before + d;
    if (Math.floor(player.dist / 13) !== Math.floor(before / 13)) { DL.audio.play('foot'); puff(I, x, y); }
  }

  /* ---------- what runs alongside the shots ---------- */
  // the neon sign switching on (shot 3): moments it is lit, as fractions of TEMPOS.neon; then it stays on.
  // Before shot 3 it is off — he has not looked at it yet.
  const NEON_LIGA = [[0, 0.06], [0.22, 0.27], [0.45, 0.62], [0.78, 0.83], [0.95, 1]];
  function introSignLit() {
    const I = ST.intro, t0 = inicio('letreiro'), a = t0 + TEMPOS.neon[0], b = t0 + TEMPOS.neon[1];
    if (I.t >= b) return true;
    if (I.t < a) return false;
    const k = (I.t - a) / (b - a);
    return NEON_LIGA.some(([x, y]) => k >= x && k < y);
  }
  // dust at the feet: a few pixels kicked up at each stride, drifting and fading
  function puff(I, x, y) {
    if (I.dust.length > 24) return;
    for (let i = 0; i < 3; i++) {
      I.dust.push({ x: x + (Math.random() - 0.5) * 6, y: y + 1 + Math.random() * 2, z: 0, vx: (Math.random() - 0.5) * 10, vy: Math.random() * 5, vz: 5 + Math.random() * 5, t: 0, life: 0.45 + Math.random() * 0.3 });
    }
  }
  function updateDust(I, dt) {
    for (const p of I.dust) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt; p.vz *= Math.exp(-dt * 5); }
    I.dust = I.dust.filter((p) => p.t < p.life);
  }

  /* ---------- the street at dusk: sky, clouds, birds, the door's light, the long shadow ---------- */
  // a violet-to-orange sky behind the roofs, a low sun, clouds drifting (drawn only where the city's ground
  // ends, so the buildings cover them like a real skyline). Parallax: while the camera follows the walk,
  // the sun and the clouds come along part of the way (p), so they slide by slower than the buildings.
  const CLOUD_PAL = { a: '#ffc3a0', b: '#d98a96', c: '#9a5a86' };
  const CLOUD_ART = [sprite(26, 7, [
    '........aaaa..............',
    '.....aaabbbbaa...aaa......',
    '...aabbbbbbbbbaaabbbaa....',
    '.aabbbbbbbbbbbbbbbbbbbaa..',
    'abbbbbbbbbbbbbbbbbbbbbbba.',
    '.cccbbbbbbbbbbbbbbbbbcccc.',
    '....cccccccccccccccccc....',
  ], CLOUD_PAL), sprite(18, 5, [
    '....aaa...aa......',
    '..aabbbaaabbaa....',
    'aabbbbbbbbbbbbaa..',
    '.ccbbbbbbbbbbbccc.',
    '...cccccccccccc...',
  ], CLOUD_PAL)];
  const SKY_Y = IY(DOOR_X * T, BLD.y1 * T, 40); // the horizon, behind the buildings (iso pixels)
  const CLOUDS = [];
  for (let i = 0; i < 7; i++) CLOUDS.push({ x: DL.hash(i * 11 + 3) * 1100 - 150, y: SKY_Y - 70 - DL.hash(i * 7 + 2) * 170, v: 3 + DL.hash(i * 5 + 1) * 6, img: CLOUD_ART[i % 2], s: i % 3 === 0 ? 2 : 1, p: 0.35 + DL.hash(i * 3 + 7) * 0.35 });
  const PARALLAX_SOL = 0.85;
  // how far the camera has moved sideways since the film started (iso pixels)
  const camMoved = (I) => I.cam.X - I.camX0;
  function introSky(g, sc) {
    const I = ST.intro, Wm = SW * T, Hm = SH * T, m = camMoved(I);
    K.isoT(g, sc);
    g.save();
    // the part of the screen above the horizon (the line through the far edge of the city's ground)
    g.beginPath();
    g.moveTo(-Hm - 2000, (-Hm - 2000) / 2); g.lineTo(Wm + 2000, (Wm + 2000) / 2); g.lineTo(Wm + 2000, -3000); g.lineTo(-Hm - 2000, -3000);
    g.closePath();
    g.clip();
    const sky = g.createLinearGradient(0, SKY_Y - 380, 0, SKY_Y);
    sky.addColorStop(0, '#1b1638'); sky.addColorStop(0.45, '#4a2a5e'); sky.addColorStop(0.78, '#a84a5a'); sky.addColorStop(1, '#ffa060');
    g.fillStyle = sky;
    g.fillRect(-Hm - 2000, -3000, Wm + Hm + 4000, (Wm + 2000) / 2 + 3000);
    // the sun, low behind the roofs east of the datacenter (the farthest thing: it moves the least)
    const sx = IX(SIGN_AT.x, SIGN_AT.y) + 170 + m * PARALLAX_SOL, sun = g.createRadialGradient(sx, SKY_Y - 30, 0, sx, SKY_Y - 30, 110);
    sun.addColorStop(0, 'rgba(255,214,150,0.75)'); sun.addColorStop(0.15, 'rgba(255,190,120,0.45)'); sun.addColorStop(1, 'rgba(255,150,90,0)');
    g.fillStyle = sun;
    g.fillRect(sx - 110, SKY_Y - 140, 220, 220);
    g.imageSmoothingEnabled = false;
    for (const c of CLOUDS) {
      const x = ((c.x + I.t * c.v + m * c.p) % 1300 + 1300) % 1300 - 150;
      g.drawImage(c.img, Math.round(x), Math.round(c.y), c.img.width * c.s, c.img.height * c.s);
    }
    g.restore();
  }
  // a small flock crossing the sky (drawn over everything, wings flapping; halfway between sky and city)
  const BIRD_UP = [[0, 0], [1, 1], [2, 2], [3, 1], [4, 0]], BIRD_DOWN = [[0, 2], [1, 1], [2, 2], [3, 1], [4, 2]];
  const FLOCK = [[0, 0], [-9, 5], [-8, -6], [-18, 9], [-17, -11]];
  function introBirds(g, sc) {
    const I = ST.intro, m = camMoved(I) * 0.5;
    K.isoT(g, sc);
    g.fillStyle = '#2a1a30';
    FLOCK.forEach(([ox, oy], i) => {
      const x = IX(SIGN_AT.x, SIGN_AT.y) - 300 + I.t * 30 + ox + m, y = SKY_Y - 175 + oy + Math.sin(I.t * 1.3 + i) * 2;
      for (const [px, py] of Math.floor(I.t * 6 + i * 1.7) % 2 ? BIRD_UP : BIRD_DOWN) g.fillRect(Math.round(x) + px, Math.round(y) + py, 1, 1);
    });
  }
  // on the ground, after the buildings and before the people: the light pouring out of the open door,
  // the character's long dusk shadow, the dust at the feet
  function introGround(g, sc) {
    const I = ST.intro, S = sc.S, y = BLD.y1 * T;
    const ground = () => g.setTransform(S, S / 2, -S, S / 2, -sc.ox, -sc.oy);
    if (I.door > 0) {
      ground();
      g.globalCompositeOperation = 'lighter';
      const beam = g.createLinearGradient(0, y, 0, y + 46);
      beam.addColorStop(0, 'rgba(190,255,225,' + (0.4 * I.door).toFixed(3) + ')');
      beam.addColorStop(1, 'rgba(190,255,225,0)');
      g.fillStyle = beam;
      g.beginPath();
      g.moveTo(DOOR_X * T + 2, y); g.lineTo(DOOR_X * T + 14, y); g.lineTo(DOOR_X * T + 26, y + 46); g.lineTo(DOOR_X * T - 10, y + 46);
      g.closePath();
      g.fill();
      DL.pool(g, DOOR_X * T + 8, y + 6, 30, 'rgba(200,255,230,' + (0.3 * I.door).toFixed(3) + ')');
      // and a glow around the doorway itself
      K.isoT(g, sc);
      const gx = IX(DOOR_X * T + 8, y), gy = IY(DOOR_X * T + 8, y, 13), glow = g.createRadialGradient(gx, gy, 0, gx, gy, 24);
      glow.addColorStop(0, 'rgba(200,255,230,' + (0.35 * I.door).toFixed(3) + ')');
      glow.addColorStop(1, 'rgba(200,255,230,0)');
      g.fillStyle = glow;
      g.fillRect(gx - 24, gy - 24, 48, 48);
      g.globalCompositeOperation = 'source-over';
    }
    // the sun is low behind the buildings: a long, soft shadow towards the street
    const a = player.alpha == null ? 1 : player.alpha;
    if (a > 0.02) {
      ground();
      g.fillStyle = 'rgba(20,8,40,' + (0.22 * a).toFixed(3) + ')';
      g.beginPath();
      g.ellipse(player.x + 1, player.y + 10, 4, 10, 0, 0, Math.PI * 2);
      g.fill();
    }
    if (I.dust.length) {
      K.isoT(g, sc);
      for (const p of I.dust) {
        g.fillStyle = 'rgba(214,190,205,' + (0.55 * (1 - p.t / p.life)).toFixed(3) + ')';
        g.fillRect(Math.round(IX(p.x, p.y)), Math.round(IY(p.x, p.y, p.z)), 1, 1);
      }
    }
  }
  // the door, opening (art pixels of doorArt, over the closed door): the leaf slides into the wall and the
  // doorway fills with the light from inside
  function doorOpening(g, k) {
    const x0 = 2, y0 = 12, w = 12, h = 24;
    g.globalAlpha = k;
    R(g, x0, y0, w, h, '#bff5dc');
    R(g, x0 + 1, y0 + 2, w - 2, h - 2, '#eafff5');
    g.globalAlpha = 1;
    const lw = Math.round(w * (1 - k));
    if (lw > 0) { R(g, x0, y0, lw, h, PAL.leaf); R(g, x0 + lw - 1, y0, 1, h, PAL.leafHi); }
  }

  /* ---------- shot 2: the face, close up ---------- */
  // The character's own sprite facing the camera (with their hair, hat and accessories): its head and
  // shoulders blown up 2× into a portrait, then the eyes drawn again a little finer so they can blink and
  // look around. Looks whose eyes are covered (sunglasses, masks) keep the sprite's own eyes and blink frame.
  const EYE = '#121218';
  const PORT = { CX: 1, W: 20, H: 24 }; // the part of the 22 × 31 sprite used (sprite px, from the top)
  function buildPortrait() {
    const sh = player.sheet.down, src = sh.idle, w = PORT.W * 2, h = PORT.H * 2;
    const crop = (img) => {
      const c = DL.mk(w, h), g = c.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(img, PORT.CX, 0, PORT.W, PORT.H, 0, 0, w, h);
      return c;
    };
    const base = crop(src), blink = crop(sh.blink);
    const data = src.getContext('2d').getImageData(0, 0, src.width, src.height).data;
    const at = (x, y) => { const i = (y * src.width + x) * 4; return [data[i], data[i + 1], data[i + 2], data[i + 3]]; };
    const dark = (x, y) => { const p = at(x, y); return p[3] > 200 && p[0] < 40 && p[1] < 40 && p[2] < 50; };
    const ax = DL.CHAR.AX, hy = DL.CHAR.AY - 23, ex = [ax - 3, ax + 2];
    // the eyes are where drawChar puts them (1 × 2 dark pixels each)? then they can be drawn again
    const ok = ex.every((x) => dark(x, hy + 5) && dark(x, hy + 6));
    const s = at(ax - 1, hy + 6), skin = 'rgb(' + s[0] + ',' + s[1] + ',' + s[2] + ')';
    const eyes = ex.map((x) => ({ x: (x - PORT.CX) * 2, y: (hy + 5) * 2 }));
    if (ok) { const g = base.getContext('2d'); for (const e of eyes) R(g, e.x, e.y, 2, 4, skin); }
    return { base, blink, ok, eyes, P: DL.mk(w, h), glasses: !!(player.look && player.look.glasses), hairTop: (hy - 1) * 2 };
  }
  // what the eyes do at t (s into the shot): where they look, and how closed they are (0 open … 2 shut)
  function faceAt(t) {
    let lid = 0;
    for (const b of TEMPOS.rostoPiscar) { const d = t - b; if (d >= 0 && d < 0.15) lid = d < 0.04 || d > 0.11 ? 1 : 2; }
    return { gx: t >= TEMPOS.rostoOlhaLado ? 1 : 0, gy: t >= TEMPOS.rostoOlhaCima ? -1 : 0, lid };
  }
  // the portrait for this frame: wind in the top of the hair, the eyes, then the light (warm sun from the
  // right, cool shade from below, the sign's green from above at the end)
  function paintPortrait(Pt, t, f, neon) {
    const g = Pt.P.getContext('2d'), w = Pt.P.width, h = Pt.P.height;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.clearRect(0, 0, w, h);
    g.imageSmoothingEnabled = false;
    const src = !Pt.ok && f.lid ? Pt.blink : Pt.base;
    // the wind: the hair's top rows sway a pixel, the very top the most
    const wind = Math.sin(t * 2.3) * 0.6 + Math.sin(t * 5.1 + 1) * 0.4, sway = Pt.hairTop + 6;
    for (let y = 0; y < h; y++) {
      const dx = y < sway ? Math.round(clamp(wind * (sway - y) / 5, -1, 1)) : 0;
      g.drawImage(src, 0, y, w, 1, dx, y, w, 1);
    }
    if (Pt.ok) {
      const gx = Pt.glasses ? 0 : f.gx;
      for (const e of Pt.eyes) {
        if (f.lid === 2) R(g, e.x, e.y + 3, 2, 1, EYE);
        else if (f.lid === 1) R(g, e.x + gx, e.y + 2, 2, 2, EYE);
        else {
          R(g, e.x + gx, e.y + f.gy, 2, 4, EYE);
          R(g, e.x + gx + 1, e.y + f.gy, 1, 1, '#f4f1ec'); // a glint
        }
      }
    }
    g.globalCompositeOperation = 'source-atop';
    const warm = g.createLinearGradient(w, 0, w * 0.35, 0);
    warm.addColorStop(0, 'rgba(255,150,80,0.45)'); warm.addColorStop(1, 'rgba(255,150,80,0)');
    g.fillStyle = warm;
    g.fillRect(0, 0, w, h);
    const cool = g.createLinearGradient(0, h, 0, h * 0.45);
    cool.addColorStop(0, 'rgba(30,20,90,0.45)'); cool.addColorStop(1, 'rgba(30,20,90,0)');
    g.fillStyle = cool;
    g.fillRect(0, 0, w, h);
    if (neon > 0) {
      const gr = g.createLinearGradient(0, 0, 0, h * 0.7);
      gr.addColorStop(0, 'rgba(61,255,162,' + (0.4 * neon).toFixed(3) + ')'); gr.addColorStop(1, 'rgba(61,255,162,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, w, h);
    }
    g.globalCompositeOperation = 'source-over';
  }
  // behind the face: the city out of focus — painted tiny, then stretched with smoothing, which blurs it.
  // Far buildings with lit windows drifting slowly, a cloud passing, a few soft lights (bokeh).
  let blurBg = null;
  function paintBlurBg(t) {
    if (!blurBg) blurBg = DL.mk(64, 36);
    const g = blurBg.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, 36);
    sky.addColorStop(0, '#221a42'); sky.addColorStop(0.55, '#6a3466'); sky.addColorStop(1, '#d8705e');
    g.fillStyle = sky;
    g.fillRect(0, 0, 64, 36);
    g.globalAlpha = 0.5;
    g.drawImage(CLOUD_ART[0], Math.round(((t * 3) % 100) - 30), 6);
    g.drawImage(CLOUD_ART[1], Math.round(((t * 2 + 60) % 100) - 30), 13);
    g.globalAlpha = 1;
    for (let i = 0; i < 14; i++) {
      const bx = ((i * 6 - t * 1.2) % 84 + 84) % 84 - 10, top = 16 + Math.floor(DL.hash(i * 5 + 2) * 9);
      R(g, Math.round(bx), top, 6, 36 - top, i % 2 ? '#1a1530' : '#221a3a');
      for (let y = top + 2; y < 34; y += 3) if (DL.hash(i * 37 + y) < 0.45) R(g, Math.round(bx) + 1 + (y % 2) * 2, y, 1, 1, WIN_LIT[(i + y) % WIN_LIT.length]);
    }
    // soft round lights: neon green and street lamps
    for (let i = 0; i < 6; i++) {
      const x = ((DL.hash(i * 13) * 70 - t * 2) % 70 + 70) % 70 - 3, y = 22 + DL.hash(i * 17) * 12;
      g.fillStyle = i % 3 ? 'rgba(255,214,150,0.55)' : 'rgba(61,255,162,0.55)';
      g.fillRect(Math.round(x), Math.round(y), 2, 2);
    }
    return blurBg;
  }
  function desenhoRosto(I, g, W, H, t) {
    if (!I.portrait) I.portrait = buildPortrait();
    const Pt = I.portrait;
    // the background, out of focus and a little darker
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    const bg = paintBlurBg(I.t), k = Math.max(W / 64, H / 36);
    g.drawImage(bg, (W - 64 * k) / 2, (H - 36 * k) / 2, 64 * k, 36 * k);
    g.fillStyle = 'rgba(8,4,18,0.35)';
    g.fillRect(0, 0, W, H);
    // the sign's light reaching his face at the end: flickering, like the neon catching
    const n = t < TEMPOS.rostoNeon ? 0 : DL.hash(Math.floor(t * 16)) < 0.5 ? 1 : 0.15;
    paintPortrait(Pt, I.t, faceAt(t), n);
    // big pixels, a slow push in, breathing; the face a little left of the middle, looking right
    const s = (H / 50) * (1 + 0.08 * easeInOut(span(t, 0, TEMPOS.rosto)));
    const bob = Math.sin((I.t * Math.PI * 2) / 2.8) * s * 0.35;
    g.imageSmoothingEnabled = false;
    g.drawImage(Pt.P, W * 0.44 - 20 * s, H * 0.5 - 21 * s + bob, Pt.P.width * s, Pt.P.height * s);
  }

  /* ---------- shot 3: the sign, seen from the sidewalk below ---------- */
  // The datacenter's facade painted once in pixel art as seen from below (the sides lean in towards the
  // top), with its name sign; drawn big with the camera tilting up from the server floor to the sign.
  const FAC = { W: 300, H: 240, roof: 40, top: 150, bottom: 214, sign: [58, 98], srv: [116, 164], lobby: 180 };
  const rgbOf = (hex) => [parseInt(hex.slice(1, 3), 16), parseInt(hex.slice(3, 5), 16), parseInt(hex.slice(5, 7), 16)];
  // the colour of the facade at u (0…1 across the building at row y), i = pixel in the row, n = row width
  function facadeAt(u, y, i, n) {
    const F = FAC, inU = (a, b) => u >= a && u < b;
    if (i < 2) return '#121929';
    if (i >= n - 1) return '#2b3a59';
    if (y < F.roof + 1) return PAL.neon;
    if (y < F.roof + 5) return '#2b3a59';
    if (y < F.roof + 6) return '#18213a';
    if (y === F.roof + 9) return '#145c3d';
    if (y >= F.sign[0] && y < F.sign[1] && inU(0.1, 0.9)) return y === F.sign[0] || y === F.sign[1] - 1 || u < 0.1 + 1.5 / n || u >= 0.9 - 1.5 / n ? '#145c3d' : '#0a0f19';
    if (y === F.sign[1] + 10) return PAL.neon;
    if (y >= F.srv[0] && y < F.srv[1] && inU(0.05, 0.95)) {
      if (y === F.srv[0] || y === F.srv[1] - 1 || u < 0.05 + 1.5 / n || u >= 0.95 - 1.5 / n) return '#1f6b47';
      const c = ((u - 0.07) / 0.86) * 14, f = c - Math.floor(c);
      return c >= 0 && c < 14 && f > 0.18 && f < 0.82 && y > F.srv[0] + 2 && y < F.srv[1] - 3 ? '#0b1611' : '#06241a';
    }
    if (y === F.srv[1] + 8) return PAL.neon;
    if (y >= F.lobby && inU(0.06, 0.94)) {
      if (y === F.lobby) return '#1f9e66';
      if (inU(0.44, 0.56)) return inU(0.455, 0.545) ? PAL.leaf : PAL.frame;
      return (u * 12) % 1 < 0.08 ? '#1f6b47' : '#0d3a2b';
    }
    if ((y - F.roof) % 22 === 0) return '#18213a';
    return '#1b2540';
  }
  // the name in big neon letters, sized to the panel: one line if it fits, else two, else small
  function bigSign(text, w, h, lit) {
    const c = DL.mk(w, h), g = c.getContext('2d');
    const fits = (s, kk) => s.length * 4 * kk - kk <= w - 6, words = text.split(' ');
    let k = 1, lines = [text], found = false;
    for (let kk = 4; kk >= 1 && !found; kk--) {
      if (fits(text, kk) && 5 * kk <= h - 6) { k = kk; lines = [text]; found = true; break; }
      for (let i = 1; i < words.length && !found; i++) {
        const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
        if (fits(a, kk) && fits(b, kk) && 12 * kk <= h - 4) { k = kk; lines = [a, b]; found = true; }
      }
    }
    const lh = 5 * k, total = lines.length * lh + (lines.length - 1) * 2 * k;
    let y = Math.round((h - total) / 2);
    for (const line of lines) {
      const lw = line.length * 4 * k - k, x = Math.round((w - lw) / 2);
      if (lit) {
        for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, 1], [-1, 1], [1, -1]]) DL.pixText(g, line, x + dx, y + dy, 'rgba(61,255,162,0.3)', k);
        DL.pixText(g, line, x, y, PAL.neon, k);
      } else DL.pixText(g, line, x, y, '#145c3d', k);
      y += lh + 2 * k;
    }
    return c;
  }
  function buildFacade(name) {
    const F = FAC, c = DL.mk(F.W, F.H), g = c.getContext('2d'), img = g.createImageData(F.W, F.H), d = img.data;
    const rowAt = (y) => { const w = F.top + ((F.bottom - F.top) * (y - F.roof)) / (F.H - F.roof); return [Math.round(F.W / 2 - w / 2), Math.round(F.W / 2 + w / 2)]; };
    const cache = {};
    for (let y = F.roof; y < F.H; y++) {
      const [x0, x1] = rowAt(y), n = x1 - x0;
      for (let x = x0; x < x1; x++) {
        const hex = facadeAt((x - x0) / n, y, x - x0, n), rgb = cache[hex] || (cache[hex] = rgbOf(hex)), i = (y * F.W + x) * 4;
        d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    // on the roof: cooling units and a dish against the sky
    const [r0, r1] = rowAt(F.roof);
    for (let i = 0; i < 4; i++) { R(g, r0 + 14 + i * 22, F.roof - 6, 14, 6, '#2b3344'); R(g, r0 + 14 + i * 22, F.roof - 6, 14, 1, '#4a566e'); }
    R(g, r1 - 30, F.roof - 9, 2, 9, '#59647d'); R(g, r1 - 36, F.roof - 13, 14, 4, '#c9d3e0'); R(g, r1 - 34, F.roof - 12, 10, 2, '#8a98ad');
    // the server floor's lights: where they blink
    const leds = [];
    for (let y = F.srv[0] + 5; y < F.srv[1] - 4; y += 7) {
      const [x0, x1] = rowAt(y);
      for (let col = 0; col < 14; col++) leds.push({ x: Math.round(x0 + (0.07 + ((col + 0.72) / 14) * 0.86) * (x1 - x0)), y, k: leds.length });
    }
    const [s0, s1] = rowAt(F.sign[0]), sw = Math.round((s1 - s0) * 0.8) - 6, sh = F.sign[1] - F.sign[0] - 4;
    const sx = Math.round(F.W / 2 - sw / 2), sy = F.sign[0] + 2;
    const on = bigSign(name, sw, sh, true), glow = DL.mk(Math.ceil(sw / 4), Math.ceil(sh / 4)), gg = glow.getContext('2d');
    gg.imageSmoothingEnabled = true;
    gg.drawImage(on, 0, 0, glow.width, glow.height);
    return { img: c, leds, sign: { x: sx, y: sy, w: sw, h: sh, on, off: bigSign(name, sw, sh, false), glow }, antenna: { x: r0 + 10, y: F.roof - 2 }, name };
  }
  function desenhoLetreiro(I, g, W, H, t) {
    if (!I.facade || I.facade.name !== signName()) I.facade = buildFacade(signName());
    const F = I.facade, lit = introSignLit(), E = TEMPOS;
    // the camera: tilts up from the server floor to the sign (slow start, slow end), then leans in a little;
    // a faint handheld sway
    const cy = lerp(FAC.srv[0] + 20, (FAC.sign[0] + FAC.sign[1]) / 2 - 2, easeInOut(span(t, 0, E.subir)));
    const cx = FAC.W / 2 + Math.sin(I.t * 0.8) * 1.5;
    const S = Math.max(W / 205, H / 150) * (1 + 0.06 * ease(span(t, E.subir * 0.6, E.letreiro)));
    // the sky, looking up: darker overhead
    const sky = g.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#120d28'); sky.addColorStop(0.6, '#3b2458'); sky.addColorStop(1, '#a84a5a');
    g.fillStyle = sky;
    g.fillRect(0, 0, W, H);
    g.setTransform(S, 0, 0, S, W / 2 - cx * S, H / 2 - cy * S);
    g.imageSmoothingEnabled = false;
    // clouds and birds far behind: they follow the tilt only part of the way (parallax)
    const py = (cy - FAC.srv[0]) * 0.55;
    g.globalAlpha = 0.85;
    g.drawImage(CLOUD_ART[0], Math.round(((I.t * 5) % 340) - 40), Math.round(-6 + py), 52, 14);
    g.drawImage(CLOUD_ART[1], Math.round(((I.t * 3 + 200) % 340) - 40), Math.round(18 + py), 36, 10);
    g.globalAlpha = 1;
    g.fillStyle = '#2a1a30';
    FLOCK.forEach(([ox, oy], i) => {
      const x = 20 + I.t * 22 + ox, y = 6 + py + oy * 0.6;
      for (const [px, qy] of Math.floor(I.t * 6 + i * 1.7) % 2 ? BIRD_UP : BIRD_DOWN) g.fillRect(Math.round(x) + px, Math.round(y) + qy, 1, 1);
    });
    g.drawImage(F.img, 0, 0);
    // the antenna on the roof, its red light blinking
    R(g, F.antenna.x, F.antenna.y - 30, 1, 30, '#8a98ad');
    R(g, F.antenna.x - 3, F.antenna.y - 22, 7, 1, '#8a98ad');
    if (I.t % 1.6 < 0.35) R(g, F.antenna.x - 1, F.antenna.y - 32, 3, 2, '#ff3b3b');
    // the racks' lights behind the dark glass
    const LED = ['#3dffa2', '#3dffa2', '#2de2c8', '#ffb020'];
    for (const L of F.leds) if (DL.hash(L.k * 31 + Math.floor(I.t * (1.5 + (L.k % 5) * 0.7))) < 0.7) R(g, L.x, L.y, 1, 1, LED[L.k % LED.length]);
    // the sign: dark tubes, then the neon catching; lit, it glows and throws green light on the wall
    const s = F.sign;
    if (!lit) g.drawImage(s.off, s.x, s.y);
    else {
      const flash = 1 - span(t, E.neon[1], E.neon[1] + 0.8); // a bloom the moment it stays on, settling
      g.globalCompositeOperation = 'lighter';
      g.imageSmoothingEnabled = true;
      g.globalAlpha = 0.3 + 0.35 * flash;
      g.drawImage(s.glow, s.x - s.w * 0.1, s.y - s.h * 0.35, s.w * 1.2, s.h * 1.7);
      g.globalAlpha = 1;
      const mx = s.x + s.w / 2, my = s.y + s.h / 2, spill = g.createRadialGradient(mx, my, 0, mx, my, s.w * 0.9);
      spill.addColorStop(0, 'rgba(61,255,162,' + (0.1 + 0.14 * flash).toFixed(3) + ')'); spill.addColorStop(1, 'rgba(61,255,162,0)');
      g.fillStyle = spill;
      g.fillRect(mx - s.w, my - s.w, s.w * 2, s.w * 2);
      g.globalCompositeOperation = 'source-over';
      g.imageSmoothingEnabled = false;
      g.drawImage(s.on, s.x, s.y); // the tubes themselves, crisp, over their glow
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    // the game's name, big, fading in under the sign — only when the sign shows another name
    if (F.name !== NOME_PADRAO && t > E.neon[1]) {
      if (!titleArt) titleArt = titleCanvas();
      const k = Math.max(2, Math.floor(Math.min((W * 0.4) / titleArt.width, (H * 0.12) / titleArt.height)));
      g.globalAlpha = ease(span(t, E.neon[1], E.neon[1] + 0.6));
      g.drawImage(titleArt, Math.round((W - titleArt.width * k) / 2), Math.round(H * 0.72), titleArt.width * k, titleArt.height * k);
      g.globalAlpha = 1;
    }
  }

  /* ---------- over every shot: the dusk colour, the film look, the cuts, the bars ---------- */
  let titleArt = null;
  function titleCanvas() {
    const t = NOME_PADRAO, w = t.length * 4 + 3, c = DL.mk(w, 12), g = c.getContext('2d');
    for (const [dx, dy] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) DL.pixText(g, t, 2 + dx, 2 + dy, 'rgba(61,255,162,0.3)');
    DL.pixText(g, t, 2, 2, PAL.neon);
    R(g, 2, 9, w - 5, 1, 'rgba(61,255,162,0.55)');
    return c;
  }
  // film grain: a few tiles of random specks, made once, shown one after another
  const GRAIN = [];
  function grainTile(i) {
    if (!GRAIN[i]) {
      const c = DL.mk(96, 96), g = c.getContext('2d');
      for (let n = 0; n < 700; n++) R(g, Math.floor(Math.random() * 96), Math.floor(Math.random() * 96), 1, 1, Math.random() < 0.5 ? '#ffffff' : '#000000');
      GRAIN[i] = c;
    }
    return GRAIN[i];
  }
  // the dip to black around each cut, the fade in at the very start (0 = clear, 1 = black)
  function cutBlack(I) {
    let a = 1 - span(I.t, 0, TEMPOS.abrir), t0 = 0;
    const c = TEMPOS.corte / 2;
    for (let i = 0; i < PLANOS.length - 1; i++) {
      t0 += TEMPOS[PLANOS[i].nome];
      if (c > 0) a = Math.max(a, 1 - Math.abs(I.t - t0) / c);
    }
    return clamp(a, 0, 1);
  }
  function introOverlay() {
    const I = ST.intro, g = scene.ctx, W = scene.canvas.width, H = scene.canvas.height, p = PLANOS[I.step];
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    if (outside()) {
      // on the street: warm light from above, a cool shade below (soft-light keeps the neon bright)
      if (!p.desenho) {
        const tint = g.createLinearGradient(0, 0, 0, H);
        tint.addColorStop(0, 'rgba(255,150,90,0.5)'); tint.addColorStop(0.5, 'rgba(255,120,120,0.16)'); tint.addColorStop(1, 'rgba(60,50,150,0.32)');
        g.globalCompositeOperation = 'soft-light';
        g.fillStyle = tint;
        g.fillRect(0, 0, W, H);
        g.globalCompositeOperation = 'source-over';
      }
      // the film look: dark corners and a little grain
      const v = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.hypot(W, H) * 0.55);
      v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
      g.fillStyle = v;
      g.fillRect(0, 0, W, H);
      const pat = g.createPattern(grainTile(Math.floor(I.t * 14) % 4), 'repeat'), gs = Math.max(1, Math.round(scene.dpr || 1));
      g.setTransform(gs, 0, 0, gs, 0, 0);
      g.globalAlpha = 0.07;
      g.fillStyle = pat;
      g.fillRect(0, 0, W / gs, H / gs);
      g.globalAlpha = 1;
      g.setTransform(1, 0, 0, 1, 0, 0);
      // the cuts between shots
      const b = cutBlack(I);
      if (b > 0) { g.fillStyle = 'rgba(0,0,0,' + b.toFixed(3) + ')'; g.fillRect(0, 0, W, H); }
    }
    // the black bars: they slide in at the start, and out again while the room fades in
    let k = easeInOut(span(I.t, 0, TEMPOS.barras));
    const f = ST.fade;
    if (I.phase === 'leave' && f && f.swapped) k *= 1 - easeInOut(span(f.t, f.dur, f.dur * 2));
    const bh = Math.round(H * 0.11 * k);
    if (bh > 0) { g.fillStyle = '#000'; g.fillRect(0, 0, W, bh); g.fillRect(0, H - bh, W, bh); }
  }
  // shots with a picture of their own (2 and 3) are drawn instead of the street
  function introShot() {
    const I = ST.intro;
    if (!I) return false;
    const p = PLANOS[I.step];
    if (!p.desenho) return false;
    const g = scene.ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    p.desenho(I, g, scene.canvas.width, scene.canvas.height, Math.min(I.stepT, TEMPOS[p.nome]));
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.imageSmoothingEnabled = false;
    return true;
  }

  /* ---------- start, skip, end ---------- */
  let skipHint = null;
  // capture, on the window: nothing reaches the game while the scene runs; Space / Enter / a click skip it
  function introKey(ev) {
    if (!ST.intro) return;
    ev.stopPropagation();
    const skip = ev.code === 'Space' || ev.code === 'Enter' || ev.code === 'NumpadEnter';
    if (!skip) return;
    ev.preventDefault();
    if (!ev.repeat) leaveIntro();
  }
  function introPointer(ev) {
    if (!ST.intro) return;
    ev.stopPropagation();
    ev.preventDefault();
    if (ev.type === 'pointerdown') leaveIntro();
  }
  const INTRO_EVENTS = [['keydown', introKey], ['keyup', introKey], ['pointerdown', introPointer], ['wheel', introPointer]];
  function intro(then) {
    if (ST.intro) endIntro();
    const pet = D.pet && D.pet.actor, cam = walkShot(INTRO_START.x, INTRO_START.y);
    ST.intro = {
      t: 0, step: 0, stepT: 0, started: -1, novo: false, phase: 'play', then: typeof then === 'function' ? then : null,
      cam, camX0: cam.X, target: null, door: 0, doorSound: false, signWas: false, ambT: 0, dust: [],
      portrait: null, facade: null,
      // how the character and the pet looked before (the scene fades them out at the door)
      saved: { alpha: player.alpha, z: player.z, petAlpha: pet ? pet.alpha : undefined },
    };
    ST.fade = null;
    arrive('rua');
    player.x = INTRO_START.x; player.y = INTRO_START.y; player.dir = 'right'; player.dist = 0;
    if (pet) { pet.x = player.x - 14; pet.y = player.y; pet.moving = false; }
    applyCam(ST.intro.cam);
    G.root.classList.add('is-cutscene');
    if (!skipHint) {
      skipHint = document.createElement('div');
      skipHint.className = 'cutscene-skip';
      skipHint.textContent = DL.MOBILE ? 'Toque para pular' : 'Espaço para pular';
      G.root.appendChild(skipHint);
    }
    skipHint.hidden = false;
    for (const [type, fn] of INTRO_EVENTS) addEventListener(type, fn, { capture: true, passive: false });
  }
  // at the door (or skipped): fade to black and come back inside the room
  function leaveIntro() {
    const I = ST.intro;
    if (!I || I.phase === 'leave') return;
    I.phase = 'leave';
    player.moving = false;
    if (skipHint) skipHint.hidden = true;
    go('dentro', false, { dur: TEMPOS.fadeFinal, black: true });
  }
  // the character and the pet as they were (no fade, no hop)
  function restoreActors(I) {
    const pet = D.pet && D.pet.actor;
    player.alpha = I.saved.alpha;
    player.z = I.saved.z;
    if (pet) pet.alpha = I.saved.petAlpha;
    I.door = 0;
  }
  // the scene is over (or dropped, when a new game replaced the world): the controls come back
  function endIntro() {
    for (const [type, fn] of INTRO_EVENTS) removeEventListener(type, fn, { capture: true });
    if (skipHint) skipHint.hidden = true;
    if (ST.intro) restoreActors(ST.intro);
    ST.intro = null;
    G.root.classList.remove('is-cutscene');
  }
  function introStep(dt) {
    const I = ST.intro;
    if (!I) return;
    I.t += dt;
    if (I.phase === 'leave') {
      // the picture holds (the camera settles) until the screen is black; then the room, as it was
      if (outside()) { updateDust(I, dt); followCam(I, dt); applyCam(I.cam); } else restoreActors(I);
      // back in the room: the game goes on (tutorial or build mode)
      if (!ST.fade) { endIntro(); if (I.then) I.then(); }
      return;
    }
    // demo.js' own movement is off (scene.moveActor below): the shots place the character
    player.vx = player.vy = 0;
    const p = PLANOS[I.step], dur = TEMPOS[p.nome];
    I.stepT += dt;
    I.novo = I.started !== I.step; // the first frame of a shot (cuts place the camera there)
    I.started = I.step;
    p.run(I, Math.min(1, I.stepT / dur), Math.min(I.stepT, dur), dt);
    I.novo = false;
    if (I.stepT >= dur) {
      if (I.step + 1 < PLANOS.length) { I.stepT -= dur; I.step++; } else leaveIntro();
    }
    followCam(I, dt);
    applyCam(I.cam);
    updateDust(I, dt);
    // a buzzing click each time the neon catches
    const lit = introSignLit();
    if (lit && !I.signWas && I.t < inicio('letreiro') + TEMPOS.neon[1] + 0.1) DL.audio.play('neon');
    I.signWas = lit;
    // the street's sound under it all, in short overlapping pieces (it stops with the scene)
    if ((I.ambT -= dt) <= 0) { I.ambT += 2.4; DL.audio.play('rua'); }
  }

  G.on('step', (dt) => {
    // the cars only move while the street is what the player sees
    if (outside()) { updateCars(dt, scene.t); flipWindows(dt); updatePeds(dt, scene.t); }
    const f = ST.fade;
    if (f) {
      f.t += dt;
      if (!f.swapped && f.t >= f.dur) { f.swapped = true; arrive(f.to); }
      if (f.t >= f.dur * 2) ST.fade = null;
    }
    introStep(dt);
    const pl = place();
    if (pl && pl.update) pl.update(dt);
    // build / crew mode, the title screen: always inside the datacenter
    if (ST.where !== 'dentro' && !ST.fade && !ST.intro && (D.state.mode !== 'explore' || D.state.phase !== 'play')) go('dentro', true);
  });
  G.on('game-begin', reset);

  // the player walks with the street's collision while outside, and stands still during the fade
  const baseMove = scene.moveActor;
  scene.moveActor = function (a, dx, dy) {
    if (a === player && (ST.fade || ST.intro)) { a.vx = a.vy = 0; return; }
    if (a === player && outside()) return street.moveActor(a, dx, dy);
    if (a === player && place()) return place().scene.moveActor(a, dx, dy);
    return baseMove.call(this, a, dx, dy);
  };

  /* ------------------------------------------------------------------ */
  /* drawing                                                             */
  /* ------------------------------------------------------------------ */
  // other players of an online room who are outside too (multiplayer.js marks them)
  const othersOutside = () => scene.actors.filter((a) => a.remotePlayer && a.outside);
  function renderStreet() {
    // the same zoom, camera and screen as the datacenter view — but never zoomed out past MAX_VIEW, so the
    // picture stays inside the city drawn. The datacenter scene takes the same zoom while outside (the
    // labels over the world use it); coming back in, scene.resize() gives it its own zoom back.
    const minS = streetMinS();
    // (the opening scene sets its own zoom: a wider shot first, then closer; demo.js puts the player's back)
    if (ST.intro && ST.intro.cam) scene.S = ST.intro.cam.S;
    else if (scene.S < minS) scene.S = minS;
    street.S = scene.S; street.dpr = scene.dpr; street.autoS = scene.autoS;
    street.o.padTop = scene.o.padTop; street.o.padBottom = scene.o.padBottom;
    street.cam.x = scene.cam.x; street.cam.y = scene.cam.y;
    street.t = scene.t;
    // the player, the pet (pets.js follows them out here too), other players outside, people on this sidewalk
    const others = othersOutside(), pet = D.pet && D.pet.actor;
    street.drawables = [player].concat(pet ? [pet] : [], others, pedsOn('near').map((p) => p.a));
    player.hidden = false;
    if (pet) pet.hidden = false;
    for (const a of others) a.hidden = false;
    try { street.render(); } finally {
      player.hidden = true;
      if (pet) pet.hidden = true;
      for (const a of others) a.hidden = true;
    }
    // the page's labels over the world (my name tag, the E prompt) use the datacenter scene's camera
    scene.ox = street.ox; scene.oy = street.oy;
  }
  let scan = null, scanPat = null;
  function drawFade() {
    const f = ST.fade, g = scene.ctx, c = scene.canvas;
    const a = clamp(f.t < f.dur ? f.t / f.dur : 2 - f.t / f.dur, 0, 1);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    if (f.black) { g.fillStyle = 'rgba(0,0,0,' + a.toFixed(3) + ')'; g.fillRect(0, 0, c.width, c.height); return; }
    g.fillStyle = 'rgba(2,10,6,' + (a * 0.96).toFixed(3) + ')';
    g.fillRect(0, 0, c.width, c.height);
    // green scanlines, brightest halfway, and a neon line sweeping down the screen
    if (!scan) { scan = DL.mk(1, 4); const sg = scan.getContext('2d'); sg.fillStyle = 'rgba(61,255,162,0.25)'; sg.fillRect(0, 0, 1, Math.max(1, Math.round(scene.dpr))); }
    if (!scanPat) scanPat = g.createPattern(scan, 'repeat');
    g.globalAlpha = a;
    g.fillStyle = scanPat;
    g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = PAL.neon;
    g.fillRect(0, Math.round((f.t / (f.dur * 2)) * c.height), c.width, Math.max(2, Math.round(scene.dpr * 2)));
    g.globalAlpha = 1;
  }
  // outside, the scene's canvas shows the street (demo.js still updates the labels and panels after it)
  // inside a shop: its own little room, drawn by its own scene (lojas.js) with the same camera and zoom
  function renderPlace(pl) {
    const sc = pl.scene, cw = scene.canvas.width, ch = scene.canvas.height;
    // a small room: a bit closer than the street, the whole room on screen
    scene.S = Math.max(2, Math.floor(Math.min(cw / pl.view.w, ch / pl.view.h)));
    sc.S = scene.S; sc.dpr = scene.dpr; sc.autoS = scene.autoS;
    sc.o.padTop = scene.o.padTop; sc.o.padBottom = scene.o.padBottom;
    sc.cam.x = scene.cam.x; sc.cam.y = scene.cam.y;
    sc.t = scene.t;
    const pet = D.pet && D.pet.actor;
    sc.drawables = pl.drawables().concat([player], pet ? [pet] : []);
    player.hidden = false;
    if (pet) pet.hidden = false;
    try { sc.render(); } finally {
      player.hidden = true;
      if (pet) pet.hidden = true;
    }
    scene.ox = sc.ox; scene.oy = sc.oy;
  }
  scene.drawInstead = () => {
    if (ST.where === 'dentro') return false;
    const pl = place();
    if (pl) { renderPlace(pl); return true; }
    if (!introShot()) renderStreet();
    return true;
  };
  // the fade goes over whatever was drawn
  const baseRender = scene.render;
  scene.render = function () {
    baseRender.call(this);
    if (ST.intro) introOverlay();
    if (ST.fade) drawFade();
  };

  /* ------------------------------------------------------------------ */
  /* using the door (demo.js)                                            */
  /* ------------------------------------------------------------------ */
  // distance from the player to the door inside (null when far or outside), for findTarget
  function doorDist(p) {
    const d = sync();
    if (!d || ST.where !== 'dentro' || p.hidden) return null;
    const fx = (d.tx + 1) * T, cy = (d.ty + 0.5) * T;
    const dx = p.x - fx, dy = p.y - cy;
    if (dx < 0 || dx > 24 || Math.abs(dy) > 14) return null;
    return Math.hypot(dx - 4, dy) - 4;
  }
  // what the player can use outside (findTarget, while outside): the front door and the shops' doors;
  // inside a shop, what the shop offers (its sellers, the way out: lojas.js)
  function target(p) {
    const pl = place();
    if (pl) return pl.target(p);
    const dy = p.y - ROWS.face * T;
    if (dy < 0 || dy > 22) return null;
    if (Math.abs(p.x - SPAWN.x) <= 14) return door;
    for (const f of LOJA_FRONTS) if (PLACES[f.lugar] && Math.abs(p.x - f.mid) <= 12) return f.target;
    return null;
  }
  // where the "E" prompt floats (screen px): over the door (or over what a target says: t.at)
  function promptAt(t) {
    const pl = place();
    if (t && t.at) return (pl ? pl.scene : street).worldToScreen(t.at[0], t.at[1], t.at[2]);
    if (outside()) return street.worldToScreen(DOOR_X * T + 8, ROWS.face * T, DOOR_H - 4);
    const d = scene.world.exitDoor || { tx: 0, ty: 0 };
    return scene.worldToScreen((d.tx + 1) * T + 2, (d.ty + 0.5) * T, DOOR_H + 3);
  }
  const verb = (t) => (t && t.verb) || (ST.where === 'dentro' ? 'Sair' : 'Entrar');
  const label = (t) => (t && t.name) || (ST.where === 'dentro' ? 'Rua' : 'Data center');
  // E on a target: a shop's door goes in (t.go), a seller opens their counter (t.use), a shop's way out
  // (t.leave) goes back to the sidewalk; the datacenter's doors go in / out
  function use(t) {
    if (D.state.mode !== 'explore' || ST.fade || ST.intro) return;
    if (t && t.go && PLACES[t.go]) { go(t.go); return; }
    if (t && t.use) { t.use(); return; }
    if (t && t.leave) { go('rua'); return; }
    go(ST.where === 'dentro' ? 'rua' : 'dentro');
  }
  // the tutorial's last step points at the shops: arrows over them for a few seconds, the next time the
  // player is on the street (now, if they already are)
  function highlightShops(sec) {
    if (outside() && !ST.fade) ST.hl = { until: scene.t + sec };
    else ST.hlPend = sec;
  }

  /* ------------------------------------------------------------------ */
  /* saves (save-service.js) and other players (multiplayer.js)           */
  /* ------------------------------------------------------------------ */
  function snapshot() {
    // the opening scene is only a scene: the game is saved as starting in the room
    if (ST.intro) { const sp = scene.world.spawn || { x: player.x, y: player.y }; return { at: 'dentro', x: r1(sp.x), y: r1(sp.y) }; }
    // in a shop (or going in): saved on the sidewalk, in front of its door
    const pl = place() || (ST.fade && PLACES[ST.fade.to]);
    if (pl) { const f = LOJA_FRONTS.find((x) => x.lugar === pl.id); return { at: 'rua', x: r1(f ? f.mid : SPAWN.x), y: r1(SPAWN.y) }; }
    if (outside() || (ST.fade && ST.fade.to === 'rua')) {
      const f = outside() ? clampFeet(player.x, player.y) : SPAWN;
      return { at: 'rua', x: r1(f.x), y: r1(f.y) };
    }
    return { at: 'dentro', x: r1(player.x), y: r1(player.y) };
  }
  // where a loaded game puts the player: on the sidewalk (always inside the walkable strip), or inside the
  // datacenter where they were — when that spot is free; otherwise the room's spawn, as before
  function restore(w) {
    ST.fade = null;
    if (w && w.at === 'rua') {
      arrive('rua');
      const f = clampFeet(Number(w.x), Number(w.y));
      player.x = f.x; player.y = f.y;
      aim();
      return;
    }
    if (ST.where !== 'dentro') arrive('dentro');
    const x = w ? Number(w.x) : NaN, y = w ? Number(w.y) : NaN;
    if (w && w.at === 'dentro' && Number.isFinite(x) && Number.isFinite(y) && !scene.hits(x, y)) { player.x = x; player.y = y; aim(); }
  }
  // the room's labels: the same side as me (both inside, or both outside)
  // (inside a shop nobody else is drawn: no labels)
  const sameSide = (a) => (place() ? false : !!(a && a.outside) === outside());
  // Each NPC belongs to one room: its `sala` field ('dentro' = the datacenter, the default for the crew,
  // the visitors and everyone else; 'lojaSkins' / 'lojaCafe' = the people inside a shop, lojas.js).
  // A speech bubble or a name tag only shows when its NPC is in the room the player is in now (crew.js).
  // The player is always where the player is.
  const salaDe = (a) => (a && a.sala) || 'dentro';
  const naSala = (a) => !!a && (a === player || salaDe(a) === ST.where);

  /* ------------------------------------------------------------------ */
  /* the camera on the street, and the little map (demo.js)               */
  /* ------------------------------------------------------------------ */
  // The camera's aim (world px) stays over the city: on screen, the middle of the view keeps inside the
  // city's diamond with a margin, so there is never a view that is mostly water. (iso.js' camera then
  // also keeps the view inside the diamond's box.)
  function clampCamPoint(c, sc) {
    const S = sc.S || scene.S, vw = sc.canvas.width / S, vh = sc.canvas.height / S, Wm = SW * T, Hm = SH * T;
    let X = c.x - c.y, Y = (c.x + c.y) / 2;
    const mx = Math.min(vw * 0.35, (Wm + Hm) * 0.45), my = Math.min(vh * 0.3, ((Wm + Hm) / 2) * 0.45);
    X = clamp(X, -Hm + mx, Wm - mx);
    Y = clamp(Y, my, (Wm + Hm) / 2 - my);
    c.x = Y + X / 2; c.y = Y - X / 2;
    c.x = clamp(c.x, 0, Wm); c.y = clamp(c.y, 0, Hm);
  }
  // the whole city, small (1 px = 8 world px), painted once for the little map in the corner
  let mmArt = null;
  function minimapArt() {
    if (mmArt) return mmArt;
    const k = 1 / 8, ox = PONTE * T, c = DL.mk(Math.round((SW + 2 * PONTE) * T * k), Math.round(SH * T * k)), g = c.getContext('2d');
    g.fillStyle = AGUA; g.fillRect(0, 0, c.width, c.height);
    g.imageSmoothingEnabled = true;
    g.drawImage(street.floor, ox * k, 0, SW * T * k, SH * T * k);
    for (const p of PONTES) { g.fillStyle = '#2a2f38'; g.fillRect((p.x0 + ox) * k, p.y0 * k, (p.x1 - p.x0) * k, (p.y1 - p.y0) * k); }
    for (const b of BLOCKS) { g.fillStyle = b.col.t; g.fillRect((b.x0 * T + ox) * k, b.y0 * T * k, (b.x1 - b.x0) * T * k, (b.y1 - b.y0) * T * k); }
    g.fillStyle = '#2b3a59'; g.fillRect((BLD.x0 * T + ox) * k, BLD.y0 * T * k, (BLD.x1 - BLD.x0) * T * k, (BLD.y1 - BLD.y0) * T * k);
    g.fillStyle = '#3dffa2'; g.fillRect((BLD.x0 * T + ox) * k + 1, BLD.y1 * T * k - 1, (BLD.x1 - BLD.x0) * T * k - 2, 1);
    if (POCKET_PARK && TRAS) { g.fillStyle = '#163024'; g.fillRect((POCKET_PARK.x0 * T + ox) * k, TRAS.bld0 * T * k, (POCKET_PARK.x1 - POCKET_PARK.x0) * T * k, (TRAS.bld1 - TRAS.bld0) * T * k); }
    mmArt = c; mmArt.k = k; mmArt.ox = ox;
    return c;
  }

  DL.Street = {
    CALCADA_PASSOS, WALK, door,
    // the smallest zoom on the street: never a wider view than MAX_VIEW (the city drawn)
    minS: () => streetMinS(),
    MAX_VIEW,
    // the city's size (world px) and the camera's limits on the street (demo.js)
    get mapW() { return SW * T; }, get mapH() { return SH * T; },
    clampCam: (c, sc) => clampCamPoint(c, sc || street),
    minimap: () => minimapArt(),
    longe: (sc) => longe(sc || street),
    // the scene the player walks in while out of the datacenter: the street, or the shop they are in
    get scene() { const pl = place(); return pl ? pl.scene : street; },
    street,
    // out of the datacenter: on the street or inside one of its shops
    get outside() { return ST.where !== 'dentro'; },
    get onStreet() { return outside(); },
    get place() { return place() ? ST.where : null; },
    // the room the player is in now: 'dentro' | 'rua' | a shop's id
    get sala() { return ST.where; },
    // the shop the player is in (lojas.js' place object: its scene, its people), or null
    get placeObj() { return place(); },
    salaDe, naSala,
    addPlace(pl) { PLACES[pl.id] = pl; },
    highlightShops,
    // where the others in an online room see me while I am in a shop: on the sidewalk at its door
    netPos() { const pl = place(); const f = pl && LOJA_FRONTS.find((x) => x.lugar === pl.id); return f ? { x: f.mid, y: SPAWN.y } : null; },
    get busy() { return !!ST.fade || !!ST.intro; },
    get inIntro() { return !!ST.intro; },
    intro, skipIntro: () => leaveIntro(),
    doorDist, target, promptAt, verb, label, use, go, clampFeet, snapshot, restore, sameSide,
    // for tests
    _cars: cars, _STOP: STOP, _signal: () => signalAt(scene.t), _windows: WINDOWS, _baked: BAKED, _peds: peds,
    // what the day / night cycle (daynight.js) needs to light the street: where the lamps, windows, signs
    // and shop fronts are, the size of the city and where its horizon is
    luz: {
      T, SW, SH, ROWS, FY, BLD, PANEL, DC_FLOORS, DOOR_X, SKY_Y, IX, IY,
      LAMPS, FAR_LAMPS, LAMPS2, WINDOWS, SHOPS, LOJA_FRONTS, cars, peds, TRAS, LADOS, PONTES,
      // …and what casts a shadow in the sun: the buildings, trees, benches, planters, hedges, the bus stop, traffic lights
      BLOCKS, TREES, BENCHES, PLANTERS, HEDGES, LIGHTS, PARK_LAMPS, CAIXAS, PARKED, YARDS, BUS: { x0: BUS_X, x1: BUS_X + 3 * T, y0: ROWS.far1 * T + 3, y1: ROWS.far1 * T + 13 },
      pedsOn: (where) => pedsOn(where).map((p) => p.a),
      signLit: (t) => signLit(t),
    },
  };
})();
