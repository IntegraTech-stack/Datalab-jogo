/* DataLab — bridge to the desktop app (desktop/, Tauri v2). Does nothing in a normal browser.
   Inside the app (window.__TAURI__, the game page loaded by the desktop shell):
   - sends the player's look to the character window in the corner of the screen (same skin);
   - forwards the game's notifications (#toasts) to it while the game runs in the background;
   - background mode: the window is hidden, so requestAnimationFrame stops and with it the whole game
     (scene.js). The scene's loop is paused and the simulation is advanced here by a timer instead,
     catching up the real time that passed, without drawing;
   - AFK: while in the background the player's own character does simple routine tasks, only those
     of a level below the player's rank (the crew's rule, career.botCan), and says so in the balloon;
   - closing the window asks first (background / save and quit / cancel); ⌘Q and the menu bar's "Sair"
     save before quitting. */
(function () {
  'use strict';
  const T = window.__TAURI__;
  if (!T || !T.core || !T.event) return;
  const DL = (window.DL = window.DL || {});
  const D = window.DataLabDemo;
  const $ = (id) => document.getElementById(id);
  const invoke = (cmd, args) => T.core.invoke(cmd, args).catch((e) => { console.warn('[DataLab desktop]', cmd, e); return null; });
  document.documentElement.classList.add('is-desktop');
  if (!D || !D.scene) return;

  const STEP = 0.05;          // the same step the scene's own loop never goes above
  const TICK_MS = 250;
  const MAX_CATCH_UP = 120;   // seconds of simulation per tick at most (after a long system sleep)
  const B = { on: false, timer: 0, last: 0, acc: 0, wasRunning: false, lookKey: '', lookTimer: 0 };

  /* ---------------- the player's look ---------------- */
  function sendLook(force) {
    const look = D.player && D.player.look;
    if (!look) return;
    const key = JSON.stringify(look);
    if (!force && key === B.lookKey) return;
    B.lookKey = key;
    invoke('desktop_set_look', { look: JSON.parse(key) });
  }
  if (D.game && D.game.on) D.game.on('player-look', () => setTimeout(() => sendLook(false), 0));
  // the inventory changes accessories without that event: a cheap check now and then
  B.lookTimer = setInterval(() => sendLook(false), 10000);

  /* ---------------- notifications ---------------- */
  const toasts = $('toasts');
  if (toasts && window.MutationObserver) {
    new MutationObserver((list) => {
      if (!B.on) return;
      for (const m of list) {
        for (const el of m.addedNodes) {
          if (!(el instanceof HTMLElement) || !el.classList.contains('toast')) continue;
          const tone = el.classList.contains('toast--warn') ? 'warn' : el.classList.contains('toast--ok') ? 'ok' : 'info';
          const label = (el.querySelector('b') || {}).textContent || 'DataLab';
          const spans = el.querySelectorAll(':scope > span');
          const text = spans.length ? spans[spans.length - 1].textContent : '';
          invoke('desktop_notify', { tone, label: label.trim(), text: text.trim() });
        }
      }
    }).observe(toasts, { childList: true });
  }

  /* ---------------- AFK: the player's own character works while in the background ---------------- */
  // Only in background mode (game window hidden, the character in the corner of the screen). Every
  // AFK_MIN..AFK_MAX seconds of game time the player does ONE simple routine task from the crew's catalog
  // (jobs.js), and only tasks of a level BELOW the player's rank — career.botCan, the same rule the crew
  // follows. Never repairs, installs, orders or anything that needs the player's decision.
  const AFK_MIN = 45, AFK_MAX = 90, AFK_FIRST = 20;
  const AFK_KINDS = { pc: 1, equip: 1, patrol: 1, spot: 1 };
  const AFK_SKIP = { install: 1, repair: 1, needs: 1, expand: 1, frontdesk: 1, follow: 1, meeting: 1 };
  const AFK = { t: AFK_FIRST, done: 0, last: '' };
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  // [def, role id] of every task the player may do while away, one per task id
  function afkTasks() {
    const J = DL.JOBS, career = D.career;
    if (!J || !J.BY_ROLE || !career || !career.botCan) return [];
    const seen = new Map();
    for (const rid in J.BY_ROLE) for (const def of J.BY_ROLE[rid] || []) {
      if (!def || seen.has(def.id) || AFK_SKIP[def.id] || !AFK_KINDS[def.kind] || def.social) continue;
      if (!career.botCan(def)) continue;
      seen.set(def.id, [def, rid]);
    }
    return Array.from(seen.values());
  }
  // the player, shaped like a crew member for the task code (it reads a.crew.name, the role…)
  function afkActor(rid) {
    const pl = D.player, crew = D.crew;
    const role = DL.ROLES && DL.ROLES[rid] ? rid : 'funcionario';
    const name = (crew && crew.playerProfile && crew.playerProfile.name) || 'Você';
    return {
      x: pl ? pl.x : 0, y: pl ? pl.y : 0, afk: true,
      crew: { name, profile: { role, name }, attend: 'pc', alertT: 0, stats: { level: 1, xp: 0, skills: {}, done: 0, found: 0, fixed: 0 } },
    };
  }
  function afkCtx(a) {
    const crew = D.crew, game = D.game;
    const m = /^(\d+):/.exec(game.clock ? game.clock() : '09:00');
    return {
      a, c: a.crew, stats: a.crew.stats, world: D.scene.world, ops: D.ops, staff: D.staff, eco: D.economy,
      members: crew && crew.members ? crew.members.filter((x) => !x.crew.off) : [], player: a.crew.name,
      reception: crew && crew.reception ? crew.reception : () => null, install: () => null, hour: m ? +m[1] : 9, roomName: null,
    };
  }
  // one task now: returns its id, or null (nothing allowed / nothing to do / not playing)
  function afkStep() {
    const game = D.game;
    if (!D.state || D.state.phase !== 'play' || game.guest || (game.paused && game.paused())) return null;
    const list = afkTasks();
    while (list.length) {
      const [def, rid] = list.splice(Math.floor(Math.random() * list.length), 1)[0];
      const a = afkActor(rid), ctx = afkCtx(a);
      if (def.allow && !def.allow(ctx)) continue;
      let target;
      if (def.targets) {
        let ts = [];
        try { ts = (def.targets(ctx) || []).filter(Boolean); } catch (e) { ts = []; }
        if (!ts.length) continue;
        target = pick(ts);
      }
      let res = null;
      try { res = def.finish(ctx, target); } catch (e) { console.warn('[DataLab desktop] afk', def.id, e); continue; }
      AFK.done++;
      AFK.last = def.id;
      // the same reward as a task the crew does alone (economy.js credits, the pass)
      if (game.emit) game.emit('job-done', { a, name: def.name, auto: true, failed: false, afk: true, job: { def, auto: true, target }, res });
      const tone = res && (res.tone === 'warn' || res.tone === 'ok') ? res.tone : 'info';
      const text = res && res.say ? res.say : 'Feito: ' + def.name.toLowerCase() + '.';
      invoke('desktop_notify', { tone, label: 'Você · ' + def.name, text });
      // also in the team chat, so the player sees what was done when coming back
      if (game.chat && game.chat.post) {
        try { game.chat.post({ name: a.crew.name + ' (AFK)', color: '#5eead4', role: 'Você' }, text, { tone: tone === 'info' ? undefined : tone }); } catch (e) { /* the chat is only a log */ }
      }
      return def.id;
    }
    return null;
  }
  function afkTick(sec) {
    if (!B.on || !sec) return;
    AFK.t -= sec;
    if (AFK.t > 0) return;
    afkStep();
    AFK.t = AFK_MIN + Math.random() * (AFK_MAX - AFK_MIN);
  }

  /* ---------------- background: the game keeps running ---------------- */
  function catchUp() {
    const now = performance.now();
    B.acc += Math.min(MAX_CATCH_UP, (now - B.last) / 1000);
    B.last = now;
    let ran = 0;
    while (B.acc >= STEP) {
      D.step(STEP);
      D.scene.update(STEP);
      B.acc -= STEP;
      ran += STEP;
    }
    afkTick(ran);
  }
  function setBackground(on) {
    if (on === B.on) return;
    B.on = on;
    clearInterval(B.timer);
    if (on) {
      sendLook(true);
      AFK.t = AFK_FIRST;
      B.wasRunning = !!D.scene.running;
      if (B.wasRunning) D.scene.stop();
      B.last = performance.now();
      B.acc = 0;
      if (B.wasRunning) B.timer = setInterval(catchUp, TICK_MS);
    } else {
      if (B.wasRunning) { catchUp(); D.scene.start(D.step); }
      B.wasRunning = false;
    }
  }
  T.event.listen('desktop://background', (ev) => setBackground(!!ev.payload));

  /* ---------------- quit: save first ---------------- */
  async function saveAndQuit() {
    const btn = $('saveBtn');
    const playing = D.state && D.state.phase === 'play';
    if (btn && playing && !btn.disabled) {
      btn.click();
      // menu.js disables the button while it saves (it waits for an autosave on its way, too)
      for (let i = 0; i < 60; i++) {
        await new Promise((r) => setTimeout(r, 200));
        if (!btn.disabled) break;
      }
    }
    invoke('desktop_quit');
  }
  T.event.listen('desktop://quit-requested', () => saveAndQuit());

  /* ---------------- closing the window: ask ---------------- */
  let dialog = null;
  function closeDialog() {
    if (!dialog) return;
    dialog.remove();
    dialog = null;
  }
  function askClose() {
    if (dialog) return;
    dialog = document.createElement('div');
    dialog.className = 'dsk-ask';
    dialog.setAttribute('role', 'dialog');
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-labelledby', 'dskAskTitle');
    dialog.innerHTML =
      '<div class="dsk-ask__box">' +
        '<p class="eyebrow-sm">DataLab</p>' +
        '<h2 class="dsk-ask__title" id="dskAskTitle">Fechar o jogo?</h2>' +
        '<p class="dsk-ask__text">Em segundo plano o datacenter continua rodando e o seu personagem fica no canto da tela, avisando quando algo acontecer.</p>' +
        '<div class="dsk-ask__actions">' +
          '<button class="btn btn--primary" type="button" data-dsk="background">Deixar em segundo plano</button>' +
          '<button class="btn" type="button" data-dsk="quit">Salvar e sair</button>' +
          '<button class="btn" type="button" data-dsk="cancel">Cancelar</button>' +
        '</div>' +
      '</div>';
    dialog.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-dsk]');
      if (!b && ev.target !== dialog) return;
      const act = b ? b.dataset.dsk : 'cancel';
      closeDialog();
      if (act === 'background') invoke('desktop_background');
      else if (act === 'quit') saveAndQuit();
    });
    dialog.addEventListener('keydown', (ev) => {
      ev.stopPropagation();   // the game's shortcuts stay out of it
      if (ev.key === 'Escape') closeDialog();
    });
    document.body.appendChild(dialog);
    dialog.querySelector('[data-dsk="background"]').focus();
  }
  T.event.listen('desktop://close-requested', () => askClose());

  /* ---------------- "Segundo plano" in the Jogo menu ---------------- */
  const bgBtn = $('bgBtn');
  if (bgBtn) {
    bgBtn.hidden = false;
    bgBtn.addEventListener('click', () => { bgBtn.blur(); invoke('desktop_background'); });
  }

  invoke('desktop_hello').then((mode) => {
    sendLook(true);
    if (mode === 'background') setBackground(true);
  });
  // for checks (tests drive the bridge without the app)
  DL.Desktop = {
    setBackground, askClose, saveAndQuit, get state() { return B; },
    afk: { step: afkStep, tick: afkTick, tasks: () => afkTasks().map((x) => x[0].id), get state() { return AFK; } },
  };
})();
