#!/usr/bin/env bash
# Ejecutor del loop de consentimiento informado (modo headless de Claude Code).
# Uso:  MAX_ITER=30 bash .claude/loops/consentimiento/run-loop.sh
set -euo pipefail

LOOP_DIR=".claude/loops/consentimiento"
# TASKS/PROGRESS/DECISIONS/SPEC/seed/diag/logs viven en loop-consentimiento/ (fuera de .claude/): Claude
# Code trata todo lo bajo .claude/ como "sensitive file" y el loop headless no podría editarlos ahí.
WORK_DIR="loop-consentimiento"
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
mkdir -p "$WORK_DIR/logs"

fails=0
for i in $(seq 1 "$MAX_ITER"); do
  ts="$(date +%Y%m%d-%H%M%S)"
  log="$WORK_DIR/logs/iter-$(printf '%03d' "$i")-$ts.log"
  echo "════ Iteración $i/$MAX_ITER · $ts ════"

  # Los permisos (allow/deny) se leen de .claude/settings.json del proyecto, más
  # headless-settings.json: deniega tocar los propios archivos de permisos y del loop
  # (gates.sh, run-loop.sh) para que la ejecución headless no pueda ampliarse privilegios
  # ni alterar sus propias puertas de verificación.
  claude -p "$(cat "$LOOP_DIR/PROMPT.md")" \
    --permission-mode acceptEdits \
    --settings "$LOOP_DIR/headless-settings.json" \
    --max-turns "$MAX_TURNS" 2>&1 | tee "$log" || true

  # Límite de uso/sesión de Claude Code (no es un fallo de la iteración: no hay nada que reintentar
  # hasta que el límite se libere). Se detiene de inmediato, sin sumar a `fails` ni a la cuenta de
  # iteraciones consecutivas sin cierre limpio.
  if grep -qiE "hit your session limit|usage limit" "$log"; then
    echo "⏳ Límite de uso/sesión alcanzado (ver $log). Deteniendo el loop; vuelve a ejecutar cuando se libere."
    exit 4
  fi
  if grep -q "<promise>LOOP_COMPLETO</promise>" "$log"; then
    echo "✅ Loop completo. Revisa PROGRESS.md y abre el PR manualmente."; exit 0
  fi
  if grep -q "<promise>BLOQUEADO</promise>" "$log"; then
    echo "⛔ Bloqueado: completa las decisiones en $WORK_DIR/DECISIONS.md y vuelve a ejecutar."; exit 2
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
