/* DataLab — shifts: every member has working hours (a preset shift or custom hours chosen by the player).
   Outside them the bot finishes what is important, says goodbye, walks out through the reception and
   comes back when the shift starts again (crew.js sendHome / bringBack).
   On call (plantão): for each of the three turnos (Manhã, Tarde, Noite) the player may name ONE on-call
   technician and ONE on-call attendant. When nobody of that kind is working during the turno, the
   on-call person is called in to cover — and goes home when someone of the shift arrives or the turno
   ends. Each call-in costs a small fee (economy.js). The game clock drives it all (1 s = 1 game minute). */
(function () {
  'use strict';
  const DL = window.DL;
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const hh = (h) => String(((h % 24) + 24) % 24).padStart(2, '0') + ':00';

  DL.SHIFTS = {
    integral: { label: 'Integral (24 h)', start: 0, end: 24 },
    comercial: { label: 'Comercial 08–18', start: 8, end: 18 },
    manha: { label: 'Manhã 06–14', start: 6, end: 14 },
    tarde: { label: 'Tarde 14–22', start: 14, end: 22 },
    noite: { label: 'Noite 22–06', start: 22, end: 30 },
  };
  // the turnos used for on-call duty
  DL.TURNOS = [
    { id: 'manha', label: 'Manhã', start: 6, end: 14 },
    { id: 'tarde', label: 'Tarde', start: 14, end: 22 },
    { id: 'noite', label: 'Noite', start: 22, end: 30 },
  ];
  const CAT = { tec: 'Técnico', aten: 'Atendente' };
  DL.shiftLabel = (s) => (s.id !== 'custom' && DL.SHIFTS[s.id] ? DL.SHIFTS[s.id].label : hh(s.start).slice(0, 2) + '–' + hh(s.end).slice(0, 2));
  // is the hour (0–24, fractional) inside [start, end)? end may pass midnight (end > 24)
  const inRange = (h, start, end) => (end - start >= 24 ? true : end > 24 ? h >= start || h < end - 24 : h >= start && h < end);
  DL.inShift = (s, h) => inRange(h, s.start, s.end);

  DL.createShifts = function (game, sys) {
    const crew = sys.crew;
    const $ = (id) => document.getElementById(id);
    const el = { ov: $('shifts'), body: $('shiftsBody') };
    const S = { acc: 0, open: false, key: '', msg: '' };
    const members = () => crew.members;
    const alive = (a) => crew.members.indexOf(a) >= 0;

    // the hour on the HUD clock (fractional)
    function hour() {
      const m = (game.clockStart != null ? game.clockStart : 480) + (game.time ? game.time() : 0);
      return (m % 1440) / 60;
    }
    const turnoNow = () => { const h = hour(); return DL.TURNOS.find((t) => inRange(h, t.start, t.end)) || DL.TURNOS[0]; };

    // technician = fixes things; attendant = takes care of clients
    function catOf(a) {
      const ts = crew.api.tasksOf(a);
      if (ts.some((t) => t.kind === 'fix' || t.kind === 'repair')) return 'tec';
      if (ts.some((t) => t.id === 'tickets' || t.id === 'frontdesk')) return 'aten';
      return null;
    }
    const scheduled = (a, h) => DL.inShift(a.crew.shift, h);
    const onCallFor = (turno, cat, except) => members().find((m) => m !== except && m.crew.oncall.indexOf(turno) >= 0 && catOf(m) === cat) || null;

    /* ---------- configuration ---------- */
    function setShift(a, id, start, end) {
      const c = a.crew;
      if (id === 'custom') {
        start = Math.max(0, Math.min(23, start | 0));
        end = end | 0;
        if (end <= start) end += 24; // 22 → 06 passes midnight
        if (end - start < 2) return 'O turno precisa ter pelo menos 2 horas';
        c.shift = { id: 'custom', start, end };
      } else if (DL.SHIFTS[id]) {
        const s = DL.SHIFTS[id];
        c.shift = { id, start: s.start, end: s.end };
      } else return 'Turno inválido';
      game.toast('ok', 'Escala', c.name + ' · ' + DL.shiftLabel(c.shift));
      S.key = '';
      crew.api.renderAll();
      check(true);
      render();
      return null;
    }

    function setOncall(a, turno, on) {
      const c = a.crew, cat = catOf(a);
      if (!on) { c.oncall = c.oncall.filter((t) => t !== turno); S.msg = ''; render(); crew.api.renderAll(); return null; }
      if (!cat) return c.name + ' não é técnico(a) nem atendente: só esses cargos fazem plantão';
      const other = onCallFor(turno, cat, a);
      const T = DL.TURNOS.find((t) => t.id === turno);
      if (other) return 'Já existe ' + (cat === 'tec' ? 'um técnico' : 'um atendente') + ' plantonista na ' + T.label + ': ' + other.crew.name + '. Limite: 1 técnico + 1 atendente por turno';
      if (c.oncall.indexOf(turno) < 0) c.oncall.push(turno);
      S.msg = '';
      game.toast('ok', 'Plantão', c.name + ' · plantonista ' + (cat === 'tec' ? 'técnico' : 'de atendimento') + ' na ' + T.label);
      render();
      crew.api.renderAll();
      return null;
    }

    /* ---------- who should be at work right now ---------- */
    // important work is never dropped halfway because the clock turned
    const busyImportant = (a) => { const j = a.crew.job; return !!j && (!j.auto || j.order || j.def.kind === 'fix' || j.def.kind === 'repair' || j.def.kind === 'client' || j.def.id === 'support'); };

    function check(force) {
      const h = hour(), T = turnoNow();
      // 1. on-call cover: a turno with nobody of a kind at work calls its plantonista
      const want = new Map();
      for (const m of members()) want.set(m, scheduled(m, h));
      for (const cat of ['tec', 'aten']) {
        const oc = onCallFor(T.id, cat);
        if (!oc) continue;
        const covered = members().some((m) => m !== oc && catOf(m) === cat && want.get(m));
        if (!covered && !want.get(oc)) {
          want.set(oc, true);
          if (!oc.crew.calledIn) {
            oc.crew.calledIn = T.id;
            if (game.economy && game.economy.charge) game.economy.charge(DL.ECON.onCallFee, 'plantão de ' + oc.crew.name);
            game.toast('info', 'Plantão · ' + T.label, oc.crew.name + ' foi chamado(a): ninguém de ' + CAT[cat].toLowerCase() + ' no turno');
            if (game.ops) game.ops.logEvent('info', '📟 Plantão: ' + oc.crew.name + ' cobrindo a ' + T.label + ' (' + CAT[cat].toLowerCase() + ')');
          }
        }
      }
      // 2. apply
      for (const m of members()) {
        const c = m.crew, on = want.get(m);
        if (c.calledIn && (!on || scheduled(m, h))) c.calledIn = null;
        if (on && c.off) {
          if (c.off.phase === 'away') crew.api.bringBack(m, c.calledIn ? 'oncall' : 'shift');
          else if (c.off.phase === 'out' || c.off.phase === 'fade') { c.off = null; m.hidden = false; m.alpha = 1; c.state = 'idle'; c.wait = 0.4; m.route = null; }
        } else if (!on && !c.off && !busyImportant(m)) {
          crew.api.sendHome(m, 'shift');
        }
      }
    }

    function update(dt) {
      S.acc += dt;
      if (S.acc < 1) return;
      S.acc = 0;
      if (game.paused && game.paused()) return;
      check(false);
      if (S.open) render();
    }

    /* ---------- the Escalas window ---------- */
    function bar(a) {
      const s = a.crew.shift, h = Math.floor(hour());
      let out = '<span class="sh-bar" aria-hidden="true">';
      for (let i = 0; i < 24; i++) {
        const on = DL.inShift(s, i + 0.5), oc = DL.TURNOS.some((t) => a.crew.oncall.indexOf(t.id) >= 0 && inRange(i + 0.5, t.start, t.end));
        out += '<i class="' + (on ? 'is-on' : oc ? 'is-oc' : '') + (i === h ? ' is-now' : '') + '"></i>';
      }
      return out + '</span>';
    }
    function hourSel(k, v) {
      let o = '<select data-sh="' + k + '">';
      for (let i = 0; i < 24; i++) o += '<option value="' + i + '"' + (i === v % 24 ? ' selected' : '') + '>' + hh(i) + '</option>';
      return o + '</select>';
    }

    function html() {
      const h = hour(), T = turnoNow();
      let s = '<div class="sh-head"><div><p class="eyebrow-sm">Equipe · escalas</p><h2 class="card__title card__title--sm" id="shiftsTitle">Escalas e turnos</h2></div><button class="cc__x" type="button" data-sh-act="close" aria-label="Fechar">×</button></div>';
      s += '<p class="sh-lead">Agora: <b>' + hh(Math.floor(h)).slice(0, 2) + ':' + String(Math.floor((h % 1) * 60)).padStart(2, '0') + '</b> · turno da <b>' + T.label + '</b>. Fora do horário a pessoa termina o que é importante e vai embora pela recepção. Plantonista é chamado quando o turno fica sem ninguém daquele tipo · limite de <b>1 técnico + 1 atendente</b> por turno.</p>';
      if (S.msg) s += '<p class="sh-msg" role="alert">' + esc(S.msg) + '</p>';
      if (!members().length) return s + '<p class="sh-empty">Ninguém contratado ainda.</p>';
      s += '<div class="sh-hours" aria-hidden="true"><span></span><span class="sh-scale">' + [0, 6, 12, 18].map((x) => '<em style="left:' + (x / 24 * 100) + '%">' + hh(x).slice(0, 2) + '</em>').join('') + '</span></div>';
      s += '<ul class="sh-list">';
      for (const a of members()) {
        const c = a.crew, R = DL.ROLES[c.profile.role] || {}, cat = catOf(a);
        const st = c.off ? (c.off.phase === 'away' ? 'De folga' : c.off.phase === 'in' ? 'Chegando' : 'Saindo') : c.calledIn ? 'Plantão' : 'Trabalhando';
        s += '<li class="sh-row" data-m="' + c.id + '"><div class="sh-who"><span class="cc__dot" style="background:' + (R.color || '#ccc') + '"></span><b>' + esc(c.name) + '</b><small>' + esc(R.name || '') + (cat ? ' · ' + CAT[cat] : '') + '</small><span class="sh-st is-' + (c.off ? 'off' : c.calledIn ? 'oc' : 'on') + '">' + st + '</span></div>';
        s += bar(a);
        s += '<div class="sh-ctl"><select data-sh="shift" aria-label="Turno de ' + esc(c.name) + '">' + Object.entries(DL.SHIFTS).map(([id, x]) => '<option value="' + id + '"' + (c.shift.id === id ? ' selected' : '') + '>' + x.label + '</option>').join('') +
          '<option value="custom"' + (c.shift.id === 'custom' ? ' selected' : '') + '>Personalizado…</option></select>';
        if (c.shift.id === 'custom') s += '<span class="sh-custom">das ' + hourSel('start', c.shift.start) + ' às ' + hourSel('end', c.shift.end) + '</span>';
        if (cat) {
          s += '<span class="sh-oc"><span class="eyebrow-sm">Plantão</span>' + DL.TURNOS.map((t) => {
            const on = c.oncall.indexOf(t.id) >= 0, taken = !on && onCallFor(t.id, cat, a);
            return '<button type="button" class="chip' + (on ? ' is-on' : '') + '" data-sh-oc="' + t.id + '" aria-pressed="' + on + '"' + (taken ? ' title="' + esc(taken.crew.name) + ' já é o plantonista ' + (cat === 'tec' ? 'técnico' : 'de atendimento') + ' da ' + t.label + '"' : '') + '>' + t.label + (taken ? ' · ' + esc(taken.crew.name) : '') + '</button>';
          }).join('') + '</span>';
        }
        s += '</div></li>';
      }
      s += '</ul>';
      // coverage per turno
      s += '<div class="sh-cover">' + DL.TURNOS.map((t) => {
        const mid = t.start + 0.5;
        const n = (cat) => members().filter((m) => catOf(m) === cat && DL.inShift(m.crew.shift, mid % 24)).length;
        const all = members().filter((m) => DL.inShift(m.crew.shift, mid % 24)).length;
        const oc = (cat) => { const m = onCallFor(t.id, cat); return m ? m.crew.name : '—'; };
        return '<div class="sh-turno' + (t.id === T.id ? ' is-now' : '') + '"><span class="eyebrow-sm">' + t.label + ' ' + hh(t.start).slice(0, 2) + '–' + hh(t.end).slice(0, 2) + '</span><b>' + all + ' pessoa(s)</b>' +
          '<small>' + n('tec') + ' técnico(s) · ' + n('aten') + ' atendente(s)</small><small>Plantão: ' + esc(oc('tec')) + ' (téc.) · ' + esc(oc('aten')) + ' (atend.)</small>' +
          (!n('tec') && oc('tec') === '—' ? '<small class="is-warn">Sem técnico nem plantonista</small>' : '') + '</div>';
      }).join('') + '</div>';
      return s;
    }

    function render() {
      if (!S.open) return;
      // don't rebuild under an open dropdown
      if (el.body.contains(document.activeElement) && document.activeElement.tagName === 'SELECT') return;
      const h = html();
      if (h === S.key) return;
      S.key = h;
      const sc = el.body.scrollTop;
      el.body.innerHTML = h;
      el.body.scrollTop = sc;
    }

    function open() {
      S.open = true;
      S.key = '';
      S.msg = '';
      el.ov.classList.add('is-open');
      render();
      game.keysReset && game.keysReset();
    }
    function close() {
      S.open = false;
      el.ov.classList.remove('is-open');
      if (el.ov.contains(document.activeElement)) document.activeElement.blur();
    }

    const memberOf = (node) => { const li = node.closest('[data-m]'); return li ? members().find((m) => m.crew.id === +li.dataset.m) : null; };
    if (el.ov) {
      el.ov.addEventListener('pointerdown', (ev) => { if (ev.target === el.ov) close(); });
      el.body.addEventListener('click', (ev) => {
        if (ev.target.closest('[data-sh-act="close"]')) { close(); return; }
        const b = ev.target.closest('[data-sh-oc]');
        if (!b) return;
        const a = memberOf(b);
        if (!a) return;
        const on = a.crew.oncall.indexOf(b.dataset.shOc) < 0;
        const why = setOncall(a, b.dataset.shOc, on);
        if (why) { S.msg = why; S.key = ''; render(); }
      });
      el.body.addEventListener('change', (ev) => {
        const s = ev.target.closest('[data-sh]');
        const a = s && memberOf(s);
        if (!a) return;
        const c = a.crew;
        let why = null;
        if (s.dataset.sh === 'shift') why = s.value === 'custom' ? setShift(a, 'custom', c.shift.start % 24, c.shift.end % 24 || 24) : setShift(a, s.value);
        else if (s.dataset.sh === 'start') why = setShift(a, 'custom', +s.value, c.shift.end % 24);
        else if (s.dataset.sh === 'end') why = setShift(a, 'custom', c.shift.start, +s.value);
        s.blur();
        S.msg = why || '';
        S.key = '';
        render();
      });
      el.body.addEventListener('keydown', (ev) => { if (ev.target.tagName === 'SELECT') ev.stopPropagation(); });
    }

    function key(ev) {
      if (ev.code === 'Escape') { close(); return true; }
      return true;
    }

    const api = { update, setShift, setOncall, open, close, key, catOf, hour, check, get isOpen() { return S.open; } };
    game.shifts = api;
    return api;
  };
})();
