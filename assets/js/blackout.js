/* DataLab — blackout (Apagão): a power cut, brought by a storm's lightning (weather.js). The map goes dark:
   only the racks' LEDs and a pulsing red emergency light stay visible (scene.overlay), the data flow on the
   floor stops (dataflow.setPower(false)) and the HUD shows the UPS battery draining (DL.BLACKOUT.battery).
   The fix is the breaker box on the building's front wall, out on the sidewalk (disjuntor.js): a little
   game in three steps (open it, swap the burnt board, wire it back).
     · Fixed while the UPS holds: the lights come back rack by rack, the company gets a small bonus, the
       player some XP. Nothing breaks.
     · The UPS runs out first: the building's lights come back on their own (lamps, common areas), but the
       RACKS stay without power until the breaker is fixed — the servers earn nothing (economy.js reads
       DL.racksSemEnergia) and the client contracts charge a fine that grows with the time (SLA), up to a
       ceiling. When it is finally fixed, some of the servers that were online come back damaged: no
       cable, no configuration (ops.js shows a task for each one; doing it again gives XP).
   A short summary closes it (disjuntor.js). The whole state goes into the save (snapshot / restore).
   Only the host runs it in a multiplayer room (demo.js skips it for G.guest).
   With prefers-reduced-motion nothing pulses or blinks: the map just darkens and the bar shows. */
