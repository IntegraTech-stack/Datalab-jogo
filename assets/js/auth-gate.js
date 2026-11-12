/* DataLab — access gate. Nothing (menu, game, shop) is reachable without a Supabase Auth session.
   Login · Cadastro · Recuperação de senha (+ confirmação de e-mail e nova senha pelo link).
   After a valid session: straight to the Main Menu (Novo Jogo / Carregar Jogo). Signing out from any
   place reloads the page, which brings the gate back. Uses only DL.Cloud / DL.Auth (publishable key). */
(function () {
  'use strict';
  const DL = window.DL;
  const $ = (id) => document.getElementById(id);
  const el = { box: $('auth'), card: $('authCard') };
  // the loading cover (jogo.html) leaves once there is something to show: the login or the menu
  const uncover = () => { const c = $('bootCover'); if (c) c.remove(); };
  if (!el.box || DL.HERO) { uncover(); return; } // landing showcase (hero.js): no account involved
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const params = new URLSearchParams(location.search + '&' + location.hash.replace(/^#/, ''));
  const V = {
    view: 'loading', msg: null, tone: 'info', busy: false, email: '', entered: false, draft: {},
    recovery: params.get('reset') === '1' || params.get('type') === 'recovery',
    linkError: params.get('error_description') || null,
  };
  const isOpen = () => el.box.classList.contains('is-open');

  // While the gate is up, no key reaches the menu or the game (forms still work normally).
  addEventListener('keydown', (ev) => { if (isOpen() && !el.box.contains(ev.target)) { ev.stopImmediatePropagation(); ev.preventDefault(); } else if (isOpen()) ev.stopImmediatePropagation(); }, true);

  /* ---------------- views ---------------- */
  // what was typed survives a re-render (an error message), passwords never do
  const kept = (name, type, attrs) => (type !== 'password' && V.draft[name] != null && !/value=/.test(attrs || '') ? ' value="' + esc(V.draft[name]) + '"' : '');
  const field = (label, name, type, attrs, hint) =>
    '<label class="auth-field"><span class="eyebrow-sm">' + label + '</span>' +
    '<span class="auth-input"><input class="input" name="' + name + '" type="' + type + '" ' + (attrs || '') + kept(name, type, attrs) + '>' +
    (type === 'password' ? '<button type="button" class="auth-eye" data-eye aria-label="Mostrar senha">Mostrar</button>' : '') + '</span>' +
    (hint ? '<small class="auth-hint">' + hint + '</small>' : '') + '</label>';
  const primary = (label) => '<button type="submit" class="btn btn--primary auth-submit"' + (V.busy ? ' disabled' : '') + '>' + (V.busy ? 'Aguarde…' : label) + ' <span class="arrow">→</span></button>';
  const link = (to, label) => '<button type="button" class="linkbtn" data-to="' + to + '">' + label + '</button>';
  const msg = () => (V.msg ? '<p class="auth-msg is-' + V.tone + '" role="' + (V.tone === 'warn' ? 'alert' : 'status') + '">' + esc(V.msg) + '</p>' : '');
  const head = (eyebrow, title, text) => '<p class="eyebrow-sm">' + eyebrow + '</p><h2 class="auth-h" id="authTitle">' + title + '</h2>' + (text ? '<p class="auth-text">' + text + '</p>' : '');
  const tabs = () => '<nav class="auth-tabs" role="tablist">' + [['login', 'Entrar'], ['signup', 'Criar conta']].map(([k, l]) =>
    '<button type="button" role="tab" aria-selected="' + (V.view === k) + '" class="auth-tab' + (V.view === k ? ' is-on' : '') + '" data-to="' + k + '">' + l + '</button>').join('') + '</nav>';

  const VIEWS = {
    loading: () => head('Conectando', 'Verificando sua sessão…') + '<div class="auth-spin" aria-hidden="true"></div>',
    config: () => head('Servidor indisponível', 'Não foi possível conectar.', 'O DataLab precisa do servidor para entrar. Verifique a configuração do Supabase em <code>assets/js/supabase/config.js</code> ou tente de novo em instantes.') +
      '<div class="auth-acts"><button type="button" class="btn" data-act="retry">Tentar de novo</button></div>',
    login: () => tabs() + head('Bem-vindo de volta', 'Entrar') + msg() +
      '<form class="auth-form" data-form="login" novalidate>' +
      field('E-mail', 'email', 'email', 'autocomplete="email" required value="' + esc(V.email) + '"') +
      field('Senha', 'password', 'password', 'autocomplete="current-password" required minlength="8"') +
      primary('Entrar') + '</form><div class="auth-links">' + link('forgot', 'Esqueci minha senha') + '</div>',
    signup: () => tabs() + head('Nova conta', 'Criar conta', 'Sua empresa, inventário e progresso são criados no servidor.') + msg() +
      '<form class="auth-form" data-form="signup" novalidate>' +
      field('Nome de usuário', 'username', 'text', 'autocomplete="username" required maxlength="20" pattern="[a-z0-9_]{3,20}" spellcheck="false"', '3 a 20 caracteres: letras minúsculas, números ou _ · único') +
      field('Nome da empresa', 'company', 'text', 'maxlength="40" autocomplete="organization" placeholder="Minha empresa"') +
      field('E-mail', 'email', 'email', 'autocomplete="email" required value="' + esc(V.email) + '"') +
      field('Senha', 'password', 'password', 'autocomplete="new-password" required minlength="8"', 'Mínimo de 8 caracteres, com letras e números') +
      field('Confirmar senha', 'password2', 'password', 'autocomplete="new-password" required minlength="8"') +
      primary('Criar conta') + '</form>',
    forgot: () => head('Recuperação', 'Esqueceu a senha?', 'Enviaremos um link para você criar uma nova senha.') + msg() +
      '<form class="auth-form" data-form="forgot" novalidate>' + field('E-mail da conta', 'email', 'email', 'autocomplete="email" required value="' + esc(V.email) + '"') +
      primary('Enviar link') + '</form><div class="auth-links">' + link('login', '← Voltar para entrar') + '</div>',
    sent: () => head('Recuperação', 'Verifique seu e-mail', 'Se existir uma conta com <b>' + esc(V.email) + '</b>, o link para criar uma nova senha chega em instantes. Ele abre o DataLab de volta nesta página.') +
      '<div class="auth-acts">' + link('login', '← Voltar para entrar') + '</div>',
    confirm: () => head('Quase lá', 'Confirme seu e-mail', 'Enviamos um link de confirmação para <b>' + esc(V.email) + '</b>. Depois de confirmar, você entra direto no menu.') + msg() +
      '<div class="auth-acts"><button type="button" class="btn" data-act="resend"' + (V.busy ? ' disabled' : '') + '>Reenviar e-mail</button>' + link('login', 'Já confirmei · entrar') + '</div>',
    newpass: () => head('Recuperação', 'Crie uma nova senha') + msg() +
      '<form class="auth-form" data-form="newpass" novalidate>' + field('Nova senha', 'password', 'password', 'autocomplete="new-password" required minlength="8"', 'Mínimo de 8 caracteres, com letras e números') +
      field('Confirmar nova senha', 'password2', 'password', 'autocomplete="new-password" required minlength="8"') + primary('Salvar e entrar') + '</form>',
  };

  function render(focus) {
    el.card.innerHTML = (VIEWS[V.view] || VIEWS.login)();
    el.card.dataset.view = V.view;
    if (V.view !== 'loading') uncover();
    if (focus !== false) {
      const first = Array.from(el.card.querySelectorAll('input')).find((i) => !i.value) || el.card.querySelector('input');
      if (first) setTimeout(() => first.focus({ preventScroll: true }), 30);
    }
  }
  const go = (view, m, tone) => { V.view = view; V.msg = m || null; V.tone = tone || 'info'; render(); };

  /* ---------------- entering / leaving ---------------- */
  async function enter() {
    if (V.entered) return;
    V.entered = true;
    el.box.classList.remove('is-open');
    el.box.setAttribute('aria-hidden', 'true');
    setTimeout(() => { el.box.hidden = true; }, 450);
    const D = await waitFor(() => window.DataLabDemo && window.DataLabDemo.menu);
    D.menu.open(); // straight to the Main Menu: Novo Jogo / Carregar Jogo
    uncover();
    const p = await DL.Auth.profile();
    if (p && D.menu.setAccount) D.menu.setAccount(p);
    if (DL.Welcome) DL.Welcome.maybe(); // the account's first time here: welcome + beta notice (welcome.js)
  }
  function waitFor(test) {
    return new Promise((resolve) => { const tick = () => { if (test()) resolve(window.DataLabDemo); else setTimeout(tick, 50); }; tick(); });
  }

  async function boot() {
    render(false);
    let ok = false;
    try { ok = await DL.Cloud.init(); } catch (e) { ok = false; }
    if (!ok) { go('config'); return; }
    if (V.linkError) { go('login', 'O link expirou ou é inválido: ' + V.linkError.replace(/\+/g, ' '), 'warn'); history.replaceState(null, '', location.pathname); return; }
    if (DL.Cloud.signedIn && V.recovery) { go('newpass'); return; }
    if (DL.Cloud.signedIn) { enter(); return; }
    // An e-mail link (?code=…) that didn't turn into a session: with PKCE the link only completes in the
    // browser that asked for it. The confirmation itself already happened on Supabase's side.
    if (params.get('code')) {
      history.replaceState(null, '', location.pathname);
      if (V.recovery) { V.recovery = false; go('forgot', 'Abra o link de recuperação no mesmo navegador em que você pediu (ou peça outro aqui).', 'warn'); return; }
      go('login', 'E-mail confirmado! Entre com seu e-mail e senha.', 'ok');
      return;
    }
    let wasReplaced = false;
    try { wasReplaced = sessionStorage.getItem('datalab.replaced') === '1'; sessionStorage.removeItem('datalab.replaced'); } catch (e) { /* private mode */ }
    if (wasReplaced) { go('login', 'Sua conta entrou em outro computador, então este foi desconectado. Entre de novo para jogar aqui (o outro será desconectado).', 'warn'); return; }
    go('login');
  }

  DL.Cloud.on('auth', ({ event }) => {
    if (event === 'PASSWORD_RECOVERY') { V.recovery = true; if (!V.entered) go('newpass'); return; }
    if (event === 'SIGNED_IN' && !V.entered && !V.recovery && V.view !== 'loading' && V.view !== 'newpass') enter();
    // signed out anywhere (menu, account window, another tab, expired session): back to the gate
    if (event === 'SIGNED_OUT' && V.entered) location.replace(location.pathname);
  });

  /* ---------------- actions ---------------- */
  async function run(fn) {
    if (V.busy) return;
    V.busy = true;
    render(false);
    try { await fn(); } catch (e) { console.error(e); V.msg = 'Algo deu errado. Tente de novo.'; V.tone = 'warn'; }
    V.busy = false;
    render();
  }

  el.card.addEventListener('submit', (ev) => {
    ev.preventDefault();
    const f = ev.target, d = Object.fromEntries(new FormData(f).entries());
    if (d.email) V.email = String(d.email).trim().toLowerCase();
    V.draft = { username: d.username, company: d.company };
    run(async () => {
      switch (f.dataset.form) {
        case 'login': {
          if (!V.email || !d.password) { V.msg = 'Preencha e-mail e senha.'; V.tone = 'warn'; return; }
          const r = await DL.Auth.signIn({ email: V.email, password: d.password });
          if (!r.ok) { V.msg = r.message; V.tone = 'warn'; if (/confirme/i.test(r.message)) V.view = 'confirm'; return; }
          V.msg = null;
          enter();
          return;
        }
        case 'signup': {
          if (d.password !== d.password2) { V.msg = 'As senhas não conferem.'; V.tone = 'warn'; return; }
          const r = await DL.Auth.signUp({ email: V.email, password: d.password, username: d.username, company: d.company });
          if (!r.ok) { V.msg = r.message; V.tone = 'warn'; return; }
          if (r.needsConfirmation) { V.view = 'confirm'; V.msg = null; return; }
          enter();
          return;
        }
        case 'forgot': {
          const r = await DL.Auth.resetPassword(V.email);
          if (!r.ok) { V.msg = r.message; V.tone = 'warn'; return; }
          V.view = 'sent';
          V.msg = null;
          return;
        }
        case 'newpass': {
          if (d.password !== d.password2) { V.msg = 'As senhas não conferem.'; V.tone = 'warn'; return; }
          const r = await DL.Auth.updatePassword(d.password);
          if (!r.ok) { V.msg = r.message; V.tone = 'warn'; return; }
          V.recovery = false;
          history.replaceState(null, '', location.pathname);
          enter();
          return;
        }
      }
    });
  });

  el.card.addEventListener('click', (ev) => {
    const eye = ev.target.closest('[data-eye]');
    if (eye) {
      const inp = eye.parentElement.querySelector('input');
      const show = inp.type === 'password';
      inp.type = show ? 'text' : 'password';
      eye.textContent = show ? 'Ocultar' : 'Mostrar';
      eye.setAttribute('aria-label', show ? 'Ocultar senha' : 'Mostrar senha');
      return;
    }
    const to = ev.target.closest('[data-to]');
    if (to) { const f = el.card.querySelector('input[name="email"]'); if (f && f.value) V.email = f.value.trim().toLowerCase(); go(to.dataset.to); return; }
    const a = ev.target.closest('[data-act]');
    if (!a) return;
    if (a.dataset.act === 'retry') location.reload();
    if (a.dataset.act === 'resend') run(async () => { const r = await DL.Auth.resendConfirmation(V.email); V.msg = r.ok ? 'E-mail reenviado.' : r.message; V.tone = r.ok ? 'ok' : 'warn'; });
  });

  DL.AuthGate = { get open() { return isOpen(); }, get view() { return V.view; } };
  boot();
})();
