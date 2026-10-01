// Run: deno test --allow-env --allow-net supabase/functions/submit-consent/index_test.ts
// Starts the REAL function (it listens on :8000 when imported) against a fake Supabase (REST + the
// Auth JWKS endpoint requireUser verifies against), so "what got written" is checked against actual
// traffic, not against the shared helpers in isolation.
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { exportJWK, generateKeyPair, SignJWT, type JWTPayload } from 'https://deno.land/x/jose@v5.9.6/index.ts'
import { renderConsent, sha256Hex } from '../_shared/consent-render.ts'

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

function notice(requiresReconsent: boolean) {
  return {
    id: 'doc-2', version: '1.1', title: 'Aviso de prueba', requires_reconsent: requiresReconsent, published_at: '2026-09-30T15:00:00Z',
    purposes: [
      { code: 'registro_aprendizaje', label: 'Registro y aprendizaje', required: true },
      { code: 'novedades', label: 'Novedades', required: false },
    ],
    content_md: 'Responsable: {{responsable_nombre}}. Escribe a {{correo_privacidad}}. Vigente desde {{fecha_vigencia}}.',
  }
}
const SETTINGS = {
  settings_version: 3, controller_name: 'Club de Prueba', controller_address: null, controller_phone: null,
  privacy_email: 'privacidad@prueba.example', dpo_name: null, dpo_contact: null, privacy_policy_url: null,
  unsubscribe_subject: 'Baja - Prueba', response_days: 15, ip_retention_days: 730,
}

let quotaRpc: () => Response = () => json(true)
let documentRow: unknown = notice(true)
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

async function call(body: Record<string, unknown> | undefined, token?: string, xff = '203.0.113.9') {
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      return await fetch('http://127.0.0.1:8000/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-forwarded-for': xff,
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

async function validBody(over: Partial<{ document_id: string; settings_version: number; rendered_sha256: string }> = {}, decisions: Array<{ purpose_code: string; decision: string }> = [{ purpose_code: 'registro_aprendizaje', decision: 'granted' }]) {
  const doc = notice(true)
  const renderedSha256 = await sha256Hex(renderConsent(doc.content_md, SETTINGS, doc).text)
  return {
    document_id: doc.id, settings_version: SETTINGS.settings_version, rendered_sha256: renderedSha256,
    decisions, ...over,
  }
}

const reset = () => { quotaRpc = () => json(true); documentRow = notice(true); inserted.length = 0 }
const opts = { sanitizeOps: false, sanitizeResources: false }

Deno.test({
  name: 'aceptar la finalidad obligatoria y una opcional: 2 filas, channel=reconsentimiento',
  ...opts,
  async fn() {
    reset()
    const body = await validBody({}, [
      { purpose_code: 'registro_aprendizaje', decision: 'granted' },
      { purpose_code: 'novedades', decision: 'granted' },
    ])
    const res = await call(body, await sign(claims()))
    assertEquals(res.status, 200)
    assertEquals(await res.json(), { document_id: 'doc-2', version: '1.1' })
    assertEquals(inserted.length, 2)
    assertEquals(inserted.every((r) => r.channel === 'reconsentimiento' && r.user_id === USER_ID), true)
    assertEquals(inserted.find((r) => r.purpose_code === 'registro_aprendizaje')?.decision, 'granted')
    assertEquals(inserted.find((r) => r.purpose_code === 'novedades')?.decision, 'granted')
  },
})

Deno.test({
  name: 'opcional no incluida en decisions queda denied por omisión',
  ...opts,
  async fn() {
    reset()
    const body = await validBody({}, [{ purpose_code: 'registro_aprendizaje', decision: 'granted' }])
    const res = await call(body, await sign(claims()))
    assertEquals(res.status, 200)
    assertEquals(inserted.find((r) => r.purpose_code === 'novedades')?.decision, 'denied')
  },
})

Deno.test({
  name: 'documento vigente sin requires_reconsent → 409 reconsent_not_required, nada escrito',
  ...opts,
  async fn() {
    reset()
    documentRow = notice(false)
    const body = await validBody()
    const res = await call(body, await sign(claims()))
    assertEquals([res.status, (await res.json()).error], [409, 'reconsent_not_required'])
    assertEquals(inserted.length, 0)
  },
})

Deno.test({
  name: 'huella de un aviso distinto al vigente → 409 notice_changed, nada escrito',
  ...opts,
  async fn() {
    reset()
    const body = await validBody({ rendered_sha256: 'sha256-de-otra-version' })
    const res = await call(body, await sign(claims()))
    assertEquals([res.status, (await res.json()).error], [409, 'notice_changed'])
    assertEquals(inserted.length, 0)
  },
})

Deno.test({
  name: 'no aceptar la finalidad obligatoria → 400 missing_required_consent, nada escrito',
  ...opts,
  async fn() {
    reset()
    const body = await validBody({}, [{ purpose_code: 'novedades', decision: 'granted' }])
    const res = await call(body, await sign(claims()))
    assertEquals([res.status, (await res.json()).error], [400, 'missing_required_consent'])
    assertEquals(inserted.length, 0)
  },
})

Deno.test({
  name: 'sin token → 401 missing_token, nada escrito',
  ...opts,
  async fn() {
    reset()
    const res = await call(await validBody())
    assertEquals([res.status, (await res.json()).error], [401, 'missing_token'])
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
    const res = await call({ document_id: 123, settings_version: 'tres', rendered_sha256: 'x' }, await sign(claims()))
    assertEquals([res.status, (await res.json()).error], [400, 'invalid_input'])
    assertEquals(quotaCalled, false)
  },
})

Deno.test({
  name: 'cuota no disponible → 503 RATE_LIMIT_UNAVAILABLE fail-closed (SEC-07), nada escrito',
  ...opts,
  async fn() {
    reset()
    quotaRpc = () => new Response('boom', { status: 500 })
    const res = await call(await validBody(), await sign(claims()))
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
