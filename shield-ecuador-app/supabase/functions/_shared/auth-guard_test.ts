// Run: deno test --allow-env --allow-read supabase/functions/_shared/auth-guard_test.ts
// T04 (SEC-01, SEC-02, H01): verificación criptográfica del JWT y roles desde `admin_roles`. Todas las claves son efímeras,
// generadas en la prueba; ningún token real.
import { assert, assertEquals, assertRejects } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import {
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
  SignJWT,
  UnsecuredJWT,
  type JWTPayload,
  type KeyLike,
} from 'https://deno.land/x/jose@v5.9.6/index.ts'
import { AuthError, requireRole, requireUser, type AuthGuardOptions, type VerifiedUser } from './auth-guard.ts'

const KID = 'test-key-1'
const USER_ID = '6f1c2b1e-8a4d-4c3e-9b2a-1d2e3f4a5b6c'
const ISSUER = 'http://127.0.0.1:54321/auth/v1'

const projectKeys = await generateKeyPair('ES256')
const attackerKeys = await generateKeyPair('ES256')
const jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(projectKeys.publicKey)), kid: KID, alg: 'ES256', use: 'sig' }] })

const baseClaims = (): JWTPayload => ({
  sub: USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'ana@example.test',
  is_anonymous: false,
  aal: 'aal2',
})

async function sign(claims: JWTPayload, opts: { key?: KeyLike; exp?: string | number; kid?: string; noExp?: boolean } = {}) {
  let jwt = new SignJWT(claims).setProtectedHeader({ alg: 'ES256', kid: opts.kid ?? KID, typ: 'JWT' }).setIssuer(ISSUER).setIssuedAt()
  if (!opts.noExp) jwt = jwt.setExpirationTime(opts.exp ?? '1h')
  return await jwt.sign(opts.key ?? projectKeys.privateKey)
}

const req = (authorization?: string) =>
  new Request('http://localhost/fn', authorization === undefined ? {} : { headers: { Authorization: authorization } })

const lookupCalls: string[] = []
const options = (roles: string[] | Error = []): AuthGuardOptions => ({
  key: jwks,
  issuer: ISSUER,
  lookupRoles: (user: VerifiedUser) => {
    lookupCalls.push(user.userId)
    return roles instanceof Error ? Promise.reject(roles) : Promise.resolve(roles)
  },
})

async function expectAuthError(p: () => Promise<unknown>, status: number, code: string) {
  const err = await assertRejects(p, AuthError)
  assertEquals([(err as AuthError).status, (err as AuthError).code], [status, code])
}

// ── requireUser: casos negativos obligatorios ─────────────────────────────────────────────────────────────────────────

Deno.test('sin token → 401 missing_token', async () => {
  await expectAuthError(() => requireUser(req(), options()), 401, 'missing_token')
  await expectAuthError(() => requireUser(req(''), options()), 401, 'missing_token')
  await expectAuthError(() => requireUser(req('Bearer '), options()), 401, 'missing_token')
})

Deno.test('esquema distinto de Bearer o valor basura → 401 invalid_token', async () => {
  await expectAuthError(() => requireUser(req('Basic YWRtaW46YWRtaW4='), options()), 401, 'invalid_token')
  await expectAuthError(() => requireUser(req('Bearer no.es.un.jwt'), options()), 401, 'invalid_token')
})

Deno.test('firma alterada → 401 invalid_token', async () => {
  const token = await sign(baseClaims())
  const [h, p, s] = token.split('.')
  const flipped = s[0] === 'A' ? 'B' + s.slice(1) : 'A' + s.slice(1)
  await expectAuthError(() => requireUser(req(`Bearer ${h}.${p}.${flipped}`), options()), 401, 'invalid_token')
})

Deno.test('carga útil alterada con la firma original → 401 invalid_token', async () => {
  const token = await sign(baseClaims())
  const [h, , s] = token.split('.')
  const forged = btoa(JSON.stringify({ ...baseClaims(), sub: '00000000-0000-4000-8000-000000000000', exp: 9999999999 }))
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_')
  await expectAuthError(() => requireUser(req(`Bearer ${h}.${forged}.${s}`), options()), 401, 'invalid_token')
})

