/* DataLab — trilha sonora dos Créditos (index.html): uma música épica de aventura, ORIGINAL, gerada no navegador
   com WebAudio (nenhum arquivo para baixar). Acompanha as cenas de creditos.js:

     Tiago      → misteriosa e rápida (harpa em arpejos + tambor leve), impacto quando ele chega
     Pierre     → o tema do DataLab aparece nos metais, animado
     João Pedro → o tema nas cordas, com um pulso que vai crescendo
     Abner      → o clímax: rufar de tímpanos subindo, silêncio curto, e o tema completo com metais, cordas e coro
     Final      → o tema triunfal e caloroso, final majestoso, depois um loop calmo enquanto a tela fica parada

   Arquivo de música (opcional): se existir ARQUIVO.caminho (ex.: assets/audio/creditos.mp3), ele toca no lugar
   da trilha gerada, com os mesmos fades. Se não existir, toca a trilha gerada. Preencha nome/autor/licença
   abaixo se usar música de outra pessoa — aparece na cena final dos créditos.

   Como funciona: as notas são marcadas no relógio do próprio áudio (AudioContext.currentTime), que é exato.
   Um "despertador" leve acorda a cada 50 ms só para preparar as notas dos próximos 0,3 s; o ritmo nunca depende
   dele. Cada cena toca num "canal" separado: quando uma cena é pulada, o canal antigo some num fade curto e o
   trecho certo começa no novo canal (sem corte seco). Ao fechar: fade out, tudo é desligado e limpo.
   Volume: segue o volume de Efeitos das Configurações do jogo (0 = mudo: a música nem liga).

   Uso (creditos.js): DL.creditosMusica.abrir() · .cena(i) · .fechar() · .tempoNaCena(i) */
