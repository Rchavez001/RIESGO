// Links and images of campaign ads come from the database and are shown to every user. Only these shapes are rendered:
// a link must be http(s) (a `javascript:` URL in an <a href> runs in this origin), and an image must be a file of our own
// public `campaign-ads` storage bucket (no third-party tracking pixels).
export function safeHttpUrl(value: unknown): string | null {
  try {
    const url = new URL(String(value ?? '').trim())
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null
  } catch {
    return null
  }
}

export function campaignImageUrl(value: unknown, supabaseUrl: string | undefined): string | null {
  const safe = safeHttpUrl(value)
  if (!safe) return null
  try {
    const url = new URL(safe)
    const own = supabaseUrl ? new URL(supabaseUrl).host : null
    return url.protocol === 'https:' && (!own || url.host === own) && url.pathname.startsWith('/storage/v1/object/public/campaign-ads/') ? safe : null
  } catch {
    return null
  }
}
