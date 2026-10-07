// Run: deno test --allow-env supabase/functions/request-data-subject-right/handler_test.ts
import { assert, assertEquals, assertNotEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { decryptDsrColumn } from '../_shared/consent-evidence.ts'
import { createDataSubjectRequest, DsrError, type CurrentSettings, type Deps, type EmailTransportRow, type NewDsrRow } from './handler.ts'
import type { EmailMessage, EmailSendResult } from '../_shared/email/types.ts'

Deno.env.set('PII_ENCRYPTION_KEY_B64', btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))))
Deno.env.set('PII_KEY_VERSION', '1')
Deno.env.set('LOOKUP_HMAC_KEY_B64', btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))))

const USER = { userId: '11111111-2222-4333-8444-555555555555', email: 'ana@empresa.com', jwt: 'x', claims: {} } as const
const NOW = new Date('2026-10-06T12:00:00.000Z')
const SETTINGS: CurrentSettings = { privacy_email: 'privacidad@prueba.example', response_days: 15, settings_version: 3 }
const TRANSPORT: EmailTransportRow = { mode: 'resend' }

interface Harness {
  deps: Deps
  rows: NewDsrRow[]
  outbox: { reference_table: string; reference_id: string }[]
  sent: EmailMessage[]
  settings: CurrentSettings | null
  transport: EmailTransportRow | null
  failSend: Set<'dsr_delegate_notice' | 'dsr_ack'> | ((message: EmailMessage) => boolean)
}

function makeDeps(overrides: Partial<Pick<Harness, 'settings' | 'transport'>> = {}): Harness {
  const rows: NewDsrRow[] = []
  const outbox: { reference_table: string; reference_id: string }[] = []
  const sent: EmailMessage[] = []
  const harness: Harness = {
    rows, outbox, sent,
    settings: overrides.settings !== undefined ? overrides.settings : SETTINGS,
    transport: overrides.transport === undefined ? TRANSPORT : overrides.transport,
    failSend: new Set(),
    deps: null as unknown as Deps,
  }
  let seq = 0
  harness.deps = {
    now: () => NOW,
    settings: { getCurrent: () => Promise.resolve(harness.settings) },
    dsr: {
      nextCaseNumber: () => { seq += 1; return Promise.resolve(`CD-2026-${String(seq).padStart(6, '0')}`) },
      insert: (row: NewDsrRow) => { rows.push(row); return Promise.resolve({ id: row.id, case_number: row.case_number }) },
    },
    emailTransport: { getCurrent: () => Promise.resolve(harness.transport) },
    email: {
      send: (_transport, message): Promise<EmailSendResult> => {
        const shouldFail = typeof harness.failSend === 'function' ? harness.failSend(message) : false
        if (shouldFail) return Promise.resolve({ ok: false, errorCode: 'provider_down' })
        sent.push(message)
        return Promise.resolve({ ok: true })
      },
    },
    emailOutbox: {
      enqueue: ({ referenceTable, referenceId }) => { outbox.push({ reference_table: referenceTable, reference_id: referenceId }); return Promise.resolve() },
    },
    panelUrl: 'https://panel.prueba.example',
  }
  return harness
}

