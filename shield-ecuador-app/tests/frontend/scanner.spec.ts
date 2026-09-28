import { test, expect, Page } from '@playwright/test'
import { signedIn } from './auth-fixture'
import { settle } from './helpers'

const ADVICE = '🥋 **Consejo:** usa siempre HTTPS.\n1. Abre el sitio oficial.\n2. Verifica el candado.'
const AUDIT = { aprobada: true, puntaje: 90, criterios: {}, problemas_encontrados: [], sugerencia_mejora: '' }

async function setup(page: Page, opts: { anonymous?: boolean } = {}) {
  await signedIn(page, opts)
  await page.route('**/functions/v1/vuln-scanner-ai', r => {
    const { mode } = r.request().postDataJSON()
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(mode === 'auditor' ? AUDIT : { recomendacion: ADVICE }) })
  })
}

async function runScan(page: Page) {
  await page.goto('/escaner')
  await expect(page.getByRole('button', { name: /iniciar diagnóstico/i })).toBeVisible()
  await settle(page, '.vs-page')
  await page.getByRole('button', { name: /iniciar diagnóstico/i }).click()
  await page.getByRole('button', { name: /comenzar escaneo/i }).click()
  await expect(page.getByRole('heading', { name: /reporte del sensei/i })).toBeVisible({ timeout: 20_000 })
}

test.describe('/escaner', () => {
  test('bienvenida: aviso de alcance y privacidad, sin scroll horizontal, botón ≥44px', async ({ page }) => {
    await setup(page)
    await page.goto('/escaner')
    await expect(page.getByText(/no examina todos los archivos ni confirma si hay virus/i)).toBeVisible()
    await expect(page.getByText(/se envían los datos de esa consulta al servicio/i)).toBeVisible()
    await settle(page, '.vs-page')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const start = page.getByRole('button', { name: /iniciar diagnóstico/i })
    expect((await start.boundingBox())!.height).toBeGreaterThanOrEqual(43.5)
  })

  test('recorrido completo: detección, progreso con nombre y reporte con el foco en su título', async ({ page }) => {
    test.setTimeout(90_000)
    await setup(page)
    await page.goto('/escaner')
    await settle(page, '.vs-page')
    await page.getByRole('button', { name: /iniciar diagnóstico/i }).click()
    await expect(page.getByText('Sistema operativo')).toBeVisible()
    await page.getByRole('button', { name: /comenzar escaneo/i }).click()
    await expect(page.getByRole('progressbar', { name: /progreso del escaneo/i })).toBeVisible()
    const report = page.getByRole('heading', { name: /reporte del sensei/i })
    await expect(report).toBeVisible({ timeout: 20_000 })
    await expect(report).toBeFocused()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })

  test('las comprobaciones fallidas son botones alcanzables con teclado y abren la consulta con foco y respuesta legible', async ({ page }) => {
    test.setTimeout(90_000)
    await setup(page)
    await runScan(page)
    // en http://localhost la comprobación de HTTPS siempre falla
    const card = page.getByRole('button', { name: /consultar al sensei sobre: ¿tu conexión es segura\?/i })
    await expect(card).toBeVisible()
    expect((await card.boundingBox())!.height).toBeGreaterThanOrEqual(43.5)
    await card.focus()
    await page.keyboard.press('Enter')
    const panel = page.getByRole('region', { name: /consulta al sensei ia/i })
    await expect(panel).toBeVisible()
    await expect(panel).toBeFocused()
    await expect(panel).toContainText('Consejo: usa siempre HTTPS.')
    await expect(panel).not.toContainText('**')
    await expect(panel).toContainText('Verificado por Auditor IA · Calidad 90/100')
    const close = panel.getByRole('button', { name: /cerrar consulta/i })
    expect((await close.boundingBox())!.height).toBeGreaterThanOrEqual(43.5)
    await close.click()
    await expect(panel).toHaveCount(0)
  })

  test('si el servicio de IA falla: respuesta básica etiquetada y sin detalles del servidor', async ({ page }) => {
    test.setTimeout(90_000)
    await setup(page)
    await page.route('**/functions/v1/vuln-scanner-ai', r => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"Gemini error 500 key=abc"}' }))
    await runScan(page)
    await page.getByRole('button', { name: /consultar al sensei sobre/i }).first().click()
    const panel = page.getByRole('region', { name: /consulta al sensei ia/i })
    await expect(panel).toContainText(/respuesta de emergencia del dojo/i, { timeout: 15_000 })
    await expect(page.locator('body')).not.toContainText(/Gemini error|key=abc/)
  })

  test('descargar reporte entrega un .txt', async ({ page }) => {
    test.setTimeout(90_000)
    await setup(page)
    await runScan(page)
    const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: /descargar reporte/i }).click()])
    expect(download.suggestedFilename()).toMatch(/^reporte-ciber-dojo-\d+\.txt$/)
  })

  test('invitado: /escaner queda cerrado y se le invita a registrarse', async ({ page }) => {
    await setup(page, { anonymous: true })
    await page.goto('/escaner')
    await expect(page.getByRole('heading', { name: /regístrate para tener la experiencia completa/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /iniciar diagnóstico/i })).toHaveCount(0)
  })
})
