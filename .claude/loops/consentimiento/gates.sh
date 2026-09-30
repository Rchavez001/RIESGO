#!/usr/bin/env bash
# Puertas de calidad del módulo de Consentimiento Informado (T00). Solo pruebas locales: no toca producción ni
# ningún Supabase remoto. Cada puerta imprime `GATE <nombre>: OK|FAIL|SKIP`; sale con código != 0 si falla alguna
# que NO esté en la línea base. Los FAIL de la línea base se muestran igual (nunca se ocultan) y se explican en PROGRESS.md.
#
#   bash .claude/loops/consentimiento/gates.sh
#   GATES_ONLY="deno-test sql-ciclo-de-vida" bash …/gates.sh     # solo algunas puertas
#   GATES_DB_RESET=1 bash …/gates.sh                              # incluye `supabase db reset` (necesita el stack local)
#   GATES_SELFTEST=1 bash …/gates.sh                              # autoprueba: cada puerta inyecta su propio fallo
#                                                                  # controlado y se espera que TODAS reporten FAIL
#
# Requiere Node (npx) y Docker en marcha (para la puerta SQL). Deno se fija a la versión con la que se escribieron las pruebas.
set -uo pipefail

DENO_VERSION=2.9.6
DENO="npx -y deno@${DENO_VERSION}"

ROOT="$(git rev-parse --show-toplevel)"
LOOP="$ROOT/.claude/loops/consentimiento"
cd "$ROOT/shield-ecuador-app"
LOGS="$LOOP/logs"; mkdir -p "$LOGS"
MIGRATIONS=supabase/migrations
TESTS=supabase/tests/consent

# ── Línea base: puertas que ya fallaban ANTES de este módulo. Cada una con su motivo; se siguen ejecutando y mostrando. ──
BASELINE_FAIL=(
  # (se rellena tras medir; ver "Línea base de gates" en PROGRESS.md)
)

FAILED=()
is_baseline() { local n; for n in "${BASELINE_FAIL[@]:-}"; do [[ "$n" == "$1" ]] && return 0; done; return 1; }
wanted() { [[ -z "${GATES_ONLY:-}" ]] || [[ " ${GATES_ONLY} " == *" $1 "* ]]; }

gate() {
  local name="$1"; shift
  wanted "$name" || return 0
  local log="$LOGS/gate-$name.log" start=$SECONDS
  if ( "$@" ) >"$log" 2>&1; then
    echo "GATE $name: OK ($((SECONDS - start))s)"
    grep '^NOTA:' "$log" | sed 's/^/    /' || true
  else
    echo "GATE $name: FAIL ($((SECONDS - start))s)  → $log"
    tail -n 12 "$log" | sed 's/^/    | /'
    if is_baseline "$name"; then echo "    (línea base: ya fallaba antes de este módulo; ver PROGRESS.md)"; else FAILED+=("$name"); fi
  fi
}
skip() { wanted "$1" && echo "GATE $1: SKIP ($2)"; return 0; }

# ── 1. Frontend ─────────────────────────────────────────────────────────────────────────────────────────────────────
typecheck_frontend() { (cd frontend && npx tsc --noEmit -p tsconfig.json); }
# Lint con TOPE: ya había problemas antes de este módulo, en archivos ajenos (ver "Línea base de gates" en PROGRESS.md). Se siguen
# mostrando todos; la puerta falla si hay MÁS que la línea base, así no entra deuda nueva ni se esconde la vieja.
LINT_BASELINE_PROBLEMS=14
lint_frontend() {
  local out rc n
  out="$(cd frontend && npx eslint src --ext .ts,.tsx 2>&1)"; rc=$?
  printf '%s\n' "$out"
  n="$(printf '%s\n' "$out" | grep -oE '[0-9]+ problems?' | head -1 | grep -oE '[0-9]+')"
  if [[ -z "$n" ]]; then
    # Sin resumen "N problems": si además el código de salida no es 0, eslint no llegó a lintear de
    # verdad (config rota, binario ausente, crash) — eso NO es "0 problemas", es un fallo de la puerta.
    if (( rc != 0 )); then echo "FALLO: eslint terminó con código $rc sin un resumen de problemas reconocible (ver arriba)"; return 1; fi
    n=0
  fi
  if (( n > LINT_BASELINE_PROBLEMS )); then echo "FALLO: $n problemas de lint; la línea base es $LINT_BASELINE_PROBLEMS"; return 1; fi
  echo "NOTA: lint con $n problemas (línea base $LINT_BASELINE_PROBLEMS, preexistentes en archivos ajenos al módulo)"
}
unit_frontend()      { (cd frontend && CI=true npx react-scripts test --watchAll=false); }

