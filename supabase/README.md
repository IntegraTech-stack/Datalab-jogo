# DataLab · backend Supabase

O jogo continua funcionando **offline** exatamente como antes. Com o Supabase configurado, ele passa a ter contas, saves na nuvem, inventário e moedas validados pelo servidor.

## Arquitetura

```
Navegador (assets/js)                         Supabase
───────────────────────                       ──────────────────────────────────────────────
services/cloud.js      ── publishable key ──▶ Auth (login, sessão, recuperação de senha)
services/auth-service  ── RLS (só leitura) ──▶ public.*  (cada jogador lê só as próprias linhas)
services/save-service  ┐
services/economy-…     ├─ JWT do usuário ───▶ Edge Functions: shop · inventory · economy · game · admin
services/inventory-…   │                       │ valida o JWT (Auth) + papel + entrada + rate limit
services/admin-service ┘                       ▼
                                               private.*  (lógica no banco, conexão direta SUPABASE_DB_URL)
```

- **O navegador nunca escreve** dinheiro, Gold, créditos, itens, saves, papéis ou concessões. Ele só tem permissão de `UPDATE` em `profiles (username, display_name, avatar)`. E o avatar é limpo por trigger: só ficam os cosméticos que o jogador possui.
- **A lógica sensível fica em `private.*`**, schema que não é exposto pela API. Quem chama essas funções são as Edge Functions, com o `user_id` tirado do JWT validado e nunca do corpo da requisição.
- **Cada requisição de um jogador é serializada**: a linha da carteira é travada com `FOR UPDATE`. Somado ao `request_id` único, isso impede gasto duplo e duplicação de itens.
- **Economia**: a simulação roda no navegador, mas o servidor é a fonte da verdade:
  - preços pela tabela do servidor;
  - cobrança pelo que mudou entre saves, com kit inicial e itens do preset grátis só no 1º save;
  - receita e créditos limitados pelo que o datacenter pode render no tempo real decorrido;
  - custo mínimo de salários;
  - terreno cobrado na hora (`economy.expand_lot`);
  - bots lendários e skins conferidos contra a posse.
- **Chaves**: o navegador usa só a *publishable key*. A `service_role` não é usada em lugar nenhum. As funções falam com o banco por `SUPABASE_DB_URL`, um segredo injetado pelo Supabase.

## Arquivos

