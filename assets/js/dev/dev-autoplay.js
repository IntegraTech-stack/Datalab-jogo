/* DataLab — DEV-AUTOPLAY (provisório, só desenvolvimento).
   Um botão "▶ Auto" no cabeçalho do console que resolve o cenário aberto, devagar: digita cada comando
   no campo de entrada, caractere por caractere, e envia com o mesmo Enter do jogador (parser, mensagens,
   dicas e conclusão de passo são os de sempre — nada é marcado como feito por aqui).
   Os comandos vêm da mesma definição usada nas dicas e na ajuda: step.cmd (com a porta / IP / nome reais
   da instância) ou, sem ele, os exemplos das chaves de help do passo, em ordem.
   Carregado pelo jogo.html para todos os jogadores, também no site publicado (?dev=0 desliga, lembrado;
   ?dev=1 religa). Aparece ao lado de "Precisa de ajuda?" quando há um cenário aberto.
   Para remover: apague assets/js/dev/ e as linhas marcadas DEV-AUTOPLAY. */
(function () {
  'use strict';
  const DL = window.DL;
  const term = DL && DL.devHooks && DL.devHooks.terminal;
  const HELP = DL && DL.CMD_HELP;
  const $ = (id) => document.getElementById(id);
  const root = $('terminal'), input = $('termIn'), out = $('termOut'), helpBtn = $('termHelpBtn');
  if (!term || !HELP || !root || !input || !out || !helpBtn) return;
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  // atraso por caractere e pausa depois de cada comando (ms)
  const SPEEDS = { lenta: { char: 90, gap: 1800, label: 'Lenta' }, normal: { char: 45, gap: 900, label: 'Normal' }, rapida: { char: 12, gap: 250, label: 'Rápida' } };
  const A = { state: 'idle', once: false, speed: 'lenta', lesson: null, step: -1, queue: null, last: '', typing: '' };
  let gen = 0; // each start/stop bumps it, so an old loop never keeps going
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // what a step expects, in order: its own auto commands (problems-data.js: the steps that show no command),
  // else its cmd in place of the example of its first help card (as in the help panel);
  // a question is answered with what it accepts
  function commandsOf(s) {
    if (s.answer) return s.answer.accept.length ? ['responder ' + s.answer.accept[0]] : [];
    if (s.auto) return s.auto.split('\n').map((l) => l.trim()).filter(Boolean);
    const list = s.cmd ? [s.cmd] : [];
    for (const k of (s.help || []).slice(s.cmd ? 1 : 0)) {
      if (!HELP[k]) continue;
      for (const l of HELP[k].ex.split('\n')) if (l.trim() && list.indexOf(l.trim()) < 0) list.push(l.trim());
    }
    return list;
  }

  function say(text, cls) {
    const div = document.createElement('div');
    div.innerHTML = '<span class="' + (cls || 'm') + '">' + esc(text) + '</span>';
    out.appendChild(div);
    out.scrollTop = out.scrollHeight;
  }
  // drop the half-typed command (only if it is still ours)
  function clearTyping() { if (A.typing && input.value === A.typing) input.value = ''; A.typing = ''; }

  function start(once) {
    if (!term.isOpen || !term.lesson) { say('[auto] nenhum cenário aberto neste console', 'w'); return; }
    A.lesson = term.lesson; A.step = -1; A.queue = null; A.last = ''; A.once = !!once; A.state = 'run';
    say('[auto] iniciando: ' + A.lesson.title + ' · velocidade ' + SPEEDS[A.speed].label.toLowerCase());
    loop(++gen);
    render();
  }
  function halt(text, cls) {
    gen++;
    clearTyping();
    A.state = 'idle'; A.lesson = null; A.queue = null; A.once = false;
    if (text) say(text, cls || 'w');
    render();
  }
  function pause(text) {
    if (A.state !== 'run') return;
    A.state = 'pause'; A.once = false;
    clearTyping();
    if (text) say(text);
    render();
  }
  function resume(once) { A.state = 'run'; A.once = !!once; render(); }

  async function loop(g) {
    while (g === gen) {
      if (!term.isOpen) return halt(null);
      if (term.lesson !== A.lesson) return term.lesson ? halt('[auto] o cenário mudou: parei') : halt('[auto] cenário concluído', 'ok');
      if (A.state !== 'run') { await sleep(80); continue; }
      const i = term.step, s = A.lesson.steps[i];
      if (i !== A.step) { A.step = i; A.queue = null; render(); }
      // a lesson on two devices: this step is on the other console — go there (the lesson stays the same)
      if (s && s.on && s.on !== term.device) {
        say('[auto] passo ' + (i + 1) + ' é no ' + s.on.name + ': trocando de console');
        term.hop(s.on);
        A.lesson = term.lesson;
        A.queue = null;
        await sleep(SPEEDS[A.speed].gap);
        continue;
      }
      if (!A.queue) {
        if (s.action && !s.auto) return halt('[auto] parou no passo ' + (i + 1) + ': requer ação fora do console (' + s.action + ')');
        A.queue = commandsOf(s);
        if (!A.queue.length) return halt('[auto] parou no passo ' + (i + 1) + ': o passo não define comando');
      }
      // every command of the step ran and it still isn't done
      if (!A.queue.length) return halt('[auto] parou no passo ' + (i + 1) + ': comando \'' + A.last + '\' não concluiu o passo');
      const cmd = A.queue[0];
      if (!(await type(cmd, g))) continue; // paused or stopped while typing: the command starts over
      A.queue.shift();
      A.last = cmd;
      A.typing = '';
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      if (A.once) { A.once = false; A.state = 'pause'; }
      render();
      await sleep(SPEEDS[A.speed].gap);
    }
  }
  async function type(cmd, g) {
    input.value = '';
    A.typing = '';
    for (const ch of cmd) {
      if (g !== gen || A.state !== 'run') return false;
      input.value += ch;
      A.typing = input.value;
      await sleep(SPEEDS[A.speed].char);
    }
    return g === gen && A.state === 'run' && input.value === cmd;
  }

  // the player typing (real keys / paste) pauses the auto before the key reaches the input
  const MODS = ['Shift', 'Control', 'Alt', 'Meta', 'CapsLock'];
  root.addEventListener('keydown', (ev) => {
    if (ev.isTrusted && ev.target === input && A.state === 'run' && MODS.indexOf(ev.key) < 0) pause('[auto] pausado: você digitou no console');
  }, true);
  input.addEventListener('paste', (ev) => { if (ev.isTrusted && A.state === 'run') pause('[auto] pausado: você digitou no console'); }, true);

  /* ---------- controls (side panel, next to "Precisa de ajuda?") ---------- */
  const css = document.createElement('style');
  // the side panel is narrow: the group takes what is left next to the help button and wraps inside itself
  css.textContent = '.dev-auto-row{display:flex;align-items:flex-start;gap:8px}.dev-auto-row>.term__helpbtn{flex:none}' +
    '.dev-auto{flex:1 1 0;min-width:0;display:flex;flex-wrap:wrap;align-items:center;gap:6px;padding:4px 6px;border:1px dashed #f2c14e;border-radius:6px}' +
    '.dev-auto__tag{font:400 10px/1 var(--font-mono,monospace);letter-spacing:.8px;color:#f2c14e}' +
    '.dev-auto .btn{height:24px;padding:0 8px;font-size:12px}.dev-auto select{height:24px;padding:0 4px;border:1px solid rgba(255,255,255,.12);border-radius:4px;background:#0e0f11;color:#d6d8dc;font-size:12px}' +
    '.dev-auto__st{min-width:64px;font:400 11px/1 var(--font-mono,monospace);color:#8e9097}';
  document.head.appendChild(css);
  const mk = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text) e.textContent = text; return e; };
  const ui = mk('span', 'dev-auto');
  ui.setAttribute('role', 'group');
  ui.setAttribute('aria-label', 'Auto-play de desenvolvimento');
  const tag = mk('b', 'dev-auto__tag', 'DEV');
  const play = mk('button', 'btn btn--sm btn--primary', '▶ Auto');
  const next = mk('button', 'btn btn--sm', '⏭ Próximo passo');
  const stop = mk('button', 'btn btn--sm', '■ Parar');
  const speed = mk('select');
  speed.setAttribute('aria-label', 'Velocidade do auto');
  for (const k of Object.keys(SPEEDS)) { const o = mk('option', null, SPEEDS[k].label); o.value = k; speed.appendChild(o); }
  speed.value = A.speed;
  const st = mk('span', 'dev-auto__st');
  for (const b of [play, next, stop]) b.type = 'button';
  [tag, play, next, stop, speed, st].forEach((e) => ui.appendChild(e));
  // one row where the help button was: the same button (its listeners go with it) and the auto controls
  const row = mk('div', 'dev-auto-row');
  helpBtn.parentNode.insertBefore(row, helpBtn);
  row.appendChild(helpBtn);
  row.appendChild(ui);

  const refocus = () => input.focus({ preventScroll: true });
  play.addEventListener('click', () => { if (A.state === 'idle') start(false); else if (A.state === 'run') pause('[auto] pausado'); else resume(false); refocus(); });
  next.addEventListener('click', () => { if (A.state === 'idle') start(true); else resume(true); refocus(); });
  stop.addEventListener('click', () => { if (A.state !== 'idle') halt('[auto] parado'); refocus(); });
  speed.addEventListener('change', () => { A.speed = SPEEDS[speed.value] ? speed.value : 'lenta'; refocus(); });
  // keys pressed on the controls stay here (no game hotkeys behind the console)
  ui.addEventListener('keydown', (ev) => ev.stopPropagation());

  function render() {
    const has = term.isOpen && !!term.lesson;
    // only while a scenario (configuring / fixing equipment) is open in the console
    ui.style.display = A.state === 'idle' && !has ? 'none' : '';
    play.textContent = A.state === 'run' ? '❚❚ Pausar' : A.state === 'pause' ? '▶ Continuar' : '▶ Auto';
    // play / next stay clickable (the console opens between two refreshes); without a scenario start() says so
    stop.disabled = A.state === 'idle';
    st.textContent = A.state === 'idle' ? (has ? '' : 'sem cenário') : (A.state === 'run' ? '' : 'pausa · ') + 'passo ' + (Math.max(0, A.step) + 1) + '/' + A.lesson.steps.length;
  }
  // the console opens and closes on its own: keep the buttons in sync
  setInterval(render, 300);
  render();

  DL.devAutoPlay = { get state() { return A.state; }, start, pause, resume, stop: () => halt('[auto] parado'), commandsOf };
})();
