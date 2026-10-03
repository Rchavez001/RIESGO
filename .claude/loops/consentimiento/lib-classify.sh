# Clasificación del resultado de una iteración del loop de consentimiento (ver run-loop.sh).
# Solo funciones puras (ruta de log -> una línea de salida); sin `set -e`, sin top-level, para poder
# sourcearse desde una prueba aislada sin ejecutar el resto de run-loop.sh.
#
# classify_iteration() lee SOLO la última línea no vacía del log, nunca el log completo: con
# `--output-format stream-json`, un `grep` sobre todo el archivo encuentra falsos positivos en cuanto
# la propia iteración lee, edita o diffea run-loop.sh (su tool_result incluye, por ejemplo, la cadena
# literal "<promise>LOOP_COMPLETO</promise>" o "usage limit" como TEXTO del archivo, no como veredicto
# real) — reproducido con loop-consentimiento/logs/iter-001-20261003-123942.log, que termina en un
# evento "system"/"task_notification" (sin cierre limpio) pero contiene ambas cadenas en medio del log
# porque esa iteración estaba editando este mismo script. El evento final `{"type":"result",...}` (o,
# si el proceso murió por un límite de sesión/uso, la línea de texto plano que `claude` imprime en ese
# caso, sin JSON) es la única fuente fiable del veredicto real de la iteración.
classify_iteration() {
  local log="$1" line line_type msg
  line="$(grep -v '^[[:space:]]*$' "$log" 2>/dev/null | tail -n 1)"

  line_type="$(printf '%s' "$line" | node -e '
    try { const j = JSON.parse(require("fs").readFileSync(0, "utf8")); process.stdout.write(j.type || ""); }
    catch (e) { /* línea final no es JSON (p. ej. límite de sesión/uso: texto plano) */ }
  ' 2>/dev/null)"

  if [[ "$line_type" == "result" ]]; then
    msg="$(printf '%s' "$line" | node -e '
      const j = JSON.parse(require("fs").readFileSync(0, "utf8"));
      process.stdout.write(String(j.result ?? ""));
    ' 2>/dev/null)"
    if   [[ "$msg" == *"<promise>LOOP_COMPLETO</promise>"* ]]; then echo "LOOP_COMPLETO"
    elif [[ "$msg" == *"<promise>BLOQUEADO</promise>"* ]];     then echo "BLOQUEADO"
    elif [[ "$msg" == *"<promise>ITERACION_OK</promise>"* ]];  then echo "ITERACION_OK"
    else echo "SIN_CIERRE"
    fi
  elif echo "$line" | grep -qiE "hit your session limit|usage limit"; then
    echo "LIMITE $line"
  else
    echo "SIN_CIERRE"
  fi
}

# --- Límite de uso/sesión de Claude Code: ¿esperar o detenerse? -----------------------------------
# Un límite SEMANAL no trae una hora de reinicio útil para esperar sin supervisión: el loop se detiene
# (exit 4) igual que siempre, para que un humano decida. Un límite de SESIÓN sí suele traer una hora
# de reinicio en el propio mensaje ("resets 2pm", "reset at 2:30 PM (America/…)"); en ese caso el loop
# puede esperar hasta esa hora + 5 min de margen y seguir solo, sin gastar una revisión humana por cada
# ventana de sesión. Si no se puede distinguir sesión/semanal, o no se puede leer o interpretar la hora,
# el comportamiento es el de siempre: detenerse. MAX_ITER sigue siendo el tope duro de iteraciones en
# cualquier caso (cada espera consume un `i` del `for` de run-loop.sh, nunca lo rodea).
#
# Recibe el MENSAJE ya aislado (lo extrae classify_iteration de la última línea del log, nunca el log
# completo) -> una línea de salida: "WAIT <epoch-de-reanudación>" o "STOP <motivo>".
decide_usage_limit() {
  local msg="$1" time_str reset_epoch now_epoch
  if echo "$msg" | grep -qiE "week"; then
    echo "STOP límite semanal (no se espera; requiere decisión humana)"
    return
  fi
  if ! echo "$msg" | grep -qiE "session"; then
    echo "STOP no se pudo distinguir si el límite es de sesión o semanal"
    return
  fi
  time_str="$(echo "$msg" | grep -ioE 'resets?[^.|]*' | head -1 \
    | grep -oE '[0-9]{1,2}:[0-9]{2}[[:space:]]*[AaPp]\.?[Mm]\.?|[0-9]{1,2}[[:space:]]*[AaPp]\.?[Mm]\.?|[0-9]{1,2}:[0-9]{2}' \
    | head -1)" || true
  if [[ -z "$time_str" ]]; then
    echo "STOP no se encontró una hora de reinicio ('resets …') en el mensaje"
    return
  fi
  if ! reset_epoch="$(date -d "$time_str" +%s 2>/dev/null)"; then
    echo "STOP no se pudo interpretar la hora de reinicio '$time_str'"
    return
  fi
  now_epoch="$(date +%s)"
  # "resets 2pm" sin fecha: si esa hora de hoy ya pasó, es la de mañana.
  (( reset_epoch <= now_epoch )) && reset_epoch=$(( reset_epoch + 86400 ))
  echo "WAIT $(( reset_epoch + 300 ))"
}
