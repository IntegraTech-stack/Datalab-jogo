/* DataLab — the computer screen (pcdesk.js).
   When the player's character sits at a workstation (F), the screen of that computer opens: a full desktop
   with a wallpaper, shortcuts, a taskbar / dock / top bar and a start menu, like the phone but for the PC.
   The look is the one chosen on the desk (build mode → click the desk → "Sistema"): Windows, Linux or macOS
   (the desk's or the monitor's `os`; empty = Windows). The apps are the phone's apps (phone.js): clicking one
   presses the same old button, so every window opens on top of the desktop.
   Esc puts the screen away (the character stays seated; a chip brings it back); F / walking stands up. */
(function () {
  'use strict';
  const DL = (window.DL = window.DL || {});
  const $ = (id) => document.getElementById(id);
  const game = $('game');
  if (!game || new URLSearchParams(location.search).has('hero')) return;
  const root = document.documentElement;
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const OS = {
    win: { name: 'Windows', logo: 'win' },
    linux: { name: 'Linux', logo: 'linux' },
    mac: { name: 'macOS', logo: 'mac' },
  };
  const osKey = (v) => (v === 'linux' || v === 'mac' ? v : 'win');
  DL.PCOS = OS;

  /* ---------- little SVG logos (original, simple shapes) ---------- */
  const LOGO = {
    win: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1 2.6 7 1.8v5.6H1zM8 1.7 15 .7v6.7H8zM1 8.4h6v5.8L1 13.4zM8 8.4h7v6.9L8 14.3z" fill="currentColor"/></svg>',
    mac: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M11.4 8.5c0-1.6 1.3-2.3 1.4-2.4-.8-1.1-1.9-1.3-2.3-1.3-1-.1-1.9.6-2.4.6s-1.2-.6-2-.5c-1 0-2 .6-2.5 1.5-1.1 1.9-.3 4.6.8 6.1.5.7 1.1 1.5 1.9 1.5.8 0 1-.5 2-.5s1.2.5 2 .5 1.4-.7 1.9-1.4c.6-.8.8-1.6.8-1.7-.1 0-1.6-.6-1.6-2.4zM10 3.6c.4-.5.7-1.2.6-1.9-.6 0-1.3.4-1.8.9-.4.4-.7 1.1-.6 1.8.7.1 1.4-.3 1.8-.8z" fill="currentColor"/></svg>',
    linux: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.6"/><circle cx="3.6" cy="6.4" r="1.5" fill="currentColor"/><circle cx="11.6" cy="3.6" r="1.5" fill="currentColor"/><circle cx="11.6" cy="12.4" r="1.5" fill="currentColor"/></svg>',
    grid: '<svg viewBox="0 0 16 16" aria-hidden="true">' + [2, 7, 12].map((y) => [2, 7, 12].map((x) => '<rect x="' + (x - 1) + '" y="' + (y - 1) + '" width="2.4" height="2.4" rx="1.1" fill="currentColor"/>').join('')).join('') + '</svg>',
    wifi: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M1.5 6a9.5 9.5 0 0 1 13 0M3.8 8.6a6.2 6.2 0 0 1 8.4 0M6 11.2a3 3 0 0 1 4 0" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/><circle cx="8" cy="13" r="1" fill="currentColor"/></svg>',
    vol: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2 6h3l4-3v10l-4-3H2z" fill="currentColor"/><path d="M11 5.5a3.4 3.4 0 0 1 0 5" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
    bat: '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="1.5" y="4.5" width="11" height="7" rx="1.5" fill="none" stroke="currentColor" stroke-width="1.3"/><rect x="3" y="6" width="7" height="4" rx=".6" fill="currentColor"/><rect x="13.2" y="6.8" width="1.4" height="2.4" rx=".5" fill="currentColor"/></svg>',
    power: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5v6M4.4 3.8a5.6 5.6 0 1 0 7.2 0" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
    info: '<svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M8 7.2v4M8 4.6v1" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  };

  /* ---------- the shell ---------- */
  const el = document.createElement('div');
  el.className = 'pcd';
  el.id = 'pcd';
  el.hidden = true;
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Tela do computador');
  game.appendChild(el);
  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'pcd-chip';
  chip.hidden = true;
  chip.innerHTML = '<span class="pcd-chip__ico" aria-hidden="true"></span>Abrir a tela do PC';
  game.appendChild(chip);

  let isOpen = false, os = 'win', seat = null, menuOn = false, zTop = 5;
  const demo = () => window.DataLabDemo;
  const PA = () => DL.PhoneApps;
  const apps = () => { const pa = PA(); return pa ? pa.apps.filter((p) => pa.shown(p)) : []; };
  const dockApp = (id) => { const pa = PA(); return pa && pa.dock.find((p) => p.id === id); };
  const PIN = ['tasks', 'mon', 'chat', 'help', 'infra', 'lab', 'shop', 'inv'];
  const pinned = () => { const all = apps(); return PIN.map((id) => all.find((p) => p.id === id)).filter(Boolean); };
  const tile = (p) => '<span class="pcd-tile" style="--app-c:' + p.c + ';--app-acc:' + p.a + '">' + PA().icon(p.ico) + '<b class="pcd-badge" hidden></b></span>';
  const appBtn = (p, cls, label) => '<button type="button" class="' + cls + '" data-app="' + p.id + '" title="' + esc(p.name) + '">' + tile(p) + (label === false ? '' : '<span class="pcd-lbl">' + esc(p.name) + '</span>') + '</button>';

  const seatName = () => { const D = demo(); try { return D && seat ? D.crew.api.stationName(seat) : 'Computador'; } catch (e) { return 'Computador'; } };
  const userName = () => { const D = demo(); return (D && D.crew && D.crew.playerProfile && D.crew.playerProfile.name) || 'Você'; };
  const userRole = () => { const D = demo(); const r = D && D.crew && D.crew.playerProfile && DL.ROLES && DL.ROLES[D.crew.playerProfile.role]; return r ? r.title : ''; };

  /* ---------- the desktop for each system ---------- */
  function icons() {
    return '<div class="pcd-icons">' + apps().map((p) => appBtn(p, 'pcd-ico')).join('') + '</div>';
  }
  function sysButtons(cls) {
    return [['stand', 'Levantar da mesa', 'power'], ['save', 'Salvar o jogo', 'bat'], ['gear', 'Ajustes', 'grid'], ['exit', 'Menu principal', 'info'], ['hide', 'Minimizar a tela', 'wifi']]
      .map(([id, l]) => '<button type="button" class="' + cls + '" data-sys="' + id + '">' + LOGO[{ stand: 'power', save: 'bat', gear: 'grid', exit: 'info', hide: 'wifi' }[id]].replace('<svg', '<svg class="pcd-sysico"') + '<span>' + l + '</span></button>').join('');
  }
  function appGrid() {
    return '<div class="pcd-grid">' + apps().map((p) => appBtn(p, 'pcd-gapp')).join('') + '</div>';
  }
  const DAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

  function html() {
    const logo = LOGO[OS[os].logo];
    if (os === 'win') {
      return '<div class="pcd-wp"></div>' + icons() + '<div class="pcd-wins"></div>' +
        '<div class="pcd-menu pcd-menu--start" hidden><div class="pcd-menu__head"><b>Fixados</b><span>' + esc(userName()) + '</span></div>' + appGrid() + '<div class="pcd-menu__foot">' + sysButtons('pcd-sys') + '</div></div>' +
        '<div class="pcd-bar pcd-bar--win"><div class="pcd-bar__mid"><button type="button" class="pcd-start" data-menu="1" title="Iniciar">' + logo + '</button>' +
        pinned().map((p) => appBtn(p, 'pcd-pin', false)).join('') + '</div>' +
        '<div class="pcd-tray"><span class="pcd-tray__ico">' + LOGO.wifi + LOGO.vol + LOGO.bat + '</span><span class="pcd-clock"><b data-clock>08:00</b><small data-day></small></span></div></div>';
    }
    if (os === 'linux') {
      return '<div class="pcd-wp"></div>' + icons() + '<div class="pcd-wins"></div>' +
        '<div class="pcd-menu pcd-menu--grid" hidden><div class="pcd-menu__head"><b>Aplicativos</b><span>' + esc(userName()) + '</span></div>' + appGrid() + '<div class="pcd-menu__foot">' + sysButtons('pcd-sys') + '</div></div>' +
        '<div class="pcd-bar pcd-bar--top"><button type="button" class="pcd-act" data-menu="1">Atividades</button><span class="pcd-clock pcd-clock--mid"><b data-clock>08:00</b><small data-day></small></span>' +
        '<span class="pcd-tray"><span class="pcd-tray__ico">' + LOGO.wifi + LOGO.vol + LOGO.bat + '</span><span class="pcd-user">' + esc(userName()) + '</span></span></div>' +
        '<div class="pcd-dock pcd-dock--side">' + pinned().map((p) => appBtn(p, 'pcd-pin', false)).join('') + '<button type="button" class="pcd-pin pcd-pin--grid" data-menu="1" title="Mostrar aplicativos">' + LOGO.grid + '</button></div>';
    }
    return '<div class="pcd-wp"></div>' + icons() + '<div class="pcd-wins"></div>' +
      '<div class="pcd-menu pcd-menu--apple" hidden>' +
        '<button type="button" class="pcd-sys" data-win="about">' + LOGO.info.replace('<svg', '<svg class="pcd-sysico"') + '<span>Sobre este computador</span></button><hr>' + sysButtons('pcd-sys') + '</div>' +
      '<div class="pcd-menu pcd-menu--grid pcd-menu--launch" hidden><div class="pcd-menu__head"><b>Launchpad</b><span>' + esc(userName()) + '</span></div>' + appGrid() + '</div>' +
      '<div class="pcd-bar pcd-bar--mac"><button type="button" class="pcd-apple" data-apple="1" title="Menu">' + logo + '</button><b class="pcd-appname">DataLab</b>' +
      '<span class="pcd-mmenus"><span>Arquivo</span><span>Editar</span><span>Visualizar</span><span>Janela</span><span>Ajuda</span></span>' +
      '<span class="pcd-tray"><span class="pcd-tray__ico">' + LOGO.wifi + LOGO.vol + LOGO.bat + '</span><span class="pcd-clock"><b data-clock>08:00</b><small data-day></small></span></span></div>' +
      '<div class="pcd-dock pcd-dock--bottom"><button type="button" class="pcd-pin pcd-pin--grid" data-menu="1" title="Launchpad">' + LOGO.grid + '</button><i class="pcd-sep"></i>' +
      pinned().map((p) => appBtn(p, 'pcd-pin', false)).join('') + '</div>';
  }

  function render() {
    el.className = 'pcd pcd--' + os + (isOpen ? ' is-open' : '');
    el.innerHTML = '<div class="pcd-screen">' + html() + '</div>';
    menuOn = false;
    tick(true);
    badges();
  }

  /* ---------- small windows (About) ---------- */
  function openWin(kind) {
    const layer = el.querySelector('.pcd-wins');
    if (!layer) return;
    let w = layer.querySelector('[data-w="' + kind + '"]');
    if (w) { w.style.zIndex = ++zTop; return; }
    w = document.createElement('div');
    w.className = 'pcd-win';
    w.dataset.w = kind;
    w.style.zIndex = ++zTop;
    const rows = [['Estação', seatName()], ['Usuário', userName()], userRole() ? ['Cargo', userRole()] : null, ['Sistema', OS[os].name + ' · tema do DataLab'], ['Hora no jogo', clockText()]].filter(Boolean);
    w.innerHTML = '<div class="pcd-win__bar" data-drag="1"><span class="pcd-win__dots"><button type="button" class="pcd-win__x" data-wclose="1" aria-label="Fechar"></button><i></i><i></i></span><b>Sobre este computador</b></div>' +
      '<div class="pcd-win__body"><div class="pcd-win__logo">' + LOGO[OS[os].logo] + '</div><h3>' + OS[os].name + '</h3><dl>' + rows.map(([k, v]) => '<dt>' + k + '</dt><dd>' + esc(v) + '</dd>').join('') + '</dl>' +
      '<p>Para trocar o sistema, entre no modo construir, clique na mesa e escolha em <b>Sistema</b>.</p></div>';
    layer.appendChild(w);
  }
  let drag = null;
  el.addEventListener('pointerdown', (ev) => {
    const w = ev.target.closest('.pcd-win');
    if (w) w.style.zIndex = ++zTop;
    const bar = ev.target.closest('[data-drag]');
    if (!bar || ev.target.closest('button')) return;
    const win = bar.closest('.pcd-win'), r = win.getBoundingClientRect(), pr = win.parentElement.getBoundingClientRect();
    drag = { win, dx: ev.clientX - r.left + pr.left, dy: ev.clientY - r.top + pr.top, id: ev.pointerId };
    win.style.right = 'auto'; win.style.bottom = 'auto'; win.style.transform = 'none';
    win.style.left = r.left - pr.left + 'px'; win.style.top = r.top - pr.top + 'px';
    bar.setPointerCapture && bar.setPointerCapture(ev.pointerId);
    ev.preventDefault();
  });
  el.addEventListener('pointermove', (ev) => {
    if (!drag || ev.pointerId !== drag.id) return;
    const pr = drag.win.parentElement.getBoundingClientRect();
    drag.win.style.left = Math.max(0, Math.min(pr.width - 80, ev.clientX - drag.dx)) + 'px';
    drag.win.style.top = Math.max(0, Math.min(pr.height - 40, ev.clientY - drag.dy)) + 'px';
  });
  const endDrag = (ev) => { if (drag && ev.pointerId === drag.id) drag = null; };
  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);

  /* ---------- menus and clicks ---------- */
  function setMenu(on, which) {
    menuOn = on;
    for (const m of el.querySelectorAll('.pcd-menu')) m.hidden = true;
    el.classList.toggle('has-menu', on);
    if (!on) return;
    const m = el.querySelector(which || '.pcd-menu--start, .pcd-menu--grid');
    if (m) { m.hidden = false; const f = m.querySelector('button'); if (f) setTimeout(() => f.focus({ preventScroll: true }), 30); }
  }
  function sys(id) {
    setMenu(false);
    const D = demo(), pa = PA();
    if (id === 'stand') { if (D) D.seat.stand(); close(); return; }
    if (id === 'hide') { close(); return; }
    const p = dockApp(id);
    if (p && pa) pa.launch(p);
  }
  el.addEventListener('click', (ev) => {
    const t = ev.target;
    const a = t.closest('[data-app]');
    if (a) {
      setMenu(false);
      const pa = PA(), p = pa && pa.apps.find((x) => x.id === a.dataset.app);
      if (p) { a.classList.add('is-launch'); setTimeout(() => a.classList.remove('is-launch'), 400); pa.launch(p); }
      return;
    }
    const s = t.closest('[data-sys]');
    if (s) { sys(s.dataset.sys); return; }
    const w = t.closest('[data-win]');
    if (w) { setMenu(false); openWin(w.dataset.win); return; }
    if (t.closest('[data-wclose]')) { t.closest('.pcd-win').remove(); return; }
    if (t.closest('[data-apple]')) { menuOn && el.querySelector('.pcd-menu--apple:not([hidden])') ? setMenu(false) : setMenu(true, '.pcd-menu--apple'); return; }
    if (t.closest('[data-menu]')) { setMenu(!menuOn); return; }
    // a click on the wallpaper puts a menu away
    if (menuOn && !t.closest('.pcd-menu')) setMenu(false);
  });

  /* ---------- clock and badges ---------- */
  function clockText() {
    return DL.DayNight ? DL.DayNight.hora : ($('clock') && $('clock').textContent) || '08:00';
  }
  let lastClock = '';
  function tick(force) {
    if (!isOpen && !force) return;
    const h = clockText();
    if (h !== lastClock || force) {
      lastClock = h;
      const per = DL.DayNight ? { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' }[DL.DayNight.periodo] || '' : '';
      for (const n of el.querySelectorAll('[data-clock]')) n.textContent = h;
      for (const n of el.querySelectorAll('[data-day]')) n.textContent = per;
    }
    badges();
  }
  function badges() {
    const pa = PA();
    if (!pa) return;
    for (const n of el.querySelectorAll('[data-app]')) {
      const p = pa.apps.find((x) => x.id === n.dataset.app), b = n.querySelector('.pcd-badge');
      if (!p || !b) continue;
      const v = pa.badge(p);
      if (b.hidden === !v && b.textContent === v) continue;
      b.hidden = !v; b.textContent = v;
    }
  }
  setInterval(() => { tick(); watch(); }, 400);

  /* ---------- open / close ---------- */
  function open(s) {
    if (isOpen || !PA()) return;
    const D = demo();
    if (!D || D.state.mode !== 'explore' || document.querySelector('.overlay.is-open')) return;
    seat = s || (D.seat.state && D.seat.state.seat) || null;
    if (!seat) return;
    os = osKey((seat.screen && seat.screen.os) || (seat.key && seat.key.os));
    isOpen = true;
    el.hidden = false;
    render();
    root.classList.add('is-pcdesk');
    requestAnimationFrame(() => el.classList.add('is-open'));
    chip.hidden = true;
    if (DL.audio && DL.audio.play) DL.audio.play('modeIn');
  }
  function close() {
    if (!isOpen) return;
    isOpen = false;
    el.classList.remove('is-open');
    root.classList.remove('is-pcdesk');
    setTimeout(() => { if (!isOpen) el.hidden = true; }, 260);
    if (el.contains(document.activeElement)) document.activeElement.blur();
  }
  // the character got up (F, walking, a broken PC…): the screen goes dark; sitting down again turns it on
  function watch() {
    const D = demo();
    const st = D && D.seat && D.seat.state;
    const seated = !!(st && st.seat && !st.glide);
    if (isOpen && !(st && st.seat)) close();
    const free = !document.querySelector('.overlay.is-open') && D && D.state.mode === 'explore';
    chip.hidden = !(seated && !isOpen && free);
  }
  chip.addEventListener('click', () => { chip.blur(); open(); });
  DL.PCDesk = { open, close, get isOpen() { return isOpen; }, get os() { return os; } };

  /* ---------- keyboard ---------- */
  addEventListener('keydown', (ev) => {
    if (!isOpen) return;
    if (document.querySelector('.overlay.is-open')) return; // an app is up: it owns the keys
    const k = ev.code;
    if (k === 'Escape') { ev.preventDefault(); ev.stopImmediatePropagation(); if (menuOn) setMenu(false); else close(); return; }
    // the character stays put while the screen is up
    if (/^(Key[WASD]|Arrow(Up|Down|Left|Right))$/.test(k)) ev.stopImmediatePropagation();
  }, true);
})();
