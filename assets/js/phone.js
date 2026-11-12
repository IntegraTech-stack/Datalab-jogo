/* DataLab — the game menu as a little phone (PC and phones).
   The top bar has one button (Menu, key Tab); the phone slides up from the bottom of the screen with a
   status bar (game time, signal, battery — the UPS battery during a blackout), a title with the × to close,
   the apps in sections (Operações · Loja · Jogo · Música) with notification badges, a dock with the system
   apps and a home bar. It closes by the ×, Esc / Tab, a tap outside, swiping it down or the Back button.
   Each app only clicks the old top-bar button it stands for (#opsBtn, #storeBtn…): those buttons stay in
   the page (hidden) with every listener and badge the other modules already wire to them, so nothing else
   changes. An app opened from here comes back to the menu when it is closed.
   Touch, mouse and keyboard: arrows move between apps, Enter opens, Esc / Tab closes. */
(function () {
  'use strict';
  const DL = (window.DL = window.DL || {});
  const $ = (id) => document.getElementById(id);
  const top = document.querySelector('.hud-top'), actions = $('hudActions');
  if (!top || !actions || !$('game')) return;
  if (new URLSearchParams(location.search).has('hero')) return; // the landing's silent showcase
  const root = document.documentElement;
  const touch = matchMedia('(hover: none) and (pointer: coarse)').matches;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------------- pixel icons (12×12; # = glyph, o = accent) ---------------- */
  const ICONS = {
    tasks: ['...####.....', '.##....##...', '.#.####.#...', '.#......#...', '.#.##...#.o.', '.#......#oo.', '.#.##..o#o..', '.#.....oo#..', '.#.##...o#..', '.#......#...', '.########...', '............'],
    help: ['...######...', '..#......#..', '.#........#.', '.#........#.', 'oo........oo', 'oo........oo', 'oo........oo', '.........#..', '........#...', '.....###....', '............', '............'],
    mon: ['############', '#..........#', '#.......o..#', '#......o.o.#', '#.o...o...o#', '#o.o.o.....#', '#...o......#', '#..........#', '############', '.....##.....', '...######...', '............'],
    infra: ['############', '#..........#', '#.oo....##.#', '############', '#..........#', '#.oo....##.#', '############', '#..........#', '#.oo....##.#', '############', '............', '............'],
    lab: ['....###.....', '....#o#.....', '....###.....', '.....#......', '.....#......', '..#######...', '..#.....#...', '.###...###..', '.#o#...#o#..', '.###...###..', '............', '............'],
    chat: ['.##########.', '#..........#', '#..........#', '#.oo.oo.oo.#', '#..........#', '#..........#', '.####.#####.', '....#.#.....', '....##......', '....#.......', '............', '............'],
    shop: ['....####....', '...#....#...', '...#....#...', '.##########.', '.#........#.', '.#...oo...#.', '.#..o..o..#.', '.#...oo...#.', '.#........#.', '.##########.', '............', '............'],
    inv: ['.####..####.', '.#oo#..#oo#.', '.#oo#..#oo#.', '.####..####.', '............', '.####..####.', '.#oo#..#oo#.', '.#oo#..#oo#.', '.####..####.', '............', '............', '............'],
    pass: ['............', '.##########.', '.#........#.', '.#.o..o.o.#.', '.#..oo.o..#.', '.#........#.', '..#......#..', '.#........#.', '.#..####..#.', '.##########.', '............', '............'],
    friends: ['..##....##..', '.#..#..#..#.', '.#..#..#..#.', '..##....##..', '............', '.####..####.', '#....##....#', '#....##....#', '#....##....#', '............', '............', '............'],
    account: ['....####....', '...#....#...', '...#....#...', '...#....#...', '....####....', '............', '..########..', '.#........#.', '#..........#', '#..........#', '############', '............'],
    spot: ['...######...', '..#......#..', '.#........#.', '#..oooooo..#', '#.o......o.#', '#...oooo...#', '#..o....o..#', '#....oo....#', '.#........#.', '..#......#..', '...######...', '............'],
    ytm: ['...######...', '..#......#..', '.#........#.', '#...#.....#', '#...##....#.', '#...#o#...#.', '#...#o#...#.', '#...##....#.', '.#..#.....#.', '..#......#..', '...######...', '............'],
    ai: ['.....o......', '.....#......', '..########..', '.#........#.', '.#.oo..oo.#.', '.#.oo..oo.#.', '.#........#.', '.#..####..#.', '..########..', '...#....#...', '..##....##..', '............'],
    gear: ['....####....', '.#.#....#.#.', '..#......#..', '.#...oo...#.', '#...o..o...#', '#...o..o...#', '.#...oo...#.', '..#......#..', '.#.#....#.#.', '....####....', '............', '............'],
    bug: ['..#......#..', '...#....#...', '....####....', '...#oooo#...', '#.#o#oo#o#.#', '.##oooooo##.', '#.#oo##oo#.#', '..#oooooo#..', '.#.######.#.', '#..........#', '............', '............'],
    save: ['##########..', '#.######.#..', '#.######.#..', '#........##.', '#.........#.', '#..oooooo.#.', '#..o....o.#.', '#..o....o.#.', '#..oooooo.#.', '###########.', '............', '............'],
    exit: ['#######.....', '#.....#.....', '#.....#..o..', '#.....#...o.', '#..ooooooooo', '#.....#...o.', '#.....#..o..', '#.....#.....', '#.....#.....', '#######.....', '............', '............'],
    room: ['...######...', '..#..#...#..', '.#..#.....#.', '#..#.......#', '#ooooooooo.#', '#..#.....#.#', '#..#.....#.#', '#ooooooooo.#', '.#..#...#.#.', '..#..#..##..', '...######...', '............'],
    bg: ['############', '#..........#', '#..........#', '#..........#', '#......####.', '#......#oo#.', '#......#oo#.', '#......####.', '#..........#', '############', '............', '............'],
  };
  // the ytm glyph had short rows (the icon came out crooked): redrawn as a play button in a ring
  ICONS.ytm = ['...######...', '..#......#..', '.#........#.', '#...o......#', '#...oo.....#', '#...ooo....#', '#...oooo...#', '#...ooo....#', '#...oo.....#', '.#..o.....#.', '..#......#..', '...######...'];
  // each glyph is centred on its 12×12 tile by whole pixels (most were drawn hugging the top), so the art
  // stays sharp at 2× / 3× and every icon sits in the middle of its tile
  function icon(name) {
    const g = ICONS[name] || ICONS.tasks;
    let x0 = 12, x1 = -1, y0 = 12, y1 = -1;
    g.forEach((row, y) => { for (let x = 0; x < row.length; x++) if (row[x] !== '.') { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); } });
    const dx = Math.floor((12 - (x1 - x0 + 1)) / 2) - x0, dy = Math.floor((12 - (y1 - y0 + 1)) / 2) - y0;
    let a = '', b = '';
    g.forEach((row, y) => { for (let x = 0; x < row.length; x++) { const c = row[x], p = 'M' + (x + dx) + ' ' + (y + dy) + 'h1v1h-1z'; if (c === '#') a += p; else if (c === 'o') b += p; } });
    return '<svg viewBox="0 0 12 12" shape-rendering="crispEdges" aria-hidden="true"><path d="' + a + '" fill="currentColor"/><path d="' + b + '" fill="var(--app-acc)"/></svg>';
  }

  /* ---------------- the apps: each one presses an existing button ---------------- */
  // sections in a fixed order; c = tile colour (the section's), a = accent pixels; badge = the button's own counter
  const CATS = [
    { id: 'ops', name: 'Operações', c: '#0d6448', a: '#3dffa2' },
    { id: 'shop', name: 'Loja', c: '#86560c', a: '#ffd166' },
    { id: 'game', name: 'Jogo', c: '#47307f', a: '#c9a8ff' },
    { id: 'music', name: 'Música', c: '#1b2a3f', a: '#8a98ad' },
  ];
  const APPS = [
    { id: 'tasks', cat: 'ops', name: 'Tarefas', btn: 'opsBtn', badge: 'opsBadge', ico: 'tasks', a: '#ffd166', key: 'T' },
    { id: 'help', cat: 'ops', name: 'Atendimento', btn: 'hdBtn', badge: 'hdBadge', ico: 'help', a: '#9fd0ff', key: 'H' },
    { id: 'mon', cat: 'ops', name: 'Monitor', btn: 'monBtn', badge: 'monBadge', ico: 'mon', a: '#ff9830', key: 'M' },
    { id: 'infra', cat: 'ops', name: 'Infra', btn: 'infraBtn', ico: 'infra', a: '#7ee0ff', key: 'I' },
    { id: 'lab', cat: 'ops', name: 'Lab', btn: 'nlBtn', ico: 'lab', a: '#ffd166', key: 'L' },
    { id: 'chat', cat: 'ops', name: 'Chat', btn: null, badge: 'chatBadge', ico: 'chat', a: '#d8ffcf', key: 'K', title: 'Chat da equipe' },
    { id: 'ai', cat: 'ops', name: 'IA', btn: 'aiBtn', ico: 'ai', a: '#7ee0ff', title: 'IA da equipe' },
    { id: 'room', cat: 'ops', name: 'Abrir sala', btn: 'mpOpenBtn', ico: 'room', a: '#ffd166' },
    { id: 'shop', cat: 'shop', name: 'Loja', btn: 'storeBtn', ico: 'shop', a: '#fff1b8', key: 'O' },
    { id: 'inv', cat: 'shop', name: 'Inventário', btn: 'invBtn', ico: 'inv', a: '#ff9be9', key: 'U' },
    { id: 'pass', cat: 'shop', name: 'Passe', btn: 'passBtn', ico: 'pass', a: '#ffe066', key: 'J' },
    { id: 'friends', cat: 'game', name: 'Amigos', btn: 'friendsBtn', badge: 'friendsBadge', ico: 'friends', a: '#ffb3c4' },
    { id: 'account', cat: 'game', name: 'Conta', btn: 'accountBtn', ico: 'account', a: '#e6ecf5' },
    { id: 'bg', cat: 'game', name: 'Segundo plano', btn: 'bgBtn', ico: 'bg', a: '#8a98ad' },
    { id: 'spot', cat: 'music', name: 'Spotify', btn: 'spotBtn', ico: 'spot', c: '#12482a', a: '#1ed760', wide: true },
    { id: 'ytm', cat: 'music', name: 'YouTube Music', btn: 'ytmBtn', ico: 'ytm', c: '#5c1212', a: '#ff4e45', wide: true },
  ];
  const DOCK = [
    { id: 'save', name: 'Salvar', btn: 'saveBtn', ico: 'save', c: '#0d6448', a: '#3dffa2', keep: true },
    { id: 'gear', name: 'Ajustes', btn: 'helpBtn', ico: 'gear', c: '#33405c', a: '#9fb0cc' },
    { id: 'bug', name: 'Relatar bug', btn: 'fbBtn', ico: 'bug', c: '#6b3a10', a: '#ffb347' },
    { id: 'exit', name: 'Sair', btn: 'menuBtn', ico: 'exit', c: '#5a1f2a', a: '#ff5d6c', title: 'Salvar e voltar ao Menu Principal' },
  ];
  const catOf = {};
  CATS.forEach((c) => { catOf[c.id] = c; });
  APPS.forEach((p) => { if (!p.c) p.c = catOf[p.cat].c; });
  const appHtml = (p, dock) =>
    '<button type="button" class="papp' + (dock ? ' papp--dock' : '') + (p.wide ? ' papp--wide' : '') + (!p.wide && p.name.split(' ').some((w) => w.length > 8) ? ' papp--long' : '') + '" data-app="' + p.id + '" role="menuitem" style="--app-c:' + p.c + ';--app-acc:' + p.a + '"' +
    ' title="' + (p.title || p.name) + (p.key && !touch ? ' (' + p.key + ')' : '') + '">' +
    '<span class="papp__ico">' + icon(p.ico) + '</span><b class="papp__badge" hidden></b><span class="papp__name">' + p.name + '</span></button>';
  const secHtml = (c) =>
    '<section class="phone__sec" data-cat="' + c.id + '" style="--cat-c:' + c.c + ';--cat-a:' + c.a + '">' +
      '<h3 class="phone__sech">' + c.name + '</h3>' +
      '<div class="phone__grid">' + APPS.filter((p) => p.cat === c.id).map((p) => appHtml(p)).join('') + '</div>' +
    '</section>';
  // a pixel × for the close button
  const XICO = '<svg viewBox="0 0 7 7" shape-rendering="crispEdges" aria-hidden="true"><path d="M0 0h1v1H0zM1 1h1v1H1zM2 2h1v1H2zM3 3h1v1H3zM4 4h1v1H4zM5 5h1v1H5zM6 6h1v1H6zM6 0h1v1H6zM5 1h1v1H5zM4 2h1v1H4zM2 4h1v1H2zM1 5h1v1H1zM0 6h1v1H0z" fill="currentColor"/></svg>';

  /* ---------------- the phone ---------------- */
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.id = 'phoneBtn';
  btn.className = 'btn btn--sm ops-btn phone-btn';
  btn.setAttribute('aria-controls', 'phone');
  btn.setAttribute('aria-expanded', 'false');
  btn.setAttribute('aria-haspopup', 'dialog');
  btn.title = 'Menu: tarefas, loja, chat, amigos, conta e mais' + (touch ? '' : ' (Tab)');
  btn.innerHTML = '<span class="phone-btn__ico" aria-hidden="true"><i></i></span><span class="phone-btn__lbl">Menu</span>' + (touch ? '' : '<kbd>Tab</kbd>') + '<span class="ops-badge phone-btn__badge" hidden>0</span>';
  top.insertBefore(btn, actions);
  root.classList.add('has-phone');

  const ph = document.createElement('div');
  ph.className = 'phone';
  ph.id = 'phone';
  ph.setAttribute('role', 'dialog');
  ph.setAttribute('aria-modal', 'true');
  ph.setAttribute('aria-label', 'Menu');
  ph.setAttribute('aria-hidden', 'true');
  ph.inert = true;
  ph.innerHTML =
    '<div class="phone__body">' +
      '<span class="phone__key phone__key--a" aria-hidden="true"></span><span class="phone__key phone__key--b" aria-hidden="true"></span>' +
      '<div class="phone__screen">' +
        '<div class="phone__status" aria-hidden="true">' +
          '<span class="phone__time" id="phoneTime">08:00</span>' +
          '<span class="phone__cam"></span>' +
          '<span class="phone__sys"><span class="phone__sig"><i></i><i></i><i></i><i></i></span><span class="phone__net">DL</span>' +
          '<span class="phone__bat"><i id="phoneBatFill"></i></span><b class="phone__pct" id="phoneBatPct">100%</b></span>' +
        '</div>' +
        '<div class="phone__head">' +
          '<div class="phone__title"><b>Menu</b><span class="phone__sub"><span id="phoneDay">Manhã</span><span class="phone__cash" id="phoneCash"></span></span></div>' +
          '<button type="button" class="phone__x" aria-label="Fechar o menu' + (touch ? '' : ' (Esc)') + '">' + XICO + '</button>' +
        '</div>' +
        '<div class="phone__apps" role="menu" aria-label="Apps">' + CATS.map(secHtml).join('') + '</div>' +
        '<div class="phone__dock" role="menu" aria-label="Sistema">' + DOCK.map((p) => appHtml(p, true)).join('') + '</div>' +
        '<button type="button" class="phone__home" aria-label="Fechar o menu"><i></i></button>' +
      '</div>' +
    '</div>';
  const scrim = document.createElement('div');
  scrim.className = 'phone-scrim';
  const game = $('game');
  game.appendChild(scrim);
  game.appendChild(ph);
  const scroller = ph.querySelector('.phone__apps');
  const secs = [...ph.querySelectorAll('.phone__sec')];

  const ALL = APPS.concat(DOCK);
  const byId = {};
  ALL.forEach((p) => { byId[p.id] = p; p.el = ph.querySelector('[data-app="' + p.id + '"]'); p.badgeEl = p.el.querySelector('.papp__badge'); });

  /* ---------------- open / close (+ the phone's own Back button) ---------------- */
  // Opening the menu adds a step to the browser history, so Android's Back button (or the browser's) closes
  // it — and from an app opened here, Back goes back to the menu — instead of leaving the game.
  let open = false;
  let popSkip = 0;
  let outT = 0;
  const ours = () => !!(history.state && history.state.dlPhone);
  function histPut(kind) {
    try { if (ours()) history.replaceState({ dlPhone: kind }, ''); else history.pushState({ dlPhone: kind }, ''); } catch (e) { /* sandboxed */ }
  }
  function histDrop() {
    if (!ours()) return;
    popSkip++;
    try { history.back(); } catch (e) { popSkip--; }
  }
  function setOpen(on, opts) {
    if (on === open) return;
    opts = opts || {};
    open = on;
    root.classList.toggle('is-phone', on);
    ph.classList.toggle('is-open', on);
    ph.setAttribute('aria-hidden', String(!on));
    ph.inert = !on;
    btn.setAttribute('aria-expanded', String(on));
    const D = window.DataLabDemo;
    if (D && D.scene) D.scene.o.calm = on; // the game behind keeps running but stops redrawing (scene.js)
    // coming back: the blur fades out quickly (phone.css), then the usual filter transition returns
    clearTimeout(outT);
    root.classList.toggle('is-phone-out', !on);
    if (!on) outT = setTimeout(() => root.classList.remove('is-phone-out'), 320);
    if (DL.audio && DL.audio.play) DL.audio.play(on ? 'modeIn' : 'modeOut');
    if (on) {
      layout();
      tick(true);
      sync();
      histPut('menu');
      if (!opts.back) scroller.scrollTop = 0;
      if (!opts.pointer) { const first = () => { const f = visibleApps()[0]; if (f && open && !ph.contains(document.activeElement)) f.el.focus({ preventScroll: true }); }; first(); setTimeout(first, 80); }
    } else {
      if (!opts.toApp && !opts.fromHist) histDrop();
      if (ph.contains(document.activeElement)) {
        document.activeElement.blur();
        if (opts.refocus) btn.focus({ preventScroll: true });
      }
    }
  }
  DL.Phone = { open: () => setOpen(true), close: () => setOpen(false), get isOpen() { return open; } };

  btn.addEventListener('click', (ev) => { btn.blur(); setOpen(!open, { pointer: ev.detail > 0 }); });
  // a tap outside closes; the scrim keeps catching that same tap until it ends, so the click that follows
  // never lands on whatever is under it (a ghost tap on the game)
  let eatT = 0;
  scrim.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    scrim.classList.add('is-eat');
    clearTimeout(eatT);
    eatT = setTimeout(() => scrim.classList.remove('is-eat'), 450);
    setOpen(false);
  });
  scrim.addEventListener('click', (ev) => { ev.preventDefault(); ev.stopPropagation(); });
  ph.querySelector('.phone__home').addEventListener('click', () => setOpen(false, { refocus: true }));
  ph.querySelector('.phone__x').addEventListener('click', () => setOpen(false, { refocus: true }));

  /* ---------------- swipe down to close (the phone follows the finger) ---------------- */
  // From the top bar / title / home bar always; from the apps only when they are scrolled to the top.
  let drag = null;
  const dragStart = (y, x, target) => {
    if (!open) return;
    const inApps = scroller.contains(target);
    drag = { y0: y, x0: x, t0: performance.now(), dy: 0, on: false, inApps, s0: scroller.scrollTop };
  };
  const dragMove = (y, x, ev) => {
    if (!drag) return;
    const dy = y - drag.y0, dx = x - drag.x0;
    if (!drag.on) {
      if (dy < 10 || Math.abs(dx) > dy) { if (Math.abs(dx) > 12 || dy < -10) drag = null; return; }
      if (drag.inApps && scroller.scrollTop > 0) { drag = null; return; }
      drag.on = true;
      ph.classList.add('is-drag');
    }
    if (ev && ev.cancelable) ev.preventDefault();
    drag.dy = Math.max(0, dy);
    ph.style.transform = 'translate3d(0,' + Math.round(drag.dy) + 'px,0)';
  };
  const dragEnd = () => {
    if (!drag) return;
    const d = drag;
    drag = null;
    if (!d.on) return;
    ph.classList.remove('is-drag');
    const v = d.dy / Math.max(1, performance.now() - d.t0); // px per ms
    ph.style.transform = '';
    if (d.dy > Math.min(110, ph.offsetHeight * 0.22) || (v > 0.55 && d.dy > 24)) setOpen(false);
  };
  ph.addEventListener('touchstart', (ev) => { if (ev.touches.length === 1) dragStart(ev.touches[0].clientY, ev.touches[0].clientX, ev.target); else drag = null; }, { passive: true });
  ph.addEventListener('touchmove', (ev) => { if (ev.touches.length === 1) dragMove(ev.touches[0].clientY, ev.touches[0].clientX, ev); }, { passive: false });
  ph.addEventListener('touchend', dragEnd);
  ph.addEventListener('touchcancel', dragEnd);
  // the mouse drags only by the bars (dragging over the apps is for clicking them)
  ph.addEventListener('pointerdown', (ev) => {
    if (ev.pointerType !== 'mouse' || ev.button !== 0 || !ev.target.closest('.phone__status, .phone__head, .phone__home')) return;
    dragStart(ev.clientY, ev.clientX, ev.target);
    const mv = (e) => dragMove(e.clientY, e.clientX, e);
    const up = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); dragEnd(); };
    addEventListener('pointermove', mv);
    addEventListener('pointerup', up);
  });
  // a swipe that went far enough must not also count as a tap on the app under the finger
  ph.addEventListener('click', (ev) => { if (ph.classList.contains('is-drag')) { ev.stopPropagation(); ev.preventDefault(); } }, true);

  /* ---------------- team chat (it has no top-bar button of its own) ---------------- */
  // on a phone the chat only shows when asked for (it would cover the joystick); it gets a × to put it away
  // (always added; phone.css shows it on touch screens only)
  const chatBox = $('teamChat');
  if (chatBox) {
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'cc__x team-chat__x';
    x.setAttribute('aria-label', 'Fechar o chat');
    x.innerHTML = XICO;
    x.addEventListener('click', () => { root.classList.remove('is-m-chat'); const i = $('chatIn'); if (i && document.activeElement === i) i.blur(); });
    chatBox.appendChild(x);
  }
  function chat() {
    const head = $('chatHead');
    if (DL.MOBILE) {
      root.classList.add('is-m-chat');
      if (head && head.getAttribute('aria-expanded') === 'false') head.click();
      return;
    }
    if (head && head.getAttribute('aria-expanded') === 'false') head.click();
    const input = $('chatIn');
    if (input) setTimeout(() => input.focus({ preventScroll: true }), 60);
  }

  /* ---------------- the windows the apps open ---------------- */
  // An app opened from here opens clean (whatever other window was up closes first) and, when it is closed
  // (its ×, Esc, the Back button), the menu comes back up — like going back to a phone's home screen.
  // (mobile.js loads deferred, after this file: DL.MOBILE is read when needed, not now)
  const layerSel = () => '.overlay:not(#intro), .ops-panel, .spot, .ytm, .crew-panel' + (DL.MOBILE ? ', .team-chat' : '');
  const shown = (el) => !el.hidden && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden' && (!el.classList.contains('overlay') || el.classList.contains('is-open'));
  const layersUp = () => [...game.querySelectorAll(layerSel())].filter(shown);
  function closeLayer(el) {
    if (el.classList.contains('team-chat')) { root.classList.remove('is-m-chat'); return; }
    const x = [...el.querySelectorAll('.cc__x, .bp-x, .p-close, [aria-label^="Fechar"]')].find((b) => b.getClientRects().length > 0);
    if (x) { x.click(); return; }
    // no × of its own (Spotify / YouTube Music cards…): the top-bar button that opened it toggles it
    const opener = el.id && document.querySelector('[aria-controls="' + el.id + '"]');
    if (opener) opener.click();
  }
  let app = null; // { els: [...], since } — the window(s) the last app opened
  let watchT = 0;
  function watchApp(before) {
    clearInterval(watchT);
    let tries = 0;
    watchT = setInterval(() => {
      if (!app) {
        // wait (up to ~0.6 s) for the window to show up
        const els = layersUp().filter((el) => !before.includes(el));
        if (els.length) { app = { els }; return; }
        if (++tries > 6) { clearInterval(watchT); histDrop(); }
        return;
      }
      if (open) { app = null; clearInterval(watchT); return; }
      if (app.els.some(shown)) return;
      // the app was closed: back to the menu, unless something else took the screen meanwhile
      app = null;
      clearInterval(watchT);
      const D = window.DataLabDemo;
      const free = !layersUp().length && D && D.state.phase === 'play' && D.state.mode !== 'build' && !document.querySelector('.overlay.is-open');
      if (free) setOpen(true, { pointer: DL.MOBILE, back: true });
      else histDrop();
    }, 100);
  }

  function launch(p) {
    if (!p) return;
    if (DL.audio && DL.audio.play) DL.audio.play('click');
    const b = p.btn && $(p.btn);
    // Salvar keeps the menu up, to show it saved
    if (p.keep) { if (b) b.click(); p.el.classList.add('is-done'); setTimeout(() => p.el.classList.remove('is-done'), 900); return; }
    // one window at a time: what was open closes first
    layersUp().forEach(closeLayer);
    const before = layersUp();
    const fromPhone = open;
    if (fromPhone) { histPut('app'); setOpen(false, { toApp: true }); }
    if (p.id === 'chat') chat(); else if (b) b.click();
    if (fromPhone && p.id !== 'exit') watchApp(before);
    else if (fromPhone) histDrop();
  }
  ph.addEventListener('click', (ev) => {
    const a = ev.target.closest('[data-app]');
    if (a) launch(byId[a.dataset.app]);
  });

  // Android's Back button / the browser's back: closes the menu, or the app opened from it (→ menu)
  addEventListener('popstate', () => {
    if (popSkip > 0) { popSkip--; return; }
    if (open) { setOpen(false, { fromHist: true }); return; }
    if (app) { const els = app.els.filter(shown); els.forEach(closeLayer); }
  });

  /* ---------------- which apps show, the badges, the clock and battery ---------------- */
  const visibleApps = () => ALL.filter((p) => !p.el.hidden);
  const badgeOf = (p) => {
    const b = p.badge && $(p.badge);
    if (b && !b.hidden) { const n = parseInt(b.textContent, 10); return n > 0 ? (n > 99 ? '99+' : String(n)) : b.textContent.trim() ? '!' : ''; }
    const src = p.btn && $(p.btn);
    if (src && src.classList.contains('is-alert')) return '!';
    return '';
  };
  const put = (el, hidden, text) => { if (el.hidden !== hidden) el.hidden = hidden; if (text != null && el.textContent !== text) el.textContent = text; };
  const totalBadge = btn.querySelector('.phone-btn__badge');
  function sync() {
    let n = 0, alert = false;
    for (const p of ALL) {
      const src = p.btn && $(p.btn);
      if (p.btn) put(p.el, !src || src.hidden);
      const b = badgeOf(p);
      put(p.badgeEl, !b, b);
      p.el.classList.toggle('has-badge', !!b);
      if (b === '!') alert = true; else if (b) n += parseInt(b, 10) || 0;
      // the tutorial lights a top-bar button: light its app too
      p.el.classList.toggle('is-guide', !!(src && src.classList.contains('is-guide')));
    }
    // a section with no app to show goes away; the others know how many apps they hold (their width)
    for (const s of secs) {
      const k = s.querySelectorAll('.papp:not([hidden])').length;
      put(s, k === 0);
      const v = String(k);
      if (s.style.getPropertyValue('--n') !== v) s.style.setProperty('--n', v);
    }
    put(totalBadge, n <= 0 && !alert, n > 0 ? (n > 99 ? '99+' : String(n)) : '!');
    btn.classList.toggle('is-alert', alert || !!actions.querySelector('.is-alert'));
  }
  const watch = { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['class', 'hidden'] };
  let queued = false;
  const later = () => { if (queued) return; queued = true; requestAnimationFrame(() => { queued = false; sync(); }); };
  new MutationObserver(later).observe(actions, watch);
  if ($('chatBadge')) new MutationObserver(later).observe($('chatBadge'), watch);
  if ($('passBtn')) new MutationObserver(later).observe($('passBtn'), watch);
  sync();
  // the computer screen when sitting at a desk (pcdesk.js) shows the very same apps
  DL.PhoneApps = { apps: APPS, dock: DOCK, icon, launch, badge: badgeOf, shown: (p) => !p.btn || (!!$(p.btn) && !$(p.btn).hidden) };

  // status bar: the game's time of day (daynight.js), the company's cash, the battery — which is the UPS
  // during a blackout (blackout.js): it drains with the nobreak and turns red when low
  let lastClock = '', lastBat = '';
  function tick(force) {
    if (!open && !force) return;
    const D = window.DataLabDemo;
    const h = DL.DayNight ? DL.DayNight.hora : ($('clock') && $('clock').textContent) || '08:00';
    const per = DL.DayNight ? { manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' }[DL.DayNight.periodo] || '' : '';
    if (h !== lastClock) { lastClock = h; $('phoneTime').textContent = h; put($('phoneDay'), !per, per); }
    const cash = $('econCash');
    put($('phoneCash'), !cash, cash ? 'Empresa ' + cash.textContent : '');
    const bo = D && D.blackout && D.blackout.state, dark = bo && bo.phase === 'dark';
    const k = dark ? Math.max(0, bo.battery / (DL.BLACKOUT ? DL.BLACKOUT.battery : 20)) : 1;
    const key = (dark ? 'u' : 'm') + Math.round(k * 100);
    if (key !== lastBat) {
      lastBat = key;
      $('phoneBatFill').style.width = Math.round(k * 100) + '%';
      $('phoneBatPct').textContent = dark ? 'UPS ' + Math.round(k * 100) + '%' : '100%';
      ph.classList.toggle('is-ups', !!dark);
      ph.classList.toggle('is-low', !!dark && k < 0.3);
    }
  }
  setInterval(tick, 500);

  // standing up on tall screens; on a short screen (a phone lying down) the phone lies down too
  function layout() {
    const land = innerHeight < 560 && innerWidth > innerHeight;
    ph.classList.toggle('phone--land', land);
  }
  layout();
  addEventListener('resize', layout);
  addEventListener('orientationchange', () => setTimeout(layout, 120));

  /* ---------------- keyboard ---------------- */
  const typing = (el) => el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
  const busy = () => {
    const D = window.DataLabDemo;
    if (!D || D.state.phase === 'intro') return true;
    if (document.querySelector('.overlay.is-open')) return true;
    return D.state.mode === 'build'; // Tab shows the catalog there (build.js)
  };
  function move(dir) {
    const list = visibleApps();
    const i = list.findIndex((p) => p.el === document.activeElement);
    if (i < 0) { if (list[0]) list[0].el.focus(); return; }
    let j = i;
    if (dir === 'left') j = i - 1;
    else if (dir === 'right') j = i + 1;
    else {
      // up / down: the app above / below in the grid (same column), or into the dock and back
      const r0 = list[i].el.getBoundingClientRect(), cx = r0.left + r0.width / 2;
      let best = -1, bd = 1e9;
      list.forEach((p, k) => {
        const r = p.el.getBoundingClientRect();
        const dy = dir === 'down' ? r.top - r0.top : r0.top - r.top;
        if (dy < 8) return;
        const d = dy * 4 + Math.abs(r.left + r.width / 2 - cx);
        if (d < bd) { bd = d; best = k; }
      });
      if (best >= 0) j = best;
    }
    j = (j + list.length) % list.length;
    list[j].el.focus();
  }
  addEventListener('keydown', (ev) => {
    if (open) {
      const k = ev.code;
      if (k === 'Escape' || k === 'Tab') { ev.preventDefault(); ev.stopImmediatePropagation(); setOpen(false, { refocus: k === 'Tab' ? false : true }); return; }
      const dir = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' }[k];
      if (dir) { ev.preventDefault(); ev.stopImmediatePropagation(); move(dir); return; }
      if ((k === 'Enter' || k === 'Space') && ph.contains(document.activeElement)) { ev.preventDefault(); ev.stopImmediatePropagation(); document.activeElement.click(); return; }
      // the game's own shortcuts (T, O, U…) still work: they open their app, and the phone goes down
      if (!ev.ctrlKey && !ev.metaKey && !ev.altKey && /^Key[A-Z]$/.test(k) && ALL.some((p) => p.key === k.slice(3))) { setOpen(false); return; }
      // anything else (walking keys…) stays out of the game while the phone is up
      if (/^(Key[WASDEF]|Space)$/.test(k)) { ev.stopImmediatePropagation(); }
      return;
    }
    if (ev.code === 'Tab' && !ev.ctrlKey && !ev.altKey && !ev.shiftKey && !typing(ev.target) && !busy()) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      setOpen(true);
    }
  }, true);

  // an app's window opened some other way (a key, a toast's link): the phone gets out of the way
  new MutationObserver(() => { if (open && document.querySelector('.overlay.is-open:not(#intro)')) setOpen(false); })
    .observe(game, { subtree: true, attributes: true, attributeFilter: ['class'] });

  /* ---------------- the tutorial's spotlight (tutorial.js) ---------------- */
  // it points at a top-bar button: light the Celular button, and once the phone is up, the app itself
  DL.mobileGuide = (node) => {
    if (!actions.contains(node) && node !== $('passBtn')) return node;
    if (!open) return btn;
    const p = ALL.find((x) => x.btn && $(x.btn) === node);
    return p ? p.el : btn;
  };
})();
