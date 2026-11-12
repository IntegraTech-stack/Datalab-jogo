# Problemas por patente

Os 180 problemas novos: 20 para cada patente, de Júnior I a Tech Lead. Eles seguem o formato dos 20 do Estagiário (`assets/js/problems-data.js`).

**Situação (30/10/2026):** a proposta foi aprovada.
- **Fase 1 (Júnior I a III) está implementada.** Os 60 problemas estão em `problems-data.js` e no `seed_scenarios.sql`.
- **Fase 2 (Pleno I a III) está implementada** (31/10/2026). São mais 60 problemas, testados de ponta a ponta com `node tests/sim-problems.js`.
- **Fase 3 (Sênior) está implementada** (31/10/2026): 20 problemas e os comandos novos de switch e Linux.
- **Fase 4 (Especialista e Tech Lead) está implementada** (31/10/2026): 40 problemas e os comandos de diagnóstico avançado. Com ela, as 200 missões estão prontas.
- As tabelas abaixo mostram a versão implementada. Onde ela mudou em relação à proposta, a linha diz **(mudou)** e explica o motivo.

Decisões que valem para este documento:
- O jogo continua com **10 níveis**: a Trainee segue dentro do Estagiário.
- **Júnior e Pleno usam só os comandos que já existem**: Linux, switch e Windows Server.
  A dificuldade sobe de quatro jeitos: mais passos, mais consoles ao mesmo tempo, menos cola e causa escondida.
  Esses problemas ainda precisam de código em duas frentes: **cenários** (o que quebra quando o problema começa, como IP errado ou serviço parado) e **sondas** (o que o jogo confere, como "o servidor está especializado como DNS").
- **Comandos novos só a partir de Sênior.**
- Os níveis de liberação são os do código atual (`build.js`), que vêm um nível antes da lista antiga com Trainee.

---

## Curva de dificuldade

| Nível | Patente | Dificuldade | XP por problema | XP para subir | Problemas diferentes | Quanta ajuda o jogador recebe |
|---|---|---|---|---|---|---|
| 1 | Estagiário(a) ✅ | 1–3 | 30–80 | 300 | 6 | Comando pronto em cada passo |
| 2 | Júnior I | 2–3 | 50–90 | 450 | 7 | Comando pronto em cada passo |
| 3 | Júnior II | 2–3 | 60–100 | 600 | 8 | Comando pronto só no 1º passo |
| 4 | Júnior III | 3 | 80–120 | 800 | 9 | Sem comando pronto, só os cartões de ajuda |
| 5 | Pleno I | 3–4 | 100–150 | 1000 | 10 | O passo diz o sintoma, não a causa ("descubra por quê") |
| 6 | Pleno II | 3–4 | 120–170 | 1300 | 10 | Idem, com vários equipamentos por problema |
| 7 | Pleno III | 4 | 130–180 | 1600 | 11 | Idem, com parte da solução delegada à equipe |
| 8 | Sênior | 4–5 | 160–220 | 2000 | 12 | Comandos novos (VLAN, firewall, usuários, backup) |
| 9 | Especialista | 5 | 180–260 | 2500 | 12 | Comandos novos (desempenho, RAID, certificados, banco) |
| 10 | Tech Lead | 5 | 220–320 | 3000 | 12 | Incidentes grandes, várias causas, equipe e decisões |

Cada patente continua exigindo a sua **missão** e também o **XP**: são as duas coisas, como foi decidido para o Estagiário.
As patentes mais altas têm XP por problema maior, então o número de problemas resolvidos por patente sobe pouco: de cerca de 7 a 12.

Onde cada problema acontece:
- **Linux**: terminal do servidor.
- **Switch**: CLI do switch.
- **Windows**: servidor especializado como Windows Server.
- **2 consoles / 3 consoles**: o problema abre em mais de um equipamento.
- **Construir**: comprar e instalar algo.
- **Infra**: janela de Infra (especialização, VMs).
- **Equipe**: atribuir ou dar ordens.

Um problema só é sorteado quando o jogador tem o equipamento que ele exige, a mesma regra do Estagiário. Exemplo: problema de Windows só aparece para quem tem um Windows Server.

---

## 2 · Júnior I — mais servidores na mesma sala
Missão: *instalar mais 2 servidores numa sala com switch* · Libera: estações de atendimento e escritório, switch 16p, notebook, estação técnica, mesa com 3 monitores, NAS 2 baias, ar de precisão.
Tema: sair de 1 servidor para vários. Comparar, documentar e consertar configuração errada.

