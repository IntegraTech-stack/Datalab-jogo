/* DataLab — ready-made starting layouts. Rooms come from DL.newWorld; furniture and rack units are
   placed through the builder (same validation as the player), so every preset stays fully editable. */
(function () {
  'use strict';
  const DL = window.DL;

  // rack fill helpers: S = server, W = switch
  // P = patch panel, W = switch, S = server
  const fill = (spec) => spec.split('');
  const row = (y, x0, x1, specs) => {
    const out = [];
    for (let x = x0, i = 0; x <= x1; x++, i++) out.push(['rack', x, y, 0, fill(specs[i % specs.length])]);
    return out;
  };

  const P = {
    zero: {
      name: 'Do zero',
      desc: 'Uma entrada e um terreno vazio. Tudo é construído por você.',
      tag: 'Construção livre',
    },
    office: {
      name: 'Escritório pequeno',
      desc: 'Recepção, oito estações e um rack com servidor de arquivos.',
      tag: '2 salas · 1 rack',
      def: {
        lot: { w: 20, h: 11 },
        rooms: [
          { name: 'Recepção', x: 1, y: 2, w: 6, h: 7, floor: 'carpet' },
          { name: 'Escritório', x: 8, y: 2, w: 11, h: 7, floor: 'carpet', theme: 'corporate' },
        ],
        spawn: [4, 5],
      },
      items: [
        ['plant', 1, 2], ['water', 6, 2], ['table', 3, 2], ['coffee', 3, 2], ['vase', 4, 2],
        ['sofa', 2, 7], ['lamp', 1, 8], ['bin', 6, 8],
        ['desk1', 9, 3, 0], ['desk', 12, 3, 0], ['deskadmin', 15, 3, 0],
        ['desk', 9, 7, 1], ['desk1', 12, 7, 1], ['desk3', 15, 7, 1],
        ['rack', 18, 3, 0, fill('WSS')], ['shelf', 18, 4],
        ['whiteboard', 17, 8], ['plant', 8, 2], ['plant', 8, 8],
      ],
      crew: ['atendente', 'gerente', 'sysadmin', 'tecnico'],
    },
    noc: {
      name: 'NOC',
      desc: 'Centro de operações com oito estações e uma sala técnica.',
      tag: '3 salas · 4 racks',
      def: {
        lot: { w: 24, h: 14 },
        rooms: [
          { name: 'Entrada', x: 1, y: 2, w: 6, h: 5, floor: 'carpet' },
          { name: 'NOC', x: 8, y: 2, w: 15, h: 11, floor: 'carpet', theme: 'noc' },
          { name: 'Sala técnica', x: 1, y: 8, w: 6, h: 5, floor: 'tile' },
        ],
      },
      items: [
        ['plant', 1, 2], ['water', 6, 2],
        ['desknoc', 10, 4, 0], ['desknoc', 13, 4, 0], ['desknoc', 16, 4, 0], ['desknoc', 19, 4, 0],
        ['desk3', 10, 8, 0], ['desk4', 13, 8, 0], ['desk3', 16, 8, 0], ['deskadmin', 19, 8, 0],
        ['whiteboard', 14, 2], ['water', 22, 2], ['plant', 8, 2], ['plant', 22, 12], ['plant', 8, 12],
        ['table', 20, 11], ['coffee', 20, 11], ['lamp', 18, 12],
        ['rack', 1, 11, 0, fill('WSSS')], ['rack', 2, 11, 0, fill('SSS')], ['rack', 3, 11, 0, fill('SSS')], ['rack', 4, 11, 0, fill('SS')],
        ['storage', 6, 11], ['crac', 6, 12],
      ],
      crew: ['redes', 'sysadmin', 'seguranca', 'funcionario'],
    },
    dcs: {
      name: 'Datacenter pequeno',
      desc: 'Sala de servidores com duas fileiras de racks, storage e refrigeração.',
      tag: '2 salas · 12 racks',
      def: {
        lot: { w: 24, h: 13 },
        rooms: [
          { name: 'Entrada', x: 1, y: 2, w: 6, h: 9, floor: 'carpet' },
          { name: 'Sala de servidores', x: 8, y: 2, w: 15, h: 9, floor: 'tile', theme: 'servers' },
        ],
      },
      items: [
        ['desktech', 1, 3, 0], ['desk3', 4, 3, 0], ['sofa', 1, 9], ['plant', 6, 2], ['water', 6, 10],
        ...row(3, 10, 15, ['PWS', 'SSS', 'SS']),
        ...row(7, 10, 15, ['PWS', 'SS', 'SSS']),
        ['storage', 17, 3], ['storage', 18, 3], ['crac', 22, 3], ['crac', 22, 7], ['bin', 22, 10],
      ],
      crew: ['redes', 'servidores', 'sysadmin', 'tecnico'],
      messy: true,
    },
    dcm: {
      name: 'Datacenter médio',
      desc: 'NOC, escritório, recepção e um salão com três fileiras de racks.',
      tag: '4 salas · 30 racks',
      def: {
        lot: { w: 34, h: 24 },
        rooms: [
          { name: 'NOC', x: 1, y: 2, w: 9, h: 7, floor: 'carpet', theme: 'noc' },
          { name: 'Escritório', x: 1, y: 10, w: 9, h: 7, floor: 'carpet', theme: 'corporate' },
          { name: 'Salão de servidores', x: 11, y: 2, w: 21, h: 15, floor: 'tile', theme: 'servers' },
          { name: 'Recepção', x: 1, y: 18, w: 9, h: 5, floor: 'carpet' },
        ],
      },
      items: [
        ['desknoc', 1, 3, 0], ['desknoc', 4, 3, 0], ['desknoc', 7, 3, 0], ['desk4', 1, 6, 0], ['desktech', 7, 6, 0],
        ['deskadmin', 1, 12, 0], ['desk', 4, 12, 0], ['deskgamerpc', 7, 12, 0], ['sofa', 1, 15], ['whiteboard', 6, 16],
        ['plant', 1, 10], ['plant', 9, 16], ['water', 9, 2],
        ...row(4, 13, 22, ['PWSS', 'SSS', 'SS', 'SSS']),
        ...row(8, 13, 22, ['WSS', 'SSS', 'SSS', 'SS']),
        ...row(12, 13, 22, ['WSS', 'SS', 'SSS']),
        ['storage', 25, 4], ['storage', 26, 4], ['storage', 25, 8], ['storage', 26, 8],
        ['crac', 30, 4], ['crac', 30, 8], ['crac', 30, 12], ['bin', 31, 16],
        ['desksupport', 6, 19, 0], ['sofa', 1, 21], ['plant', 1, 18], ['water', 9, 18], ['plant', 9, 22], ['lamp', 4, 22],
        ['beanbag', 5, 15], ['table', 7, 15], ['coffee', 7, 15],
      ],
      crew: ['redes', 'servidores', 'sysadmin', 'seguranca', 'gerente', 'tecnico', 'funcionario', 'atendente'],
      messy: true,
    },
  };
  DL.PRESETS = P;
  DL.PRESET_ORDER = ['zero', 'office', 'noc', 'dcs', 'dcm'];

  // Replace the world in place (the builder and crew keep their reference), then furnish it.
  // Returns the list of placements the builder refused (empty when the preset is valid).
  DL.applyPreset = function (id, sys) {
    const p = P[id] || P.zero;
    const scene = sys.scene, W = scene.world;
    const fresh = DL.newWorld(p.def);
    for (const k of Object.keys(W)) if (!(k in fresh)) delete W[k];
    Object.assign(W, fresh);
    scene.refreshWorld(true);
    const pl = sys.player;
    pl.x = W.spawn.x;
    pl.y = W.spawn.y;
    pl.vx = pl.vy = 0;
    pl.dir = 'down';
    scene.cam.x = W.mapW ? W.mapW / 2 : (W.W * DL.T) / 2;
    scene.cam.y = (W.H * DL.T) / 2;
    sys.ops.reset();
    const refused = [];
    sys.ops.preinstall = true;
    for (const [kind, tx, ty, rot, units] of p.items || []) {
      const why = sys.builder.api.place(kind, tx, ty, rot || 0);
      if (why) { refused.push(kind + '@' + tx + ',' + ty + ': ' + why); continue; }
      for (const u of units || []) {
        const r = sys.builder.api.place(u === 'W' ? 'switch' : u === 'P' ? 'patch' : 'server', tx, ty);
        if (r) refused.push(u + '@' + tx + ',' + ty + ': ' + r);
      }
    }
    // a messy rack in the bigger presets gives the crew something to point out
    const racks = W.items.filter((e) => e.kind === 'rack' && e.units && e.units.some(Boolean));
    sys.ops.prewire(p.messy && racks.length > 3 ? racks[racks.length - 2] : null);
    sys.ops.preinstall = false;
    sys.builder.api.commit({ layout: true });
    return refused;
  };
})();
