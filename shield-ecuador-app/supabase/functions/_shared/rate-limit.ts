// RF-02: sliding-window rate limiting, keyed by hashed-IP+endpoint AND by
// email+endpoint (whichever the caller passes) — checking both means a
// single IP hammering many emails, and a single email hammered from many
// IPs, both get caught.
//
// Two modes:
//   - default (every existing caller): fails OPEN — a hiccup in our own
//     rate-limit bookkeeping never blocks a real user (RNF-02);
//   - `failClosed: true` (SEC-07, write endpoints of the consent module): if
//     the quota cannot be established for ANY reason — RPC error or throw, no
//     client IP, no HMAC key — the request is rejected with reason
//     'unavailable' (callers should answer 503, not 429). Here the email is
//     also keyed by HMAC instead of in the clear.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { hmacLookup } from './crypto.ts'
import { extractClientIp, hashIp } from './security-events.ts'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
)

export interface RateLimitResult {
  allowed: boolean
  reason?: 'ip' | 'email' | 'unavailable'
}

type RpcResult = { data: unknown; error: unknown }
export type RateLimitRpc = (name: string, args: Record<string, unknown>) => PromiseLike<RpcResult>

const defaultRpc: RateLimitRpc = (name, args) => supabase.rpc(name, args)

export async function checkRateLimit(params: {
  req: Request
  endpoint: string
  email?: string | null
  windowSeconds?: number
  maxHits?: number
  failClosed?: boolean
  // Test seam: replaces the check_rate_limit RPC.
  rpc?: RateLimitRpc
}): Promise<RateLimitResult> {
  const windowSeconds = params.windowSeconds ?? 300 // 5 minutes, matching Supabase's own auth rate-limit window
  const maxHits = params.maxHits ?? 10
  const failClosed = params.failClosed === true
  const rpc = params.rpc ?? defaultRpc
  const unavailable: RateLimitResult = { allowed: false, reason: 'unavailable' }

  const callBucket = async (bucketKey: string): Promise<RpcResult> => {
    const args = { p_bucket_key: bucketKey, p_window_seconds: windowSeconds, p_max_hits: maxHits }
    if (!failClosed) return rpc('check_rate_limit', args) // unchanged: a throw propagates as before
    try {
      return await rpc('check_rate_limit', args)
    } catch {
      return { data: null, error: 'rpc_threw' }
    }
  }
  // Fail-open mode only ever acts on an explicit `false`; fail-closed also
  // refuses anything that is not an explicit `true`.
  const isBlocked = (res: RpcResult) => !res.error && res.data === false
  const isUsable = (res: RpcResult) => !res.error && res.data === true

  const ip = extractClientIp(params.req)
  const ipHash = await hashIp(ip)
  if (failClosed && !ipHash) return unavailable

  if (ipHash) {
    const res = await callBucket(`${params.endpoint}:ip:${ipHash}`)
    if (isBlocked(res)) return { allowed: false, reason: 'ip' }
    if (failClosed && !isUsable(res)) return unavailable
  }

  if (params.email) {
    const normalized = params.email.trim().toLowerCase()
    let emailKey = normalized
    if (failClosed) {
      try {
        emailKey = await hmacLookup(normalized, 'LOOKUP_HMAC_KEY_B64')
      } catch {
        return unavailable
      }
    }
    const res = await callBucket(`${params.endpoint}:email:${emailKey}`)
    if (isBlocked(res)) return { allowed: false, reason: 'email' }
    if (failClosed && !isUsable(res)) return unavailable
  }

  return { allowed: true }
}