| # | Problema | Dif | XP | Onde | O que o jogador faz |
|---|---|---|---|---|---|
| 1 | Configurar o segundo servidor | 3 | 80 | Linux | *Automático* ao instalar o servidor. Mesmo roteiro do Estagiário, mas sem o comando pronto no passo do IP e da rota. |
| 2 | Qual disco está mais cheio? **(mudou)** | 2 | 60 | 2 consoles | `df -h` nos dois e responde o nome. Antes era "quem tem mais memória", mas dois servidores do mesmo modelo têm a mesma RAM e a pergunta não teria resposta. |
| 3 | IP trocado no servidor | 3 | 80 | Linux | O servidor ficou com um IP errado. Remove com `ip addr del`, põe o certo e testa com ping. |
| 4 | Gateway errado | 3 | 80 | Linux | A rota padrão aponta para .254. `ip route` mostra o erro: apaga a rota, cria a certa e testa com ping. |
| 5 | Os dois servidores se enxergam? | 2 | 50 | 2 consoles | Vê o IP do vizinho e faz ping nele a partir do primeiro servidor. |
| 6 | SSH parado | 2 | 60 | Linux | `systemctl status ssh` mostra o serviço parado: inicia com `start` e confere a porta 22 com `ss -tlnp`. |
| 7 | Quantas portas do switch estão em uso? | 2 | 50 | Switch | `show interfaces status` e responde quantas estão como connected. |
| 8 | Site fora: parado ou travado? | 3 | 80 | Linux | O nginx está *inactive*, não *failed*: alguém parou. Acha no syslog com `grep nginx` e responde a hora; depois inicia o serviço. |
| 9 | O servidor reiniciou? | 2 | 50 | Linux | Usa `uptime` e o syslog e responde há quantos minutos o servidor está ligado. |
| 10 | Quanta memória tem o servidor? **(mudou)** | 2 | 50 | Linux | `free -h` e responde os GB de RAM. Ocupa o lugar do nº 2, que foi para cima. |
| 11 | Em que portas estão os dois servidores? | 2 | 60 | Switch | Responde as duas portas: são duas perguntas no mesmo problema. |
| 12 | Duas falhas no mesmo servidor | 3 | 90 | Linux | A interface está desligada e o nginx caiu. Liga a eth0, testa com ping, reinicia o nginx e testa com curl. |
| 13 | Monte o posto de atendimento | 2 | 50 | Construir | Instala a estação de atendimento e uma cadeira. |
| 14 | Quem entrou no servidor? | 2 | 50 | Linux | `grep "Accepted" /var/log/auth.log` e responde o usuário que fez login. |
| 15 | Dois servidores com o mesmo nome | 3 | 80 | 2 consoles | `hostname` nos dois: o segundo está com o nome do primeiro. Renomeia com `hostnamectl`. |
| 16 | Quantas senhas erradas? | 2 | 60 | Linux | `grep -c "Failed password"` e responde o número. |
| 17 | Ficha dos dois servidores | 2 | 60 | 2 consoles | `lscpu` nos dois e responde o total de núcleos. |
| 18 | Antes de reiniciar o switch | 2 | 60 | Switch | Compara running com startup, responde qual porta perdeu a descrição e salva. |
| 19 | Esse IP está livre? | 2 | 50 | Linux | Faz ping no IP reservado para o servidor novo e responde se ele está livre ou em uso. |
| 20 | Servidor sem rede (sem cola) | 3 | 90 | 2 consoles | O mesmo caso do nº 20 do Estagiário, sem comandos prontos e com os passos do switch juntos. |

## 3 · Júnior II — camada física
Missão: *ligar o cabo de rede de mais 3 servidores* · Libera: switch PoE 24p, access point, câmera IP, rack de parede, carrinho KVM, placa perfurada.
Tema: cabo, porta e link. Ensina a separar problema físico de problema de configuração.

| # | Problema | Dif | XP | Onde | O que o jogador faz |
|---|---|---|---|---|---|
| 1 | Cabear o lote novo | 2 | 70 | Construir | *Automático*. Liga o cabo de 3 servidores novos no switch. |
| 2 | NO-CARRIER ou DOWN? | 3 | 90 | Linux | O defeito é sorteado entre cabo e interface. Diagnostica, responde "cabo" ou "interface" e corrige. |
| 3 | Porta notconnect | 3 | 90 | 2 consoles | No servidor tudo parece certo, mas a porta dele no switch está notconnect. Refaz o cabo e confere de novo. |
| 4 | Dois racks bagunçados | 2 | 60 | Construir | Organiza os cabos de 2 racks. |
| 5 | Câmera na sala | 2 | 60 | Construir | Instala uma câmera IP. Só conta quando ela tem energia: precisa de um switch PoE na mesma sala (o jogo já calcula isso). |
| 6 | Wi-Fi para os visitantes | 2 | 60 | Construir | Instala um access point, com a mesma regra de PoE. |
| 7 | Duas portas fora **(mudou)** | 3 | 100 | Switch | Uma porta em err-disabled e outra desligada à mão (disabled). Reativa as duas e salva. |
| 8 | Quem está na porta gi0/N? | 2 | 60 | Switch | A pergunta ao contrário: dada a porta, responde qual servidor está ligado nela. |
| 9 | Cabo na porta errada | 2 | 60 | Construir | O cabeamento mostra um cabo vermelho (conexão errada). Corrige e testa com ping. |
| 10 | Rack esquentando | 2 | 60 | Construir | Instala placa perfurada na frente do rack. |
| 11 | Link instável | 3 | 90 | Linux | O syslog mostra a eth0 caindo e voltando. Conta as quedas com `grep`, responde o número e troca o cabo. |
| 12 | Configurar o terceiro servidor | 3 | 90 | Linux | *Automático*. Roteiro de configuração com comando pronto só no 1º passo. |
| 13 | Quantas portas livres? **(mudou)** | 2 | 60 | Switch | Conta as portas livres e responde. A compra do switch maior ficou no Júnior III, nº 14. |
| 14 | IP de gerência do switch **(mudou)** | 2 | 60 | Switch | Acha o IP do switch no `show running-config` e faz `ping` do switch até um servidor. Antes a pergunta era só "o ping funcionou?", que sempre teria a mesma resposta. |
| 15 | Servidor sumiu do monitor | 3 | 90 | 2 consoles | O ping do vizinho falha. No servidor, a interface está desligada: liga e testa. |
| 16 | Porta desligada e esquecida | 3 | 90 | Switch | A porta está *disabled* (alguém deu `shutdown`): `no shutdown` e salva. |
| 17 | Qual servidor não tem SSH? | 3 | 80 | 2 consoles | `ss -tlnp` nos dois, responde qual não escuta na 22 e inicia o ssh nele. |
| 18 | Ataque em dois servidores | 3 | 90 | 2 consoles | Filtra as senhas erradas nos dois e responde o IP que aparece em ambos. |
| 19 | Disco cheio (sem cola) | 3 | 90 | Linux | O caso do disco cheio sem os comandos prontos. |
| 20 | Site fora em dois servidores | 3 | 100 | 2 consoles | nginx caído nos dois: reinicia e testa os dois. |

