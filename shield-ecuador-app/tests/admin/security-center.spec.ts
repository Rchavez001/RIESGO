import { test, expect, Page } from '@playwright/test'
import fs from 'fs'

const EVENTS = [
  { id: 'e1', created_at: '2026-09-20T10:00:00Z', endpoint: '=HYPERLINK("http://evil.example","clic")', event_type: '<b>tipo</b>', severity: 'alta', metadata: { reason: 'a "quoted" value', note: '@SUM(1+1)' } },
  { id: 'e2', created_at: '2026-09-20T09:00:00Z', endpoint: 'login', event_type: 'rate_limit_exceeded', severity: 'media', metadata: {} },
  { id: 'e3', created_at: '2026-09-19T09:00:00Z', endpoint: '+cmd|calc', event_type: '-2+3', severity: 'baja', metadata: { x: 1 } },
]
const CONFIG = { id: 'c1', name: 'Fuerza bruta <i>x</i>', severity_threshold: 'media', event_count_threshold: 5, window_minutes: 60, notify_email: 'club@ciberdojo.ec', notify_webhook_url: null, active: false, created_at: '2026-09-01T00:00:00Z' }
const KATAS = [{ id: 'k1', title: 'Borrador <b>kata</b>', status: 'borrador', body_md: 'texto', created_at: '2026-09-10T00:00:00Z' }]

async function setup(page: Page) {
  const calls = { alert: [] as any[] }
  await page.route('**/api/rest/v1/security_events?*', r => {
    if (r.request().headers()['prefer'] === 'count=exact') {
      const total = r.request().url().includes('rate_limit_exceeded') ? 87 : 4321
      return r.fulfill({ status: 200, headers: { 'Content-Range': `0-0/${total}` }, contentType: 'application/json', body: '[{"id":"x"}]' })
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(EVENTS) })
  })
  await page.route('**/api/rest/v1/security_alert_config?*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([CONFIG]) }))
  await page.route('**/api/rest/v1/security_kata_drafts?*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(KATAS) }))
  await page.route('**/api/functions/v1/save-security-alert-config', r => { calls.alert.push(JSON.parse(r.request().postData() || '{}')); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ config: { id: 'c1' } }) }) })
  return calls
}

async function openSecurity(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Administrador de Ciber Dojo', level: 1 })).toBeVisible()
  if (await page.evaluate(() => innerWidth <= 1180)) await page.locator('#menuToggle').click()
  await page.locator('.nav-item', { hasText: 'Centro de Seguridad' }).click()
  await expect(page.locator('#securityCenter')).toHaveClass(/active/)
  await expect(page.locator('#secEventFeed tbody tr')).toHaveCount(3)
}

