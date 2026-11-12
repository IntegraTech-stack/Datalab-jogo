/* DataLab — cabling view: a front elevation of the racks in a room, drawn in SVG.
   Click or drag from one port to another to plug a cable; grab a plugged end to move it, drop it in the
   empty space to unplug. Colours: blue = working path, yellow = incomplete, red = wrong, orange = loose.
   "Organizar cabos" routes everything through the cable managers. */
(function () {
  'use strict';
  const DL = window.DL;
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const NS = 'http://www.w3.org/2000/svg';

  const COL = { ok: '#6aa7e8', part: '#e8c15a', bad: '#f2495c', loose: '#ff9830', idle: '#8a919c', drag: '#ffffff' };
  const RW = 340, GAP = 36, TOP = 64, SLOT = 58, UH = 46, PX0 = 84, PSTEP = 16;

  DL.createCabling = function (game, sys) {
    const $ = (id) => document.getElementById(id);
    const el = { root: $('cabling'), svg: $('cabSvg'), title: $('cabTitle'), list: $('cabList'), msg: $('cabMsg'), tidy: $('cabTidy'), close: $('cabClose'), back: $('cabBack'), hint: $('cabHint') };
    const C = { open: false, racks: [], focus: null, drag: null, msg: null, back: null };
    const ops = () => sys.ops;

    /* ---------- geometry ---------- */
    const rackX = (i) => GAP + i * (RW + GAP);
    function portPos(key, port) {
      const d = ops().get(key);
      if (!d) return null;
      const i = C.racks.indexOf(d.rack);
      if (i < 0) return null;
      const x0 = rackX(i), y0 = TOP + 16 + d.slot * SLOT;
      if (d.kind === 'server') return { x: x0 + RW - 52, y: y0 + UH / 2, rack: i };
      if (d.kind === 'switch') {
        if (port === 'te1') return { x: x0 + RW - 30, y: y0 + 15, rack: i };
        const n = parseInt(port.split('/')[1], 10) - 1, dense = DL.portsOf(d).length > 25;
        // up to 24 ports: 2 rows of 12; 48 ports: 2 rows of 24 at half pitch
        const cols = dense ? 24 : 12, step = dense ? PSTEP / 2 : PSTEP;
        return { x: x0 + PX0 + (n % cols) * step + (dense ? 2 : 6), y: y0 + 15 + Math.floor(n / cols) * 16, rack: i, dense };
      }
      const n = parseInt(port.slice(1), 10) - 1;
      return { x: x0 + PX0 + n * PSTEP + 6, y: y0 + (port[0] === 'f' ? 15 : 31), rack: i };
    }

    // cable route: a sagging curve (messy rack) or an orthogonal run through the cable manager (tidy)
    function route(p, q, tidy, k) {
      if (!tidy) {
        const sag = 46 + (k % 5) * 12 + Math.abs(p.x - q.x) * 0.08;
        return 'M' + p.x + ',' + p.y + ' C' + (p.x + 8) + ',' + (p.y + sag) + ' ' + (q.x - 8) + ',' + (q.y + sag) + ' ' + q.x + ',' + q.y;
      }
      const off = (k % 6) * 3;
      const chA = rackX(p.rack) + RW - 10 - off, chB = rackX(q.rack) + RW - 10 - off;
      const ya = p.y + 10 + (k % 3), yb = q.y + 10 + (k % 3);
      let d = 'M' + p.x + ',' + p.y + ' V' + ya + ' H' + chA;
      if (p.rack === q.rack) d += ' V' + yb;
      else { const tray = TOP - 26 - off; d += ' V' + tray + ' H' + chB + ' V' + yb; }
      return d + ' H' + q.x + ' V' + q.y;
    }

    /* ---------- render ---------- */
    function devLabel(d) { return d.name + (d.ip ? ' · ' + d.ip : ''); }

    function render() {
      const O = ops(), cls = O.classify();
      const n = C.racks.length, W = rackX(n) , H = TOP + 16 + 9 * SLOT + 40;
      el.svg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
      el.svg.style.minWidth = Math.min(W, 1100) + 'px';
      let h = '<defs><pattern id="cabMesh" width="6" height="6" patternUnits="userSpaceOnUse"><rect width="6" height="6" fill="#121418"/><circle cx="3" cy="3" r="1" fill="#1c2027"/></pattern></defs>';
      // cable tray
      if (n > 1) h += '<rect x="' + (GAP - 8) + '" y="' + (TOP - 40) + '" width="' + (W - 2 * GAP + 16) + '" height="22" rx="3" fill="#15181d" stroke="#262b33"/><text x="' + GAP + '" y="' + (TOP - 25) + '" class="cab-small">bandeja de cabos</text>';
      const need = new Set(O.devices().filter((d) => d.kind === 'server' && C.racks.indexOf(d.rack) >= 0 && !O.trace(d).ok).map((d) => d.key));
      C.racks.forEach((r, i) => {
        const x0 = rackX(i);
        h += '<g class="cab-rack">';
        h += '<rect x="' + x0 + '" y="' + TOP + '" width="' + RW + '" height="' + (9 * SLOT + 24) + '" rx="6" fill="#0d0f12" stroke="#2a2f37"/>';
        h += '<rect x="' + (x0 + RW - 18) + '" y="' + (TOP + 10) + '" width="12" height="' + (9 * SLOT + 4) + '" rx="3" fill="#15181d" stroke="#242931"/>';
        h += '<text x="' + (x0 + 12) + '" y="' + (TOP - 8) + '" class="cab-rack__name">' + esc(r.id) + (r.tidy === false ? ' · <tspan fill="#e8c15a">cabos desorganizados</tspan>' : '') + '</text>';
        for (let k = 0; k < 9; k++) {
          const y0 = TOP + 16 + k * SLOT;
          h += '<text x="' + (x0 + 6) + '" y="' + (y0 + UH / 2 + 4) + '" class="cab-u">' + String(40 - k * 4).padStart(2, '0') + '</text>';
          const d = O.devices().find((x) => x.rack === r && x.slot === k);
          if (!d) { h += '<rect x="' + (x0 + 24) + '" y="' + y0 + '" width="' + (RW - 52) + '" height="' + UH + '" rx="3" fill="url(#cabMesh)" stroke="#1a1e24"/>'; continue; }
          const focus = C.focus === d;
          h += '<g class="cab-unit cab-unit--' + d.kind + (focus ? ' is-focus' : '') + '">';
          h += '<rect x="' + (x0 + 24) + '" y="' + y0 + '" width="' + (RW - 52) + '" height="' + UH + '" rx="3" class="cab-unit__body"/>';
          h += '<text x="' + (x0 + 32) + '" y="' + (y0 + 17) + '" class="cab-unit__name">' + esc(d.name) + '</text>';
          const m = DL.hwOf(d);
          h += '<text x="' + (x0 + 32) + '" y="' + (y0 + 31) + '" class="cab-small">' + (d.kind === 'server' ? esc(d.ip) + ' · ' + esc(m.tier) : d.kind === 'switch' ? esc((DL.portsOf(d).length - 1) + 'p · ' + DL.hwFmt.gb(m.port) + (m.poe ? ' · PoE' : '') + (m.managed === false ? ' · simples' : '')) : 'patch panel') + '</text>';
          if (d.kind === 'server') {
            const st = O.health(d), ok = O.trace(d).ok;
            h += '<circle cx="' + (x0 + 110) + '" cy="' + (y0 + 14) + '" r="3" fill="' + (d.state === 'online' ? (st.up ? '#73bf69' : '#f2495c') : '#c98a3c') + '"/>';
            h += '<text x="' + (x0 + 118) + '" y="' + (y0 + 17) + '" class="cab-small">' + (d.state === 'online' ? (st.up ? 'online' : 'fora do ar') : d.state === 'link' ? 'cabo ok · configurar' : 'sem rede') + '</text>';
            for (let b = 0; b < 4; b++) h += '<rect x="' + (x0 + 110 + b * 22) + '" y="' + (y0 + 26) + '" width="18" height="10" rx="1" fill="#14171c" stroke="#232831"/>';
            h += port(d, 'eth0', 'eth0', need.has(d.key), ok);
          } else if (d.kind === 'switch') {
            for (const p of DL.portsOf(d)) h += port(d, p, p === 'te1' ? 'te1' : p.split('/')[1], false, d.sw.linked && d.sw.linked.has(p), d.sw.ports[p] === 'err-disabled');
            h += '<text x="' + (x0 + RW - 38) + '" y="' + (y0 + 38) + '" class="cab-small">uplink</text>';
          } else {
            h += '<text x="' + (x0 + PX0 - 14) + '" y="' + (y0 + 18) + '" class="cab-small">F</text><text x="' + (x0 + PX0 - 14) + '" y="' + (y0 + 34) + '" class="cab-small">T</text>';
            for (const p of DL.PORTS.patch) h += port(d, p, p.slice(1), false, !!O.linkAt(d.key, p));
          }
          h += '</g>';
        }
        h += '</g>';
      });
      // uplinks leaving each switch for the core (fixed infrastructure)
      for (const d of O.devices()) {
        if (d.kind !== 'switch') continue;
        const p = portPos(d.key, 'te1');
        if (p) h += '<path d="M' + p.x + ',' + p.y + ' V' + (TOP - 4) + '" class="cab-cable" stroke="#e8c15a" stroke-width="3" opacity="0.7"><title>Uplink para o core (fixo)</title></path>';
      }
      // cables
      O.links.forEach((l, k) => {
        const st = cls.get(l) || 'part';
        const da = O.get(l.a.dev), db = O.get(l.b.dev);
        const tidy = da.rack.tidy !== false && db.rack.tidy !== false;
        const pa = portPos(l.a.dev, l.a.port), pb = portPos(l.b.dev, l.b.port);
        if (C.drag && C.drag.link === l) {
          const fixed = C.drag.end === 'a' ? pb : pa;
          if (fixed) h += '<path d="' + route(fixed, { x: C.drag.x, y: C.drag.y, rack: fixed.rack }, false, k) + '" class="cab-cable is-drag" stroke="' + COL.drag + '"/>';
          return;
        }
        if (!pa || !pb) {
          // one end in a rack that is not on screen: show the cable leaving through the tray
          const p = pa || pb, far = pa ? db : da;
          if (p) h += '<path d="M' + p.x + ',' + p.y + ' V' + (p.y + 8) + ' H' + (rackX(p.rack) + RW - 8) + ' V' + (TOP - 30) + '" class="cab-cable" stroke="' + COL[st] + '"><title>Vai até ' + esc(far.name) + ' (' + esc(far.rack.id) + ')</title></path>';
          return;
        }
        if (l.loose) {
          const fixed = l.loose === 'a' ? pb : pa, hang = l.loose === 'a' ? pa : pb;
          const tip = { x: hang.x + 18, y: hang.y + 54 };
          h += '<path d="M' + fixed.x + ',' + fixed.y + ' C' + (fixed.x + 10) + ',' + (fixed.y + 80) + ' ' + (tip.x - 30) + ',' + (tip.y + 30) + ' ' + tip.x + ',' + tip.y + '" class="cab-cable" stroke="' + COL.loose + '"/>';
          h += '<g class="cab-plug" data-link="' + l.id + '" data-end="' + l.loose + '"><circle cx="' + tip.x + '" cy="' + tip.y + '" r="7" fill="' + COL.loose + '"/><circle cx="' + tip.x + '" cy="' + tip.y + '" r="12" class="cab-ring"/>' +
            '<text x="' + (tip.x + 14) + '" y="' + (tip.y + 4) + '" class="cab-tag">cabo solto · arraste até a porta</text></g>';
          return;
        }
        h += '<path d="' + route(pa, pb, tidy, k) + '" class="cab-cable is-' + st + '" stroke="' + COL[st] + '"' + (st === 'part' ? ' stroke-dasharray="6 4"' : '') + '><title>' + esc(da.name + ' ' + l.a.port + ' ↔ ' + db.name + ' ' + l.b.port) + '</title></path>';
        if (st === 'bad') {
          const mx = (pa.x + pb.x) / 2, my = Math.max(pa.y, pb.y) + (tidy ? 12 : 40);
          h += '<g class="cab-x"><circle cx="' + mx + '" cy="' + my + '" r="8" fill="#f2495c"/><path d="M' + (mx - 3) + ',' + (my - 3) + ' L' + (mx + 3) + ',' + (my + 3) + ' M' + (mx + 3) + ',' + (my - 3) + ' L' + (mx - 3) + ',' + (my + 3) + '" stroke="#0a0a0a" stroke-width="2"/></g>';
        }
      });
      if (C.drag && C.drag.from) {
        const p = portPos(C.drag.from.dev, C.drag.from.port);
        if (p) h += '<path d="' + route(p, { x: C.drag.x, y: C.drag.y, rack: p.rack }, false, 1) + '" class="cab-cable is-drag" stroke="' + COL.drag + '"/>';
      }
      el.svg.innerHTML = h;
      renderSide();
    }

    function port(d, p, label, need, used, err) {
      const pos = portPos(d.key, p);
      const l = ops().linkNear(d.key, p);
      const plugged = ops().linkAt(d.key, p);
      const peer = plugged ? (plugged.a.dev === d.key && plugged.a.port === p ? plugged.b : plugged.a) : null;
      const pd = peer && ops().get(peer.dev);
      const target = C.drag && !plugged && !(C.drag.from && C.drag.from.dev === d.key && C.drag.from.port === p);
      const tip = d.name + ' · ' + p + (err ? ' · err-disabled' : '') + (pd ? ' · ligado a ' + pd.name + ' ' + peer.port : l && l.loose ? ' · cabo solto' : ' · livre');
      let s = '<g class="cab-port' + (plugged ? ' is-used' : '') + (need ? ' is-need' : '') + (target ? ' is-target' : '') + (err ? ' is-err' : '') + '" data-dev="' + d.key + '" data-port="' + p + '">';
      if (pos.dense) {
        s += '<rect x="' + (pos.x - 3.5) + '" y="' + (pos.y - 5) + '" width="7" height="10" rx="1.5"/>';
        if (plugged) s += '<rect x="' + (pos.x - 2) + '" y="' + (pos.y - 3) + '" width="4" height="6" rx="1" class="cab-port__plug"/>';
      } else {
        s += '<rect x="' + (pos.x - 6) + '" y="' + (pos.y - 5) + '" width="12" height="10" rx="2"/>';
        if (plugged) s += '<rect x="' + (pos.x - 3) + '" y="' + (pos.y - 3) + '" width="6" height="6" rx="1" class="cab-port__plug"/>';
      }
      if (d.kind === 'switch' && p !== 'te1') s += '<circle cx="' + pos.x + '" cy="' + (pos.y - 8) + '" r="1.6" class="cab-port__led' + (err ? ' is-err' : plugged ? ' is-on' : '') + '"/>';
      if (need) s += '<circle cx="' + pos.x + '" cy="' + pos.y + '" r="11" class="cab-ring"/>';
      s += '<text x="' + pos.x + '" y="' + (pos.y + (d.kind === 'server' ? 18 : d.kind === 'patch' && p[0] === 'r' ? 15 : -10)) + '" class="cab-port__label">' + (d.kind === 'switch' && p !== 'te1' && (parseInt(label, 10) - 1) % 12 !== 0 && parseInt(label, 10) % (pos.dense ? 8 : 4) !== 0 ? '' : esc(label)) + '</text>';
      return s + '<title>' + esc(tip) + '</title></g>';
    }

    function renderSide() {
      const O = ops();
      const servers = O.devices().filter((d) => d.kind === 'server' && C.racks.indexOf(d.rack) >= 0).sort((a, b) => a.n - b.n);
      const hasSwitch = O.devices().some((d) => d.kind === 'switch' && C.racks.indexOf(d.rack) >= 0);
      let h = '';
      if (!hasSwitch) h += '<li class="cab-st is-bad"><b>Sem switch nesta sala</b><span>Instale um Switch num rack (B → Equipamentos → Switch). Sem switch, os servidores não têm onde ligar.</span></li>';
      for (const d of servers) {
        const t = O.trace(d);
        const via = t.ok ? t.links.length > 1 ? ' via patch panel' : ' direto' : '';
        h += '<li class="cab-st ' + (t.ok ? 'is-ok' : t.loose ? 'is-loose' : t.bad ? 'is-bad' : 'is-part') + (C.focus === d ? ' is-focus' : '') + '"><b>' + esc(d.name) + '</b><span>' +
          (t.ok ? 'eth0 → ' + esc(t.sw.name) + ' ' + esc(t.port) + via : esc(t.reason)) + '</span></li>';
      }
      if (!servers.length) h += '<li class="cab-st"><span>Nenhum servidor nestes racks ainda.</span></li>';
      el.list.innerHTML = h;
      el.msg.innerHTML = C.msg ? '<span class="' + (C.msg.ok ? 'ok' : 'w') + '">' + esc(C.msg.text) + '</span>' : '';
      const messy = C.racks.some((r) => r.tidy === false && r.cableLook);
      el.tidy.classList.toggle('is-guide', messy && !servers.some((d) => !O.trace(d).ok));
      el.tidy.disabled = !messy;
      el.back.hidden = !C.back;
      if (C.back) el.back.textContent = 'Voltar ao terminal do ' + C.back.name;
      el.hint.innerHTML = C.drag ? 'Agora clique (ou solte) na porta de destino · <kbd>Esc</kbd> cancela' : 'Clique numa porta e depois em outra para ligar um cabo. Arraste uma ponta para mudar de porta; solte no vazio para desconectar.';
    }

    /* ---------- interaction ---------- */
    function toSvg(ev) {
      const pt = el.svg.createSVGPoint();
      pt.x = ev.clientX;
      pt.y = ev.clientY;
      const m = el.svg.getScreenCTM();
      return m ? pt.matrixTransform(m.inverse()) : { x: 0, y: 0 };
    }
    const portEl = (ev) => { const n = document.elementFromPoint(ev.clientX, ev.clientY); return n && n.closest && n.closest('[data-port]'); };

    function say(ok, text) { C.msg = { ok, text }; }

    function result(r, what) {
      if (r.reason) { say(false, '✗ ' + r.reason); game.sfx('nope'); return; }
      const l = r.link, O = ops();
      const st = O.classify().get(l);
      const a = O.get(l.a.dev), b = O.get(l.b.dev);
      const label = a.name + ' ' + l.a.port + ' ↔ ' + b.name + ' ' + l.b.port;
      if (st === 'ok') say(true, '✓ ' + label + ' · caminho completo até o switch');
      else if (st === 'bad') {
        const srv = [a, b].find((d) => d.kind === 'server');
        say(false, '✗ Conexão incorreta: ' + (srv ? O.trace(srv).reason : 'patch panel ligado nele mesmo'));
      } else say(true, '◐ ' + label + ' · ligado, mas o caminho ainda não chega a um switch');
      game.sfx('place');
    }

    el.svg.addEventListener('pointerdown', (ev) => {
      const p = toSvg(ev);
      const plug = ev.target.closest && ev.target.closest('[data-link]');
      if (C.drag && C.drag.carry) return; // second click is handled on pointerup
      if (plug) {
        const l = ops().links.find((x) => String(x.id) === plug.dataset.link);
        C.drag = { link: l, end: plug.dataset.end, x: p.x, y: p.y, sx: ev.clientX, sy: ev.clientY };
      } else {
        const pe = portEl(ev);
        if (!pe) return;
        const key = pe.dataset.dev, port = pe.dataset.port;
        const l = ops().linkAt(key, port);
        if (l) C.drag = { link: l, end: l.a.dev === key && l.a.port === port ? 'a' : 'b', x: p.x, y: p.y, sx: ev.clientX, sy: ev.clientY };
        else C.drag = { from: { dev: key, port }, x: p.x, y: p.y, sx: ev.clientX, sy: ev.clientY };
      }
      el.svg.setPointerCapture(ev.pointerId);
      render();
    });
    el.svg.addEventListener('pointermove', (ev) => {
      if (!C.drag) return;
      const p = toSvg(ev);
      C.drag.x = p.x;
      C.drag.y = p.y;
      const tmp = el.svg.querySelector('.is-drag');
      if (tmp) {
        const fixed = C.drag.from ? portPos(C.drag.from.dev, C.drag.from.port) : (() => { const l = C.drag.link, o = C.drag.end === 'a' ? l.b : l.a; return portPos(o.dev, o.port); })();
        if (fixed) tmp.setAttribute('d', route(fixed, { x: p.x, y: p.y, rack: fixed.rack }, false, 1));
      }
    });
    el.svg.addEventListener('pointerup', (ev) => {
      const D = C.drag;
      if (!D) return;
      const moved = Math.hypot(ev.clientX - D.sx, ev.clientY - D.sy) > 6;
      const pe = portEl(ev);
      const to = pe ? { dev: pe.dataset.dev, port: pe.dataset.port } : null;
      const origin = D.from || (D.link && D.link[D.end]);
      // a loose end dropped back into the port it fell out of counts as a real reconnection
      const same = to && origin && to.dev === origin.dev && to.port === origin.port && !(D.link && D.link.loose === D.end);
      if (!moved && !D.carry && (!to || same)) { D.carry = true; render(); return; } // click → cable follows the cursor
      C.drag = null;
      if (to && !same) {
        if (D.from) result(ops().addLink(D.from, to));
        else result(ops().moveEnd(D.link, D.end, to));
      } else if (!to && D.link) {
        const O = ops(), a = O.get(D.link.a.dev), b = O.get(D.link.b.dev);
        O.removeLink(D.link);
        say(false, 'Cabo removido: ' + a.name + ' ' + D.link.a.port + ' ↔ ' + b.name + ' ' + D.link.b.port);
      }
      render();
    });

    el.tidy.addEventListener('click', () => {
      ops().tidy(C.racks.filter((r) => r.cableLook));
      say(true, '✓ Cabos organizados: passam pelos organizadores laterais e pela bandeja. Fluxo de ar melhor, rastreio mais fácil.');
      render();
    });
    el.close.addEventListener('click', () => close());
    el.back.addEventListener('click', () => { const d = C.back; close(); if (d) ops().openTerminal(d); });
    el.root.addEventListener('pointerdown', (ev) => { if (ev.target === el.root) close(); });
    game.on('cables', () => { if (C.open && !C.drag) render(); });

    function open(rack, focus, opts) {
      opts = opts || {};
      const O = ops();
      const room = O.roomOf(rack);
      const peers = game.scene.world.items.filter((e) => e.kind === 'rack' && e.units && e !== rack && O.roomOf(e) === room &&
        O.devices().some((d) => d.rack === e && (d.kind === 'switch' || d.kind === 'patch')));
      // racks that hold the other end of this rack's cables come along too
      const linked = new Set();
      for (const l of O.links) {
        const a = O.get(l.a.dev), b = O.get(l.b.dev);
        if (a.rack === rack && b.rack !== rack) linked.add(b.rack);
        if (b.rack === rack && a.rack !== rack) linked.add(a.rack);
      }
      // racks wired to this one first, then other switch/patch racks in the room
      const near = (x) => Math.abs(x.tx - rack.tx) + Math.abs(x.ty - rack.ty) * 2;
      const extra = Array.from(linked).sort((a, b) => near(a) - near(b))
        .concat(peers.filter((x) => !linked.has(x)).sort((a, b) => near(a) - near(b))).slice(0, 3);
      C.racks = [rack].concat(extra).sort((a, b) => a.ty - b.ty || a.tx - b.tx);
      C.focus = focus || null;
      C.back = opts.back || null;
      C.msg = null;
      C.drag = null;
      el.title.textContent = 'Cabeamento · ' + (room ? room.name : rack.id);
      el.root.classList.add('is-open');
      C.open = true;
      render();
      // bring the rack that was opened into view
      requestAnimationFrame(() => {
        const col = el.svg.querySelectorAll('.cab-rack')[C.racks.indexOf(rack)];
        const stage = el.svg.parentNode;
        if (col) stage.scrollLeft += col.getBoundingClientRect().left - stage.getBoundingClientRect().left - 24;
      });
      game.onCablingOpen && game.onCablingOpen();
    }

    function close() {
      if (!C.open) return;
      C.open = false;
      C.drag = null;
      el.root.classList.remove('is-open');
    }

    function key(ev) {
      if (!C.open) return false;
      if (ev.code === 'Escape') {
        if (C.drag) { C.drag = null; render(); }
        else close();
        return true;
      }
      return true;
    }

    return {
      open, close, key,
      get isOpen() { return C.open; },
      get racks() { return C.racks; },
      render,
    };
  };
})();