# ── 2. Panel de administración (central-admin-app, Node sin dependencias) ──────────────────────────────────────────
panel_unit() { (cd central-admin-app && npm test) && node tests/url-guard.test.cjs && node tests/shuffle-options.test.cjs; }
# Playwright del panel contra el server.js real con un upstream simulado (tests/admin/start-admin.cjs). Un perfil, reporter line.
# El servidor de pruebas del panel (:3198) se REUTILIZA entre corridas (reuseExistingServer) y su limitador de autenticaciones fallidas
# (10 cada 10 min) es en memoria: una segunda corrida seguida recibía 429 en vez de 401. Se cierra cualquier start-admin.cjs antes y después.
stop_panel_test_server() {
  if command -v powershell >/dev/null 2>&1; then
    powershell -NoProfile -Command 'Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match "start-admin\.cjs" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }' >/dev/null 2>&1 || true
  else
    pkill -f start-admin.cjs >/dev/null 2>&1 || true
  fi
}
panel_e2e() {
  local rc=0
  stop_panel_test_server
  PW_TEST_HTML_REPORT_OPEN=never npx playwright test -c playwright.admin.config.ts --project=desktop-chrome --reporter=line --workers=2 --timeout=60000 || rc=$?
  stop_panel_test_server
  return $rc
}

# ── 3. Funciones (Deno) ──────────────────────────────────────────────────────────────────────────────────────────────
deno_check() {
  $DENO check supabase/functions/secure-register-user/index.ts supabase/functions/get-consent-notice/index.ts \
    supabase/functions/_shared/auth-guard.ts supabase/functions/admin-consent/index.ts \
    ../.claude/loops/consentimiento/diag/diag-network-headers/index.ts
}
deno_test() {
  # Aparte: la función de diagnóstico (T03, temporal) también escucha en :8000 y no puede compartir proceso con las otras.
  $DENO test --allow-env --allow-net --allow-read supabase/functions/ && \
  $DENO test --allow-env --allow-net ../.claude/loops/consentimiento/diag/diag-network-headers/index_test.ts
}

# ── 4. SQL en un Postgres 16 efímero: migraciones del módulo + pruebas autoverificables ─────────────────────────────
# Contenedores efímeros de Postgres. Antes, cada puerta ponía un `trap … EXIT` dentro de su función; esa función corre en
# un subshell y en Git Bash el trap no llegaba a dispararse: los contenedores quedaban vivos tras cada corrida. Ahora:
# (1) cada contenedor lleva la etiqueta de ESTA corrida, (2) `with_pg` lo elimina explícitamente al terminar la puerta,
# pase lo que pase, y (3) un trap EXIT/INT/TERM del proceso PRINCIPAL elimina todo lo que tenga la etiqueta (Ctrl-C incluido).
GATES_RUN_LABEL="consent-gates-run=$$-$(date +%s)"
cleanup_pg_containers() {
  local ids
  ids="$(docker ps -aq --filter "label=$GATES_RUN_LABEL" 2>/dev/null || true)"
  [[ -n "$ids" ]] && docker rm -f $ids >/dev/null 2>&1 || true
}
trap cleanup_pg_containers EXIT
trap 'cleanup_pg_containers; exit 130' INT TERM

# with_pg <prefijo> <función>: arranca Postgres 16, espera a que esté listo, llama a <función> <contenedor> y lo elimina.
with_pg() {
  local container="$1-$$-$RANDOM" rc=0
  docker run -d --rm --label "$GATES_RUN_LABEL" --name "$container" -e POSTGRES_PASSWORD=postgres postgres:16 >/dev/null || return 1
  # La imagen arranca un servidor temporal para inicializar y luego lo reinicia: esperar el segundo "ready".
  for _ in $(seq 1 90); do
    [ "$(docker logs "$container" 2>&1 | grep -c 'ready to accept connections')" -ge 2 ] && break
    sleep 1
  done
  "$2" "$container" || rc=$?
  docker rm -f "$container" >/dev/null 2>&1 || true
  return $rc
}

