// Run: deno test --allow-env supabase/functions/_shared/email/ssrf-guard_test.ts
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { assertSafeSmtpTarget, isPrivateIpv6, smtpPortProblem } from './ssrf-guard.ts'

function fakeResolver(byType: { A?: string[]; AAAA?: string[] }) {
  return async (_host: string, recordType: 'A' | 'AAAA') => {
    const addrs = byType[recordType]
    if (!addrs) throw new Error('no record')
    return addrs
  }
}

Deno.test('smtpPortProblem: 465 y 2525 permitidos; 25 y 587 rechazados', () => {
  assertEquals(smtpPortProblem(465), null)
  assertEquals(smtpPortProblem(2525), null)
  assertEquals(typeof smtpPortProblem(587), 'string')
  assertEquals(typeof smtpPortProblem(25), 'string')
})

Deno.test('isPrivateIpv6: loopback, link-local, unique-local, multicast, IPv4-mapped privado', () => {
  assertEquals(isPrivateIpv6('::1'), true)
  assertEquals(isPrivateIpv6('fe80::1'), true)
  assertEquals(isPrivateIpv6('fc00::1'), true)
  assertEquals(isPrivateIpv6('fd00:ec2::254'), true) // metadata AWS IPv6
  assertEquals(isPrivateIpv6('ff02::1'), true)
  assertEquals(isPrivateIpv6('::ffff:10.0.0.5'), true) // IPv4-mapped privada
  assertEquals(isPrivateIpv6('::ffff:169.254.169.254'), true) // IPv4-mapped metadata
})

Deno.test('isPrivateIpv6: dirección pública no se marca como privada', () => {
  assertEquals(isPrivateIpv6('2001:4860:4860::8888'), false) // Google DNS
  assertEquals(isPrivateIpv6('::ffff:8.8.8.8'), false) // IPv4-mapped pública
})

Deno.test('assertSafeSmtpTarget: puerto no permitido -> rechaza sin resolver DNS', async () => {
  let resolverCalled = false
  const result = await assertSafeSmtpTarget('smtp.example.test', 587, { resolveDns: async () => { resolverCalled = true; return [] } })
  assertEquals(result.ok, false)
  assertEquals((result as { errorCode: string }).errorCode, 'smtp_port_not_allowed')
  assertEquals(resolverCalled, false)
})

Deno.test('assertSafeSmtpTarget: host vacío -> smtp_host_invalid', async () => {
  const result = await assertSafeSmtpTarget('', 465)
  assertEquals((result as { errorCode: string }).errorCode, 'smtp_host_invalid')
})

Deno.test('assertSafeSmtpTarget: localhost y sufijos internos -> smtp_host_invalid', async () => {
  assertEquals((await assertSafeSmtpTarget('localhost', 465) as { errorCode: string }).errorCode, 'smtp_host_invalid')
  assertEquals((await assertSafeSmtpTarget('mail.internal', 465) as { errorCode: string }).errorCode, 'smtp_host_invalid')
})

Deno.test('assertSafeSmtpTarget: IP literal privada (IPv4) -> smtp_host_private, sin DNS', async () => {
  let resolverCalled = false
  const result = await assertSafeSmtpTarget('127.0.0.1', 465, { resolveDns: async () => { resolverCalled = true; return [] } })
  assertEquals((result as { errorCode: string }).errorCode, 'smtp_host_private')
  assertEquals(resolverCalled, false)
})

Deno.test('assertSafeSmtpTarget: IP literal metadata (169.254.169.254) -> smtp_host_private', async () => {
  const result = await assertSafeSmtpTarget('169.254.169.254', 465)
  assertEquals((result as { errorCode: string }).errorCode, 'smtp_host_private')
})

Deno.test('assertSafeSmtpTarget: IP literal IPv6 privada -> smtp_host_private', async () => {
  const result = await assertSafeSmtpTarget('fe80::1', 465)
  assertEquals((result as { errorCode: string }).errorCode, 'smtp_host_private')
})

Deno.test('assertSafeSmtpTarget: hostname que resuelve solo a IP privada -> smtp_host_private', async () => {
  const result = await assertSafeSmtpTarget('smtp.example.test', 465, { resolveDns: fakeResolver({ A: ['10.0.0.5'] }) })
  assertEquals((result as { errorCode: string }).errorCode, 'smtp_host_private')
})

Deno.test('assertSafeSmtpTarget: hostname con una A privada y una AAAA pública -> rechaza (cualquier privada basta)', async () => {
  const result = await assertSafeSmtpTarget('smtp.example.test', 465, {
    resolveDns: fakeResolver({ A: ['10.0.0.5'], AAAA: ['2001:4860:4860::8888'] }),
  })
  assertEquals((result as { errorCode: string }).errorCode, 'smtp_host_private')
})

Deno.test('assertSafeSmtpTarget: ninguno de los dos tipos de registro resuelve -> smtp_dns_resolution_failed', async () => {
  const result = await assertSafeSmtpTarget('smtp.example.test', 465, { resolveDns: async () => { throw new Error('NXDOMAIN') } })
  assertEquals((result as { errorCode: string }).errorCode, 'smtp_dns_resolution_failed')
})

Deno.test('assertSafeSmtpTarget: hostname público -> ok con la IP resuelta', async () => {
  const result = await assertSafeSmtpTarget('smtp.example.test', 465, { resolveDns: fakeResolver({ A: ['203.0.113.10'] }) })
  assertEquals(result, { ok: true, resolvedIp: '203.0.113.10' })
})

Deno.test('assertSafeSmtpTarget: IP literal pública -> ok sin llamar al resolver', async () => {
  let resolverCalled = false
  const result = await assertSafeSmtpTarget('203.0.113.10', 2525, { resolveDns: async () => { resolverCalled = true; return [] } })
  assertEquals(result, { ok: true, resolvedIp: '203.0.113.10' })
  assertEquals(resolverCalled, false)
})
