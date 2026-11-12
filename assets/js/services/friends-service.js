/* DataLab — Friends service: the player's friends and friend requests (Edge Function "friends").
   Keeps the lists, looks for new requests now and then, and tells the screens (account.js, lobby.js) when
   anything changes. Without the function published (or with no connection) ready stays false and the game
   simply doesn't offer friends. */
(function () {
  'use strict';
  const DL = window.DL;
  const CHECK_EVERY = 180000; // new requests, while the game is on screen
  const empty = () => ({ friends: [], incoming: [], outgoing: [] });
  const listeners = [];
  let userId = null, seen = new Set(), failed = false;

  const F = {
    lists: empty(),
    ready: false,
    on(fn) { listeners.push(fn); },
    // the other player's place in my lists: { kind: friend|incoming|outgoing, id } or null
    relationOf(username) {
      const name = String(username || '').toLowerCase(), has = (list) => list.find((x) => x.username.toLowerCase() === name);
      for (const [kind, list] of [['friend', F.lists.friends], ['incoming', F.lists.incoming], ['outgoing', F.lists.outgoing]]) {
        const x = has(list);
        if (x) return { kind, id: x.id };
      }
      return null;
    },
    async refresh() {
      if (!DL.Cloud.signedIn) return { ok: false, code: 'unauthorized' };
      const r = await DL.Cloud.call('friends', { action: 'list' });
      failed = !r.ok;
      if (r.ok) apply(r.data);
      return r;
    },
    request: (username) => change({ action: 'request', username }),
    respond: (id, accept) => change({ action: 'respond', id, accept }),
    remove: (id) => change({ action: 'remove', id }),
  };

  function apply(lists) {
    const first = !F.ready;
    F.lists = { friends: lists.friends || [], incoming: lists.incoming || [], outgoing: lists.outgoing || [] };
    F.ready = true;
    // the requests this session hasn't told the player about
    const fresh = F.lists.incoming.filter((x) => !seen.has(x.id));
    seen = new Set(F.lists.incoming.map((x) => x.id));
    for (const fn of listeners) fn({ first, fresh });
  }
  async function change(body) {
    const r = await DL.Cloud.call('friends', body);
    if (r.ok) { failed = false; apply(r.data.lists); }
    return r;
  }

  function onAuth() {
    const id = DL.Cloud.user ? DL.Cloud.user.id : null;
    if (id === userId) return;
    userId = id;
    F.lists = empty();
    F.ready = false;
    seen = new Set();
    if (id) F.refresh();
    else for (const fn of listeners) fn({ first: false, fresh: [] });
  }
  DL.Cloud.on('auth', onAuth);
  // a failure stops the checks (the tab tries again when opened): nothing to gain from asking a missing function
  setInterval(() => { if (DL.Cloud.signedIn && !document.hidden && !failed) F.refresh(); }, CHECK_EVERY);
  setTimeout(onAuth, 0);

  DL.Friends = F;
})();
