import { test, expect, Page } from '@playwright/test'

const SECTORS = [
  { code: 'contador', label: 'Contador/a <b>x</b>', industry: 'Administración, Finanzas y Oficina', active: true, display_order: 10 },
  { code: 'tendero', label: 'Tendero/a', industry: 'Comercio y Ventas', active: true, display_order: 20 },
  { code: 'otro', label: 'Otro', industry: null, active: false, display_order: 30 },
]

async function setup(page: Page) {
  const writes: Array<{ method: string; url: string; body: any }> = []
  const handle = (r: any) => {
    const req = r.request()
    if (req.method() === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SECTORS) })
    const body = req.postData() ? JSON.parse(req.postData()!) : null
    writes.push({ method: req.method(), url: decodeURIComponent(req.url()), body })
    return r.fulfill({ status: 201, contentType: 'application/json', body: req.method() === 'DELETE' ? '' : JSON.stringify([{ ...(body || {}) }]) })
  }
  await page.route('**/api/rest/v1/business_sectors?*', handle)
  await page.route('**/api/rest/v1/business_sectors', handle)
  await page.route('**/api/rest/v1/users?*', r => {
    const url = decodeURIComponent(r.request().url())
    const n = url.includes('sector=eq.Administración, Finanzas y Oficina') ? 7 : url.includes('sector=eq.Comercio y Ventas') ? 68 : 0
    return r.fulfill({ status: 200, headers: { 'Content-Range': `0-0/${n}` }, contentType: 'application/json', body: '[{"id":"x"}]' })
  })
  return writes
}

async function openOcc(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Administrador de Ciber Dojo', level: 1 })).toBeVisible()
  if (await page.evaluate(() => innerWidth <= 1180)) await page.locator('#menuToggle').click()
  await page.locator('.nav-item', { hasText: 'Ocupaciones' }).click()
  await expect(page.locator('#occupations')).toHaveClass(/active/)
  await expect(page.locator('#occupationList .campaign-row')).toHaveCount(3)
}

