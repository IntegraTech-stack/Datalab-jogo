/* DataLab — operations: every unit in a rack becomes a device (server, switch or patch panel) with a name,
   an IP and a state (new → cabled → online). Cables are links between device ports; a server is on the
   network only when its eth0 reaches a switch access port, directly or through a patch panel.
   Faults change device state; they clear as soon as the cause is fixed. Monitoring (monitor.js) watches
   health(), and the crew announces what it finds. The tasks panel lists everything the player can act on. */
(function () {
  'use strict';
  // which folded parts of the Tarefas panel are open (career.js, problems.js and this file redraw them)
  window.DL = window.DL || {};
  if (!window.DL.keepOpen) {
    const open = new Set();
    window.DL.keepOpen = {
      set(k, on) { if (on) open.add(k); else open.delete(k); },
      apply(root) { root.querySelectorAll('details[data-det]').forEach((d) => { if (open.has(d.dataset.det)) d.open = true; }); },
    };
  }
  const DL = window.DL;
  const rand = Math.random;
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  const SW_PORTS = 24, PATCH_PORTS = 12;
  const PORTS = {
    server: ['eth0'],
    switch: Array.from({ length: SW_PORTS }, (_, i) => 'gi0/' + (i + 1)).concat('te1'),
    patch: Array.from({ length: PATCH_PORTS }, (_, i) => 'f' + (i + 1)).concat(Array.from({ length: PATCH_PORTS }, (_, i) => 'r' + (i + 1))),
  };
  DL.PORTS = PORTS;
  // each switch model has its own number of access ports (hardware.js); the uplink is always te1
  const swPortCache = {};
  const switchPorts = (n) => swPortCache[n] || (swPortCache[n] = Array.from({ length: n }, (_, i) => 'gi0/' + (i + 1)).concat('te1'));
  const portsOf = (d) => (d.kind === 'switch' ? d.ports || PORTS.switch : PORTS[d.kind] || []);
  DL.portsOf = portsOf;
  const flip = (p) => (p[0] === 'f' ? 'r' : 'f') + p.slice(1);

  // Faults: what breaks, how it reads in an alert, and how we know it is fixed.
  const FAULTS = {
    link: { kinds: ['server'], short: 'Interface desligada', msg: (d) => 'Servidor ' + d.name + ' apresenta falha de conexão', apply: (d) => (d.os.ifaces.eth0.up = false), fixed: (d) => d.os.ifaces.eth0.up },
    cable: { kinds: ['server'], short: 'Cabo desconectado', msg: (d) => 'Servidor ' + d.name + ' apresenta falha de conexão', apply: null, fixed: (d, ops) => ops.trace(d).ok },
    service: { kinds: ['server'], short: 'Serviço parado', msg: (d) => 'Serviço web (nginx) parou no ' + d.name, apply: (d) => (d.os.services.nginx = 'failed'), fixed: (d) => d.os.services.nginx === 'active' },
    disk: { kinds: ['server'], short: 'Disco cheio', msg: (d) => 'Disco do ' + d.name + ' está 96% cheio', apply: (d) => (d.os.disk = 96), fixed: (d) => d.os.disk < 80 },
    port: { kinds: ['switch'], short: 'Porta em erro', msg: (d) => 'Porta ' + String(d.sw.bad).replace('gi', 'Gi') + ' do ' + d.name + ' em erro (err-disabled)', apply: null, fixed: (d) => !d.sw.bad || d.sw.fixed },
  };
  // Faults that only career problems set up (problems.js: setup.fault): the random incidents never pick them.
  // apply(d, opts, api) · loss: how economy.js counts the lost revenue
  const GW = '10.0.1.1';
  const linux = (d) => !!d.os && !(DL.isWin && DL.isWin(d));
  const e0 = (d) => d.os.ifaces.eth0;
  const hasIp = (d, ip) => e0(d).ips.indexOf(ip + '/24') >= 0;
  Object.assign(FAULTS, {
    wrongip: { problem: true, loss: 'offline', kinds: ['server'], when: linux, short: 'IP errado', msg: (d) => 'Servidor ' + d.name + ' não responde no IP ' + d.ip,
      // opts.ip: a given address (another server's); otherwise a free one in the same network
      apply: (d, o, api) => { const bad = (o && o.ip) || api.freeIp(); e0(d).ips = [bad + '/24']; d.os.badIp = bad; },
      fixed: (d) => hasIp(d, d.ip) && !hasIp(d, d.os.badIp), fix: (d) => { e0(d).ips = [d.ip + '/24']; } },
    // the default route is gone (a reboot without it saved): the gateway answers, the internet doesn't
    noroute: { problem: true, kinds: ['server'], when: linux, short: 'Sem rota padrão', msg: (d) => 'Servidor ' + d.name + ' sem acesso à internet',
      apply: (d) => { d.os.route = null; }, fixed: (d) => d.os.route === GW, fix: (d) => { d.os.route = GW; } },
    badroute: { problem: true, kinds: ['server'], when: linux, short: 'Rota errada', msg: (d) => 'Servidor ' + d.name + ' sem acesso à internet',
      apply: (d) => { d.os.route = '10.0.1.254'; }, fixed: (d) => d.os.route === GW, fix: (d) => { d.os.route = GW; } },
    sshstop: { problem: true, kinds: ['server'], when: linux, short: 'SSH parado', msg: (d) => 'Acesso remoto (SSH) do ' + d.name + ' não responde',
      apply: (d) => { d.os.services.ssh = 'inactive'; }, fixed: (d) => d.os.services.ssh === 'active', fix: (d) => { d.os.services.ssh = 'active'; } },
    // someone stopped nginx by hand: inactive, not failed (auth.log says who)
    nginxstop: { problem: true, loss: 'service', kinds: ['server'], when: linux, short: 'Site parado', msg: (d) => 'Site hospedado no ' + d.name + ' fora do ar',
      apply: (d, o) => { d.os.services.nginx = 'inactive'; if (DL.authStop) DL.authStop(d, (o && o.user) || ['carlos', 'deploy', 'marina', 'rafael'][Math.floor(rand() * 4)], 'nginx'); },
      fixed: (d) => d.os.services.nginx === 'active', fix: (d) => { d.os.services.nginx = 'active'; } },
    linksvc: { problem: true, loss: 'offline', kinds: ['server'], when: linux, short: 'Interface e serviço', msg: (d) => 'Servidor ' + d.name + ' apresenta falha de conexão',
      apply: (d) => { e0(d).up = false; d.os.services.nginx = 'failed'; }, fixed: (d) => e0(d).up && d.os.services.nginx === 'active', fix: (d) => { e0(d).up = true; d.os.services.nginx = 'active'; } },
    disksvc: { problem: true, loss: 'disk', kinds: ['server'], when: linux, short: 'Disco cheio derrubou o site', msg: (d) => 'Site do ' + d.name + ' fora do ar e disco 97% cheio',
      apply: (d) => { d.os.disk = 97; d.os.services.nginx = 'failed'; }, fixed: (d) => d.os.disk < 80 && d.os.services.nginx === 'active', fix: (d) => { d.os.disk = 61; d.os.services.nginx = 'active'; } },
    noip3: { problem: true, loss: 'offline', kinds: ['server'], when: linux, short: 'Rede desconfigurada', msg: (d) => 'Servidor ' + d.name + ' voltou da manutenção sem rede',
      apply: (d) => { e0(d).up = false; e0(d).ips = []; d.os.route = null; },
      fixed: (d) => e0(d).up && hasIp(d, d.ip) && d.os.route === GW, fix: (d) => { e0(d).up = true; e0(d).ips = [d.ip + '/24']; d.os.route = GW; } },
    reinstall: { problem: true, loss: 'offline', kinds: ['server'], when: linux, short: 'Reinstalado sem configuração', msg: (d) => 'Servidor ' + d.name + ' voltou da reinstalação sem IP',
      apply: (d) => { d.os.hostname = 'localhost'; e0(d).ips = []; d.os.route = null; },
      fixed: (d) => hasIp(d, d.ip) && d.os.route === GW && d.os.hostname === d.name.toLowerCase(),
      fix: (d) => { e0(d).ips = [d.ip + '/24']; d.os.route = GW; d.os.hostname = d.name.toLowerCase(); } },
    extraip: { problem: true, kinds: ['server'], when: linux, short: 'IP a mais', msg: (d) => 'Conflito de IP: o ' + d.name + ' responde num endereço que não é dele',
      apply: (d, o, api) => { const ip = api.freeIp(); e0(d).ips.push(ip + '/24'); d.os.extraIp = ip; },
      fixed: (d) => hasIp(d, d.ip) && !hasIp(d, d.os.extraIp), fix: (d) => { e0(d).ips = [d.ip + '/24']; } },
    // the cable went to the switch's uplink port (te1): wrong connection, red in the cabling view
    cablewrong: { problem: true, loss: 'offline', kinds: ['server'], short: 'Cabo na porta errada', msg: (d) => 'Servidor ' + d.name + ' apresenta falha de conexão', apply: null, fixed: (d, ops) => ops.trace(d).ok },
    // the cable keeps coming loose: syslog shows the link going down and up, until it drops for good
    flap: { problem: true, loss: 'offline', kinds: ['server'], short: 'Link instável', msg: (d) => 'Servidor ' + d.name + ' caindo e voltando (link instável)', apply: null, fixed: (d, ops) => ops.trace(d).ok },
    // someone shut a port down and forgot it (administratively down, not err-disabled)
    portoff: { problem: true, loss: 'port', kinds: ['switch'], short: 'Porta desligada', msg: (d) => 'Porta ' + String(d.sw.off).replace('gi', 'Gi') + ' do ' + d.name + ' desligada (administratively down)', apply: null,
      fixed: (d) => !d.sw.off || d.sw.ports[d.sw.off] !== 'disabled', fix: (d) => { if (d.sw.off) d.sw.ports[d.sw.off] = d.sw.linked.has(d.sw.off) ? 'connected' : 'notconnect'; } },
    // a server's port moved to another VLAN (quarantine) · set to trunk mode by mistake (opts.port: the server's)
    vlanwrong: { problem: true, loss: 'port', kinds: ['switch'], short: 'Porta na VLAN errada', msg: (d) => 'Servidor ligado no ' + d.name + ' fora da rede (porta ' + String(d.sw.vport).replace('gi', 'Gi') + ')',
      apply: (d, o) => { const s = DL.swVlans(d.sw), p = o && o.port; if (!p) return; s.vlans[99] = 'QUARENTENA'; s.pvlan[p] = 99; s.vport = p; },
      fixed: (d) => !d.sw.vport || !d.sw.pvlan || (d.sw.pvlan[d.sw.vport] || 10) === 10, fix: (d) => { if (d.sw.vport) delete d.sw.pvlan[d.sw.vport]; } },
    porttrunk: { problem: true, loss: 'port', kinds: ['switch'], short: 'Porta de servidor em trunk', msg: (d) => 'Servidor ligado no ' + d.name + ' fora da rede (porta ' + String(d.sw.vport).replace('gi', 'Gi') + ')',
      apply: (d, o) => { const s = DL.swVlans(d.sw), p = o && o.port; if (!p) return; s.pmode[p] = 'trunk'; s.trunk[p] = [10, 99]; s.vport = p; },
      fixed: (d) => !d.sw.vport || !d.sw.pmode || d.sw.pmode[d.sw.vport] !== 'trunk', fix: (d) => { if (d.sw.vport) { d.sw.pmode[d.sw.vport] = 'access'; delete d.sw.trunk[d.sw.vport]; } } },
    // a server's port forced to 100 Mb/s half duplex: slow, with errors piling up (ethtool, ip -s link)
    duplex: { problem: true, kinds: ['switch'], short: 'Porta com duplex errado', msg: (d) => 'Servidor ligado no ' + d.name + ' lento e com erros de rede',
      apply: (d, o) => { const p = o && o.port; if (!p) return; d.sw.speed = d.sw.speed || {}; d.sw.duplex = d.sw.duplex || {}; d.sw.speed[p] = 100; d.sw.duplex[p] = 'half'; d.sw.dport = p; },
      fixed: (d) => !d.sw.dport || (!(d.sw.duplex || {})[d.sw.dport] && !(d.sw.speed || {})[d.sw.dport]), fix: (d) => { if (d.sw.dport) { delete d.sw.duplex[d.sw.dport]; delete d.sw.speed[d.sw.dport]; } } },
    // the firewall turned on letting only SSH in: the site is unreachable from outside
    fwblock: { problem: true, loss: 'service', kinds: ['server'], when: linux, short: 'Firewall bloqueando o site', msg: (d) => 'Site do ' + d.name + ' fora do ar para os clientes',
      apply: (d) => { DL.linuxSys(d).fw = { on: true, rules: [{ act: 'allow', port: '22' }] }; },
      fixed: (d) => DL.fwAllows(d.os, 80), fix: (d) => { DL.linuxSys(d).fw.rules.push({ act: 'allow', port: '80' }); } },
    // two ports down at once: one err-disabled, one shut down by hand
    port2: { problem: true, loss: 'port', kinds: ['switch'], short: 'Duas portas fora', msg: (d) => 'Duas portas do ' + d.name + ' fora do ar', apply: null,
      fixed: (d) => (!d.sw.bad || d.sw.fixed) && (!d.sw.off || d.sw.ports[d.sw.off] !== 'disabled'),
      fix: (d) => { d.sw.fixed = true; if (d.sw.off) d.sw.ports[d.sw.off] = d.sw.linked.has(d.sw.off) ? 'connected' : 'notconnect'; } },
  });
  DL.FAULTS = FAULTS;
  // a fault applies to a device when its kind matches and its optional `when(d)` agrees
  // (winserver.js: Windows-only faults, and Linux-only ones skip Windows servers)
  const faultFits = (k, d) => FAULTS[k].kinds.indexOf(d.kind) >= 0 && (!FAULTS[k].when || FAULTS[k].when(d));

  const STATE_LABEL = { new: 'Novo · sem cabo', link: 'Cabo ok · sem configuração', online: 'Online' };

  DL.createOps = function (game, sys) {
    const scene = game.scene;
    const world = () => scene.world;
    const $ = (id) => document.getElementById(id);
    const el = { btn: $('opsBtn'), badge: $('opsBadge'), panel: $('opsPanel'), list: $('opsList'), log: $('opsLog'), count: $('opsCount') };
    // "Ver detalhes" / "?" stay open (or closed) when the panel redraws itself
    el.panel.addEventListener('toggle', (ev) => { const k = ev.target && ev.target.dataset && ev.target.dataset.det; if (k) DL.keepOpen.set(k, ev.target.open); }, true);
    const O = { devs: new Map(), seq: { server: 0, switch: 0, patch: 0 }, links: [], linkSeq: 0, next: 70, faultCd: 0, preinstall: false, log: [], key: '', acc: 0, who: null };

    /* ------------------------------------------------------------------ */
    /* Registry                                                            */
    /* ------------------------------------------------------------------ */
    function reset() {
      O.devs.clear();
      O.seq = { server: 0, switch: 0, patch: 0 };
      O.links = [];
      O.log = [];
      O.next = 70;
      render(true);
    }

    function roomOf(e) {
      const w = world();
      const i = e.tx >= 0 && e.ty >= 0 && e.tx < w.W && e.ty < w.H ? w.roomAt[e.ty * w.W + e.tx] : -1;
      return i >= 0 ? w.rooms[i] : null;
    }
    const uLabel = (k) => 'U' + String(40 - k * 4).padStart(2, '0');

    function sync() {
      const seen = new Set();
      for (const e of world().items) {
        if (e.kind !== 'rack' || !e.units) continue;
        e.units.forEach((u, k) => {
          if (!u) return;
          const key = e.id + ':' + k;
          seen.add(key);
          let d = O.devs.get(key);
          const modelId = (e.unitModel && e.unitModel[k]) || u;
          if (!d || d.kind !== u || d.model.id !== modelId) {
            const n = ++O.seq[u];
            d = {
              key, kind: u, n, rack: e, slot: k, pre: O.preinstall,
              name: (u === 'switch' ? 'SW-' : u === 'patch' ? 'PP-' : 'SRV-') + String(n).padStart(2, '0'),
              ip: u === 'switch' ? '10.0.1.' + (200 + n) : u === 'patch' ? '' : '10.0.1.' + (10 + n),
              state: O.preinstall || u !== 'server' ? 'online' : 'new', fault: null, ran: new Set(),
              model: DL.hwModel(u, modelId),
            };
            if (u === 'switch') d.ports = switchPorts(d.model.ports || 24);
            if (u !== 'patch') DL.newOS(d, O.preinstall || u === 'switch');
            O.devs.set(key, d);
            if (!O.preinstall) {
              if (u === 'switch') logEvent('ok', d.name + ' (' + d.model.name + ') instalado em ' + e.id + ' · ' + (d.ports.length - 1) + ' portas prontas para receber cabos');
              else if (u === 'patch') logEvent('ok', d.name + ' instalado em ' + e.id + ' · 12 portas de passagem');
              else {
                logEvent('info', d.name + ' (' + d.model.name + ') instalado em ' + e.id + ' · falta ligar o cabo e configurar');
                game.toast('info', 'Novo servidor', d.name + ' instalado · abra Tarefas (T) para ligar o cabo');
              }
            }
          }
          d.rack = e;
          d.slot = k;
          d.where = e.id + ' · ' + uLabel(k);
          const srv = e.servers && e.servers.find((s) => s.u === uLabel(k));
          if (srv) srv.host = d.name;
        });
      }
      for (const k of Array.from(O.devs.keys())) if (!seen.has(k)) O.devs.delete(k);
      // cables whose device left the rack go with it
      O.links = O.links.filter((l) => O.devs.has(l.a.dev) && O.devs.has(l.b.dev));
      recompute();
    }
    game.on('world', sync);

    const devices = () => Array.from(O.devs.values());
    const get = (key) => O.devs.get(key);

    /* ------------------------------------------------------------------ */
    /* Cables                                                              */
    /* ------------------------------------------------------------------ */
    const plugged = (l, end) => l.loose !== end;
    function linkAt(key, port) {
      for (const l of O.links) {
        if (l.a.dev === key && l.a.port === port && plugged(l, 'a')) return l;
        if (l.b.dev === key && l.b.port === port && plugged(l, 'b')) return l;
      }
      return null;
    }
    // any cable end sitting in or hanging from this port (loose ends remember where they were)
    function linkNear(key, port) {
      return O.links.find((l) => (l.a.dev === key && l.a.port === port) || (l.b.dev === key && l.b.port === port)) || null;
    }

    // opts.who: the crew member plugging it (the 'cabled' event tells the player's work from the team's)
    function addLink(a, b, opts) {
      opts = opts || {};
      if (a.dev === b.dev && a.port === b.port) return { reason: 'Escolha outra porta' };
      if (linkAt(a.dev, a.port) || linkAt(b.dev, b.port)) return { reason: 'Porta ocupada' };
      const l = { id: ++O.linkSeq, a: { dev: a.dev, port: a.port }, b: { dev: b.dev, port: b.port }, loose: null };
      O.links.push(l);
      if (!opts.quiet) { markMessy(l); O.who = opts.who || null; recompute(); O.who = null; }
      return { link: l };
    }

    function removeLink(l) {
      O.links = O.links.filter((x) => x !== l);
      recompute();
    }

    // move one end of a cable to another port (also how a loose end gets plugged back in)
    function moveEnd(l, end, to) {
      const at = linkAt(to.dev, to.port);
      if (at && at !== l) return { reason: 'Porta ocupada' };
      const keep = l[end === 'a' ? 'b' : 'a'];
      if (keep.dev === to.dev && keep.port === to.port) return { reason: 'Escolha outra porta' };
      const back = l.loose === end && l[end].dev === to.dev && l[end].port === to.port;
      l[end] = { dev: to.dev, port: to.port };
      if (l.loose === end) l.loose = null;
      if (!back) markMessy(l); // putting a loose plug back where it was doesn't disturb the bundle
      recompute();
      return { link: l };
    }

    function markMessy(l) {
      for (const k of [l.a.dev, l.b.dev]) { const d = get(k); if (d) d.rack.tidy = false; }
    }

    // Follow the cable from a server's eth0 to a switch, hopping through patch panels.
    function trace(d) {
      const path = [];
      let cur = { dev: d.key, port: 'eth0' };
      for (let hop = 0; hop < 6; hop++) {
        const l = linkNear(cur.dev, cur.port);
        if (!l) return { ok: false, links: path, reason: hop ? 'O caminho para no patch panel: falta o cabo do outro lado até o switch' : 'Sem cabo na eth0', missing: true };
        path.push(l);
        if (l.loose) return { ok: false, links: path, reason: 'Cabo solto: uma ponta saiu da porta', loose: true };
        const end = l.a.dev === cur.dev && l.a.port === cur.port ? 'a' : 'b';
        const o = l[end === 'a' ? 'b' : 'a'], od = get(o.dev);
        if (!od) return { ok: false, links: path, reason: 'Equipamento removido' };
        if (od.kind === 'server') return { ok: false, links: path, reason: 'Servidor ligado em outro servidor: o cabo precisa chegar a um switch', bad: true };
        if (od.kind === 'switch') {
          if (o.port === 'te1') return { ok: false, links: path, reason: 'Porta de uplink (te1) é reservada para o core: use uma porta gi0/1–' + (portsOf(od).length - 1), bad: true };
          return { ok: true, links: path, sw: od, port: o.port };
        }
        cur = { dev: o.dev, port: flip(o.port) };
      }
      return { ok: false, links: path, reason: 'Laço de cabos entre patch panels', bad: true };
    }

    // Colour state of every cable: ok (on a working path), part (incomplete), bad (wrong), loose.
    function classify() {
      const st = new Map();
      for (const l of O.links) st.set(l, l.loose ? 'loose' : 'idle');
      for (const d of devices()) {
        if (d.kind !== 'server') continue;
        const t = trace(d);
        const v = t.ok ? 'ok' : t.loose ? 'loose' : t.bad ? 'bad' : 'part';
        for (const l of t.links) if (st.get(l) !== 'loose' && st.get(l) !== 'bad') st.set(l, v);
      }
      for (const l of O.links) {
        if (st.get(l) !== 'idle') continue;
        const a = get(l.a.dev), b = get(l.b.dev);
        if (a === b) st.set(l, 'bad');
        else if (a.kind === 'patch' && b.kind === 'patch') st.set(l, 'bad');
        else st.set(l, 'part');
      }
      return st;
    }

    // After any change: cable state, device states, switch ports, rack looks.
    function recompute() {
      const now = scene.t;
      for (const d of devices()) {
        if (d.kind !== 'server') continue;
        const t = trace(d);
        d.path = t;
        d.os.cable = t.ok;
        if (d.state === 'new' && t.ok) {
          d.state = 'link';
          if (!O.preinstall) {
            logEvent('ok', d.name + ' ligado ao ' + t.sw.name + ' ' + t.port + ' · agora configure no terminal');
            game.toast('ok', 'Cabo conectado', d.name + ' → ' + t.sw.name + ' ' + t.port + ' · próximo: configurar no terminal');
            game.emit('cabled', { d, who: O.who || null });
          }
        } else if (d.state === 'link' && !t.ok) d.state = 'new';
        else if (d.state === 'online' && !t.ok && !d.fault && !O.preinstall) { d.fault = { type: 'cable', found: false, at: now, player: true }; d.ran = new Set(); d.lessonKey = null; }
      }
      for (const d of devices()) {
        if (d.kind !== 'switch') continue;
        d.sw.linked = new Set();
        const list = portsOf(d);
        for (const p of list) if (linkAt(d.key, p)) d.sw.linked.add(p);
        for (let i = 1; i < list.length; i++) {
          const p = 'gi0/' + i;
          // the broken port stays err-disabled until the player shuts it down (then disabled until "no shutdown")
          if (d.sw.bad === p && !d.sw.fixed) d.sw.ports[p] = d.sw.shut === p ? 'disabled' : 'err-disabled';
          else if (d.sw.ports[p] !== 'disabled') d.sw.ports[p] = d.sw.linked.has(p) ? 'connected' : 'notconnect';
        }
      }
      for (const e of world().items) {
        if (e.kind !== 'rack' || !e.units) continue;
        e.unitState = e.unitState || [];
        const devs = devices().filter((d) => d.rack === e);
        const n = O.links.filter((l) => devs.some((d) => d.key === l.a.dev || d.key === l.b.dev)).length;
        e.cableLook = n ? (e.tidy === false ? 'messy' : 'tidy') : null;
        e.units.forEach((u, k) => {
          const d = devs.find((x) => x.slot === k);
          e.unitState[k] = !d || d.kind === 'patch' ? null : d.fault || (d.state === 'online' && !health(d).up) ? 'fault' : d.state === 'online' ? null : d.state;
        });
      }
      render();
      game.emit('cables');
    }

    // Tidy a set of racks: cables are routed through the cable managers again.
    // who: the crew member who did it (none = the player, in the cabling view)
    function tidy(racks, who) {
      for (const r of racks) { r.tidy = true; r.messyNoted = false; }
      recompute();
      logEvent('ok', 'Cabos organizados em ' + racks.map((r) => r.id).join(', ') + ' · melhor fluxo de ar e manutenção mais fácil');
      game.emit('tidy', { racks, who: who || null });
    }

    // Presets arrive already cabled: each server to the nearest switch with a free port
    // (through a patch panel when the switch rack has one).
    function prewire(messyRack) {
      const switches = devices().filter((d) => d.kind === 'switch');
      const dist = (a, b) => Math.abs(a.rack.tx - b.rack.tx) + Math.abs(a.rack.ty - b.rack.ty) * 3;
      const freeFront = (pp) => PORTS.patch.find((x) => x[0] === 'f' && !linkAt(pp.key, x) && !linkAt(pp.key, flip(x)));
      for (const d of devices()) {
        if (d.kind !== 'server' || linkNear(d.key, 'eth0')) continue;
        const room = roomOf(d.rack);
        const sw = switches.filter((s) => roomOf(s.rack) === room).sort((x, y) => dist(x, d) - dist(y, d))
          .find((s) => portsOf(s).some((p) => p !== 'te1' && !linkAt(s.key, p)));
        if (!sw) continue;
        const port = portsOf(sw).find((p) => p !== 'te1' && !linkAt(sw.key, p));
        const pp = devices().find((p) => p.kind === 'patch' && p.rack === sw.rack && freeFront(p));
        if (pp) {
          const f = freeFront(pp);
          addLink({ dev: d.key, port: 'eth0' }, { dev: pp.key, port: f }, { quiet: true });
          addLink({ dev: pp.key, port: flip(f) }, { dev: sw.key, port }, { quiet: true });
        } else addLink({ dev: d.key, port: 'eth0' }, { dev: sw.key, port }, { quiet: true });
      }
      for (const e of world().items) if (e.kind === 'rack') { e.tidy = e !== messyRack; e.messyNoted = false; }
      recompute();
    }

    /* ------------------------------------------------------------------ */
    /* Health + reachability                                               */
    /* ------------------------------------------------------------------ */
    function health(d) {
      if (d.kind === 'patch') return { up: true };
      // a switch with broken hardware (staff.js) is down — and so is everything behind it
      if (d.kind === 'switch') return { up: !d.broken, broken: !!d.broken, errPorts: d.broken ? 0 : Object.values(d.sw.ports).filter((s) => s === 'err-disabled').length };
      const os = d.os, e0 = os.ifaces.eth0, t = d.path || trace(d);
      let why = null;
      if (!t.ok) why = 'cable';
      else if (t.sw.broken) why = 'switch';
      else if (!e0.up) why = 'iface';
      else if (e0.ips.indexOf(d.ip + '/24') < 0) why = 'ip';
      else if (portDown(t)) why = 'port';
      // (the site: nginx running and, with the firewall on, port 80 let in)
      return { up: !why, why, http: !why && os.services.nginx === 'active' && (!DL.fwAllows || DL.fwAllows(os, 80)), disk: os.disk };
    }
    // the switch port at the end of the cable is err-disabled, shut down by hand, in trunk mode or in a VLAN other
    // than the datacenter's (10, where the gateway is)
    const portDown = (t) => { const s = t.sw.sw; return (s.bad === t.port && !s.fixed) || s.ports[t.port] === 'disabled' || portVlanBad(s, t.port); };
    const portVlanBad = (s, p) => (s.pmode && s.pmode[p] === 'trunk') || ((s.pvlan && s.pvlan[p]) || 10) !== 10;

    function reach(d, host) {
      // from a switch (its own ping): the gateway, or a device that is up
      if (d.kind === 'switch') {
        if (host === GW || host === d.ip) return { ok: true };
        const o = devices().find((x) => x.ip === host && x.kind !== 'patch');
        return { ok: !!o && (o.kind === 'switch' || (o.state === 'online' && health(o).up)) };
      }
      const os = d.os, e0 = os.ifaces.eth0;
      if (host === '127.0.0.1' || host === 'localhost') return { ok: true };
      if (!e0.up) return { ok: false, msg: 'connect: Network is unreachable', hint: 'a eth0 está DOWN — veja ip link' };
      const t = d.path || trace(d);
      if (!t.ok) return { ok: false, msg: 'connect: Network is unreachable', hint: 'sem sinal no cabo (NO-CARRIER). ' + t.reason + ' — confira o cabeamento do rack' };
      if (t.sw.broken) return { ok: false, msg: 'connect: Network is unreachable', hint: 'o ' + t.sw.name + ' está com defeito de hardware — chame o técnico de TI' };
      if (!e0.ips.length) return { ok: false, msg: 'connect: Network is unreachable', hint: 'a eth0 não tem endereço IP — veja ip addr' };
      if (portDown(t)) {
        const s = t.sw.sw, how = portVlanBad(s, t.port) ? (s.pmode && s.pmode[t.port] === 'trunk' ? 'em modo trunk (servidor pede access)' : 'na VLAN ' + s.pvlan[t.port] + ' (o gateway está na VLAN 10)') : s.ports[t.port] === 'disabled' ? 'desligada (disabled)' : 'err-disabled';
        return { ok: false, msg: 'From ' + e0.ips[0].split('/')[0] + ' icmp_seq=1 Destination Host Unreachable', hint: 'a porta ' + t.port + ' do ' + t.sw.name + ' está ' + how + ' — o problema está no switch' };
      }
      const local = e0.ips.some((ip) => ip.split('.').slice(0, 3).join('.') === host.split('.').slice(0, 3).join('.'));
      if (!local && !os.route) return { ok: false, msg: 'connect: Network is unreachable', hint: 'destino fora da rede local e sem rota padrão — veja ip route' };
      // outside the network everything goes through the default route: a gateway that doesn't exist answers nothing
      if (!local && os.route !== GW && !devices().some((x) => x.ip === os.route)) return { ok: false, msg: 'From ' + e0.ips[0].split('/')[0] + ' icmp_seq=1 Destination Host Unreachable', hint: 'a rota padrão aponta para ' + os.route + ', que não responde — veja ip route' };
      // the address the server answers on has to be its own (a wrong IP can't reach the gateway's network)
      if (!e0.ips.some((ip) => ip.split('.').slice(0, 3).join('.') === '10.0.1')) return { ok: false, msg: 'connect: Network is unreachable', hint: 'o IP da eth0 não é da rede 10.0.1.0/24 — veja ip addr' };
      if (host === GW || host === '8.8.8.8' || host === '1.1.1.1') return { ok: true };
      // a device's own address, or an extra one it carries (a virtual IP that moves between servers)
      const o = devices().find((x) => x.ip === host) || devices().find((x) => x.kind === 'server' && x.os && x.os.ifaces.eth0.ips.indexOf(host + '/24') >= 0 && health(x).up);
      if (o) return { ok: o.state === 'online' && health(o).up, hint: !health(o).up ? o.name + ' está fora do ar' : null };
      return { ok: false, msg: 'From ' + e0.ips[0].split('/')[0] + ' icmp_seq=1 Destination Host Unreachable' };
    }

    /* ------------------------------------------------------------------ */
    /* Faults                                                              */
    /* ------------------------------------------------------------------ */
    // opts.port: the switch port to put in err-disabled (the tutorial picks the one of the player's server)
    function injectFault(d, type, opts) {
      // err-disabled is a feature of managed switches: the simple ones never shut a port down
      if (d.kind === 'switch' && d.model && d.model.managed === false) return null;
      // (a fault only a problem sets up is never picked at random)
      const types = Object.keys(FAULTS).filter((k) => faultFits(k, d) && (type === k || !FAULTS[k].problem));
      if (!types.length || (type && types.indexOf(type) < 0)) return null;
      const t = type || pick(types);
      const used = d.kind === 'switch' ? Array.from(d.sw.linked || []).filter((p) => p !== 'te1') : [];
      if (t === 'cable' || t === 'flap') {
        const tr = trace(d);
        if (!tr.ok) return null;
        const l = tr.links[0];
        // opts.far: the plug comes out at the switch end (the port shows notconnect)
        const near = l.a.dev === d.key ? 'a' : 'b';
        l.loose = opts && opts.far && tr.links.length === 1 ? (near === 'a' ? 'b' : 'a') : near;
        if (t === 'flap') {
          const n = 3 + Math.floor(rand() * 4);
          d.os.flaps = n;
          for (let i = 0; i < n; i++) {
            DL.syslogAdd(d, 50 - i * 9, 'kernel: [' + (90000 + i * 777) + '.1] e1000e: eth0 NIC Link is Down');
            if (i < n - 1) DL.syslogAdd(d, 49 - i * 9, 'kernel: [' + (90060 + i * 777) + '.4] e1000e: eth0 NIC Link is Up 1000 Mbps Full Duplex');
          }
        }
      } else if (t === 'cablewrong') {
        // the switch end moves to the uplink port te1 (when it is free)
        const tr = trace(d);
        if (!tr.ok || tr.links.length !== 1 || linkAt(tr.sw.key, 'te1')) return null;
        const l = tr.links[0], end = l.a.dev === tr.sw.key ? 'a' : 'b';
        l[end] = { dev: tr.sw.key, port: 'te1' };
        markMessy(l);
      } else if (t === 'port' || t === 'port2') {
        if (!used.length || (t === 'port2' && used.length < 2)) return null;
        d.sw.bad = opts && used.indexOf(opts.port) >= 0 ? opts.port : pick(used);
        d.sw.fixed = false;
        if (d.sw.shut === d.sw.bad) d.sw.shut = null;
        // opts.port2: the port shut down by hand (another server's)
        if (t === 'port2') { const rest = used.filter((p) => p !== d.sw.bad); d.sw.off = opts && rest.indexOf(opts.port2) >= 0 ? opts.port2 : pick(rest); d.sw.ports[d.sw.off] = 'disabled'; }
      } else if (t === 'portoff') {
        if (!used.length) return null;
        d.sw.off = opts && used.indexOf(opts.port) >= 0 ? opts.port : pick(used);
        d.sw.ports[d.sw.off] = 'disabled';
      } else FAULTS[t].apply(d, opts, api);
      d.fault = { type: t, found: false, at: scene.t };
      d.ran = new Set();
      d.lessonKey = null;
      recompute();
      return d;
    }

    function crewOnDuty() {
      // only people at work right now (shifts.js sends the others home)
      const m = sys.crew.members.filter((a) => !a.crew.off);
      return m.find((a) => a.crew.state === 'working') || m.find((a) => a.crew.state !== 'sitting' && a.crew.state !== 'standing') || m[0] || null;
    }

    function report(d, who, how) {
      if (!d.fault || d.fault.found) return false;
      d.fault.found = true;
      d.fault.foundAt = scene.t;
      d.fault.by = who ? who.crew.name : null;
      const msg = FAULTS[d.fault.type].msg(d);
      const by = who ? who.crew.name + ' · ' + DL.ROLES[who.crew.profile.role].name + (how ? ' (' + how + ')' : '') : 'Monitoramento';
      game.toast('warn', '⚠️ Alerta', msg + ' — ' + by);
      logEvent('warn', '⚠️ ' + msg + ' · avisado por ' + by);
      if (who) who.crew.alertT = 5;
      game.sfx('alert');
      render(true);
      // beginners get a short explanation of where to start
      if (DL.learn && DL.learn().tips) {
        const TIP = { link: 'a interface de rede caiu: no terminal, veja com ip link e ligue com sudo ip link set eth0 up.', cable: 'é camada física: abra o Cabeamento do rack e reconecte o cabo solto (laranja).', service: 'o serviço web parou: systemctl status nginx mostra o erro, sudo systemctl restart nginx resolve.', disk: 'disco cheio: df -h mostra o uso, du -sh /var/log acha o culpado.', port: 'porta do switch em erro: enable → sh int status → conf t → interface → shutdown / no shutdown.' };
        const ty = d.fault ? d.fault.type : '';
        const tip = DL.isWin && DL.isWin(d) && DL.WIN_TALK && DL.WIN_TALK.steps[ty] ? DL.WIN_TALK.steps[ty] : TIP[ty];
        setTimeout(() => game.toast('info', 'Dica · modo Iniciante', 'Tarefas (T) → Abrir terminal. ' + (tip || '')), 1200);
      }
      game.emit('fault', { d, who, how, msg });
      return true;
    }

    // The monitor raised a problem: someone on the team tells the player.
    function announce(d, text) {
      if (d.fault && !d.fault.found) return report(d, crewOnDuty(), 'monitoramento');
      if (d.fault) return false;
      const who = crewOnDuty();
      const by = who ? who.crew.name + ' · ' + DL.ROLES[who.crew.profile.role].name : 'Monitoramento';
      game.toast('warn', '⚠️ Monitor', text + ' — ' + by);
      logEvent('warn', '⚠️ ' + text + ' · ' + by);
      if (who) who.crew.alertT = 5;
      game.emit('announce', { who, text });
      return true;
    }

    // A crew member looked at a rack: reveal what's wrong, comment on the cabling.
    function inspect(who, e) {
      if (!e || !e.units) return false;
      for (const d of devices()) if (d.rack === e && d.fault && !d.fault.found) return report(d, who, 'inspeção');
      if (e.cableLook === 'messy' && !e.messyNoted) {
        e.messyNoted = true;
        game.emit('observe', { who, text: 'Os cabos do ' + e.id + ' estão bagunçados — atrapalha o fluxo de ar e a manutenção. Dá para organizar no Cabeamento.' });
        logEvent('info', who.crew.name + ': cabos desorganizados no ' + e.id + ' · use Organizar cabos');
        who.crew.alertT = 3;
      }
      return false;
    }
    const monitor = () => {};

    function resolveFixed() {
      for (const d of devices()) {
        if (!d.fault || !FAULTS[d.fault.type].fixed(d, api)) continue;
        const f = d.fault;
        d.fault = null;
        if (d.kind === 'switch') { d.sw.bad = null; d.sw.fixed = false; d.sw.off = null; }
        O.faultCd = 50;
        logEvent('ok', 'Resolvido: ' + FAULTS[f.type].short.toLowerCase() + ' no ' + d.name + (f.fixedBy ? ' · por ' + f.fixedBy : ''));
        if (f.found || f.player) game.toast('ok', 'Problema resolvido', d.name + ' de volta ao normal' + (f.fixedBy ? ' · ' + f.fixedBy : '') + ' · o monitor volta ao verde');
        game.sfx('done');
        recompute();
        game.emit('fixed', { d, type: f.type, by: f.fixedBy || null, at: f.at, found: f.found });
      }
    }

    // A crew member repairs a fault the way the player would (same end state the terminal checks).
    function fix(d, who) {
      const f = d.fault;
      if (!f) return false;
      if (f.type === 'link') d.os.ifaces.eth0.up = true;
      else if (f.type === 'service') d.os.services.nginx = 'active';
      else if (f.type === 'disk') d.os.disk = 61;
      else if (f.type === 'port') d.sw.fixed = true;
      else if (f.type === 'cablewrong') {
        // back to a free access port of the same switch
        const l = O.links.find((x) => (x.a.dev === d.key && x.a.port === 'eth0') || (x.b.dev === d.key && x.b.port === 'eth0'));
        const end = l && (l.a.port === 'te1' ? 'a' : l.b.port === 'te1' ? 'b' : null), sw = end && get(l[end].dev);
        const port = sw && portsOf(sw).find((p) => p !== 'te1' && !linkAt(sw.key, p));
        if (port) l[end] = { dev: sw.key, port };
      } else if (f.type === 'cable' || f.type === 'flap') {
        const l = linkNear(d.key, 'eth0');
        if (l && l.loose) l.loose = null;
        else if (!l) {
          const sw = devices().find((s) => s.kind === 'switch' && s.rack === d.rack) || devices().find((s) => s.kind === 'switch');
          const port = sw && portsOf(sw).find((p) => p !== 'te1' && !linkAt(sw.key, p));
          if (port) addLink({ dev: d.key, port: 'eth0' }, { dev: sw.key, port }, { quiet: true });
        }
      } else if (FAULTS[f.type].fix) FAULTS[f.type].fix(d);
      f.fixedBy = who && who.crew ? who.crew.name : null;
      recompute();
      resolveFixed();
      if (d.fault) { f.fixedBy = null; f.botTried = scene.t; }
      return !d.fault;
    }

    /* ------------------------------------------------------------------ */
    /* Hands-on repairs for what the Monitor sees (staff.js incident orders) */
    /* ------------------------------------------------------------------ */
    // The cable of a server's eth0 back on a working path: loose plugs back in, the uplink port swapped for an
    // access port, anything else (another server, an incomplete patch panel path) replaced by a cable straight
    // to a switch. Returns null when it worked, or why not.
    function replug(d) {
      let t = trace(d);
      if (t.ok) return null;
      if (t.loose) { for (const l of t.links) l.loose = null; recompute(); t = trace(d); if (t.ok) return null; }
      const last = t.links[t.links.length - 1], end = last && (get(last.a.dev) && get(last.a.dev).kind === 'switch' && last.a.port === 'te1' ? 'a' : get(last.b.dev) && get(last.b.dev).kind === 'switch' && last.b.port === 'te1' ? 'b' : null);
      if (end) {
        const sw = get(last[end].dev), port = portsOf(sw).find((p) => p !== 'te1' && !linkAt(sw.key, p));
        if (port) { last[end] = { dev: sw.key, port }; recompute(); if (trace(d).ok) return null; }
      }
      const near = api.switchesNear(d).concat(devices().filter((s) => s.kind === 'switch'));
      const sw = near.find((s) => !s.broken && !s.out && portsOf(s).some((p) => p !== 'te1' && !linkAt(s.key, p)));
      if (!sw) return 'Nenhum switch com porta livre para ligar o ' + d.name;
      const first = linkNear(d.key, 'eth0');
      if (first) O.links = O.links.filter((l) => l !== first);
      addLink({ dev: d.key, port: 'eth0' }, { dev: sw.key, port: portsOf(sw).find((p) => p !== 'te1' && !linkAt(sw.key, p)) }, { quiet: true });
      recompute();
      return trace(d).ok ? null : t.reason;
    }
    // A switch port back to a working access port in the datacenter's VLAN: err-disabled cleared, shut down
    // ports up again, quarantine VLAN / trunk mode undone.
    function reopenPort(sw, p) {
      const s = sw.sw;
      if (s.bad === p) s.fixed = true;
      if (s.shut === p) s.shut = null;
      if (s.ports[p] === 'disabled' || s.ports[p] === 'err-disabled') s.ports[p] = s.linked && s.linked.has(p) ? 'connected' : 'notconnect';
      if (s.pvlan && s.pvlan[p] && s.pvlan[p] !== 10) delete s.pvlan[p];
      if (s.pmode && s.pmode[p] === 'trunk') { s.pmode[p] = 'access'; if (s.trunk) delete s.trunk[p]; }
    }
    // The same end state the player reaches through the terminal or the cabling view. what: 'ping' (cable,
    // interface, IP and the switch port, in that order) · 'http' (nginx and the firewall) · 'disk' · 'port'
    // (every port of a switch in error). Returns { say } with what was done, { wait: switch } when the host hangs
    // on a broken switch (the technician's repair brings it back), or { error }.
    function restore(d, what, who) {
      const did = [];
      const lx = linux(d) && d.os;
      if (what === 'ping' && d.kind === 'server') {
        const h0 = health(d);
        if (h0.why === 'switch') return { wait: d.path.sw };
        if (h0.why === 'cable') { const why = replug(d); if (why) return { error: why }; did.push('cabo'); }
        const e = e0(d);
        if (!e.up) { e.up = true; did.push('interface'); }
        if (!hasIp(d, d.ip)) { e.ips = [d.ip + '/24']; did.push('IP'); }
        if (!d.os.route) d.os.route = GW;
        if (lx && d.os.hostname === 'localhost') d.os.hostname = d.name.toLowerCase();
        recompute();
        const t = d.path || trace(d);
        if (t.ok && portDown(t)) { reopenPort(t.sw, t.port); if (t.sw.fault) t.sw.fault.fixedBy = who && who.crew ? who.crew.name : null; did.push('porta ' + t.port + ' do ' + t.sw.name); }
      } else if (what === 'http' && d.os) {
        if (d.os.services.nginx !== 'active') { d.os.services.nginx = 'active'; did.push('nginx'); }
        if (DL.fwAllows && !DL.fwAllows(d.os, 80) && DL.linuxSys) { DL.linuxSys(d).fw.rules.push({ act: 'allow', port: '80' }); did.push('firewall'); }
      } else if (what === 'disk' && d.os) {
        if (d.os.disk >= 80) { d.os.disk = 61; did.push('disco'); }
      } else if (what === 'port' && d.kind === 'switch') {
        for (const p of Object.keys(d.sw.ports)) if (d.sw.ports[p] === 'err-disabled' || (d.sw.bad === p && !d.sw.fixed)) { reopenPort(d, p); did.push(p); }
      }
      if (d.fault) d.fault.fixedBy = who && who.crew ? who.crew.name : null;
      recompute();
      resolveFixed();
      if (d.fault) d.fault.fixedBy = null;
      if (what === 'ping' && d.kind === 'server' && !health(d).up) return { error: 'O ' + d.name + ' ainda não responde ao ping' };
      return { did };
    }
    // the team is on this device's problem (staff.js): it doesn't hold the next incident back (see tick)
    const handled = (d) => !!(game.staff && game.staff.handling && game.staff.handling(d));

    function tick(dt) {
      O.next -= dt;
      if (O.faultCd > 0) O.faultCd -= dt;
      if (O.next > 0) return;
      // the incident director (director.js) decides when the next problem may start: one at a time
      const dir = game.director;
      O.next = dir ? 20 + rand() * 25 : 80 + rand() * 60;
      // (a fault someone is already repairing doesn't count: repairs take minutes, the pace of new ones stays)
      const open = devices().filter((d) => d.fault && !handled(d)).length;
      const ok = devices().filter((d) => d.state === 'online' && !d.fault && !d.broken && d.kind !== 'patch' && health(d).up);
      if (open >= 2 || O.faultCd > 0 || !ok.length || game.paused()) return;
      if (dir && !dir.canStart('fault')) return;
      // even when allowed, problems don't pile up the moment the gate opens
      if (dir && rand() < 0.45) return;
      // cheaper hardware breaks more often (model.fault: 1 = classic)
      const weight = (d) => (d.model && d.model.fault != null ? d.model.fault : 1);
      const total = ok.reduce((sum, d) => sum + weight(d), 0);
      const pickW = () => { let r = rand() * total; for (const d of ok) if ((r -= weight(d)) <= 0) return d; return ok[ok.length - 1]; };
      // Outside Experiente, most problems are ones somebody on duty can fix (the player always can,
      // through the terminal) — so an unattended company doesn't bleed for hours on a fault nobody knows.
      const L = DL.learn ? DL.learn() : null;
      const fixable = new Set();
      for (const m of sys.crew.members) if (!m.crew.off) for (const t of (DL.JOBS.BY_ROLE[m.crew.profile.role] || [])) if (t.kind === 'fix') t.types.forEach((x) => fixable.add(x));
      const prefer = (!L || L.id !== 'experiente') && fixable.size && rand() < 0.8;
      for (let n = 0; n < 4; n++) {
        const pickD = total > 0 ? pickW() : pick(ok);
        const kinds = Object.keys(FAULTS).filter((k) => !FAULTS[k].problem && faultFits(k, pickD) && (!prefer || fixable.has(k)));
        if (!kinds.length) continue;
        const d = injectFault(pickD, pick(kinds));
        if (d) { if (dir) dir.started('fault', d.name); break; }
      }
    }

    /* ------------------------------------------------------------------ */
    /* Actions                                                             */
    /* ------------------------------------------------------------------ */
    function openTerminal(d) {
      if (d.kind === 'patch') { sys.cabling.open(d.rack, d); return; }
      if (d.broken || d.out) { game.toast('warn', d.name + ' em manutenção', d.out ? 'O equipamento está na bancada do técnico' : 'Defeito de hardware: o técnico de TI precisa trocar a peça na bancada'); return; }
      if (d.kind === 'switch' && d.model && d.model.managed === false) {
        game.toast('info', d.name + ' · ' + d.model.name, 'Switch não gerenciável: não tem console. Para CLI, VLAN e diagnóstico de porta use um gerenciável');
        sys.cabling.open(d.rack, d);
        return;
      }
      if (d.state === 'new') { game.toast('info', 'Falta o cabo', 'Ligue o ' + d.name + ' a um switch antes de configurar'); sys.cabling.open(d.rack, d); return; }
      const win = DL.isWin && DL.isWin(d);
      // a new server: the setup lesson — or the one of the career problem about it (problems.js: a harder version)
      let lesson = d.fault && d.fault.found ? d.fault.type : d.state === 'link' ? (game.problems && game.problems.setupLesson(d)) || (win ? 'winsetup' : 'setup') : null;
      if (win && lesson && DL.winLessonFor) lesson = DL.winLessonFor(d, lesson);
      // a career problem on this device opens its own lesson (problems.js): when nothing else is urgent here,
      // or when the problem itself is about this fault
      const prob = game.problems && game.problems.consoleFor(d, !!lesson);
      if (prob) { game.problems.openConsole(prob, d); return; }
      sys.terminal.open(d, lesson, () => complete(d, lesson));
    }

    // A crew member configures a new server the way the setup lesson does (same end state), then it goes online.
    function configure(d) {
      if (d.kind !== 'server' || d.state !== 'link' || (DL.isWin && DL.isWin(d))) return false;
      const e0 = d.os.ifaces.eth0;
      e0.up = true;
      if (e0.ips.indexOf(d.ip + '/24') < 0) e0.ips.push(d.ip + '/24');
      d.os.route = '10.0.1.1';
      complete(d, 'setup');
      return d.state === 'online';
    }

    function complete(d, lesson) {
      // setup, winsetup and the problems' own setup lessons (setup_jr1…)
      if (/^(win)?setup/.test(lesson || '') && d.state === 'link') {
        d.state = 'online';
        if (d.os.hostname === 'localhost') d.os.hostname = d.name.toLowerCase();
        logEvent('ok', d.name + ' online · ' + d.ip + ' · já aparece no monitoramento');
        game.toast('ok', 'Servidor online', d.name + ' · ' + d.ip + ' · já aparece no Monitor (M)');
        game.sfx('done');
        game.emit('server-online', { d });
      }
      resolveFixed();
      recompute();
    }

    /* ------------------------------------------------------------------ */
    /* Tasks panel                                                         */
    /* ------------------------------------------------------------------ */
    function logEvent(tone, text) {
      O.log.unshift({ tone, text, t: game.clock() });
      if (O.log.length > 40) O.log.pop();
      render(true);
    }

    // faults first, then career problems (problems.js), then servers to set up
    const ORDER = { fire: 0, fault: 0, problem: 1, setup: 2 };
    function tasks() {
      const out = [];
      const probs = game.problems ? game.problems.list() : [];
      // the fault / the new server a problem is about shows up once, as the problem
      const taken = new Set([].concat(...probs.filter((p) => p.x && (p.def.complete !== 'lesson' || (DL.problemBreaks && DL.problemBreaks(p.def)))).map(game.problems.devicesOf)));
      for (const d of devices()) {
        if (taken.has(d)) continue;
        // burnt in a rack fire (incendio.js): first the part, at the technician's bench
        if (d.queimado && (d.broken || d.out)) out.push({ d, kind: 'fire', title: (d.kind === 'switch' ? 'Switch queimado no incêndio: trocar a peça do ' : 'Queimado no incêndio: trocar a peça do ') + d.name });
        else if (d.fault && d.fault.found) out.push({ d, kind: 'fault', title: FAULTS[d.fault.type].msg(d), by: d.fault.by });
        // (a server that came back damaged from a blackout, blackout.js: the same job, with its own name and XP)
        else if (d.kind === 'server' && (d.state === 'new' || d.state === 'link')) out.push({ d, kind: 'setup', title: d.queimado ? 'Danificado no incêndio: refazer cabo e configurar o ' + d.name : d.danificado ? 'Danificado no apagão: refazer cabo e configurar o ' + d.name : (DL.isWin && DL.isWin(d) ? 'Instalar Windows Server no ' : 'Instalar e configurar ') + d.name });
      }
      for (const p of probs) out.push({ d: p.x && p.x.kind !== 'rack' ? p.x : null, kind: 'problem', p, fault: p.def.complete === 'fixed' });
      out.sort((a, b) => ORDER[a.kind] - ORDER[b.kind]);
      return out;
    }

    function stepper(d) {
      const st = d.state === 'new' ? 1 : d.state === 'link' ? 2 : 4;
      const steps = ['Instalar no rack', 'Ligar o cabo', 'Configurar no terminal', 'Testar conexão'];
      return '<ol class="ops-steps">' + steps.map((s, i) => '<li class="' + (i < st ? 'is-done' : i === st ? 'is-current' : '') + '">' + s + '</li>').join('') + '</ol>';
    }

    function render(force) {
      if (!el.list) return;
      const list = tasks();
      const n = list.length, faults = list.filter((x) => x.kind === 'fault' || x.kind === 'fire' || x.fault).length;
      el.badge.textContent = n;
      el.badge.hidden = !n;
      el.btn.classList.toggle('is-alert', faults > 0);
      // (the work order the Monitor opened for it, and who is on it: staff.js)
      const care = (d) => (game.staff && game.staff.orderOn ? game.staff.orderOn(d) : '');
      const key = list.filter((x) => x.kind !== 'problem').map((x) => x.d.key + x.kind + x.d.state + (x.d.path && x.d.path.reason) + care(x.d) + (x.d.danificado ? 'D' : '') + (x.d.queimado ? 'Q' + !!x.d.out + (DL.Fogo ? DL.Fogo.tecnico(x.d) : '') : '')).join('|') +
        (game.problems ? '#' + game.problems.key() : '') + O.log.length + (O.log[0] ? O.log[0].text : '');
      if (!force && key === O.key) return;
      O.key = key;
      let h = '';
      if (!list.length) h += '<li class="ops-empty"><p>Nenhuma tarefa aberta.</p><p class="eyebrow-sm">Instale um servidor num rack (B → Equipamentos → Servidor) para configurar.</p></li>';
      for (const x of list) {
        if (x.kind === 'problem') { h += game.problems.itemHtml(x.p); continue; }
        const d = x.d;
        if (x.kind === 'fire' && DL.Fogo) { h += DL.Fogo.tarefaHtml(d, x.title, care(d)); continue; }
        const now = x.kind === 'setup' ? ['Instalar no rack', 'Ligar o cabo', 'Configurar no terminal', 'Testar conexão'][d.state === 'new' ? 1 : d.state === 'link' ? 2 : 3] : 'Investigar a falha';
        h += '<li class="ops-item' + (x.kind === 'fault' ? ' is-fault' : '') + '"><div class="ops-item__head"><span class="dot' + (x.kind === 'fault' ? ' dot--warn dot--live' : ' dot--info') + '"></span><b>' + esc(x.title) + '</b></div>' +
          '<div class="ops-item__meta"><span class="ops-tag' + (x.kind === 'fault' || d.danificado ? ' is-warn' : '') + '">' + (x.kind === 'fault' ? 'Falha' : d.queimado ? 'Incêndio · +' + ((DL.CALOR && DL.CALOR.XP_EQUIPAMENTO) || 0) + ' XP' : d.danificado ? 'Danificado · +' + ((DL.BLACKOUT && DL.BLACKOUT.xpServidor) || 0) + ' XP' : 'Servidor novo') + '</span><span class="ops-item__where">' + esc(d.where) + '</span></div>' +
          '<p class="ops-item__now"><span>Agora</span>' + esc(now) + (care(d) ? ' · 📋 ' + esc(care(d)) : '') + '</p>';
        let more = '';
        if (x.kind === 'setup') {
          more += stepper(d);
          if (d.queimado) more += '<p>A peça já foi trocada. O fogo derreteu o cabo e apagou a configuração: ligue de novo a eth0 num switch e configure no terminal (interface, IP, rota).</p>';
          else if (d.danificado) more += '<p>O apagão queimou a configuração e soltou o cabo deste servidor: ligue de novo a eth0 num switch e configure no terminal (interface, IP, rota).</p>';
          if (d.state === 'new') more += '<p>' + esc(d.path && d.path.links.length ? d.path.reason : 'Todo servidor precisa de um cabo da eth0 até uma porta de switch (direto ou pelo patch panel).') + '</p>';
        } else more += '<p>Investigue: veja o host no Monitor, teste no terminal e confira o cabeamento.' + (x.by ? ' Avisado por ' + esc(x.by) + '.' : '') + '</p>';
        h += '<details class="ops-more" data-det="d' + d.key + '"><summary>Ver detalhes</summary>' + more + '</details>';
        h += '<div class="ops-item__actions">';
        if (d.state === 'new') h += '<button type="button" class="btn btn--sm btn--primary" data-op="cable" data-dev="' + d.key + '">Ligar cabos</button>';
        else h += '<button type="button" class="btn btn--sm btn--primary" data-op="term" data-dev="' + d.key + '">Abrir terminal</button>';
        if (x.kind === 'fault') h += '<button type="button" class="btn btn--sm" data-op="cable" data-dev="' + d.key + '">Cabeamento</button><button type="button" class="btn btn--sm" data-op="mon" data-dev="' + d.key + '">Monitor</button>';
        h += '<button type="button" class="btn btn--sm" data-op="show" data-dev="' + d.key + '">Mapa</button></div></li>';
      }
      el.list.innerHTML = h;
      if (el.count) el.count.textContent = n ? String(n) : '';
      DL.keepOpen.apply(el.list);
      el.log.innerHTML = O.log.slice(0, 10).map((l) => '<li class="is-' + l.tone + '"><span class="mono">' + l.t + '</span>' + esc(l.text) + '</li>').join('') || '<li class="m">Sem eventos ainda.</li>';
    }

    function toggle(force) {
      const on = force != null ? force : el.panel.hidden;
      el.panel.hidden = !on;
      el.btn.classList.toggle('is-on', on);
      el.btn.setAttribute('aria-expanded', on ? 'true' : 'false');
      if (on) render(true);
    }

    el.btn.addEventListener('click', () => { toggle(); el.btn.blur(); });
    el.panel.addEventListener('pointerdown', (ev) => ev.stopPropagation());
    el.panel.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-op]');
      if (b && b.dataset.op === 'close') { toggle(false); return; }
      if (b && b.dataset.op === 'prob') { b.blur(); if (game.problems) game.problems.act(+b.dataset.prob, b.dataset.act, b.dataset.who); return; }
      const d = b && O.devs.get(b.dataset.dev);
      if (!d) return;
      if (b.dataset.op === 'cable') sys.cabling.open(d.rack, d);
      else if (b.dataset.op === 'term') openTerminal(d);
      else if (b.dataset.op === 'mon') sys.monitor.open('host', d);
      else if (b.dataset.op === 'show') { game.focus(d.rack.px + 8, d.rack.py); game.flash(d.rack); }
      // a part burnt in a fire (incendio.js): call the technician, or swap it yourself
      else if ((b.dataset.op === 'tec' || b.dataset.op === 'troca') && DL.Fogo) DL.Fogo[b.dataset.op === 'tec' ? 'chamarTecnico' : 'trocarPeca'](d);
      b.blur();
    });

    function update(dt) {
      tick(dt);
      O.acc += dt;
      if (O.acc > 0.5) { O.acc = 0; resolveFixed(); render(); }
    }

    /* ------------------------------------------------------------------ */
    /* Performance: how much of its capacity each server can deliver       */
    /* ------------------------------------------------------------------ */
    // A server rends perf × net: its switch port may be slower than its card, and every switch shares
    // one uplink among its servers (each pushes ~half its card speed). Unmanaged switches lose a bit
    // to the lack of QoS.
    function netOf(d) {
      const m = DL.hwOf(d), t = d.path || trace(d);
      if (!t.ok) return { factor: 0, port: 0, uplink: 0, why: 'sem rede' };
      const sm = DL.hwOf(t.sw);
      const portF = Math.min(1, sm.port / m.nic);
      const demand = devices().filter((x) => x.kind === 'server' && x.state === 'online' && !x.fault && (x.path || trace(x)).sw === t.sw)
        .reduce((sum, x) => sum + DL.hwOf(x).nic * 0.5, 0);
      const upF = demand > 0 ? Math.min(1, sm.uplink / demand) : 1;
      const factor = (0.35 + 0.65 * portF) * (0.4 + 0.6 * upF) * (sm.managed === false ? 0.92 : 1);
      return { factor, port: portF, uplink: upF, load: sm.uplink ? demand / sm.uplink : 0, sw: t.sw,
        why: portF < 1 ? 'porta de ' + DL.hwFmt.gb(sm.port) + ' limita a placa de ' + DL.hwFmt.gb(m.nic) : upF < 1 ? 'uplink do ' + t.sw.name + ' saturado' : null };
    }
    // PoE: access points and cameras draw from the PoE budget of the switches in their room
    function poeStatus() {
      const w = world(), budget = new Map();
      for (const d of devices()) {
        if (d.kind !== 'switch' || !DL.hwOf(d).poe) continue;
        const r = roomOf(d.rack), k = r ? r.id : '?';
        budget.set(k, (budget.get(k) || 0) + DL.hwOf(d).poe);
      }
      const out = { ap: 0, camera: 0, off: 0, used: 0, total: Array.from(budget.values()).reduce((a, b) => a + b, 0) };
      for (const e of w.items) {
        if (e.kind !== 'ap' && e.kind !== 'camera') continue;
        const r = roomOf(e), k = r ? r.id : '?', need = DL.HW.poe[e.kind].poeW, left = budget.get(k) || 0;
        e.powered = left >= need;
        if (e.powered) { budget.set(k, left - need); out[e.kind]++; out.used += need; } else out.off++;
      }
      return out;
    }

    const api = {
      netOf, poeStatus, portsOf,
      reset, sync, update, devices, get, reach, health, trace, classify, openTerminal, inspect, monitor, report, announce, injectFault, toggle, tasks, fix, restore, configure, render,
      addLink, removeLink, moveEnd, linkAt, linkNear, tidy, prewire, roomOf, logEvent, recompute,
      // an address in 10.0.1.0/24 that no device uses (wrong / extra IPs that problems set up)
      freeIp() {
        const used = new Set(devices().map((d) => d.ip));
        for (let n = 0; n < 40; n++) { const ip = '10.0.1.' + (120 + Math.floor(rand() * 70)); if (!used.has(ip)) return ip; }
        return '10.0.1.199';
      },
      // build mode's undo (build.js): what the racks held before an action, and putting back what is missing —
      // a rack that returns keeps its servers (name, state, setup) and their cables; nothing made since is lost
      keep: () => ({ devs: new Map(O.devs), links: O.links.slice() }),
      merge(k) {
        if (!k) return;
        for (const [key, d] of k.devs) if (!O.devs.has(key)) O.devs.set(key, d);
        for (const l of k.links) if (O.links.indexOf(l) < 0) O.links.push(l);
      },
      get links() { return O.links; },
      switchesNear(d) {
        const r = roomOf(d.rack);
        return devices().filter((s) => s.kind === 'switch' && (s.rack === d.rack || (r && roomOf(s.rack) === r)));
      },
      get preinstall() { return O.preinstall; },
      set preinstall(v) { O.preinstall = v; },
      get openFaults() { return devices().filter((d) => d.fault && d.fault.found).length; },
      STATE_LABEL, PORTS, FAULTS,
    };
    return api;
  };
})();
