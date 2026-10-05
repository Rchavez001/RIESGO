// Run: deno test --allow-env supabase/functions/_shared/email/smtp-sender_test.ts
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { SmtpSender } from './smtp-sender.ts'
import type { SmtpDeliverArgs, SmtpSenderOptions } from './smtp-sender.ts'

const message = { to: 'titular@example.test', subject: 'asunto', html: '<p>hola</p>' }

function baseOptions(overrides: Partial<SmtpSenderOptions> = {}): SmtpSenderOptions {
  return {
    host: 'smtp.example.test',
    port: 465,
    username: 'avisos@example.test',
    getPassword: async () => 's3cret',
    fromName: 'CiberDojo',
    fromEmail: 'avisos@example.test',
    resolveDns: async () => ['203.0.113.10'],
    ...overrides,
  }
}

Deno.test('send: puerto no permitido -> rechaza sin llamar a deliver', async () => {
  let called = false
  const sender = new SmtpSender({ ...baseOptions({ port: 587 }), deliver: async () => { called = true } })
  const result = await sender.send(message)
  assertEquals(result, { ok: false, errorCode: 'smtp_port_not_allowed' })
  assertEquals(called, false)
})

Deno.test('send: host resuelve a IP privada -> rechaza sin llamar a deliver', async () => {
  let called = false
  const sender = new SmtpSender({
    ...baseOptions({ resolveDns: async () => ['10.0.0.5'] }),
    deliver: async () => { called = true },
  })
  const result = await sender.send(message)
  assertEquals(result, { ok: false, errorCode: 'smtp_host_private' })
  assertEquals(called, false)
})

Deno.test('send: sin contraseña -> smtp_password_missing, sin llamar a deliver', async () => {
  let called = false
  const sender = new SmtpSender({ ...baseOptions({ getPassword: async () => null }), deliver: async () => { called = true } })
  const result = await sender.send(message)
  assertEquals(result, { ok: false, errorCode: 'smtp_password_missing', resolvedIp: '203.0.113.10' })
  assertEquals(called, false)
})

Deno.test('send: deliver lanza error -> smtp_send_failed, nunca el texto crudo (podría llevar la contraseña)', async () => {
  const sender = new SmtpSender({
    ...baseOptions(),
    deliver: async () => { throw new Error('535 Authentication failed for user avisos@example.test pass s3cret') },
  })
  const result = await sender.send(message)
  assertEquals(result, { ok: false, errorCode: 'smtp_send_failed', resolvedIp: '203.0.113.10' })
})

Deno.test('send: camino feliz -> deliver recibe host/puerto/credenciales/remitente/mensaje correctos', async () => {
  let captured: SmtpDeliverArgs | null = null
  const sender = new SmtpSender({
    ...baseOptions(),
    deliver: async (args) => { captured = args },
  })
  const result = await sender.send(message)
  assertEquals(result, { ok: true, resolvedIp: '203.0.113.10' })
  assertEquals(captured, {
    host: 'smtp.example.test',
    port: 465,
    username: 'avisos@example.test',
    password: 's3cret',
    fromName: 'CiberDojo',
    fromEmail: 'avisos@example.test',
    message,
  })
})

Deno.test('send: la IP validada (resolvedIp) viaja en el resultado para que el llamador la registre en bitácora (D-15)', async () => {
  const sender = new SmtpSender({
    ...baseOptions({ resolveDns: async () => ['198.51.100.7'] }),
    deliver: async () => {},
  })
  const result = await sender.send(message)
  assertEquals(result, { ok: true, resolvedIp: '198.51.100.7' })
})

Deno.test('send: target SSRF rechazado (puerto no permitido) -> no hay resolvedIp que registrar', async () => {
  const sender = new SmtpSender({ ...baseOptions({ port: 587 }), deliver: async () => {} })
  const result = await sender.send(message)
  assertEquals(result.resolvedIp, undefined)
})