sql_ciclo_de_vida() { with_pg consent-gates sql_ciclo_de_vida_in; }
sql_ciclo_de_vida_in() {
  local container="$1"
  psql_in() { docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 -q -o /dev/null "$@"; }
  psql_in -d postgres -c "CREATE DATABASE gates" && \
  psql_in -d gates < "$TESTS/prereqs.sql" && \
  psql_in -d gates < "$MIGRATIONS/073_consent_module_foundation.sql" && \
  psql_in -d gates < "$MIGRATIONS/074_consent_evidence_unlink_and_stable_hash.sql" && \
  psql_in -d gates < "$MIGRATIONS/075_privacy_settings_versioning.sql" && \
  psql_in -d gates < "$MIGRATIONS/077_consent_documents_no_gap_on_retire.sql" && \
  psql_in -d gates < "$TESTS/lifecycle.sql" && \
  psql_in -d gates < "$TESTS/settings_versioning.sql" && \
  psql_in -d gates < "$TESTS/consent_documents_lifecycle.sql" && \
  psql_in -d gates < "$TESTS/admin_roles.sql" && \
  consent_records_concurrency_check "$container"
}

# T07: inserciones concurrentes de consent_records deben mantener la cadena de hash válida. Necesita
# conexiones REALES simultáneas (pg_advisory_xact_lock serializa entre transacciones distintas, no
# dentro de una sola sesión secuencial), así que no se puede expresar en un único script SQL: se lanzan
# N procesos `psql` en paralelo, cada uno en su propia conexión al mismo contenedor.
consent_records_concurrency_check() {
  local container="$1" n=8 i pid pids=() rc=0
  docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 -q -o /dev/null -d gates -c "
    INSERT INTO public.users (email) VALUES ('concurrency@test.local');
    INSERT INTO public.consent_documents (version, title, content_md, content_sha256, purposes, status, created_by)
      SELECT 'conc-1.0', 't', 'md', 'sha', '[]'::jsonb, 'draft', id FROM public.users WHERE role = 'admin';
  " || return 1
  for i in $(seq 1 "$n"); do
    docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 -q -o /dev/null -d gates -c "
      INSERT INTO public.consent_records (user_id, user_ref_hmac, document_id, document_version, rendered_sha256,
          settings_version, purpose_code, decision, channel, ip_ciphertext, ip_hmac, ua_ciphertext, ua_hmac, key_version)
        SELECT u.id, 'ref-conc-$i', d.id, 'conc-1.0', 'r', 1, 'registro_aprendizaje', 'granted', 'registro',
               '{\"v\":1,\"iv\":\"x\",\"tag\":\"y\",\"ct\":\"z\",\"aad\":true}'::jsonb, 'iphmac-$i',
               '{\"v\":1,\"ct\":\"ua\",\"aad\":true}'::jsonb, 'uahmac', 1
        FROM public.users u, public.consent_documents d
        WHERE u.email = 'concurrency@test.local' AND d.version = 'conc-1.0';
    " &
    pids+=("$!")
  done
  for pid in "${pids[@]}"; do wait "$pid" || rc=1; done
  if [[ $rc -ne 0 ]]; then echo "una inserción concurrente de consent_records falló"; return 1; fi
  docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 -q -o /dev/null -d gates -c "
    DO \$\$
    DECLARE actual int; broken record;
    BEGIN
      SELECT count(*) INTO actual FROM public.consent_records WHERE user_ref_hmac LIKE 'ref-conc-%';
      IF actual <> $n THEN
        RAISE EXCEPTION 'se esperaban % filas de las inserciones concurrentes, hubo %', $n, actual;
      END IF;
      SELECT * INTO broken FROM public.verify_consent_chain();
      IF FOUND THEN
        RAISE EXCEPTION 'la cadena quedó rota tras % inserciones concurrentes: fila % — %', $n, broken.first_broken_id, broken.detail;
      END IF;
    END \$\$;
  "
}

