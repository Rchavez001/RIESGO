#!/usr/bin/env bash
# Prueba aislada de lib-classify.sh: solo sourcea lib-classify.sh (NUNCA run-loop.sh, ni `source` ni
# `bash`) para no disparar el loop real (switch de rama, invocación de `claude`, trap de salida, etc.).
# Uso (desde la raíz del repo): bash .claude/loops/consentimiento/classify_test.sh
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/lib-classify.sh"

git rev-parse --is-inside-work-tree >/dev/null 2>&1 || { echo "Ejecutar desde la raíz del repo"; exit 1; }
LOGS_DIR="loop-consentimiento/logs"

pass=0; fail=0

check_classify() {  # check_classify <nombre> <log-real> <esperado-prefijo>
  local name="$1" log="$2" expected="$3" got
  got="$(classify_iteration "$log")"
  if [[ "$got" == "$expected"* ]]; then
    echo "  OK   $name -> $got"; pass=$((pass+1))
  else
    echo "  FAIL $name -> '$got' (esperaba prefijo '$expected')"; fail=$((fail+1))
  fi
}

check_wait() {  # check_wait <nombre> <mensaje> <epoch-objetivo> <tolerancia-seg>
  local name="$1" got epoch diff
  got="$(decide_usage_limit "$2")"
  if [[ "$got" != WAIT\ * ]]; then echo "  FAIL $name -> $got (esperaba WAIT)"; fail=$((fail+1)); return; fi
  epoch="${got#WAIT }"; diff=$(( epoch - $3 )); (( diff < 0 )) && diff=$(( -diff ))
  if (( diff <= $4 )); then echo "  OK   $name -> $got (objetivo ~$3, Δ=${diff}s)"; pass=$((pass+1))
  else echo "  FAIL $name -> $got (objetivo ~$3 ±$4s, Δ=${diff}s)"; fail=$((fail+1)); fi
}

check_stop() {  # check_stop <nombre> <mensaje>
  local name="$1" got
  got="$(decide_usage_limit "$2")"
  if [[ "$got" == STOP\ * ]]; then echo "  OK   $name -> $got"; pass=$((pass+1))
  else echo "  FAIL $name -> $got (esperaba STOP)"; fail=$((fail+1)); fi
}

echo "== classify_iteration() sobre 3 logs reales de loop-consentimiento/logs/ =="
# 1) Corrida limpia de la Iteración 33 (09:58, cierra T14.d / commit 944b69b): termina con el evento
#    final {"type":"result",...} cuyo "result" trae <promise>ITERACION_OK</promise>.
check_classify "09:58 — cierre limpio ITERACION_OK" \
  "$LOGS_DIR/iter-001-20261003-095846.log" "ITERACION_OK"

# 2) Corrida accidental de las 12:39 (editaba este mismo run-loop.sh y a la vez investigaba SMTP/SSRF;
#    terminó interrumpida): el evento final real es {"type":"system","subtype":"task_notification",...},
#    SIN veredicto — aunque el log, más arriba, contiene ambas cadenas "<promise>LOOP_COMPLETO</promise>"
#    y "usage limit" como texto de un diff/lectura de run-loop.sh, no como veredicto. Si esto da
#    LOOP_COMPLETO o LIMITE, la regresión (grep sobre el log completo) volvió.
check_classify "12:39 — interrumpida, sin cierre limpio" \
  "$LOGS_DIR/iter-001-20261003-123942.log" "SIN_CIERRE"

# 3) Límite de sesión real (proceso murió antes de emitir ningún JSON; el log es solo la línea de
#    texto plano que imprime `claude` en ese caso).
check_classify "límite de sesión real (texto plano, sin JSON)" \
  "$LOGS_DIR/iter-002-20261001-000211.log" "LIMITE You've hit your session limit"

echo "== decide_usage_limit() con mensajes sintéticos =="
now="$(date +%s)"
future_label="$(date -d '+2 minutes' '+%-I:%M %p')"
past_label="$(date -d '-2 minutes' '+%-I:%M %p')"

# Tolerancia 65s: el mensaje real solo trae hora:minuto ("resets 2pm"), igual que $future_label/
# $past_label aquí (sin segundos) — se pierden hasta ~60s al truncar los segundos de "+2 minutes".
check_wait "sesión, hora futura (hoy)" \
  "Claude AI usage limit reached|your session limit will reset at $future_label." \
  $((now + 120 + 300)) 65

check_wait "sesión, hora ya pasada (-> mañana)" \
  "Claude AI usage limit reached|your session limit will reset at $past_label." \
  $((now - 120 + 86400 + 300)) 65

check_stop "límite semanal -> no espera" \
  "Claude AI usage limit reached|your weekly limit will reset Friday at 9am."

check_stop "sesión sin hora legible -> no espera" \
  "Claude AI usage limit reached|your session limit will reset soon."

# También el mensaje real de iter-002 (sin fecha, con zona horaria entre paréntesis).
three_am_epoch="$(date -d '3am' +%s)"
(( three_am_epoch <= now )) && three_am_epoch=$(( three_am_epoch + 86400 ))
check_wait "mensaje real de iter-002 (resets 3am America/Guayaquil)" \
  "You've hit your session limit · resets 3am (America/Guayaquil)" \
  $(( three_am_epoch + 300 )) 65

echo "== check_docker() (docker mockeado, sin tocar el Docker real) =="
check_docker_case() {  # check_docker_case <nombre> <rc-mock-de-docker> <esperado>
  local name="$1" mock_rc="$2" expected="$3" got
  docker() { return "$mock_rc"; }
  got="$(check_docker)"
  unset -f docker
  if [[ "$got" == "$expected" ]]; then
    echo "  OK   $name -> $got"; pass=$((pass+1))
  else
    echo "  FAIL $name -> '$got' (esperaba '$expected')"; fail=$((fail+1))
  fi
}
check_docker_case "docker arriba -> OK" 0 "OK"
check_docker_case "docker caído -> DOCKER_DOWN" 1 "DOCKER_DOWN"

echo "classify_test.sh: $pass OK, $fail FAIL"
if (( fail > 0 )); then exit 1; else exit 0; fi
