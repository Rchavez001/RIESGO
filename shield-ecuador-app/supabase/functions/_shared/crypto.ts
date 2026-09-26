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
// Two deliberate hardenings over the existing inline copies:
//   - a dedicated HMAC key per caller (`envVar` param), never the AES key —
//     one leaked secret should not compromise both encryption and lookup;
//   - decrypt reads the key version from the payload itself (`payload.v`)
//     and can resolve older versions via `${keyEnvPrefix}_V${n}`, so a
//     future key rotation does not break rows encrypted under the old key.
//     Today only one key exists, so version 1 (or whatever PII_KEY_VERSION
//     already points to) also falls back to the bare `keyEnvPrefix` secret —
//     no new secret has to be provisioned before this code can run.

export interface EncryptedPayload {
  v: number
  alg: 'AES-256-GCM'
  iv: string
  tag: string
  ct: string
}

export async function encryptPii(
  value: string,
  keyVersion: number,
  keyEnvPrefix = 'PII_ENCRYPTION_KEY_B64',
): Promise<EncryptedPayload> {
  const key = await getAesKey(keyVersion, keyEnvPrefix, ['encrypt'])
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encoded = new TextEncoder().encode(value)
  const encrypted = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, encoded))
  const tag = encrypted.slice(encrypted.length - 16)
  const ct = encrypted.slice(0, encrypted.length - 16)
  return { v: keyVersion, alg: 'AES-256-GCM', iv: toBase64(iv), tag: toBase64(tag), ct: toBase64(ct) }
}

export async function decryptPii(
  payload: EncryptedPayload | null | undefined,
  keyEnvPrefix = 'PII_ENCRYPTION_KEY_B64',
): Promise<string> {
  if (!payload?.iv || !payload?.ct || !payload?.tag) return ''
  const key = await getAesKey(payload.v ?? 1, keyEnvPrefix, ['decrypt'])
  const iv = fromBase64(payload.iv)
  const ct = fromBase64(payload.ct)
  const tag = fromBase64(payload.tag)
  const joined = new Uint8Array(ct.length + tag.length)
  joined.set(ct)
  joined.set(tag, ct.length)
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, joined)
  return new TextDecoder().decode(decrypted)
}

export function getActiveKeyVersion(keyEnvPrefix = 'PII_ENCRYPTION_KEY_B64'): number {
  return getCurrentKeyVersion(keyEnvPrefix)
}

async function getAesKey(version: number, keyEnvPrefix: string, usages: KeyUsage[]) {
  const raw = getKeyBytesForVersion(version, keyEnvPrefix)
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, usages)
}

function getKeyBytesForVersion(version: number, keyEnvPrefix: string): Uint8Array {
  const versioned = Deno.env.get(`${keyEnvPrefix}_V${version}`)
  const isCurrent = version === getCurrentKeyVersion(keyEnvPrefix)
  const value = versioned ?? (isCurrent ? Deno.env.get(keyEnvPrefix) : undefined) ?? ''
  const bytes = fromBase64(value)
  if (bytes.byteLength !== 32) throw new Error(`invalid_key_v${version}`)
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
  const value = Deno.env.get(envVar) ?? ''
  const bytes = fromBase64(value)
  if (bytes.byteLength < 16) throw new Error(`invalid_hmac_key:${envVar}`)
  return crypto.subtle.importKey('raw', bytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
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
