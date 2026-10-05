// Guard for the SMTP host/port an administrator configures in email_transport_settings (T12.b, SEC-09).
// Without it, SmtpSender (T12.c) would happily connect to 169.254.169.254 (cloud metadata), 127.0.0.1,
// an internal hostname, or a port Supabase already blocks (25/587) — same SSRF class as url-guard.ts,
// but this guard resolves DNS itself (SMTP has no redirect-following HTTP client to lean on) and checks
// both A and AAAA records, including IPv4-mapped IPv6 (::ffff:10.0.0.1), which url-guard.ts does not
// need to because it rejects every literal IPv6 host outright.
import { isPrivateIpv4, PRIVATE_SUFFIXES } from '../url-guard.ts'

export type ResolveDns = (hostname: string, recordType: 'A' | 'AAAA') => Promise<string[]>

export type SmtpTargetResult =
  | { ok: true; resolvedIp: string }
  | { ok: false; errorCode: string; message: string }

function expandIpv6(raw: string): number[] | null {
  let host = raw.trim().toLowerCase()
  if (host.startsWith('[') && host.endsWith(']')) host = host.slice(1, -1)
  const zoneIdx = host.indexOf('%')
  if (zoneIdx !== -1) host = host.slice(0, zoneIdx)
  if (!host.includes(':')) return null
  const sides = host.split('::')
  if (sides.length > 2) return null

  const expandEmbeddedIpv4 = (groups: string[]): string[] | null => {
    if (groups.length === 0) return groups
    const last = groups[groups.length - 1]
    if (!last.includes('.')) return groups
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(last)
    if (!m) return null
    const parts = m.slice(1).map(Number)
    if (!parts.every((p) => p >= 0 && p <= 255)) return null
    const hi = ((parts[0] << 8) | parts[1]).toString(16)
    const lo = ((parts[2] << 8) | parts[3]).toString(16)
    return [...groups.slice(0, -1), hi, lo]
  }

  const head = expandEmbeddedIpv4(sides[0] === '' ? [] : sides[0].split(':'))
  if (head === null) return null
  const tail = sides.length === 2 ? expandEmbeddedIpv4(sides[1] === '' ? [] : sides[1].split(':')) : []
  if (tail === null) return null

  let groups: string[]
  if (sides.length === 1) {
    if (head.length !== 8) return null
    groups = head
  } else {
    const missing = 8 - head.length - tail.length
    if (missing < 0) return null
    groups = [...head, ...Array(missing).fill('0'), ...tail]
  }
  if (groups.length !== 8) return null
  const nums = groups.map((g) => parseInt(g === '' ? '0' : g, 16))
  if (nums.some((n) => Number.isNaN(n) || n < 0 || n > 0xffff)) return null
  return nums
}

// loopback (::1), unspecified (::), link-local (fe80::/10), unique-local (fc00::/7, covers known IPv6
// metadata endpoints like fd00:ec2::254), multicast (ff00::/8), and IPv4-mapped (::ffff:a.b.c.d, checked
// against isPrivateIpv4 on the embedded address).
export function isPrivateIpv6(raw: string): boolean {
  const g = expandIpv6(raw)
  if (!g) return false
  const [g0, g1, g2, g3, g4, g5, g6, g7] = g
  if (g.every((x) => x === 0)) return true
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0 && g6 === 0 && g7 === 1) return true
  const topByte = (g0 >> 8) & 0xff
  const secondByte = g0 & 0xff
  if (topByte === 0xfe && secondByte >= 0x80 && secondByte <= 0xbf) return true // fe80::/10
  if (topByte === 0xfc || topByte === 0xfd) return true // fc00::/7
  if (topByte === 0xff) return true // ff00::/8
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
    const a = (g6 >> 8) & 0xff, b = g6 & 0xff, c = (g7 >> 8) & 0xff, d = g7 & 0xff
    return isPrivateIpv4(`${a}.${b}.${c}.${d}`)
  }
  return false
}

// Supabase blocks outbound 25 and 587; only 465 (implicit TLS) and 2525 (common submission alternative)
// are reachable — same constraint already baked into the CHECK of email_transport_settings (079).
export function smtpPortProblem(port: number): string | null {
  if (port === 465 || port === 2525) return null
  return 'Supabase bloquea los puertos 25 y 587; solo se permiten 465 o 2525.'
}

function smtpHostFormatProblem(host: string): string | null {
  if (!host) return 'El servidor SMTP no puede estar vacío.'
  if (host === 'localhost' || PRIVATE_SUFFIXES.some((s) => host.endsWith(s))) {
    return 'No se permiten servidores locales o internos.'
  }
  return null
}

function privateHostResult(): SmtpTargetResult {
  return { ok: false, errorCode: 'smtp_host_private', message: 'El servidor SMTP resuelve a una dirección IP privada, interna o de metadatos.' }
}

const IPV4_LITERAL = /^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}$/

// Rejects before ever opening a connection: disallowed port, malformed/local host, or a host that (by
// literal IP or by DNS resolution) is private/loopback/link-local/metadata. Call this again right before
// every send (SmtpSender does), not only when the admin saves the config — it re-resolves DNS each time,
// which is what actually matters for a stored, admin-configured hostname (narrows, though does not fully
// eliminate, a DNS-rebinding window between this check and the real connection; see PROGRESS.md T12.c).
export async function assertSafeSmtpTarget(
  rawHost: string,
  port: number,
  deps: { resolveDns?: ResolveDns } = {},
): Promise<SmtpTargetResult> {
  const portProblem = smtpPortProblem(port)
  if (portProblem) return { ok: false, errorCode: 'smtp_port_not_allowed', message: portProblem }

  const host = rawHost.trim().toLowerCase().replace(/\.$/, '')
  const formatProblem = smtpHostFormatProblem(host)
  if (formatProblem) return { ok: false, errorCode: 'smtp_host_invalid', message: formatProblem }

  if (IPV4_LITERAL.test(host)) {
    return isPrivateIpv4(host) ? privateHostResult() : { ok: true, resolvedIp: host }
  }
  if (host.includes(':')) {
    return isPrivateIpv6(host) ? privateHostResult() : { ok: true, resolvedIp: host }
  }

  const resolveDns: ResolveDns = deps.resolveDns ?? ((h, t) => Deno.resolveDns(h, t))
  const addresses: string[] = []
  for (const recordType of ['A', 'AAAA'] as const) {
    try {
      addresses.push(...(await resolveDns(host, recordType)))
    } catch {
      // Falta uno de los dos tipos de registro no es un error: muchos hosts solo tienen A o solo AAAA.
    }
  }
  if (addresses.length === 0) {
    return { ok: false, errorCode: 'smtp_dns_resolution_failed', message: 'No se pudo resolver el servidor SMTP.' }
  }
  if (addresses.some((addr) => isPrivateIpv4(addr) || isPrivateIpv6(addr))) {
    return privateHostResult()
  }
  return { ok: true, resolvedIp: addresses[0] }
}
