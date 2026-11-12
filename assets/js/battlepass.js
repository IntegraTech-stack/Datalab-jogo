/* DataLab — the season pass: "PASSE BOOT INICIAL – TEMPORADA 1".
   Free for everyone: the player activates it once (ATIVAR PASSE – GRÁTIS, with a celebration) and from then
   on earns pass XP by playing. 50 levels, 60 days. Everything it gives is EXCLUSIVO T1 (cosmetics.js:
   items with pass: 's1'): never sold in the shop, out of reach once the season ends, kept forever by
   whoever earned it. The levels without an item give 50 Gold.
   Pass XP comes only from what the game already does (the game's own events): fixing equipment ('fixed'),
   solving problems ('problem-done'), the crew's tasks ('job-done'), servers going online, cables,
   datacenters done and the time playing — plus 3 daily and 3 weekly missions over the same actions.
   A level reached shows a celebration (a bigger one on the ★ levels) and its card lights up with COLETAR;
   collecting puts the item in the inventory. Same inventory, Gold and save as everything else:
   - without an account: progress in this browser (localStorage, like the inventory); COLETAR delivers into
     the local inventory (DL.Inventory.grant) and wallet;
   - with an account: the server keeps the pass (Edge Function "pass", services/pass-service.js). The game
     sends the XP it saw and the missions it finished; the server caps them by the time that went by,
     counts each mission once, raises the level and puts the rewards in the account's inventory (COLETAR
     then only marks the card as collected here).
   UI (the pass' own gold-on-charcoal look, pass.css; the item art is pass-art.js): the Passe button / J
   opens #passOv — header with the golden chip and a cloud for where the progress is, two tabs (Recompensas
   first, Missões), the level and the XP bar in blocks on one line (how XP is earned behind a "?"), the 50
   rewards in a row that scrolls sideways; clicking a reward opens a big animated preview. */
