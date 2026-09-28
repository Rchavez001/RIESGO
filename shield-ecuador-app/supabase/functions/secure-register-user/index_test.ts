// Run: deno test --allow-env --allow-net supabase/functions/secure-register-user/index_test.ts
// Starts the REAL function (it listens on :8000 when imported) against a fake Supabase that records
// every request it receives, so "nothing was created" and "what was written" are checked against
// actual traffic. It is a fake: it does not enforce Postgres constraints (those are covered by the
// migration tests) — it proves the function's own logic, ordering and compensation.
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { renderConsentMarkers, sha256Hex } from '../_shared/consent-render.ts'
import { decryptConsentColumn } from '../_shared/consent-evidence.ts'

function randomKeyB64() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
}

type Call = { method: string; path: string; body: unknown }
const calls: Call[] = []
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

const NOTICE = {
  id: 'doc-1', version: '1.0', purposes: [
    { code: 'registro_aprendizaje', label: 'Registro y aprendizaje', required: true },
    { code: 'novedades', label: 'Novedades', required: false },
  ],
  content_md: 'Responsable: {{controller_name}}. Escribe a {{privacy_email}}.',
}
const SETTINGS = {
  settings_version: 3, controller_name: 'Club de Prueba', controller_address: null, controller_phone: null,
  privacy_email: 'privacidad@prueba.example', dpo_name: null, dpo_contact: null, privacy_policy_url: null,
  response_days: 15, response_day_type: 'calendario',
}
const NEW_USER_ID = '99999999-9999-9999-9999-999999999999'

let quotaRpc: () => Response = () => json(true)
let consentInsert: () => Response = () => new Response('', { status: 201 })

const fake = Deno.serve({ port: 0, onListen: () => {} }, async (req) => {
  const { pathname } = new URL(req.url)
  const text = req.method === 'GET' || req.method === 'DELETE' ? '' : await req.text()
  calls.push({ method: req.method, path: pathname, body: text ? JSON.parse(text) : null })
  const single = (req.headers.get('accept') ?? '').includes('vnd.pgrst.object')
  const row = (obj: unknown) => (single ? json(obj) : json(obj === null ? [] : [obj]))

  if (pathname === '/rest/v1/rpc/check_rate_limit') return quotaRpc()
  if (pathname === '/rest/v1/consent_documents') return row(NOTICE)
  if (pathname === '/rest/v1/privacy_settings_current') return row(SETTINGS)
  if (pathname === '/rest/v1/business_sectors') return row({ code: 'comerciante', industry: 'Comercio y Ventas' })
  if (pathname === '/rest/v1/users' && req.method === 'GET') return row(null) // no existing account
  if (pathname === '/auth/v1/admin/users' && req.method === 'POST') return json({ id: NEW_USER_ID, email: 'ana@empresa.com', aud: 'authenticated' })
  if (pathname === '/rest/v1/consent_records' && req.method === 'POST') return consentInsert()
  return new Response(req.method === 'GET' ? '[]' : '', { status: req.method === 'POST' ? 201 : 200, headers: { 'Content-Type': 'application/json' } })
})

Deno.env.set('SUPABASE_URL', `http://127.0.0.1:${(fake.addr as Deno.NetAddr).port}`)
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key')
Deno.env.set('SECURITY_EVENTS_HMAC_KEY', randomKeyB64())
Deno.env.set('LOOKUP_HMAC_KEY_B64', randomKeyB64())
Deno.env.set('PII_ENCRYPTION_KEY_B64', randomKeyB64())

await import('./index.ts')

async function post(body: Record<string, unknown>, xff = '203.0.113.9') {
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      return await fetch('http://127.0.0.1:8000/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': xff, 'user-agent': 'PruebaUA/1.0' },
        body: JSON.stringify(body),
      })
    } catch {
      await new Promise((r) => setTimeout(r, 100)) // the function is still starting to listen
    }
  }
  throw new Error('la función no arrancó')
}

async function validBody(overrides: Record<string, unknown> = {}) {
  const renderedSha256 = await sha256Hex(renderConsentMarkers(NOTICE.content_md, SETTINGS))
  return {
    email: 'ana@empresa.com', password: 'MiClaveSegura1', full_name: 'Ana Pérez', business_type: 'comerciante',
    consent_notice: {
      document_id: 'doc-1', rendered_sha256: renderedSha256, settings_version: 3,
      decisions: [{ purpose_code: 'registro_aprendizaje', decision: 'granted' }, { purpose_code: 'novedades', decision: 'denied' }],
    },
    age_gate: true,
    ...overrides,
  }
}

const CREATES_SOMETHING = /\/auth\/v1\/admin\/users|POST \/rest\/v1\/(users|consent_records)|PATCH \/rest\/v1\/users|DELETE /
const sent = (predicate: (c: Call) => boolean) => calls.filter(predicate)
const reset = () => {
  calls.length = 0
  quotaRpc = () => json(true)
  consentInsert = () => new Response('', { status: 201 })
}
const opts = { sanitizeOps: false, sanitizeResources: false }

Deno.test({
  name: 'la RPC de cuota falla → 503 RATE_LIMIT_UNAVAILABLE y no se crea usuario ni evidencia', ...opts,
  async fn() {
    reset()
    quotaRpc = () => json({ message: 'connection refused' }, 500)
    const res = await post(await validBody())
    const body = await res.json()
    assertEquals(res.status, 503)
    assertEquals(body.error, 'RATE_LIMIT_UNAVAILABLE')
    assertEquals(body.message, 'El registro no está disponible en este momento, intenta en unos minutos')
    assertEquals(sent((c) => CREATES_SOMETHING.test(`${c.method} ${c.path}`)), [])
    // Se detuvo antes de validar nada contra la base: solo la cuota y el evento de seguridad.
    assertEquals(sent((c) => !/rpc\/check_rate_limit|\/rest\/v1\/security_events/.test(c.path)), [])
  },
})

