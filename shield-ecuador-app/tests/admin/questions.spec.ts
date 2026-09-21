import { test, expect, Page } from '@playwright/test'

async function openQuestions(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Administrador de Ciber Dojo', level: 1 })).toBeVisible()
  if (await page.evaluate(() => innerWidth <= 1180)) await page.locator('#menuToggle').click()
  await page.locator('.nav-item', { hasText: /^Preguntas$/ }).click()
  await expect(page.locator('#questions')).toHaveClass(/active/)
}

// Captures what would be written to the questions table.
async function captureWrites(page: Page) {
  const writes: Array<Record<string, any>[]> = []
  await page.route('**/api/rest/v1/questions?on_conflict=id', r => { writes.push(JSON.parse(r.request().postData() || '[]')); return r.fulfill({ status: 201, body: '' }) })
  await page.route('**/api/rest/v1/cyber_dojos?on_conflict=id', r => r.fulfill({ status: 201, body: '' }))
  return writes
}

const editQuestion = async (page: Page, list: '#manualQuestions' | '#aiQuestions', n: number, v: { text?: string; answer?: string; explanation?: string; status?: string }) => {
  const ed = page.locator(`${list} .question-editor`).nth(n)
  if (v.text !== undefined) await ed.locator('[data-field="text"]').fill(v.text)
  if (v.answer !== undefined) await ed.locator('[data-field="answer"]').fill(v.answer)
  if (v.explanation !== undefined) await ed.locator('[data-field="explanation"]').fill(v.explanation)
  if (v.status !== undefined) await ed.locator('[data-field="status"]').selectOption(v.status)
}

test.describe('A3 · Preguntas', () => {
  test('el panel dice para qué sirve el banco y ya no promete "20 + 30" ni "plan de 50"', async ({ page }) => {
    await openQuestions(page)
    await expect(page.locator('#questions')).toContainText('alimenta las respuestas del Sensei IA')
    await expect(page.locator('#questions')).toContainText('no se editan aquí')
    await expect(page.locator('#questions')).not.toContainText('20 manuales + 30')
    await expect(page.getByRole('button', { name: /generar plan/i })).toHaveCount(0)
    await expect(page.locator('#manualQuestions .question-editor')).toHaveCount(20)
    await expect(page.locator('#aiQuestions .question-editor')).toHaveCount(30)
    await expect(page.locator('.placeholder-note').first()).toContainText('Fila de ejemplo sin editar')
  })

  test('el selector de dojo del panel funciona sin abrir el borrador de la otra pantalla', async ({ page }) => {
    await openQuestions(page)
    const pick = page.getByLabel('Dojo del borrador')
    expect((await pick.boundingBox())!.height).toBeGreaterThanOrEqual(43.5)
    const options = await pick.locator('option').evaluateAll(os => os.map(o => (o as HTMLOptionElement).value))
    expect(options.length).toBeGreaterThan(1)
    await pick.selectOption(options[1])
    await expect(page.locator('#questionDojoName')).not.toHaveText('-')
    await expect(page.locator('#manualQuestions .question-editor')).toHaveCount(20)
  })

  test('guardar sin editar nada no envía filas de ejemplo a la base de datos', async ({ page }) => {
    const writes = await captureWrites(page)
    await openQuestions(page)
    await page.getByRole('button', { name: 'Guardar preguntas editadas' }).click()
    await expect(page.getByText(/No hay preguntas editadas para guardar/)).toBeVisible()
    expect(writes).toEqual([])
  })

  test('solo se envía lo editado; una aprobada por una persona queda "approved" y una "auditada" sigue "pending"', async ({ page }) => {
    const writes = await captureWrites(page)
    await openQuestions(page)
    await editQuestion(page, '#manualQuestions', 0, { text: '¿Qué haces si un correo del banco pide tu clave?', answer: 'No la compartes y llamas al banco por su número oficial.', explanation: 'Los bancos nunca piden claves por correo.', status: 'aprobada' })
    await editQuestion(page, '#aiQuestions', 0, { text: '¿Cuándo conviene activar el doble factor?', answer: 'En todas las cuentas importantes.', explanation: 'Añade una barrera aunque roben la clave.', status: 'auditada' })
    await page.getByRole('button', { name: 'Guardar preguntas editadas' }).click()
    await expect.poll(() => writes.length).toBe(1)
    const rows = writes[0]
    expect(rows).toHaveLength(2) // las otras 48 filas de ejemplo no viajan
    const manual = rows.find(r => r.source_type === 'manual')!
    const ai = rows.find(r => r.source_type !== 'manual')!
    expect(manual.audit_status).toBe('approved')
    expect(manual.answer_text).toContain('llamas al banco')
    expect(manual.options.find((o: any) => o.correcta).texto).toContain('llamas al banco')
    expect(ai.audit_status).toBe('pending') // antes: "auditada" se guardaba como aprobada
  })

  test('una pregunta aprobada sin respuesta/explicación reales bloquea el guardado', async ({ page }) => {
    const writes = await captureWrites(page)
    await openQuestions(page)
    let message = ''
    page.once('dialog', d => { message = d.message(); void d.accept() })
    await editQuestion(page, '#manualQuestions', 2, { text: 'Una pregunta con texto suficiente', answer: 'Respuesta suficiente aquí.', explanation: 'corta', status: 'aprobada' })
    await page.getByRole('button', { name: 'Guardar preguntas editadas' }).click()
    await expect.poll(() => message).toMatch(/No se guardó nada/)
    expect(message).toContain('#3')
    expect(writes).toEqual([])
  })

  test('texto con HTML hostil se guarda y se vuelve a mostrar como texto', async ({ page }) => {
    await captureWrites(page)
    await openQuestions(page)
    const evil = '</textarea><img src=x onerror="window.__pwn=1"><script>window.__pwn=1</script>'
    await editQuestion(page, '#manualQuestions', 0, { text: evil, answer: 'Respuesta suficiente aquí.', explanation: 'Explicación suficiente aquí.', status: 'aprobada' })
    await page.getByRole('button', { name: 'Guardar preguntas editadas' }).click()
    await expect(page.locator('#manualQuestions .question-editor').first().locator('[data-field="text"]')).toHaveValue(evil)
    expect(await page.locator('#questions img').count()).toBe(0)
    expect(await page.evaluate(() => (window as any).__pwn)).toBeUndefined()
  })

  test('sin scroll horizontal y con controles ≥44 px', async ({ page }) => {
    await openQuestions(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const small = await page.evaluate(() => [...document.querySelectorAll('#questions button, #questions select, #questions input, #questions textarea')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && r.height < 43.5 }).length)
    expect(small).toBe(0)
  })
})
