// Run: deno test --allow-env --allow-net supabase/functions/request-data-subject-right/index_test.ts
// Starts the REAL function (it listens on :8000 when imported) against a fake Supabase (REST + the
// Auth JWKS endpoint requireUser verifies against). handler_test.ts already covers the business logic
// (evidence, due_at, dispatch-or-queue) against fakes injected directly into createDataSubjectRequest;
// this file covers the HTTP layer of index.ts: auth, body validation, rate limit, client IP, method
// routing, and the AuthError/DsrError → status+code mapping.
import { assertEquals, assert } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'https://deno.land/x/jose@v5.9.6/index.ts'

function randomKeyB64() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
}

const KID = 'k1'
const USER_ID = '11111111-2222-4333-8444-555555555555'
const keys = await generateKeyPair('ES256')
const jwks = { keys: [{ ...(await exportJWK(keys.publicKey)), kid: KID, alg: 'ES256' }] }

const claims = (over: JWTPayload = {}): JWTPayload => ({
  sub: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'ana@empresa.com', is_anonymous: false, ...over,
})
const sign = (c: JWTPayload) =>
  new SignJWT(c).setProtectedHeader({ alg: 'ES256', kid: KID }).setIssuedAt().setExpirationTime('10m').sign(keys.privateKey)

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

const SETTINGS = { privacy_email: 'privacidad@prueba.example', response_days: 15, settings_version: 3 }

let quotaRpc: () => Response = () => json(true)
let settingsRow: Record<string, unknown> | null = SETTINGS
const inserted: Array<Record<string, unknown>> = []
const outbox: Array<Record<string, unknown>> = []
let caseSeq = 0

const fake = Deno.serve({ port: 0, onListen: () => {} }, async (req) => {
  const { pathname } = new URL(req.url)
  const text = req.method === 'GET' || req.method === 'DELETE' ? '' : await req.text()
  const single = (req.headers.get('accept') ?? '').includes('vnd.pgrst.object')
  const row = (obj: unknown) => (single ? json(obj) : json(obj === null ? [] : [obj]))

  if (pathname === '/auth/v1/.well-known/jwks.json') return json(jwks)
  if (pathname === '/rest/v1/rpc/check_rate_limit') return quotaRpc()
  if (pathname === '/rest/v1/privacy_settings_current') return row(settingsRow)
  if (pathname === '/rest/v1/rpc/next_case_number') {
    caseSeq += 1
    return json(`CD-2026-${String(caseSeq).padStart(6, '0')}`)
  }
  if (pathname === '/rest/v1/data_subject_requests' && req.method === 'POST') {
    const body = JSON.parse(text)
    inserted.push(body)
    return json({ id: body.id, case_number: body.case_number }, 201)
  }
  // Transporte no configurado por defecto: ambos avisos quedan en email_outbox (REQ-21f), sin
  // necesidad de simular un envío real por Resend/SMTP para probar la capa HTTP de index.ts.
  if (pathname === '/rest/v1/email_transport_settings_current') return row(null)
  if (pathname === '/rest/v1/email_outbox' && req.method === 'POST') {
    outbox.push(JSON.parse(text))
    return new Response('', { status: 201 })
  }
  return new Response(req.method === 'GET' ? '[]' : '', { status: req.method === 'POST' ? 201 : 200, headers: { 'Content-Type': 'application/json' } })
})

Deno.env.set('SUPABASE_URL', `http://127.0.0.1:${(fake.addr as Deno.NetAddr).port}`)
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key')
Deno.env.set('SECURITY_EVENTS_HMAC_KEY', randomKeyB64())
Deno.env.set('LOOKUP_HMAC_KEY_B64', randomKeyB64())
Deno.env.set('PII_ENCRYPTION_KEY_B64', randomKeyB64())
Deno.env.set('PII_KEY_VERSION', '1')
Deno.env.set('ADMIN_PANEL_URL', 'https://panel.prueba.example')

await import('./index.ts')

async function call(body: Record<string, unknown> | undefined, token?: string, xff: string | null = '203.0.113.9') {
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      return await fetch('http://127.0.0.1:8000/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(xff ? { 'x-forwarded-for': xff } : {}),
          'user-agent': 'PruebaUA/1.0',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      await new Promise((r) => setTimeout(r, 100)) // la función todavía está arrancando
    }
  }
  throw new Error('la función no arrancó')
}

