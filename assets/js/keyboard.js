/* DataLab — the on-screen keyboard (phones). When a text field gets the focus (server console, team chat,
   name, search…) the phone's keyboard covers the bottom of the screen. visualViewport says how much of the
   screen is still visible: this file puts that on <html> as CSS variables and a class, and mobile.css
   lifts the console, the chat, the build search and any open window above the keyboard.
     --kb   height covered by the keyboard (px)
     --vvh  height still visible (px)
     --vvt  how far the visible part starts from the top (px; iOS scrolls the page instead of resizing)
     .is-kb while the keyboard is up over a text field
   DL.Keyboard.sim(px) fakes a keyboard of that height (tests on a desktop browser); sim(0) ends it. */
(function () {
  'use strict';
  const DL = (window.DL = window.DL || {});
  const root = document.documentElement;
  const vv = window.visualViewport;
  let fake = 0, raf = 0, last = '';

  const typing = (n) => !!n && (n.tagName === 'TEXTAREA' || n.isContentEditable ||
    (n.tagName === 'INPUT' && !/^(button|checkbox|radio|range|color|file|submit|reset|image)$/i.test(n.type || '')));

  function sync() {
    raf = 0;
    const H = window.innerHeight;
    let vh = vv ? vv.height : H, top = vv ? vv.offsetTop : 0;
    if (fake) { vh = H - fake; top = 0; }
    const kb = Math.max(0, Math.round(H - vh - top));
    const on = kb > 80 && typing(document.activeElement);
    const key = kb + '|' + Math.round(vh) + '|' + Math.round(top) + '|' + on;
    if (key === last) return;
    last = key;
    root.style.setProperty('--kb', (on ? kb : 0) + 'px');
    root.style.setProperty('--vvh', Math.round(on ? vh : H) + 'px');
    root.style.setProperty('--vvt', Math.round(on ? top : 0) + 'px');
    root.classList.toggle('is-kb', on);
    // the field itself in view inside its own scrolling box (never scrolls the page or the game)
    if (on) {
      const n = document.activeElement;
      let p = n && n.parentElement;
      while (p && p !== document.body) {
        const s = getComputedStyle(p).overflowY;
        if ((s === 'auto' || s === 'scroll') && p.scrollHeight > p.clientHeight) {
          const r = n.getBoundingClientRect(), b = p.getBoundingClientRect();
          if (r.bottom > b.bottom) p.scrollTop += r.bottom - b.bottom + 8;
          else if (r.top < b.top) p.scrollTop -= b.top - r.top + 8;
          break;
        }
        p = p.parentElement;
      }
    }
    // iOS scrolls the whole page up to show the field: the game is laid out to the visible part instead
    if (!on && (window.scrollY || document.documentElement.scrollTop)) window.scrollTo(0, 0);
  }
  const soon = () => { if (!raf) raf = requestAnimationFrame(sync); };

  if (vv) { vv.addEventListener('resize', soon); vv.addEventListener('scroll', soon); }
  addEventListener('resize', soon);
  // the keyboard opens a moment after the focus: check again when it has settled
  document.addEventListener('focusin', () => { soon(); setTimeout(soon, 350); });
  document.addEventListener('focusout', () => setTimeout(soon, 60));
  soon();

  DL.Keyboard = {
    sim(px) { fake = Math.max(0, px | 0); last = ''; sync(); },
    get open() { return root.classList.contains('is-kb'); },
  };
})();
