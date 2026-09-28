// One place that knows how consent-module ciphertexts are bound (AAD, SEC-04) so writers and readers
// cannot drift apart. Every column here is written ONLY with AAD, so readers pass allowLegacy:false:
// a payload without the marker in these columns is something pasted in from elsewhere, not ours.
import { buildAad, decryptPii, encryptPii, type EncryptedPayload } from './crypto.ts'

// consent_records.user_id is ON DELETE SET NULL, so after a baja the row can no longer rebuild an
// AAD from it. user_ref_hmac (HMAC of the user id) lives in the row and survives that — it is the
// anchor instead. Differs from the SPEC's literal `user_id` for that reason.
export type ConsentRecordColumn = 'ip_ciphertext' | 'ua_ciphertext'

export function consentRecordAad(column: ConsentRecordColumn, userRefHmac: string): string {
  return buildAad('consent_records', column, userRefHmac)
}

export function encryptConsentColumn(value: string, keyVersion: number, column: ConsentRecordColumn, userRefHmac: string) {
  return encryptPii(value, keyVersion, { aad: consentRecordAad(column, userRefHmac) })
}

export async function decryptConsentColumn(
  row: { user_ref_hmac: string } & Partial<Record<ConsentRecordColumn, EncryptedPayload | null>>,
  column: ConsentRecordColumn,
): Promise<string | null> {
  const payload = row[column]
  if (!payload) return null // already purged by the retention job (REQ-19)
  return decryptPii(payload, { aad: consentRecordAad(column, row.user_ref_hmac), allowLegacy: false })
}

// data_subject_requests has no user to anchor to for cases received by e-mail, so its own id is the
// owner — which means the id must exist BEFORE the insert (the AAD is needed to build the
// ciphertext that goes into that same insert). The function generates it and inserts it explicitly;
// the column's gen_random_uuid() default is never used by this path.
export type DsrColumn = 'email_ciphertext' | 'details_ciphertext' | 'resolution_note_ciphertext' | 'ip_ciphertext'

export const dsrAad = (column: DsrColumn, requestId: string) => buildAad('data_subject_requests', column, requestId)

export async function prepareDsrRow(input: { email: string; details?: string; ip?: string | null; keyVersion: number }) {
  const id = crypto.randomUUID()
  const enc = (column: DsrColumn, value: string) => encryptPii(value, input.keyVersion, { aad: dsrAad(column, id) })
  return {
    id,
    email_ciphertext: await enc('email_ciphertext', input.email),
    details_ciphertext: input.details ? await enc('details_ciphertext', input.details) : null,
    ip_ciphertext: input.ip ? await enc('ip_ciphertext', input.ip) : null,
    key_version: input.keyVersion,
  }
}

export const encryptDsrResolutionNote = (requestId: string, note: string, keyVersion: number) =>
  encryptPii(note, keyVersion, { aad: dsrAad('resolution_note_ciphertext', requestId) })

export async function decryptDsrColumn(
  row: { id: string } & Partial<Record<DsrColumn, EncryptedPayload | null>>,
  column: DsrColumn,
): Promise<string | null> {
  const payload = row[column]
  if (!payload) return null
  return decryptPii(payload, { aad: dsrAad(column, row.id), allowLegacy: false })
}
