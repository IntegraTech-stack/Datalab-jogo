/* DataLab desktop · the character window (src-tauri → "companion").
   - Draws the player's own character with the game's sprite code (sprites.js + cosmetics.js + emotes.js,
     copied from the repo by scripts/stage.mjs), so the skin, clothes and accessories are the same.
   - Idle: blinks, glances around, now and then dances or waves.
   - The game's notifications (desktop.js → desktop_notify) show up in a balloon over its head, one at a
     time; the character reacts (incident: anger, success: dance, info: wave).
   - Asking mode: right after the game window was minimized, it asks whether to stay in the background.
   - Click: back to the game. Drag: move the character anywhere on the screen. */
(function () {
  'use strict';
  const DL = window.DL;
  const T = window.__TAURI__;
  const invoke = (cmd, args) => (T ? T.core.invoke(cmd, args) : Promise.resolve(null));
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const calm = matchMedia('(prefers-reduced-motion: reduce)');

  // until the game sends the player's look: the technician of the title screen
  const C_TEC = '#5eead4';
  const DEFAULT_LOOK = {
    body: 'm', skin: '#e0ac7e', hair: '#5a3a25', hairStyle: 'short', outfit: 'uniform', shirt: '#2f3a4d', pants: '#232a36', shoes: '#16181d',
    role: 'tecnico', roleColor: C_TEC, badge: C_TEC, lanyard: C_TEC, capColor: C_TEC,
  };
  const SHOW_MS = { info: 6500, ok: 6500, warn: 9500 };
  const REACT = { warn: 'angry', ok: 'dance', info: 'wave' };
  const MAX_QUEUE = 20;

  const cvs = $('me'), g = cvs.getContext('2d');
  const X = 20, Y = 55;   // the feet, in art pixels of the 40×58 canvas
  const say = $('say'), count = $('count');
  const { AX, AY } = DL.CHAR;
  const S = {
    mode: 'normal', lookKey: '', sheet: null, emo: null,
    dir: 'down', glanceUntil: 0, nextGlance: 3, nextIdleEmote: 20 + Math.random() * 25,
    emote: null, emoteT: 0,
    queue: [], current: null, sayTimer: 0, greeted: false,
    t: 0, last: 0, acc: 0,
  };

  /* ---------------- the character ---------------- */
  function setLook(look) {
    const L = look && typeof look === 'object' && look.skin ? look : DEFAULT_LOOK;
    const key = JSON.stringify(L);
    if (key === S.lookKey) return;
    S.lookKey = key;
    try {
      S.sheet = DL.makeSheet(L);
      S.emo = DL.makeEmoteSheet(L);
    } catch (e) {
      // a look from a newer game version this build doesn't know: draw the default one
      console.error(e);
      S.sheet = DL.makeSheet(DEFAULT_LOOK);
      S.emo = DL.makeEmoteSheet(DEFAULT_LOOK);
    }
    draw();
  }

  function play(id) {
    const e = DL.emote(id);
    if (!e) return;
    S.emote = e;
    S.emoteT = 0;
    S.dir = 'down';
  }

  function draw() {
    if (!S.sheet) return;
    g.clearRect(0, 0, cvs.width, cvs.height);
    g.fillStyle = 'rgba(0, 0, 0, .35)';   // the shadow of DL.drawActor
    g.fillRect(X - 4, Y - 2, 8, 1);
    g.fillRect(X - 5, Y - 1, 10, 1);
    g.fillRect(X - 4, Y, 8, 1);
    let frame;
    if (S.emote) {
      frame = DL.emoteFrame(S.emo, S.emote.id, S.emoteT, S.emote.dur) || S.sheet.down.idle;
      g.drawImage(frame, X - AX, Y - AY);
      if (S.emote.id === 'angry' && DL.emoteSmoke) DL.emoteSmoke(g, X, Y, S.emoteT);
      return;
    }
    const set = S.sheet[S.dir] || S.sheet.down;
    frame = S.t % 3.7 < 0.13 ? set.blink : set.idle;
    g.drawImage(frame, X - AX, Y - AY);
  }

  function update(dt) {
    S.t += dt;
    if (S.emote) {
      S.emoteT += dt;
      if (S.emoteT >= S.emote.dur) {
        S.emote = null;
        // still asking: keep waving at the player
        if (S.mode === 'asking') setTimeout(() => { if (S.mode === 'asking' && !S.emote) play('wave'); }, 1500);
      }
      return;
    }
    if (S.t > S.glanceUntil && S.dir !== 'down') S.dir = 'down';
    if (S.t > S.nextGlance) {
      S.dir = Math.random() < 0.5 ? 'left' : 'right';
      S.glanceUntil = S.t + 0.8 + Math.random();
      S.nextGlance = S.t + 4 + Math.random() * 6;
    }
    if (S.t > S.nextIdleEmote && !S.current) {
      play(Math.random() < 0.6 ? 'dance' : 'wave');
      S.nextIdleEmote = S.t + 35 + Math.random() * 50;
    }
  }

  function tick(now) {
    requestAnimationFrame(tick);
    const dt = Math.min(0.1, S.last ? (now - S.last) / 1000 : 0);
    S.last = now;
    S.acc += dt;
    if (S.acc < 1 / 12) return;   // 12 fps: plenty for a pixel character, gentle on the battery
    update(calm.matches ? 0 : S.acc);
    S.acc = 0;
    draw();
  }

  /* ---------------- the balloon ---------------- */
  function showSay(cls, html) {
    say.className = 'say ' + cls;
    say.innerHTML = html;
    say.hidden = false;
  }
  function hideSay() {
    say.hidden = true;
    say.innerHTML = '';
  }
  function updateCount() {
    count.hidden = S.queue.length === 0;
    count.textContent = '+' + S.queue.length;
  }

  function nextNotice() {
    clearTimeout(S.sayTimer);
    if (S.mode === 'asking') return;
    S.current = S.queue.shift() || null;
    updateCount();
    if (!S.current) { hideSay(); return; }
    const n = S.current;
    showSay('say--' + n.tone,
      '<b class="say__label">' + esc(n.label) + '</b><span class="say__text">' + esc(n.text) + '</span>' +
      (S.queue.length ? '' : '<span class="say__hint">Clique em mim para abrir o jogo</span>'));
    if (REACT[n.tone]) play(REACT[n.tone]);
    S.sayTimer = setTimeout(nextNotice, SHOW_MS[n.tone] || SHOW_MS.info);
  }

  function notify(n) {
    if (!n || S.mode !== 'background') return;
    S.queue.push(n);
    if (S.queue.length > MAX_QUEUE) S.queue.shift();
    if (!S.current) nextNotice();
    else updateCount();
  }

  function ask() {
    clearTimeout(S.sayTimer);
    S.current = null;
    showSay('say--ask',
      '<b class="say__label">DataLab</b><span class="say__text">Quer que eu fique aqui no canto com o jogo rodando em segundo plano?</span>' +
      '<div class="ask"><button class="yes" type="button" data-ans="background">Sim, ficar aqui</button>' +
      '<button type="button" data-ans="minimize">Só minimizar</button>' +
      '<label><input type="checkbox" id="remember"> Lembrar minha escolha</label></div>');
    play('wave');
  }

  function setMode(mode) {
    const was = S.mode;
    S.mode = mode;
    if (mode === 'asking') { ask(); return; }
    if (mode === 'background') {
      if (was === 'asking' || say.querySelector('.ask')) hideSay();
      if (!S.greeted) {
        S.greeted = true;
        S.queue.unshift({ tone: 'ok', label: 'Segundo plano', text: 'O datacenter continua rodando. Enquanto isso eu faço umas tarefas simples e aviso aqui quando algo acontecer.' });
      }
      if (!S.current) nextNotice();
      return;
    }
    // back to the game: the window hides, the line starts over next time
    S.queue = [];
    S.current = null;
    clearTimeout(S.sayTimer);
    hideSay();
    updateCount();
  }

  function applyState(st) {
    if (!st) return;
    setLook(st.look);
    if (st.mode && st.mode !== S.mode) setMode(st.mode);
  }

  /* ---------------- input ---------------- */
  // press + move = drag the window; press + release in place = open the game
  let press = null;
  cvs.addEventListener('pointerdown', (ev) => {
    if (ev.button !== 0) return;
    press = { x: ev.screenX, y: ev.screenY, dragging: false };
  });
  cvs.addEventListener('pointermove', (ev) => {
    if (!press || press.dragging) return;
    if (Math.abs(ev.screenX - press.x) + Math.abs(ev.screenY - press.y) > 4) {
      press.dragging = true;
      if (T) T.window.getCurrentWindow().startDragging();
    }
  });
  cvs.addEventListener('pointerup', () => {
    const p = press;
    press = null;
    if (p && !p.dragging) invoke('companion_open_game');
  });
  cvs.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); invoke('companion_open_game'); }
  });

  say.addEventListener('click', (ev) => {
    const b = ev.target.closest('[data-ans]');
    if (b) {
      const remember = !!(say.querySelector('#remember') || {}).checked;
      invoke('companion_answer', { choice: b.dataset.ans, remember });
      return;
    }
    if (ev.target.closest('.ask')) return;
    // a notification: next one (or close it)
    if (S.mode === 'background') nextNotice();
  });

  /* ---------------- wiring ---------------- */
  setLook(null);
  requestAnimationFrame(tick);
  if (T) {
    T.event.listen('companion://state', (ev) => applyState(ev.payload));
    T.event.listen('companion://notify', (ev) => notify(ev.payload));
    invoke('companion_state').then(applyState);
  }
  // for checks outside the app (tests render this page in a normal browser)
  window.DataLabCompanion = { applyState, notify, get state() { return S; } };
})();