Deno.test('crea el caso, cifra correo/IP con AAD y envía los dos avisos cuando el transporte funciona', async () => {
  const h = makeDeps()
  const result = await createDataSubjectRequest(USER, { requestType: 'baja' }, '203.0.113.9', h.deps)

  assertEquals(h.rows.length, 1)
  const row = h.rows[0]
  assertEquals(row.case_number, result.case_number)
  assertEquals(row.user_id, USER.userId)
  assertEquals(row.request_type, 'baja')
  assertEquals(row.channel, 'app')
  assertEquals(row.routed_to_email, SETTINGS.privacy_email)
  assertEquals(row.settings_version, SETTINGS.settings_version)
  assertEquals(row.due_at, new Date(NOW.getTime() + 15 * 86400000).toISOString())
  assertEquals(result.due_at, row.due_at)
  assertEquals(row.details_ciphertext, null)

  // SEC-04: ni el correo ni la IP viajan en claro — solo como cifrado AAD + HMAC de búsqueda.
  assert(row.email_hmac && row.email_hmac !== USER.email)
  assert(row.ip_hmac && row.ip_hmac !== '203.0.113.9')
  assertEquals(await decryptDsrColumn({ id: row.id, email_ciphertext: row.email_ciphertext as never }, 'email_ciphertext'), USER.email)
  assertEquals(await decryptDsrColumn({ id: row.id, ip_ciphertext: row.ip_ciphertext as never }, 'ip_ciphertext'), '203.0.113.9')

  assertEquals(h.sent.length, 2)
  assertEquals(h.outbox.length, 0)
  const delegate = h.sent.find((m) => m.to === SETTINGS.privacy_email)
  const ack = h.sent.find((m) => m.to === USER.email)
  assert(delegate && ack)
  assert(!delegate!.html.includes(USER.email), 'D-06: el aviso al delegado no debe exponer el correo del titular')
})

Deno.test('details opcional se cifra cuando se envía', async () => {
  const h = makeDeps()
  await createDataSubjectRequest(USER, { requestType: 'acceso', details: 'Quiero copia de mis datos' }, '203.0.113.9', h.deps)
  const row = h.rows[0]
  assert(row.details_ciphertext !== null)
})

Deno.test('REQ-21f: sin transporte configurado, el caso se registra igual y ambos avisos quedan en email_outbox', async () => {
  const h = makeDeps({ transport: null })
  const result = await createDataSubjectRequest(USER, { requestType: 'oposicion' }, '203.0.113.9', h.deps)
  assertEquals(h.rows.length, 1)
  assertEquals(h.sent.length, 0)
  assertEquals(h.outbox.length, 2)
  const kinds = h.outbox.map((o) => o.reference_table).sort()
  assertEquals(kinds, ['dsr_ack', 'dsr_delegate_notice'])
  for (const o of h.outbox) assertEquals(o.reference_id, h.rows[0].id)
  assertNotEquals(result.case_number, undefined)
})

Deno.test('REQ-21f: si el envío al delegado falla pero el acuse funciona, solo el del delegado queda pendiente', async () => {
  const h = makeDeps()
  h.failSend = (message) => message.to === SETTINGS.privacy_email
  await createDataSubjectRequest(USER, { requestType: 'rectificacion' }, '203.0.113.9', h.deps)
  assertEquals(h.sent.length, 1)
  assertEquals(h.sent[0].to, USER.email)
  assertEquals(h.outbox.length, 1)
  assertEquals(h.outbox[0].reference_table, 'dsr_delegate_notice')
})

Deno.test('REQ-21f: si fallan los dos envíos, los dos quedan pendientes y el caso sigue registrado', async () => {
  const h = makeDeps()
  h.failSend = () => true
  const result = await createDataSubjectRequest(USER, { requestType: 'eliminacion' }, '203.0.113.9', h.deps)
  assertEquals(h.sent.length, 0)
  assertEquals(h.outbox.length, 2)
  assert(result.case_number)
})

Deno.test('sin aviso vigente/settings → 503 settings_unavailable, nada escrito', async () => {
  const h = makeDeps({ settings: null })
  let caught: unknown
  try {
    await createDataSubjectRequest(USER, { requestType: 'baja' }, '203.0.113.9', h.deps)
  } catch (err) { caught = err }
  assert(caught instanceof DsrError)
  assertEquals((caught as DsrError).status, 503)
  assertEquals((caught as DsrError).code, 'settings_unavailable')
  assertEquals(h.rows.length, 0)
})

Deno.test('usuario verificado sin correo en el JWT → 403 forbidden, nada escrito', async () => {
  const h = makeDeps()
  let caught: unknown
  try {
    await createDataSubjectRequest({ ...USER, email: null }, { requestType: 'baja' }, '203.0.113.9', h.deps)
  } catch (err) { caught = err }
  assert(caught instanceof DsrError)
  assertEquals((caught as DsrError).status, 403)
  assertEquals(h.rows.length, 0)
})