| Caminho | O que é |
|---|---|
| `migrations/20261005000100_core.sql` | schemas, enums, `profiles`, `user_roles`, `wallets`, `inventories`, `username_available()` |
| `migrations/20261005000200_catalog.sql` | `rarities`, `currencies`, `shop_categories`, `events`, `items`, `skins`, `event_items`, `legendary_bot_templates`, `server_types`, `equipment_prices`, `achievements`, `game_config` |
| `migrations/20261005000300_inventory.sql` | `inventory_items`, `equipped_items`, `legendary_bots`, `item_grants`, `user_achievements`, `private.rate_limits` |
| `migrations/20261005000400_game.sql` | `companies`, `datacenters`, `game_saves`, `terrain`, `buildings`, `rooms`, `furniture`, `employees`, `bot_skills`, `bot_schedules`, `salaries`, `servers`, `virtual_machines`, `incidents`, `finances`, `transactions` |
| `migrations/20261005000500_security.sql` | RLS em todas as tabelas, grants mínimos, sanitização do avatar |
| `migrations/20261005000600_functions.sql` | lógica do servidor: cadastro, loja, inventário, câmbio, concessões, papéis, novo jogo, terreno, save/load |
| `seed.sql` | raridades, moedas, categorias, eventos, itens/skins (inclusive Founder/Developer/Beta/Special), bots lendários, tipos de servidor, preços do catálogo, conquistas, configuração da economia |
| `datalab_full.sql` | tudo acima concatenado, para colar no SQL Editor |
| `migrations/20261005000800_payments.sql` | `gold_packs`, `payment_orders`, crédito de Gold por pagamento confirmado |
| `migrations/20261025000200_titles.sql` | `user_titles` (títulos do jogador: Fundador, Beta Tester, VIP…), concedidos por admin/dev |
| `migrations/20261025000600_problems.sql` | problemas de carreira: `career_ranks`, `command_help`, `scenario_lessons`, `problems`, `scenario_steps`, `scenario_step_help` (catálogo), `problem_runs` (por save), `game_saves.career_xp/career_level`, `private.career_settle` e `private.game_save_career` |
| `migrations/20261025000700_problem_devices.sql` | problemas em mais de um equipamento: `problems.devices` (ex.: `{"sw": "switch.of"}`), `problems.bot_action`, `scenario_steps.device_role` |
| `migrations/20261030000400_feedback.sql` | comunidade: `ideas` + `idea_likes` (ideias e likes; as mais curtidas entram na próxima atualização), `bug_reports` + `private.bug_screenshots` (relato + print até 1 MB), funções `private.idea_*` / `private.bug_*` |
| `migrations/20261031000100_equipment_cosmetics.sql` | abas Equipamentos (skins de hacks e de PCs/servidores) e Cosméticos (móveis no catálogo do save, só enquanto o jogador tem o item) |
| `migrations/20261101000100_battle_pass.sql` | Rastros (6 na loja) + **Passe Boot Inicial – Temporada 1**: raridade `exclusive_t1`, os 27 itens do passe (nunca à venda), `pass_seasons`, `pass_rewards` (50 níveis), `battle_passes` (XP, nível e missões de cada jogador), `private.pass_state` / `private.pass_sync` (XP limitado pelo tempo, cada missão conta uma vez, recompensas no inventário) |
| `migrations/20261101000200_pass_rewards_v2.sql` | Passe Boot: nova lista de 50 recompensas (ícone de perfil, emote Reboot, Gato Glitch, acessórios, Aura Boot, Grafite e Trono), 50 Gold nos níveis sem item, slots `icon` e `aura`, raridade T1 dourada |
| `migrations/20261101000300_trail_bolt.sql` | Passe Boot: **Rastro Relâmpago** (`bp_trail_bolt`) no nível 23 no lugar do Rastro de Cabos; quem tinha o Rastro de Cabos recebe o Relâmpago (equipado, se estava) e o item antigo sai do catálogo |
| `migrations/20261106000100_friends.sql` | **Amigos**: `friendships` (uma linha por par de jogadores, pedido → aceito) e `private.friend_*`; nada é legível pelo navegador, tudo passa pela função `friends` |
| `migrations/20261106000200_pets_dracache_guaca_sudo.sql` | Pets **Drácache**, **Guaca.exe** e **Sudo** na loja |
| `migrations/20261106000300_dev_pierre.sql` | Coleção Criador: skin lendária **Dev Pierre** (selo CRIADOR, traz o emote Selfie) e os óculos **Wayfarer do Criador** |
| `migrations/20261106000400_abner.sql` | Coleção Criador: skin lendária **Dev Abner** (selo CRIADOR) |
| `migrations/20261106000500_relax_do_criador.sql` | Coleção Criador: acessório **Relax do Criador** (slot `pose`): senta relaxado nos sofás e encostado nos racks, com qualquer skin |
| `migrations/20261106000600_joao_pedro.sql` | Coleção Criador: skin lendária **Dev João Pedro** (selo CRIADOR, traz o emote Ping) e o acessório **Notebook de Redes** (slot `hands`) |
| `migrations/20261106000700_tiago.sql` | Coleção Criador: skin lendária **Dev Tiago** (selo CRIADOR, cyber security; traz os emotes Firewall e Bloqueio) |
| `migrations/20261107000100_dev_names.sql` | Coleção Criador: "Dev" antes do nome das skins dos criadores (Dev Abner, Dev João Pedro, Dev Tiago) |
| `migrations/20261109000100_gold_packs_more.sql` | **Loja de Gold**: pacotes por Pix (AbacatePay) — 100 (R$ 5,80), 500 (R$ 10,80), 1000 (R$ 20,80), 1500 (R$ 30,80) e 5000 Gold (R$ 50,80) |
| `migrations/20261107000200_pass_catch_up.sql` | **Passe**: a 1ª sincronização de cada jogador aceita até 3 h de XP guardado (antes, 10 min), para o XP de quando a função `pass` não estava publicada não se perder |
| `migrations/20261112000100_career_event_xp.sql` | **Carreira**: `private.career_settle` passa a contar o XP de eventos (disjuntor do apagão, servidor refeito, incêndio apagado, equipamento recuperado), com teto por evento; a resposta traz `v: 2` |
| `seed_scenarios.sql` | lições do terminal, problemas, passos, ajudas e patentes (gerado de `assets/js/problems-data.js` + `terminal.js`) |
| `functions/{shop,inventory,economy,game,admin,payments,payments-webhook,feedback,pass,friends}` | Edge Functions; `functions/_shared` traz http, auth, db e a API da AbacatePay |
| `scripts/export-catalog.js` + `scripts/build-seed.mjs` | regeram o `seed.sql` a partir do catálogo do jogo |
| `scripts/build-scenarios.mjs` | regera o `seed_scenarios.sql` direto dos arquivos do jogo (sem navegador) |
| `scripts/build-full.mjs` | regera o `datalab_full.sql`: migrations da 1ª versão (20261005…), `seed.sql`, as migrations seguintes (algumas precisam das linhas do seed) e `seed_scenarios.sql` |
| `config.toml` | configuração da CLI (`verify_jwt = true` em todas as funções) |

