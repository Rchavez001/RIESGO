// Renders a consent_documents.content_md's {{marker}} placeholders against the
// current privacy_settings row, and hashes the result. Used by BOTH
// get-consent-notice (what a visitor actually sees) and admin-consent's
// preview/publish actions (Fase 3) — the same function, not two copies, because
// rendered_sha256 is a security property: if preview and the real render ever
// drifted, an admin could approve text that isn't what gets hashed and shown.

export interface PrivacySettingsForRender {
  controller_name: string | null
  controller_address: string | null
  controller_phone: string | null
  privacy_email: string
  dpo_name: string | null
  dpo_contact: string | null
  privacy_policy_url: string | null
  response_days: number
  response_day_type: string
}

const MARKER_FIELDS: Record<string, keyof PrivacySettingsForRender> = {
  controller_name: 'controller_name',
  controller_address: 'controller_address',
  controller_phone: 'controller_phone',
  privacy_email: 'privacy_email',
  dpo_name: 'dpo_name',
  dpo_contact: 'dpo_contact',
  privacy_policy_url: 'privacy_policy_url',
  response_days: 'response_days',
  response_day_type: 'response_day_type',
}

// An unknown marker, or one whose field is empty, is left as literal `{{...}}`
// text instead of silently vanishing — so a blank shows up as an obvious typo
// in the draft preview (REQ-13b) instead of publishing a notice with an
// invisible hole in it.
export function renderConsentMarkers(contentMd: string, settings: PrivacySettingsForRender): string {
  return contentMd.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (match, key) => {
    const field = MARKER_FIELDS[key]
    if (!field) return match
    const value = settings[field]
    if (value === null || value === undefined || value === '') return match
    return String(value)
  })
}

export async function sha256Hex(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text)
  const digestBuffer = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(digestBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('')
}
