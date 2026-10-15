#!/usr/bin/env bash
# Hook "UserPromptSubmit" do Claude Code: antes de cada pedido, traz do GitHub o que foi
# enviado pelo outro computador (git pull --rebase), para nunca trabalhar numa versão velha.
# Fica em silêncio quando já está tudo atualizado.

cd "$(dirname "$0")/../.." || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0
[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || exit 0

json_escape() { printf '%s' "$1" | tr '\n\r\t"\\' '     ' | tr -d '\000-\037' | cut -c1-600; }

# $1 = aviso para o usuário, $2 = contexto entregue ao Claude junto com o pedido
report() {
  printf '{"systemMessage": "%s", "hookSpecificOutput": {"hookEventName": "UserPromptSubmit", "additionalContext": "%s"}}\n' \
    "$(json_escape "$1")" "$(json_escape "$2")"
  exit 0
}

gitdir=$(git rev-parse --git-dir)
if [ -d "$gitdir/rebase-merge" ] || [ -d "$gitdir/rebase-apply" ] || [ -f "$gitdir/MERGE_HEAD" ]; then
  report "Há um conflito do Git pendente - sincronização pausada." \
    "ATENÇÃO: o repositório está no meio de um rebase/merge com conflito. Antes de atender o pedido, resolva o conflito (git status; editar os arquivos; git add; git rebase --continue), depois git push origin main, e avise o usuário."
fi

# mesma trava do auto-publish.sh; trava esquecida há mais de 10 min é descartada
lock="$gitdir/auto-publish.lock"
[ -n "$(find "$lock" -maxdepth 0 -mmin +10 2>/dev/null)" ] && rmdir "$lock" 2>/dev/null
mkdir "$lock" 2>/dev/null || exit 0
trap 'rmdir "$lock"' EXIT

if ! out=$(git fetch -q origin main 2>&1); then
  report "Sem conexão com o GitHub - trabalhando na versão local." \
    "AVISO: git fetch falhou ($out). Não deu para verificar se há alterações vindas do outro computador; mencione isso ao usuário."
fi

behind=$(git rev-list --count HEAD..origin/main)
[ "$behind" -eq 0 ] && exit 0

before=$(git rev-parse HEAD)
if out=$(git pull -q --rebase --autostash origin main 2>&1); then
  files=$(git diff --name-only "$before" HEAD | head -40 | tr '\n' ' ')
  report "Atualizado do GitHub: $behind commit(s) vindos do outro computador." \
    "O repositório acabou de receber $behind commit(s) do GitHub (feitos no outro computador). Arquivos alterados: $files. Se algum deles já estava no seu contexto, releia antes de editar."
else
  git rebase --abort >/dev/null 2>&1
  report "CONFLITO ao atualizar do GitHub - o Claude vai resolver." \
    "ATENÇÃO: git pull --rebase falhou ($out) e foi desfeito; o repositório continua sem as alterações do outro computador. Antes de atender o pedido: git pull --rebase origin main, resolva os conflitos, git rebase --continue, git push origin main, e avise o usuário."
fi
