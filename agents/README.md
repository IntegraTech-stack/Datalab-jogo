# DataLab · Agent Gateway (IA da equipe)

Os funcionários contratados no jogo podem receber **tarefas reais** e executá-las com um agente de IA. Hoje o agente é o **OpenCode**. O Claude Code e o Codex já aparecem na lista como "em breve".

Nada disso roda no navegador nem na Vercel. O jogo só envia a tarefa e acompanha o andamento. Quem executa é este serviço, o **Agent Gateway**.

```
Navegador (jogo.html)                          Agent Gateway (esta pasta)                      OpenCode
assets/js/agents.js  ── JWT do Supabase ──────▶ auth.mjs   valida a sessão no Supabase Auth      `opencode serve` (1 processo por tarefa)
services/agent-service.js ◀── SSE (progresso) ─ tasks.mjs  fila, limites, aprovação, abortar     127.0.0.1, porta e senha aleatórias
                                                policy.mjs regras de permissão + segredos        cwd = espaço de trabalho do funcionário
                                                store.mjs  histórico, limites e uso (JSON)       HOME/config isolados, sem config do projeto
                                                agents/    opencode ✔ · claude-code, codex (planejados)
```

## No jogo

Selecione um funcionário e clique em **IA** no card dele. O painel tem três abas:

- **Tarefa**: escolha o agente e o modelo, descreva a tarefa e envie. O andamento aparece ao vivo: cada ferramenta usada, os arquivos alterados, a lista de passos (todo) e o texto do agente. Comandos fora da lista permitida pedem **Aprovar / Recusar**. O botão **Parar** interrompe a execução.
- **Histórico**: as tarefas anteriores, com a resposta entregue, os arquivos e o passo a passo. Qualquer arquivo do espaço de trabalho abre no próprio painel.
- **Configuração**: o agente e o modelo do funcionário, e os limites de uso da equipe.

Enquanto o agente trabalha, o funcionário senta num computador ("Executando tarefa de IA"). Ele pede aprovação no chat da equipe e, quando termina, reporta o resultado e ganha experiência. Funcionários sem IA continuam exatamente como antes. Sem gateway configurado, o botão **IA** nem aparece.

## Segurança

| Requisito | Como é garantido |
|---|---|
| Nenhuma chave no frontend | O navegador só envia o próprio token de sessão do Supabase. As chaves dos provedores ficam no `.env` do gateway e vão para o OpenCode num arquivo de config fora do espaço de trabalho, nunca no ambiente dos comandos. Todo evento, resposta e arquivo passa por redação: chaves e a senha do OpenCode viram `[segredo removido]`, e caminhos do servidor viram `…`. |
| Quem chama | Toda rota (menos `/v1/health`) valida o token no Supabase Auth (`/auth/v1/user`). O id do jogador vem sempre de lá. Cada jogador só vê as próprias tarefas e espaços de trabalho. CORS por `ALLOWED_ORIGINS`. |
| Ambiente isolado | Um processo `opencode serve` por tarefa, em `127.0.0.1` com senha aleatória, e morto (com a árvore de processos) ao terminar, falhar, estourar o limite ou ser parado. O ambiente é limpo, sem as variáveis do gateway. HOME, XDG e APPDATA ficam numa pasta própria, então a config e as credenciais do usuário da máquina não são lidas. `OPENCODE_DISABLE_PROJECT_CONFIG`, `OPENCODE_PURE` e `OPENCODE_DISABLE_CLAUDE_CODE` impedem que arquivos no workspace afrouxem as regras. Em produção tudo roda no container endurecido (abaixo). |
| Arquivos | Cada funcionário tem o próprio espaço de trabalho (`data/workspaces/<hash do jogador>/<id>`). `external_directory: deny` bloqueia leitura e escrita fora dele, inclusive caminhos dentro de comandos. Editar `opencode.json` e `.opencode/` é negado. A API de arquivos confere o caminho real (sem `..` nem symlinks), lê até 256 KB e não abre binários. |
| Comandos | A regra base é `*` → negado. Liberados: ferramentas de arquivo e uma lista de comandos de arquivo e git (`ls`, `cat`, `mkdir`, `git commit`…). Sempre negados: rede (`curl`, `wget`, `ssh`…), `sudo`, `chmod`, instalar pacotes, `env`/`printenv`, outros shells, `git push`, `find -exec` e `xargs`. Qualquer outro comando pede aprovação ao jogador, ou é recusado automaticamente se ele escolher isso. Sem resposta em `APPROVAL_TIMEOUT_SEC`, é recusado. Sub-agentes, perguntas e web ficam negados (web só com `ALLOW_WEB=1`). |
| Rodar código | O nível "Executar scripts" (`node`, `python`, `npm run`…) só existe com `SANDBOX_TRUSTED=1`, que o Dockerfile define. Numa máquina sem container ele fica travado. |
| Limites de uso | São aplicados **no servidor**: tarefas por dia, tarefas simultâneas (por jogador e no gateway inteiro), minutos, passos e tokens por tarefa, e custo por dia. O jogador ajusta os próprios limites, mas eles nunca passam do teto do servidor (`CAP_*`). |

