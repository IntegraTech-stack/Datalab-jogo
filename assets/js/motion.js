/* DataLab — motion: spring physics for the interface, drawn as pixel art.
   Every movement is a damped spring set like SwiftUI / the Dynamic Island (response + damping fraction), interruptible
   and keeping its velocity when retargeted. Each frame is then held and snapped: translations to whole pixels, scales to
   whole-pixel sizes, opacity to tenths and clips to 2px stair corners (the --px-notch of demo.css). Fluid and elastic in
   time, crisp in space. It wires itself to the classes the other modules already toggle (is-open, is-out, is-in, is-on),
   so none of them had to change; html.dl-motion turns on the CSS side (motion.css). */
(function () {
  'use strict';
  const DL = (window.DL = window.DL || {});
  const FPS = 60, DT = 1 / FPS, STEP = 2;

  const SPRINGS = {
    snappy: { response: 0.3, damping: 0.86 },
    smooth: { response: 0.42, damping: 1 },
    bouncy: { response: 0.5, damping: 0.68 },
    island: { response: 0.56, damping: 0.74 },
    jelly: { response: 0.36, damping: 0.52 },
    tap: { response: 0.14, damping: 1 },
  };
  let level = 0.6; // Configurações › Animações: 0 = off … 1 = very elastic; 0.6 = the springs as written above

  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const canRun = typeof Element.prototype.animate === 'function' && !!window.CSS && CSS.supports('translate', '1px 1px') && CSS.supports('scale', '1 1');
  const on = () => canRun && level > 0 && !reduced.matches;

  /* ---------------- springs ---------------- */
  // the level only moves the bounce: springs that already overshoot get looser (or firmer), critically damped ones stay put
  function params(s) {
    const p = typeof s === 'object' ? s : SPRINGS[s] || SPRINGS.smooth;
    if (p.damping >= 1) return p;
    return { response: p.response, damping: Math.max(0.3, Math.min(1, 1 - ((1 - p.damping) * level) / 0.6)) };
  }

  // displacement of a unit spring released at x0 with velocity v0, settling at 0
  function solver(p, x0, v0) {
    const w0 = (2 * Math.PI) / p.response, z = p.damping;
    if (z < 1) {
      const wd = w0 * Math.sqrt(1 - z * z), B = (v0 + z * w0 * x0) / wd;
      return (t) => Math.exp(-z * w0 * t) * (x0 * Math.cos(wd * t) + B * Math.sin(wd * t));
    }
    if (z === 1) return (t) => Math.exp(-w0 * t) * (x0 + (v0 + w0 * x0) * t);
    const s = Math.sqrt(z * z - 1), r1 = -w0 * (z - s), r2 = -w0 * (z + s), c2 = (v0 - r1 * x0) / (r2 - r1), c1 = x0 - c2;
    return (t) => c1 * Math.exp(r1 * t) + c2 * Math.exp(r2 * t);
  }

  // progress 0 → 1 sampled per frame until it rests; v0 in "distances per second"
  function curve(p, v0) {
    const f = solver(p, -1, v0 || 0), out = [];
    let last = 1;
    for (let i = 0; i <= FPS * 4; i++) {
      const x = f(i * DT);
      out.push(1 + x);
      if (Math.abs(x) > 0.0015) last = i;
    }
    out.length = last + 2;
    out[last + 1] = 1;
    return out;
  }

  // CSS linear() of a spring; with q the progress is held in 1/q steps, so a 16px move (q = 16) lands on whole pixels
  function linearOf(c, q) {
    const n = c.length - 1, pct = (i) => +((i / n) * 100).toFixed(2) + '%';
    if (!q) return 'linear(' + c.map((v) => +v.toFixed(4)).join(', ') + ')';
    const pts = [];
    let last = null;
    for (let i = 0; i <= n; i++) {
      const v = +(Math.round(c[i] * q) / q).toFixed(4);
      if (v === last) continue;
      if (last !== null) pts.push(last + ' ' + pct(i));
      pts.push(v + ' ' + pct(i));
      last = v;
    }
    pts.push(last + ' 100%');
    return 'linear(' + pts.join(', ') + ')';
  }

  // --spring-<name> (smooth), --spring-<name>-px (stepped) and --spring-<name>-ms, for the CSS transitions in motion.css
  function writeTokens() {
    const st = document.documentElement.style;
    if (!CSS.supports('transition-timing-function', 'linear(0, 1)')) return;
    for (const k in SPRINGS) {
      const c = curve(params(k));
      st.setProperty('--spring-' + k, linearOf(c));
      st.setProperty('--spring-' + k + '-px', linearOf(c, 16));
      st.setProperty('--spring-' + k + '-ms', Math.round((c.length - 1) * DT * 1000) + 'ms');
    }
  }

  /* ---------------- pixel frames ---------------- */
  const IDENT = { x: 0, y: 0, sx: 1, sy: 1, o: 1, rad: 0 };
  const INSETS = ['it', 'ir', 'ib', 'il'];
  const isClip = (k) => k === 'rad' || INSETS.includes(k);
  const snap = (n) => Math.round(n / STEP) * STEP;
  // the size grows or shrinks by whole steps (1px per side), so an odd-sized box still rests at exactly 1
  const snapScale = (s, size) => (size > 0 ? Math.max(0, size + Math.round(((s - 1) * size) / STEP) * STEP) / size : s);

  // a rectangle with pixel-stair corners of radius rad: a pill when rad is half its height, a sprite frame when 0
  function stairs(w, h, t, r, b, l, rad) {
    const x0 = snap(l), y0 = snap(t), x1 = snap(w - r), y1 = snap(h - b);
    if (x1 <= x0 || y1 <= y0) return 'polygon(0 0, 0 0, 0 0)';
    const n = Math.floor(Math.min(Math.max(0, rad), 32, (x1 - x0) / 2, (y1 - y0) / 2) / STEP), R = n * STEP, ins = [];
    for (let j = 0; j < n; j++) { const d = R - (j + 0.5) * STEP; ins.push(snap(R - Math.sqrt(Math.max(0, R * R - d * d)))); }
    const P = [], pt = (x, y) => P.push(x + 'px ' + y + 'px');
    if (!n) { pt(x0, y0); pt(x1, y0); pt(x1, y1); pt(x0, y1); }
    for (let j = n - 1; j >= 0; j--) { pt(x0 + ins[j], y0 + (j + 1) * STEP); pt(x0 + ins[j], y0 + j * STEP); }
    for (let j = 0; j < n; j++) { pt(x1 - ins[j], y0 + j * STEP); pt(x1 - ins[j], y0 + (j + 1) * STEP); }
    for (let j = n - 1; j >= 0; j--) { pt(x1 - ins[j], y1 - (j + 1) * STEP); pt(x1 - ins[j], y1 - j * STEP); }
    for (let j = 0; j < n; j++) { pt(x0 + ins[j], y1 - j * STEP); pt(x0 + ins[j], y1 - (j + 1) * STEP); }
    return 'polygon(' + P.join(', ') + ')';
  }

  function frame(v, keys, w, h, pad) {
    const k = {}, g = (n) => (n in v ? v[n] : isClip(n) && n !== 'rad' ? -pad : IDENT[n]);
    if (keys.has('x') || keys.has('y')) k.translate = Math.round(g('x')) + 'px ' + Math.round(g('y')) + 'px';
    if (keys.has('sx') || keys.has('sy')) k.scale = snapScale(g('sx'), w).toFixed(4) + ' ' + snapScale(g('sy'), h).toFixed(4);
    if (keys.has('o')) k.opacity = Math.round(Math.max(0, Math.min(1, g('o'))) * 10) / 10;
    if ([...keys].some(isClip)) k.clipPath = stairs(w, h, g('it'), g('ir'), g('ib'), g('il'), g('rad'));
    return k;
  }

  /* ---------------- animate ---------------- */
  // One spring animation per element. A new one starts from where the running one is (position and velocity) and keeps
  // heading for its targets on the keys it does not set itself: a card can be lifted by the hover and pressed at once.
  const live = new WeakMap(), held = new Set();

  function sampleAt(rec) {
    const ct = rec.anim.currentTime == null ? 0 : rec.anim.currentTime / 1000;
    const i = Math.max(0, Math.min(rec.n - 1, Math.floor((ct - rec.delay) * FPS))), cur = {}, vel = {};
    for (const k in rec.samples) {
      const s = rec.samples[k];
      cur[k] = s[i];
      vel[k] = i > 0 && i < rec.n - 1 ? (s[i + 1] - s[i - 1]) / (2 * DT) : 0;
    }
    return { cur, vel };
  }

  function stop(el) {
    const rec = live.get(el);
    if (!rec) return;
    rec.anim.cancel();
    live.delete(el);
    held.delete(el);
  }

  // opts: from, to, shift (added to the start), kick (added to the velocity), spring, delay, pad (room for shadows around a clip),
  // restart (a finished, held animation is dropped instead of continued), done
  function animate(el, opts) {
    if (!el || !on()) { if (el) stop(el); if (opts.done) opts.done(); return null; }
    if (held.size > 40) held.forEach((e) => e.isConnected || stop(e)); // cards re-rendered while lifted
    const w = opts.w || el.offsetWidth, h = opts.h || el.offsetHeight, pad = opts.pad || 0;
    const ident = (k) => (k in IDENT ? IDENT[k] : -pad);
    let prev = live.get(el);
    if (prev && opts.restart && prev.anim.playState === 'finished') { stop(el); prev = null; }
    const from = {}, to = {}, vel = {};
    if (prev) {
      const s = sampleAt(prev);
      Object.assign(from, s.cur);
      Object.assign(vel, s.vel);
      Object.assign(to, prev.to);
      prev.anim.cancel();
      held.delete(el);
    }
    for (const k in opts.from || {}) if (!(k in from)) from[k] = opts.from[k];
    Object.assign(to, opts.to);
    const keys = new Set([...Object.keys(from), ...Object.keys(to), ...Object.keys(opts.shift || {})]);
    for (const k in opts.shift || {}) from[k] = (k in from ? from[k] : ident(k)) + opts.shift[k];
    for (const k in opts.kick || {}) vel[k] = (vel[k] || 0) + opts.kick[k];

    const p = params(opts.spring || 'smooth'), tracks = {};
    let n = 2, rests = true;
    keys.forEach((k) => {
      const a = k in from ? from[k] : ident(k), b = k in to ? to[k] : ident(k), d = b - a;
      tracks[k] = { a, d, c: Math.abs(d) < 1e-4 ? [1, 1] : curve(p, (vel[k] || 0) / d) };
      to[k] = b;
      n = Math.max(n, tracks[k].c.length);
      if (Math.abs(b - ident(k)) > 1e-4) rests = false;
    });
    const samples = {}, frames = [];
    keys.forEach((k) => (samples[k] = new Float32Array(n)));
    for (let i = 0; i < n; i++) {
      const v = {};
      keys.forEach((k) => { const t = tracks[k]; v[k] = samples[k][i] = t.a + t.d * t.c[Math.min(i, t.c.length - 1)]; });
      const f = frame(v, keys, w, h, pad);
      f.offset = i / (n - 1);
      f.easing = 'steps(1, end)'; // hold each solved frame: no in-between sub-pixels on 120Hz screens
      frames.push(f);
    }
    const delay = opts.delay || 0;
    // an animation that rests at the identity lets go of the element; one that stops elsewhere (a closed window) holds it
    const anim = el.animate(frames, { duration: (n - 1) * DT * 1000, delay, fill: rests ? 'backwards' : 'both' });
    const rec = { anim, samples, n, delay: delay / 1000, to };
    live.set(el, rec);
    if (!rests) held.add(el);
    anim.onfinish = () => {
      if (rests && live.get(el) === rec) { live.delete(el); anim.cancel(); }
      if (opts.done) opts.done();
    };
    return anim;
  }

  /* ---------------- choreography ---------------- */
  const stagger = (els, opts, gap) => Array.from(els).slice(0, 10).forEach((c, i) => animate(c, Object.assign({}, opts, { delay: (opts.delay || 0) + i * gap })));

  // the island: a small pixel pill centred on (cx, cy) of the element's own box
  function pill(w, h, pw, ph, cx, cy) {
    pw = Math.min(w, pw); ph = Math.min(h, ph);
    const l = Math.max(0, Math.min(w - pw, cx - pw / 2)), t = Math.max(0, Math.min(h - ph, cy - ph / 2));
    return { it: t, ib: h - ph - t, il: l, ir: w - pw - l, rad: ph / 2 };
  }

  // windows (modals and app overlays): grow out of a pill in the middle, the content settles in after the shape
  function windowIn(card) {
    const w = card.offsetWidth, h = card.offsetHeight;
    if (!w || !h) return;
    // every target is set: reopened while still closing, the spring would otherwise keep heading for the pill and stay there
    animate(card, { spring: 'island', pad: 24, restart: true, from: Object.assign({ y: 14 }, pill(w, h, 180, 40, w / 2, h / 2)), to: { y: 0, it: -24, ir: -24, ib: -24, il: -24, rad: 0 } });
    if (card.classList.contains('card--modal')) stagger(card.children, { spring: 'smooth', delay: 70, from: { y: 10, o: 0 } }, 30);
  }
  function windowOut(card) {
    const w = card.offsetWidth, h = card.offsetHeight;
    if (w && h) animate(card, { spring: 'snappy', pad: 24, to: Object.assign({ y: 10 }, pill(w, h, 180, 40, w / 2, h / 2)) });
  }

  // HUD blocks: unfold from a pill under the group button (they hang from the right edge), items slide in one by one
  function dropIn(menu, ax) {
    const w = menu.offsetWidth, h = menu.offsetHeight;
    if (!w) return;
    animate(menu, { spring: 'island', pad: 48, restart: true, from: Object.assign({ y: -6 }, pill(w, h, 96, 32, ax, 16)), to: { y: 0, o: 1, it: -48, ir: -48, ib: -48, il: -48, rad: 0 } });
    stagger(menu.children, { spring: 'bouncy', delay: 40, from: { x: 10, o: 0 } }, 26);
  }
  function dropOut(menu, ax, done) {
    const w = menu.offsetWidth, h = menu.offsetHeight;
    if (!w) return done();
    animate(menu, { spring: 'snappy', pad: 48, to: Object.assign({ y: -4, o: 0 }, pill(w, h, 96, 32, ax, 16)), done });
  }

  // notifications: a pill drops in and stretches sideways into the message (the Dynamic Island), and folds back to leave
  function islandIn(el) {
    const w = el.offsetWidth, h = el.offsetHeight;
    if (!w) return;
    animate(el, { spring: 'island', pad: 12, restart: true, from: Object.assign({ y: -14, o: 0 }, pill(w, h, Math.max(h * 2, 64), h, w / 2, h / 2)), to: { y: 0, o: 1 } });
    stagger(el.children, { spring: 'smooth', delay: 90, from: { x: -6, o: 0 } }, 35);
  }
  function islandOut(el) {
    const w = el.offsetWidth, h = el.offsetHeight;
    if (w) animate(el, { spring: 'snappy', pad: 12, to: Object.assign({ y: -10, o: 0 }, pill(w, h, Math.max(h * 2, 64), h, w / 2, h / 2)) });
  }

  // the main-menu views morph out of the button that opened them (shared element)
  function morphFrom(body, src) {
    const w = body.offsetWidth, h = body.offsetHeight;
    if (!w) return;
    if (!src) return animate(body, { spring: 'island', pad: 16, restart: true, from: pill(w, h, 200, 48, w / 2, h / 2) });
    const b = body.getBoundingClientRect(), s = src.getBoundingClientRect();
    const sw = Math.min(w, s.width), sh = Math.min(h, s.height);
    animate(body, {
      spring: 'island', pad: 16, restart: true,
      from: { x: s.left - b.left, y: s.top - b.top, it: 0, il: 0, ir: w - sw, ib: h - sh, rad: 6 },
    });
    stagger(body.children, { spring: 'smooth', delay: 120, from: { y: 10, o: 0 } }, 40);
  }

  /* ---------------- wiring ---------------- */
  const had = (m, c) => new RegExp('(^|\\s)' + c + '(\\s|$)').test(m.oldValue || '');
  // fires on a class being added or removed during a batch, even when a module removes and re-adds it to replay an entrance
  function onClass(el, cls, add, remove) {
    if (!el) return;
    new MutationObserver((ms) => {
      if (!on()) return;
      const now = el.classList.contains(cls);
      if (now && ms.some((m) => !had(m, cls))) add(el);
      else if (!now && remove && ms.some((m) => had(m, cls))) remove(el);
    }).observe(el, { attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  }

  // a stack of notifications: new ones open as islands, the others glide to their new place (FLIP on offsetTop)
  function stack(box) {
    if (!box) return;
    const tops = new WeakMap();
    new MutationObserver((ms) => {
      if (!on()) return;
      for (const m of ms) {
        if (m.type === 'childList') {
          m.addedNodes.forEach((n) => n.nodeType === 1 && n.parentNode === box && islandIn(n));
          m.removedNodes.forEach((n) => n.nodeType === 1 && stop(n));
        }
        else if (m.target.parentNode === box && m.target.classList.contains('is-out') && !had(m, 'is-out')) islandOut(m.target);
      }
      for (const c of box.children) {
        const old = tops.get(c);
        if (old != null && Math.abs(old - c.offsetTop) >= 1) animate(c, { spring: 'bouncy', shift: { y: old - c.offsetTop } });
        tops.set(c, c.offsetTop);
      }
    }).observe(box, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'], attributeOldValue: true });
  }

  // press: the control sinks 2px on each side and pops back a few pixels past its size; Enter/Space get the same tap
  const PRESS = 'button, .btn, [role="button"], .st-card, .mv-item, .mv-room';
  const pressable = (t) => {
    const b = t && t.closest && t.closest(PRESS);
    return b && !b.disabled && !b.closest('.touch, [data-no-motion]') && b.offsetWidth * b.offsetHeight < 200000 ? b : null;
  };
  function press(b, down, done) {
    const w = b.offsetWidth, h = b.offsetHeight;
    if (!w || !h) return;
    animate(b, down
      ? { spring: done ? 'tap' : 'snappy', to: { sx: (w - STEP * 2) / w, sy: (h - STEP * 2) / h }, done }
      : { spring: 'jelly', to: { sx: 1, sy: 1 }, kick: { sx: 120 / w, sy: 120 / h } }); // ~2px past its size: an overshoot the pixel grid keeps
  }

  // cards rise on hover (the spring replaces their CSS lift)
  const LIFT = '.st-card, .mv-item, .mv-room, .rl-cta';

  function wire() {
    document.querySelectorAll('.overlay').forEach((ov) => onClass(ov, 'is-open', () => windowIn(ov.firstElementChild), () => windowOut(ov.firstElementChild)));

    const panel = document.getElementById('panel'), inner = document.getElementById('panelInner');
    onClass(panel, 'is-open', () => {
      const w = inner.offsetWidth, h = inner.offsetHeight;
      if (w) animate(inner, { spring: 'island', pad: 8, restart: true, from: Object.assign({ x: 14 }, pill(w, h, 120, 40, w - 60, 20)), to: { x: 0 } });
    }, () => animate(inner, { spring: 'snappy', to: { x: 28 } }));

    document.querySelectorAll('.hud-group').forEach((g) => {
      const menu = g.querySelector('.hud-group__menu'), btn = g.querySelector('.hud-group__btn');
      const ax = () => { const m = menu.getBoundingClientRect(), b = btn.getBoundingClientRect(); return b.left + b.width / 2 - m.left; };
      onClass(g, 'is-open', () => { g.classList.remove('is-closing'); dropIn(menu, ax()); }, () => {
        g.classList.add('is-closing'); // keeps the block on screen (motion.css) while it folds back
        dropOut(menu, ax(), () => { if (!g.classList.contains('is-open')) g.classList.remove('is-closing'); });
      });
    });

    const wheel = document.getElementById('emoteWheel');
    if (wheel) new MutationObserver(() => {
      if (!on() || wheel.hidden) return;
      const w = wheel.offsetWidth, h = wheel.offsetHeight;
      animate(wheel, { spring: 'island', pad: 16, restart: true, from: Object.assign({ y: -6 }, pill(w, h, 64, 28, 32, 14)), to: { y: 0 } });
      stagger(wheel.children, { spring: 'jelly', delay: 40, from: { sx: 0.5, sy: 0.5, o: 0 } }, 30);
    }).observe(wheel, { attributes: true, attributeFilter: ['hidden'] });

    stack(document.getElementById('toasts'));
    stack(document.getElementById('talkPings'));

    // the view grows out of the menu button that opened it
    const view = document.getElementById('menuView'), title = document.getElementById('title');
    let opener = null;
    if (title) title.addEventListener('click', (ev) => { const g = ev.target.closest('[data-go]'); if (g) opener = g; }, true);
    onClass(view, 'is-in', () => morphFrom(view.firstElementChild, opener && opener.isConnected && opener.offsetWidth ? opener : null));
    onClass(document.getElementById('menuFlash'), 'is-on', islandIn);

    document.addEventListener('pointerdown', (ev) => {
      if (!on() || ev.button > 0) return;
      const b = pressable(ev.target);
      if (!b) return;
      press(b, true);
      const up = () => { removeEventListener('pointerup', up, true); removeEventListener('pointercancel', up, true); press(b, false); };
      addEventListener('pointerup', up, true);
      addEventListener('pointercancel', up, true);
    }, true);
    document.addEventListener('click', (ev) => {
      if (!on() || ev.detail !== 0) return; // keyboard activation
      const b = pressable(ev.target);
      if (b) press(b, true, () => press(b, false));
    }, true);

    const lift = (ev, y) => {
      if (!on() || ev.pointerType !== 'mouse') return;
      const c = ev.target.closest && ev.target.closest(LIFT);
      if (c && !c.contains(ev.relatedTarget)) animate(c, { spring: 'bouncy', to: { y } });
    };
    document.addEventListener('pointerover', (ev) => lift(ev, -4));
    document.addEventListener('pointerout', (ev) => lift(ev, 0));
  }

  /* ---------------- level ---------------- */
  function apply() {
    const yes = on();
    document.documentElement.classList.toggle('dl-motion', yes);
    if (yes) writeTokens();
    else {
      held.forEach(stop);
      document.querySelectorAll('.is-closing').forEach((g) => g.classList.remove('is-closing'));
    }
  }
  function setLevel(v) {
    v = Math.max(0, Math.min(1, Number(v) || 0));
    if (v === level) return;
    level = v;
    apply();
  }
  // a nudge so the player feels the new setting
  function preview(el) { if (el && on()) animate(el, { spring: 'bouncy', shift: { y: -12 } }); }

  if (reduced.addEventListener) reduced.addEventListener('change', apply);
  apply();
  wire();

  DL.Motion = { SPRINGS, animate, stop, stagger, islandIn, islandOut, windowIn, windowOut, setLevel, preview, get level() { return level; }, get enabled() { return on(); } };
})();
