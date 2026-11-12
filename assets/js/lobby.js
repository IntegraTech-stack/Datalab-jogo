/* DataLab — multiplayer screens (multiplayer.js does the work):
   - Main Menu → Jogar On-Line: create a room (it gets a code) or join one with a code / invitation link;
   - in game: "Abrir sala" (the running world becomes a room), the room panel with the code, who is
     connected, saving and leaving; name tags over the other players; what happens when a connection drops;
   - what each player is listening to (tag + panel) and the card a click on a character opens.
   Nothing to install: the host's own browser is the room (services/net-service.js). */
(function () {
  'use strict';
  const DL = window.DL, D = window.DataLabDemo;
  if (!D || DL.HERO || !DL.MP) return;
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const MP = DL.MP, G = D.game, Net = DL.Net;
  const L = { tab: 'join', msg: '', tone: '', busy: false, saves: [], invite: '' };
  const myName = () => (D.crew.playerProfile && D.crew.playerProfile.name) || 'Jogador';
  const online = () => !!(DL.Cloud && DL.Cloud.client);

  // "#sala=K7P2QX": this page was opened from an invitation link
  const hashCode = Net.parseCode(location.hash);
  if (hashCode) { L.invite = hashCode; history.replaceState(null, '', location.pathname + location.search); }

  function drawFace(cv, look) {
    try {
      const sheet = DL.makeSheet(DL.crewLook(Object.assign({}, look || {})));
      cv.width = cv.height = 32;
      const g = cv.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.drawImage(sheet.down.idle, 3, 1, 16, 16, 0, 0, 32, 32);
    } catch (e) { /* a look this version doesn't know: no face */ }
  }

  /* ------------------------------------------------------------------ */
  /* the music and levels of a look: it comes from another player, so    */
  /* nothing in it is trusted (links and covers only from these services) */
  /* ------------------------------------------------------------------ */
  const MUSIC = {
    spotify: { name: 'Spotify', img: /(^|\.)(scdn\.co|spotifycdn\.com)$/, link: /^open\.spotify\.com$/ },
    ytm: { name: 'YouTube Music', img: /(^|\.)(ytimg\.com|googleusercontent\.com|ggpht\.com)$/, link: /^music\.youtube\.com$/ },
  };
  const safeUrl = (u, host) => { try { const x = new URL(u); return x.protocol === 'https:' && host.test(x.hostname) ? x.href : ''; } catch (e) { return ''; } };
  const liveOf = (p) => (p && p.look && p.look.live && typeof p.look.live === 'object' ? p.look.live : {});
  function musicOf(p) {
    const m = liveOf(p).music;
    if (!m || (m.src !== 'spotify' && m.src !== 'ytm') || typeof m.title !== 'string' || !m.title) return null;
    const s = MUSIC[m.src];
    return { src: m.src, service: s.name, title: m.title.slice(0, 120), artist: String(m.artist || '').slice(0, 120), image: safeUrl(m.image, s.img), url: safeUrl(m.url, s.link), on: !!m.on };
  }
  const levelNum = (v) => { const n = Math.floor(Number(v)); return n >= 1 && n <= 9999 ? n : 0; };

  /* ------------------------------------------------------------------ */
  /* in game: the card of a player (a click on the character, or the     */
  /* name in the room panel)                                             */
  /* ------------------------------------------------------------------ */
  const card = document.createElement('aside');
  card.className = 'mp-card';
  card.hidden = true;
  card.setAttribute('aria-label', 'Perfil do jogador');
  if ($('mpHud')) $('mpHud').parentNode.appendChild(card);
  const C = { id: null, key: '' };

  const cosmeticName = (slot, value) => { const it = (DL.COSMETICS || []).find((c) => c.slot === slot && c.value === value); return it ? it.name : ''; };
  const labelOf = (list, v) => (list.find((x) => x[0] === v) || [])[1] || '';
  const swatch = (c) => (/^#[0-9a-f]{3,8}$/i.test(c) ? '<i class="mp-card__sw" style="background:' + c + '"></i>' : '');
  const row = (label, value) => (value ? '<div><dt class="eyebrow-sm">' + label + '</dt><dd>' + value + '</dd></div>' : '');

  function cardMusic(p) {
    const m = musicOf(p);
    if (!m) return '<p class="mp-card__none">Nada tocando agora</p>';
    const title = m.url ? '<a href="' + esc(m.url) + '" target="_blank" rel="noopener noreferrer" title="Abrir no ' + m.service + '">' + esc(m.title) + '</a>' : esc(m.title);
    return '<div class="mp-card__music mp-card__music--' + m.src + '"><span class="mp-card__art">' + (m.image ? '<img src="' + esc(m.image) + '" alt="" referrerpolicy="no-referrer">' : '♪') + '</span>' +
      '<span class="mp-card__track"><b>' + title + '</b><span>' + esc(m.artist) + '</span><small>' + m.service + (m.on ? '' : ' · pausado') + '</small></span></div>';
  }
  function cardLook(look) {
    const LL = DL.LOOK_LABELS || { BODIES: [], STYLES: [], OUTFITS: [], EXTRAS: [] };
    const role = DL.ROLES && Object.prototype.hasOwnProperty.call(DL.ROLES, look.role) ? DL.ROLES[look.role] : null;
    const hair = labelOf(LL.STYLES, look.hairStyle) || cosmeticName('hair', look.hairStyle);
    const outfit = labelOf(LL.OUTFITS, look.outfit) || cosmeticName('shirt', look.outfit);
    const pants = look.pantsStyle ? cosmeticName('pants', look.pantsStyle) : 'Reta';
    const acc = LL.EXTRAS.concat([['shades', 'Óculos escuros'], ['scarf', 'Cachecol'], ['backpack', 'Mochila'], ['chain', 'Corrente']]).filter(([k]) => look[k]).map((x) => x[1]);
    if (look.hat) acc.push(cosmeticName('hat', look.hat) || 'Chapéu');
    if (look.gear && typeof look.gear === 'object') for (const slot of Object.keys(look.gear)) { const n = cosmeticName(slot, look.gear[slot]); if (n) acc.push(n); }
    const worn = [['trail', 'Rastro'], ['aura', 'Aura'], ['frame', 'Moldura'], ['icon', 'Ícone'], ['title', 'Título']]
      .map(([slot, label]) => row(label, esc(cosmeticName(slot, look[slot])))).join('');
    return '<dl class="mp-card__rows">' +
      row('Função', role ? esc(role.name) : '') + row('Aparência', esc(labelOf(LL.BODIES, look.body))) + row('Pele', swatch(look.skin)) +
      row('Cabelo', swatch(look.hair) + esc(hair)) + row('Roupa', swatch(look.shirt) + esc(outfit)) + row('Calça', swatch(look.pants) + esc(pants)) + row('Sapatos', swatch(look.shoes)) +
      row('Acessórios', esc(acc.join(', '))) + worn + '</dl>';
  }
  // add this player as a friend: their username comes with the look, so it's checked like the rest of it
  function cardFriend(p) {
    const F = DL.Friends, user = liveOf(p).user;
    if (p.me || !F || !F.ready || typeof user !== 'string' || !/^[a-z0-9_]{3,20}$/.test(user)) return '';
    const rel = F.relationOf(user);
    if (rel && rel.kind === 'friend') return '<p class="mp-card__none">✓ Vocês são amigos</p>';
    if (rel && rel.kind === 'outgoing') return '<button class="btn btn--sm" type="button" disabled>Pedido enviado</button>';
    return '<button class="btn btn--sm btn--primary" type="button" data-card-friend="' + esc(user) + '">' + (rel ? 'Aceitar pedido de amizade' : 'Adicionar amigo') + '</button>';
  }
  function cardHtml(p) {
    const look = p.look && typeof p.look === 'object' ? p.look : {}, live = liveOf(p);
    const level = levelNum(live.level), pass = levelNum(live.pass), rank = typeof live.rank === 'string' ? live.rank.slice(0, 40) : '';
    return '<button class="cc__x mp-card__x" type="button" data-card-close aria-label="Fechar">×</button>' +
      '<header class="mp-card__head"><span class="mp-card__body' + (DL.passFrameClass ? DL.passFrameClass(look.frame) : '') + '"><canvas data-card-body aria-hidden="true"></canvas></span>' +
      '<span class="mp-card__who"><b>' + (DL.passIconHtml ? DL.passIconHtml(look.icon) : '') + esc(p.name) + '</b>' + (look.title && DL.passTitleHtml ? DL.passTitleHtml(look.title) : '') +
      '<small>' + (p.role === 'host' ? 'Anfitrião' : 'Convidado') + (p.me ? ' · você' : '') + '</small></span></header>' +
      '<ul class="mp-card__stats"><li><small class="eyebrow-sm">Nível</small><b>' + (level || '—') + '</b></li>' +
      (pass ? '<li><small class="eyebrow-sm">Passe</small><b>' + pass + '</b></li>' : '') +
      (rank ? '<li class="is-wide"><small class="eyebrow-sm">Patente</small><b>' + esc(rank) + '</b></li>' : '') + '</ul>' + cardFriend(p) +
      '<section><h3 class="eyebrow-sm">Ouvindo</h3>' + cardMusic(p) + '</section>' +
      '<section><h3 class="eyebrow-sm">Personagem</h3>' + cardLook(look) + '</section>';
  }
  function closeCard() { C.id = null; C.key = ''; card.hidden = true; card.innerHTML = ''; }
  function renderCard() {
    if (C.id === null) return;
    const p = MP.role ? MP.players().find((x) => x.id === C.id) : null;
    if (!p) return closeCard();
    const html = cardHtml(p);
    // redrawn every few seconds: leave the cover and the character alone when nothing changed
    if (html === C.key) return;
    C.key = html;
    card.innerHTML = html;
    const cv = card.querySelector('[data-card-body]');
    try {
      const f = DL.makeSheet(DL.crewLook(Object.assign({}, p.look || {}))).down.idle;
      cv.width = f.width; cv.height = f.height;
      cv.getContext('2d').drawImage(f, 0, 0);
    } catch (e) { /* a look this version doesn't know: no picture */ }
  }
  function showPlayer(id) { C.id = id; C.key = ''; card.hidden = false; renderCard(); }
  card.addEventListener('click', async (ev) => {
    if (ev.target.closest('[data-card-close]')) return closeCard();
    const b = ev.target.closest('[data-card-friend]');
    if (!b) return;
    b.disabled = true;
    const user = b.dataset.cardFriend, rel = DL.Friends.relationOf(user);
    const r = rel ? await DL.Friends.respond(rel.id, true) : await DL.Friends.request(user);
    if (!r.ok) { G.toast('warn', 'Amigos', r.message); b.disabled = false; return; }
    G.toast('ok', 'Amigos', rel || r.data.status === 'accepted' ? 'Você e @' + user + ' agora são amigos' : 'Pedido enviado para @' + user);
  });
  if (DL.Friends) DL.Friends.on(renderCard);
  document.addEventListener('pointerdown', (ev) => { if (!card.hidden && !card.contains(ev.target)) closeCard(); }, true);
  addEventListener('keydown', (ev) => { if (ev.code === 'Escape' && !card.hidden) { closeCard(); ev.preventDefault(); ev.stopImmediatePropagation(); } }, true);

  function copy(text, done) {
    const ok = () => G.toast('ok', 'Copiado', done);
    if (navigator.clipboard) navigator.clipboard.writeText(text).then(ok, () => G.toast('info', 'Convite', text));
    else G.toast('info', 'Convite', text);
  }

  /* ------------------------------------------------------------------ */
  /* Main Menu → Jogar On-Line                                           */
  /* ------------------------------------------------------------------ */
  function html(head) {
    setTimeout(hydrate, 0);
    const tab = (id, label) => '<button type="button" role="tab" class="mv-tab' + (L.tab === id ? ' is-on' : '') + '" data-mp-tab="' + id + '" aria-selected="' + (L.tab === id) + '">' + label + '</button>';
    let h = head('Multijogador · jogue no mesmo datacenter', 'Jogar online', '<div class="mv-tabs" role="tablist">' + tab('join', 'Entrar numa sala') + tab('host', 'Criar sala') + '</div>');
    h += '<div class="mp-lobby" data-mp-body>' + (L.tab === 'join' ? joinHtml() : hostHtml()) + '</div>';
    h += '<p class="mp-msg' + (L.tone ? ' mp-msg--' + L.tone : '') + '" data-mp-msg role="status" aria-live="polite">' + esc(L.msg) + '</p>';
    return h;
  }

  function joinHtml() {
    return '<form class="mp-form" data-mp="join" autocomplete="off">' +
      '<p class="mv-note">Digite o código que o anfitrião passou (ou abra o link de convite dele).</p>' +
      '<label class="mp-field"><span class="eyebrow-sm">Código da sala</span><input class="input mp-code-in" name="code" placeholder="ABC-123" maxlength="80" autocapitalize="characters" spellcheck="false" value="' + esc(L.invite ? Net.showCode(L.invite) : '') + '" required></label>' +
      '<label class="mp-field"><span class="eyebrow-sm">Senha da sala (se tiver)</span><input class="input" name="pass" type="password" maxlength="40"></label>' +
      '<div class="mp-actions"><button class="btn btn--primary" type="submit"' + (L.busy ? ' disabled' : '') + '>Entrar <span class="arrow">→</span></button><span class="eyebrow-sm">Entrando como ' + esc(myName()) + '</span></div>' +
      '</form>';
  }

  function hostHtml() {
    if (!online()) return '<div class="mv-empty"><b>Sem conexão com o DataLab</b><p>Para criar uma sala é preciso estar conectado à internet e na sua conta.</p></div>';
    const opt = (v, label, sub, on) => '<label class="mp-world"><input type="radio" name="world" value="' + esc(v) + '"' + (on ? ' checked' : '') + '><span><b>' + esc(label) + '</b><small>' + esc(sub) + '</small></span></label>';
    let worlds = opt('new', 'Novo mundo', 'Começa do zero, como um Novo Jogo', true);
    for (const w of L.saves) worlds += opt('cloud:' + w.slot, w.name || 'Meu datacenter', 'Save da sua conta · espaço ' + w.slot, false);
    return '<form class="mp-form" data-mp="host" autocomplete="off">' +
      '<label class="mp-field"><span class="eyebrow-sm">Nome da sala</span><input class="input" name="name" maxlength="40" value="' + esc('Sala de ' + myName()) + '" required></label>' +
      '<label class="mp-field"><span class="eyebrow-sm">Senha (opcional)</span><input class="input" name="pass" type="password" maxlength="40" placeholder="sem senha: quem tiver o código entra"></label>' +
      '<fieldset class="mp-worlds"><legend class="eyebrow-sm">Mundo</legend>' + worlds + '</fieldset>' +
      '<div class="mp-actions"><button class="btn btn--primary" type="submit"' + (L.busy ? ' disabled' : '') + '>Criar sala <span class="arrow">→</span></button><span class="eyebrow-sm">Até ' + Net.MAX_GUESTS + ' convidados · você recebe um código para passar</span></div>' +
      '</form>';
  }

  const body = () => document.querySelector('[data-mp-body]');
  function rerender() {
    const b = body();
    if (!b) return;
    b.innerHTML = L.tab === 'join' ? joinHtml() : hostHtml();
    document.querySelectorAll('[data-mp-tab]').forEach((t) => { const on = t.dataset.mpTab === L.tab; t.classList.toggle('is-on', on); t.setAttribute('aria-selected', on); });
    say(L.msg, L.tone);
  }
  function say(msg, tone) {
    L.msg = msg || ''; L.tone = tone || '';
    const el = document.querySelector('[data-mp-msg]');
    if (el) { el.textContent = L.msg; el.className = 'mp-msg' + (L.tone ? ' mp-msg--' + L.tone : ''); }
  }

  async function hydrate() {
    if (!body()) return;
    if (L.tab === 'host' && DL.SaveService && DL.Cloud && DL.Cloud.signedIn) {
      const list = await DL.SaveService.listCloud();
      L.saves = list.error ? [] : list.filter((s) => s.version > 0);
    }
    rerender();
    const f = document.querySelector('[data-mp="join"] [name=' + (L.invite ? 'pass' : 'code') + ']');
    if (f && L.tab === 'join') f.focus({ preventScroll: true });
  }

  function leaveMenu() {
    if (D.menu && D.menu.close) D.menu.close(true);
    $('title').hidden = true;
    G.root.classList.remove('is-title');
    D.scene.o.attract = false;
  }

  function join(form) {
    const code = Net.parseCode(form.code.value);
    if (!code) { say('Código inválido: são 6 letras e números, como ABC-123.', 'warn'); return; }
    L.busy = true;
    say('Procurando a sala ' + Net.showCode(code) + '…');
    rerender();
    MP.join(code, form.pass.value);
  }

  async function create(form) {
    const name = form.name.value.trim() || 'Sala de ' + myName(), pass = form.pass.value, world = (form.world && form.world.value) || 'new';
    L.busy = true;
    say('Preparando o mundo…');
    rerender();
    leaveMenu();
    if (world.startsWith('cloud:')) {
      const r = await DL.CloudSync.load(+world.slice(6));
      if (!r.ok) { L.busy = false; return; }
    } else {
      D.choosePreset('zero');
      D.begin(false);
      D.setMode('explore');
    }
    openRoom(name, pass);
    L.busy = false;
  }
  function openRoom(name, pass) {
    G.toast('info', 'Sala', 'Abrindo a sala…');
    MP.host({ name, pass });
  }

  /* ------------------------------------------------------------------ */
  /* in game: the room panel                                             */
  /* ------------------------------------------------------------------ */
  const hud = $('mpHud');
  let hudOpen = innerWidth >= 860;
  function hudSong(p) {
    const m = musicOf(p);
    if (!m || !m.on) return '';
    const text = '♪ ' + m.title + (m.artist ? ' · ' + m.artist : '');
    return '<small class="mp-hud__song mp-hud__song--' + m.src + '" title="' + esc(text + ' (' + m.service + ')') + '">' + esc(text) + '</small>';
  }
  function renderHud() {
    if (!hud) return;
    const role = MP.role;
    hud.hidden = !role;
    $('mpOpenBtn').hidden = !!role || !online();
    if (!role) return;
    const list = MP.players();
    const host = role === 'host';
    const code = MP.room && MP.room.code;
    let h = '<button class="mp-hud__head" type="button" data-mp-act="toggle" aria-expanded="' + hudOpen + '"><span class="dot dot--live" aria-hidden="true"></span><b>' + esc(MP.room ? MP.room.name : 'Sala') + '</b><span class="eyebrow-sm">' + list.length + (list.length === 1 ? ' jogador' : ' jogadores') + '</span></button>';
    if (hudOpen) {
      h += '<div class="mp-hud__body">';
      if (code) {
        h += '<div class="mp-hud__code"><span class="eyebrow-sm">Código da sala</span><b>' + Net.showCode(code) + '</b>' +
          '<span class="mp-hud__copy"><button class="btn btn--sm" type="button" data-mp-act="copy-code">Copiar código</button><button class="btn btn--sm" type="button" data-mp-act="copy-link">Copiar convite</button></span></div>';
      }
      h += '<ul class="mp-hud__list">' + list.map((p) =>
        '<li><span class="mp-hud__face' + (p.look && DL.passFrameClass ? DL.passFrameClass(p.look.frame) : '') + '"><canvas data-mp-face="' + esc(p.id) + '" aria-hidden="true"></canvas></span><button class="mp-hud__who" type="button" data-mp-act="card" data-id="' + esc(p.id) + '" title="Ver o perfil de ' + esc(p.name) + '"><b>' + (p.look && DL.passIconHtml ? DL.passIconHtml(p.look.icon) : '') + esc(p.name) + '</b>' +
        (p.look && p.look.title && DL.passTitleHtml ? DL.passTitleHtml(p.look.title) : '') + '<small>' + (p.role === 'host' ? 'Anfitrião' : 'Convidado') + (p.me ? ' · você' + (role === 'guest' && MP.rtt ? ' · ' + MP.rtt + ' ms' : '') : '') + '</small>' + hudSong(p) + '</button>' +
        (host && !p.me ? '<button class="cc__x" type="button" data-mp-act="kick" data-id="' + esc(p.id) + '" title="Remover da sala" aria-label="Remover ' + esc(p.name) + ' da sala">×</button>' : '') + '</li>').join('') + '</ul>';
      h += '<div class="mp-hud__acts">' + (host ? '<button class="btn btn--sm" type="button" data-mp-act="save">Salvar mundo</button><button class="btn btn--sm" type="button" data-mp-act="leave">Fechar sala</button>'
        : '<button class="btn btn--sm" type="button" data-mp-act="leave">Sair da sala</button>') + '</div>';
      if (host) h += '<p class="mp-hud__note">' + (MP.savedAt ? 'Salvo na sua conta às ' + new Date(MP.savedAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : 'O mundo é salvo na sua conta automaticamente') + '</p>';
      else h += '<p class="mp-hud__note">O mundo é do anfitrião: ele salva. Suas compras saem do caixa da empresa dele.</p>';
      h += '</div>';
    }
    hud.innerHTML = h;
    const players = new Map(list.map((p) => [p.id, p]));
    hud.querySelectorAll('canvas[data-mp-face]').forEach((cv) => drawFace(cv, (players.get(cv.dataset.mpFace) || {}).look));
  }
  if (hud) {
    hud.addEventListener('click', async (ev) => {
      const b = ev.target.closest('[data-mp-act]');
      if (!b) return;
      const act = b.dataset.mpAct, code = MP.room && MP.room.code;
      if (act === 'toggle') { hudOpen = !hudOpen; renderHud(); }
      else if (act === 'card') showPlayer(b.dataset.id);
      else if (act === 'kick') MP.kick(b.dataset.id);
      else if (act === 'copy-code' && code) copy(Net.showCode(code), 'Código ' + Net.showCode(code) + ' · passe para quem vai jogar');
      else if (act === 'copy-link' && code) copy(Net.inviteLink(code), 'Link de convite · quem abrir entra direto na sala');
      else if (act === 'save') {
        b.disabled = true;
        const r = await MP.saveWorld();
        G.toast(r.ok ? 'ok' : 'warn', 'Sala', r.ok ? 'Mundo salvo na sua conta' : 'Não foi possível salvar: ' + (r.message || 'tente de novo'));
        renderHud();
      } else if (act === 'leave') leaveRoom();
      b.blur();
    });
    hud.addEventListener('pointerdown', (ev) => ev.stopPropagation());
  }
  setInterval(() => { if (MP.role && hudOpen) renderHud(); renderCard(); }, 3000);

  async function leaveRoom() {
    if (MP.role === 'guest') {
      await MP.leave();
      location.replace(location.pathname); // the visited world was never this player's: back to the menu
      return;
    }
    await MP.leave();
    G.toast('ok', 'Sala fechada', 'O mundo foi salvo · você continua jogando sozinho');
  }

  /* ------------------------------------------------------------------ */
  /* dialogs: "Abrir sala", connection lost, room ended                  */
  /* ------------------------------------------------------------------ */
  const dlg = $('mpDialog'), dlgBody = $('mpDialogBody');
  function dialog(htmlText) {
    dlgBody.innerHTML = htmlText;
    dlg.classList.add('is-open');
    const f = dlgBody.querySelector('input, button.btn--primary');
    if (f) setTimeout(() => f.focus({ preventScroll: true }), 30);
  }
  const closeDialog = () => dlg.classList.remove('is-open');
  if (dlg) {
    dlg.addEventListener('keydown', (ev) => { if (ev.code === 'Escape' && !dlg.dataset.locked) closeDialog(); ev.stopPropagation(); });
    dlg.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-mp-act]');
      if (!b) return;
      if (b.dataset.mpAct === 'close') closeDialog();
      if (b.dataset.mpAct === 'menu') location.replace(location.pathname);
    });
    dlg.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const f = ev.target;
      if (f.dataset.mp !== 'open') return;
      closeDialog();
      openRoom(f.name.value.trim() || 'Sala de ' + myName(), f.pass.value);
    });
  }
  const openBtn = $('mpOpenBtn');
  if (openBtn) openBtn.addEventListener('click', () => {
    if (D.state.phase !== 'play' || MP.role) return;
    dialog('<p class="eyebrow-sm">Multijogador</p><h2 class="card__title card__title--sm" id="mpDialogTitle">Abrir sala</h2>' +
      '<p class="card__text">Este datacenter vira uma sala: você recebe um código, e quem o tiver entra e joga junto, no mesmo mundo.</p>' +
      '<form class="mp-form" data-mp="open" autocomplete="off"><label class="mp-field"><span class="eyebrow-sm">Nome da sala</span><input class="input" name="name" maxlength="40" value="' + esc('Sala de ' + myName()) + '"></label>' +
      '<label class="mp-field"><span class="eyebrow-sm">Senha (opcional)</span><input class="input" name="pass" type="password" maxlength="40"></label>' +
      '<div class="card__actions"><button class="btn btn--primary" type="submit">Abrir sala <span class="arrow">→</span></button><button class="btn" type="button" data-mp-act="close">Cancelar</button></div></form>');
  });

  /* ------------------------------------------------------------------ */
  /* session events                                                      */
  /* ------------------------------------------------------------------ */
  MP.on('state', ({ open }) => {
    renderHud();
    if (!open) closeCard();
    if (open && MP.role === 'host') {
      hudOpen = true;
      renderHud();
      G.toast('ok', 'Sala aberta', 'Código ' + Net.showCode(MP.room.code) + ' · passe para quem vai jogar');
    }
  });
  MP.on('roster', renderHud);
  MP.on('roster', renderCard);
  MP.on('saved', renderHud);
  MP.on('ready', () => {
    L.busy = false;
    leaveMenu();
    delete dlg.dataset.locked;
    closeDialog();
    renderHud();
    G.toast('ok', 'Você entrou na sala', (MP.room ? MP.room.name : '') + ' · o mundo é do anfitrião');
  });
  MP.on('fail', ({ reason }) => {
    L.busy = false;
    // the host side fails after the menu is gone: say it in the game
    if (D.state.phase === 'play' && !body()) G.toast('warn', 'Não foi possível abrir a sala', reason);
    say('Não foi possível entrar: ' + reason, 'warn');
    rerender();
    renderHud();
  });
  MP.on('reconnecting', ({ n, of }) => {
    dlg.dataset.locked = '1';
    dialog('<p class="eyebrow-sm"><span class="dot dot--warn dot--live"></span>&nbsp; Conexão perdida</p><h2 class="card__title card__title--sm">Reconectando… (' + n + '/' + (of || 5) + ')</h2><p class="card__text">A conexão com o anfitrião caiu. Tentando voltar para a sala.</p>' +
      '<div class="card__actions"><button class="btn" type="button" data-mp-act="menu">Voltar ao menu</button></div>');
  });
  MP.on('ended', ({ reason }) => {
    dlg.dataset.locked = '1';
    renderHud();
    dialog('<p class="eyebrow-sm">Sala encerrada</p><h2 class="card__title card__title--sm">' + esc(reason.charAt(0).toUpperCase() + reason.slice(1)) + '</h2><p class="card__text">O mundo continua salvo na conta do anfitrião. Quando ele abrir a sala de novo, é só entrar com o código novo.</p>' +
      '<div class="card__actions"><button class="btn btn--primary" type="button" data-mp-act="menu">Voltar ao menu <span class="arrow">→</span></button></div>');
  });

  // in game, "Menu" while in a room: a guest just leaves; the host saves and closes the room first
  const menuBtn = $('menuBtn');
  if (menuBtn) menuBtn.addEventListener('click', async (ev) => {
    if (!MP.role) return;
    ev.stopImmediatePropagation();
    const guest = MP.role === 'guest';
    await MP.leave();
    if (guest) location.replace(location.pathname);
    else menuBtn.click(); // now solo: saves to the account and goes back to the menu
  }, true);

  /* ------------------------------------------------------------------ */
  /* name tags over the other players                                    */
  /* ------------------------------------------------------------------ */
  const tags = $('mpTags');
  const tagEls = new Map();
  (function tagLoop() {
    requestAnimationFrame(tagLoop);
    if (!tags) return;
    const st = MP._.state, seen = new Set();
    if (MP.role && D.state.phase === 'play') {
      for (const p of st.players.values()) {
        const a = p.actor;
        if (!a) continue;
        seen.add(p.id);
        let el = tagEls.get(p.id);
        if (!el) { el = document.createElement('span'); el.className = 'mp-tag'; tags.appendChild(el); tagEls.set(p.id, el); }
        const b = a.bubble && a.bubble.left > 0 ? a.bubble.text : '';
        // the season pass' title (Pioneiro) goes under the name, its icon (Chip Boot) before it (battlepass.js)
        const title = !b && p.look && p.look.title && DL.passTitleHtml ? DL.passTitleHtml(p.look.title) : '';
        const icon = !b && p.look && DL.passIconHtml ? DL.passIconHtml(p.look.icon) : '';
        // and what they are listening to, while it plays
        const m = b ? null : musicOf(p), song = m && m.on ? m.title : '';
        const text = (b || p.name) + '|' + title + '|' + icon + '|' + song;
        if (el.dataset.text !== text) {
          el.dataset.text = text;
          if (title || icon || song) el.innerHTML = '<span class="mp-tag__name">' + icon + esc(p.name) + '</span>' + title + (song ? '<span class="mp-tag__song">♪ ' + esc(song) + '</span>' : ''); else el.textContent = b || p.name;
          el.classList.toggle('mp-tag--say', !!b);
          el.classList.toggle('has-ptitle', !!title);
          el.classList.toggle('has-song', !!song);
        }
        // talking on the voice chat (voice.js): the tag lights up with a microphone
        el.classList.toggle('mp-tag--talk', !!(DL.Voice && DL.Voice.talking(p.id)));
        const s = D.scene.worldToScreen(a.x, a.y, a.seated ? 27 : 33);
        // only the players on my side of the front door (street.js)
        el.style.display = DL.Street && !DL.Street.sameSide(a) ? 'none' : '';
        el.style.transform = 'translate(' + Math.round(s.x) + 'px,' + Math.round(s.y) + 'px) translate(-50%, -100%)';
      }
    }
    for (const [id, el] of tagEls) if (!seen.has(id)) { el.remove(); tagEls.delete(id); }
  })();
  // the remote players' speech bubbles fade like the crew's
  G.on('step', (dt) => { for (const p of MP._.state.players.values()) if (p.actor && p.actor.bubble && (p.actor.bubble.left -= dt) <= 0) p.actor.bubble = null; });

  /* ------------------------------------------------------------------ */
  /* boot                                                                */
  /* ------------------------------------------------------------------ */
  // the cloud client arrives after the login: then "Abrir sala" can show up
  if (DL.Cloud) DL.Cloud.on('auth', () => renderHud());
  renderHud();
  // opened from an invitation link: straight to "Entrar numa sala" once the menu is up
  if (L.invite) {
    const wait = setInterval(() => {
      const title = $('title'), auth = $('auth');
      if (!title || title.hidden || (auth && auth.classList.contains('is-open')) || !D.menu) return;
      clearInterval(wait);
      L.tab = 'join';
      D.menu.open('online');
    }, 300);
  }

  DL.Lobby = {
    html,
    showPlayer,
    // the menu's clicks and forms inside this screen
    click(ev) {
      const t = ev.target.closest('[data-mp-tab]');
      if (t) { L.tab = t.dataset.mpTab; say(''); rerender(); hydrate(); return true; }
      return false;
    },
    submit(ev) {
      const f = ev.target.closest('[data-mp]');
      if (!f) return false;
      if (L.busy) return true;
      if (f.dataset.mp === 'join') join(f);
      else if (f.dataset.mp === 'host') create(f);
      return true;
    },
  };
})();
