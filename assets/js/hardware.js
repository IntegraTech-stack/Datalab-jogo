/* DataLab — hardware models: what each server, switch, NAS / storage and PoE device actually is
   (CPU, cores, RAM, disks, ports, uplink, PoE budget), what it costs, what it draws from the wall and
   how much work it does. Rack units keep their kind ('server' | 'switch' | 'patch') in rack.units and
   their model in rack.unitModel, so every system that only knows the kind keeps working; the economy,
   operations and the inspector read the model through DL.hwModel / DL.hwOf.
   perf  = work done relative to the classic server (revenue scales with it)
   nic   = server network card (Gb/s) · port / uplink = switch speeds (Gb/s)
   fault = relative chance of being the one that breaks (1 = classic) */
(function () {
  'use strict';
  const DL = window.DL, T = DL.T, R = DL.R, shade = DL.shade;

  const HW = {
    server: {
      srv_basic: {
        name: 'Servidor básico', tier: 'Básico', u: '1U', cpu: 'Xeon E-2314', sockets: 1, cores: 4, threads: 4, ghz: 2.8,
        ram: 16, disk: '2× 1 TB HDD (RAID 1)', diskTB: 1, nic: 1, perf: 0.55, power: 0.16, price: 2500, fault: 1.35, accent: '#8a919c',
        desc: 'Entrada: sites pequenos, arquivos e serviços leves.',
      },
      server: {
        name: 'Servidor intermediário', tier: 'Intermediário', u: '1U', cpu: 'Xeon Silver 4310', sockets: 1, cores: 12, threads: 24, ghz: 2.1,
        ram: 64, disk: '2× 960 GB SSD', diskTB: 0.96, nic: 1, perf: 1, power: 0.32, price: 6000, fault: 1, accent: null,
        desc: 'O servidor padrão do datacenter: web, APIs e bancos médios.',
      },
      srv_adv: {
        name: 'Servidor avançado', tier: 'Avançado', u: '2U', cpu: '2× Xeon Gold 6338', sockets: 2, cores: 64, threads: 128, ghz: 2.0,
        ram: 256, disk: '4× 3,84 TB NVMe', diskTB: 15.4, nic: 10, perf: 2.1, power: 0.62, price: 15000, fault: 0.8, accent: '#6aa7e8',
        desc: 'Virtualização e bancos grandes. Pede porta de 10 Gb/s para render tudo.',
      },
      srv_hi: {
        name: 'Servidor high-end', tier: 'High-end', u: '2U', cpu: '2× EPYC 9654', sockets: 2, cores: 192, threads: 384, ghz: 2.4,
        ram: 1536, disk: '8× 7,68 TB NVMe', diskTB: 61, nic: 25, perf: 4.4, power: 1.15, price: 36000, fault: 0.6, accent: '#ff7a17',
        desc: 'Nuvem privada e análise em tempo real. Só rende com switch de 25 Gb/s.',
      },
      srv_gpu: {
        name: 'Servidor GPU (IA)', tier: 'High-end GPU', u: '4U', cpu: '2× EPYC 9354 + 4× GPU', sockets: 2, cores: 64, threads: 128, ghz: 3.25,
        ram: 1024, disk: '4× 3,84 TB NVMe', diskTB: 15.4, nic: 25, perf: 7.5, power: 2.9, price: 78000, fault: 0.75, accent: '#7ee0a1',
        desc: 'Treino e inferência de IA. Muito caro e quente: precisa de refrigeração.',
      },
    },
    switch: {
      sw_8: {
        name: 'Switch 8 portas', tier: 'Não gerenciável', ports: 8, port: 1, uplink: 1, managed: false, poe: 0, power: 0.012, price: 180, fault: 0.6, accent: '#8a919c',
        desc: '8 portas de 1 Gb/s, sem console. Sem err-disabled, sem configuração.',
      },
      sw_16: {
        name: 'Switch 16 portas', tier: 'Não gerenciável', ports: 16, port: 1, uplink: 1, managed: false, poe: 0, power: 0.02, price: 340, fault: 0.6, accent: '#8a919c',
        desc: '16 portas de 1 Gb/s, sem console e com uplink de só 1 Gb/s.',
      },
      switch: {
        name: 'Switch gerenciável 24p', tier: 'Gerenciável', ports: 24, port: 1, uplink: 10, managed: true, poe: 0, power: 0.045, price: 1500, fault: 1, accent: null,
        desc: '24 portas de 1 Gb/s com console (CLI) e uplink de 10 Gb/s.',
      },
      sw_24poe: {
        name: 'Switch PoE 24p', tier: 'Gerenciável · PoE', ports: 24, port: 1, uplink: 10, managed: true, poe: 370, power: 0.06, price: 2700, fault: 1, accent: '#ffd23f',
        desc: '24 portas de 1 Gb/s que também alimentam access points e câmeras (370 W PoE).',
      },
      sw_48: {
        name: 'Switch gerenciável 48p', tier: 'Gerenciável', ports: 48, port: 1, uplink: 20, managed: true, poe: 0, power: 0.07, price: 3300, fault: 1, accent: '#c4b5fd',
        desc: '48 portas de 1 Gb/s e uplink de 2× 10 Gb/s.',
      },
      sw_48poe: {
        name: 'Switch PoE+ 48p', tier: 'Gerenciável · PoE+', ports: 48, port: 1, uplink: 40, managed: true, poe: 740, power: 0.11, price: 5600, fault: 1, accent: '#ffd23f',
        desc: '48 portas PoE+ (740 W) e uplink de 40 Gb/s.',
      },
      sw_10g: {
        name: 'Switch 10G 24p', tier: 'Agregação 10G', ports: 24, port: 10, uplink: 100, managed: true, poe: 0, power: 0.16, price: 9800, fault: 0.8, accent: '#6aa7e8',
        desc: '24 portas de 10 Gb/s e uplink de 100 Gb/s: para servidores avançados.',
      },
      sw_25g: {
        name: 'Switch 25G 48p', tier: 'Datacenter 25G', ports: 48, port: 25, uplink: 400, managed: true, poe: 0, power: 0.35, price: 21000, fault: 0.7, accent: '#ff7a17',
        desc: '48 portas de 25 Gb/s e 4× 100 Gb/s de uplink: high-end e GPU sem gargalo.',
      },
    },
    patch: {
      patch: { name: 'Patch panel', tier: 'Passivo', ports: 12, power: 0, price: 300, fault: 0, accent: null, desc: 'Painel de passagem: organiza os cabos entre servidores e switch.' },
    },
    storage: {
      nas_2: {
        name: 'NAS 2 baias', tier: 'NAS doméstico', bays: 2, raw: 16, usable: 8, raid: 'RAID 1', net: 1, iops: 0.3, power: 0.03, price: 1100,
        desc: '2× 8 TB espelhados. Backup da equipe, lento.', look: 'nas2',
      },
      nas_4: {
        name: 'NAS 4 baias', tier: 'NAS escritório', bays: 4, raw: 48, usable: 36, raid: 'RAID 5', net: 2, iops: 0.5, power: 0.06, price: 3200,
        desc: '4× 12 TB em RAID 5 e 2× 1 Gb/s.', look: 'nas4',
      },
      nas_8: {
        name: 'NAS 8 baias 10G', tier: 'NAS empresarial', bays: 8, raw: 128, usable: 96, raid: 'RAID 6', net: 10, iops: 0.8, power: 0.15, price: 9500,
        desc: '8× 16 TB em RAID 6 com 10 Gb/s.', look: 'nas8',
      },
      storage: {
        name: 'Storage SAN', tier: 'Storage em bloco', bays: 24, raw: 192, usable: 96, raid: 'RAID 10', net: 50, iops: 1, power: 2.3, price: 26000,
        desc: '24 discos, iSCSI 2× 25 Gb/s. O storage clássico do datacenter.', look: 'san',
      },
      st_flash: {
        name: 'Storage all-flash', tier: 'All-flash NVMe', bays: 24, raw: 368, usable: 276, raid: 'RAID 6', net: 400, iops: 3, power: 1.6, price: 72000,
        desc: '24× 15,36 TB NVMe, 4× 100 Gb/s. Muito rápido e mais frio que disco.', look: 'flash',
      },
    },
    // Precision cooling (kind 'crac'): ONE item in the catalog, improved in place (clima.js: the unit's panel →
    // "Melhorar"), each step unlocked by the player's career level. frio = °C taken off a rack right next to it ·
    // raio = tiles it reaches with strength · max = the most the room's cooling can take off with this model
    // around · sala = what it still does beyond its reach · supply = the air it blows (°C) · level = career level
    // · up = price of the upgrade to this model (the first one is the catalog price). The first model keeps the
    // numbers the heat system always had (incendio.js: FRIO_AR 6, FRIO_RAIO 12, FRIO_MAX 9).
    crac: {
      crac: { tier: 1, name: 'Ar de precisão', short: 'CRAC', tech: 'Expansão direta · insuflamento pelo piso', frio: 6, raio: 12, max: 9, sala: 1, supply: 18, power: 6.2, level: 2, up: 0, accent: '#a0c3ec',
        desc: 'O ar de precisão clássico: mantém o corredor frio de uma sala pequena.' },
      crac_inrow: { tier: 2, name: 'Ar in-row', short: 'IN-ROW', tech: 'Entre os racks · ventiladores EC', frio: 8, raio: 13, max: 11, sala: 1.5, supply: 16, power: 7.5, level: 4, up: 8000, accent: '#5eead4',
        desc: 'Fica na fileira, colado nos racks: tira mais calor de quem está perto.' },
      crac_chiller: { tier: 3, name: 'Chiller de água gelada', short: 'CHILLER', tech: 'Água gelada · fan wall', frio: 10, raio: 16, max: 13, sala: 2, supply: 14, power: 9, level: 6, up: 18000, accent: '#6aa7e8',
        desc: 'Água gelada e uma parede de ventiladores: dá conta de uma sala cheia.' },
      crac_liquid: { tier: 4, name: 'Refrigeração líquida', short: 'LÍQUIDA', tech: 'CDU · porta traseira refrigerada', frio: 13, raio: 20, max: 16, sala: 3, supply: 11, power: 10.5, level: 8, up: 35000, accent: '#c4b5fd',
        desc: 'Líquido direto nos racks: para servidores high-end e de GPU.' },
      crac_cryo: { tier: 5, name: 'Crio-refrigeração', short: 'CRIO', tech: 'Imersão em duas fases · névoa fria', frio: 16, raio: 26, max: 20, sala: 4, supply: 7, power: 12, level: 10, up: 60000, accent: '#e6f6ff',
        desc: 'O topo: a sala inteira gelada, do tamanho que for.' },
    },
    poe: {
      ap: { name: 'Access point Wi-Fi 6', poeW: 15, price: 450, desc: 'Wi-Fi para clientes e visitantes. Alimentado por um switch PoE.' },
      camera: { name: 'Câmera IP', poeW: 8, price: 380, desc: 'Monitora a sala. Alimentada por um switch PoE.' },
    },
  };
  DL.HW = HW;

  // the model of a rack unit / storage, the classic one when nothing was chosen
  DL.hwModel = function (kind, id) {
    const set = HW[kind];
    if (!set) return null;
    const k = id && set[id] ? id : set[kind] ? kind : Object.keys(set)[0];
    return Object.assign({ id: k }, set[k]);
  };
  DL.hwOf = (d) => d.model || DL.hwModel(d.kind, null);
  // the cooling model of a placed unit, and the one after it (null at the top)
  DL.cracModel = (e) => DL.hwModel('crac', e && e.model);
  DL.cracNext = (e) => { const t = DL.cracModel(e).tier, id = Object.keys(HW.crac).find((k) => HW.crac[k].tier === t + 1); return id ? DL.hwModel('crac', id) : null; };
  // the air it blows right now: warmer with dirty filters (no maintenance yet: staff.js sets e.tuned)
  DL.cracSupply = (e) => DL.cracModel(e).supply + (e && e.tuned ? 0 : 1.5);

  const fmtN = (n) => String(n).replace('.', ',');
  const ram = (g) => (g >= 1024 ? fmtN(Math.round((g / 1024) * 10) / 10) + ' TB' : g + ' GB');
  const gb = (n) => (n >= 1000 ? fmtN(n / 1000) + ' Tb/s' : n + ' Gb/s');
  const kw = (n) => (n < 1 ? Math.round(n * 1000) + ' W' : fmtN(Math.round(n * 100) / 100) + ' kW');
  DL.hwFmt = { ram, gb, kw };

  // spec lines for the inspector / panels
  DL.hwSpecs = function (kind, m) {
    if (!m) return [];
    if (kind === 'server') return [['CPU', m.cpu], ['Núcleos', m.cores + ' / ' + m.threads + ' threads · ' + fmtN(m.ghz) + ' GHz'], ['RAM', ram(m.ram)], ['Disco', m.disk], ['Rede', gb(m.nic)], ['Consumo', kw(m.power)], ['Desempenho', fmtN(m.perf) + '×']];
    if (kind === 'switch') return [['Portas', m.ports + '× ' + gb(m.port)], ['Uplink', gb(m.uplink)], ['Gestão', m.managed ? 'Gerenciável (CLI)' : 'Não gerenciável'], ['PoE', m.poe ? m.poe + ' W' : '—'], ['Consumo', kw(m.power)]];
    if (kind === 'storage') return [['Baias', m.bays], ['Capacidade', m.raw + ' TB brutos · ' + m.usable + ' TB úteis'], ['Proteção', m.raid], ['Rede', gb(m.net)], ['Consumo', kw(m.power)]];
    if (kind === 'crac') return [['Tecnologia', m.tech], ['Ar insuflado', m.supply + ' °C'], ['Refrigeração', 'até −' + m.frio + ' °C num rack ao lado'], ['Alcance', m.raio + ' blocos'], ['Consumo', kw(m.power)]];
    if (kind === 'patch') return [['Portas', m.ports + ' passagens']];
    if (kind === 'ap' || kind === 'camera') return [['PoE', m.poeW + ' W']];
    return [];
  };

  /* ------------------------------------------------------------------ */
  /* Catalog entries                                                     */
  /* ------------------------------------------------------------------ */
  const C = [];
  for (const [id, m] of Object.entries(HW.server)) {
    if (id === 'server') continue; // the classic 'server' entry lives in build.js
    C.push({ id, unit: 'server', cat: 'equip', group: 'Servidores', name: m.name, mount: 'rack', thumb: 'unit-server', price: m.price, desc: m.desc + ' Clique em um rack com espaço livre.' });
  }
  for (const [id, m] of Object.entries(HW.switch)) {
    if (id === 'switch') continue;
    C.push({ id, unit: 'switch', cat: 'equip', group: 'Rede', name: m.name, mount: 'rack', thumb: 'unit-switch', price: m.price, desc: m.desc + ' Clique em um rack com espaço livre.' });
  }
  for (const [id, m] of Object.entries(HW.storage)) {
    if (id === 'storage') continue;
    C.push({ id, kind: 'storage', cat: 'equip', group: 'Storage', name: m.name, price: m.price, set: { model: id }, desc: m.desc });
  }
  C.push({ id: 'ap', cat: 'equip', group: 'Rede', name: 'Access point Wi-Fi', mount: 'wall', price: HW.poe.ap.price, desc: HW.poe.ap.desc + ' Rende com visitantes conectados.' });
  C.push({ id: 'camera', cat: 'equip', group: 'Rede', name: 'Câmera IP', mount: 'wall', price: HW.poe.camera.price, desc: HW.poe.camera.desc });
  DL.HW_CATALOG = C;
  DL.HW_NAMES = { ap: 'Access point Wi-Fi', camera: 'Câmera IP' };

  /* ------------------------------------------------------------------ */
  /* Sprites                                                             */
  /* ------------------------------------------------------------------ */
  const hsl = (h, a) => 'hsla(' + (((h % 360) + 360) % 360).toFixed(0) + ',90%,60%,' + a + ')';
  const flick = (t, k, hz) => Math.sin(t * hz + k * 1.7) > -0.2;

  // a thin colour mark on the front of a rack unit tells the models apart
  DL.unitAccent = function (g, e, k, x, uy, t) {
    const id = e.unitModel && e.unitModel[k], u = e.units[k];
    if (!id || !u) return;
    const m = DL.hwModel(u, id);
    if (!m || !m.accent) return;
    R(g, x, uy, 1, 2, m.accent);
    if (u === 'switch' && m.poe) R(g, x + 9, uy + 1, 1, 1, '#ffd23f');
    if (u === 'switch' && m.ports >= 48) R(g, x + 1, uy + 1, 8, 1, flick(t, e.seed + k, 9) ? '#2f6a4a' : '#1d3b2c');
    if (u === 'server' && (id === 'srv_hi' || id === 'srv_gpu')) R(g, x + 1, uy + 1, 1, 1, flick(t, e.seed * 3 + k, 6) ? m.accent : shade(m.accent, -0.5));
  };
  DL.unitThumbAccent = function (g, e, t) {
    const m = e.model && DL.hwModel(e.kind === 'unit-switch' ? 'switch' : 'server', e.model);
    if (!m || !m.accent) return;
    R(g, e.px, e.py + 4, 1, 6, m.accent);
    R(g, e.px + 15, e.py + 4, 1, 6, m.accent);
    if (m.poe) R(g, e.px + 1, e.py + 9, 14, 1, '#ffd23f');
  };

  // NAS boxes stand on the floor (a short cabinet); SAN / flash arrays look like a rack.
  function drawNas(g, e, t) {
    const m = DL.hwModel('storage', e.model), px = e.px, py = e.py, rot = e.rot | 0;
    const side = rot >= 2, back = rot === 1, front = rot === 2 ? 1 : -1;
    if (m.look === 'nas2' || m.look === 'nas4') {
      const big = m.look === 'nas4', h = big ? 14 : 11, w = side ? 8 : big ? 12 : 9, x = px + 8 - Math.floor(w / 2), y = py + 12 - h;
      // a small stand so it doesn't sit straight on the floor tiles
      R(g, px + 2, py + 12, 12, 2, 'rgba(0,0,0,0.3)');
      R(g, px + 2, py + 4, 12, 8, '#2a2f38');
      R(g, px + 2, py + 4, 12, 1, '#3a414c');
      R(g, px + 3, py + 12, 1, 2, '#1a1d22'); R(g, px + 12, py + 12, 1, 2, '#1a1d22');
      const top = y - 8;
      R(g, x, top, w, h, '#16191f');
      R(g, x, top, w, 1, '#2c313a');
      if (side) {
        for (let i = 0; i < 4; i++) R(g, x + 2, top + 2 + i * 2, w - 4, 1, '#20242c');
        R(g, rot === 2 ? x + w - 1 : x, top, 1, h, '#2c313a');
        R(g, rot === 2 ? x + w - 1 : x, top + h - 3, 1, 1, flick(t, e.seed, 5) ? DL.C.ok : DL.C.okDim);
      } else if (back) {
        R(g, x + 2, top + 2, w - 4, w - 4, '#0c0e12');
        R(g, x + Math.floor(w / 2) - 1, top + 3, 2, 2, '#2c313a');
        R(g, x + 2, top + h - 3, 2, 1, '#2a5d8a');
      } else {
        for (let b = 0; b < m.bays; b++) {
          const bx = x + 1 + b * Math.floor((w - 2) / m.bays);
          R(g, bx, top + 2, Math.floor((w - 2) / m.bays) - 1, h - 5, '#22262e');
          R(g, bx, top + h - 4, 1, 1, flick(t, e.seed * 7 + b, 4 + b) ? DL.C.breeze : DL.C.breezeDim);
        }
        R(g, x + 1, top + h - 2, 1, 1, DL.C.ok);
      }
      return;
    }
    // full-height array (rack sized): the classic storage body with disk sleds
    R(g, px + 1, py + 14, 15, 2, 'rgba(0,0,0,0.35)');
    const flash = m.look === 'flash', body = flash ? '#1c1f2b' : '#181c22';
    R(g, px, py - 24, 16, 6, flash ? '#2b2f45' : '#272c35');
    R(g, px, py - 24, 16, 1, flash ? '#3c4160' : '#343b46');
    R(g, px, py - 18, 16, 32, body);
    if (side) {
      R(g, px + 2, py - 16, 12, 28, shade(body, 0.08));
      for (let i = 0; i < 8; i++) R(g, px + 4, py - 14 + i * 3, 8, 1, shade(body, -0.25));
      const fx = rot === 2 ? px + 15 : px;
      R(g, fx, py - 18, 1, 32, '#2c3340');
      for (let i = 0; i < 6; i++) R(g, fx, py - 15 + i * 4, 1, 1, flick(t, e.seed + i, 5) ? DL.C.breeze : DL.C.breezeDim);
      return;
    }
    if (back) {
      R(g, px + 2, py - 16, 12, 28, '#0c0f13');
      for (let i = 0; i < 2; i++) { R(g, px + 3, py - 14 + i * 13, 10, 10, '#14181e'); R(g, px + 5, py - 12 + i * 13, 6, 6, '#0a0c10'); }
      R(g, px + 3, py + 10, 10, 1, '#2a5d8a');
      return;
    }
    R(g, px + 2, py - 16, 12, 28, '#0c0f13');
    for (let k = 0; k < 9; k++) {
      const uy = py - 15 + k * 3;
      R(g, px + 3, uy, 10, 2, flash ? '#262b3e' : '#1a2029');
      for (let j = 0; j < 5; j++) {
        R(g, px + 3 + j * 2, uy, 1, 2, flash ? '#353b55' : '#262d38');
        if (flick(t, e.seed * 31 + k * 5 + j, flash ? 9 + j : 4 + j)) R(g, px + 4 + j * 2, uy, 1, 1, flash ? '#c4b5fd' : DL.C.breeze);
      }
    }
    if (flash) R(g, px + 2, py - 17, 12, 1, hsl(250 + Math.sin(t) * 20, 0.8));
  }

  // wall devices: Wi-Fi access point and a dome camera; the dot says whether PoE reaches them
  function drawAp(g, e, t) {
    const x = e.px + 3, y = e.py - 20, on = e.powered !== false, flip = (e.rot | 0) === 1 || (e.rot | 0) === 3;
    R(g, x + 1, y + 6, 8, 1, 'rgba(0,0,0,0.25)');
    R(g, x, y, 10, 6, '#e9e9e6');
    R(g, x, y, 10, 1, '#ffffff');
    R(g, x, y + 5, 10, 1, '#c9ced6');
    R(g, flip ? x + 2 : x + 7, y + 2, 1, 1, on ? (flick(t, e.seed, 3) ? '#7ee0a1' : '#3c8059') : '#ff7a17');
    R(g, x + 4, y + 6, 2, 3, '#9aa3b0');
    if (on) {
      const ph = (t * 0.8 + e.seed * 0.1) % 1, a = (0.35 * (1 - ph)).toFixed(3);
      g.fillStyle = 'rgba(160,195,236,' + a + ')';
      const r = 4 + Math.round(ph * 5);
      g.fillRect(x + 5 - r, y - 2 - Math.round(ph * 2), 1, 1);
      g.fillRect(x + 4 + r, y - 2 - Math.round(ph * 2), 1, 1);
      g.fillRect(x + 2, y - 3 - Math.round(ph * 3), 6, 1);
    }
  }

  function drawCamera(g, e, t) {
    const x = e.px + 4, y = e.py - 21, on = e.powered !== false, rot = e.rot | 0;
    const look = rot === 2 ? 1 : rot === 3 ? -1 : 0;
    R(g, x + 2, y, 4, 3, '#c9ced6');
    R(g, x, y + 3, 8, 4, '#e9e9e6');
    R(g, x, y + 3, 8, 1, '#ffffff');
    R(g, x + 1, y + 7, 6, 2, '#1a1d23');
    if (rot !== 1) R(g, x + 3 + look, y + 7, 2, 2, '#2a3a55');
    R(g, x + 6, y + 4, 1, 1, on ? (Math.sin(t * 2 + e.seed) > 0 ? '#ff3b5c' : '#5a1a24') : '#3a2414');
  }

  const base = DL.drawItem, baseGeom = DL.itemGeom;
  DL.drawItem = function (g, e, t) {
    if (e.kind === 'storage' && e.model && e.model !== 'storage') return drawNas(g, e, t || 0);
    if (e.kind === 'ap') return drawAp(g, e, t || 0);
    if (e.kind === 'camera') return drawCamera(g, e, t || 0);
    base(g, e, t);
    if ((e.kind === 'unit-server' || e.kind === 'unit-switch') && e.model) DL.unitThumbAccent(g, e, t);
  };
  DL.itemGeom = function (e) {
    baseGeom(e);
    if (e.kind === 'storage' && e.model && e.model !== 'storage') {
      const m = DL.hwModel('storage', e.model);
      if (m.look === 'nas2' || m.look === 'nas4') e.bounds = { x: e.px + 1, y: e.py - 12, w: 14, h: 27 };
    } else if (e.kind === 'ap') e.bounds = { x: e.px + 2, y: e.py - 24, w: 12, h: 14 };
    else if (e.kind === 'camera') e.bounds = { x: e.px + 3, y: e.py - 22, w: 10, h: 12 };
  };
})();