## 4 · Júnior III — terminal sem cola e primeiro Windows
Missão: *colocar mais 3 servidores online pelo terminal* · Libera: mesa com 4 monitores, estação de administrador, switch 48p, NAS 4 baias, quadro PDU.
Tema: configurar do zero sem comando pronto. O Windows Server entra aqui, só instalação e rede.

| # | Problema | Dif | XP | Onde | O que o jogador faz |
|---|---|---|---|---|---|
| 1 | Servidor novo, sem roteiro | 3 | 100 | Linux | *Automático*. Configurar com só os cartões de ajuda. |
| 2 | Pegou o IP de outro servidor **(mudou)** | 3 | 110 | Linux | O servidor ficou com o IP de outro. Responde de quem é o IP, remove e põe o certo. No jogo o IP de cada servidor é fixo, então "escolher o próximo livre" não funcionaria. |
| 3 | O chamado veio com gateway errado **(mudou)** | 3 | 110 | Linux | *Automático* num servidor novo. O gateway do chamado (.254) não responde, e o certo está anotado em `notas.txt`. |
| 4 | Instalar o Windows Server | 3 | 110 | Windows | *Automático* ao especializar um servidor como Windows: instalação completa (mídia, senha, IP, nome). |
| 5 | Windows com nome padrão **(mudou)** | 3 | 100 | Windows | Voltou da reinstalação como WIN-…: renomeia e reinicia. O IP fixo já faz parte do nº 4. |
| 6 | Windows com 169.254 | 3 | 100 | Windows | `ipconfig /all` mostra APIPA: dá o IP fixo e testa. |
| 7 | Adaptador desabilitado | 2 | 80 | Windows | `Get-NetAdapter` mostra Disabled: `Enable-NetAdapter` e ping. |
| 8 | DNS do DC apontando para fora **(mudou)** | 3 | 100 | Windows | O controlador de domínio consulta 8.8.8.8 e não acha o próprio domínio: aponta para ele mesmo (127.0.0.1). É o mesmo comando da proposta, mas só precisa de um Windows, não de dois. |
| 9 | Três falhas de rede de uma vez | 3 | 110 | Linux | Interface desligada, sem IP e sem rota. Corrige as três. |
| 10 | Voltou da reinstalação | 3 | 100 | Linux | O nome voltou a ser localhost e o servidor está sem IP: arruma os dois. |
| 11 | Teste de malha | 3 | 120 | 3 consoles | Faz ping de um servidor em outros três, responde qual falha e conserta ele. |
| 12 | NAS para os arquivos | 2 | 80 | Construir | Instala um NAS 4 baias. No jogo o NAS não usa cabo. |
| 13 | Energia do rack | 2 | 80 | Construir | Instala o quadro PDU no rack. |
| 14 | Trocar o switch lotado | 3 | 100 | Construir | Instala um switch 48p e passa pelo menos um servidor para ele. |
| 15 | O IIS já está instalado? | 3 | 100 | Windows | `Get-WindowsFeature`: responde se o Web-Server está instalado e instala. |
| 16 | Quem reiniciou o Windows? **(mudou)** | 3 | 100 | Windows | `Get-WinEvent -LogName System`: responde o **usuário** do evento 1074. Antes era o horário, que muda com o fuso de quem joga. |
| 17 | DNS do Windows parado | 3 | 100 | Windows | `Get-Service DNS` mostra Stopped: `Start-Service` e testa com `Resolve-DnsName`. |
| 18 | nginx não sobe com o disco cheio | 3 | 120 | Linux | O restart falha enquanto o disco está cheio. Tem que limpar antes e só depois reiniciar. |
| 19 | IP a mais na interface | 3 | 90 | Linux | A eth0 tem um segundo IP que não devia: remove o IP sobrando. |
| 20 | Documente o servidor | 3 | 100 | 2 consoles | Três respostas: o IP, a porta no switch e os núcleos. |

