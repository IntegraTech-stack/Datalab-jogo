/* DataLab — infrastructure: what each server is FOR, and a small virtualization platform.
   - Specialisations (DL.SVC): every physical server runs one kind of service (Web/API, database, games,
     AI, storage, virtualization, DNS, e-mail, corporate apps, network services). Each has its own needs
     (cores, RAM, disk, network, GPU, cooling, other services it depends on) and earns accordingly
     (DL.svcFactor, used by economy.js).
   - Virtualization ("DataLab VE", Proxmox-inspired, simplified): servers set to "Virtualização" become
     nodes; VMs are created with CPU / RAM / disk, started, shut down, rebooted, removed; usage is
     simulated per VM and per node; running VMs host services and earn (DL.vmRevenue).
   - The Infra window (I) holds it all: summary, physical servers (choose the specialisation), nodes,
     VMs and the "Criar VM" wizard. */
(function () {
  'use strict';
  const DL = window.DL;
  const rand = Math.random;
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmt1 = (v) => (Math.round(v * 10) / 10).toLocaleString('pt-BR');

  /* ------------------------------------------------------------------ */
  /* Server specialisations                                              */
  /*   need: minimum hardware (cores, ram GB, disk TB, nic Gb/s, gpu)    */
  /*   deps: services that must exist somewhere (server or VM)          */
  /*   rev:  revenue multiplier when everything it needs is in place    */
  /*   load: typical CPU / RAM use of a VM running it (0–1)             */
  /* ------------------------------------------------------------------ */
  const SVC = {
    web: { name: 'Web / API', short: 'WEB', color: '#a0c3ec', service: 'nginx · API REST', need: { cores: 4, ram: 16 }, deps: ['dns'], rev: 1, load: [0.35, 0.5], desc: 'Sites e APIs. Depende de DNS para os clientes acharem o endereço.' },
    db: { name: 'Banco de dados', short: 'DB', color: '#ffc285', service: 'PostgreSQL', need: { cores: 8, ram: 64, ssd: true }, deps: [], storage: true, rev: 1.25, load: [0.45, 0.8], desc: 'Muita RAM e disco rápido (SSD/NVMe). Rende mais com storage na sala para backup.' },
    game: { name: 'Jogos', short: 'GAME', color: '#f472b6', service: 'Servidor de jogo', need: { cores: 12, ram: 32, nic: 10 }, deps: [], rev: 1.35, load: [0.65, 0.6], desc: 'CPU forte e rede de 10 Gb/s para muitos jogadores sem lag.' },
    ai: { name: 'IA', short: 'IA', color: '#7ee0a1', service: 'Inferência / treino', need: { gpu: true, ram: 256 }, deps: [], cool: true, rev: 2, load: [0.85, 0.75], desc: 'Exige servidor GPU e ar de precisão na sala (esquenta muito).' },
    storage: { name: 'Arquivos / Storage', short: 'FILES', color: '#c4b5fd', service: 'NFS · S3', need: { disk: 1.9 }, deps: [], rev: 0.9, load: [0.15, 0.4], desc: 'Precisa de muito disco (2 TB ou mais). Storage SAN na sala aumenta a capacidade.' },
    virt: { name: 'Virtualização', short: 'PVE', color: '#ff7a17', service: 'Hypervisor DataLab VE', need: { cores: 12, ram: 64 }, deps: [], rev: 0.35, load: [0.05, 0.1], desc: 'Vira um nó de virtualização: rende pelas VMs que hospeda (aba VMs).' },
    dns: { name: 'DNS', short: 'DNS', color: '#5eead4', service: 'BIND9', need: {}, deps: [], rev: 0.6, load: [0.08, 0.2], desc: 'Leve, mas essencial: Web e E-mail dependem dele.' },
    mail: { name: 'E-mail', short: 'MAIL', color: '#f2c14e', service: 'Postfix · Dovecot', need: { ram: 16, disk: 0.9 }, deps: ['dns'], rev: 0.9, load: [0.2, 0.45], desc: 'Caixas de e-mail. Depende de DNS (registros MX) e de disco.' },
    corp: { name: 'Aplicações corporativas', short: 'ERP', color: '#fca5a5', service: 'ERP · CRM', need: { cores: 8, ram: 64 }, deps: ['db'], rev: 1.2, load: [0.4, 0.65], desc: 'Sistemas de empresa. Dependem de um banco de dados.' },
    net: { name: 'Servidor de rede', short: 'NET', color: '#9aa3b0', service: 'DHCP · VPN · RADIUS', need: {}, deps: [], managed: true, rev: 0.7, load: [0.1, 0.25], desc: 'Serviços de rede. Precisa de switch gerenciável no caminho.' },
    // winserver.js: installed and configured from the console (PowerShell); revenue grows with what it does
    win: { name: 'Windows Server (AD)', short: 'WIN', color: '#60a5fa', service: 'AD DS · DNS · DHCP · arquivos', need: { cores: 4, ram: 16 }, deps: [], rev: 1, load: [0.15, 0.4], os: 'windows', desc: 'Windows Server 2022: domínio (usuários, grupos, permissões), DNS e DHCP da empresa. Trocar para ele reinstala o servidor: instale e configure pelo terminal. O DC com DNS atende Web e E-mail.' },
  };
  const SVC_ORDER = ['web', 'db', 'game', 'ai', 'storage', 'virt', 'dns', 'mail', 'corp', 'net', 'win'];
  DL.SVC = SVC;
  const svcOf = (d) => (d && SVC[d.svc] ? d.svc : 'web');
  const winOs = (d) => !!(DL.isWin && DL.isWin(d));
  DL.svcLabel = (d) => (winOs(d) ? 'Windows Server 2022' : 'Linux') + ' · ' + SVC[svcOf(d)].name;

  const OS_LIST = ['Debian 12', 'Ubuntu 24.04 LTS', 'Rocky Linux 9', 'Windows Server 2022'];
  const RAM_OPTS = [1, 2, 4, 8, 16, 32, 64, 128, 256];

  DL.createInfra = function (game, sys) {
    const ops = sys.ops, scene = game.scene;
    const world = () => scene.world;
    const $ = (id) => document.getElementById(id);
    const el = { ov: $('infra'), root: $('infraRoot'), btn: $('infraBtn') };
    const V = { vms: [], seq: 100, view: 'summary', sel: null, acc: 0, key: '', draft: null, msg: '', revenue: 0, focus: null, drawn: '', createViews: 0 };

    /* ---------------- specialisation rules ---------------- */
    const servers = () => ops.devices().filter((d) => d.kind === 'server');
    const up = (d) => d.state === 'online' && !d.fault && ops.health(d).up;
    const roomHas = (d, kind) => { const r = ops.roomOf(d.rack); return !!r && world().items.some((e) => e.kind === kind && ops.roomOf(e) === r); };
    // a service exists if a healthy server or a running VM provides it
    function provided(type) {
      if (servers().some((d) => svcOf(d) === type && up(d))) return true;
      // a domain controller with DNS running serves the whole company's names
      if (DL.winProvides && servers().some((d) => up(d) && DL.winProvides(d, type))) return true;
      return V.vms.some((v) => v.svc === type && v.status === 'running' && nodeUp(v.node));
    }
    function needsOf(d) {
      const s = SVC[svcOf(d)], n = s.need, m = DL.hwOf(d), out = [];
      if (n.cores && m.cores < n.cores) out.push('CPU: ' + m.cores + ' núcleos (pede ' + n.cores + '+)');
      if (n.ram && m.ram < n.ram) out.push('RAM: ' + DL.hwFmt.ram(m.ram) + ' (pede ' + DL.hwFmt.ram(n.ram) + '+)');
      if (n.disk && (m.diskTB || 0) < n.disk) out.push('Disco: ' + fmt1(m.diskTB || 0) + ' TB (pede ' + fmt1(n.disk) + ' TB+)');
      if (n.ssd && /HDD/i.test(m.disk || '')) out.push('Disco lento (HDD): pede SSD/NVMe');
      if (n.nic && (m.nic || 1) < n.nic) out.push('Placa de rede de ' + (m.nic || 1) + ' Gb/s (pede ' + n.nic + ' Gb/s)');
      if (n.gpu && !/gpu/i.test((m.cpu || '') + (m.tier || '') + (m.name || ''))) out.push('Sem GPU: use o Servidor GPU (IA)');
      if (s.cool && !roomHas(d, 'crac')) out.push('Sala sem ar de precisão');
      if (s.managed) { const t = d.path; if (t && t.ok && t.sw.model && t.sw.model.managed === false) out.push('Switch não gerenciável no caminho'); }
      return out;
    }
    function depsOf(d) { if (!d.svc) return []; return SVC[svcOf(d)].deps.filter((x) => !provided(x)).map((x) => 'Depende de ' + SVC[x].name + ' (nenhum no ar)'); }
    // revenue multiplier read by economy.js (1 = the classic server)
    DL.svcFactor = function (d) {
      if (!d.svc) return 1; // not specialised yet: the classic generic server
      const s = SVC[svcOf(d)];
      let f = s.os === 'windows' && DL.winFactor ? s.rev * DL.winFactor(d) : s.rev;
      if (needsOf(d).length) f *= 0.45;
      if (depsOf(d).length) f *= 0.6;
      if (s.storage && roomHas(d, 'storage')) f *= 1.2;
      if (svcOf(d) === 'storage' && roomHas(d, 'storage')) f *= 1.3;
      return f;
    };

    /* ---------------- virtualization ---------------- */
    const nodes = () => servers().filter((d) => svcOf(d) === 'virt');
    const readyNodes = () => nodes().filter(up);
    // why each server can't host VMs yet, and what fixes it: 'state' (bring it online) or 'svc' (set Virtualização)
    function virtWhy() {
      const n = SVC.virt.need;
      return servers().filter((d) => !(svcOf(d) === 'virt' && up(d))).map((d) => {
        const virt = svcOf(d) === 'virt', m = DL.hwOf(d);
        const off = d.state === 'new' ? 'offline: sem cabo' : d.state !== 'online' ? 'offline: falta configurar no terminal' : !up(d) ? 'fora do ar: veja em Tarefas' : null;
        let text = virt ? d.name + ' tem a função Virtualização, mas está ' + off
          : off ? d.name + ' está ' + off + ' e sem a função Virtualização'
          : d.name + ' está online, mas sem a função Virtualização';
        if (!virt && (m.cores < n.cores || m.ram < n.ram)) text += ' (' + m.cores + ' núcleos · ' + DL.hwFmt.ram(m.ram) + '; o ideal é ' + n.cores + '+ e ' + DL.hwFmt.ram(n.ram) + '+)';
        return { d, text, what: off ? 'state' : 'svc' };
      });
    }
    // the reasons as links: each opens Servidores on that server, focused on what is missing
    function whyList(compact) {
      if (!servers().length) return compact ? '<p>Nenhum servidor instalado. Instale um num rack (B), deixe-o online e defina <b>Virtualização</b>.</p>'
        : '<p class="px-note">Nenhum servidor instalado. Para criar VMs, instale um servidor num rack (Construir (B) → Equipamentos → Servidor), deixe-o online e defina a função <b>Virtualização</b>.</p>';
      return (compact ? '<p>Nenhum nó de virtualização no ar:</p>' : '<p class="px-note">Nenhum servidor pronto para VMs. Um nó precisa estar <b>online</b> e ter a função <b>Virtualização</b>. Clique num servidor para resolver:</p>') +
        '<ul class="px-why">' + virtWhy().map((x) => '<li><button type="button" class="linkbtn" data-px="goto" data-key="' + x.d.key + '" data-what="' + x.what + '">' + esc(x.text) + '</button></li>').join('') + '</ul>';
    }
    const nodeByKey = (k) => ops.get(k);
    const nodeUp = (k) => { const d = nodeByKey(k); return !!d && svcOf(d) === 'virt' && up(d); };
    function capOf(d) {
      const m = DL.hwOf(d);
      return { cores: m.threads || m.cores, ram: Math.max(1, m.ram - 4), disk: Math.round((m.diskTB || 1) * 1000) };
    }
    function allocOf(k, except) {
      const a = { cores: 0, ram: 0, disk: 0, vms: 0, run: 0 };
      for (const v of V.vms) {
        if (v.node !== k || v === except) continue;
        a.vms++;
        a.disk += v.disk;
        if (v.status !== 'stopped') { a.cores += v.cores; a.ram += v.ram; a.run++; }
      }
      return a;
    }
    function usageOf(d) {
      const c = capOf(d);
      let cpu = 0.03 * c.cores, ram = 2;
      for (const v of V.vms) if (v.node === d.key && v.status === 'running') { cpu += v.cores * v.cpu; ram += v.ram * v.mem; }
      return { cpu: clamp(cpu / c.cores, 0, 1), ram: clamp(ram / (c.ram + 4), 0, 1), disk: clamp(allocOf(d.key).disk / c.disk, 0, 1) };
    }
    const hist = () => ({ cpu: [], mem: [] });
    const push = (arr, v) => { arr.push(v); if (arr.length > 60) arr.shift(); };

    // Returns null when created, or the reason it could not be.
    function createVm(o) {
      const d = nodeByKey(o.node);
      if (!d || svcOf(d) !== 'virt') return 'Escolha um nó de virtualização';
      if (!up(d)) return d.name + ' está fora do ar';
      const name = String(o.name || '').trim().replace(/[^a-z0-9.-]/gi, '-').toLowerCase().slice(0, 24);
      if (!name) return 'Dê um nome à VM';
      if (V.vms.some((v) => v.name === name)) return 'Já existe uma VM chamada ' + name;
      const cores = Math.round(+o.cores), ram = +o.ram, disk = Math.round(+o.disk);
      if (!(cores >= 1)) return 'Mínimo de 1 vCPU';
      if (!(ram >= 1)) return 'Mínimo de 1 GB de RAM';
      if (!(disk >= 8)) return 'Disco mínimo: 8 GB';
      const c = capOf(d), a = allocOf(d.key);
      if (cores > c.cores) return 'O ' + d.name + ' tem só ' + c.cores + ' threads';
      if (o.start !== false && a.ram + ram > c.ram) return 'RAM insuficiente no ' + d.name + ': livre ' + Math.max(0, c.ram - a.ram) + ' GB';
      if (a.disk + disk > c.disk) return 'Disco insuficiente no ' + d.name + ': livre ' + Math.max(0, c.disk - a.disk) + ' GB';
      const v = {
        id: ++V.seq, name, node: d.key, svc: SVC[o.svc] ? o.svc : 'web', os: OS_LIST.indexOf(o.os) >= 0 ? o.os : OS_LIST[0],
        cores, ram, disk, status: 'stopped', t: 0, up: 0, cpu: 0, mem: 0, h: hist(), created: game.clock(),
      };
      V.vms.push(v);
      ops.logEvent('ok', 'VM ' + v.id + ' (' + v.name + ') criada no ' + d.name + ' · ' + cores + ' vCPU · ' + ram + ' GB · ' + disk + ' GB');
      if (o.start !== false) act(v, 'start');
      return null;
    }

    function act(v, what) {
      if (!v) return 'VM não encontrada';
      const d = nodeByKey(v.node);
      if (what === 'remove') {
        if (v.status !== 'stopped') return 'Desligue a VM antes de remover';
        V.vms = V.vms.filter((x) => x !== v);
        ops.logEvent('info', 'VM ' + v.id + ' (' + v.name + ') removida');
        if (V.sel === v) { V.sel = null; V.view = 'summary'; }
        return null;
      }
      if (!d || !up(d)) return 'O nó ' + (d ? d.name : '') + ' está fora do ar';
      if (what === 'start') {
        if (v.status !== 'stopped') return 'A VM já está ligada';
        const c = capOf(d), a = allocOf(d.key, v);
        if (a.ram + v.ram > c.ram) return 'RAM insuficiente no ' + d.name + ' (livre ' + Math.max(0, c.ram - a.ram) + ' GB)';
        v.status = 'starting'; v.t = 3;
      } else if (what === 'shutdown') {
        if (v.status !== 'running') return 'A VM não está rodando';
        v.status = 'stopping'; v.t = 2.5;
      } else if (what === 'reboot') {
        if (v.status !== 'running') return 'A VM não está rodando';
        v.status = 'rebooting'; v.t = 4;
      }
      ops.logEvent('info', 'VM ' + v.id + ' (' + v.name + '): ' + ({ start: 'iniciando', shutdown: 'desligando', reboot: 'reiniciando' }[what]));
      return null;
    }

    function simulate(dt) {
      const devs = new Set(ops.devices().map((d) => d.key));
      for (const v of V.vms.slice()) {
        // the node was removed from the rack: its VMs are lost
        if (!devs.has(v.node)) { V.vms = V.vms.filter((x) => x !== v); ops.logEvent('warn', 'VM ' + v.id + ' (' + v.name + ') perdida: o nó saiu do rack'); continue; }
        const alive = nodeUp(v.node);
        if (!alive) {
          if (v.status !== 'stopped') { v.wasOn = true; v.status = 'stopped'; v.cpu = v.mem = 0; v.up = 0; v.down = true; }
          continue;
        }
        if (v.down && v.wasOn) { v.down = false; v.wasOn = false; v.status = 'starting'; v.t = 3; }
        v.down = false;
        if (v.t > 0 && (v.t -= dt) <= 0) {
          if (v.status === 'starting' || v.status === 'rebooting') { v.status = 'running'; v.up = 0; }
          else if (v.status === 'stopping') { v.status = 'stopped'; v.up = 0; }
        }
        if (v.status === 'running') {
          v.up += dt;
          const L = SVC[v.svc].load, k = scene.t / 9 + v.id;
          v.cpu = clamp(L[0] * (0.75 + 0.35 * Math.sin(k)) + (rand() - 0.5) * 0.06, 0.01, 1);
          v.mem = clamp(L[1] * (0.85 + 0.1 * Math.sin(k / 3)) + (rand() - 0.5) * 0.02, 0.05, 0.98);
        } else if (v.status === 'starting' || v.status === 'rebooting') { v.cpu = 0.6 + rand() * 0.3; v.mem = 0.2; }
        else { v.cpu = 0; v.mem = 0; }
      }
    }

    // $/min from running VMs (each vCPU / 8 GB of RAM counts, times the service's value)
    DL.vmRevenue = function () {
      let s = 0;
      for (const v of V.vms) {
        if (v.status !== 'running' || !nodeUp(v.node)) continue;
        const svc = SVC[v.svc], deps = svc.deps.every((x) => provided(x)) ? 1 : 0.6;
        s += 2.2 * svc.rev * (v.cores * 0.5 + v.ram / 16) * deps;
      }
      V.revenue = s;
      return s;
    };
    DL.infraSummary = function () {
      const ns = nodes(), run = V.vms.filter((v) => v.status === 'running').length;
      if (!ns.length) return 'Ainda não temos nó de virtualização. Em Infra (I) → Servidores, defina um servidor como Virtualização.';
      const u = ns.filter(up).map(usageOf);
      const cpu = u.length ? Math.round((u.reduce((s, x) => s + x.cpu, 0) / u.length) * 100) : 0;
      return ns.length + ' nó(s) de virtualização, ' + run + '/' + V.vms.length + ' VM(s) rodando, CPU média ' + cpu + '%. ' + (V.revenue ? 'As VMs rendem ' + DL.money(V.revenue) + '/min.' : '');
    };

    /* ---------------- presets: a varied, realistic starting fleet ---------------- */
    function seed(preset) {
      const list = servers().sort((a, b) => a.key < b.key ? -1 : 1);
      const cycle = ['web', 'db', 'dns', 'web', 'mail', 'storage', 'corp', 'game', 'net', 'web'];
      // each server gets the next specialisation its hardware can actually serve
      list.forEach((d, i) => {
        for (let k = 0; k < cycle.length; k++) {
          d.svc = cycle[(i + k) % cycle.length];
          if (!needsOf(d).length) break;
        }
        if (needsOf(d).length) d.svc = 'web';
      });
      const gpu = list.find((d) => /gpu/i.test(DL.hwOf(d).name || ''));
      if (gpu) gpu.svc = 'ai';
      // one virtualization node with a few VMs
      const node = list.find((d) => DL.hwOf(d).ram >= 64 && d.state === 'online' && d.svc !== 'dns' && d.svc !== 'db');
      if (node && list.length >= 4) {
        node.svc = 'virt';
        const base = [['vm-web-01', 'web', 4, 8, 40], ['vm-dns-02', 'dns', 1, 2, 16], ['vm-ci-runner', 'corp', 4, 16, 80]];
        for (const [name, svc, cores, ram, disk] of base) createVm({ node: node.key, name, svc, cores, ram, disk, os: OS_LIST[0], start: true });
        for (const v of V.vms) { v.status = 'running'; v.t = 0; v.up = 600 + rand() * 3000; }
      }
      // the big datacenter already runs a Windows domain controller (corp.datalab.local) to explore
      if (preset === 'dcm' && DL.winPreset) {
        const dc = list.find((d) => d.svc === 'net' && d.state === 'online') || list.find((d) => d.svc === 'web' && d.state === 'online' && d !== node);
        if (dc) { dc.svc = 'win'; if (needsOf(dc).length) dc.svc = 'net'; else DL.winPreset(dc); }
      }
    }
    function reset() { V.vms = []; V.seq = 100; V.sel = null; V.view = 'summary'; V.ask = null; V.focus = null; }

    /* ================================================================== */
    /* UI                                                                  */
    /* ================================================================== */
    const isOpen = () => el.ov.classList.contains('is-open');
    function open(view, ref) {
      if (view) { V.view = view; V.focus = null; }
      if (ref !== undefined) V.sel = ref;
      el.ov.classList.add('is-open');
      game.keysReset && game.keysReset();
      V.key = '';
      render(true);
    }
    function close() {
      el.ov.classList.remove('is-open');
      if (el.ov.contains(document.activeElement)) document.activeElement.blur();
    }
    const STATUS = { running: ['Rodando', 'is-run'], stopped: ['Desligada', 'is-off'], starting: ['Iniciando…', 'is-busy'], stopping: ['Desligando…', 'is-busy'], rebooting: ['Reiniciando…', 'is-busy'] };
    const bar = (pct, label) => '<div class="px-meter"><div class="px-meter__top"><span>' + label + '</span><b>' + Math.round(pct * 100) + '%</b></div><i><em style="transform:scaleX(' + clamp(pct, 0, 1).toFixed(3) + ')" class="' + (pct > 0.9 ? 'is-hot' : pct > 0.75 ? 'is-warm' : '') + '"></em></i></div>';
    const svcTag = (t) => '<span class="px-tag" style="--c:' + SVC[t].color + '">' + SVC[t].short + '</span>';
    const dur = (s) => { s = Math.floor(s); const h = Math.floor(s / 60), m = s % 60; return h ? h + ' h ' + m + ' min' : m + ' min'; };

    function tree() {
      const ns = nodes();
      let h = '<nav class="px-tree" aria-label="Recursos"><button type="button" class="px-node' + (V.view === 'summary' ? ' is-on' : '') + '" data-px="summary"><i class="px-ico px-ico--dc"></i>Datacenter</button>';
      for (const d of ns) {
        const on = up(d);
        h += '<button type="button" class="px-node px-node--l1' + (V.view === 'node' && V.sel === d ? ' is-on' : '') + '" data-px="node" data-key="' + d.key + '"><i class="px-ico ' + (on ? 'is-run' : 'is-down') + '"></i>' + esc(d.name.toLowerCase()) + '</button>';
        for (const v of V.vms.filter((x) => x.node === d.key)) {
          h += '<button type="button" class="px-node px-node--l2' + (V.view === 'vm' && V.sel === v ? ' is-on' : '') + '" data-px="vm" data-vm="' + v.id + '"><i class="px-ico px-ico--vm ' + (STATUS[v.status] || STATUS.stopped)[1] + '"></i>' + v.id + ' (' + esc(v.name) + ')</button>';
        }
      }
      if (!ns.some(up)) h += '<div class="px-tree__empty">' + whyList(true) + '</div>';
      return h + '</nav>';
    }

    function viewSummary() {
      const ns = nodes(), srv = servers();
      let cap = { cores: 0, ram: 0, disk: 0 }, al = { cores: 0, ram: 0, disk: 0 };
      for (const d of ns) { const c = capOf(d), a = allocOf(d.key); cap.cores += c.cores; cap.ram += c.ram; cap.disk += c.disk; al.cores += a.cores; al.ram += a.ram; al.disk += a.disk; }
      const run = V.vms.filter((v) => v.status === 'running').length;
      let h = '<h3 class="px-h">Datacenter</h3><div class="px-cards">' +
        '<div class="px-card"><span class="eyebrow-sm">Nós</span><b>' + ns.filter(up).length + ' / ' + ns.length + '</b><small>online</small></div>' +
        '<div class="px-card"><span class="eyebrow-sm">VMs</span><b>' + run + ' / ' + V.vms.length + '</b><small>rodando</small></div>' +
        '<div class="px-card"><span class="eyebrow-sm">Servidores físicos</span><b>' + srv.length + '</b><small>' + srv.filter(up).length + ' no ar</small></div>' +
        '<div class="px-card"><span class="eyebrow-sm">Receita das VMs</span><b>' + DL.money(V.revenue || 0) + '</b><small>por minuto</small></div></div>';
      if (ns.length) {
        h += '<div class="px-sec"><span class="eyebrow-sm">Recursos alocados (cluster)</span>' + bar(cap.cores ? al.cores / cap.cores : 0, 'vCPU ' + al.cores + ' / ' + cap.cores) + bar(cap.ram ? al.ram / cap.ram : 0, 'RAM ' + al.ram + ' / ' + cap.ram + ' GB') + bar(cap.disk ? al.disk / cap.disk : 0, 'Disco ' + al.disk + ' / ' + cap.disk + ' GB') + '</div>';
      }
      // what the datacenter offers, and what is missing
      h += '<div class="px-sec"><span class="eyebrow-sm">Serviços oferecidos</span><ul class="px-svcs">';
      for (const t of SVC_ORDER) {
        const phys = srv.filter((d) => svcOf(d) === t), vms = V.vms.filter((v) => v.svc === t);
        const on = provided(t);
        h += '<li class="' + (on ? 'is-on' : '') + '">' + svcTag(t) + '<span>' + SVC[t].name + '</span><em>' + (phys.length ? phys.length + ' servidor(es)' : '') + (phys.length && vms.length ? ' · ' : '') + (vms.length ? vms.length + ' VM(s)' : '') + (!phys.length && !vms.length ? 'não oferecido' : '') + '</em></li>';
      }
      h += '</ul></div>';
      const warn = [];
      for (const d of srv) { const n = needsOf(d).concat(depsOf(d)); if (n.length) warn.push('<b>' + d.name + '</b> (' + SVC[svcOf(d)].name + '): ' + esc(n.join(' · '))); }
      if (warn.length) h += '<div class="px-sec"><span class="eyebrow-sm">Atenção</span><ul class="px-warn">' + warn.slice(0, 8).map((w) => '<li>' + w + '</li>').join('') + '</ul></div>';
      if (!ns.length) h += '<p class="px-note">Para usar VMs: na aba <button type="button" class="linkbtn" data-px="servers">Servidores</button>, escolha <b>Virtualização</b> num servidor online com pelo menos 12 núcleos e 64 GB de RAM.</p>';
      return h;
    }

    function viewServers() {
      const srv = servers();
      if (!srv.length) return '<h3 class="px-h">Servidores físicos</h3><p class="px-note">Nenhum servidor instalado. Construir (B) → Equipamentos → Servidor, num rack.</p>';
      let h = '<h3 class="px-h">Servidores físicos</h3><p class="px-note">Cada servidor tem uma especialização. Ela define o que ele precisa e quanto rende. Servidores de <b>Virtualização</b> viram nós para VMs; <b>Windows Server</b> roda o domínio (AD), DNS e DHCP.</p>';
      const ask = V.ask && ops.get(V.ask.key);
      if (ask) {
        const toWin = SVC[V.ask.svc].os === 'windows';
        h += '<div class="px-ask" role="alertdialog" aria-label="Reinstalar servidor"><p><b>Reinstalar o ' + esc(ask.name) + ' com ' + (toWin ? 'Windows Server 2022' : 'Linux') + '?</b> ' +
          (toWin ? 'O disco é apagado e o servidor sai do ar até você instalar o Windows pelo terminal (mídia de instalação → senha → IP fixo → nome). Depois, missões ensinam AD, DNS, DHCP e permissões.' : 'O Windows (domínio, DNS, DHCP, usuários) é apagado e o servidor precisa ser configurado de novo no terminal Linux.') +
          '</p><div class="px-acts"><button type="button" class="btn btn--sm btn--primary" data-px="osok">Reinstalar</button><button type="button" class="btn btn--sm" data-px="osno">Cancelar</button></div></div>';
      }
      h += '<table class="px-table"><thead><tr><th>Servidor</th><th>Hardware</th><th>Estado</th><th>Especialização</th><th>Necessidades</th><th>Rende</th></tr></thead><tbody>';
      for (const d of srv) {
        const m = DL.hwOf(d), n = needsOf(d).concat(depsOf(d));
        const st = d.state !== 'online' ? (d.state === 'new' ? 'Sem cabo' : 'Configurar') : up(d) ? 'Online' : 'Fora do ar';
        // a server that is not up gets the action that brings it online (cabling or the terminal)
        const fix = up(d) ? '' : '<button type="button" class="btn btn--sm px-mini px-stact" data-px="srvact" data-key="' + d.key + '" data-focus="act:' + d.key + '">' + (d.state === 'new' ? 'Ligar cabo' : 'Abrir terminal') + '</button>';
        h += '<tr' + (V.focus && V.focus.key === d.key ? ' class="is-target"' : '') + '><td><b>' + esc(d.name) + '</b><small>' + esc(d.where || '') + '</small></td><td>' + esc(m.name) + '<small>' + m.cores + ' núcleos · ' + DL.hwFmt.ram(m.ram) + ' · ' + fmt1(m.diskTB || 0) + ' TB · ' + (m.nic || 1) + ' Gb/s</small></td>' +
          '<td><span class="px-st ' + (up(d) ? 'is-run' : d.state === 'online' ? 'is-down' : 'is-off') + '">' + st + '</span>' + fix + '</td>' +
          '<td><select class="px-sel" data-svc="' + d.key + '" data-focus="svc:' + d.key + '" aria-label="Especialização do ' + esc(d.name) + '">' + SVC_ORDER.map((t) => '<option value="' + t + '"' + (svcOf(d) === t ? ' selected' : '') + '>' + SVC[t].name + '</option>').join('') + '</select><small>' + (winOs(d) && DL.winSummary ? esc(DL.winSummary(d)) : d.svc ? esc(SVC[svcOf(d)].service) : 'padrão (ainda não especializado)') + '</small></td>' +
          '<td>' + (n.length ? '<ul class="px-needs">' + n.map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>' : '<span class="px-ok">✓ Atendidas</span>') + '</td>' +
          '<td class="mono">' + (up(d) ? '×' + fmt1(DL.svcFactor(d)) : '—') + '</td></tr>';
      }
      h += '</tbody></table><div class="px-sec"><span class="eyebrow-sm">Especializações</span><dl class="px-defs">' + SVC_ORDER.map((t) => '<dt>' + svcTag(t) + SVC[t].name + '</dt><dd>' + esc(SVC[t].desc) + '</dd>').join('') + '</dl></div>';
      return h;
    }

    function spark(id) { return '<canvas class="px-spark" data-spark="' + id + '"></canvas>'; }

    function viewNode(d) {
      if (!d || ops.devices().indexOf(d) < 0) return viewSummary();
      const m = DL.hwOf(d), c = capOf(d), a = allocOf(d.key), u = usageOf(d), on = up(d);
      let h = '<h3 class="px-h">Nó ' + esc(d.name.toLowerCase()) + ' <span class="px-st ' + (on ? 'is-run' : 'is-down') + '">' + (on ? 'online' : 'fora do ar') + '</span></h3>';
      h += '<p class="px-note">' + esc(m.name) + ' · ' + esc(m.cpu) + ' · ' + c.cores + ' threads · ' + DL.hwFmt.ram(m.ram) + ' · ' + esc(m.disk) + ' · ' + esc(d.where || '') + ' · ' + esc(d.ip) + '</p>';
      h += '<div class="px-grid2"><div class="px-sec"><span class="eyebrow-sm">Uso agora</span>' + bar(on ? u.cpu : 0, 'CPU') + bar(on ? u.ram : 0, 'RAM') + bar(u.disk, 'Disco (alocado)') + '</div>' +
        '<div class="px-sec"><span class="eyebrow-sm">Alocado para VMs</span>' + bar(a.cores / c.cores, 'vCPU ' + a.cores + ' / ' + c.cores) + bar(a.ram / c.ram, 'RAM ' + a.ram + ' / ' + c.ram + ' GB') + bar(a.disk / c.disk, 'Disco ' + a.disk + ' / ' + c.disk + ' GB') + '</div></div>';
      h += '<div class="px-sec"><span class="eyebrow-sm">CPU do nó (2 min)</span>' + spark('node') + '</div>';
      h += vmTable(V.vms.filter((v) => v.node === d.key)) + '<div class="px-acts"><button type="button" class="btn btn--sm btn--primary" data-px="create" data-key="' + d.key + '">Criar VM neste nó</button></div>';
      if (!on) h += '<p class="px-warnline">O nó está fora do ar: as VMs pararam e voltam sozinhas quando ele subir.</p>';
      return h;
    }

    function vmTable(list) {
      if (!list.length) return '<p class="px-note">Nenhuma VM ainda.</p>';
      let h = '<table class="px-table"><thead><tr><th>ID</th><th>Nome</th><th>Serviço</th><th>Estado</th><th>vCPU</th><th>RAM</th><th>Disco</th><th>CPU</th><th>Ações</th></tr></thead><tbody>';
      for (const v of list) {
        const s = STATUS[v.status] || STATUS.stopped, d = nodeByKey(v.node);
        h += '<tr><td class="mono">' + v.id + '</td><td><button type="button" class="linkbtn" data-px="vm" data-vm="' + v.id + '">' + esc(v.name) + '</button><small>' + esc(d ? d.name : '?') + '</small></td><td>' + svcTag(v.svc) + '</td>' +
          '<td><span class="px-st ' + s[1] + '">' + (v.down ? 'Nó fora do ar' : s[0]) + '</span></td><td class="mono">' + v.cores + '</td><td class="mono">' + v.ram + ' GB</td><td class="mono">' + v.disk + ' GB</td><td class="mono">' + (v.status === 'running' ? Math.round(v.cpu * 100) + '%' : '—') + '</td><td>' + actions(v, true) + '</td></tr>';
      }
      return h + '</tbody></table>';
    }

    function actions(v, small) {
      const b = (what, label, dis, prim) => '<button type="button" class="btn btn--sm' + (prim ? ' btn--primary' : '') + (small ? ' px-mini' : '') + '" data-vmact="' + what + '" data-vm="' + v.id + '"' + (dis ? ' disabled' : '') + '>' + label + '</button>';
      return '<span class="px-btns">' + b('start', 'Iniciar', v.status !== 'stopped', !small) + b('shutdown', 'Desligar', v.status !== 'running') + b('reboot', 'Reiniciar', v.status !== 'running') + b('remove', 'Remover', v.status !== 'stopped') + '</span>';
    }

    function viewVm(v) {
      if (!v || V.vms.indexOf(v) < 0) return viewSummary();
      const s = STATUS[v.status] || STATUS.stopped, d = nodeByKey(v.node), svc = SVC[v.svc];
      let h = '<h3 class="px-h">VM ' + v.id + ' (' + esc(v.name) + ') <span class="px-st ' + s[1] + '">' + (v.down ? 'nó fora do ar' : s[0]) + '</span></h3>';
      h += '<div class="px-acts">' + actions(v, false) + '</div>';
      h += '<div class="px-grid2"><div class="px-sec"><span class="eyebrow-sm">Resumo</span><dl class="px-kv">' +
        '<dt>Nó</dt><dd>' + esc(d ? d.name : '?') + '</dd><dt>Serviço</dt><dd>' + svcTag(v.svc) + ' ' + esc(svc.name) + ' · ' + esc(svc.service) + '</dd><dt>Sistema</dt><dd>' + esc(v.os) + '</dd>' +
        '<dt>Recursos</dt><dd>' + v.cores + ' vCPU · ' + v.ram + ' GB RAM · ' + v.disk + ' GB disco</dd><dt>Uptime</dt><dd>' + (v.status === 'running' ? dur(v.up) : '—') + '</dd><dt>Criada</dt><dd>' + v.created + '</dd></dl></div>' +
        '<div class="px-sec"><span class="eyebrow-sm">Uso</span>' + bar(v.cpu, 'CPU') + bar(v.mem, 'Memória (' + Math.round(v.ram * v.mem * 10) / 10 + ' de ' + v.ram + ' GB)') + '</div></div>';
      h += '<div class="px-grid2"><div class="px-sec"><span class="eyebrow-sm">CPU (2 min)</span>' + spark('vmcpu') + '</div><div class="px-sec"><span class="eyebrow-sm">Memória (2 min)</span>' + spark('vmmem') + '</div></div>';
      const deps = svc.deps.filter((x) => !provided(x));
      if (deps.length) h += '<p class="px-warnline">Este serviço depende de ' + deps.map((x) => SVC[x].name).join(', ') + ', que não está no ar.</p>';
      return h;
    }

    function viewCreate() {
      const ns = nodes();
      // the form only makes sense with a node that can run a VM now
      if (!ns.some(up)) return '<h3 class="px-h">Criar VM</h3>' + whyList(false);
      const D = V.draft || (V.draft = { node: (ns.find(up) || ns[0]).key, name: 'vm-' + (V.seq + 1), svc: 'web', os: OS_LIST[0], cores: 2, ram: 4, disk: 32, start: true });
      if (!ns.some((d) => d.key === D.node)) D.node = ns[0].key;
      const d = nodeByKey(D.node), c = capOf(d), a = allocOf(d.key);
      let h = '<h3 class="px-h">Criar VM <small class="mono">ID ' + (V.seq + 1) + '</small></h3><form class="px-form" id="pxForm" autocomplete="off">';
      h += '<label><span class="eyebrow-sm">Nó</span><select name="node" class="px-sel">' + ns.map((n) => '<option value="' + n.key + '"' + (n.key === D.node ? ' selected' : '') + '>' + esc(n.name) + (up(n) ? '' : ' (fora do ar)') + '</option>').join('') + '</select></label>';
      h += '<label><span class="eyebrow-sm">Nome</span><input class="input" name="name" maxlength="24" value="' + esc(D.name) + '"></label>';
      h += '<label><span class="eyebrow-sm">Serviço hospedado</span><select name="svc" class="px-sel">' + SVC_ORDER.filter((t) => t !== 'virt' && t !== 'win').map((t) => '<option value="' + t + '"' + (t === D.svc ? ' selected' : '') + '>' + SVC[t].name + '</option>').join('') + '</select></label>';
      h += '<label><span class="eyebrow-sm">Sistema</span><select name="os" class="px-sel">' + OS_LIST.map((o) => '<option' + (o === D.os ? ' selected' : '') + '>' + o + '</option>').join('') + '</select></label>';
      h += '<label><span class="eyebrow-sm">vCPU</span><input class="input" name="cores" type="number" min="1" max="' + c.cores + '" value="' + D.cores + '"></label>';
      h += '<label><span class="eyebrow-sm">RAM</span><select name="ram" class="px-sel">' + RAM_OPTS.map((r) => '<option value="' + r + '"' + (r === +D.ram ? ' selected' : '') + '>' + r + ' GB</option>').join('') + '</select></label>';
      h += '<label><span class="eyebrow-sm">Disco (GB)</span><input class="input" name="disk" type="number" min="8" max="4000" step="8" value="' + D.disk + '"></label>';
      h += '<label class="px-check"><input type="checkbox" name="start"' + (D.start ? ' checked' : '') + '> Iniciar depois de criar</label>';
      h += '<div class="px-free">Livre no ' + esc(d.name) + ': <b>' + Math.max(0, c.cores - a.cores) + '</b> de ' + c.cores + ' vCPU · <b>' + Math.max(0, c.ram - a.ram) + '</b> de ' + c.ram + ' GB RAM · <b>' + Math.max(0, c.disk - a.disk) + '</b> de ' + c.disk + ' GB disco</div>';
      h += '<p class="px-svcdesc">' + svcTag(D.svc) + ' ' + esc(SVC[D.svc].desc) + '</p>';
      if (V.msg) h += '<p class="px-warnline" role="alert">' + esc(V.msg) + '</p>';
      h += '<div class="px-acts"><button type="submit" class="btn btn--primary">Criar VM</button><button type="button" class="btn" data-px="summary">Cancelar</button></div></form>';
      return h;
    }

    function render(force) {
      if (!isOpen()) return;
      const sel = V.sel;
      // live views re-render a few times a second; the wizard only when asked (keeps the inputs)
      if (V.view === 'create' && !force) return;
      if (el.root.contains(document.activeElement) && document.activeElement.tagName === 'SELECT' && !force) return;
      const tabs = [['summary', 'Resumo'], ['servers', 'Servidores'], ['vms', 'VMs'], ['create', 'Criar VM']];
      let body;
      if (V.view === 'servers') body = viewServers();
      else if (V.view === 'vms') body = '<h3 class="px-h">Máquinas virtuais</h3>' + vmTable(V.vms) + (nodes().length ? '<div class="px-acts"><button type="button" class="btn btn--sm btn--primary" data-px="create">Criar VM</button></div>' : '');
      else if (V.view === 'node') body = viewNode(sel);
      else if (V.view === 'vm') body = viewVm(sel);
      else if (V.view === 'create') body = viewCreate();
      else body = viewSummary();
      if (V.view === 'create') V.createViews++;
      // live re-renders keep the scroll and the focused control (a server picked from the "Criar VM" list)
      const was = V.drawn === V.view + ':' + (sel && (sel.key || sel.id)), pane = (q) => el.root.querySelector(q);
      const keep = { body: was && pane('.px__body') ? pane('.px__body').scrollTop : 0, tree: pane('.px-tree') ? pane('.px-tree').scrollTop : 0, focus: was && el.root.contains(document.activeElement) ? document.activeElement.dataset.focus : null };
      el.root.innerHTML = '<header class="app__bar px__bar"><span class="px__logo"><i aria-hidden="true"></i>DataLab <b>VE</b><small>Virtual Environment</small></span>' +
        '<nav class="px__tabs" aria-label="Seções">' + tabs.map(([id, l]) => '<button type="button" data-px="' + id + '" class="' + (V.view === id || (id === 'vms' && V.view === 'vm') ? 'is-on' : '') + '">' + l + '</button>').join('') + '</nav>' +
        '<button class="cc__x" type="button" data-px="close" aria-label="Fechar">×</button></header><div class="px__main">' + tree() + '<section class="px__body">' + body + '</section></div>';
      V.drawn = V.view + ':' + (sel && (sel.key || sel.id));
      pane('.px__body').scrollTop = keep.body;
      pane('.px-tree').scrollTop = keep.tree;
      const f = V.focus && V.focus.fresh && V.view === 'servers' ? (V.focus.what === 'svc' ? 'svc:' : 'act:') + V.focus.key : keep.focus;
      const target = f && pane('[data-focus="' + f + '"]');
      if (target) {
        target.focus({ preventScroll: true });
        if (V.focus && V.focus.fresh) { V.focus.fresh = false; target.scrollIntoView({ block: 'center' }); }
      }
      sparks();
    }

    function sparks() {
      el.root.querySelectorAll('[data-spark]').forEach((cv) => {
        const k = cv.dataset.spark;
        let data = [];
        if (k === 'node' && V.sel && V.sel.key) data = (V.sel.pxh || []);
        else if (k === 'vmcpu' && V.sel && V.sel.h) data = V.sel.h.cpu;
        else if (k === 'vmmem' && V.sel && V.sel.h) data = V.sel.h.mem;
        const dpr = Math.min(window.devicePixelRatio || 1, 2), w = cv.clientWidth || 300, h = cv.clientHeight || 60;
        cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
        const g = cv.getContext('2d');
        g.setTransform(dpr, 0, 0, dpr, 0, 0);
        g.clearRect(0, 0, w, h);
        g.strokeStyle = 'rgba(255,255,255,0.06)';
        for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, (h * i) / 4); g.lineTo(w, (h * i) / 4); g.stroke(); }
        if (data.length < 2) return;
        const X = (i) => (i / 59) * w, Y = (v) => h - 2 - v * (h - 4);
        const off = 60 - data.length;
        g.beginPath();
        data.forEach((v, i) => (i ? g.lineTo(X(i + off), Y(v)) : g.moveTo(X(i + off), Y(v))));
        g.strokeStyle = '#ff9830';
        g.lineWidth = 1.5;
        g.stroke();
        g.lineTo(X(59), h); g.lineTo(X(off), h); g.closePath();
        g.fillStyle = 'rgba(255,152,48,0.12)';
        g.fill();
      });
    }

    el.ov.addEventListener('pointerdown', (ev) => { ev.stopPropagation(); if (ev.target === el.ov) close(); });
    el.ov.addEventListener('keydown', (ev) => {
      const tag = ev.target.tagName;
      if (ev.code === 'Escape') { ev.preventDefault(); close(); return; }
      if (tag === 'INPUT' || tag === 'SELECT') ev.stopPropagation();
    });
    el.root.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-px],[data-vmact]');
      if (!b) return;
      if (b.dataset.vmact) {
        const v = V.vms.find((x) => x.id === +b.dataset.vm);
        const why = act(v, b.dataset.vmact);
        if (why) game.toast('warn', 'DataLab VE', why);
        else if (b.dataset.vmact === 'remove') game.toast('info', 'DataLab VE', 'VM ' + v.id + ' removida');
        render(true);
        return;
      }
      const p = b.dataset.px;
      if (p === 'close') { close(); return; }
      if (p === 'osok' || p === 'osno') {
        const d = V.ask && ops.get(V.ask.key);
        if (p === 'osok' && d) reinstall(d, V.ask.svc);
        V.ask = null;
        render(true);
        return;
      }
      if (p === 'srvact') {
        const d = ops.get(b.dataset.key);
        if (d) { close(); ops.openTerminal(d); }
        return;
      }
      V.msg = '';
      V.focus = null;
      if (p === 'goto') { V.view = 'servers'; V.focus = { key: b.dataset.key, what: b.dataset.what, fresh: true }; }
      else if (p === 'node') { V.view = 'node'; V.sel = ops.get(b.dataset.key); }
      else if (p === 'vm') { V.view = 'vm'; V.sel = V.vms.find((x) => x.id === +b.dataset.vm); }
      else if (p === 'create') { V.view = 'create'; V.draft = null; if (b.dataset.key) { viewCreate(); V.draft.node = b.dataset.key; } }
      else V.view = p;
      render(true);
    });
    // the wizard: keep what was typed, refresh the free-resources line when the node / service changes
    const readForm = (f) => {
      const D = V.draft;
      if (!D || !f) return;
      D.node = f.node.value; D.name = f.name.value; D.svc = f.svc.value; D.os = f.os.value;
      D.cores = f.cores.value; D.ram = f.ram.value; D.disk = f.disk.value; D.start = f.start.checked;
    };
    function applySvc(d, svc) {
      const was = svcOf(d);
      d.svc = svc;
      if (was === 'virt' && d.svc !== 'virt') for (const v of V.vms) if (v.node === d.key && v.status !== 'stopped') { v.status = 'stopped'; v.cpu = v.mem = 0; }
      game.toast('ok', d.name, 'Agora é ' + SVC[d.svc].name + ' · ' + SVC[d.svc].service);
      ops.logEvent('info', d.name + ' especializado como ' + SVC[d.svc].name);
      game.emit('svc', { d });
    }
    // Windows ↔ Linux is a reinstall: the server leaves the air until it is installed and configured again
    function reinstall(d, svc) {
      const toWin = SVC[svc].os === 'windows';
      if (toWin) DL.winInstall(d); else DL.winRemove(d);
      if (d.state !== 'new') d.state = 'link';
      ops.recompute();
      applySvc(d, svc);
      ops.logEvent('info', d.name + ' reinstalado com ' + (toWin ? 'Windows Server 2022' : 'Linux') + ' · abra o terminal (Tarefas → T) para configurar');
      game.toast('info', d.name + ' reinstalado', toWin ? 'Instale o Windows Server pelo terminal: Tarefas (T) → Abrir terminal' : 'Configure o Linux pelo terminal: Tarefas (T) → Abrir terminal');
    }
    el.root.addEventListener('change', (ev) => {
      const s = ev.target.closest('[data-svc]');
      if (s) {
        const d = ops.get(s.dataset.svc);
        if (d) {
          // changing the operating system needs a confirmation (render shows it)
          if ((SVC[s.value].os === 'windows') !== winOs(d)) V.ask = { key: d.key, svc: s.value };
          else { V.ask = null; applySvc(d, s.value); }
        }
        s.blur();
        render(true);
        return;
      }
      const f = ev.target.form;
      if (f && f.id === 'pxForm') {
        readForm(f);
        if (ev.target.name === 'node' || ev.target.name === 'svc') render(true);
      }
    });
    el.root.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const f = ev.target;
      readForm(f);
      const D = V.draft;
      const why = createVm({ node: D.node, name: D.name, svc: D.svc, os: D.os, cores: D.cores, ram: D.ram, disk: D.disk, start: D.start });
      if (why) { V.msg = why; render(true); return; }
      const v = V.vms[V.vms.length - 1];
      game.toast('ok', 'VM criada', v.id + ' (' + v.name + ') · ' + v.cores + ' vCPU · ' + v.ram + ' GB · ' + v.disk + ' GB');
      V.draft = null;
      V.view = 'vm';
      V.sel = v;
      render(true);
    });
    if (el.btn) el.btn.addEventListener('click', () => { el.btn.blur(); if (game.canHotkey && !game.canHotkey()) return; open(); });

    function update(dt) {
      simulate(dt);
      V.acc += dt;
      if (V.acc >= 1) {
        V.acc = 0;
        for (const v of V.vms) { push(v.h.cpu, v.cpu); push(v.h.mem, v.mem); }
        for (const d of nodes()) { d.pxh = d.pxh || []; push(d.pxh, up(d) ? usageOf(d).cpu : 0); }
        render(false);
      }
    }

    function key(ev) {
      if (isOpen()) { if (ev.code === 'Escape') { close(); return true; } return false; }
      if (ev.code === 'KeyI' && !ev.repeat && (!game.canHotkey || game.canHotkey())) { open(); return true; }
      return false;
    }

    return {
      update, open, close, key, seed, reset, createVm, act, needsOf, depsOf, provided, usageOf, capOf,
      get isOpen() { return isOpen(); },
      get vms() { return V.vms; },
      get view() { return V.view; },
      // how many times "Criar VM" was shown (tutorial.js)
      get createViews() { return V.createViews; },
      nodes, readyNodes,
      // saves (services/save-service.js): put back the VMs of a loaded game
      restoreVms(list) {
        V.vms = (list || []).map((v) => Object.assign({ t: 0, up: v.status === 'running' ? 600 : 0, cpu: 0, mem: 0, h: hist(), created: game.clock() }, v));
        V.seq = Math.max(100, ...V.vms.map((v) => v.id || 0));
        V.sel = null;
        V.view = 'summary';
      },
    };
  };
})();
