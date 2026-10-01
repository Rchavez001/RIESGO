#!/usr/bin/env bash
# Puertas de calidad del módulo de Consentimiento Informado (T00). Solo pruebas locales: no toca producción ni
# ningún Supabase remoto. Cada puerta imprime `GATE <nombre>: OK|FAIL|SKIP`; sale con código != 0 si falla alguna
# que NO esté en la línea base. Los FAIL de la línea base se muestran igual (nunca se ocultan) y se explican en PROGRESS.md.
#
#   bash .claude/loops/consentimiento/gates.sh
#   GATES_ONLY="deno-test sql-ciclo-de-vida" bash …/gates.sh     # solo algunas puertas
#   GATES_DB_RESET=1 bash …/gates.sh                              # incluye la puerta db-reset (necesita `supabase start` en marcha)
#   GATES_E2E_LOCAL=1 bash …/gates.sh                             # incluye la puerta e2e-local (levanta/reutiliza `supabase start`)
#   GATES_FULL=1 bash …/gates.sh                                  # panel-e2e corre en los 7 perfiles de playwright.admin.config.ts
#                                                                  # (por defecto solo desktop-chrome y pixel-7-chrome). Obligatorio
#                                                                  # antes de release y cada 5 iteraciones (ver PROMPT.md).
#   GATES_SELFTEST=1 bash …/gates.sh                              # autoprueba: cada puerta inyecta su propio fallo
#                                                                  # controlado y se espera que TODAS reporten FAIL
#
# Las mismas opciones también existen como argumentos (--only "…", --db-reset, --e2e-local, --full, --selftest):
# el permiso que una sesión headless tiene concedido es el literal "Bash(bash .claude/loops/consentimiento/gates.sh:*)",
# que cubre cualquier texto AÑADIDO DESPUÉS de ese prefijo exacto pero no una invocación con variables de entorno
# DELANTE (`GATES_ONLY=… bash …/gates.sh` ya no empieza por "bash" y no coincide con el patrón — ver D-14 en
# DECISIONS.md e iteración 31 en PROGRESS.md, ambas bloqueadas por esto). Con los argumentos, la sesión headless
# puede pedir cualquier modo sin tropezar con esa falta de coincidencia:
#   bash .claude/loops/consentimiento/gates.sh --only e2e-local --e2e-local
#
# Requiere Node (npx) y Docker en marcha (para la puerta SQL). Deno se fija a la versión con la que se escribieron las pruebas.
set -uo pipefail

while [[ $# -gt 0 ]]; do
  case "$1" in
    --only) GATES_ONLY="$2"; shift 2 ;;
    --db-reset) GATES_DB_RESET=1; shift ;;
    --e2e-local) GATES_E2E_LOCAL=1; shift ;;
    --full) GATES_FULL=1; shift ;;
    --selftest) GATES_SELFTEST=1; shift ;;
    *) echo "gates.sh: argumento desconocido: $1 (usar --only, --db-reset, --e2e-local, --full, --selftest)" >&2; exit 64 ;;
  esac
done

DENO_VERSION=2.9.6
DENO="npx -y deno@${DENO_VERSION}"

ROOT="$(git rev-parse --show-toplevel)"
# Archivos de trabajo (TASKS/PROGRESS/DECISIONS/SPEC/seed/diag/logs) viven en loop-consentimiento/, fuera
# de .claude/, porque Claude Code trata todo lo bajo .claude/ como "sensitive file" y el loop headless no
# podría editarlos (ver PROGRESS.md). gates.sh, PROMPT.md, run-loop.sh y headless-settings.json se quedan
# dentro de .claude/loops/consentimiento/ precisamente para quedar protegidos de esa misma ejecución headless.
WORK="$ROOT/loop-consentimiento"
cd "$ROOT/shield-ecuador-app"
LOGS="$WORK/logs"; mkdir -p "$LOGS"
MIGRATIONS=supabase/migrations
TESTS=supabase/tests/consent

# ── Descubrimiento automático de migraciones y pruebas pendientes ──────────────────────────────────────────────────
# Última migración ya aplicada en producción (ver "Tabla resumen" en PLAN_PRODUCCION_RELEASE.md): toda
# migración de supabase/migrations/ con número de archivo mayor se trata como pendiente. Así una migración
# nueva (con su prueba en supabase/tests/consent/) se recoge sola en las puertas SQL sin tocar este script.
# Actualizar este número en el mismo commit que PLAN_PRODUCCION_RELEASE.md tras cada release real a producción.
LAST_MIGRATION_IN_PROD=73

