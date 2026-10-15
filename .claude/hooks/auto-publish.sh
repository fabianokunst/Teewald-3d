#!/usr/bin/env bash
# Hook "Stop" do Claude Code: ao fim de cada resposta, commita todas as alterações
# e faz push para origin/main. O GitHub Actions então gera o build e publica no Pages.
# Antes do push, incorpora (rebase) o que o outro computador tiver enviado nesse meio-tempo.

cd "$(dirname "$0")/../.." || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0
[ "$(git rev-parse --abbrev-ref HEAD)" = main ] || exit 0

gitdir=$(git rev-parse --git-dir)
# no meio de um rebase/merge com conflito não dá para commitar nem publicar
if [ -d "$gitdir/rebase-merge" ] || [ -d "$gitdir/rebase-apply" ] || [ -f "$gitdir/MERGE_HEAD" ]; then
  echo '{"systemMessage": "Não publicado: há um conflito do Git pendente. Peça ao Claude para resolver."}'
  exit 0
fi

# evita duas sessões publicando ao mesmo tempo; trava esquecida há mais de 10 min é descartada
lock="$gitdir/auto-publish.lock"
[ -n "$(find "$lock" -maxdepth 0 -mmin +10 2>/dev/null)" ] && rmdir "$lock" 2>/dev/null
mkdir "$lock" 2>/dev/null || exit 0
trap 'rmdir "$lock"' EXIT

fail() {
  msg=$(printf '%s' "$2" | tr '\n\r\t"\\' '     ' | tr -d '\000-\037' | cut -c1-300)
  echo "{\"systemMessage\": \"$1: $msg\"}"
  exit 0
}

git add -A
if ! git diff --cached --quiet; then
  git commit -q -m "Atualização automática $(date '+%Y-%m-%d %H:%M')" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" || exit 0
fi

# duas tentativas: se o outro computador enviar algo entre o rebase e o push, refaz
for attempt in 1 2; do
  out=$(git fetch -q origin main 2>&1) || fail "Falha ao publicar no GitHub (sem conexão?)" "$out"

  if [ -n "$(git rev-list HEAD..origin/main)" ]; then
    if ! out=$(git rebase -q origin/main 2>&1); then
      git rebase --abort >/dev/null 2>&1
      fail "Não publicado - CONFLITO com alterações do outro computador. No próximo pedido o Claude resolve" "$out"
    fi
  fi

  # nada a enviar
  [ -z "$(git rev-list origin/main..HEAD)" ] && exit 0

  if out=$(git push -q origin main 2>&1); then
    echo "{\"systemMessage\": \"Publicado no GitHub: $(git log -1 --format=%h) $(git log -1 --format=%s | tr '\"\\' "''")\"}"
    exit 0
  fi
done
fail "Falha ao publicar no GitHub" "$out"
