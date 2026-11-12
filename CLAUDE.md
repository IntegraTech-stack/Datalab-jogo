# DataLab — guia para o Claude

Jogo de navegador: um datacenter isométrico em pixel art (verde/turquesa neon) onde o jogador
monta salas, racks e servidores, contrata equipe e resolve problemas de TI. Tudo em HTML + JS puro
(sem framework, sem build). Backend no Supabase (banco + Edge Functions). Publicado na Vercel.

Repositório: https://github.com/Castrof14/DataLab (branch `main`).
Pasta de trabalho (a única): `C:\Users\gumer\Documents\GitHub\DataLab2\DataLab`.
(A cópia antiga em `Documents\GitHub\DataLab` foi apagada em 07/11/2026 a pedido do dono.)

## Como o jogo está organizado

- `jogo.html` — a página do jogo. Carrega ~70 scripts de `assets/js/` **em ordem** (a ordem importa:
  `sprites.js` → `cosmetics.js` → `pets.js` → ... → `services/*` → `demo.js` → `menu.js`).
- Tudo fica pendurado no objeto global `window.DL` (cada arquivo é um `(function () { ... })()`).
- `index.html` — página inicial (landing). `demo.html`, `baixar.html`, `pagamento.html` são páginas extras.
- `*-preview.html` (ex.: `pets-preview.html`, `fundadores-preview.html`) — páginas soltas para ver sprites.

Onde fica cada coisa:

| O quê | Arquivo |
|---|---|
| Catálogo de itens do jogo (skins, roupas, pets, emotes, móveis) e desenho dos pets | `assets/js/cosmetics.js` |
| Comportamento do pet (seguir o jogador, efeitos) | `assets/js/pets.js` |
| Loja + inventário (tela "Loja", tecla O; equipar itens) | `assets/js/inventory.js`, `assets/css/store.css` |
| Moedas / economia | `assets/js/economy.js`, `assets/js/services/economy-service.js` |
| Menu principal (tela título, Novo Jogo, Carregar, Loja, Amigos...) | `assets/js/menu.js`, `assets/css/menu.css` |
| Salvamento (vira "snapshot" e vai para a conta via Edge Function `game`) | `assets/js/services/save-service.js`, `assets/js/cloud-sync.js` |
| Personagens, roupas, objetos desenhados em pixel | `assets/js/sprites.js` |
| Emotes | `assets/js/emotes.js` |
| Cena isométrica / desenho | `assets/js/scene.js`, `assets/js/iso.js` |
| **Catálogo do servidor** (banco de dados) | `supabase/migrations/*.sql` + `supabase/datalab_full.sql` |
| Funções do servidor (loja, inventário, save...) | `supabase/functions/*/index.ts` |

## Padrão de como um pet é feito

Um pet novo mexe em **3 lugares** (veja os commits `b35d2b3` e os pets Drácache/Guaca.exe/Sudo):

1. **Item no catálogo do jogo** — `assets/js/cosmetics.js`, junto dos outros `pet_*` (~linha 115):
   ```js
   add({ id: 'pet_xxx', cat: 'char', slot: 'pet', value: 'xxx', name: 'Nome', rarity: 'rare', price: 85, desc: 'Frase curta.' });
   ```
   Raridades usadas: `common` (~50), `rare` (~80–85), `epic` (~140–160), `legendary` (~260).
2. **Desenho** — `assets/js/cosmetics.js`, seção "Pets" (~linha 2423). Duas formas:
   - **Grade de pixels (preferida, pets novos):** entrada em `GRID_PETS` com `pal` (letra → cor),
     `parts` (desenhos em texto, `.` = vazio), `idle` (2 quadros) e `walk` (4 quadros). Cada quadro é
     uma lista de `[parte, x, y]` (ou `[parte, x, y, 'm']` para espelhar).
   - Antiga: um `case 'xxx':` em `drawPet()` com chamadas `R(g, x, y, w, h, cor)`.
   - Quadro de 22×31 px, olhando para a **direita** (a esquerda é espelhada sozinha); o chão é a linha 28.
     Contorno escuro é automático (`petOutline`).
   - Efeitos especiais (partículas etc.) ficam em `a.fx` dentro de `assets/js/pets.js`.
3. **Catálogo do servidor** — nova migration `supabase/migrations/AAAAMMDDhhmmss_nome.sql` que insere em
   `public.items` e `public.skins` (copiar o modelo de `20261106000200_pets_dracache_guaca_sudo.sql`),
   **mais** o mesmo SQL colado no fim de `supabase/datalab_full.sql`, **mais** uma linha na tabela do
   `supabase/README.md`.

Pets existentes: bug, drone, catbot, server, holodog, dracache, guaca, sudo (loja) e bitzero, glitchcat (Passe).
Para conferir o visual: abrir `pets-preview.html`.

## Como rodar o jogo

O jogo precisa de um servidor local (abrir o arquivo direto com dois cliques pode falhar no login).
Na pasta do projeto:

```
npx serve .
```

Depois abrir `http://localhost:3000/jogo.html`. Login, loja e save usam o Supabase online
(`assets/js/supabase/config.js`).

Testes/simulações em Node: `node tests/sim-problems.js`, `node tests/sim-incidents.js`.

## Regras de trabalho (do dono do projeto)

- **Nunca** fazer `git push` sem o dono pedir. Commit só depois de perguntar.
- **Não apagar nada** (arquivos, branches, stash).
- Mudanças pequenas e seguras, uma coisa de cada vez.
- Explicar tudo em português simples, passo a passo curto, sem jargão.
- Se der conflito ou erro no git: **parar e explicar**, não resolver sozinho.
- Em dúvida, perguntar em vez de adivinhar.
- Pets/skins devem ser **originais** (não copiar personagens de outros jogos).
