// RF-03/RF-04: every security-relevant event funnels through here. Two
// hard rules baked in, not left to each caller to remember:
//   - the IP is HASHED (HMAC-SHA256, salted with a dedicated secret) before
//     it ever touches a row — the raw address is never stored (RF-04);
//   - logging NEVER throws (RNF-02) — a failure to write an audit row must
//     never be the reason a real user's request fails, so every error here
//     is swallowed after a console.error.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

export type Severity = 'baja' | 'media' | 'alta' | 'critica'

export async function hashIp(ip: string | null): Promise<string | null> {
  if (!ip) return null
  const keyB64 = Deno.env.get('SECURITY_EVENTS_HMAC_KEY')
  if (!keyB64) return null
  try {
    const keyBytes = Uint8Array.from(atob(keyB64), (c) => c.charCodeAt(0))
    const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
    const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(ip))
    return btoa(String.fromCharCode(...new Uint8Array(signature)))
  } catch (error) {
    console.error('hashIp failed:', error)
    return null
  }
}

// Supabase Edge Functions (Deno Deploy) put the real client IP in this
// header — never trust a client-supplied header for this.
export function extractClientIp(req: Request): string | null {
  const forwarded = req.headers.get('x-forwarded-for')
  if (!forwarded) return null
  return forwarded.split(',')[0].trim() || null
}

export async function logSecurityEvent(params: {
  req?: Request
  endpoint: string
  event_type: string
  severity: Severity
  metadata?: Record<string, unknown>
}): Promise<void> {
  try {
    const ip = params.req ? extractClientIp(params.req) : null
    const ip_hash = await hashIp(ip)
    const { error } = await supabase.from('security_events').insert({
      endpoint: params.endpoint,
      event_type: params.event_type,
      severity: params.severity,
      ip_hash,
      metadata: params.metadata ?? {},
    })
    if (error) console.error('logSecurityEvent insert failed:', error)
  } catch (error) {
    console.error('logSecurityEvent failed:', error)
  }
}
