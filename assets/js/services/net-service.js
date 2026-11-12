/* DataLab — Net service: how the players of a room reach each other. Nothing to install: the host's
   browser IS the room. Everyone connects straight to it (WebRTC data channels — on the same network the
   traffic never leaves it; over the internet it goes peer to peer through STUN). Supabase Realtime, which
   the game already uses, carries the handshake: a guest knocks on the room's code, the host answers
   with an offer, the guest with an answer. After that Supabase is out of the loop — unless the two
   computers can't reach each other (routers / carriers that block direct connections): then the game
   itself goes through the room's Realtime channel (the relay), slower but it works from anywhere.
   multiplayer.js sees one interface whatever is underneath: hostRoom / joinRoom → { on, send, close }.
   Messages are JSON with a type in "t". The host's side keeps the room: ids, who is in, the password,
   relaying characters and chat between guests, kicking, and telling everyone when it closes. */
(function () {
  'use strict';
  const DL = window.DL;
  const PROTO = 1;
  const MAX_GUESTS = 8;
  // STUN only finds the way through most home routers; a TURN server (DATALAB_CONFIG.iceServers) gets
  // through the rest without the relay
  const ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }]
    .concat(Array.isArray((window.DATALAB_CONFIG || {}).iceServers) ? window.DATALAB_CONFIG.iceServers : []);
  const KNOCK_EVERY = 2000; // a knock can get lost: knock again until the host answers
  const FIND_MS = 15000;    // nobody answered the knocks in this long: there is no room with that code
  const DIRECT_MS = 8000;   // the host answered but the direct connection isn't up yet: use the relay
  const RELAY_MS = 15000;   // the relay didn't get the host's welcome in this long
  const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I
  const CHUNK = 16000; // data channel messages stay small; a world is sent in pieces
  const RELAY_EVERY = 100;      // the relay sends what piled up in this many ms as one Realtime message
  const RELAY_BATCH = 120000;   // …and keeps each one well under Realtime's payload limit
  const rid = () => Array.from(crypto.getRandomValues(new Uint8Array(5)), (b) => b.toString(16).padStart(2, '0')).join('');
  const newCode = () => Array.from(crypto.getRandomValues(new Uint8Array(6)), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');

  // "k7p-2qx", "K7P2QX" or an invitation link → "K7P2QX" (null when it isn't a room code)
  function parseCode(text) {
    let s = String(text || '').trim();
    const m = /[#?&]sala=([^&#\s]+)/i.exec(s);
    if (m) s = decodeURIComponent(m[1]);
    s = s.toUpperCase().replace(/[\s-]/g, '');
    return new RegExp('^[' + CODE_CHARS + ']{6}$').test(s) ? s : null;
  }
  const showCode = (c) => c.slice(0, 3) + '-' + c.slice(3);
  const inviteLink = (c) => location.origin + location.pathname + '#sala=' + c;

  /* ------------------------------------------------------------------ */
  /* handshake through Supabase Realtime (one channel per room code)     */
  /* ------------------------------------------------------------------ */
  function signal(code, onMsg) {
    const client = DL.Cloud && DL.Cloud.client;
    if (!client || !client.channel) return null;
    const ch = client.channel('datalab-sala-' + code, { config: { broadcast: { self: false } } });
    ch.on('broadcast', { event: 'sig' }, (ev) => { try { onMsg(ev.payload || {}); } catch (e) { console.error('net: handshake', e); } });
    const ready = new Promise((res) => {
      ch.subscribe((st) => { if (st === 'SUBSCRIBED') res(true); else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') res(false); });
      setTimeout(() => res(false), 10000);
    });
    const send = (p) => { try { const r = ch.send({ type: 'broadcast', event: 'sig', payload: p }); if (r && r.catch) r.catch(() => {}); } catch (e) { /* gone */ } };
    return { ready, send, close: () => { try { client.removeChannel(ch); } catch (e) { /* gone */ } } };
  }

  // the offer / answer go out once the ICE candidates are in (one message each way, no trickle)
  function gathered(pc, ms) {
    return new Promise((res) => {
      if (pc.iceGatheringState === 'complete') return res();
      const t = setTimeout(res, ms);
      pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
    });
  }

  /* ------------------------------------------------------------------ */
  /* framing: big messages (a whole world) go in pieces                  */
  /* ------------------------------------------------------------------ */
  let pieceSeq = 0;
  function pieces(text) {
    if (text.length <= CHUNK) return [text];
    const id = (++pieceSeq).toString(36), n = Math.ceil(text.length / CHUNK), out = [];
    for (let i = 0; i < n; i++) out.push('\u0001' + id + ',' + i + ',' + n + ',' + text.slice(i * CHUNK, (i + 1) * CHUNK));
    return out;
  }
  function sendText(dc, text) {
    if (!dc || dc.readyState !== 'open') return false;
    try { pieces(text).forEach((p) => dc.send(p)); return true; } catch (e) { return false; }
  }
  function reader(onMessage) {
    const parts = new Map();
    const parse = (text) => { let m; try { m = JSON.parse(text); } catch (e) { return; } if (m && typeof m.t === 'string') onMessage(m); };
    return (data) => {
      if (typeof data !== 'string') return;
      if (data.charCodeAt(0) !== 1) return parse(data);
      const a = data.indexOf(','), b = data.indexOf(',', a + 1), c = data.indexOf(',', b + 1);
      const id = data.slice(1, a), i = +data.slice(a + 1, b), n = +data.slice(b + 1, c);
      let p = parts.get(id);
      if (!p) { p = { got: 0, list: new Array(n) }; parts.set(id, p); }
      if (p.list[i] === undefined) { p.list[i] = data.slice(c + 1); p.got++; }
      if (p.got === n) { parts.delete(id); parse(p.list.join('')); }
    };
  }

  // the relay: messages to one peer through the room's Realtime channel, batched every RELAY_EVERY ms
  // (head says who it's for: { to } from the host, { from } from a guest)
  function relayLink(sig, head) {
    let q = [], size = 0, t = 0, closed = false;
    const flush = () => {
      clearTimeout(t); t = 0;
      while (q.length) {
        const d = [];
        let n = 0;
        while (q.length && (!d.length || n + q[0].length < RELAY_BATCH)) { n += q[0].length; d.push(q.shift()); }
        sig.send(Object.assign({ type: 'relay', d }, head));
      }
      size = 0;
    };
    return {
      send(text) {
        if (closed) return false;
        pieces(text).forEach((p) => { q.push(p); size += p.length; });
        if (!t) t = setTimeout(flush, RELAY_EVERY);
        return true;
      },
      get backlog() { return size; },
      close() { if (!closed) { flush(); closed = true; } },
    };
  }

  // the object multiplayer.js talks to (same shape for host and guest)
  function makeConn() {
    const handlers = {};
    const N = { open: false, closed: false, closedBy: null, rtt: 0, backlog: 0, relay: false };
    const emit = (t, m) => (handlers[t] || []).forEach((fn) => { try { fn(m); } catch (e) { console.error('net', t, e); } });
    const conn = {
      on(t, fn) { (handlers[t] = handlers[t] || []).push(fn); return conn; },
      send: () => false,
      close() {},
      get open() { return N.open; },
      get rtt() { return N.rtt; },
      // bytes still waiting to leave (the live stream skips a beat instead of piling up)
      get backlog() { return N.backlog; },
      // true when this guest plays through the relay (no direct connection to the host)
      get relayed() { return N.relay; },
    };
    // closing is reported once, after the current message is handled
    const finish = (code, reason) => {
      if (N.closed) return;
      N.closed = true;
      const opened = N.open;
      N.open = false;
      setTimeout(() => emit('close', { code, reason: reason || '', clean: N.closedBy === 'me', opened }), 0);
    };
    return { conn, emit, N, finish };
  }

  /* ------------------------------------------------------------------ */
  /* the host: this browser keeps the room                               */
  /* ------------------------------------------------------------------ */
  function hostRoom(opts, hello) {
    const { conn, emit, N, finish } = makeConn();
    const code = newCode(), hostId = 'h' + rid();
    const room = { name: String(opts.name || 'Sala').slice(0, 40), code, locked: !!opts.pass };
    const pass = String(opts.pass || '');
    let hostLook = hello.look || null;
    // id → { id, name, look, ok, seen, tx(text), read(data) } plus pc/dc (direct) or relay
    const guests = new Map();
    const local = (m) => emit(m.t, m);
    const text = (m) => JSON.stringify(m);
    const players = () => [{ id: hostId, name: hello.name, role: 'host', look: hostLook }]
      .concat(Array.from(guests.values()).filter((g) => g.ok).map((g) => ({ id: g.id, name: g.name, role: 'guest', look: g.look })));
    const toGuests = (m, except) => { const s = text(m); for (const g of guests.values()) if (g.ok && g !== except) g.tx(s); };
    const roster = () => { const m = { t: 'roster', players: players() }; local(m); toGuests(m); };

    function addGuest(id) {
      const g = { id, ok: false, seen: Date.now(), tx: () => false };
      g.read = reader((m) => fromGuest(g, m));
      guests.set(id, g);
      // a guest that never finishes connecting doesn't hold a place
      g.timer = setTimeout(() => { if (!g.ok) drop(g, 'não conectou'); }, 25000);
      return g;
    }
    function closePc(g) {
      if (!g.pc) return;
      const pc = g.pc;
      if (g.dc) { g.dc.onclose = null; g.dc.onmessage = null; }
      pc.onconnectionstatechange = null;
      g.pc = g.dc = null;
      setTimeout(() => { try { pc.close(); } catch (e) { /* closed */ } }, 300);
    }
    function drop(g, why) {
      if (guests.get(g.id) !== g) return;
      guests.delete(g.id);
      clearTimeout(g.timer);
      closePc(g);
      if (g.relay) g.relay.close();
      if (!g.ok) return;
      const m = { t: 'leave', id: g.id, name: g.name, why };
      local(m);
      toGuests(m);
      roster();
    }
    function refuse(g, code, reason) { g.tx(text({ t: 'bye', code, reason })); setTimeout(() => drop(g, reason), 200); }

    function fromGuest(g, m) {
      g.seen = Date.now();
      if (!g.ok) {
        if (m.t !== 'hello') return refuse(g, 4002, 'diga olá primeiro');
        if (m.v !== PROTO) return refuse(g, 4000, 'versão diferente do jogo — atualize a página');
        if (pass && m.pass !== pass) return refuse(g, 4001, 'senha incorreta');
        if (Array.from(guests.values()).filter((x) => x.ok).length >= MAX_GUESTS) return refuse(g, 4008, 'sala cheia (' + MAX_GUESTS + ' convidados)');
        g.ok = true;
        clearTimeout(g.timer);
        g.name = String(m.name || 'Jogador').slice(0, 24);
        g.look = m.look && typeof m.look === 'object' ? m.look : null;
        g.tx(text({ t: 'welcome', id: g.id, role: 'guest', room, players: players(), hostId }));
        const j = { t: 'join', id: g.id, name: g.name };
        local(j);
        toGuests(j, g);
        roster();
        return;
      }
      if (m.t === 'ping') { g.tx(text({ t: 'pong', at: m.at })); return; }
      // a relayed guest has no channel that closes: it says goodbye
      if (m.t === 'bye') { drop(g, 'saiu'); return; }
      const out = Object.assign({}, m, { from: g.id });
      // voice chat (voice.js): the handshake of a call between two guests goes to the one it's for
      if (m.t === 'vsig') {
        if (!m.to || m.to === hostId) { local(out); return; }
        const to = guests.get(m.to);
        if (to && to.ok) to.tx(text(out));
        return;
      }
      // characters, looks, emotes, chat and who is talking go to everyone; the rest (changes to the world, requests) to the host
      if (m.t === 'pos' || m.t === 'say' || m.t === 'look' || m.t === 'emote' || m.t === 'vtalk') {
        if (m.t === 'look' && m.look) g.look = m.look;
        local(out);
        toGuests(out, g);
      } else local(out);
    }

    async function knock(from) {
      if (guests.has(from)) return;
      if (guests.size >= MAX_GUESTS + 2) { sig.send({ type: 'nope', to: from, code: 4008, reason: 'sala cheia' }); return; }
      const g = addGuest(from);
      const pc = g.pc = new RTCPeerConnection({ iceServers: ICE });
      const dc = g.dc = pc.createDataChannel('datalab', { ordered: true });
      g.tx = (s) => sendText(dc, s);
      dc.onmessage = (ev) => g.read(ev.data);
      dc.onclose = () => drop(g, 'saiu');
      pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' && !g.relay) drop(g, 'conexão perdida'); };
      await pc.setLocalDescription(await pc.createOffer());
      await gathered(pc, 3000);
      if (g.pc === pc) sig.send({ type: 'offer', to: from, sdp: pc.localDescription.toJSON() });
    }

    // the guest couldn't connect directly: from now on it talks through the relay
    function relayed(from, d) {
      if (!Array.isArray(d)) return;
      let g = guests.get(from);
      if (!g || !g.relay) {
        if (!g) {
          if (guests.size >= MAX_GUESTS + 2) { sig.send({ type: 'nope', to: from, code: 4008, reason: 'sala cheia' }); return; }
          g = addGuest(from);
        }
        closePc(g);
        g.relay = relayLink(sig, { to: from });
        g.tx = g.relay.send;
      }
      d.forEach((x) => g.read(x));
    }

    const sig = signal(code, (p) => {
      if (p.type === 'knock' && typeof p.from === 'string') knock(p.from);
      else if (p.type === 'relay' && typeof p.from === 'string') relayed(p.from, p.d);
      else if (p.type === 'answer') {
        const g = guests.get(p.from);
        if (g && g.pc && !g.answered) { g.answered = true; g.pc.setRemoteDescription(p.sdp).catch(() => { if (!g.relay) drop(g, 'falha na conexão'); }); }
      }
    });
    if (!sig) { finish(4006, 'entre na sua conta para criar uma sala'); return conn; }
    sig.ready.then((ok) => {
      if (N.closed) return;
      if (!ok) { sig.close(); finish(4006, 'o servidor de salas não respondeu — confira a internet'); return; }
      N.open = true;
      local({ t: 'welcome', id: hostId, role: 'host', room, players: players(), hostId });
      local({ t: 'roster', players: players() });
    });
    // guests that stop answering (Wi-Fi gone, laptop asleep) leave after ~15 s
    const watch = setInterval(() => {
      const now = Date.now();
      N.backlog = 0;
      for (const g of guests.values()) {
        if (g.ok && now - g.seen > 15000) drop(g, 'sem resposta');
        else if (g.relay) N.backlog = Math.max(N.backlog, g.relay.backlog);
        else if (g.dc && g.dc.readyState === 'open') N.backlog = Math.max(N.backlog, g.dc.bufferedAmount);
      }
    }, 1000);

    conn.send = (m) => {
      if (!N.open) return false;
      if (typeof m === 'string') m = JSON.parse(m);
      if (m.t === 'ping') return true;
      if (m.t === 'kick') { const g = guests.get(m.id); if (g) refuse(g, 4010, 'removido(a) pelo anfitrião'); return true; }
      if (m.t === 'look') hostLook = m.look;
      const out = Object.assign({}, m, { from: hostId });
      delete out.to;
      if (m.to) { const g = guests.get(m.to); if (g && g.ok) g.tx(text(out)); }
      else toGuests(out);
      return true;
    };
    conn.close = () => {
      N.closedBy = 'me';
      clearInterval(watch);
      for (const g of Array.from(guests.values())) {
        g.tx(text({ t: 'bye', code: 4005, reason: 'o anfitrião encerrou a sala' }));
        if (g.relay) g.relay.close();
        const pc = g.pc;
        if (pc) setTimeout(() => { try { pc.close(); } catch (e) { /* closed */ } }, 300);
      }
      guests.clear();
      // the relayed goodbyes are still on their way
      setTimeout(() => sig.close(), 500);
      finish(1000, '');
    };
    return conn;
  }

  /* ------------------------------------------------------------------ */
  /* a guest: knock on the code, then talk straight to the host          */
  /* (or through the relay when the direct connection doesn't come up)  */
  /* ------------------------------------------------------------------ */
  function joinRoom(code, hello) {
    const { conn, emit, N, finish } = makeConn();
    const me = 'g' + rid();
    let pc = null, relay = null, tx = null, bye = null, seen = Date.now(), ping = 0, watch = 0, knocking = 0, knockT = 0, offered = false;
    const end = (c, reason) => {
      if (N.closed) return;
      clearTimeout(knockT); clearInterval(knocking); clearInterval(ping); clearInterval(watch);
      if (relay) {
        if (N.open && !bye) tx(JSON.stringify({ t: 'bye' }));
        relay.close();
      }
      if (sig) { if (relay) setTimeout(() => sig.close(), 500); else sig.close(); }
      if (pc) { const p = pc; setTimeout(() => { try { p.close(); } catch (e) { /* closed */ } }, 100); }
      finish(bye ? bye.code : c, bye ? bye.reason : reason);
    };
    const read = reader((m) => {
      seen = Date.now();
      if (m.t === 'bye') { bye = m; if (relay) setTimeout(() => end(1000, ''), 0); return; }
      if (m.t === 'pong') { N.rtt = Math.round(performance.now() - m.at); return; }
      emit(m.t, m);
    });
    // a way to the host is up (direct or relay): say hello, keep the line alive
    function up(send) {
      tx = send;
      seen = Date.now();
      tx(JSON.stringify(Object.assign({ t: 'hello', v: PROTO }, hello)));
      ping = setInterval(() => { tx(JSON.stringify({ t: 'ping', at: performance.now() })); N.backlog = relay ? relay.backlog : pc && dc() ? dc().bufferedAmount : 0; }, 3000);
      // the host went silent (closed the tab, lost the network): give up after ~15 s
      watch = setInterval(() => { if (Date.now() - seen > 15000) end(1006, ''); }, 1000);
    }
    let channel = null;
    const dc = () => channel;
    function useRelay() {
      if (relay || N.closed || N.open) return;
      if (pc) { pc.ondatachannel = null; pc.onconnectionstatechange = null; if (channel) { channel.onopen = channel.onclose = channel.onmessage = null; } const p = pc; setTimeout(() => { try { p.close(); } catch (e) { /* closed */ } }, 100); pc = null; channel = null; }
      relay = relayLink(sig, { from: me });
      N.relay = true;
      clearTimeout(knockT);
      knockT = setTimeout(() => { if (!N.open) end(1006, 'o anfitrião não respondeu pelo servidor — peça para ele atualizar a página e abrir a sala de novo'); }, RELAY_MS);
      up(relay.send);
    }
    const sig = signal(code, async (p) => {
      if (p.to !== me) return;
      if (p.type === 'nope') { end(p.code, p.reason); return; }
      if (p.type === 'relay') {
        if (!relay || !Array.isArray(p.d)) return;
        if (!N.open) { N.open = true; clearTimeout(knockT); }
        p.d.forEach(read);
        return;
      }
      if (p.type !== 'offer' || offered) return;
      offered = true;
      // the room exists: stop knocking; if the direct connection doesn't come up soon, use the relay
      clearInterval(knocking);
      clearTimeout(knockT);
      knockT = setTimeout(useRelay, DIRECT_MS);
      pc = new RTCPeerConnection({ iceServers: ICE });
      pc.ondatachannel = (ev) => {
        channel = ev.channel;
        channel.onopen = () => {
          if (relay) return;
          N.open = true;
          clearTimeout(knockT);
          sig.close(); // the handshake is over: Supabase is out of the loop
          up((s) => sendText(channel, s));
        };
        channel.onmessage = (ev2) => read(ev2.data);
        channel.onclose = () => end(1006, '');
      };
      pc.onconnectionstatechange = () => {
        if (!pc || pc.connectionState !== 'failed') return;
        if (N.open) end(1006, ''); else useRelay();
      };
      try {
        await pc.setRemoteDescription(p.sdp);
        await pc.setLocalDescription(await pc.createAnswer());
        await gathered(pc, 3000);
        if (pc && !relay) sig.send({ type: 'answer', from: me, sdp: pc.localDescription.toJSON() });
      } catch (e) { useRelay(); }
    });
    if (!sig) { end(4006, 'entre na sua conta para jogar online'); return conn; }
    sig.ready.then((ok) => {
      if (N.closed) return;
      if (!ok) { end(4006, 'o servidor de salas não respondeu — confira a internet'); return; }
      const knock = () => sig.send({ type: 'knock', from: me });
      knock();
      knocking = setInterval(knock, KNOCK_EVERY);
      knockT = setTimeout(() => { if (!offered) end(4004, 'nenhuma sala aberta com esse código — confira o código e se o anfitrião ainda está com a sala aberta'); }, FIND_MS);
    });

    conn.send = (m) => N.open && !!tx && tx(typeof m === 'string' ? m : JSON.stringify(m));
    conn.close = () => { N.closedBy = 'me'; end(1000, ''); };
    return conn;
  }

  DL.Net = { PROTO, MAX_GUESTS, ICE, parseCode, showCode, inviteLink, hostRoom, joinRoom };
})();
