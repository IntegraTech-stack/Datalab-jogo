/* DataLab — career problems. problems-data.js holds lessons and problems as plain data (the shape the
   database will keep); this file turns them into terminal lessons and runs the problems in the game:
   sorts one out now and then for the player's rank, binds it to a real device (or rack), sets up what
   went wrong, lists it in Tarefas (T), and pays XP (career.js) when the player solves it.
   Checks are JSON read by a fixed list of probes — nothing from the data is ever executed. */
(function () {
  'use strict';
  const DL = window.DL;
  const DATA = DL.SCENARIO_DATA;
  const rand = Math.random;
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const between = (a, b) => a + rand() * (b - a);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const GW = '10.0.1.1';
  let OPS = null; // the running game's ops (switch.near needs it)
  let WORLD = null; // () → the running game's world (what was built)
  let CREW = null; // the running game's crew (orders given)
  // the server specialisations and VMs (infra.js, created after the problems)
  const INFRA = () => (window.DataLabDemo && window.DataLabDemo.infra) || null;
  const upNow = (d) => !!OPS && d.kind === 'server' && d.state === 'online' && !d.fault && OPS.health(d).up;
  // the Linux parts of a server (terminal.js), null on Windows / switches
  const lx = (d) => (d && d.kind === 'server' && d.os && !(DL.isWin && DL.isWin(d)) && DL.linuxSys ? DL.linuxSys(d) : null);
  const dp = (d) => (lx(d) && DL.linuxDeep ? DL.linuxDeep(d) : null);
  const low = (s) => String(s == null ? '' : s).toLowerCase();
  const win = (d) => (d && d.os && d.os.win) || null;
  const ipCmp = (a, b) => +a.split('.').pop() - +b.split('.').pop();
  // a problem that breaks something when it starts (setup.fault or setup.faults)
  const breaks = (def) => !!(def && def.setup && (def.setup.fault || def.setup.faults));
  DL.problemBreaks = breaks;

  /* ------------------------------------------------------------------ */
  /* Templates: {{dev.ip}} · {{rack.id}} · {{gw}} · lesson vars          */
  /* ------------------------------------------------------------------ */
  const look = (env, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), env);
  const tpl = (s, env) => String(s).replace(/\{\{\s*([\w.]+)\s*\}\}/g, (m, k) => { const v = look(env, k); return v == null ? '' : String(v); });
  // every string inside a JSON value
  function fill(v, env) {
    if (typeof v === 'string') return tpl(v, env);
    if (Array.isArray(v)) return v.map((x) => fill(x, env));
    if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = fill(v[k], env); return o; }
    return v;
  }
  // what a template knows about a device or a rack
  function envOf(x) {
    const env = { gw: GW };
    if (!x) return env;
    if (x.kind === 'rack') { env.rack = { id: x.id }; return env; }
    env.dev = { name: x.name, ip: x.ip, host: String(x.name).toLowerCase() };
    env.rack = { id: x.rack ? x.rack.id : '' };
    return env;
  }
  // another device of the problem ({{peer.name}}, {{sw.ip}}, {{r2.id}}…)
  const envOfOther = (e) => (e.kind === 'rack' ? { id: e.id, name: e.id } : { name: e.name, ip: e.ip, host: String(e.name).toLowerCase() });

  /* ------------------------------------------------------------------ */
  /* Checks                                                              */
  /* ------------------------------------------------------------------ */
  // every state a check may read: (device or rack, argument) → value
  const PROBES = {
    'eth0.up': (d) => !!(d.os && d.os.ifaces.eth0.up),
    'eth0.ip': (d) => !!(d.os && d.os.ifaces.eth0.ips.indexOf(d.ip + '/24') >= 0),
    route: (d) => (d.os ? d.os.route : null),
    cable: (d) => !!(d.os && d.os.cable),
    service: (d, name) => (d.os ? d.os.services[name] : null),
    disk: (d) => (d.os ? d.os.disk : null),
    'disk.pct': (d) => (d.os ? Math.round(d.os.disk) : null),
    'hw.cores': (d) => { const m = DL.hwOf ? DL.hwOf(d) : null; return m && m.cores != null ? m.cores : null; },
    hostname: (d) => (d.os ? d.os.hostname : null),
    state: (d) => d.state,
    fault: (d) => (d.fault ? d.fault.type : null),
    'sw.mode': (d) => (d.sw ? d.sw.mode : null),
    'sw.cur': (d) => (d.sw ? d.sw.cur : null),
    'sw.bad': (d) => (d.sw ? d.sw.bad : null),
    'sw.port': (d, port) => (d.sw ? d.sw.ports[port] : null),
    'sw.healed': (d, port) => !!d.sw && (d.sw.fixed || (d.sw.bad !== port && d.sw.ports[port] !== 'err-disabled' && d.sw.ports[port] !== 'disabled')),
    'switch.near': (d) => !!OPS && OPS.switchesNear(d).some((s) => !s.model || s.model.managed !== false),
    // a server plugged straight into this switch (no patch panel: show interfaces status names it) → { name, port }
    'sw.direct': (sw) => {
      const list = direct(sw);
      if (!list.length) return null;
      const [d, t] = pick(list);
      return { name: d.name, port: t.port, ip: d.ip, mac: d.os ? d.os.ifaces.eth0.mac : '' };
    },
    // the switch port at the other end of the eth0 cable — even with a plug out (the port it belongs in)
    'cable.port': (d) => {
      if (!OPS || d.kind !== 'server') return null;
      const l = OPS.linkNear(d.key, 'eth0');
      return l ? (l.a.dev === d.key ? l.b.port : l.a.port) : null;
    },
    // two different ones → { a: { name, port }, b: { name, port } }
    'sw.pair': (sw) => {
      const list = direct(sw);
      if (list.length < 2) return null;
      const i = Math.floor(rand() * list.length), j = (i + 1 + Math.floor(rand() * (list.length - 1))) % list.length;
      return { a: { name: list[i][0].name, port: list[i][1].port }, b: { name: list[j][0].name, port: list[j][1].port } };
    },
    // how many ports are in a state (connected, notconnect…) · the port shut down by hand · the one changed without saving
    'sw.count': (d, st) => (d.sw ? Object.values(d.sw.ports).filter((s) => s === st).length : null),
    'sw.off': (d) => (d.sw ? d.sw.off || null : null),
    'sw.unsavedPort': (d) => (d.sw ? d.sw.unsavedPort || null : null),
    'hw.ram': (d) => { const m = DL.hwOf ? DL.hwOf(d) : null; return m && m.ram != null ? m.ram : null; },
    // the addresses of eth0: has this one (10.0.1.12 or 10.0.1.12/24) · how many · the wrong / extra one a fault put there
    'eth0.has': (d, ip) => !!(d.os && ip && d.os.ifaces.eth0.ips.indexOf(String(ip).indexOf('/') < 0 ? ip + '/24' : String(ip)) >= 0),
    'eth0.n': (d) => (d.os ? d.os.ifaces.eth0.ips.length : null),
    'os.badIp': (d) => (d.os && d.os.badIp) || null,
    'os.extraIp': (d) => (d.os && d.os.extraIp) || null,
    // what the logs show (terminal.js): failed SSH passwords · the last login's IP · who stopped a service
    'auth.failed': (d) => (d.os && d.os.authlog ? d.os.authlog.filter((l) => l.indexOf('Failed password') >= 0).length : null),
    'auth.last': (d) => (d.os && d.os.lastLogin) || null,
    'auth.stopper': (d) => (d.os && d.os.stopper) || null,
    'uptime.h': (d) => (d.os ? Math.round((Date.now() - d.os.boot) / 3600000) : null),
    'flap.n': (d) => (d.os && d.os.flaps) || null,
    // the layer of a fault, in the player's words (cabo / interface) — and the other way of saying it
    'fault.layer': (d) => (d.fault ? { cable: 'cabo', link: 'interface' }[d.fault.type] || null : null),
    'fault.layer2': (d) => (d.fault ? { cable: 'fisica', link: 'configuracao' }[d.fault.type] || null : null),
    // the server whose name this one took
    'hostname.dup': (d) => (d.os && d.os.dupOf) || null,
    // what was built (world items by catalog id, comma-separated; wall devices only when PoE powers them)
    items: (x, ids) => {
      if (!WORLD) return null;
      const want = String(ids || '').split(',');
      return WORLD().items.filter((e) => want.indexOf(e.defId || e.kind) >= 0 && e.powered !== false).length;
    },
    // devices of a kind (server, switch) or a model (sw_48, srv_adv…)
    devs: (x, what) => (OPS ? OPS.devices().filter((d) => d.kind === what || (d.model && d.model.id === what)).length : null),
    // servers on the network through a switch of this model
    'on.model': (x, model) => (OPS ? OPS.devices().filter((d) => { if (d.kind !== 'server') return false; const t = d.path || OPS.trace(d); return t.ok && t.sw.model && t.sw.model.id === model; }).length : null),
    // an address to check before using it: half the time one a server already has → { ip, used: 'sim' | 'nao' }
    'ip.cand': () => {
      if (!OPS) return null;
      const on = OPS.devices().filter((d) => d.kind === 'server' && d.state === 'online' && OPS.health(d).up);
      if (on.length && rand() < 0.5) return { ip: pick(on).ip, used: 'sim' };
      return { ip: OPS.freeIp(), used: 'nao' };
    },
    // a server online and answering (right now: the fault record clears a moment later) · with its site up and room on the disk
    up: (d) => !!OPS && d.kind === 'server' && d.state === 'online' && OPS.health(d).up,
    // (health().http: nginx running and, with the firewall on, port 80 let in)
    'ok.web': (d) => !!OPS && d.kind === 'server' && d.state === 'online' && OPS.health(d).http && d.os.disk < 80,
    // Linux (terminal.js DL.linuxSys): firewall · accounts · files · packages · backups · cron
    'fw.on': (d) => !!lx(d) && lx(d).fw.on,
    'fw.allows': (d, port) => !!lx(d) && lx(d).fw.on && DL.fwAllows(d.os, port),
    'fw.denies': (d, ip) => !!lx(d) && lx(d).fw.on && lx(d).fw.rules.some((r) => r.act === 'deny' && r.from && r.from.split('/')[0] === ip),
    'user.exists': (d, u) => !!lx(d) && !!lx(d).users[u],
    // 'usuário:grupo'
    'user.in': (d, a) => { const [u, g] = String(a).split(':'), x = lx(d) && lx(d).users[u]; return !!x && x.groups.indexOf(g) >= 0; },
    'user.locked': (d, u) => !!lx(d) && !!lx(d).users[u] && !!lx(d).users[u].locked,
    'file.mode': (d, p) => (lx(d) && lx(d).files[p] ? lx(d).files[p].mode : null),
    'file.owner': (d, p) => (lx(d) && lx(d).files[p] ? lx(d).files[p].owner : null),
    'file.group': (d, p) => (lx(d) && lx(d).files[p] ? lx(d).files[p].group : null),
    'apt.pending': (d) => (lx(d) ? lx(d).updates.length : null),
    pkg: (d, name) => (lx(d) && lx(d).pkgs[name]) || null,
    // the updated nginx is the one running (restarted after apt upgrade)
    'nginx.fresh': (d) => !!d.os && !d.os.nginxStale,
    // an archive made from this folder (tar czf … <pasta>)
    'backup.of': (d, src) => !!lx(d) && Object.values(lx(d).files).some((f) => f.from === src),
    // the cron line that runs a script: its minute and hour ("0 2") · it is there at all
    'cron.at': (d, script) => { const l = lx(d) && lx(d).cron.find((x) => x.split(/\s+/).slice(5).join(' ').indexOf(script) >= 0); return l ? l.split(/\s+/).slice(0, 2).join(' ') : null; },
    'cron.has': (d, script) => !!lx(d) && lx(d).cron.some((x) => x.indexOf(script) >= 0),
    // the IP a leaked account logged in from
    'auth.leak': (d) => (d.os && d.os.leakIp) || null,
    // Especialista / Tech Lead (terminal.js DL.linuxDeep): processes · RAID · disks · certificate · nginx config ·
    // memory · GPU · database · files · clock · app errors · route · temperatures · UPS
    'proc.count': (d, txt) => (dp(d) ? dp(d).procs.filter((p) => p.cmd.indexOf(txt) >= 0).length : null),
    'proc.top': (d) => { const o = dp(d); if (!o) return null; const p = o.procs.slice().sort((x, y) => y.cpu - x.cpu)[0]; return p ? p.pid : null; },
    'raid.state': (d) => (dp(d) ? DL.raidState(d) : null),
    'raid.has': (d, disk) => !!dp(d) && ['active', 'rebuilding'].indexOf(dp(d).raid.devs[disk]) >= 0,
    // the disk is still part of the array (active, faulty or rebuilding)
    'raid.in': (d, disk) => !!dp(d) && !!dp(d).raid.devs[disk],
    'raid.bad': (d) => { const o = dp(d); return o ? Object.keys(o.raid.devs).find((k) => o.raid.devs[k] === 'faulty') || null : null; },
    'smart.bad': (d) => { const o = dp(d); return o ? Object.keys(o.smart).find((k) => o.smart[k] !== 'PASSED') || null : null; },
    'cert.days': (d) => (dp(d) ? Math.floor((dp(d).cert.until - Date.now()) / 86400000) : null),
    // renewed (more than 30 days left) and loaded by nginx
    'cert.live': (d) => !!dp(d) && dp(d).cert.live && dp(d).cert.until - Date.now() > 30 * 86400000,
    'nginx.conf': (d) => !!dp(d) && !DL.nginxBad(d),
    'sw.duplexOk': (d, p) => !!d.sw && !(d.sw.duplex && d.sw.duplex[p]) && !(d.sw.speed && d.sw.speed[p]),
    swap: (d) => (dp(d) ? dp(d).swap || 0 : null),
    'gpu.temp': (d) => (dp(d) ? dp(d).gpuTemp || 62 : null),
    'db.conns': (d) => (DL.dbOf && dp(d) && DL.dbOf(d) ? DL.dbOf(d).conns : null),
    'db.restored': (d) => !!(DL.dbOf && dp(d) && DL.dbOf(d) && DL.dbOf(d).restored),
    'file.exists': (d, p) => !!dp(d) && !!dp(d).files[p],
    // 'path|texto': a line of the file has that text
    'file.has': (d, a) => { const [p, txt] = String(a).split('|'), f = dp(d) && dp(d).files[p]; return !!f && !!f.text && f.text.some((l) => l.indexOf(txt) >= 0); },
    'ntp.on': (d) => !!dp(d) && dp(d).ntp && !dp(d).clockOff,
    'app.code': (d) => (dp(d) && dp(d).appCode) || null,
    // the last hop of traceroute that answers (the provider breaks after it)
    'trace.last': (d) => { const o = dp(d); return o && o.hopFail ? ['10.0.1.1', '189.45.0.1', '189.45.12.66', '200.230.0.9'][o.hopFail - 2] : null; },
    'rogue.user': (d) => (dp(d) && dp(d).rogueUser) || null,
    'cpu.temp': (d) => (dp(d) ? dp(d).cpuTemp || 48 : null),
    'ups.min': (d) => (dp(d) && dp(d).ups ? Math.round(dp(d).ups.runtime / 60) : null),
    // VMs by name prefix ('prefixo:status', status may be empty)
    vmsNamed: (x, a) => { const [pre, st] = String(a).split(':'); return INFRA() ? INFRA().vms.filter((v) => v.name.indexOf(pre) === 0 && (!st || v.status === st)).length : null; },
    // switch VLANs (terminal.js DL.swVlans): a VLAN's name · a port's access VLAN · its mode · a trunk carries a VLAN ('porta:vlan')
    'sw.vlan': (d, id) => (d.sw && d.sw.vlans ? d.sw.vlans[id] || null : null),
    'sw.portVlan': (d, p) => (d.sw ? (d.sw.pvlan && d.sw.pvlan[p]) || 10 : null),
    'sw.portMode': (d, p) => (d.sw ? (d.sw.pmode && d.sw.pmode[p]) || 'access' : null),
    'sw.trunkHas': (d, a) => { const [p, v] = String(a).split(':'); return !!d.sw && !!d.sw.pmode && d.sw.pmode[p] === 'trunk' && (!d.sw.trunk[p] || d.sw.trunk[p].indexOf(+v) >= 0); },
    // a free port (no cable, in VLAN 10), counting down from the last one: 0 = the last free port
    'sw.free': (d, i) => { if (!d.sw) return null; const free = Object.keys(d.sw.ports).filter((p) => d.sw.ports[p] === 'notconnect' && (!d.sw.pvlan || !d.sw.pvlan[p]) && (!d.sw.pmode || d.sw.pmode[p] !== 'trunk')); return free[free.length - 1 - (+i || 0)] || null; },
    // some switch has this VLAN with this name ('id:NOME')
    'vlan.any': (x, a) => { const [id, nm] = String(a).split(':'); return !!OPS && OPS.devices().some((d) => d.sw && d.sw.vlans && low(d.sw.vlans[id]) === low(nm)); },
    // the whole datacenter: servers up · alerts open
    'up.count': () => (OPS ? OPS.devices().filter(upNow).length : null),
    'faults.count': () => (OPS ? OPS.devices().filter((d) => d.fault && d.fault.found).length : null),
    // a fault in the player's words
    'fault.word': (d) => (d.fault ? { service: 'servico', link: 'interface', disk: 'disco', cable: 'cabo', disksvc: 'disco', port: 'porta', portoff: 'porta', badroute: 'rota', noroute: 'rota' }[d.fault.type] || null : null),
    // specialisations (infra.js): servers with one · one provided somewhere · servers with one and everything it needs ·
    // 'type,model': servers of that model with it
    svcs: (x, type) => (OPS ? OPS.devices().filter((d) => d.kind === 'server' && d.svc === type).length : null),
    provided: (x, type) => !!INFRA() && INFRA().provided(type),
    'svc.ok': (x, type) => (OPS && INFRA() ? OPS.devices().filter((d) => d.kind === 'server' && d.svc === type && upNow(d) && !INFRA().needsOf(d).length).length : null),
    'svc.model': (x, a) => { const [type, model] = String(a).split(','); return OPS ? OPS.devices().filter((d) => d.kind === 'server' && d.svc === type && d.model && d.model.id === model).length : null; },
    // VMs ('svc:status', either may be empty) · a node: RAM promised to its VMs (%) · cores still free
    vms: (x, a) => { const [svc, st] = String(a || '').split(':'); return INFRA() ? INFRA().vms.filter((v) => (!svc || v.svc === svc) && (!st || v.status === st)).length : null; },
    'node.alloc': (d) => { const I = INFRA(); if (!I || d.kind !== 'server') return null; const ram = I.vms.filter((v) => v.node === d.key && v.status !== 'stopped').reduce((s, v) => s + v.ram, 0); return Math.round((ram / I.capOf(d).ram) * 100); },
    'node.freeCores': (d) => { const I = INFRA(); if (!I || d.kind !== 'server') return null; return I.capOf(d).cores - I.vms.filter((v) => v.node === d.key && v.status !== 'stopped').reduce((s, v) => s + v.cores, 0); },
    // orders given to the team (crew.js) · since a number read when the problem started
    orders: () => (CREW ? CREW.assignedCount || 0 : 0),
    ordersSince: (x, base) => (CREW ? CREW.assignedCount || 0 : 0) - (+base || 0),
    // Windows Server (winserver.js keeps it in d.os.win; its problem states are added there)
    'win.named': (d) => !!win(d) && low(win(d).host) === low(d.name) && !win(d).pending.name,
    'win.has': (d, f) => !!win(d) && win(d).features.indexOf(f) >= 0,
    'win.iis': (d) => (win(d) ? (win(d).features.indexOf('Web-Server') >= 0 ? 'sim' : 'nao') : null),
    'win.dnsself': (d) => !!win(d) && win(d).dnsClient.some((ip) => ip === '127.0.0.1' || ip === d.ip),
    'win.rebootBy': (d) => (win(d) && win(d).rebootBy) || null,
    'win.domain': (d) => (win(d) && win(d).domain ? win(d).domain.name : null),
    'rack.tidy': (e) => e.tidy !== false && e.cableLook === 'tidy',
    'sw.saved': (d) => !!d.sw && !d.sw.unsaved,
    // the switch port at the other end of a server's cable
    'srv.port': (d) => { const t = OPS && d.kind === 'server' ? d.path || OPS.trace(d) : null; return t && t.ok ? t.port : null; },
    // the IP guessing SSH passwords (terminal.js DL.authAttack)
    'auth.attacker': (d) => (d.os && d.os.attacker) || null,
    // one service listening on this server → { name (the process ss shows), port }
    'svc.listen': (d) => {
      if (!d.os) return null;
      const list = [];
      if (d.os.services.nginx === 'active') list.push({ name: 'nginx', port: '80' });
      if (d.os.services.ssh === 'active') list.push({ name: 'sshd', port: '22' });
      return list.length ? pick(list) : null;
    },
  };
  // the servers plugged straight into a switch → [server, trace]
  function direct(sw) {
    if (!OPS || !sw || sw.kind !== 'switch') return [];
    return OPS.devices().filter((d) => d.kind === 'server').map((d) => [d, d.path || OPS.trace(d)]).filter(([, t]) => t.ok && t.sw === sw && t.links.length === 1);
  }
  // the other devices a problem may involve (data: devices: { role: resolver }), found from its main one;
  // taken: the ones the problem already has (two "server.peer" are two different servers)
  const RESOLVE = {
    // the switch at the other end of the server's cable (managed — it has a console — and working)
    'switch.of': (x) => {
      if (!OPS || !x || x.kind !== 'server') return null;
      const t = x.path || OPS.trace(x);
      return t.ok && t.sw && !t.sw.broken && !(t.sw.model && t.sw.model.managed === false) ? t.sw : null;
    },
    // another Linux server that is online and fine
    'server.peer': (x, taken) => {
      if (!OPS) return null;
      const list = OPS.devices().filter((d) => d.kind === 'server' && (taken || []).indexOf(d) < 0 && d.state === 'online' && !(DL.isWin && DL.isWin(d)) &&
        !d.hold && !d.fault && !d.broken && !d.out && OPS.health(d).up);
      return list.length ? pick(list) : null;
    },
    // another server on the same switch as this one (straight cable)
    'server.sameSwitch': (x, taken) => {
      if (!OPS || !x || x.kind !== 'server') return null;
      const t = x.path || OPS.trace(x);
      if (!t.ok) return null;
      const list = direct(t.sw).map(([d]) => d).filter((d) => d !== x && (taken || []).indexOf(d) < 0 && !(DL.isWin && DL.isWin(d)) && !d.hold && upNow(d));
      return list.length ? pick(list) : null;
    },
    // another managed switch that works
    'switch.other': (x, taken) => {
      if (!OPS) return null;
      const list = OPS.devices().filter((d) => d.kind === 'switch' && (taken || []).indexOf(d) < 0 && !(d.model && d.model.managed === false) && !d.broken && !d.out && !d.hold && !d.fault);
      return list.length ? pick(list) : null;
    },
    // the domain controller (a Windows Server with the domain, online)
    'win.dc': (x, taken) => {
      if (!OPS) return null;
      const list = OPS.devices().filter((d) => (taken || []).indexOf(d) < 0 && win(d) && win(d).stage === 'ready' && win(d).domain && !d.hold && upNow(d));
      return list.length ? pick(list) : null;
    },
    // another rack with cables
    'rack.other': (x, taken) => {
      if (!WORLD) return null;
      const list = WORLD().items.filter((e) => e.kind === 'rack' && e.units && e.cableLook && !e.hold && (taken || []).indexOf(e) < 0);
      return list.length ? pick(list) : null;
    },
  };
  // values read once (lesson vars / problem vars). A var is 'probe' · 'probe:arg' · 'probe@role' (another device
  // of the problem) · 'max:probe' (the name of the device with the highest value) · 'sum:probe' · 'ips:role,role'
  // (their IPs, sorted) · 'faulty:type' / 'faultyRole:type' (the device with that fault: its name / its role).
  // devs: { dev, ...the others }
  function readVars(vars, x, devs) {
    const out = {};
    for (const k of Object.keys(vars || {})) out[k] = readVar(String(vars[k]), x, devs);
    return out;
  }
  function readVar(spec, x, devs) {
    const all = (devs ? Object.values(devs) : [x]).filter((d) => d && d.kind !== 'rack');
    let m = /^(max|maxRole|sum):([\w.]+)$/.exec(spec);
    if (m) {
      // max: the name of the device with the highest value · maxRole: its role in the problem (for check.at)
      const p = PROBES[m[2]], vals = p ? all.map((d) => [d, p(d)]).filter(([, v]) => typeof v === 'number') : [];
      if (!vals.length) return null;
      if (m[1] === 'sum') return vals.reduce((a, [, v]) => a + v, 0);
      const top = vals.sort((a, b) => b[1] - a[1])[0][0], by = devs || { dev: x };
      return m[1] === 'max' ? top.name : Object.keys(by).find((r) => by[r] === top) || null;
    }
    if ((m = /^ips:([\w,]+)$/.exec(spec))) return m[1].split(',').map((r) => devs && devs[r]).filter(Boolean).map((d) => d.ip).sort(ipCmp).join(', ');
    if ((m = /^faulty(Role|Kind)?(?::(\w+))?$/.exec(spec))) {
      // the name of the device with that fault (or any fault) · faultyRole: its role in the problem (for check.at) ·
      // faultyKind: 'servidor' or 'switch'
      const d = all.find((q) => q.fault && (!m[2] || q.fault.type === m[2])), by = devs || { dev: x };
      if (!d) return null;
      return m[1] === 'Role' ? Object.keys(by).find((r) => by[r] === d) || null : m[1] === 'Kind' ? (d.kind === 'switch' ? 'switch' : 'servidor') : d.name;
    }
    // the names of the crew roles that fix the fault the problem set up (jobs.js), one per index
    if ((m = /^faultRole:(\d)$/.exec(spec))) {
      const d = all.find((q) => q.fault);
      if (!d || !DL.JOBS || !DL.ROLES) return null;
      const ids = Object.keys(DL.JOBS.BY_ROLE).filter((r) => DL.ROLES[r] && DL.JOBS.BY_ROLE[r].some((t) => t.kind === 'fix' && t.types.indexOf(d.fault.type) >= 0));
      return ids[+m[1]] ? DL.ROLES[ids[+m[1]]].name : null;
    }
    m = /^([\w.]+)(?::([^@]+))?(?:@(\w+))?$/.exec(spec);
    if (!m || !PROBES[m[1]]) return null;
    const on = m[3] ? devs && devs[m[3]] : x;
    return on ? PROBES[m[1]](on, m[2]) : null;
  }

  /* ------------------------------------------------------------------ */
  /* Answers: what the player typed against what the step accepts        */
  /* ------------------------------------------------------------------ */
  const NORM = {
    // 10.0.1.12/24 → 10.0.1.12
    ip: (s) => s.replace(/\s+/g, '').replace(/\/\d+$/, '').toLowerCase(),
    // Gi0/3 · gi 0/3 · GigabitEthernet0/3 · g0/3 · 0/3 → gi0/3
    port: (s) => { const t = s.replace(/\s+/g, '').toLowerCase(), m = /^([a-z]*)(\d+\/\d+)$/.exec(t); return m && 'gigabitethernet'.indexOf(m[1]) === 0 ? 'gi' + m[2] : t; },
    // "12 núcleos" · "84%" → 12 · 84
    int: (s) => { const m = /-?\d+(?:[.,]\d+)?/.exec(s); return m ? parseFloat(m[0].replace(',', '.')) : NaN; },
    text: (s) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' '),
  };
  DL.checkAnswer = function (ans, value) {
    const n = NORM[ans.normalize] || NORM.text, got = n(String(value || ''));
    return (ans.accept || []).some((a) => {
      const want = n(String(a));
      if (ans.normalize === 'int') return !isNaN(got) && !isNaN(want) && Math.abs(got - want) <= (ans.tol || 0);
      return want !== '' && got === want;
    });
  };
  const warned = new Set();
  // devs: the devices of the problem by role ({ dev, peer… }) — { at: 'peer', state: … } checks the state of another
  // one (the role often comes from a var: the server that got the fault)
  function test(c, x, ran, devs) {
    if (!c) return false;
    if (c.any) return c.any.some((k) => test(k, x, ran, devs));
    if (c.all) return c.all.every((k) => test(k, x, ran, devs));
    if (c.not) return !test(c.not, x, ran, devs);
    if (c.at) return !!devs && !!devs[c.at] && test(Object.assign({}, c, { at: null }), devs[c.at], null, devs);
    if (c.ran != null) return !!ran && ran.has(c.ran);
    if (c.bound != null) return !!x === !!c.bound;
    if (c.state) {
      const p = PROBES[c.state];
      if (!p) { if (!warned.has(c.state)) { warned.add(c.state); console.warn('problems: estado desconhecido', c.state); } return false; }
      if (!x) return false;
      const v = p(x, c.arg);
      if ('eq' in c) return v === c.eq;
      if ('ne' in c) return v !== c.ne;
      if ('lt' in c) return v < c.lt;
      if ('gt' in c) return v > c.gt;
      if (c.in) return c.in.indexOf(v) >= 0;
      if (c.notIn) return c.notIn.indexOf(v) < 0;
      return !!v;
    }
    return false;
  }

  // a lesson definition + the device it opens on → what terminal.js runs ({ title, goal, steps[].done })
  // vars: values already read (a problem reads its own when it starts); the rest are read now
  // an answer step is done once the terminal reports 'answer:<its index>' (terminal.js checks the value)
  // devs: a problem on more than one device ({ dev, sw }) — each step happens on its own (step.device, default
  // dev) and is checked there, with what was typed on that device's console ('on' tells the terminal where)
  function compileLesson(def, x, vars, devs) {
    const main = devs && devs.dev ? devs.dev : x, key = 'p:' + def.id, list = devs ? Object.values(devs).filter(Boolean) : [];
    const env = Object.assign(envOf(main), vars || readVars(def.vars, main));
    for (const r of Object.keys(devs || {})) if (r !== 'dev' && devs[r]) env[r] = envOfOther(devs[r]);
    return {
      title: tpl(def.title, env),
      goal: tpl(def.goal || def.summary || '', env),
      steps: (def.steps || []).map((s, k) => {
        // device 'any': the step is done from whichever console the player is on
        const on = devs && s.device !== 'any' ? devs[s.device || 'dev'] : undefined;
        // auto: what the dev auto-play types for this step (never shown to the player)
        const base = { text: tpl(s.text, env), help: s.help || [], cmd: s.cmd ? tpl(s.cmd, env) : undefined, auto: s.auto ? tpl(s.auto, env) : undefined, action: s.action, on };
        if (s.type === 'answer') {
          const a = fill(s.answer || {}, env);
          // (answered on any console of the problem: it stays answered on the others)
          const said = (d, ran) => (!!ran && ran.has('answer:' + k)) || list.some((q) => q !== d && q.lessonKey === key && q.ran && q.ran.has('answer:' + k));
          return Object.assign(base, { answer: { accept: (a.accept || []).map(String).filter((v) => v !== ''), normalize: a.normalize || 'text', tol: a.tol || 0 }, done: said });
        }
        const check = fill(s.check, env);
        // on another device: its state, and what was typed on its console for this same lesson
        const done = on ? (d, ran) => test(check, on, on === d ? ran : on.lessonKey === key ? on.ran : null, devs) : (d, ran) => test(check, d, ran, devs);
        return Object.assign(base, { done });
      }),
    };
  }
  DL.compileLesson = compileLesson;
  // (for automated checks of the data: which states / resolvers exist)
  DL.SCENARIO_PROBES = PROBES;
  DL.SCENARIO_RESOLVE = RESOLVE;

  // the vars / devices of the open problem on a device (set by the running game)
  let varsOf = () => null, devsOf = () => null;
  // the lessons ops.js opens for faults / new servers, and one per console problem ('p:<id>')
  function registerLessons() {
    for (const k of Object.keys(DL.LESSONS)) if (k.indexOf('p:') === 0) delete DL.LESSONS[k];
    for (const k of Object.keys(DATA.lessons)) DL.LESSONS[k] = (d) => compileLesson(DATA.lessons[k], d);
    for (const p of DATA.problems) if (p.complete === 'lesson') DL.LESSONS['p:' + p.id] = (d) => compileLesson(p, d, varsOf(p.id, d), devsOf(p.id, d));
  }
  registerLessons();

  /* ------------------------------------------------------------------ */
  /* Data from the database (services/scenario-service.js)              */
  /* The bundled copy above is the default (offline play); online, the  */
  /* tables replace it. Anything that doesn't look right is left out:   */
  /* the bundled lesson / problem / rank stays.                          */
  /* ------------------------------------------------------------------ */
  const KINDS = ['server', 'switch', 'rack'], COMPLETE = ['lesson', 'fixed', 'online', 'steps'], NORMS = ['ip', 'port', 'int', 'text'];
  const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const okStep = (s) => isObj(s) && typeof s.text === 'string' && (!s.help || (Array.isArray(s.help) && s.help.every((k) => DL.CMD_HELP[k]))) && (!s.device || /^[a-z0-9]{2,8}$/.test(s.device)) && (!s.auto || typeof s.auto === 'string') &&
    (s.type === 'answer' ? isObj(s.answer) && Array.isArray(s.answer.accept) && s.answer.accept.length && (!s.answer.normalize || NORMS.indexOf(s.answer.normalize) >= 0) : isObj(s.check));
  const okLesson = (l) => isObj(l) && typeof l.title === 'string' && Array.isArray(l.steps) && l.steps.length > 0 && l.steps.every(okStep);
  const okProblem = (p) => isObj(p) && /^[a-z0-9_]{2,40}$/.test(p.id) && typeof p.title === 'string' && typeof p.rank === 'string' && p.xp > 0 &&
    COMPLETE.indexOf(p.complete) >= 0 && isObj(p.target) && KINDS.indexOf(p.target.kind) >= 0 &&
    (!p.devices || (isObj(p.devices) && Object.keys(p.devices).every((r) => /^[a-z0-9]{2,8}$/.test(r) && r !== 'dev' && RESOLVE[p.devices[r]]))) &&
    (p.complete === 'lesson' || p.complete === 'steps' ? Array.isArray(p.steps) && p.steps.length > 0 && p.steps.every(okStep) : true);
  DL.applyScenarioData = function (next, source) {
    if (!isObj(next)) return false;
    let n = 0;
    if (isObj(next.help)) for (const k of Object.keys(next.help)) {
      const h = next.help[k];
      if (isObj(h) && typeof h.cmd === 'string' && typeof h.ex === 'string' && typeof h.what === 'string' && typeof h.when === 'string') { DL.CMD_HELP[k] = { cmd: h.cmd, ex: h.ex, what: h.what, when: h.when }; n++; }
    }
    if (isObj(next.lessons)) for (const k of Object.keys(next.lessons)) if (okLesson(next.lessons[k])) { DATA.lessons[k] = next.lessons[k]; n++; }
    if (Array.isArray(next.ranks) && next.ranks.length && next.ranks.every((r) => isObj(r) && typeof r.id === 'string' && r.level >= 1)) { DATA.ranks = next.ranks; n++; }
    if (Array.isArray(next.problems)) {
      const good = next.problems.filter((p) => okProblem(p) && DATA.ranks.some((r) => r.id === p.rank));
      if (good.length) { DATA.problems = good; n += good.length; }
      if (good.length < next.problems.length) console.warn('problems: ' + (next.problems.length - good.length) + ' problema(s) do banco ignorado(s) (formato inválido)');
    }
    if (!n) return false;
    DATA.source = source || 'db';
    registerLessons();
    return true;
  };

  /* ------------------------------------------------------------------ */
  /* Problems in the game                                                */
  /* ------------------------------------------------------------------ */
  const PACE = {
    first: 40,              // game minutes before the first one (a session that just started)
    gapHome: [80, 140],     // between problems at the player's own rank
    gapUp: [260, 420],      // problems of a lower rank, for someone above it
    maxHome: 2, maxUp: 1,   // open at the same time (the player's own new servers don't count)
    faultHome: 0.02,        // chance per check (every half minute) to take an open incident slot: ~70% of the
    faultUp: 0.004,         // incidents at the player's own rank, few above it
    hold: 240,              // above the problem's rank: the crew leaves it to the player this long
    expire: 900,            // above the problem's rank: a console / checklist problem left untouched goes away
  };
  const DIFF = { 1: 'fácil', 2: 'médio', 3: 'difícil', 4: 'muito difícil', 5: 'especialista' };
  // the player's share of the XP when a crew member they assigned solves it (the server uses the same: career_settle)
  const CREW_SHARE = 0.15;
  DL.PROBLEM_PACE = PACE;

  DL.createProblems = function (game, sys) {
    const ops = sys.ops, scene = game.scene;
    OPS = ops;
    WORLD = () => scene.world;
    CREW = sys.crew || null;
    // looked up each time: the data may come from the database after the game started (scenario-service.js)
    const byId = (id) => DATA.problems.find((p) => p.id === id);
    const levelOf = (def) => { const r = DATA.ranks.find((x) => x.id === def.rank); return r ? r.level : 1; };
    const playerLevel = () => (sys.career ? sys.career.level : 1);
    const rankName = (def) => { const L = sys.career && sys.career.LEVELS[levelOf(def) - 1]; return L ? L.rank.name : def.rank; };
    const now = () => scene.t;
    const P = { open: [], seq: 0, next: PACE.first, acc: 0 };

    // extra rules a problem may name (data: when)
    const WHEN = {
      // no server yet, or one of the player's own still without its cable
      firstServer: () => { const s = ops.devices().filter((d) => d.kind === 'server'); return !s.length || s.some((d) => !d.pre && d.state === 'new'); },
      // a Web/API server is up, and nothing provides DNS for it
      webNoDns: () => !!INFRA() && ops.devices().some((d) => d.svc === 'web' && upNow(d)) && !INFRA().provided('dns'),
      // eight servers up at the same time (the Pleno II mission)
      eight: () => ops.devices().filter(upNow).length >= 8,
      // fifteen (the Tech Lead mission)
      fifteen: () => ops.devices().filter(upNow).length >= 15,
    };

    /* ---------- the equipment a problem happens on ---------- */
    function fits(x, t) {
      if (x.hold) return false;
      if (t.state && [].concat(t.state).indexOf(x.state) < 0) return false;
      if (t.os === 'linux' && DL.isWin && DL.isWin(x)) return false;
      if (t.os === 'windows' && !(DL.isWin && DL.isWin(x))) return false;
      // Windows: installed and logged in · a domain controller or not · a role it doesn't have yet
      if (t.win === 'ready' && !(win(x) && win(x).stage === 'ready')) return false;
      if (t.domain != null && !!(win(x) && win(x).domain) !== t.domain) return false;
      if (t.lacks && (!win(x) || win(x).features.indexOf(t.lacks) >= 0)) return false;
      // …without this OU / group / record in its zone / share yet (the problem creates it)
      if (t.noOu && win(x) && win(x).ous.some((o) => low(o) === low(t.noOu))) return false;
      if (t.noGroup && win(x) && win(x).groups[low(t.noGroup)]) return false;
      if (t.noRr && win(x) && win(x).domain) { const z = win(x).zones[low(win(x).domain.name)]; if (z && z.records.some((r) => r.name === low(t.noRr))) return false; }
      if (t.noShare && win(x) && win(x).shares[low(t.noShare)]) return false;
      // a server with this specialisation (infra.js) · with a GPU
      if (t.svc && x.svc !== t.svc) return false;
      if (t.gpu && !(DL.isGpu && DL.isGpu(x))) return false;
      if (t.own && x.pre) return false;
      if (t.healthy && (x.fault || x.broken || x.out || x.state !== 'online' || !ops.health(x).up)) return false;
      if (t.web && !(x.os && x.os.services.nginx === 'active')) return false;
      if (t.managed && x.model && x.model.managed === false) return false;
      if (t.direct && !PROBES['sw.direct'](x)) return false;
      if (t.direct2 && !PROBES['sw.pair'](x)) return false;
      if (t.linked && !(x.sw && Array.from(x.sw.linked || []).some((p) => p !== 'te1'))) return false;
      if (t.linkedMin && !(x.sw && Array.from(x.sw.linked || []).filter((p) => p !== 'te1').length >= t.linkedMin)) return false;
      // a server cabled straight to its switch, whose uplink port (te1) is free (the cable can go there by mistake)
      if (t.te1free) { const tr = x.path || ops.trace(x); if (!tr.ok || tr.links.length !== 1 || ops.linkAt(tr.sw.key, 'te1')) return false; }
      // cabled straight to the switch (no patch panel): show interfaces status names it
      if (t.directLink) { const tr = x.path || ops.trace(x); if (!tr.ok || tr.links.length !== 1) return false; }
      return true;
    }
    // the other devices of a problem on this one ({ sw }), each free and without a fault of its own — or null.
    // keep: the ones it had before a save (restore), when they still exist
    function extrasFor(def, x, keep) {
      const out = {}, taken = [x];
      for (const r of Object.keys(def.devices || {})) {
        const e = (keep && keep[r]) || (RESOLVE[def.devices[r]] && RESOLVE[def.devices[r]](x, taken));
        if (!e || e.hold || e.fault || e.broken || e.out) return null;
        out[r] = e;
        taken.push(e);
      }
      return out;
    }
    function candidates(def) {
      const t = def.target;
      if (t.kind === 'rack') return scene.world.items.filter((e) => e.kind === 'rack' && e.units && !e.hold && (!t.cabled || e.cableLook) && (!def.devices || extrasFor(def, e)));
      return ops.devices().filter((d) => d.kind === t.kind && fits(d, t) && (!def.devices || extrasFor(def, d)));
    }
    // the preferred name (SRV-01) half of the time, so the same server doesn't get every problem
    function choose(def, list) {
      const pref = def.target.prefer && list.find((x) => x.name === def.target.prefer);
      return pref && rand() < 0.5 ? pref : pick(list);
    }
    const exists = (x) => (x.kind === 'rack' ? scene.world.items.indexOf(x) >= 0 : ops.devices().indexOf(x) >= 0);
    // every device a problem involves: its main one and the others (devices)
    const devicesOf = (p) => [p.x].concat(Object.values(p.extra || {})).filter(Boolean);

    /* ---------- texts ---------- */
    const envP = (p) => {
      const env = Object.assign(envOf(p.x), p.vars || {});
      for (const r of Object.keys(p.extra || {})) env[r] = envOfOther(p.extra[r]);
      return env;
    };
    const devsP = (p) => Object.assign({ dev: p.x }, p.extra || {});
    const titleOf = (p) => tpl(p.def.title, envP(p));
    const summaryOf = (p) => tpl(p.def.summary || '', envP(p));
    const openOn = (id, d) => P.open.find((x) => x.def.id === id && devicesOf(x).indexOf(d) >= 0);
    varsOf = (id, d) => { const p = openOn(id, d); return p ? p.vars : null; };
    devsOf = (id, d) => { const p = openOn(id, d); return p && p.extra ? Object.assign({ dev: p.x }, p.extra) : null; };
    const xpFor = (p) => (sys.career ? sys.career.xpFor(p.def) : p.def.xp);

    /* ---------- start / bind / set up ---------- */
    function bind(p, x, keep) {
      p.x = x;
      if (x && p.def.devices && !p.extra) p.extra = extrasFor(p.def, x, keep) || {};
      // the crew leaves it to the player (above the problem's rank only for a while: see update)
      for (const d of devicesOf(p)) d.hold = p.uid;
    }
    function release(p) { for (const d of devicesOf(p)) if (d.hold === p.uid) delete d.hold; }

    // what went wrong when the problem starts (false: it doesn't fit this device after all).
    // p.vars: the values a save kept (a restored problem sets the same thing up again)
    function setUp(p, quiet) {
      const s = p.def.setup, x = p.x;
      if (!s || !x) return true;
      const devs = devsP(p), v = p.vars || {};
      const servers = () => Object.values(devs).filter((d) => d && d.kind === 'server' && d.os);
      // --- what changes without being a fault (it comes back with a save) ---
      // the name: a fixed one (localhost after a reinstall) or 'dup', the name of another server
      if (s.hostname === 'dup' && x.os) {
        const others = ops.devices().filter((d) => d.kind === 'server' && d !== x && d.state === 'online' && d.os && !(DL.isWin && DL.isWin(d)));
        const o = (v.dup && others.find((d) => d.name === v.dup)) || pick(others);
        if (!o) return false;
        x.os.hostname = o.os.hostname === 'localhost' ? o.name.toLowerCase() : o.os.hostname;
        x.os.dupOf = o.name;
      } else if (s.hostname && x.os) for (const r of [].concat(s.hostnameOn || 'dev')) if (devs[r] && devs[r].os) devs[r].os.hostname = s.hostname;
      // messy: this rack · messy2: this one and the other racks of the problem
      if (s.rack === 'messy' || s.rack === 'messy2') {
        for (const r of s.rack === 'messy2' ? Object.values(devs) : [x]) if (r && r.kind === 'rack') { r.tidy = false; r.messyNoted = true; }
        ops.recompute();
      }
      // someone guessing SSH passwords (the same IP when a save brings the problem back) · on every server of the problem
      if ((s.authlog === 'bruteforce' || s.authlog === 'bruteforce2') && x.os && DL.authAttack) {
        const ip = DL.authAttack(x, v.attacker);
        if (s.authlog === 'bruteforce2') for (const d of servers()) if (d !== x) DL.authAttack(d, ip);
      }
      // a quiet log with a known last login
      if (s.authlog === 'logins' && x.os && DL.authLogins) DL.authLogins(x, v.last);
      // the Linux server's accounts, files, packages, cron, firewall (terminal.js DL.linuxSetup)
      if (s.linux && !(DL.linuxSetup && DL.linuxSetup(x, s.linux, { vars: v, devs }))) return false;
      // the same on other servers of the problem (linuxOn: roles)
      if (s.linuxOn) for (const r of [].concat(s.linuxOn)) if (devs[r] && devs[r] !== x && DL.linuxSetup) DL.linuxSetup(devs[r], s.linuxOn2 || s.linux, { vars: v, devs });
      // a hot room: each server of the problem at its own temperature, one clearly the hottest (vars.top)
      if (s.hotOn && DL.linuxSetup) {
        const list = [].concat(s.hotOn).map((r) => devs[r]).filter(Boolean), top = (v.top && list.find((q) => q.name === v.top)) || pick(list), rest = [84, 79, 76];
        let i = 0;
        for (const q of list) DL.linuxSetup(q, 'hot', { vars: v, temp: q === top ? 91 : rest[i++] });
      }
      // VMs on the first virtualization node: test ones running (vms: 'teste') or old ones stopped for weeks ('antigo')
      if (s.vms) {
        const I = INFRA(), node = I && I.readyNodes()[0];
        if (!node) return false;
        const run = s.vms === 'teste';
        for (let k = 1; k <= (run ? 2 : 3); k++) if (!I.vms.some((q) => q.name === s.vms + '-' + k)) I.createVm({ node: node.key, name: s.vms + '-' + k, svc: 'web', cores: 1, ram: 2, disk: 16, start: run });
      }
      // a port description changed after the last save of the switch configuration
      // unsaved2: on every switch of the problem
      if ((s.swconfig === 'unsaved' || s.swconfig === 'unsaved2') && x.sw) {
        for (const sw of s.swconfig === 'unsaved2' ? Object.values(devs).filter((d) => d && d.sw) : [x]) {
          sw.sw.unsaved = true;
          sw.sw.unsavedPort = (sw === x && v.port) || pick(Array.from(sw.sw.linked || []).filter((q) => q !== 'te1')) || null;
        }
      }
      // the old core switch's VLANs (the new one has to get the same)
      if (s.swcore && x.sw && DL.swVlans) { const sv = DL.swVlans(x.sw); sv.vlans[20] = 'SERVIDORES'; sv.vlans[30] = 'CAMERAS'; }
      // a virtualization node with its RAM nearly all promised to two VMs
      if (s.vmload) {
        const I = INFRA();
        if (!I || x.kind !== 'server') return false;
        const used = I.vms.filter((q) => q.node === x.key && q.status !== 'stopped').reduce((n, q) => n + q.ram, 0), cap = I.capOf(x);
        const each = Math.floor((cap.ram * 0.95 - used) / 2);
        if (each < 2 && !I.vms.some((q) => q.name === 'carga-1')) return false;
        for (const name of ['carga-1', 'carga-2']) if (!I.vms.some((q) => q.name === name)) I.createVm({ node: x.key, name, svc: 'db', cores: Math.max(1, Math.floor(cap.cores / 4)), ram: each, disk: 40 });
      }
      // one server of the problem with its disk fuller than the others (still below the 80% alert)
      if (s.diskpct) {
        const pool = servers(), d = (v.top && pool.find((q) => q.name === v.top)) || pick(pool);
        if (d) d.os.disk = Math.round(between(s.diskpct[0], s.diskpct[1]));
      }
      // switched on some hours ago (minutes [min, max])
      if (s.uptime && x.os) x.os.boot = Date.now() - (v.h != null ? v.h * 60 + 10 : Math.round(between(s.uptime[0], s.uptime[1]))) * 60000;
      // Windows Server: the default name back (after a reinstall) · DNS pointing outside · a restart someone made ·
      // the rest (accounts, DHCP, folders…) is winserver.js's own (DL.winSetup)
      if (s.win && win(x)) {
        const w = win(x), rest = [].concat(s.win).filter((n) => ['host', 'dns', 'reboot'].indexOf(n) < 0);
        if (rest.length && !(DL.winSetup && DL.winSetup(x, rest, { devs, vars: v }))) return false;
        if (s.win === 'host') { w.host = 'WIN-' + Array.from({ length: 7 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(rand() * 32)]).join(''); w.pending.name = null; x.os.hostname = w.host; }
        if (s.win === 'dns') w.dnsClient = ['8.8.8.8'];
        if (s.win === 'reboot' && DL.winEvent) {
          w.rebootBy = v.by || pick(['carla.mendes', 'bruno.alves', 'tiago.rocha', 'paula.lima']);
          DL.winEvent(x, 'System', 1074, 'Information', 'Reinício solicitado pelo usuário ' + w.rebootBy + ' (atualização do sistema).');
          DL.winEvent(x, 'System', 6005, 'Information', 'O serviço de log de eventos foi iniciado.');
        }
      }
      // --- faults (not saved: the problem isn't either) ---
      // setup.fault (one) or setup.faults (a list, each with its own on / pick / quiet)
      const jobs = s.faults || (s.fault ? [s] : []);
      if (jobs.length && quiet) return false;
      for (const j of jobs) {
        // fault: a type or a list (one of them, at random) · 'type@role': the fault and the device it goes on
        // on: the device(s) it goes on (roles of the problem; default the main one) · pick: only one of them, at random
        const types = [].concat(j.fault).sort(() => rand() - 0.5), byRole = types.some((e) => e.indexOf('@') > 0);
        let on = byRole ? [null] : [].concat(j.on || 'dev').map((r) => devs[r]).filter(Boolean);
        if (j.pick) on = [pick(on)];
        if (!on.length) return false;
        for (const fixed of on) {
          let fx = null;
          for (const e of types) {
            const [ty, role] = e.split('@'), d = fixed || devs[role || 'dev'];
            if (!d) continue;
            const opts = Object.assign({}, s.opts || {}, j.opts || {});
            // a switch fault for a server's problem: the port at the end of its cable (port2: and the peer's)
            if (d.kind === 'switch' && x.kind === 'server' && !opts.port) {
              opts.port = PROBES['srv.port'](x);
              if (devs.peer && devs.peer.kind === 'server') opts.port2 = PROBES['srv.port'](devs.peer);
            }
            // ipOf: the address of another device of the problem (two servers with the same IP)
            if (s.ipOf && devs[s.ipOf]) opts.ip = devs[s.ipOf].ip;
            if ((fx = ops.injectFault(d, ty, opts))) break;
          }
          if (!fx) return false;
          // quiet: no alert (it would give away the answer, e.g. the port in err-disabled); the problem tells it
          if (j.quiet || s.quiet) Object.assign(fx.fault, { found: true, foundAt: now(), by: null });
          else ops.report(fx, null, 'chamado');
          if (fx.fault) fx.fault.problem = p.uid;
        }
      }
      return true;
    }

    function start(def, x, opts) {
      opts = opts || {};
      const p = { uid: ++P.seq, def, x: null, at: now() - (opts.age || 0), by: null, wrong: 0, vars: opts.vars || null };
      bind(p, x || null, opts.extra);
      // the other servers / racks it needs aren't there (or aren't free) right now
      if (x && def.devices && Object.keys(p.extra || {}).length < Object.keys(def.devices).length) { release(p); return null; }
      if (!setUp(p, opts.quiet)) { release(p); return null; }
      // what the problem is about stays fixed from now on (the port that broke, the server to find…)
      p.vars = opts.vars || (x ? readVars(def.vars, x, devsP(p)) : {});
      // a console problem starts from clean consoles: what was typed for the last one doesn't count again
      if (x && def.complete === 'lesson') for (const d of devicesOf(p)) { d.ran = new Set(); d.lessonKey = null; }
      P.open.push(p);
      if (!opts.quiet) {
        if (breaks(def) && game.director) game.director.started('problem', titleOf(p));
        ops.logEvent('info', '🧩 Problema: ' + titleOf(p) + ' · +' + xpFor(p) + ' XP');
        game.toast('info', 'Problema · +' + xpFor(p) + ' XP', esc(titleOf(p)) + ' · Tarefas (T)');
        game.sfx('ping');
      }
      ops.render(true);
      return p;
    }

    function close(p) {
      P.open = P.open.filter((x) => x !== p);
      release(p);
      p.closed = true;
      // whoever was on their way to it stops (the player or someone else solved it first)
      const a = p.assignee;
      p.assignee = null;
      if (a && sys.crew && a.crew.job && a.crew.job.def.problem === p.uid) sys.crew.api.cancelJob(a, true);
      ops.render(true);
    }

    // by: 'player' or the name of the crew member who did it. Only the player's own work pays the whole XP;
    // the crew member the player assigned it to (p.doneBy) pays CREW_SHARE; anyone else, nothing.
    function finish(p, by) {
      if (p.closed) return;
      close(p);
      const title = titleOf(p), assigned = by !== 'player' && !!p.doneBy && by === p.doneBy;
      let xp = 0;
      if (by === 'player') {
        xp = sys.career ? sys.career.solve(p.def, 1) : 0;
        if (game.economy && p.def.credits) game.economy.earn('credits', p.def.credits, 'Problema: ' + title);
        ops.logEvent('ok', '🧩 Resolvido: ' + title + ' · +' + xp + ' XP' + (p.def.handoff ? ' · ' + p.def.handoff : ''));
        game.toast('ok', 'Problema resolvido · +' + xp + ' XP', esc(title) + (p.def.handoff ? ' · ' + esc(p.def.handoff) : ''));
        game.sfx('done');
      } else if (assigned) {
        xp = sys.career ? sys.career.solve(p.def, CREW_SHARE) : 0;
        ops.logEvent('ok', '🧩 Resolvido por ' + by + ' (atribuído por você): ' + title + ' · +' + xp + ' XP');
        game.toast('ok', 'Resolvido por ' + esc(by) + ' · +' + xp + ' XP', esc(title) + ' · ' + Math.round(CREW_SHARE * 100) + '% do XP por ter atribuído');
        game.sfx('done');
      } else ops.logEvent('ok', '🧩 Resolvido por ' + by + ': ' + title + ' (sem XP para você)');
      // (economy.js reports the ones worth XP in the next cloud save: the server prices them again)
      game.emit('problem-done', { id: p.def.id, by, wrong: p.wrong, xp });
    }
    function cancel(p, why) {
      if (p.closed) return;
      close(p);
      ops.logEvent('info', '🧩 Encerrado: ' + titleOf(p) + (why ? ' · ' + why : ''));
    }

    /* ---------- what moves a problem forward ---------- */
    game.on('fixed', (info) => {
      for (const p of P.open.slice()) if (p.def.complete === 'fixed' && p.x === info.d) finish(p, info.by || 'player');
    });
    game.on('server-online', (info) => {
      for (const p of P.open.slice()) if (p.def.complete === 'online' && p.x === info.d) finish(p, p.doneBy || 'player');
    });
    // checklist problems: whoever did the last thing on their target
    game.on('tidy', (info) => { for (const p of P.open) if (info.racks.indexOf(p.x) >= 0) p.by = info.who || 'player'; });
    game.on('cabled', (info) => { for (const p of P.open) if (p.x === info.d) p.by = info.who || 'player'; });
    // wrong answers in the console (kept for the problem's history)
    game.on('answer', (info) => { if (!info.ok) for (const p of P.open) if (p.x === info.d && p.def.complete === 'lesson') p.wrong++; });

    // (a step on another device of the problem is checked there: the second rack, the peer server…)
    const stepsDone = (p) => (p.def.steps || []).map((s) => test(fill(s.check, envP(p)), s.device ? (p.extra || {})[s.device] : p.x, null, devsP(p)));
    const stepOf = (p) => { const k = stepsDone(p).indexOf(false); return k < 0 ? (p.def.steps || []).length : k; };

    /* ---------- the timer ---------- */
    function eligible(level) {
      const open = new Set(P.open.map((p) => p.def.id));
      return DATA.problems.filter((def) => def.trigger !== 'auto' && levelOf(def) <= level && !open.has(def.id) &&
        (!def.when || (WHEN[def.when] && WHEN[def.when]())) &&
        (!breaks(def) || !game.director || game.director.canStart('fault')) &&
        candidates(def).length);
    }
    // onlyFaults: just the ones that break something (they take an incident slot the director just opened)
    function trySpawn(onlyFaults) {
      const level = playerLevel(), home = DATA.problems.some((d) => levelOf(d) === level);
      const max = home ? PACE.maxHome : PACE.maxUp;
      if (P.open.filter((p) => p.def.trigger !== 'auto').length >= max) return;
      const defs = eligible(level).filter((d) => !onlyFaults || breaks(d));
      if (!defs.length) return;
      // never solved: twice as likely
      const w = defs.map((d) => (d.weight || 1) * (sys.career && sys.career.solvedCount(d.id) ? 1 : 2));
      let r = rand() * w.reduce((a, b) => a + b, 0), def = defs[defs.length - 1];
      for (let i = 0; i < defs.length; i++) if ((r -= w[i]) <= 0) { def = defs[i]; break; }
      start(def, choose(def, candidates(def)));
    }

    // problems that start the moment they fit, at their own rank (the player's own new server)
    function autoStart() {
      const level = playerLevel();
      for (const def of DATA.problems) {
        if (def.trigger !== 'auto' || levelOf(def) !== level || P.open.some((p) => p.def.id === def.id)) continue;
        if (def.when && !(WHEN[def.when] && WHEN[def.when]())) continue;
        const list = candidates(def);
        if (list.length) start(def, list[0]);
        else if (def.target.lazy) start(def, null);
      }
    }

    function update(dt) {
      if (game.paused && game.paused()) return;
      P.next -= dt;
      P.acc += dt;
      if (P.acc < 0.5) return;
      P.acc = 0;
      const level = playerLevel(), t = now();
      for (const p of P.open.slice()) {
        const above = level > levelOf(p.def);
        // a checklist problem waiting for its equipment (the server the player is about to install)
        if (!p.x && p.def.target.lazy) { const list = candidates(p.def); if (list.length) bind(p, list[0]); }
        if (devicesOf(p).some((d) => !exists(d))) { cancel(p, 'equipamento removido'); continue; }
        if (p.def.complete === 'fixed' && p.x && !p.x.fault) { cancel(p, 'o problema sumiu'); continue; }
        if (p.def.complete === 'online' && p.x && p.x.state === 'online') { finish(p, p.doneBy || 'player'); continue; }
        // the person it was assigned to stopped (another order, end of the shift, dismissed): it is open again
        if (p.assignee && !onIt(p.assignee, p)) { ops.logEvent('info', '🧩 ' + p.assignee.crew.name + ' parou: ' + titleOf(p) + ' · atribua de novo ou resolva você'); p.assignee = null; ops.render(true); }
        if (p.def.complete === 'steps' && (p.x || !p.def.target.lazy) && stepsDone(p).every(Boolean)) { finish(p, p.by || 'player'); continue; }
        if (above && p.x && p.x.hold === p.uid && t - p.at > PACE.hold) delete p.x.hold;
        if (above && (p.def.complete === 'lesson' || p.def.complete === 'steps') && t - p.at > PACE.expire) cancel(p, 'ninguém pegou');
      }
      autoStart();
      const home = DATA.problems.some((d) => levelOf(d) === level);
      if (P.next <= 0) {
        P.next = between.apply(null, home ? PACE.gapHome : PACE.gapUp);
        trySpawn();
      }
      // an incident slot is open (director.js): a problem that breaks something may take it before a random
      // fault does (ops.js asks every 20–45 min) — at the player's own rank most incidents come as problems
      else if (game.director && rand() < (home ? PACE.faultHome : PACE.faultUp) && game.director.canStart('fault')) trySpawn(true);
    }

    /* ---------- actions (Tarefas panel) ---------- */
    // the console lesson of a problem on this device, if any (ops.openTerminal asks). When the device already has
    // a lesson of its own (a fault), only a problem that caused that fault goes first (identify the broken port).
    const consoleFor = (d, busy) => P.open.find((p) => devicesOf(p).indexOf(d) >= 0 && p.def.complete === 'lesson' && (!busy || breaks(p.def))) || null;
    // a new server whose career problem has a setup lesson of its own (setup_jr1…: fewer hints than the classic one)
    function setupLesson(d) {
      // (a Windows server only takes a Windows lesson, and a Linux one only a Linux lesson)
      const w = !!(DL.isWin && DL.isWin(d));
      const p = P.open.find((x) => x.x === d && x.def.complete === 'online' && x.def.lesson && DL.LESSONS[x.def.lesson] && /^win/.test(x.def.lesson) === w);
      return p ? p.def.lesson : null;
    }
    // at: the device whose console the player asked for; without it, the device of the step the problem is on
    function openConsole(p, at) {
      let d = at || p.x;
      if (!at && p.extra) {
        const key = 'p:' + p.def.id, L = DL.LESSONS[key](p.x), ran = p.x.lessonKey === key ? p.x.ran : new Set();
        const s = L.steps.find((st) => !st.done(p.x, ran));
        if (s && s.on) d = s.on;
      }
      sys.terminal.open(d, 'p:' + p.def.id, () => finish(p, 'player'));
    }

    /* ---------- assigning a problem to someone on the team ---------- */
    const roleName = (r) => (DL.ROLES[r] ? DL.ROLES[r].name : r);
    const alive = (a) => !!sys.crew && sys.crew.members.indexOf(a) >= 0;
    const onIt = (a, p) => alive(a) && !!a.crew.job && a.crew.job.def.problem === p.uid;
    // who can take it: the roles in the data (roles: [] = only the player), a custom role whose main skill is the
    // problem's, or a legendary bot (they do almost everything); people off shift are left out
    const canTake = (a, def) => {
      const role = a.crew.profile.role, r = DL.ROLES[role];
      return def.roles.indexOf(role) >= 0 || !!a.crew.legend || (!!r && !!r.custom && DL.ROLE_SKILL[role] === def.skill);
    };
    const assignable = (p) => !!p.x && (p.def.roles || []).length > 0;
    function crewFor(p) {
      if (!sys.crew || !assignable(p)) return [];
      const sk = (a) => Math.round(a.crew.stats.skills[p.def.skill] || 0);
      return sys.crew.members.filter((a) => !a.hidden && !a.crew.off && canTake(a, p.def)).sort((x, y) => sk(y) - sk(x))
        .map((a) => ({ a, skill: sk(a), busy: a.crew.job && !a.crew.job.auto ? a.crew.job.name : null }));
    }

    // the order the crew member works on: go to the rack, work for bot_minutes, then botFinish
    function botJob(p) {
      const def = p.def;
      return {
        id: 'problem', problem: p.uid, name: 'Problema: ' + titleOf(p), verb: 'Resolvendo o problema', kind: 'equip', skill: def.skill,
        xp: 12 + 6 * (def.difficulty || 1), dur: [def.bot_minutes * 0.8, def.bot_minutes * 1.2], auto: 0, desc: summaryOf(p),
        place: (x) => (x.kind === 'rack' ? x : x.rack),
        finish: (ctx) => botFinish(p, ctx.a),
      };
    }
    function assign(p, a) {
      if (!assignable(p) || !alive(a) || !canTake(a, p.def)) return 'Não pode resolver este problema';
      const why = sys.crew.api.startJob(a, botJob(p), { auto: false, target: p.x });
      if (why) { game.toast('warn', 'Não deu para atribuir', esc(a.crew.name) + ': ' + esc(why)); return why; }
      p.assignee = a;
      p.picking = false;
      ops.logEvent('info', '🧩 ' + titleOf(p) + ' → ' + a.crew.name + ' (você ganha ' + Math.round(CREW_SHARE * 100) + '% do XP)');
      if (game.chat) game.chat.post(a, pick(['Deixa comigo: ', 'Pode deixar, já vou ver: ', 'Tô indo: ']) + titleOf(p).charAt(0).toLowerCase() + titleOf(p).slice(1) + '.');
      ops.render(true);
      return null;
    }
    function unassign(p) {
      const a = p.assignee;
      p.assignee = null;
      if (a && onIt(a, p)) sys.crew.api.cancelJob(a);
      ops.render(true);
    }

    // what the crew member did, as the player would have (same end state): true when it worked
    function resolveFor(p, a) {
      const x = p.x, def = p.def, name = a.crew.name;
      if (def.complete === 'fixed') return !!x.fault && ops.fix(x, a);
      // bot_action 'fix': a console problem whose faults the crew member also fixes (the port of the server's switch…)
      if (def.bot === 'fix' && breaks(def)) {
        for (const fx of devicesOf(p)) if (fx.fault && fx.fault.problem === p.uid && !ops.fix(fx, a)) return false;
      }
      if (def.complete === 'online') return ops.configure(x);
      const s = def.setup || {};
      if (s.rack === 'messy' || s.rack === 'messy2') ops.tidy(devicesOf(p).filter((r) => r.kind === 'rack'), name);
      if (s.hostname) for (const d of devicesOf(p)) if (d.os && d.kind === 'server') d.os.hostname = String(d.name).toLowerCase();
      if (s.swconfig && x.sw) x.sw.unsaved = false;
      if (s.win === 'host' && win(x)) { win(x).host = String(x.name).toUpperCase(); win(x).pending.name = null; x.os.hostname = win(x).host; }
      if (s.win === 'dns' && win(x)) win(x).dnsClient = ['127.0.0.1'];
      if (!p.closed) finish(p, name);
      return true;
    }
    // what they tell the team: the answer, when the problem asked something
    function botSay(p) {
      if (p.def.complete !== 'lesson') return 'Resolvido: ' + titleOf(p) + '.';
      const L = compileLesson(p.def, p.x, p.vars), q = L.steps.filter((s) => s.answer).pop();
      return 'Resolvido: ' + titleOf(p) + (q && q.answer.accept[0] ? ' → ' + q.answer.accept[0] : '') + '.';
    }
    function botFinish(p, a) {
      const title = titleOf(p);
      if (p.closed) return { say: 'Cheguei em "' + title + '" e já estava resolvido. Melhor assim!' };
      p.assignee = null;
      // beginners sometimes don't make it (the same odds as fixing a fault, jobs.js)
      const s = a.crew.stats.skills[p.def.skill] || 0;
      if (rand() < Math.max(0, (42 - s) / 70)) {
        ops.logEvent('warn', '🧩 ' + a.crew.name + ' não conseguiu: ' + title);
        ops.render(true);
        return { say: 'Tentei "' + title + '", mas não consegui. ' + playerName() + ', dá uma olhada ou passa para alguém com mais experiência?', tone: 'warn' };
      }
      p.doneBy = a.crew.name;
      if (!resolveFor(p, a)) {
        p.doneBy = null;
        ops.render(true);
        return { say: 'Mexi em "' + title + '", mas ainda não resolveu. ' + playerName() + ', confere comigo?', tone: 'warn' };
      }
      if (!p.closed) finish(p, a.crew.name);
      return { say: botSay(p), tone: 'ok', fixed: p.def.complete === 'fixed' };
    }
    const playerName = () => (sys.crew && sys.crew.playerProfile && sys.crew.playerProfile.name) || 'Chefe';

    function act(uid, what, who) {
      const p = P.open.find((x) => x.uid === uid);
      if (!p) return;
      const x = p.x;
      if (what === 'assign') { p.picking = !p.picking; ops.render(true); return; }
      if (what === 'assign-to') { const a = sys.crew && sys.crew.members.find((m) => String(m.crew.id) === String(who)); if (a) assign(p, a); return; }
      if (what === 'unassign') { unassign(p); return; }
      if (what === 'term' && x) { if (p.extra) openConsole(p); else if (ops.openTerminal) ops.openTerminal(x); return; }
      if (what === 'build') { ops.toggle(false); game.setMode('build'); game.toast('info', 'Construir', 'Equipamentos → Servidor ou Switch, depois clique num rack'); return; }
      if (what === 'cabling' && x) {
        // the rack of the current step (a problem on two racks: the second one when it's its turn)
        const s = p.def.complete === 'steps' ? p.def.steps[stepOf(p)] : null, t = (s && s.device && p.extra && p.extra[s.device]) || x;
        sys.cabling.open(t.kind === 'rack' ? t : t.rack, t.kind === 'rack' ? null : t);
        return;
      }
      if (what === 'show' && x) { const r = x.kind === 'rack' ? x : x.rack; game.focus(r.px + 8, r.py); if (game.flash) game.flash(r); }
    }

    function itemHtml(p) {
      const x = p.x, def = p.def, d = x && x.kind !== 'rack' ? x : null;
      const fault = def.complete === 'fixed';
      const where = !x ? 'Datacenter' : x.kind === 'rack' ? x.id : x.where;
      // a clean card: the name, then difficulty · XP · where; the long text and the full step list fold away
      const lvl = Math.max(1, Math.min(5, def.difficulty | 0));
      let h = '<li class="ops-item is-prob' + (fault ? ' is-fault' : '') + '"><div class="ops-item__head"><span class="dot' + (fault ? ' dot--warn dot--live' : ' dot--info') + '"></span><b>' + esc(titleOf(p)) + '</b></div>' +
        '<div class="ops-item__meta"><span class="ops-diff ops-diff--' + lvl + '" title="Dificuldade">' + '<i></i>'.repeat(lvl) + (DIFF[def.difficulty] || '') + '</span>' +
        '<span class="ops-xp" title="XP para a sua carreira">+' + xpFor(p) + ' XP</span><span class="ops-item__where">' + esc(where) + '</span></div>';
      let more = '<p>' + esc(summaryOf(p)) + '</p>';
      if (def.complete === 'steps') {
        const done = stepsDone(p), cur = done.indexOf(false);
        if (cur >= 0) h += '<p class="ops-item__now"><span>Agora</span>' + esc(tpl(def.steps[cur].text, envP(p))) + '</p>';
        more += '<ol class="prob-steps">' + def.steps.map((s, k) => '<li class="' + (done[k] ? 'is-done' : k === cur ? 'is-current' : '') + '"><span>' + (done[k] ? '✓' : k + 1) + '</span>' + esc(tpl(s.text, envP(p))) + '</li>').join('') + '</ol>';
      }
      more += '<p class="ops-more__k">Patente: ' + esc(rankName(def)) + '</p>';
      h += '<details class="ops-more" data-det="p' + p.uid + '"><summary>Ver detalhes</summary>' + more + '</details>';
      const b = (attrs, label, primary) => '<button type="button" class="btn btn--sm' + (primary ? ' btn--primary' : '') + '" ' + attrs + '>' + label + '</button>';
      const pa = (act, extra) => 'data-op="prob" data-prob="' + p.uid + '" data-act="' + act + '"' + (extra || '');
      if (p.assignee) {
        const a = p.assignee, r = DL.ROLES[a.crew.profile.role];
        // (the status without the job's name: "Indo até RACK-N01", "Resolvendo o problema")
        h += '<p class="prob-who"><span class="cc__dot" style="background:' + (r ? r.color : '#fff') + '"></span>Com <b>' + esc(a.crew.name) + '</b> · ' + esc(sys.crew.statusOf ? sys.crew.statusOf(a).split(' · ')[0] : 'a caminho') +
          ' · você ganha ' + Math.round(CREW_SHARE * 100) + '% do XP</p>';
      } else if (p.picking) {
        const list = crewFor(p);
        h += '<div class="prob-pick"><span class="eyebrow-sm">Quem resolve? · você ganha ' + Math.round(CREW_SHARE * 100) + '% do XP (+' + (sys.career ? sys.career.xpFor(def, CREW_SHARE) : '') + ')</span>' +
          (list.length ? '<ul>' + list.map((c) => {
            const r = DL.ROLES[c.a.crew.profile.role];
            return '<li><button type="button" class="prob-pick__who" ' + pa('assign-to', ' data-who="' + c.a.crew.id + '"') + '><span class="cc__dot" style="background:' + (r ? r.color : '#fff') + '"></span><b>' + esc(c.a.crew.name) + '</b>' +
              '<span>' + esc(roleName(c.a.crew.profile.role)) + ' · ' + esc(def.skill) + ' ' + c.skill + (c.busy ? ' · ocupado(a): ' + esc(c.busy) : '') + '</span></button></li>';
          }).join('') + '</ul>'
          : '<p class="ops-item__why">Ninguém no turno pode resolver isto agora. Cargos que resolvem: ' + esc(def.roles.map(roleName).join(', ')) + '.</p>') + '</div>';
      }
      h += '<div class="ops-item__actions">';
      if (def.complete === 'lesson') h += b('data-op="prob" data-prob="' + p.uid + '" data-act="term"', 'Abrir terminal', true);
      else if (def.complete === 'fixed' && d) h += b('data-op="term" data-dev="' + d.key + '"', 'Abrir terminal', true) + b('data-op="cable" data-dev="' + d.key + '"', 'Cabeamento') + b('data-op="mon" data-dev="' + d.key + '"', 'Monitor');
      else if (def.complete === 'online' && d) h += d.state === 'new' ? b('data-op="cable" data-dev="' + d.key + '"', 'Ligar cabos', true) : b('data-op="term" data-dev="' + d.key + '"', 'Abrir terminal', true);
      else if (def.complete === 'steps') {
        const s = def.steps[Math.max(0, stepOf(p))] || def.steps[def.steps.length - 1];
        if (s.action === 'build') h += b('data-op="prob" data-prob="' + p.uid + '" data-act="build"', 'Construir (B)', true);
        if ((s.action === 'cabling' && x) || (x && x.kind === 'rack')) h += b('data-op="prob" data-prob="' + p.uid + '" data-act="cabling"', 'Cabeamento', s.action === 'cabling');
      }
      if (p.assignee) h += b(pa('unassign'), 'Cancelar atribuição');
      else if (assignable(p) && sys.crew) h += b(pa('assign'), p.picking ? 'Fechar' : 'Atribuir a…');
      if (x) h += b(pa('show'), 'Mapa');
      return h + '</div></li>';
    }

    /* ---------- saves: what's open (a fault isn't saved, so problems about one aren't either) ---------- */
    function snapshot() {
      return {
        next: Math.round(P.next),
        open: P.open.filter((p) => p.def.complete !== 'fixed' && !breaks(p.def)).map((p) => ({
          id: p.def.id, age: Math.round(now() - p.at), vars: p.vars || {},
          dev: p.x && p.x.kind !== 'rack' ? p.x.key : null, rack: p.x && p.x.kind === 'rack' ? p.x.uid || p.x.id : null,
          // the other devices (the peer server, the second rack…), so the texts and answers stay the same
          extra: p.extra ? Object.fromEntries(Object.entries(p.extra).map(([r, e]) => [r, e.kind === 'rack' ? 'rack:' + (e.uid || e.id) : e.key])) : null,
        })),
      };
    }
    function restore(s) {
      reset();
      if (!s || !Array.isArray(s.open)) return;
      if (typeof s.next === 'number') P.next = Math.max(10, s.next);
      for (const o of s.open.slice(0, 8)) {
        const def = byId(o.id);
        if (!def || def.complete === 'fixed') continue;
        let x = null;
        if (o.dev) x = ops.get(o.dev);
        else if (o.rack) x = scene.world.items.find((e) => e.kind === 'rack' && (e.uid === o.rack || e.id === o.rack));
        if (!x && !def.target.lazy) continue;
        if (x && x.hold) continue;
        const vars = o.vars && typeof o.vars === 'object' && !Array.isArray(o.vars) ? o.vars : null;
        let extra = null;
        if (o.extra && typeof o.extra === 'object') {
          extra = {};
          for (const r of Object.keys(o.extra)) {
            const k = String(o.extra[r]);
            const e = k.indexOf('rack:') === 0 ? scene.world.items.find((i) => i.kind === 'rack' && (i.uid === k.slice(5) || i.id === k.slice(5))) : ops.get(k);
            if (e) extra[r] = e;
          }
        }
        // (the setup runs again — the same name, log, disk… from the saved vars)
        start(def, x, { quiet: true, age: o.age | 0, vars, extra });
      }
    }
    function reset() {
      for (const p of P.open) release(p);
      P.open = [];
      P.next = PACE.first;
    }

    return {
      update, reset, snapshot, restore, act, itemHtml, consoleFor, openConsole, devicesOf, setupLesson,
      list: () => P.open.slice(),
      // a short key of everything the Tarefas panel shows (it redraws when this changes)
      key: () => P.open.map((p) => p.uid + ':' + (p.x ? p.x.key || p.x.id : '-') + ':' + (p.def.complete === 'steps' ? stepOf(p) : '') + ':' + (p.x && p.x.state) + ':' + xpFor(p) +
        ':' + (p.assignee ? p.assignee.crew.id + (sys.crew.statusOf ? sys.crew.statusOf(p.assignee).split(' · ')[0] : '') : p.picking ? 'pick' + crewFor(p).map((c) => c.a.crew.id + (c.busy ? '*' : '')).join(',') : '')).join('|'),
      // exposed for automated checks
      api: { start: (id, x) => start(byId(id), x), finish, trySpawn, candidates: (id) => candidates(byId(id)), byId, PACE, assign, unassign, crewFor, CREW_SHARE,
        get BY_ID() { return Object.fromEntries(DATA.problems.map((p) => [p.id, p])); } },
    };
  };
})();
