/* DataLab — interactions: what people can do with the objects around them, shared by everybody who
   walks the floor (the player, the crew bots, the visitors at the reception).
   One table maps object kinds (and variants) to an affordance:
     drink — walk up, fill a cup / grab a can or a snack, drink it (coffee, water, tea, soda, food)
     rest  — sit down for a while (sofas, armchairs, beanbags, poufs, a free chair)
     watch — stand in front and look (TVs, status screens)
     use   — hands on it (whiteboards, arcade, workbenches, the sink, the printer, a bookshelf)
   and a few helpers say where to stand (in front of the object, by its rotation, on a free tile),
   where each seat is and who is sitting there. New objects only need a line in AFFORD. */
(function () {
  'use strict';
  const DL = window.DL, T = DL.T;
  const rand = Math.random;
  const pick = (a) => a[Math.floor(rand() * a.length)];

  const AFFORD = {};
  const def = (kinds, o) => kinds.split(' ').forEach((k) => { AFFORD[k] = o; });
  def('coffee espresso coffeebar', { type: 'drink', cup: 'coffee', verb: 'Tomar um café', doing: 'Pegando café', dur: [7, 11] });
  def('kettle', { type: 'drink', cup: 'tea', verb: 'Fazer um chá', doing: 'Fazendo chá', dur: [8, 12] });
  def('water', { type: 'drink', cup: 'water', verb: 'Beber água', doing: 'Pegando água', dur: [6, 9] });
  def('fridge', { type: 'drink', cup: 'soda', verb: 'Pegar um refrigerante', doing: 'Pegando um refrigerante', dur: [7, 10] });
  def('vending', { type: 'drink', cup: () => (rand() < 0.5 ? 'soda' : 'snack'), verb: 'Comprar um lanche', doing: 'Comprando um lanche', dur: [7, 10] });
  def('microwave', { type: 'drink', cup: 'food', verb: 'Esquentar a marmita', doing: 'Esquentando a comida', dur: [12, 16], fill: 2.6 });
  def('snacks', { type: 'drink', cup: 'snack', verb: 'Pegar um biscoito', doing: 'Pegando biscoito', dur: [5, 7] });
  def('sofa', { type: 'rest', verb: 'Sentar', doing: 'Descansando', dur: [9, 14] });
  def('beanbag pouf', { type: 'rest', verb: 'Sentar', doing: 'Descansando', dur: [8, 13] });
  def('tvstand tvwall wallscreen', { type: 'watch', verb: 'Assistir', doing: 'Assistindo TV', dur: [8, 13] });
  def('arcade', { type: 'use', anim: 'reach', verb: 'Jogar', doing: 'Jogando fliperama', dur: [9, 14] });
  def('whiteboard glassboard kanban wboard', { type: 'use', anim: 'reach', verb: 'Usar o quadro', doing: 'Desenhando no quadro', dur: [8, 12] });
  def('sink', { type: 'use', anim: 'reach', verb: 'Lavar a caneca', doing: 'Lavando a caneca', dur: [5, 7] });
  def('printer', { type: 'use', anim: 'reach', verb: 'Imprimir', doing: 'Imprimindo', dur: [5, 7] });
  def('shelf cabinet steelrack', { type: 'use', anim: 'reach', verb: 'Pegar material', doing: 'Procurando material', dur: [4, 6] });
  const BENCH = { type: 'use', anim: 'reach', verb: 'Trabalhar na bancada', doing: 'Trabalhando na bancada', dur: [10, 16], bench: true };
  const SEAT = { type: 'rest', verb: 'Sentar', doing: 'Sentado(a)', dur: [8, 12], chair: true };
  DL.AFFORD = AFFORD;

  // the affordance of an object (null when it does nothing)
  function of(e) {
    if (!e || !e.kind) return null;
    if (e.kind === 'table') return e.variant === 'bench' || e.variant === 'lab' || e.variant === 'repair' || e.variant === 'tech' ? BENCH : null;
    if (e.kind === 'tvrack') return e.variant === 'audio' ? null : AFFORD.tvstand;
    // a loose chair is a seat; chairs of desks are workstations (crew.js)
    if (e.kind === 'chair') return e.parent ? null : SEAT;
    if ((e.kind === 'shelf' || e.kind === 'cabinet') && e.wall) return null;
    return AFFORD[e.kind] || null;
  }
  const cupOf = (a) => (typeof a.cup === 'function' ? a.cup() : a.cup);

  /* ---------- where to stand ---------- */
  const DIR_OF = ['up', 'down', 'left', 'right']; // facing the object when standing on its front side (rot 0..3)
  function freeAt(w, tx, ty) {
    if (tx < 0 || ty < 0 || tx >= w.W || ty >= w.H) return false;
    if (w.solid && w.solid[ty * w.W + tx]) return false;
    const t = w.tiles[ty * w.W + tx];
    // (door passages and chairs are walkable, but nobody should stop there)
    return t !== '#' && t !== 'w' && !(w.keepClear && w.keepClear.has(tx + ',' + ty)) && !w.items.some((x) => x.kind === 'chair' && x.tx === tx && x.ty === ty);
  }
  // a free tile next to the object, its front side first (rot), then the others; { x, y, dir }
  function standPoint(e, w) {
    const h = e.host || e;
    if (e.wall) {
      // wall pieces hang over a floor tile: stand on it (or right in front)
      for (const dy of [0, 1]) if (freeAt(w, e.tx + Math.floor((e.tw - 1) / 2), e.ty + dy)) return { x: (e.tx + Math.floor((e.tw - 1) / 2)) * T + 8, y: (e.ty + dy) * T + 10, dir: 'up', tx: e.tx, ty: e.ty + dy };
      return null;
    }
    const tw = h.tw || 1, th = h.th || 1, r = h.rot | 0;
    const mid = (n) => Math.floor((n - 1) / 2);
    const sides = {
      s: [[h.tx + mid(tw), h.ty + th], 'up'], n: [[h.tx + mid(tw), h.ty - 1], 'down'],
      e: [[h.tx + tw, h.ty + mid(th)], 'left'], w: [[h.tx - 1, h.ty + mid(th)], 'right'],
    };
    const order = [['s', 'e', 'w', 'n'], ['n', 'e', 'w', 's'], ['e', 's', 'n', 'w'], ['w', 's', 'n', 'e']][r];
    // a thing on a table is reached from the table's free sides; also try along the long sides
    for (const k of order) {
      const [[tx, ty], dir] = sides[k];
      if (freeAt(w, tx, ty)) return { x: tx * T + 8, y: ty * T + 10, dir, tx, ty };
      const along = k === 's' || k === 'n' ? [[1, 0], [-1, 0]] : [[0, 1], [0, -1]];
      for (const [dx, dy] of along) if (freeAt(w, tx + dx, ty + dy) && (k === 's' || k === 'n' ? tx + dx >= h.tx && tx + dx < h.tx + tw : ty + dy >= h.ty && ty + dy < h.ty + th)) return { x: (tx + dx) * T + 8, y: (ty + dy) * T + 10, dir, tx: tx + dx, ty: ty + dy };
    }
    return null;
  }

  /* ---------- seats ---------- */
  // every seat of a sofa / pouf / chair: where to sit, which way to face, the tile to step from
  function seats(e, w) {
    const r = e.rot | 0, out = [];
    if (e.kind === 'sofa') {
      const side = r === 2 || r === 3, n = side ? e.th || 1 : e.tw || 1;
      for (let k = 0; k < n; k++) {
        let sit, dir, from;
        if (r === 0) { sit = { x: e.px + 8 + k * 16, y: e.py + 10 }; dir = 'down'; from = [e.tx + k, e.ty + e.th]; }
        else if (r === 1) { sit = { x: e.px + 8 + k * 16, y: e.py + 7 }; dir = 'up'; from = [e.tx + k, e.ty - 1]; }
        else if (r === 2) { sit = { x: e.px + 10, y: e.py + 9 + k * 16 }; dir = 'right'; from = [e.tx + e.tw, e.ty + k]; }
        else { sit = { x: e.px + 6, y: e.py + 9 + k * 16 }; dir = 'left'; from = [e.tx - 1, e.ty + k]; }
        out.push({ k, sit, dir, from });
      }
    } else if (e.kind === 'chair') {
      const s = DL.isoSeatPoint ? DL.isoSeatPoint(e) : { x: e.px + 8, y: e.py + 4 };
      out.push({ k: 0, sit: s, dir: DIR_OF[r], from: [e.tx, e.ty], onTile: true });
    } else {
      out.push({ k: 0, sit: { x: e.px + 8, y: e.py + 10 }, dir: 'down', from: [e.tx, e.ty + (e.th || 1)] });
    }
    // step off onto a free tile: the front first, else any free neighbour of the seat's tile
    for (const s of out) {
      if (s.onTile || freeAt(w, s.from[0], s.from[1])) continue;
      const sx = Math.floor(s.sit.x / T), sy = Math.floor(s.sit.y / T);
      s.from = [[0, 1], [1, 0], [-1, 0], [0, -1]].map(([dx, dy]) => [sx + dx, sy + dy]).find(([x, y]) => freeAt(w, x, y)) || null;
    }
    return out.filter((s) => s.from).map((s) => Object.assign(s, { item: e, fromPt: { x: s.from[0] * T + 8, y: s.from[1] * T + 10 }, sortKey: (e.sortY || e.py + 16) + 0.5 }));
  }

  // who sits where / who uses what (any actor: crew member, player, visitor)
  const taken = new Map(); // key → actor
  const keyOf = (e, k) => (e.id || e.seed + ':' + e.tx + ',' + e.ty + ':' + e.kind) + '#' + (k || 0);
  function claim(e, k, who) {
    const key = keyOf(e, k), h = taken.get(key);
    if (h && h !== who && h.__alive !== false) return false;
    release(who);
    taken.set(key, who);
    who.__claim = key;
    return true;
  }
  function release(who) {
    if (who && who.__claim && taken.get(who.__claim) === who) taken.delete(who.__claim);
    if (who) who.__claim = null;
  }
  const holder = (e, k) => taken.get(keyOf(e, k)) || null;
  // a free seat (closest to `from` when given)
  function freeSeat(e, w, who, from) {
    const list = seats(e, w).filter((s) => { const h = holder(e, s.k); return !h || h === who; });
    if (from) list.sort((a, b) => Math.hypot(a.fromPt.x - from.x, a.fromPt.y - from.y) - Math.hypot(b.fromPt.x - from.x, b.fromPt.y - from.y));
    return list[0] || null;
  }
  // a single-user object (TV spot, board, machine) is free?
  const freeUse = (e, who) => { const h = holder(e, 'use'); return !h || h === who; };

  // everything in the world that offers `type` (optionally filtered)
  function offers(w, type, ok) {
    return w.items.filter((e) => { const a = of(e); return a && a.type === type && (!ok || ok(e, a)); });
  }

  // a short line someone says after an interaction (sometimes)
  const SAY = {
    coffee: ['Café recarregado. Voltando!', 'Agora sim, com café o terminal até digita sozinho ☕', 'Esse café está forte hoje.'],
    tea: ['Um chazinho para acalmar o plantão 🍵', 'Chá verde e foco total.'],
    water: ['Água gelada salva o turno.', 'Hidratado(a)! Voltando.'],
    soda: ['Refri gelado 🥤 agora sim.', 'Nada como um refrigerante no meio da tarde.'],
    snack: ['Lanchinho rápido e de volta ao trabalho.', 'Quem deixou os biscoitos acabarem?! Peguei o último 🍪'],
    food: ['Marmita quente, missão cumprida 🍱', 'Almoço rápido entre um chamado e outro.'],
    rest: ['Esse pufe é perigoso, quase cochilei 😴', 'Cinco minutinhos e a cabeça volta a funcionar.', 'Pronto, energia recarregada.'],
    watch: ['Vi o placar: 2 a 1 pra gente ⚽', 'Notícia boa: ninguém falou de queda de datacenter hoje.', 'Pausa rápida na TV, já volto.'],
    use: ['Pronto, deixei anotado no quadro.', 'Bancada organizada.', 'Recorde novo no fliperama 🕹️'],
  };
  const sayFor = (a, cup) => (rand() < 0.35 ? pick(SAY[a.type === 'drink' ? cup || 'coffee' : a.type] || SAY.use) : null);

  // What someone holds after an interaction, in their sprite coordinates (cups, cans, snacks, a lunch
  // box): in the hand, or at the mouth while sipping (`sip`). The seed varies the steam.
  DL.drawHeld = function (g, a, what, sip, t, seed) {
    if (!what) return;
    const side = a.dir === 'left' ? -5 : 4;
    const x = Math.round(a.x) + (sip ? (a.dir === 'left' ? -3 : a.dir === 'right' ? 2 : 1) : side);
    const y = Math.round(a.y) - (sip ? 18 : 10);
    if (a.dir === 'up' && sip) return; // drinking with the back turned: hidden by the head
    const F = (c, dx, dy, w, h) => { g.fillStyle = c; g.fillRect(x + dx, y + dy, w, h); };
    if (what === 'water') { F('rgba(140,196,255,0.85)', 0, 0, 3, 4); F('#d6ecff', 0, 0, 3, 1); }
    else if (what === 'soda') { F('#c0392b', 0, -1, 3, 5); F('#c9ced6', 0, -1, 3, 1); F('#ffffff', 1, 1, 1, 1); }
    else if (what === 'snack') { F('#ffd23f', 0, 0, 4, 4); F('#ff7a17', 0, 1, 4, 1); }
    else if (what === 'food') { if (sip) return; F('#2a5d8a', -1, 1, 5, 3); F('#e9e9e6', -1, 0, 5, 1); F('#c9a06a', 0, 0, 3, 1); }
    else {
      const tea = what === 'tea';
      F(tea ? '#c9a06a' : '#e9e9e6', 0, 0, 3, 4); F(tea ? '#8a5a2c' : '#3b2418', 0, 0, 3, 1); F(tea ? '#c9a06a' : '#e9e9e6', 3, 1, 1, 2);
      if (!sip && Math.sin(t * 3 + (seed || 0)) > 0.2) { g.globalAlpha = 0.35; F('#ffffff', 1, -2 - (Math.floor(t * 2) % 2), 1, 1); g.globalAlpha = 1; }
    }
  };

  DL.Interact = { of, cupOf, standPoint, seats, freeSeat, claim, release, holder, freeUse, offers, sayFor, freeAt, keyOf };
})();
