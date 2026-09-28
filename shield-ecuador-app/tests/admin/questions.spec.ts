import { test, expect, Page } from '@playwright/test'

const OPT = (correctIndex: number, texts: string[]) =>
  texts.map((texto, i) => ({ valor: 'ABCD'[i], texto, correcta: i === correctIndex }))

const Q1 = {
  id: 'manual-1', dojo_id: 'dojo-passwords', source_type: 'manual', audit_status: 'approved', active: true,
  question_text: '¿Qué haces si un correo del banco te pide la clave?',
  explanation: 'Los bancos nunca piden claves por correo.',
  options: OPT(0, ['No la compartes y llamas al banco por su número oficial.', 'La envías si el correo tiene el logo correcto.', 'Respondes con la clave por si acaso.', 'La compartes solo con el asunto marcado urgente.']),
  audit_notes: null, created_at: '2026-09-01T00:00:00Z',
}
const Q2 = {
  id: 'news-1', dojo_id: 'dojo-passwords', source_type: 'news_generated', audit_status: 'pending', active: false,
  question_text: '¿Cuándo conviene activar el doble factor?',
  explanation: 'Añade una barrera aunque roben la clave.',
  options: OPT(0, ['En todas las cuentas importantes.', 'Solo en el correo personal.', 'Nunca, es incómodo.', 'Solo si el banco lo exige.']),
  audit_notes: 'Tema de ciberseguridad: OK. Lenguaje accesible: OK. Respuesta correcta: identificada por la IA.', created_at: '2026-09-02T00:00:00Z',
}

async function setup(page: Page) {
  const store = new Map<string, any>([['manual-1', Q1], ['news-1', Q2]])
  const writes = { post: [] as any[], patch: [] as any[], del: [] as string[] }
  const handle = (r: any) => {
    const req = r.request()
    const url = decodeURIComponent(req.url())
    if (req.method() === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([...store.values()]) })
    if (req.method() === 'POST') {
      const row = JSON.parse(req.postData() || '{}')
      writes.post.push(row)
      store.set(row.id, { ...row, created_at: new Date().toISOString() })
      return r.fulfill({ status: 201, body: '' })
    }
    if (req.method() === 'PATCH') {
      const patch = JSON.parse(req.postData() || '{}')
      writes.patch.push(patch)
      const id = decodeURIComponent(url).match(/id=eq\.([^&]+)/)?.[1]
      if (id && store.has(id)) store.set(id, { ...store.get(id), ...patch })
      return r.fulfill({ status: 204, body: '' })
    }
    if (req.method() === 'DELETE') {
      writes.del.push(url)
      const id = url.match(/id=eq\.([^&]+)/)?.[1]
      if (id) store.delete(id)
      return r.fulfill({ status: 204, body: '' })
    }
    return r.continue()
  }
  await page.route('**/api/rest/v1/questions', handle)
  await page.route('**/api/rest/v1/questions?*', handle)
  await page.route('**/api/rest/v1/cyber_dojos?on_conflict=id', r => r.fulfill({ status: 201, body: '' }))
  return writes
}

async function openQuestions(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Administrador de Ciber Dojo', level: 1 })).toBeVisible()
  if (await page.evaluate(() => innerWidth <= 1180)) await page.locator('#menuToggle').click()
  await page.locator('.nav-item', { hasText: /^Preguntas$/ }).click()
  await expect(page.locator('#questions')).toHaveClass(/active/)
  await page.locator('#questionStatusSelect').selectOption('all')
  await expect(page.locator('.question-card')).toHaveCount(2)
}

