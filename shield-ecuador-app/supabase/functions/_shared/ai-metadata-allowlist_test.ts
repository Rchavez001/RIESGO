// AI-LOGS-ALLOWLIST (P2): sanitizeMetadata()/sanitizeEventsForAi() son las funciones que filtran
// `security_events.metadata` antes de que security-diagnose lo reenvíe a un proveedor externo de
// IA. Pruebas unitarias puras, sin Postgres real ni mock de la cadena de proveedores: lo que se
// verifica es el filtrado de datos, no una escritura nueva en la base.
// Run: deno test --allow-env --allow-read supabase/functions/_shared/ai-metadata-allowlist_test.ts
import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { sanitizeEventsForAi, sanitizeMetadata } from './ai-metadata-allowlist.ts'

Deno.test('metadata con correo e IP: se descarta por completo (ninguna de las dos claves está permitida)', () => {
  assertEquals(sanitizeMetadata({ email: 'ana@example.test', ip: '192.0.2.10' }), {})
})

Deno.test('metadata con un objeto anidado bajo una clave permitida: se descarta (no es texto/número/booleano/arreglo de texto)', () => {
  assertEquals(sanitizeMetadata({ reason: { email: 'ana@example.test' } }), {})
})

Deno.test('reason/name/keys (los 3 que usan hoy las llamadas reales a logSecurityEvent): pasan íntegros', () => {
  assertEquals(sanitizeMetadata({ reason: 'rate_limited' }), { reason: 'rate_limited' })
  assertEquals(sanitizeMetadata({ name: 'TypeError' }), { name: 'TypeError' })
  assertEquals(sanitizeMetadata({ keys: ['ip', 'client_ip'] }), { keys: ['ip', 'client_ip'] })
})

Deno.test('clave desconocida: se descarta aunque el valor sea inocente (la lista es cerrada, no "todo lo que no sea sospechoso")', () => {
  assertEquals(sanitizeMetadata({ status: 'ok', reason: 'rate_limited' }), { reason: 'rate_limited' })
})

Deno.test('arreglo con un valor no-texto bajo una clave permitida: se descarta esa clave entera', () => {
  assertEquals(sanitizeMetadata({ keys: ['ip', { nested: true }] }), {})
})

Deno.test('metadata nulo, no-objeto o arreglo: da {} sin lanzar', () => {
  assertEquals(sanitizeMetadata(null), {})
  assertEquals(sanitizeMetadata(undefined), {})
  assertEquals(sanitizeMetadata('texto suelto'), {})
  assertEquals(sanitizeMetadata(['a', 'b']), {})
})

Deno.test('metadata vacío: da {} (caso normal — la mayoría de las llamadas reales no ponen nada)', () => {
  assertEquals(sanitizeMetadata({}), {})
})

Deno.test('sanitizeEventsForAi: filtra metadata en cada evento sin tocar el resto de las columnas', () => {
  const events: Array<{ created_at: string; endpoint: string; event_type: string; severity: string; metadata: Record<string, unknown> }> = [
    { created_at: '2026-10-01T00:00:00Z', endpoint: 'login', event_type: 'rate_limit_exceeded', severity: 'media', metadata: { reason: 'rate_limited', email: 'ana@example.test' } },
    { created_at: '2026-10-02T00:00:00Z', endpoint: 'secure-register-user', event_type: 'registration_failed', severity: 'alta', metadata: { ip: '198.51.100.7' } },
  ]
  const sanitized = sanitizeEventsForAi(events)
  assertEquals(sanitized.length, 2)
  assertEquals(sanitized[0].metadata, { reason: 'rate_limited' })
  assertEquals(sanitized[1].metadata, {})
  assertEquals(sanitized[0].created_at, events[0].created_at)
  assertEquals(sanitized[0].endpoint, events[0].endpoint)
  // Ningún correo ni IP sobrevive en lo que se construiría como aiPayload.
  assertEquals(JSON.stringify(sanitized).includes('example.test'), false)
  assertEquals(JSON.stringify(sanitized).includes('198.51.100.7'), false)
})
