/* DataLab — crew: character creator (team + the player's own character), pathfinding, workstations,
   the team panel and the crew's autonomous behaviour.
   Every member always has a job (see jobs.js): a real task of their role, picked by the player
   ("Atribuir tarefa") or by themselves. Jobs move them around:
   pc: going → sitting → working → standing · equip/fix: toEquip → inspecting · spot: toSpot → atSpot
   patrol: walks room to room · visit: toVisit → talking. Finishing a job gives experience, trains a
   skill and usually ends with a message in the team chat. */
(function () {
  'use strict';
  const DL = window.DL, T = DL.T;
  const rand = Math.random;
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const between = (a, b) => a + rand() * (b - a);

  /* ------------------------------------------------------------------ */
  /* Roles + appearance options                                          */
  /* ------------------------------------------------------------------ */
  const ROLES = {
    redes: { name: 'Redes', title: 'Técnico(a) de redes', color: '#a0c3ec', work: 'net', desc: 'Switches, cabos e conectividade.' },
    servidores: { name: 'Servidores', title: 'Técnico(a) de servidores', color: '#ffc285', work: 'srv', desc: 'Instala e mantém o hardware.' },
    sysadmin: { name: 'Sysadmin', title: 'Administrador(a) de sistemas', color: '#c4b5fd', work: 'code', desc: 'Sistemas, alertas e incidentes.' },
    tecnico: { name: 'Técnico de TI', title: 'Técnico(a) de TI', color: '#5eead4', work: 'srv', desc: 'Conserta PCs e switches na bancada e instala equipamentos.' },
    seguranca: { name: 'Segurança', title: 'Segurança', color: '#ff7a17', work: 'cam', desc: 'Rondas, acessos e câmeras.' },
    funcionario: { name: 'Assistente', title: 'Assistente', color: '#dadbdf', work: 'doc', desc: 'Chamados, inventário e documentação.' },
    gerente: { name: 'Gerente', title: 'Gerente', color: '#7ee0a1', work: 'kpi', desc: 'Indicadores, capacidade e equipe.' },
    atendente: { name: 'Atendente', title: 'Atendente', color: '#f9a8d4', work: 'doc', desc: 'Recebe clientes na recepção e atende chamados pelo computador.' },
  };
  const ROLE_IDS = Object.keys(ROLES); // the built-in roles (random hires pick from these)
  DL.ROLES = ROLES;
  // every role, including the ones the player created (roles.js adds them to ROLES)
  const allRoleIds = () => Object.keys(ROLES);

  const SKINS = ['#f5d3b8', '#f2c8a0', '#e0ac7e', '#c98e66', '#8d5a3b', '#5e3a26'];
  const HAIRS = ['#0f0b0a', '#2a1c16', '#5a3a25', '#b8562c', '#d9b26a', '#c9c9c9', '#7c3aed', '#3d5a80'];
  const CLOTHES = ['#2f3a4d', '#3b4250', '#232a36', '#7c3aed', '#a0c3ec', '#c4b5fd', '#ffc285', '#e9e9e6', '#1f6f5c', '#8a2d3b'];
  const PANTS = ['#232a36', '#1b1f27', '#2a3140', '#3a3f49', '#4a3a2a', '#1f2d44'];
  const BODIES = [['f', 'Feminina'], ['m', 'Masculina'], ['n', 'Neutra']];
  const STYLES = [['short', 'Curto'], ['buzz', 'Raspado'], ['curly', 'Cacheado'], ['afro', 'Black'], ['bun', 'Coque'], ['ponytail', 'Rabo'], ['long', 'Longo'], ['bob', 'Chanel']];
  const OUTFITS = [['tee', 'Camiseta'], ['shirt', 'Camisa'], ['hoodie', 'Moletom'], ['blazer', 'Blazer'], ['uniform', 'Uniforme']];
  const HATS = [['', 'Nenhum'], ['cap', 'Boné'], ['beanie', 'Gorro']];
  const EXTRAS = [['glasses', 'Óculos'], ['beard', 'Barba'], ['headset', 'Headset'], ['earrings', 'Brincos'], ['vest', 'Colete']];
  DL.LOOK_LABELS = { BODIES, STYLES, OUTFITS, EXTRAS }; // the player card of an online room (lobby.js)
  const NAMES = {
    f: ['Ana', 'Bruna', 'Camila', 'Larissa', 'Fernanda', 'Patrícia', 'Luana', 'Beatriz', 'Isabela', 'Renata', 'Carla', 'Yasmin', 'Marina'],
    m: ['Pedro', 'Lucas', 'Gabriel', 'Thiago', 'Rodrigo', 'Felipe', 'Diego', 'André', 'Caio', 'Vinícius', 'Mateus', 'Bruno'],
    n: ['Alex', 'Sam', 'Dani', 'Kim', 'Rafa', 'Jô', 'Gabi', 'Nic', 'Cris', 'Val'],
  };
  const MAX_CREW = 12;

  function lookOf(p) {
    const r = ROLES[p.role] || ROLES.funcionario;
    return {
      skin: p.skin, hair: p.hair, hairStyle: p.hairStyle, shirt: p.shirt, pants: p.pants, shoes: p.shoes || '#16181d',
      body: p.body, outfit: p.outfit, vest: p.vest ? '#5a6170' : null, glasses: p.glasses, beard: p.beard, earrings: p.earrings,
      hat: p.hat || null, capColor: r.color, headset: p.headset,
      role: p.role, roleColor: r.color, badge: r.color, lanyard: r.color,
      // shop cosmetics (cosmetics.js): pants style, accessories, the hat's own colour, the legendary visor
      pantsStyle: p.pantsStyle || null, shades: p.shades, scarf: p.scarf, chain: p.chain, backpack: p.backpack,
      hatColor: p.hatColor || null, visor: p.visor,
      // the player's accessories by body position (inventory.js keeps them in sync)
      gear: p.gear || null,
    };
  }
  DL.crewLook = lookOf;
  // the creator's built-in options (the shop adds the ones the player owns)
  DL.CHAR_OPTS = { SKINS, HAIRS, CLOTHES, PANTS, STYLES, OUTFITS, HATS, EXTRAS };

  /* ------------------------------------------------------------------ */
  /* Navigation: A* on the tile grid, diagonals without corner cutting,  */
  /* then string-pulling with the scene's own collision test.            */
  /* ------------------------------------------------------------------ */
  DL.createNav = function (scene) {
    const SQ2 = Math.SQRT2;
    const DIRS = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];
    const w = () => scene.world;
    const center = (tx, ty) => ({ x: tx * T + 8, y: ty * T + 12 });
    const tileOf = (x, y) => [Math.floor(x / T), Math.floor((y - 2) / T)];

    function free(tx, ty) {
      const W = w();
      return tx >= 0 && ty >= 0 && tx < W.W && ty < W.H && W.solid[ty * W.W + tx] === 0;
    }

    function astar(sx, sy, gx, gy) {
      const W = w(), WW = W.W, N = WW * W.H, solid = W.solid;
      const g = new Float32Array(N).fill(Infinity), from = new Int32Array(N).fill(-1), closed = new Uint8Array(N);
      const heap = [];
      const push = (f, i) => {
        heap.push([f, i]);
        let k = heap.length - 1;
        while (k > 0) {
          const p = (k - 1) >> 1;
          if (heap[p][0] <= heap[k][0]) break;
          [heap[p], heap[k]] = [heap[k], heap[p]];
          k = p;
        }
      };
      const pop = () => {
        const top = heap[0], last = heap.pop();
        if (heap.length) {
          heap[0] = last;
          let k = 0;
          for (;;) {
            const l = k * 2 + 1, r = l + 1;
            let m = k;
            if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
            if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
            if (m === k) break;
            [heap[m], heap[k]] = [heap[k], heap[m]];
            k = m;
          }
        }
        return top;
      };
      const h = (x, y) => {
        const dx = Math.abs(x - gx), dy = Math.abs(y - gy);
        return Math.max(dx, dy) + (SQ2 - 1) * Math.min(dx, dy);
      };
      const s = sy * WW + sx, goal = gy * WW + gx;
      g[s] = 0;
      push(h(sx, sy), s);
      while (heap.length) {
        const i = pop()[1];
        if (closed[i]) continue;
        closed[i] = 1;
        if (i === goal) break;
        const x = i % WW, y = (i / WW) | 0;
        for (const [dx, dy, c] of DIRS) {
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= WW || ny >= W.H) continue;
          const n = ny * WW + nx;
          if (solid[n] || closed[n]) continue;
          if (dx && dy && (solid[y * WW + nx] || solid[ny * WW + x])) continue;
          const ng = g[i] + c;
          if (ng < g[n]) {
            g[n] = ng;
            from[n] = i;
            push(ng + h(nx, ny), n);
          }
        }
      }
      if (!closed[goal]) return null;
      const out = [];
      for (let i = goal; i !== -1; i = from[i]) out.push([i % WW, (i / WW) | 0]);
      return out.reverse();
    }

    function clear(a, b) {
      const d = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(d / 2));
      for (let i = 1; i <= n; i++) {
        if (scene.hits(a.x + ((b.x - a.x) * i) / n, a.y + ((b.y - a.y) * i) / n)) return false;
      }
      return true;
    }

    function smooth(pts) {
      if (pts.length < 3) return pts;
      const out = [pts[0]];
      let i = 0;
      while (i < pts.length - 1) {
        let j = pts.length - 1;
        while (j > i + 1 && !clear(pts[i], pts[j])) j--;
        out.push(pts[j]);
        i = j;
      }
      return out;
    }

    function nearestFree(tx, ty, maxR) {
      if (free(tx, ty)) return [tx, ty];
      const W = w(), seen = new Set([tx + ',' + ty]), q = [[tx, ty, 0]];
      while (q.length) {
        const [x, y, d] = q.shift();
        if (d > (maxR || 8)) break;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + dx, ny = y + dy, k = nx + ',' + ny;
          if (seen.has(k) || nx < 0 || ny < 0 || nx >= W.W || ny >= W.H) continue;
          seen.add(k);
          if (free(nx, ny)) return [nx, ny];
          q.push([nx, ny, d + 1]);
        }
      }
      return null;
    }

    // Route from a pixel position to a pixel goal; `exact` keeps the goal point instead of the tile centre.
    function route(x, y, gx, gy, exact) {
      let [sx, sy] = tileOf(x, y);
      const W = w();
      sx = Math.max(0, Math.min(W.W - 1, sx));
      sy = Math.max(0, Math.min(W.H - 1, sy));
      const gt = nearestFree.apply(null, tileOf(gx, gy));
      if (!gt) return null;
      const path = astar(sx, sy, gt[0], gt[1]);
      if (!path) return null;
      const pts = path.map(([tx, ty]) => center(tx, ty));
      pts[0] = { x, y };
      if (exact && gt[0] === tileOf(gx, gy)[0] && gt[1] === tileOf(gx, gy)[1]) pts.push({ x: gx, y: gy });
      return smooth(pts).slice(1);
    }

    function length(x, y, r) {
      let d = 0, px = x, py = y;
      for (const p of r) { d += Math.hypot(p.x - px, p.y - py); px = p.x; py = p.y; }
      return d;
    }

    // A random walkable spot somewhere in the building (rooms weighted by area).
    function randomSpot() {
      const W = w(), rooms = W.rooms || [{ x: 1, y: 2, w: W.W - 2, h: W.H - 3 }];
      const total = rooms.reduce((s, r) => s + r.w * r.h, 0);
      for (let n = 0; n < 24; n++) {
        let k = rand() * total, r = rooms[0];
        for (const q of rooms) { k -= q.w * q.h; if (k <= 0) { r = q; break; } }
        const tx = r.x + Math.floor(rand() * r.w), ty = r.y + 1 + Math.floor(rand() * Math.max(1, r.h - 1));
        if (!free(tx, ty)) continue;
        if (W.keepClear && W.keepClear.has(tx + ',' + ty)) continue;
        return center(tx, ty);
      }
      return null;
    }

    return { route, length, randomSpot, nearestFree, free, center, tileOf, clear };
  };

  // Follow a.route at `speed` px/s. Returns true once the last point is reached.
  function walk(a, dt, speed) {
    const r = a.route;
    if (!r || !r.length) { a.moving = false; return true; }
    let step = speed * dt, moved = 0, dx = 0, dy = 0;
    while (step > 0 && r.length) {
      const p = r[0];
      dx = p.x - a.x;
      dy = p.y - a.y;
      const d = Math.hypot(dx, dy);
      if (d <= step) {
        a.x = p.x;
        a.y = p.y;
        step -= d;
        moved += d;
        r.shift();
      } else {
        a.x += (dx / d) * step;
        a.y += (dy / d) * step;
        moved += step;
        step = 0;
      }
    }
    if (!a.moving) a.dist = 0;
    a.moving = moved > 0.01;
    a.dist += moved;
    if (Math.abs(dx) + Math.abs(dy) > 0.01) a.dir = DL.dirOf(dx, dy);
    return r.length === 0;
  }

  // Someone standing right where the actor is heading?
  function blockedBy(a, p) {
    const r = a.route;
    if (!p || !r || !r.length) return false;
    const dx = r[0].x - a.x, dy = r[0].y - a.y, d = Math.hypot(dx, dy) || 1;
    return Math.hypot(p.x - (a.x + (dx / d) * 12), p.y - (a.y + (dy / d) * 12)) < 11;
  }

  /* ------------------------------------------------------------------ */
  /* Extra wandering NPCs                                                */
  /* ------------------------------------------------------------------ */
  const WANDERERS = [
    {
      id: 'theo', name: 'Theo', role: 'Facilities', look: 'theo', wander: true,
      lines: {
        calm: ['Cada móvel novo muda o fluxo de ar. Planeje antes de encher a sala.', 'Precisa de mais espaço? Com B dá para esticar as paredes.'],
        incident: ['Ouvi o alarme do NOC. Energia está ok — o nobreak nem piscou.', 'Não é refrigeração: os CRACs estão estáveis. Olha a rede.'],
        done: ['Agora a sala é sua. Tecla B e mãos à obra.', 'Mais gente precisa de mais estações. Tecla C para contratar.'],
      },
    },
    {
      id: 'bia', name: 'Bia', role: 'Analista de sistemas', look: 'bia', wander: true,
      lines: {
        calm: ['Estou rodando a checagem de backups da madrugada.', 'Gosto de dar uma volta entre os racks. Ajuda a pensar.'],
        incident: ['Meus servidores da fileira B estão de pé, mas ninguém chega neles.', 'Ping para o db-01 morreu. Fileira B inteira fora.'],
        done: ['db-01 respondendo de novo. Valeu!', 'Se contratar alguém de sysadmin, me apresenta.'],
      },
    },
  ];
  DL.LOOKS.bia = { skin: '#5e3a26', hair: '#0f0b0a', hairStyle: 'afro', shirt: '#1f6f5c', pants: '#1b1f27', shoes: '#eceff3', body: 'f', outfit: 'hoodie', glasses: true, role: 'sysadmin', roleColor: '#c4b5fd', badge: '#c4b5fd', lanyard: '#c4b5fd' };

  /* ------------------------------------------------------------------ */
  /* Crew manager                                                        */
  /* ------------------------------------------------------------------ */
  const XP = DL.XP, JOBS = DL.JOBS, TALK = DL.TALK;
  const FIX_GRACE = 45; // seconds the player gets to fix a found fault before the crew takes it alone
  const PLAYER_KEY = 'datalab.player.v1';
  const DEFAULT_PLAYER = {
    name: 'Alex', body: 'n', skin: '#f2c8a0', hair: '#2a1c16', hairStyle: 'short', outfit: 'tee', shirt: '#7c3aed', pants: '#232a36',
    shoes: '#eceff3', vest: false, glasses: false, beard: false, headset: false, earrings: false, hat: '', role: 'gerente',
  };
  // fallback when nothing in the building needs the role: get to know the place (still a reason to move)
  const EXPLORE = { id: 'explore', name: 'Reconhecer o espaço', verb: 'Conhecendo o espaço', kind: 'patrol', skill: 'gestao', xp: 4, dur: [0, 0], auto: 1, finish: () => null };

  DL.createCrew = function (game) {
    const scene = game.scene;
    const world = () => scene.world;
    const nav = DL.createNav(scene);
    const chat = DL.createTeamChat(game);
    game.chat = chat;
    const $ = (id) => document.getElementById(id);
    const el = {
      panel: $('crewPanel'), list: $('crewList'), count: $('crewCount'), hire: $('hireBtn'),
      card: $('crewCard'), tags: $('nametags'),
      creator: $('creator'), form: $('creatorForm'), canvas: $('creatorCanvas'), poseSeg: $('creatorPose'),
      save: $('creatorSave'), cancel: $('creatorCancel'), random: $('creatorRandom'), title: $('creatorTitle'), sub: $('creatorSub'),
      me: $('meBtn'), meName: $('meName'), meRole: $('meRole'), meFace: $('meFace'), meTitle: $('meTitle'),
    };
    const C = { assigned: 0, created: 0, members: [], leaving: [], sel: null, hover: null, mode: 'explore', seq: 0, cardKey: '', uiAcc: 0, down: null, pan: null, recent: [] };

    /* ---------- NPCs: route around furniture instead of walking straight ---------- */
    for (const def of game.wanderers === false ? [] : WANDERERS) {
      const sp = nav.randomSpot() || world().spawn;
      const a = new DL.Actor(DL.LOOKS[def.look], sp.x, sp.y, 'down');
      Object.assign(a, { def, i: 0, wait: between(0.5, 2), talkT: 0, lineIdx: 0 });
      scene.npcs.push(a);
    }
    scene.refreshWorld(false);

    scene.updateNpc = function (n, dt) {
      n.tick(dt);
      const p = this.player;
      if (n.talkT > 0) {
        n.talkT -= dt;
        n.moving = false;
        if (p) n.dir = DL.dirOf(p.x - n.x, p.y - n.y);
        return;
      }
      if (n.wait > 0) {
        n.wait -= dt;
        n.moving = false;
        return;
      }
      if (!n.route) {
        const goal = n.def.wander ? nav.randomSpot() : n.def.path[n.i];
        n.route = goal ? nav.route(n.x, n.y, goal.x, goal.y) : null;
        if (!n.route) {
          if (!n.def.wander) n.i = (n.i + 1) % n.def.path.length;
          n.wait = 0.8;
          return;
        }
        n.blockT = 0;
      }
      if (blockedBy(n, p) && (n.blockT += dt) < 2.5) {
        n.moving = false;
        return;
      }
      if (walk(n, dt, 30)) {
        n.route = null;
        n.moving = false;
        if (n.def.wander) n.wait = between(1.5, 4.5);
        else {
          n.wait = n.def.waits[n.i] || 0;
          n.i = (n.i + 1) % n.def.path.length;
          if (n.wait > 0.8) n.dir = n.y < 9 * T ? 'up' : n.dir;
        }
      }
    };

    /* ---------- the player's own character ---------- */
    const PL = { profile: null };
    function loadPlayer() {
      let p = null;
      try { p = JSON.parse(localStorage.getItem(PLAYER_KEY) || 'null'); } catch (e) { p = null; }
      PL.profile = Object.assign({}, DEFAULT_PLAYER, p && typeof p === 'object' ? p : {});
      if (!ROLES[PL.profile.role]) PL.profile.role = DEFAULT_PLAYER.role;
    }
    function applyPlayer(save) {
      const pl = game.player;
      const L = lookOf(PL.profile);
      if (pl) { pl.look = L; pl.sheet = DL.makeSheet(L); pl.sitSheet = DL.makeSitSheet(L); pl.actSheet = DL.makeActSheet(L); }
      if (save) {
        try { localStorage.setItem(PLAYER_KEY, JSON.stringify(PL.profile)); } catch (e) { /* private mode: keep it for this session */ }
        game.emit('player-look', PL.profile); // cloud-sync.js keeps the account's avatar up to date
      }
      if (el.meName) {
        const r = ROLES[PL.profile.role];
        el.meName.textContent = PL.profile.name;
        el.meRole.textContent = r.name;
        el.meRole.style.color = r.color;
        drawFace(el.meFace, pl ? pl.sheet : DL.makeSheet(L));
      }
    }
    // account title (Dev, Beta Tester…) in the HUD, next to my name
    addEventListener('datalab:titles', (ev) => { if (el.meTitle) el.meTitle.innerHTML = ev.detail.length ? DL.titleBadge(ev.detail[0]) : ''; });
    function drawFace(cv, sheet) {
      if (!cv) return;
      const k = 2;
      cv.width = 16 * k;
      cv.height = 16 * k;
      const g = cv.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, cv.width, cv.height);
      g.drawImage(sheet.down.idle, 3, 1, 16, 16, 0, 0, 16 * k, 16 * k);
    }
    loadPlayer();
    applyPlayer(false);
    if (el.me) el.me.addEventListener('click', () => { el.me.blur(); openCreator('player'); });
    const playerName = () => PL.profile.name;

    /* ---------- stations ---------- */
    const itemAt = (tx, ty, pred) => world().items.find((e) => !e.host && pred(e) && tx >= e.tx && tx < e.tx + e.tw && ty >= e.ty && ty < e.ty + e.th);

    // Seated poses per orientation (the way the desk / chair faces): 0 the worker faces north (back to
    // the viewer), 1 faces the viewer, 2 sits on the east side facing west, 3 on the west facing east.
    const SIT_DIR = ['up', 'down', 'left', 'right'];

    function deskStation(d) {
      if (!d.chair || world().items.indexOf(d.chair) < 0) return null;
      const r = d.rot | 0, c = d.chair;
      if (r === 2 || r === 3) {
        // hands on the keyboard at the desk's near edge, seated just above the chair's cushion
        const x = r === 2 ? c.px + 5 : c.px + 11;
        return {
          key: d, seat: c, screen: d, label: d.id || 'Computador', dir: SIT_DIR[r],
          approach: { x: c.px + 8, y: c.py + 20 }, sit: { x, y: c.py + 12 },
          sortKey: d.sortY + 0.5, focus: d,
        };
      }
      const r1 = r === 1, x = d.px + 16;
      return {
        key: d, seat: c, screen: d, label: d.id || 'Computador', dir: SIT_DIR[r],
        approach: { x, y: c.py + 12 }, sit: { x, y: r1 ? d.py - 2 : d.py + 20 },
        sortKey: r1 ? d.sortY + 0.5 : null, focus: d,
      };
    }

    function chairStation(c) {
      const r = c.rot | 0;
      const tx = c.tx + (r === 2 ? -1 : r === 3 ? 1 : 0), ty = c.ty + (r === 0 ? -1 : r === 1 ? 1 : 0);
      const table = itemAt(tx, ty, (e) => e.kind === 'table');
      if (!table) return null;
      const mon = world().items.find((e) => (e.kind === 'monitor' || e.kind === 'laptop') && e.host === table && e.tx === tx && e.ty === ty);
      if (!mon) return null;
      const sit = r === 2 ? { x: c.px + 5, y: c.py + 4 } : r === 3 ? { x: c.px + 11, y: c.py + 4 } : { x: c.px + 8, y: r === 1 ? c.py + 14 : c.py + 4 };
      return {
        key: c, seat: c, screen: mon, label: 'Mesa com monitor', dir: SIT_DIR[r],
        approach: { x: c.px + 8, y: c.py + 12 }, sit,
        sortKey: r === 1 ? table.sortY + 0.3 : r >= 2 ? Math.max(table.sortY, c.sortY) + 0.3 : null, focus: mon,
      };
    }

    function stationOf(e) {
      if (!e || world().items.indexOf(e) < 0) return null;
      if (e.kind === 'desk') return deskStation(e);
      if (e.kind === 'chair') return e.parent ? deskStation(e.parent) : chairStation(e);
      if ((e.kind === 'monitor' || e.kind === 'laptop') && e.host) {
        for (const c of world().items) {
          if (c.kind !== 'chair' || c.parent) continue;
          const s = chairStation(c);
          if (s && s.screen === e) return s;
        }
      }
      if (e.kind === 'table') {
        for (const c of world().items) {
          if (c.kind !== 'chair' || c.parent) continue;
          const s = chairStation(c);
          if (s && s.screen.host === e) return s;
        }
      }
      return null;
    }

    function stations() {
      const out = [];
      for (const e of world().items) {
        const s = e.kind === 'desk' ? deskStation(e) : e.kind === 'chair' && !e.parent ? chairStation(e) : null;
        if (s) out.push(s);
      }
      return out;
    }

    const userOf = (s) => C.members.find((a) => a.crew.station && a.crew.station.key === s.key) || null;

    /* ---------- organisation: each member's own workstation and work sector ---------- */
    // a station can't be used while its PC is broken / at the bench, or while the player sits there
    const brokenSt = (s) => !!(s.key.broken || s.key.pcOut || (s.screen && (s.screen.broken || s.screen.pcOut)));
    const playerOn = (s) => !!(game.playerSeat && game.playerSeat.key === s.key);
    const ownerOf = (s) => C.members.find((m) => m.crew.home === s.key) || null;
    const reservedFor = (s, a) => { const o = ownerOf(s); return !!o && o !== a; };
    const stationFree = (s, a) => !brokenSt(s) && !playerOn(s) && !reservedFor(s, a) && (!userOf(s) || userOf(s) === a);
    function homeStation(a) {
      const h = a.crew.home;
      if (!h) return null;
      const s = stationOf(h);
      return s && s.key === h ? s : null;
    }
    function roomAtPoint(x, y) {
      const W = world(), tx = Math.floor(x / T), ty = Math.floor((y - 2) / T);
      if (!W.roomAt || tx < 0 || ty < 0 || tx >= W.W || ty >= W.H) return null;
      const i = W.roomAt[ty * W.W + tx];
      return i >= 0 && W.rooms[i] ? W.rooms[i] : null;
    }
    const zoneRoom = (a) => (a.crew.zone ? (world().rooms || []).find((r) => r.id === a.crew.zone) || null : null);
    const inZone = (a, p) => { if (!a.crew.zone || !p) return true; const r = roomAtPoint(p.x, p.y); return !!r && r.id === a.crew.zone; };
    const pointOf = (t) => (!t ? null : t.crew || t.x != null ? { x: t.x, y: t.y } : t.ix != null ? { x: t.ix, y: t.iy - 3 } : t.tx != null ? { x: t.tx * T + 8, y: (t.ty + (t.th || 1)) * T + 6 } : null);
    function stationName(s) {
      const r = roomAtPoint(s.approach.x, s.approach.y);
      return (s.key.id || s.label) + (r ? ' · ' + r.name : '');
    }

    function nearestStation(a, ok) {
      // the member's own station first
      const home = homeStation(a);
      if (home && !brokenSt(home) && !playerOn(home) && (!ok || ok(home)) && (!userOf(home) || userOf(home) === a)) {
        const r = nav.route(a.x, a.y, home.approach.x, home.approach.y, true);
        if (r) return { s: home, r };
      }
      let best = null, bestD = Infinity, bestR = null;
      for (const s of stations()) {
        if (ok && !ok(s)) continue;
        if (!stationFree(s, a)) continue;
        const r = nav.route(a.x, a.y, s.approach.x, s.approach.y, true);
        if (!r) continue;
        // stations inside the member's sector win unless the others are much closer
        const d = nav.length(a.x, a.y, r) * (inZone(a, s.approach) ? 1 : 2.5);
        if (d < bestD) { bestD = d; best = s; bestR = r; }
      }
      return best ? { s: best, r: bestR } : null;
    }

    // Default organisation for a new hire: a sector that fits the role and a free station there.
    const ZONE_PREF = { redes: ['servers', 'noc'], servidores: ['servers'], tecnico: ['servers', 'power', 'office'], sysadmin: ['noc', 'office'], gerente: ['office', 'noc'], seguranca: ['reception', 'noc'], funcionario: ['reception', 'support', 'office'], atendente: ['reception', 'support'] };
    function autoPlace(a, onlyMissing) {
      const c = a.crew, rooms = world().rooms || [], type = DL.roomTypeOf || (() => null);
      if (!onlyMissing || !zoneRoom(a)) {
        const r0 = ROLES[c.profile.role];
        const pref = ZONE_PREF[c.profile.role] || (r0 && r0.cfg ? r0.cfg.areas.filter((x) => x !== 'any') : []);
        // the preferred room types, but only rooms that offer what the role needs (workplace.js);
        // otherwise the room that offers the most of it
        const score = (r) => (DL.checkNeeds ? DL.checkNeeds(world(), c.profile.role, r, type).filter((n) => n.ok).length : 0);
        const full = DL.checkNeeds ? DL.needsOfRole(c.profile.role).length : 0;
        let room = null, best = -1;
        for (const t of pref) {
          for (const r of rooms.filter((x) => type(x) === t)) {
            const s = score(r) + (pref.length - pref.indexOf(t)) * 0.01;
            if (s > best) { best = s; room = r; }
          }
          if (room && Math.floor(best) >= full) break;
        }
        if (full && (!room || Math.floor(best) < full)) {
          const alt = rooms.map((r) => [r, score(r)]).sort((x, y) => y[1] - x[1])[0];
          if (alt && alt[1] > Math.floor(best)) room = alt[0];
        }
        c.zone = room ? room.id : null;
      }
      if (!onlyMissing || !homeStation(a)) {
        c.home = null;
        const def = tasksOf(a).find((d) => d.kind === 'pc');
        if (def) {
          const cand = stations().filter((s) => !ownerOf(s) && !brokenSt(s) && (!def.stationOk || def.stationOk(s)));
          cand.sort((x, y) => (inZone(a, x.approach) ? 0 : 1) - (inZone(a, y.approach) ? 0 : 1));
          if (cand[0]) c.home = cand[0].key;
        }
      }
    }

    function setHome(a, key) {
      const c = a.crew;
      if (key) for (const m of C.members) if (m !== a && m.crew.home === key) m.crew.home = null;
      c.home = key || null;
      c.placeAuto = false;
      renderCard(true);
      renderList();
    }
    // how a frontline member attends: computer tickets, in person at the reception, or both
    function setAttend(a, how) {
      const c = a.crew;
      if (['pc', 'desk', 'both'].indexOf(how) < 0 || c.attend === how) return;
      c.attend = how;
      const R = (world().rooms || []).find((r) => DL.roomTypeOf && DL.roomTypeOf(r) === 'reception');
      // attending in person: the reception becomes the sector
      if (how !== 'pc' && R && c.zone !== R.id) { c.zone = R.id; c.placeAuto = false; }
      game.toast('ok', 'Atendimento', c.name + (how === 'pc' ? ' atende pelo computador' : how === 'desk' ? ' atende presencialmente na recepção' : ' atende pelo computador e na recepção'));
      chat.post(a, how === 'pc' ? 'Combinado, fico nos chamados pelo computador.' : R ? pick(['Beleza! Vou ficar no balcão da ' + R.name + ' recebendo os clientes.', 'Pode deixar, eu recebo quem chegar na ' + R.name + '.']) : 'Posso atender presencialmente, mas não temos uma Recepção. Cria uma sala do tipo Recepção?');
      if (c.job && c.job.auto && !c.seated && c.state !== 'sitting' && c.state !== 'standing') { cancelJob(a, true); c.wait = 0.2; }
      renderCard(true);
      renderList();
    }

    function setZone(a, id) {
      a.crew.zone = id || null;
      a.crew.placeAuto = false;
      renderCard(true);
      renderList();
    }

    /* ---------- places ---------- */
    function reception() {
      const W = world();
      const r = (W.rooms || []).find((x) => /entrada|recep/i.test(x.name));
      if (r) {
        const t = nav.nearestFree(r.x + Math.floor(r.w / 2), r.y + r.h - 2, 6);
        if (t) return Object.assign(nav.center(t[0], t[1]), { label: r.name });
      }
      return { x: W.spawn.x, y: W.spawn.y, label: 'Recepção' };
    }

    function spotInRoom(r) {
      for (let n = 0; n < 16; n++) {
        const tx = r.x + Math.floor(rand() * r.w), ty = r.y + 1 + Math.floor(rand() * Math.max(1, r.h - 1));
        if (nav.free(tx, ty)) return nav.center(tx, ty);
      }
      return null;
    }

    function patrolSpots(def, a) {
      // getting to know the place / killing time happens inside the member's own sector
      const z = a && (def.id === 'explore' || def.social) ? zoneRoom(a) : null;
      if (z) {
        const out = [];
        for (let n = 0; n < 3; n++) { const p = spotInRoom(z); if (p) out.push(p); }
        if (out.length) return out;
      }
      const rooms = (world().rooms || []).slice().sort(() => rand() - 0.5);
      const out = [];
      for (const r of rooms) { const p = spotInRoom(r); if (p) out.push(p); if (out.length >= 4) break; }
      while (out.length < 3) { const p = nav.randomSpot(); if (!p) break; out.push(p); }
      return out;
    }

    // where to stand to work on an item (in front of it) — or the point itself
    function standAt(t) {
      if (t.crew) return { x: t.x, y: t.y };
      if (t.ix != null) return { x: t.ix, y: t.iy - 3 };
      return { x: t.x, y: t.y };
    }

    // in front of a small item (a coffee maker sits on a table: stand in front of the table)
    function frontOf(e) {
      if (!e) return { x: 0, y: 0 };
      if (e.ix != null) return { x: e.ix, y: e.iy - 3 };
      const h = e.host || e;
      return { x: h.px + (h.tw || 1) * 8, y: (h.ty + (h.th || 1)) * T + 10 };
    }
    // a free seat on a sofa / beanbag / pouf (interact.js knows the seats; the seat is reserved for `a`)
    function restSeat(e, a) {
      if (!e || world().items.indexOf(e) < 0 || !DL.Interact) return null;
      const s = DL.Interact.freeSeat(e, world(), a, a ? { x: a.x, y: a.y } : null);
      if (!s) return null;
      return { item: e, k: s.k, sit: s.sit, dir: s.dir, from: s.fromPt, sortKey: s.sortKey };
    }

    function install(rack) {
      const k = rack.units.indexOf(null);
      if (k < 0 || !game.builder) return null;
      rack.units[k] = 'server';
      DL.syncRack(rack);
      game.builder.api.commit({ installed: rack });
      return game.ops ? game.ops.devices().find((d) => d.rack === rack && d.slot === k) : null;
    }

    const hourNow = () => { const m = /^(\d+):/.exec(game.clock ? game.clock() : '09:00'); return m ? +m[1] : 9; };
    const ctxOf = (a) => {
      const r = roomAtPoint(a.x, a.y);
      return { a, c: a.crew, stats: a.crew.stats, world: world(), ops: game.ops, staff: game.staff, eco: game.economy, members: C.members.filter((m) => !m.crew.off), player: playerName(), reception, install, hour: hourNow(), roomName: r ? r.name : null };
    };

    /* ---------- members ---------- */
    function frameOf() {
      const c = this.crew;
      if (c.seated) {
        const set = c.sit[c.sitDir];
        if (c.pose === 'R' && this.blinkT > 0) return set.blink;
        return set[c.pose] || set.R;
      }
      // standing actions: hands on the equipment while working on it, mouth moving while talking
      if (!this.moving && c.act) {
        const t = scene.t, s = c.act[this.dir] || c.act.down;
        if (c.state === 'using' && c.useAnim !== 'reach') {
          // watching: now and then a comment about what is on screen
          if (Math.sin(t * 0.9 + c.id) > 0.82 && Math.floor(t * 7) % 2) return s.talk;
        } else if (c.state === 'pickup' || c.state === 'installing' || c.state === 'repairing' || c.state === 'inspecting' || c.state === 'fetching' || c.state === 'using' || (c.state === 'atSpot' && c.job && c.job.order)) {
          if (Math.floor(t * 2.6 + c.id) % 3) return s.reach;
        } else if ((c.state === 'talking' || c.state === 'serving' || (c.talkT > 0 && c.talkWith) || (this.bubble && this.bubble.left > 0.6)) && Math.floor(t * 7) % 2) return s.talk;
      }
      return DL.Actor.prototype.frame.call(this);
    }

    function applyLook(a) {
      const L = lookOf(a.crew.profile);
      a.look = L;
      a.sheet = DL.makeSheet(L);
      a.crew.sit = DL.makeSitSheet(L);
      a.crew.act = DL.makeActSheet(L);
    }

    function spawnPoint() {
      const ref = C.mode === 'explore' && game.player ? game.player : scene.cam;
      const t = nav.nearestFree(Math.floor(ref.x / T), Math.floor((ref.y - 2) / T), 12) || nav.tileOf(world().spawn.x, world().spawn.y);
      return nav.center(t[0], t[1]);
    }

    const roleOf = (a) => ROLES[a.crew.profile.role] || ROLES.funcionario;
    const alive = (a) => C.members.indexOf(a) >= 0;

    function hire(profile, opts) {
      opts = opts || {};
      if (C.members.length >= MAX_CREW) { game.toast('warn', 'Equipe cheia', 'Limite de ' + MAX_CREW + ' pessoas no turno'); return null; }
      const stats = opts.stats || XP.newStats(profile.role, opts.legend ? 8 : opts.level);
      if (opts.legend && !opts.stats) {
        // legendary: very high in every area, the main one near the top
        for (const [k] of DL.SKILLS) stats.skills[k] = Math.max(stats.skills[k], Math.round(80 + rand() * 10));
        stats.skills[DL.ROLE_SKILL[profile.role] || 'gestao'] = 96;
      }
      // each person negotiates their own salary (±8% around the role's base); hiring costs half of it
      const pay = opts.pay || Math.round((0.92 + rand() * 0.16) * 100) / 100;
      if (!opts.free && game.economy && game.economy.hireCharge) {
        const why = game.economy.hireCharge(profile.role, stats.level, pay, profile.name);
        if (why) { game.toast('warn', 'Contratação recusada', why); return null; }
      }
      const sp = opts.at || spawnPoint();
      const a = new DL.Actor(lookOf(profile), sp.x, sp.y, 'down');
      a.crew = {
        id: ++C.seq, profile, name: profile.name, stats,
        state: 'idle', wait: between(0.6, 1.6), pose: 'R', seated: false, sitDir: 'up', station: null, job: null, alertT: 0,
        hold: false, menu: false, talkT: 0, lastSocial: -40 - rand() * 40,
        home: null, zone: null, placeAuto: true, carry: null,
        pay, hiredAt: game.time ? game.time() : 0,
        // attending clients: on the computer, in person at the reception, or both (staff.js / helpdesk.js)
        attend: profile.role === 'atendente' ? 'both' : 'pc',
        // work schedule (shifts.js): 24 h by default; on-call shifts it may cover
        shift: { id: 'integral', start: 0, end: 24 }, oncall: [],
        missing: [], gripeT: 10 + rand() * 20, needsT: 0, cup: null, off: null,
        // legendary bot: the inventory item it came from (inventory.js)
        legend: opts.legend || null,
      };
      a.legend = !!opts.legend;
      a.frame = frameOf;
      applyLook(a);
      const others = C.members.slice();
      C.members.push(a);
      autoPlace(a);
      scene.actors.push(a);
      scene.refreshWorld(false);
      if (!opts.silent && opts.legend) {
        game.toast('ok', 'Bot lendário ativado', profile.name + ' entrou para a equipe · pode trabalhar em quase todas as funções');
        chat.post(a, 'Sistemas online. Sou ' + profile.name + ', unidade lendária. Redes, servidores, sistemas, segurança — é só chamar. ✨', { tone: 'ok' });
        const w = pick(others);
        if (w) chat.later(between(1.6, 2.6), () => { if (alive(w) && alive(a)) chat.post(w, pick(['Uau, um bot lendário! Bem-vindo(a), ' + profile.name + '! 🤩', 'Esse brilho dourado é real? Boas-vindas, ' + profile.name + '!'])); });
        select(a);
      } else if (!opts.silent) {
        game.toast('ok', 'Contratação', profile.name + ' · ' + ROLES[profile.role].title + ' entrou para a equipe');
        chat.post(a, pick(['Oi, pessoal! Sou ' + profile.name + ', ' + ROLES[profile.role].title.toLowerCase() + '. Bora trabalhar!', 'Olá, time! ' + profile.name + ' aqui, cuidando de ' + ROLES[profile.role].desc.toLowerCase().replace(/\.$/, '') + '.']));
        const w = pick(others);
        if (w) chat.later(between(1.6, 2.6), () => { if (alive(w) && alive(a)) chat.post(w, pick(['Boas-vindas, ' + profile.name + '! 👋', 'Seja bem-vindo(a), ' + profile.name + '! Qualquer coisa, chama.'])); });
        select(a);
      }
      renderList();
      return a;
    }

    // Dismissed: sad (crying), walks out to the reception, then fades away.
    function fire(a) {
      const c = a.crew;
      abortRepair(a);
      if (DL.Interact) DL.Interact.release(a);
      c.cup = null;
      // dismissed while off duty: shows up once more to say goodbye
      if (c.off) { const r = reception(); if (c.off.phase === 'away') { a.x = r.x; a.y = r.y; } c.off = null; a.hidden = false; a.alpha = 1; }
      if (c.state === 'restSit' || c.state === 'resting') standUpNow(a);
      c.home = null;
      if (c.seated || c.state === 'sitting' || c.state === 'standing') {
        const s = c.station;
        if (s) { a.x = s.approach.x; a.y = s.approach.y; }
      }
      release(a);
      c.job = null;
      c.hold = false;
      c.menu = false;
      c.state = 'leaving';
      c.leave = { phase: 'cry', t: 2.6 };
      a.route = null;
      a.moving = false;
      a.dir = 'down';
      C.members = C.members.filter((m) => m !== a);
      for (const m of C.members) if (m.crew.talkWith === a) { m.crew.talkT = 0; m.crew.talkWith = null; }
      C.leaving.push(a);
      if (C.sel === a) select(null);
      if (c.legend) {
        // a legendary bot is the player's: it goes back to the inventory, ready to be activated again
        game.toast('info', 'Bot lendário guardado', c.name + ' voltou para o inventário');
        game.emit('legend-free', { item: c.legend, name: c.name });
      } else game.toast('info', 'Dispensado', c.name + ' encerrou o turno');
      chat.post(a, pick(['Poxa… foi bom trabalhar com vocês. 😢', 'Vou sentir falta desse barulho de ventoinha… 😢']), { tone: 'sad' });
      a.bubble = { text: '😢', left: 9, tone: 'sad' };
      const w = pick(C.members);
      if (w) chat.later(2.2, () => { if (alive(w)) chat.post(w, pick(['Vamos sentir sua falta, ' + c.name + '.', 'Boa sorte, ' + c.name + '! Mantém contato.'])); });
      renderList();
    }

    function release(a) {
      const c = a.crew, s = c.station;
      if (s) {
        s.screen.work = null;
        s.screen.typing = false;
      }
      c.station = null;
      c.seated = false;
      a.sortKey = null;
      a.noShadow = false;
    }

    function standUp(a) {
      const c = a.crew;
      if (!c.seated && c.state !== 'sitting' && c.state !== 'working') {
        release(a);
        c.state = 'idle';
        c.wait = between(0.4, 1);
        a.route = null;
        return;
      }
      const s = c.station;
      // off a beanbag / sofa: back to the tile it was entered from
      let to = s ? s.approach : c.restSeat && (c.state === 'resting' || c.state === 'restSit') ? c.restSeat.from : { x: a.x, y: a.y };
      // the station may have been turned or moved over its old exit: step out to the nearest free tile
      const W = world(), tx = Math.floor(to.x / T), ty = Math.floor((to.y - 2) / T);
      if (W.solid && W.solid[ty * W.W + tx]) { const f = nav.nearestFree(tx, ty, 6); if (f) to = nav.center(f[0], f[1]); }
      c.glide = { from: { x: a.x, y: a.y }, to, t: 0, dur: 0.3 };
      if (s) { s.screen.work = null; s.screen.typing = false; }
      c.seated = false;
      a.sortKey = null;
      a.noShadow = false;
      c.state = 'standing';
    }

    /* ---------- jobs ---------- */
    // A legendary bot does (almost) every role's work: its own tasks first, then the other built-in
    // roles' (not the manager's orders nor the reception desk). Same rules, shifts and sectors as anyone.
    const LEGEND_ROLES = ['redes', 'servidores', 'sysadmin', 'tecnico', 'seguranca', 'funcionario'];
    const tasksOf = (a) => {
      const c = a.crew, own = JOBS.BY_ROLE[c.profile.role] || [];
      if (!c.legend) return own;
      const ver = (DL.rolesVersion || 0) + ':' + c.profile.role;
      if (c.tasksVer === ver) return c.tasks;
      const seen = new Set(), out = [];
      for (const id of [c.profile.role].concat(LEGEND_ROLES)) for (const d of JOBS.BY_ROLE[id] || []) if (!seen.has(d.id)) { seen.add(d.id); out.push(d); }
      c.tasks = out;
      c.tasksVer = ver;
      return out;
    };
    const busyWith = (t, except) => C.members.some((m) => m !== except && m.crew.job && m.crew.job.target === t);

    // What a task can be done on right now: { targets } or { reason }
    function optionsFor(a, def) {
      if (def.allow && !def.allow(ctxOf(a))) return { reason: def.none || 'Indisponível agora' };
      if (def.kind === 'pc') return stations().some((s) => (!def.stationOk || def.stationOk(s)) && stationFree(s, a)) ? { targets: [null] } : { reason: def.stationOk ? 'Sem estação livre permitida para o cargo' : 'Sem computador livre' };
      if (def.kind === 'patrol') return { targets: [null] };
      const ts = def.targets(ctxOf(a)) || [];
      return ts.length ? { targets: ts } : { reason: def.none || 'Indisponível agora' };
    }

    // weighted choice that prefers what nobody else is doing (and, for orders, what is close)
    function chooseTarget(a, def, ts, nearest) {
      // routine work happens mostly inside the member's sector
      const zw = (t) => (!a.crew.zone || def.kind === 'visit' ? 1 : inZone(a, pointOf(def.place ? def.place(t) : t)) ? 3 : 0.08);
      const w = (t) => (def.weight ? def.weight(t) : 1) * (busyWith(t, a) ? 0.12 : 1) * zw(t);
      if (def.kind === 'fix') return ts.slice().sort((x, y) => (x.fault.foundAt || 0) - (y.fault.foundAt || 0))[0];
      if (nearest) {
        let best = null, bestS = -1;
        for (const t of ts) {
          const p = standAt(def.place ? def.place(t) : t);
          const s = w(t) / (1 + Math.hypot(p.x - a.x, p.y - a.y) / 120);
          if (s > bestS) { bestS = s; best = t; }
        }
        return best;
      }
      let total = 0;
      for (const t of ts) total += w(t);
      let k = rand() * total;
      for (const t of ts) { k -= w(t); if (k <= 0) return t; }
      return ts[ts.length - 1];
    }

    // Start a job. Returns null when it started, or the reason it could not.
    function startJob(a, def, opts) {
      opts = opts || {};
      const c = a.crew;
      // in the dark nobody takes on work: they come back to it when the lights do
      if (C.panic) return 'A equipe está no escuro (apagão)';
      let target = opts.target || null;
      if (!target && def.kind !== 'pc' && def.kind !== 'patrol') {
        const o = optionsFor(a, def);
        if (!o.targets) return o.reason;
        target = chooseTarget(a, def, o.targets, !opts.auto);
      }
      const speed = XP.speedOf(c.stats, def.skill);
      // the workplace matters: without the structure the role needs, work drags (workplace.js)
      const slow = !def.social && c.missing && c.missing.length ? 1.5 : 1;
      // (an incident order sets its own span of game minutes, skill already counted: staff.js)
      const dur = def.durFor ? def.durFor(a, target) : between(def.dur[0], def.dur[1]) * (def.kind === 'client' ? 1 : speed * slow);
      let route = null, station = null, place = null, restS = null, stand = null;
      if (def.kind === 'pc') {
        if (opts.station) {
          const u = userOf(opts.station);
          if (u && u !== a) return opts.station.label + ' já está com ' + u.crew.name;
          station = opts.station;
          route = nav.route(a.x, a.y, station.approach.x, station.approach.y, true);
        } else {
          const n = nearestStation(a, def.stationOk);
          if (!n) return 'Sem computador livre';
          station = n.s;
          route = n.r;
        }
      } else if (def.kind === 'patrol') {
        route = [];
      } else if (def.kind === 'rest') {
        place = target;
        restS = restSeat(target, a);
        if (!restS) return 'Sem lugar livre no ' + DL.itemName(target).toLowerCase();
        route = nav.route(a.x, a.y, restS.from.x, restS.from.y, true);
      } else if (def.kind === 'drink' || def.kind === 'use') {
        // objects with an affordance (interact.js): stand on a free tile in front of them
        place = def.place ? def.place(target) : target;
        if (def.kind === 'use' && DL.Interact && !DL.Interact.freeUse(place, a)) return DL.itemName(place) + ' já está em uso';
        stand = (DL.Interact && DL.Interact.standPoint(place, world())) || Object.assign(frontOf(place), { dir: 'up' });
        route = nav.route(a.x, a.y, stand.x, stand.y, true);
      } else {
        place = def.place ? def.place(target) : target;
        const p = standAt(place);
        route = nav.route(a.x, a.y, p.x, p.y, def.kind !== 'visit' && def.kind !== 'client');
      }
      if (!route) return 'Sem caminho até ' + (station ? station.label : JOBS.labelOf(place || target));
      if (def.kind === 'repair' && target.taken && target.taken !== a) return JOBS.labelOf(target) + ' já está com ' + target.taken.crew.name;
      abortRepair(a);
      if (c.seated || c.state === 'sitting') standUpNow(a);
      release(a);
      c.hold = false;
      c.menu = false;
      c.talkT = 0;
      c.cup = null;
      c.job = { def, target, place, stand, name: def.name, total: dur, left: dur, auto: !!opts.auto, quiet: !!opts.quiet, label: station ? station.label : JOBS.labelOf(def.kind === 'fix' || def.kind === 'repair' ? target : place || target) };
      // seats and single-user objects are reserved while someone heads there (interact.js)
      if (DL.Interact) {
        DL.Interact.release(a);
        if (restS) DL.Interact.claim(restS.item, restS.k, a);
        else if (def.kind === 'use' && place) DL.Interact.claim(place, 'use', a);
      }
      a.route = route;
      a.blockT = 0;
      c.rerouteT = 1.2;
      if (def.kind === 'pc') { c.station = station; c.state = 'going'; }
      else if (def.kind === 'patrol') { c.spots = patrolSpots(def, a); c.spotsTotal = c.spots.length || 1; c.pauseT = 0; c.state = 'patrol'; a.route = null; }
      else if (def.kind === 'spot') c.state = 'toSpot';
      else if (def.kind === 'visit') c.state = 'toVisit';
      else if (def.kind === 'repair') { c.state = 'toBroken'; target.taken = a; }
      else if (def.kind === 'drink') c.state = 'toFetch';
      else if (def.kind === 'use') { c.state = 'toUse'; c.useAnim = (DL.Interact && (DL.Interact.of(place) || {}).anim) || null; }
      else if (def.kind === 'rest') { c.state = 'toRest'; c.restSeat = restS; }
      else if (def.kind === 'client') { c.state = 'toClient'; c.job.label = def.label || c.job.label; }
      else c.state = 'toEquip';
      if (def.social) c.lastSocial = scene.t;
      if (!opts.auto && !opts.quiet) {
        C.assigned++;
        game.toast('info', 'Tarefa atribuída', c.name + ' · ' + def.name + (c.job.label ? ' · ' + c.job.label : ''));
      }
      renderCard(true);
      return null;
    }

    // seated people asked to do something else get up first (instantly — the walk covers it)
    function standUpNow(a) {
      const c = a.crew, s = c.station;
      if (s) { a.x = s.approach.x; a.y = s.approach.y; }
      else if (c.restSeat && (c.state === 'resting' || c.state === 'restSit')) { a.x = c.restSeat.from.x; a.y = c.restSeat.from.y; }
      release(a);
    }

    // a repair job that stops halfway puts the equipment back (unrepaired) and frees it for someone else
    function abortRepair(a) {
      const c = a.crew, job = c.job;
      c.carry = null;
      if (!job || job.def.kind !== 'repair' || !job.target) return;
      if (job.target.taken === a) job.target.taken = null;
      if (game.staff) game.staff.putBack(job.target);
    }

    function cancelJob(a, quiet) {
      const c = a.crew;
      abortRepair(a);
      if (DL.Interact) DL.Interact.release(a);
      if (c.job && c.job.place) c.job.place.busy = false;
      c.cup = null;
      c.job = null;
      if (c.seated || c.state === 'sitting' || c.state === 'working') standUp(a);
      else { release(a); c.state = 'idle'; c.wait = between(0.5, 1.2); a.route = null; }
      if (!quiet) renderCard(true);
    }

    function finishJob(a) {
      const c = a.crew, job = c.job;
      if (!job) return;
      const def = job.def;
      let res = null;
      try { res = def.finish(ctxOf(a), job.target); } catch (err) { console.warn('job', def.id, err); }
      c.stats.done++;
      XP.train(c.stats, def.skill, 2 + rand() * 1.6);
      if (DL.ROLE_SKILL[c.profile.role] !== def.skill) XP.train(c.stats, DL.ROLE_SKILL[c.profile.role], 0.8);
      let xp = def.xp * (job.auto ? 1 : 1.2);
      if (res && res.fixed) { c.stats.fixed++; xp += 10; }
      if (res && res.failed) xp *= 0.6;
      // routine reports are occasional and never echo what was just said; problems, fixes and
      // anything ordered by the player are always reported
      if (res && res.say) {
        const key = res.say.replace(/\d+([.,]\d+)?/g, '#');
        const routine = job.auto && !res.tone && !res.fixed && !res.reply;
        C.recentSay = C.recentSay || [];
        if (!routine || (rand() < 0.45 && C.recentSay.indexOf(key) < 0)) {
          chat.post(a, res.say, { tone: res.tone === 'help' ? 'warn' : res.tone });
          C.recentSay.push(key);
          if (C.recentSay.length > 18) C.recentSay.shift();
        }
      }
      if (res && res.reply) { const [w, line] = res.reply; chat.later(between(1.6, 2.4), () => { if (alive(w)) chat.post(w, line); }); }
      if (res && res.failed && job.target) askHelp(a, job.target, def);
      if (!job.auto && !job.quiet) {
        game.toast('ok', 'Tarefa concluída', c.name + ' · ' + def.name);
        game.sfx('done');
      }
      if (!def.social && def.id !== 'explore') game.emit('job-done', { a, name: def.name, auto: job.auto, failed: !!(res && res.failed), job, res });
      if (def.kind === 'repair' && job.target && job.target.taken === a) job.target.taken = null;
      if (DL.Interact) DL.Interact.release(a);
      c.carry = null;
      c.job = null;
      if (c.seated || c.state === 'working') standUp(a);
      else { c.state = 'idle'; c.wait = between(0.4, 1.1); a.route = null; }
      reward(a, xp);
      renderCard(true);
      renderList();
    }

    function reward(a, xp) {
      const c = a.crew;
      // legendary bots learn twice as fast; the "Treinamento Intensivo" item doubles everyone's XP
      if (c.legend) xp *= 2;
      if (DL.xpBoost) xp *= DL.xpBoost();
      const ups = XP.gainXp(c.stats, c.profile.role, xp);
      if (!ups) return;
      const sk = DL.ROLE_SKILL[c.profile.role];
      const skName = (DL.SKILLS.find((s) => s[0] === sk) || ['', ''])[1];
      game.toast('ok', 'Evolução', c.name + ' subiu para o nível ' + c.stats.level + ' ' + '★'.repeat(XP.starsOf(c.stats, c.profile.role)));
      chat.post(a, pick(['Subi para o nível ' + c.stats.level + '! ' + skName + ' agora em ' + Math.round(c.stats.skills[sk]) + '.', 'Nível ' + c.stats.level + '! Cada tarefa ensina alguma coisa.', 'Nível ' + c.stats.level + ' 🎉 Já faço isso bem mais rápido.']), { tone: 'ok' });
      renderCard(true);
      renderList();
    }

    // can this member fix that fault?
    const fixDefFor = (a, d) => tasksOf(a).find((t) => t.kind === 'fix' && d.fault && t.types.indexOf(d.fault.type) >= 0);
    // on their own, bots only do tasks of a level below the player's (career.js); orders are never blocked
    const botCan = (def) => !game.career || game.career.botCan(def);

    function askHelp(a, d, def) {
      if (d.fault) d.fault.help = true;
      const helpers = C.members.filter((m) => m !== a && fixDefFor(m, d) && botCan(fixDefFor(m, d)) && !m.crew.hold && !m.crew.off).sort((x, y) => (y.crew.stats.skills[def.skill] || 0) - (x.crew.stats.skills[def.skill] || 0));
      const h = helpers[0];
      if (!h) return;
      chat.later(between(1.8, 2.8), () => {
        if (!alive(h) || !d.fault || busyWith(d)) return;
        chat.post(h, pick(['Eu ajudo, ' + a.crew.name + '! Indo aí.', 'Deixa comigo, ' + a.crew.name + '. Te mostro como faz.']));
        if (!h.crew.job || h.crew.job.auto) startJob(h, fixDefFor(h, d), { auto: true, target: d });
      });
    }

    // The autonomous part: always find something useful to do.
    function decide(a) {
      const c = a.crew, defs = tasksOf(a);
      // 1. problems first — after the player had a chance (or when someone asked for help)
      if (game.ops && !game.paused()) {
        for (const d of game.ops.devices()) {
          const f = d.fault;
          if (!f || !f.found || busyWith(d) || (f.botTried && scene.t - f.botTried < 90)) continue;
          // the Monitor already turned it into a work order: the manager hands that out (staff.js)
          if (game.staff && game.staff.incidentOn(d)) continue;
          const fd = fixDefFor(a, d);
          if (!fd || !botCan(fd)) continue;
          // the player gets time to fix it first (more in Experiente, less in Iniciante — difficulty.js)
          if (!f.help && scene.t - (f.foundAt || scene.t) < (DL.learn ? DL.learn().crewGrace : FIX_GRACE)) continue;
          if (!startJob(a, fd, { auto: true, target: d })) {
            chat.post(a, f.help ? 'Vou dar uma mão no ' + d.name + '.' : 'Ninguém pegou o ' + d.name + ' ainda. Estou indo resolver.');
            return;
          }
        }
      }
      // 1b. broken hardware nobody (or no work order) has claimed: the technicians go for it
      if (game.staff && !game.paused()) {
        const rep = defs.find((d) => d.kind === 'repair');
        if (rep && botCan(rep)) {
          for (const b of game.staff.broken()) {
            if (b.taken || game.staff.claimed(b)) continue;
            if (!startJob(a, rep, { auto: true, target: b })) {
              chat.post(a, 'Vou buscar o ' + b.label + ' para consertar na bancada.');
              return;
            }
          }
        }
      }
      // 2. the role's own work, weighted; now and then a short social moment
      const opts = [];
      for (const def of defs) {
        if (!def.auto || !botCan(def)) continue;
        const o = optionsFor(a, def);
        if (!o.targets) continue;
        // people stay in their own sector: routine work elsewhere only now and then
        let w = def.auto;
        if (c.zone && (def.kind === 'equip' || def.kind === 'spot') && !o.targets.some((t) => inZone(a, pointOf(def.place ? def.place(t) : t)))) w *= 0.15;
        opts.push([def, w]);
      }
      // now and then a short break: water, coffee, a chat, a minute on the beanbag — never back to back
      if (scene.t - c.lastSocial > 75) {
        for (const def of JOBS.SOCIAL) {
          const o = optionsFor(a, def);
          if (o.targets) opts.push([def, 0.3 * (def.auto || 1)]);
        }
      }
      while (opts.length) {
        let total = 0;
        for (const o of opts) total += o[1];
        let k = rand() * total, i = 0;
        for (; i < opts.length - 1; i++) { k -= opts[i][1]; if (k <= 0) break; }
        const def = opts[i][0];
        if (!startJob(a, def, { auto: true })) return;
        opts.splice(i, 1);
      }
      // 3. nothing to work on yet: walk the building
      if (startJob(a, Object.assign({}, EXPLORE, { skill: DL.ROLE_SKILL[c.profile.role] }), { auto: true })) c.wait = 1;
    }

    /* ---------- update ---------- */
    function walkStep(a, dt, sp) {
      if (blockedBy(a, game.player) && (a.blockT += dt) < 1.5) { a.moving = false; return false; }
      return walk(a, dt, sp);
    }
    const faceTo = (a, t) => { a.dir = DL.dirOf(t.x - a.x, t.y - a.y); };
    const faceToItem = (a, e) => {
      if (e && e.bounds) faceTo(a, { x: e.bounds.x + e.bounds.w / 2, y: e.bounds.y + e.bounds.h / 2 });
      else a.dir = 'up';
      a.crew.facing = a.dir;
    };
    const speedOf = (a) => 34 + a.crew.stats.level * 0.8;

    function update(dt) {
      chat.update(dt);
      for (const a of C.members.slice()) {
        if (!alive(a)) continue;
        a.tick(dt);
        const c = a.crew;
        if (c.alertT > 0) c.alertT -= dt;
        // off duty (shifts.js): walking out, away, or coming back in
        if (c.off) { stepAway(a, dt); continue; }
        if (C.panic) { panicStep(a, dt); continue; }
        workplace(a, dt);
        // a break never gets in the way: something urgent for this person ends it
        if (c.job && c.job.def.social && c.state !== 'standing' && (c.urgentT = (c.urgentT || 0) - dt) <= 0) {
          c.urgentT = 1;
          if (urgentFor(a)) { cancelJob(a, true); c.wait = 0.2; }
        }
        if (c.hold && c.state !== 'sitting' && c.state !== 'standing') { holdStill(a); continue; }
        if (c.talkT > 0 && !c.seated && c.state !== 'sitting' && c.state !== 'standing' && c.state !== 'talking') {
          c.talkT -= dt;
          a.moving = false;
          if (c.talkWith) faceTo(a, c.talkWith);
          continue;
        }
        step(a, dt);
      }
      for (const a of C.leaving.slice()) stepLeaving(a, dt);
      for (const a of C.members.concat(C.leaving)) if (a.bubble && (a.bubble.left -= dt) <= 0) a.bubble = null;
      if (C.panic || C.calmT > 0) panicTalk(dt);
      else ambient(dt);
    }

    /* ---------- the blackout (blackout.js): everybody runs around in panic, then calms down ---------- */
    // Lines are dealt from a shuffled deck, so the same one never comes twice in a row (nor until the
    // deck is used up). The chat gets one every ~3 s; others just shout in a bubble over their heads.
    const PANIC = ['Meu Deus, o mundo está acabando!', 'Cadê a luz?!', 'Salvem os servidores!', 'O nobreak vai acabar!', 'Alguém liga o gerador!!',
      'Não desliga, não desliga, não desliga…', 'Eu NÃO salvei a planilha!', 'Quem tropeçou no cabo?!', 'Os racks tão no nobreak, calma… CALMA!',
      'Tá tudo escuro aqui!', 'Isso não estava no treinamento!', 'Liguem pra companhia de energia!', 'Socorro, o banco de dados!', 'Alguém viu a lanterna?'];
    const SHOUT = ['AAAH!', '😱', 'Socorro!', 'Escuro!!', 'Corre!', 'Ai meu Deus!', 'Cadê?!', '🔦?!'];
    const CALM = ['Ufa… a luz voltou.', 'Ninguém viu eu gritando, né?', 'Voltou! Bora conferir os servidores.', 'Respira… tá tudo no ar.',
      'Que susto! O nobreak segurou bonito.', 'Ok, ok, pânico encerrado. Voltando ao trabalho.', 'Alguém anota: comprar lanternas.', 'Graças ao gerador! 🙌'];
    // the fire in a rack (incendio.js): the same panic, other words
    const FOGO = ['FOGO! FOGO!', 'Meu Deus, o rack tá pegando fogo!', 'Cadê o extintor?!', 'Chama o chefe!', 'Tá saindo fumaça preta do rack!',
      'Alguém pega o extintor de pó!', 'Não joga água, NÃO JOGA ÁGUA!', 'Desliga esse rack!', 'Eu avisei que tava quente!', 'Os servidores vão derreter!',
      'Abre a porta, tá enchendo de fumaça!', 'Liga pros bombeiros!', 'Chefe, o extintor fica na sua mão!'];
    const FOGO_SHOUT = ['FOGO!', '🔥🔥', 'Socorro!', 'Extintor!', 'Corre!', 'Ai meu Deus!', 'Fumaça!', '🧯?!'];
    const FOGO_CALM = ['Foi por pouco!', 'Boa, chefe!', 'Ufa… o fogo apagou.', 'Que susto! Alguém abre a janela?', 'Mandou bem com o extintor! 🧯',
      'Agora é ver o que queimou…', 'Bora melhorar essa refrigeração, hein.', 'Meu coração ainda tá acelerado.'];
    const lines = () => (C.panicKind === 'fogo' ? { talk: FOGO, shout: FOGO_SHOUT, calm: FOGO_CALM } : { talk: PANIC, shout: SHOUT, calm: CALM });
    const decks = new Map();
    function deal(list) {
      let d = decks.get(list);
      if (!d || !d.cards.length) {
        const last = d ? d.last : null, cards = list.slice();
        for (let i = cards.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [cards[i], cards[j]] = [cards[j], cards[i]]; }
        if (cards[cards.length - 1] === last) cards.unshift(cards.pop()); // never the same line twice in a row
        d = { cards, last };
        decks.set(list, d);
      }
      d.last = d.cards.pop();
      return d.last;
    }
    // (who spoke last doesn't speak again right away)
    function speaker(pool) {
      const p = pool.length > 1 ? pool.filter((m) => m !== C.lastSpeaker) : pool;
      return (C.lastSpeaker = p.length ? pick(p) : null);
    }
    const awake = () => C.members.filter((m) => alive(m) && !m.crew.off && !m.hidden);
    // the panic: drop whatever they were doing (seated people get up) and run from spot to spot
    function panicUp(a) {
      const c = a.crew;
      if (c.job) {
        if (c.job.order) c.job.order.note = (C.panicKind === 'fogo' ? 'Interrompido pelo incêndio' : 'Interrompido pelo apagão');
        abortRepair(a);
        if (c.job.place) c.job.place.busy = false;
      }
      if (DL.Interact) DL.Interact.release(a);
      c.cup = null;
      if (c.seated || c.state === 'sitting' || c.state === 'standing' || c.state === 'restSit' || c.state === 'resting' || c.state === 'working') standUpNow(a);
      release(a);
      c.job = null;
      c.hold = false;
      c.talkT = 0;
      c.state = 'idle';
      c.panicWait = rand() * 0.6;
      a.route = null;
    }
    function panicStep(a, dt) {
      const c = a.crew;
      if (c.job || c.seated) panicUp(a);
      if (!a.route || !a.route.length) {
        a.moving = false;
        if ((c.panicWait -= dt) > 0) return;
        const p = nav.randomSpot();
        a.route = p ? nav.route(a.x, a.y, p.x, p.y) : null;
        c.panicWait = between(0.1, 0.6);
        // now and then someone stops to shout (bubble only: the chat would flood)
        if (!a.bubble && rand() < 0.3) a.bubble = { text: deal(lines().shout), left: 1.6, tone: 'warn' };
      }
      walkStep(a, dt, speedOf(a) * 1.9);
    }
    function panicTalk(dt) {
      if ((C.talkT -= dt) > 0) return;
      const pool = awake();
      if (!pool.length) return;
      if (C.panic) {
        const a = speaker(pool);
        if (a) { const text = deal(lines().talk); chat.post(a, text, { tone: 'warn' }); if (C.panicKind === 'fogo') a.bubble = { text, left: 2.4, tone: 'warn' }; }
        C.talkT = between(2.4, 3.6);
      } else {
        // relieved comments, two or three, then back to normal
        const a = speaker(pool);
        if (a) { const text = deal(lines().calm); chat.post(a, text, { tone: 'ok' }); if (C.panicKind === 'fogo') a.bubble = { text, left: 2.6, tone: 'ok' }; }
        C.calmLeft = (C.calmLeft || 0) - 1;
        C.talkT = between(1.8, 3);
        if (C.calmLeft <= 0) C.calmT = 0;
      }
    }
    game.on('blackout-warn', () => {
      const a = speaker(awake());
      if (a) chat.post(a, pick(['Ué… a luz piscou?', 'Vocês viram isso? A energia oscilou.', 'Hmm, o nobreak apitou…']), { tone: 'warn' });
    });
    game.on('blackout', (info) => panicSwitch('apagao', !!(info && info.on)));
    // the fire (incendio.js): { on } — never at the same time as a blackout (incendio.js waits for it)
    game.on('fogo', (info) => panicSwitch('fogo', !!(info && info.on)));
    function panicSwitch(kind, on) {
      if (on) {
        C.panic = true;
        C.panicKind = kind;
        C.calmT = 0;
        C.talkT = 0.4;
        for (const a of awake()) panicUp(a);
      } else if (C.panic && (C.panicKind || 'apagao') === kind) {
        C.panic = false;
        // the run stops where they are; the normal routine picks up from there
        for (const a of awake()) { a.route = null; a.moving = false; a.crew.state = 'idle'; a.crew.wait = between(0.6, 1.6); }
        C.calmT = 1;
        C.calmLeft = Math.min(3, Math.max(1, awake().length));
        C.talkT = 0.8;
      }
    }

    /* ---------- workplace: the structure the role needs in its sector (workplace.js) ---------- */
    function needsOf(a) {
      return DL.checkNeeds ? DL.checkNeeds(world(), a.crew.profile.role, zoneRoom(a), DL.roomTypeOf) : [];
    }
    function workplace(a, dt) {
      const c = a.crew;
      if ((c.needsT -= dt) > 0) return;
      c.needsT = 2.5;
      const was = c.missing.map((n) => n.id).join();
      c.missing = needsOf(a).filter((n) => !n.ok);
      const now = c.missing.map((n) => n.id).join();
      if (now !== was) { renderList(); renderCard(true); }
      // the bot notices and says so — in its own words, not too often
      if (!c.missing.length) { c.gripeT = Math.max(c.gripeT, 25); return; }
      c.gripeT -= 2.5;
      if (c.gripeT > 0 || game.paused()) return;
      c.gripeT = between(150, 220);
      const n = c.missing[0], z = zoneRoom(a);
      const line = DL.workGripe(n.id, c.name, n.where || (z ? z.name : null));
      chat.post(a, line, { tone: 'warn' });
      c.alertT = 3;
      if (game.economy) game.emit('workplace-missing', { a, need: n });
    }

    // is there something this person should drop a break for?
    function urgentFor(a) {
      const c = a.crew, t = scene.t, grace = DL.learn ? DL.learn().crewGrace : FIX_GRACE;
      if (game.ops) for (const d of game.ops.devices()) {
        const f = d.fault;
        if (f && f.found && !d.hold && !busyWith(d) && !(game.staff && game.staff.incidentOn(d)) && fixDefFor(a, d) && botCan(fixDefFor(a, d)) && (f.help || t - (f.foundAt || t) >= grace)) return true;
      }
      if (game.staff && tasksOf(a).some((x) => x.kind === 'repair' && botCan(x)) && game.staff.broken().some((b) => !b.taken && !game.staff.claimed(b))) return true;
      if (game.staff && game.staff.clientWaitingFor && game.staff.clientWaitingFor(a)) return true;
      return false;
    }

    /* ---------- off duty (shifts.js): out through the reception, away, back in ---------- */
    function sendHome(a, why) {
      const c = a.crew;
      if (c.off || !alive(a)) return;
      if (c.job) {
        if (c.job.order) c.job.order.note = c.name + ' saiu do turno';
        abortRepair(a);
      }
      c.cup = null;
      if (DL.Interact) DL.Interact.release(a);
      if (c.seated || c.state === 'sitting' || c.state === 'standing' || c.state === 'restSit') standUpNow(a);
      release(a);
      c.job = null;
      c.hold = false;
      c.menu = false;
      c.talkT = 0;
      if (C.sel === a) select(null);
      const r = reception();
      a.route = nav.route(a.x, a.y, r.x, r.y);
      a.blockT = 0;
      c.state = 'off';
      c.off = { phase: a.route ? 'out' : 'fade', t: 0.8, why: why || '' };
      chat.post(a, pick(['Encerrando meu turno. Até mais, pessoal!', 'Fui! Bom trabalho pra quem fica. 👋', 'Turno encerrado. Deixei tudo anotado na passagem de turno.', 'Hora de ir. Qualquer emergência, o plantão cobre!']));
      renderList();
      renderCard(true);
    }
    function bringBack(a, why) {
      const c = a.crew;
      if (!c.off || !alive(a)) return;
      const r = reception();
      a.x = r.x; a.y = r.y;
      a.hidden = false;
      a.alpha = 0;
      a.route = null;
      c.off = { phase: 'in', t: 0.8, why: why || '' };
      renderList();
    }
    function stepAway(a, dt) {
      const c = a.crew, o = c.off;
      if (o.phase === 'out') {
        if (walkStep(a, dt, speedOf(a))) { a.route = null; a.moving = false; o.phase = 'fade'; o.t = 0.8; }
      } else if (o.phase === 'fade') {
        a.moving = false;
        o.t -= dt;
        a.alpha = Math.max(0, o.t / 0.8);
        if (o.t <= 0) { o.phase = 'away'; a.hidden = true; a.alpha = 0; }
      } else if (o.phase === 'in') {
        a.moving = false;
        o.t -= dt;
        a.alpha = Math.min(1, 1 - o.t / 0.8);
        if (o.t <= 0) {
          a.alpha = 1;
          c.off = null;
          c.state = 'idle';
          c.wait = between(0.4, 1);
          chat.post(a, o.why === 'oncall' ? pick(['Cheguei pro plantão! O que pegou?', 'Plantonista na área. Me passem o que precisa.']) : pick(['Bom dia, time! Cheguei.', 'Cheguei! O que tem pra hoje?', 'Começando meu turno. Me atualizem!']));
          renderList();
        }
      } else a.moving = false;
    }

    // selected: stop and look at the player (seated people just turn their head away from the screen)
    function holdStill(a) {
      const c = a.crew;
      a.moving = false;
      if (c.seated) {
        c.pose = 'L';
        if (c.station) c.station.screen.typing = false;
        return;
      }
      if (game.player) faceTo(a, game.player);
    }

    function step(a, dt) {
      const c = a.crew, job = c.job;
      switch (c.state) {
        case 'idle':
          a.moving = false;
          c.wait -= dt;
          if (c.wait <= 0) { c.wait = 0.8; decide(a); }
          break;
        case 'going':
          if (walkStep(a, dt, speedOf(a) + 6)) {
            const s = c.station;
            a.moving = false;
            a.route = null;
            c.glide = { from: { x: a.x, y: a.y }, to: s.sit, t: 0, dur: 0.3 };
            c.seated = true;
            c.sitDir = s.dir;
            c.pose = 'R';
            a.noShadow = true;
            a.sortKey = s.sortKey;
            c.state = 'sitting';
          }
          break;
        case 'sitting':
        case 'standing': {
          const gl = c.glide;
          gl.t = Math.min(1, gl.t + dt / gl.dur);
          const k = gl.t * gl.t * (3 - 2 * gl.t);
          a.x = gl.from.x + (gl.to.x - gl.from.x) * k;
          a.y = gl.from.y + (gl.to.y - gl.from.y) * k;
          if (c.state === 'standing') a.dir = 'down';
          if (gl.t >= 1) {
            if (c.state === 'sitting') {
              c.state = 'working';
              c.phase = 'type';
              c.phaseT = between(2, 4);
              c.poseT = 0;
            } else {
              release(a);
              c.state = 'idle';
              c.wait = between(0.4, 1.1);
              renderCard(true);
            }
          }
          break;
        }
        case 'working': {
          const s = c.station;
          c.phaseT -= dt;
          if (c.phaseT <= 0) {
            const r = rand();
            c.phase = c.phase !== 'type' ? 'type' : r < 0.6 ? 'rest' : 'look';
            c.phaseT = c.phase === 'type' ? between(2, 5) : c.phase === 'rest' ? between(1, 2.5) : between(0.6, 1.4);
          }
          if (c.phase === 'type') {
            c.poseT -= dt;
            if (c.poseT <= 0) { c.pose = c.pose === 'A' ? 'B' : 'A'; c.poseT = between(0.11, 0.19); }
          } else c.pose = c.phase === 'rest' ? 'R' : 'L';
          s.screen.work = roleOf(a).work;
          s.screen.typing = c.phase === 'type';
          if (!job) { standUp(a); break; }
          job.left -= dt;
          if (job.left <= 0) finishJob(a);
          break;
        }
        case 'toEquip':
        case 'toSpot':
          if (walkStep(a, dt, speedOf(a) + 4)) {
            a.route = null;
            a.moving = false;
            const p = job.place;
            if (p && p.bounds) faceTo(a, { x: p.bounds.x + p.bounds.w / 2, y: p.bounds.y + p.bounds.h / 2 });
            else a.dir = c.state === 'toEquip' ? 'up' : 'down';
            c.facing = a.dir;
            c.state = c.state === 'toEquip' ? 'inspecting' : 'atSpot';
          }
          break;
        case 'inspecting':
        case 'atSpot':
          a.moving = false;
          a.dir = c.facing || 'up';
          job.left -= dt;
          if (job.left <= 0) finishJob(a);
          break;
        /* maintenance: walk to the broken unit → take it out → carry it to the bench → repair →
           carry it back → install it again */
        case 'toBroken':
          if (walkStep(a, dt, speedOf(a) + 4)) {
            a.route = null;
            a.moving = false;
            faceToItem(a, job.place);
            c.state = 'pickup';
            c.phaseT = 1.6;
          }
          break;
        case 'pickup':
          a.moving = false;
          c.phaseT -= dt;
          if (c.phaseT <= 0) {
            const b = job.target;
            if (!game.staff || !game.staff.takeOut(b, a)) { cancelJob(a, true); break; }
            c.carry = b.kind;
            const bench = game.staff.benchFor(a, b);
            job.bench = bench;
            a.route = bench ? nav.route(a.x, a.y, bench.x, bench.y, true) : null;
            a.blockT = 0;
            c.state = a.route ? 'carry' : 'repairing';
            if (bench && a.route) chat.post(a, pick(['Levando o ' + b.label + ' para a bancada (' + bench.label + ').', b.label + ' retirado. Vou abrir na bancada.']));
          }
          break;
        case 'carry':
          if (walkStep(a, dt, speedOf(a) - 3)) { a.route = null; a.moving = false; c.state = 'repairing'; }
          break;
        case 'repairing':
          a.moving = false;
          a.dir = job.bench ? job.bench.dir : 'up';
          job.left -= dt;
          if (job.left <= 0) {
            const p = standAt(job.place);
            a.route = nav.route(a.x, a.y, p.x, p.y, true);
            a.blockT = 0;
            c.state = a.route && a.route.length ? 'return' : 'installing';
            c.phaseT = 2.2;
            if (c.state === 'installing') faceToItem(a, job.place);
          }
          break;
        case 'return':
          if (walkStep(a, dt, speedOf(a) - 3)) { a.route = null; a.moving = false; faceToItem(a, job.place); c.state = 'installing'; c.phaseT = 2.2; }
          break;
        case 'installing':
          a.moving = false;
          c.phaseT -= dt;
          if (c.phaseT <= 0) finishJob(a);
          break;
        /* a break: walk to the coffee maker / water cooler → fill a cup → carry it to the own desk
           (or stay right there) → drink a few sips → back to work */
        case 'toFetch':
          if (walkStep(a, dt, speedOf(a))) {
            a.route = null;
            a.moving = false;
            if (job.stand && job.stand.dir) { a.dir = job.stand.dir; c.facing = a.dir; } else faceToItem(a, job.place && (job.place.host || job.place));
            c.state = 'fetching';
            const af = DL.Interact && DL.Interact.of(job.place);
            c.phaseT = af && af.fill ? af.fill : between(1.2, 1.8);
            if (job.place) job.place.busy = true;
          }
          break;
        case 'fetching':
          a.moving = false;
          c.phaseT -= dt;
          if (c.phaseT <= 0) {
            const af = DL.Interact && DL.Interact.of(job.place);
            c.cup = af ? DL.Interact.cupOf(af) : job.place && job.place.kind === 'water' ? 'water' : 'coffee';
            if (job.place) job.place.busy = false;
            // drink at the own desk when it is close and free, else a step away from the machine
            const home = homeStation(a);
            let to = null;
            if (home && !userOf(home) && !brokenSt(home) && Math.hypot(home.approach.x - a.x, home.approach.y - a.y) < 160) to = home.approach;
            else { const f = nav.nearestFree(Math.floor(a.x / T) + (rand() < 0.5 ? -1 : 1), Math.floor((a.y - 2) / T) + 1, 3); if (f) to = nav.center(f[0], f[1]); }
            a.route = to ? nav.route(a.x, a.y, to.x, to.y, true) : null;
            a.blockT = 0;
            c.state = a.route && a.route.length ? 'toSip' : 'sipping';
            c.sipT = between(0.8, 1.6);
          }
          break;
        case 'toSip':
          if (walkStep(a, dt, speedOf(a) - 6)) { a.route = null; a.moving = false; c.state = 'sipping'; a.dir = 'down'; c.sipT = 0.6; }
          break;
        case 'sipping':
          a.moving = false;
          c.sipT -= dt;
          if (c.sipT <= -0.9) c.sipT = between(1.4, 2.6); // cup at the mouth for ~0.9 s, then lowered
          job.left -= dt;
          if (job.left <= 0) { c.lastCup = c.cup; c.cup = null; finishJob(a); }
          break;
        /* a rest on a beanbag / sofa */
        case 'toRest': {
          const s = c.restSeat;
          if (!s || world().items.indexOf(s.item) < 0) { cancelJob(a, true); break; }
          if (walkStep(a, dt, speedOf(a) - 4)) {
            a.route = null;
            a.moving = false;
            c.glide = { from: { x: a.x, y: a.y }, to: s.sit, t: 0, dur: 0.35 };
            c.seated = true;
            c.sitDir = s.dir || 'down';
            c.pose = 'R';
            a.noShadow = true;
            a.sortKey = s.sortKey;
            c.state = 'restSit';
          }
          break;
        }
        case 'restSit': {
          const gl = c.glide;
          gl.t = Math.min(1, gl.t + dt / gl.dur);
          const k = gl.t * gl.t * (3 - 2 * gl.t);
          a.x = gl.from.x + (gl.to.x - gl.from.x) * k;
          a.y = gl.from.y + (gl.to.y - gl.from.y) * k;
          if (gl.t >= 1) { c.state = 'resting'; c.phaseT = between(2, 4); }
          break;
        }
        case 'resting':
          a.moving = false;
          // eyes closed for a moment now and then, looking around otherwise
          c.phaseT -= dt;
          if (c.phaseT <= 0) { c.pose = c.pose === 'R' ? 'L' : 'R'; c.phaseT = c.pose === 'R' ? between(2, 4) : between(0.8, 1.6); }
          if (c.pose === 'R' && Math.sin(scene.t * 0.7 + c.id) > 0.92) a.blinkT = 0.3;
          if (!c.restSeat || world().items.indexOf(c.restSeat.item) < 0) { cancelJob(a, true); break; }
          job.left -= dt;
          if (job.left <= 0) finishJob(a);
          break;
        /* using an object (interact.js): watch the TV, draw on the board, play, work at the bench */
        case 'toUse':
          if (!job.place || world().items.indexOf(job.place) < 0) { cancelJob(a, true); break; }
          if (walkStep(a, dt, speedOf(a))) {
            a.route = null;
            a.moving = false;
            a.dir = (job.stand && job.stand.dir) || 'up';
            c.facing = a.dir;
            c.state = 'using';
          }
          break;
        case 'using':
          a.moving = false;
          a.dir = c.facing || 'up';
          if (!job.place || world().items.indexOf(job.place) < 0) { cancelJob(a, true); break; }
          job.left -= dt;
          if (job.left <= 0) finishJob(a);
          break;
        /* in-person service at the reception (staff.js drives the conversation) */
        case 'toClient': {
          const t = job.target;
          if (!t || !t.client || t.client.state === 'out' || t.client.state === 'leave') { cancelJob(a, true); break; }
          const side = t.x > a.x ? -14 : 14;
          c.rerouteT -= dt;
          if (c.rerouteT <= 0 || !a.route) {
            c.rerouteT = 1.2;
            a.route = nav.route(a.x, a.y, t.x + side, t.y, true);
            if (!a.route) { cancelJob(a, true); break; }
          }
          const done = walkStep(a, dt, speedOf(a) + 4);
          const dist = Math.hypot(t.x - a.x, t.y - a.y);
          // arrived: right beside the visitor, or as close as the furniture lets the route get
          if (Math.hypot(t.x + side - a.x, t.y - a.y) < 8 || dist < 18 || (done && dist < 44)) {
            a.route = null;
            a.moving = false;
            c.stuckT = 0;
            faceTo(a, t);
            c.state = 'serving';
            if (job.def.arrived) job.def.arrived(a, t);
          } else if (done && (c.stuckT = (c.stuckT || 0) + dt) > 3) { c.stuckT = 0; cancelJob(a, true); }
          break;
        }
        case 'serving': {
          a.moving = false;
          const t = job.target;
          if (t) faceTo(a, t);
          if (!t || !t.client || t.client.state === 'out') { finishJob(a); break; }
          if (job.end) finishJob(a);
          break;
        }
        case 'patrol':
          if (a.route && a.route.length) {
            if (walkStep(a, dt, speedOf(a) - 4)) { a.route = null; a.moving = false; c.pauseT = between(0.8, 1.6); }
          } else if (c.pauseT > 0) {
            a.moving = false;
            c.pauseT -= dt;
            // look around the room
            a.dir = ['down', 'left', 'up', 'right'][Math.floor(Math.max(0, c.pauseT) * 2.2) % 4];
          } else if (c.spots.length) {
            const p = c.spots.shift();
            a.route = nav.route(a.x, a.y, p.x, p.y);
            a.blockT = 0;
            if (!a.route) c.pauseT = 0.3;
          } else finishJob(a);
          break;
        case 'toVisit': {
          const t = job.target;
          if (!alive(t)) { cancelJob(a, true); break; }
          if (Math.hypot(t.x - a.x, t.y - a.y) < 20) {
            a.route = null;
            a.moving = false;
            c.state = 'talking';
            faceTo(a, t);
            const free = !t.crew.seated && !t.crew.hold && t.crew.state !== 'sitting' && t.crew.state !== 'standing';
            if (free) { t.crew.talkWith = a; t.crew.talkT = job.left + 0.4; }
            converse(a, t, job.def);
            break;
          }
          c.rerouteT -= dt;
          if (c.rerouteT <= 0 || !a.route || !a.route.length) {
            c.rerouteT = 1.2;
            a.route = nav.route(a.x, a.y, t.x, t.y);
            if (!a.route) { cancelJob(a, true); break; }
          }
          walkStep(a, dt, speedOf(a));
          break;
        }
        case 'talking':
          a.moving = false;
          if (job && alive(job.target)) faceTo(a, job.target);
          if (!job) { c.state = 'idle'; c.wait = 0.5; break; }
          job.left -= dt;
          if (job.left <= 0) finishJob(a);
          break;
      }
    }

    function converse(a, t, def) {
      if (def.id === 'meeting') { chat.post(a, t.crew.name + ', tem um minuto?'); return; }
      const th = TALK.thread && TALK.thread(ctxOf(a), a, t);
      if (th) { playThread(th, a, t); return; }
      const o = rand() < 0.55 ? TALK.observe(ctxOf(a)) : null;
      const [line, reply] = o && o[1] ? o : freshPair();
      chat.post(a, line);
      chat.later(between(1.6, 2.4), () => { if (alive(t)) chat.post(t, reply); });
    }

    // a back-and-forth: each line after the previous one, as long as both are still around
    function playThread(th, a, b) {
      let at = 0;
      th.forEach(([who, text], i) => {
        const sp = who === 0 ? a : b;
        if (i === 0) { chat.post(sp, text); return; }
        at += between(1.8, 2.8) + Math.min(1.5, text.length * 0.02);
        chat.later(at, () => { if (alive(sp) && !sp.crew.off) chat.post(sp, text); });
      });
    }

    function freshPair() {
      const pool = TALK.PAIRS.filter((p) => C.recent.indexOf(p[0]) < 0);
      const p = pick(pool.length ? pool : TALK.PAIRS);
      C.recent.push(p[0]);
      if (C.recent.length > 5) C.recent.shift();
      return p;
    }

    // Ambient talk: someone comments on what is going on (rate-limited by the chat).
    function ambient(dt) {
      if (!chat.ambientReady() || !C.members.length || rand() > dt / 5) return;
      const pool = C.members.filter((m) => !m.crew.hold && !m.crew.off);
      if (!pool.length) return;
      const sp = pick(pool);
      // a conversation with someone nearby (same room first), on something real when possible
      if (pool.length > 1 && TALK.thread && rand() < 0.75) {
        const near = pool.filter((m) => m !== sp).sort((x, y) => Math.hypot(x.x - sp.x, x.y - sp.y) - Math.hypot(y.x - sp.x, y.y - sp.y));
        const th = TALK.thread(ctxOf(sp), sp, near[0]);
        if (th) { playThread(th, sp, near[0]); chat.ambientUsed(between(24, 40)); return; }
      }
      let pair = TALK.observe(ctxOf(sp));
      if (!pair || C.recent.indexOf(pair[0]) >= 0) pair = pool.length > 1 ? freshPair() : null;
      if (!pair) { chat.ambientUsed(8); return; }
      C.recent.push(pair[0]);
      if (C.recent.length > 5) C.recent.shift();
      chat.post(sp, pair[0]);
      const other = pair[1] && pick(pool.filter((m) => m !== sp));
      if (other) chat.later(between(1.8, 3), () => { if (alive(other)) chat.post(other, pair[1]); });
      chat.ambientUsed(between(18, 32));
    }

    function stepLeaving(a, dt) {
      a.tick(dt);
      const L = a.crew.leave;
      L.t -= dt;
      if (L.phase === 'cry') {
        a.moving = false;
        a.dir = 'down';
        a.blinkT = 0.2; // eyes shut while crying
        if (L.t <= 0) {
          const r = reception();
          a.route = nav.route(a.x, a.y, r.x, r.y);
          a.blockT = 0;
          L.phase = a.route ? 'walk' : 'fade';
          L.t = 0.9;
        }
      } else if (L.phase === 'walk') {
        if (walkStep(a, dt, 22)) { a.route = null; a.moving = false; a.dir = 'down'; L.phase = 'fade'; L.t = 0.9; }
        else if (a.route && a.route.length === 1 && Math.hypot(a.route[0].x - a.x, a.route[0].y - a.y) < 1) L.phase = 'fade';
      } else {
        a.moving = false;
        a.alpha = Math.max(0, L.t / 0.9);
        if (L.t <= 0) {
          C.leaving = C.leaving.filter((m) => m !== a);
          scene.actors = scene.actors.filter((m) => m !== a);
          scene.refreshWorld(false);
        }
      }
    }

    /* ---------- ops events → chat ---------- */
    const fixerName = (d) => {
      const roles = new Set();
      for (const id of allRoleIds()) if ((JOBS.BY_ROLE[id] || []).some((t) => t.kind === 'fix' && d.fault && t.types.indexOf(d.fault.type) >= 0)) roles.add(ROLES[id].name);
      return Array.from(roles).join(' ou ');
    };
    game.on('fault', (info) => {
      const d = info.d, who = info.who && alive(info.who) ? info.who : null;
      if (who) {
        who.crew.stats.found++;
        XP.train(who.crew.stats, DL.ROLE_SKILL[who.crew.profile.role], 1.5);
        reward(who, 15);
        const can = !!fixDefFor(who, d);
        chat.post(who, '⚠️ ' + info.msg + '. ' + (can ? playerName() + ', se você não pegar, eu resolvo daqui a pouco.' : 'Alguém de ' + fixerName(d) + ' pode olhar?'), { tone: 'warn' });
        if (!can) {
          const h = C.members.find((m) => m !== who && fixDefFor(m, d));
          if (h) chat.later(between(2, 3), () => { if (alive(h) && d.fault) chat.post(h, 'Vi aqui. ' + playerName() + ', quer resolver pelo terminal? Se não, eu cuido disso.'); });
        }
      } else chat.post({ name: 'Monitor', color: '#ff7a17', role: 'Sistema' }, '⚠️ ' + info.msg, { tone: 'warn' });
    });
    game.on('fixed', (info) => {
      if (info.by) return; // the crew member already said what they did
      const w = pick(C.members.filter((m) => !m.crew.hold));
      if (w) chat.later(1.2, () => { if (alive(w)) chat.post(w, pick(['Boa, ' + playerName() + '! ' + info.d.name + ' de volta.', info.d.name + ' respondendo de novo. Valeu, ' + playerName() + '!']), { tone: 'ok' }); });
    });
    game.on('observe', (info) => { if (info.who && alive(info.who)) chat.post(info.who, info.text); });
    game.on('announce', (info) => {
      if (info.who && alive(info.who)) chat.post(info.who, '⚠️ ' + info.text, { tone: 'warn' });
      else chat.post({ name: 'Monitor', color: '#ff7a17', role: 'Sistema' }, '⚠️ ' + info.text, { tone: 'warn' });
    });

    // Furniture changed: re-route walkers, stand people up whose station moved or vanished.
    function onWorld() {
      const has = (e) => world().items.indexOf(e) >= 0;
      for (const a of C.members) {
        const c = a.crew, job = c.job;
        // furniture moved while someone rests on it: get up where they came from
        if (job && job.def.kind === 'rest' && (c.state === 'resting' || c.state === 'restSit')) {
          const s = c.restSeat, seat = s && has(s.item) && DL.Interact ? DL.Interact.seats(s.item, world()).find((x) => x.k === s.k) : null;
          if (!seat || seat.sit.x !== s.sit.x || seat.sit.y !== s.sit.y) { standUpNow(a); c.job = null; c.state = 'idle'; c.wait = 0.4; a.route = null; DL.Interact && DL.Interact.release(a); continue; }
        }
        if (c.station) {
          const now = stationOf(c.station.key);
          const same = now && now.sit.x === c.station.sit.x && now.sit.y === c.station.sit.y && now.screen === c.station.screen;
          if (!same) {
            if (c.state === 'going') {
              release(a);
              c.job = null;
              c.state = 'idle';
              c.wait = 0.5;
              a.route = null;
              if (job && !job.auto) game.toast('info', 'Estação mudou', c.name + ' vai procurar outra coisa para fazer');
            } else if (c.seated || c.state === 'sitting') { c.job = null; standUp(a); }
          }
        }
        if (job && job.place && !job.place.crew && job.place.kind && !has(job.place)) { cancelJob(a, true); continue; }
        if (job && job.def.kind === 'fix' && game.ops && game.ops.devices().indexOf(job.target) < 0) { cancelJob(a, true); continue; }
        if (a.route && a.route.length && c.state !== 'sitting' && c.state !== 'standing') {
          const last = a.route[a.route.length - 1];
          a.route = nav.route(a.x, a.y, last.x, last.y, c.state === 'going' || c.state === 'toEquip' || c.state === 'toBroken' || c.state === 'carry' || c.state === 'return');
          if (!a.route && c.state !== 'patrol' && c.state !== 'toVisit') cancelJob(a, true);
        }
        // own station removed / sector gone: forget it (automatic organisation picks a new one)
        if (c.home && world().items.indexOf(c.home) < 0) c.home = null;
        if (c.zone && !zoneRoom(a)) c.zone = null;
        if (c.placeAuto && (!c.zone || !c.home)) autoPlace(a, true);
      }
      for (const a of C.leaving) {
        if (a.route && a.route.length) { const last = a.route[a.route.length - 1]; a.route = nav.route(a.x, a.y, last.x, last.y); }
      }
      for (const n of scene.npcs) n.route = null;
      renderCard(true);
      renderList();
    }
    game.on('world', onWorld);

    /* ---------- picking ---------- */
    function pickActor(wx, wy, pool) {
      let best = null, bestD = 1e9;
      for (const a of pool || C.members) {
        if (a.hidden) continue;
        const top = a.crew && a.crew.seated ? a.y - 26 : a.y - 30;
        if (wx >= a.x - 7 && wx <= a.x + 7 && wy >= top && wy <= a.y + 2) {
          const d = Math.abs(a.y - wy);
          if (d < bestD) { bestD = d; best = a; }
        }
      }
      return best;
    }

    function pickStation(wx, wy) {
      const tx = Math.floor(wx / T), ty = Math.floor(wy / T);
      const list = world().items.filter((e) => e.bounds && (e.kind === 'desk' || e.kind === 'chair' || e.kind === 'monitor' || e.kind === 'laptop' || e.kind === 'table'));
      list.sort((a, b) => b.sortY - a.sortY);
      for (const e of list) {
        const b = e.bounds;
        if (wx >= b.x && wx < b.x + b.w && wy >= b.y && wy < b.y + b.h) { const s = stationOf(e); if (s) return s; }
      }
      const e = itemAt(tx, ty, (x) => x.kind === 'desk' || x.kind === 'chair' || x.kind === 'table');
      return e ? stationOf(e) : null;
    }

    /* ---------- selection + profile card ---------- */
    function select(a) {
      if (C.sel && C.sel !== a && C.sel.crew) { C.sel.crew.hold = false; C.sel.crew.menu = false; C.sel.crew.confirmFire = false; }
      C.sel = a;
      if (a) a.crew.hold = true; // stops and looks at the player
      C.cardKey = '';
      renderCard(true);
      renderList();
    }

    // what is left of a work order, in game minutes ("2 min 10 s")
    const timeLeft = (j) => { const s = Math.ceil(Math.max(0, j.left)); return (s >= 60 ? Math.floor(s / 60) + ' min ' : '') + (s % 60) + ' s'; };
    const CUP_NAME = { coffee: 'o café', water: 'a água', tea: 'o chá', soda: 'o refrigerante', snack: 'o lanche', food: 'a marmita' };
    const CUP_DOING = { coffee: 'Tomando café', water: 'Bebendo água', tea: 'Tomando chá', soda: 'Tomando refrigerante', snack: 'Comendo um lanche', food: 'Almoçando' };
    function statusOf(a) {
      const c = a.crew, j = c.job;
      if (c.state === 'leaving') return 'Indo embora';
      if (c.off) return c.off.phase === 'in' ? 'Chegando para o turno' : c.off.phase === 'away' ? 'De folga' + (c.shift && c.shift.id !== 'integral' ? ' · volta às ' + String(c.shift.start).padStart(2, '0') + ':00' : '') : 'Saindo do turno';
      if (c.hold && C.sel === a) return 'Parou para falar com você' + (j ? ' · ' + j.name : '');
      if (c.talkT > 0 && c.talkWith && c.state !== 'talking') return 'Conversando com ' + c.talkWith.crew.name;
      if (!j && c.state !== 'sitting' && c.state !== 'standing') return 'Decidindo o próximo passo';
      switch (c.state) {
        case 'idle': return 'Decidindo o próximo passo';
        case 'going': return 'Indo até ' + (c.station ? c.station.label : 'o computador') + (j ? ' · ' + j.name : '');
        case 'sitting': return 'Sentando…';
        case 'standing': return 'Levantando…';
        // AI tasks (agents.js) report the agent's live progress instead of a countdown
        case 'working': return j ? (j.def.statusText ? j.def.statusText() : j.def.verb + (j.auto ? ' · rotina' : ' · ' + Math.ceil(Math.max(0, j.left)) + ' s')) : 'No computador';
        case 'toEquip': return 'Indo até ' + j.label + ' · ' + j.name;
        case 'inspecting': return j.def.verb + ' · ' + j.label + (j.order ? ' · ' + timeLeft(j) : '');
        case 'toSpot': return 'Indo até ' + (j.label || 'lá') + ' · ' + j.name;
        case 'atSpot': return j.def.verb + (j.order ? ' · ' + timeLeft(j) : '');
        case 'patrol': return j.def.verb;
        case 'toVisit': return 'Indo falar com ' + j.label;
        case 'talking': return j.def.verb + ' com ' + j.label;
        case 'toBroken': return 'Indo buscar ' + j.label + ' · ' + j.name;
        case 'pickup': return 'Retirando ' + j.label;
        case 'carry': return 'Levando ' + j.label + ' para a bancada';
        case 'repairing': return 'Consertando ' + j.label + ' na bancada' + (j.bench ? ' (' + j.bench.label + ')' : '') + ' · ' + Math.ceil(Math.max(0, j.left)) + ' s';
        case 'return': return 'Devolvendo ' + j.label;
        case 'installing': return 'Reinstalando ' + j.label;
        case 'toFetch': return 'Indo até ' + DL.itemName(j.place).toLowerCase() + ' · ' + ((DL.Interact && (DL.Interact.of(j.place) || {}).verb) || 'pausa').toLowerCase();
        case 'fetching': return (DL.Interact && (DL.Interact.of(j.place) || {}).doing) || 'Enchendo o copo';
        case 'toSip': return 'Voltando com ' + (CUP_NAME[c.cup] || 'o copo');
        case 'sipping': return (CUP_DOING[c.cup] || 'Tomando café') + ' · pausa rápida';
        case 'toUse': return 'Indo até ' + DL.itemName(j.place).toLowerCase();
        case 'using': return ((DL.Interact && (DL.Interact.of(j.place) || {}).doing) || j.def.verb) + (j.auto ? '' : ' · ' + Math.ceil(Math.max(0, j.left)) + ' s');
        case 'toRest': return 'Indo descansar um pouco';
        case 'restSit': case 'resting': return 'Descansando no ' + DL.itemName(j.place).toLowerCase();
        case 'toClient': return 'Indo receber ' + (j.label || 'o cliente');
        case 'serving': return 'Atendendo ' + (j.label || 'o cliente') + ' na recepção';
      }
      return '';
    }
    const progressOf = (a) => {
      const c = a.crew, j = c.job;
      if (!j) return 0;
      if (j.def.progress && c.state === 'working') return j.def.progress();
      if (c.state === 'patrol') return 1 - (c.spots.length + (a.route && a.route.length ? 1 : 0)) / (c.spotsTotal || 1);
      if (c.state === 'working' || c.state === 'inspecting' || c.state === 'atSpot' || c.state === 'talking' || c.state === 'sipping' || c.state === 'resting' || c.state === 'using') return Math.max(0, Math.min(1, 1 - j.left / j.total));
      if (c.state === 'serving') return j.progress || 0.5;
      // repair: 15% taking it out, 70% at the bench, the rest bringing it back
      if (c.state === 'pickup' || c.state === 'carry') return 0.15;
      if (c.state === 'repairing') return 0.15 + 0.7 * Math.max(0, Math.min(1, 1 - j.left / j.total));
      if (c.state === 'return') return 0.88;
      if (c.state === 'installing') return 0.94;
      return 0;
    };
    const busy = (a) => !!a.crew.job;
    const starsHtml = (n) => '<span class="stars" aria-label="' + n + ' de 5 estrelas">' + '★'.repeat(n) + '<i>' + '★'.repeat(5 - n) + '</i></span>';

    function skillsHtml(a) {
      const st = a.crew.stats, main = DL.ROLE_SKILL[a.crew.profile.role];
      return '<div class="cc__skills">' + DL.SKILLS.map(([k, name]) => {
        const v = Math.round(st.skills[k] || 0);
        return '<div class="sk' + (k === main ? ' is-main' : '') + '"><span>' + name + '</span><b data-sk="' + k + '">' + v + '</b><i><em data-skbar="' + k + '" style="transform:scaleX(' + (v / 100).toFixed(2) + ')"></em></i></div>';
      }).join('') + '</div>';
    }

    // where the member works: their own station and the sector they stay in
    function placeHtml(a) {
      const c = a.crew, sts = stations();
      C.stList = sts.map((s) => s.key);
      let h = '<div class="cc__place"><label class="cc__sel"><span class="eyebrow-sm">Estação</span><select data-cc-sel="home" aria-label="Estação de ' + esc(c.name) + '"><option value="">Automática (qualquer livre)</option>';
      sts.forEach((s, i) => {
        const o = ownerOf(s);
        h += '<option value="' + i + '"' + (c.home === s.key ? ' selected' : '') + '>' + esc(stationName(s)) + (o && o !== a ? ' · de ' + esc(o.crew.name) : '') + (brokenSt(s) ? ' · quebrada' : '') + '</option>';
      });
      h += '</select></label><label class="cc__sel"><span class="eyebrow-sm">Setor</span><select data-cc-sel="zone" aria-label="Setor de ' + esc(c.name) + '"><option value="">Livre (todas as salas)</option>';
      for (const r of world().rooms || []) h += '<option value="' + esc(r.id) + '"' + (c.zone === r.id ? ' selected' : '') + '>' + esc(r.name) + '</option>';
      return h + '</select></label></div>';
    }

    // pay, schedule, how they attend clients and what their workplace offers
    const isFrontline = (a) => tasksOf(a).some((t) => t.id === 'frontdesk' || t.id === 'tickets');
    function workHtml(a) {
      const c = a.crew, eco = game.economy;
      let h = '<div class="cc__work">';
      // salaries only exist with running costs on (economy.js)
      if (DL.ECON.runningCosts) h += '<div class="cc__pay"><span class="eyebrow-sm">Salário</span><b>' + DL.money(DL.salaryOf ? DL.salaryOf(a) : 0) + '<small>/mês</small></b>' +
        '<span class="cc__payin" data-live="payin">' + (eco ? 'pagamento em ' + eco.payInText() : '') + '</span></div>';
      h += '<label class="cc__sel"><span class="eyebrow-sm">Turno</span><select data-cc-sel="shift" aria-label="Turno de ' + esc(c.name) + '">';
      for (const [id, s] of Object.entries(DL.SHIFTS || {})) h += '<option value="' + id + '"' + (c.shift.id === id ? ' selected' : '') + '>' + esc(s.label) + '</option>';
      if (c.shift.id === 'custom') h += '<option value="custom" selected>Personalizado ' + String(c.shift.start).padStart(2, '0') + '–' + String(c.shift.end % 24).padStart(2, '0') + '</option>';
      h += '</select></label>';
      if (isFrontline(a)) {
        h += '<label class="cc__sel"><span class="eyebrow-sm">Atendimento</span><select data-cc-sel="attend" aria-label="Como ' + esc(c.name) + ' atende">' +
          [['pc', 'Pelo computador'], ['desk', 'Presencial (recepção)'], ['both', 'Computador e presencial']].map(([v, l]) => '<option value="' + v + '"' + ((c.attend || 'pc') === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label>';
      }
      h += '</div>';
      const needs = needsOf(a);
      if (needs.length) {
        const z = zoneRoom(a);
        h += '<div class="cc__needs"><span class="eyebrow-sm">Posto de trabalho' + (z ? ' · ' + esc(z.name) : '') + '</span>' + needs.map((n) =>
          '<span class="need' + (n.ok ? ' is-ok' : ' is-miss') + '" title="' + esc(n.label) + (n.where ? ' · ' + esc(n.where) : '') + '">' + n.icon + ' ' + esc(n.short) + (n.ok ? ' ✓' : ' ✗') + '</span>').join('') +
          (needs.some((n) => !n.ok) ? '<small class="cc__needhint">Falta estrutura: trabalha mais devagar. Construa no setor (B) ou mude o Setor.</small>' : '') + '</div>';
      }
      return h;
    }

    function menuHtml(a) {
      const r = roleOf(a);
      let h = '<div class="cc__menu"><span class="eyebrow-sm">Tarefas de ' + esc(r.title) + '</span>';
      for (const def of tasksOf(a)) {
        const o = optionsFor(a, def);
        // tasks the bot does not do alone yet (career.js): still available as an order
        const solo = (def.auto || def.kind === 'fix' || def.kind === 'repair') && !botCan(def) ? ' · sozinho(a) só a partir do seu nível ' + game.career.levelFor(def) : '';
        h += '<button type="button" class="task-opt" data-task="' + def.id + '"' + (o.targets ? '' : ' disabled') + '><b>' + def.name + '</b><span>' + esc((o.targets ? def.desc : o.reason) + solo) + '</span></button>';
      }
      h += '<button type="button" class="linkbtn cc__back" data-cc="back">Voltar</button></div>';
      return h;
    }

    function renderCard(force) {
      const a = C.sel;
      if (!a || C.mode === 'build') { el.card.classList.remove('is-on'); C.cardKey = ''; return; }
      const c = a.crew, role = roleOf(a), st = c.stats;
      const stars = XP.starsOf(st, c.profile.role);
      const key = [c.id, busy(a), c.name, c.profile.role, !!c.confirmFire, c.menu, st.level, stars, c.unread || 0, c.menu ? world().version + ':' + (game.ops ? game.ops.openFaults : 0) : '', c.home ? c.home.id || 'h' : '', c.zone || '', world().version,
        c.missing.map((n) => n.id).join(), c.shift.id + c.shift.start + '-' + c.shift.end, c.attend, !!c.off, game.agents ? game.agents.badgeOf(a) || '-' : ''].join(':');
      if (!force && key === C.cardKey) return;
      // don't rebuild under an open dropdown
      if (!force && el.card.contains(document.activeElement) && document.activeElement.tagName === 'SELECT') return;
      C.cardKey = key;
      let h = '<div class="cc__head"><span class="cc__dot" style="background:' + role.color + '"></span><b>' + esc(c.name) + '</b><span class="eyebrow-sm" style="color:' + role.color + '">' + role.name + '</span>' +
        '<button type="button" class="cc__x" data-cc="close" aria-label="Fechar">×</button></div>';
      if (c.legend) h += '<p class="cc__legend"><span class="rar rar--legendary">Lendário</span>Faz o trabalho de quase todas as funções · aprende em dobro</p>';
      h += '<div class="cc__rank">' + starsHtml(stars) + '<span class="eyebrow-sm">Nível ' + st.level + '</span><span class="cc__xp" title="Experiência"><i data-live="xp"></i></span></div>';
      if (c.menu) {
        h += menuHtml(a);
      } else {
        if (DL.BotMusic) h += '<div class="cc__music" data-live="music"></div>';
        h += skillsHtml(a);
        h += placeHtml(a);
        h += workHtml(a);
        h += '<p class="cc__status" data-live="status">' + statusOf(a) + '</p>';
        h += '<div class="cc__bar"><i data-live="bar"></i></div>';
        h += '<div class="cc__actions">';
        h += '<button type="button" class="btn btn--sm btn--primary" data-cc="talk">Conversar' + (c.unread ? ' <span class="cc__unread">' + c.unread + '</span>' : '') + '</button>';
        h += '<button type="button" class="btn btn--sm" data-cc="assign">Atribuir tarefa</button>';
        // a real task for an AI agent (agents.js) — only when an Agent Gateway is configured
        if (game.agents) { const ab = game.agents.badgeOf(a); h += '<button type="button" class="btn btn--sm btn--primary cc__ai' + (ab ? ' is-' + ab : '') + '" data-cc="ai" title="Tarefa real com agente de IA (OpenCode)">🤖 IA' + (ab === 'ask' ? ' · aprovar' : ab ? ' · rodando' : ' · OpenCode') + '</button>'; }
        if (busy(a)) h += '<button type="button" class="btn btn--sm" data-cc="stop">Parar</button>';
        h += '<button type="button" class="btn btn--sm" data-cc="edit">Editar</button>';
        h += '<button type="button" class="btn btn--sm' + (c.confirmFire ? ' is-warn' : '') + '" data-cc="fire">' + (c.confirmFire ? 'Confirmar' : 'Dispensar') + '</button>';
        h += '</div>';
        h += '<p class="cc__note">' + st.done + ' tarefa(s) · ' + st.found + ' problema(s) achado(s) · ' + st.fixed + ' resolvido(s)</p>';
      }
      el.card.innerHTML = h;
      el.card.classList.add('is-on');
      liveCard();
    }

    function liveCard() {
      const a = C.sel;
      if (!a || !el.card.classList.contains('is-on')) return;
      const st = el.card.querySelector('[data-live="status"]');
      const s = statusOf(a);
      if (st && st.textContent !== s) st.textContent = s;
      const bar = el.card.querySelector('[data-live="bar"]');
      if (bar) bar.style.transform = 'scaleX(' + progressOf(a).toFixed(3) + ')';
      const pin = el.card.querySelector('[data-live="payin"]');
      if (pin && game.economy) { const t = 'pagamento em ' + game.economy.payInText(); if (pin.textContent !== t) pin.textContent = t; }
      const mu = el.card.querySelector('[data-live="music"]');
      if (mu) {
        // the bot's own (simulated) music: bot-music.js
        const m = DL.BotMusic.of(a);
        const mk = m.title + m.playing;
        if (mu.dataset.k !== mk) {
          mu.dataset.k = mk;
          mu.classList.toggle('is-playing', m.playing);
          mu.innerHTML = '<img class="cc__cover" src="' + DL.BotMusic.cover(m.title, m.genre) + '" alt="" aria-hidden="true">' +
            '<span class="cc__mmeta"><span class="cc__mtitle">' + esc(m.title) + '</span><span class="cc__martist">' + esc(m.artist) + ' · ' + esc(m.genre) + '</span></span>' +
            '<span class="eyebrow-sm cc__mstate">' + (m.playing ? 'Ouvindo' : 'Pausado') + '</span>' +
            '<span class="cc__mbar"><i data-live="mbar"></i></span><span class="cc__mtime" data-live="mtime"></span>';
        }
        mu.querySelector('[data-live="mbar"]').style.transform = 'scaleX(' + (m.pos / m.dur).toFixed(3) + ')';
        const tt = DL.BotMusic.clock(m.pos) + ' / ' + DL.BotMusic.clock(m.dur), te = mu.querySelector('[data-live="mtime"]');
        if (te.textContent !== tt) te.textContent = tt;
      }
      const xp = el.card.querySelector('[data-live="xp"]');
      const S = a.crew.stats;
      if (xp) xp.style.transform = 'scaleX(' + (S.level >= XP.MAX_LEVEL ? 1 : S.xp / XP.xpNeed(S.level)).toFixed(3) + ')';
      for (const [k] of DL.SKILLS) {
        const b = el.card.querySelector('[data-sk="' + k + '"]');
        const v = Math.round(S.skills[k] || 0);
        if (b && b.textContent !== String(v)) {
          b.textContent = v;
          el.card.querySelector('[data-skbar="' + k + '"]').style.transform = 'scaleX(' + (v / 100).toFixed(2) + ')';
        }
      }
    }

    el.card.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    el.card.addEventListener('keydown', (ev) => { if (ev.target.tagName === 'SELECT') ev.stopPropagation(); });
    el.card.addEventListener('change', (ev) => {
      const s = ev.target.closest('[data-cc-sel]'), a = C.sel;
      if (!s || !a) return;
      const c = a.crew;
      if (s.dataset.ccSel === 'shift') {
        if (game.shifts && s.value !== 'custom') game.shifts.setShift(a, s.value);
        s.blur();
        return;
      }
      if (s.dataset.ccSel === 'attend') {
        setAttend(a, s.value);
        s.blur();
        return;
      }
      if (s.dataset.ccSel === 'home') {
        const key = s.value === '' ? null : (C.stList || [])[+s.value] || null;
        const prev = key && C.members.find((m) => m !== a && m.crew.home === key);
        setHome(a, key);
        const st = key && stationOf(key);
        game.toast('ok', 'Estação', key ? c.name + ' agora trabalha em ' + (st ? stationName(st) : key.id) + (prev ? ' (era de ' + prev.crew.name + ')' : '') : c.name + ' usa qualquer estação livre');
        if (key) chat.post(a, pick(['Fechado, ' + (key.id || 'essa estação') + ' é minha agora. Vou arrumar a mesa do meu jeito.', 'Beleza! Minha estação agora é a ' + (key.id || 'nova') + '.']));
      } else {
        const r = (world().rooms || []).find((x) => String(x.id) === s.value) || null;
        setZone(a, r ? r.id : null);
        game.toast('ok', 'Setor', r ? c.name + ' fica na ' + r.name : c.name + ' circula por todas as salas');
        if (r) chat.post(a, 'Combinado, vou ficar na ' + r.name + '.');
        // walk over there right away when nothing important is going on
        if (r && (!c.job || (c.job.auto && c.job.def.kind !== 'repair' && c.job.def.kind !== 'fix')) && !c.seated && c.state !== 'sitting' && c.state !== 'standing') { cancelJob(a, true); c.wait = 0.1; }
      }
      s.blur();
    });
    el.card.addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-task]');
      const a = C.sel;
      if (t && a) {
        const def = tasksOf(a).find((d) => d.id === t.dataset.task);
        const why = def && startJob(a, def, { auto: false });
        if (why) game.toast('warn', 'Não deu', a.crew.name + ': ' + why);
        renderCard(true);
        return;
      }
      const b = ev.target.closest('[data-cc]');
      if (!b || !a) return;
      const c = a.crew;
      switch (b.dataset.cc) {
        case 'close': select(null); break;
        case 'assign': c.menu = true; renderCard(true); break;
        case 'talk': game.emit('talk', a); break;
        case 'ai': if (game.agents) game.agents.open(a); break;
        case 'back': c.menu = false; renderCard(true); break;
        // stopping the visual AI job only frees the person for a minute; the agent keeps running (IA → Parar stops it)
        case 'stop': if (c.job && c.job.def.ai) c.job.def.ai.noJobUntil = Date.now() + 60000; cancelJob(a); break;
        case 'edit': openCreator(a); break;
        case 'fire':
          if (c.confirmFire) fire(a);
          else {
            c.confirmFire = true;
            renderCard(true);
            setTimeout(() => { c.confirmFire = false; if (C.sel === a) renderCard(true); }, 2600);
          }
          break;
      }
      if (b.isConnected) b.blur();
    });

    /* ---------- team panel ---------- */
    function renderList() {
      el.count.textContent = C.members.length + ' / ' + MAX_CREW;
      if (!C.members.length) {
        el.list.innerHTML = '<li class="crew-empty"><p>Ninguém contratado ainda.</p><p class="eyebrow-sm">Crie a primeira pessoa da equipe com <kbd>N</kbd></p></li>';
        return;
      }
      el.list.innerHTML = C.members.map((a) => {
        const c = a.crew, r = roleOf(a);
        return '<li><button type="button" class="crew-row' + (C.sel === a ? ' is-on' : '') + (c.legend ? ' is-legend' : '') + '" data-member="' + c.id + '">' +
          '<span class="cc__dot" style="background:' + r.color + '"></span><span class="crew-row__name">' + esc(c.name) + (c.legend ? ' <em class="rar rar--legendary">Lendário</em>' : '') + '</span>' +
          '<span class="eyebrow-sm crew-row__role">' + r.name + ' · Nv ' + c.stats.level + ' ' + starsHtml(XP.starsOf(c.stats, c.profile.role)) + '</span>' +
          '<span class="crew-row__place">' + esc((c.home ? (c.home.id || 'Estação') : 'Estação livre') + ' · ' + (zoneRoom(a) ? zoneRoom(a).name : 'Todas as salas')) +
          (c.shift && c.shift.id !== 'integral' ? ' · ' + esc(DL.shiftLabel ? DL.shiftLabel(c.shift) : '') : '') + (c.oncall && c.oncall.length ? ' · plantão' : '') + '</span>' +
          (c.missing && c.missing.length ? '<span class="crew-row__miss">⚠ Falta ' + esc(c.missing.map((n) => n.short.toLowerCase()).join(', ')) + '</span>' : '') +
          '<span class="crew-row__status" data-status="' + c.id + '">' + statusOf(a) + '</span>' +
          '<span class="crew-row__bar"><i data-bar="' + c.id + '"></i></span></button></li>';
      }).join('');
      liveList();
    }

    function liveList() {
      if (C.mode !== 'crew') return;
      for (const a of C.members) {
        const id = a.crew.id;
        const s = el.list.querySelector('[data-status="' + id + '"]');
        const t = statusOf(a);
        if (s && s.textContent !== t) s.textContent = t;
        const b = el.list.querySelector('[data-bar="' + id + '"]');
        if (b) b.style.transform = 'scaleX(' + progressOf(a).toFixed(3) + ')';
      }
    }

    el.list.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-member]');
      if (!b) return;
      const a = C.members.find((m) => m.crew.id === +b.dataset.member);
      if (a) { select(a); game.focus(a.x, a.y - 12); }
      b.blur();
    });
    el.hire.addEventListener('click', () => { el.hire.blur(); openCreator(null); });
    el.panel.addEventListener('pointerdown', (ev) => ev.stopPropagation());

    /* ---------- creator (team members and the player's own character) ---------- */
    const CR = { open: false, profile: null, editing: null, pose: 'stand', t: 0, raf: 0, last: 0, cacheKey: '', sheet: null, sit: null };

    function uniqueName(body) {
      const used = new Set(C.members.map((a) => a.crew.name).concat(PL.profile ? [PL.profile.name] : []));
      const pool = NAMES[body].filter((n) => !used.has(n));
      return pick(pool.length ? pool : NAMES[body]);
    }

    function randomProfile(keep) {
      const body = pick(['f', 'm', 'n']);
      const styles = body === 'f' ? ['long', 'bun', 'ponytail', 'bob', 'curly', 'afro', 'short'] : body === 'm' ? ['short', 'buzz', 'curly', 'afro', 'short', 'bun'] : STYLES.map((s) => s[0]);
      const p = {
        name: uniqueName(body), body, skin: pick(SKINS), hair: pick(HAIRS.slice(0, 6).concat(rand() < 0.15 ? HAIRS.slice(6) : [])),
        hairStyle: pick(styles), outfit: pick(OUTFITS)[0], shirt: pick(CLOTHES), pants: pick(PANTS),
        vest: rand() < 0.1, glasses: rand() < 0.3, beard: body !== 'f' && rand() < 0.3, headset: rand() < 0.15, earrings: body !== 'm' && rand() < 0.25,
        hat: rand() < 0.14 ? pick(['cap', 'beanie']) : '', role: pick(ROLE_IDS),
      };
      if (keep) { p.role = keep.role; if (keep.nameTouched) p.name = keep.name; if (keep.shoes) p.shoes = keep.shoes; }
      return p;
    }

    const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
    const chips = (k, opts) => '<div class="chips" role="radiogroup">' + opts.map(([v, l]) => '<button type="button" class="chip" role="radio" data-k="' + k + '" data-v="' + v + '">' + l + '</button>').join('') + '</div>';
    const swatches = (k, cols, label) => '<div class="swatches" role="radiogroup" aria-label="' + label + '">' + cols.map((c) => '<button type="button" class="swatch" role="radio" data-k="' + k + '" data-v="' + c + '" style="--c:' + c + '" aria-label="' + c + '"></button>').join('') + '</div>';
    const field = (label, body) => '<div class="cr-field"><span class="eyebrow-sm">' + label + '</span>' + body + '</div>';

    // what the player owns from the shop joins the built-in options (inventory.js)
    function ownedOpts() {
      const inv = DL.Inventory, o = { hair: [], shirt: [], hat: [], pants: [], acc: [], colors: [] };
      if (!inv) return o;
      for (const it of DL.COSMETICS || []) {
        // accessories and the pet are equipped in the inventory, not picked here
        if (it.cat !== 'char' || !inv.owns(it.id) || (DL.GEAR_SLOTS || []).indexOf(it.slot) >= 0) continue;
        if (it.slot === 'hair') o.hair.push([it.value, it.name]);
        else if (it.slot === 'shirt') o.shirt.push([it.value, it.name]);
        else if (it.slot === 'hat') { if (!o.hat.some((x) => x[0] === it.value)) o.hat.push([it.value, it.name]); }
        else if (it.slot === 'pants') o.pants.push([it.value, it.name]);
        else if (it.slot === 'palette') o.colors = o.colors.concat(it.value);
        else if (it.slot) o.acc.push([it.slot, it.name]);
      }
      return o;
    }
    const shopTag = (opts) => opts.map(([v, l]) => [v, l + ' ✦']);

    function buildForm() {
      const own = ownedOpts();
      // organised in sections (Aparência · Roupa · Calça · Acessórios · Função) with a bar of shortcuts on top
      const sec = (id, title, body) => '<section class="cr-sec" data-sec="' + id + '" aria-label="' + title + '"><h3 class="cr-sec__t">' + title + '</h3>' + body + '</section>';
      let h = '<nav class="cr-nav" aria-label="Seções">' + [['look', 'Aparência'], ['top', 'Roupa'], ['pants', 'Calça'], ['acc', 'Acessórios'], ['role', 'Função']]
        .map(([id, l]) => '<button type="button" class="cr-nav__b" data-go="' + id + '">' + l + '</button>').join('') + '</nav>';
      h += '<div class="cr-cost" id="crCost" aria-live="polite"></div>';
      h += sec('look', 'Aparência',
        field('Nome', '<input class="input" id="crName" type="text" maxlength="16" autocomplete="off" spellcheck="false">') +
        field('Corpo', chips('body', BODIES)) +
        field('Pele', swatches('skin', SKINS, 'Tom de pele')) +
        field('Cabelo', chips('hairStyle', STYLES.concat(shopTag(own.hair))) + swatches('hair', HAIRS, 'Cor do cabelo')));
      h += sec('top', 'Roupa', field('Modelo', chips('outfit', OUTFITS.concat(shopTag(own.shirt)))) + field('Cor', swatches('shirt', CLOTHES.concat(own.colors), 'Cor da roupa')));
      h += sec('pants', 'Calça', (own.pants.length ? field('Modelo', chips('pantsStyle', [['', 'Reta']].concat(shopTag(own.pants)))) : '') + field('Cor', swatches('pants', PANTS.concat(own.colors), 'Cor da calça')));
      h += sec('acc', 'Acessórios', field('Extras', '<div class="chips">' + EXTRAS.concat(shopTag(own.acc)).map(([k, l]) => '<button type="button" class="chip" data-t="' + k + '" aria-pressed="false">' + l + '</button>').join('') + '</div>') +
        field('Na cabeça', chips('hat', HATS.map(([v, l]) => [v, v ? l : 'Sem chapéu']).concat(shopTag(own.hat)))) +
        '<p class="cr-shop-note">✦ itens da sua loja/inventário · <button type="button" class="linkbtn" data-cr-shop>abrir a loja</button></p>');
      CR.invVer = DL.Inventory ? DL.Inventory.version : 0;
      h += sec('role', 'Função', '<div class="roles" role="radiogroup">' + allRoleIds().map((id) => {
        const r = ROLES[id];
        return '<button type="button" class="role-card' + (r.custom ? ' is-custom' : '') + '" role="radio" data-k="role" data-v="' + id + '" style="--c:' + r.color + '"><span class="cc__dot"></span><b>' + esc(r.name) + (r.custom ? ' <em>criado</em>' : '') + '</b><span>' + esc(r.desc) + '</span></button>';
      }).join('') + '</div>');
      CR.rolesVer = DL.rolesVersion || 0;
      el.form.innerHTML = h;
      el.form.querySelector('#crName').addEventListener('input', (ev) => {
        CR.profile.name = ev.target.value;
        CR.profile.nameTouched = true;
        renderWho();
      });
      CR.navOn = '';
    }

    // the card above the preview: name, function and — for my own character — rank and XP
    function renderWho() {
      const box = document.getElementById('creatorWho');
      if (!box || !CR.profile) return;
      const p = CR.profile, r = ROLES[p.role] || {}, me = CR.editing === 'player';
      let h = '<b class="creator__name">' + esc((p.name || '').trim() || '—') + '</b><span class="creator__role" style="--c:' + (r.color || '#7ef0aa') + '">' + esc(r.title || r.name || '') + '</span>';
      const K = me && game.career && game.career.info;
      if (K) {
        const pct = K.need ? Math.min(1, K.lvlXp / K.need) : 1;
        h += '<span class="creator__rank" style="--c:' + K.rank.color + '">' + esc(K.rank.name) + ' · nível ' + K.level + '</span>' +
          '<span class="creator__xp" role="progressbar" aria-label="XP da patente" aria-valuemin="0" aria-valuemax="' + (K.need || K.xp) + '" aria-valuenow="' + K.lvlXp + '"><i style="transform:scaleX(' + pct.toFixed(3) + ')"></i></span>' +
          '<small class="creator__xpn">' + (K.need ? K.lvlXp + ' / ' + K.need + ' XP' : K.xp + ' XP no total') + '</small>';
      }
      box.innerHTML = h;
    }
    // the section shortcuts: a tap scrolls there; scrolling lights up the section in view
    function syncNav() {
      const f = el.form, secs = f.querySelectorAll('.cr-sec');
      if (!secs.length) return;
      const top = f.getBoundingClientRect().top + 60;
      let on = secs[0].dataset.sec;
      for (const s of secs) if (s.getBoundingClientRect().top <= top) on = s.dataset.sec;
      if (f.scrollTop > 0 && f.scrollTop + f.clientHeight >= f.scrollHeight - 4) on = secs[secs.length - 1].dataset.sec;
      if (on === CR.navOn) return;
      CR.navOn = on;
      f.querySelectorAll('.cr-nav__b').forEach((b) => { const k = b.dataset.go === on; b.classList.toggle('is-on', k); b.setAttribute('aria-current', k ? 'true' : 'false'); });
    }
    el.form.addEventListener('scroll', () => { if (!CR.navRaf) CR.navRaf = requestAnimationFrame(() => { CR.navRaf = 0; syncNav(); }); }, { passive: true });

    function syncForm() {
      const p = CR.profile;
      el.form.querySelectorAll('[data-k]').forEach((b) => {
        const on = String(p[b.dataset.k] || '') === b.dataset.v;
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-checked', on ? 'true' : 'false');
      });
      el.form.querySelectorAll('[data-t]').forEach((b) => {
        const on = !!p[b.dataset.t];
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', on ? 'true' : 'false');
      });
      const n = el.form.querySelector('#crName');
      if (n.value !== p.name) n.value = p.name;
      el.poseSeg.querySelectorAll('[data-pose]').forEach((b) => b.classList.toggle('is-on', b.dataset.pose === CR.pose));
      renderCost();
      renderWho();
    }

    el.form.addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (!b) return;
      if (b.hasAttribute('data-cr-shop')) { closeCreator(); if (game.store) game.store.open('skins'); return; }
      if (b.dataset.go) {
        const t = el.form.querySelector('.cr-sec[data-sec="' + b.dataset.go + '"]'), nav = el.form.querySelector('.cr-nav');
        if (t) el.form.scrollTo({ top: t.offsetTop - (nav ? nav.offsetHeight + 6 : 0), behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
        return;
      }
      const p = CR.profile;
      if (b.dataset.k) {
        p[b.dataset.k] = b.dataset.v;
        if (b.dataset.k === 'hat') p.hatColor = null;
        if (b.dataset.k === 'role' && CR.pose === 'stand') CR.pose = 'work';
      } else if (b.dataset.t) p[b.dataset.t] = !p[b.dataset.t];
      syncForm();
    });
    el.poseSeg.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-pose]');
      if (b) { CR.pose = b.dataset.pose; CR.t = 0; syncForm(); }
    });
    el.random.addEventListener('click', () => {
      CR.profile = randomProfile(CR.editing ? { role: CR.profile.role, name: CR.profile.name, nameTouched: true, shoes: CR.profile.shoes } : null);
      syncForm();
    });
    el.cancel.addEventListener('click', () => closeCreator());
    el.save.addEventListener('click', () => saveCreator());
    el.creator.addEventListener('pointerdown', (ev) => { if (ev.target === el.creator) closeCreator(); });

    // target: a crew actor (edit), 'player' (my character) or null (hire)
    function openCreator(target) {
      if (!target && C.members.length >= MAX_CREW) { game.toast('warn', 'Equipe cheia', 'Dispense alguém para contratar'); return; }
      const me = target === 'player';
      CR.editing = target || null;
      CR.pay = Math.round((0.92 + rand() * 0.16) * 100) / 100; // the salary this candidate asks for
      CR.profile = me ? Object.assign({}, PL.profile, { nameTouched: true }) : target ? Object.assign({}, target.crew.profile, { nameTouched: true }) : randomProfile();
      CR.pose = 'stand';
      CR.t = 0;
      if (!el.form.firstChild || CR.rolesVer !== (DL.rolesVersion || 0) || CR.invVer !== (DL.Inventory ? DL.Inventory.version : 0)) buildForm();
      el.title.textContent = me ? 'Meu personagem' : target ? 'Editar ' + target.crew.name : 'Nova contratação';
      if (el.sub) el.sub.textContent = me ? 'Você · quem comanda o datacenter' : 'Equipe · meu datacenter';
      el.save.firstChild.textContent = target ? 'Salvar ' : 'Contratar ';
      syncForm();
      el.form.scrollTop = 0;
      CR.navOn = '';
      syncNav();
      el.creator.classList.add('is-open');
      el.creator.classList.toggle('is-me', me);
      CR.open = true;
      CR.last = performance.now();
      cancelAnimationFrame(CR.raf);
      CR.raf = requestAnimationFrame(previewLoop);
      game.keysReset && game.keysReset();
      // (on a phone the keyboard would cover the screen right away: the name field waits for a tap)
      if (!DL.MOBILE) setTimeout(() => { const n = el.form.querySelector('#crName'); n.focus({ preventScroll: true }); n.select(); }, 60);
    }

    function closeCreator() {
      el.creator.classList.remove('is-open');
      CR.open = false;
      cancelAnimationFrame(CR.raf);
      if (el.creator.contains(document.activeElement)) document.activeElement.blur();
    }

    function saveCreator() {
      const p = CR.profile;
      p.name = (p.name || '').trim().slice(0, 16) || (CR.editing === 'player' ? DEFAULT_PLAYER.name : uniqueName(p.body));
      const prof = Object.assign({}, p);
      delete prof.nameTouched;
      if (CR.editing === 'player') {
        PL.profile = prof;
        applyPlayer(true);
        game.toast('ok', 'Meu personagem', prof.name + ' · ' + ROLES[prof.role].title);
        const w = pick(C.members.filter((m) => !m.crew.hold));
        if (w) chat.later(1.2, () => { if (alive(w)) chat.post(w, pick(['Visual novo, ' + prof.name + '? Ficou ótimo!', 'Olha só, ' + prof.name + ' de visual novo 😎'])); });
      } else if (CR.editing) {
        const a = CR.editing, c = a.crew;
        const roleChanged = c.profile.role !== prof.role;
        c.profile = prof;
        c.name = prof.name;
        applyLook(a);
        if (roleChanged) {
          if (c.job) cancelJob(a, true);
          if (c.placeAuto) autoPlace(a);
          chat.post(a, 'Mudei de função: agora sou ' + ROLES[prof.role].title.toLowerCase() + '. Muita coisa para aprender!');
        }
        game.toast('ok', 'Perfil atualizado', prof.name + ' · ' + ROLES[prof.role].title);
        renderCard(true);
        renderList();
      } else {
        // the hire costs money: when the company can't pay, the card stays open
        if (!hire(prof, { pay: CR.pay })) return;
        C.created++;
      }
      closeCreator();
    }

    // salary, hiring cost and the structure the role needs — shown live in the hiring card
    function renderCost() {
      const box = el.form.querySelector('#crCost');
      if (!box) return;
      const p = CR.profile, hiring = !CR.editing;
      if (CR.editing === 'player') { box.hidden = true; return; }
      box.hidden = false;
      const level = CR.editing ? CR.editing.crew.stats.level : 1, pay = CR.editing ? CR.editing.crew.pay : CR.pay;
      const sal = DL.salaryFor ? DL.salaryFor(p.role, level, pay) : 0, fee = DL.hireCostFor ? DL.hireCostFor(p.role, level, pay) : 0;
      const eco = game.economy, cash = eco ? eco.company.cash : 0;
      const needs = (DL.needsOfRole ? DL.needsOfRole(p.role) : []).map((id) => DL.WORK_RES[id]);
      const chk = DL.checkNeeds ? DL.checkNeeds(world(), p.role, null, DL.roomTypeOf) : [];
      const paid = DL.ECON.runningCosts;
      let h = '<div class="cr-cost__grid">' + (paid ? '<div><span class="eyebrow-sm">Salário</span><b>' + DL.money(sal) + '<small>/mês</small></b></div>' : '');
      if (hiring) h += '<div><span class="eyebrow-sm">Contratação' + (paid ? '' : ' · pagamento único') + '</span><b class="' + (cash < fee ? 'is-neg' : '') + '">' + DL.money(fee) + '</b></div>';
      if (paid) h += '<div><span class="eyebrow-sm">Próximo pagamento</span><b>' + (eco ? 'em ' + eco.payInText() : '—') + '</b></div>';
      h += '</div>';
      if (needs.length) h += '<p class="cr-cost__needs"><span class="eyebrow-sm">Precisa para trabalhar</span>' + chk.map((n) => '<span class="need' + (n.ok ? ' is-ok' : ' is-miss') + '">' + (n.ok ? '✓ ' : '✗ ') + esc(n.short) + '</span>').join('') + '</p>';
      if (hiring && cash < fee) h += '<p class="cr-cost__warn">Caixa insuficiente para contratar agora (' + DL.money(cash) + ').</p>';
      if (box.dataset.k !== h) { box.dataset.k = h; box.innerHTML = h; }
      if (hiring) el.save.firstChild.textContent = 'Contratar · ' + DL.money(fee) + ' ';
    }

    function previewLoop(now) {
      if (!CR.open) return;
      const dt = Math.max(0, Math.min(0.05, (now - CR.last) / 1000));
      CR.last = now;
      CR.t += dt;
      drawPreview();
      CR.raf = requestAnimationFrame(previewLoop);
    }

    function drawPreview() {
      const cv = el.canvas, k = 3, VW = 80, VH = 64;
      if (cv.width !== VW * k) { cv.width = VW * k; cv.height = VH * k; }
      const g = cv.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, cv.width, cv.height);
      g.imageSmoothingEnabled = false;
      g.setTransform(k, 0, 0, k, 0, 0);
      const L = lookOf(CR.profile);
      const key = JSON.stringify(L);
      if (key !== CR.cacheKey) { CR.cacheKey = key; CR.sheet = DL.makeSheet(L); CR.sit = DL.makeSitSheet(L); }
      // floor
      for (let x = 0; x < VW; x += T) for (let y = 40; y < VH; y += T) DL.floorTile(g, x, y, false);
      DL.R(g, 0, 39, VW, 1, '#20242c');
      const t = CR.t, blink = Math.sin(t * 2.1) > 0.985;
      if (CR.pose === 'work') {
        const r1 = Math.floor(t / 3.2) % 2 === 1, py = 34;
        const desk = { kind: 'desk', px: 24, py, tw: 2, th: 1, rot: r1 ? 1 : 0, seed: 5, work: ROLES[CR.profile.role].work, typing: Math.floor(t / 2.4) % 3 !== 2 };
        const chair = { kind: 'chair', rot: r1 ? 1 : 0, cx: 40, cy: r1 ? py - 5 : py + 27, tw: 2 };
        const set = CR.sit[r1 ? 'down' : 'up'];
        const pose = desk.typing ? (Math.floor(t * 7) % 2 ? 'A' : 'B') : blink ? 'blink' : 'R';
        const who = { x: 40, y: r1 ? py - 2 : py + 20, noShadow: true, frame: () => set[pose] };
        if (r1) { DL.drawItem(g, chair, t); DL.drawItem(g, desk, t); DL.drawActor(g, who, k); }
        else { DL.drawItem(g, desk, t); DL.drawActor(g, who, k); DL.drawItem(g, chair, t); }
        return;
      }
      const dirs = ['down', 'right', 'up', 'left'];
      const walking = CR.pose === 'walk';
      const dir = dirs[Math.floor(t / (walking ? 2 : 1.2)) % 4];
      const f = CR.sheet[dir];
      const img = walking ? f.walk[Math.floor(t * 7) % 4] : blink ? f.blink : f.idle;
      DL.drawActor(g, { x: 40, y: 54, frame: () => img }, k);
    }

    /* ---------- world-anchored UI: name tags, speech bubbles, the card ---------- */
    const tagEls = new Map(), sayEls = new Map();
    let meTag = null;
    function anchor(node, a, lift) {
      const p = scene.worldToScreen(a.x, a.y, lift);
      node.style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px) translate(-50%,-100%)';
    }
    // Is this NPC in the room the player is looking at? (street.js: the datacenter, the street or a shop;
    // each NPC's `sala`). Bubbles and tags are drawn from the NPC's own position every frame, and only then.
    const naSala = (a) => !DL.Street || !DL.Street.naSala || DL.Street.naSala(a);
    // the player is drawn by street.js while outside (player.hidden is only for the datacenter's picture)
    const drawn = (a) => (a === game.player && DL.Street && DL.Street.outside ? !DL.Street.busy : !a.hidden);
    const allTalkers = () => C.members.concat(C.leaving, game.player ? [game.player] : [], game.extraTalkers ? game.extraTalkers() : []);
    // changing rooms (street.js): every bubble on screen goes, and nobody left behind keeps talking
    game.on('sala', () => {
      for (const a of allTalkers()) if (a.bubble && (a === game.player || !naSala(a))) a.bubble = null;
      for (const s of sayEls.values()) s.classList.remove('is-on');
    });
    // building hides people (demo.js fades scene.peopleAlpha to 0): their tags and bubbles fade with them
    const peopleOn = () => C.mode !== 'build' || scene.peopleAlpha > 0;
    function updateUi(dt) {
      const near = (a) => naSala(a) && (C.mode === 'crew' || C.sel === a || (game.player && Math.hypot(a.x - game.player.x, a.y - game.player.y) < 64));
      const lift = (a) => ((a.crew ? a.crew.seated : a.seated) ? 27 : 31);
      for (const a of C.members) {
        let s = tagEls.get(a);
        if (!s) {
          s = document.createElement('span');
          s.className = 'nametag';
          el.tags.appendChild(s);
          tagEls.set(a, s);
        }
        const r = roleOf(a);
        const alert = a.crew.alertT > 0;
        const txt = a.crew.name;
        const unread = a.crew.unread > 0;
        const miss = a.crew.missing && a.crew.missing.length > 0;
        const tune = DL.BotMusic ? DL.BotMusic.of(a) : null, music = !!(tune && tune.playing);
        const k = txt + r.color + alert + a.crew.stats.level + unread + miss + music;
        if (s.dataset.k !== k) { s.dataset.k = k; s.innerHTML = (alert ? '<b>!</b>' : '<i style="background:' + r.color + '"></i>') + esc(txt) + '<small>' + a.crew.stats.level + '</small>' + (music ? '<em class="nt-music" title="Ouvindo música">♪</em>' : '') + (miss ? '<em class="nt-miss" title="Falta estrutura no posto de trabalho">⚠</em>' : '') + (unread ? '<em title="Quer falar com você">💬</em>' : ''); }
        s.classList.toggle('is-alert', alert);
        s.classList.toggle('is-legend', !!a.crew.legend);
        const show = (near(a) || ((alert || unread) && naSala(a))) && peopleOn() && C.sel !== a && !a.bubble && !a.hidden && !(a.alpha != null && a.alpha < 0.3);
        s.classList.toggle('is-on', show);
        if (show) anchor(s, a, lift(a));
      }
      for (const [a, s] of tagEls) if (C.members.indexOf(a) < 0) { s.remove(); tagEls.delete(a); }

      // speech bubbles (members and people on their way out)
      // (also the player and the visitors at the reception — staff.js)
      const talkers = allTalkers();
      for (const a of talkers) {
        let s = sayEls.get(a);
        // safety: a bubble whose NPC has no valid position anymore is removed
        if (a.bubble && !(Number.isFinite(a.x) && Number.isFinite(a.y))) a.bubble = null;
        if (!a.bubble) { if (s) s.classList.remove('is-on'); continue; }
        if (!s) {
          s = document.createElement('span');
          s.className = 'say';
          el.tags.appendChild(s);
          sayEls.set(a, s);
        }
        const b = a.bubble;
        if (s.dataset.k !== b.text) { s.dataset.k = b.text; s.textContent = b.text; s.className = 'say is-' + (b.tone || 'chat'); }
        const show = peopleOn() && C.sel !== a && naSala(a) && drawn(a) && !(a.alpha != null && a.alpha < 0.2);
        s.classList.toggle('is-on', show);
        if (show) anchor(s, a, lift(a) + 2);
      }
      for (const [a, s] of sayEls) if (talkers.indexOf(a) < 0) { s.remove(); sayEls.delete(a); }

      // my own tag in team mode
      if (!meTag) { meTag = document.createElement('span'); meTag.className = 'nametag is-me'; el.tags.appendChild(meTag); }
      // the season pass' title (Pioneiro) shows under my name, its icon (Chip Boot) before it (battlepass.js)
      const passT = DL.Pass && DL.passTitleHtml ? DL.passTitleHtml(DL.Pass.myTitle()) : '';
      const passI = DL.Pass && DL.passIconHtml ? DL.passIconHtml(DL.Pass.myIcon()) : '';
      const pl = game.player, showMe = !!pl && (C.mode === 'crew' || (peopleOn() && (!!(DL.Auth && DL.Auth.myTitles.length) || !!passT || !!passI)));
      meTag.classList.toggle('is-on', showMe && !(pl.bubble && (passT || passI)));
      if (showMe) {
        const title = DL.Auth && DL.Auth.myTitles[0], k = PL.profile.name + PL.profile.role + (title || '') + passT + passI;
        if (meTag.dataset.k !== k) { meTag.dataset.k = k; meTag.innerHTML = '<i style="background:' + ROLES[PL.profile.role].color + '"></i>' + passI + esc(PL.profile.name) + (title ? ' ' + DL.titleBadge(title) : '') + ' <small>você</small>' + passT; meTag.classList.toggle('has-ptitle', !!passT); }
        anchor(meTag, pl, 31);
      }

      // card above the selected member (kept on screen)
      if (C.sel && el.card.classList.contains('is-on')) {
        const a = C.sel;
        const p = scene.worldToScreen(a.x, a.y, lift(a));
        const h = el.card.offsetHeight, w = el.card.offsetWidth;
        // keep clear of the team panel on the right when it is open
        const right = C.mode === 'crew' && !el.panel.hidden ? el.panel.getBoundingClientRect().left - 12 : innerWidth - 12;
        const x = Math.max(w / 2 + 12, Math.min(right - w / 2, p.x));
        const y = Math.max(h + 64, p.y);
        el.card.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) translate(-50%,-100%)';
      }
      C.uiAcc += dt || 0;
      if (C.uiAcc > 0.2) {
        C.uiAcc = 0;
        renderCard(false);
        liveCard();
        liveList();
      }
    }

    function brackets(g, b, col) {
      g.fillStyle = col;
      const x0 = b.x - 1, y0 = b.y - 1, x1 = b.x + b.w, y1 = b.y + b.h, L = 4;
      g.fillRect(x0, y0, L, 1); g.fillRect(x0, y0, 1, L);
      g.fillRect(x1 - L + 1, y0, L, 1); g.fillRect(x1, y0, 1, L);
      g.fillRect(x0, y1, L, 1); g.fillRect(x0, y1 - L + 1, 1, L);
      g.fillRect(x1 - L + 1, y1, L, 1); g.fillRect(x1, y1 - L + 1, 1, L);
    }

    // drawn under everything: a role-coloured ring at the selected member's feet
    function underlay(g) {
      const a = C.sel;
      if (!a || C.mode === 'build') return;
      const col = roleOf(a).color;
      const x = Math.round(a.x), y = Math.round(a.y);
      g.globalAlpha = 0.85;
      g.fillStyle = col;
      g.fillRect(x - 4, y - 3, 8, 1);
      g.fillRect(x - 4, y + 2, 8, 1);
      g.fillRect(x - 6, y - 2, 2, 1);
      g.fillRect(x + 4, y - 2, 2, 1);
      g.fillRect(x - 6, y + 1, 2, 1);
      g.fillRect(x + 4, y + 1, 2, 1);
      g.fillRect(x - 7, y - 1, 1, 2);
      g.fillRect(x + 6, y - 1, 1, 2);
      g.globalAlpha = 1;
    }

    // tears: drops fall from the eyes while someone leaves crying
    function tears(g, a, t) {
      const L = a.crew.leave;
      if (!L || L.phase === 'fade' || a.dir === 'up') return;
      const x = Math.round(a.x), y = Math.round(a.y);
      const eyes = a.dir === 'down' ? [x - 3, x + 2] : a.dir === 'right' ? [x + 2] : [x - 3];
      g.fillStyle = '#8cc4ff';
      eyes.forEach((ex, i) => {
        for (let n = 0; n < 2; n++) {
          const k = (t * 1.7 + n * 0.5 + i * 0.27) % 1;
          g.globalAlpha = 0.95 * (1 - k);
          g.fillRect(ex, y - 17 + Math.round(k * 9), 1, k < 0.25 ? 1 : 2);
        }
      });
      g.globalAlpha = 1;
    }

    // the unit being carried (a PC tower or a 1U switch) and the work at the bench
    function drawUnit(g, kind, x, y) {
      if (kind === 'switch' || kind === 'server') { // (a server burnt in a fire: incendio.js)
        g.fillStyle = '#11141a'; g.fillRect(x - 6, y - 1, 13, 5);
        g.fillStyle = '#2a313b'; g.fillRect(x - 5, y, 11, 3);
        g.fillStyle = '#39414d'; g.fillRect(x - 5, y, 11, 1);
        g.fillStyle = '#7ee0a1'; g.fillRect(x - 4, y + 2, 1, 1); g.fillRect(x - 2, y + 2, 1, 1);
        g.fillStyle = '#ff7a17'; g.fillRect(x + 2, y + 2, 1, 1);
      } else {
        g.fillStyle = '#11141a'; g.fillRect(x - 4, y - 3, 8, 9);
        g.fillStyle = '#2c3139'; g.fillRect(x - 3, y - 2, 6, 7);
        g.fillStyle = '#3a414c'; g.fillRect(x - 3, y - 2, 6, 1);
        g.fillStyle = '#ff7a17'; g.fillRect(x + 1, y, 1, 1);
      }
    }
    function maintenanceFx(g, a, t) {
      const c = a.crew, j = c.job;
      if (c.carry && (c.state === 'carry' || c.state === 'return' || c.state === 'pickup' || c.state === 'installing')) {
        const lift = c.state === 'pickup' || c.state === 'installing' ? Math.round(Math.sin(t * 5) * 1) : 0;
        // seen from behind, the unit shows above the shoulders
        drawUnit(g, c.carry, Math.round(a.x) + (a.dir === 'left' ? -3 : a.dir === 'right' ? 3 : 0), Math.round(a.y) - (a.dir === 'up' ? 24 : 11) + lift);
      }
      if (c.state === 'repairing' && j) {
        // the unit lies open on the bench; sparks from the soldering iron, a blinking tester
        // no bench around: the unit is worked on right there, in the hands
        const b = j.bench, bx = b ? Math.round(b.ux) : Math.round(a.x), by = b ? Math.round(b.uy) : Math.round(a.y) - 10;
        drawUnit(g, c.carry || 'pc', bx, by);
        for (let i = 0; i < 3; i++) {
          if (Math.sin(t * 13 + i * 2.1) < 0.3) continue;
          g.fillStyle = i % 2 ? '#ffe9a8' : '#ffc285';
          g.fillRect(bx - 3 + ((i * 5 + Math.floor(t * 9)) % 8), by - 3 - ((i + Math.floor(t * 7)) % 3), 1, 1);
        }
        g.fillStyle = Math.sin(t * 6) > 0 ? '#5eead4' : '#1f3b38';
        g.fillRect(Math.round(a.x) + 4, Math.round(a.y) - 12, 2, 2);
      }
      if ((c.state === 'pickup' || c.state === 'installing') && Math.sin(t * 8) > 0) {
        g.fillStyle = roleOf(a).color;
        g.fillRect(Math.round(a.x) + 4, Math.round(a.y) - 13, 2, 1);
      }
    }

    // a work order being worked on (not walked to): a small bar over the head fills up as the job advances
    const WORKING = { inspecting: 1, atSpot: 1, pickup: 1, repairing: 1, installing: 1 };
    function workBar(g, a, t) {
      const c = a.crew, x = Math.round(a.x) - 8, y = Math.round(a.y) - 32;
      const w = Math.round(16 * Math.max(0, Math.min(1, progressOf(a))));
      g.fillStyle = '#07080a'; g.fillRect(x - 1, y - 1, 18, 4);
      g.fillStyle = '#2a313b'; g.fillRect(x, y, 16, 2);
      g.fillStyle = '#5eead4'; if (w) g.fillRect(x, y, w, 2);
      // on a bare spot of floor (installing an AC) there is no scanner sweep: a tool blinking in the hands
      if (c.state === 'atSpot' && Math.sin(t * 9) > 0) { g.fillStyle = roleOf(a).color; g.fillRect(Math.round(a.x) + 4, Math.round(a.y) - 12, 2, 2); }
    }

    // a cup in the hand; at the mouth while sipping (coffee steams, water is clear blue)
    function drawCup(g, a, t) {
      const c = a.crew;
      DL.drawHeld(g, a, c.cup, c.state === 'sipping' && c.sipT < 0, t, c.id);
    }

    // isometric: draw in someone's (or something's) own sprite coordinates, then back to the floor
    function around(g, a, fn) {
      if (!scene.iso) { fn(); return; }
      g.save();
      if (a.crew || a.frame) scene.actorSpace(g, a);
      else scene.spriteSpace(g, a);
      fn();
      g.restore();
    }

    function overlay(g, sc) {
      for (const a of C.members) {
        const c = a.crew;
        if (c.state !== 'inspecting' || !c.job || !c.job.place || !c.job.place.kind) continue;
        // handheld scanner: a blinking dot in the role colour, and a scan line sweeping the equipment front
        const col = roleOf(a).color;
        const e = c.job.place;
        const b = e.bounds || { x: e.px, y: e.py - 16, w: 16, h: 30 };
        g.fillStyle = col;
        if (Math.sin(sc.t * 9) > 0) around(g, a, () => { g.fillStyle = col; g.fillRect(Math.round(a.x) + 4, Math.round(a.y) - 12, 2, 2); });
        const k = (sc.t * 0.9) % 1;
        around(g, e, () => {
          g.fillStyle = col;
          g.globalAlpha = 0.35;
          g.fillRect(b.x + 2, Math.round(b.y + 4 + k * (b.h - 10)), b.w - 4, 1);
          g.globalAlpha = 1;
        });
      }
      for (const a of C.members) around(g, a, () => maintenanceFx(g, a, sc.t));
      for (const a of C.members) if (a.crew.job && a.crew.job.order && WORKING[a.crew.state] && !a.hidden && C.mode !== 'build') around(g, a, () => workBar(g, a, sc.t));
      for (const a of C.members) if (a.crew.cup && !a.hidden) around(g, a, () => drawCup(g, a, sc.t));
      for (const a of C.leaving) around(g, a, () => tears(g, a, sc.t));
      if (C.mode !== 'crew') return;
      const s = C.hover;
      if (s) {
        const u = userOf(s);
        const ok = !u || u === C.sel;
        const al = 0.55 + 0.3 * Math.sin(sc.t * 5);
        const col = ok ? 'rgba(126,224,161,' + al.toFixed(3) + ')' : 'rgba(255,122,23,' + al.toFixed(3) + ')';
        if (scene.iso) scene.markItem(g, s.focus, col);
        else brackets(g, s.focus.bounds, col);
      }
    }

    /* ---------- input ---------- */
    // isometric: people and stations are picked by what is drawn under the cursor
    const isoPick = (sx, sy, w) => {
      if (!scene.iso) return { actor: pickActor(w.x, w.y), station: () => pickStation(w.x, w.y) };
      const actor = scene.pickAt(sx, sy, (o) => C.members.indexOf(o) >= 0 && !o.hidden);
      return {
        actor,
        station: () => {
          const e = scene.pickAt(sx, sy, (o) => o.kind === 'desk' || o.kind === 'chair' || o.kind === 'monitor' || o.kind === 'laptop' || o.kind === 'table');
          return e ? stationOf(e) : null;
        },
      };
    };

    function pointerMove(sx, sy) {
      const w = scene.screenToWorld(sx, sy);
      if (C.pan) {
        const d = scene.screenDelta(sx - C.pan.sx, sy - C.pan.sy);
        scene.cam.x = C.pan.cx - d.x;
        scene.cam.y = C.pan.cy - d.y;
        return;
      }
      if (C.down && Math.hypot(sx - C.down.sx, sy - C.down.sy) > 4 && C.mode === 'crew') {
        C.pan = { sx: C.down.sx, sy: C.down.sy, cx: C.down.cx, cy: C.down.cy };
        C.down = null;
        return;
      }
      const hit = isoPick(sx, sy, w);
      if (C.mode !== 'crew') { C.hover = null; game.setCursor(hit.actor ? 'pointer' : ''); return; }
      const actor = hit.actor;
      C.hover = actor ? null : hit.station();
      game.setCursor(actor || C.hover ? 'pointer' : '');
    }

    // sending someone to a clicked computer = their role's computer task there
    function sendToStation(a, s) {
      const def = tasksOf(a).find((d) => d.kind === 'pc');
      if (!def) { game.toast('info', a.crew.name, 'A função ' + roleOf(a).name + ' não trabalha no computador'); return; }
      const why = startJob(a, def, { auto: false, station: s });
      if (why) game.toast('warn', 'Não deu', a.crew.name + ': ' + why);
    }

    // returns true when the click hit something the crew cares about
    function pointerDown(sx, sy, button) {
      const w = scene.screenToWorld(sx, sy);
      if (button === 2) { if (C.sel) { select(null); return true; } return false; }
      const hit = isoPick(sx, sy, w);
      const a = hit.actor;
      if (a) { select(a); return true; }
      if (C.mode === 'crew') {
        const s = hit.station();
        if (s && C.sel) {
          const u = userOf(s);
          if (u === C.sel) return true;
          if (u) { game.toast('warn', 'Ocupado', s.label + ' já está com ' + u.crew.name); return true; }
          if (brokenSt(s)) { game.toast('warn', 'Estação quebrada', stationName(s) + ' está em manutenção'); return true; }
          if (playerOn(s)) { game.toast('warn', 'Ocupado', 'Você está usando ' + stationName(s)); return true; }
          if (reservedFor(s, C.sel)) { game.toast('warn', 'Estação reservada', stationName(s) + ' é de ' + ownerOf(s).crew.name + ' · mude no cartão (Estação)'); return true; }
          sendToStation(C.sel, s);
          return true;
        }
        if (s && !C.sel) {
          const u = userOf(s);
          if (u) select(u);
          else game.toast('info', 'Estação livre', 'Selecione alguém da equipe e clique aqui');
          return true;
        }
        C.down = { sx, sy, cx: scene.cam.x, cy: scene.cam.y };
      }
      if (C.sel) { select(null); return true; }
      return false;
    }

    function pointerUp() {
      C.down = null;
      C.pan = null;
    }

    function key(ev) {
      if (CR.open) {
        if (ev.code === 'Escape') { closeCreator(); return true; }
        if (ev.code === 'Enter' && !(document.activeElement && document.activeElement.tagName === 'BUTTON')) { ev.preventDefault(); saveCreator(); return true; }
        return true;
      }
      if (ev.code === 'KeyN' && C.mode !== 'build') { openCreator(null); return true; }
      if (ev.code === 'KeyP' && !ev.repeat) { openCreator('player'); return true; }
      if (ev.code === 'KeyK' && !ev.repeat && C.mode !== 'build') { chat.toggle(); return true; }
      if (ev.code === 'Escape' && C.sel) {
        if (C.sel.crew.menu) { C.sel.crew.menu = false; renderCard(true); return true; }
        select(null);
        return true;
      }
      return false;
    }

    function setMode(m) {
      C.mode = m;
      el.panel.hidden = m !== 'crew';
      if (m === 'build') select(null);
      C.hover = null;
      C.down = null;
      C.pan = null;
      renderCard(true);
      renderList();
    }

    function inspect(a) { select(a); }

    // a preset's team starts the shift together
    function startShift() {
      const m = C.members;
      if (!m.length) return;
      const lead = m.find((a) => a.crew.profile.role === 'gerente') || m[0];
      chat.post(lead, 'Bom dia, time! Turno começando. ' + playerName() + ' está no comando hoje.');
      const w = m.find((a) => a !== lead);
      if (w) chat.later(2, () => { if (alive(w)) chat.post(w, pick(['Bom dia! Já vou dar uma olhada nos racks.', 'Bom dia! Café e depois monitoramento.'])); });
      chat.ambientUsed(14);
    }

    renderList();

    return {
      get members() { return C.members; },
      get leaving() { return C.leaving; },
      get assignedCount() { return C.assigned; },
      get createdCount() { return C.created; },
      get selected() { return C.sel; },
      get creatorOpen() { return CR.open; },
      get menuOpen() { return !!(C.sel && C.sel.crew.menu); },
      get playerProfile() { return PL.profile; },
      // change (and save) the player's look — the inventory equips clothes through this
      updatePlayer(patch) { Object.assign(PL.profile, patch); applyPlayer(true); },
      // loading a save: the current team leaves at once (no goodbye scene, no toasts)
      clearAll() {
        for (const a of C.members.concat(C.leaving)) {
          if (DL.Interact) DL.Interact.release(a);
          if (a.crew.station) release(a);
        }
        const gone = new Set(C.members.concat(C.leaving));
        C.members = [];
        C.leaving = [];
        scene.actors = scene.actors.filter((m) => !gone.has(m));
        select(null);
        scene.refreshWorld(false);
        renderList();
      },
      chat,
      update, updateUi, underlay, overlay, pointerMove, pointerDown, pointerUp, key, setMode, select, inspect, pickActor,
      openCreator, closeCreator, statusOf, stations, stationOf, userOf, startShift,
      api: {
        hire, fire, startJob, cancelJob, standUp, randomProfile, saveCreator, nav, decide, tasksOf, optionsFor, reception, fixDefFor,
        // organisation (own station + sector) and helpers for staff.js
        setHome, setZone, autoPlace, ownerOf, homeStation, stationName, roomAtPoint, inZone, zoneRoom, busyWith, standAt, brokenSt, stationFree, progressOf,
        // shifts (shifts.js), workplace needs, in-person attendance, conversations
        sendHome, bringBack, setAttend, needsOf, isFrontline, playThread, urgentFor,
        renderAll() { renderList(); renderCard(true); },
        // open the hiring card with a role already chosen (Cargos → Contratar)
        hireAs(role) { openCreator(); if (CR.open && ROLES[role]) { CR.profile.role = role; syncForm(); } },
      },
    };
  };
})();
