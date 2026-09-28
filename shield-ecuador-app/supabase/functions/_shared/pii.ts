// Decrypts users.email_encrypted (AES-GCM, project-level PII_ENCRYPTION_KEY_B64
// secret) — the plaintext `users.email` column holds a masked placeholder
// (`<uuid>@private.local`) for anyone registered through secure-register-user,
// so anything that needs a real address to send mail to must decrypt this
// instead. Factored out of get-ranking's inline copy since
// championship-draw-round1 needs the same logic (get-ranking's own copy is
// left as-is to avoid an unrelated regression risk).

export interface EncryptedPayload {
  iv: string
  tag: string
  ct: string
}

export async function decryptPiiString(payload: EncryptedPayload | null | undefined): Promise<string> {
  if (!payload?.iv || !payload?.ct || !payload?.tag) return ''
  const key = await getAesKey()
  const iv = fromBase64(payload.iv)
  const ct = fromBase64(payload.ct)
  const tag = fromBase64(payload.tag)
  const joined = new Uint8Array(ct.length + tag.length)
  joined.set(ct)
  joined.set(tag, ct.length)
  const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv, tagLength: 128 }, key, joined)
  return new TextDecoder().decode(decrypted)
}

async function getAesKey() {
  const raw = getEncryptionKeyBytes()
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['decrypt'])
}

function getEncryptionKeyBytes() {
  const value = Deno.env.get('PII_ENCRYPTION_KEY_B64') ?? ''
  const bytes = fromBase64(value)
  if (bytes.byteLength !== 32) throw new Error('invalid_pii_key')
  return bytes
}

function fromBase64(value: string) {
  const binary = atob(value)
  return Uint8Array.from(binary, (char) => char.charCodeAt(0))
}
