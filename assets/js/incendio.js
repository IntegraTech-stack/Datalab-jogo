/* DataLab — CALOR e INCÊNDIO nos racks.
   1. O calor: cada rack tem uma temperatura (r.tmon, a mesma que o Monitor e o "sensors" do terminal
      mostram). Ela vai atrás de um alvo, recalculado a cada segundo: os equipamentos ligados no rack
      (servidores pela potência do modelo e pela carga da CPU, switches um pouco), os racks colados nele
      (o calor se soma), o ar de precisão perto (na mesma sala, mais forte quanto mais perto) e os cabos
      bagunçados. Sem ar perto, sobe mais rápido. No apagão o ar desliga: o calor continua subindo.
   2. Mostrar: uma faixa de cor no rack (verde, amarelo, laranja, vermelho), brilho e termômetro quando
      está quente, a temperatura chegando perto (e no painel do rack ao clicar). Avisos: "Rack esquentando!",
      um funcionário comenta, o Monitor abre o alerta (monitor.js).
   3. O fogo (raro e justo): só num rack que ficou no VERMELHO por bastante tempo seguido. Antes dele: fumaça
      leve, faíscas, um bipe de alarme. Depois de FOGO_APOS segundos no vermelho, a cada SORTEIO segundos uma
      chance pequena, que cresce com o tempo — e às vezes o superaquecimento inteiro passa sem fogo. Um fogo
      por vez, um descanso depois, nunca durante o apagão / o minigame do disjuntor, nunca em rack quase
      vazio ou bem refrigerado. Esfriou a tempo: não pega fogo.
   4. Pegou fogo: alarme, luz vermelha de emergência, a equipe em pânico (crew.js, evento 'fogo'). Chegando
      perto, "E · Apagar fogo" (o botão de ação no celular): o extintor solta pó branco e o fogo apaga em
      EXTINTOR segundos — longe demais, para e o fogo volta a crescer devagar. Demorou: o fogo se espalha
      pelos equipamentos DO MESMO rack (nunca para outros).
   5. Apagado: 1 equipamento danificado (rápido) ou 2 (demorou) — nunca todos os servidores do rack. Cada um
      vira uma tarefa (ops.js): a peça na bancada (staff.js, o técnico ou você), depois o cabo e a configuração
      no terminal, como um servidor novo. Um switch queimado deixa sem rede os servidores ligados nele até
      voltar. O rack fica chamuscado até tudo voltar. XP por apagar e por equipamento recuperado.
   6. Custo das peças + limpeza (economy.penalty) e um resumo curto.
   Salvo junto do jogo (snapshot / restore). Só o anfitrião simula numa sala multiplayer.
   Carregado depois de disjuntor.js (precisa do jogo, da rua, do dia/noite e do apagão). */
