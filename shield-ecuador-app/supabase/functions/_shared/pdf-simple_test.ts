// Run: deno test --allow-env supabase/functions/_shared/pdf-simple_test.ts
import { assert, assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { buildSimplePdf } from './pdf-simple.ts'

function text(pdf: Uint8Array): string {
  return new TextDecoder().decode(pdf)
}

Deno.test('buildSimplePdf: cabecera, trailer y %%EOF de un PDF válido', () => {
  const pdf = buildSimplePdf(['línea de prueba'])
  const out = text(pdf)
  assert(out.startsWith('%PDF-1.4\n'))
  assert(out.includes('trailer'))
  assert(out.endsWith('%%EOF'))
  assert(out.includes('/Type /Catalog'))
  assert(out.includes('/BaseFont /Courier'))
})

Deno.test('buildSimplePdf: cada línea aparece como texto plano dentro del flujo de contenido', () => {
  const pdf = buildSimplePdf(['CD-2026-000123', 'granted', 'registro_aprendizaje'])
  const out = text(pdf)
  assert(out.includes('(CD-2026-000123)'))
  assert(out.includes('(granted)'))
  assert(out.includes('(registro_aprendizaje)'))
})

Deno.test('buildSimplePdf: sin líneas sigue produciendo un PDF válido de una sola página vacía', () => {
  const pdf = buildSimplePdf([])
  const out = text(pdf)
  assert(out.startsWith('%PDF-1.4\n'))
  assert(out.includes('/Count 1'))
})

Deno.test('buildSimplePdf: pagina cuando hay más líneas que las que caben en una página', () => {
  const manyLines = Array.from({ length: 70 }, (_, i) => `fila ${i}`)
  const pdf = buildSimplePdf(manyLines)
  const out = text(pdf)
  assert(out.includes('/Count 2'))
  assert(out.includes('(fila 0)'))
  assert(out.includes('(fila 69)'))
})

Deno.test('buildSimplePdf: escapa paréntesis y barra invertida en el texto (evita romper la cadena PDF)', () => {
  const pdf = buildSimplePdf(['motivo (caso) con \\ barra'])
  const out = text(pdf)
  assert(out.includes('(motivo \\(caso\\) con \\\\ barra)'))
})

Deno.test('buildSimplePdf: transcribe acentos/eñes comunes a ASCII sin corromper el PDF', () => {
  const pdf = buildSimplePdf(['solicitud de información — José Muñoz'])
  const out = text(pdf)
  assert(out.includes('(solicitud de informacion - Jose Munoz)'))
})

Deno.test('buildSimplePdf: offsets del xref coinciden con la posición real de cada objeto', () => {
  const pdf = buildSimplePdf(['fila 1', 'fila 2'])
  const out = text(pdf)
  const xrefMatch = /startxref\n(\d+)\n%%EOF$/.exec(out)
  assert(xrefMatch)
  const xrefOffset = Number(xrefMatch![1])
  assertEquals(out.slice(xrefOffset, xrefOffset + 4), 'xref')

  const xrefBlock = out.slice(xrefOffset)
  const lines = xrefBlock.split('\n').slice(2) // salta "xref" y "0 N"
  const firstEntry = lines[1] // lines[0] es la entrada libre del objeto 0
  const firstOffset = Number(firstEntry.split(' ')[0])
  assertEquals(out.slice(firstOffset, firstOffset + 7), '1 0 obj')
})
