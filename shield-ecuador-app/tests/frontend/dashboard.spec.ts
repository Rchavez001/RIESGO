import { test, expect, Page } from '@playwright/test'
import { signedIn } from './auth-fixture'
import { settle } from './helpers'

const ALERTS = [
  { id: 'a1', title: 'Correos falsos que imitan a un banco', description: 'Desconfía y llama al banco por su número oficial.', published_at: '2026-09-10T10:00:00Z', source_url: 'https://example.com/a', active: true },
  { id: 'a2', title: 'Alerta con enlace peligroso', description: 'Este enlace no debe mostrarse.', published_at: '2026-09-09T10:00:00Z', source_url: 'javascript:alert(1)', active: true },
]

async function setup(page: Page, overview: unknown = [{ id: 'passwords', answered: 30, passed: false, unlocked: true }, { id: 'assets', answered: 0, passed: false, unlocked: false }]) {
  await signedIn(page, { name: 'Ana María de los Ángeles Pérez Villavicencio' })
  await page.route('**/rest/v1/rpc/learning_overview', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(overview) }))
  await page.route('**/rest/v1/alerts*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ALERTS) }))
}

async function openDashboard(page: Page) {
  await page.goto('/dashboard')
  await expect(page.getByRole('heading', { name: /hoy entrenas para la vida real/i })).toBeVisible()
  await settle(page, '.learning-page')
}

test.describe('/dashboard', () => {
  test('tarjeta de continuar: kata listo, métricas y sin scroll horizontal (nombre largo incluido)', async ({ page }) => {
    await setup(page)
    await openDashboard(page)
    const cta = page.getByRole('link', { name: /presentar mi kata/i })
    await expect(cta).toBeVisible()
    expect(await cta.getAttribute('href')).toMatch(/^\/kata\//)
    await expect(page.locator('.dashboard-metrics')).toContainText('30')
    await expect(page.locator('.dashboard-metrics')).toContainText('120')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })

  test('targets ≥44px y textos con tildes', async ({ page }) => {
    await setup(page)
    await openDashboard(page)
    const small = await page.evaluate(() => [...document.querySelectorAll('.dojo-main a, .dojo-main button')]
      .filter(e => !e.closest('.mobile-bottom-nav'))
      .filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && (r.height < 43.5 || r.width < 43.5) })
      .map(e => `${e.className || e.tagName} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)}`))
    expect(small).toEqual([])
    await expect(page.getByText('Reglas, inscripción y tu próximo combate.')).toBeVisible()
  })

  test('alertas: solo se enlaza una fuente http(s); un javascript: nunca se convierte en enlace', async ({ page }) => {
    await setup(page)
    await openDashboard(page)
    const links = page.getByRole('link', { name: /consultar fuente/i })
    await expect(links).toHaveCount(1)
    await expect(links).toHaveAttribute('href', 'https://example.com/a')
    await expect(links).toHaveAttribute('rel', /noreferrer/)
    await expect(links).toHaveAttribute('target', '_blank')
    await expect(page.getByText('Alerta con enlace peligroso')).toBeVisible()
  })

  test('si falla el progreso: mensaje claro, botón de reintento ≥44px y se recupera', async ({ page }) => {
    await setup(page)
    let fail = true
    await page.route('**/rest/v1/rpc/learning_overview', r => fail
      ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"boom"}' })
      : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 'passwords', answered: 5, passed: false, unlocked: true }]) }))
    await page.goto('/dashboard')
    const alert = page.getByRole('alert')
    await expect(alert).toContainText(/no pudimos recuperar tu progreso/i)
    await expect(alert).not.toContainText(/boom/i)
    await settle(page, '.learning-page')
    const retry = page.getByRole('button', { name: /recuperar mi progreso/i })
    expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(43.5)
    fail = false
    await retry.click()
    await expect(page.getByRole('link', { name: /continuar mi entrenamiento/i })).toBeVisible()
  })

  test('si fallan las alertas el resto de la pantalla sigue funcionando', async ({ page }) => {
    await setup(page)
    await page.route('**/rest/v1/alerts*', r => r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"db down"}' }))
    await openDashboard(page)
    await expect(page.getByText(/no pudimos consultar las alertas/i)).toBeVisible()
    await expect(page.getByRole('link', { name: /presentar mi kata/i })).toBeVisible()
  })

  test('mientras carga se anuncia el estado', async ({ page }) => {
    await setup(page)
    await page.route('**/rest/v1/rpc/learning_overview', async r => { await new Promise(res => setTimeout(res, 1200)); await r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }) })
    await page.goto('/dashboard')
    await expect(page.getByRole('status').filter({ hasText: /recuperando tu última práctica/i })).toBeVisible()
  })
})
