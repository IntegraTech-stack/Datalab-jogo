/* DataLab — ciclo de dia e noite.
   Três períodos que passam sozinhos: MANHÃ (06h–12h), TARDE (12h–18h) e NOITE (18h–06h), cada um com um
   terço do dia (a noite corre mais rápido no relógio, como no Stardew Valley). As cores mudam aos poucos.

   O arquivo tem três partes, cada uma com as suas funções:
     1. O CICLO      — a hora do dia (stepCycle, horaDoCiclo, periodoDe, textoHora)
     2. A ILUMINAÇÃO — as cores de cada hora (luzAgora) e o desenho:
                       na rua: céu, sol, lua e estrelas (desenharCeu), sombras que giram com o sol (desenharSombras),
                       a cor por cima da cena + os brilhos dos postes, janelas e letreiros (iluminarRua);
                       dentro do data center: só um leve escurecido à noite (iluminarDentro)
     3. O RELÓGIO    — o painel no canto superior esquerdo (criarRelogio, desenharMostrador, atualizarRelogio)

   PARA MUDAR A VELOCIDADE DO DIA: DL.DIA.DAY_DURATION (segundos reais de um dia inteiro), logo abaixo.
   (Não há atalho para acelerar nem pular o tempo: o dia passa igual para todo mundo.) */
