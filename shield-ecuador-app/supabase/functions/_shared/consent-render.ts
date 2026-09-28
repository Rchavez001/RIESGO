// Renders a consent_documents.content_md against the current privacy_settings + the document itself,
// and hashes the result. Used by BOTH get-consent-notice / secure-register-user (what a visitor sees and
// what is verified) and admin-consent's preview/publish (Fase 3) — one function, not two copies, because
// rendered_sha256 is a security property: if preview and the real render ever drifted, an admin could
// approve text that isn't what gets hashed and shown.
//
// Rules (T09, README "antes de producción"):
//   - only the markers in MARKERS exist; anything else inside {{…}} is UNKNOWN and must be rejected;
//   - a known marker whose value is empty is UNRESOLVED and must block publishing (D-07);
//   - HTML comments are dropped BEFORE resolving: they are notes for editors, never shown, and a marker
//     mentioned inside one must not count.
// The renderer never silently leaves a marker in the text: callers get `unknown`/`unresolved` and decide.

export interface PrivacySettingsForRender {
  controller_name: string | null
  controller_address: string | null
  controller_phone: string | null
  privacy_email: string
  dpo_name: string | null
  dpo_contact: string | null
  privacy_policy_url: string | null
  unsubscribe_subject: string | null
  response_days: number
  ip_retention_days: number
}

export interface DocumentForRender {
  version: string
  // Null while the document is a draft: {{fecha_vigencia}} is then UNRESOLVED until it is published.
  published_at: string | null
}

export interface RenderedConsent {
  text: string
  unknown: string[]
  unresolved: string[]
}

type Context = { settings: PrivacySettingsForRender; document: DocumentForRender }

const MARKERS: Record<string, (ctx: Context) => string | number | null | undefined> = {
  version: ({ document }) => document.version,
  fecha_vigencia: ({ document }) => (document.published_at ? guayaquilDate(document.published_at) : null),
  responsable_nombre: ({ settings }) => settings.controller_name,
  responsable_domicilio: ({ settings }) => settings.controller_address,
  responsable_telefono: ({ settings }) => settings.controller_phone,
  correo_privacidad: ({ settings }) => settings.privacy_email,
  dpo_contacto: ({ settings }) => [settings.dpo_name, settings.dpo_contact].filter(Boolean).join(' — '),
  asunto_baja: ({ settings }) => settings.unsubscribe_subject,
  plazo_respuesta_dias: ({ settings }) => settings.response_days,
  url_politica: ({ settings }) => settings.privacy_policy_url,
  retencion_ip_dias: ({ settings }) => settings.ip_retention_days,
}

export const CONSENT_MARKER_NAMES = Object.keys(MARKERS)

export function renderConsent(contentMd: string, settings: PrivacySettingsForRender, document: DocumentForRender): RenderedConsent {
  const unknown = new Set<string>()
  const unresolved = new Set<string>()
  const ctx: Context = { settings, document }

  const withoutComments = contentMd.replace(/<!--[\s\S]*?-->/g, '')
  const text = withoutComments.replace(/\{\{\s*([^{}]*?)\s*\}\}/g, (match, name: string) => {
    const resolve = MARKERS[name]
    if (!resolve) {
      unknown.add(name)
      return match
    }
    const value = resolve(ctx)
    if (value === null || value === undefined || String(value).trim() === '') {
      unresolved.add(name)
      return match
    }
    return String(value)
  })

  return { text: text.trim() + '\n', unknown: [...unknown], unresolved: [...unresolved] }
}

// The date is what the visitor reads, so it must not depend on the server's time zone.
function guayaquilDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-CA', { timeZone: 'America/Guayaquil' })
}

export async function sha256Hex(text: string): Promise<string> {
  const encoded = new TextEncoder().encode(text)
  const digestBuffer = await crypto.subtle.digest('SHA-256', encoded)
  return Array.from(new Uint8Array(digestBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('')
}
