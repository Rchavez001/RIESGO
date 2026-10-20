// Run: deno test --allow-env --allow-net supabase/functions/accept-guest-notice/index_test.ts
// Mismo patrón que submit-consent/index_test.ts: función real contra un fake Supabase (REST + JWKS).
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'https://deno.land/x/jose@v5.9.6/index.ts'

function randomKeyB64() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
}

const KID = 'k1'
const GUEST_ID = '11111111-2222-4333-8444-555555555555'
const keys = await generateKeyPair('ES256')
const jwks = { keys: [{ ...(await exportJWK(keys.publicKey)), kid: KID, alg: 'ES256' }] }

const claims = (over: JWTPayload = {}): JWTPayload => ({
  sub: GUEST_ID, aud: 'authenticated', role: 'authenticated', is_anonymous: true, ...over,
})
const sign = (c: JWTPayload) =>
  new SignJWT(c).setProtectedHeader({ alg: 'ES256', kid: KID }).setIssuedAt().setExpirationTime('10m').sign(keys.privateKey)

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

const DOCUMENT = {
  id: 'doc-1', version: '1.0', title: 'Aviso de prueba', requires_reconsent: false, published_at: '2026-10-20T00:00:00Z',
  purposes: [{ code: 'registro_aprendizaje', label: 'Registro y aprendizaje', required: true }],
  content_md: 'Responsable: {{responsable_nombre}}. Escribe a {{correo_privacidad}}. Vigente desde {{fecha_vigencia}}.',
}
const SETTINGS = {
  settings_version: 1, controller_name: 'Club de Prueba', controller_address: null, controller_phone: null,
  privacy_email: 'privacidad@prueba.example', dpo_name: null, dpo_contact: null, privacy_policy_url: null,
  unsubscribe_subject: 'Baja - Prueba', response_days: 15, ip_retention_days: 730,
}

let quotaRpc: () => Response = () => json(true)
let documentRow: unknown = DOCUMENT
const inserted: Array<Record<string, unknown>> = []

const fake = Deno.serve({ port: 0, onListen: () => {} }, async (req) => {
  const { pathname } = new URL(req.url)
  const text = req.method === 'GET' || req.method === 'DELETE' ? '' : await req.text()
  const single = (req.headers.get('accept') ?? '').includes('vnd.pgrst.object')
  const row = (obj: unknown) => (single ? json(obj) : json(obj === null ? [] : [obj]))

  if (pathname === '/auth/v1/.well-known/jwks.json') return json(jwks)
  if (pathname === '/rest/v1/rpc/check_rate_limit') return quotaRpc()
  if (pathname === '/rest/v1/consent_documents') return row(documentRow)
  if (pathname === '/rest/v1/privacy_settings_current') return row(SETTINGS)
  if (pathname === '/rest/v1/consent_records' && req.method === 'POST') {
    inserted.push(JSON.parse(text))
    return new Response('', { status: 201 })
  }
  return new Response(req.method === 'GET' ? '[]' : '', { status: req.method === 'POST' ? 201 : 200, headers: { 'Content-Type': 'application/json' } })
})

Deno.env.set('SUPABASE_URL', `http://127.0.0.1:${(fake.addr as Deno.NetAddr).port}`)
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key')
Deno.env.set('SECURITY_EVENTS_HMAC_KEY', randomKeyB64())
Deno.env.set('LOOKUP_HMAC_KEY_B64', randomKeyB64())
Deno.env.set('PII_ENCRYPTION_KEY_B64', randomKeyB64())

await import('./index.ts')

async function call(token?: string, xff = '203.0.113.9') {
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      return await fetch('http://127.0.0.1:8000/', {
        method: 'POST',
        headers: {
          ...(xff ? { 'x-forwarded-for': xff } : {}),
          'user-agent': 'PruebaUA/1.0',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
      })
    } catch {
      await new Promise((r) => setTimeout(r, 100)) // la función todavía está arrancando
    }
  }
  throw new Error('la función no arrancó')
}

