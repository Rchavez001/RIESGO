import { test, expect, Page } from '@playwright/test'

async function openDojos(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Administrador de Ciber Dojo', level: 1 })).toBeVisible()
  if (await page.evaluate(() => innerWidth <= 1180)) await page.locator('#menuToggle').click()
  await page.locator('.nav-item', { hasText: 'Dojos y progreso' }).click()
  await expect(page.locator('#dojos')).toHaveClass(/active/)
}

test.describe('A2 · Dojos y progreso', () => {
  test('muestra los 7 dojos reales con sus cifras (en vivo) y el título como texto', async ({ page }) => {
    await openDojos(page)
    const cards = page.locator('#dojoStats .dojo-stat')
    await expect(cards).toHaveCount(7)
    await expect(cards.first()).toContainText('Dojo 1 <i>x</i>')
    expect(await page.locator('#dojoStats i').count()).toBe(0)
    await expect(cards.first().locator('dt', { hasText: 'Personas que empezaron' }).locator('xpath=following-sibling::dd')).toHaveText('1.234')
    await expect(cards.first()).toContainText('Aprobaron el kata')
    await expect(page.locator('#dojoStatsNote')).toContainText('7 dojos publicados')
  })

  test('la regla que se explica es la del producto (30 + kata de 5, 4 de 5) y no la del borrador (20+30=50)', async ({ page }) => {
    await openDojos(page)
    await expect(page.locator('#dojos')).toContainText('30 preguntas de práctica')
    await expect(page.locator('#dojos')).toContainText('al menos 4 aciertos (80 %)')
    await expect(page.locator('#dojos')).not.toContainText('preguntas IA intercaladas')
    await expect(page.locator('#dojos')).not.toContainText('total por dojo')
  })

  test('el borrador local está plegado y dice que no se publica; no existe el botón "Publicar configuración"', async ({ page }) => {
    await openDojos(page)
    const box = page.locator('details.draft-box')
    await expect(box).not.toHaveAttribute('open', '')
    await expect(box.locator('summary')).toContainText('no se publica')
    expect((await box.locator('summary').boundingBox())!.height).toBeGreaterThanOrEqual(43.5)
    await box.locator('summary').click()
    await expect(page.locator('#dojoName')).toBeVisible()
    await expect(page.getByRole('button', { name: /publicar configuración/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Guardar borrador' })).toHaveAttribute('title', /solo en este navegador/i)
  })

  test('guardar el borrador avisa que solo es local', async ({ page }) => {
    await openDojos(page)
    await page.getByRole('button', { name: 'Guardar borrador' }).click()
    await expect(page.getByText(/solo en este navegador \(no se publica\)/)).toBeVisible()
  })

  test('si falla la lectura: aviso y sin cifras', async ({ page }) => {
    await page.route('**/api/rest/v1/rpc/admin_dojo_stats', r => r.fulfill({ status: 500, body: 'boom' }))
    await openDojos(page)
    await expect(page.locator('#dojoStatsNote')).toContainText('No se pudieron leer los dojos')
    await expect(page.locator('#dojoStats .dojo-stat')).toHaveCount(0)
  })

  test('sin scroll horizontal y con botones ≥44 px', async ({ page }) => {
    await openDojos(page)
    await expect(page.locator('#dojoStats .dojo-stat')).toHaveCount(7)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const small = await page.evaluate(() => [...document.querySelectorAll('#dojos button, #dojos summary')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height < 43.5 }).length)
    expect(small).toBe(0)
  })
})