test.describe('Banco de preguntas: edición real, subida e IA', () => {
  test('el panel explica la validación de IA y muestra las preguntas reales de la base de datos', async ({ page }) => {
    await setup(page)
    await openQuestions(page)
    await expect(page.locator('#questions')).toContainText('no se editan aquí')
    await expect(page.locator('#questions')).toContainText('validación de IA')
    await expect(page.locator('.question-card').first()).toContainText('correo del banco')
    await expect(page.locator('.question-card').nth(1)).toContainText('doble factor')
  })

  test('filtrar por estado "pendientes" solo muestra la generada por IA sin aprobar', async ({ page }) => {
    await setup(page)
    await openQuestions(page)
    await page.locator('#questionStatusSelect').selectOption('pending')
    await expect(page.locator('.question-card')).toHaveCount(1)
    await expect(page.locator('.question-card')).toContainText('doble factor')
  })

  test('agregar pregunta: pide las 4 opciones y cuál es la correcta antes de guardar', async ({ page }) => {
    const writes = await setup(page)
    await openQuestions(page)
    await page.locator('#addQuestionBtn').click()
    const card = page.locator('.question-card').first()
    await card.locator('.question-save').click()
    await expect(page.getByText(/al menos 10 caracteres/)).toBeVisible()
    expect(writes.post).toEqual([])

    await card.locator('[data-field="question_text"]').fill('¿Qué haces si ves un enlace acortado en un mensaje de WhatsApp?')
    const options = card.locator('[data-field="option"]')
    await options.nth(0).fill('Evitas abrirlo y confirmas con la persona por otro medio.')
    await options.nth(1).fill('Lo abres porque total no cuesta nada mirar.')
    await options.nth(2).fill('Lo reenvías a tus contactos para avisarles.')
    await options.nth(3).fill('Le das tu número de cédula si te lo pide.')
    await card.locator('[data-field="correct"]').nth(0).check()
    await card.locator('.question-save').click()
    await expect.poll(() => writes.post.length).toBe(1)
    expect(writes.post[0].audit_status).toBe('pending')
    expect(writes.post[0].active).toBe(false)
    expect(writes.post[0].options.find((o: any) => o.correcta).texto).toContain('confirmas con la persona')
  })

  test('editar una pregunta aprobada la regresa a pendiente e inactiva hasta re-validarla', async ({ page }) => {
    const writes = await setup(page)
    await openQuestions(page)
    const card = page.locator('.question-card').filter({ hasText: 'correo del banco' })
    await card.locator('[data-field="explanation"]').fill('Los bancos, aseguradoras y tiendas nunca piden la clave por correo ni por teléfono.')
    await card.locator('.question-save').click()
    await expect.poll(() => writes.patch.length).toBe(1)
    expect(writes.patch[0].audit_status).toBe('pending')
    expect(writes.patch[0].active).toBe(false)
  })

  test('"Validar con IA" llama al auditor solo para esa pregunta', async ({ page }) => {
    await setup(page)
    let body: any = null
    await page.route('**/api/functions/v1/audit-generated-questions', r => {
      body = JSON.parse(r.request().postData() || '{}')
      return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ audited: 1, approved: 1, rejected: 0 }) })
    })
    await openQuestions(page)
    const card = page.locator('.question-card').filter({ hasText: 'doble factor' })
    await card.locator('.question-validate').click()
    await expect.poll(() => body).not.toBeNull()
    expect(body.question_ids).toEqual(['news-1'])
    await expect(page.getByText(/La IA aprobó la pregunta/)).toBeVisible()
  })

  test('eliminar pide confirmación y solo borra si se acepta', async ({ page }) => {
    const writes = await setup(page)
    await openQuestions(page)
    const card = page.locator('.question-card').filter({ hasText: 'correo del banco' })
    page.once('dialog', d => void d.dismiss())
    await card.locator('.question-delete').click()
    expect(writes.del).toEqual([])
    page.once('dialog', d => void d.accept())
    await card.locator('.question-delete').click()
    await expect.poll(() => writes.del.length).toBe(1)
    await expect(page.locator('.question-card')).toHaveCount(1)
  })

  test('texto con HTML hostil se guarda y se muestra como texto, nunca se ejecuta', async ({ page }) => {
    const writes = await setup(page)
    await openQuestions(page)
    const evil = '</textarea><img src=x onerror="window.__pwn=1"><script>window.__pwn=1</script>'
    const card = page.locator('.question-card[data-question-id="manual-1"]')
    await card.locator('[data-field="question_text"]').fill(evil)
    await card.locator('.question-save').click()
    await expect.poll(() => writes.patch.length).toBe(1)
    await expect(card.locator('[data-field="question_text"]')).toHaveValue(evil)
    expect(await page.locator('#questions img').count()).toBe(0)
    expect(await page.evaluate(() => (window as any).__pwn)).toBeUndefined()
  })

  test('subir archivo: valida con IA, muestra el estado de cada bandera y solo publica lo aprobado', async ({ page }) => {
    await setup(page)
    await page.route('**/api/storage/v1/object/news-agent-uploads/*', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }))
    let patchedApprove: any = null
    await page.route(/\/api\/rest\/v1\/questions\?id=eq\.upload-1/, r => {
      if (r.request().method() === 'PATCH') { patchedApprove = JSON.parse(r.request().postData() || '{}'); return r.fulfill({ status: 204, body: '' }) }
      return r.continue()
    })
    await page.route('**/api/functions/v1/import-question-bank', r => r.fulfill({
      status: 200, contentType: 'application/json',
      body: JSON.stringify({
        summary: '2 pregunta(s) extraídas.',
        imported: [
          {
            id: 'upload-1', dojo_id: 'dojo-passwords',
            question_text: '¿Qué es un cortafuegos?',
            options: OPT(0, ['Un sistema que filtra el tráfico de red no autorizado.', 'Un antivirus para el celular.', 'Una copia de seguridad automática.', 'Un tipo de contraseña larga.']),
            explanation: 'Filtra conexiones según reglas.',
            topic_ok: true, language_ok: true, answer_confident: true, issues: [],
          },
          {
            id: 'upload-2', dojo_id: null,
            question_text: '¿Cuál es la capital de Ecuador?',
            options: OPT(0, ['Quito', 'Lima', 'Bogotá', 'Caracas']),
            explanation: '',
            topic_ok: false, language_ok: true, answer_confident: true, issues: ['El tema no es de ciberseguridad.'],
          },
        ],
      }),
    }))

    await openQuestions(page)
    const chooser = page.waitForEvent('filechooser')
    await page.locator('#uploadQuestionBankBtn').click()
    const fc = await chooser
    await fc.setFiles({ name: 'preguntas.txt', mimeType: 'text/plain', buffer: Buffer.from('¿Qué es un cortafuegos? ...') })

    await expect(page.locator('#questionImportModal')).toHaveClass(/active/)
    await expect(page.getByText('El tema no es de ciberseguridad.')).toBeVisible()
    await expect(page.locator('.question-import-row').filter({ hasText: 'capital de Ecuador' })).toContainText('Tema: revisar')

    const goodRow = page.locator('.question-import-row').filter({ hasText: 'cortafuegos' })
    await goodRow.getByRole('button', { name: 'Aprobar y publicar' }).click()
    await expect.poll(() => patchedApprove).not.toBeNull()
    expect(patchedApprove.active).toBe(true)
    expect(patchedApprove.audit_status).toBe('approved')

    const badRow = page.locator('.question-import-row').filter({ hasText: 'capital de Ecuador' })
    await badRow.getByRole('button', { name: 'Dejar en pausa' }).click()
    await expect(page.getByText('Ya revisaste todas las preguntas de este archivo.')).toBeVisible()

    await page.locator('#questionImportModal .modal-actions button').click()
    await expect(page.locator('#questionImportModal')).not.toHaveClass(/active/)
  })

  test('sin scroll horizontal y con controles ≥44 px', async ({ page }) => {
    await setup(page)
    await openQuestions(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const small = await page.evaluate(() => [...document.querySelectorAll('#questions button, #questions select, #questions textarea')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && r.height < 43.5 }).length)
    expect(small).toBe(0)
  })
})
