/* DataLab — as lojinhas da rua, por dentro (as fachadas ficam em street.js; os nomes em lojas-dados.js).
   · lojaSkins  — Skin.exe (toldo azul, à direita do DataLab): loja tech/neon com balcão, prateleiras, vitrine
                  de manequins, mesa de demonstração com holograma, arara, totem, caixas e dois vendedores
                  (Lia e Davi).
   · lojaCafe   — Café Byte (toldo laranja, à esquerda): balcão com máquina de café e moedor, mesas, cantinho
                  de leitura com sofá, estante de livros, jukebox, janela, luz quente e a barista Duda.
   Falar com quem está no balcão (E) abre a MESMA Loja do botão LOJA do topo (abrirLoja → inventory.js
   openShop): mesmos itens, mesmo Gold e créditos, mesma compra pelo servidor. Não existe loja separada.
   Entrar e sair é o mesmo caminho da porta do DataLab (street.js: go / arrive, com o mesmo escurecimento).
   Carregado depois de street.js. */
(function () {
  'use strict';
  const DL = window.DL, D = window.DataLabDemo;
  if (!DL || !D || !DL.Street || !DL.Street.addPlace || !DL.isoKit || !DL.LOJAS) return;
  const T = DL.T, R = DL.R, K = DL.isoKit, scene = D.scene, player = D.player;
  const IX = (x, y) => x - y, IY = (x, y, z) => (x + y) / 2 - (z || 0);
  const NOMES = DL.LOJAS;

  /* ------------------------------------------------------------------ */
  /* the counter opens the game's Loja (the same one as the LOJA button)  */
  /* ------------------------------------------------------------------ */
  // Descontos e promoções das lojinhas: ainda não existem. Quando forem feitos, entram AQUI (é chamado logo
  // antes de abrir a Loja). Por enquanto não faz nada: a Loja abre com os preços normais.
  function aplicarDescontos() {
    // TODO: descontos / promoções da loja da rua
  }
  // aba: which tab of the Loja opens first (inventory.js SHOP_TABS: 'skins', 'equip', 'special'...)
  function abrirLoja(aba) {
    const I = DL.Inventory;
    if (!I || !I.openShop) return;
    aplicarDescontos();
    I.openShop(aba);
    DL.audio.play('click');
  }

  /* ------------------------------------------------------------------ */
  /* a room: walls all around, a doorway in the front wall                */
  /* ------------------------------------------------------------------ */
  // W × H tiles (the walls included): the floor is 12 × 9 tiles (x 16…208, y 16…160 in world pixels).
  // The doorway is two tiles of the front (south) wall, around DOOR_X. Only the walls are solid tiles: the
  // furniture collides with its own footprint (colliders, below).
  const W = 14, H = 11, DOOR = [6, 7], DOOR_X = 7 * T, IN_Y = (H - 1) * T - 5;
  const X0 = T, Y0 = T, X1 = (W - 1) * T, Y1 = (H - 1) * T; // the floor's edges
  function roomWorld(style) {
    const N = W * H, tiles = new Array(N).fill('#'), solid = new Uint8Array(N).fill(1), roomAt = new Int16Array(N).fill(-1);
    for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { tiles[y * W + x] = '.'; solid[y * W + x] = 0; roomAt[y * W + x] = 0; }
    // the doorway ('o', iso.js keeps the walls beside it low): floor you see, but you leave through it with
    // E (not by walking)
    for (const x of DOOR) tiles[(H - 1) * W + x] = 'o';
    return {
      W, H, tiles, solid, roomAt, rooms: [{ x: 1, y: 1, w: W - 2, h: H - 2, style }], items: [], npcs: [], rows: { A: [], B: [] }, labels: [],
      interactables: [], byId: {}, hasVideoWall: false, version: 1, shop: true, spawn: { x: DOOR_X, y: IN_Y },
    };
  }
  // a thing standing in the room: its footprint, how tall, and how it draws (iso pixels).
  // solid: the player bumps into its footprint (false: things on the walls, lamps hanging from the ceiling);
  // block: other areas to bump into instead ([[x0, y0, x1, y1], …]), e.g. a counter that also closes the
  // staff's side behind it. shadow: false for things that cast none on the floor (on the walls).
  function thing(x0, y0, x1, y1, h, draw, solid, block, shadow) {
    return {
      isoRect: [x0, y0, x1, y1], isoH: h, solid: solid !== false, block, shadow: shadow !== false && solid !== false,
      drawIso(g, sc, e, t) { K.isoT(g, sc); draw(g, sc, t); return null; },
    };
  }
  // The room's collision: the walls (tiles) plus the footprint of each solid thing, as it is drawn — not
  // the whole tile under it — so the player can walk close to the furniture and slide along it
  // (scene.js moveActor: X and Y apart, with the corner nudge).
  function colliders(sc, things) {
    const rects = [];
    for (const o of things) if (o.solid) for (const r of o.block || [o.isoRect]) rects.push(r);
    const tiles = sc.solidAt;
    sc.solidAt = function (x, y) {
      if (tiles.call(this, x, y)) return true;
      for (const r of rects) if (x >= r[0] && x < r[2] && y >= r[1] && y < r[3]) return true;
      return false;
    };
    // scene.js tests only the four corners of the feet: a thing narrower than the feet (a plant, a stool)
    // could slip between them. Here the whole feet box (x ± 5, y − 4 … y − 0.5) is tested against each one.
    const corners = sc.hits;
    sc.hits = function (x, y) {
      if (corners.call(this, x, y)) return true;
      const a0 = x - 5, a1 = x + 5, b0 = y - 4, b1 = y - 0.5;
      for (const r of rects) if (a1 > r[0] && a0 < r[2] && b1 > r[1] && b0 < r[3]) return true;
      return false;
    };
    sc.colliders = rects;
  }
  // The floor (top-down, iso.js lays it down): paint(g) draws the room's own floor; then the soft shadow
  // under every piece of furniture and the mat at the door
  function floorPainter(paint, things) {
    return (w) => {
      const c = DL.mk(w.W * T, w.H * T), g = c.getContext('2d');
      paint(g);
      for (const o of things) {
        if (!o.shadow) continue;
        const [a, b, x, y] = o.isoRect;
        g.fillStyle = 'rgba(0,0,0,0.22)';
        g.fillRect(a - 1, b + 1, x - a + 3, y - b + 2);
        g.fillStyle = 'rgba(0,0,0,0.14)';
        g.fillRect(a - 2, b + 2, x - a + 5, y - b + 3);
      }
      return c;
    };
  }
  function doorMat(g, dark, light) {
    R(g, DOOR[0] * T + 2, (H - 1) * T + 1, 2 * T - 4, T - 3, dark);
    R(g, DOOR[0] * T + 4, (H - 1) * T + 3, 2 * T - 8, T - 7, light);
  }
  // pixel art flat on the back (north) wall's face, its top-left corner at (x, z)
  function onBackWall(g, sc, art, x, z) { DL.isoMap(g, sc, [x, T + 0.4, z], [1, 0, 0], [0, 0, -1]); g.imageSmoothingEnabled = false; g.drawImage(art, 0, 0); K.isoT(g, sc); }
  // …and on the left (west) wall's face: the art runs from the front (left on screen) to the back
  function onLeftWall(g, sc, art, y, z) { DL.isoMap(g, sc, [T + 0.4, y, z], [0, -1, 0], [0, 0, -1]); g.imageSmoothingEnabled = false; g.drawImage(art, 0, 0); K.isoT(g, sc); }
  function art(w, h, draw) { const c = DL.mk(w, h); draw(c.getContext('2d')); return c; }
  function upright(g, img, x, y, z) { g.drawImage(img, Math.round(IX(x, y) - img.width / 2), Math.round(IY(x, y, z || 0) - img.height)); }
  // a soft glow (additive) on the floor around (x, y)
  function glow(g, sc, x, y, r, col) {
    sc.groundTransform(g, 0);
    g.globalCompositeOperation = 'lighter';
    DL.pool(g, x, y, r, col);
    g.globalCompositeOperation = 'source-over';
    K.isoT(g, sc);
  }
  const flick = (t, rate, seed) => DL.hash(Math.floor(t * rate) + seed) > 0.04; // a neon that blinks off now and then
  const PLANT = art(9, 11, (g) => {
    const rows = ['...g.G...', '..gGgGg..', '.gGHGgGg.', 'gGgGGHGgg', '.gGHGgGg.', 'gGgGGgHGg', '.gGGgGg..', '..gGGg...', '...ggg...', '...ggg...', '....g....'];
    const pal = { g: '#1d5a3c', G: '#2c8a57', H: '#5fd08c' };
    rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (pal[r[x]]) R(g, x, y, 1, 1, pal[r[x]]); });
  });
  const TALLPLANT = art(13, 20, (g) => {
    const rows = ['.....G.......', '....GHG..G...', '...gGHG.GHG..', '..g.GG.gGHg..', '.gGg.G.GGg...', '.GHGgGgGg..g.', '..gGgGGg..gGg', '.g..gGGg.gHG.', 'gGg.gGGgGGg..', 'GHGgGGHGGg...',
      '.gGGgGGgG.g..', '..gGGHGGg.gGg', '.g.gGGGg.gHG.', 'gGg.gGGggGg..', '.GGgGGHGg....', '..gGGgGg.....', '....gGg......', '.....g.......', '.....g.......', '.....g.......'];
    const pal = { g: '#1d5a3c', G: '#2c8a57', H: '#5fd08c' };
    rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (pal[r[x]]) R(g, x, y, 1, 1, pal[r[x]]); });
  });
  function plant(x, y, tall) {
    return thing(x - 4, y - 4, x + 4, y + 4, tall ? 32 : 22, (g) => {
      K.box(g, x - 4, y - 4, x + 4, y + 4, 0, 7, { s: '#8a4a2b', e: '#6b3a22', t: '#a25a36' });
      K.box(g, x - 3, y - 3, x + 3, y + 3, 6.9, 7, { t: '#21180f' });
      upright(g, tall ? TALLPLANT : PLANT, x, y, 7);
    });
  }
  // light sources: invisible lamps in the room's items (iso.js lights them: a pool on the floor and a glow)
  const lamp = (x, y, color) => ({ kind: 'lamp', px: x - 8, py: y - 8, tw: 1, th: 1, color, hidden: true });
  // a person behind a counter (or a mannequin): an Actor with a look made the crew's way
  // sala: the room it belongs to (street.js naSala: its speech bubble only shows there)
  function person(look, x, y, sala) {
    const a = new DL.Actor(DL.crewLook(look), x, y, 'down');
    a.sala = sala;
    a.base = 'down';
    a.lookT = 3 + Math.random() * 4;
    return a;
  }
  // sellers look at the player when they come close, now and then somewhere else
  function lookAround(a, dt, away) {
    a.tick(dt);
    const d = Math.hypot(player.x - a.x, player.y - a.y);
    if (a.awayT > 0) { a.awayT -= dt; a.dir = away; return; }
    if (d < 80) a.dir = DL.dirOf(player.x - a.x, player.y - a.y);
    else a.dir = a.base;
    if ((a.lookT -= dt) <= 0) { a.lookT = 5 + Math.random() * 6; if (d > 30) a.awayT = 1.4; }
  }
  // the targets in a room (demo.js findTarget → street.js target): the sellers, the way out
  function nearest(list) {
    let best = null, bd = 1e9;
    for (const o of list) {
      const d = Math.hypot(player.x - o.fx, player.y - o.fy);
      if (d < o.r && d < bd) { bd = d; best = o.t; }
    }
    return best;
  }
  const atDoor = () => player.y > IN_Y - 10 && Math.abs(player.x - DOOR_X) < 18;
  const exitTarget = (id) => ({ id: 'SAIR-' + id, exit: true, leave: true, verb: 'Sair', name: 'Rua', at: [DOOR_X, (H - 1) * T + 6, 26] });
  // a seller behind the counter: E in front of them opens the Loja on a tab
  const sellerTarget = (key, who, a, aba) => ({ id: 'VENDA-' + key, exit: true, verb: 'Loja', get name() { return who().nome + ' · ' + who().papel; }, at: [a.x, a.y, 38], use: () => abrirLoja(aba) });
  const roomScene = (world, paint, things) => new DL.Scene(scene.canvas, { world, renderFloor: floorPainter(paint, things), iso: true, tilesWide: scene.o.tilesWide, minTilesHigh: scene.o.minTilesHigh });
  // the room plus its walls: big enough to fill the screen (street.js renderPlace picks the zoom from it)
  const VIEW = { w: (W + H) * T + 12, h: ((W + H) * T) / 2 + 86 };

  /* ------------------------------------------------------------------ */
  /* lojaSkins — Skin.exe                                                 */
  /* ------------------------------------------------------------------ */
  // The layout (world px, the floor is x 16…208, y 16…160; the door at x 96…128 on the front wall):
  //   back wall   shelves of folded clothes (left), the PROMO SKINS neon over the counter, a tall shelf unit
  //               of skin boxes (right), cable trays and a neon </> sign
  //   back        the counter (x 72…152) with Lia and Davi behind it; nobody walks behind it
  //   left        a lit platform along the wall with three mannequins; boxes stacked in the front corner
  //   right       the demo table with a hologram turning on it; the clothes rack; the self-service totem
  //   floor       blue tiles, a neon light strip from the door to the counter, cables to the demo table
  //   free        the strip door → counter (32 px wide or more), the aisle in front of the counter, and
  //               aisles between the platform, the strip, the totem, the rack and the demo table
  const SK = (function () {
    const world = roomWorld({ floor: 'tile', floorColor: '#172443', wall: 'panel', wallColor: '#1d2440', light: 'cold' });
    world.items.push(lamp(112, 60, '#4fd8ff'), lamp(34, 92, '#7c5cff'), lamp(178, 74, '#4fd8ff'), lamp(184, 128, '#ff5fa2'), lamp(112, 122, '#9fe8ff'), lamp(52, 34, '#9fe8ff'));
    const V = NOMES.lojaSkins.vendedores;
    const lia = person({ body: 'f', skin: '#e0ac7e', hair: '#7c3aed', hairStyle: 'bob', shirt: '#3d7bff', pants: '#1f2d44', outfit: 'blazer', earrings: true, role: 'atendente' }, 96, 27, 'lojaSkins');
    const davi = person({ body: 'm', skin: '#8d5a3b', hair: '#0f0b0a', hairStyle: 'buzz', shirt: '#2f3a4d', pants: '#232a36', outfit: 'hoodie', glasses: true, headset: true, role: 'tecnico' }, 132, 27, 'lojaSkins');
    // the mannequins wear skins from the Loja's catalog (decoration only); they turn slowly
    const MANNE_LOOK = { body: 'n', skin: '#d5dde8', hair: '#d5dde8', hairStyle: 'buzz', shirt: '#9fb4d0', pants: '#5a6a84', outfit: 'tee', role: 'funcionario' };
    const manne = [[31, 70], [31, 94], [31, 118]].map(([x, y]) => person(MANNE_LOOK, x, y, 'lojaSkins'));
    ['hx_hoodie', 'costume_astronaut', 'hx_ninja'].forEach((id, i) => {
      const it = DL.cosmetic(id), m = manne[i];
      m.blinkIn = 1e9; m.spin = i * 1.3; m.z = 4; // (standing on the platform)
      if (it) { m.outfit = it.value; m.sheet = DL.makeSheet(DL.crewLook(Object.assign({}, MANNE_LOOK, { outfit: it.value }))); }
    });
    // the hologram on the demo table: a see-through cyan figure, a little above the table
    const holo = person({ body: 'n', skin: '#7fe8ff', hair: '#4fd8ff', hairStyle: 'buzz', shirt: '#4fd8ff', pants: '#2a8fb8', outfit: 'tee', role: 'funcionario' }, 178, 73, 'lojaSkins');
    const holoIt = DL.cosmetic('hx_agent');
    if (holoIt) holo.sheet = DL.makeSheet(DL.crewLook({ body: 'n', skin: '#7fe8ff', hair: '#4fd8ff', hairStyle: 'buzz', shirt: '#4fd8ff', pants: '#2a8fb8', outfit: holoIt.value, role: 'funcionario' }));
    holo.blinkIn = 1e9; holo.spin = 0; holo.z = 13; holo.alpha = 0.6; holo.noShadow = true;

    const SIGN = art(46, 9, (g) => { R(g, 0, 0, 46, 9, '#070a12'); R(g, 0, 0, 46, 1, '#4fd8ff'); R(g, 0, 8, 46, 1, '#4fd8ff'); DL.pixText(g, 'PROMO', 2, 2, '#ffd166'); DL.pixText(g, 'SKINS', 24, 2, '#9fe8ff'); });
    const CODE = art(19, 9, (g) => { DL.pixText(g, '</>', 3, 2, '#ff5fa2'); R(g, 0, 0, 19, 1, '#7c5cff'); R(g, 0, 8, 19, 1, '#7c5cff'); });
    const POSTER = art(26, 20, (g) => {
      R(g, 0, 0, 26, 20, '#4fd8ff'); R(g, 1, 1, 24, 18, '#0b1730');
      DL.pixText(g, 'NEW', 2, 2, '#ffd166');
      R(g, 15, 4, 5, 4, '#d5dde8'); R(g, 13, 8, 9, 7, '#7c5cff'); R(g, 14, 15, 7, 3, '#1b2233');
      for (let x = 2; x < 11; x += 2) R(g, x, 10 + (x % 4) / 2, 1, 1, '#4fd8ff');
    });
    const POSTER2 = art(22, 26, (g) => {
      R(g, 0, 0, 22, 26, '#ff5fa2'); R(g, 1, 1, 20, 24, '#140b24');
      R(g, 8, 4, 6, 5, '#ffd166'); R(g, 6, 9, 10, 9, '#2de2c8'); R(g, 7, 18, 3, 4, '#1f2d44'); R(g, 12, 18, 3, 4, '#1f2d44');
      DL.pixText(g, 'HX', 6, 19, '#ff5fa2');
    });
    const SKINSIGN = art(36, 9, (g) => { DL.pixText(g, 'SKIN.EXE', 2, 2, '#4fd8ff'); });
    const COLORS = ['#2de2c8', '#7c5cff', '#ff5fa2', '#ffd166', '#3d7bff', '#ff7a17', '#e6ecf5'];

    const things = [
      // the back wall: two levels of shelves with folded clothes (left), the neon signs, cable trays, LEDs
      thing(X0, Y0, X1, Y0 + 3, 44, (g, s, t) => {
        for (const z of [18, 27]) {
          K.box(g, 20, Y0, 68, Y0 + 3, z - 1, z, { s: '#2b3a59', e: '#22345c', t: '#394b6d' });
          for (let x = 22, k = 0; x < 64; x += 7, k++) { const c = COLORS[(k + z) % 7]; K.box(g, x, Y0 + 0.5, x + 5, Y0 + 2.6, z, z + 2 + (k % 2), { s: c, e: c, t: '#f4fbff' }); }
          // a LED strip under each shelf, breathing
          const a = 0.35 + 0.3 * Math.sin(t * 2 + z);
          K.line(g, [20, Y0 + 3, z - 1.2], [68, Y0 + 3, z - 1.2], 'rgba(79,216,255,' + a.toFixed(2) + ')', 1);
        }
        // cable trays along the top of the wall, cables dropping to the counter
        K.box(g, 20, Y0, X1 - 2, Y0 + 2, 38, 39, { s: '#2b3344', e: '#222837', t: '#3a4459' });
        K.line(g, [74, Y0 + 1, 38], [74, Y0 + 1, 12], '#1b2233', 1);
        K.line(g, [150, Y0 + 1, 38], [150, Y0 + 1, 12], '#3d7bff', 1);
        // PROMO SKINS (decoration) over the counter, the </> neon on the left
        if (flick(t, 8, 3)) { glow(g, s, 112, Y0 + 4, 34, 'rgba(79,216,255,0.10)'); onBackWall(g, s, SIGN, 89, 42); }
        if (flick(t, 6, 17)) onBackWall(g, s, CODE, 35, 36);
      }, true, null, false),
      // the left wall: the NEW poster and a second one, the shop's name in neon
      thing(X0, 3 * T, X0 + 1, 9 * T, 44, (g, s, t) => {
        onLeftWall(g, s, POSTER, 82, 40);
        onLeftWall(g, s, POSTER2, 114, 42);
        if (flick(t, 5, 29)) onLeftWall(g, s, SKINSIGN, 156, 40);
      }, false),
      // the counter: a glass case with things in it, a neon line along the front, a card reader blinking
      // (behind it, up to the wall and to the shelf unit, is the sellers' side: closed)
      thing(72, 34, 152, 45, 18, (g, s, t) => {
        K.box(g, 72, 34, 152, 45, 0, 11, { s: '#14213d', e: '#101a33', t: '#2b3a59' });
        K.line(g, [72, 45, 9], [152, 45, 9], '#4fd8ff', 1);
        K.line(g, [72, 45, 2], [152, 45, 2], '#22345c', 1);
        for (let x = 78, k = 0; x < 146; x += 9, k++) K.box(g, x, 37, x + 5, 41, 11, 12.5, { s: ['#7c5cff', '#ffd166', '#2de2c8', '#ff5fa2'][k % 4], e: '#22345c', t: '#e6ecf5' });
        K.box(g, 74, 35, 150, 44, 11, 16, { s: 'rgba(160,220,255,0.14)', e: 'rgba(160,220,255,0.10)', t: 'rgba(200,240,255,0.16)' });
        K.box(g, 140, 38, 145, 41, 16, 18, { s: '#1b2233', e: '#141a28', t: Math.floor(t * 2) % 2 ? '#3dffa2' : '#145c3d' });
      }, true, [[72, 34, 152, 45], [72, Y0, 166, 34]]),
      // the tall shelf unit of skin boxes (back right corner)
      thing(166, 18, 206, 28, 40, (g, s, t) => {
        K.box(g, 166, 18, 206, 28, 0, 36, { s: '#1b2540', e: '#141b2c', t: '#2b3a59' });
        for (const z of [8, 17, 26, 35]) for (let x = 168, k = 0; x < 202; x += 7, k++) K.box(g, x, 25, x + 5, 28.2, z - 7, z - 1, { s: ['#ffd166', '#7c5cff', '#4fd8ff', '#ff5fa2'][(k + z) % 4] });
        // one box glowing on a shelf: the newest skin
        const a = 0.5 + 0.5 * Math.sin(t * 3);
        K.box(g, 189, 25, 194, 28.4, 19, 25, { s: 'rgba(255,209,102,' + (0.5 + a * 0.5).toFixed(2) + ')' });
      }),
      // the platform of the mannequins along the left wall, its edge lit
      thing(18, 54, 44, 132, 4, (g, s, t) => {
        K.box(g, 18, 54, 44, 132, 0, 3, { s: '#22345c', e: '#1b2a4a', t: '#2b3a59' });
        const a = 0.55 + 0.25 * Math.sin(t * 1.6);
        K.line(g, [44, 54, 3], [44, 132, 3], 'rgba(124,92,255,' + a.toFixed(2) + ')', 1);
        K.line(g, [18, 132, 3], [44, 132, 3], 'rgba(124,92,255,' + a.toFixed(2) + ')', 1);
        for (const m of manne) K.box(g, m.x - 5, m.y - 4, m.x + 5, m.y + 3, 3, 4, { s: '#394b6d', e: '#2b3a59', t: '#4a5f86' });
      }),
      // boxes stacked in the front left corner
      thing(18, 138, 46, 158, 22, (g) => {
        const crate = (x0, y0, x1, y1, z0, z1, c) => { K.box(g, x0, y0, x1, y1, z0, z1, { s: c, e: shade(c, -0.18), t: shade(c, 0.12) }); K.line(g, [x0, y1, (z0 + z1) / 2], [x1, y1, (z0 + z1) / 2], '#1b2233', 1); };
        crate(18, 138, 32, 158, 0, 10, '#3a4f7a'); crate(32, 140, 46, 158, 0, 9, '#4a3f6b'); crate(20, 141, 33, 156, 10, 19, '#2d6a6a'); crate(34, 143, 44, 155, 9, 15, '#3a4f7a');
      }),
      // the demo table: dark glass, a projector ring, the hologram turning over it (holo), cables
      thing(162, 62, 196, 84, 14, (g, s, t) => {
        K.box(g, 162, 62, 196, 84, 0, 10, { s: '#101a33', e: '#0c1428', t: '#1b2a4a' });
        K.line(g, [162, 84, 8], [196, 84, 8], '#7c5cff', 1);
        K.box(g, 172, 68, 184, 78, 10, 11.5, { s: '#2b3a59', e: '#22345c', t: '#4fd8ff' });
        // the beam
        const a = 0.12 + 0.05 * Math.sin(t * 5);
        K.box(g, 173, 69, 183, 77, 11.5, 38, { s: 'rgba(79,216,255,' + a.toFixed(3) + ')', e: 'rgba(79,216,255,' + (a * 0.7).toFixed(3) + ')' });
        // two pads showing skins
        K.box(g, 164, 64, 170, 69, 10, 10.6, { t: Math.floor(t * 1.2) % 2 ? '#ff5fa2' : '#7c5cff' });
        K.box(g, 188, 77, 194, 82, 10, 10.6, { t: Math.floor(t * 1.2 + 1) % 2 ? '#2de2c8' : '#3d7bff' });
      }),
      // the clothes rack: two posts, a rail, shirts on hangers
      thing(186, 104, 200, 150, 30, (g) => {
        for (const y of [106, 148]) K.box(g, 192, y - 1, 194, y + 1, 0, 24, { s: '#8a98ad', e: '#59647d', t: '#c9d3e0' });
        K.box(g, 192.5, 106, 193.5, 148, 23, 24, { s: '#c9d3e0', e: '#8a98ad', t: '#e6ecf5' });
        for (let k = 0; k < 8; k++) { const y = 109 + k * 5, c = COLORS[k % 7]; K.box(g, 189, y, 197, y + 2.2, 11, 22, { s: c, e: c, t: c }); }
      }),
      // the self-service totem (decoration only): a tall screen that scrolls
      thing(144, 116, 154, 126, 32, (g, s, t) => {
        K.box(g, 145, 118, 153, 124, 0, 3, { s: '#22345c', e: '#1b2a4a', t: '#2b3a59' });
        K.box(g, 147, 119, 151, 123, 3, 26, { s: '#1b2540', e: '#141b2c', t: '#2b3a59' });
        K.box(g, 145, 120, 153, 122, 14, 31, { s: '#0b1730', e: '#141b2c', t: '#2b3a59' });
        // the screen (its south face): lines scrolling up
        for (let k = 0; k < 6; k++) {
          const z = 16 + ((k * 2.6 + t * 4) % 14);
          K.line(g, [146, 122.1, z], [146 + 2 + ((k * 5) % 5), 122.1, z], ['#4fd8ff', '#ffd166', '#2de2c8'][k % 3], 1);
        }
        K.line(g, [145, 122.1, 30], [153, 122.1, 30], flick(t, 3, 41) ? '#4fd8ff' : '#22345c', 1);
      }),
      plant(202, 154, true), plant(58, 24), plant(140, 154),
      // the track lights over the counter (they hang from the ceiling: nothing to bump into)
      thing(76, 40, 148, 42, 46, (g, s, t) => {
        K.line(g, [76, 41, 46], [148, 41, 46], '#2b3344', 1);
        for (let x = 84; x < 148; x += 20) {
          K.line(g, [x, 41, 46], [x, 41, 41], '#2b3344', 1);
          K.box(g, x - 2, 39, x + 2, 43, 38, 41, { s: '#3a4459', e: '#2b3344', t: '#4a5569' });
          K.box(g, x - 1.5, 39.5, x + 1.5, 42.5, 37.5, 38, { s: '#e6f8ff', e: '#c9ecff', t: '#e6f8ff' });
        }
      }, false),
    ];
    function paint(g) {
      for (let y = 1; y < H; y++) for (let x = 1; x < W - 1; x++) {
        const px = x * T, py = y * T, dark = (x + y) % 2 === 0;
        R(g, px, py, T, T, dark ? '#121c33' : '#172443');
        R(g, px, py, T, 1, '#22345c'); R(g, px, py, 1, T, '#22345c');
        if (!dark) R(g, px + 7, py + 7, 2, 2, '#1d2d52');
        // a few accent tiles
        if ((x * 7 + y * 11) % 13 === 0) { R(g, px + 2, py + 2, T - 4, T - 4, '#1b2d55'); R(g, px + 2, py + 2, T - 4, 1, '#2a4a80'); }
      }
      // a darker hexagon-ish area around the demo table
      R(g, 156, 56, 46, 34, '#0f1830'); for (let k = 0; k < 46; k += 6) R(g, 156 + k, 56, 1, 34, '#1b2d55');
      // the neon light strip from the door to the counter
      R(g, 94, 48, 36, 112, '#0b1730'); R(g, 95, 49, 34, 110, '#1b3a5c');
      R(g, 96, 50, 32, 1, '#4fd8ff'); R(g, 96, 50, 1, 110, '#4fd8ff'); R(g, 127, 50, 1, 110, '#4fd8ff');
      for (let y = 58; y < 158; y += 12) R(g, 104, y, 16, 1, '#2b5a86');
      // cables on the floor: from the left wall's socket to the demo table, and to the totem
      for (let x = 46; x < 162; x++) R(g, x, 88 + Math.round(Math.sin(x / 9) * 1.5), 1, 1, x > 94 && x < 130 ? '#2a5070' : '#0a0f1c');
      for (let y = 84; y < 118; y++) R(g, 150 + Math.round(Math.sin(y / 6)), y, 1, 1, '#0a0f1c');
      doorMat(g, '#0b1222', '#3d7bff');
    }
    const sc = roomScene(world, paint, things);
    colliders(sc, things);
    const T_LIA = sellerTarget('lia', () => V.skins, lia, 'skins');
    const T_DAVI = sellerTarget('davi', () => V.equip, davi, 'equip');
    const T_OUT = exitTarget('lojaSkins');
    return {
      id: 'lojaSkins', get nome() { return NOMES.lojaSkins.nome; }, scene: sc, spawn: { x: DOOR_X, y: IN_Y }, view: VIEW,
      drawables: () => things.concat([lia, davi, holo], manne),
      people: [lia, davi],
      target: () => (atDoor() ? T_OUT : nearest([{ fx: lia.x, fy: 52, r: 22, t: T_LIA }, { fx: davi.x, fy: 52, r: 22, t: T_DAVI }])),
      update(dt) {
        lookAround(lia, dt, 'up');
        lookAround(davi, dt, 'right');
        // the mannequins turn slowly on the platform, the hologram faster
        for (const m of manne) { m.spin += dt * 0.5; m.dir = ['down', 'right', 'up', 'left'][Math.floor(m.spin) % 4]; }
        holo.spin += dt * 1.4; holo.dir = ['down', 'right', 'up', 'left'][Math.floor(holo.spin) % 4];
        holo.alpha = 0.5 + 0.12 * Math.sin(holo.spin * 3) + (DL.hash(Math.floor(holo.spin * 9)) < 0.05 ? -0.3 : 0);
      },
      enter() {},
      sellers: { lia, davi },
    };
  })();

  /* ------------------------------------------------------------------ */
  /* lojaCafe — Café Byte                                                 */
  /* ------------------------------------------------------------------ */
  // The layout (world px, the floor is x 16…208, y 16…160; the door at x 96…128 on the front wall):
  //   back wall   the jukebox in the corner, a framed picture, the menu board, shelves of jars and cups
  //               behind the barista
  //   back right  the counter (x 112…196): pastry case, coffee machine, grinder, cups; Duda behind it
  //   left        a bookshelf against the wall; the reading corner (sofa, low table, rug, floor lamp) under
  //               the window
  //   middle      one table by the bookshelf, two tables on the right, each with two stools and a lamp
  //               hanging over it
  //   free        door → counter (x 96…140 straight up), the aisle along the counter, around every table
  const CF = (function () {
    const world = roomWorld({ floor: 'wood', floorColor: '#523421', wall: 'brick', wallColor: '#5a3b2e', light: 'warm' });
    world.items.push(lamp(170, 82, '#ffb347'), lamp(170, 126, '#ffb347'), lamp(70, 62, '#ffd98a'), lamp(44, 116, '#ff8a2a'), lamp(150, 52, '#ffd98a'), lamp(28, 26, '#ff5fa2'));
    const B = NOMES.lojaCafe.barista;
    const duda = person({ body: 'n', skin: '#f2c8a0', hair: '#b8562c', hairStyle: 'ponytail', shirt: '#6b4423', pants: '#3a3f49', outfit: 'shirt', vest: true, hat: 'beanie', role: 'funcionario' }, 150, 26, 'lojaCafe');
    // the menu board on the back wall (decoration only: nothing is sold from it), 2 px between lines so the
    // slant of the wall doesn't run them together
    const MENU = art(66, 34, (g) => {
      R(g, 0, 0, 66, 34, '#7a5232'); R(g, 1, 1, 64, 32, '#16261d');
      R(g, 3, 31, 60, 1, '#ffb347');
      ['ESPRESSO', 'LATTE', 'MOCHA', 'CHA'].forEach((name, i) => {
        const y = 3 + i * 7;
        DL.pixText(g, name, 3, y, '#f2efe6');
        for (let x = 3 + name.length * 4; x < 60; x += 2) R(g, x, y + 4, 1, 1, '#4a6a58');
        R(g, 59, y + 1, 3, 3, ['#d9a066', '#f2e6d0', '#7a4a28', '#7fd08c'][i]);
      });
    });
    const NEON = art(20, 14, (g) => {
      // a neon cup
      R(g, 3, 4, 11, 1, '#ffb347'); R(g, 3, 4, 1, 8, '#ffb347'); R(g, 13, 4, 1, 8, '#ffb347'); R(g, 4, 11, 9, 1, '#ffb347');
      R(g, 14, 6, 3, 1, '#ffb347'); R(g, 16, 6, 1, 4, '#ffb347'); R(g, 14, 9, 3, 1, '#ffb347');
      R(g, 6, 0, 1, 3, '#fff2e0'); R(g, 9, 1, 1, 2, '#fff2e0'); R(g, 11, 0, 1, 3, '#fff2e0');
    });
    // a framed picture: a little landscape at dusk
    const PICTURE = art(18, 14, (g) => {
      R(g, 0, 0, 18, 14, '#8a5a3b'); R(g, 1, 1, 16, 12, '#3a2a4a'); R(g, 1, 6, 16, 3, '#c4501d'); R(g, 1, 9, 16, 4, '#2c4a3a');
      R(g, 11, 3, 3, 3, '#ffd166'); R(g, 3, 8, 4, 2, '#1d3a2a'); R(g, 9, 9, 6, 1, '#1d3a2a');
    });
    // posters on the left wall, over the reading corner: the window, a jazz poster
    const WINDOW = art(34, 22, (g) => {
      R(g, 0, 0, 34, 22, '#5a3520'); R(g, 2, 2, 30, 18, '#0d1428');
      // the city at night through the glass
      for (let k = 0; k < 7; k++) { const h = 5 + ((k * 7) % 9), x = 3 + k * 4; R(g, x, 20 - h, 3, h, '#1b2238'); if (k % 2) R(g, x + 1, 20 - h + 2, 1, 1, '#ffd98a'); }
      R(g, 25, 4, 2, 2, '#f2efe6');
      R(g, 16, 2, 2, 18, '#5a3520'); R(g, 2, 10, 30, 1, '#5a3520');
      R(g, 2, 2, 30, 1, 'rgba(255,255,255,0.18)');
    });
    const POSTER = art(16, 22, (g) => {
      R(g, 0, 0, 16, 22, '#f2e6d0'); R(g, 1, 1, 14, 20, '#c4501d');
      R(g, 5, 4, 6, 6, '#16261d'); R(g, 7, 10, 2, 7, '#16261d'); R(g, 4, 16, 5, 2, '#16261d');
      DL.pixText(g, 'JAZ', 2, 15, '#ffd166');
    });
    const BOOKS = ['#c4501d', '#2c6a8a', '#7a4a28', '#ffb347', '#3a6a4a', '#8a3a5a', '#d9a066', '#4a4a7a'];
    const table = (cx, cy) => thing(cx - 8, cy - 7, cx + 8, cy + 7, 12, (g, s, t) => {
      K.box(g, cx - 1, cy - 1, cx + 1, cy + 1, 0, 10, { s: '#2b3344', e: '#222837', t: '#3a4459' });
      K.box(g, cx - 4, cy - 3, cx + 4, cy + 3, 0, 0.8, { s: '#2b3344', e: '#222837', t: '#3a4459' });
      K.box(g, cx - 8, cy - 7, cx + 8, cy + 7, 10, 11.2, { s: '#6b4423', e: '#5a3520', t: '#8a5a3b' });
      // a cup (steaming) and a plate with a cake
      K.box(g, cx + 2, cy - 3, cx + 4.5, cy - 0.5, 11.2, 13.5, { s: '#e6ecf5', e: '#c9d3e0', t: '#3b2414' });
      K.box(g, cx - 5, cy, cx - 1, cy + 4, 11.2, 11.8, { s: '#c9d3e0', e: '#a9b3c0', t: '#e6ecf5' });
      K.box(g, cx - 4, cy + 1, cx - 2, cy + 3, 11.8, 13, { s: '#d9a066', e: '#c98e66', t: '#f2c48a' });
      steam(g, t, cx + 3, cy - 2, 14, 2, 8, 0.35);
    });
    const stool = (x, y) => thing(x - 3, y - 3, x + 3, y + 3, 8, (g) => {
      K.box(g, x - 0.6, y - 0.6, x + 0.6, y + 0.6, 0, 6, { s: '#2b3344', e: '#222837', t: '#3a4459' });
      K.box(g, x - 3, y - 3, x + 3, y + 3, 6, 7.2, { s: '#c4501d', e: '#a3401a', t: '#ff8a2a' });
    });
    // a lamp hanging over a table (the light itself: lamp() above); it sways a tiny bit and glows warm
    const pendant = (cx, cy) => thing(cx - 2, cy - 2, cx + 2, cy + 2, 46, (g, s, t) => {
      const sw = Math.sin(t * 0.9 + cx) * 0.4;
      K.line(g, [cx, cy, 46], [cx + sw, cy, 33], '#2b3344', 1);
      K.box(g, cx - 3 + sw, cy - 2, cx + 3 + sw, cy + 2, 29, 33, { s: '#ff8a2a', e: '#c4501d', t: '#ffb347' });
      const on = 0.85 + 0.15 * Math.sin(t * 7 + cx) * (DL.hash(Math.floor(t * 4) + cx) < 0.08 ? 1 : 0.1);
      K.box(g, cx - 1.5 + sw, cy - 1, cx + 1.5 + sw, cy + 1, 28, 29, { s: 'rgba(255,242,196,' + on.toFixed(2) + ')', e: '#ffe3a1', t: '#fff2c4' });
    }, false);
    // steam: little puffs rising from (x, y, z), n of them, h high
    function steam(g, t, x, y, z, n, h, alpha) {
      for (let k = 0; k < n; k++) {
        const ph = (t * 0.5 + k / n + x * 0.01) % 1, zz = z + ph * h, dx = Math.sin(t * 2 + k + x) * 1.2 * ph, sz = ph < 0.5 ? 1 : 2;
        g.fillStyle = 'rgba(245,240,230,' + (alpha * (1 - ph)).toFixed(3) + ')';
        g.fillRect(Math.round(IX(x + dx, y)) - (sz >> 1), Math.round(IY(x + dx, y, zz)), sz, sz);
      }
    }
    const things = [
      // the back wall: the picture, the menu board, the shelves of jars and cups behind the barista
      thing(X0, Y0, X1, Y0 + 3, 44, (g, s) => {
        onBackWall(g, s, PICTURE, 42, 40);
        onBackWall(g, s, MENU, 64, 43);
        K.box(g, 140, Y0, 206, Y0 + 3, 33, 34, { s: '#6b4423', e: '#5a3520', t: '#8a5a3b' });
        for (let x = 142, k = 0; x < 204; x += 6, k++) K.box(g, x, Y0 + 0.5, x + 4, Y0 + 2.6, 34, 39 - (k % 2), { s: k % 3 ? '#8a5a3b' : '#c4501d', e: '#5a3520', t: '#d9a066' });
        K.box(g, 140, Y0, 206, Y0 + 3, 23, 24, { s: '#6b4423', e: '#5a3520', t: '#8a5a3b' });
        for (let x = 143, k = 0; x < 204; x += 5, k++) K.box(g, x, Y0 + 0.8, x + 3, Y0 + 2.6, 24, 28, { s: 'rgba(230,236,245,0.5)', e: 'rgba(200,210,220,0.4)', t: ['#3b2414', '#f2efe6', '#7a4a28'][k % 3] });
      }, true, null, false),
      // the left wall: the neon cup (flickers a little), the window over the sofa, a poster
      thing(X0, 3 * T, X0 + 1, 9 * T, 44, (g, s, t) => {
        if (flick(t, 7, 5)) onLeftWall(g, s, NEON, 90, 40);
        onLeftWall(g, s, WINDOW, 138, 40);
        onLeftWall(g, s, POSTER, 156, 38);
      }, false),
      // the jukebox in the back left corner: lights running around its arch
      thing(18, 18, 36, 30, 30, (g, s, t) => {
        K.box(g, 18, 18, 36, 30, 0, 22, { s: '#5a2a3a', e: '#4a2030', t: '#7a3a4a' });
        K.box(g, 19, 19, 35, 29, 22, 26, { s: '#7a3a4a', e: '#5a2a3a', t: '#ffd166' });
        for (let k = 0; k < 6; k++) {
          const on = (Math.floor(t * 6) + k) % 6 < 3;
          K.box(g, 19 + k * 2.6, 29.6, 21 + k * 2.6, 30.4, 14, 20, { s: on ? ['#ff5fa2', '#ffd166', '#4fd8ff'][k % 3] : '#3a1a2a' });
        }
        K.box(g, 21, 29.5, 33, 30.5, 6, 12, { s: '#1b1012' });
        for (let k = 0; k < 4; k++) K.line(g, [22 + k * 3, 30.6, 7], [22 + k * 3, 30.6, 11], '#c9a24a', 1);
        // the music notes floating out of it
        for (let k = 0; k < 2; k++) {
          const ph = (t * 0.35 + k / 2) % 1;
          g.fillStyle = 'rgba(255,209,102,' + (0.8 * (1 - ph)).toFixed(2) + ')';
          const X = Math.round(IX(38 + ph * 6, 24)), Y = Math.round(IY(38 + ph * 6, 24, 24 + ph * 14));
          g.fillRect(X, Y, 1, 3); g.fillRect(X - 2, Y + 2, 2, 2);
        }
      }),
      // the bookshelf against the left wall: books, cups and a little plant
      thing(17, 40, 26, 78, 40, (g) => {
        K.box(g, 17, 40, 26, 78, 0, 38, { s: '#5a3520', e: '#4a2c18', t: '#6b4423' });
        for (const z of [2, 11, 20, 29]) {
          K.box(g, 17, 40, 26, 78, z - 0.6, z, { s: '#6b4423', e: '#5a3520' });
          for (let y = 42, k = 0; y < 76; y += 3, k++) {
            if (z === 20 && k % 4 === 1) { K.box(g, 21, y, 24, y + 2.5, z, z + 3, { s: '#e6ecf5', e: '#c9d3e0', t: '#3b2414' }); continue; } // a cup
            const c = BOOKS[(k * 3 + z) % BOOKS.length], hh = 6 + ((k + z) % 3);
            K.box(g, 19, y, 26, y + 2.4, z, z + hh, { e: c, t: shade(c, 0.15) });
          }
        }
      }),
      // the reading corner: the sofa against the wall (seat, back, arms, cushions), the low table, a floor lamp
      thing(18, 98, 36, 140, 16, (g) => {
        K.box(g, 18, 98, 36, 140, 0, 7, { s: '#7a2e1f', e: '#6b2a1a', t: '#a5402a' });
        K.box(g, 18, 98, 23, 140, 7, 16, { s: '#6b2a1a', e: '#8a3522', t: '#a5402a' });
        K.box(g, 18, 98, 36, 103, 7, 11, { s: '#8a3522', e: '#6b2a1a', t: '#a5402a' });
        K.box(g, 18, 135, 36, 140, 7, 11, { s: '#8a3522', e: '#6b2a1a', t: '#a5402a' });
        K.box(g, 23, 106, 30, 116, 7, 10, { s: '#ffb347', e: '#c98e2a', t: '#ffd98a' });
        K.box(g, 23, 122, 30, 132, 7, 10, { s: '#3a6a4a', e: '#2c5a3a', t: '#5a8a6a' });
      }),
      thing(46, 110, 62, 126, 8, (g, s, t) => {
        K.box(g, 47, 111, 49, 113, 0, 6, { s: '#3b2414' }); K.box(g, 59, 123, 61, 125, 0, 6, { s: '#3b2414' });
        K.box(g, 46, 110, 62, 126, 6, 7.5, { s: '#6b4423', e: '#5a3520', t: '#8a5a3b' });
        K.box(g, 49, 113, 56, 118, 7.5, 9, { e: '#2c6a8a', s: '#2c6a8a', t: '#e6ecf5' }); // a book
        K.box(g, 57, 119, 59.5, 121.5, 7.5, 9.8, { s: '#e6ecf5', e: '#c9d3e0', t: '#3b2414' });
        steam(g, t, 58, 120, 10, 2, 7, 0.35);
      }),
      thing(20, 144, 28, 152, 34, (g, s, t) => {
        K.box(g, 21, 145, 27, 151, 0, 1.5, { s: '#2b3344', e: '#222837', t: '#3a4459' });
        K.box(g, 23.5, 147.5, 24.5, 148.5, 1.5, 26, { s: '#2b3344', e: '#222837' });
        K.box(g, 20, 144, 28, 152, 26, 32, { s: '#ffb347', e: '#c98e2a', t: '#ffd98a' });
        glow(g, s, 24, 148, 22, 'rgba(255,179,71,0.08)');
      }),
      // the counter: wood with an orange line, a marble top, the pastry case, the coffee machine, the grinder,
      // cups waiting (behind it, up to the wall, is the barista's side: closed)
      thing(112, 34, 196, 45, 24, (g, s, t) => {
        K.box(g, 112, 34, 196, 45, 0, 11, { s: '#5a3520', e: '#4a2c18', t: '#c9c7c2' });
        K.line(g, [112, 45, 8], [196, 45, 8], '#ff8a2a', 1);
        for (let x = 116; x < 194; x += 6) K.line(g, [x, 45, 1], [x, 45, 7], '#4a2c18', 1);
        // the pastry case
        K.box(g, 116, 36, 140, 43, 11, 12, { s: '#3b2414', e: '#2a1a10', t: '#5a3520' });
        for (let x = 118, k = 0; x < 138; x += 5, k++) K.box(g, x, 38, x + 3.5, 41, 12, 14, { s: ['#d9a066', '#f7c6d9', '#8a5a3b'][k % 3], e: '#7a4a28', t: ['#f2c48a', '#fff2f7', '#c98e66'][k % 3] });
        K.box(g, 116, 36, 140, 43, 12, 17, { s: 'rgba(255,230,200,0.14)', e: 'rgba(255,230,200,0.10)', t: 'rgba(255,240,220,0.18)' });
        // the coffee machine: chrome, a light, two spouts, a cup under them, steam out of the top
        K.box(g, 160, 35, 176, 42, 11, 22, { s: '#a9b3c0', e: '#8a98ad', t: '#c9d3e0' });
        K.box(g, 160, 35, 176, 42, 22, 23, { s: '#59647d', e: '#434d63', t: '#8a98ad' });
        K.box(g, 162, 41.5, 174, 42.2, 15, 21, { s: '#2b3344' });
        K.box(g, 171, 41.6, 173, 42.4, 19, 20.5, { s: Math.floor(t * 1.5) % 2 ? '#ffb347' : '#ff8a2a' });
        K.box(g, 164, 42, 167, 45, 11, 13, { s: '#e6ecf5', e: '#c9d3e0', t: '#3b2414' });
        steam(g, t, 166, 38, 23, 4, 14, 0.45);
        // the grinder: a hopper of beans on a black base
        K.box(g, 182, 37, 190, 43, 11, 17, { s: '#2b3344', e: '#222837', t: '#3a4459' });
        K.box(g, 183, 38, 189, 42, 17, 23, { s: 'rgba(230,220,200,0.35)', e: 'rgba(200,190,170,0.3)', t: '#3b2414' });
        K.box(g, 184, 39, 188, 41, 17, 21, { s: '#5a3520', e: '#4a2c18' });
        // cups in a row
        for (let x = 144; x < 156; x += 4) K.box(g, x, 39, x + 2.5, 41.5, 11, 13, { s: '#e6ecf5', e: '#c9d3e0', t: '#f2efe6' });
      }, true, [[112, 34, 196, 45], [112, Y0, X1, 34], [196, Y0, X1, 45]]),
      table(70, 62), stool(56, 62), stool(84, 62), pendant(70, 62),
      table(170, 82), stool(156, 82), stool(184, 82), pendant(170, 82),
      table(170, 126), stool(156, 126), stool(184, 126), pendant(170, 126),
      plant(202, 154, true), plant(86, 152), plant(52, 24, true),
    ];
    function paint(g) {
      for (let y = 1; y < H; y++) for (let x = 1; x < W - 1; x++) {
        const px = x * T, py = y * T;
        for (let k = 0; k < 4; k++) {
          const base = (x + y * 3 + k) % 3 === 0 ? '#5a3a24' : (x * 7 + k) % 5 === 0 ? '#4a2f1e' : '#523421';
          R(g, px, py + k * 4, T, 4, base);
          R(g, px, py + k * 4, T, 1, '#6b4429');
          R(g, px + ((x * 5 + y * 3 + k * 7) % 12) + 2, py + k * 4 + 1, 1, 3, '#3b2414');
        }
      }
      // the rug of the reading corner, and a round-ish rug under each table
      R(g, 16, 92, 60, 58, '#3a1f3a'); R(g, 18, 94, 56, 54, '#6b2e4a');
      for (let k = 0; k < 56; k += 4) { R(g, 18 + k, 96, 2, 1, '#ffb347'); R(g, 18 + k, 145, 2, 1, '#ffb347'); }
      R(g, 22, 100, 48, 42, '#7a3a5a');
      for (const [cx, cy] of [[70, 62], [170, 82], [170, 126]]) { R(g, cx - 18, cy - 10, 36, 20, '#7a2e1f'); R(g, cx - 16, cy - 8, 32, 16, '#a5402a'); R(g, cx - 14, cy - 6, 28, 1, '#ffb347'); R(g, cx - 14, cy + 5, 28, 1, '#ffb347'); }
      // a path of darker planks along the counter (where people wait)
      R(g, 112, 46, 84, 10, 'rgba(30,18,10,0.35)');
      doorMat(g, '#2a1a10', '#ff8a2a');
    }
    const sc = roomScene(world, paint, things);
    colliders(sc, things);
    const T_DUDA = sellerTarget('duda', () => B, duda, 'special');
    const T_OUT = exitTarget('lojaCafe');
    return {
      id: 'lojaCafe', get nome() { return NOMES.lojaCafe.nome; }, scene: sc, spawn: { x: DOOR_X, y: IN_Y }, view: VIEW,
      drawables: () => things.concat([duda]),
      people: [duda],
      target: () => (atDoor() ? T_OUT : nearest([{ fx: duda.x, fy: 52, r: 26, t: T_DUDA }])),
      update(dt) { lookAround(duda, dt, 'right'); },
      enter() {},
      duda,
    };
  })();
  function shade(hex, k) {
    const n = parseInt(hex.slice(1), 16), f = (c) => Math.max(0, Math.min(255, Math.round(c + (k > 0 ? (255 - c) * k : c * k))));
    return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => f(c).toString(16).padStart(2, '0')).join('');
  }
  DL.Street.addPlace(SK);
  DL.Street.addPlace(CF);

  DL.Lojas = {
    abrirLoja, aplicarDescontos,
    // for automated checks
    _: { SK, CF },
  };
})();
