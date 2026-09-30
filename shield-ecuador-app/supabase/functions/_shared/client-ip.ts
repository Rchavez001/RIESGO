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
// so the same address always produces the same HMAC. IPv4-mapped IPv6 (::ffff:a.b.c.d, any input form)
// collapses to the plain IPv4 form, so a dual-stack client always hashes the same regardless of which
// stack the proxy chain used. A zone id (%eth0, link-local only, never meaningful across a network hop)
// is dropped before validation. Anything that is not an IP is rejected.
export function normalizeIp(value: string): string | null {
  const candidate = value.trim().replace(/^\[|\]$/g, '')
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(candidate)) {
    return candidate.split('.').every((octet) => Number(octet) <= 255) ? candidate.split('.').map(Number).join('.') : null
  }
  const withoutZone = candidate.includes(':') ? candidate.split('%')[0] : candidate
  if (withoutZone.includes(':') && /^[0-9a-fA-F:.]+$/.test(withoutZone)) {
    try {
      const hostname = new URL(`http://[${withoutZone}]`).hostname.replace(/^\[|\]$/g, '')
      const mapped = hostname.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i)
      return mapped ? ipv4FromHexPair(mapped[1], mapped[2]) : hostname
    } catch {
      return null
    }
  }
  return null
}

function ipv4FromHexPair(high: string, low: string): string {
  const h = high.padStart(4, '0')
  const l = low.padStart(4, '0')
  return [h.slice(0, 2), h.slice(2, 4), l.slice(0, 2), l.slice(2, 4)].map((byte) => parseInt(byte, 16)).join('.')
}

// Masks the address for display (e.g. admin evidence views before an explicit "reveal_ip" action):
// IPv4 drops the last octet, IPv6 keeps only the /48 prefix (first 3 hextets). Rejects non-IP input
// the same way normalizeIp does, instead of masking garbage.
export function maskIp(ip: string): string | null {
  const normalized = normalizeIp(ip)
  if (normalized === null) return null
  if (!normalized.includes(':')) {
    const [a, b, c] = normalized.split('.')
    return `${a}.${b}.${c}.xxx`
  }
  const [a, b, c] = expandIpv6(normalized)
  return `${a}:${b}:${c}:xxxx::`
}

function expandIpv6(address: string): string[] {
  const [head, tail] = address.includes('::') ? address.split('::') : [address, undefined]
  const headParts = head ? head.split(':').filter(Boolean) : []
  const tailParts = tail ? tail.split(':').filter(Boolean) : []
  const missing = 8 - headParts.length - tailParts.length
  return [...headParts, ...new Array(Math.max(missing, 0)).fill('0'), ...tailParts]
}