Deno.test('token firmado con una clave ajena (mismo kid) → 401 invalid_token', async () => {
  const token = await sign(baseClaims(), { key: attackerKeys.privateKey })
  await expectAuthError(() => requireUser(req(`Bearer ${token}`), options()), 401, 'invalid_token')
})

Deno.test('token expirado → 401 token_expired', async () => {
  const token = await sign(baseClaims(), { exp: Math.floor(Date.now() / 1000) - 60 })
  await expectAuthError(() => requireUser(req(`Bearer ${token}`), options()), 401, 'token_expired')
})

Deno.test('token sin exp → 401 invalid_token (exp es obligatorio)', async () => {
  const token = await sign(baseClaims(), { noExp: true })
  await expectAuthError(() => requireUser(req(`Bearer ${token}`), options()), 401, 'invalid_token')
})

Deno.test('claim role: service_role forjado sin firma (alg none) → 401 invalid_token', async () => {
  const token = new UnsecuredJWT({ ...baseClaims(), role: 'service_role' }).setIssuer(ISSUER).setExpirationTime('1h').encode()
  await expectAuthError(() => requireUser(req(`Bearer ${token}`), options()), 401, 'invalid_token')
})

Deno.test('claim role: service_role forjado con clave ajena → 401 invalid_token', async () => {
  const token = await sign({ ...baseClaims(), role: 'service_role' }, { key: attackerKeys.privateKey })
  await expectAuthError(() => requireUser(req(`Bearer ${token}`), options()), 401, 'invalid_token')
})

Deno.test('service_role con firma válida tampoco es un usuario individual (H08) → 401 not_user_token', async () => {
  const token = await sign({ ...baseClaims(), role: 'service_role' })
  await expectAuthError(() => requireUser(req(`Bearer ${token}`), options()), 401, 'not_user_token')
})

Deno.test('clave anon (role anon, sin sub) → 401 not_user_token', async () => {
  const token = await sign({ role: 'anon', aud: 'authenticated' })
  await expectAuthError(() => requireUser(req(`Bearer ${token}`), options()), 401, 'not_user_token')
})

Deno.test('audiencia o emisor distintos → 401 invalid_token', async () => {
  const wrongAud = await sign({ ...baseClaims(), aud: 'otra-app' })
  await expectAuthError(() => requireUser(req(`Bearer ${wrongAud}`), options()), 401, 'invalid_token')
  const token = await sign(baseClaims())
  await expectAuthError(() => requireUser(req(`Bearer ${token}`), { ...options(), issuer: 'https://otro.example.test/auth/v1' }), 401, 'invalid_token')
})

Deno.test('sub que no es UUID → 401 invalid_token', async () => {
  const token = await sign({ ...baseClaims(), sub: 'admin' })
  await expectAuthError(() => requireUser(req(`Bearer ${token}`), options()), 401, 'invalid_token')
})

Deno.test('sesión anónima (is_anonymous) → 403 anonymous_session', async () => {
  const token = await sign({ ...baseClaims(), is_anonymous: true, email: undefined })
  await expectAuthError(() => requireUser(req(`Bearer ${token}`), options()), 403, 'anonymous_session')
})

// ── requireUser: caso positivo ────────────────────────────────────────────────────────────────────────────────────────

Deno.test('token válido → identidad del sub verificado', async () => {
  const token = await sign(baseClaims())
  const user = await requireUser(req(`bearer ${token}`), options())
  assertEquals([user.userId, user.email, user.jwt], [USER_ID, 'ana@example.test', token])
})

// ── requireRole ───────────────────────────────────────────────────────────────────────────────────────────────────────

Deno.test('usuario sin rol → 403 forbidden', async () => {
  const token = await sign(baseClaims())
  await expectAuthError(() => requireRole(req(`Bearer ${token}`), ['privacy_editor'], options([])), 403, 'forbidden')
})

Deno.test('rol insuficiente (editor pide admin) → 403 forbidden', async () => {
  const token = await sign(baseClaims())
  await expectAuthError(() => requireRole(req(`Bearer ${token}`), ['privacy_admin'], options(['privacy_editor'])), 403, 'forbidden')
})