## Configuração passo a passo

1. **Crie o projeto** em [supabase.com](https://supabase.com) → *New project*.
2. **Banco**: vá em *SQL Editor* → *New query*, cole `supabase/datalab_full.sql` e clique em *Run*.
   Para usar a CLI em vez disso:
   ```bash
   npm i -g supabase          # ou: npx supabase ...
   supabase login
   supabase link --project-ref SEU_PROJECT_REF
   supabase db push           # aplica supabase/migrations
   psql "$SUPABASE_DB_URL" -f supabase/seed.sql             # ou cole seed.sql no SQL Editor
   psql "$SUPABASE_DB_URL" -f supabase/seed_scenarios.sql   # problemas e lições do terminal
   ```
3. **Auth** (*Authentication*):
   - *Providers → Email*: habilite. Deixe *Confirm email* ligado em produção.
   - *URL Configuration*: em *Site URL*, coloque a URL onde o jogo fica publicado (ex.: `https://seu-site/jogo.html`). Adicione a mesma URL em *Redirect URLs*: o link de recuperação de senha volta para ela.
   - *Policies*: senha mínima de 8 caracteres e proteção contra senhas vazadas, se o plano permitir.
4. **Edge Functions**:
   ```bash
   supabase secrets set ALLOWED_ORIGINS="https://seu-site,http://localhost:5500"
   supabase functions deploy shop inventory economy game admin feedback pass friends
   ```
   (Passe Boot: sem as migrations `20261101000100_battle_pass.sql` e `20261101000200_pass_rewards_v2.sql` e a função `pass` publicadas, o jogo continua funcionando — o XP do passe fica guardado no navegador e as recompensas chegam quando o servidor for atualizado.)
   `SUPABASE_URL`, `SUPABASE_ANON_KEY` e `SUPABASE_DB_URL` já existem no ambiente das funções e não precisam ser cadastradas.
5. **Navegador**: em *Project Settings → API*, copie a *Project URL* e a ***publishable key*** (anon) para `assets/js/supabase/config.js`:
   ```js
   window.DATALAB_CONFIG = { supabaseUrl: 'https://SEU_REF.supabase.co', supabasePublishableKey: 'sb_publishable_…', autosaveSeconds: 60 };
   ```
   **Nunca** coloque ali a *secret / service_role key*: o jogo se recusa a iniciar se detectar uma.
   Se o projeto usar domínio próprio, adicione esse domínio ao `connect-src` da meta CSP em `jogo.html`.
6. **Publique** a pasta do jogo (qualquer hospedagem estática, ex.: Netlify, Vercel, GitHub Pages) na URL do passo 3.

### Vercel: checklist do login
- `assets/js/supabase/config.js` **precisa** ir junto no deploy. O `.vercelignore` usa regras do `.gitignore`:
  `supabase/` (sem `/` no começo) removia também `assets/js/supabase/` e o jogo publicado ficava sem URL/chave
  ("Servidor indisponível"). Use sempre `/supabase/`. Teste: abra `https://SEU-SITE/assets/js/supabase/config.js`.
- *Authentication → URL Configuration*: **Site URL** = `https://SEU-SITE.vercel.app/jogo.html`; em **Redirect URLs**
  adicione `https://SEU-SITE.vercel.app/**` (e, para previews, `https://datalab-*-SEU-TIME.vercel.app/**`).
  O link de confirmação de e-mail abre `email-verificado.html` (página "E-mail verificado"), que precisa estar
  coberta por essas Redirect URLs.
  Sem isso, o link de confirmação/recuperação volta para `localhost` e o login PKCE falha (o "code verifier" fica
  no navegador do domínio da Vercel).
- `supabase secrets set ALLOWED_ORIGINS="https://SEU-SITE.vercel.app,https://datalab-*-SEU-TIME.vercel.app,http://localhost:5500"`
  e redeploy das funções; senão salvar/carregar falha como "erro de rede" (CORS). O login funciona mesmo assim
  (Auth não usa essa lista), mas nenhuma Edge Function responde ao site: sem espaço de save, sem inventário.
  Projeto atual (site `https://datalab-six.vercel.app`):
  `supabase secrets set --project-ref lhqatamrukslqjqgmzqz ALLOWED_ORIGINS="https://datalab-six.vercel.app,https://datalab-*-castrof14s-projects.vercel.app,http://localhost:5500,http://127.0.0.1:5500"`
  Teste (deve devolver `Access-Control-Allow-Origin`):
  `curl -i -X OPTIONS https://lhqatamrukslqjqgmzqz.supabase.co/functions/v1/game -H "Origin: https://datalab-six.vercel.app"`
- Nenhuma variável de ambiente é necessária na Vercel: o site é estático e só usa a chave publishable.

## Pagamentos (AbacatePay)

Comprar Gold com dinheiro real: **Loja → Gold** ou **Finanças → Pacotes de Gold** (só com conta).

```
jogo ──checkout──▶ payments ──▶ AbacatePay: cria um checkout só deste pedido (externalId = id do pedido)
  │                    └─ payment_orders (pending)
  └─ abre a página de pagamento numa nova aba; o jogo pergunta "status" a cada 4 s
AbacatePay ──checkout.completed──▶ payments-webhook ─┐
jogo ──status──▶ payments ───────────────────────────┴▶ consulta o checkout NA API da AbacatePay
                                                        └─ PAID e valor ≥ preço → private.payment_settle credita o Gold (uma vez só)
```

- O preço e as moedas de cada pacote ficam em `public.gold_packs` (servidor). O navegador só mostra.
- Um link fixo de checkout **não** serve: não diz qual conta pagou. Cada compra gera o próprio checkout.
- O webhook é só um aviso: o Gold só entra depois que a própria API da AbacatePay confirma `PAID`.
- Estorno (`checkout.refunded`) tira de volta o Gold que ainda estiver na carteira.

**Configuração**
1. Rode a migration `20261005000800_payments.sql` (ou o `datalab_full.sql` atualizado). Ela cria o pacote `gold_100`: 100 Gold por R$ 4,00.
2. Na AbacatePay, crie uma chave de API (*Integrar → API Keys*). Comece com a chave de **dev mode** para testar sem cobrança.
3. Secrets das funções:
   ```bash
   supabase secrets set ABACATEPAY_API_KEY="abc_..." ABACATEPAY_WEBHOOK_SECRET="uma-senha-longa-aleatoria" SITE_URL="https://seu-site"
   supabase functions deploy payments payments-webhook
   ```
   `SITE_URL` é para onde a AbacatePay devolve o jogador (`/pagamento.html`). Precisa ser `https`.
4. Produto: no 1º checkout, a função procura na AbacatePay um produto com `externalId = gold_100`. Se não achar, cria um com o preço da tabela. Para usar um produto que você já criou no painel, informe o id dele:
   ```sql
   update public.gold_packs set provider_product_id = 'prod_...' where sku = 'gold_100';
   ```
5. Webhook na AbacatePay (*Webhooks → Criar*), evento `checkout.completed` (e `checkout.refunded`):
   `https://SEU_REF.supabase.co/functions/v1/payments-webhook?webhookSecret=` + o mesmo valor de `ABACATEPAY_WEBHOOK_SECRET`.
6. Novo pacote: insira em `gold_packs` (sku, name, coins, price_cents) e acrescente o mesmo sku em `DL.ECON.store` (`assets/js/economy.js`).

**Testar** (chave dev): compre na Loja → pague o Pix de teste na aba aberta → o toast "Pagamento confirmado" aparece e o Gold sobe. No banco: `select * from payment_orders;` e `select * from transactions where kind = 'payment';`.

## Problemas de carreira (patentes, XP)

```
assets/js/problems-data.js ──build-scenarios.mjs──▶ seed_scenarios.sql ──▶ tabelas do catálogo (leitura pública)
        │ (cópia embutida: jogo offline)                                         │
        ▼                                                                         ▼
jogo (problems.js) ◀──────────── services/scenario-service.js (lê as tabelas; o que vier inválido fica de fora)
        │ problema resolvido → claim.problems no próximo save
        ▼
Edge Function game ──▶ private.game_save_career = game_save (economia) + career_settle (carreira), numa transação
```

- **O servidor recalcula o XP** de cada problema pela tabela `problems`: repetido no mesmo save vale 50% e depois 25%; feito pela equipe (ordem do jogador), 15%. No máximo 1 problema a cada 20 min de jogo (+1) conta em cada save. Problema desconhecido ou desativado não vale nada.
- O XP do save (`data.career.xp`) nunca passa do que o servidor viu resolvido (`game_saves.career_xp`).
- Promoção que passa por uma patente com meta de XP (`career_ranks.xp_to_next` / `distinct_to_next`) só vale se o XP e os problemas diferentes estiverem lá; senão o nível volta, e o jogo aplica a resposta (`career.applyServer`).
- Saves de antes desta migration mantêm o nível que tinham.

**Editar ou criar problemas**
1. Edite `assets/js/problems-data.js` (o formato está explicado no topo do arquivo; os checks são JSON e nunca são executados).
2. `node supabase/scripts/build-scenarios.mjs` (grava `supabase/seed_scenarios.sql`) e rode o arquivo no SQL Editor. Ele atualiza as linhas, reescreve os passos e desativa (`active = false`) os problemas que saíram do jogo: o histórico em `problem_runs` continua apontando para eles.
3. `node supabase/scripts/build-full.mjs` para atualizar o `datalab_full.sql`.

**Ordem do deploy** (a Edge Function `game` passa a chamar `private.game_save_career`):
1. migrations `20261025000600_problems.sql` e `20261025000700_problem_devices.sql` + `seed_scenarios.sql`;
2. depois `supabase functions deploy game`.

Sem a migration, o jogo continua usando a cópia embutida dos problemas, mas o save na nuvem falharia com a função nova.

## Primeiro administrador

1. Crie a conta pelo jogo (*Conta → Criar conta*) e confirme o e-mail.
2. No *SQL Editor*, rode uma única vez:
   ```sql
   insert into public.user_roles (user_id, role)
   select id, 'admin' from auth.users where email = 'SEU_EMAIL@exemplo.com'
   on conflict do nothing;
   ```
3. Entre de novo no jogo: a aba **Administração** aparece em *Conta*. Daí em diante, papéis (`admin`, `developer`, `moderator`) são dados pela própria aba (só admins).
   - `developer`: concede itens.
   - `moderator`: só consulta o registro.
   - Só `admin` concede moedas e muda papéis.
   - O último admin não pode ser removido.

## Como testar

**Login**
- *Conta → Criar conta*: usuário único, e-mail e senha com 8+ caracteres e números. Confirme o e-mail e entre.
- Recarregue a página: a sessão continua.
- *Esqueci a senha* manda o link. Ao clicar nele, o jogo abre o formulário de nova senha.
- *Sair* volta ao modo offline.

**Salvar e carregar**
- Logado, comece um *Novo jogo*: ele ocupa o 1º espaço livre (até 3) e salva sozinho a cada 60 s.
- Em *Conta → Saves*, use *Salvar agora* e depois *Carregar*. O mundo inteiro volta: salas, paredes, portas, racks por slot, cabos, VMs, equipe, skins e caixa do servidor.
- No banco, confira `select * from game_saves;`, `furniture`, `servers`, `employees` e `transactions`.

**Inventário**
- Loja (O) → compre um item: o Gold sai da `wallets` e o item aparece em `inventory_items`.
- Inventário (U) → *Equipar* cria a linha em `equipped_items`; *Vender* devolve metade em Gold.
- No console do navegador, rode `DataLabDemo.economy.wallet.gold = 99999` e tente comprar: o servidor responde "Gold insuficiente".

**Concessão de item**
- Em *Conta → Administração*:
  1. Busque o jogador e marque-o.
  2. Escolha o item (ex.: *Rack Fundador · FOUNDER*), a quantidade, o tipo e o motivo.
  3. Clique em *Conceder*.
- O registro mostra quem concedeu, para quem, o quê e o porquê; no banco, veja `select * from item_grants;`.
- Com um usuário sem papel, a função `admin` responde **403**.

**Economia**
- *Construir → Espaços → Terreno +*: o preço aparece antes; *Confirmar* cobra no servidor (`terrain`, `transactions` com `kind = 'land'`).
- Instale um servidor e espere o autosave: `transactions` registra `equipment` com o preço do servidor.
- Rode `DataLabDemo.economy.company.cash = 1e9` e salve: o caixa volta ao valor do servidor.
- Câmbio em *Finanças* ou *Loja → Gold*: 10 créditos = 1 Gold, feito no servidor.

## Limites conhecidos

- A simulação (receita, despesas, incidentes) roda no navegador, e o servidor aceita esses números **até um teto** proporcional ao hardware online e ao tempo real decorrido. Um cliente adulterado consegue no máximo render no teto, e o caixa da empresa **não vira Gold**.
- Créditos também têm teto por tempo real e o "datacenter concluído" tem limite diário. Por isso o caminho até o Gold é estreito.
- Pagamentos reais: só pela AbacatePay (veja *Pagamentos*). Sem conta, os pacotes da loja continuam sendo simulação local.
