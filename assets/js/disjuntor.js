/* DataLab — o DISJUNTOR: o conserto do apagão (blackout.js).
   • O quadro de energia: uma caixa metálica na parede da frente do prédio, na calçada, logo à direita da
     porta (desenhada na fachada com a câmera isométrica, como a porta: street.js). Luz verde = ok; vermelha
     piscando = falha. Durante o apagão ele brilha e solta faíscas (mais na chuva, só visual).
   • Chegando perto, "E · Consertar" (o botão de ação no celular) abre o minigame — só com apagão.
   • Uma seta mostra o caminho: dentro do prédio aponta a porta; na rua, o quadro (na borda da tela quando
     ele está fora dela).
   • O minigame, em tela cheia, 3 etapas: (a) abrir a tampa (puxar ou tocar); (b) trocar a placa queimada
     (segurar cada parafuso para soltar, arrastar a placa para a sucata, arrastar a nova da bandeja até o
     encaixe — "clique" magnético —, segurar os parafusos para prender); (c) ligar os fios (arrastar cada fio
     até o conector da mesma cor). Dá para fechar e voltar depois: o progresso fica no estado do apagão
     (blackout.state.mg) e vai junto com o save. O cronômetro do nobreak aparece no topo.
   • No fim: blackout.fix() — a luz volta rack a rack, a equipe comemora — e um resumo curto do apagão.
   • Os servidores que voltaram danificados (blackout.js) dão XP quando ficam online de novo.
   Carregado depois de weather.js (precisa da rua, do dia/noite e do apagão). */
