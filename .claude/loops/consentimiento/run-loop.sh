#!/usr/bin/env bash
# Ejecutor del loop de consentimiento informado (modo headless de Claude Code).
# Uso:  MAX_ITER=30 bash .claude/loops/consentimiento/run-loop.sh
set -euo pipefail

LOOP_DIR=".claude/loops/consentimiento"
BRANCH="feature/consentimiento-lopdp"
MAX_ITER="${MAX_ITER:-30}"
MAX_TURNS="${MAX_TURNS:-80}"
PAUSE="${PAUSE:-5}"

command -v claude >/dev/null || { echo "Claude Code (claude) no está instalado"; exit 1; }
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "Ejecutar en la raíz del repo"; exit 1; }

current="$(git branch --show-current)"
if [[ "$current" != "$BRANCH" ]]; then
  git switch "$BRANCH" 2>/dev/null || git switch -c "$BRANCH"
fi
mkdir -p "$LOOP_DIR/logs"

fails=0
for i in $(seq 1 "$MAX_ITER"); do
  ts="$(date +%Y%m%d-%H%M%S)"
  log="$LOOP_DIR/logs/iter-$(printf '%03d' "$i")-$ts.log"
  echo "════ Iteración $i/$MAX_ITER · $ts ════"

  # Los permisos (allow/deny) se leen de .claude/settings.json del proyecto.
  claude -p "$(cat "$LOOP_DIR/PROMPT.md")" \
    --permission-mode acceptEdits \
    --max-turns "$MAX_TURNS" 2>&1 | tee "$log" || true

  if grep -q "<promise>LOOP_COMPLETO</promise>" "$log"; then
    echo "✅ Loop completo. Revisa PROGRESS.md y abre el PR manualmente."; exit 0
  fi
  if grep -q "<promise>BLOQUEADO</promise>" "$log"; then
    echo "⛔ Bloqueado: completa las decisiones en $LOOP_DIR/DECISIONS.md y vuelve a ejecutar."; exit 2
  fi
  if grep -q "<promise>ITERACION_OK</promise>" "$log"; then
    fails=0
  else
    fails=$((fails+1))
    echo "⚠ Iteración sin cierre limpio ($fails consecutivas)."
    if (( fails >= 3 )); then
      echo "🛑 3 iteraciones seguidas sin cierre. Revisión humana necesaria."; exit 3
    fi
  fi
  sleep "$PAUSE"
done
echo "Se alcanzó MAX_ITER=$MAX_ITER sin completar."; exit 1
