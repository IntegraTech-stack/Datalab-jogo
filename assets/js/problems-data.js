/* DataLab — scenario data: the terminal lessons and the career problems, written in the same shape the
   database will hold them (one object per row; steps, checks and answers are plain JSON, never code).
   problems.js compiles them. Templates ({{dev.ip}}, {{gw}}, {{port}}) are filled when a lesson opens,
   with the device it opened on, so names and addresses always match the player's own save.

   check — what makes a step done (problems.js PROBES lists every state it can read):
     { ran: 'ping-ok:{{gw}}' }                  an event the terminal reported (see terminal.js ran.push)
     { state: 'eth0.up' }                       a device state is truthy
     { state: 'route', eq: '{{gw}}' }           … equals / ne / lt / gt / in / notIn a value
     { state: 'sw.port', arg: '{{port}}', eq: 'disabled' }   states that need an argument
     { any: [...] } · { all: [...] } · { not: {...} }
   type: 'answer' — the step is a question: the player answers in the side panel (or "responder <valor>")
     answer: { accept: ['{{dev.ip}}'], normalize: 'ip' | 'port' | 'int' | 'text', tol: 1 }
   vars — values read once (a lesson: when it opens · a problem: when it starts), then fixed */
(function () {
  'use strict';
  const DL = window.DL;

  /* ------------------------------------------------------------------ */
  /* Lessons: opened by ops.js for a fault / a new server                */
  /* ------------------------------------------------------------------ */
  const showIfaces = { any: [{ ran: 'ip-show' }, { ran: 'link-show' }] };
  const pingGw = { ran: 'ping-ok:{{gw}}' };

  const lessons = {
    setup: {
      title: 'Configurar {{dev.name}}',
      goal: 'Servidor novo, cabo conectado. Coloque-o na rede com o IP {{dev.ip}}/24 e teste a conexão com o gateway {{gw}}.',
      steps: [
        { text: 'Veja as interfaces de rede do servidor.', help: ['ip-addr'], check: showIfaces },
        { text: 'A eth0 está DOWN. Ligue a interface.', help: ['ip-link-up', 'sudo'], check: { state: 'eth0.up' } },
        { text: 'Atribua o IP {{dev.ip}}/24 à eth0.', help: ['ip-addr-add'], cmd: 'sudo ip addr add {{dev.ip}}/24 dev eth0', check: { state: 'eth0.ip' } },
        { text: 'Crie a rota padrão pelo gateway {{gw}}.', help: ['ip-route-add', 'ip-route'], check: { state: 'route', eq: '{{gw}}' } },
        { text: 'Teste a conexão com o gateway.', help: ['ping'], check: pingGw },
      ],
    },
    cable: {
      title: 'Falha de conexão · {{dev.name}}',
      goal: '{{dev.name}} sumiu da rede e o monitor marcou o host como indisponível. Descubra se é configuração ou camada física.',
      steps: [
        { text: 'Veja o estado do link da eth0.', help: ['ip-link', 'ip-addr'], check: showIfaces },
        { text: 'NO-CARRIER = sem sinal no cabo. Reconecte o cabo no rack.', help: ['cabling'], action: 'cabling', check: { state: 'cable' } },
        { text: 'Teste a conexão com o gateway {{gw}}.', help: ['ping'], check: pingGw },
      ],
    },
    link: {
      title: 'Falha de conexão · {{dev.name}}',
      goal: '{{dev.name}} parou de responder na rede. Descubra o motivo, corrija e teste.',
      steps: [
        { text: 'Veja o estado das interfaces.', help: ['ip-link', 'ip-addr'], check: showIfaces },
        { text: 'A eth0 caiu (DOWN). Ligue a interface de novo.', help: ['ip-link-up', 'sudo'], check: { state: 'eth0.up' } },
        { text: 'Teste a conexão com o gateway {{gw}}.', help: ['ping'], check: pingGw },
      ],
    },
    service: {
      title: 'Serviço parado · {{dev.name}}',
      goal: 'O site hospedado no {{dev.name}} não responde. Verifique o serviço web (nginx).',
      steps: [
        { text: 'Veja o estado do serviço nginx.', help: ['systemctl-status'], check: { ran: 'status:nginx' } },
        { text: 'O nginx está "failed". Reinicie o serviço.', help: ['systemctl-restart', 'sudo'], check: { state: 'service', arg: 'nginx', eq: 'active' } },
        { text: 'Confirme que o site responde.', help: ['curl'], check: { ran: 'curl-ok' } },
      ],
    },
    disk: {
      title: 'Disco cheio · {{dev.name}}',
      goal: 'O disco do {{dev.name}} está quase lotado. Encontre o culpado e libere espaço.',
      steps: [
        { text: 'Veja o uso dos discos.', help: ['df'], check: { ran: 'df' } },
        { text: 'Descubra quanto ocupa a pasta de logs /var/log.', help: ['du'], check: { ran: 'du:/var/log' } },
        { text: 'Limpe os logs antigos do journal (deixe 200M).', help: ['journalctl-vacuum', 'sudo'], check: { state: 'disk', lt: 80 } },
        { text: 'Confira o disco de novo.', help: ['df'], check: { ran: 'df-ok' } },
      ],
    },
    // the broken port as it was when the task opened: ops clears d.sw.bad / fixed as soon as the fault is resolved
    // (half a second after "no shutdown", console still open), so the steps follow this port instead
    port: {
      vars: { port: 'sw.bad' },
      title: 'Porta em erro · {{dev.name}}',
      goal: 'Uma porta do switch {{dev.name}} entrou em err-disabled e derrubou um servidor. Encontre e reative a porta.',
      steps: [
        { text: 'Entre no modo privilegiado.', help: ['enable'], check: { any: [{ state: 'sw.mode', ne: 'user' }, { state: 'sw.healed', arg: '{{port}}' }] } },
        { text: 'Veja o status das portas.', help: ['show-int'], check: { ran: 'show-int' } },
        { text: 'Entre no modo de configuração.', help: ['conf-t'], check: { any: [{ state: 'sw.mode', in: ['conf', 'if'] }, { state: 'sw.healed', arg: '{{port}}' }] } },
        { text: 'Selecione a porta com problema.', help: ['interface'], cmd: 'interface {{port}}', check: { any: [{ all: [{ state: 'sw.mode', eq: 'if' }, { state: 'sw.cur', eq: '{{port}}' }] }, { state: 'sw.healed', arg: '{{port}}' }] } },
        { text: 'Desligue a porta.', help: ['shutdown'], check: { any: [{ state: 'sw.healed', arg: '{{port}}' }, { state: 'sw.port', arg: '{{port}}', eq: 'disabled' }] } },
        { text: 'Ligue a porta novamente.', help: ['no-shutdown'], check: { state: 'sw.healed', arg: '{{port}}' } },
        // a show taken while this port is connected again (one taken between shutdown and no shutdown doesn't count)
        { text: 'Volte (end) e confira o status das portas.', help: ['end', 'show-int'], check: { ran: 'show-int-ok:{{port}}' } },
      ],
    },
    // the same job as setup, with less and less help as the career goes on (the Júnior problems open them).
    // auto: what the dev auto-play types (steps that show no command of their own)
    setup_jr1: {
      title: 'Configurar {{dev.name}}',
      goal: 'Servidor novo, cabo conectado. Coloque-o na rede com o IP {{dev.ip}}/24 e a rota pelo gateway {{gw}}. Desta vez o comando do IP e da rota é com você.',
      steps: [
        { text: 'Veja as interfaces de rede do servidor.', help: ['ip-addr'], check: showIfaces },
        { text: 'A eth0 está DOWN. Ligue a interface.', help: ['ip-link-up', 'sudo'], check: { state: 'eth0.up' } },
        { text: 'Atribua o IP {{dev.ip}}/24 à eth0.', help: ['ip-addr-add'], auto: 'sudo ip addr add {{dev.ip}}/24 dev eth0', check: { state: 'eth0.ip' } },
        { text: 'Crie a rota padrão pelo gateway {{gw}}.', help: ['ip-route-add'], auto: 'sudo ip route add default via {{gw}}', check: { state: 'route', eq: '{{gw}}' } },
        { text: 'Teste o gateway e a internet (8.8.8.8).', help: ['ping'], auto: 'ping -c 3 {{gw}}\nping -c 3 8.8.8.8', check: { all: [pingGw, { ran: 'ping-ok:8.8.8.8' }] } },
      ],
    },
    setup_jr2: {
      title: 'Configurar {{dev.name}}',
      goal: 'Servidor novo, cabo conectado: IP {{dev.ip}}/24, gateway {{gw}}. Os passos dizem o que fazer, não como.',
      steps: [
        { text: 'Descubra o estado da rede do servidor.', help: ['ip-addr'], cmd: 'ip addr', check: showIfaces },
        { text: 'Deixe a eth0 ativa.', help: ['ip-link-up', 'sudo'], auto: 'sudo ip link set eth0 up', check: { state: 'eth0.up' } },
        { text: 'Endereço do servidor: {{dev.ip}}/24.', help: ['ip-addr-add'], auto: 'sudo ip addr add {{dev.ip}}/24 dev eth0', check: { state: 'eth0.ip' } },
        { text: 'Saída para as outras redes pelo {{gw}}.', help: ['ip-route-add'], auto: 'sudo ip route add default via {{gw}}', check: { state: 'route', eq: '{{gw}}' } },
        { text: 'Prove que o servidor chega na internet.', help: ['ping'], auto: 'ping -c 3 8.8.8.8', check: { ran: 'ping-ok:8.8.8.8' } },
      ],
    },
    setup_jr3: {
      title: 'Configurar {{dev.name}}',
      goal: 'Coloque o {{dev.name}} em produção: IP {{dev.ip}}/24, gateway {{gw}}, nome {{dev.host}}, e prove que ele chega na internet. Sem roteiro: cada passo diz só o resultado esperado.',
      steps: [
        { text: 'A interface de rede está ativa.', help: ['ip-link-up'], auto: 'sudo ip link set eth0 up', check: { state: 'eth0.up' } },
        { text: 'O servidor responde no IP {{dev.ip}}/24.', help: ['ip-addr-add'], auto: 'sudo ip addr add {{dev.ip}}/24 dev eth0', check: { state: 'eth0.ip' } },
        { text: 'Existe rota padrão pelo {{gw}}.', help: ['ip-route-add'], auto: 'sudo ip route add default via {{gw}}', check: { state: 'route', eq: '{{gw}}' } },
        { text: 'O nome da máquina é {{dev.host}}.', help: ['hostnamectl'], auto: 'sudo hostnamectl set-hostname {{dev.host}}', check: { state: 'hostname', eq: '{{dev.host}}' } },
        { text: 'O ping até a internet (8.8.8.8) volta.', help: ['ping'], auto: 'ping -c 3 8.8.8.8', check: { ran: 'ping-ok:8.8.8.8' } },
      ],
    },
    // Pleno: the company standard, results only (the help shows one card)
    setup_pl: {
      title: 'Servidor no padrão · {{dev.name}}',
      goal: 'Padrão da empresa para servidor novo: IP {{dev.ip}}/24, gateway {{gw}}, nome {{dev.host}}, acesso remoto (SSH) escutando e saída para a internet. Entregue pronto.',
      steps: [
        { text: 'Rede: {{dev.ip}}/24 na eth0 ativa, rota padrão pelo {{gw}}.', help: ['ip-addr-add'], auto: 'sudo ip link set eth0 up\nsudo ip addr add {{dev.ip}}/24 dev eth0\nsudo ip route add default via {{gw}}', check: { all: [{ state: 'eth0.up' }, { state: 'eth0.ip' }, { state: 'route', eq: '{{gw}}' }] } },
        { text: 'Nome: {{dev.host}}.', help: ['hostnamectl'], auto: 'sudo hostnamectl set-hostname {{dev.host}}', check: { state: 'hostname', eq: '{{dev.host}}' } },
        { text: 'O SSH escuta na porta 22 (confira).', help: ['ss'], auto: 'sudo ss -tlnp', check: { all: [{ state: 'service', arg: 'ssh', eq: 'active' }, { ran: 'ss' }] } },
        { text: 'A internet responde.', help: ['ping'], auto: 'ping -c 3 8.8.8.8', check: { ran: 'ping-ok:8.8.8.8' } },
      ],
    },
    // a setup ticket with the wrong gateway: the player finds the right one in notas.txt
    setup_ticket: {
      title: 'Chamado de configuração · {{dev.name}}',
      goal: 'O chamado diz: "{{dev.name}} · IP {{dev.ip}}/24 · gateway 10.0.1.254". Configure e teste. Se não funcionar, desconfie do chamado.',
      steps: [
        { text: 'Ligue a eth0 e dê o IP {{dev.ip}}/24.', help: ['ip-link-up', 'ip-addr-add'], auto: 'sudo ip link set eth0 up\nsudo ip addr add {{dev.ip}}/24 dev eth0', check: { all: [{ state: 'eth0.up' }, { state: 'eth0.ip' }] } },
        { text: 'Crie a rota padrão que o chamado pede (10.0.1.254).', help: ['ip-route-add'], auto: 'sudo ip route add default via 10.0.1.254', check: { any: [{ state: 'route', eq: '10.0.1.254' }, { state: 'route', eq: '{{gw}}' }] } },
        { text: 'Teste a internet (8.8.8.8). Não voltou? Algo no chamado está errado.', help: ['ping'], auto: 'ping -c 3 8.8.8.8', check: { any: [{ ran: 'ping-fail' }, { state: 'route', eq: '{{gw}}' }] } },
        { text: 'Ache o gateway certo: o admin deixou anotado no arquivo notas.txt.', help: ['cat'], auto: 'cat notas.txt', check: { any: [{ ran: 'cat:notas.txt' }, { state: 'route', eq: '{{gw}}' }] } },
        { text: 'Troque a rota padrão pelo gateway certo.', help: ['ip-route-del', 'ip-route-add'], auto: 'sudo ip route del default\nsudo ip route add default via {{gw}}', check: { state: 'route', eq: '{{gw}}' } },
        { text: 'Teste a internet de novo.', help: ['ping'], auto: 'ping -c 3 8.8.8.8', check: { ran: 'ping-ok:8.8.8.8' } },
      ],
    },
  };

  /* ------------------------------------------------------------------ */
  /* Problems: sorted out over time for the player's rank                */
  /*   target   — the equipment it happens on (problems.js matches it)   */
  /*   setup    — what goes wrong when it starts (a fault, a rename…)    */
  /*   complete — lesson (its own steps in the console) · fixed (the     */
  /*              fault is gone) · online (the server got configured) ·  */
  /*              steps (a checklist done outside the console)           */
  /*   trigger  — random (the timer) · auto (as soon as it fits, at its  */
  /*              own rank: the player's own new server)                 */
  /*   when     — an extra rule from problems.js WHEN                    */
  /*   devices  — other equipment it involves ({ sw: 'switch.of' }); a  */
  /*              step on one of them says device: 'sw' (default dev)    */
  /*   bot      — 'fix': the crew member also fixes the setup's fault    */
  /*   roles / bot_minutes — who on the team can take it ("Atribuir a…", */
  /*              the player gets 15% of the XP; roles: [] = only you)   */
  /*   step.device — a role of devices ('any': whichever console)        */
  /*   step.auto — what the dev auto-play types (never shown)            */
  /*   check.at — check another device of the problem (a role / a var)   */
  /* ------------------------------------------------------------------ */
  // the equipment most problems happen on
  const LNX = { kind: 'server', state: 'online', os: 'linux', healthy: true };
  const WIN = { kind: 'server', state: 'online', os: 'windows', win: 'ready', healthy: true };
  const NEW = { kind: 'server', state: 'link', own: true, os: 'linux' };
  const MSW = { kind: 'switch', managed: true, healthy: true };
  const DC = Object.assign({}, WIN, { domain: true });
  const NODE = { kind: 'server', state: 'online', healthy: true, svc: 'virt' };
  // the domain's account for the auto-play (a strong password the domain accepts)
  const PW = '(ConvertTo-SecureString "Datalab@2026" -AsPlainText -Force)';
  const T = (base, more) => Object.assign({}, base, more || {});
  const swEnable = { text: 'Entre no modo privilegiado.', help: ['enable'], cmd: 'enable', check: { any: [{ ran: 'enable' }, { state: 'sw.mode', ne: 'user' }] } };
  const problems = [
    {
      id: 'est_primeiro_acesso', n: 1, rank: 'est', title: 'Primeiro acesso ao {{dev.name}}', difficulty: 1, xp: 30, credits: 5,
      skill: 'sistemas', roles: ['sysadmin', 'tecnico'], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Antes de mexer em qualquer servidor, reconheça a máquina: quem você é nela, o nome, o sistema e há quanto tempo está ligada.',
      target: { kind: 'server', state: 'online', os: 'linux', healthy: true, prefer: 'SRV-01' },
      steps: [
        { text: 'Veja com qual usuário você entrou.', help: ['whoami'], check: { ran: 'cmd:whoami' } },
        { text: 'Veja o nome da máquina.', help: ['hostname'], check: { any: [{ ran: 'cmd:hostname' }, { ran: 'cmd:hostnamectl' }] } },
        { text: 'Veja o sistema e a versão do kernel.', help: ['uname'], cmd: 'uname -a', check: { ran: 'cmd:uname' } },
        { text: 'Veja há quanto tempo o servidor está ligado.', help: ['uptime'], check: { ran: 'cmd:uptime' } },
      ],
    },
    {
      id: 'est_inventario_hardware', n: 2, rank: 'est', title: 'Inventário de hardware do {{dev.name}}', difficulty: 1, xp: 30, credits: 5,
      skill: 'servidores', roles: ['servidores', 'tecnico', 'sysadmin'], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O supervisor está atualizando a ficha técnica dos servidores e pediu o processador e a memória do {{dev.name}}.',
      target: { kind: 'server', state: 'online', os: 'linux', healthy: true, prefer: 'SRV-01' },
      vars: { cores: 'hw.cores' },
      steps: [
        { text: 'Veja o processador do servidor.', help: ['lscpu'], check: { ran: 'cmd:lscpu' } },
        { text: 'Veja a memória.', help: ['free'], cmd: 'free -h', check: { ran: 'cmd:free' } },
        { type: 'answer', text: 'Quantos núcleos (cores) o {{dev.name}} tem?', help: ['lscpu', 'responder'], answer: { accept: ['{{cores}}'], normalize: 'int' } },
      ],
    },
    {
      id: 'est_qual_ip', n: 3, rank: 'est', title: 'Qual é o IP do {{dev.name}}?', difficulty: 1, xp: 30, credits: 5,
      skill: 'redes', roles: ['redes', 'sysadmin', 'tecnico'], bot_minutes: 8, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Um colega precisa liberar o {{dev.name}} no firewall e pediu o IP dele. Confira no próprio servidor.',
      target: { kind: 'server', state: 'online', os: 'linux', healthy: true, prefer: 'SRV-01' },
      steps: [
        { text: 'Veja as interfaces e os endereços do servidor.', help: ['ip-addr'], check: { ran: 'ip-show' } },
        { type: 'answer', text: 'Qual é o IP da eth0 do {{dev.name}}?', help: ['ip-addr', 'responder'], answer: { accept: ['{{dev.ip}}'], normalize: 'ip' } },
      ],
    },
    {
      id: 'est_gateway_internet', n: 4, rank: 'est', title: 'Teste do gateway e da internet · {{dev.name}}', difficulty: 1, xp: 30, credits: 5,
      skill: 'redes', roles: ['redes', 'sysadmin', 'tecnico'], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Checklist do turno: o servidor tem rota padrão, alcança o gateway e sai para a internet?',
      target: { kind: 'server', state: 'online', os: 'linux', healthy: true, prefer: 'SRV-01' },
      steps: [
        { text: 'Veja a tabela de rotas: existe uma rota padrão (default via …)?', help: ['ip-route'], check: { ran: 'route-show' } },
        { text: 'Teste o gateway {{gw}}.', help: ['ping'], cmd: 'ping -c 3 {{gw}}', check: { ran: 'ping-ok:{{gw}}' } },
        { text: 'Teste a saída para a internet (8.8.8.8).', help: ['ping'], cmd: 'ping -c 3 8.8.8.8', check: { ran: 'ping-ok:8.8.8.8' } },
      ],
    },
    {
      id: 'est_configurar_servidor', n: 5, rank: 'est', title: 'Configurar o servidor novo · {{dev.name}}', difficulty: 2, xp: 50, credits: 8,
      skill: 'sistemas', roles: ['sysadmin', 'servidores'], bot_minutes: 20, weight: 1, trigger: 'auto', complete: 'online', lesson: 'setup',
      summary: 'O {{dev.name}} já tem cabo. Ligue a interface, dê o IP {{dev.ip}}/24, crie a rota e teste com ping.',
      target: { kind: 'server', state: 'link', own: true },
    },
    {
      id: 'est_porta_servidor', n: 6, rank: 'est', title: 'Em que porta do {{dev.name}} está o {{srv.name}}?', difficulty: 2, xp: 50, credits: 8,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Documentação do rack: anote em qual porta do switch {{dev.name}} o servidor {{srv.name}} está ligado.',
      target: { kind: 'switch', managed: true, healthy: true, direct: true, prefer: 'SW-01' },
      vars: { srv: 'sw.direct' },
      steps: [
        { text: 'Entre no modo privilegiado.', help: ['enable'], check: { any: [{ ran: 'enable' }, { state: 'sw.mode', ne: 'user' }] } },
        { text: 'Veja o status das portas: a coluna Name mostra quem está ligado em cada uma.', help: ['show-int'], check: { ran: 'show-int' } },
        { type: 'answer', text: 'Em qual porta está o {{srv.name}}?', help: ['show-int', 'responder'], answer: { accept: ['{{srv.port}}'], normalize: 'port' } },
      ],
    },
    {
      id: 'est_site_responde', n: 7, rank: 'est', title: 'O site do {{dev.name}} está respondendo?', difficulty: 1, xp: 30, credits: 5,
      skill: 'sistemas', roles: ['sysadmin', 'atendente'], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Um cliente perguntou se o site caiu. Confira o serviço web e faça uma requisição de teste.',
      target: { kind: 'server', state: 'online', os: 'linux', healthy: true, web: true, prefer: 'SRV-01' },
      steps: [
        { text: 'Veja o estado do serviço nginx.', help: ['systemctl-status'], cmd: 'systemctl status nginx', check: { ran: 'status:nginx' } },
        { text: 'Faça uma requisição ao site.', help: ['curl'], check: { ran: 'curl-ok' } },
      ],
    },
    {
      id: 'est_reiniciar_nginx', n: 8, rank: 'est', title: 'Reiniciar o nginx do {{dev.name}}', difficulty: 2, xp: 50, credits: 8,
      skill: 'sistemas', roles: ['sysadmin'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'fixed', lesson: 'service',
      summary: 'O site parou. Com o procedimento em mãos: veja o status do nginx, reinicie e confirme com curl.',
      target: { kind: 'server', state: 'online', os: 'linux', healthy: true, web: true, prefer: 'SRV-01' },
      setup: { fault: 'service' },
    },
    {
      id: 'est_interface_desligada', n: 9, rank: 'est', title: 'Interface desligada no {{dev.name}}', difficulty: 2, xp: 50, credits: 8,
      skill: 'redes', roles: ['redes', 'sysadmin', 'tecnico'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'fixed', lesson: 'link',
      summary: 'O {{dev.name}} sumiu da rede. Veja as interfaces, ligue a eth0 e teste com ping.',
      target: { kind: 'server', state: 'online', os: 'linux', healthy: true, prefer: 'SRV-01' },
      setup: { fault: 'link' },
    },
    {
      id: 'est_cabo_solto', n: 10, rank: 'est', title: 'Cabo solto no {{rack.id}}', difficulty: 2, xp: 50, credits: 8,
      skill: 'redes', roles: ['redes', 'tecnico', 'servidores'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'fixed', lesson: 'cable',
      summary: 'O {{dev.name}} perdeu a conexão. ip link mostra NO-CARRIER? Então é camada física: reconecte o cabo no rack.',
      target: { kind: 'server', state: 'online', os: 'linux', healthy: true, prefer: 'SRV-01' },
      setup: { fault: 'cable' },
    },
    {
      id: 'est_instalar_cabear', n: 11, rank: 'est', title: 'Instalar e cabear o servidor novo', difficulty: 2, xp: 50, credits: 8,
      // roles: [] — only the player: it starts with buying and installing the server
      skill: 'servidores', roles: [], bot_minutes: 20, weight: 1, trigger: 'auto', complete: 'steps', when: 'firstServer',
      summary: 'A empresa precisa de um servidor no ar. Instale um servidor e um switch gerenciável e ligue o cabo da eth0 no switch.',
      target: { kind: 'server', state: ['new', 'link'], own: true, lazy: true },
      steps: [
        { text: 'Instale um servidor num rack (Construir → Equipamentos → Servidor).', action: 'build', check: { bound: true } },
        { text: 'Instale um switch gerenciável na mesma sala do servidor.', action: 'build', check: { state: 'switch.near' } },
        { text: 'Ligue o cabo da eth0 numa porta gi0/… do switch.', action: 'cabling', check: { state: 'state', in: ['link', 'online'] } },
      ],
    },
    {
      id: 'est_organizar_cabos', n: 12, rank: 'est', title: 'Organizar os cabos do {{rack.id}}', difficulty: 1, xp: 30, credits: 5,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'steps',
      summary: 'Mexeram no {{rack.id}} e os cabos ficaram bagunçados: atrapalha o fluxo de ar e a manutenção.',
      target: { kind: 'rack', cabled: true },
      setup: { rack: 'messy' },
      steps: [
        { text: 'Abra o cabeamento do {{rack.id}} e use Organizar cabos.', action: 'cabling', check: { state: 'rack.tidy' } },
      ],
    },
    {
      id: 'est_uso_disco', n: 13, rank: 'est', title: 'Uso de disco do {{dev.name}}', difficulty: 1, xp: 30, credits: 5,
      skill: 'servidores', roles: ['servidores', 'sysadmin'], bot_minutes: 8, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Relatório de capacidade: o gestor quer saber quanto do disco do {{dev.name}} já está ocupado.',
      target: { kind: 'server', state: 'online', os: 'linux', healthy: true, prefer: 'SRV-01' },
      vars: { disk: 'disk.pct' },
      steps: [
        { text: 'Veja o uso dos discos.', help: ['df'], check: { ran: 'df' } },
        { text: 'Veja quanto ocupa a pasta de logs /var/log.', help: ['du'], cmd: 'du -sh /var/log', check: { ran: 'du:/var/log' } },
        { type: 'answer', text: 'Quantos % do disco / do {{dev.name}} estão em uso?', help: ['df', 'responder'], answer: { accept: ['{{disk}}'], normalize: 'int', tol: 1 } },
      ],
    },
    {
      id: 'est_limpar_logs', n: 14, rank: 'est', title: 'Limpar logs antigos do {{dev.name}}', difficulty: 2, xp: 50, credits: 8,
      skill: 'servidores', roles: ['sysadmin', 'servidores'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'fixed', lesson: 'disk',
      summary: 'O disco do {{dev.name}} passou de 90%. Ache o culpado (/var/log) e limpe os logs antigos do journal.',
      target: { kind: 'server', state: 'online', os: 'linux', healthy: true, prefer: 'SRV-01' },
      setup: { fault: 'disk' },
    },
    {
      id: 'est_achar_porta_erro', n: 15, rank: 'est', title: 'Achar a porta em erro no {{dev.name}}', difficulty: 2, xp: 50, credits: 8,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Um servidor caiu e o monitor aponta para o switch {{dev.name}}. Descubra qual porta entrou em err-disabled e passe para quem vai corrigir.',
      handoff: 'a correção da porta fica com a equipe — ou com você, pelo alerta em Tarefas',
      target: { kind: 'switch', managed: true, healthy: true, prefer: 'SW-01' },
      setup: { fault: 'port', quiet: true },
      vars: { port: 'sw.bad' },
      steps: [
        { text: 'Entre no modo privilegiado.', help: ['enable'], check: { any: [{ ran: 'enable' }, { state: 'sw.mode', ne: 'user' }] } },
        { text: 'Veja o status das portas.', help: ['show-int'], check: { ran: 'show-int' } },
        { type: 'answer', text: 'Qual porta do {{dev.name}} está em err-disabled?', help: ['show-int', 'responder'], answer: { accept: ['{{port}}'], normalize: 'port' } },
      ],
    },
    {
      id: 'est_padronizar_hostname', n: 16, rank: 'est', title: 'Padronizar o nome do {{dev.name}}', difficulty: 1, xp: 30, credits: 5,
      skill: 'sistemas', roles: ['sysadmin', 'tecnico'], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O {{dev.name}} voltou de uma reinstalação com o nome padrão (localhost). O padrão da empresa é o nome do equipamento em minúsculas.',
      target: { kind: 'server', state: 'online', os: 'linux', healthy: true, prefer: 'SRV-02' },
      setup: { hostname: 'localhost' },
      steps: [
        { text: 'Veja o nome atual da máquina.', help: ['hostname'], check: { any: [{ ran: 'cmd:hostname' }, { ran: 'cmd:hostnamectl' }] } },
        { text: 'Mude o nome para {{dev.host}}.', help: ['hostnamectl', 'sudo'], cmd: 'sudo hostnamectl set-hostname {{dev.host}}', check: { state: 'hostname', eq: '{{dev.host}}' } },
        { text: 'Confira o nome novo.', help: ['hostname'], check: { ran: 'hostname-show:{{dev.host}}' } },
      ],
    },
    {
      id: 'est_tentativas_login', n: 17, rank: 'est', title: 'Quem tentou entrar no {{dev.name}}?', difficulty: 2, xp: 50, credits: 8,
      skill: 'seguranca', roles: ['seguranca', 'sysadmin'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O monitor acusou muitas tentativas de login por SSH no {{dev.name}}. Descubra de qual IP vêm as senhas erradas para a segurança bloquear.',
      handoff: 'o IP vai para a segurança bloquear no firewall',
      target: { kind: 'server', state: 'online', os: 'linux', healthy: true, prefer: 'SRV-01' },
      setup: { authlog: 'bruteforce' },
      vars: { attacker: 'auth.attacker' },
      steps: [
        { text: 'Veja as últimas linhas do log de autenticação (/var/log/auth.log).', help: ['tail'], cmd: 'tail -n 20 /var/log/auth.log', check: { any: [{ ran: 'tail:/var/log/auth.log' }, { ran: 'cat:/var/log/auth.log' }] } },
        { text: 'Filtre só as senhas erradas (Failed password).', help: ['grep'], cmd: 'grep "Failed password" /var/log/auth.log', check: { ran: 'grep-failed:/var/log/auth.log' } },
        { type: 'answer', text: 'De qual IP vem a maioria das tentativas?', help: ['grep', 'responder'], answer: { accept: ['{{attacker}}'], normalize: 'ip' } },
      ],
    },
    {
      id: 'est_porta_servico', n: 18, rank: 'est', title: 'Em que porta o {{svc.name}} do {{dev.name}} escuta?', difficulty: 1, xp: 30, credits: 5,
      skill: 'sistemas', roles: ['sysadmin', 'seguranca', 'redes'], bot_minutes: 8, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'A equipe de firewall vai liberar o {{svc.name}} do {{dev.name}} e precisa da porta exata. Pergunte ao próprio servidor.',
      target: { kind: 'server', state: 'online', os: 'linux', healthy: true, prefer: 'SRV-01' },
      vars: { svc: 'svc.listen' },
      steps: [
        { text: 'Liste as portas TCP em escuta com o processo de cada uma (o -p precisa de sudo).', help: ['ss', 'sudo'], cmd: 'sudo ss -tlnp', check: { ran: 'ss-procs' } },
        { type: 'answer', text: 'Em que porta o {{svc.name}} escuta?', help: ['ss', 'responder'], answer: { accept: ['{{svc.port}}'], normalize: 'int' } },
      ],
    },
    {
      id: 'est_salvar_config', n: 19, rank: 'est', title: 'Salvar a configuração do {{dev.name}}', difficulty: 1, xp: 30, credits: 5,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 8, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Ontem mudaram a descrição de uma porta do {{dev.name}} e não salvaram: se o switch reiniciar, a mudança se perde. Compare e salve.',
      target: { kind: 'switch', managed: true, healthy: true, linked: true, prefer: 'SW-01' },
      setup: { swconfig: 'unsaved' },
      steps: [
        { text: 'Entre no modo privilegiado.', help: ['enable'], check: { any: [{ ran: 'enable' }, { state: 'sw.mode', ne: 'user' }] } },
        { text: 'Veja a configuração em uso (running-config).', help: ['show-run'], cmd: 'show running-config', check: { ran: 'show-run' } },
        { text: 'Compare com a configuração salva (startup-config): falta uma descrição de porta.', help: ['show-start'], cmd: 'show startup-config', check: { ran: 'show-start' } },
        { text: 'Salve a configuração em uso como a de inicialização.', help: ['copy-run-start'], cmd: 'copy running-config startup-config', check: { state: 'sw.saved' } },
      ],
    },
    // two consoles: the server (dev) and the switch at the other end of its cable (sw)
    {
      id: 'est_servidor_sem_rede', n: 20, rank: 'est', title: '{{dev.name}} sem rede: investigue dos dois lados', difficulty: 3, xp: 80, credits: 12,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'O {{dev.name}} parou de responder. Comece pelo servidor; se ele estiver certo, siga o cabo até o {{sw.name}}.',
      target: { kind: 'server', state: 'online', os: 'linux', healthy: true, prefer: 'SRV-01' },
      devices: { sw: 'switch.of' },
      setup: { fault: 'port', on: 'sw', quiet: true },
      vars: { port: 'srv.port' },
      steps: [
        { text: 'No {{dev.name}}, teste o gateway {{gw}}.', help: ['ping'], cmd: 'ping -c 3 {{gw}}', check: { ran: 'ping-fail' } },
        { text: 'Confira a interface: se a eth0 está UP e com IP, o problema não é no servidor.', help: ['ip-link', 'ip-addr'], check: showIfaces },
        { device: 'sw', text: 'Vá ao {{sw.name}}, o switch do outro lado do cabo, e entre no modo privilegiado.', help: ['enable'], check: { any: [{ ran: 'enable' }, { state: 'sw.mode', ne: 'user' }, { state: 'sw.healed', arg: '{{port}}' }] } },
        { device: 'sw', text: 'Veja o status das portas: qual está em err-disabled?', help: ['show-int'], check: { any: [{ ran: 'show-int' }, { state: 'sw.healed', arg: '{{port}}' }] } },
        { device: 'sw', text: 'Entre no modo de configuração.', help: ['conf-t'], check: { any: [{ state: 'sw.mode', in: ['conf', 'if'] }, { ran: 'conf' }, { state: 'sw.healed', arg: '{{port}}' }] } },
        { device: 'sw', text: 'Selecione a porta em erro.', help: ['interface'], cmd: 'interface {{port}}', check: { any: [{ all: [{ state: 'sw.mode', eq: 'if' }, { state: 'sw.cur', eq: '{{port}}' }] }, { state: 'sw.healed', arg: '{{port}}' }] } },
        { device: 'sw', text: 'Reinicie a porta: shutdown e depois no shutdown.', help: ['shutdown', 'no-shutdown'], check: { state: 'sw.healed', arg: '{{port}}' } },
        { text: 'Volte ao {{dev.name}} e teste o gateway de novo.', help: ['ping'], cmd: 'ping -c 3 {{gw}}', check: { ran: 'ping-ok:{{gw}}' } },
      ],
    },

    /* ---------------- Júnior I: mais servidores na mesma sala ---------------- */
    {
      id: 'jr1_configurar_servidor', n: 1, rank: 'jr1', title: 'Configurar o servidor novo sem cola · {{dev.name}}', difficulty: 3, xp: 80, credits: 12,
      skill: 'sistemas', roles: ['sysadmin', 'servidores'], bot_minutes: 20, weight: 1, trigger: 'auto', complete: 'online', lesson: 'setup_jr1',
      summary: 'O {{dev.name}} já tem cabo. O roteiro é o mesmo de antes, mas agora você monta sozinho(a) os comandos do IP e da rota.',
      target: NEW,
    },
    {
      id: 'jr1_disco_mais_cheio', n: 2, rank: 'jr1', title: 'Qual disco está mais cheio: {{dev.name}} ou {{peer.name}}?', difficulty: 2, xp: 60, credits: 9,
      skill: 'servidores', roles: ['servidores', 'sysadmin'], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O gestor vai comprar discos e quer saber qual dos dois servidores está mais perto de lotar.',
      target: T(LNX, { prefer: 'SRV-01' }), devices: { peer: 'server.peer' },
      setup: { diskpct: [66, 78] }, vars: { top: 'max:disk.pct' },
      steps: [
        { text: 'Veja o uso de disco do {{dev.name}}.', help: ['df'], cmd: 'df -h', check: { ran: 'df' } },
        { device: 'peer', text: 'Veja o uso de disco do {{peer.name}}.', help: ['df'], cmd: 'df -h', check: { ran: 'df' } },
        { device: 'peer', type: 'answer', text: 'Qual dos dois está com o disco mais cheio?', help: ['df', 'responder'], answer: { accept: ['{{top}}'], normalize: 'text' } },
      ],
    },
    {
      id: 'jr1_ip_trocado', n: 3, rank: 'jr1', title: 'IP trocado no {{dev.name}}', difficulty: 3, xp: 80, credits: 12,
      skill: 'redes', roles: ['redes', 'sysadmin', 'tecnico'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'O monitor diz que o {{dev.name}} sumiu do IP {{dev.ip}}. Alguém configurou o endereço errado: troque pelo certo.',
      target: LNX, setup: { fault: 'wrongip' }, vars: { bad: 'os.badIp' },
      steps: [
        { text: 'Veja o IP que está na eth0.', help: ['ip-addr'], cmd: 'ip addr', check: { ran: 'ip-show' } },
        { text: 'Remova o endereço errado ({{bad}}/24).', help: ['ip-addr-del', 'sudo'], cmd: 'sudo ip addr del {{bad}}/24 dev eth0', check: { not: { state: 'eth0.has', arg: '{{bad}}' } } },
        { text: 'Coloque o IP certo, {{dev.ip}}/24.', help: ['ip-addr-add'], cmd: 'sudo ip addr add {{dev.ip}}/24 dev eth0', check: { state: 'eth0.ip' } },
        { text: 'Teste o gateway {{gw}}.', help: ['ping'], cmd: 'ping -c 3 {{gw}}', check: pingGw },
      ],
    },
    {
      id: 'jr1_gateway_errado', n: 4, rank: 'jr1', title: 'Gateway errado no {{dev.name}}', difficulty: 3, xp: 80, credits: 12,
      skill: 'redes', roles: ['redes', 'sysadmin'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'O {{dev.name}} fala com a rede local, mas não sai para a internet. Suspeita: a rota padrão aponta para o lugar errado.',
      target: LNX, setup: { fault: 'badroute' },
      steps: [
        { text: 'Teste a saída para a internet (8.8.8.8).', help: ['ping'], cmd: 'ping -c 3 8.8.8.8', check: { any: [{ ran: 'ping-fail' }, { state: 'route', eq: '{{gw}}' }] } },
        { text: 'Veja a tabela de rotas: para onde aponta a rota padrão?', help: ['ip-route'], cmd: 'ip route', check: { ran: 'route-show' } },
        { text: 'Apague a rota padrão errada.', help: ['ip-route-del', 'sudo'], cmd: 'sudo ip route del default', check: { state: 'route', ne: '10.0.1.254' } },
        { text: 'Crie a rota padrão pelo gateway {{gw}}.', help: ['ip-route-add'], cmd: 'sudo ip route add default via {{gw}}', check: { state: 'route', eq: '{{gw}}' } },
        { text: 'Teste a internet de novo.', help: ['ping'], cmd: 'ping -c 3 8.8.8.8', check: { ran: 'ping-ok:8.8.8.8' } },
      ],
    },
    {
      id: 'jr1_vizinhos', n: 5, rank: 'jr1', title: 'O {{dev.name}} enxerga o {{peer.name}}?', difficulty: 2, xp: 50, credits: 8,
      skill: 'redes', roles: ['redes', 'sysadmin', 'tecnico'], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Os dois servidores vão trocar dados. Antes, confirme que um alcança o outro pela rede.',
      target: LNX, devices: { peer: 'server.peer' },
      steps: [
        { device: 'peer', text: 'No {{peer.name}}, veja o IP dele.', help: ['ip-addr'], cmd: 'ip addr', check: { ran: 'ip-show' } },
        { device: 'peer', type: 'answer', text: 'Qual é o IP do {{peer.name}}?', help: ['ip-addr', 'responder'], answer: { accept: ['{{peer.ip}}'], normalize: 'ip' } },
        { text: 'No {{dev.name}}, faça ping no {{peer.name}}.', help: ['ping'], cmd: 'ping -c 3 {{peer.ip}}', check: { ran: 'ping-ok:{{peer.ip}}' } },
      ],
    },
    {
      id: 'jr1_ssh_parado', n: 6, rank: 'jr1', title: 'SSH parado no {{dev.name}}', difficulty: 2, xp: 60, credits: 9,
      skill: 'sistemas', roles: ['sysadmin', 'seguranca'], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'Ninguém consegue acessar o {{dev.name}} remotamente. Pelo console do rack, veja o serviço de SSH.',
      target: LNX, setup: { fault: 'sshstop' },
      steps: [
        { text: 'Veja o estado do serviço ssh.', help: ['systemctl-status'], cmd: 'systemctl status ssh', check: { ran: 'status:ssh' } },
        { text: 'Está "inactive (dead)": inicie o serviço.', help: ['systemctl-start', 'sudo'], cmd: 'sudo systemctl start ssh', check: { state: 'service', arg: 'ssh', eq: 'active' } },
        { text: 'Confira que a porta 22 voltou a escutar.', help: ['ss', 'sudo'], cmd: 'sudo ss -tlnp', check: { ran: 'ss' } },
      ],
    },
    {
      id: 'jr1_portas_em_uso', n: 7, rank: 'jr1', title: 'Quantas portas do {{dev.name}} estão em uso?', difficulty: 2, xp: 50, credits: 8,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 8, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Planejamento da sala: quantos equipamentos já estão ligados no switch {{dev.name}}?',
      target: T(MSW, { linked: true, prefer: 'SW-01' }), vars: { n: 'sw.count:connected' },
      steps: [
        swEnable,
        { text: 'Veja o status das portas.', help: ['show-int'], cmd: 'show interfaces status', check: { ran: 'show-int' } },
        { type: 'answer', text: 'Quantas portas estão connected?', help: ['show-int', 'responder'], answer: { accept: ['{{n}}'], normalize: 'int' } },
      ],
    },
    {
      id: 'jr1_parado_ou_travado', n: 8, rank: 'jr1', title: 'Site fora no {{dev.name}}: parado ou travado?', difficulty: 3, xp: 80, credits: 12,
      skill: 'sistemas', roles: ['sysadmin'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'O site caiu. Desta vez o nginx não travou: alguém parou o serviço. Descubra quem antes de subir de novo.',
      target: T(LNX, { web: true }), setup: { fault: 'nginxstop' }, vars: { who: 'auth.stopper' },
      steps: [
        { text: 'Veja o estado do nginx: "failed" é travado, "inactive (dead)" é parado.', help: ['systemctl-status'], cmd: 'systemctl status nginx', check: { ran: 'status:nginx' } },
        { text: 'Quem parou usou sudo: procure "nginx" no log de autenticação.', help: ['grep'], cmd: 'grep nginx /var/log/auth.log', check: { ran: 'grep-hit:/var/log/auth.log' } },
        { type: 'answer', text: 'Qual usuário parou o nginx?', help: ['grep', 'responder'], answer: { accept: ['{{who}}'], normalize: 'text' } },
        { text: 'Inicie o nginx de novo.', help: ['systemctl-start', 'sudo'], cmd: 'sudo systemctl start nginx', check: { state: 'service', arg: 'nginx', eq: 'active' } },
        { text: 'Confirme que o site responde.', help: ['curl'], cmd: 'curl localhost', check: { ran: 'curl-ok' } },
      ],
    },
    {
      id: 'jr1_reiniciou', n: 9, rank: 'jr1', title: 'O {{dev.name}} reiniciou?', difficulty: 2, xp: 50, credits: 8,
      skill: 'sistemas', roles: ['sysadmin', 'tecnico'], bot_minutes: 8, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Um cliente reclamou de uma queda de madrugada. Confira há quanto tempo o {{dev.name}} está ligado.',
      target: LNX, setup: { uptime: [140, 560] }, vars: { h: 'uptime.h' },
      steps: [
        { text: 'Veja há quanto tempo o servidor está ligado (H:MM = horas e minutos).', help: ['uptime'], cmd: 'uptime', check: { ran: 'cmd:uptime' } },
        { type: 'answer', text: 'Há quantas horas, mais ou menos, o {{dev.name}} está ligado?', help: ['uptime', 'responder'], answer: { accept: ['{{h}}'], normalize: 'int', tol: 1 } },
      ],
    },
    {
      id: 'jr1_memoria', n: 10, rank: 'jr1', title: 'Quanta memória tem o {{dev.name}}?', difficulty: 2, xp: 50, credits: 8,
      skill: 'servidores', roles: ['servidores', 'tecnico', 'sysadmin'], bot_minutes: 8, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Um cliente quer saber se a aplicação dele cabe no {{dev.name}}. Confira a memória RAM.',
      target: T(LNX, { prefer: 'SRV-02' }), vars: { ram: 'hw.ram' },
      steps: [
        { text: 'Veja a memória do servidor.', help: ['free'], cmd: 'free -h', check: { ran: 'cmd:free' } },
        { type: 'answer', text: 'Quantos GB de RAM o {{dev.name}} tem no total? (1 TB = 1024 GB)', help: ['free', 'responder'], answer: { accept: ['{{ram}}'], normalize: 'int' } },
      ],
    },
    {
      id: 'jr1_portas_dois', n: 11, rank: 'jr1', title: 'Em que portas do {{dev.name}} estão o {{srv.a.name}} e o {{srv.b.name}}?', difficulty: 2, xp: 60, credits: 9,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Documentação do rack: anote as portas do switch {{dev.name}} onde estão os dois servidores.',
      target: T(MSW, { direct2: true, prefer: 'SW-01' }), vars: { srv: 'sw.pair' },
      steps: [
        swEnable,
        { text: 'Veja o status das portas: a coluna Name mostra quem está em cada uma.', help: ['show-int'], cmd: 'show interfaces status', check: { ran: 'show-int' } },
        { type: 'answer', text: 'Em qual porta está o {{srv.a.name}}?', help: ['show-int', 'responder'], answer: { accept: ['{{srv.a.port}}'], normalize: 'port' } },
        { type: 'answer', text: 'E o {{srv.b.name}}?', help: ['show-int', 'responder'], answer: { accept: ['{{srv.b.port}}'], normalize: 'port' } },
      ],
    },
    {
      id: 'jr1_duas_falhas', n: 12, rank: 'jr1', title: 'Duas falhas no {{dev.name}}', difficulty: 3, xp: 90, credits: 14,
      skill: 'sistemas', roles: ['sysadmin', 'redes'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'O {{dev.name}} saiu da rede e, quando voltar, o site não vai subir: o nginx também caiu. Resolva as duas coisas.',
      target: T(LNX, { web: true }), setup: { fault: 'linksvc' },
      steps: [
        { text: 'Veja o estado das interfaces.', help: ['ip-link'], cmd: 'ip link', check: showIfaces },
        { text: 'Ligue a eth0.', help: ['ip-link-up', 'sudo'], cmd: 'sudo ip link set eth0 up', check: { state: 'eth0.up' } },
        { text: 'Teste o gateway {{gw}}.', help: ['ping'], cmd: 'ping -c 3 {{gw}}', check: pingGw },
        { text: 'Agora o site: veja o estado do nginx.', help: ['systemctl-status'], cmd: 'systemctl status nginx', check: { ran: 'status:nginx' } },
        { text: 'Reinicie o nginx.', help: ['systemctl-restart', 'sudo'], cmd: 'sudo systemctl restart nginx', check: { state: 'service', arg: 'nginx', eq: 'active' } },
        { text: 'Confirme que o site responde.', help: ['curl'], cmd: 'curl localhost', check: { ran: 'curl-ok' } },
      ],
    },
    {
      id: 'jr1_posto_atendimento', n: 13, rank: 'jr1', title: 'Monte o posto de atendimento', difficulty: 2, xp: 50, credits: 8,
      // roles: [] — only the player: it is a purchase
      skill: 'gestao', roles: [], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'steps',
      summary: 'Os clientes vão ligar para o suporte. Monte uma estação de atendimento para a equipe atender.',
      target: { kind: 'rack' }, vars: { n: 'items:desksupport' },
      steps: [
        { text: 'Instale uma Estação de atendimento (Construir → Equipamentos → Estações).', action: 'build', check: { state: 'items', arg: 'desksupport', gt: '{{n}}' } },
      ],
    },
    {
      id: 'jr1_ultimo_login', n: 14, rank: 'jr1', title: 'De onde veio o último login no {{dev.name}}?', difficulty: 2, xp: 50, credits: 8,
      skill: 'seguranca', roles: ['seguranca', 'sysadmin'], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Auditoria de acesso: de qual IP veio o último login aceito no {{dev.name}}?',
      target: LNX, setup: { authlog: 'logins' }, vars: { last: 'auth.last' },
      steps: [
        { text: 'Veja as últimas linhas do log de autenticação.', help: ['tail'], cmd: 'tail -n 20 /var/log/auth.log', check: { any: [{ ran: 'tail:/var/log/auth.log' }, { ran: 'cat:/var/log/auth.log' }] } },
        { text: 'Filtre só os logins aceitos (Accepted).', help: ['grep'], cmd: 'grep Accepted /var/log/auth.log', check: { ran: 'grep-hit:/var/log/auth.log' } },
        { type: 'answer', text: 'De qual IP veio o login mais recente?', help: ['grep', 'responder'], answer: { accept: ['{{last}}'], normalize: 'ip' } },
      ],
    },
    {
      id: 'jr1_nome_duplicado', n: 15, rank: 'jr1', title: 'Nome duplicado no {{dev.name}}', difficulty: 3, xp: 80, credits: 12,
      skill: 'sistemas', roles: ['sysadmin', 'tecnico'], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Dois servidores aparecem com o mesmo nome no monitoramento: o {{dev.name}} está usando o nome de outro.',
      target: LNX, setup: { hostname: 'dup' }, vars: { dup: 'hostname.dup' },
      steps: [
        { text: 'Veja o nome atual da máquina.', help: ['hostname'], cmd: 'hostname', check: { any: [{ ran: 'cmd:hostname' }, { ran: 'cmd:hostnamectl' }] } },
        { type: 'answer', text: 'De qual servidor é esse nome?', help: ['hostname', 'responder'], answer: { accept: ['{{dup}}'], normalize: 'text' } },
        { text: 'Mude o nome para {{dev.host}}.', help: ['hostnamectl', 'sudo'], cmd: 'sudo hostnamectl set-hostname {{dev.host}}', check: { state: 'hostname', eq: '{{dev.host}}' } },
        { text: 'Confira o nome novo.', help: ['hostname'], cmd: 'hostname', check: { ran: 'hostname-show:{{dev.host}}' } },
      ],
    },
    {
      id: 'jr1_senhas_erradas', n: 16, rank: 'jr1', title: 'Quantas senhas erradas no {{dev.name}}?', difficulty: 2, xp: 60, credits: 9,
      skill: 'seguranca', roles: ['seguranca', 'sysadmin'], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Relatório de segurança: quantas tentativas de login com senha errada o {{dev.name}} recebeu?',
      target: LNX, setup: { authlog: 'bruteforce' }, vars: { attacker: 'auth.attacker', n: 'auth.failed' },
      steps: [
        { text: 'Conte as linhas com "Failed password" no log de autenticação (grep -c conta).', help: ['grep'], cmd: 'grep -c "Failed password" /var/log/auth.log', check: { ran: 'grep:/var/log/auth.log' } },
        { type: 'answer', text: 'Quantas tentativas falharam?', help: ['grep', 'responder'], answer: { accept: ['{{n}}'], normalize: 'int' } },
      ],
    },
    {
      id: 'jr1_ficha_dois', n: 17, rank: 'jr1', title: 'Ficha técnica: {{dev.name}} e {{peer.name}}', difficulty: 2, xp: 60, credits: 9,
      skill: 'servidores', roles: ['servidores', 'tecnico'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O gestor quer saber quantos núcleos de processamento a empresa tem nesses dois servidores.',
      target: LNX, devices: { peer: 'server.peer' }, vars: { cores: 'sum:hw.cores' },
      steps: [
        { text: 'Veja o processador do {{dev.name}}.', help: ['lscpu'], cmd: 'lscpu', check: { ran: 'cmd:lscpu' } },
        { device: 'peer', text: 'Veja o processador do {{peer.name}}.', help: ['lscpu'], cmd: 'lscpu', check: { ran: 'cmd:lscpu' } },
        { device: 'peer', type: 'answer', text: 'Quantos núcleos (cores) os dois têm somados?', help: ['lscpu', 'responder'], answer: { accept: ['{{cores}}'], normalize: 'int' } },
      ],
    },
    {
      id: 'jr1_antes_reiniciar', n: 18, rank: 'jr1', title: 'Antes de reiniciar o {{dev.name}}', difficulty: 2, xp: 60, credits: 9,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O {{dev.name}} vai reiniciar na janela de manutenção. Antes, descubra o que mudou sem ser salvo e salve.',
      target: T(MSW, { linked: true, prefer: 'SW-01' }), setup: { swconfig: 'unsaved' }, vars: { port: 'sw.unsavedPort' },
      steps: [
        swEnable,
        { text: 'Veja a configuração em uso (running-config).', help: ['show-run'], cmd: 'show running-config', check: { ran: 'show-run' } },
        { text: 'Veja a configuração salva (startup-config).', help: ['show-start'], cmd: 'show startup-config', check: { ran: 'show-start' } },
        { type: 'answer', text: 'Qual porta tem uma descrição que ainda não foi salva?', help: ['show-run', 'responder'], answer: { accept: ['{{port}}'], normalize: 'port' } },
        { text: 'Salve a configuração em uso.', help: ['copy-run-start'], cmd: 'copy running-config startup-config', check: { state: 'sw.saved' } },
      ],
    },
    {
      id: 'jr1_ip_livre', n: 19, rank: 'jr1', title: 'O IP {{cand.ip}} está livre?', difficulty: 2, xp: 50, credits: 8,
      skill: 'redes', roles: ['redes', 'sysadmin'], bot_minutes: 8, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Antes de dar o IP {{cand.ip}} a um equipamento novo, confirme que ninguém já usa esse endereço.',
      target: LNX, vars: { cand: 'ip.cand' },
      steps: [
        { text: 'Do {{dev.name}}, faça ping no {{cand.ip}}.', help: ['ping'], cmd: 'ping -c 3 {{cand.ip}}', check: { any: [{ ran: 'ping-ok:{{cand.ip}}' }, { ran: 'ping-fail' }] } },
        { type: 'answer', text: 'O {{cand.ip}} já está em uso? (sim ou nao)', help: ['ping', 'responder'], answer: { accept: ['{{cand.used}}'], normalize: 'text' } },
      ],
    },
    {
      id: 'jr1_sem_rede_sem_cola', n: 20, rank: 'jr1', title: '{{dev.name}} sem rede: siga o cabo', difficulty: 3, xp: 90, credits: 14,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'O {{dev.name}} parou de responder. Você já fez isso antes: agora os passos do switch não vêm prontos.',
      target: LNX, devices: { sw: 'switch.of' }, setup: { fault: 'port', on: 'sw', quiet: true }, vars: { port: 'srv.port' },
      steps: [
        { text: 'No {{dev.name}}, teste o gateway {{gw}}.', help: ['ping'], cmd: 'ping -c 3 {{gw}}', check: { any: [{ ran: 'ping-fail' }, { at: 'sw', state: 'sw.healed', arg: '{{port}}' }] } },
        { text: 'Confira a eth0: se está UP e com IP, o problema não é no servidor.', help: ['ip-addr'], cmd: 'ip addr', check: showIfaces },
        { device: 'sw', text: 'No {{sw.name}}, ache a porta em erro.', help: ['enable', 'show-int'], auto: 'enable\nshow interfaces status', check: { any: [{ ran: 'show-int' }, { state: 'sw.healed', arg: '{{port}}' }] } },
        { device: 'sw', text: 'Reative a porta (desligue e ligue de novo).', help: ['conf-t', 'interface', 'shutdown', 'no-shutdown'], auto: 'configure terminal\ninterface {{port}}\nshutdown\nno shutdown\nend', check: { state: 'sw.healed', arg: '{{port}}' } },
        { text: 'Volte ao {{dev.name}} e teste o gateway.', help: ['ping'], cmd: 'ping -c 3 {{gw}}', check: pingGw },
      ],
    },

    /* ---------------- Júnior II: camada física (comando pronto só no 1º passo) ---------------- */
    {
      id: 'jr2_cabear_servidor', n: 1, rank: 'jr2', title: 'Cabear o {{dev.name}}', difficulty: 2, xp: 60, credits: 9,
      // roles: [] — only the player: the cable is the mission of this rank
      skill: 'redes', roles: [], bot_minutes: 15, weight: 1, trigger: 'auto', complete: 'steps',
      summary: 'Servidor novo no rack: leve o cabo da eth0 até uma porta gi0/… de um switch, direto ou pelo patch panel.',
      target: { kind: 'server', state: 'new', own: true },
      steps: [
        { text: 'Ligue o cabo da eth0 do {{dev.name}} numa porta de switch.', action: 'cabling', check: { state: 'state', in: ['link', 'online'] } },
      ],
    },
    {
      id: 'jr2_cabo_ou_interface', n: 2, rank: 'jr2', title: 'NO-CARRIER ou DOWN? · {{dev.name}}', difficulty: 3, xp: 90, credits: 14,
      skill: 'redes', roles: ['redes', 'tecnico', 'sysadmin'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'O {{dev.name}} caiu. Antes de mexer, diga em que camada está o problema: configuração (interface) ou física (cabo)?',
      target: LNX, setup: { fault: ['link', 'cable'] }, vars: { layer: 'fault.layer', layer2: 'fault.layer2' },
      steps: [
        { text: 'Veja o estado do link da eth0.', help: ['ip-link'], cmd: 'ip link', check: showIfaces },
        { type: 'answer', text: 'O problema é no cabo ou na interface?', help: ['ip-link', 'responder'], answer: { accept: ['{{layer}}', '{{layer2}}'], normalize: 'text' } },
        { text: 'Corrija: ligue a interface ou reconecte o cabo no rack.', help: ['ip-link-up', 'cabling'], action: 'cabling', auto: 'sudo ip link set eth0 up', check: { all: [{ state: 'eth0.up' }, { state: 'cable' }] } },
        { text: 'Teste o gateway {{gw}}.', help: ['ping'], auto: 'ping -c 3 {{gw}}', check: pingGw },
      ],
    },
    {
      id: 'jr2_porta_notconnect', n: 3, rank: 'jr2', title: 'Porta notconnect no {{sw.name}}', difficulty: 3, xp: 90, credits: 14,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'O {{dev.name}} saiu da rede. No servidor está tudo configurado: siga o cabo até o {{sw.name}}.',
      target: T(LNX, { directLink: true }), devices: { sw: 'switch.of' }, setup: { fault: 'cable', opts: { far: true } }, vars: { port: 'cable.port' },
      steps: [
        { text: 'No {{dev.name}}, veja o link da eth0.', help: ['ip-link'], cmd: 'ip link', check: showIfaces },
        { device: 'sw', text: 'No {{sw.name}}, veja o status das portas: a do {{dev.name}} sumiu da lista (notconnect).', help: ['enable', 'show-int'], auto: 'enable\nshow interfaces status', check: { any: [{ ran: 'show-int' }, { at: 'dev', state: 'cable' }] } },
        { text: 'O cabo se soltou do lado do switch: reconecte no rack.', help: ['cabling'], action: 'cabling', check: { state: 'cable' } },
        { device: 'sw', text: 'Confira no {{sw.name}}: a {{port}} voltou a connected?', help: ['show-int'], auto: 'enable\nshow interfaces status', check: { ran: 'show-int-ok:{{port}}' } },
      ],
    },
    {
      id: 'jr2_dois_racks', n: 4, rank: 'jr2', title: 'Cabos bagunçados no {{rack.id}} e no {{outro.id}}', difficulty: 2, xp: 60, credits: 9,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'steps',
      summary: 'Depois da instalação dos servidores novos, dois racks ficaram com os cabos embolados. Organize os dois.',
      target: { kind: 'rack', cabled: true }, devices: { outro: 'rack.other' }, setup: { rack: 'messy2' },
      steps: [
        { text: 'Organize os cabos do {{rack.id}}.', action: 'cabling', check: { state: 'rack.tidy' } },
        { device: 'outro', text: 'Organize os cabos do {{outro.id}}.', action: 'cabling', check: { state: 'rack.tidy' } },
      ],
    },
    {
      id: 'jr2_camera', n: 5, rank: 'jr2', title: 'Câmera na sala', difficulty: 2, xp: 60, credits: 9,
      skill: 'redes', roles: [], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'steps',
      summary: 'A segurança pediu uma câmera na sala. A Câmera IP recebe energia pelo cabo de rede (PoE): precisa de um switch PoE na mesma sala.',
      target: { kind: 'rack' }, vars: { n: 'items:camera' },
      steps: [
        { text: 'Instale uma Câmera IP numa parede, numa sala com switch PoE (sem PoE ela fica sem energia).', action: 'build', check: { state: 'items', arg: 'camera', gt: '{{n}}' } },
      ],
    },
    {
      id: 'jr2_wifi', n: 6, rank: 'jr2', title: 'Wi-Fi para os visitantes', difficulty: 2, xp: 60, credits: 9,
      skill: 'redes', roles: [], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'steps',
      summary: 'Os clientes que visitam o datacenter pedem Wi-Fi. O access point também é alimentado por PoE.',
      target: { kind: 'rack' }, vars: { n: 'items:ap' },
      steps: [
        { text: 'Instale um Access point Wi-Fi numa parede, numa sala com switch PoE.', action: 'build', check: { state: 'items', arg: 'ap', gt: '{{n}}' } },
      ],
    },
    {
      id: 'jr2_duas_portas', n: 7, rank: 'jr2', title: 'Duas portas fora no {{dev.name}}', difficulty: 3, xp: 100, credits: 15,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'Dois servidores do {{dev.name}} caíram juntos. Uma porta entrou em erro e a outra alguém desligou e esqueceu.',
      target: T(MSW, { linkedMin: 2 }), setup: { fault: 'port2' }, vars: { bad: 'sw.bad', off: 'sw.off' },
      steps: [
        swEnable,
        { text: 'Veja o status das portas: uma está err-disabled e outra disabled.', help: ['show-int'], auto: 'show interfaces status', check: { ran: 'show-int' } },
        { text: 'Reative a porta em err-disabled ({{bad}}).', help: ['conf-t', 'interface', 'shutdown', 'no-shutdown'], auto: 'configure terminal\ninterface {{bad}}\nshutdown\nno shutdown', check: { state: 'sw.healed', arg: '{{bad}}' } },
        { text: 'Ligue a porta desligada ({{off}}).', help: ['interface', 'no-shutdown'], auto: 'interface {{off}}\nno shutdown', check: { state: 'sw.port', arg: '{{off}}', ne: 'disabled' } },
        { text: 'Volte (end) e salve a configuração.', help: ['end', 'copy-run-start'], auto: 'end\ncopy running-config startup-config', check: { ran: 'config-saved' } },
      ],
    },
    {
      id: 'jr2_quem_na_porta', n: 8, rank: 'jr2', title: 'Quem está na {{srv.port}} do {{dev.name}}?', difficulty: 2, xp: 60, credits: 9,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'A etiqueta da porta {{srv.port}} do {{dev.name}} caiu. Descubra qual servidor está ligado nela.',
      target: T(MSW, { direct: true }), vars: { srv: 'sw.direct' },
      steps: [
        swEnable,
        { text: 'Veja quem está em cada porta.', help: ['show-int'], auto: 'show interfaces status', check: { ran: 'show-int' } },
        { type: 'answer', text: 'Qual servidor está na {{srv.port}}?', help: ['show-int', 'responder'], answer: { accept: ['{{srv.name}}'], normalize: 'text' } },
      ],
    },
    {
      id: 'jr2_cabo_porta_errada', n: 9, rank: 'jr2', title: 'Cabo na porta errada · {{dev.name}}', difficulty: 2, xp: 70, credits: 11,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'Numa troca de cabo, o {{dev.name}} foi parar na porta de uplink (te1) do switch, que é reservada. No cabeamento o cabo fica vermelho.',
      target: T(LNX, { te1free: true }), setup: { fault: 'cablewrong' },
      steps: [
        { text: 'Veja o link da eth0: sem sinal (NO-CARRIER)?', help: ['ip-link'], cmd: 'ip link', check: showIfaces },
        { text: 'No cabeamento, passe o cabo da te1 para uma porta gi0/… livre.', help: ['cabling'], action: 'cabling', check: { state: 'cable' } },
        { text: 'Teste o gateway {{gw}}.', help: ['ping'], auto: 'ping -c 3 {{gw}}', check: pingGw },
      ],
    },
    {
      id: 'jr2_placa_perfurada', n: 10, rank: 'jr2', title: 'O {{rack.id}} está esquentando', difficulty: 2, xp: 60, credits: 9,
      skill: 'servidores', roles: [], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'steps',
      summary: 'O ar frio não chega na frente do {{rack.id}}. Uma placa perfurada no piso leva o ar do corredor frio até os servidores.',
      target: { kind: 'rack', cabled: true }, vars: { n: 'items:ventile' },
      steps: [
        { text: 'Instale uma Placa perfurada no piso em frente ao rack (Construir → Racks).', action: 'build', check: { state: 'items', arg: 'ventile', gt: '{{n}}' } },
      ],
    },
    {
      id: 'jr2_link_instavel', n: 11, rank: 'jr2', title: 'Link instável no {{dev.name}}', difficulty: 3, xp: 90, credits: 14,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'O {{dev.name}} cai e volta há uma hora, e agora caiu de vez. O syslog conta a história: cabo com mau contato.',
      target: LNX, setup: { fault: 'flap' }, vars: { n: 'flap.n' },
      steps: [
        { text: 'Veja as mensagens do sistema sobre a eth0.', help: ['grep'], cmd: 'grep eth0 /var/log/syslog', check: { ran: 'grep-hit:/var/log/syslog' } },
        { type: 'answer', text: 'Quantas vezes o link caiu (Link is Down)?', help: ['grep', 'responder'], answer: { accept: ['{{n}}'], normalize: 'int' } },
        { text: 'Cabo com mau contato: reconecte no rack.', help: ['cabling'], action: 'cabling', check: { state: 'cable' } },
        { text: 'Teste o gateway {{gw}}.', help: ['ping'], auto: 'ping -c 3 {{gw}}', check: pingGw },
      ],
    },
    {
      id: 'jr2_configurar_servidor', n: 12, rank: 'jr2', title: 'Configurar o {{dev.name}}', difficulty: 3, xp: 90, credits: 14,
      skill: 'sistemas', roles: ['sysadmin', 'servidores'], bot_minutes: 20, weight: 1, trigger: 'auto', complete: 'online', lesson: 'setup_jr2',
      summary: 'O {{dev.name}} já tem cabo. Agora os passos dizem só o que fazer: os comandos são com você.',
      target: NEW,
    },
    {
      id: 'jr2_portas_livres', n: 13, rank: 'jr2', title: 'Quantas portas livres no {{dev.name}}?', difficulty: 2, xp: 60, credits: 9,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 8, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Chegam servidores novos. Quantos ainda cabem no {{dev.name}} antes de precisar de outro switch?',
      target: T(MSW, { linked: true }), vars: { free: 'sw.count:notconnect' },
      steps: [
        swEnable,
        { text: 'Veja o status das portas: as livres aparecem no fim, como "sem cabo (notconnect)".', help: ['show-int'], auto: 'show interfaces status', check: { ran: 'show-int' } },
        { type: 'answer', text: 'Quantas portas estão livres?', help: ['show-int', 'responder'], answer: { accept: ['{{free}}'], normalize: 'int' } },
      ],
    },
    {
      id: 'jr2_ip_do_switch', n: 14, rank: 'jr2', title: 'Qual o IP de gerência do {{dev.name}}?', difficulty: 2, xp: 60, credits: 9,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O switch também tem IP, para ser gerenciado pela rede. Descubra qual é e teste a rede a partir dele.',
      target: T(MSW, { direct: true }), vars: { srv: 'sw.direct' },
      steps: [
        swEnable,
        { text: 'Veja a configuração em uso: o IP fica na interface Vlan.', help: ['show-run'], auto: 'show running-config', check: { ran: 'show-run' } },
        { type: 'answer', text: 'Qual é o IP de gerência do {{dev.name}}?', help: ['show-run', 'responder'], answer: { accept: ['{{dev.ip}}'], normalize: 'ip' } },
        { text: 'Do próprio switch, faça ping no {{srv.name}} ({{srv.ip}}).', help: ['sw-ping'], auto: 'ping {{srv.ip}}', check: { ran: 'ping-ok:{{srv.ip}}' } },
      ],
    },
    {
      id: 'jr2_sumiu_do_monitor', n: 15, rank: 'jr2', title: '{{dev.name}} sumiu do monitor', difficulty: 3, xp: 90, credits: 14,
      skill: 'redes', roles: ['redes', 'sysadmin', 'tecnico'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'O monitor marcou o {{dev.name}} como fora. Confirme de outro servidor, conserte e teste de novo de lá.',
      target: LNX, devices: { peer: 'server.peer' }, setup: { fault: 'link', quiet: true },
      steps: [
        { device: 'peer', text: 'Do {{peer.name}}, faça ping no {{dev.name}} ({{dev.ip}}).', help: ['ping'], cmd: 'ping -c 3 {{dev.ip}}', check: { any: [{ ran: 'cmd:ping' }, { at: 'dev', state: 'eth0.up' }] } },
        { text: 'No {{dev.name}}, veja as interfaces.', help: ['ip-link'], auto: 'ip link', check: showIfaces },
        { text: 'Ligue a interface que caiu.', help: ['ip-link-up', 'sudo'], auto: 'sudo ip link set eth0 up', check: { state: 'eth0.up' } },
        { device: 'peer', text: 'Do {{peer.name}}, faça o ping de novo.', help: ['ping'], auto: 'ping -c 3 {{dev.ip}}', check: { ran: 'ping-ok:{{dev.ip}}' } },
      ],
    },
    {
      id: 'jr2_porta_desligada', n: 16, rank: 'jr2', title: 'Porta desligada no {{sw.name}}', difficulty: 3, xp: 90, credits: 14,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'O {{dev.name}} caiu sem nenhum erro no servidor. Alguém mexeu no {{sw.name}} e desligou a porta dele.',
      target: LNX, devices: { sw: 'switch.of' }, setup: { fault: 'portoff', on: 'sw' }, vars: { port: 'srv.port' },
      steps: [
        T(swEnable, { device: 'sw', text: 'No {{sw.name}}, entre no modo privilegiado.' }),
        { device: 'sw', text: 'Veja o status das portas: qual está disabled?', help: ['show-int'], auto: 'show interfaces status', check: { ran: 'show-int' } },
        { device: 'sw', text: 'Ligue a porta de novo.', help: ['conf-t', 'interface', 'no-shutdown'], auto: 'configure terminal\ninterface {{port}}\nno shutdown', check: { state: 'sw.port', arg: '{{port}}', ne: 'disabled' } },
        { device: 'sw', text: 'Volte (end) e salve a configuração.', help: ['end', 'copy-run-start'], auto: 'end\ncopy running-config startup-config', check: { ran: 'config-saved' } },
        { text: 'No {{dev.name}}, teste o gateway.', help: ['ping'], auto: 'ping -c 3 {{gw}}', check: pingGw },
      ],
    },
    {
      id: 'jr2_qual_sem_ssh', n: 17, rank: 'jr2', title: 'Acesso remoto falhando: {{dev.name}} ou {{peer.name}}?', difficulty: 3, xp: 80, credits: 12,
      skill: 'sistemas', roles: ['sysadmin', 'seguranca'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'Um dos dois servidores não aceita mais SSH. Descubra qual e suba o serviço.',
      target: LNX, devices: { peer: 'server.peer' }, setup: { fault: 'sshstop', on: ['dev', 'peer'], pick: true, quiet: true },
      vars: { who: 'faulty:sshstop', role: 'faultyRole:sshstop' },
      steps: [
        { text: 'No {{dev.name}}, veja as portas em escuta.', help: ['ss', 'sudo'], cmd: 'sudo ss -tlnp', check: { ran: 'ss' } },
        { device: 'peer', text: 'No {{peer.name}}, faça o mesmo.', help: ['ss', 'sudo'], auto: 'sudo ss -tlnp', check: { ran: 'ss' } },
        { device: 'peer', type: 'answer', text: 'Qual dos dois não escuta na porta 22?', help: ['ss', 'responder'], answer: { accept: ['{{who}}'], normalize: 'text' } },
        { device: 'any', text: 'Inicie o ssh no servidor que está sem ele.', help: ['systemctl-start', 'sudo'], auto: 'sudo systemctl start ssh', check: { at: '{{role}}', state: 'service', arg: 'ssh', eq: 'active' } },
      ],
    },
    {
      id: 'jr2_ataque_dois', n: 18, rank: 'jr2', title: 'Ataque em dois servidores', difficulty: 3, xp: 90, credits: 14,
      skill: 'seguranca', roles: ['seguranca', 'sysadmin'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O monitor acusou tentativas de login por SSH no {{dev.name}} e no {{peer.name}}. Ache o IP que ataca os dois.',
      handoff: 'o IP vai para a segurança bloquear no firewall',
      target: LNX, devices: { peer: 'server.peer' }, setup: { authlog: 'bruteforce2' }, vars: { attacker: 'auth.attacker' },
      steps: [
        { text: 'No {{dev.name}}, filtre as senhas erradas do log de autenticação.', help: ['grep'], cmd: 'grep "Failed password" /var/log/auth.log', check: { ran: 'grep-failed:/var/log/auth.log' } },
        { device: 'peer', text: 'Faça o mesmo no {{peer.name}}.', help: ['grep'], auto: 'grep "Failed password" /var/log/auth.log', check: { ran: 'grep-failed:/var/log/auth.log' } },
        { device: 'peer', type: 'answer', text: 'Qual IP aparece atacando os dois?', help: ['grep', 'responder'], answer: { accept: ['{{attacker}}'], normalize: 'ip' } },
      ],
    },
    {
      id: 'jr2_disco_sem_roteiro', n: 19, rank: 'jr2', title: 'Disco cheio no {{dev.name}}', difficulty: 3, xp: 90, credits: 14,
      skill: 'servidores', roles: ['sysadmin', 'servidores'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'O disco do {{dev.name}} passou de 90%. Você já sabe o caminho: agora sem o comando pronto.',
      target: LNX, setup: { fault: 'disk' },
      steps: [
        { text: 'Descubra o uso do disco.', help: ['df'], cmd: 'df -h', check: { ran: 'df' } },
        { text: 'Ache a pasta culpada (os logs ficam em /var/log).', help: ['du'], auto: 'du -sh /var/log', check: { ran: 'du:/var/log' } },
        { text: 'Libere espaço até o disco ficar abaixo de 80%.', help: ['journalctl-vacuum', 'sudo'], auto: 'sudo journalctl --vacuum-size=200M', check: { state: 'disk', lt: 80 } },
        { text: 'Prove com o uso de disco atualizado.', help: ['df'], auto: 'df -h', check: { ran: 'df-ok' } },
      ],
    },
    {
      id: 'jr2_site_fora_dois', n: 20, rank: 'jr2', title: 'Site fora no {{dev.name}} e no {{peer.name}}', difficulty: 3, xp: 100, credits: 15,
      skill: 'sistemas', roles: ['sysadmin'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'Uma atualização derrubou o nginx em dois servidores ao mesmo tempo. Suba os dois e confirme.',
      target: T(LNX, { web: true }), devices: { peer: 'server.peer' }, setup: { fault: 'service', on: ['dev', 'peer'] },
      steps: [
        { text: 'No {{dev.name}}, veja o estado do nginx.', help: ['systemctl-status'], cmd: 'systemctl status nginx', check: { ran: 'status:nginx' } },
        { text: 'Reinicie o nginx do {{dev.name}}.', help: ['systemctl-restart', 'sudo'], auto: 'sudo systemctl restart nginx', check: { state: 'service', arg: 'nginx', eq: 'active' } },
        { text: 'Confirme que o site do {{dev.name}} responde.', help: ['curl'], auto: 'curl localhost', check: { ran: 'curl-ok' } },
        { device: 'peer', text: 'Agora o {{peer.name}}: reinicie o nginx.', help: ['systemctl-restart', 'sudo'], auto: 'sudo systemctl restart nginx', check: { state: 'service', arg: 'nginx', eq: 'active' } },
        { device: 'peer', text: 'Confirme que o site do {{peer.name}} responde.', help: ['curl'], auto: 'curl localhost', check: { ran: 'curl-ok' } },
      ],
    },

    /* ---------------- Júnior III: sem comando pronto · primeiro Windows ---------------- */
    {
      id: 'jr3_servidor_sem_roteiro', n: 1, rank: 'jr3', title: 'Servidor novo, sem roteiro · {{dev.name}}', difficulty: 3, xp: 100, credits: 15,
      skill: 'sistemas', roles: ['sysadmin', 'servidores'], bot_minutes: 20, weight: 1, trigger: 'auto', complete: 'online', lesson: 'setup_jr3',
      summary: 'Coloque o {{dev.name}} em produção: IP, rota, nome e teste. Cada passo diz só o resultado esperado.',
      target: NEW,
    },
    {
      id: 'jr3_ip_de_outro', n: 2, rank: 'jr3', title: 'O {{dev.name}} pegou o IP de outro servidor', difficulty: 3, xp: 110, credits: 16,
      skill: 'redes', roles: ['redes', 'sysadmin'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'Conflito de IP: o {{dev.name}} foi configurado com o endereço de outro servidor e sumiu do monitor.',
      target: LNX, devices: { peer: 'server.peer' }, setup: { fault: 'wrongip', ipOf: 'peer' }, vars: { bad: 'os.badIp' },
      steps: [
        { text: 'Veja o endereço da eth0.', help: ['ip-addr'], auto: 'ip addr', check: { ran: 'ip-show' } },
        { type: 'answer', text: 'Esse IP é de qual servidor? (o Monitor e o Infra mostram o IP de cada um)', help: ['ip-addr', 'responder'], answer: { accept: ['{{peer.name}}'], normalize: 'text' } },
        { text: 'Tire o IP que não é dele.', help: ['ip-addr-del'], auto: 'sudo ip addr del {{bad}}/24 dev eth0', check: { not: { state: 'eth0.has', arg: '{{bad}}' } } },
        { text: 'O {{dev.name}} responde no IP dele, {{dev.ip}}/24.', help: ['ip-addr-add'], auto: 'sudo ip addr add {{dev.ip}}/24 dev eth0', check: { state: 'eth0.ip' } },
        { text: 'O gateway responde.', help: ['ping'], auto: 'ping -c 3 {{gw}}', check: pingGw },
      ],
    },
    {
      id: 'jr3_gateway_do_chamado', n: 3, rank: 'jr3', title: 'O chamado veio errado · {{dev.name}}', difficulty: 3, xp: 110, credits: 16,
      skill: 'redes', roles: ['sysadmin', 'redes'], bot_minutes: 20, weight: 1, trigger: 'auto', complete: 'online', lesson: 'setup_ticket',
      summary: 'O chamado de configuração do {{dev.name}} traz um gateway errado. Configure, perceba o erro e ache o certo.',
      target: NEW,
    },
    {
      id: 'jr3_instalar_windows', n: 4, rank: 'jr3', title: 'Instalar o Windows Server · {{dev.name}}', difficulty: 3, xp: 110, credits: 16,
      // roles: [] — the crew doesn't install Windows (ops.configure is Linux only)
      skill: 'sistemas', roles: [], bot_minutes: 25, weight: 1, trigger: 'auto', complete: 'online', lesson: 'winsetup',
      summary: 'Você especializou o {{dev.name}} como Windows Server. Instale pela mídia, defina a senha do Administrador, IP fixo, nome e teste.',
      target: { kind: 'server', state: 'link', own: true, os: 'windows' },
    },
    {
      id: 'jr3_win_nome_padrao', n: 5, rank: 'jr3', title: 'Windows com nome padrão · {{dev.name}}', difficulty: 3, xp: 100, credits: 15,
      skill: 'sistemas', roles: ['sysadmin'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O {{dev.name}} voltou de uma reinstalação com o nome automático (WIN-…). O padrão da empresa é o nome do equipamento.',
      target: T(WIN, { domain: false }), setup: { win: 'host' },
      steps: [
        { text: 'Veja o nome atual do computador.', help: ['win-rename'], auto: 'hostname', check: { any: [{ ran: 'cmd:hostname' }, { ran: 'cmd:$env:computername' }, { ran: 'cmd:sconfig' }] } },
        { text: 'O computador se chama {{dev.name}} (o nome só vale depois de reiniciar).', help: ['win-rename', 'win-restart'], auto: 'Rename-Computer -NewName {{dev.name}} -Restart', check: { state: 'win.named' } },
      ],
    },
    {
      id: 'jr3_win_apipa', n: 6, rank: 'jr3', title: 'Windows sem IP · {{dev.name}}', difficulty: 3, xp: 100, credits: 15,
      skill: 'redes', roles: ['sysadmin', 'redes'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'O {{dev.name}} (Windows) perdeu o IP fixo depois de uma atualização e saiu da rede.',
      target: WIN, setup: { fault: 'winnoip' },
      steps: [
        { text: 'Veja a configuração de rede.', help: ['win-ipconfig'], auto: 'ipconfig /all', check: { ran: 'ip-show' } },
        { type: 'answer', text: 'Com que endereço o adaptador ficou? (os dois primeiros números)', help: ['win-ipconfig', 'responder'], answer: { accept: ['169.254', 'apipa', '169.254.x.x'], normalize: 'text' } },
        { text: 'O servidor tem o IP fixo {{dev.ip}}/24 e o gateway {{gw}}.', help: ['win-newip'], auto: 'New-NetIPAddress -InterfaceAlias Ethernet -IPAddress {{dev.ip}} -PrefixLength 24 -DefaultGateway {{gw}}', check: { all: [{ state: 'eth0.ip' }, { state: 'route', eq: '{{gw}}' }] } },
        { text: 'O gateway responde.', help: ['win-ping'], auto: 'ping {{gw}}', check: pingGw },
      ],
    },
    {
      id: 'jr3_win_adaptador', n: 7, rank: 'jr3', title: 'Adaptador desabilitado · {{dev.name}}', difficulty: 2, xp: 80, credits: 12,
      skill: 'redes', roles: ['sysadmin', 'redes', 'tecnico'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'fixed', lesson: 'win-link',
      summary: 'O {{dev.name}} (Windows) sumiu da rede. Alguém desabilitou o adaptador Ethernet.',
      target: WIN, setup: { fault: 'link' },
    },
    {
      id: 'jr3_win_dns_cliente', n: 8, rank: 'jr3', title: 'DNS apontando para fora · {{dev.name}}', difficulty: 3, xp: 100, credits: 15,
      skill: 'redes', roles: ['sysadmin', 'redes'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O controlador de domínio {{dev.name}} está consultando um DNS público (8.8.8.8), que não conhece o domínio {{dom}}. Num DC, o DNS é ele mesmo.',
      target: T(WIN, { domain: true }), setup: { win: 'dns' }, vars: { dom: 'win.domain' },
      steps: [
        { text: 'Veja quais servidores DNS o {{dev.name}} consulta.', help: ['win-dnsclient'], auto: 'Get-DnsClientServerAddress', check: { ran: 'dns-client-show' } },
        { text: 'O {{dev.name}} consulta a si mesmo (127.0.0.1).', help: ['win-dnsclient'], auto: 'Set-DnsClientServerAddress -InterfaceAlias Ethernet -ServerAddresses 127.0.0.1', check: { state: 'win.dnsself' } },
        { text: 'O nome do domínio {{dom}} resolve.', help: ['win-resolve'], auto: 'Resolve-DnsName {{dom}}', check: { any: [{ ran: 'win-dns-ok:{{dom}}' }, { ran: 'cmd:resolve-dnsname' }, { ran: 'cmd:nslookup' }] } },
      ],
    },
    {
      id: 'jr3_tres_falhas', n: 9, rank: 'jr3', title: 'Rede desconfigurada no {{dev.name}}', difficulty: 3, xp: 110, credits: 16,
      skill: 'redes', roles: ['redes', 'sysadmin'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'O {{dev.name}} voltou da manutenção com a rede toda desfeita: interface, IP e rota.',
      target: LNX, setup: { fault: 'noip3' },
      steps: [
        { text: 'Descubra o que está errado na rede do servidor.', help: ['ip-addr', 'ip-route'], auto: 'ip addr\nip route', check: { all: [{ ran: 'ip-show' }, { ran: 'route-show' }] } },
        { text: 'A interface está ativa.', help: ['ip-link-up'], auto: 'sudo ip link set eth0 up', check: { state: 'eth0.up' } },
        { text: 'O servidor responde no IP {{dev.ip}}/24.', help: ['ip-addr-add'], auto: 'sudo ip addr add {{dev.ip}}/24 dev eth0', check: { state: 'eth0.ip' } },
        { text: 'Existe rota padrão pelo {{gw}}.', help: ['ip-route-add'], auto: 'sudo ip route add default via {{gw}}', check: { state: 'route', eq: '{{gw}}' } },
        { text: 'A internet responde.', help: ['ping'], auto: 'ping -c 3 8.8.8.8', check: { ran: 'ping-ok:8.8.8.8' } },
      ],
    },
    {
      id: 'jr3_reinstalacao', n: 10, rank: 'jr3', title: 'O {{dev.name}} voltou da reinstalação', difficulty: 3, xp: 100, credits: 15,
      skill: 'sistemas', roles: ['sysadmin'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'Reinstalaram o sistema do {{dev.name}}: ele voltou com o nome padrão e sem IP.',
      target: LNX, setup: { fault: 'reinstall' },
      steps: [
        { text: 'Veja o nome e a rede da máquina.', help: ['hostname', 'ip-addr'], auto: 'hostname\nip addr', check: { all: [{ any: [{ ran: 'cmd:hostname' }, { ran: 'cmd:hostnamectl' }] }, { ran: 'ip-show' }] } },
        { text: 'O nome volta a ser {{dev.host}}.', help: ['hostnamectl'], auto: 'sudo hostnamectl set-hostname {{dev.host}}', check: { state: 'hostname', eq: '{{dev.host}}' } },
        { text: 'O IP volta a ser {{dev.ip}}/24.', help: ['ip-addr-add'], auto: 'sudo ip addr add {{dev.ip}}/24 dev eth0', check: { state: 'eth0.ip' } },
        { text: 'A rota padrão volta a ser pelo {{gw}}.', help: ['ip-route-add'], auto: 'sudo ip route add default via {{gw}}', check: { state: 'route', eq: '{{gw}}' } },
        { text: 'A internet responde.', help: ['ping'], auto: 'ping -c 3 8.8.8.8', check: { ran: 'ping-ok:8.8.8.8' } },
      ],
    },
    {
      // the main device is the one that fails; the steps never name it before the player finds it
      id: 'jr3_teste_malha', n: 11, rank: 'jr3', title: 'Teste de malha a partir do {{peer.name}}', difficulty: 3, xp: 120, credits: 18,
      skill: 'redes', roles: ['redes', 'sysadmin', 'tecnico'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'Rotina do turno: do {{peer.name}}, teste {{ips}}. Se algum não responder, descubra qual é e conserte.',
      target: LNX, devices: { peer: 'server.peer', alt: 'server.peer', third: 'server.peer' }, setup: { fault: 'link', quiet: true }, vars: { ips: 'ips:dev,alt,third' },
      steps: [
        { device: 'peer', text: 'Do {{peer.name}}, faça ping em cada um: {{ips}}.', help: ['ping'], auto: 'ping -c 3 {{alt.ip}}\nping -c 3 {{dev.ip}}\nping -c 3 {{third.ip}}', check: { all: [{ ran: 'cmd:ping' }, { ran: 'ping-fail' }] } },
        { device: 'peer', type: 'answer', text: 'Qual IP não respondeu?', help: ['ping', 'responder'], answer: { accept: ['{{dev.ip}}'], normalize: 'ip' } },
        { text: 'Abra o console desse servidor e ponha a rede de volta.', help: ['ip-link', 'ip-link-up'], auto: 'sudo ip link set eth0 up', check: { state: 'eth0.up' } },
        { device: 'peer', text: 'Do {{peer.name}}, confirme que ele responde.', help: ['ping'], auto: 'ping -c 3 {{dev.ip}}', check: { ran: 'ping-ok:{{dev.ip}}' } },
      ],
    },
    {
      id: 'jr3_nas', n: 12, rank: 'jr3', title: 'NAS para os arquivos', difficulty: 2, xp: 80, credits: 12,
      skill: 'servidores', roles: [], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'steps',
      summary: 'Os arquivos da equipe estão espalhados pelos servidores. Um NAS de 4 baias guarda tudo num lugar só, com RAID.',
      target: { kind: 'rack' }, vars: { n: 'items:nas_4,nas_8' },
      steps: [
        { text: 'Instale um NAS 4 baias (Construir → Equipamentos → Storage).', action: 'build', check: { state: 'items', arg: 'nas_4,nas_8', gt: '{{n}}' } },
      ],
    },
    {
      id: 'jr3_pdu', n: 13, rank: 'jr3', title: 'Quadro de energia dos racks', difficulty: 2, xp: 80, credits: 12,
      skill: 'servidores', roles: [], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'steps',
      summary: 'Com mais servidores, as tomadas da sala não dão conta. Um quadro PDU distribui a energia para os racks.',
      target: { kind: 'rack' }, vars: { n: 'items:pdu' },
      steps: [
        { text: 'Instale um Quadro PDU perto dos racks (Construir → Energia).', action: 'build', check: { state: 'items', arg: 'pdu', gt: '{{n}}' } },
      ],
    },
    {
      id: 'jr3_switch_48', n: 14, rank: 'jr3', title: 'Trocar o switch lotado', difficulty: 3, xp: 100, credits: 15,
      skill: 'redes', roles: [], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'steps',
      summary: 'Os switches de 24 portas estão enchendo. Instale um de 48 portas e comece a passar os servidores para ele.',
      target: { kind: 'rack' }, vars: { sw: 'devs:sw_48', on: 'on.model:sw_48' },
      steps: [
        { text: 'Instale um Switch gerenciável 48p num rack.', action: 'build', check: { state: 'devs', arg: 'sw_48', gt: '{{sw}}' } },
        { text: 'Passe o cabo de pelo menos um servidor para ele (Cabeamento).', action: 'cabling', check: { state: 'on.model', arg: 'sw_48', gt: '{{on}}' } },
      ],
    },
    {
      id: 'jr3_win_iis', n: 15, rank: 'jr3', title: 'O IIS já está instalado? · {{dev.name}}', difficulty: 3, xp: 100, credits: 15,
      skill: 'sistemas', roles: ['sysadmin'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Um cliente quer hospedar um site .NET no {{dev.name}}. Confira se o servidor web do Windows (IIS) existe e instale.',
      target: T(WIN, { lacks: 'Web-Server' }), vars: { iis: 'win.iis' },
      steps: [
        { text: 'Liste as funções do servidor ([X] = instalada).', help: ['win-features'], auto: 'Get-WindowsFeature', check: { ran: 'win-features' } },
        { type: 'answer', text: 'O Web Server (IIS) já está instalado? (sim ou nao)', help: ['win-features', 'responder'], answer: { accept: ['{{iis}}'], normalize: 'text' } },
        { text: 'O IIS está instalado, com as ferramentas de gerenciamento.', help: ['win-feature'], auto: 'Install-WindowsFeature Web-Server -IncludeManagementTools', check: { state: 'win.has', arg: 'Web-Server' } },
      ],
    },
    {
      id: 'jr3_win_reinicio', n: 16, rank: 'jr3', title: 'Quem reiniciou o {{dev.name}}?', difficulty: 3, xp: 100, credits: 15,
      skill: 'seguranca', roles: ['sysadmin', 'seguranca'], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O {{dev.name}} reiniciou no meio do expediente. O log System do Windows guarda quem pediu (evento 1074).',
      target: WIN, setup: { win: 'reboot' }, vars: { by: 'win.rebootBy' },
      steps: [
        { text: 'Veja os eventos recentes do log System.', help: ['win-event'], auto: 'Get-WinEvent -LogName System -MaxEvents 5', check: { ran: 'win-events:system' } },
        { type: 'answer', text: 'Qual usuário pediu o reinício (evento 1074)?', help: ['win-event', 'responder'], answer: { accept: ['{{by}}'], normalize: 'text' } },
      ],
    },
    {
      id: 'jr3_win_servico', n: 17, rank: 'jr3', title: 'Serviço parado no {{dev.name}}', difficulty: 3, xp: 100, credits: 15,
      skill: 'sistemas', roles: ['sysadmin'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'fixed', lesson: 'winsvc',
      summary: 'Uma função do controlador de domínio {{dev.name}} parou. Ache o serviço, veja no log quando parou e suba de novo.',
      target: T(WIN, { domain: true }), setup: { fault: 'winsvc' },
    },
    {
      id: 'jr3_nginx_disco', n: 18, rank: 'jr3', title: 'O nginx não sobe no {{dev.name}}', difficulty: 3, xp: 120, credits: 18,
      skill: 'servidores', roles: ['sysadmin', 'servidores'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'O site do {{dev.name}} caiu e o nginx não volta nem com restart. A mensagem de erro diz o motivo.',
      target: T(LNX, { web: true }), setup: { fault: 'disksvc' },
      steps: [
        { text: 'Veja por que o nginx falhou.', help: ['systemctl-status'], auto: 'systemctl status nginx', check: { ran: 'status:nginx' } },
        { text: '"No space left on device": confira o disco.', help: ['df'], auto: 'df -h', check: { ran: 'df' } },
        { text: 'O disco fica abaixo de 80%.', help: ['du', 'journalctl-vacuum'], auto: 'sudo journalctl --vacuum-size=200M', check: { state: 'disk', lt: 80 } },
        { text: 'O nginx está rodando.', help: ['systemctl-restart'], auto: 'sudo systemctl restart nginx', check: { state: 'service', arg: 'nginx', eq: 'active' } },
        { text: 'O site responde.', help: ['curl'], auto: 'curl localhost', check: { ran: 'curl-ok' } },
      ],
    },
    {
      id: 'jr3_ip_a_mais', n: 19, rank: 'jr3', title: 'IP a mais no {{dev.name}}', difficulty: 3, xp: 90, credits: 14,
      skill: 'redes', roles: ['redes', 'sysadmin'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'Conflito de IP na rede: o {{dev.name}} responde também num endereço que não é dele.',
      target: LNX, setup: { fault: 'extraip' }, vars: { extra: 'os.extraIp' },
      steps: [
        { text: 'Veja os endereços da eth0.', help: ['ip-addr'], auto: 'ip addr', check: { ran: 'ip-show' } },
        { type: 'answer', text: 'Qual endereço não devia estar lá?', help: ['ip-addr', 'responder'], answer: { accept: ['{{extra}}'], normalize: 'ip' } },
        { text: 'A eth0 fica só com o IP dela, {{dev.ip}}/24.', help: ['ip-addr-del'], auto: 'sudo ip addr del {{extra}}/24 dev eth0', check: { all: [{ not: { state: 'eth0.has', arg: '{{extra}}' } }, { state: 'eth0.ip' }] } },
        { text: 'O gateway responde.', help: ['ping'], auto: 'ping -c 3 {{gw}}', check: pingGw },
      ],
    },
    {
      id: 'jr3_documentar', n: 20, rank: 'jr3', title: 'Documente o {{dev.name}}', difficulty: 3, xp: 100, credits: 15,
      skill: 'servidores', roles: ['servidores', 'tecnico', 'redes'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Ficha do inventário: o IP do {{dev.name}}, quantos núcleos ele tem e em que porta do switch ele está.',
      target: T(LNX, { directLink: true }), devices: { sw: 'switch.of' }, vars: { port: 'srv.port', cores: 'hw.cores' },
      steps: [
        { text: 'Descubra o IP do servidor.', help: ['ip-addr'], auto: 'ip addr', check: { ran: 'ip-show' } },
        { type: 'answer', text: 'Qual é o IP do {{dev.name}}?', help: ['ip-addr', 'responder'], answer: { accept: ['{{dev.ip}}'], normalize: 'ip' } },
        { text: 'Descubra o processador.', help: ['lscpu'], auto: 'lscpu', check: { ran: 'cmd:lscpu' } },
        { type: 'answer', text: 'Quantos núcleos (cores) ele tem?', help: ['lscpu', 'responder'], answer: { accept: ['{{cores}}'], normalize: 'int' } },
        { device: 'sw', text: 'No {{sw.name}}, ache a porta do {{dev.name}}.', help: ['enable', 'show-int'], auto: 'enable\nshow interfaces status', check: { ran: 'show-int' } },
        { device: 'sw', type: 'answer', text: 'Em que porta ele está?', help: ['show-int', 'responder'], answer: { accept: ['{{port}}'], normalize: 'port' } },
      ],
    },

    /* ---------------- Pleno I: diagnóstico (o passo diz o sintoma, não a causa) · Active Directory ---------------- */
    {
      id: 'pl1_site_fora_causa', n: 1, rank: 'pl1', title: 'Site fora no {{dev.name}}: descubra a causa', difficulty: 4, xp: 140, credits: 21,
      skill: 'sistemas', roles: ['sysadmin', 'servidores'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'O site do {{dev.name}} saiu do ar e ninguém sabe por quê. Pode ser rede, cabo, serviço ou disco: descubra, corrija e prove.',
      target: T(LNX, { web: true }), setup: { fault: ['service', 'link', 'disk', 'cable'] }, vars: { cause: 'fault.word' },
      steps: [
        { text: 'Investigue: rede, serviço web e disco.', help: ['ip-link'], auto: 'ip link\nsystemctl status nginx\ndf -h', check: { any: [{ ran: 'link-show' }, { ran: 'ip-show' }, { ran: 'status:nginx' }, { ran: 'df' }] } },
        { type: 'answer', text: 'Qual era a causa? (cabo, interface, serviço ou disco)', help: ['responder'], answer: { accept: ['{{cause}}'], normalize: 'text' } },
        { text: 'O servidor está na rede, com o nginx rodando e espaço em disco.', help: ['systemctl-restart'], action: 'cabling', auto: 'sudo ip link set eth0 up\nsudo journalctl --vacuum-size=200M\nsudo systemctl restart nginx', check: { state: 'ok.web' } },
        { text: 'O site responde.', help: ['curl'], auto: 'curl localhost', check: { ran: 'curl-ok' } },
      ],
    },
    {
      id: 'pl1_servidor_sumiu', n: 2, rank: 'pl1', title: '{{dev.name}} sumiu: servidor ou switch?', difficulty: 4, xp: 150, credits: 22,
      skill: 'redes', roles: ['redes', 'tecnico', 'sysadmin'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'O {{dev.name}} sumiu da rede. O defeito pode estar no servidor ou no switch {{sw.name}}: descubra onde e corrija.',
      target: T(LNX, { directLink: true }), devices: { sw: 'switch.of' }, setup: { fault: ['link@dev', 'port@sw', 'portoff@sw'], quiet: true }, vars: { onde: 'faultyKind', port: 'srv.port' },
      steps: [
        { text: 'Comece pelo servidor: interface e ping no gateway.', help: ['ip-link'], auto: 'ip link\nping -c 3 {{gw}}', check: { any: [{ ran: 'link-show' }, { ran: 'ip-show' }] } },
        { device: 'sw', text: 'Olhe também o lado do switch.', help: ['show-int'], auto: 'enable\nshow interfaces status', check: { any: [{ ran: 'show-int' }, { at: 'dev', state: 'up' }] } },
        { device: 'any', type: 'answer', text: 'O defeito está no servidor ou no switch?', help: ['responder'], answer: { accept: ['{{onde}}'], normalize: 'text' } },
        { device: 'any', text: 'Corrija onde estiver o defeito.', help: ['ip-link-up', 'no-shutdown'], auto: 'sudo ip link set eth0 up\nenable\nconfigure terminal\ninterface {{port}}\nshutdown\nno shutdown\nend', check: { at: 'dev', state: 'up' } },
        { text: 'O {{dev.name}} alcança o gateway.', help: ['ping'], auto: 'ping -c 3 {{gw}}', check: pingGw },
      ],
    },
    {
      id: 'pl1_web_sem_dns', n: 3, rank: 'pl1', title: 'Sites sem DNS', difficulty: 3, xp: 110, credits: 16,
      // roles: [] — the specialisation is the player's call (Infra)
      skill: 'redes', roles: [], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'steps', when: 'webNoDns',
      summary: 'Os servidores Web/API estão no ar, mas sem DNS os clientes não acham o endereço e eles rendem menos.',
      target: { kind: 'rack' },
      steps: [
        { text: 'Tenha um DNS no ar: especialize um servidor como DNS (Infra → Servidores) ou use um domínio Windows com DNS.', check: { state: 'provided', arg: 'dns' } },
      ],
    },
    {
      id: 'pl1_criar_dominio', n: 4, rank: 'pl1', title: 'Criar o domínio no {{dev.name}}', difficulty: 4, xp: 140, credits: 21,
      skill: 'sistemas', roles: [], bot_minutes: 30, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'A empresa cresceu: as contas precisam de um lugar central. Transforme o {{dev.name}} no controlador de domínio corp.datalab.local.',
      target: T(WIN, { domain: false }),
      steps: [
        { text: 'Veja as funções que o servidor pode ter.', help: ['win-features'], auto: 'Get-WindowsFeature', check: { any: [{ ran: 'win-features' }, { state: 'win.has', arg: 'AD-Domain-Services' }] } },
        { text: 'A função AD DS está instalada, com as ferramentas.', help: ['win-feature'], auto: 'Install-WindowsFeature AD-Domain-Services -IncludeManagementTools', check: { all: [{ state: 'win.has', arg: 'AD-Domain-Services' }, { state: 'win.has', arg: 'RSAT-AD-PowerShell' }] } },
        { text: 'O domínio corp.datalab.local existe, com DNS.', help: ['win-forest'], auto: 'Install-ADDSForest -DomainName corp.datalab.local -InstallDns', check: { state: 'win.domain' } },
        { text: 'Confira o domínio.', help: ['win-addomain'], auto: 'Get-ADDomain', check: { ran: 'win-addomain' } },
      ],
    },
    {
      id: 'pl1_ou_ti', n: 5, rank: 'pl1', title: 'OU e contas da TI · {{dev.name}}', difficulty: 3, xp: 120, credits: 18,
      skill: 'sistemas', roles: ['sysadmin'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Duas pessoas entraram na TI. Organize o AD com uma OU "TI" e crie as duas contas dentro dela, habilitadas.',
      target: T(DC, { noOu: 'TI' }), vars: { dn: 'win.dn' },
      steps: [
        { text: 'A OU "TI" existe.', help: ['win-ou'], auto: 'New-ADOrganizationalUnit -Name TI', check: { state: 'win.ou', arg: 'TI' } },
        { text: 'Duas contas habilitadas, com senha, dentro da OU TI.', help: ['win-newuser'], auto: 'New-ADUser -Name "Rita Lopes" -SamAccountName rita.lopes -Path "OU=TI,{{dn}}" -AccountPassword ' + PW + ' -Enabled $true\nNew-ADUser -Name "Igor Nunes" -SamAccountName igor.nunes -Path "OU=TI,{{dn}}" -AccountPassword ' + PW + ' -Enabled $true', check: { state: 'win.usersIn', arg: 'TI', gt: 1 } },
        { text: 'Confira as contas do domínio.', help: ['win-users'], auto: 'Get-ADUser -Filter *', check: { ran: 'win-aduser-list' } },
      ],
    },
    {
      id: 'pl1_conta_travou', n: 6, rank: 'pl1', title: '"Minha conta travou" · {{dev.name}}', difficulty: 3, xp: 110, credits: 16,
      skill: 'sistemas', roles: ['sysadmin'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'fixed', lesson: 'lockout',
      summary: 'Um funcionário errou a senha várias vezes e a conta dele no domínio travou.',
      target: DC, setup: { win: 'users', fault: 'lockout' },
    },
    {
      id: 'pl1_desligamento', n: 7, rank: 'pl1', title: 'Desligamento: carla.mendes · {{dev.name}}', difficulty: 3, xp: 100, credits: 15,
      skill: 'seguranca', roles: ['sysadmin', 'seguranca'], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Carla Mendes saiu da empresa hoje. A conta dela precisa parar de funcionar, sem apagar o histórico.',
      target: DC, setup: { win: 'users' },
      steps: [
        { text: 'Veja as contas do domínio.', help: ['win-users'], auto: 'Get-ADUser -Filter *', check: { ran: 'win-aduser-list' } },
        { text: 'A conta carla.mendes não entra mais (sem excluir).', help: ['win-disable'], auto: 'Disable-ADAccount -Identity carla.mendes', check: { state: 'win.user', arg: 'carla.mendes', eq: 'disabled' } },
        { text: 'Confira as contas desabilitadas.', help: ['win-users'], auto: 'Search-ADAccount -AccountDisabled', check: { ran: 'win-disabled-search' } },
      ],
    },
    {
      id: 'pl1_grupo_suporte', n: 8, rank: 'pl1', title: 'Grupo do suporte · {{dev.name}}', difficulty: 3, xp: 110, credits: 16,
      skill: 'sistemas', roles: ['sysadmin'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Permissões se dão a grupos, não a pessoas. Crie o grupo Suporte e coloque nele duas pessoas da equipe.',
      target: T(DC, { noGroup: 'Suporte' }), setup: { win: 'users' },
      steps: [
        { text: 'Existe o grupo Suporte, de escopo Global.', help: ['win-newgroup'], auto: 'New-ADGroup -Name Suporte -GroupScope Global', check: { state: 'win.groupScope', arg: 'Suporte', eq: 'Global' } },
        { text: 'Duas contas estão no grupo Suporte.', help: ['win-member'], auto: 'Add-ADGroupMember -Identity Suporte -Members ana.souza,bruno.alves', check: { state: 'win.members', arg: 'Suporte', gt: 1 } },
        { text: 'Confira os membros do grupo.', help: ['win-member'], auto: 'Get-ADGroupMember -Identity Suporte', check: { ran: 'win-group-members:suporte' } },
      ],
    },
    {
      id: 'pl1_nome_site', n: 9, rank: 'pl1', title: 'Um nome para o site do {{peer.name}}', difficulty: 3, xp: 120, credits: 18,
      skill: 'redes', roles: ['sysadmin', 'redes'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O site do {{peer.name}} ({{peer.ip}}) precisa de um nome: web.{{dom}}. O DNS do domínio fica no {{dev.name}}.',
      target: T(DC, { noRr: 'web' }), devices: { peer: 'server.peer' }, vars: { dom: 'win.domain' },
      steps: [
        { text: 'Veja as zonas deste DNS.', help: ['win-dnszones'], auto: 'Get-DnsServerZone', check: { ran: 'win-dns-zones' } },
        { text: 'web.{{dom}} aponta para {{peer.ip}}.', help: ['win-dnsa'], auto: 'Add-DnsServerResourceRecordA -ZoneName {{dom}} -Name web -IPv4Address {{peer.ip}}', check: { state: 'win.rr', arg: 'web', eq: '{{peer.ip}}' } },
        { text: 'O nome resolve.', help: ['win-resolve'], auto: 'Resolve-DnsName web.{{dom}}', check: { any: [{ ran: 'win-dns-ok:web.{{dom}}' }, { ran: 'win-dns-ok:web' }] } },
      ],
    },
    {
      id: 'pl1_www', n: 10, rank: 'pl1', title: 'www para o site · {{dev.name}}', difficulty: 3, xp: 110, credits: 16,
      skill: 'redes', roles: ['sysadmin', 'redes'], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Os clientes digitam www na frente do endereço. Crie o apelido www para o web.{{dom}}, sem repetir o IP.',
      target: T(DC, { noRr: 'www' }), devices: { peer: 'server.peer' }, setup: { win: 'webA' }, vars: { dom: 'win.domain' },
      steps: [
        { text: 'www.{{dom}} é um apelido (CNAME) de web.{{dom}}.', help: ['win-dnscname'], auto: 'Add-DnsServerResourceRecordCName -ZoneName {{dom}} -Name www -HostNameAlias web.{{dom}}', check: { state: 'win.rr', arg: 'www', eq: 'web.{{dom}}' } },
        { text: 'www.{{dom}} resolve.', help: ['win-resolve'], auto: 'Resolve-DnsName www.{{dom}}', check: { any: [{ ran: 'win-dns-ok:www.{{dom}}' }, { ran: 'win-dns-ok:www' }] } },
      ],
    },
    {
      id: 'pl1_sala_quente', n: 11, rank: 'pl1', title: 'Sala dos servidores quente', difficulty: 3, xp: 100, credits: 15,
      skill: 'servidores', roles: [], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'steps',
      summary: 'Com mais servidores, a sala esquenta. O ar de precisão segura a temperatura do corredor frio.',
      target: { kind: 'rack' }, vars: { n: 'items:crac' },
      steps: [
        { text: 'Instale um Ar de precisão na sala dos racks (Construir → Racks).', action: 'build', check: { state: 'items', arg: 'crac', gt: '{{n}}' } },
      ],
    },
    {
      id: 'pl1_banco_maquina', n: 12, rank: 'pl1', title: 'O banco de dados precisa de mais máquina', difficulty: 3, xp: 120, credits: 18,
      skill: 'servidores', roles: [], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'steps',
      summary: 'O banco de dados cresceu. Instale um servidor avançado e coloque o Banco de dados nele.',
      target: { kind: 'rack' }, vars: { n: 'devs:srv_adv', db: 'svc.model:db,srv_adv' },
      steps: [
        { text: 'Instale um Servidor avançado num rack.', action: 'build', check: { state: 'devs', arg: 'srv_adv', gt: '{{n}}' } },
        { text: 'Especialize um servidor avançado como Banco de dados (Infra → Servidores).', check: { state: 'svc.model', arg: 'db,srv_adv', gt: '{{db}}' } },
      ],
    },
    {
      id: 'pl1_especialize_banco', n: 13, rank: 'pl1', title: 'Um banco de dados que rende', difficulty: 3, xp: 110, credits: 16,
      skill: 'servidores', roles: [], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'steps',
      summary: 'Um cliente quer hospedar o banco dele. O Banco de dados pede 8 núcleos, 64 GB e disco SSD: escolha um servidor que aguente.',
      target: { kind: 'rack' }, vars: { n: 'svc.ok:db' },
      steps: [
        { text: 'Um servidor online está especializado como Banco de dados e tem tudo o que ele pede (Infra → Servidores).', check: { state: 'svc.ok', arg: 'db', gt: '{{n}}' } },
      ],
    },
    {
      id: 'pl1_ataque_ssh', n: 14, rank: 'pl1', title: 'Ataque e SSH fora no {{dev.name}}', difficulty: 4, xp: 130, credits: 20,
      skill: 'seguranca', roles: ['seguranca', 'sysadmin'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'Depois de uma onda de senhas erradas, o SSH do {{dev.name}} parou. Descubra de onde veio o ataque e devolva o acesso.',
      handoff: 'o IP vai para a segurança bloquear',
      target: LNX, setup: { authlog: 'bruteforce', fault: 'sshstop' }, vars: { attacker: 'auth.attacker' },
      steps: [
        { text: 'Encontre as tentativas de senha errada.', help: ['grep'], auto: 'grep "Failed password" /var/log/auth.log', check: { ran: 'grep-failed:/var/log/auth.log' } },
        { type: 'answer', text: 'De qual IP veio o ataque?', help: ['responder'], answer: { accept: ['{{attacker}}'], normalize: 'ip' } },
        { text: 'O SSH está rodando de novo e escutando.', help: ['systemctl-start'], auto: 'sudo systemctl start ssh\nsudo ss -tlnp', check: { all: [{ state: 'service', arg: 'ssh', eq: 'active' }, { ran: 'ss' }] } },
      ],
    },
    {
      id: 'pl1_noc', n: 15, rank: 'pl1', title: 'Posto de NOC', difficulty: 2, xp: 100, credits: 15,
      skill: 'gestao', roles: [], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'steps',
      summary: 'Com mais servidores, alguém precisa olhar o monitoramento o tempo todo. Monte uma estação de NOC.',
      target: { kind: 'rack' }, vars: { n: 'items:desknoc' },
      steps: [
        { text: 'Instale uma Estação de NOC (Construir → Equipamentos → Estações).', action: 'build', check: { state: 'items', arg: 'desknoc', gt: '{{n}}' } },
      ],
    },
    {
      id: 'pl1_porta_errada', n: 16, rank: 'pl1', title: 'Mexeram na porta errada do {{sw.name}}', difficulty: 4, xp: 140, credits: 21,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'Uma porta do {{sw.name}} entrou em erro e, tentando consertar, um colega desligou a porta errada. Agora o {{dev.name}} e o {{peer.name}} estão fora.',
      target: T(LNX, { directLink: true }), devices: { sw: 'switch.of', peer: 'server.sameSwitch' }, setup: { fault: 'port2', on: 'sw' }, vars: { pa: 'srv.port', pb: 'srv.port@peer' },
      steps: [
        { device: 'sw', text: 'Veja o estado das portas do {{sw.name}}.', help: ['show-int'], auto: 'enable\nshow interfaces status', check: { ran: 'show-int' } },
        { device: 'sw', text: 'O {{dev.name}} e o {{peer.name}} voltam para a rede.', help: ['interface'], auto: 'configure terminal\ninterface {{pa}}\nshutdown\nno shutdown\ninterface {{pb}}\nno shutdown\nend', check: { all: [{ at: 'dev', state: 'up' }, { at: 'peer', state: 'up' }] } },
        { device: 'sw', text: 'A configuração fica salva.', help: ['copy-run-start'], auto: 'end\ncopy running-config startup-config', check: { ran: 'config-saved' } },
      ],
    },
    {
      id: 'pl1_esqueci_senha', n: 17, rank: 'pl1', title: '"Esqueci a senha" · {{dev.name}}', difficulty: 3, xp: 110, credits: 16,
      skill: 'sistemas', roles: ['sysadmin', 'atendente'], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Bruno Alves voltou de férias e não lembra a senha. Redefina e confira a conta.',
      target: DC, setup: { win: 'users' },
      steps: [
        { text: 'A senha de bruno.alves foi redefinida (forte: 8+ caracteres, 3 tipos).', help: ['win-unlock'], auto: 'Set-ADAccountPassword -Identity bruno.alves -Reset -NewPassword ' + PW, check: { ran: 'win-pwd' } },
        { text: 'Confira a conta.', help: ['win-users'], auto: 'Get-ADUser bruno.alves', check: { ran: 'win-aduser-list' } },
      ],
    },
    {
      id: 'pl1_rota_sumiu', n: 18, rank: 'pl1', title: 'Gateway responde, internet não · {{dev.name}}', difficulty: 4, xp: 130, credits: 20,
      skill: 'redes', roles: ['redes', 'sysadmin'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'Depois de um reinício, o {{dev.name}} fala com a rede local, mas não com a internet. Descubra o que falta.',
      target: LNX, setup: { fault: 'noroute' },
      steps: [
        { text: 'Teste o gateway e a internet.', help: ['ping'], auto: 'ping -c 3 {{gw}}\nping -c 3 8.8.8.8', check: { all: [{ ran: 'ping-ok:{{gw}}' }, { any: [{ ran: 'ping-fail' }, { state: 'route', eq: '{{gw}}' }] }] } },
        { text: 'Descubra por onde os pacotes deveriam sair.', help: ['ip-route'], auto: 'ip route', check: { ran: 'route-show' } },
        { text: 'A internet responde.', help: ['ip-route-add'], auto: 'sudo ip route add default via {{gw}}\nping -c 3 8.8.8.8', check: { all: [{ state: 'route', eq: '{{gw}}' }, { ran: 'ping-ok:8.8.8.8' }] } },
      ],
    },
    {
      id: 'pl1_primeira_vm', n: 19, rank: 'pl1', title: 'A primeira VM', difficulty: 3, xp: 120, credits: 18,
      skill: 'sistemas', roles: [], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'steps',
      summary: 'Um servidor físico inteiro para um site pequeno é desperdício. Crie um nó de virtualização e rode o site numa VM.',
      target: { kind: 'rack' }, vars: { n: 'vms:web:running' },
      steps: [
        { text: 'Um servidor é nó de Virtualização (Infra → Servidores).', check: { state: 'svcs', arg: 'virt', gt: 0 } },
        { text: 'Uma VM Web/API nova está rodando (Infra → VMs → Criar VM).', check: { state: 'vms', arg: 'web:running', gt: '{{n}}' } },
      ],
    },
    {
      id: 'pl1_duas_causas', n: 20, rank: 'pl1', title: '{{dev.name}} e {{peer.name}} fora, cada um por um motivo', difficulty: 4, xp: 150, credits: 22,
      skill: 'sistemas', roles: ['sysadmin', 'redes'], bot_minutes: 25, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'Dois alertas ao mesmo tempo: o {{dev.name}} sumiu da rede e o site do {{peer.name}} caiu. Não é a mesma causa.',
      target: T(LNX, { web: true }), devices: { peer: 'server.peer' }, setup: { faults: [{ fault: ['link', 'cable'], on: 'dev' }, { fault: ['service', 'disk'], on: 'peer' }] },
      steps: [
        { text: 'O {{dev.name}} volta para a rede.', help: ['ip-link'], action: 'cabling', auto: 'ip link\nsudo ip link set eth0 up', check: { state: 'up' } },
        { device: 'peer', text: 'O site do {{peer.name}} volta a responder.', help: ['systemctl-status'], auto: 'systemctl status nginx\ndf -h\nsudo journalctl --vacuum-size=200M\nsudo systemctl restart nginx\ncurl localhost', check: { all: [{ state: 'ok.web' }, { ran: 'curl-ok' }] } },
      ],
    },

    /* ---------------- Pleno II: escala · DHCP e DNS da empresa · VMs ---------------- */
    {
      id: 'pl2_dhcp_escritorio', n: 1, rank: 'pl2', title: 'DHCP para o escritório · {{dev.name}}', difficulty: 4, xp: 160, credits: 24,
      skill: 'redes', roles: ['sysadmin', 'redes'], bot_minutes: 25, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'As estações de trabalho precisam pegar IP sozinhas, com gateway e DNS. Monte o DHCP no controlador de domínio {{dev.name}}.',
      target: T(DC, { lacks: 'DHCP' }),
      steps: [
        { text: 'A função DHCP está instalada, com as ferramentas.', help: ['win-dhcpinstall'], auto: 'Install-WindowsFeature DHCP -IncludeManagementTools', check: { all: [{ state: 'win.has', arg: 'DHCP' }, { state: 'win.has', arg: 'RSAT-DHCP' }] } },
        { text: 'Existe um escopo para as estações (fora dos IPs fixos).', help: ['win-scope'], auto: 'Add-DhcpServerv4Scope -Name LAN -StartRange 10.0.1.100 -EndRange 10.0.1.199 -SubnetMask 255.255.255.0', check: { state: 'win.scopes', gt: 0 } },
        { text: 'O escopo entrega o gateway {{gw}} e o DNS.', help: ['win-option'], auto: 'Set-DhcpServerv4OptionValue -ScopeId 10.0.1.0 -Router {{gw}} -DnsServer {{dev.ip}}', check: { all: [{ state: 'win.scopeRouter', eq: '{{gw}}' }, { state: 'win.scopeDns' }] } },
        { text: 'O DHCP pode entregar IPs no domínio.', help: ['win-authorize'], auto: 'Add-DhcpServerInDC', check: { state: 'win.dhcpAuth' } },
        { text: 'As estações pegaram IP.', help: ['win-lease'], auto: 'Get-DhcpServerv4Lease -ScopeId 10.0.1.0', check: { ran: 'win-dhcp-lease' } },
      ],
    },
    {
      id: 'pl2_sem_gateway', n: 2, rank: 'pl2', title: 'Estações sem internet · {{dev.name}}', difficulty: 4, xp: 150, credits: 22,
      skill: 'redes', roles: ['sysadmin', 'redes'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O DHCP do {{dev.name}} está instalado, mas as estações ficam sem IP utilizável e sem internet. Ache o que falta no escopo.',
      target: DC, setup: { win: 'dhcpNoRouter' },
      steps: [
        { text: 'Veja se o escopo entrega endereços.', help: ['win-lease'], auto: 'Get-DhcpServerv4Lease -ScopeId 10.0.1.0', check: { any: [{ ran: 'cmd:get-dhcpserverv4lease' }, { ran: 'win-dhcp-lease' }] } },
        { text: 'Veja as opções que o escopo entrega.', help: ['win-option'], auto: 'Get-DhcpServerv4OptionValue -ScopeId 10.0.1.0', check: { ran: 'cmd:get-dhcpserverv4optionvalue' } },
        { text: 'O escopo entrega o gateway {{gw}}.', help: ['win-option'], auto: 'Set-DhcpServerv4OptionValue -ScopeId 10.0.1.0 -Router {{gw}}', check: { state: 'win.scopeRouter', eq: '{{gw}}' } },
        { text: 'As estações pegaram IP.', help: ['win-lease'], auto: 'Get-DhcpServerv4Lease -ScopeId 10.0.1.0', check: { ran: 'win-dhcp-lease' } },
      ],
    },
    {
      id: 'pl2_dhcp_autorizar', n: 3, rank: 'pl2', title: 'O DHCP não entrega IP · {{dev.name}}', difficulty: 3, xp: 130, credits: 20,
      skill: 'redes', roles: ['sysadmin'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O escopo do {{dev.name}} está certinho, mas nenhuma estação pega IP. Num domínio, o DHCP precisa de mais uma coisa.',
      target: DC, setup: { win: 'dhcpNoAuth' },
      steps: [
        { text: 'Veja as concessões e o motivo provável.', help: ['win-lease'], auto: 'Get-DhcpServerv4Lease -ScopeId 10.0.1.0', check: { any: [{ ran: 'cmd:get-dhcpserverv4lease' }, { state: 'win.dhcpAuth' }] } },
        { text: 'O servidor DHCP está autorizado no AD.', help: ['win-authorize'], auto: 'Add-DhcpServerInDC', check: { state: 'win.dhcpAuth' } },
        { text: 'As estações pegaram IP.', help: ['win-lease'], auto: 'Get-DhcpServerv4Lease -ScopeId 10.0.1.0', check: { ran: 'win-dhcp-lease' } },
      ],
    },
    {
      id: 'pl2_quantos_pcs', n: 4, rank: 'pl2', title: 'Quantos aparelhos pegaram IP? · {{dev.name}}', difficulty: 3, xp: 120, credits: 18,
      skill: 'redes', roles: ['sysadmin', 'redes'], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Inventário da rede do escritório: quantos aparelhos estão com IP emprestado pelo DHCP do {{dev.name}}?',
      target: DC, setup: { win: 'dhcpFull' }, vars: { n: 'win.leases' },
      steps: [
        { text: 'Veja os escopos.', help: ['win-scope'], auto: 'Get-DhcpServerv4Scope', check: { ran: 'win-dhcp-scope-list' } },
        { text: 'Veja as concessões.', help: ['win-lease'], auto: 'Get-DhcpServerv4Lease -ScopeId 10.0.1.0', check: { ran: 'win-dhcp-lease' } },
        { type: 'answer', text: 'Quantos aparelhos estão com IP?', help: ['responder'], answer: { accept: ['{{n}}'], normalize: 'int' } },
      ],
    },
    {
      id: 'pl2_dhcp_parou', n: 5, rank: 'pl2', title: 'As estações não pegam IP · {{dev.name}}', difficulty: 4, xp: 150, credits: 22,
      skill: 'sistemas', roles: ['sysadmin'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'Ninguém novo consegue entrar na rede do escritório. O DHCP do {{dev.name}} parou de responder.',
      target: DC, setup: { win: 'dhcpFull', fault: 'winsvc', opts: { svc: 'DHCPServer' } },
      steps: [
        { text: 'Descubra qual serviço parou.', help: ['win-service'], auto: 'Get-Service', check: { ran: 'win-svc:dhcpserver' } },
        { text: 'Veja no log quando ele parou.', help: ['win-event'], auto: 'Get-WinEvent -LogName System -MaxEvents 5', check: { ran: 'win-events:system' } },
        { text: 'O serviço DHCP está rodando.', help: ['win-start'], auto: 'Start-Service DHCPServer', check: { state: 'win.svc', arg: 'DHCPServer', eq: 'Running' } },
        { text: 'As estações pegam IP de novo.', help: ['win-lease'], auto: 'Get-DhcpServerv4Lease -ScopeId 10.0.1.0', check: { ran: 'win-dhcp-lease' } },
      ],
    },
    {
      id: 'pl2_registro_faltando', n: 6, rank: 'pl2', title: 'O {{peer.name}} não tem nome no DNS', difficulty: 3, xp: 130, credits: 20,
      skill: 'redes', roles: ['sysadmin', 'redes'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'A equipe tenta acessar {{peer.host}}.{{dom}} e não encontra. O registro sumiu da zona do {{dev.name}}.',
      target: DC, devices: { peer: 'server.peer' }, setup: { win: 'dropPeerRr' }, vars: { dom: 'win.domain' },
      steps: [
        { text: 'Veja os registros da zona {{dom}}.', help: ['win-dnszones'], auto: 'Get-DnsServerResourceRecord -ZoneName {{dom}}', check: { ran: 'win-dns-rr-list' } },
        { text: '{{peer.host}}.{{dom}} aponta para {{peer.ip}}.', help: ['win-dnsa'], auto: 'Add-DnsServerResourceRecordA -ZoneName {{dom}} -Name {{peer.host}} -IPv4Address {{peer.ip}}', check: { state: 'win.rr', arg: '{{peer.host}}', eq: '{{peer.ip}}' } },
        { text: 'O nome resolve.', help: ['win-resolve'], auto: 'Resolve-DnsName {{peer.host}}.{{dom}}', check: { any: [{ ran: 'win-dns-ok:{{peer.host}}.{{dom}}' }, { ran: 'win-dns-ok:{{peer.host}}' }] } },
      ],
    },
    {
      id: 'pl2_auditoria_oito', n: 7, rank: 'pl2', title: 'Auditoria: quantos servidores estão no ar?', difficulty: 3, xp: 130, credits: 20,
      skill: 'redes', roles: ['redes', 'sysadmin'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson', when: 'eight',
      summary: 'O gestor quer o número de servidores respondendo agora. Confira da rede, não só pelo painel.',
      target: LNX, vars: { n: 'up.count' },
      steps: [
        { text: 'Do {{dev.name}}, faça ping nos outros servidores.', help: ['ping'], auto: 'ping -c 3 {{gw}}', check: { ran: 'cmd:ping' } },
        { type: 'answer', text: 'Quantos servidores estão respondendo?', help: ['responder'], answer: { accept: ['{{n}}'], normalize: 'int', tol: 1 } },
      ],
    },
    {
      id: 'pl2_no_sobrecarregado', n: 8, rank: 'pl2', title: 'Nó de VMs no limite · {{dev.name}}', difficulty: 4, xp: 150, credits: 22,
      skill: 'sistemas', roles: [], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'steps',
      summary: 'Duas VMs de teste (carga-1 e carga-2) tomaram quase toda a RAM do {{dev.name}}. VM nova não cabe mais.',
      target: NODE, setup: { vmload: true },
      steps: [
        { text: 'Desligue ou remova VMs do {{dev.name}} até a RAM reservada ficar abaixo de 70% (Infra → VMs).', check: { state: 'node.alloc', lt: 70 } },
      ],
    },
    {
      id: 'pl2_dns_redundante', n: 9, rank: 'pl2', title: 'DNS reserva', difficulty: 3, xp: 130, credits: 20,
      skill: 'redes', roles: [], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'steps',
      summary: 'Se o único DNS cair, todos os sites param de ser encontrados. Suba um DNS reserva numa VM.',
      target: { kind: 'rack' }, vars: { n: 'vms:dns:running' },
      steps: [
        { text: 'Uma VM DNS nova está rodando (Infra → VMs → Criar VM).', check: { state: 'vms', arg: 'dns:running', gt: '{{n}}' } },
      ],
    },
    {
      id: 'pl2_jogos_10g', n: 10, rank: 'pl2', title: 'Rede de 10G para os jogos', difficulty: 4, xp: 150, credits: 22,
      skill: 'redes', roles: [], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'steps',
      summary: 'Servidores de jogos precisam de placa e porta de 10 Gb/s. Instale um switch 10G e ligue um servidor nele.',
      target: { kind: 'rack' }, vars: { sw: 'devs:sw_10g', on: 'on.model:sw_10g' },
      steps: [
        { text: 'Instale um Switch 10G num rack.', action: 'build', check: { state: 'devs', arg: 'sw_10g', gt: '{{sw}}' } },
        { text: 'Passe o cabo de um servidor para ele (Cabeamento).', action: 'cabling', check: { state: 'on.model', arg: 'sw_10g', gt: '{{on}}' } },
      ],
    },
    {
      id: 'pl2_nobreak', n: 11, rank: 'pl2', title: 'Nobreak para a sala', difficulty: 3, xp: 130, credits: 20,
      skill: 'servidores', roles: [], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'steps',
      summary: 'Uma queda de energia de dois segundos derrubaria tudo. Um nobreak segura a sala até o gerador ou o desligamento seguro.',
      target: { kind: 'rack' }, vars: { n: 'items:ups' },
      steps: [
        { text: 'Instale um Nobreak na sala dos servidores (Construir → Energia).', action: 'build', check: { state: 'items', arg: 'ups', gt: '{{n}}' } },
      ],
    },
    {
      id: 'pl2_nas8', n: 12, rank: 'pl2', title: 'Backup do banco num NAS maior', difficulty: 3, xp: 130, credits: 20,
      skill: 'servidores', roles: [], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'steps',
      summary: 'Os backups do banco de dados não cabem mais. Um NAS de 8 baias dá espaço e redundância para eles.',
      target: { kind: 'rack' }, vars: { n: 'items:nas_8' },
      steps: [
        { text: 'Instale um NAS 8 baias (Construir → Equipamentos → Storage).', action: 'build', check: { state: 'items', arg: 'nas_8', gt: '{{n}}' } },
      ],
    },
    {
      id: 'pl2_email', n: 13, rank: 'pl2', title: 'E-mail da empresa', difficulty: 3, xp: 130, credits: 20,
      skill: 'sistemas', roles: [], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'steps',
      summary: 'Os clientes pediram e-mail. O servidor de E-mail precisa de 16 GB de RAM, disco, e depende de DNS (registros MX).',
      target: { kind: 'rack' }, vars: { n: 'svc.ok:mail' },
      steps: [
        { text: 'Um servidor online é E-mail e tem o que ele pede (Infra → Servidores).', check: { state: 'svc.ok', arg: 'mail', gt: '{{n}}' } },
        { text: 'Existe DNS no ar para o e-mail funcionar.', check: { state: 'provided', arg: 'dns' } },
      ],
    },
    {
      id: 'pl2_servidor_padrao', n: 14, rank: 'pl2', title: 'Servidor novo no padrão · {{dev.name}}', difficulty: 4, xp: 170, credits: 25,
      skill: 'sistemas', roles: ['sysadmin', 'servidores'], bot_minutes: 20, weight: 1, trigger: 'auto', complete: 'online', lesson: 'setup_pl',
      summary: 'Servidor novo entra em produção no padrão da empresa: rede, nome, SSH e internet. Sem roteiro.',
      target: NEW,
    },
    {
      id: 'pl2_membro_dominio', n: 15, rank: 'pl2', title: 'O {{dev.name}} não acha o domínio', difficulty: 4, xp: 150, credits: 22,
      skill: 'redes', roles: ['sysadmin', 'redes'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O {{dev.name}} vai entrar no domínio {{dom}}, mas consulta um DNS público. Quem conhece o domínio é o {{dc.name}}.',
      target: T(WIN, { domain: false }), devices: { dc: 'win.dc' }, setup: { win: 'dns' }, vars: { dom: 'win.domain@dc' },
      steps: [
        { text: 'Veja quais DNS o {{dev.name}} consulta.', help: ['win-dnsclient'], auto: 'Get-DnsClientServerAddress', check: { ran: 'dns-client-show' } },
        { text: 'O {{dev.name}} consulta o {{dc.name}} ({{dc.ip}}).', help: ['win-dnsclient'], auto: 'Set-DnsClientServerAddress -InterfaceAlias Ethernet -ServerAddresses {{dc.ip}}', check: { state: 'win.dnsTo', arg: '{{dc.ip}}' } },
        { text: 'O domínio {{dom}} resolve.', help: ['win-resolve'], auto: 'Resolve-DnsName {{dom}}', check: { ran: 'win-dns-ok:{{dom}}' } },
      ],
    },
    {
      id: 'pl2_pasta_financeiro', n: 16, rank: 'pl2', title: 'Pasta do Financeiro · {{dev.name}}', difficulty: 4, xp: 160, credits: 24,
      skill: 'sistemas', roles: ['sysadmin'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O Financeiro precisa de uma pasta na rede para o grupo dele. Crie a pasta, o grupo e o compartilhamento.',
      target: T(DC, { noShare: 'Financeiro' }), vars: { nb: 'win.netbios' },
      steps: [
        { text: 'A pasta C:\\Dados\\Financeiro existe.', help: ['win-mkdir'], auto: 'New-Item -Path C:\\Dados\\Financeiro -ItemType Directory', check: { state: 'win.dir', arg: 'C:\\Dados\\Financeiro' } },
        { text: 'Existe o grupo Financeiro (DomainLocal: ele recebe a permissão).', help: ['win-newgroup'], auto: 'New-ADGroup -Name Financeiro -GroupScope DomainLocal', check: { state: 'win.group', arg: 'Financeiro' } },
        { text: 'A pasta está compartilhada como "Financeiro", com alteração para o grupo.', help: ['win-share'], auto: 'New-SmbShare -Name Financeiro -Path C:\\Dados\\Financeiro -ChangeAccess "{{nb}}\\Financeiro"', check: { state: 'win.shareTo', arg: 'Financeiro:Financeiro', in: ['Change', 'Full'] } },
      ],
    },
    {
      id: 'pl2_pasta_aberta', n: 17, rank: 'pl2', title: 'Pasta do Financeiro aberta para todos · {{dev.name}}', difficulty: 4, xp: 170, credits: 25,
      skill: 'seguranca', roles: ['sysadmin', 'seguranca'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Uma auditoria achou a pasta do Financeiro legível por qualquer usuário do domínio. Feche para o grupo Financeiro.',
      target: DC, setup: { win: 'finOpen' }, vars: { nb: 'win.netbios' },
      steps: [
        { text: 'Veja as permissões NTFS da pasta C:\\Dados\\Financeiro.', help: ['win-icacls'], auto: 'icacls C:\\Dados\\Financeiro', check: { ran: 'win-icacls:c:\\dados\\financeiro' } },
        { text: 'Só o grupo Financeiro (modificar) e os administradores (total) acessam a pasta.', help: ['win-inherit'], auto: 'icacls C:\\Dados\\Financeiro /inheritance:r\nicacls C:\\Dados\\Financeiro /grant "Administrators:(OI)(CI)F"\nicacls C:\\Dados\\Financeiro /grant "{{nb}}\\Financeiro:(OI)(CI)M"', check: { state: 'win.aclOnly', arg: 'C:\\Dados\\Financeiro|Financeiro' } },
      ],
    },
    {
      id: 'pl2_cascata', n: 18, rank: 'pl2', title: 'Web e e-mail alertando juntos', difficulty: 4, xp: 170, credits: 25,
      skill: 'sistemas', roles: ['sysadmin'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'Os sites e o e-mail alertaram ao mesmo tempo. Os dois dependem de uma mesma coisa no controlador de domínio {{dev.name}}.',
      target: DC, setup: { fault: 'winsvc', opts: { svc: 'DNS' }, quiet: true }, vars: { dom: 'win.domain' },
      steps: [
        { text: 'Veja os serviços do {{dev.name}}.', help: ['win-service'], auto: 'Get-Service', check: { ran: 'win-svc:dns' } },
        { type: 'answer', text: 'Qual serviço é a causa raiz dos dois alertas?', help: ['responder'], answer: { accept: ['dns', 'dns server'], normalize: 'text' } },
        { text: 'A causa raiz está resolvida.', help: ['win-start'], auto: 'Start-Service DNS', check: { state: 'win.svc', arg: 'DNS', eq: 'Running' } },
        { text: 'O domínio {{dom}} resolve de novo.', help: ['win-resolve'], auto: 'Resolve-DnsName {{dom}}', check: { ran: 'win-dns-ok:{{dom}}' } },
      ],
    },
    {
      id: 'pl2_tres_alertas', n: 19, rank: 'pl2', title: 'Três alertas de uma vez', difficulty: 4, xp: 170, credits: 25,
      skill: 'sistemas', roles: ['sysadmin', 'redes'], bot_minutes: 30, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'Disco lotando no {{dev.name}}, site fora no {{peer.name}} e uma porta em erro no {{sw.name}}. Tudo ao mesmo tempo.',
      target: T(LNX, { directLink: true }), devices: { peer: 'server.peer', sw: 'switch.of' },
      setup: { faults: [{ fault: 'disk', on: 'dev' }, { fault: 'service', on: 'peer' }, { fault: 'port', on: 'sw' }] }, vars: { port: 'srv.port' },
      steps: [
        { text: 'O disco do {{dev.name}} fica abaixo de 80%.', help: ['df'], auto: 'df -h\nsudo journalctl --vacuum-size=200M', check: { state: 'disk', lt: 80 } },
        { device: 'peer', text: 'O site do {{peer.name}} responde.', help: ['systemctl-status'], auto: 'systemctl status nginx\nsudo systemctl restart nginx\ncurl localhost', check: { all: [{ state: 'service', arg: 'nginx', eq: 'active' }, { ran: 'curl-ok' }] } },
        { device: 'sw', text: 'Nenhuma porta do {{sw.name}} em erro.', help: ['show-int'], auto: 'enable\nshow interfaces status\nconfigure terminal\ninterface {{port}}\nshutdown\nno shutdown\nend', check: { state: 'sw.healed', arg: '{{port}}' } },
        { text: 'O {{dev.name}} está na rede.', help: ['ping'], auto: 'ping -c 3 {{gw}}', check: pingGw },
      ],
    },
    {
      id: 'pl2_cabe_cliente', n: 20, rank: 'pl2', title: 'Cabe mais um cliente no {{dev.name}}?', difficulty: 3, xp: 120, credits: 18,
      skill: 'servidores', roles: ['servidores', 'sysadmin'], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Um cliente quer VMs no nó {{dev.name}}. Antes de prometer, veja quantos vCPUs ainda estão livres.',
      target: NODE, vars: { free: 'node.freeCores' },
      steps: [
        { text: 'Veja os threads do nó (lscpu) e as VMs ligadas nele (Infra → VMs).', help: ['lscpu'], auto: 'lscpu', check: { ran: 'cmd:lscpu' } },
        { type: 'answer', text: 'Quantos vCPUs ainda estão livres no {{dev.name}}?', help: ['responder'], answer: { accept: ['{{free}}'], normalize: 'int' } },
      ],
    },

    /* ---------------- Pleno III: trabalhar com a equipe · acessos para pessoas ---------------- */
    {
      // roles: [] — triage is the player's job; the orders go to the team (Equipe → Atribuir tarefa)
      id: 'pl3_triagem', n: 1, rank: 'pl3', title: 'Triagem: três alertas', difficulty: 4, xp: 170, credits: 25,
      skill: 'gestao', roles: [], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Três servidores alertaram de uma vez: {{dev.name}}, {{peer.name}} e {{alt.name}}. Diagnostique os três, resolva um e distribua os outros para a equipe.',
      handoff: 'os outros dois alertas ficam com a equipe',
      target: LNX, devices: { peer: 'server.peer', alt: 'server.peer' },
      setup: { faults: [{ fault: ['link', 'cable'], on: 'dev' }, { fault: ['service', 'disk'], on: 'peer' }, { fault: ['service', 'disk'], on: 'alt' }] },
      vars: { c1: 'fault.word', c2: 'fault.word@peer', c3: 'fault.word@alt', o: 'orders' },
      steps: [
        { device: 'any', type: 'answer', text: 'Qual o problema do {{dev.name}}? (cabo, interface, serviço ou disco)', help: ['responder'], answer: { accept: ['{{c1}}'], normalize: 'text' } },
        { device: 'any', type: 'answer', text: 'E o do {{peer.name}}?', help: ['responder'], answer: { accept: ['{{c2}}'], normalize: 'text' } },
        { device: 'any', type: 'answer', text: 'E o do {{alt.name}}?', help: ['responder'], answer: { accept: ['{{c3}}'], normalize: 'text' } },
        { text: 'Você mesmo(a) põe o {{dev.name}} de volta na rede.', help: ['ip-link-up'], action: 'cabling', auto: 'sudo ip link set eth0 up', check: { state: 'up' } },
        { device: 'any', text: 'Os outros dois ficam com a equipe: dê duas ordens (Equipe → clique na pessoa → Atribuir tarefa).', check: { state: 'ordersSince', arg: '{{o}}', gt: 1 } },
      ],
    },
    {
      id: 'pl3_quem_resolve', n: 2, rank: 'pl3', title: 'Quem resolve isso? · {{dev.name}}', difficulty: 3, xp: 130, credits: 20,
      skill: 'gestao', roles: [], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Um alerta chegou para o {{dev.name}}. Descubra o problema e mande para quem da equipe sabe resolver.',
      handoff: 'a correção fica com a equipe',
      target: T(LNX, { directLink: true }), devices: { sw: 'switch.of' }, setup: { fault: ['port@sw', 'service@dev'] },
      vars: { r0: 'faultRole:0', r1: 'faultRole:1', r2: 'faultRole:2', o: 'orders' },
      steps: [
        { text: 'Diagnostique: o servidor ou o switch?', help: ['ip-link', 'systemctl-status'], auto: 'ip link\nsystemctl status nginx\nping -c 3 {{gw}}', check: { any: [{ ran: 'status:nginx' }, { ran: 'ping-fail' }, { ran: 'link-show' }] } },
        { device: 'any', type: 'answer', text: 'Qual função da equipe resolve isso? (Redes, Servidores, Sysadmin…)', help: ['responder'], answer: { accept: ['{{r0}}', '{{r1}}', '{{r2}}'], normalize: 'text' } },
        { device: 'any', text: 'Dê a ordem para alguém com essa função (Equipe → Atribuir tarefa).', check: { state: 'ordersSince', arg: '{{o}}', gt: 0 } },
      ],
    },
    {
      id: 'pl3_funcionario_novo', n: 3, rank: 'pl3', title: 'Funcionário novo no Financeiro · {{dev.name}}', difficulty: 4, xp: 180, credits: 27,
      skill: 'sistemas', roles: ['sysadmin'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Lucas Prado começa amanhã no Financeiro. Ele precisa de conta na OU Financeiro e de acesso à pasta do setor (que já é do grupo Financeiro).',
      target: DC, setup: { win: 'newhire' }, vars: { dn: 'win.dn' },
      steps: [
        { text: 'A conta lucas.prado existe na OU Financeiro, habilitada e com senha.', help: ['win-newuser'], auto: 'New-ADUser -Name "Lucas Prado" -SamAccountName lucas.prado -Path "OU=Financeiro,{{dn}}" -AccountPassword ' + PW + ' -Enabled $true', check: { all: [{ state: 'win.user', arg: 'lucas.prado', eq: 'enabled' }, { state: 'win.usersIn', arg: 'Financeiro', gt: 0 }] } },
        { text: 'Ele herda o acesso pelo grupo (nunca permissão direta para a pessoa).', help: ['win-member'], auto: 'Add-ADGroupMember -Identity Financeiro -Members lucas.prado', check: { state: 'win.memberOf', arg: 'Financeiro:lucas.prado' } },
        { text: 'Confira quem acessa a pasta C:\\Dados\\Financeiro.', help: ['win-icacls'], auto: 'icacls C:\\Dados\\Financeiro', check: { ran: 'win-icacls:c:\\dados\\financeiro' } },
      ],
    },
    {
      id: 'pl3_desligamento', n: 4, rank: 'pl3', title: 'Desligamento: joao.lima · {{dev.name}}', difficulty: 3, xp: 140, credits: 21,
      skill: 'seguranca', roles: ['sysadmin', 'seguranca'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'João Lima saiu da empresa. Antes de desabilitar, o RH quer saber de quantos grupos ele fazia parte.',
      target: DC, setup: { win: 'leaver' }, vars: { n: 'win.groupsOf:joao.lima' },
      steps: [
        { type: 'answer', text: 'De quantos grupos joao.lima faz parte, sem contar Domain Users?', help: ['win-pass', 'responder'], answer: { accept: ['{{n}}'], normalize: 'int' } },
        { text: 'A conta joao.lima não entra mais.', help: ['win-disable'], auto: 'Disable-ADAccount -Identity joao.lima', check: { state: 'win.user', arg: 'joao.lima', eq: 'disabled' } },
      ],
    },
    {
      id: 'pl3_agdlp', n: 5, rank: 'pl3', title: 'Permissão do jeito certo: Comercial · {{dev.name}}', difficulty: 4, xp: 180, credits: 27,
      skill: 'sistemas', roles: ['sysadmin'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O grupo Comercial (Global) precisa da pasta C:\\Dados\\Comercial. Do jeito certo (AGDLP): pessoas → grupo Global → grupo DomainLocal → permissão.',
      target: DC, setup: { win: 'comercial' }, vars: { nb: 'win.netbios' },
      steps: [
        { text: 'Existe o grupo DL_Comercial, de escopo DomainLocal.', help: ['win-newgroup'], auto: 'New-ADGroup -Name DL_Comercial -GroupScope DomainLocal', check: { state: 'win.groupScope', arg: 'DL_Comercial', eq: 'DomainLocal' } },
        { text: 'O grupo Comercial está dentro do DL_Comercial.', help: ['win-member'], auto: 'Add-ADGroupMember -Identity DL_Comercial -Members Comercial', check: { state: 'win.memberOf', arg: 'DL_Comercial:Comercial' } },
        { text: 'O DL_Comercial pode modificar a pasta C:\\Dados\\Comercial.', help: ['win-icacls'], auto: 'icacls C:\\Dados\\Comercial /grant "{{nb}}\\DL_Comercial:(OI)(CI)M"', check: { state: 'win.aclHas', arg: 'C:\\Dados\\Comercial|DL_Comercial' } },
      ],
    },
    {
      id: 'pl3_pastas_depto', n: 6, rank: 'pl3', title: 'Uma pasta por departamento · {{dev.name}}', difficulty: 4, xp: 170, credits: 25,
      skill: 'sistemas', roles: ['sysadmin'], bot_minutes: 30, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'RH, Compras e Vendas querem cada um a sua pasta em C:\\Dados, fechada para o próprio grupo (os grupos já existem).',
      target: DC, setup: { win: 'depts' }, vars: { nb: 'win.netbios' },
      steps: [
        { text: 'C:\\Dados\\RH: só o grupo RH e os administradores.', help: ['win-mkdir', 'win-inherit'], auto: 'New-Item -Path C:\\Dados\\RH -ItemType Directory\nicacls C:\\Dados\\RH /inheritance:r\nicacls C:\\Dados\\RH /grant "Administrators:(OI)(CI)F"\nicacls C:\\Dados\\RH /grant "{{nb}}\\RH:(OI)(CI)M"', check: { state: 'win.aclOnly', arg: 'C:\\Dados\\RH|RH' } },
        { text: 'C:\\Dados\\Compras: só o grupo Compras e os administradores.', help: ['win-mkdir', 'win-inherit'], auto: 'New-Item -Path C:\\Dados\\Compras -ItemType Directory\nicacls C:\\Dados\\Compras /inheritance:r\nicacls C:\\Dados\\Compras /grant "Administrators:(OI)(CI)F"\nicacls C:\\Dados\\Compras /grant "{{nb}}\\Compras:(OI)(CI)M"', check: { state: 'win.aclOnly', arg: 'C:\\Dados\\Compras|Compras' } },
        { text: 'C:\\Dados\\Vendas: só o grupo Vendas e os administradores.', help: ['win-mkdir', 'win-inherit'], auto: 'New-Item -Path C:\\Dados\\Vendas -ItemType Directory\nicacls C:\\Dados\\Vendas /inheritance:r\nicacls C:\\Dados\\Vendas /grant "Administrators:(OI)(CI)F"\nicacls C:\\Dados\\Vendas /grant "{{nb}}\\Vendas:(OI)(CI)M"', check: { state: 'win.aclOnly', arg: 'C:\\Dados\\Vendas|Vendas' } },
      ],
    },
    {
      id: 'pl3_quem_errou', n: 7, rank: 'pl3', title: 'Quem está errando a senha? · {{dev.name}}', difficulty: 4, xp: 150, credits: 22,
      skill: 'seguranca', roles: ['seguranca', 'sysadmin'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O log de segurança do {{dev.name}} está cheio de falhas de logon. Descubra de qual conta, antes que ela trave.',
      target: DC, setup: { win: 'badpwd' }, vars: { bad: 'win.badUser' },
      steps: [
        { text: 'Veja os eventos de segurança recentes (4625 = falha de logon).', help: ['win-event'], auto: 'Get-WinEvent -LogName Security -MaxEvents 8', check: { ran: 'win-events:security' } },
        { type: 'answer', text: 'Qual conta está errando a senha?', help: ['responder'], answer: { accept: ['{{bad}}'], normalize: 'text' } },
      ],
    },
    {
      id: 'pl3_san', n: 8, rank: 'pl3', title: 'Storage SAN para os arquivos', difficulty: 3, xp: 140, credits: 21,
      skill: 'servidores', roles: [], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'steps',
      summary: 'Os servidores de arquivos e o banco pedem disco rápido e grande. Uma storage SAN na sala aumenta o que eles rendem.',
      target: { kind: 'rack' }, vars: { n: 'items:storage' },
      steps: [
        { text: 'Instale uma Storage SAN na sala dos servidores (Construir → Equipamentos → Storage).', action: 'build', check: { state: 'items', arg: 'storage', gt: '{{n}}' } },
      ],
    },
    {
      id: 'pl3_fm200', n: 9, rank: 'pl3', title: 'Proteção contra incêndio', difficulty: 3, xp: 130, credits: 20,
      skill: 'servidores', roles: [], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'steps',
      summary: 'Água estraga servidor. Os cilindros FM-200 apagam fogo sem molhar nada: instale na sala dos racks.',
      target: { kind: 'rack' }, vars: { n: 'items:fm200' },
      steps: [
        { text: 'Instale Cilindros FM-200 na sala dos servidores.', action: 'build', check: { state: 'items', arg: 'fm200', gt: '{{n}}' } },
      ],
    },
    {
      id: 'pl3_banco_highend', n: 10, rank: 'pl3', title: 'Banco de dados num servidor high-end', difficulty: 4, xp: 160, credits: 24,
      skill: 'servidores', roles: [], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'steps',
      summary: 'O banco principal cresceu de novo. Instale um servidor high-end e passe o Banco de dados para ele.',
      target: { kind: 'rack' }, vars: { n: 'devs:srv_hi', db: 'svc.model:db,srv_hi' },
      steps: [
        { text: 'Instale um Servidor high-end num rack.', action: 'build', check: { state: 'devs', arg: 'srv_hi', gt: '{{n}}' } },
        { text: 'Um servidor high-end é o Banco de dados (Infra → Servidores).', check: { state: 'svc.model', arg: 'db,srv_hi', gt: '{{db}}' } },
      ],
    },
    {
      id: 'pl3_nao_durou', n: 11, rank: 'pl3', title: 'O conserto não durou · {{dev.name}}', difficulty: 4, xp: 170, credits: 25,
      skill: 'servidores', roles: ['sysadmin', 'servidores'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'A equipe reiniciou o nginx do {{dev.name}} ontem e o site caiu de novo. Reiniciar não resolve: ache a causa raiz.',
      target: T(LNX, { web: true }), setup: { fault: 'disksvc' },
      steps: [
        { text: 'Investigue por que o nginx cai.', help: ['systemctl-status'], auto: 'systemctl status nginx\ndf -h', check: { all: [{ ran: 'status:nginx' }, { ran: 'df' }] } },
        { type: 'answer', text: 'Qual é a causa raiz?', help: ['responder'], answer: { accept: ['disco', 'disco cheio', 'espaco em disco', 'falta de espaco'], normalize: 'text' } },
        { text: 'A causa raiz está resolvida e o site responde.', help: ['journalctl-vacuum'], auto: 'sudo journalctl --vacuum-size=200M\nsudo systemctl restart nginx\ncurl localhost', check: { all: [{ state: 'ok.web' }, { ran: 'curl-ok' }] } },
      ],
    },
    {
      id: 'pl3_passagem_turno', n: 12, rank: 'pl3', title: 'Passagem de turno', difficulty: 3, xp: 140, credits: 21,
      skill: 'gestao', roles: [], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Seu turno acaba. Antes de sair, passe para o próximo turno o estado dos alertas (Tarefas e Monitor).',
      handoff: 'o próximo turno assume os alertas',
      target: LNX, devices: { peer: 'server.peer' }, setup: { faults: [{ fault: 'link', on: 'dev', quiet: true }, { fault: 'disk', on: 'peer', quiet: true }] },
      vars: { n: 'faults.count', down: 'faulty:link' },
      steps: [
        { device: 'any', type: 'answer', text: 'Quantos alertas estão abertos agora?', help: ['responder'], answer: { accept: ['{{n}}'], normalize: 'int' } },
        { device: 'any', type: 'answer', text: 'Qual servidor está fora da rede?', help: ['responder'], answer: { accept: ['{{down}}'], normalize: 'text' } },
      ],
    },
    {
      id: 'pl3_conta_servico', n: 13, rank: 'pl3', title: 'A conta do backup trava toda hora · {{dev.name}}', difficulty: 4, xp: 170, credits: 25,
      skill: 'seguranca', roles: ['sysadmin', 'seguranca'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'A conta svc_backup trava toda noite: alguma máquina ainda usa a senha antiga. Ache qual antes de desbloquear.',
      handoff: 'a máquina de origem vai receber a senha nova',
      target: DC, devices: { peer: 'server.peer' }, setup: { win: 'svclock' }, vars: { src: 'win.lockSrc' },
      steps: [
        { text: 'Veja as contas bloqueadas.', help: ['win-locked'], auto: 'Search-ADAccount -LockedOut', check: { ran: 'win-locked-search' } },
        { text: 'Veja no log Security de onde vêm as falhas.', help: ['win-event'], auto: 'Get-WinEvent -LogName Security -MaxEvents 8', check: { ran: 'win-events:security' } },
        { type: 'answer', text: 'De qual IP vêm as senhas erradas?', help: ['responder'], answer: { accept: ['{{src}}'], normalize: 'ip' } },
        { text: 'A conta svc_backup está desbloqueada.', help: ['win-unlock'], auto: 'Unlock-ADAccount -Identity svc_backup', check: { state: 'win.user', arg: 'svc_backup', eq: 'enabled' } },
      ],
    },
    {
      id: 'pl3_dns_todos', n: 14, rank: 'pl3', title: 'Nomes para três servidores · {{dev.name}}', difficulty: 4, xp: 160, credits: 24,
      skill: 'redes', roles: ['sysadmin', 'redes'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'A equipe vive decorando IP. Publique no DNS do domínio o {{peer.name}}, o {{alt.name}} e o {{third.name}} pelo nome.',
      target: DC, devices: { peer: 'server.peer', alt: 'server.peer', third: 'server.peer' }, setup: { win: 'dropPeerRr' }, vars: { dom: 'win.domain' },
      steps: [
        { text: '{{peer.host}}.{{dom}} → {{peer.ip}}.', help: ['win-dnsa'], auto: 'Add-DnsServerResourceRecordA -ZoneName {{dom}} -Name {{peer.host}} -IPv4Address {{peer.ip}}', check: { state: 'win.rr', arg: '{{peer.host}}', eq: '{{peer.ip}}' } },
        { text: '{{alt.host}}.{{dom}} → {{alt.ip}}.', help: ['win-dnsa'], auto: 'Add-DnsServerResourceRecordA -ZoneName {{dom}} -Name {{alt.host}} -IPv4Address {{alt.ip}}', check: { state: 'win.rr', arg: '{{alt.host}}', eq: '{{alt.ip}}' } },
        { text: '{{third.host}}.{{dom}} → {{third.ip}}.', help: ['win-dnsa'], auto: 'Add-DnsServerResourceRecordA -ZoneName {{dom}} -Name {{third.host}} -IPv4Address {{third.ip}}', check: { state: 'win.rr', arg: '{{third.host}}', eq: '{{third.ip}}' } },
        { text: 'Teste um dos nomes.', help: ['win-resolve'], auto: 'Resolve-DnsName {{third.host}}.{{dom}}', check: { ran: 'cmd:resolve-dnsname' } },
      ],
    },
    {
      id: 'pl3_salvar_switches', n: 15, rank: 'pl3', title: 'Dois switches sem salvar', difficulty: 3, xp: 140, credits: 21,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Ontem mexeram no {{dev.name}} e no {{sw.name}} e não salvaram nenhum dos dois. Vai ter manutenção elétrica hoje à noite.',
      target: T(MSW, { linked: true }), devices: { sw: 'switch.other' }, setup: { swconfig: 'unsaved2' },
      steps: [
        { text: 'A configuração em uso do {{dev.name}} está salva.', help: ['copy-run-start'], auto: 'enable\ncopy running-config startup-config', check: { state: 'sw.saved' } },
        { device: 'sw', text: 'A do {{sw.name}} também.', help: ['copy-run-start'], auto: 'enable\ncopy running-config startup-config', check: { state: 'sw.saved' } },
      ],
    },
    {
      id: 'pl3_padronizar_nomes', n: 16, rank: 'pl3', title: 'Padronizar os nomes: {{dev.name}} e {{peer.name}}', difficulty: 3, xp: 140, credits: 21,
      skill: 'sistemas', roles: ['sysadmin', 'tecnico'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Dois servidores voltaram de reinstalação como "localhost". O padrão é o nome do equipamento em minúsculas.',
      target: LNX, devices: { peer: 'server.peer' }, setup: { hostname: 'localhost', hostnameOn: ['dev', 'peer'] },
      steps: [
        { text: 'O {{dev.name}} se chama {{dev.host}}.', help: ['hostnamectl'], auto: 'sudo hostnamectl set-hostname {{dev.host}}', check: { state: 'hostname', eq: '{{dev.host}}' } },
        { device: 'peer', text: 'O {{peer.name}} se chama {{peer.host}}.', help: ['hostnamectl'], auto: 'sudo hostnamectl set-hostname {{peer.host}}', check: { state: 'hostname', eq: '{{peer.host}}' } },
      ],
    },
    {
      id: 'pl3_auditoria_leitura', n: 17, rank: 'pl3', title: 'A auditoria precisa ler o Financeiro · {{dev.name}}', difficulty: 3, xp: 130, credits: 20,
      skill: 'seguranca', roles: ['sysadmin'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'A auditoria externa vai ler os arquivos do Financeiro por uma semana. Leitura, e só leitura, para o grupo Auditoria.',
      target: DC, setup: { win: 'audit' }, vars: { nb: 'win.netbios' },
      steps: [
        { text: 'Veja quem acessa o compartilhamento Financeiro.', help: ['win-share'], auto: 'Get-SmbShareAccess -Name Financeiro', check: { ran: 'win-share-access:financeiro' } },
        { text: 'O grupo Auditoria tem leitura (Read) no compartilhamento.', help: ['win-share'], auto: 'Grant-SmbShareAccess -Name Financeiro -AccountName "{{nb}}\\Auditoria" -AccessRight Read', check: { state: 'win.shareTo', arg: 'Financeiro:Auditoria', eq: 'Read' } },
      ],
    },
    {
      id: 'pl3_incidente_equipe', n: 18, rank: 'pl3', title: 'Incidente com a equipe', difficulty: 4, xp: 180, credits: 27,
      skill: 'gestao', roles: [], bot_minutes: 25, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Incidente grande: {{dev.name}}, {{peer.name}} e {{alt.name}} com problemas. Resolva os dois primeiros e delegue o terceiro.',
      handoff: 'o terceiro servidor fica com a equipe',
      target: T(LNX, { web: true }), devices: { peer: 'server.peer', alt: 'server.peer' },
      setup: { faults: [{ fault: 'link', on: 'dev' }, { fault: 'service', on: 'peer' }, { fault: 'disk', on: 'alt' }] }, vars: { o: 'orders' },
      steps: [
        { text: 'O {{dev.name}} está na rede.', help: ['ip-link-up'], auto: 'sudo ip link set eth0 up', check: { state: 'up' } },
        { device: 'peer', text: 'O site do {{peer.name}} responde.', help: ['systemctl-restart'], auto: 'sudo systemctl restart nginx\ncurl localhost', check: { all: [{ state: 'ok.web' }, { ran: 'curl-ok' }] } },
        { device: 'any', text: 'O {{alt.name}} fica com a equipe: dê a ordem (Equipe → Atribuir tarefa).', check: { state: 'ordersSince', arg: '{{o}}', gt: 0 } },
      ],
    },
    {
      id: 'pl3_atacante_tres', n: 19, rank: 'pl3', title: 'Atacante em três servidores', difficulty: 4, xp: 160, credits: 24,
      skill: 'seguranca', roles: [], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Tentativas de login no {{dev.name}}, no {{peer.name}} e no {{alt.name}}. Ache o IP comum e passe para a segurança.',
      handoff: 'a segurança bloqueia o IP no firewall',
      target: LNX, devices: { peer: 'server.peer', alt: 'server.peer' }, setup: { authlog: 'bruteforce2' }, vars: { attacker: 'auth.attacker', o: 'orders' },
      steps: [
        { text: 'Senhas erradas no {{dev.name}}.', help: ['grep'], auto: 'grep "Failed password" /var/log/auth.log', check: { ran: 'grep-failed:/var/log/auth.log' } },
        { device: 'peer', text: 'No {{peer.name}}.', help: ['grep'], auto: 'grep "Failed password" /var/log/auth.log', check: { ran: 'grep-failed:/var/log/auth.log' } },
        { device: 'alt', text: 'No {{alt.name}}.', help: ['grep'], auto: 'grep "Failed password" /var/log/auth.log', check: { ran: 'grep-failed:/var/log/auth.log' } },
        { device: 'alt', type: 'answer', text: 'Qual IP ataca os três?', help: ['responder'], answer: { accept: ['{{attacker}}'], normalize: 'ip' } },
        { device: 'any', text: 'Passe para a segurança (Equipe → Atribuir tarefa).', check: { state: 'ordersSince', arg: '{{o}}', gt: 0 } },
      ],
    },
    {
      id: 'pl3_dhcp_esgotado', n: 20, rank: 'pl3', title: 'DHCP esgotado · {{dev.name}}', difficulty: 4, xp: 170, credits: 25,
      skill: 'redes', roles: ['sysadmin', 'redes'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Estações novas não pegam IP: o escopo do {{dev.name}} foi criado pequeno demais, só para os primeiros PCs.',
      target: DC, setup: { win: 'dhcpTiny' }, vars: { n: 'win.leases' },
      steps: [
        { text: 'Veja o escopo.', help: ['win-scope'], auto: 'Get-DhcpServerv4Scope', check: { ran: 'win-dhcp-scope-list' } },
        { text: 'Veja as concessões.', help: ['win-lease'], auto: 'Get-DhcpServerv4Lease -ScopeId 10.0.1.0', check: { ran: 'win-dhcp-lease' } },
        { type: 'answer', text: 'Quantos endereços o escopo consegue emprestar hoje?', help: ['responder'], answer: { accept: ['{{n}}'], normalize: 'int' } },
        { text: 'O escopo tem 50 endereços ou mais, com gateway e DNS.', help: ['win-scope'], auto: 'Remove-DhcpServerv4Scope -ScopeId 10.0.1.0\nAdd-DhcpServerv4Scope -Name LAN -StartRange 10.0.1.100 -EndRange 10.0.1.199 -SubnetMask 255.255.255.0\nSet-DhcpServerv4OptionValue -ScopeId 10.0.1.0 -Router {{gw}} -DnsServer {{dev.ip}}', check: { all: [{ state: 'win.scopeSize', gt: 49 }, { state: 'win.scopeRouter', eq: '{{gw}}' }] } },
      ],
    },

    /* ---------------- Sênior: comandos novos — VLAN, firewall, contas, permissões, pacotes, backup, cron ---------------- */
    {
      id: 'sr_vlan_cameras', n: 1, rank: 'sr', title: 'Uma VLAN para as câmeras · {{dev.name}}', difficulty: 4, xp: 180, credits: 27,
      skill: 'redes', roles: ['redes'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'As câmeras vão para o {{dev.name}}, mas não podem conversar com os servidores. Crie a VLAN 30 (CAMERAS) e reserve as portas {{a}} e {{b}} para elas.',
      target: T(MSW, { linked: true }), vars: { a: 'sw.free:0', b: 'sw.free:1' },
      steps: [
        { text: 'Veja as VLANs que o {{dev.name}} já tem.', help: ['show-vlan'], auto: 'enable\nshow vlan brief', check: { ran: 'show-vlan' } },
        { text: 'Existe a VLAN 30, chamada CAMERAS.', help: ['sw-vlan'], auto: 'configure terminal\nvlan 30\nname CAMERAS\nexit', check: { state: 'sw.vlan', arg: '30', eq: 'CAMERAS' } },
        { text: 'As portas {{a}} e {{b}} são de acesso na VLAN 30.', help: ['sw-access'], auto: 'interface {{a}}\nswitchport mode access\nswitchport access vlan 30\ninterface {{b}}\nswitchport mode access\nswitchport access vlan 30\nend', check: { all: [{ state: 'sw.portVlan', arg: '{{a}}', eq: 30 }, { state: 'sw.portVlan', arg: '{{b}}', eq: 30 }] } },
        { text: 'A configuração está salva.', help: ['copy-run-start'], auto: 'end\ncopy running-config startup-config', check: { state: 'sw.saved' } },
      ],
    },
    {
      id: 'sr_vlan_errada', n: 2, rank: 'sr', title: '{{dev.name}} na VLAN errada', difficulty: 4, xp: 170, credits: 25,
      skill: 'redes', roles: ['redes'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'Numa limpeza de portas, o {{dev.name}} foi parar na VLAN de quarentena do {{sw.name}}. No servidor tudo parece certo.',
      target: T(LNX, { directLink: true }), devices: { sw: 'switch.of' }, setup: { fault: 'vlanwrong', on: 'sw' }, vars: { port: 'srv.port' },
      steps: [
        { text: 'No {{dev.name}}: IP certo, interface no ar, e mesmo assim o gateway não responde?', help: ['ip-addr'], auto: 'ip addr\nping -c 3 {{gw}}', check: { any: [{ ran: 'ping-fail' }, { at: 'dev', state: 'up' }] } },
        { device: 'sw', text: 'No {{sw.name}}, veja em que VLAN está cada porta.', help: ['show-vlan'], auto: 'enable\nshow vlan brief', check: { ran: 'show-vlan' } },
        { device: 'sw', text: 'A porta do {{dev.name}} volta para a VLAN 10.', help: ['sw-access'], auto: 'configure terminal\ninterface {{port}}\nswitchport access vlan 10\nend', check: { state: 'sw.portVlan', arg: '{{port}}', eq: 10 } },
        { device: 'sw', text: 'A configuração está salva.', help: ['copy-run-start'], auto: 'end\ncopy running-config startup-config', check: { ran: 'config-saved' } },
        { text: 'O {{dev.name}} alcança o gateway.', help: ['ping'], auto: 'ping -c 3 {{gw}}', check: pingGw },
      ],
    },
    {
      id: 'sr_trunk', n: 3, rank: 'sr', title: 'Trunk entre o {{dev.name}} e o {{sw.name}}', difficulty: 5, xp: 210, credits: 31,
      skill: 'redes', roles: ['redes'], bot_minutes: 30, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Os dois switches vão ser ligados pelas portas {{a}} ({{dev.name}}) e {{b}} ({{sw.name}}). A ligação precisa levar as VLANs 10 (datacenter) e 30 (câmeras).',
      target: T(MSW, { linked: true }), devices: { sw: 'switch.other' }, vars: { a: 'sw.free:0', b: 'sw.free:0@sw' },
      steps: [
        { text: 'No {{dev.name}}, a {{a}} é trunk e leva as VLANs 10 e 30.', help: ['sw-trunk'], auto: 'enable\nconfigure terminal\ninterface {{a}}\nswitchport mode trunk\nswitchport trunk allowed vlan 10,30\nend', check: { all: [{ state: 'sw.trunkHas', arg: '{{a}}:10' }, { state: 'sw.trunkHas', arg: '{{a}}:30' }] } },
        { text: 'A configuração do {{dev.name}} está salva.', help: ['copy-run-start'], auto: 'end\ncopy running-config startup-config', check: { state: 'sw.saved' } },
        { device: 'sw', text: 'No {{sw.name}}, a {{b}} é trunk e leva as mesmas VLANs.', help: ['sw-trunk'], auto: 'enable\nconfigure terminal\ninterface {{b}}\nswitchport mode trunk\nswitchport trunk allowed vlan 10,30\nend', check: { all: [{ state: 'sw.trunkHas', arg: '{{b}}:10' }, { state: 'sw.trunkHas', arg: '{{b}}:30' }] } },
        { device: 'sw', text: 'Confira os trunks e salve.', help: ['show-trunk', 'copy-run-start'], auto: 'end\nshow interfaces trunk\ncopy running-config startup-config', check: { all: [{ ran: 'show-trunk' }, { state: 'sw.saved' }] } },
      ],
    },
    {
      id: 'sr_mac', n: 4, rank: 'sr', title: 'De quem é esse MAC? · {{dev.name}}', difficulty: 4, xp: 160, credits: 24,
      skill: 'redes', roles: ['redes', 'tecnico'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Um alerta de segurança traz só o endereço físico de uma placa: {{srv.mac}}. Descubra em que porta do {{dev.name}} ela está.',
      target: T(MSW, { direct: true }), vars: { srv: 'sw.direct' },
      steps: [
        { text: 'Veja a tabela de MACs do switch (ele escreve o MAC em grupos de 4: 5254.0001.1100).', help: ['show-mac'], auto: 'enable\nshow mac address-table', check: { ran: 'show-mac' } },
        { type: 'answer', text: 'Em que porta está a placa {{srv.mac}}?', help: ['responder'], answer: { accept: ['{{srv.port}}'], normalize: 'port' } },
      ],
    },
    {
      id: 'sr_ufw_ativar', n: 5, rank: 'sr', title: 'Ligar o firewall sem se trancar · {{dev.name}}', difficulty: 5, xp: 200, credits: 30,
      skill: 'seguranca', roles: ['seguranca', 'sysadmin'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O {{dev.name}} está sem firewall. Ligue, deixando entrar só o SSH (22) e o site (80). A ordem importa: quem liga antes de liberar a 22 se tranca para fora.',
      target: T(LNX, { web: true }), setup: { linux: 'fwoff' },
      steps: [
        { text: 'Veja o estado do firewall.', help: ['ufw-status'], auto: 'sudo ufw status', check: { ran: 'ufw-status' } },
        { text: 'O firewall está ligado, com o SSH (22) e o site (80) liberados.', help: ['ufw-allow', 'ufw-enable'], auto: 'sudo ufw allow 22\nsudo ufw allow 80\nsudo ufw enable', check: { all: [{ state: 'fw.on' }, { state: 'fw.allows', arg: '22' }, { state: 'fw.allows', arg: '80' }] } },
        { text: 'O site continua respondendo.', help: ['curl'], auto: 'curl localhost', check: { all: [{ state: 'ok.web' }, { ran: 'curl-ok' }] } },
      ],
    },
    {
      id: 'sr_ufw_bloquear', n: 6, rank: 'sr', title: 'Bloquear o atacante no {{dev.name}}', difficulty: 4, xp: 170, credits: 25,
      skill: 'seguranca', roles: ['seguranca'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O {{dev.name}} está sendo atacado por SSH. Desta vez não é para passar adiante: ache o IP e bloqueie você mesmo(a) no firewall.',
      target: LNX, setup: { authlog: 'bruteforce', linux: 'fwweb' }, vars: { attacker: 'auth.attacker' },
      steps: [
        { text: 'Ache de onde vêm as senhas erradas.', help: ['grep'], auto: 'grep "Failed password" /var/log/auth.log', check: { ran: 'grep-failed:/var/log/auth.log' } },
        { text: 'O IP do atacante está bloqueado no firewall.', help: ['ufw-deny'], auto: 'sudo ufw deny from {{attacker}}', check: { state: 'fw.denies', arg: '{{attacker}}' } },
        { text: 'Confira as regras.', help: ['ufw-status'], auto: 'sudo ufw status', check: { ran: 'ufw-status' } },
      ],
    },
    {
      id: 'sr_conta_dev', n: 7, rank: 'sr', title: 'Conta para o desenvolvedor · {{dev.name}}', difficulty: 4, xp: 160, credits: 24,
      skill: 'sistemas', roles: ['sysadmin'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Rafael entrou no time de desenvolvimento. Ele precisa de uma conta no {{dev.name}} e de estar no grupo deploy (que publica o site).',
      target: LNX, setup: { linux: 'nouser' },
      steps: [
        { text: 'Existe a conta rafael, com pasta pessoal e shell bash.', help: ['useradd'], auto: 'sudo useradd -m -s /bin/bash rafael', check: { state: 'user.exists', arg: 'rafael' } },
        { text: 'rafael está no grupo deploy.', help: ['usermod'], auto: 'sudo usermod -aG deploy rafael', check: { state: 'user.in', arg: 'rafael:deploy' } },
        { text: 'Confira os grupos da conta.', help: ['id'], auto: 'id rafael', check: { ran: 'id:rafael' } },
      ],
    },
    {
      id: 'sr_permissao', n: 8, rank: 'sr', title: 'Senha num arquivo aberto · {{dev.name}}', difficulty: 4, xp: 180, credits: 27,
      skill: 'seguranca', roles: ['seguranca', 'sysadmin'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Uma auditoria achou o /etc/app/config.env (com a senha do banco) legível por qualquer conta do {{dev.name}}. Só a aplicação (grupo app) pode ler.',
      target: LNX, setup: { linux: 'openfile' },
      steps: [
        { text: 'Veja as permissões dos arquivos da aplicação.', help: ['ls-l'], auto: 'ls -l /etc/app', check: { ran: 'ls-l:/etc/app' } },
        { type: 'answer', text: 'Quais são as permissões dele hoje, em número (ex.: 755)?', help: ['ls-l', 'responder'], answer: { accept: ['644'], normalize: 'text' } },
        { text: 'O dono é root, o grupo é app, e o modo é 640 (outros não leem).', help: ['chmod', 'chown'], auto: 'sudo chmod 640 /etc/app/config.env\nsudo chown root:app /etc/app/config.env', check: { all: [{ state: 'file.mode', arg: '/etc/app/config.env', eq: '640' }, { state: 'file.group', arg: '/etc/app/config.env', eq: 'app' }, { state: 'file.owner', arg: '/etc/app/config.env', eq: 'root' }] } },
      ],
    },
    {
      id: 'sr_conta_vazada', n: 9, rank: 'sr', title: 'Conta vazada no {{dev.name}}', difficulty: 4, xp: 170, credits: 25,
      skill: 'seguranca', roles: ['seguranca'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'lesson',
      handoff: 'o IP vai para a segurança investigar',
      summary: 'A conta "estagio" entrou no {{dev.name}} com senha, de um IP de fora da empresa. Bloqueie a conta e descubra de onde veio.',
      target: LNX, setup: { linux: 'leak' }, vars: { leak: 'auth.leak' },
      steps: [
        { text: 'Ache os logins com senha aceitos.', help: ['grep'], auto: 'grep "Accepted password" /var/log/auth.log', check: { ran: 'grep-hit:/var/log/auth.log' } },
        { type: 'answer', text: 'De qual IP a conta estagio entrou?', help: ['responder'], answer: { accept: ['{{leak}}'], normalize: 'ip' } },
        { text: 'A conta estagio está bloqueada.', help: ['passwd-l'], auto: 'sudo passwd -l estagio', check: { state: 'user.locked', arg: 'estagio' } },
        { text: 'Confira o estado da conta.', help: ['passwd-l'], auto: 'sudo passwd -S estagio', check: { ran: 'passwd-status:estagio' } },
      ],
    },
    {
      id: 'sr_atualizacoes', n: 10, rank: 'sr', title: 'Atualizações de segurança · {{dev.name}}', difficulty: 4, xp: 170, credits: 25,
      skill: 'sistemas', roles: ['sysadmin'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Saíram correções de segurança para pacotes do {{dev.name}}, entre eles o nginx. Atualize sem deixar o site com a versão velha rodando.',
      target: T(LNX, { web: true }), setup: { linux: 'updates' }, vars: { n: 'apt.pending' },
      steps: [
        { text: 'A lista de pacotes está atualizada.', help: ['apt-update'], auto: 'sudo apt update', check: { ran: 'apt-update' } },
        { text: 'Veja o que pode ser atualizado.', help: ['apt-update'], auto: 'apt list --upgradable', check: { ran: 'apt-list' } },
        { type: 'answer', text: 'Quantos pacotes têm atualização?', help: ['responder'], answer: { accept: ['{{n}}'], normalize: 'int' } },
        { text: 'Os pacotes estão atualizados.', help: ['apt-upgrade'], auto: 'sudo apt upgrade -y', check: { state: 'apt.pending', eq: 0 } },
        { text: 'O nginx novo é o que está rodando, e o site responde.', help: ['systemctl-restart'], auto: 'sudo systemctl restart nginx\ncurl localhost', check: { all: [{ state: 'nginx.fresh' }, { ran: 'curl-ok' }] } },
      ],
    },
    {
      id: 'sr_fail2ban', n: 11, rank: 'sr', title: 'Instalar o fail2ban · {{dev.name}}', difficulty: 4, xp: 160, credits: 24,
      skill: 'seguranca', roles: ['seguranca', 'sysadmin'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Bloquear atacante à mão não escala. O fail2ban lê o auth.log e bloqueia sozinho quem erra muitas senhas.',
      target: LNX, setup: { linux: 'nofail2ban' },
      steps: [
        { text: 'A lista de pacotes está atualizada.', help: ['apt-update'], auto: 'sudo apt update', check: { ran: 'apt-update' } },
        { text: 'O fail2ban está instalado.', help: ['apt-install'], auto: 'sudo apt install -y fail2ban', check: { state: 'pkg', arg: 'fail2ban' } },
        { text: 'O serviço fail2ban está rodando.', help: ['systemctl-status'], auto: 'systemctl status fail2ban', check: { all: [{ state: 'service', arg: 'fail2ban', eq: 'active' }, { ran: 'status:fail2ban' }] } },
      ],
    },
    {
      id: 'sr_backup_etc', n: 12, rank: 'sr', title: 'Backup do /etc antes da mudança · {{dev.name}}', difficulty: 4, xp: 170, credits: 25,
      skill: 'servidores', roles: ['sysadmin', 'servidores'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Amanhã tem mudança grande nas configurações do {{dev.name}}. Antes, guarde uma cópia do /etc em /backup/etc.tar.gz.',
      target: LNX, setup: { linux: 'nobackup' },
      steps: [
        { text: 'Veja o que já existe em /backup.', help: ['ls-l'], auto: 'ls -l /backup', check: { ran: 'ls:/backup' } },
        { text: 'Existe o /backup/etc.tar.gz com o /etc dentro.', help: ['tar'], auto: 'sudo tar czf /backup/etc.tar.gz /etc', check: { state: 'backup.of', arg: '/etc' } },
        { text: 'Confira o que tem dentro do arquivo.', help: ['tar'], auto: 'tar tzf /backup/etc.tar.gz', check: { ran: 'tar-list:/backup/etc.tar.gz' } },
      ],
    },
    {
      id: 'sr_rsync', n: 13, rank: 'sr', title: 'Cópia do site no {{peer.name}}', difficulty: 4, xp: 180, credits: 27,
      skill: 'servidores', roles: ['sysadmin', 'servidores'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Se o disco do {{dev.name}} morrer, o site some junto. Mantenha uma cópia do /var/www no {{peer.name}} ({{peer.ip}}), na pasta /srv/backup/www.',
      target: T(LNX, { web: true }), devices: { peer: 'server.peer' },
      steps: [
        { text: 'Veja o que tem em /var/www.', help: ['ls-l'], auto: 'ls -l /var/www', check: { ran: 'ls:/var/www' } },
        { text: 'O /var/www foi copiado para o {{peer.name}} (usuário backup).', help: ['rsync'], auto: 'rsync -a /var/www/ backup@{{peer.ip}}:/srv/backup/www/', check: { ran: 'rsync-ok:{{peer.ip}}' } },
      ],
    },
    {
      id: 'sr_cron_backup', n: 14, rank: 'sr', title: 'Backup todo dia às 2h · {{dev.name}}', difficulty: 5, xp: 200, credits: 30,
      skill: 'servidores', roles: ['sysadmin'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O script /usr/local/bin/backup.sh existe, mas só roda quando alguém lembra. Agende para todo dia às 2h da manhã.',
      target: LNX, setup: { linux: 'nocron' },
      steps: [
        { text: 'Veja o que já está agendado.', help: ['crontab'], auto: 'crontab -l', check: { ran: 'cron-list' } },
        { text: 'O backup.sh roda todo dia às 2h (minuto 0, hora 2).', help: ['crontab'], auto: 'echo "0 2 * * * /usr/local/bin/backup.sh" | crontab -', check: { state: 'cron.at', arg: '/usr/local/bin/backup.sh', eq: '0 2' } },
      ],
    },
    {
      id: 'sr_cron_quebrado', n: 15, rank: 'sr', title: 'O backup não roda · {{dev.name}}', difficulty: 5, xp: 210, credits: 31,
      skill: 'servidores', roles: ['sysadmin'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Faz dias que nenhum backup aparece em /backup, mesmo com o agendamento das 3h. O syslog guarda o motivo.',
      target: LNX, setup: { linux: 'cronbroken' },
      steps: [
        { text: 'Veja o que o cron registrou no syslog.', help: ['grep'], auto: 'grep CRON /var/log/syslog', check: { ran: 'grep-hit:/var/log/syslog' } },
        { text: 'Veja o agendamento e o que existe em /usr/local/bin.', help: ['crontab', 'ls-l'], auto: 'crontab -l\nls /usr/local/bin', check: { all: [{ ran: 'cron-list' }, { ran: 'ls:/usr/local/bin' }] } },
        { type: 'answer', text: 'Qual é o nome certo do script?', help: ['responder'], answer: { accept: ['backup.sh', '/usr/local/bin/backup.sh'], normalize: 'text' } },
        { text: 'O agendamento das 3h roda o script certo.', help: ['crontab'], auto: 'echo "0 3 * * * /usr/local/bin/backup.sh" | crontab -', check: { all: [{ state: 'cron.at', arg: '/usr/local/bin/backup.sh', eq: '0 3' }, { not: { state: 'cron.has', arg: 'bkp.sh' } }] } },
      ],
    },
    {
      id: 'sr_fitas', n: 16, rank: 'sr', title: 'Backup fora do prédio', difficulty: 4, xp: 170, credits: 25,
      skill: 'servidores', roles: [], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'steps',
      summary: 'Backup que fica no mesmo prédio pega fogo junto. Uma biblioteca de fitas grava cópias que saem do datacenter toda semana.',
      target: { kind: 'rack' }, vars: { n: 'items:tapelib' },
      steps: [
        { text: 'Instale uma Biblioteca de fitas (Construir → Racks).', action: 'build', check: { state: 'items', arg: 'tapelib', gt: '{{n}}' } },
      ],
    },
    {
      id: 'sr_rede_25g', n: 17, rank: 'sr', title: 'Rede de storage em 25G', difficulty: 4, xp: 180, credits: 27,
      skill: 'redes', roles: [], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'steps',
      summary: 'Os nós de VMs leem os discos pela rede, e 1 Gb/s virou gargalo. Instale um switch 25G e passe um servidor para ele.',
      target: { kind: 'rack' }, vars: { sw: 'devs:sw_25g', on: 'on.model:sw_25g' },
      steps: [
        { text: 'Instale um Switch 25G num rack.', action: 'build', check: { state: 'devs', arg: 'sw_25g', gt: '{{sw}}' } },
        { text: 'Passe o cabo de um servidor para ele (Cabeamento).', action: 'cabling', check: { state: 'on.model', arg: 'sw_25g', gt: '{{on}}' } },
      ],
    },
    {
      id: 'sr_sala_nova', n: 18, rank: 'sr', title: 'Switch novo com a VLAN dos servidores', difficulty: 5, xp: 220, credits: 33,
      skill: 'redes', roles: [], bot_minutes: 30, weight: 1, trigger: 'random', complete: 'steps',
      summary: 'A expansão vai ganhar um switch próprio. Instale um switch gerenciável e já crie nele a VLAN 20, chamada SERVIDORES.',
      target: { kind: 'rack' }, vars: { n: 'devs:switch' },
      steps: [
        { text: 'Instale um switch gerenciável num rack.', action: 'build', check: { state: 'devs', arg: 'switch', gt: '{{n}}' } },
        { text: 'Num switch, existe a VLAN 20 chamada SERVIDORES (console do switch: vlan 20 → name SERVIDORES).', check: { state: 'vlan.any', arg: '20:SERVIDORES' } },
      ],
    },
    {
      id: 'sr_porta_trunk', n: 19, rank: 'sr', title: '{{dev.name}} numa porta trunk', difficulty: 4, xp: 170, credits: 25,
      skill: 'redes', roles: ['redes'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'Alguém configurou a porta do {{dev.name}} no {{sw.name}} como trunk, achando que era a ligação com outro switch. O servidor saiu da rede.',
      target: T(LNX, { directLink: true }), devices: { sw: 'switch.of' }, setup: { fault: 'porttrunk', on: 'sw' }, vars: { port: 'srv.port' },
      steps: [
        { device: 'sw', text: 'No {{sw.name}}, veja os trunks.', help: ['show-trunk'], auto: 'enable\nshow interfaces trunk', check: { ran: 'show-trunk' } },
        { device: 'sw', text: 'A porta do {{dev.name}} volta a ser de acesso, na VLAN 10.', help: ['sw-mode'], auto: 'configure terminal\ninterface {{port}}\nswitchport mode access\nend', check: { all: [{ state: 'sw.portMode', arg: '{{port}}', eq: 'access' }, { state: 'sw.portVlan', arg: '{{port}}', eq: 10 }] } },
        { device: 'sw', text: 'A configuração está salva.', help: ['copy-run-start'], auto: 'end\ncopy running-config startup-config', check: { ran: 'config-saved' } },
        { text: 'O {{dev.name}} alcança o gateway.', help: ['ping'], auto: 'ping -c 3 {{gw}}', check: pingGw },
      ],
    },
    {
      id: 'sr_vlan_firewall', n: 20, rank: 'sr', title: 'O site do {{dev.name}} sumiu: duas causas', difficulty: 5, xp: 220, credits: 33,
      skill: 'redes', roles: ['redes', 'sysadmin'], bot_minutes: 30, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'Depois de uma janela de mudanças, o site do {{dev.name}} sumiu. Foram duas mudanças erradas: uma no {{sw.name}} e outra no próprio servidor.',
      target: T(LNX, { web: true, directLink: true }), devices: { sw: 'switch.of' }, setup: { faults: [{ fault: 'vlanwrong', on: 'sw' }, { fault: 'fwblock', on: 'dev' }] }, vars: { port: 'srv.port' },
      steps: [
        { text: 'Comece pela rede do {{dev.name}}.', help: ['ping'], auto: 'ip addr\nping -c 3 {{gw}}', check: { any: [{ ran: 'ping-fail' }, { at: 'dev', state: 'up' }] } },
        { device: 'sw', text: 'O {{dev.name}} volta para a rede.', help: ['show-vlan', 'sw-access'], auto: 'enable\nshow vlan brief\nconfigure terminal\ninterface {{port}}\nswitchport access vlan 10\nend', check: { at: 'dev', state: 'up' } },
        { text: 'Os clientes voltam a ver o site (o firewall deixa a porta 80 entrar).', help: ['ufw-status', 'ufw-allow'], auto: 'sudo ufw status\nsudo ufw allow 80', check: { state: 'ok.web' } },
        { text: 'O site responde.', help: ['curl'], auto: 'curl localhost', check: { ran: 'curl-ok' } },
      ],
    },

    /* ---------------- Especialista: desempenho, discos, certificados, banco, causa raiz ---------------- */
    {
      id: 'esp_cpu_100', n: 1, rank: 'esp', title: 'CPU em 100% no {{dev.name}}', difficulty: 5, xp: 200, credits: 30,
      skill: 'sistemas', roles: ['sysadmin'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O {{dev.name}} está lento e a carga não para de subir. Algum processo saiu do controle.',
      target: LNX, setup: { linux: 'runaway' }, vars: { pid: 'proc.top' },
      steps: [
        { text: 'Veja quem está usando a CPU.', help: ['top', 'ps'], auto: 'top', check: { any: [{ ran: 'top' }, { ran: 'ps' }] } },
        { type: 'answer', text: 'Qual é o PID do processo descontrolado?', help: ['responder'], answer: { accept: ['{{pid}}'], normalize: 'int' } },
        { text: 'O processo descontrolado não existe mais.', help: ['kill'], auto: 'sudo kill {{pid}}', check: { state: 'proc.count', arg: 'gerar.py', eq: 0 } },
        { text: 'Confira a carga de novo.', help: ['uptime'], auto: 'uptime', check: { ran: 'cmd:uptime' } },
      ],
    },
    {
      id: 'esp_oom', n: 2, rank: 'esp', title: 'A aplicação sumiu do {{dev.name}}', difficulty: 5, xp: 210, credits: 31,
      skill: 'sistemas', roles: ['sysadmin'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'A aplicação de pedidos (app) parou de madrugada sem erro no próprio log. Quem matou o processo?',
      target: LNX, setup: { linux: 'oom' },
      steps: [
        { text: 'Veja o estado do serviço app.', help: ['systemctl-status'], auto: 'systemctl status app', check: { ran: 'status:app' } },
        { text: 'Veja as mensagens do kernel.', help: ['dmesg'], auto: 'sudo dmesg', check: { ran: 'dmesg' } },
        { type: 'answer', text: 'Qual processo o kernel matou por falta de memória?', help: ['responder'], answer: { accept: ['java'], normalize: 'text' } },
        { text: 'A aplicação está rodando de novo.', help: ['systemctl-restart'], auto: 'sudo systemctl restart app', check: { state: 'service', arg: 'app', eq: 'active' } },
        { text: 'Confira o log do serviço.', help: ['journalctl-u'], auto: 'journalctl -u app --since "1 hour ago"', check: { ran: 'journal:app' } },
      ],
    },
    {
      id: 'esp_raid', n: 3, rank: 'esp', title: 'RAID degradado no {{dev.name}}', difficulty: 5, xp: 240, credits: 36,
      skill: 'servidores', roles: ['servidores', 'sysadmin'], bot_minutes: 25, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Um dos dois discos espelhados do {{dev.name}} falhou. O servidor segue no ar com um disco só: se o outro morrer, perde tudo.',
      target: LNX, setup: { linux: 'raiddeg' }, vars: { bad: 'raid.bad' },
      steps: [
        { text: 'Veja o estado do RAID.', help: ['mdstat'], auto: 'cat /proc/mdstat', check: { any: [{ ran: 'mdstat' }, { ran: 'mdadm-detail' }] } },
        { type: 'answer', text: 'Qual partição falhou?', help: ['responder'], answer: { accept: ['{{bad}}', '/dev/{{bad}}'], normalize: 'text' } },
        { text: 'A partição com falha saiu do RAID.', help: ['mdadm'], auto: 'sudo mdadm /dev/md0 --remove /dev/{{bad}}', check: { not: { state: 'raid.in', arg: '{{bad}}' } } },
        { text: 'O disco reserva (sdc1) entrou e o RAID está se reconstruindo.', help: ['mdadm'], auto: 'sudo mdadm /dev/md0 --add /dev/sdc1', check: { all: [{ state: 'raid.has', arg: 'sdc1' }, { state: 'raid.state', in: ['recovering', 'clean'] }] } },
      ],
    },
    {
      id: 'esp_disco_morrendo', n: 4, rank: 'esp', title: 'Disco morrendo no {{dev.name}}', difficulty: 5, xp: 220, credits: 33,
      skill: 'servidores', roles: ['servidores', 'sysadmin'], bot_minutes: 25, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O RAID do {{dev.name}} ainda está inteiro, mas o monitor de discos avisou que um deles vai falhar. Troque antes que quebre.',
      target: LNX, setup: { linux: 'smartfail' }, vars: { disk: 'smart.bad' },
      steps: [
        { text: 'Pergunte a saúde dos dois discos do RAID (sda e sdb).', help: ['smartctl'], auto: 'sudo smartctl -H /dev/sda\nsudo smartctl -H /dev/sdb', check: { ran: 'smart:{{disk}}' } },
        { type: 'answer', text: 'Qual disco está falhando?', help: ['responder'], answer: { accept: ['{{disk}}', '/dev/{{disk}}'], normalize: 'text' } },
        { text: 'A partição dele ({{disk}}1) saiu do RAID: marque como falha e remova.', help: ['mdadm'], auto: 'sudo mdadm /dev/md0 --fail /dev/{{disk}}1\nsudo mdadm /dev/md0 --remove /dev/{{disk}}1', check: { not: { state: 'raid.in', arg: '{{disk}}1' } } },
        { text: 'O disco reserva (sdc1) entrou no lugar.', help: ['mdadm'], auto: 'sudo mdadm /dev/md0 --add /dev/sdc1', check: { state: 'raid.has', arg: 'sdc1' } },
      ],
    },
    {
      id: 'esp_certificado', n: 5, rank: 'esp', title: 'Certificado vencendo no {{dev.name}}', difficulty: 5, xp: 200, credits: 30,
      skill: 'seguranca', roles: ['sysadmin', 'seguranca'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O certificado HTTPS do site do {{dev.name}} vence em poucos dias. Se vencer, os navegadores dos clientes bloqueiam o site.',
      target: T(LNX, { web: true }), setup: { linux: 'certexp' }, vars: { days: 'cert.days' },
      steps: [
        { text: 'Veja quando o certificado vence.', help: ['certbot', 'openssl-cert'], auto: 'sudo certbot certificates', check: { ran: 'cert-show' } },
        { type: 'answer', text: 'Faltam quantos dias?', help: ['responder'], answer: { accept: ['{{days}}'], normalize: 'int', tol: 1 } },
        { text: 'O certificado foi renovado e o nginx já usa o novo.', help: ['certbot', 'reload'], auto: 'sudo certbot renew\nsudo systemctl reload nginx', check: { state: 'cert.live' } },
        { text: 'O site responde.', help: ['curl'], auto: 'curl localhost', check: { ran: 'curl-ok' } },
      ],
    },
    {
      id: 'esp_nginx_config', n: 6, rank: 'esp', title: 'O nginx não volta depois da mudança · {{dev.name}}', difficulty: 5, xp: 210, credits: 31,
      skill: 'sistemas', roles: ['sysadmin'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Alguém editou a configuração do site do {{dev.name}} e reiniciou. O nginx não subiu mais.',
      target: T(LNX, { web: true }), setup: { linux: 'nginxbroken' },
      steps: [
        { text: 'Teste a configuração do nginx.', help: ['nginx-t'], auto: 'sudo nginx -t', check: { ran: 'nginx-t-fail' } },
        { text: 'A configuração passa no teste (corrija a linha ou volte o .bak).', help: ['sed', 'cp'], auto: "sudo sed -i 's/server_nmae/server_name/' /etc/nginx/sites-enabled/site\nsudo nginx -t", check: { state: 'nginx.conf' } },
        { text: 'O nginx está rodando e o site responde.', help: ['systemctl-restart'], auto: 'sudo systemctl restart nginx\ncurl localhost', check: { all: [{ state: 'service', arg: 'nginx', eq: 'active' }, { ran: 'curl-ok' }] } },
      ],
    },
    {
      id: 'esp_link_lento', n: 7, rank: 'esp', title: 'O {{dev.name}} está lento na rede', difficulty: 5, xp: 220, credits: 33,
      skill: 'redes', roles: ['redes'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'Backups e downloads do {{dev.name}} estão 10 vezes mais lentos desde a última manutenção no {{sw.name}}.',
      target: T(LNX, { directLink: true }), devices: { sw: 'switch.of' }, setup: { fault: 'duplex', on: 'sw' }, vars: { port: 'srv.port' },
      steps: [
        { text: 'Veja velocidade e duplex da placa.', help: ['ethtool'], auto: 'ethtool eth0', check: { ran: 'ethtool' } },
        { text: 'Veja os contadores de erro.', help: ['ip-stats'], auto: 'ip -s link', check: { ran: 'ip-stats' } },
        { device: 'sw', text: 'A porta do {{dev.name}} negocia sozinha de novo (velocidade e duplex automáticos).', help: ['sw-duplex', 'show-int'], auto: 'enable\nshow interfaces status\nconfigure terminal\ninterface {{port}}\nspeed auto\nduplex auto\nend', check: { state: 'sw.duplexOk', arg: '{{port}}' } },
        { device: 'sw', text: 'A configuração está salva.', help: ['copy-run-start'], auto: 'end\ncopy running-config startup-config', check: { ran: 'config-saved' } },
      ],
    },
    {
      id: 'esp_memoria', n: 8, rank: 'esp', title: 'O {{dev.name}} vive no swap', difficulty: 5, xp: 200, credits: 30,
      skill: 'sistemas', roles: ['sysadmin'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O {{dev.name}} está lentíssimo: a memória acabou e ele está usando o disco como memória (swap). Um processo está vazando memória.',
      target: LNX, setup: { linux: 'swapleak' },
      steps: [
        { text: 'Veja a memória e o swap, e quem está usando.', help: ['free', 'ps'], auto: 'free -h\nps aux --sort=-%mem', check: { all: [{ ran: 'cmd:free' }, { any: [{ ran: 'ps' }, { ran: 'top' }] }] } },
        { type: 'answer', text: 'Que programa está vazando memória?', help: ['responder'], answer: { accept: ['java', 'app', 'app.jar'], normalize: 'text' } },
        { text: 'A aplicação foi reiniciada e o swap caiu.', help: ['systemctl-restart'], auto: 'sudo systemctl restart app', check: { state: 'swap', lt: 50 } },
      ],
    },
    {
      id: 'esp_servidor_ia', n: 9, rank: 'esp', title: 'Um servidor de IA', difficulty: 5, xp: 240, credits: 36,
      skill: 'servidores', roles: [], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'steps',
      summary: 'Um cliente quer treinar modelos de IA. Isso pede um servidor com GPU e ar de precisão na sala (ele esquenta muito).',
      target: { kind: 'rack' }, vars: { n: 'devs:srv_gpu', ai: 'svc.ok:ai' },
      steps: [
        { text: 'Instale um Servidor GPU (IA) num rack.', action: 'build', check: { state: 'devs', arg: 'srv_gpu', gt: '{{n}}' } },
        { text: 'A sala tem ar de precisão.', action: 'build', check: { state: 'items', arg: 'crac', gt: 0 } },
        { text: 'Um servidor online é IA e tem tudo o que ela pede (Infra → Servidores).', check: { state: 'svc.ok', arg: 'ai', gt: '{{ai}}' } },
      ],
    },
    {
      id: 'esp_gpu_quente', n: 10, rank: 'esp', title: 'GPU a 91 °C no {{dev.name}}', difficulty: 5, xp: 220, credits: 33,
      skill: 'servidores', roles: ['servidores'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'A GPU do {{dev.name}} está perto do limite de temperatura. Se passar, ela reduz o desempenho sozinha ou desliga.',
      target: { kind: 'server', state: 'online', healthy: true, gpu: true, os: 'linux' }, setup: { linux: 'gpuhot' },
      steps: [
        { text: 'Veja a temperatura e o consumo da GPU.', help: ['nvidia-smi'], auto: 'nvidia-smi', check: { ran: 'nvidia-smi' } },
        { text: 'A GPU fica abaixo de 80 °C (limite a potência).', help: ['nvidia-smi'], auto: 'sudo nvidia-smi -pl 250', check: { state: 'gpu.temp', lt: 80 } },
      ],
    },
    {
      id: 'esp_banco_conexoes', n: 11, rank: 'esp', title: 'O banco recusa conexões · {{dev.name}}', difficulty: 5, xp: 220, credits: 33,
      skill: 'sistemas', roles: ['sysadmin'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Os pedidos falham com "too many clients". A aplicação abre conexões com o banco do {{dev.name}} e não fecha.',
      target: LNX, setup: { linux: 'dbconns' }, vars: { n: 'db.conns' },
      steps: [
        { text: 'Veja o erro no log da aplicação.', help: ['journalctl-u'], auto: 'journalctl -u app --since "1 hour ago"', check: { ran: 'journal:app' } },
        { text: 'Conte as conexões abertas no banco.', help: ['psql'], auto: 'sudo -u postgres psql -c "select count(*) from pg_stat_activity;"', check: { ran: 'db-conns' } },
        { type: 'answer', text: 'Quantas conexões estão abertas?', help: ['responder'], answer: { accept: ['{{n}}'], normalize: 'int' } },
        { text: 'A aplicação foi reiniciada e as conexões caíram.', help: ['systemctl-restart'], auto: 'sudo systemctl restart app', check: { state: 'db.conns', lt: 50 } },
      ],
    },
    {
      id: 'esp_pg_dump', n: 12, rank: 'esp', title: 'Backup do banco antes da migração · {{dev.name}}', difficulty: 5, xp: 200, credits: 30,
      skill: 'servidores', roles: ['sysadmin'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Amanhã o banco do {{dev.name}} muda de versão. Antes, exporte o banco app inteiro para /backup/app.sql.',
      target: LNX, setup: { linux: 'dbready' },
      steps: [
        { text: 'Veja o que já existe em /backup.', help: ['ls-l'], auto: 'ls -l /backup', check: { ran: 'ls:/backup' } },
        { text: 'O banco app está exportado em /backup/app.sql.', help: ['pg-dump'], auto: 'sudo -u postgres pg_dump app > /backup/app.sql', check: { state: 'backup.of', arg: 'db:app' } },
      ],
    },
    {
      id: 'esp_restaurar', n: 13, rank: 'esp', title: 'Apagaram a configuração da aplicação · {{dev.name}}', difficulty: 5, xp: 200, credits: 30,
      skill: 'servidores', roles: ['sysadmin'], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Uma limpeza apagou o /etc/app/config.env do {{dev.name}} e a aplicação não sobe. O backup de ontem do /etc tem o arquivo.',
      target: LNX, setup: { linux: 'filedel' },
      steps: [
        { text: 'Veja por que a aplicação não sobe.', help: ['journalctl-u'], auto: 'sudo systemctl start app\njournalctl -u app', check: { ran: 'journal:app' } },
        { text: 'Ache o backup do /etc.', help: ['ls-l'], auto: 'ls -l /backup', check: { ran: 'ls:/backup' } },
        { text: 'O /etc/app/config.env voltou, com as permissões de antes.', help: ['tar-x'], auto: 'sudo tar xzf /backup/etc-ontem.tar.gz -C /', check: { all: [{ state: 'file.exists', arg: '/etc/app/config.env' }, { state: 'file.mode', arg: '/etc/app/config.env', eq: '640' }] } },
        { text: 'A aplicação está rodando.', help: ['systemctl-start'], auto: 'sudo systemctl start app', check: { state: 'service', arg: 'app', eq: 'active' } },
      ],
    },
    {
      id: 'esp_porta_8080', n: 14, rank: 'esp', title: 'Quem abriu a porta 8080 no {{dev.name}}?', difficulty: 5, xp: 200, credits: 30,
      skill: 'seguranca', roles: ['seguranca', 'sysadmin'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Uma varredura achou a porta 8080 aberta no {{dev.name}}, servindo arquivos para a rede. Isso não estava no padrão.',
      target: LNX, setup: { linux: 'rogue' }, vars: { who: 'rogue.user' },
      steps: [
        { text: 'Veja qual processo escuta na 8080.', help: ['ss'], auto: 'sudo ss -tlnp', check: { ran: 'ss-procs' } },
        { text: 'Veja quem é o dono do processo.', help: ['ps'], auto: 'ps aux', check: { ran: 'ps' } },
        { type: 'answer', text: 'Qual usuário deixou esse servidor de arquivos aberto?', help: ['responder'], answer: { accept: ['{{who}}'], normalize: 'text' } },
        { text: 'Nada mais escuta na 8080.', help: ['kill'], auto: 'sudo kill 5150', check: { state: 'proc.count', arg: 'http.server', eq: 0 } },
      ],
    },
    {
      id: 'esp_relogio', n: 15, rank: 'esp', title: 'O relógio do {{dev.name}} está errado', difficulty: 4, xp: 180, credits: 27,
      skill: 'sistemas', roles: ['sysadmin'], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Os logs do {{dev.name}} estão com horário adiantado e os certificados dão erro de validade. O relógio parou de sincronizar.',
      target: LNX, setup: { linux: 'clock' },
      steps: [
        { text: 'Veja a hora e a sincronização.', help: ['timedatectl'], auto: 'timedatectl', check: { ran: 'timedatectl' } },
        { text: 'O relógio está sincronizado pela rede (NTP).', help: ['timedatectl'], auto: 'sudo timedatectl set-ntp true', check: { state: 'ntp.on' } },
      ],
    },
    {
      id: 'esp_erro_app', n: 16, rank: 'esp', title: 'Erro da aplicação · {{dev.name}}', difficulty: 4, xp: 200, credits: 30,
      skill: 'sistemas', roles: ['sysadmin', 'atendente'], bot_minutes: 10, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Um cliente reclamou que um pedido falhou há meia hora. O suporte precisa do código do erro para abrir o chamado.',
      handoff: 'o código vai no chamado para os desenvolvedores',
      target: LNX, setup: { linux: 'apperr' }, vars: { code: 'app.code' },
      steps: [
        { text: 'Veja o log da aplicação na última hora.', help: ['journalctl-u'], auto: 'journalctl -u app --since "1 hour ago"', check: { ran: 'journal:app' } },
        { type: 'answer', text: 'Qual é o código do erro?', help: ['responder'], answer: { accept: ['{{code}}'], normalize: 'text' } },
      ],
    },
    {
      id: 'esp_traceroute', n: 17, rank: 'esp', title: 'A internet some no meio do caminho · {{dev.name}}', difficulty: 5, xp: 210, credits: 31,
      skill: 'redes', roles: ['redes'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Clientes reclamam de lentidão e quedas para fora do datacenter. Descubra se o problema é aqui dentro ou na operadora.',
      handoff: 'o chamado vai para a operadora, com o salto onde os pacotes param',
      target: LNX, setup: { linux: 'hopfail' }, vars: { hop: 'trace.last' },
      steps: [
        { text: 'Siga o caminho dos pacotes até a internet.', help: ['traceroute'], auto: 'traceroute 8.8.8.8', check: { ran: 'traceroute' } },
        { type: 'answer', text: 'Qual é o último salto que responde (o IP)?', help: ['responder'], answer: { accept: ['{{hop}}'], normalize: 'ip' } },
        { type: 'answer', text: 'O problema é aqui dentro ou na operadora?', help: ['responder'], answer: { accept: ['operadora', 'na operadora', 'fora'], normalize: 'text' } },
      ],
    },
    {
      id: 'esp_corrente', n: 18, rank: 'esp', title: 'Corrente de falhas: os pedidos param', difficulty: 5, xp: 260, credits: 39,
      skill: 'sistemas', roles: ['sysadmin'], bot_minutes: 30, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'A aplicação do {{dev.name}} está dando timeout ao gravar pedidos. Reiniciar a aplicação não adianta: a causa está em outro servidor.',
      target: LNX, devices: { peer: 'server.peer' }, setup: { linux: 'apperr', fault: 'disk', on: 'peer', quiet: true },
      steps: [
        { text: 'No {{dev.name}}, veja o log da aplicação.', help: ['journalctl-u'], auto: 'journalctl -u app --since "1 hour ago"', check: { ran: 'journal:app' } },
        { type: 'answer', text: 'O banco que dá timeout está em qual servidor? (o log diz o IP; o Monitor diz o nome)', help: ['responder'], answer: { accept: ['{{peer.name}}', '{{peer.ip}}'], normalize: 'text' } },
        { device: 'peer', text: 'No {{peer.name}}: ache a causa raiz e resolva.', help: ['df', 'journalctl-vacuum'], auto: 'df -h\nsudo journalctl --vacuum-size=200M', check: { state: 'disk', lt: 80 } },
        { text: 'No {{dev.name}}, reinicie a aplicação.', help: ['systemctl-restart'], auto: 'sudo systemctl restart app', check: { ran: 'svc-restart:app' } },
      ],
    },
    {
      id: 'esp_carga_cron', n: 19, rank: 'esp', title: 'Carga alta toda hora no {{dev.name}}', difficulty: 5, xp: 220, credits: 33,
      skill: 'sistemas', roles: ['sysadmin'], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Desde ontem o {{dev.name}} vive com a carga alta, cheio de processos gzip. A compactação de logs devia rodar uma vez por hora.',
      target: LNX, setup: { linux: 'cronstorm' },
      steps: [
        { text: 'Veja a carga e quem está consumindo.', help: ['top'], auto: 'top', check: { any: [{ ran: 'top' }, { ran: 'ps' }] } },
        { text: 'Veja o agendamento.', help: ['crontab'], auto: 'crontab -l', check: { ran: 'cron-list' } },
        { text: 'A compactação roda só no minuto 0 de cada hora.', help: ['crontab'], auto: 'echo "0 * * * * /usr/local/bin/compacta-logs.sh" | crontab -', check: { state: 'cron.at', arg: 'compacta-logs.sh', eq: '0 *' } },
        { text: 'Os gzip acumulados foram encerrados.', help: ['kill'], auto: 'sudo pkill gzip', check: { state: 'proc.count', arg: 'gzip', eq: 0 } },
      ],
    },
    {
      id: 'esp_dns_quebrado', n: 20, rank: 'esp', title: 'O {{dev.name}} não acha nenhum nome', difficulty: 4, xp: 190, credits: 28,
      skill: 'redes', roles: ['redes', 'sysadmin'], bot_minutes: 12, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Ping para IP funciona, mas para qualquer nome dá erro. Alguém trocou o DNS do {{dev.name}} por um servidor que não existe mais.',
      target: LNX, setup: { linux: 'resolvbad' },
      steps: [
        { text: 'Teste um nome.', help: ['ping'], auto: 'ping -c 1 google.com', check: { any: [{ ran: 'ping-dnsfail' }, { ran: 'dns-ok' }] } },
        { text: 'Veja qual DNS o servidor consulta.', help: ['cat'], auto: 'cat /etc/resolv.conf', check: { ran: 'cat:/etc/resolv.conf' } },
        { text: 'O DNS volta a ser o resolvedor local (127.0.0.53).', help: ['sed'], auto: "sudo sed -i 's/10.0.1.250/127.0.0.53/' /etc/resolv.conf", check: { any: [{ state: 'file.has', arg: '/etc/resolv.conf|nameserver 127.0.0.53' }, { state: 'file.has', arg: '/etc/resolv.conf|nameserver 8.8.8.8' }, { state: 'file.has', arg: '/etc/resolv.conf|nameserver 1.1.1.1' }] } },
        { text: 'Os nomes resolvem.', help: ['ping'], auto: 'ping -c 1 google.com', check: { ran: 'dns-ok' } },
      ],
    },

    /* ---------------- Tech Lead: incidentes grandes, mudanças sem parar o serviço, decisões ---------------- */
    {
      id: 'lead_postmortem', n: 1, rank: 'lead', title: 'Post-mortem do incidente da madrugada · {{dev.name}}', difficulty: 5, xp: 240, credits: 36,
      skill: 'gestao', roles: [], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O site do {{dev.name}} ficou fora 45 minutos esta madrugada. A diretoria quer o relatório: o que caiu, por quê e o que resolveu. O syslog guarda tudo.',
      target: LNX, setup: { linux: 'incident' },
      steps: [
        { text: 'Leia o syslog da madrugada.', help: ['grep', 'tail'], auto: 'grep -i "nginx\\|space\\|sudo" /var/log/syslog\ntail -n 20 /var/log/syslog', check: { any: [{ ran: 'grep-hit:/var/log/syslog' }, { ran: 'tail:/var/log/syslog' }, { ran: 'cat:/var/log/syslog' }] } },
        { type: 'answer', text: 'Qual serviço caiu?', help: ['responder'], answer: { accept: ['nginx'], normalize: 'text' } },
        { type: 'answer', text: 'Qual foi a causa raiz?', help: ['responder'], answer: { accept: ['disco', 'disco cheio', 'espaco em disco', 'falta de espaco', 'no space left on device'], normalize: 'text' } },
        { type: 'answer', text: 'Qual comando liberou o espaço?', help: ['responder'], answer: { accept: ['journalctl', 'journalctl --vacuum-size=200m', 'sudo journalctl --vacuum-size=200m', 'vacuum'], normalize: 'text' } },
      ],
    },
    {
      id: 'lead_janela', n: 2, rank: 'lead', title: 'Janela de manutenção no {{dev.name}}', difficulty: 5, xp: 260, credits: 39,
      skill: 'sistemas', roles: [], bot_minutes: 30, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O {{dev.name}} precisa das correções de segurança. O {{peer.name}} atende o mesmo site: confira que ele segura o tráfego antes de mexer no {{dev.name}}.',
      target: T(LNX, { web: true }), devices: { peer: 'server.peer' }, setup: { linux: 'updates' },
      steps: [
        { device: 'peer', text: 'O {{peer.name}} está servindo o site.', help: ['curl'], auto: 'curl localhost', check: { all: [{ state: 'ok.web' }, { ran: 'curl-ok' }] } },
        { text: 'O {{dev.name}} está com os pacotes atualizados.', help: ['apt-update', 'apt-upgrade'], auto: 'sudo apt update\nsudo apt upgrade -y', check: { state: 'apt.pending', eq: 0 } },
        { text: 'O {{dev.name}} roda o nginx novo e responde.', help: ['systemctl-restart'], auto: 'sudo systemctl restart nginx\ncurl localhost', check: { all: [{ state: 'nginx.fresh' }, { state: 'ok.web' }, { ran: 'curl-ok' }] } },
      ],
    },
    {
      id: 'lead_failover', n: 3, rank: 'lead', title: 'Failover: o site muda de servidor', difficulty: 5, xp: 280, credits: 42,
      skill: 'redes', roles: [], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O site atende no IP virtual 10.0.1.250, que mora no {{dev.name}}. O {{dev.name}} caiu. Passe o IP para o reserva, {{peer.name}}, e confirme de outro servidor.',
      handoff: 'o servidor principal fica com a equipe',
      target: T(LNX, { web: true }), devices: { peer: 'server.peer', alt: 'server.peer' }, setup: { linux: 'vip', fault: 'link', quiet: true },
      steps: [
        { device: 'alt', text: 'Do {{alt.name}}, confirme que o 10.0.1.250 não responde.', help: ['ping'], auto: 'ping -c 3 10.0.1.250', check: { any: [{ ran: 'ping-fail' }, { at: 'peer', state: 'eth0.has', arg: '10.0.1.250' }] } },
        { device: 'peer', text: 'O {{peer.name}} assume o IP 10.0.1.250.', help: ['ip-addr-add'], auto: 'sudo ip addr add 10.0.1.250/24 dev eth0', check: { state: 'eth0.has', arg: '10.0.1.250' } },
        { device: 'alt', text: 'Do {{alt.name}}, o 10.0.1.250 responde de novo.', help: ['ping'], auto: 'ping -c 3 10.0.1.250', check: { ran: 'ping-ok:10.0.1.250' } },
      ],
    },
    {
      id: 'lead_dr', n: 4, rank: 'lead', title: 'Teste de recuperação de desastre · {{dev.name}}', difficulty: 5, xp: 300, credits: 45,
      skill: 'servidores', roles: [], bot_minutes: 30, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Backup que nunca foi restaurado não é backup. O dump do banco já está no servidor reserva {{dev.name}}: restaure e prove que os pedidos estão lá.',
      target: LNX, setup: { linux: 'drready' },
      steps: [
        { text: 'Ache o dump em /backup.', help: ['ls-l'], auto: 'ls -l /backup', check: { ran: 'ls:/backup' } },
        { text: 'O banco app foi restaurado a partir do dump.', help: ['pg-dump'], auto: 'sudo -u postgres psql app < /backup/app.sql', check: { state: 'db.restored' } },
        { text: 'Conte os pedidos no banco restaurado.', help: ['psql'], auto: 'sudo -u postgres psql -c "select count(*) from pedidos;"', check: { ran: 'db-rows' } },
        { type: 'answer', text: 'Quantos pedidos voltaram?', help: ['responder'], answer: { accept: ['48213'], normalize: 'int' } },
      ],
    },
    {
      id: 'lead_all_flash', n: 5, rank: 'lead', title: 'Storage all-flash para os dados quentes', difficulty: 5, xp: 240, credits: 36,
      skill: 'servidores', roles: [], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'steps',
      summary: 'Os bancos mais acessados esperam o disco. Uma storage all-flash responde em microssegundos: é o investimento do trimestre.',
      target: { kind: 'rack' }, vars: { n: 'items:st_flash' },
      steps: [
        { text: 'Instale uma Storage all-flash (Construir → Equipamentos → Storage).', action: 'build', check: { state: 'items', arg: 'st_flash', gt: '{{n}}' } },
      ],
    },
    {
      id: 'lead_auditoria_sudo', n: 6, rank: 'lead', title: 'Quem tem sudo no {{dev.name}}?', difficulty: 5, xp: 240, credits: 36,
      skill: 'seguranca', roles: [], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Revisão anual de acessos: só quem administra o {{dev.name}} pode ter sudo. Ache quem sobrou e tire.',
      target: LNX, setup: { linux: 'sudoextra' },
      steps: [
        { text: 'Veja quem está no grupo sudo.', help: ['grep', 'id'], auto: 'id estagio\nid admin', check: { ran: 'id:estagio' } },
        { type: 'answer', text: 'Qual conta, além do admin, tem sudo?', help: ['responder'], answer: { accept: ['estagio'], normalize: 'text' } },
        { text: 'Essa conta não tem mais sudo.', help: ['gpasswd'], auto: 'sudo gpasswd -d estagio sudo', check: { not: { state: 'user.in', arg: 'estagio:sudo' } } },
      ],
    },
    {
      id: 'lead_quatro_alertas', n: 7, rank: 'lead', title: 'Quatro alertas e uma pessoa', difficulty: 5, xp: 280, credits: 42,
      skill: 'gestao', roles: [], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Quatro servidores alertaram ao mesmo tempo. O {{dev.name}} tem o site do maior cliente: esse é com você. Os outros três vão para a equipe.',
      handoff: 'os outros três alertas ficam com a equipe',
      target: T(LNX, { web: true }), devices: { peer: 'server.peer', alt: 'server.peer', third: 'server.peer' },
      setup: { faults: [{ fault: 'service', on: 'dev' }, { fault: 'disk', on: 'peer' }, { fault: 'link', on: 'alt' }, { fault: 'service', on: 'third' }] }, vars: { o: 'orders' },
      steps: [
        { text: 'O site do {{dev.name}} responde.', help: ['systemctl-restart'], auto: 'sudo systemctl restart nginx\ncurl localhost', check: { all: [{ state: 'ok.web' }, { ran: 'curl-ok' }] } },
        { device: 'any', text: 'Os outros três estão com a equipe: três ordens (Equipe → Atribuir tarefa).', check: { state: 'ordersSince', arg: '{{o}}', gt: 2 } },
      ],
    },
    {
      id: 'lead_ransomware', n: 8, rank: 'lead', title: 'Contenção de ransomware · {{dev.name}}', difficulty: 5, xp: 300, credits: 45,
      skill: 'seguranca', roles: [], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Os arquivos do Financeiro estão virando .locked. Uma conta do domínio está criptografando tudo pela rede. Contenha antes que se espalhe.',
      handoff: 'a restauração pelo backup fica com a equipe',
      target: DC, setup: { win: 'ransom' }, vars: { who: 'win.ransomUser' },
      steps: [
        { text: 'Veja no log Security quem está mexendo nos arquivos.', help: ['win-event'], auto: 'Get-WinEvent -LogName Security -MaxEvents 8', check: { ran: 'win-events:security' } },
        { type: 'answer', text: 'Qual conta está criptografando?', help: ['responder'], answer: { accept: ['{{who}}'], normalize: 'text' } },
        { text: 'A conta não entra mais.', help: ['win-disable'], auto: 'Disable-ADAccount -Identity {{who}}', check: { state: 'win.user', arg: '{{who}}', eq: 'disabled' } },
        { text: 'O compartilhamento Financeiro saiu da rede (até a limpeza).', help: ['win-share'], auto: 'Remove-SmbShare -Name Financeiro', check: { not: { state: 'win.share', arg: 'Financeiro' } } },
      ],
    },
    {
      id: 'lead_ddos', n: 9, rank: 'lead', title: 'Enxurrada de conexões no {{dev.name}}', difficulty: 5, xp: 260, credits: 39,
      skill: 'seguranca', roles: [], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O site do {{dev.name}} está lento: centenas de conexões vindas da mesma rede. Bloqueie a rede inteira sem derrubar o SSH nem o site para os outros.',
      target: T(LNX, { web: true }), setup: { linux: ['ddos', 'fwoff'] },
      steps: [
        { text: 'Veja as conexões abertas.', help: ['ss-conn'], auto: 'ss -tn', check: { ran: 'ss-conn' } },
        { type: 'answer', text: 'De qual rede (/24) vem o ataque?', help: ['responder'], answer: { accept: ['203.0.113.0/24', '203.0.113.0', '203.0.113'], normalize: 'text' } },
        { text: 'O firewall está ligado, bloqueia 203.0.113.0/24 e deixa entrar o SSH e o site.', help: ['ufw-deny', 'ufw-allow', 'ufw-enable'], auto: 'sudo ufw deny from 203.0.113.0/24\nsudo ufw allow 22\nsudo ufw allow 80\nsudo ufw enable', check: { all: [{ state: 'fw.denies', arg: '203.0.113.0' }, { state: 'fw.allows', arg: '22' }, { state: 'fw.allows', arg: '80' }] } },
      ],
    },
    {
      id: 'lead_switch_core', n: 10, rank: 'lead', title: 'Troca do switch core: {{dev.name}} → {{sw.name}}', difficulty: 5, xp: 300, credits: 45,
      skill: 'redes', roles: [], bot_minutes: 30, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O {{dev.name}} vai ser substituído pelo {{sw.name}}. Antes da troca, o novo precisa ter as mesmas VLANs e a porta {{b}} pronta como trunk.',
      target: T(MSW, { linked: true }), devices: { sw: 'switch.other' }, setup: { swcore: true }, vars: { b: 'sw.free:0@sw' },
      steps: [
        { text: 'Veja as VLANs do {{dev.name}}.', help: ['show-vlan'], auto: 'enable\nshow vlan brief', check: { ran: 'show-vlan' } },
        { device: 'sw', text: 'O {{sw.name}} tem as mesmas VLANs, com os mesmos nomes (20 SERVIDORES e 30 CAMERAS).', help: ['sw-vlan'], auto: 'enable\nconfigure terminal\nvlan 20\nname SERVIDORES\nvlan 30\nname CAMERAS\nend', check: { all: [{ state: 'sw.vlan', arg: '20', eq: 'SERVIDORES' }, { state: 'sw.vlan', arg: '30', eq: 'CAMERAS' }] } },
        { device: 'sw', text: 'A {{b}} do {{sw.name}} é trunk e leva 10, 20 e 30.', help: ['sw-trunk'], auto: 'configure terminal\ninterface {{b}}\nswitchport mode trunk\nswitchport trunk allowed vlan 10,20,30\nend', check: { all: [{ state: 'sw.trunkHas', arg: '{{b}}:10' }, { state: 'sw.trunkHas', arg: '{{b}}:20' }, { state: 'sw.trunkHas', arg: '{{b}}:30' }] } },
        { device: 'sw', text: 'A configuração do {{sw.name}} está salva.', help: ['copy-run-start'], auto: 'end\ncopy running-config startup-config', check: { state: 'sw.saved' } },
      ],
    },
    {
      id: 'lead_auditoria_15', n: 11, rank: 'lead', title: 'Auditoria dos 15 servidores', difficulty: 4, xp: 220, credits: 33,
      skill: 'gestao', roles: [], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson', when: 'fifteen',
      summary: 'A diretoria quer o número de servidores respondendo agora, conferido da rede.',
      target: LNX, vars: { n: 'up.count' },
      steps: [
        { text: 'Faça a varredura com ping.', help: ['ping'], auto: 'ping -c 3 {{gw}}', check: { ran: 'cmd:ping' } },
        { type: 'answer', text: 'Quantos servidores estão respondendo?', help: ['responder'], answer: { accept: ['{{n}}'], normalize: 'int', tol: 1 } },
      ],
    },
    {
      id: 'lead_queda_energia', n: 12, rank: 'lead', title: 'Queda de energia: o nobreak segura', difficulty: 5, xp: 280, credits: 42,
      skill: 'servidores', roles: [], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Caiu a energia do bairro e o datacenter está na bateria do nobreak. Descubra quanto tempo resta e desligue o que não é crítico.',
      target: LNX, setup: { linux: 'ups', vms: 'teste' }, vars: { min: 'ups.min' },
      steps: [
        { text: 'Veja o estado do nobreak.', help: ['upsc'], auto: 'upsc ups', check: { ran: 'upsc' } },
        { type: 'answer', text: 'Quantos minutos de bateria restam?', help: ['responder'], answer: { accept: ['{{min}}'], normalize: 'int', tol: 1 } },
        { device: 'any', text: 'As VMs de teste (teste-1 e teste-2) estão desligadas (Infra → VMs).', check: { state: 'vmsNamed', arg: 'teste:running', eq: 0 } },
      ],
    },
    {
      id: 'lead_ar_parou', n: 13, rank: 'lead', title: 'O ar-condicionado parou', difficulty: 5, xp: 260, credits: 39,
      skill: 'servidores', roles: [], bot_minutes: 20, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O ar de precisão parou e a sala esquenta. O técnico chega em 40 minutos. Ache o servidor mais quente entre {{dev.name}}, {{peer.name}} e {{alt.name}} e alivie a carga dele.',
      target: LNX, devices: { peer: 'server.peer', alt: 'server.peer' }, setup: { hotOn: ['dev', 'peer', 'alt'] }, vars: { top: 'max:cpu.temp', role: 'maxRole:cpu.temp' },
      steps: [
        { text: 'Temperatura do {{dev.name}}.', help: ['sensors'], auto: 'sensors', check: { ran: 'sensors' } },
        { device: 'peer', text: 'Do {{peer.name}}.', help: ['sensors'], auto: 'sensors', check: { ran: 'sensors' } },
        { device: 'alt', text: 'Do {{alt.name}}.', help: ['sensors'], auto: 'sensors', check: { ran: 'sensors' } },
        { device: 'any', type: 'answer', text: 'Qual está mais quente?', help: ['responder'], answer: { accept: ['{{top}}'], normalize: 'text' } },
        { device: 'any', text: 'No mais quente, pare o serviço de relatórios (app) até o ar voltar.', help: ['systemctl-restart'], auto: 'sudo systemctl stop app', check: { at: '{{role}}', state: 'cpu.temp', lt: 80 } },
      ],
    },
    {
      id: 'lead_contratacoes', n: 14, rank: 'lead', title: 'Três engenheiros novos', difficulty: 5, xp: 260, credits: 39,
      skill: 'sistemas', roles: [], bot_minutes: 30, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Lia, Davi e Beto entram na Engenharia. Eles precisam de conta no domínio ({{dev.name}}) e no servidor Linux {{peer.name}}, no grupo deploy.',
      target: T(DC, { noOu: 'Engenharia' }), devices: { peer: 'server.peer' }, setup: { linuxOn: 'peer', linuxOn2: 'nouser' }, vars: { dn: 'win.dn' },
      steps: [
        { text: 'Existe a OU Engenharia.', help: ['win-ou'], auto: 'New-ADOrganizationalUnit -Name Engenharia', check: { state: 'win.ou', arg: 'Engenharia' } },
        { text: 'As três contas estão na OU Engenharia, habilitadas.', help: ['win-newuser'], auto: 'New-ADUser -Name "Lia Ramos" -SamAccountName lia.ramos -Path "OU=Engenharia,{{dn}}" -AccountPassword ' + PW + ' -Enabled $true\nNew-ADUser -Name "Davi Melo" -SamAccountName davi.melo -Path "OU=Engenharia,{{dn}}" -AccountPassword ' + PW + ' -Enabled $true\nNew-ADUser -Name "Beto Reis" -SamAccountName beto.reis -Path "OU=Engenharia,{{dn}}" -AccountPassword ' + PW + ' -Enabled $true', check: { state: 'win.usersIn', arg: 'Engenharia', gt: 2 } },
        { device: 'peer', text: 'No {{peer.name}}, as contas lia, davi e beto existem e estão no grupo deploy.', help: ['useradd'], auto: 'sudo useradd -m -s /bin/bash -G deploy lia\nsudo useradd -m -s /bin/bash -G deploy davi\nsudo useradd -m -s /bin/bash -G deploy beto', check: { all: [{ state: 'user.in', arg: 'lia:deploy' }, { state: 'user.in', arg: 'davi:deploy' }, { state: 'user.in', arg: 'beto:deploy' }] } },
      ],
    },
    {
      id: 'lead_cortar_custo', n: 15, rank: 'lead', title: 'Cortar custo: VMs esquecidas', difficulty: 4, xp: 240, credits: 36,
      skill: 'gestao', roles: [], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'steps',
      summary: 'Três VMs antigas (antigo-1, antigo-2 e antigo-3) estão paradas há semanas, ocupando disco dos nós. O projeto acabou: libere o espaço.',
      target: { kind: 'rack' }, setup: { vms: 'antigo' },
      steps: [
        { text: 'As VMs antigo-1, antigo-2 e antigo-3 foram removidas (Infra → VMs).', check: { state: 'vmsNamed', arg: 'antigo:', eq: 0 } },
      ],
    },
    {
      id: 'lead_certificados', n: 16, rank: 'lead', title: 'Certificados de todos os sites', difficulty: 5, xp: 260, credits: 39,
      skill: 'seguranca', roles: [], bot_minutes: 30, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'A renovação automática falhou em três servidores web: {{dev.name}}, {{peer.name}} e {{alt.name}}. Os certificados vencem esta semana.',
      target: T(LNX, { web: true }), devices: { peer: 'server.peer', alt: 'server.peer' }, setup: { linux: 'certexp', linuxOn: ['peer', 'alt'] },
      steps: [
        { text: '{{dev.name}}: certificado renovado e carregado.', help: ['certbot', 'reload'], auto: 'sudo certbot renew\nsudo systemctl reload nginx', check: { state: 'cert.live' } },
        { device: 'peer', text: '{{peer.name}}: o mesmo.', help: ['certbot', 'reload'], auto: 'sudo certbot renew\nsudo systemctl reload nginx', check: { state: 'cert.live' } },
        { device: 'alt', text: '{{alt.name}}: o mesmo.', help: ['certbot', 'reload'], auto: 'sudo certbot renew\nsudo systemctl reload nginx', check: { state: 'cert.live' } },
      ],
    },
    {
      id: 'lead_rolling', n: 17, rank: 'lead', title: 'Atualizar os dois sem parar o site', difficulty: 5, xp: 300, credits: 45,
      skill: 'sistemas', roles: [], bot_minutes: 30, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'O {{dev.name}} e o {{peer.name}} servem o mesmo site e os dois precisam de atualização. Um de cada vez: sempre um no ar.',
      target: T(LNX, { web: true }), devices: { peer: 'server.peer' }, setup: { linux: 'updates', linuxOn: 'peer' },
      steps: [
        { text: 'O {{dev.name}} atualizado e com o nginx novo, enquanto o {{peer.name}} segura o site.', help: ['apt-upgrade'], auto: 'sudo apt update\nsudo apt upgrade -y\nsudo systemctl restart nginx', check: { all: [{ state: 'apt.pending', eq: 0 }, { state: 'nginx.fresh' }, { at: 'peer', state: 'ok.web' }] } },
        { device: 'peer', text: 'Agora o {{peer.name}}, com o {{dev.name}} segurando o site.', help: ['apt-upgrade'], auto: 'sudo apt update\nsudo apt upgrade -y\nsudo systemctl restart nginx', check: { all: [{ state: 'apt.pending', eq: 0 }, { state: 'nginx.fresh' }, { at: 'dev', state: 'ok.web' }] } },
        { device: 'peer', text: 'Os dois respondem.', help: ['curl'], auto: 'curl localhost', check: { all: [{ state: 'ok.web' }, { at: 'dev', state: 'ok.web' }, { ran: 'curl-ok' }] } },
      ],
    },
    {
      id: 'lead_321', n: 18, rank: 'lead', title: 'Backup 3-2-1 do {{dev.name}}', difficulty: 5, xp: 240, credits: 36,
      skill: 'servidores', roles: [], bot_minutes: 25, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'A regra 3-2-1: três cópias, em dois meios diferentes, uma fora do prédio. Monte isso para o /etc e o site do {{dev.name}}.',
      target: T(LNX, { web: true }), devices: { peer: 'server.peer' }, setup: { linux: 'nobackup' },
      steps: [
        { text: 'Cópia 1, no próprio servidor: /backup/etc.tar.gz.', help: ['tar'], auto: 'sudo tar czf /backup/etc.tar.gz /etc', check: { state: 'backup.of', arg: '/etc' } },
        { text: 'Cópia 2, em outro servidor: o /var/www no {{peer.name}}.', help: ['rsync'], auto: 'rsync -a /var/www/ backup@{{peer.ip}}:/srv/backup/www/', check: { ran: 'rsync-ok:{{peer.ip}}' } },
        { device: 'any', text: 'Cópia 3, fora do prédio: o datacenter tem biblioteca de fitas.', action: 'build', check: { state: 'items', arg: 'tapelib', gt: 0 } },
      ],
    },
    {
      id: 'lead_ssh', n: 19, rank: 'lead', title: 'Endurecer o SSH do {{dev.name}}', difficulty: 5, xp: 260, credits: 39,
      skill: 'seguranca', roles: [], bot_minutes: 15, weight: 1, trigger: 'random', complete: 'lesson',
      summary: 'Uma auditoria achou o {{dev.name}} aceitando login de root e por senha pelo SSH. O padrão é: root nunca entra, e só com chave.',
      target: LNX, setup: { linux: 'sshroot' },
      steps: [
        { text: 'Veja a configuração do SSH.', help: ['grep', 'cat'], auto: 'grep -i "permitroot\\|passwordauth" /etc/ssh/sshd_config\ncat /etc/ssh/sshd_config', check: { any: [{ ran: 'grep-hit:/etc/ssh/sshd_config' }, { ran: 'cat:/etc/ssh/sshd_config' }] } },
        { text: 'PermitRootLogin no e PasswordAuthentication no.', help: ['sed'], auto: "sudo sed -i 's/PermitRootLogin yes/PermitRootLogin no/' /etc/ssh/sshd_config\nsudo sed -i 's/PasswordAuthentication yes/PasswordAuthentication no/' /etc/ssh/sshd_config", check: { all: [{ state: 'file.has', arg: '/etc/ssh/sshd_config|PermitRootLogin no' }, { state: 'file.has', arg: '/etc/ssh/sshd_config|PasswordAuthentication no' }] } },
        { text: 'O SSH foi reiniciado com a configuração nova.', help: ['systemctl-restart'], auto: 'sudo systemctl restart ssh', check: { all: [{ ran: 'svc-restart:ssh' }, { state: 'service', arg: 'ssh', eq: 'active' }] } },
      ],
    },
    {
      id: 'lead_crise', n: 20, rank: 'lead', title: 'Crise no datacenter', difficulty: 5, xp: 320, credits: 48,
      skill: 'gestao', roles: [], bot_minutes: 40, weight: 1, trigger: 'random', complete: 'lesson', bot: 'fix',
      summary: 'Tudo de uma vez: o DNS do domínio ({{dc.name}}) parou, o site do {{peer.name}} caiu e o {{dev.name}} sumiu da rede. Coordene a volta, na ordem que fizer sentido.',
      target: T(LNX, { directLink: true }), devices: { dc: 'win.dc', peer: 'server.peer', sw: 'switch.of' },
      setup: { faults: [{ fault: 'winsvc', on: 'dc', opts: { svc: 'DNS' } }, { fault: 'disksvc', on: 'peer' }, { fault: 'port', on: 'sw' }] }, vars: { port: 'srv.port' },
      steps: [
        { device: 'dc', text: 'O DNS do domínio está de volta.', help: ['win-service', 'win-start'], auto: 'Get-Service DNS\nStart-Service DNS', check: { state: 'win.svc', arg: 'DNS', eq: 'Running' } },
        { device: 'peer', text: 'O site do {{peer.name}} responde.', help: ['df', 'systemctl-restart'], auto: 'df -h\nsudo journalctl --vacuum-size=200M\nsudo systemctl restart nginx\ncurl localhost', check: { all: [{ state: 'ok.web' }, { ran: 'curl-ok' }] } },
        { device: 'sw', text: 'Nenhuma porta do {{sw.name}} em erro.', help: ['show-int'], auto: 'enable\nshow interfaces status\nconfigure terminal\ninterface {{port}}\nshutdown\nno shutdown\nend', check: { state: 'sw.healed', arg: '{{port}}' } },
        { text: 'O {{dev.name}} está na rede.', help: ['ping'], auto: 'ping -c 3 {{gw}}', check: pingGw },
      ],
    },
  ];

  // what each rank requires besides its mission (the levels with problems of their own)
  const ranks = [
    { id: 'est', level: 1, name: 'Estagiário(a)', xp_to_next: 300, distinct_to_next: 6 },
    { id: 'jr1', level: 2, name: 'Júnior I', xp_to_next: 450, distinct_to_next: 7 },
    { id: 'jr2', level: 3, name: 'Júnior II', xp_to_next: 600, distinct_to_next: 8 },
    { id: 'jr3', level: 4, name: 'Júnior III', xp_to_next: 800, distinct_to_next: 9 },
    { id: 'pl1', level: 5, name: 'Pleno I', xp_to_next: 1000, distinct_to_next: 10 },
    { id: 'pl2', level: 6, name: 'Pleno II', xp_to_next: 1300, distinct_to_next: 10 },
    { id: 'pl3', level: 7, name: 'Pleno III', xp_to_next: 1600, distinct_to_next: 11 },
    { id: 'sr', level: 8, name: 'Sênior', xp_to_next: 2000, distinct_to_next: 12 },
    { id: 'esp', level: 9, name: 'Especialista', xp_to_next: 2500, distinct_to_next: 12 },
    // the last rank: its XP is the record of the career (there is no level after it)
    { id: 'lead', level: 10, name: 'Tech Lead', xp_to_next: 3000, distinct_to_next: 12 },
  ];

  DL.SCENARIO_DATA = { lessons, problems, ranks };
})();
