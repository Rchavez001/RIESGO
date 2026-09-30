// T05.b — punta a punta LOCAL del acceso individual al módulo: panel real (central-admin-app/server.js) → Supabase Auth
// local (contraseña + TOTP real, RFC 6238) → admin-consent servida en local → admin_audit_log. Fuera de gates.sh.
//
//   PANEL_URL=http://127.0.0.1:3197 PANEL_BASIC=usuario:clave-de-prueba \
//   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_SERVICE_ROLE_KEY=… node supabase/tests/consent/admin_login_local.cjs
//
// La service role local solo prepara datos (usuarios de prueba @example.test, fila en public.users, rol) y lee la
// bitácora para comprobarla. Se niega a correr si alguna URL no es local.
const crypto = require('crypto')

const PANEL = process.env.PANEL_URL || ''
const BASIC = process.env.PANEL_BASIC || ''
const SB = process.env.SUPABASE_URL || ''
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const LOCAL = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/
if (!LOCAL.test(PANEL) || !LOCAL.test(SB)) throw new Error('solo contra panel y Supabase locales')
if (!BASIC || !SERVICE) throw new Error('faltan PANEL_BASIC / SUPABASE_SERVICE_ROLE_KEY')

let failures = 0
const check = (ok, label, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}${!ok && detail ? ` — ${detail}` : ''}`); if (!ok) failures++ }
const claims = (jwt) => JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString('utf8'))

function totp(base32, t = Date.now()) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'
  let bits = ''
  for (const c of base32.replace(/=+$/, '').toUpperCase()) bits += alphabet.indexOf(c).toString(2).padStart(5, '0')
  const key = Buffer.from(bits.match(/.{8}/g).map((b) => parseInt(b, 2)))
  const counter = Buffer.alloc(8)
  counter.writeBigUInt64BE(BigInt(Math.floor(t / 1000 / 30)))
  const h = crypto.createHmac('sha1', key).update(counter).digest()
  const o = h[h.length - 1] & 0xf
  return String((h.readUInt32BE(o) & 0x7fffffff) % 1_000_000).padStart(6, '0')
}

async function sb(path, body, method = 'POST') {
  const res = await fetch(`${SB}${path}`, {
    method,
    headers: { apikey: SERVICE, Authorization: `Bearer ${SERVICE}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}`)
  return json
}

async function panel(path, { session, body, method = 'POST' } = {}) {
  const headers = { Authorization: `Basic ${Buffer.from(BASIC).toString('base64')}`, 'Content-Type': 'application/json' }
  if (session) headers['X-Admin-Session'] = session
  const res = await fetch(`${PANEL}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) })
  const text = await res.text()
  let json = null
  try { json = JSON.parse(text) } catch { /* 204 u otro cuerpo */ }
  return { status: res.status, json }
}

async function newAdmin(label, role) {
  const email = `${label}-${crypto.randomUUID().slice(0, 8)}@example.test`
  const password = `Local-${crypto.randomUUID()}`
  const user = await sb('/auth/v1/admin/users', { email, password, email_confirm: true })
  await sb('/rest/v1/users', { id: user.id, email })
  if (role) await sb('/rest/v1/admin_roles', { user_id: user.id, role })
  return { id: user.id, email, password }
}

/** Contraseña → alta TOTP → desafío → verificación con el código real, todo a través del panel. Devuelve el token aal2. */
async function loginWithTotp(admin) {
  const pw = await panel('/api/privacy/auth/token?grant_type=password', { body: { email: admin.email, password: admin.password } })
  if (pw.status !== 200) throw new Error(`login ${pw.status}`)
  const aal1 = pw.json.access_token
  const enroll = await panel('/api/privacy/auth/factors', { session: aal1, body: { factor_type: 'totp', friendly_name: `panel-${Date.now()}` } })
  if (enroll.status !== 200) throw new Error(`enroll ${enroll.status} ${JSON.stringify(enroll.json)}`)
  // No verificar pegado al cambio de ventana de 30 s.
  if (Date.now() / 1000 % 30 > 26) await new Promise((r) => setTimeout(r, 5000))
  const challenge = await panel(`/api/privacy/auth/factors/${enroll.json.id}/challenge`, { session: aal1, body: {} })
  const verify = await panel(`/api/privacy/auth/factors/${enroll.json.id}/verify`, {
    session: aal1, body: { challenge_id: challenge.json.id, code: totp(enroll.json.totp.secret) },
  })
  if (verify.status !== 200) throw new Error(`verify ${verify.status} ${JSON.stringify(verify.json)}`)
  return { aal1, aal2: verify.json.access_token, refresh: verify.json.refresh_token }
}

