// T16.d.2 (REQ-17): generador de PDF mínimo, hecho a mano, sin librería pesada — mismo nivel de
// esfuerzo que el CSV de T16.b (string building + escape, nada de streams comprimidos ni fuentes
// embebidas). Un único tipo de letra (Courier, siempre disponible en cualquier lector PDF, sin
// necesidad de incrustarla) y texto plano maquetado en líneas, paginado automáticamente.
//
// Fuera de alcance a propósito: PDFDocEncoding/WinAnsiEncoding reales para tildes. En vez de eso,
// `sanitizeForPdf` transcribe los acentos españoles más comunes a su equivalente ASCII y sustituye
// cualquier otro carácter fuera del rango imprimible por `?` — nunca corrompe el PDF, a costa de
// perder el acento en el texto mostrado (el JSON del mismo expediente conserva el texto exacto).

const PAGE_WIDTH = 612 // Letter, en puntos (72 por pulgada)
const PAGE_HEIGHT = 792
const MARGIN = 54
const FONT_SIZE = 10
const LINE_HEIGHT = 12
const LINES_PER_PAGE = Math.floor((PAGE_HEIGHT - 2 * MARGIN) / LINE_HEIGHT)

const PDF_TRANSLITERATIONS: Record<string, string> = {
  á: 'a', é: 'e', í: 'i', ó: 'o', ú: 'u', ñ: 'n', ü: 'u',
  Á: 'A', É: 'E', Í: 'I', Ó: 'O', Ú: 'U', Ñ: 'N', Ü: 'U',
  '¿': '?', '¡': '!', '“': '"', '”': '"', '‘': "'", '’': "'", '–': '-', '—': '-',
}

function sanitizeForPdf(text: string): string {
  let out = ''
  for (const ch of text) {
    const mapped = PDF_TRANSLITERATIONS[ch]
    if (mapped !== undefined) {
      out += mapped
      continue
    }
    const code = ch.codePointAt(0) ?? 0
    out += code >= 0x20 && code <= 0x7e ? ch : '?'
  }
  return out
}

// Una cadena literal PDF `(...)` escapa barra invertida y paréntesis (PDF 32000-1, 7.3.4.2).
function escapePdfText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
}

/** Construye un PDF de una sola fuente (Courier), paginando `lines` a razón de `LINES_PER_PAGE` por
 *  página. Siempre produce al menos una página, incluso con `lines` vacío. */
export function buildSimplePdf(lines: string[]): Uint8Array {
  const sanitized = lines.map(sanitizeForPdf)
  const pages: string[][] = []
  for (let i = 0; i < sanitized.length; i += LINES_PER_PAGE) {
    pages.push(sanitized.slice(i, i + LINES_PER_PAGE))
  }
  if (pages.length === 0) pages.push([])

  const FONT_OBJ = 3
  const pageObjNums: number[] = []
  const contentObjNums: number[] = []
  let nextObjNum = 4
  for (let p = 0; p < pages.length; p++) {
    pageObjNums.push(nextObjNum++)
    contentObjNums.push(nextObjNum++)
  }

  const objects: string[] = [
    `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`,
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjNums.map((n) => `${n} 0 R`).join(' ')}] /Count ${pages.length} >>\nendobj\n`,
    `${FONT_OBJ} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Courier >>\nendobj\n`,
  ]

  for (let p = 0; p < pages.length; p++) {
    const stream = pages[p]
      .map((line, idx) => {
        const y = PAGE_HEIGHT - MARGIN - idx * LINE_HEIGHT
        return `BT /F1 ${FONT_SIZE} Tf ${MARGIN} ${y} Td (${escapePdfText(line)}) Tj ET`
      })
      .join('\n')
    objects.push(
      `${pageObjNums[p]} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] ` +
        `/Resources << /Font << /F1 ${FONT_OBJ} 0 R >> >> /Contents ${contentObjNums[p]} 0 R >>\nendobj\n`,
    )
    objects.push(`${contentObjNums[p]} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj\n`)
  }

  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  for (const obj of objects) {
    offsets.push(pdf.length)
    pdf += obj
  }
  const xrefOffset = pdf.length
  const totalObjects = objects.length + 1 // +1: entrada libre del objeto 0
  let xref = `xref\n0 ${totalObjects}\n0000000000 65535 f \n`
  for (const offset of offsets) {
    xref += `${String(offset).padStart(10, '0')} 00000 n \n`
  }
  pdf += xref
  pdf += `trailer\n<< /Size ${totalObjects} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`

  return new TextEncoder().encode(pdf)
}