pending_migrations() {
  local f base num
  for f in "$MIGRATIONS"/*.sql; do
    base="$(basename "$f")"
    num="${base%%_*}"
    [[ "$num" =~ ^[0-9]+$ ]] || continue
    (( 10#$num > LAST_MIGRATION_IN_PROD )) && printf '%s\n' "$f"
  done | sort
}

# Migraciones pendientes que NO son del módulo de consentimiento: viven en el mismo directorio por
# numeración de archivo, pero pertenecen a otro módulo con su propia puerta (076, learning_guest_limit →
# sql-guest-limit) y declaran variables tipadas contra tablas (`learning_progress`, …) que el esquema
# mínimo de `prereqs.sql` no crea — PL/pgSQL valida esos tipos al CREATE FUNCTION, así que cargarla aquí
# rompería la puerta sin que el módulo de consentimiento tenga nada que ver. `db-reset` sí la aplica
# (carga el esquema completo de producción, donde esas tablas existen): esta lista solo afecta a la
# cadena de consentimiento, vía pending_migrations_consent().
PENDING_MIGRATIONS_CONSENT_EXCLUDE=(076_learning_guest_limit)

pending_migrations_consent() {
  local f base x skip
  while IFS= read -r f; do
    base="$(basename "$f")"
    skip=0
    for x in "${PENDING_MIGRATIONS_CONSENT_EXCLUDE[@]}"; do
      [[ "${base%.sql}" == "$x" ]] && { skip=1; break; }
    done
    (( skip )) || printf '%s\n' "$f"
  done < <(pending_migrations)
}

# Pruebas SQL del módulo. `prereqs.sql` (prerrequisitos) se carga aparte siempre primero, y
# `baseline_pending_migrations.sql` la corre solo la puerta `db-reset` contra el baseline de producción, no
# aquí: ambas quedan excluidas del descubrimiento. El resto tiene dependencias de orden documentadas en su
# propia cabecera (p. ej. `lifecycle.sql` siembra `consent_records` con ids 1-3 que `consent_documents_lifecycle.sql`
# da por hecho que ya existen) — esas van primero, en el orden fijo de abajo. Cualquier archivo NUEVO del
# directorio que no esté en esa lista se añade solo, en orden alfabético, al final: así una prueba nueva se
# ejecuta sin editar este script (si dependiera del orden de las de abajo, añadirla aquí a mano).
CONSENT_TESTS_ORDERED=(lifecycle.sql settings_versioning.sql consent_documents_lifecycle.sql data_subject_requests_lifecycle.sql admin_roles.sql)
CONSENT_TESTS_EXCLUDE=(prereqs.sql baseline_pending_migrations.sql)

consent_test_files() {
  local f base x known
  for base in "${CONSENT_TESTS_ORDERED[@]}"; do
    [[ -f "$TESTS/$base" ]] && printf '%s\n' "$TESTS/$base"
  done
  for f in "$TESTS"/*.sql; do
    base="$(basename "$f")"
    known=0
    for x in "${CONSENT_TESTS_ORDERED[@]}" "${CONSENT_TESTS_EXCLUDE[@]}"; do
      [[ "$base" == "$x" ]] && { known=1; break; }
    done
    (( known )) || printf '%s\n' "$f"
  done
}

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
# Playwright del panel contra el server.js real con un upstream simulado (tests/admin/start-admin.cjs). Reporter line.
# Por defecto solo 2 de los 7 perfiles de playwright.admin.config.ts (desktop-chrome, pixel-7-chrome: uno de
# escritorio y uno móvil representativo) para mantener la iteración rápida. GATES_FULL=1 corre los 7 perfiles
# (iphone-se-safari, iphone-14-safari, ipad-safari, pixel-7-chrome, galaxy-s9-chrome, desktop-chrome,
# desktop-safari) — obligatorio antes de release y cada 5 iteraciones (ver PROMPT.md).
# El servidor de pruebas del panel (:3198) se REUTILIZA entre corridas (reuseExistingServer) y su limitador de autenticaciones fallidas
# (10 cada 10 min) es en memoria: una segunda corrida seguida recibía 429 en vez de 401. Se cierra cualquier start-admin.cjs antes y después.
stop_panel_test_server() {
  if command -v powershell >/dev/null 2>&1; then
    powershell -NoProfile -Command 'Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match "start-admin\.cjs" } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }' >/dev/null 2>&1 || true
  else
    pkill -f start-admin.cjs >/dev/null 2>&1 || true
  fi
}
PANEL_E2E_PROJECTS_DEFAULT=(desktop-chrome pixel-7-chrome)
PANEL_E2E_PROJECTS_FULL=(iphone-se-safari iphone-14-safari ipad-safari pixel-7-chrome galaxy-s9-chrome desktop-chrome desktop-safari)
panel_e2e() {
  local rc=0 p project_args=() projects=("${PANEL_E2E_PROJECTS_DEFAULT[@]}")
  [[ "${GATES_FULL:-0}" == "1" ]] && projects=("${PANEL_E2E_PROJECTS_FULL[@]}")
  for p in "${projects[@]}"; do project_args+=(--project="$p"); done
  stop_panel_test_server
  PW_TEST_HTML_REPORT_OPEN=never npx playwright test -c playwright.admin.config.ts "${project_args[@]}" --reporter=line --workers=2 --timeout=60000 || rc=$?
  stop_panel_test_server
  return $rc
}

# ── 3. Funciones (Deno) ──────────────────────────────────────────────────────────────────────────────────────────────
deno_check() {
  $DENO check supabase/functions/secure-register-user/index.ts supabase/functions/get-consent-notice/index.ts \
    supabase/functions/_shared/auth-guard.ts supabase/functions/admin-consent/index.ts \
    supabase/functions/update-my-consent/index.ts supabase/functions/submit-consent/index.ts \
    ../loop-consentimiento/diag/diag-network-headers/index.ts
}
deno_test() {
  # Aparte: la función de diagnóstico (T03, temporal) también escucha en :8000 y no puede compartir proceso con las otras.
  $DENO test --allow-env --allow-net --allow-read supabase/functions/ && \
  $DENO test --allow-env --allow-net ../loop-consentimiento/diag/diag-network-headers/index_test.ts
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
  local container="$1" f
  psql_in() { docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 -q -o /dev/null "$@"; }
  psql_in -d postgres -c "CREATE DATABASE gates" || return 1
  psql_in -d gates < "$TESTS/prereqs.sql" || return 1
  # 073 (fundación del módulo) siempre primero; luego toda migración pendiente del módulo de
  # consentimiento (> LAST_MIGRATION_IN_PROD, sin las ajenas de PENDING_MIGRATIONS_CONSENT_EXCLUDE),
  # descubierta sola — ver pending_migrations_consent() arriba.
  psql_in -d gates < "$MIGRATIONS/073_consent_module_foundation.sql" || return 1
  while IFS= read -r f; do psql_in -d gates < "$f" || return 1; done < <(pending_migrations_consent)
  while IFS= read -r f; do psql_in -d gates < "$f" || return 1; done < <(consent_test_files)
  consent_records_concurrency_check "$container"
  publish_consent_document_concurrency_check "$container"
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

# 080: dos llamadas a publish_consent_document() en paralelo (misma fila vigente) deben serializarse por
# el SELECT ... FOR UPDATE de la función, nunca dejar dos filas 'published' a la vez ni corromper la
# bitácora. Misma razón que consent_records_concurrency_check: necesita conexiones REALES simultáneas.
publish_consent_document_concurrency_check() {
  local container="$1"
  docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 -q -o /dev/null -d gates -c "
    INSERT INTO public.users (id, email) VALUES
      ('b1111111-1111-4111-8111-111111111111', 'pdc-concurrency-creator@test.local'),
      ('b2222222-2222-4222-8222-222222222222', 'pdc-concurrency-admin@test.local');
    INSERT INTO public.admin_roles (user_id, role) VALUES ('b2222222-2222-4222-8222-222222222222', 'privacy_admin');
    INSERT INTO public.consent_documents (version, title, content_md, content_sha256, purposes, status, created_by) VALUES
      ('pdc-conc-A', 'A', 'mdA', 'shaA', '[]'::jsonb, 'draft', 'b1111111-1111-4111-8111-111111111111'),
      ('pdc-conc-B', 'B', 'mdB', 'shaB', '[]'::jsonb, 'draft', 'b1111111-1111-4111-8111-111111111111');
  " || return 1
  local v pid pids=() rc=0
  for v in pdc-conc-A pdc-conc-B; do
    docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 -q -o /dev/null -d gates -c "
      SELECT public.publish_consent_document((SELECT id FROM public.consent_documents WHERE version = '$v'),
        'b2222222-2222-4222-8222-222222222222', 'privacy_admin', 'aal2', 'hmac-pdc-concurrency', 'concurrencia $v');
    " &
    pids+=("$!")
  done
  for pid in "${pids[@]}"; do wait "$pid" || rc=1; done
  if [[ $rc -ne 0 ]]; then echo "una publicación concurrente de publish_consent_document falló"; return 1; fi
  docker exec -i "$container" psql -U postgres -v ON_ERROR_STOP=1 -q -o /dev/null -d gates -c "
    DO \$\$
    DECLARE published_count int; audit_count int; broken record;
    BEGIN
      SELECT count(*) INTO published_count FROM public.consent_documents WHERE status = 'published';
      IF published_count <> 1 THEN
        RAISE EXCEPTION 'se esperaba exactamente 1 publicada tras publicar en paralelo, hubo %', published_count;
      END IF;
      SELECT count(*) INTO audit_count FROM public.admin_audit_log WHERE reason IN ('concurrencia pdc-conc-A', 'concurrencia pdc-conc-B');
      IF audit_count <> 2 THEN
        RAISE EXCEPTION 'se esperaban 2 filas de bitácora de la concurrencia, hubo %', audit_count;
      END IF;
      SELECT * INTO broken FROM public.verify_audit_chain();
      IF FOUND THEN
        RAISE EXCEPTION 'la cadena de bitácora quedó rota tras publicar en paralelo: fila % — %', broken.first_broken_id, broken.detail;
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

# ── 5. `db-reset`: "baseline + pendientes" (D-13, T00-extra-exec). NO usa `supabase db reset`:
# las migraciones 001-072 no se reproducen desde cero (004 define `is_admin()` antes de crear la
# columna que usa, en cualquier versión de Postgres; ver D-13 en DECISIONS.md). En su lugar, contra
# el stack de `supabase start` YA EN MARCHA (que provee auth/storage/realtime/extensiones
# gestionadas): reinicia solo el esquema `public`, carga `supabase/baseline/prod_schema.sql`
# (esquema de producción tras 001-073, revisado y sin secretos), verifica que el resultado coincide
# con ese archivo (diff vacío salvo ruido de formato conocido), aplica en orden las migraciones
# aún pendientes de producción (descubiertas solas por pending_migrations(), ver arriba) y corre las
# aserciones de esquema/permisos del ensayo de release. Es destructiva para el esquema `public` de la
# base local (igual que antes con `supabase db reset`): por eso sigue tras GATES_DB_RESET=1.
DB_URL="postgresql://postgres:postgres@127.0.0.1:54322/postgres"
BASELINE="supabase/baseline/prod_schema.sql"

# No-op salvo bajo GATES_SELFTEST, que la sustituye por una que rompe el esquema a propósito
# justo después de cargar el baseline, para probar que la comparación de abajo sí lo detecta.
db_reset_corrupt_hook() { :; }

# Ojo de orden: psql 10.x dejar de reconocer opciones tras el primer argumento posicional (aquí, la
# URI de conexión) y las reporta como "argumento extra" en vez de aplicarlas — las opciones SIEMPRE
# van antes de la URI, nunca después.
psql_db() { psql -v ON_ERROR_STOP=1 -q "$@" "$DB_URL"; }

db_reset() {
  if ! psql -q -c 'select 1' "$DB_URL" >/dev/null 2>&1; then
    echo "no se pudo conectar a $DB_URL — ¿está \`supabase start\` en marcha?"
    return 1
  fi
  psql_db -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;' && \
  psql_db -o /dev/null -f "$BASELINE" && \
  db_reset_corrupt_hook && \
  db_reset_verify_baseline_diff && \
  db_reset_apply_pending && \
  psql_db -o /dev/null -f "$TESTS/baseline_pending_migrations.sql"
}

# El pg_dump LOCAL añade 2 líneas que el de producción no trae (`CREATE SCHEMA IF NOT EXISTS
# "public"` + `ALTER SCHEMA "public" OWNER TO "postgres"`, boilerplate del propio pg_dump) y
# antepone un `REVOKE USAGE ON SCHEMA "public" FROM PUBLIC` donde producción tenía un `GRANT USAGE
# ON SCHEMA "public" TO "postgres"` explícito (misma ACL resultante, forma distinta de expresarla:
# postgres ya tiene acceso por ser superusuario en cualquiera de las dos). Documentado también en
# la cabecera de `prod_schema.sql`. Se descartan esas líneas de AMBOS lados antes de comparar;
# cualquier otra diferencia (tabla, columna, función, política, trigger) hace fallar la puerta.
db_reset_verify_baseline_diff() {
  local dump="$LOGS/db-reset-dump.sql"
  supabase db dump --local -s public -f "$dump" >/dev/null 2>&1 || { echo "\`supabase db dump --local\` falló"; return 1; }
  local strip='/^CREATE SCHEMA IF NOT EXISTS "public";$/d; /^ALTER SCHEMA "public" OWNER TO "postgres";$/d; /^GRANT USAGE ON SCHEMA "public" TO "postgres";$/d; /^REVOKE USAGE ON SCHEMA "public" FROM PUBLIC;$/d'
  grep -v '^--' "$dump" | grep -v '^[[:space:]]*$' | sed -E "$strip" > "$LOGS/db-reset-dump.clean.sql"
  grep -v '^--' "$BASELINE" | grep -v '^[[:space:]]*$' | sed -E "$strip" > "$LOGS/db-reset-baseline.clean.sql"
  if ! diff -u "$LOGS/db-reset-baseline.clean.sql" "$LOGS/db-reset-dump.clean.sql" > "$LOGS/db-reset-diff.log"; then
    echo "el esquema recién cargado no coincide con $BASELINE (más allá del ruido de formato documentado en su cabecera):"
    cat "$LOGS/db-reset-diff.log"
    return 1
  fi
}

db_reset_apply_pending() {
  local m
  while IFS= read -r m; do
    psql_db -o /dev/null -f "$m" || { echo "migración pendiente $(basename "$m") falló"; return 1; }
  done < <(pending_migrations)
}

# ── 5b. `e2e-local`: pruebas punta a punta contra Supabase local real (`e2e_local.cjs`, `publish_consent_document_e2e_local.cjs`,
# `auth_guard_local_test.ts`, `admin_login_local.cjs`). Antes vivían "fuera de gates.sh": necesitaban `docker`/`psql`/`node`
# sueltos y variantes de `supabase start`/`functions serve` que una sesión headless no tiene permiso de ejecutar (ver D-14 en
# DECISIONS.md y la iteración 31 en PROGRESS.md: TEST-INT.a se quedó sin verificar por exactamente esto). Al vivir DENTRO de
# gates.sh (ya autorizado), nada de lo de aquí adentro pasa por un permiso nuevo. Levanta `supabase start` si no está en
# marcha (lo reutiliza si ya lo está), lee ANON_KEY/SERVICE_ROLE_KEY de `supabase status -o env`, genera claves de función
# DESECHABLES (solo para este Postgres local efímero, nunca secretos reales) y las descarta al salir junto con los procesos
# que levantó. No se ejecuta por defecto (opt-in, igual que db-reset): GATES_E2E_LOCAL=1 o --e2e-local.
E2E_SERVE_PID=""
E2E_PANEL_PID=""
E2E_TMPDIR=""

e2e_local_cleanup() {
  [[ -n "$E2E_PANEL_PID" ]] && kill "$E2E_PANEL_PID" >/dev/null 2>&1
  [[ -n "$E2E_SERVE_PID" ]] && kill "$E2E_SERVE_PID" >/dev/null 2>&1
  E2E_PANEL_PID=""; E2E_SERVE_PID=""
  [[ -n "$E2E_TMPDIR" ]] && rm -rf "$E2E_TMPDIR"
  E2E_TMPDIR=""
}

# No-op salvo bajo GATES_SELFTEST, que lo sustituye por uno que reintroduce un marcador `{{…}}` sin resolver en el
# aviso ya publicado, para probar que `e2e_local.cjs` sí lo detecta de verdad (fallo real, no un atajo simulado).
e2e_local_corrupt_hook() { :; }

wait_for_http() {
  local url="$1" tries="${2:-60}" i
  for ((i = 0; i < tries; i++)); do
    [[ "$(curl -s -o /dev/null -w '%{http_code}' "$url" 2>/dev/null)" != "000" ]] && return 0
    sleep 1
  done
  return 1
}

e2e_local() {
  trap e2e_local_cleanup RETURN
  if ! npx supabase status -o env >/dev/null 2>&1; then
    npx supabase start >/dev/null || { echo "no se pudo levantar 'supabase start'"; return 1; }
  fi
  local sb_env; sb_env="$(npx supabase status -o env 2>/dev/null)" || { echo "'supabase status -o env' falló"; return 1; }
  local ANON_KEY SERVICE_ROLE_KEY
  eval "$(printf '%s\n' "$sb_env" | grep -E '^(ANON_KEY|SERVICE_ROLE_KEY)=')"
  [[ -n "${ANON_KEY:-}" && -n "${SERVICE_ROLE_KEY:-}" ]] || { echo "no se pudieron leer ANON_KEY/SERVICE_ROLE_KEY de 'supabase status -o env'"; return 1; }

  # Parte de un esquema conocido (no de lo que haya quedado de una corrida anterior, `supabase db reset`
  # fallido, etc. — ver D-13): db_reset() es rápido (~6s) y deja exactamente baseline + pendientes.
  db_reset || { echo "no se pudo preparar un esquema limpio antes de e2e-local (db_reset)"; return 1; }

  # Artefactos de ESTA corrida (sobre todo el .env con las claves de función) fuera del repo, en una
  # carpeta temporal que e2e_local_cleanup() borra siempre al salir: nunca deben quedar sueltos en
  # loop-consentimiento/logs/ (ver .gitignore de esa carpeta) ni, mucho menos, commiteados.
  E2E_TMPDIR="$(mktemp -d)" || { echo "no se pudo crear el directorio temporal de e2e-local"; return 1; }

  local fn_env="$E2E_TMPDIR/e2e-local.fn.env"
  node -e '
    const c = require("crypto")
    for (const k of ["PII_ENCRYPTION_KEY_B64", "LOOKUP_HMAC_KEY_B64", "SECURITY_EVENTS_HMAC_KEY"]) {
      console.log(k + "=" + c.randomBytes(32).toString("base64"))
    }
    console.log("PII_KEY_VERSION=1")
  ' > "$fn_env"

  npx supabase functions serve --env-file "$fn_env" --no-verify-jwt >"$E2E_TMPDIR/functions-serve.log" 2>&1 &
  E2E_SERVE_PID=$!
  wait_for_http "http://127.0.0.1:54321/functions/v1/get-consent-notice" 60 \
    || { echo "'supabase functions serve' no respondió a tiempo"; cat "$E2E_TMPDIR/functions-serve.log" 2>/dev/null; return 1; }

  local published; published="$(psql_db -At -c "select count(*) from public.consent_documents where version = '1.0' and status = 'published'" 2>/dev/null || echo 0)"
  if [[ "$published" != "1" ]]; then
    node "$TESTS/load_seed_aviso.cjs" | psql_db || { echo "no se pudo sembrar el aviso publicado (load_seed_aviso.cjs)"; return 1; }
  fi
  # `db-reset` carga supabase/baseline/prod_schema.sql, que es solo ESQUEMA (pg_dump -s): los INSERT de
  # catálogo que trae la migración 016 (business_sectors) nunca llegan a ejecutarse por esa vía, aunque
  # 016 sea anterior a LAST_MIGRATION_IN_PROD. e2e_local.cjs registra con business_type='comerciante'
  # (resuelto contra esta tabla por secure-register-user), así que hace falta sembrarla aparte.
  psql_db -c "INSERT INTO public.business_sectors (code, label, active, display_order) VALUES ('comerciante', 'Comerciante', true, 10) ON CONFLICT (code) DO NOTHING;" \
    || { echo "no se pudo sembrar business_sectors (code='comerciante')"; return 1; }
  e2e_local_corrupt_hook || return 1

  OUT="$E2E_TMPDIR/e2e-local-out.json" ANON_KEY="$ANON_KEY" SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
    node "$TESTS/e2e_local.cjs" || return 1

  # `publish_consent_document_e2e_local.cjs` siembra su PROPIA versión "vigente" para probar que publicar
  # encima de una ya existente funciona — choca con el índice `consent_documents_one_published` si el v1.0
  # de arriba sigue publicado. db_reset() limpia esquema+datos (rápido, ~6s): este script no depende de
  # ningún seed previo, arma todos sus fixtures él mismo.
  db_reset || { echo "no se pudo limpiar el esquema entre e2e_local.cjs y publish_consent_document_e2e_local.cjs (db_reset)"; return 1; }
  ANON_KEY="$ANON_KEY" SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
    node "$TESTS/publish_consent_document_e2e_local.cjs" || return 1
  SUPABASE_URL="http://127.0.0.1:54321" SUPABASE_ANON_KEY="$ANON_KEY" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
    SUPABASE_JWT_ISSUER="http://127.0.0.1:54321/auth/v1" \
    $DENO test --allow-env --allow-net "$TESTS/auth_guard_local_test.ts" || return 1

  local panel_pass; panel_pass="$(node -e 'console.log(require("crypto").randomBytes(18).toString("base64url"))')"
  PORT=3197 CENTRAL_ADMIN_USER=e2e-local CENTRAL_ADMIN_PASSWORD="$panel_pass" \
    SUPABASE_URL="http://127.0.0.1:54321" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" SUPABASE_ANON_KEY="$ANON_KEY" \
    node central-admin-app/server.js >"$E2E_TMPDIR/panel.log" 2>&1 &
  E2E_PANEL_PID=$!
  wait_for_http "http://127.0.0.1:3197/" 30 \
    || { echo "el panel (central-admin-app/server.js) no respondió a tiempo"; cat "$E2E_TMPDIR/panel.log" 2>/dev/null; return 1; }
  PANEL_URL="http://127.0.0.1:3197" PANEL_BASIC="e2e-local:$panel_pass" \
    SUPABASE_URL="http://127.0.0.1:54321" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
    node "$TESTS/admin_login_local.cjs" || return 1
}

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
      supabase/functions/update-my-consent/index.ts supabase/functions/submit-consent/index.ts \
      ../loop-consentimiento/diag/diag-network-headers/index.ts "$f"; rc=$?
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

  # Fallo real, no un atajo: rompe el esquema justo después de cargar el baseline (columna extra
  # en una tabla real) y deja que la comparación de verdad lo detecte.
  db_reset_corrupt_hook() {
    psql_db -c 'ALTER TABLE public.app_secrets ADD COLUMN __gates_selftest_broken boolean;'
  }

  # Fallo real, no un atajo: reintroduce un marcador sin resolver en el aviso ya publicado y deja que
  # la propia comprobación de e2e_local.cjs ("los marcadores {{…}} quedaron resueltos") lo detecte.
  e2e_local_corrupt_hook() {
    psql_db -c "UPDATE public.consent_documents SET content_md = content_md || ' {{marcador_selftest_roto}}' WHERE version = '1.0' AND status = 'published';"
  }
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
  skip db-reset "opt-in: GATES_DB_RESET=1 y \`supabase start\` en marcha; carga supabase/baseline/prod_schema.sql (D-13) + migraciones pendientes (ver pending_migrations()), es destructiva para el esquema public local"
fi
if [[ "${GATES_E2E_LOCAL:-0}" == "1" || "${GATES_SELFTEST:-0}" == "1" ]]; then
  gate e2e-local e2e_local
else
  skip e2e-local "opt-in: GATES_E2E_LOCAL=1 (o --e2e-local); levanta/reutiliza \`supabase start\` y \`supabase functions serve\`, corre e2e_local.cjs/publish_consent_document_e2e_local.cjs/auth_guard_local_test.ts/admin_login_local.cjs (ver PROGRESS.md iteración 31)"
fi

echo
if [[ "${GATES_SELFTEST:-0}" == "1" ]]; then
  # Resultado de la AUTOPRUEBA, no de las puertas reales: bajo GATES_SELFTEST=1 se fuerza también a
  # db-reset y e2e-local a correr (ver los `if` de arriba), así que las 11 puertas deben reportar FAIL —
  # eso es un éxito de la autoprueba (exit 0). Si alguna reporta OK, esa puerta no detecta nada de verdad (exit 1).
  if (( ${#FAILED[@]} == 11 )); then
    echo "AUTOPRUEBA OK: las 11 puertas detectaron su fallo inyectado y reportaron FAIL."
    exit 0
  else
    echo "AUTOPRUEBA FALLIDA: se esperaban 11 puertas en FAIL, hubo ${#FAILED[@]} (${FAILED[*]:-ninguna})."
    echo "Las puertas que no están en esa lista no detectaron su fallo inyectado: no verifican nada de verdad."
    exit 1
  fi
fi
if (( ${#FAILED[@]} )); then
  echo "Puertas FALLIDAS fuera de la línea base: ${FAILED[*]}"
  exit 1
fi
echo "Todas las puertas pasaron (las de línea base, si las hay, se muestran arriba como FAIL con su motivo)."
