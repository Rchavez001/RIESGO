import { test, expect, Page } from '@playwright/test'

async function open(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Administrador de Ciber Dojo', level: 1 })).toBeVisible()
}

test.describe('A1 · Resumen', () => {
  test('las cifras vienen de la base de datos, no del borrador local', async ({ page }) => {
    await open(page)
    await expect(page.locator('#metricUsers')).toHaveText('42') // antes: 2 (tres usuarios inventados en el código)
    await expect(page.locator('#metricDojos')).toHaveText('7')
    await expect(page.locator('#metricQuestions')).toHaveText('245') // 210 preguntas + 35 casos
    await expect(page.locator('#metricAds')).toHaveText('0')
    await expect(page.locator('#metricGrid')).toHaveAttribute('aria-busy', 'false')
    await expect(page.locator('#metricNote')).toContainText('210 preguntas de práctica y 35 casos de kata')
  })

  test('etiquetas honestas y con tildes', async ({ page }) => {
    await open(page)
    for (const t of ['Dojos publicados', 'Preguntas y casos de kata', 'Usuarios registrados', 'Campañas activas', 'Orden de consulta y revisión']) {
      await expect(page.locator('#overview').getByText(t, { exact: true })).toBeVisible()
    }
    await expect(page.getByText('Usuarios activos')).toHaveCount(0)
  })

  test('la escalera de cinturones sale de los dojos reales y no ejecuta HTML de los datos', async ({ page }) => {
    await open(page)
    const rows = page.locator('#progressionPreview .progress-row')
    await expect(rows).toHaveCount(7)
    await expect(rows.first()).toContainText('Dojo 1 <b>x</b>') // el título llega como texto
    expect(await page.locator('#progressionPreview b').count()).toBe(0)
    await expect(page.locator('#progressionPreview')).toContainText('al menos 4 aciertos (80 %)')
    await expect(page.locator('#progressionPreview')).not.toContainText('%</strong>')
  })

  test('si la base no responde: "—" y un aviso, nunca cifras inventadas', async ({ page }) => {
    await page.route('**/api/rest/v1/users*', r => r.fulfill({ status: 500, body: 'boom' }))
    await open(page)
    await expect(page.locator('#metricNote')).toContainText('No se pudieron leer los datos reales')
    await expect(page.locator('#metricUsers')).toHaveText('—')
    await expect(page.locator('#metricDojos')).toHaveText('—')
  })

  test('sin scroll horizontal y con la cadena de IA legible en pantallas estrechas', async ({ page }) => {
    await open(page)
    await expect(page.locator('#metricUsers')).toHaveText('42')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const narrow = await page.evaluate(() => innerWidth <= 720)
    if (narrow) {
      const cols = await page.evaluate(() => getComputedStyle(document.querySelector('.flow')!).gridTemplateColumns.split(' ').length)
      expect(cols).toBe(1)
      const overflow = await page.evaluate(() => [...document.querySelectorAll('#overview .metric, #overview .card')].filter(e => e.scrollWidth > e.clientWidth + 1).length)
      expect(overflow).toBe(0)
    }
  })
})
