/* DataLab — cloud sync: what changes in the running game when the player is logged in.
   - wallet and inventory come from the server (DL.InventoryService), not from this browser;
   - a new game gets a cloud save slot, saved automatically (DL.SaveService);
   - land is bought on the server (build.js asks game.cloudLot);
   - the character's look is kept in the profile (the server strips cosmetics not owned).
   Logging out puts the offline game back exactly as it was. */
(function () {
  'use strict';
  const DL = window.DL, D = window.DataLabDemo;
  if (!D || !DL.Cloud || DL.HERO) return;
  const G = D.game;
  const LOOK_KEYS = ['name', 'body', 'skin', 'hair', 'hairStyle', 'outfit', 'shirt', 'pants', 'pantsStyle', 'shoes', 'vest', 'glasses', 'beard', 'headset', 'earrings', 'hat', 'hatColor', 'shades', 'scarf', 'backpack', 'chain', 'role'];
  const S = { on: false, lookT: 0 };
  const toast = (tone, title, text) => G.toast(tone, title, text);

  function setSlot(slot) {
    DL.SaveService.slot = slot;
    G.cloudLot = slot ? (dw, dh, built) => DL.EconomyService.expandLot(slot, dw, dh, built) : null;
    DL.Cloud.emit('slot', { slot });
  }

  async function signedIn(user) {
    D.economy.setCloud(true, null);
    const st = await DL.InventoryService.state();
    if (st.ok) D.inventory.useRemote(DL.InventoryService, st.data);
    else toast('warn', 'Inventário', st.message);
    // the account's character (already cleaned by the server); a brand-new account takes the local one
    const prof = await DL.Auth.profile();
    if (prof && prof.avatar && Object.keys(prof.avatar).length) {
      const patch = {};
      for (const k of LOOK_KEYS) if (prof.avatar[k] !== undefined) patch[k] = prof.avatar[k];
      D.crew.updatePlayer(patch);
    } else pushLook(D.crew.playerProfile);
    if (D.menu && D.menu.refresh) D.menu.refresh();
    DL.SaveService.startAutosave((window.DATALAB_CONFIG || {}).autosaveSeconds || 30);
  }

  function signedOut() {
    DL.SaveService.stopAutosave();
    setSlot(null);
    D.economy.setCloud(false);
    D.inventory.useRemote(null);
    // (auth-gate.js reloads the page: without a session there is no game)
  }

  DL.Cloud.on('auth', ({ user }) => {
    if (user && !S.on) { S.on = true; signedIn(user); }
    else if (!user && S.on) { S.on = false; signedOut(); }
  });
  DL.Cloud.on('expired', () => toast('warn', 'Sessão expirada', 'Entre de novo em Conta para continuar salvando na nuvem.'));
  DL.InventoryService.onState((data) => D.inventory.applyRemote(data));
  DL.Cloud.on('saved', (r) => {
    if (r.ok && r.data.gold_awarded) toast('ok', 'Recompensa', '+' + r.data.gold_awarded + ' Gold · datacenter concluído');
    if (!r.ok && r.code !== 'idle') toast('warn', 'Save na nuvem', r.message);
  });

  // Give the running game a cloud slot: the first one never played (the signup creates slot 1 empty,
  // with the company). Used when a game begins, and again by "Salvar" if that first try failed.
  // Resolves { ok, slot } | { ok: false, code, message } — the message says what really went wrong.
  async function ensureSlot() {
    if (DL.SaveService.slot) return { ok: true, slot: DL.SaveService.slot };
    if (!DL.Cloud.signedIn) return { ok: false, code: 'unauthorized', message: 'Sua sessão terminou: entre na sua conta para salvar.' };
    if (S.claiming) return S.claiming;
    S.claiming = (async () => {
      const list = await DL.SaveService.listCloud();
      if (list.error) return { ok: false, code: 'list', message: list.error };
      const used = new Set(list.filter((s) => s.version > 0).map((s) => s.slot));
      const slot = [1, 2, 3].find((n) => !used.has(n));
      if (!slot) return { ok: false, code: 'full', message: 'Os 3 espaços de save estão ocupados. Libere um em Conta → Saves (ou no Main Menu → Carregar).' };
      const preset = D.state.preset || 'zero';
      const name = S.name || (DL.PRESETS[preset] || {}).name || 'Meu datacenter';
      const r = await DL.SaveService.newGame(slot, name, preset);
      if (!r.ok) return r;
      setSlot(slot);
      return { ok: true, slot, fresh: true, name };
    })();
    try { return await S.claiming; } finally { S.claiming = null; }
  }

  // a new game with an account gets the first free cloud slot
  G.on('game-begin', async ({ preset }) => {
    if (S.loading) return; // a save is being loaded into this game
    if (DL.MP && DL.MP.role === 'guest') return; // someone else's room: the world is the host's, saved by the host
    setSlot(null);
    if (!DL.Cloud.signedIn) return;
    // the name typed on the start card (street.js keeps it to letters, numbers, space and hyphen)
    S.name = (DL.DcName && DL.DcName.typed) || (DL.PRESETS[preset] || {}).name || 'Meu datacenter';
    const r = await ensureSlot();
    if (!r.ok) { toast('warn', 'Save na nuvem', r.message); return; }
    const s = await DL.SaveService.save({ name: r.name });
    if (s.ok) toast('ok', 'Salvo na nuvem', 'Espaço ' + r.slot + ' · salvamento automático ligado');
  });

  // keep the account's avatar (debounced)
  function pushLook(p) {
    if (!DL.Cloud.signedIn || !p) return;
    clearTimeout(S.lookT);
    S.lookT = setTimeout(() => {
      const avatar = {};
      for (const k of LOOK_KEYS) if (p[k] !== undefined && p[k] !== null) avatar[k] = p[k];
      DL.Auth.updateProfile({ avatar });
    }, 1500);
  }
  G.on('player-look', pushLook);

  DL.CloudSync = {
    setSlot, ensureSlot,
    async load(slot) {
      // loading needs a running game: leave the menu / start card first
      if (D.state.phase !== 'play') {
        const title = document.getElementById('title');
        if (title && !title.hidden) { title.hidden = true; D.game.root.classList.remove('is-title'); D.scene.o.attract = false; }
        D.choosePreset('zero');
        S.loading = true;
        try { D.begin(false); } finally { S.loading = false; }
        D.setMode('explore');
      }
      const r = await DL.SaveService.load(slot);
      if (r.ok) { setSlot(slot); toast('ok', 'Jogo carregado', r.data.save.name + ' · espaço ' + slot + (r.refused && r.refused.length ? ' · ' + r.refused.length + ' item(ns) não couberam' : '')); }
      else toast('warn', 'Carregar', r.message);
      return r;
    },
    get active() { return S.on; },
  };

  // auth-gate.js starts the session check long before this file loads: on a slow connection (a deploy,
  // not localhost) the first 'auth' event can fire before the listener above exists — catch up here.
  DL.Cloud.init().then(() => { if (DL.Cloud.user && !S.on) { S.on = true; signedIn(DL.Cloud.user); } });
})();
