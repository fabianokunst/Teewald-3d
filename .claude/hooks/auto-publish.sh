#!/usr/bin/env bash
# Hook "Stop" do Claude Code: ao fim de cada resposta, commita todas as alterações
# e faz push para origin/main. O GitHub Actions então gera o build e publica no Pages.

cd "$(dirname "$0")/../.." || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

# evita duas sessões publicando ao mesmo tempo
lock=.git/auto-publish.lock
mkdir "$lock" 2>/dev/null || exit 0
trap 'rmdir "$lock"' EXIT

git add -A
if ! git diff --cached --quiet; then
  git commit -q -m "Atualização automática $(date '+%Y-%m-%d %H:%M')" \
    -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>" || exit 0
fi

# nada a enviar
[ -z "$(git rev-list origin/main..HEAD 2>/dev/null)" ] && exit 0

if out=$(git push -q origin main 2>&1); then
  echo "{\"systemMessage\": \"Publicado no GitHub: $(git log -1 --format=%h) $(git log -1 --format=%s)\"}"
else
  msg=$(printf '%s' "$out" | tr '\n"\\' "   " | cut -c1-300)
  echo "{\"systemMessage\": \"Falha ao publicar no GitHub: $msg\"}"
fi
exit 0
