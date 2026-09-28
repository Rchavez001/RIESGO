// RF-02: sliding-window rate limiting, keyed by hashed-IP+endpoint AND by
// email+endpoint (whichever the caller passes) — checking both means a
// single IP hammering many emails, and a single email hammered from many
// IPs, both get caught.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { extractClientIp, hashIp } from './security-events.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

export interface RateLimitResult {
  allowed: boolean
  reason?: 'ip' | 'email'
}

export async function checkRateLimit(params: {
  req: Request
  endpoint: string
  email?: string | null
  windowSeconds?: number
  maxHits?: number
}): Promise<RateLimitResult> {
  const windowSeconds = params.windowSeconds ?? 300 // 5 minutes, matching Supabase's own auth rate-limit window
  const maxHits = params.maxHits ?? 10

  const ip = extractClientIp(params.req)
  const ipHash = await hashIp(ip)

  if (ipHash) {
    const { data: ipAllowed, error: ipError } = await supabase.rpc('check_rate_limit', {
      p_bucket_key: `${params.endpoint}:ip:${ipHash}`,
      p_window_seconds: windowSeconds,
      p_max_hits: maxHits,
    })
    // Fail OPEN on an RPC error (never block a real user because our own
    // rate-limit bookkeeping had a hiccup) — but never fail closed either,
    // matching RNF-02.
    if (!ipError && ipAllowed === false) return { allowed: false, reason: 'ip' }
  }

  if (params.email) {
    const { data: emailAllowed, error: emailError } = await supabase.rpc('check_rate_limit', {
      p_bucket_key: `${params.endpoint}:email:${params.email.trim().toLowerCase()}`,
      p_window_seconds: windowSeconds,
      p_max_hits: maxHits,
    })
    if (!emailError && emailAllowed === false) return { allowed: false, reason: 'email' }
  }

  return { allowed: true }
}
