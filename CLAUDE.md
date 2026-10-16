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
