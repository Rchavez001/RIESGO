// Shared write path for consent_records rows created by the authenticated-user endpoints
// (update-my-consent, submit-consent): the same AAD-bound IP/UA ciphertext shape
// secure-register-user writes at registration time (SEC-04), plus the purpose-list parsing
// both endpoints need from the currently published document's `purposes` jsonb column.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { encryptConsentColumn } from './consent-evidence.ts'
import { hmacLookup } from './crypto.ts'

export interface Purpose {
  code: string
  label: string
  description?: string
  required: boolean
  order?: number
}

export function parsePurposes(raw: unknown): Purpose[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((item): item is Purpose =>
    !!item && typeof item === 'object' && typeof (item as Purpose).code === 'string' && typeof (item as Purpose).required === 'boolean'
  )
}

export interface ConsentEvidenceInput {
  userId: string
  documentId: string
  documentVersion: string
  renderedSha256: string
  settingsVersion: number
  purposeCode: string
  decision: 'granted' | 'denied' | 'revoked'
  channel: 'reconsentimiento' | 'mi_privacidad'
  ip: string
  userAgent: string
  keyVersion: number
}

export async function insertConsentEvidenceRow(
  supabase: SupabaseClient,
  input: ConsentEvidenceInput,
): Promise<{ error: unknown }> {
  const userRefHmac = await hmacLookup(input.userId, 'LOOKUP_HMAC_KEY_B64')
  // SEC-04: bound to table:column:owner (see _shared/consent-evidence.ts) so the ciphertext cannot be
  // moved to another row or column.
  const ipCiphertext = await encryptConsentColumn(input.ip, input.keyVersion, 'ip_ciphertext', userRefHmac)
  const ipHmac = await hmacLookup(input.ip, 'LOOKUP_HMAC_KEY_B64')
  const uaCiphertext = input.userAgent
    ? await encryptConsentColumn(input.userAgent, input.keyVersion, 'ua_ciphertext', userRefHmac)
    : null
  const uaHmac = input.userAgent ? await hmacLookup(input.userAgent, 'LOOKUP_HMAC_KEY_B64') : null

  const { error } = await supabase.from('consent_records').insert({
    user_id: input.userId,
    user_ref_hmac: userRefHmac,
    document_id: input.documentId,
    document_version: input.documentVersion,
    rendered_sha256: input.renderedSha256,
    settings_version: input.settingsVersion,
    purpose_code: input.purposeCode,
    decision: input.decision,
    channel: input.channel,
    ip_ciphertext: ipCiphertext,
    ip_hmac: ipHmac,
    ua_ciphertext: uaCiphertext,
    ua_hmac: uaHmac,
    key_version: input.keyVersion,
  })
  return { error }
}
