import { test, expect, Page } from '@playwright/test'

const now = Date.now()
const iso = (daysAgo: number) => new Date(now - daysAgo * 86400000).toISOString()
const ENTRIES = [
  { sector: 'Comercio y Ventas', entered_at: iso(1) },
  { sector: 'Comercio y Ventas', entered_at: iso(2) },
  { sector: 'Salud', entered_at: iso(3) },
  { sector: null, entered_at: iso(4) },
]
const IMPRESSIONS = [
  { campaign_id: 'c1', sector: 'Comercio y Ventas', shown_at: iso(1) },
  { campaign_id: 'c1', sector: 'Salud', shown_at: iso(2) },
]
const CAMPAIGNS = [{ id: 'c1', name: 'Campaña <b>x</b>', created_at: iso(30) }]

async function setup(page: Page, totals = { entries: ENTRIES.length, impressions: IMPRESSIONS.length }) {
  const json = (r: any, rows: unknown[], total?: number) => r.fulfill({ status: 200, contentType: 'application/json', headers: total === undefined ? {} : { 'Content-Range': `0-0/${total}` }, body: JSON.stringify(rows) })
  await page.route('**/api/rest/v1/app_entry_log*', r => json(r, r.request().url().includes('limit=1') ? [{ id: 'x' }] : ENTRIES, totals.entries))
  await page.route('**/api/rest/v1/campaign_impressions*', r => json(r, r.request().url().includes('limit=1') ? [{ id: 'x' }] : IMPRESSIONS, totals.impressions))
  await page.route('**/api/rest/v1/central_admin_campaigns*', r => json(r, CAMPAIGNS))
}

async function openReports(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Administrador de Ciber Dojo', level: 1 })).toBeVisible()
  if (await page.evaluate(() => innerWidth <= 1180)) await page.locator('#menuToggle').click()
  await page.locator('.nav-item', { hasText: 'Reportes' }).click()
  await expect(page.locator('#reports')).toHaveClass(/active/)
}

const run = (page: Page) => page.locator('#runReport').dispatchEvent('click')

test.describe('A15 · Reportes', () => {
  test('textos con tildes y "accesos" en lugar de "ingresos" (que suena a dinero)', async ({ page }) => {
    await setup(page)
    await openReports(page)
    await run(page)
    await expect(page.locator('#reportKpis')).toContainText('Accesos totales')
    await expect(page.locator('#reportKpis')).toContainText('Campaña líder')
    await expect(page.locator('#reports')).toContainText('Centro BI de accesos y propaganda')
    await expect(page.locator('#reports')).not.toContainText('Ingresos totales')
    await expect(page.locator('#reportPeriod option').first()).toHaveText('Quincenal (15 días)')
  })

  test('los totales vienen del recuento exacto, no de las filas descargadas, y avisa de la muestra', async ({ page }) => {
    await setup(page, { entries: 12345, impressions: 6789 })
    await openReports(page)
    await run(page)
    await expect(page.locator('#reportKpis')).toContainText(/12\D?345/)
    await expect(page.locator('#reportKpis')).toContainText(/6\D?789/)
    await expect(page.locator('#reportTruncation')).toContainText('Los totales son exactos')
  })

  test('sin truncar no hay aviso', async ({ page }) => {
    await setup(page)
    await openReports(page)
    await run(page)
    await expect(page.locator('#reportKpis')).toContainText('Accesos totales')
    await expect(page.locator('#reportTruncation')).toHaveText('')
  })

  test('la tabla tiene título y encabezados; profundizar es un botón real y datos van como texto', async ({ page }) => {
    await setup(page)
    await openReports(page)
    await run(page)
    await expect(page.locator('#reportDetailHead th[scope="col"]').first()).toBeVisible()
    await expect(page.locator('#reports table caption')).toHaveCount(1)
    const drill = page.locator('#reportDetailRows [data-report-row]').first()
    if (await drill.count()) {
      await drill.focus()
      await page.keyboard.press('Enter')
      await expect(page.locator('#reportBreadcrumb button')).not.toHaveCount(1)
    }
    expect(await page.locator('#reports b').count()).toBe(0)
  })

  test('si el gráfico 3D no carga se avisa y la tabla sigue mostrando los datos', async ({ page }) => {
    await setup(page)
    await page.route('**/echarts*', r => r.abort())
    await openReports(page)
    await run(page)
    await expect(page.locator('#biChartFallback')).toBeVisible()
    await expect(page.locator('#reportDetailRows tr').first()).toBeVisible()
  })

  test('la rotación automática se puede pausar', async ({ page }) => {
    await setup(page)
    await openReports(page)
    const toggle = page.locator('#biRotateToggle')
    await expect(toggle).toHaveAttribute('aria-pressed', 'false')
    await toggle.dispatchEvent('click')
    await expect(toggle).toHaveAttribute('aria-pressed', 'true')
    await expect(toggle).toHaveText('Reanudar rotación')
  })

  test('con movimiento reducido la rotación arranca pausada', async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: 'reduce', httpCredentials: { username: 'admin', password: 'test-pass-123' }, baseURL: 'http://127.0.0.1:3198' })
    const page = await context.newPage()
    await setup(page)
    await openReports(page)
    await expect(page.locator('#biRotateToggle')).toHaveAttribute('aria-pressed', 'true')
    await context.close()
  })

  test('un fallo al generar se muestra en pantalla con instrucción para reintentar', async ({ page }) => {
    await page.route('**/api/rest/v1/app_entry_log*', r => r.fulfill({ status: 500, body: 'x' }))
    await page.route('**/api/rest/v1/campaign_impressions*', r => r.fulfill({ status: 500, body: 'x' }))
    await page.route('**/api/rest/v1/central_admin_campaigns*', r => r.fulfill({ status: 500, body: 'x' }))
    await openReports(page)
    await run(page)
    await expect(page.locator('#reportKpis')).toContainText('No se pudo generar el reporte')
  })

  test('sin scroll horizontal y con controles ≥44 px', async ({ page }) => {
    await setup(page)
    await openReports(page)
    await run(page)
    await expect(page.locator('#reportKpis')).toContainText('Accesos totales')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const small = await page.evaluate(() => [...document.querySelectorAll('#reports button:not(:disabled):not(.hidden), #reports select, #reports input')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height < 43.5 }).map(e => e.id || e.className))
    expect(small).toEqual([])
  })
})
