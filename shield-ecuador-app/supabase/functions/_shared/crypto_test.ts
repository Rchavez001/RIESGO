// Run: deno test --allow-env supabase/functions/_shared/crypto_test.ts
import { assertEquals, assertRejects } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { buildAad, decryptPii, encryptPii, hmacLookup } from './crypto.ts'

function randomKeyB64() {
  return btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32))))
}

Deno.env.set('PII_ENCRYPTION_KEY_B64', randomKeyB64())
Deno.env.set('PII_KEY_VERSION', '1')
Deno.env.set('LOOKUP_HMAC_KEY_B64', randomKeyB64())

const USER_A = '11111111-1111-1111-1111-111111111111'
const USER_B = '22222222-2222-2222-2222-222222222222'

Deno.test('AAD: cifrar y descifrar con la misma AAD devuelve el texto y marca el payload', async () => {
  const aad = buildAad('consent_records', 'ip_ciphertext', USER_A)
  const payload = await encryptPii('192.0.2.55', 1, { aad })
  assertEquals(payload.aad, true)
  assertEquals(await decryptPii(payload, { aad }), '192.0.2.55')
})

Deno.test('AAD: una AAD distinta falla (otro usuario, otra columna u otra tabla)', async () => {
  const payload = await encryptPii('192.0.2.55', 1, { aad: buildAad('consent_records', 'ip_ciphertext', USER_A) })
  for (const wrong of [
    buildAad('consent_records', 'ip_ciphertext', USER_B), // mover el cifrado a la fila de otro usuario
    buildAad('consent_records', 'ua_ciphertext', USER_A), // moverlo a otra columna
    buildAad('admin_audit_log', 'ip_ciphertext', USER_A), // moverlo a otra tabla
  ]) {
    await assertRejects(() => decryptPii(payload, { aad: wrong }))
  }
})

Deno.test('AAD: un payload con AAD no se descifra si no se entrega la AAD', async () => {
  const payload = await encryptPii('x', 1, { aad: buildAad('consent_records', 'ip_ciphertext', USER_A) })
  await assertRejects(() => decryptPii(payload), Error, 'aad_required')
})

Deno.test('AAD: quitar el marcador `aad` no sirve — la etiqueta GCM ya cubre la AAD', async () => {
  const aad = buildAad('consent_records', 'ip_ciphertext', USER_A)
  const payload = await encryptPii('x', 1, { aad })
  const stripped = { ...payload }
  delete stripped.aad
  await assertRejects(() => decryptPii(stripped, { aad }))
  await assertRejects(() => decryptPii(stripped))
})

Deno.test('compatibilidad: un cifrado anterior SIN AAD se sigue leyendo igual', async () => {
  // Construido a mano con WebCrypto, tal como lo escribía secure-register-user antes de este cambio.
  const raw = Uint8Array.from(atob(Deno.env.get('PII_ENCRYPTION_KEY_B64')!), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const enc = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, new TextEncoder().encode('ana@empresa.com')))
  const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u))
  const legacy = { v: 1, alg: 'AES-256-GCM' as const, iv: b64(iv), tag: b64(enc.slice(-16)), ct: b64(enc.slice(0, -16)) }

  assertEquals(await decryptPii(legacy), 'ana@empresa.com')
  // Pasar una AAD no rompe la lectura de un legado (columnas mixtas)…
  assertEquals(await decryptPii(legacy, { aad: buildAad('users', 'email_encrypted', USER_A) }), 'ana@empresa.com')
})

Deno.test('allowLegacy:false rechaza un payload sin marcador en columnas que solo se escriben con AAD', async () => {
  const legacyShaped = await encryptPii('x', 1) // sin AAD
  await assertRejects(
    () => decryptPii(legacyShaped, { aad: buildAad('consent_records', 'ip_ciphertext', USER_A), allowLegacy: false }),
    Error,
    'legacy_payload_not_allowed',
  )
})

Deno.test('buildAad exige las tres partes', () => {
  const cases: Array<[string, string, string]> = [['', 'c', 'o'], ['t', '', 'o'], ['t', 'c', '']]
  for (const [table, column, owner] of cases) {
    let threw = false
    try { buildAad(table, column, owner) } catch { threw = true }
    assertEquals(threw, true)
  }
})

Deno.test('una clave de versión inexistente se rechaza y el HMAC es determinista', async () => {
  await assertRejects(() => encryptPii('x', 2), Error, 'invalid_key_v2')
  assertEquals(await hmacLookup('a', 'LOOKUP_HMAC_KEY_B64'), await hmacLookup('a', 'LOOKUP_HMAC_KEY_B64'))
})
