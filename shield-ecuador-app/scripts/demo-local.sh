#!/usr/bin/env bash
# Entorno de demostración LOCAL del módulo de Consentimiento Informado (LOPDP), para revisar sus
# pantallas en el navegador. Nunca toca producción ni ningún Supabase remoto: se niega a correr si
# detecta cualquier URL que no sea 127.0.0.1/localhost, y solo crea identidades @example.test.
#
#   bash scripts/demo-local.sh start   # (o sin argumento) levanta/reutiliza todo, imprime URLs y credenciales
#   bash scripts/demo-local.sh stop    # apaga el panel, el frontend y "functions serve" (deja supabase start)
#
# Ver loop-consentimiento/DEMO.md para el recorrido guiado paso a paso.
set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$APP_DIR"

RUNDIR="${TMPDIR:-/tmp}/cyberdojo-demo-local"
mkdir -p "$RUNDIR"
PIDFILE="$RUNDIR/pids"
FN_ENV="$RUNDIR/functions-serve.env"

ACTION="${1:-start}"

# ── Guardas de seguridad (irrenunciables) ───────────────────────────────────────────────────────
# Cualquier URL que este script vaya a usar debe ser local. No se "sanea" nada: si algo no es
# local, el script se detiene en el acto, sin intentar arreglarlo ni continuar a medias.
require_local_http() {
  local label="$1" url="$2"
  if [[ ! "$url" =~ ^https?://(127\.0\.0\.1|localhost)(:[0-9]+)?(/.*)?$ ]]; then
    echo "ABORTA: $label no es una URL local ('$url'). Este script solo opera contra 127.0.0.1/localhost." >&2
    exit 1
  fi
}
require_local_db_url() {
  local label="$1" url="$2"
  if [[ ! "$url" =~ @(127\.0\.0\.1|localhost)(:[0-9]+)?/ ]]; then
    echo "ABORTA: $label no es una base de datos local ('$url')." >&2
    exit 1
  fi
}
require_example_test_email() {
  local label="$1" email="$2"
  if [[ ! "$email" =~ @example\.test$ ]]; then
    echo "ABORTA: $label ('$email') no termina en @example.test." >&2
    exit 1
  fi
}

# Variables de entorno heredadas que podrían redirigir el CLI/las apps a un proyecto real: si
# alguna existe y no es local, se aborta antes de tocar nada.
for var in SUPABASE_URL REACT_APP_SUPABASE_URL NEXT_PUBLIC_SUPABASE_URL; do
  val="${!var:-}"
  [[ -n "$val" ]] && require_local_http "\$$var (heredada de tu shell)" "$val"
done

ADMIN_EMAIL="demo-admin@example.test"
DEMO_USER_EMAIL="demo-usuario@example.test"
require_example_test_email "admin de prueba" "$ADMIN_EMAIL"
require_example_test_email "usuario de prueba" "$DEMO_USER_EMAIL"

stop_tracked() {
  [[ -f "$PIDFILE" ]] || { echo "No hay nada registrado en $PIDFILE (¿ya estaba apagado?)."; return 0; }
  while IFS='=' read -r name pid; do
    [[ -z "${pid:-}" ]] && continue
    if kill -0 "$pid" >/dev/null 2>&1; then
      echo "Deteniendo $name (pid $pid)…"
      kill "$pid" >/dev/null 2>&1 || true
    fi
  done < "$PIDFILE"
  rm -f "$PIDFILE"
  echo "Listo. 'supabase start' (Postgres/Auth/Storage local) se queda arriba — si también quieres apagarlo: supabase stop"
}

if [[ "$ACTION" == "stop" ]]; then
  stop_tracked
  exit 0
elif [[ "$ACTION" != "start" ]]; then
  echo "Uso: $(basename "$0") [start|stop]" >&2
  exit 64
fi

# Si una corrida anterior quedó viva, se apaga antes de levantar una nueva (idempotente).
[[ -f "$PIDFILE" ]] && stop_tracked

# ── Herramientas requeridas ──────────────────────────────────────────────────────────────────────
command -v supabase >/dev/null 2>&1 || { echo "ABORTA: no se encontró 'supabase' (Supabase CLI) en el PATH." >&2; exit 1; }
command -v node >/dev/null 2>&1 || { echo "ABORTA: no se encontró 'node' en el PATH." >&2; exit 1; }
command -v curl >/dev/null 2>&1 || { echo "ABORTA: no se encontró 'curl' en el PATH." >&2; exit 1; }

PSQL="$(command -v psql || true)"
if [[ -z "$PSQL" ]]; then
  for candidate in "/c/Program Files/PostgreSQL"/*/bin/psql.exe; do
    [[ -x "$candidate" ]] && PSQL="$candidate" && break
  done
fi
if [[ -z "$PSQL" ]]; then
  echo "ABORTA: no se encontró 'psql' (cliente de PostgreSQL) en el PATH." >&2
  echo "Instala las herramientas de cliente de PostgreSQL y agrega su carpeta 'bin' al PATH, p. ej.:" >&2
  echo "  \$env:PATH = 'C:\\Program Files\\PostgreSQL\\18\\bin;' + \$env:PATH   (PowerShell)" >&2
  exit 1
fi
psql_db() { "$PSQL" -v ON_ERROR_STOP=1 -q "$@" "$DB_URL"; }

echo "== Entorno de demostración local — Consentimiento Informado =="

# ── 1) supabase start: levanta o reutiliza ──────────────────────────────────────────────────────
if ! supabase status -o env >/dev/null 2>&1; then
  echo "-- Levantando 'supabase start' (primera vez puede tardar varios minutos)…"
  supabase start || { echo "ABORTA: 'supabase start' falló." >&2; exit 1; }
else
  echo "-- Reutilizando 'supabase start' ya en marcha."
fi

SB_ENV="$(supabase status -o env 2>/dev/null)" || { echo "ABORTA: 'supabase status -o env' falló." >&2; exit 1; }
eval "$(printf '%s\n' "$SB_ENV" | grep -E '^(ANON_KEY|SERVICE_ROLE_KEY|API_URL|DB_URL)=')"
[[ -n "${ANON_KEY:-}" && -n "${SERVICE_ROLE_KEY:-}" && -n "${API_URL:-}" && -n "${DB_URL:-}" ]] \
  || { echo "ABORTA: no se pudieron leer ANON_KEY/SERVICE_ROLE_KEY/API_URL/DB_URL de 'supabase status -o env'." >&2; exit 1; }
require_local_http "API_URL de supabase local" "$API_URL"
require_local_db_url "DB_URL de supabase local" "$DB_URL"

# ── 2) Esquema: baseline (D-13, prod 001-073) + migraciones pendientes (074+, ver
#    loop-consentimiento/PLAN_PRODUCCION_RELEASE.md) — mismo criterio que `db_reset()` en
#    .claude/loops/consentimiento/gates.sh. Destructivo para el esquema public LOCAL a propósito:
#    cada corrida de este script arranca de un estado limpio y conocido.
BASELINE="supabase/baseline/prod_schema.sql"
MIGRATIONS="supabase/migrations"
LAST_MIGRATION_IN_PROD=73  # actualizar junto con PLAN_PRODUCCION_RELEASE.md tras cada release real

pending_migrations() {
  local f base num
  for f in "$MIGRATIONS"/*.sql; do
    base="$(basename "$f")"
    num="${base%%_*}"
    [[ "$num" =~ ^[0-9]+$ ]] || continue
    (( 10#$num > LAST_MIGRATION_IN_PROD )) && printf '%s\n' "$f"
  done | sort
}

echo "-- Reiniciando el esquema local (baseline + migraciones pendientes)…"
psql_db -c 'DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;' \
  || { echo "ABORTA: no se pudo reiniciar el esquema public (¿está 'supabase start' realmente arriba?)." >&2; exit 1; }
psql_db -o /dev/null -f "$BASELINE" || { echo "ABORTA: no se pudo cargar $BASELINE." >&2; exit 1; }
while IFS= read -r m; do
  psql_db -o /dev/null -f "$m" || { echo "ABORTA: la migración pendiente $(basename "$m") falló." >&2; exit 1; }
done < <(pending_migrations)

# El reinicio de arriba solo afecta el esquema `public`: las cuentas de Supabase Auth viven en el
# esquema `auth`, que NO se toca. Sin esto, correr el script una segunda vez fallaría al crear de
# nuevo el admin/usuario de prueba ("ya existe una cuenta con ese correo") aunque `public.users` ya
# esté vacío. Solo borra estos dos correos fijos del propio fixture de la demo — nada más.
psql_db -c "DELETE FROM auth.users WHERE email IN ('$ADMIN_EMAIL', '$DEMO_USER_EMAIL');" \
  || { echo "ABORTA: no se pudieron limpiar las identidades de una corrida anterior en auth.users." >&2; exit 1; }

# ── 3) Semillas de desarrollo: aviso v1.0 publicado + configuración del responsable/delegado
#    (supabase/tests/consent/load_seed_aviso.cjs, datos @example.test) y el catálogo de sectores
#    económicos (mismas filas que la migración 016, que el baseline solo trae como esquema).
echo "-- Sembrando aviso de privacidad v1.0 publicado…"
node supabase/tests/consent/load_seed_aviso.cjs | psql_db \
  || { echo "ABORTA: no se pudo sembrar el aviso publicado (load_seed_aviso.cjs)." >&2; exit 1; }

echo "-- Sembrando catálogo de sectores económicos…"
psql_db -c "
INSERT INTO public.business_sectors (code, label, active, display_order) VALUES
  ('comerciante', 'Comerciante', TRUE, 10),
  ('restaurante', 'Restaurante / Comida', TRUE, 20),
  ('ferreteria', 'Ferreteria', TRUE, 30),
  ('farmacia', 'Farmacia', TRUE, 40),
  ('agricultor', 'Agricultor', TRUE, 50),
  ('pescador', 'Pescador', TRUE, 60),
  ('otro', 'Otro', TRUE, 900)
ON CONFLICT (code) DO UPDATE SET label = EXCLUDED.label, active = EXCLUDED.active, display_order = EXCLUDED.display_order;
" || { echo "ABORTA: no se pudo sembrar business_sectors." >&2; exit 1; }

# ── 4) supabase functions serve: claves DESECHABLES, solo para este Postgres local efímero,
#    nunca secretos reales (mismo patrón que e2e_local() en gates.sh).
node -e '
  const c = require("crypto")
  for (const k of ["PII_ENCRYPTION_KEY_B64", "LOOKUP_HMAC_KEY_B64", "SECURITY_EVENTS_HMAC_KEY"]) {
    console.log(k + "=" + c.randomBytes(32).toString("base64"))
  }
  console.log("PII_KEY_VERSION=1")
' > "$FN_ENV" || { echo "ABORTA: no se pudieron generar las claves desechables de 'functions serve'." >&2; exit 1; }

echo "-- Levantando 'supabase functions serve'…"
nohup supabase functions serve --env-file "$FN_ENV" --no-verify-jwt >"$RUNDIR/functions-serve.log" 2>&1 &
FUNCTIONS_PID=$!
disown "$FUNCTIONS_PID" 2>/dev/null || true
echo "functions_serve=$FUNCTIONS_PID" >> "$PIDFILE"

wait_for_functions_ready() {
  local tries=90 i code
  for ((i = 0; i < tries; i++)); do
    code="$(curl -s -o /dev/null -w '%{http_code}' "$API_URL/functions/v1/get-consent-notice" 2>/dev/null)"
    [[ "$code" == "200" ]] && return 0
    sleep 1
  done
  return 1
}
if ! wait_for_functions_ready; then
  echo "ABORTA: 'supabase functions serve' no respondió a tiempo. Revisa $RUNDIR/functions-serve.log" >&2
  stop_tracked
  exit 1
fi

# ── 5) Admin de prueba: cuenta Supabase Auth + fila en public.users + rol privacy_admin + un
#    factor TOTP ya VERIFICADO (RFC 6238 real, mismo algoritmo que supabase/tests/consent/admin_login_local.cjs).
#    El panel central-admin-app detecta el factor ya verificado y, al loguearse el humano, pide
#    directamente el código de 6 dígitos (sin volver a mostrar un QR con un secreto distinto).
echo "-- Creando admin de prueba ($ADMIN_EMAIL) con rol privacy_admin y TOTP…"
ADMIN_PASSWORD="Demo-$(node -e 'console.log(require("crypto").randomUUID())')"

ADMIN_OUT="$(API_URL="$API_URL" ANON_KEY="$ANON_KEY" SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" \
  ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD" node <<'NODE_EOF'
const crypto = require('crypto')
const API_URL = process.env.API_URL
const ANON_KEY = process.env.ANON_KEY
const SERVICE_ROLE_KEY = process.env.SERVICE_ROLE_KEY
const ADMIN_EMAIL = process.env.ADMIN_EMAIL
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD

function totp(base32, t = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const ch of base32.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(ch).toString(2).padStart(5, '0')
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(t / 1000 / 30)))
  const h = crypto.createHmac('sha1', key).update(counter).digest()
  const o = h[h.length - 1] & 0xf
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}

async function svc(path, body, method = 'POST') {
  const res = await fetch(`${API_URL}${path}`, {
    method,
    headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json = null; try { json = JSON.parse(text) } catch { /* sin cuerpo JSON */ }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`)
  return json
}

async function withAnon(path, { token, body, method = 'POST' } = {}) {
  const headers = { apikey: ANON_KEY, Authorization: `Bearer ${token || ANON_KEY}`, 'Content-Type': 'application/json' }
  const res = await fetch(`${API_URL}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  let json = null; try { json = JSON.parse(text) } catch { /* sin cuerpo JSON */ }
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text}`)
  return json
}

;(async () => {
  const user = await svc('/auth/v1/admin/users', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD, email_confirm: true })
  await svc('/rest/v1/users', { id: user.id, email: ADMIN_EMAIL })
  await svc('/rest/v1/admin_roles', { user_id: user.id, role: 'privacy_admin' })

  const pw = await withAnon('/auth/v1/token?grant_type=password', { body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD } })
  const aal1 = pw.access_token

  const enroll = await withAnon('/auth/v1/factors', { token: aal1, body: { factor_type: 'totp', friendly_name: `demo-local ${new Date().toISOString()}` } })
  const secret = enroll.totp.secret
  const factorId = enroll.id

  // No verificar justo en el cambio de ventana de 30s del código TOTP.
  if (Date.now() / 1000 % 30 > 26) await new Promise((r) => setTimeout(r, 5000))

  const challenge = await withAnon(`/auth/v1/factors/${factorId}/challenge`, { token: aal1, body: {} })
  await withAnon(`/auth/v1/factors/${factorId}/verify`, { token: aal1, body: { challenge_id: challenge.id, code: totp(secret) } })

  console.log(`ADMIN_USER_ID="${user.id}"`)
  console.log(`ADMIN_TOTP_SECRET="${secret}"`)
})().catch((e) => { console.error(e.message); process.exit(1) })
NODE_EOF
)" || { echo "ABORTA: no se pudo crear el admin de prueba o activar su TOTP." >&2; stop_tracked; exit 1; }
eval "$ADMIN_OUT"

# ── 6) Usuario normal de prueba, YA registrado con su consentimiento real (vía secure-register-user,
#    la misma función que usa el registro del frontend — mismo patrón que supabase/tests/consent/e2e_local.cjs).
echo "-- Registrando usuario de prueba ($DEMO_USER_EMAIL) con su consentimiento…"
DEMO_USER_PASSWORD="Demo-$(node -e 'console.log(require("crypto").randomUUID())')"

USER_OUT="$(API_URL="$API_URL" ANON_KEY="$ANON_KEY" DEMO_USER_EMAIL="$DEMO_USER_EMAIL" DEMO_USER_PASSWORD="$DEMO_USER_PASSWORD" node <<'NODE_EOF'
const API_URL = process.env.API_URL
const ANON_KEY = process.env.ANON_KEY
const EMAIL = process.env.DEMO_USER_EMAIL
const PASSWORD = process.env.DEMO_USER_PASSWORD

async function fn(name, { body, method = 'POST' } = {}) {
  const res = await fetch(`${API_URL}/functions/v1/${name}`, {
    method, headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const text = await res.text()
  let json = null; try { json = JSON.parse(text) } catch { /* sin cuerpo JSON */ }
  if (!res.ok) throw new Error(`${name} -> ${res.status} ${text}`)
  return json
}

;(async () => {
  const notice = await fn('get-consent-notice', { method: 'GET' })
  const reg = await fn('secure-register-user', {
    body: {
      email: EMAIL, password: PASSWORD, full_name: 'Usuario Demo', business_type: 'comerciante', age_gate: true,
      consent_notice: {
        document_id: notice.document_id, rendered_sha256: notice.rendered_sha256, settings_version: notice.settings_version,
        decisions: notice.purposes.map((p) => ({ purpose_code: p.code, decision: p.code === 'publicidad_personalizada' ? 'denied' : 'granted' })),
      },
    },
  })
  console.log(`DEMO_USER_ID="${reg.user_id}"`)
})().catch((e) => { console.error(e.message); process.exit(1) })
NODE_EOF
)" || { echo "ABORTA: no se pudo registrar el usuario de prueba." >&2; stop_tracked; exit 1; }
eval "$USER_OUT"

wait_for_http() {
  local url="$1" tries="${2:-120}" i
  for ((i = 0; i < tries; i++)); do
    [[ "$(curl -s -o /dev/null -w '%{http_code}' "$url" 2>/dev/null)" != "000" ]] && return 0
    sleep 1
  done
  return 1
}

# ── 7) Panel (central-admin-app), solo contra localhost ─────────────────────────────────────────
PANEL_URL="http://127.0.0.1:3100"
PANEL_USER="demo-admin"
PANEL_PASSWORD="Panel-$(node -e 'console.log(require("crypto").randomUUID())')"
require_local_http "URL del panel" "$PANEL_URL"

echo "-- Levantando el panel (central-admin-app) en $PANEL_URL…"
(cd central-admin-app && exec env PORT=3100 CENTRAL_ADMIN_USER="$PANEL_USER" CENTRAL_ADMIN_PASSWORD="$PANEL_PASSWORD" \
  SUPABASE_URL="$API_URL" SUPABASE_SERVICE_ROLE_KEY="$SERVICE_ROLE_KEY" SUPABASE_ANON_KEY="$ANON_KEY" \
  node server.js) >"$RUNDIR/panel.log" 2>&1 &
PANEL_PID=$!
disown "$PANEL_PID" 2>/dev/null || true
echo "panel=$PANEL_PID" >> "$PIDFILE"
if ! wait_for_http "$PANEL_URL/"; then
  echo "ABORTA: el panel no respondió a tiempo. Revisa $RUNDIR/panel.log" >&2
  stop_tracked
  exit 1
fi

# ── 8) Frontend, servidor de desarrollo (react-scripts) contra Supabase local, solo localhost ───
FRONTEND_URL="http://127.0.0.1:3000"
require_local_http "URL del frontend" "$FRONTEND_URL"

echo "-- Levantando el frontend en $FRONTEND_URL (puede tardar al compilar la primera vez)…"
[[ -d frontend/node_modules ]] || { echo "ABORTA: falta frontend/node_modules. Ejecuta 'npm install' dentro de frontend/ primero." >&2; stop_tracked; exit 1; }
# Se invoca react-scripts.js directamente con `node` (en vez de `npm run start:dev`) para que el
# PID capturado abajo sea el proceso real del servidor de desarrollo, no un envoltorio de npm que
# a su vez lance otro proceso hijo — así `stop` lo apaga de verdad.
(cd frontend && exec env PORT=3000 BROWSER=none REACT_APP_SUPABASE_URL="$API_URL" REACT_APP_SUPABASE_ANON_KEY="$ANON_KEY" NODE_ENV=development \
  node node_modules/react-scripts/bin/react-scripts.js start) >"$RUNDIR/frontend.log" 2>&1 &
FRONTEND_PID=$!
disown "$FRONTEND_PID" 2>/dev/null || true
echo "frontend=$FRONTEND_PID" >> "$PIDFILE"
if ! wait_for_http "$FRONTEND_URL/" 180; then
  echo "ABORTA: el frontend no respondió a tiempo. Revisa $RUNDIR/frontend.log" >&2
  stop_tracked
  exit 1
fi

# ── 9) Resumen final ──────────────────────────────────────────────────────────────────────────
cat <<SUMMARY

================================================================================
 Entorno de demostración LOCAL listo (ver loop-consentimiento/DEMO.md para el recorrido guiado)
================================================================================

 Frontend (usuarios):        $FRONTEND_URL
 Panel de administración:    $PANEL_URL
   Usuario/clave (acceso compartido de la consola, HTTP Basic):
     Usuario:  $PANEL_USER
     Clave:    $PANEL_PASSWORD

 Admin de prueba del módulo de Consentimiento (rol privacy_admin):
     Correo:    $ADMIN_EMAIL
     Clave:     $ADMIN_PASSWORD
     Clave TOTP (entrada manual en tu app autenticadora — Google Authenticator, Authy, etc.):
       $ADMIN_TOTP_SECRET

 Usuario normal de prueba (ya registrado, con su consentimiento otorgado):
     Correo:    $DEMO_USER_EMAIL
     Clave:     $DEMO_USER_PASSWORD

 Logs:    $RUNDIR
 Apagar:  bash scripts/demo-local.sh stop

================================================================================
SUMMARY