;(async () => {
  const admin = await newAdmin('admin', 'privacy_admin')

  // 1) Solo contraseña (aal1): la función real exige TOTP.
  const pw = await panel('/api/privacy/auth/token?grant_type=password', { body: { email: admin.email, password: admin.password } })
  check(pw.status === 200 && claims(pw.json.access_token).aal === 'aal1', 'login por contraseña a través del panel → token aal1')
  const noMfa = await panel('/api/privacy/fn/admin-consent/session', { session: pw.json.access_token })
  check(noMfa.status === 403 && noMfa.json?.error === 'mfa_required', 'admin-consent con aal1 → 403 mfa_required', JSON.stringify(noMfa))

  // 2) TOTP real → aal2 → sesión verificada y atribuida.
  const { aal2 } = await loginWithTotp(admin)
  const c = claims(aal2)
  check(c.aal === 'aal2' && c.sub === admin.id, 'verificación TOTP real → token aal2 del mismo admin')
  const ok = await panel('/api/privacy/fn/admin-consent/session', { session: aal2 })
  check(ok.status === 200 && ok.json?.user_id === admin.id && ok.json.roles?.join() === 'privacy_admin', 'admin-consent/session con aal2 → 200 con su rol', JSON.stringify(ok))

  const rows = await sb(`/rest/v1/admin_audit_log?select=actor_id,actor_email_hmac,actor_role,action,entity,entity_id,row_hash&actor_id=eq.${admin.id}&order=id.desc&limit=1`, undefined, 'GET')
  const row = rows[0] || {}
  check(row.action === 'admin.session_verified' && row.actor_id === admin.id, 'admin_audit_log: admin.session_verified con el actor_id real', JSON.stringify(row))
  check(row.entity_id === c.session_id && row.actor_role === 'privacy_admin', 'admin_audit_log: entity_id = session_id del token, actor_role = rol')
  check(typeof row.actor_email_hmac === 'string' && row.actor_email_hmac.length > 20 && !row.actor_email_hmac.includes('@'), 'admin_audit_log: correo como HMAC, no en claro')
  check(typeof row.row_hash === 'string' && row.row_hash.length === 64, 'admin_audit_log: fila encadenada (row_hash)')

  // 3) Usuario con TOTP pero sin rol del módulo.
  const nobody = await newAdmin('sinrol', null)
  const nobodyTokens = await loginWithTotp(nobody)
  const denied = await panel('/api/privacy/fn/admin-consent/session', { session: nobodyTokens.aal2 })
  check(denied.status === 403 && denied.json?.error === 'forbidden', 'usuario aal2 sin rol → 403 forbidden', JSON.stringify(denied))

  // 4) La Basic Auth compartida sola no alcanza el módulo.
  check((await panel('/api/rest/v1/admin_audit_log?select=id', { method: 'GET' })).status === 403, 'Basic Auth + service role → admin_audit_log 403')
  check((await panel('/api/rest/v1/admin_roles', { body: { user_id: nobody.id, role: 'privacy_admin' } })).status === 403, 'Basic Auth + service role → no puede concederse un rol (403)')
  check((await panel('/api/functions/v1/admin-consent/session')).status === 403, 'Basic Auth + service role → admin-consent 403')
  check((await panel('/api/auth/v1/admin/generate_link', { body: { type: 'magiclink', email: admin.email } })).status === 403, 'Basic Auth + service role → Auth admin (enlace de acceso) 403')

  // 5) Cierre de sesión a través del panel.
  const out = await panel('/api/privacy/auth/logout', { session: aal2 })
  check(out.status === 204, 'logout del módulo a través del panel → 204', String(out.status))

  console.log(failures ? `\n${failures} FALLO(S)` : '\nTodo OK')
  process.exit(failures ? 1 : 0)
})().catch((e) => { console.error('ERROR', e.message); process.exit(2) })
