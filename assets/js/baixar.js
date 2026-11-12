/* DataLab — download page (baixar.html).
   - The landing page's datacenter behind (dc-backdrop.js), without its walking technician.
   - A character made with the game's own sprites (sprites.js) plays every emote of the game in a loop
     (emotes.js: frames + effects); a click / tap or the keys 1–5 jump to the next one.
   - The installers come from config.js → desktopDownloads { version, windows, mac } (https links only).
     Empty = "Em breve". The visitor's system gets the "Seu sistema" mark.
   - Opened from the game's Main Menu (Baixar para PC): without a game session in this browser the
     links stay hidden and the page sends the visitor into the game first. This is a convenience, not a
     lock: the installers are public files once they exist. */
(function () {
  'use strict';
  const DL = window.DL;
  const $ = (id) => document.getElementById(id);
  const calm = matchMedia('(prefers-reduced-motion: reduce)');

  /* ---------------- background ---------------- */
  DL.dcBackdrop($('dc'), { tech: false });

  /* ---------------- the character doing emotes ---------------- */
  // the "Técnico de TI" of the title screen, with the role cap on
  const C_TEC = '#5eead4';
  const LOOK = {
    body: 'm', skin: '#e0ac7e', hair: '#5a3a25', hairStyle: 'short', outfit: 'uniform', shirt: '#2f3a4d', pants: '#232a36', shoes: '#16181d',
    role: 'tecnico', roleColor: C_TEC, badge: C_TEC, lanyard: C_TEC, capColor: C_TEC, hat: 'cap',
  };
  const SHEET = DL.makeSheet(LOOK), EMO = DL.makeEmoteSheet(LOOK), { AX, AY } = DL.CHAR;
  const ORDER = ['wave', 'dance', 'hack', 'angry', 'reboot'];
  const IDLE_GAP = 1.1;   // seconds standing between two emotes
  const cvs = $('hero'), g = cvs.getContext('2d');
  const X = 16, Y = 47;   // feet, in art pixels of the 32×50 canvas
  const bubble = $('bubble'), emName = $('emName'), emNum = $('emNum');
  const S = { i: 0, t: 0, idle: 0, still: calm.matches, raf: 0, last: 0, acc: 0, bubbleKey: '' };

  const em = () => DL.emote(ORDER[S.i]);
  function label() {
    const e = em();
    emName.textContent = e.name;
    emNum.textContent = (S.i + 1) + '/' + ORDER.length;
  }
  function setBubble(text, isText) {
    const key = (isText ? 't:' : 'e:') + text;
    if (key === S.bubbleKey) return;
    S.bubbleKey = key;
    bubble.hidden = !text;
    bubble.textContent = text || '';
    bubble.classList.toggle('is-text', !!isText);
  }

  function draw() {
    const e = em();
    g.clearRect(0, 0, cvs.width, cvs.height);
    // the shadow of DL.drawActor
    g.fillStyle = 'rgba(0, 0, 0, .32)';
    g.fillRect(X - 4, Y - 2, 8, 1);
    g.fillRect(X - 5, Y - 1, 10, 1);
    g.fillRect(X - 4, Y, 8, 1);
    if (S.idle > 0) {
      // between emotes: facing us, blinking now and then
      g.drawImage(S.idle % 1.6 < 0.12 ? SHEET.down.blink : SHEET.down.idle, X - AX, Y - AY);
      setBubble('');
      return;
    }
    const t = S.still ? 0.4 : S.t;
    const frame = DL.emoteFrame(EMO, e.id, t, e.dur) || SHEET.down.idle;
    g.drawImage(frame, X - AX, Y - AY);
    if (e.id === 'angry' && DL.emoteSmoke) DL.emoteSmoke(g, X, Y, t);
    if (e.id === 'hack' || e.id === 'reboot') DL.emoteFx(g, e.id, X, Y, t, e.dur, frame);
    // the texts the game puts in the speech bubble at the end of Invasão / during Reboot's boot
    if (e.id === 'hack' && t > e.dur - 1.3) setBubble('ACESSO LIBERADO', true);
    else if (e.id === 'reboot' && t > 2.2) setBubble('LIGANDO…', true);
    else setBubble(e.emoji);
  }

  function next(step) {
    S.i = (S.i + (step || 1) + ORDER.length) % ORDER.length;
    S.t = 0;
    S.idle = 0;
    label();
    draw();
  }
  function play(i) {
    S.i = i;
    S.t = 0;
    S.idle = 0;
    label();
    draw();
  }

  function tick(now) {
    S.raf = requestAnimationFrame(tick);
    const dt = Math.min(0.1, S.last ? (now - S.last) / 1000 : 0);
    S.last = now;
    S.acc += dt;
    if (S.acc < 1 / 30) return;   // 30 fps, like the backdrop
    const step = S.acc;
    S.acc = 0;
    if (S.idle > 0) {
      S.idle += step;
      if (S.idle >= IDLE_GAP) next(1);
      else draw();
      return;
    }
    S.t += step;
    if (S.t >= em().dur) { S.idle = 0.0001; }
    draw();
  }
  function setMotion() {
    S.still = calm.matches;
    cancelAnimationFrame(S.raf);
    S.last = 0;
    if (S.still) { S.idle = 0; draw(); }
    else S.raf = requestAnimationFrame(tick);
  }

  cvs.tabIndex = 0;
  cvs.addEventListener('click', () => next(1));
  cvs.addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); next(1); } });
  addEventListener('keydown', (ev) => {
    if (ev.metaKey || ev.ctrlKey || ev.altKey || ev.repeat) return;
    const m = /^(?:Digit|Numpad)([1-5])$/.exec(ev.code);
    if (m) play(+m[1] - 1);
  });
  if (calm.addEventListener) calm.addEventListener('change', setMotion);
  label();
  setMotion();

  /* ---------------- installers ---------------- */
  const cfg = (window.DATALAB_CONFIG || {}).desktopDownloads || {};
  const httpsUrl = (u) => { try { const x = new URL(String(u || '')); return x.protocol === 'https:' ? x.href : ''; } catch (e) { return ''; } };
  const version = /^[0-9A-Za-z.+-]{1,32}$/.test(String(cfg.version || '')) ? String(cfg.version) : '';
  const links = { windows: httpsUrl(cfg.windows), mac: httpsUrl(cfg.mac) };

  if (version) $('ver').textContent = ' · v' + version;
  document.querySelectorAll('[data-ver]').forEach((el) => { el.textContent = version ? 'v' + version : '—'; });
  document.querySelectorAll('[data-get]').forEach((a) => {
    const url = links[a.dataset.get];
    if (url) {
      a.href = url;
      a.removeAttribute('aria-disabled');
      a.textContent = a.dataset.get === 'mac' ? 'Baixar para macOS' : 'Baixar para Windows';
      a.rel = 'noopener';
    } else {
      a.removeAttribute('href');
      a.setAttribute('role', 'link');
      a.setAttribute('aria-disabled', 'true');
      a.addEventListener('click', (ev) => ev.preventDefault());
    }
  });
  $('soon').hidden = !!(links.windows || links.mac);

  // which system is this? (iPads say "Mac" but have a touch screen: those are phones/tablets here)
  const ua = navigator.userAgent || '';
  const plat = (navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || '';
  const touch = navigator.maxTouchPoints > 1;
  const mobile = /Android|iPhone|iPad|iPod|Mobile/i.test(ua) || (/Mac/i.test(plat) && touch);
  const os = mobile ? '' : /Win/i.test(plat + ua) ? 'windows' : /Mac/i.test(plat + ua) ? 'mac' : '';
  $('phoneNote').hidden = !mobile;
  if (os) {
    const card = document.querySelector('.os__card[data-os="' + os + '"]');
    card.classList.add('is-mine');
    card.querySelector('.mine').hidden = false;
    // your system first
    if (os === 'mac') card.parentNode.prepend(card);
  }

  /* ---------------- reached from the game? ---------------- */
  // the game keeps its Supabase session in localStorage "datalab.auth" (services/cloud.js → storageKey)
  function hasSession() {
    try {
      const s = JSON.parse(localStorage.getItem('datalab.auth') || 'null');
      return !!(s && (s.refresh_token || (s.currentSession && s.currentSession.refresh_token)));
    } catch (e) { return false; }
  }
  const inGame = hasSession();
  $('gate').hidden = inGame;
  $('get').hidden = !inGame;
})();