## 5 · Pleno I — diagnóstico (a causa fica escondida)
Missão: *resolver você mesmo 3 problemas* · Libera: servidor avançado, estação de NOC, workstation, elevador de servidor.
Tema: o passo diz só o sintoma. Começa o Active Directory e entram as dependências entre serviços.

| # | Problema | Dif | XP | Onde | O que o jogador faz |
|---|---|---|---|---|---|
| 1 | Site fora: descubra a causa | 4 | 140 | Linux | A causa é sorteada entre serviço, interface, disco e cabo. Os passos dizem só "descubra", "corrija" e "prove com curl". |
| 2 | Servidor sumiu: servidor ou switch? **(mudou)** | 4 | 150 | 2 consoles | A causa é sorteada entre interface do servidor, porta em erro e porta desligada no switch. Responde de que lado está o defeito e corrige. Cabo e rota saíram porque já aparecem em outros problemas. |
| 3 | Web sem DNS | 3 | 110 | Infra | O Web/API rende pouco: falta um servidor DNS. Especializa um servidor como DNS. |
| 4 | Criar o domínio | 4 | 140 | Windows | Instala o AD DS e promove a floresta `corp.datalab.local`. |
| 5 | OU e contas da TI | 3 | 120 | Windows | Cria a OU TI e 2 usuários habilitados. |
| 6 | "Minha conta travou" | 3 | 110 | Windows | `Search-ADAccount -LockedOut`, o evento 4740 e `Unlock-ADAccount`. |
| 7 | Saiu da empresa | 3 | 100 | Windows | Desabilita a conta (não exclui). |
| 8 | Grupo do suporte | 3 | 110 | Windows | Cria o grupo Suporte e põe 2 pessoas nele. |
| 9 | Nome para o site | 3 | 120 | Windows | Registro A `web` apontando para o servidor web; testa com `Resolve-DnsName`. |
| 10 | www | 3 | 110 | Windows | CNAME `www` apontando para `web`. |
| 11 | Sala quente | 3 | 100 | Construir | Instala ar de precisão. O jogo não simula a temperatura da sala, então o problema só pede a instalação. |
| 12 | O banco precisa de mais máquina | 3 | 120 | Construir + Infra | Instala um servidor avançado e especializa ele como Banco de dados. |
| 13 | Especialize o banco | 3 | 110 | Infra | Especializa um servidor como Banco de dados e cumpre os requisitos (RAM, SSD). |
| 14 | Ataque e SSH derrubado | 4 | 130 | Linux | Responde o IP do atacante e sobe o ssh de novo. |
| 15 | Posto de NOC **(mudou)** | 2 | 100 | Construir | Instala a estação de NOC. Pôr alguém sentado nela saiu, porque o jogo não tem como conferir quem usa cada mesa. |
| 16 | Mexeram na porta errada | 4 | 140 | Switch | Um colega desligou a porta errada e a certa continua em erro. Arruma as duas e salva. |
| 17 | Esqueci a senha | 3 | 110 | Windows | Redefine a senha com `Set-ADAccountPassword -Reset`. |
| 18 | Gateway responde, internet não | 4 | 130 | Linux | Depois de um reinício a rota padrão sumiu: o gateway responde (é a mesma rede), mas o 8.8.8.8 não. |
| 19 | Primeira VM | 3 | 120 | Infra | Especializa um nó de virtualização, cria uma VM Web e liga. |
| 20 | Dois servidores fora, duas causas | 4 | 150 | 3 consoles | Dois servidores fora ao mesmo tempo, cada um por um motivo. |

## 6 · Pleno II — escala e serviços de rede
Missão: *ter 8 servidores seus online ao mesmo tempo* · Libera: switch 10G, switch PoE+ 48p, NAS 8 baias, nobreak.
Tema: DHCP e DNS da empresa, VMs, capacidade e falha em cascata.

