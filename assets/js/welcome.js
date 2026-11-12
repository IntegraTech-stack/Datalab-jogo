/* DataLab — welcome notice: the first time an account reaches the Main Menu, a card in the middle of the
   screen says hello and warns that the game is in beta (some bugs on the way). A technician in work
   clothes waves and dances next to the text (emote frames from sprites.js). Shown once per account:
   remembered in the account itself (Supabase user metadata) and in this browser. auth-gate.js calls
   DL.Welcome.maybe() after the login. */
(function () {
  'use strict';
  const DL = window.DL;
  if (DL.HERO) return;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const VERSION = 'beta-1'; // a new value shows the notice again to everyone
  const box = $('welcome');
  if (!box) return;
  const W = { open: false, raf: 0 };
  const key = (u) => 'datalab.welcome.' + VERSION + '.' + u.id;

  function seen(u) {
    if ((u.user_metadata || {}).welcome_seen === VERSION) return true;
    try { return localStorage.getItem(key(u)) === '1'; } catch (e) { return false; }
  }
  function remember(u) {
    try { localStorage.setItem(key(u), '1'); } catch (e) { /* private window: the account still remembers */ }
    const c = DL.Cloud && DL.Cloud.client;
    if (c) c.auth.updateUser({ data: { welcome_seen: VERSION } }).catch(() => {});
  }

  /* ---------------- the technician ---------------- */
  // work clothes: uniform, safety vest, cap in the technician's colour, headset
  const WORKER = { role: 'tecnico', body: 'm', skin: '#e0ac7e', hair: '#2a1c16', hairStyle: 'short', shirt: '#1f6f5c', pants: '#2a3140', shoes: '#16181d', outfit: 'uniform', vest: true, hat: 'cap', headset: true };
  // what he does, in a loop: [frame set, seconds, emoji over the head]
  const SHOW = [['wave', 2.2, '👋'], ['idle', 1.2, ''], ['dance', 3, '🕺'], ['idle', 0.9, ''], ['talk', 1.6, '💬'], ['wave', 1.4, '👋'], ['idle', 1, '']];
  const LOOP = SHOW.reduce((s, x) => s + x[1], 0);
  let sheets = null;

  function frameAt(t) {
    let at = t % LOOP;
    for (const [what, dur, emoji] of SHOW) {
      if (at >= dur) { at -= dur; continue; }
      if (what === 'wave' || what === 'dance') return [DL.emoteFrame(sheets.emote, what, at, dur), emoji];
      if (what === 'talk') return [Math.floor(at / 0.2) % 2 ? sheets.act.down.talk : sheets.walk.down.idle, emoji];
      return [at % 3 > 2.85 ? sheets.walk.down.blink : sheets.walk.down.idle, emoji];
    }
    return [sheets.walk.down.idle, ''];
  }
  function animate() {
    const cv = box.querySelector('canvas'), bubble = box.querySelector('[data-emoji]');
    if (!cv || !sheets) return;
    const g = cv.getContext('2d'), t0 = performance.now();
    let last = null;
    const tick = (now) => {
      if (!W.open) return;
      const [frame, emoji] = frameAt((now - t0) / 1000);
      g.clearRect(0, 0, cv.width, cv.height);
      g.imageSmoothingEnabled = false;
      g.drawImage(frame, 0, 0, cv.width, cv.height);
      if (emoji !== last) { last = emoji; bubble.textContent = emoji; bubble.hidden = !emoji; }
      W.raf = requestAnimationFrame(tick);
    };
    W.raf = requestAnimationFrame(tick);
  }
  function makeSheets() {
    try {
      const L = DL.crewLook(WORKER);
      sheets = { walk: DL.makeSheet(L), act: DL.makeActSheet(L), emote: DL.makeEmoteSheet(L) };
    } catch (e) { sheets = null; } // no sprites: the card shows without him
  }

  /* ---------------- the card ---------------- */
  function show(name) {
    if (!sheets) makeSheets();
    const f = sheets && sheets.walk.down.idle;
    box.querySelector('.welcome').innerHTML =
      (f ? '<figure class="welcome__guy" aria-hidden="true"><span class="welcome__emoji" data-emoji hidden></span><canvas width="' + f.width * 5 + '" height="' + f.height * 5 + '"></canvas><span class="welcome__floor"></span></figure>' : '') +
      '<div class="welcome__text">' +
      '<p class="eyebrow-sm">Bem-vindo(a) ao DataLab <em class="welcome__beta">Beta</em></p>' +
      '<h2 class="welcome__title" id="welcomeTitle">Olá' + (name ? ', ' + esc(name) : '') + '!</h2>' +
      '<p>Que bom ter você por aqui. Monte seu datacenter, contrate sua equipe e mantenha tudo no ar.</p>' +
      '<p class="welcome__warn">O DataLab está em <b>fase beta</b> e ainda em desenvolvimento, por isso você pode encontrar alguns bugs pelo caminho.</p>' +
      '<p>Estamos melhorando o jogo a cada atualização. Obrigado por jogar com a gente!</p>' +
      '<div class="welcome__acts"><button type="button" class="btn btn--primary" data-welcome-ok>Bora jogar <span class="arrow">→</span></button></div>' +
      '</div>';
    box.hidden = false;
    W.open = true;
    requestAnimationFrame(() => box.classList.add('is-open'));
    box.setAttribute('aria-hidden', 'false');
    animate();
    setTimeout(() => { const b = box.querySelector('[data-welcome-ok]'); if (b && W.open) b.focus({ preventScroll: true }); }, 60);
  }
  function close() {
    if (!W.open) return;
    W.open = false;
    cancelAnimationFrame(W.raf);
    box.classList.remove('is-open');
    box.setAttribute('aria-hidden', 'true');
    setTimeout(() => { if (!W.open) box.hidden = true; }, 450);
    const u = DL.Cloud && DL.Cloud.user;
    if (u) remember(u);
  }

  box.addEventListener('click', (ev) => { if (ev.target.closest('[data-welcome-ok]')) close(); });
  // the card owns the keyboard while open: Enter / Esc close it. The menu hands its keys over (menu.js);
  // this listener covers the rest of the time.
  function onKey(ev) {
    ev.stopImmediatePropagation();
    if (ev.code === 'Escape' || ev.code === 'Enter' || ev.code === 'Space' || ev.code === 'NumpadEnter') { ev.preventDefault(); close(); }
    else if (ev.code !== 'Tab') ev.preventDefault();
  }
  addEventListener('keydown', (ev) => { if (W.open) onKey(ev); }, true);

  DL.Welcome = {
    // after the login: the account's first visit (or the first since this notice existed)
    maybe() {
      const u = DL.Cloud && DL.Cloud.user;
      if (!u || W.open || seen(u)) return false;
      const m = u.user_metadata || {};
      setTimeout(() => show(m.display_name || m.username || ''), 700); // after the menu has come in
      return true;
    },
    show, close, key: onKey,
    get isOpen() { return W.open; },
  };
})();
