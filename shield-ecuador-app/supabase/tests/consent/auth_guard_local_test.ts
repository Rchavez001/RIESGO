// T04 contra un Supabase LOCAL real (`supabase start`): tokens emitidos por el Auth local, JWKS remoto y `admin_roles` vía
// PostgREST, sin inyectar nada en `auth-guard.ts`. No forma parte de gates.sh (necesita el stack local en marcha).
//
//   SUPABASE_URL=http://127.0.0.1:54321 SUPABASE_ANON_KEY=… SUPABASE_SERVICE_ROLE_KEY=… \
//   SUPABASE_JWT_ISSUER=http://127.0.0.1:54321/auth/v1 \
//   deno test --allow-env --allow-net supabase/tests/consent/auth_guard_local_test.ts
//
// Las claves son las del stack local (`supabase status -o env`). Se niega a correr contra cualquier host que no sea local.
import { assertEquals, assertRejects } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { AuthError, requireRole, requireUser } from '../../functions/_shared/auth-guard.ts'

const URL_ = Deno.env.get('SUPABASE_URL') ?? ''
const ANON = Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const SERVICE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL_)) throw new Error('solo contra Supabase local (SUPABASE_URL=http://127.0.0.1:…)')
if (!ANON || !SERVICE) throw new Error('faltan SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY del stack local')

const PASSWORD = 'Local-only-T04-pass!'
const req = (token: string) => new Request('http://localhost/fn', { headers: { Authorization: `Bearer ${token}` } })

async function call(path: string, key: string, body: unknown, extra: Record<string, string> = {}) {
  const res = await fetch(`${URL_}${path}`, {
    method: 'POST',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'content-type': 'application/json', ...extra },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => null)
  if (!res.ok) throw new Error(`${path} → ${res.status}`)
  return json
}

/** Usuario confirmado + su fila en public.users; devuelve id y un access_token real del Auth local. */
async function newUser(label: string) {
  const email = `${label}-${crypto.randomUUID().slice(0, 8)}@example.test`
  const user = await call('/auth/v1/admin/users', SERVICE, { email, password: PASSWORD, email_confirm: true })
  await call('/rest/v1/users', SERVICE, { id: user.id, email }, { Prefer: 'return=minimal' })
  const session = await call('/auth/v1/token?grant_type=password', ANON, { email, password: PASSWORD })
  return { id: user.id as string, token: session.access_token as string }
}

async function expectAuthError(p: () => Promise<unknown>, status: number, code: string) {
  const err = await assertRejects(p, AuthError)
  assertEquals([(err as AuthError).status, (err as AuthError).code], [status, code])
}

const alg = (token: string) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(token.split('.')[0].replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0)))).alg

Deno.test('el Auth local firma con ES256 y requireUser acepta su token (JWKS remoto + emisor)', async () => {
  const u = await newUser('firma')
  assertEquals(alg(u.token), 'ES256')
  const user = await requireUser(req(u.token))
  assertEquals(user.userId, u.id)
})

Deno.test('token real con la carga útil alterada → 401 invalid_token', async () => {
  const u = await newUser('alterado')
  const [h, p, s] = u.token.split('.')
  const flipped = (p[5] === 'A' ? 'B' : 'A')
  await expectAuthError(() => requireUser(req(`${h}.${p.slice(0, 5)}${flipped}${p.slice(6)}.${s}`)), 401, 'invalid_token')
})

Deno.test('claves anon y service_role del proyecto (HS256 heredado) → 401, nunca un usuario', async () => {
  await expectAuthError(() => requireUser(req(ANON)), 401, 'invalid_token')
  await expectAuthError(() => requireUser(req(SERVICE)), 401, 'invalid_token')
})

Deno.test('sesión anónima real del Auth local → 403 anonymous_session', async () => {
  const session = await call('/auth/v1/signup', ANON, {})
  assertEquals(alg(session.access_token), 'ES256')
  await expectAuthError(() => requireUser(req(session.access_token)), 403, 'anonymous_session')
})

Deno.test('requireRole con admin_roles real: sin rol → 403; con privacy_editor → OK; pide privacy_admin → 403', async () => {
  const u = await newUser('roles')
  await expectAuthError(() => requireRole(req(u.token), ['privacy_editor']), 403, 'forbidden')
  await call('/rest/v1/admin_roles', SERVICE, { user_id: u.id, role: 'privacy_editor' }, { Prefer: 'return=minimal' })
  const ok = await requireRole(req(u.token), ['privacy_editor', 'privacy_admin'])
  assertEquals([ok.userId, ok.roles], [u.id, ['privacy_editor']])
  await expectAuthError(() => requireRole(req(u.token), ['privacy_admin']), 403, 'forbidden')
})

Deno.test('el rol de otra persona no se ve: RLS de admin_roles con el JWT del usuario', async () => {
  const admin = await newUser('otra')
  await call('/rest/v1/admin_roles', SERVICE, { user_id: admin.id, role: 'privacy_admin' }, { Prefer: 'return=minimal' })
  const u = await newUser('mirona')
  await expectAuthError(() => requireRole(req(u.token), ['privacy_admin']), 403, 'forbidden')
})
