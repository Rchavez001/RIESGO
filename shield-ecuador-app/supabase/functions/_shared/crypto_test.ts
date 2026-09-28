// Run: deno test --allow-env supabase/functions/_shared/crypto_test.ts
import { assertEquals, assertRejects } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { buildAad, decryptPii, encryptPii, getActiveKeyVersion, hmacLookup, type EncryptedPayload } from './crypto.ts'

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

function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>) {
  return async () => {
    const before: Record<string, string | undefined> = {}
    for (const name of Object.keys(vars)) before[name] = Deno.env.get(name)
    try {
      for (const [name, value] of Object.entries(vars)) value === undefined ? Deno.env.delete(name) : Deno.env.set(name, value)
      await fn()
    } finally {
      for (const [name, value] of Object.entries(before)) value === undefined ? Deno.env.delete(name) : Deno.env.set(name, value)
    }
  }
}

Deno.test('rotación: lo cifrado con la clave v1 se lee con la v2 activa y lo nuevo sale como v2', withEnv({
  PII_ENCRYPTION_KEY_B64: undefined, PII_KEY_VERSION: undefined, PII_ENCRYPTION_KEY_B64_V1: undefined,
}, async () => {
  const keyV1 = randomKeyB64()
  Deno.env.set('PII_ENCRYPTION_KEY_B64', keyV1)
  Deno.env.set('PII_KEY_VERSION', '1')
  const aad = buildAad('consent_records', 'ip_ciphertext', USER_A)
  const oldPayload = await encryptPii('192.0.2.10', 1, { aad })
  assertEquals(oldPayload.v, 1)

  // Rotación: la clave nueva pasa a ser la activa; la vieja queda registrada como _V1.
  Deno.env.set('PII_ENCRYPTION_KEY_B64_V1', keyV1)
  Deno.env.set('PII_ENCRYPTION_KEY_B64', randomKeyB64())
  Deno.env.set('PII_KEY_VERSION', '2')

  assertEquals(getActiveKeyVersion(), 2)
  assertEquals(await decryptPii(oldPayload, { aad }), '192.0.2.10')
  const fresh = await encryptPii('192.0.2.11', getActiveKeyVersion(), { aad })
  assertEquals(fresh.v, 2)
  assertEquals(await decryptPii(fresh, { aad }), '192.0.2.11')
}))

Deno.test('rotación: sin la clave _V1 registrada, un payload v1 falla en vez de descifrar con la clave equivocada', withEnv({
  PII_ENCRYPTION_KEY_B64: undefined, PII_KEY_VERSION: undefined, PII_ENCRYPTION_KEY_B64_V1: undefined,
}, async () => {
  Deno.env.set('PII_ENCRYPTION_KEY_B64', randomKeyB64())
  Deno.env.set('PII_KEY_VERSION', '1')
  const oldPayload = await encryptPii('x', 1)
  Deno.env.set('PII_ENCRYPTION_KEY_B64', randomKeyB64())
  Deno.env.set('PII_KEY_VERSION', '2')
  await assertRejects(() => decryptPii(oldPayload), Error, 'invalid_key_v1')
}))

Deno.test('compatibilidad con pii.ts: un payload {iv, tag, ct} sin `v` ni `alg` se lee como versión 1', async () => {
  const raw = Uint8Array.from(atob(Deno.env.get('PII_ENCRYPTION_KEY_B64')!), (c) => c.charCodeAt(0))
  const key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const enc = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, new TextEncoder().encode('ana@example.test')))
  const b64 = (u: Uint8Array) => btoa(String.fromCharCode(...u))
  const piiShaped = { iv: b64(iv), tag: b64(enc.slice(-16)), ct: b64(enc.slice(0, -16)) }
  assertEquals(await decryptPii(piiShaped as unknown as EncryptedPayload), 'ana@example.test')
})

Deno.test('clave mal formada: error claro y el mensaje nunca contiene el valor de la clave', withEnv({ PII_ENCRYPTION_KEY_B64: undefined }, async () => {
  const secretLooking = 'CLAVE-SECRETA-QUE-NO-ES-BASE64!!'
  Deno.env.set('PII_ENCRYPTION_KEY_B64', secretLooking)
  for (const op of [() => encryptPii('x', 1), () => decryptPii({ v: 1, alg: 'AES-256-GCM', iv: 'AAAA', tag: 'AAAA', ct: 'AAAA' })]) {
    const error = await op().then(() => null, (e: Error) => e)
    assertEquals(error?.message, 'invalid_key_v1')
    assertEquals(String(error?.stack).includes(secretLooking), false)
  }
  // Base64 válido pero de otro largo (16 bytes en vez de 32).
  Deno.env.set('PII_ENCRYPTION_KEY_B64', btoa('0123456789abcdef'))
  await assertRejects(() => encryptPii('x', 1), Error, 'invalid_key_v1')
}))

Deno.test('clave HMAC mal formada o ausente: error claro sin filtrar el valor', withEnv({ TEST_HMAC_BAD: 'HMAC-SECRETO-NO-BASE64!!', TEST_HMAC_SHORT: btoa('corta') }, async () => {
  for (const name of ['TEST_HMAC_BAD', 'TEST_HMAC_SHORT', 'TEST_HMAC_MISSING']) {
    const error = await hmacLookup('x', name).then(() => null, (e: Error) => e)
    assertEquals(error?.message, `invalid_hmac_key:${name}`)
  }
}))

Deno.test('requireAad: cifrar una columna nueva sin AAD se rechaza; con AAD funciona', async () => {
  await assertRejects(() => encryptPii('x', 1, { requireAad: true }), Error, 'aad_required')
  await assertRejects(() => encryptPii('x', 1, { requireAad: true, aad: '' }), Error, 'aad_required')
  const aad = buildAad('data_subject_requests', 'email_ciphertext', USER_A)
  assertEquals(await decryptPii(await encryptPii('x', 1, { requireAad: true, aad }), { aad }), 'x')
})
