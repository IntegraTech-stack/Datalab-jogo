/* DataLab — jobs: the real tasks of each role, skills / experience / levels, and what the crew says.
   Rules only (no AI): each task knows where it happens, what it changes in the datacenter when it ends
   and how the person reports it in the team chat. crew.js runs them; teamchat.js shows the talk. */
(function () {
  'use strict';
  const DL = window.DL;
  const rand = Math.random;
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const num = (v, d) => v.toFixed(d == null ? 1 : d).replace('.', ',');

  /* ------------------------------------------------------------------ */
  /* Skills, experience, levels, stars                                   */
  /* ------------------------------------------------------------------ */
  const SKILLS = [['redes', 'Redes'], ['servidores', 'Servidores'], ['sistemas', 'Sistemas'], ['seguranca', 'Segurança'], ['gestao', 'Gestão']];
  const ROLE_SKILL = { redes: 'redes', servidores: 'servidores', sysadmin: 'sistemas', tecnico: 'servidores', seguranca: 'seguranca', funcionario: 'gestao', gerente: 'gestao', atendente: 'gestao' };
  const SECOND_SKILL = { redes: 'servidores', servidores: 'redes', sysadmin: 'servidores', tecnico: 'redes', seguranca: 'redes', funcionario: 'sistemas', gerente: 'sistemas', atendente: 'sistemas' };
  const MAX_LEVEL = 10;
  DL.SKILLS = SKILLS;
  DL.ROLE_SKILL = ROLE_SKILL;
  DL.SECOND_SKILL = SECOND_SKILL;

  const xpNeed = (level) => 60 + level * 50;

  function newStats(role, level) {
    const s = {};
    for (const [k] of SKILLS) s[k] = Math.round(6 + rand() * 18);
    s[ROLE_SKILL[role]] = Math.round(38 + rand() * 14);
    s[SECOND_SKILL[role]] = Math.round(20 + rand() * 12);
    const st = { level: 1, xp: 0, skills: s, done: 0, found: 0, fixed: 0 };
    // presets bring a team that already has some time on the job
    for (let l = 1; l < (level || 1); l++) {
      st.level++;
      s[ROLE_SKILL[role]] = Math.min(99, s[ROLE_SKILL[role]] + 6);
      s[SECOND_SKILL[role]] = Math.min(99, s[SECOND_SKILL[role]] + 3);
    }
    return st;
  }

  function starsOf(st, role) {
    const main = st.skills[ROLE_SKILL[role]] || 0;
    return Math.max(1, Math.min(5, Math.round((st.level * 10 + main) / 30)));
  }

  // Practice makes better: big gains while a skill is low, small near the top.
  function train(st, skill, amount) {
    const v = st.skills[skill] || 0;
    st.skills[skill] = Math.min(99, Math.round((v + amount * (1 - v / 110)) * 10) / 10);
  }

  // Returns the number of levels gained (0 most of the time).
  function gainXp(st, role, xp) {
    if (st.level >= MAX_LEVEL) return 0;
    st.xp += xp;
    let up = 0;
    while (st.level < MAX_LEVEL && st.xp >= xpNeed(st.level)) {
      st.xp -= xpNeed(st.level);
      st.level++;
      up++;
      train(st, ROLE_SKILL[role], 4);
      train(st, SECOND_SKILL[role], 2);
    }
    if (st.level >= MAX_LEVEL) st.xp = 0;
    return up;
  }

  // Skilled people are quicker (×1.25 at skill 0 … ×0.76 at 99).
  const speedOf = (st, skill) => 1.25 - (st.skills[skill] || 0) / 200;

  DL.XP = { newStats, starsOf, train, gainXp, xpNeed, speedOf, MAX_LEVEL };

  /* ------------------------------------------------------------------ */
  /* Where things are                                                    */
  /* ------------------------------------------------------------------ */
  const items = (ctx, kind) => ctx.world.items.filter((e) => e.kind === kind);
  // objects that offer an interaction (interact.js)
  const offers = (ctx, type, ok) => (DL.Interact ? DL.Interact.offers(ctx.world, type, ok) : []);
  const devsOf = (ctx, rack) => (ctx.ops ? ctx.ops.devices().filter((d) => d.rack === rack) : []);
  const racks = (ctx, pred) => items(ctx, 'rack').filter((e) => e.units && (!pred || pred(e, devsOf(ctx, e))));
  const tempOf = (e) => (e.temp != null ? e.temp : e.tel ? e.tel.temp : 24);
  // d.hold: a career problem the crew leaves to the player (problems.js)
  const faults = (ctx, types) => (ctx.ops ? ctx.ops.devices().filter((d) => d.fault && d.fault.found && !d.hold && types.indexOf(d.fault.type) >= 0) : []);
  const servers = (ctx) => (ctx.ops ? ctx.ops.devices().filter((d) => d.kind === 'server') : []);
  const online = (ctx) => servers(ctx).filter((d) => d.state === 'online');
  const up = (ctx, d) => ctx.ops.health(d).up && !d.fault;

  const labelOf = (t) => (!t ? '' : t.crew ? t.crew.name : t.rack && t.name ? t.name : t.label || t.id || (t.kind ? DL.itemName(t) : ''));

  /* ------------------------------------------------------------------ */
  /* Fault repair (what each fix is, told the way a tech would)          */
  /* ------------------------------------------------------------------ */
  const FIX_SAY = {
    link: (d) => (DL.isWin && DL.isWin(d) ? 'Habilitei o adaptador Ethernet do ' + d.name + ' (Enable-NetAdapter). Link de volta.' : 'Subi a eth0 do ' + d.name + ' (ip link set eth0 up). Link de volta.'),
    winsvc: (d) => 'O ' + ((d.os.win && d.os.win.faultSvc) || 'serviço') + ' tinha parado no ' + d.name + '. Vi no log System e subi com Start-Service.',
    lockout: (d) => 'Desbloqueei a conta travada no AD do ' + d.name + ' (Unlock-ADAccount) e confirmei com o usuário.',
    cable: (d) => 'Recoloquei o cabo solto do ' + d.name + ' e testei com ping: ok.',
    port: (d) => 'Reativei a porta ' + String(d.sw.bad || '').replace('gi', 'Gi') + ' do ' + d.name + ' com shutdown / no shutdown.',
    service: (d) => 'Reiniciei o nginx do ' + d.name + '. Já responde 200.',
    disk: (d) => 'Limpei logs antigos do ' + d.name + '. Disco caiu para 61%.',
  };
  const FIX_NAME = { link: 'interface', cable: 'cabo', port: 'porta do switch', service: 'serviço', disk: 'disco', winsvc: 'serviço do Windows', lockout: 'conta bloqueada' };

  function fixTask(id, name, types, skill, desc) {
    return {
      id, name, kind: 'fix', skill, xp: 30, dur: [12, 20], auto: 0, desc,
      verb: 'Resolvendo',
      none: 'Nenhum problema desse tipo em aberto',
      types,
      targets: (ctx) => faults(ctx, types),
      place: (d) => d.rack,
      finish(ctx, d) {
        if (!d.fault || types.indexOf(d.fault.type) < 0) return { say: 'Cheguei no ' + d.name + ' e já estava resolvido. Melhor assim!' };
        const s = ctx.stats.skills[skill] || 0;
        // beginners sometimes don't make it — and learn from it anyway
        if (rand() < Math.max(0, (42 - s) / 70)) {
          return { say: 'Tentei resolver o ' + FIX_NAME[d.fault.type] + ' do ' + d.name + ', mas não consegui ainda. Alguém com mais experiência pode ajudar?', tone: 'help', failed: true };
        }
        const say = FIX_SAY[d.fault.type](d);
        if (!ctx.ops.fix(d, ctx.a)) return { say: 'Mexi no ' + d.name + ', mas ainda não voltou. ' + ctx.player + ', confere o cabeamento comigo?', tone: 'warn' };
        return { say, tone: 'ok', fixed: true };
      },
    };
  }

  /* ------------------------------------------------------------------ */
  /* Task catalog per role                                               */
  /*   kind: pc (sits at a workstation) · equip (works at a rack/unit)   */
  /*         patrol (walks through the rooms) · spot (goes somewhere)    */
  /*         visit (talks to a coworker) · fix (repairs a found fault)   */
  /*   auto: weight when the person picks the task alone (0 = only on order) */
  /* ------------------------------------------------------------------ */
  const T = {
    redes: [
      {
        id: 'switch', name: 'Verificar switch', verb: 'Verificando', kind: 'equip', skill: 'redes', xp: 14, dur: [6, 10], auto: 3,
        desc: 'Portas, LEDs e erros do switch do rack.', none: 'Nenhum switch instalado',
        targets: (ctx) => racks(ctx, (e, ds) => ds.some((d) => d.kind === 'switch')),
        finish(ctx, rack) {
          if (ctx.ops.inspect(ctx.a, rack)) return null;
          const sw = devsOf(ctx, rack).filter((d) => d.kind === 'switch')[0];
          if (!sw) return { say: 'O switch do ' + rack.id + ' foi removido.' };
          const h = ctx.ops.health(sw), n = sw.sw.linked ? sw.sw.linked.size : 0;
          if (h.errPorts) return { say: sw.name + ' com ' + h.errPorts + ' porta(s) em err-disabled. Já está nas Tarefas.', tone: 'warn' };
          return { say: pick([sw.name + ' ok: ' + n + ' porta(s) conectada(s), nenhuma em erro.', 'Conferi o ' + sw.name + '. Links estáveis, LEDs verdes.', sw.name + ' sem erros de CRC nas portas. Tudo certo.']) };
        },
      },
      {
        id: 'cables', name: 'Organizar cabos', verb: 'Organizando cabos', kind: 'equip', skill: 'redes', xp: 16, dur: [10, 16], auto: 2,
        desc: 'Passa os cabos pelos organizadores e bandejas.', none: 'Nenhum rack com cabos',
        // (a rack with a Monitor order about its cabling or airflow is left to that order: staff.js)
        targets: (ctx) => racks(ctx, (e) => !!e.cableLook && !e.hold && !(ctx.staff && ctx.staff.incidentAt && ctx.staff.incidentAt(e))),
        weight: (e) => (e.cableLook === 'messy' ? 10 : 1),
        finish(ctx, rack) {
          if (rack.cableLook === 'messy') {
            ctx.ops.tidy([rack], ctx.a.crew.name);
            return { say: 'Organizei os cabos do ' + rack.id + '. Bem melhor para o fluxo de ar.', tone: 'ok' };
          }
          return { say: pick(['Revisei as etiquetas dos cabos do ' + rack.id + '. Tudo nos conformes.', 'Cabos do ' + rack.id + ' arrumados, só apertei umas abraçadeiras.']) };
        },
      },
      {
        id: 'ping', name: 'Testar conexão', verb: 'Testando conexão', kind: 'equip', skill: 'redes', xp: 14, dur: [6, 10], auto: 3,
        desc: 'Ping e traceroute nos servidores do rack.', none: 'Nenhum servidor instalado',
        targets: (ctx) => racks(ctx, (e, ds) => ds.some((d) => d.kind === 'server')),
        finish(ctx, rack) {
          if (ctx.ops.inspect(ctx.a, rack)) return null;
          const srv = devsOf(ctx, rack).filter((d) => d.kind === 'server' && d.state === 'online');
          if (!srv.length) return { say: 'Nenhum servidor do ' + rack.id + ' está configurado ainda. Sem o que pingar.' };
          const down = srv.filter((d) => !up(ctx, d));
          if (down.length) return { say: 'Ping ok em ' + (srv.length - down.length) + '/' + srv.length + ' no ' + rack.id + '. ' + down.map((d) => d.name).join(', ') + ' sem resposta.', tone: 'warn' };
          return { say: pick(['Ping ok em ' + srv.length + '/' + srv.length + ' servidores do ' + rack.id + '. Latência abaixo de 1 ms.', 'Rede do ' + rack.id + ' respondendo liso, zero perda.', 'Traceroute do ' + rack.id + ' limpinho até o gateway.']) };
        },
      },
      fixTask('fixnet', 'Resolver falha de rede', ['cable', 'port', 'link'], 'redes', 'Cabo solto, porta em erro ou interface desligada.'),
      {
        id: 'topo', name: 'Documentar topologia', verb: 'Documentando a topologia', kind: 'pc', skill: 'redes', xp: 10, dur: [14, 22], auto: 1,
        desc: 'Atualiza o diagrama da rede no computador.',
        finish(ctx) {
          const sw = ctx.ops ? ctx.ops.devices().filter((d) => d.kind === 'switch').length : 0;
          return { say: sw ? pick(['Diagrama da rede atualizado: ' + sw + ' switch(es) e ' + servers(ctx).length + ' servidor(es).', 'Topologia revisada, nenhuma mudança desde a última versão.', 'Atualizei as etiquetas de porta no diagrama da rede.', 'Mapa de VLANs e uplinks documentado na wiki.']) : 'Desenhei a rede planejada. Falta instalar o primeiro switch.' };
        },
      },
    ],
    servidores: [
      {
        id: 'install', name: 'Instalar servidor', verb: 'Instalando servidor', kind: 'equip', skill: 'servidores', xp: 22, dur: [10, 14], auto: 0,
        desc: 'Monta um servidor novo num rack com espaço.', none: 'Nenhum rack com espaço livre',
        targets: (ctx) => racks(ctx, (e) => e.units.indexOf(null) >= 0),
        finish(ctx, rack) {
          const d = ctx.install && ctx.install(rack);
          if (!d) return { say: 'O ' + rack.id + ' ficou sem espaço antes de eu terminar.' };
          return { say: 'Instalei o ' + d.name + ' no ' + rack.id + '. Falta ligar o cabo e configurar.', tone: 'ok' };
        },
      },
      {
        id: 'hw', name: 'Verificar hardware', verb: 'Verificando hardware', kind: 'equip', skill: 'servidores', xp: 14, dur: [6, 10], auto: 3,
        desc: 'Fontes, discos, ventoinhas e temperatura.', none: 'Nenhum servidor ou storage',
        targets: (ctx) => racks(ctx, (e, ds) => ds.some((d) => d.kind === 'server')).concat(items(ctx, 'storage')),
        finish(ctx, e) {
          if (e.units && ctx.ops.inspect(ctx.a, e)) return null;
          const t = tempOf(e);
          if (t > 27.5) return { say: e.id + ' esquentando (' + num(t) + ' °C). Vale olhar a refrigeração.', tone: 'warn' };
          return { say: pick([e.id + ' a ' + num(t) + ' °C, ventoinhas normais.', 'Fontes redundantes do ' + e.id + ' ok, discos sem alerta SMART.', e.id + ' revisado: nada fora do lugar.']) };
        },
      },
      {
        id: 'svc', name: 'Configurar serviço', verb: 'Configurando serviço', kind: 'pc', skill: 'servidores', xp: 12, dur: [14, 22], auto: 2,
        desc: 'Ajusta serviços e imagens dos servidores.',
        finish(ctx) {
          const s = online(ctx);
          return { say: s.length ? 'Deixei o nginx do ' + pick(s).name + ' com reinício automático.' : 'Preparei a imagem padrão para os próximos servidores.' };
        },
      },
      fixTask('fixhw', 'Resolver falha de hardware', ['disk', 'cable', 'link'], 'servidores', 'Disco cheio, cabo solto ou interface desligada.'),
      {
        id: 'cool', name: 'Checar refrigeração', verb: 'Checando a refrigeração', kind: 'equip', skill: 'servidores', xp: 10, dur: [6, 9], auto: 1,
        desc: 'Temperatura de insuflamento e filtros.', none: 'Nenhum ar de precisão instalado',
        targets: (ctx) => items(ctx, 'crac'),
        finish: (ctx, e) => ({ say: (e.id || 'Ar de precisão') + ' insuflando a ' + num(tempOf(e)) + ' °C. Filtros limpos.' }),
      },
    ],
    sysadmin: [
      {
        id: 'sys', name: 'Configurar sistema', verb: 'Configurando o sistema', kind: 'pc', skill: 'sistemas', xp: 12, dur: [14, 22], auto: 2,
        desc: 'NTP, syslog, usuários e automação.',
        finish(ctx) {
          const n = online(ctx).length;
          return { say: n ? pick(['Configurei NTP e syslog central em ' + n + ' servidor(es).', 'Automatizei o deploy dos ' + n + ' servidor(es) online.']) : 'Deixei os playbooks prontos para quando os servidores subirem.' };
        },
      },
      {
        id: 'alerts', name: 'Analisar alertas', verb: 'Analisando alertas', kind: 'pc', skill: 'sistemas', xp: 14, dur: [10, 16], auto: 3,
        desc: 'Revisa o monitoramento e acha o que ninguém viu.',
        finish(ctx) {
          const hidden = ctx.ops ? ctx.ops.devices().filter((d) => d.fault && !d.fault.found) : [];
          if (hidden.length) { ctx.ops.report(hidden[0], ctx.a, 'análise de alertas'); return null; }
          return { say: pick(['Analisei os alertas: nada crítico, só ruído.', 'Fila de alertas zerada. Ajustei dois limiares que davam falso positivo.']) };
        },
      },
      fixTask('fixinc', 'Resolver incidente', ['service', 'disk', 'link', 'winsvc', 'lockout'], 'sistemas', 'Serviço parado, disco cheio, interface, serviço do Windows ou conta bloqueada no AD.'),
      {
        id: 'backup', name: 'Revisar backups', verb: 'Revisando backups', kind: 'pc', skill: 'sistemas', xp: 10, dur: [12, 18], auto: 1,
        desc: 'Confere a rotina de backup da madrugada.',
        finish: (ctx) => ({ say: online(ctx).length ? pick(['Backup da madrugada ok: ' + online(ctx).length + ' servidor(es), nenhum erro.', 'Testei a restauração de um backup aleatório: funcionou.', 'Rotina de backup conferida, retenção de 7 dias ok.']) : 'Agendei o backup para os servidores novos.' }),
      },
      {
        id: 'patch', name: 'Aplicar atualizações', verb: 'Aplicando atualizações', kind: 'equip', skill: 'sistemas', xp: 12, dur: [8, 12], auto: 1,
        desc: 'Atualiza os servidores do rack, um por vez.', none: 'Nenhum servidor online',
        targets: (ctx) => racks(ctx, (e, ds) => ds.some((d) => d.kind === 'server' && d.state === 'online')),
        finish: (ctx, rack) => ({ say: 'Patches de segurança aplicados no ' + rack.id + ', sem reboot surpresa.' }),
      },
    ],
    seguranca: [
      {
        id: 'round', name: 'Fazer ronda', verb: 'Fazendo ronda', kind: 'patrol', skill: 'seguranca', xp: 12, dur: [0, 0], auto: 3,
        desc: 'Percorre as salas conferindo portas e acessos.',
        finish: (ctx) => ({ say: pick(['Ronda concluída: ' + ctx.world.rooms.length + ' sala(s), portas ok.', 'Rodei o prédio todo. Nada fora do lugar.', 'Ronda feita: portas trancadas e corredores livres.', 'Passei em todas as salas. Só o barulho de sempre das ventoinhas.']) }),
      },
      {
        id: 'cams', name: 'Monitorar câmeras', verb: 'Monitorando câmeras', kind: 'pc', skill: 'seguranca', xp: 10, dur: [14, 22], auto: 2,
        desc: 'Acompanha as câmeras do prédio.',
        finish: () => ({ say: pick(['Câmeras sem movimento estranho. Só o pessoal de sempre.', 'Gravações da noite conferidas. Nada fora do normal.']) }),
      },
      {
        id: 'access', name: 'Verificar acessos', verb: 'Verificando acessos', kind: 'spot', skill: 'seguranca', xp: 10, dur: [5, 8], auto: 1,
        desc: 'Confere o controle de acesso da entrada.',
        targets: (ctx) => [ctx.reception()],
        finish: () => ({ say: pick(['Conferi o controle de acesso da entrada. Crachás em dia.', 'Catraca da entrada ok, registro de visitantes conferido.', 'Revisei os acessos: dois crachás vencidos bloqueados.']) }),
      },
      {
        id: 'seals', name: 'Conferir lacres dos racks', verb: 'Conferindo lacres', kind: 'equip', skill: 'seguranca', xp: 10, dur: [5, 8], auto: 2,
        desc: 'Portas e lacres dos racks fechados.', none: 'Nenhum rack instalado',
        targets: (ctx) => racks(ctx),
        finish: (ctx, rack) => ({ say: 'Lacres do ' + rack.id + ' intactos.' }),
      },
    ],
    funcionario: [
      {
        id: 'tickets', name: 'Organizar chamados', verb: 'Organizando chamados', kind: 'pc', skill: 'gestao', xp: 10, dur: [14, 22], auto: 3,
        desc: 'Prioriza e responde os chamados abertos.',
        finish(ctx) {
          const open = ctx.ops ? ctx.ops.tasks().length : 0;
          return { say: open ? pick(['Chamados organizados: ' + open + ' em aberto, priorizei os incidentes.', 'Reordenei a fila: ' + open + ' chamado(s), incidentes primeiro.']) : pick(['Fila de chamados zerada por hoje.', 'Nenhum chamado pendente. Aproveitei para responder os e-mails.', 'Chamados em dia ✔️']) };
        },
      },
      {
        id: 'inv', name: 'Atualizar inventário', verb: 'Atualizando inventário', kind: 'equip', skill: 'gestao', xp: 10, dur: [6, 9], auto: 2,
        desc: 'Confere etiquetas e números de série.', none: 'Nada para inventariar',
        targets: (ctx) => racks(ctx).concat(items(ctx, 'storage')),
        finish: (ctx, e) => ({ say: 'Inventário do ' + e.id + ' atualizado: ' + (e.units ? e.units.filter(Boolean).length : 1) + ' equipamento(s).' }),
      },
      {
        id: 'coffee', name: 'Repor café e água', verb: 'Repondo café e água', kind: 'spot', skill: 'gestao', xp: 6, dur: [5, 7], auto: 1,
        desc: 'Mantém a copa abastecida.', none: 'Sem cafeteira ou bebedouro',
        targets: (ctx) => offers(ctx, 'drink'),
        finish: (ctx, e) => ({ say: e && e.kind === 'fridge' ? 'Geladeira abastecida com refri e água 🧊' : e && e.kind === 'vending' ? 'Máquina de lanches reabastecida.' : pick(['Café passado ☕ quem quiser, está na copa.', 'Bebedouro abastecido. Hidratem-se, pessoal!']) }),
      },
      {
        id: 'docs', name: 'Atualizar documentação', verb: 'Atualizando a documentação', kind: 'pc', skill: 'sistemas', xp: 8, dur: [12, 18], auto: 2,
        desc: 'Procedimentos e manuais na wiki.',
        finish: () => ({ say: pick(['Atualizei o procedimento de troca de cabos na wiki.', 'Documentei o passo a passo de reinício do nginx.', 'Revisei o manual de acesso à sala de servidores.', 'Wiki em dia: adicionei o checklist de passagem de turno.']) }),
      },
    ],
    gerente: [
      {
        id: 'kpi', name: 'Revisar indicadores', verb: 'Revisando indicadores', kind: 'pc', skill: 'gestao', xp: 10, dur: [14, 22], auto: 3,
        desc: 'Disponibilidade, chamados e consumo.',
        finish(ctx) {
          const s = online(ctx);
          if (!s.length) return { say: 'Sem servidores online ainda. Meta da semana: o primeiro no ar!' };
          const pct = (s.filter((d) => up(ctx, d)).length / s.length) * 100;
          return { say: 'Disponibilidade agora: ' + num(pct) + '%. ' + (pct >= 99 ? 'Bom trabalho, time!' : 'Vamos atacar os incidentes abertos.'), tone: pct >= 99 ? 'ok' : 'warn' };
        },
      },
      {
        id: 'capacity', name: 'Planejar capacidade', verb: 'Planejando capacidade', kind: 'pc', skill: 'gestao', xp: 12, dur: [14, 20], auto: 2,
        desc: 'Espaço em rack, energia e crescimento.',
        finish(ctx) {
          const rs = racks(ctx), free = rs.reduce((n, e) => n + e.units.filter((u) => !u).length, 0);
          return { say: rs.length ? 'Temos ' + free + ' posição(ões) livre(s) em ' + rs.length + ' rack(s). ' + (free < 3 ? 'Hora de comprar outro rack.' : 'Dá para crescer.') : 'Precisamos do primeiro rack. Vou pedir orçamento.' };
        },
      },
      {
        id: 'meeting', name: 'Reunião rápida', verb: 'Em reunião rápida', kind: 'visit', skill: 'gestao', xp: 10, dur: [4, 6], auto: 1,
        desc: 'Alinha prioridades com alguém da equipe.', none: 'Ninguém mais na equipe',
        targets: (ctx) => ctx.members.filter((m) => m !== ctx.a),
        finish: (ctx, m) => ({ say: m.crew.name + ', alinhado: prioridade para os incidentes, depois instalação.', reply: [m, pick(['Combinado!', 'Fechado, vou nessa.', 'Pode deixar comigo.'])] }),
      },
      {
        id: 'walk', name: 'Vistoria do datacenter', verb: 'Fazendo vistoria', kind: 'patrol', skill: 'gestao', xp: 10, dur: [0, 0], auto: 1,
        desc: 'Passa por todas as salas e conversa com o time.',
        finish: (ctx) => ({ say: 'Vistoria feita. ' + (items(ctx, 'rack').length ? items(ctx, 'rack').length + ' rack(s) em operação.' : 'Ainda temos muito para montar!') }),
      },
      // the manager runs the company: finds what is missing or broken and hands it to the technicians
      {
        id: 'needs', name: 'Identificar necessidades', verb: 'Analisando a infraestrutura', kind: 'pc', skill: 'gestao', xp: 14, dur: [9, 14], auto: 4,
        desc: 'Procura o que quebrou ou falta e abre ordens de serviço para os técnicos.',
        finish: (ctx) => (ctx.staff ? ctx.staff.assess(ctx.a) : null),
      },
      {
        id: 'follow', name: 'Acompanhar ordens', verb: 'Acompanhando a ordem de serviço', kind: 'visit', skill: 'gestao', xp: 10, dur: [4, 6], auto: 2,
        desc: 'Vai até quem está executando uma ordem e confere o andamento.', none: 'Nenhuma ordem em andamento',
        targets: (ctx) => (ctx.staff ? ctx.staff.busyMembers() : []),
        finish: (ctx, m) => (ctx.staff ? ctx.staff.followUp(ctx.a, m) : null),
      },
      {
        id: 'expand', name: 'Planejar expansão', verb: 'Planejando a expansão', kind: 'pc', skill: 'gestao', xp: 12, dur: [12, 18], auto: 1,
        desc: 'Avalia espaço, racks e refrigeração e encomenda o que falta para crescer.',
        finish: (ctx) => (ctx.staff ? ctx.staff.assess(ctx.a, { expand: true }) : null),
      },
    ],
  };
  // IT technician: hands-on maintenance — takes the broken PC or switch to the bench, repairs it and
  // installs it back; also installs equipment ordered by the manager.
  T.tecnico = [
    {
      id: 'repair', name: 'Consertar equipamento', verb: 'Consertando', kind: 'repair', skill: 'servidores', xp: 26, dur: [9, 14], auto: 0,
      desc: 'Retira o PC ou switch quebrado, conserta na bancada e reinstala.', none: 'Nenhum equipamento quebrado',
      targets: (ctx) => (ctx.staff ? ctx.staff.broken().filter((b) => !b.taken) : []),
      place: (b) => b.place,
      finish: (ctx, b) => (ctx.staff ? ctx.staff.repaired(b, ctx.a) : null),
    },
    {
      id: 'pcmaint', name: 'Manutenção de PCs', verb: 'Fazendo manutenção', kind: 'equip', skill: 'servidores', xp: 12, dur: [6, 10], auto: 3,
      desc: 'Limpeza, fonte, ventoinhas e drivers das estações.', none: 'Nenhum computador no datacenter',
      targets: (ctx) => items(ctx, 'desk').filter((d) => !d.broken && !d.pcOut),
      finish(ctx, d) {
        if (ctx.staff) ctx.staff.prevent(d);
        return { say: pick([(d.id || 'PC') + ': poeira fora, pasta térmica nova. Vai durar mais.', 'Troquei a fonte do ' + (d.id || 'PC') + ' antes que ela queimasse.', (d.id || 'PC') + ' revisado: SSD saudável, drivers em dia.']) };
      },
    },
    {
      id: 'swmaint', name: 'Revisar switches', verb: 'Revisando o switch', kind: 'equip', skill: 'servidores', xp: 12, dur: [6, 10], auto: 2,
      desc: 'Fontes, ventoinhas e firmware dos switches.', none: 'Nenhum switch instalado',
      targets: (ctx) => racks(ctx, (e, ds) => ds.some((d) => d.kind === 'switch' && !d.broken)),
      finish(ctx, rack) {
        if (ctx.ops.inspect(ctx.a, rack)) return null;
        const sw = devsOf(ctx, rack).find((d) => d.kind === 'switch');
        if (!sw) return { say: 'O switch do ' + rack.id + ' foi removido.' };
        if (ctx.staff) ctx.staff.prevent(sw);
        return { say: pick([sw.name + ': fontes redundantes ok, ventoinha trocada.', 'Firmware do ' + sw.name + ' atualizado. Nada de reboot surpresa.', sw.name + ' revisado, LEDs e temperatura normais.']) };
      },
    },
    T.servidores.find((d) => d.id === 'install'),
    fixTask('fixtec', 'Trocar cabo com defeito', ['cable', 'link'], 'servidores', 'Cabo solto ou interface desligada.'),
    {
      id: 'bench', name: 'Organizar a bancada', verb: 'Organizando peças', kind: 'pc', skill: 'servidores', xp: 8, dur: [10, 16], auto: 1,
      desc: 'Inventário de peças de reposição e ferramentas.',
      finish: () => ({ say: pick(['Bancada organizada: 4 fontes, 2 ventoinhas e 1 switch reserva.', 'Pedi mais pasta térmica e cabos de força para o estoque.']) }),
    },
  ];
  // server technicians can also take hardware to the bench when there is no IT technician around
  T.servidores.push(T.tecnico[0]);

  // Front desk: an attendant (or an assistant set to attend in person) waits at the reception and
  // receives the visitors who walk in (staff.js runs the conversation). c.attend: 'pc' | 'desk' | 'both'.
  const attends = (c, how) => (c.attend || 'pc') === how || c.attend === 'both';
  const FRONTDESK = {
    id: 'frontdesk', name: 'Atender na recepção', verb: 'Na recepção, esperando clientes', kind: 'spot', skill: 'gestao', xp: 8, dur: [20, 34], auto: 4,
    desc: 'Fica no balcão da recepção e recebe os clientes que chegam.', none: 'Sem recepção (crie uma sala do tipo Recepção) ou atendimento presencial desligado',
    allow: (ctx) => attends(ctx.c, 'desk'),
    targets: (ctx) => (ctx.staff && attends(ctx.c, 'desk') ? [ctx.staff.frontPost(ctx.a)].filter(Boolean) : []),
    finish: () => (rand() < 0.25 ? { say: pick(['Recepção tranquila por enquanto.', 'Ninguém na fila. Aproveitei para organizar os crachás de visitante.', 'Balcão em ordem, esperando os próximos clientes.']) } : null),
  };
  const TICKETS = T.funcionario.find((d) => d.id === 'tickets');
  const PC_TICKETS = Object.assign({}, TICKETS, { allow: (ctx) => attends(ctx.c, 'pc'), none: 'Atendimento só presencial (mude no cartão)' });
  T.atendente = [
    FRONTDESK,
    Object.assign({}, PC_TICKETS, { auto: 3 }),
    {
      id: 'visitors', name: 'Registrar visitantes', verb: 'Registrando visitantes', kind: 'pc', skill: 'gestao', xp: 8, dur: [10, 16], auto: 1,
      desc: 'Atualiza o cadastro de clientes e visitantes no computador.',
      finish: () => ({ say: pick(['Cadastro de visitantes em dia.', 'Atualizei os contatos dos clientes que passaram hoje.']) }),
    },
    T.funcionario.find((d) => d.id === 'coffee'),
  ];
  // assistants can be set to attend in person too
  T.funcionario[0] = PC_TICKETS;
  T.funcionario.push(Object.assign({}, FRONTDESK, { auto: 3 }));
  // shared social moments (autonomous only): they still have a reason
  const SOCIAL = [
    {
      id: 'chat', name: 'Conversar', verb: 'Conversando', kind: 'visit', skill: 'gestao', xp: 4, dur: [4, 6], auto: 1, social: true,
      targets: (ctx) => ctx.members.filter((m) => m !== ctx.a && !m.crew.seated),
      finish: () => null,
    },
    // fetch something at the kitchen (coffee maker, espresso bar, water cooler, fridge, vending
    // machine, microwave… interact.js), carry it back to the own desk (or stay around), drink / eat
    // and go back to work (crew.js: toFetch → fetching → toSip → sipping)
    {
      id: 'break', name: 'Pausa na copa', verb: 'Pausa rápida', kind: 'drink', skill: 'gestao', xp: 2, dur: [7, 11], auto: 1, social: true,
      targets: (ctx) => offers(ctx, 'drink'),
      finish: (ctx) => (DL.Interact ? { say: DL.Interact.sayFor({ type: 'drink' }, ctx.c.lastCup || 'coffee') } : null),
    },
    // sit a little on a sofa, armchair, beanbag or pouf
    {
      id: 'rest', name: 'Descansar um pouco', verb: 'Descansando um pouco', kind: 'rest', skill: 'gestao', xp: 1, dur: [8, 13], auto: 0.7, social: true,
      targets: (ctx) => offers(ctx, 'rest', (e, a) => !a.chair),
      finish: () => (DL.Interact ? { say: DL.Interact.sayFor({ type: 'rest' }) } : null),
    },
    // a few minutes in front of the TV, or a round at the arcade
    {
      id: 'tv', name: 'Assistir TV', verb: 'Assistindo TV', kind: 'use', skill: 'gestao', xp: 1, dur: [8, 12], auto: 0.5, social: true,
      targets: (ctx) => offers(ctx, 'watch', (e) => DL.Interact.freeUse(e, ctx.a)),
      finish: () => (DL.Interact ? { say: DL.Interact.sayFor({ type: 'watch' }) } : null),
    },
    {
      id: 'arcade', name: 'Jogar fliperama', verb: 'Jogando fliperama', kind: 'use', skill: 'gestao', xp: 1, dur: [9, 13], auto: 0.4, social: true,
      targets: (ctx) => items(ctx, 'arcade').filter((e) => DL.Interact && DL.Interact.freeUse(e, ctx.a)),
      finish: () => (rand() < 0.4 ? { say: pick(['Recorde novo no fliperama 🕹️', 'Perdi na última fase. Revanche depois do turno!']) } : null),
    },
  ];
  // work tasks that use furniture: planning at a board, tests at a workbench
  const boards = (ctx) => offers(ctx, 'use', (e) => /board|kanban/.test(e.kind) && DL.Interact.freeUse(e, ctx.a));
  const benches = (ctx) => offers(ctx, 'use', (e, a) => a.bench && DL.Interact.freeUse(e, ctx.a));
  const BOARD_TASK = (id, name, verb, skill, lines) => ({
    id, name, verb, kind: 'use', skill, xp: 10, dur: [10, 15], auto: 1.2,
    desc: 'Usa um quadro branco, kanban ou painel de vidro.', none: 'Nenhum quadro livre (coloque um quadro branco ou kanban)',
    targets: boards, finish: () => ({ say: pick(lines) }),
  });
  T.gerente.push(BOARD_TASK('board', 'Planejar no quadro', 'Planejando no quadro', 'gestao', ['Atualizei o kanban: 3 tarefas em andamento, 2 prontas.', 'Desenhei o plano de expansão no quadro. Comentem!', 'Prioridades da semana no quadro ✔️']));
  T.redes.push(BOARD_TASK('topo', 'Desenhar a topologia', 'Desenhando a topologia', 'redes', ['Topologia atualizada no quadro: core, distribuição e acesso.', 'Anotei as VLANs no quadro para todo mundo ver.']));
  T.sysadmin.push(BOARD_TASK('runbook', 'Revisar procedimentos no quadro', 'Revisando procedimentos', 'sistemas', ['Passo a passo de reinício anotado no quadro.', 'Checklist de patch no quadro, sem desculpas agora.']));
  const BENCH_TASK = {
    id: 'benchtest', name: 'Testar peças na bancada', verb: 'Testando peças', kind: 'use', skill: 'servidores', xp: 10, dur: [10, 16], auto: 1.5,
    desc: 'Testa fontes, discos e memórias de reserva numa bancada.', none: 'Nenhuma bancada livre (bancada técnica, de laboratório ou de reparo)',
    targets: benches,
    finish: () => ({ say: pick(['Testei 2 fontes e 4 pentes de memória da reserva: tudo ok.', 'Um SSD da reserva estava com setores ruins. Descartei.', 'Bancada organizada e peças testadas 🔧']) }),
  };
  T.tecnico.push(BENCH_TASK);
  T.servidores.push(Object.assign({}, BENCH_TASK, { auto: 0.8 }));

  DL.JOBS = {
    BY_ROLE: T, SOCIAL, labelOf, FIX_NAME, devsOf, fixTask,
    // building blocks for player-made roles (roles.js)
    h: { items, racks, faults, servers, online, up, tempOf, num, pick },
  };

  /* ------------------------------------------------------------------ */
  /* Talk: small conversations and observations about the datacenter     */
  /* ------------------------------------------------------------------ */
  const PAIRS = [
    ['Bom dia! Muita coisa hoje?', 'Sempre tem. Mas está sob controle.'],
    ['Aprendi um comando novo: ss -tulpn.', 'Esse é ótimo para ver as portas abertas!'],
    ['Bora documentar isso antes que a gente esqueça?', 'Boa ideia, coloco na wiki depois.'],
    ['Quem está de plantão hoje à noite?', 'Acho que sou eu… de novo 😅'],
    ['Você viu como ficou o cabeamento novo?', 'Vi! Com patch panel fica outra coisa.'],
    ['Me lembra de trocar a senha do switch depois?', 'Anotado. E coloca no cofre de senhas.'],
    ['Esse barulho de ventoinha é normal?', 'É sim, o servidor está sob carga. Se mudar o tom, avisa.'],
    ['Alguém viu meu alicate de crimpar?', 'Está na estante, perto das caixas de cabo.'],
  ];

  // One line about something real right now (or null). Used for ambient chatter.
  function observe(ctx) {
    const out = [];
    const ops = ctx.ops;
    if (ops) {
      const srv = servers(ctx), on = online(ctx), pend = srv.filter((d) => d.state !== 'online');
      const open = ops.devices().filter((d) => d.fault && d.fault.found);
      if (on.length && !open.length) out.push(['Monitor todo verde por aqui 👌', null], [on.length + ' servidor(es) online e respondendo. Turno tranquilo.', null]);
      if (pend.length) out.push([pend.length + ' servidor(es) esperando cabo e configuração. ' + ctx.player + ', quer ajuda com isso?', 'Se precisar, eu ligo os cabos enquanto você configura.']);
      if (open.length) out.push(['Ainda temos ' + open.length + ' ocorrência(s) aberta(s). Bora fechar isso?', 'Estou de olho no ' + open[0].name + '.']);
    }
    const rs = items(ctx, 'rack');
    if (rs.length) {
      const hot = rs.slice().sort((a, b) => tempOf(b) - tempOf(a))[0];
      out.push(['Temperatura média dos racks: ' + num(rs.reduce((s, e) => s + tempOf(e), 0) / rs.length) + ' °C.', null]);
      if (tempOf(hot) > 27) out.push([hot.id + ' é o mais quente agora (' + num(tempOf(hot)) + ' °C).', 'Vou checar se tem placa cega faltando.']);
      const messy = rs.find((e) => e.cableLook === 'messy');
      if (messy) out.push(['Os cabos do ' + messy.id + ' estão uma bagunça…', 'Quando der eu organizo.']);
      const full = rs.find((e) => e.units && e.units.every(Boolean));
      if (full) out.push([full.id + ' está cheio. Próximo servidor vai em outro rack.', null]);
    } else out.push(['Ainda não temos nenhum rack. ' + ctx.player + ', quer começar pela sala de servidores?', null]);
    if (items(ctx, 'coffee').length) out.push(['Café fresquinho na copa ☕', 'Já estou indo!']);
    if (!out.length) return null;
    return pick(out);
  }

  /* ------------------------------------------------------------------ */
  /* Conversations between bots: short threads (2–4 lines) by topic —   */
  /* work, problems, coffee, routine, the room around them, shifts —    */
  /* gated by what is real right now and never repeated back to back.   */
  /* "[a|b|c]" picks one option; {A} {B} speaker names, {P} the player. */
  /* ------------------------------------------------------------------ */
  const CMDS = [
    ['ss -tulpn', 'Esse é ótimo para ver as portas abertas!'], ['journalctl -u nginx', 'Salva vidas quando o serviço cai sem motivo.'],
    ['ip -br a', 'Resumão das interfaces numa linha só. Amo.'], ['show mac address-table', 'Ajuda a achar em que porta está cada máquina.'],
    ['htop', 'Bem melhor que o top, né?'], ['df -h', 'Clássico pra caçar disco cheio.'], ['traceroute', 'Mostra onde o pacote se perde no caminho.'],
  ];
  const THREADS = [
    { id: 'cafe-convite', topic: 'cafe', when: (x) => x.coffee, lines: ['A:[Alguém quer café?|Vou pegar um café, alguém vai?|Bora um café rapidinho?]', 'B:[Opa, eu quero!|Traz um pra mim, por favor ☕|Agora não, mas valeu!|Só se for sem açúcar.]'] },
    { id: 'cafe-forte', topic: 'cafe', when: (x) => x.coffee, lines: ['A:[O café hoje tá|Esse café tá] [forte demais|aguado|perfeito] 😅', 'B:[Pelo menos acorda.|Melhor que nada!|Quem passou esse café merece um aumento.]'] },
    { id: 'agua', topic: 'cafe', when: (x) => x.water, lines: ['A:[Esse bebedouro salva|Água gelada é vida] [nesse calor|com esse barulho de rack].', 'B:[Verdade, tô indo encher a garrafa.|Hidratação em dia, chefe aprova.]'] },
    { id: 'bomdia', topic: 'rotina', when: (x) => x.hour >= 6 && x.hour < 11, lines: ['A:[Bom dia, {B}!|Dia, {B}!|E aí, {B}, bom dia!] [Dormiu bem?|Pronto(a) pra mais um turno?|Muita coisa hoje?]', 'B:[Bom dia! Mais ou menos, mas o café resolve.|Bom dia! Bora que hoje tem coisa.|Dia! Sempre tem, mas está sob controle.]'] },
    { id: 'almoco', topic: 'rotina', when: (x) => x.hour >= 11 && x.hour < 14, lines: ['A:[Já almoçou?|Bora almoçar daqui a pouco?|Alguém vai pedir comida?]', 'B:[Ainda não, assim que fechar essa tarefa eu vou.|Trouxe marmita hoje.|Pede pra mim também!]'] },
    { id: 'fimturno', topic: 'rotina', when: (x) => x.hour >= 17 && x.hour < 22, lines: ['A:[Quase fim do turno…|Mais um turno quase fechado.]', 'B:[Antes de sair, deixa tudo documentado.|Só falta passar o bastão pro pessoal da noite.|Ainda dá tempo de dar zebra 😅]'] },
    { id: 'madrugada', topic: 'turno', when: (x) => x.hour >= 22 || x.hour < 5, lines: ['A:[Plantão noturno é outro clima, né?|Madrugada silenciosa hoje.]', 'B:[Só o barulho das ventoinhas.|Silêncio é bom sinal no datacenter.|Contanto que nenhum alarme toque…]'] },
    { id: 'plantao', topic: 'turno', lines: ['A:[Quem tá de plantão hoje?|Quem cobre a noite hoje?]', 'B:{oncall}'] },
    { id: 'srv-ok', topic: 'trabalho', when: (x) => x.srv, lines: ['A:[O {srv} tá|Olhei o {srv}, tá] [redondinho|estável|respondendo liso].', 'B:[Ótimo, menos um pra se preocupar.|Boa! Deixa no monitor que eu fico de olho.|Show.]'] },
    { id: 'pendente', topic: 'trabalho', when: (x) => x.pend, lines: ['A:[Ainda tem servidor esperando cabo e configuração.|Tem máquina nova parada no rack, sem configurar.]', 'B:[{P} disse que ia configurar pelo terminal.|Se ninguém pegar, eu ligo os cabos.]'] },
    { id: 'falha', topic: 'problemas', when: (x) => x.fault, lines: ['A:[Você viu o problema no {fault}?|O {fault} deu ruim de novo?|Quem tá vendo o {fault}?]', 'B:[Vi sim, já tá nas Tarefas.|Tô de olho. Se precisar, eu ajudo.|{P} deve pegar pelo terminal.]', 'A:[Fechou, qualquer coisa me chama.|Beleza.|Se não resolverem logo, eu vou lá.]'] },
    { id: 'verde', topic: 'problemas', when: (x) => x.srv && !x.fault, lines: ['A:[Ufa, tudo verde de novo.|Monitor limpinho agora 👌|Nenhum alerta. Estranho até.]', 'B:[Que dure!|Nem fala alto senão quebra 😂|Bom trabalho, time.]'] },
    { id: 'quebrado', topic: 'problemas', when: (x) => x.broken, lines: ['A:[O {broken} ainda tá na bancada?|Alguém sabe do {broken}?]', 'B:[O técnico tá cuidando.|Fonte queimada, já já volta.|Tá no conserto, calma.]'] },
    { id: 'cmd', topic: 'aprendizado', lines: ['A:[Aprendi um comando novo: {cmd}.|Hoje descobri o {cmd}, muito útil.]', 'B:[{cmdwhy}|Me ensina depois?|Anota na wiki!]'] },
    { id: 'wiki', topic: 'trabalho', lines: ['A:[Bora documentar isso antes que a gente esqueça?|Atualizou a wiki?]', 'B:[Boa ideia, coloco na wiki depois.|Ainda não, faço no fim do turno.|Documentação é amor ao próximo.]'] },
    { id: 'senha', topic: 'trabalho', when: (x) => x.sw, lines: ['A:Me lembra de trocar a senha do switch depois?', 'B:[Anotado. E coloca no cofre de senhas.|Deixa comigo, eu cobro 😏]'] },
    { id: 'ruido', topic: 'ambiente', when: (x) => x.racks >= 3, lines: ['A:[Esse barulho das ventoinhas…|Hoje os racks estão barulhentos.]', 'B:[É o som do dinheiro entrando 😄|Protetor auricular resolve.|Sinal de carga, normal.]'] },
    { id: 'calor', topic: 'ambiente', when: (x) => x.hot, lines: ['A:[Tá quente perto do {hot}, hein.|O {hot} tá esquentando.]', 'B:[Vou ver se a refrigeração tá dando conta.|Talvez falte placa cega.|Melhor avisar {P}.]'] },
    { id: 'cabos', topic: 'ambiente', when: (x) => x.messy, lines: ['A:Os cabos do {messy} estão uma bagunça…', 'B:[Quando der eu organizo.|Parece macarrão 🍝|Isso atrapalha o fluxo de ar, viu.]'] },
    { id: 'pufe', topic: 'ambiente', when: (x) => x.beanbag, lines: ['A:[Quem colocou esse pufe aqui é um gênio.|Esse pufe é tentador demais.]', 'B:[Cuidado que ele derruba qualquer um no sono 😴|Cinco minutinhos ninguém percebe.]'] },
    { id: 'plantas', topic: 'ambiente', when: (x) => x.plant, lines: ['A:[Alguém regou as plantas?|As plantas da {room} tão bonitas.]', 'B:[Reguei ontem!|Dá até vontade de trabalhar.|Planta no datacenter é luxo.]'] },
    { id: 'falta', topic: 'ambiente', when: (x) => x.needy, lines: ['A:[O(a) {needy} reclamou que falta {need}.|Você viu que o(a) {needy} tá sem {need}?]', 'B:[Precisa falar com {P}.|É, assim não dá pra trabalhar direito.|Vou comentar na próxima reunião.]'] },
    { id: 'novato', topic: 'rotina', when: (x) => x.newbie, lines: ['A:[E aí, {B}, adaptando bem?|Tá gostando da equipe, {B}?]', 'B:[Tô sim! Muita coisa nova.|Aos poucos pego o jeito.]', 'A:[Qualquer dúvida, me chama.|Relaxa, no começo é assim mesmo.]'] },
    { id: 'recepcao', topic: 'trabalho', when: (x) => x.clients, lines: ['A:[Movimentada a recepção hoje.|Chegou cliente de novo na recepção.]', 'B:[Bom sinal: cliente é receita.|Tomara que seja contrato novo.]'] },
    { id: 'caixa', topic: 'trabalho', when: (x) => x.cash != null, lines: ['A:[Como tão as finanças?|O caixa tá como?]', 'B:{cash}'] },
    { id: 'piada', topic: 'humor', lines: ['A:[Já tentou desligar e ligar de novo?|Funciona na minha máquina 🤷|É DNS. Sempre é DNS.]', 'B:[Clássico!|Nunca falha 😂|Não começa…]'] },
    { id: 'fds', topic: 'rotina', lines: ['A:[Fim de semana vou desligar o celular.|Esse fds vou fazer churrasco.|Folga amanhã, finalmente.]', 'B:[Sorte sua! Eu tô de plantão.|Me chama!|Merecido.]'] },
    { id: 'patch', topic: 'trabalho', when: (x) => x.racks, lines: ['A:Você viu como ficou o cabeamento novo?', 'B:[Vi! Com patch panel fica outra coisa.|Ficou bonito, mas etiqueta tudo, hein.]'] },
    { id: 'alicate', topic: 'trabalho', lines: ['A:[Alguém viu meu alicate de crimpar?|Cadê a caixa de conectores RJ45?]', 'B:[Está na estante, perto das caixas de cabo.|Acho que ficou na bancada.]'] },
  ];
  const expand = (s) => s.replace(/\[([^\]]+)\]/g, (m, body) => pick(body.split('|')));
  const recentThreads = [];

  // What is true right now, from the speaker's point of view
  function facts(ctx, a, b) {
    const ops = ctx.ops, W = ctx.world;
    const x = { hour: ctx.hour != null ? ctx.hour : 9, A: a.crew.name, B: b ? b.crew.name : '', P: ctx.player };
    x.coffee = items(ctx, 'coffee').length > 0;
    x.water = items(ctx, 'water').length > 0;
    x.beanbag = items(ctx, 'beanbag').length > 0;
    x.plant = items(ctx, 'plant').length > 0;
    x.room = ctx.roomName || 'sala';
    const rs = items(ctx, 'rack');
    x.racks = rs.length;
    if (ops) {
      const on = online(ctx).filter((d) => up(ctx, d));
      if (on.length) x.srv = pick(on).name;
      x.pend = servers(ctx).some((d) => d.state !== 'online');
      const f = ops.devices().find((d) => d.fault && d.fault.found);
      if (f) x.fault = f.name;
      x.sw = ops.devices().some((d) => d.kind === 'switch');
    }
    if (ctx.staff) { const br = ctx.staff.broken()[0]; if (br) x.broken = br.label; x.clients = ctx.staff.clients && ctx.staff.clients.length > 0; }
    const hot = rs.slice().sort((p, q) => tempOf(q) - tempOf(p))[0];
    if (hot && tempOf(hot) > 27) x.hot = hot.id;
    const messy = rs.find((e) => e.cableLook === 'messy');
    if (messy) x.messy = messy.id;
    const needy = ctx.members.find((m) => m.crew.missing && m.crew.missing.length);
    if (needy) { x.needy = needy.crew.name; x.need = needy.crew.missing[0].short.toLowerCase(); }
    x.newbie = !!b && b.crew.stats.level <= 1 && b.crew.stats.done < 4;
    const oc = ctx.members.filter((m) => m.crew.oncall && m.crew.oncall.length);
    x.oncall = oc.length ? pick(['Acho que é o(a) ' + oc[0].crew.name + '.', oc.map((m) => m.crew.name).join(' e ') + ', pelo que vi nas Escalas.']) : pick(['Ninguém escalado… melhor ver isso nas Escalas.', 'Não tem plantonista definido, acho.']);
    const cmd = pick(CMDS);
    x.cmd = cmd[0]; x.cmdwhy = cmd[1];
    if (ctx.eco) {
      const cash = ctx.eco.company.cash;
      x.cash = cash < 0 ? 'No vermelho… precisamos de mais servidores no ar.' : cash < 30000 ? 'Apertado. Melhor não inventar compra agora.' : pick(['Tranquilo, dá pra crescer.', 'No azul! O pagamento sai certinho.', 'Bem, os servidores estão pagando as contas.']);
    }
    return x;
  }

  // A conversation between a (who starts) and b: [[0|1, text], …] or null
  function thread(ctx, a, b, topic) {
    if (!b) return null;
    const x = facts(ctx, a, b);
    const ok = THREADS.filter((t) => (!topic || t.topic === topic) && recentThreads.indexOf(t.id) < 0 && (!t.when || t.when(x)));
    if (!ok.length) return null;
    // real things in the room first: problems and the environment weigh more than small talk
    const w = (t) => (t.topic === 'problemas' ? 3 : t.topic === 'ambiente' ? 2 : t.topic === 'humor' ? 0.6 : 1);
    let k = rand() * ok.reduce((s, t) => s + w(t), 0), th = ok[ok.length - 1];
    for (const t of ok) { if ((k -= w(t)) <= 0) { th = t; break; } }
    recentThreads.push(th.id);
    if (recentThreads.length > 14) recentThreads.shift();
    return th.lines.map((l) => {
      const who = l[0] === 'A' ? 0 : 1;
      const txt = expand(l.slice(2)).replace(/\{(\w+)\}/g, (m, k2) => (x[k2] != null ? String(x[k2]) : m));
      return [who, expand(txt)];
    });
  }

  DL.TALK = { PAIRS, observe, pick, thread, facts };
})();