(function () {
  'use strict';
  const DL = (window.DL = window.DL || {});

  /* ======================================================================================
     AJUSTES — mude aqui
     ====================================================================================== */
  const BPM = 100;          // velocidade (batidas por minuto). As cenas acompanham: mudar o BPM muda a duração delas
  const TOM = 'Ré';         // tom da música (maior): 'Dó', 'Ré', 'Mi', 'Fá', 'Sol', 'Lá' ou 'Si'
  const VOLUME = 0.85;      // volume da música, de 0 (mudo) a 1 (máximo). Multiplica o volume de Efeitos do jogo
  const FADE_ENTRADA = 1.2; // segundos do fade in ao abrir os créditos
  const FADE_SAIDA = 0.8;   // segundos do fade out ao fechar
  const FADE_PULO = 0.45;   // segundos da transição quando uma cena é pulada
  const VOLUME_LOOP = 0.5;  // volume do loop calmo do fim (relativo ao resto da música)
  // duração de cada cena em COMPASSOS (1 compasso = 4 batidas; a 100 BPM, 1 compasso = 2,4 s)
  const CENAS = {
    tiago: 3,       // 7,2 s
    pierre: 4,      // 9,6 s
    joao: 4,        // 9,6 s
    abner: 5,       // 12 s (1 compasso de suspense + 4 do tema)
  };
  // música em arquivo (opcional). Deixe o arquivo na pasta e ele é usado no lugar da trilha gerada.
  const ARQUIVO = {
    caminho: 'assets/audio/creditos.mp3',
    nome: '',       // ex.: 'Heroes of the Rack'
    autor: '',      // ex.: 'Fulano de Tal'
    licenca: '',    // ex.: 'CC BY 4.0'
  };
  // texto dos créditos da música quando a trilha gerada toca
  const CREDITO_GERADA = 'Trilha sonora original do DataLab, gerada em tempo real';

  /* ====================================================================================== */

  const SETTINGS_KEY = 'datalab.settings.v1';   // Configurações do jogo (demo.js): sfxVol 0..10
  const TONS = { 'Dó': -2, 'Do': -2, 'Ré': 0, 'Re': 0, 'Mi': 2, 'Fá': 3, 'Fa': 3, 'Sol': 5, 'Lá': -5, 'La': -5, 'Si': -3 };
  const TRANSP = TONS[TOM] != null ? TONS[TOM] : 0;
  const B = 60 / BPM;          // segundos por batida
  const BAR = 4 * B;           // segundos por compasso
  const ORDEM = [CENAS.tiago, CENAS.pierre, CENAS.joao, CENAS.abner];
  const LOOKAHEAD = 0.3, ACORDA = 50;

  const AC = window.AudioContext || window.webkitAudioContext;
  const hz = (m) => 440 * Math.pow(2, (m + TRANSP - 69) / 12);

  function nivel() {
    try {
      const s = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
      const v = s.sfxVol == null ? 6 : Number(s.sfxVol);
      const k = isFinite(v) ? Math.max(0, Math.min(10, v)) / 10 : 0.6;
      return k * k * VOLUME;   // a mesma curva dos efeitos do jogo (audio.js)
    } catch (e) { return 0.36 * VOLUME; }
  }

  /* ---------------- o arquivo de música: procurado uma vez, logo que a página carrega ---------------- */
  let temArquivo = null;   // null: ainda não sabe · true / false
  let el = null, elSrc = null;
  function procurarArquivo() {
    if (!ARQUIVO.caminho || !window.fetch) { temArquivo = false; return; }
    fetch(ARQUIVO.caminho, { method: 'HEAD', cache: 'no-cache' })
      .then((r) => { temArquivo = r.ok && !/text\/html/i.test(r.headers.get('content-type') || ''); })
      .catch(() => { temArquivo = false; });
  }
  if (window.requestIdleCallback) requestIdleCallback(procurarArquivo, { timeout: 3000 });
  else setTimeout(procurarArquivo, 1500);

  /* ---------------- motor ---------------- */
  let ctx = null, ruido = null, impulso = null;
  let M = null;   // a sessão que está tocando (null quando fechado)

  function preparar() {
    if (ctx) return ctx;
    if (!AC) return null;
    ctx = new AC();
    // ruído branco de 1 s (pratos, tambores, sopro)
    ruido = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = ruido.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // a "sala de concerto": uma reverberação de 2,6 s feita de ruído que vai sumindo
    const n = Math.floor(ctx.sampleRate * 2.6);
    impulso = ctx.createBuffer(2, n, ctx.sampleRate);
    for (let c = 0; c < 2; c++) {
      const r = impulso.getChannelData(c);
      for (let i = 0; i < n; i++) r[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / n, 3.2);
    }
    document.addEventListener('visibilitychange', () => {
      if (!ctx || !M) return;
      if (document.hidden) ctx.suspend(); else ctx.resume();
    });
    return ctx;
  }

  // a cadeia de saída de uma sessão: canais → (seco + reverb) → compressor → volume geral → alto-falante
  function montarSaida() {
    const out = ctx.createGain();
    out.gain.value = 0.0001;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 5;
    comp.attack.value = 0.005; comp.release.value = 0.25;
    const mix = ctx.createGain();
    const rev = ctx.createConvolver();
    rev.buffer = impulso;
    const revIn = ctx.createGain(), revOut = ctx.createGain();
    revIn.gain.value = 1; revOut.gain.value = 0.55;
    revIn.connect(rev); rev.connect(revOut); revOut.connect(comp);
    mix.connect(comp);
    comp.connect(out);
    out.connect(ctx.destination);
    return { out, mix, revIn, all: [out, comp, mix, rev, revIn, revOut] };
  }
  function pan(dest, p) {
    if (!ctx.createStereoPanner) return dest;
    const s = ctx.createStereoPanner();
    s.pan.value = p;
    s.connect(dest);
    return s;
  }
  // um canal (uma cena): tudo dele passa por um volume próprio, que faz os fades na troca de cena
  function novoCanal(t0, fadeIn) {
    const g = ctx.createGain();
    g.gain.setValueAtTime(fadeIn ? 0.0001 : 1, t0);
    if (fadeIn) g.gain.exponentialRampToValueAtTime(1, t0 + fadeIn);
    const rv = ctx.createGain();
    rv.gain.value = 0.35;
    g.connect(M.saida.mix);
    g.connect(rv); rv.connect(M.saida.revIn);
    const c = { g, nos: [g, rv] };
    // posições no palco: metais no meio, cordas à esquerda, harpa à direita, coro aberto
    c.metal = g;
    c.corda = pan(g, -0.25); c.harpa = pan(g, 0.3); c.coro = g; c.perc = g;
    c.nos.push(c.corda, c.harpa);
    return c;
  }
  function apagarCanal(c, t, dur) {
    const g = c.g.gain;
    g.cancelScheduledValues(t);
    g.setValueAtTime(Math.max(0.0001, g.value), t);
    g.exponentialRampToValueAtTime(0.0001, t + dur);
    setTimeout(() => c.nos.forEach((n) => { try { n.disconnect(); } catch (e) { /* já desligado */ } }), (dur + 0.6) * 1000);
  }

  /* ---------------- instrumentos ---------------- */
  function env(g, t, a, peak, hold, rel) {
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    if (hold > a) g.gain.setValueAtTime(peak, t + hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + Math.max(hold, a) + rel);
    return t + Math.max(hold, a) + rel + 0.05;
  }
  function osc(type, f, t, end, dest, det) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (det) o.detune.setValueAtTime(det, t);
    o.connect(dest);
    o.start(t); o.stop(end);
    return o;
  }
  // vibrato: um oscilador lento que balança a afinação (entra devagar, como um músico)
  function vibrato(t, end, oscs, cents, rate) {
    const l = ctx.createOscillator(), lg = ctx.createGain();
    l.frequency.value = rate || 5.3;
    lg.gain.setValueAtTime(0, t);
    lg.gain.linearRampToValueAtTime(cents, t + 0.4);
    l.connect(lg);
    oscs.forEach((o) => lg.connect(o.detune));
    l.start(t); l.stop(end);
  }
  // METAIS: duas ondas "serra" levemente desafinadas, filtro que abre no ataque (o "brilho" do trompete)
  function metal(c, t, m, dur, vel) {
    const f = hz(m), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.Q.value = 2;
    lp.frequency.setValueAtTime(350, t);
    lp.frequency.exponentialRampToValueAtTime(900 + 2600 * vel, t + 0.07);
    lp.frequency.exponentialRampToValueAtTime(700 + 1300 * vel, t + 0.3);
    lp.connect(g); g.connect(c.metal);
    const end = env(g, t, 0.045, 0.16 * vel, dur * 0.92, 0.18);
    const a = osc('sawtooth', f, t, end, lp, -7), b = osc('sawtooth', f, t, end, lp, 7);
    if (dur > 0.5) vibrato(t + 0.25, end, [a, b], 9, 5);
  }
  // CORDAS (melodia): três "serras" desafinadas, ataque macio, vibrato
  function cordaSolo(c, t, m, dur, vel) {
    const f = hz(m), g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 2400; lp.Q.value = 0.7;
    lp.connect(g); g.connect(c.corda);
    const end = env(g, t, 0.1, 0.11 * vel, dur * 0.95, 0.35);
    const os = [osc('sawtooth', f, t, end, lp, -10), osc('sawtooth', f, t, end, lp, 0), osc('sawtooth', f, t, end, lp, 10)];
    vibrato(t + 0.15, end, os, 12, 5.6);
  }
  // CORDAS (fundo): um acorde sustentado com vibrato em todas as notas
  function cordaPad(c, t, notas, dur, vel, ataque) {
    const g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1500; lp.Q.value = 0.5;
    lp.connect(g); g.connect(c.corda);
    const end = env(g, t, ataque || 0.35, 0.05 * vel, dur, 0.6);
    const os = [];
    notas.forEach((m) => { os.push(osc('sawtooth', hz(m), t, end, lp, -6), osc('sawtooth', hz(m), t, end, lp, 6)); });
    vibrato(t, end, os, 8, 5.2);
  }
  // CORDAS curtas (pulso rítmico / tremolo)
  function cordaCurta(c, t, m, vel) {
    const g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 1300;
    lp.connect(g); g.connect(c.corda);
    const end = env(g, t, 0.01, 0.07 * vel, 0.05, 0.12);
    osc('sawtooth', hz(m), t, end, lp, -5); osc('sawtooth', hz(m), t, end, lp, 5);
  }
  // HARPA: corda beliscada (triângulo + o brilho de uma oitava acima, morrendo rápido)
  function harpa(c, t, m, vel, soltar) {
    const f = hz(m), g = ctx.createGain(), g2 = ctx.createGain();
    g.connect(c.harpa); g2.connect(c.harpa);
    const rel = soltar || 1.1;
    const end = env(g, t, 0.004, 0.09 * vel, 0.01, rel);
    env(g2, t, 0.002, 0.03 * vel, 0.01, rel * 0.35);
    osc('triangle', f, t, end, g); osc('sine', f * 2, t, end, g2);
  }
  // PIZZICATO (baixo beliscado)
  function pizz(c, t, m, vel) {
    const g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.setValueAtTime(1600, t); lp.frequency.exponentialRampToValueAtTime(300, t + 0.25);
    lp.connect(g); g.connect(c.corda);
    const end = env(g, t, 0.004, 0.16 * vel, 0.01, 0.32);
    osc('sawtooth', hz(m), t, end, lp);
  }
  // BAIXO sustentado (contrabaixos)
  function baixo(c, t, m, dur, vel) {
    const g = ctx.createGain(), lp = ctx.createBiquadFilter();
    lp.type = 'lowpass'; lp.frequency.value = 520;
    lp.connect(g); g.connect(c.corda);
    const end = env(g, t, 0.06, 0.13 * vel, dur * 0.95, 0.25);
    osc('sawtooth', hz(m), t, end, lp); osc('sine', hz(m), t, end, g);
  }
  // CORO ("aaah"): ondas filtradas em duas faixas de voz humana, ataque lento
  function coro(c, t, notas, dur, vel, ataque) {
    const g = ctx.createGain(), f1 = ctx.createBiquadFilter(), f2 = ctx.createBiquadFilter(), sum = ctx.createGain();
    f1.type = 'bandpass'; f1.frequency.value = 760; f1.Q.value = 3.5;
    f2.type = 'bandpass'; f2.frequency.value = 1180; f2.Q.value = 5;
    sum.connect(f1); sum.connect(f2); f1.connect(g); f2.connect(g); g.connect(c.coro);
    const end = env(g, t, ataque || 0.5, 0.2 * vel, dur, 0.9);
    const os = [];
    notas.forEach((m) => { os.push(osc('sawtooth', hz(m), t, end, sum, -9), osc('sawtooth', hz(m), t, end, sum, 9)); });
    vibrato(t, end, os, 10, 4.6);
  }
  // FLAUTA suave (para o loop calmo)
  function flauta(c, t, m, dur, vel) {
    const g = ctx.createGain();
    g.connect(c.metal);
    const end = env(g, t, 0.08, 0.07 * vel, dur * 0.9, 0.3);
    const o = osc('sine', hz(m), t, end, g), o2 = osc('triangle', hz(m), t, end, g);
    vibrato(t + 0.2, end, [o, o2], 10, 5);
  }
  // ruído filtrado (pratos, tambor, caixa)
  function sopro(c, t, dur, vol, tipo, f0, f1, ataque) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = ruido; s.loop = dur > 0.9;
    f.type = tipo; f.frequency.setValueAtTime(f0, t);
    if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
    s.connect(f); f.connect(g); g.connect(c.perc);
    const end = env(g, t, ataque || 0.003, vol, 0.01, dur);
    s.start(t, Math.random() * 0.4); s.stop(end);
  }
  // TÍMPANO: uma nota grave que "afunda" um pouco no começo, com a pancada da baqueta
  function timpano(c, t, m, vel) {
    const f = hz(m), g = ctx.createGain();
    g.connect(c.perc);
    const end = env(g, t, 0.004, 0.42 * vel, 0.01, 1.3);
    const o = osc('sine', f * 1.35, t, end, g);
    o.frequency.exponentialRampToValueAtTime(f, t + 0.06);
    const g2 = ctx.createGain(); g2.connect(c.perc);
    env(g2, t, 0.004, 0.12 * vel, 0.01, 0.6);
    osc('triangle', f * 1.5, t, end, g2);
    sopro(c, t, 0.12, 0.12 * vel, 'lowpass', 900, 200);
  }
  // rufar de tímpanos: batidas rápidas, do volume v0 ao v1
  function rufar(c, t, dur, m, v0, v1) {
    const passo = 0.065, n = Math.floor(dur / passo);
    for (let i = 0; i < n; i++) {
      const k = i / Math.max(1, n - 1);
      golpe(c, t + i * passo, m, v0 + (v1 - v0) * k * k, i);
    }
  }
  function golpe(c, t, m, v, i) {   // uma batida do rufar
    const g = ctx.createGain(); g.connect(c.perc);
    const end = env(g, t, 0.003, 0.22 * v, 0.01, 0.22);
    osc('sine', hz(m) * (i % 2 ? 1.01 : 1), t, end, g);
    if (i % 2 === 0) sopro(c, t, 0.06, 0.05 * v, 'lowpass', 700, 0);
  }
  // o IMPACTO: bumbo enorme + prato + estrondo
  function impacto(c, t, vel) {
    const g = ctx.createGain(); g.connect(c.perc);
    const end = env(g, t, 0.003, 0.7 * vel, 0.02, 1.4);
    const o = osc('sine', 110, t, end, g);
    o.frequency.exponentialRampToValueAtTime(36, t + 0.5);
    sopro(c, t, 0.7, 0.32 * vel, 'lowpass', 2200, 90);
    sopro(c, t, 2.2, 0.13 * vel, 'highpass', 6500, 3500);   // prato
  }
  function prato(c, t, vel) { sopro(c, t, 1.8, 0.1 * vel, 'highpass', 6000, 3800); }
  // prato ao contrário: um "shhhh" que cresce até o impacto
  function pratoSubindo(c, t, dur, vel) {
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = ruido; s.loop = true;
    f.type = 'highpass'; f.frequency.setValueAtTime(2500, t); f.frequency.exponentialRampToValueAtTime(7000, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.12 * vel, t + dur);
    g.gain.setValueAtTime(0.0001, t + dur + 0.01);
    s.connect(f); f.connect(g); g.connect(c.perc);
    s.start(t); s.stop(t + dur + 0.05);
  }
  function tambor(c, t, vel) {   // tambor grave (tom)
    const g = ctx.createGain(); g.connect(c.perc);
    const end = env(g, t, 0.003, 0.3 * vel, 0.01, 0.28);
    const o = osc('sine', 150, t, end, g);
    o.frequency.exponentialRampToValueAtTime(70, t + 0.2);
    sopro(c, t, 0.08, 0.06 * vel, 'bandpass', 900, 0);
  }
  function caixa(c, t, vel) {    // caixa de marcha
    sopro(c, t, 0.13, 0.13 * vel, 'bandpass', 1900, 1200);
    const g = ctx.createGain(); g.connect(c.perc);
    const end = env(g, t, 0.002, 0.08 * vel, 0.01, 0.08);
    osc('triangle', 190, t, end, g);
  }
  function chocalho(c, t, vel) { sopro(c, t, 0.05, 0.035 * vel, 'highpass', 7000, 0); }

  /* Leveza: a composição só ANOTA as notas numa fila (Q); o sequenciador cria os sons de verdade pouco antes de
     cada um tocar (LOOKAHEAD). Assim um compasso cheio de orquestra não é montado de uma vez só (não trava a tela). */
  const Q = [];
  const adiar = (fn) => function (c, t) { Q.push({ t, fn, args: arguments }); };
  metal = adiar(metal); cordaSolo = adiar(cordaSolo); cordaPad = adiar(cordaPad); cordaCurta = adiar(cordaCurta);
  harpa = adiar(harpa); pizz = adiar(pizz); baixo = adiar(baixo); coro = adiar(coro); flauta = adiar(flauta);
  timpano = adiar(timpano); golpe = adiar(golpe); impacto = adiar(impacto); prato = adiar(prato);
  pratoSubindo = adiar(pratoSubindo); tambor = adiar(tambor); caixa = adiar(caixa); chocalho = adiar(chocalho);
  function tocarFila(lim) {
    const agora = Q.splice(0, Q.length), resto = [];
    for (const e of agora) {
      if (e.t >= lim) { resto.push(e); continue; }
      try { e.fn.apply(null, e.args); } catch (err) { /* um instrumento falhou: segue */ }
    }
    for (const e of resto) Q.push(e);
  }

  /* ---------------- a composição (original), em Ré maior: notas em números MIDI (62 = Ré4) ---------------- */
  // acordes: [notas do fundo], baixo
  const AC_ = {
    D: { n: [57, 62, 66, 69], b: 38 }, Bm: { n: [54, 59, 62, 66], b: 47 }, G: { n: [55, 59, 62, 67], b: 43 },
    Em: { n: [52, 55, 59, 64], b: 40 }, A: { n: [52, 57, 61, 64], b: 45 }, A7: { n: [55, 57, 61, 64], b: 45 },
    DF: { n: [54, 57, 62, 66], b: 42 },   // Ré com Fá# no baixo
  };
  // o TEMA DO DATALAB, frase A (termina em suspense) e frase B (resolve): [batida, duração, nota] por compasso
  const TEMA_A = [
    [[0, 1.5, 62], [1.5, 0.5, 69], [2, 2, 74]],
    [[0, 1.5, 71], [1.5, 0.5, 69], [2, 1, 67], [3, 1, 66]],
    [[0, 1, 64], [1, 0.5, 67], [1.5, 0.5, 71], [2, 1.5, 76], [3.5, 0.5, 74]],
    [[0, 1, 73], [1, 0.5, 71], [1.5, 0.5, 73], [2, 2, 69]],
  ];
  const TEMA_B = [
    TEMA_A[0], TEMA_A[1],
    [[0, 1, 76], [1, 0.5, 78], [1.5, 0.5, 79], [2, 1, 78], [3, 1, 76]],
    [[0, 1.5, 74], [1.5, 0.5, 73], [2, 2, 74]],
  ];
  // harmonia de cada compasso: [[batida, acorde], ...]
  const HARM_A = [[[0, 'D']], [[0, 'Bm'], [2, 'G']], [[0, 'Em']], [[0, 'A']]];
  const HARM_B = [[[0, 'D']], [[0, 'Bm'], [2, 'G']], [[0, 'G'], [2, 'DF'], [3, 'A']], [[0, 'D']]];
  const harmAt = (h, bar) => h[Math.min(bar, h.length - 1)];

  // helpers de composição: acordes de um compasso com a duração de cada um
  function acordes(h, t0, fn) {
    h.forEach(([bt, nome], i) => {
      const fim = i + 1 < h.length ? h[i + 1][0] : 4;
      fn(AC_[nome], t0 + bt * B, (fim - bt) * B, nome);
    });
  }
  function melodia(frase, t0, fn, transp) {
    frase.forEach(([bt, d, n]) => fn(t0 + bt * B, n + (transp || 0), d * B));
  }
  // arpejo da harpa: notas do acorde subindo (passo = fração de batida)
  function arpejo(c, ch, t, dur, passo, vel, oitava, desce) {
    const ns = ch.n.concat(ch.n.map((x) => x + 12));
    const n = Math.round(dur / (passo * B));
    for (let i = 0; i < n; i++) {
      let k = i % ns.length;
      if (desce && Math.floor(i / ns.length) % 2) k = ns.length - 1 - k;
      harpa(c, t + i * passo * B, ns[k] + (oitava || 0), vel * (i % 4 === 0 ? 1 : 0.75));
    }
  }

  // cada compasso de cada cena: (c = canal, t0 = início do compasso, k = número do compasso na cena)
  const SECOES = [
    /* 0 · TIAGO — misterioso (Si menor), rápido; impacto quando ele chega (batida 2) */
    function tiago(c, t0, k) {
      const h = [[[0, 'Bm']], [[0, 'G']], [[0, 'A']]][Math.min(k, 2)];
      acordes(h, t0, (ch, t, d) => {
        arpejo(c, ch, t, d, 0.25, 0.6 + 0.15 * k, 12, true);           // harpa em semicolcheias
        cordaPad(c, t, ch.n.map((x) => x - 12).slice(1), d, 0.6, 0.6);
        baixo(c, t, ch.b, d, 0.5);
      });
      for (let i = 0; i < 8; i++) chocalho(c, t0 + i * 0.5 * B, i % 2 ? 0.6 : 1);
      if (k === 0) {
        tambor(c, t0, 0.5); tambor(c, t0 + 1.5 * B, 0.4);
        pratoSubindo(c, t0 + 0.4 * B, 1.6 * B, 0.8);
        // ele chega: tímpano + bumbo + metais curtos
        impacto(c, t0 + 2 * B, 0.75); timpano(c, t0 + 2 * B, 35, 1);
        AC_.Bm.n.forEach((n) => metal(c, t0 + 2 * B, n, 0.35 * B, 0.7));
        tambor(c, t0 + 3 * B, 0.5); tambor(c, t0 + 3.5 * B, 0.4);
      } else if (k === 1) {
        // o começo do tema, em menor, numa trompa distante
        melodia([[0, 1.5, 59], [1.5, 0.5, 66], [2, 2, 71]], t0, (t, n, d) => metal(c, t, n, d, 0.35));
        [0, 1.5, 2, 3, 3.5].forEach((bt) => tambor(c, t0 + bt * B, 0.45));
      } else {
        // virada crescendo para a cena do Pierre
        for (let i = 0; i < 8; i++) tambor(c, t0 + i * 0.5 * B, 0.3 + 0.08 * i);
        for (let i = 0; i < 8; i++) caixa(c, t0 + 2 * B + i * 0.25 * B, 0.3 + 0.08 * i);
        timpano(c, t0 + 3 * B, 33, 0.7);
      }
    },
    /* 1 · PIERRE — o tema nos metais, animado (marcha) */
    function pierre(c, t0, k) {
      const t = t0;
      melodia(TEMA_A[k % 4], t, (tt, n, d) => metal(c, tt, n, d, 0.9));
      acordes(harmAt(HARM_A, k % 4), t, (ch, tt, d) => {
        arpejo(c, ch, tt, d, 0.5, 0.55, 0);
        cordaPad(c, tt, ch.n, d, 0.5);
        for (let i = 0; i < d / B - 0.01; i++) pizz(c, tt + i * B, i % 2 ? ch.b + 7 : ch.b, 0.8);
      });
      [1, 3].forEach((bt) => caixa(c, t + bt * B, 0.8));
      [1.75, 3.5, 3.75].forEach((bt) => caixa(c, t + bt * B, 0.45));
      timpano(c, t, k % 2 ? 33 : 38, k === 0 ? 1 : 0.6);
      if (k === 0) prato(c, t, 0.8);
    },
    /* 2 · JOÃO PEDRO — o tema nas cordas, pulso crescendo */
    function joao(c, t0, k) {
      const t = t0, cresc = 0.65 + 0.12 * k;
      melodia(TEMA_B[k % 4], t, (tt, n, d) => cordaSolo(c, tt, n, d, 0.85 + 0.1 * k));
      acordes(harmAt(HARM_B, k % 4), t, (ch, tt, d) => {
        cordaPad(c, tt, ch.n.map((x) => x - 12), d, 0.5 + 0.1 * k);
        const pulso = [ch.b + 12, ch.b + 19, ch.b + 24, ch.b + 19];
        for (let i = 0; i < Math.round(d / (0.5 * B)); i++) cordaCurta(c, tt + i * 0.5 * B, pulso[i % 4], cresc);
        baixo(c, tt, ch.b, d, 0.5 + 0.1 * k);
      });
      timpano(c, t, 38, 0.5 + 0.12 * k);
      if (k >= 1) timpano(c, t + 2 * B, 33, 0.4 + 0.12 * k);
      if (k >= 2) for (let i = 0; i < 4; i++) caixa(c, t + (3 + i * 0.25) * B, 0.3 + 0.1 * i + 0.1 * k);
      if (k === 0) arpejo(c, AC_.D, t, BAR, 0.5, 0.4, 12);
    },
    /* 3 · ABNER — suspense (rufar crescendo + silêncio) e o tema completo com metais, cordas e coro */
    function abner(c, t0, k) {
      if (k === 0) {
        const sobe = 3.5 * B;   // a meia batida final é silêncio
        rufar(c, t0, sobe, 33, 0.15, 1.2);
        pratoSubindo(c, t0 + 1.5 * B, sobe - 1.5 * B, 1.2);
        const g = ctx.createGain(); g.connect(c.corda);
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(1, t0 + sobe);
        g.gain.setValueAtTime(0.0001, t0 + sobe + 0.02);
        const sub = { corda: g, coro: g, metal: g };
        for (let i = 0; i < 14; i++) AC_.A7.n.forEach((n) => cordaCurta(sub, t0 + i * 0.25 * B, n, 0.9));   // tremolo
        coro(sub, t0, [57, 61, 64, 69], sobe, 1, 1.2);
        melodia([[0, 1, 64], [1, 1, 65], [2, 1, 66], [3, 0.5, 68]], t0, (t, n, d) => metal(sub, t, n, d, 0.7));
        return;
      }
      const j = k - 1, t = t0;
      if (j === 0) { impacto(c, t, 1.1); timpano(c, t, 38, 1.2); timpano(c, t, 26, 0.8); }
      melodia(TEMA_A[j % 4], t, (tt, n, d) => { metal(c, tt, n, d, 1); metal(c, tt, n - 12, d, 0.6); cordaSolo(c, tt, n + 12, d, 0.6); });
      acordes(harmAt(HARM_A, j % 4), t, (ch, tt, d) => {
        cordaPad(c, tt, ch.n, d, 0.9, 0.15);
        coro(c, tt, ch.n.map((x) => x + 12).slice(1), d, 0.9, 0.25);
        arpejo(c, ch, tt, d, 0.25, 0.5, 12);
        baixo(c, tt, ch.b, d, 0.9);
        for (let i = 0; i < d / B - 0.01; i++) pizz(c, tt + i * B, ch.b, 0.7);
      });
      timpano(c, t, j % 2 ? 33 : 38, 0.9);
      [1, 3].forEach((bt) => caixa(c, t + bt * B, 0.7));
      if (j === 1 || j === 2) prato(c, t, 0.5);
      if (j === 3) rufar(c, t + 2 * B, 2 * B, 33, 0.4, 1);   // empurra para a cena final
    },
    /* 4 · FINAL — o tema triunfal e caloroso, final majestoso e depois um loop calmo, para sempre */
    function final(c, t0, k) {
      const t = t0;
      if (k < 4) {
        if (k === 0) { impacto(c, t, 0.9); timpano(c, t + 3 * B, 38, 1); prato(c, t + 3 * B, 0.9); }   // batida 3: o Abner aparece
        melodia(TEMA_B[k], t, (tt, n, d) => { metal(c, tt, n, d, 0.95); cordaSolo(c, tt, n - 12, d, 0.7); });
        acordes(harmAt(HARM_B, k), t, (ch, tt, d) => {
          cordaPad(c, tt, ch.n, d, 0.9, 0.25);
          coro(c, tt, ch.n.map((x) => x + 12).slice(1), d, 0.75, 0.4);
          arpejo(c, ch, tt, d, 0.5, 0.55, 12);
          baixo(c, tt, ch.b, d, 0.8);
        });
        timpano(c, t, 38, 0.7);
        return;
      }
      if (k === 4) {   // a frase de despedida, crescendo
        melodia([[0, 2, 78], [2, 1, 79], [3, 1, 76]], t, (tt, n, d) => { metal(c, tt, n, d, 1); metal(c, tt, n - 12, d, 0.6); cordaSolo(c, tt, n - 12, d, 0.7); });
        acordes([[0, 'Bm'], [2, 'G'], [3, 'A7']], t, (ch, tt, d) => {
          cordaPad(c, tt, ch.n, d, 1, 0.2); coro(c, tt, ch.n.map((x) => x + 12).slice(1), d, 0.9, 0.3); baixo(c, tt, ch.b, d, 0.9);
        });
        rufar(c, t + 2 * B, 2 * B, 33, 0.3, 1.1);
        return;
      }
      if (k === 5) {   // o acorde final, majestoso, que fica soando
        const ch = AC_.D, d = 3.5 * B;
        impacto(c, t, 1); timpano(c, t, 38, 1.2); timpano(c, t, 26, 0.9);
        [74, 69, 66, 62].forEach((n) => metal(c, t, n, d, 0.95));
        cordaPad(c, t, ch.n.concat([74, 78]), d + B, 1, 0.08);
        coro(c, t, [69, 74, 78, 81], d + B, 1, 0.15);
        baixo(c, t, 38, d, 1); baixo(c, t, 26, d, 0.8);
        arpejo(c, { n: [62, 66, 69, 74] }, t, 2 * B, 0.125, 0.6, 12);
        return;
      }
      if (k === 6) return;   // o acorde ecoando na sala (a reverberação)
      // 7 em diante: o loop calmo (Ré · Si menor · Sol · Lá), suave, sem fim
      const q = (k - 7) % 4, nome = ['D', 'Bm', 'G', 'A'][q], ch = AC_[nome];
      if (k === 7) {
        c.g.gain.cancelScheduledValues(t);
        c.g.gain.setValueAtTime(1, t);
        c.g.gain.exponentialRampToValueAtTime(Math.max(0.05, VOLUME_LOOP), t + BAR);
      }
      arpejo(c, ch, t, BAR, 0.5, 0.75, 0, true);
      cordaPad(c, t, ch.n.map((x) => x - 12), BAR, 0.8, 0.8);
      // de vez em quando, uma flauta lembra o começo do tema
      if (Math.floor((k - 7) / 4) % 2 === 1 && q < 2) melodia(TEMA_A[q], t, (tt, n, d) => flauta(c, tt, n + 12, d, 0.9));
    },
  ];
  const barrasDa = (i) => (i < ORDEM.length ? Math.max(1, ORDEM[i] | 0) : Infinity);

  /* ---------------- o sequenciador: prepara as notas pouco antes de tocarem ---------------- */
  function agendar() {
    if (!M || !M.sec) return;
    const lim = ctx.currentTime + LOOKAHEAD;
    while (M.sec && M.proxBarra < lim) {
      const s = M.sec;
      if (s.bar >= barrasDa(s.i)) {   // acabou a cena: a próxima começa exatamente na linha do compasso
        M.sec = { i: s.i + 1, start: M.proxBarra, bar: 0, c: s.c };
        continue;
      }
      try { SECOES[Math.min(s.i, SECOES.length - 1)](s.c, M.proxBarra, s.bar); } catch (e) { /* um instrumento falhou: segue */ }
      s.bar++;
      M.proxBarra += BAR;
    }
    tocarFila(lim);
    M.timer = setTimeout(agendar, ACORDA);
  }
  /* ---------------- o arquivo de música (se existir) ---------------- */
  function marcaDoArquivo(i) {
    let s = 0;
    for (let k = 0; k < i && k < ORDEM.length; k++) s += ORDEM[k] * BAR;
    return s;
  }

  /* ---------------- API ---------------- */
  // ao abrir os créditos (no clique / tecla: o navegador só deixa o som começar num gesto do jogador)
  function abrir() {
    fechar(true);
    const vol = nivel();
    if (vol <= 0.0005 || !preparar()) return;   // mudo (ou navegador sem WebAudio): nada liga
    if (ctx.state === 'suspended') ctx.resume();
    M = { vol, saida: montarSaida(), sec: null, timer: 0, arquivo: temArquivo === true, iniciou: false };
    if (M.arquivo) {
      try {
        if (!el) {
          el = new Audio(ARQUIVO.caminho);
          el.preload = 'auto'; el.loop = true;
          elSrc = ctx.createMediaElementSource(el);
        }
        elSrc.disconnect();
        elSrc.connect(M.saida.mix);
        el.currentTime = 0;
        const p = el.play();   // dentro do gesto (celular); fica mudo até a primeira cena
        if (p && p.catch) p.catch(() => {});
      } catch (e) { M.arquivo = false; }
    }
  }
  // uma cena começou na tela (i = 0..3 integrantes, 4 = cena final)
  function cena(i) {
    if (!M) return;
    const agora = ctx.currentTime;
    if (!M.iniciou) {   // a primeira cena: fade in
      M.iniciou = true;
      const o = M.saida.out.gain;
      o.cancelScheduledValues(agora);
      o.setValueAtTime(0.0001, agora);
      o.exponentialRampToValueAtTime(M.vol, agora + FADE_ENTRADA);
      if (M.arquivo) { M.cenaArq = i; return; }
      M.sec = { i, start: agora + 0.05, bar: 0, c: novoCanal(agora + 0.05, 0) };
      M.proxBarra = agora + 0.05;
      agendar();
      return;
    }
    if (M.arquivo) {   // arquivo: um mergulho rápido no volume e pula para o trecho da cena
      if (i === M.cenaArq + 1 && Math.abs(el.currentTime - marcaDoArquivo(i)) < 0.6) { M.cenaArq = i; return; }
      M.cenaArq = i;
      const o = M.saida.out.gain;
      o.cancelScheduledValues(agora);
      o.setValueAtTime(Math.max(0.0001, o.value), agora);
      o.exponentialRampToValueAtTime(0.0001, agora + FADE_PULO * 0.5);
      setTimeout(() => {
        if (!M || !M.arquivo) return;
        try { el.currentTime = marcaDoArquivo(i); } catch (e) { /* ainda carregando */ }
        const t = ctx.currentTime;
        M.saida.out.gain.setValueAtTime(0.0001, t);
        M.saida.out.gain.exponentialRampToValueAtTime(M.vol, t + FADE_PULO);
      }, FADE_PULO * 500);
      return;
    }
    // a música já está nessa cena (passou sozinha na linha do compasso) ou vai entrar nela agorinha
    const s = M.sec;
    if (s.i === i && (s.start <= agora + 0.6)) return;
    // pulo: o canal atual some num fade e o trecho certo começa num canal novo
    apagarCanal(s.c, agora, FADE_PULO);
    const t0 = agora + 0.04;
    Q.length = 0;   // as notas da cena antiga que ainda não tocaram: descartadas
    M.sec = { i, start: t0, bar: 0, c: novoCanal(t0, i === 3 ? 0 : 0.12) };
    M.proxBarra = t0;
    clearTimeout(M.timer);
    agendar();
  }
  // segundos desde o começo da cena i, pelo relógio do áudio (null se a música não estiver nessa cena)
  function tempoNaCena(i) {
    if (!M || M.arquivo || !M.sec) return null;
    const s = M.sec, agora = ctx.currentTime;
    if (s.i === i && s.start <= agora) return agora - s.start;
    return null;
  }
  // ao fechar os créditos: fade out e desliga tudo
  function fechar(agora) {
    if (!M) return;
    const m = M;
    M = null;
    clearTimeout(m.timer);
    Q.length = 0;
    const t = ctx.currentTime, dur = agora ? 0.05 : FADE_SAIDA, o = m.saida.out.gain;
    o.cancelScheduledValues(t);
    o.setValueAtTime(Math.max(0.0001, o.value), t);
    o.exponentialRampToValueAtTime(0.0001, t + dur);
    setTimeout(() => {
      m.saida.all.forEach((n) => { try { n.disconnect(); } catch (e) { /* já desligado */ } });
      if (m.arquivo && el && M === null) { el.pause(); try { el.currentTime = 0; } catch (e) { /* ok */ } }
      if (!M && ctx.state === 'running') ctx.suspend();   // nada tocando: o áudio dorme (economiza bateria)
    }, (dur + 0.1) * 1000);
  }

  DL.creditosMusica = {
    abrir, cena, fechar, tempoNaCena,
    batida: B,
    compasso: BAR,
    duracaoCena: (i) => barrasDa(i) * BAR,
    impactoAbner: BAR,                         // o impacto do Abner cai no 2º compasso da cena dele
    tocando: () => !!M,
    credito() {
      if (temArquivo) {
        const p = [ARQUIVO.nome && '"' + ARQUIVO.nome + '"', ARQUIVO.autor, ARQUIVO.licenca].filter(Boolean);
        return p.length ? 'Música: ' + p.join(' · ') : '';
      }
      return CREDITO_GERADA;
    },
  };
})();
