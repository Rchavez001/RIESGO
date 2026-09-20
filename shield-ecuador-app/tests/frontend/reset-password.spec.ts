import { test, expect, Page } from '@playwright/test'
import { settle } from './helpers'

const REF = process.env.SUPABASE_REF ?? 'wbbcjiqzbzswxsmwjqlw' // ref del proyecto en REACT_APP_SUPABASE_URL

async function withRecoverySession(page: Page) {
  await page.addInitScript((ref) => {
    localStorage.setItem('_pwa_hidden_until', String(Date.now() + 86_400_000))
    const exp = Math.floor(Date.now() / 1000) + 3600
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({
      access_token: 'h.p.s', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: exp,
      user: { id: 'u1', aud: 'authenticated', email: 'ana@empresa.com', is_anonymous: false, app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' },
    }))
  }, REF)
}

async function mockAuth(page: Page, update: { status: number; body: unknown }) {
  await page.route('**/auth/v1/user*', r => r.request().method() === 'PUT'
    ? r.fulfill({ status: update.status, contentType: 'application/json', body: JSON.stringify(update.body) })
    : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: 'u1', aud: 'authenticated', email: 'ana@empresa.com' }) }))
  await page.route('**/auth/v1/logout*', r => r.fulfill({ status: 204, body: '' }))
  await page.route('**/functions/v1/get-private-profile', r => r.fulfill({ status: 404, body: '{}' }))
}

test.describe('/reset-password', () => {
  test('sin enlace ni sesión: mensaje claro y salida a /login', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('_pwa_hidden_until', String(Date.now() + 86_400_000)))
    await page.goto('/reset-password')
    await expect(page.getByRole('alert')).toContainText(/ya no sirve/i)
    await settle(page, '.auth-card')
    const box = await page.getByRole('link', { name: /volver a ingresar/i }).boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(43.5)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })

  test('tokens en la query string no crean sesión y la URL queda limpia', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('_pwa_hidden_until', String(Date.now() + 86_400_000)))
    await page.goto('/reset-password?access_token=evil&refresh_token=evil')
    await expect(page.getByRole('alert')).toBeVisible()
    expect(new URL(page.url()).search).toBe('')
    expect(await page.evaluate(() => Object.keys(localStorage).filter(k => /auth-token/.test(k)))).toEqual([])
  })

  test('formulario: inputs ≥16px, targets ≥44px, etiquetas con tildes, sin scroll horizontal', async ({ page }) => {
    await withRecoverySession(page)
    await mockAuth(page, { status: 200, body: {} })
    await page.goto('/reset-password')
    await expect(page.getByLabel('NUEVA CONTRASEÑA', { exact: true })).toBeVisible()
    await settle(page, '.auth-card')
    const problems = await page.evaluate(() => {
      const out: string[] = []
      document.querySelectorAll('.auth-card a, .auth-card button, .auth-card input').forEach(el => {
        const r = el.getBoundingClientRect()
        if (!r.width) return
        if (r.height < 43.5 || r.width < 43.5) out.push(`${el.id || el.className || el.tagName} ${Math.round(r.width)}x${Math.round(r.height)}`)
        if (el.tagName === 'INPUT' && parseFloat(getComputedStyle(el).fontSize) < 16) out.push(`${el.id} font<16`)
      })
      if (document.documentElement.scrollWidth > innerWidth) out.push('scroll horizontal')
      return out
    })
    expect(problems).toEqual([])
  })

  test('contraseñas distintas: error inline y no se envía nada', async ({ page }) => {
    await withRecoverySession(page)
    let puts = 0
    await mockAuth(page, { status: 200, body: {} })
    await page.route('**/auth/v1/user*', r => { if (r.request().method() === 'PUT') puts++; return r.fallback() })
    await page.goto('/reset-password')
    await page.getByLabel('NUEVA CONTRASEÑA', { exact: true }).fill('ClaveNueva123')
    await page.getByLabel('REPITE LA CONTRASEÑA').fill('ClaveNueva124')
    await page.getByRole('button', { name: /guardar contraseña/i }).click()
    await expect(page.getByRole('alert')).toContainText(/no coinciden/i)
    expect(puts).toBe(0)
  })

  test('contraseña rechazada por el servidor: mensaje en español y el formulario sigue disponible', async ({ page }) => {
    await withRecoverySession(page)
    await mockAuth(page, { status: 422, body: { code: 'same_password', msg: 'New password should be different from the old password.' } })
    await page.goto('/reset-password')
    await page.getByLabel('NUEVA CONTRASEÑA', { exact: true }).fill('ClaveNueva123')
    await page.getByLabel('REPITE LA CONTRASEÑA').fill('ClaveNueva123')
    await page.getByRole('button', { name: /guardar contraseña/i }).click()
    const alert = page.getByRole('alert')
    await expect(alert).toContainText(/distinta de la anterior/i)
    await expect(alert).not.toContainText(/should be different/i)
    await expect(page.getByLabel('NUEVA CONTRASEÑA', { exact: true })).toBeVisible()
  })

  test('éxito: se anuncia el cambio', async ({ page }) => {
    await withRecoverySession(page)
    await mockAuth(page, { status: 200, body: { id: 'u1', aud: 'authenticated', email: 'ana@empresa.com' } })
    await page.goto('/reset-password')
    await page.getByLabel('NUEVA CONTRASEÑA', { exact: true }).fill('ClaveNueva123')
    await page.getByLabel('REPITE LA CONTRASEÑA').fill('ClaveNueva123')
    await page.getByRole('button', { name: /guardar contraseña/i }).click()
    await expect(page.getByRole('status').filter({ hasText: /se actualizó/i })).toBeVisible()
  })
})
