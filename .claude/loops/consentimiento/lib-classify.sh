# Clasificación del resultado de una iteración del loop de consentimiento (ver run-loop.sh).
# Solo funciones puras (ruta de log -> una línea de salida); sin `set -e`, sin top-level, para poder
# sourcearse desde una prueba aislada sin ejecutar el resto de run-loop.sh.
#
# classify_iteration() busca el ÚLTIMO evento `{"type":"result",...}` en TODO el log, nunca solo la
# última línea: con `--output-format stream-json`, un `grep`/`tail -n 1` sobre la última línea se
# equivoca en dos direcciones.
#   (a) Falso positivo: si la propia iteración lee, edita o diffea run-loop.sh, su tool_result puede
#       contener la cadena literal "<promise>LOOP_COMPLETO</promise>" o "usage limit" como TEXTO del
#       archivo, no como veredicto real — reproducido con
#       loop-consentimiento/logs/iter-001-20261003-123942.log.
#   (b) Falso negativo (2026-10-19, iter-003-20261019-180115.log): la iteración lanzó `gates.sh` EN
#       SEGUNDO PLANO y cerró el turno sin `<promise>`; el evento `{"type":"result","is_error":false,
#       "result":"Esperando a que termine…"}` SÍ se emitió, pero en modo headless (`-p`) cerrar la
#       sesión mata la tarea en segundo plano, y eso añade eventos `"system"/"task_updated"` (con
#       `"patch":{"status":"killed"}`) y `"system"/"task_notification"` DESPUÉS del `result` real. Si
#       solo se mira la última línea no vacía, esa cola de eventos "system" hace que la iteración se
#       clasifique como INTERRUMPIDA (sin result) cuando en realidad terminó con result y es SIN_CIERRE
#       (le faltó la <promise>, no el result). classify_test.sh cubre este log.
# El evento final `{"type":"result",...}` (o, si el proceso murió por un límite de sesión/uso ANTES de
# emitir cualquier JSON, la línea de texto plano que `claude` imprime en ese caso) sigue siendo la única
# fuente fiable del veredicto real — solo que ahora se busca retrocediendo desde el final, no se asume
# que sea la última línea del archivo.
classify_iteration() {
  local log="$1" line msg is_limit last_nonempty

  last_nonempty="$(grep -v '^[[:space:]]*$' "$log" 2>/dev/null | tail -n 1)"

  # Único proceso Node: recorre todas las líneas del log y se queda con la última que parsee como JSON
  # con type "result" (puede no ser la última línea no vacía; ver (b) arriba). Cadena vacía si no hay
  # ningún "result" en todo el log.
  line="$(node -e '
    const fs = require("fs");
    const lines = fs.readFileSync(process.argv[1], "utf8").split("\n");
    let last = "";
    for (const l of lines) {
      const t = l.trim();
      if (!t) continue;
      try {
        const j = JSON.parse(t);
        if (j.type === "result") last = t;
      } catch (e) { /* línea que no es JSON (texto suelto, no el evento result) */ }
    }
    process.stdout.write(last);
  ' "$log" 2>/dev/null)"

  if [[ -n "$line" ]]; then
    msg="$(printf '%s' "$line" | node -e '
      const j = JSON.parse(require("fs").readFileSync(0, "utf8"));
      process.stdout.write(String(j.result ?? ""));
    ' 2>/dev/null)"
    # Límite de uso/sesión también puede llegar como evento "result" normal (no una línea de texto
    # plano sin JSON): {"type":"result","is_error":true,"api_error_status":429,"result":"You've hit
    # your session limit · resets 10pm (America/Guayaquil)"}. api_error_status 429 por sí solo ya es
    # límite; si no viene ese campo, is_error true + "session limit"/"usage limit"/"rate limit" en el
    # mensaje también cuenta — sin depender del carácter "·" (puede no estar, o venir en otro idioma).
    is_limit="$(printf '%s' "$line" | node -e '
      const j = JSON.parse(require("fs").readFileSync(0, "utf8"));
      const msg = String(j.result ?? "");
      const limitText = /session limit|usage limit|rate limit/i.test(msg);
      process.stdout.write((j.api_error_status === 429 || (j.is_error === true && limitText)) ? "1" : "0");
    ' 2>/dev/null)"
    if   [[ "$is_limit" == "1" ]]; then echo "LIMITE $msg"
    elif [[ "$msg" == *"<promise>LOOP_COMPLETO</promise>"* ]]; then echo "LOOP_COMPLETO"
    elif [[ "$msg" == *"<promise>BLOQUEADO</promise>"* ]];     then echo "BLOQUEADO"
    elif [[ "$msg" == *"<promise>ITERACION_OK</promise>"* ]];  then echo "ITERACION_OK"
    else echo "SIN_CIERRE"
    fi
  elif echo "$last_nonempty" | grep -qiE "hit your session limit|usage limit|rate limit"; then
    echo "LIMITE $last_nonempty"
  else
    # Ningún evento "result" en todo el log (p. ej. el proceso murió con gates.sh todavía corriendo en
    # primer plano, antes de poder emitir resultado alguno): no hubo veredicto, la iteración se cortó a
    # medias. Distinto de SIN_CIERRE (sí hubo un "result" final, pero sin <promise> conocida).
    echo "INTERRUMPIDA $last_nonempty"
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

# --- Verificación de Docker Desktop ----------------------------------------------------------------
# Las últimas 3 iteraciones fallaron porque Docker Desktop estaba apagado: gates.sh gastó la iteración
# completa (incluidos turnos de diagnóstico) sin poder correr sql-ciclo-de-vida/sql-guest-limit/db-reset/
# e2e-local. Pura y mockeable: la prueba en classify_test.sh sombrea `docker` con una función antes de
# llamarla, sin tocar el Docker real ni tener Docker instalado.
check_docker() {
  if docker info >/dev/null 2>&1; then
    echo "OK"
  else
    echo "DOCKER_DOWN"
  fi
}