| # | Problema | Dif | XP | Onde | O que o jogador faz |
|---|---|---|---|---|---|
| 1 | DHCP do escritório | 4 | 160 | Windows | Instala o DHCP, cria o escopo, define gateway e DNS e autoriza no AD. |
| 2 | PCs com IP e sem internet | 4 | 150 | Windows | Falta a opção Router no escopo: `Set-DhcpServerv4OptionValue`. |
| 3 | DHCP não entrega IP | 3 | 130 | Windows | O servidor não está autorizado: `Add-DhcpServerInDC`. |
| 4 | Quantos PCs pegaram IP? | 3 | 120 | Windows | `Get-DhcpServerv4Lease` e responde a quantidade. |
| 5 | As estações não pegam IP **(mudou)** | 4 | 150 | Windows | O serviço DHCP parou: acha, vê no log, inicia e confere as concessões. O caso do DNS parado ficou no nº 18, que já falava dele. |
| 6 | Registro DNS faltando | 3 | 130 | Windows | O servidor novo não resolve pelo nome: cria o registro A. |
| 7 | Auditoria dos 8 | 3 | 130 | Linux | *Automático* ao chegar em 8 servidores. Faz ping em todos e responde quantos estão online. |
| 8 | Nó de VMs no limite | 4 | 150 | Infra | Duas VMs de teste tomam 95% da RAM do nó. Desliga ou remove VMs até a RAM reservada ficar abaixo de 70%. |
| 9 | DNS redundante | 3 | 130 | Infra | Cria uma VM DNS para o caso do DNS principal cair. |
| 10 | Jogos precisam de 10G | 4 | 150 | Construir + Infra | O servidor de jogos não rende: instala o switch 10G e liga nele. |
| 11 | Nobreak na sala | 3 | 130 | Construir | Instala o nobreak na sala dos servidores. |
| 12 | Backup do banco | 3 | 130 | Construir | Instala um NAS 8 baias na sala do banco. |
| 13 | E-mail da empresa | 3 | 130 | Infra | Especializa o E-mail e cumpre a dependência de DNS. |
| 14 | Servidor novo no padrão **(mudou)** | 4 | 170 | Linux | *Automático*. Rede, nome, SSH e internet, só com o resultado esperado em cada passo. "Dois servidores seguidos" precisaria de dois servidores novos ao mesmo tempo, o que é raro. |
| 15 | Servidor membro acha o domínio | 4 | 150 | Windows | Aponta o DNS para o DC e resolve o domínio. Para isso funcionar, o jogo passou a consultar o DC de verdade quando um servidor usa ele como DNS. |
| 16 | Pasta do financeiro | 4 | 160 | Windows | Cria a pasta e o compartilhamento para o grupo Financeiro. |
| 17 | Pasta aberta para todos | 4 | 170 | Windows | `icacls` mostra BUILTIN\Users: corta a herança e dá acesso só ao grupo. |
| 18 | Falha em cascata | 4 | 170 | 3 consoles | Web e e-mail alertam ao mesmo tempo. Responde a causa raiz (o DNS) e conserta só ela. |
| 19 | Três alertas de uma vez | 4 | 170 | 3 consoles | Disco cheio, serviço caído e porta em erro em três equipamentos. |
| 20 | Cabe mais um cliente? | 3 | 120 | Infra | Responde quantos vCPUs ainda estão livres no nó (threads menos os das VMs ligadas). |

## 7 · Pleno III — trabalhar com a equipe
Missão: *dar 15 ordens à equipe* · Libera: servidor high-end, storage SAN, cilindros FM-200.
Tema: triar, delegar e montar acessos para pessoas. Parte da solução é atribuir a tarefa.

| # | Problema | Dif | XP | Onde | O que o jogador faz |
|---|---|---|---|---|---|
| 1 | Triagem | 4 | 170 | 3 consoles + Equipe | Três alertas: diagnostica e responde a causa de cada um, conserta um e atribui dois. |
| 2 | Quem resolve isso? | 3 | 130 | Equipe | Um alerta (porta do switch ou serviço). Responde qual função cuida dele, conforme as tarefas que cada função tem no jogo, e dá a ordem. |
| 3 | Funcionário novo | 4 | 180 | Windows | Cria a conta na OU, põe no grupo e dá acesso à pasta. |
| 4 | Desligamento | 3 | 140 | Windows | Responde de quantos grupos a pessoa fazia parte e desabilita a conta. |
| 5 | Permissão do jeito certo | 4 | 180 | Windows | Grupo Global dentro de grupo DomainLocal, e a permissão vai para o DomainLocal. |
| 6 | Uma pasta por departamento | 4 | 170 | Windows | Cria 3 pastas, cada uma restrita ao seu grupo. |
| 7 | Quem errou a senha? | 4 | 150 | Windows | `Get-WinEvent -LogName Security` e responde o usuário. |
| 8 | Storage SAN | 3 | 140 | Construir + Infra | Instala a SAN na sala do servidor de arquivos. |
| 9 | Proteção contra incêndio | 3 | 130 | Construir | Instala FM-200 na sala com servidores high-end. |
| 10 | Banco no high-end | 4 | 160 | Construir + Infra | Move o banco para um servidor high-end. |
| 11 | O conserto da equipe não durou | 4 | 170 | Linux | O alerta voltou: o nginx cai de novo porque o disco continua cheio. Resolve a causa raiz. |
| 12 | Passagem de turno | 3 | 140 | Monitor | Responde quantos alertas estão abertos e qual servidor está fora. |
| 13 | Conta de serviço bloqueando | 4 | 170 | Windows | Pelo log, responde de qual máquina vêm as senhas erradas. |
| 14 | DNS de todos os servidores | 4 | 160 | Windows | Cria 3 registros A. |
| 15 | Salvar todos os switches | 3 | 140 | 2 consoles | Dois switches com mudança não salva: salva os dois. |
| 16 | Padronizar os nomes | 3 | 140 | 2 consoles | Renomeia dois servidores. |
| 17 | A auditoria precisa ler o Financeiro **(mudou)** | 3 | 130 | Windows | Dá leitura (Read), e só leitura, ao grupo Auditoria no compartilhamento. "Cobertura da noite" saiu porque os turnos não têm como ser conferidos pelo problema. |
| 18 | Incidente com a equipe | 4 | 180 | 3 consoles + Equipe | Conserta dois servidores e atribui o terceiro. |
| 19 | Atacante em três servidores | 4 | 160 | 3 consoles + Equipe | Responde o IP comum aos três e atribui o bloqueio à segurança. |
| 20 | DHCP esgotado **(mudou)** | 4 | 170 | Windows | O escopo só tem 3 endereços. Responde quantos empresta hoje e recria o escopo com 50 ou mais. Não dá para criar um segundo escopo na mesma rede. |

