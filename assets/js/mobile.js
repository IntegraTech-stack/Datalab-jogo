/* DataLab — phones and tablets (PWA). Runs only on touch screens (hover: none + pointer: coarse): on a PC
   nothing here happens, and mobile.css is linked with the same media query.
   1. marks <html> with is-mobile (+ is-standalone inside the installed app), links the manifest and
      registers the service worker (sw.js)
   2. in the browser (not installed yet): the "Instale o DataLab" screen, the game's own character doing
      its emotes next to the step by step for iPhone (Safari) and Android (Chrome)
   3. in the game (jogo.html): a slim top bar (me · modes · Celular — the menu is phone.js); emotes in a round
      button over the action button; the team chat on demand (the phone's Chat app)
   Loaded with defer, so the page (and sprites.js / demo.js) has already run. */
(function () {
  'use strict';
  if (!matchMedia('(hover: none) and (pointer: coarse)').matches) return;
  // the landing's iframe (jogo.html?hero) is a silent showcase: no install screen, no drawer
  if (new URLSearchParams(location.search).has('hero') || window.top !== window.self) return;
  const DL = (window.DL = window.DL || {});
  const root = document.documentElement;
  const $ = (id) => document.getElementById(id);
  const standalone = matchMedia('(display-mode: standalone), (display-mode: fullscreen)').matches || navigator.standalone === true;
  DL.MOBILE = true;
  root.classList.add('is-mobile');
  if (standalone) root.classList.add('is-standalone');

  const manifest = document.createElement('link');
  manifest.rel = 'manifest';
  manifest.href = 'manifest.webmanifest';
  document.head.appendChild(manifest);
  if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
  // the page itself never zooms (double tap, pinch): in the game two fingers zoom the map (demo.js)
  const vp = document.querySelector('meta[name="viewport"]');
  if (vp && $('game')) vp.content = 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover';

  /* ---------------- install screen ---------------- */
  const SKIP_KEY = 'datalab.pwa.skip';
  const ua = navigator.userAgent;
  const isIOS = /iP(hone|ad|od)/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const iosOther = isIOS && /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua);
  let deferred = null; // Chrome's install prompt, kept for the "Instalar agora" button
  let screenEl = null, stopHero = null;

  const ICON = {
    share: '<svg class="pwa-ico" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 1.5v8.5M5 4.5l3-3 3 3" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M5.5 7H3.5v7.5h9V7h-2" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
    add: '<svg class="pwa-ico" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="2" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 5v6M5 8h6" stroke="currentColor" stroke-width="1.5"/></svg>',
    dots: '<svg class="pwa-ico" viewBox="0 0 16 16" aria-hidden="true"><rect x="7" y="2" width="2" height="2" fill="currentColor"/><rect x="7" y="7" width="2" height="2" fill="currentColor"/><rect x="7" y="12" width="2" height="2" fill="currentColor"/></svg>',
    more: '<svg class="pwa-ico" viewBox="0 0 16 16" aria-hidden="true"><rect x="2" y="7" width="2" height="2" fill="currentColor"/><rect x="7" y="7" width="2" height="2" fill="currentColor"/><rect x="12" y="7" width="2" height="2" fill="currentColor"/></svg>',
    install: '<svg class="pwa-ico" viewBox="0 0 16 16" aria-hidden="true"><rect x="3.5" y="1.5" width="9" height="13" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 4.5v6M5.5 8l2.5 2.5L10.5 8" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  };
  const STEPS = {
    ios: [
      (iosOther ? 'Abra esta página no <b>Safari</b> (no Chrome do iPhone também dá: o botão Compartilhar fica na barra do endereço).' : 'Esta página precisa estar aberta no <b>Safari</b>.'),
      'Toque em <b>Compartilhar</b> ' + ICON.share + ' na barra do Safari. <small>No iOS 26: toque em ' + ICON.more + ' e depois em Compartilhar.</small>',
      'Role a lista e toque em <b>Adicionar à Tela de Início</b> ' + ICON.add,
      'Deixe <b>Abrir como App</b> ligado e toque em <b>Adicionar</b>. Pronto: abra o DataLab pelo ícone novo.',
    ],
    android: [
      'Esta página precisa estar aberta no <b>Chrome</b>.',
      'Toque no menu ' + ICON.dots + ' no canto de cima, à direita.',
      'Toque em <b>Instalar app</b> ' + ICON.install + ' (ou <b>Adicionar à tela inicial</b>).',
      'Confirme em <b>Instalar</b>. Pronto: abra o DataLab pelo ícone novo. <small>Samsung Internet: menu ☰ → Adicionar página a → Tela inicial.</small>',
    ],
  };

  function buildScreen() {
    const os = isIOS ? 'ios' : 'android';
    const steps = (k) => '<ol class="pwa__steps" data-os="' + k + '"' + (k === os ? '' : ' hidden') + '>' + STEPS[k].map((s) => '<li><span>' + s + '</span></li>').join('') + '</ol>';
    const el = document.createElement('section');
    el.className = 'pwa';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'pwaTitle');
    el.innerHTML =
      '<div class="pwa__grid" aria-hidden="true"></div>' +
      '<div class="pwa__card">' +
        '<p class="pwa__brand"><span class="pwa__mark" aria-hidden="true"><i></i><i></i><i></i></span>DATALAB</p>' +
        '<div class="pwa__body">' +
          '<div class="pwa__hero" aria-hidden="true">' +
            '<span class="pwa__bubble" id="pwaBubble">👋</span>' +
            '<canvas class="pwa__char" id="pwaChar"></canvas>' +
            '<span class="pwa__floor"></span>' +
          '</div>' +
          '<div class="pwa__guide">' +
            '<h2 class="pwa__title" id="pwaTitle">Instale o DataLab</h2>' +
            '<p class="pwa__text">Jogue em tela cheia, direto do ícone na tela inicial, como um app.</p>' +
            '<div class="pwa__tabs" role="tablist" aria-label="Seu celular">' +
              '<button type="button" role="tab" data-os="ios" aria-selected="' + (os === 'ios') + '">iPhone</button>' +
              '<button type="button" role="tab" data-os="android" aria-selected="' + (os === 'android') + '">Android</button>' +
            '</div>' +
            steps('ios') + steps('android') +
            '<button type="button" class="pwa__install" id="pwaInstall" hidden>' + ICON.install + 'Instalar agora</button>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="pwa__skip" id="pwaSkip">Continuar no navegador</button>' +
      '</div>';
    el.addEventListener('click', (ev) => {
      const tab = ev.target.closest('[data-os][role="tab"]');
      if (tab) {
        el.querySelectorAll('[role="tab"]').forEach((b) => b.setAttribute('aria-selected', String(b === tab)));
        el.querySelectorAll('.pwa__steps').forEach((ol) => { ol.hidden = ol.dataset.os !== tab.dataset.os; });
        syncInstallBtn();
      }
    });
    el.querySelector('#pwaSkip').addEventListener('click', () => {
      try { sessionStorage.setItem(SKIP_KEY, '1'); } catch (e) { /* private mode */ }
      closeScreen();
    });
    el.querySelector('#pwaInstall').addEventListener('click', async () => {
      if (!deferred) return;
      const ev = deferred;
      deferred = null;
      syncInstallBtn();
      ev.prompt();
      try { if ((await ev.userChoice).outcome === 'accepted') closeScreen(); } catch (e) { /* dismissed */ }
    });
    return el;
  }

  function syncInstallBtn() {
    if (!screenEl) return;
    const tab = screenEl.querySelector('[role="tab"][aria-selected="true"]');
    screenEl.querySelector('#pwaInstall').hidden = !deferred || !tab || tab.dataset.os !== 'android';
  }

  // the game's own character (sprites.js), facing the camera: waves, then dances, over and over
  const LOOK = { body: 'm', skin: '#e0ac7e', hair: '#2a1c16', hairStyle: 'short', outfit: 'hoodie', shirt: '#1f6f5c', pants: '#1b1f27', shoes: '#16181d', headset: true, role: 'tecnico', roleColor: '#3dffa2', badge: '#3dffa2', lanyard: '#3dffa2', capColor: '#3dffa2' };
  const SEQ = [{ id: 'wave', dur: 2.4, emoji: '👋' }, { id: 'dance', dur: 3.2, emoji: '🕺' }, { id: 'wave', dur: 1.6, emoji: '📲' }, { id: 'dance', dur: 2.6, emoji: '🎉' }];
  function startHero(canvas, bubble) {
    if (!DL.makeEmoteSheet || !DL.CHAR) { canvas.hidden = true; bubble.hidden = true; return null; }
    const { FW, FH, AX, AY } = DL.CHAR;
    const sheet = DL.makeEmoteSheet(LOOK), g = canvas.getContext('2d');
    canvas.width = FW;
    canvas.height = FH;
    const paint = (frame) => {
      g.clearRect(0, 0, FW, FH);
      g.fillStyle = 'rgba(0, 0, 0, .32)'; // the same shadow as DL.drawActor
      g.fillRect(AX - 4, AY - 2, 8, 1);
      g.fillRect(AX - 5, AY - 1, 10, 1);
      g.fillRect(AX - 4, AY, 8, 1);
      g.drawImage(frame, 0, 0);
    };
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { paint(sheet.waveA); return null; }
    let i = 0, t = 0;
    bubble.textContent = SEQ[0].emoji;
    const timer = setInterval(() => {
      t += 1 / 12;
      if (t >= SEQ[i].dur) {
        t = 0;
        i = (i + 1) % SEQ.length;
        bubble.textContent = SEQ[i].emoji;
        bubble.classList.remove('is-pop');
        void bubble.offsetWidth;
        bubble.classList.add('is-pop');
      }
      const e = SEQ[i].id;
      paint(e === 'dance' ? (Math.floor(t / 0.25) % 2 ? sheet.danceB : sheet.danceA) : Math.floor(t / 0.18) % 2 ? sheet.waveB : sheet.waveA);
    }, 1000 / 12);
    return () => clearInterval(timer);
  }

  function openScreen() {
    if (screenEl || standalone) return;
    screenEl = buildScreen();
    document.body.appendChild(screenEl);
    root.classList.add('is-pwa-screen');
    stopHero = startHero(screenEl.querySelector('#pwaChar'), screenEl.querySelector('#pwaBubble'));
    syncInstallBtn();
    screenEl.querySelector('#pwaSkip').focus({ preventScroll: true });
  }
  function closeScreen() {
    if (!screenEl) return;
    if (stopHero) stopHero();
    screenEl.remove();
    screenEl = null;
    root.classList.remove('is-pwa-screen');
  }

  addEventListener('beforeinstallprompt', (ev) => { ev.preventDefault(); deferred = ev; syncInstallBtn(); });
  addEventListener('appinstalled', closeScreen);
  // the auth gate and the game take keys while the screen is up: keep them inside it
  addEventListener('keydown', (ev) => { if (screenEl && !screenEl.contains(ev.target)) ev.stopImmediatePropagation(); }, true);

  /* ---------------- tutorial and terminal, made for fingers ---------------- */
  // the tutorial's instructions talk about keys and the mouse: say it with taps (tutorial.js)
  const TOUCH_WORDS = [
    [/Aperte <kbd>\w<\/kbd> ou abra <b>Celular → (\w+)<\/b>/g, 'Toque em <b>Celular</b> → <b>$1</b>'],
    [/Abra <b>Celular → (\w+)<\/b>/g, 'Toque em <b>Celular</b> → <b>$1</b>'],
    [/Aperte <kbd>\w<\/kbd> ou clique em/g, 'Toque em'],
    [/ \(<kbd>Esc<\/kbd>\)/g, ' (botão <b>×</b>)'],
    [/ · <kbd>R<\/kbd> gira/g, ''],
    [/à direita do terminal/g, 'embaixo do terminal'],
    [/Arraste no terreno/g, 'Arraste o dedo no terreno'],
    [/Clique/g, 'Toque'],
    [/clique/g, 'toque'],
  ];
  DL.mobileText = (html) => TOUCH_WORDS.reduce((s, [re, to]) => s.replace(re, to), String(html || ''));
  // scroll the panels that hold a control (build dock, drawer, windows) until it shows; never the page
  DL.mobileReveal = (node) => {
    for (let p = node.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p), r = node.getBoundingClientRect(), c = p.getBoundingClientRect();
      if (p.scrollHeight > p.clientHeight + 1 && /(auto|scroll)/.test(cs.overflowY)) {
        if (r.top < c.top + 8) p.scrollTop -= c.top + 8 - r.top;
        else if (r.bottom > c.bottom - 8) p.scrollTop += r.bottom - c.bottom + 8;
      }
      if (p.scrollWidth > p.clientWidth + 1 && /(auto|scroll)/.test(cs.overflowX)) {
        if (r.left < c.left + 8) p.scrollLeft -= c.left + 8 - r.left;
        else if (r.right > c.right - 8) p.scrollLeft += r.right - c.right + 8;
      }
    }
  };
  // terminal (beginner mode): the suggested command is a button; a tap types it, Enter sends it
  document.addEventListener('click', (ev) => {
    const tip = ev.target.closest('.term__try');
    const input = tip && $('termIn');
    if (!input) return;
    input.value = tip.textContent;
    input.focus({ preventScroll: true });
    input.setSelectionRange(input.value.length, input.value.length);
  });
  // and a visible "Enviar" next to the prompt, for who doesn't look for the keyboard's Enter
  const termLine = document.querySelector('.term__line'), termIn = $('termIn');
  if (termLine && termIn) {
    const send = document.createElement('button');
    send.type = 'button';
    send.className = 'btn btn--sm term__send';
    send.textContent = 'Enviar';
    // pointerdown keeps the keyboard up (the field doesn't lose focus)
    send.addEventListener('pointerdown', (ev) => ev.preventDefault());
    send.addEventListener('click', (ev) => {
      ev.preventDefault();
      termIn.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
      termIn.focus({ preventScroll: true });
    });
    termLine.appendChild(send);
  }

  /* ---------------- the game's HUD on a phone ---------------- */
  // the menu is the little phone (phone.js), on the PC too; here only the emotes move next to the action button
  function gameUi() {
    const emo = document.querySelector('.hud-top .emo'), touch = $('touch'), emoteBtn = $('emoteBtn'), wheel = $('emoteWheel');
    if (emo && touch && emoteBtn && wheel) {
      touch.appendChild(emo);
      emoteBtn.addEventListener('click', () => {
        if (wheel.hidden) return;
        const r = emoteBtn.getBoundingClientRect();
        wheel.style.top = Math.max(8, r.top - wheel.offsetHeight - 8) + 'px';
        wheel.style.left = Math.max(8, Math.min(r.right - wheel.offsetWidth, innerWidth - wheel.offsetWidth - 8)) + 'px';
      });
    }
  }

  const start = () => {
    gameUi();
    let skipped = false;
    try { skipped = sessionStorage.getItem(SKIP_KEY) === '1'; } catch (e) { /* private mode */ }
    if (!standalone && !skipped) openScreen();
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', start);
  else start();
})();
