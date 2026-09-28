// Loads the published notice + the current settings and renders them ONCE, the same way for everyone who
// needs it (get-consent-notice shows it, secure-register-user re-verifies the visitor saw exactly this).
// Fails loudly: a published notice with unknown or unresolved markers must never be served (T09) — publishing
// is supposed to prevent it, so if it happens something is wrong and registering must stop, not degrade.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { renderConsent, sha256Hex, type PrivacySettingsForRender } from './consent-render.ts'

const SETTINGS_COLUMNS =
  'settings_version, controller_name, controller_address, controller_phone, privacy_email, dpo_name, dpo_contact, privacy_policy_url, unsubscribe_subject, response_days, ip_retention_days'

export type NoticeErrorCode = 'notice_not_published' | 'settings_unavailable' | 'notice_invalid'

export class NoticeError extends Error {
  // `markers` are marker NAMES only (never values): safe to log.
  constructor(public code: NoticeErrorCode, public markers: string[] = []) {
    super(code)
  }
}

export interface PublishedNotice {
  document: {
    id: string
    version: string
    title: string
    content_md: string
    purposes: unknown
    requires_reconsent: boolean
    published_at: string | null
  }
  settings: PrivacySettingsForRender & { settings_version: number }
  renderedMd: string
  renderedSha256: string
}

export async function loadPublishedNotice(supabase: SupabaseClient): Promise<PublishedNotice> {
  const { data: document, error: documentError } = await supabase
    .from('consent_documents')
    .select('id, version, title, content_md, purposes, requires_reconsent, published_at')
    .eq('status', 'published')
    .maybeSingle()
  if (documentError) throw documentError
  if (!document) throw new NoticeError('notice_not_published')

  const { data: settings, error: settingsError } = await supabase
    .from('privacy_settings_current')
    .select(SETTINGS_COLUMNS)
    .maybeSingle()
  if (settingsError) throw settingsError
  if (!settings) throw new NoticeError('settings_unavailable')

  const rendered = renderConsent(document.content_md, settings, document)
  if (rendered.unknown.length > 0 || rendered.unresolved.length > 0) {
    throw new NoticeError('notice_invalid', [...rendered.unknown, ...rendered.unresolved])
  }
  return { document, settings, renderedMd: rendered.text, renderedSha256: await sha256Hex(rendered.text) }
}
