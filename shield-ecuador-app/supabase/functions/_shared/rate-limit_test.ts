// Run: deno test --allow-env --allow-net supabase/functions/_shared/rate-limit_test.ts
// (--allow-net only to fetch the supabase-js import; no request is ever sent to Supabase: the RPC is injected.)
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'

function randomKeyB64() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
}

// The modules read these at import time, so they are set before the dynamic import.
Deno.env.set('SUPABASE_URL', 'http://127.0.0.1:1')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-key')
Deno.env.set('SECURITY_EVENTS_HMAC_KEY', randomKeyB64())
Deno.env.set('LOOKUP_HMAC_KEY_B64', randomKeyB64())

const { checkRateLimit } = await import('./rate-limit.ts')
type Rpc = Parameters<typeof checkRateLimit>[0]['rpc']

const IP = '203.0.113.9'
const EMAIL = 'ana@empresa.com'
const reqWithIp = () => new Request('http://localhost/fn', { headers: { 'x-forwarded-for': IP } })

function recordingRpc(answer: () => { data: unknown; error: unknown } | Promise<never>) {
  const keys: string[] = []
  const rpc: Rpc = (_name, args) => {
    keys.push(String(args.p_bucket_key))
    return Promise.resolve(answer()) as ReturnType<NonNullable<Rpc>>
  }
  return { rpc, keys }
}

const ok = () => ({ data: true, error: null })

Deno.test('failClosed: si la RPC de cuota devuelve error, la petición se rechaza (unavailable)', async () => {
  const { rpc } = recordingRpc(() => ({ data: null, error: { message: 'connection refused' } }))
  assertEquals(await checkRateLimit({ req: reqWithIp(), endpoint: 'submit-consent', email: EMAIL, failClosed: true, rpc }),
    { allowed: false, reason: 'unavailable' })
})

Deno.test('failClosed: si la RPC de cuota lanza una excepción, la petición se rechaza', async () => {
  const rpc: Rpc = () => Promise.reject(new Error('boom'))
  assertEquals(await checkRateLimit({ req: reqWithIp(), endpoint: 'submit-consent', email: EMAIL, failClosed: true, rpc }),
    { allowed: false, reason: 'unavailable' })
})

Deno.test('failClosed: una respuesta que no es un `true` explícito tampoco se acepta', async () => {
  const { rpc } = recordingRpc(() => ({ data: null, error: null }))
  assertEquals(await checkRateLimit({ req: reqWithIp(), endpoint: 'submit-consent', failClosed: true, rpc }),
    { allowed: false, reason: 'unavailable' })
})

Deno.test('failClosed: sin IP de origen se rechaza y ni siquiera se consulta la cuota', async () => {
  const { rpc, keys } = recordingRpc(ok)
  const res = await checkRateLimit({ req: new Request('http://localhost/fn'), endpoint: 'submit-consent', failClosed: true, rpc })
  assertEquals(res, { allowed: false, reason: 'unavailable' })
  assertEquals(keys.length, 0)
})

Deno.test('failClosed: sin la clave HMAC del correo se rechaza (no cae a usar el correo en claro)', async () => {
  const saved = Deno.env.get('LOOKUP_HMAC_KEY_B64')!
  Deno.env.delete('LOOKUP_HMAC_KEY_B64')
  try {
    const { rpc, keys } = recordingRpc(ok)
    const res = await checkRateLimit({ req: reqWithIp(), endpoint: 'submit-consent', email: EMAIL, failClosed: true, rpc })
    assertEquals(res, { allowed: false, reason: 'unavailable' })
    assertEquals(keys.some((k) => k.includes(EMAIL)), false)
  } finally {
    Deno.env.set('LOOKUP_HMAC_KEY_B64', saved)
  }
})

Deno.test('failClosed: un exceso real sigue siendo 429 (reason ip), no "unavailable"', async () => {
  const { rpc } = recordingRpc(() => ({ data: false, error: null }))
  assertEquals(await checkRateLimit({ req: reqWithIp(), endpoint: 'submit-consent', failClosed: true, rpc }),
    { allowed: false, reason: 'ip' })
})

Deno.test('failClosed: con cuota disponible se permite y las claves no llevan ni IP ni correo en claro', async () => {
  const { rpc, keys } = recordingRpc(ok)
  assertEquals(await checkRateLimit({ req: reqWithIp(), endpoint: 'submit-consent', email: EMAIL, failClosed: true, rpc }), { allowed: true })
  assertEquals(keys.length, 2)
  for (const key of keys) {
    assertEquals(key.includes(IP), false)
    assertEquals(key.includes(EMAIL), false)
    assertEquals(key.includes('empresa.com'), false)
  }
})

Deno.test('modo por defecto (llamadores existentes): un error de la RPC sigue dejando pasar — fail-open intacto', async () => {
  const { rpc } = recordingRpc(() => ({ data: null, error: { message: 'connection refused' } }))
  assertEquals(await checkRateLimit({ req: reqWithIp(), endpoint: 'secure-register-user', email: EMAIL, rpc }), { allowed: true })
})

Deno.test('modo por defecto: la clave del correo es la de siempre, para no reiniciar los contadores vigentes', async () => {
  const { rpc, keys } = recordingRpc(ok)
  await checkRateLimit({ req: reqWithIp(), endpoint: 'secure-register-user', email: ` ${EMAIL.toUpperCase()} `, rpc })
  assertEquals(keys.at(-1), `secure-register-user:email:${EMAIL}`)
})
