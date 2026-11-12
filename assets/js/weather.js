/* DataLab — clima: chuva à noite e, às vezes, tempestade com raios e trovões.

   COMO FUNCIONA
     • A cada dia novo (06h, daynight.js) sorteia se vai chover naquela noite (DL.CLIMA.CHANCE_CHUVA) e com que
       força (chuva comum: fraca a média). A cada TEMPESTADE_A_CADA dias, sorteia se a noite tem TEMPESTADE
       (CHANCE_TEMPESTADE): forte, densa, inclinada pelo vento, com raios e trovões — e com apagão.
     • Só chove de noite (a partir de uma hora sorteada); ao amanhecer a chuva diminui devagar e para.
     • A chuva só se VÊ na rua. Dentro do data center e das lojas não cai nenhuma gota: só se ouve a chuva
       abafada (e o trovão abafado), e o clarão entra fraquinho. Entrar e sair: as gotas somem / aparecem em
       ~0,5 s e o som passa de nítido para abafado.
     • Lá fora: gotas em 3 camadas (longe, meio, perto), vento com rajadas, respingos, poças que crescem com
       ondinhas, e as luzes refletem no chão molhado (daynight.js: DL.DayNight.molhado).
     • Raios fracos (só um clarão ao longe), normais e muito fortes (raros): o raio desenhado no céu em pixel
       art, clarão duplo, sombras que vêm do raio por um instante (daynight.js), a tela treme, trovão grave com
       eco. O trovão chega depois do clarão: mais longe = mais atraso.
     • Apagão: toda tempestade tem um (APAGAO_TEMPESTADE = 1): um raio forte derruba a energia numa hora sorteada
       da noite (APAGAO_HORA). É o apagão de sempre (blackout.js), no mesmo instante do raio. Se não puder
       naquela hora (tutorial, outro problema aberto), tenta de novo no raio seguinte.
     • O jogador fica molhado na chuva (cabeça mais escura e brilhante, pingando); ao entrar, um 💧 em cima
       dele; seca devagar (20 a 40 s, mais se ficou muito tempo na chuva).
     • A equipe comenta no chat e em balões; no trovão alguns levam um susto (pulinho).
     • Um ícone pequeno ao lado do relógio mostra a chuva / tempestade enquanto chove.
     • O clima do dia é salvo junto com o jogo (save-service.js: campo "clima").

   PESO (o jogo tem que continuar leve)
     • Gotas, respingos e o desenho do raio usam listas de números de tamanho fixo (nada é criado por quadro)
       e fillRect (bem mais barato que um caminho com muitos retângulos).
     • Escurecer a cena não pinta nada a mais: o dia/noite já tinge a tela, a cor só fica mais escura.
     • A quantidade de gotas cai sozinha se o FPS cair (W.q), e começa menor no celular.
     • Sem chuva (ou dentro do prédio), nenhuma gota é calculada nem desenhada.

   Não há atalho para escolher o clima: é sempre o sorteio do dia. */
