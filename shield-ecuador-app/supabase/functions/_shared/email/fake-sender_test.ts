// Run: deno test --allow-env supabase/functions/_shared/email/fake-sender_test.ts
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { FakeEmailSender } from './fake-sender.ts'

const message = { to: 'titular@example.test', subject: 'asunto', html: '<p>hola</p>' }

Deno.test('envío normal: se registra y responde ok', async () => {
  const sender = new FakeEmailSender()
  const result = await sender.send(message)
  assertEquals(result, { ok: true })
  assertEquals(sender.sent, [message])
})

Deno.test('failNextWith: el siguiente envío falla con ese código y no queda registrado', async () => {
  const sender = new FakeEmailSender()
  sender.failNextWith('smtp_timeout')
  const result = await sender.send(message)
  assertEquals(result, { ok: false, errorCode: 'smtp_timeout' })
  assertEquals(sender.sent.length, 0)
})

Deno.test('failNextWith solo afecta al envío siguiente, no a los demás', async () => {
  const sender = new FakeEmailSender()
  sender.failNextWith('smtp_timeout')
  await sender.send(message)
  const second = await sender.send(message)
  assertEquals(second, { ok: true })
  assertEquals(sender.sent.length, 1)
})
