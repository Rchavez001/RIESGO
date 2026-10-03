#!/usr/bin/env bash
# Ejecutor del loop de consentimiento informado (modo headless de Claude Code).
# Uso:  MAX_ITER=30 bash .claude/loops/consentimiento/run-loop.sh
#       bash .claude/loops/consentimiento/classify_test.sh   # prueba classify_iteration()/
#                                                              # decide_usage_limit() de lib-classify.sh,
#                                                              # sin invocar `claude` ni sourcear/ejecutar
#                                                              # este script
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib-classify.sh"

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

  # Clasificación por el evento final del log (classify_iteration(), en lib-classify.sh): lee SOLO la
  # última línea no vacía, nunca el log completo. Un `grep` sobre todo el archivo da falsos positivos
  # en cuanto la propia iteración lee/edita/diffea este script, cuyo texto contiene literalmente
  # "<promise>LOOP_COMPLETO</promise>" y "usage limit" (ver cabecera de lib-classify.sh).
  classification="$(classify_iteration "$log")"
  case "$classification" in
    LIMITE\ *)
      # Límite de uso/sesión de Claude Code (no es un fallo de la iteración: no sumamos a `fails` ni a
      # la cuenta de iteraciones consecutivas sin cierre limpio en ningún caso de los dos de abajo).
      # - SEMANAL, o no se pudo leer/interpretar la hora de reinicio: se detiene de inmediato (igual
      #   que antes), para que un humano decida.
      # - SESIÓN con hora de reinicio legible: espera hasta esa hora + 5 min (mostrando la hora de
      #   reanudación) y continúa sola. MAX_ITER sigue siendo el tope duro: esta espera consume un `i`
      #   del `for`, nunca lo rodea.
      decision="$(decide_usage_limit "${classification#LIMITE }")"
      if [[ "$decision" == WAIT\ * ]]; then
        resume_epoch="${decision#WAIT }"
        now_epoch="$(date +%s)"
        wait_seconds=$(( resume_epoch - now_epoch ))
        (( wait_seconds < 0 )) && wait_seconds=0
        echo "⏳ Límite de SESIÓN alcanzado (ver $log)."
        echo "   Reanudando a las $(date -d "@$resume_epoch" '+%Y-%m-%d %H:%M %Z') (hora de reinicio + 5 min; espera ${wait_seconds}s). MAX_ITER=$MAX_ITER sigue limitando el total de iteraciones."
        sleep "$wait_seconds"
        echo "▶️  Fin de la espera. Retomando el loop (próxima iteración: $((i + 1)))."
        continue
      fi
      echo "⏳ Límite de uso/sesión alcanzado (ver $log): ${decision#STOP }. Deteniendo el loop; vuelve a ejecutar cuando se libere."
      exit 4
      ;;
    LOOP_COMPLETO)
      echo "✅ Loop completo. Revisa PROGRESS.md y abre el PR manualmente."; exit 0
      ;;
    BLOQUEADO)
      echo "⛔ Bloqueado: completa las decisiones en $WORK_DIR/DECISIONS.md y vuelve a ejecutar."; exit 2
      ;;
    ITERACION_OK)
      fails=0
      ;;
    *)
      fails=$((fails+1))
      echo "⚠ Iteración sin cierre limpio ($fails consecutivas)."
      if (( fails >= 3 )); then
        echo "🛑 3 iteraciones seguidas sin cierre. Revisión humana necesaria."; exit 3
      fi
      ;;
  esac
  sleep "$PAUSE"
done
echo "Se alcanzó MAX_ITER=$MAX_ITER sin completar."; exit 1
