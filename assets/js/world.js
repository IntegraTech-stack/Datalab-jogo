/* DataLab — the DC-01 map: tiles, equipment, NPCs. */
(function () {
  'use strict';
  const DL = window.DL, T = DL.T;

  DL.LOOKS = {
    player: { skin: '#f2c8a0', hair: '#2a1c16', hairStyle: 'short', shirt: '#7c3aed', pants: '#232a36', shoes: '#eceff3', badge: '#ff7a17', lanyard: '#ffc285' },
    marina: { skin: '#c98e66', hair: '#1a1210', hairStyle: 'bun', shirt: '#2f3a4d', pants: '#1b1f27', shoes: '#2b2f38', headset: true, badge: '#a0c3ec', lanyard: '#a0c3ec' },
    rafael: { skin: '#8d5a3b', hair: '#0f0b0a', hairStyle: 'cap', cap: '#ff7a17', shirt: '#3b4250', vest: '#5a6170', pants: '#2a3140', shoes: '#16181d', badge: '#a0c3ec' },
    julia: { skin: '#f5d3b8', hair: '#b8562c', hairStyle: 'long', shirt: '#a0c3ec', pants: '#2b2f3a', shoes: '#c4b5fd', badge: '#7c3aed', lanyard: '#7c3aed' },
    theo: { skin: '#e0ac7e', hair: '#3a2a1f', hairStyle: 'curly', shirt: '#c4b5fd', pants: '#1f2430', shoes: '#ffc285', badge: '#ff7a17' },
  };

  const HOSTS = {
    A: [['web-01', 'web-02', 'web-03', 'web-04'], ['web-05', 'web-06', 'lb-01'], ['api-01', 'api-02', 'api-03'], ['api-04', 'api-05'], ['cache-01', 'cache-02', 'cache-03'], ['k8s-a-01', 'k8s-a-02', 'k8s-a-03', 'k8s-a-04']],
    B: [['db-01', 'db-02'], ['db-03', 'db-replica-01'], ['app-01', 'app-02', 'app-03'], ['app-04', 'app-05', 'queue-01'], ['k8s-b-01', 'k8s-b-02', 'k8s-b-03'], ['backup-01', 'log-01']],
  };

  const ROW_TAG = { A: '#a0c3ec', B: '#c4b5fd', C: '#ffc285' };

  DL.buildWorld = function () {
    const W = 30, H = 20;
    const tiles = new Array(W * H);
    const solid = new Uint8Array(W * H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        let c;
        if (y <= 1 || y === H - 1 || x === 0 || x === W - 1) c = '#';
        else if (x < 10) c = '_';
        else if (x === 10) c = y === 9 || y === 10 ? 'd' : 'g';
        else c = '.';
        tiles[y * W + x] = c;
        if (c === '#' || c === 'g') solid[y * W + x] = 1;
      }
    }
    // cold aisles (perforated tiles) in front of each row
    for (const y of [6, 7, 11, 12, 16]) for (let x = 12; x <= 20; x++) tiles[y * W + x] = ',';

    const items = [], byId = {};
    function add(o) {
      const e = Object.assign({ tw: 1, th: 1, seed: items.length * 7 + 3, state: 'ok', solid: true }, o);
      e.px = e.tx * T;
      e.py = e.ty * T;
      e.sortY = e.py + e.th * T;
      if (e.solid) for (let j = 0; j < e.th; j++) for (let i = 0; i < e.tw; i++) solid[(e.ty + j) * W + e.tx + i] = 1;
      if (e.tel) {
        e.temp = e.tel.temp;
        e.power = e.tel.power;
        e.hist = { temp: [], power: [] };
        for (let i = 0; i < 40; i++) {
          e.hist.temp.push(e.tel.temp + (DL.hash(e.seed * 3 + i) - 0.5) * e.tel.jitter * 3);
          e.hist.power.push(e.tel.power * (1 + (DL.hash(e.seed * 5 + i) - 0.5) * 0.04));
        }
      }
      if (e.id) {
        DL.itemGeom(e);
        e.uptime = 30 + Math.floor(DL.hash(e.seed) * 300);
        byId[e.id] = e;
      }
      items.push(e);
      return e;
    }

    const rows = { A: [], B: [] };
    ['A', 'B'].forEach((row, r) => {
      const ty = r === 0 ? 5 : 10;
      HOSTS[row].forEach((hosts, i) => {
        const short = row + '0' + (i + 1);
        const e = add({
          id: 'RACK-' + short, short, kind: 'rack', row, tx: 13 + i, ty, tag: i === 0 ? ROW_TAG[row] : null,
          name: 'Rack ' + short, category: 'Rack de servidores',
          servers: hosts.map((h, k) => ({ host: h, u: 'U' + String(40 - k * 5 - Math.floor(DL.hash(i * 11 + k) * 2)).padStart(2, '0') })),
          tel: { temp: 27 + DL.hash(i * 3 + r) * 3, power: 3.4 + DL.hash(i * 5 + r * 9) * 1.8, unit: 'kW', jitter: 0.25 },
        });
        rows[row].push(e);
      });
      add({
        id: 'SW-ACC-' + row, kind: 'switch', row, tx: 19, ty,
        name: 'Switch de acesso · Fileira ' + row, category: 'Switch top-of-rack',
        tel: { temp: 39 + r * 2, power: 176 + r * 8, unit: 'W', jitter: 0.3 },
      });
    });
    add({ id: 'RT-EDGE-01', kind: 'router', row: 'C', tx: 13, ty: 15, tag: ROW_TAG.C, name: 'Roteador de borda', category: 'Roteador', tel: { temp: 46, power: 410, unit: 'W', jitter: 0.3 } });
    add({ id: 'SW-CORE-01', kind: 'core', row: 'C', tx: 14, ty: 15, name: 'Switch core', category: 'Core de rede', tel: { temp: 44, power: 820, unit: 'W', jitter: 0.4 } });
    for (let i = 0; i < 4; i++) {
      add({ id: 'ST-0' + (i + 1), kind: 'storage', row: 'C', tx: 15 + i, ty: 15, name: 'Storage ST-0' + (i + 1), category: 'Storage', tel: { temp: 29 + DL.hash(i) * 2, power: 2.2 + DL.hash(i + 4) * 0.6, unit: 'kW', jitter: 0.2 } });
    }
    [4, 9, 14].forEach((ty, i) => {
      add({ id: 'CRAC-0' + (i + 1), kind: 'crac', tx: 28, ty, name: 'Ar-condicionado de precisão', category: 'Refrigeração', tel: { temp: 18 + i * 0.4, power: 6.1 + i * 0.3, unit: 'kW', jitter: 0.15 } });
    });
    add({ id: 'UPS-01', kind: 'ups', tx: 24, ty: 17, tw: 2, name: 'Nobreak modular', category: 'Energia', tel: { temp: 25, power: 38.5, unit: 'kW', jitter: 0.3 } });

    [[2, 6, 'PC-NOC-01'], [6, 6, 'PC-NOC-02'], [2, 11, 'PC-NOC-03'], [6, 11, 'PC-NOC-04']].forEach(([tx, ty, id], i) => {
      add({ id, kind: 'desk', tx, ty, tw: 2, name: 'Estação de monitoramento', category: 'Computador · NOC', tel: { temp: 48 + i * 2, power: 140 + i * 6, unit: 'W', jitter: 0.8 } });
      const ch = add({ kind: 'chair', tx, ty: ty + 1, solid: false, cx: tx * T + 16, cy: (ty + 1) * T + 11 });
      ch.sortY = ch.cy;
    });
    add({ id: 'NOC-WALL', kind: 'videowall', tx: 2, ty: 1, tw: 7, solid: false, name: 'Painel do NOC', category: 'Monitoramento' });

    for (const [tx, ty] of [[1, 2], [9, 17], [11, 2], [1, 17]]) add({ kind: 'plant', tx, ty });
    for (let y = 2; y < H - 1; y++) {
      if (y === 9 || y === 10) continue;
      add({ kind: 'glass', tx: 10, ty: y, solid: false, capTop: y === 2 || y === 11, capBottom: y === 8 || y === 18 });
    }

    const at = (x, y) => ({ x: x * T + 8, y: y * T + 12 });
    const npcs = [
      {
        id: 'marina', name: 'Marina', role: 'Analista de NOC', look: 'marina',
        path: [at(4, 8), at(8, 8), at(8, 14), at(4, 14)], waits: [2.2, 0.4, 1.6, 0.6],
        lines: {
          calm: ['Bom turno! Daqui do NOC a gente enxerga o salão inteiro.', 'Se algo piscar laranja no painel, é com você.'],
          incident: ['O painel acusou o switch da fileira B. Corre lá!', 'A fileira B sumiu da rede, mas os servidores seguem ligados. Estranho, né?'],
          done: ['Fileira B verde de novo. Bela resolução!', 'Vou registrar o incidente. Tempo ótimo.'],
        },
      },
      {
        id: 'rafael', name: 'Rafael', role: 'Técnico de campo', look: 'rafael',
        path: [at(12, 7), at(21, 7), at(21, 12), at(12, 12)], waits: [1.2, 2, 0.5, 1.4],
        lines: {
          calm: ['Corredor frio na frente, quente atrás. É assim que os racks respiram.', 'Cada rack tem um switch no topo da fileira. Tudo passa por ele.'],
          incident: ['Se o uplink cai, o rack inteiro fica isolado.', 'Antes de reiniciar qualquer coisa, olha a camada física. Cabo é o suspeito nº 1.'],
          done: ['Cabo bem encaixado é metade do trabalho de redes.', 'Boa! Vou passar um lacre nesse transceiver.'],
        },
      },
      {
        id: 'julia', name: 'Júlia', role: 'Engenheira de redes', look: 'julia',
        path: [at(24, 15), at(27, 15), at(27, 11), at(24, 11)], waits: [1.5, 0.6, 1.8, 0.4],
        lines: {
          calm: ['O roteador de borda fala com a internet. O core distribui para os switches de acesso.', 'Nobreak segura a carga por minutos, até o gerador assumir.'],
          incident: ['Olha os logs do switch: LINK-3-UPDOWN é problema de link, não de software.', 'O core ainda vê a porta para o SW-ACC-B caída. Algo no meio do caminho.'],
          done: ['Uplink de volta a 10 Gb/s. Perfeito.', 'Próximo passo seria redundância: dois uplinks por switch.'],
        },
      },
    ];

    return {
      W, H, tiles, solid, items, byId, npcs, rows,
      spawn: { x: 5 * T + 8, y: 15 * T + 10 },
      interactables: items.filter((e) => e.id),
      labels: [
        { text: 'NOC', x: 5 * T + 8, y: 16.6 * T },
        { text: 'Fileira A', x: 16 * T, y: 5 * T - 34 },
        { text: 'Fileira B', x: 16 * T, y: 10 * T - 34 },
        { text: 'Núcleo de rede', x: 16 * T, y: 15 * T - 34 },
      ],
    };
  };
})();