## Rodar localmente

Requisitos: Node 22+ e o OpenCode (`npm i -g opencode-ai`).

```bash
cd agents
cp .env.example .env      # preencha SUPABASE_URL e SUPABASE_ANON_KEY (os mesmos de assets/js/supabase/config.js)
npm start                 # http://127.0.0.1:8787
```

Sirva o jogo em `http://localhost:5500` e entre na sua conta. Em `localhost`, o jogo já procura o gateway em `http://127.0.0.1:8787`, e a CSP do `jogo.html` já permite esse endereço. Os modelos gratuitos do OpenCode (`opencode/*`) funcionam sem chave.

## Produção

1. Num servidor com Docker:
   ```bash
   cd agents && cp .env.example .env   # SUPABASE_*, ALLOWED_ORIGINS=https://seu-site, chaves dos provedores (opcional)
   docker compose up -d --build
   ```
   O container tem raiz somente leitura, nenhuma capability, `no-new-privileges`, 2 GB de RAM, 2 CPUs e 256 processos. Não tem `curl` nem `wget`, e a imagem não traz nenhum arquivo do jogo.
2. Ponha um proxy TLS (Caddy, nginx, Cloudflare Tunnel) na frente de `127.0.0.1:8787`.
3. No jogo, defina `agentGatewayUrl: 'https://agents.seu-dominio'` em `assets/js/supabase/config.js` e **adicione o mesmo endereço ao `connect-src` da CSP** em `jogo.html`.
4. Opcional: para limitar a saída de rede do container só aos provedores de modelo, use um firewall ou proxy de saída. Os comandos de rede já são negados pelas regras, mas no nível "Executar scripts" um programa escrito pelo agente poderia abrir conexões.

## API

Toda rota usa `Authorization: Bearer <access_token do Supabase>`, menos `/v1/health`.

| Método | Rota | O que faz |
|---|---|---|
| GET | `/v1/health` | vivo? |
| GET | `/v1/agents` | agentes, modelos permitidos e modelo padrão |
| GET/PUT | `/v1/settings` | limites do jogador (sempre dentro do teto), teto do servidor e uso de hoje |
| POST | `/v1/tasks` | `{ employee: {id, name, role}, agent, model, prompt }` |
| GET | `/v1/tasks?employee=ID` | histórico, mais recentes primeiro |
| GET | `/v1/tasks/:id` | tarefa completa: eventos, resultado e uso |
| GET | `/v1/tasks/:id/events?after=N` | progresso ao vivo (SSE) |
| POST | `/v1/tasks/:id/abort` | interrompe |
| POST | `/v1/tasks/:id/approvals/:aid` | `{ reply: 'once' \| 'reject' }` |
| GET | `/v1/workspace/:employee/files` | arquivos do espaço de trabalho |
| GET | `/v1/workspace/:employee/file?path=` | conteúdo de um arquivo de texto |

Eventos (os mesmos para qualquer agente): `status`, `step`, `text`, `thinking`, `tool`, `todo`, `file`, `approval`, `approval_done`, `usage`, `retry`, `error`, `stopping`, `end`.

## Novos agentes (Claude Code, Codex)

Crie `src/agents/<id>.mjs` com o mesmo contrato do `opencode.mjs`:

```js
{ id, label, available, models(isAllowed), start({ workspace, model, prompt, system, rules, maxSteps, title, onEvent, onSecrets }) }
// start() → { done: Promise<{ text, files, usage }>, abort(reason), reply(approvalId, 'once'|'reject'), usage() }
```

Depois troque a entrada "planejada" em `src/agents/index.mjs` pelo adaptador. O adaptador traduz as regras de `policy.mjs` para o mecanismo de permissões do agente e emite os eventos acima. O jogo não precisa mudar.

## Testes

```bash
cd agents
npm test                    # regras, limites, auth, CORS, SSE, aprovação, abortar, isolamento entre jogadores (agente simulado)
npm run test:live           # com o OpenCode de verdade (internet + modelos grátis): arquivos, bloqueios, abortar
cd .. && node tests/agents-e2e.mjs [--live]   # jogo.html no Chrome headless + gateway real
```
