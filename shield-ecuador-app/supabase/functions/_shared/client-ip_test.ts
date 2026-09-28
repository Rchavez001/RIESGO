// Run: deno test --allow-env supabase/functions/_shared/client-ip_test.ts
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { getClientIp, normalizeIp } from './client-ip.ts'

const req = (xff?: string) => new Request('http://localhost/fn', xff === undefined ? {} : { headers: { 'x-forwarded-for': xff } })

Deno.test('un solo valor (lo que añadió el proxy) es la IP del cliente', () => {
  assertEquals(getClientIp(req('203.0.113.9')), '203.0.113.9')
})

Deno.test('lo que el cliente antepone se ignora: se usa el valor que añadió el proxy, al final', () => {
  assertEquals(getClientIp(req('9.9.9.9, 203.0.113.9')), '203.0.113.9')
  assertEquals(getClientIp(req('9.9.9.9, 8.8.8.8, 203.0.113.9')), '203.0.113.9')
})

Deno.test('con 2 proxies de confianza el cliente es el penúltimo', () => {
  assertEquals(getClientIp(req('9.9.9.9, 203.0.113.9, 10.0.0.2'), 2), '203.0.113.9')
})

Deno.test('cadena más corta que los saltos de confianza, ausente o vacía → null (no se adivina)', () => {
  assertEquals(getClientIp(req('203.0.113.9'), 2), null)
  assertEquals(getClientIp(req()), null)
  assertEquals(getClientIp(req('  ,  ')), null)
})

Deno.test('un valor que no es una IP se rechaza', () => {
  assertEquals(getClientIp(req('1.2.3.4, no-soy-una-ip')), null)
  assertEquals(getClientIp(req("1.2.3.4, 1.2.3.4'; DROP TABLE x;--")), null)
  assertEquals(getClientIp(req('999.1.1.1')), null)
})

Deno.test('IPv6 y IPv4 se normalizan a una forma única (mismo HMAC siempre)', () => {
  assertEquals(normalizeIp('2001:DB8:0:0:0:0:0:1'), '2001:db8::1')
  assertEquals(normalizeIp('[2001:db8::1]'), '2001:db8::1')
  assertEquals(normalizeIp('203.000.113.009'), '203.0.113.9')
  assertEquals(getClientIp(req('9.9.9.9, 2001:DB8::0:1')), '2001:db8::1')
})

Deno.test('TRUSTED_PROXY_HOPS se lee del entorno y un valor inválido cae a 1', () => {
  Deno.env.set('TRUSTED_PROXY_HOPS', '2')
  assertEquals(getClientIp(req('9.9.9.9, 203.0.113.9, 10.0.0.2')), '203.0.113.9')
  Deno.env.set('TRUSTED_PROXY_HOPS', 'abc')
  assertEquals(getClientIp(req('9.9.9.9, 203.0.113.9')), '203.0.113.9')
  Deno.env.delete('TRUSTED_PROXY_HOPS')
})