Deno.test('rol suficiente → devuelve la identidad y los roles concedidos que coinciden', async () => {
  const token = await sign(baseClaims())
  const user = await requireRole(req(`Bearer ${token}`), ['privacy_admin', 'privacy_auditor'], options(['privacy_editor', 'privacy_auditor']))
  assertEquals([user.userId, user.roles], [USER_ID, ['privacy_auditor']])
})

Deno.test('los roles se consultan para el sub VERIFICADO, y nunca si el token es inválido', async () => {
  lookupCalls.length = 0
  const forged = await sign({ ...baseClaims(), sub: '00000000-0000-4000-8000-000000000000' }, { key: attackerKeys.privateKey })
  await expectAuthError(() => requireRole(req(`Bearer ${forged}`), ['privacy_admin'], options(['privacy_admin'])), 401, 'invalid_token')
  const anon = await sign({ ...baseClaims(), is_anonymous: true })
  await expectAuthError(() => requireRole(req(`Bearer ${anon}`), ['privacy_admin'], options(['privacy_admin'])), 403, 'anonymous_session')
  assertEquals(lookupCalls, [])
  await requireRole(req(`Bearer ${await sign(baseClaims())}`), ['privacy_admin'], options(['privacy_admin']))
  assertEquals(lookupCalls, [USER_ID])
})

Deno.test('un claim de rol en el token no concede nada: el rol sale de admin_roles', async () => {
  const token = await sign({ ...baseClaims(), privacy_role: 'privacy_admin', app_metadata: { roles: ['privacy_admin'] } })
  await expectAuthError(() => requireRole(req(`Bearer ${token}`), ['privacy_admin'], options([])), 403, 'forbidden')
})

// T05.a (D-01): los roles del módulo exigen el segundo factor (TOTP) verificado en ESTA sesión.
Deno.test('requireRole con sesión aal1 (sin TOTP) o sin claim aal → 403 mfa_required, sin consultar roles', async () => {
  lookupCalls.length = 0
  const aal1 = await sign({ ...baseClaims(), aal: 'aal1' })
  await expectAuthError(() => requireRole(req(`Bearer ${aal1}`), ['privacy_admin'], options(['privacy_admin'])), 403, 'mfa_required')
  const { aal: _omit, ...sinAal } = baseClaims()
  const noAal = await sign(sinAal)
  await expectAuthError(() => requireRole(req(`Bearer ${noAal}`), ['privacy_admin'], options(['privacy_admin'])), 403, 'mfa_required')
  assertEquals(lookupCalls, [])
})

Deno.test('requireUser no exige TOTP: un usuario normal (aal1) sigue siendo un usuario', async () => {
  const aal1 = await sign({ ...baseClaims(), aal: 'aal1' })
  assertEquals((await requireUser(req(`Bearer ${aal1}`), options())).userId, USER_ID)
})

Deno.test('error al consultar admin_roles → falla cerrado (503 role_lookup_failed)', async () => {
  const token = await sign(baseClaims())
  await expectAuthError(() => requireRole(req(`Bearer ${token}`), ['privacy_admin'], options(new Error('db caída'))), 503, 'role_lookup_failed')
})

Deno.test('lista de roles vacía o rol desconocido → error de programación, nunca acceso', async () => {
  const token = await sign(baseClaims())
  await assertRejects(() => requireRole(req(`Bearer ${token}`), [], options(['privacy_admin'])), TypeError)
  await assertRejects(
    // deno-lint-ignore no-explicit-any -- a propósito: simula a quien llama con un rol fuera del tipo
    () => requireRole(req(`Bearer ${token}`), ['admin' as any], options(['privacy_admin'])),
    TypeError,
  )
})

// ── H01: sin decodificación de JWT sin verificar en el módulo ─────────────────────────────────────────────────────────

Deno.test('auth-guard.ts no usa decodeJwtRole, decodeJwt ni atob', async () => {
  const src = await Deno.readTextFile(new URL('./auth-guard.ts', import.meta.url))
  for (const banned of ['decodeJwtRole', 'decodeJwt', 'atob(']) assert(!src.includes(banned), `auth-guard.ts contiene ${banned}`)
})
