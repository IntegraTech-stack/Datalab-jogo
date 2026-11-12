/* DataLab — Auth service: sign up (unique username), sign in, sign out, persistent session,
   password recovery, the player's profile. Uses Supabase Auth through DL.Cloud. */
(function () {
  'use strict';
  const DL = window.DL;
  const USERNAME = /^[a-z0-9_]{3,20}$/;
  const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const fail = (message, code) => ({ ok: false, code: code || 'invalid', message });
  const client = () => DL.Cloud.client;
  const authMsg = (e) => {
    const m = String((e && e.message) || '');
    if (/invalid login/i.test(m)) return 'E-mail ou senha incorretos.';
    if (/email not confirmed/i.test(m)) return 'Confirme seu e-mail antes de entrar (veja a caixa de entrada).';
    if (/already registered|already exists/i.test(m)) return 'Este e-mail já tem uma conta.';
    if (/rate limit|too many/i.test(m)) return 'Muitas tentativas: espere um pouco.';
    if (/password/i.test(m)) return 'Senha recusada: use ao menos 8 caracteres com letras e números.';
    return 'Não foi possível concluir. Tente de novo.';
  };
  function passwordProblem(pw) {
    if (typeof pw !== 'string' || pw.length < 8) return 'A senha precisa de pelo menos 8 caracteres.';
    if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return 'Use letras e números na senha.';
    if (pw.length > 72) return 'Senha longa demais (máx. 72).';
    return null;
  }
  const here = () => location.origin + location.pathname;
  // the confirmation e-mail opens a page that says the address was verified (it must be in the
  // Redirect URLs of Supabase Auth, or Supabase falls back to the Site URL)
  const verifiedPage = () => new URL('email-verificado.html', location.href).href;

  // player titles (badge next to the name), best first. Staff roles give theirs automatically; `grant`
  // ones are handed out by staff (user_titles, see migration 010) and carry no permission.
  DL.TITLES = {
    admin: { name: 'Admin', color: '#ff7a17' },
    developer: { name: 'Dev', color: '#7ee0a1' },
    moderator: { name: 'Moderador', color: '#a0c3ec' },
    founder: { name: 'Fundador', color: '#f2c14e', grant: true },
    beta: { name: 'Beta Tester', color: '#c4b5fd', grant: true },
    creator: { name: 'Criador de conteúdo', color: '#f472b6', grant: true },
    vip: { name: 'VIP', color: '#ffc285', grant: true },
    supporter: { name: 'Apoiador', color: '#5eead4', grant: true },
  };
  const TITLE_ORDER = Object.keys(DL.TITLES);
  DL.titlesOf = (roles, titles) => TITLE_ORDER.filter((id) => (roles || []).indexOf(id) >= 0 || (titles || []).indexOf(id) >= 0);
  DL.titleBadge = (id) => {
    const t = DL.TITLES[id];
    return t ? '<em class="ptitle" style="--tc:' + t.color + '">' + t.name + '</em>' : '';
  };

  DL.Auth = {
    USERNAME,
    passwordProblem,
    async usernameAvailable(name) {
      if (!client()) return false;
      const { data, error } = await client().rpc('username_available', { p_username: name });
      return !error && data === true;
    },
    async signUp({ email, password, username, company }) {
      if (!client()) return fail('Modo online não configurado.', 'offline');
      email = String(email || '').trim().toLowerCase();
      username = String(username || '').trim().toLowerCase();
      if (!EMAIL.test(email)) return fail('E-mail inválido.');
      if (!USERNAME.test(username)) return fail('Usuário: 3 a 20 caracteres, letras minúsculas, números ou _.');
      const pw = passwordProblem(password);
      if (pw) return fail(pw);
      if (!(await this.usernameAvailable(username))) return fail('Este nome de usuário já existe.', 'username_taken');
      // the server creates profile, wallet, inventory, progress and the company (signup trigger)
      const company_name = String(company || '').replace(/[<>\u0000-\u001f]/g, '').trim().slice(0, 40);
      const { data, error } = await client().auth.signUp({ email, password, options: { data: { username, display_name: username, company_name }, emailRedirectTo: verifiedPage() } });
      if (error) return fail(authMsg(error));
      // e-mail already registered: Supabase answers with an empty identity list (no enumeration)
      if (data.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) return fail('Este e-mail já tem uma conta. Entre ou recupere a senha.', 'email_taken');
      return { ok: true, needsConfirmation: !data.session };
    },
    async resendConfirmation(email) {
      if (!client()) return fail('Servidor indisponível.', 'offline');
      email = String(email || '').trim().toLowerCase();
      if (!EMAIL.test(email)) return fail('E-mail inválido.');
      const { error } = await client().auth.resend({ type: 'signup', email, options: { emailRedirectTo: verifiedPage() } });
      return error ? fail(authMsg(error)) : { ok: true };
    },
    async signIn({ email, password }) {
      if (!client()) return fail('Modo online não configurado.', 'offline');
      const { error } = await client().auth.signInWithPassword({ email: String(email || '').trim().toLowerCase(), password: String(password || '') });
      return error ? fail(authMsg(error)) : { ok: true };
    },
    async signOut() {
      if (!client()) return { ok: true };
      await client().auth.signOut();
      return { ok: true };
    },
    // sends the recovery e-mail; the link comes back to this page (event PASSWORD_RECOVERY)
    async resetPassword(email) {
      if (!client()) return fail('Modo online não configurado.', 'offline');
      email = String(email || '').trim().toLowerCase();
      if (!EMAIL.test(email)) return fail('E-mail inválido.');
      const { error } = await client().auth.resetPasswordForEmail(email, { redirectTo: here() + '?reset=1' });
      // same answer whether the e-mail exists or not (no account enumeration)
      if (error && !/rate/i.test(error.message)) console.warn('reset', error.message);
      return { ok: true };
    },
    async updatePassword(password) {
      const pw = passwordProblem(password);
      if (pw) return fail(pw);
      const { error } = await client().auth.updateUser({ password });
      return error ? fail(authMsg(error)) : { ok: true };
    },
    async profile() {
      const u = DL.Cloud.user;
      if (!u || !client()) return null;
      const { data, error } = await client().from('profiles').select('id, username, display_name, avatar, created_at').eq('id', u.id).single();
      return error ? null : Object.assign({ email: u.email }, data);
    },
    // only these fields can be changed by the player (column grants + RLS on the server)
    async updateProfile(patch) {
      const u = DL.Cloud.user;
      if (!u) return fail('Faça login.', 'unauthorized');
      const row = {};
      if (patch.username != null) {
        const name = String(patch.username).trim().toLowerCase();
        if (!USERNAME.test(name)) return fail('Usuário: 3 a 20 caracteres, letras minúsculas, números ou _.');
        row.username = name;
      }
      if (patch.display_name != null) row.display_name = String(patch.display_name).trim().slice(0, 32) || null;
      if (patch.avatar != null) row.avatar = patch.avatar;
      const { error } = await client().from('profiles').update(row).eq('id', u.id);
      if (error) return fail(/duplicate|unique/i.test(error.message) ? 'Este nome de usuário já existe.' : 'Não foi possível salvar o perfil.');
      return { ok: true };
    },
    async roles() {
      const u = DL.Cloud.user;
      if (!u || !client()) return [];
      const { data } = await client().from('user_roles').select('role').eq('user_id', u.id);
      return (data || []).map((r) => r.role);
    },
    // the player's titles, best first: staff roles give theirs, the rest come from user_titles
    myTitles: [],
    async titles() {
      const u = DL.Cloud.user;
      if (!u || !client()) return (DL.Auth.myTitles = []);
      const [roles, { data }] = await Promise.all([DL.Auth.roles(), client().from('user_titles').select('title').eq('user_id', u.id)]);
      DL.Auth.myTitles = DL.titlesOf(roles, (data || []).map((r) => r.title));
      dispatchEvent(new CustomEvent('datalab:titles', { detail: DL.Auth.myTitles }));
      return DL.Auth.myTitles;
    },
  };
})();
