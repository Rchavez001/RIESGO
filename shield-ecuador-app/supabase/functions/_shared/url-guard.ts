// Guards for URLs an administrator can configure (news sources, manual-content URLs, provider base_url) that
// the server then fetches. Without them the Edge Function is an SSRF proxy: it would happily request
// http://169.254.169.254/…, http://localhost:…, internal hostnames or file-like schemes and return the text.
//
// Pure functions (no Deno APIs) so they can be unit tested from Node; see tests/url-guard.test.cjs.

export const PRIVATE_SUFFIXES = ['.localhost', '.local', '.internal', '.intranet', '.lan', '.home', '.corp', '.private']

function ipv4Parts(host: string): number[] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!m) return null
  const parts = m.slice(1).map(Number)
  return parts.every((p) => p >= 0 && p <= 255) ? parts : null
}

export function isPrivateIpv4(host: string): boolean {
  const p = ipv4Parts(host)
  if (!p) return false
  const [a, b] = p
  return (
    a === 0 || a === 10 || a === 127 ||
    (a === 100 && b >= 64 && b <= 127) || // carrier-grade NAT
    (a === 169 && b === 254) ||           // link-local, incl. cloud metadata 169.254.169.254
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 192 && b === 0) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224                              // multicast / reserved
  )
}

// Returns null when the URL is acceptable, otherwise a short Spanish reason for the administrator.
export function publicHttpUrlProblem(raw: string, opts: { httpsOnly?: boolean } = {}): string | null {
  let url: URL
  try {
    url = new URL(String(raw).trim())
  } catch {
    return 'La dirección no es válida.'
  }
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && !opts.httpsOnly)) {
    return opts.httpsOnly ? 'Solo se permiten direcciones https://.' : 'Solo se permiten direcciones http:// o https://.'
  }
  if (url.username || url.password) return 'La dirección no puede incluir usuario ni contraseña.'
  const host = url.hostname.toLowerCase().replace(/\.$/, '')
  if (!host) return 'La dirección no tiene un servidor.'
  if (host === 'localhost' || PRIVATE_SUFFIXES.some((s) => host.endsWith(s))) return 'No se permiten servidores locales o internos.'
  if (host.startsWith('[') || host.includes(':')) return 'No se permiten direcciones IPv6 directas.'
  if (isPrivateIpv4(host)) return 'No se permiten direcciones IP privadas o reservadas.'
  // Decimal / hex / octal spellings of an IPv4 address (http://2130706433/, http://0x7f000001/) resolve to private hosts.
  if (/^\d+$/.test(host) || /^0x[0-9a-f]+$/i.test(host)) return 'No se permiten direcciones IP escritas en formato numérico.'
  if (!host.includes('.')) return 'La dirección debe usar un dominio público.'
  return null
}
