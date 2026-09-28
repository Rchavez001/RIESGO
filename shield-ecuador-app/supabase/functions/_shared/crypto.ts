// Shared AES-256-GCM encrypt/decrypt + HMAC-SHA256 lookup hashing for the
// consent module (consent_records.ip/ua, admin_audit_log.ip, data_subject_
// requests.email/details). Payload shape is the one ALREADY in production —
// users.email_encrypted etc. use { v, alg, iv, tag, ct } (see pii.ts and
// secure-register-user/index.ts) — reused here rather than inventing a new
// serialization, so the project never ends up with two incompatible
// encrypted-column formats. This module does not touch those existing
// call sites; it only gives new code (this module's own) a single place to
// call instead of a third inline copy of the same 60 lines.
//
// Deliberate hardenings over the existing inline copies:
//   - a dedicated HMAC key per caller (`envVar` param), never the AES key —
//     one leaked secret should not compromise both encryption and lookup;
//   - decrypt reads the key version from the payload itself (`payload.v`)
//     and can resolve older versions via `${keyEnvPrefix}_V${n}`, so a
//     future key rotation does not break rows encrypted under the old key.
//     Today only one key exists, so version 1 (or whatever PII_KEY_VERSION
//     already points to) also falls back to the bare `keyEnvPrefix` secret —
//     no new secret has to be provisioned before this code can run;
//   - optional AAD (SEC-04): a ciphertext can be bound to the place it lives
//     in (`table:column:owner`, see buildAad), so copying it into another
//     row or column makes GCM authentication fail instead of decrypting to
//     someone else's data.
//
// AAD compatibility: payloads written WITHOUT AAD (everything already in
// users.*_encrypted) have no `aad` marker and keep decrypting exactly as
// before. A payload written WITH AAD carries `aad: true`; decrypting it
// without supplying the AAD is an error, and stripping the marker does not
// help an attacker — the tag was computed over the AAD, so GCM rejects it.

export interface EncryptedPayload {
  v: number
  alg: 'AES-256-GCM'
  iv: string
  tag: string
  ct: string
  aad?: true
}

export interface CryptoOptions {
  keyEnvPrefix?: string
  aad?: string
  // Set by every writer of a NEW column: encrypting without AAD is then an error, not a silent downgrade.
  requireAad?: boolean
}

const DEFAULT_KEY_PREFIX = 'PII_ENCRYPTION_KEY_B64'

// `owner` is the user id when the row has one; for rows without a user (a
// data_subject_requests case received by e-mail) use the row's own id.
export function buildAad(table: string, column: string, owner: string): string {
  if (!table || !column || !owner) throw new Error('invalid_aad_parts')
  return `${table}:${column}:${owner}`
}

export async function encryptPii(
  value: string,
  keyVersion: number,
  options: CryptoOptions = {},
): Promise<EncryptedPayload> {
  if (options.requireAad && !options.aad) throw new Error('aad_required')
  const key = await getAesKey(keyVersion, options.keyEnvPrefix ?? DEFAULT_KEY_PREFIX, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const params: AesGcmParams = { name: 'AES-GCM', iv, tagLength: 128 }
  if (options.aad !== undefined) params.additionalData = new TextEncoder().encode(options.aad)
  const encoded = new TextEncoder().encode(value)
  const encrypted = new Uint8Array(await crypto.subtle.encrypt(params, key, encoded))
  const tag = encrypted.slice(encrypted.length - 16)
  const ct = encrypted.slice(0, encrypted.length - 16)
  const payload: EncryptedPayload = { v: keyVersion, alg: 'AES-256-GCM', iv: toBase64(iv), tag: toBase64(tag), ct: toBase64(ct) }
  if (options.aad !== undefined) payload.aad = true
  return payload
}

// `allowLegacy: false` is for columns that have only ever been written with
// AAD: a payload without the marker there is a copy of some older ciphertext
// pasted in, not something this module wrote, so it is refused.
export async function decryptPii(
  payload: EncryptedPayload | null | undefined,
  options: CryptoOptions & { allowLegacy?: boolean } = {},
): Promise<string> {
  if (!payload?.iv || !payload?.ct || !payload?.tag) return ''
  const key = await getAesKey(payload.v ?? 1, options.keyEnvPrefix ?? DEFAULT_KEY_PREFIX, ['decrypt'])
  const params: AesGcmParams = { name: 'AES-GCM', iv: fromBase64(payload.iv), tagLength: 128 }

  if (payload.aad === true) {
    if (options.aad === undefined) throw new Error('aad_required')
    params.additionalData = new TextEncoder().encode(options.aad)
  } else if (options.aad !== undefined && options.allowLegacy === false) {
    throw new Error('legacy_payload_not_allowed')
  }

  const ct = fromBase64(payload.ct)
  const tag = fromBase64(payload.tag)
  const joined = new Uint8Array(ct.length + tag.length)
  joined.set(ct)
  joined.set(tag, ct.length)
  const decrypted = await crypto.subtle.decrypt(params, key, joined)
  return new TextDecoder().decode(decrypted)
}

export function getActiveKeyVersion(keyEnvPrefix = DEFAULT_KEY_PREFIX): number {
  return getCurrentKeyVersion(keyEnvPrefix)
}

async function getAesKey(version: number, keyEnvPrefix: string, usages: KeyUsage[]) {
  const raw = getKeyBytesForVersion(version, keyEnvPrefix)
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, usages)
}

function getKeyBytesForVersion(version: number, keyEnvPrefix: string) {
  const versioned = Deno.env.get(`${keyEnvPrefix}_V${version}`)
  const isCurrent = version === getCurrentKeyVersion(keyEnvPrefix)
  const value = versioned ?? (isCurrent ? Deno.env.get(keyEnvPrefix) : undefined) ?? ''
  // atob's own message must not surface: a malformed secret is reported by name/version only.
  const bytes = decodeBase64OrNull(value)
  if (bytes?.byteLength !== 32) throw new Error(`invalid_key_v${version}`)
  return bytes
}

function getCurrentKeyVersion(keyEnvPrefix: string): number {
  const version = Number(Deno.env.get(`${keyEnvPrefix}_VERSION`) ?? Deno.env.get('PII_KEY_VERSION') ?? '1')
  return Number.isInteger(version) && version >= 1 ? version : 1
}

// `envVar` must hold its OWN base64 32-byte secret, distinct from any AES key
// above and from SECURITY_EVENTS_HMAC_KEY (that one is for security_events.ip_hash
// specifically). For this module, use LOOKUP_HMAC_KEY_B64.
export async function hmacLookup(value: string, envVar: string): Promise<string> {
  const key = await getHmacKey(envVar)
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value))
  return toBase64Url(new Uint8Array(signature))
}

async function getHmacKey(envVar: string) {
  const bytes = decodeBase64OrNull(Deno.env.get(envVar) ?? '')
  if (!bytes || bytes.byteLength < 16) throw new Error(`invalid_hmac_key:${envVar}`)
  return crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
}

function decodeBase64OrNull(value: string): Uint8Array<ArrayBuffer> | null {
  try {
    return fromBase64(value)
  } catch {
    return null
  }
}

function fromBase64(value: string) {
  const binary = atob(value)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}

function toBase64(value: Uint8Array) {
  return btoa(String.fromCharCode(...value))
}

function toBase64Url(value: Uint8Array) {
  return toBase64(value).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}
