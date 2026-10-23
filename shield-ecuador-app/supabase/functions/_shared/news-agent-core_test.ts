// NEWS-MAMMOTH (P2): confirma que extractTextFromFile() procesa un .docx real de punta a punta
// tras cambiar el import de mammoth (`export =` vs `export default`, ver cabecera de
// news-agent-core.ts) — no solo que el tipo compile, sino que el valor en tiempo de ejecución
// siga siendo el mismo objeto con extractRawText().
// Run: deno test --allow-env --allow-read supabase/functions/_shared/news-agent-core_test.ts
import { assertEquals, assertStringIncludes } from 'https://deno.land/std@0.168.0/testing/asserts.ts'

// news-agent-core.ts crea un cliente de Supabase a nivel de módulo (createClient(...)), que
// lanza de inmediato si la URL está vacía — hace falta esto antes de importarlo, igual que en
// submit-consent/index_test.ts y el resto de las pruebas de funciones reales de este repo.
Deno.env.set('SUPABASE_URL', 'http://127.0.0.1:0')
Deno.env.set('SUPABASE_SERVICE_ROLE_KEY', 'test-service-key')

const { extractTextFromFile } = await import('./news-agent-core.ts')

Deno.test('extractTextFromFile: .docx mínimo se extrae con el texto esperado (mammoth)', async () => {
  const bytes = await Deno.readFile(new URL('./fixtures/minimal.docx', import.meta.url))
  const text = await extractTextFromFile(bytes, 'prueba.docx')
  assertStringIncludes(text, 'prueba docx minima NEWS-MAMMOTH 2026-10-23')
})

Deno.test('extractTextFromFile: extensión no soportada da un error claro, no un crash silencioso', async () => {
  let threw = false
  try {
    await extractTextFromFile(new TextEncoder().encode('x'), 'archivo.exe')
  } catch (err) {
    threw = true
    assertStringIncludes((err as Error).message, 'no soportado')
  }
  assertEquals(threw, true)
})
