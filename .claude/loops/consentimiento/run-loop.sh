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
MAX_TURNS="${MAX_TURNS:-100}"
PAUSE="${PAUSE:-5}"

command -v claude >/dev/null || { echo "Claude Code (claude) no está instalado"; exit 1; }
git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "Ejecutar en la raíz del repo"; exit 1; }

current="$(git branch --show-current)"
if [[ "$current" != "$BRANCH" ]]; then
  git switch "$BRANCH" 2>/dev/null || git switch -c "$BRANCH"
fi
mkdir -p "$WORK_DIR/logs"

# Mismo aviso que al empezar cada iteración (ver más abajo), pero disparado al TERMINAR el loop
# por cualquier motivo (los `exit 0/1/2/3/4` de abajo, o una señal/error no previsto) — con `trap ... EXIT`
# se ejecuta siempre, así el límite de sesión (exit 4) ya no puede dejar cambios sin commitear sin que
# se note en la terminal/log de esa misma corrida.
warn_dirty_on_exit() {
  local dirty
  dirty="$(git status --short 2>/dev/null || true)"
  if [[ -n "$dirty" ]]; then
    echo "⚠️  El loop está terminando con cambios sin commitear:"
    echo "$dirty" | sed 's/^/    /'
  fi
}
trap warn_dirty_on_exit EXIT

fails=0
for i in $(seq 1 "$MAX_ITER"); do
  ts="$(date +%Y%m%d-%H%M%S)"
  log="$WORK_DIR/logs/iter-$(printf '%03d' "$i")-$ts.log"
  echo "════ Iteración $i/$MAX_ITER · $ts ════"

  # Aviso de archivos sin commitear DE UNA ITERACIÓN ANTERIOR (p. ej. una que murió a mitad de camino
  # por un límite de sesión, como iter-002-20261001-000211.log: 843 líneas de T14 quedaron sin commitear
  # y sin que nadie se enterara hasta una sesión interactiva aparte, varias horas después). El paso 1 del
  # protocolo (PROMPT.md) ya le pide al agente que las evalúe, pero si la iteración siguiente también
  # muere pronto (p. ej. otro límite de sesión inmediato), nadie ve el aviso salvo que alguien lea los
  # logs a mano. Esto lo deja a la vista en la terminal/log de ESTA iteración, antes de invocar a Claude
  # — no bloquea el loop (el agente puede seguir resolviéndolo él mismo), solo evita que pase inadvertido.
  dirty="$(git status --short 2>/dev/null || true)"
  if [[ -n "$dirty" ]]; then
    echo "⚠️  Hay cambios sin commitear de ANTES de esta iteración — revisar si son de una iteración interrumpida:"
    echo "$dirty" | sed 's/^/    /'
  fi

  # Los permisos (allow/deny) se leen de .claude/settings.json del proyecto, más
  # headless-settings.json: deniega tocar los propios archivos de permisos y del loop
  # (gates.sh, run-loop.sh) para que la ejecución headless no pueda ampliarse privilegios
  # ni alterar sus propias puertas de verificación.
  # --output-format stream-json --verbose: vuelca cada turno (texto, uso de herramientas, resultados,
  # permisos denegados) en JSONL dentro de $log, en vez de solo el texto final. Antes, cuando una
  # iteración terminaba sin cierre limpio (p. ej. "Reached max turns"), la única forma de saber en qué
  # se gastaron los turnos era buscar la transcripción completa en ~/.claude/projects/ a mano; ahora
  # queda en el log de ESTA misma corrida. Los `grep` de abajo (promesas, límite de sesión) siguen
  # funcionando igual: buscan una subcadena literal, y el JSON no la altera.
  claude -p "$(cat "$LOOP_DIR/PROMPT.md")" \
    --permission-mode acceptEdits \
    --settings "$LOOP_DIR/headless-settings.json" \
    --max-turns "$MAX_TURNS" \
    --output-format stream-json --verbose 2>&1 | tee "$log" || true

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
