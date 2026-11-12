/* DataLab — climatização (clima.js): the precision cooling units seen working.
   - cold air coming out of the front of each unit: little streaks and puffs that blow into the room, sink to
     the floor and fade, with a soft blue glow on the floor in front. Better models blow more and further; the
     top ones add frost sparkles and a low mist. No power (a blackout) = no air.
   - a tag over every unit with the temperature of the air it blows (and "sem energia" in a blackout).
   - the unit's panel (click it / E): what it is doing for the racks around it and the "Melhorar" button: the
     next model (hardware.js HW.crac), unlocked by the player's career level and paid from the company's cash.
   The cooling itself (how much each model takes off a rack) lives in incendio.js → calcular(). */
(function () {
  'use strict';
  const DL = window.DL, D = window.DataLabDemo;
  if (!DL || !D || !D.scene || !DL.HW || !DL.HW.crac) return;
  const G = D.game, scene = D.scene, ops = D.ops, T = DL.T || 16;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rand = Math.random;
  const IX = (x, y) => x - y, IY = (x, y, z) => (x + y) / 2 - (z || 0);
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const graus = (t) => t.toFixed(1).replace('.', ',') + ' °C';
  const world = () => scene.world;
  const cracs = () => world().items.filter((e) => e.kind === 'crac');
  const dentro = () => !(DL.Street && DL.Street.outside);
  const semEnergia = () => { const b = D.blackout && D.blackout.state; return !!(b && (b.phase === 'dark' || b.phase === 'semRack')); };
  const nivel = () => (D.career ? D.career.level : 1);
  const centro = (e) => ({ x: e.px + (e.tw || 1) * 8, y: e.py + (e.th || 1) * 8 });
  // which way the front (the grille the air comes out of) faces: 0 down · 1 up · 2 right · 3 left
  const DIR = [[0, 1], [0, -1], [1, 0], [-1, 0]];

  // name / telemetry of a unit follow its model (a new unit, a loaded save, an upgrade)
  function aplicar(e) {
    const m = DL.cracModel(e);
    e.name = m.name;
    if (e.tel) { e.tel.temp = m.supply; e.tel.power = m.power; }
    return m;
  }

  /* ---------- the air: particles in world space (x, y on the floor, z up) ---------- */
  const P = [];
  const MAX = 700;
  function emit(x, y, z, vx, vy, vz, life, size, kind, col) {
    if (P.length >= MAX) return;
    P.push({ x, y, z, vx, vy, vz, life, max: life, size, kind, col });
  }
  function soprar(e, m, dt) {
    const d = DIR[e.rot | 0] || DIR[0], c = centro(e);
    // the front face: half a tile ahead of the centre, spread along the unit's width
    const fx = c.x + d[0] * 8, fy = c.y + d[1] * 8, sx = -d[1], sy = d[0];
    const speed = 16 + m.tier * 6, reach = 0.9 + m.tier * 0.28;
    const n = (2.2 + m.tier * 1.3) * dt * 30 * (e.tuned ? 1 : 0.7);
    let k = Math.floor(n) + (rand() < n % 1 ? 1 : 0);
    while (k-- > 0) {
      const u = (rand() - 0.5) * 12, z = 3 + rand() * 24;
      const sp = speed * (0.7 + rand() * 0.6);
      // streaks (the wind itself) and puffs (the cold you can see)
      const streak = rand() < 0.55;
      emit(fx + sx * u, fy + sy * u, z, d[0] * sp + sx * (rand() - 0.5) * 7, d[1] * sp + sy * (rand() - 0.5) * 7, -(2 + rand() * 7),
        reach * (0.7 + rand() * 0.6), streak ? 1 : 2, streak ? 0 : 1, m.accent);
    }
    // frost sparkles (líquida, crio) and the mist that crawls on the floor (crio)
    if (m.tier >= 4 && rand() < 0.5 * dt * 30) {
      const u = (rand() - 0.5) * 14, far = 6 + rand() * 26;
      emit(fx + sx * u + d[0] * far, fy + sy * u + d[1] * far, 2 + rand() * 22, d[0] * 4, d[1] * 4, -3, 0.35 + rand() * 0.3, 1, 2, '#ffffff');
    }
    if (m.tier >= 5 && rand() < 0.35 * dt * 30) {
      const u = (rand() - 0.5) * 16;
      emit(fx + sx * u, fy + sy * u, 1, d[0] * (10 + rand() * 8) + sx * (rand() - 0.5) * 10, d[1] * (10 + rand() * 8) + sy * (rand() - 0.5) * 10, 0, 2.2 + rand(), 3, 3, '#cfeaff');
    }
  }
  function desenharAr(g, dt) {
    g.globalCompositeOperation = 'lighter';
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.life -= dt;
      if (p.life <= 0) { P[i] = P[P.length - 1]; P.pop(); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.z < 1) { p.z = 1; p.vz = 0; p.vx *= 0.985; p.vy *= 0.985; } // cold air sinks and spreads on the floor
      const k = p.life / p.max, a = Math.sin(Math.min(1, k * 1.15) * Math.PI);
      const X = IX(p.x, p.y), Y = IY(p.x, p.y, p.z);
      g.fillStyle = p.col;
      if (p.kind === 0) {
        // a streak: a short line along the way it is going (in iso pixels)
        const dx = IX(p.vx, p.vy), dy = IY(p.vx, p.vy, 0), L = Math.hypot(dx, dy) || 1, len = 3 + (1 - k) * 3;
        g.globalAlpha = 0.5 * a;
        for (let s = 0; s < len; s++) g.fillRect(Math.round(X - (dx / L) * s), Math.round(Y - (dy / L) * s), 1, 1);
      } else if (p.kind === 2) {
        // a sparkle: a tiny cross that blinks
        g.globalAlpha = 0.9 * a;
        g.fillRect(Math.round(X), Math.round(Y), 1, 1);
        if (k > 0.35 && k < 0.75) { g.fillRect(Math.round(X) - 1, Math.round(Y), 3, 1); g.fillRect(Math.round(X), Math.round(Y) - 1, 1, 3); }
      } else {
        // a puff (it grows as it slows down) / the floor mist (wide and flat)
        const s = p.kind === 3 ? 4 + Math.round((1 - k) * 5) : p.size + Math.round((1 - k) * 2);
        g.globalAlpha = (p.kind === 3 ? 0.13 : 0.26) * a;
        g.fillRect(Math.round(X - s / 2), Math.round(Y - (p.kind === 3 ? 1 : s / 2)), s, p.kind === 3 ? 2 : s);
      }
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }
  let glow = null;
  function brilho() {
    const c = DL.mk ? DL.mk(64, 64) : Object.assign(document.createElement('canvas'), { width: 64, height: 64 });
    const x = c.getContext('2d'), grd = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(150,205,255,0.7)'); grd.addColorStop(0.45, 'rgba(120,180,255,0.22)'); grd.addColorStop(1, 'rgba(120,180,255,0)');
    x.fillStyle = grd; x.fillRect(0, 0, 64, 64);
    return c;
  }
  let lastT = 0;
  function desenhar(g, sc) {
    const now = sc.t, dt = Math.max(0, Math.min(0.1, now - lastT));
    lastT = now;
    if (!sc.iso || !dentro()) { P.length = 0; return; }
    const list = cracs(), off = semEnergia();
    if (!list.length) { P.length = 0; return; }
    // the cold on the floor in front of each unit (on the ground plane), breathing slowly
    if (!off) {
      if (!glow) glow = brilho();
      g.save();
      if (sc.groundTransform) sc.groundTransform(g);
      g.globalCompositeOperation = 'lighter';
      for (const e of list) {
        const m = DL.cracModel(e), d = DIR[e.rot | 0] || DIR[0], c = centro(e);
        const R = 20 + m.tier * 7, far = 8 + R * 0.55;
        g.globalAlpha = (0.2 + m.tier * 0.05) * (reduced ? 1 : 0.8 + 0.2 * Math.sin(now * 1.6 + (e.seed || 0)));
        g.drawImage(glow, c.x + d[0] * far - R, c.y + d[1] * far - R, R * 2, R * 2);
      }
      g.restore();
    }
    if (reduced) return;
    DL.isoKit.isoT(g, sc);
    if (!off) for (const e of list) soprar(e, DL.cracModel(e), dt);
    desenharAr(g, dt);
  }
  // after the room and its night tint, before the fire's own overlay order does not matter: both only add light
  const baseOverlay = scene.overlay;
  scene.overlay = function (g, sc) {
    if (baseOverlay) baseOverlay.call(this, g, sc);
    g.save();
    try { desenhar(g, sc); } finally { g.restore(); }
  };

  /* ---------- the temperature over each unit ---------- */
  const raiz = G.root || document.getElementById('game') || document.body;
  const tags = new Map(); // unit → { el, key }
  function tagDe(e) {
    let t = tags.get(e);
    if (!t) {
      const el = document.createElement('div');
      el.className = 'clima-temp';
      el.setAttribute('aria-hidden', 'true');
      raiz.appendChild(el);
      t = { el, key: '' };
      tags.set(e, t);
    }
    return t;
  }
  function atualizarTags() {
    const show = dentro() && D.state.phase === 'play' && (D.state.mode === 'explore' || D.state.mode === 'crew') && scene.iso;
    const list = show ? cracs() : [];
    for (const [e, t] of tags) if (list.indexOf(e) < 0) { t.el.remove(); tags.delete(e); }
    const off = semEnergia();
    for (const e of list) {
      const t = tagDe(e), m = DL.cracModel(e);
      // (a slow, tiny drift: a real sensor never stands still)
      const temp = DL.cracSupply(e) + Math.sin(scene.t * 0.35 + (e.seed || 0)) * 0.2;
      const key = off ? 'off' : graus(temp) + m.tier + (e.tuned ? 't' : '');
      if (key !== t.key) {
        t.key = key;
        t.el.textContent = off ? '⚡ sem energia' : '❄ ' + graus(temp);
        t.el.style.setProperty('--c', off ? '#8a919c' : m.accent);
        t.el.classList.toggle('is-off', off);
        t.el.title = m.name;
      }
      const p = scene.itemTop(e, 3);
      // (the "E" prompt over this same unit: the tag goes above it)
      const y = p.y - (D.state.target === e ? 38 : 0);
      t.el.style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) translate(-50%,-100%)';
    }
  }
  const baseRender = scene.render;
  scene.render = function () {
    baseRender.apply(this, arguments);
    atualizarTags();
  };

  /* ---------- the unit's panel: what it does, and the upgrade ---------- */
  const stars = (n) => '<span class="clima-stars" aria-label="Modelo ' + n + ' de 5">' + '◆'.repeat(n) + '<i>' + '◆'.repeat(5 - n) + '</i></span>';
  function atendidos(e) {
    const m = DL.cracModel(e), c = centro(e), room = ops.roomOf(e);
    return world().items.filter((r) => r.kind === 'rack' && r.units && r.units.some(Boolean) && ops.roomOf(r) === room)
      .map((r) => ({ r, d: Math.hypot(r.px + 8 - c.x, r.py + 8 - c.y) / T }))
      .filter((x) => x.d < m.raio);
  }
  function painelHtml(e) {
    const m = aplicar(e), nx = DL.cracNext(e), off = semEnergia();
    const near = atendidos(e), hot = near.slice().sort((a, b) => (b.r.tmon || 0) - (a.r.tmon || 0))[0];
    const row = (k, v, tag) => '<li><span class="dot"></span><span class="mono">' + k + '</span><span class="grow">' + v + '</span><span class="tag">' + (tag || '') + '</span></li>';
    let h = '<div class="p-sec"><span class="eyebrow-sm">Climatização ' + stars(m.tier) + '</span><ul class="list">' +
      row('AR', 'Ar insuflado', off ? 'sem energia' : graus(DL.cracSupply(e))) +
      row('FRIO', 'Tira de um rack ao lado', '−' + (m.frio * (e.tuned ? 1.25 : 1)).toFixed(1).replace('.', ',') + ' °C') +
      row('ALC', 'Alcance', m.raio + ' blocos') +
      row('RACK', 'Racks no alcance', near.length ? near.length + (hot && hot.r.tmon != null ? ' · mais quente ' + graus(hot.r.tmon) : '') : 'nenhum') +
      row('FILT', 'Manutenção', e.tuned ? 'em dia' : 'filtros sujos') +
      '</ul>' + (e.tuned ? '' : '<p class="callout">Sem manutenção ele rende menos e sopra 1,5 °C mais quente. A equipe limpa os filtros quando um rack esquenta (Monitor → ordem de serviço).</p>') + '</div>';
    h += '<div class="p-sec"><span class="eyebrow-sm">Especificação</span><dl class="p-spec">' + DL.hwSpecs('crac', m).map(([k, v]) => '<dt>' + k + '</dt><dd>' + esc(v) + '</dd>').join('') + '</dl></div>';
    if (!nx) return h + '<div class="p-sec clima-up is-max"><span class="eyebrow-sm">Modelo</span><p>Este é o melhor modelo que existe. ❄</p></div>';
    const lvl = nivel(), locked = lvl < nx.level, cash = D.economy && D.economy.company ? D.economy.company.cash : 0, poor = cash < nx.up;
    h += '<div class="p-sec clima-up" style="--c:' + nx.accent + '"><span class="eyebrow-sm">Próximo modelo ' + stars(nx.tier) + '</span>' +
      '<p class="clima-up__name">' + esc(nx.name) + '</p><p class="clima-up__desc">' + esc(nx.desc) + '</p>' +
      '<ul class="clima-up__gain"><li>Frio <b>−' + m.frio + ' → −' + nx.frio + ' °C</b></li><li>Alcance <b>' + m.raio + ' → ' + nx.raio + ' blocos</b></li><li>Ar <b>' + m.supply + ' → ' + nx.supply + ' °C</b></li></ul>' +
      (locked
        ? '<p class="callout">🔒 Libera no nível ' + nx.level + ' da carreira' + (D.career && D.career.LEVELS[nx.level - 1] ? ' (' + esc(D.career.LEVELS[nx.level - 1].rank.name) + ')' : '') + '. Você está no nível ' + lvl + '.</p>'
        : '<div class="actions"><button class="btn btn--sm btn--primary" type="button" data-clima="up"' + (poor ? ' disabled' : '') + '>Melhorar · ' + DL.money(nx.up) + '</button>' +
          (poor ? '<span class="clima-up__poor">Faltam ' + DL.money(nx.up - cash) + '</span>' : '') + '</div>') +
      '</div>';
    return h;
  }
  function melhorar(e) {
    const nx = DL.cracNext(e);
    if (!e || !nx || world().items.indexOf(e) < 0) return false;
    if (nivel() < nx.level) { G.toast('warn', nx.name, 'Libera no nível ' + nx.level + ' da carreira'); return false; }
    if (!D.economy || !D.economy.upgrade || !D.economy.upgrade(nx.up, nx.name)) { G.toast('warn', 'Saldo insuficiente', nx.name + ' custa ' + DL.money(nx.up)); return false; }
    e.model = nx.id;
    aplicar(e);
    if (G.sfx) G.sfx('done');
    G.toast('ok', 'Refrigeração melhorada', (e.id || 'Ar') + ' agora é ' + nx.name + ': até −' + nx.frio + ' °C nos racks, alcance de ' + nx.raio + ' blocos.');
    // a burst of cold air to mark it
    for (let i = 0; i < 12; i++) soprar(e, nx, 1 / 30);
    if (DL.Calor && DL.Calor.recalcular) DL.Calor.recalcular();
    return true;
  }
  // the panel's button (the panel is drawn by demo.js; it is opened again to show the new model)
  document.addEventListener('click', (ev) => {
    const b = ev.target.closest && ev.target.closest('[data-clima="up"]');
    if (!b) return;
    const e = D.state.panel;
    if (!e || e.kind !== 'crac') return;
    if (melhorar(e) && D.openPanel) D.openPanel(e);
  });
  // units placed / loaded: name and telemetry follow the model
  G.on('world', () => { for (const e of cracs()) aplicar(e); });

  DL.Clima = { painelHtml, melhorar, aplicar, cracs, get particulas() { return P.length; } };
})();
