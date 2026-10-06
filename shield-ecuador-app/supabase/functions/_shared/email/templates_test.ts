// Run: deno test --allow-env supabase/functions/_shared/email/templates_test.ts
import { assertEquals, assertStrictEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import {
  buildDelegateNoticeEmail,
  buildEmailVerificationCodeEmail,
  buildSubjectAcknowledgementEmail,
  type DelegateNoticeInput,
} from './templates.ts'

const delegateInput: DelegateNoticeInput = {
  to: 'privacidad@example.test',
  caseNumber: 'CD-2026-000123',
  requestType: 'eliminacion',
  dueAt: '2026-11-01T00:00:00Z',
  panelUrl: 'https://panel.example.test/consentimiento/solicitudes/CD-2026-000123',
}

Deno.test('buildDelegateNoticeEmail: asunto de una sola línea con el número de caso', () => {
  const message = buildDelegateNoticeEmail(delegateInput)
  assertEquals(message.subject.includes('\n'), false)
  assertEquals(message.subject.includes('\r'), false)
  assertEquals(message.subject.includes('CD-2026-000123'), true)
})

Deno.test('buildDelegateNoticeEmail: nunca lleva correo ni IP del titular, aunque el llamador intente colarlos', () => {
  const titularEmail = 'titular-secreto@example.test'
  const titularIp = '192.0.2.10'
  // DelegateNoticeInput no declara estos campos — simula un llamador futuro que amplíe el objeto sin
  // darse cuenta (D-06): el renderer solo debe leer los campos que sí conoce.
  const poisoned = { ...delegateInput, titularEmail, titularIp } as DelegateNoticeInput
  const message = buildDelegateNoticeEmail(poisoned)
  assertEquals(message.html.includes(titularEmail), false)
  assertEquals(message.html.includes(titularIp), false)
  assertEquals(message.subject.includes(titularEmail), false)
})

Deno.test('buildDelegateNoticeEmail: incluye tipo traducido y fecha límite en zona de Guayaquil', () => {
  const message = buildDelegateNoticeEmail(delegateInput)
  assertEquals(message.html.includes('Eliminación de datos'), true)
  assertEquals(message.html.includes('2026-10-31') || message.html.includes('2026-11-01'), true)
  assertEquals(message.to, delegateInput.to)
})

Deno.test('buildSubjectAcknowledgementEmail: asunto de una sola línea, incluye caso y fecha límite', () => {
  const message = buildSubjectAcknowledgementEmail({
    to: 'titular@example.test',
    caseNumber: 'CD-2026-000123',
    requestType: 'acceso',
    dueAt: '2026-11-01T00:00:00Z',
  })
  assertEquals(message.subject.includes('\n'), false)
  assertEquals(message.html.includes('CD-2026-000123'), true)
  assertEquals(message.html.includes('Acceso a datos personales'), true)
})

Deno.test('buildEmailVerificationCodeEmail: asunto de una sola línea, el código aparece en el html', () => {
  const message = buildEmailVerificationCodeEmail({ to: 'admin@example.test', code: '482913' })
  assertEquals(message.subject.includes('\n'), false)
  assertEquals(message.html.includes('482913'), true)
  assertStrictEquals(message.to, 'admin@example.test')
})
