/* DataLab — Central de Atendimento (help desk). Customers open tickets; the crew takes them according
   to role and skills, talks to the customer, investigates, solves or transfers to someone better
   suited (or to the player). The player watches every conversation live, joins in, takes tickets,
   receives them directly and transfers them. Rules only: each scenario has the lines, the skill it
   needs and the words that move the conversation forward when the player answers.
   A ticket about the website follows a real fault in the datacenter and closes when it is fixed. */
(function () {
  'use strict';
  const DL = window.DL;
  const rand = Math.random;
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const between = (a, b) => a + rand() * (b - a);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const KEY = 'datalab.helpdesk.v1';

  const STATUS = { waiting: 'Aguardando', active: 'Em atendimento', transferred: 'Transferido', resolved: 'Resolvido' };
  const SKILL_NAME = Object.fromEntries(DL.SKILLS);

  /* ------------------------------------------------------------------ */
  /* Scenarios                                                           */
  /*   diff 1 = first contact can solve · 2 = needs the right specialist */
  /*   ask/look/fix: what the staff says · detail: the customer's answer */
  /*   pAsk/pFix: words in the player's reply that move things forward  */
  /* ------------------------------------------------------------------ */
  const SCENARIOS = [
    {
      id: 'net', cat: 'Rede', skill: 'redes', diff: 2, subject: 'Sem acesso à internet',
      open: ['Meu computador perdeu acesso à internet.', 'Estou sem internet desde cedo, não abre nenhum site!'],
      ask: ['Vou verificar sua conexão.', 'Pode me dizer se o ícone de rede mostra algum alerta?'],
      detail: 'O ícone de rede está com um triângulo amarelo. O cabo está ligado.',
      look: ['Estou olhando o switch do seu andar…', 'Achei: a porta do seu ponto de rede está em erro (err-disabled).'],
      fix: 'Reativei a porta no switch e renovei seu IP. Pode testar agora?',
      fail: 'Seu computador não está pegando IP, mas não consegui achar a causa daqui.',
      done: ['Voltou! Muito obrigado.', 'Funcionando, valeu demais!'],
      pAsk: ['icone', 'luz', 'cabo', 'ipconfig', 'ip ', 'erro', 'mensagem', 'aviso', 'triangulo', 'conect'],
      pFix: ['renov', '/renew', 'porta', 'dhcp', 'reinici', 'reconect', 'switch', 'desliga e liga'],
      tips: ['Pode me dizer se o ícone de rede mostra algum alerta?', 'Rode ipconfig /renew para renovar seu IP, por favor.', 'Reativei sua porta no switch. Testa agora?'],
    },
    {
      id: 'wifi', cat: 'Rede', skill: 'redes', diff: 2, subject: 'Wi-Fi da sala de reunião caiu',
      open: ['O Wi-Fi da sala de reunião caiu bem na hora da apresentação!', 'Ninguém consegue conectar no Wi-Fi da sala 2.'],
      ask: ['Vou checar o access point da sala.', 'Aparece a rede na lista ou ela sumiu?'],
      detail: 'A rede aparece, mas fica "obtendo endereço IP" e não conecta.',
      look: ['O access point está ligado…', 'O escopo de DHCP da rede de convidados esgotou.'],
      fix: 'Aumentei o escopo de DHCP e reiniciei o access point. Tentem de novo, por favor.',
      fail: 'O access point responde, mas não consegui descobrir por que não entrega IP.',
      done: ['Conectou! A apresentação está salva 🙏', 'Todo mundo conectado, obrigado!'],
      pAsk: ['aparece', 'lista', 'rede', 'senha', 'mensagem', 'erro', 'obtendo'],
      pFix: ['dhcp', 'escopo', 'reinici', 'access point', 'roteador', ' ap '],
      tips: ['A rede aparece na lista ou some?', 'Vou ampliar o escopo de DHCP e reiniciar o access point.'],
    },
    {
      id: 'vpn', cat: 'Rede', skill: 'redes', diff: 2, subject: 'VPN não conecta',
      open: ['Estou em casa e a VPN não conecta de jeito nenhum.', 'A VPN dá erro de tempo esgotado.'],
      ask: ['Vou verificar o servidor de VPN.', 'Qual mensagem de erro aparece?'],
      detail: 'Aparece "Tempo limite da conexão esgotado (erro 809)".',
      look: ['O concentrador de VPN está ok…', 'A porta UDP 500 está sendo bloqueada no seu roteador de casa.'],
      fix: 'Troquei seu perfil para VPN por SSL (porta 443), que passa pelo seu roteador. Tenta de novo?',
      fail: 'Do nosso lado a VPN está de pé; o bloqueio parece ser no caminho até você.',
      done: ['Conectou! Valeu.', 'Agora foi, obrigado pela paciência!'],
      pAsk: ['erro', 'mensagem', 'codigo', 'internet', 'casa', 'roteador'],
      pFix: ['443', 'ssl', 'porta', 'perfil', 'udp', 'firewall'],
      tips: ['Qual mensagem de erro aparece?', 'Vou trocar seu perfil para VPN SSL na porta 443.'],
    },
    {
      id: 'email', cat: 'Sistemas', skill: 'sistemas', diff: 2, subject: 'Não recebo e-mails',
      open: ['Não estou recebendo e-mails desde ontem.', 'Meus e-mails pararam de chegar!'],
      ask: ['Vou olhar sua caixa no servidor de e-mail.', 'Você consegue enviar normalmente?'],
      detail: 'Consigo enviar, só não recebo. Apareceu um aviso de "caixa quase cheia" semana passada.',
      look: ['Encontrei sua caixa…', 'Ela atingiu a cota de 50 GB, por isso o servidor recusa as mensagens.'],
      fix: 'Arquivei os e-mails antigos e aumentei sua cota. As mensagens retidas vão chegar agora.',
      fail: 'O servidor de e-mail está ok, mas não achei o motivo pela sua conta.',
      done: ['Chegaram todos! Obrigada.', 'Perfeito, já recebi tudo.'],
      pAsk: ['enviar', 'envia', 'aviso', 'cheia', 'espaco', 'mensagem', 'erro'],
      pFix: ['cota', 'arquiv', 'espaco', 'limp', 'cheia', 'aument'],
      tips: ['Você consegue enviar e-mails normalmente?', 'Sua caixa está cheia: vou arquivar os antigos e aumentar a cota.'],
    },
    {
      id: 'slow', cat: 'Servidores', skill: 'servidores', diff: 2, subject: 'Sistema muito lento',
      open: ['O sistema financeiro está muito lento hoje.', 'Tudo no ERP está demorando minutos para abrir.'],
      ask: ['Vou verificar o servidor da aplicação.', 'Está lento para todo mundo ou só para você?'],
      detail: 'Para todo mundo do setor. Começou depois do almoço.',
      look: ['O servidor está com a CPU em 98%…', 'Um relatório agendado travou e está consumindo tudo.'],
      fix: 'Finalizei o processo travado e reagendei o relatório para a madrugada. Melhorou?',
      fail: 'O servidor está sobrecarregado, mas não consegui identificar o processo culpado.',
      done: ['Voou agora! Obrigado.', 'Voltou ao normal, valeu!'],
      pAsk: ['todo mundo', 'todos', 'so voce', 'quando', 'comecou', 'setor'],
      pFix: ['processo', 'cpu', 'reinici', 'finaliz', 'travad', 'relatorio', 'mat'],
      tips: ['Está lento para todo mundo ou só para você?', 'Encontrei um processo travado no servidor; vou finalizá-lo.'],
    },
    {
      id: 'password', cat: 'Acesso', skill: 'seguranca', diff: 1, subject: 'Senha bloqueada',
      open: ['Errei a senha várias vezes e minha conta bloqueou.', 'Esqueci minha senha e agora está bloqueado.'],
      ask: ['Vou te ajudar a desbloquear.', 'Para sua segurança: pode confirmar seu ramal ou matrícula?'],
      detail: 'Minha matrícula é 4471, ramal 2032.',
      look: ['Identidade confirmada.'],
      fix: 'Desbloqueei sua conta e enviei uma senha temporária por SMS. Troque no primeiro acesso.',
      fail: 'Não consegui confirmar sua identidade pelos dados do cadastro.',
      done: ['Entrei! Obrigado.', 'Consegui acessar, valeu.'],
      pAsk: ['matricula', 'ramal', 'confirm', 'identidade', 'cpf', 'nome'],
      pFix: ['desbloque', 'temporaria', 'reset', 'redefin', 'nova senha', 'sms'],
      tips: ['Pode confirmar sua matrícula ou ramal?', 'Desbloqueei sua conta e enviei uma senha temporária.'],
    },
    {
      id: 'printer', cat: 'Equipamentos', skill: 'gestao', diff: 1, subject: 'Impressora não imprime',
      open: ['A impressora do 2º andar não imprime nada.', 'Mando imprimir e fica na fila para sempre.'],
      ask: ['Vou dar uma olhada na fila de impressão.', 'O painel da impressora mostra algum erro?'],
      detail: 'O painel diz "Papel atolado — bandeja 2".',
      look: ['Vi a fila: 14 documentos presos.'],
      fix: 'Limpei a fila. Retire o papel atolado da bandeja 2 e a impressão volta. Quer que eu mande alguém?',
      fail: 'A fila está limpa, mas a impressora continua offline.',
      done: ['Imprimiu! Obrigada.', 'Tirei o papel e voltou, valeu!'],
      pAsk: ['painel', 'erro', 'luz', 'mensagem', 'fila', 'papel'],
      pFix: ['atolad', 'papel', 'fila', 'limp', 'bandeja', 'reinici'],
      tips: ['O painel da impressora mostra algum erro?', 'Limpei a fila; retire o papel atolado da bandeja 2.'],
    },
    {
      id: 'access', cat: 'Acesso', skill: 'seguranca', diff: 2, subject: 'Acesso a pasta compartilhada',
      open: ['Preciso de acesso à pasta do Financeiro para fechar o mês.', 'Aparece "acesso negado" na pasta de contratos.'],
      ask: ['Vou verificar as permissões.', 'Seu gestor aprovou esse acesso?'],
      detail: 'Sim, a Carla (gerente) aprovou por e-mail hoje cedo.',
      look: ['Aprovação encontrada no chamado.', 'Você não está no grupo FIN-LEITURA.'],
      fix: 'Te coloquei no grupo FIN-LEITURA. Faça logoff e login para valer.',
      fail: 'Não encontrei a aprovação do gestor; sem ela não posso liberar.',
      done: ['Abriu! Obrigado.', 'Acesso funcionando, valeu.'],
      pAsk: ['gestor', 'aprov', 'autoriz', 'chefe', 'gerente'],
      pFix: ['grupo', 'permiss', 'liber', 'logoff', 'adicion', 'incluí', 'inclui'],
      tips: ['Seu gestor aprovou esse acesso?', 'Adicionei você ao grupo FIN-LEITURA; faça logoff e login.'],
    },
    {
      id: 'pc', cat: 'Equipamentos', skill: 'sistemas', diff: 1, subject: 'Computador não liga',
      open: ['Meu computador não liga, a tela fica preta.', 'Apertei o botão e nada acontece no meu PC.'],
      ask: ['Vamos verificar juntos.', 'Alguma luz acende no gabinete ou no monitor?'],
      detail: 'O gabinete liga (luz azul), mas o monitor fica com a luz laranja.',
      look: ['Parece que o monitor não recebe sinal.'],
      fix: 'Confira o cabo de vídeo atrás do gabinete — deve ter soltado. Encaixe bem e teste.',
      fail: 'Pode ser a placa de vídeo; vou precisar de alguém no local.',
      done: ['Era o cabo! Funcionou, obrigado.', 'Voltou a imagem, valeu!'],
      pAsk: ['luz', 'acende', 'gabinete', 'monitor', 'barulho', 'tela'],
      pFix: ['cabo', 'hdmi', 'video', 'encaix', 'displayport', 'vga', 'tomada'],
      tips: ['Alguma luz acende no gabinete ou no monitor?', 'Confira o cabo de vídeo atrás do gabinete.'],
    },
  ];
  // the website ticket follows a real fault (see spawn)
  const SITE = {
    id: 'site', cat: 'Serviço', skill: 'sistemas', diff: 2, subject: 'Site fora do ar',
    open: ['Nosso site está fora do ar! Clientes estão ligando.', 'A loja online não abre, dá erro 502.'],
    ask: ['Vou verificar os servidores agora.'],
    detail: 'Desde uns minutos atrás. Aparece "502 Bad Gateway".',
    done: ['Voltou! Obrigado pela rapidez.', 'Site no ar de novo, valeu!'],
    pAsk: ['erro', 'quando', 'mensagem', 'codigo', '502'], pFix: [],
    tips: ['Qual erro aparece no navegador?', 'Encontramos o problema no servidor; a equipe já está corrigindo.'],
    okText: 'Acabei de testar: o site está respondendo normalmente. Pode atualizar a página?',
    back: (d) => 'O ' + d.name + ' voltou e o site respondeu ao teste. Pode verificar?',
  };
  // a locked-out account on the Windows domain (winserver.js) becomes the employee's own ticket
  const LOGIN = {
    id: 'login', cat: 'Contas', skill: 'sistemas', diff: 2, subject: 'Conta bloqueada no computador',
    open: ['Não consigo entrar no computador: diz que minha conta foi bloqueada!', 'Errei a senha umas vezes e agora a conta travou. Pode liberar?'],
    ask: ['Vou verificar sua conta no domínio.'],
    detail: 'Aparece "A conta referenciada está bloqueada e não pode ser usada".',
    done: ['Entrei! Obrigada.', 'Liberou, valeu! Vou anotar a senha direitinho.'],
    pAsk: ['senha', 'mensagem', 'erro', 'bloque', 'usuario', 'login'], pFix: [],
    tips: ['Qual mensagem aparece na tela de login?', 'Sua conta travou por senhas erradas; já estamos desbloqueando no AD.'],
    okText: 'Olhei no AD: sua conta não está bloqueada. Tenta de novo, com calma na senha?',
    back: () => 'Desbloqueei sua conta no AD (Unlock-ADAccount). Pode tentar entrar de novo?',
  };

  const NAMES = ['Ricardo Alves', 'Fernanda Souza', 'Paulo Mendes', 'Juliana Rocha', 'Marcos Lima', 'Aline Costa', 'Roberto Dias', 'Camila Nunes', 'Sérgio Prado', 'Larissa Melo', 'Tiago Freitas', 'Helena Barros', 'André Pires', 'Beatriz Lopes'];
  const COMPANIES = ['Padaria Pão Quente', 'Lima & Associados', 'Clínica Vida', 'Construtora Horizonte', 'Escola Saber', 'Mercado Bom Preço', 'Ótica Visão', 'Agência Pixel', 'Transportes Rota Sul', 'Hotel Mirante'];

  DL.createHelpdesk = function (game, sys) {
    const crew = sys.crew, scene = game.scene;
    const $ = (id) => document.getElementById(id);
    const el = { ov: $('helpdesk'), root: $('hdRoot'), btn: $('hdBtn'), badge: $('hdBadge') };
    const HD = {
      tickets: [], seq: 1000, spawnT: 18, open: false, sel: null, filter: 'open', avail: false,
      ver: 0, drawn: '', convKey: '', resolvedToday: 0, times: [],
      history: [],
    };
    try { HD.history = JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { HD.history = []; }
    const now = () => scene.t;
    const clock = () => game.clock();
    const bump = () => { HD.ver++; };
    const roleOf = (a) => DL.ROLES[a.crew.profile.role] || DL.ROLES.funcionario;
    const alive = (a) => a && crew.members.indexOf(a) >= 0;
    const playerName = () => (crew.playerProfile && crew.playerProfile.name) || 'Você';
    const skillOf = (a, sk) => (a.crew.stats.skills[sk] || 0);
    // first contact: roles whose work includes helping people / tickets
    const isFrontline = (a) => (DL.JOBS.BY_ROLE[a.crew.profile.role] || []).some((t) => t.id === 'tickets' || t.id === 'helpdesk');
    const ticketOf = (a) => HD.tickets.find((t) => t.status !== 'resolved' && t.who === a);
    // off duty (shifts.js) or attending only in person at the reception (c.attend 'desk'): not on the phone
    const free = (a) => alive(a) && !a.crew.hold && !a.crew.off && (a.crew.attend || 'pc') !== 'desk' && !(a.crew.job && !a.crew.job.auto && a.crew.job.def.id !== 'support') && !ticketOf(a) && !a.hidden;

    /* ---------- messages ---------- */
    function say(t, from, text, extra) {
      const m = Object.assign({ from, text, t: clock(), at: now() }, extra || {});
      if (from === 'staff' && extra && extra.a) { m.who = extra.a.crew.name; m.role = roleOf(extra.a).name; m.color = roleOf(extra.a).color; delete m.a; }
      if (from === 'player') { m.who = playerName(); m.role = 'Você'; m.color = '#ffffff'; }
      if (from === 'customer') { m.who = t.customer.name; }
      t.msgs.push(m);
      t.last = now();
      t.typing = null;
      bump();
      return m;
    }
    const sys0 = (t, text) => say(t, 'system', text);
    // schedule a line with a short "digitando…" first
    function later(t, delay, fn, typingWho) {
      t.queue.push({ at: now() + delay, fn });
      if (typingWho) { t.typing = typingWho; bump(); }
    }

    /* ---------- tickets ---------- */
    function spawn(force) {
      const open = HD.tickets.filter((t) => t.status !== 'resolved');
      if (!force && open.length >= 4) return null;
      let sc = null, dev = null;
      // a real outage becomes a customer complaint
      let who = null;
      if (game.ops && typeof force !== 'string' && !open.some((t) => t.sc.id === 'site')) {
        const d = game.ops.devices().find((x) => x.kind === 'server' && x.state === 'online' && x.fault && (x.fault.type === 'service' || x.fault.type === 'link' || x.fault.type === 'cable'));
        if (d && rand() < 0.7) { sc = SITE; dev = d; }
      }
      // the employee whose domain account is locked calls in (once per lockout)
      if (!sc && game.ops && typeof force !== 'string' && !open.some((t) => t.sc.id === 'login')) {
        const d = game.ops.devices().find((x) => x.fault && x.fault.type === 'lockout' && x.os && x.os.win);
        const u = d && Object.values(d.os.win.users).find((x) => x.locked);
        if (u) { sc = LOGIN; dev = d; who = u.name; }
      }
      if (!sc) {
        const used = new Set(open.map((t) => t.sc.id));
        const pool = SCENARIOS.filter((s) => !used.has(s.id));
        sc = typeof force === 'string' ? SCENARIOS.find((s) => s.id === force) || pick(pool) : pick(pool.length ? pool : SCENARIOS);
      }
      const t = {
        id: ++HD.seq, sc, dev, customer: { name: who || pick(NAMES), company: who ? 'Funcionário(a) · domínio' : pick(COMPANIES) },
        status: 'waiting', who: null, player: false, joined: false, msgs: [], queue: [], typing: null,
        created: now(), createdAt: clock(), step: 0, tries: 0, transfers: [], detailGiven: false, unhelpful: 0, confirmed: false, unread: 0,
        waitFix: !!dev, // the website ticket closes when the real fault is fixed, whoever handles it
      };
      say(t, 'customer', pick(sc.open));
      HD.tickets.unshift(t);
      if (HD.avail) assignPlayer(t, true);
      else game.toast('info', 'Novo atendimento #' + t.id, t.customer.name + ' · ' + sc.subject);
      game.sfx('ping');
      return t;
    }

    function setStatus(t, s) { t.status = s; bump(); }

    function assignBot(t, a, how) {
      t.who = a;
      t.player = false;
      t.step = 0;
      t.tries = 0;
      setStatus(t, 'active');
      if (how) sys0(t, how);
      // the bot goes to a workstation (support desks first) while on the call
      startCall(a, t);
      later(t, between(1.5, 3), () => botGreet(t), a);
    }

    function startCall(a, t) {
      const job = a.crew.job;
      if (job && !job.auto && job.def.id !== 'support') return;
      const def = { id: 'support', name: 'Atendimento #' + t.id, verb: 'Atendendo cliente', kind: 'pc', skill: t.sc.skill, xp: 14, dur: [240, 300], auto: 0, finish: () => null };
      const supportStation = (s) => s.key.setup === 'support' || (DL.roomTypeOf && game.scene.world.rooms && DL.roomTypeOf(game.scene.world.rooms[game.scene.world.roomAt[s.key.ty * game.scene.world.W + s.key.tx]]) === 'support');
      if (crew.api.startJob(a, Object.assign({}, def, { stationOk: supportStation }), { auto: true })) crew.api.startJob(a, def, { auto: true });
    }
    function endCall(a, solved) {
      if (!alive(a) || !a.crew.job || a.crew.job.def.id !== 'support') return;
      if (solved) a.crew.job.left = 0; // finishes normally: experience + skill
      else crew.api.cancelJob(a, true);
    }

    function assignPlayer(t, direct) {
      if (t.who && t.who !== 'player' && alive(t.who)) endCall(t.who, false);
      t.who = 'player';
      t.player = true;
      t.joined = true;
      t.queue = t.queue.filter((q) => q.keep);
      t.typing = null;
      setStatus(t, 'active');
      sys0(t, direct ? 'Atendimento direcionado para ' + playerName() + '.' : playerName() + ' assumiu o atendimento.');
      if (direct) game.toast('warn', 'Atendimento para você #' + t.id, t.customer.name + ' · ' + t.sc.subject + ' · H para abrir');
    }

    function transfer(t, to, reason) {
      const from = t.who;
      t.transfers.push({ from: from === 'player' ? playerName() : from ? from.crew.name : '—', to: to === 'player' ? playerName() : to.crew.name, t: clock(), reason: reason || '' });
      if (from && from !== 'player') endCall(from, false);
      t.queue = [];
      setStatus(t, 'transferred');
      if (to === 'player') {
        later(t, 1.2, () => assignPlayer(t, true));
        return;
      }
      sys0(t, 'Transferido para ' + to.crew.name + ' (' + roleOf(to).title + ').');
      if (game.chat && from && from !== 'player') game.chat.post(from, to.crew.name + ', te passei o atendimento #' + t.id + ' (' + t.sc.subject.toLowerCase() + ').');
      later(t, between(2, 3.5), () => assignBot(t, to), null);
    }

    function resolve(t, by) {
      if (t.status === 'resolved') return;
      setStatus(t, 'resolved');
      t.resolvedAt = clock();
      t.queue = [];
      t.typing = null;
      const mins = Math.max(1, Math.round(now() - t.created));
      HD.times.push(mins);
      HD.resolvedToday++;
      sys0(t, 'Atendimento resolvido' + (by ? ' por ' + by : '') + ' · ' + mins + ' min.');
      if (t.who && t.who !== 'player') endCall(t.who, true);
      if (game.economy) game.economy.earn('credits', t.player ? 10 : 4, 'Atendimento #' + t.id + ' resolvido');
      HD.history.unshift({ id: t.id, customer: t.customer, subject: t.sc.subject, cat: t.sc.cat, by: by || '', at: t.resolvedAt, mins, transfers: t.transfers.length, msgs: t.msgs.map((m) => ({ from: m.from, who: m.who || '', text: m.text, t: m.t })) });
      HD.history = HD.history.slice(0, 30);
      try { localStorage.setItem(KEY, JSON.stringify(HD.history)); } catch (e) { /* private mode */ }
      // resolved tickets leave the active list after a while
      t.queue.push({ at: now() + 60, fn: () => { HD.tickets = HD.tickets.filter((x) => x !== t); if (HD.sel === t) HD.sel = null; bump(); }, keep: true });
    }

    /* ---------- bot conversation ---------- */
    function chance(a, t) {
      const s = skillOf(a, t.sc.skill);
      let p = 0.12 + (s - 15) / 60;
      if (t.sc.diff === 1 && isFrontline(a)) p += 0.35;
      if (DL.ROLE_SKILL[a.crew.profile.role] === t.sc.skill) p += 0.15;
      return Math.max(0.08, Math.min(0.95, p + t.tries * 0.1));
    }

    function botGreet(t) {
      const a = t.who;
      if (!alive(a)) return requeue(t);
      say(t, 'staff', 'Olá, ' + t.customer.name.split(' ')[0] + '! Aqui é ' + a.crew.name + ' (' + roleOf(a).title + '). ' + t.sc.ask[0], { a });
      if (t.sc.ask[1] && !t.detailGiven) {
        later(t, between(2.5, 4), () => say(t, 'staff', t.sc.ask[1], { a }), a);
        later(t, between(6, 8), () => { t.detailGiven = true; say(t, 'customer', t.sc.detail); }, 'customer');
        later(t, between(10, 12), () => botInvestigate(t), a);
      } else later(t, between(4, 6), () => botInvestigate(t), a);
    }

    function botInvestigate(t) {
      const a = t.who;
      if (!alive(a) || t.status !== 'active') return;
      if (t.sc.id === 'site' || t.sc.id === 'login') return botSite(t);
      const steps = t.sc.look || [];
      if (steps.length > 1) say(t, 'staff', steps[0], { a });
      later(t, between(3, 5), () => {
        if (!alive(a) || t.who !== a) return;
        t.tries++;
        if (rand() < chance(a, t)) {
          if (steps.length) say(t, 'staff', steps[steps.length - 1], { a });
          later(t, between(2, 3.5), () => say(t, 'staff', t.sc.fix, { a }), a);
          later(t, between(7, 10), () => { say(t, 'customer', pick(t.sc.done)); later(t, 2.5, () => resolve(t, a.crew.name)); }, 'customer');
          return;
        }
        // couldn't solve: pass it to someone who knows more (or the player)
        say(t, 'staff', t.sc.fail, { a });
        const to = specialistFor(t, a);
        later(t, between(2, 3), () => {
          if (t.who !== a) return;
          if (to === 'player') { say(t, 'staff', 'Vou transferir este atendimento para ' + playerName() + ', que vai te ajudar.', { a }); transfer(t, 'player', 'sem especialista disponível'); }
          else if (to) { say(t, 'staff', 'Vou transferir este atendimento para o(a) ' + roleOf(to).title + ' ' + to.crew.name + '.', { a }); transfer(t, to, 'precisa de ' + SKILL_NAME[t.sc.skill].toLowerCase()); }
          else { say(t, 'staff', 'Só um instante, vou tentar outra abordagem.', { a }); later(t, 6, () => botInvestigate(t), a); }
        }, a);
      }, a);
    }

    // the website: report the real fault, wait for whoever fixes it
    function botSite(t) {
      const a = t.who, d = t.dev;
      if (!d || !d.fault) { say(t, 'staff', t.sc.okText, { a }); later(t, 6, () => { say(t, 'customer', pick(t.sc.done)); later(t, 2, () => resolve(t, a.crew.name)); }, 'customer'); return; }
      if (!d.fault.found && game.ops.report) game.ops.report(d, a, 'cliente');
      say(t, 'staff', 'Confirmado: o ' + d.name + ' está com problema (' + (DL.JOBS.FIX_NAME[d.fault.type] || d.fault.type) + '). Já está com a equipe técnica — te aviso assim que voltar.', { a });
      t.waitFix = true;
    }

    function specialistFor(t, a) {
      const mine = skillOf(a, t.sc.skill);
      const cands = crew.members.filter((m) => m !== a && free(m) && t.transfers.every((x) => x.to !== m.crew.name)).map((m) => [m, skillOf(m, t.sc.skill) + (DL.ROLE_SKILL[m.crew.profile.role] === t.sc.skill ? 15 : 0)]).sort((x, y) => y[1] - x[1]);
      if (cands.length && cands[0][1] > mine + 6) return cands[0][0];
      if (t.tries >= 2) return 'player';
      return null;
    }

    function requeue(t) {
      t.who = null;
      setStatus(t, 'waiting');
      sys0(t, 'O atendente saiu. Voltou para a fila.');
    }

    /* ---------- the player's replies ---------- */
    function playerSay(t, text) {
      text = String(text || '').trim().slice(0, 400);
      if (!text || t.status === 'resolved') return;
      if (!t.joined) { t.joined = true; sys0(t, playerName() + ' entrou na conversa.'); }
      say(t, 'player', text);
      // a bot still on the ticket lets the player lead
      if (!t.player && t.who && t.who !== 'player') { t.queue = []; t.typing = null; later(t, 2, () => say(t, 'staff', pick(['Pode seguir, ' + playerName() + '. Fico acompanhando.', 'Boa, ' + playerName() + '! Vou observando.']), { a: t.who }), t.who); t.player = true; }
      const n = norm(text);
      const has = (list) => list.some((w) => n.indexOf(norm(w)) >= 0);
      later(t, between(2.5, 4.5), () => {
        // tickets tied to a real fault only close when the fault is fixed (in the terminal or by the crew)
        if (t.sc.id === 'site' || t.sc.id === 'login') {
          if (!t.detailGiven && has(t.sc.pAsk)) { t.detailGiven = true; return say(t, 'customer', t.sc.detail); }
          const still = t.dev && t.dev.fault;
          if (t.sc.id === 'login') return say(t, 'customer', still ? 'Ainda aparece bloqueada aqui… (desbloqueie no AD: Unlock-ADAccount)' : 'Consegui entrar!');
          return say(t, 'customer', still ? 'Ok… ainda está fora. Me avisa quando voltar?' : 'Acabei de testar: voltou!');
        }
        if (has(t.sc.pFix) && (t.detailGiven || t.sc.diff === 1 || t.unhelpful >= 1)) {
          t.confirmed = true;
          say(t, 'customer', pick(t.sc.done));
          later(t, 5, () => { if (t.status !== 'resolved') resolve(t, playerName()); });
          return;
        }
        if (has(t.sc.pAsk) && !t.detailGiven) { t.detailGiven = true; return say(t, 'customer', t.sc.detail); }
        if (has(t.sc.pFix)) return say(t, 'customer', 'Tentei, mas não mudou… Quer que eu te diga o que aparece na tela?');
        t.unhelpful++;
        say(t, 'customer', pick(t.detailGiven ? ['Certo… e o que eu faço agora?', 'Ainda não funciona. Tem alguma ideia?'] : ['Não entendi bem. Quer que eu verifique alguma coisa?', 'Hm, e o que pode ser?']));
        bump();
      }, 'customer');
    }

    /* ---------- update ---------- */
    function update(dt) {
      if (!game.paused || !game.paused()) {
        HD.spawnT -= dt;
        // calmer pace: fewer tickets while a datacenter incident is open (director.js)
        if (HD.spawnT <= 0) { HD.spawnT = between(80, 140); if (!(game.director && game.director.busy && HD.tickets.filter((t) => t.status !== 'resolved').length >= 2)) spawn(); }
      }
      for (const t of HD.tickets) {
        for (const q of t.queue.slice()) if (now() >= q.at) { t.queue.splice(t.queue.indexOf(q), 1); q.fn(); }
        if (t.status === 'resolved') continue;
        if (t.who && t.who !== 'player' && !alive(t.who)) requeue(t);
        // the website ticket closes when the real fault is gone
        if (t.waitFix && t.dev && !t.dev.fault) {
          t.waitFix = false;
          const a = t.who !== 'player' && alive(t.who) ? t.who : null;
          if (a) say(t, 'staff', t.sc.back(t.dev), { a });
          else say(t, 'system', 'O ' + t.dev.name + ' voltou ao normal.');
          later(t, 6, () => { say(t, 'customer', pick(t.sc.done)); later(t, 2, () => resolve(t, a ? a.crew.name : playerName())); }, 'customer');
        }
      }
      // waiting tickets: the crew picks them up (frontline first, then whoever knows the subject)
      for (const t of HD.tickets) {
        if (t.status !== 'waiting' || t.queue.length) continue;
        if (now() - t.created < 2.5) continue;
        const cands = crew.members.filter(free);
        if (!cands.length) continue;
        const score = (a) => (isFrontline(a) ? 40 : 0) + skillOf(a, t.sc.skill) + (DL.ROLE_SKILL[a.crew.profile.role] === t.sc.skill ? 25 : 0);
        const a = cands.sort((x, y) => score(y) - score(x))[0];
        assignBot(t, a, a.crew.name + ' (' + roleOf(a).name + ') assumiu o atendimento.');
      }
      badge();
      if (HD.open) render();
    }

    function badge() {
      const n = HD.tickets.filter((t) => t.status === 'waiting' || (t.who === 'player' && t.status === 'active' && t.msgs.length && t.msgs[t.msgs.length - 1].from === 'customer')).length;
      if (el.badge) { el.badge.textContent = n; el.badge.hidden = !n; }
    }

    /* ------------------------------------------------------------------ */
    /* UI                                                                  */
    /* ------------------------------------------------------------------ */
    function shell() {
      el.root.innerHTML =
        '<header class="app__bar hd__bar"><span class="hd__logo"><i aria-hidden="true"></i>Central de <b>Atendimento</b></span>' +
        '<div class="hd__stats" id="hdStats"></div>' +
        '<label class="hd__avail"><input type="checkbox" id="hdAvail"><span>Receber atendimentos</span></label>' +
        '<button class="btn btn--sm" type="button" data-hd="spawn" title="Simular um novo atendimento">+ Cliente</button>' +
        '<button class="cc__x" type="button" data-hd="close" aria-label="Fechar">×</button></header>' +
        '<div class="hd__main"><aside class="hd__side"><nav class="hd__tabs" id="hdTabs"></nav><ul class="hd__list" id="hdList"></ul></aside>' +
        '<section class="hd__conv"><div class="hd__chead" id="hdCHead"></div><ol class="hd__msgs" id="hdMsgs" aria-live="polite"></ol>' +
        '<div class="hd__chips" id="hdChips"></div>' +
        '<form class="hd__composer" id="hdForm" autocomplete="off"><input class="input" id="hdIn" maxlength="400" placeholder="Escreva para o cliente…" aria-label="Mensagem"><button class="btn btn--sm btn--primary" type="submit">Enviar</button></form></section>' +
        '<aside class="hd__info" id="hdInfo"></aside></div>';
      $('hdAvail').checked = HD.avail;
    }

    const statusPill = (s) => '<span class="hd-st hd-st--' + s + '">' + STATUS[s] + '</span>';
    const whoName = (t) => (t.who === 'player' ? playerName() + ' (você)' : t.who ? t.who.crew.name : '—');
    const FILTERS = [['open', 'Abertos'], ['waiting', 'Aguardando'], ['active', 'Em atendimento'], ['transferred', 'Transferidos'], ['mine', 'Meus'], ['history', 'Histórico']];

    function listOf() {
      if (HD.filter === 'history') return null;
      return HD.tickets.filter((t) => (HD.filter === 'open' ? t.status !== 'resolved' : HD.filter === 'mine' ? t.who === 'player' : t.status === HD.filter));
    }

    function render() {
      if (!el.root.firstChild) shell();
      const key = HD.ver + ':' + HD.filter + ':' + (HD.sel ? HD.sel.id || HD.sel.hid : '') + ':' + Math.floor(now());
      if (key === HD.drawn) return;
      HD.drawn = key;
      const open = HD.tickets.filter((t) => t.status !== 'resolved');
      const avg = HD.times.length ? Math.round(HD.times.reduce((s, x) => s + x, 0) / HD.times.length) : 0;
      $('hdStats').innerHTML = [['waiting', 'aguardando'], ['active', 'em atendimento'], ['transferred', 'transferidos']].map(([s, l]) => '<span><b>' + open.filter((t) => t.status === s).length + '</b> ' + l + '</span>').join('') +
        '<span><b>' + HD.resolvedToday + '</b> resolvidos</span><span><b>' + (avg ? avg + ' min' : '—') + '</b> tempo médio</span>';
      $('hdTabs').innerHTML = FILTERS.map(([k, l]) => {
        const n = k === 'history' ? HD.history.length : k === 'open' ? open.length : k === 'mine' ? HD.tickets.filter((t) => t.who === 'player' && t.status !== 'resolved').length : HD.tickets.filter((t) => t.status === k).length;
        return '<button type="button" class="' + (HD.filter === k ? 'is-on' : '') + '" data-hd-f="' + k + '">' + l + ' <i>' + n + '</i></button>';
      }).join('');
      const list = listOf();
      if (list) {
        $('hdList').innerHTML = list.length ? list.map((t) => {
          const last = t.msgs[t.msgs.length - 1];
          return '<li><button type="button" class="hd-item' + (HD.sel === t ? ' is-on' : '') + (t.who === 'player' ? ' is-mine' : '') + '" data-hd-t="' + t.id + '"><span class="hd-item__top"><b>#' + t.id + ' · ' + esc(t.customer.name) + '</b>' + statusPill(t.status) + '</span>' +
            '<span class="hd-item__sub">' + esc(t.sc.subject) + '</span><span class="hd-item__last">' + (t.typing ? '<em>digitando…</em>' : esc((last.who ? last.who.split(' ')[0] + ': ' : '') + last.text)) + '</span>' +
            '<span class="hd-item__who">' + (t.who ? '<span class="cc__dot" style="background:' + (t.who === 'player' ? '#fff' : roleOf(t.who).color) + '"></span>' + esc(whoName(t)) : 'Na fila') + ' · ' + t.createdAt + '</span></button></li>';
        }).join('') : '<li class="hd-empty">Nenhum atendimento aqui.</li>';
      } else {
        $('hdList').innerHTML = HD.history.length ? HD.history.map((h) => '<li><button type="button" class="hd-item' + (HD.sel && HD.sel.hid === h.id ? ' is-on' : '') + '" data-hd-h="' + h.id + '"><span class="hd-item__top"><b>#' + h.id + ' · ' + esc(h.customer.name) + '</b>' + statusPill('resolved') + '</span><span class="hd-item__sub">' + esc(h.subject) + '</span><span class="hd-item__who">' + esc(h.by) + ' · ' + h.mins + ' min' + (h.transfers ? ' · ' + h.transfers + ' transf.' : '') + '</span></button></li>').join('') : '<li class="hd-empty">Os atendimentos resolvidos ficam aqui.</li>';
      }
      renderConv();
      renderInfo();
    }

    function renderConv() {
      const t = HD.sel;
      const head = $('hdCHead'), msgs = $('hdMsgs'), form = $('hdForm'), chips = $('hdChips');
      if (!t) {
        head.innerHTML = '';
        msgs.innerHTML = '<li class="hd-hint"><b>Selecione um atendimento</b>Acompanhe as conversas ao vivo, entre na conversa, assuma ou transfira. Marque <b>Receber atendimentos</b> para os novos chegarem direto para você.</li>';
        form.hidden = true; chips.innerHTML = '';
        HD.convKey = '';
        return;
      }
      const hist = !!t.hid;
      const m = hist ? t.msgs : t.msgs;
      const ck = (t.id || t.hid) + ':' + m.length + ':' + (t.typing ? 1 : 0) + ':' + (t.status || '');
      head.innerHTML = '<div><b>#' + (t.id || t.hid) + ' · ' + esc(hist ? t.subject : t.sc.subject) + '</b><span>' + esc(t.customer.name) + ' · ' + esc(t.customer.company) + '</span></div>' + statusPill(hist ? 'resolved' : t.status);
      if (ck !== HD.convKey) {
        HD.convKey = ck;
        msgs.innerHTML = m.map((x) => {
          if (x.from === 'system') return '<li class="hd-sys">' + esc(x.text) + '<i>' + x.t + '</i></li>';
          const mine = x.from === 'player', cust = x.from === 'customer';
          return '<li class="hd-msg ' + (cust ? 'is-cust' : mine ? 'is-me' : 'is-staff') + '"' + (x.color ? ' style="--c:' + x.color + '"' : '') + '><span class="hd-msg__who">' + esc(x.who || '') + (x.role && !cust ? ' <em>' + esc(x.role) + '</em>' : '') + '<i>' + x.t + '</i></span><p>' + esc(x.text) + '</p></li>';
        }).join('') + (t.typing ? '<li class="hd-typing ' + (t.typing === 'customer' ? 'is-cust' : 'is-staff') + '"><span>' + esc(t.typing === 'customer' ? t.customer.name.split(' ')[0] : t.typing.crew ? t.typing.crew.name : '') + ' está digitando</span><i></i><i></i><i></i></li>' : '');
        msgs.scrollTop = msgs.scrollHeight;
      }
      const canWrite = !hist && t.status !== 'resolved';
      form.hidden = !canWrite;
      $('hdIn').placeholder = t.who === 'player' ? 'Responda ao cliente…' : 'Entrar na conversa e responder…';
      const tipsKey = canWrite ? t.id + ':' + t.unhelpful + ':' + t.detailGiven : '';
      if (chips.dataset.k !== tipsKey) {
        chips.dataset.k = tipsKey;
        chips.innerHTML = canWrite ? '<span class="eyebrow-sm">Sugestões</span>' + t.sc.tips.map((x, i) => '<button type="button" class="chip chip--xs' + (t.unhelpful >= 2 && i === t.sc.tips.length - 1 ? ' is-glow' : '') + '" data-hd-tip="' + i + '">' + esc(x) + '</button>').join('') : '';
      }
    }

    function renderInfo() {
      const t = HD.sel, box = $('hdInfo');
      if (!t) { box.innerHTML = '<p class="hd-muted">Os bots assumem os atendimentos da fila conforme o cargo e as habilidades: primeiro quem atende (Assistente ou cargos com suporte), depois o especialista do assunto.</p>'; return; }
      if (t.hid) {
        box.innerHTML = '<span class="eyebrow-sm">Histórico</span><dl class="hd-dl"><dt>Cliente</dt><dd>' + esc(t.customer.name) + '<small>' + esc(t.customer.company) + '</small></dd><dt>Assunto</dt><dd>' + esc(t.subject) + '<small>' + esc(t.cat) + '</small></dd><dt>Resolvido por</dt><dd>' + esc(t.by) + '<small>' + t.at + ' · ' + t.mins + ' min</small></dd><dt>Transferências</dt><dd>' + t.transfers + '</dd></dl>';
        return;
      }
      const me = t.who === 'player', done = t.status === 'resolved';
      let h = '<span class="eyebrow-sm">Cliente</span><p class="hd-cust"><b>' + esc(t.customer.name) + '</b><span>' + esc(t.customer.company) + '</span></p>';
      h += '<dl class="hd-dl"><dt>Assunto</dt><dd>' + esc(t.sc.subject) + '<small>' + esc(t.sc.cat) + ' · pede ' + SKILL_NAME[t.sc.skill].toLowerCase() + '</small></dd>' +
        '<dt>Status</dt><dd>' + statusPill(t.status) + '</dd><dt>Responsável</dt><dd>' + esc(whoName(t)) + (t.who && t.who !== 'player' ? '<small>' + esc(roleOf(t.who).title) + ' · ' + SKILL_NAME[t.sc.skill] + ' ' + Math.round(skillOf(t.who, t.sc.skill)) + '</small>' : '') + '</dd>' +
        (t.dev ? '<dt>Equipamento</dt><dd>' + esc(t.dev.name) + '<small>' + (t.dev.fault ? 'com problema' : 'normal') + '</small></dd>' : '') + '</dl>';
      if (!done) {
        h += '<div class="hd-acts">';
        if (!me) h += '<button type="button" class="btn btn--sm btn--primary" data-hd="take">Assumir atendimento</button>';
        if (me) h += '<button type="button" class="btn btn--sm btn--primary" data-hd="resolve">Marcar como resolvido</button><button type="button" class="btn btn--sm" data-hd="back">Devolver para a equipe</button>';
        h += '</div><span class="eyebrow-sm">Transferir para</span><ul class="hd-to">' + crew.members.filter((a) => a !== t.who).map((a) => {
          const busy = !!ticketOf(a);
          return '<li><button type="button" data-hd-to="' + a.crew.id + '"' + (busy ? ' title="Já está em outro atendimento"' : '') + '><span class="cc__dot" style="background:' + roleOf(a).color + '"></span><b>' + esc(a.crew.name) + '</b><span>' + esc(roleOf(a).name) + ' · ' + SKILL_NAME[t.sc.skill] + ' ' + Math.round(skillOf(a, t.sc.skill)) + (busy ? ' · ocupado' : '') + '</span></button></li>';
        }).join('') + (me ? '' : '<li><button type="button" data-hd-to="player"><span class="cc__dot" style="background:#fff"></span><b>' + esc(playerName()) + '</b><span>você</span></button></li>') + '</ul>';
      }
      if (t.transfers.length) h += '<span class="eyebrow-sm">Transferências</span><ol class="hd-tl">' + t.transfers.map((x) => '<li>' + esc(x.from) + ' → ' + esc(x.to) + '<small>' + x.t + (x.reason ? ' · ' + esc(x.reason) : '') + '</small></li>').join('') + '</ol>';
      box.innerHTML = h;
    }

    function open(id) {
      HD.open = true;
      if (id) { HD.sel = HD.tickets.find((t) => t.id === id) || HD.sel; HD.filter = 'open'; }
      if (!HD.sel) HD.sel = HD.tickets.find((t) => t.who === 'player' && t.status !== 'resolved') || HD.tickets.find((t) => t.status !== 'resolved') || null;
      el.ov.classList.add('is-open');
      HD.drawn = ''; HD.convKey = '';
      render();
      game.keysReset && game.keysReset();
    }
    function close() {
      HD.open = false;
      el.ov.classList.remove('is-open');
      if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    }

    el.ov.addEventListener('click', (ev) => {
      const b = ev.target.closest('button');
      if (ev.target === el.ov) return close();
      if (!b) return;
      const t = HD.sel && !HD.sel.hid ? HD.sel : null;
      if (b.dataset.hd === 'close') return close();
      if (b.dataset.hd === 'spawn') { const n = spawn(true); if (n) HD.sel = n; HD.filter = 'open'; return render(); }
      if (b.dataset.hdF) { HD.filter = b.dataset.hdF; return render(); }
      if (b.dataset.hdT) { HD.sel = HD.tickets.find((x) => x.id === +b.dataset.hdT) || null; HD.convKey = ''; return render(); }
      if (b.dataset.hdH) { const h = HD.history.find((x) => x.id === +b.dataset.hdH); HD.sel = h ? Object.assign({ hid: h.id }, h) : null; HD.convKey = ''; return render(); }
      if (!t) return;
      if (b.dataset.hd === 'take') { assignPlayer(t, false); return render(); }
      if (b.dataset.hd === 'resolve') { resolve(t, playerName()); return render(); }
      if (b.dataset.hd === 'back') { t.who = null; t.player = false; setStatus(t, 'waiting'); sys0(t, playerName() + ' devolveu o atendimento para a fila da equipe.'); return render(); }
      if (b.dataset.hdTo) {
        const to = b.dataset.hdTo === 'player' ? 'player' : crew.members.find((a) => a.crew.id === +b.dataset.hdTo);
        if (!to) return;
        if (t.who === 'player') sys0(t, playerName() + ' transferiu o atendimento.');
        transfer(t, to, 'transferido por ' + playerName());
        return render();
      }
      if (b.dataset.hdTip) { const inp = $('hdIn'); inp.value = t.sc.tips[+b.dataset.hdTip]; inp.focus(); }
    });
    el.ov.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const inp = $('hdIn'), t = HD.sel;
      if (!t || t.hid || !inp.value.trim()) return;
      playerSay(t, inp.value);
      inp.value = '';
      render();
    });
    el.ov.addEventListener('change', (ev) => {
      if (ev.target.id !== 'hdAvail') return;
      HD.avail = ev.target.checked;
      game.toast('info', 'Central de Atendimento', HD.avail ? 'Novos atendimentos vão direto para você' : 'A equipe volta a receber os novos atendimentos');
    });
    // the app owns the keyboard while open
    addEventListener('keydown', (ev) => {
      if (HD.open) {
        ev.stopImmediatePropagation();
        if (ev.code === 'Escape') { ev.preventDefault(); close(); }
        return;
      }
      const tag = document.activeElement && document.activeElement.tagName;
      if (ev.code === 'KeyH' && !ev.repeat && !ev.metaKey && !ev.ctrlKey && tag !== 'INPUT' && tag !== 'TEXTAREA' && game.canHotkey && game.canHotkey()) { ev.preventDefault(); ev.stopImmediatePropagation(); open(); }
    }, true);
    if (el.btn) el.btn.addEventListener('click', () => { el.btn.blur(); open(); });

    return {
      update, open, close,
      get isOpen() { return HD.open; },
      get tickets() { return HD.tickets; },
      get history() { return HD.history; },
      // exposed for automated checks
      api: { spawn, playerSay, assignPlayer, assignBot, transfer, resolve, setAvail: (v) => { HD.avail = !!v; }, SCENARIOS },
    };
  };
})();
