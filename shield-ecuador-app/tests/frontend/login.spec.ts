import { test, expect, Page } from '@playwright/test'
import { settle } from './helpers'

// Supabase Auth se simula por completo: ninguna prueba llega al backend real.
async function mockAuth(page: Page, opts: { otpStatus?: number; otpBody?: string; verifyStatus?: number } = {}) {
  await page.route('**/auth/v1/token*', r => r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'invalid_credentials', msg: 'Invalid login credentials' }) }))
  await page.route('**/auth/v1/otp*', r => r.fulfill({ status: opts.otpStatus ?? 200, contentType: 'application/json', body: opts.otpBody ?? '{}' }))
  await page.route('**/auth/v1/verify*', r => r.fulfill({ status: opts.verifyStatus ?? 403, contentType: 'application/json', body: JSON.stringify({ code: 'otp_expired', msg: 'Token has expired or is invalid' }) }))
  await page.route('**/functions/v1/log-login-event', r => r.fulfill({ status: 200, contentType: 'application/json', body: '{"logged":true}' }))
}

async function submitWrongPassword(page: Page) {
  await page.fill('#login-email', 'usuario@empresa.com')
  await page.fill('#login-password', 'contraseña-incorrecta')
  await page.locator('button[type=submit]').click()
}

test.describe('login', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('_pwa_hidden_until', String(Date.now() + 86_400_000)))
  })

  test('paso contraseña: inputs ≥16px (sin zoom en iOS), targets ≥44px, sin scroll horizontal', async ({ page }) => {
    await mockAuth(page)
    await page.goto('/login')
    await settle(page, '.auth-card') // PageTransition escala la página ~0.6 s: medir antes daría alturas fraccionarias
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

  test('contraseña incorrecta → paso del código, con textos en español y acentos', async ({ page }) => {
    await mockAuth(page)
    await page.goto('/login')
    await expect(page.getByLabel('CONTRASEÑA', { exact: true })).toBeVisible()
    await submitWrongPassword(page)
    await expect(page.getByLabel(/código de 6 dígitos/i)).toBeFocused()
    await expect(page.getByText(/no pudimos iniciar sesión con esa contraseña/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /reenviar código/i })).toBeDisabled() // cooldown de 30 s
    await settle(page, '.auth-card')
    const targets = await page.evaluate(() => [...document.querySelectorAll('.auth-card a, .auth-card button, .auth-card input')].filter(e => { const r = e.getBoundingClientRect(); return r.width && (r.height < 43.5 || r.width < 43.5) }).map(e => `${e.id || e.className}`))
    expect(targets).toEqual([])
  })

  test('correo sin cuenta: no se filtra "Signups not allowed" ni ningún texto del backend', async ({ page }) => {
    await mockAuth(page, { otpStatus: 422, otpBody: JSON.stringify({ code: 'otp_disabled', msg: 'Signups not allowed for otp' }) })
    await page.goto('/login')
    await submitWrongPassword(page)
    const alert = page.getByRole('alert')
    await expect(alert).toHaveText(/correo o contraseña incorrectos/i)
    await expect(alert).not.toContainText(/signups|otp_disabled/i)
  })

  test('código incorrecto o vencido muestra un mensaje claro', async ({ page }) => {
    await mockAuth(page)
    await page.goto('/login')
    await submitWrongPassword(page)
    await page.getByLabel(/código de 6 dígitos/i).fill('123456')
    await page.getByRole('button', { name: /continuar/i }).click()
    await expect(page.getByRole('alert')).toContainText(/código/i)
    await expect(page.getByRole('alert')).not.toContainText(/token|otp_expired/i)
  })

  test('el campo de código solo acepta dígitos y "Cambiar correo" vuelve al paso 1', async ({ page }) => {
    await mockAuth(page)
    await page.goto('/login')
    await submitWrongPassword(page)
    const code = page.getByLabel(/código de 6 dígitos/i)
    await code.fill('12a4-56x789')
    await expect(code).toHaveValue('124567')
    // pegar un código con espacio, como llega en muchos correos, no debe perder dígitos
    await code.fill('')
    await code.fill('987 654')
    await expect(code).toHaveValue('987654')
    await page.getByRole('button', { name: /cambiar correo/i }).click()
    await expect(page.locator('#login-email')).toBeVisible()
  })

  test('tokens de recuperación en la query string se ignoran y no inician sesión', async ({ page }) => {
    let setSessionCalls = 0
    await mockAuth(page)
    await page.route('**/auth/v1/user*', r => { setSessionCalls++; return r.fulfill({ status: 401, body: '{}' }) })
    await page.goto('/login?type=recovery&access_token=evil&refresh_token=evil')
    await page.waitForTimeout(500)
    expect(page.url()).toContain('/login')
    expect(setSessionCalls).toBe(0)
    await expect(page.locator('#login-email')).toBeVisible()
  })
})
