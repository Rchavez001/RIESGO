// Run: deno test --allow-env --allow-net supabase/functions/secure-register-user/index_test.ts
// Starts the REAL function (it listens on :8000 when imported) against a fake Supabase that records
// every request it receives, so "nothing was created" is checked against actual traffic.
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'

function randomKeyB64() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
}

const received: string[] = []
let quotaRpc: () => Response = () => new Response(JSON.stringify({ message: 'connection refused' }), { status: 500 })

const fake = Deno.serve({ port: 0, onListen: () => {} }, (req) => {
  const { pathname } = new URL(req.url)
  received.push(`${req.method} ${pathname}`)
  if (pathname === '/rest/v1/rpc/check_rate_limit') return quotaRpc()
  return new Response('[]', { status: req.method === 'POST' ? 201 : 200, headers: { 'Content-Type': 'application/json' } })
})

Deno.env.set('SUPABASE_URL', `http://127.0.0.1:${(fake.addr as Deno.NetAddr).port}`)
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key')
Deno.env.set('SECURITY_EVENTS_HMAC_KEY', randomKeyB64())
Deno.env.set('LOOKUP_HMAC_KEY_B64', randomKeyB64())
Deno.env.set('PII_ENCRYPTION_KEY_B64', randomKeyB64())

await import('./index.ts')

const body = {
  email: 'ana@empresa.com', password: 'MiClaveSegura1', full_name: 'Ana Pérez', business_type: 'comerciante',
  consent_notice: { document_id: 'd', rendered_sha256: 'h', settings_version: 1, decisions: [] }, age_gate: true,
}

async function register() {
  for (let attempt = 0; attempt < 20; attempt++) {
    try {
      return await fetch('http://127.0.0.1:8000/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '203.0.113.9' },
        body: JSON.stringify(body),
      })
    } catch {
      await new Promise((r) => setTimeout(r, 100)) // the function is still starting to listen
    }
  }
  throw new Error('la función no arrancó')
}

const CREATES_SOMETHING = /\/auth\/v1\/admin\/users|POST \/rest\/v1\/(users|consent_records)|PATCH \/rest\/v1\/users|DELETE /

Deno.test({
  name: 'la RPC de cuota falla → 503 RATE_LIMIT_UNAVAILABLE y no se crea usuario ni evidencia',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    received.length = 0
    quotaRpc = () => new Response(JSON.stringify({ message: 'connection refused' }), { status: 500 })
    const res = await register()
    const json = await res.json()
    assertEquals(res.status, 503)
    assertEquals(json.error, 'RATE_LIMIT_UNAVAILABLE')
    assertEquals(json.message, 'El registro no está disponible en este momento, intenta en unos minutos')
    assertEquals(received.filter((r) => CREATES_SOMETHING.test(r)), [])
    // Se detuvo antes de validar nada contra la base: solo la cuota y el evento de seguridad.
    assertEquals(received.filter((r) => !/rpc\/check_rate_limit|POST \/rest\/v1\/security_events/.test(r)), [])
  },
})

Deno.test({
  name: 'un exceso real de cuota sigue siendo 429, no 503',
  sanitizeOps: false, sanitizeResources: false,
  async fn() {
    received.length = 0
    quotaRpc = () => new Response('false', { status: 200, headers: { 'Content-Type': 'application/json' } })
    const res = await register()
    await res.body?.cancel()
    assertEquals(res.status, 429)
    assertEquals(received.filter((r) => CREATES_SOMETHING.test(r)), [])
  },
})
