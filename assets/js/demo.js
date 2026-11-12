/* DataLab — playable demo: the player starts from an empty lot and builds their own datacenter.
   Wires the scene, build mode, crew and tutorial together; handles input, panels and the HUD. */
(function () {
  'use strict';
  const DL = window.DL, T = DL.T;
  const $ = (id) => document.getElementById(id);

  const game = $('game');
  const canvas = $('world');
  const narrow = () => innerWidth < 768;
  const world = DL.newWorld();
  // iso: the isometric 2.5D camera (iso.js); the simulation underneath stays on the tile grid
  const scene = new DL.Scene(canvas, { world, renderFloor: DL.renderRooms, tilesWide: narrow() ? 10 : 21, minTilesHigh: 11, padTop: narrow() ? 120 : 96, iso: true });
  const W = scene.world;
  const player = scene.addPlayer(DL.LOOKS.player, W.spawn.x, W.spawn.y, 'down');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  const S = {
    phase: 'intro',
    mode: 'explore',
    time: 0,
    panel: null,
    target: null,
    walked: 0,
    liveAcc: 0,
  };

  const WHY = {
    rack: 'Racks agrupam servidores e switches. Cada um puxa ar frio pela frente e devolve ar quente por trás.',
    storage: 'O storage guarda os dados que os servidores usam, acessado pela rede como se fosse um disco local.',
    crac: 'A refrigeração de precisão mantém a sala estável. Cada grau a mais custa energia e vida útil do hardware.',
    desk: 'A estação de trabalho é onde a equipe opera o datacenter.',
  };

  /* ---------------- helpers ---------------- */
  const clockAt = (s) => {
    const m = 8 * 60 + Math.floor(s);
    return String(Math.floor(m / 60) % 24).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  };
  const fmtPower = (e) => (e.tel.unit === 'W' ? Math.round(e.power) : e.power.toFixed(e.power < 10 ? 2 : 1)) + '<small>' + e.tel.unit + '</small>';
  const isOverlayOpen = () => ['intro', 'help', 'creator', 'terminal', 'cabling', 'monitor', 'wallet', 'reward', 'roles', 'helpdesk', 'netlab', 'infra', 'shifts', 'store', 'inventory', 'account', 'mpDialog', 'welcome', 'feedback', 'agentsOv', 'passOv'].some((id) => $(id) && $(id).classList.contains('is-open'));
  const canMove = () => S.phase !== 'intro' && !isOverlayOpen() && S.mode === 'explore';

  /* ---------------- toasts ---------------- */
  // Notifications sit in the bottom-right corner (demo.css .toasts), at most TOAST_MAX at a time: the same
  // message again only restarts its timer instead of stacking a copy. Warnings stay a little longer.
  const TOAST_MAX = 2;
  const TOAST_MS = { warn: 6500, ok: 4000, info: 4000 };
  function toast(tone, label, text) {
    const box = $('toasts');
    const key = tone + '|' + label + '|' + text;
    const same = Array.from(box.children).find((x) => x.dataset.key === key && !x.classList.contains('is-out'));
    if (same) { clearTimeout(same._t); same._t = setTimeout(() => toastOut(same), TOAST_MS[tone] || TOAST_MS.info); return; }
    DL.audio.play(tone === 'warn' ? 'warn' : tone === 'ok' ? 'ok' : 'tick');
    const el = document.createElement('div');
    el.className = 'toast toast--' + tone;
    el.dataset.key = key;
    el.innerHTML = '<span class="dot ' + (tone === 'warn' ? 'dot--warn dot--live' : tone === 'ok' ? '' : 'dot--info') + '"></span><b>' + label + '</b><span>' + text + '</span>';
    if (tone === 'info') el.querySelector('.dot').style.background = 'var(--breeze)';
    box.appendChild(el);
    while (box.children.length > TOAST_MAX) box.firstChild.remove();
    el._t = setTimeout(() => toastOut(el), TOAST_MS[tone] || TOAST_MS.info);
  }
  function toastOut(el) {
    el.classList.add('is-out');
    setTimeout(() => el.remove(), 400);
  }

  /* ---------------- build + crew + tutorial wiring ---------------- */
  const handlers = {};
  const G = {
    scene, player, toast, root: game,
    wanderers: false,
    sfx: (name) => DL.audio.play(name),
    lockReason: () => null,
    actors: () => [player].concat(scene.npcs, crew ? crew.members : []),
    on(ev, fn) { (handlers[ev] = handlers[ev] || []).push(fn); },
    emit(ev, info) { (handlers[ev] || []).forEach((fn) => fn(info)); },
    mode: () => S.mode,
    setMode: (m) => setMode(m),
    setCursor: (c) => setCursor(c),
    focus(x, y) { scene.cam.x = x; scene.cam.y = y; },
    keysReset: () => keys.clear(),
    clock: () => clockAt(S.time),
    // game minutes since the session started (the clock starts at 08:00 = 480)
    time: () => S.time,
    clockStart: 8 * 60,
    paused: () => S.phase === 'intro' || (tutorial && tutorial.active && tutorial.step < tutorial.total - 1),
    opsOpen: () => !$('opsPanel').hidden,
    reach: (d, host) => ops.reach(d, host),
    flash(e) { S.flash = { e, until: S.time + 2.5 }; },
    onTerminalClose() { canvas.focus && canvas.blur(); },
    peer(d, port) {
      const l = ops.linkAt(d.key, port);
      if (!l) return '';
      const o = l.a.dev === d.key && l.a.port === port ? l.b : l.a;
      const od = ops.get(o.dev);
      return od ? od.name.toLowerCase() + (od.kind === 'patch' ? '-' + o.port : '') : '';
    },
    openCabling(d) { cabling.open(d.rack, d, { back: d }); },
    // the player's name / colour in the team chat
    playerInfo() { const p = crew.playerProfile, r = DL.ROLES[p.role] || {}; return { name: p.name, color: r.color || '#ffffff' }; },
    playerSeat: null,
    // multiplayer.js, while playing in someone else's room: { update(dt) }
    guest: null,
  };
  let crew = null, tutorial = null;
  const builder = DL.createBuilder(G);
  G.builder = builder;
  const decor = DL.createDecor(G, builder);
  crew = DL.createCrew(G);
  const terminal = DL.createTerminal(G);
  DL.devHooks = { terminal }; // DEV-AUTOPLAY: o botão Auto (assets/js/dev/dev-autoplay.js) usa este console
  // DEV-AUTOPLAY: carrega o botão Auto para todos (?dev=0 desliga, lembrado; ?dev=1 religa). Fica aqui e não inline no jogo.html por causa da CSP (script-src 'self')
  (function () { const q = /[?&]dev=([01])(&|$)/.exec(location.search); let on = q ? q[1] === '1' : true; try { if (q) localStorage.setItem('datalab.dev', q[1]); const f = localStorage.getItem('datalab.dev'); if (!q && f) on = f === '1'; } catch (e) { /* storage blocked: the URL / host decide */ } if (on && !/[?&]hero/.test(location.search)) document.body.appendChild(Object.assign(document.createElement('script'), { src: 'assets/js/dev/dev-autoplay.js' })); })(); // DEV-AUTOPLAY
  const opsSys = { terminal, crew };
  const ops = DL.createOps(G, opsSys);
  G.ops = ops;
  const cabling = DL.createCabling(G, { ops });
  // the data flow on the floor (dataflow.js): lights running from each online server's rack to its switch's rack
  const dataflow = DL.createDataflow ? DL.createDataflow(G, { ops, reduced }) : null;
  const monitor = DL.createMonitor(G, { ops, cabling });
  opsSys.cabling = cabling;
  opsSys.monitor = monitor;
  const tutSys = { builder, crew, ops, terminal, cabling, monitor };
  tutorial = DL.createTutorial(G, tutSys);
  const economy = DL.createEconomy(G, { ops, crew });
  G.economy = economy;
  // the incident director paces faults and broken hardware: one problem at a time (director.js)
  const director = DL.createDirector(G, { ops });
  G.director = director;
  // the blackout (blackout.js): a rare power cut, paced by the director; only the host runs it
  const blackout = DL.createBlackout ? DL.createBlackout(G, { ops, director, dataflow, reduced, playing: () => S.phase === 'play' && !G.guest }) : null;
  // the player's level: one mission per level; bots work alone only below it (career.js)
  const career = DL.createCareer(G, { ops, crew });
  G.career = career;
  // career problems: sorted out over time for the player's rank, solved for XP (problems.js)
  const problems = DL.createProblems(G, { ops, terminal, cabling, career, crew });
  G.problems = problems;
  const talk = DL.createTalk(G, { crew, ops, economy, cabling });
  const roles = DL.createRoles(G, { crew });
  // H / L open the apps only when nothing else is on screen
  G.canHotkey = () => S.phase !== 'intro' && !isOverlayOpen() && !crew.creatorOpen;
  const helpdesk = DL.createHelpdesk(G, { crew });
  G.helpdesk = helpdesk;
  const netlab = DL.createNetLab(G);
  // the company layer: maintenance, work orders, reception visitors, talking in the team chat
  const staff = DL.createStaff(G, { crew, ops, talk });
  G.staff = staff;
  // working hours, custom schedules and on-call cover (shifts.js)
  const shifts = DL.createShifts(G, { crew });
  // real tasks run by AI agents (OpenCode) on the Agent Gateway; absent = the crew works as before (agents.js)
  // OFF unless config.js sets crewAI: true (the code stays, nothing shows and nothing runs)
  const aiOn = !!(window.DATALAB_CONFIG && window.DATALAB_CONFIG.crewAI === true);
  const agents = aiOn && DL.createCrewAI && DL.AgentService ? DL.createCrewAI(G, { crew }) : null;
  G.agents = agents;
  // always reachable: top bar + team panel (opens the selected employee, or a list to pick one)
  if (agents) for (const id of ['aiBtn', 'aiTeamBtn']) if ($(id)) { $(id).hidden = false; $(id).addEventListener('click', () => { $(id).blur(); agents.open(crew.selected || null); }); }
  $('shiftsBtn').addEventListener('click', () => { $('shiftsBtn').blur(); shifts.open(); });
  G.on('payday', () => updateMeta());
  // sounds for money, levels and milestones (the sound bank is in audio.js)
  let heardLevel = null;
  G.on('wallet', (w) => { if (w.amount) DL.audio.play(w.amount > 0 ? 'coin' : 'buy'); });
  G.on('payday', () => DL.audio.play('coin'));
  G.on('career', (k) => { if (heardLevel !== null && k.level > heardLevel) DL.audio.play('levelup'); heardLevel = k.level; });
  G.on('datacenter-done', () => DL.audio.play('fanfare'));
  document.addEventListener('click', (ev) => { if (ev.target.closest && ev.target.closest('button')) DL.audio.play('click'); }, true);
  // server specialisations + virtualization (Infra, I)
  const infra = DL.createInfra(G, { ops });
  tutSys.infra = infra;
  // inventory + shop: skins, clothes, special items, legendary bots — paid in Gold (inventory.js)
  const inventory = DL.createInventory(G, { crew, economy, playing: () => S.phase === 'play' });
  G.store = { open: (tab) => inventory.openShop(tab), inventory: (id) => inventory.openInventory(id) };
  $('storeBtn').addEventListener('click', () => { $('storeBtn').blur(); inventory.openShop(); });
  $('invBtn').addEventListener('click', () => { $('invBtn').blur(); inventory.openInventory(); });
  // the equipped pet follows the player (pets.js); the three free emotes, keys 1 / 2 / 3 (emotes.js)
  const pet = DL.createPet(G);
  const emotes = DL.createEmotes(G, player, {
    can: () => (S.phase === 'intro' ? 'Comece um jogo para usar os emotes'
      : P.seat || P.rest || P.glide ? 'Levante-se (F) para usar os emotes' : !canMove() ? 'Saia do modo construção / equipe para usar os emotes' : null),
    onChange: (em) => G.emit('player-emote', em ? em.id : null), // the other players see it too (multiplayer.js)
  });
  // the walking trail (Rastros, trails.js) and the season pass (battlepass.js)
  const trails = DL.createTrails ? DL.createTrails(G) : null;
  const pass = DL.createPass ? DL.createPass(G, { inventory, economy, crew, playing: () => S.phase === 'play' }) : null;
  const emoteWheel = $('emoteWheel');
  // the free emotes + the ones the player owns (Invasão, from the season pass)
  const fillWheel = () => { emoteWheel.innerHTML = DL.EMOTES.filter((e) => !DL.emoteOwned || DL.emoteOwned(e)).map((e) => '<button type="button" class="emo__opt" role="menuitem" data-emote="' + e.id + '"><span class="emo__ico" aria-hidden="true">' + e.emoji + '</span>' + e.name + ' <kbd>' + e.key + '</kbd></button>').join(''); };
  fillWheel();
  G.on('inventory', fillWheel);
  const wheel = (open) => {
    if (open) { const r = $('emoteBtn').getBoundingClientRect(); emoteWheel.style.left = Math.max(8, Math.min(r.left, innerWidth - 184)) + 'px'; emoteWheel.style.top = r.bottom + 6 + 'px'; }
    emoteWheel.hidden = !open;
    $('emoteBtn').setAttribute('aria-expanded', String(open));
  };
  $('emoteBtn').addEventListener('click', () => { $('emoteBtn').blur(); wheel(emoteWheel.hidden); });
  emoteWheel.addEventListener('click', (ev) => { const b = ev.target.closest('[data-emote]'); if (!b) return; wheel(false); b.blur(); emotes.play(b.dataset.emote); });
  addEventListener('pointerdown', (ev) => { if (!emoteWheel.hidden && !ev.target.closest('.emo')) wheel(false); });

  // top bar groups: one button opens a block with that group's options; the group button
  // sums the badges inside it and lights up when one of them is on or alerting
  const groups = Array.from(document.querySelectorAll('.hud-group'));
  const setGroup = (g, on) => {
    g.classList.toggle('is-open', on);
    g.querySelector('.hud-group__btn').setAttribute('aria-expanded', on ? 'true' : 'false');
  };
  const closeGroups = () => groups.forEach((g) => setGroup(g, false));
  groups.forEach((g) => {
    const btn = g.querySelector('.hud-group__btn'), menu = g.querySelector('.hud-group__menu');
    const badge = btn.querySelector('.hud-group__badge');
    btn.addEventListener('click', () => {
      const on = !g.classList.contains('is-open');
      closeGroups();
      setGroup(g, on);
      btn.blur();
    });
    menu.addEventListener('click', (ev) => {
      const item = ev.target.closest('button');
      if (item && !item.hasAttribute('data-keep')) setGroup(g, false);
    });
    const sync = () => {
      const items = Array.from(menu.querySelectorAll(':scope > .btn'));
      btn.classList.toggle('is-on', items.some((b) => b.classList.contains('is-on')));
      btn.classList.toggle('is-alert', items.some((b) => b.classList.contains('is-alert')));
      if (!badge) return;
      const n = Array.from(menu.querySelectorAll('.ops-badge')).reduce((sum, b) => sum + (b.hidden ? 0 : parseInt(b.textContent, 10) || 0), 0);
      badge.hidden = n <= 0;
      badge.textContent = n > 99 ? '99+' : String(n);
    };
    // (many small changes in a row — badges, timers — make one check, not one each)
    let syncT = 0;
    new MutationObserver(() => { if (!syncT) syncT = setTimeout(() => { syncT = 0; sync(); }, 120); })
      .observe(menu, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'hidden'] });
    sync();
  });
  document.addEventListener('pointerdown', (ev) => { if (!ev.target.closest('.hud-group')) closeGroups(); }, true);
  addEventListener('keydown', (ev) => {
    if (ev.code !== 'Escape' || !groups.some((g) => g.classList.contains('is-open'))) return;
    closeGroups();
    ev.preventDefault();
    ev.stopImmediatePropagation();
  }, true);
  G.on('world', () => {
    if (S.panel && W.items.indexOf(S.panel) < 0) closePanel();
    buildLabels();
    buildMinimap();
    updateMeta();
  });

  function updateMeta() {
    const n = W.rooms.length, racks = W.items.filter((e) => e.kind === 'rack').length;
    $('hudMeta').textContent = 'Meu datacenter · mês ' + economy.company.month + ' · ' + n + (n === 1 ? ' sala' : ' salas') + ' · ' + racks + (racks === 1 ? ' rack' : ' racks');
  }

  /* ---------------- equipment panel ---------------- */
  const panel = $('panel');
  const inner = $('panelInner');

  function subOf(e) {
    switch (e.kind) {
      case 'rack': return e.name + ' · ' + e.servers.length + (e.servers.length === 1 ? ' unidade' : ' unidades') + ' · 42U';
      case 'storage': { const m = DL.hwModel('storage', e.model); return m.tier + ' · ' + m.usable + ' TB úteis · ' + m.raid; }
      case 'crac': return DL.cracModel ? DL.cracModel(e).name + ' · ' + DL.cracModel(e).tech : 'Insuflamento pelo piso elevado';
      case 'desk': return 'Estação de trabalho da equipe';
      default: return '';
    }
  }

  function linkOf(e) {
    switch (e.kind) {
      case 'rack': {
        const devs = ops.devices().filter((d) => d.rack === e);
        if (!devs.length) return { text: 'Sem equipamentos' };
        const sw = devs.find((d) => d.kind === 'switch');
        return sw ? { text: 'Switch ' + sw.name + ' · uplink ' + DL.hwFmt.gb(DL.hwOf(sw).uplink) } : { text: 'Sem switch neste rack' };
      }
      case 'storage': return { text: DL.hwFmt.gb(DL.hwModel('storage', e.model).net) };
      case 'crac': return { text: 'BMS · Modbus online' };
      default: return { text: '1 Gb/s · VLAN da equipe' };
    }
  }

  function metricsHtml(e) {
    const link = linkOf(e);
    const tLabel = e.kind === 'crac' ? 'Ar insuflado' : e.kind === 'desk' ? 'CPU' : 'Temperatura';
    return (
      '<div class="metrics">' +
      '<div class="metric"><span class="eyebrow-sm">' + tLabel + '</span><p class="metric__val" data-live="temp"></p><canvas data-spark="temp"></canvas></div>' +
      '<div class="metric"><span class="eyebrow-sm">Energia</span><p class="metric__val" data-live="power"></p><canvas data-spark="power"></canvas></div>' +
      '<div class="metric"><span class="eyebrow-sm">Conexão</span><p class="metric__val metric__val--sm">' + link.text + '</p></div>' +
      '<div class="metric"><span class="eyebrow-sm">Uptime</span><p class="metric__val metric__val--sm" data-live="uptime"></p></div>' +
      '</div>'
    );
  }

  function list(rows) {
    return '<ul class="list">' + rows.map((r) =>
      '<li><span class="dot"></span><span class="mono">' + (r.k || '') + '</span><span class="grow">' + r.v + '</span><span class="tag">' + (r.tag || '') + '</span></li>'
    ).join('') + '</ul>';
  }

  function detailHtml(e) {
    switch (e.kind) {
      case 'rack': {
        const devs = ops.devices().filter((d) => d.rack === e).sort((a, b) => a.slot - b.slot);
        if (!devs.length) return '<p class="callout">Rack vazio. No modo construção (<kbd>B</kbd>), escolha Servidor ou Switch e clique neste rack.</p>';
        // its temperature, where the heat comes from and the fire risk (incendio.js)
        return (DL.Fogo ? DL.Fogo.painelHtml(e) : '') + '<div class="p-sec"><span class="eyebrow-sm">Unidades</span><ul class="list units">' + devs.map((d) => {
          const bad = (d.fault && d.fault.found) || (d.state === 'online' && !ops.health(d).up) || d.broken;
          const st = d.kind === 'patch' ? 'Passagem' : d.out ? 'Na bancada' : d.broken ? 'Defeito de hardware' : bad ? 'Com falha' : ops.STATE_LABEL[d.state];
          const act = d.kind === 'patch' ? '' : d.broken ? (staff.claimed(staff.broken().find((r) => r.dev === d)) || (staff.broken().find((r) => r.dev === d) || {}).taken ? '' : '<button class="btn btn--sm btn--primary" type="button" data-act="repairdev" data-dev="' + d.key + '">Chamar técnico</button>')
            : d.state === 'new' ? '<button class="btn btn--sm" type="button" data-act="connect" data-dev="' + d.key + '">Ligar cabo</button>'
            : '<button class="btn btn--sm' + (bad || d.state === 'link' ? ' btn--primary' : '') + '" type="button" data-act="term" data-dev="' + d.key + '">Terminal</button>';
          const svc = d.kind === 'server' && DL.SVC ? ' · <b class="svc" style="color:' + DL.SVC[d.svc || 'web'].color + '">' + (d.svc ? DL.SVC[d.svc].short : 'GENÉRICO') + '</b>' : '';
          return '<li><span class="dot' + (bad ? ' dot--warn dot--live' : d.state === 'online' ? '' : ' dot--info') + '"' + (d.state !== 'online' && !bad ? ' style="background:var(--breeze)"' : '') + '></span>' +
            '<span class="mono">U' + String(40 - d.slot * 4).padStart(2, '0') + '</span><span class="grow">' + d.name + ' <small class="m">' + DL.hwOf(d).name + (d.ip ? ' · ' + d.ip : '') + svc + '</small></span>' +
            '<span class="tag' + (bad ? ' is-warn' : '') + '">' + st + '</span>' + act + '</li>';
        }).join('') + '</ul><div class="actions" style="margin-top:12px"><button class="btn btn--sm" type="button" data-act="cabling">Cabeamento do rack</button><button class="btn btn--sm" type="button" data-act="monitor">Monitor</button><button class="btn btn--sm" type="button" data-act="infra">Infra / VMs</button></div></div>';
      }
      case 'storage': {
        // volumes split the model's usable capacity; the spec sheet comes from hardware.js
        const m = DL.hwModel('storage', e.model), a = Math.round(m.usable * 0.6), b = m.usable - a;
        return '<div class="p-sec"><span class="eyebrow-sm">Volumes</span>' + list([
          { k: 'LUN0', v: 'vol-db · ' + a + ' TB', tag: '12% usado' },
          { k: 'LUN1', v: 'vol-app · ' + b + ' TB', tag: '8% usado' },
        ]) + '</div><div class="p-sec"><span class="eyebrow-sm">Especificação</span><dl class="p-spec">' +
          DL.hwSpecs('storage', m).map(([k, v]) => '<dt>' + k + '</dt><dd>' + v + '</dd>').join('') + '</dl></div>';
      }
      case 'crac':
        if (DL.Clima) return DL.Clima.painelHtml(e);
        return '<div class="p-sec"><span class="eyebrow-sm">Climatização</span>' + list([
          { k: 'RET', v: 'Ar de retorno', tag: '27,8 °C' },
          { k: 'FAN', v: 'Ventiladores', tag: '48%' },
        ]) + '</div>';
      case 'desk': {
        const st = crew.stationOf(e), u = st && crew.userOf(st), owner = st && crew.api.ownerOf(st);
        const rec = staff.broken().find((r) => r.item === e);
        let h = '';
        if (rec) h += '<p class="callout callout--warn">' + (rec.out ? 'O PC está na bancada com ' + (rec.taken ? rec.taken.crew.name : 'o técnico') + '.' : 'Este computador está com defeito de hardware.') + '</p>' + (!rec.taken && !staff.claimed(rec) ? '<div class="actions"><button class="btn btn--sm btn--primary" type="button" data-act="repair">Chamar técnico</button></div>' : '');
        if (u) {
          const r = DL.ROLES[u.crew.profile.role];
          h += '<div class="p-sec"><span class="eyebrow-sm">Em uso</span>' + list([{ k: r.name, v: u.crew.name, tag: crew.statusOf(u).split(' · ')[0] }]) + '</div>';
        } else if (!rec) h += '<p class="callout">' + (P.seat && P.seat.key === e ? 'Você está trabalhando aqui.' : 'Livre. Sente e trabalhe (<kbd>F</kbd>) ou, no modo equipe (<kbd>C</kbd>), mande alguém para cá.') + '</p>';
        if (st) {
          h += '<div class="p-sec"><label class="p-own"><span class="eyebrow-sm">Estação de</span><select data-act-sel="owner" aria-label="Dono da estação"><option value="">Ninguém (qualquer um usa)</option>' +
            crew.members.map((m) => '<option value="' + m.crew.id + '"' + (owner === m ? ' selected' : '') + '>' + m.crew.name + ' · ' + DL.ROLES[m.crew.profile.role].name + '</option>').join('') + '</select></label></div>';
          if (!u && !rec) h += '<div class="actions"><button class="btn btn--sm btn--primary" type="button" data-act="sit">' + (P.seat && P.seat.key === e ? 'Levantar' : 'Sentar e trabalhar') + ' <kbd>F</kbd></button></div>';
        }
        return h;
      }
    }
    return '';
  }

  function rackAlert(e) {
    if (e.kind !== 'rack') return null;
    const devs = ops.devices().filter((d) => d.rack === e);
    const bad = devs.filter((d) => d.fault || d.broken).length, pend = devs.filter((d) => d.state !== 'online').length;
    return bad ? bad + (bad === 1 ? ' equipamento com falha' : ' equipamentos com falha') : pend ? pend + ' aguardando configuração' : null;
  }

  function renderPanel() {
    const e = S.panel;
    if (!e) return;
    inner.innerHTML =
      '<div class="p-head"><div><span class="eyebrow-sm">' + e.category + '</span><h2 class="p-title" id="panelTitle">' + e.id + '</h2><p class="p-sub">' + subOf(e) + '</p></div>' +
      '<button class="btn p-close" type="button" data-act="close" aria-label="Fechar painel">×</button></div>' +
      (rackAlert(e) ? '<span class="status status--warn"><span class="dot dot--warn dot--live"></span>' + rackAlert(e) + '</span>' : '<span class="status status--ok"><span class="dot"></span>Operacional</span>') +
      (e.tel ? metricsHtml(e) : '') +
      detailHtml(e) +
      (WHY[e.kind] ? '<p class="why"><b>Por que importa.</b> ' + WHY[e.kind] + '</p>' : '');
    updateLive();
  }

  function spark(cv, data) {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = cv.clientWidth, h = cv.clientHeight;
    if (!w) return;
    if (cv.width !== Math.round(w * dpr)) {
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(h * dpr);
    }
    const g = cv.getContext('2d');
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, w, h);
    let lo = Math.min.apply(null, data), hi = Math.max.apply(null, data);
    const pad = (hi - lo) * 0.2 || 0.5;
    lo -= pad;
    hi += pad;
    const X = (i) => (i / (data.length - 1)) * (w - 3);
    const Y = (v) => h - 2 - ((v - lo) / (hi - lo)) * (h - 4);
    g.beginPath();
    data.forEach((v, i) => (i ? g.lineTo(X(i), Y(v)) : g.moveTo(X(i), Y(v))));
    g.strokeStyle = 'rgba(255,255,255,0.75)';
    g.lineWidth = 1.25;
    g.lineJoin = 'round';
    g.stroke();
    g.lineTo(X(data.length - 1), h);
    g.lineTo(0, h);
    g.closePath();
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.fill();
    g.fillStyle = '#fff';
    g.beginPath();
    g.arc(X(data.length - 1), Y(data[data.length - 1]), 2, 0, Math.PI * 2);
    g.fill();
  }

  function updateLive() {
    const e = S.panel;
    if (!e || !e.tel) return;
    const temp = inner.querySelector('[data-live="temp"]');
    if (temp) temp.innerHTML = e.temp.toFixed(1) + '<small>°C</small>';
    const pw = inner.querySelector('[data-live="power"]');
    if (pw) pw.innerHTML = fmtPower(e);
    const up = inner.querySelector('[data-live="uptime"]');
    if (up) up.textContent = Math.max(1, Math.floor(S.time / 60)) + ' min';
    inner.querySelectorAll('[data-spark]').forEach((cv) => spark(cv, e.hist[cv.dataset.spark]));
  }

  function openPanel(e) {
    S.panel = e;
    panel.classList.add('is-open');
    panel.setAttribute('aria-hidden', 'false');
    inner.scrollTop = 0;
    const b = e.bounds;
    player.dir = DL.dirOf(b.x + b.w / 2 - player.x, b.y + b.h - 6 - player.y);
    renderPanel();
  }

  function closePanel() {
    if (!S.panel) return;
    S.panel = null;
    panel.classList.remove('is-open');
    panel.setAttribute('aria-hidden', 'true');
    if (panel.contains(document.activeElement)) document.activeElement.blur();
  }

  inner.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'close') closePanel();
    if (b.dataset.act === 'cabling' && S.panel) { cabling.open(S.panel, null); return; }
    if (b.dataset.act === 'monitor') { monitor.open('dash'); return; }
    if (b.dataset.act === 'infra') { closePanel(); infra.open('servers'); return; }
    if (b.dataset.act === 'sit' && S.panel) { const s = crew.stationOf(S.panel); if (P.seat && s && P.seat.key === s.key) seatStand(); else seatDown(s); return; }
    if (b.dataset.act === 'repair' && S.panel) {
      const rec = staff.broken().find((r) => r.item === S.panel);
      if (rec) callTech(rec);
      renderPanel();
      return;
    }
    const d = ops.devices().find((x) => x.key === b.dataset.dev);
    if (!d) return;
    if (b.dataset.act === 'connect') cabling.open(d.rack, d);
    else if (b.dataset.act === 'term') ops.openTerminal(d);
    else if (b.dataset.act === 'repairdev') { const rec = staff.broken().find((r) => r.dev === d); if (rec) callTech(rec); renderPanel(); }
  });
  inner.addEventListener('change', (ev) => {
    const s = ev.target.closest('[data-act-sel="owner"]');
    if (!s || !S.panel) return;
    const st = crew.stationOf(S.panel);
    const m = crew.members.find((x) => x.crew.id === +s.value);
    if (st) {
      if (m) { crew.api.setHome(m, st.key); toast('ok', 'Estação', crew.api.stationName(st) + ' agora é de ' + m.crew.name); }
      else { const o = crew.api.ownerOf(st); if (o) crew.api.setHome(o, null); toast('info', 'Estação', crew.api.stationName(st) + ' liberada para qualquer um'); }
    }
    s.blur();
    renderPanel();
  });
  inner.addEventListener('keydown', (ev) => { if (ev.target.tagName === 'SELECT') ev.stopPropagation(); });

  // the player asks for a repair: it becomes a work order (the manager's queue, or straight to a technician)
  function callTech(rec) {
    const o = staff.createOrder('repair', rec, { byName: crew.playerProfile.name });
    if (o) toast('info', 'Ordem #' + o.id, o.title + (o.assignee ? ' · ' + o.assignee.crew.name + ' a caminho' : ' · aguardando um técnico'));
    else toast('info', 'Manutenção', 'Já existe uma ordem para o ' + rec.label);
  }

  function interact() {
    if (!canMove()) return;
    const t = S.target;
    if (!t) return;
    if (t.exit) { DL.Street.use(t); return; } // the doors to the street and the shops, the shop sellers (street.js, lojas.js)
    if (t.fogo) { t.use(); return; } // the extinguisher on a burning rack (incendio.js)
    if (t.crew) { crew.inspect(t); gesture('wave', 0.9); player.dir = DL.dirOf(t.x - player.x, t.y - player.y); }
    else if (usable(t)) useObject(t);
    else if (S.panel === t) closePanel();
    else { openPanel(t); gesture('reach', 0.6); }
  }

  /* ---------------- my character: sit, work, talk, interact ---------------- */
  // rest: on a sofa / pouf / loose chair · use: an object being used (TV, board, coffee machine…) · held: a cup / can / snack
  const P = { seat: null, glide: null, pose: 'R', poseT: 0, phase: 'type', phaseT: 2, act: null, actT: 0, talkT: 0, rest: null, use: null, held: null };

  // objects the player can use directly (interact.js); equipment with a panel keeps its panel
  const usable = (e) => !!(e && !e.crew && !e.id && DL.Interact && DL.Interact.of(e));
  function useObject(e) {
    const af = DL.Interact.of(e);
    closePanel();
    if (af.type === 'rest') {
      const s = DL.Interact.freeSeat(e, W, player, player);
      if (!s) { toast('info', DL.itemName(e), 'Todos os lugares estão ocupados'); return; }
      DL.Interact.claim(e, s.k, player);
      P.rest = s;
      P.glide = { from: { x: player.x, y: player.y }, to: s.sit, t: 0, dur: 0.3, sit: true };
      player.vx = player.vy = 0;
      player.moving = false;
      player.seated = true;
      player.noShadow = true;
      player.sortKey = s.sortKey;
      return;
    }
    if (af.type !== 'drink' && !DL.Interact.freeUse(e, player)) { toast('info', DL.itemName(e), 'Alguém já está usando'); return; }
    const sp = DL.Interact.standPoint(e, W);
    const ex = (e.host || e).px + (e.tw || 1) * 8, ey = (e.host || e).py + (e.th || 1) * 8;
    player.dir = sp && Math.hypot(sp.x - player.x, sp.y - player.y) < 14 ? sp.dir : DL.dirOf(ex - player.x, ey - player.y);
    const dur = af.type === 'drink' ? af.fill || 1.4 : af.dur[0] + Math.random() * (af.dur[1] - af.dur[0]);
    if (af.type !== 'drink') DL.Interact.claim(e, 'use', player);
    P.use = { e, af, left: dur, total: dur };
    if (af.type === 'drink') { e.busy = true; DL.audio.fill(e.kind); }
    if (af.anim === 'reach' || af.type === 'drink') gesture('reach', dur);
    player.bubble = { text: af.type === 'watch' ? '📺' : af.type === 'drink' ? '…' : '✍️', left: Math.min(2.5, dur), tone: 'chat' };
  }
  function stopUse(done) {
    const u = P.use;
    if (!u) return;
    P.use = null;
    u.e.busy = false;
    P.actT = 0;
    if (u.af.type !== 'drink') DL.Interact.release(player);
    if (done && u.af.type === 'drink') {
      // something to drink / eat for a while: sips now and then, gone after a few
      const what = DL.Interact.cupOf(u.af);
      P.held = { what, left: what === 'food' || what === 'snack' ? 8 : 16, sipT: 1.2 };
      player.bubble = { text: { coffee: '☕', tea: '🍵', water: '💧', soda: '🥤', snack: '🍪', food: '🍱' }[what] || '☕', left: 1.6, tone: 'chat' };
    }
    if (done && u.af.type !== 'drink' && Math.random() < 0.5) { const line = DL.Interact.sayFor(u.af); if (line) player.bubble = { text: line, left: 3, tone: 'chat' }; }
  }
  function restStand() {
    const s = P.rest;
    if (!s || (P.glide && !P.glide.sit)) return;
    P.glide = { from: { x: player.x, y: player.y }, to: s.onTile ? s.sit : s.fromPt, t: 0, dur: 0.25, sit: false };
    player.seated = false;
    player.noShadow = false;
    player.sortKey = null;
    player.dir = 'down';
  }
  function updateUse(dt, moving) {
    if (P.held) {
      P.held.left -= dt;
      const was = P.held.sipT;
      P.held.sipT -= dt;
      if (was > 0 && P.held.sipT <= 0) DL.audio.sip(P.held.what); // the cup reaches the mouth
      if (P.held.sipT <= -0.9) P.held.sipT = 1.6 + Math.random();
      if (P.held.left <= 0) P.held = null;
    }
    if (!P.use) return;
    // walking away ends it; a drink in progress still lands in the hand
    if (moving || W.items.indexOf(P.use.e) < 0) { stopUse(P.use.af.type === 'drink' && P.use.left < P.use.total * 0.4); return; }
    P.use.left -= dt;
    if (P.use.left <= 0) stopUse(true);
  }
  function gesture(kind, t) { P.act = kind; P.actT = t; }
  G.on('team-say', () => { P.talkT = 1.6; });
  G.on('player-talk', () => { P.talkT = 1.4; });

  function nearestSeat() {
    let best = null, bestD = 34;
    for (const s of crew.stations()) {
      if (crew.userOf(s) || crew.api.brokenSt(s)) continue;
      const d = Math.hypot(s.approach.x - player.x, s.approach.y - player.y);
      if (d < bestD) { bestD = d; best = s; }
    }
    return best;
  }
  function seatDown(s) {
    if (!s) { toast('info', 'Sentar', 'Chegue perto de um computador livre e aperte F'); return; }
    if (crew.userOf(s)) { toast('warn', 'Ocupado', crew.api.stationName(s) + ' está com ' + crew.userOf(s).crew.name); return; }
    if (crew.api.brokenSt(s)) { toast('warn', 'Estação quebrada', 'Chame o técnico de TI'); return; }
    closePanel();
    P.seat = s;
    G.playerSeat = s;
    P.glide = { from: { x: player.x, y: player.y }, to: s.sit, t: 0, dur: 0.3, sit: true };
    player.vx = player.vy = 0;
    player.moving = false;
    player.seated = true;
    player.noShadow = true;
    player.sortKey = s.sortKey;
    P.phase = 'type'; P.phaseT = 2; P.pose = 'R';
  }
  function seatStand() {
    const s = P.seat;
    if (!s || (P.glide && !P.glide.sit)) return;
    if (DL.PCDesk) DL.PCDesk.close();
    s.screen.work = null;
    s.screen.typing = false;
    let to = s.approach;
    const tx = Math.floor(to.x / T), ty = Math.floor((to.y - 2) / T);
    if (W.solid[ty * W.W + tx]) { const f = crew.api.nav.nearestFree(tx, ty, 6); if (f) to = crew.api.nav.center(f[0], f[1]); }
    P.glide = { from: { x: player.x, y: player.y }, to, t: 0, dur: 0.25, sit: false };
    player.seated = false;
    player.noShadow = false;
    player.sortKey = null;
    player.dir = 'down';
  }
  // seated: typing / resting / glancing like the crew; the screen shows the player's role
  function updateSeat(dt, wantsMove) {
    if (P.glide) {
      const gl = P.glide;
      gl.t = Math.min(1, gl.t + dt / gl.dur);
      const k = gl.t * gl.t * (3 - 2 * gl.t);
      player.x = gl.from.x + (gl.to.x - gl.from.x) * k;
      player.y = gl.from.y + (gl.to.y - gl.from.y) * k;
      if (gl.t >= 1) {
        P.glide = null;
        if (gl.sit && P.seat && DL.PCDesk) DL.PCDesk.open(P.seat); // sat at a computer: its screen opens (pcdesk.js)
        if (!gl.sit) { P.seat = null; G.playerSeat = null; if (P.rest) { DL.Interact.release(player); P.rest = null; } }
      }
      return true;
    }
    // resting on a sofa / pouf / chair: any move gets up (and the seat must still be there)
    if (P.rest) {
      if (wantsMove || W.items.indexOf(P.rest.item) < 0) restStand();
      return true;
    }
    if (!P.seat) return false;
    const s = P.seat, now = crew.stationOf(s.key);
    if (!now || now.sit.x !== s.sit.x || now.sit.y !== s.sit.y || crew.api.brokenSt(s) || wantsMove) {
      if (crew.api.brokenSt(s)) toast('warn', 'Seu PC apagou', 'Defeito de hardware · chame o técnico');
      seatStand();
      return true;
    }
    P.phaseT -= dt;
    if (P.phaseT <= 0) {
      P.phase = P.phase !== 'type' ? 'type' : Math.random() < 0.6 ? 'rest' : 'look';
      P.phaseT = P.phase === 'type' ? 2 + Math.random() * 3 : P.phase === 'rest' ? 1 + Math.random() * 1.5 : 0.6 + Math.random() * 0.8;
    }
    if (P.phase === 'type') { P.poseT -= dt; if (P.poseT <= 0) { P.pose = P.pose === 'A' ? 'B' : 'A'; P.poseT = 0.11 + Math.random() * 0.08; } }
    else P.pose = P.phase === 'rest' ? 'R' : 'L';
    s.screen.work = (DL.ROLES[crew.playerProfile.role] || DL.ROLES.gerente).work;
    s.screen.typing = P.phase === 'type';
    return true;
  }
  player.frame = function () {
    // an emote running (emotes.js) shows its own frames
    const em = !this.seated && emotes.frame();
    if (em) return em;
    if (this.seated && this.sitSheet) {
      const set = this.sitSheet[P.seat ? P.seat.dir : P.rest ? P.rest.dir : 'up'] || this.sitSheet.up;
      // resting on a sofa / pouf: skins with a relaxed seated frame sit back in it (cosmetics.js)
      const pose = P.rest ? (set.lounge ? 'lounge' : 'R') : P.pose;
      if (pose === 'R' && this.blinkT > 0) return set.blink;
      return set[pose] || set.R;
    }
    if (!this.moving && this.actSheet) {
      const s = this.actSheet[this.dir] || this.actSheet.down, t = scene.t;
      if ((P.talkT > 0 || (this.bubble && this.bubble.left > 0.5)) && Math.floor(t * 7) % 2) return s.talk;
      if (P.actT > 0) return P.act === 'wave' ? s.wave : s.reach;
      // hands on the equipment while its panel is open
      if (S.panel && S.panel.kind !== 'desk' && Math.floor(t * 2.4) % 3) return s.reach;
    }
    // standing still for a while against a rack: skins with a relaxed seated frame sit down on the floor
    if (!this.moving && S.lounge && this.sheet[this.dir] && this.sheet[this.dir].lounge) return this.sheet[this.dir].lounge;
    return DL.Actor.prototype.frame.call(this);
  };

  /* ---------------- input ---------------- */
  const keys = new Set();
  const KEYMAP = { KeyW: 'up', ArrowUp: 'up', KeyS: 'down', ArrowDown: 'down', KeyA: 'left', ArrowLeft: 'left', KeyD: 'right', ArrowRight: 'right' };
  const touchVec = { x: 0, y: 0 };

  addEventListener('keydown', (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey) return;
    if (crew.creatorOpen) { crew.key(ev); return; }
    if (cabling.isOpen) { if (cabling.key(ev)) ev.preventDefault(); return; }
    if (monitor.isOpen) { if (monitor.key(ev)) ev.preventDefault(); return; }
    if (economy.isOpen) { if (economy.key(ev)) ev.preventDefault(); return; }
    if (shifts.isOpen) { if (ev.code === 'Escape') { shifts.close(); ev.preventDefault(); } return; }
    if (agents && agents.isOpen) { if (ev.code === 'Escape') { agents.close(); ev.preventDefault(); } return; }
    if (infra.isOpen) { if (infra.key(ev)) ev.preventDefault(); return; }
    if (inventory.isOpen) { if (inventory.key(ev)) ev.preventDefault(); return; }
    if (pass && pass.isOpen) { if (pass.key(ev)) ev.preventDefault(); return; }
    const tag = document.activeElement && document.activeElement.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    if (S.phase === 'intro') {
      if (ev.code === 'Enter') { ev.preventDefault(); begin(true, true); }
      return;
    }
    const free = !isOverlayOpen();
    if (free && !ev.repeat && (ev.code === 'KeyB' || ev.code === 'KeyC')) {
      const m = ev.code === 'KeyB' ? 'build' : 'crew';
      setMode(S.mode === m ? 'explore' : m);
      ev.preventDefault();
      return;
    }
    if (free && ev.code === 'KeyT' && !ev.repeat) { ops.toggle(); ev.preventDefault(); return; }
    if (free && (ev.code === 'KeyO' || ev.code === 'KeyU') && !ev.repeat) { if (ev.code === 'KeyO') inventory.openShop(); else inventory.openInventory(); ev.preventDefault(); return; }
    // J: the season pass
    if (free && pass && ev.code === 'KeyJ' && !ev.repeat) { pass.open(); ev.preventDefault(); return; }
    if (free && ev.code === 'KeyM' && S.mode !== 'build' && !ev.repeat) { monitor.open(); ev.preventDefault(); return; }
    if (free && S.mode !== 'build' && infra.key(ev)) { ev.preventDefault(); return; }
    // F: sit at the closest free workstation / stand up
    if (free && S.mode === 'explore' && ev.code === 'KeyF' && !ev.repeat) { if (P.rest) restStand(); else if (P.seat) seatStand(); else { stopUse(false); seatDown(nearestSeat()); } ev.preventDefault(); return; }
    // Enter: write in the team chat
    if (free && S.mode !== 'build' && ev.code === 'Enter' && !ev.repeat && !(document.activeElement && document.activeElement.tagName === 'BUTTON')) { crew.chat.focusInput(); ev.preventDefault(); return; }
    if (free && S.mode === 'build' && builder.key(ev)) { ev.preventDefault(); return; }
    // 1 / 2 / 3: dance, wave, anger
    if (free && emotes.key(ev)) { ev.preventDefault(); return; }
    if (free && talk.key(ev)) { ev.preventDefault(); return; }
    if (free && crew.key(ev)) { ev.preventDefault(); return; }
    if (free && S.mode === 'crew' && ev.code === 'Escape') { setMode('explore'); return; }
    const k = KEYMAP[ev.code];
    if (k) {
      keys.add(k);
      ev.preventDefault();
      return;
    }
    if (ev.code === 'Escape') {
      if ($('help').classList.contains('is-open')) $('help').classList.remove('is-open');
      else if (S.panel) closePanel();
      else if (G.opsOpen()) ops.toggle(false);
      return;
    }
    const onButton = document.activeElement && document.activeElement.tagName === 'BUTTON';
    if (ev.code === 'KeyE' || (ev.code === 'Space' && !onButton)) {
      ev.preventDefault();
      if (!ev.repeat) interact();
    }
  });
  addEventListener('keyup', (ev) => {
    const k = KEYMAP[ev.code];
    if (k) keys.delete(k);
  });
  addEventListener('blur', () => keys.clear());

  // (on a computer the prompt says F: a click sits down / stands up, like the key)
  $('prompt').addEventListener('click', () => {
    const t = S.target, st = $('prompt').dataset.sit && t && crew.stationOf(t);
    if (st && canMove()) { if (P.seat && P.seat.key === st.key) seatStand(); else { stopUse(false); seatDown(st); } return; }
    interact();
  });
  $('tutStart').addEventListener('click', () => begin(true, true));
  $('tutSkipIntro').addEventListener('click', () => begin(false, true));

  // New games always start from scratch; other presets only serve as the title-screen backdrop.
  let preset = 'zero';
  function choosePreset(id) {
    preset = id;
    infra.reset();
    if (P.seat || P.glide || P.rest) { P.seat = null; P.glide = null; P.rest = null; G.playerSeat = null; player.seated = false; player.noShadow = false; player.sortKey = null; }
    P.use = null;
    P.held = null;
    if (DL.Interact) DL.Interact.release(player);
    const refused = DL.applyPreset(id, { scene, player, builder, ops });
    if (refused.length) console.warn('preset ' + id + ': itens recusados', refused);
    S.refused = refused;
  }

  // Learning mode (difficulty.js): everyone plays Iniciante, there is nothing to choose
  $('helpBtn').addEventListener('click', () => $('help').classList.add('is-open'));
  $('helpClose').addEventListener('click', () => $('help').classList.remove('is-open'));

  /* ---------------- modes: explore / build / crew ---------------- */
  const modeBtns = Array.from(document.querySelectorAll('[data-mode]'));
  function setMode(m) {
    if (m === S.mode) return;
    DL.audio.play(m === 'explore' ? 'modeOut' : 'modeIn');
    if (S.mode === 'build') builder.exit();
    S.mode = m;
    if (m !== 'explore') {
      closePanel();
      scene.cam.x = Math.max(0, Math.min(scene.mapW, scene.cam.x));
      scene.cam.y = Math.max(0, Math.min(scene.mapH, scene.cam.y));
    }
    if (m === 'build') builder.enter();
    // building: inner walls come down (cutaway) so the floor plan stays visible
    scene.wallCut = m === 'build';
    scene.o.minS = m === 'build' ? 1 : 2;
    if (m !== 'build') wheelZ.floor = null;
    fitDock(true);
    crew.setMode(m);
    game.classList.toggle('is-build', m === 'build');
    game.classList.toggle('is-crew', m === 'crew');
    modeBtns.forEach((b) => {
      const on = b.dataset.mode === m;
      b.classList.toggle('is-on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    setCursor('');
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
  }
  modeBtns.forEach((b) => b.addEventListener('click', () => {
    if (S.phase === 'intro') return;
    setMode(b.dataset.mode === S.mode ? 'explore' : b.dataset.mode);
  }));

  // Build mode shows only the datacenter: the player, the crew, the pet, visitors and other players fade
  // out together in ~200 ms (and back in on leaving) — only on screen: they keep existing and working.
  // scene.peopleAlpha is read by iso.js (drawing), crew.js (name tags, bubbles) and staff.js.
  scene.peopleAlpha = 1;
  const PEOPLE_FADE = 0.2;
  function peopleStep(dt) {
    const want = S.mode === 'build' ? 0 : 1, cur = scene.peopleAlpha;
    if (cur === want) return;
    scene.peopleAlpha = reduced ? want : cur + Math.sign(want - cur) * Math.min(Math.abs(want - cur), dt / PEOPLE_FADE);
    const tags = $('nametags'), mp = $('mpTags');
    if (tags) tags.style.opacity = scene.peopleAlpha === 1 ? '' : scene.peopleAlpha.toFixed(3);
    if (mp) mp.style.opacity = scene.peopleAlpha === 1 ? '' : scene.peopleAlpha.toFixed(3);
  }
  // Hidden people don't block building, so an object (or a wall) can go where someone was standing:
  // they step to the nearest free tile. Seated / resting people stay (their seat logic handles moves).
  G.unstick = () => {
    const nav = crew && crew.api.nav;
    if (!nav) return;
    const settled = (a) => a.seated || (a === player && (P.seat || P.rest || P.glide)) ||
      (a.crew && (a.crew.seated || a.crew.off || /^(sitting|standing|resting|restSit)$/.test(a.crew.state || '')));
    for (const a of [player].concat(crew.members, staff ? staff.clients : [])) {
      if (!a || a.hidden || settled(a) || !Number.isFinite(a.x) || !scene.hits(a.x, a.y)) continue;
      if (a === player && DL.Street && DL.Street.outside) continue;
      const f = nav.nearestFree(Math.floor(a.x / T), Math.floor((a.y - 2) / T), 10);
      if (!f) continue;
      const c = nav.center(f[0], f[1]);
      a.x = c.x;
      a.y = c.y;
      a.vx = a.vy = 0;
    }
  };

  // cosmetic furniture from the shop (inventory.js → build.js): in the map or kept in the inventory
  G.cosmPlaced = (id) => scene.world.items.some((e) => e.defId === id);
  G.placeCosmetic = (id) => {
    if (S.phase !== 'play') return 'Comece um jogo para colocar no mapa';
    inventory.close();
    setMode('build');
    builder.choose(id);
    return null;
  };
  G.storeCosmetic = (id) => {
    const e = scene.world.items.find((x) => x.defId === id);
    if (!e) return 'Não está no mapa';
    builder.api.removeItem(e);
    return null;
  };

  function setCursor(c) { canvas.style.cursor = c || ''; }

  // build mode: the catalog (item strip, sub-categories, categories) and the toolbar sit at the bottom centre
  // (build.js); the map is centred in the space above them. The strip's room is always kept free, so the
  // map doesn't jump when the strip folds away while placing.
  // (on a phone lying down the categories are a column at the left: the map is centred right of it)
  let shiftWant = 0;
  // the space the build bars take at the bottom (the camera keeps the map above it). Measured at most
  // every 300 ms (or right away when forced), not every frame: reading the layout each frame costs time.
  let dockAt = 0;
  function fitDock(force) {
    const dock = $('build'), on = S.mode === 'build' && !dock.hidden;
    if (!on) { scene.o.padBottom = 0; dockAt = 0; shiftWant = 0; return; }
    const now = performance.now();
    if (!force && now - dockAt < 300) return;
    dockAt = now;
    const cr = canvas.getBoundingClientRect();
    // the highest of the bars that run along the bottom: the strip / room panel (laid out even while
    // folded, so the camera doesn't jump when it folds), the sub-tabs and the toolbar. (On a phone lying
    // down the categories are a column at the left side: they don't count.)
    let top = cr.bottom;
    for (const n of [dock.querySelector('.build__tray'), dock.querySelector('.build__subs'), document.querySelector('.build-tools__row')]) {
      if (!n || n.hidden) continue;
      const b = n.getBoundingClientRect();
      if (b.height) top = Math.min(top, b.top);
    }
    const c = dock.querySelector('.build__cats'), side = DL.MOBILE && innerWidth > innerHeight;
    if (c && !side) top = Math.min(top, c.getBoundingClientRect().top);
    shiftWant = c && side ? Math.max(0, Math.round((c.getBoundingClientRect().right - cr.left + 6) / 2)) : 0;
    scene.o.padBottom = Math.max(0, Math.round(cr.bottom - top + 8));
  }
  // build mode opens on the whole datacenter: glide there and zoom (in or out) until it fits the free space
  // between the top bar and the bottom bars, with a margin all round
  G.fitArea = (x, y, w, h) => {
    fitDock(true);
    const r = canvas.getBoundingClientRect();
    // isometric footprint: (w + h) across, (w + h) / 2 down, plus the back walls standing up and the floor's edge
    const pw = scene.iso ? w + h : w, ph = scene.iso ? (w + h) / 2 + 44 + 12 : h;
    // a small margin all round (and the categories' column on a phone lying down)
    const availW = r.width - 48 - 2 * shiftWant, availH = r.height - (scene.o.padTop || 0) - (scene.o.padBottom || 0) - 24;
    const fit = Math.min(availW / pw, availH / ph) * scene.dpr;
    // the build fills the free space: closer than the normal view if it is small (up to FIT_MAX, so a
    // one-room start doesn't turn into giant pixels). A big datacenter may need less than ZOOM_MIN to fit:
    // that one view is allowed (wheelZ.floor) until leaving build mode. The wheel / pinch stay free.
    if (fit > 0) {
      const FIT_MAX = 1.5;
      const f = Math.max((scene.o.minS || 1) / scene.autoS, Math.min(FIT_MAX, fit / scene.autoS));
      wheelZ.floor = f < ZOOM_MIN ? f : null;
      wheelZ.f = f;
      wheelZ.at = null;
    }
    if (scene.iso) {
      // aim at the middle of the drawn shape: across x − y, down (x + y) / 2, raised by half the wall height
      const X = x + w / 2 - (y + h / 2), Y = (x + y) / 2 + (w + h) / 4 - 44 / 2 + 12 / 2;
      S.camTo = { x: Y + X / 2, y: Y - X / 2 };
    } else S.camTo = { x: x + w / 2, y: y + h / 2 };
    S.camVel = null;
  };
  // ...and aim the camera at the middle of the space between the top bar and the dock: opening the dock
  // slides the view up, folding it (Q) or leaving build mode slides it back
  function liftStep(dt) {
    const want = Math.max(0, ((scene.o.padBottom || 0) - (scene.o.padTop || 0)) / 2), cur = scene.o.lift || 0;
    const k = reduced ? 1 : 1 - Math.exp(-dt * 7), sh = scene.o.shift || 0;
    scene.o.shift = Math.abs(shiftWant - sh) < 0.5 ? shiftWant : sh + (shiftWant - sh) * k;
    if (Math.abs(want - cur) < 0.5) { scene.o.lift = want; return; }
    scene.o.lift = cur + (want - cur) * k;
  }
  // build dock → "Mais" → a room: glide there and zoom out (never in) until it fits above the dock
  G.focusArea = (x, y, w, h) => {
    fitDock(true);
    const r = canvas.getBoundingClientRect();
    const pw = scene.iso ? w + h : w, ph = scene.iso ? (w + h) / 2 + 40 : h;
    const room = Math.min((r.width - 64 - 2 * shiftWant) / pw, (r.height - (scene.o.padTop || 0) - (scene.o.padBottom || 0) - 56) / ph) * scene.dpr;
    if (room > 0 && room < scene.S) {
      const [lo, hi] = zoomRange();
      wheelZ.f = Math.max(lo, Math.min(hi, room / scene.autoS));
      wheelZ.at = null;
    }
    // isometric: the walls stand up from the floor, so aim a little higher (half a wall) to keep the back wall in view
    const up = scene.iso ? 20 : 0;
    S.camTo = { x: x + w / 2 - up, y: y + h / 2 - up };
    S.camVel = null;
  };
  function camToStep(dt) {
    const t = S.camTo;
    if (!t) return;
    // any pan (drag, WASD) or leaving build mode takes the camera back
    if (S.ptrDown || keys.size || S.mode !== 'build') { S.camTo = null; return; }
    const c = scene.cam, k = reduced ? 1 : 1 - Math.exp(-dt * 6);
    c.x += (t.x - c.x) * k;
    c.y += (t.y - c.y) * k;
    if (Math.hypot(t.x - c.x, t.y - c.y) < 0.5) { c.x = t.x; c.y = t.y; S.camTo = null; }
  }

  /* ---------------- mouse on the world ---------------- */
  const local = (ev) => {
    const r = canvas.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  };
  // Camera drag: build and crew modes pan when the press lands on empty floor (builder.js / crew.js);
  // exploring, a drag on empty space looks around freely until the player walks again. Letting go
  // keeps a little momentum (step → camGlide).
  // my own character: a click shows / hides what's playing on Spotify / YouTube Music over my head
  // (spotify-player.js, ytmusic-player.js)
  const onMe = (x, y) => {
    if (!(DL.SpotifyBubble || DL.YTMusicBubble) || S.mode !== 'explore' || player.hidden) return false;
    if (scene.iso) return !!scene.pickAt(x, y, (o) => o === player);
    const w = scene.screenToWorld(x, y);
    return !!crew.pickActor(w.x, w.y, [player]);
  };
  // another player's character in an online room: a click opens their card (lobby.js)
  const friendAt = (x, y) => {
    if (!DL.Lobby || S.mode === 'build') return null;
    const others = scene.actors.filter((a) => a.remotePlayer && !a.hidden);
    if (!others.length) return null;
    if (scene.iso) return scene.pickAt(x, y, (o) => others.indexOf(o) >= 0);
    const w = scene.screenToWorld(x, y);
    return crew.pickActor(w.x, w.y, others);
  };
  canvas.addEventListener('pointerdown', (ev) => {
    if (S.phase === 'intro' || isOverlayOpen()) return;
    const [x, y] = local(ev);
    const friend = ev.button === 0 ? friendAt(x, y) : null;
    if (friend) { DL.Lobby.showPlayer(friend.remotePlayer.id); return; }
    if (ev.button === 0 && onMe(x, y)) { if (DL.SpotifyBubble) DL.SpotifyBubble.toggle(); if (DL.YTMusicBubble) DL.YTMusicBubble.toggle(); return; }
    if (ev.pointerType === 'touch' && S.mode === 'explore') return;
    if (ev.button === 0) canvas.setPointerCapture(ev.pointerId);
    S.ptrDown = ev.button === 0;
    S.camVel = null;
    if (S.mode === 'build') builder.pointerDown(x, y, ev.button);
    else {
      const used = crew.pointerDown(x, y, ev.button);
      if (!used && S.mode === 'explore' && ev.button === 0) S.drag = { sx: x, sy: y, cx: scene.cam.x, cy: scene.cam.y, on: false };
    }
  });
  canvas.addEventListener('pointermove', (ev) => {
    const [x, y] = local(ev);
    if (S.drag) {
      if (!S.drag.on && Math.hypot(x - S.drag.sx, y - S.drag.sy) > 4) { S.drag.on = true; S.freeCam = true; setCursor('grabbing'); }
      if (S.drag.on) {
        const d = scene.screenDelta(x - S.drag.sx, y - S.drag.sy);
        scene.cam.x = Math.max(0, Math.min(camMapW(), S.drag.cx - d.x));
        scene.cam.y = Math.max(0, Math.min(camMapH(), S.drag.cy - d.y));
        return;
      }
    }
    if (S.mode === 'build') builder.pointerMove(x, y);
    else crew.pointerMove(x, y);
    if (onMe(x, y) || friendAt(x, y)) setCursor('pointer');
  });
  const up = () => {
    if (S.drag && S.drag.on) setCursor('');
    S.drag = null;
    S.ptrDown = false;
    if (S.mode === 'build') builder.pointerUp();
    else crew.pointerUp();
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', (ev) => ev.preventDefault());
  // Smooth zoom: the wheel / trackpad moves a target and the scale glides to it every frame (zoomStep).
  // At the default (5) it is deliberately slow: a full trackpad swipe (~300px) is about one zoom level.
  // The player picks 1 (≈ ⅓ as fast) … 10 (≈ 4× as fast) in Configurações; it stays in this browser.
  // Sound: effects and the server-room hum have their own volume (0 = off), also kept in this browser.
  // Animações: how elastic the interface springs are (motion.js), 0 = off.
  const SETTINGS_KEY = 'datalab.settings.v1';
  const settings = { zoomSens: 5, sfxVol: 6, ambVol: 3, motionLvl: 6 };
  try { Object.assign(settings, JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}')); } catch (e) { /* defaults */ }
  const clamp10 = (v, d) => { v = Math.round(Number(v)); return Number.isFinite(v) ? Math.max(0, Math.min(10, v)) : d; };
  settings.zoomSens = Math.max(1, clamp10(settings.zoomSens, 5) || 5);
  settings.sfxVol = clamp10(settings.sfxVol, 6);
  settings.ambVol = clamp10(settings.ambVol, 3);
  settings.motionLvl = clamp10(settings.motionLvl, 6);
  const zoomSens = () => (1 / 320) * Math.pow(2, (settings.zoomSens - 5) / 2.5);
  const applyVolume = () => DL.audio.setVolume(settings.sfxVol / 10, settings.ambVol / 10);
  applyVolume();
  const applyMotion = () => DL.Motion && DL.Motion.setLevel(settings.motionLvl / 10);
  applyMotion();
  [['zoomSens', null], ['sfxVol', applyVolume], ['ambVol', applyVolume], ['motionLvl', applyMotion]].forEach(([key, then]) => {
    const input = $(key), out = $(key + 'Val');
    input.value = out.textContent = settings[key];
    input.addEventListener('input', () => {
      settings[key] = Number(input.value);
      out.textContent = settings[key];
      if (then) then();
      try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) { /* private mode */ }
    });
  });
  // a sample of the new volume when the slider is let go
  $('sfxVol').addEventListener('change', () => DL.audio.play('done'));
  $('motionLvl').addEventListener('change', () => DL.Motion && DL.Motion.preview($('help').firstElementChild));
  // building can zoom out further (the whole datacenter in view); the other modes stop at 2
  // ---------------- ZOOM (roda do mouse; pinça de dois dedos no celular) ----------------
  // Quanto dá para aproximar e afastar, em "vezes o tamanho normal" (1 = o tamanho de sempre).
  // Na rua dá para afastar até ZOOM_MIN (a cidade inteira); dentro do data center o chão do mapa limita
  // antes disso (minS). Aproximar vai até ZOOM_MAX em qualquer lugar.
  const ZOOM_MIN = 0.35;
  const ZOOM_MAX = 1.6;
  // o menor tamanho de pixel (scene.S) em cada lugar: na rua 1 (a cidade é grande), dentro o de sempre
  const floorS = () => (DL.Street && DL.Street.onStreet ? 1 : scene.o.minS || 2);
  // cada clique da roda muda o zoom nesta proporção (1.1 = 10%); a sensibilidade das Configurações ajusta
  const ZOOM_PASSO = 1.1;
  // wheelZ.f: o zoom pedido · cur: o zoom mostrado agora (desliza até f) · at: onde está o mouse
  // floor: no modo Construir, a vista que mostra o data center inteiro pode ficar abaixo de ZOOM_MIN
  const wheelZ = { f: 1, cur: 1, at: null, floor: null };
  function zoomRange() {
    const a = scene.autoS || 2;
    let lo = Math.max(ZOOM_MIN, floorS() / a);
    // na rua a vista nunca fica maior que a cidade desenhada (street.js): afastar além disso não faria nada
    if (DL.Street && DL.Street.outside && DL.Street.minS) lo = Math.max(lo, DL.Street.minS() / a);
    if (wheelZ.floor != null) lo = Math.min(lo, wheelZ.floor);
    return [Math.min(lo, ZOOM_MAX), ZOOM_MAX];
  }
  // inside a shop the room sets its own size (street.js renderPlace): no zoom there
  const zoomOff = () => S.phase === 'intro' || (DL.Street && (DL.Street.busy || DL.Street.place));
  canvas.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    if (zoomOff()) return;
    // lines / pages → pixels; pinch-to-zoom on a touchpad (ctrlKey) sends small deltas, so it counts more
    const unit = ev.deltaMode === 1 ? 33 : ev.deltaMode === 2 ? 400 : 1;
    const d = Math.max(-150, Math.min(150, ev.deltaY * unit * (ev.ctrlKey ? 4 : 1)));
    const [lo, hi] = zoomRange();
    // one notch (100) = one ZOOM_PASSO; the sensitivity setting (1..10, 5 = normal) makes it smaller / bigger
    const k = Math.pow(2, (settings.zoomSens - 5) / 2.5);
    wheelZ.f = Math.max(lo, Math.min(hi, wheelZ.f * Math.pow(ZOOM_PASSO, (-d / 100) * k)));
    const [x, y] = local(ev);
    wheelZ.at = { x, y, t: performance.now() };
  }, { passive: false });

  // the scene whose picture is on the screen now (the street outside, the datacenter inside)
  const shownScene = () => (DL.Street && DL.Street.outside ? DL.Street.scene : scene);
  // The camera always stays where there is something to see: inside, over the datacenter's map; on the
  // street, around the stretch of sidewalk the player walks on (never out over the park or the roofs).
  function clampCam() {
    const c = scene.cam;
    let x0 = 0, x1 = scene.mapW, y0 = 0, y1 = scene.mapH;
    if (DL.Street && DL.Street.outside) {
      const sc = DL.Street.scene;
      if (DL.Street.place) { x1 = sc.world.W * DL.T; y1 = sc.world.H * DL.T; }
      else { DL.Street.clampCam(c, sc); return; } // the street: the view stays over the city (street.js)
    }
    if (!(x1 > x0) || !(y1 > y0)) return;
    c.x = Math.max(x0, Math.min(x1, c.x));
    c.y = Math.max(y0, Math.min(y1, c.y));
  }
  // how far the camera may be dragged: the map it is looking at (the datacenter's, or the city's)
  const camMapW = () => (DL.Street && DL.Street.onStreet ? DL.Street.mapW : scene.mapW);
  const camMapH = () => (DL.Street && DL.Street.onStreet ? DL.Street.mapH : scene.mapH);
  // Zooming keeps the spot under the mouse (or between the two fingers) where it is. It starts from the
  // picture actually on the screen (its middle may not be the camera's aim near the map's edges), works
  // out where the middle has to go, and turns that back into the camera's aim (iso.js' camera()).
  function aimZoom(sc, S0, S1) {
    const a = wheelZ.at;
    if (!a || performance.now() - a.t > 900 || S0 === S1 || !sc.iso) return;
    const d = sc.dpr, cw = sc.canvas.width, ch = sc.canvas.height;
    const px = (a.x * d + sc.ox) / S0, py = (a.y * d + sc.oy) / S0;           // the spot under the mouse
    const mx = (sc.ox + cw / 2) / S0, my = (sc.oy + ch / 2) / S0;             // the middle of the picture
    const r = S0 / S1, nx = px + (mx - px) * r, ny = py + (my - py) * r;       // the new middle
    const X = nx + ((sc.o.shift || 0) * d) / S1, Y = ny - ((sc.o.lift || 0) * d) / S1;
    scene.cam.x = Y + X / 2;
    scene.cam.y = Y - X / 2;
    if (S.mode === 'explore') S.freeCam = true;
    S.camTo = null;
    S.camVel = null;
  }
  // the size on screen of the street (street.js never shows more than MAX_VIEW)
  const shownS = (s) => (DL.Street && DL.Street.outside && !DL.Street.place && DL.Street.minS ? Math.max(s, DL.Street.minS()) : s);
  function zoomStep(dt) {
    const [lo, hi] = zoomRange();
    wheelZ.f = Math.max(lo, Math.min(hi, wheelZ.f));
    const c = wheelZ.cur, f = wheelZ.f;
    // glides in even ratio steps (10% feels the same zoomed in or out)
    let n = reduced || Math.abs(f / c - 1) < 0.003 ? f : c * Math.pow(f / c, 1 - Math.exp(-dt * 14));
    wheelZ.cur = n;
    const z = scene.autoS * n - scene.autoS, want = Math.max(floorS(), scene.autoS + z);
    if (Math.abs(z - (scene.o.zoom || 0)) < 1e-6 && scene.S === want) return;
    const sc = shownScene(), S0 = sc.S || scene.S;
    scene.o.zoom = z;
    scene.S = want;
    if (!zoomOff()) aimZoom(sc, S0, shownS(scene.S));
  }

  // touch joystick (explore mode)
  if (matchMedia('(hover: none) and (pointer: coarse)').matches) {
    $('touch').hidden = false;
    game.classList.add('is-touch');
    const stick = $('stick'), knob = $('knob');
    let pid = null;
    const setVec = (ev) => {
      const r = stick.getBoundingClientRect();
      let dx = ev.clientX - (r.left + r.width / 2), dy = ev.clientY - (r.top + r.height / 2);
      const d = Math.hypot(dx, dy), max = 44;
      if (d > max) { dx *= max / d; dy *= max / d; }
      knob.style.transform = 'translate(' + dx + 'px,' + dy + 'px)';
      const m = Math.min(1, d / max);
      touchVec.x = m > 0.18 ? dx / max : 0;
      touchVec.y = m > 0.18 ? dy / max : 0;
    };
    stick.addEventListener('pointerdown', (ev) => { pid = ev.pointerId; stick.setPointerCapture(pid); setVec(ev); });
    stick.addEventListener('pointermove', (ev) => { if (ev.pointerId === pid) setVec(ev); });
    const end = () => { pid = null; touchVec.x = touchVec.y = 0; knob.style.transform = ''; };
    stick.addEventListener('pointerup', end);
    stick.addEventListener('pointercancel', end);
    $('touchAction').addEventListener('click', interact);

    // two fingers on the map: pinch to zoom (one finger keeps doing what it did). Capture listeners run
    // before the ones above, so the second finger never reaches the builder or the crew.
    const fingers = new Map();
    let pinch = null;
    const spread = () => { const [a, b] = Array.from(fingers.values()); return Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)); };
    canvas.addEventListener('pointerdown', (ev) => {
      if (ev.pointerType !== 'touch') return;
      fingers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      if (fingers.size === 2 && !pinch) {
        // drop what the first finger started (a wall, a drag) without applying it
        S.drag = null;
        S.ptrDown = false;
        if (S.mode === 'build') builder.pointerAbort();
        else crew.pointerUp();
        pinch = { d: spread(), f: wheelZ.f };
      }
      if (pinch) ev.stopImmediatePropagation();
    }, true);
    canvas.addEventListener('pointermove', (ev) => {
      const f = fingers.get(ev.pointerId);
      if (!f) return;
      f.x = ev.clientX;
      f.y = ev.clientY;
      if (!pinch) return;
      ev.stopImmediatePropagation();
      if (fingers.size < 2) return;
      if (zoomOff()) return;
      const [lo, hi] = zoomRange();
      wheelZ.f = Math.max(lo, Math.min(hi, pinch.f * (spread() / pinch.d)));
      { const f = Array.from(fingers.values()), r = canvas.getBoundingClientRect(); if (f.length === 2 && f[0].x != null) wheelZ.at = { x: (f[0].x + f[1].x) / 2 - r.left, y: (f[0].y + f[1].y) / 2 - r.top, t: performance.now() }; }
    }, true);
    const lift = (ev) => {
      if (!fingers.delete(ev.pointerId) || !pinch) return;
      ev.stopImmediatePropagation();
      if (!fingers.size) pinch = null;
    };
    canvas.addEventListener('pointerup', lift, true);
    canvas.addEventListener('pointercancel', lift, true);
  }

  /* ---------------- player / camera ---------------- */
  const LOUNGE_AFTER = 5;
  function updatePlayer(dt) {
    let ix = 0, iy = 0;
    if (P.actT > 0) P.actT -= dt;
    if (P.talkT > 0) P.talkT -= dt;
    // the emote's clock; sitting down or leaving explore mode ends it
    emotes.update(dt, !!(P.seat || P.glide || P.rest) || S.mode !== 'explore');
    // talking with someone in the conversation panel: look at them
    if (talk.active && !P.seat && !player.moving) player.dir = DL.dirOf(talk.active.x - player.x, talk.active.y - player.y);
    if (P.seat || P.glide || P.rest) {
      const wants = S.mode === 'explore' && canMove() && (keys.has('left') || keys.has('right') || keys.has('up') || keys.has('down') || Math.hypot(touchVec.x, touchVec.y) > 0.2);
      updateSeat(dt, wants);
      updateUse(dt, false);
      if (wants) S.freeCam = false;
      player.vx = player.vy = 0;
      player.moving = false;
      if (S.mode === 'explore') {
        if (S.freeCam) return;
        const kc = 1 - Math.exp(-dt * (reduced ? 30 : 5.5));
        scene.cam.x += (player.x - scene.cam.x) * kc;
        scene.cam.y += (player.y - 12 - scene.cam.y) * kc;
        return;
      }
    }
    if (S.mode !== 'explore') {
      // build + crew: WASD pans the camera, the player waits
      if (S.phase !== 'intro' && !isOverlayOpen()) {
        let cx = 0, cy = 0;
        if (keys.has('left')) cx -= 1;
        if (keys.has('right')) cx += 1;
        if (keys.has('up')) cy -= 1;
        if (keys.has('down')) cy += 1;
        const sp = 300 / Math.max(1, scene.S / 3);
        // keys pan along the screen (in the isometric view that is diagonal on the grid)
        const m = scene.screenDir(cx, cy), k = scene.iso && (cx || cy) ? 1.15 : 1;
        scene.cam.x = Math.max(0, Math.min(scene.mapW, scene.cam.x + m.x * k * sp * dt));
        scene.cam.y = Math.max(0, Math.min(scene.mapH, scene.cam.y + m.y * k * sp * dt));
      }
      player.vx = player.vy = 0;
      player.moving = false;
      return;
    }
    if (canMove()) {
      if (keys.has('left')) ix -= 1;
      if (keys.has('right')) ix += 1;
      if (keys.has('up')) iy -= 1;
      if (keys.has('down')) iy += 1;
      ix += touchVec.x;
      iy += touchVec.y;
    }
    const len = Math.hypot(ix, iy);
    if (len > 1) { ix /= len; iy /= len; }
    const SPEED = 74;
    const k = 1 - Math.exp(-dt * (len > 0 ? 14 : 22));
    // W/A/S/D follow the screen: up on screen is diagonal on the grid in the isometric view
    const wd = scene.screenDir(ix, iy);
    player.vx += (wd.x * SPEED - player.vx) * k;
    player.vy += (wd.y * SPEED - player.vy) * k;
    if (!len && Math.hypot(player.vx, player.vy) < 2) player.vx = player.vy = 0;

    const x0 = player.x, y0 = player.y;
    scene.moveActor(player, player.vx * dt, player.vy * dt);
    const moved = Math.hypot(player.x - x0, player.y - y0);
    const was = player.moving;
    player.moving = len > 0.1 && moved > 0.05;
    // walking ends an emote
    if (len > 0.1) emotes.stop();
    updateUse(dt, len > 0.1);
    if (player.moving && !was) player.dist = 0;
    // a footstep on every other walk frame (scene.js swaps frames each 6.5 px)
    if (player.moving && Math.floor((player.dist + moved) / 13) !== Math.floor(player.dist / 13)) DL.audio.play('foot');
    player.dist += moved;
    S.walked += moved;
    // after LOUNGE_AFTER s standing still next to a rack (no emote, panel or conversation) the player sits
    // against it, if the skin has the frame (sprites.js 'sitLounge'); any move gets up
    S.idleT = player.moving || len > 0.1 || emotes.active || S.panel || talk.active ? 0 : (S.idleT || 0) + dt;
    S.lounge = S.idleT > LOUNGE_AFTER && !!(player.sheet.down && player.sheet.down.lounge) && !(DL.Street && DL.Street.outside) &&
      W.items.some((e) => e.kind === 'rack' && Math.abs(e.px + 8 - player.x) < 20 && Math.abs(e.py + 8 - player.y) < 20);

    if (len > 0.1) {
      const ax = Math.abs(ix), ay = Math.abs(iy);
      const horiz = ix < 0 ? 'left' : 'right', vert = iy < 0 ? 'up' : 'down';
      if (ax > 0.01 && ay > 0.01 && Math.abs(ax - ay) < 0.2 && (player.dir === horiz || player.dir === vert)) {
        // diagonal: keep the current facing to avoid flicker
      } else player.dir = ax > ay ? horiz : vert;
    }

    // looking around after a drag: walking brings the camera back to the player (smoothly)
    if (len > 0.1) S.freeCam = false;
    if (S.freeCam) return;
    const kc = 1 - Math.exp(-dt * (reduced ? 30 : 5.5));
    // aim a little above the feet (straight up on screen in both views)
    const up = scene.iso ? 7 : 0;
    scene.cam.x += (player.x - up + player.vx * 0.22 - scene.cam.x) * kc;
    scene.cam.y += (player.y - 12 + up * 0.7 + player.vy * 0.22 - scene.cam.y) * kc;
  }

  // Momentum after a drag: while the button is held the camera's speed is measured; released, it
  // glides on and slows down. Only where the camera is free (build, crew, or looking around).
  function camGlide(dt) {
    const c = scene.cam, last = S.lastCam || { x: c.x, y: c.y };
    const free = S.mode !== 'explore' || S.freeCam;
    if (S.ptrDown && dt > 0) {
      const vx = (c.x - last.x) / dt, vy = (c.y - last.y) / dt;
      S.camVel = S.camVel ? { x: S.camVel.x * 0.6 + vx * 0.4, y: S.camVel.y * 0.6 + vy * 0.4 } : { x: vx, y: vy };
    } else if (S.camVel && free && !reduced) {
      c.x = Math.max(0, Math.min(camMapW(), c.x + S.camVel.x * dt));
      c.y = Math.max(0, Math.min(camMapH(), c.y + S.camVel.y * dt));
      const k = Math.exp(-dt * 5);
      S.camVel.x *= k;
      S.camVel.y *= k;
      if (Math.hypot(S.camVel.x, S.camVel.y) < 4) S.camVel = null;
    } else if (!S.ptrDown) S.camVel = null;
    S.lastCam = { x: c.x, y: c.y };
  }

  function findTarget() {
    // on the street (street.js): the datacenter's front door and the shops' doors; inside a shop (lojas.js) its sellers and its door
    if (DL.Street && DL.Street.busy) return null; // going through the door: nothing to point at
    if (DL.Street && DL.Street.outside) return DL.Street.target(player);
    // a rack on fire next to me (incendio.js): putting it out comes before anything else
    const fogo = DL.Fogo && DL.Fogo.alvo(player);
    if (fogo) return fogo;
    let best = null, bestD = 21;
    const fx = { left: -1, right: 1, up: 0, down: 0 }[player.dir], fy = { up: -1, down: 1, left: 0, right: 0 }[player.dir];
    for (const e of W.interactables) {
      if (!e.bounds) continue;
      const dx = e.ix - player.x, dy = e.iy - player.y;
      let d = Math.hypot(dx, dy);
      const b = e.bounds;
      if ((b.x + b.w / 2 - player.x) * fx + (b.y + b.h / 2 - player.y) * fy > 0) d -= 3;
      if (d < bestD) { bestD = d; best = e; }
    }
    for (const n of crew.members) {
      if (n.hidden) continue; // off duty
      const d = Math.hypot(n.x - player.x, n.y - player.y) - 2;
      if (d < 20 && d < bestD) { bestD = d; best = n; }
    }
    // things to use: coffee machines, sofas, TVs, boards… (interact.js) — the closest footprint
    if (DL.Interact && !P.rest) {
      for (const e of W.items) {
        if (!usable(e) || (P.use && P.use.e === e)) continue;
        const h = e.host || e, x0 = h.px, y0 = h.py, x1 = x0 + (h.tw || 1) * T, y1 = y0 + (h.th || 1) * T;
        const dx = Math.max(x0 - player.x, 0, player.x - x1), dy = Math.max(y0 - player.y, 0, player.y - y1);
        // on a table, aim at the object itself; on the wall, at the tile below it
        const d = Math.hypot(dx, dy) + (e.host ? Math.hypot(e.px + 8 - player.x, e.py + 8 - player.y) * 0.25 : 0) - 4;
        if (d < 12 && d < bestD) { bestD = d; best = e; }
      }
    }
    // the door to the street, in the first room's left wall (street.js)
    if (DL.Street && !P.rest) {
      const d = DL.Street.doorDist(player);
      if (d != null && d < bestD) { bestD = d; best = DL.Street.door; }
    }
    return best;
  }

  /* ---------------- world-anchored UI ---------------- */
  const prompt = $('prompt');
  const labelsEl = $('worldLabels');
  // Room names (Entrada, Sala 1…) only while building. Each sits on the floor tile nearest the middle of its
  // room that nothing stands on — nor right in front of it, where a tall object would cover it on screen.
  let labels = [], labelEls = [], labelBox = null;
  function labelSpot(r, i) {
    const occ = new Set();
    for (const e of W.items) {
      if (e.host || e.wall || e.rug || e.kind === 'rug' || e.kind === 'door' || e.kind === 'wallseg' || e.kind === 'glass' || e.kind === 'glassH') continue;
      for (let j = 0; j < (e.th || 1); j++) for (let k = 0; k < (e.tw || 1); k++) occ.add((e.tx + k) + ',' + (e.ty + j));
    }
    const has = (x, y) => occ.has(x + ',' + y);
    let cx = 0, cy = 0, n = 0;
    for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) if (W.roomAt[y * W.W + x] === i) { cx += x + 0.5; cy += y + 0.5; n++; }
    if (!n) return { x: (r.x + r.w / 2) * T, y: (r.y + r.h / 2) * T };
    cx /= n; cy /= n;
    let best = null, bs = Infinity;
    for (let y = r.y; y < r.y + r.h; y++) {
      for (let x = r.x; x < r.x + r.w; x++) {
        if (W.roomAt[y * W.W + x] !== i) continue;
        // on the floor, clear of everything: not on an object, not next to one (tall racks and screens are
        // drawn over the tiles around them in the isometric view) and not against a wall
        let pen = has(x, y) ? 400 : 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            if ((dx || dy) && has(x + dx, y + dy)) pen += Math.max(Math.abs(dx), Math.abs(dy)) === 1 ? 14 : 4;
            // the label is a few tiles wide on screen: keep it off the room's edges
            if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1 && W.roomAt[(y + dy) * W.W + (x + dx)] !== i) pen += 10;
          }
        }
        const s = pen * 6 + (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2;
        if (s < bs) { bs = s; best = { x: (x + 0.5) * T, y: (y + 0.5) * T }; }
      }
    }
    return best;
  }
  function buildLabels() {
    labels = W.rooms.map((r, i) => Object.assign({ text: r.name, size: r.n === r.w * r.h ? r.w + ' × ' + r.h : r.n + ' m²' }, labelSpot(r, i)));
    labelsEl.innerHTML = '';
    labelBox = null;
    labelEls = labels.map((l) => {
      const s = document.createElement('span');
      s.className = 'room-label';
      const b = document.createElement('b');
      b.textContent = l.text;
      const m = document.createElement('small');
      m.textContent = l.size;
      s.append(b, m);
      labelsEl.appendChild(s);
      return s;
    });
  }
  buildLabels();
  let promptKey = '';

  function updateWorldUi() {
    // (only in build mode, and not while outside in the street or a shop)
    const showLabels = S.mode === 'build' && !(DL.Street && DL.Street.outside);
    labelsEl.classList.toggle('is-on', showLabels);
    if (showLabels) {
      const bs = builder.state, sel = bs.tab === 'room' || bs.tab === 'style' ? bs.roomIdx : -1;
      // each label's size is measured once (no layout work per frame); labels that would cover each other are
      // nudged apart on screen, the selected room's label keeping its place
      if (!labelBox && labelEls.length && labelEls[0].offsetWidth) labelBox = labelEls.map((e) => [e.offsetWidth, e.offsetHeight]);
      const pts = labels.map((l, i) => { const p = scene.worldToScreen(l.x, l.y); return { i, x: p.x, y: p.y, w: labelBox ? labelBox[i][0] : 0, h: labelBox ? labelBox[i][1] : 0 }; });
      if (labelBox) {
        pts.sort((a, b) => (a.i === sel ? -1 : b.i === sel ? 1 : a.y - b.y));
        const done = [];
        for (const p of pts) {
          for (let k = 0; k < 8; k++) {
            const q = done.find((o) => Math.abs(o.x - p.x) < (o.w + p.w) / 2 + 4 && Math.abs(o.y - p.y) < (o.h + p.h) / 2 + 2);
            if (!q) break;
            p.y = q.y + (p.y >= q.y ? 1 : -1) * ((q.h + p.h) / 2 + 3);
          }
          done.push(p);
        }
      }
      for (const p of pts) {
        const tr = 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px) translate(-50%,-50%)', e = labelEls[p.i];
        if (e._tr !== tr) { e._tr = tr; e.style.transform = tr; }
        if (e._sel !== (p.i === sel)) { e._sel = p.i === sel; e.classList.toggle('is-sel', e._sel); }
      }
    }
    const t = S.target;
    const show = t && canMove() && !(S.panel && S.panel === t) && !(t.crew && crew.selected === t);
    if (show) {
      const isActor = !!t.crew;
      const p = isActor ? scene.worldToScreen(t.x, t.y, 33) : t.exit ? DL.Street.promptAt(t) : t.fogo ? scene.itemTop(t.rack, 3) : scene.iso ? scene.itemTop(t, 3) : scene.worldToScreen(t.bounds.x + t.bounds.w / 2, t.bounds.y - 3);
      prompt.style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + p.y.toFixed(1) + 'px) translate(-50%,-100%)';
      const use = !isActor && !t.fogo && usable(t) ? DL.Interact.of(t) : null;
      // a computer: F sits down (or stands up again) — the key shown on the prompt
      const st = !isActor && !use && !t.exit && !t.fogo ? crew.stationOf(t) : null;
      const sitting = !!(st && P.seat && P.seat.key === st.key);
      const key = isActor ? 'crew-' + t.crew.id + t.crew.name : t.fogo ? 'fogo-' + t.verb : use ? 'use-' + t.kind + t.tx + ',' + t.ty : t.id + (st ? (sitting ? '|stand' : '|sit') : '');
      if (key !== promptKey) {
        promptKey = key;
        prompt.dataset.sit = st ? '1' : '';
        $('promptKey').textContent = st ? 'F' : 'E';
        $('promptVerb').textContent = isActor ? 'Gerenciar' : t.exit || t.fogo ? (t.fogo ? t.verb : DL.Street.verb(t)) : use ? use.verb : st ? (sitting ? 'Levantar do computador' : 'Sentar no computador') : 'Inspecionar';
        $('promptName').textContent = isActor ? t.crew.name : t.fogo ? t.name : t.exit ? DL.Street.label(t) : use ? DL.itemName(t) : t.id;
      }
    }
    prompt.classList.toggle('is-on', !!show && !(P.use && P.use.e === t));
    if (DL.SpotifyBubble || DL.YTMusicBubble) {
      const overHead = S.mode === 'explore' && !player.hidden && !isOverlayOpen() ? scene.worldToScreen(player.x, player.y, player.seated ? 25 : 31) : null;
      if (DL.SpotifyBubble) DL.SpotifyBubble.place(overHead);
      if (DL.YTMusicBubble) DL.YTMusicBubble.place(overHead);
    }
  }

  /* ---------------- in-world overlay ---------------- */
  function brackets(g, b, a) {
    g.fillStyle = 'rgba(255,255,255,' + a.toFixed(3) + ')';
    const x0 = b.x - 1, y0 = b.y - 1, x1 = b.x + b.w, y1 = b.y + b.h, L = 4;
    g.fillRect(x0, y0, L, 1); g.fillRect(x0, y0, 1, L);
    g.fillRect(x1 - L + 1, y0, L, 1); g.fillRect(x1, y0, 1, L);
    g.fillRect(x0, y1, L, 1); g.fillRect(x0, y1 - L + 1, 1, L);
    g.fillRect(x1 - L + 1, y1, L, 1); g.fillRect(x1, y1 - L + 1, 1, L);
  }
  scene.underlay = (g, sc) => {
    builder.underlay(g, sc);
    crew.underlay(g, sc);
    // walking trails: on the floor, under people and furniture (they fade with the people while building)
    if (trails && scene.peopleAlpha > 0) {
      const ga = g.globalAlpha;
      g.globalAlpha = ga * scene.peopleAlpha;
      trails.draw(g, sc);
      g.globalAlpha = ga;
    }
    if (dataflow) dataflow.draw(g, sc);
  };
  // warm light under floor lamps, cool spill from busy screens
  scene.lights = (g) => {
    for (const e of W.items) {
      if (e.kind === 'lamp') DL.pool(g, e.px + 8, e.py - 6, 40, e.color ? DL.rgba(e.color, 0.07) : 'rgba(255,194,133,0.07)');
      else if (e.work && (e.kind === 'desk' || e.kind === 'monitor')) DL.pool(g, e.px + e.tw * 8, e.py - 8, 26, 'rgba(160,195,236,0.05)');
      if (e.kind === 'monitor' && e.variant === 'rgb') DL.pool(g, e.px + 8, e.py - 10, 16, DL.rgba(e.color || '#ff2bd6', 0.1));
    }
    // each room's own RGB + glowing decor (decor.js)
    DL.drawRoomLights(g, W, scene.t);
  };
  scene.overlay = (g, sc) => {
    builder.overlay(g, sc);
    staff.overlay(g, sc);
    // what people carry and do (scanners, units, cups, work bars): gone with them while building
    const pa = scene.peopleAlpha;
    if (pa > 0) {
      g.save();
      g.globalAlpha = pa;
      crew.overlay(g, sc);
      g.restore();
    }
    tutorial.overlay(g, sc);
    if (blackout) blackout.draw(g, sc);
    // the cup / can / snack in my hand
    if (P.held && !player.seated && pa > 0) {
      g.save();
      g.globalAlpha = pa;
      if (scene.iso) scene.actorSpace(g, player);
      DL.drawHeld(g, player, P.held.what, P.held.sipT < 0, sc.t, 7);
      g.restore();
    }
    // isometric: brackets around the object as drawn; top-down: around its sprite bounds
    const mark = (e, a) => (scene.iso ? scene.markItem(g, e, 'rgba(255,255,255,' + a.toFixed(3) + ')') : brackets(g, e.bounds, a));
    if (S.flash && S.time < S.flash.until && S.flash.e.bounds) mark(S.flash.e, 0.6 + 0.4 * Math.sin(sc.t * 10));
    if (S.mode !== 'explore') return;
    const sel = S.panel || (S.target && !S.target.crew && canMove() ? S.target : null);
    if (sel && sel.bounds) mark(sel, S.panel === sel ? 0.9 : 0.5 + 0.3 * Math.sin(sc.t * 5));
  };

  /* ---------------- minimap ---------------- */
  const mm = $('minimap');
  const MS = 6;
  const mmDpr = Math.min(window.devicePixelRatio || 1, 2);
  const mg = mm.getContext('2d');
  let mmStatic = null;
  function buildMinimap() {
    mm.width = W.W * MS * mmDpr;
    mm.height = W.H * MS * mmDpr;
    const k = Math.min(200 / (W.W * MS), 128 / (W.H * MS));
    mm.style.width = Math.round(W.W * MS * k) + 'px';
    mm.style.height = Math.round(W.H * MS * k) + 'px';
    mmStatic = DL.mk(W.W * MS, W.H * MS);
    const g = mmStatic.getContext('2d');
    const col = { _: '#16181f', g: '#2a3446', G: '#2a3446', w: '#3a4456', d: '#5a4a3c', D: '#5a4a3c', '.': '#1a1f27', ',': '#1c232d' };
    for (let y = 0; y < W.H; y++) {
      for (let x = 0; x < W.W; x++) {
        const t = W.tiles[y * W.W + x];
        DL.R(g, x * MS, y * MS, MS, MS, col[t] || (W.lot && x < W.lot.w && y < W.lot.h ? '#0f1115' : '#0a0b0d'));
      }
    }
    for (const e of W.items) {
      if (e.host || e.kind === 'glass' || e.kind === 'glassH' || e.kind === 'wallseg' || e.kind === 'door' || e.kind === 'rug' || e.rug || e.wall || e.kind === 'chair') continue;
      const c = e.kind === 'rack' || e.kind === 'storage' ? '#3a414c' : e.kind === 'desk' ? '#2c3139' : e.kind === 'crac' ? '#4a515c' : '#262a31';
      DL.R(g, e.tx * MS + 1, e.ty * MS + 1, e.tw * MS - 1, e.th * MS - 1, c);
    }
  }
  buildMinimap();

  // inside a shop on the street (street.js, lojas.js): its own floor plan — walls, furniture, the people
  // behind the counter and the player — fitted into the same little map
  function drawPlaceMinimap(sc) {
    const g = mg, w = sc.world, mw = W.W * MS, mh = W.H * MS;
    const k = Math.min(mw / (w.W * T), mh / (w.H * T)), ox = (mw - w.W * T * k) / 2, oy = (mh - w.H * T * k) / 2;
    g.setTransform(mmDpr, 0, 0, mmDpr, 0, 0);
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, mw, mh);
    g.fillStyle = '#0a0b0d';
    g.fillRect(0, 0, mw, mh);
    for (let y = 0; y < w.H; y++) for (let x = 0; x < w.W; x++) {
      const t = w.tiles[y * w.W + x];
      g.fillStyle = t === '#' ? '#3a4456' : t === 'o' ? '#5a4a3c' : '#1a1f27';
      g.fillRect(ox + x * T * k, oy + y * T * k, Math.ceil(T * k), Math.ceil(T * k));
    }
    g.fillStyle = '#2c3139';
    for (const r of sc.colliders || []) g.fillRect(ox + r[0] * k, oy + r[1] * k, (r[2] - r[0]) * k, (r[3] - r[1]) * k);
    const pl = DL.Street.placeObj;
    g.fillStyle = '#ffd166';
    for (const a of (pl && pl.people) || []) g.fillRect(Math.round(ox + a.x * k) - 1, Math.round(oy + a.y * k) - 2, 3, 3);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(ox + player.x * k, oy + player.y * k - 1, 2.4, 0, Math.PI * 2);
    g.fill();
  }
  // on the street (street.js): the whole city, small — the buildings, the roads, the square, the water around —
  // with the part on screen outlined, the player, the pet and the cars
  function drawStreetMinimap() {
    const g = mg, art = DL.Street.minimap(), mw = W.W * MS, mh = W.H * MS;
    // the picture fitted into the little map: f = map px per picture px; k = map px per world px
    const f = Math.min(mw / art.width, mh / art.height), k = art.k * f;
    const dx = (mw - art.width * f) / 2, dy = (mh - art.height * f) / 2, ox = dx + art.ox * k, oy = dy;
    g.setTransform(mmDpr, 0, 0, mmDpr, 0, 0);
    g.clearRect(0, 0, mw, mh);
    g.fillStyle = '#0c1a2c';
    g.fillRect(0, 0, mw, mh);
    g.imageSmoothingEnabled = true;
    g.drawImage(art, dx, dy, art.width * f, art.height * f);
    g.imageSmoothingEnabled = false;
    // what is on screen: the four corners of the view, on the ground
    const cw = canvas.width / scene.dpr, ch = canvas.height / scene.dpr;
    g.strokeStyle = 'rgba(255,255,255,0.35)';
    g.beginPath();
    [[0, 0], [cw, 0], [cw, ch], [0, ch]].forEach(([x, y], i) => { const p = scene.screenToWorld(x, y); g[i ? 'lineTo' : 'moveTo'](ox + p.x * k, oy + p.y * k); });
    g.closePath();
    g.stroke();
    g.fillStyle = '#e6ecf5';
    for (const c of DL.Street.luz.cars) if (c.art) g.fillRect(Math.round(ox + c.x * k) - 1, Math.round(oy + c.y * k), 2, 1);
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(ox + player.x * k, oy + player.y * k, 2.2, 0, Math.PI * 2);
    g.fill();
  }
  function drawMinimap() {
    const g = mg, k = MS / T;
    if (DL.Street && DL.Street.place && DL.Street.placeObj) { drawPlaceMinimap(DL.Street.scene); return; }
    if (DL.Street && DL.Street.onStreet && DL.Street.minimap) { drawStreetMinimap(); return; }
    g.setTransform(mmDpr, 0, 0, mmDpr, 0, 0);
    g.imageSmoothingEnabled = false;
    g.clearRect(0, 0, W.W * MS, W.H * MS);
    g.drawImage(mmStatic, 0, 0);
    g.strokeStyle = 'rgba(255,255,255,0.18)';
    if (scene.iso) {
      // the isometric view covers a diamond of the map
      const cw = canvas.width / scene.dpr, ch = canvas.height / scene.dpr;
      g.beginPath();
      [[0, 0], [cw, 0], [cw, ch], [0, ch]].forEach(([x, y], i) => { const p = scene.screenToWorld(x, y); g[i ? 'lineTo' : 'moveTo'](p.x * k, p.y * k); });
      g.closePath();
      g.stroke();
    } else g.strokeRect(scene.ox / scene.S * k + 0.5, scene.oy / scene.S * k + 0.5, canvas.width / scene.S * k - 1, canvas.height / scene.S * k - 1);
    for (const a of crew.members) {
      if (a.hidden) continue;
      g.fillStyle = DL.ROLES[a.crew.profile.role].color;
      g.fillRect(Math.round(a.x * k) - 1, Math.round(a.y * k) - 2, 3, 3);
    }
    // (on the street the player is not in the datacenter: no dot on its map)
    if (DL.Street && DL.Street.outside) return;
    g.fillStyle = '#ffffff';
    g.beginPath();
    g.arc(player.x * k, player.y * k - 1, 2.4, 0, Math.PI * 2);
    g.fill();
  }

  /* ---------------- loop ---------------- */
  /* ---------------- sound around the listener ---------------- */
  // The ears are on the player while exploring, on the camera while building / managing the team.
  // Coworkers' footsteps and the racks' fans get quieter with distance and come from their side of the
  // screen (isometric: screen x follows x − y).
  const stepOf = new WeakMap(), drinkOf = new WeakMap();
  let earAcc = 0, stepIds = 0;
  function listen(dt) {
    // out on the street or in a shop (street.js): the datacenter's steps and rack fans are not heard there
    if (DL.Street && DL.Street.outside) { earAcc += dt; if (earAcc >= 0.1) { earAcc = 0; DL.audio.near(0, 0); } return; }
    const L = S.mode === 'explore' ? player : scene.cam;
    const fade = (d, r) => 1 / (1 + (d / r) * (d / r));
    const panTo = (x, y) => Math.max(-1, Math.min(1, ((x - y) - (L.x - L.y)) / 96)) * 0.8;
    for (const a of scene.npcs.concat(crew.members)) {
      if (!a.moving || a.hidden) continue;
      const st = stepOf.get(a) || { id: ++stepIds, n: 0 };
      const n = Math.floor(a.dist / 13);
      if (n !== st.n) {
        const d = Math.hypot(a.x - L.x, a.y - L.y);
        if (d < 160) DL.audio.play('foot', { vol: 0.6 * fade(d, 48), pan: panTo(a.x, a.y), key: st.id });
      }
      st.n = n;
      stepOf.set(a, st);
    }
    // the crew on a break: the machine filling their cup, then a sip now and then
    for (const a of crew.members) {
      const c = a.crew;
      if (!c || a.hidden) continue;
      const was = drinkOf.get(a) || { id: ++stepIds };
      const d = Math.hypot(a.x - L.x, a.y - L.y);
      if (d < 160) {
        const o = { vol: 0.7 * fade(d, 48), pan: panTo(a.x, a.y), key: was.id };
        if (c.state === 'fetching' && was.state !== 'fetching' && c.job && c.job.place) DL.audio.fill(c.job.place.kind, o);
        if (c.state === 'sipping' && was.sipT > 0 && c.sipT <= 0) DL.audio.sip(c.cup, o);
      }
      drinkOf.set(a, { id: was.id, state: c.state, sipT: c.sipT });
    }
    earAcc += dt;
    if (earAcc < 0.1) return;
    earAcc = 0;
    if (S.phase === 'intro') { DL.audio.near(0, 0); return; }
    // each rack hums by how many of its machines are running; nearby racks add up (and saturate)
    const racks = new Map();
    for (const d of ops.devices()) if (d.rack && d.state === 'online' && !d.broken && !d.out) racks.set(d.rack, (racks.get(d.rack) || 0) + 1);
    let quiet = 1, pan = 0, sum = 0;
    racks.forEach((n, e) => {
      const x = e.px + (e.tw || 1) * 8, y = e.py + (e.th || 1) * 8;
      const g = 0.6 * Math.min(1, 0.5 + 0.1 * n) * fade(Math.hypot(x - L.x, y - L.y), 24);
      quiet *= 1 - g;
      pan += g * panTo(x, y);
      sum += g;
    });
    DL.audio.near(1 - quiet, sum ? pan / sum : 0);
  }

  let lastClock = '';
  function step(dt) {
    if (S.phase !== 'intro') S.time += dt;
    updatePlayer(dt);
    pet.update(dt);
    if (trails) trails.update(dt);
    if (dataflow) dataflow.update(dt);
    if (pass) pass.update(dt);
    camGlide(dt);
    camToStep(dt);
    liftStep(dt);
    zoomStep(dt);
    if (!zoomOff()) clampCam();
    peopleStep(dt);
    S.target = canMove() ? findTarget() : null;
    // multiplayer.js: in someone else's room the host's game runs the world (crew, devices, money);
    // this one only shows it (G.guest moves the crew to where the host says they are)
    const sim = S.phase !== 'intro' && !G.guest;
    if (G.guest) G.guest.update(dt);
    else crew.update(dt);
    listen(dt);
    if (sim) director.update(dt);
    if (sim && blackout) blackout.update(dt);
    if (!G.guest) ops.update(dt);
    if (sim) economy.update(dt);
    if (sim) helpdesk.update(dt);
    talk.update(dt);
    if (!G.guest) staff.update(dt);
    if (sim) shifts.update(dt);
    if (!G.guest) infra.update(dt);
    monitor.update(dt);
    tutorial.update(dt);
    if (sim) career.update(dt);
    if (sim) problems.update(dt);
    if (S.panel && Math.hypot(S.panel.ix - player.x, S.panel.iy - player.y) > 44) closePanel();
    const c = clockAt(S.time);
    if (c !== lastClock) { lastClock = c; $('clock').textContent = c; }
    if (S.walked > 160) $('hint').classList.add('is-hidden');
    S.liveAcc += dt;
    if (S.liveAcc > 0.25) {
      S.liveAcc = 0;
      // the room tone grows a little as more machines come online (full at 12); up close, listen() does the rest
      const up = S.phase === 'intro' ? -1 : ops.devices().filter((d) => d.state === 'online' && !d.broken && !d.out).length;
      DL.audio.hum(up < 0 ? 0 : 0.15 + 0.45 * Math.min(1, up / 12));
      if (S.panel) {
        const e = S.panel;
        let k = '';
        if (e.kind === 'rack') k = ops.devices().filter((d) => d.rack === e).map((d) => d.state + (d.fault ? d.fault.found : '') + ops.health(d).up + !!d.broken + !!d.out + (d.svc || '')).join();
        else if (e.kind === 'desk') {
          const st = crew.stationOf(e), u = st && crew.userOf(st), o = st && crew.api.ownerOf(st), rec = staff.broken().find((r) => r.item === e);
          k = (u ? u.crew.id + crew.statusOf(u).split(' · ')[0] : '-') + (o ? o.crew.id : '-') + (rec ? 'b' + rec.out + !!rec.taken + staff.claimed(rec) : '') + (P.seat ? P.seat.key.id : '') + crew.members.length;
        }
        // never rebuild under an open dropdown
        const busySel = inner.contains(document.activeElement) && document.activeElement.tagName === 'SELECT';
        if (k !== S.panelKey && !busySel) { S.panelKey = k; renderPanel(); }
        else updateLive();
      }
    }
    G.emit('step', dt);
  }

  // Intro choice: continue with the tutorial (it starts in explore mode) or skip straight into build mode.
  // fromCard: the player pressed "Começar" on the start card (a brand-new world, not a load or an online room)
  function begin(withTutorial, fromCard) {
    if (S.phase !== 'intro') return;
    S.phase = 'play';
    $('intro').classList.remove('is-open');
    // from scratch: a small budget and the starter kit; ready-made environments are already operating
    economy.start(preset);
    career.start();
    problems.reset();
    // presets come with a team already on its routine
    for (const role of DL.PRESETS[preset].crew || []) {
      const p = crew.api.randomProfile();
      p.role = role;
      // the preset's team is already employed: no hiring cost (salaries run from now on)
      crew.api.hire(p, { silent: true, free: true, at: crew.api.nav.randomSpot(), level: 1 + Math.floor(Math.random() * 3) });
    }
    crew.startShift();
    // presets come with specialised servers (web, banco, DNS…) and a virtualization node with VMs
    if (preset !== 'zero') infra.seed(preset);
    if (preset !== 'zero') toast('ok', DL.PRESETS[preset].name, 'Ambiente pronto · personalize à vontade com B');
    if (document.activeElement) document.activeElement.blur();
    const start = () => { if (withTutorial) tutorial.begin(); else setMode('build'); };
    // a brand-new world opens with a short scene on the street (street.js); the tutorial waits for it
    const scene0 = fromCard && DL.Street && DL.Street.intro;
    if (!scene0) start();
    S.preset = preset;
    // (cloud-sync.js: with an account, the new game gets a cloud save slot)
    G.emit('game-begin', { preset });
    if (scene0) DL.Street.intro(start);
  }

  let lastFrame = performance.now();
  const render = scene.render.bind(scene);
  // While a window covers the whole screen (console, shop, monitor…) the map behind it is blurred: it is
  // redrawn only twice a second instead of every frame (the game itself keeps running).
  let coverAt = 0, covered = false, lastDraw = 0;
  scene.render = function () {
    const now = performance.now();
    if (now - coverAt > 200) { coverAt = now; covered = isOverlayOpen(); }
    if (covered && now - lastDraw < 500) return;
    lastDraw = now;
    render();
    updateWorldUi();
    builder.updateUi();
    if (S.mode === 'build') fitDock();
    crew.updateUi(Math.max(0, (now - lastFrame) / 1000));
    economy.updateUi();
    lastFrame = now;
    drawMinimap();
  };

  addEventListener('resize', () => {
    scene.o.tilesWide = narrow() ? 10 : 21;
    scene.o.padTop = narrow() ? 120 : 96;
    scene.resize();
  });
  choosePreset('zero');
  updateMeta();
  scene.start(step);
  requestAnimationFrame(() => requestAnimationFrame(() => game.classList.add('is-ready')));
  $('tutStart').focus({ preventScroll: true });

  // exposed for debugging / automated checks
  window.DataLabDemo = { scene, state: S, player, builder, decor, economy, career, problems, talk, crew, roles, helpdesk, netlab, tutorial, ops, terminal, cabling, monitor, staff, infra, director, shifts, inventory, pet, emotes, trails, dataflow, blackout, pass, seat: { down: seatDown, stand: seatStand, nearest: nearestSeat, get state() { return P; } }, setMode, begin, game: G, openPanel, choosePreset,
    // fast-forward the simulation (game minutes) without drawing — for automated checks
    step,
    advance(sec, dt) { dt = dt || 0.1; for (let t = 0; t < sec; t += dt) { step(dt); scene.update(dt); } },
  };
})();
