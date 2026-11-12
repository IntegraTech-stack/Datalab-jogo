/* DataLab — game entry: title screen (DATALAB + INICIAR) and the main menu (Novo Jogo, Carregar,
   Online, Loja, Marketplace, Tabela Global, Amigos, Salas da Semana). Sits on top of the demo that
   demo.js already built: the live scene runs behind it as the backdrop, and "Novo Jogo" hands over
   to the existing start card (#intro → preset → tutorial). Jogar On-Line is lobby.js (rooms on the local
   network); the other online features (ranking, friends, marketplace) still use local mocks. */
(function () {
  'use strict';
  const DL = window.DL, D = window.DataLabDemo;
  if (!D || DL.HERO) return;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const fmt = (n) => Math.round(n).toLocaleString('pt-BR');
  const store = {
    get(k, def) { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? def : v; } catch (e) { return def; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* private mode */ } },
  };

  const game = $('game'), root = $('title'), stage = $('titleStage');
  const view = $('menuView'), viewBody = $('menuViewBody');
  const BACKDROP = 'dcm';
  const M = { screen: 'title', sub: null };

  // Saves live in the player's account (services/save-service.js → Edge Function "game").

  /* ---------------- player identity (from the character editor) ---------------- */
  const playerProfile = () => D.crew.playerProfile || store.get('datalab.player.v1', null);
  const playerName = () => (playerProfile() && playerProfile().name) || 'Você';
  const sheetOf = (profile) => DL.makeSheet(profile ? DL.crewLook(profile) : DL.LOOKS.player);
  function drawFace(cv, sheet) {
    const k = 2;
    cv.width = cv.height = 16 * k;
    const g = cv.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(sheet.down.idle, 3, 1, 16, 16, 0, 0, 16 * k, 16 * k);
  }
  function friendCode() {
    let c = store.get('datalab.friendcode.v1', null);
    if (!c) {
      const A = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      c = 'DL-' + Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join('') + '-' + Array.from({ length: 4 }, () => A[Math.floor(Math.random() * A.length)]).join('');
      store.set('datalab.friendcode.v1', c);
    }
    return c;
  }

  /* ---------------- mocks (stand-ins until the online services exist) ---------------- */
  // Stats are seeded so the tables stay stable; looks come from the crew's own character generator.
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const randomLook = () => D.crew.api.randomProfile();
  const HANDLES = ['nullroute', 'k8s_karen', 'pingdom', 'raidzero', 'byteBia', 'sudo_su', 'latencia0', 'rackstar', 'mtu9000', 'bgp_ana', 'cron_job', 'tux_lucas', 'packetloss', 'hotaisle'];
  const COUNTRIES = ['BR', 'PT', 'BR', 'AR', 'BR', 'MX', 'BR', 'CL', 'BR', 'US', 'BR', 'ES', 'BR', 'BR'];
  const PLAYERS = HANDLES.map((h, i) => {
    const p = randomLook();
    p.name = h;
    const lvl = 48 - i * 3 - Math.floor(rnd() * 3);
    return {
      name: h, profile: p, country: COUNTRIES[i], level: lvl,
      dcs: Math.round(lvl * 1.6 + rnd() * 6), uptime: 99.99 - i * 0.07 - rnd() * 0.05,
      incidents: Math.round(900 - i * 52 - rnd() * 30), score: Math.round(98400 - i * 5600 - rnd() * 2400),
      weekly: Math.round(5200 - i * 260 + (rnd() - 0.5) * 1600), trend: Math.round((rnd() - 0.4) * 6),
    };
  });
  const FRIENDS = [
    { who: 1, status: 'online', doing: 'No NOC · resolvendo incidente' },
    { who: 4, status: 'game', doing: 'Construindo · Datacenter médio' },
    { who: 7, status: 'online', doing: 'No menu principal' },
    { who: 10, status: 'away', doing: 'Ausente há 12 min' },
    { who: 12, status: 'offline', doing: 'Visto há 2 dias' },
  ];
  const REQUESTS = [{ who: 9, when: 'há 3 h' }];
  const STATUS = { online: 'Online', game: 'Em jogo', away: 'Ausente', offline: 'Offline' };

  const WEEKLY = [
    { title: 'Torre Aurora', by: 5, base: 'dcm', theme: 'servers', likes: 2841, visits: '18,2 mil', tag: 'Destaque da semana', blurb: 'Três fileiras com corredor frio confinado e cabeamento impecável.' },
    { title: 'NOC Meia-Noite', by: 2, base: 'noc', theme: 'noc', likes: 1975, visits: '11,4 mil', tag: 'Melhor NOC', blurb: 'Oito estações viradas para o painel, luz baixa e café sempre perto.' },
    { title: 'Neon Vault', by: 8, base: 'dcs', theme: 'gamer', likes: 1620, visits: '9,8 mil', tag: 'Mais criativo', blurb: 'RGB nas bordas, racks em U e um fliperama escondido na entrada.' },
    { title: 'Startup no Térreo', by: 3, base: 'office', theme: 'corporate', likes: 1288, visits: '7,1 mil', tag: 'Pequeno e eficiente', blurb: 'Escritório, recepção e um único rack que segura a empresa inteira.' },
    { title: 'Bunker Industrial', by: 11, base: 'dcs', theme: 'industrial', likes: 964, visits: '5,3 mil', tag: 'Escolha da equipe', blurb: 'Concreto, tubos de LED e refrigeração de precisão em linha.' },
    { title: 'Campus Verde', by: 0, base: 'dcm', theme: 'minimal', likes: 812, visits: '4,6 mil', tag: 'Eficiência energética', blurb: 'PUE de 1,18 com plantas por todo o NOC e salão silencioso.' },
  ];

  // the week runs Monday 00:00 → Monday 00:00 (local time)
  function weekNo() {
    const d = new Date(), t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    t.setUTCDate(t.getUTCDate() + 4 - (t.getUTCDay() || 7));
    return Math.ceil(((t - Date.UTC(t.getUTCFullYear(), 0, 1)) / 864e5 + 1) / 7);
  }
  function timeLeft() {
    const now = new Date(), end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + ((8 - now.getDay()) % 7 || 7));
    const h = Math.max(0, Math.floor((end - now) / 36e5));
    return 'termina em ' + Math.floor(h / 24) + 'd ' + (h % 24) + 'h';
  }

  const MARKET = [
    { name: 'Layout “Corredor Frio”', kind: 'Layout de sala', seller: 6, price: 340, art: 'servers' },
    { name: 'Kit Recepção Moderna', kind: 'Móveis', seller: 2, price: 120, art: 'corporate' },
    { name: 'Tema Synthwave', kind: 'Tema de sala', seller: 8, price: 210, art: 'gamer' },
    { name: 'NOC Compacto 6 PCs', kind: 'Layout de sala', seller: 1, price: 280, art: 'noc' },
    { name: 'Pôster “Ping 1 ms”', kind: 'Decoração', seller: 13, price: 45, art: 'industrial' },
    { name: 'Rack Cabeado 42U', kind: 'Equipamento', seller: 4, price: 160, art: 'minimal' },
  ];

  /* ---------------- room thumbnails drawn from the preset layouts ---------------- */
  const THEME = {
    servers: { floor: '#1a2029', accent: '#a0c3ec' }, noc: { floor: '#141c2b', accent: '#7ee0a1' },
    gamer: { floor: '#1b1330', accent: '#c084fc' }, corporate: { floor: '#262220', accent: '#ffc285' },
    industrial: { floor: '#202224', accent: '#ff7a17' }, minimal: { floor: '#1d2120', accent: '#7ee0a1' },
  };
  const ITEM_COL = { rack: '#2b313b', desk: '#6b5a48', crac: '#a0c3ec', storage: '#c4b5fd', plant: '#7ee0a1', sofa: '#5a6170', table: '#6b5a48', whiteboard: '#e9e9e6' };
  function drawRoom(cv, presetId, theme, t) {
    const p = DL.PRESETS[presetId], def = p && p.def;
    const w = cv.clientWidth || 320, h = cv.clientHeight || 180, dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = w * dpr;
    cv.height = h * dpr;
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const th = THEME[theme] || THEME.servers;
    g.fillStyle = '#08090b';
    g.fillRect(0, 0, w, h);
    // blueprint grid
    g.strokeStyle = 'rgba(255,255,255,0.04)';
    for (let x = 0; x < w; x += 12) { g.beginPath(); g.moveTo(x + 0.5, 0); g.lineTo(x + 0.5, h); g.stroke(); }
    for (let y = 0; y < h; y += 12) { g.beginPath(); g.moveTo(0, y + 0.5); g.lineTo(w, y + 0.5); g.stroke(); }
    if (!def) return;
    const minX = Math.min(...def.rooms.map((r) => r.x)), minY = Math.min(...def.rooms.map((r) => r.y));
    const maxX = Math.max(...def.rooms.map((r) => r.x + r.w)), maxY = Math.max(...def.rooms.map((r) => r.y + r.h));
    const s = Math.min((w - 28) / (maxX - minX), (h - 28) / (maxY - minY));
    const ox = (w - (maxX - minX) * s) / 2 - minX * s, oy = (h - (maxY - minY) * s) / 2 - minY * s;
    for (const r of def.rooms) {
      g.fillStyle = r.floor === 'carpet' ? '#1e1c22' : th.floor;
      g.fillRect(ox + r.x * s, oy + r.y * s, r.w * s, r.h * s);
      g.strokeStyle = 'rgba(255,255,255,0.28)';
      g.lineWidth = 1.5;
      g.strokeRect(ox + r.x * s + 0.5, oy + r.y * s + 0.5, r.w * s - 1, r.h * s - 1);
    }
    for (const [kind, tx, ty] of p.items || []) {
      const c = ITEM_COL[kind];
      if (!c) continue;
      g.fillStyle = c;
      const pad = kind === 'rack' ? 0.12 : 0.22;
      g.fillRect(ox + (tx + pad) * s, oy + (ty + pad) * s, s * (1 - pad * 2), s * (1 - pad * 2));
      if (kind === 'rack') {
        const on = Math.sin((t || 0) * 3 + tx * 1.7 + ty) > -0.2;
        g.fillStyle = on ? th.accent : 'rgba(255,255,255,0.15)';
        g.fillRect(ox + (tx + 0.3) * s, oy + (ty + 0.45) * s, Math.max(1, s * 0.4), Math.max(1, s * 0.12));
      }
    }
    // soft accent light along the room edges (the theme's RGB)
    const grd = g.createLinearGradient(0, 0, w, h);
    grd.addColorStop(0, th.accent + '22');
    grd.addColorStop(1, 'transparent');
    g.fillStyle = grd;
    g.fillRect(0, 0, w, h);
  }

  /* ------------------------------------------------------------------ */
  /* Screens                                                            */
  /* ------------------------------------------------------------------ */
  const wallet = () => D.economy.wallet;
  const balanceHtml = () =>
    '<span class="mm-bal"><span class="cur cur--cr" aria-hidden="true">◆</span><b>' + fmt(wallet().credits) + '</b><span class="eyebrow-sm">créditos</span></span>' +
    '<span class="mm-bal"><span class="cur cur--dc" aria-hidden="true">⬢</span><b>' + fmt(wallet().gold || 0) + '</b><span class="eyebrow-sm">Gold</span></span>';
  const head = (eyebrow, title, extra) =>
    '<header class="mv__head"><button class="mv__back" type="button" data-go="menu" aria-label="Voltar ao menu"><span aria-hidden="true">←</span> Menu</button>' +
    '<div class="mv__titles"><p class="eyebrow-sm">' + eyebrow + '</p><h2 class="mv__title" id="menuViewTitle">' + title + '</h2></div>' + (extra || '') + '</header>';
  const soon = (text) => '<p class="mv__soon"><span class="dot dot--info" style="background:var(--breeze)"></span>' + text + '</p>';

  const SCREENS = {
    // the account's cloud saves (filled by hydrateSaves: they come from the server)
    load() {
      return head('Seus datacenters · salvos na sua conta', 'Carregar jogo') + '<div data-cloud-saves><p class="mv-note">Carregando seus saves…</p></div>';
    },
    online() {
      // lobby.js: rooms on the local network (create / join)
      if (DL.Lobby) return DL.Lobby.html(head);
      return head('Multijogador', 'Jogar online') +
        '<div class="mv-online"><div class="mv-online__orb" aria-hidden="true"><i></i><i></i><i></i><span></span></div>' +
        '<p class="eyebrow-sm"><span class="dot dot--warn dot--live"></span>&nbsp; Em breve — estamos desenvolvendo</p>' +
        '<h3 class="mv-online__title">O modo online está em desenvolvimento.</h3>' +
        '<p class="mv-online__text">Datacenters compartilhados, plantões em equipe e incidentes resolvidos juntos em tempo real. Enquanto isso, monte o seu e treine a equipe no modo solo.</p>' +
        '<ul class="mv-online__list"><li><b>Co-op</b>Opere o mesmo datacenter com amigos</li><li><b>Visitas</b>Entre nos datacenters da comunidade</li><li><b>Desafios</b>Incidentes semanais com ranking</li></ul>' +
        '<div class="mv-empty__actions"><button class="btn btn--primary" type="button" data-act="new">Jogar solo <span class="arrow">→</span></button><button class="btn" type="button" data-go="menu">Voltar</button></div></div>';
    },

    // community ideas (likes) and bug reports (feedback.js); it mounts itself and talks to the server
    feedback() {
      if (DL.Feedback) return DL.Feedback.html(head);
      return head('Comunidade', 'Ideias e bugs') + '<div class="mv-empty"><p>Indisponível nesta página.</p></div>';
    },

    // the game's real shop and inventory (inventory.js), mounted here; purchases persist
    shop() {
      return head('Skins, roupas, eventos e bots lendários · em Gold', 'Loja') + '<p class="mv-note">Simulação de pagamento — nenhuma cobrança real. Os itens vão para o seu inventário e já valem no jogo.</p><div class="st st--menu" data-store-mount="shop"></div>';
    },
    inventory() {
      return head('Seus itens · equipar, vender, raridades', 'Inventário') + '<div class="st st--menu" data-store-mount="inv"></div>';
    },

    market() {
      let h = head('Comunidade', 'Marketplace', '<span class="tag mv__badge">Em breve</span>');
      h += '<div class="mv-banner"><div><p class="eyebrow-sm">Negocie com outros jogadores</p><b>Compre e venda layouts, temas e decorações criados pela comunidade.</b>' +
        '<p>O marketplace chega junto com o modo online. Esta é uma prévia de como vai funcionar.</p></div>' +
        '<div class="mv-search"><input class="input" type="search" placeholder="Buscar layouts, temas, móveis…" aria-label="Buscar no marketplace" disabled></div></div>';
      h += '<div class="mv-grid mv-grid--market">' + MARKET.map((m) => {
        const s = PLAYERS[m.seller];
        return '<article class="mv-item is-locked"><div class="mv-item__art" style="background:linear-gradient(135deg,#0b0c0e,' + THEME[m.art].floor + ' 50%,' + THEME[m.art].accent + '66)"><span class="eyebrow-sm">' + m.kind + '</span></div>' +
          '<div class="mv-item__body"><b>' + m.name + '</b><p>por @' + s.name + '</p></div>' +
          '<div class="mv-item__foot"><span class="mv-price"><span class="cur cur--dc">⬢</span>' + m.price + '</span><button class="btn btn--sm" type="button" data-act="soon" data-what="O marketplace">Em breve</button></div></article>';
      }).join('') + '</div>';
      return h;
    },

    ranking() {
      const me = { name: playerName(), me: true, level: 1 + Math.floor((wallet().credits || 0) / 150), dcs: wallet().counters.datacenters || 0, uptime: 99.5, incidents: wallet().counters.incidents || 0, score: Math.round(wallet().credits * 10), weekly: Math.round(wallet().credits * 2), trend: 0 };
      let h = head('Temporada 1 · semana 40', 'Tabela global', '<div class="mv-tabs" role="tablist">' +
        [['score', 'Geral'], ['weekly', 'Semanal'], ['friends', 'Amigos']].map(([k, l], i) => '<button type="button" role="tab" class="mv-tab' + (i === 0 ? ' is-on' : '') + '" data-rank="' + k + '">' + l + '</button>').join('') + '</div>');
      h += '<div class="mv-podium" id="rankPodium"></div><div class="mv-table-wrap"><table class="mv-table"><thead><tr><th>#</th><th>Jogador</th><th class="n">Nível</th><th class="n hide-sm">Datacenters</th><th class="n hide-sm">Uptime</th><th class="n hide-sm">Incidentes</th><th class="n">Pontos</th></tr></thead><tbody id="rankBody"></tbody></table></div>';
      h += soon('Dados simulados — o ranking real chega com o modo online.');
      M.rankMe = me;
      return h;
    },

    friends() {
      const prof = playerProfile();
      let h = head('Social', 'Amigos', '<span class="tag mv__badge">' + FRIENDS.filter((f) => f.status !== 'offline').length + ' online</span>');
      h += '<div class="mv-me"><canvas class="mv-face mv-face--lg" data-face="me"></canvas><div><b>' + esc(playerName()) + '</b><span class="eyebrow-sm">' + (prof && DL.ROLES[prof.role] ? DL.ROLES[prof.role].name : 'Operador(a)') + '</span></div>' +
        '<div class="mv-code"><span class="eyebrow-sm">Seu código</span><b>' + friendCode() + '</b><button class="btn btn--sm" type="button" data-act="copy-code">Copiar</button></div></div>';
      h += '<form class="mv-add" data-form="add-friend"><input class="input" type="text" placeholder="Adicionar por código ou @nome" aria-label="Código ou nome do amigo" maxlength="24"><button class="btn btn--sm" type="submit">Enviar convite</button></form>';
      h += '<span class="eyebrow-sm mv-sub">Pedidos de amizade · ' + REQUESTS.length + '</span><ul class="mv-friends">' + REQUESTS.map((r) => {
        const p = PLAYERS[r.who];
        return '<li class="mv-friend"><canvas class="mv-face" data-face="' + r.who + '"></canvas><div class="mv-friend__who"><b>@' + p.name + '</b><span>Nível ' + p.level + ' · ' + r.when + '</span></div>' +
          '<div class="mv-friend__acts"><button class="btn btn--sm btn--primary" type="button" data-act="soon" data-what="Aceitar amizades">Aceitar</button><button class="btn btn--sm" type="button" data-act="soon" data-what="Recusar amizades">Recusar</button></div></li>';
      }).join('') + '</ul>';
      h += '<span class="eyebrow-sm mv-sub">Amigos · ' + FRIENDS.length + '</span><ul class="mv-friends">' + FRIENDS.map((f) => {
        const p = PLAYERS[f.who];
        return '<li class="mv-friend is-' + f.status + '"><span class="mv-face-wrap"><canvas class="mv-face" data-face="' + f.who + '"></canvas><i class="mv-st" title="' + STATUS[f.status] + '"></i></span>' +
          '<div class="mv-friend__who"><b>@' + p.name + '</b><span>' + STATUS[f.status] + ' · ' + f.doing + '</span></div>' +
          '<div class="mv-friend__acts"><button class="btn btn--sm" type="button" data-act="soon" data-what="Visitar datacenters"' + (f.status === 'offline' ? ' disabled' : '') + '>Visitar</button><button class="btn btn--sm" type="button" data-act="soon" data-what="Convidar para jogar">Convidar</button></div></li>';
      }).join('') + '</ul>';
      h += soon('Amigos fictícios para pré-visualização — convites e visitas chegam com o modo online.');
      return h;
    },

    weekly() {
      let h = head('Inspiração da comunidade', 'Salas da semana', '<span class="tag mv__badge">Semana ' + weekNo() + ' · ' + timeLeft() + '</span>');
      const [top, ...rest] = WEEKLY;
      const card = (r, i, big) => {
        const p = PLAYERS[r.by];
        return '<article class="mv-room' + (big ? ' mv-room--top' : '') + '" style="--d:' + (i * 60) + 'ms"><div class="mv-room__art"><canvas data-room="' + r.base + '" data-theme="' + r.theme + '"></canvas><span class="mv-room__tag">' + r.tag + '</span></div>' +
          '<div class="mv-room__body"><b>' + r.title + '</b><span class="mv-room__by"><canvas class="mv-face mv-face--sm" data-face="' + r.by + '"></canvas>@' + p.name + '</span>' + (big ? '<p>' + r.blurb + '</p>' : '') +
          '<span class="mv-room__stats"><span>♥ ' + fmt(r.likes) + '</span><span>◎ ' + r.visits + ' visitas</span></span></div>' +
          '<div class="mv-room__acts"><button class="btn btn--sm btn--primary" type="button" data-act="visit" data-i="' + i + '">Visitar sala</button>' +
          '<button class="btn btn--sm" type="button" data-act="use-room" data-base="' + r.base + '">Começar com esta base</button></div></article>';
      };
      h += card(top, 0, true) + '<div class="mv-rooms">' + rest.map((r, i) => card(r, i + 1, false)).join('') + '</div>';
      h += soon('Salas de exemplo e visitas simuladas — visitantes, chat e votação reais chegam com o modo online.');
      return h;
    },
  };

  /* ---------------- post-render hydration (canvases, tables) ---------------- */
  function hydrate() {
    viewBody.querySelectorAll('canvas[data-face]').forEach((cv) => {
      const k = cv.dataset.face;
      drawFace(cv, k === 'me' ? sheetOf(playerProfile()) : (PLAYERS[k].sheet = PLAYERS[k].sheet || sheetOf(PLAYERS[k].profile)));
    });
    drawRooms(0);
    if (M.sub === 'ranking') renderRanking('score');
    if (viewBody.querySelector('[data-cloud-saves]')) hydrateSaves();
    const mount = viewBody.querySelector('[data-store-mount]');
    if (mount && D.inventory) {
      const opts = { go: (id) => openSub(id === 'inv' ? 'inventory' : id) };
      if (mount.dataset.storeMount === 'shop') D.inventory.mountShop(mount, opts);
      else D.inventory.mountInventory(mount, opts);
    }
  }
  // the 3 save slots of the account (slots created at signup but never played show as empty)
  async function hydrateSaves() {
    const box = viewBody.querySelector('[data-cloud-saves]');
    if (!box || !DL.SaveService) return;
    const list = await DL.SaveService.listCloud();
    if (!viewBody.contains(box)) return;
    const played = list.filter((s) => s.version > 0);
    let h = '';
    if (list.error) {
      h += '<div class="mv-empty"><b>Não foi possível carregar seus saves</b><p>' + esc(list.error) + '</p>' +
        '<div class="mv-empty__actions"><button class="btn" type="button" data-act="retry-saves">Tentar de novo</button></div></div>';
    } else if (!played.length) {
      h += '<div class="mv-empty"><div class="mv-empty__art" aria-hidden="true"><i></i><i></i><i></i></div>' +
        '<b>Nenhum jogo salvo ainda</b><p>Seu primeiro datacenter é salvo na sua conta automaticamente: comece um Novo jogo.</p>' +
        '<div class="mv-empty__actions"><button class="btn btn--primary" type="button" data-act="new">Começar um novo jogo <span class="arrow">→</span></button></div></div>';
    } else {
      h += '<ul class="mv-saves">' + played.map((s) => {
        const st = s.stats || {}, d = new Date(s.updated_at);
        return '<li class="mv-save"><canvas class="mv-save__map" data-room="zero" data-theme="servers"></canvas>' +
          '<div class="mv-save__info"><b>' + esc(s.name || 'Meu datacenter') + '</b><span class="eyebrow-sm">Espaço ' + s.slot + ' · ' + d.toLocaleDateString('pt-BR') + ' · ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) + '</span>' +
          '<span class="mv-save__stats">' + (st.rooms || 0) + ' salas · ' + (st.racks || 0) + ' racks · ' + (st.servers || 0) + ' servidores · ' + (st.crew || 0) + ' pessoas · $' + fmt(st.cash || 0) + '</span></div>' +
          '<div class="mv-save__acts"><button class="btn btn--sm btn--primary" type="button" data-act="load" data-id="' + s.slot + '">Continuar</button>' +
          '<button class="btn btn--sm" type="button" data-act="del-save" data-id="' + s.slot + '">Excluir</button></div></li>';
      }).join('') + '</ul>';
    }
    box.innerHTML = h;
    drawRooms(0);
  }

  function drawRooms(t) {
    viewBody.querySelectorAll('canvas[data-room]').forEach((cv) => drawRoom(cv, cv.dataset.room, cv.dataset.theme, t));
  }

  function renderRanking(kind) {
    const list = kind === 'friends' ? FRIENDS.map((f) => PLAYERS[f.who]).concat([M.rankMe]) : PLAYERS.concat([M.rankMe]);
    const key = kind === 'weekly' ? 'weekly' : 'score';
    const rows = list.slice().sort((a, b) => b[key] - a[key]);
    const podium = rows.slice(0, 3);
    $('rankPodium').innerHTML = [1, 0, 2].map((i) => {
      const p = podium[i];
      if (!p) return '';
      return '<div class="mv-pod mv-pod--' + (i + 1) + '"><canvas class="mv-face mv-face--lg" data-rf="' + (p.me ? 'me' : PLAYERS.indexOf(p)) + '"></canvas><b>' + esc(p.me ? p.name : '@' + p.name) + '</b>' +
        '<span class="mv-pod__pts">' + fmt(p[key]) + ' pts</span><span class="mv-pod__step">' + (i + 1) + '</span></div>';
    }).join('');
    $('rankBody').innerHTML = rows.map((p, i) =>
      '<tr class="' + (p.me ? 'is-me' : '') + '" style="--d:' + Math.min(i, 14) * 30 + 'ms"><td class="rk">' + (i + 1) + '</td><td><span class="mv-player"><canvas class="mv-face mv-face--sm" data-rf="' + (p.me ? 'me' : PLAYERS.indexOf(p)) + '"></canvas>' +
      '<b>' + esc(p.me ? p.name + ' (você)' : '@' + p.name) + '</b>' + (p.country ? '<span class="mv-cc">' + p.country + '</span>' : '') + '</span></td>' +
      '<td class="n">' + p.level + '</td><td class="n hide-sm">' + p.dcs + '</td><td class="n hide-sm">' + p.uptime.toFixed(2).replace('.', ',') + '%</td><td class="n hide-sm">' + fmt(p.incidents) + '</td>' +
      '<td class="n"><b>' + fmt(p[key]) + '</b>' + (p.trend ? '<span class="mv-trend ' + (p.trend > 0 ? 'up' : 'down') + '">' + (p.trend > 0 ? '▲' : '▼') + Math.abs(p.trend) + '</span>' : '') + '</td></tr>'
    ).join('');
    viewBody.querySelectorAll('canvas[data-rf]').forEach((cv) => {
      const k = cv.dataset.rf;
      drawFace(cv, k === 'me' ? sheetOf(playerProfile()) : (PLAYERS[k].sheet = PLAYERS[k].sheet || sheetOf(PLAYERS[k].profile)));
    });
  }

  /* ------------------------------------------------------------------ */
  /* Navigation                                                         */
  /* ------------------------------------------------------------------ */
  function setScreen(s) {
    M.screen = s;
    root.dataset.screen = s;
    if (s === 'title') setTimeout(() => $('titleStart').focus({ preventScroll: true }), 50);
    if (s === 'menu') {
      closeSub(true);
      refreshMenuMeta();
      setTimeout(() => { const b = root.querySelector('.mm-item[data-go="' + (M.last || 'new') + '"]') || root.querySelector('.mm-item'); if (b) b.focus({ preventScroll: true }); }, 60);
      if (pendingFlash) { flash(pendingFlash, 'warn'); pendingFlash = ''; }
    }
  }

  function openSub(id) {
    if (!SCREENS[id]) return;
    M.sub = id;
    M.last = id;
    root.querySelectorAll('.mm-item').forEach((b) => b.classList.toggle('is-on', b.dataset.go === id));
    viewBody.innerHTML = SCREENS[id]();
    viewBody.scrollTop = 0;
    view.hidden = false;
    view.classList.remove('is-in');
    void view.offsetWidth; // restart the entry animation
    view.classList.add('is-in');
    root.classList.add('has-sub');
    hydrate();
    const back = viewBody.querySelector('.mv__back');
    if (back) back.focus({ preventScroll: true });
  }

  function closeSub(silent) {
    if (!M.sub) return;
    const was = M.sub;
    M.sub = null;
    root.classList.remove('has-sub');
    view.classList.remove('is-in');
    view.hidden = true;
    viewBody.innerHTML = '';
    root.querySelectorAll('.mm-item').forEach((b) => b.classList.remove('is-on'));
    if (!silent) { const b = root.querySelector('.mm-item[data-go="' + was + '"]'); if (b) b.focus({ preventScroll: true }); }
  }

  function refreshMenuMeta() {
    $('mmName').textContent = playerName();
    $('mmTitle').innerHTML = M.account && DL.Auth.myTitles.length ? DL.titleBadge(DL.Auth.myTitles[0]) : '';
    const prof = playerProfile();
    $('mmRole').textContent = (M.account ? '@' + M.account.username + ' · ' : '') + (prof && DL.ROLES[prof.role] ? DL.ROLES[prof.role].name : 'Operador(a)');
    if (M.account && $('titleUser')) $('titleUser').textContent = 'Conectado como @' + M.account.username;
    drawFace($('mmFace'), sheetOf(playerProfile()));
    $('mmBal').innerHTML = balanceHtml();
    $('mmWeeklyName').textContent = WEEKLY[0].title;
    $('mmWeeklyTime').textContent = 'T' + timeLeft().slice(1);
    if (DL.SaveService && DL.Cloud && DL.Cloud.signedIn) DL.SaveService.listCloud().then((list) => {
      const n = list.filter((x) => x.version > 0).length;
      $('mmSaves').textContent = list.error ? 'Saves indisponíveis no momento' : n ?n + (n === 1 ? ' jogo salvo na conta' : ' jogos salvos na conta') : 'Nenhum jogo salvo ainda';
    });
  }

  // Leave the menu and hand over to the existing start card (tutorial). Every new game starts from scratch.
  function newGame() {
    closeSub(true);
    root.classList.add('is-leaving');
    setTimeout(() => {
      root.hidden = true;
      root.classList.remove('is-leaving');
      game.classList.remove('is-title');
      D.scene.o.attract = false;
      D.choosePreset('zero');
      $('intro').classList.add('is-open');
      $('tutStart').focus({ preventScroll: true });
    }, 520);
  }

  // Back from the start card to the main menu (before the game has begun).
  function backToMenu() {
    if (D.state.phase !== 'intro') return;
    $('intro').classList.remove('is-open');
    showBackdrop();
    root.hidden = false;
    setScreen('menu');
  }

  function showBackdrop() {
    game.classList.add('is-title');
    D.choosePreset(BACKDROP);
    D.scene.o.attract = true;
  }

  // Continue a cloud save: leave the menu, the game restores the world from the server (cloud-sync.js)
  async function loadSave(slot) {
    closeSub(true);
    root.hidden = true;
    game.classList.remove('is-title');
    D.scene.o.attract = false;
    const r = await DL.CloudSync.load(+slot);
    if (r.ok) return;
    const msg = r.message || 'Não foi possível carregar.';
    // the load already started an empty game to restore into, and a started game can't go back to the
    // start card (Novo jogo would be stuck there): reload, as leaving a game does, and say why on the menu
    if (D.state.phase === 'play') {
      try { sessionStorage.setItem(FLASH_KEY, msg); } catch (e) { /* storage blocked: reload anyway */ }
      location.replace(location.pathname);
      return;
    }
    game.classList.add('is-title'); root.hidden = false; setScreen('menu'); flash(msg, 'warn');
  }
  async function deleteSave(btn) {
    if (btn.dataset.confirm !== '1') { btn.dataset.confirm = '1'; btn.textContent = 'Confirmar exclusão'; return; }
    btn.disabled = true;
    const r = await DL.SaveService.remove(+btn.dataset.id);
    flash(r.ok ? 'Save excluído.' : r.message, r.ok ? 'ok' : 'warn');
    refreshMenuMeta();
    openSub('load');
  }
  function soonToast(what) {
    flash((what || 'Este recurso') + ' chega com o modo online — estamos desenvolvendo.');
  }
  // a message carried over a reload (a failed Continuar, see loadSave): shown once the menu is up
  const FLASH_KEY = 'datalab.menuFlash';
  let pendingFlash = '';
  try { pendingFlash = sessionStorage.getItem(FLASH_KEY) || ''; sessionStorage.removeItem(FLASH_KEY); } catch (e) { /* storage blocked */ }
  let flashT = 0;
  function flash(text, tone) {
    const el = $('menuFlash');
    el.textContent = text;
    el.className = 'mm-flash is-on' + (tone ? ' mm-flash--' + tone : '');
    clearTimeout(flashT);
    flashT = setTimeout(() => el.classList.remove('is-on'), 2800);
  }

  /* ---------------- actions ---------------- */
  root.addEventListener('click', (ev) => {
    const vis = ev.target.closest('[data-act="visit"]');
    if (vis) return visitRoom(+vis.dataset.i);
    const go = ev.target.closest('[data-go]');
    if (go) {
      const id = go.dataset.go;
      if (go.hasAttribute('disabled') || go.getAttribute('aria-disabled') === 'true') {
        if (id === 'online') { ev.preventDefault(); return; }
      }
      if (id === 'menu') return closeSub();
      if (id === 'download') { window.open('baixar.html', '_blank', 'noopener'); return; }   // baixar.html: desktop installers
      if (id === 'new') return newGame('zero');
      if (id === 'account') return DL.AccountUI && DL.AccountUI.open();
      if (id === 'online' && !DL.Lobby) return; // no multiplayer on this page
      return openSub(id);
    }
    if (DL.Lobby && DL.Lobby.click(ev)) return;
    const tab = ev.target.closest('[data-rank]');
    if (tab) {
      tab.parentElement.querySelectorAll('.mv-tab').forEach((t) => t.classList.toggle('is-on', t === tab));
      renderRanking(tab.dataset.rank);
      return;
    }
    const a = ev.target.closest('[data-act]');
    if (!a) return;
    switch (a.dataset.act) {
      case 'new': return newGame('zero');
      case 'use-room': return newGame(a.dataset.base);
      case 'load': return loadSave(a.dataset.id);
      case 'del-save': return deleteSave(a);
      case 'retry-saves': return openSub('load');
      case 'soon': return soonToast(a.dataset.what);
      case 'copy-code': {
        const c = friendCode();
        if (navigator.clipboard) navigator.clipboard.writeText(c).catch(() => {});
        return flash('Código ' + c + ' copiado.', 'ok');
      }
    }
  });
  // balances in the menu footer follow every purchase / sale / exchange
  D.game.on('wallet', () => { if (!root.hidden) $('mmBal').innerHTML = balanceHtml(); });
  root.addEventListener('submit', (ev) => {
    ev.preventDefault();
    if (DL.Lobby && DL.Lobby.submit(ev)) return;
    const inp = ev.target.querySelector('input');
    const v = inp && inp.value.trim();
    flash(v ? 'Convite para ' + v + ' guardado — será enviado quando o modo online chegar.' : 'Digite um código (DL-XXXX-XXXX) ou @nome.', v ? 'ok' : 'warn');
    if (inp) inp.value = '';
  });

  $('titleStart').addEventListener('click', () => setScreen('menu'));
  stage.addEventListener('click', (ev) => { if (M.screen === 'title' && !ev.target.closest('a,button')) setScreen('menu'); });
  const introMenu = $('introMenu');
  if (introMenu) introMenu.addEventListener('click', backToMenu);

  // Keys: the menu owns the keyboard while it is up (runs before demo.js' own handler).
  addEventListener('keydown', (ev) => {
    if (root.hidden) return;
    if (DL.Welcome && DL.Welcome.isOpen) { DL.Welcome.key(ev); return; }
    if (DL.AccountUI && DL.AccountUI.isOpen) { if (ev.code === 'Escape') { DL.AccountUI.close(); ev.preventDefault(); } ev.stopImmediatePropagation(); return; }
    ev.stopImmediatePropagation();
    const typing = document.activeElement && document.activeElement.tagName === 'INPUT';
    if (ev.code === 'Escape') {
      ev.preventDefault();
      if (M.sub) closeSub();
      else if (M.screen === 'menu') setScreen('title');
      return;
    }
    if (typing) return;
    if (M.screen === 'title' && (ev.code === 'Enter' || ev.code === 'Space')) { ev.preventDefault(); setScreen('menu'); return; }
    if (M.screen === 'menu' && !M.sub && (ev.code === 'ArrowDown' || ev.code === 'ArrowUp')) {
      ev.preventDefault();
      const items = Array.from(root.querySelectorAll('.mm-btn:not([disabled])'));
      const weekly = root.querySelector('.mm-weekly');
      const list = weekly ? items.concat([weekly]) : items;
      if (!list.length) return;
      const i = list.indexOf(document.activeElement);
      if (i === -1) { list[0].focus(); return; }
      list[(i + (ev.code === 'ArrowDown' ? 1 : -1) + list.length) % list.length].focus();
      return;
    }
    if (M.screen === 'menu' && !M.sub && ev.code === 'Enter') {
      const el = document.activeElement;
      if (el && el.classList && el.classList.contains('mm-weekly')) {
        ev.preventDefault();
        openSub('weekly');
        return;
      }
    }
  }, true);

  /* ------------------------------------------------------------------ */
  /* Visiting a Sala da semana                                          */
  /* ------------------------------------------------------------------ */
  // The online mode isn't ready: the room is the preset drawn with the room's theme, and the other
  // visitors, their chat and the live counter are simulated locally (mock players from PLAYERS).
  const visitEl = $('visit'), visitUi = $('visitUi'), visitTags = $('visitTags');
  const LIKES_KEY = 'datalab.weeklyLikes.v1';
  const V = { on: false, i: 0, visitors: [], chat: [], t: 0, next: 0, nextMsg: 0, nextCount: 0, count: 0, keys: new Set(), drag: null, liked: store.get(LIKES_KEY, {}) };
  const VISIT_LINES = { calm: ['Só de passagem, conhecendo a sala.'], incident: ['Ih, alarme? Não é comigo, estou só visitando.'], done: ['Bonita a sala, né?'] };
  const CHAT = [
    'que cabeamento limpo 😮', 'esse corredor frio ficou perfeito', 'roubei a ideia do NOC, desculpa kkk', 'quantos racks tem aqui?',
    'a iluminação ficou muito boa', 'merecido o destaque', 'primeira vez aqui, curti demais', 'alguém sabe qual piso é esse?',
    'vou copiar esse layout no meu', 'PUE disso deve ser ótimo', 'o café fica perto do NOC, genial', 'gg, sala top',
    'cadê o nobreak?', 'tá muito organizado, dá até raiva', 'voltei só pra ver de novo', '♥♥♥',
  ];
  const OWNER_CHAT = ['bem-vindos à minha sala!', 'o corredor frio levou semanas pra ficar assim', 'curtam se gostaram 💚', 'qualquer dúvida do layout é só perguntar', 'obrigado pelo destaque, galera'];
  const REPLIES = ['valeu! 👋', 'concordo', 'haha verdade', 'bem-vindo(a)!', 'boa!'];
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const between = (a, b) => a + Math.random() * (b - a);
  const likesOf = (r) => r.likes + (V.liked[r.title] ? 1 : 0);

  function visitRoom(i) {
    const r = WEEKLY[i];
    if (!r) return;
    if (!V.on) {
      closeSub(true);
      root.hidden = true;
      game.classList.add('is-visit');
      visitEl.hidden = false;
    }
    clearVisitors();
    Object.assign(V, { on: true, i, chat: [], t: 0, next: 0.4, nextMsg: between(1.5, 3), nextCount: 4, count: Math.round(r.likes / 120 + between(4, 12)) });
    D.choosePreset(r.base);
    themeRooms(r.theme);
    tour(true);
    addVisitor(r.by, true); // the author is around for the whole visit
    renderVisit();
    say(null, 'Você entrou em ' + r.title + ', de @' + PLAYERS[r.by].name + '. Visitantes e chat são simulados até o modo online chegar.');
  }

  function exitVisit() {
    if (!V.on) return;
    clearVisitors();
    V.on = false;
    V.keys.clear();
    visitEl.hidden = true;
    visitUi.innerHTML = '';
    game.classList.remove('is-visit');
    D.state.freeCam = false;
    showBackdrop();
    root.hidden = false;
    setScreen('menu');
    openSub('weekly');
  }

  // every room without its own theme gets the room's theme
  function themeRooms(theme) {
    const th = DL.ROOM_THEMES && DL.ROOM_THEMES[theme];
    if (!th) return;
    for (const rm of D.scene.world.rooms || []) {
      if (rm.theme) continue;
      rm.theme = theme;
      rm.style = JSON.parse(JSON.stringify(th.style));
      rm.style.fromTheme = theme;
    }
    D.scene.refreshWorld(true);
  }

  // the camera: an automatic tour (the title screen's drift), or free (drag / WASD)
  function tour(on) {
    V.tour = on;
    D.scene.o.attract = on;
    D.state.freeCam = !on;
    const b = visitUi.querySelector('[data-v="tour"]');
    if (b) { b.classList.toggle('is-on', on); b.textContent = on ? 'Câmera: tour' : 'Câmera: livre'; }
  }

  /* ---------- simulated visitors ---------- */
  function addVisitor(who, owner) {
    const sp = D.scene.world.spawn, p = PLAYERS[who];
    const a = new DL.Actor(DL.crewLook(p.profile), sp.x + between(-6, 6), sp.y, 'up');
    Object.assign(a, {
      def: { id: 'visitor-' + who, name: '@' + p.name, wander: true, lines: VISIT_LINES },
      i: 0, wait: between(0.2, 1.2), talkT: 0, lineIdx: 0,
      visit: { who, owner: !!owner, stay: owner ? Infinity : between(25, 70), leaving: 0, sayT: 0, text: '' },
    });
    D.scene.npcs.push(a);
    D.scene.refreshWorld(false);
    V.visitors.push(a);
    if (!owner) say(null, '@' + p.name + ' entrou na sala.');
    return a;
  }

  function removeVisitor(a) {
    const n = D.scene.npcs.indexOf(a);
    if (n >= 0) D.scene.npcs.splice(n, 1);
    V.visitors.splice(V.visitors.indexOf(a), 1);
    if (a.visit.tag) a.visit.tag.remove();
    D.scene.refreshWorld(false);
  }

  function clearVisitors() {
    while (V.visitors.length) removeVisitor(V.visitors[0]);
  }

  // leaving = walk back to the entrance, then vanish
  function leave(a) {
    const sp = D.scene.world.spawn;
    a.visit.leaving = 0.001;
    a.def = Object.assign({}, a.def, { wander: false, path: [{ x: sp.x, y: sp.y }], waits: [60] });
    a.i = 0;
    a.route = null;
    a.wait = 0;
  }

  /* ---------- chat ---------- */
  function say(a, text, me) {
    V.chat.push({ who: me ? 'me' : a ? a.visit.who : null, text });
    if (V.chat.length > 40) V.chat.shift();
    if (a) { a.visit.text = text; a.visit.sayT = 4.5; }
    renderChat();
  }

  function renderChat() {
    const box = visitUi.querySelector('.visit-chat__log');
    if (!box) return;
    box.innerHTML = V.chat.map((m) => m.who == null
      ? '<li class="is-sys">' + esc(m.text) + '</li>'
      : '<li><b' + (m.who === WEEKLY[V.i].by ? ' class="is-owner"' : '') + '>' + (m.who === 'me' ? esc(playerName()) + ' (você)' : '@' + esc(PLAYERS[m.who].name)) + '</b> ' + esc(m.text) + '</li>').join('');
    box.scrollTop = box.scrollHeight;
  }

  /* ---------- the overlay ---------- */
  function renderVisit() {
    const r = WEEKLY[V.i], p = PLAYERS[r.by], W = D.scene.world;
    const racks = W.items.filter((e) => e.kind === 'rack').length;
    const servers = W.items.reduce((n, e) => n + (e.units ? e.units.filter(Boolean).length : 0), 0);
    const liked = !!V.liked[r.title];
    visitUi.innerHTML =
      '<header class="visit-bar">' +
        '<div class="visit-bar__info"><span class="visit-tag">' + esc(r.tag) + '</span><span class="visit-tag visit-tag--sim" title="O modo online está em desenvolvimento: visitantes e chat são de exemplo">Visita simulada · online em breve</span>' +
          '<h2 class="visit-bar__title">' + esc(r.title) + '</h2>' +
          '<span class="visit-bar__by"><canvas class="visit-face" data-vface="' + r.by + '"></canvas>@' + esc(p.name) + '</span>' +
          '<p class="visit-bar__blurb">' + esc(r.blurb) + '</p>' +
          '<span class="visit-bar__stats"><span>♥ <b data-v="likes">' + fmt(likesOf(r)) + '</b></span><span>◎ ' + r.visits + ' visitas</span>' +
          '<span><i class="visit-live"></i><b data-v="count">' + V.count + '</b> agora</span><span>' + W.rooms.length + ' salas · ' + racks + ' racks · ' + servers + ' equipamentos</span></span></div>' +
        '<div class="visit-bar__acts">' +
          '<button class="visit-btn' + (liked ? ' is-on' : '') + '" type="button" data-v="like" aria-pressed="' + liked + '">' + (liked ? '♥ Curtiu' : '♡ Curtir') + '</button>' +
          '<button class="visit-btn is-on" type="button" data-v="tour">Câmera: tour</button>' +
          '<span class="visit-nav"><button class="visit-btn" type="button" data-v="prev" aria-label="Sala anterior">‹</button><span>' + (V.i + 1) + '/' + WEEKLY.length + '</span><button class="visit-btn" type="button" data-v="next" aria-label="Próxima sala">›</button></span>' +
          '<button class="visit-btn visit-btn--exit" type="button" data-v="exit">Sair da visita</button>' +
        '</div>' +
      '</header>' +
      '<aside class="visit-chat" aria-label="Chat da sala"><span class="visit-chat__head">CHAT DA SALA</span><ul class="visit-chat__log" aria-live="polite"></ul>' +
        '<form class="visit-chat__form"><input type="text" maxlength="80" placeholder="Diga algo… (Enter)" aria-label="Mensagem"><button class="visit-btn" type="submit">Enviar</button></form></aside>' +
      '<p class="visit-hint"><span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> ou arraste: olhar</span><span><kbd>←</kbd><kbd>→</kbd> trocar sala</span><span><kbd>Esc</kbd> sair</span></p>';
    const cv = visitUi.querySelector('canvas[data-vface]');
    drawFace(cv, p.sheet = p.sheet || sheetOf(p.profile));
    renderChat();
  }

  visitUi.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-v]');
    if (!b) return;
    const r = WEEKLY[V.i];
    switch (b.dataset.v) {
      case 'exit': return exitVisit();
      case 'prev': return visitRoom((V.i - 1 + WEEKLY.length) % WEEKLY.length);
      case 'next': return visitRoom((V.i + 1) % WEEKLY.length);
      case 'tour': return tour(!V.tour);
      case 'like': {
        if (V.liked[r.title]) delete V.liked[r.title];
        else V.liked[r.title] = true;
        store.set(LIKES_KEY, V.liked);
        const on = !!V.liked[r.title];
        b.classList.toggle('is-on', on);
        b.setAttribute('aria-pressed', on);
        b.textContent = on ? '♥ Curtiu' : '♡ Curtir';
        visitUi.querySelector('[data-v="likes"]').textContent = fmt(likesOf(r));
        if (on) { const owner = V.visitors.find((a) => a.visit.owner); if (owner) setTimeout(() => V.on && say(owner, 'obrigado pela curtida! 💚'), 1200); }
      }
    }
  });
  visitUi.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const inp = ev.target.querySelector('input'), text = inp.value.trim();
    inp.value = '';
    if (!text) return;
    say(null, text, true);
    // someone answers now and then (the room's author more often)
    if (Math.random() < 0.6 && V.visitors.length) {
      const a = V.visitors.find((x) => x.visit.owner && Math.random() < 0.5) || pick(V.visitors);
      setTimeout(() => V.on && V.visitors.indexOf(a) >= 0 && say(a, pick(REPLIES)), between(900, 2200));
    }
  });

  // drag the floor to look around (switches the camera to free)
  const drag = $('visitDrag');
  drag.addEventListener('pointerdown', (ev) => {
    V.drag = { sx: ev.clientX, sy: ev.clientY, cx: D.scene.cam.x, cy: D.scene.cam.y };
    drag.setPointerCapture(ev.pointerId);
    drag.classList.add('is-grab');
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  });
  drag.addEventListener('pointermove', (ev) => {
    if (!V.drag) return;
    if (V.tour) tour(false);
    const sc = D.scene, d = sc.screenDelta(ev.clientX - V.drag.sx, ev.clientY - V.drag.sy);
    sc.cam.x = Math.max(0, Math.min(sc.mapW, V.drag.cx - d.x));
    sc.cam.y = Math.max(0, Math.min(sc.mapH, V.drag.cy - d.y));
  });
  const endDrag = () => { V.drag = null; drag.classList.remove('is-grab'); };
  drag.addEventListener('pointerup', endDrag);
  drag.addEventListener('pointercancel', endDrag);

  // keys while visiting (runs before demo.js: the player doesn't walk around someone else's room)
  const PAN = { KeyW: [0, -1], KeyA: [-1, 0], KeyS: [0, 1], KeyD: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  addEventListener('keydown', (ev) => {
    if (!V.on) return;
    ev.stopImmediatePropagation();
    const typing = document.activeElement && document.activeElement.tagName === 'INPUT';
    if (ev.code === 'Escape') { ev.preventDefault(); if (typing) document.activeElement.blur(); else exitVisit(); return; }
    if (typing) return;
    if (ev.code === 'ArrowLeft' || ev.code === 'ArrowRight') { ev.preventDefault(); visitRoom((V.i + (ev.code === 'ArrowRight' ? 1 : WEEKLY.length - 1)) % WEEKLY.length); return; }
    if (ev.code === 'Enter') { ev.preventDefault(); const inp = visitUi.querySelector('.visit-chat__form input'); if (inp) inp.focus(); return; }
    if (PAN[ev.code]) { ev.preventDefault(); V.keys.add(ev.code); }
  }, true);
  addEventListener('keyup', (ev) => { V.keys.delete(ev.code); });
  addEventListener('blur', () => V.keys.clear());

  function visitTick(dt) {
    const sc = D.scene, r = WEEKLY[V.i];
    V.t += dt;
    // camera keys
    let cx = 0, cy = 0;
    for (const k of V.keys) { cx += PAN[k][0]; cy += PAN[k][1]; }
    if (cx || cy) {
      if (V.tour) tour(false);
      const m = sc.screenDir(cx, cy), sp = 300 / Math.max(1, sc.S / 3);
      sc.cam.x = Math.max(0, Math.min(sc.mapW, sc.cam.x + m.x * sp * dt));
      sc.cam.y = Math.max(0, Math.min(sc.mapH, sc.cam.y + m.y * sp * dt));
    }
    // people come in (up to 6 on the map) and leave after a while
    if ((V.next -= dt) <= 0) {
      V.next = V.visitors.length < 3 ? between(1, 3) : between(6, 14);
      if (V.visitors.length < 6) {
        const free = PLAYERS.map((p, k) => k).filter((k) => k !== r.by && !V.visitors.some((a) => a.visit.who === k));
        if (free.length) addVisitor(pick(free));
      }
    }
    const sp = sc.world.spawn;
    for (const a of V.visitors.slice()) {
      const v = a.visit;
      if (v.sayT > 0) v.sayT -= dt;
      if (v.leaving) {
        v.leaving += dt;
        if (Math.hypot(a.x - sp.x, a.y - sp.y) < 10 || v.leaving > 30) { say(null, '@' + PLAYERS[v.who].name + ' saiu.'); removeVisitor(a); }
      } else if ((v.stay -= dt) <= 0) leave(a);
    }
    // chatter
    if ((V.nextMsg -= dt) <= 0) {
      V.nextMsg = between(3, 8);
      const here = V.visitors.filter((a) => !a.visit.leaving);
      const a = here.length && pick(here);
      if (a) say(a, pick(a.visit.owner ? OWNER_CHAT : CHAT));
    }
    // the "agora" counter drifts
    if ((V.nextCount -= dt) <= 0) {
      V.nextCount = between(3, 7);
      V.count = Math.max(V.visitors.length, V.count + Math.round(between(-2, 2.4)));
      const c = visitUi.querySelector('[data-v="count"]');
      if (c) c.textContent = V.count;
    }
    // name tags + speech bubbles over the visitors
    for (const a of V.visitors) {
      const v = a.visit;
      if (!v.tag) {
        v.tag = document.createElement('span');
        v.tag.className = 'visit-nt' + (v.owner ? ' is-owner' : '');
        visitTags.appendChild(v.tag);
      }
      const k = (v.sayT > 0 ? v.text : '') + '|' + v.owner;
      if (v.tag.dataset.k !== k) {
        v.tag.dataset.k = k;
        v.tag.innerHTML = (v.sayT > 0 ? '<span class="visit-nt__say">' + esc(v.text) + '</span>' : '') + '<b>' + (v.owner ? '★ ' : '') + '@' + esc(PLAYERS[v.who].name) + '</b>';
      }
      const p = sc.worldToScreen(a.x, a.y, 31);
      v.tag.style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px) translate(-50%,-100%)';
    }
  }

  // animated thumbnails while a screen with rooms is open
  let lastT = 0;
  (function tick(now) {
    if (!root.hidden && (M.sub === 'weekly' || M.sub === 'load')) drawRooms(now / 1000);
    if (V.on) visitTick(Math.min(0.1, (now - lastT) / 1000));
    lastT = now;
    requestAnimationFrame(tick);
  })(0);
  let rz = 0;
  addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (M.sub) drawRooms(0); }, 120); });

  /* ---------------- boot: title screen over the live datacenter ---------------- */
  $('intro').classList.remove('is-open');
  showBackdrop();
  root.hidden = false;
  refreshMenuMeta();
  setScreen('title');
  requestAnimationFrame(() => root.classList.add('is-ready'));

  // leave the account (auth-gate.js brings the login back when the session ends)
  const logoutBtn = $('mmLogout');
  if (logoutBtn) logoutBtn.addEventListener('click', async () => {
    logoutBtn.disabled = true;
    logoutBtn.textContent = 'Saindo…';
    await DL.Auth.signOut();
  });
  // in game: "Menu" saves to the cloud and goes back to the Main Menu
  const menuBtn = $('menuBtn');
  if (menuBtn) menuBtn.addEventListener('click', async () => {
    menuBtn.disabled = true;
    menuBtn.textContent = 'Salvando…';
    if (DL.SaveService && D.state.phase === 'play') {
      // a game that never got its slot gets one now; leaving without saving needs a second click
      const r = await saveToSlot();
      if (!r.ok && r.code !== 'idle' && menuBtn.dataset.force !== '1') {
        D.game.toast('warn', 'Não foi possível salvar', r.message + ' · clique em Menu de novo para sair sem salvar');
        menuBtn.dataset.force = '1'; menuBtn.disabled = false; menuBtn.textContent = 'Sair sem salvar';
        setTimeout(() => { delete menuBtn.dataset.force; menuBtn.textContent = 'Menu'; }, 8000);
        return;
      }
    }
    location.replace(location.pathname); // the session stays: straight back to the Main Menu
  });

  // save the running game into its cloud slot, claiming one first if the game has none yet
  async function saveToSlot() {
    if (!DL.Cloud || !DL.Cloud.signedIn) return { ok: false, code: 'unauthorized', message: 'Sua sessão terminou: entre na sua conta para salvar.' };
    if (!DL.SaveService.slot) {
      if (!DL.CloudSync) return { ok: false, code: 'offline', message: 'Sem conexão com o servidor do DataLab.' };
      const s = await DL.CloudSync.ensureSlot();
      if (!s.ok) return s;
    }
    if (DL.SaveService.busy) { // an autosave is on its way: wait for it, then save the latest state
      for (let i = 0; i < 40 && DL.SaveService.busy; i++) await new Promise((res) => setTimeout(res, 250));
    }
    return DL.SaveService.save({});
  }

  // in game: "Salvar" (or Ctrl/Cmd+S) saves to the cloud slot without leaving
  const saveBtn = $('saveBtn');
  async function saveNow() {
    if (!saveBtn || saveBtn.disabled) return;
    saveBtn.disabled = true;
    saveBtn.textContent = 'Salvando…';
    const r = await saveToSlot();
    saveBtn.disabled = false;
    if (r.ok) {
      saveBtn.textContent = 'Salvo ✓';
      D.game.toast('ok', 'Jogo salvo', 'Seu progresso foi salvo na sua conta.');
      setTimeout(() => { saveBtn.textContent = 'Salvar'; }, 2000);
    } else {
      saveBtn.textContent = 'Salvar';
      D.game.toast('warn', 'Não foi possível salvar', r.message);
    }
  }
  if (saveBtn) saveBtn.addEventListener('click', saveNow);
  addEventListener('keydown', (ev) => {
    if ((ev.ctrlKey || ev.metaKey) && ev.code === 'KeyS' && D.state && D.state.phase === 'play') { ev.preventDefault(); saveNow(); }
  });

  D.menu = { open: (id) => (id ? openSub(id) : setScreen('menu')), close: closeSub, newGame, backToMenu, get screen() { return M.screen; }, get sub() { return M.sub; },
    // the logged-in account (auth-gate.js): shown in the menu footer and on the title screen
    setAccount(p) { M.account = p; refreshMenuMeta(); DL.Auth.titles().then(refreshMenuMeta); },
    refresh: refreshMenuMeta };
})();