# ── 4b. INV-SEC (P2, independiente del módulo): tope de invitado en learning_answer/learning_start_exam ────────────
sql_guest_limit() { with_pg learning-gates sql_guest_limit_in; }
sql_guest_limit_in() {
  local container="$1"
  psql_in() { docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 -q -o /dev/null "$@"; }
  local LTESTS=supabase/tests/learning
  psql_in -d postgres -c "CREATE DATABASE gt" && \
  psql_in -d gt < "$LTESTS/prereqs.sql" && \
  psql_in -d gt < "$MIGRATIONS/026_learning_progress.sql" && \
  psql_in -d gt < "$MIGRATIONS/058_learning_state_guest_fix.sql" && \
  psql_in -d gt < "$MIGRATIONS/059_learning_state_hide_answer_until_answered.sql" && \
  psql_in -d gt < "$MIGRATIONS/076_learning_guest_limit.sql" && \
  psql_in -d gt < "$LTESTS/guest_limit.sql"
}

# ── 5. `supabase db reset` (recrea la base LOCAL desde cero) ─────────────────────────────────────────────────────────
db_reset() { supabase db reset --yes; }

# ── 6. Autoprueba de las propias puertas: GATES_SELFTEST=1 sustituye cada función de verificación por una
# variante que inyecta un fallo controlado (real: ejecuta la herramienta de verdad contra una entrada rota,
# nunca un atajo simulado) y se limpia sola. Con todas las puertas rotas a propósito, la corrida completa
# debe terminar con TODAS en FAIL y el script debe salir con código != 0. Si alguna reporta OK bajo
# GATES_SELFTEST=1, esa puerta no está verificando nada de verdad — el mismo defecto que motivó esto.
#   GATES_SELFTEST=1 bash .claude/loops/consentimiento/gates.sh
if [[ "${GATES_SELFTEST:-0}" == "1" ]]; then
  echo "== GATES_SELFTEST=1: cada puerta se sustituye por una variante que inyecta un fallo controlado =="
  SELFTEST_CLEANUP=()
  PANEL_UNIT_TEST_FILE="central-admin-app/tests/tpotService.test.js"
  PANEL_UNIT_TEST_BACKUP=""
  selftest_cleanup() {
    local f
    for f in "${SELFTEST_CLEANUP[@]:-}"; do [[ -n "$f" ]] && rm -f "$f"; done
    [[ -n "$PANEL_UNIT_TEST_BACKUP" ]] && printf '%s\n' "$PANEL_UNIT_TEST_BACKUP" > "$PANEL_UNIT_TEST_FILE"
  }
  trap 'selftest_cleanup; cleanup_pg_containers' EXIT
  trap 'selftest_cleanup; cleanup_pg_containers; exit 130' INT TERM

  typecheck_frontend() {
    local f="frontend/src/__gates_selftest_broken.ts" rc
    echo 'const __gatesSelftestBroken: number = "not-a-number";' > "$f"
    SELFTEST_CLEANUP+=("$f")
    (cd frontend && npx tsc --noEmit -p tsconfig.json); rc=$?
    rm -f "$f"; return $rc
  }

  LINT_BASELINE_PROBLEMS=-1   # cualquier cantidad de problemas (incluido 0) hace que "n > -1" sea verdad

  unit_frontend() {
    local f="frontend/src/__gates_selftest.test.js" rc
    printf "test('gates selftest', () => { expect(1).toBe(2); });\n" > "$f"
    SELFTEST_CLEANUP+=("$f")
    (cd frontend && CI=true npx react-scripts test --watchAll=false); rc=$?
    rm -f "$f"; return $rc
  }

  panel_unit() {
    # `npm test` aquí es `node tests/tpotService.test.js`, un único archivo fijo (sin glob de
    # descubrimiento) — crear un archivo aparte no lo ejercitaría. Se añade un fallo al final del
    # archivo real y se restaura su contenido exacto después (también si el script se interrumpe:
    # PANEL_UNIT_TEST_BACKUP lo restaura el trap de selftest_cleanup).
    local rc
    PANEL_UNIT_TEST_BACKUP="$(cat "$PANEL_UNIT_TEST_FILE")"
    { printf '%s\n' "$PANEL_UNIT_TEST_BACKUP"; printf '\nthrow new Error("gates selftest fallo a proposito");\n'; } > "$PANEL_UNIT_TEST_FILE"
    (cd central-admin-app && npm test); rc=$?
    printf '%s\n' "$PANEL_UNIT_TEST_BACKUP" > "$PANEL_UNIT_TEST_FILE"
    PANEL_UNIT_TEST_BACKUP=""
    return $rc
  }

  panel_e2e() {
    local f="tests/admin/__gates_selftest.spec.ts" rc=0
    cat > "$f" <<'SELFTEST_SPEC'
import { test, expect } from '@playwright/test';
test('gates selftest', async () => { expect(true).toBe(false); });
SELFTEST_SPEC
    SELFTEST_CLEANUP+=("$f")
    stop_panel_test_server
    PW_TEST_HTML_REPORT_OPEN=never npx playwright test -c playwright.admin.config.ts --project=desktop-chrome --reporter=line --workers=2 --timeout=60000 || rc=$?
    stop_panel_test_server
    rm -f "$f"; return $rc
  }

  deno_check() {
    local f="supabase/functions/_shared/__gates_selftest_broken.ts" rc
    echo 'const __gatesSelftestBroken: string = 123;' > "$f"
    SELFTEST_CLEANUP+=("$f")
    $DENO check supabase/functions/secure-register-user/index.ts supabase/functions/get-consent-notice/index.ts \
      supabase/functions/_shared/auth-guard.ts supabase/functions/admin-consent/index.ts \
      ../.claude/loops/consentimiento/diag/diag-network-headers/index.ts "$f"; rc=$?
    rm -f "$f"; return $rc
  }

  deno_test() {
    local f="supabase/functions/_shared/__gates_selftest_test.ts" rc
    printf "Deno.test('gates selftest', () => { throw new Error('gates selftest fallo a propósito'); });\n" > "$f"
    SELFTEST_CLEANUP+=("$f")
    $DENO test --allow-env --allow-net --allow-read supabase/functions/; rc=$?
    rm -f "$f"; return $rc
  }

  sql_ciclo_de_vida_in() {
    local container="$1"
    psql_in() { docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 -q -o /dev/null "$@"; }
    psql_in -d postgres -c "CREATE DATABASE gates" && \
    psql_in -d gates < "$TESTS/prereqs.sql" && \
    psql_in -d gates -c "SELECT 1/0;"    # fallo inyectado A MITAD de la secuencia, no al final
  }

  sql_guest_limit_in() {
    local container="$1"
    psql_in() { docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 -q -o /dev/null "$@"; }
    local LTESTS=supabase/tests/learning
    psql_in -d postgres -c "CREATE DATABASE gt" && \
    psql_in -d gt < "$LTESTS/prereqs.sql" && \
    psql_in -d gt -c "SELECT 1/0;"
  }

  db_reset() { false; }
