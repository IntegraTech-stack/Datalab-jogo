/* DataLab — team chat: the crew's internal channel. Messages land in a panel (bottom left) and,
   briefly, in a speech bubble over whoever said it. Replies can be scheduled in game time. */
(function () {
  'use strict';
  const DL = window.DL;
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const MAX = 60;

  DL.createTeamChat = function (game) {
    const $ = (id) => document.getElementById(id);
    const el = { box: $('teamChat'), head: $('chatHead'), list: $('chatList'), badge: $('chatBadge'), last: $('chatLast') };
    const H = { msgs: [], open: true, unread: 0, queue: [], seq: 0, ambient: 0 };

    function render(m) {
      // follow new messages only when the reader is already at the bottom (reading old ones isn't interrupted)
      const L = el.list, stick = L.scrollHeight - L.scrollTop - L.clientHeight < 40;
      const li = document.createElement('li');
      li.className = 'tc__msg is-' + (m.tone || 'chat');
      li.innerHTML = '<div class="tc__meta"><span class="cc__dot" style="background:' + m.color + '"></span><b style="color:' + m.color + '">' + esc(m.who) + '</b>' +
        (m.role ? '<span class="tc__role">' + esc(m.role) + '</span>' : '') + '<span class="tc__time">' + m.t + '</span></div><p>' + esc(m.text) + '</p>';
      el.list.appendChild(li);
      while (el.list.children.length > MAX) {
        const h = el.list.firstChild.offsetHeight;
        el.list.firstChild.remove();
        if (!stick) el.list.scrollTop = Math.max(0, el.list.scrollTop - h); // keep the reader's place
      }
      if (stick) el.list.scrollTop = el.list.scrollHeight;
    }

    function setOpen(on) {
      H.open = on;
      el.box.classList.toggle('is-open', on);
      el.head.setAttribute('aria-expanded', on ? 'true' : 'false');
      if (on) { H.unread = 0; el.list.scrollTop = el.list.scrollHeight; }
      badge();
    }

    function badge() {
      el.badge.textContent = H.unread;
      el.badge.hidden = !H.unread || H.open;
    }

    // who: a crew actor, or { name, color, role } for the system / the player
    function post(who, text, opts) {
      opts = opts || {};
      if (!text) return null;
      const c = who && who.crew;
      const m = {
        id: ++H.seq, text, tone: opts.tone || 'chat', t: game.clock(),
        who: c ? c.name : who.name, color: c ? DL.ROLES[c.profile.role].color : who.color || '#dadbdf', role: c ? DL.ROLES[c.profile.role].name : who.role || '',
      };
      H.msgs.push(m);
      if (H.msgs.length > MAX) H.msgs.shift();
      render(m);
      if (!H.open) H.unread++;
      el.last.textContent = m.who + ': ' + text;
      badge();
      // the bubble only when the speaker is in the room the player is in (street.js); the message stays in the chat
      const here = !DL.Street || !DL.Street.naSala || DL.Street.naSala(who);
      if (c && !opts.noBubble && here) who.bubble = { text: text.length > 64 ? text.slice(0, 61) + '…' : text, left: Math.min(6, 2.4 + text.length * 0.045), tone: m.tone };
      return m;
    }

    // say something after `delay` seconds of game time (skipped if the speaker is gone)
    function later(delay, fn) { H.queue.push({ at: delay, fn }); }

    function update(dt) {
      for (const q of H.queue) q.at -= dt;
      const due = H.queue.filter((q) => q.at <= 0);
      if (due.length) H.queue = H.queue.filter((q) => q.at > 0);
      for (const q of due) q.fn();
      if (H.ambient > 0) H.ambient -= dt;
    }

    // ambient talk is rate-limited so the channel never floods
    function ambientReady() { return H.ambient <= 0; }
    function ambientUsed(s) { H.ambient = s; }

    // the player writes in the channel too; staff.js picks who answers ('team-say')
    const form = $('chatForm'), input = $('chatIn');
    if (form) {
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        const text = input.value.trim().slice(0, 160);
        if (!text) return;
        input.value = '';
        const me = game.playerInfo ? game.playerInfo() : { name: 'Você', color: '#ffffff' };
        post({ name: me.name, color: me.color, role: 'Você' }, text, { tone: 'me' });
        game.emit('team-say', text);
      });
      input.addEventListener('keydown', (ev) => {
        if (ev.code === 'Escape') { ev.preventDefault(); input.blur(); }
        ev.stopPropagation();
      });
    }

    el.head.addEventListener('click', () => { setOpen(!H.open); el.head.blur(); });
    el.box.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    setOpen(innerWidth >= 860);

    return {
      post, later, update, ambientReady, ambientUsed,
      toggle: () => setOpen(!H.open),
      // open the channel and put the cursor in the message field
      focusInput() { setOpen(true); if (input) setTimeout(() => input.focus({ preventScroll: true }), 30); },
      get isOpen() { return H.open; },
      get messages() { return H.msgs; },
    };
  };
})();
