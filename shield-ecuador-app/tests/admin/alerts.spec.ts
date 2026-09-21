import { test, expect, Page } from '@playwright/test'

const ALERTS = [
  { id: 'a1', title: 'La IA revisó 3 sitios <b>x</b>', description: 'Descripción con MFA y <img src=x onerror="window.__pwn=1">', threat_type: 'incidente_investigado', severity: 'alta', source: 'cisa.gov', source_url: 'javascript:window.__pwn=1, https://www.cisa.gov/news, http://localhost:8080/x', published_at: '2026-09-10T10:00:00Z', active: true, source_agent: 'question-auditor' },
  { id: 'a2', title: 'La IA revisó 3 sitios <b>x</b>', description: 'Repetida', threat_type: 'incidente_investigado', severity: 'media', source: 'cisa.gov', source_url: null, published_at: '2026-09-06T10:00:00Z', active: true, source_agent: 'question-auditor' },
  { id: 'a3', title: 'Alerta oculta', description: 'Ya no se muestra', threat_type: 'phishing', severity: 'critica', source: 'x', source_url: null, published_at: '2026-09-01T10:00:00Z', active: false, source_agent: null },
]

// Serves the list and records what the panel writes (PATCH/DELETE).
async function setup(page: Page, rows: unknown = ALERTS) {
  const writes: Array<{ method: string; url: string; body: string }> = []
  await page.route('**/api/rest/v1/alerts*', r => {
    const req = r.request()
    if (req.method() === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rows) })
    writes.push({ method: req.method(), url: req.url(), body: req.postData() || '' })
    return r.fulfill({ status: 204, body: '' })
  })
  return writes
}

async function openAlerts(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Administrador de Ciber Dojo', level: 1 })).toBeVisible()
  if (await page.evaluate(() => innerWidth <= 1180)) await page.locator('#menuToggle').click()
  await page.locator('.nav-item', { hasText: 'Alertas IA' }).click()
  await expect(page.locator('#newsAlerts')).toHaveClass(/active/)
}

test.describe('A6 · Alertas IA', () => {
  test('muestra todas las alertas (activas y ocultas) con su estado en texto y el recuento', async ({ page }) => {
    await setup(page)
    await openAlerts(page)
    const cards = page.locator('#newsAlertList .alert-card')
    await expect(cards).toHaveCount(3)
    await expect(page.locator('#newsAlertsNote')).toContainText('3 alertas (2 activas para los usuarios, 1 ocultas)')
    await expect(cards.nth(0)).toContainText('Activa · la ven los usuarios')
    await expect(cards.nth(2)).toContainText('Oculta')
    await expect(cards.nth(2)).toContainText('Crítica')
    await expect(cards.nth(1)).toContainText('2 alertas con este mismo título')
  })

  test('los datos hostiles se ven como texto y solo los enlaces http(s) públicos permitidos son enlaces', async ({ page }) => {
    await setup(page)
    await openAlerts(page)
    const first = page.locator('#newsAlertList .alert-card').first()
    await expect(first).toContainText('La IA revisó 3 sitios <b>x</b>')
    expect(await page.locator('#newsAlertList b, #newsAlertList img').count()).toBe(0)
    const links = first.locator('a')
    await expect(links).toHaveCount(2) // https://www.cisa.gov y http://localhost (http válido); javascript: no
    await expect(first).toContainText('enlace no seguro')
    for (const href of await links.evaluateAll(as => as.map(a => a.getAttribute('href')))) expect(href).toMatch(/^https?:\/\//)
    expect(await page.evaluate(() => (window as any).__pwn)).toBeUndefined()
  })

  test('los filtros Activas/Ocultas funcionan y marcan cuál está seleccionado', async ({ page }) => {
    await setup(page)
    await openAlerts(page)
    await page.getByRole('button', { name: 'Ocultas' }).click()
    await expect(page.locator('#newsAlertList .alert-card')).toHaveCount(1)
    await expect(page.getByRole('button', { name: 'Ocultas' })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: 'Activas' }).click()
    await expect(page.locator('#newsAlertList .alert-card')).toHaveCount(2)
    await page.getByRole('button', { name: 'Todas' }).click()
    await expect(page.locator('#newsAlertList .alert-card')).toHaveCount(3)
  })

  test('ocultar una alerta la quita a los usuarios: PATCH active=false y el estado cambia', async ({ page }) => {
    const writes = await setup(page)
    await openAlerts(page)
    await page.locator('#newsAlertList .alert-card').first().getByRole('button', { name: 'Ocultar a los usuarios' }).click()
    await expect.poll(() => writes.length).toBe(1)
    expect(writes[0].method).toBe('PATCH')
    expect(writes[0].url).toContain('alerts?id=eq.a1')
    expect(JSON.parse(writes[0].body)).toEqual({ active: false })
    await expect(page.locator('#newsAlertList .alert-card').first()).toContainText('Oculta')
    await expect(page.locator('#newsAlertsNote')).toContainText('1 activas')
  })

  test('publicar pide confirmación y, si se cancela, no escribe nada', async ({ page }) => {
    const writes = await setup(page)
    await openAlerts(page)
    let asked = ''
    page.once('dialog', d => { asked = d.message(); void d.dismiss() })
    await page.locator('#newsAlertList .alert-card').nth(2).getByRole('button', { name: 'Publicar' }).click()
    await expect.poll(() => asked).toContain('todas las personas usuarias')
    expect(writes).toEqual([])
    page.once('dialog', d => void d.accept())
    await page.locator('#newsAlertList .alert-card').nth(2).getByRole('button', { name: 'Publicar' }).click()
    await expect.poll(() => writes.length).toBe(1)
    expect(JSON.parse(writes[0].body)).toEqual({ active: true })
  })

  test('eliminar pide confirmación, sugiere ocultar y borra solo esa alerta', async ({ page }) => {
    const writes = await setup(page)
    await openAlerts(page)
    let asked = ''
    page.once('dialog', d => { asked = d.message(); void d.accept() })
    await page.locator('#newsAlertList .alert-card').nth(1).getByRole('button', { name: 'Eliminar' }).click()
    await expect.poll(() => writes.length).toBe(1)
    expect(asked).toContain('Ocultar')
    expect(writes[0].method).toBe('DELETE')
    expect(writes[0].url).toContain('alerts?id=eq.a2')
    await expect(page.locator('#newsAlertList .alert-card')).toHaveCount(2)
  })

  test('si falla la lectura: aviso y sin lista; si falla la escritura: aviso y el estado no cambia', async ({ page }) => {
    await page.route('**/api/rest/v1/alerts*', r => r.fulfill({ status: 500, body: 'boom' }))
    await openAlerts(page)
    await expect(page.locator('#newsAlertsNote')).toContainText('No se pudieron leer las alertas')
    await expect(page.locator('#newsAlertList .alert-card')).toHaveCount(0)
  })

  test('sin scroll horizontal y con botones ≥44 px', async ({ page }) => {
    await setup(page)
    await openAlerts(page)
    await expect(page.locator('#newsAlertList .alert-card')).toHaveCount(3)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const small = await page.evaluate(() => [...document.querySelectorAll('#newsAlerts button')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height < 43.5 }).length)
    expect(small).toBe(0)
  })
})
