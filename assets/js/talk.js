/* DataLab — talk: a one-to-one conversation with a crew member, as part of the gameplay.
   Answers come from rules over the real state: the person's role and level (what they know and
   how precisely they explain it), their current task, the problems found, the network, the
   company's money and what is missing to complete the datacenter. They can also act: go fix a
   problem, call a colleague who can, or point at it on the map. Important findings arrive on
   their own as a "wants to talk" notice. No external AI. */
(function () {
  'use strict';
  const DL = window.DL;
  const rand = Math.random;
  const pick = (a) => a[Math.floor(rand() * a.length)];
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const list = (names) => (names.length < 2 ? names.join('') : names.slice(0, -1).join(', ') + ' e ' + names[names.length - 1]);

  // precise diagnosis (someone who knows) vs a vague one (someone outside their area / beginner)
  const HINT = {
    link: (d) => 'A eth0 do ' + d.name + ' está DOWN. No terminal: ip link set eth0 up e teste com ping.',
    cable: (d) => 'O ' + d.name + ' está sem sinal no cabo (NO-CARRIER). Tem uma ponta solta: confira o Cabeamento do ' + d.rack.id + '.',
    port: (d) => 'A porta ' + String(d.sw.bad || '').replace('gi', 'Gi') + ' do ' + d.name + ' está err-disabled. No switch: conf t → interface ' + d.sw.bad + ' → shutdown → no shutdown.',
    service: (d) => 'O nginx parou no ' + d.name + '. systemctl status nginx mostra o erro; systemctl restart nginx resolve.',
    disk: (d) => 'O disco do ' + d.name + ' está 96% cheio. du -sh /var/log/* mostra o que ocupa; apague os logs antigos.',
  };
  const VAGUE = {
    link: (d) => 'O ' + d.name + ' perdeu a conexão. Pode ser configuração de rede, não tenho certeza.',
    cable: (d) => 'O ' + d.name + ' perdeu a conexão. Acho que devemos verificar os cabos.',
    port: (d) => 'Encontrei um problema no switch ' + d.name + '. Um dos servidores ligados nele ficou sem rede.',
    service: (d) => 'O site do ' + d.name + ' parou de responder, mas o servidor parece ligado.',
    disk: (d) => 'O ' + d.name + ' está estranho… acho que está sem espaço.',
  };
  const STATE = {
    link: 'ainda apresenta perda de conexão', cable: 'está sem sinal no cabo', port: 'está com uma porta em erro',
    service: 'está com o serviço web parado', disk: 'está com o disco quase cheio',
  };
  const AREA = { redes: ['cable', 'port', 'link'], servidores: ['disk', 'cable', 'link'], sysadmin: ['service', 'disk', 'link', 'winsvc', 'lockout'] };
  // Windows servers (winserver.js) have their own words for the same problems, plus their own faults
  const faultLine = (map, key, d, ty) => {
    const w = DL.WIN_TALK && DL.isWin && DL.isWin(d) && DL.WIN_TALK[key] && DL.WIN_TALK[key][ty];
    const v = w || map[ty] || (DL.WIN_TALK && DL.WIN_TALK[key] && DL.WIN_TALK[key][ty]);
    return typeof v === 'function' ? v(d) : v || '';
  };

  const QUICK = [
    ['servers', 'Como estão os servidores?'], ['problems', 'Tem algum problema?'], ['doing', 'O que você está fazendo?'],
    ['network', 'Como está a rede?'], ['money', 'Como estão as finanças?'], ['next', 'O que devo fazer agora?'],
    ['smalltalk', 'Tudo bem?'], ['workplace', 'Falta algo no seu posto?'], ['shift', 'Qual é o seu turno?'],
  ];

  // understanding of the text (slang, typos, intents) lives in talk-brain.js
  const B = DL.Brain;
  const norm = B.norm, detectFull = B.detectFull, detect = B.detect;

  DL.createTalk = function (game, sys) {
    const crew = sys.crew, ops = sys.ops, eco = sys.economy;
    const $ = (id) => document.getElementById(id);
    const el = { panel: $('talk'), face: $('talkFace'), name: $('talkName'), meta: $('talkMeta'), status: $('talkStatus'), log: $('talkLog'), chips: $('talkChips'), form: $('talkForm'), input: $('talkIn'), close: $('talkClose'), pings: $('talkPings') };
    const T = { a: null, wait: 0, acc: 0, statusKey: '', pings: new Map(), target: null, who: null, extra: null };
    const Q = { raw: '', clean: '' }; // the message being answered (raw / cleaned by talk-brain.js)
    const player = () => (crew.playerProfile ? crew.playerProfile.name : 'chefe');
    const alive = (a) => crew.members.indexOf(a) >= 0;

    /* ---------- what this person knows ---------- */
    function know(a) {
      const c = a.crew, st = c.stats, role = c.profile.role;
      const main = st.skills[DL.ROLE_SKILL[role]] || 0;
      return { role, level: st.level, k: st.level + main / 25, title: DL.ROLES[role].title, name: DL.ROLES[role].name, stars: DL.XP.starsOf(st, role) };
    }
    const expertOn = (a, type) => { const K = know(a), R = DL.ROLES[K.role]; return (AREA[K.role] || (R && R.detects) || []).indexOf(type) >= 0 || K.k >= 7; };
    // how much the crew gives away depends on the learning mode (difficulty.js):
    // Iniciante → exact commands + a step-by-step; Intermediário → exact commands; Experiente → where to look only
    const LOOK = { link: 'Comece olhando o estado das interfaces.', cable: 'Desconfie da camada física.', port: 'O problema está no switch, não no servidor.', service: 'O servidor está de pé; olhe os serviços.', disk: 'Olhe o uso de espaço.' };
    const STEPS = {
      link: '1) ip link para ver a eth0 · 2) sudo ip link set eth0 up · 3) ping -c 3 10.0.1.1 para testar.',
      cable: '1) ip link mostra NO-CARRIER · 2) Cabeamento do rack: o cabo laranja está solto · 3) ping para confirmar.',
      port: '1) enable · 2) sh int status (ache o err-disabled) · 3) conf t → interface da porta → shutdown → no shutdown · 4) end.',
      service: '1) systemctl status nginx · 2) sudo systemctl restart nginx · 3) curl localhost para confirmar.',
      disk: '1) df -h · 2) du -sh /var/log · 3) sudo journalctl --vacuum-size=200M · 4) df -h de novo.',
    };
    function diag(a, d) {
      const L = DL.learn ? DL.learn() : null, ty = d.fault.type;
      if (L && L.crewHints === 'vague') return faultLine(VAGUE, 'vague', d, ty) + ' ' + faultLine(LOOK, 'look', d, ty);
      const base = expertOn(a, ty) ? faultLine(HINT, 'hint', d, ty) : faultLine(VAGUE, 'vague', d, ty);
      return L && L.id === 'iniciante' ? base + ' Passo a passo: ' + faultLine(STEPS, 'steps', d, ty) : base;
    }
    // never the same line twice in a row for the same person and subject
    function vary(a, key, opts) {
      a.crew.said = a.crew.said || {};
      const last = a.crew.said[key];
      const pool = opts.filter((o) => o !== last);
      const o = pick(pool.length ? pool : opts);
      a.crew.said[key] = o;
      return o;
    }
    const found = () => ops.devices().filter((d) => d.fault && d.fault.found);
    const hidden = () => ops.devices().filter((d) => d.fault && !d.fault.found);
    const servers = () => ops.devices().filter((d) => d.kind === 'server');
    const fixerFor = (d) => crew.members.find((m) => !m.crew.off && crew.api.fixDefFor(m, d));
    const racks = () => game.scene.world.items.filter((e) => e.kind === 'rack' && e.units);
    const act = (label, id, ref) => ({ label, id, ref });

    // a chance to spot a problem nobody registered yet (better with level and skill)
    function discover(a) {
      const h = hidden();
      if (!h.length || rand() > 0.3 + know(a).k * 0.06) return null;
      ops.report(h[0], a, 'conversa');
      return h[0];
    }

    function problemActions(a, d) {
      const out = [act('Mostrar no mapa', 'where', d)];
      if (crew.api.fixDefFor(a, d)) out.push(act('Resolva para mim', 'fix', d));
      else if (fixerFor(d)) out.push(act('Chame quem resolve', 'call', d));
      if (d.kind === 'server' || d.kind === 'switch') out.push(act('Abrir terminal', 'term', d));
      return out;
    }

    /* ---------- answers ---------- */
    const A = {
      greet(a) {
        const f = found();
        return { text: vary(a, 'greet', ['Oi, ' + player() + '!', 'Opa, ' + player() + '!', 'Fala, ' + player() + '!', 'E aí, ' + player() + '!']) + ' ' + (f.length ? 'Que bom que veio: temos ' + f.length + ' ocorrência(s) aberta(s).' : vary(a, 'greet2', ['Por aqui está tudo tranquilo. Precisa de algo?', 'No que posso ajudar?', 'Tudo em ordem por aqui. Manda!'])) };
      },
      thanks: (a) => ({ text: vary(a, 'thanks', ['Por nada! Qualquer coisa, me chama.', 'Tamo junto!', 'Disponha. Volto ao trabalho então.', 'Imagina! É pra isso que estou aqui.']) }),
      // "tudo bem?", "de boa?", "como tá o turno?" — answered from how their day really is
      smalltalk(a) {
        const c = a.crew, f = found();
        if (c.missing && c.missing.length) return { text: vary(a, 'small', ['Mais ou menos, ' + player() + '… ', 'Tô levando, mas… ']) + DL.workGripe(c.missing[0].id, c.name, c.missing[0].where), tone: 'warn' };
        if (f.length) return { text: vary(a, 'small', ['Tudo, mas corrido: tem ocorrência aberta no ' + f[0].name + '.', 'De boa não dá pra dizer, o ' + f[0].name + ' está dando trabalho 😅']), tone: 'warn', actions: problemActions(a, f[0]) };
        const j = c.job;
        return { text: vary(a, 'small', ['Tudo ótimo! ' + (j ? 'Tô em "' + j.name.toLowerCase() + '".' : 'Turno tranquilo.') + ' E você?', 'De boa, ' + player() + '. Café em dia e monitor verde 👌', 'Tranquilo! ' + (c.stats.done ? 'Já fiz ' + c.stats.done + ' tarefa(s) hoje.' : 'Começando o dia ainda.'), 'Tudo certo por aqui, tá ligado. Precisa de algo?']) };
      },
      bye: (a) => ({ text: vary(a, 'bye', ['Até mais, ' + player() + '!', 'Falou! Qualquer coisa tô por aqui.', 'Tchau! Bom trabalho.']) }),
      confirm: (a) => ({ text: vary(a, 'confirm', ['Fechado!', 'Beleza, combinado.', 'Show, então é isso.', 'Certo! Volto pro que eu estava fazendo.']) }),
      joke: (a) => ({ text: vary(a, 'joke', ['Por que o servidor foi ao médico? Estava com muito cache 🤒', 'Existem 10 tipos de pessoas: as que entendem binário e as que não.', 'Funciona na minha máquina… então vamos mandar a minha máquina pro cliente 😂', 'É DNS. Nunca é DNS. Foi DNS.']) }),
      coffee(a) {
        const has = (k) => game.scene.world.items.some((e) => e.kind === k);
        if (!has('coffee') && !has('water')) return { text: vary(a, 'coffee', ['Bem que eu queria um café… mas não temos cafeteira nem bebedouro. Dá pra colocar no modo construção (B → Decoração).', 'Sem copa aqui, chefe. Uma cafeteira faria milagres pelo moral do time ☕']) };
        return { text: vary(a, 'coffee', ['Já tomei meu café, valeu! Faço pausas rápidas entre as tarefas.', 'Daqui a pouco passo na copa. Quer que eu traga um?', has('beanbag') ? 'Uma água e cinco minutos no pufe e eu volto novo(a) 😄' : 'Água gelada e volto pro batente!']) };
      },
      shift(a) {
        const c = a.crew, s = c.shift || { id: 'integral', start: 0, end: 24 };
        const lbl = DL.shiftLabel ? DL.shiftLabel(s) : 'integral';
        const oc = c.oncall && c.oncall.length ? ' Também fico de plantão na ' + c.oncall.map((t) => (DL.TURNOS.find((x) => x.id === t) || { label: t }).label).join(' e ') + '.' : '';
        return { text: (s.id === 'integral' ? 'Estou em turno integral, 24 h por aqui.' : 'Meu turno é ' + lbl + '.') + oc + ' Dá pra mudar em Equipe → Escalas.' };
      },
      salary(a) {
        const sal = DL.salaryOf ? DL.salaryOf(a) : 0, eco2 = eco;
        if (!DL.ECON.runningCosts) return { text: vary(a, 'salary', ['Salário? Aqui a contratação já foi paga, relaxa 😄', 'Tô bem pago, pode ficar tranquilo(a).', 'O que importa é colocar mais servidor no ar!']) };
        return { text: 'Ganho ' + DL.money(sal) + ' por mês' + (eco2 ? ', e o próximo pagamento sai em ' + eco2.payInText() + '.' : '.') + ' ' + vary(a, 'salary', ['Subindo de nível, o salário acompanha 😉', 'Tá justo pelo que eu faço.', 'Se eu passar de nível, conversamos sobre aumento!']) };
      },
      workplace(a) {
        const c = a.crew, needs = crew.api.needsOf(a), z = crew.api.zoneRoom(a);
        if (!needs.length) return { text: 'Meu trabalho é andando pelo prédio, não preciso de posto fixo.' };
        const miss = needs.filter((n) => !n.ok);
        if (miss.length) return { text: DL.workGripe(miss[0].id, c.name, miss[0].where || (z ? z.name : null)) + ' Preciso de: ' + list(miss.map((n) => n.label.toLowerCase())) + '.', tone: 'warn' };
        return { text: 'Meu posto ' + (z ? 'na ' + z.name + ' ' : '') + 'tem tudo o que preciso: ' + list(needs.map((n) => n.short.toLowerCase())) + '. 👍', tone: 'ok' };
      },
      servers(a) {
        const srv = servers();
        if (!srv.length) return { text: 'Ainda não temos nenhum servidor. Que tal instalar um num rack? (B → Equipamentos → Servidor)' };
        const K = know(a);
        const ok = srv.filter((d) => d.state === 'online' && !d.fault && ops.health(d).up);
        const bad = srv.filter((d) => d.fault && d.fault.found);
        const lost = srv.filter((d) => d.state === 'online' && !ops.health(d).up && !(d.fault && d.fault.found));
        const pend = srv.filter((d) => d.state !== 'online');
        const parts = [];
        if (ok.length) parts.push(ok.length <= 3 ? 'O' + (ok.length > 1 ? 's' : '') + ' ' + list(ok.map((d) => d.name)) + (ok.length > 1 ? ' estão' : ' está') + ' funcionando normalmente.' : ok.length + ' servidores estão funcionando normalmente.');
        for (const d of bad.slice(0, 2)) parts.push('O ' + d.name + ' ' + (faultLine(STATE, 'state', d, d.fault.type) || 'está com um problema') + '.');
        let spotted = null;
        if (lost.length && K.k >= 4) {
          spotted = lost[0];
          if (spotted.fault && !spotted.fault.found) ops.report(spotted, a, 'conversa');
          parts.push('O ' + spotted.name + ' não responde ao ping' + (spotted.fault ? ' — acabei de registrar nas Tarefas.' : '. Vale investigar.'));
        }
        if (pend.length) parts.push(list(pend.slice(0, 3).map((d) => d.name)) + (pend.length > 1 ? ' ainda precisam' : ' ainda precisa') + ' de cabo e configuração.');
        const d = bad[0] || (spotted && spotted.fault ? spotted : null);
        return { text: parts.join(' '), tone: bad.length || spotted ? 'warn' : 'ok', actions: d ? problemActions(a, d) : [] };
      },
      problems(a) {
        const K = know(a);
        const fresh = discover(a);
        const f = found();
        if (fresh) return { text: 'Deixa eu olhar… Achei! ' + diag(a, fresh) + ' Já registrei nas Tarefas.', tone: 'warn', actions: problemActions(a, fresh) };
        if (f.length) {
          const d = f[0];
          let t = diag(a, d);
          if (f.length > 1) t += ' E tem mais ' + (f.length - 1) + ' ocorrência(s) nas Tarefas (T).';
          if (!expertOn(a, d.fault.type) && fixerFor(d)) t += ' ' + fixerFor(d).crew.name + ' entende mais disso que eu.';
          return { text: t, tone: 'warn', actions: problemActions(a, d) };
        }
        const messy = racks().find((e) => e.cableLook === 'messy');
        if (messy) return { text: 'Nada quebrado, mas os cabos do ' + messy.id + ' estão bagunçados — atrapalha o ar e a manutenção. Dá para organizar no Cabeamento.', actions: [act('Mostrar no mapa', 'where', messy)] };
        const hot = racks().filter((e) => e.temp > 27.5)[0];
        if (hot) return { text: 'Nenhuma falha, mas o ' + hot.id + ' está quente (' + hot.temp.toFixed(1).replace('.', ',') + ' °C). Pode faltar refrigeração na sala.', actions: [act('Mostrar no mapa', 'where', hot)] };
        return { text: K.k >= 4 ? 'Não encontrei nenhum problema. Monitor todo verde 👌' : 'Até onde eu sei, está tudo bem. Mas ainda estou aprendendo a olhar tudo.', tone: 'ok' };
      },
      network(a) {
        const sws = ops.devices().filter((d) => d.kind === 'switch');
        if (!sws.length) return { text: 'Ainda não temos switch. Sem ele, os servidores não entram na rede — instale um no rack.' };
        const K = know(a), parts = [];
        const err = sws.filter((s) => ops.health(s).errPorts);
        const cable = found().filter((d) => d.fault.type === 'cable' || d.fault.type === 'link');
        const ports = sws.reduce((n, s) => n + (s.sw.linked ? s.sw.linked.size : 0), 0);
        parts.push(sws.length + ' switch(es) com ' + ports + ' porta(s) conectada(s).');
        for (const s of err) parts.push(K.role === 'redes' || K.k >= 6 ? HINT.port(s) : 'O ' + s.name + ' está com uma porta em erro.');
        for (const d of cable.slice(0, 2)) parts.push(diag(a, d));
        const messy = racks().find((e) => e.cableLook === 'messy');
        if (messy) parts.push('Os cabos do ' + messy.id + ' precisam de organização.');
        if (!err.length && !cable.length) parts.push(K.role === 'redes' ? 'Uplinks estáveis, sem erros de CRC. Rede saudável.' : 'Pela rede, tudo parece normal.');
        const d = err[0] || cable[0];
        return { text: parts.join(' '), tone: d ? 'warn' : 'ok', actions: d ? problemActions(a, d) : messy ? [act('Mostrar no mapa', 'where', messy)] : [] };
      },
      doing(a) {
        const c = a.crew, j = c.job, st = c.stats;
        let t;
        if (!j) t = 'Estava decidindo o que fazer quando você chamou.';
        else {
          const pct = j.total ? Math.round(Math.max(0, 1 - j.left / j.total) * 100) : 0;
          t = 'Estou em "' + j.name + '"' + (j.label ? ' (' + j.label + ')' : '') + (c.state === 'working' || c.state === 'inspecting' ? ', ' + pct + '% feito.' : ', indo para lá.') + (j.auto ? ' Ninguém pediu: é da minha rotina.' : ' Foi você que pediu!');
        }
        t += ' Hoje já fiz ' + st.done + ' tarefa(s), achei ' + st.found + ' problema(s) e resolvi ' + st.fixed + '.';
        return { text: t };
      },
      money(a) {
        if (!eco) return { text: 'Não tenho os números agora.' };
        const CO = eco.company, K = know(a);
        const flow = CO.revenue - (CO.energy || 0);
        const worst = CO.problems[0];
        let t = 'A empresa tem ' + DL.money(CO.cash) + '. ';
        if (K.role === 'gerente' || K.k >= 6) {
          t += 'Entram ' + DL.money(CO.revenue) + '/min dos servidores' + ': resultado de ' + (flow >= 0 ? '+' : '') + DL.money(flow) + '/min.';
          if (DL.ECON.runningCosts) t += ' A folha é de ' + DL.money(CO.payrollMonth || 0) + '/mês e sai em ' + eco.payInText() + (CO.cash < (CO.payrollMonth || 0) ? ' — o caixa ainda não cobre!' : '.');
        } else t += flow >= 0 ? 'Estamos no azul, ' + (flow >= 0 ? '+' : '') + DL.money(flow) + '/min.' : 'Estamos perdendo ' + DL.money(-flow) + '/min.';
        if (worst) t += ' O ' + worst.name + ' está com problema (' + worst.loss.label.toLowerCase() + ') e não rende enquanto não for resolvido.';
        else if (!CO.revenue) t += ' Cada servidor no ar rende dinheiro: precisamos colocar servidores online.';
        return { text: t, tone: worst ? 'warn' : flow >= 0 ? 'ok' : 'warn', actions: worst && worst.fault ? problemActions(a, worst) : [] };
      },
      next(a) {
        const f = found();
        if (f.length) { const d = f[0]; return { text: 'Resolva o ' + d.name + ' primeiro. ' + diag(a, d), tone: 'warn', actions: problemActions(a, d) }; }
        const srv = servers();
        const link = srv.find((d) => d.state === 'link');
        if (link) return { text: 'O ' + link.name + ' já tem cabo, falta configurar no terminal: Tarefas (T) → Abrir terminal. Ele passa a dar receita assim que ficar online.', actions: [act('Abrir terminal', 'term', link)] };
        const fresh = srv.find((d) => d.state === 'new');
        if (fresh) return { text: 'Ligue o cabo do ' + fresh.name + ' a um switch: Tarefas (T) → Ligar cabos.', actions: [act('Ligar cabos', 'cable', fresh)] };
        if (!racks().length) return { text: 'Comece por um rack: B → Equipamentos → Rack, dentro de uma sala.' };
        if (!ops.devices().some((d) => d.kind === 'switch')) return { text: 'Falta um switch no rack. Sem ele, nenhum servidor entra na rede.' };
        const messy = racks().find((e) => e.cableLook === 'messy');
        if (messy) return { text: 'Organize os cabos do ' + messy.id + ' (Cabeamento → Organizar cabos). Ajuda no fluxo de ar.', actions: [act('Mostrar no mapa', 'where', messy)] };
        if (eco) {
          const miss = eco.checklist().find((c) => !c.ok);
          if (miss && !game.scene.world.dcDone) return { text: 'Para concluir este datacenter falta: ' + miss.label.toLowerCase() + '. Cada datacenter concluído conta para a recompensa de Gold.' };
        }
        return { text: 'Está tudo em ordem! Que tal dar a cara da equipe para a sala? B → Estilo da sala.', tone: 'ok' };
      },
      temp(a) {
        const rs = racks();
        if (!rs.length) return { text: 'Sem racks, sem calor por enquanto.' };
        const avg = rs.reduce((s, e) => s + e.temp, 0) / rs.length, hot = rs.slice().sort((x, y) => y.temp - x.temp)[0];
        const crac = game.scene.world.items.some((e) => e.kind === 'crac');
        return { text: 'Média dos racks: ' + avg.toFixed(1).replace('.', ',') + ' °C. O mais quente é o ' + hot.id + ' (' + hot.temp.toFixed(1).replace('.', ',') + ' °C).' + (crac ? '' : ' Não temos ar de precisão — vale instalar um.'), tone: hot.temp > 27.5 ? 'warn' : 'ok' };
      },
      progress() {
        if (!eco) return { text: 'Não sei dizer.' };
        const n = eco.wallet.counters.datacenters || 0, m = DL.ECON.milestones[0];
        const miss = eco.checklist().filter((c) => !c.ok).map((c) => c.label.toLowerCase());
        return { text: 'Você já concluiu ' + n + ' datacenter(s); a próxima recompensa vem com ' + (Math.floor(n / m.every) + 1) * m.every + '. ' + (game.scene.world.dcDone ? 'Este aqui já está concluído ✓' : miss.length ? 'Neste aqui falta: ' + list(miss) + '.' : 'Este aqui está quase lá!') };
      },
      self(a) {
        const K = know(a), st = a.crew.stats;
        const sk = DL.SKILLS.find((s) => s[0] === DL.ROLE_SKILL[K.role]);
        const lv = K.level <= 2 ? 'Ainda estou aprendendo; às vezes preciso de ajuda.' : K.level <= 5 ? 'Já resolvo bastante coisa sozinho(a).' : 'Pode confiar: conheço esse datacenter de cor.';
        return { text: 'Sou ' + K.title.toLowerCase() + ', nível ' + K.level + ' ' + '★'.repeat(K.stars) + '. ' + sk[1] + ': ' + Math.round(st.skills[sk[0]]) + '. ' + lv };
      },
      fix(a) {
        const f = found();
        if (!f.length) return { text: 'Não tem nada para resolver agora. 👌' };
        const mine = f.find((d) => crew.api.fixDefFor(a, d));
        if (mine) return doFix(a, mine);
        const d = f[0], other = fixerFor(d);
        return { text: 'O ' + d.name + ' não é da minha área.' + (other ? ' ' + other.crew.name + ' (' + DL.ROLES[other.crew.profile.role].name + ') resolve isso.' : ' Ninguém da equipe sabe resolver — vai precisar ser você, pelo terminal.'), actions: problemActions(a, d) };
      },
      where(a) {
        const d = found()[0];
        if (!d) return { text: 'Nenhum problema para apontar agora.' };
        show(d);
        return { text: 'Ali no ' + d.rack.id + ' — destaquei no mapa.', actions: problemActions(a, d).filter((x) => x.id !== 'where') };
      },
      orders: () => ({ text: game.staff ? game.staff.ordersSummary() : 'Não temos ordens de serviço.' }),
      vms: () => ({ text: DL.infraSummary ? DL.infraSummary() : 'Ainda não temos virtualização.' }),
      /* ----- conversation (not about the datacenter) ----- */
      wait: (a) => ({ text: vary(a, 'wait', ['Tô aqui, ' + player() + '! Pode falar.', 'Presente! O que foi?', 'Opa, tô por aqui. Manda!']) }),
      sorry: (a) => ({ text: vary(a, 'sorry', ['De boa, ' + player() + ', sem estresse. 🤝', 'Tranquilo, já passou!', 'Relaxa, tá tudo certo entre nós.']) }),
      insult(a) {
        a.crew.sulk = 2; // the next couple of answers come out a bit cold
        return { text: vary(a, 'insult', ['Poxa, ' + player() + '… eu tô fazendo o meu melhor aqui. 😕', 'Isso doeu. Mas vamos focar no que importa: o datacenter.', 'Calma aí, chefe. Se eu errei, me fala o que foi e eu corrijo.']), tone: 'warn' };
      },
      compliment: (a) => ({ text: vary(a, 'compliment', ['Valeu, ' + player() + '! Isso motiva demais 😊', 'Ah, assim eu fico até sem graça! Obrigado(a).', 'Tamo junto! A equipe toda dá o sangue por esse datacenter.', 'Que bom ouvir isso! Bora manter o ritmo.']), tone: 'ok' }),
      laugh: (a) => ({ text: vary(a, 'laugh', ['kkkk 😄', 'Rs, essa foi boa.', 'Hahaha, é isso mesmo!', 'kkk pois é, né?']) }),
      isbot(a) {
        return { text: vary(a, 'isbot', ['Sou ' + DL.ROLES[a.crew.profile.role].title.toLowerCase() + ' do DataLab, funcionário(a) do seu datacenter! Se tô feito de pixel ou de carne, isso é segredo de RH 😏', 'Sou a ' + 'pessoa que mantém esses servidores vivos. O resto é detalhe!', 'Digamos que eu sou 100% pixel art e 100% dedicado(a) ao trabalho.']) };
      },
      who(a) {
        const K = know(a);
        return { text: 'Me chamo ' + a.crew.name + ', sou ' + K.title.toLowerCase() + ' (nível ' + K.level + '). ' + (DL.ROLES[K.role].desc || '') + ' Pode me perguntar sobre servidores, rede, problemas, finanças ou só bater papo.' };
      },
      personal(a) {
        const h = B.hash(a.crew.name), age = 21 + (h % 18), city = ['Recife', 'Curitiba', 'Belo Horizonte', 'Porto Alegre', 'Salvador', 'Goiânia', 'Fortaleza', 'Campinas'][h % 8];
        const pet = ['um gato chamado Ping', 'um cachorro chamado Root', 'uma tartaruga chamada Cache', 'nenhum, mas queria um'][(h >> 3) % 4];
        const q = Q.clean;
        if (/anos|idade/.test(q)) return { text: 'Tenho ' + age + ' anos. E você, ' + player() + '?' };
        if (/mora|vive|nasceu|de onde/.test(q)) return { text: 'Sou de ' + city + ', mas hoje minha casa é esse datacenter 😄' };
        if (/gato|cachorro|pet|filho|irma|familia/.test(q)) return { text: 'Pets? Tenho ' + pet + '. A família é pequena, mas me apoia nos plantões.' };
        if (/casad|solteir|namorad|esposa|marido/.test(q)) return { text: 'Casado(a) com o trabalho, por enquanto 😅' };
        return { text: 'Nas folgas eu ' + vary(a, 'hobby0', ['monto uns projetos de homelab', 'jogo um pouco e durmo bastante', 'saio pra caminhar e ouvir música', 'maratono série']) + '.' };
      },
      jobfeel(a) {
        const c = a.crew, f = found();
        if (c.missing && c.missing.length) return { text: 'Gosto daqui, mas… ' + DL.workGripe(c.missing[0].id, c.name, c.missing[0].where), tone: 'warn' };
        if (f.length) return { text: 'Gosto sim! Só tô um pouco sobrecarregado(a) com a ocorrência no ' + f[0].name + '. Resolvendo isso fica perfeito.', tone: 'warn' };
        return { text: vary(a, 'jobfeel', ['Gosto muito! A equipe é boa, o café tá em dia e os servidores estão no ar 😄', 'Tô feliz aqui, ' + player() + '. Dá pra ver o datacenter crescendo.', 'Sinceramente? Melhor lugar que já trabalhei.']), tone: 'ok' };
      },
      abilities: () => ({ text: 'Dá pra me perguntar: "como tão os servidores?", "tem algum problema?", "como tá a rede?", "e as finanças?", "o que devo fazer agora?", "o que você tá fazendo?", "qual seu turno?", sobre ordens de serviço e VMs. Também peço pra eu resolver um problema, mostrar no mapa, ou só bater papo: piada, futebol, música, café… Pode falar do seu jeito, com gíria e tudo.' }),
      feelUser(a) {
        const f = found();
        return { text: vary(a, 'feelUser', ['Poxa, ' + player() + ', força aí. Respira um pouco, bebe uma água. ' + (f.length ? 'Se quiser, eu cuido do ' + f[0].name + ' enquanto isso.' : 'Por aqui tá tudo sob controle.'), 'Eita, imagino. Pausa curta e volta com tudo, o datacenter aguenta uns minutos 😉', 'Entendo. Se eu puder tirar algo do seu prato, é só pedir.']), tone: 'ok', actions: f.length ? problemActions(a, f[0]) : [] };
      },
      feelBot(a) {
        const c = a.crew, f = found();
        if (/cansad|sono|exaust|sobrecarreg|estress/.test(Q.clean)) return { text: f.length ? 'Um pouco, com essa ocorrência aberta. Mas dou conta!' : vary(a, 'tired', ['Um pouquinho, mas nada que um café não resolva ☕', 'Tô bem, na verdade. Turno tranquilo.']) };
        if (c.missing && c.missing.length) return { text: 'Mais ou menos… ' + DL.workGripe(c.missing[0].id, c.name, c.missing[0].where), tone: 'warn' };
        return { text: vary(a, 'feelBot', ['Tô ótimo(a), obrigado por perguntar!', 'Bem demais! E você?', 'Na paz. Dia produtivo.']) };
      },
      bored: (a) => ({ text: 'Bora então! ' + (found().length ? 'Tem ocorrência aberta, dá pra resolver.' : 'Que tal ampliar o datacenter ou organizar os cabos? Ou eu te conto uma piada: ' + A.joke(a).text) }),
      time: () => ({ text: 'Agora são ' + (game.clock ? game.clock() : '--:--') + ' aqui no datacenter.' }),
      weather: (a) => ({ text: vary(a, 'weather', ['Não vejo o céu faz tempo… aqui dentro é sempre 22 °C e barulho de ventoinha 😄', 'Nem sei, o datacenter não tem janela. O ar de precisão manda no clima aqui.']) }),
      hobby(a) {
        const q = Q.clean, role = a.crew.profile.role;
        if (/futebol|flamengo|corinthians|palmeiras|santos|vasco|gremio|cruzeiro|botafogo|copa|brasileirao|torce|time do/.test(q)) return { text: vary(a, 'fut', ['Futebol? Só assisto se o link de streaming não cair kkk', 'Sou fã! Mas em dia de jogo o tráfego aqui dispara, hein.', 'Prefiro não falar de time que eu me estresso mais que com servidor fora do ar 😅']) };
        if (/musica|banda|cantor|cantora|spotify|playlist|show de/.test(q)) return { text: vary(a, 'mus', ['Trabalho melhor com uma playlist lo-fi no fone 🎧', 'Música boa e servidor verde, combinação perfeita.', 'Curto de tudo um pouco! Você tem algo pra indicar?']) };
        if (/filme|serie|netflix|anime|livro|ler/.test(q)) return { text: vary(a, 'fil', ['Maratonei uma série de hacker esses dias. Errou tudo de TI, mas foi divertido kkk', 'Filme bom é aquele em que o servidor não cai no final 😂', 'Tô sem tempo pra série, mas aceito dica!']) };
        if (/game|jogo|jogar|videogame|playstation|xbox|minecraft|fortnite|valorant|cs2|gta|lol/.test(q)) return { text: vary(a, 'gam', ['Jogo nas folgas! Só não gosto de lag, trabalho com rede, né 😅', 'Games são meu segundo hobby. O primeiro é montar rack.', 'Bora marcar uma partida depois do turno!']) };
        if (/academia|treino|corrida/.test(q)) return { text: 'Tento treinar, mas ficar sentado(a) em frente ao monitor não ajuda muito 😅' };
        if (/viagem|viajar|praia|ferias|fim de semana|final de semana|churrasco|festa|role/.test(q)) return { text: vary(a, 'fds', ['Fim de semana é sagrado, só atendo plantão se o servidor pegar fogo 🔥', 'Queria uma praia agora… mas o datacenter me chama 😄', 'Foi tranquilo! E o seu, ' + player() + '?']) };
        return { text: vary(a, 'hob', ['Boa! Gosto de bater papo sobre isso quando o turno permite.', 'Interessante! Conta mais.']) };
      },
      /* ----- follow-ups, read against the last thing we talked about ----- */
      yes(a) {
        const o = a.crew.ctx && a.crew.ctx.offer;
        if (T.a === a && o && o.ref && (o.id !== 'fix' || o.ref.fault)) { push(a, { from: 'bot', text: 'Beleza, deixa comigo!', tone: 'ok' }); runAction(a, o); a.crew.ctx.offer = null; return { silent: true }; }
        return { text: vary(a, 'yes', ['Certo! No que mais posso ajudar?', 'Fechado. Se precisar, é só chamar.']) };
      },
      no: (a) => ({ text: vary(a, 'no', ['Sem problemas, ' + player() + '. Qualquer coisa é só falar.', 'Beleza, fico de olho por aqui.', 'Tranquilo. Se mudar de ideia, me chama!']) }),
      why(a) {
        const f = found(), ctx = a.crew.ctx;
        if (f.length && (!ctx || /problem|fix|next|server|network|where|device/.test(ctx.intent))) return { text: 'Detalhando o ' + f[0].name + ': ' + faultLine(STEPS, 'steps', f[0], f[0].fault.type), tone: 'warn', actions: problemActions(a, f[0]) };
        if (ctx && ctx.intent && A[ctx.intent] && !/^(why|more|yes|no)$/.test(ctx.intent)) return { text: 'Resumindo de outro jeito: ' + A[ctx.intent](a).text };
        return { text: 'Do que você quer que eu explique? Posso detalhar servidores, rede, problemas ou finanças.' };
      },
      more(a) {
        const ctx = a.crew.ctx, f = found();
        if (ctx && ctx.intent === 'problems' && f.length > 1) return { text: 'O outro é o ' + f[1].name + ': ' + diag(a, f[1]), tone: 'warn', actions: problemActions(a, f[1]) };
        if (ctx && ctx.intent === 'servers') return A.network(a);
        if (ctx && ctx.intent === 'network') return A.problems(a);
        if (ctx && ctx.intent === 'money') return A.next(a);
        return A.next(a);
      },
      /* ----- a thing that was named in the message ----- */
      device(a) {
        const d = T.target;
        if (!d) return A.unknown(a);
        const h = ops.health(d), bits = [];
        if (d.fault && d.fault.found) bits.push(diag(a, d));
        else if (d.state === 'online' && h.up) bits.push('está online e respondendo normal');
        else if (d.state === 'online') bits.push('está sem responder ao ping, vale investigar');
        else bits.push('ainda não está no ar (precisa de cabo e configuração)');
        const txt = ((d.fault && d.fault.found ? '' : 'O ' + d.name + ' ') + bits.join('; ') + '.').replace(/\.{2,}$/, '.');
        return { text: txt, tone: d.fault && d.fault.found ? 'warn' : 'ok', actions: d.fault && d.fault.found ? problemActions(a, d) : [act('Mostrar no mapa', 'where', d)] };
      },
      person(a) {
        const m = T.who;
        if (!m || m === a) return A.self(a);
        return { text: m.crew.name + ' (' + DL.ROLES[m.crew.profile.role].title.toLowerCase() + '): ' + crew.statusOf(m) + '.' };
      },
      unknown(a) {
        const f = found(), q = /\?\s*$/.test(Q.raw);
        const hint = f.length ? 'Se for sobre o ' + f[0].name + ', pergunta "tem algum problema?".' : 'Posso falar de servidores, rede, finanças, turno… ou só bater papo.';
        if (Q.clean.length > 40) return { text: vary(a, 'unk-long', ['Falou bastante, hein! 😅 Não peguei tudo. Resume pra mim? ' + hint, 'Me perdi no meio, ' + player() + '. Tenta de novo mais curto. ' + hint]) };
        return { text: vary(a, 'unknown', q
          ? ['Boa pergunta… mas essa eu não sei responder. ' + hint, 'Hmm, não tenho essa resposta, ' + player() + '. ' + hint, 'Isso foge da minha área 😅 ' + hint]
          : ['Hmm, não entendi. ' + hint, 'Não peguei, ' + player() + ' 😅 Pergunta de outro jeito? ' + hint, 'Desculpa, não entendi. ' + hint]) };
      },
    };

    // the quick answer to a greeting that came with a real question
    const chitLine = (a) => vary(a, 'chit', ['Tudo certo! ', 'De boa! ', 'Tudo tranquilo, ' + player() + '. ', 'Opa, tudo bem! ']);

    function doFix(a, d) {
      const def = crew.api.fixDefFor(a, d);
      if (!def) return { text: 'Isso não é comigo.' };
      const why = crew.api.startJob(a, def, { auto: false, target: d });
      if (why) return { text: 'Queria, mas não dá: ' + why.toLowerCase() + '.' };
      return { text: pick(['Deixa comigo! Indo para o ' + d.rack.id + '.', 'Pode deixar, já vou resolver o ' + d.name + '.']), tone: 'ok' };
    }

    function show(e) {
      const r = e.rack || e;
      game.focus(r.px + 8, r.py);
      game.flash(r);
    }

    /* ---------- UI ---------- */
    function drawFace(a) {
      const cv = el.face, k = 2;
      cv.width = 16 * k;
      cv.height = 16 * k;
      const g = cv.getContext('2d');
      g.imageSmoothingEnabled = false;
      g.clearRect(0, 0, cv.width, cv.height);
      g.drawImage(a.sheet.down.idle, 3, 1, 16, 16, 0, 0, 16 * k, 16 * k);
    }

    function msgHtml(m, i) {
      let h = '<li class="tk__msg is-' + m.from + (m.tone ? ' is-' + m.tone : '') + '"><p>' + esc(m.text) + '</p>';
      if (m.actions && m.actions.length && !m.used) h += '<div class="tk__acts">' + m.actions.map((x, j) => '<button type="button" class="btn btn--sm" data-tk-act="' + i + ':' + j + '">' + esc(x.label) + '</button>').join('') + '</div>';
      return h + '</li>';
    }

    function renderLog() {
      const a = T.a;
      const msgs = a.crew.talk || [];
      el.log.innerHTML = msgs.map(msgHtml).join('') + (T.wait > 0 ? '<li class="tk__msg is-bot is-typing"><p><i></i><i></i><i></i></p></li>' : '');
      el.log.scrollTop = el.log.scrollHeight;
    }

    function renderChips() {
      const f = found();
      let h = QUICK.map(([id, l]) => '<button type="button" class="chip" data-tk-q="' + id + '">' + l + '</button>').join('');
      if (f.length) h += '<button type="button" class="chip is-warn" data-tk-q="fix">Pode resolver?</button><button type="button" class="chip" data-tk-q="where">Onde é?</button>';
      el.chips.innerHTML = h;
    }

    function renderHead() {
      const a = T.a, K = know(a), c = DL.ROLES[a.crew.profile.role].color;
      el.name.textContent = a.crew.name;
      el.meta.innerHTML = '<span style="color:' + c + '">' + esc(K.title) + '</span> · Nv ' + K.level + ' <span class="stars">' + '★'.repeat(K.stars) + '<i>' + '★'.repeat(5 - K.stars) + '</i></span>';
      drawFace(a);
      liveStatus();
    }

    function liveStatus() {
      if (!T.a) return;
      const s = crew.statusOf(T.a);
      if (s !== T.statusKey) { T.statusKey = s; el.status.textContent = s; }
    }

    function push(a, m) {
      a.crew.talk = a.crew.talk || [];
      // only the newest answer keeps its action buttons
      if (m.from === 'bot') for (const o of a.crew.talk) if (o.actions) o.used = true;
      a.crew.talk.push(m);
      if (a.crew.talk.length > 40) a.crew.talk.shift();
      if (T.a === a) renderLog();
      else if (m.from === 'bot') a.crew.unread = (a.crew.unread || 0) + 1;
    }

    function open(a) {
      if (!a || !alive(a)) return;
      T.a = a;
      a.crew.unread = 0;
      dismissPing(a);
      crew.select(a); // stops and looks at you
      el.panel.hidden = false;
      game.root.classList.add('is-talk');
      renderHead();
      if (!a.crew.talk || !a.crew.talk.length) push(a, Object.assign({ from: 'bot' }, A.greet(a)));
      renderLog();
      renderChips();
      setTimeout(() => el.input.focus({ preventScroll: true }), 50);
    }

    function close() {
      if (!T.a) return;
      const a = T.a;
      T.a = null;
      el.panel.hidden = true;
      game.root.classList.remove('is-talk');
      if (el.panel.contains(document.activeElement)) document.activeElement.blur();
      if (crew.selected === a) crew.select(null);
    }

    // what was named in the message: a server/switch by its name, or a colleague
    function entityIn(a, clean) {
      const bare = clean.replace(/[?!.,;]+/g, ' ').replace(/\s+/g, ' ');
      const has = (nm) => { const n = norm(nm); return n.length >= 3 && new RegExp('(^| )' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '( |$)').test(bare); };
      const d = ops.devices().find((x) => has(x.name) || (x.rack && has(x.rack.id)));
      if (d) return { dev: d };
      const m = crew.members.find((x) => x !== a && has(String(x.crew.name).split(' ')[0]));
      return m ? { who: m } : {};
    }
    // text → what to answer. `forced` is a quick-chip id (no guessing needed)
    function understand(a, text, forced) {
      Q.raw = text;
      const full = forced ? { intent: forced, chit: false, text: norm(text) } : detectFull(text);
      Q.clean = full.text || '';
      T.target = null; T.who = null; T.extra = null;
      if (!forced) {
        // "e aí?" after a real answer is "and then?", not a greeting
        if (full.intent === 'greet' && /^\s*e a[ií]\s*\?/i.test(text) && a.crew.ctx) full.intent = 'more';
        const e = entityIn(a, Q.clean);
        // "e o SRV-01?" / "como está a Ana?" — a named thing wins over a vague intent
        if (e.dev && /^(unknown|servers|network|problems|doing|where|more|confirm|smalltalk)$/.test(full.intent)) { full.intent = 'device'; T.target = e.dev; }
        else if (e.who && /^(unknown|doing|self|smalltalk|more|who|confirm)$/.test(full.intent)) { full.intent = 'person'; T.who = e.who; }
        else if (full.intent === 'more' && a.crew.ctx && a.crew.ctx.intent === 'device') { full.intent = 'problems'; }
        else if (/^(servers|network|problems|money|temp)$/.test(full.intent)) { const all = B.detectAll(text); if (all.length > 1) { full.intent = all[0]; T.extra = all[1]; } }
      }
      return full;
    }

    function ask(text, intent) {
      const a = T.a;
      if (!a || T.wait > 0) return;
      push(a, { from: 'me', text });
      game.emit('player-talk', text);
      T.wait = 0.5 + rand() * 0.5;
      const full = understand(a, text, intent);
      T.pending = full.intent;
      T.chit = full.chit;
      renderLog();
    }

    function answer() {
      const a = T.a;
      if (!a) return;
      const id = T.pending;
      let r;
      try { r = (A[id] || A.unknown)(a); } catch (err) { console.warn('talk', err); r = A.unknown(a); }
      if (r && r.silent) { renderChips(); return; }
      // "como estão os servidores e a rede?" → both answers in one message
      if (T.extra && r && r.text && A[T.extra]) {
        try { const r2 = A[T.extra](a); if (r2 && r2.text) r = Object.assign({}, r, { text: r.text + ' ' + r2.text, tone: r.tone === 'warn' || r2.tone === 'warn' ? 'warn' : r.tone || r2.tone, actions: (r.actions && r.actions.length ? r.actions : r2.actions) || [] }); } catch (err) { /* keep the first answer */ }
      }
      if (T.chit && r && r.text) r = Object.assign({}, r, { text: chitLine(a) + r.text });
      // offended a moment ago: a bit of coldness, then it passes
      if (a.crew.sulk > 0 && r && r.text && id !== 'insult' && id !== 'sorry' && id !== 'compliment') { a.crew.sulk--; r = Object.assign({}, r, { text: vary(a, 'sulk', ['Hmpf. ', 'Tá. ', '…bom. ']) + r.text }); }
      else if (id === 'sorry') a.crew.sulk = 0;
      // remember the subject, so "e aí?", "por quê?" and "sim" mean something
      if (!/^(why|more|yes|no|confirm|laugh|thanks|wait)$/.test(id)) a.crew.ctx = { intent: id, offer: r && r.actions && r.actions[0] || null };
      else if (a.crew.ctx && r && r.actions && r.actions.length) a.crew.ctx.offer = r.actions[0];
      push(a, Object.assign({ from: 'bot' }, r));
      renderChips();
    }

    function runAction(a, x) {
      const d = x.ref;
      if (x.id === 'where') { show(d); push(a, { from: 'bot', text: 'Destaquei o ' + (d.rack ? d.rack.id : d.id) + ' no mapa.' }); }
      else if (x.id === 'fix') push(a, Object.assign({ from: 'bot' }, d.fault ? doFix(a, d) : { text: 'Já foi resolvido. 👌' }));
      else if (x.id === 'call') {
        const m = d.fault && fixerFor(d);
        if (!m) { push(a, { from: 'bot', text: 'Ninguém disponível para isso agora.' }); return; }
        const why = crew.api.startJob(m, crew.api.fixDefFor(m, d), { auto: false, target: d });
        push(a, { from: 'bot', text: why ? m.crew.name + ' não consegue agora: ' + why.toLowerCase() + '.' : 'Chamei ' + m.crew.name + '. Já está indo para o ' + d.rack.id + '.' });
        if (!why && crew.chat) crew.chat.post(m, 'Indo resolver o ' + d.name + ' a pedido do ' + a.crew.name + '.');
      } else if (x.id === 'term') { close(); ops.openTerminal(d); }
      else if (x.id === 'cable') { close(); sys.cabling.open(d.rack, d); }
    }

    el.chips.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-tk-q]');
      if (!b) return;
      const q = b.dataset.tkQ, label = (QUICK.find((x) => x[0] === q) || [0, b.textContent])[1];
      ask(label, q);
      b.blur();
    });
    el.log.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-tk-act]');
      if (!b || !T.a) return;
      const [i, j] = b.dataset.tkAct.split(':').map(Number);
      const m = T.a.crew.talk[i];
      if (!m || !m.actions) return;
      m.used = true;
      push(T.a, { from: 'me', text: m.actions[j].label });
      runAction(T.a, m.actions[j]);
      renderLog();
    });
    el.form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const t = el.input.value.trim();
      if (!t) return;
      el.input.value = '';
      ask(t.slice(0, 160));
    });
    el.input.addEventListener('keydown', (ev) => {
      if (ev.code === 'Escape') { ev.preventDefault(); close(); }
      ev.stopPropagation();
    });
    el.close.addEventListener('click', close);
    el.panel.addEventListener('pointerdown', (ev) => ev.stopPropagation());

    /* ---------- they come to you ---------- */
    function ping(a, text, tone) {
      if (T.a === a) return;
      dismissPing(a);
      const n = document.createElement('div');
      n.className = 'talk-ping' + (tone === 'warn' ? ' is-warn' : '');
      const c = DL.ROLES[a.crew.profile.role].color;
      n.innerHTML = '<div class="talk-ping__head"><span class="cc__dot" style="background:' + c + '"></span><b>' + esc(a.crew.name) + '</b><span class="eyebrow-sm">quer falar com você</span></div><p>' + esc(text) + '</p>' +
        '<div class="talk-ping__acts"><button type="button" class="btn btn--sm btn--primary" data-ping="open">Conversar</button><button type="button" class="btn btn--sm" data-ping="later">Depois</button></div>';
      n.addEventListener('click', (ev) => {
        const b = ev.target.closest('[data-ping]');
        if (!b) return;
        if (b.dataset.ping === 'open') open(a);
        else dismissPing(a);
      });
      n.addEventListener('pointerdown', (ev) => ev.stopPropagation());
      el.pings.appendChild(n);
      T.pings.set(a, { n, left: 14 });
      while (el.pings.children.length > 2) { const first = el.pings.firstChild; for (const [k, v] of T.pings) if (v.n === first) T.pings.delete(k); first.remove(); }
    }
    function dismissPing(a) {
      const p = T.pings.get(a);
      if (p) { p.n.remove(); T.pings.delete(a); }
    }

    // a crew member found something important: it goes to their conversation and they call you
    game.on('fault', (info) => {
      const a = info.who && alive(info.who) ? info.who : null;
      if (!a || !info.d.fault) return;
      const d = info.d;
      const text = 'Encontrei um problema: ' + diag(a, d);
      push(a, { from: 'bot', text, tone: 'warn', actions: problemActions(a, d) });
      ping(a, text, 'warn');
    });

    function update(dt) {
      if (T.a && !alive(T.a)) close();
      if (T.wait > 0 && (T.wait -= dt) <= 0) { T.wait = 0; answer(); }
      for (const [a, p] of T.pings) if ((p.left -= dt) <= 0 || !alive(a)) dismissPing(a);
      T.acc += dt;
      if (T.acc > 0.5) {
        T.acc = 0;
        liveStatus();
      }
    }

    function key(ev) {
      if (T.a && ev.code === 'Escape') { close(); return true; }
      return false;
    }

    game.on('talk', open);
    return {
      open, close, ask, update, key, detect,
      get active() { return T.a; },
      answer: (a, intent, text) => {
        if (text) intent = understand(a, text, intent === 'unknown' ? null : intent).intent; else { Q.raw = ''; Q.clean = ''; T.target = null; T.who = null; T.extra = null; }
        const r = (A[intent] || A.unknown)(a);
        return text && detectFull(text).chit && r && r.text ? Object.assign({}, r, { text: chitLine(a) + r.text }) : r;
      },
    };
  };
})();
