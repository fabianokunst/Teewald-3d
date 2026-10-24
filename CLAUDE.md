# Teewald 3D

Jogo de terror em terceira pessoa com visual de PS1 (Three.js + Vite), ambientado em
Santa Maria do Herval (RS). O `README.md` descreve o jogo, os comandos (`npm run dev`,
`npm run audit`, `npm run teste`) e a estrutura do código. Converse com o usuário em português.

## Tradução (inglês, espanhol, alemão)

O texto do jogo continua escrito em português no código. A tradução só acontece na hora de
desenhar: `tr()` (`src/i18n/index.js`) roda dentro de `textSprite`/`drawText` e procura o texto
nos dicionários `src/i18n/en.js`, `es.js` e `de.js` (chave = o texto em português; `{1}`, `{2}` =
pedaços que o código encaixa). Sem tradução, aparece o português. O idioma fica em OPÇÕES → IDIOMA.

- Ao acrescentar ou mudar texto que aparece na tela, rode `npm run traduzir` e preencha nos três
  dicionários o que ficou `''` (o comando diz quanto falta; `-- --lista en` mostra quais). Siga o
  glossário e o tom de `src/i18n/GUIA.md`: nomes de pessoas e lugares, a Kartoffelfest e as frases
  em hunsrik/alemão ficam como estão.
- Nunca use `tr()` na lógica do jogo (comparações, ids): só no desenho.
- Texto quebrado em linhas ou mostrado letra a letra: traduza antes de quebrar (`tr(texto)`) e
  desenhe os pedaços com `raw: true` (veja `ui/dialogue.js`, `ui/paper.js`).
- `npm run teste -- --idioma=en` joga a campanha em inglês e lista o texto que apareceu sem
  tradução (texto montado no código); `npm run traduzir -- --vistos <arquivo>` põe esse texto nos
  dicionários, na parte `extra`.

## Site (pasta `site/`)

O site promocional do jogo fica em `site/`, separado do jogo (HTML, CSS e JS estáticos; o
README explica as páginas e os comandos). Regras: **nada de spoiler** (só o que o jogador
descobre logo que chega na cidade: nenhuma criatura além do cartaz do chupacabras, nada da
bruxa nem dos capítulos seguintes) e todo texto novo no tom do jogo. As fotos saem de
`npm run capturas` e as fichas de `personagens.html` de `npm run retratos`; não edite à mão o
trecho entre `<!-- fichas:inicio -->` e `<!-- fichas:fim -->`. A cabeça, o topo e o rodapé
vêm de `tools/site/` (`npm run site`): mude lá, nunca entre os marcadores das páginas. Use os
tokens e componentes de `site/css/site.css` (a vitrine fica em `site/design.html`) em vez de
cores e tamanhos soltos.

## Site (pasta `site/`): buscadores e LLMs

Depois de mudar o texto de uma página do site, rode `npm run site`. Ele refaz o `<head>`
(título, prévia nas redes, JSON-LD), o `site/sitemap.xml` e as versões para LLMs
(`site/*.html.md`, `llms.txt`, `llms-full.txt`), além do `<head>` da página do jogo
(`index.html` da raiz, entre `<!-- seo:... -->`). Títulos e descrições ficam em
`tools/site/paginas.mjs` e o resumo do `llms.txt` em `tools/site/llms.md`. Nada disso
pode ter spoiler. O build publica `sitemap.xml` e `llms*.txt` também na raiz (`/Teewald-3d/`).

O site tem os mesmos idiomas do jogo. As páginas de `site/` (português) são a fonte;
`site/en/`, `site/es/` e `site/de/` são geradas pelo `npm run site` a partir dos dicionários
`tools/site/i18n/<idioma>.json` (chave = o trecho em português, com as marcas HTML de dentro).
Nunca edite as páginas geradas. Ao mudar texto do site, rode `npm run site` e preencha nos três
dicionários o que ficou `""` (ele diz quanto falta; `-- --falta en` lista; `-- --confere`
confere as marcas HTML), seguindo `src/i18n/GUIA.md` e os nomes de menu/botão de
`src/i18n/<idioma>.js`. O resumo do llms.txt traduzido fica em `tools/site/llms.<idioma>.md`.

## Instagram (pasta `social/`)

As peças do Instagram (fotos do jogo, posts, stories e o reels) saem de `npm run social`
(`tools/social.mjs`; partes: `-- fotos`, `-- posts`, `-- reels`). O plano, as legendas e o
calendário ficam em `social/CAMPANHA.md`. Valem as regras do site: **nada de spoiler** (nenhuma
criatura além do cartaz e dos olhos no escuro, nada dos capítulos seguintes), maio de 1997 no
outono, e o tom do jogo. Os posts "de dentro do jogo" (jornal, cartaz, Kartoffelfest) levam o
aviso de ficção na legenda. Mude enquadramentos em `tools/social/fotos.mjs`, textos em
`tools/social/posts.mjs` e o reels em `tools/social/roteiro.mjs`, nunca as imagens à mão.

## Sincronização entre computadores (GitHub)

O projeto é editado em dois computadores. A fonte da verdade é a branch `main` de
https://github.com/fabianokunst/Teewald-3d. A sincronização é automática, por hooks
registrados em `.claude/settings.local.json` (versionado de propósito, para valer nos dois PCs):

- **Antes de cada pedido** — `.claude/hooks/auto-sync.sh` (`UserPromptSubmit`): `git fetch` e
  `git pull --rebase --autostash`. Se chegarem alterações do outro computador, o hook põe no
  contexto a lista de arquivos que mudaram: releia-os antes de editar.
- **Ao fim de cada resposta** — `.claude/hooks/auto-publish.sh` (`Stop`): `git add -A`, commit
  "Atualização automática", rebase sobre `origin/main` e `git push`. O GitHub Actions
  (`.github/workflows/deploy.yml`) então publica o build no GitHub Pages.

Regras:

- Trabalhe direto na `main`, nesta pasta. Não crie branches nem worktrees: os hooks só
  sincronizam a `main`.
- Ao concluir um ajuste, faça você mesmo o commit com uma mensagem curta e descritiva em
  português (ex.: "Adiciona chuva na praça da igreja"). O hook de fim de resposta faz o push e
  commita como "Atualização automática" só o que tiver sobrado.
- Se um hook avisar de **CONFLITO**, resolva isso antes de atender o pedido:
  `git pull --rebase origin main`, corrija os arquivos em conflito mantendo as duas alterações
  sempre que fizer sentido, `git add`, `git rebase --continue`, `git push origin main`.
  Conte ao usuário o que estava em conflito e como ficou.
- Nunca use `git push --force` nem `git reset --hard` em commits que já estão no GitHub.
- **Todos os arquivos desta pasta vão para o GitHub** (inclusive `exportados/`, `.psd`,
  modelos etc.). Só `node_modules/` e `dist/` ficam de fora, porque são regerados
  (`npm install` / build do GitHub Actions). Não acrescente nada ao `.gitignore` sem o
  usuário pedir.
- O GitHub recusa arquivos acima de 100 MB: o hook de publicação deixa esses de fora e
  avisa ("NÃO ENVIADOS"). Se aparecer o aviso, conte ao usuário e proponha Git LFS.
