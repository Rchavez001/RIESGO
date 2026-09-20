import { test, expect } from '@playwright/test'
import { settle } from './helpers'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('_pwa_hidden_until', String(Date.now() + 86_400_000)))
})

test.describe('/personajes', () => {
  test('el contenido tiene márgenes laterales (no pega al borde) y no hay scroll horizontal', async ({ page }) => {
    await page.goto('/personajes')
    await settle(page, 'main')
    const { left, right, vw, sw } = await page.evaluate(() => {
      const h = document.querySelector('.cinema-page-title')!.getBoundingClientRect()
      return { left: h.left, right: innerWidth - h.right, vw: innerWidth, sw: document.documentElement.scrollWidth }
    })
    expect(left).toBeGreaterThanOrEqual(vw * 0.04)
    expect(right).toBeGreaterThanOrEqual(vw * 0.04)
    expect(sw).toBeLessThanOrEqual(vw)
  })

  test('filtros: Aliados y Adversarios muestran solo su grupo y quedan marcados', async ({ page }) => {
    await page.goto('/personajes')
    const cards = page.locator('.character-card')
    const all = await cards.count()
    await page.getByRole('button', { name: 'Aliados' }).click()
    await expect(page.getByRole('button', { name: 'Aliados' })).toHaveAttribute('aria-pressed', 'true')
    const allies = await cards.count()
    await page.getByRole('button', { name: 'Adversarios' }).click()
    const threats = await cards.count()
    expect(allies + threats).toBe(all)
    expect(allies).toBeGreaterThan(0)
    expect(threats).toBeGreaterThan(0)
    await expect(cards.locator('text=ALIADO').first()).toHaveCount(0)
  })

  test('la imagen de DoggoTeka en las tarjetas no se amplía más de 1.8× (nitidez en pantallas HD)', async ({ page }) => {
    await page.goto('/personajes')
    const img = page.locator('.character-card .doggo-art img').first()
    await img.scrollIntoViewIfNeeded()
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true)
    const scale = await img.evaluate((i: HTMLImageElement) => i.getBoundingClientRect().height / i.naturalHeight)
    expect(scale).toBeLessThanOrEqual(1.8)
  })

  test('la ficha de un personaje: título, imagen, targets ≥44px, sin scroll horizontal', async ({ page }) => {
    await page.goto('/personajes/kai')
    await settle(page, 'main')
    await expect(page).toHaveTitle(/Kai.*Personajes/i)
    const img = page.locator('.character-sheet-art img')
    await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true)
    const small = await page.evaluate(() => [...document.querySelectorAll('.cinema-back, .character-sheet a, .character-sheet button')]
      .filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.height < 43.5 || r.width < 43.5) }).map(e => `${e.className} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`))
    expect(small).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })

  test('elegir compañero se refleja en aria-pressed', async ({ page }) => {
    await page.goto('/personajes/kai')
    const choose = page.getByRole('button', { name: /elegir como compañero|es mi compañero/i })
    await choose.click()
    await expect(choose).toHaveAttribute('aria-pressed', 'true')
  })

  test('personaje inexistente: mensaje y vuelta a la lista', async ({ page }) => {
    await page.goto('/personajes/no-existe')
    await expect(page.getByRole('heading', { name: /no encontramos ese personaje/i })).toBeVisible()
    await page.getByRole('link', { name: /volver a los personajes/i }).click()
    await expect(page).toHaveURL(/\/personajes$/)
  })
})
