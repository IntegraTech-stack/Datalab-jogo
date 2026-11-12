/* DataLab — workplace: what each role needs where it works. Every member has a sector (a room chosen by
   the player, crew.js) and the room has to offer the structure the job needs: an IT technician needs a
   bench or table to repair things, an attendant needs a desk at the reception, network people need a
   rack to look after… Missing structure is noticed by the bot (it complains in its own words), slows its
   work down and shows up on its card. Rules only — they read the real world items. */
(function () {
  'use strict';
  const DL = window.DL;
  const rand = Math.random;
  const pick = (a) => a[Math.floor(rand() * a.length)];

  // What counts as each resource
  const RES = {
    desk: { label: 'Computador', icon: '🖥️', scope: 'zone', test: (e) => e.kind === 'desk' && !e.broken },
    bench: { label: 'Bancada / mesa de manutenção', short: 'Bancada', icon: '🛠️', scope: 'zone', test: (e) => (e.kind === 'desk' && e.setup === 'tech') || e.kind === 'table' || e.kind === 'toolcart' || e.kind === 'cart' },
    rack: { label: 'Rack com equipamentos', short: 'Rack', icon: '🗄️', scope: 'any', test: (e) => e.kind === 'rack' && e.units && e.units.some(Boolean) },
    frontdesk: { label: 'Balcão ou mesa na recepção', short: 'Balcão na recepção', icon: '🛎️', scope: 'reception', test: (e) => e.kind === 'desk' || e.kind === 'table' },
    reception: { label: 'Sala do tipo Recepção', short: 'Recepção', icon: '🚪', scope: 'room', test: null },
  };
  DL.WORK_RES = RES;

  // Needs per built-in role (first = the one without which the work barely happens)
  DL.ROLE_NEEDS = {
    tecnico: ['bench', 'desk'],
    redes: ['rack', 'desk'],
    servidores: ['rack'],
    sysadmin: ['desk'],
    gerente: ['desk'],
    funcionario: ['desk'],
    atendente: ['reception', 'frontdesk'],
    seguranca: [],
  };

  // what a member complains about when something is missing (natural, varied)
  const GRIPE = {
    desk: (n, room) => [
      'Não tem computador ' + (room ? 'na ' + room : 'aqui') + '. Como eu vou trabalhar?',
      'Alguém viu uma mesa com PC livre ' + (room ? 'na ' + room : 'por aqui') + '? Estou trabalhando no celular 😅',
      'Preciso de uma estação ' + (room ? 'na ' + room : '') + '… sem computador fica difícil, chefe.',
    ],
    bench: (n, room) => [
      'Não tem mesa nem bancada ' + (room ? 'na ' + room : 'aqui') + ', como vou fazer manutenção?',
      'Cadê a bancada? Vou ter que abrir PC no chão ' + (room ? 'da ' + room : '') + '? 🛠️',
      'Chefe, sem uma mesa ou estação técnica ' + (room ? 'na ' + room : '') + ' eu não consigo consertar nada direito.',
    ],
    rack: () => [
      'Ainda não temos rack com equipamento. Vou cuidar do quê? 🤷',
      'Sem rack, sem switch, sem servidor… estou meio sem função aqui.',
    ],
    frontdesk: (n, room) => [
      'Não tem balcão nem mesa ' + (room ? 'na ' + room : 'na recepção') + '. Vou atender o cliente em pé no meio da sala?',
      'Precisava de uma mesa na recepção para receber os clientes direito.',
    ],
    reception: () => [
      'A gente não tem uma recepção. Onde eu recebo os clientes?',
      'Chefe, falta uma sala de Recepção (B → Espaços → tipo da sala). Os clientes não têm onde chegar.',
    ],
  };
  DL.workGripe = (id, name, room) => pick((GRIPE[id] || (() => ['Está faltando estrutura para eu trabalhar.']))(name, room));

  // needs of any role (player-made roles: from their equipment list)
  DL.needsOfRole = function (role) {
    if (DL.ROLE_NEEDS[role]) return DL.ROLE_NEEDS[role];
    const R = DL.ROLES[role], cfg = R && R.cfg;
    if (!cfg) return ['desk'];
    const out = [];
    if (cfg.equip.some((e) => e === 'pc' || e.indexOf('st:') === 0)) out.push('desk');
    if (cfg.equip.indexOf('rack') >= 0 || cfg.equip.indexOf('switch') >= 0) out.push('rack');
    return out;
  };

  // Check a member's needs. room(x,y) → room of a tile; zone: the member's sector (room) or null.
  // Returns [{ id, label, ok, where }]
  DL.checkNeeds = function (world, role, zone, typeOf) {
    const rooms = world.rooms || [];
    const reception = rooms.find((r) => typeOf && typeOf(r) === 'reception') || null;
    const roomOfItem = (e) => {
      if (!world.roomAt || e.tx == null) return null;
      const i = world.roomAt[e.ty * world.W + e.tx];
      return i >= 0 ? rooms[i] : null;
    };
    return DL.needsOfRole(role).map((id) => {
      const R = RES[id];
      if (id === 'reception') return { id, label: R.label, short: R.short, icon: R.icon, ok: !!reception, where: reception ? reception.name : null };
      const inScope = (e) => {
        if (R.scope === 'any' || (R.scope === 'zone' && !zone)) return true;
        const r = roomOfItem(e);
        if (R.scope === 'reception') return !!reception && r === reception;
        return !!r && r.id === zone.id;
      };
      const hit = world.items.find((e) => !e.host && R.test(e) && inScope(e));
      const where = R.scope === 'reception' ? (reception ? reception.name : null) : R.scope === 'zone' && zone ? zone.name : null;
      return { id, label: R.label, short: R.short || R.label, icon: R.icon, ok: !!hit, where };
    });
  };
})();
