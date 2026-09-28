#!/usr/bin/env bash
# Puertas de calidad del módulo de Consentimiento Informado. Solo pruebas locales: no toca producción
# ni ningún Supabase remoto. Sale con código != 0 en cuanto una puerta falla.
#
#   bash .claude/loops/consentimiento/gates.sh
#
# Requiere Node (npx) y Docker en marcha. Deno se fija a la versión con la que se escribieron las pruebas.
set -euo pipefail

DENO_VERSION=2.9.6
DENO="npx -y deno@${DENO_VERSION}"

cd "$(git rev-parse --show-toplevel)/shield-ecuador-app"
MIGRATIONS=supabase/migrations
TESTS=supabase/tests/consent

step() { printf '\n== %s\n' "$1"; }

step "1/3 Deno ${DENO_VERSION}: tipos de las funciones del módulo"
$DENO check supabase/functions/secure-register-user/index.ts supabase/functions/get-consent-notice/index.ts ../.claude/loops/consentimiento/diag/diag-network-headers/index.ts

step "2/3 Deno ${DENO_VERSION}: cripto+AAD, cuota fail-closed, evidencia y registro de punta a punta (contra un Supabase falso)"
$DENO test --allow-env --allow-net supabase/functions/
# Aparte: la función de diagnóstico (T03, temporal) también escucha en :8000 y no puede compartir proceso con las otras.
$DENO test --allow-env --allow-net ../.claude/loops/consentimiento/diag/diag-network-headers/index_test.ts

step "3/3 SQL: migraciones 073+074+075, ciclo de vida de la evidencia y versionado de privacy_settings, en un Postgres 16 desechable"
CONTAINER="consent-gates-$$"
docker run -d --rm --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres postgres:16 >/dev/null
trap 'docker rm -f "$CONTAINER" >/dev/null 2>&1 || true' EXIT

# La imagen arranca un servidor temporal para inicializar y luego lo reinicia: hay que esperar el segundo "ready".
for _ in $(seq 1 90); do
  [ "$(docker logs "$CONTAINER" 2>&1 | grep -c 'ready to accept connections')" -ge 2 ] && break
  sleep 1
done

psql_in() { docker exec -i "$CONTAINER" psql -U postgres -v ON_ERROR_STOP=1 -q -o /dev/null "$@"; }
psql_in -d postgres -c "CREATE DATABASE gates"
psql_in -d gates < "$TESTS/prereqs.sql"
psql_in -d gates < "$MIGRATIONS/073_consent_module_foundation.sql"
psql_in -d gates < "$MIGRATIONS/074_consent_evidence_unlink_and_stable_hash.sql"
psql_in -d gates < "$MIGRATIONS/075_privacy_settings_versioning.sql"
psql_in -d gates < "$TESTS/lifecycle.sql"
psql_in -d gates < "$TESTS/settings_versioning.sql"

printf '\nTodas las puertas pasaron.\n'
