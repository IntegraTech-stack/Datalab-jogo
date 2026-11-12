/* DataLab — Ideias e bugs: the players' voice in the game.
   - Ideias: anyone suggests, everyone likes (one ♥ per player per idea); the most liked go into the next
     update. Staff move them Em votação → Próxima atualização → Já no jogo (or Não vai entrar).
   - Bugs: a message plus a screenshot (file, Ctrl+V, drag and drop, or in game a capture of the scene,
     attached on its own when the window opens). Staff see every report and set its status.
   Lives in two places with the same component: Main Menu → "Ideias e bugs" (menu.js mounts html()) and
   in game, HUD → Jogo → "Relatar bug" (the #feedback overlay). Server: services/feedback-service.js. */
(function () {
  'use strict';
  const DL = window.DL, D = window.DataLabDemo;
  if (!D || !DL.FeedbackService) return;
  const S = DL.FeedbackService;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const when = (iso) => { try { return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }); } catch (e) { return ''; } };

  const IDEA_TABS = [['open', 'Em votação'], ['planned', 'Próxima atualização'], ['done', 'Já no jogo'], ['mine', 'Minhas']];
  const IDEA_ST = { open: 'Em votação', planned: 'Próxima atualização', done: 'Já no jogo', rejected: 'Não vai entrar' };
  const BUG_ST = { new: 'Recebido', confirmed: 'Confirmado', fixed: 'Corrigido', invalid: 'Não reproduzido' };

  const F = {
    tab: 'ideas', ideaTab: 'open', sort: 'top', ideas: null, staff: false, today: 0, writing: false,
    bugScope: 'mine', bugStatus: '', bugs: null, shot: null, shots: {}, confirm: 0,
    draft: { title: '', body: '', bug: '' }, msg: '', tone: '', busy: false, where: 'menu', seq: 0,
  };
  let mount = null;
  const live = () => mount && mount.isConnected;

  /* ---------------- rendering ---------------- */
  function render() {
    if (!live()) return;
    const tab = (id, label) => '<button type="button" role="tab" class="mv-tab' + (F.tab === id ? ' is-on' : '') + '" data-fb-tab="' + id + '" aria-selected="' + (F.tab === id) + '">' + label + '</button>';
    let h = '<div class="mv-tabs fb-tabs" role="tablist">' + tab('ideas', 'Ideias') + tab('bugs', 'Relatar bug') + '</div>';
    if (!DL.Cloud || !DL.Cloud.signedIn) {
      h += '<div class="mv-empty"><b>Entre na sua conta</b><p>Para mandar ideias, curtir e relatar bugs é preciso estar conectado à sua conta do DataLab.</p></div>';
    } else {
      h += F.tab === 'ideas' ? ideasHtml() : bugsHtml();
    }
    h += '<p class="fb-msg' + (F.tone ? ' fb-msg--' + F.tone : '') + '" data-fb-msg role="status" aria-live="polite">' + esc(F.msg) + '</p>';
    mount.innerHTML = h;
  }

  function ideasHtml() {
    let h = '<p class="fb-lead"><b>As ideias mais curtidas entram na próxima atualização.</b> Curta (♥) as que você quer ver no jogo — cada jogador tem um like por ideia.</p>';
    h += '<div class="fb-bar"><div class="fb-sub" role="tablist">' + IDEA_TABS.map(([id, label]) =>
      '<button type="button" role="tab" class="fb-pill' + (F.ideaTab === id ? ' is-on' : '') + '" data-fb-idea-tab="' + id + '" aria-selected="' + (F.ideaTab === id) + '">' + label + '</button>').join('') + '</div>';
    if (!F.writing) h += '<button class="btn btn--sm btn--primary" type="button" data-fb="write">+ Nova ideia</button>';
    h += '</div>';
    if (F.writing) {
      h += '<form class="fb-form" data-fb-form="idea" autocomplete="off">' +
        '<label class="fb-field"><span class="eyebrow-sm">Título</span><input class="input" name="title" maxlength="80" required placeholder="Ex.: Sala de servidores com refrigeração líquida" value="' + esc(F.draft.title) + '"></label>' +
        '<label class="fb-field"><span class="eyebrow-sm">Como funcionaria? (opcional)</span><textarea class="input fb-text" name="body" rows="4" maxlength="1000" placeholder="Explique a ideia: o que muda no jogo, por que seria legal…">' + esc(F.draft.body) + '</textarea></label>' +
        '<div class="fb-actions"><button class="btn btn--primary" type="submit"' + (F.busy ? ' disabled' : '') + '>Publicar ideia <span class="arrow">→</span></button>' +
        '<button class="btn" type="button" data-fb="cancel">Cancelar</button><span class="eyebrow-sm">' + Math.max(0, 3 - F.today) + ' de 3 ideias hoje</span></div></form>';
    }
    if (F.ideaTab === 'open') {
      h += '<div class="fb-sort"><span class="eyebrow-sm">Ordenar:</span>' +
        [['top', 'Mais curtidas'], ['new', 'Mais recentes']].map(([id, label]) => '<button type="button" class="fb-pill fb-pill--sm' + (F.sort === id ? ' is-on' : '') + '" data-fb-sort="' + id + '">' + label + '</button>').join('') + '</div>';
    }
    if (!F.ideas) return h + '<p class="mv-note">Carregando ideias…</p>';
    if (!F.ideas.length) {
      const empty = { open: 'Nenhuma ideia em votação ainda. Seja o primeiro!', planned: 'Nenhuma ideia escolhida para a próxima atualização ainda.', done: 'Nenhuma ideia da comunidade entrou no jogo ainda — a sua pode ser a primeira.', mine: 'Você ainda não mandou nenhuma ideia.' };
      return h + '<div class="mv-empty"><p>' + empty[F.ideaTab] + '</p></div>';
    }
    const ranked = F.ideaTab === 'open' && F.sort === 'top';
    return h + '<ol class="fb-list">' + F.ideas.map((it, i) => ideaHtml(it, ranked ? i + 1 : 0)).join('') + '</ol>';
  }

  function ideaHtml(it, rank) {
    const open = it.status === 'open';
    let h = '<li class="fb-idea' + (rank && rank <= 3 ? ' is-top' : '') + '">';
    h += '<button class="fb-like' + (it.liked ? ' is-on' : '') + '" type="button" data-fb="like" data-id="' + it.id + '" aria-pressed="' + !!it.liked + '"' +
      (open ? '' : ' disabled') + ' title="' + (open ? (it.liked ? 'Tirar o like' : 'Curtir') : 'Votação encerrada') + '"><span aria-hidden="true">♥</span><b>' + it.likes + '</b></button>';
    h += '<div class="fb-idea__main"><div class="fb-idea__head">' + (rank ? '<span class="fb-rank">#' + rank + '</span>' : '') + '<b class="fb-idea__title">' + esc(it.title) + '</b>' +
      (rank && rank <= 3 ? '<span class="fb-tag fb-tag--hot">Rumo à próxima atualização</span>' : '') +
      (F.ideaTab === 'mine' || !open ? '<span class="fb-tag fb-tag--' + it.status + '">' + IDEA_ST[it.status] + '</span>' : '') + '</div>';
    if (it.body) h += '<p class="fb-idea__body">' + esc(it.body) + '</p>';
    if (it.staff_note) h += '<p class="fb-note"><b>Equipe DataLab:</b> ' + esc(it.staff_note) + '</p>';
    h += '<div class="fb-idea__foot"><span class="fb-meta">@' + esc(it.author || 'jogador') + ' · ' + when(it.created_at) + '</span>';
    if (F.staff) h += '<select class="input input--sm fb-status" data-fb="idea-status" data-id="' + it.id + '" aria-label="Status da ideia">' +
      Object.keys(IDEA_ST).map((k) => '<option value="' + k + '"' + (k === it.status ? ' selected' : '') + '>' + IDEA_ST[k] + '</option>').join('') + '</select>';
    if ((it.mine && open) || F.staff) h += '<button class="linkbtn fb-del" type="button" data-fb="del-idea" data-id="' + it.id + '">' + (F.confirm === it.id ? 'Confirmar exclusão' : 'Apagar') + '</button>';
    return h + '</div></div></li>';
  }

  function bugsHtml() {
    let h = '<p class="fb-lead"><b>Achou um bug?</b> Conte o que aconteceu e como chegar nele. Um print ajuda muito — a equipe lê todos os relatos.</p>';
    h += '<form class="fb-form" data-fb-form="bug" autocomplete="off">' +
      '<label class="fb-field"><span class="eyebrow-sm">O que aconteceu?</span><textarea class="input fb-text" name="message" rows="5" maxlength="2000" required placeholder="Ex.: No terminal do servidor 2, depois de digitar ipconfig, a tela travou. Aconteceu duas vezes.">' + esc(F.draft.bug) + '</textarea>' +
      '<small class="fb-count" data-fb-count>' + F.draft.bug.length + ' / 2000</small></label>';
    h += '<div class="fb-shot" data-fb-drop>';
    if (F.shot) {
      h += '<img class="fb-shot__img" src="' + F.shot.url + '" alt="Print anexado ao relato">' +
        '<div class="fb-shot__info"><b>Print anexado</b><span class="eyebrow-sm">' + (F.shot.auto ? 'Capturado da tela do jogo · ' : '') + Math.round(F.shot.bytes / 1024) + ' KB</span>' +
        '<div class="fb-shot__acts"><label class="btn btn--sm">Trocar imagem<input type="file" accept="image/*" data-fb="file" hidden></label>' +
        '<button class="btn btn--sm" type="button" data-fb="no-shot">Remover</button></div></div>';
    } else {
      h += '<div class="fb-shot__empty"><b>Print da tela (opcional)</b><span>Arraste a imagem aqui, cole com <kbd>Ctrl</kbd>+<kbd>V</kbd> ou escolha um arquivo.</span>' +
        '<div class="fb-shot__acts"><label class="btn btn--sm">Escolher imagem<input type="file" accept="image/*" data-fb="file" hidden></label>' +
        (F.where === 'game' ? '<button class="btn btn--sm" type="button" data-fb="capture">Capturar tela do jogo</button>' : '') + '</div></div>';
    }
    h += '</div><div class="fb-actions"><button class="btn btn--primary" type="submit"' + (F.busy ? ' disabled' : '') + '>Enviar relato <span class="arrow">→</span></button></div></form>';

    h += '<div class="fb-bar fb-bar--list"><span class="eyebrow-sm">' + (F.bugScope === 'all' ? 'Todos os relatos' : 'Seus relatos') + '</span>';
    if (F.staff) {
      h += '<div class="fb-sub">' + [['mine', 'Meus'], ['all', 'Todos (equipe)']].map(([id, label]) => '<button type="button" class="fb-pill fb-pill--sm' + (F.bugScope === id ? ' is-on' : '') + '" data-fb-scope="' + id + '">' + label + '</button>').join('') + '</div>';
      if (F.bugScope === 'all') h += '<select class="input input--sm fb-status" data-fb="bug-filter" aria-label="Filtrar por status"><option value="">Todos os status</option>' +
        Object.keys(BUG_ST).map((k) => '<option value="' + k + '"' + (k === F.bugStatus ? ' selected' : '') + '>' + BUG_ST[k] + '</option>').join('') + '</select>';
    }
    h += '</div>';
    if (!F.bugs) return h + '<p class="mv-note">Carregando relatos…</p>';
    if (!F.bugs.length) return h + '<p class="mv-note">' + (F.bugScope === 'all' ? 'Nenhum relato com esse filtro.' : 'Você ainda não relatou nenhum bug.') + '</p>';
    return h + '<ul class="fb-bugs">' + F.bugs.map(bugHtml).join('') + '</ul>';
  }

  function bugHtml(b) {
    let h = '<li class="fb-bug"><div class="fb-bug__head"><span class="fb-tag fb-tag--' + b.status + '">' + BUG_ST[b.status] + '</span><span class="fb-meta">#' + b.id + ' · ' +
      (F.bugScope === 'all' ? '@' + esc(b.author || 'jogador') + ' · ' : '') + when(b.created_at) + '</span></div>';
    h += '<p class="fb-bug__msg">' + esc(b.message) + '</p>';
    if (b.context) h += '<p class="fb-meta fb-bug__ctx">' + Object.keys(b.context).map((k) => esc(k) + ': ' + esc(b.context[k])).join(' · ') + '</p>';
    if (b.staff_note) h += '<p class="fb-note"><b>Equipe DataLab:</b> ' + esc(b.staff_note) + '</p>';
    if (F.shots[b.id]) h += '<img class="fb-bug__img' + (F.shots[b.id].zoom ? ' is-zoom' : '') + '" src="' + F.shots[b.id].url + '" alt="Print do relato #' + b.id + '" data-fb="zoom" data-id="' + b.id + '">';
    const acts = [];
    if (b.has_shot && !F.shots[b.id]) acts.push('<button class="btn btn--sm" type="button" data-fb="shot" data-id="' + b.id + '">Ver print</button>');
    if (F.staff && F.bugScope === 'all') acts.push('<select class="input input--sm fb-status" data-fb="bug-status" data-id="' + b.id + '" aria-label="Status do relato">' +
      Object.keys(BUG_ST).map((k) => '<option value="' + k + '"' + (k === b.status ? ' selected' : '') + '>' + BUG_ST[k] + '</option>').join('') + '</select>');
    if (acts.length) h += '<div class="fb-bug__acts">' + acts.join('') + '</div>';
    return h + '</li>';
  }

  function say(msg, tone) {
    F.msg = msg || ''; F.tone = tone || '';
    const el = live() && mount.querySelector('[data-fb-msg]');
    if (el) { el.textContent = F.msg; el.className = 'fb-msg' + (F.tone ? ' fb-msg--' + F.tone : ''); }
  }

  /* ---------------- data ---------------- */
  async function load() {
    if (!DL.Cloud || !DL.Cloud.signedIn) return render();
    const seq = ++F.seq;
    if (F.tab === 'ideas') {
      F.ideas = null; render();
      const r = await S.ideas(F.ideaTab, F.sort);
      if (seq !== F.seq) return;
      F.ideas = r.ok ? r.data.ideas : [];
      if (r.ok) { F.staff = !!r.data.staff; F.today = r.data.today || 0; } else say(r.message, 'warn');
    } else {
      F.bugs = null; render();
      const r = await S.bugs(F.bugScope, F.bugStatus);
      if (seq !== F.seq) return;
      F.bugs = r.ok ? r.data.bugs : [];
      if (r.ok) F.staff = !!r.data.staff; else say(r.message, 'warn');
    }
    render();
  }

  async function setShot(src, auto) {
    say('Preparando a imagem…');
    try {
      F.shot = Object.assign(await S.encode(src), { auto: !!auto });
      say('');
    } catch (e) {
      say(e.message === 'too_large' ? 'Essa imagem é grande demais, mesmo comprimida. Tente um recorte menor.' : 'Não consegui ler essa imagem. Use um PNG ou JPG.', 'warn');
    }
    render();
  }

  // the game scene only (HUD and windows are HTML and don't come along): good enough to show where it was
  function captureWorld(auto) {
    const cv = $('world');
    if (!cv || !cv.width) return Promise.resolve();
    return setShot(cv, auto);
  }

  // what helps reproduce it; the server keeps only these short fields (plus the browser it sees)
  function context() {
    const st = D.state || {}, ver = document.querySelector('.title__foot > span:last-child');
    const c = { where: F.where === 'game' ? 'jogo' : 'menu', version: ver ? ver.textContent.trim() : '', screen: innerWidth + 'x' + innerHeight + ' @' + (devicePixelRatio || 1) };
    if (F.where === 'game') { c.phase = String(st.phase || ''); c.mode = String(st.mode || ''); c.preset = String(st.preset || ''); }
    return c;
  }

  async function sendIdea(form) {
    const title = form.title.value.trim(), body = form.body.value.trim();
    if (title.length < 6) { say('Dê um título com pelo menos 6 caracteres.', 'warn'); form.title.focus(); return; }
    F.busy = true; render(); say('Publicando…');
    const r = await S.createIdea(title, body);
    F.busy = false;
    if (!r.ok) { render(); say(r.message, 'warn'); return; }
    F.draft.title = ''; F.draft.body = ''; F.writing = false;
    F.ideaTab = 'open'; F.sort = 'new';
    await load();
    say('Ideia publicada! Ela já começa com o seu like — chame os amigos para curtir.', 'ok');
  }

  async function sendBug(form) {
    const msg = form.message.value.trim();
    if (msg.length < 10) { say('Descreva o bug com pelo menos 10 caracteres.', 'warn'); form.message.focus(); return; }
    F.busy = true; render(); say(F.shot ? 'Enviando relato e print…' : 'Enviando relato…');
    const r = await S.reportBug(msg, F.shot, context());
    F.busy = false;
    if (!r.ok) { render(); say(r.message, 'warn'); return; }
    F.draft.bug = ''; F.shot = null; F.bugScope = 'mine';
    await load();
    say('Relato #' + r.data.id + ' enviado. Valeu por ajudar a melhorar o DataLab!', 'ok');
  }

  async function toggleLike(id) {
    const it = F.ideas && F.ideas.find((x) => x.id === id);
    if (!it || it.status !== 'open') return;
    const on = !it.liked;
    it.liked = on; it.likes += on ? 1 : -1;   // optimistic; the server's count wins below
    render();
    const r = await S.like(id, on);
    if (r.ok) { it.likes = r.data.likes; it.liked = r.data.liked; }
    else { it.liked = !on; it.likes += on ? -1 : 1; say(r.message, 'warn'); }
    render();
  }

  async function deleteIdea(id) {
    if (F.confirm !== id) { F.confirm = id; render(); return; }
    F.confirm = 0;
    const r = await S.removeIdea(id);
    if (!r.ok) { say(r.message, 'warn'); return; }
    F.ideas = F.ideas.filter((x) => x.id !== id);
    render(); say('Ideia apagada.', 'ok');
  }

  async function showShot(id) {
    say('Carregando o print…');
    const r = await S.bugShot(id);
    if (!r.ok) { say(r.message, 'warn'); return; }
    F.shots[id] = { url: 'data:' + r.data.mime + ';base64,' + r.data.data, zoom: false };
    say(''); render();
  }

  /* ---------------- events (one set per mount element) ---------------- */
  function bind(el) {
    if (el.dataset.fbBound) return;
    el.dataset.fbBound = '1';
    el.addEventListener('click', (ev) => {
      const t = ev.target.closest('[data-fb-tab],[data-fb-idea-tab],[data-fb-sort],[data-fb-scope],button[data-fb],img[data-fb]');
      if (!t || !el.contains(t)) return;
      ev.stopPropagation();   // inside the main menu: menu.js' own click handler has nothing to do here
      if (t.dataset.fbTab) { if (F.tab !== t.dataset.fbTab) { F.tab = t.dataset.fbTab; say(''); load(); } return; }
      if (t.dataset.fbIdeaTab) { F.ideaTab = t.dataset.fbIdeaTab; F.confirm = 0; load(); return; }
      if (t.dataset.fbSort) { F.sort = t.dataset.fbSort; load(); return; }
      if (t.dataset.fbScope) { F.bugScope = t.dataset.fbScope; load(); return; }
      const id = +t.dataset.id;
      switch (t.dataset.fb) {
        case 'write': F.writing = true; render(); { const i = el.querySelector('[name=title]'); if (i) i.focus(); } return;
        case 'cancel': F.writing = false; render(); return;
        case 'like': toggleLike(id); return;
        case 'del-idea': deleteIdea(id); return;
        case 'no-shot': F.shot = null; render(); return;
        case 'capture': captureWorld(false); return;
        case 'shot': showShot(id); return;
        case 'zoom': if (F.shots[id]) { F.shots[id].zoom = !F.shots[id].zoom; render(); } return;
      }
    });
    el.addEventListener('submit', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();   // menu.js treats any other form in the menu as the friend invite
      if (F.busy) return;
      if (ev.target.dataset.fbForm === 'idea') sendIdea(ev.target);
      else if (ev.target.dataset.fbForm === 'bug') sendBug(ev.target);
    });
    el.addEventListener('input', (ev) => {
      const n = ev.target.name;
      if (n === 'title') F.draft.title = ev.target.value;
      else if (n === 'body') F.draft.body = ev.target.value;
      else if (n === 'message') {
        F.draft.bug = ev.target.value;
        const c = el.querySelector('[data-fb-count]');
        if (c) c.textContent = F.draft.bug.length + ' / 2000';
      }
    });
    el.addEventListener('change', async (ev) => {
      const t = ev.target, id = +t.dataset.id;
      if (t.dataset.fb === 'file' && t.files && t.files[0]) return setShot(t.files[0], false);
      if (t.dataset.fb === 'bug-filter') { F.bugStatus = t.value; return load(); }
      if (t.dataset.fb === 'idea-status') {
        const r = await S.setIdeaStatus(id, t.value);
        if (!r.ok) return say(r.message, 'warn');
        say('Ideia movida para "' + IDEA_ST[t.value] + '".', 'ok');
        return load();
      }
      if (t.dataset.fb === 'bug-status') {
        const r = await S.setBugStatus(id, t.value);
        if (!r.ok) return say(r.message, 'warn');
        const b = F.bugs.find((x) => x.id === id);
        if (b) b.status = r.data.status;
        render(); say('Relato #' + id + ': ' + BUG_ST[t.value] + '.', 'ok');
      }
    });
    el.addEventListener('dragover', (ev) => {
      if (!ev.target.closest('[data-fb-drop]')) return;
      ev.preventDefault();
      ev.target.closest('[data-fb-drop]').classList.add('is-drag');
    });
    el.addEventListener('dragleave', (ev) => { const z = ev.target.closest('[data-fb-drop]'); if (z) z.classList.remove('is-drag'); });
    el.addEventListener('drop', (ev) => {
      if (!ev.target.closest('[data-fb-drop]')) return;
      ev.preventDefault();
      const f = Array.from((ev.dataTransfer && ev.dataTransfer.files) || []).find((x) => /^image\//.test(x.type));
      if (f) setShot(f, false); else render();
    });
  }
  // Ctrl+V with an image anywhere while the bug form is on screen
  addEventListener('paste', (ev) => {
    if (!live() || F.tab !== 'bugs' || !ev.clipboardData) return;
    const f = Array.from(ev.clipboardData.files || []).find((x) => /^image\//.test(x.type));
    if (!f) return;
    ev.preventDefault();
    setShot(f, false);
  });

  function attach(el, where) {
    if (!el) return;
    mount = el;
    F.where = where;
    F.confirm = 0;
    bind(el);
    load();
  }

  /* ---------------- in game: the #feedback window ---------------- */
  const overlay = $('feedback');
  const isOpen = () => !!overlay && overlay.classList.contains('is-open');
  async function open(tab) {
    if (!overlay) return;
    F.tab = tab || 'bugs';
    F.msg = ''; F.tone = '';
    // a fresh print of the scene every time (an image the player chose stays); the window isn't on the canvas
    if (F.tab === 'bugs' && (!F.shot || F.shot.auto)) await captureWorld(true);
    overlay.classList.add('is-open');
    attach($('fbBody'), 'game');
    setTimeout(() => { const t = overlay.querySelector('textarea, input'); if (t) t.focus({ preventScroll: true }); }, 80);
  }
  function close() {
    if (!overlay) return;
    overlay.classList.remove('is-open');
    mount = null;
  }
  if (overlay) {
    $('fbClose').addEventListener('click', close);
    overlay.addEventListener('pointerdown', (ev) => { if (ev.target === overlay) close(); });
    const btn = $('fbBtn');
    if (btn) btn.addEventListener('click', () => open('bugs'));
    // the window owns the keyboard: Esc closes, nothing reaches the game's shortcuts (runs before demo.js)
    addEventListener('keydown', (ev) => {
      if (!isOpen()) return;
      ev.stopImmediatePropagation();
      if (ev.code === 'Escape') { ev.preventDefault(); close(); }
    }, true);
  }

  DL.Feedback = {
    // Main Menu → Ideias e bugs (menu.js)
    html(head) {
      setTimeout(() => attach(document.querySelector('#menuViewBody [data-fb-root]'), 'menu'), 0);
      return head('Comunidade · sua voz no jogo', 'Ideias e bugs') + '<div class="fb" data-fb-root></div>';
    },
    open, close,
    get isOpen() { return isOpen(); },
  };
})();
