/* DataLab — simulated terminal: a tiny Linux shell and a Cisco-style switch CLI over each device's state,
   a command reference ("Precisa de ajuda?") and guided lessons whose steps advance on real effects
   (the interface is up, the IP is set, the ping answered), never on typing one exact string. */
(function () {
  'use strict';
  const DL = window.DL;
  const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));

  /* ------------------------------------------------------------------ */
  /* Command reference                                                   */
  /* ------------------------------------------------------------------ */
  const HELP = {
    'ip-addr': { cmd: 'ip addr', ex: 'ip addr', what: 'Mostra as interfaces de rede e os endereços IP de cada uma.', when: 'Primeiro passo para entender a rede de um servidor: a interface está UP? Tem IP?' },
    'ip-link': { cmd: 'ip link', ex: 'ip link', what: 'Lista as interfaces e o estado do link (UP ou DOWN), sem os IPs.', when: 'Para checar rapidamente se uma interface está ativa.' },
    'ip-link-up': { cmd: 'sudo ip link set <interface> up', ex: 'sudo ip link set eth0 up', what: 'Liga (ativa) a interface de rede. Com "down" no lugar de "up", desliga.', when: 'Quando ip addr ou ip link mostram a interface como DOWN.' },
    'ip-addr-add': { cmd: 'sudo ip addr add <ip>/<máscara> dev <interface>', ex: 'sudo ip addr add 10.0.1.12/24 dev eth0', what: 'Atribui um endereço IP à interface. /24 significa máscara 255.255.255.0 (256 endereços na rede).', when: 'Ao configurar um servidor novo com IP fixo. Errou? sudo ip addr del <ip>/24 dev eth0.' },
    'ip-route': { cmd: 'ip route', ex: 'ip route', what: 'Mostra a tabela de rotas: por onde o servidor envia cada pacote.', when: 'Para conferir se existe uma rota padrão (default via ...).' },
    'ip-route-add': { cmd: 'sudo ip route add default via <gateway>', ex: 'sudo ip route add default via 10.0.1.1', what: 'Define a rota padrão: o gateway que recebe tudo o que não é da rede local.', when: 'Depois de dar IP, para o servidor falar com outras redes e com a internet.' },
    ping: { cmd: 'ping -c <quantidade> <destino>', ex: 'ping -c 3 10.0.1.1', what: 'Envia pacotes ICMP e mostra se o destino responde e em quanto tempo.', when: 'Para testar a conectividade depois de configurar ou consertar a rede.' },
    sudo: { cmd: 'sudo <comando>', ex: 'sudo ip link set eth0 up', what: 'Executa o comando como administrador (root).', when: 'Sempre que o comando altera o sistema: rede, serviços, logs. Sem sudo aparece "Operation not permitted".' },
    'systemctl-status': { cmd: 'systemctl status <serviço>', ex: 'systemctl status nginx', what: 'Mostra se um serviço está rodando (active) ou falhou (failed), com as últimas mensagens.', when: 'Quando um site ou aplicação para de responder.' },
    'systemctl-restart': { cmd: 'sudo systemctl restart <serviço>', ex: 'sudo systemctl restart nginx', what: 'Para e inicia o serviço de novo.', when: 'Depois de confirmar que o serviço caiu ou travou.' },
    curl: { cmd: 'curl <endereço>', ex: 'curl localhost', what: 'Faz uma requisição HTTP e mostra a resposta.', when: 'Para testar se um serviço web está respondendo.' },
    df: { cmd: 'df -h', ex: 'df -h', what: 'Mostra o uso de espaço de cada disco, em unidades legíveis (G, M).', when: 'Quando há suspeita de disco cheio — aplicações começam a falhar sem espaço.' },
    du: { cmd: 'du -sh <pasta>', ex: 'du -sh /var/log', what: 'Mostra quanto espaço uma pasta ocupa no total.', when: 'Para descobrir o que está enchendo o disco.' },
    'journalctl-vacuum': { cmd: 'sudo journalctl --vacuum-size=<tamanho>', ex: 'sudo journalctl --vacuum-size=200M', what: 'Apaga os logs antigos do systemd até sobrar o tamanho indicado.', when: 'Quando os logs estão lotando o disco.' },
    hostnamectl: { cmd: 'sudo hostnamectl set-hostname <nome>', ex: 'sudo hostnamectl set-hostname srv-01', what: 'Define o nome da máquina.', when: 'Na configuração inicial, para identificar o servidor na rede.' },
    hostname: { cmd: 'hostname', ex: 'hostname', what: 'Mostra o nome da máquina.', when: 'Para confirmar em qual servidor você está antes de mexer em algo.' },
    whoami: { cmd: 'whoami', ex: 'whoami', what: 'Mostra com qual usuário você está logado (com sudo, root).', when: 'Ao entrar num servidor, para saber que permissões você tem.' },
    uname: { cmd: 'uname -a', ex: 'uname -a', what: 'Mostra o sistema operacional, o nome da máquina e a versão do kernel.', when: 'Para documentar o servidor ou conferir a versão antes de uma atualização.' },
    uptime: { cmd: 'uptime', ex: 'uptime', what: 'Mostra há quanto tempo o servidor está ligado e a carga média (load average).', when: 'Para saber se o servidor reiniciou ou está sobrecarregado.' },
    enable: { cmd: 'enable', ex: 'enable', what: 'No switch, entra no modo privilegiado (o prompt muda de > para #).', when: 'Antes de qualquer comando de diagnóstico ou configuração no switch.' },
    'show-int': { cmd: 'show interfaces status', ex: 'show interfaces status', what: 'Lista as portas do switch e o estado de cada uma (connected, notconnect, err-disabled). Abreviação: sh int status.', when: 'Para achar a porta com problema.' },
    'conf-t': { cmd: 'configure terminal', ex: 'conf t', what: 'Entra no modo de configuração global do switch.', when: 'Antes de mudar qualquer configuração.' },
    interface: { cmd: 'interface <porta>', ex: 'interface gi0/3', what: 'Seleciona uma porta para configurar (prompt vira config-if).', when: 'Depois do conf t, para mexer em uma porta específica.' },
    shutdown: { cmd: 'shutdown', ex: 'shutdown', what: 'Desativa administrativamente a porta selecionada (o status vira disabled). Numa porta err-disabled, é o primeiro passo para "zerar" o estado de erro.', when: 'Em config-if da porta com problema (interface <porta>), quando ela está err-disabled e a causa já foi resolvida.' },
    'no-shutdown': { cmd: 'no shutdown', ex: 'no shutdown', what: 'Reativa a porta. Depois do shutdown, tira a porta do err-disabled e ela volta a conectar (status connected).', when: 'Logo depois do shutdown, ainda em config-if da mesma porta.' },
    lscpu: { cmd: 'lscpu', ex: 'lscpu', what: 'Mostra o processador: modelo, quantos soquetes, núcleos (cores) e threads.', when: 'Para documentar o hardware ou saber se o servidor aguenta mais carga.' },
    free: { cmd: 'free -h', ex: 'free -h', what: 'Mostra a memória RAM: total, usada e livre, em unidades legíveis (GB).', when: 'Para documentar o servidor ou quando ele está lento.' },
    tail: { cmd: 'tail -n <linhas> <arquivo>', ex: 'tail -n 20 /var/log/auth.log', what: 'Mostra as últimas linhas de um arquivo (10, se você não disser quantas). Os logs ficam em /var/log.', when: 'Para ver o que aconteceu por último num log: logins, erros, reinícios.' },
    grep: { cmd: 'grep "<texto>" <arquivo>', ex: 'grep "Failed password" /var/log/auth.log', what: 'Mostra só as linhas que contêm o texto. -i ignora maiúsculas, -c conta as linhas. Também filtra a saída de outro comando: tail /var/log/auth.log | grep Failed.', when: 'Para achar o que interessa num log grande.' },
    ss: { cmd: 'sudo ss -tlnp', ex: 'sudo ss -tlnp', what: 'Lista as portas TCP em escuta: -t TCP, -l escutando, -n em números, -p o processo de cada porta (precisa de sudo). netstat -tlnp mostra o mesmo.', when: 'Para saber em que porta um serviço atende, ou se ele está mesmo escutando.' },
    'show-run': { cmd: 'show running-config', ex: 'show running-config', what: 'Mostra a configuração em uso agora, na memória do switch (abreviação: sh run). Ela se perde se o switch reiniciar sem salvar.', when: 'Antes e depois de mudar qualquer coisa no switch.' },
    'show-start': { cmd: 'show startup-config', ex: 'show startup-config', what: 'Mostra a configuração salva: a que o switch carrega quando liga (abreviação: sh start).', when: 'Para conferir se o que está em uso já foi salvo.' },
    'copy-run-start': { cmd: 'copy running-config startup-config', ex: 'copy running-config startup-config', what: 'Salva a configuração em uso como a de inicialização (abreviação: copy run start; write memory faz o mesmo).', when: 'Sempre que terminar uma mudança no switch: sem isso, um reinício desfaz tudo.' },
    'ip-addr-del': { cmd: 'sudo ip addr del <ip>/<máscara> dev <interface>', ex: 'sudo ip addr del 10.0.1.150/24 dev eth0', what: 'Remove um endereço IP da interface (o contrário de ip addr add).', when: 'Quando a interface ficou com um IP errado ou sobrando: veja com ip addr e remova o que não devia estar lá.' },
    'ip-route-del': { cmd: 'sudo ip route del default', ex: 'sudo ip route del default', what: 'Apaga a rota padrão (default via …). Só existe uma: para trocar o gateway, apague e crie de novo.', when: 'Quando ip route mostra a rota padrão apontando para o gateway errado.' },
    'systemctl-start': { cmd: 'sudo systemctl start <serviço>', ex: 'sudo systemctl start ssh', what: 'Inicia um serviço que está parado (inactive). restart também serve: para e inicia.', when: 'Quando o status mostra "inactive (dead)": alguém ou algo parou o serviço.' },
    cat: { cmd: 'cat <arquivo>', ex: 'cat notas.txt', what: 'Mostra o conteúdo inteiro de um arquivo.', when: 'Para ler arquivos curtos: anotações, configurações, o /etc/hostname.' },
    'sw-ping': { cmd: 'ping <ip>', ex: 'ping 10.0.1.11', what: 'No switch, testa se um endereço responde (!!!!! = respondeu, ..... = não).', when: 'Para testar a rede a partir do próprio switch, sem depender de um servidor.' },
    // switch: VLANs (Sênior)
    'show-vlan': { cmd: 'show vlan brief', ex: 'show vlan brief', what: 'Lista as VLANs do switch e as portas de acesso de cada uma. A VLAN 10 é a do datacenter (gateway e servidores).', when: 'Para ver em que VLAN cada porta está, ou se uma VLAN existe.' },
    'sw-vlan': { cmd: 'vlan <N>  →  name <NOME>', ex: 'vlan 30\nname CAMERAS', what: 'Cria a VLAN N (no modo config) e entra nela (config-vlan); name dá o nome. exit volta.', when: 'Para separar a rede em pedaços isolados: câmeras, visitantes, gerência…' },
    'sw-access': { cmd: 'switchport access vlan <N>', ex: 'interface gi0/20\nswitchport access vlan 30', what: 'Na porta (config-if), coloca a porta de acesso na VLAN N. O aparelho ligado nela passa a falar só com essa VLAN.', when: 'Ao dedicar portas a uma VLAN, ou para devolver um servidor à VLAN 10.' },
    'sw-mode': { cmd: 'switchport mode access|trunk', ex: 'switchport mode access', what: 'access: a porta leva uma VLAN só (servidores, PCs, câmeras). trunk: leva várias VLANs marcadas (ligação entre switches).', when: 'Servidor ligado em porta trunk perde a rede: porta de servidor é access.' },
    'sw-trunk': { cmd: 'switchport trunk allowed vlan <lista>', ex: 'interface gi0/24\nswitchport mode trunk\nswitchport trunk allowed vlan 10,30', what: 'Na porta trunk, escolhe quais VLANs passam por ela (add <N> acrescenta uma).', when: 'Na ligação entre dois switches, para levar só as VLANs que o outro lado precisa.' },
    'show-trunk': { cmd: 'show interfaces trunk', ex: 'show interfaces trunk', what: 'Mostra as portas em modo trunk e as VLANs que cada uma leva.', when: 'Para conferir uma ligação entre switches.' },
    'show-mac': { cmd: 'show mac address-table', ex: 'show mac address-table', what: 'A tabela de MACs: qual endereço físico (MAC) o switch aprendeu em cada porta. O MAC aparece como 5254.0001.1100.', when: 'Para achar em que porta está um aparelho quando só se sabe o MAC dele (ip link mostra o MAC no servidor).' },
    // Linux: firewall, accounts, files, packages, backup (Sênior)
    'ufw-status': { cmd: 'sudo ufw status', ex: 'sudo ufw status', what: 'Mostra se o firewall está ativo e as regras (o que entra e o que é bloqueado).', when: 'Antes e depois de mexer no firewall.' },
    'ufw-allow': { cmd: 'sudo ufw allow <porta>', ex: 'sudo ufw allow 22\nsudo ufw allow 80', what: 'Libera a entrada numa porta (22 SSH, 80 HTTP, 443 HTTPS; ou os nomes ssh, http, https).', when: 'Antes de ligar o firewall, libere a 22: senão quem está no SSH perde o acesso.' },
    'ufw-enable': { cmd: 'sudo ufw enable', ex: 'sudo ufw enable', what: 'Liga o firewall: tudo que entra é bloqueado, menos o que tiver regra allow.', when: 'Depois de liberar as portas que o servidor precisa.' },
    'ufw-deny': { cmd: 'sudo ufw deny from <ip>', ex: 'sudo ufw deny from 203.0.113.7', what: 'Bloqueia tudo que vem de um IP.', when: 'Para cortar um atacante que você achou nos logs.' },
    'ls-l': { cmd: 'ls -l <pasta ou arquivo>', ex: 'ls -l /etc/app', what: 'Lista com detalhes: permissões (rwx de dono, grupo e outros), dono, grupo e tamanho.', when: 'Para ver quem pode ler ou alterar um arquivo.' },
    chmod: { cmd: 'sudo chmod <modo> <arquivo>', ex: 'sudo chmod 640 /etc/app/config.env', what: 'Troca as permissões. Cada dígito é dono/grupo/outros: 4 ler + 2 escrever + 1 executar. 640 = dono lê e escreve, grupo lê, outros nada.', when: 'Arquivo com senha nunca fica legível para "outros".' },
    chown: { cmd: 'sudo chown <usuário>:<grupo> <arquivo>', ex: 'sudo chown root:app /etc/app/config.env', what: 'Troca o dono e o grupo de um arquivo.', when: 'Para que só o grupo da aplicação leia o arquivo dela.' },
    useradd: { cmd: 'sudo useradd -m -s /bin/bash [-G grupo] <nome>', ex: 'sudo useradd -m -s /bin/bash rafael', what: 'Cria uma conta: -m cria a pasta pessoal, -s escolhe o shell, -G já põe em grupos.', when: 'Quando alguém novo precisa entrar no servidor.' },
    usermod: { cmd: 'sudo usermod -aG <grupo> <usuário>', ex: 'sudo usermod -aG deploy rafael', what: 'Acrescenta a pessoa a um grupo (-a junto com -G: sem o -a, ela sai dos outros grupos).', when: 'Para dar acesso por grupo, nunca arquivo a arquivo.' },
    'passwd-l': { cmd: 'sudo passwd -l <usuário>', ex: 'sudo passwd -l estagio', what: 'Bloqueia a senha da conta (ninguém entra com ela). passwd -S mostra o estado: L = bloqueada.', when: 'Conta vazada ou de quem saiu: bloqueie na hora.' },
    id: { cmd: 'id <usuário>', ex: 'id rafael', what: 'Mostra o número (uid) e os grupos de uma conta.', when: 'Para conferir se a pessoa está nos grupos certos.' },
    'apt-update': { cmd: 'sudo apt update', ex: 'sudo apt update\napt list --upgradable', what: 'Baixa a lista de versões novas dos pacotes. apt list --upgradable mostra o que pode ser atualizado.', when: 'Sempre antes de atualizar ou instalar.' },
    'apt-upgrade': { cmd: 'sudo apt upgrade -y', ex: 'sudo apt upgrade -y', what: 'Instala as versões novas dos pacotes. Serviços atualizados (como o nginx) só usam a versão nova depois de reiniciar.', when: 'Para aplicar correções de segurança.' },
    'apt-install': { cmd: 'sudo apt install -y <pacote>', ex: 'sudo apt install -y fail2ban', what: 'Instala um pacote (e o serviço dele, se tiver).', when: 'Para acrescentar uma ferramenta ao servidor.' },
    tar: { cmd: 'sudo tar czf <arquivo.tar.gz> <pasta>', ex: 'sudo tar czf /backup/etc.tar.gz /etc', what: 'Junta e comprime uma pasta num arquivo só (c criar, z comprimir, f arquivo). tar tzf lista o que tem dentro.', when: 'Para fazer backup de configurações antes de mexer.' },
    rsync: { cmd: 'rsync -a <origem>/ <usuário>@<ip>:<pasta>/', ex: 'rsync -a /var/www/ backup@10.0.1.12:/srv/backup/www/', what: 'Copia uma pasta para outro servidor pela rede, mandando só o que mudou (-a mantém permissões e datas).', when: 'Para manter uma cópia do site ou dos dados em outro servidor.' },
    // Linux: Especialista / Tech Lead
    ps: { cmd: 'ps aux --sort=-%cpu', ex: 'ps aux --sort=-%cpu\nps aux --sort=-%mem', what: 'Lista os processos com dono, PID, %CPU e %MEM. --sort=-%cpu põe quem mais gasta em cima.', when: 'Servidor lento: descubra quem está comendo CPU ou memória.' },
    top: { cmd: 'top', ex: 'top', what: 'Uma foto do servidor: carga (load average), swap e os processos que mais usam CPU.', when: 'Primeira olhada num servidor lento.' },
    kill: { cmd: 'sudo kill <pid>', ex: 'sudo kill 4242', what: 'Encerra um processo pelo número (PID). pkill <nome> encerra pelo nome.', when: 'Processo travado ou descontrolado (confirme antes que não é algo importante).' },
    dmesg: { cmd: 'sudo dmesg', ex: 'sudo dmesg | grep -i memory', what: 'As mensagens do kernel: discos, rede, e quando o sistema mata processos por falta de memória (Out of memory).', when: 'Um serviço sumiu sem deixar erro no próprio log.' },
    'journalctl-u': { cmd: 'journalctl -u <serviço> --since "1 hour ago"', ex: 'journalctl -u app --since "1 hour ago"', what: 'O log de um serviço só (no padrão do systemd).', when: 'Para ver por que uma aplicação falhou e com qual erro.' },
    mdstat: { cmd: 'cat /proc/mdstat', ex: 'cat /proc/mdstat\nsudo mdadm --detail /dev/md0', what: 'O estado do RAID por software: [UU] = os dois discos bons, [U_] = um faltando, (F) = disco com falha.', when: 'Alerta de disco, ou antes de mexer nos discos.' },
    mdadm: { cmd: 'sudo mdadm /dev/md0 --fail|--remove|--add /dev/sdX1', ex: 'sudo mdadm /dev/md0 --fail /dev/sdb1\nsudo mdadm /dev/md0 --remove /dev/sdb1\nsudo mdadm /dev/md0 --add /dev/sdc1', what: 'Gerencia o RAID: marca um disco como falho, tira do conjunto e põe outro no lugar (ele é reconstruído).', when: 'Para trocar um disco com defeito sem desligar o servidor.' },
    smartctl: { cmd: 'sudo smartctl -H /dev/sdX', ex: 'sudo smartctl -H /dev/sdb', what: 'Pergunta ao próprio disco como ele está (SMART): PASSED ou FAILED.', when: 'Para trocar um disco ANTES de ele morrer.' },
    'openssl-cert': { cmd: 'openssl x509 -enddate -noout -in <certificado>', ex: 'openssl x509 -enddate -noout -in /etc/letsencrypt/live/site/cert.pem', what: 'Mostra a data em que o certificado vence (notAfter).', when: 'Antes que o navegador dos clientes mostre "conexão não segura".' },
    certbot: { cmd: 'sudo certbot certificates · sudo certbot renew', ex: 'sudo certbot certificates\nsudo certbot renew', what: 'certificates lista os certificados e quantos dias faltam; renew renova os que vencem em menos de 30 dias.', when: 'Certificado perto de vencer. Depois recarregue o nginx.' },
    reload: { cmd: 'sudo systemctl reload <serviço>', ex: 'sudo systemctl reload nginx', what: 'Faz o serviço reler a configuração (e certificados) sem derrubar as conexões.', when: 'Depois de renovar um certificado ou mudar uma configuração.' },
    'nginx-t': { cmd: 'sudo nginx -t', ex: 'sudo nginx -t', what: 'Testa a configuração do nginx e diz o arquivo e a linha do erro.', when: 'Sempre antes de reiniciar o nginx depois de uma mudança.' },
    sed: { cmd: "sudo sed -i 's/velho/novo/' <arquivo>", ex: "sudo sed -i 's/server_nmae/server_name/' /etc/nginx/sites-enabled/site", what: 'Troca um texto dentro de um arquivo, direto (-i). Com g no fim, troca todas as vezes na linha.', when: 'Para corrigir uma linha de configuração sem editor.' },
    cp: { cmd: 'sudo cp <origem> <destino>', ex: 'sudo cp /etc/nginx/sites-enabled/site.bak /etc/nginx/sites-enabled/site', what: 'Copia um arquivo (por cima do destino, se ele existir).', when: 'Para voltar uma configuração a partir da cópia de segurança (.bak).' },
    ethtool: { cmd: 'ethtool eth0', ex: 'ethtool eth0', what: 'Mostra a velocidade e o duplex da placa de rede. Half duplex ou 100Mb/s numa placa de 1 Gb/s = algo forçado no switch.', when: 'Servidor lento na rede, com erros.' },
    'ip-stats': { cmd: 'ip -s link', ex: 'ip -s link', what: 'Os contadores da placa: pacotes, erros e colisões. Erros subindo = problema físico ou de duplex.', when: 'Rede lenta ou instável.' },
    'sw-duplex': { cmd: 'speed auto · duplex auto', ex: 'interface gi0/5\nspeed auto\nduplex auto', what: 'Na porta do switch (config-if), volta velocidade e duplex para o automático (o servidor e o switch combinam o melhor).', when: 'Quando alguém forçou 100 Mb/s ou half duplex na porta de um servidor.' },
    'nvidia-smi': { cmd: 'nvidia-smi', ex: 'nvidia-smi\nsudo nvidia-smi -pl 250', what: 'Mostra a GPU: temperatura, consumo e uso. -pl limita a potência (em watts): menos calor, um pouco menos de desempenho.', when: 'Servidor de IA esquentando.' },
    psql: { cmd: 'sudo -u postgres psql -c "<consulta>"', ex: 'sudo -u postgres psql -c "select count(*) from pg_stat_activity;"', what: 'Roda uma consulta no PostgreSQL como o usuário do banco. pg_stat_activity = as conexões abertas.', when: 'Banco lento ou recusando conexões.' },
    'pg-dump': { cmd: 'sudo -u postgres pg_dump <banco> > <arquivo>', ex: 'sudo -u postgres pg_dump app > /backup/app.sql', what: 'Exporta o banco inteiro para um arquivo. Para restaurar: sudo -u postgres psql app < /backup/app.sql.', when: 'Antes de qualquer mudança no banco.' },
    traceroute: { cmd: 'traceroute <destino>', ex: 'traceroute 8.8.8.8', what: 'Mostra cada salto (roteador) do caminho até o destino. * * * = o salto não respondeu.', when: 'Para saber se o problema é dentro da empresa ou na operadora.' },
    'tar-x': { cmd: 'sudo tar xzf <arquivo> -C /', ex: 'sudo tar xzf /backup/etc-ontem.tar.gz -C /', what: 'Extrai um backup feito com tar czf, devolvendo os arquivos aos lugares de origem (-C / = a partir da raiz).', when: 'Alguém apagou ou estragou um arquivo de configuração.' },
    timedatectl: { cmd: 'timedatectl · sudo timedatectl set-ntp true', ex: 'timedatectl\nsudo timedatectl set-ntp true', what: 'Mostra a hora e se ela é sincronizada pela rede (NTP). set-ntp true liga a sincronização.', when: 'Logs com horário errado, certificados "do futuro", login do domínio falhando.' },
    sensors: { cmd: 'sensors', ex: 'sensors', what: 'As temperaturas da CPU. Acima do "high" o servidor começa a reduzir o desempenho para não queimar.', when: 'Sala quente ou ar-condicionado com problema.' },
    upsc: { cmd: 'upsc ups', ex: 'upsc ups', what: 'O estado do nobreak: OL = na energia, OB = na bateria; battery.runtime = segundos de bateria que restam.', when: 'Queda de energia: quanto tempo você tem para desligar com segurança.' },
    gpasswd: { cmd: 'sudo gpasswd -d <usuário> <grupo>', ex: 'sudo gpasswd -d estagio sudo', what: 'Tira a pessoa de um grupo (o contrário do usermod -aG).', when: 'Revisão de acessos: quem não precisa mais de sudo sai do grupo.' },
    'ss-conn': { cmd: 'ss -tn', ex: 'ss -tn', what: 'As conexões TCP abertas agora, com o IP de quem está conectado.', when: 'Site lento por excesso de acessos: veja de onde eles vêm.' },
    crontab: { cmd: 'crontab -l  ·  echo "<linha>" | crontab -', ex: 'crontab -l\necho "0 2 * * * /usr/local/bin/backup.sh" | crontab -', what: 'O agendador: cada linha é minuto, hora, dia, mês, dia-da-semana e o comando (* = todos). crontab -l mostra; o echo | crontab - grava.', when: 'Para rodar um backup todo dia sem ninguém lembrar.' },
    responder: { cmd: 'responder <valor>', ex: 'responder 10.0.1.25', what: 'Responde a pergunta do passo atual (um IP, uma porta, um número). O campo no painel ao lado faz o mesmo.', when: 'Quando o passo é uma pergunta: rode o comando que mostra a informação, leia a saída e responda.' },
    cabling: { cmd: 'Cabeamento do rack', ex: 'Tarefas → Cabeamento  (ou o botão abaixo)', what: 'Mostra os cabos do rack: azul = ligado e correto, amarelo = incompleto, vermelho = conexão errada, laranja = cabo solto.', when: 'Quando ip link mostra NO-CARRIER: não é configuração, é a camada física (cabo).' },
    end: { cmd: 'end', ex: 'end', what: 'Sai do modo de configuração e volta ao modo privilegiado (#).', when: 'Ao terminar de configurar, para voltar a usar comandos show.' },
  };
  DL.CMD_HELP = HELP;

  /* ------------------------------------------------------------------ */
  /* Lessons: steps are checked against device state + what was run      */
  /* (built from problems-data.js by problems.js; winserver.js adds the  */
  /* Windows ones). Each entry: (device) → { title, goal, steps }.       */
  /* ------------------------------------------------------------------ */
  const LESSONS = {};
  DL.LESSONS = LESSONS;

  /* ------------------------------------------------------------------ */
  /* Device OS                                                           */
  /* ------------------------------------------------------------------ */
  DL.newOS = function (d, configured) {
    d.os = {
      hostname: configured ? d.name.toLowerCase() : 'localhost',
      ifaces: {
        lo: { up: true, ips: ['127.0.0.1/8'], mac: '00:00:00:00:00:00' },
        eth0: { up: !!configured, ips: configured ? [d.ip + '/24'] : [], mac: '52:54:00:' + [d.n >> 8, d.n & 255, 17].map((v) => v.toString(16).padStart(2, '0')).join(':') },
      },
      route: configured ? '10.0.1.1' : null,
      cable: !!configured,
      services: { nginx: 'active', ssh: 'active' },
      disk: 38 + (d.n * 7) % 20,
      boot: Date.now(),
    };
    if (d.kind === 'switch') {
      d.sw = { mode: 'user', cur: null, bad: null, fixed: false, ports: {} };
      const n = d.ports ? d.ports.length - 1 : 24; // access ports of this switch model
      for (let i = 1; i <= n; i++) d.sw.ports['gi0/' + i] = 'notconnect';
      d.sw.linked = new Set();
    }
  };

  const ipOnly = (cidr) => cidr.split('/')[0];
  const sameNet = (a, b) => a.split('.').slice(0, 3).join('.') === b.split('.').slice(0, 3).join('.');

  /* ------------------------------------------------------------------ */
  /* Logs (/var/log/auth.log, /var/log/syslog)                           */
  /* ------------------------------------------------------------------ */
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  // a syslog timestamp `ago` minutes before now
  const stamp = (ago) => { const t = new Date(Date.now() - ago * 60000); return MON[t.getMonth()] + ' ' + String(t.getDate()).padStart(2, ' ') + ' ' + t.toTimeString().slice(0, 8); };
  const rint = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
  const sshd = (d, ago, text) => ({ ago, text: d.os.hostname + ' sshd[' + rint(1200, 9800) + ']: ' + text });
  const accepted = (d, ago) => [sshd(d, ago, 'Accepted publickey for admin from 10.0.1.' + rint(50, 60) + ' port ' + rint(40000, 60000) + ' ssh2: ED25519 SHA256:q3Vx' + rint(1000, 9999)),
    { ago, text: d.os.hostname + ' sshd[' + rint(1200, 9800) + ']: pam_unix(sshd:session): session opened for user admin(uid=1000) by (uid=0)' }];
  const toLines = (list) => list.sort((x, y) => y.ago - x.ago).map((e) => stamp(e.ago) + ' ' + e.text);
  // the routine lines of any auth.log: the hourly cron and the admin using sudo
  const routine = (d) => [
    { ago: 360, text: d.os.hostname + ' CRON[' + rint(1200, 9800) + ']: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)' },
    { ago: 300, text: d.os.hostname + ' CRON[' + rint(1200, 9800) + ']: pam_unix(cron:session): session closed for user root' },
    { ago: 185, text: d.os.hostname + ' sudo:    admin : TTY=pts/0 ; PWD=/home/admin ; USER=root ; COMMAND=/usr/bin/apt update' },
    { ago: 66, text: d.os.hostname + ' sudo:    admin : TTY=pts/1 ; PWD=/home/admin ; USER=root ; COMMAND=/usr/bin/systemctl status nginx' },
    { ago: 60, text: d.os.hostname + ' CRON[' + rint(1200, 9800) + ']: pam_unix(cron:session): session opened for user root(uid=0) by (uid=0)' },
  ];
  // a quiet day: the team logging in from the office network
  function authLog(d) {
    if (!d.os.authlog) d.os.authlog = toLines([].concat(routine(d), accepted(d, 320), accepted(d, 190), accepted(d, 70), accepted(d, 12)));
    return d.os.authlog;
  }
  // someone guessing passwords over SSH from `ip` (most of the failures), plus a couple of stray scanners
  DL.authAttack = function (d, ip) {
    ip = ip || '203.0.113.' + rint(10, 250);
    const users = ['root', 'admin', 'ubuntu', 'test', 'oracle', 'postgres', 'git', 'user', 'deploy'];
    const list = [].concat(routine(d), accepted(d, 240), accepted(d, 95));
    for (let i = 0; i < 9; i++) {
      const u = users[i % users.length], invalid = u !== 'root' && u !== 'admin';
      list.push(sshd(d, 40 - i * 4, 'Failed password for ' + (invalid ? 'invalid user ' : '') + u + ' from ' + ip + ' port ' + rint(30000, 65000) + ' ssh2'));
    }
    list.push(sshd(d, 150, 'Failed password for root from 198.51.100.' + rint(10, 250) + ' port ' + rint(30000, 65000) + ' ssh2'));
    list.push(sshd(d, 27, 'Failed password for invalid user pi from 192.0.2.' + rint(10, 250) + ' port ' + rint(30000, 65000) + ' ssh2'));
    list.push(sshd(d, 6, 'Connection closed by authenticating user root ' + ip + ' port ' + rint(30000, 65000) + ' [preauth]'));
    d.os.authlog = toLines(list);
    d.os.attacker = ip;
    return ip;
  };
  // the routine lines, plus what happened to this server (d.os.sysextra: { at, text }, added by problems)
  function syslog(d) {
    const h = d.os.hostname;
    const extra = (d.os.sysextra || []).map((e) => ({ ago: (Date.now() - e.at) / 60000, text: h + ' ' + e.text }));
    return toLines([{ ago: 400, text: h + ' systemd[1]: Started nginx.service - A high performance web server.' }, { ago: 300, text: h + ' CRON[2210]: (root) CMD (run-parts /etc/cron.hourly)' },
      { ago: 120, text: h + ' systemd[1]: Starting apt-daily.service - Daily apt download activities...' }, { ago: 20, text: h + ' systemd-resolved[511]: Clock change detected. Flushing caches.' }].concat(extra));
  }
  DL.syslogAdd = function (d, ago, text) { (d.os.sysextra = d.os.sysextra || []).push({ at: Date.now() - ago * 60000, text }); };
  // a quiet day with a known last login: the IP the admin came from most recently
  DL.authLogins = function (d, ip) {
    ip = ip || '10.0.1.' + rint(50, 60);
    const last = [sshd(d, 9, 'Accepted publickey for admin from ' + ip + ' port ' + rint(40000, 60000) + ' ssh2: ED25519 SHA256:q3Vx' + rint(1000, 9999)),
      { ago: 9, text: d.os.hostname + ' sshd[' + rint(1200, 9800) + ']: pam_unix(sshd:session): session opened for user admin(uid=1000) by (uid=0)' }];
    d.os.authlog = toLines([].concat(routine(d), accepted(d, 320), accepted(d, 190), accepted(d, 70), last));
    d.os.lastLogin = ip;
    return ip;
  };
  // someone stopped a service with sudo a few minutes ago (auth.log tells who)
  DL.authStop = function (d, user, svc) {
    authLog(d).push(stamp(8) + ' ' + d.os.hostname + ' sudo:   ' + user + ' : TTY=pts/2 ; PWD=/home/' + user + ' ; USER=root ; COMMAND=/usr/bin/systemctl stop ' + svc);
    d.os.stopper = user;
  };
  // someone logged in with a password from outside the company (a leaked account)
  DL.authLeak = function (d, user, ip) {
    ip = ip || '198.51.100.' + rint(10, 250);
    authLog(d).push(stamp(30) + ' ' + d.os.hostname + ' sshd[' + rint(1200, 9800) + ']: Accepted password for ' + user + ' from ' + ip + ' port ' + rint(40000, 60000) + ' ssh2',
      stamp(30) + ' ' + d.os.hostname + ' sshd[' + rint(1200, 9800) + ']: pam_unix(sshd:session): session opened for user ' + user + '(uid=1003) by (uid=0)');
    d.os.leakIp = ip;
    return ip;
  };

  /* ------------------------------------------------------------------ */
  /* The rest of a Linux server (Sênior problems): firewall, accounts,   */
  /* files with owner and mode, packages, cron. Created on first use and */
  /* not saved — a loaded game brings a clean server back and the open   */
  /* problem sets itself up again.                                       */
  /* ------------------------------------------------------------------ */
  const dirE = (owner, group) => ({ dir: true, mode: '755', owner: owner || 'root', group: group || owner || 'root' });
  function sysOf(d) {
    const os = d.os;
    if (!os.fw) os.fw = { on: false, rules: [] };
    if (!os.users) os.users = { root: { uid: 0, groups: ['root'] }, admin: { uid: 1000, groups: ['admin', 'adm', 'sudo'] } };
    if (!os.groups) os.groups = { root: 0, adm: 4, sudo: 27, 'www-data': 33, admin: 1000, deploy: 1001, app: 1002 };
    if (!os.files) {
      os.files = {
        '/etc': dirE(), '/etc/app': dirE(), '/backup': dirE(), '/usr/local/bin': dirE(), '/var/www': dirE(), '/var/www/html': dirE('www-data'), '/home/admin': dirE('admin'),
        '/etc/hostname': { mode: '644', owner: 'root', group: 'root', size: 12 },
        '/etc/app/config.env': { mode: '640', owner: 'root', group: 'app', size: 182, text: ['DB_HOST=10.0.1.20', 'DB_USER=app', 'DB_PASSWORD=Pr0d#Datalab2026'] },
        '/usr/local/bin/backup.sh': { mode: '755', owner: 'root', group: 'root', size: 412, text: ['#!/bin/bash', '# backup diário do /etc', 'tar czf /backup/etc-$(date +%F).tar.gz /etc'] },
        '/var/www/html/index.html': { mode: '644', owner: 'www-data', group: 'www-data', size: 615 },
        '/home/admin/notas.txt': { mode: '644', owner: 'admin', group: 'admin', size: 64 },
      };
    }
    if (!os.pkgs) os.pkgs = { nginx: '1.24.0-2ubuntu7', 'openssh-server': '1:9.6p1-3ubuntu13', openssl: '3.0.13-0ubuntu3', rsync: '3.2.7-1ubuntu1', tar: '1.35+dfsg-3', ufw: '0.36.2-6', cron: '3.0pl1-184ubuntu2' };
    if (!os.updates) os.updates = [];
    if (!os.cron) os.cron = [];
    return os;
  }
  DL.linuxSys = sysOf;
  // the firewall lets this port in (off = everything passes)
  const fwAllows = (os, port) => !os.fw || !os.fw.on || os.fw.rules.some((r) => r.act === 'allow' && String(r.port) === String(port));
  DL.fwAllows = fwAllows;
  const PORT_NAMES = { ssh: '22', http: '80', https: '443' };
  const parentDir = (p) => p.replace(/\/[^/]+\/?$/, '') || '/';
  const permStr = (f) => (f.dir ? 'd' : '-') + f.mode.split('').map((n) => ['---', '--x', '-w-', '-wx', 'r--', 'r-x', 'rw-', 'rwx'][+n]).join('');
  // can this user read / write it (root can always)
  const can = (os, f, user, bit) => {
    if (user === 'root') return true;
    const u = os.users[user] || { groups: [] }, m = f.mode.split('').map(Number);
    const who = f.owner === user ? m[0] : u.groups.indexOf(f.group) >= 0 ? m[1] : m[2];
    return (who & bit) === bit;
  };
  // a cron line: five time fields (minute 0-59, hour 0-23, day 1-31, month 1-12, weekday 0-7) and a command
  const CRON_MAX = [[0, 59], [0, 23], [1, 31], [1, 12], [0, 7]];
  // the first field that is wrong, the way cron names it (null: the line is fine)
  const cronBad = (l) => {
    const f = String(l).trim().split(/\s+/), names = ['minute', 'hour', 'day-of-month', 'month', 'day-of-week'];
    for (let i = 0; i < 5; i++) {
      const x = f[i] || '';
      if (!/^(\*|\d+(-\d+)?)(\/\d+)?(,\d+)*$/.test(x) || !(x.match(/\d+/g) || []).filter((n, k, all) => !/\//.test(x) || k < all.length - 1).every((n) => +n >= CRON_MAX[i][0] && +n <= CRON_MAX[i][1])) return names[i];
    }
    return f.length >= 6 ? null : 'command';
  };
  const cronOk = (l) => !cronBad(l);

  // what a career problem sets up on a Linux server (problems.js: setup.linux) · ctx.vars: what a save kept
  const LSETUP = {
    // a leaked account logged in from outside
    leak: (d, c) => { const os = sysOf(d); os.users.estagio = { uid: 1003, groups: ['estagio'], locked: false }; DL.authLeak(d, 'estagio', c.vars.leak); },
    // three security updates waiting
    updates: (d) => { const os = sysOf(d); os.aptFresh = false; os.updates = [{ pkg: 'openssl', to: '3.0.13-0ubuntu3.4' }, { pkg: 'nginx', to: '1.24.0-2ubuntu7.1' }, { pkg: 'openssh-server', to: '1:9.6p1-3ubuntu13.5' }]; },
    // the app's password file readable by everyone
    openfile: (d) => { const f = sysOf(d).files['/etc/app/config.env']; Object.assign(f, { mode: '644', owner: 'root', group: 'root' }); },
    // the new developer has no account yet
    nouser: (d) => { const os = sysOf(d); for (const u of ['rafael', 'lia', 'davi', 'beto']) { delete os.users[u]; delete os.groups[u]; } },
    nofail2ban: (d) => { delete sysOf(d).pkgs.fail2ban; delete d.os.services.fail2ban; },
    fwoff: (d) => { sysOf(d).fw = { on: false, rules: [] }; },
    // the firewall already on, letting SSH and the site in
    fwweb: (d) => { sysOf(d).fw = { on: true, rules: [{ act: 'allow', port: '22' }, { act: 'allow', port: '80' }] }; },
    nocron: (d) => { sysOf(d).cron = []; },
    // the backup scheduled with the wrong script name: cron runs it and fails every night
    cronbroken: (d) => {
      const os = sysOf(d);
      os.cron = ['0 3 * * * /usr/local/bin/bkp.sh'];
      for (const ago of [1300, 2740]) {
        DL.syslogAdd(d, ago, 'CRON[' + rint(2000, 9000) + ']: (admin) CMD (/usr/local/bin/bkp.sh)');
        DL.syslogAdd(d, ago - 0.1, 'CRON[' + rint(2000, 9000) + ']: (CRON) info (No MTA installed, discarding output: /bin/sh: 1: /usr/local/bin/bkp.sh: not found)');
      }
    },
    // no archive in /backup yet
    nobackup: (d) => { const os = sysOf(d); for (const k of Object.keys(os.files)) if (k.indexOf('/backup/') === 0) delete os.files[k]; },
  };
  /* ---- Especialista / Tech Lead: processes, kernel and service logs, RAID, disks' health, certificates, the
     database, time, temperatures, the UPS (all created on first use, like the rest of sysOf) ---- */
  function deep(d) {
    const os = sysOf(d);
    if (!os.procs) os.procs = [
      { pid: 1, user: 'root', cpu: 0.0, mem: 0.1, cmd: '/sbin/init' }, { pid: 511, user: 'systemd-resolve', cpu: 0.0, mem: 0.1, cmd: '/lib/systemd/systemd-resolved' },
      { pid: 640, user: 'root', cpu: 0.0, mem: 0.1, cmd: 'sshd: /usr/sbin/sshd -D' }, { pid: 812, user: 'www-data', cpu: 0.3, mem: 0.4, cmd: 'nginx: worker process' },
      { pid: 901, user: 'root', cpu: 0.0, mem: 0.0, cmd: '/usr/sbin/cron -f' },
    ];
    if (!os.dmesg) os.dmesg = ['[    0.000000] Linux version 6.8.0-45-generic', '[    1.204411] EXT4-fs (sda1): mounted filesystem with ordered data mode', '[    2.871003] e1000e: eth0 NIC Link is Up 1000 Mbps Full Duplex'];
    if (!os.journal) os.journal = {};
    if (!os.raid) os.raid = { devs: { sda1: 'active', sdb1: 'active' }, spare: 'sdc1', until: 0 };
    if (!os.smart) os.smart = { sda: 'PASSED', sdb: 'PASSED', sdc: 'PASSED' };
    if (!os.cert) os.cert = { path: '/etc/letsencrypt/live/site/cert.pem', until: Date.now() + 61 * 86400000, live: true };
    if (!os.files['/etc/nginx/sites-enabled/site']) Object.assign(os.files, {
      '/etc/nginx': dirE(), '/etc/nginx/sites-enabled': dirE(), '/etc/ssh': dirE(),
      '/etc/nginx/sites-enabled/site': { mode: '644', owner: 'root', group: 'root', size: 268, text: ['server {', '    listen 80;', '    server_name ' + d.name.toLowerCase() + '.datalab.local;', '    root /var/www/html;', '}'] },
      '/etc/ssh/sshd_config': { mode: '644', owner: 'root', group: 'root', size: 3254, text: ['Port 22', 'PermitRootLogin prohibit-password', 'PasswordAuthentication no', 'UsePAM yes'] },
      '/etc/resolv.conf': { mode: '644', owner: 'root', group: 'root', size: 64, text: ['nameserver 127.0.0.53', 'options edns0 trust-ad'] },
    });
    if (os.ntp == null) os.ntp = true;
    return os;
  }
  DL.linuxDeep = deep;
  const stampNow = (ago) => stamp(ago);
  // RAID 1 of sda1 + sdb1 (a rebuild takes ~20 s of real time) → { state, devs }
  function raidState(os) {
    const r = os.raid;
    for (const k of Object.keys(r.devs)) if (r.devs[k] === 'rebuilding' && Date.now() > r.until) r.devs[k] = 'active';
    const act = Object.values(r.devs).filter((s) => s === 'active').length, reb = Object.values(r.devs).some((s) => s === 'rebuilding');
    return act >= 2 ? 'clean' : reb ? 'recovering' : 'degraded';
  }
  DL.raidState = (d) => raidState(deep(d));
  const nginxBad = (os) => { const f = os.files && os.files['/etc/nginx/sites-enabled/site']; return !!f && f.text.some((l) => /server_nmae/.test(l)); };
  DL.nginxBad = (d) => nginxBad(deep(d));
  const isGpu = (d) => { const m = DL.hwOf ? DL.hwOf(d) : null; return !!m && /gpu/i.test((m.name || '') + (m.cpu || '') + (m.tier || '')); };
  DL.isGpu = isGpu;
  // the database of a server specialised as Banco de dados (or set up by a problem)
  const dbOf = (d) => { const os = deep(d); if (!os.db && (d.svc === 'db' || os.dbReady)) os.db = { conns: 14, max: 100, restored: false }; return os.db || null; };
  DL.dbOf = dbOf;
  Object.assign(LSETUP, {
    // a report script stuck at 100% CPU
    runaway: (d) => { const os = deep(d); if (!os.procs.some((p) => p.pid === 4242)) os.procs.push({ pid: 4242, user: 'app', cpu: 99.7, mem: 2.1, cmd: 'python3 /opt/relatorios/gerar.py --todos' }); },
    // the app killed by the kernel for lack of memory
    oom: (d) => {
      const os = deep(d);
      os.services.app = 'failed';
      os.dmesg.push('[86412.551209] Out of memory: Killed process 3170 (java) total-vm:9216000kB, anon-rss:7340032kB', '[86412.551890] oom_reaper: reaped process 3170 (java), now anon-rss:0kB');
      os.journal.app = [stampNow(14) + ' ' + os.hostname + ' systemd[1]: app.service: A process of this unit has been killed by the OOM killer.', stampNow(14) + ' ' + os.hostname + ' systemd[1]: app.service: Failed with result \'oom-kill\'.'];
    },
    // one RAID disk out · one disk dying (still in the array)
    raiddeg: (d) => { const os = deep(d); os.raid = { devs: { sda1: 'active', sdb1: 'faulty' }, spare: 'sdc1', until: 0 }; os.smart.sdb = 'FAILED'; os.dmesg.push('[52211.004418] md/raid1:md0: Disk failure on sdb1, disabling device.'); },
    smartfail: (d) => { const os = deep(d); os.raid = { devs: { sda1: 'active', sdb1: 'active' }, spare: 'sdc1', until: 0 }; os.smart.sdb = 'FAILED'; },
    // the site's certificate expires in a few days
    certexp: (d, c) => { const os = deep(d); os.cert = { path: '/etc/letsencrypt/live/site/cert.pem', until: Date.now() + (c.vars.days != null ? +c.vars.days : 3 + rint(0, 4)) * 86400000 + 3600000, live: true }; },
    // a typo in the site's config: nginx doesn't come back
    nginxbroken: (d) => {
      const os = deep(d), f = os.files['/etc/nginx/sites-enabled/site'];
      os.files['/etc/nginx/sites-enabled/site.bak'] = Object.assign({}, f, { text: f.text.slice() });
      f.text[2] = '    server_nmae ' + d.name.toLowerCase() + '.datalab.local;';
      os.services.nginx = 'failed';
    },
    // a memory leak: the app eats the RAM and the server swaps
    swapleak: (d) => { const os = deep(d); os.services.app = 'active'; os.swap = 88; if (!os.procs.some((p) => p.pid === 3170)) os.procs.push({ pid: 3170, user: 'app', cpu: 34.0, mem: 91.2, cmd: 'java -jar /opt/app/app.jar' }); },
    // a GPU at 91 °C
    gpuhot: (d) => { const os = deep(d); os.gpuTemp = 91; os.gpuPl = 400; },
    // the database full of connections the app never closed
    dbconns: (d) => {
      const os = deep(d); os.dbReady = true; os.services.app = 'active';
      const db = dbOf(d); db.conns = 100;
      os.journal.app = [stampNow(6) + ' ' + os.hostname + ' app[3170]: FATAL: sorry, too many clients already', stampNow(3) + ' ' + os.hostname + ' app[3170]: FATAL: sorry, too many clients already'];
    },
    dbready: (d) => { deep(d).dbReady = true; dbOf(d); },
    // someone deleted the app's config; last night's /etc backup has it
    filedel: (d) => {
      const os = deep(d), f = os.files['/etc/app/config.env'] || { mode: '640', owner: 'root', group: 'app', size: 182, text: ['DB_HOST=10.0.1.20', 'DB_USER=app', 'DB_PASSWORD=Pr0d#Datalab2026'] };
      os.files['/backup/etc-ontem.tar.gz'] = { mode: '644', owner: 'root', group: 'root', size: 214533, from: '/etc', snap: { '/etc/app/config.env': Object.assign({}, f, { mode: '640', owner: 'root', group: 'app' }) } };
      delete os.files['/etc/app/config.env'];
      os.services.app = 'failed';
    },
    // someone left a test web server open on 8080
    rogue: (d, c) => { const os = deep(d); os.rogueUser = c.vars.who || ['marina', 'deploy', 'tiago'][rint(0, 2)]; if (!os.procs.some((p) => p.pid === 5150)) os.procs.push({ pid: 5150, user: os.rogueUser, cpu: 0.4, mem: 0.6, cmd: 'python3 -m http.server 8080' }); },
    // the clock drifted: NTP off
    clock: (d) => { const os = deep(d); os.ntp = false; os.clockOff = 17; },
    // the app failing with an error code in its journal
    apperr: (d, c) => {
      // (the database: the problem's other server when it has one)
      const os = deep(d), code = c.vars.code || 'E' + rint(4000, 4999), dbIp = c.devs && c.devs.peer ? c.devs.peer.ip : '10.0.1.20';
      os.services.app = 'active'; os.appCode = code;
      os.journal.app = [stampNow(55) + ' ' + os.hostname + ' app[3170]: INFO pedido 88121 gravado', stampNow(30) + ' ' + os.hostname + ' app[3170]: ERROR ' + code + ' timeout ao gravar no banco (' + dbIp + ':5432)', stampNow(29) + ' ' + os.hostname + ' app[3170]: WARN tentando de novo em 5s'];
    },
    // the provider's network drops packets after its second hop
    hopfail: (d) => { deep(d).hopFail = 3; },
    // a compression job scheduled every minute instead of every hour
    cronstorm: (d) => {
      const os = deep(d);
      os.cron = ['* * * * * /usr/local/bin/compacta-logs.sh'];
      os.files['/usr/local/bin/compacta-logs.sh'] = { mode: '755', owner: 'root', group: 'root', size: 96, text: ['#!/bin/bash', 'gzip -9 /var/log/app/*.log'] };
      for (let i = 0; i < 9; i++) if (!os.procs.some((p) => p.pid === 7000 + i)) os.procs.push({ pid: 7000 + i, user: 'root', cpu: 11 + rint(0, 3), mem: 0.2, cmd: 'gzip -9 /var/log/app/app-' + (i + 1) + '.log' });
    },
    // the DNS in resolv.conf is gone
    resolvbad: (d) => { deep(d).files['/etc/resolv.conf'].text = ['nameserver 10.0.1.250', 'options edns0 trust-ad']; },
    // last night's incident, in the syslog (post-mortem)
    incident: (d) => {
      const h = d.os.hostname;
      deep(d);
      DL.syslogAdd(d, 600, 'kernel: EXT4-fs warning (device sda1): ext4_end_bio: I/O error 28 writing to inode (No space left on device)');
      DL.syslogAdd(d, 590, 'nginx[812]: [emerg] write() to "/var/log/nginx/access.log" failed (28: No space left on device)');
      DL.syslogAdd(d, 589, 'systemd[1]: nginx.service: Failed with result \'exit-code\'.');
      DL.syslogAdd(d, 545, 'sudo:    admin : TTY=pts/0 ; PWD=/home/admin ; USER=root ; COMMAND=/usr/bin/journalctl --vacuum-size=200M');
      DL.syslogAdd(d, 540, 'systemd[1]: Started nginx.service - A high performance web server.');
      d.os.incidentHost = h;
    },
    // traffic from a whole network flooding the site
    ddos: (d) => { deep(d).conns = Array.from({ length: 14 }, (_, i) => '203.0.113.' + (20 + i * 13)); },
    // an intern who still has sudo
    sudoextra: (d) => { const os = deep(d); os.users.estagio = { uid: 1003, groups: ['estagio', 'sudo'], locked: false }; },
    // root can log in over SSH with a password
    sshroot: (d) => { const f = deep(d).files['/etc/ssh/sshd_config']; f.text = ['Port 22', 'PermitRootLogin yes', 'PasswordAuthentication yes', 'UsePAM yes']; },
    // the room is hot: this server's CPU temperature (°C)
    hot: (d, c) => { const os = deep(d); os.cpuTemp = c.temp || 88; os.services.app = 'active'; if (!os.procs.some((p) => p.pid === 3170)) os.procs.push({ pid: 3170, user: 'app', cpu: 96.0, mem: 22.0, cmd: 'java -jar /opt/app/relatorios.jar' }); },
    // on battery (the UPS sees the power cut)
    ups: (d, c) => { deep(d).ups = { status: 'OB DISCHRG', charge: 74, runtime: (c.vars.min || 14 + rint(0, 9)) * 60 }; },
    // the standby server got the database dump to restore
    drready: (d) => { const os = deep(d); os.dbReady = true; const db = dbOf(d); db.restored = false; os.files['/backup/app.sql'] = { mode: '640', owner: 'postgres', group: 'postgres', size: 52428800, from: 'db:app' }; },
    // the site's address (VIP) lives on this server
    vip: (d) => { const e = d.os.ifaces.eth0; if (e.ips.indexOf('10.0.1.250/24') < 0) e.ips.push('10.0.1.250/24'); },
  });
  DL.linuxSetup = function (d, name, ctx) {
    if (!d.os || (DL.isWin && DL.isWin(d))) return false;
    for (const n of [].concat(name)) if (LSETUP[n]) LSETUP[n](d, ctx || { vars: {} });
    return true;
  };

  const LOGS = { '/var/log/auth.log': authLog, '/var/log/syslog': syslog };
  // the lines of a file (null: no such file)
  const fileLines = (d, f) => (LOGS[f] ? LOGS[f](d) : f === '/etc/hostname' ? [d.os.hostname] : f === 'notas.txt' || f === '/home/admin/notas.txt' ? ['gateway da rede: 10.0.1.1', 'meu IP planejado: ' + d.ip + '/24']
    : d.os.files && d.os.files[f] && !d.os.files[f].dir ? d.os.files[f].text || [] : null);
  // words, keeping "quoted text" together
  const words = (s) => (s.match(/"[^"]*"|'[^']*'|\S+/g) || []).map((w) => w.replace(/^(["'])(.*)\1$/, '$2'));
  const unesc = (s) => s.replace(/<[^>]*>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
  // grep over lines: -i ignores case, -c counts; events grep:<src>, grep-hit:<src>, grep-failed:<src> (a "fail" search with results)
  function grepIn(lines, args, src, out, ran) {
    const flags = args.filter((x) => /^-\w+$/.test(x)).join(''), rest = args.filter((x) => !/^-\w+$/.test(x));
    const pat = rest[0];
    if (pat == null || pat === '') { out.push('uso: grep "<texto>" <arquivo>   (ou: comando | grep "<texto>")'); ran.push('error'); return; }
    const ci = flags.indexOf('i') >= 0, want = ci ? pat.toLowerCase() : pat;
    const hits = lines.filter((l) => (ci ? l.toLowerCase() : l).indexOf(want) >= 0);
    if (flags.indexOf('c') >= 0) out.push(String(hits.length));
    else for (const h of hits) out.push(esc(h));
    ran.push('grep:' + src);
    if (hits.length) { ran.push('grep-hit:' + src); if (/fail/i.test(pat)) ran.push('grep-failed:' + src); }
  }
  // "comando | grep texto" · 'echo "linha" | crontab -' (installs that line as the crontab)
  function pipe(d, left, right, ctx) {
    const w = words(right.trim());
    if (w[0] === 'sudo') w.shift();
    if (w[0] === 'crontab' && w[1] === '-') {
      const l = words(left.trim());
      if (l[0] !== 'echo') return { out: ['<span class="m">aqui o crontab - aceita só uma linha vinda do echo: echo "0 2 * * * /usr/local/bin/backup.sh" | crontab -</span>'], ran: ['error'] };
      const line = l.slice(1).join(' ');
      if (!cronOk(line)) return { out: ['"-":1: bad ' + cronBad(line), 'errors in crontab file, can\'t install.', '<span class="m">formato: minuto hora dia mês dia-da-semana comando — ex.: 0 2 * * * /usr/local/bin/backup.sh</span>'], ran: ['error'] };
      sysOf(d).cron = [line];
      return { out: [], ran: ['cron-set'] };
    }
    const r = linux(d, left, ctx);
    if (r.ran.indexOf('error') >= 0 || r.ran.indexOf('unknown') >= 0) return r;
    if (w[0] !== 'grep') return { out: ['<span class="m">aqui o | só funciona com grep depois (comando | grep "texto") ou com crontab - (echo "linha" | crontab -)</span>'], ran: r.ran.concat('error') };
    const src = (r.ran.find((e) => /^(tail|cat):/.test(e)) || 'pipe:' + left.trim().split(/\s+/)[0]).replace(/^(tail|cat):/, '');
    const out = [], ran = r.ran.slice();
    grepIn(r.out.map(unesc), w.slice(1), src, out, ran);
    return { out, ran };
  }

  // the commands of the Especialista / Tech Lead problems (true: it was one of them). redirect: { op: '<' | '>', file }
  function linuxDeep(d, c, a, root, line, ctx, out, ran, redirect) {
    const os = deep(d), deny = (msg) => { out.push(msg); out.push('<span class="m">dica: esse comando precisa de sudo na frente.</span>'); ran.push('error'); };
    const procRow = (p) => p.user.slice(0, 8).padEnd(9) + String(p.pid).padStart(6) + String(p.cpu.toFixed(1)).padStart(6) + String(p.mem.toFixed(1)).padStart(6) + '  ' + esc(p.cmd);
    switch (c) {
      case 'ps': {
        const list = os.procs.slice();
        const sort = a.find((x) => /^--sort=/.test(x));
        if (sort) list.sort((x, y) => (/mem/.test(sort) ? y.mem - x.mem : y.cpu - x.cpu));
        out.push('USER         PID  %CPU  %MEM  COMMAND', ...list.map(procRow));
        ran.push('ps');
        return true;
      }
      case 'top': {
        const load = os.procs.reduce((s, p) => s + p.cpu, 0) / 100;
        out.push('top - ' + new Date().toTimeString().slice(0, 8) + ' up 3 days,  1 user,  load average: ' + [load, load * 0.95, load * 0.9].map((x) => x.toFixed(2)).join(', '),
          'Tasks: ' + (os.procs.length + 180) + ' total,   ' + os.procs.filter((p) => p.cpu > 5).length + ' running', 'MiB Swap:   4096.0 total,  ' + Math.round(4096 * (os.swap || 0) / 100) + '.0 used', '',
          'USER         PID  %CPU  %MEM  COMMAND', ...os.procs.slice().sort((x, y) => y.cpu - x.cpu).slice(0, 10).map(procRow), '<span class="m">(no jogo o top mostra uma foto e volta ao prompt)</span>');
        ran.push('top');
        return true;
      }
      case 'kill': case 'pkill': {
        const pids = c === 'pkill' ? os.procs.filter((p) => a.some((x) => !/^-/.test(x) && p.cmd.indexOf(x) >= 0)).map((p) => p.pid) : a.filter((x) => /^\d+$/.test(x)).map(Number);
        if (!pids.length) { out.push(c === 'pkill' ? 'uso: pkill <nome do processo>' : 'uso: kill <pid>   (o PID aparece no ps aux ou no top)'); ran.push('error'); return true; }
        for (const pid of pids) {
          const p = os.procs.find((x) => x.pid === pid);
          if (!p) { out.push('kill: (' + pid + ') - No such process'); ran.push('error'); continue; }
          if (!root && p.user !== 'admin') { deny('kill: (' + pid + ') - Operation not permitted'); continue; }
          os.procs = os.procs.filter((x) => x !== p);
          if (/^nginx/.test(p.cmd)) os.services.nginx = 'failed';
          ran.push('kill:' + pid);
        }
        return true;
      }
      case 'dmesg': for (const l of os.dmesg) out.push(esc(l)); ran.push('dmesg'); return true;
      case 'mdadm': {
        // mdadm --detail /dev/md0 · mdadm [--manage] /dev/md0 --fail|--remove|--add /dev/sdX1
        const r = os.raid, st = raidState(os), act = ['--fail', '--remove', '--add'].find((x) => a.indexOf(x) >= 0), dev = act && (a[a.indexOf(act) + 1] || '').replace('/dev/', '');
        if (a.indexOf('--detail') >= 0) {
          out.push('/dev/md0:', '           Version : 1.2', '        Raid Level : raid1', '      Raid Devices : 2', '             State : ' + (st === 'clean' ? 'clean' : st === 'recovering' ? 'clean, degraded, recovering' : 'clean, degraded'), '',
            '    Number   Major   Minor   RaidDevice State', ...Object.keys(r.devs).map((k, i) => '       ' + i + '       8       ' + (i * 16 + 1) + '        ' + i + '      ' + ({ active: 'active sync', faulty: 'faulty', rebuilding: 'spare rebuilding', removed: 'removed' }[r.devs[k]]) + '   /dev/' + k));
          ran.push('mdadm-detail');
          return true;
        }
        if (!act || !dev) { out.push('uso: mdadm --detail /dev/md0 · sudo mdadm /dev/md0 --fail|--remove|--add /dev/sdX1'); ran.push('error'); return true; }
        if (!root) { deny('mdadm: must be super-user to perform this action'); return true; }
        if (act === '--fail') { if (!r.devs[dev]) { out.push('mdadm: ' + dev + ' is not part of /dev/md0'); ran.push('error'); return true; } r.devs[dev] = 'faulty'; out.push('mdadm: set /dev/' + dev + ' faulty in /dev/md0'); }
        else if (act === '--remove') {
          if (!r.devs[dev]) { out.push('mdadm: ' + dev + ' is not part of /dev/md0'); ran.push('error'); return true; }
          if (r.devs[dev] === 'active') { out.push('mdadm: hot remove failed for /dev/' + dev + ': Device or resource busy', '<span class="m">um disco ativo não sai do RAID: marque como falho antes (--fail).</span>'); ran.push('error'); return true; }
          delete r.devs[dev]; out.push('mdadm: hot removed /dev/' + dev + ' from /dev/md0');
        } else {
          if (r.devs[dev]) { out.push('mdadm: /dev/' + dev + ' is already a member of /dev/md0'); ran.push('error'); return true; }
          if (dev !== r.spare) { out.push('mdadm: cannot find /dev/' + dev + ': No such file or directory', '<span class="m">' + (r.spare ? 'o disco novo (reserva) desta máquina é o /dev/' + r.spare + '.' : 'não há outro disco reserva nesta máquina.') + '</span>'); ran.push('error'); return true; }
          if (Object.keys(r.devs).filter((k) => r.devs[k] !== 'faulty').length >= 2) { out.push('mdadm: /dev/md0 has no free slot', '<span class="m">tire o disco com defeito do RAID antes (--fail e --remove).</span>'); ran.push('error'); return true; }
          r.devs[dev] = 'rebuilding'; r.spare = null; r.until = Date.now() + 20000;
          out.push('mdadm: added /dev/' + dev);
        }
        ran.push('mdadm' + act.replace('--', '-'));
        return true;
      }
      case 'smartctl': {
        const dev = (a.find((x) => /^\/dev\/sd[a-z]$/.test(x)) || '').replace('/dev/', '');
        if (!dev || !os.smart[dev]) { out.push('uso: sudo smartctl -H /dev/sdX   (discos: sda, sdb, sdc)'); ran.push('error'); return true; }
        if (!root) { deny('Smartctl open device: /dev/' + dev + ' failed: Permission denied'); return true; }
        const ok = os.smart[dev] === 'PASSED';
        out.push('=== START OF READ SMART DATA SECTION ===', 'SMART overall-health self-assessment test result: <span class="' + (ok ? 'ok' : 'w') + '">' + os.smart[dev] + (ok ? '' : '!') + '</span>');
        if (!ok) out.push('Drive failure expected in less than 24 hours. SAVE ALL DATA.', '  5 Reallocated_Sector_Ct   0x0033   002   002   036    Pre-fail  Always   FAILING_NOW 3012');
        ran.push('smart:' + dev);
        return true;
      }
      case 'openssl': {
        if (a[0] !== 'x509' || a.indexOf('-enddate') < 0) { out.push('uso: openssl x509 -enddate -noout -in <certificado>'); ran.push('error'); return true; }
        const p = a[a.indexOf('-in') + 1];
        if (p !== os.cert.path) { out.push('Could not open file or uri for loading certificate from ' + esc(p || '')); ran.push('error'); return true; }
        out.push('notAfter=' + new Date(os.cert.until).toUTCString().replace(/^\w+, (\d+) (\w+) (\d+) (\S+) GMT$/, '$2 $1 $4 $3 GMT'));
        ran.push('cert-show');
        return true;
      }
      case 'certbot': {
        const days = Math.floor((os.cert.until - Date.now()) / 86400000);
        if (a[0] === 'certificates') {
          out.push('Found the following certs:', '  Certificate Name: site', '    Domains: ' + d.name.toLowerCase() + '.datalab.local', '    Expiry Date: ' + new Date(os.cert.until).toISOString().slice(0, 10) + ' (VALID: ' + days + ' days)', '    Certificate Path: ' + os.cert.path);
          ran.push('cert-show');
          return true;
        }
        if (a[0] !== 'renew') { out.push('uso: sudo certbot certificates · sudo certbot renew'); ran.push('error'); return true; }
        if (!root) { deny('The following error was encountered: [Errno 13] Permission denied'); return true; }
        if (days > 30) { out.push('Cert not yet due for renewal', 'No renewals were attempted.'); ran.push('cert-renew'); return true; }
        os.cert.until = Date.now() + 90 * 86400000; os.cert.live = false;
        out.push('Renewing an existing certificate for ' + d.name.toLowerCase() + '.datalab.local', 'Congratulations, all renewals succeeded:', '  ' + os.cert.path + ' (success)', '<span class="m">o nginx continua com o certificado antigo na memória até ser recarregado (systemctl reload nginx).</span>');
        ran.push('cert-renew');
        return true;
      }
      case 'nginx': {
        if (a[0] !== '-t') { out.push('<span class="m">use nginx -t para testar a configuração; o serviço é com systemctl.</span>'); ran.push('error'); return true; }
        if (nginxBad(os)) { out.push('nginx: [emerg] unknown directive "server_nmae" in /etc/nginx/sites-enabled/site:3', 'nginx: configuration file /etc/nginx/nginx.conf test failed'); ran.push('nginx-t-fail'); }
        else { out.push('nginx: the configuration file /etc/nginx/nginx.conf syntax is ok', 'nginx: configuration file /etc/nginx/nginx.conf test is successful'); ran.push('nginx-t-ok'); }
        return true;
      }
      case 'sed': {
        // sed -i 's/velho/novo/[g]' <arquivo>
        const w = words(line.trim().replace(/^sudo\s+/, '')), expr = w.find((x) => /^s(.).*\1.*\1g?$/.test(x)), p = w[w.length - 1], f = os.files[p];
        if (w.indexOf('-i') < 0 || !expr) { out.push("uso: sudo sed -i 's/texto velho/texto novo/' <arquivo>"); ran.push('error'); return true; }
        if (!f || f.dir) { out.push("sed: can't read " + esc(p) + ': No such file or directory'); ran.push('error'); return true; }
        if (!root && f.owner !== 'admin') { deny('sed: couldn\'t open temporary file ' + esc(p) + ': Permission denied'); return true; }
        const sep = expr[1], parts = expr.slice(2).split(sep), from = parts[0], to = parts[1] || '', g = parts[2] === 'g';
        let n = 0;
        f.text = f.text.map((l) => { if (l.indexOf(from) < 0) return l; n++; return g ? l.split(from).join(to) : l.replace(from, to); });
        ran.push('sed:' + p);
        if (!n) out.push('<span class="m">(nada mudou: o texto "' + esc(from) + '" não aparece no arquivo)</span>');
        return true;
      }
      case 'cp': {
        const [src, dst] = a.filter((x) => !/^-/.test(x)), f = os.files[src];
        if (!src || !dst) { out.push('uso: cp <origem> <destino>'); ran.push('error'); return true; }
        if (!f || f.dir) { out.push("cp: cannot stat '" + esc(src) + "': No such file or directory"); ran.push('error'); return true; }
        if (!root && (os.files[parentDir(dst)] || {}).owner !== 'admin') { deny("cp: cannot create regular file '" + esc(dst) + "': Permission denied"); return true; }
        os.files[dst] = Object.assign({}, f, { text: f.text ? f.text.slice() : undefined });
        ran.push('cp:' + dst);
        return true;
      }
      case 'ethtool': {
        // speed / duplex of eth0: what the switch port at the other end forces
        const D = window.DataLabDemo, t = D && D.ops ? d.path || D.ops.trace(d) : null, s = t && t.ok ? t.sw.sw : null;
        const half = !!s && s.duplex && s.duplex[t.port] === 'half', sp = s && s.speed && s.speed[t.port] ? s.speed[t.port] : 1000;
        out.push('Settings for eth0:', '	Speed: ' + sp + 'Mb/s', '	Duplex: ' + (half ? '<span class="w">Half</span>' : 'Full'), '	Auto-negotiation: ' + (half ? 'off' : 'on'), '	Link detected: ' + (os.cable ? 'yes' : 'no'));
        ran.push('ethtool');
        return true;
      }
      case 'nvidia-smi': {
        if (!isGpu(d)) { out.push('NVIDIA-SMI has failed because it couldn\'t communicate with the NVIDIA driver.', '<span class="m">(este servidor não tem GPU)</span>'); ran.push('error'); return true; }
        const pl = a.indexOf('-pl') >= 0 ? +a[a.indexOf('-pl') + 1] : null;
        if (pl) {
          if (!root) { deny('Changing power management limit is not supported for current user.'); return true; }
          if (!(pl >= 150 && pl <= 400)) { out.push('Provided power limit ' + pl + ' W is not a valid power limit (150 W a 400 W).'); ran.push('error'); return true; }
          os.gpuPl = pl; os.gpuTemp = Math.min(os.gpuTemp || 62, Math.round(48 + pl / 10));
          out.push('Power limit for GPU 00000000:3B:00.0 was set to ' + pl + '.00 W from 400.00 W.');
          ran.push('nvidia-pl');
          return true;
        }
        const temp = os.gpuTemp || 62;
        out.push('+-----------------------------------------------------------------------------+', '| GPU  Name        Temp  Perf  Pwr:Usage/Cap |  Memory-Usage   | GPU-Util |',
          '|   0  NVIDIA H100  <span class="' + (temp >= 85 ? 'w' : 'ok') + '">' + temp + 'C</span>   P0    ' + Math.round((os.gpuPl || 400) * 0.96) + 'W / ' + (os.gpuPl || 400) + 'W | 71210MiB / 81559MiB |    98%   |', '+-----------------------------------------------------------------------------+');
        ran.push('nvidia-smi');
        return true;
      }
      case 'psql': {
        const db = dbOf(d);
        if (!db) { out.push('psql: error: connection to server on socket "/var/run/postgresql/.s.PGSQL.5432" failed: No such file or directory', '<span class="m">(este servidor não tem banco de dados)</span>'); ran.push('error'); return true; }
        if (!root) { out.push('psql: error: FATAL:  role "admin" does not exist', '<span class="m">use o usuário do banco: sudo -u postgres psql …</span>'); ran.push('error'); return true; }
        if (redirect && redirect.op === '<') {
          const f = os.files[redirect.file];
          if (!f || f.from !== 'db:app') { out.push('bash: ' + esc(redirect.file) + ': No such file or directory'); ran.push('error'); return true; }
          db.restored = true;
          out.push('SET', 'CREATE TABLE', 'COPY 48213', 'CREATE INDEX', 'ALTER TABLE');
          ran.push('db-restore');
          return true;
        }
        const ci = a.indexOf('-c'), sql = ci >= 0 ? words(line).slice(words(line).indexOf('-c') + 1).join(' ').toLowerCase() : '';
        if (!sql) { out.push('<span class="m">no jogo o psql roda uma consulta por vez: sudo -u postgres psql -c "select count(*) from pg_stat_activity;"</span>'); ran.push('error'); return true; }
        if (/pg_stat_activity/.test(sql) && /count/.test(sql)) { out.push(' count ', '-------', String(db.conns).padStart(6), '(1 row)'); ran.push('db-conns'); }
        else if (/max_connections/.test(sql)) { out.push(' max_connections ', '-----------------', ' ' + db.max, '(1 row)'); ran.push('db-max'); }
        else if (/pedidos/.test(sql) && /count/.test(sql)) {
          if (!db.restored && os.dbReady && db.conns === 14 && os.files['/backup/app.sql']) { out.push('ERROR:  relation "pedidos" does not exist'); ran.push('error'); return true; }
          out.push(' count ', '-------', ' 48213', '(1 row)'); ran.push('db-rows');
        } else { out.push('<span class="m">consultas que o jogo conhece: select count(*) from pg_stat_activity · show max_connections · select count(*) from pedidos</span>'); ran.push('error'); }
        return true;
      }
      case 'pg_dump': {
        const db = dbOf(d), fi = a.indexOf('-f'), file = fi >= 0 ? a[fi + 1] : redirect && redirect.op === '>' ? redirect.file : null;
        if (!db) { out.push('pg_dump: error: connection to server failed: No such file or directory'); ran.push('error'); return true; }
        if (!root) { out.push('pg_dump: error: FATAL:  role "admin" does not exist'); ran.push('error'); return true; }
        if (!file) { out.push('uso: sudo -u postgres pg_dump app > /backup/app.sql'); ran.push('error'); return true; }
        if (!os.files[parentDir(file)]) { out.push('bash: ' + esc(file) + ': No such file or directory'); ran.push('error'); return true; }
        os.files[file] = { mode: '644', owner: 'postgres', group: 'postgres', size: 52428800, from: 'db:app' };
        ran.push('pgdump');
        return true;
      }
      case 'traceroute': {
        const host = a.find((x) => !/^-/.test(x));
        if (!host) { out.push('uso: traceroute <destino>'); ran.push('error'); return true; }
        if (!ctx.reach(d, '10.0.1.1').ok) { out.push('traceroute to ' + esc(host) + ', 30 hops max', ' 1  * * *', '<span class="m">nem o gateway respondeu: o problema é aqui dentro.</span>'); ran.push('traceroute'); return true; }
        const hops = ['10.0.1.1', '189.45.0.1', '189.45.12.66', '200.230.0.9', '142.250.79.14'];
        out.push('traceroute to ' + esc(host) + ', 30 hops max, 60 byte packets');
        for (let i = 0; i < hops.length; i++) {
          if (os.hopFail && i + 1 >= os.hopFail) { out.push(String(i + 1).padStart(2) + '  * * *'); if (i + 1 >= os.hopFail + 2) break; continue; }
          out.push(String(i + 1).padStart(2) + '  ' + hops[i] + '  ' + (1 + i * 3.4).toFixed(3) + ' ms  ' + (1.1 + i * 3.5).toFixed(3) + ' ms');
        }
        ran.push('traceroute');
        return true;
      }
      case 'timedatectl': {
        if (a[0] === 'set-ntp') {
          if (!root) { deny('Failed to set ntp: Access denied'); return true; }
          os.ntp = a[1] === 'true' || a[1] === 'yes' || a[1] === 'on'; if (os.ntp) os.clockOff = 0;
          ran.push('ntp-set');
          return true;
        }
        const now = new Date(Date.now() + (os.clockOff || 0) * 60000);
        out.push('               Local time: ' + now.toString().split(' (')[0], '           Universal time: ' + now.toUTCString(), '                Time zone: America/Sao_Paulo (-03, -0300)',
          'System clock synchronized: ' + (os.ntp ? 'yes' : '<span class="w">no</span>'), '              NTP service: ' + (os.ntp ? 'active' : '<span class="w">inactive</span>'));
        ran.push('timedatectl');
        return true;
      }
      case 'sensors': {
        // the air coming in at the front of the rack (monitor.js) heats the CPU with it
        const inlet = DL.rackTempOf && d.rack ? DL.rackTempOf(d.rack) : null;
        const t = os.cpuTemp || (inlet != null ? Math.round(inlet + 24) : 48);
        out.push('coretemp-isa-0000', 'Adapter: ISA adapter', 'Package id 0:  <span class="' + (t >= 85 ? 'w' : 'ok') + '">+' + t + '.0°C</span>  (high = +84.0°C, crit = +100.0°C)', 'Core 0:        +' + (t - 2) + '.0°C', 'Core 1:        +' + (t - 1) + '.0°C');
        if (inlet != null) {
          out.push('', 'acpitz-acpi-0', 'Adapter: ACPI interface', 'Inlet (ar de entrada):  <span class="' + (inlet > 31 ? 'w' : 'ok') + '">+' + inlet.toFixed(1) + '°C</span>  (high = +31.0°C)');
          if (inlet > 31) out.push('<span class="m">dica: o ar que entra pela frente do ' + esc(d.rack.id) + ' está quente demais. Não se resolve no terminal: falta ar de precisão na sala, o ar está sem manutenção ou os cabos bloqueiam o fluxo. Veja Monitor → Investigar.</span>');
        }
        ran.push('sensors');
        return true;
      }
      case 'upsc': {
        if (!os.ups) { out.push('Error: Driver not connected', '<span class="m">(nenhum nobreak ligado neste servidor)</span>'); ran.push('error'); return true; }
        out.push('battery.charge: ' + os.ups.charge, 'battery.runtime: ' + os.ups.runtime, 'input.voltage: 0.0', 'ups.load: 61', 'ups.status: ' + os.ups.status);
        ran.push('upsc');
        return true;
      }
      case 'gpasswd': {
        // gpasswd -d <usuário> <grupo>: takes someone out of a group
        const u = a[1], g = a[2], x = os.users[u];
        if (a[0] !== '-d' || !u || !g) { out.push('uso: sudo gpasswd -d <usuário> <grupo>'); ran.push('error'); return true; }
        if (!root) { deny('gpasswd: Permission denied.'); return true; }
        if (!x || x.groups.indexOf(g) < 0) { out.push('gpasswd: user \'' + esc(u) + '\' is not a member of \'' + esc(g) + '\''); ran.push('error'); return true; }
        x.groups = x.groups.filter((y) => y !== g);
        out.push('Removing user ' + esc(u) + ' from group ' + esc(g));
        ran.push('gpasswd:' + u);
        return true;
      }
    }
    return false;
  }

  // Linux shell. Returns { out: [lines], ran: [events] }.
  function linux(d, line, ctx) {
    const bar = line.indexOf('|');
    if (bar >= 0) return pipe(d, line.slice(0, bar), line.slice(bar + 1), ctx);
    // "< arquivo" / "> arquivo" (the database commands read and write files this way)
    let redirect = null;
    const rm = /^(.*?)\s*([<>])\s*(\S+)\s*$/.exec(line);
    if (rm && /\b(psql|pg_dump)\b/.test(rm[1])) { redirect = { op: rm[2], file: rm[3] }; line = rm[1]; }
    const os = d.os, out = [], ran = [];
    let t = line.trim().split(/\s+/).filter(Boolean);
    if (!t.length) return { out, ran };
    let root = false;
    if (t[0] === 'sudo') { root = true; t = t.slice(1); if (!t.length) return { out: ['uso: sudo <comando>'], ran }; }
    // sudo -u <usuário> <comando> (the database's own user: postgres)
    if (root && t[0] === '-u') { t = t.slice(2); if (!t.length) return { out: ['uso: sudo -u <usuário> <comando>'], ran }; }
    const deny = (msg) => { out.push(msg); out.push('<span class="m">dica: comandos que alteram o sistema precisam de sudo na frente.</span>'); ran.push('error'); };
    const c = t[0], a = t.slice(1);
    const e0 = os.ifaces.eth0;
    switch (c) {
      case 'help':
        if (a[0]) {
          const k = Object.keys(HELP).find((x) => HELP[x].cmd.split(' ')[0] === a[0] || HELP[x].cmd.indexOf(a.join(' ')) === 0 || HELP[x].cmd.indexOf('sudo ' + a.join(' ')) === 0);
          if (k) { const h = HELP[k]; out.push('<b>' + esc(h.cmd) + '</b>', h.what, 'exemplo: ' + esc(h.ex)); }
          else out.push('sem ajuda para "' + esc(a[0]) + '". Use o botão Precisa de ajuda?');
        } else {
          out.push('comandos disponíveis:', '  ip addr | ip link | ip route     ping -c 3 <destino>', '  systemctl status|restart <serviço>   curl localhost', '  df -h   du -sh <pasta>   journalctl --vacuum-size=200M', '  hostname   hostnamectl set-hostname <nome>', '  uptime  whoami  uname -a  date  history  clear  exit', '  lscpu  nproc  free -h   (hardware do servidor)', '  tail -n 20 <arquivo>   grep "<texto>" <arquivo>   cat <arquivo>   (logs em /var/log)', '  ss -tlnp   (portas em escuta)', '  ufw status|enable|allow <porta>|deny from <ip>   (firewall)',
            '  ls -l <pasta>  chmod <modo> <arquivo>  chown <usuário>:<grupo> <arquivo>', '  useradd  usermod -aG  passwd -l  id <usuário>   (contas)',
            '  apt update | apt list --upgradable | apt upgrade | apt install <pacote>', '  tar czf <arquivo> <pasta>  rsync -a <origem> <destino>  crontab -l  echo "linha" | crontab -',
            '  sudo <comando> executa como administrador', 'detalhes: help <comando>  ·  ou o botão Precisa de ajuda?');
        }
        break;
      case 'clear': ctx.clear(); break;
      case 'exit': case 'logout': ctx.close(); break;
      case 'history': ctx.history.forEach((h, i) => out.push(String(i + 1).padStart(4) + '  ' + esc(h))); break;
      case 'whoami': out.push(root ? 'root' : 'admin'); break;
      case 'hostname': out.push(os.hostname); ran.push('hostname-show:' + os.hostname); break;
      case 'hostnamectl':
        if (a[0] === 'set-hostname' && a[1]) {
          if (!root) { deny('Could not set hostname: Access denied'); break; }
          os.hostname = a[1];
          ran.push('hostname');
        } else { out.push('   Static hostname: ' + os.hostname, '  Operating System: Ubuntu 24.04 LTS', '            Kernel: Linux 6.8.0-45-generic'); ran.push('hostname-show:' + os.hostname); }
        break;
      case 'lscpu': case 'nproc': case 'free': {
        // the hardware of this server's model (hardware.js)
        const m = DL.hwOf ? DL.hwOf(d) : null;
        if (!m || m.cores == null) { out.push(c + ': informação indisponível'); break; }
        if (c === 'nproc') out.push(String(m.threads));
        else if (c === 'free') {
          const used = Math.max(1, Math.round(m.ram * 0.31));
          out.push('               total        used        free', 'Mem:     ' + String(DL.hwFmt.ram(m.ram)).padStart(10) + String(used + ' GB').padStart(12) + String(DL.hwFmt.ram(m.ram - used)).padStart(12));
        } else out.push('Model name:        ' + esc(m.cpu), 'Socket(s):         ' + m.sockets, 'Core(s) total:     ' + m.cores, 'Thread(s):         ' + m.threads, 'CPU max MHz:       ' + Math.round(m.ghz * 1000), 'Mem:               ' + DL.hwFmt.ram(m.ram), 'Disk:              ' + esc(m.disk), 'NIC eth0:          ' + DL.hwFmt.gb(m.nic));
        break;
      }
      case 'uname': out.push(a[0] === '-a' ? 'Linux ' + os.hostname + ' 6.8.0-45-generic #45-Ubuntu SMP x86_64 GNU/Linux' : 'Linux'); break;
      case 'date': out.push(new Date().toString().split(' (')[0]); break;
      case 'uptime': {
        // like the real one: "up 42 min", "up 3:25", "up 2 days, 3:25"
        const m = Math.max(1, Math.round((Date.now() - os.boot) / 60000)), days = Math.floor(m / 1440), hm = Math.floor((m % 1440) / 60) + ':' + String(m % 60).padStart(2, '0');
        const up = m < 60 ? m + ' min' : (days ? days + (days > 1 ? ' days, ' : ' day, ') : '') + (m % 1440 < 60 ? (m % 60) + ' min' : hm);
        // the load: what the processes use (1.00 = one core busy)
        const ld = Math.max(0.08, deep(d).procs.reduce((s, p) => s + p.cpu, 0) / 100);
        out.push(' ' + new Date().toTimeString().slice(0, 8) + ' up ' + up + ',  1 user,  load average: ' + [ld, ld * 0.96, ld * 0.9].map((x) => x.toFixed(2)).join(', '));
        break;
      }
      case 'pwd': out.push('/home/admin'); break;
      case 'ls': {
        // ls [-l] [caminho]: the folders of the model (sysOf) in detail; the logs and the home folder as before
        const fs = sysOf(d).files, long = a.some((x) => /^-\w*l/.test(x)), p = (a.find((x) => !/^-/.test(x)) || '/home/admin').replace(/(.)\/$/, '$1');
        if (p === '/var/log') { out.push('apt  journal  nginx  syslog  auth.log'); ran.push('ls:' + p); break; }
        const f = fs[p];
        if (!f) { out.push("ls: cannot access '" + esc(p) + "': No such file or directory"); ran.push('error'); break; }
        const kids = f.dir ? Object.keys(fs).filter((k) => k !== p && parentDir(k) === p).sort() : [p];
        const name = (k) => k.split('/').pop();
        if (!long) out.push(kids.map(name).join('  ') || '');
        else {
          if (f.dir) out.push('total ' + kids.length * 4);
          for (const k of kids) { const x = fs[k]; out.push(permStr(x) + ' 1 ' + x.owner.padEnd(8) + ' ' + x.group.padEnd(8) + ' ' + String(x.dir ? 4096 : x.size || 0).padStart(6) + ' Oct 30 09:12 ' + esc(f.dir ? name(k) : k)); }
        }
        ran.push('ls:' + p);
        if (long) ran.push('ls-l:' + p);
        break;
      }
      case 'cat': {
        if (a[0] === '/proc/mdstat') {
          const o = deep(d), r = o.raid, st = raidState(o), ks = Object.keys(r.devs).filter((k) => r.devs[k] !== 'removed');
          out.push('Personalities : [raid1]', 'md0 : active raid1 ' + ks.map((k, i) => k + '[' + i + ']' + (r.devs[k] === 'faulty' ? '(F)' : r.devs[k] === 'rebuilding' ? '(S)' : '')).join(' '),
            '      976630464 blocks super 1.2 [2/' + ks.filter((k) => r.devs[k] === 'active').length + '] [' + (ks.filter((k) => r.devs[k] === 'active').length >= 2 ? 'UU' : 'U_') + ']');
          if (st === 'recovering') out.push('      [====>................]  recovery = ' + Math.max(5, Math.min(99, Math.round(100 - (r.until - Date.now()) / 200))) + '.0% finish=0.' + Math.max(1, Math.round((r.until - Date.now()) / 1000)) + 'min');
          out.push('', 'unused devices: &lt;none&gt;');
          ran.push('cat:/proc/mdstat', 'mdstat');
          break;
        }
        const fx = deep(d).files[a[0]];
        if (fx && !fx.dir && !can(os, fx, root ? 'root' : 'admin', 4)) { out.push('cat: ' + esc(a[0]) + ': Permission denied', '<span class="m">(ls -l mostra quem pode ler; como administrador, sudo cat lê mesmo assim)</span>'); ran.push('error'); break; }
        const lines = a[0] ? fileLines(d, a[0]) : null;
        if (!lines) { out.push('cat: ' + esc(a[0] || '') + ': Arquivo ou diretório inexistente'); ran.push('error'); break; }
        for (const l of lines) out.push(esc(l));
        ran.push('cat:' + a[0]);
        break;
      }
      case 'tail': {
        // tail [-n N | -N] <arquivo>
        const f = a.filter((x, i) => !/^-/.test(x) && a[i - 1] !== '-n').pop();
        const ni = a.indexOf('-n'), short = a.find((x) => /^-\d+$/.test(x));
        const n = Math.max(1, Math.min(200, ni >= 0 ? parseInt(a[ni + 1], 10) || 10 : short ? parseInt(short.slice(1), 10) : 10));
        if (a.indexOf('-f') >= 0) out.push('<span class="m">(-f fica seguindo o arquivo sem parar; aqui ele mostra só o fim)</span>');
        const lines = f ? fileLines(d, f) : null;
        if (!lines) { out.push(f ? "tail: cannot open '" + esc(f) + "' for reading: No such file or directory" : 'uso: tail -n 20 <arquivo>'); ran.push('error'); break; }
        for (const l of lines.slice(-n)) out.push(esc(l));
        ran.push('tail:' + f);
        break;
      }
      case 'grep': {
        // grep [-i] [-c] "<texto>" <arquivo> (the text may have spaces when quoted)
        const w = words(line.trim().replace(/^sudo\s+/, '')).slice(1);
        const f = w.filter((x) => !/^-\w+$/.test(x))[1];
        const lines = f ? fileLines(d, f) : null;
        if (!f) { out.push('uso: grep "<texto>" <arquivo>   (ou: comando | grep "<texto>")'); ran.push('error'); break; }
        if (!lines) { out.push('grep: ' + esc(f) + ': Arquivo ou diretório inexistente'); ran.push('error'); break; }
        grepIn(lines, w.filter((x) => x !== f), f, out, ran);
        break;
      }
      case 'ss': case 'netstat': {
        // ss -tlnp: TCP ports listening (-t TCP · -l listening · -n numbers · -p process, which needs root)
        const flags = a.filter((x) => /^-/.test(x)).join('').replace(/-/g, '');
        if (flags.indexOf('l') < 0) {
          out.push('<span class="m">sem -l aparecem só as conexões abertas; para as portas em escuta: ss -tlnp</span>');
          out.push('State  Recv-Q Send-Q  Local Address:Port   Peer Address:Port');
          out.push('ESTAB  0      0       ' + ipOnly(e0.ips[0] || '10.0.1.10/24') + ':22      10.0.1.' + rint(50, 60) + ':' + rint(40000, 60000));
          // a flood of connections to the site (setup ddos)
          for (const ip of deep(d).conns || []) for (let k = 0; k < 3; k++) out.push('ESTAB  0      0       ' + ipOnly(e0.ips[0] || '10.0.1.10/24') + ':80      ' + ip + ':' + rint(30000, 65000));
          ran.push('ss-conn');
          break;
        }
        const procs = flags.indexOf('p') >= 0 && root;
        const rows = [];
        if (os.services.ssh === 'active') rows.push(['0.0.0.0:22', 'sshd', 640, 3, 128]);
        if (os.services.nginx === 'active') rows.push(['0.0.0.0:80', 'nginx', 812, 6, 511]);
        // a process someone left listening (setup rogue)
        if (deep(d).procs.some((p) => p.pid === 5150)) rows.push(['0.0.0.0:8080', 'python3', 5150, 3, 5]);
        rows.push(['127.0.0.53%lo:53', 'systemd-resolve', 511, 14, 4096]);
        if (c === 'ss') {
          out.push('State   Recv-Q  Send-Q  Local Address:Port      Peer Address:Port  Process');
          for (const [addr, name, pid, fd, q] of rows) out.push('LISTEN  0       ' + String(q).padEnd(8) + addr.padEnd(24) + '0.0.0.0:*          ' + (procs ? esc('users:(("' + name + '",pid=' + pid + ',fd=' + fd + '))') : ''));
        } else {
          out.push('Proto Recv-Q Send-Q Local Address           Foreign Address         State       PID/Program name');
          for (const [addr, name, pid] of rows) out.push('tcp        0      0 ' + addr.replace('%lo', '').padEnd(24) + '0.0.0.0:*               LISTEN      ' + (procs ? pid + '/' + name : '-'));
        }
        if (flags.indexOf('p') >= 0 && !root) out.push('<span class="m">(sem sudo, o ' + c + ' não mostra o processo de cada porta: sudo ' + esc(line.trim()) + ')</span>');
        ran.push('ss');
        if (procs) ran.push('ss-procs');
        break;
      }
      case 'ip': {
        const sub = a[0] || '';
        const isAddr = /^a(d(d(r(e(s(s)?)?)?)?)?)?$/.test(sub), isLink = /^l(i(n(k)?)?)?$/.test(sub), isRoute = /^r(o(u(t(e)?)?)?)?$/.test(sub);
        if (isAddr && (a[1] === 'add' || a[1] === 'del')) {
          const cidr = a[2], dev = a[a.indexOf('dev') + 1];
          if (!cidr || a.indexOf('dev') < 0 || !dev) { out.push('uso: ip addr ' + a[1] + ' <ip>/<máscara> dev <interface>'); ran.push('error'); break; }
          if (!/^\d+\.\d+\.\d+\.\d+\/\d+$/.test(cidr)) { out.push('Error: any valid prefix is expected rather than "' + esc(cidr) + '".'); ran.push('error'); break; }
          if (!os.ifaces[dev]) { out.push('Cannot find device "' + esc(dev) + '"'); ran.push('error'); break; }
          if (!root) { deny('RTNETLINK answers: Operation not permitted'); break; }
          const ips = os.ifaces[dev].ips;
          if (a[1] === 'add') { if (ips.indexOf(cidr) >= 0) { out.push('RTNETLINK answers: File exists'); break; } ips.push(cidr); }
          else { const i = ips.indexOf(cidr); if (i < 0) { out.push('RTNETLINK answers: Cannot assign requested address'); break; } ips.splice(i, 1); }
          ran.push('ip-set');
        } else if (isAddr || sub === '' || sub === '-br') {
          let n = 1;
          for (const [name, f] of Object.entries(os.ifaces)) {
            const st = f.up ? (name === 'lo' ? 'UNKNOWN' : os.cable ? 'UP' : 'DOWN') : 'DOWN';
            const flags = name === 'lo' ? ['LOOPBACK'] : (f.up && !os.cable ? ['NO-CARRIER'] : []).concat(['BROADCAST', 'MULTICAST']);
            if (f.up) flags.push('UP');
            if (f.up && (os.cable || name === 'lo')) flags.push('LOWER_UP');
            out.push(n++ + ': ' + name + ': &lt;' + flags.join(',') + '&gt; mtu ' + (name === 'lo' ? 65536 : 1500) + ' state <span class="' + (st === 'DOWN' ? 'w' : 'ok') + '">' + st + '</span>');
            out.push('    link/' + (name === 'lo' ? 'loopback' : 'ether') + ' ' + f.mac);
            for (const ip of f.ips) out.push('    inet ' + ip + ' scope ' + (name === 'lo' ? 'host' : 'global') + ' ' + name);
          }
          ran.push('ip-show');
        } else if (isLink && a[1] === 'set') {
          const dev = a[2], st = a[3];
          if (!os.ifaces[dev] || (st !== 'up' && st !== 'down')) { out.push('uso: ip link set <interface> up|down'); ran.push('error'); break; }
          if (!root) { deny('RTNETLINK answers: Operation not permitted'); break; }
          os.ifaces[dev].up = st === 'up';
          ran.push('link-set');
          if (st === 'up' && dev === 'eth0' && !os.cable) out.push('<span class="m">(a interface subiu, mas não há cabo: o link continua DOWN)</span>');
        } else if (isLink && a.indexOf('-s') >= 0 || sub === '-s') {
          // ip -s link: packet counters (a half-duplex port on the switch makes the errors pile up)
          const D = window.DataLabDemo, tr = D && D.ops ? d.path || D.ops.trace(d) : null, s = tr && tr.ok ? tr.sw.sw : null;
          const errs = s && s.duplex && s.duplex[tr.port] === 'half' ? 4812 + Math.floor((Date.now() / 1000) % 600) * 7 : 0;
          out.push('2: eth0: &lt;BROADCAST,MULTICAST,UP,LOWER_UP&gt; mtu 1500 state ' + (e0.up && os.cable ? 'UP' : 'DOWN'), '    RX:  bytes  packets  errors  dropped', '    9184412   71203   <span class="' + (errs ? 'w' : 'ok') + '">' + String(errs).padStart(6) + '</span>       0', '    TX:  bytes  packets  errors  dropped  collisions', '    6618201   52110        0       0   ' + String(Math.round(errs / 3)).padStart(6));
          ran.push('ip-stats');
        } else if (isLink) {
          let n = 1;
          for (const [name, f] of Object.entries(os.ifaces)) {
            const st = f.up ? (name === 'lo' ? 'UNKNOWN' : os.cable ? 'UP' : 'DOWN') : 'DOWN';
            const nc = name === 'eth0' && f.up && !os.cable ? ' <span class="w">NO-CARRIER</span>' : '';
            out.push(n++ + ': ' + name + ':' + nc + ' mtu ' + (name === 'lo' ? 65536 : 1500) + ' state <span class="' + (st === 'DOWN' ? 'w' : 'ok') + '">' + st + '</span>');
          }
          ran.push('link-show');
        } else if (isRoute && a[1] === 'add') {
          const via = a[a.indexOf('via') + 1];
          if (a[2] !== 'default' || a.indexOf('via') < 0 || !via) { out.push('uso: ip route add default via <gateway>'); ran.push('error'); break; }
          if (!root) { deny('RTNETLINK answers: Operation not permitted'); break; }
          if (!e0.ips.some((ip) => sameNet(ipOnly(ip), via))) { out.push('Error: Nexthop has invalid gateway.'); out.push('<span class="m">(o gateway precisa estar na mesma rede de um IP da interface)</span>'); ran.push('error'); break; }
          if (os.route) { out.push('RTNETLINK answers: File exists'); break; }
          os.route = via;
          ran.push('route-set');
        } else if (isRoute && a[1] === 'del') {
          if (!root) { deny('RTNETLINK answers: Operation not permitted'); break; }
          os.route = null;
        } else if (isRoute) {
          if (os.route) out.push('default via ' + os.route + ' dev eth0');
          for (const ip of e0.ips) out.push(ipOnly(ip).split('.').slice(0, 3).join('.') + '.0/24 dev eth0 proto kernel scope link src ' + ipOnly(ip));
          if (!os.route && !e0.ips.length) out.push('<span class="m">(tabela vazia)</span>');
          ran.push('route-show');
        } else { out.push('Object "' + esc(sub) + '" is unknown, try "ip help".'); ran.push('error'); }
        break;
      }
      case 'ping': {
        const host = a.filter((x) => !/^-/.test(x) && !/^\d+$/.test(x) || /\./.test(x)).pop();
        const ci = a.indexOf('-c'), n = ci >= 0 ? Math.min(6, parseInt(a[ci + 1], 10) || 3) : 4;
        if (!host) { out.push('ping: uso: ping -c 3 <destino>'); ran.push('error'); break; }
        // a name: asked to the DNS in /etc/resolv.conf (127.0.0.53, the local resolver, or a server that answers)
        if (/[a-z]/i.test(host) && host !== 'localhost') {
          const ns = ((deep(d).files['/etc/resolv.conf'].text.find((l) => /^nameserver /.test(l)) || '').split(/\s+/)[1]) || '';
          const D = window.DataLabDemo, srv = D && D.ops ? D.ops.devices().find((x) => x.ip === ns) : null;
          const dnsUp = ns === '127.0.0.53' || ((ns === '8.8.8.8' || ns === '1.1.1.1' || (srv && (srv.svc === 'dns' || (DL.isWin && DL.isWin(srv))))) && ctx.reach(d, ns).ok);
          if (!dnsUp) { out.push('ping: ' + esc(host) + ': Temporary failure in name resolution'); ran.push('error', 'ping-dnsfail'); break; }
          const r2 = ctx.reach(d, '8.8.8.8');
          if (!r2.ok) { out.push('ping: connect: Network is unreachable'); ran.push('ping-fail'); break; }
          out.push('PING ' + esc(host) + ' (142.250.79.14) 56(84) bytes of data.', '64 bytes from 142.250.79.14: icmp_seq=1 ttl=117 time=12.4 ms', '<span class="ok">1 packets transmitted, 1 received, 0% packet loss</span>');
          ran.push('ping-ok:' + host, 'dns-ok');
          break;
        }
        const reach = ctx.reach(d, host);
        out.push('PING ' + esc(host) + ' 56(84) bytes of data.');
        if (reach.ok) {
          for (let i = 1; i <= n; i++) out.push('64 bytes from ' + esc(host) + ': icmp_seq=' + i + ' ttl=64 time=' + (0.3 + Math.random() * 0.6).toFixed(2) + ' ms');
          out.push('', '--- ' + esc(host) + ' ping statistics ---', '<span class="ok">' + n + ' packets transmitted, ' + n + ' received, 0% packet loss</span>');
          ran.push('ping-ok:' + host);
        } else {
          out.push(reach.msg ? '<span class="w">' + reach.msg + '</span>' : '', '--- ' + esc(host) + ' ping statistics ---', '<span class="w">' + n + ' packets transmitted, 0 received, 100% packet loss</span>');
          if (reach.hint) out.push('<span class="m">' + reach.hint + '</span>');
          ran.push('ping-fail');
        }
        break;
      }
      case 'systemctl': {
        const verb = a[0], svc = (a[1] || '').replace(/\.service$/, '');
        if (!verb || (verb !== 'list-units' && !svc)) { out.push('uso: systemctl status|start|stop|restart <serviço>'); ran.push('error'); break; }
        if (verb === 'list-units') { for (const [k, v] of Object.entries(os.services)) out.push(k + '.service  loaded ' + v); break; }
        if (!(svc in os.services)) { out.push('Unit ' + esc(svc) + '.service could not be found.'); ran.push('error'); break; }
        if (verb === 'status') {
          const st = os.services[svc];
          out.push('● ' + svc + '.service - ' + ({ nginx: 'A high performance web server', ssh: 'OpenBSD Secure Shell server', fail2ban: 'Fail2Ban Service', app: 'Aplicação de pedidos (Java)' }[svc] || svc));
          out.push('     Loaded: loaded (/lib/systemd/system/' + svc + '.service; enabled)');
          out.push('     Active: <span class="' + (st === 'active' ? 'ok' : 'w') + '">' + (st === 'active' ? 'active (running)' : st === 'failed' ? 'failed (Result: exit-code)' : 'inactive (dead)') + '</span>');
          if (st === 'failed') out.push('<span class="m">     ' + svc + '[812]: ' + (svc === 'nginx' && os.disk >= 95 ? '[emerg] write() to "/var/log/nginx/access.log" failed (28: No space left on device)' : 'worker process exited on signal 9') + '</span>');
          ran.push('status:' + svc);
        } else if (verb === 'restart' || verb === 'start' || verb === 'stop' || verb === 'reload') {
          if (!root) { deny('Failed to ' + verb + ' ' + svc + '.service: Access denied'); break; }
          // a config error keeps nginx down (nginx -t shows the line)
          if (verb !== 'stop' && svc === 'nginx' && nginxBad(deep(d))) {
            os.services.nginx = 'failed';
            out.push('<span class="w">Job for nginx.service failed because the control process exited with error code.</span>', '<span class="m">See "systemctl status nginx.service" and "nginx -t" for details.</span>');
            ran.push('error');
            break;
          }
          if (verb === 'reload') {
            if (os.services[svc] !== 'active') { out.push('nginx.service is not active, cannot reload.'); ran.push('error'); break; }
            if (svc === 'nginx' && os.cert) os.cert.live = true;
            ran.push('svc-reload:' + svc);
            break;
          }
          if (svc === 'nginx' && verb !== 'stop' && os.cert) os.cert.live = true;
          // nginx can't open its logs on a full disk: it only comes back after space is freed
          if (verb !== 'stop' && svc === 'nginx' && os.disk >= 95) {
            os.services.nginx = 'failed';
            out.push('<span class="w">Job for nginx.service failed because the control process exited with error code.</span>', '<span class="m">See "systemctl status nginx.service" and "df -h" for details.</span>');
            ran.push('error');
            break;
          }
          // the app (Especialista problems): it needs its config file; a restart frees the memory it leaked and the
          // database connections it held; stopping it cools a hot server down
          if (svc === 'app') {
            const o = deep(d);
            if (verb !== 'stop' && !o.files['/etc/app/config.env']) {
              os.services.app = 'failed';
              out.push('<span class="w">Job for app.service failed because the control process exited with error code.</span>', '<span class="m">See "journalctl -u app" for details.</span>');
              o.journal.app = (o.journal.app || []).concat(stamp(0) + ' ' + os.hostname + ' app[3201]: FATAL /etc/app/config.env: No such file or directory');
              ran.push('error');
              break;
            }
            if (verb !== 'stop') { if (o.db) o.db.conns = 14; o.swap = 6; const j = o.procs.find((p) => p.pid === 3170); if (j) { j.mem = 18.4; j.cpu = 3.1; } }
            else { o.procs = o.procs.filter((p) => p.pid !== 3170); if (o.cpuTemp) o.cpuTemp = Math.min(o.cpuTemp, 66); }
          }
          os.services[svc] = verb === 'stop' ? 'inactive' : 'active';
          // an nginx updated by apt only runs the new version after a restart
          if (svc === 'nginx' && verb !== 'stop') os.nginxStale = false;
          ran.push('svc-' + verb + ':' + svc);
        } else { out.push('Unknown command verb ' + esc(verb) + '.'); ran.push('error'); }
        break;
      }
      case 'curl': {
        const url = a.find((x) => !/^-/.test(x)) || '';
        if (!url) { out.push('curl: try "curl localhost"'); ran.push('error'); break; }
        if (/localhost|127\.0\.0\.1/.test(url)) {
          if (os.services.nginx === 'active') { out.push('&lt;!doctype html&gt;&lt;title&gt;' + esc(d.name) + '&lt;/title&gt;&lt;h1&gt;ok&lt;/h1&gt;'); ran.push('curl-ok'); }
          else { out.push('<span class="w">curl: (7) Failed to connect to localhost port 80: Connection refused</span>'); ran.push('curl-fail'); }
        } else out.push('<span class="w">curl: (6) Could not resolve host: ' + esc(url) + '</span>');
        break;
      }
      case 'df': {
        const used = Math.round(os.disk), sz = 100;
        out.push('Filesystem      Size  Used Avail Use% Mounted on', '/dev/sda1        ' + sz + 'G   ' + String(used).padStart(2) + 'G   ' + String(sz - used).padStart(2) + 'G  <span class="' + (used >= 90 ? 'w' : 'ok') + '">' + used + '%</span> /', 'tmpfs           3.9G     0  3.9G   0% /dev/shm');
        ran.push('df');
        if (used < 80) ran.push('df-ok');
        break;
      }
      case 'du': {
        const p = a.find((x) => !/^-/.test(x)) || '.';
        const big = os.disk >= 80;
        if (/^\/var\/log\/?$/.test(p)) { out.push((big ? '58G' : '1.2G') + '\t/var/log'); ran.push('du:/var/log'); }
        else if (/^\/var\/log\/journal\/?$/.test(p)) out.push((big ? '57G' : '0.2G') + '\t/var/log/journal');
        else out.push('12K\t' + esc(p));
        break;
      }
      case 'journalctl': {
        // journalctl -u <serviço> [--since …]: that service's log
        if (a.indexOf('-u') >= 0) {
          const svc = (a[a.indexOf('-u') + 1] || '').replace(/\.service$/, ''), j = deep(d).journal[svc];
          if (!svc) { out.push('uso: journalctl -u <serviço> --since "1 hour ago"'); ran.push('error'); break; }
          out.push('-- Logs begin at ' + new Date(Date.now() - 86400000).toDateString() + ' --');
          for (const l of j || [stamp(120) + ' ' + os.hostname + ' systemd[1]: Started ' + svc + '.service.']) out.push(esc(l));
          ran.push('journal:' + svc);
          break;
        }
        const v = a.find((x) => x.indexOf('--vacuum-size=') === 0);
        if (!v) { out.push('-- Logs begin at ' + new Date().toDateString() + ' --', '... (use --vacuum-size=200M para limpar logs antigos)'); break; }
        if (!root) { deny('Failed to open journal directory: Permission denied'); break; }
        const freed = Math.max(0, os.disk - 42);
        os.disk = Math.min(os.disk, 42);
        out.push('Vacuuming done, freed ' + Math.round(freed) + '.0G of archived journals from /var/log/journal.');
        ran.push('vacuum');
        break;
      }
      case 'echo': out.push(esc(words(line.trim().replace(/^sudo\s+/, '')).slice(1).join(' '))); break;
      case 'chmod': {
        // numeric modes only (640, 755…)
        const fs = sysOf(d).files, m = a.find((x) => /^[0-7]{3}$/.test(x)), p = a[a.length - 1], f = fs[p];
        if (!m || a.length < 2) { out.push('uso: chmod <modo> <arquivo>   (ex.: chmod 640 /etc/app/config.env)'); ran.push('error'); break; }
        if (!f) { out.push("chmod: cannot access '" + esc(p) + "': No such file or directory"); ran.push('error'); break; }
        if (!root && f.owner !== 'admin') { deny("chmod: changing permissions of '" + esc(p) + "': Operation not permitted"); break; }
        f.mode = m;
        ran.push('chmod:' + p);
        break;
      }
      case 'chown': {
        const fs = sysOf(d).files, spec = a[0] || '', p = a[1], f = fs[p];
        const [u, g] = spec.split(':');
        if (!spec || !p) { out.push('uso: chown <usuário>[:<grupo>] <arquivo>'); ran.push('error'); break; }
        if (!f) { out.push("chown: cannot access '" + esc(p) + "': No such file or directory"); ran.push('error'); break; }
        if (!root) { deny("chown: changing ownership of '" + esc(p) + "': Operation not permitted"); break; }
        if (u && !os.users[u]) { out.push("chown: invalid user: '" + esc(spec) + "'"); ran.push('error'); break; }
        if (g && os.groups[g] == null) { out.push("chown: invalid group: '" + esc(spec) + "'"); ran.push('error'); break; }
        if (u) f.owner = u;
        if (g) f.group = g;
        ran.push('chown:' + p);
        break;
      }
      case 'id': case 'groups': {
        const sys = sysOf(d), u = a[0] || (root ? 'root' : 'admin'), x = sys.users[u];
        if (!x) { out.push(c + ": '" + esc(u) + "': no such user"); ran.push('error'); break; }
        const gid = (g) => (sys.groups[g] != null ? sys.groups[g] : x.uid);
        out.push(c === 'groups' ? u + ' : ' + x.groups.join(' ') : 'uid=' + x.uid + '(' + u + ') gid=' + gid(x.groups[0]) + '(' + x.groups[0] + ') groups=' + x.groups.map((g) => gid(g) + '(' + g + ')').join(','));
        ran.push('id:' + u);
        break;
      }
      case 'useradd': {
        // useradd [-m] [-s shell] [-G g1,g2] <nome>
        const sys = sysOf(d), gi = a.indexOf('-G'), name = a.filter((x, i) => !/^-/.test(x) && !/^-(s|G)$/.test(a[i - 1] || '')).pop();
        if (!name) { out.push('uso: useradd -m -s /bin/bash [-G grupo] <nome>'); ran.push('error'); break; }
        if (!root) { deny('useradd: Permission denied.'); break; }
        if (sys.users[name]) { out.push("useradd: user '" + esc(name) + "' already exists"); ran.push('error'); break; }
        const extra = gi >= 0 && a[gi + 1] ? a[gi + 1].split(',') : [];
        const badG = extra.find((g) => sys.groups[g] == null);
        if (badG) { out.push("useradd: group '" + esc(badG) + "' does not exist"); ran.push('error'); break; }
        // the next free number for both the account and its own group
        const uid = Math.max(1000, ...Object.values(sys.users).map((x) => x.uid), ...Object.values(sys.groups)) + 1;
        sys.groups[name] = uid;
        sys.users[name] = { uid, groups: [name].concat(extra), locked: false };
        if (a.indexOf('-m') >= 0) sys.files['/home/' + name] = dirE(name);
        ran.push('useradd:' + name);
        break;
      }
      case 'usermod': {
        // usermod -aG <grupo> <usuário> · -L / -U (lock / unlock)
        const sys = sysOf(d), u = a[a.length - 1], x = sys.users[u], gi = a.findIndex((v) => /^-a?G$|^-aG$/.test(v));
        if (!x || a.length < 2) { out.push(x ? 'uso: usermod -aG <grupo> <usuário>' : "usermod: user '" + esc(u || '') + "' does not exist"); ran.push('error'); break; }
        if (!root) { deny('usermod: Permission denied.'); break; }
        if (a.indexOf('-L') >= 0) x.locked = true;
        else if (a.indexOf('-U') >= 0) x.locked = false;
        else if (gi >= 0) {
          const append = a[gi] === '-aG' || a.indexOf('-a') >= 0;
          if (!append) out.push('<span class="m">sem -a, o -G troca todos os grupos da pessoa. Use usermod -aG para acrescentar.</span>');
          const g = a[gi + 1];
          if (sys.groups[g] == null) { out.push("usermod: group '" + esc(g || '') + "' does not exist"); ran.push('error'); break; }
          if (!append) x.groups = [x.groups[0], g];
          else if (x.groups.indexOf(g) < 0) x.groups.push(g);
        } else { out.push('uso: usermod -aG <grupo> <usuário>'); ran.push('error'); break; }
        ran.push('usermod:' + u);
        break;
      }
      case 'passwd': {
        const sys = sysOf(d), u = a.filter((x) => !/^-/.test(x)).pop(), x = sys.users[u];
        if (a.indexOf('-S') >= 0 && x) { out.push(u + (x.locked ? ' L' : ' P') + ' 10/30/2026 0 99999 7 -1'); ran.push('passwd-status:' + u); break; }
        if (a.indexOf('-l') < 0 && a.indexOf('-u') < 0) { out.push('<span class="m">no jogo o passwd só bloqueia (-l), desbloqueia (-u) ou mostra o estado (-S) de uma conta.</span>'); ran.push('error'); break; }
        if (!x) { out.push("passwd: user '" + esc(u || '') + "' does not exist"); ran.push('error'); break; }
        if (!root) { deny('passwd: You may not view or modify password information for ' + esc(u) + '.'); break; }
        x.locked = a.indexOf('-l') >= 0;
        out.push('passwd: password changed.');
        ran.push((x.locked ? 'passwd-lock:' : 'passwd-unlock:') + u);
        break;
      }
      case 'apt': case 'apt-get': {
        const sys = sysOf(d), sub = a[0], pkgs = a.slice(1).filter((x) => !/^-/.test(x));
        const need = () => { if (!root) { deny('E: Could not open lock file /var/lib/dpkg/lock-frontend - open (13: Permission denied)'); return false; } return true; };
        if (sub === 'update') {
          if (!need()) break;
          sys.aptFresh = true;
          out.push('Hit:1 http://archive.ubuntu.com/ubuntu noble InRelease', 'Get:2 http://security.ubuntu.com/ubuntu noble-security InRelease [126 kB]', 'Reading package lists... Done',
            sys.updates.length ? sys.updates.length + ' packages can be upgraded. Run \'apt list --upgradable\' to see them.' : 'All packages are up to date.');
          ran.push('apt-update');
        } else if (sub === 'list' && a.indexOf('--upgradable') >= 0) {
          if (!sys.aptFresh && sys.updates.length) out.push('<span class="m">(a lista pode estar velha: rode sudo apt update antes)</span>');
          out.push('Listing... Done');
          for (const u of sys.aptFresh ? sys.updates : []) out.push(u.pkg + '/noble-security ' + u.to + ' amd64 [upgradable from: ' + (sys.pkgs[u.pkg] || '?') + ']');
          ran.push('apt-list');
        } else if (sub === 'upgrade' || sub === 'full-upgrade') {
          if (!need()) break;
          if (!sys.aptFresh) { out.push('0 upgraded, 0 newly installed, 0 to remove and 0 not upgraded.', '<span class="m">nada a atualizar: o apt ainda não sabe das versões novas (sudo apt update primeiro).</span>'); ran.push('apt-upgrade'); break; }
          const n = sys.updates.length;
          for (const u of sys.updates) { sys.pkgs[u.pkg] = u.to; out.push('Setting up ' + u.pkg + ' (' + u.to + ') ...'); }
          if (sys.updates.some((u) => u.pkg === 'nginx')) { os.nginxStale = true; out.push('<span class="m">o nginx foi atualizado: a versão nova só vale depois de reiniciar o serviço.</span>'); }
          sys.updates = [];
          out.push(n + ' upgraded, 0 newly installed, 0 to remove and 0 not upgraded.');
          ran.push('apt-upgrade');
        } else if (sub === 'install') {
          if (!need()) break;
          if (!pkgs.length) { out.push('uso: sudo apt install <pacote>'); ran.push('error'); break; }
          const KNOWN = { fail2ban: '1.0.2-3ubuntu0.1', htop: '3.3.0-4build1', curl: '8.5.0-2ubuntu10.4', rsync: '3.2.7-1ubuntu1', 'postgresql-client': '16+257build1' };
          const bad = pkgs.find((x) => !KNOWN[x] && !sys.pkgs[x]);
          if (bad) { out.push('E: Unable to locate package ' + esc(bad)); ran.push('error'); break; }
          for (const x of pkgs) { sys.pkgs[x] = sys.pkgs[x] || KNOWN[x]; out.push('Setting up ' + x + ' (' + sys.pkgs[x] + ') ...'); if (x === 'fail2ban') os.services.fail2ban = 'active'; ran.push('apt-install:' + x); }
        } else { out.push('uso: sudo apt update · apt list --upgradable · sudo apt upgrade · sudo apt install <pacote>'); ran.push('error'); }
        break;
      }
      case 'ufw': {
        const sys = sysOf(d), fw = sys.fw, sub = a[0];
        if (!root) { deny('ERROR: You need to be root to run this script'); break; }
        const portOf = (x) => PORT_NAMES[x] || String(x || '').replace(/\/(tcp|udp)$/, '');
        const show = (r) => (r.from ? 'Anywhere'.padEnd(27) + (r.act === 'deny' ? 'DENY' : 'ALLOW').padEnd(12) + r.from : (r.port + '/tcp').padEnd(27) + (r.act === 'deny' ? 'DENY' : 'ALLOW').padEnd(12) + 'Anywhere');
        if (sub === 'status') {
          out.push('Status: ' + (fw.on ? 'active' : 'inactive'));
          if (fw.on && fw.rules.length) out.push('', 'To                         Action      From', '--                         ------      ----', ...fw.rules.map(show));
          ran.push('ufw-status');
        } else if (sub === 'enable') {
          if (!fwAllows({ fw: { on: true, rules: fw.rules } }, 22)) {
            out.push('Command may disrupt existing ssh connections. Proceed with operation (y|n)? y');
            out.push('<span class="w">A porta 22 não foi liberada: numa sessão SSH você teria acabado de se trancar para fora do servidor. Aqui você está no console do rack, então ainda dá para corrigir: sudo ufw allow 22.</span>');
            ran.push('ufw-lockout');
          }
          fw.on = true;
          out.push('Firewall is active and enabled on system startup');
          ran.push('ufw-on');
        } else if (sub === 'disable') { fw.on = false; out.push('Firewall stopped and disabled on system startup'); ran.push('ufw-off'); }
        else if (sub === 'allow' || sub === 'deny') {
          // ufw allow 22 · ufw allow http · ufw deny from 203.0.113.7
          const fi = a.indexOf('from'), rule = fi > 0 ? { act: sub, from: a[fi + 1] } : { act: sub, port: portOf(a[1]) };
          if ((fi > 0 && !/^\d+\.\d+\.\d+\.\d+(\/\d+)?$/.test(rule.from || '')) || (fi < 0 && !/^\d+$/.test(rule.port))) { out.push('ERROR: Wrong number of arguments'); out.push('<span class="m">uso: sudo ufw allow 22 · sudo ufw allow http · sudo ufw deny from 203.0.113.7</span>'); ran.push('error'); break; }
          if (!fw.rules.some((r) => r.act === rule.act && r.port === rule.port && r.from === rule.from)) fw.rules.push(rule);
          out.push(fw.on ? 'Rule added' : 'Rules updated');
          ran.push('ufw-rule');
        } else if (sub === 'delete' && (a[1] === 'allow' || a[1] === 'deny')) {
          const fi = a.indexOf('from'), port = portOf(a[2]), n = fw.rules.length;
          fw.rules = fw.rules.filter((r) => !(r.act === a[1] && (fi > 0 ? r.from === a[fi + 1] : r.port === port)));
          out.push(fw.rules.length < n ? 'Rule deleted' : 'Could not delete non-existent rule');
          ran.push('ufw-rule');
        } else { out.push('uso: sudo ufw status · enable · disable · allow <porta> · deny from <ip> · delete allow <porta>'); ran.push('error'); }
        break;
      }
      case 'tar': {
        // tar czf <arquivo> <pasta> · tar tzf <arquivo>
        const sys = sysOf(d), fl = (a[0] || '').replace(/^-/, ''), arch = a[1], src = a[2];
        if (!/[ctx]/.test(fl) || fl.indexOf('f') < 0 || !arch) { out.push('uso: tar czf <arquivo.tar.gz> <pasta>   ·   tar tzf <arquivo.tar.gz>'); ran.push('error'); break; }
        if (fl.indexOf('c') >= 0) {
          if (!src || !sys.files[src.replace(/(.)\/$/, '$1')]) { out.push('tar: ' + esc(src || '') + ': Cannot stat: No such file or directory'); ran.push('error'); break; }
          const dir = sys.files[parentDir(arch)];
          if (!dir || !dir.dir) { out.push('tar (child): ' + esc(arch) + ': Cannot open: No such file or directory'); ran.push('error'); break; }
          if (!root && !can(sys, dir, 'admin', 2)) { deny('tar (child): ' + esc(arch) + ': Cannot open: Permission denied'); break; }
          out.push('tar: Removing leading `/\' from member names');
          sys.files[arch] = { mode: '644', owner: root ? 'root' : 'admin', group: root ? 'root' : 'admin', size: 180000 + rint(0, 90000), from: src.replace(/(.)\/$/, '$1') };
          ran.push('tar:' + sys.files[arch].from);
        } else if (fl.indexOf('t') >= 0) {
          const f = sys.files[arch];
          if (!f || !f.from) { out.push('tar: ' + esc(arch) + ': Cannot open: No such file or directory'); ran.push('error'); break; }
          const base = f.from.replace(/^\//, '');
          out.push(base + '/', base + '/hostname', base + '/app/', base + '/app/config.env', base + '/nginx/nginx.conf');
          ran.push('tar-list:' + arch);
        } else {
          // tar xzf <arquivo> -C /: puts back what the archive holds (sysOf files kept in it: snap)
          const f = sys.files[arch];
          if (!f || !f.from) { out.push('tar: ' + esc(arch) + ': Cannot open: No such file or directory'); ran.push('error'); break; }
          if (!root) { deny('tar: ' + f.from.replace(/^\//, '') + ': Cannot open: Permission denied'); break; }
          if (a.indexOf('-C') < 0 || a[a.indexOf('-C') + 1] !== '/') { out.push('<span class="m">o arquivo guarda os caminhos sem a / do começo (etc/…): extraia na raiz com -C / para cada arquivo voltar ao lugar.</span>'); ran.push('error'); break; }
          for (const [p, x] of Object.entries(f.snap || {})) sys.files[p] = Object.assign({}, x, { text: x.text ? x.text.slice() : undefined });
          ran.push('tar-extract:' + arch);
        }
        break;
      }
      case 'rsync': {
        // rsync -a <origem> <destino>   (destino remoto: usuário@ip:/pasta)
        const args = a.filter((x) => !/^-/.test(x)), src = args[0], dest = args[1];
        if (!src || !dest) { out.push('uso: rsync -a <origem>/ <usuário>@<ip>:<pasta>/'); ran.push('error'); break; }
        const m = /^(?:[\w.-]+@)?(\d+\.\d+\.\d+\.\d+):(.+)$/.exec(dest);
        if (!m) { out.push('sending incremental file list', '', 'sent 1,204 bytes  received 35 bytes  2,478.00 bytes/sec'); ran.push('rsync-local'); break; }
        const r = ctx.reach(d, m[1]);
        if (!r.ok) { out.push('ssh: connect to host ' + esc(m[1]) + ' port 22: No route to host', 'rsync: connection unexpectedly closed (0 bytes received so far) [sender]'); ran.push('error'); break; }
        out.push('sending incremental file list', './', 'index.html', 'assets/app.css', '', 'sent 48,210 bytes  received 92 bytes  32,201.33 bytes/sec', 'total size is 47,804  speedup is 0.99');
        ran.push('rsync-ok:' + m[1]);
        break;
      }
      case 'crontab': {
        const sys = sysOf(d);
        if (a[0] === '-l') { if (sys.cron.length) for (const l of sys.cron) out.push(esc(l)); else out.push('no crontab for ' + (root ? 'root' : 'admin')); ran.push('cron-list'); }
        else if (a[0] === '-r') { sys.cron = []; ran.push('cron-set'); }
        else { out.push('<span class="m">no jogo o editor do crontab não abre. Para ver: crontab -l · para gravar uma linha: echo "0 2 * * * /usr/local/bin/backup.sh" | crontab -</span>'); ran.push('error'); }
        break;
      }
      default:
        if (linuxDeep(d, c, a, root, line, ctx, out, ran, redirect)) break;
        out.push(esc(c) + ': comando não encontrado');
        ran.push('error', 'unknown');
    }
    return { out, ran };
  }

  // VLANs of a switch (created on first use): names · the access VLAN of each port (10, the datacenter's, by
  // default) · ports in trunk mode and the VLANs they carry. A server's port must be an access port in VLAN 10
  // (where the gateway is) for it to reach the network (ops.js)
  function vlanState(s) {
    if (!s.vlans) s.vlans = { 1: 'default', 10: 'DATACENTER' };
    if (!s.pvlan) s.pvlan = {};
    if (!s.pmode) s.pmode = {};
    if (!s.trunk) s.trunk = {};
    return s;
  }
  DL.swVlans = vlanState;
  const vlanCfg = (s) => JSON.parse(JSON.stringify({ vlans: s.vlans, pvlan: s.pvlan, pmode: s.pmode, trunk: s.trunk }));
  // Cisco writes MACs as 5254.0001.1100
  const ciscoMac = (m) => m.replace(/:/g, '').replace(/(.{4})(?=.)/g, '$1.');

  // The switch configuration as "show running-config" prints it (one description per port with a cable).
  // saved: the startup-config — without the change made after the last save (d.sw.unsaved / unsavedPort, and the
  // VLAN setup as it was at the last copy run start)
  function swConfig(d, ctx, saved) {
    const s = vlanState(d.sw), v = saved ? s.savedCfg || { vlans: { 1: 'default', 10: 'DATACENTER' }, pvlan: {}, pmode: {}, trunk: {} } : s;
    const body = ['!', 'hostname ' + d.name, '!'];
    for (const id of Object.keys(v.vlans).filter((x) => x !== '1')) body.push('vlan ' + id, ' name ' + v.vlans[id], '!');
    for (const p of Object.keys(s.ports)) {
      const peer = ctx.peer(d, p), lines = [];
      if (peer && !(saved && s.unsaved && p === s.unsavedPort)) lines.push(' description ' + peer);
      if (v.pmode[p] === 'trunk') { lines.push(' switchport mode trunk'); if (v.trunk[p]) lines.push(' switchport trunk allowed vlan ' + v.trunk[p].join(',')); }
      else if (v.pvlan[p] && v.pvlan[p] !== 10) lines.push(' switchport access vlan ' + v.pvlan[p]);
      if (lines.length) body.push('interface GigabitEthernet' + p.slice(2), ...lines, '!');
    }
    body.push('interface Vlan10', ' ip address ' + d.ip + ' 255.255.255.0', '!', 'end');
    const size = body.join('\n').length + 600;
    return (saved ? ['Using ' + size + ' out of 65536 bytes'] : ['Building configuration...', '', 'Current configuration : ' + size + ' bytes']).concat(body);
  }

  // Switch CLI with abbreviations (sh int status, conf t, int gi0/3, no shut).
  const kw = (tok, word, min) => !!tok && tok.length >= (min || 2) && word.indexOf(tok.toLowerCase()) === 0;
  // gi0/13, Gi0/13, GigabitEthernet0/13, gig0/13, g0/13 and "gi 0/13" all name the same port
  const swPort = (s) => { const m = /^([a-z]+)(\d+\/\d+)$/.exec(String(s).toLowerCase()); return m && 'gigabitethernet'.indexOf(m[1]) === 0 ? 'gi' + m[2] : null; };
  function swcli(d, line, ctx) {
    const s = vlanState(d.sw), out = [], ran = [];
    const t = line.trim().split(/\s+/).filter(Boolean);
    if (!t.length) return { out, ran };
    const bad = (msg) => { out.push('<span class="w">% ' + msg + '</span>'); ran.push('error'); };
    const c = t[0].toLowerCase();
    const cfg = s.mode === 'conf' || s.mode === 'if' || s.mode === 'vlan';
    if (c === 'help' || c === '?') {
      out.push('modo atual: ' + { user: 'usuário (>)', priv: 'privilegiado (#)', conf: 'configuração (config)', if: 'interface (config-if)', vlan: 'VLAN (config-vlan)' }[s.mode]);
      out.push('  enable · show interfaces status · configure terminal', '  interface gi0/N · shutdown · no shutdown · end · exit',
        '  show running-config · show startup-config · copy running-config startup-config (write memory)', '  ping <ip>',
        '  VLANs: show vlan brief · vlan <N> → name <NOME> · switchport access vlan <N> · switchport mode access|trunk',
        '         switchport trunk allowed vlan <lista> · show interfaces trunk · show mac address-table');
      return { out, ran };
    }
    if (c === 'clear') { ctx.clear(); return { out, ran }; }
    if (kw(c, 'enable')) { if (s.mode === 'user') s.mode = 'priv'; ran.push('enable'); return { out, ran }; }
    if (kw(c, 'disable', 3)) { s.mode = 'user'; return { out, ran }; }
    if (kw(c, 'exit', 3)) {
      if (s.mode === 'if' || s.mode === 'vlan') s.mode = 'conf';
      else if (s.mode === 'conf') s.mode = 'priv';
      else ctx.close();
      return { out, ran };
    }
    if (kw(c, 'end', 3)) { if (cfg) s.mode = 'priv'; s.cur = null; ran.push('end'); return { out, ran }; }
    if (kw(c, 'show')) {
      if (cfg) { bad('Comando show não existe neste modo. Use "end" primeiro.'); return { out, ran }; }
      if (s.mode === 'user' && (kw(t[1], 'vlan') || kw(t[1], 'mac-address-table', 3) || (kw(t[1], 'interfaces') && kw(t[2], 'trunk')))) { bad('Use "enable" antes.'); return { out, ran }; }
      // show vlan brief: each VLAN and its access ports
      if (kw(t[1], 'vlan')) {
        out.push('VLAN Name                             Status    Ports', '---- -------------------------------- --------- -------------------------------');
        for (const id of Object.keys(s.vlans).map(Number).sort((x, y) => x - y)) {
          const ports = Object.keys(s.ports).filter((p) => s.pmode[p] !== 'trunk' && (s.pvlan[p] || 10) === id).map((p) => p.replace('gi', 'Gi'));
          const rows = []; for (let i = 0; i < ports.length; i += 4) rows.push(ports.slice(i, i + 4).join(', '));
          out.push(String(id).padEnd(5) + esc(s.vlans[id]).padEnd(33) + 'active    ' + (rows[0] || ''));
          for (const r of rows.slice(1)) out.push(' '.repeat(48) + r);
        }
        ran.push('show-vlan');
        return { out, ran };
      }
      // show mac address-table: the MAC each port learned (the servers whose link is up behind it)
      if (kw(t[1], 'mac-address-table', 3) || (kw(t[1], 'mac') && kw(t[2], 'address-table', 3))) {
        const D = window.DataLabDemo, ops = D && D.ops;
        out.push('          Mac Address Table', '-------------------------------------------', 'Vlan    Mac Address       Type        Ports', '----    -----------       --------    -----');
        for (const x of ops ? ops.devices().filter((q) => q.kind === 'server' && q.os && q.os.ifaces.eth0.up) : []) {
          const tr = x.path || ops.trace(x);
          if (tr.ok && tr.sw === d && s.ports[tr.port] === 'connected') out.push(String(s.pvlan[tr.port] || 10).padStart(4) + '    ' + ciscoMac(x.os.ifaces.eth0.mac) + '    DYNAMIC     ' + tr.port.replace('gi', 'Gi'));
        }
        ran.push('show-mac');
        return { out, ran };
      }
      if (kw(t[1], 'interfaces') && kw(t[2], 'trunk')) {
        const tp = Object.keys(s.pmode).filter((p) => s.pmode[p] === 'trunk');
        if (!tp.length) out.push('<span class="m">Nenhuma porta em modo trunk.</span>');
        else { out.push('Port        Mode         Encapsulation  Status        Native vlan'); for (const p of tp) out.push(p.replace('gi', 'Gi').padEnd(12) + 'on           802.1q         trunking      1'); out.push('', 'Port        Vlans allowed on trunk'); for (const p of tp) out.push(p.replace('gi', 'Gi').padEnd(12) + (s.trunk[p] ? s.trunk[p].join(',') : '1-4094')); }
        ran.push('show-trunk');
        return { out, ran };
      }
      if (kw(t[1], 'interfaces') && kw(t[2], 'status')) {
        if (s.mode === 'user') { bad('Comando incompleto ou sem permissão. Use "enable" antes.'); return { out, ran }; }
        out.push('Port      Name               Status         Vlan   Duplex  Speed');
        let idle = 0;
        for (const [p, st] of Object.entries(s.ports)) {
          if (st === 'notconnect') { idle++; continue; }
          const vl = s.pmode[p] === 'trunk' ? 'trunk' : String(s.pvlan[p] || 10);
          const dx = s.duplex && s.duplex[p] ? s.duplex[p] : 'a-full', sp = s.speed && s.speed[p] ? String(s.speed[p]) : 'a-1000';
          out.push((p.replace('gi', 'Gi')).padEnd(10) + (ctx.peer(d, p) || '').padEnd(19) + '<span class="' + (st === 'err-disabled' ? 'w' : st === 'connected' ? 'ok' : 'm') + '">' + st.padEnd(15) + '</span>' + vl.padEnd(7) + dx.padEnd(8) + sp);
        }
        if (idle) out.push('<span class="m">… mais ' + idle + ' portas sem cabo (notconnect)</span>');
        ran.push('show-int');
        // which ports this show saw connected (the "Porta em erro" task checks its own port)
        for (const [p, st] of Object.entries(s.ports)) if (st === 'connected') ran.push('show-int-ok:' + p);
        return { out, ran };
      }
      if (kw(t[1], 'running-config') || kw(t[1], 'startup-config', 3)) {
        if (s.mode === 'user') { bad('Use "enable" antes.'); return { out, ran }; }
        const start = kw(t[1], 'startup-config', 3);
        out.push.apply(out, swConfig(d, ctx, start).map(esc));
        ran.push(start ? 'show-start' : 'show-run');
        return { out, ran };
      }
      bad('Comando incompleto. Tente: show interfaces status');
      return { out, ran };
    }
    // copy running-config startup-config · write memory: what is in use becomes what the switch loads when it boots
    if (kw(c, 'copy', 3) || kw(c, 'write', 2)) {
      if (s.mode === 'user') { bad('Use "enable" antes.'); return { out, ran }; }
      if (cfg) { bad('Comando inválido neste modo. Use "end" primeiro.'); return { out, ran }; }
      const copy = kw(c, 'copy', 3);
      if (copy ? !(kw(t[1], 'running-config', 3) && kw(t[2], 'startup-config', 3)) : t[1] && !kw(t[1], 'memory', 3)) { bad(copy ? 'Uso: copy running-config startup-config' : 'Uso: write memory'); return { out, ran }; }
      if (copy) out.push('Destination filename [startup-config]? ');
      out.push('Building configuration...', '<span class="ok">[OK]</span>');
      s.unsaved = false;
      s.savedCfg = vlanCfg(s);
      ran.push('config-saved');
      return { out, ran };
    }
    if (kw(c, 'configure')) {
      if (s.mode === 'user') { bad('Use "enable" antes de configurar.'); return { out, ran }; }
      if (!t[1] || kw(t[1], 'terminal', 1)) { s.mode = 'conf'; out.push('Enter configuration commands, one per line.  End with CNTL/Z.'); ran.push('conf'); }
      else bad('Comando inválido. Use: configure terminal');
      return { out, ran };
    }
    // vlan <N> (creates it and enters config-vlan) · no vlan <N>
    if (c === 'vlan' || (c === 'no' && t[1] === 'vlan')) {
      if (!cfg) { bad('Comando inválido neste modo. Use "configure terminal" antes.'); return { out, ran }; }
      const id = +(c === 'no' ? t[2] : t[1]);
      if (!(id >= 2 && id <= 4094)) { bad('VLAN inválida: use um número de 2 a 4094.'); return { out, ran }; }
      if (c === 'no') {
        if (id === 10) { bad('A VLAN 10 é a do datacenter (gateway e servidores): não dá para apagar.'); return { out, ran }; }
        delete s.vlans[id];
        s.unsaved = true;
        return { out, ran };
      }
      if (!s.vlans[id]) s.vlans[id] = 'VLAN' + String(id).padStart(4, '0');
      s.mode = 'vlan'; s.curVlan = id; s.cur = null; s.unsaved = true;
      ran.push('vlan:' + id);
      return { out, ran };
    }
    if (c === 'name') {
      if (s.mode !== 'vlan') { bad('name vale dentro de uma VLAN: vlan <N> antes.'); return { out, ran }; }
      if (!t[1] || !/^[\w-]{1,32}$/.test(t[1])) { bad('Uso: name <NOME> (sem espaços)'); return { out, ran }; }
      s.vlans[s.curVlan] = t[1];
      s.unsaved = true;
      ran.push('vlan-name:' + s.curVlan);
      return { out, ran };
    }
    // speed auto|100|1000 · duplex auto|half|full (a port forced to 100 / half slows the server and piles up errors)
    if (c === 'speed' || c === 'duplex') {
      if (s.mode !== 'if') { bad(c + ' vale dentro da porta: interface gi0/N antes.'); return { out, ran }; }
      const v = (t[1] || '').toLowerCase(), okV = c === 'speed' ? ['auto', '10', '100', '1000'] : ['auto', 'half', 'full'];
      if (okV.indexOf(v) < 0) { bad('Uso: ' + c + ' ' + okV.join('|')); return { out, ran }; }
      const m = c === 'speed' ? (s.speed = s.speed || {}) : (s.duplex = s.duplex || {});
      if (v === 'auto' || (c === 'speed' && v === '1000') || (c === 'duplex' && v === 'full')) delete m[s.cur]; else m[s.cur] = c === 'speed' ? +v : v;
      s.unsaved = true;
      ran.push('sw-' + c + ':' + s.cur);
      return { out, ran };
    }
    // switchport mode access|trunk · switchport access vlan <N> · switchport trunk allowed vlan <lista>
    if (kw(c, 'switchport', 3)) {
      if (s.mode !== 'if') { bad('switchport vale dentro da porta: interface gi0/N antes.'); return { out, ran }; }
      const p = s.cur;
      if (kw(t[1], 'mode') && (t[2] === 'access' || t[2] === 'trunk')) { s.pmode[p] = t[2]; if (t[2] === 'access') delete s.trunk[p]; ran.push('sw-mode:' + t[2]); }
      else if (kw(t[1], 'access') && kw(t[2], 'vlan') && +t[3] >= 1 && +t[3] <= 4094) {
        const id = +t[3];
        if (!s.vlans[id]) { s.vlans[id] = 'VLAN' + String(id).padStart(4, '0'); out.push('% Access VLAN does not exist. Creating vlan ' + id); }
        s.pvlan[p] = id;
        if (s.pmode[p] === 'trunk') out.push('<span class="m">a porta continua em modo trunk: para valer a VLAN de acesso, use switchport mode access.</span>');
        ran.push('sw-access:' + p);
      } else if (kw(t[1], 'trunk') && kw(t[2], 'allowed') && kw(t[3], 'vlan') && t[4]) {
        const add = t[4] === 'add', list = (add ? t[5] : t[4]) || '';
        if (!/^\d+(,\d+)*$/.test(list)) { bad('Uso: switchport trunk allowed vlan 10,30'); return { out, ran }; }
        const ids = list.split(',').map(Number);
        s.trunk[p] = add ? Array.from(new Set((s.trunk[p] || []).concat(ids))).sort((x, y) => x - y) : ids;
        ran.push('sw-trunk:' + p);
      } else { bad('Uso: switchport mode access|trunk · switchport access vlan <N> · switchport trunk allowed vlan <lista>'); return { out, ran }; }
      s.unsaved = true;
      return { out, ran };
    }
    if (kw(c, 'interface', 3)) {
      if (!cfg) { bad('Comando inválido neste modo. Use "configure terminal" antes.'); return { out, ran }; }
      const p = swPort(t.slice(1).join(''));
      if (!p || !s.ports[p]) { bad('Porta inválida. Portas: gi0/1 a gi0/' + Object.keys(s.ports).length); return { out, ran }; }
      s.mode = 'if';
      s.cur = p;
      ran.push('if:' + p);
      // like a real switch the port is selected anyway, but the player learns it isn't the broken one
      // (a port shut down by hand isn't OK either: it just isn't the err-disabled one)
      if (s.bad && !s.fixed && p !== s.bad && s.ports[p] !== 'disabled') out.push('<span class="m">Essa porta está OK. Veja no show interfaces status qual está err-disabled.</span>');
      return { out, ran };
    }
    if (kw(c, 'shutdown', 4) || (c === 'no' && kw(t[1], 'shutdown', 4))) {
      // interface commands: say what is missing to get into the port's config-if
      const broken = s.bad && !s.fixed;
      if (s.mode === 'user' || s.mode === 'priv') { bad('Esse comando vale dentro da porta: configure terminal → interface ' + (broken ? '&lt;porta com problema&gt;' : 'gi0/N') + '.'); return { out, ran }; }
      if (s.mode !== 'if') { bad('Selecione a porta antes: interface gi0/N.'); return { out, ran }; }
      const no = c === 'no', p = s.cur, full = 'GigabitEthernet' + p.slice(2), wasOff = s.ports[p] === 'disabled';
      // the err-disabled port only recovers with shutdown first
      if (no && p === s.bad && !s.fixed && s.ports[p] !== 'disabled') { out.push('<span class="w">Primeiro desligue a porta com shutdown.</span>'); ran.push('error'); return { out, ran }; }
      if (!no) { s.ports[p] = 'disabled'; s.shut = p; out.push('%LINK-5-CHANGED: Interface ' + full + ', changed state to administratively down'); }
      else {
        s.ports[p] = s.linked && s.linked.has(p) ? 'connected' : 'notconnect';
        if (s.shut === p) s.shut = null;
        out.push('%LINK-3-UPDOWN: Interface ' + full + ', changed state to up');
        if (p === s.bad) s.fixed = true;
      }
      // like a real switch it ran, but this is not the port the task is about
      if (broken && p !== s.bad && !(no && wasOff)) out.push('<span class="m">Você está na ' + p + ', que está OK. A porta com problema está err-disabled no show interfaces status.</span>');
      ran.push(no ? 'noshut' : 'shut');
      return { out, ran };
    }
    if (kw(c, 'ping')) {
      if (!t[1]) { bad('Uso: ping <ip>'); return { out, ran }; }
      const ok = ctx.reach(d, t[1]).ok;
      out.push('Sending 5, 100-byte ICMP Echos to ' + esc(t[1]) + ', timeout is 2 seconds:', ok ? '!!!!!' : '.....', 'Success rate is ' + (ok ? '100 percent (5/5)' : '0 percent (0/5)'));
      ran.push(ok ? 'ping-ok:' + t[1] : 'ping-fail');
      return { out, ran };
    }
    bad('Comando desconhecido: "' + c + '". Digite help ou use Precisa de ajuda?');
    ran.push('unknown');
    return { out, ran };
  }

  // the two shells, for automated checks of the scenarios (no UI)
  DL.termShells = { linux, swcli };

  /* ------------------------------------------------------------------ */
  /* Terminal UI                                                         */
  /* ------------------------------------------------------------------ */
  DL.createTerminal = function (game) {
    const $ = (id) => document.getElementById(id);
    const el = {
      root: $('terminal'), out: $('termOut'), input: $('termIn'), prompt: $('termPrompt'), title: $('termTitle'), where: $('termWhere'),
      close: $('termClose'), task: $('termTask'), goal: $('termGoal'), steps: $('termSteps'), helpBtn: $('termHelpBtn'), help: $('termHelp'), side: $('termSide'),
      mode: $('termMode'),
    };
    const X = { open: false, dev: null, lesson: null, ran: new Set(), history: [], hi: -1, misses: 0, step: 0, onDone: null, helpOpen: false };

    // The equipped terminal skin (Equipamentos · skins de hacks, cosmetics.js): colours by CSS
    // (#terminal[data-skin]) and a live pixel effect on a small canvas behind the output. Only the look.
    const fx = { cv: null, raf: 0, kind: '' };
    function applySkin() {
      const id = DL.Skins && DL.Skins.equipped.terminal, it = id && DL.cosmetic(id);
      fx.kind = it ? it.value : '';
      if (fx.kind) el.root.dataset.skin = fx.kind; else delete el.root.dataset.skin;
      runFx();
    }
    function runFx() {
      cancelAnimationFrame(fx.raf);
      fx.raf = 0;
      if (!fx.kind || !DL.termFx) { if (fx.cv) fx.cv.hidden = true; return; }
      if (!fx.cv) {
        fx.cv = document.createElement('canvas');
        fx.cv.className = 'term__fx';
        fx.cv.setAttribute('aria-hidden', 'true');
        el.out.parentNode.insertBefore(fx.cv, el.out.parentNode.firstChild);
      }
      fx.cv.hidden = false;
      if (!X.open) return;
      let last = 0;
      const step = (now) => {
        fx.raf = 0;
        if (!X.open || !fx.kind) return;
        if (now - last > 66) {
          last = now;
          // a third of the screen resolution, scaled up pixelated: the effect stays pixel art
          const host = fx.cv.parentNode, w = Math.max(1, Math.round(host.clientWidth / 3)), h = Math.max(1, Math.round(host.clientHeight / 3));
          if (fx.cv.width !== w || fx.cv.height !== h) { fx.cv.width = w; fx.cv.height = h; }
          const g = fx.cv.getContext('2d');
          g.clearRect(0, 0, w, h);
          DL.termFx(g, fx.kind, w, h, now / 1000);
        }
        fx.raf = requestAnimationFrame(step);
      };
      fx.raf = requestAnimationFrame(step);
    }
    game.on('inventory', applySkin);

    // which interpreter runs on this device: switch CLI, Windows Server (winserver.js) or Linux
    const isWin = (d) => !!(DL.isWin && DL.isWin(d));
    const shellOf = (d) => (d.kind === 'switch' ? swcli : isWin(d) ? DL.winShell : linux);
    const promptOf = (d) => {
      if (d.kind === 'switch') return d.name + ({ user: '>', priv: '#', conf: '(config)#', if: '(config-if)#', vlan: '(config-vlan)#' }[d.sw.mode]);
      if (isWin(d)) return DL.winPrompt(d);
      return 'admin@' + d.os.hostname + ':~$';
    };

    // Output: follows the newest line unless the player scrolled up to read (then it stays put);
    // a command typed by the player always brings the view back down. Old lines are trimmed.
    const MAX_LINES = 600;
    function print(lines, cls, force) {
      const o = el.out, stick = force || o.scrollHeight - o.scrollTop - o.clientHeight < 48;
      const frag = document.createDocumentFragment();
      for (const l of lines) {
        const div = document.createElement('div');
        if (cls) div.className = cls;
        div.innerHTML = l === '' ? '&nbsp;' : l;
        frag.appendChild(div);
      }
      o.appendChild(frag);
      let cut = o.children.length - MAX_LINES;
      while (cut-- > 0) o.firstChild.remove();
      if (stick) o.scrollTop = o.scrollHeight;
    }

    // keep the current step in view inside the side panel (never scrolls the page itself)
    function revealStep() {
      const cur = el.steps.querySelector('.is-current');
      if (!cur) return;
      const side = el.side, top = cur.offsetTop - side.offsetTop, bottom = top + cur.offsetHeight;
      if (top < side.scrollTop + 8) side.scrollTop = Math.max(0, top - 8);
      else if (bottom > side.scrollTop + side.clientHeight - 8) side.scrollTop = bottom - side.clientHeight + 8;
    }

    /* ---------- learning mode (difficulty.js) ---------- */
    const L = () => (DL.learn ? DL.learn() : { id: 'intermediario', name: 'Intermediário', stepText: 'full', helpDepth: 'example', helpAfter: 3, autoHelp: false, explainErrors: false, color: '#a0c3ec' });
    function renderMode() {
      if (!el.mode) return;
      const m = L();
      el.mode.textContent = 'Modo ' + m.name;
      el.mode.style.setProperty('--c', m.color);
      el.mode.title = m.desc || '';
    }
    // the command a step expects, as a hint (Iniciante shows it right in the step)
    // (a step may carry its exact command — with this server's IP / name — instead of the generic example)
    // (a question never shows its answer: the hint is how to reply)
    const stepCmd = (s) => (s.answer ? 'responder <sua resposta>' : s.cmd || (s.help && HELP[s.help[0]] ? HELP[s.help[0]].ex.split('\n')[0] : ''));
    // the text of a step in Experiente (hidden until done) — a question is always shown: it is what is asked
    const stepText = (s, hidden) => (hidden && !s.answer ? 'Descubra o próximo passo.' : s.text);
    // why a command failed, in plain words (Iniciante)
    const FIRST = ['ip', 'ping', 'sudo', 'systemctl', 'curl', 'df', 'du', 'journalctl', 'hostnamectl', 'hostname', 'help', 'clear', 'exit', 'enable', 'show', 'configure', 'interface', 'shutdown', 'no', 'end', 'lscpu', 'free', 'uptime', 'whoami', 'uname', 'responder', 'tail', 'grep', 'cat', 'ss', 'netstat', 'copy', 'write',
      'ufw', 'ls', 'chmod', 'chown', 'useradd', 'usermod', 'passwd', 'id', 'groups', 'apt', 'tar', 'rsync', 'crontab', 'echo', 'vlan', 'name', 'switchport',
      'ps', 'top', 'kill', 'pkill', 'dmesg', 'mdadm', 'smartctl', 'openssl', 'certbot', 'nginx', 'sed', 'cp', 'ethtool', 'nvidia-smi', 'psql', 'pg_dump', 'traceroute', 'timedatectl', 'sensors', 'upsc', 'gpasswd', 'speed', 'duplex'];
    function closest(w) {
      let best = null, bd = 3;
      for (const c of X.dev && isWin(X.dev) && DL.WIN_FIRST ? DL.WIN_FIRST : FIRST) {
        const d = lev(w, c);
        if (d < bd) { bd = d; best = c; }
      }
      return best;
    }
    function lev(a, b) {
      const m = [];
      for (let i = 0; i <= a.length; i++) { m[i] = [i]; for (let j = 1; j <= b.length; j++) m[i][j] = i ? Math.min(m[i - 1][j] + 1, m[i][j - 1] + 1, m[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)) : j; }
      return m[a.length][b.length];
    }
    function explain(line, r) {
      const txt = r.out.join(' ');
      const w = line.trim().split(/\s+/)[0].toLowerCase();
      // the Windows shell explains its own teaching errors
      if (r.why) return r.why;
      if (X.dev && isWin(X.dev)) {
        if (r.ran.indexOf('unknown') >= 0) { const c = closest(w); return 'O Windows não conhece "' + esc(w) + '".' + (c ? ' Você quis dizer <code>' + esc(c) + '</code>?' : '') + ' Digite <code>help</code> para ver os comandos por área.'; }
        if (r.ran.indexOf('ping-fail') >= 0) return 'O ping não voltou. Leia a dica em cinza: ela diz se é o cabo, o adaptador, o IP ou o gateway.';
        if (r.ran.indexOf('error') >= 0) return 'O comando deu erro. A mensagem em laranja diz o motivo e a linha cinza sugere o formato certo.';
        return null;
      }
      if (/Operation not permitted|Access denied|Permission denied/.test(txt)) return 'Esse comando altera o sistema, então precisa de permissão de administrador. Coloque <b>sudo</b> na frente: <code>sudo ' + esc(line.trim()) + '</code>';
      if (r.ran.indexOf('unknown') >= 0) { const c = closest(w); return 'O sistema não conhece "' + esc(w) + '".' + (c ? ' Você quis dizer <code>' + c + '</code>?' : '') + ' Digite <code>help</code> para ver a lista.'; }
      if (/Cannot find device/.test(txt)) return 'Essa interface não existe. As interfaces deste servidor são <b>lo</b> e <b>eth0</b> — veja com <code>ip addr</code>.';
      if (/any valid prefix/.test(txt)) return 'O endereço precisa estar no formato IP/máscara, por exemplo <code>10.0.1.12/24</code>.';
      if (/invalid gateway/.test(txt)) return 'O gateway precisa estar na mesma rede do IP da interface. Dê o IP primeiro (ip addr add), depois crie a rota.';
      if (/^uso:|usage|Comando incompleto|incompleto/.test(txt)) return 'Faltou parte do comando. Veja o formato acima ou clique em <b>Precisa de ajuda?</b>.';
      if (/Use "enable"/.test(txt)) return 'No switch você começa no modo usuário (&gt;). Digite <code>enable</code> para o modo privilegiado (#).';
      if (/Use "end" primeiro|neste modo/.test(txt)) return 'Esse comando não vale no modo atual do switch. Repare no prompt: (config) e (config-if) são modos de configuração; <code>end</code> volta.';
      if (r.ran.indexOf('ping-fail') >= 0) return 'O ping não voltou. Leia a dica em cinza acima: ela diz em que camada está o problema (interface, cabo, IP ou rota).';
      if (r.ran.indexOf('error') >= 0) return 'O comando deu erro. Leia a mensagem acima com calma: ela costuma dizer exatamente o que faltou.';
      return null;
    }

    function curStep() {
      if (!X.lesson) return -1;
      const s = X.lesson.steps;
      for (let i = 0; i < s.length; i++) if (!s[i].done(X.dev, X.ran)) return i;
      return s.length;
    }

    function renderSide() {
      if (!X.lesson) {
        const ms = isWin(X.dev) && DL.winMissions ? DL.winMissions(X.dev) : [];
        el.helpBtn.hidden = false;
        if (ms.length) {
          // Windows Server: optional missions (each teaches one part of the server and pays once)
          el.task.textContent = 'Windows Server · Missões';
          el.goal.textContent = 'Nenhuma tarefa urgente. Escolha uma missão para praticar — ou explore à vontade (help conceitos).';
          const html = ms.map((m, k) => '<li class="' + (m.done ? 'is-done' : '') + '"><span class="term__chk">' + (m.done ? '✓' : k + 1) + '</span><span><b class="term__mtitle">' + esc(m.title) + '</b> <em class="term__mreward">+' + m.reward + ' créditos</em><small class="term__mdesc">' + esc(m.desc) + '</small>' +
            (m.done ? '' : m.lock ? '<small class="term__mlock">🔒 ' + esc(m.lock) + '</small>' : '<button type="button" class="btn btn--sm btn--primary term__act" data-term-mission="' + m.id + '">Iniciar missão</button>') + '</span></li>').join('');
          if (el.steps.dataset.k !== html) { el.steps.dataset.k = html; el.steps.innerHTML = html; }
          return;
        }
        el.task.textContent = 'Console livre';
        el.goal.textContent = 'Nenhuma tarefa aberta neste equipamento. Explore à vontade — digite help.';
        el.steps.innerHTML = '';
        el.steps.dataset.k = '';
        return;
      }
      const i = curStep(), m = L();
      el.task.textContent = X.lesson.title;
      el.goal.textContent = X.lesson.goal;
      // Experiente: only the goal; each step is revealed once it is done
      const hidden = m.stepText === 'hidden';
      const html = X.lesson.steps.map((s, k) => {
        const txt = hidden && k >= i ? (k === i ? stepText(s, true) : '?') : s.text;
        const hint = m.id === 'iniciante' && k === i && stepCmd(s) ? '<code class="term__try">' + esc(stepCmd(s)) + '</code>' : '';
        // a lesson on two devices (problems.js: step.on): which console each step happens on — shown from the
        // current step on only, so a later step never gives away which server the problem is about
        const on = s.on && k <= i ? '<em class="term__on' + (s.on === X.dev ? ' is-here' : '') + '">' + esc(s.on.name) + '</em> ' : '';
        const away = k === i && s.on && s.on !== X.dev;
        return '<li class="' + (k < i ? 'is-done' : k === i ? 'is-current' : '') + (s.answer ? ' is-question' : '') + '"><span class="term__chk">' + (k < i ? '✓' : k === i && s.answer ? '?' : k + 1) + '</span><span>' + on + esc(txt) + (away ? '' : hint) +
          (away ? '<small class="term__away">Este passo é no ' + esc(s.on.name) + '.</small><button type="button" class="btn btn--sm btn--primary term__act" data-term-act="hop">Abrir o console do ' + esc(s.on.name) + '</button>' : '') +
          (k === i && s.action === 'cabling' ? '<button type="button" class="btn btn--sm btn--primary term__act" data-term-act="cabling">Abrir cabeamento do rack</button>' : '') +
          // a question: the answer goes here (or "responder <valor>" in the console)
          (k === i && s.answer ? '<form class="term__answer" data-term-answer autocomplete="off"><input class="input" name="a" maxlength="60" placeholder="Sua resposta" aria-label="Resposta: ' + esc(s.text) + '"><button type="submit" class="btn btn--sm btn--primary">Responder</button></form>' : '') + '</span></li>';
      }).join('');
      // rebuild only when something changed, so the side panel never jumps while the player scrolls it
      if (el.steps.dataset.k !== html) { el.steps.dataset.k = html; el.steps.innerHTML = html; revealStep(); }
      el.helpBtn.classList.toggle('is-guide', m.helpAfter > 0 && X.misses >= m.helpAfter && !X.helpOpen);
    }

    // how deep the help goes depends on the learning mode: syntax only (Experiente), + example
    // (Intermediário), or everything with when to use it (Iniciante). Asking is always allowed.
    // `ex` replaces the generic example of one command (the step's own, with this device's port / IP / name)
    function helpCard(keys, depth, ex) {
      depth = depth || 'full';
      return keys.map((k) => {
        const h = HELP[k], e = ex && ex[k] ? ex[k] : h.ex;
        return '<div class="hcard"><code class="hcard__cmd">' + esc(h.cmd) + '</code>' +
          '<dl>' + (depth !== 'syntax' ? '<dt>Exemplo</dt><dd><code>' + esc(e).replace(/\n/g, '<br>') + '</code></dd>' : '') +
          '<dt>O que faz</dt><dd>' + esc(h.what) + '</dd>' + (depth === 'full' ? '<dt>Quando usar</dt><dd>' + esc(h.when) + '</dd>' : '') + '</dl></div>';
      }).join('');
    }

    function renderHelp() {
      const i = curStep(), m = L();
      const win = isWin(X.dev);
      const step = X.lesson && i < X.lesson.steps.length ? X.lesson.steps[i] : null;
      const keys = step ? step.help : X.dev.kind === 'switch' ? ['enable', 'show-int', 'conf-t'] : win ? ['win-ipconfig', 'win-features', 'win-service'] : ['ip-addr', 'ping', 'sudo'];
      const stepLabel = step ? (m.stepText === 'hidden' && !step.answer ? 'o próximo passo' : step.text) : '';
      // the step's exact command (same source as the hint in the terminal) is the example of its first card
      const ex = step && step.cmd ? { [step.help[0]]: step.cmd } : null;
      let h = '<p class="term__hint">' + (stepLabel ? 'Para ' + (m.stepText === 'hidden' ? '' : 'este passo: ') + '<b>' + esc(stepLabel) + '</b>' : 'Comandos mais usados aqui:') +
        ' <span class="term__depth">Ajuda do modo ' + esc(m.name) + '</span></p>' + helpCard(m.helpDepth === 'syntax' ? keys.slice(0, 1) : keys, m.helpDepth, ex);
      const SWITCH_KEYS = ['enable', 'show-int', 'conf-t', 'interface', 'shutdown', 'no-shutdown', 'end', 'show-run', 'show-start', 'copy-run-start', 'sw-ping',
        'show-vlan', 'sw-vlan', 'sw-access', 'sw-mode', 'sw-trunk', 'show-trunk', 'show-mac', 'sw-duplex'];
      const forDev = (k) => (X.dev.kind === 'switch' ? SWITCH_KEYS.includes(k) || k === 'responder' : win ? HELP[k].os === 'win' || k === 'cabling' : !HELP[k].os && !SWITCH_KEYS.includes(k));
      h += '<details class="term__all"><summary>Todos os comandos</summary>' + Object.keys(HELP).filter(forDev)
        .map((k) => '<button type="button" class="chip" data-help="' + k + '">' + esc(HELP[k].cmd.split(' <')[0]) + '</button>').join('') + '<div data-help-out></div></details>';
      el.help.innerHTML = h;
    }

    function toggleHelp(force) {
      X.helpOpen = force != null ? force : !X.helpOpen;
      el.help.hidden = !X.helpOpen;
      el.helpBtn.textContent = X.helpOpen ? 'Esconder ajuda' : 'Precisa de ajuda?';
      if (X.helpOpen) { X.misses = 0; renderHelp(); }
      renderSide();
    }

    const ctx = {
      clear: () => (el.out.innerHTML = ''),
      close: () => close(),
      reach: (d, host) => game.reach(d, host),
      peer: (d, port) => (game.peer ? game.peer(d, port) : ''),
      get history() { return X.history; },
    };

    function run(line) {
      const d = X.dev, m = L();
      print(['<span class="term__p">' + esc(promptOf(d)) + '</span> ' + esc(line)], null, true);
      if (line.trim()) X.history.push(line);
      if (X.history.length > 100) X.history.shift();
      const before = curStep();
      // "responder <valor>": the answer to the question of the current step (not a shell command)
      const said = X.lesson && /^\s*respo(?:nder|sta)\b\s*(.*)$/i.exec(line);
      if (said) {
        const s = X.lesson.steps[before];
        if (s && s.answer) answer(said[1]);
        else { print(['<span class="m">Nenhuma pergunta agora: este passo pede um comando. Veja o passo atual ao lado.</span>'], null, true); renderSide(); }
        return;
      }
      const r = shellOf(d)(d, line, ctx);
      // every command that ran without an error also reports its own name (cmd:whoami), so a step can ask for any command
      if (line.trim() && r.ran.indexOf('error') < 0 && r.ran.indexOf('unknown') < 0) {
        const w = line.trim().split(/\s+/).find((x) => x !== 'sudo');
        if (w) r.ran.push('cmd:' + w.toLowerCase());
      }
      if (r.out.length) print(r.out, null, true);
      for (const e of r.ran) X.ran.add(e);
      game.onCommand && game.onCommand(d, r.ran);
      // Iniciante: every error comes with a plain explanation
      if (m.explainErrors && line.trim()) { const why = explain(line, r); if (why) print(['<span class="term__why">💡 ' + why + '</span>'], null, true); }
      if (X.lesson) progress(before, !!line.trim());
      el.prompt.textContent = promptOf(d);
      renderSide();
    }

    // after a command or an answer: the next step (or the end), or one more miss towards "Precisa de ajuda?"
    function progress(before, tried) {
      const m = L(), after = curStep();
      if (after > before) {
        X.misses = 0;
        if (X.helpOpen) renderHelp();
        if (after >= X.lesson.steps.length) finish();
        else {
          const next = X.lesson.steps[after];
          // the next step on another device's console: say so (the side panel has the button)
          if (next.on && next.on !== X.dev) print(['<span class="ok">✓ passo concluído.</span> <span class="m">O próximo passo é no <b>' + esc(next.on.name) + '</b>: use o botão ao lado (Abrir o console do ' + esc(next.on.name) + ').</span>'], null, true);
          else {
            const tell = m.stepText === 'hidden' ? esc(stepText(next, true)) : esc(next.text) + (m.id === 'iniciante' && stepCmd(next) ? ' · experimente <code>' + esc(stepCmd(next)) + '</code>' : '');
            print(['<span class="ok">✓ passo concluído.</span> <span class="m">Próximo: ' + tell + '</span>'], null, true);
          }
        }
      } else if (tried) {
        X.misses++;
        if (m.helpAfter && X.misses === m.helpAfter && !X.helpOpen) {
          if (m.autoHelp) toggleHelp(true);
          else print(['<span class="m">Travou? Clique em <b>Precisa de ajuda?</b> para ver o comando' + (m.helpDepth === 'syntax' ? '' : ', um exemplo') + ' e o que ele faz.</span>'], null, true);
        }
      }
    }

    // The answer to the question of the current step (typed "responder <valor>" or sent from the side panel).
    // Right: the step is done. Wrong: one more miss, and the player reads the output again.
    function answer(value, fromPanel) {
      const i = curStep(), s = X.lesson && X.lesson.steps[i];
      if (!s || !s.answer) return false;
      const v = String(value == null ? '' : value).trim().slice(0, 60);
      if (fromPanel) print(['<span class="term__p">resposta:</span> ' + esc(v)], null, true);
      if (!v) { print(['<span class="m">Escreva a resposta depois do comando: responder &lt;valor&gt;</span>'], null, true); renderSide(); return false; }
      const ok = !!(DL.checkAnswer && DL.checkAnswer(s.answer, v));
      game.emit && game.emit('answer', { d: X.dev, ok, value: v });
      if (ok) {
        X.ran.add('answer:' + i);
        print(['<span class="ok">✓ Resposta certa: ' + esc(v) + '</span>'], null, true);
      } else print(['<span class="w">✗ "' + esc(v) + '" não confere.</span> <span class="m">Leia de novo a saída do comando e tente outra vez.</span>'], null, true);
      progress(i, true);
      renderSide();
      return ok;
    }

    function finish() {
      const done = X.onDone, l = X.lesson;
      X.lesson = null;
      print(['', '<span class="ok">✓ ' + esc(l.title) + ' — concluído.</span>', '<span class="m">Pode fechar o terminal (Esc) ou continuar explorando.</span>']);
      if (done) done();
    }

    function open(dev, lessonType, onDone) {
      // a Windows mission left half-way comes back when the console is reopened with nothing urgent
      if (!lessonType && isWin(dev) && /^mis-/.test(dev.lessonKey || '') && LESSONS[dev.lessonKey] && dev.os.win.done.indexOf(dev.lessonKey) < 0) {
        const id = dev.lessonKey;
        lessonType = id;
        onDone = () => DL.winMissionDone(dev, id, game);
      }
      X.dev = dev;
      X.lesson = lessonType && LESSONS[lessonType] ? LESSONS[lessonType](dev) : null;
      X.lessonType = X.lesson ? lessonType : null;
      X.onDone = onDone || null;
      // progress lives on the device, so closing the console to fix a cable doesn't lose it
      if (!dev.ran || dev.lessonKey !== lessonType) { dev.ran = new Set(); dev.lessonKey = lessonType; }
      X.ran = dev.ran;
      X.misses = 0;
      X.hi = -1;
      el.out.innerHTML = '';
      el.title.textContent = 'Console · ' + dev.name;
      el.where.textContent = dev.where;
      print(dev.kind === 'switch'
        ? ['<span class="m">Conectado pela porta de console de ' + esc(dev.name) + '.</span>', '<span class="m">Digite help para ver os comandos.</span>', '']
        : isWin(dev) ? DL.winBanner(dev)
        : ['<span class="m">Ubuntu 24.04 LTS · ' + esc(dev.name) + ' · conectado pelo console do rack</span>', '<span class="m">Digite help para ver os comandos. ↑ repete comandos anteriores.</span>', '']);
      const m = L();
      if (X.lesson) {
        // (a lesson already under way — reopened, or continued on another device — starts from its current step)
        const k = Math.min(curStep(), X.lesson.steps.length - 1), first = X.lesson.steps[k];
        print(['<span class="ok">Tarefa:</span> ' + esc(X.lesson.goal),
          '<span class="m">' + (m.stepText === 'hidden' ? 'Modo Experiente: descubra os passos. A ajuda mostra só a sintaxe.' : (k ? 'Passo atual: ' : 'Primeiro passo: ') + esc(first.text) + (m.id === 'iniciante' && stepCmd(first) && (!first.on || first.on === dev) ? ' · experimente <code>' + esc(stepCmd(first)) + '</code>' : '')) + '</span>', '']);
      }
      el.prompt.textContent = promptOf(dev);
      el.steps.dataset.k = '';
      el.side.scrollTop = 0;
      // Iniciante: the help card is open from the start
      toggleHelp(!!(m.autoHelp && X.lesson));
      renderMode();
      el.root.classList.add('is-open');
      X.open = true;
      applySkin();
      renderSide();
      setTimeout(() => el.input.focus({ preventScroll: true }), 40);
    }

    function close() {
      if (!X.open) return;
      X.open = false;
      cancelAnimationFrame(fx.raf);
      fx.raf = 0;
      el.root.classList.remove('is-open');
      el.input.blur();
      if (X.dev && X.dev.kind === 'switch') { X.dev.sw.mode = 'user'; X.dev.sw.cur = null; }
      game.onTerminalClose && game.onTerminalClose();
    }

    const COMPLETE = ['ip addr', 'ip link', 'ip route', 'ip link set eth0 up', 'ip addr add ', 'ip addr del ', 'ip route add default via ', 'ip route del default', 'ping -c 3 ', 'systemctl status ', 'systemctl restart ', 'systemctl start ', 'cat notas.txt', 'tail -n 20 /var/log/syslog', 'grep -c ', 'curl localhost', 'df -h', 'du -sh /var/log', 'journalctl --vacuum-size=200M', 'hostnamectl set-hostname ', 'hostname', 'whoami', 'uname -a', 'uptime', 'lscpu', 'free -h', 'responder ', 'tail -n 20 /var/log/auth.log', 'grep "Failed password" /var/log/auth.log', 'ss -tlnp', 'show running-config', 'show startup-config', 'copy running-config startup-config', 'enable', 'show interfaces status', 'configure terminal', 'interface gi0/', 'shutdown', 'no shutdown', 'end',
      'show vlan brief', 'show mac address-table', 'show interfaces trunk', 'switchport access vlan ', 'switchport mode access', 'switchport mode trunk', 'switchport trunk allowed vlan ',
      'ufw status', 'ufw enable', 'ufw allow ', 'ufw deny from ', 'ls -l ', 'chmod ', 'chown ', 'useradd -m -s /bin/bash ', 'usermod -aG ', 'passwd -l ', 'apt update', 'apt list --upgradable', 'apt upgrade -y', 'apt install -y ', 'tar czf ', 'rsync -a ', 'crontab -l',
      'ps aux --sort=-%cpu', 'ps aux --sort=-%mem', 'top', 'kill ', 'dmesg', 'journalctl -u ', 'cat /proc/mdstat', 'mdadm --detail /dev/md0', 'smartctl -H /dev/sd', 'certbot certificates', 'certbot renew', 'nginx -t',
      'systemctl reload ', 'ethtool eth0', 'ip -s link', 'nvidia-smi', 'traceroute ', 'timedatectl', 'sensors', 'upsc ups', 'speed auto', 'duplex auto'];
    el.input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter') {
        const v = el.input.value;
        el.input.value = '';
        X.hi = -1;
        run(v);
      } else if (ev.key === 'Escape') { ev.preventDefault(); close(); }
      else if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
        ev.preventDefault();
        if (!X.history.length) return;
        if (ev.key === 'ArrowUp') X.hi = X.hi < 0 ? X.history.length - 1 : Math.max(0, X.hi - 1);
        else X.hi = X.hi < 0 ? -1 : X.hi + 1 >= X.history.length ? -1 : X.hi + 1;
        el.input.value = X.hi < 0 ? '' : X.history[X.hi];
      } else if (ev.key === 'Tab') {
        ev.preventDefault();
        const v = el.input.value, pre = v.indexOf('sudo ') === 0 ? 'sudo ' : '', body = v.slice(pre.length);
        // PowerShell completes regardless of case
        const m = X.dev && isWin(X.dev) && DL.WIN_COMPLETE
          ? DL.WIN_COMPLETE.filter((c) => c.toLowerCase().indexOf(body.toLowerCase()) === 0 && c.toLowerCase() !== body.toLowerCase())
          : COMPLETE.filter((c) => c.indexOf(body) === 0 && c !== body);
        if (m.length === 1) el.input.value = pre + m[0];
        else if (m.length > 1) print(['<span class="m">' + m.map(esc).join('   ') + '</span>']);
      } else if (ev.key === 'l' && ev.ctrlKey) { ev.preventDefault(); ctx.clear(); }
      ev.stopPropagation();
    });
    el.close.addEventListener('click', close);
    // a Windows Server mission chosen in the side panel becomes the console's lesson
    function startMission(id) {
      const d = X.dev;
      if (!d || !LESSONS[id]) return;
      if (DL.winMissionStart) DL.winMissionStart(d, id);
      X.lesson = LESSONS[id](d);
      X.onDone = () => DL.winMissionDone(d, id, game);
      d.ran = new Set();
      d.lessonKey = id;
      X.ran = d.ran;
      X.misses = 0;
      el.steps.dataset.k = '';
      const m = L(), first = X.lesson.steps[0];
      print(['', '<span class="ok">Missão:</span> ' + esc(X.lesson.goal), '<span class="m">' + (m.stepText === 'hidden' ? 'Modo Experiente: descubra os passos.' : 'Primeiro passo: ' + esc(first.text) + (m.id === 'iniciante' && stepCmd(first) ? ' · experimente <code>' + esc(stepCmd(first)) + '</code>' : '')) + '</span>', ''], null, true);
      if (X.helpOpen) renderHelp();
      renderSide();
      // a step may already be true (e.g. the role was installed earlier)
      if (curStep() >= X.lesson.steps.length) finish();
      el.input.focus({ preventScroll: true });
    }
    // the answer field of a question step
    el.steps.addEventListener('submit', (ev) => {
      const f = ev.target.closest('[data-term-answer]');
      if (!f) return;
      ev.preventDefault();
      const v = f.elements.a.value;
      if (!answer(v, true)) { const inp = el.steps.querySelector('[data-term-answer] input'); if (inp) { inp.value = v; inp.select(); inp.focus({ preventScroll: true }); } }
      else el.input.focus({ preventScroll: true });
    });
    // keys typed in the answer field stay there (no game hotkeys); Esc closes the console as usual
    el.steps.addEventListener('keydown', (ev) => {
      if (!ev.target.closest('[data-term-answer]')) return;
      if (ev.key === 'Escape') { ev.preventDefault(); close(); }
      ev.stopPropagation();
    });
    // a lesson on two devices: leave this console and open the other one, on the same lesson (its progress stays)
    function hop(dev) {
      const s = X.lesson && X.lesson.steps[curStep()];
      dev = dev || (s && s.on);
      if (!dev || dev === X.dev || !X.lessonType) return false;
      const type = X.lessonType, done = X.onDone;
      close();
      open(dev, type, done);
      return true;
    }
    el.steps.addEventListener('click', (ev) => {
      const ms = ev.target.closest('[data-term-mission]');
      if (ms) { startMission(ms.dataset.termMission); return; }
      if (ev.target.closest('[data-term-act="hop"]')) { hop(); return; }
      if (!ev.target.closest('[data-term-act="cabling"]')) return;
      const d = X.dev;
      close();
      game.openCabling(d);
    });
    el.helpBtn.addEventListener('click', () => { toggleHelp(); el.input.focus({ preventScroll: true }); });
    el.help.addEventListener('click', (ev) => {
      const b = ev.target.closest('[data-help]');
      if (!b) return;
      el.help.querySelector('[data-help-out]').innerHTML = helpCard([b.dataset.help], L().helpDepth);
    });
    // clicking the output gives the focus back to the prompt — but not while the player selects text to copy
    el.out.addEventListener('click', () => { const s = window.getSelection && window.getSelection(); if (!s || s.isCollapsed) el.input.focus({ preventScroll: true }); });
    if (DL.onLearnChange) DL.onLearnChange(() => { renderMode(); if (X.open) { renderSide(); if (X.helpOpen) renderHelp(); } });
    el.root.addEventListener('pointerdown', (ev) => { if (ev.target === el.root) close(); });

    return {
      open, close,
      get isOpen() { return X.open; },
      get device() { return X.dev; },
      get lesson() { return X.lesson; },
      get step() { return curStep(); },
      refresh() { if (X.open) { renderSide(); if (X.lesson && curStep() >= X.lesson.steps.length) finish(); } },
      run, startMission, answer, hop,
    };
  };
})();
