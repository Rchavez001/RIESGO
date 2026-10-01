// Run: deno test --allow-read supabase/functions/_shared/consent-render_test.ts
import { assertEquals, assertNotEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { CONSENT_MARKER_NAMES, renderConsent, sha256Hex, type DocumentForRender, type PrivacySettingsForRender } from './consent-render.ts'

const SETTINGS: PrivacySettingsForRender = {
  controller_name: 'Club de Prueba', controller_address: 'Calle Falsa 123', controller_phone: '+593 00 000 0000',
  privacy_email: 'privacidad@example.test', dpo_name: 'Delegado Prueba', dpo_contact: 'delegado@example.test',
  privacy_policy_url: 'https://example.test/politica', unsubscribe_subject: 'Baja de prueba', response_days: 15, ip_retention_days: 730,
}
const DOC: DocumentForRender = { version: '1.0', published_at: '2026-09-28T15:00:00Z' }

Deno.test('resuelve los 11 marcadores del aviso', () => {
  const md = CONSENT_MARKER_NAMES.map((n) => `${n}=[{{${n}}}]`).join('\n')
  const out = renderConsent(md, SETTINGS, DOC)
  assertEquals(out.unknown, [])
  assertEquals(out.unresolved, [])
  assertEquals(CONSENT_MARKER_NAMES.length, 11)
  for (const value of ['1.0', '2026-09-28', 'Club de Prueba', 'Calle Falsa 123', '+593 00 000 0000', 'privacidad@example.test',
    'Delegado Prueba — delegado@example.test', 'Baja de prueba', '15', 'https://example.test/politica', '730']) {
    assertEquals(out.text.includes(`[${value}]`), true, `falta ${value}`)
  }
  assertEquals(out.text.includes('{{'), false)
})

Deno.test('un marcador desconocido se reporta y NO se deja pasar en silencio', () => {
  const out = renderConsent('Hola {{no_existe}} y {{ Version }} y {{}}', SETTINGS, DOC)
  assertEquals(out.unknown.sort(), ['', 'Version', 'no_existe'].sort())
  assertEquals(out.text.includes('{{no_existe}}'), true) // el texto queda visible para que falle a la vista, nunca desaparece
})

Deno.test('un marcador conocido sin valor queda "sin resolver" (bloquea publicar)', () => {
  for (const empty of [null, '', '   ']) {
    const out = renderConsent('Tel: {{responsable_telefono}}', { ...SETTINGS, controller_phone: empty }, DOC)
    assertEquals(out.unresolved, ['responsable_telefono'])
    assertEquals(out.unknown, [])
  }
})

Deno.test('un borrador aún no tiene fecha de vigencia: queda sin resolver hasta publicarse', () => {
  const out = renderConsent('Vigente desde {{fecha_vigencia}}', SETTINGS, { version: '1.1', published_at: null })
  assertEquals(out.unresolved, ['fecha_vigencia'])
})

Deno.test('los comentarios HTML se descartan ANTES de resolver: un marcador dentro de uno no cuenta', () => {
  const out = renderConsent('Antes <!-- nota {{marcador_falso}} {{version}} --> Después {{version}}', SETTINGS, DOC)
  assertEquals(out.unknown, [])
  assertEquals(out.text.includes('<!--'), false)
  assertEquals(out.text.includes('nota'), false)
  assertEquals(out.text.trim(), 'Antes  Después 1.0')
})

Deno.test('la fecha de vigencia es la de Ecuador, no la del servidor', () => {
  // 03:30 UTC del 29 = 22:30 del 28 en Guayaquil (UTC-5)
  assertEquals(renderConsent('{{fecha_vigencia}}', SETTINGS, { version: '1', published_at: '2026-09-29T03:30:00Z' }).text.trim(), '2026-09-28')
})

Deno.test('dpo_contacto: nombre y contacto juntos, o solo el contacto si no hay nombre', () => {
  assertEquals(renderConsent('{{dpo_contacto}}', { ...SETTINGS, dpo_name: null }, DOC).text.trim(), 'delegado@example.test')
})

Deno.test('la huella es estable y cambia si cambia cualquier valor que el usuario lee', async () => {
  const md = 'A {{correo_privacidad}} B {{plazo_respuesta_dias}} C {{retencion_ip_dias}}'
  const base = await sha256Hex(renderConsent(md, SETTINGS, DOC).text)
  assertEquals(await sha256Hex(renderConsent(md, SETTINGS, DOC).text), base)
  assertNotEquals(await sha256Hex(renderConsent(md, { ...SETTINGS, privacy_email: 'otro@example.test' }, DOC).text), base)
  assertNotEquals(await sha256Hex(renderConsent(md, { ...SETTINGS, response_days: 20 }, DOC).text), base)
  assertNotEquals(await sha256Hex(renderConsent(md, { ...SETTINGS, ip_retention_days: 365 }, DOC).text), base)
})

Deno.test('el seed real del aviso v1.0 se renderiza limpio con datos completos', () => {
  const seed = Deno.readTextFileSync(new URL('../../../../loop-consentimiento/seed/aviso_consentimiento_v1.0.md', import.meta.url))
  const out = renderConsent(seed, SETTINGS, DOC)
  assertEquals(out.unknown, [], 'el seed usa un marcador que el renderizador no conoce')
  assertEquals(out.unresolved, [])
  assertEquals(out.text.includes('<!--'), false)
  assertEquals(out.text.includes('{{'), false)
  assertEquals(out.text.includes('privacidad@example.test'), true)
  assertEquals(out.text.includes('FINALIDADES'), false) // el bloque de finalidades es un comentario: no se muestra
})

Deno.test('el seed real con datos INCOMPLETOS reporta exactamente lo que falta (lo que bloquearía publicar)', () => {
  const seed = Deno.readTextFileSync(new URL('../../../../loop-consentimiento/seed/aviso_consentimiento_v1.0.md', import.meta.url))
  const out = renderConsent(seed, { ...SETTINGS, controller_name: null, controller_address: null, controller_phone: null, dpo_contact: null, dpo_name: null }, { version: '1.0', published_at: null })
  assertEquals(out.unknown, [])
  assertEquals(out.unresolved.sort(), ['dpo_contacto', 'fecha_vigencia', 'responsable_domicilio', 'responsable_nombre', 'responsable_telefono'])
})