(function () {
  'use strict';
  const DL = window.DL, D = window.DataLabDemo;
  if (!DL || !D || !DL.DayNight) return;
  const G = D.game, scene = D.scene;

  // ===================== AJUSTES (fácil de mudar) =====================
  DL.CLIMA = {
    CHANCE_CHUVA: 0.3,        // chance de chover na noite de cada dia (0.3 = 30%)
    TEMPESTADE_A_CADA: 2,     // a cada quantos dias pode ter tempestade
    CHANCE_TEMPESTADE: 0.35,  // chance de ter tempestade nesse dia (e toda tempestade tem apagão)
    COMECA: [18.3, 20.5],     // a chuva começa numa hora sorteada entre estas (de noite)
    SUBIR: 14,                // segundos (velocidade normal) para a chuva chegar à força total
    DESCER: 16,               // segundos para a chuva parar de vez ao amanhecer
    FORCA_CHUVA: [0.4, 0.75], // chuva comum: força sorteada entre fraca e média (a tempestade é 1)
    GOTAS: 620,               // gotas na tela com força 1 (1440×900, qualidade máxima)
    VENTO_CHUVA: 0.08,        // inclinação da chuva comum (0 = reta)
    VENTO_TEMPESTADE: 0.42,   // …e da tempestade
    RAJADA: 0.18,             // quanto as rajadas mudam a inclinação (na tempestade; metade disso na chuva)
    ESCURO_CHUVA: 0.12,       // quanto a cena escurece na chuva (0 = nada, 1 = preto)
    ESCURO_TEMPESTADE: 0.28,  // …e na tempestade
    ESCURO_DENTRO: 0.35,      // dentro do prédio escurece só esta parte
    TRANSICAO: 0.5,           // segundos para as gotas aparecerem / sumirem ao sair / entrar
    RAIO: [6, 25],            // segundos entre um raio e outro (sorteado)
    RAIO_FRACO: 0.4,          // parte dos raios que são fracos (só clarão ao longe)
    RAIO_FORTE: 0.12,         // parte dos raios que são muito fortes (raros)
    TROVAO_ATRASO: { fraco: [1.3, 2], normal: [0.6, 1.4], forte: [0.3, 0.7] }, // segundos do clarão ao trovão
    APAGAO_TEMPESTADE: 1,     // chance de uma tempestade ter um raio que derruba a energia (1 = sempre)
    APAGAO_HORA: [20.5, 27],  // o apagão da tempestade vem numa hora sorteada entre estas (27 = 03h)
    APAGAO_RAIO_FORTE: 0.6,   // chance de um raio muito forte derrubar a energia (no máximo um apagão por noite)
    MOLHAR: 25,               // segundos de chuva comum para o jogador ficar encharcado (tempestade: metade)
    SECAR: [20, 40],          // segundos para secar: pouco molhado … encharcado
    FPS_BAIXO: 40,            // abaixo disso, menos gotas
    FPS_BOM: 55,              // acima disso, as gotas voltam aos poucos
  };
  const C = DL.CLIMA;
  const reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  /* ================================================================== */
  /* 1. O ESTADO E AS REGRAS                                            */
  /* ================================================================== */
  const W = {
    dia: 0,            // quantos dias se passaram neste jogo (conta as viradas das 06h)
    ultDias: 0,        // o contador do daynight.js na última olhada
    chuva: false,      // vai chover (ou está chovendo) na noite de hoje
    tempestade: false, // …e é tempestade
    intensidade: 0.6,  // força da chuva comum de hoje (FORCA_CHUVA)
    inicio: 19,        // a hora em que a chuva começa
    apagaoMarcado: false, // esta tempestade vai ter um raio que derruba a energia
    apagaoHora: 23,    // …a partir desta hora (6 a 30)
    apagou: false,     // um raio já derrubou a energia nesta noite
    apagaoRaio: false, // o apagão de agora foi um raio (para a fala quando a luz volta)
    nivel: 0,          // a chuva agora, 0 (seco) a 1
    forca: 0,          // quanto dessa chuva é tempestade, 0 a 1 (muda devagar também)
    molhado: 0,        // o chão molhado (poças, reflexos): sobe com a chuva e seca devagar depois
    fora: 0,           // as gotas na tela: 1 na rua, 0 dentro (vai e volta em TRANSICAO segundos)
    jogador: 0,        // o jogador molhado, 0 a 1
    pico: 0,           // o mais molhado que ele ficou desde que começou a secar (decide o tempo para secar)
    raioT: 8,          // segundos até o próximo raio
    flash: 0,          // o clarão na tela agora (0 a 1)
    tremor: 0,         // segundos de tela tremendo (raio muito forte)
    q: DL.MOBILE ? 0.55 : 1, // qualidade (quantidade de gotas), ajustada pelo FPS
    fps: 60,
    custo: 0,          // ms por quadro que o clima gasta desenhando (média; só para conferir)
    falouChuva: false, falouTempestade: false, falouParou: true,
    falaT: 30,         // segundos até um comentário solto sobre a chuva
  };

  const hora = () => DL.DayNight.luz().h;           // 6 a 30 (passa de 24 de madrugada)
  const ehNoite = () => DL.DayNight.periodo === 'noite';
  const jogando = () => D.state.phase === 'play' && !(DL.Street && DL.Street.inIntro);
  // o jogador está na rua (e não numa loja nem no data center)
  const naRua = () => !!(DL.Street && DL.Street.outside && !DL.Street.place);

  // o sorteio do dia (às 06h): chuva hoje à noite? de que força? tempestade? com apagão?
  function sortear() {
    const diaDeTempestade = (W.dia % C.TEMPESTADE_A_CADA) === C.TEMPESTADE_A_CADA - 1;
    W.tempestade = diaDeTempestade && Math.random() < C.CHANCE_TEMPESTADE;
    W.chuva = W.tempestade || Math.random() < C.CHANCE_CHUVA; // (tempestade é chuva também)
    W.intensidade = rand(C.FORCA_CHUVA[0], C.FORCA_CHUVA[1]);
    W.inicio = rand(C.COMECA[0], C.COMECA[1]);
    marcarApagao();
    W.apagou = false;
    W.falouChuva = W.falouTempestade = false;
  }
  // a tempestade de hoje tem apagão? se tiver, a que horas (depois que a tempestade começou)
  function marcarApagao() {
    W.apagaoMarcado = W.tempestade && Math.random() < C.APAGAO_TEMPESTADE;
    W.apagaoHora = Math.max(W.inicio + 0.6, rand(C.APAGAO_HORA[0], C.APAGAO_HORA[1]));
  }

  // a força que a chuva quer ter agora: só de noite, depois da hora sorteada
  function alvo() {
    if (!W.chuva || !ehNoite()) return 0;
    return hora() >= W.inicio ? 1 : 0;
  }
  // quanto chove de verdade (0 a 1): chuva comum vai até a força do dia, tempestade até 1
  const chuvaAgora = () => W.nivel * (W.intensidade + (1 - W.intensidade) * W.forca);

  function passo(dt) {
    if (!(dt > 0)) return;
    // um dia novo? (o daynight.js conta as viradas das 06h)
    const d = DL.DayNight.dias;
    if (d !== W.ultDias) {
      if (d > W.ultDias) { W.dia += d - W.ultDias; sortear(); }
      W.ultDias = d;
    }
    if (!jogando()) { somDaChuva(0); return; }
    const v = 1, quer = alvo();
    // sobe e desce aos poucos (mais rápido quando o tempo está acelerado)
    if (W.nivel < quer) W.nivel = Math.min(quer, W.nivel + (dt * v) / C.SUBIR);
    else if (W.nivel > quer) W.nivel = Math.max(quer, W.nivel - (dt * v) / C.DESCER);
    const querForca = W.tempestade && W.nivel > 0 ? 1 : 0;
    W.forca += clamp(querForca - W.forca, -dt * v / 10, dt * v / 10);
    // o chão molha com a chuva e seca devagar (umas 3× mais devagar do que a chuva para)
    const ch = chuvaAgora();
    if (W.molhado < W.nivel) W.molhado = Math.min(W.nivel, W.molhado + dt * v / 8);
    else W.molhado = Math.max(W.nivel, W.molhado - dt * v / (C.DESCER * 3));
    molharJogador(dt, ch);
    escurecer();
    raios(dt);
    pulos(dt);
    conversa(dt);
    somDaChuva(ch);
  }

  /* ---------- o jogador molhado ---------- */
  function molharJogador(dt, ch) {
    if (naRua() && ch > 0.03) {
      W.jogador = Math.min(1, W.jogador + (dt * ch * (1 + W.forca)) / C.MOLHAR);
      W.pico = Math.max(W.pico, W.jogador);
    } else if (W.jogador > 0) {
      // seca: SECAR[0] s se estava pouco molhado … SECAR[1] s se estava encharcado
      const tempo = C.SECAR[0] + (C.SECAR[1] - C.SECAR[0]) * W.pico;
      W.jogador = Math.max(0, W.jogador - (dt * Math.max(0.05, W.pico)) / tempo);
      if (W.jogador === 0) W.pico = 0;
    }
  }
  // entrou molhado num prédio: uma gotinha em cima dele por uns segundos
  G.on('sala', (s) => {
    if (!s || s.de !== 'rua' || s.para === 'rua' || W.jogador < 0.12 || !D.player) return;
    D.player.bubble = { text: '💧', left: 3.5, tone: 'chat' };
  });
  // a cabeça molhada: a parte de cima do personagem mais escura e azulada (só nos pixels dele), um brilho
  // no cabelo e gotinhas pingando. Desenhado junto com ele (DL.charFx), na profundidade certa.
  const CABECA = 17; // linhas de cima do quadro 22×31 (cabelo e cabeça)
  const tingidos = new WeakMap();
  function cabecaMolhada(frame) {
    let c = tingidos.get(frame);
    if (c) return c;
    c = DL.mk(frame.width, CABECA);
    const g = c.getContext('2d');
    g.drawImage(frame, 0, 0);
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(12,26,70,0.55)';
    g.fillRect(0, 0, frame.width, 11);
    g.fillStyle = 'rgba(12,26,70,0.25)';
    g.fillRect(0, 11, frame.width, CABECA - 11);
    tingidos.set(frame, c);
    return c;
  }
  const pingos = [{ v: false, x: 0, y: 0 }, { v: false, x: 0, y: 0 }, { v: false, x: 0, y: 0 }];
  let pingoT = 0, pingoUlt = 0;
  const baseFx = DL.charFx;
  DL.charFx = function (g, a, X, Y, t) {
    if (baseFx) baseFx(g, a, X, Y, t);
    if (a !== D.player || W.jogador < 0.02 || !a.frame) return;
    const C2 = DL.CHAR, f = a.frame();
    if (!f) return;
    const ga = g.globalAlpha, k = Math.min(1, W.jogador * 1.3);
    g.globalAlpha = ga * k * 0.85;
    g.drawImage(cabecaMolhada(f), X - C2.AX, Y - C2.AY);
    // o brilho de cabelo molhado (pisca devagar)
    g.globalAlpha = ga * k * (reduced ? 0.7 : 0.55 + 0.35 * Math.sin(t * 2.3));
    g.fillStyle = '#dcebff';
    g.fillRect(X - 3, Y - 23, 2, 1);
    g.fillRect(X + 2, Y - 22, 1, 1);
    // as gotinhas: nascem dos lados da cabeça e caem até o chão
    const dt = Math.min(0.1, Math.max(0, t - pingoUlt));
    pingoUlt = t;
    if (!reduced) {
      pingoT -= dt * (0.6 + 2 * W.jogador);
      if (pingoT <= 0) {
        pingoT = rand(0.6, 1.6);
        const p = pingos.find((q) => !q.v);
        if (p) { p.v = true; p.x = Math.random() < 0.5 ? -5 : 4; p.y = -16 + Math.floor(Math.random() * 3); }
      }
      g.fillStyle = '#9cc6ff';
      for (const p of pingos) {
        if (!p.v) continue;
        p.y += dt * 46;
        if (p.y >= -1) { p.v = false; continue; }
        g.globalAlpha = ga * k;
        g.fillRect(X + p.x, Math.round(Y + p.y), 1, 2);
      }
    }
    g.globalAlpha = ga;
  };

  /* ---------- raios e trovões ---------- */
  const trovoes = [];   // trovões esperando para tocar: { t, tipo }
  const flashes = [];   // clarões marcados (raio duplo): [segundos, força]
  function raios(dt) {
    for (let i = flashes.length - 1; i >= 0; i--) {
      const f = flashes[i];
      if ((f[0] -= dt) > 0) continue;
      W.flash = Math.max(W.flash, f[1]);
      if (f[2]) boltF = Math.max(boltF, 2); // o raio aparece de novo na segunda piscada
      flashes.splice(i, 1);
    }
    for (let i = trovoes.length - 1; i >= 0; i--) {
      const t = trovoes[i];
      if ((t.t -= dt) > 0) continue;
      trovoes.splice(i, 1);
      trovao(t.tipo);
    }
    if (W.forca < 0.5 || W.nivel < 0.35) return;
    if ((W.raioT -= dt) > 0) return;
    W.raioT = rand(C.RAIO[0], C.RAIO[1]);
    // a tempestade com apagão: passada a hora sorteada, o próximo raio é o que derruba a energia
    // (se não puder agora — tutorial, outro problema aberto —, tenta de novo no raio seguinte)
    if (W.apagaoMarcado && !W.apagou && W.forca > 0.8 && hora() >= W.apagaoHora) { raio('forte', 'tempestade'); return; }
    const r = Math.random();
    raio(r < C.RAIO_FRACO ? 'fraco' : r > 1 - C.RAIO_FORTE ? 'forte' : 'normal', false);
  }
  // um raio: o clarão agora, o trovão daqui a pouco; às vezes derruba a energia (apagao: com certeza)
  function raio(tipo, apagao) {
    tipo = tipo === 'fraco' || tipo === 'forte' ? tipo : 'normal';
    let cai = !!apagao;
    if (!cai && tipo === 'forte' && !W.apagou && Math.random() < C.APAGAO_RAIO_FORTE) cai = true;
    const B = D.blackout;
    let apagouAgora = false;
    if (cai && B && B.lightning && !W.apagou) {
      apagouAgora = B.lightning(apagao === true);
      if (apagouAgora) { W.apagou = true; W.apagaoRaio = true; tipo = 'forte'; }
    }
    const forte = tipo === 'forte';
    W.flash = tipo === 'fraco' ? 0.4 : forte ? 1 : 0.75;
    if (tipo !== 'fraco') gerarRaio(forte);
    // piscadas: o forte pisca duas ou três vezes, o normal às vezes duas
    if (forte) { flashes.push([rand(0.08, 0.14), 0.85, true]); if (Math.random() < 0.5) flashes.push([rand(0.22, 0.32), 0.6, false]); }
    else if (tipo === 'normal' && Math.random() < 0.35) flashes.push([rand(0.1, 0.25), 0.6, true]);
    if (forte && !reduced) W.tremor = 0.45;
    // o trovão: o que derrubou a energia caiu aqui do lado (estrondo no mesmo instante)
    const A = C.TROVAO_ATRASO[tipo];
    trovoes.push({ t: apagouAgora ? 0.02 : rand(A[0], A[1]), tipo });
    if (apagouAgora) {
      falar('raioApagao', 0.7, true);
      falar('raioApagao', rand(2, 3), true);
    }
  }
  function trovao(tipo) {
    const dentro = !naRua();
    const nome = tipo === 'forte' ? 'trovaoForte' : tipo === 'fraco' ? 'trovaoLonge' : 'trovao';
    const vol = tipo === 'forte' ? 1 : tipo === 'fraco' ? 0.6 : 0.85;
    // de dentro do prédio: mais baixo e abafado (só os graves passam pelas paredes)
    DL.audio.play(nome, dentro ? { vol: vol * 0.6, lp: 380, keep: 7000 } : { vol, keep: 7000 });
    if (tipo === 'forte') susto(3, true);
    else if (tipo === 'normal') susto(1 + (Math.random() < 0.5 ? 1 : 0), Math.random() < 0.3);
    else if (Math.random() < 0.3) susto(1, false);
  }
  // quando a luz volta depois de um apagão de raio
  G.on('blackout', (info) => {
    if (!info || info.on || !W.apagaoRaio) return;
    W.apagaoRaio = false;
    falar('voltou', rand(3, 4.5), true);
  });

  /* ---------- a equipe ---------- */
  const FALAS = {
    chuva: ['Tá chovendo!', 'Olha a chuva lá fora!', 'Começou a chover… e eu sem guarda-chuva.', 'Chuva! Ainda bem que o data center é bem vedado.', 'Ouviram? Tá chovendo no telhado.'],
    frio: ['Ai, que frio.', 'Alguém liga o aquecedor? Brrr.', 'Ar-condicionado + chuva = congelando aqui.', 'Ai, que frio… cadê meu café?'],
    tempestade: ['Vai ter raio, cuidado com os servidores!', 'Tempestade chegando… alguém confere o nobreak?', 'Que céu feio. Bora salvar tudo!', 'Se cair raio, o para-raios aguenta, né?'],
    susto: ['Que susto!', 'AI!', 'Credo!', '😱', 'Nossa!', 'Eita!'],
    sustoChat: ['Que susto! Esse foi perto.', 'Meu coração… que trovão!', 'Esse trovão sacudiu o rack!', 'Alguém mais pulou da cadeira?'],
    raioApagao: ['Esse raio caiu perto!', 'Foi o raio!', 'O raio pegou a rede da rua!', 'Caiu um raio aqui do lado!!', 'Eu vi o clarão… foi o raio!'],
    voltou: ['Ufa, a luz voltou! Que raio foi aquele…', 'Voltou! Nunca mais reclamo do barulho do gerador.', 'Energia de volta. Alguém confere se os servidores aguentaram o raio?'],
    solto: ['Essa chuva não para, hein.', 'Barulhinho bom de chuva pra trabalhar.', 'Quem veio de bicicleta hoje se deu mal.', 'Tomara que não alague a rua.'],
    parou: ['Parou de chover. Ufa!', 'Amanheceu e a chuva foi embora.', 'O sol voltou! A rua tá toda molhada.'],
  };
  const ultima = {};
  function frase(k) {
    const l = FALAS[k];
    let s = l[Math.floor(Math.random() * l.length)];
    if (s === ultima[k] && l.length > 1) s = l[(l.indexOf(s) + 1) % l.length];
    return (ultima[k] = s);
  }
  // quem pode falar: na equipe, trabalhando hoje, visível
  function acordados() {
    const cr = D.crew;
    if (!cr || !cr.members) return [];
    return cr.members.filter((a) => a && a.crew && !a.crew.off && !a.hidden && Number.isFinite(a.x));
  }
  const noApagao = () => !!(D.blackout && D.blackout.state && D.blackout.state.phase !== 'idle');
  let ultimoFalante = null;
  // sempre: fala mesmo durante o apagão (o comentário do raio, o alívio quando a luz volta)
  function falar(k, depois, sempre) {
    const cr = D.crew, gente = acordados();
    if (!cr || !cr.chat || !gente.length || (noApagao() && !sempre)) return;
    const pool = gente.length > 1 ? gente.filter((a) => a !== ultimoFalante) : gente;
    const a = pool[Math.floor(Math.random() * pool.length)];
    ultimoFalante = a;
    const msg = frase(k), tom = k === 'tempestade' || k === 'raioApagao' ? 'warn' : k === 'voltou' ? 'ok' : 'chat';
    const diz = () => { if (acordados().includes(a) && (sempre || !noApagao())) cr.chat.post(a, msg, { tone: tom }); };
    if (depois) cr.chat.later(depois, diz);
    else diz();
  }
  function conversa(dt) {
    if (G.paused && G.paused()) return;
    if (W.nivel > 0.3 && !W.falouChuva) {
      W.falouChuva = true;
      W.falouParou = false;
      falar('chuva');
      if (Math.random() < 0.6) falar('frio', rand(2.5, 4.5));
      W.falaT = rand(45, 80);
    }
    if (W.forca > 0.5 && W.nivel > 0.4 && !W.falouTempestade) {
      W.falouTempestade = true;
      falar('tempestade', 1.5);
    }
    // de vez em quando, um comentário solto (sem encher o chat)
    if (W.nivel > 0.6 && (W.falaT -= dt) <= 0) {
      W.falaT = rand(60, 110);
      const cr = D.crew;
      if (cr && cr.chat && (!cr.chat.ambientReady || cr.chat.ambientReady())) {
        falar(Math.random() < 0.5 ? 'solto' : 'frio');
        if (cr.chat.ambientUsed) cr.chat.ambientUsed(30);
      }
    }
    // parou (de manhã)
    if (!W.falouParou && W.nivel === 0 && !ehNoite()) {
      W.falouParou = true;
      falar('parou', 1);
    }
  }
  // o susto do trovão: n pessoas (na sala do jogador) dão um pulinho e param um instante
  const PULO = 0.34, pulando = [];
  function susto(n, noChat) {
    if (noApagao()) return;
    const gente = acordados().filter((a) => !DL.Street || !DL.Street.naSala || DL.Street.naSala(a));
    if (!gente.length) return;
    n = Math.min(gente.length, n);
    for (let k = 0; k < n; k++) {
      const a = gente.splice(Math.floor(Math.random() * gente.length), 1)[0];
      const c = a.crew, sentado = c.seated || c.state === 'sitting' || c.state === 'standing' || c.state === 'working';
      if (!a.bubble || a.bubble.left < 1) a.bubble = { text: frase('susto'), left: 1.6, tone: 'warn' };
      if (sentado || reduced) continue;
      c.talkT = Math.max(c.talkT || 0, 0.7); // para um instante (crew.js: parado enquanto talkT > 0)
      if (!pulando.some((p) => p.a === a)) pulando.push({ a, t: 0 });
    }
    if (noChat) falar('sustoChat', rand(0.8, 1.6));
  }
  function pulos(dt) {
    for (let i = pulando.length - 1; i >= 0; i--) {
      const p = pulando[i];
      p.t += dt;
      if (p.t >= PULO) { p.a.z = 0; pulando.splice(i, 1); continue; }
      p.a.z = Math.round(Math.sin((Math.PI * p.t) / PULO) * 5);
    }
  }

  /* ---------- o som ---------- */
  let somAcc = 0, somUlt = -1, somDentro = null;
  function somDaChuva(n) {
    if (!DL.audio || !DL.audio.chuva) return;
    const dentro = !naRua(), alvoSom = Math.min(1, n * (0.85 + 0.3 * W.forca));
    somAcc++;
    if (Math.abs(alvoSom - somUlt) < 0.02 && dentro === somDentro && !(alvoSom === 0 && somUlt !== 0)) return;
    if (somAcc < 6 && alvoSom !== 0 && dentro === somDentro) return; // (no máximo umas 10 vezes por segundo)
    somAcc = 0;
    somUlt = alvoSom;
    somDentro = dentro;
    DL.audio.chuva(alvoSom, dentro);
  }

  /* ---------- o que vai para o dia/noite: a cena mais escura, o chão molhado ---------- */
  let escuroUlt = -1, molhadoUlt = -1;
  function escurecer() {
    const k = W.nivel * (C.ESCURO_CHUVA + (C.ESCURO_TEMPESTADE - C.ESCURO_CHUVA) * W.forca);
    if (Math.abs(k - escuroUlt) >= 0.002) { escuroUlt = k; DL.DayNight.escurecer(k, k * C.ESCURO_DENTRO); }
    if (DL.DayNight.molhado && Math.abs(W.molhado - molhadoUlt) >= 0.01) { molhadoUlt = W.molhado; DL.DayNight.molhado(W.molhado); }
  }

  /* ================================================================== */
  /* 2. O DESENHO                                                       */
  /* ================================================================== */
  // As gotas: listas de números de tamanho fixo. Posições em pixels da tela. gp = camada (0 longe, 1 meio, 2 perto)
  const MAX = 900;
  const gx = new Float32Array(MAX), gy = new Float32Array(MAX), gv = new Float32Array(MAX), gl = new Float32Array(MAX), gc = new Float32Array(MAX), gp = new Uint8Array(MAX);
  const CAMADAS = [
    { parte: 0.4, vel: [360, 440], len: [2.5, 3.5], cor: 'rgba(140,165,215,0.24)', ped: 1 },
    { parte: 0.35, vel: [520, 620], len: [4, 6], cor: 'rgba(170,196,240,0.36)', ped: 2 },
    { parte: 0.25, vel: [720, 880], len: [7.5, 11], cor: 'rgba(214,230,255,0.55)', ped: 3 },
  ];
  // os respingos no chão
  const MAXR = 120;
  const rx = new Float32Array(MAXR), ry = new Float32Array(MAXR), rt = new Float32Array(MAXR);
  let rNext = 0;
  const RESPINGO = 0.24; // segundos de vida de um respingo
  let ativas = 0, telaW = 0, telaH = 0, inclin = 0;

  function nascer(i, cw, ch, espalhar) {
    const r = Math.random(), c = r < CAMADAS[0].parte ? 0 : r < CAMADAS[0].parte + CAMADAS[1].parte ? 1 : 2, K = CAMADAS[c];
    gp[i] = c;
    const dpr = scene.dpr || 1;
    gv[i] = rand(K.vel[0], K.vel[1]) * dpr;
    gl[i] = rand(K.len[0], K.len[1]);                      // comprimento em pixels do mapa
    gc[i] = ch * rand(0.2, 1.05);                          // onde cai no chão (respingo)
    const desvio = Math.max(0, inclin) * ch;               // com vento as gotas andam para o lado: começam mais à esquerda
    gx[i] = rand(-desvio - 20, cw + 20);
    gy[i] = espalhar ? rand(-ch * 0.2, gc[i]) : rand(-ch * 0.25, -10);
  }

  // a qualidade segue o FPS (medido aqui mesmo, entre um desenho e outro)
  let fpsAcc = 0, fpsN = 0, ultimoQuadro = performance.now();
  function medirFps(dtReal) {
    fpsAcc += dtReal; fpsN++;
    if (fpsAcc < 2) return;
    W.fps = fpsN / fpsAcc;
    fpsAcc = 0; fpsN = 0;
    if (ativas < 20) return; // (só ajusta enquanto há chuva na tela: é o custo dela que muda)
    if (W.fps < C.FPS_BAIXO) W.q = Math.max(0.25, W.q - 0.15);
    else if (W.fps > C.FPS_BOM) W.q = Math.min(1, W.q + 0.05);
  }

  // as poças: elipses achatadas em pixel art, cada uma em 3 tamanhos (crescem com o chão molhado)
  function pocaArt(w, h) {
    w = Math.max(4, Math.round(w)); h = Math.max(2, Math.round(h));
    const c = DL.mk(w, h), g = c.getContext('2d');
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const dx = (x + 0.5 - w / 2) / (w / 2), dy = (y + 0.5 - h / 2) / (h / 2), d = dx * dx + dy * dy;
      if (d > 1) continue;
      g.fillStyle = d > 0.62 ? 'rgba(120,150,205,0.55)' : y < h / 2 - 0.5 ? 'rgba(170,200,245,0.5)' : 'rgba(70,95,150,0.55)';
      g.fillRect(x, y, 1, 1);
    }
    g.fillStyle = 'rgba(235,245,255,0.75)';
    g.fillRect(Math.round(w * 0.3), Math.min(1, h - 1), Math.max(1, Math.round(w * 0.25)), 1);
    return c;
  }
  const POCAS_ART = [[16, 5], [24, 8], [12, 4], [30, 9]].map(([w, h]) => [pocaArt(w * 0.45, h * 0.6), pocaArt(w * 0.72, h * 0.8), pocaArt(w, h)]);
  let POCAS = null;
  function lugaresDasPocas() {
    const L = DL.Street && DL.Street.luz, WK = DL.Street && DL.Street.WALK;
    if (!L || !WK) return [];
    const T = L.T, out = [];
    for (let i = 0; i < 26; i++) {
      const naCalcada = i < 11;
      const x = naCalcada ? (WK.x0 + 1 + DL.hash(i * 13 + 7) * (WK.x1 - WK.x0 - 1)) * T : (L.DOOR_X - 28 + DL.hash(i * 17 + 3) * 56) * T;
      const y = naCalcada ? (WK.y0 + 0.4 + DL.hash(i * 31 + 5) * (WK.y1 - WK.y0 + 0.2)) * T : (L.ROWS.road0 + 0.6 + DL.hash(i * 7 + 11) * (L.ROWS.road1 - L.ROWS.road0)) * T;
      out.push({ X: L.IX(x, y), Y: L.IY(x, y, 0), arts: POCAS_ART[i % POCAS_ART.length], f: DL.hash(i * 3 + 1) });
    }
    return out;
  }
  function desenharPocas(g, sc) {
    if (W.molhado < 0.03) return;
    if (!POCAS) POCAS = lugaresDasPocas();
    const S = sc.S, vx = sc.ox / S, vy = sc.oy / S, vw = sc.canvas.width / S, vh = sc.canvas.height / S, t = sc.t;
    const tam = W.molhado < 0.35 ? 0 : W.molhado < 0.7 ? 1 : 2, a = Math.min(1, W.molhado * 1.4);
    const ondas = W.nivel > 0.1 && !reduced, chove = chuvaAgora();
    g.save();
    g.setTransform(S, 0, 0, S, -sc.ox, -sc.oy);
    g.imageSmoothingEnabled = false;
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = '#dce9ff';
    for (const p of POCAS) {
      const art = p.arts[tam], w = art.width, h = art.height;
      if (p.X + w < vx || p.X - w > vx + vw || p.Y + h < vy || p.Y - h > vy + vh) continue;
      g.globalAlpha = a;
      g.drawImage(art, Math.round(p.X - w / 2), Math.round(p.Y - h / 2));
      if (!ondas) continue;
      // ondinhas: anéis que abrem (dois por poça, desencontrados; mais depressa com mais chuva)
      for (let j = 0; j < 2; j++) {
        const k = (t * (0.9 + 1.4 * chove) + p.f * 7 + j * 0.5) % 1;
        if (k > 0.7) continue;
        const r = 1 + Math.floor(k * (w / 3)), ry2 = Math.max(1, Math.round(r * h / w));
        const cx = Math.round(p.X + (DL.hash(p.f * 97 + j + Math.floor(t * 0.9 + p.f * 7 + j * 0.5)) - 0.5) * w * 0.5), cy = Math.round(p.Y);
        g.globalAlpha = a * (0.75 - k);
        g.fillRect(cx - r, cy, 1, 1); g.fillRect(cx + r, cy, 1, 1);
        g.fillRect(cx, cy - ry2, 1, 1); g.fillRect(cx, cy + ry2, 1, 1);
        if (r > 2) { g.fillRect(cx - r + 1, cy - 1, 1, 1); g.fillRect(cx + r - 1, cy - 1, 1, 1); g.fillRect(cx - r + 1, cy + 1, 1, 1); g.fillRect(cx + r - 1, cy + 1, 1, 1); }
      }
    }
    g.restore();
  }

  // o raio no céu: segmentos (x0, y0, x1, y1, grossura) num pedaço fixo de memória; aparece por 2–4 quadros
  const MAXS = 96, segs = new Float32Array(MAXS * 5);
  let nSegs = 0, boltF = 0, boltDx = 0;
  function seg(x0, y0, x1, y1, w) { if (nSegs >= MAXS) return; const o = nSegs++ * 5; segs[o] = x0; segs[o + 1] = y0; segs[o + 2] = x1; segs[o + 3] = y1; segs[o + 4] = w; }
  function gerarRaio(forte) {
    const cw = scene.canvas.width, ch = scene.canvas.height, b = Math.max(1, Math.round(scene.S));
    nSegs = 0;
    let x = rand(0.15, 0.85) * cw, y = -b;
    boltDx = clamp((0.5 - x / cw) * 2, -1, 1); // sombras para o lado contrário do raio
    const fundo = ch * rand(0.32, 0.5) * (forte ? 1.25 : 1);
    while (y < fundo && nSegs < MAXS) {
      const ny = y + rand(4, 9) * b, nx = x + rand(-5, 5) * b;
      seg(x, y, nx, ny, forte ? 2 : 1);
      if (Math.random() < (forte ? 0.4 : 0.22)) {
        // um galho: desce de lado e afina
        let bx = nx, by = ny;
        const lado = Math.random() < 0.5 ? -1 : 1, n = 2 + Math.floor(Math.random() * (forte ? 5 : 3));
        for (let k = 0; k < n && nSegs < MAXS; k++) { const ex = bx + lado * rand(2, 6) * b, ey = by + rand(3, 7) * b; seg(bx, by, ex, ey, 1); bx = ex; by = ey; }
      }
      x = nx; y = ny;
    }
    boltF = reduced ? 1 : forte ? 4 : 3;
  }
  function desenharRaio(g, b, alfa) {
    // o brilho em volta e o miolo, em degraus de pixel
    for (let passe = 0; passe < 2; passe++) {
      g.fillStyle = passe ? 'rgba(250,252,255,' + alfa.toFixed(3) + ')' : 'rgba(150,175,255,' + (0.35 * alfa).toFixed(3) + ')';
      for (let i = 0; i < nSegs; i++) {
        const o = i * 5, x0 = segs[o], y0 = segs[o + 1], dx = segs[o + 2] - x0, dy = segs[o + 3] - y0, w = segs[o + 4] * b;
        const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / b));
        for (let s = 0; s <= n; s++) {
          const px = Math.round((x0 + (dx * s) / n) / b) * b, py = Math.round((y0 + (dy * s) / n) / b) * b;
          if (passe) g.fillRect(px, py, w, b);
          else g.fillRect(px - b, py - b, w + 2 * b, 3 * b);
        }
      }
    }
  }

  // quanto o clima custa por quadro (ms, média): DL.Clima.estado.custo
  let custoAcc = 0, custoN = 0, elJogo = null;
  function desenhar() {
    const t0 = performance.now();
    desenharTudo();
    if (ativas || W.flash || boltF) { custoAcc += performance.now() - t0; custoN++; if (custoN >= 120) { W.custo = custoAcc / custoN; custoAcc = custoN = 0; } }
  }
  function tremer(dtReal) {
    const cv = scene.canvas;
    if (W.tremor > 0) {
      W.tremor = Math.max(0, W.tremor - dtReal);
      const a = (W.tremor / 0.45) * 3;
      cv.style.transform = W.tremor > 0 ? 'translate(' + Math.round(rand(-a, a)) + 'px,' + Math.round(rand(-a, a)) + 'px)' : '';
    }
  }
  function desenharTudo() {
    const agora = performance.now(), dtReal = Math.min(0.1, (agora - ultimoQuadro) / 1000);
    ultimoQuadro = agora;
    medirFps(dtReal);
    tremer(dtReal);
    W.flash = W.flash > 0.01 ? W.flash * Math.exp(-dtReal * (reduced ? 6 : 12)) : 0;
    // as gotas aparecem / somem aos poucos: só na rua, e não durante a passagem pela porta
    const querFora = naRua() && !(DL.Street && DL.Street.busy) ? 1 : 0;
    W.fora += clamp(querFora - W.fora, -dtReal / C.TRANSICAO, dtReal / C.TRANSICAO);
    // as sombras do clarão (daynight.js), só na rua
    if (DL.DayNight.relampago) DL.DayNight.relampago(naRua() ? W.flash * (boltF || W.flash > 0.3 ? 1 : 0.5) : 0, boltDx);
    if (W.nivel < 0.004 && W.flash === 0 && !boltF) { ativas = 0; return; }
    if (!jogando()) return;
    const jogo = elJogo || (elJogo = document.getElementById('game'));
    if (jogo && (jogo.classList.contains('is-title') || jogo.classList.contains('is-build'))) return;
    const g = scene.ctx, cw = scene.canvas.width, ch = scene.canvas.height;
    const rua = naRua(), b = Math.max(1, Math.round(scene.S));
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.imageSmoothingEnabled = false;

    // DENTRO do prédio: nenhuma gota (só o som abafado e um clarão fraquinho pela janela)
    if (rua && W.fora > 0.01 && W.nivel > 0.004) {
      // quantas gotas: tamanho da tela × quanto chove × qualidade
      const area = clamp((cw * ch) / ((scene.dpr || 1) * (scene.dpr || 1) * 1440 * 900), 0.35, 1.6);
      const quer = Math.min(MAX, Math.round(C.GOTAS * area * chuvaAgora() * W.q));
      // o vento: inclinação de base + rajadas (três ondas lentas somadas), muito mais na tempestade
      const t = scene.t;
      const rajada = reduced ? 0 : 0.5 * Math.sin(t * 0.31) + 0.3 * Math.sin(t * 0.83 + 1.3) + 0.2 * Math.sin(t * 2.1 + 0.4);
      inclin = C.VENTO_CHUVA + (C.VENTO_TEMPESTADE - C.VENTO_CHUVA) * W.forca + rajada * C.RAJADA * (0.5 + 0.5 * W.forca);
      if (cw !== telaW || ch !== telaH) { telaW = cw; telaH = ch; for (let i = 0; i < ativas; i++) nascer(i, cw, ch, true); }
      if (quer > ativas) for (let i = ativas; i < quer; i++) nascer(i, cw, ch, true);
      ativas = quer;
      // mexer: as que chegam ao chão viram respingo (as de perto e do meio) e nascem de novo lá em cima
      const mexe = reduced ? 0.5 : 1;
      for (let i = 0; i < ativas; i++) {
        const dy = gv[i] * dtReal * mexe;
        gy[i] += dy;
        gx[i] += dy * inclin;
        if (gy[i] >= gc[i]) {
          if (gp[i] > 0 && gy[i] < ch) { rx[rNext] = gx[i]; ry[rNext] = gc[i]; rt[rNext] = RESPINGO; rNext = (rNext + 1) % MAXR; }
          nascer(i, cw, ch, false);
        }
      }
      // desenhar: cada gota é um risco de pixels em degrau; camada por camada (longe primeiro)
      g.globalAlpha = W.fora;
      for (let c = 0; c < 3; c++) {
        const K = CAMADAS[c], ped = c === 2 && inclin < 0.2 ? 2 : K.ped;
        g.fillStyle = K.cor;
        for (let i = 0; i < ativas; i++) {
          if (gp[i] !== c) continue;
          const L = gl[i] * b, ph = Math.max(b, Math.round(L / ped / b) * b);
          for (let s = 0; s < ped; s++) {
            const y = gy[i] - ph * (s + 1), x = gx[i] - ph * (s + 0.5) * inclin;
            g.fillRect(Math.round(x / b) * b, Math.round(y / b) * b, b, ph);
          }
        }
      }
      // os respingos: um pingo que sobe, abre em coroa e cai para os lados
      g.fillStyle = 'rgba(205,225,255,0.6)';
      for (let i = 0; i < MAXR; i++) {
        if (rt[i] <= 0) continue;
        rt[i] -= dtReal;
        const x = Math.round(rx[i] / b) * b, y = Math.round(ry[i] / b) * b, f = rt[i] / RESPINGO;
        if (f > 0.66) g.fillRect(x, y - b, b, b);
        else if (f > 0.33) { g.fillRect(x - b, y - 2 * b, b, b); g.fillRect(x + b, y - 2 * b, b, b); g.fillRect(x, y - b, b, b); }
        else { g.fillRect(x - 2 * b, y - b, b, b); g.fillRect(x + 2 * b, y - b, b, b); }
      }
    } else if (!rua) {
      ativas = 0;
      for (let i = 0; i < MAXR; i++) rt[i] = 0;
    }
    // o raio no céu (só na rua) e o clarão (de dentro, só o que entra pela janela e pela porta)
    if (boltF > 0) {
      if (rua) { g.globalAlpha = 1; desenharRaio(g, b, Math.max(0.3, W.fora)); }
      boltF--;
    }
    if (W.flash > 0.01) {
      g.globalAlpha = 1;
      g.globalCompositeOperation = 'lighter';
      const forca = rua ? 0.72 * Math.max(0.3, W.fora) : 0.16;
      g.fillStyle = 'rgba(205,220,255,' + (W.flash * forca * (reduced ? 0.45 : 1)).toFixed(3) + ')';
      g.fillRect(0, 0, cw, ch);
      g.globalCompositeOperation = 'source-over';
    }
    g.restore();
  }

  /* ================================================================== */
  /* 3. O ÍCONE AO LADO DO RELÓGIO                                      */
  /* ================================================================== */
  let icone = null, iconeG = null, iconeEstado = '', iconeQuadro = -1;
  function criarIcone() {
    const relogio = document.querySelector('.dn-clock');
    if (!relogio) return;
    icone = document.createElement('canvas');
    icone.className = 'dn-clock__clima';
    icone.width = 13; icone.height = 11;
    icone.setAttribute('aria-hidden', 'true');
    relogio.appendChild(icone);
    iconeG = icone.getContext('2d');
  }
  // pixel art 13×11: uma nuvem com gotas (chuva) ou nuvem escura com raio (tempestade); as gotas piscam
  function desenharIcone(estado, quadro) {
    const g = iconeG;
    g.clearRect(0, 0, 13, 11);
    const nuvem = estado === 'tempestade' ? ['#5b6378', '#8a93ab'] : ['#9aa6c4', '#d9e2f5'];
    const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
    R(3, 1, 4, 1, nuvem[1]); R(2, 2, 7, 1, nuvem[1]); R(1, 3, 11, 2, nuvem[1]); R(0, 4, 13, 2, nuvem[1]); R(5, 0, 2, 1, nuvem[1]);
    R(1, 5, 11, 1, nuvem[0]); R(8, 2, 2, 1, nuvem[1]);
    if (estado === 'tempestade') {
      R(6, 6, 2, 1, '#ffd84a'); R(5, 7, 2, 1, '#ffd84a'); R(6, 8, 2, 1, '#ffd84a'); R(5, 9, 2, 1, '#ffd84a'); R(4, 10, 1, 1, '#fff2a8');
      R(2, 7 + quadro, 1, 2, '#7fb2ff'); R(10, 8 - quadro, 1, 2, '#7fb2ff');
    } else {
      for (let i = 0; i < 4; i++) R(2 + i * 3, 7 + ((i + quadro) % 2) * 2, 1, 2, '#7fb2ff');
    }
  }
  let iconeAcc = 0;
  function atualizarIcone(dt) {
    if (!icone) return;
    const estado = W.nivel > 0.06 ? (W.forca > 0.5 ? 'tempestade' : 'chuva') : '';
    if (estado !== iconeEstado) {
      iconeEstado = estado;
      icone.parentNode.classList.toggle('has-clima', !!estado);
      icone.parentNode.dataset.clima = estado;
      icone.title = estado === 'tempestade' ? 'Tempestade' : estado ? 'Chuva' : '';
      iconeQuadro = -1;
    }
    if (!estado) return;
    iconeAcc += dt;
    const quadro = reduced ? 0 : Math.floor(iconeAcc * 2.5) % 2;
    if (quadro !== iconeQuadro) { iconeQuadro = quadro; desenharIcone(estado, quadro); }
  }

  /* ================================================================== */
  /* 4. LIGAR NO JOGO                                                   */
  /* ================================================================== */
  criarIcone();
  G.on('step', (dt) => { passo(dt); atualizarIcone(dt); });
  // por cima de tudo (depois do dia/noite): as gotas, os respingos, o raio, o clarão
  const baseRender = scene.render;
  scene.render = function () {
    baseRender.apply(this, arguments);
    desenhar();
  };
  // as poças: no chão da rua, por baixo das pessoas e dos carros (junto com as sombras do daynight.js)
  const RUA = DL.Street && DL.Street.street;
  if (RUA) {
    const baseSombras = RUA.shadows;
    RUA.shadows = function (g, sc) {
      if (baseSombras) baseSombras.call(this, g, sc);
      if (!(DL.Street && DL.Street.inIntro)) desenharPocas(g, sc);
    };
  }
  // um jogo novo: sorteia o clima do primeiro dia (um jogo carregado volta ao clima salvo: restore)
  G.on('game-begin', () => {
    W.dia = 0; W.ultDias = DL.DayNight.dias;
    W.nivel = W.forca = W.molhado = W.flash = W.jogador = W.pico = W.tremor = 0;
    trovoes.length = 0; flashes.length = 0; boltF = 0;
    W.apagaoRaio = false;
    escuroUlt = molhadoUlt = -1;
    DL.DayNight.escurecer(0, 0);
    if (DL.DayNight.molhado) DL.DayNight.molhado(0);
    scene.canvas.style.transform = '';
    sortear();
    W.falouParou = true;
  });

  DL.Clima = {
    get chovendo() { return W.nivel > 0.06; },
    get estado() {
      return { dia: W.dia, chuva: W.chuva, tempestade: W.tempestade, intensidade: +W.intensidade.toFixed(2), inicio: +W.inicio.toFixed(2), apagaoMarcado: W.apagaoMarcado, apagaoHora: +W.apagaoHora.toFixed(2), apagou: W.apagou,
        nivel: W.nivel, forca: W.forca, molhado: W.molhado, fora: W.fora, jogador: W.jogador, q: W.q, fps: W.fps, custo: W.custo, ativas };
    },
    // salvar e carregar (save-service.js)
    snapshot: () => ({ d: W.dia, c: W.chuva, s: W.tempestade, i: Math.round(W.inicio * 100) / 100, f: Math.round(W.intensidade * 100) / 100, m: W.apagaoMarcado, h: Math.round(W.apagaoHora * 100) / 100, a: W.apagou }),
    restore(d) {
      if (!d || typeof d !== 'object') return;
      W.dia = Number.isFinite(+d.d) ? Math.max(0, Math.floor(+d.d)) : 0;
      W.chuva = !!d.c; W.tempestade = !!(d.c && d.s); W.apagou = !!d.a; W.apagaoMarcado = !!(W.tempestade && d.m);
      W.inicio = Number.isFinite(+d.i) ? clamp(+d.i, 18, 24) : 19;
      W.intensidade = Number.isFinite(+d.f) ? clamp(+d.f, 0.1, 1) : 0.6;
      W.apagaoHora = Number.isFinite(+d.h) ? clamp(+d.h, 18, 30) : Math.max(W.inicio + 0.6, rand(C.APAGAO_HORA[0], C.APAGAO_HORA[1]));
      W.ultDias = DL.DayNight.dias;
      // se já estava chovendo, continua chovendo (sem esperar a chuva "engrossar" de novo)
      W.nivel = alvo(); W.forca = W.tempestade && W.nivel ? 1 : 0; W.molhado = W.nivel;
      W.falouChuva = W.falouTempestade = W.nivel > 0;
      W.falouParou = W.nivel === 0;
    },
  };
})();