(function () {
  'use strict';
  const DL = window.DL;
  const T = DL.T || 16;

  DL.BLACKOUT = {
    /* ====== O APAGÃO (fácil de ajustar) ====== */
    battery: 60,        // s que o nobreak segura (mude para 90 para testar um apagão mais folgado)
    // a multa por contrato (SLA) enquanto os racks ficam sem energia, depois que o nobreak acaba:
    multaInicio: 10,    // $ por segundo logo que os racks apagam
    multaPorMinuto: 10, // + $ por segundo a cada minuto sem conserto (a multa vai crescendo)
    multaTeto: 80,      // $ por segundo, no máximo
    multaMax: 20000,    // $ no total, no máximo, num apagão
    slaUptime: '99,9%', // a disponibilidade que os contratos garantem (só o texto do motivo da multa)
    // servidores que voltam danificados quando o nobreak acabou antes do conserto (fração dos que estavam no ar)
    danoMin: 0.3,
    danoMax: 0.6,
    danoTempestade: 0.15, // a mais, quando o apagão veio de uma tempestade
    bonus: 150,         // $ para a empresa por consertar dentro do tempo do nobreak
    xp: 25,             // XP do jogador por consertar o disjuntor (metade se o nobreak já tinha acabado)
    xpServidor: 15,     // XP por servidor danificado refeito (cabo + configuração)
    relight: 0.3,       // s entre um rack religando e o próximo
    /* ====== (o resto) ====== */
    minPlay: 600,       // s of play before the old warned blackout (trigger(), tests) may happen
    warn: [3, 5],       // s of warning (toast + alarm) before the lights go (trigger() only)
    dark: 0.82,         // how dark the map gets (0..1)
  };
  const RED = '#f2495c', GREEN = '#7ee0a1', AMBER = '#e8c15a';
  const rgba = (hex, a) => 'rgba(' + parseInt(hex.slice(1, 3), 16) + ',' + parseInt(hex.slice(3, 5), 16) + ',' + parseInt(hex.slice(5, 7), 16) + ',' + Math.max(0, Math.min(1, a)).toFixed(3) + ')';
  const money = (v) => '$' + Math.round(v).toLocaleString('pt-BR');

  // sys: { ops, director, dataflow, playing(), reduced }
  DL.createBlackout = function (game, sys) {
    const B = DL.BLACKOUT;
    const reduced = !!sys.reduced;
    // phase: idle | warn | dark (the UPS holds) | semRack (the UPS ran out: lights back, racks off) | relight
    // t counts the phase's seconds; dim 0..1 is the overlay's darkness
    // run: this blackout's numbers (for the fine, the damage and the summary); mg: the breaker game's
    // progress (disjuntor.js keeps it here, so it is saved with the rest)
    const S = { phase: 'idle', t: 0, battery: B.battery, dim: 0, clock: 0, beep: 0, lastAt: 0, lastDay: 0, run: null, mg: null, queue: null, pops: [] };
    const days = () => (DL.DayNight ? DL.DayNight.dias : 0);
    const D = () => window.DataLabDemo || {};
    const racks = () => ((game.scene && game.scene.world && game.scene.world.items) || []).filter((e) => e.kind === 'rack' && e.units);
    let hud = null, hudBar = null, hudNum = null, hudTitle = null, hudGoal = null, hudWhy = null;

    // the fine per second right now: grows with the downtime, up to the ceiling
    function fineRate() { return Math.min(B.multaTeto, B.multaInicio + B.multaPorMinuto * ((S.run ? S.run.offT : 0) / 60)); }

    /* ---------- HUD: the UPS battery bar and the goal ---------- */
    function ensureHud() {
      if (hud) return;
      hud = document.createElement('div');
      hud.className = 'blackout-hud';
      hud.hidden = true;
      hud.setAttribute('role', 'status');
      hud.innerHTML = '<div class="blackout-hud__row"><b>Bateria do nobreak</b><div class="blackout-hud__bar"><i></i></div><span class="mono"></span></div>' +
        '<p class="blackout-hud__goal"><i aria-hidden="true">⚡</i> Conserte o disjuntor! <small></small></p>' +
        '<p class="blackout-hud__why" hidden></p>';
      hudBar = hud.querySelector('.blackout-hud__bar i'); hudNum = hud.querySelector('span'); hudTitle = hud.querySelector('b'); hudGoal = hud.querySelector('small'); hudWhy = hud.querySelector('.blackout-hud__why');
      (document.getElementById('game') || document.body).appendChild(hud);
    }
    let hudKey = '';
    function showHud(on) {
      ensureHud();
      hud.hidden = !on;
      if (!on) { hudKey = ''; return; }
      const off = S.phase === 'semRack';
      const k = off ? 0 : Math.max(0, S.battery / B.battery);
      const St = DL.Street;
      const where = St && St.outside ? (St.place ? 'saia da loja: o quadro fica na calçada' : 'o quadro fica na parede do prédio, ao lado da porta') : 'saia pela porta: o quadro fica na calçada';
      const taxa = off ? fineRate() : 0;
      const key = off + ':' + Math.round(taxa) + ':' + Math.round(k * 200) + ':' + Math.ceil(Math.max(0, S.battery)) + ':' + (off && S.run ? Math.round(S.run.multa) : 0) + ':' + where;
      if (key === hudKey) return;
      hudKey = key;
      hud.classList.toggle('is-off', off);
      hud.classList.toggle('is-low', !off && k < 0.3);
      hudTitle.textContent = off ? 'Quebra de SLA · multa' : 'Bateria do nobreak';
      hudBar.style.width = (k * 100).toFixed(1) + '%';
      hudNum.textContent = off ? '−' + money(S.run ? S.run.multa : 0) : Math.ceil(Math.max(0, S.battery)) + ' s';
      hudGoal.textContent = where;
      hudWhy.hidden = !off;
      // o motivo da multa, em termos de contrato
      // (no celular só a versão curta, para não cobrir a tela)
      if (off) hudWhy.innerHTML = '<span class="is-longo"><b>Indisponibilidade não programada:</b> os racks estão parados e os contratos garantem ' + B.slaUptime +
        ' de uptime. Cláusula de penalidade ativa: ' + money(taxa) + '/s' + (taxa < B.multaTeto ? ', sobe a cada minuto' : ' (teto)') + '.</span>' +
        '<span class="is-curto"><b>SLA ' + B.slaUptime + ' violado</b> · penalidade ' + money(taxa) + '/s</span>';
    }

    /* ---------- the phases ---------- */
    function newRun(why) {
      const storm = !!(DL.Clima && DL.Clima.estado && DL.Clima.estado.tempestade);
      S.run = { start: game.time ? game.time() : 0, dur: 0, offT: 0, multa: 0, perdido: 0, rate: 0, storm: why === 'raio' || storm, damaged: [], fixedIn: false, xp: 0, bonus: 0 };
      S.mg = null; // the breaker starts broken again: the game from the beginning
    }
    function begin() {
      S.phase = 'warn'; S.t = B.warn[0] + Math.random() * (B.warn[1] - B.warn[0]);
      S.lastAt = game.time ? game.time() : 0;
      S.lastDay = days();
      game.toast('warn', 'Rede elétrica', 'Oscilação na energia da rua · apagão iminente');
      game.sfx('siren');
      game.emit('blackout-warn', {});
    }
    function goDark(why) {
      if (!S.run) newRun();
      S.phase = 'dark'; S.t = 0; S.battery = B.battery;
      if (sys.dataflow) sys.dataflow.setPower(false);
      if (sys.director) sys.director.started('blackout', 'Apagão');
      game.toast('warn', 'Apagão', why || 'O nobreak está segurando a carga · conserte o disjuntor lá fora');
      game.sfx('powerdown');
      S.beep = 1.2; // the UPS beeps every 2 s while the room is dark (first one after the power-down)
      showHud(true);
      game.emit('blackout', { on: true });
    }
    // the racks without power (or with it again): their LEDs go dark (sprites.js: state 'off') and the
    // income stops (economy.js reads DL.racksSemEnergia)
    function racksPower(on) {
      DL.racksSemEnergia = !on;
      const co = game.economy && game.economy.company;
      if (co) co.rateAt = -1;
      if (!on) for (const e of racks()) { if (e.state === 'ok' || e.state === 'warn') e.state = 'off'; }
    }
    // the UPS ran out: the building's lights come back on their own (lamps, common areas) — the racks don't
    function upsOut() {
      const co = game.economy && game.economy.company;
      if (S.run) S.run.rate = co ? (co.servers || 0) + (co.storage || 0) : 0; // what the racks were earning per s
      S.phase = 'semRack'; S.t = 0; S.battery = 0;
      racksPower(false);
      if (sys.dataflow) sys.dataflow.setPower(false);
      game.toast('warn', 'O nobreak acabou', 'A luz do prédio voltou, mas os racks estão sem energia. Isso é indisponibilidade não programada: viola o SLA (acordo de nível de serviço) dos contratos e ativa a cláusula de penalidade · conserte o disjuntor');
      game.sfx('powerdown');
      game.emit('blackout', { on: false, how: 'nobreak', racks: false });
      showHud(true);
    }
    // the breaker is fixed (disjuntor.js): the lights come back with a show, rack by rack
    function fix() {
      if (S.phase !== 'dark' && S.phase !== 'semRack') return false;
      const inTime = S.phase === 'dark';
      if (!S.run) newRun();
      const run = S.run;
      run.fixedIn = inTime;
      run.dur = Math.max(0, (game.time ? game.time() : 0) - run.start);
      if (!inTime) damage(run);
      // the racks light up one after another (the ones nearest the door first)
      const list = racks().slice().sort((a, b) => a.tx + a.ty - (b.tx + b.ty));
      S.queue = { list, i: 0, next: 0.35 };
      S.phase = 'relight'; S.t = 0;
      showHud(false);
      if (sys.dataflow) sys.dataflow.setPower(true);
      game.sfx('religar');
      game.toast('ok', 'Disjuntor consertado', inTime ? 'Energia de volta antes de o nobreak acabar · nenhum servidor danificado' : 'Energia dos racks de volta · os servidores estão religando');
      if (inTime) game.emit('blackout', { on: false, how: 'breaker' });
      game.emit('breaker-fixed', { inTime, damaged: run.damaged.length });
      // the reward: XP for the player; the company's bonus only when fixed in time
      const car = game.career;
      run.xp = car ? car.solve({ id: 'apagao_disjuntor', xp: inTime ? B.xp : Math.ceil(B.xp / 2) }, 1) : 0;
      if (inTime && game.economy) { game.economy.income(B.bonus, 'disjuntor consertado'); run.bonus = B.bonus; }
      cheer(inTime);
      return true;
    }
    // some of the servers that were online come back damaged: no cable, no configuration
    // (Windows servers are left alone: a fresh OS would wipe their whole simulated install)
    function damage(run) {
      const ops = sys.ops;
      if (!ops) return;
      const busy = (d) => d.broken || d.out || (game.staff && game.staff.handling && game.staff.handling(d));
      const pool = ops.devices().filter((d) => d.kind === 'server' && d.state === 'online' && !(DL.isWin && DL.isWin(d)) && !busy(d));
      if (!pool.length) return;
      const frac = Math.min(0.95, B.danoMin + Math.random() * (B.danoMax - B.danoMin) + (run.storm ? B.danoTempestade : 0));
      const n = Math.max(1, Math.round(pool.length * frac));
      for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
      for (const d of pool.slice(0, n)) {
        // what it had (the test shortcut that undoes the damage puts it back)
        const mine = ops.links.filter((l) => l.a.dev === d.key || l.b.dev === d.key);
        d.danoBackup = mine.map((l) => ({ a: Object.assign({}, l.a), b: Object.assign({}, l.b) }));
        for (const l of mine) ops.links.splice(ops.links.indexOf(l), 1);
        d.fault = null;
        d.state = 'new';
        DL.newOS(d, false);
        d.danificado = true;
        run.damaged.push(d.name);
        ops.logEvent('warn', d.name + ' voltou danificado do apagão · refaça o cabo e a configuração');
      }
      ops.recompute();
      ops.render(true);
    }
    // the crew celebrates in bubbles over their heads
    function cheer(inTime) {
      const crew = D().crew;
      if (!crew || !crew.members) return;
      const lines = inTime ? ['A luz voltou!', 'Boa, chefe!', 'Salvou o dia! 🙌', 'Uhuul! ⚡', 'Nem precisou do gerador!', 'Que reflexo!']
        : ['Os racks voltaram!', 'Boa, chefe!', 'Finalmente! ⚡', 'Bora conferir os servidores…', 'Ufa! Agora é refazer os cabos.'];
      const people = crew.members.filter((a) => a && a.crew && !a.crew.off && !a.hidden && Number.isFinite(a.x));
      const start = Math.floor(Math.random() * lines.length);
      people.slice(0, 6).forEach((a, i) => {
        setTimeout(() => { a.bubble = { text: lines[(start + i) % lines.length], left: 2.6, tone: 'ok' }; }, 250 + i * 320);
      });
      if (people[0] && game.chat) game.chat.later(1.2, () => game.chat.post(people[0], inTime ? 'A luz voltou! Boa, chefe! 🎉' : 'Racks de volta! Vou ver quem voltou danificado.', { tone: 'ok' }));
    }
    // the last rack lit: the summary (disjuntor.js shows it) and back to normal
    function finish() {
      S.phase = 'idle'; S.dim = 0; S.queue = null;
      racksPower(true);
      for (const e of racks()) if (e.state === 'off') e.state = 'ok';
      const run = S.run;
      S.run = null; S.mg = null;
      if (run) game.emit('blackout-summary', run);
    }

    // why the old warned blackout can't start now (null = it can): idle, playing, not in the tutorial,
    // warmed up, nothing else open (the director's rules)
    function why() {
      if (S.phase !== 'idle') return 'já em andamento (' + S.phase + ')';
      if (!sys.playing || !sys.playing()) return 'fora de jogo (ou convidado numa sala)';
      if (game.paused && game.paused()) return 'jogo pausado / tutorial';
      const now = game.time ? game.time() : 0;
      if (now < B.minPlay) return 'aquecimento: faltam ' + Math.ceil((B.minPlay - now) / 60) + ' min';
      if (sys.director && !sys.director.canStart('fault')) return sys.director.busy ? 'outro problema aberto' : 'director: próximo incidente em breve';
      return null;
    }

    let fineAcc = 0, fineShown = 0;
    function update(dt) {
      if (!(dt > 0)) return;
      S.clock += dt;
      if (S.phase === 'idle') {
        if (days() < S.lastDay) S.lastDay = days(); // a new game restarts the day count
        return; // (it only starts from a storm's lightning: lightning() below)
      }
      const want = S.phase === 'dark' ? 1 : 0;
      S.dim += (want - S.dim) * Math.min(1, dt * (reduced ? 30 : S.phase === 'relight' ? 1.6 : 4));
      if (S.phase === 'warn') { S.t -= dt; if (S.t <= 0) goDark(); return; } // (t holds the wait and counts down)
      S.t += dt;
      if (S.phase === 'dark') {
        S.battery -= dt;
        showHud(true);
        S.beep -= dt;
        if (S.beep <= 0) { S.beep = S.battery < 10 ? 1 : 2; game.sfx('upsbeep'); } // faster when the battery is almost gone
        if (S.battery <= 0) upsOut();
        return;
      }
      if (S.phase === 'semRack') {
        // the fine grows with the time, up to a ceiling; the revenue the racks would have made is lost too
        const run = S.run;
        if (run) {
          run.offT += dt;
          run.perdido += run.rate * dt;
          if (run.multa < B.multaMax) {
            const rate = fineRate();
            const f = Math.min(B.multaMax - run.multa, rate * dt);
            run.multa += f;
            fineAcc += f;
          }
          // charged every 3 s (one floating "−$" with the sum, not one every frame)
          fineShown += dt;
          if (fineShown >= 3 && fineAcc >= 1 && game.economy && game.economy.penalty) {
            const whole = Math.floor(fineAcc);
            fineAcc -= whole;
            fineShown = 0;
            game.economy.penalty(whole, 'multa SLA · indisponibilidade');
          }
        }
        showHud(true);
        return;
      }
      if (S.phase === 'relight') {
        const q = S.queue;
        if (q) {
          q.next -= dt;
          while (q.next <= 0 && q.i < q.list.length) {
            const e = q.list[q.i++];
            if (e.state === 'off') e.state = 'ok';
            S.pops.push({ e, t: 0 });
            game.sfx('rackOn');
            q.next += B.relight;
          }
          if (q.i >= q.list.length && q.next <= -0.6 && S.dim < 0.02) finish();
        } else if (S.dim < 0.02) finish();
      }
    }

    /* ---------- the overlay: dark map, rack LEDs, emergency light ---------- */
    let glowCv = null;
    function glowSprite() {
      if (glowCv) return glowCv;
      glowCv = document.createElement('canvas');
      glowCv.width = glowCv.height = 128;
      const x = glowCv.getContext('2d'), grd = x.createRadialGradient(64, 64, 0, 64, 64, 64);
      grd.addColorStop(0, rgba(RED, 0.9));
      grd.addColorStop(0.35, rgba(RED, 0.35));
      grd.addColorStop(1, rgba(RED, 0));
      x.fillStyle = grd;
      x.fillRect(0, 0, 128, 128);
      return glowCv;
    }
    // a rack switching back on: a green flash running up its front
    function drawPops(g, sc, dt) {
      for (let i = S.pops.length - 1; i >= 0; i--) {
        const p = S.pops[i];
        p.t += dt;
        if (p.t > 0.7 || !sc.iso) { S.pops.splice(i, 1); continue; }
        const e = p.e, cx = e.px + (e.tw * T) / 2, fy = e.py + e.th * T;
        sc.actorSpace(g, { x: cx, y: fy, z: 0 });
        const k = 1 - p.t / 0.7, h = Math.min(30, 6 + p.t * 90);
        g.globalCompositeOperation = 'lighter';
        g.fillStyle = rgba(GREEN, 0.45 * k);
        g.fillRect(Math.round(cx) - 7, Math.round(fy) - 4 - h, 14, h);
        g.fillStyle = rgba('#ffffff', 0.7 * k);
        g.fillRect(Math.round(cx) - 7, Math.round(fy) - 5 - h, 14, 1);
        g.globalCompositeOperation = 'source-over';
      }
    }
    let lastDraw = 0;
    function draw(g, sc) {
      const now = S.clock, dt = Math.min(0.1, Math.max(0, now - lastDraw));
      lastDraw = now;
      if (S.pops.length) { g.save(); drawPops(g, sc, reduced ? 1 : dt); g.restore(); }
      if (S.dim <= 0.01) return;
      const cv = g.canvas, t = S.clock;
      g.save();
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.fillStyle = 'rgba(3,5,12,' + (B.dark * S.dim).toFixed(3) + ')';
      g.fillRect(0, 0, cv.width, cv.height);
      // the red emergency lights: two beacons in the top corners flashing in turn, plus a soft red wash.
      // The glow is one small picture made once and stretched (no new gradient every frame). With reduced
      // motion it stays still and dim.
      const glow = glowSprite();
      const R = Math.max(cv.width, cv.height) * 0.75;
      g.globalCompositeOperation = 'lighter';
      if (reduced) {
        g.globalAlpha = 0.18 * S.dim;
        g.drawImage(glow, cv.width / 2 - R, -R * 0.6, R * 2, R * 2);
      } else {
        // a sharp flash (a rotating beacon), each corner half a turn apart
        const flash = (ph) => Math.pow(Math.max(0, Math.sin(t * 4.2 + ph)), 6);
        const wash = 0.08 + 0.06 * (0.5 + 0.5 * Math.sin(t * 2.1));
        g.globalAlpha = wash * S.dim;
        g.drawImage(glow, cv.width / 2 - R, -R * 0.7, R * 2, R * 2);
        g.globalAlpha = 0.55 * flash(0) * S.dim;
        g.drawImage(glow, -R * 0.55, -R * 0.55, R * 1.1, R * 1.1);
        g.globalAlpha = 0.55 * flash(Math.PI) * S.dim;
        g.drawImage(glow, cv.width - R * 0.55, -R * 0.55, R * 1.1, R * 1.1);
      }
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'source-over';
      g.restore();
      // the racks' LEDs: one dot per installed unit, standing on the rack's front edge
      const items = (sc.world && sc.world.items) || [];
      for (const e of items) {
        if (e.kind !== 'rack' || !e.units) continue;
        const cx = e.px + (e.tw * T) / 2, fy = e.py + e.th * T;
        if (sc.iso) sc.actorSpace(g, { x: cx, y: fy, z: 0 });
        for (let k = 0; k < e.units.length; k++) {
          if (!e.units[k]) continue;
          const st = e.unitState && e.unitState[k];
          const on = reduced || (Math.floor(t * 3 + e.seed * 0.37 + k * 1.7) % 9) !== 0;
          if (!on) continue;
          const c = st === 'fault' || e.state === 'down' ? RED : st ? AMBER : GREEN;
          g.fillStyle = rgba(c, 0.9 * S.dim);
          if (sc.iso) g.fillRect(Math.round(cx) - 1, Math.round(fy) - 6 - k * 4, 1, 1);
          else g.fillRect(Math.round(cx) - 1, Math.round(e.py) + 2 + k * 2, 1, 1);
        }
      }
    }

    /* ---------- save (save-service.js) ---------- */
    function snapshot() {
      if (S.phase !== 'dark' && S.phase !== 'semRack' && S.phase !== 'relight') return null;
      const r = S.run || {};
      // (the light show at the end isn't saved: a reload during it just finishes the job)
      return { ph: S.phase === 'relight' ? 'fim' : S.phase, b: Math.round(S.battery * 10) / 10, mg: S.mg ? JSON.parse(JSON.stringify(S.mg)) : null,
        r: { dur: Math.round((game.time ? game.time() : 0) - (r.start || 0)), off: Math.round(r.offT || 0), m: Math.round(r.multa || 0), p: Math.round(r.perdido || 0), rate: Math.round((r.rate || 0) * 100) / 100, s: !!r.storm } };
    }
    function restore(d) {
      // whatever was running stops first (a new game, another save)
      S.phase = 'idle'; S.dim = 0; S.queue = null; S.pops.length = 0; S.run = null; S.mg = null;
      DL.racksSemEnergia = false;
      for (const e of racks()) if (e.state === 'off') e.state = 'ok';
      if (sys.dataflow) sys.dataflow.setPower(true);
      const co = game.economy && game.economy.company;
      if (co) co.rateAt = -1;
      showHud(false);
      game.emit('blackout-reset', {});
      // ('fim': saved while the racks were lighting up again — it was already fixed, nothing to bring back)
      if (!d || typeof d !== 'object' || (d.ph !== 'dark' && d.ph !== 'semRack')) return;
      const r = d.r || {};
      newRun();
      Object.assign(S.run, { start: (game.time ? game.time() : 0) - (+r.dur || 0), offT: +r.off || 0, multa: +r.m || 0, perdido: +r.p || 0, rate: +r.rate || 0, storm: !!r.s });
      S.mg = d.mg && typeof d.mg === 'object' ? d.mg : null;
      if (sys.dataflow) sys.dataflow.setPower(false);
      if (d.ph === 'dark') {
        S.phase = 'dark'; S.t = 0; S.dim = 1; S.beep = 1;
        S.battery = Math.max(1, Math.min(B.battery, +d.b || B.battery));
        game.emit('blackout', { on: true });
      } else {
        S.phase = 'semRack'; S.t = 0; S.battery = 0;
        racksPower(false);
      }
      showHud(true);
    }
    // a new game: no blackout
    game.on('game-begin', () => restore(null));

    return {
      update, draw, fix, snapshot, restore,
      trigger: () => { if (S.phase === 'idle') { newRun(); begin(); } }, // (dev / tests)
      // a lightning strike in a storm (weather.js): the power goes at once, no warning. Same blackout as
      // always (the battery, the breaker, the crew's panic); only the pacing rules that make sense for a
      // storm apply: playing, not paused / in the tutorial, nothing else open. True when it went dark.
      // force (dev / tests) skips those checks.
      lightning(force) {
        if (S.phase !== 'idle') return false;
        if (!force) {
          if (!sys.playing || !sys.playing()) return false;
          if (game.paused && game.paused()) return false;
          if (sys.director && sys.director.busy) return false;
        }
        S.lastAt = game.time ? game.time() : 0;
        S.lastDay = days();
        newRun('raio');
        goDark('Um raio atingiu a rede da rua · o nobreak assumiu · conserte o disjuntor lá fora');
        return true;
      },
      // (tests) the UPS runs out right now
      drain() { if (S.phase === 'dark') { S.battery = 0.01; return true; } return false; },
      // is the breaker waiting for the player? (disjuntor.js: the box, the arrow, the game)
      get needsFix() { return S.phase === 'dark' || S.phase === 'semRack'; },
      why, // what is holding the old warned blackout back (null = nothing)
      get state() { return S; },
    };
  };
})();