test.describe('A11 · Centro de Seguridad', () => {
  test('las métricas de 7 días son recuentos exactos (antes: tope de la muestra de 1000 filas)', async ({ page }) => {
    await setup(page)
    await openSecurity(page)
    await expect(page.locator('#secMetricEvents')).toHaveText('4.321')
    await expect(page.locator('#secMetricBlocks')).toHaveText('87')
  })

  test('el detalle de eventos, el umbral y los borradores se muestran como texto', async ({ page }) => {
    await setup(page)
    await openSecurity(page)
    await expect(page.locator('#secEventFeed')).toContainText('<b>tipo</b>')
    expect(await page.locator('#secEventFeed b, #secAlertList i, #secKataList b').count()).toBe(0)
    await expect(page.locator('#secAlertList')).toContainText('Fuerza bruta <i>x</i>')
    await expect(page.locator('#secKataList')).toContainText('Borrador <b>kata</b>')
  })

  test('exportar CSV: las celdas que empiezan por = + - @ no se ejecutan como fórmula y las comillas quedan bien', async ({ page }) => {
    await setup(page)
    await openSecurity(page)
    const [download] = await Promise.all([page.waitForEvent('download'), page.locator('#secExportCsv').click()])
    const text = fs.readFileSync((await download.path())!, 'utf8')
    const lines = text.split('\n')
    expect(lines[0]).toBe('fecha,endpoint,tipo,severidad,metadata')
    expect(text).toContain('"\'=HYPERLINK(""http://evil.example"",""clic"")"') // ' delante y comillas duplicadas una sola vez
    expect(text).toContain('"\'+cmd|calc"')
    expect(text).toContain('"\'-2+3"')
    // metadatos: el JSON se escapa una sola vez (antes salía con las comillas cuadruplicadas)
    expect(text).toContain('"{""reason"":""a \\""quoted\\"" value"",""note"":""@SUM(1+1)""}"')
    for (const line of lines.slice(1)) expect(line.split('","')[1]).not.toMatch(/^[=+\-@]/)
  })

  test('exportar PDF: la ventana de impresión muestra los datos como texto', async ({ page }) => {
    await setup(page)
    await openSecurity(page)
    const [popup] = await Promise.all([page.waitForEvent('popup'), page.locator('#secExportPdf').click()])
    await popup.waitForLoadState('domcontentloaded')
    await expect(popup.locator('table')).toBeVisible()
    await expect(popup.locator('body')).toContainText('<b>tipo</b>')
    expect(await popup.locator('b').count()).toBe(0)
    await popup.close().catch(() => {})
  })

  test('umbral de alerta: webhook interno/http, correo inválido y números fuera de rango se rechazan sin llamar a la función', async ({ page }) => {
    const calls = await setup(page)
    await openSecurity(page)
    await page.locator('#secAlertNew').click()
    const status = page.locator('#secAlertStatus')
    await page.locator('#secAlertName').fill('Prueba')
    await page.locator('#secAlertEmail').fill('no-es-un-correo')
    await page.locator('#secAlertSave').dispatchEvent('click') // WebKit móvil: el formulario es largo y el clic con coordenadas falla a veces
    await expect(status).toContainText('correo de aviso no es válido')
    await page.locator('#secAlertEmail').fill('')
    for (const bad of ['http://hooks.ejemplo.com/x', 'https://169.254.169.254/latest', 'https://localhost:9000/x', 'https://10.0.0.5/x']) {
      await page.locator('#secAlertWebhook').fill(bad)
      await page.locator('#secAlertSave').dispatchEvent('click') // WebKit móvil: el formulario es largo y el clic con coordenadas falla a veces
      await expect(status).toContainText('Webhook no permitido')
    }
    await page.locator('#secAlertWebhook').fill('https://hooks.ejemplo.com/x')
    await page.locator('#secAlertCount').fill('0')
    await page.locator('#secAlertSave').dispatchEvent('click') // WebKit móvil: el formulario es largo y el clic con coordenadas falla a veces
    await expect(status).toContainText('entre 1 y 100.000')
    await page.locator('#secAlertCount').fill('5')
    await page.locator('#secAlertWindow').fill('99999')
    await page.locator('#secAlertSave').dispatchEvent('click') // WebKit móvil: el formulario es largo y el clic con coordenadas falla a veces
    await expect(status).toContainText('10.080 minutos')
    expect(calls.alert).toEqual([])
  })

  test('umbral válido: se envía con el interruptor "activo"; editar uno desactivado no lo reactiva', async ({ page }) => {
    const calls = await setup(page)
    await openSecurity(page)
    await page.locator('[data-sec-alert-edit="c1"]').click()
    await expect(page.locator('#secAlertActive')).not.toBeChecked() // el umbral está desactivado
    await page.locator('#secAlertCount').fill('7')
    await page.locator('#secAlertSave').dispatchEvent('click') // WebKit móvil: el formulario es largo y el clic con coordenadas falla a veces
    await expect.poll(() => calls.alert.length).toBe(1)
    expect(calls.alert[0]).toMatchObject({ id: 'c1', event_count_threshold: 7, active: false }) // antes se enviaba siempre active:true
    await page.locator('#secAlertActive').check()
    await page.locator('#secAlertWebhook').fill('https://hooks.ejemplo.com/x')
    await page.locator('#secAlertSave').dispatchEvent('click') // WebKit móvil: el formulario es largo y el clic con coordenadas falla a veces
    await expect.poll(() => calls.alert.length).toBe(2)
    expect(calls.alert[1]).toMatchObject({ active: true, notify_webhook_url: 'https://hooks.ejemplo.com/x' })
  })

  test('los borradores de kata son botones (alcanzables con teclado)', async ({ page }) => {
    await setup(page)
    await openSecurity(page)
    const item = page.getByRole('button', { name: 'Borrador <b>kata</b>' })
    await item.focus()
    await page.keyboard.press('Enter')
    await expect(page.locator('#secKataTitle')).toHaveValue('Borrador <b>kata</b>')
  })

  test('si fallan los eventos: aviso sin hablar de migraciones y métricas con "—"', async ({ page }) => {
    await page.route('**/api/rest/v1/security_events?*', r => r.fulfill({ status: 500, body: 'boom' }))
    await page.goto('/')
    if (await page.evaluate(() => innerWidth <= 1180)) await page.locator('#menuToggle').click()
    await page.locator('.nav-item', { hasText: 'Centro de Seguridad' }).click()
    await expect(page.locator('#secEventFeed')).toContainText('Pulsa Actualizar para reintentar')
    await expect(page.locator('#secEventFeed')).not.toContainText('migracion')
    await expect(page.locator('#secMetricEvents')).toHaveText('—')
  })

  test('sin scroll horizontal y con controles ≥44 px', async ({ page }) => {
    await setup(page)
    await openSecurity(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const small = await page.evaluate(() => [...document.querySelectorAll('#securityCenter button:not(:disabled), #securityCenter input:not([type="checkbox"]):not([type="hidden"]), #securityCenter select, #securityCenter textarea')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height < 43.5 }).map(e => e.id || e.className))
    expect(small).toEqual([])
  })
})