(function () {
  'use strict';
  const DL = window.DL, D = window.DataLabDemo;
  if (!DL || !D || !D.blackout || !DL.Street || !DL.Street.luz || !DL.isoMap) return;
  const G = D.game, scene = D.scene, B = D.blackout, R = DL.R, T = DL.T;
  const RUA = DL.Street.street;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const $ = (id) => document.getElementById(id);

  DL.DISJUNTOR = {
    SEGURAR: 0.6,      // s segurando um parafuso para soltar / apertar
    IMA: 56,           // px (na janela do minigame): a placa nova é puxada para o encaixe a esta distância
    FIOS: [['vermelho', '#ff4d5e'], ['azul', '#4da3ff'], ['amarelo', '#ffd84a'], ['verde', '#3dffa2'], ['rosa', '#ff7ad9']],
  };
  const C = DL.DISJUNTOR;
  const COR = Object.fromEntries(C.FIOS);

  /* ================================================================== */
  /* 1. O QUADRO NA FACHADA                                              */
  /* ================================================================== */
  const L = DL.Street.luz;
  const FACE = L.ROWS.face * T;                 // a parede da frente do prédio (y)
  const MID = L.DOOR_X * T + 16 + 18;           // o meio do quadro (x): logo à direita da porta
  const BOX = { x0: MID - 8, w: 16, top: 30, h: 24 }; // em pixels de arte: 16 × 24, o topo a 30 px do chão
  const precisa = () => !!B.needsFix;

  // a arte: um cano subindo, a caixa de metal com aba, aviso de alta tensão, a luzinha de estado
  function arteCaixa(falha, aceso) {
    const c = DL.mk(16, 24), g = c.getContext('2d');
    R(g, 6, 0, 4, 5, '#3c4452'); R(g, 7, 0, 2, 5, '#6b7689'); R(g, 7, 0, 1, 5, '#9aa6b8'); // o eletroduto
    R(g, 5, 4, 6, 1, '#2a313b');
    R(g, 0, 5, 16, 19, '#11161d');                         // contorno
    R(g, 1, 6, 14, 17, '#66728a');                         // o metal
    R(g, 1, 6, 14, 1, '#a3afc2'); R(g, 1, 6, 1, 17, '#8592a5');
    R(g, 14, 6, 1, 17, '#454e5e'); R(g, 1, 22, 14, 1, '#353d4a');
    R(g, 2, 8, 12, 13, '#5a6579');                         // a tampa
    R(g, 2, 8, 12, 1, '#7d8899'); R(g, 2, 20, 12, 1, '#3c4452');
    R(g, 2, 9, 1, 2, '#c9d3e0'); R(g, 2, 17, 1, 2, '#c9d3e0'); // dobradiças
    R(g, 12, 13, 1, 3, '#d8e0ea'); R(g, 13, 13, 1, 3, '#2a313b'); // a maçaneta
    const Y = '#ffd84a', K = '#14110a';                   // o aviso de alta tensão
    R(g, 7, 10, 2, 1, Y); R(g, 6, 11, 4, 1, Y); R(g, 6, 12, 4, 1, Y); R(g, 5, 13, 6, 1, Y); R(g, 5, 14, 6, 1, Y);
    R(g, 8, 11, 1, 1, K); R(g, 7, 12, 1, 1, K); R(g, 8, 13, 1, 1, K); R(g, 7, 14, 1, 1, K);
    for (let i = 0; i < 2; i++) R(g, 4, 17 + i * 2, 7, 1, '#3c4452'); // grade de ventilação
    R(g, 11, 7, 3, 3, '#11161d');                          // a luzinha de estado
    R(g, 12, 8, 1, 1, falha ? (aceso ? '#ff3b3b' : '#4a1414') : '#3dffa2');
    if (falha) { R(g, 3, 19, 3, 2, 'rgba(18,10,4,0.75)'); R(g, 9, 20, 2, 1, 'rgba(18,10,4,0.6)'); R(g, 6, 5, 2, 1, '#1e1408'); } // marcas de queimado
    return c;
  }
  const ARTE = { ok: arteCaixa(false), on: arteCaixa(true, true), off: arteCaixa(true, false) };
  // um brilho redondo pequeno (feito uma vez, esticado)
  function brilho(cor) {
    const c = DL.mk(32, 32), g = c.getContext('2d'), r = g.createRadialGradient(16, 16, 0, 16, 16, 16);
    r.addColorStop(0, cor); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, 32, 32);
    return c;
  }
  const GLOW = { red: brilho('rgba(255,60,60,0.9)'), green: brilho('rgba(61,255,162,0.7)'), amber: brilho('rgba(255,200,80,0.8)') };
  const naFachada = (g, sc) => DL.isoMap(g, sc, [BOX.x0, FACE + 0.3, BOX.top], [1, 0, 0], [0, 0, -1]);
  const pisca = (t) => reduced || Math.floor(t * 2.5) % 2 === 0;

  // as faíscas: um conjunto fixo de partículas (arrays tipados), em pixels de arte da fachada
  const NF = 48, FX = new Float32Array(NF), FY = new Float32Array(NF), FVX = new Float32Array(NF), FVY = new Float32Array(NF), FL = new Float32Array(NF);
  let faiscaT = 0, ultT = 0;
  function soltarFaiscas(n, x, y) {
    for (let i = 0; i < NF && n > 0; i++) {
      if (FL[i] > 0) continue;
      FX[i] = x + rand(-1, 1); FY[i] = y; FVX[i] = rand(-14, 14); FVY[i] = rand(-22, -4); FL[i] = rand(0.25, 0.6);
      n--;
    }
  }
  function faiscas(g, t) {
    const dt = clamp(t - ultT, 0, 0.1);
    ultT = t;
    if (precisa() && !reduced) {
      faiscaT -= dt;
      if (faiscaT <= 0) {
        const chuva = !!(DL.Clima && DL.Clima.chovendo);
        faiscaT = chuva ? rand(0.12, 0.45) : rand(0.6, 1.6);
        const onde = Math.random();
        if (onde < 0.4) soltarFaiscas(Math.floor(rand(3, chuva ? 9 : 6)), 8, 4);          // no eletroduto
        else soltarFaiscas(Math.floor(rand(2, chuva ? 8 : 5)), rand(3, 13), 23);       // embaixo da caixa
        if (chuva && Math.random() < 0.3) soltarFaiscas(4, 1, rand(10, 20));           // da lateral, molhada
      }
    }
    let vivas = 0;
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < NF; i++) {
      if (FL[i] <= 0) continue;
      FL[i] -= dt; FVY[i] += 70 * dt; FX[i] += FVX[i] * dt; FY[i] += FVY[i] * dt;
      if (FL[i] <= 0) continue;
      vivas++;
      g.fillStyle = FL[i] > 0.35 ? '#fff6c0' : FL[i] > 0.18 ? '#ffd84a' : '#ff9d2e';
      g.fillRect(Math.round(FX[i]), Math.round(FY[i]), 1, 1);
    }
    g.globalCompositeOperation = 'source-over';
    return vivas;
  }

  // a caixa: por baixo das pessoas (antes do dia/noite escurecer a cena)
  const baseUnder = RUA.underlay;
  RUA.underlay = function (g, sc) {
    baseUnder.call(this, g, sc);
    if (DL.Street.inIntro) return;
    naFachada(g, sc);
    g.drawImage(precisa() ? (pisca(sc.t) ? ARTE.on : ARTE.off) : ARTE.ok, 0, 0);
    DL.isoKit.isoT(g, sc);
  };
  // por cima de tudo (depois do dia/noite: as luzes brilham à noite): a luzinha, o destaque, as faíscas
  const baseOver = RUA.overlay;
  RUA.overlay = function (g, sc) {
    baseOver.call(this, g, sc);
    if (DL.Street.inIntro) return;
    const t = sc.t, falha = precisa();
    naFachada(g, sc);
    g.globalCompositeOperation = 'lighter';
    if (falha) {
      const on = pisca(t);
      g.globalAlpha = on ? 0.9 : 0.25;
      g.drawImage(GLOW.red, 12.5 - 7, 8.5 - 7, 14, 14);
      // o destaque: uma moldura amarela pulsando em volta da caixa e uma luz no chão
      const k = reduced ? 0.6 : 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t * 5));
      g.globalAlpha = k * 0.35;
      g.drawImage(GLOW.amber, -10, -6, 36, 36);
      g.globalAlpha = k;
      g.fillStyle = '#ffd84a';
      g.fillRect(-2, 3, 20, 1); g.fillRect(-2, 25, 20, 1); g.fillRect(-2, 3, 1, 23); g.fillRect(17, 3, 1, 23);
    } else {
      g.globalAlpha = 0.5;
      g.drawImage(GLOW.green, 12.5 - 4, 8.5 - 4, 8, 8);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    faiscas(g, t);
    DL.isoKit.isoT(g, sc);
  };

  // E perto do quadro (só com apagão): o minigame. Vem antes da porta e das lojas (street.js: target)
  const ALVO = { id: 'DISJUNTOR', exit: true, verb: 'Consertar', name: 'Disjuntor', at: [MID, FACE, 34], use: () => abrir() };
  const baseTarget = DL.Street.target;
  DL.Street.target = function (p) {
    if (precisa() && DL.Street.outside && !DL.Street.place) {
      const dy = p.y - FACE, dx = p.x - MID;
      if (dy >= 0 && dy <= 24 && Math.abs(dx) <= 11) return ALVO;
    }
    return baseTarget.call(this, p);
  };

  /* ================================================================== */
  /* 2. A SETA (o caminho até o quadro)                                  */
  /* ================================================================== */
  const raiz = G.root || document.getElementById('game') || document.body;
  const seta = document.createElement('div');
  seta.className = 'dj-seta';
  seta.hidden = true;
  seta.setAttribute('aria-hidden', 'true');
  seta.innerHTML = '<span>Disjuntor</span><i></i>';
  raiz.appendChild(seta);
  const setaTxt = seta.querySelector('span');
  let setaKey = '';
  const tela = { w: 0, h: 0 };
  const medirTela = () => { tela.w = raiz.clientWidth; tela.h = raiz.clientHeight; };
  addEventListener('resize', () => { tela.w = 0; });
  function atualizarSeta() {
    let mostrar = precisa() && !aberto && D.state.phase === 'play' && D.state.mode === 'explore' && !DL.Street.busy && !DL.Street.place;
    let p = null, txt = '';
    if (mostrar) {
      if (DL.Street.outside) { p = DL.Street.promptAt(ALVO); txt = 'Disjuntor'; }
      else if (scene.world.exitDoor) { p = DL.Street.promptAt(null); txt = 'Saída'; }
      // perto do alvo, o "E" já aparece: a seta sai da frente
      const alvo = D.state.target;
      if (!p || alvo === ALVO || (!DL.Street.outside && alvo && alvo === DL.Street.door)) mostrar = false;
    }
    if (!mostrar) { if (!seta.hidden) { seta.hidden = true; setaKey = ''; } return; }
    // (o tamanho da tela fica guardado: ler clientWidth a cada quadro forçaria o navegador a recalcular a página)
    if (!tela.w) medirTela();
    const W = tela.w, H = tela.h, m = 34, topo = 70;
    let x = p.x, y = p.y - 4, ang = 0, borda = false;
    // na tela (mesmo perto do topo): a seta em cima dele, apontando para baixo; fora dela: na borda, girada
    if (x >= 0 && x <= W && p.y >= 0 && p.y <= H) { x = clamp(x, m, W - m); y = clamp(y, topo + 44, H - m); }
    else {
      // fora da tela: na borda, apontando para onde ele está
      borda = true;
      const cx = W / 2, cy = (H + topo) / 2, dx = p.x - cx, dy = p.y - cy;
      const k = Math.min((W / 2 - m) / Math.max(1, Math.abs(dx)), ((H - topo) / 2 - m) / Math.max(1, Math.abs(dy)));
      x = cx + dx * k; y = cy + dy * k;
      ang = Math.atan2(dy, dx) * 180 / Math.PI - 90;
    }
    const key = Math.round(x) + ',' + Math.round(y) + ',' + Math.round(ang) + borda + txt;
    if (key === setaKey && !seta.hidden) return;
    setaKey = key;
    seta.hidden = false;
    seta.classList.toggle('is-borda', borda);
    seta.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) translate(-50%,' + (borda ? '-50%' : '-100%') + ')';
    seta.style.setProperty('--ang', ang.toFixed(1) + 'deg');
    if (setaTxt.textContent !== txt) setaTxt.textContent = txt;
  }

  /* ================================================================== */
  /* 3. O MINIGAME                                                       */
  /* ================================================================== */
  const SW = 640, SH = 320;                 // o palco, em px "lógicos" (escalado para caber na tela)
  const SLOT = { x: 70, y: 52, w: 240, h: 160 };   // onde a placa encaixa
  const TRAY = { x: 400, y: 26, w: 216, h: 132 };  // a bandeja da placa nova
  const BIN = { x: 400, y: 180, w: 216, h: 116 };  // a sucata
  const PARAF = [[14, 14], [SLOT.w - 14, 14], [14, SLOT.h - 14], [SLOT.w - 14, SLOT.h - 14]]; // dentro da placa
  let aberto = false, el = null, palco = null, fx = null, fxg = null, dica = null, timer = null, passos = null, k = 1;
  let segura = null, arrasto = null, raf = 0, ultimo = 0, timerAcc = 0, fim = 0;

  const novoJogo = () => {
    const ordem = C.FIOS.map((f) => f[0]);
    for (let i = ordem.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [ordem[i], ordem[j]] = [ordem[j], ordem[i]]; }
    if (ordem.every((c, i) => c === C.FIOS[i][0])) ordem.push(ordem.shift()); // nunca na mesma ordem dos fios
    return { v: 1, etapa: 0, placa: 'velha', soltos: [0, 0, 0, 0], presos: [0, 0, 0, 0], ligados: {}, ordem };
  };
  const mg = () => {
    const S = B.state;
    if (!S.mg || S.mg.v !== 1) S.mg = novoJogo();
    return S.mg;
  };

  // as artes do minigame (pixel art pequena, mostrada 4× maior sem borrar)
  function arteTampa() {
    const c = DL.mk(60, 40), g = c.getContext('2d');
    R(g, 0, 0, 60, 40, '#11161d'); R(g, 1, 1, 58, 38, '#6b7689'); R(g, 1, 1, 58, 1, '#a3afc2'); R(g, 1, 1, 1, 38, '#8592a5');
    R(g, 58, 1, 1, 38, '#454e5e'); R(g, 1, 38, 58, 1, '#353d4a');
    for (let i = 0; i < 6; i++) R(g, 34, 26 + i * 2, 20, 1, '#454e5e');
    for (let x = 4; x < 56; x += 6) { R(g, x, 3, 3, 3, '#ffd84a'); R(g, x + 3, 3, 3, 3, '#14110a'); } // faixa de perigo
    const Y = '#ffd84a', K = '#14110a';
    const tri = [[13, 10, 2], [12, 11, 4], [12, 12, 4], [11, 13, 6], [11, 14, 6], [10, 15, 8], [10, 16, 8], [9, 17, 10], [9, 18, 10], [8, 19, 12], [8, 20, 12], [7, 21, 14], [7, 22, 14], [6, 23, 16]];
    for (const [x, y, w] of tri) R(g, x, y, w, 1, Y);
    for (const [x, y] of [[14, 13], [13, 14], [13, 15], [12, 16], [14, 16], [15, 16], [14, 17], [13, 18], [13, 19], [12, 20]]) R(g, x, y, 1, 1, K);
    DL.pixText(g, 'PERIGO', 28, 12, '#ffd84a');
    DL.pixText(g, '380V', 32, 19, '#e6edf6');
    R(g, 52, 16, 3, 9, '#d8e0ea'); R(g, 54, 16, 1, 9, '#2a313b'); // a maçaneta
    return c;
  }
  function artePlaca(nova) {
    const c = DL.mk(60, 40), g = c.getContext('2d');
    if (nova) {
      R(g, 0, 0, 60, 40, '#0c3a24'); R(g, 1, 1, 58, 38, '#17603c');
      for (const [x, y, w, h] of [[6, 8, 30, 1], [6, 8, 1, 14], [6, 22, 18, 1], [40, 6, 1, 26], [24, 30, 30, 1], [12, 14, 20, 1], [30, 14, 1, 10], [44, 12, 10, 1]]) R(g, x, y, w, h, '#e8c15a');
      R(g, 18, 15, 12, 10, '#101418'); for (let i = 0; i < 5; i++) { R(g, 19 + i * 2, 14, 1, 1, '#9aa6b8'); R(g, 19 + i * 2, 25, 1, 1, '#9aa6b8'); }
      R(g, 42, 18, 8, 8, '#101418'); R(g, 43, 19, 2, 2, '#2b3a59');
      R(g, 8, 26, 6, 6, '#c9d3e0'); R(g, 9, 27, 4, 4, '#8a98ad');           // capacitor
      R(g, 50, 30, 2, 2, '#3dffa2'); R(g, 54, 30, 2, 2, '#3dffa2');
      DL.pixText(g, 'DL-PSU', 24, 33, '#d8ffe9');
    } else {
      R(g, 0, 0, 60, 40, '#0a0a0a'); R(g, 1, 1, 58, 38, '#1b1b1d');
      for (const [x, y, w, h] of [[6, 8, 30, 1], [6, 8, 1, 14], [6, 22, 18, 1], [40, 6, 1, 26], [24, 30, 30, 1], [12, 14, 20, 1]]) R(g, x, y, w, h, '#3b3b3e');
      R(g, 18, 15, 12, 10, '#0e0e0e'); R(g, 20, 17, 8, 6, '#3a2414'); R(g, 22, 18, 4, 3, '#000');  // o chip derretido
      R(g, 8, 26, 6, 6, '#3a3a3a'); R(g, 9, 25, 4, 2, '#5a3a1a');                                 // capacitor estufado
      for (const [x, y, r] of [[24, 20, 7], [44, 12, 5], [12, 32, 4], [50, 28, 4]]) {
        for (let yy = -r; yy <= r; yy++) for (let xx = -r; xx <= r; xx++) {
          const d = Math.hypot(xx, yy);
          if (d > r || DL.hash(x * 31 + xx * 7 + yy * 13) > 1.15 - d / r) continue;
          R(g, x + xx, y + yy, 1, 1, d < r * 0.5 ? '#000' : '#2a1a0e');
        }
      }
      R(g, 34, 4, 1, 8, '#000'); R(g, 35, 11, 1, 6, '#000'); R(g, 36, 16, 1, 3, '#000');       // a rachadura
    }
    for (const [x, y] of [[2, 2], [56, 2], [2, 36], [56, 36]]) R(g, x, y, 2, 2, nova ? '#0c3a24' : '#000'); // furos
    return c;
  }
  function arteParafuso() {
    const c = DL.mk(9, 9), g = c.getContext('2d');
    for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
      const d = Math.hypot(x - 4, y - 4);
      if (d > 4.4) continue;
      R(g, x, y, 1, 1, d > 3.6 ? '#3c4452' : x + y < 7 ? '#e6edf6' : x + y > 10 ? '#7d8899' : '#b8c3d3');
    }
    R(g, 1, 4, 7, 1, '#2a313b'); R(g, 4, 1, 1, 7, '#2a313b'); // a fenda (philips)
    return c;
  }
  const url = (c) => c.toDataURL();
  let IMG = null;
  const imagens = () => IMG || (IMG = { tampa: url(arteTampa()), velha: url(artePlaca(false)), nova: url(artePlaca(true)), parafuso: url(arteParafuso()) });

  function montar() {
    if (el) return;
    el = document.createElement('div');
    el.className = 'dj';
    el.hidden = true;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-label', 'Quadro de energia');
    el.innerHTML = '<div class="dj__box">' +
      '<header class="dj__top"><b class="dj__title">⚡ Quadro de energia</b>' +
      '<ol class="dj__steps"><li>Abrir</li><li>Trocar a placa</li><li>Ligar os fios</li></ol>' +
      '<span class="dj__timer mono"></span><button type="button" class="dj__close" aria-label="Fechar (Esc) · o progresso fica salvo">✕</button></header>' +
      '<p class="dj__hint" aria-live="polite"></p>' +
      '<div class="dj__wrap"><div class="dj__stage"></div><canvas class="dj__fx" width="' + SW + '" height="' + SH + '"></canvas></div></div>';
    raiz.appendChild(el);
    palco = el.querySelector('.dj__stage');
    fx = el.querySelector('.dj__fx');
    fxg = fx.getContext('2d');
    dica = el.querySelector('.dj__hint');
    timer = el.querySelector('.dj__timer');
    passos = el.querySelectorAll('.dj__steps li');
    el.querySelector('.dj__close').addEventListener('click', () => fechar());
    palco.addEventListener('pointerdown', apertar);
    palco.addEventListener('pointermove', mover);
    palco.addEventListener('pointerup', soltar);
    palco.addEventListener('pointercancel', soltar);
    palco.addEventListener('lostpointercapture', soltar);
    palco.addEventListener('click', clicarTeclado);
    addEventListener('resize', () => { if (aberto) escala(); });
  }
  // o palco (640 × 320) escalado para caber na janela (celular deitado ~900 × 400 e desktop)
  function escala() {
    const wrap = el.querySelector('.dj__wrap'), box = el.querySelector('.dj__box');
    const topo = el.querySelector('.dj__top').offsetHeight + dica.offsetHeight;
    const maxW = Math.min(innerWidth - 24, 980), maxH = innerHeight - topo - 40;
    k = Math.max(0.4, Math.min(maxW / SW, maxH / SH, 1.6));
    wrap.style.width = SW * k + 'px';
    wrap.style.height = SH * k + 'px';
    palco.style.transform = fx.style.transform = 'scale(' + k + ')';
    box.style.width = SW * k + 'px';
  }

  function abrir() {
    if (!precisa() || aberto) return;
    montar();
    aberto = true;
    el.hidden = false;
    D.player.moving = false;
    if (G.keysReset) G.keysReset();
    escala();
    desenhar();
    tempo(true);
    DL.audio.play('tampa');
    // a equipe torce (uma vez por apagão)
    const run = B.state.run;
    if (run && !run.torcida) {
      run.torcida = true;
      const gente = (D.crew.members || []).filter((a) => a && a.crew && !a.crew.off && !a.hidden);
      const a = gente[Math.floor(Math.random() * gente.length)];
      const fala = ['Vai lá, chefe!', 'Cuidado com o choque, chefe!', 'Você consegue, chefe! ⚡', 'Chefe no disjuntor! Bora!', 'Desliga o geral antes, hein!'];
      if (a && G.chat) G.chat.post(a, fala[Math.floor(Math.random() * fala.length)], { tone: 'chat' });
    }
    ultimo = performance.now();
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(loop);
    setTimeout(() => { const b = el.querySelector('.dj__stage [data-foco]') || el.querySelector('.dj__close'); if (b && aberto) b.focus({ preventScroll: true }); }, 60);
  }
  function fechar() {
    if (!aberto) return;
    aberto = false;
    segura = null; arrasto = null;
    el.hidden = true;
    cancelAnimationFrame(raf);
    if (document.activeElement && el.contains(document.activeElement)) document.activeElement.blur();
  }

  // a etapa de agora, desenhada de novo a cada mudança (é pouca coisa)
  const ETAPAS = ['Abrir', 'Trocar a placa', 'Ligar os fios'];
  function desenhar() {
    const m = mg(), I = imagens();
    passos.forEach((li, i) => { li.className = i < m.etapa ? 'is-done' : i === m.etapa ? 'is-now' : ''; });
    let h = '';
    if (m.etapa === 0) {
      h += '<div class="dj-fundo"></div>' + placaHtml('velha', I) +
        '<button type="button" class="dj-tampa" data-foco aria-label="Abrir a tampa"><img src="' + I.tampa + '" alt=""></button>';
      dica.textContent = 'Puxe a tampa para o lado (ou toque nela) para abrir o quadro';
    } else if (m.etapa === 1) {
      h += '<div class="dj-fundo"></div>';
      h += '<div class="dj-area dj-area--tray" style="left:' + TRAY.x + 'px;top:' + TRAY.y + 'px;width:' + TRAY.w + 'px;height:' + TRAY.h + 'px"><em>Placa nova</em></div>';
      h += '<div class="dj-area dj-area--bin" style="left:' + BIN.x + 'px;top:' + BIN.y + 'px;width:' + BIN.w + 'px;height:' + BIN.h + 'px"><em>Sucata</em></div>';
      if (m.placa === 'velha') h += placaHtml('velha', I) + '<div class="dj-placa dj-placa--nova is-tray is-espera" style="' + noTray() + '"><img src="' + I.nova + '" alt=""></div>';
      if (m.placa !== 'velha') h += '<div class="dj-encaixe" style="left:' + SLOT.x + 'px;top:' + SLOT.y + 'px;width:' + SLOT.w + 'px;height:' + SLOT.h + 'px"></div>';
      if (m.placa === 'fora') h += '<div class="dj-placa dj-placa--nova is-tray" data-placa="nova" style="' + noTray() + '"><img src="' + I.nova + '" alt="Placa nova"></div>';
      if (m.placa === 'nova') h += placaHtml('nova', I);
      if (m.placa !== 'fora') {
        const lista = m.placa === 'velha' ? m.soltos : m.presos, apertar = m.placa === 'nova';
        PARAF.forEach(([px, py], i) => {
          const feito = !!lista[i];
          if (!apertar && feito) return; // solto: sumiu (fica o furo)
          h += '<button type="button" class="dj-parafuso' + (apertar ? (feito ? ' is-preso' : ' is-solto') : '') + '" data-p="' + i + '"' + (i === lista.indexOf(0) ? ' data-foco' : '') +
            ' aria-label="' + (apertar ? 'Apertar' : 'Soltar') + ' parafuso ' + (i + 1) + '" style="left:' + (SLOT.x + px - 22) + 'px;top:' + (SLOT.y + py - 22) + 'px"' + (feito ? ' disabled' : '') + '><img src="' + I.parafuso + '" alt=""><i></i></button>';
        });
      }
      const nS = m.soltos.filter(Boolean).length, nP = m.presos.filter(Boolean).length;
      dica.textContent = m.placa === 'velha' ? (nS < 4 ? 'Segure cada parafuso para soltar (' + nS + '/4)' : 'Arraste a placa queimada para a sucata')
        : m.placa === 'fora' ? 'Pegue a placa nova na bandeja e arraste até o encaixe'
          : 'Segure os parafusos para prender a placa nova (' + nP + '/4)';
    } else if (m.etapa === 2) {
      h += '<div class="dj-fundo dj-fundo--fios"></div>' + fiosHtml(m);
      const n = Object.keys(m.ligados).length;
      dica.textContent = 'Arraste cada fio até o conector da mesma cor (' + n + '/5)';
    } else {
      h += '<div class="dj-fundo dj-fundo--fios"></div>' + fiosHtml(m) + '<div class="dj-ok"><b>Energia restaurada!</b></div>';
      dica.textContent = 'Pronto! Religando o data center…';
    }
    palco.innerHTML = h;
  }
  const noTray = () => 'left:' + (TRAY.x + (TRAY.w - SLOT.w * 0.8) / 2) + 'px;top:' + (TRAY.y + 14) + 'px;width:' + SLOT.w * 0.8 + 'px;height:' + SLOT.h * 0.8 + 'px';
  const placaHtml = (qual, I) => '<div class="dj-placa dj-placa--' + qual + '" data-placa="' + qual + '" style="left:' + SLOT.x + 'px;top:' + SLOT.y + 'px;width:' + SLOT.w + 'px;height:' + SLOT.h + 'px"><img src="' + I[qual] + '" alt="' + (qual === 'velha' ? 'Placa queimada' : 'Placa nova') + '">' + (qual === 'velha' ? '<span class="dj-fumaca"></span>' : '') + '</div>';
  // os fios (esquerda: soltos e queimados; direita: os conectores embaralhados)
  const FIO_Y = (i) => 48 + i * 56, FIO_X = 150, CON_X = 528;
  function fiosHtml(m) {
    // a régua de bornes da placa nova (à direita), onde ficam os conectores; à esquerda, o chicote queimado
    let h = '<div class="dj-borne"><em>Placa nova</em></div><div class="dj-chicote"><em>Da rua</em></div><svg class="dj-cabos" viewBox="0 0 ' + SW + ' ' + SH + '" aria-hidden="true">';
    C.FIOS.forEach(([nome, cor], i) => {
      const y = FIO_Y(i), j = m.ordem.indexOf(nome);
      h += '<path d="M0 ' + y + ' H' + (FIO_X - 20) + '" stroke="#0a0c10" stroke-width="14" fill="none"/><path d="M0 ' + y + ' H' + (FIO_X - 20) + '" stroke="' + cor + '" stroke-width="8" fill="none"/>';
      if (m.ligados[nome]) h += cabo(FIO_X - 20, y, CON_X - 18, FIO_Y(j), cor, true);
    });
    h += '<path class="dj-cabo-vivo" d="" fill="none"/></svg>';
    C.FIOS.forEach(([nome, cor], i) => {
      const y = FIO_Y(i), lig = !!m.ligados[nome];
      if (!lig) h += '<button type="button" class="dj-fio" data-fio="' + nome + '"' + (C.FIOS.findIndex((f) => !m.ligados[f[0]]) === i ? ' data-foco' : '') + ' aria-label="Ligar o fio ' + nome + '" style="left:' + (FIO_X - 26) + 'px;top:' + (y - 22) + 'px;--c:' + cor + '"><i></i></button>';
    });
    m.ordem.forEach((nome, j) => {
      const y = FIO_Y(j), lig = !!m.ligados[nome];
      h += '<div class="dj-con' + (lig ? ' is-on' : '') + '" data-con="' + nome + '" style="left:' + (CON_X - 22) + 'px;top:' + (y - 22) + 'px;--c:' + COR[nome] + '"><i></i><b></b></div>';
    });
    return h;
  }
  function cabo(x0, y0, x1, y1, cor, fixo) {
    const mx = (x0 + x1) / 2, d = 'M' + x0 + ' ' + y0 + ' C' + mx + ' ' + y0 + ' ' + mx + ' ' + y1 + ' ' + x1 + ' ' + y1;
    return '<path d="' + d + '" stroke="#0a0c10" stroke-width="' + (fixo ? 14 : 13) + '" fill="none" stroke-linecap="square"/><path d="' + d + '" stroke="' + cor + '" stroke-width="8" fill="none" stroke-linecap="square"/>';
  }

  /* ---------- tocar, segurar, arrastar ---------- */
  const ponto = (ev) => { const r = palco.getBoundingClientRect(); return { x: (ev.clientX - r.left) / k, y: (ev.clientY - r.top) / k }; };
  function apertar(ev) {
    if (!aberto || ev.button > 0) return;
    const m = mg(), p = ponto(ev), alvo = ev.target.closest('[data-p],[data-placa],[data-fio],.dj-tampa');
    if (!alvo) return;
    ev.preventDefault();
    try { palco.setPointerCapture(ev.pointerId); } catch (e) { /* (a test pointer) */ }
    if (alvo.classList.contains('dj-tampa') && m.etapa === 0) { arrasto = { tipo: 'tampa', el: alvo, x0: p.x, dx: 0, id: ev.pointerId }; return; }
    if (alvo.dataset.p != null && m.etapa === 1) {
      const i = +alvo.dataset.p, lista = m.placa === 'velha' ? m.soltos : m.presos;
      if (!lista[i] && m.placa !== 'fora') segura = { i, el: alvo, t0: performance.now(), t: 0, som: 0, id: ev.pointerId };
      return;
    }
    if (alvo.dataset.placa && m.etapa === 1) {
      const qual = alvo.dataset.placa;
      if (qual === 'velha' && m.soltos.every(Boolean)) arrasto = { tipo: 'velha', el: alvo, x0: p.x, y0: p.y, ox: SLOT.x, oy: SLOT.y, id: ev.pointerId };
      else if (qual === 'nova' && m.placa === 'fora') {
        const r = alvo.getBoundingClientRect(), pr = palco.getBoundingClientRect();
        arrasto = { tipo: 'nova', el: alvo, x0: p.x, y0: p.y, ox: (r.left - pr.left) / k, oy: (r.top - pr.top) / k, id: ev.pointerId };
        alvo.classList.remove('is-tray');
        alvo.style.width = SLOT.w + 'px'; alvo.style.height = SLOT.h + 'px';
        arrasto.ox -= (SLOT.w - SLOT.w * 0.8) / 2; arrasto.oy -= (SLOT.h - SLOT.h * 0.8) / 2;
        alvo.style.left = arrasto.ox + 'px'; alvo.style.top = arrasto.oy + 'px';
        alvo.classList.add('is-drag');
        DL.audio.play('tick');
      } else if (qual === 'velha') { DL.audio.play('nope'); dica.classList.remove('is-shake'); void dica.offsetWidth; dica.classList.add('is-shake'); }
      if (arrasto && arrasto.tipo === 'velha') alvo.classList.add('is-drag');
      return;
    }
    if (alvo.dataset.fio && m.etapa === 2) {
      const nome = alvo.dataset.fio, i = C.FIOS.findIndex((f) => f[0] === nome);
      arrasto = { tipo: 'fio', nome, el: alvo, x0: FIO_X - 20, y0: FIO_Y(i), x: p.x, y: p.y, id: ev.pointerId };
      alvo.classList.add('is-drag');
      DL.audio.play('zumbido');
    }
  }
  function mover(ev) {
    if (!arrasto || ev.pointerId !== arrasto.id) { if (segura && ev.pointerId === segura.id) segura.mexeu = true; return; }
    const p = ponto(ev), a = arrasto;
    if (a.tipo === 'tampa') {
      a.dx = p.x - a.x0;
      a.el.style.transform = 'perspective(700px) rotateY(' + clamp(-Math.abs(a.dx) * 0.55, -70, 0) + 'deg)';
    } else if (a.tipo === 'velha' || a.tipo === 'nova') {
      let x = a.ox + p.x - a.x0, y = a.oy + p.y - a.y0;
      if (a.tipo === 'nova') {
        // o ímã: perto do encaixe, a placa é puxada para ele
        const d = Math.hypot(x - SLOT.x, y - SLOT.y);
        if (d < C.IMA) { const s = 1 - d / C.IMA; x += (SLOT.x - x) * s * 0.8; y += (SLOT.y - y) * s * 0.8; a.el.classList.add('is-ima'); }
        else a.el.classList.remove('is-ima');
      }
      a.x = x; a.y = y;
      a.el.style.left = x + 'px'; a.el.style.top = y + 'px';
    } else if (a.tipo === 'fio') {
      a.x = p.x; a.y = p.y;
      const viv = palco.querySelector('.dj-cabo-vivo');
      if (viv) {
        const mx = (a.x0 + p.x) / 2;
        viv.setAttribute('d', 'M' + a.x0 + ' ' + a.y0 + ' C' + mx + ' ' + a.y0 + ' ' + mx + ' ' + p.y + ' ' + p.x + ' ' + p.y);
        viv.setAttribute('stroke', COR[a.nome]);
      }
    }
  }
  function soltar(ev) {
    if (segura && (!ev || ev.pointerId === segura.id)) {
      if (segura.el) segura.el.style.setProperty('--p', '0');
      if (segura.el && segura.el.isConnected) { segura.el.style.transform = ''; }
      segura = null;
    }
    if (!arrasto || (ev && ev.pointerId !== arrasto.id)) return;
    const a = arrasto, m = mg();
    arrasto = null;
    if (a.tipo === 'tampa') {
      if (Math.abs(a.dx) > 50 || Math.abs(a.dx) < 6) abrirTampa(a.el);
      else { a.el.style.transform = ''; DL.audio.play('tick'); }
    } else if (a.tipo === 'velha') {
      const x = a.x == null ? SLOT.x : a.x, y = a.y == null ? SLOT.y : a.y;
      const naSucata = x + SLOT.w / 2 > BIN.x && y + SLOT.h / 2 > BIN.y - 30;
      if (naSucata || Math.hypot(x - SLOT.x, y - SLOT.y) > 140) {
        m.placa = 'fora';
        a.el.classList.remove('is-drag');
        a.el.classList.add('is-lixo');
        a.el.style.left = BIN.x + 20 + 'px'; a.el.style.top = BIN.y + 6 + 'px';
        DL.audio.play('remove');
        faisca(BIN.x + 100, BIN.y + 40, 10);
        setTimeout(() => { if (aberto) desenhar(); }, 380);
      } else voltar(a.el, SLOT.x, SLOT.y);
    } else if (a.tipo === 'nova') {
      const x = a.x == null ? a.ox : a.x, y = a.y == null ? a.oy : a.y;
      if (Math.hypot(x - SLOT.x, y - SLOT.y) < C.IMA * 1.3) {
        m.placa = 'nova';
        a.el.classList.remove('is-drag', 'is-ima');
        a.el.style.left = SLOT.x + 'px'; a.el.style.top = SLOT.y + 'px';
        DL.audio.play('estalo');
        faisca(SLOT.x + SLOT.w / 2, SLOT.y + SLOT.h, 8);
        palco.classList.remove('is-snap'); void palco.offsetWidth; palco.classList.add('is-snap');
        setTimeout(() => { if (aberto) desenhar(); }, 180);
      } else {
        a.el.classList.remove('is-drag', 'is-ima');
        DL.audio.play('tick');
        desenhar();
      }
    } else if (a.tipo === 'fio') {
      const viv = palco.querySelector('.dj-cabo-vivo');
      if (viv) viv.setAttribute('d', '');
      a.el.classList.remove('is-drag');
      let alvo = null, melhor = 40;
      m.ordem.forEach((nome, j) => { const d = Math.hypot((a.x || 0) - CON_X, (a.y || 0) - FIO_Y(j)); if (d < melhor) { melhor = d; alvo = nome; } });
      if (!alvo) return;
      const j = m.ordem.indexOf(alvo);
      if (alvo === a.nome && !m.ligados[alvo]) {
        m.ligados[alvo] = 1;
        DL.audio.play('fioOk');
        faisca(CON_X, FIO_Y(j), 5, '#3dffa2');
        if (Object.keys(m.ligados).length >= C.FIOS.length) concluir();
        else desenhar();
      } else {
        DL.audio.play('fioErro');
        faisca(CON_X, FIO_Y(j), 14);
        const c = palco.querySelector('[data-con="' + alvo + '"]');
        if (c) { c.classList.remove('is-erro'); void c.offsetWidth; c.classList.add('is-erro'); }
        a.el.classList.remove('is-volta'); void a.el.offsetWidth; a.el.classList.add('is-volta');
      }
    }
  }
  function voltar(e, x, y) {
    e.classList.remove('is-drag');
    e.classList.add('is-volta');
    e.style.left = x + 'px'; e.style.top = y + 'px';
    DL.audio.play('tick');
    setTimeout(() => e.classList.remove('is-volta'), 300);
  }
  // pelo teclado (Enter / Espaço num botão): cada ação de uma vez, sem arrastar
  function clicarTeclado(ev) {
    if (ev.detail !== 0 || !aberto) return;
    const m = mg(), b = ev.target.closest('button');
    if (!b) return;
    if (b.classList.contains('dj-tampa')) abrirTampa(b);
    else if (b.dataset.p != null) terminarParafuso(+b.dataset.p);
    else if (b.dataset.fio) { m.ligados[b.dataset.fio] = 1; DL.audio.play('fioOk'); if (Object.keys(m.ligados).length >= C.FIOS.length) concluir(); else { desenhar(); focar(); } }
  }
  const focar = () => { const b = palco.querySelector('[data-foco]') || palco.querySelector('button:not([disabled])'); if (b) b.focus({ preventScroll: true }); };
  // (para o teclado também: Enter numa placa a move)
  palcoTeclas();
  function palcoTeclas() {
    addEventListener('keydown', (ev) => {
      if (!aberto) return;
      if (ev.code === 'Escape') { ev.preventDefault(); ev.stopPropagation(); fechar(); return; }
      const m = mg();
      if ((ev.code === 'Enter' || ev.code === 'Space') && m.etapa === 1 && m.soltos.every(Boolean) && (m.placa === 'velha' || m.placa === 'fora') && !(document.activeElement && document.activeElement.closest && document.activeElement.closest('.dj-parafuso'))) {
        ev.preventDefault();
        if (m.placa === 'velha') { m.placa = 'fora'; DL.audio.play('remove'); } else { m.placa = 'nova'; DL.audio.play('estalo'); }
        desenhar(); focar();
      }
      // o jogo não recebe as teclas enquanto o quadro está aberto (nada de andar por trás)
      if (ev.code !== 'Tab' && !/^F\d+$/.test(ev.code)) ev.stopPropagation();
    }, true);
    addEventListener('keyup', (ev) => { if (aberto) ev.stopPropagation(); }, true);
  }

  function abrirTampa(e) {
    const m = mg();
    if (m.etapa !== 0) return;
    e.classList.add('is-open');
    e.style.transform = '';
    DL.audio.play('tampa');
    setTimeout(() => DL.audio.play('faisca'), 160);
    faisca(SLOT.x + SLOT.w / 2, SLOT.y + 20, 16);
    m.etapa = 1;
    setTimeout(() => { if (aberto) { desenhar(); focar(); } }, 520);
  }
  function terminarParafuso(i) {
    const m = mg();
    if (m.etapa !== 1 || m.placa === 'fora') return;
    const lista = m.placa === 'velha' ? m.soltos : m.presos;
    if (lista[i]) return;
    lista[i] = 1;
    DL.audio.play(m.placa === 'velha' ? 'parafusoSai' : 'estalo');
    const [px, py] = PARAF[i];
    faisca(SLOT.x + px, SLOT.y + py, m.placa === 'velha' ? 6 : 3);
    if (m.placa === 'nova' && m.presos.every(Boolean)) {
      m.etapa = 2;
      DL.audio.play('ok');
      setTimeout(() => { if (aberto) { desenhar(); focar(); } }, 420);
    } else { desenhar(); focar(); }
  }
  function concluir() {
    const m = mg();
    m.etapa = 3;
    desenhar();
    DL.audio.play('done');
    faisca(SW / 2, SH / 2, 30, '#3dffa2');
    fim = 1.2;
  }

  /* ---------- faíscas e fumaça na janela do minigame ---------- */
  const NP = 90, PX = new Float32Array(NP), PY = new Float32Array(NP), PVX = new Float32Array(NP), PVY = new Float32Array(NP), PL = new Float32Array(NP), PT = new Uint8Array(NP);
  const PC = new Array(NP).fill('#ffd84a');
  function faisca(x, y, n, cor) {
    if (reduced) n = Math.min(n, 4);
    for (let i = 0; i < NP && n > 0; i++) {
      if (PL[i] > 0) continue;
      const a = Math.random() * Math.PI * 2, v = rand(60, 220);
      PX[i] = x; PY[i] = y; PVX[i] = Math.cos(a) * v; PVY[i] = Math.sin(a) * v - 60; PL[i] = rand(0.25, 0.6); PT[i] = 0; PC[i] = cor || (Math.random() < 0.4 ? '#fff6c0' : '#ffd84a');
      n--;
    }
  }
  function fumaca(x, y) {
    for (let i = 0; i < NP; i++) {
      if (PL[i] > 0) continue;
      PX[i] = x + rand(-20, 20); PY[i] = y; PVX[i] = rand(-6, 6); PVY[i] = rand(-30, -16); PL[i] = rand(1.2, 2.2); PT[i] = 1;
      return;
    }
  }
  let fumT = 0, chiadoT = 0;
  function particulas(dt) {
    fxg.clearRect(0, 0, SW, SH);
    const m = mg();
    if (!reduced) {
      // a placa queimada solta fumaça; os fios soltos dão faíscas de vez em quando
      fumT -= dt;
      if (fumT <= 0 && m.etapa <= 1 && m.placa === 'velha') { fumT = rand(0.12, 0.3); fumaca(SLOT.x + SLOT.w * rand(0.25, 0.75), SLOT.y + SLOT.h * 0.4); }
      chiadoT -= dt;
      if (chiadoT <= 0 && m.etapa === 2) {
        chiadoT = rand(0.5, 1.4);
        const soltos = C.FIOS.map((f, i) => [f[0], i]).filter(([n]) => !m.ligados[n]);
        if (soltos.length) { const [, i] = soltos[Math.floor(Math.random() * soltos.length)]; faisca(FIO_X - 18, FIO_Y(i), 4); if (Math.random() < 0.4) DL.audio.play('faisca', { vol: 0.5 }); }
      }
    }
    for (let i = 0; i < NP; i++) {
      if (PL[i] <= 0) continue;
      PL[i] -= dt;
      if (PL[i] <= 0) continue;
      if (PT[i]) {
        PX[i] += PVX[i] * dt; PY[i] += PVY[i] * dt;
        const s = 6 + (2.2 - PL[i]) * 10;
        fxg.fillStyle = 'rgba(70,70,74,' + Math.min(0.35, PL[i] * 0.25).toFixed(3) + ')';
        fxg.fillRect(Math.round(PX[i] - s / 2), Math.round(PY[i] - s / 2), Math.round(s), Math.round(s));
      } else {
        PVY[i] += 420 * dt; PX[i] += PVX[i] * dt; PY[i] += PVY[i] * dt;
        fxg.fillStyle = PC[i];
        fxg.fillRect(Math.round(PX[i]), Math.round(PY[i]), 3, 3);
      }
    }
  }

  /* ---------- o laço (só com o minigame aberto) ---------- */
  function tempo(force) {
    const S = B.state;
    let txt, cls = '';
    if (S.phase === 'dark') { const s = Math.max(0, Math.ceil(S.battery)); txt = 'Nobreak ' + s + ' s'; cls = s <= 10 ? 'is-low' : ''; }
    else if (S.phase === 'semRack') { txt = 'Quebra de SLA · multa $' + Math.round(S.run ? S.run.multa : 0).toLocaleString('pt-BR'); cls = 'is-off'; }
    else txt = 'Energia ok';
    if (force || timer.textContent !== txt) { timer.textContent = txt; timer.className = 'dj__timer mono ' + cls; }
  }
  function loop(now) {
    if (!aberto) return;
    const dt = Math.min(0.05, (now - ultimo) / 1000);
    ultimo = now;
    // o apagão acabou por outro caminho (um jogo novo, outro save, …): fecha
    if (!precisa() && fim <= 0) { fechar(); return; }
    if (segura) {
      // (pelo relógio de verdade: num aparelho lento leva o mesmo tempo; girando o dedo vai um pouco mais rápido)
      segura.t = ((now - segura.t0) / 1000) * (segura.mexeu ? 1.25 : 1);
      segura.som -= dt;
      if (segura.som <= 0) { segura.som = 0.2; DL.audio.play('parafuso'); }
      const m = mg(), k2 = Math.min(1, segura.t / C.SEGURAR), dir = m.placa === 'velha' ? -1 : 1;
      segura.el.style.setProperty('--p', k2.toFixed(3));
      segura.el.style.transform = 'rotate(' + (dir * k2 * 540).toFixed(0) + 'deg)';
      if (segura.t >= C.SEGURAR) { const i = segura.i; segura = null; terminarParafuso(i); }
    }
    timerAcc += dt;
    if (timerAcc > 0.2) { timerAcc = 0; tempo(); }
    particulas(dt);
    if (fim > 0) {
      fim -= dt;
      if (fim <= 0) { fechar(); B.fix(); }
    }
    raf = requestAnimationFrame(loop);
  }

  /* ================================================================== */
  /* 4. O RESUMO DO APAGÃO                                               */
  /* ================================================================== */
  let resumo = null;
  const dur = (s) => { s = Math.max(0, Math.round(s)); return s < 60 ? s + ' s' : Math.floor(s / 60) + ' min' + (s % 60 ? ' ' + (s % 60) + ' s' : ''); };
  const din = (v) => '$' + Math.round(v).toLocaleString('pt-BR');
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  G.on('blackout-summary', (run) => {
    if (!resumo) {
      resumo = document.createElement('div');
      resumo.className = 'dj-resumo';
      resumo.setAttribute('role', 'dialog');
      resumo.setAttribute('aria-label', 'Resumo do apagão');
      raiz.appendChild(resumo);
      resumo.addEventListener('click', (ev) => { if (ev.target.closest('[data-ok]')) resumo.hidden = true; });
    }
    const perdido = (run.perdido || 0) + (run.multa || 0);
    const lin = (a, b, cls) => '<li' + (cls ? ' class="' + cls + '"' : '') + '><span>' + a + '</span><b>' + b + '</b></li>';
    resumo.innerHTML = '<h3>' + (run.fixedIn ? '⚡ Apagão resolvido a tempo' : '⚡ Resumo do apagão') + '</h3><ul>' +
      lin('Duração do apagão', dur(run.dur)) +
      lin('Racks sem energia', run.offT > 0 ? dur(run.offT) : 'nenhum momento', run.offT > 0 ? 'is-bad' : 'is-good') +
      lin('Receita perdida', run.perdido > 0 ? '−' + din(run.perdido) + ' <small>(racks sem faturar)</small>' : 'nada', run.perdido > 0 ? 'is-bad' : 'is-good') +
      (run.multa > 0 ? lin('Multa contratual (SLA)', '−' + din(run.multa) + ' <small>(penalidade por indisponibilidade)</small>', 'is-bad') : '') +
      (perdido > 0 && run.multa > 0 ? lin('Prejuízo total', '−' + din(perdido), 'is-bad') : '') +
      lin('Servidores danificados', run.damaged.length ? run.damaged.length + ' <small>(' + esc(run.damaged.slice(0, 6).join(', ')) + (run.damaged.length > 6 ? '…' : '') + ')</small>' : 'nenhum', run.damaged.length ? 'is-bad' : 'is-good') +
      (run.bonus ? lin('Bônus da empresa', '+' + din(run.bonus), 'is-good') : '') +
      (run.xp ? lin('Seu XP', '+' + run.xp + ' XP', 'is-good') : '') +
      '</ul>' + (run.multa > 0 ? '<p>Por que a multa: os contratos têm um <b>SLA</b> (acordo de nível de serviço) que garante ' + DL.BLACKOUT.slaUptime + ' de disponibilidade. Com os racks parados por ' + dur(run.offT) + ', o serviço ficou fora do ar sem aviso (indisponibilidade não programada) e a <b>cláusula de penalidade</b> foi cobrada: começa em ' + din(DL.BLACKOUT.multaInicio) + '/s e sobe a cada minuto, até ' + din(DL.BLACKOUT.multaTeto) + '/s.</p>' : '') + (run.damaged.length ? '<p>Os servidores danificados estão em <b>Tarefas (T)</b>: refaça o cabo e a configuração (+' + DL.BLACKOUT.xpServidor + ' XP cada).</p>' : '') +
      '<button type="button" class="btn btn--sm btn--primary" data-ok>OK</button>';
    resumo.hidden = false;
    const ok = resumo.querySelector('[data-ok]');
    if (ok && !DL.MOBILE) ok.focus({ preventScroll: true });
  });
  addEventListener('keydown', (ev) => { if (resumo && !resumo.hidden && (ev.code === 'Escape' || ev.code === 'Enter') && !aberto) { resumo.hidden = true; ev.preventDefault(); } });
  G.on('blackout-reset', () => { if (resumo) resumo.hidden = true; fechar(); });

  // um servidor danificado no apagão voltou ao ar (cabo + configuração): XP
  G.on('server-online', (info) => {
    const d = info && info.d;
    if (!d || !d.danificado) return;
    d.danificado = false;
    const xp = G.career ? G.career.solve({ id: 'apagao_servidor', xp: DL.BLACKOUT.xpServidor }, 1) : 0;
    G.toast('ok', 'Servidor recuperado', d.name + ' voltou depois do apagão' + (xp ? ' · +' + xp + ' XP' : ''));
    if (D.ops) D.ops.render(true);
  });

  /* ================================================================== */
  /* 5. LIGAR NO JOGO                                                    */
  /* ================================================================== */
  const baseRender = scene.render;
  scene.render = function () {
    baseRender.apply(this, arguments);
    atualizarSeta();
  };

  DL.Disjuntor = {
    abrir, fechar,
    get aberto() { return aberto; },
    get progresso() { return B.state.mg; },
    // (testes automáticos) as ações do minigame sem precisar arrastar
    _acao: {
      tampa: () => { const e = palco && palco.querySelector('.dj-tampa'); if (e) abrirTampa(e); },
      parafuso: terminarParafuso,
      placa: () => { const m = mg(); if (m.placa === 'velha' && m.soltos.every(Boolean)) m.placa = 'fora'; else if (m.placa === 'fora') m.placa = 'nova'; desenhar(); },
      fio: (nome) => { const m = mg(); m.ligados[nome] = 1; if (Object.keys(m.ligados).length >= C.FIOS.length) concluir(); else desenhar(); },
    },
    ALVO, MID, FACE,
  };
})();
