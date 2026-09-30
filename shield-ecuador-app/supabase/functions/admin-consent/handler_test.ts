// Run: deno test --allow-env supabase/functions/admin-consent/handler_test.ts
// T05.a (SEC-03, H08): `POST /admin-consent/session` atribuye la sesión al admin individual del JWT verificado.
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'https://deno.land/x/jose@v5.9.6/index.ts'
import { handle, type AdminConsentDeps, type AuditEntry } from './handler.ts'

const KID = 'k1'
const ADMIN_ID = '0d9b7c1e-2f3a-4b5c-8d6e-7f8091a2b3c4'
const SESSION_ID = '5e4d3c2b-1a09-4f8e-9d7c-6b5a49382716'
const keys = await generateKeyPair('ES256')
const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(keys.publicKey)), kid: KID, alg: 'ES256' }] })

const claims = (over: JWTPayload = {}): JWTPayload => ({
  sub: ADMIN_ID, aud: 'authenticated', role: 'authenticated', email: 'Admin.Uno@Example.test',
  aal: 'aal2', session_id: SESSION_ID, is_anonymous: false, ...over,
})
const sign = (c: JWTPayload) =>
  new SignJWT(c).setProtectedHeader({ alg: 'ES256', kid: KID }).setIssuedAt().setExpirationTime('10m').sign(keys.privateKey)

function deps(roles: string[], audit: AuditEntry[] = [], failAudit = false): AdminConsentDeps {
  return {
    guard: { key: jwks, lookupRoles: () => Promise.resolve(roles) },
    emailHmac: (email) => Promise.resolve(`hmac(${email})`),
    audit: (entry) => (failAudit ? Promise.reject(new Error('db')) : (audit.push(entry), Promise.resolve())),
  }
}

const post = (token?: string, path = '/admin-consent/session', method = 'POST') =>
  new Request(`http://localhost${path}`, { method, headers: token ? { Authorization: `Bearer ${token}` } : {} })

Deno.test('POST /session con admin aal2 y rol → 200 y bitácora con el actor_id del token verificado', async () => {
  const audit: AuditEntry[] = []
  const res = await handle(post(await sign(claims())), deps(['privacy_editor', 'privacy_auditor'], audit))
  assertEquals(res.status, 200)
  assertEquals(await res.json(), { user_id: ADMIN_ID, roles: ['privacy_editor', 'privacy_auditor'] })
  assertEquals(audit, [{
    actor_id: ADMIN_ID,
    actor_email_hmac: 'hmac(admin.uno@example.test)',
    actor_role: 'privacy_editor,privacy_auditor',
    action: 'admin.session_verified',
    entity: 'admin_session',
    entity_id: SESSION_ID,
  }])
})

Deno.test('sin token → 401 y nada en la bitácora', async () => {
  const audit: AuditEntry[] = []
  const res = await handle(post(), deps(['privacy_admin'], audit))
  assertEquals([res.status, (await res.json()).error], [401, 'missing_token'])
  assertEquals(audit, [])
})

Deno.test('sesión sin TOTP (aal1) → 403 mfa_required y nada en la bitácora', async () => {
  const audit: AuditEntry[] = []
  const res = await handle(post(await sign(claims({ aal: 'aal1' }))), deps(['privacy_admin'], audit))
  assertEquals([res.status, (await res.json()).error], [403, 'mfa_required'])
  assertEquals(audit, [])
})

Deno.test('usuario sin rol del módulo → 403 forbidden y nada en la bitácora', async () => {
  const audit: AuditEntry[] = []
  const res = await handle(post(await sign(claims())), deps([], audit))
  assertEquals([res.status, (await res.json()).error], [403, 'forbidden'])
  assertEquals(audit, [])
})

Deno.test('service_role (el proxy del panel con Basic Auth) → 401 not_user_token', async () => {
  const audit: AuditEntry[] = []
  const res = await handle(post(await sign(claims({ role: 'service_role' }))), deps(['privacy_admin'], audit))
  assertEquals([res.status, (await res.json()).error], [401, 'not_user_token'])
  assertEquals(audit, [])
})

Deno.test('admin sin correo en el token → 403 forbidden (la bitácora exige actor_email_hmac)', async () => {
  const audit: AuditEntry[] = []
  const res = await handle(post(await sign(claims({ email: undefined }))), deps(['privacy_admin'], audit))
  assertEquals([res.status, (await res.json()).error], [403, 'forbidden'])
  assertEquals(audit, [])
})

Deno.test('si la bitácora falla, la sesión no se da por verificada → 503 audit_failed', async () => {
  const res = await handle(post(await sign(claims())), deps(['privacy_admin'], [], true))
  assertEquals([res.status, (await res.json()).error], [503, 'audit_failed'])
})

Deno.test('ruta desconocida → 404; método distinto de POST en /session → 405', async () => {
  const token = await sign(claims())
  assertEquals((await handle(post(token, '/admin-consent/otra'), deps(['privacy_admin']))).status, 404)
  assertEquals((await handle(post(token, '/admin-consent/session', 'GET'), deps(['privacy_admin']))).status, 405)
})

Deno.test('las respuestas de error no llevan el token ni detalles internos', async () => {
  const token = await sign(claims({ aal: 'aal1' }))
  const body = await (await handle(post(token), deps(['privacy_admin']))).text()
  assertEquals(body.includes(token.split('.')[1]), false)
  assertEquals(Object.keys(JSON.parse(body)), ['error'])
})