---

## 8 · Sênior — comandos novos: VLAN, firewall, usuários, pacotes, backup
Missão: *expandir o terreno e resolver mais 5 problemas* · Libera: switch 25G, biblioteca de fitas, setups gamer e de streaming.

**Comandos novos (implementados)**
- **Switch**: `vlan N` / `name`, `switchport mode access|trunk`, `switchport access vlan N`, `switchport trunk allowed vlan`, `show vlan brief`, `show mac address-table` e `show interfaces trunk`. A coluna Vlan do `show interfaces status` agora é real.
- **Linux**: `useradd`, `usermod -aG`, `passwd -l/-S`, `id`, `ls -l`, `chmod`, `chown`, `apt update/upgrade/install`, `apt list --upgradable`, `ufw status/allow/deny/enable/delete`, `tar czf/tzf`, `rsync -a` e `crontab -l`. Para gravar no cron é `echo "linha" | crontab -`: o `crontab -e` não abre editor no jogo.
- **Regras novas da rede**: o gateway está na VLAN 10. Um servidor numa porta de outra VLAN, ou numa porta trunk, sai da rede. Com o firewall ligado, o site só responde se a porta 80 estiver liberada.

| # | Problema | Dif | XP | Onde | O que o jogador faz |
|---|---|---|---|---|---|
| 1 | Uma VLAN para as câmeras **(mudou)** | 4 | 180 | Switch | Cria a VLAN 30 CAMERAS, põe 2 portas livres nela e salva. Antes era uma VLAN 20 para servidores, mas servidor fora da VLAN 10 perde o gateway. Por isso o nº 19 (câmeras) virou este. |
| 2 | Servidor na VLAN errada | 4 | 170 | 2 consoles | O ping falha: `show vlan brief` mostra a porta na VLAN de quarentena. Corrige e salva. |
| 3 | Trunk entre switches **(mudou)** | 5 | 210 | 2 consoles | Configura uma porta livre de cada switch como trunk levando as VLANs 10 e 30 e salva os dois. O cabo entre switches não existe no jogo, então o problema é só a configuração. |
| 4 | De quem é esse MAC? | 4 | 160 | Switch | O alerta traz o MAC no formato do Linux (52:54:…). O `show mac address-table` mostra no formato Cisco (5254.…): responde a porta. |
| 5 | Ligar o firewall sem se trancar | 5 | 200 | Linux | Libera 22 e 80 **antes** do `ufw enable`. Se ligar primeiro, o terminal avisa que numa sessão SSH o acesso teria sido perdido. Pelo console do rack ainda dá para corrigir. |
| 6 | Bloquear o atacante | 4 | 170 | Linux | Acha o IP no auth.log e bloqueia com `ufw deny from`. |
| 7 | Conta para o desenvolvedor | 4 | 160 | Linux | `useradd`, grupo deploy e confere com `id`. |
| 8 | Senha num arquivo aberto | 4 | 180 | Linux | `ls -l` mostra o arquivo legível por todos: responde o modo atual (644) e corrige com `chmod 640` e `chown root:app`. |
| 9 | Conta vazada | 4 | 170 | Linux | Bloqueia com `passwd -l` e responde de onde veio o login. |
| 10 | Atualizações de segurança | 4 | 170 | Linux | `apt update`, vê o que tem para atualizar, atualiza e reinicia o nginx. |
| 11 | Instalar o fail2ban | 4 | 160 | Linux | `apt install` e confere o serviço. |
| 12 | Backup do /etc | 4 | 170 | Linux | `tar czf` para /backup e confere o arquivo. |
| 13 | Cópia do site em outro servidor **(mudou)** | 4 | 180 | Linux | `rsync -a` para outro servidor da rede. No jogo o NAS não tem IP para receber a cópia. |
| 14 | Backup todo dia às 2h | 5 | 200 | Linux | Agenda com `echo "0 2 * * * …" \| crontab -`. |
| 15 | O backup não roda | 5 | 210 | Linux | O syslog mostra "bkp.sh: not found". Compara o cron com o `ls /usr/local/bin`, responde o nome certo e corrige. |
| 16 | Fitas fora do prédio **(mudou)** | 4 | 170 | Construir | Instala a biblioteca de fitas. Não existe backup semanal para ativar no jogo. |
| 17 | Rede de storage 25G **(mudou)** | 4 | 180 | Construir | Instala o switch 25G e passa um servidor para ele. A storage não usa cabo no jogo. |
| 18 | Switch novo com a VLAN dos servidores **(mudou)** | 5 | 220 | Construir + Switch | Switch novo e a VLAN 20 SERVIDORES nele. Cabear servidores já é a missão do Júnior II. |
| 19 | Servidor numa porta trunk **(mudou)** | 4 | 170 | 2 consoles | A porta do servidor virou trunk por engano: `show interfaces trunk`, volta para access e salva. As câmeras viraram o nº 1. |
| 20 | Duas causas: VLAN e firewall | 5 | 220 | 2 consoles | O servidor está inacessível por dois motivos ao mesmo tempo: a porta na VLAN errada e o ufw bloqueando a 80. |

