// Run: deno test --allow-env supabase/functions/_shared/email/resend-sender_test.ts
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { getResendApiKey, ResendSender } from './resend-sender.ts'

// Minimal stand-in for the two calls getResendApiKey makes (`app_secrets` lookup + `get_decrypted_secret`
// RPC) — same chain championship-draw-round1/check-security-alerts already use against the real client.
function fakeDb(opts: { secretRow?: { secret_id: string } | null; apiKey?: string | null; rpcError?: boolean }): SupabaseClient {
  return {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: opts.secretRow ?? null, error: null }),
        }),
      }),
    }),
    rpc: async () => opts.rpcError
      ? { data: null, error: new Error('vault_error') }
      : { data: opts.apiKey ?? null, error: null },
  } as unknown as SupabaseClient
}

Deno.test('getResendApiKey: sin fila en app_secrets -> null', async () => {
  assertEquals(await getResendApiKey(fakeDb({ secretRow: null })), null)
})

Deno.test('getResendApiKey: el RPC falla -> null, no se filtra el error', async () => {
  assertEquals(await getResendApiKey(fakeDb({ secretRow: { secret_id: 's1' }, rpcError: true })), null)
})

Deno.test('getResendApiKey: el RPC no devuelve clave -> null', async () => {
  assertEquals(await getResendApiKey(fakeDb({ secretRow: { secret_id: 's1' }, apiKey: null })), null)
})

Deno.test('getResendApiKey: camino feliz -> la clave', async () => {
  assertEquals(await getResendApiKey(fakeDb({ secretRow: { secret_id: 's1' }, apiKey: 're_abc123' })), 're_abc123')
})

const message = { to: 'titular@example.test', subject: 'asunto', html: '<p>hola</p>' }
const okOptions = { senderName: 'CiberDojo', senderEmail: 'avisos@example.test', getApiKey: async () => 're_abc123' }

Deno.test('send: sin clave de Resend -> resend_key_missing, sin llamar a fetch', async () => {
  let called = false
  const sender = new ResendSender({ ...okOptions, getApiKey: async () => null, fetchImpl: async () => { called = true; return new Response() } })
  const result = await sender.send(message)
  assertEquals(result, { ok: false, errorCode: 'resend_key_missing' })
  assertEquals(called, false)
})

Deno.test('send: fallo de red -> resend_network_error', async () => {
  const sender = new ResendSender({ ...okOptions, fetchImpl: async () => { throw new TypeError('network down') } })
  assertEquals(await sender.send(message), { ok: false, errorCode: 'resend_network_error' })
})

Deno.test('send: respuesta HTTP no ok -> resend_http_<status>', async () => {
  const sender = new ResendSender({ ...okOptions, fetchImpl: async () => new Response('nope', { status: 401 }) })
  assertEquals(await sender.send(message), { ok: false, errorCode: 'resend_http_401' })
})

Deno.test('send: camino feliz -> ok, con el remitente/asunto/html correctos y sin reply_to si no se dio', async () => {
  let capturedBody: Record<string, unknown> | null = null
  let capturedAuth: string | null = null
  const sender = new ResendSender({
    ...okOptions,
    fetchImpl: async (_url, init) => {
      capturedAuth = (init?.headers as Record<string, string>)?.Authorization ?? null
      capturedBody = JSON.parse(init?.body as string)
      return new Response('{}', { status: 200 })
    },
  })
  const result = await sender.send(message)
  assertEquals(result, { ok: true })
  assertEquals(capturedAuth, 'Bearer re_abc123')
  assertEquals(capturedBody, {
    from: 'CiberDojo <avisos@example.test>',
    to: [message.to],
    subject: message.subject,
    html: message.html,
  })
})

Deno.test('send: con replyTo, el body incluye reply_to', async () => {
  let capturedBody: Record<string, unknown> | null = null
  const sender = new ResendSender({
    ...okOptions,
    fetchImpl: async (_url, init) => { capturedBody = JSON.parse(init?.body as string); return new Response('{}', { status: 200 }) },
  })
  await sender.send({ ...message, replyTo: 'privacidad@example.test' })
  assertEquals((capturedBody as unknown as { reply_to: string }).reply_to, 'privacidad@example.test')
})