fi

gate typecheck-frontend  typecheck_frontend
gate lint-frontend       lint_frontend
gate unit-frontend       unit_frontend
gate panel-unit          panel_unit
gate panel-e2e           panel_e2e
gate deno-check          deno_check
gate deno-test           deno_test
gate sql-ciclo-de-vida   sql_ciclo_de_vida
gate sql-guest-limit     sql_guest_limit
if [[ "${GATES_DB_RESET:-0}" == "1" || "${GATES_SELFTEST:-0}" == "1" ]]; then
  gate db-reset db_reset
else
  skip db-reset "opt-in: GATES_DB_RESET=1 y stack local en marcha; ver línea base: las migraciones antiguas no se reproducen desde cero en PG17 (004)"
fi

echo
if [[ "${GATES_SELFTEST:-0}" == "1" ]]; then
  # Resultado de la AUTOPRUEBA, no de las puertas reales: bajo GATES_SELFTEST=1 se fuerza también a
  # db-reset a correr (ver el `if` de arriba), así que las 10 puertas deben reportar FAIL — eso es un
  # éxito de la autoprueba (exit 0). Si alguna reporta OK, esa puerta no detecta nada de verdad (exit 1).
  if (( ${#FAILED[@]} == 10 )); then
    echo "AUTOPRUEBA OK: las 10 puertas detectaron su fallo inyectado y reportaron FAIL."
    exit 0
  else
    echo "AUTOPRUEBA FALLIDA: se esperaban 10 puertas en FAIL, hubo ${#FAILED[@]} (${FAILED[*]:-ninguna})."
    echo "Las puertas que no están en esa lista no detectaron su fallo inyectado: no verifican nada de verdad."
    exit 1
  fi
fi
if (( ${#FAILED[@]} )); then
  echo "Puertas FALLIDAS fuera de la línea base: ${FAILED[*]}"
  exit 1
fi
echo "Todas las puertas pasaron (las de línea base, si las hay, se muestran arriba como FAIL con su motivo)."
