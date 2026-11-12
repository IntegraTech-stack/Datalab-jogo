/* DataLab — Créditos da tela inicial (index.html): uma sequência de cinema apresentando a equipe.
   Cada integrante tem a sua cena (a roupa "DEV ..." de cada um, as mesmas skins do jogo, desenhadas
   por sprites.js + cosmetics.js): entra pela lateral com o seu efeito, o nome aparece embaixo e a frase
   vai sendo digitada letra por letra. Depois, a cena final com a equipe toda junta, que fica parada até
   o jogador fechar.

   A sequência toca SOZINHA: Tiago → Pierre → João Pedro → Abner → equipe toda junta.
   Pular: Enter, Esc, Espaço, toque/clique ou o botão PULAR — só vale depois de TEMPO.travaPular
   segundos de cada cena (assim a tecla / o toque que abriu os créditos nunca pula nada).
   Na cena final o botão vira FECHAR.
   Uso (index.html): DL.credits.open(aoFechar)

   Desempenho: um canvas pequeno (~300 px de altura) ampliado com pixel nítido, a 30 quadros por segundo,
   com tempo delta; partículas, chuva de código e rede em conjuntos fixos reaproveitados; nada é criado a
   cada quadro. Ao fechar, o laço, os ouvintes de teclado/toque e o áudio param, e ao abrir de novo tudo
   recomeça da cena do Tiago. cosmetics.js e emotes.js só são baixados na primeira vez que os créditos abrem.

   Observação: a sequência toca mesmo com "movimento reduzido" ligado no sistema (no Windows: Efeitos de
   animação desligados). Antes, essa opção fazia os créditos pularem direto para a cena final. */
