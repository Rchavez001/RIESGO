import { test, expect, Page } from '@playwright/test'
import { settle } from './helpers'

async function mockVerify(page: Page, opts: { delayMs?: number } = {}) {
  await page.addInitScript(() => localStorage.setItem('_pwa_hidden_until', String(Date.now() + 86_400_000)))
  await page.route('**/auth/v1/verify*', async r => {
    if (opts.delayMs) await new Promise(res => setTimeout(res, opts.delayMs))
    await r.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: 'otp_expired', msg: 'Email link is invalid or has expired' }) })
  })
}

test.describe('/auth/callback', () => {
  test('enlace inválido: mensaje claro en español, sin texto del backend, y salida a /login', async ({ page }) => {
    await mockVerify(page)
    await page.goto('/auth/callback?token_hash=viejo&type=magiclink&next=/dojos')
    const alert = page.getByRole('alert')
    await expect(alert).toContainText(/ya no sirve/i)
    await expect(alert).not.toContainText(/otp_expired|invalid or has expired/i)
    await settle(page, '.auth-card')
    const link = page.getByRole('link', { name: /volver a ingresar/i })
    const box = await link.boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(43.5)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await link.click()
    await expect(page).toHaveURL(/\/login$/)
  })

  test('mientras verifica se anuncia el estado de carga', async ({ page }) => {
    await mockVerify(page, { delayMs: 1500 })
    await page.goto('/auth/callback?token_hash=abc')
    await expect(page.getByRole('status').filter({ hasText: /verificando/i })).toBeVisible()
    await expect(page.getByRole('alert')).toBeVisible({ timeout: 8000 })
  })

  test('tokens de sesión en la query string no inician sesión y la URL se limpia', async ({ page }) => {
    await mockVerify(page)
    await page.goto('/auth/callback?access_token=evil&refresh_token=evil&next=//evil.com')
    await expect(page.getByRole('alert')).toBeVisible()
    expect(new URL(page.url()).search).toBe('') // credenciales fuera de la barra de direcciones/historial
    const storedSession = await page.evaluate(() => Object.keys(localStorage).filter(k => /auth-token/.test(k)))
    expect(storedSession).toEqual([])
  })
})
