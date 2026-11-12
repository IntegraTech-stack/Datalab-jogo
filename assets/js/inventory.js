/* DataLab — the player's inventory and the shop (real, persistent systems).
   Inventory (localStorage datalab.inventory.v1): what the player owns (quantity, where it came from,
   when, event items marked and kept forever) and what is equipped per slot: infrastructure skins,
   accessories (head / face / neck / back / hands) and the pet. Skins are equipped on the player's own
   character (crew.updatePlayer → datalab.player.v1); the accessories follow into it (profile.gear).
   Emotes are free for everyone: never bought, always on (emotes.js).
   Shop: everything is paid in Gold (the golden premium coin, economy.js wallet) — never with the
   company's cash. Items can be sold back for half, gifts claimed during their event, legendary bots
   activated into the crew (and put back), special items used.
   UI: two overlays (#store, #inventory) that share the cards, previews and rarity looks; the main
   menu mounts the same shop (menu.js). */
(function () {
  'use strict';
  const DL = window.DL;
  const KEY = 'datalab.inventory.v1';
  const OLD_SHOP = 'datalab.shop.v1';
  const SLOTS_INFRA = ['rack', 'server', 'switch', 'storage', 'rackacc', 'led'];
  // slots kept in the inventory's equip map (one item each): infrastructure, accessories, the pet, the
  // terminal skin, the trail (trails.js), the aura and the profile frame / icon / title (season pass, battlepass.js)
  const SLOTS_MAP = SLOTS_INFRA.concat(DL.GEAR_SLOTS, 'terminal', 'trail', 'aura', 'frame', 'icon', 'title');
  const isMapSlot = (slot) => SLOTS_MAP.indexOf(slot) >= 0;
  const SRC = { loja: 'Loja', evento: 'Evento', presente: 'Presente', recompensa: 'Recompensa', reward: 'Recompensa', passe: 'Passe Boot Inicial · T1', migrado: 'Loja (versão anterior)' };
  // where an equipped item shows (the toast after equipping)
  const WHERE = { trail: 'atrás de você quando anda · visível na sala online', aura: 'em volta do seu personagem · visível na sala online', frame: 'no seu perfil (Conta e sala online)',
    icon: 'ao lado do seu nome no jogo e na sala online', title: 'embaixo do seu nome no jogo e na sala online' };
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const fmt = (n) => Math.round(n).toLocaleString('pt-BR');
  // the emotes as shop / inventory entries (free, always equipped, never stored)
  // (an emote with its own item, like the season pass' Invasão, is a catalog item instead)
  const EMO = {};
  for (const e of DL.EMOTES || []) if (!e.item) EMO['emote_' + e.id] = { id: 'emote_' + e.id, cat: 'emote', slot: 'emote', value: e.id, name: e.name + ' ' + e.emoji, rarity: 'common', price: 0, free: true, sell: false, desc: e.desc + ' Atalho no jogo: tecla ' + e.key + ' ou o botão Emotes.' };
  const EMOTE_LIST = Object.values(EMO);
  const item = (id) => DL.cosmetic(id) || EMO[id] || null;
  const RENAMED = DL.RENAMED_COSMETICS || {};
  // (a server that hasn't run the migration yet still answers with the old id)
  const current = (id) => (RENAMED[id] && item(RENAMED[id]) ? RENAMED[id] : id);
  const RAR = (it) => DL.RARITY[it.rarity] || DL.RARITY.common;

  DL.createInventory = function (game, sys) {
    const crew = sys.crew, economy = sys.economy;
    const $ = (id) => document.getElementById(id);

    /* ------------------------------------------------------------------ */
    /* Data                                                                */
    /* ------------------------------------------------------------------ */
    const D = { v: 1, items: {}, equip: {}, claimed: {}, ver: 0 };
    try { const s = JSON.parse(localStorage.getItem(KEY) || 'null'); if (s && typeof s === 'object') Object.assign(D, s); } catch (e) { /* fresh */ }
    D.items = D.items || {};
    D.equip = D.equip || {};
    D.claimed = D.claimed || {};
    // retired items (cosmetics.js): whatever was paid for them comes back in Gold, once (they leave the
    // inventory right here, so they can't be counted twice); gifts and rewards cost nothing
    const RETIRED = DL.RETIRED_COSMETICS || {}, PAID = { loja: 1, evento: 1, migrado: 1 };
    let refund = 0;
    for (const id of Object.keys(D.items)) {
      if (!Object.prototype.hasOwnProperty.call(RETIRED, id)) continue;
      if (PAID[D.items[id].src]) refund += RETIRED[id] * Math.max(0, D.items[id].n | 0);
      delete D.items[id];
    }
    // replaced items (cosmetics.js): the new one takes the old one's place, equipped too
    let renamed = false;
    for (const [old, now] of Object.entries(RENAMED)) {
      if (D.items[old] && item(now)) { if (!D.items[now]) D.items[now] = D.items[old]; delete D.items[old]; renamed = true; }
      for (const s of Object.keys(D.equip)) if (D.equip[s] === old) { D.equip[s] = now; renamed = true; }
    }
    // drop what the catalog no longer knows
    for (const id of Object.keys(D.items)) if (!item(id) || !(D.items[id].n > 0)) delete D.items[id];
    for (const s of Object.keys(D.equip)) if (!item(D.equip[s]) || !D.items[D.equip[s]]) delete D.equip[s];
    // remote: the server's inventory (services/inventory-service.js) — then nothing is kept in this
    // browser's storage and every action is decided by the server
    const S = { version: 1, boostUntil: -1, remote: null, legendary: [], pending: false };
    const save = () => { if (S.remote) return; try { localStorage.setItem(KEY, JSON.stringify({ v: 1, items: D.items, equip: D.equip, claimed: D.claimed })); } catch (e) { /* private mode */ } };
    if (renamed && !refund) save();
    if (refund > 0) {
      save();
      economy.earn('gold', refund, 'Devolução: itens retirados da loja', { quiet: true });
      setTimeout(() => game.toast('ok', 'Loja renovada', 'Itens antigos saíram da loja · +' + fmt(refund) + ' Gold devolvidos'), 1500);
    }
    function changed() {
      S.version++;
      DL.Skins.equipped = Object.assign({}, D.equip);
      DL.Skins.ver++;
      save();
      syncGear();
      game.emit('inventory', {});
    }

    const qty = (id) => (D.items[id] ? D.items[id].n : 0);
    const owns = (id) => qty(id) > 0;
    function add(id, n, src) {
      const it = item(id);
      if (!it) return false;
      const e = D.items[id] || (D.items[id] = { n: 0, at: Date.now(), src: src || 'loja' });
      e.n += n || 1;
      e.last = Date.now();
      if (it.event && !e.ev) e.ev = it.event;
      changed();
      return true;
    }
    function remove(id, n) {
      const e = D.items[id];
      if (!e) return;
      e.n -= n || 1;
      if (e.n <= 0) {
        delete D.items[id];
        const it = item(id);
        if (it && isMapSlot(it.slot) && D.equip[it.slot] === id) delete D.equip[it.slot];
        else if (it && it.cat === 'char' && isEquipped(it)) unequipChar(it, true);
      }
      changed();
    }

    // migrate the old menu shop (datalab.shop.v1) into the inventory, once
    try {
      const old = JSON.parse(localStorage.getItem(OLD_SHOP) || 'null');
      if (Array.isArray(old) && old.length && !D.claimed._shopV1) {
        const MAP = { boost_xp: 'xp_boost', boost_cool: 'xp_boost' };
        for (const o of old) if (MAP[o] && item(MAP[o]) && (item(MAP[o]).stack || !owns(MAP[o]))) add(MAP[o], 1, 'migrado');
      }
      D.claimed._shopV1 = true;
    } catch (e) { /* nothing to migrate */ }
    // the pre-alpha's collectible: everyone who opens this version was there
    if (!D.claimed.badge_beta) { D.claimed.badge_beta = true; add('badge_beta', 1, 'evento'); }
    DL.Skins.equipped = Object.assign({}, D.equip);

    /* ------------------------------------------------------------------ */
    /* Equipping                                                           */
    /* ------------------------------------------------------------------ */
    const profile = () => (crew && crew.playerProfile) || {};
    function isEquipped(it) {
      if (!it) return false;
      if (it.cat === 'emote') return true;
      if (isMapSlot(it.slot)) return D.equip[it.slot] === it.id;
      const p = profile();
      switch (it.slot) {
        case 'shirt': return p.outfit === it.value;
        case 'hat': return p.hat === it.value && (p.hatColor || null) === (it.color || null);
        case 'palette': return true;
      }
      return false;
    }
    const equippable = (it) => !!it && it.cat !== 'emote' && (isMapSlot(it.slot) || (it.cat === 'char' && it.slot !== 'palette'));
    // the equipped accessories go into the player's look (sprites.js draws them through cosmetics.js);
    // only reads crew + D, so it is safe while the inventory is still loading
    function syncGear() {
      if (!crew || !crew.playerProfile) return;
      const gear = {};
      for (const s of Object.keys(DL.GEAR_POS)) { const it = D.equip[s] && item(D.equip[s]); if (it) gear[s] = it.value; }
      const now = Object.keys(gear).length ? gear : null;
      if (JSON.stringify(crew.playerProfile.gear || null) !== JSON.stringify(now)) crew.updatePlayer({ gear: now });
    }
    // The look must only wear what the player has: a skin, hat or hairstyle from a retired item goes back
    // to the free default — and whoever was wearing a retired skin gets the first skin of the new
    // collection in its place (offline here; for accounts the server's migration gives it).
    const FIRST_SKIN = 'hx_hoodie';
    const opt = (list, v) => ((DL.CHAR_OPTS || {})[list] || []).some((o) => o[0] === v);
    const ownsLook = (slot, v, color) => Object.keys(D.items).some((id) => { const it = item(id); return !!it && it.slot === slot && it.value === v && (slot !== 'hat' || (it.color || null) === (color || null)); });
    function fixLook() {
      if (!crew || !crew.playerProfile) return;
      const p = crew.playerProfile, patch = {};
      if (p.outfit && p.outfit !== 'tee' && !opt('OUTFITS', p.outfit) && !ownsLook('shirt', p.outfit)) {
        if ((DL.RETIRED_OUTFITS || []).indexOf(p.outfit) >= 0 && !S.remote && item(FIRST_SKIN)) {
          if (!owns(FIRST_SKIN)) add(FIRST_SKIN, 1, 'presente');
          patch.outfit = item(FIRST_SKIN).value;
          setTimeout(() => game.toast('info', 'Skin trocada', 'Sua skin saiu da loja · você ganhou ' + item(FIRST_SKIN).name), 1800);
        } else patch.outfit = 'tee';
      }
      if (p.hairStyle && !opt('STYLES', p.hairStyle) && !ownsLook('hair', p.hairStyle)) patch.hairStyle = 'short';
      if (p.pantsStyle && !ownsLook('pants', p.pantsStyle)) patch.pantsStyle = '';
      if (p.hat && !opt('HATS', p.hat) && !ownsLook('hat', p.hat, p.hatColor)) { patch.hat = ''; patch.hatColor = null; }
      for (const k of ['shades', 'scarf', 'backpack', 'chain']) if (p[k]) patch[k] = false;
      if (Object.keys(patch).length) crew.updatePlayer(patch);
    }
    fixLook();
    syncGear();
    /* ---------- the server's inventory ---------- */
    const AVATAR_KEYS = ['outfit', 'pantsStyle', 'hairStyle', 'hat', 'hatColor'];
    function applyRemote(st) {
      if (!st || !Array.isArray(st.items)) return;
      D.items = {};
      for (const r of st.items) if (item(current(r.item_id)) && !D.items[current(r.item_id)]) D.items[current(r.item_id)] = { n: r.quantity, at: Date.parse(r.first_acquired_at) || Date.now(), last: Date.parse(r.updated_at) || Date.now(), src: r.source === 'shop' ? 'loja' : r.source === 'event' ? 'evento' : r.source, ev: r.event_id || undefined };
      D.equip = {};
      for (const [slot, id] of Object.entries(st.equipped || {})) if (isMapSlot(slot) && D.items[current(id)]) D.equip[slot] = current(id);
      S.legendary = st.legendary || [];
      if (st.wallet && economy.applyServer) economy.applyServer({ wallet: st.wallet });
      if (st.avatar && crew) {
        const p = profile(), patch = {};
        for (const k of AVATAR_KEYS) if (st.avatar[k] !== undefined && p[k] !== st.avatar[k]) patch[k] = st.avatar[k];
        if (Object.keys(patch).length) crew.updatePlayer(patch);
      }
      if (st.effect === 'xp' && inPlay()) S.boostUntil = Math.max(game.time(), S.boostUntil) + 120;
      // the season pass' XP bonus (battlepass.js counts the hour of play)
      if (st.effect === 'bpxp') game.emit('pass-boost', {});
      fixLook();
      changed();
    }
    // run an action on the server; the UI updates when the answer arrives
    function remoteDo(promise, okText) {
      S.pending = true;
      promise.then((r) => {
        S.pending = false;
        // an item the shop shows but the server's catalog lacks: the database is missing a migration
        if (!r.ok && r.code === 'item_not_found') {
          console.warn('DataLab: item da loja ausente no catálogo do servidor — aplique as migrations pendentes (supabase/migrations).');
          game.toast('warn', 'Loja', 'Este item ainda não foi liberado no servidor. Seu Gold não foi descontado.');
          changed();
          return;
        }
        if (!r.ok) { game.toast('warn', 'Servidor', r.message); changed(); return; }
        if (okText) game.toast('ok', okText[0], okText[1]);
      });
      return null;
    }

    function equip(id) {
      const it = item(id);
      if (!it || !owns(id)) return 'Você não tem este item';
      if (!equippable(it)) return 'Este item não é equipável';
      if (S.remote) return remoteDo(S.remote.equip(id), ['Equipado', it.name]);
      if (isMapSlot(it.slot)) {
        D.equip[it.slot] = id;
        changed();
        const where = it.slot === 'pet' ? 'agora te segue pelo datacenter' : WHERE[it.slot] ? WHERE[it.slot] : DL.GEAR_POS[it.slot] ? 'no seu personagem (' + DL.GEAR_POS[it.slot].toLowerCase() + ')'
          : it.slot === 'terminal' ? 'no console do jogo (abra um terminal para ver)'
          : 'em todos os ' + ({ rack: 'racks, servidores e storages', server: 'servidores', switch: 'switches', storage: 'storages', rackacc: 'racks', led: 'racks' })[it.slot] + ' do datacenter';
        game.toast('ok', 'Equipado', it.name + ' · ' + where);
        return null;
      }
      const patch = {};
      if (it.slot === 'shirt') patch.outfit = it.value;
      else if (it.slot === 'hat') { patch.hat = it.value; patch.hatColor = it.color || null; }
      if (crew) crew.updatePlayer(patch);
      changed();
      game.toast('ok', 'Equipado', it.name + ' · no seu personagem');
      return null;
    }
    function unequipChar(it, quiet) {
      const patch = {};
      if (it.slot === 'shirt') patch.outfit = 'tee';
      else if (it.slot === 'hat') { patch.hat = ''; patch.hatColor = null; }
      if (crew) crew.updatePlayer(patch);
      if (!quiet) game.toast('info', 'Desequipado', it.name);
    }
    function unequip(id) {
      const it = item(id);
      if (!it || !isEquipped(it)) return 'Não está equipado';
      if (it.cat === 'emote') return 'Emotes ficam sempre equipados';
      if (S.remote) { if (it.slot === 'palette') return 'Paletas ficam sempre ativas'; return remoteDo(S.remote.unequip(it.slot), ['Desequipado', it.name]); }
      if (isMapSlot(it.slot)) { delete D.equip[it.slot]; game.toast('info', 'Desequipado', it.name + (SLOTS_INFRA.indexOf(it.slot) >= 0 ? ' · visual padrão de volta' : '')); }
      else if (it.slot === 'palette') return 'Paletas ficam sempre ativas';
      else unequipChar(it);
      changed();
      return null;
    }

    // one rack / storage wearing its own skin (build mode inspector)
    DL.inspectorSkin = function (e) {
      if (e.kind !== 'rack' && e.kind !== 'storage') return '';
      const slot = e.kind === 'rack' ? 'rack' : 'storage';
      const mine = DL.COSMETICS.filter((it) => it.slot === slot && owns(it.id));
      if (!mine.length) return '<p class="insp__note">Skins: nenhuma no inventário · <b>Loja</b> (<kbd>O</kbd>)</p>';
      const cur = e.skin || '';
      const b = (v, l, rar) => '<button type="button" class="chip chip--xs' + (cur === v ? ' is-on' : '') + (rar ? ' rar-chip rar-chip--' + rar : '') + '" data-item-skin="' + v + '">' + esc(l) + '</button>';
      return '<div class="insp__style"><div class="insp__srow"><span class="eyebrow-sm">Skin deste ' + (slot === 'rack' ? 'rack' : 'storage') + '</span>' +
        b('', 'Equipada') + b('none', 'Padrão') + mine.map((it) => b(it.id, it.name, it.rarity)).join('') + '</div></div>';
    };
    DL.applyItemSkin = function (e, v) {
      if (v && v !== 'none' && !owns(v)) return;
      if (v) e.skin = v; else delete e.skin;
      game.sfx('place');
    };

    /* ------------------------------------------------------------------ */
    /* Shop: buy, sell, claim, use, legendary bots                         */
    /* ------------------------------------------------------------------ */
    const inPlay = () => !!(sys.playing && sys.playing());
    const wallet = () => economy.wallet;
    const forSale = (it) => !it.gift && !it.pass && it.price > 0 && (!it.event || DL.eventActive(it.event));
    const sellValue = (it) => (it.sell === false || it.gift || !it.price ? 0 : Math.floor(it.price / 2));
    const activeBots = (id) => (crew ? crew.members.filter((a) => a.crew.legend === id).length : 0);
    // cosmetic furniture (Cosméticos, slot 'furniture'): either in the map or kept in the inventory;
    // demo.js places it through the build mode and puts it away
    const isFurn = (it) => !!it && it.slot === 'furniture';
    const placed = (id) => !!(game.cosmPlaced && game.cosmPlaced(id));
    function place(id) {
      const it = item(id);
      if (!isFurn(it) || !owns(id)) return 'Você não tem este item';
      if (!inPlay()) return 'Comece um jogo para colocar no mapa';
      return game.placeCosmetic ? game.placeCosmetic(id) : 'Indisponível';
    }
    function putAway(id) {
      const it = item(id);
      if (!isFurn(it) || !placed(id)) return 'Não está no mapa';
      return game.storeCosmetic ? game.storeCosmetic(id) : 'Indisponível';
    }

    function canBuy(it) {
      if (!it) return 'Item desconhecido';
      if (it.event && !DL.eventActive(it.event)) return 'Evento encerrado';
      if (it.gift) return owns(it.id) || D.claimed[it.id] ? 'Já resgatado' : null;
      if (!forSale(it)) return 'Indisponível';
      if (!it.stack && owns(it.id)) return 'Já está no inventário';
      if (it.max && qty(it.id) >= it.max) return 'Máximo de ' + it.max;
      if (wallet().gold < it.price) return 'Faltam ' + fmt(it.price - wallet().gold) + ' Gold';
      return null;
    }
    function buy(id) {
      const it = item(id), why = canBuy(it);
      if (why) return why;
      if (S.remote) return remoteDo(it.gift ? S.remote.claim(id) : S.remote.buy(id), [it.gift ? 'Presente resgatado' : 'Compra concluída', it.name + ' · veja no Inventário (U)']);
      if (it.gift) {
        D.claimed[id] = true;
        add(id, 1, 'evento');
        game.toast('ok', 'Presente resgatado', it.name + ' · ' + DL.EVENTS[it.event].name + ' · já está no inventário');
        return null;
      }
      const paid = economy.spend('gold', it.price, 'Loja: ' + it.name);
      if (paid) return paid;
      add(id, 1, it.event ? 'evento' : 'loja');
      game.toast('ok', 'Compra concluída', it.name + ' · −' + fmt(it.price) + ' Gold · veja no Inventário (U)');
      return null;
    }
    function sell(id) {
      const it = item(id);
      if (!it || !owns(id)) return 'Você não tem este item';
      const v = sellValue(it);
      if (!v) return it.event ? 'Itens de evento não podem ser vendidos' : 'Este item não pode ser vendido';
      if (it.cat === 'legend' && activeBots(id) >= qty(id)) return 'Guarde o bot (dispensar) antes de vender';
      if (S.remote) return remoteDo(S.remote.sell(id), ['Item vendido', it.name + ' · +' + fmt(v) + ' Gold']);
      remove(id, 1);
      economy.earn('gold', v, 'Venda: ' + it.name, { quiet: true });
      game.toast('info', 'Item vendido', it.name + ' · +' + fmt(v) + ' Gold');
      return null;
    }
    // Treinamento Intensivo: the whole crew learns twice as fast for 2 game hours
    DL.xpBoost = () => (S.boostUntil > 0 && game.time() < S.boostUntil ? 2 : 1);
    function use(id) {
      const it = item(id);
      if (!it || !owns(id)) return 'Você não tem este item';
      if (it.slot !== 'use') return 'Este item não é consumível';
      if (!inPlay()) return 'Comece um jogo para usar';
      if (it.value === 'bpxp') {
        // the pass' XP bonus: the season must still be on (battlepass.js)
        const why = DL.Pass ? DL.Pass.canBoost() : 'Passe indisponível';
        if (why) return why;
        if (S.remote) return remoteDo(S.remote.consume(id), ['Bônus de XP do Passe', 'O XP do passe vale em dobro pela próxima 1 hora jogando']);
        remove(id, 1);
        game.emit('pass-boost', {});
        game.toast('ok', 'Bônus de XP do Passe', 'O XP do passe vale em dobro pela próxima 1 hora jogando');
        return null;
      }
      if (S.remote) return remoteDo(S.remote.consume(id), ['Treinamento Intensivo', 'A equipe ganha XP em dobro pelas próximas 2 h de jogo']);
      if (it.value === 'xp') {
        S.boostUntil = Math.max(game.time(), S.boostUntil) + 120;
        remove(id, 1);
        game.toast('ok', 'Treinamento Intensivo', 'A equipe ganha XP em dobro pelas próximas 2 h de jogo');
        if (crew && crew.members[0]) crew.chat.post(crew.members[0], 'Treinamento liberado! Bora aprender em dobro 📚', { tone: 'ok' });
      }
      return null;
    }
    function activate(id) {
      const it = item(id);
      if (!it || it.cat !== 'legend' || !owns(id)) return 'Você não tem este bot';
      if (!inPlay()) return 'Comece um jogo para ativar o bot';
      if (activeBots(id) >= qty(id)) return 'Todos os ' + it.name + ' já estão trabalhando';
      const n = activeBots(id);
      // with an account: one of the player's own bot records (the save tells the server it's working)
      let bot = null;
      if (S.remote) {
        const busy = new Set(crew.members.map((m) => m.crew.legendBot).filter(Boolean));
        bot = S.legendary.find((b) => b.item_id === id && !busy.has(b.id));
        if (!bot) return 'Nenhum ' + it.name + ' livre na sua conta';
      }
      const p = Object.assign({}, it.bot, { name: it.bot.name + (n ? ' ' + (n + 1) : '') });
      const a = crew.api.hire(p, { legend: id, free: true });
      if (!a) return 'Equipe cheia';
      if (bot) a.crew.legendBot = bot.id;
      changed();
      return null;
    }
    function store(id) {
      const a = crew && crew.members.slice().reverse().find((m) => m.crew.legend === id);
      if (!a) return 'Nenhum ' + (item(id) || {}).name + ' trabalhando';
      crew.api.fire(a);
      changed();
      return null;
    }
    game.on('legend-free', () => changed());

    /* ------------------------------------------------------------------ */
    /* Previews (pixel art drawn with the game's own sprites)              */
    /* ------------------------------------------------------------------ */
    const sheets = new Map();
    function sheetFor(p) {
      const L = DL.crewLook(p), k = JSON.stringify(L);
      let s = sheets.get(k);
      if (!s) { s = DL.makeSheet(L); sheets.set(k, s); if (sheets.size > 80) sheets.delete(sheets.keys().next().value); }
      return s;
    }
    function previewProfile(it) {
      if (it.cat === 'legend') return Object.assign({}, it.bot);
      const p = Object.assign({}, profile());
      // a costume worn now would hide the hat being previewed: show it on a plain tee
      if (it.slot === 'hat' && DL.charCostume && DL.charCostume(p)) p.outfit = 'tee';
      if (it.slot === 'shirt') p.outfit = it.value;
      else if (it.slot === 'hat') { p.hat = it.value; p.hatColor = it.color || null; }
      // accessories go over whatever skin the player wears now
      else if (DL.GEAR_POS[it.slot]) p.gear = Object.assign({}, p.gear, { [it.slot]: it.value });
      return p;
    }
    const emoteSheets = new Map();
    function emoteSheetFor(p) {
      const L = DL.crewLook(p), k = JSON.stringify(L);
      let s = emoteSheets.get(k);
      if (!s) { s = DL.makeEmoteSheet(L); emoteSheets.set(k, s); if (emoteSheets.size > 12) emoteSheets.delete(emoteSheets.keys().next().value); }
      return s;
    }
    const PREVIEW_UNITS = ['switch', 'patch', 'server', 'server', 'server', null, 'server', 'server', null];
    function drawArt(cv, it, t, big) {
      const k = big ? 4 : 2, W = 48, H = 48;
      if (cv.width !== W * k) { cv.width = W * k; cv.height = H * k; }
      const g = cv.getContext('2d');
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, cv.width, cv.height);
      g.imageSmoothingEnabled = false;
      g.setTransform(k, 0, 0, k, 0, 0);
      // the season pass' rewards have their own animated pixel art (pass-art.js): on the cards, and in the
      // big preview for what has no better one (the profile pieces, the aura, the bonus)
      if (it.pass && DL.hasPassArt && DL.hasPassArt(it.id) && (!big || /^(icon|aura|title|frame|use)$/.test(it.slot))) { DL.drawPassArt(g, it.id, t, { halo: !big }); return; }
      if (SLOTS_INFRA.indexOf(it.slot) >= 0) {
        const over = { rack: null, server: null, switch: null, rackacc: null, led: null, storage: null };
        over[it.slot] = it.id;
        if (it.slot === 'storage') DL.drawItem(g, { kind: 'storage', model: 'storage', px: 16, py: 28, tw: 1, th: 1, rot: 0, seed: 4, skinOver: over }, t);
        else DL.drawItem(g, { kind: 'rack', units: PREVIEW_UNITS, unitModel: [], unitState: [], px: 16, py: 28, tw: 1, th: 1, rot: 0, seed: 3, skinOver: over }, t);
        return;
      }
      if (it.slot === 'terminal') {
        // a small console window wearing the skin: its colours, its live effect and a few lines
        const L = DL.TERM_LOOK[it.value] || DL.TERM_LOOK.neon, x = 4, y = 8, w = 40, h = 32;
        DL.R(g, x - 1, y - 1, w + 2, h + 2, '#05080f');
        DL.R(g, x, y, w, h, L.bg);
        DL.R(g, x, y, w, 5, L.bar);
        DL.R(g, x + 2, y + 2, 1, 1, '#56657d'); DL.R(g, x + 4, y + 2, 1, 1, '#56657d'); DL.R(g, x + 6, y + 2, 1, 1, L.text);
        g.save();
        g.beginPath(); g.rect(x, y + 5, w, h - 5); g.clip();
        g.translate(x, y + 5);
        DL.termFx(g, it.value, w, h - 5, t);
        g.restore();
        [[2, 14, L.text], [4, 20, L.dim], [4, 11, L.dim], [2, 17, L.text]].forEach(([ind, len, c], i) => { DL.R(g, x + 2, y + 9 + i * 5, 1, 1, L.text); DL.R(g, x + 3 + ind, y + 9 + i * 5, len, 1, c); });
        if (Math.floor(t * 2) % 2) DL.R(g, x + 3, y + 29, 3, 1, L.text);
        return;
      }
      if (isFurn(it)) {
        // the piece itself, drawn by cosm-furniture.js, standing on the card
        const def = DL.CATALOG_DEF && DL.CATALOG_DEF[it.value];
        if (!def) return;
        const tw = def.w || 1, th = def.h || 1, wall = def.mount === 'wall';
        const e = Object.assign({ kind: def.kind || def.id, defId: def.id, tw, th, rot: 0, seed: 5, wall, rug: !!def.rug }, def.set || {});
        e.px = 24 - tw * 8;
        e.py = def.rug ? 24 - th * 8 : wall ? 34 : 44 - th * 16;
        DL.drawItem(g, e, t);
        return;
      }
      const C = DL.CHAR;
      // a pose (Relax do Criador): the player's own look sitting back, turning around in the big preview
      if (it.slot === 'pose') {
        const sh = sheetFor(previewProfile(it)), dirs = ['down', 'right', 'up', 'left'];
        const d = big ? dirs[Math.floor(t / 1.4) % 4] : 'down';
        if (sh[d].lounge) g.drawImage(sh[d].lounge, 24 - C.AX, 42 - C.AY);
        return;
      }
      // trails (trails.js) loop a short walk across the card; the frame shows around the player's face
      if (it.slot === 'trail') { if (DL.drawTrailPreview) DL.drawTrailPreview(g, it.value, t, sheetFor(profile())); return; }
      if (it.slot === 'frame') {
        if (DL.drawPassFrame) DL.drawPassFrame(g, 6, 6, 36, 36, t);
        g.drawImage(sheetFor(profile()).down.idle, 3, 1, 16, 16, 12, 11, 24, 24);
        return;
      }
      if (it.slot === 'title') {
        const R = DL.R;
        R(g, 3, 17, 42, 14, '#060d1c'); R(g, 3, 17, 42, 1, '#2de2c8'); R(g, 3, 30, 42, 1, '#14897a'); R(g, 3, 17, 1, 14, '#2de2c8'); R(g, 44, 17, 1, 14, '#14897a');
        DL.pixText(g, 'PIONEIRO', 8, 22, Math.floor(t * 2) % 2 ? '#b8f3ff' : '#a5f7ea');
        R(g, 22, 12, 4, 4, '#2de2c8'); R(g, 23, 13, 2, 2, '#b8f3ff');
        return;
      }
      if (it.slot === 'pet') {
        // twice the size: a pet is small next to a person; walking in the big preview, idle on the card
        const s = DL.petSheet(it.value).right;
        const img = big && Math.floor(t / 2.4) % 2 ? s.walk[Math.floor(t * 8) % 4] : s.idle[Math.floor(t * 3) % 2];
        g.drawImage(img, 24 - C.AX * 2, 46 - C.AY * 2, C.FW * 2, C.FH * 2);
        return;
      }
      if (it.cat === 'emote') {
        const em = DL.emote(it.value), sh = emoteSheetFor(profile());
        const f = DL.emoteFrame(sh, it.value, t % em.dur, em.dur) || sh.waveA;
        g.drawImage(f, 24 - C.AX, 42 - C.AY);
        if (DL.emoteFx) DL.emoteFx(g, it.value, 24, 42, t % em.dur, em.dur, f);
        // the emoji over the head, as in the game
        g.font = '9px sans-serif';
        g.textAlign = 'center';
        g.fillText(em.emoji, 24, 12);
        return;
      }
      if (it.cat === 'char' || it.cat === 'legend') {
        if (it.slot === 'palette') {
          it.value.forEach((c, i) => { g.fillStyle = c; g.beginPath(); g.arc(12 + (i % 2) * 22, 14 + Math.floor(i / 2) * 20, 8, 0, Math.PI * 2); g.fill(); });
          return;
        }
        const sh = sheetFor(previewProfile(it));
        const frames = ['down', 'right', 'up', 'left'];
        const dir = big ? frames[Math.floor(t / 1.4) % 4] : 'down';
        // skins that breathe while standing show it in the preview too
        const img = sh[dir].sway && DL.idleSway(t) ? sh[dir].sway : sh[dir].idle;
        if (it.cat === 'legend') DL.drawAura(g, 24, 42, t, 'back');
        g.drawImage(img, 24 - DL.CHAR.AX, 42 - DL.CHAR.AY);
        if (it.cat === 'legend') DL.drawAura(g, 24, 42, t, 'front');
        return;
      }
      // special items: a small emblem
      const R = DL.R;
      if (it.id === 'xp_boost') {
        R(g, 14, 12, 20, 26, '#2a2f38'); R(g, 14, 12, 20, 2, '#c4b5fd'); R(g, 17, 18, 14, 2, '#7ee0a1'); R(g, 17, 23, 10, 2, '#7ee0a1'); R(g, 17, 28, 12, 2, '#7ee0a1');
        R(g, 30, 30, 8, 8, '#c4b5fd'); R(g, 33, 31, 2, 6, '#0a0a0a'); R(g, 31, 33, 6, 2, '#0a0a0a');
      } else if (it.id === 'bp_xp2') {
        // the pass' XP bonus: a cartridge marked 2×
        R(g, 13, 10, 22, 28, '#0b1730'); R(g, 13, 10, 22, 2, '#2de2c8'); R(g, 16, 15, 16, 12, '#06121a');
        DL.pixText(g, '2', 19, 18, '#b8f3ff'); R(g, 24, 21, 1, 1, '#a5f7ea'); R(g, 26, 20, 1, 1, '#a5f7ea'); R(g, 25, 21, 1, 1, '#a5f7ea'); R(g, 26, 22, 1, 1, '#a5f7ea'); R(g, 24, 22, 1, 1, '#a5f7ea');
        for (let i = 0; i < 4; i++) R(g, 16 + i * 4, 31, 2, 5, '#f2c14e');
      } else if (it.id === 'badge_beta') {
        R(g, 23, 4, 2, 12, '#a0c3ec'); R(g, 14, 16, 20, 26, '#f1f1ee'); R(g, 14, 16, 20, 5, '#a0c3ec'); R(g, 19, 25, 10, 9, '#2a2f38'); R(g, 21, 27, 6, 5, '#f2c8a0'); R(g, 16, 37, 16, 2, '#7d8187');
      } else { R(g, 16, 16, 16, 16, RAR(it).color); }
    }

    /* ------------------------------------------------------------------ */
    /* UI                                                                  */
    /* ------------------------------------------------------------------ */
    const goldHtml = () => '<span class="mm-bal st-bal"><span class="cur cur--dc" aria-hidden="true">⬢</span><b>' + fmt(wallet().gold) + '</b><span class="eyebrow-sm">Gold</span></span>' +
      '<span class="mm-bal st-bal"><span class="cur cur--cr" aria-hidden="true">◆</span><b>' + fmt(wallet().credits) + '</b><span class="eyebrow-sm">créditos</span></span>';
    const rarTag = (it) => '<span class="rar rar--' + it.rarity + '">' + RAR(it).name + '</span>';
    function evTag(it) {
      if (!it.event) return '';
      const ev = DL.EVENTS[it.event], on = DL.eventActive(it.event);
      return '<span class="ev-tag' + (on ? '' : ' is-over') + '" title="' + esc(ev.name) + '">Evento' + (on ? ' · até ' + DL.eventEnds(it.event) : ' · limitado') + '</span>';
    }
    const groupName = (id) => (DL.COSMETIC_GROUPS.find((g) => g.id === id) || { name: 'Outros' }).name;
    const priceHtml = (it) => (it.gift || it.free ? '<span class="st-price is-free">Grátis</span>' : '<span class="st-price"><span class="cur cur--dc" aria-hidden="true">⬢</span>' + fmt(it.price) + '</span>');
    const broke = (it) => !it.free && !it.gift && !owns(it.id) && wallet().gold < it.price;

    function statusOf(it) {
      if (it.cat === 'legend') { const a = activeBots(it.id); return a ? a + ' trabalhando' : ''; }
      if (it.slot === 'palette') return 'Ativa';
      if (it.slot === 'use') return '';
      if (isFurn(it)) return placed(it.id) ? 'No mapa' : '';
      return isEquipped(it) ? 'Equipado' : '';
    }
    // the shop card's state: bought / equipped, or why it can't be bought yet
    function shopState(it) {
      if (it.free) return 'Equipado';
      if (!owns(it.id)) return broke(it) ? 'Sem moedas' : '';
      if (isFurn(it)) return placed(it.id) ? 'No mapa' : 'No inventário';
      if (it.stack) return 'Você tem ' + qty(it.id);
      return equippable(it) ? (isEquipped(it) ? 'Equipado' : 'Comprado') : 'No inventário';
    }
    function card(it, mode, sel) {
      const n = qty(it.id), st = mode === 'inv' ? statusOf(it) : shopState(it);
      return '<button type="button" class="st-card rar-' + it.rarity + (it.creator ? ' is-creator' : '') + (sel ? ' is-sel' : '') + (st === 'Equipado' || st === 'No mapa' || /trabalhando|Ativa/.test(st) ? ' is-eq' : '') + (mode === 'shop' && broke(it) ? ' is-broke' : '') + '" data-pick="' + it.id + '">' +
        '<span class="st-card__art"><canvas data-art="' + it.id + '" aria-hidden="true"></canvas>' + (mode === 'inv' && n > 1 ? '<span class="st-qty">×' + n + '</span>' : '') + (it.event ? '<span class="st-ev">EVENTO</span>' : '') + (it.pass ? '<span class="st-ev st-ev--t1">PASSE T1</span>' : '') + (it.creator ? '<span class="st-ev st-ev--creator" title="Feito pelo criador do DataLab">★ CRIADOR</span>' : '') + '</span>' +
        '<span class="st-card__body"><b>' + esc(it.name) + '</b>' + rarTag(it) + '</span>' +
        '<span class="st-card__foot">' + (mode === 'shop' ? priceHtml(it) : '<span class="eyebrow-sm">' + esc(groupName(DL.groupOf(it))) + '</span>') + (st ? '<span class="st-state">' + esc(st) + '</span>' : '') + '</span></button>';
    }

    function actionsHtml(it, mode, ask) {
      const b = (act, label, primary, dis, title, cls) => '<button type="button" class="btn btn--sm' + (primary ? ' btn--primary' : '') + (cls ? ' ' + cls : '') + '" data-do="' + act + '" data-id="' + it.id + '"' + (dis ? ' disabled' : '') + (title ? ' title="' + esc(title) + '"' : '') + '>' + label + '</button>';
      const emoteKey = () => { const e = DL.emote(it.value); return '<p class="st-why">Use no jogo: tecla <kbd>' + e.key + '</kbd> ou o botão <b>Emotes</b>.</p>'; };
      let h = '';
      if (it.cat === 'emote') return b('noop', it.pass ? 'Equipado' : 'Grátis – Equipado', true, true, '', 'btn--done') + emoteKey();
      if (mode === 'shop') {
        const why = canBuy(it);
        // Comprar → Equipar → Equipado (stackable items keep buying more)
        if (it.gift) h += b('buy', owns(it.id) ? 'Resgatado' : 'Resgatar grátis', true, !!why, why);
        // furniture: Comprar → Colocar no mapa → No mapa (and back to the inventory)
        else if (owns(it.id) && isFurn(it)) h += placed(it.id) ? b('noop', 'No mapa', true, true, '', 'btn--done') + b('putaway', 'Guardar no inventário') : b('place', 'Colocar no mapa', true, !inPlay(), inPlay() ? '' : 'Comece um jogo para colocar');
        else if (owns(it.id) && !it.stack && equippable(it)) h += isEquipped(it) ? b('noop', 'Equipado', true, true, '', 'btn--done') : b('equip', 'Equipar', true);
        else if (ask === it.id && !why) h += b('confirm', 'Confirmar · ' + fmt(it.price) + ' Gold', true) + b('cancel', 'Cancelar');
        else if (why && /Faltam/.test(why)) h += b('ask', 'Moedas insuficientes', false, true, why, 'btn--broke');
        else h += b('ask', why && owns(it.id) && !it.stack ? 'No inventário' : 'Comprar', true, !!why, why);
        if (why && !owns(it.id) && /Faltam/.test(why)) h += '<p class="st-why">' + esc(why) + ' · troque créditos ou adicione Gold na aba <b>Gold</b>.</p>';
        if (owns(it.id)) h += b('goinv', 'Ver no inventário');
        return h;
      }
      if (equippable(it)) h += isEquipped(it) ? b('unequip', 'Desequipar') : b('equip', 'Equipar', true);
      if (isFurn(it)) h += placed(it.id) ? b('place', 'Mover no mapa') + b('putaway', 'Guardar no inventário') : b('place', 'Colocar no mapa', true, !inPlay(), inPlay() ? '' : 'Comece um jogo para colocar');
      if (it.slot === 'use') h += b('use', 'Usar', true, !inPlay(), inPlay() ? '' : 'Comece um jogo para usar');
      if (it.cat === 'legend') {
        const a = activeBots(it.id);
        h += b('activate', 'Ativar no datacenter', true, !inPlay() || a >= qty(it.id), !inPlay() ? 'Comece um jogo' : a >= qty(it.id) ? 'Todos já estão trabalhando' : '');
        if (a) h += b('store', 'Guardar um');
      }
      const v = sellValue(it);
      if (ask === 'sell:' + it.id) h += b('sell', 'Confirmar venda · +' + fmt(v) + ' Gold', true) + b('cancel', 'Cancelar');
      else if (v) h += b('asksell', 'Vender · +' + fmt(v) + ' Gold');
      else h += '<span class="st-why">' + (it.pass ? 'Exclusivo do Passe T1: fica com você para sempre' : it.event ? 'Item de evento: fica guardado para sempre' : 'Não pode ser vendido') + '</span>';
      return h;
    }

    function detailHtml(it, mode, ask) {
      if (!it) return '<div class="st-empty"><b>Escolha um item</b><p>Veja a prévia, a raridade e o que dá para fazer com ele.</p></div>';
      const e = D.items[it.id], ev = it.event && DL.EVENTS[it.event];
      let h = '<div class="st-detail rar-' + it.rarity + '"><div class="st-detail__art"><canvas data-art="' + it.id + '" data-big="1" aria-label="Prévia de ' + esc(it.name) + '"></canvas></div>';
      h += '<div class="st-detail__tags">' + rarTag(it) + evTag(it) + (it.creator ? '<span class="ev-tag is-creator">★ Criador</span>' : it.theme && !it.event ? '<span class="ev-tag is-theme">' + esc(it.theme) + '</span>' : '') + '</div>';
      h += '<h3 class="st-detail__name">' + esc(it.name) + '</h3><p class="st-detail__desc">' + esc(it.desc) + '</p>';
      h += '<dl class="st-detail__meta"><dt>Categoria</dt><dd>' + esc(groupName(DL.groupOf(it))) + '</dd>';
      if (DL.GEAR_POS[it.slot]) h += '<dt>Posição</dt><dd>' + DL.GEAR_POS[it.slot] + ' · funciona com qualquer skin</dd>';
      if (it.slot === 'pet') h += '<dt>Pet</dt><dd>Segue você pelo datacenter · um por vez</dd>';
      if (it.slot === 'terminal') h += '<dt>Onde</dt><dd>No console de todos os servidores e switches · uma por vez</dd>';
      if (it.slot === 'rack' && it.cat === 'equip') h += '<dt>Onde</dt><dd>Todos os racks, servidores e storages do datacenter</dd>';
      if (isFurn(it)) h += '<dt>Onde</dt><dd>Modo construção (B) → Cosméticos · um de cada no mapa</dd>' + (owns(it.id) ? '<dt>Agora</dt><dd>' + (placed(it.id) ? 'No mapa' : 'Guardado no inventário') + '</dd>' : '');
      if (it.slot === 'trail') h += '<dt>Onde</dt><dd>Atrás de você enquanto anda · um por vez · os outros jogadores veem na sala online</dd>';
      if (/^(frame|title|icon|aura)$/.test(it.slot)) h += '<dt>Onde</dt><dd>' + WHERE[it.slot].replace(/^./, (c) => c.toUpperCase()) + '</dd>';
      if (it.pass) h += '<dt>Passe</dt><dd>Passe Boot Inicial · Temporada 1' + (DL.Pass && DL.Pass.levelOf(it.id) ? ' · nível ' + DL.Pass.levelOf(it.id) : '') + ' · nunca vendido na loja</dd>';
      if (it.cat !== 'legend' && it.slot !== 'use' && it.slot) h += '<dt>Efeito</dt><dd>Só aparência — não muda desempenho</dd>';
      if (it.cat === 'legend') h += '<dt>Função</dt><dd>' + esc((DL.ROLES[it.bot.role] || {}).title || '') + ' + quase todas as outras · aprende em dobro · salário normal do cargo</dd>';
      if (ev) h += '<dt>Evento</dt><dd>' + esc(ev.name) + (DL.eventActive(it.event) ? ' · até ' + DL.eventEnds(it.event) : ' · encerrado em ' + DL.eventEnds(it.event)) + '</dd>';
      if (e) h += '<dt>No inventário</dt><dd>' + e.n + (e.n > 1 ? ' unidades' : ' unidade') + ' · ' + esc(SRC[e.src] || e.src) + ' · ' + new Date(e.at).toLocaleDateString('pt-BR') + '</dd>';
      if (mode === 'shop' && !it.gift) h += '<dt>Preço</dt><dd>' + priceHtml(it) + (sellValue(it) ? ' · revenda ' + fmt(sellValue(it)) + ' Gold' : '') + '</dd>';
      h += '</dl><div class="st-detail__acts">' + actionsHtml(it, mode, ask) + '</div></div>';
      return h;
    }

    /* ---------- shared view state + art animation ---------- */
    const V = {
      shop: { tab: 'skins', sel: null, ask: null, root: null },
      inv: { cat: 'all', rar: '', only: '', sort: 'rarity', sel: null, ask: null, root: null },
    };
    const live = new Set(); // roots on screen
    let raf = 0, last = 0;
    function animate(now) {
      raf = 0;
      if (!live.size) return;
      if (now - last > 90) {
        last = now;
        const t = now / 1000;
        for (const root of live) {
          if (!root.isConnected || !root.offsetParent) { live.delete(root); continue; }
          root.querySelectorAll('canvas[data-art]').forEach((cv) => { const it = item(cv.dataset.art); if (it) drawArt(cv, it, t, !!cv.dataset.big); });
        }
      }
      raf = requestAnimationFrame(animate);
    }
    function hydrate(root) {
      live.add(root);
      const t = performance.now() / 1000;
      root.querySelectorAll('canvas[data-art]').forEach((cv) => { const it = item(cv.dataset.art); if (it) drawArt(cv, it, t, !!cv.dataset.big); });
      if (!raf) raf = requestAnimationFrame(animate);
    }

    /* ---------- the shop ---------- */
    // Skins | Acessórios | Pets | Emotes | Equipamentos | Cosméticos | Rastros, then the bots, the special
    // items, an event (only while it has items on sale) and the Gold tab. The season pass' items are never
    // here (price 0: forSale leaves them out).
    const SHOP_TABS = [
      ['skins', 'Skins'], ['acc', 'Acessórios'], ['pets', 'Pets'], ['emotes', 'Emotes'], ['equip', 'Equipamentos'], ['decor', 'Cosméticos'], ['trails', 'Rastros'],
      ['legend', 'Bots lendários'], ['special', 'Especiais'], ['event', 'Evento'], ['gold', 'Gold'],
    ];
    // Equipamentos has two sections, each sorted on its own
    const EQUIP_SECTIONS = [['Skins de hacks', 'terminal', 'O visual do console onde você digita os comandos. Só aparência.'], ['Skins de PCs e servidores', 'rack', 'Muda todos os racks, servidores e storages do datacenter.']];
    // most expensive first
    const shopOrder = (a, b) => b.price - a.price || a.name.localeCompare(b.name);
    function shopList(tab) {
      const all = DL.COSMETICS.filter((it) => forSale(it) || (it.gift && it.event && DL.eventActive(it.event)));
      let list;
      if (tab === 'event') list = all.filter((it) => it.event);
      else if (tab === 'skins') list = all.filter((it) => it.cat === 'char' && !it.event && it.slot === 'shirt');
      else if (tab === 'acc') list = all.filter((it) => it.cat === 'char' && !it.event && (DL.GEAR_POS[it.slot] || it.slot === 'hat'));
      else if (tab === 'pets') list = all.filter((it) => !it.event && it.slot === 'pet');
      else if (tab === 'emotes') return EMOTE_LIST.slice();
      else if (tab === 'equip') return [].concat(...EQUIP_SECTIONS.map(([, slot]) => all.filter((it) => it.cat === 'equip' && !it.event && it.slot === slot).sort(shopOrder)));
      else if (tab === 'decor') list = all.filter((it) => !it.event && it.slot === 'furniture');
      else if (tab === 'trails') list = all.filter((it) => !it.event && it.slot === 'trail');
      else if (tab === 'legend') list = all.filter((it) => it.cat === 'legend' && !it.event);
      else if (tab === 'special') list = all.filter((it) => it.cat === 'special' && !it.event);
      else list = [];
      return list.sort(shopOrder);
    }
    // the shop grid: Equipamentos shows its two sections with a title each
    function shopGrid(tab, list, sel) {
      if (tab !== 'equip') return list.map((it) => card(it, 'shop', it.id === sel)).join('');
      return EQUIP_SECTIONS.map(([title, slot, note]) => {
        const part = list.filter((it) => it.slot === slot);
        return part.length ? '<div class="st-sec"><b>' + title + '</b><span>' + note + '</span></div>' + part.map((it) => card(it, 'shop', it.id === sel)).join('') : '';
      }).join('');
    }
    function goldTabHtml() {
      const E = DL.ECON, W = wallet();
      let h = '<div class="st-gold"><section class="st-gold__card"><span class="eyebrow-sm">Câmbio · créditos → Gold</span><p class="st-gold__big"><span class="cur cur--cr"></span>' + E.gold.rate + ' créditos = <span class="cur cur--dc"></span>1 Gold</p>' +
        '<p class="st-why">Créditos você ganha jogando: tarefas, servidores configurados, incidentes resolvidos, datacenters concluídos.</p><div class="st-gold__row">' +
        [50, 100, 500, 1000].map((n) => '<button type="button" class="btn btn--sm" data-do="xchg" data-n="' + n + '"' + (W.credits < n ? ' disabled' : '') + '>' + fmt(n) + ' ◆ → ' + fmt(n / E.gold.rate) + ' Gold</button>').join('') + '</div></section>';
      const real = S.remote && DL.PaymentService;
      h += '<section class="st-gold__card"><span class="eyebrow-sm">Comprar Gold · Pix</span><div class="st-gold__row">' + E.store.map((p) =>
        '<button type="button" class="st-pack" data-do="pack" data-sku="' + p.sku + '"><span class="cur cur--dc"></span><b>' + fmt(p.coins) + '</b>' + (p.tag ? '<em>' + p.tag + '</em>' : '') + '<small>' + p.price + '</small></button>').join('') +
        '</div><p class="st-why">' + (real ? 'O Pix abre numa nova aba, pela AbacatePay. O Gold entra na sua conta assim que o pagamento é confirmado.' : 'Entre na sua conta para comprar Gold: o pagamento é feito por Pix, pela AbacatePay.') + '</p></section>';
      h += '<section class="st-gold__card"><span class="eyebrow-sm">Como ganhar Gold jogando</span><ul class="st-gold__list"><li>+' + E.gold.datacenter + ' Gold a cada datacenter concluído</li><li>+100 Gold a cada 20 datacenters (marco)</li><li>Venda itens que não usa: metade do preço volta</li></ul></section></div>';
      return h;
    }
    function shopHtml(opts) {
      const s = V.shop;
      let h = '';
      if (!opts || !opts.bare) h += '<header class="app__bar st-bar"><span class="eyebrow-sm app__title">Loja · moeda dourada</span><span class="st-bals" data-bals>' + goldHtml() + '</span><button type="button" class="btn btn--sm" data-do="goinv">Inventário <kbd>U</kbd></button><button class="cc__x" type="button" data-do="close" aria-label="Fechar loja">×</button></header>';
      else h += '<div class="st-bals st-bals--menu" data-bals>' + goldHtml() + '</div>';
      const ev = Object.values(DL.EVENTS).find((x) => DL.eventActive(x.id)), evOn = !!ev && shopList('event').length > 0;
      if (!evOn && s.tab === 'event') s.tab = 'skins';
      if (evOn) h += '<div class="st-banner" style="--c:' + ev.color + '"><span class="ev-tag">Evento</span><b>' + esc(ev.name) + '</b><span>' + esc(ev.desc) + ' · até ' + DL.eventEnds(ev.id) + '</span><button type="button" class="btn btn--sm" data-tab="event">Ver itens</button></div>';
      h += '<nav class="mv-tabs st-tabs" role="tablist">' + SHOP_TABS.filter(([k]) => k !== 'event' || evOn).map(([k, l]) => '<button type="button" role="tab" class="mv-tab' + (s.tab === k ? ' is-on' : '') + '" data-tab="' + k + '">' + l + '</button>').join('') + '</nav>';
      if (s.tab === 'gold') return h + '<div class="st-main st-main--full">' + goldTabHtml() + '</div>';
      const list = shopList(s.tab);
      if (s.sel && !list.some((it) => it.id === s.sel)) s.sel = null;
      if (!s.sel && list[0]) s.sel = list[0].id;
      h += '<div class="st-main"><div class="st-grid">' + (shopGrid(s.tab, list, s.sel) || '<p class="st-why">Nada à venda nesta categoria agora.</p>') + '</div>' +
        '<aside class="st-side" data-side>' + detailHtml(item(s.sel), 'shop', s.ask) + '</aside></div>';
      return h;
    }

    /* ---------- the inventory ---------- */
    function invList() {
      const s = V.inv;
      let list = Object.keys(D.items).map(item).filter(Boolean).concat(EMOTE_LIST);
      if (s.cat === 'event') list = list.filter((it) => it.event);
      else if (s.cat === 'unequipped') list = list.filter((it) => equippable(it) && !isEquipped(it));
      else if (s.cat !== 'all') list = list.filter((it) => DL.groupOf(it) === s.cat);
      if (s.rar) list = list.filter((it) => it.rarity === s.rar);
      const by = {
        rarity: (a, b) => DL.RARITY[b.rarity].rank - DL.RARITY[a.rarity].rank || a.name.localeCompare(b.name),
        recent: (a, b) => { const t = (it) => (D.items[it.id] ? D.items[it.id].last || D.items[it.id].at : 0); return t(b) - t(a); },
        name: (a, b) => a.name.localeCompare(b.name),
        cat: (a, b) => DL.COSMETIC_GROUPS.findIndex((g) => g.id === DL.groupOf(a)) - DL.COSMETIC_GROUPS.findIndex((g) => g.id === DL.groupOf(b)) || a.name.localeCompare(b.name),
      };
      return list.sort(by[s.sort] || by.rarity);
    }
    function invHtml(opts) {
      const s = V.inv, owned = Object.keys(D.items).map(item).filter(Boolean);
      const total = owned.reduce((n, it) => n + qty(it.id), 0);
      const count = (f) => owned.concat(EMOTE_LIST).filter(f).reduce((n, it) => n + (it.free ? 1 : qty(it.id)), 0);
      let h = opts && opts.bare ? '<div class="st-bals st-bals--menu" data-bals>' + goldHtml() + '</div>'
        : '<header class="app__bar st-bar"><span class="eyebrow-sm app__title">Inventário · ' + total + ' ' + (total === 1 ? 'item' : 'itens') + '</span><span class="st-bals" data-bals>' + goldHtml() + '</span><button type="button" class="btn btn--sm" data-do="goshop">Loja <kbd>O</kbd></button><button class="cc__x" type="button" data-do="close" aria-label="Fechar inventário">×</button></header>';
      const cats = [['all', 'Tudo', total + EMOTE_LIST.length], ['unequipped', 'Não equipados', count((it) => equippable(it) && !isEquipped(it))], ['event', 'Eventos', count((it) => !!it.event)]]
        .concat(DL.COSMETIC_GROUPS.map((g) => [g.id, g.name, count(g.test)]));
      h += '<div class="inv"><nav class="inv__cats" aria-label="Categorias">' + cats.map(([id, l, n], i) =>
        (i === 3 ? '<span class="inv__sep eyebrow-sm">Categorias</span>' : '') + '<button type="button" class="inv__cat' + (s.cat === id ? ' is-on' : '') + (n ? '' : ' is-empty') + '" data-cat="' + id + '"><span>' + l + '</span><b>' + n + '</b></button>').join('') + '</nav>';
      h += '<section class="inv__list"><div class="inv__tools"><div class="chips">' + [['', 'Todas']].concat(DL.RARITY_ORDER.map((r) => [r, DL.RARITY[r].name])).map(([r, l]) =>
        '<button type="button" class="chip chip--xs' + (s.rar === r ? ' is-on' : '') + (r ? ' rar-chip rar-chip--' + r : '') + '" data-rar="' + r + '">' + l + '</button>').join('') + '</div>' +
        '<label class="inv__sort"><span class="eyebrow-sm">Organizar</span><select class="input input--sm" data-sort>' + [['rarity', 'Raridade'], ['recent', 'Mais recentes'], ['name', 'Nome'], ['cat', 'Categoria']].map(([v, l]) => '<option value="' + v + '"' + (s.sort === v ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></label></div>';
      const list = invList();
      if (s.sel && !owns(s.sel) && !EMO[s.sel]) s.sel = null;
      if (!s.sel && list[0]) s.sel = list[0].id;
      h += '<div class="st-main"><div class="st-grid">' + (list.map((it) => card(it, 'inv', it.id === s.sel)).join('') ||
        '<div class="st-empty"><b>Nada aqui ainda</b><p>Compre skins, acessórios, pets e bots lendários na loja ou ganhe itens em eventos.</p><button type="button" class="btn btn--sm btn--primary" data-do="goshop">Abrir a loja</button></div>') + '</div>' +
        '<aside class="st-side" data-side>' + detailHtml(s.sel ? item(s.sel) : null, 'inv', s.ask) + '</aside></div></section></div>';
      return h;
    }

    /* ---------- mounting, events ---------- */
    function render(root, mode, opts) {
      const keep = root.querySelector('.st-grid') ? root.querySelector('.st-grid').scrollTop : 0;
      root.innerHTML = mode === 'shop' ? shopHtml(opts) : invHtml(opts);
      const grid = root.querySelector('.st-grid');
      if (grid) grid.scrollTop = keep;
      hydrate(root);
    }
    function bind(root, mode, opts) {
      if (root._stBound) return;
      root._stBound = true;
      const st = V[mode];
      const rerender = () => render(root, mode, opts);
      const fail = (why) => { if (why) game.toast('warn', mode === 'shop' ? 'Loja' : 'Inventário', why); };
      root.addEventListener('click', (ev) => {
        const pick = ev.target.closest('[data-pick]');
        if (pick) {
          st.sel = pick.dataset.pick;
          st.ask = null;
          rerender();
          // narrow screens show the detail under the grid: bring it into view
          const side = innerWidth <= 860 && root.querySelector('[data-side]');
          if (side) side.scrollIntoView({ block: 'start', behavior: 'smooth' });
          return;
        }
        const tab = ev.target.closest('[data-tab]');
        if (tab) { st.tab = tab.dataset.tab; st.ask = null; st.sel = null; rerender(); return; }
        const cat = ev.target.closest('[data-cat]');
        if (cat) { st.cat = cat.dataset.cat; st.sel = null; st.ask = null; rerender(); return; }
        const rar = ev.target.closest('[data-rar]');
        if (rar) { st.rar = rar.dataset.rar; st.sel = null; rerender(); return; }
        const b = ev.target.closest('[data-do]');
        if (!b || b.disabled) return;
        const id = b.dataset.id;
        switch (b.dataset.do) {
          case 'close': close(); return;
          case 'goinv': if (opts && opts.go) { if (id) V.inv.sel = id; opts.go('inventory'); } else { close(); openInventory(id); } return;
          case 'goshop': if (opts && opts.go) opts.go('shop'); else { close(); openShop(); } return;
          case 'ask': st.ask = id; break;
          case 'cancel': st.ask = null; break;
          case 'confirm': case 'buy': st.ask = null; fail(buy(id)); break;
          case 'equip': fail(equip(id)); break;
          case 'unequip': fail(unequip(id)); break;
          case 'use': fail(use(id)); break;
          case 'activate': { const why = activate(id); fail(why); if (!why && opts && opts.onActivate) opts.onActivate(); break; }
          case 'place': { const why = place(id); if (why) { fail(why); break; } return; }
          case 'putaway': fail(putAway(id)); break;
          case 'store': fail(store(id)); break;
          case 'asksell': st.ask = 'sell:' + id; break;
          case 'sell': st.ask = null; fail(sell(id)); break;
          case 'xchg':
            if (S.remote && DL.EconomyService) { DL.EconomyService.exchange(+b.dataset.n).then((r) => { if (!r.ok) fail(r.message); rerender(); }); return; }
            fail(economy.exchange(+b.dataset.n));
            break;
          case 'pack': {
            // Gold is only bought with an account: Pix through AbacatePay, credited by the server
            if (S.remote && DL.PaymentService) DL.PaymentService.buy(b.dataset.sku, game.toast);
            else game.toast('info', 'Comprar Gold', 'Entre na sua conta para comprar Gold por Pix.');
            return;
          }
        }
        rerender();
      });
      root.addEventListener('change', (ev) => {
        if (ev.target.matches('[data-sort]')) { st.sort = ev.target.value; rerender(); }
      });
      game.on('inventory', () => { if (root.isConnected && root.offsetParent) rerender(); });
      game.on('wallet', () => { const n = root.querySelector('[data-bals]'); if (n && root.offsetParent) n.innerHTML = goldHtml(); });
    }

    const el = { shop: $('store'), shopRoot: $('storeRoot'), inv: $('inventory'), invRoot: $('inventoryRoot') };
    if (el.shopRoot) bind(el.shopRoot, 'shop');
    if (el.invRoot) bind(el.invRoot, 'inv');
    function openShop(tab) {
      if (!el.shop) return;
      if (tab) { V.shop.tab = tab; V.shop.sel = null; }
      V.shop.ask = null;
      el.inv.classList.remove('is-open');
      render(el.shopRoot, 'shop');
      el.shop.classList.add('is-open');
      game.keysReset && game.keysReset();
    }
    function openInventory(sel) {
      if (!el.inv) return;
      if (sel && owns(sel)) V.inv.sel = sel;
      V.inv.ask = null;
      el.shop.classList.remove('is-open');
      render(el.invRoot, 'inv');
      el.inv.classList.add('is-open');
      game.keysReset && game.keysReset();
    }
    function close() {
      if (el.shop) el.shop.classList.remove('is-open');
      if (el.inv) el.inv.classList.remove('is-open');
      if (document.activeElement && (el.shop.contains(document.activeElement) || el.inv.contains(document.activeElement))) document.activeElement.blur();
    }
    for (const o of [el.shop, el.inv]) if (o) o.addEventListener('pointerdown', (ev) => { if (ev.target === o) close(); });

    const api = {
      get version() { return S.version; },
      owns, qty, add, remove, equip, unequip, isEquipped, buy, sell, use, activate, store, canBuy, sellValue, activeBots,
      list: () => Object.keys(D.items).map((id) => Object.assign({ id, item: item(id) }, D.items[id])),
      get equipped() { return Object.assign({}, D.equip); },
      // events: future events grant their items through here (kept after the event ends)
      grant(id, src) { return add(id, 1, src || 'recompensa'); },
      openShop, openInventory, close,
      // switch to the server's inventory (remote = DL.InventoryService) or back to this browser's
      useRemote(remote, state) {
        S.remote = remote || null;
        if (remote) { if (state) applyRemote(state); }
        else {
          // back to the local inventory saved in this browser
          let s = null;
          try { s = JSON.parse(localStorage.getItem(KEY) || 'null'); } catch (e) { s = null; }
          D.items = (s && s.items) || {};
          D.equip = (s && s.equip) || {};
          D.claimed = (s && s.claimed) || {};
          S.legendary = [];
          changed();
        }
      },
      applyRemote,
      get remote() { return !!S.remote; },
      get legendary() { return S.legendary.slice(); },
      get isOpen() { return !!((el.shop && el.shop.classList.contains('is-open')) || (el.inv && el.inv.classList.contains('is-open'))); },
      key(ev) { if (ev.code === 'Escape') { close(); return true; } return false; },
      // the main menu mounts the same shop
      mountShop(root, opts) { bind(root, 'shop', Object.assign({ bare: true }, opts)); render(root, 'shop', Object.assign({ bare: true }, opts)); },
      mountInventory(root, opts) { bind(root, 'inv', Object.assign({ bare: true }, opts)); render(root, 'inv', Object.assign({ bare: true }, opts)); },
      drawArt,
    };
    DL.Inventory = api;
    return api;
  };
})();