(function () {
  'use strict';
  const DL = window.DL, D = window.DataLabDemo;
  if (!DL || !D) return;
  const G = D.game, scene = D.scene;

  // ===================== AJUSTES (fácil de mudar) =====================
  DL.DIA = {
    DAY_DURATION: 240, // segundos reais de um dia completo (manhã + tarde + noite): 240 = 4 minutos
    INICIO: 7,         // hora em que um jogo novo começa
    DENTRO_NOITE: 0.22, // quanto o data center escurece à noite (0 = nada, 1 = igual à rua)
    CLOCK_SCALE: 0.6,  // tamanho do relógio do canto (1 = tamanho original, 0.6 = 40% menor)
    // sombras na rua (prédios, postes, árvores, bancos, ponto de ônibus, carros e pessoas)
    SOMBRA_FORCA: 0.6,    // quão escura (0 = sem sombra, 1 = cor da sombra sólida); nunca preta: o chão aparece
    SOMBRA_TAMANHO: 1,    // comprimento (1 = normal; 1.5 = 50% mais compridas)
    SOMBRA_PREDIOS: 0.1,  // os prédios são altos: a sombra deles usa só esta parte do comprimento
    SOMBRA_MAX: 110,      // comprimento máximo de uma sombra (pixels do mapa), para não cobrir a rua inteira
    SOMBRA_LUA: 0.08,     // sombra fraquinha da lua à noite (0 = nenhuma)
    // o brilho verde do prédio do DataLab (letreiro, contorno neon, janelas): 0 = apagado, 1 = normal
    DC_DIA: 0.5,          // de dia: brilho médio
    DC_NOITE: 1.8,        // à noite: brilha MUITO e ilumina a calçada
  };
  const reduced = !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  /* ================================================================== */
  /* 1. O CICLO                                                         */
  /* ================================================================== */
  const PERIODOS = [
    { id: 'manha', nome: 'MANHÃ', de: 6, ate: 12 },
    { id: 'tarde', nome: 'TARDE', de: 12, ate: 18 },
    { id: 'noite', nome: 'NOITE', de: 18, ate: 30 }, // 18h até 06h do dia seguinte (30 = 24 + 6)
  ];
  // p: onde estamos no dia, de 0 a 1 (0 = 06h, 1/3 = 12h, 2/3 = 18h)
  const CICLO = { p: horaParaP(DL.DIA.INICIO), dias: 0 }; // dias: quantas viradas das 06h desde o começo

  // p → hora "do ciclo", de 6 a 30 (passa de 24 de madrugada: fica fácil misturar as cores)
  function horaDoCiclo(p) {
    p = ((p % 1) + 1) % 1;
    const k = p * 3, i = Math.min(2, Math.floor(k)), P = PERIODOS[i];
    return P.de + (P.ate - P.de) * (k - i);
  }
  function horaParaP(h) {
    h = ((h % 24) + 24) % 24;
    if (h < 6) h += 24;
    for (let i = 0; i < 3; i++) { const P = PERIODOS[i]; if (h < P.ate) return (i + (h - P.de) / (P.ate - P.de)) / 3; }
    return 0;
  }
  const periodoDe = (p) => PERIODOS[Math.min(2, Math.floor((((p % 1) + 1) % 1) * 3))];
  // "08:30" — de 10 em 10 minutos, como no Stardew
  function textoHora(h) {
    let m = Math.floor((h % 24) * 60);
    m -= m % 10;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }
  // o tempo anda junto com o jogo (para quando o jogo está pausado, na aba escondida, e no filme de abertura)
  function stepCycle(dt) {
    if (D.state.phase === 'intro' || (DL.Street && DL.Street.inIntro)) return;
    const p = CICLO.p + dt / Math.max(10, DL.DIA.DAY_DURATION);
    if (p >= 1) CICLO.dias++;
    CICLO.p = p % 1;
  }

  /* ================================================================== */
  /* 2. A ILUMINAÇÃO                                                    */
  /* ================================================================== */
  // As cores de algumas horas do dia; entre elas tudo se mistura aos poucos.
  //   ceu / horizonte: o céu de cima a baixo · mult: a cor que tinge a cena (branco = nada)
  //   luz + forca: um véu de luz clara por cima (dia) · noite: 0 = dia, 1 = noite (acende postes, janelas…)
  const NOITE = { ceu: '#060a1e', horizonte: '#1c2352', mult: '#7480bc', luz: '#000000', forca: 0, noite: 1 };
  const AMANHECER = { ceu: '#2b2350', horizonte: '#ff8f6b', mult: '#c9a9c4', luz: '#ff9a66', forca: 0.05, noite: 0.55 };
  const CHAVES = [
    [6.0, AMANHECER],
    [7.0, { ceu: '#5b8fd6', horizonte: '#ffc999', mult: '#f4dfcf', luz: '#ffd2a6', forca: 0.17, noite: 0.1 }],
    [8.5, { ceu: '#6fb4f2', horizonte: '#ffe2bd', mult: '#fff6ec', luz: '#fff0dc', forca: 0.24, noite: 0 }],
    [11.5, { ceu: '#5aa8f0', horizonte: '#cfe9ff', mult: '#ffffff', luz: '#eef7ff', forca: 0.27, noite: 0 }],
    [14.0, { ceu: '#5f9be0', horizonte: '#ffe6b3', mult: '#fff4e0', luz: '#ffe8b8', forca: 0.23, noite: 0 }],
    [16.0, { ceu: '#6d77c4', horizonte: '#ffb25e', mult: '#ffdcae', luz: '#ffb35c', forca: 0.18, noite: 0.04 }],
    [17.3, { ceu: '#4c3f8f', horizonte: '#ff7a45', mult: '#efae90', luz: '#ff8048', forca: 0.11, noite: 0.25 }],
    [18.4, { ceu: '#231d4a', horizonte: '#b8486a', mult: '#a08cba', luz: '#ff5a4a', forca: 0.04, noite: 0.7 }],
    [19.5, NOITE],
    [28.8, NOITE],
    [30.0, AMANHECER],
  ];
  const hexRgb = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const CHAVES_RGB = CHAVES.map(([h, k]) => [h, { ceu: hexRgb(k.ceu), horizonte: hexRgb(k.horizonte), mult: hexRgb(k.mult), luz: hexRgb(k.luz), forca: k.forca, noite: k.noite }]);
  const mix = (a, b, f) => a + (b - a) * f;
  const mixRgb = (a, b, f) => [mix(a[0], b[0], f), mix(a[1], b[1], f), mix(a[2], b[2], f)];
  const css = (c, a) => 'rgba(' + Math.round(c[0]) + ',' + Math.round(c[1]) + ',' + Math.round(c[2]) + ',' + (a == null ? 1 : Math.max(0, Math.min(1, a))).toFixed(3) + ')';
  const suave = (f) => f * f * (3 - 2 * f);
  // a chuva (weather.js) escurece a cena um pouco: entra na mesma cor que já tinge a tela (sem pintar a tela de
  // novo). ESCURO.rua / ESCURO.dentro: 0 = nada, 1 = preto; puxa para o azul.
  const ESCURO = { rua: 0, dentro: 0 };
  // o chão molhado (weather.js): as luzes viram reflexos compridos no asfalto e na calçada (0 a 1)
  let MOLHADO = 0;
  // o clarão de um raio (weather.js): por um instante, sombras fortes vindas da direção do raio
  const RELAMPAGO = { k: 0, dx: 0 };
  const escurecida = (m, k) => (k > 0.005 ? [m[0] * (1 - k), m[1] * (1 - k * 0.85), m[2] * (1 - k * 0.55)] : m);

  // O sol (de dia) ou a lua (de noite) e a sombra que fazem, girando aos poucos com o relógio.
  // Estamos no hemisfério sul: o sol passa pelo norte, então as sombras sempre apontam um pouco para o sul
  // (para a rua). De manhã o sol nasce no leste: sombras compridas para o oeste (−x); ao meio-dia, curtas e
  // quase embaixo; no fim da tarde, compridas para o leste (+x) e com a cor puxando para o roxo/laranja.
  //   dx, dy: para onde a sombra vai (no chão) · comp: comprimento por pixel de altura · forca · cor
  const COR_SOMBRA = { dia: [10, 12, 30], tarde: [52, 14, 50], noite: [6, 8, 30] };
  function solAgora(h, noite) {
    const A = DL.DIA;
    const astro = h >= 6 && h <= 18 ? { a: (Math.PI * (h - 6)) / 12, lua: false } : { a: (Math.PI * ((h < 6 ? h + 24 : h) - 18)) / 12, lua: true };
    const sobe = Math.sin(astro.a);                                       // 0 no horizonte, 1 lá em cima
    const graus = Math.max(7, sobe * 68) * (Math.PI / 180);              // altura do astro no céu
    const comp = Math.min(3.4, 1 / Math.tan(graus)) * A.SOMBRA_TAMANHO;
    const dx = -Math.cos(astro.a), dy = 0.9;
    const forca = astro.lua ? A.SOMBRA_LUA * noite * Math.min(1, sobe * 3) : A.SOMBRA_FORCA * Math.min(1, sobe * 4) * (1 - noite * 0.8);
    // perto do horizonte (manhã cedo e fim da tarde) a sombra fica arroxeada/alaranjada
    const baixo = astro.lua ? 0 : Math.max(0, 1 - sobe * 2.2);
    const cor = astro.lua ? COR_SOMBRA.noite : mixRgb(COR_SOMBRA.dia, COR_SOMBRA.tarde, h > 12 ? baixo : baixo * 0.6);
    return { dx, dy, comp, forca, cor, lua: astro.lua };
  }
  // a luz desta hora (calculada uma vez por quadro)
  let luzCache = { p: -1 };
  function luzAgora() {
    if (luzCache.p === CICLO.p) return luzCache;
    const h = horaDoCiclo(CICLO.p);
    let i = 0;
    while (i < CHAVES_RGB.length - 2 && h >= CHAVES_RGB[i + 1][0]) i++;
    const [h0, a] = CHAVES_RGB[i], [h1, b] = CHAVES_RGB[i + 1];
    const f = suave(Math.max(0, Math.min(1, (h - h0) / (h1 - h0))));
    luzCache = {
      p: CICLO.p, h,
      ceu: mixRgb(a.ceu, b.ceu, f), horizonte: mixRgb(a.horizonte, b.horizonte, f), mult: mixRgb(a.mult, b.mult, f),
      luz: mixRgb(a.luz, b.luz, f), forca: mix(a.forca, b.forca, f), noite: mix(a.noite, b.noite, f),
      sol: solAgora(h, mix(a.noite, b.noite, f)),
    };
    return luzCache;
  }

  // brilhos prontos (um círculo que some nas bordas), um por cor, desenhados com "lighter" (soma luz)
  const BRILHOS = new Map();
  function brilhoDe(rgb) {
    let c = BRILHOS.get(rgb);
    if (c) return c;
    c = DL.mk(64, 64);
    const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(' + rgb + ',1)');
    gr.addColorStop(0.22, 'rgba(' + rgb + ',0.6)');
    gr.addColorStop(0.55, 'rgba(' + rgb + ',0.18)');
    gr.addColorStop(1, 'rgba(' + rgb + ',0)');
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    BRILHOS.set(rgb, c);
    return c;
  }
  const rgbStr = (hex) => hexRgb(hex).join(',');
  // um brilho em (x, y), raio rx × ry (pixels iso), força a
  function brilho(g, rgb, x, y, rx, ry, a) {
    if (a <= 0.004) return;
    g.globalAlpha = Math.min(1, a);
    g.drawImage(brilhoDe(rgb), x - rx, y - ry, rx * 2, ry * 2);
  }

  /* ---------- a rua ---------- */
  const RUA = DL.Street && DL.Street.street, L = DL.Street && DL.Street.luz;
  const isoT = (g, sc) => g.setTransform(sc.S, 0, 0, sc.S, -sc.ox, -sc.oy);
  // a parte da tela que é "visível agora", em pixels iso
  const vista = (sc) => ({ x: sc.ox / sc.S, y: sc.oy / sc.S, w: sc.canvas.width / sc.S, h: sc.canvas.height / sc.S });
  const naVista = (v, x, y, m) => x > v.x - m && x < v.x + v.w + m && y > v.y - m && y < v.y + v.h + m;

  // as estrelas: posições fixas na tela (estão "infinitamente longe"), piscando
  const ESTRELAS = [];
  for (let i = 0; i < 90; i++) ESTRELAS.push({ x: DL.hash(i * 19 + 4), y: DL.hash(i * 23 + 9) * 0.75, v: 1.2 + DL.hash(i * 7 + 1) * 2.6, f: DL.hash(i * 3 + 5) * 6.3, big: DL.hash(i * 29 + 2) < 0.12 });
  // a lua (crescente) e o sol em pixel art
  const LUA = (() => {
    const c = DL.mk(13, 13), g = c.getContext('2d');
    for (let y = 0; y < 13; y++) for (let x = 0; x < 13; x++) {
      const d = Math.hypot(x - 6, y - 6), d2 = Math.hypot(x - 9, y - 4.5);
      if (d <= 6.2 && d2 > 5.2) { g.fillStyle = d > 5.2 ? '#c9d2ff' : (x + y) % 7 === 0 ? '#dfe5ff' : '#f2f5ff'; g.fillRect(x, y, 1, 1); }
    }
    g.fillStyle = '#c4ccf0'; g.fillRect(3, 7, 1, 1); g.fillRect(2, 4, 1, 1); g.fillRect(4, 10, 1, 1);
    return c;
  })();
  const SOL = (() => {
    const c = DL.mk(11, 11), g = c.getContext('2d');
    for (let y = 0; y < 11; y++) for (let x = 0; x < 11; x++) {
      const d = Math.hypot(x - 5, y - 5);
      if (d <= 5.2) { g.fillStyle = d > 4.2 ? '#ffd27a' : '#fff4c8'; g.fillRect(x, y, 1, 1); }
    }
    return c;
  })();

  // o céu atrás dos prédios (só onde o chão da cidade termina, como no filme de abertura)
  function desenharCeu(g, sc, luz) {
    const T = L.T, Y = L.SKY_Y, v = vista(sc);
    // só a parte da tela acima do horizonte (a linha que passa pela borda de trás do chão da cidade: nos
    // pixels iso, IY = IX / 2); abaixo dela street.js pinta a água e a cidade
    const Lx = v.x - 20, Rx = v.x + v.w + 20;
    if (v.y > Rx / 2 && v.y > Lx / 2) return; // o horizonte está acima da tela: só cidade e água
    isoT(g, sc);
    g.save();
    g.beginPath();
    g.moveTo(Lx, Lx / 2); g.lineTo(Rx, Rx / 2); g.lineTo(Rx, v.y - 20); g.lineTo(Lx, v.y - 20);
    g.closePath();
    g.clip();
    const top = Math.min(v.y, Y - 200), gr = g.createLinearGradient(0, top, 0, Y);
    gr.addColorStop(0, css(luz.ceu));
    gr.addColorStop(0.62, css(mixRgb(luz.ceu, luz.horizonte, 0.45)));
    gr.addColorStop(1, css(luz.horizonte));
    g.fillStyle = gr;
    g.fillRect(Lx, v.y - 20, Rx - Lx, v.h + 40);
    g.imageSmoothingEnabled = false;
    const n = luz.noite, t = sc.t;
    // estrelas
    if (n > 0.05) {
      for (const s of ESTRELAS) {
        const a = n * (reduced ? 0.8 : 0.45 + 0.55 * Math.abs(Math.sin(t * s.v + s.f)));
        g.fillStyle = 'rgba(235,240,255,' + a.toFixed(3) + ')';
        const x = Math.round(v.x + s.x * v.w), y = Math.round(v.y + s.y * v.h);
        g.fillRect(x, y, 1, 1);
        if (s.big && a > 0.6) { g.fillRect(x - 1, y, 3, 1); g.fillRect(x, y - 1, 1, 3); }
      }
    }
    // o sol (de dia) e a lua (de noite) atravessam o céu da esquerda para a direita
    const h = luz.h, dia = h >= 5.5 && h <= 18.5;
    const f = dia ? (h - 5.5) / 13 : ((h < 18.5 ? h + 24 : h) - 18.5) / 11;
    const arco = Math.sin(Math.PI * Math.max(0, Math.min(1, f)));
    const x = v.x + v.w * (0.1 + 0.8 * f), y = v.y + v.h * (0.36 - 0.26 * arco);
    g.globalCompositeOperation = 'lighter';
    if (dia) {
      brilho(g, '255,214,150', x, y, 70, 70, 0.55);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = 1;
      g.drawImage(SOL, Math.round(x - 5), Math.round(y - 5));
    } else {
      const pulso = reduced ? 1 : 0.85 + 0.15 * Math.sin(t * 1.4);
      brilho(g, '170,190,255', x, y, 46, 46, 0.35 * n * pulso);
      g.globalCompositeOperation = 'source-over';
      g.globalAlpha = Math.min(1, n * 1.4);
      g.drawImage(LUA, Math.round(x - 6), Math.round(y - 6));
    }
    g.globalAlpha = 1;
    g.restore();
  }

  // Sombras no chão. Tudo é desenhado numa camada em que 1 pixel = 1 pixel do pixel art do mapa, com a cor
  // da sombra sólida; depois a camada vai para a tela ampliada sem borrar e meio transparente. Assim as
  // bordas ficam em degraus de pixel e duas sombras que se cruzam não escurecem o dobro. Cada coisa é uma
  // caixa (base no chão + altura): a sombra é a base "esticada" na direção contrária ao sol.
  let sombraCanvas = null;
  // o contorno convexo de alguns pontos (a sombra de uma caixa)
  function casca(pts) {
    pts.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lo = [], hi = [];
    for (const p of pts) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (hi.length >= 2 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
    return lo.slice(0, -1).concat(hi.slice(0, -1));
  }
  // a sombra de uma caixa (x0..x1, y0..y1 no chão, altura H); k encurta (prédios), SOMBRA_MAX limita
  function sombraCaixa(g, s, x0, y0, x1, y1, H, k) {
    const len = Math.min(DL.DIA.SOMBRA_MAX, H * s.comp * (k || 1)), vx = s.dx * len, vy = s.dy * len;
    const pts = casca([[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0 + vx, y0 + vy], [x1 + vx, y0 + vy], [x1 + vx, y1 + vy], [x0 + vx, y1 + vy]]);
    g.beginPath();
    g.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) g.lineTo(pts[i][0], pts[i][1]);
    g.closePath();
    g.fill();
  }
  // a copa de uma árvore: um círculo no chão, deslocado pela altura dela
  function sombraCopa(g, s, x, y, H, r) {
    const len = Math.min(DL.DIA.SOMBRA_MAX, H * s.comp);
    g.beginPath();
    g.ellipse(x + s.dx * len, y + s.dy * len, r * (1 + Math.min(0.6, s.comp * 0.12)), r, 0, 0, Math.PI * 2);
    g.fill();
  }
  function desenharSombras(g, sc, luz) {
    const s = luz.sol;
    if (s.forca < 0.01) return;
    const S = sc.S, bx = Math.floor(sc.ox / S) - 1, by = Math.floor(sc.oy / S) - 1;
    const w = Math.ceil(sc.canvas.width / S) + 3, h = Math.ceil(sc.canvas.height / S) + 3;
    if (!sombraCanvas || sombraCanvas.width !== w || sombraCanvas.height !== h) sombraCanvas = DL.mk(w, h);
    const b = sombraCanvas.getContext('2d');
    b.setTransform(1, 0, 0, 1, 0, 0);
    b.clearRect(0, 0, w, h);
    // chão do mapa → pixels da camada (a mesma conta do iso.js, com zoom 1)
    b.setTransform(1, 0.5, -1, 0.5, -bx, -by);
    b.fillStyle = css(s.cor);
    const T = L.T, FY = L.FY, R = L.ROWS, A = DL.DIA, IX = L.IX, IY = L.IY;
    // só o que está na tela (com folga para o comprimento da sombra); de longe (zoom bem afastado) só as
    // sombras grandes: prédios, árvores, carros — as pequenas teriam 1 pixel
    const v = vista(sc), m = A.SOMBRA_MAX + 40, longe = sc.S < 2;
    const perto = (x, y) => { const X = IX(x, y), Y = IY(x, y, 0); return X > v.x - m && X < v.x + v.w + m && Y > v.y - m && Y < v.y + v.h + m; };
    // os prédios: as sombras ficam por baixo de tudo que está em pé (street.js desenha os prédios depois),
    // então a parte que cairia "atrás" de um prédio some sob ele
    for (const k of L.BLOCKS) if (perto((k.x0 + k.x1) * T / 2, k.y1 * T)) sombraCaixa(b, s, k.x0 * T, k.y0 * T, k.x1 * T, k.y1 * T, k.h, A.SOMBRA_PREDIOS);
    sombraCaixa(b, s, L.BLD.x0 * T, L.BLD.y0 * T, L.BLD.x1 * T, L.BLD.y1 * T, L.BLD.h, A.SOMBRA_PREDIOS);
    // as árvores e os carros (parados e andando)
    for (const t of L.TREES) if (perto(t.x, t.y)) { sombraCaixa(b, s, t.x - 1, t.y - 1, t.x + 1, t.y + 1, 9); sombraCopa(b, s, t.x, t.y, 15, 6); }
    for (const c of L.cars) if (c.art && perto(c.x, c.y)) sombraCaixa(b, s, c.x - c.L / 2, c.y - 5, c.x + c.L / 2, c.y + 5, c.model === 'van' ? 15 : 11);
    for (const c of L.PARKED || []) if (perto(c.x, c.y)) { const h = c.model === 'van' ? 15 : 11; if (c.axis === 'y') sombraCaixa(b, s, c.x - 5, c.y - 12, c.x + 5, c.y + 12, h); else sombraCaixa(b, s, c.x - 12, c.y - 5, c.x + 12, c.y + 5, h); }
    if (!longe) {
      // postes, semáforos, bancos, floreiras, sebes, o ponto de ônibus, os muros dos quintais
      for (const x of L.LAMPS) if (perto(x * T + 8, FY + 9)) sombraCaixa(b, s, x * T + 7, FY + 8, x * T + 9, FY + 10, 42);
      for (const x of L.FAR_LAMPS) if (perto(x * T + 8, R.far0 * T + 3)) sombraCaixa(b, s, x * T + 7, R.far0 * T + 2, x * T + 9, R.far0 * T + 4, 46);
      for (const l of L.LAMPS2 || []) if (perto(l.cx, l.cy)) sombraCaixa(b, s, l.cx - 1, l.cy - 1, l.cx + 1, l.cy + 1, 42);
      for (const l of L.LIGHTS) if (perto(l.cx, l.cy)) sombraCaixa(b, s, l.cx - 1, l.cy - 1, l.cx + 1, l.cy + 1, 41);
      for (const k of L.BENCHES) if (perto(k.x0, k.y0)) sombraCaixa(b, s, k.x0 + 1, k.y0, k.x0 + 2 * T - 1, k.y0 + 7.5, 12);
      for (const p of L.PLANTERS) if (perto(p[0] * T, FY + 8)) sombraCaixa(b, s, p[0] * T + 1, FY + 3, p[0] * T + T - 1, FY + 13, 11);
      for (const k of L.HEDGES) if (perto((k.x0 + k.x1) / 2, k.y0)) sombraCaixa(b, s, k.x0, k.y0, k.x1, k.y1, 7);
      if (perto(L.BUS.x0, L.BUS.y0)) sombraCaixa(b, s, L.BUS.x0, L.BUS.y0, L.BUS.x1, L.BUS.y1, 28);
      for (const k of L.YARDS || []) if (perto((k.x0 + k.x1) / 2, k.y1)) { sombraCaixa(b, s, k.x0, k.y1 - 1.5, k.x1, k.y1, k.h); sombraCaixa(b, s, k.x1 - 1.5, k.y0, k.x1, k.y1, k.h); }
      // a praça: postes, fonte, quiosque, parquinho, canteiros, arbustos
      for (const l of L.PARK_LAMPS || []) if (perto(l.cx, l.cy)) sombraCaixa(b, s, l.cx - 1, l.cy - 1, l.cx + 1, l.cy + 1, 32);
      for (const k of L.CAIXAS || []) if (perto(k.x0, k.y0)) sombraCaixa(b, s, k.x0, k.y0, k.x1, k.y1, k.h);
    }
    // as pessoas, o pet, quem passa na rua
    const pet = D.pet && D.pet.actor;
    const gente = [D.player].concat(pet ? [pet] : [], L.pedsOn('near'), L.pedsOn('road'), L.pedsOn('far'), L.pedsOn('back'));
    for (const a of gente) if (a && !a.hidden && perto(a.x, a.y)) sombraCaixa(b, s, a.x - 3, a.y - 2, a.x + 3, a.y + 1, a === pet ? 9 : 19);
    // a camada vai para a tela: ampliada sem borrar, transparente
    g.save();
    g.setTransform(S, 0, 0, S, -sc.ox, -sc.oy);
    g.imageSmoothingEnabled = false;
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = Math.min(0.85, s.forca);
    g.drawImage(sombraCanvas, bx, by);
    g.restore();
  }

  // por cima de tudo: a cor da hora (tinge e escurece à noite), um véu de luz de dia, e as luzes
  function iluminarRua(g, sc, luz) {
    const n = luz.noite, t = sc.t, T = L.T, IX = L.IX, IY = L.IY, v = vista(sc);
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    const m = escurecida(luz.mult, ESCURO.rua);
    if (m[0] < 254 || m[1] < 254 || m[2] < 254) {
      g.globalCompositeOperation = 'multiply';
      g.fillStyle = css(m);
      g.fillRect(0, 0, sc.canvas.width, sc.canvas.height);
    }
    if (luz.forca > 0.005) {
      g.globalCompositeOperation = 'screen';
      g.fillStyle = css(luz.luz, luz.forca);
      g.fillRect(0, 0, sc.canvas.width, sc.canvas.height);
    }
    // as luzes (somam claridade): fortes à noite, quase nada de dia (os letreiros brilham sempre um pouco).
    // São desenhadas numa camada 4× menor e depois esticadas por cima: brilho é borrado mesmo, e assim
    // custa 16× menos para o computador.
    const tela = g;
    g = camadaDeLuz(sc);
    const neon = 0.12 + 0.88 * n, longe = sc.S < 2;
    if (n > 0.02) {
      const FY = L.FY;
      // postes da calçada: a lâmpada, o cone de luz e a poça no chão
      const mo = MOLHADO;
      for (const x of L.LAMPS) {
        const cx = x * T + 8, hy = FY + 9 - 9.5, X = IX(cx, hy);
        if (!naVista(v, X, IY(cx, hy, 20), 80)) continue;
        brilho(g, '255,226,170', X, IY(cx, hy, 36), 13, 13, 0.75 * n);
        brilho(g, '255,214,150', X, IY(cx, hy, 18), 12, 24, 0.16 * n);
        brilho(g, '255,214,150', X, IY(cx, hy, 0), 40, 20, 0.42 * n);
        // chão molhado: o reflexo comprido da lâmpada na calçada
        if (mo > 0.02) brilho(g, '255,220,165', X, IY(cx, hy, 0) + 14, 6, 26, 0.32 * n * mo);
      }
      // os postes da avenida de trás e das ruas laterais (a cabeça fica 9.5 px atrás da base)
      for (const l of L.LAMPS2 || []) {
        const hy = l.cy - 9.5, X = IX(l.cx, hy);
        if (!naVista(v, X, IY(l.cx, hy, 20), 80)) continue;
        brilho(g, '255,226,170', X, IY(l.cx, hy, 36), 13, 13, 0.75 * n);
        brilho(g, '255,214,150', X, IY(l.cx, hy, 0), 40, 20, 0.4 * n);
        if (mo > 0.02) brilho(g, '255,220,165', X, IY(l.cx, hy, 0) + 14, 6, 24, 0.28 * n * mo);
      }
      // os postes da praça: a lanterna e uma poça de luz na grama
      for (const l of L.PARK_LAMPS || []) {
        const X = IX(l.cx, l.cy);
        if (!naVista(v, X, IY(l.cx, l.cy, 16), 70)) continue;
        brilho(g, '255,226,170', X, IY(l.cx, l.cy, 30.5), 11, 11, 0.7 * n);
        brilho(g, '255,214,150', X, IY(l.cx, l.cy, 0), 30, 15, 0.36 * n);
      }
      // postes do outro lado: a poça cai na pista, com um reflexo comprido no asfalto
      for (const x of L.FAR_LAMPS) {
        const cx = x * T + 8, hy = L.ROWS.far0 * T + 3 - 12.5, X = IX(cx, hy);
        if (!naVista(v, X, IY(cx, hy, 20), 80)) continue;
        brilho(g, '255,226,170', X, IY(cx, hy, 40), 13, 13, 0.7 * n);
        brilho(g, '255,214,150', X, IY(cx, hy, 0), 38, 19, 0.36 * n);
        brilho(g, '255,214,150', X, IY(cx, hy, 0) + 16, 5, 26, 0.18 * n * (1 + 1.6 * mo));
      }
      // janelas acesas dos prédios (de longe não: cada janela tem 1–2 pixels e os brilhos somariam um borrão)
      if (!longe) for (const w of L.WINDOWS) {
        if (!w.lit) continue;
        const X = IX(w.x + w.w / 2, w.y), Y = IY(w.x + w.w / 2, w.y, w.z1) + w.h / 2;
        if (!naVista(v, X, Y, 30)) continue;
        brilho(g, w.rgb || (w.rgb = rgbStr(w.col)), X, Y, w.w * 1.5 + 3, w.h * 1.2 + 3, 0.32 * n);
      }
      // faróis e lanternas dos carros
      for (const c of L.cars) {
        if (!c.art) continue;
        const fx = c.x + c.dir * (c.L / 2 + 18), bx = c.x - c.dir * (c.L / 2 + 2);
        if (!naVista(v, IX(c.x, c.y), IY(c.x, c.y, 0), 80)) continue;
        brilho(g, '255,240,205', IX(fx, c.y), IY(fx, c.y, 0), 30, 13, 0.4 * n);
        brilho(g, '255,50,50', IX(bx, c.y), IY(bx, c.y, 4), 8, 5, (c.braking ? 0.7 : 0.35) * n);
        // no asfalto molhado: os faróis e as lanternas refletem compridos
        if (mo > 0.02) { brilho(g, '255,240,205', IX(fx, c.y), IY(fx, c.y, 0) + 8, 5, 16, 0.3 * n * mo); brilho(g, '255,60,60', IX(bx, c.y), IY(bx, c.y, 0) + 8, 3, 12, 0.3 * n * mo); }
      }
      // as vitrines das lojas pequenas e as portas iluminadas
      for (const s of L.SHOPS) {
        const y = s.y != null ? s.y : L.ROWS.face * T, X = IX(s.x, y);
        if (!naVista(v, X, IY(s.x, y, 10), 80)) continue;
        const c = s.rgb || (s.rgb = rgbStr(s.glow));
        brilho(g, c, X, IY(s.x, y, 9), 26, 12, 0.3 * n);
        brilho(g, c, X, IY(s.x, y + 8, 0), 30, 12, 0.22 * n);
      }
    }
    // o DATA CENTER, o destaque da rua: de dia brilha médio, à noite brilha MUITO (DL.DIA.DC_DIA / DC_NOITE)
    // — o letreiro, o contorno neon (topo e quinas), as janelas verdes, a porta e a luz verde na calçada
    const B = L.BLD, fy = B.y1 * T, P = L.PANEL, ligado = L.signLit(t) ? 1 : 0.3, VERDE = '61,255,162';
    const dc = DL.DIA.DC_DIA + (DL.DIA.DC_NOITE - DL.DIA.DC_DIA) * n, bx0 = B.x0 * T, bx1 = B.x1 * T, top = B.h + 3;
    if (naVista(v, IX((bx0 + bx1) / 2, fy), IY((bx0 + bx1) / 2, fy, B.h / 2), 260)) {
      // o letreiro: um brilho por letra e um halo largo em volta
      for (let x = P.x + 8; x < P.x + P.w; x += 16) brilho(g, VERDE, IX(x, fy), IY(x, fy, P.z - P.h / 2), 22, 16, 0.5 * dc * ligado);
      brilho(g, VERDE, IX(P.x + P.w / 2, fy), IY(P.x + P.w / 2, fy, P.z - P.h / 2), P.w * 0.75, 44, 0.35 * dc * ligado);
      // o contorno: o topo da fachada, o topo do lado leste e as quinas
      for (let x = bx0; x <= bx1; x += 16) brilho(g, VERDE, IX(x, fy), IY(x, fy, top), 12, 8, 0.32 * dc);
      for (let y = B.y0 * T; y < fy; y += 16) brilho(g, VERDE, IX(bx1, y), IY(bx1, y, top), 10, 7, 0.22 * dc);
      for (let z = 6; z < top; z += 14) for (const x of [bx0, bx1]) brilho(g, VERDE, IX(x, fy), IY(x, fy, z), 7, 10, 0.26 * dc);
      // as janelas verdes dos dois andares
      for (const [za, zb] of L.DC_FLOORS || []) for (let x = bx0 + 20; x < bx1 - 10; x += 26) brilho(g, VERDE, IX(x, fy), IY(x, fy, (za + zb) / 2), 18, 12, 0.2 * dc);
      // o saguão de vidro e a porta
      for (let x = bx0 + 16; x < bx1 - 8; x += 24) brilho(g, VERDE, IX(x, fy), IY(x, fy, 13), 16, 12, 0.22 * dc);
      brilho(g, VERDE, IX(L.DOOR_X * T + 8, fy), IY(L.DOOR_X * T + 8, fy, 14), 20, 24, 0.4 * dc);
    }
    // a luz verde que cai na calçada e chega até a rua (só quando escurece: de dia o sol ganha)
    if (n > 0.02) {
      const cx = (bx0 + bx1) / 2;
      brilho(g, VERDE, IX(cx, fy + 18), IY(cx, fy + 18, 0), 150, 44, 0.42 * n * (0.6 + 0.4 * ligado));
      brilho(g, VERDE, IX(L.DOOR_X * T + 8, fy + 12), IY(L.DOOR_X * T + 8, fy + 12, 0), 60, 22, 0.35 * n);
      // reflexo no asfalto (como chão molhado): faixas compridas e fracas sob o letreiro
      for (let x = P.x + 30; x < P.x + P.w; x += 50) brilho(g, VERDE, IX(x, fy + 60), IY(x, fy + 60, 0), 10, 40, 0.14 * n * ligado * (1 + 2 * MOLHADO));
    }
    // os letreiros neon das duas lojas, as vitrines e a luz que jogam na calçada
    for (const f of L.LOJA_FRONTS) {
      const y = L.ROWS.face * T, s = f.sign, sx = s.x + s.on.width / 2, c = f.rgb || (f.rgb = rgbStr(f.shop.neon));
      if (!naVista(v, IX(sx, y), IY(sx, y, 20), 120)) continue;
      const pisca = reduced ? 1 : 0.9 + 0.1 * Math.sin(t * 2.2 + f.mid);
      brilho(g, c, IX(sx, y), IY(sx, y, s.z - s.on.height / 2), s.on.width * 0.6, 14, 0.55 * neon * pisca);
      brilho(g, c, IX(sx, y), IY(sx, y, s.z - s.on.height / 2), s.on.width * 0.9, 26, 0.25 * neon * pisca);
      for (const [a, b] of f.wins) brilho(g, f.shop.light, IX((a + b) / 2, y), IY((a + b) / 2, y, 11), 18, 12, 0.3 * n);
      brilho(g, f.shop.light, IX(f.mid, y + 12), IY(f.mid, y + 12, 0), 50, 18, 0.3 * n);
      // reflexo do letreiro no chão (como asfalto molhado): uma faixa comprida e fraca
      brilho(g, c, IX(sx, y + 20), IY(sx, y + 20, 0), 8, 22, 0.12 * n * (1 + 2 * MOLHADO));
    }
    // a camada de luz por cima da cena
    g.globalAlpha = 1;
    tela.setTransform(1, 0, 0, 1, 0, 0);
    tela.globalCompositeOperation = 'lighter';
    tela.imageSmoothingEnabled = true;
    tela.drawImage(g.canvas, 0, 0, g.canvas.width * LUZ_Q, g.canvas.height * LUZ_Q);
    tela.restore();
  }
  // a camada das luzes (reaproveitada a cada quadro)
  const LUZ_Q = 4;
  let luzCanvas = null;
  function camadaDeLuz(sc) {
    const w = Math.ceil(sc.canvas.width / LUZ_Q), h = Math.ceil(sc.canvas.height / LUZ_Q);
    if (!luzCanvas || luzCanvas.width !== w || luzCanvas.height !== h) luzCanvas = DL.mk(w, h);
    const g = luzCanvas.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.clearRect(0, 0, w, h);
    g.globalCompositeOperation = 'lighter';
    g.imageSmoothingEnabled = true;
    g.setTransform(sc.S / LUZ_Q, 0, 0, sc.S / LUZ_Q, -sc.ox / LUZ_Q, -sc.oy / LUZ_Q);
    return g;
  }

  /* ---------- dentro do data center: o visual neon fica; à noite, só um pouco mais escuro e azulado ---------- */
  function iluminarDentro(g, sc, luz) {
    const k = DL.DIA.DENTRO_NOITE, m = escurecida(mixRgb([255, 255, 255], luz.mult, k), ESCURO.dentro);
    if (m[0] > 253 && m[1] > 253 && m[2] > 253) return;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = css(m);
    g.fillRect(0, 0, sc.canvas.width, sc.canvas.height);
    g.restore();
  }

  // ligar nas cenas: a rua (antes dos prédios: o céu; antes das pessoas: as sombras; no fim: a luz)
  const filme = () => DL.Street && DL.Street.inIntro;
  if (RUA && L) {
    const baseUnder = RUA.underlay, baseOver = RUA.overlay;
    RUA.underlay = function (g, sc) {
      const luz = !filme() && luzAgora();
      if (luz) desenharCeu(g, sc, luz);
      baseUnder.call(this, g, sc);
    };
    // as sombras no chão: street.js chama logo depois de pintar a água, antes dos prédios e das pessoas
    // (que ficam por cima delas)
    RUA.shadows = function (g, sc) {
      if (filme()) return;
      // no clarão de um raio, por um instante as sombras vêm dele (fortes e compridas), não do sol / da lua
      if (RELAMPAGO.k > 0.06) desenharSombras(g, sc, { sol: { dx: RELAMPAGO.dx, dy: 0.9, comp: 1.6, forca: Math.min(0.75, 0.75 * RELAMPAGO.k), cor: [4, 6, 26], lua: true } });
      else desenharSombras(g, sc, luzAgora());
    };
    RUA.overlay = function (g, sc) {
      baseOver.call(this, g, sc);
      if (!filme()) iluminarRua(g, sc, luzAgora());
    };
  }
  const baseDentro = scene.overlay;
  scene.overlay = function (g, sc) {
    if (baseDentro) baseDentro.call(this, g, sc);
    if (!(DL.Street && DL.Street.outside) && !filme()) iluminarDentro(g, sc, luzAgora());
  };

  /* ================================================================== */
  /* 3. O RELÓGIO (canto superior esquerdo, estilo Stardew Valley)       */
  /* ================================================================== */
  const W = 56, H = 32; // o mostrador em pixels (mostrado 2× maior, sem borrar)
  let R = null; // os elementos do painel
  function criarRelogio() {
    const raiz = document.getElementById('game') || document.body;
    const el = document.createElement('div');
    el.className = 'dn-clock';
    el.setAttribute('role', 'status');
    el.title = 'Hora do dia';
    el.innerHTML =
      '<canvas class="dn-clock__dial" width="' + W + '" height="' + H + '" aria-hidden="true"></canvas>' +
      '<div class="dn-clock__info">' +
      '<span class="dn-clock__time">07:00</span>' +
      '<span class="dn-clock__period">MANHÃ</span>' +
      '</div>';
    el.style.setProperty('--clock-scale', String(DL.DIA.CLOCK_SCALE));
    raiz.appendChild(el);
    R = { el, dial: el.querySelector('canvas'), hora: el.querySelector('.dn-clock__time'), per: el.querySelector('.dn-clock__period'), txt: '', perId: '', oculto: null };
    R.g = R.dial.getContext('2d');
  }
  // uma linha de pixels (Bresenham)
  function linhaPx(g, x0, y0, x1, y1, cor) {
    x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let e = dx + dy;
    g.fillStyle = cor;
    for (let i = 0; i < 200; i++) {
      g.fillRect(x0, y0, 1, 1);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * e;
      if (e2 >= dy) { e += dy; x0 += sx; }
      if (e2 <= dx) { e += dx; y0 += sy; }
    }
  }
  // meio círculo cheio, de pixels inteiros (centro cx, base cy, raio r)
  function meioCirculo(g, cx, cy, r, cor) {
    g.fillStyle = cor;
    for (let y = 0; y <= r; y++) {
      const w = Math.floor(Math.sqrt(r * r - y * y) + 0.35);
      g.fillRect(cx - w, cy - y, w * 2 + 1, 1);
    }
  }
  const CORES = { manha: '#ffd166', tarde: '#ff8a3d', noite: '#9aa8ff' };
  const SKYLINE = [3, 5, 4, 7, 6, 3, 8, 5, 4, 6, 9, 5, 3, 6, 4, 7, 5, 3, 4, 8, 6, 4, 5, 3, 6, 7, 4, 5, 3, 6, 5, 4, 7, 3, 5, 6, 4, 8, 5, 3, 4, 6, 5, 7, 3, 5, 4, 6, 3, 5, 4];
  function desenharMostrador(t) {
    const g = R.g, luz = luzAgora(), per = periodoDe(CICLO.p), cor = CORES[per.id], n = luz.noite;
    const cx = 28, cy = 29, r = 24;
    g.clearRect(0, 0, W, H);
    // moldura: verde neon por fora, cor do período por dentro
    meioCirculo(g, cx, cy, r + 3, '#0b2a1f');
    meioCirculo(g, cx, cy, r + 2, '#3dffa2');
    meioCirculo(g, cx, cy, r + 1, '#06120d');
    // o céu da hora, de cima (escuro) para baixo (horizonte)
    for (let y = 0; y <= r; y++) {
      const w = Math.floor(Math.sqrt(r * r - y * y) + 0.35);
      g.fillStyle = css(mixRgb(luz.horizonte, luz.ceu, Math.min(1, y / r * 1.15)));
      g.fillRect(cx - w, cy - y, w * 2 + 1, 1);
    }
    // estrelas à noite
    if (n > 0.1) {
      for (let i = 0; i < 14; i++) {
        const a = Math.PI * (0.08 + 0.84 * DL.hash(i * 5 + 1)), d = 6 + DL.hash(i * 11 + 3) * (r - 8);
        if (!reduced && Math.sin(t * (1.5 + DL.hash(i) * 2) + i) < -0.6) continue;
        g.fillStyle = 'rgba(240,244,255,' + (0.5 + 0.5 * n).toFixed(2) + ')';
        g.fillRect(Math.round(cx + Math.cos(a) * d), Math.round(cy - Math.sin(a) * d), 1, 1);
      }
    }
    // marcas das horas ao longo do arco
    for (let i = 0; i <= 6; i++) {
      const a = Math.PI * (1 - i / 6);
      g.fillStyle = i % 3 === 0 ? '#e6fff3' : 'rgba(230,255,243,0.55)';
      g.fillRect(Math.round(cx + Math.cos(a) * (r - 1)), Math.round(cy - Math.sin(a) * (r - 1)), 1, 1);
    }
    // uma cidadezinha no horizonte (janelas acesas à noite)
    for (let x = 0; x < SKYLINE.length; x++) {
      const px = cx - 25 + x, hh = SKYLINE[x];
      if (px < cx - r || px > cx + r) continue;
      g.fillStyle = '#081510';
      g.fillRect(px, cy - hh + 1, 1, hh);
      if (n > 0.4 && hh > 4 && (x * 7) % 5 === 0) { g.fillStyle = (x + Math.floor(t * 0.5)) % 4 ? '#ffd98a' : '#3dffa2'; g.fillRect(px, cy - hh + 3, 1, 1); }
    }
    // o ponteiro: do centro até o sol (06h–18h) ou a lua (18h–06h)
    const h = luz.h, f = h < 18 ? (h - 6) / 12 : (h - 18) / 12;
    const ang = Math.PI * (1 - f), ix = cx + Math.cos(ang) * (r - 7), iy = cy - Math.sin(ang) * (r - 7);
    linhaPx(g, cx, cy, ix, iy, 'rgba(230,255,243,0.75)');
    g.fillStyle = '#3dffa2';
    g.fillRect(cx - 1, cy - 1, 3, 2);
    // o ícone: sol amarelo (manhã), sol alaranjado (tarde), lua (noite), pulsando de leve
    const pulso = reduced ? 0 : Math.sin(t * 3);
    const X = Math.round(ix), Y = Math.round(iy);
    if (per.id === 'noite') {
      if (pulso > 0) { g.fillStyle = 'rgba(154,168,255,0.35)'; g.fillRect(X - 4, Y - 3, 9, 7); g.fillRect(X - 3, Y - 4, 7, 9); }
      g.fillStyle = '#eef1ff';
      g.fillRect(X - 2, Y - 3, 3, 1); g.fillRect(X - 3, Y - 2, 3, 5); g.fillRect(X - 2, Y + 3, 3, 1); g.fillRect(X - 1, Y - 2, 1, 1); g.fillRect(X - 1, Y + 2, 1, 1);
      g.fillStyle = '#b9c3ff'; g.fillRect(X - 3, Y + 1, 1, 1);
    } else {
      const core = per.id === 'manha' ? '#fff3a8' : '#ffd08a', borda = per.id === 'manha' ? '#ffcc33' : '#ff7a1f';
      // raios: alternam entre retos e diagonais
      g.fillStyle = borda;
      if (pulso >= 0) { g.fillRect(X, Y - 5, 1, 2); g.fillRect(X, Y + 4, 1, 2); g.fillRect(X - 5, Y, 2, 1); g.fillRect(X + 4, Y, 2, 1); }
      else { g.fillRect(X - 4, Y - 4, 1, 1); g.fillRect(X + 4, Y - 4, 1, 1); g.fillRect(X - 4, Y + 4, 1, 1); g.fillRect(X + 4, Y + 4, 1, 1); }
      g.fillRect(X - 2, Y - 3, 5, 7); g.fillRect(X - 3, Y - 2, 7, 5);
      g.fillStyle = core;
      g.fillRect(X - 1, Y - 2, 3, 5); g.fillRect(X - 2, Y - 1, 5, 3);
    }
    // a linha do chão
    g.fillStyle = cor;
    g.fillRect(cx - r - 3, cy + 1, (r + 3) * 2 + 1, 1);
    g.fillStyle = '#3dffa2';
    g.fillRect(cx - r - 3, cy + 2, (r + 3) * 2 + 1, 1);
  }
  let acc = 0;
  function atualizarRelogio(dt) {
    if (!R) return;
    const game = document.getElementById('game');
    const oculto = !!(game && (game.classList.contains('is-title') || game.classList.contains('is-build') || game.classList.contains('is-crew'))) || D.state.phase === 'intro' || !!filme() || !!(DL.Street && DL.Street.place);
    if (oculto !== R.oculto) { R.oculto = oculto; R.el.classList.toggle('is-hidden', oculto); }
    if (oculto) return;
    const h = horaDoCiclo(CICLO.p), txt = textoHora(h), per = periodoDe(CICLO.p);
    if (txt !== R.txt) { R.txt = txt; R.hora.textContent = txt; R.el.setAttribute('aria-label', 'Hora do dia: ' + txt + ', ' + per.nome.toLowerCase()); }
    if (per.id !== R.perId) { R.perId = per.id; R.per.textContent = per.nome; R.el.dataset.period = per.id; }
    // o mostrador anima a uns 15 quadros por segundo (é pequeno, mas não precisa de mais)
    acc += dt;
    if (acc >= 1 / 15) { acc = 0; desenharMostrador(performance.now() / 1000); }
  }

  /* ---------- ligar no jogo ---------- */
  criarRelogio();
  let ultimo = performance.now();
  G.on('step', (dt) => stepCycle(dt));
  // o relógio é atualizado a cada quadro desenhado
  const baseRender = scene.render;
  scene.render = function () {
    baseRender.apply(this, arguments);
    const agora = performance.now();
    atualizarRelogio(Math.min(0.25, (agora - ultimo) / 1000));
    ultimo = agora;
  };
  // um jogo novo começa de manhã (um jogo carregado volta para a hora salva: restore)
  G.on('game-begin', () => { CICLO.p = horaParaP(DL.DIA.INICIO); CICLO.dias = 0; });

  DL.DayNight = {
    get hora() { return textoHora(horaDoCiclo(CICLO.p)); },
    get periodo() { return periodoDe(CICLO.p).id; },
    get noite() { return luzAgora().noite; },
    // a luz desta hora (street.js: a cor do horizonte e da costa ao longe)
    luz: () => luzAgora(),
    get rapido() { return false; }, // (o tempo não acelera mais; weather.js ainda pergunta)
    // a chuva escurecendo a cena (weather.js): rua e dentro do prédio, 0 a 1
    molhado(k) { MOLHADO = Math.max(0, Math.min(1, k || 0)); },
    relampago(k, dx) { RELAMPAGO.k = Math.max(0, Math.min(1, k || 0)); RELAMPAGO.dx = dx || 0; },
    escurecer(rua, dentro) { ESCURO.rua = Math.max(0, Math.min(0.9, rua || 0)); ESCURO.dentro = Math.max(0, Math.min(0.9, dentro || 0)); },
    get dias() { return CICLO.dias; },
    // quantas janelas dos vizinhos ficam acesas (street.js): poucas de dia, quase todas à noite
    windowChance: () => 0.18 + 0.62 * luzAgora().noite,
    // salvar e carregar (save-service.js)
    snapshot: () => ({ p: Math.round(CICLO.p * 10000) / 10000 }),
    restore(d) { if (d && typeof d.p === 'number' && isFinite(d.p)) CICLO.p = ((d.p % 1) + 1) % 1; },
  };
})();
