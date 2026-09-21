import { test, expect, Page } from '@playwright/test'
import { signedIn } from './auth-fixture'
import { settle } from './helpers'

const LONG_NAME = 'Ana María de los Ángeles Pérez Villavicencio de la Torre'

async function open(page: Page, opts: Parameters<typeof signedIn>[1] = {}) {
  await signedIn(page, { name: LONG_NAME, ...opts })
  await page.goto('/perfil')
  await expect(page.getByRole('heading', { name: 'Mi perfil', level: 1 })).toBeVisible()
  await expect(page.getByRole('heading', { name: LONG_NAME })).toBeVisible()
  await settle(page, '.profile-page')
}

test.describe('/perfil', () => {
  test('datos personales, cinturón y XP visibles; nombre largo sin desbordar', async ({ page }) => {
    await open(page)
    await expect(page.getByText('ana@empresa.com')).toBeVisible()
    await expect(page.locator('#contenido').getByRole('progressbar', { name: 'Puntos de aprendizaje' })).toHaveAttribute('aria-valuenow', '120')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const overflow = await page.evaluate(() => [...document.querySelectorAll('.profile-page section')].filter(s => s.scrollWidth > s.clientWidth + 1).length)
    expect(overflow).toBe(0)
  })

  test('camino del cinturón: tildes y estado de cada paso (superado / actual / por delante)', async ({ page }) => {
    await open(page, { belt: 'green' })
    await expect(page.getByRole('heading', { name: 'Camino del cinturón' })).toBeVisible()
    await expect(page.getByText('Conciencia básica')).toBeVisible()
    await expect(page.getByText('Proteger información importante')).toBeVisible()
    const steps = page.locator('.profile-path > li')
    await expect(steps).toHaveCount(7)
    await expect(steps.locator('.profile-step.done')).toHaveCount(3) // blanco, amarillo, naranja
    await expect(steps.locator('.profile-step.current')).toHaveCount(1)
    await expect(steps.locator('.profile-step.current')).toHaveText('● Tu cinturón actual')
    await expect(page.locator('.profile-path > li[aria-current="step"]')).toHaveCount(1)
    await expect(steps.filter({ hasText: 'Por delante' })).toHaveCount(3)
  })

  test('cinturón negro: nada "por delante" y la barra de XP no supera su meta', async ({ page }) => {
    await open(page, { belt: 'black' })
    await expect(page.locator('.profile-step.current')).toHaveCount(1)
    await expect(page.getByText('Por delante')).toHaveCount(0)
    const bar = page.locator('#contenido').getByRole('progressbar', { name: 'Puntos de aprendizaje' })
    const max = Number(await bar.getAttribute('aria-valuemax'))
    expect(Number(await bar.getAttribute('aria-valuenow'))).toBeLessThanOrEqual(max)
  })

  test('selector de compañero: con etiqueta, ≥44px y cambia la ficha', async ({ page }) => {
    await open(page)
    const select = page.getByLabel('Mi compañero de aprendizaje')
    expect((await select.boundingBox())!.height).toBeGreaterThanOrEqual(43.5)
    const before = await page.locator('.companion-picker p').first().textContent()
    const options = await select.locator('option').evaluateAll(os => os.map(o => (o as HTMLOptionElement).value))
    await select.selectOption(options.find(v => v !== (options[0])) ?? options[1])
    await expect(page.locator('.companion-picker p').first()).not.toHaveText(before ?? '')
  })

  test('dos columnas en escritorio y una en pantallas ≤960 px', async ({ page }) => {
    await open(page)
    const cols = await page.evaluate(() => getComputedStyle(document.querySelector('.profile-grid')!).gridTemplateColumns.split(' ').length)
    const wide = await page.evaluate(() => innerWidth > 960)
    expect(cols).toBe(wide ? 2 : 1)
  })

  test('invitado: /perfil queda cerrado y se le invita a registrarse', async ({ page }) => {
    await signedIn(page, { anonymous: true })
    await page.goto('/perfil')
    await expect(page.getByRole('heading', { name: /regístrate para continuar/i })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Mi perfil' })).toHaveCount(0)
  })
})