(function () {
  'use strict';
  const DL = window.DL, D = window.DataLabDemo;
  if (!DL || !D || !D.scene || !D.ops || !D.game) return;
  const G = D.game, scene = D.scene, ops = D.ops, T = DL.T || 16;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rand = Math.random;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = (v) => '$' + Math.round(v).toLocaleString('pt-BR');
  const graus = (v) => v.toFixed(1).replace('.', ',') + ' °C';

  DL.CALOR = {
    /* ====== A TEMPERATURA DO RACK (°C) ====== */
    BASE: 22,            // rack vazio
    PISO: 18,            // a refrigeração não leva o rack abaixo disso
    POR_SERVIDOR: 1.6,   // × √(potência do modelo em kW): um servidor padrão (0,32 kW) ≈ 0,9 °C; GPU ≈ 2,7 °C
    CARGA_MIN: 0.6,      // parte do calor de um servidor parado (o resto vem da carga da CPU)
    PARADO: 0.35,        // um servidor ligado mas ainda sem cabo / configuração esquenta só isso
    POR_SWITCH: 0.35,
    VIZINHO: 0.3,        // parte do calor dos equipamentos de um rack colado que passa para este
    SEM_FRIO: 3,         // a mais quando não há nenhum ar de precisão perto
    FRIO_AR: 6,          // quanto um ar de precisão colado no rack tira (cai com a distância)
    FRIO_RAIO: 12,       // tiles: até onde ele chega com força (na mesma sala)
    FRIO_QUEDA: 0.6,     // quanto da força ele perde até a borda do alcance
    FRIO_SALA: 1,        // além do alcance, na mesma sala, ainda ajuda um pouco
    FRIO_MAX: 9,         // o máximo que a refrigeração tira, somando os aparelhos
    FRIO_REVISADO: 1.25, // ar com manutenção da equipe (filtros, setpoint) rende mais
    CABOS: 1.5,          // cabos bagunçados bloqueiam o fluxo de ar
    PLACA_CEGA: 1,       // placas cegas ajudam
    FOGO_CALOR: 8,       // um rack em chamas, obviamente, esquenta
    SOBE_SEM_FRIO: 0.07, // por segundo: quanto do caminho até o alvo a temperatura anda subindo, sem ar perto
    SOBE_COM_FRIO: 0.035,// … com ar perto (sobe mais devagar)
    DESCE: 0.025,        // … descendo (esfria devagar)
    /* as zonas de cor */
    AMARELO: 28, LARANJA: 31, VERMELHO: 34,

    /* ====== O INCÊNDIO ====== */
    FUMACA: 15,          // s seguidos no vermelho: fumaça leve
    FAISCAS: 40,         // … faíscas
    ALARME: 70,          // … bipe de alarme
    FOGO_APOS: 90,       // … só a partir daqui pode pegar fogo
    SORTEIO: 5,          // s entre um sorteio e outro
    CHANCE_INICIAL: 0.03,  // chance em cada sorteio, logo depois de FOGO_APOS
    CHANCE_POR_MINUTO: 0.06, // + a cada minuto a mais no vermelho
    CHANCE_MAX: 0.3,
    EPISODIO_SEGURO: 0.35, // chance de um superaquecimento inteiro passar sem fogo (sorteada quando fica vermelho)
    MIN_EQUIPAMENTOS: 3, // rack com menos que isso nunca pega fogo
    FRIO_SEGURO: 4,      // rack com essa refrigeração (ou mais) nunca pega fogo
    DESCANSO: 300,       // s sem novo incêndio depois de um apagado

    /* ====== O FOGO E O EXTINTOR ====== */
    EXTINTOR: 4,         // s de extintor para apagar (o jogador fica perto)
    REACENDE: 0.12,      // por segundo: quanto do progresso do extintor se perde longe do rack
    CRESCER: 40,         // s para o fogo chegar ao tamanho máximo
    ESPALHAR: 20,        // s para o fogo pegar em mais um equipamento do mesmo rack
    DISTANCIA: 22,       // px do mundo: perto o bastante para usar o extintor
    BOMBEIROS: 240,      // s: ninguém apagou, os bombeiros apagam (dano máximo, sem XP)
    RAPIDO: 25,          // s: apagado até aqui (sem ter espalhado) = só 1 equipamento danificado
    DANO_MAX: 2,         // equipamentos danificados, no máximo

    /* ====== CUSTOS E XP ====== */
    PECA: 0.15,          // fração do preço do equipamento para trocar a peça queimada
    PECA_MIN: 150,
    LIMPEZA: 250,        // $ de limpeza do pó do extintor e da fuligem
    XP_APAGAR: 30,
    XP_EQUIPAMENTO: 20,  // por equipamento recuperado (peça + cabo + configuração)
  };
  const C = DL.CALOR;
  const COR = ['#3dffa2', '#ffd84a', '#ff9a3d', '#ff4d5e'];
  const NOME_ZONA = ['normal', 'morna', 'quente', 'CRÍTICA'];
  const zona = (t) => (t >= C.VERMELHO ? 3 : t >= C.LARANJA ? 2 : t >= C.AMARELO ? 1 : 0);
  const IX = (x, y) => x - y, IY = (x, y, z) => (x + y) / 2 - (z || 0);

  const F = { fire: null, cd: 0, acc: 0, rollAcc: 0, beep: 0, dmg: [], last: null };
  const world = () => scene.world;
  const racks = () => world().items.filter((e) => e.kind === 'rack' && e.units);
  const B = () => D.blackout;
  const blackoutOn = () => !!(B() && B().state && B().state.phase !== 'idle');
  const dentro = () => !(DL.Street && DL.Street.outside);
  const playing = () => D.state.phase === 'play' && !G.guest;
  const player = D.player;
  const staff = () => D.staff;
  const crewAwake = () => ((D.crew && D.crew.members) || []).filter((a) => a && a.crew && !a.crew.off && !a.hidden && Number.isFinite(a.x));
  const centro = (r) => ({ x: r.px + (r.tw || 1) * 8, y: r.py + (r.th || 1) * 8 });
  // distance from a point to the rack's footprint (world px)
  function distRack(p, r) {
    const x0 = r.px, y0 = r.py, x1 = x0 + (r.tw || 1) * T, y1 = y0 + (r.th || 1) * T;
    return Math.hypot(Math.max(x0 - p.x, 0, p.x - x1), Math.max(y0 - p.y, 0, p.y - y1));
  }
  const unidades = (r) => (r.units ? r.units.filter(Boolean).length : 0);
  const devsOf = (r) => ops.devices().filter((d) => d.rack === r && d.kind !== 'patch');
  function say(a, text, tone) {
    if (!a) return;
    a.bubble = { text, left: 2.8, tone: tone || 'warn' };
    if (G.chat) G.chat.post(a, text, { tone: tone || 'warn' });
  }
  const someone = () => { const p = crewAwake(); return p.length ? pick(p) : null; };

  /* ================================================================== */
  /* 1. O CALOR                                                          */
  /* ================================================================== */
  // the heat a device gives off (°C on its rack)
  function calorDe(d) {
    if (d.broken || d.out) return 0;
    if (d.kind === 'switch') return C.POR_SWITCH;
    if (d.kind !== 'server') return 0;
    const m = DL.hwOf ? DL.hwOf(d) : null, kw = m && m.power ? m.power : 0.32;
    const base = C.POR_SERVIDOR * Math.sqrt(kw);
    if (d.state !== 'online') return base * C.PARADO;
    const b = d.mb, load = !b ? 0.5 : b.spike ? 1 : clamp(b.cpu / 70, 0, 1);
    return base * (C.CARGA_MIN + (1 - C.CARGA_MIN) * load);
  }
  // every second: where each rack's temperature is heading, and the step towards it
  function calcular() {
    const list = racks(), cracs = world().items.filter((e) => e.kind === 'crac');
    const semEnergia = blackoutOn() && (B().state.phase === 'dark' || B().state.phase === 'semRack');
    const own = new Map();
    for (const d of ops.devices()) if (d.rack && d.rack.units) own.set(d.rack, (own.get(d.rack) || 0) + calorDe(d));
    for (const r of list) {
      const eq = own.get(r) || 0, c = centro(r), room = ops.roomOf(r);
      let frio = 0, teto = C.FRIO_MAX;
      if (!semEnergia) {
        for (const a of cracs) {
          if (ops.roomOf(a) !== room) continue;
          // (the unit's model — hardware.js HW.crac: better ones cool more, reach further and raise the ceiling)
          const m = DL.cracModel ? DL.cracModel(a) : { frio: C.FRIO_AR, raio: C.FRIO_RAIO, max: C.FRIO_MAX, sala: C.FRIO_SALA };
          const ca = centro(a), dt = Math.hypot(ca.x - c.x, ca.y - c.y) / T;
          frio += (dt < m.raio ? m.frio * (1 - C.FRIO_QUEDA * dt / m.raio) : m.sala) * (a.tuned ? C.FRIO_REVISADO : 1);
          teto = Math.max(teto, m.max);
        }
        frio = Math.min(teto, frio);
      }
      let viz = 0;
      for (const o of list) {
        if (o === r) continue;
        const co = centro(o);
        if (Math.abs(co.x - c.x) <= T * 1.2 && Math.abs(co.y - c.y) <= T * 1.2 && (Math.abs(co.x - c.x) < 4 || Math.abs(co.y - c.y) < 4)) viz += own.get(o) || 0;
      }
      viz *= C.VIZINHO * (1 - 0.6 * Math.min(1, frio / teto));
      const cabos = r.tidy === false && r.cableLook ? C.CABOS : 0;
      const fogo = F.fire && F.fire.rack === r ? C.FOGO_CALOR : 0;
      const alvo = eq ? C.BASE + eq + viz + (frio < 1 ? C.SEM_FRIO : 0) - frio + cabos - (r.blank ? C.PLACA_CEGA : 0) + fogo : C.BASE;
      r.calor = { alvo: Math.max(C.PISO, alvo), eq, viz, frio, cabos };
      // (r.tmon: what the sensor reads — the Monitor, the terminal and this file share it)
      const to = r.calor.alvo;
      if (r.tmon == null || !Number.isFinite(r.tmon)) r.tmon = to;
      else r.tmon += (to - r.tmon) * (to > r.tmon ? (frio < 1 ? C.SOBE_SEM_FRIO : C.SOBE_COM_FRIO) : C.DESCE);
    }
    return list;
  }

  /* ---------- the warnings, and the slow road to a fire ---------- */
  function avisar(r, now) {
    const t = r.tmon, z = zona(t), was = r.zonaAntes || 0;
    r.zonaAntes = z;
    const id = r.id || 'rack';
    if (z >= 2 && was < 2 && now - (r.avisoQuente || -1e9) > 180) {
      r.avisoQuente = now;
      G.toast('warn', '🌡️ Rack esquentando!', id + ' a ' + graus(t) + ' · ponha um ar de precisão perto, afaste os racks ou tire servidores dele');
      const a = someone();
      if (a && G.chat) G.chat.later(1.2, () => say(a, pick(['O ' + id + ' tá esquentando!', 'Tá quente perto do ' + id + ', hein.', 'Chefe, o ' + id + ' tá fervendo. Falta ar ali.', 'Sente esse bafo quente do ' + id + '?'])));
    }
    if (z === 3 && was < 3 && now - (r.avisoCritico || -1e9) > 120) {
      r.avisoCritico = now;
      G.toast('warn', '🔥 ' + id + ' superaquecido!', graus(t) + ' · risco de incêndio se continuar assim · resfrie o rack');
      G.sfx('alarmeCalor');
    }
  }
  function risco(r, dt) {
    if (zona(r.tmon) === 3) {
      if (!r.vermelho) r.seguro = rand() < C.EPISODIO_SEGURO; // this whole overheat may pass without fire
      const was = r.vermelho || 0;
      r.vermelho = was + dt;
      const a = someone();
      if (a && was < C.FUMACA && r.vermelho >= C.FUMACA) say(a, pick(['Tá saindo fumaça do ' + r.id + '!', 'Que cheiro de queimado vindo do ' + r.id + '…']));
      if (a && was < C.FAISCAS && r.vermelho >= C.FAISCAS) say(a, pick(['Faísca no ' + r.id + '! Alguém resfria isso!', 'O ' + r.id + ' tá soltando faísca!!']));
      if (was < C.ALARME && r.vermelho >= C.ALARME) G.toast('warn', '🚨 Alarme de temperatura', r.id + ' no limite · resfrie agora ou ele pode pegar fogo');
    } else if (r.vermelho) r.vermelho = Math.max(0, r.vermelho - dt * 2);
  }
  const estagio = (r) => { const v = r.vermelho || 0; return v >= C.ALARME ? 3 : v >= C.FAISCAS ? 2 : v >= C.FUMACA ? 1 : 0; };
  // can a fire start now? (null = yes)
  function bloqueio() {
    if (F.fire) return 'já há um incêndio';
    if (F.cd > 0) return 'descanso depois do último incêndio';
    if (!playing()) return 'fora de jogo';
    if (G.paused && G.paused()) return 'pausado / tutorial';
    if (blackoutOn()) return 'apagão';
    if (DL.Disjuntor && DL.Disjuntor.aberto) return 'minigame do disjuntor';
    return null;
  }
  const podeQueimar = (r) => (r.vermelho || 0) >= C.FOGO_APOS && !r.seguro && unidades(r) >= C.MIN_EQUIPAMENTOS && !(r.calor && r.calor.frio >= C.FRIO_SEGURO);
  function sortear(list) {
    if (bloqueio()) return;
    for (const r of list) {
      if (!podeQueimar(r)) continue;
      const p = Math.min(C.CHANCE_MAX, C.CHANCE_INICIAL + C.CHANCE_POR_MINUTO * (r.vermelho - C.FOGO_APOS) / 60);
      if (rand() < p) { acender(r); return; }
    }
  }

  /* ================================================================== */
  /* 2. O FOGO                                                           */
  /* ================================================================== */
  function acender(r) {
    const n = Math.max(1, unidades(r));
    const filled = r.units.map((u, k) => (u ? k : -1)).filter((k) => k >= 0);
    F.fire = { rack: r, t: 0, size: 0.25, prog: 0, spray: false, spread: 1, spreadT: 0, slot: filled.length ? pick(filled) : 0, n, alarm: 0, crack: 0, hiss: 0, warned: false };
    r.vermelho = 0;
    r.queimando = true;
    r.fogoSlot = F.fire.slot;
    G.toast('warn', '🔥 INCÊNDIO no ' + (r.id || 'rack'), 'Corra até o rack com o extintor: chegue perto e aperte E (o botão de ação no celular)');
    G.sfx('fogoAcende');
    ops.logEvent('warn', '🔥 Incêndio no ' + (r.id || 'rack'));
    G.emit('fogo', { on: true, rack: r });
    hud(true);
  }
  const perto = (r, extra) => dentro() && distRack(player, r) <= C.DISTANCIA + (extra || 0);
  // the target the "E" prompt points at (demo.js findTarget)
  const ALVO = { fogo: true, id: 'FOGO', name: 'Rack', verb: 'Apagar fogo', rack: null, use: () => usarExtintor() };
  function alvo(p) {
    const f = F.fire;
    if (!f || !dentro() || D.state.mode !== 'explore' || distRack(p, f.rack) > C.DISTANCIA) return null;
    ALVO.rack = f.rack;
    ALVO.name = 'Incêndio no ' + (f.rack.id || 'rack');
    ALVO.verb = f.spray ? 'Apagando…' : 'Apagar fogo';
    return ALVO;
  }
  function usarExtintor() {
    const f = F.fire;
    if (!f || f.spray || !perto(f.rack)) return; // (a second tap while spraying does nothing)
    f.spray = true;
    f.hiss = 0;
    if (!f.warned) { f.warned = true; player.bubble = { text: '🧯 Segura!', left: 1.6, tone: 'warn' }; }
  }
  function passoFogo(dt) {
    const f = F.fire, r = f.rack;
    // the rack was removed in build mode (or a new game): no fire any more, nothing to damage
    if (world().items.indexOf(r) < 0) { cancelar('O rack em chamas foi retirado · fogo controlado'); return; }
    f.t += dt;
    const c = centro(r);
    if (f.spray && !perto(r, 8)) {
      f.spray = false;
      G.toast('warn', 'Longe demais do fogo', 'Volte para perto do ' + (r.id || 'rack') + ' e aperte E de novo');
    }
    if (f.spray) {
      player.dir = DL.dirOf ? DL.dirOf(c.x - player.x, c.y - player.y) : player.dir;
      f.prog += dt / C.EXTINTOR;
      f.hiss -= dt;
      if (f.hiss <= 0) { f.hiss = 0.42; G.sfx('extintor'); }
      if (f.prog >= 1) { apagar(false); return; }
    } else {
      f.prog = Math.max(0, f.prog - dt * C.REACENDE);
      f.size = Math.min(1, f.size + dt / C.CRESCER);
      f.spreadT += dt;
      if (f.spreadT >= C.ESPALHAR && f.spread < f.n) {
        f.spreadT = 0;
        f.spread++;
        G.toast('warn', '🔥 O fogo está se espalhando', 'Mais um equipamento do ' + (r.id || 'rack') + ' pegou fogo · o dano vai ser maior');
      }
    }
    // the alarm (quieter from the street, through the wall), the crackle near the rack
    f.alarm -= dt;
    if (f.alarm <= 0) {
      f.alarm = 1.15;
      if (dentro()) G.sfx('alarmeFogo');
      else if (DL.audio) DL.audio.play('alarmeFogo', { vol: 0.35, lp: 900 });
    }
    f.crack -= dt;
    if (f.crack <= 0 && dentro()) {
      f.crack = 0.5 + rand() * 0.5;
      const d = Math.hypot(c.x - player.x, c.y - player.y);
      if (d < 140 && DL.audio) DL.audio.play('crepita', { vol: Math.max(0.15, 1 - d / 140) * (0.5 + 0.5 * f.size) * (1 - f.prog), key: 'fogo' });
    }
    if (f.t >= C.BOMBEIROS) apagar(true);
    hud(true);
  }
  function cancelar(why) {
    const f = F.fire;
    if (!f) return;
    F.fire = null;
    f.rack.queimando = false;
    G.emit('fogo', { on: false, rack: f.rack });
    hud(false);
    if (why) G.toast('info', 'Incêndio', why);
  }
  // put out: by the player (bombeiros = false) or, after a long while, by the fire brigade
  function apagar(bombeiros) {
    const f = F.fire;
    if (!f) return;
    F.fire = null;
    const r = f.rack;
    r.queimando = false;
    const rapido = f.t <= C.RAPIDO && f.spread <= 1;
    const quer = bombeiros ? C.DANO_MAX : Math.min(C.DANO_MAX, rapido ? 1 : 2);
    const danos = danificar(r, quer);
    let custo = C.LIMPEZA;
    for (const d of danos) custo += precoPeca(d);
    if (G.economy && G.economy.penalty) G.economy.penalty(custo, 'incêndio · peças e limpeza');
    const xp = !bombeiros && G.career ? G.career.solve({ id: 'incendio_apagado', xp: rapido ? C.XP_APAGAR : Math.ceil(C.XP_APAGAR * 0.6) }, 1) : 0;
    if (danos.length) r.queimado = true;
    r.fuligem = 1; // soot that fades (stays while the rack is "queimado")
    r.fumegando = 25;
    r.tmon = Math.min(r.tmon || C.BASE, C.LARANJA - 1); // the powder took the heat out
    F.cd = C.DESCANSO;
    G.sfx('extintorFim');
    G.emit('fogo', { on: false, rack: r });
    hud(false);
    if (bombeiros) G.toast('warn', '🚒 Os bombeiros apagaram', 'Ninguém usou o extintor a tempo · ' + danos.length + ' equipamento(s) danificado(s)');
    else G.toast('ok', '🧯 Fogo apagado!', (r.id || 'Rack') + ' salvo em ' + dur(f.t) + (danos.length ? ' · ' + danos.length + ' equipamento(s) para recuperar em Tarefas' : ''));
    ops.logEvent(bombeiros ? 'warn' : 'ok', '🧯 Incêndio no ' + (r.id || 'rack') + ' apagado' + (bombeiros ? ' pelos bombeiros' : '') + ' · ' + danos.length + ' danificado(s)');
    if (!bombeiros) { const a = someone(); if (a) setTimeout(() => say(a, pick(['Foi por pouco!', 'Boa, chefe! 🧯', 'Salvou o rack!']), 'ok'), 600); }
    F.last = { rack: r.id || 'rack', t: f.t, danos: danos.map((d) => d.name), custo, xp, bombeiros, renda: danos.reduce((s, d) => s + rendaDe(d), 0) };
    resumo(F.last);
  }
  function precoPeca(d) {
    const m = DL.hwOf ? DL.hwOf(d) : null;
    return Math.max(C.PECA_MIN, Math.round(((m && m.price) || 2000) * C.PECA));
  }
  const rendaDe = (d) => (d.kind === 'server' && d.estavaOnline ? 24 * (((DL.hwOf && DL.hwOf(d)) || {}).perf || 1) : 0);

  /* ---------- the damage: 1 or 2 units of THAT rack, never all its servers ---------- */
  function danificar(r, n) {
    const st = staff();
    const all = devsOf(r).filter((d) => !d.broken && !d.out && !d.queimado);
    const servers = all.filter((d) => d.kind === 'server');
    const ok = servers.filter((d) => !(DL.isWin && DL.isWin(d))); // (a fresh OS would wipe a Windows install)
    const switches = all.filter((d) => d.kind === 'switch');
    const maxSrv = Math.max(0, servers.length - 1);
    for (let i = ok.length - 1; i > 0; i--) { const j = Math.floor(rand() * (i + 1)); [ok[i], ok[j]] = [ok[j], ok[i]]; }
    // the ones in the burning slots first, then online ones
    ok.sort((a, b) => Math.abs(a.slot - F_slot(r)) - Math.abs(b.slot - F_slot(r)) || (b.state === 'online') - (a.state === 'online'));
    const out = [];
    if (switches.length && (rand() < 0.35 || !ok.length || !maxSrv)) out.push(pick(switches));
    for (const d of ok) { if (out.length >= n || out.filter((x) => x.kind === 'server').length >= maxSrv) break; out.push(d); }
    for (const d of out) {
      d.queimado = true;
      d.estavaOnline = d.state === 'online';
      if (d.kind === 'server') {
        // the cable melted, the configuration is gone (the test shortcut puts the cables back)
        const mine = ops.links.filter((l) => l.a.dev === d.key || l.b.dev === d.key);
        d.fogoBackup = mine.map((l) => ({ a: Object.assign({}, l.a), b: Object.assign({}, l.b) }));
        for (const l of mine) ops.links.splice(ops.links.indexOf(l), 1);
        d.fault = null;
        d.state = 'new';
        if (DL.newOS) DL.newOS(d, false);
      }
      if (st && st.breakItem) st.breakItem(d, { quiet: true });
      ops.logEvent('warn', '🔥 ' + d.name + ' queimou no incêndio · troque a peça, refaça o cabo e configure');
    }
    ops.recompute();
    ops.render(true);
    return out;
  }
  const F_slot = (r) => (r.fogoSlot != null ? r.fogoSlot : 0);

  /* ---------- the recovery: XP for each unit back, the rack clean again ---------- */
  function limparRack(r) {
    if (!r || !r.queimado) return;
    if (devsOf(r).some((d) => d.queimado)) return;
    r.queimado = false;
    G.toast('ok', 'Rack recuperado', (r.id || 'O rack') + ' sem marcas do incêndio');
  }
  function recuperado(d) {
    if (!d || !d.queimado) return;
    d.queimado = false;
    d.fogoBackup = null;
    const xp = G.career ? G.career.solve({ id: 'incendio_equipamento', xp: C.XP_EQUIPAMENTO }, 1) : 0;
    G.toast('ok', 'Equipamento recuperado', d.name + ' de volta depois do incêndio' + (xp ? ' · +' + xp + ' XP' : ''));
    limparRack(d.rack);
    ops.render(true);
  }
  G.on('repaired', (info) => {
    const d = info && info.rec && info.rec.dev;
    if (!d || !d.queimado) return;
    if (d.kind === 'switch') recuperado(d); // a switch is back with its cables in the same ports
    else { G.toast('info', 'Peça trocada', d.name + ' · agora refaça o cabo e configure no terminal (Tarefas)'); ops.render(true); }
  });
  G.on('server-online', (info) => { if (info && info.d && info.d.queimado && !info.d.broken) recuperado(info.d); });

  // the task card (ops.js) for a burnt part still to swap
  const recOf = (d) => (staff() && staff().broken ? staff().broken().find((x) => x.dev === d) : null);
  function tecnico(d) { const rec = recOf(d); return rec ? (rec.taken ? 't' : staff().claimed(rec) ? 'c' : 'l') : ''; }
  function tarefaHtml(d, title, care) {
    const rec = recOf(d);
    const now = rec && rec.out ? 'Na bancada com ' + (rec.taken ? rec.taken.crew.name : 'o técnico') : rec && rec.taken ? rec.taken.crew.name + ' está indo buscar' : 'Trocar a peça queimada';
    const steps = d.kind === 'switch' ? ['Trocar a peça (bancada)', 'Reinstalar no rack (cabos nas mesmas portas)'] : ['Trocar a peça (bancada)', 'Refazer o cabo', 'Configurar no terminal', 'Testar conexão'];
    let h = '<li class="ops-item is-fault"><div class="ops-item__head"><span class="dot dot--warn dot--live"></span><b>' + esc(title) + '</b></div>' +
      '<div class="ops-item__meta"><span class="ops-tag is-warn">🔥 Incêndio · +' + C.XP_EQUIPAMENTO + ' XP</span><span class="ops-item__where">' + esc(d.where || '') + '</span></div>' +
      '<p class="ops-item__now"><span>Agora</span>' + esc(now) + (care ? ' · 📋 ' + esc(care) : '') + '</p>' +
      '<details class="ops-more" data-det="f' + d.key + '"><summary>Ver detalhes</summary><ol class="ops-steps">' + steps.map((s, i) => '<li class="' + (i === 0 ? 'is-current' : '') + '">' + s + '</li>').join('') + '</ol>' +
      '<p>' + (d.kind === 'switch' ? 'O fogo queimou a fonte deste switch: os servidores ligados nele estão sem rede até ele voltar.' : 'O fogo queimou uma placa deste servidor, derreteu o cabo e apagou a configuração. Depois da peça: ligue a eth0 num switch e configure no terminal (interface, IP, rota).') + '</p></details><div class="ops-item__actions">';
    if (rec && !rec.taken && !staff().claimed(rec)) h += '<button type="button" class="btn btn--sm btn--primary" data-op="tec" data-dev="' + d.key + '">Chamar técnico</button>';
    if (rec && !rec.taken) h += '<button type="button" class="btn btn--sm" data-op="troca" data-dev="' + d.key + '">Trocar a peça você mesmo</button>';
    return h + '<button type="button" class="btn btn--sm" data-op="show" data-dev="' + d.key + '">Mapa</button></div></li>';
  }
  function chamarTecnico(d) {
    const rec = recOf(d);
    if (!rec) return;
    const o = staff().createOrder('repair', rec, { byName: D.crew.playerProfile.name });
    if (o) G.toast('info', 'Ordem #' + o.id, o.title + (o.assignee ? ' · ' + o.assignee.crew.name + ' a caminho' : ' · aguardando um técnico'));
    else G.toast('info', 'Manutenção', 'Já existe uma ordem para o ' + rec.label);
    ops.render(true);
  }
  function trocarPeca(d) {
    const rec = recOf(d);
    if (!rec) return;
    if (rec.taken) { G.toast('info', 'Manutenção', rec.label + ' já está com ' + rec.taken.crew.name); return; }
    staff().repaired(rec, null);
    G.sfx('parafuso');
  }

  /* ---------- the panel of a rack (demo.js, when clicked) ---------- */
  function painelHtml(r) {
    const t = r.tmon != null ? r.tmon : C.BASE, z = zona(t), k = r.calor || {};
    const por = [];
    if (k.eq) por.push('equipamentos +' + k.eq.toFixed(1));
    if (k.viz > 0.05) por.push('racks colados +' + k.viz.toFixed(1));
    if (k.frio >= 1) por.push('ar de precisão −' + k.frio.toFixed(1)); else if (k.eq) por.push('sem ar perto +' + C.SEM_FRIO);
    if (k.cabos) por.push('cabos +' + k.cabos);
    const fogo = F.fire && F.fire.rack === r ? '<p class="callout callout--warn">🔥 EM CHAMAS · chegue perto e aperte E para usar o extintor</p>'
      : r.queimado ? '<p class="callout callout--warn">Chamuscado por um incêndio · os equipamentos queimados estão em Tarefas</p>'
      : z === 3 ? '<p class="callout callout--warn">Superaquecido' + ((r.vermelho || 0) > 5 ? ' há ' + dur(r.vermelho) : '') + ' · risco de incêndio. Resfrie: ar de precisão perto, racks afastados, menos servidores.</p>' : '';
    return '<div class="p-sec fg-painel"><span class="eyebrow-sm">Temperatura</span><p class="fg-painel__t" style="--c:' + COR[z] + '">🌡️ <b>' + graus(t) + '</b> · ' + NOME_ZONA[z] + '</p>' +
      (por.length ? '<p class="fg-painel__por">' + esc(por.join(' · ')) + ' (°C)</p>' : '') + fogo + '</div>';
  }

  /* ================================================================== */
  /* 3. DESENHO                                                          */
  /* ================================================================== */
  // the rack itself (iso.js calls it right after drawing a rack, in iso-pixel space): heat colour + soot
  const SOOT = [[0.2, 0.3, 3], [0.55, 0.5, 4], [0.35, 0.75, 3], [0.7, 0.2, 2], [0.8, 0.65, 3]];
  DL.rackFx = function (g, sc, e, poly) {
    if (!unidades(e)) return;
    const t = e.tmon != null ? e.tmon : C.BASE, z = zona(t), now = sc.t;
    // the hull: [backL top, backR top, right bottom, front-right bottom, front-left bottom, front-left top]
    const p3 = poly[3], p4 = poly[4], p5 = poly[5], h = p5[1] - p4[1];
    const frt = [p3[0], p3[1] + h];
    const soot = e.queimado ? 1 : e.fuligem || 0;
    if (soot > 0.02) {
      g.globalAlpha = 0.62 * soot;
      g.fillStyle = '#0b0705';
      g.beginPath();
      poly.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
      g.closePath();
      g.fill();
      // blotches of soot on the front, and an ember now and then
      g.globalAlpha = 0.7 * soot;
      for (const s of SOOT) {
        const x = p4[0] + (p3[0] - p4[0]) * s[0], y = p4[1] + (p3[1] - p4[1]) * s[0] + h * s[1];
        g.fillRect(Math.round(x), Math.round(y), s[2], s[2] - 1);
      }
      if (e.queimado && !reduced && Math.sin(now * 3 + (e.seed || 0)) > 0.7) {
        g.globalAlpha = 0.9;
        g.fillStyle = '#ff7a17';
        g.fillRect(Math.round(p4[0] + (p3[0] - p4[0]) * 0.45), Math.round(p4[1] + (p3[1] - p4[1]) * 0.45 + h * 0.6), 1, 1);
      }
      g.globalAlpha = 1;
    }
    // the colour strip along the top front edge (always), the glow when hot
    g.strokeStyle = COR[z];
    g.globalAlpha = z ? 0.95 : 0.55;
    g.beginPath(); g.moveTo(p5[0], p5[1] + 0.5); g.lineTo(frt[0], frt[1] + 0.5); g.stroke();
    if (z >= 2) {
      const pulse = reduced ? 0.6 : 0.5 + 0.5 * Math.sin(now * (z === 3 ? 6 : 3));
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = (z === 3 ? 0.22 : 0.12) * (0.5 + pulse);
      g.fillStyle = COR[z];
      g.beginPath();
      poly.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])));
      g.closePath();
      g.fill();
      g.globalAlpha = 0.5 + 0.4 * pulse;
      g.stroke();
      g.globalCompositeOperation = 'source-over';
      // a little pixel thermometer over it
      let top = 1e9, cx = 0;
      for (const p of poly) { if (p[1] < top) top = p[1]; cx += p[0]; }
      cx = Math.round(cx / poly.length);
      const y = Math.round(top) - 11;
      g.globalAlpha = 1;
      g.fillStyle = '#0b0d12'; g.fillRect(cx - 2, y - 1, 5, 10); g.fillRect(cx - 3, y + 6, 7, 4);
      g.fillStyle = '#e6edf6'; g.fillRect(cx - 1, y, 3, 7); g.fillRect(cx - 2, y + 7, 5, 2);
      g.fillStyle = COR[z]; g.fillRect(cx, y + (z === 3 ? 1 : 3), 1, z === 3 ? 7 : 5); g.fillRect(cx - 1, y + 7, 3, 2);
    }
    g.globalAlpha = 1;
  };

  /* ---------- particles: one fixed pool, reused (no objects per frame) ---------- */
  const NP = 360;
  const P = [];
  for (let i = 0; i < NP; i++) P.push({ on: false, k: 0, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, s: 1 });
  let pNext = 0;
  // k: 0 flame · 1 black smoke · 2 spark · 3 powder (extinguisher) · 4 light smoke
  // a ring: when the pool is full the oldest particle is reused (constant cost, nothing allocated)
  function emit(k, x, y, vx, vy, max, s) {
    const p = P[pNext];
    pNext = (pNext + 1) % NP;
    p.on = true; p.k = k; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.life = 0; p.max = max; p.s = s;
  }
  const FLAME = ['#fff3b0', '#ffd84a', '#ff9a3d', '#ff5a1f', '#c8261b'];
  function drawParticles(g, dt) {
    for (let i = 0; i < NP; i++) {
      const p = P[i];
      if (!p.on) continue;
      p.life += dt;
      if (p.life >= p.max) { p.on = false; continue; }
      const u = p.life / p.max;
      p.x += p.vx * dt; p.y += p.vy * dt;
      if (p.k === 0) {
        // solid pixel flames (no additive blending: overlapping flames would wash out to white)
        p.vx = p.vx * 0.94 + Math.sin(p.life * 18 + i) * 0.8;
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = u < 0.75 ? 1 : (1 - u) * 4;
        g.fillStyle = FLAME[Math.min(4, Math.floor(u * 5))];
        const s = Math.max(1, Math.round(p.s * (1 - u * 0.55)));
        g.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s), s, s + (u < 0.5 ? 1 : 0));
      } else if (p.k === 1 || p.k === 4) {
        p.vx += (rand() - 0.5) * 6 * dt;
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = (p.k === 1 ? 0.55 : 0.28) * (1 - u);
        g.fillStyle = p.k === 1 ? '#15110f' : '#9aa3b0';
        const s = Math.round(p.s + u * (p.k === 1 ? 5 : 3));
        g.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
      } else if (p.k === 2) {
        p.vy += 60 * dt;
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 1 - u;
        g.fillStyle = u < 0.4 ? '#fff6c8' : '#ffb347';
        g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      } else {
        p.vx *= 0.9; p.vy *= 0.9;
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 0.75 * (1 - u);
        g.fillStyle = u < 0.5 ? '#ffffff' : '#dfe6ee';
        const s = Math.round(p.s + u * 4);
        g.fillRect(Math.round(p.x - s / 2), Math.round(p.y - s / 2), s, s);
      }
    }
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
  }
  // the rack's front face in iso pixels: left / right bottom corners and the height
  function frente(r) {
    const x0 = r.px, x1 = r.px + (r.tw || 1) * T, y1 = r.py + (r.th || 1) * T;
    return { lx: IX(x0, y1), ly: IY(x0, y1, 0), rx: IX(x1, y1), ry: IY(x1, y1, 0), h: 40 };
  }
  // sprites made once: the warm floor glow, the red emergency glow
  let glowFogo = null, glowRed = null;
  function radial(rgb) {
    const c = DL.mk ? DL.mk(64, 64) : Object.assign(document.createElement('canvas'), { width: 64, height: 64 });
    const x = c.getContext('2d'), grd = x.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(' + rgb + ',0.85)'); grd.addColorStop(0.4, 'rgba(' + rgb + ',0.3)'); grd.addColorStop(1, 'rgba(' + rgb + ',0)');
    x.fillStyle = grd; x.fillRect(0, 0, 64, 64);
    return c;
  }
  let lastT = 0, emitAcc = 0;
  function desenhar(g, sc) {
    const now = sc.t, dt = clamp(now - lastT, 0, 0.1);
    lastT = now;
    if (!dentro()) return;
    const f = F.fire;
    const iso = !!sc.iso;
    if (!iso) return; // (the game draws the inside isometric; nothing to place otherwise)
    emitAcc += dt;
    const step = emitAcc >= 1 / 30; // emit at 30 Hz at most, whatever the frame rate
    const edt = emitAcc;
    if (step) emitAcc = 0;
    // the floor glow under the fire (on the ground plane: the caller left the ground transform on)
    if (f) {
      if (!glowFogo) glowFogo = radial('255,130,40');
      const c = centro(f.rack), k = (0.5 + 0.5 * f.size) * (1 - f.prog * 0.8), fl = reduced ? 1 : 0.85 + 0.15 * Math.sin(now * 13) * Math.sin(now * 7.3);
      const R = 40 + 26 * f.size;
      g.save();
      if (sc.groundTransform) sc.groundTransform(g);
      g.globalCompositeOperation = 'lighter';
      g.globalAlpha = Math.min(1, 0.85 * k * fl);
      g.drawImage(glowFogo, c.x - R, c.y + 8 - R, R * 2, R * 2);
      g.restore();
    }
    DL.isoKit.isoT(g, sc);
    // warnings on the hot racks: light smoke, sparks; the smoke left after a fire
    if (step) {
      for (const r of racks()) {
        const st = estagio(r), fr = frente(r), mx = (fr.lx + fr.rx) / 2, my = (fr.ly + fr.ry) / 2;
        if (st >= 1 && !(f && f.rack === r) && rand() < (st >= 2 ? 0.5 : 0.25)) emit(4, mx + (rand() - 0.5) * 12, my - 30 - rand() * 8, (rand() - 0.5) * 4, -10 - rand() * 6, 1.6, 2);
        if (st >= 2 && !(f && f.rack === r) && rand() < 0.18) for (let i = 0; i < 4; i++) emit(2, mx + (rand() - 0.5) * 12, my - 8 - rand() * 24, (rand() - 0.5) * 40, -20 - rand() * 25, 0.45, 1);
        if (r.fumegando > 0) { r.fumegando -= edt; if (rand() < 0.3) emit(4, mx + (rand() - 0.5) * 10, my - 30, (rand() - 0.5) * 3, -8, 1.8, 2); }
        if (r.fuligem > 0 && !r.queimado) r.fuligem = Math.max(0, r.fuligem - edt / 60);
      }
    }
    if (f) {
      const r = f.rack, fr = frente(r), k = f.size * (1 - f.prog);
      if (step && !reduced) {
        // flames on the burning slots (spreading up and down from the first one), a crown on top when big
        const slots = [];
        for (let i = 0; i < f.spread; i++) slots.push(clamp(f.slot + (i % 2 ? -1 : 1) * Math.ceil(i / 2), 0, 8));
        const rate = Math.round((7 + 12 * k) * (0.6 + 0.4 * slots.length));
        for (let i = 0; i < rate; i++) {
          const sl = slots[i % slots.length], u = 0.08 + rand() * 0.84;
          const x = fr.lx + (fr.rx - fr.lx) * u, y = fr.ly + (fr.ry - fr.ly) * u - 6 - sl * 4 + (rand() - 0.5) * 4;
          emit(0, x, y, (rand() - 0.5) * 10, -26 - rand() * 34 * (0.5 + k), 0.4 + rand() * 0.5 * (0.5 + k), 3 + Math.round(rand() * 2 * (0.5 + k)));
        }
        // the crown of flames over the top of the rack, once it has grown
        if (k > 0.4) for (let i = 0; i < 3 + Math.round(4 * k); i++) emit(0, fr.lx + (fr.rx - fr.lx) * (0.1 + rand() * 0.8), fr.ly - fr.h + 8 + rand() * 6, (rand() - 0.5) * 8, -24 - rand() * 26, 0.45 + rand() * 0.35, 3 + Math.round(rand() * 2));
        if (rand() < 0.8) emit(1, (fr.lx + fr.rx) / 2 + (rand() - 0.5) * 10, fr.ly - fr.h + 2, (rand() - 0.5) * 5, -14 - rand() * 8, 2.4, 3);
        if (rand() < 0.25) emit(2, fr.lx + (fr.rx - fr.lx) * rand(), fr.ly - 10 - rand() * 20, (rand() - 0.5) * 50, -30 - rand() * 30, 0.5, 1);
      }
      if (reduced) {
        // (no particles: a still flame drawn in place)
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = 0.8 * (1 - f.prog);
        g.fillStyle = '#ff9a3d';
        g.fillRect(Math.round(fr.lx + 2), Math.round(fr.ly - 26), Math.round(fr.rx - fr.lx - 4), 16);
        g.fillStyle = '#ffd84a';
        g.fillRect(Math.round(fr.lx + 5), Math.round(fr.ly - 22), Math.round(fr.rx - fr.lx - 10), 9);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
      }
      // the extinguisher in my hands and its jet of powder
      if (f.spray) {
        const px = IX(player.x, player.y), py = IY(player.x, player.y, 0);
        const tx = (fr.lx + fr.rx) / 2, ty = (fr.ly + fr.ry) / 2 - 16;
        const sx = tx >= px ? 1 : -1, hx = Math.round(px + sx * 5), hy = Math.round(py - 13);
        g.fillStyle = '#11141a'; g.fillRect(hx - 2, hy - 1, 5, 10);
        g.fillStyle = '#d6262e'; g.fillRect(hx - 1, hy, 3, 8);
        g.fillStyle = '#ff6a6f'; g.fillRect(hx - 1, hy, 1, 7);
        g.fillStyle = '#e6edf6'; g.fillRect(hx - 1, hy + 3, 3, 2);
        g.fillStyle = '#2a2f38'; g.fillRect(hx, hy - 2, 1, 2); g.fillRect(hx + sx, hy - 2, 2 * sx, 1);
        const nx = hx + sx * 3, ny = hy - 2;
        if (step) {
          const dx = tx - nx, dy = ty - ny, L = Math.hypot(dx, dy) || 1, sp = 90;
          for (let i = 0; i < 7; i++) emit(3, nx, ny, (dx / L) * sp + (rand() - 0.5) * 22, (dy / L) * sp + (rand() - 0.5) * 22, Math.min(0.5, L / sp + 0.08), 1 + Math.round(rand()));
          for (let i = 0; i < 3; i++) emit(3, tx + (rand() - 0.5) * 14, ty + (rand() - 0.5) * 14, (rand() - 0.5) * 20, -6 - rand() * 10, 0.7, 3);
        }
      }
    }
    drawParticles(g, reduced ? 0.016 : dt);
    // the red emergency light: a wash and two beacons in the top corners (screen space)
    if (f) {
      if (!glowRed) glowRed = radial('242,73,92');
      const cv = g.canvas, W = cv.width, H = cv.height, R = Math.max(W, H) * 0.7;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.globalCompositeOperation = 'lighter';
      if (reduced) { g.globalAlpha = 0.14; g.drawImage(glowRed, W / 2 - R, -R * 0.6, R * 2, R * 2); }
      else {
        const flash = (ph) => Math.pow(Math.max(0, Math.sin(now * 4.6 + ph)), 6);
        g.globalAlpha = 0.13 + 0.09 * (0.5 + 0.5 * Math.sin(now * 2.3));
        g.drawImage(glowRed, W / 2 - R, -R * 0.7, R * 2, R * 2);
        g.globalAlpha = 0.75 * flash(0);
        g.drawImage(glowRed, -R * 0.5, -R * 0.5, R, R);
        g.globalAlpha = 0.75 * flash(Math.PI);
        g.drawImage(glowRed, W - R * 0.5, -R * 0.5, R, R);
      }
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
    }
  }
  // drawn after everything inside, after the night tint (daynight.js): the fire glows in the dark
  const baseOverlay = scene.overlay;
  scene.overlay = function (g, sc) {
    if (baseOverlay) baseOverlay.call(this, g, sc);
    g.save();
    try { desenhar(g, sc); } finally { g.restore(); }
  };

  /* ---------- HUD: the fire and the extinguisher's progress; the temperature near a rack ---------- */
  const raiz = G.root || document.getElementById('game') || document.body;
  let hudEl = null, hudBar = null, hudTxt = null, hudKey = '';
  function hud(on) {
    if (!hudEl) {
      hudEl = document.createElement('div');
      hudEl.className = 'fogo-hud';
      hudEl.hidden = true;
      hudEl.setAttribute('role', 'status');
      hudEl.innerHTML = '<b>🔥 Incêndio</b><div class="fogo-hud__bar"><i></i></div><span></span>';
      hudBar = hudEl.querySelector('i'); hudTxt = hudEl.querySelector('span');
      raiz.appendChild(hudEl);
    }
    const f = F.fire;
    if (!on || !f) { if (!hudEl.hidden) { hudEl.hidden = true; hudKey = ''; } return; }
    const near = perto(f.rack);
    const txt = f.spray ? 'Apagando… fique perto' : near ? 'Aperte E para usar o extintor' : 'Vá até o ' + (f.rack.id || 'rack') + ' (' + dur(f.t) + ')';
    const key = txt + Math.round(f.prog * 100);
    if (key === hudKey) return;
    hudKey = key;
    hudEl.hidden = false;
    hudEl.querySelector('b').textContent = '🔥 Incêndio no ' + (f.rack.id || 'rack');
    hudBar.style.width = Math.round(f.prog * 100) + '%';
    hudTxt.textContent = DL.mobileText ? DL.mobileText(txt) : txt;
    hudEl.classList.toggle('is-spray', f.spray);
  }
  const tag = document.createElement('div');
  tag.className = 'fogo-temp';
  tag.hidden = true;
  tag.setAttribute('aria-hidden', 'true');
  raiz.appendChild(tag);
  let tagKey = '', tagRack = null;
  function atualizarTag() {
    let best = null;
    if (dentro() && D.state.phase === 'play' && D.state.mode === 'explore') {
      let bd = 26;
      for (const r of racks()) { if (!unidades(r)) continue; const d = distRack(player, r); if (d < bd) { bd = d; best = r; } }
    }
    if (!best) { if (!tag.hidden) { tag.hidden = true; tagKey = ''; } tagRack = null; return; }
    const t = best.tmon != null ? best.tmon : C.BASE, z = zona(t);
    const key = best.id + graus(t) + z;
    if (key !== tagKey) {
      tagKey = key;
      tag.textContent = '🌡️ ' + graus(t);
      tag.style.setProperty('--c', COR[z]);
      tag.classList.toggle('is-hot', z >= 2);
    }
    tagRack = best;
    tag.hidden = false;
    const p = scene.itemTop(best, z >= 2 ? 16 : 4);
    // (the "E" prompt over this same rack: the tag goes on top of it, not over it)
    const y = p.y - (D.state.target === best ? 38 : 0);
    tag.style.transform = 'translate(' + p.x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) translate(-50%,-100%)';
  }
  // (the "E" prompt sits over the rack: the temperature tag moves aside while the fire prompt shows)
  const baseRender = scene.render;
  scene.render = function () {
    baseRender.apply(this, arguments);
    if (F.fire && D.state.target === ALVO) { if (!tag.hidden) tag.hidden = true; tagKey = ''; return; }
    atualizarTag();
  };

  /* ---------- the summary ---------- */
  function dur(s) { s = Math.max(0, Math.round(s)); return s < 60 ? s + ' s' : Math.floor(s / 60) + ' min' + (s % 60 ? ' ' + (s % 60) + ' s' : ''); }
  let resumoEl = null;
  function resumo(run) {
    if (!resumoEl) {
      resumoEl = document.createElement('div');
      resumoEl.className = 'dj-resumo fg-resumo';
      resumoEl.setAttribute('role', 'dialog');
      resumoEl.setAttribute('aria-label', 'Resumo do incêndio');
      raiz.appendChild(resumoEl);
      resumoEl.addEventListener('click', (ev) => { if (ev.target.closest('[data-ok]')) resumoEl.hidden = true; });
    }
    const lin = (a, b, cls) => '<li' + (cls ? ' class="' + cls + '"' : '') + '><span>' + a + '</span><b>' + b + '</b></li>';
    resumoEl.innerHTML = '<h3>' + (run.bombeiros ? '🚒 Incêndio apagado pelos bombeiros' : '🧯 Incêndio apagado') + '</h3><ul>' +
      lin('Rack', esc(run.rack)) +
      lin('Tempo até apagar', dur(run.t), run.t <= C.RAPIDO ? 'is-good' : 'is-bad') +
      lin('Equipamentos danificados', run.danos.length ? run.danos.length + ' <small>(' + esc(run.danos.join(', ')) + ')</small>' : 'nenhum', run.danos.length ? 'is-bad' : 'is-good') +
      lin('Peças e limpeza', '−' + money(run.custo), 'is-bad') +
      (run.renda ? lin('Renda parada', '−' + money(run.renda) + '/min <small>até recuperar</small>', 'is-bad') : '') +
      (run.xp ? lin('Seu XP', '+' + run.xp + ' XP', 'is-good') : '') +
      '</ul>' + (run.danos.length ? '<p>Os equipamentos queimados estão em <b>Tarefas (T)</b>: troque a peça na bancada, refaça o cabo e configure no terminal (+' + C.XP_EQUIPAMENTO + ' XP cada).</p>' : '') +
      '<p>Para não acontecer de novo: ar de precisão perto do rack, menos servidores nele ou racks mais afastados.</p>' +
      '<button type="button" class="btn btn--sm btn--primary" data-ok>OK</button>';
    resumoEl.hidden = false;
    const ok = resumoEl.querySelector('[data-ok]');
    if (ok && !DL.MOBILE) ok.focus({ preventScroll: true });
  }
  addEventListener('keydown', (ev) => { if (resumoEl && !resumoEl.hidden && (ev.code === 'Escape' || ev.code === 'Enter')) { resumoEl.hidden = true; ev.preventDefault(); } });

  /* ================================================================== */
  /* 4. LIGAR NO JOGO                                                    */
  /* ================================================================== */
  // no fire and blackout together: a storm's lightning waits while a rack burns (weather.js tries again)
  if (D.blackout && D.blackout.lightning) {
    const baseRaio = D.blackout.lightning;
    D.blackout.lightning = function (force) { if (F.fire && !force) return false; return baseRaio.call(this, force); };
  }
  G.on('step', (dt) => {
    if (!(dt > 0) || G.guest || D.state.phase === 'intro') return;
    if (F.fire) passoFogo(dt);
    F.acc += dt;
    if (F.acc < 1) return;
    const sec = F.acc;
    F.acc = 0;
    if (F.cd > 0 && playing()) F.cd = Math.max(0, F.cd - sec);
    const list = calcular();
    const now = scene.t;
    for (const r of list) {
      if (!unidades(r)) { r.vermelho = 0; continue; }
      avisar(r, now);
      risco(r, sec);
    }
    // the alarm beep of a rack about to burn (only the worst one)
    const pior = list.reduce((w, r) => (estagio(r) >= 3 && (!w || r.vermelho > w.vermelho) ? r : w), null);
    F.beep -= sec;
    if (pior && !F.fire && F.beep <= 0 && dentro()) { F.beep = 3; G.sfx('alarmeCalor'); }
    F.rollAcc += sec;
    if (F.rollAcc >= C.SORTEIO) { F.rollAcc = 0; sortear(list); }
    // (units removed in build mode: a rack with nothing burnt left is clean again)
    for (const r of list) if (r.queimado) limparRack(r);
  });

  /* ---------- save (save-service.js) ---------- */
  const r1 = (v) => Math.round(v * 10) / 10;
  function snapshot() {
    const rs = [];
    for (const r of racks()) {
      if (!r.uid || !unidades(r)) continue;
      rs.push([r.uid, r1(r.tmon != null ? r.tmon : C.BASE), Math.round(r.vermelho || 0), r.seguro ? 1 : 0, r.queimado ? 1 : 0]);
    }
    const dmg = ops.devices().filter((d) => d.queimado).map((d) => [d.key, d.broken || d.out ? 1 : 0, d.estavaOnline ? 1 : 0]);
    const f = F.fire;
    return { v: 1, cd: Math.round(F.cd), racks: rs, dmg, fire: f && f.rack.uid ? { uid: f.rack.uid, t: Math.round(f.t), size: r1(f.size), prog: r1(f.prog), spread: f.spread, slot: f.slot } : null };
  }
  function restore(d) {
    // whatever was going stops first (a new game, another save)
    if (F.fire) { F.fire.rack.queimando = false; F.fire = null; G.emit('fogo', { on: false }); }
    hud(false);
    F.cd = 0; F.acc = 0; F.rollAcc = 0;
    for (const p of P) p.on = false;
    for (const r of racks()) { r.vermelho = 0; r.seguro = false; r.queimado = false; r.fuligem = 0; r.fumegando = 0; r.zonaAntes = 0; }
    for (const x of ops.devices()) { if (x.queimado) { x.queimado = false; x.fogoBackup = null; } }
    if (resumoEl) resumoEl.hidden = true;
    if (!d || typeof d !== 'object' || d.v !== 1) return;
    F.cd = Math.max(0, +d.cd || 0);
    const byUid = new Map(racks().map((r) => [r.uid, r]));
    for (const a of Array.isArray(d.racks) ? d.racks : []) {
      const r = byUid.get(a[0]);
      if (!r) continue;
      if (Number.isFinite(+a[1])) r.tmon = +a[1];
      r.vermelho = +a[2] || 0; r.seguro = !!a[3]; r.queimado = !!a[4]; r.zonaAntes = zona(r.tmon || C.BASE);
    }
    const st = staff();
    for (const a of Array.isArray(d.dmg) ? d.dmg : []) {
      const x = ops.get ? ops.get(a[0]) : ops.devices().find((y) => y.key === a[0]);
      if (!x) continue;
      x.queimado = true;
      x.estavaOnline = !!a[2];
      if (a[1] && st && st.breakItem && !x.broken) st.breakItem(x, { quiet: true });
    }
    const fr = d.fire && byUid.get(d.fire.uid);
    if (fr && unidades(fr)) {
      F.fire = { rack: fr, t: +d.fire.t || 0, size: clamp(+d.fire.size || 0.3, 0.1, 1), prog: clamp(+d.fire.prog || 0, 0, 0.95), spray: false, spread: Math.max(1, +d.fire.spread || 1), spreadT: 0, slot: +d.fire.slot || 0, n: Math.max(1, unidades(fr)), alarm: 0.5, crack: 0, hiss: 0, warned: false };
      fr.queimando = true;
      fr.fogoSlot = F.fire.slot;
      G.emit('fogo', { on: true, rack: fr });
      hud(true);
    }
    ops.render(true);
  }
  G.on('game-begin', () => restore(null));

  DL.Calor = {
    alvo: (r) => (r.calor ? r.calor.alvo : C.BASE),
    zona,
  };
  DL.Fogo = {
    alvo, snapshot, restore, painelHtml, tarefaHtml, tecnico, chamarTecnico, trocarPeca, bloqueio,
    get ativo() { return F.fire; },
    get descanso() { return F.cd; },
    get ultimo() { return F.last; },
    get _particulas() { let n = 0; for (const p of P) if (p.on) n++; return n; },
  };
})();
