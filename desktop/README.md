# DataLab desktop (Tauri v2)

O jogo numa janela própria + o **modo segundo plano**: a janela do jogo some, o datacenter continua
rodando e o personagem do jogador (com a skin dele) fica no canto da tela, com as notificações do jogo
num balão em cima da cabeça. Primeiro alvo: **macOS**.

## Como funciona

| Peça | Onde | O que faz |
| --- | --- | --- |
| Janela `main` | `src-tauri/src/lib.rs` | Abre o jogo **publicado** (`GAME_URL`), igual ao navegador: login, saves e Edge Functions funcionam sem mudar nada no Supabase. |
| Ponte | `../assets/js/desktop.js` (no site) | Só age dentro do app. Manda a skin e as notificações para o personagem, mantém a simulação rodando com a janela escondida e salva antes de sair. |
| Janela `companion` | `companion/` (vai dentro do app) | Transparente, sempre no topo, no canto inferior direito acima do Dock. Desenha o personagem com o código de sprites do próprio jogo (`scripts/stage.mjs` copia `sprites.js`, `cosmetics.js` e `emotes.js`). |
| Barra de menus | ícone do DataLab | Abrir · Deixar em segundo plano · Perguntar de novo ao minimizar · Sair |

**Minimizar** (botão amarelo, ⌘M): o personagem aparece no canto e pergunta se o jogo fica em segundo
plano (Sim / Só minimizar, com "Lembrar minha escolha").
**Fechar** (botão vermelho): o jogo pergunta: Deixar em segundo plano / Salvar e sair / Cancelar.
**⌘Q** e **Sair** na barra de menus: o jogo salva e o app fecha.
**Modo AFK**: só em segundo plano (personagem no canto), o personagem do jogador faz sozinho uma tarefa
simples a cada 45–90 s de jogo (verificar switch, ronda, chamados, inventário…), **só de nível abaixo da
patente dele** (a mesma regra da equipe, `career.botCan`). Nada de consertos, instalações nem ordens. Cada
tarefa aparece no balão e no chat da equipe, e rende o mesmo que uma tarefa automática de bot. Código em
`../assets/js/desktop.js` (AFK); teste: `node tests/desktop-afk.mjs`.
**Clique no personagem**: volta ao jogo. **Arrastar**: move o personagem pela tela.

Com a janela escondida o macOS limita os timers da página a ~1 por segundo (medido: o WebKit não suspende,
só desacelera). Por isso `desktop.js` pausa o loop de desenho e avança a simulação pelo tempo real que
passou, a cada tick, sem desenhar.

## Pré-requisitos (macOS)

- Rust (`rustup`, já instalado nesta máquina) e as Command Line Tools do Xcode (`xcode-select --install`).
- Node 18+.

## Pré-requisitos (Windows)

- Rust: instalar pelo [rustup](https://rustup.rs) (toolchain `stable-msvc`, o padrão).
- **Build Tools do Visual Studio** com a opção "Desenvolvimento para desktop com C++".
- WebView2: já vem no Windows 10/11 atualizado.
- Node 18+.

No Windows o personagem fica acima da barra de tarefas e o menu fica no ícone da bandeja (perto do
relógio): clique abre o menu, duplo clique volta ao jogo. A preferência "ao minimizar" fica em
`%APPDATA%\app.datalab.desktop\desktop.json`.

## Rodar

```bash
cd desktop
npm install
npm run dev          # o app abrindo o jogo publicado
npm run dev:local    # o app abrindo o jogo DESTE checkout (servidor em http://127.0.0.1:1420)
```

`dev:local` serve para testar mudanças no jogo / em `desktop.js` antes do deploy. As Edge Functions só
aceitam origens da lista `ALLOWED_ORIGINS` (secret do Supabase): para salvar / comprar rodando local,
inclua `http://127.0.0.1:1420` nela.

## Gerar o instalador

```bash
cd desktop
npm run build        # src-tauri/target/release/bundle/macos/DataLab.app e bundle/dmg/DataLab_0.9.0_aarch64.dmg
npm run build:mac    # universal (Apple Silicon + Intel); precisa de: rustup target add x86_64-apple-darwin
npm run build:win    # no Windows: src-tauri/target/release/bundle/nsis/DataLab_0.9.0_x64-setup.exe
```

**Sem Rust na máquina:** o GitHub monta o Windows sozinho (`.github/workflows/desktop-windows.yml`) a cada
mudança em `desktop/` na `main`, ou à mão em Actions → Desktop Windows → Run workflow. O resultado sai em
Releases, na tag `desktop-v<versão>`: `DataLab-Setup.exe` (instalador) e `DataLab.exe` (o app sozinho).

O instalador do Windows instala só para o usuário atual (não pede administrador). Sem certificado de
assinatura, o SmartScreen avisa na primeira execução ("Mais informações" → "Executar assim mesmo"). O link
do `.exe` vai em `desktopDownloads.windows`.

Sem assinatura da Apple o macOS avisa na primeira abertura (botão direito → Abrir). Para distribuir sem
esse aviso: certificado *Developer ID Application* + notarização (variáveis `APPLE_SIGNING_IDENTITY`,
`APPLE_ID`, `APPLE_PASSWORD`, `APPLE_TEAM_ID` no `tauri build`).

Depois, coloque o link do `.dmg` em `assets/js/supabase/config.js` → `desktopDownloads.mac` e a página
`baixar.html` passa a oferecer o download.

## Endereço do jogo

`GAME_URL` em `src-tauri/src/lib.rs` (`https://datalab-six.vercel.app/jogo.html`). Mudou o domínio? Troque
lá **e** em `src-tauri/capabilities/game.json` (`remote.urls`): só as origens listadas ali falam com o app.
`DATALAB_URL=<url> npm run dev` troca o endereço sem recompilar (precisa estar na lista também).

## Segurança

- A página do jogo só pode chamar 5 comandos (`desktop_*`) e ouvir eventos; a janela do personagem, só 3
  (`companion_*`) + arrastar a própria janela (`capabilities/`). Nenhum acesso a arquivos, shell ou rede.
- O personagem só recebe dados (skin, texto das notificações) e mostra o texto escapado.
- A preferência "ao minimizar" fica em `~/Library/Application Support/app.datalab.desktop/desktop.json`.