## 9 · Especialista — desempenho, confiabilidade e custo
Missão: *fechar 3 meses com caixa positivo* · Libera: servidor GPU (IA).

**Comandos novos (implementados)**
- **Processos**: `top`, `ps aux --sort=-%cpu|-%mem`, `kill` / `pkill`. A carga do `uptime` passa a vir dos processos.
- **Logs**: `journalctl -u <serviço> --since`, `dmesg`.
- **Discos**: `cat /proc/mdstat`, `mdadm --detail/--fail/--remove/--add` (a reconstrução leva uns 20 segundos), `smartctl -H`.
- **Certificados**: `openssl x509 -enddate`, `certbot certificates/renew`, `systemctl reload`.
- **Configuração**: `nginx -t`, `sed -i 's/…/…/'`, `cp`.
- **Rede**: `ethtool`, `ip -s link`, `traceroute`, `ping` por nome (usa o DNS do `/etc/resolv.conf`), `ss -tn`. No switch: `speed` / `duplex`.
- **Hardware e banco**: `nvidia-smi` (e `-pl`), `sudo -u postgres psql -c "…"`, `pg_dump app > arquivo`, `psql app < arquivo`, `tar xzf … -C /`, `timedatectl`.

| # | Problema | Dif | XP | Onde | O que o jogador faz |
|---|---|---|---|---|---|
| 1 | CPU em 100% | 5 | 200 | Linux | `top`, responde o PID do processo descontrolado, `kill` e confere a carga. |
| 2 | A aplicação sumiu | 5 | 210 | Linux | `dmesg` mostra o OOM killer: responde o processo (java), reinicia e confere o `journalctl -u app`. |
| 3 | RAID degradado **(mudou)** | 5 | 240 | Linux | `mdstat` mostra [U_]: responde a partição com falha, tira do RAID e põe o disco reserva (sdc1). O servidor já tem um disco reserva, então não precisa construir nada. |
| 4 | Disco morrendo **(mudou)** | 5 | 220 | Linux | `smartctl -H` mostra FAILED: marca como falho, remove e põe o reserva, antes de ele quebrar. Mesmo motivo do nº 3. |
| 5 | Certificado vencendo | 5 | 200 | Linux | Responde em quantos dias vence, `certbot renew` e `systemctl reload nginx`. |
| 6 | nginx não volta depois da mudança | 5 | 210 | Linux | `nginx -t` mostra a linha com erro: corrige com `sed` (ou volta o `.bak` com `cp`) e reinicia. |
| 7 | Link lento | 5 | 220 | 2 consoles | `ethtool` mostra 100 Mb half duplex e o `ip -s link` mostra erros. Põe a porta do switch em `speed auto` / `duplex auto` e salva. |
| 8 | Vive no swap **(mudou)** | 5 | 200 | Linux | `free -h` e `ps aux --sort=-%mem` mostram o java vazando memória: reinicia a aplicação. Era "erros na interface", que entrou no nº 7. |
| 9 | Servidor de IA | 5 | 240 | Construir + Infra | Servidor GPU, ar de precisão e especialização IA com tudo o que ela pede. |
| 10 | GPU a 91 °C **(mudou)** | 5 | 220 | Linux | `nvidia-smi` e limite de potência com `nvidia-smi -pl 250` até ficar abaixo de 80 °C. O ar de precisão já aparece no nº 9. |
| 11 | Banco recusando conexões | 5 | 220 | Linux | `journalctl -u app` mostra "too many clients"; `psql` conta as conexões (responde) e reinicia a aplicação. |
| 12 | Backup antes da migração | 5 | 200 | Linux | `pg_dump app > /backup/app.sql`. |
| 13 | Apagaram a configuração da aplicação | 5 | 200 | Linux | A aplicação não sobe sem o `config.env`: acha o backup de ontem, `tar xzf … -C /` e sobe a aplicação. |
| 14 | Quem abriu a porta 8080? **(mudou)** | 5 | 200 | Linux | `ss -tlnp` e `ps aux`: responde o usuário que deixou um servidor de arquivos aberto e encerra o processo. "Conta de luz" saiu: o jogo não mostra o consumo por sala de um jeito que dê para conferir. |
| 15 | O relógio está errado **(mudou)** | 4 | 180 | Linux | `timedatectl` mostra o NTP desligado: `timedatectl set-ntp true`. "Servidores ociosos" saiu porque o Tech Lead nº 15 já trata de VMs paradas. |
| 16 | Erro da aplicação **(mudou)** | 4 | 200 | Linux | `journalctl -u app --since` e responde o código do erro. Era o nº 18; "SLA do cliente" saiu porque o Monitor não guarda o histórico do mês. |
| 17 | A internet some no caminho **(mudou)** | 5 | 210 | Linux | `traceroute`: responde o último salto que responde e se o problema é dentro ou na operadora. Era o nº 19; "Planejamento do trimestre" saiu porque não há dados de clientes para conferir. |
| 18 | Corrente de falhas | 5 | 260 | 2 consoles | O log da aplicação mostra timeout no banco: responde em qual servidor está, libera o disco cheio lá e reinicia a aplicação. |
| 19 | Carga alta toda hora **(novo)** | 5 | 220 | Linux | `top` cheio de gzip: o cron roda a compactação todo minuto. Corrige para "0 * * * *" e encerra os gzip acumulados. |
| 20 | Não acha nenhum nome **(novo)** | 4 | 190 | Linux | `ping` por nome falha: o `/etc/resolv.conf` aponta para um DNS que não existe. Corrige com `sed` e testa. |

