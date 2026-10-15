# Teewald 3D

Jogo de terror em terceira pessoa com visual de PS1 (Three.js + Vite), ambientado em
Santa Maria do Herval (RS). O `README.md` descreve o jogo, os comandos (`npm run dev`,
`npm run audit`, `npm run teste`) e a estrutura do código. Converse com o usuário em português.

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
- `node_modules/` e `dist/` não vão para o repositório (`.gitignore`).
