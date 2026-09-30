#!/usr/bin/env bash
# Puertas de calidad del módulo de Consentimiento Informado (T00). Solo pruebas locales: no toca producción ni
# ningún Supabase remoto. Cada puerta imprime `GATE <nombre>: OK|FAIL|SKIP`; sale con código != 0 si falla alguna
# que NO esté en la línea base. Los FAIL de la línea base se muestran igual (nunca se ocultan) y se explican en PROGRESS.md.
#
#   bash .claude/loops/consentimiento/gates.sh
#   GATES_ONLY="deno-test sql-ciclo-de-vida" bash …/gates.sh     # solo algunas puertas
#   GATES_DB_RESET=1 bash …/gates.sh                              # incluye `supabase db reset` (necesita el stack local)
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
  local out n
  out="$(cd frontend && npx eslint src --ext .ts,.tsx 2>&1 || true)"
  printf '%s\n' "$out"
  n="$(printf '%s\n' "$out" | grep -oE '[0-9]+ problems?' | head -1 | grep -oE '[0-9]+')"; n="${n:-0}"
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
  $DENO test --allow-env --allow-net --allow-read supabase/functions/
  # Aparte: la función de diagnóstico (T03, temporal) también escucha en :8000 y no puede compartir proceso con las otras.
  $DENO test --allow-env --allow-net ../.claude/loops/consentimiento/diag/diag-network-headers/index_test.ts
}

# ── 4. SQL en un Postgres 16 efímero: migraciones del módulo + pruebas autoverificables ─────────────────────────────
sql_ciclo_de_vida() {
  local container="consent-gates-$$"
  docker run -d --rm --name "$container" -e POSTGRES_PASSWORD=postgres postgres:16 >/dev/null
  trap 'docker rm -f "$container" >/dev/null 2>&1 || true' EXIT
  # La imagen arranca un servidor temporal para inicializar y luego lo reinicia: esperar el segundo "ready".
  for _ in $(seq 1 90); do
    [ "$(docker logs "$container" 2>&1 | grep -c 'ready to accept connections')" -ge 2 ] && break
    sleep 1
  done
  psql_in() { docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 -q -o /dev/null "$@"; }
  psql_in -d postgres -c "CREATE DATABASE gates"
  psql_in -d gates < "$TESTS/prereqs.sql"
  psql_in -d gates < "$MIGRATIONS/073_consent_module_foundation.sql"
  psql_in -d gates < "$MIGRATIONS/074_consent_evidence_unlink_and_stable_hash.sql"
  psql_in -d gates < "$MIGRATIONS/075_privacy_settings_versioning.sql"
  psql_in -d gates < "$TESTS/lifecycle.sql"
  psql_in -d gates < "$TESTS/settings_versioning.sql"
  psql_in -d gates < "$TESTS/admin_roles.sql"
}

# ── 4b. INV-SEC (P2, independiente del módulo): tope de invitado en learning_answer/learning_start_exam ────────────
sql_guest_limit() {
  local container="learning-gates-$$"
  docker run -d --rm --name "$container" -e POSTGRES_PASSWORD=postgres postgres:16 >/dev/null
  trap 'docker rm -f "$container" >/dev/null 2>&1 || true' EXIT
  for _ in $(seq 1 90); do
    [ "$(docker logs "$container" 2>&1 | grep -c 'ready to accept connections')" -ge 2 ] && break
    sleep 1
  done
  psql_in() { docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 -q -o /dev/null "$@"; }
  local LTESTS=supabase/tests/learning
  psql_in -d postgres -c "CREATE DATABASE gt"
  psql_in -d gt < "$LTESTS/prereqs.sql"
  psql_in -d gt < "$MIGRATIONS/026_learning_progress.sql"
  psql_in -d gt < "$MIGRATIONS/058_learning_state_guest_fix.sql"
  psql_in -d gt < "$MIGRATIONS/059_learning_state_hide_answer_until_answered.sql"
  psql_in -d gt < "$MIGRATIONS/076_learning_guest_limit.sql"
  psql_in -d gt < "$LTESTS/guest_limit.sql"
}

# ── 5. `supabase db reset` (recrea la base LOCAL desde cero) ─────────────────────────────────────────────────────────
db_reset() { supabase db reset --yes; }

gate typecheck-frontend  typecheck_frontend
gate lint-frontend       lint_frontend
gate unit-frontend       unit_frontend
gate panel-unit          panel_unit
gate panel-e2e           panel_e2e
gate deno-check          deno_check
gate deno-test           deno_test
gate sql-ciclo-de-vida   sql_ciclo_de_vida
gate sql-guest-limit     sql_guest_limit
if [[ "${GATES_DB_RESET:-0}" == "1" ]]; then
  gate db-reset db_reset
else
  skip db-reset "opt-in: GATES_DB_RESET=1 y stack local en marcha; ver línea base: las migraciones antiguas no se reproducen desde cero en PG17 (004)"
fi

echo
if (( ${#FAILED[@]} )); then
  echo "Puertas FALLIDAS fuera de la línea base: ${FAILED[*]}"
  exit 1
fi
echo "Todas las puertas pasaron (las de línea base, si las hay, se muestran arriba como FAIL con su motivo)."