(function () {
  'use strict';
  const DL = window.DL;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const fmt = (n) => Math.round(n).toLocaleString('pt-BR');
  const DAY = 86400000;

  /* ------------------------------------------------------------------ */
  /* The season (the server's migrations have the same numbers)          */
  /* ------------------------------------------------------------------ */
  const SEASON = { id: 's1', name: 'Passe Boot Inicial', tag: 'Temporada 1', from: '2026-10-31', days: 60 };
  const MAX = 50;
  // the ★ levels: the big prizes (a bigger card and a bigger celebration)
  const BIG = { 10: 1, 20: 1, 30: 1, 40: 1, 48: 1, 49: 1, 50: 1 };
  // XP from level L to L + 1, and the total to reach level L (each level asks a little more)
  const need = (L) => 200 + 40 * L;
  const total = (L) => 200 * L + 20 * L * (L - 1);
  const levelAt = (xp) => { let L = 0; while (L < MAX && xp >= total(L + 1)) L++; return L; };
  // one reward per level (migration 20261101000200_pass_rewards_v2.sql has the same table)
  const REWARD = {
    1: ['bp_frame_t1'], 3: ['bp_hello'], 4: ['bp_icon_chip'], 5: ['bp_trail_binary'], 7: ['bp_graffiti'], 9: ['bp_glasses001'], 10: ['bp_pet_bitzero'],
    12: ['bp_gloves_t1'], 13: ['bp_xp2'], 14: ['bp_trail_sparks'], 15: ['bp_emote_reboot'], 17: ['bp_cooler'], 18: ['bp_term_boot'], 20: ['bp_emote_hack'],
    22: ['bp_hacker_desk'], 23: ['bp_trail_bolt'], 25: ['bp_xp2'], 26: ['bp_pet_glitchcat'], 27: ['bp_founder_chair'], 29: ['bp_cable_cape'], 30: ['bp_relic'],
    32: ['bp_trail_ghost'], 33: ['bp_crt_terminal'], 35: ['bp_xp2'], 36: ['bp_arcade_boot'], 37: ['bp_led_crown'], 39: ['bp_data_wings'], 40: ['bp_trail_code'],
    42: ['bp_server_throne'], 43: ['bp_trail_glitch'], 45: ['bp_neon_boot'], 46: ['bp_aura_boot'], 48: ['bp_skin_founder'], 49: ['bp_trail_rainbow'], 50: ['bp_title_pioneer'],
  };
  const GOLD = 50;
  const goldAt = (L) => (REWARD[L] ? 0 : GOLD);
  const start = new Date(SEASON.from + 'T00:00:00').getTime(), end = start + SEASON.days * DAY;
  const active = (now) => { const t = now || Date.now(); return t >= start && t < end; };
  const daysLeft = (now) => Math.max(0, Math.ceil((end - (now || Date.now())) / DAY));
  const levelOf = (id) => { for (const L of Object.keys(REWARD)) if (REWARD[L].indexOf(id) >= 0) return +L; return 0; };

  // XP for each action, and the missions over the same actions (ev: what is counted)
  const XP = { fix: 40, prob: 60, job: 10, online: 30, cable: 5, dc: 250, minute: 10 };
  const EVENT_CAP = 200; // per real minute, from events (time played and missions don't count here)
  const DAILY = [
    { id: 'fix', ev: 'fix', n: 3, xp: 150, text: 'Conserte {n} falhas em servidores ou switches', unit: 'consertados' },
    { id: 'prob', ev: 'prob', n: 2, xp: 200, text: 'Resolva {n} problemas', unit: 'resolvidos' },
    { id: 'jobs', ev: 'job', n: 8, xp: 150, text: 'Complete {n} tarefas da equipe', unit: 'tarefas' },
    { id: 'online', ev: 'online', n: 2, xp: 150, text: 'Coloque {n} servidores online', unit: 'online' },
    { id: 'cable', ev: 'cable', n: 6, xp: 120, text: 'Conecte {n} cabos', unit: 'cabos' },
    { id: 'play', ev: 'minute', n: 20, xp: 150, text: 'Jogue {n} minutos', unit: 'min' },
  ];
  const WEEKLY = [
    { id: 'wfix', ev: 'fix', n: 15, xp: 800, text: 'Conserte {n} falhas em servidores ou switches', unit: 'consertados' },
    { id: 'wprob', ev: 'prob', n: 10, xp: 900, text: 'Resolva {n} problemas', unit: 'resolvidos' },
    { id: 'wjobs', ev: 'job', n: 50, xp: 700, text: 'Complete {n} tarefas da equipe', unit: 'tarefas' },
    { id: 'wonline', ev: 'online', n: 10, xp: 800, text: 'Coloque {n} servidores online', unit: 'online' },
    { id: 'wcable', ev: 'cable', n: 40, xp: 600, text: 'Conecte {n} cabos', unit: 'cabos' },
    { id: 'wplay', ev: 'minute', n: 150, xp: 900, text: 'Jogue {n} minutos', unit: 'min' },
  ];
  const pad = (n) => String(n).padStart(2, '0');
  const dayKey = (d) => d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  const monday = (d) => { const m = new Date(d.getFullYear(), d.getMonth(), d.getDate()); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); return m; };
  const dayNo = (d) => Math.floor(new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() / DAY);
  // 3 missions of a pool, the same for everyone on that day / week
  function pick(pool, seed) {
    return pool.map((m, i) => [DL.hash(seed * 97 + i * 31), m]).sort((a, b) => a[0] - b[0]).slice(0, 3).map((x) => x[1]);
  }
  const untilText = (ms) => { const h = Math.floor(ms / 3600000); return h >= 48 ? Math.floor(h / 24) + ' dias' : h >= 1 ? h + ' h' : Math.max(1, Math.ceil(ms / 60000)) + ' min'; };

  DL.PASS = { SEASON, MAX, BIG, REWARD, GOLD, need, total, levelAt, goldAt, active, daysLeft, levelOf, DAILY, WEEKLY, XP };

  // what kind of thing a reward is, in the player's words
  function kindName(it) {
    if (!it) return 'Moedas';
    if (it.slot === 'furniture') return 'Móvel';
    if (it.slot === 'trail') return 'Rastro';
    if (it.slot === 'aura') return 'Efeito';
    if (it.slot === 'pet') return 'Pet';
    if (it.cat === 'emote') return 'Emote';
    if (it.slot === 'shirt') return 'Skin';
    if (it.slot === 'terminal') return 'Skin de hack';
    if (it.slot === 'rack') return 'Skin de servidor';
    if (it.slot === 'frame') return 'Moldura de perfil';
    if (it.slot === 'icon') return 'Ícone de perfil';
    if (it.slot === 'title') return 'Título';
    if (it.slot === 'use') return 'Bônus de XP';
    return 'Acessório';
  }

  /* ------------------------------------------------------------------ */
  /* The frame, the icon and the title: shared helpers                   */
  /* ------------------------------------------------------------------ */
  // pixel frame around a w×h box on a canvas: gold border, stepped corners with turquoise stones, the T1
  // seal, and a spark that runs around it
  DL.drawPassFrame = function (g, x, y, w, h, t) {
    const R = DL.R, glow = 0.5 + 0.5 * Math.sin((t || 0) * 2.4);
    R(g, x - 3, y - 3, w + 6, h + 6, 'rgba(242,181,30,' + (0.14 + 0.12 * glow).toFixed(3) + ')');
    R(g, x - 2, y - 2, w + 4, 2, '#ffe680'); R(g, x - 2, y + h, w + 4, 2, '#bd7c10');
    R(g, x - 2, y, 2, h, '#f2b51e'); R(g, x + w, y, 2, h, '#bd7c10');
    for (const [cx, cy] of [[x - 3, y - 3], [x + w + 1, y - 3], [x - 3, y + h + 1], [x + w + 1, y + h + 1]]) { R(g, cx, cy, 2, 2, '#2de2c8'); R(g, cx, cy, 1, 1, '#b4fff3'); }
    // the running spark: along the border, clockwise
    const per = 2 * (w + h), d = ((t || 0) * 40) % per;
    const sx = d < w ? x + d : d < w + h ? x + w : d < 2 * w + h ? x + w - (d - w - h) : x - 2, sy = d < w ? y - 2 : d < w + h ? y + (d - w) : d < 2 * w + h ? y + h : y + h - (d - 2 * w - h);
    R(g, Math.round(sx), Math.round(sy), 2, 2, '#fff8d6');
    R(g, x + w - 9, y + h - 6, 11, 8, '#0c0a08'); R(g, x + w - 9, y + h - 6, 11, 1, '#f2b51e');
    DL.pixText(g, 'T1', x + w - 8, y + h - 4, glow > 0.5 ? '#fff8d6' : '#ffe680');
  };
  DL.PASS_TITLES = { pioneer: { name: 'Pioneiro' } };
  // the badge shown under a name (nametags, the room's player list, the account): golden text with a
  // light sweeping across it (pass.css)
  DL.passTitleHtml = (v) => (DL.PASS_TITLES[v] ? '<em class="ptitle ptitle--t1"><span>' + DL.PASS_TITLES[v].name + '</span></em>' : '');
  DL.passFrameClass = (v) => (v === 't1' ? ' pframe pframe--t1' : '');
  // the profile icon (Chip Boot) next to a name: the golden chip as a tiny pixel image
  let chipUrl = '';
  DL.passIconHtml = function (v) {
    if (v !== 'chip') return '';
    if (!chipUrl && DL.drawPassChip) {
      const c = document.createElement('canvas'); c.width = c.height = 20;
      DL.drawPassChip(c.getContext('2d'), 0.3, true);
      chipUrl = c.toDataURL();
    }
    return '<i class="picon picon--chip" aria-label="Ícone Chip Boot" style="background-image:url(' + chipUrl + ')"></i>';
  };
  // what the inventory has equipped in the pass' slots (and the trail): travels with the look online
  const equippedValue = (slot) => { const id = DL.Skins && DL.Skins.equipped[slot], it = id && DL.cosmetic(id); return it ? it.value : null; };
  DL.lookExtras = () => { const o = {}; for (const s of ['trail', 'aura', 'frame', 'icon', 'title']) { const v = equippedValue(s); if (v) o[s] = v; } return o; };

  /* ------------------------------------------------------------------ */
  /* Celebrations: pixel confetti on a canvas over the whole screen      */
  /* ------------------------------------------------------------------ */
  const CONFETTI = ['#ffe680', '#f2b51e', '#fff8d6', '#2de2c8', '#a5f7ea', '#ff9a1f'];
  function confetti(cv, n, ms) {
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = innerWidth, H = innerHeight;
    cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr);
    const g = cv.getContext('2d'), ps = [];
    for (let i = 0; i < n; i++) {
      ps.push({ x: W / 2 + (Math.random() - 0.5) * 120, y: H * 0.42, vx: (Math.random() - 0.5) * 900, vy: -300 - Math.random() * 650, s: 4 + Math.floor(Math.random() * 3) * 2,
        c: CONFETTI[i % CONFETTI.length], spin: Math.random() * 10, rain: false });
    }
    // and a rain from the top
    for (let i = 0; i < n * 0.6; i++) ps.push({ x: Math.random() * W, y: -20 - Math.random() * H * 0.6, vx: (Math.random() - 0.5) * 40, vy: 80 + Math.random() * 120, s: 4 + Math.floor(Math.random() * 2) * 2, c: CONFETTI[i % CONFETTI.length], spin: Math.random() * 10, rain: true });
    const t0 = performance.now();
    let last = t0;
    function step(now) {
      const dt = Math.min(0.05, (now - last) / 1000), t = now - t0;
      last = now;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      g.globalAlpha = t > ms - 600 ? Math.max(0, (ms - t) / 600) : 1;
      for (const p of ps) {
        p.vy += (p.rain ? 30 : 900) * dt; p.vx *= p.rain ? 1 : 0.985;
        p.x += (p.vx + Math.sin(t / 300 + p.spin) * 30) * dt; p.y += p.vy * dt;
        const w = Math.max(2, Math.round(Math.abs(Math.cos(t / 160 + p.spin)) * p.s));
        g.fillStyle = p.c;
        g.fillRect(Math.round(p.x), Math.round(p.y), w, p.s);
      }
      if (t < ms && cv.isConnected) requestAnimationFrame(step);
      else g.clearRect(0, 0, W, H);
    }
    requestAnimationFrame(step);
  }

  /* ------------------------------------------------------------------ */
  /* The pass in the game (demo.js creates it)                           */
  /* ------------------------------------------------------------------ */
  DL.createPass = function (game, sys) {
    const inventory = sys.inventory, economy = sys.economy;
    const $ = (id) => document.getElementById(id);
    const el = { ov: $('passOv'), root: $('passRoot'), btn: $('passBtn'), lvl: $('passBtnLvl'), chip: $('passChip') };
    const KEY = 'datalab.pass.' + SEASON.id;
    // on: activated (free); got: levels already celebrated here (with an account: the levels the server
    // delivered); col: the levels whose reward was collected (COLETAR)
    const fresh = () => ({ v: 2, season: SEASON.id, on: false, xp: 0, got: 0, col: [], pend: 0, pendM: [], boost: 0, min: 0, day: '', d: {}, dd: {}, week: '', w: {}, wd: {} });
    let S = fresh(), key = KEY;
    // tab: 'rewards' (opens first) or 'missions'; help: the "?" next to the XP bar is open
    const V = { open: false, busy: false, offline: null, warned: '', evWin: 0, evXp: 0, syncT: 0, lastK: '', queue: [], showing: false, raf: 0, scrolled: false, pv: 0, tab: 'rewards', help: false };

    function load(k) {
      key = k;
      S = fresh();
      let s = null;
      try { s = JSON.parse(localStorage.getItem(key) || 'null'); } catch (e) { /* fresh */ }
      if (s && s.season === SEASON.id) {
        Object.assign(S, s);
        // a pass from before the free activation and COLETAR: already on, and the levels it had
        // delivered count as collected
        if (!(s.v >= 2)) { S.on = S.on || s.xp > 0 || s.got > 0; S.col = []; for (let L = 1; L <= (s.got | 0); L++) S.col.push(L); S.v = 2; }
      }
      S.pendM = Array.isArray(S.pendM) ? S.pendM : [];
      S.col = Array.isArray(S.col) ? S.col : [];
      rollMissions();
    }
    const save = () => { try { localStorage.setItem(key, JSON.stringify(S)); } catch (e) { /* private mode */ } };
    // with an account the server delivers (never this browser, even while the server is out of reach);
    // remote: the account's inventory is here, so the pass can talk to the server
    const signed = () => !!(DL.Cloud && DL.Cloud.signedIn);
    const remote = () => signed() && !!(inventory.remote && DL.PassService);
    const level = () => levelAt(S.xp);
    const playing = () => !!(sys.playing && sys.playing());
    const collected = (L) => S.col.indexOf(L) >= 0;

    /* ---------- missions ---------- */
    function current() {
      const now = new Date();
      return { daily: pick(DAILY, dayNo(now)), weekly: pick(WEEKLY, dayNo(monday(now)) + 7777), day: dayKey(now), week: dayKey(monday(now)) };
    }
    // a new day / week: fresh missions (finished ones stay finished for their own day)
    function rollMissions() {
      const c = current();
      if (S.day !== c.day) { S.day = c.day; S.d = {}; S.dd = {}; }
      if (S.week !== c.week) { S.week = c.week; S.w = {}; S.wd = {}; }
      return c;
    }
    function count(ev, n) {
      if (!active() || !S.on) return;
      const c = rollMissions();
      for (const [list, prog, done, kind, period] of [[c.daily, S.d, S.dd, 'd', S.day], [c.weekly, S.w, S.wd, 'w', S.week]]) {
        for (const m of list) {
          if (m.ev !== ev || done[m.id]) continue;
          prog[m.id] = Math.min(m.n, (prog[m.id] || 0) + n);
          if (prog[m.id] >= m.n) {
            done[m.id] = true;
            const x = addXp(m.xp, 'mission');
            if (signed()) S.pendM.push({ k: kind + ':' + period + ':' + m.id, xp: m.xp });
            game.toast('ok', (kind === 'd' ? 'Missão diária' : 'Missão semanal') + ' concluída', esc(m.text.replace('{n}', m.n)) + ' · +' + fmt(x) + ' XP do passe');
            game.sfx('levelup');
          }
        }
      }
      save();
      if (V.open) render();
    }

    /* ---------- XP ---------- */
    // returns the XP really added (double while the bonus runs). kind: 'event' (capped per minute), 'time'
    // (a minute played) or 'mission' (its base XP reaches the server with the mission's key, not as XP).
    // Nothing is earned before the pass is activated.
    function addXp(n, kind) {
      if (!active() || !S.on || !(n > 0)) return 0;
      if (!kind || kind === 'event') {
        const now = Date.now();
        if (now - V.evWin > 60000) { V.evWin = now; V.evXp = 0; }
        n = Math.min(n, EVENT_CAP - V.evXp);
        if (n <= 0) return 0;
        V.evXp += n;
      }
      const got = S.boost > 0 ? n * 2 : n;
      const before = level();
      S.xp += got;
      if (signed()) S.pend += kind === 'mission' ? got - n : got;
      if (level() > before) {
        if (signed()) scheduleSync(800);
        else settleLocal();
      }
      save();
      paintButton();
      return got;
    }
    // without an account: every level reached is celebrated here, once (its reward waits for COLETAR)
    function settleLocal() {
      if (signed()) return;
      const L = level();
      while (S.got < L) { S.got++; celebrate(S.got); }
      save();
      paintButton();
    }
    function deliver(L) {
      for (const id of REWARD[L] || []) {
        const it = DL.cosmetic(id);
        if (it && (it.stack || !inventory.owns(id))) inventory.grant(id, 'passe');
      }
      const g = goldAt(L);
      if (g) economy.earn('gold', g, 'Passe Boot · nível ' + L, { quiet: true });
    }

    /* ---------- COLETAR ---------- */
    // a card's state: got (collected), ready (COLETAR), sending (reached, the server has not delivered it
    // yet) or locked
    function stateOf(L) {
      if (collected(L)) return 'got';
      if (signed()) return L <= S.got ? 'ready' : L <= level() ? 'sending' : 'locked';
      return L <= level() ? 'ready' : 'locked';
    }
    const readyLevels = () => { const out = []; for (let L = 1; L <= MAX; L++) if (stateOf(L) === 'ready') out.push(L); return out; };
    function collect(Ls) {
      Ls = Ls.filter((L) => stateOf(L) === 'ready');
      if (!Ls.length) return;
      for (const L of Ls) {
        if (!signed()) deliver(L);
        S.col.push(L);
      }
      save();
      const its = [].concat(...Ls.map(rewardItems)), g = Ls.reduce((n, L) => n + goldAt(L), 0);
      const what = its.length === 1 && !g ? its[0].name : its.length ? its.length + (its.length > 1 ? ' itens' : ' item') + (g ? ' + ' + fmt(g) + ' Gold' : '') : fmt(g) + ' Gold';
      game.toast('ok', 'Coletado!', esc(what) + (its.length ? ' · no inventário (U)' : ' · na carteira'));
      game.sfx('coin');
      if (V.open) { V.flash = Ls; render(); }
      paintButton();
    }

    /* ---------- activation (free) ---------- */
    function activate() {
      if (S.on) return;
      S.on = true;
      save();
      game.sfx('levelup');
      showActivation();
      paintButton();
      if (V.open) render();
      if (remote()) { V.pullAt = 0; pull(); }
    }

    /* ---------- the server (with an account) ---------- */
    function scheduleSync(ms) { clearTimeout(V.syncT); V.syncT = setTimeout(sync, ms); }
    // the server didn't answer: the player sees a short friendly note; the technical reason (Edge Function,
    // ALLOWED_ORIGINS…) goes to the console, once per reason
    function offline(r) {
      V.offline = true;
      const why = (r && (r.message || r.code)) || 'sem resposta';
      if (V.warned !== why) { V.warned = why; console.warn('DataLab · Passe: o servidor não respondeu (' + ((r && (r.status || r.code)) || '?') + '): ' + why); }
    }
    // fresh: the answer to a sync this game sent (its new levels are celebrated); otherwise the account's
    // state as it was (levels earned before, maybe on another device, are not)
    function applyServer(p, fresh) {
      if (!p || p.season !== SEASON.id) return;
      const before = S.got;
      // the server's XP + what it hasn't seen yet (XP and the base of finished missions)
      S.xp = Math.max(0, (p.xp | 0) + S.pend + S.pendM.reduce((n, m) => n + m.xp, 0));
      S.got = Math.min(MAX, p.level | 0);
      if (S.xp > 0 || S.got > 0) S.on = true;
      // missions the account already finished (on any device) stay finished
      for (const k of p.missions || []) {
        const [kind, period, id] = String(k).split(':');
        if (kind === 'd' && period === S.day) { S.dd[id] = true; const m = DAILY.find((x) => x.id === id); if (m) S.d[id] = m.n; }
        if (kind === 'w' && period === S.week) { S.wd[id] = true; const m = WEEKLY.find((x) => x.id === id); if (m) S.w[id] = m.n; }
      }
      for (let L = before + 1; L <= S.got; L++) if (fresh || V.synced) celebrate(L);
      V.synced = true;
      save();
      paintButton();
      if (V.open) render();
    }
    async function sync() {
      clearTimeout(V.syncT);
      if (!remote() || V.busy) return;
      const xp = Math.min(1000000, Math.max(0, Math.round(S.pend))), missions = S.pendM.slice(0, 12);
      V.busy = true;
      const r = await DL.PassService.sync({ season: SEASON.id, xp, missions });
      V.busy = false;
      if (r.ok) {
        V.offline = null;
        // the server takes at most 150 XP a minute and drops the rest: what it didn't take stays pending for the
        // next syncs (its 'gained' also counts the missions' XP)
        const sentM = missions.reduce((n, m) => n + Math.min(m.xp | 0, m.k[0] === 'd' ? 250 : 1000), 0);
        const took = typeof r.data.gained === 'number' ? Math.min(xp, Math.max(0, r.data.gained - sentM)) : xp;
        S.pend = Math.max(0, S.pend - took);
        S.pendM = S.pendM.filter((m) => !missions.some((x) => x.k === m.k));
        if (r.data.inventory) DL.InventoryService.applied(r.data.inventory);
        applyServer(r.data.pass, true);
      } else {
        offline(r);
        if (r.status === 404 || r.code === 'http_404' || r.code === 'not_found') console.warn('DataLab: o Passe ainda não está no servidor — publique as migrations do passe (20261101000100 e 20261101000200) e a Edge Function "pass".');
        save();
        if (V.open) render();
      }
    }
    async function pull() {
      if (!remote() || Date.now() - (V.pullAt || 0) < 15000) return;
      V.pullAt = Date.now();
      const r = await DL.PassService.state();
      if (r.ok) { V.offline = null; applyServer(r.data.pass); if (S.pend || S.pendM.length) scheduleSync(1500); }
      else { offline(r); if (V.open) render(); }
    }
    // whose pass: this browser's, or the account's (cached here, the server decides)
    function account() {
      const u = DL.Cloud && DL.Cloud.signedIn && DL.Cloud.user;
      const k = u ? KEY + '.' + u.id : KEY;
      if (k !== key) { load(k); V.synced = false; paintButton(); }
      if (u) pull();
      else settleLocal();
      if (V.open) render();
    }

    /* ---------- the game's own actions ---------- */
    const on = (ev, test, kind) => game.on(ev, (info) => { if (!playing() || (test && !test(info || {}))) return; addXp(XP[kind]); count(kind, 1); });
    on('fixed', null, 'fix');
    on('problem-done', (i) => !i.wrong, 'prob');
    on('job-done', (i) => !i.failed, 'job');
    on('server-online', null, 'online');
    on('cabled', null, 'cable');
    on('datacenter-done', null, 'dc');
    game.on('pass-boost', () => { S.boost += 3600; save(); paintButton(); if (V.open) render(); });
    // the inventory changed: the trail / aura / frame / icon / title / accessories other players see may
    // have changed too
    game.on('inventory', () => {
      const p = (sys.crew && sys.crew.playerProfile) || {};
      const k = JSON.stringify([DL.lookExtras(), p.gear || null]);
      if (k !== V.lastK) { V.lastK = k; game.emit('look-extras', {}); }
      if (V.open) render();
    });

    // the game loop (demo.js step): time played, the bonus' clock, the periodic sync
    let syncEvery = 0;
    function update(dt) {
      if (!(dt > 0) || !playing() || document.hidden || !active() || !S.on) return;
      S.min += dt;
      if (S.boost > 0) S.boost = Math.max(0, S.boost - dt);
      if (S.min >= 60) {
        S.min -= 60;
        addXp(XP.minute, 'time');
        count('minute', 1);
      }
      syncEvery += dt;
      if (syncEvery > 40) { syncEvery = 0; if (remote() && (S.pend > 0 || S.pendM.length || !V.synced)) { if (V.synced) sync(); else { V.pullAt = 0; pull(); } } }
    }

    /* ---------- UI: the top bar button (the golden chip, the level, a badge for what is waiting) ---------- */
    function paintButton() {
      const ready = readyLevels().length;
      if (el.lvl) el.lvl.textContent = !S.on ? 'GRÁTIS' : active() ? String(level()) : 'T1';
      if (el.btn) {
        el.btn.classList.toggle('is-boost', S.boost > 0);
        el.btn.classList.toggle('is-new', !S.on && active());
        el.btn.classList.toggle('has-ready', ready > 0);
        el.btn.dataset.ready = ready > 0 ? String(ready) : '';
        el.btn.title = SEASON.name + ' · ' + SEASON.tag + (!S.on ? ' · grátis: clique para ativar' : ' · nível ' + level() + (ready ? ' · ' + ready + ' para coletar' : '')) + (active() ? ' · faltam ' + daysLeft() + ' dias' : ' · temporada encerrada') + ' (J)';
      }
    }
    // the chip on the button shines every few seconds (a small canvas, ~8 frames a second)
    if (el.chip && DL.paintPassChip) setInterval(() => { if (!document.hidden) DL.paintPassChip(el.chip, performance.now() / 1000, 20); }, 125);

    /* ---------- UI: the window ---------- */
    function rewardItems(L) { return (REWARD[L] || []).map((id) => DL.cosmetic(id)).filter(Boolean); }
    const rewardName = (L) => { const its = rewardItems(L); return its.length ? its.map((it) => it.name).join(' + ') : goldAt(L) + ' moedas'; };
    const artId = (L) => (REWARD[L] ? REWARD[L][0] : 'gold');
    function cardHtml(L) {
      const st = stateOf(L), its = rewardItems(L), big = BIG[L], it = its[0];
      const flash = V.flash && V.flash.indexOf(L) >= 0;
      // only the art, the level and the name (the kind is in the preview); COLETAR when it's waiting, a
      // small ✓ when collected
      const foot = st === 'ready' ? '<button class="bp-get" type="button" data-bp-get="' + L + '">COLETAR</button>'
        : st === 'sending' ? '<span class="bp-card__st is-sending">Entregando…</span>' : '';
      return '<li class="bp-card' + (big ? ' is-big' : '') + ' is-' + st + (L === level() + 1 && S.on ? ' is-next' : '') + (flash ? ' is-flash' : '') + '" data-lv="' + L + '" data-bp-pv="' + L + '" tabindex="0" role="button" aria-label="Nível ' + L + ': ' + esc(rewardName(L)) + (it ? ' (' + esc(kindName(it)) + ')' : '') + (st === 'got' ? ' · coletado' : '') + ' · ver prévia">' +
        '<span class="bp-card__lv">' + (big ? '★ ' : '') + 'NÍVEL ' + L + '</span>' +
        '<span class="bp-card__art"><canvas data-bp-art="' + artId(L) + '" data-px="' + (big ? 192 : 144) + '" aria-hidden="true"></canvas>' +
        (st === 'locked' ? '<i class="bp-lock" aria-label="Bloqueado"></i>' : '') + (st === 'got' ? '<i class="bp-card__got" aria-hidden="true">✓</i>' : '') + '</span>' +
        '<b class="bp-card__name">' + esc(rewardName(L)) + '</b><span class="bp-card__foot">' + foot + '</span></li>';
    }
    function missionsHtml(list, prog, done, title, until) {
      return '<section class="bp-mis"><header><b>' + title + '</b><span>trocam em ' + until + '</span></header><ul>' + list.map((m) => {
        const p = Math.min(m.n, prog[m.id] || 0), ok = !!done[m.id];
        return '<li class="' + (ok ? 'is-done' : '') + '"><span class="bp-mis__txt">' + (ok ? '✓ ' : '') + esc(m.text.replace('{n}', m.n)) + '</span>' +
          '<span class="bp-mis__bar"><i style="width:' + Math.round((p / m.n) * 100) + '%"></i></span>' +
          '<span class="bp-mis__n">' + p + '/' + m.n + ' ' + esc(m.unit) + '</span><span class="bp-mis__xp">+' + fmt(m.xp) + ' XP</span></li>';
      }).join('') + '</ul></section>';
    }
    // the XP bar: 20 golden blocks, the current one partly filled, a light sweeping across
    function barHtml(into, span) {
      const k = Math.max(0, Math.min(1, into / span)), n = 20, full = Math.floor(k * n), part = k * n - full;
      let h = '<div class="bp-xp__bar" role="progressbar" aria-valuemin="0" aria-valuemax="' + span + '" aria-valuenow="' + Math.round(into) + '">';
      for (let i = 0; i < n; i++) h += '<i class="' + (i < full ? 'is-on' : i === full && part > 0 ? 'is-part' : '') + '"' + (i === full && part > 0 ? ' style="--p:' + Math.round(part * 100) + '%"' : '') + '></i>';
      return h + '</div>';
    }
    function render() {
      if (!el.root) return;
      const L = level(), live = active(), c = rollMissions(), now = new Date(), ready = readyLevels();
      const into = L >= MAX ? need(MAX - 1) : S.xp - total(L), span = L >= MAX ? need(MAX - 1) : need(L);
      // where the progress is: a small cloud in the header, the message on hover
      const cloud = !signed() ? ['is-local', 'Sem conta: o passe fica salvo neste navegador.']
        : V.offline || !remote() ? ['is-wait', 'Progresso salvo. Vai sincronizar quando a conexão voltar.']
        : ['is-ok', 'Progresso salvo na sua conta.'];
      let h = '<header class="bp-bar"><canvas class="bp-logo" data-bp-chip width="96" height="96" aria-hidden="true"></canvas>' +
        '<span class="bp-title"><b>PASSE BOOT INICIAL</b><span>' + SEASON.tag + '</span></span>' +
        '<span class="bp-cloud ' + cloud[0] + '" tabindex="0" role="img" aria-label="' + cloud[1] + '" data-tip="' + cloud[1] + '"><i aria-hidden="true"></i></span>' +
        '<span class="bp-days' + (live ? '' : ' is-over') + '"><i aria-hidden="true"></i>' + (live ? '<span>Faltam</span><b>' + daysLeft() + '</b><span>dias</span>' : '<span>Temporada encerrada</span>') + '</span>' +
        '<button class="bp-x" type="button" data-bp="close" aria-label="Fechar o passe">×</button></header>';
      const tab = S.on ? V.tab : 'rewards';
      if (S.on) h += '<nav class="bp-tabs" role="tablist">' + [['rewards', 'Recompensas'], ['missions', 'Missões']].map(([k, t]) =>
        '<button class="bp-tab' + (tab === k ? ' is-on' : '') + '" type="button" role="tab" aria-selected="' + (tab === k) + '" data-bp-tab="' + k + '">' + t + '</button>').join('') + '</nav>';
      h += '<div class="bp-body">';
      if (!S.on && live) {
        h += '<section class="bp-activate"><canvas data-bp-chip width="192" height="192" aria-hidden="true"></canvas><div><b>O Passe Boot Inicial é grátis para todo mundo</b>' +
          '<p>Ative e ganhe XP jogando: consertando, resolvendo problemas, colocando servidores online, completando tarefas e com as missões diárias e semanais. São 50 níveis com itens exclusivos da Temporada 1, que nunca vão para a loja.</p>' +
          '<button class="bp-cta" type="button" data-bp="activate">ATIVAR PASSE – GRÁTIS</button></div></section>';
      } else {
        // the level and the XP bar on one line; how XP is earned behind the "?"
        h += '<section class="bp-hero"><div class="bp-lvl"><span>NÍVEL</span><b>' + L + '</b><small>/' + MAX + '</small></div>' +
          '<div class="bp-xp"><div class="bp-xp__top"><b>' + (L >= MAX ? 'Passe completo!' : 'Próximo nível: ' + (L + 1)) + '</b>' +
          (S.boost > 0 ? '<em class="bp-boost">2× XP · ' + Math.ceil(S.boost / 60) + ' min</em>' : '') + '<span>' + fmt(into) + ' / ' + fmt(span) + ' XP</span></div>' +
          barHtml(into, span) + '</div>' +
          '<span class="bp-help"><button class="bp-q' + (V.help ? ' is-on' : '') + '" type="button" data-bp="help" aria-expanded="' + !!V.help + '" aria-label="Como ganhar XP do passe">?</button>' +
          (V.help ? '<span class="bp-pop" role="dialog" aria-label="Como ganhar XP do passe"><b>Como ganhar XP</b><ul>' +
            [['Consertar falhas', XP.fix], ['Resolver problemas', XP.prob], ['Servidor online', XP.online], ['Tarefa da equipe', XP.job], ['Conectar cabo', XP.cable], ['Cada minuto jogando', XP.minute]]
              .map(([t, n]) => '<li><span>' + t + '</span><b>+' + n + '</b></li>').join('') +
            '</ul><small>E as missões diárias e semanais dão bastante XP.</small></span>' : '') + '</span></section>';
        if (tab === 'missions') {
          if (live) h += '<div class="bp-missions">' + missionsHtml(c.daily, S.d, S.dd, 'Missões diárias', untilText(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1) - now)) +
            missionsHtml(c.weekly, S.w, S.wd, 'Missões semanais', untilText(monday(now).getTime() + 7 * DAY - now)) + '</div>';
          else h += '<p class="bp-over">A Temporada 1 terminou. Os itens que você ganhou são seus para sempre; ninguém mais consegue os que faltaram.</p>';
        }
      }
      if (tab === 'rewards') {
        h += '<section class="bp-track"><header><b>Recompensas</b>' +
          (ready.length > 1 ? '<button class="bp-get bp-get--all" type="button" data-bp="all">COLETAR TUDO (' + ready.length + ')</button>' : '') +
          '<span class="bp-track__nav"><button class="bp-nav" type="button" data-bp="left" aria-label="Rolar para a esquerda">‹</button><button class="bp-nav" type="button" data-bp="right" aria-label="Rolar para a direita">›</button></span></header>' +
          '<ol class="bp-row" data-bp-row>';
        for (let i = 1; i <= MAX; i++) h += cardHtml(i);
        h += '</ol></section>';
      }
      h += '</div>';
      if (V.pv) h += previewHtml(V.pv);
      const row = el.root.querySelector('[data-bp-row]'), keep = row ? row.scrollLeft : null;
      el.root.innerHTML = h;
      V.flash = null;
      const nrow = el.root.querySelector('[data-bp-row]');
      if (!nrow) { /* the Missões tab */ }
      else if (keep !== null && V.scrolled) nrow.scrollLeft = keep;
      else {
        const first = ready[0] || Math.max(1, Math.min(MAX, L + 1)), cur = nrow.querySelector('[data-lv="' + first + '"]');
        if (cur) nrow.scrollLeft = Math.max(0, cur.offsetLeft - 24);
        V.scrolled = true;
      }
      paintArt(performance.now() / 1000);
    }

    /* ---------- the big preview of a reward ---------- */
    // the in-game look next to the icon for what has one (wearables, pets, emotes, trails, furniture, skins)
    const inGame = (it) => it && /^(shirt|head|face|neck|back|hands|pet|emote|trail|furniture|rack|terminal)$/.test(it.slot);
    function previewHtml(L) {
      const it = rewardItems(L)[0], st = stateOf(L), name = rewardName(L);
      const act = st === 'ready' ? '<button class="bp-get" type="button" data-bp-get="' + L + '">COLETAR</button>'
        : st === 'got' ? '<span class="bp-pv__st is-got">✓ Coletado' + (it ? ' · está no inventário (U)' : '') + '</span>'
        : st === 'sending' ? '<span class="bp-pv__st">Entregando…</span>'
        : '<span class="bp-pv__st is-locked"><i class="bp-lock" aria-hidden="true"></i>Chegue ao nível ' + L + ' para liberar</span>';
      return '<div class="bp-pv" data-bp-pvov role="dialog" aria-modal="true" aria-label="Prévia: ' + esc(name) + '"><div class="bp-pv__box' + (BIG[L] ? ' is-big' : '') + '">' +
        '<button class="bp-x" type="button" data-bp="pvclose" aria-label="Fechar a prévia">×</button>' +
        '<div class="bp-pv__art"><canvas data-bp-art="' + artId(L) + '" data-px="256" aria-hidden="true"></canvas>' +
        (inGame(it) ? '<span class="bp-pv__game"><canvas data-bp-game="' + it.id + '" aria-hidden="true"></canvas><small>No jogo</small></span>' : '') + '</div>' +
        '<div class="bp-pv__info"><span class="bp-pv__lv">' + (BIG[L] ? '★ PRÊMIO ESPECIAL · ' : '') + 'NÍVEL ' + L + '</span>' +
        '<h3>' + esc(name) + '</h3><div class="bp-pv__tags"><span class="bp-tag">' + esc(it ? kindName(it) : 'Moedas (Gold)') + '</span><span class="bp-tag is-t1">EXCLUSIVO T1</span></div>' +
        '<p>' + esc(it ? it.desc : GOLD + ' moedas de ouro para gastar na loja.') + '</p>' + act + '</div></div></div>';
    }
    function openPreview(L) { V.pv = L; render(); const b = el.root.querySelector('.bp-pv .bp-x'); if (b) b.focus(); }
    function closePreview() { if (!V.pv) return; const L = V.pv; V.pv = 0; render(); const c = el.root.querySelector('[data-lv="' + L + '"]'); if (c) c.focus(); }

    function paintArt(t) {
      if (!el.root) return;
      el.root.querySelectorAll('canvas[data-bp-art]').forEach((cv) => DL.paintPassCanvas(cv, cv.dataset.bpArt, t, +cv.dataset.px || 96));
      el.root.querySelectorAll('canvas[data-bp-chip]').forEach((cv) => DL.paintPassCanvas(cv, 'bp_icon_chip', t, cv.width > 100 ? 192 : 48, { fps: 2, every: 2.6 }));
      el.root.querySelectorAll('canvas[data-bp-game]').forEach((cv) => { const it = DL.cosmetic(cv.dataset.bpGame); if (it && inventory.drawArt) inventory.drawArt(cv, it, t, true); });
    }
    let last = 0;
    function animate(now) {
      V.raf = 0;
      if (!V.open) return;
      if (now - last > 100) { last = now; paintArt(now / 1000); }
      V.raf = requestAnimationFrame(animate);
    }
    function open() {
      if (!el.ov) return;
      V.open = true;
      V.scrolled = false;
      V.pv = 0;
      V.tab = 'rewards';
      V.help = false;
      if (inventory.close) inventory.close();
      render();
      el.ov.classList.add('is-open');
      if (game.keysReset) game.keysReset();
      if (!V.raf) V.raf = requestAnimationFrame(animate);
      if (remote()) pull();
    }
    function close() {
      V.open = false;
      V.pv = 0;
      if (el.ov) el.ov.classList.remove('is-open');
      if (el.ov && el.ov.contains(document.activeElement)) document.activeElement.blur();
    }
    if (el.root) {
      el.root.addEventListener('click', (ev) => {
        const get = ev.target.closest('[data-bp-get]');
        if (get) { collect([+get.dataset.bpGet]); return; }
        // a click anywhere else closes the "?" window
        if (V.help && !ev.target.closest('.bp-help')) { V.help = false; render(); }
        const tab = ev.target.closest('[data-bp-tab]');
        if (tab) { if (V.tab !== tab.dataset.bpTab) { V.tab = tab.dataset.bpTab; V.help = false; render(); } return; }
        const b = ev.target.closest('[data-bp]');
        if (b) {
          const row = el.root.querySelector('[data-bp-row]');
          if (b.dataset.bp === 'help') { V.help = !V.help; render(); const q = el.root.querySelector('.bp-q'); if (q) q.focus(); }
          else if (b.dataset.bp === 'close') close();
          else if (b.dataset.bp === 'activate') activate();
          else if (b.dataset.bp === 'all') collect(readyLevels());
          else if (b.dataset.bp === 'pvclose') closePreview();
          else if (b.dataset.bp === 'left' && row) row.scrollBy({ left: -row.clientWidth * 0.8, behavior: 'smooth' });
          else if (b.dataset.bp === 'right' && row) row.scrollBy({ left: row.clientWidth * 0.8, behavior: 'smooth' });
          return;
        }
        if (ev.target.closest('[data-bp-pvov]')) { if (!ev.target.closest('.bp-pv__box')) closePreview(); return; }
        const pv = ev.target.closest('[data-bp-pv]');
        if (pv) openPreview(+pv.dataset.bpPv);
      });
      el.root.addEventListener('keydown', (ev) => {
        const pv = ev.target.closest && ev.target.closest('[data-bp-pv]');
        if (pv && (ev.key === 'Enter' || ev.key === ' ')) { ev.preventDefault(); openPreview(+pv.dataset.bpPv); }
      });
    }
    if (el.ov) el.ov.addEventListener('pointerdown', (ev) => { if (ev.target === el.ov) close(); });
    if (el.btn) el.btn.addEventListener('click', () => { el.btn.blur(); if (V.open) close(); else open(); });

    /* ---------- celebrations ---------- */
    // a layer of its own over everything (the pass window included)
    const fx = document.createElement('div');
    fx.className = 'bpfx';
    fx.hidden = true;
    document.body.appendChild(fx);
    let fxRaf = 0, fxDone = null;
    function fxPaint(now) {
      fxRaf = 0;
      if (fx.hidden) return;
      const t = now / 1000;
      fx.querySelectorAll('canvas[data-bp-art]').forEach((cv) => DL.paintPassCanvas(cv, cv.dataset.bpArt, t, +cv.dataset.px || 128));
      fx.querySelectorAll('canvas[data-bp-chip]').forEach((cv) => DL.paintPassCanvas(cv, 'bp_icon_chip', t, 192, { fps: 3, every: 1.4 }));
      fxRaf = requestAnimationFrame(fxPaint);
    }
    function fxShow(html, opts) {
      clearTimeout(V.fxT);
      fx.innerHTML = html + '<canvas class="bpfx__confetti" aria-hidden="true"></canvas>';
      fx.className = 'bpfx' + (opts.modal ? ' is-modal' : '');
      fx.hidden = false;
      fxDone = opts.done || null;
      if (opts.confetti) confetti(fx.querySelector('.bpfx__confetti'), opts.confetti, opts.ms || 3600);
      if (!fxRaf) fxRaf = requestAnimationFrame(fxPaint);
      if (opts.auto) V.fxT = setTimeout(fxHide, opts.auto);
      const b = fx.querySelector('button');
      if (b) setTimeout(() => b.focus(), 50);
    }
    function fxHide() {
      clearTimeout(V.fxT);
      if (fx.hidden) return;
      fx.classList.add('is-out');
      setTimeout(() => { fx.hidden = true; fx.innerHTML = ''; const d = fxDone; fxDone = null; if (d) d(); }, 260);
    }
    fx.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-bpfx]');
      if (b && b.dataset.bpfx === 'pass') { fxHide(); if (!V.open) open(); return; }
      if (b || (fx.classList.contains('is-modal') && !ev.target.closest('.bpfx__card'))) fxHide();
    });
    // ATIVAR PASSE – GRÁTIS: the screen dims, the chip turns and shines, confetti, the big text, BORA!
    function showActivation() {
      fxShow('<div class="bpfx__dim"></div><div class="bpfx__card is-act" role="dialog" aria-modal="true" aria-label="Passe ativado">' +
        '<span class="bpfx__rays" aria-hidden="true"></span><span class="bpfx__chip"><canvas data-bp-chip aria-hidden="true"></canvas></span>' +
        '<b class="bpfx__big">PARABÉNS!</b><b class="bpfx__mid">PASSE BOOT INICIAL ATIVADO</b>' +
        '<span class="bpfx__small">Temporada 1 · Itens exclusivos que nunca voltam</span>' +
        '<button class="bp-cta" type="button" data-bpfx="ok">BORA!</button></div>', { modal: true, confetti: 160, ms: 4200 });
    }
    // a level reached: the small one (golden glow + NÍVEL X! + the item) or, on a ★ level, the big one
    function celebrate(L) {
      V.queue.push(L);
      // (on the next tick: the levels reached together are shown together)
      if (!V.showing) { V.showing = true; setTimeout(nextUp, 0); }
    }
    // several levels at once (a weekly mission, the server catching up) show as one: the highest ★ level
    // if there is one, else the highest level, with how many there were
    function nextUp() {
      const Ls = V.queue.splice(0);
      if (!Ls.length) { V.showing = false; return; }
      V.showing = true;
      const stars = Ls.filter((l) => BIG[l]), L = stars.length ? Math.max(...stars) : Math.max(...Ls), it = rewardItems(L)[0];
      const more = Ls.length > 1 ? '<span class="bpfx__more">+' + (Ls.length - 1) + (Ls.length > 2 ? ' outros níveis' : ' outro nível') + '</span>' : '';
      const art = '<canvas data-bp-art="' + artId(L) + '" data-px="' + (BIG[L] ? 192 : 112) + '" aria-hidden="true"></canvas>';
      const go = signed() ? 'Abra o passe (J) e clique em COLETAR' : 'Pronto para coletar no passe (J)';
      game.sfx('levelup');
      if (BIG[L]) {
        fxShow('<div class="bpfx__dim is-soft"></div><div class="bpfx__card is-star" role="dialog" aria-label="Prêmio especial do nível ' + L + '">' +
          '<span class="bpfx__rays" aria-hidden="true"></span><span class="bpfx__tag">★ PRÊMIO ESPECIAL ★</span><b class="bpfx__big">NÍVEL ' + L + '!</b>' +
          '<span class="bpfx__art">' + art + '</span><b class="bpfx__name">' + esc(rewardName(L)) + '</b><span class="bpfx__small">' + esc(it ? kindName(it) : 'Moedas') + ' · Exclusivo T1</span>' + more +
          '<span class="bpfx__acts"><button class="bp-cta" type="button" data-bpfx="pass">VER NO PASSE</button><button class="bp-ghost" type="button" data-bpfx="ok">Fechar</button></span></div>',
        { modal: true, confetti: 120, ms: 3800, auto: 7000, done: () => setTimeout(nextUp, 200) });
      } else {
        fxShow('<div class="bpfx__card is-small" role="status"><span class="bpfx__glow" aria-hidden="true"></span><b class="bpfx__big">NÍVEL ' + L + '!</b>' +
          '<span class="bpfx__art">' + art + '</span><b class="bpfx__name">' + esc(rewardName(L)) + '</b>' + more + '<span class="bpfx__small">' + go + '</span></div>',
        { auto: 3000, done: () => setTimeout(nextUp, 200) });
      }
      if (V.open) render();
    }

    load(KEY);
    paintButton();
    // the account arriving (or leaving) switches whose pass this is
    if (DL.Cloud) DL.Cloud.on('auth', () => setTimeout(account, 0));
    // (after the listener that switches the inventory to the account's: cloud-sync.js runs right after this)
    if (DL.InventoryService) DL.InventoryService.onState(() => { if (DL.Cloud.signedIn && !V.synced) setTimeout(account, 0); });
    setTimeout(account, 0);
    addEventListener('pagehide', () => { if (remote() && (S.pend || S.pendM.length)) sync(); });

    const api = {
      open, close, update, sync, activate, collect: (L) => collect([].concat(L)), collectAll: () => collect(readyLevels()),
      // (a modal celebration takes the keys too; the small level-up one never blocks the game)
      get isOpen() { return V.open || (!fx.hidden && fx.classList.contains('is-modal')); },
      key(ev) {
        if (ev.code !== 'Escape') return false;
        if (!fx.hidden && fx.classList.contains('is-modal')) fxHide();
        else if (V.pv) closePreview();
        else if (V.help) { V.help = false; render(); }
        else close();
        return true;
      },
      get level() { return level(); },
      get xp() { return S.xp; },
      get delivered() { return S.got; },
      get activated() { return S.on; },
      get boost() { return S.boost; },
      get active() { return active(); },
      levelOf, stateOf,
      // the XP bonus is used from the inventory: only while the season is on
      canBoost: () => (active() ? null : 'A temporada do passe terminou'),
      myTitle: () => equippedValue('title'),
      myIcon: () => equippedValue('icon'),
      // exposed for automated checks
      _: { S: () => S, addXp, count, settleLocal, missions: current, applyServer, celebrate, fxHide },
    };
    DL.Pass = api;
    return api;
  };
})();