test.describe('A13 · Ocupaciones', () => {
  test('lista real con estado en texto, resumen y datos como texto', async ({ page }) => {
    await setup(page)
    await openOcc(page)
    await expect(page.locator('#occSummary')).toContainText('3 ocupaciones (2 activas')
    await expect(page.locator('#occupationList .campaign-row').first()).toContainText('Contador/a <b>x</b>')
    expect(await page.locator('#occupationList b').count()).toBe(0)
    await expect(page.locator('#occupationList .campaign-row').nth(2)).toContainText('inactiva')
    await expect(page.locator('#occupations')).toContainText('¿A qué te dedicas?')
    await expect(page.locator('#occEditorTitle')).toHaveText('Nueva ocupación')
  })

  test('al elegir una ocupación se ve cuántas personas ya tienen ese sector', async ({ page }) => {
    await setup(page)
    await openOcc(page)
    await page.locator('#occupationList .campaign-row').nth(1).click()
    await expect(page.locator('#occEditorTitle')).toHaveText('Editar: Tendero/a')
    await expect(page.locator('#occUsage')).toContainText('68 personas registradas tienen el sector “Comercio y Ventas”')
    await expect(page.locator('#occupationList .campaign-row').nth(1)).toHaveAttribute('aria-pressed', 'true')
  })

  test('cambiar el sector avisa de las personas afectadas; cancelar no escribe; aceptar guarda', async ({ page }) => {
    const writes = await setup(page)
    await openOcc(page)
    await page.locator('#occupationList .campaign-row').first().click()
    await page.locator('#occIndustry').fill('Finanzas')
    let asked = ''
    page.once('dialog', d => { asked = d.message(); void d.dismiss() })
    await page.locator('#saveOccupation').dispatchEvent('click')
    await expect.poll(() => asked).toContain('7 persona(s) ya registradas conservarán el nombre anterior')
    expect(writes).toEqual([])
    page.once('dialog', d => void d.accept())
    await page.locator('#saveOccupation').dispatchEvent('click')
    await expect.poll(() => writes.length).toBe(1)
    expect(writes[0].method).toBe('PATCH')
    expect(writes[0].url).toContain('code=eq.contador')
    expect(writes[0].body).toMatchObject({ industry: 'Finanzas' })
  })

  test('cambiar solo el nombre no molesta con avisos', async ({ page }) => {
    const writes = await setup(page)
    await openOcc(page)
    await page.locator('#occupationList .campaign-row').nth(1).click()
    await page.locator('#occLabel').fill('Tendero o tendera')
    let dialogs = 0
    page.on('dialog', d => { dialogs++; void d.accept() })
    await page.locator('#saveOccupation').dispatchEvent('click')
    await expect.poll(() => writes.length).toBe(1)
    expect(dialogs).toBe(0)
  })

  test('validación: nombre repetido, demasiado largo, orden fuera de rango; el 0 ya no se convierte en 100', async ({ page }) => {
    const writes = await setup(page)
    await openOcc(page)
    const status = page.locator('#occupationStatus')
    await page.locator('#addOccupation').click()
    await page.locator('#occLabel').fill('tendero/a')
    await page.locator('#saveOccupation').dispatchEvent('click')
    await expect(status).toContainText('Ya existe una ocupación llamada “Tendero/a”')
    await page.locator('#occLabel').evaluate((el: HTMLInputElement) => { el.maxLength = 500; el.value = 'x'.repeat(81) })
    await page.locator('#saveOccupation').dispatchEvent('click')
    await expect(status).toContainText('80 caracteres')
    await page.locator('#occLabel').fill('Panadero/a')
    await page.locator('#occOrder').fill('12345')
    await page.locator('#saveOccupation').dispatchEvent('click')
    await expect(status).toContainText('entre 0 y 9999')
    expect(writes).toEqual([])
    await page.locator('#occOrder').fill('0')
    await page.locator('#saveOccupation').dispatchEvent('click')
    await expect.poll(() => writes.length).toBe(1)
    expect(writes[0].method).toBe('POST')
    expect(writes[0].body).toMatchObject({ label: 'Panadero/a', display_order: 0, active: true })
  })

  test('el código de una ocupación nueva no choca con uno existente', async ({ page }) => {
    const writes = await setup(page)
    await openOcc(page)
    await page.locator('#addOccupation').click()
    await page.locator('#occLabel').fill('Contador')
    await page.locator('#occOrder').fill('40')
    await page.locator('#saveOccupation').dispatchEvent('click')
    await expect.poll(() => writes.length).toBe(1)
    expect(writes[0].body.code).toBe('contador_2') // "contador" ya existe: antes se enviaba igual y la base lo rechazaba con un error genérico
  })

  test('eliminar pide confirmación, cuenta las personas y sugiere "Inactiva"', async ({ page }) => {
    const writes = await setup(page)
    await openOcc(page)
    await page.locator('#occupationList .campaign-row').nth(1).click()
    let asked = ''
    page.once('dialog', d => { asked = d.message(); void d.dismiss() })
    await page.locator('#deleteOccupation').dispatchEvent('click')
    await expect.poll(() => asked).toContain('68 persona(s) ya registradas conservan el sector')
    expect(asked).toContain('Inactiva')
    expect(writes).toEqual([])
    page.once('dialog', d => void d.accept())
    await page.locator('#deleteOccupation').dispatchEvent('click')
    await expect.poll(() => writes.length).toBe(1)
    expect(writes[0].method).toBe('DELETE')
    expect(writes[0].url).toContain('code=eq.tendero')
    await expect(page.locator('#occupationList .campaign-row')).toHaveCount(2)
  })

  test('sin scroll horizontal y con controles ≥44 px', async ({ page }) => {
    await setup(page)
    await openOcc(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const small = await page.evaluate(() => [...document.querySelectorAll('#occupations button:not(:disabled), #occupations input, #occupations select')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height < 43.5 }).map(e => e.id || e.className))
    expect(small).toEqual([])
  })
})