Deno.test({
  name: 'un exceso real de cuota sigue siendo 429, no 503', ...opts,
  async fn() {
    reset()
    quotaRpc = () => json(false)
    const res = await post(await validBody())
    await res.body?.cancel()
    assertEquals(res.status, 429)
    assertEquals(sent((c) => CREATES_SOMETHING.test(`${c.method} ${c.path}`)), [])
  },
})

Deno.test({
  name: 'camino feliz: una fila de evidencia por finalidad, IP y user-agent con AAD, legibles con allowLegacy:false', ...opts,
  async fn() {
    reset()
    const res = await post(await validBody({ ip: '1.2.3.4' })) // la IP que manda el cliente debe ignorarse
    assertEquals(res.status, 200)
    assertEquals((await res.json()).user_id, NEW_USER_ID)

    const insert = sent((c) => c.method === 'POST' && c.path === '/rest/v1/consent_records')
    assertEquals(insert.length, 1)
    const rows = insert[0].body as Array<Record<string, any>>
    assertEquals(rows.map((r) => [r.purpose_code, r.decision]), [['registro_aprendizaje', 'granted'], ['novedades', 'denied']])

    const expectedSha = await sha256Hex(renderConsentMarkers(NOTICE.content_md, SETTINGS))
    for (const r of rows) {
      assertEquals(r.user_id, NEW_USER_ID)
      assertEquals(r.document_version, '1.0')
      assertEquals(r.settings_version, 3)
      assertEquals(r.channel, 'registro')
      assertEquals(r.rendered_sha256, expectedSha)
      assertEquals(r.ip_ciphertext.aad, true) // escrito CON AAD
      assertEquals(r.ua_ciphertext.aad, true)
      assertEquals(typeof r.user_ref_hmac, 'string')
      // Lo lee el lector real, con allowLegacy:false, usando solo lo que quedó en la fila.
      assertEquals(await decryptConsentColumn(r as never, 'ip_ciphertext'), '203.0.113.9')
      assertEquals(await decryptConsentColumn(r as never, 'ua_ciphertext'), 'PruebaUA/1.0')
    }
    assertEquals(sent((c) => c.path === '/rest/v1/security_events' && JSON.stringify(c.body).includes('consent_ip_spoof_attempt')).length, 1)
    assertEquals(sent((c) => c.method === 'DELETE'), [])
  },
})

Deno.test({
  name: 'X-Forwarded-For falsificado por el cliente: la IP de la evidencia es la que añadió el proxy (REQ-05/T03)', ...opts,
  async fn() {
    reset()
    const res = await post(await validBody(), '9.9.9.9, 8.8.8.8, 203.0.113.9')
    assertEquals(res.status, 200)
    const rows = sent((c) => c.method === 'POST' && c.path === '/rest/v1/consent_records')[0].body as Array<Record<string, any>>
    assertEquals(await decryptConsentColumn(rows[0] as never, 'ip_ciphertext'), '203.0.113.9')
  },
})

Deno.test({
  name: 'si falla la inserción de la evidencia se compensa: se borran el perfil y el usuario (REQ-07)', ...opts,
  async fn() {
    reset()
    consentInsert = () => json({ message: 'insert failed' }, 500)
    const res = await post(await validBody())
    await res.body?.cancel()
    assertEquals(res.status, 400)
    assertEquals(sent((c) => c.method === 'DELETE' && c.path === '/rest/v1/users').length, 1)
    assertEquals(sent((c) => c.method === 'DELETE' && c.path === `/auth/v1/admin/users/${NEW_USER_ID}`).length, 1)
  },
})

Deno.test({
  name: 'aviso cambiado (huella distinta) → 409 notice_changed sin crear nada', ...opts,
  async fn() {
    reset()
    const stale = await validBody()
    ;(stale.consent_notice as Record<string, unknown>).rendered_sha256 = 'huella-de-un-texto-anterior'
    const res = await post(stale)
    assertEquals(res.status, 409)
    assertEquals((await res.json()).error, 'notice_changed')
    assertEquals(sent((c) => CREATES_SOMETHING.test(`${c.method} ${c.path}`)), [])
  },
})

Deno.test({
  name: 'sin confirmar los 15 años → 403 y no se crea nada', ...opts,
  async fn() {
    reset()
    const res = await post(await validBody({ age_gate: false }))
    assertEquals(res.status, 403)
    assertEquals((await res.json()).error, 'age_gate_failed')
    assertEquals(sent((c) => CREATES_SOMETHING.test(`${c.method} ${c.path}`)), [])
  },
})

Deno.test({
  name: 'sin aceptar la finalidad obligatoria → 400 y no se crea nada', ...opts,
  async fn() {
    reset()
    const body = await validBody()
    ;(body.consent_notice as { decisions: unknown }).decisions = [{ purpose_code: 'novedades', decision: 'granted' }]
    const res = await post(body)
    await res.body?.cancel()
    assertEquals(res.status, 400)
    assertEquals(sent((c) => CREATES_SOMETHING.test(`${c.method} ${c.path}`)), [])
  },
})
