// REQ-05: the evidence IP must come from what the TRUSTED proxy appended, never from what the client
// sent. Measured locally (T03): the proxy APPENDS the real address to X-Forwarded-For and leaves any
// client-supplied values in front — `curl -H "X-Forwarded-For: 9.9.9.9"` arrives as "9.9.9.9, <real>".
// So the FIRST entry (what security-events.ts extractClientIp reads) is attacker-controlled, and the
// trustworthy one is counted from the END: with N trusted proxies, the client is entry `length - N`.
//
// TRUSTED_PROXY_HOPS = number of proxies that append to the chain in front of the function.
//   local Supabase (Kong): 1 (default).
//   hosted Supabase: NOT yet measured — must be verified in the real environment before relying on
//   the default (a wrong value records a proxy address instead of the client). Open item T03.
export function getClientIp(req: Request, hops = trustedProxyHops()): string | null {
  const chain = (req.headers.get('x-forwarded-for') ?? '').split(',').map((part) => part.trim()).filter(Boolean)
  if (hops < 1 || chain.length < hops) return null
  return normalizeIp(chain[chain.length - hops])
}

function trustedProxyHops(): number {
  const raw = Number(Deno.env.get('TRUSTED_PROXY_HOPS') ?? '1')
  return Number.isInteger(raw) && raw >= 1 ? raw : 1
}

// IPv4 as written; IPv6 in canonical lower-case compressed form (the URL parser does the compression),
// so the same address always produces the same HMAC. Anything that is not an IP is rejected.
export function normalizeIp(value: string): string | null {
  const candidate = value.trim().replace(/^\[|\]$/g, '')
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(candidate)) {
    return candidate.split('.').every((octet) => Number(octet) <= 255) ? candidate.split('.').map(Number).join('.') : null
  }
  if (candidate.includes(':') && /^[0-9a-fA-F:.]+$/.test(candidate)) {
    try {
      return new URL(`http://[${candidate}]`).hostname.replace(/^\[|\]$/g, '')
    } catch {
      return null
    }
  }
  return null
}
