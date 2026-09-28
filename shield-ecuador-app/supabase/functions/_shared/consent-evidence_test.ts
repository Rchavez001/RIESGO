// Run: deno test --allow-env supabase/functions/_shared/consent-evidence_test.ts
import { assertEquals, assertNotEquals, assertRejects } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { encryptPii } from './crypto.ts'
import {
  decryptConsentColumn, decryptDsrColumn, encryptConsentColumn, encryptDsrResolutionNote, prepareDsrRow,
} from './consent-evidence.ts'

Deno.env.set('PII_ENCRYPTION_KEY_B64', btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))))
Deno.env.set('PII_KEY_VERSION', '1')

const REF_A = 'hmacDeUsuarioA'
const REF_B = 'hmacDeUsuarioB'

Deno.test('consent_records: lo que escribe el registro lo lee el lector, con allowLegacy:false', async () => {
  const row = {
    user_ref_hmac: REF_A,
    ip_ciphertext: await encryptConsentColumn('203.0.113.9', 1, 'ip_ciphertext', REF_A),
    ua_ciphertext: await encryptConsentColumn('Mozilla/5.0', 1, 'ua_ciphertext', REF_A),
  }
  assertEquals(await decryptConsentColumn(row, 'ip_ciphertext'), '203.0.113.9')
  assertEquals(await decryptConsentColumn(row, 'ua_ciphertext'), 'Mozilla/5.0')
})

Deno.test('consent_records: un cifrado sin AAD (legado o pegado a mano) se rechaza en estas columnas', async () => {
  const pasted = await encryptPii('203.0.113.9', 1) // como users.email_encrypted: válido, pero sin marcador
  await assertRejects(() => decryptConsentColumn({ user_ref_hmac: REF_A, ip_ciphertext: pasted }, 'ip_ciphertext'), Error, 'legacy_payload_not_allowed')
})

Deno.test('consent_records: mover el cifrado a otro usuario o a la otra columna falla', async () => {
  const ip = await encryptConsentColumn('203.0.113.9', 1, 'ip_ciphertext', REF_A)
  await assertRejects(() => decryptConsentColumn({ user_ref_hmac: REF_B, ip_ciphertext: ip }, 'ip_ciphertext'))
  await assertRejects(() => decryptConsentColumn({ user_ref_hmac: REF_A, ua_ciphertext: ip }, 'ua_ciphertext'))
})

Deno.test('consent_records: tras la retención (columna en NULL) se lee null, no un error', async () => {
  assertEquals(await decryptConsentColumn({ user_ref_hmac: REF_A, ip_ciphertext: null }, 'ip_ciphertext'), null)
})

Deno.test('consent_records: sigue legible tras borrar al usuario, porque el ancla es user_ref_hmac y no user_id', async () => {
  const ip = await encryptConsentColumn('203.0.113.9', 1, 'ip_ciphertext', REF_A)
  // ON DELETE SET NULL: la fila pierde user_id pero conserva user_ref_hmac.
  assertEquals(await decryptConsentColumn({ user_ref_hmac: REF_A, user_id: null, ip_ciphertext: ip } as never, 'ip_ciphertext'), '203.0.113.9')
})

Deno.test('data_subject_requests: el UUID nace en la función antes del insert y es la AAD de cada columna', async () => {
  const a = await prepareDsrRow({ email: 'ana@empresa.com', details: 'quiero mi baja', ip: '203.0.113.9', keyVersion: 1 })
  const b = await prepareDsrRow({ email: 'luis@empresa.com', keyVersion: 1 })
  assertEquals(/^[0-9a-f-]{36}$/.test(a.id), true)
  assertNotEquals(a.id, b.id)
  assertEquals(b.details_ciphertext, null)
  assertEquals(b.ip_ciphertext, null)

  assertEquals(await decryptDsrColumn(a, 'email_ciphertext'), 'ana@empresa.com')
  assertEquals(await decryptDsrColumn(a, 'details_ciphertext'), 'quiero mi baja')
  assertEquals(await decryptDsrColumn(a, 'ip_ciphertext'), '203.0.113.9')
})

Deno.test('data_subject_requests: el cifrado de un caso no se puede pegar en otro caso ni en otra columna', async () => {
  const a = await prepareDsrRow({ email: 'ana@empresa.com', details: 'x', keyVersion: 1 })
  const b = await prepareDsrRow({ email: 'luis@empresa.com', keyVersion: 1 })
  await assertRejects(() => decryptDsrColumn({ id: b.id, email_ciphertext: a.email_ciphertext }, 'email_ciphertext'))
  await assertRejects(() => decryptDsrColumn({ id: a.id, details_ciphertext: a.email_ciphertext }, 'details_ciphertext'))
})

Deno.test('data_subject_requests: la nota de resolución (escrita después) usa el mismo id como AAD', async () => {
  const a = await prepareDsrRow({ email: 'ana@empresa.com', keyVersion: 1 })
  const note = await encryptDsrResolutionNote(a.id, 'Eliminado el 2026-10-01', 1)
  assertEquals(await decryptDsrColumn({ id: a.id, resolution_note_ciphertext: note }, 'resolution_note_ciphertext'), 'Eliminado el 2026-10-01')
})
