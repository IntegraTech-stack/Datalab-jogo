/* DataLab — Windows Server 2022 (simulated). A server specialised as "Windows Server" (Infra → Servidores)
   is installed and configured from the rack console: setup from the install media, the Administrator
   password, static IP, computer name, roles and features, Active Directory (forest, OUs, users, groups),
   NTFS and share permissions, DNS (zones, A / CNAME records, resolution) and DHCP (scopes, options,
   authorisation, leases for the office PCs). PowerShell cmdlets plus the classic cmd tools (ipconfig,
   ping, net, icacls, nslookup) run over a small model of the server kept in d.os.win.
   It is not the whole OS — only what a sysadmin practises on a real domain controller — and it plugs
   into the existing systems: terminal.js (shell, help, lessons, missions), ops.js (setup + faults),
   infra.js (specialisation, DNS for the other services, revenue), monitor.js, talk.js, jobs.js,
   helpdesk.js and the save. */
(function () {
  'use strict';
  const DL = window.DL;
  const rand = Math.random;
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const low = (s) => String(s == null ? '' : s).toLowerCase();
  const isWin = (d) => !!(d && d.os && d.os.family === 'windows' && d.os.win);
  const W = (d) => d.os.win;
  const ready = (d) => isWin(d) && W(d).stage === 'ready';
  const eth = (d) => d.os.ifaces.eth0;
  const ipOk = (s) => /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.test(String(s)) && String(s).split('.').every((x) => +x <= 255);
  const net24 = (ip) => String(ip).split('.').slice(0, 3).join('.');
  const ipNum = (ip) => String(ip).split('.').reduce((a, x) => a * 256 + (+x), 0);
  const myIp = (d) => (eth(d).ips[0] || '').split('/')[0];
  const game = () => window.DataLabDemo;
  DL.isWin = isWin;

  // sizes kept small: everything here goes into the save
  const LIMIT = { users: 120, groups: 60, ous: 30, records: 120, dirs: 60, shares: 20, events: 30 };

  /* ------------------------------------------------------------------ */
  /* Catalog                                                             */
  /* ------------------------------------------------------------------ */
  const EDITIONS = [
    { idx: 1, ed: 'Standard', core: true, name: 'Windows Server 2022 Standard' },
    { idx: 2, ed: 'Standard', core: false, name: 'Windows Server 2022 Standard (Desktop Experience)' },
    { idx: 3, ed: 'Datacenter', core: true, name: 'Windows Server 2022 Datacenter' },
    { idx: 4, ed: 'Datacenter', core: false, name: 'Windows Server 2022 Datacenter (Desktop Experience)' },
  ];
  const FEATURES = {
    'AD-Domain-Services': { display: 'Active Directory Domain Services', role: true, tools: ['RSAT-AD-PowerShell'] },
    DNS: { display: 'DNS Server', role: true, svc: ['DNS'], tools: ['RSAT-DNS-Server'] },
    DHCP: { display: 'DHCP Server', role: true, svc: ['DHCPServer'], tools: ['RSAT-DHCP'] },
    'FS-FileServer': { display: 'File Server', role: true },
    'Web-Server': { display: 'Web Server (IIS)', role: true, svc: ['W3SVC'] },
    'RSAT-AD-PowerShell': { display: 'Active Directory module for Windows PowerShell' },
    'RSAT-DNS-Server': { display: 'DNS Server Tools' },
    'RSAT-DHCP': { display: 'DHCP Server Tools' },
  };
  const SERVICES = {
    NTDS: 'Active Directory Domain Services', Netlogon: 'Netlogon', ADWS: 'Active Directory Web Services', DNS: 'DNS Server',
    DHCPServer: 'DHCP Server', LanmanServer: 'Server', W3SVC: 'World Wide Web Publishing Service', W32Time: 'Windows Time',
    WinRM: 'Windows Remote Management (WS-Management)', EventLog: 'Windows Event Log', Dnscache: 'DNS Client',
  };
  // well-known principals (icacls / shares)
  const BUILTIN = { administrators: 'BUILTIN\\Administrators', users: 'BUILTIN\\Users', system: 'NT AUTHORITY\\SYSTEM', everyone: 'Everyone', 'authenticated users': 'NT AUTHORITY\\Authenticated Users', 'creator owner': 'CREATOR OWNER' };
  const PERMS = { F: 'Controle total', M: 'Modificar', RX: 'Ler e executar', R: 'Leitura', W: 'Gravação' };

  function newWin() {
    const id = Array.from({ length: 7 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(rand() * 32)]).join('');
    return {
      stage: 'media', edition: null, core: true, host: 'WIN-' + id, pending: {}, cwd: 'C:\\Users\\Administrator',
      features: ['FS-FileServer'], domain: null, dnsClient: [], zones: {}, forwarders: [],
      dhcp: { authorized: false, scopes: [] },
      ous: [], users: {}, groups: {}, local: ['Administrator'], localAdmins: ['Administrator'],
      dirs: {
        'c:\\': { path: 'C:\\', inherit: false, acl: [{ who: BUILTIN.administrators, perm: 'F' }, { who: BUILTIN.system, perm: 'F' }, { who: BUILTIN.users, perm: 'RX' }, { who: 'CREATOR OWNER', perm: 'F' }] },
        'c:\\windows': { path: 'C:\\Windows', inherit: true, acl: [], sys: true },
        'c:\\users': { path: 'C:\\Users', inherit: true, acl: [], sys: true },
        'c:\\users\\administrator': { path: 'C:\\Users\\Administrator', inherit: true, acl: [], sys: true },
        'c:\\program files': { path: 'C:\\Program Files', inherit: true, acl: [], sys: true },
      },
      shares: {},
      svc: { W32Time: 'Running', WinRM: 'Running', EventLog: 'Running', LanmanServer: 'Running', Dnscache: 'Running' },
      events: [], done: [], faultSvc: null,
    };
  }

  const has = (w, f) => w.features.indexOf(f) >= 0;
  const running = (w, s) => w.svc[s] === 'Running';
  function event(w, log, id, lvl, msg) {
    w.events.unshift({ log, id, lvl, msg, t: Date.now() });
    if (w.events.length > LIMIT.events) w.events.length = LIMIT.events;
  }
  const dn = (w) => (w.domain ? w.domain.name.split('.').map((p) => 'DC=' + p).join(',') : '');
  const nb = (w) => (w.domain ? w.domain.netbios : w.host);

  /* ------------------------------------------------------------------ */
  /* Command line: tokens (quotes, (sub expressions)), parameters       */
  /* ------------------------------------------------------------------ */
  function splitPipe(line) {
    let q = null, depth = 0;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (q) { if (ch === q) q = null; continue; }
      if (ch === '"' || ch === "'") q = ch;
      else if (ch === '(') depth++;
      else if (ch === ')') depth = Math.max(0, depth - 1);
      else if (ch === '|' && !depth) return [line.slice(0, i), line.slice(i + 1)];
    }
    return [line, ''];
  }
  function tokenize(line) {
    const out = [];
    let cur = '', q = null, depth = 0, any = false;
    for (const ch of line) {
      if (depth) { cur += ch; if (ch === '(') depth++; else if (ch === ')') depth--; continue; }
      if (q) { if (ch === q) q = null; else cur += ch; continue; }
      if (ch === '"' || ch === "'") { q = ch; any = true; continue; }
      if (ch === '(') { depth = 1; cur += ch; any = true; continue; }
      if (/\s/.test(ch)) { if (any) { out.push(cur); cur = ''; any = false; } continue; }
      cur += ch; any = true;
    }
    if (any) out.push(cur);
    return out;
  }
  const SWITCHES = new Set(['includemanagementtools', 'force', 'restart', 'reset', 'lockedout', 'accountdisabled', 'asplaintext', 'installdns', 'passthru', 'includeallsubfeature', 'recurse', 'all', 'detailed', 'examples', 'online']);
  function params(toks) {
    const P = { _: [] };
    for (let i = 0; i < toks.length; i++) {
      const t = toks[i], m = /^-([A-Za-z][\w]*)(?::(.*))?$/.exec(t);
      if (!m) { P._.push(t); continue; }
      const k = m[1].toLowerCase();
      if (m[2] !== undefined) { P[k] = m[2]; continue; }
      const nx = toks[i + 1];
      if (nx === undefined || SWITCHES.has(k) || /^-[A-Za-z]/.test(nx)) { P[k] = true; continue; }
      let v = nx;
      i++;
      while (/,$/.test(v) && toks[i + 1] !== undefined) v += toks[++i];
      P[k] = v;
    }
    return P;
  }
  const isTrue = (v) => v === true || /^\$?true$/i.test(String(v));
  const list = (v) => (v == null || v === true ? [] : String(v).replace(/^@?\(|\)$/g, '').split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean));
  // the password inside (ConvertTo-SecureString "..." -AsPlainText -Force); null = typed at a prompt (accepted)
  const secret = (v) => { if (v == null || v === true) return null; const m = /["']([^"']*)["']/.exec(String(v)); return m ? m[1] : /^\(/.test(String(v)) ? null : String(v); };
  // Windows complexity: 8+ characters and 3 of the 4 classes
  function weak(pw) {
    if (pw == null) return false;
    if (pw.length < 8) return true;
    return [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((r) => r.test(pw)).length < 3;
  }

  /* ------------------------------------------------------------------ */
  /* Directory, principals, ACLs                                         */
  /* ------------------------------------------------------------------ */
  function normPath(w, p) {
    if (!p) return null;
    let s = String(p).replace(/\//g, '\\').replace(/^["']|["']$/g, '');
    if (/^[a-z]:$/i.test(s)) s += '\\';
    if (!/^[a-z]:\\/i.test(s)) s = (w.cwd.replace(/\\$/, '') + '\\' + s);
    const parts = [];
    for (const seg of s.slice(3).split('\\')) {
      if (!seg || seg === '.') continue;
      if (seg === '..') parts.pop(); else parts.push(seg);
    }
    const out = s.slice(0, 2).toUpperCase() + '\\' + parts.join('\\');
    return /^C:\\/i.test(out) ? out : null;
  }
  const keyOf = (path) => low(path).replace(/\\$/, '') || 'c:\\';
  const dirKey = (path) => (keyOf(path) === 'c:' ? 'c:\\' : keyOf(path));
  const parentOf = (path) => { const i = path.replace(/\\$/, '').lastIndexOf('\\'); return i <= 2 ? 'C:\\' : path.slice(0, i); };
  function mkdir(w, path) {
    let p = path;
    const chain = [];
    while (!w.dirs[dirKey(p)]) { chain.unshift(p); p = parentOf(p); }
    if (Object.keys(w.dirs).length + chain.length > LIMIT.dirs) return false;
    for (const c of chain) w.dirs[dirKey(c)] = { path: c, inherit: true, acl: [] };
    return true;
  }
  function aclOf(w, path) {
    const dir = w.dirs[dirKey(path)];
    if (!dir) return [];
    const inh = dir.inherit && dirKey(path) !== 'c:\\' ? aclOf(w, parentOf(dir.path)).map((e) => ({ who: e.who, perm: e.perm, inh: true })) : [];
    return dir.acl.map((e) => ({ who: e.who, perm: e.perm, inh: false })).concat(inh);
  }
  // identifies one exact permission state (a lesson step "look at the final result" checks it)
  const aclHash = (w, path) => aclOf(w, path).map((e) => e.who + ':' + e.perm + (e.inh ? 'I' : '')).join('|');
  // "CORP\Financeiro", "Financeiro", "Administrators" → canonical display name, or null if unknown
  function principal(w, name) {
    let n = String(name || '').replace(/^["']|["']$/g, '').trim();
    const m = /^([^\\]+)\\(.+)$/.exec(n);
    if (m) {
      const dom = low(m[1]);
      if (dom === 'builtin' || dom === 'nt authority') n = m[2];
      else if (w.domain && dom === low(w.domain.netbios)) n = m[2];
      else if (dom === low(w.host)) n = m[2];
      else return null;
    }
    const k = low(n);
    if (BUILTIN[k]) return BUILTIN[k];
    if (w.domain) {
      if (w.groups[k]) return w.domain.netbios + '\\' + w.groups[k].name;
      if (w.users[k]) return w.domain.netbios + '\\' + w.users[k].sam;
    } else if (w.local.some((u) => low(u) === k)) return w.host + '\\' + w.local.find((u) => low(u) === k);
    return null;
  }
  const sameWho = (a, b) => low(a) === low(b);

  /* ------------------------------------------------------------------ */
  /* DNS / DHCP models                                                   */
  /* ------------------------------------------------------------------ */
  function zoneFor(w, fqdn) {
    let best = null;
    for (const z of Object.values(w.zones)) if ((fqdn === low(z.name) || fqdn.endsWith('.' + low(z.name))) && (!best || z.name.length > best.name.length)) best = z;
    return best;
  }
  // returns { ip, chain } | { err, hint }
  function resolve(d, name, server) {
    const w = W(d);
    let fq = low(name).replace(/\.$/, '');
    if (!fq) return { err: 'nome vazio' };
    if (ipOk(fq)) return { ip: fq, chain: [] };
    if (fq === 'localhost') return { ip: '127.0.0.1', chain: [] };
    if (fq.indexOf('.') < 0 && w.domain) fq += '.' + low(w.domain.name);
    const dnsList = server ? [server] : w.dnsClient;
    if (!dnsList.length) return { err: 'nenhum servidor DNS configurado no adaptador', hint: 'Configure com Set-DnsClientServerAddress -InterfaceAlias Ethernet -ServerAddresses <ip>.' };
    const dns = dnsList[0];
    const self = dns === '127.0.0.1' || dns === myIp(d);
    if (!self) {
      if (!d.os.route && !(ipOk(dns) && net24(dns) === net24(myIp(d)))) return { err: 'o servidor DNS ' + dns + ' está inacessível', hint: 'Sem rota até ele: confira o gateway (Get-NetIPConfiguration).' };
      // a member server asking the domain controller: the DC answers from its own zones
      const D = game(), dc = D && D.ops ? D.ops.devices().find((x) => x !== d && x.ip === dns && ready(x) && has(W(x), 'DNS')) : null;
      if (dc) return dc.state === 'online' && D.ops.health(dc).up ? resolve(dc, name, '127.0.0.1') : { err: 'o servidor DNS ' + dns + ' não responde', hint: 'O ' + dc.name + ' está fora do ar.' };
      if (w.domain && fq.endsWith(low(w.domain.name))) return { err: 'DNS name does not exist', hint: 'O DNS ' + dns + ' não conhece a zona interna ' + w.domain.name + '. Num domínio, o servidor deve usar o próprio DC como DNS (127.0.0.1).' };
      return external(d, fq);
    }
    if (!has(w, 'DNS') || !running(w, 'DNS')) return { err: 'This operation returned because the timeout period expired', hint: 'O serviço DNS Server deste servidor não está rodando (Get-Service DNS).' };
    const chain = [];
    for (let hop = 0; hop < 6; hop++) {
      const z = zoneFor(w, fq);
      if (!z) {
        if (w.forwarders.length || d.os.route) return Object.assign(external(d, fq), { chain });
        return { err: 'DNS name does not exist', chain };
      }
      const rel = fq === low(z.name) ? '@' : fq.slice(0, -(z.name.length + 1));
      const a = z.records.find((r) => low(r.name) === rel && r.type === 'A');
      if (a) return { ip: a.data, chain };
      const c = z.records.find((r) => low(r.name) === rel && r.type === 'CNAME');
      if (!c) return { err: 'DNS name does not exist', hint: 'A zona ' + z.name + ' não tem registro "' + rel + '" (Get-DnsServerResourceRecord -ZoneName ' + z.name + ').', chain };
      chain.push([fq, c.data]);
      fq = low(c.data).replace(/\.$/, '');
    }
    return { err: 'loop de CNAME', chain };
  }
  function external(d, fq) {
    if (!d.os.route) return { err: 'DNS name does not exist', hint: 'Sem gateway o servidor não chega à internet.' };
    let h = 0;
    for (const ch of fq) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return { ip: [142, 250, (h >> 8) & 255, h & 255].join('.'), chain: [], ext: true };
  }
  // fixed addresses in use on 10.0.1.0/24 (devices, gateway)
  function fixedIps() {
    const out = new Map([['10.0.1.1', 'gateway']]);
    const D = game();
    if (D && D.ops) for (const x of D.ops.devices()) if (x.ip) out.set(x.ip, x.name);
    return out;
  }
  function leasesOf(d, s) {
    const w = W(d);
    if (s.state !== 'Active' || !running(w, 'DHCPServer') || !s.router) return [];
    if (w.domain && !w.dhcp.authorized) return [];
    const D = game();
    const items = D ? D.scene.world.items : [];
    const desks = items.filter((e) => e.kind === 'desk').length, aps = items.filter((e) => e.kind === 'ap').length;
    const n = Math.min(ipNum(s.end) - ipNum(s.start) + 1, Math.max(2, desks + aps * 2));
    const out = [];
    const names = ['IMPRESSORA-01', 'NOTEBOOK-VISITA'];
    for (let i = 0; i < n; i++) {
      const v = ipNum(s.start) + i;
      out.push({ ip: [v >>> 24, (v >> 16) & 255, (v >> 8) & 255, v & 255].join('.'), host: i < desks ? 'PC-' + String(i + 1).padStart(3, '0') : i < desks + aps * 2 ? 'CELULAR-' + String(i - desks + 1).padStart(2, '0') : names[i - desks - aps * 2] || 'DISPOSITIVO-' + i });
    }
    return out;
  }

  /* ------------------------------------------------------------------ */
  /* Output helpers                                                      */
  /* ------------------------------------------------------------------ */
  function table(cols, rows) {
    const wid = cols.map((c, i) => Math.max(c.length, ...rows.map((r) => String(r[i] == null ? '' : r[i]).length)));
    const line = (r) => r.map((v, i) => String(v == null ? '' : v).padEnd(wid[i])).join(' ').replace(/\s+$/, '');
    return [esc(line(cols)), esc(line(cols.map((c) => '-'.repeat(c.length))))].concat(rows.map((r) => esc(line(r))));
  }
  const err = (out, ran, msg, hint) => { out.push('<span class="w">' + esc(msg) + '</span>'); if (hint) out.push('<span class="m">' + hint + '</span>'); ran.push('error'); };
  const notFound = (c) => c + ' : O termo \'' + c + '\' não é reconhecido como nome de cmdlet, função, arquivo de script ou programa operável. Verifique a grafia do nome ou, se um caminho tiver sido incluído, veja se o caminho está correto e tente novamente.';

  /* ------------------------------------------------------------------ */
  /* The shell                                                           */
  /* ------------------------------------------------------------------ */
  function winShell(d, line, ctx) {
    const w = W(d), out = [], ran = [];
    const raw = line.trim();
    if (!raw) return { out, ran };
    if (w.stage === 'media') return media(d, raw, ctx, out, ran);
    if (w.stage === 'oobe') return oobe(d, raw, ctx, out, ran);
    const [left] = splitPipe(raw);
    const toks = tokenize(left.trim());
    if (!toks.length) return { out, ran };
    const c0 = toks[0], c = low(c0).replace(/\.exe$/, ''), P = params(toks.slice(1)), arg = P._;
    const r = { out, ran, why: null };
    const fail = (msg, hint, why) => { err(out, ran, msg, hint); if (why) r.why = why; };
    const needAD = () => {
      if (!has(w, 'RSAT-AD-PowerShell')) { fail(notFound(c0), 'O módulo ActiveDirectory do PowerShell não está instalado: Install-WindowsFeature AD-Domain-Services -IncludeManagementTools.', 'Os comandos *-AD* vêm do módulo ActiveDirectory, instalado junto com a função AD DS quando você usa <code>-IncludeManagementTools</code>.'); ran.push('unknown'); return false; }
      if (!w.domain || !running(w, 'ADWS')) { fail('Unable to find a default server with Active Directory Web Services running.', w.domain ? 'O serviço ADWS está parado (Get-Service ADWS).' : 'Este servidor ainda não é controlador de domínio: promova com Install-ADDSForest.', 'Sem domínio não há onde criar usuários e grupos do AD. Primeiro instale a função e crie a floresta (Install-ADDSForest).'); return false; }
      return true;
    };
    const needDNS = () => {
      if (!has(w, 'RSAT-DNS-Server')) { fail(notFound(c0), 'Instale a função DNS com as ferramentas: Install-WindowsFeature DNS -IncludeManagementTools.'); ran.push('unknown'); return false; }
      if (!has(w, 'DNS') || !running(w, 'DNS')) { fail('Failed to get the zone information on server ' + w.host + '. O servidor RPC não está disponível.', 'O serviço DNS Server está parado: Start-Service DNS.'); return false; }
      return true;
    };
    const needDHCP = () => {
      if (!has(w, 'RSAT-DHCP')) { fail(notFound(c0), 'Instale a função DHCP com as ferramentas: Install-WindowsFeature DHCP -IncludeManagementTools.'); ran.push('unknown'); return false; }
      if (!has(w, 'DHCP') || !running(w, 'DHCPServer')) { fail('Failed to get version of the DHCP server ' + w.host + '. O servidor RPC não está disponível.', 'O serviço DHCP Server está parado: Start-Service DHCPServer.'); return false; }
      return true;
    };
    const user = (id) => w.users[low(String(id || '').replace(/^.*\\/, ''))];
    const group = (id) => w.groups[low(String(id || '').replace(/^.*\\/, ''))];
    const noIdentity = (id) => fail('Cannot find an object with identity: \'' + id + '\' under: \'' + dn(w) + '\'.', 'Confira o nome com Get-ADUser -Filter * ou Get-ADGroup -Filter *.');
    const ouOf = (path) => {
      if (!path || path === true) return { ou: null };
      const m = /OU=([^,]+)/i.exec(String(path));
      const dcs = (String(path).match(/DC=([^,]+)/gi) || []).map((x) => low(x.slice(3))).join('.');
      if (dcs && w.domain && dcs !== low(w.domain.name)) return { bad: true };
      if (/^CN=Users,/i.test(String(path))) return { ou: null };
      if (!m) return { ou: null };
      const ou = w.ous.find((o) => low(o) === low(m[1]));
      return ou ? { ou } : { bad: true };
    };

    switch (c) {
      /* ---------- basics ---------- */
      case 'help': case 'get-help': case 'man': return helpCmd(d, arg[0] || (P.name && P.name !== true ? P.name : ''), r);
      case 'get-command': case 'gcm':
        out.push('Comandos deste Windows Server (simulado):');
        for (const [cat, cmds] of CMD_GROUPS) out.push('  <b>' + esc(cat) + '</b>: ' + esc(cmds));
        break;
      case 'cls': case 'clear': case 'clear-host': ctx.clear(); break;
      case 'exit': case 'logoff': ctx.close(); break;
      case 'get-history': case 'history': case 'h': ctx.history.forEach((x, i) => out.push(String(i + 1).padStart(4) + ' ' + esc(x))); break;
      case 'hostname': out.push(esc(w.host)); break;
      case 'whoami': out.push(esc(low(nb(w)) + '\\administrator')); break;
      case '$env:computername': out.push(esc(w.host)); break;
      case '$psversiontable': out.push('Name                           Value', '----                           -----', 'PSVersion                      5.1.20348.2849', 'PSEdition                      Desktop', 'BuildVersion                   10.0.20348.2849'); break;
      case 'get-date': case 'date': out.push(esc(new Date().toLocaleString('pt-BR'))); break;
      case 'cd': case 'set-location': case 'sl': case 'chdir': {
        const p = normPath(w, arg[0] || P.path || 'C:\\Users\\Administrator');
        if (!p || !w.dirs[dirKey(p)]) { fail('Set-Location : Não é possível localizar o caminho \'' + (arg[0] || P.path) + '\' porque ele não existe.'); break; }
        w.cwd = w.dirs[dirKey(p)].path;
        break;
      }
      case 'pwd': case 'get-location': out.push('Path', '----', esc(w.cwd)); break;
      case 'systeminfo': case 'get-computerinfo': {
        const m = DL.hwOf ? DL.hwOf(d) : null;
        out.push('Host Name:                 ' + esc(w.host), 'OS Name:                   Microsoft ' + esc(edName(w)), 'OS Version:                10.0.20348 N/A Build 20348',
          'OS Configuration:          ' + (w.domain ? 'Primary Domain Controller' : 'Standalone Server'), 'Domain:                    ' + esc(w.domain ? w.domain.name : 'WORKGROUP'),
          'Total Physical Memory:     ' + (m && m.ram ? (m.ram * 1024).toLocaleString('pt-BR') + ' MB' : '—'), 'Processor(s):              ' + esc(m ? m.cpu : '—'), 'Network Card(s):           1 NIC(s) Installed. [01]: Ethernet');
        ran.push('win-sysinfo');
        break;
      }
      case 'sconfig': {
        const ip = myIp(d);
        out.push('===============================================================================', '                     Windows Server Configuration (resumo)', '===============================================================================',
          '1) Domínio/grupo de trabalho:     ' + esc(w.domain ? 'Domínio: ' + w.domain.name : 'Grupo de trabalho: WORKGROUP'), '2) Nome do computador:            ' + esc(w.host) + (w.pending.name ? ' (pendente: ' + esc(w.pending.name) + ')' : ''),
          '8) Configurações de rede:         ' + (ip ? esc(ip) + ' (estático)' : 'DHCP / 169.254.x.x'), '13) Reiniciar o servidor', '',
          '<span class="m">No jogo o sconfig mostra só o resumo. Use os comandos equivalentes: 2 → Rename-Computer, 8 → New-NetIPAddress / Set-DnsClientServerAddress, 13 → Restart-Computer.</span>');
        break;
      }
      case 'rename-computer': {
        const nn = P.newname && P.newname !== true ? P.newname : arg[0];
        if (!nn) { fail('Rename-Computer : Falta um argumento para o parâmetro \'NewName\'.', 'Exemplo: Rename-Computer -NewName ' + esc(d.name) + ' -Restart'); break; }
        if (!/^[A-Za-z0-9-]{1,15}$/.test(nn) || /^\d+$/.test(nn)) { fail('Rename-Computer : O nome \'' + nn + '\' é inválido.', 'Nome NetBIOS: até 15 caracteres, letras, números e hífen (não pode ser só números).'); break; }
        if (w.domain) { fail('Rename-Computer : Renomear um controlador de domínio exige netdom e muito cuidado.', 'No jogo, defina o nome antes de promover o servidor a DC.'); break; }
        if (low(nn) === low(w.host)) { out.push('<span class="m">O computador já se chama ' + esc(nn) + '.</span>'); break; }
        w.pending.name = nn.toUpperCase();
        out.push('<span class="w">WARNING: As alterações terão efeito depois que você reiniciar o computador ' + esc(w.host) + '.</span>');
        ran.push('win-rename');
        if (P.restart) restart(d, out, ran);
        break;
      }
      case 'restart-computer': restart(d, out, ran); break;
      case 'shutdown':
        if (raw.indexOf('/r') >= 0) restart(d, out, ran);
        else fail('No jogo, use shutdown /r /t 0 para reiniciar (desligar tiraria o servidor do ar).');
        break;
      case 'stop-computer': fail('Desligar tiraria o servidor do ar. Use Restart-Computer para reiniciar.'); break;

      /* ---------- network ---------- */
      case 'ipconfig': {
        const a = low(raw);
        if (/\/flushdns/.test(a)) { out.push('Configuração de IP do Windows', '', 'Cache do DNS Resolver liberado com êxito.'); break; }
        if (/\/renew|\/release/.test(a)) { out.push('<span class="m">O adaptador Ethernet usa IP estático: não há concessão DHCP para renovar ou liberar.</span>'); break; }
        ipconfig(d, out, /\/all/.test(a));
        ran.push('ip-show');
        break;
      }
      case 'get-netadapter': {
        const e = eth(d), st = !e.up ? 'Disabled' : d.os.cable ? 'Up' : 'Disconnected';
        out.push.apply(out, table(['Name', 'InterfaceDescription', 'ifIndex', 'Status', 'MacAddress', 'LinkSpeed'], [['Ethernet', 'Intel(R) Ethernet Server Adapter', 4, st, e.mac.toUpperCase().replace(/:/g, '-'), st === 'Up' ? '1 Gbps' : '0 bps']]));
        if (st === 'Disabled') out.push('<span class="m">Status Disabled: o adaptador foi desabilitado. Enable-NetAdapter -Name Ethernet liga de novo.</span>');
        if (st === 'Disconnected') out.push('<span class="m">Status Disconnected: sem sinal no cabo — é camada física, confira o cabeamento do rack.</span>');
        ran.push('link-show');
        break;
      }
      case 'enable-netadapter': case 'disable-netadapter': {
        const nm = P.name && P.name !== true ? P.name : arg[0];
        if (low(nm) !== 'ethernet') { fail(c0 + ' : Nenhum objeto MSFT_NetAdapter encontrado com a propriedade \'Name\' igual a \'' + (nm || '') + '\'.', 'O adaptador deste servidor se chama Ethernet (veja Get-NetAdapter).'); break; }
        eth(d).up = c === 'enable-netadapter';
        ran.push('link-set');
        if (eth(d).up && !d.os.cable) out.push('<span class="m">(o adaptador foi habilitado, mas não há cabo: continua Disconnected)</span>');
        break;
      }
      case 'get-netipaddress': case 'get-netipconfiguration': case 'gip': {
        const e = eth(d), ip = myIp(d);
        if (c === 'get-netipaddress') out.push.apply(out, table(['IPAddress', 'InterfaceAlias', 'PrefixLength', 'PrefixOrigin'], [[ip || apipa(d), 'Ethernet', ip ? 24 : 16, ip ? 'Manual' : 'WellKnown'], ['127.0.0.1', 'Loopback Pseudo-Interface 1', 8, 'WellKnown']]));
        else out.push('InterfaceAlias       : Ethernet', 'InterfaceIndex       : 4', 'IPv4Address          : ' + esc(ip || apipa(d)), 'IPv4DefaultGateway   : ' + esc(d.os.route || ''), 'DNSServer            : ' + esc(w.dnsClient.join(', ')), 'NetAdapter.Status    : ' + (!e.up ? 'Disabled' : d.os.cable ? 'Up' : 'Disconnected'));
        ran.push('ip-show');
        break;
      }
      case 'new-netipaddress': {
        const alias = P.interfacealias, idx = P.interfaceindex, ip = P.ipaddress, pre = P.prefixlength, gw = P.defaultgateway;
        if (alias && low(alias) !== 'ethernet' || idx && String(idx) !== '4') { fail('New-NetIPAddress : Nenhum objeto MSFT_NetAdapter encontrado com a propriedade \'InterfaceAlias\' igual a \'' + (alias || idx) + '\'.', 'Use -InterfaceAlias Ethernet (veja Get-NetAdapter).'); break; }
        if (!alias && !idx) { fail('New-NetIPAddress : Informe o adaptador: -InterfaceAlias Ethernet.', 'Exemplo: New-NetIPAddress -InterfaceAlias Ethernet -IPAddress ' + esc(d.ip) + ' -PrefixLength 24 -DefaultGateway 10.0.1.1'); break; }
        if (!ipOk(ip)) { fail('New-NetIPAddress : Endereço IP inválido: \'' + (ip === true ? '' : ip || '') + '\'.', 'Formato: -IPAddress 10.0.1.12'); break; }
        const n = parseInt(pre, 10);
        if (!(n >= 8 && n <= 30)) { fail('New-NetIPAddress : -PrefixLength inválido.', '-PrefixLength 24 equivale à máscara 255.255.255.0 (256 endereços).', 'O prefixo diz quantos bits são da rede: <b>24</b> = 255.255.255.0, a máscara usada aqui.'); break; }
        if (gw !== undefined && !ipOk(gw)) { fail('New-NetIPAddress : Gateway inválido.'); break; }
        if (gw && net24(gw) !== net24(ip)) { fail('New-NetIPAddress : O gateway padrão precisa estar na mesma sub-rede do endereço IP.', 'Com /24, o gateway de ' + esc(ip) + ' fica em ' + esc(net24(ip)) + '.x — aqui é 10.0.1.1.'); break; }
        const cidr = ip + '/' + n;
        if (eth(d).ips.indexOf(cidr) >= 0) { fail('New-NetIPAddress : Instance MSFT_NetIPAddress already exists.', 'O IP já está configurado (Get-NetIPAddress).'); break; }
        if (gw && d.os.route) { fail('New-NetIPAddress : Instance MSFT_NetRoute already exists.', 'Já existe um gateway padrão. Para trocar: Remove-NetRoute -DestinationPrefix 0.0.0.0/0 -Confirm:$false'); break; }
        const clash = ip !== d.ip && fixedIps().get(ip);
        eth(d).ips.push(cidr);
        if (gw) d.os.route = gw;
        out.push.apply(out, table(['IPAddress', 'InterfaceAlias', 'PrefixLength', 'AddressState'], [[ip, 'Ethernet', n, 'Preferred']]));
        if (clash) out.push('<span class="w">Atenção: ' + esc(ip) + ' já é usado por ' + esc(clash) + ' — conflito de IP. O planejado para este servidor é ' + esc(d.ip) + '.</span>');
        else if (ip !== d.ip) out.push('<span class="m">O IP planejado para este servidor é ' + esc(d.ip) + ' (o monitoramento procura esse endereço).</span>');
        ran.push('ip-set');
        if (gw) ran.push('route-set');
        break;
      }
      case 'remove-netipaddress': {
        const ip = P.ipaddress || arg[0], i = eth(d).ips.findIndex((x) => x.split('/')[0] === ip);
        if (i < 0) { fail('Remove-NetIPAddress : Nenhum objeto MSFT_NetIPAddress encontrado com IPAddress \'' + (ip || '') + '\'.'); break; }
        eth(d).ips.splice(i, 1);
        if (P.defaultgateway) d.os.route = null;
        ran.push('ip-set');
        break;
      }
      case 'remove-netroute':
        if (!d.os.route) { fail('Remove-NetRoute : Nenhuma rota padrão encontrada.'); break; }
        d.os.route = null;
        ran.push('route-del');
        break;
      case 'get-netroute': out.push.apply(out, table(['DestinationPrefix', 'NextHop', 'RouteMetric', 'ifIndex'], (d.os.route ? [['0.0.0.0/0', d.os.route, 0, 4]] : []).concat(myIp(d) ? [[net24(myIp(d)) + '.0/24', '0.0.0.0', 256, 4]] : []))); ran.push('route-show'); break;
      case 'set-dnsclientserveraddress': {
        if (P.interfacealias && low(P.interfacealias) !== 'ethernet') { fail('Set-DnsClientServerAddress : Adaptador \'' + P.interfacealias + '\' não encontrado.', 'Use -InterfaceAlias Ethernet.'); break; }
        if (P.resetserveraddresses) { w.dnsClient = []; ran.push('dns-client'); break; }
        const addrs = list(P.serveraddresses);
        if (!addrs.length || !addrs.every(ipOk)) { fail('Set-DnsClientServerAddress : Informe -ServerAddresses com IPs válidos.', 'Exemplo: Set-DnsClientServerAddress -InterfaceAlias Ethernet -ServerAddresses 127.0.0.1'); break; }
        w.dnsClient = addrs.slice(0, 3);
        ran.push('dns-client');
        break;
      }
      case 'get-dnsclientserveraddress': out.push.apply(out, table(['InterfaceAlias', 'Interface Index', 'Address Family', 'ServerAddresses'], [['Ethernet', 4, 'IPv4', '{' + w.dnsClient.join(', ') + '}']])); ran.push('dns-client-show'); break;
      case 'clear-dnsclientcache': break;
      case 'ping': case 'test-connection': {
        const host = P.computername && P.computername !== true ? P.computername : P.targetname && P.targetname !== true ? P.targetname : arg.filter((x) => !/^\d+$/.test(x) || /\./.test(x))[0];
        if (!host) { fail(c === 'ping' ? 'Uso: ping <destino>' : 'Test-Connection : Informe -ComputerName.', 'Exemplo: ' + (c === 'ping' ? 'ping 10.0.1.1' : 'Test-Connection 10.0.1.1')); break; }
        ping(d, host, ctx, out, ran, c === 'ping');
        break;
      }
      case 'test-netconnection': case 'tnc': {
        const host = P.computername && P.computername !== true ? P.computername : arg[0] || 'internetbeacon.msedge.net';
        const rs = resolve(d, host), port = parseInt(P.port, 10);
        const reach = rs.ip ? ctx.reach(d, rs.ip) : { ok: false };
        out.push('ComputerName     : ' + esc(host), 'RemoteAddress    : ' + esc(rs.ip || ''), 'InterfaceAlias   : Ethernet', 'SourceAddress    : ' + esc(myIp(d)));
        if (port) {
          const self = rs.ip === myIp(d) || rs.ip === '127.0.0.1';
          const open = reach.ok && (!self || (port === 53 && running(w, 'DNS')) || ((port === 389 || port === 88 || port === 445) && running(w, 'NTDS')) || (port === 445 && running(w, 'LanmanServer')) || port === 5985);
          out.push('RemotePort       : ' + port, 'TcpTestSucceeded : ' + (open ? '<span class="ok">True</span>' : '<span class="w">False</span>'));
        } else out.push('PingSucceeded    : ' + (reach.ok ? '<span class="ok">True</span>' : '<span class="w">False</span>'));
        if (!rs.ip) out.push('<span class="m">Falha ao resolver o nome: ' + esc(rs.err) + '.</span>');
        if (reach.ok && rs.ip) ran.push('ping-ok:' + rs.ip);
        break;
      }
      case 'nslookup': case 'resolve-dnsname': {
        const name = P.name && P.name !== true ? P.name : arg[0];
        const srv = P.server && P.server !== true ? P.server : c === 'nslookup' ? arg[1] : null;
        if (!name) { fail(c === 'nslookup' ? 'Uso: nslookup <nome> [servidor]' : 'Resolve-DnsName : Informe o nome.', 'Exemplo: Resolve-DnsName www.' + (w.domain ? esc(w.domain.name) : 'corp.datalab.local')); break; }
        const rs = resolve(d, name, srv);
        const via = srv || w.dnsClient[0] || '—';
        if (c === 'nslookup') out.push('Servidor:  ' + (via === '127.0.0.1' || via === myIp(d) ? 'localhost' : 'UnKnown'), 'Address:  ' + esc(via), '');
        if (rs.ip) {
          if (c === 'nslookup') { out.push((rs.ext ? 'Não é resposta autoritativa:' : ''), 'Nome:    ' + esc(rs.chain.length ? rs.chain[rs.chain.length - 1][1] : name), 'Address:  ' + esc(rs.ip)); if (rs.chain.length) out.push('Aliases:  ' + esc(rs.chain.map((x) => x[0]).join(', '))); }
          else out.push.apply(out, table(['Name', 'Type', 'TTL', 'Section', 'IPAddress / NameHost'], rs.chain.map((x) => [x[0], 'CNAME', 3600, 'Answer', x[1]]).concat([[rs.chain.length ? rs.chain[rs.chain.length - 1][1] : low(name), 'A', 3600, 'Answer', rs.ip]])));
          ran.push('win-dns-ok:' + low(name).replace(/\.$/, ''));
        } else {
          fail(c === 'nslookup' ? '*** ' + (via === '127.0.0.1' ? 'localhost' : 'UnKnown') + ' não encontrou ' + name + ': Non-existent domain' : 'Resolve-DnsName : ' + name + ' : ' + rs.err, rs.hint ? esc(rs.hint) : null);
        }
        break;
      }

      /* ---------- roles and features ---------- */
      case 'get-windowsfeature': {
        const only = P.name && P.name !== true ? low(P.name) : arg[0] ? low(arg[0]) : null;
        const rows = Object.entries(FEATURES).filter(([k]) => !only || low(k) === only || (only.indexOf('*') >= 0 && low(k).indexOf(only.replace(/\*/g, '')) >= 0));
        out.push('Display Name                                            Name                       Install State', '------------                                            ----                       -------------');
        for (const [k, f] of rows) out.push(esc(('[' + (has(w, k) ? 'X' : ' ') + '] ' + f.display).padEnd(56) + k.padEnd(27) + (has(w, k) ? 'Installed' : 'Available')));
        ran.push('win-features');
        break;
      }
      case 'install-windowsfeature': case 'add-windowsfeature': {
        const names = list(P.name && P.name !== true ? P.name : arg.join(','));
        if (!names.length) { fail('Install-WindowsFeature : Informe o nome do recurso.', 'Exemplo: Install-WindowsFeature AD-Domain-Services -IncludeManagementTools (veja os nomes com Get-WindowsFeature).'); break; }
        const keys = names.map((n) => Object.keys(FEATURES).find((k) => low(k) === low(n)));
        const badName = names.find((n, i) => !keys[i]);
        if (badName) { fail('Install-WindowsFeature : ArgumentNotValid: O nome de função, serviço de função ou recurso não é válido: \'' + badName + '\'.', 'Nomes válidos: ' + Object.keys(FEATURES).join(', ') + '.', 'Use o <b>Name</b> da coluna do meio de <code>Get-WindowsFeature</code>, não o nome de exibição.'); break; }
        const before = w.features.length;
        for (const k of keys) {
          if (!has(w, k)) w.features.push(k);
          if (P.includemanagementtools) for (const t of FEATURES[k].tools || []) if (!has(w, t)) w.features.push(t);
          for (const s of FEATURES[k].svc || []) if (!w.svc[s]) w.svc[s] = 'Running';
        }
        const changed = w.features.length > before;
        out.push.apply(out, table(['Success', 'Restart Needed', 'Exit Code', 'Feature Result'], [['True', 'No', changed ? 'Success' : 'NoChangeNeeded', '{' + keys.map((k) => FEATURES[k].display).join(', ') + '}']]));
        if (keys.some((k) => FEATURES[k].tools) && !P.includemanagementtools) out.push('<span class="m">Sem -IncludeManagementTools os cmdlets de gerenciamento (módulos do PowerShell) não foram instalados.</span>');
        if (keys.indexOf('AD-Domain-Services') >= 0 && !w.domain) out.push('<span class="m">A função AD DS está instalada, mas o servidor ainda não é controlador de domínio. Próximo passo: Install-ADDSForest -DomainName corp.datalab.local</span>');
        if (keys.indexOf('DHCP') >= 0) out.push('<span class="m">DHCP instalado. Crie um escopo (Add-DhcpServerv4Scope) e, num domínio, autorize o servidor (Add-DhcpServerInDC).</span>');
        event(w, 'System', 1610, 'Information', 'Recursos instalados: ' + keys.join(', '));
        ran.push('win-feature-install');
        break;
      }
      case 'uninstall-windowsfeature': case 'remove-windowsfeature': {
        const names = list(P.name && P.name !== true ? P.name : arg.join(','));
        const k = Object.keys(FEATURES).find((x) => low(x) === low(names[0]));
        if (!k) { fail('Uninstall-WindowsFeature : Recurso inválido.'); break; }
        if (k === 'AD-Domain-Services' && w.domain) { fail('Uninstall-WindowsFeature : O servidor é controlador de domínio.', 'Remover o AD DS exige rebaixar o DC (Uninstall-ADDSDomainController) — fora do escopo do jogo.'); break; }
        if (k === 'DNS' && w.domain) { fail('Uninstall-WindowsFeature : O DNS integrado ao AD é usado pelo domínio.', 'Sem DNS o domínio para de funcionar: os clientes acham o DC por registros SRV no DNS.'); break; }
        w.features = w.features.filter((x) => x !== k && (FEATURES[k].tools || []).indexOf(x) < 0);
        for (const s of FEATURES[k].svc || []) delete w.svc[s];
        out.push.apply(out, table(['Success', 'Restart Needed', 'Exit Code', 'Feature Result'], [['True', 'No', 'Success', '{' + FEATURES[k].display + '}']]));
        break;
      }

      /* ---------- services and logs ---------- */
      case 'get-service': case 'gsv': {
        const nm = P.name && P.name !== true ? P.name : arg[0];
        let rows = Object.keys(w.svc).sort();
        if (nm) {
          const pat = new RegExp('^' + low(nm).replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$');
          rows = rows.filter((s) => pat.test(low(s)) || pat.test(low(SERVICES[s] || '')));
          if (!rows.length) { fail('Get-Service : Não é possível localizar nenhum serviço com o nome de serviço \'' + nm + '\'.', 'Liste todos com Get-Service.'); break; }
        }
        out.push.apply(out, table(['Status', 'Name', 'DisplayName'], rows.map((s) => [w.svc[s], s, SERVICES[s] || s])).map((l) => l.replace(/^Stopped/, '<span class="w">Stopped</span>').replace(/^Running/, '<span class="ok">Running</span>')));
        ran.push('win-svc-list');
        for (const s of rows) { ran.push('win-svc:' + low(s)); if (running(w, s)) ran.push('win-svc-ok:' + low(s)); }
        break;
      }
      case 'start-service': case 'stop-service': case 'restart-service': case 'sasv': case 'spsv': {
        const nm = P.name && P.name !== true ? P.name : arg[0];
        const s = Object.keys(w.svc).find((x) => low(x) === low(nm) || low(SERVICES[x] || '') === low(nm));
        if (!s) { fail(c0 + ' : Não é possível localizar nenhum serviço com o nome de serviço \'' + (nm || '') + '\'.', 'Veja os nomes com Get-Service.'); break; }
        const stop = c === 'stop-service' || c === 'spsv';
        if (stop && s === 'EventLog') { fail('Stop-Service : O serviço EventLog não pode ser parado.'); break; }
        w.svc[s] = stop ? 'Stopped' : 'Running';
        event(w, 'System', 7036, 'Information', 'O serviço ' + (SERVICES[s] || s) + ' entrou no estado ' + (stop ? 'parado' : 'em execução') + '.');
        if (!stop && w.faultSvc === s) w.faultSvc = null;
        ran.push('svc-' + (stop ? 'stop' : 'start') + ':' + low(s));
        if (stop && (s === 'DNS' || s === 'NTDS')) out.push('<span class="w">Atenção: sem ' + esc(SERVICES[s]) + ' o domínio e os serviços que dependem de DNS param de funcionar.</span>');
        break;
      }
      case 'get-winevent': case 'get-eventlog': {
        const logName = low(P.logname && P.logname !== true ? P.logname : arg[0] || 'System');
        const n = Math.min(20, parseInt(P.maxevents || P.newest, 10) || 8);
        if (logName !== 'system' && logName !== 'security') { fail(c0 + ' : Não há log chamado \'' + logName + '\' neste servidor (use System ou Security).'); break; }
        const rows = w.events.filter((e) => low(e.log) === logName).slice(0, n);
        if (!rows.length) out.push('<span class="m">Nenhum evento no log ' + esc(logName) + '.</span>');
        else out.push.apply(out, table(['TimeCreated', 'Id', 'LevelDisplayName', 'Message'], rows.map((e) => [new Date(e.t).toLocaleTimeString('pt-BR'), e.id, e.lvl, e.msg])));
        ran.push('win-events', 'win-events:' + logName);
        break;
      }

      /* ---------- Active Directory ---------- */
      case 'install-addsforest': {
        if (!has(w, 'AD-Domain-Services')) { fail(notFound(c0), 'O cmdlet vem com a função AD DS: Install-WindowsFeature AD-Domain-Services -IncludeManagementTools', 'Para promover o servidor a controlador de domínio, a função <b>AD-Domain-Services</b> precisa estar instalada antes.'); ran.push('unknown'); break; }
        if (w.domain) { fail('Install-ADDSForest : Este computador já é controlador do domínio ' + w.domain.name + '.'); break; }
        const name = low(P.domainname && P.domainname !== true ? P.domainname : '');
        if (!/^[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})+$/.test(name)) { fail('Install-ADDSForest : Informe -DomainName com um nome DNS completo (FQDN).', 'Exemplo: Install-ADDSForest -DomainName corp.datalab.local -InstallDns', 'O domínio do AD é também uma zona DNS, por isso precisa de pelo menos um ponto: <code>corp.datalab.local</code>.'); break; }
        if (!myIp(d)) { fail('Install-ADDSForest : Falha na verificação de pré-requisitos: o adaptador Ethernet não tem IP estático.', 'Um controlador de domínio precisa de IP fixo: New-NetIPAddress …', 'Os clientes encontram o DC pelo DNS. Se o IP mudasse, ninguém acharia o domínio — por isso o DC exige IP estático.'); break; }
        if (w.pending.name) { fail('Install-ADDSForest : Há uma renomeação pendente.', 'Reinicie antes (Restart-Computer) para o novo nome valer.'); break; }
        const netbios = String(P.domainnetbiosname && P.domainnetbiosname !== true ? P.domainnetbiosname : name.split('.')[0]).toUpperCase().slice(0, 15);
        out.push('Validando os pré-requisitos do ambiente…', '<span class="ok">Verificação de pré-requisitos concluída com êxito.</span>');
        if (!P.safemodeadministratorpassword) out.push('<span class="m">SafeModeAdministratorPassword: a senha do modo de restauração (DSRM) normalmente é pedida aqui. No jogo ela é definida automaticamente.</span>');
        out.push('Instalando a floresta ' + esc(name) + ' (NetBIOS ' + esc(netbios) + ')…', 'Configurando o serviço DNS e a zona ' + esc(name) + '…', 'Criando o banco de dados do AD (NTDS.dit) e o SYSVOL…');
        promote(d, name, netbios);
        out.push('<span class="ok">Operação concluída. O computador será reiniciado.</span>');
        restart(d, out, ran, true);
        ran.push('win-forest');
        break;
      }
      case 'get-addomain': case 'get-adforest': case 'get-addomaincontroller': {
        if (!needAD()) break;
        const dm = w.domain;
        if (c === 'get-addomaincontroller') out.push('Name            : ' + esc(w.host), 'Domain          : ' + esc(dm.name), 'IPv4Address     : ' + esc(myIp(d)), 'IsGlobalCatalog : True', 'OperatingSystem : ' + esc(edName(w)), 'Site            : Default-First-Site-Name');
        else out.push('DNSRoot              : ' + esc(dm.name), 'NetBIOSName          : ' + esc(dm.netbios), 'DistinguishedName    : ' + esc(dn(w)), 'Forest               : ' + esc(dm.name), 'DomainMode           : Windows2016Domain', 'PDCEmulator          : ' + esc(low(w.host) + '.' + dm.name), 'UsersContainer       : CN=Users,' + esc(dn(w)));
        ran.push('win-addomain');
        break;
      }
      case 'new-adorganizationalunit': {
        if (!needAD()) break;
        const nm = P.name && P.name !== true ? P.name : arg[0];
        if (!nm || !/^[\w .-]{1,40}$/.test(nm)) { fail('New-ADOrganizationalUnit : Informe -Name.', 'Exemplo: New-ADOrganizationalUnit -Name TI'); break; }
        if (w.ous.some((o) => low(o) === low(nm))) { fail('New-ADOrganizationalUnit : Foi feita uma tentativa de adicionar um objeto ao diretório com um nome que já está em uso.'); break; }
        if (w.ous.length >= LIMIT.ous) { fail('Limite de OUs do jogo atingido.'); break; }
        w.ous.push(nm);
        ran.push('win-ou');
        break;
      }
      case 'get-adorganizationalunit': {
        if (!needAD()) break;
        out.push.apply(out, table(['Name', 'DistinguishedName'], w.ous.map((o) => [o, 'OU=' + o + ',' + dn(w)])));
        ran.push('win-ou-list');
        break;
      }
      case 'new-aduser': {
        if (!needAD()) break;
        const nm = P.name && P.name !== true ? P.name : arg[0];
        if (!nm) { fail('New-ADUser : Não é possível validar o argumento no parâmetro \'Name\'. O argumento é nulo ou vazio.', 'Exemplo: New-ADUser -Name "Ana Souza" -SamAccountName ana.souza -AccountPassword (Read-Host -AsSecureString) -Enabled $true'); break; }
        const sam = low(P.samaccountname && P.samaccountname !== true ? P.samaccountname : nm.replace(/\s+/g, '.'));
        if (!/^[a-z0-9._-]{1,20}$/.test(sam)) { fail('New-ADUser : SamAccountName inválido: \'' + sam + '\'.', 'Até 20 caracteres: letras, números, ponto, hífen ou _.', 'O <b>SamAccountName</b> é o login (CORP\\ana.souza). O <b>Name</b> é o nome de exibição.'); break; }
        if (w.users[sam] || w.groups[sam]) { fail('New-ADUser : A conta especificada já existe.'); break; }
        if (Object.keys(w.users).length >= LIMIT.users) { fail('Limite de usuários do jogo atingido.'); break; }
        const where = ouOf(P.path);
        if (where.bad) { fail('New-ADUser : Objeto de diretório não encontrado (Path).', 'A OU precisa existir: New-ADOrganizationalUnit -Name TI. Path: "OU=TI,' + esc(dn(w)) + '"'); break; }
        const pw = P.accountpassword !== undefined ? secret(P.accountpassword) : undefined;
        const enable = isTrue(P.enabled);
        if (pw !== undefined && weak(pw)) { fail('New-ADUser : A senha não atende aos requisitos de comprimento, complexidade ou histórico do domínio.', 'Política padrão: 8+ caracteres com 3 destes: maiúscula, minúscula, número e símbolo.', 'A política de senha do domínio recusou a senha. Use algo como <code>Datalab@2026</code>.'); break; }
        if (enable && pw === undefined) { fail('New-ADUser : A senha não atende aos requisitos de comprimento, complexidade ou histórico do domínio.', 'Uma conta só pode ser habilitada com senha: acrescente -AccountPassword (ConvertTo-SecureString "Senha@123" -AsPlainText -Force).', 'Conta sem senha não pode ficar habilitada. Informe <code>-AccountPassword</code> junto com <code>-Enabled $true</code>.'); break; }
        w.users[sam] = { sam, name: nm.slice(0, 40), ou: where.ou, enabled: enable, locked: false, pwd: pw !== undefined };
        if (!enable) out.push('<span class="m">Conta criada DESABILITADA (padrão do New-ADUser). Depois de definir a senha: Enable-ADAccount -Identity ' + esc(sam) + '</span>');
        event(w, 'Security', 4720, 'Information', 'Uma conta de usuário foi criada: ' + sam);
        ran.push('win-aduser-new');
        break;
      }
      case 'get-aduser': {
        if (!needAD()) break;
        const id = P.identity && P.identity !== true ? P.identity : arg[0];
        let rows = Object.values(w.users);
        if (id && !(P.filter)) { const u = user(id); if (!u) { noIdentity(id); break; } rows = [u]; }
        out.push.apply(out, table(['SamAccountName', 'Name', 'Enabled', 'LockedOut', 'Container'], rows.map((u) => [u.sam, u.name, u.enabled ? 'True' : 'False', u.locked ? 'True' : 'False', u.ou ? 'OU=' + u.ou : 'CN=Users'])));
        ran.push('win-aduser-list');
        if (!rows.some((u) => u.locked)) ran.push('win-locked-clear');
        break;
      }
      case 'set-adaccountpassword': {
        if (!needAD()) break;
        const u = user(P.identity && P.identity !== true ? P.identity : arg[0]);
        if (!u) { noIdentity(P.identity || arg[0] || ''); break; }
        const pw = secret(P.newpassword);
        if (P.newpassword === undefined) { fail('Set-ADAccountPassword : Informe -NewPassword.', 'Exemplo: Set-ADAccountPassword -Identity ' + esc(u.sam) + ' -Reset -NewPassword (ConvertTo-SecureString "Datalab@2026" -AsPlainText -Force)'); break; }
        if (weak(pw)) { fail('Set-ADAccountPassword : A senha não atende aos requisitos de comprimento, complexidade ou histórico do domínio.', 'Use 8+ caracteres com maiúscula, minúscula, número e símbolo.'); break; }
        u.pwd = true;
        event(w, 'Security', 4724, 'Information', 'Foi feita uma tentativa de redefinir a senha da conta ' + u.sam);
        ran.push('win-pwd');
        break;
      }
      case 'enable-adaccount': case 'disable-adaccount': case 'unlock-adaccount': {
        if (!needAD()) break;
        const id = P.identity && P.identity !== true ? P.identity : arg[0], u = user(id);
        if (!u) { noIdentity(id || ''); break; }
        if (c === 'enable-adaccount') {
          if (!u.pwd) { fail('Enable-ADAccount : A senha não atende aos requisitos de comprimento, complexidade ou histórico do domínio.', 'Defina a senha antes: Set-ADAccountPassword -Identity ' + esc(u.sam) + ' -Reset -NewPassword (...)'); break; }
          u.enabled = true;
          event(w, 'Security', 4722, 'Information', 'Uma conta de usuário foi habilitada: ' + u.sam);
        } else if (c === 'disable-adaccount') {
          if (u.sam === 'administrator') { fail('Disable-ADAccount : Desabilitar o Administrator do domínio deixaria você sem acesso.', 'Boa prática real: crie outra conta de administrador antes.'); break; }
          u.enabled = false;
          event(w, 'Security', 4725, 'Information', 'Uma conta de usuário foi desabilitada: ' + u.sam);
        } else {
          u.locked = false;
          event(w, 'Security', 4767, 'Information', 'Uma conta de usuário foi desbloqueada: ' + u.sam);
        }
        ran.push('win-' + c);
        break;
      }
      case 'search-adaccount': {
        if (!needAD()) break;
        if (!P.lockedout && !P.accountdisabled) { fail('Search-ADAccount : Informe o que procurar: -LockedOut ou -AccountDisabled.'); break; }
        const rows = Object.values(w.users).filter((u) => (P.lockedout ? u.locked : !u.enabled));
        if (!rows.length) out.push('<span class="m">Nenhuma conta encontrada.</span>');
        else out.push.apply(out, table(['SamAccountName', 'Name', 'Enabled', 'LockedOut'], rows.map((u) => [u.sam, u.name, u.enabled ? 'True' : 'False', u.locked ? 'True' : 'False'])));
        if (P.lockedout) { ran.push('win-locked-search'); if (!rows.length) ran.push('win-locked-clear'); }
        else ran.push('win-disabled-search');
        break;
      }
      case 'remove-aduser': {
        if (!needAD()) break;
        const id = P.identity && P.identity !== true ? P.identity : arg[0], u = user(id);
        if (!u) { noIdentity(id || ''); break; }
        if (u.sam === 'administrator' || u.sam === 'krbtgt') { fail('Remove-ADUser : Acesso negado: conta essencial do domínio.'); break; }
        delete w.users[u.sam];
        for (const g of Object.values(w.groups)) g.members = g.members.filter((m) => m !== u.sam);
        if (P.confirm === undefined) out.push('<span class="m">(no Windows real aparece uma confirmação; use -Confirm:$false em scripts)</span>');
        event(w, 'Security', 4726, 'Information', 'Uma conta de usuário foi excluída: ' + u.sam);
        ran.push('win-aduser-del');
        break;
      }
      case 'new-adgroup': {
        if (!needAD()) break;
        const nm = P.name && P.name !== true ? P.name : arg[0];
        if (!nm || !/^[\w .-]{1,40}$/.test(nm)) { fail('New-ADGroup : Informe -Name.', 'Exemplo: New-ADGroup -Name Suporte -GroupScope Global'); break; }
        const scopes = { global: 'Global', domainlocal: 'DomainLocal', universal: 'Universal' };
        const sc = scopes[low(P.groupscope)];
        if (!sc) { fail('New-ADGroup : Não é possível validar o argumento no parâmetro \'GroupScope\'.', 'Use -GroupScope Global, DomainLocal ou Universal.', 'Escopo do grupo: <b>Global</b> agrupa pessoas (ex.: Suporte); <b>DomainLocal</b> recebe permissões em recursos (ex.: pasta Financeiro). Estratégia AGDLP: contas → Global → DomainLocal → permissão.'); break; }
        if (w.groups[low(nm)] || w.users[low(nm)]) { fail('New-ADGroup : O grupo especificado já existe.'); break; }
        if (Object.keys(w.groups).length >= LIMIT.groups) { fail('Limite de grupos do jogo atingido.'); break; }
        const where = ouOf(P.path);
        if (where.bad) { fail('New-ADGroup : Objeto de diretório não encontrado (Path).'); break; }
        w.groups[low(nm)] = { name: nm, scope: sc, cat: low(P.groupcategory) === 'distribution' ? 'Distribution' : 'Security', ou: where.ou, members: [] };
        event(w, 'Security', 4727, 'Information', 'Um grupo de segurança foi criado: ' + nm);
        ran.push('win-group-new');
        break;
      }
      case 'get-adgroup': {
        if (!needAD()) break;
        const id = P.identity && P.identity !== true ? P.identity : arg[0];
        let rows = Object.values(w.groups);
        if (id && !P.filter) { const g = group(id); if (!g) { noIdentity(id); break; } rows = [g]; }
        out.push.apply(out, table(['Name', 'GroupScope', 'GroupCategory', 'Members'], rows.map((g) => [g.name, g.scope, g.cat, g.members.length])));
        ran.push('win-group-list');
        break;
      }
      case 'add-adgroupmember': case 'remove-adgroupmember': {
        if (!needAD()) break;
        const g = group(P.identity && P.identity !== true ? P.identity : arg[0]);
        if (!g) { noIdentity(P.identity || arg[0] || ''); break; }
        const ms = list(P.members && P.members !== true ? P.members : arg.slice(1).join(','));
        if (!ms.length) { fail(c0 + ' : Informe -Members.', 'Exemplo: Add-ADGroupMember -Identity ' + esc(g.name) + ' -Members ana.souza'); break; }
        let bad = null;
        for (const m of ms) {
          const k = low(m.replace(/^.*\\/, ''));
          const ok = w.users[k] || (w.groups[k] && w.groups[k] !== g);
          if (!ok) { bad = m; break; }
          if (c === 'add-adgroupmember') { if (g.members.indexOf(k) < 0) g.members.push(k); }
          else g.members = g.members.filter((x) => x !== k);
        }
        if (bad) { noIdentity(bad); break; }
        event(w, 'Security', c === 'add-adgroupmember' ? 4728 : 4729, 'Information', 'Membros ' + (c === 'add-adgroupmember' ? 'adicionados ao' : 'removidos do') + ' grupo ' + g.name + ': ' + ms.join(', '));
        ran.push('win-group-member');
        break;
      }
      case 'get-adgroupmember': {
        if (!needAD()) break;
        const g = group(P.identity && P.identity !== true ? P.identity : arg[0]);
        if (!g) { noIdentity(P.identity || arg[0] || ''); break; }
        if (!g.members.length) out.push('<span class="m">O grupo ' + esc(g.name) + ' não tem membros.</span>');
        else out.push.apply(out, table(['name', 'objectClass', 'SamAccountName'], g.members.map((k) => (w.users[k] ? [w.users[k].name, 'user', k] : [w.groups[k] ? w.groups[k].name : k, 'group', k]))));
        ran.push('win-group-members:' + low(g.name));
        break;
      }

      /* ---------- local users and the classic net commands ---------- */
      case 'net': return net(d, toks.slice(1), r);
      case 'new-localuser': case 'get-localuser': case 'add-localgroupmember': case 'get-localgroupmember': {
        if (w.domain) { fail(c0 + ' : Este comando não pode ser usado em um controlador de domínio.', 'Num DC não existem contas locais: use os cmdlets do AD (New-ADUser, Add-ADGroupMember).', 'Depois que o servidor vira controlador de domínio, as contas passam a ser do <b>domínio</b> (AD), não mais locais.'); break; }
        if (c === 'get-localuser') { out.push.apply(out, table(['Name', 'Enabled', 'Description'], w.local.map((u) => [u, 'True', u === 'Administrator' ? 'Conta interna para administrar o computador' : '']))); ran.push('win-local-list'); break; }
        if (c === 'get-localgroupmember') { out.push.apply(out, table(['ObjectClass', 'Name', 'PrincipalSource'], w.localAdmins.map((u) => ['Usuário', w.host + '\\' + u, 'Local']))); ran.push('win-local-admins'); break; }
        if (c === 'new-localuser') {
          const nm = P.name && P.name !== true ? P.name : arg[0];
          if (!nm || !/^[A-Za-z0-9._-]{1,20}$/.test(nm)) { fail('New-LocalUser : Informe -Name.', 'Exemplo: New-LocalUser -Name operador -Password (Read-Host -AsSecureString)'); break; }
          if (w.local.some((u) => low(u) === low(nm))) { fail('New-LocalUser : O usuário ' + nm + ' já existe.'); break; }
          if (weak(secret(P.password))) { fail('New-LocalUser : A senha não atende aos requisitos da política de senha.'); break; }
          w.local.push(nm);
          ran.push('win-local-new');
          break;
        }
        const grp = low(P.group || arg[0]), mem = P.member && P.member !== true ? P.member : arg[1];
        if (grp !== 'administrators' && grp !== 'administradores') { fail('Add-LocalGroupMember : No jogo, use o grupo Administrators.'); break; }
        if (!w.local.some((u) => low(u) === low(mem))) { fail('Add-LocalGroupMember : Principal ' + (mem || '') + ' não encontrado.'); break; }
        if (w.localAdmins.some((u) => low(u) === low(mem))) { fail('Add-LocalGroupMember : ' + mem + ' já é membro do grupo Administrators.'); break; }
        w.localAdmins.push(w.local.find((u) => low(u) === low(mem)));
        out.push('<span class="m">Princípio do menor privilégio: dê Administrators só a quem realmente administra o servidor.</span>');
        ran.push('win-local-admin');
        break;
      }

      /* ---------- folders, NTFS and shares ---------- */
      case 'new-item': case 'mkdir': case 'md': case 'ni': {
        const p = normPath(w, P.path && P.path !== true ? P.path : arg[0]);
        const type = low(P.itemtype || P.type || (c === 'mkdir' || c === 'md' ? 'directory' : ''));
        if (!p) { fail(c0 + ' : Caminho inválido.', 'Exemplo: New-Item -Path C:\\Dados\\Financeiro -ItemType Directory'); break; }
        if (type !== 'directory') { fail(c0 + ' : No jogo só pastas podem ser criadas: use -ItemType Directory.'); break; }
        if (w.dirs[dirKey(p)]) { fail(c0 + ' : Já existe um item com o nome especificado ' + p + '.'); break; }
        if (!mkdir(w, p)) { fail('Limite de pastas do jogo atingido.'); break; }
        out.push('', '    Diretório: ' + esc(parentOf(p)), '', 'Mode                 LastWriteTime         Length Name', '----                 -------------         ------ ----', 'd-----        ' + esc(new Date().toLocaleString('pt-BR').padEnd(26)) + esc(p.split('\\').pop()));
        ran.push('win-mkdir');
        break;
      }
      case 'get-childitem': case 'dir': case 'ls': case 'gci': {
        const p = normPath(w, P.path && P.path !== true ? P.path : arg[0] || w.cwd);
        if (!p || !w.dirs[dirKey(p)]) { fail('Get-ChildItem : Não é possível localizar o caminho \'' + (arg[0] || p) + '\' porque ele não existe.'); break; }
        const base = dirKey(p), kids = Object.values(w.dirs).filter((x) => dirKey(parentOf(x.path)) === base && dirKey(x.path) !== base);
        out.push('', '    Diretório: ' + esc(p), '', 'Mode     Name', '----     ----');
        for (const k of kids) out.push('d-----   ' + esc(k.path.split('\\').pop()));
        if (!kids.length) out.push('<span class="m">(pasta vazia)</span>');
        break;
      }
      case 'test-path': { const p = normPath(w, P.path && P.path !== true ? P.path : arg[0]); out.push(p && w.dirs[dirKey(p)] ? 'True' : 'False'); break; }
      case 'remove-item': case 'rmdir': case 'rd': case 'del': {
        const p = normPath(w, P.path && P.path !== true ? P.path : arg[0]);
        const dir = p && w.dirs[dirKey(p)];
        if (!dir) { fail('Remove-Item : Não é possível localizar o caminho porque ele não existe.'); break; }
        if (dir.sys || dirKey(p) === 'c:\\') { fail('Remove-Item : Acesso negado: pasta do sistema.'); break; }
        const kids = Object.keys(w.dirs).filter((k) => k.indexOf(dirKey(p) + '\\') === 0);
        if (kids.length && !P.recurse) { fail('Remove-Item : A pasta não está vazia. Use -Recurse.'); break; }
        for (const k of kids.concat([dirKey(p)])) delete w.dirs[k];
        for (const [s, sh] of Object.entries(w.shares)) if (keyOf(sh.path).indexOf(dirKey(p)) === 0) delete w.shares[s];
        if (keyOf(w.cwd).indexOf(dirKey(p)) === 0) w.cwd = 'C:\\';
        break;
      }
      case 'icacls': return icacls(d, toks.slice(1), r);
      case 'get-acl': {
        const p = normPath(w, P.path && P.path !== true ? P.path : arg[0]);
        if (!p || !w.dirs[dirKey(p)]) { fail('Get-Acl : Não é possível localizar o caminho porque ele não existe.'); break; }
        out.push('Path   : ' + esc(p), 'Owner  : BUILTIN\\Administrators', 'Access :');
        for (const e of aclOf(w, p)) out.push('         ' + esc(e.who) + ' Allow  ' + esc(PERMS[e.perm] || e.perm) + (e.inh ? ' (herdada)' : ''));
        ran.push('win-icacls:' + dirKey(p));
        break;
      }
      case 'new-smbshare': {
        const nm = P.name && P.name !== true ? P.name : null, p = normPath(w, P.path && P.path !== true ? P.path : null);
        if (!nm || !/^[\w$ .-]{1,40}$/.test(nm)) { fail('New-SmbShare : Informe -Name.', 'Exemplo: New-SmbShare -Name Financeiro -Path C:\\Dados\\Financeiro -ChangeAccess "' + esc(nb(w)) + '\\Financeiro"'); break; }
        if (!p || !w.dirs[dirKey(p)]) { fail('New-SmbShare : O caminho especificado não existe.', 'Crie a pasta antes: New-Item -Path ' + esc(P.path || 'C:\\Dados') + ' -ItemType Directory'); break; }
        if (w.shares[low(nm)] || /^(admin\$|c\$|ipc\$|netlogon|sysvol)$/i.test(nm)) { fail('New-SmbShare : O nome já foi compartilhado.'); break; }
        if (Object.keys(w.shares).length >= LIMIT.shares) { fail('Limite de compartilhamentos do jogo atingido.'); break; }
        const access = [];
        for (const [k, right] of [['fullaccess', 'Full'], ['changeaccess', 'Change'], ['readaccess', 'Read']]) {
          for (const who of list(P[k])) {
            const pr = principal(w, who);
            if (!pr) { r.badWho = who; break; }
            access.push({ who: pr, right });
          }
          if (r.badWho) break;
        }
        if (r.badWho) { fail('New-SmbShare : Nenhum mapeamento entre os nomes de conta e as IDs de segurança foi feito: \'' + r.badWho + '\'.', 'O grupo ou usuário precisa existir (Get-ADGroup -Filter *).'); break; }
        if (!access.length) access.push({ who: 'Everyone', right: 'Read' });
        w.shares[low(nm)] = { name: nm, path: w.dirs[dirKey(p)].path, access };
        out.push.apply(out, table(['Name', 'ScopeName', 'Path', 'Description'], [[nm, '*', w.dirs[dirKey(p)].path, '']]));
        if (access.some((a) => a.who === 'Everyone' && a.right !== 'Read')) out.push('<span class="w">Everyone com escrita no compartilhamento é arriscado: qualquer conta da rede poderia alterar os arquivos.</span>');
        out.push('<span class="m">Lembre: o acesso efetivo é o MAIS restritivo entre a permissão do compartilhamento e a do NTFS (icacls).</span>');
        ran.push('win-share-new');
        break;
      }
      case 'get-smbshare': {
        const rows = [['ADMIN$', '*', 'C:\\Windows', 'Admin remoto'], ['C$', '*', 'C:\\', 'Recurso compartilhado padrão'], ['IPC$', '*', '', 'IPC remoto']]
          .concat(w.domain ? [['NETLOGON', '*', 'C:\\Windows\\SYSVOL\\sysvol\\' + w.domain.name + '\\SCRIPTS', 'Logon server share'], ['SYSVOL', '*', 'C:\\Windows\\SYSVOL\\sysvol', 'Logon server share']] : [])
          .concat(Object.values(w.shares).map((s) => [s.name, '*', s.path, '']));
        out.push.apply(out, table(['Name', 'ScopeName', 'Path', 'Description'], rows));
        ran.push('win-share-list');
        break;
      }
      case 'get-smbshareaccess': {
        const s = w.shares[low(P.name && P.name !== true ? P.name : arg[0])];
        if (!s) { fail('Get-SmbShareAccess : Nenhum compartilhamento com esse nome.'); break; }
        out.push.apply(out, table(['Name', 'ScopeName', 'AccountName', 'AccessControlType', 'AccessRight'], s.access.map((a) => [s.name, '*', a.who, 'Allow', a.right])));
        ran.push('win-share-access:' + low(s.name));
        break;
      }
      case 'grant-smbshareaccess': case 'revoke-smbshareaccess': {
        const s = w.shares[low(P.name && P.name !== true ? P.name : arg[0])];
        if (!s) { fail(c0 + ' : Nenhum compartilhamento com esse nome.'); break; }
        const pr = principal(w, P.accountname);
        if (!pr) { fail(c0 + ' : Nenhum mapeamento entre os nomes de conta e as IDs de segurança foi feito.'); break; }
        s.access = s.access.filter((a) => !sameWho(a.who, pr));
        if (c === 'grant-smbshareaccess') {
          const right = { full: 'Full', change: 'Change', read: 'Read' }[low(P.accessright)];
          if (!right) { fail('Grant-SmbShareAccess : -AccessRight deve ser Full, Change ou Read.'); break; }
          s.access.push({ who: pr, right });
        }
        out.push.apply(out, table(['Name', 'AccountName', 'AccessControlType', 'AccessRight'], s.access.map((a) => [s.name, a.who, 'Allow', a.right])));
        ran.push('win-share-acl');
        break;
      }
      case 'remove-smbshare': {
        const k = low(P.name && P.name !== true ? P.name : arg[0]);
        if (!w.shares[k]) { fail('Remove-SmbShare : Nenhum compartilhamento com esse nome.'); break; }
        delete w.shares[k];
        break;
      }

      /* ---------- DNS server ---------- */
      case 'get-dnsserverzone': {
        if (!needDNS()) break;
        out.push.apply(out, table(['ZoneName', 'ZoneType', 'IsAutoCreated', 'IsDsIntegrated'], Object.values(w.zones).map((z) => [z.name, 'Primary', 'False', z.ad ? 'True' : 'False']).concat([['TrustAnchors', 'Primary', 'False', w.domain ? 'True' : 'False']])));
        ran.push('win-dns-zones');
        break;
      }
      case 'add-dnsserverprimaryzone': {
        if (!needDNS()) break;
        const nm = low(P.name && P.name !== true ? P.name : arg[0]);
        if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(nm)) { fail('Add-DnsServerPrimaryZone : Nome de zona inválido.', 'Exemplo: Add-DnsServerPrimaryZone -Name lab.local -ZoneFile lab.local.dns'); break; }
        if (!P.zonefile && !P.replicationscope) { fail('Add-DnsServerPrimaryZone : Informe -ZoneFile (zona em arquivo) ou -ReplicationScope Domain (zona integrada ao AD).'); break; }
        if (P.replicationscope && !w.domain) { fail('Add-DnsServerPrimaryZone : Zonas integradas ao AD exigem um controlador de domínio.', 'Sem domínio, use -ZoneFile ' + esc(nm) + '.dns'); break; }
        if (w.zones[nm]) { fail('Add-DnsServerPrimaryZone : A zona ' + nm + ' já existe.'); break; }
        w.zones[nm] = { name: nm, ad: !!P.replicationscope, records: [{ name: '@', type: 'A', data: myIp(d) }] };
        ran.push('win-dns-zone-new');
        break;
      }
      case 'add-dnsserverresourcerecorda': case 'add-dnsserverresourcerecordcname': case 'add-dnsserverresourcerecord': {
        if (!needDNS()) break;
        const z = w.zones[low(P.zonename)];
        if (!z) { fail(c0 + ' : A zona \'' + (P.zonename === true ? '' : P.zonename || '') + '\' não existe neste servidor.', 'Veja as zonas com Get-DnsServerZone.'); break; }
        const nm = low(P.name && P.name !== true ? P.name : '');
        if (!/^(@|[a-z0-9-]{1,63}(\.[a-z0-9-]{1,63})*)$/.test(nm)) { fail(c0 + ' : Informe -Name (o nome relativo à zona, ex.: web).'); break; }
        const cname = c === 'add-dnsserverresourcerecordcname' || (c === 'add-dnsserverresourcerecord' && P.cname);
        const data = cname ? low(P.hostnamealias) : P.ipv4address;
        if (cname ? !/^[a-z0-9.-]+$/.test(data || '') : !ipOk(data)) { fail(c0 + ' : ' + (cname ? 'Informe -HostNameAlias com o nome completo de destino.' : 'Informe -IPv4Address com um IP válido.')); break; }
        if (z.records.some((x) => x.name === nm && (cname || x.type === 'CNAME'))) { fail(c0 + ' : Já existe um registro com esse nome que conflita (um CNAME não pode dividir o nome com outro registro).'); break; }
        if (z.records.length >= LIMIT.records) { fail('Limite de registros do jogo atingido.'); break; }
        z.records.push({ name: nm, type: cname ? 'CNAME' : 'A', data: cname ? data.replace(/\.$/, '') : data });
        if (!cname && fixedIps().get(data) === undefined && data !== myIp(d)) out.push('<span class="m">Nenhum equipamento do datacenter usa ' + esc(data) + ' — confira se é o IP certo.</span>');
        ran.push('win-dns-rr:' + (cname ? 'cname' : 'a'));
        break;
      }
      case 'get-dnsserverresourcerecord': {
        if (!needDNS()) break;
        const z = w.zones[low(P.zonename)];
        if (!z) { fail('Get-DnsServerResourceRecord : A zona \'' + (P.zonename === true ? '' : P.zonename || '') + '\' não existe.', 'Veja com Get-DnsServerZone.'); break; }
        const t = P.rrtype && P.rrtype !== true ? String(P.rrtype).toUpperCase() : null, nm = P.name && P.name !== true ? low(P.name) : null;
        const rows = z.records.filter((x) => (!t || x.type === t) && (!nm || x.name === nm));
        out.push.apply(out, table(['HostName', 'RecordType', 'TimeToLive', 'RecordData'], rows.map((x) => [x.name, x.type, '01:00:00', x.data])));
        ran.push('win-dns-rr-list');
        break;
      }
      case 'remove-dnsserverresourcerecord': {
        if (!needDNS()) break;
        const z = w.zones[low(P.zonename)], nm = low(P.name), t = String(P.rrtype || '').toUpperCase();
        const i = z ? z.records.findIndex((x) => x.name === nm && (!t || x.type === t)) : -1;
        if (i < 0) { fail('Remove-DnsServerResourceRecord : Registro não encontrado.'); break; }
        z.records.splice(i, 1);
        break;
      }
      case 'add-dnsserverforwarder': case 'set-dnsserverforwarder': {
        if (!needDNS()) break;
        const ips = list(P.ipaddress);
        if (!ips.length || !ips.every(ipOk)) { fail(c0 + ' : Informe -IPAddress (ex.: 8.8.8.8).'); break; }
        w.forwarders = c === 'set-dnsserverforwarder' ? ips : Array.from(new Set(w.forwarders.concat(ips))).slice(0, 4);
        break;
      }
      case 'get-dnsserverforwarder': if (!needDNS()) break; out.push('IPAddress : {' + esc(w.forwarders.join(', ')) + '}', 'Timeout   : 3'); break;

      /* ---------- DHCP server ---------- */
      case 'add-dhcpserverv4scope': {
        if (!needDHCP()) break;
        const nm = P.name && P.name !== true ? P.name : null, a = P.startrange, b = P.endrange, mask = P.subnetmask;
        if (!nm || !ipOk(a) || !ipOk(b) || !ipOk(mask)) { fail('Add-DhcpServerv4Scope : Informe -Name, -StartRange, -EndRange e -SubnetMask.', 'Exemplo: Add-DhcpServerv4Scope -Name LAN -StartRange 10.0.1.100 -EndRange 10.0.1.199 -SubnetMask 255.255.255.0'); break; }
        if (mask !== '255.255.255.0') { fail('Add-DhcpServerv4Scope : No jogo a rede é 10.0.1.0/24: use -SubnetMask 255.255.255.0.'); break; }
        if (net24(a) !== net24(b) || ipNum(a) > ipNum(b)) { fail('Add-DhcpServerv4Scope : Faixa inválida: o início deve vir antes do fim, na mesma rede.'); break; }
        if (myIp(d) && net24(a) !== net24(myIp(d))) { fail('Add-DhcpServerv4Scope : A faixa está fora da rede do servidor (' + net24(myIp(d)) + '.0/24).', 'Os clientes pedem IP por broadcast na rede local: o escopo precisa ser da mesma rede.'); break; }
        const id = net24(a) + '.0';
        if (w.dhcp.scopes.some((s) => s.id === id)) { fail('Add-DhcpServerv4Scope : Já existe um escopo ' + id + '.'); break; }
        const used = Array.from(fixedIps()).filter(([ip]) => net24(ip) === net24(a) && ipNum(ip) >= ipNum(a) && ipNum(ip) <= ipNum(b));
        if (used.length) { fail('Add-DhcpServerv4Scope : A faixa inclui endereços fixos em uso: ' + used.slice(0, 4).map(([ip, n]) => ip + ' (' + n + ')').join(', ') + (used.length > 4 ? '…' : '') + '.', 'Escolha uma faixa sem IPs fixos, por exemplo 10.0.1.100 a 10.0.1.199.', 'O DHCP entregaria a um PC um IP que já pertence a um servidor ou ao gateway — <b>conflito de IP</b>. Deixe os IPs fixos fora do escopo.'); break; }
        w.dhcp.scopes.push({ id, name: nm.slice(0, 30), start: a, end: b, mask, state: low(P.state) === 'inactive' ? 'Inactive' : 'Active', router: null, dns: [], dnsDomain: null });
        out.push('<span class="m">Escopo criado. Agora informe gateway e DNS aos clientes: Set-DhcpServerv4OptionValue -ScopeId ' + esc(id) + ' -Router 10.0.1.1 -DnsServer ' + esc(myIp(d) || '<ip-do-dns>') + '</span>');
        ran.push('win-dhcp-scope');
        break;
      }
      case 'get-dhcpserverv4scope': {
        if (!needDHCP()) break;
        out.push.apply(out, table(['ScopeId', 'SubnetMask', 'Name', 'State', 'StartRange', 'EndRange', 'LeaseDuration'], w.dhcp.scopes.map((s) => [s.id, s.mask, s.name, s.state, s.start, s.end, '8.00:00:00'])));
        if (!w.dhcp.scopes.length) out.push('<span class="m">Nenhum escopo. Crie com Add-DhcpServerv4Scope.</span>');
        ran.push('win-dhcp-scope-list');
        break;
      }
      case 'set-dhcpserverv4scope': {
        if (!needDHCP()) break;
        const s = w.dhcp.scopes.find((x) => x.id === P.scopeid);
        if (!s) { fail('Set-DhcpServerv4Scope : Escopo ' + (P.scopeid || '') + ' não encontrado.'); break; }
        if (P.state) s.state = low(P.state) === 'inactive' ? 'Inactive' : 'Active';
        if (P.name && P.name !== true) s.name = String(P.name).slice(0, 30);
        break;
      }
      case 'remove-dhcpserverv4scope': {
        if (!needDHCP()) break;
        const i = w.dhcp.scopes.findIndex((x) => x.id === P.scopeid);
        if (i < 0) { fail('Remove-DhcpServerv4Scope : Escopo não encontrado.'); break; }
        w.dhcp.scopes.splice(i, 1);
        break;
      }
      case 'set-dhcpserverv4optionvalue': {
        if (!needDHCP()) break;
        const targets = P.scopeid ? w.dhcp.scopes.filter((x) => x.id === P.scopeid) : w.dhcp.scopes;
        if (!targets.length) { fail('Set-DhcpServerv4OptionValue : Escopo ' + (P.scopeid || '') + ' não encontrado.', 'Veja os escopos com Get-DhcpServerv4Scope.'); break; }
        if (P.router !== undefined && (!ipOk(P.router) || net24(P.router) !== net24(targets[0].start))) { fail('Set-DhcpServerv4OptionValue : -Router precisa ser um IP da mesma rede do escopo (o gateway 10.0.1.1).'); break; }
        const dns = list(P.dnsserver);
        if (P.dnsserver !== undefined) {
          const D = game(), others = D ? D.ops.devices() : [];
          const okDns = (ip) => ipOk(ip) && (ip === myIp(d) && has(w, 'DNS') || ['8.8.8.8', '1.1.1.1', '8.8.4.4'].indexOf(ip) >= 0 || others.some((x) => x.ip === ip && (x.svc === 'dns' || (isWin(x) && has(W(x), 'DNS')))));
          const bad = dns.find((ip) => !okDns(ip));
          if (!dns.length || bad) { fail('Set-DhcpServerv4OptionValue : O servidor DNS ' + (bad || '') + ' não é um servidor DNS válido.', 'O cmdlet testa o DNS informado. Use o IP deste servidor (' + esc(myIp(d)) + ') se ele tem a função DNS.', 'O DHCP entrega aos PCs o endereço do DNS. Se apontar para algo que não é DNS, os PCs não acham nada pelo nome.'); break; }
        }
        for (const s of targets) {
          if (P.router !== undefined) s.router = P.router;
          if (dns.length) s.dns = dns.slice(0, 3);
          if (P.dnsdomain && P.dnsdomain !== true) s.dnsDomain = low(P.dnsdomain);
        }
        ran.push('win-dhcp-option');
        break;
      }
      case 'get-dhcpserverv4optionvalue': {
        if (!needDHCP()) break;
        const s = w.dhcp.scopes.find((x) => x.id === P.scopeid) || w.dhcp.scopes[0];
        if (!s) { fail('Get-DhcpServerv4OptionValue : Nenhum escopo.'); break; }
        out.push.apply(out, table(['OptionId', 'Name', 'Value'], [[3, 'Router', s.router ? '{' + s.router + '}' : '{}'], [6, 'DNS Servers', '{' + s.dns.join(', ') + '}'], [15, 'DNS Domain Name', '{' + (s.dnsDomain || '') + '}']]));
        break;
      }
      case 'add-dhcpserverindc': case 'get-dhcpserverindc': {
        if (!needDHCP()) break;
        if (!w.domain) { fail(c0 + ' : Este servidor não faz parte de um domínio.', 'Autorizar no AD só existe em domínio. Fora de um domínio o DHCP já funciona sem autorização.'); break; }
        if (c === 'add-dhcpserverindc') { w.dhcp.authorized = true; event(w, 'System', 1044, 'Information', 'O servidor DHCP foi autorizado no Active Directory.'); ran.push('win-dhcp-auth'); }
        out.push.apply(out, table(['IPAddress', 'DnsName'], w.dhcp.authorized ? [[myIp(d), low(w.host) + '.' + w.domain.name]] : []));
        if (!w.dhcp.authorized) out.push('<span class="m">Nenhum servidor autorizado. Num domínio, um DHCP não autorizado NÃO entrega IPs (proteção contra DHCP pirata).</span>');
        break;
      }
      case 'get-dhcpserverv4lease': {
        if (!needDHCP()) break;
        const s = w.dhcp.scopes.find((x) => x.id === P.scopeid);
        if (!s) { fail('Get-DhcpServerv4Lease : Informe -ScopeId de um escopo existente.', 'Exemplo: Get-DhcpServerv4Lease -ScopeId ' + esc((w.dhcp.scopes[0] || { id: '10.0.1.0' }).id)); break; }
        const ls = leasesOf(d, s);
        if (!ls.length) {
          out.push('<span class="m">Nenhuma concessão.</span>');
          const why = s.state !== 'Active' ? 'o escopo está inativo (Set-DhcpServerv4Scope -State Active).' : !s.router ? 'sem a opção Router (gateway) os clientes ficam sem saída — configure com Set-DhcpServerv4OptionValue.' : w.domain && !w.dhcp.authorized ? 'o servidor não está autorizado no AD (Add-DhcpServerInDC).' : 'o serviço DHCPServer não está rodando.';
          out.push('<span class="m">Motivo provável: ' + esc(why) + '</span>');
          break;
        }
        out.push.apply(out, table(['IPAddress', 'ScopeId', 'HostName', 'AddressState', 'LeaseExpiryTime'], ls.map((l) => [l.ip, s.id, l.host, 'Active', '8 dias'])));
        out.push('<span class="m">Cada estação de trabalho (mesa) do datacenter pegou um IP: DHCP = Discover → Offer → Request → Ack.</span>');
        ran.push('win-dhcp-lease');
        break;
      }
      case 'gpupdate': out.push('Atualizando a política…', '', 'A atualização da Política de Computador foi concluída com êxito.', 'A atualização da Política de Usuário foi concluída com êxito.'); break;
      default:
        if (/^\$/.test(c)) { out.push('<span class="m">Variáveis e scripts não são simulados. Rode um cmdlet por linha.</span>'); break; }
        fail(notFound(c0), null);
        ran.push('unknown');
    }
    return r;
  }

  const edName = (w) => (w.edition ? 'Windows Server 2022 ' + w.edition : 'Windows Server 2022') + (w.core ? '' : ' (Desktop Experience)');
  function apipa(d) { const m = eth(d).mac.split(':'); return '169.254.' + parseInt(m[4], 16) + '.' + parseInt(m[5], 16); }

  function ipconfig(d, out, all) {
    const w = W(d), e = eth(d), ip = myIp(d);
    out.push('', 'Configuração de IP do Windows', '');
    if (all) out.push('   Nome do host. . . . . . . . . . . . . . . : ' + esc(w.host), '   Sufixo DNS primário . . . . . . . . . . . : ' + esc(w.domain ? w.domain.name : ''), '');
    if (!e.up) { out.push('<span class="m">(nenhum adaptador ativo: o Ethernet está desabilitado — veja Get-NetAdapter)</span>'); return; }
    out.push('Adaptador Ethernet Ethernet:', '');
    if (!d.os.cable) { out.push('   Estado da mídia. . . . . . . . . . . . . : <span class="w">mídia desconectada</span>', '<span class="m">(sem sinal no cabo — confira o cabeamento do rack)</span>'); return; }
    if (all) out.push('   Descrição . . . . . . . . . . . . . . . . : Intel(R) Ethernet Server Adapter', '   Endereço Físico . . . . . . . . . . . . . : ' + esc(e.mac.toUpperCase().replace(/:/g, '-')), '   DHCP Habilitado . . . . . . . . . . . . . : Não');
    if (ip) out.push('   Endereço IPv4. . . . . . . . . . . . . . : ' + esc(ip), '   Máscara de Sub-rede . . . . . . . . . . . : 255.255.255.0');
    else out.push('   Endereço IPv4 de Configuração Automática : <span class="w">' + apipa(d) + '</span>', '   Máscara de Sub-rede . . . . . . . . . . . : 255.255.0.0', '<span class="m">(169.254.x.x = APIPA: sem DHCP e sem IP fixo. Configure com New-NetIPAddress)</span>');
    out.push('   Gateway Padrão. . . . . . . . . . . . . . : ' + esc(d.os.route || ''));
    if (all) out.push('   Servidores DNS. . . . . . . . . . . . . . : ' + esc(w.dnsClient.join(', ') || '(nenhum)'));
  }

  function ping(d, host, ctx, out, ran, cmd) {
    let ip = host;
    if (!ipOk(host)) {
      const rs = resolve(d, host);
      if (!rs.ip) { err(out, ran, cmd ? 'A solicitação ping não pôde encontrar o host ' + host + '. Verifique o nome e tente novamente.' : 'Test-Connection : Falha ao resolver ' + host + ': ' + rs.err, rs.hint ? esc(rs.hint) : null); ran.push('ping-fail'); return; }
      ip = rs.ip;
    }
    const reach = ctx.reach(d, ip);
    if (cmd) {
      out.push('', 'Disparando ' + esc(host) + (ip !== host ? ' [' + esc(ip) + ']' : '') + ' com 32 bytes de dados:');
      if (reach.ok) for (let i = 0; i < 4; i++) out.push('Resposta de ' + esc(ip) + ': bytes=32 tempo&lt;1ms TTL=' + (ip === '127.0.0.1' ? 128 : 64));
      else for (let i = 0; i < 4; i++) out.push(i ? 'Esgotado o tempo limite do pedido.' : '<span class="w">' + (eth(d).up && d.os.cable ? 'Esgotado o tempo limite do pedido.' : 'PING: falha na transmissão. Falha geral.') + '</span>');
      out.push('', 'Estatísticas do Ping para ' + esc(ip) + ':', '<span class="' + (reach.ok ? 'ok' : 'w') + '">    Pacotes: Enviados = 4, Recebidos = ' + (reach.ok ? 4 : 0) + ', Perdidos = ' + (reach.ok ? 0 : 4) + ' (' + (reach.ok ? 0 : 100) + '% de perda)</span>');
    } else {
      if (reach.ok) out.push.apply(out, table(['Source', 'Destination', 'IPV4Address', 'Bytes', 'Time(ms)'], [0, 1, 2, 3].map(() => [W(d).host, host, ip, 32, 0])));
      else out.push('<span class="w">Test-Connection : Falha na conexão de teste com o computador \'' + esc(host) + '\': Erro devido à falta de recursos.</span>');
    }
    if (!reach.ok && reach.hint) out.push('<span class="m">' + windowsHint(reach.hint) + '</span>');
    ran.push(reach.ok ? 'ping-ok:' + ip : 'ping-fail');
  }
  // ops.reach() speaks Linux; translate its hints for a Windows console
  const windowsHint = (h) => String(h).replace(/a eth0 está DOWN — veja ip link/, 'o adaptador Ethernet está desabilitado — veja Get-NetAdapter').replace(/a eth0 não tem endereço IP — veja ip addr/, 'o adaptador não tem IP — veja ipconfig').replace(/sem rota padrão — veja ip route/, 'sem gateway padrão — veja Get-NetIPConfiguration').replace(/NO-CARRIER/, 'mídia desconectada');

  function restart(d, out, ran, auto) {
    const w = W(d);
    if (w.pending.name) { w.host = w.pending.name; w.pending.name = null; }
    event(w, 'System', 1074, 'Information', 'O processo Administrator reiniciou o computador ' + w.host + '.');
    event(w, 'System', 6005, 'Information', 'O serviço de log de eventos foi iniciado.');
    if (!auto) out.push('Reiniciando…');
    out.push('<span class="m">· · · reinicializando · · ·</span>', 'Aplicando configurações do computador…', w.domain ? 'Pressione Ctrl+Alt+Del para entrar em ' + esc(w.domain.netbios) + '\\Administrator' : 'Entrando como Administrator…', '', '<span class="ok">' + esc(w.host) + ' está de volta.</span>');
    ran.push('reboot');
  }

  function promote(d, name, netbios) {
    const w = W(d), ip = myIp(d);
    w.domain = { name, netbios };
    for (const f of ['DNS', 'RSAT-DNS-Server', 'RSAT-AD-PowerShell']) if (!has(w, f)) w.features.push(f);
    Object.assign(w.svc, { NTDS: 'Running', Netlogon: 'Running', ADWS: 'Running', DNS: 'Running' });
    w.dnsClient = ['127.0.0.1'];
    w.zones[name] = { name, ad: true, records: [{ name: '@', type: 'A', data: ip }, { name: low(w.host), type: 'A', data: ip }] };
    w.ous = ['Domain Controllers'].concat(w.ous.filter((o) => o !== 'Domain Controllers'));
    w.users = { administrator: { sam: 'administrator', name: 'Administrator', ou: null, enabled: true, locked: false, pwd: true, builtin: true }, guest: { sam: 'guest', name: 'Guest', ou: null, enabled: false, locked: false, pwd: false, builtin: true }, krbtgt: { sam: 'krbtgt', name: 'krbtgt', ou: null, enabled: false, locked: false, pwd: true, builtin: true } };
    w.groups = {
      'domain admins': { name: 'Domain Admins', scope: 'Global', cat: 'Security', ou: null, members: ['administrator'], builtin: true },
      'domain users': { name: 'Domain Users', scope: 'Global', cat: 'Security', ou: null, members: ['administrator'], builtin: true },
      'domain computers': { name: 'Domain Computers', scope: 'Global', cat: 'Security', ou: null, members: [], builtin: true },
      'enterprise admins': { name: 'Enterprise Admins', scope: 'Universal', cat: 'Security', ou: null, members: ['administrator'], builtin: true },
    };
    // like the real promotion of a first DC: the local accounts become domain accounts
    for (const n of w.local) {
      const sam = low(n);
      if (w.users[sam] || !/^[a-z0-9._-]{1,20}$/.test(sam)) continue;
      w.users[sam] = { sam, name: n, ou: null, enabled: true, locked: false, pwd: true };
      if (w.localAdmins.indexOf(n) >= 0) w.groups['domain admins'].members.push(sam);
    }
    event(w, 'System', 29223, 'Information', 'Este servidor agora é um controlador de domínio do domínio ' + name + '.');
  }

  /* ---------- setup media (WinPE) ---------- */
  function media(d, raw, ctx, out, ran) {
    const w = W(d), a = low(raw), t = a.split(/\s+/);
    const r = { out, ran, why: null };
    if (t[0] === 'cls' || t[0] === 'clear') { ctx.clear(); return r; }
    if (t[0] === 'exit') { ctx.close(); return r; }
    if (t[0] === 'help' || t[0] === '/?' || a === 'setup.exe /?' || a === 'setup /?') {
      out.push('Mídia de instalação do Windows Server 2022 (WinPE).', '  dir                                          lista os arquivos da mídia', '  dism /Get-WimInfo /WimFile:install.wim       mostra as edições (índices)', '  setup.exe /install /index:&lt;n&gt;               instala a edição escolhida', '<span class="m">Core (índices 1 e 3) = sem interface gráfica: menos atualizações, menor superfície de ataque. Datacenter = VMs ilimitadas; Standard = 2 VMs por licença.</span>');
      return r;
    }
    if (t[0] === 'dir') { out.push(' Pasta de X:\\Sources', '', '  boot.wim', '  install.wim', '  setup.exe', '  lang.ini', ''); return r; }
    if (t[0] === 'dism') {
      if (!/\/get-wiminfo/.test(a) || !/install\.wim/.test(a)) { err(out, ran, 'Erro: 87 — parâmetro desconhecido.', 'Use: dism /Get-WimInfo /WimFile:install.wim'); return r; }
      out.push('Ferramenta de Gerenciamento e Manutenção de Imagens de Implantação', 'Detalhes da imagem : install.wim', '');
      for (const e of EDITIONS) out.push('Índice : ' + e.idx, 'Nome   : ' + esc(e.name), 'Tamanho: ' + (e.core ? '9.123' : '15.884') + ' MB', '');
      out.push('A operação foi concluída com êxito.');
      ran.push('win-wiminfo');
      return r;
    }
    if (t[0] === 'setup' || t[0] === 'setup.exe') {
      const m = /\/index:(\d)/.exec(a);
      if (!/\/install/.test(a) || !m) { err(out, ran, 'Uso: setup.exe /install /index:<n>', 'Veja os índices com dism /Get-WimInfo /WimFile:install.wim'); r.why = 'Escolha a edição pelo número do <b>Índice</b> mostrado no dism. Ex.: <code>setup.exe /install /index:3</code> (Datacenter Core).'; return r; }
      const e = EDITIONS.find((x) => x.idx === +m[1]);
      if (!e) { err(out, ran, 'Índice ' + m[1] + ' não existe em install.wim.', 'Índices válidos: 1 a 4.'); return r; }
      if (!d.os.cable) out.push('<span class="m">(sem cabo de rede: a instalação segue, mas você vai precisar do cabo para configurar a rede)</span>');
      w.edition = e.ed;
      w.core = e.core;
      out.push('Instalando ' + esc(e.name) + '…', 'Particionando o disco 0 (GPT): EFI, MSR e C:', 'Copiando arquivos do Windows… 100%', 'Preparando arquivos para instalação… 100%', 'Instalando recursos… 100%', 'Instalando atualizações… 100%', '<span class="m">· · · reinicializando · · ·</span>', '',
        '<span class="ok">Windows Server 2022 instalado.</span>', 'O usuário precisa alterar a senha antes de entrar pela primeira vez.', 'Defina a senha do Administrador: <b>net user Administrator &lt;senha&gt;</b>');
      w.stage = 'oobe';
      eth(d).up = true;
      ran.push('win-installed');
      return r;
    }
    err(out, ran, '\'' + raw.split(/\s+/)[0] + '\' não é reconhecido como um comando interno ou externo, um programa operável ou um arquivo em lotes.', 'Na mídia de instalação: dir, dism /Get-WimInfo /WimFile:install.wim, setup.exe /install /index:<n>');
    ran.push('unknown');
    return r;
  }

  /* ---------- first logon: the Administrator password ---------- */
  function oobe(d, raw, ctx, out, ran) {
    const w = W(d), t = tokenize(raw), r = { out, ran, why: null };
    if (low(t[0]) === 'cls') { ctx.clear(); return r; }
    if (low(t[0]) === 'exit') { ctx.close(); return r; }
    if (low(t[0]) !== 'net' || low(t[1]) !== 'user' || low(t[2]) !== 'administrator' || !t[3]) {
      err(out, ran, 'Defina a senha do Administrador primeiro.', 'Comando: net user Administrator <senha>  (8+ caracteres com maiúsculas, minúsculas, números ou símbolos)');
      return r;
    }
    if (weak(t[3])) {
      err(out, ran, 'A senha não atende aos requisitos da política de senha. Verifique o comprimento mínimo, a complexidade e o histórico da senha.', 'Use 8+ caracteres e pelo menos 3 tipos: maiúscula, minúscula, número e símbolo. Ex.: Datalab@2026');
      r.why = 'O Windows exige senha <b>complexa</b>: 8 ou mais caracteres misturando pelo menos 3 tipos (A-Z, a-z, 0-9, símbolos).';
      return r;
    }
    w.stage = 'ready';
    event(w, 'Security', 4724, 'Information', 'A senha da conta Administrator foi definida.');
    out.push('Comando concluído com êxito.', '', '<span class="ok">Sua senha foi alterada.</span>', '', 'Windows PowerShell', 'Copyright (C) Microsoft Corporation. Todos os direitos reservados.', '', '<span class="m">Digite help para ver os comandos · help conceitos explica AD, DNS, DHCP e permissões.</span>');
    ran.push('win-admin-pass');
    return r;
  }

  /* ---------- net (cmd) ---------- */
  function net(d, t, r) {
    const w = W(d), out = r.out, ran = r.ran, sub = low(t[0]);
    const fail = (m, h) => err(out, ran, m, h);
    if (sub === 'user') {
      const name = t[1], last = low(t[t.length - 1]);
      if (!name) {
        const names = w.domain ? Object.values(w.users).map((u) => u.sam) : w.local;
        out.push('Contas de usuário de \\\\' + esc(w.host), '-------------------------------------------------------------------------------', esc(names.join('    ')), 'Comando concluído com êxito.');
        ran.push(w.domain ? 'win-aduser-list' : 'win-local-list');
        return r;
      }
      if (last === '/add') {
        const pw = t.length > 3 ? t[2] : null;
        if (pw && weak(pw)) { fail('A senha não atende aos requisitos da política de senha.', 'Use 8+ caracteres com maiúscula, minúscula, número ou símbolo.'); return r; }
        if (w.domain) {
          const sam = low(name);
          if (w.users[sam]) { fail('A conta já existe.'); return r; }
          w.users[sam] = { sam, name, ou: null, enabled: !!pw, locked: false, pwd: !!pw };
          out.push('Comando concluído com êxito.', '<span class="m">(num DC o net user /add cria uma conta do DOMÍNIO, no contêiner Users)</span>');
          ran.push('win-aduser-new');
        } else {
          if (w.local.some((u) => low(u) === low(name))) { fail('A conta já existe.'); return r; }
          w.local.push(name);
          out.push('Comando concluído com êxito.');
          ran.push('win-local-new');
        }
        return r;
      }
      const act = /^\/active:(yes|no)$/.exec(last);
      if (act && w.domain) {
        const u = w.users[low(name)];
        if (!u) { fail('O nome de usuário não pôde ser encontrado.'); return r; }
        if (act[1] === 'yes' && !u.pwd) { fail('A senha não atende aos requisitos da política de senha.', 'Defina a senha antes: net user ' + esc(name) + ' <senha>'); return r; }
        u.enabled = act[1] === 'yes';
        out.push('Comando concluído com êxito.');
        return r;
      }
      if (t[2] && w.domain && w.users[low(name)]) {
        if (weak(t[2])) { fail('A senha não atende aos requisitos da política de senha.'); return r; }
        w.users[low(name)].pwd = true;
        out.push('Comando concluído com êxito.');
        ran.push('win-pwd');
        return r;
      }
      if (t[2] && !w.domain && low(name) === 'administrator') {
        if (weak(t[2])) { fail('A senha não atende aos requisitos da política de senha.'); return r; }
        out.push('Comando concluído com êxito.');
        return r;
      }
      const u = w.domain ? w.users[low(name)] : null;
      if (w.domain && !u) { fail('O nome de usuário não pôde ser encontrado.', 'Liste com net user.'); return r; }
      if (!w.domain && !w.local.some((x) => low(x) === low(name))) { fail('O nome de usuário não pôde ser encontrado.'); return r; }
      out.push('Nome de usuário                ' + esc(u ? u.sam : name), 'Nome completo                  ' + esc(u ? u.name : name), 'Conta ativa                    ' + (u && !u.enabled ? 'Não' : 'Sim'), 'Conta bloqueada                ' + (u && u.locked ? '<span class="w">Sim</span>' : 'Não'));
      if (u) { out.push('Associações de Grupo Global    *' + esc(['Domain Users'].concat(Object.values(w.groups).filter((g) => g.members.indexOf(u.sam) >= 0 && g.name !== 'Domain Users').map((g) => g.name)).join(' *'))); if (!u.locked) ran.push('win-locked-clear'); }
      out.push('Comando concluído com êxito.');
      return r;
    }
    if (sub === 'localgroup') {
      if (w.domain) { fail('Num controlador de domínio não há grupos locais.', 'Use os grupos do AD: Get-ADGroupMember "Domain Admins".'); return r; }
      if (low(t[1]) !== 'administrators' && low(t[1]) !== 'administradores') { out.push('Aliases de \\\\' + esc(w.host), '*Administrators', '*Users', 'Comando concluído com êxito.'); return r; }
      if (t[2] && low(t[3]) === '/add') {
        const u = w.local.find((x) => low(x) === low(t[2]));
        if (!u) { fail('Não há esse usuário ou grupo global.'); return r; }
        if (w.localAdmins.indexOf(u) < 0) w.localAdmins.push(u);
        out.push('Comando concluído com êxito.');
        ran.push('win-local-admin');
        return r;
      }
      out.push('Nome do alias     Administrators', 'Membros', '-------------------------------------------------------------------------------', esc(w.localAdmins.join('\n')), 'Comando concluído com êxito.');
      ran.push('win-local-admins');
      return r;
    }
    if (sub === 'share') {
      const rows = Object.values(w.shares);
      out.push('Nome do compartilhamento   Recurso', '-------------------------------------------------------------------------------', 'C$                         C:\\', 'IPC$', 'ADMIN$                     C:\\Windows');
      for (const s of rows) out.push(esc(s.name.padEnd(27) + s.path));
      out.push('Comando concluído com êxito.');
      ran.push('win-share-list');
      return r;
    }
    fail('A sintaxe deste comando é: NET [ USER | LOCALGROUP | SHARE ]');
    return r;
  }

  /* ---------- icacls ---------- */
  function icacls(d, t, r) {
    const w = W(d), out = r.out, ran = r.ran;
    const p = normPath(w, t[0]);
    if (!p || !w.dirs[dirKey(p)]) { err(out, ran, (t[0] || '') + ': O sistema não pode encontrar o arquivo especificado.', 'Crie a pasta antes: New-Item -Path C:\\Dados\\Financeiro -ItemType Directory'); return r; }
    const dir = w.dirs[dirKey(p)];
    const sw = low(t[1] || '');
    if (!sw) {
      const acl = aclOf(w, p);
      acl.forEach((e, i) => out.push((i ? ' '.repeat(p.length + 1) : esc(p) + ' ') + esc(e.who) + ':' + (e.inh ? '(I)' : '') + '(OI)(CI)(' + e.perm + ')'));
      out.push('', 'Processado com êxito 1 arquivos; Falha no processamento de 0 arquivos', '<span class="m">(I) = herdada da pasta de cima · (OI)(CI) = vale para arquivos e subpastas · F total, M modificar, RX ler/executar</span>');
      ran.push('win-icacls:' + dirKey(p), 'win-icacls-view:' + dirKey(p) + ':' + aclHash(w, p));
      return r;
    }
    if (dir.sys || dirKey(p) === 'c:\\') { err(out, ran, p + ': Acesso negado.', 'Não mexa nas permissões das pastas do sistema. Pratique em C:\\Dados.'); return r; }
    if (/^\/inheritance:[edr]$/.test(sw)) {
      const m = sw.slice(-1);
      if (m === 'r') dir.inherit = false;
      else if (m === 'e') dir.inherit = true;
      else { dir.acl = aclOf(w, p).map((e) => ({ who: e.who, perm: e.perm })); dir.inherit = false; }
      out.push('arquivo processado: ' + esc(p), 'Processado com êxito 1 arquivos; Falha no processamento de 0 arquivos');
      if (m === 'r') out.push('<span class="m">Herança removida: só ficaram as permissões explícitas. Garanta que Administrators continue com (F).</span>');
      ran.push('win-inherit:' + m);
      return r;
    }
    if (sw === '/grant' || sw === '/grant:r') {
      const spec = t.slice(2).join(' ');
      const m = /^(.+?):((?:\((?:OI|CI|IO|NP)\))*)\(?(F|M|RX|R|W)\)?$/i.exec(spec.replace(/^["']|["']$/g, ''));
      if (!m) { err(out, ran, 'Parâmetro inválido: "' + spec + '"', 'Formato: icacls C:\\Dados\\Financeiro /grant "' + esc(nb(w)) + '\\Financeiro:(OI)(CI)M"'); r.why = 'Depois do <code>/grant</code> vem <b>conta:(herança)(permissão)</b>, entre aspas. Ex.: <code>"CORP\\Financeiro:(OI)(CI)M"</code>.'; return r; }
      const who = principal(w, m[1]);
      if (!who) { err(out, ran, m[1] + ': Nenhum mapeamento entre os nomes de conta e as IDs de segurança foi feito.', 'O grupo/usuário precisa existir (Get-ADGroup -Filter *).'); return r; }
      dir.acl = dir.acl.filter((e) => !sameWho(e.who, who));
      dir.acl.push({ who, perm: m[3].toUpperCase() });
      out.push('arquivo processado: ' + esc(p), 'Processado com êxito 1 arquivos; Falha no processamento de 0 arquivos');
      if (m[3].toUpperCase() === 'F' && !/administrators|system/i.test(who)) out.push('<span class="m">Controle total (F) também deixa mudar permissões. Para quem só trabalha nos arquivos, Modificar (M) basta.</span>');
      ran.push('win-grant');
      return r;
    }
    if (sw === '/remove' || sw === '/remove:g') {
      const who = principal(w, t.slice(2).join(' '));
      if (!who) { err(out, ran, 'Nenhum mapeamento entre os nomes de conta e as IDs de segurança foi feito.'); return r; }
      const before = dir.acl.length;
      dir.acl = dir.acl.filter((e) => !sameWho(e.who, who));
      out.push('arquivo processado: ' + esc(p), 'Processado com êxito 1 arquivos; Falha no processamento de 0 arquivos');
      if (before === dir.acl.length && aclOf(w, p).some((e) => sameWho(e.who, who))) out.push('<span class="w">' + esc(who) + ' continua com acesso: essa permissão é HERDADA (I).</span>', '<span class="m">/remove só tira permissões explícitas. Primeiro corte a herança: icacls ' + esc(p) + ' /inheritance:d (copia) ou /inheritance:r (remove).</span>');
      ran.push('win-remove');
      return r;
    }
    err(out, ran, 'Parâmetro inválido: "' + (t[1] || '') + '"', 'Use: icacls <pasta> | /grant "conta:(OI)(CI)M" | /remove conta | /inheritance:r');
    return r;
  }

  /* ------------------------------------------------------------------ */
  /* Help (learning)                                                     */
  /* ------------------------------------------------------------------ */
  const CMD_GROUPS = [
    ['Básicos', 'help, Get-Command, hostname, whoami, systeminfo, sconfig, Rename-Computer, Restart-Computer, Get-WinEvent'],
    ['Rede', 'ipconfig [/all], Get-NetAdapter, Enable-NetAdapter, Get-NetIPConfiguration, New-NetIPAddress, Set-DnsClientServerAddress, ping, Test-Connection, Test-NetConnection, Resolve-DnsName, nslookup'],
    ['Funções', 'Get-WindowsFeature, Install-WindowsFeature, Get-Service, Start-Service, Stop-Service, Restart-Service'],
    ['Active Directory', 'Install-ADDSForest, Get-ADDomain, New-ADOrganizationalUnit, New-ADUser, Get-ADUser, Set-ADAccountPassword, Enable-ADAccount, Disable-ADAccount, Unlock-ADAccount, Search-ADAccount, New-ADGroup, Add-ADGroupMember, Get-ADGroupMember'],
    ['Usuários locais', 'net user, net localgroup, New-LocalUser, Add-LocalGroupMember'],
    ['Arquivos e permissões', 'New-Item, Get-ChildItem, icacls, Get-Acl, New-SmbShare, Get-SmbShare, Get-SmbShareAccess, Grant-SmbShareAccess'],
    ['DNS', 'Get-DnsServerZone, Add-DnsServerPrimaryZone, Add-DnsServerResourceRecordA, Add-DnsServerResourceRecordCName, Get-DnsServerResourceRecord, Add-DnsServerForwarder'],
    ['DHCP', 'Add-DhcpServerv4Scope, Get-DhcpServerv4Scope, Set-DhcpServerv4OptionValue, Add-DhcpServerInDC, Get-DhcpServerv4Lease'],
  ];
  const CONCEPTS = {
    ad: ['<b>Active Directory (AD DS)</b>: o catálogo central da empresa — contas, grupos e computadores num só lugar, com login único.', '<b>Floresta / domínio</b>: corp.datalab.local é o domínio; ele também é uma zona DNS.', '<b>Controlador de domínio (DC)</b>: o servidor que guarda o AD e valida os logins (Kerberos). Precisa de IP fixo e de DNS.', '<b>OU</b>: pasta lógica para organizar contas (TI, Financeiro) e aplicar políticas (GPO).', '<b>Grupos</b>: Global junta pessoas; DomainLocal recebe permissões em recursos. AGDLP: Accounts → Global → DomainLocal → Permissions.'],
    dns: ['<b>DNS</b> traduz nomes em IPs. Sem ele, ninguém acha o domínio nem os sites.', '<b>Zona</b>: o "pedaço" de nomes que o servidor responde (corp.datalab.local).', '<b>Registro A</b>: nome → IP (web → 10.0.1.12). <b>CNAME</b>: apelido → outro nome (www → web).', 'Servidores do domínio usam o DC como DNS; nomes externos seguem para encaminhadores (forwarders).'],
    dhcp: ['<b>DHCP</b> entrega IP, máscara, gateway (Router) e DNS automaticamente aos PCs.', 'Processo DORA: Discover → Offer → Request → Ack.', '<b>Escopo</b>: a faixa de IPs que pode ser emprestada. Deixe de fora os IPs fixos (servidores, gateway).', 'Num domínio o DHCP precisa ser <b>autorizado</b> no AD (Add-DhcpServerInDC), senão não responde.'],
    permissoes: ['Duas camadas: <b>compartilhamento</b> (quem acessa pela rede) e <b>NTFS</b> (o que pode fazer nos arquivos).', 'O acesso efetivo pela rede é o <b>mais restritivo</b> dos dois.', 'Herança: subpastas recebem as permissões da pasta de cima (I). Para restringir, corte a herança (/inheritance:r).', 'Menor privilégio: dê Modificar (M) a quem trabalha nos arquivos; Controle total (F) só aos administradores.'],
    instalacao: ['<b>Core</b> = sem interface gráfica (administração por PowerShell): mais leve, menos atualizações, menor superfície de ataque.', '<b>Desktop Experience</b> = com interface gráfica.', '<b>Standard</b> vs <b>Datacenter</b>: mesmas funções; Datacenter permite VMs ilimitadas no host.', 'Depois da instalação: senha do Administrator, IP fixo, nome e só então as funções.'],
  };
  function helpCmd(d, topic, r) {
    const out = r.out, t = low(topic);
    if (!t) {
      out.push('Windows Server 2022 · PowerShell (simulado). Comandos por área:');
      for (const [cat, cmds] of CMD_GROUPS) out.push('  <b>' + esc(cat) + '</b>: ' + esc(cmds));
      out.push('detalhes: help &lt;comando&gt;  ·  conceitos: help conceitos | help ad | help dns | help dhcp | help permissoes | help instalacao', '<span class="m">Comandos não diferenciam maiúsculas. ↑ repete, Tab completa.</span>');
      return r;
    }
    if (t === 'conceitos') { for (const k of Object.keys(CONCEPTS)) out.push('<b>' + k.toUpperCase() + '</b>', ...CONCEPTS[k].map((x) => '  · ' + x)); r.ran.push('win-concepts'); return r; }
    const ck = t.replace(/^about_/, '');
    if (CONCEPTS[ck]) { out.push(...CONCEPTS[ck].map((x) => '  · ' + x)); r.ran.push('win-concepts'); return r; }
    const H = DL.CMD_HELP || {};
    const k = Object.keys(H).find((x) => H[x].os === 'win' && low(H[x].cmd.split(' ')[0]) === t);
    if (k) { const h = H[k]; out.push('<b>' + esc(h.cmd) + '</b>', esc(h.what), 'quando usar: ' + esc(h.when), 'exemplo: ' + esc(h.ex)); return r; }
    out.push('Sem ajuda para "' + esc(topic) + '". Digite help para a lista ou use o botão Precisa de ajuda?');
    return r;
  }

  /* help cards (terminal.js: "Precisa de ajuda?", lessons) */
  const WIN_HELP = {
    'win-dism': { cmd: 'dism /Get-WimInfo /WimFile:install.wim', ex: 'dism /Get-WimInfo /WimFile:install.wim', what: 'Lista as edições dentro da imagem de instalação, cada uma com um número (Índice).', when: 'Antes de instalar, para escolher entre Standard/Datacenter e Core/Desktop Experience.' },
    'win-setup': { cmd: 'setup.exe /install /index:<n>', ex: 'setup.exe /install /index:3', what: 'Instala a edição do índice escolhido: particiona o disco, copia os arquivos e reinicia.', when: 'Na mídia de instalação (X:\\Sources). Índice 3 = Datacenter Core, o padrão de datacenter.' },
    'win-pass': { cmd: 'net user Administrator <senha>', ex: 'net user Administrator Datalab@2026', what: 'Define a senha da conta Administrator. O Windows exige senha complexa (8+ caracteres, 3 tipos).', when: 'No primeiro logon, logo depois da instalação. Também troca a senha de qualquer usuário.' },
    'win-ipconfig': { cmd: 'ipconfig /all', ex: 'ipconfig /all', what: 'Mostra IP, máscara, gateway e DNS de cada adaptador. 169.254.x.x (APIPA) = o servidor não conseguiu IP.', when: 'Primeiro passo de qualquer problema de rede no Windows.' },
    'win-adapter': { cmd: 'Get-NetAdapter  /  Enable-NetAdapter -Name Ethernet', ex: 'Get-NetAdapter\nEnable-NetAdapter -Name Ethernet', what: 'Get-NetAdapter lista os adaptadores (Up, Disabled, Disconnected). Enable-NetAdapter liga um adaptador desabilitado.', when: 'Quando o servidor sumiu da rede: Disabled = alguém desligou; Disconnected = cabo.' },
    'win-newip': { cmd: 'New-NetIPAddress -InterfaceAlias Ethernet -IPAddress <ip> -PrefixLength 24 -DefaultGateway <gw>', ex: 'New-NetIPAddress -InterfaceAlias Ethernet -IPAddress 10.0.1.12 -PrefixLength 24 -DefaultGateway 10.0.1.1', what: 'Dá um IP fixo ao adaptador, com a máscara (/24 = 255.255.255.0) e o gateway padrão.', when: 'Servidores usam IP fixo: os clientes precisam sempre encontrá-los no mesmo endereço.' },
    'win-dnsclient': { cmd: 'Set-DnsClientServerAddress -InterfaceAlias Ethernet -ServerAddresses <ip>', ex: 'Set-DnsClientServerAddress -InterfaceAlias Ethernet -ServerAddresses 127.0.0.1', what: 'Define quais servidores DNS este Windows consulta para traduzir nomes.', when: 'Num DC, aponte para ele mesmo (127.0.0.1). Num servidor membro, aponte para o DC.' },
    'win-rename': { cmd: 'Rename-Computer -NewName <nome> -Restart', ex: 'Rename-Computer -NewName SRV-03 -Restart', what: 'Troca o nome do computador (até 15 caracteres). Só vale depois de reiniciar.', when: 'Na configuração inicial, antes de promover a controlador de domínio.' },
    'win-restart': { cmd: 'Restart-Computer', ex: 'Restart-Computer', what: 'Reinicia o servidor e aplica as mudanças pendentes (como o novo nome).', when: 'Depois de Rename-Computer ou quando uma instalação pede reinício.' },
    'win-ping': { cmd: 'ping <destino>  /  Test-Connection <destino>', ex: 'ping 10.0.1.1', what: 'Testa se o destino responde. Aceita IP ou nome (usa o DNS).', when: 'Depois de configurar ou consertar a rede.' },
    'win-feature': { cmd: 'Install-WindowsFeature <nome> -IncludeManagementTools', ex: 'Install-WindowsFeature AD-Domain-Services -IncludeManagementTools', what: 'Instala funções (AD DS, DNS, DHCP, IIS) e, com -IncludeManagementTools, os cmdlets para administrá-las.', when: 'Para dar uma função ao servidor. Veja os nomes com Get-WindowsFeature.' },
    'win-features': { cmd: 'Get-WindowsFeature', ex: 'Get-WindowsFeature', what: 'Lista funções e recursos: [X] = instalado.', when: 'Para descobrir o nome exato (coluna Name) antes de instalar.' },
    'win-forest': { cmd: 'Install-ADDSForest -DomainName <fqdn> -InstallDns', ex: 'Install-ADDSForest -DomainName corp.datalab.local -InstallDns', what: 'Promove o servidor a controlador de domínio, criando uma floresta nova com DNS integrado. Reinicia no fim.', when: 'Depois de instalar a função AD-Domain-Services, com IP fixo e nome definitivo.' },
    'win-addomain': { cmd: 'Get-ADDomain', ex: 'Get-ADDomain', what: 'Mostra o domínio: nome DNS, NetBIOS, DN e quem é o PDC.', when: 'Para confirmar que o domínio existe e o AD responde.' },
    'win-ou': { cmd: 'New-ADOrganizationalUnit -Name <nome>', ex: 'New-ADOrganizationalUnit -Name TI', what: 'Cria uma OU, uma "pasta" do AD para organizar contas e aplicar políticas.', when: 'Ao organizar o AD por departamento.' },
    'win-newuser': { cmd: 'New-ADUser -Name <nome> -SamAccountName <login> -Path <OU> -AccountPassword (...) -Enabled $true', ex: 'New-ADUser -Name "Ana Souza" -SamAccountName ana.souza -Path "OU=TI,DC=corp,DC=datalab,DC=local" -AccountPassword (ConvertTo-SecureString "Datalab@2026" -AsPlainText -Force) -Enabled $true', what: 'Cria uma conta no AD. Sem -Enabled $true (e senha) ela nasce desabilitada.', when: 'Quando alguém entra na empresa.' },
    'win-users': { cmd: 'Get-ADUser -Filter *', ex: 'Get-ADUser -Filter *', what: 'Lista as contas do domínio, se estão habilitadas e se estão bloqueadas.', when: 'Para conferir contas depois de criar ou mudar.' },
    'win-newgroup': { cmd: 'New-ADGroup -Name <nome> -GroupScope Global|DomainLocal', ex: 'New-ADGroup -Name Suporte -GroupScope Global', what: 'Cria um grupo de segurança. Global agrupa pessoas; DomainLocal recebe permissões.', when: 'Permissões se dão a grupos, nunca a pessoas: fica fácil quando alguém muda de área.' },
    'win-member': { cmd: 'Add-ADGroupMember -Identity <grupo> -Members <login>', ex: 'Add-ADGroupMember -Identity Suporte -Members ana.souza', what: 'Coloca contas (ou outros grupos) dentro de um grupo.', when: 'Para a pessoa herdar as permissões do grupo.' },
    'win-disable': { cmd: 'Disable-ADAccount -Identity <login>', ex: 'Disable-ADAccount -Identity joao.lima', what: 'Desabilita a conta: ninguém mais entra com ela, mas o histórico fica.', when: 'Quando alguém sai da empresa (desabilite antes de excluir).' },
    'win-locked': { cmd: 'Search-ADAccount -LockedOut', ex: 'Search-ADAccount -LockedOut', what: 'Lista as contas bloqueadas por excesso de senhas erradas.', when: 'Quando um usuário diz que "a conta travou".' },
    'win-unlock': { cmd: 'Unlock-ADAccount -Identity <login>', ex: 'Unlock-ADAccount -Identity ana.souza', what: 'Desbloqueia a conta (não muda a senha).', when: 'Depois de confirmar com o usuário. Se ele esqueceu a senha, redefina com Set-ADAccountPassword -Reset.' },
    'win-event': { cmd: 'Get-WinEvent -LogName System|Security -MaxEvents <n>', ex: 'Get-WinEvent -LogName Security -MaxEvents 5', what: 'Mostra os eventos mais recentes. Security: logins e contas (4740 = conta bloqueada). System: serviços (7036).', when: 'Para descobrir O QUE aconteceu e QUANDO, antes de mexer.' },
    'win-service': { cmd: 'Get-Service <nome>', ex: 'Get-Service DNS', what: 'Mostra se um serviço está Running ou Stopped. Sem nome, lista todos.', when: 'Quando uma função (DNS, DHCP, AD) para de responder.' },
    'win-start': { cmd: 'Start-Service <nome>', ex: 'Start-Service DNS', what: 'Inicia um serviço parado. Restart-Service para e inicia.', when: 'Depois de ver no Get-Service / log que o serviço caiu.' },
    'win-mkdir': { cmd: 'New-Item -Path <pasta> -ItemType Directory', ex: 'New-Item -Path C:\\Dados\\Financeiro -ItemType Directory', what: 'Cria uma pasta (e as de cima, se faltarem).', when: 'Antes de compartilhar ou dar permissões.' },
    'win-icacls': { cmd: 'icacls <pasta> [/grant "conta:(OI)(CI)M"] [/remove conta] [/inheritance:r]', ex: 'icacls C:\\Dados\\Financeiro /grant "CORP\\Financeiro:(OI)(CI)M"', what: 'Mostra e altera permissões NTFS. (I) = herdada, F total, M modificar, RX leitura.', when: 'Para restringir uma pasta a um grupo (menor privilégio).' },
    'win-inherit': { cmd: 'icacls <pasta> /inheritance:r', ex: 'icacls C:\\Dados\\Financeiro /inheritance:r', what: 'Remove as permissões herdadas da pasta de cima (como BUILTIN\\Users). /inheritance:d copia antes de cortar.', when: 'Quando uma pasta precisa ser fechada só para um grupo.' },
    'win-share': { cmd: 'New-SmbShare -Name <nome> -Path <pasta> -ChangeAccess <grupo>', ex: 'New-SmbShare -Name Financeiro -Path C:\\Dados\\Financeiro -ChangeAccess "CORP\\Financeiro"', what: 'Compartilha a pasta na rede (\\\\servidor\\nome) com permissões de compartilhamento.', when: 'Para os PCs acessarem a pasta pela rede.' },
    'win-dnszones': { cmd: 'Get-DnsServerZone', ex: 'Get-DnsServerZone', what: 'Lista as zonas DNS que este servidor responde.', when: 'Para saber em qual zona criar registros.' },
    'win-dnsa': { cmd: 'Add-DnsServerResourceRecordA -ZoneName <zona> -Name <nome> -IPv4Address <ip>', ex: 'Add-DnsServerResourceRecordA -ZoneName corp.datalab.local -Name web -IPv4Address 10.0.1.12', what: 'Cria um registro A: o nome (web.corp.datalab.local) aponta para o IP.', when: 'Para os usuários acessarem um servidor pelo nome.' },
    'win-dnscname': { cmd: 'Add-DnsServerResourceRecordCName -ZoneName <zona> -Name <apelido> -HostNameAlias <nome completo>', ex: 'Add-DnsServerResourceRecordCName -ZoneName corp.datalab.local -Name www -HostNameAlias web.corp.datalab.local', what: 'Cria um apelido (CNAME) que aponta para outro nome.', when: 'Para ter um nome amigável (www) sem repetir o IP.' },
    'win-resolve': { cmd: 'Resolve-DnsName <nome>  /  nslookup <nome>', ex: 'Resolve-DnsName www.corp.datalab.local', what: 'Pergunta ao DNS qual o IP de um nome e mostra o caminho (CNAME → A).', when: 'Para testar registros DNS.' },
    'win-dhcpinstall': { cmd: 'Install-WindowsFeature DHCP -IncludeManagementTools', ex: 'Install-WindowsFeature DHCP -IncludeManagementTools', what: 'Instala a função Servidor DHCP e os cmdlets *-Dhcp*.', when: 'Para os PCs da empresa receberem IP automaticamente.' },
    'win-scope': { cmd: 'Add-DhcpServerv4Scope -Name <nome> -StartRange <ip> -EndRange <ip> -SubnetMask 255.255.255.0', ex: 'Add-DhcpServerv4Scope -Name LAN -StartRange 10.0.1.100 -EndRange 10.0.1.199 -SubnetMask 255.255.255.0', what: 'Cria a faixa de IPs que o DHCP empresta. Deixe os IPs fixos de fora.', when: 'Depois de instalar o DHCP.' },
    'win-option': { cmd: 'Set-DhcpServerv4OptionValue -ScopeId <rede> -Router <gw> -DnsServer <ip>', ex: 'Set-DhcpServerv4OptionValue -ScopeId 10.0.1.0 -Router 10.0.1.1 -DnsServer 10.0.1.13', what: 'Define o que vai junto com o IP: gateway (Router, opção 3) e DNS (opção 6).', when: 'Sempre: sem gateway e DNS o PC tem IP mas não navega nem acha o domínio.' },
    'win-authorize': { cmd: 'Add-DhcpServerInDC', ex: 'Add-DhcpServerInDC', what: 'Autoriza este servidor DHCP no Active Directory.', when: 'Num domínio, um DHCP não autorizado não entrega IPs (evita DHCP pirata).' },
    'win-lease': { cmd: 'Get-DhcpServerv4Lease -ScopeId <rede>', ex: 'Get-DhcpServerv4Lease -ScopeId 10.0.1.0', what: 'Lista quais dispositivos pegaram IP do escopo.', when: 'Para confirmar que o DHCP está funcionando.' },
  };
  for (const k of Object.keys(WIN_HELP)) WIN_HELP[k].os = 'win';
  Object.assign(DL.CMD_HELP, WIN_HELP);

  /* ------------------------------------------------------------------ */
  /* Lessons: setup, faults and missions                                 */
  /* ------------------------------------------------------------------ */
  const L = DL.LESSONS;
  L.winsetup = (d) => ({
    title: 'Instalar Windows Server · ' + d.name,
    goal: 'Servidor novo com cabo. Instale o Windows Server 2022 pelo console, defina a senha do Administrador, dê o IP fixo ' + d.ip + '/24 (gateway 10.0.1.1), o nome ' + d.name + ' e teste a rede.',
    steps: [
      { text: 'Veja as edições disponíveis na mídia de instalação.', help: ['win-dism'], done: (d, ran) => ran.has('win-wiminfo') || W(d).stage !== 'media' },
      { text: 'Instale uma edição (Core = sem interface gráfica, padrão em datacenter).', help: ['win-setup'], done: (d) => W(d).stage !== 'media' },
      { text: 'Defina uma senha forte para o Administrador.', help: ['win-pass'], done: (d) => W(d).stage === 'ready' },
      { text: 'Veja a configuração de rede (169.254.x.x = sem IP).', help: ['win-ipconfig'], done: (d, ran) => ran.has('ip-show') },
      { text: 'Configure o IP fixo ' + d.ip + '/24 com gateway 10.0.1.1.', help: ['win-newip'], cmd: 'New-NetIPAddress -InterfaceAlias Ethernet -IPAddress ' + d.ip + ' -PrefixLength 24 -DefaultGateway 10.0.1.1', done: (d) => eth(d).ips.indexOf(d.ip + '/24') >= 0 && d.os.route === '10.0.1.1' },
      { text: 'Renomeie o servidor para ' + d.name + ' e reinicie.', help: ['win-rename', 'win-restart'], cmd: 'Rename-Computer -NewName ' + d.name + ' -Restart', done: (d) => low(W(d).host) === low(d.name) && !W(d).pending.name },
      { text: 'Teste a conexão com o gateway 10.0.1.1.', help: ['win-ping'], done: (d, ran) => ran.has('ping-ok:10.0.1.1') },
    ],
  });
  L['win-link'] = (d) => ({
    title: 'Falha de conexão · ' + d.name,
    goal: d.name + ' (Windows) parou de responder na rede. Descubra o motivo, corrija e teste.',
    steps: [
      { text: 'Veja o estado do adaptador de rede.', help: ['win-adapter', 'win-ipconfig'], done: (d, ran) => ran.has('link-show') || ran.has('ip-show') },
      { text: 'O adaptador Ethernet está Disabled. Habilite-o.', help: ['win-adapter'], done: (d) => eth(d).up },
      { text: 'Teste a conexão com o gateway 10.0.1.1.', help: ['win-ping'], done: (d, ran) => ran.has('ping-ok:10.0.1.1') },
    ],
  });
  L['win-cable'] = (d) => ({
    title: 'Falha de conexão · ' + d.name,
    goal: d.name + ' (Windows) sumiu da rede. Descubra se é configuração ou camada física.',
    steps: [
      { text: 'Veja o estado do adaptador de rede.', help: ['win-adapter', 'win-ipconfig'], done: (d, ran) => ran.has('link-show') || ran.has('ip-show') },
      { text: 'Disconnected / mídia desconectada = sem sinal no cabo. Reconecte o cabo no rack.', help: ['cabling'], action: 'cabling', done: (d) => d.os.cable },
      { text: 'Teste a conexão com o gateway 10.0.1.1.', help: ['win-ping'], done: (d, ran) => ran.has('ping-ok:10.0.1.1') },
    ],
  });
  L.winsvc = (d) => {
    const s = W(d).faultSvc || 'DNS';
    return {
      title: 'Serviço parado · ' + d.name,
      goal: 'Uma função do ' + d.name + ' parou de responder. Investigue os serviços e o log antes de agir.',
      steps: [
        { text: 'Liste os serviços e ache o que está Stopped.', help: ['win-service'], cmd: 'Get-Service', done: (d, ran) => ran.has('win-svc:' + low(s)) },
        { text: 'Veja no log System quando ele parou.', help: ['win-event'], cmd: 'Get-WinEvent -LogName System -MaxEvents 5', done: (d, ran) => ran.has('win-events:system') },
        { text: 'Inicie o serviço ' + s + '.', help: ['win-start'], cmd: 'Start-Service ' + s, done: (d) => running(W(d), s) },
        { text: 'Confirme que ' + s + ' está Running.', help: ['win-service'], cmd: 'Get-Service ' + s, done: (d, ran) => ran.has('win-svc-ok:' + low(s)) },
      ],
    };
  };
  L.lockout = (d) => {
    const who = (Object.values(W(d).users).find((u) => u.locked) || { sam: 'usuário' }).sam;
    return {
      title: 'Conta bloqueada · ' + d.name,
      goal: 'Um funcionário não consegue entrar no computador: a conta dele no domínio travou depois de várias senhas erradas.',
      steps: [
        { text: 'Encontre as contas bloqueadas no AD.', help: ['win-locked'], done: (d, ran) => ran.has('win-locked-search') },
        { text: 'Veja no log Security o evento 4740 (conta bloqueada).', help: ['win-event'], done: (d, ran) => ran.has('win-events:security') },
        { text: 'Desbloqueie a conta ' + who + '.', help: ['win-unlock'], cmd: 'Unlock-ADAccount -Identity ' + who, done: (d) => !Object.values(W(d).users).some((u) => u.locked) },
        { text: 'Confirme que nenhuma conta ficou bloqueada.', help: ['win-locked', 'win-users'], done: (d, ran) => ran.has('win-locked-clear') },
      ],
    };
  };

  // Missions: optional practice on a ready Windows Server, rewarded once per server.
  const zoneName = (d) => (W(d).domain ? W(d).domain.name : 'corp.datalab.local');
  const webTarget = (d) => {
    const D = game(), all = D ? D.ops.devices().filter((x) => x.kind === 'server' && x !== d && x.state === 'online') : [];
    const t = all.find((x) => x.svc === 'web') || all[0];
    return t ? { name: t.name, ip: t.ip } : { name: 'servidor web', ip: '10.0.1.12' };
  };
  const MISSIONS = [
    { id: 'mis-ad', title: 'Criar o domínio (Active Directory)', reward: 60, desc: 'Instale o AD DS e promova o servidor a controlador de domínio da floresta corp.datalab.local.', lock: () => null },
    { id: 'mis-users', title: 'Usuários, grupos e OUs', reward: 50, desc: 'Organize o AD: OU TI, grupo Suporte, a conta ana.souza e o desligamento de joao.lima.', lock: (d) => (W(d).domain ? null : 'Crie o domínio primeiro'),
      start: (d) => { const w = W(d); if (!w.users['joao.lima']) w.users['joao.lima'] = { sam: 'joao.lima', name: 'João Lima', ou: null, enabled: true, locked: false, pwd: true }; } },
    { id: 'mis-share', title: 'Pasta compartilhada com permissões', reward: 50, desc: 'Crie a pasta do Financeiro, compartilhe só com o grupo e feche as permissões NTFS.', lock: (d) => (W(d).domain ? null : 'Crie o domínio primeiro') },
    { id: 'mis-dns', title: 'Registros DNS', reward: 40, desc: 'Publique o servidor web pelo nome: registro A, apelido www e teste de resolução.', lock: (d) => (has(W(d), 'DNS') ? null : 'Precisa da função DNS (vem com o domínio)') },
    { id: 'mis-dhcp', title: 'DHCP para o escritório', reward: 50, desc: 'Entregue IP, gateway e DNS automaticamente às estações de trabalho.', lock: (d) => (W(d).domain ? null : 'Crie o domínio primeiro') },
  ];
  L['mis-ad'] = (d) => ({
    title: 'Missão · Criar o domínio',
    goal: 'Transforme o ' + d.name + ' no controlador de domínio da empresa: o AD vai guardar as contas e o DNS interno.',
    steps: [
      { text: 'Veja as funções disponíveis.', help: ['win-features'], done: (d, ran) => ran.has('win-features') || has(W(d), 'AD-Domain-Services') },
      { text: 'Instale a função AD DS com as ferramentas de gerenciamento.', help: ['win-feature'], done: (d) => has(W(d), 'AD-Domain-Services') && has(W(d), 'RSAT-AD-PowerShell') },
      { text: 'Crie a floresta corp.datalab.local (promove a DC e reinicia).', help: ['win-forest'], done: (d) => !!W(d).domain },
      { text: 'Confira o domínio.', help: ['win-addomain'], done: (d, ran) => ran.has('win-addomain') },
    ],
  });
  L['mis-users'] = (d) => ({
    title: 'Missão · Usuários, grupos e OUs',
    goal: 'Ana Souza entrou no Suporte e João Lima saiu da empresa. Organize o AD com uma OU para a TI e use grupos para as permissões.',
    steps: [
      { text: 'Crie a OU "TI".', help: ['win-ou'], done: (d) => W(d).ous.some((o) => low(o) === 'ti') },
      { text: 'Crie o grupo "Suporte" (escopo Global).', help: ['win-newgroup'], done: (d) => !!W(d).groups.suporte },
      { text: 'Crie a conta ana.souza na OU TI, com senha e habilitada.', help: ['win-newuser'], done: (d) => { const u = W(d).users['ana.souza']; return !!u && low(u.ou) === 'ti' && u.enabled && u.pwd; } },
      { text: 'Coloque ana.souza no grupo Suporte.', help: ['win-member'], done: (d) => !!W(d).groups.suporte && W(d).groups.suporte.members.indexOf('ana.souza') >= 0 },
      { text: 'João saiu da empresa: desabilite a conta joao.lima.', help: ['win-disable'], done: (d) => !!W(d).users['joao.lima'] && !W(d).users['joao.lima'].enabled },
      { text: 'Confira as contas do domínio.', help: ['win-users'], done: (d, ran) => ran.has('win-aduser-list') && !!W(d).users['joao.lima'] && !W(d).users['joao.lima'].enabled },
    ],
  });
  const finOk = (d) => {
    const w = W(d), acl = aclOf(w, 'C:\\Dados\\Financeiro');
    return acl.some((e) => /\\financeiro$/i.test(e.who) && (e.perm === 'M' || e.perm === 'F')) && !acl.some((e) => /^(BUILTIN\\Users|Everyone)$/i.test(e.who)) && acl.some((e) => /Administrators$/i.test(e.who) && e.perm === 'F');
  };
  L['mis-share'] = (d) => ({
    title: 'Missão · Pasta do Financeiro',
    goal: 'O Financeiro precisa de uma pasta na rede que só o grupo dele acesse. Permissão se dá a GRUPOS, com o mínimo necessário.',
    steps: [
      { text: 'Crie a pasta C:\\Dados\\Financeiro.', help: ['win-mkdir'], done: (d) => !!W(d).dirs['c:\\dados\\financeiro'] },
      { text: 'Crie o grupo "Financeiro" (DomainLocal: ele recebe a permissão).', help: ['win-newgroup'], done: (d) => !!W(d).groups.financeiro },
      { text: 'Compartilhe a pasta como "Financeiro" com Change para o grupo.', help: ['win-share'], done: (d) => { const s = W(d).shares.financeiro; return !!s && keyOf(s.path) === 'c:\\dados\\financeiro' && s.access.some((a) => /\\financeiro$/i.test(a.who) && a.right !== 'Read') && !s.access.some((a) => a.who === 'Everyone' && a.right !== 'Read'); } },
      { text: 'Veja as permissões NTFS: BUILTIN\\Users veio por herança.', help: ['win-icacls'], done: (d, ran) => ran.has('win-icacls:c:\\dados\\financeiro') },
      { text: 'Corte a herança e dê Modificar (M) ao grupo — Administrators mantém (F).', help: ['win-inherit', 'win-icacls'], done: finOk },
      { text: 'Confira as permissões finais.', help: ['win-icacls'], done: (d, ran) => finOk(d) && ran.has('win-icacls-view:c:\\dados\\financeiro:' + aclHash(W(d), 'C:\\Dados\\Financeiro')) },
    ],
  });
  L['mis-dns'] = (d) => {
    const t = webTarget(d), z = zoneName(d);
    return {
      title: 'Missão · Registros DNS',
      goal: 'Publique o ' + t.name + ' (' + t.ip + ') como web.' + z + ' e crie o apelido www. Teste a resolução.',
      steps: [
        { text: 'Veja as zonas deste servidor DNS.', help: ['win-dnszones'], done: (d, ran) => ran.has('win-dns-zones') },
        { text: 'Crie o registro A "web" → ' + t.ip + ' na zona ' + z + '.', help: ['win-dnsa'], cmd: 'Add-DnsServerResourceRecordA -ZoneName ' + z + ' -Name web -IPv4Address ' + t.ip, done: (d) => { const zz = W(d).zones[low(z)]; return !!zz && zz.records.some((r) => r.name === 'web' && r.type === 'A' && r.data === t.ip); } },
        { text: 'Crie o apelido (CNAME) "www" → web.' + z + '.', help: ['win-dnscname'], done: (d) => { const zz = W(d).zones[low(z)]; return !!zz && zz.records.some((r) => r.name === 'www' && r.type === 'CNAME' && low(r.data) === 'web.' + low(z)); } },
        { text: 'Resolva www.' + z + '.', help: ['win-resolve'], done: (d, ran) => ran.has('win-dns-ok:www.' + low(z)) || ran.has('win-dns-ok:www') },
      ],
    };
  };
  L['mis-dhcp'] = (d) => ({
    title: 'Missão · DHCP para o escritório',
    goal: 'As estações de trabalho do datacenter precisam de IP automático, com gateway e DNS. Os IPs fixos (servidores, gateway) ficam fora do escopo.',
    steps: [
      { text: 'Instale a função DHCP com as ferramentas.', help: ['win-dhcpinstall'], done: (d) => has(W(d), 'DHCP') && has(W(d), 'RSAT-DHCP') },
      { text: 'Crie um escopo (sugestão: 10.0.1.100 a 10.0.1.199, /24).', help: ['win-scope'], done: (d) => W(d).dhcp.scopes.length > 0 },
      { text: 'Configure gateway (10.0.1.1) e DNS (este servidor) no escopo.', help: ['win-option'], cmd: 'Set-DhcpServerv4OptionValue -ScopeId 10.0.1.0 -Router 10.0.1.1 -DnsServer ' + d.ip, done: (d) => W(d).dhcp.scopes.some((s) => s.router === '10.0.1.1' && s.dns.indexOf(myIp(d)) >= 0) },
      { text: 'Autorize o servidor DHCP no AD.', help: ['win-authorize'], done: (d) => W(d).dhcp.authorized },
      { text: 'Veja as concessões entregues às estações.', help: ['win-lease'], done: (d, ran) => ran.has('win-dhcp-lease') },
    ],
  });

  /* ------------------------------------------------------------------ */
  /* Faults (ops.js reads DL.FAULTS)                                     */
  /* ------------------------------------------------------------------ */
  const roleSvcs = (w) => ['DNS', 'DHCPServer', 'NTDS'].filter((s) => w.svc[s]);
  DL.FAULTS.winsvc = {
    kinds: ['server'], short: 'Serviço do Windows parado',
    when: (d) => ready(d) && roleSvcs(W(d)).some((s) => running(W(d), s)),
    msg: (d) => 'Serviço ' + (SERVICES[W(d).faultSvc] || 'do Windows') + ' parou no ' + d.name,
    // opts.svc: the one to stop (a problem about DNS / DHCP), when it is running
    apply: (d, o) => {
      const w = W(d), up = roleSvcs(w).filter((x) => running(w, x)), s = o && o.svc && up.indexOf(o.svc) >= 0 ? o.svc : pick(up);
      w.svc[s] = 'Stopped';
      w.faultSvc = s;
      event(w, 'System', 7031, 'Error', 'O serviço ' + SERVICES[s] + ' foi encerrado inesperadamente.');
    },
    fixed: (d) => !isWin(d) || !W(d).faultSvc || running(W(d), W(d).faultSvc),
    fix: (d) => { const w = W(d); if (w.faultSvc) w.svc[w.faultSvc] = 'Running'; w.faultSvc = null; },
  };
  DL.FAULTS.lockout = {
    kinds: ['server'], short: 'Conta bloqueada no AD',
    when: (d) => ready(d) && !!W(d).domain && running(W(d), 'NTDS') && Object.values(W(d).users).some((u) => !u.builtin && u.enabled),
    msg: (d) => { const u = Object.values(W(d).users).find((x) => x.locked); return 'Conta ' + (u ? u.sam : '') + ' bloqueada no domínio (' + d.name + ')'; },
    apply: (d) => {
      const w = W(d), u = pick(Object.values(w.users).filter((x) => !x.builtin && x.enabled));
      u.locked = true;
      for (let i = 0; i < 2; i++) event(w, 'Security', 4625, 'Information', 'Falha de logon da conta ' + u.sam + ': senha incorreta.');
      event(w, 'Security', 4740, 'Information', 'Uma conta de usuário foi bloqueada: ' + u.sam + ' (5 senhas erradas).');
    },
    fixed: (d) => !isWin(d) || !Object.values(W(d).users).some((u) => u.locked),
    fix: (d) => { for (const u of Object.values(W(d).users)) u.locked = false; },
  };
  // (career problems only) the static IP is gone: the adapter falls back to APIPA (169.254.x.x)
  DL.FAULTS.winnoip = {
    problem: true, loss: 'offline', kinds: ['server'], short: 'Windows sem IP', when: (d) => ready(d),
    msg: (d) => 'Servidor ' + d.name + ' (Windows) sem IP: pegou um endereço 169.254',
    apply: (d) => { eth(d).ips = []; d.os.route = null; event(W(d), 'System', 4199, 'Warning', 'O sistema não obteve um endereço IP para o adaptador Ethernet e usará um endereço APIPA.'); },
    fixed: (d) => !isWin(d) || (eth(d).ips.indexOf(d.ip + '/24') >= 0 && d.os.route === '10.0.1.1'),
    fix: (d) => { eth(d).ips = [d.ip + '/24']; d.os.route = '10.0.1.1'; },
  };
  // an event in a Windows log (problems.js: "who restarted the server?")
  DL.winEvent = (d, log, id, lvl, msg) => { if (isWin(d)) event(W(d), log, id, lvl, msg); };

  /* ------------------------------------------------------------------ */
  /* Career problems (problems.js): what a problem sets up on a Windows  */
  /* Server (setup.win) and the states its steps check. Each setup can   */
  /* run again (a save brings the problem back) without doubling things. */
  /* ------------------------------------------------------------------ */
  const zoneOf = (w) => (w.domain ? w.zones[low(w.domain.name)] || w.zones[w.domain.name] : null);
  // (an account the problem needs comes back as the problem expects it: enabled, unlocked, with a password)
  const addUser = (w, sam, name) => Object.assign(w.users[sam] || (w.users[sam] = { sam, name, ou: null }), { enabled: true, locked: false, pwd: true });
  const addGroup = (w, name, scope) => { const k = low(name); if (!w.groups[k]) w.groups[k] = { name, scope: scope || 'Global', cat: 'Security', ou: null, members: [] }; return w.groups[k]; };
  const join = (g, sam) => { if (g.members.indexOf(sam) < 0) g.members.push(sam); };
  const installRole = (w, f) => { for (const x of [f].concat(FEATURES[f].tools || [])) if (!has(w, x)) w.features.push(x); for (const s of FEATURES[f].svc || []) w.svc[s] = 'Running'; };
  const scope = (d, from, to, opts) => {
    const w = W(d);
    w.dhcp.scopes = w.dhcp.scopes.filter((s) => s.id !== '10.0.1.0');
    w.dhcp.scopes.push(Object.assign({ id: '10.0.1.0', name: 'LAN', start: from, end: to, mask: '255.255.255.0', state: 'Active', router: '10.0.1.1', dns: [myIp(d)], dnsDomain: null }, opts || {}));
  };
  const SETUP = {
    // three ordinary accounts in the domain
    users: (d) => { const w = W(d); addUser(w, 'ana.souza', 'Ana Souza'); addUser(w, 'bruno.alves', 'Bruno Alves'); addUser(w, 'carla.mendes', 'Carla Mendes'); },
    // web → the peer server (the CNAME problem needs it)
    webA: (d, c) => { const z = zoneOf(W(d)), p = c.devs.peer; if (z && p) { z.records = z.records.filter((r) => r.name !== 'web'); z.records.push({ name: 'web', type: 'A', data: p.ip }); } },
    // the peer server has no name in the zone
    dropPeerRr: (d, c) => { const z = zoneOf(W(d)), p = c.devs.peer; if (z && p) z.records = z.records.filter((r) => r.name !== low(p.name)); },
    // DHCP installed, with a scope missing one thing (or nothing)
    dhcpNoRouter: (d) => { installRole(W(d), 'DHCP'); W(d).dhcp.authorized = true; scope(d, '10.0.1.100', '10.0.1.199', { router: null }); },
    dhcpNoAuth: (d) => { installRole(W(d), 'DHCP'); W(d).dhcp.authorized = false; scope(d, '10.0.1.100', '10.0.1.199'); },
    dhcpFull: (d) => { installRole(W(d), 'DHCP'); W(d).dhcp.authorized = true; scope(d, '10.0.1.100', '10.0.1.199'); },
    // three addresses only: the office has more PCs than that
    dhcpTiny: (d) => { installRole(W(d), 'DHCP'); W(d).dhcp.authorized = true; scope(d, '10.0.1.100', '10.0.1.102'); },
    // the Financeiro folder shared with its group, NTFS still inherited (BUILTIN\Users reads it)
    finOpen: (d) => {
      const w = W(d);
      mkdir(w, 'C:\\Dados\\Financeiro');
      const dir = w.dirs['c:\\dados\\financeiro'];
      dir.inherit = true; dir.acl = [];
      addGroup(w, 'Financeiro', 'DomainLocal');
      w.shares.financeiro = { name: 'Financeiro', path: dir.path, access: [{ who: w.domain.netbios + '\\Financeiro', right: 'Change' }] };
    },
    // the group with its folder already closed to it (a new hire only needs the account and the group)
    newhire: (d) => {
      const w = W(d);
      // (a second time: the new hire isn't there yet)
      delete w.users['lucas.prado'];
      for (const g of Object.values(w.groups)) g.members = g.members.filter((m) => m !== 'lucas.prado');
      SETUP.finOpen(d);
      w.dirs['c:\\dados\\financeiro'].inherit = false;
      w.dirs['c:\\dados\\financeiro'].acl = [{ who: BUILTIN.administrators, perm: 'F' }, { who: w.domain.netbios + '\\Financeiro', perm: 'M' }];
      if (!w.ous.some((o) => low(o) === 'financeiro')) w.ous.push('Financeiro');
    },
    // three departments, one group each
    depts: (d) => { const w = W(d); for (const g of ['RH', 'Compras', 'Vendas']) addGroup(w, g, 'DomainLocal'); },
    // someone leaving, in two groups
    leaver: (d) => { const w = W(d); SETUP.users(d); addUser(w, 'joao.lima', 'João Lima'); join(addGroup(w, 'Suporte'), 'joao.lima'); join(addGroup(w, 'Projetos'), 'joao.lima'); },
    // a Global group with people in it and the folder it should reach
    comercial: (d) => { const w = W(d); SETUP.users(d); const g = addGroup(w, 'Comercial'); join(g, 'ana.souza'); join(g, 'bruno.alves'); mkdir(w, 'C:\\Dados\\Comercial'); },
    // one user typing the wrong password (Security log, 4625)
    badpwd: (d, c) => {
      const w = W(d);
      SETUP.users(d);
      w.badUser = c.vars.bad || pick(['ana.souza', 'bruno.alves', 'carla.mendes']);
      for (let i = 0; i < 4; i++) event(w, 'Security', 4625, 'Information', 'Falha de logon da conta ' + w.badUser + ': senha incorreta.');
    },
    // a service account locked by a machine with the old password (Security log says from where)
    svclock: (d, c) => {
      const w = W(d), src = (c.devs.peer && c.devs.peer.ip) || '10.0.1.50';
      addUser(w, 'svc_backup', 'Conta do backup').locked = true;
      w.lockSrc = src;
      for (let i = 0; i < 3; i++) event(w, 'Security', 4625, 'Information', 'Falha de logon da conta svc_backup: senha incorreta. Endereço de origem: ' + src);
      event(w, 'Security', 4740, 'Information', 'Uma conta de usuário foi bloqueada: svc_backup (origem ' + src + ').');
    },
    // the audit team needs to read the Financeiro share
    audit: (d) => { SETUP.finOpen(d); addGroup(W(d), 'Auditoria'); },
    // a compromised account encrypting the Financeiro share (Security log: thousands of changes)
    ransom: (d, c) => {
      const w = W(d);
      SETUP.finOpen(d);
      SETUP.users(d);
      w.ransomUser = c.vars.who || pick(['ana.souza', 'bruno.alves', 'carla.mendes']);
      event(w, 'Security', 4624, 'Information', 'Logon da conta ' + w.ransomUser + ' a partir de 10.0.1.' + (100 + Math.floor(rand() * 50)) + '.');
      for (let i = 0; i < 3; i++) event(w, 'Security', 4663, 'Information', 'A conta ' + w.ransomUser + ' modificou ' + (900 + Math.floor(rand() * 400)) + ' arquivos em C:\\Dados\\Financeiro (extensão nova: .locked).');
    },
  };
  // name: a setup above (or a list of them) · ctx: { devs: the devices of the problem, vars: what a save kept }
  DL.winSetup = function (d, name, ctx) {
    if (!ready(d)) return false;
    for (const n of [].concat(name)) {
      if (!SETUP[n]) continue;
      if (n !== 'dhcpNoRouter' && n !== 'dhcpNoAuth' && n !== 'dhcpFull' && n !== 'dhcpTiny' && !W(d).domain) return false;
      SETUP[n](d, ctx || { devs: {}, vars: {} });
    }
    return true;
  };
  // the states the steps check (problems.js reads them like its own)
  const userState = (u) => (!u ? null : u.locked ? 'locked' : u.enabled ? 'enabled' : 'disabled');
  const grantOf = (w, path, group) => aclOf(w, path).filter((e) => low(e.who.replace(/^.*\\/, '')) === low(group));
  if (DL.SCENARIO_PROBES) Object.assign(DL.SCENARIO_PROBES, {
    'win.ou': (d, n) => isWin(d) && W(d).ous.some((o) => low(o) === low(n)),
    'win.usersIn': (d, ou) => (isWin(d) ? Object.values(W(d).users).filter((u) => !u.builtin && u.enabled && u.pwd && low(u.ou) === low(ou)).length : null),
    'win.user': (d, sam) => (isWin(d) ? userState(W(d).users[low(sam)]) : null),
    'win.group': (d, n) => isWin(d) && !!W(d).groups[low(n)],
    'win.groupScope': (d, n) => (isWin(d) && W(d).groups[low(n)] ? W(d).groups[low(n)].scope : null),
    'win.members': (d, n) => (isWin(d) && W(d).groups[low(n)] ? W(d).groups[low(n)].members.length : null),
    // 'grupo:membro'
    'win.memberOf': (d, a) => { const [g, m] = String(a).split(':'); return isWin(d) && !!W(d).groups[low(g)] && W(d).groups[low(g)].members.indexOf(low(m)) >= 0; },
    // the groups a user is in (besides Domain Users)
    'win.groupsOf': (d, sam) => (isWin(d) ? Object.values(W(d).groups).filter((g) => !g.builtin && g.members.indexOf(low(sam)) >= 0).length : null),
    // a record of the domain's zone: what it points to (an IP or, for a CNAME, a name)
    'win.rr': (d, n) => { const z = isWin(d) && zoneOf(W(d)); const r = z && z.records.find((x) => x.name === low(n)); return r ? low(r.data) : null; },
    'win.svc': (d, s) => (isWin(d) ? W(d).svc[s] || null : null),
    'win.scopes': (d) => (isWin(d) ? W(d).dhcp.scopes.length : null),
    'win.scopeRouter': (d) => (isWin(d) && W(d).dhcp.scopes[0] ? W(d).dhcp.scopes[0].router : null),
    'win.scopeDns': (d) => isWin(d) && W(d).dhcp.scopes.some((s) => s.dns.length > 0),
    'win.scopeSize': (d) => (isWin(d) ? Math.max(0, ...W(d).dhcp.scopes.map((s) => ipNum(s.end) - ipNum(s.start) + 1)) : null),
    'win.dhcpAuth': (d) => isWin(d) && W(d).dhcp.authorized,
    'win.leases': (d) => (isWin(d) ? W(d).dhcp.scopes.reduce((n, s) => n + leasesOf(d, s).length, 0) : null),
    'win.dir': (d, p) => isWin(d) && !!W(d).dirs[dirKey(p)],
    // 'share:grupo' → the group's right on that share (Full / Change / Read)
    'win.shareTo': (d, a) => { const [s, g] = String(a).split(':'); const sh = isWin(d) && W(d).shares[low(s)]; const e = sh && sh.access.find((x) => low(x.who.replace(/^.*\\/, '')) === low(g)); return e ? e.right : null; },
    // 'path|grupo': the group can modify the folder (explicit or inherited)
    'win.aclHas': (d, a) => { const [p, g] = String(a).split('|'); return isWin(d) && grantOf(W(d), p, g).some((e) => e.perm === 'M' || e.perm === 'F'); },
    // 'path|grupo': only that group (and the administrators) — the folder closed to everyone else
    'win.aclOnly': (d, a) => {
      const [p, g] = String(a).split('|');
      if (!isWin(d) || !W(d).dirs[dirKey(p)]) return false;
      const acl = aclOf(W(d), p);
      return grantOf(W(d), p, g).some((e) => e.perm === 'M' || e.perm === 'F') && !acl.some((e) => /^(BUILTIN\\Users|Everyone|NT AUTHORITY\\Authenticated Users)$/i.test(e.who)) && acl.some((e) => /Administrators$/i.test(e.who) && e.perm === 'F');
    },
    'win.dnsTo': (d, ip) => isWin(d) && W(d).dnsClient[0] === ip,
    // the domain as the commands write it: DC=corp,DC=datalab,DC=local · CORP
    'win.dn': (d) => (isWin(d) && W(d).domain ? dn(W(d)) : null),
    'win.netbios': (d) => (isWin(d) && W(d).domain ? W(d).domain.netbios : null),
    'win.badUser': (d) => (isWin(d) && W(d).badUser) || null,
    'win.ransomUser': (d) => (isWin(d) && W(d).ransomUser) || null,
    'win.share': (d, n) => isWin(d) && !!W(d).shares[low(n)],
    'win.lockSrc': (d) => (isWin(d) && W(d).lockSrc) || null,
  });
  // Linux-only faults never hit a Windows server
  for (const k of ['service', 'disk']) { const f = DL.FAULTS[k], was = f.when; f.when = (d) => !isWin(d) && (!was || was(d)); }

  // the lesson for a fault on this device
  DL.winLessonFor = (d, type) => (isWin(d) ? ({ link: 'win-link', cable: 'win-cable', winsvc: 'winsvc', lockout: 'lockout' }[type] || type) : type);

  // what the crew says about Windows problems (talk.js)
  DL.WIN_TALK = {
    hint: {
      link: (d) => 'O adaptador Ethernet do ' + d.name + ' está Disabled. No PowerShell: Get-NetAdapter, Enable-NetAdapter -Name Ethernet e teste com ping 10.0.1.1.',
      cable: (d) => 'O ' + d.name + ' mostra "mídia desconectada": é cabo. Confira o Cabeamento do ' + d.rack.id + '.',
      winsvc: (d) => 'O serviço ' + (W(d).faultSvc || 'DNS') + ' parou no ' + d.name + '. Get-Service mostra, Get-WinEvent -LogName System conta quando, Start-Service resolve.',
      lockout: (d) => 'Uma conta travou no domínio do ' + d.name + '. Search-ADAccount -LockedOut acha, Unlock-ADAccount resolve.',
    },
    vague: {
      link: (d) => 'O ' + d.name + ' (Windows) perdeu a rede. Pode ser o adaptador.',
      cable: (d) => 'O ' + d.name + ' perdeu a conexão. Acho que devemos verificar os cabos.',
      winsvc: (d) => 'Alguma função do ' + d.name + ' parou: o pessoal reclama que o domínio está estranho.',
      lockout: (d) => 'Tem gente sem conseguir entrar no computador. Deve ser coisa do AD no ' + d.name + '.',
    },
    look: { link: 'Comece pelo adaptador de rede.', cable: 'Desconfie da camada física.', winsvc: 'Olhe os serviços e o log System.', lockout: 'Olhe as contas do AD e o log Security.' },
    steps: {
      link: '1) Get-NetAdapter · 2) Enable-NetAdapter -Name Ethernet · 3) ping 10.0.1.1.',
      cable: '1) ipconfig mostra mídia desconectada · 2) Cabeamento do rack: cabo laranja solto · 3) ping para confirmar.',
      winsvc: '1) Get-Service (ache o Stopped) · 2) Get-WinEvent -LogName System -MaxEvents 5 · 3) Start-Service <nome> · 4) Get-Service <nome>.',
      lockout: '1) Search-ADAccount -LockedOut · 2) Get-WinEvent -LogName Security -MaxEvents 5 · 3) Unlock-ADAccount -Identity <login> · 4) Search-ADAccount -LockedOut.',
    },
    state: { winsvc: 'está com um serviço do Windows parado', lockout: 'está com uma conta bloqueada no AD' },
  };

  /* ------------------------------------------------------------------ */
  /* Integration API                                                     */
  /* ------------------------------------------------------------------ */
  DL.winShell = winShell;
  DL.winPrompt = (d) => { const w = W(d); return w.stage === 'media' ? 'X:\\Sources>' : w.stage === 'oobe' ? 'C:\\Windows\\system32>' : 'PS ' + w.cwd + '>'; };
  DL.winBanner = (d) => {
    const w = W(d);
    if (w.stage === 'media') return ['<span class="m">Windows Server 2022 · mídia de instalação (WinPE) · ' + esc(d.name) + ' · console do rack</span>', '<span class="m">Digite help para ver os comandos da instalação.</span>', ''];
    if (w.stage === 'oobe') return ['<span class="m">' + esc(edName(w)) + ' · ' + esc(d.name) + '</span>', 'O usuário precisa alterar a senha antes de entrar pela primeira vez.', '<span class="m">net user Administrator &lt;senha&gt;</span>', ''];
    return ['<span class="m">' + esc(edName(w)) + ' · ' + esc(w.host) + (w.domain ? ' · domínio ' + esc(w.domain.name) : ' · grupo de trabalho') + ' · console do rack</span>', 'Windows PowerShell', '<span class="m">Digite help para ver os comandos · help conceitos explica AD, DNS, DHCP e permissões. ↑ repete, Tab completa.</span>', ''];
  };
  DL.WIN_FIRST = ['help', 'ipconfig', 'ping', 'hostname', 'whoami', 'net', 'icacls', 'nslookup', 'sconfig', 'dism', 'setup.exe', 'get-netadapter', 'enable-netadapter', 'new-netipaddress', 'get-netipconfiguration', 'set-dnsclientserveraddress', 'rename-computer', 'restart-computer', 'test-connection', 'get-windowsfeature', 'install-windowsfeature', 'get-service', 'start-service', 'restart-service', 'get-winevent', 'install-addsforest', 'get-addomain', 'new-aduser', 'get-aduser', 'new-adgroup', 'add-adgroupmember', 'new-adorganizationalunit', 'unlock-adaccount', 'disable-adaccount', 'enable-adaccount', 'search-adaccount', 'new-item', 'new-smbshare', 'get-smbshare', 'get-dnsserverzone', 'add-dnsserverresourcerecorda', 'resolve-dnsname', 'add-dhcpserverv4scope', 'set-dhcpserverv4optionvalue', 'add-dhcpserverindc', 'get-dhcpserverv4lease'];
  DL.WIN_COMPLETE = ['ipconfig /all', 'Get-NetAdapter', 'Enable-NetAdapter -Name Ethernet', 'Get-NetIPConfiguration', 'New-NetIPAddress -InterfaceAlias Ethernet -IPAddress ', 'Set-DnsClientServerAddress -InterfaceAlias Ethernet -ServerAddresses ', 'Rename-Computer -NewName ', 'Restart-Computer', 'Test-Connection ', 'Get-WindowsFeature', 'Install-WindowsFeature ', 'Get-Service', 'Start-Service ', 'Restart-Service ', 'Get-WinEvent -LogName System -MaxEvents 5', 'Get-WinEvent -LogName Security -MaxEvents 5', 'Install-ADDSForest -DomainName ', 'Get-ADDomain', 'Get-ADUser -Filter *', 'Get-ADGroup -Filter *', 'Get-ADGroupMember -Identity ', 'New-ADUser -Name ', 'New-ADGroup -Name ', 'New-ADOrganizationalUnit -Name ', 'Add-ADGroupMember -Identity ', 'Search-ADAccount -LockedOut', 'Unlock-ADAccount -Identity ', 'Disable-ADAccount -Identity ', 'Enable-ADAccount -Identity ', 'Set-ADAccountPassword -Identity ', 'New-Item -Path ', 'New-SmbShare -Name ', 'Get-SmbShare', 'Get-SmbShareAccess -Name ', 'icacls ', 'Get-DnsServerZone', 'Get-DnsServerResourceRecord -ZoneName ', 'Add-DnsServerResourceRecordA -ZoneName ', 'Add-DnsServerResourceRecordCName -ZoneName ', 'Resolve-DnsName ', 'Install-WindowsFeature DHCP -IncludeManagementTools', 'Add-DhcpServerv4Scope -Name ', 'Get-DhcpServerv4Scope', 'Set-DhcpServerv4OptionValue -ScopeId ', 'Add-DhcpServerInDC', 'Get-DhcpServerv4Lease -ScopeId ', 'dism /Get-WimInfo /WimFile:install.wim', 'setup.exe /install /index:', 'net user Administrator '];

  // a server becomes Windows: fresh install from the media (the cable stays)
  DL.winInstall = function (d) {
    const cable = d.os ? d.os.cable : false;
    DL.newOS(d, false);
    d.os.cable = cable;
    d.os.family = 'windows';
    d.os.win = newWin();
    d.os.hostname = d.os.win.host;
    d.fault = null;
    d.ran = new Set();
    d.lessonKey = null;
  };
  // back to Linux (a reinstall: unconfigured)
  DL.winRemove = function (d) {
    const cable = d.os ? d.os.cable : false;
    DL.newOS(d, false);
    d.os.cable = cable;
    d.fault = null;
    d.ran = new Set();
    d.lessonKey = null;
  };
  // saves: the Windows state comes back on top of the restored device
  DL.winSnapshot = (d) => (isWin(d) ? JSON.parse(JSON.stringify(d.os.win)) : null);
  DL.winRestore = function (d, saved) {
    if (!saved || typeof saved !== 'object') return;
    const w = Object.assign(newWin(), saved);
    if (['media', 'oobe', 'ready'].indexOf(w.stage) < 0) w.stage = 'media';
    d.os.family = 'windows';
    d.os.win = w;
    d.os.hostname = w.host;
    if (w.stage !== 'media') d.os.ifaces.eth0.up = true;
  };

  // DNS for the other services (infra.js): a ready DC with DNS running provides it
  DL.winProvides = (d, type) => type === 'dns' && ready(d) && has(W(d), 'DNS') && running(W(d), 'DNS') && Object.keys(W(d).zones).length > 0;
  // revenue multiplier (infra.js svcFactor): the more the server does for the company, the more it's worth
  DL.winFactor = function (d) {
    if (!ready(d)) return 0.3;
    const w = W(d);
    let f = 0.55;
    if (w.domain && running(w, 'NTDS')) f += 0.3;
    if (DL.winProvides(d, 'dns')) f += 0.15;
    if (w.dhcp.scopes.some((s) => leasesOf(d, s).length)) f += 0.2;
    if (Object.values(w.users).filter((u) => !u.builtin && u.enabled).length >= 2) f += 0.1;
    if (Object.keys(w.shares).length) f += 0.1;
    return f;
  };
  DL.winSummary = (d) => {
    if (!isWin(d)) return '';
    const w = W(d);
    if (w.stage !== 'ready') return w.stage === 'media' ? 'Windows Server · aguardando instalação' : 'Windows Server · falta a senha do Administrador';
    const parts = [w.domain ? 'DC de ' + w.domain.name : 'grupo de trabalho'];
    if (has(w, 'DNS')) parts.push('DNS');
    if (w.dhcp.scopes.length) parts.push('DHCP');
    const n = Object.values(w.users).filter((u) => !u.builtin).length;
    if (n) parts.push(n + ' usuário(s)');
    return parts.join(' · ');
  };
  // monitoring (monitor.js): Windows roles watched like any other service
  DL.winTriggers = function (d) {
    if (!ready(d)) return [];
    const w = W(d), out = [];
    for (const s of ['DNS', 'DHCPServer', 'NTDS']) if (w.svc[s] === 'Stopped') out.push(['win:' + s, s === 'DHCPServer' ? 'average' : 'high', d.name + ': serviço ' + SERVICES[s] + ' parado']);
    const lk = Object.values(w.users).filter((u) => u.locked);
    if (lk.length) out.push(['win:lockout', 'average',d.name + ': conta ' + lk[0].sam + ' bloqueada (evento 4740)']);
    return out;
  };
  // a crew member answers one of those triggers (staff.js incident orders): the same end state as Start-Service
  // / Unlock-ADAccount. key: 'win:DNS' · 'win:DHCPServer' · 'win:NTDS' · 'win:lockout'
  DL.winRepair = function (d, key) {
    if (!ready(d)) return false;
    const w = W(d);
    if (key === 'win:lockout') {
      for (const u of Object.values(w.users)) if (u.locked) { u.locked = false; event(w, 'Security', 4767, 'Information', 'Uma conta de usuário foi desbloqueada: ' + u.sam + '.'); }
      return true;
    }
    const s = key.slice(4);
    if (!w.svc[s]) return false;
    w.svc[s] = 'Running';
    if (w.faultSvc === s) w.faultSvc = null;
    event(w, 'System', 7036, 'Information', 'O serviço ' + SERVICES[s] + ' entrou no estado em execução.');
    return true;
  };
  DL.winDiagnose = function (d, h) {
    if (!isWin(d)) return null;
    const w = W(d);
    if (!h.up) {
      const first = 'O host parou de responder ao ping. Comece pela camada física (cabo) e depois o adaptador e o IP. No PowerShell: Get-NetAdapter e ipconfig.';
      if (h.why === 'iface') return [first, 'O cabo está ok, mas o adaptador Ethernet está Disabled. Enable-NetAdapter -Name Ethernet.'];
      if (h.why === 'ip') return [first, 'O adaptador está sem o IP ' + d.ip + '/24 (New-NetIPAddress).'];
      return null;
    }
    const st = roleSvcs(w).find((s) => !running(w, s));
    if (st) return ['O servidor responde, mas uma função parou. Olhe os serviços do Windows.', 'O serviço ' + SERVICES[st] + ' está parado. Get-Service ' + st + ' / Get-WinEvent -LogName System.'];
    if (Object.values(w.users).some((u) => u.locked)) return ['O servidor está bem; o problema é com uma conta do domínio.', 'Search-ADAccount -LockedOut mostra quem travou; Unlock-ADAccount resolve.'];
    return null;
  };
  // missions shown in the terminal side panel
  DL.winMissions = (d) => (ready(d) && d.state === 'online' ? MISSIONS.map((m) => ({ id: m.id, title: m.title, desc: m.desc, reward: m.reward, done: W(d).done.indexOf(m.id) >= 0, lock: m.lock(d) })) : []);
  DL.winMissionStart = (d, id) => { const m = MISSIONS.find((x) => x.id === id); if (m && m.start) m.start(d); };
  DL.winMissionDone = function (d, id, g) {
    const w = W(d), m = MISSIONS.find((x) => x.id === id);
    if (!m || w.done.indexOf(id) >= 0) return;
    w.done.push(id);
    if (g && g.economy) g.economy.earn('credits', m.reward, 'Missão Windows: ' + m.title);
    if (g && g.toast) g.toast('ok', 'Missão concluída', m.title + ' · +' + m.reward + ' créditos');
    if (g && g.ops) g.ops.logEvent('ok', d.name + ': missão "' + m.title + '" concluída');
    if (g && g.sfx) g.sfx('done');
  };

  // A ready-made domain controller (the big preset): something to explore from day one
  DL.winPreset = function (d) {
    DL.winInstall(d);
    const w = W(d);
    w.stage = 'ready';
    w.edition = 'Datacenter';
    w.host = d.name;
    d.os.hostname = d.name;
    d.os.ifaces.eth0.up = true;
    d.os.ifaces.eth0.ips = [d.ip + '/24'];
    d.os.route = '10.0.1.1';
    d.os.cable = true;
    w.features.push('AD-Domain-Services', 'RSAT-AD-PowerShell', 'DHCP', 'RSAT-DHCP');
    w.svc.DHCPServer = 'Running';
    promote(d, 'corp.datalab.local', 'CORP');
    w.ous.push('Comercial');
    w.users['carla.mendes'] = { sam: 'carla.mendes', name: 'Carla Mendes', ou: 'Comercial', enabled: true, locked: false, pwd: true };
    w.users['bruno.alves'] = { sam: 'bruno.alves', name: 'Bruno Alves', ou: 'Comercial', enabled: true, locked: false, pwd: true };
    w.groups.vendas = { name: 'Vendas', scope: 'Global', cat: 'Security', ou: 'Comercial', members: ['carla.mendes', 'bruno.alves'] };
    w.dhcp.scopes.push({ id: '10.0.1.0', name: 'Escritorio', start: '10.0.1.100', end: '10.0.1.199', mask: '255.255.255.0', state: 'Active', router: '10.0.1.1', dns: [d.ip], dnsDomain: 'corp.datalab.local' });
    w.dhcp.authorized = true;
    w.done = ['mis-ad', 'mis-dhcp'];
    w.events = [];
    event(w, 'System', 6005, 'Information', 'O serviço de log de eventos foi iniciado.');
  };

  // tests / debugging
  DL.WinServer = { newWin, resolve, leasesOf, aclOf, principal, tokenize, params, weak, MISSIONS, FEATURES, SERVICES };
})();