const reset = () => {
  quotaRpc = () => json(true)
  settingsRow = SETTINGS
  inserted.length = 0
  outbox.length = 0
}
const opts = { sanitizeOps: false, sanitizeResources: false }

Deno.test({
  name: 'feliz: crea el caso, encola los dos avisos (sin transporte configurado) y responde 201',
  ...opts,
  async fn() {
    reset()
    const res = await call({ request_type: 'baja' }, await sign(claims()))
    assertEquals(res.status, 201)
    const payload = await res.json()
    assert(typeof payload.case_number === 'string' && payload.case_number.length > 0)
    assert(typeof payload.due_at === 'string')
    assertEquals(inserted.length, 1)
    assertEquals(inserted[0].request_type, 'baja')
    assertEquals(inserted[0].channel, 'app')
    assertEquals(inserted[0].user_id, USER_ID)
    assertEquals(outbox.length, 2)
    assertEquals(outbox.map((o) => o.reference_table).sort(), ['dsr_ack', 'dsr_delegate_notice'])
  },
})

Deno.test({
  name: 'sin token → 401 missing_token (mapeo de AuthError), nada escrito',
  ...opts,
  async fn() {
    reset()
    const res = await call({ request_type: 'baja' })
    assertEquals([res.status, (await res.json()).error], [401, 'missing_token'])
    assertEquals(inserted.length, 0)
  },
})

Deno.test({
  name: 'sesión anónima → 403 anonymous_session (mapeo de AuthError)',
  ...opts,
  async fn() {
    reset()
    const res = await call({ request_type: 'baja' }, await sign(claims({ is_anonymous: true })))
    assertEquals([res.status, (await res.json()).error], [403, 'anonymous_session'])
    assertEquals(inserted.length, 0)
  },
})

Deno.test({
  name: 'request_type fuera del enum → 400 invalid_input, nada escrito',
  ...opts,
  async fn() {
    reset()
    const res = await call({ request_type: 'no_existe' }, await sign(claims()))
    assertEquals([res.status, (await res.json()).error], [400, 'invalid_input'])
    assertEquals(inserted.length, 0)
  },
})

Deno.test({
  name: 'tipo de dato equivocado en el body → 400 invalid_input antes de tocar la cuota (SEC-08)',
  ...opts,
  async fn() {
    reset()
    let quotaCalled = false
    quotaRpc = () => { quotaCalled = true; return json(true) }
    const res = await call({ request_type: 123 }, await sign(claims()))
    assertEquals([res.status, (await res.json()).error], [400, 'invalid_input'])
    assertEquals(quotaCalled, false)
  },
})

Deno.test({
  name: 'cuota agotada → 429 rate_limited, nada escrito',
  ...opts,
  async fn() {
    reset()
    quotaRpc = () => json(false)
    const res = await call({ request_type: 'baja' }, await sign(claims()))
    assertEquals([res.status, (await res.json()).error], [429, 'rate_limited'])
    assertEquals(inserted.length, 0)
  },
})

Deno.test({
  name: 'cuota no disponible → 503 RATE_LIMIT_UNAVAILABLE fail-closed (SEC-07), nada escrito',
  ...opts,
  async fn() {
    reset()
    quotaRpc = () => new Response('boom', { status: 500 })
    const res = await call({ request_type: 'baja' }, await sign(claims()))
    assertEquals([res.status, (await res.json()).error], [503, 'RATE_LIMIT_UNAVAILABLE'])
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
    const res = await call({ request_type: 'baja' }, await sign(claims()), 'no-es-una-ip')
    assertEquals([res.status, (await res.json()).error], [400, 'missing_client_ip'])
    assertEquals(inserted.length, 0)
  },
})

Deno.test({
  name: 'sin aviso vigente/settings → 503 settings_unavailable (mapeo de DsrError), nada escrito',
  ...opts,
  async fn() {
    reset()
    settingsRow = null
    const res = await call({ request_type: 'baja' }, await sign(claims()))
    assertEquals([res.status, (await res.json()).error], [503, 'settings_unavailable'])
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