## 10 · Tech Lead — incidentes grandes e decisões
Missão: *ter 15 servidores seus online ao mesmo tempo* · Libera: storage all-flash.

**Comandos novos (implementados)**
- **Alta disponibilidade e energia**: IP virtual (o `ip addr add` de um IP extra num servidor faz o IP responder por ele) e `upsc` (nobreak).
- **Temperatura e acessos**: `sensors`, `gpasswd -d`.
- **SSH**: o `/etc/ssh/sshd_config` existe e é corrigido com `sed`.

| # | Problema | Dif | XP | Onde | O que o jogador faz |
|---|---|---|---|---|---|
| 1 | Post-mortem | 5 | 240 | Linux | Lê o syslog da madrugada e responde o que caiu, a causa raiz e o comando que resolveu. |
| 2 | Janela de manutenção | 5 | 260 | 2 consoles | Confere que o outro servidor segura o site, atualiza este e devolve com o nginx novo. |
| 3 | Failover do site | 5 | 280 | 3 consoles | O principal caiu: o reserva assume o IP virtual 10.0.1.250 e um terceiro servidor confirma. |
| 4 | Teste de recuperação de desastre | 5 | 300 | Linux | Restaura o dump no servidor reserva (`psql app < /backup/app.sql`) e responde quantos pedidos voltaram. |
| 5 | Storage all-flash **(mudou)** | 5 | 240 | Construir | Instala a all-flash. Não existe "migrar dados" para conferir no jogo. |
| 6 | Quem tem sudo? **(mudou)** | 5 | 240 | Linux | Responde a conta que sobrou no grupo sudo e tira com `gpasswd -d`. A parte do Windows já existe no Pleno. |
| 7 | Quatro alertas, uma pessoa | 5 | 280 | Linux + Equipe | Resolve você mesmo o site do maior cliente e dá três ordens para os outros. |
| 8 | Contenção de ransomware **(mudou)** | 5 | 300 | Windows | O log Security mostra a conta criptografando: responde, desabilita e tira o compartilhamento da rede. A restauração fica com a equipe (não há restauração de arquivos no Windows do jogo). |
| 9 | Enxurrada de conexões | 5 | 260 | Linux | `ss -tn`: responde a rede /24 do ataque e liga o firewall bloqueando ela, sem derrubar o SSH e o site. |
| 10 | Troca do switch core | 5 | 300 | 2 consoles | O switch novo recebe as mesmas VLANs e uma porta trunk com 10, 20 e 30, e salva. |
| 11 | Auditoria dos 15 | 4 | 220 | Linux | Com 15 servidores no ar: varredura e responde quantos estão respondendo. |
| 12 | Queda de energia **(mudou)** | 5 | 280 | Linux + Infra | `upsc` mostra o nobreak na bateria: responde os minutos que restam e desliga as VMs de teste. |
| 13 | O ar-condicionado parou **(mudou)** | 5 | 260 | 3 consoles | `sensors` nos três: responde o mais quente e para a aplicação de relatórios nele. Era "desligar GPU primeiro", mas nem todo jogador tem GPU. |
| 14 | Três engenheiros novos | 5 | 260 | Windows + Linux | OU Engenharia com três contas no AD e as mesmas três no Linux, no grupo deploy. |
| 15 | Cortar custo: VMs esquecidas **(mudou)** | 4 | 240 | Infra | Remove três VMs paradas há semanas. "Cortar 20%" não teria como ser conferido. |
| 16 | Certificados de todos os sites | 5 | 260 | 3 consoles | Renova e recarrega o certificado em três servidores web. |
| 17 | Atualizar os dois sem parar o site | 5 | 300 | 2 consoles | Um de cada vez: o problema confere que o outro estava no ar enquanto um atualizava. |
| 18 | Backup 3-2-1 | 5 | 240 | 2 consoles + Construir | Cópia local (`tar`), cópia em outro servidor (`rsync`) e cópia fora do prédio (biblioteca de fitas). |
| 19 | Endurecer o SSH | 5 | 260 | Linux | `PermitRootLogin no` e `PasswordAuthentication no` com `sed`, e reinicia o ssh. |
| 20 | Crise no datacenter | 5 | 320 | 4 consoles | DNS do domínio parado, site caído por disco cheio e servidor fora por porta em erro: resolve tudo. |

---

## Como as fases foram feitas

As quatro fases estão implementadas. Em cada uma entraram:
- os dados em `problems-data.js`;
- o seed do Supabase (`seed_scenarios.sql`) e o `datalab_full.sql`;
- o XP de cada patente na tabela de ranks;
- o botão Auto funcionando nos problemas novos.

O teste `node tests/sim-problems.js` resolve todos os problemas de ponta a ponta num datacenter de mentira. Rode depois de qualquer mudança nos problemas, no terminal ou nas falhas.
