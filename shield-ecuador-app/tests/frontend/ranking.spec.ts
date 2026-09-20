import { test, expect, Page } from '@playwright/test'
import { signedIn } from './auth-fixture'
import { settle } from './helpers'

const entry = (rank: number, name: string, belt = 'blanco', xp = 1000 - rank * 100) => ({ rank, full_name: name, belt, total_xp: xp, katas_completed: 5 - rank, email_domain: 'empresa-con-nombre-largo.com.ec' })
const RANKING = [entry(1, 'Ana P.', 'verde', 2500), entry(2, 'Luis Alberto de la Torre-Villavicencio M.', 'amarillo', 1800), entry(3, 'María J.', 'blanco', 900), entry(4, 'Diego R.'), entry(5, 'Sofía T.')]

async function setup(page: Page, ranking: unknown, opts: { anonymous?: boolean } = {}) {
  await signedIn(page, opts)
  await page.route('**/functions/v1/get-ranking', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ranking) }))
}

test.describe('/ranking', () => {
  test('tabla y podio: sin scroll horizontal de la página, encabezados con scope y nombre largo contenido', async ({ page }) => {
    await setup(page, { ranking: RANKING })
    await page.goto('/ranking')
    await expect(page.getByRole('table', { name: /clasificados por xp/i })).toBeVisible()
    await settle(page, '.leader-table')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.getByRole('columnheader', { name: 'CINTURÓN' })).toBeVisible()
    await expect(page.getByRole('rowheader', { name: '#1' })).toBeVisible()
    const cards = await page.evaluate(() => [...document.querySelectorAll('.honor-card')].map(c => c.scrollWidth <= c.clientWidth + 1))
    expect(cards).toEqual([true, true, true])
  })

  test('en teléfono el podio va en orden (1.º primero) y el dominio se oculta; en escritorio se ven 3 columnas', async ({ page }) => {
    await setup(page, { ranking: RANKING })
    await page.goto('/ranking')
    await settle(page, '.podium')
    const phone = await page.evaluate(() => innerWidth <= 700)
    const tops = await page.evaluate(() => [...document.querySelectorAll('.honor-card')].map(c => ({ rank: (c as HTMLElement).dataset.rank, top: c.getBoundingClientRect().top, left: c.getBoundingClientRect().left })))
    if (phone) {
      const byTop = [...tops].sort((a, b) => a.top - b.top).map(t => t.rank)
      expect(byTop).toEqual(['1', '2', '3'])
      await expect(page.getByRole('columnheader', { name: 'DOMINIO' })).toBeHidden()
    } else if (await page.evaluate(() => innerWidth > 960)) {
      expect(new Set(tops.map(t => Math.round(t.top))).size).toBeLessThanOrEqual(2) // misma fila (el 1.º va más alto)
    }
  })

  test('el podio nombra el puesto para lectores de pantalla', async ({ page }) => {
    await setup(page, { ranking: RANKING })
    await page.goto('/ranking')
    await expect(page.getByRole('heading', { name: /puesto 1: ana p\./i })).toBeAttached()
  })

  test('sin guerreros: mensaje con tilde', async ({ page }) => {
    await setup(page, { ranking: [] })
    await page.goto('/ranking')
    await expect(page.getByText('Aún no hay guerreros en la tabla de honor.')).toBeVisible()
  })

  test('si falla: alerta sin detalles del servidor y "Volver a intentar" se recupera', async ({ page }) => {
    await setup(page, { ranking: RANKING })
    let fail = true
    await page.route('**/functions/v1/get-ranking', r => fail
      ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"relation kata_completions does not exist"}' })
      : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ranking: RANKING }) }))
    await page.goto('/ranking')
    const alert = page.getByRole('alert')
    await expect(alert).toBeVisible()
    await expect(alert).not.toContainText(/kata_completions/)
    await settle(page, '[role="alert"]') // la transición de ruta escala la página unos ms
    const retry = alert.getByRole('button', { name: /volver a intentar/i })
    expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(43.5)
    fail = false
    await retry.click()
    await expect(page.getByRole('table')).toBeVisible()
  })

  test('invitado: /ranking queda cerrado y se le invita a registrarse', async ({ page }) => {
    await setup(page, { ranking: RANKING }, { anonymous: true })
    await page.goto('/ranking')
    await expect(page.getByRole('heading', { name: /regístrate para continuar/i })).toBeVisible()
    await expect(page.getByRole('table')).toHaveCount(0)
  })
})