(function () {
  'use strict';
  const DL = (window.DL = window.DL || {});

  /* ======================================================================================
     TEXTOS E TEMPOS — mude aqui
     - nome / titulo / frase: o que aparece na tela
     - efeito: 'cyber' (Tiago), 'codigo' (Pierre), 'rede' (João Pedro), 'epica' (Abner)
     - lado: de onde entra ('esquerda' ou 'direita'); sai pelo lado oposto
     - duracao: segundos da cena (quando a trilha sonora toca, a duração vem dela: CENAS em creditos-musica.js,
       em compassos, para a música e a cena acabarem juntas)
     - tag: o título curto embaixo do nome na cena final
     ====================================================================================== */
  const EQUIPE = [
    {
      id: 'tiago', nome: 'TIAGO FARIAS', titulo: 'Cybersecurity', tag: 'Cybersecurity',
      frase: 'Nenhum firewall o impede. Guardião de cada porta, caçador de cada brecha.',
      efeito: 'cyber', lado: 'esquerda', duracao: 6, cor: '#2de2c8',
    },
    {
      id: 'dev_pierre', nome: 'PIERRE DA PAZ', titulo: 'Dev', tag: 'Dev',
      frase: 'Linha por linha, ele escreveu o datacenter inteiro. Onde há bug, há Pierre.',
      efeito: 'codigo', lado: 'direita', duracao: 6, cor: '#3dffa2',
    },
    {
      id: 'joao_pedro', nome: 'JOÃO PEDRO MEDEIROS', titulo: 'Mestre das Redes', tag: 'Mestre das Redes',
      frase: 'Cabo por cabo, pacote por pacote. Se existe conexão, ele traçou o caminho.',
      efeito: 'rede', lado: 'esquerda', duracao: 6, cor: '#a0c3ec',
    },
    {
      id: 'abner', nome: 'ABNER CASTRO', titulo: 'A Mente por Trás do DataLab', tag: 'A Mente por Trás do DataLab',
      frase: 'Cada pixel nasceu da sua imaginação. O DataLab é ideia dele, do primeiro rack ao último byte.',
      efeito: 'epica', duracao: 8, cor: '#f2c14e', destaque: true,
    },
  ];
  // the final scene's information (the same texts the old Créditos window had)
  const FINAL = {
    versao: 'DATALAB · V0.9 · ACESSO ANTECIPADO',
    fontes: 'Fontes: Press Start 2P (CodeMan38) · Silkscreen (Jason Kottke) · VT323 (Peter Hull)',
    obrigado: 'OBRIGADO POR TESTAR!',
  };
  const TEMPO = {
    entrada: 1.1,       // segundos correndo da lateral até o centro
    saida: 0.75,        // segundos correndo do centro para fora, no fim da cena
    letras: 30,         // letras digitadas por segundo (acelera sozinho se a frase não couber na cena)
    letrasDestaque: 28, // letras por segundo na cena do Abner
    transicao: 0.4,     // segundos da transição (glitch + fade) entre uma cena e a próxima
    travaPular: 1.0,    // segundos do começo de cada cena em que pular ainda não vale
    finalIntervalo: 0.45, // na cena final, segundos entre a entrada de um e do próximo
  };

  /* ====================================================================================== */

  // a trilha sonora (assets/js/creditos-musica.js): as cenas seguem o compasso da música
  const MUS = DL.creditosMusica || null;
  if (MUS) {
    EQUIPE.forEach((m, i) => { m.duracao = MUS.duracaoCena(i); });
    TEMPO.entrada = 2 * MUS.batida;   // ele pousa no meio na 2ª batida (o impacto da música)
  }
  const IMPACTO = MUS ? MUS.impactoAbner : 1.0;   // segundos até o Abner cair do céu (o impacto da música)

  const SETTINGS_KEY = 'datalab.settings.v1';   // the game's Configurações (demo.js): sfxVol 0..10
  const INK = '#05070d';
  const ORDER_FINAL = ['tiago', 'dev_pierre', 'joao_pedro'];   // bottom row, left to right
  const BASE = { body: 'm', skin: '#e0ac7e', hair: '#5a3a25', hairStyle: 'short', shirt: '#2f3a4d', pants: '#232a36', shoes: '#16181d' };
  const GEAR = { dev_pierre: { face: 'wayfarer' }, joao_pedro: { hands: 'netbook' } };
  const EMO_ON = { tone: 'emote' };   // tells DL.charFx an emote is playing (hides the idle effects)

  /* ---------------- tiny helpers ---------------- */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const ease = (x) => 1 - Math.pow(1 - clamp(x, 0, 1), 3);
  const frac = (x) => x - Math.floor(x);
  const hh = (n) => {
    let h = Math.imul(n | 0, 0x9e3779b1); h ^= h >>> 15; h = Math.imul(h, 0x85ebca77); h ^= h >>> 13;
    return (h >>> 0) / 4294967296;
  };
  const el = (tag, cls, parent, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  };
  // a tiny pixel picture from text rows ('.' = empty, any other letter = a colour of pal)
  function pixmap(rows, pal) {
    const c = document.createElement('canvas');
    c.width = rows[0].length; c.height = rows.length;
    const g = c.getContext('2d');
    rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (pal[r[x]]) { g.fillStyle = pal[r[x]]; g.fillRect(x, y, 1, 1); } });
    return c;
  }
  // the skins live in cosmetics.js (+ emotes.js for the emotes): fetched the first time the credits open
  let loading = null;
  function need() {
    if (loading) return loading;
    const one = (src, ok) => (ok ? Promise.resolve() : new Promise((res) => {
      const s = document.createElement('script');
      s.src = src; s.onload = res; s.onerror = res;   // offline: the characters fall back to the base look
      document.head.appendChild(s);
    }));
    loading = one('assets/js/cosmetics.js', !!DL.charCostume).then(() => one('assets/js/emotes.js', !!DL.emote));
    return loading;
  }

  /* ---------------- accents for the pixel font ----------------
     Press Start 2P draws the accented capitals badly (Ã looks like Ä, É/Ê/Ó come out as small letters).
     pixelAccents(el) swaps each accented letter for the plain letter + a pixel accent drawn on top by CSS
     (.pxa in creditos.css), so "JOÃO" and "CRÉDITOS" read right without changing the rest of the font.
     Works on uppercase text and on text shown with text-transform: uppercase. */
  const ACC_ROWS = {
    til: ['..XX..X', '.X..XX.'],
    agudo: ['....XX.', '...XX..'],
    circ: ['..XXX..', '.XX.XX.'],
    grave: ['.XX....', '..XX...'],
    ced: ['...XX..', '..XX...'],
  };
  const ACC_URI = {};
  for (const k in ACC_ROWS) {
    let d = '';
    ACC_ROWS[k].forEach((r, y) => { for (let x = 0; x < r.length; x++) if (r[x] === 'X') d += 'M' + x + ' ' + y + 'h1v1h-1z'; });
    ACC_URI[k] = 'url("data:image/svg+xml,' + encodeURIComponent("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 2' width='8' height='2' preserveAspectRatio='none' shape-rendering='crispEdges'><path d='" + d + "'/></svg>") + '")';
  }
  const ACC = {};
  [['ÃÕ', 'AO', 'til'], ['ãõ', 'ao', 'til'], ['ÁÉÍÓÚ', 'AEIOU', 'agudo'], ['áéíóú', 'aeiou', 'agudo'],
    ['ÂÊÔ', 'AEO', 'circ'], ['âêô', 'aeo', 'circ'], ['À', 'A', 'grave'], ['à', 'a', 'grave'], ['Ç', 'C', 'ced'], ['ç', 'c', 'ced']]
    .forEach(([from, to, a]) => { for (let i = 0; i < from.length; i++) ACC[from[i]] = [to[i], a]; });
  const ACC_RE = /[ÃÕãõÁÉÍÓÚáéíóúÂÊÔâêôÀàÇç]/;
  function pixelAccents(root) {
    if (!root) return;
    const walk = document.createTreeWalker(root, NodeFilter.SHOW_TEXT), found = [];
    for (let n = walk.nextNode(); n; n = walk.nextNode()) if (ACC_RE.test(n.nodeValue) && !n.parentNode.closest('.pxa')) found.push(n);
    for (const n of found) {
      // one wrapper span, so a flex parent (the menu items) still sees a single piece of text
      const f = document.createElement('span'), s = n.nodeValue;
      f.className = 'pxw';
      let run = '';
      for (const ch of s) {
        const a = ACC[ch];
        if (!a) { run += ch; continue; }
        if (run) { f.appendChild(document.createTextNode(run)); run = ''; }
        const sp = el('span', 'pxa' + (a[1] === 'ced' ? ' pxa--ced' : ''), f, a[0]);
        sp.style.setProperty('--m', ACC_URI[a[1]]);
      }
      if (run) f.appendChild(document.createTextNode(run));
      n.parentNode.replaceChild(f, n);
    }
  }
  DL.pixelAccents = pixelAccents;

  /* ---------------- sound: short WebAudio blips, at the game's effects volume ---------------- */
  const Snd = (() => {
    let ac = null, out = null, noise = null, on = 0;
    function level() {
      try {
        const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
        const v = s.sfxVol == null ? 6 : Number(s.sfxVol);
        return isFinite(v) ? clamp(v, 0, 10) / 10 : 0.6;
      } catch (e) { return 0.6; }
    }
    function ctx() {
      if (!ac) {
        const A = window.AudioContext || window.webkitAudioContext;
        if (!A) return null;
        ac = new A();
        out = ac.createGain();
        out.connect(ac.destination);
        const n = Math.floor(ac.sampleRate * 0.6);
        noise = ac.createBuffer(1, n, ac.sampleRate);
        const d = noise.getChannelData(0);
        for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
      }
      if (ac.state === 'suspended') ac.resume();
      return ac;
    }
    function tone(type, f0, f1, dur, vol, when) {
      const t = ac.currentTime + (when || 0), o = ac.createOscillator(), g = ac.createGain();
      o.type = type;
      o.frequency.setValueAtTime(f0, t);
      if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(out);
      o.start(t); o.stop(t + dur + 0.03);
    }
    function hiss(dur, vol, type, f0, f1, when) {
      const t = ac.currentTime + (when || 0), s = ac.createBufferSource(), f = ac.createBiquadFilter(), g = ac.createGain();
      s.buffer = noise;
      f.type = type; f.frequency.setValueAtTime(f0, t);
      if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.05, dur / 3));
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(out);
      s.start(t); s.stop(t + dur + 0.03);
    }
    const SOUNDS = {
      type: () => tone('square', 1500 + Math.random() * 500, 0, 0.025, 0.035),
      shine: () => { tone('triangle', 880, 0, 0.12, 0.12); tone('triangle', 1320, 0, 0.12, 0.1, 0.07); tone('triangle', 1760, 0, 0.2, 0.08, 0.14); },
      whoosh: () => hiss(0.45, 0.16, 'bandpass', 500, 2600),
      glitch: () => { for (let i = 0; i < 4; i++) tone('square', 200 + Math.random() * 1400, 0, 0.04, 0.05, i * 0.07); },
      rise: () => { hiss(1.0, 0.12, 'bandpass', 200, 3000); tone('sawtooth', 70, 220, 1.0, 0.05); },
      impact: () => { tone('sine', 120, 38, 0.7, 0.6); hiss(0.5, 0.35, 'lowpass', 1800, 120); tone('triangle', 660, 0, 0.5, 0.06, 0.05); tone('triangle', 990, 0, 0.6, 0.05, 0.12); },
      slam: () => { tone('square', 220, 110, 0.12, 0.08); hiss(0.15, 0.12, 'lowpass', 2400, 400); },
      pop: () => { tone('triangle', 660, 1320, 0.1, 0.09); },
      zap: () => { hiss(0.25, 0.14, 'highpass', 3000, 800); tone('square', 1200, 300, 0.18, 0.06); },
      lock: () => { tone('square', 520, 0, 0.05, 0.07); tone('square', 1040, 0, 0.08, 0.06, 0.06); },
      ping: () => { tone('sine', 1760, 1320, 0.12, 0.08); },
    };
    return {
      open() { on = level(); if (!on || !ctx()) return; out.gain.value = on * (MUS ? 0.6 : 1); },   // mais baixo: a música manda
      play(name) { if (!on || !ac) return; if (MUS && MUS.tocando() && (name === 'rise' || name === 'impact')) return; try { SOUNDS[name](); } catch (e) { /* audio blocked: silent */ } },
      close() { if (ac && ac.state === 'running') ac.suspend(); },
    };
  })();

  /* ---------------- the overlay (built once, on the first open) ---------------- */
  let D = null;   // DOM refs
  let ICON = null;   // the shield and the padlock of Tiago's scene + the code glyphs of Pierre's
  function buildDom() {
    const root = el('div', 'cred');
    root.hidden = true;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-label', 'Créditos');
    el('div', 'cred__dim', root);
    const stage = el('div', 'cred__stage', root);
    const cv = el('canvas', 'cred__cv', stage);
    cv.setAttribute('aria-hidden', 'true');
    const solo = el('div', 'cred__solo', stage);
    const name = el('p', 'cred__name', solo);
    const role = el('p', 'cred__role', solo);
    const quote = el('p', 'cred__quote', solo);
    const typed = el('span', 'cred__typed', quote);
    const cur = el('i', 'cred__cur', quote);
    const rest = el('span', 'cred__rest', quote);
    typed.setAttribute('aria-hidden', 'true'); rest.setAttribute('aria-hidden', 'true'); cur.setAttribute('aria-hidden', 'true');
    const said = el('span', 'cred__sr', quote);   // the whole sentence, for screen readers
    const team = el('div', 'cred__team', stage);
    const tags = {};
    for (const m of EQUIPE) {
      const t = el('div', 'cred__tag' + (m.destaque ? ' cred__tag--big' : ''), team);
      t.style.setProperty('--c', m.cor);
      pixelAccents(el('b', '', t, m.nome));
      el('span', '', t, m.tag);
      tags[m.id] = t;
    }
    const flash = el('div', 'cred__flash', root);
    el('div', 'cred__bar cred__bar--top', root);
    const bot = el('div', 'cred__bar cred__bar--bot', root);
    const info = el('div', 'cred__info', bot);
    el('p', 'cred__ver', info, FINAL.versao);
    el('p', 'cred__fonts', info, FINAL.fontes);
    const musica = el('p', 'cred__fonts cred__music', info);
    el('p', 'cred__thanks', info, FINAL.obrigado);
    const dots = el('div', 'cred__dots', root);
    dots.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < EQUIPE.length; i++) el('i', '', dots);
    const skip = el('button', 'cred__skip', root);
    skip.type = 'button';
    const hint = el('p', 'cred__hint', root);
    hint.setAttribute('aria-hidden', 'true');
    const hk = el('span', 'k', hint), ht = el('span', 't', hint);
    document.body.appendChild(root);
    D = { musica, root, stage, cv, g: cv.getContext('2d'), solo, name, role, quote, typed, cur, rest, said, team, tags, flash, info, dots: dots.children, skip, hk, ht };

    // Tiago's shield (with a check) and padlock, 9×11 each
    const PAL = { X: '#0f4a33', G: '#3dffa2', W: '#ffffff', S: '#c3ccd9' };
    const shield = ['XXXXXXXXX', 'XGGGGGGGX', 'XGGGGGGWX', 'XGGGGGWGX', 'XWGGGWGGX', 'XGWGWGGGX', '.XGWGGGX.', '.XGGGGGX.', '..XGGGX..', '...XGX...', '....X....'];
    const lock = ['..SSSSS..', '.SS...SS.', '.S.....S.', '.S.....S.', 'XXXXXXXXX', 'XGGGGGGGX', 'XGGGWGGGX', 'XGGWWWGGX', 'XGGGWGGGX', 'XGGGGGGGX', 'XXXXXXXXX'];
    const white = (rows) => rows.map((r) => r.replace(/[^.]/g, 'W'));
    // Pierre's falling code: 3×5 glyphs, a bright row (the head of each column) and a green row
    const GL = [
      ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'], ['.X.', 'XX.', '.X.', '.X.', 'XXX'], ['.XX', '.X.', 'X..', '.X.', '.XX'], ['XX.', '.X.', '..X', '.X.', 'XX.'],
      ['..X', '.X.', 'X..', '.X.', '..X'], ['X..', '.X.', '..X', '.X.', 'X..'], ['..X', '..X', '.X.', 'X..', 'X..'], ['...', '.X.', '...', '.X.', 'X..'],
      ['...', 'XXX', '...', 'XXX', '...'], ['.X.', 'X..', 'X..', 'X..', '.X.'], ['.X.', '..X', '..X', '..X', '.X.'], ['...', 'X.X', '.X.', 'X.X', '...'],
      ['XXX', '..X', '.X.', '.X.', '.X.'], ['XXX', 'X..', 'XX.', 'X..', 'X..'],
    ];
    const rowsOf = (letter) => { const out = []; for (let y = 0; y < 5; y++) out.push(GL.map((gl) => gl[y].replace(/X/g, letter) + '.').join('')); return out; };
    const glyphs = pixmap(rowsOf('H').concat(['.'.repeat(GL.length * 4)], rowsOf('G')), { H: '#d6ffe9', G: '#3dffa2' });
    ICON = {
      shield: pixmap(shield, PAL), lock: pixmap(lock, PAL),
      shieldW: pixmap(white(shield), PAL), lockW: pixmap(white(lock), PAL),
      glyphs, NG: GL.length,
    };
  }

  /* ---------------- characters: the game's sheets for the four DEV skins ---------------- */
  let cast = null;   // id -> { m: member, sheet, emo, sil: { white, cyan, pink, gold }, a: actor }
  function silhouette(img, color) {
    const c = document.createElement('canvas');
    c.width = img.width; c.height = img.height;
    const g = c.getContext('2d');
    g.drawImage(img, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = color;
    g.fillRect(0, 0, c.width, c.height);
    return c;
  }
  function buildCast() {
    cast = {};
    for (const m of EQUIPE) {
      const look = Object.assign({}, BASE, { outfit: m.id, gear: GEAR[m.id] || {} });
      const sheet = DL.makeSheet(look), emo = DL.makeEmoteSheet ? DL.makeEmoteSheet(look) : null, idle = sheet.down.idle;
      const sil = (img) => ({ white: silhouette(img, '#ffffff'), cyan: silhouette(img, '#2de2c8'), pink: silhouette(img, '#ff3d7f'), gold: silhouette(img, '#ffd666') });
      cast[m.id] = {
        m, sheet, emo,
        sil: sil(idle),
        // the running pose (first walk frame) as coloured ghosts, for the trails
        run: { right: sil(sheet.right.walk[0]), left: sil(sheet.left.walk[0]) },
        // the object DL.drawActor reads (one per character, reused every frame)
        a: { x: 0, y: 0, img: idle, frame() { return this.img; }, look, dir: 'down', moving: false, seated: false, bubble: null, auraT: 0, alpha: 1 },
        phase: hh(m.id.length * 97) * 3,
      };
    }
  }
  const sway = (t) => (DL.idleSway ? DL.idleSway(t) : t % 1.6 > 1);
  function idleFrame(c, dir, t) {
    const s = c.sheet[dir], k = t + c.phase;
    return k % 3.1 < 0.13 ? s.blink : s.sway && sway(k) ? s.sway : s.idle;
  }

  /* ---------------- particles: one fixed pool, reused ---------------- */
  const NP = 240;
  const P = { x: new Float32Array(NP), y: new Float32Array(NP), vx: new Float32Array(NP), vy: new Float32Array(NP), life: new Float32Array(NP), max: new Float32Array(NP), c: new Uint8Array(NP), s: new Uint8Array(NP), g: new Float32Array(NP) };
  const PCOL = ['#3dffa2', '#2de2c8', '#a0c3ec', '#f2c14e', '#ffd666', '#ffffff', '#ff3d7f', '#ffb547'];
  const COL_OF = { '#2de2c8': 1, '#3dffa2': 0, '#a0c3ec': 2, '#f2c14e': 3 };
  let pHead = 0;
  function emit(x, y, vx, vy, life, c, s, grav) {
    const i = pHead;
    pHead = (pHead + 1) % NP;
    P.x[i] = x; P.y[i] = y; P.vx[i] = vx; P.vy[i] = vy; P.life[i] = life; P.max[i] = life; P.c[i] = c; P.s[i] = s || 1; P.g[i] = grav || 0;
  }
  function burst(x, y, n, speed, c, s, up) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.35 + Math.random() * 0.65);
      emit(x, y, Math.cos(a) * v, Math.sin(a) * v * 0.6 - (up || 0), 0.5 + Math.random() * 0.8, c, s, 30);
    }
  }
  function clearParticles() { P.life.fill(0); }
  function stepParticles(dt) {
    for (let i = 0; i < NP; i++) {
      if (P.life[i] <= 0) continue;
      P.life[i] -= dt;
      P.vy[i] += P.g[i] * dt;
      P.x[i] += P.vx[i] * dt;
      P.y[i] += P.vy[i] * dt;
    }
  }
  function drawParticles(g, fade) {
    for (let i = 0; i < NP; i++) {
      if (P.life[i] <= 0) continue;
      g.globalAlpha = fade * Math.min(1, (P.life[i] / P.max[i]) * 1.6);
      g.fillStyle = PCOL[P.c[i]];
      g.fillRect(P.x[i] | 0, P.y[i] | 0, P.s[i], P.s[i]);
    }
    g.globalAlpha = 1;
  }
  // a ring of pixels (shockwave, floor glow): precomputed angles
  const RING = 72, RC = new Float32Array(RING), RS = new Float32Array(RING);
  for (let i = 0; i < RING; i++) { RC[i] = Math.cos((i / RING) * Math.PI * 2); RS[i] = Math.sin((i / RING) * Math.PI * 2); }
  function ring(g, x, y, rx, ry, s) {
    for (let i = 0; i < RING; i++) g.fillRect((x + RC[i] * rx) | 0, (y + RS[i] * ry) | 0, s, s);
  }
  // a flat pixel ellipse (a pool of light on the floor)
  function pool(g, x, y, rx, ry) {
    for (let dy = -ry; dy <= ry; dy++) {
      const w = Math.round(rx * Math.sqrt(1 - (dy / ry) * (dy / ry)));
      g.fillRect(x - w, y + dy, w * 2, 1);
    }
  }

  // Pierre's code rain: one head per column, fixed arrays
  const MC = 256, MY = new Float32Array(MC), MV = new Float32Array(MC);
  function initRain() {
    for (let i = 0; i < MC; i++) { MY[i] = Math.random() * (L.LH + 60); MV[i] = 45 + Math.random() * 95; }   // already falling: no empty screen
  }
  function stepRain(dt) {
    for (let i = 0; i < MC; i++) {
      MY[i] += MV[i] * dt;
      if (MY[i] - 48 > L.LH) { MY[i] = -Math.random() * 40; MV[i] = 45 + Math.random() * 95; }
    }
  }
  // João's network: fixed links between 14 nodes (index pairs)
  const NN = 14;
  const LINKS = [0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 0, 5, 3, 8, 6, 11, 2, 9, 4, 13, 7, 12];
  const NLINK = LINKS.length / 2;

  /* ---------------- state ---------------- */
  let S = null;   // the running show (null when closed)
  let closeTimer = 0;

  /* layout: everything is placed in CSS pixels, the canvas draws in its own pixels (cp = CSS px per canvas px) */
  const L = { VW: 0, VH: 0, dpr: 1, K: 1, cp: 1, LW: 0, LH: 0, bar: 0, foot: 0, topFinal: 0 };
  const toC = (css) => Math.round(css / L.cp);
  function measureCanvas() {
    const dpr = window.devicePixelRatio || 1, VW = innerWidth, VH = innerHeight;
    const dw = Math.max(1, Math.round(VW * dpr)), dh = Math.max(1, Math.round(VH * dpr));
    L.VW = VW; L.VH = VH; L.dpr = dpr;
    L.K = Math.max(1, Math.round(dh / 300));   // device pixels per canvas pixel: ~300 canvas px tall
    L.cp = L.K / dpr;
    L.LW = Math.ceil(dw / L.K); L.LH = Math.ceil(dh / L.K);
    if (D.cv.width !== L.LW || D.cv.height !== L.LH) { D.cv.width = L.LW; D.cv.height = L.LH; }
    D.cv.style.width = (L.LW * L.cp) + 'px';
    D.cv.style.height = (L.LH * L.cp) + 'px';
    L.bar = Math.round(clamp(VH * 0.075, 14, 64));
    D.root.style.setProperty('--bar', L.bar + 'px');
  }
  // the biggest whole zoom (m) that keeps a 22×31 character inside the given CSS box
  const unitH = () => 31 * L.cp, unitW = () => 22 * L.cp;
  const fitM = (h, w) => Math.max(1, Math.min(Math.floor(h / unitH()), Math.floor(w / unitW())));

  function layoutSolo() {
    const m = S.member, avail = L.VH - 2 * L.bar;
    D.solo.style.top = '0px';
    const textH = D.solo.offsetHeight, gap = Math.round(clamp(L.VH * 0.02, 6, 20));
    const room = avail - textH - gap - 16;
    const mSolo = fitM(Math.min(room, avail * 0.46), L.VW * 0.6);
    const mBig = fitM(Math.min(room, avail * 0.66), L.VW * 0.8);
    const z = m.destaque ? Math.max(mSolo, Math.min(mBig, mSolo + 2)) : mSolo;
    const charH = 31 * z * L.cp;
    const top = L.bar + Math.max(8, (avail - (charH + gap + textH)) / 2);
    S.z = z;
    S.cx = toC(L.VW / 2);
    S.feet = toC(top + 28 * z * L.cp);   // the feet sit on the sprite's row 28
    S.textTopC = toC(top + charH + gap);
    D.solo.style.top = Math.round(top + charH + gap) + 'px';
  }

  function layoutFinal() {
    // the bottom bar grows to hold the information; the top bar thins out
    D.info.style.width = Math.min(L.VW - 24, 900) + 'px';
    const foot = D.info.offsetHeight + Math.round(clamp(L.VH * 0.03, 8, 22)) * 2;
    L.foot = foot;
    L.topFinal = Math.round(L.bar * 0.5);
    D.root.style.setProperty('--foot', foot + 'px');
    D.root.style.setProperty('--bar-final', L.topFinal + 'px');
    const colW = Math.min(240, Math.floor((L.VW - 16) / 3));
    for (const id of ORDER_FINAL) D.tags[id].style.width = colW + 'px';
    D.tags.abner.style.width = Math.min(360, L.VW - 24) + 'px';
    let hRow = 0;
    for (const id of ORDER_FINAL) hRow = Math.max(hRow, D.tags[id].offsetHeight);
    const hAb = D.tags.abner.offsetHeight;
    const g1 = Math.round(clamp(L.VH * 0.012, 3, 10)), g2 = Math.round(clamp(L.VH * 0.03, 6, 26));
    const avail = L.VH - L.topFinal - foot - 12;
    let mRow = 1, mAb = 1;
    for (let m = 12; m >= 1; m--) {
      const ab = m + 1, tot = 31 * L.cp * (ab + m) + g1 * 2 + g2 + hAb + hRow;
      if (tot <= avail && 22 * m * L.cp <= colW - 6 && 22 * ab * L.cp <= L.VW * 0.5) { mRow = m; mAb = ab; break; }
    }
    const tot = 31 * L.cp * (mAb + mRow) + g1 * 2 + g2 + hAb + hRow;
    let y = L.topFinal + 6 + Math.max(0, (avail - tot) / 2);
    S.fz = { ab: mAb, row: mRow };
    S.pos = {};
    // Abner: back, on top, in the middle
    S.pos.abner = { x: toC(L.VW / 2), feet: toC(y + 28 * mAb * L.cp) };
    y += 31 * mAb * L.cp + g1;
    D.tags.abner.style.left = Math.round(L.VW / 2) + 'px';
    D.tags.abner.style.top = Math.round(y) + 'px';
    y += hAb + g2;
    // the other three side by side
    ORDER_FINAL.forEach((id, i) => {
      const x = L.VW / 2 + (i - 1) * colW;
      S.pos[id] = { x: toC(x), feet: toC(y + 28 * mRow * L.cp) };
      D.tags[id].style.left = Math.round(x) + 'px';
      D.tags[id].style.top = Math.round(y + 31 * mRow * L.cp + g1) + 'px';
    });
  }

  function layout() {
    if (!S) return;
    measureCanvas();
    if (S.final) layoutFinal();
    else if (S.member) layoutSolo();
  }

  /* ---------------- scenes ---------------- */
  function setText() {
    const m = S.member;
    D.root.style.setProperty('--c', m.cor);
    D.root.classList.toggle('is-big', !!m.destaque);
    D.name.textContent = m.nome;
    pixelAccents(D.name);
    D.role.textContent = m.titulo;
    D.said.textContent = m.frase;
    D.typed.textContent = '';
    D.rest.textContent = m.frase;
    D.name.classList.remove('on'); D.role.classList.remove('on'); D.quote.classList.remove('on', 'done');
    S.typedN = -1;
  }
  function go(i) {
    clearParticles();
    S.i = i; S.t = 0; S.leaving = false; S.leaveT = 0; S.fired = 0; S.shake = 0; S.flash = 0; S.emit = 0; S.wait = null; S.stepN = -1;
    S.final = i >= EQUIPE.length;
    if (MUS) MUS.cena(i);   // a música acompanha (e, se a cena foi pulada, pula junto, com uma transição suave)
    S.member = S.final ? null : EQUIPE[i];
    D.root.classList.remove('is-glitch');
    D.root.classList.toggle('is-final', S.final);
    D.root.classList.toggle('is-deep', !!(S.member && S.member.destaque));
    D.solo.classList.remove('is-out');
    for (let k = 0; k < D.dots.length; k++) {
      D.dots[k].classList.toggle('on', S.final || k <= i);
      D.dots[k].classList.toggle('cur', k === i);
    }
    D.skip.textContent = S.final ? 'FECHAR X' : 'PULAR >>';
    D.skip.setAttribute('aria-label', S.final ? 'Fechar os créditos' : 'Pular para a próxima cena');
    D.hk.textContent = S.final ? 'ENTER · FECHAR' : 'ENTER · PULAR';
    D.ht.textContent = S.final ? 'TOQUE PARA FECHAR' : 'TOQUE PARA PULAR';
    if (S.final) {
      D.root.classList.remove('is-big');
      for (const id in D.tags) D.tags[id].classList.remove('on');
      D.info.classList.remove('on');
    } else {
      setText();
      const m = S.member, epic = m.efeito === 'epica';
      const enter = epic ? IMPACTO : TEMPO.entrada;
      S.nameAt = enter + (epic ? 0.5 : 0.1);
      S.roleAt = S.nameAt + (epic ? 0.6 : 0.3);
      S.typeAt = S.roleAt + (epic ? 0.4 : 0.25);
      // the sentence must be fully typed a moment before the character runs off
      const typeEnd = m.duracao - (epic ? 1.2 : TEMPO.saida + 0.9);
      S.cps = Math.max(epic ? TEMPO.letrasDestaque : TEMPO.letras, m.frase.length / Math.max(0.5, typeEnd - S.typeAt));
      if (m.efeito === 'codigo') initRain();
    }
    layout();
  }
  // the player asked to move on: only after the first moments of a scene (never the key / tap that opened it)
  function next() {
    if (!S || !S.ready || S.leaving || S.t < TEMPO.travaPular) return;
    if (S.final) return close();
    leave();
  }
  function leave() {
    S.leaving = true; S.leaveT = 0;
    D.solo.classList.add('is-out');
    D.root.classList.add('is-glitch');
    Snd.play('glitch');
  }

  /* ---------------- per-scene timeline (events + DOM) ---------------- */
  const once = (bit) => { if (S.fired & bit) return false; S.fired |= bit; return true; };
  function update(dt) {
    S.t += dt;
    const t = S.t;
    if (S.leaving) {
      S.leaveT += dt;
      if (S.leaveT >= TEMPO.transicao) { go(S.i + 1); return; }
    }
    // the skip button looks disabled while skipping does not count yet
    const wait = t < TEMPO.travaPular;
    if (wait !== S.wait) { S.wait = wait; D.skip.classList.toggle('is-wait', wait); }
    S.shake = Math.max(0, S.shake - dt * 1.8);
    S.flash = Math.max(0, S.flash - dt * 2.4);
    stepParticles(dt);
    if (S.final) return updateFinal(t);
    const m = S.member;
    if (m.efeito === 'codigo') stepRain(dt);
    // entrances
    if (m.efeito === 'epica') {
      if (once(1)) Snd.play('rise');
      if (t >= IMPACTO && once(2)) {
        Snd.play('impact');
        S.shake = 0.8; S.flash = 1;
        burst(S.cx, S.feet - 4, 70, 160, 3, 2, 30);
        burst(S.cx, S.feet - 4, 40, 110, 4, 1, 20);
      }
    } else {
      const col = m.efeito === 'cyber' ? 0 : COL_OF[m.cor] || 0;
      if (once(1)) Snd.play('whoosh');
      if (t >= TEMPO.entrada && once(2)) {   // landing in the middle
        S.flash = m.efeito === 'cyber' ? 0.6 : 0.35;
        S.shake = m.efeito === 'cyber' ? 0.3 : 0.15;
        burst(S.cx, S.feet - 14 * S.z, 46, 130, col, S.z > 3 ? 2 : 1, 20);
        burst(S.cx, S.feet, 20, 80, 5, 1, 10);
        Snd.play(m.efeito === 'cyber' ? 'zap' : m.efeito === 'rede' ? 'ping' : 'pop');
      }
      if (m.efeito === 'cyber') {
        if (t >= TEMPO.entrada + 0.25 && once(32)) Snd.play('lock');
        if (t >= TEMPO.entrada + 0.5 && once(64)) Snd.play('lock');
      }
      if (m.efeito === 'rede' && t >= TEMPO.entrada + 0.35 && once(32)) Snd.play('ping');
      if (t >= m.duracao - TEMPO.saida && once(128)) Snd.play('whoosh');
    }
    // texts
    if (t >= S.nameAt && once(4)) { D.name.classList.add('on'); Snd.play(m.destaque ? 'slam' : 'shine'); if (m.destaque) S.shake = Math.max(S.shake, 0.4); }
    if (t >= S.roleAt && once(8)) D.role.classList.add('on');
    if (t >= S.typeAt) {
      if (once(16)) D.quote.classList.add('on');
      const n = Math.min(m.frase.length, Math.floor((t - S.typeAt) * S.cps));
      if (n !== S.typedN) {
        if (n > S.typedN && n % 2 === 0 && m.frase.charAt(n - 1) !== ' ') Snd.play('type');
        S.typedN = n;
        D.typed.textContent = m.frase.slice(0, n);
        D.rest.textContent = m.frase.slice(n);
        D.quote.classList.toggle('done', n >= m.frase.length);
      }
    }
    // ambient particles: motes of the member's colour (green for Tiago), gold sparks for Abner
    S.emit += dt * (m.destaque ? 40 : 10);
    while (S.emit >= 1) {
      S.emit -= 1;
      if (m.destaque && t > IMPACTO) emit(S.cx + (Math.random() - 0.5) * 90, S.feet + 2, (Math.random() - 0.5) * 6, -18 - Math.random() * 30, 1.5 + Math.random() * 1.5, Math.random() < 0.6 ? 3 : 4, Math.random() < 0.3 ? 2 : 1, 0);
      else if (m.destaque) emit(S.cx + (Math.random() - 0.5) * 16, S.feet - Math.random() * 120, 0, 40 + Math.random() * 60, 0.6, 4, 1, 0);
      else emit(Math.random() * L.LW, L.LH - toC(L.bar) - Math.random() * 30, (Math.random() - 0.5) * 4, -6 - Math.random() * 10, 2 + Math.random() * 2, m.efeito === 'cyber' ? 0 : COL_OF[m.cor] || 0, 1, 0);
    }
    // the transition starts while the runner is still on the way out, so the screen is never empty
    // (a cena seguinte começa exatamente em m.duracao: junto com o trecho dela na música)
    if (!S.leaving && t >= m.duracao - TEMPO.transicao) leave();
  }
  function updateFinal(t) {
    EQUIPE.forEach((m, i) => {
      const at = appearAt(m, i);
      if (t >= at && once(1 << i)) {
        const p = S.pos[m.id], z = m.destaque ? S.fz.ab : S.fz.row;
        S.flash = Math.max(S.flash, m.destaque ? 0.8 : 0.35);
        if (m.destaque) { S.shake = 0.5; Snd.play('impact'); } else Snd.play('pop');
        burst(p.x, p.feet - 14 * z, m.destaque ? 50 : 24, m.destaque ? 140 : 90, COL_OF[m.cor] || 0, z > 2 ? 2 : 1, 20);
        D.tags[m.id].classList.add('on');
      }
    });
    if (t >= appearAt(EQUIPE[3], 3) + 0.9 && once(64)) { D.info.classList.add('on'); Snd.play('shine'); }
    // a few gold sparks drifting up behind Abner
    S.emit += 0.4;
    if (S.emit >= 1 && t > appearAt(EQUIPE[3], 3)) {
      S.emit = 0;
      const p = S.pos.abner;
      emit(p.x + (Math.random() - 0.5) * 22 * S.fz.ab, p.feet, 0, -10 - Math.random() * 16, 2 + Math.random(), 3, 1, 0);
    }
  }
  // the three on the bottom row come one by one, then Abner
  const appearAt = (m, i) => 0.3 + (m.destaque ? 3.4 : i) * TEMPO.finalIntervalo;

  /* ---------------- drawing ---------------- */
  function drawChar(c, img, X, Y, z, alpha, emoteOn, dir, moving) {
    const g = D.g, a = c.a;
    a.img = img; a.auraT = S.t; a.alpha = alpha; a.dir = dir || 'down'; a.moving = !!moving;
    a.bubble = emoteOn ? EMO_ON : null;
    g.save();
    g.translate(X | 0, Y | 0);
    g.scale(z, z);
    DL.drawActor(g, a, 1);
    g.restore();
  }
  function drawSil(sil, X, Y, z, alpha, dx) {
    const g = D.g, { AX, AY } = DL.CHAR;
    if (alpha <= 0) return;
    g.globalAlpha = Math.min(1, alpha);
    g.drawImage(sil, (X | 0) + ((dx || 0) - AX) * z, (Y | 0) - AY * z, sil.width * z, sil.height * z);
    g.globalAlpha = 1;
  }
  // pixel glow under / around a character
  function floorGlow(X, Y, z, color, k) {
    const g = D.g;
    g.fillStyle = color;
    g.globalAlpha = 0.10 * k; pool(g, X, Y + 1, 15 * z, 4 * z);
    g.globalAlpha = 0.16 * k; pool(g, X, Y + 1, 9 * z, 2.5 * z);
    g.globalAlpha = 1;
  }
  function spotlight(X, Y, z, color, k) {
    const g = D.g, top = toC(L.bar), w0 = 4 * z, w1 = 16 * z;
    g.globalAlpha = 0.07 * k;
    g.fillStyle = color;
    g.beginPath(); g.moveTo(X - w0, top); g.lineTo(X + w0, top); g.lineTo(X + w1, Y); g.lineTo(X - w1, Y); g.closePath(); g.fill();
    g.globalAlpha = 1;
  }
  function rays(X, Y, len, n, t, alpha, color) {
    const g = D.g, half = 0.05;
    g.fillStyle = color;
    g.globalAlpha = alpha;
    for (let i = 0; i < n; i++) {
      const a = t * 0.25 + (i / n) * Math.PI * 2, l = len * (0.75 + 0.25 * Math.sin(t * 1.3 + i * 2.1));
      g.beginPath();
      g.moveTo(X, Y);
      g.lineTo(X + Math.cos(a - half) * l, Y + Math.sin(a - half) * l);
      g.lineTo(X + Math.cos(a + half) * l, Y + Math.sin(a + half) * l);
      g.closePath(); g.fill();
    }
    g.globalAlpha = 1;
  }
  // glitch: horizontal slices of the canvas pushed sideways + a few cyan / pink lines (k: 0..1 strength)
  function glitch(k, seed) {
    if (k <= 0) return;
    const g = D.g, cv = D.cv;
    for (let i = 0; i < 7; i++) {
      const r = hh(seed * 7 + i), y = (r * L.LH) | 0, h = 2 + ((hh(seed * 13 + i) * 12) | 0);
      const dx = Math.round((hh(seed * 29 + i) - 0.5) * 30 * k);
      if (dx) g.drawImage(cv, 0, y, L.LW, h, dx, y, L.LW, h);
    }
    g.globalAlpha = 0.5 * k;
    for (let i = 0; i < 4; i++) {
      g.fillStyle = i & 1 ? '#ff3d7f' : '#2de2c8';
      g.fillRect(0, (hh(seed * 41 + i) * L.LH) | 0, L.LW, 1);
    }
    g.globalAlpha = 1;
  }
  // a darker band under the texts, so the busy backgrounds never get in the way of reading
  function textBand(fade) {
    const g = D.g, y0 = S.textTopC - 6, y1 = L.LH - toC(L.bar);
    if (!(y1 > y0)) return;
    g.fillStyle = INK;
    g.globalAlpha = 0.3 * fade; g.fillRect(0, y0, L.LW, y1 - y0);
    g.globalAlpha = 0.3 * fade; g.fillRect(0, y0 + 4, L.LW, y1 - y0 - 4);
    g.globalAlpha = 1;
  }

  // where the runner is at time t (in from one side, stops in the middle, out by the other side)
  const R = { x: 0, dir: 'down', moving: false };
  function runAt(m, t) {
    const z = S.z, X = S.cx, off = 14 * z + 6, left = m.lado === 'esquerda';
    const from = left ? -off : L.LW + off, to = left ? L.LW + off : -off, out = m.duracao - TEMPO.saida;
    R.dir = left ? 'right' : 'left';
    if (t < TEMPO.entrada) { R.x = from + (X - from) * ease(t / TEMPO.entrada); R.moving = true; }
    else if (t >= out) { const k = clamp((t - out) / TEMPO.saida, 0, 1); R.x = X + (to - X) * k * k; R.moving = true; }
    else { R.x = X; R.dir = 'down'; R.moving = false; }
    return R;
  }

  function render() {
    const g = D.g;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, L.LW, L.LH);
    g.imageSmoothingEnabled = false;
    if (!S.ready) return;
    const fade = S.leaving ? 1 - S.leaveT / TEMPO.transicao : 1;
    if (S.final) renderFinal(fade);
    else if (S.member.efeito === 'epica') renderEpic(cast[S.member.id], fade);
    else renderRunner(fade);
    if (S.leaving) glitch(0.4 + S.leaveT / TEMPO.transicao, Math.floor(S.leaveT * 30));
    // shake + flash are CSS on the stage / flash layer (no canvas work)
    const sh = S.shake;
    const sx = sh ? Math.round((hh(Math.floor(S.t * 40)) - 0.5) * 10 * sh) : 0, sy = sh ? Math.round((hh(Math.floor(S.t * 40) + 7) - 0.5) * 7 * sh) : 0;
    if (sx !== S.sx || sy !== S.sy) { S.sx = sx; S.sy = sy; D.stage.style.transform = sx || sy ? 'translate(' + sx + 'px,' + sy + 'px)' : ''; }
    const fl = Math.round(S.flash * 20) / 20;
    if (fl !== S.fl) { S.fl = fl; D.flash.style.opacity = fl ? (fl * 0.85).toFixed(2) : '0'; }
  }

  /* Tiago, Pierre and João Pedro: background effect, then the character running in / out */
  function renderRunner(fade) {
    const m = S.member, c = cast[m.id], t = S.t, z = S.z, Y = S.feet, g = D.g;
    const fx = m.efeito, glow = fx === 'cyber' ? '#3dffa2' : m.cor;
    if (fx === 'codigo') { drawRain(fade); textBand(fade); }
    else if (fx === 'rede') { drawNet(fade); textBand(fade); }
    else drawCyberBg(fade);
    const r = runAt(m, t), here = !r.moving;
    const lightK = fade * clamp((t - TEMPO.entrada + 0.4) / 0.5, 0, 1) * clamp((m.duracao - TEMPO.saida + 0.3 - t) / 0.3, 0, 1);
    spotlight(S.cx, Y, z, glow, lightK);
    floorGlow(S.cx, Y, z, glow, lightK);
    drawParticles(g, fade);
    if (fx === 'cyber') drawSecurity(fade);
    const x = r.x, dir = r.dir;
    if (r.moving) {
      const dirSign = dir === 'right' ? 1 : -1;
      if (fx === 'cyber') speedLines(dirSign, fade);
      // trail: ghosts of where he was a moment ago (neon for Tiago, the member's colour for the others)
      const run = c.run[dir], ghost = fx === 'cyber' ? run.cyan : fx === 'codigo' ? run.white : run.cyan;
      for (let j = 5; j >= 1; j--) {
        const gx = runAt(m, Math.max(0, t - j * 0.04)).x;
        drawSil(ghost, gx, Y, z, (fx === 'cyber' ? 0.4 : 0.22) * (1 - j / 6) * fade, 0);
      }
      runAt(m, t);   // R back to now
      // RGB split while running (Tiago)
      if (fx === 'cyber') {
        drawSil(run.pink, x, Y, z, 0.55 * fade, -2 * dirSign);
        drawSil(run.cyan, x, Y, z, 0.55 * fade, 2 * dirSign);
      }
      const step = Math.floor(t * 12);
      const img = c.sheet[dir].walk[step % 4];
      if (step !== S.stepN) { S.stepN = step; if (step % 2) emit(x - dirSign * 4 * z, Y, -dirSign * 10, -8, 0.5, fx === 'cyber' ? 0 : COL_OF[m.cor] || 0, Math.max(1, z - 1), 0); }
      drawChar(c, img, x, Y, z, fade, false, dir, true);
    } else {
      drawChar(c, idleFrame(c, 'down', t), x, Y, z, fade, false, 'down', false);
    }
    // the landing: a white silhouette fading + (Tiago) a short glitch on the body
    const after = t - TEMPO.entrada;
    if (here && after < 0.3) {
      drawSil(c.sil.white, x, Y, z, (1 - after / 0.3) * 0.8 * fade, 0);
      if (fx === 'cyber') glitch(1 - after / 0.3, Math.floor(t * 30) + 99);
    }
  }

  // Tiago: a soft green scanline sweeping down + a faint grid of dots on the floor
  function drawCyberBg(fade) {
    const g = D.g, t = S.t, top = toC(L.bar), bot = L.LH - toC(L.bar), span = bot - top;
    g.fillStyle = '#3dffa2';
    g.globalAlpha = 0.14 * fade;
    g.fillRect(0, (top + frac(t * 0.45) * span) | 0, L.LW, 1);
    g.globalAlpha = 0.06 * fade;
    g.fillRect(0, (top + frac(t * 0.45 + 0.5) * span) | 0, L.LW, 1);
    // a row of hexadecimal "ports" blinking along the floor
    const n = Math.min(40, (L.LW / 14) | 0);
    for (let i = 0; i < n; i++) {
      const on = hh(i * 31 + Math.floor(t * 4)) < 0.35;
      g.globalAlpha = (on ? 0.35 : 0.08) * fade;
      g.fillRect((i * L.LW / n + 4) | 0, S.feet + 4 * S.z + 6, 3, 2);
    }
    g.globalAlpha = 1;
  }
  // Tiago: horizontal speed lines while he runs
  function speedLines(dirSign, fade) {
    const g = D.g, t = S.t, top = S.feet - 34 * S.z, h = 36 * S.z;
    for (let i = 0; i < 18; i++) {
      const len = 16 + ((hh(i * 3 + 1) * 70) | 0), sp = 1.6 + hh(i * 5 + 2) * 2.4;
      const x = frac(hh(i * 7) - t * sp * dirSign) * (L.LW + len) - len, y = (top + hh(i * 11 + 4) * h) | 0;
      g.fillStyle = i % 3 ? '#3dffa2' : '#ffffff';
      g.globalAlpha = (i % 3 ? 0.35 : 0.5) * fade;
      g.fillRect(x | 0, y, len, 1);
    }
    g.globalAlpha = 1;
  }
  // Tiago: the shield and the padlock popping up beside him, floating, with a pulse ring
  function drawSecurity(fade) {
    const g = D.g, t = S.t, z = S.z, X = S.cx, Y = S.feet;
    const zi = Math.max(1, L.LW < 220 ? z - 2 : z - 1), hw = 4.5 * zi;
    const gone = clamp((m_end() - t) / 0.4, 0, 1);
    for (let side = 0; side < 2; side++) {
      const at = TEMPO.entrada + 0.25 + side * 0.25, life = t - at;
      if (life < 0) continue;
      const pic = side ? ICON.lock : ICON.shield, white = side ? ICON.lockW : ICON.shieldW;
      const s = life < 0.12 ? zi + 1 : zi;   // a quick pop: one size bigger for a moment
      let ix = X + (side ? 1 : -1) * (11 * z + 8 + hw);
      ix = clamp(ix, hw + 2, L.LW - hw - 2);
      const iy = Y - 20 * z + Math.round(Math.sin(t * 2.4 + side * 2) * 2);
      const a = fade * gone;
      // the pulse ring
      if (life < 0.6) { g.fillStyle = '#3dffa2'; g.globalAlpha = (1 - life / 0.6) * a; ring(g, ix, iy, 4 + life * 40, 4 + life * 40, 1); }
      g.fillStyle = '#3dffa2'; g.globalAlpha = 0.12 * a; ring(g, ix, iy, 8 * zi, 8 * zi, 1);
      g.globalAlpha = a;
      g.drawImage(pic, (ix - 4.5 * s) | 0, (iy - 5.5 * s) | 0, 9 * s, 11 * s);
      if (life < 0.2) { g.globalAlpha = (1 - life / 0.2) * a; g.drawImage(white, (ix - 4.5 * s) | 0, (iy - 5.5 * s) | 0, 9 * s, 11 * s); }
      g.globalAlpha = 1;
    }
  }
  const m_end = () => S.member.duracao - TEMPO.saida;

  // Pierre: green code falling (Matrix style) + two editor panels with code lines appearing
  const SYN = ['#3dffa2', '#2de2c8', '#ffb547', '#c3ccd9', '#ff79c6', '#a0c3ec'];
  function drawRain(fade) {
    const g = D.g, t = S.t, k = clamp(t / 0.3, 0, 1) * fade, n = Math.min(MC, Math.ceil(L.LW / 6)), NG = ICON.NG;
    for (let i = 0; i < n; i++) {
      if (hh(i * 13 + 1) > 0.8) continue;   // a few empty columns
      const x = i * 6 + 1, head = Math.floor(MY[i] / 6) * 6;
      for (let j = 0; j < 8; j++) {
        const y = head - j * 6;
        if (y < -5 || y > L.LH) continue;
        const gi = (hh(i * 977 + (y / 6 | 0) * 31 + (j === 0 ? (t * 12 | 0) : (t * 1.5 | 0) * 7)) * NG) | 0;
        g.globalAlpha = k * (j === 0 ? 0.85 : 0.5 * (1 - j / 8));
        g.drawImage(ICON.glyphs, gi * 4, j === 0 ? 0 : 6, 3, 5, x, y, 3, 5);
      }
    }
    g.globalAlpha = 1;
    // the editor panels, one each side of him (only when there is room)
    const z = S.z, X = S.cx, top = toC(L.bar) + 6, bottom = S.textTopC - 8;
    const h = Math.min(90, bottom - top), cy = clamp(S.feet - 16 * z, top + h / 2, bottom - h / 2);
    const room = X - 11 * z - 14;
    if (h < 30 || room < 44) return;
    const w = Math.min(130, room);
    codePanel(X - 11 * z - 8 - w, (cy - h / 2) | 0, w, h | 0, 0, fade);
    codePanel(X + 11 * z + 8, (cy - h / 2) | 0, w, h | 0, 1, fade);
  }
  function codePanel(x0, y0, w, h, side, fade) {
    const g = D.g, t = S.t - TEMPO.entrada + 0.3 - side * 0.15;
    if (t < 0) return;
    const a = fade * clamp(t / 0.2, 0, 1) * clamp((m_end() + 0.2 - S.t) / 0.4, 0, 1);
    g.globalAlpha = 0.7 * a; g.fillStyle = INK; g.fillRect(x0, y0, w, h);
    g.globalAlpha = 0.6 * a; g.fillStyle = '#3dffa2';
    g.fillRect(x0, y0, w, 1); g.fillRect(x0, y0 + h - 1, w, 1); g.fillRect(x0, y0, 1, h); g.fillRect(x0 + w - 1, y0, 1, h);
    g.globalAlpha = 0.25 * a; g.fillRect(x0 + 1, y0 + 1, w - 2, 4);
    g.globalAlpha = a;
    g.fillStyle = '#ff3d7f'; g.fillRect(x0 + 3, y0 + 2, 2, 2);
    g.fillStyle = '#ffb547'; g.fillRect(x0 + 7, y0 + 2, 2, 2);
    g.fillStyle = '#3dffa2'; g.fillRect(x0 + 11, y0 + 2, 2, 2);
    const lh = 5, rows = Math.floor((h - 9) / lh), typedRaw = t / 0.1, shown = Math.floor(typedRaw), start = Math.max(0, shown - rows + 1);
    let cx = x0 + 4, cyRow = y0 + 8;
    for (let L0 = start; L0 <= shown; L0++) {
      const yy = y0 + 8 + (L0 - start) * lh, part = L0 === shown ? frac(typedRaw) : 1;
      let x = x0 + 4 + Math.min(3, (hh(L0 * 3 + side * 101) * 4) | 0) * 4;
      const maxX = x0 + 4 + (w - 8) * part;
      g.fillStyle = '#46506b'; g.globalAlpha = 0.6 * a; g.fillRect(x0 + 2, yy, 1, 2);   // gutter
      g.globalAlpha = a;
      for (let k = 0; k < 4 && x < maxX; k++) {
        const tw = Math.min(2 + ((hh(L0 * 7 + k + side * 50) * 12) | 0), maxX - x);
        if (tw <= 0) break;
        g.fillStyle = SYN[(hh(L0 * 11 + k + side * 7) * SYN.length) | 0];
        g.fillRect(x | 0, yy, tw | 0, 2);
        x += tw + 2;
      }
      cx = x; cyRow = yy;
    }
    if ((S.t * 2.5 | 0) % 2) { g.fillStyle = '#d6ffe9'; g.globalAlpha = a; g.fillRect(cx | 0, cyRow - 1, 2, 4); }
    g.globalAlpha = 1;
  }

  // João Pedro: cables with data packets racing across + network nodes connecting one by one
  function drawNet(fade) {
    const g = D.g, t = S.t, top = toC(L.bar) + 6, bot = L.LH - toC(L.bar) - 6, span = bot - top;
    const rush = 1 + 2.5 * clamp(1 - t / TEMPO.entrada, 0, 1);   // faster while he runs in
    // the cables
    for (let cI = 0; cI < 4; cI++) {
      const y = (top + (0.12 + cI * 0.25) * span) | 0, dir = cI & 1 ? -1 : 1;
      g.fillStyle = '#a0c3ec'; g.globalAlpha = 0.12 * fade; g.fillRect(0, y, L.LW, 1);
      for (let p = 0; p < 3; p++) {
        const sp = (0.35 + hh(cI * 9 + p) * 0.4) * rush, f = frac(hh(cI * 5 + p * 3) + t * sp);
        const x = dir > 0 ? f * (L.LW + 40) - 20 : L.LW + 20 - f * (L.LW + 40);
        g.globalAlpha = 0.25 * fade; g.fillRect((x - dir * 12) | 0, y, 12, 1);
        g.fillStyle = p === 1 ? '#ffb547' : '#3dffa2'; g.globalAlpha = 0.9 * fade; g.fillRect(x | 0, y - 1, 3, 3);
        g.fillStyle = '#a0c3ec';
      }
    }
    // the nodes (fixed spots from a hash) and the links between them, growing in L shapes
    const nx = (i) => (8 + hh(i * 7 + 1) * (L.LW - 16)) | 0, ny = (i) => (top + 4 + hh(i * 13 + 5) * (span - 8)) | 0;
    const nodeAt = (i) => 0.05 + i * 0.07;
    for (let li = 0; li < NLINK; li++) {
      const a = LINKS[li * 2], b = LINKS[li * 2 + 1];
      const st = Math.max(nodeAt(a), nodeAt(b)) + 0.05, k = clamp((t - st) / 0.35, 0, 1);
      if (k <= 0) continue;
      const ax = nx(a), ay = ny(a), bx = nx(b), by = ny(b), dx = bx - ax, dy = by - ay, ldx = Math.abs(dx), ldy = Math.abs(dy), tot = ldx + ldy;
      let len = tot * k;
      g.fillStyle = '#a0c3ec'; g.globalAlpha = 0.3 * fade;
      const hx = Math.min(len, ldx);
      g.fillRect(dx >= 0 ? ax : ax - hx, ay, hx, 1);
      len -= hx;
      if (len > 0) g.fillRect(bx, dy >= 0 ? ay : ay - len, 1, len);
      if (k >= 1) {   // a packet running along the link
        let d = frac(hh(li * 17) + t * 0.6) * tot, px, py;
        if (d < ldx) { px = ax + Math.sign(dx) * d; py = ay; } else { d -= ldx; px = bx; py = ay + Math.sign(dy) * d; }
        g.fillStyle = li % 3 ? '#3dffa2' : '#ffffff'; g.globalAlpha = 0.9 * fade;
        g.fillRect((px | 0) - 1, (py | 0) - 1, 2, 2);
      }
    }
    for (let i = 0; i < NN; i++) {
      const life = t - nodeAt(i);
      if (life < 0) continue;
      const x = nx(i), y = ny(i), pulse = (Math.sin(t * 4 + i) + 1) / 2;
      if (life < 0.4) { g.fillStyle = '#a0c3ec'; g.globalAlpha = (1 - life / 0.4) * fade; ring(g, x, y, 2 + life * 20, 2 + life * 20, 1); }
      g.fillStyle = '#a0c3ec'; g.globalAlpha = (0.5 + 0.3 * pulse) * fade; g.fillRect(x - 2, y - 2, 5, 5);
      g.fillStyle = '#ffffff'; g.globalAlpha = 0.9 * fade; g.fillRect(x - 1, y - 1, 3, 3);
    }
    g.globalAlpha = 1;
  }

  function renderEpic(c, fade) {
    const t = S.t, z = S.z, X = S.cx, Y = S.feet, g = D.g, IMPACT = IMPACTO, { AY } = DL.CHAR;
    const top = toC(L.bar);
    if (t < IMPACT) {
      // a column of light coming down to the floor, getting brighter
      const k = t / IMPACT, bottom = top + (Y - top) * ease(k), w = Math.max(1, Math.round((2 + 6 * k) * z / 2));
      g.fillStyle = '#ffd666'; g.globalAlpha = 0.18 + 0.3 * k; g.fillRect(X - w * 2, top, w * 4, bottom - top);
      g.fillStyle = '#ffffff'; g.globalAlpha = 0.5 + 0.5 * k; g.fillRect(X - (w >> 1), top, Math.max(1, w), bottom - top);
      g.globalAlpha = 1;
      drawParticles(g, fade);
      return;
    }
    const after = t - IMPACT;
    // god rays turning behind him, a golden glow, the shockwave on the floor
    rays(X, Y - 16 * z, Math.max(L.LW, L.LH) * 0.75, 12, t, 0.07 * fade * clamp(after / 0.4, 0, 1), '#f2c14e');
    rays(X, Y - 16 * z, Math.max(L.LW, L.LH) * 0.45, 7, -t * 0.7, 0.06 * fade * clamp(after / 0.4, 0, 1), '#ffffff');
    spotlight(X, Y, z + 1, '#ffd666', fade * 1.6);
    floorGlow(X, Y, z, '#f2c14e', fade * 1.8);
    if (after < 0.9) {
      const k = after / 0.9, a = (1 - k) * fade;
      g.fillStyle = '#ffd666'; g.globalAlpha = a; ring(g, X, Y, 6 + k * 70 * z / 2, 2 + k * 18 * z / 2, Math.max(1, z >> 1));
      g.fillStyle = '#ffffff'; g.globalAlpha = a * 0.7; ring(g, X, Y, 4 + k * 45 * z / 2, 1 + k * 12 * z / 2, 1);
      g.globalAlpha = 1;
    }
    // a pulsing golden halo (pixel rings) around him
    const pulse = 0.5 + 0.5 * Math.sin(t * 2.6);
    g.fillStyle = '#ffd666';
    g.globalAlpha = (0.10 + 0.08 * pulse) * fade; ring(g, X, Y - 15 * z, 13 * z, 17 * z, Math.max(1, z >> 1));
    g.globalAlpha = (0.05 + 0.05 * pulse) * fade; ring(g, X, Y - 15 * z, 16 * z + pulse * 2, 20 * z + pulse * 2, 1);
    g.globalAlpha = 1;
    drawParticles(g, fade);
    drawChar(c, idleFrame(c, 'down', t), X, Y, z, fade, false, 'down', false);
    // he arrives as pure light, then the colours come in
    if (after < 0.5) drawSil(c.sil.white, X, Y, z, (1 - after / 0.5) * fade, 0);
    else if (after < 0.9) drawSil(c.sil.gold, X, Y, z, (1 - (after - 0.5) / 0.4) * 0.5 * fade, 0);
    // a glint running across now and then
    const gl = (t % 3.2) / 0.5;
    if (gl < 1) {
      g.fillStyle = '#ffffff'; g.globalAlpha = 0.5 * fade;
      g.fillRect(X + Math.round((gl - 0.5) * 24 * z), Y - AY * z, Math.max(1, z >> 1), 31 * z);
      g.globalAlpha = 1;
    }
  }

  function renderFinal(fade) {
    const t = S.t, g = D.g;
    const ab = S.pos.abner, abAt = appearAt(EQUIPE[3], 3), az = S.fz.ab;
    if (t >= abAt) {
      const k = clamp((t - abAt) / 0.6, 0, 1);
      rays(ab.x, ab.feet - 16 * az, Math.max(L.LW, L.LH) * 0.6, 10, t, 0.05 * k * fade, '#f2c14e');
    }
    EQUIPE.forEach((m, i) => {
      const at = appearAt(m, i);
      if (t < at) return;
      const p = S.pos[m.id], z = m.destaque ? S.fz.ab : S.fz.row, k = clamp((t - at) / 0.5, 0, 1);
      floorGlow(p.x, p.feet, z, m.cor, k * fade * (m.destaque ? 1.5 : 1));
    });
    drawParticles(g, fade);
    EQUIPE.forEach((m, i) => {
      const at = appearAt(m, i);
      if (t < at) return;
      const c = cast[m.id], p = S.pos[m.id], z = m.destaque ? S.fz.ab : S.fz.row, life = t - at;
      // now and then one of them waves (staggered), the rest breathe and blink
      let img, emoteOn = false;
      const cyc = (t + i * 1.9) % 8;
      if (life > 1.5 && cyc < 1.3 && c.emo && c.emo.waveA) { img = Math.floor(cyc / 0.22) % 2 ? c.emo.waveB : c.emo.waveA; emoteOn = true; }
      else img = idleFrame(c, 'down', t);
      drawChar(c, img, p.x, p.feet, z, fade, emoteOn, 'down', false);
      if (life < 0.45) drawSil(m.destaque ? c.sil.gold : c.sil.white, p.x, p.feet, z, (1 - life / 0.45) * fade, 0);
    });
  }

  /* ---------------- loop ---------------- */
  function tick(now) {
    if (!S) return;
    S.raf = requestAnimationFrame(tick);
    const dt = Math.min(0.1, S.last ? (now - S.last) / 1000 : 0);
    S.last = now;
    S.acc += dt;
    if (S.acc < 1 / 30) return;   // 30 fps, like the datacenter behind
    let step = S.acc;
    S.acc = 0;
    // a imagem segue o relógio da música: se ficou para trás (celular engasgou), alcança
    if (MUS && S.ready && !S.leaving && !S.final) {
      const mt = MUS.tempoNaCena(S.i);
      if (mt != null && mt > S.t + step + 0.04) step = Math.min(0.25, mt - S.t);
    }
    if (S.ready) update(step);
    if (S) render();
  }

  /* ---------------- open / close ---------------- */
  function open(onClose) {
    if (S) return;
    if (!D) buildDom();
    clearTimeout(closeTimer);   // reopened during the closing fade: keep the overlay
    S = { onClose, ready: false, i: -1, t: 0, acc: 0, last: 0, raf: 0, rz: 0, fired: 0, sx: 0, sy: 0, fl: -1, ac: new AbortController() };
    const s = S, sig = { signal: S.ac.signal };
    document.documentElement.classList.add('cred-on');
    D.root.hidden = false;
    D.root.classList.remove('is-in', 'is-out', 'is-final', 'is-deep', 'is-big', 'is-glitch');
    D.solo.classList.add('is-out');
    for (const id in D.tags) D.tags[id].classList.remove('on');
    D.info.classList.remove('on');
    for (let k = 0; k < D.dots.length; k++) D.dots[k].classList.remove('on', 'cur');
    D.skip.textContent = 'PULAR >>';
    D.skip.classList.add('is-wait');
    D.stage.style.transform = '';
    D.flash.style.opacity = '0';
    clearParticles();
    void D.root.offsetWidth;   // let the bars slide in from zero
    D.root.classList.add('is-in');
    measureCanvas();
    Snd.open();
    if (MUS) MUS.abrir();   // aqui, dentro do clique / tecla: o navegador só deixa o som começar num gesto
    if (MUS) { D.musica.textContent = MUS.credito(); D.musica.hidden = !D.musica.textContent; }

    // input: Enter / Esc / Space, a tap or click anywhere (the PULAR button included) = next scene.
    // next() ignores everything during the first TEMPO.travaPular seconds of each scene.
    addEventListener('keydown', (e) => {
      if (S !== s) return;
      const k = e.key;
      if (k === 'Tab') { e.preventDefault(); D.skip.focus({ preventScroll: true }); }
      else if (k === 'Enter' || k === 'Escape' || k === ' ' || k === 'Spacebar') {
        e.preventDefault();
        if (!e.repeat) next();
      } else return;
      e.stopPropagation();
    }, Object.assign({ capture: true }, sig));
    D.root.addEventListener('click', () => next(), sig);
    addEventListener('resize', () => { cancelAnimationFrame(s.rz); s.rz = requestAnimationFrame(layout); }, sig);
    addEventListener('wheel', (e) => e.preventDefault(), Object.assign({ passive: false }, sig));
    D.skip.focus({ preventScroll: true });

    need().then(() => {
      if (S !== s) return;   // closed (or closed and reopened) while loading
      if (!cast) buildCast();
      s.ready = true;
      go(0);   // always from the first scene (Tiago)
      render();
    });
    S.raf = requestAnimationFrame(tick);
  }

  function close() {
    if (!S || S.closing) return;
    S.closing = true;
    const s = S;
    s.ac.abort();                  // keyboard, click, resize, wheel listeners gone
    cancelAnimationFrame(s.raf);
    cancelAnimationFrame(s.rz);
    Snd.close();
    if (MUS) MUS.fechar();         // fade out e a música para
    S = null;                      // the loop stops on its next call, nothing else keeps running
    D.root.classList.add('is-out');
    closeTimer = setTimeout(() => {
      D.root.hidden = true;
      D.root.classList.remove('is-in', 'is-out', 'is-final', 'is-deep', 'is-big', 'is-glitch');
      D.stage.style.transform = '';
      D.flash.style.opacity = '0';
      clearParticles();
      document.documentElement.classList.remove('cred-on');
      if (s.onClose) s.onClose();
    }, 260);
  }

  DL.credits = { open, close, isOpen: () => !!S };
})();