const reset = () => { quotaRpc = () => json(true); documentRow = DOCUMENT; inserted.length = 0 }
const opts = { sanitizeOps: false, sanitizeResources: false }

Deno.test({
  name: 'sesión anónima real: 200, una fila con channel=invitado y purpose_code=invitado_basico',
  ...opts,
  async fn() {
    reset()
    const res = await call(await sign(claims()))
    assertEquals(res.status, 200)
    assertEquals(await res.json(), { purpose_code: 'invitado_basico' })
    assertEquals(inserted.length, 1)
    assertEquals(inserted[0].channel, 'invitado')
    assertEquals(inserted[0].purpose_code, 'invitado_basico')
    assertEquals(inserted[0].decision, 'granted')
    // T19b Paso 2B: el invitado no tiene fila en public.users — guardar su auth.uid() en
    // user_id (FK a public.users) violaría la FK; user_ref_hmac es la referencia estable.
    assertEquals(inserted[0].user_id, null)
    assertEquals(typeof inserted[0].user_ref_hmac, 'string')
  },
})

Deno.test({
  name: 'sesión NO anónima (usuario normal) → 403 not_anonymous_session, nada escrito',
  ...opts,
  async fn() {
    reset()
    const res = await call(await sign(claims({ is_anonymous: false, email: 'ana@example.test' })))
    assertEquals([res.status, (await res.json()).error], [403, 'not_anonymous_session'])
    assertEquals(inserted.length, 0)
  },
})

Deno.test({
  name: 'sin token → 401 missing_token, nada escrito',
  ...opts,
  async fn() {
    reset()
    const res = await call()
    assertEquals([res.status, (await res.json()).error], [401, 'missing_token'])
    assertEquals(inserted.length, 0)
  },
})

Deno.test({
  name: 'sin aviso publicado → 404 notice_not_published, nada escrito',
  ...opts,
  async fn() {
    reset()
    documentRow = null
    const res = await call(await sign(claims()))
    assertEquals([res.status, (await res.json()).error], [404, 'notice_not_published'])
    assertEquals(inserted.length, 0)
  },
})

Deno.test({
  name: 'X-Forwarded-For con un valor que no es una IP → 400 missing_client_ip, nada escrito',
  ...opts,
  async fn() {
    reset()
    // La cuota (rate-limit.ts, extractClientIp) solo toma la primera entrada en crudo para el HMAC del
    // bucket, así que SÍ pasa con un valor no-IP; getClientIp (client-ip.ts) en cambio valida formato
    // antes de confiar en la cabecera y devuelve null — así se llega al 400 sin chocar antes con el 503
    // fail-closed de la cuota (que exige poder calcular algún hash de IP, válida o no).
    const res = await call(await sign(claims()), 'no-es-una-ip')
    assertEquals([res.status, (await res.json()).error], [400, 'missing_client_ip'])
    assertEquals(inserted.length, 0)
  },
})

Deno.test({
  name: 'cuota no disponible → 503 RATE_LIMIT_UNAVAILABLE fail-closed (SEC-07), nada escrito',
  ...opts,
  async fn() {
    reset()
    quotaRpc = () => new Response('boom', { status: 500 })
    const res = await call(await sign(claims()))
    assertEquals([res.status, (await res.json()).error], [503, 'RATE_LIMIT_UNAVAILABLE'])
    assertEquals(inserted.length, 0)
  },
})

Deno.test({
  name: 'método no permitido → 405; preflight OPTIONS → 200 con cabeceras CORS',
  ...opts,
  async fn() {
    reset()
    const res = await fetch('http://127.0.0.1:8000/', { method: 'GET' })
    await res.body?.cancel()
    assertEquals(res.status, 405)
    const preflight = await fetch('http://127.0.0.1:8000/', { method: 'OPTIONS' })
    await preflight.body?.cancel()
    assertEquals(preflight.status, 200)
    assertEquals(preflight.headers.get('Access-Control-Allow-Origin'), '*')
  },
})
