import { test, expect, Page } from '@playwright/test'
import { settle } from './helpers'

const SECTORS = [
  { code: 'comerciante', label: 'Comerciante', industry: 'Comercio y Ventas' },
  { code: 'contador', label: 'Contador/a', industry: 'Administración y Finanzas' },
  { code: 'otro', label: 'Otro', industry: null },
]

async function setup(page: Page, register?: { status: number; body: unknown }) {
  await page.addInitScript(() => localStorage.setItem('_pwa_hidden_until', String(Date.now() + 86_400_000)))
  await page.route('**/rest/v1/business_sectors*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SECTORS) }))
  await page.route('**/functions/v1/secure-register-user', r => r.fulfill({ status: register?.status ?? 400, contentType: 'application/json', body: JSON.stringify(register?.body ?? { error: 'x' }) }))
  await page.goto('/registro')
  await settle(page, '.auth-card')
}

async function fillForm(page: Page) {
  await page.fill('#reg-name', 'Ana Pérez')
  await page.fill('#reg-email', 'ana@empresa.com')
  await page.fill('#reg-password', 'MiClaveSegura1')
  await page.selectOption('#reg-business', 'comerciante')
}

async function openConsent(page: Page) {
  await fillForm(page)
  await page.locator('button[type=submit]').click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await settle(page, '.consent-card') // sin esto, en WebKit bajo carga el botón sigue "moviéndose" por la animación
}

test.describe('registro', () => {
  test('formulario: inputs ≥16px, targets ≥44px, sin scroll horizontal, textos con tildes', async ({ page }) => {
    await setup(page)
    const problems = await page.evaluate(() => {
      const out: string[] = []
      document.querySelectorAll('.auth-card a, .auth-card button, .auth-card input, .auth-card select').forEach(el => {
        const r = el.getBoundingClientRect()
        if (!r.width) return
        if (r.height < 43.5 || r.width < 43.5) out.push(`${el.id || el.className || el.tagName} ${Math.round(r.width)}x${Math.round(r.height)}`)
        if (/INPUT|SELECT/.test(el.tagName) && parseFloat(getComputedStyle(el).fontSize) < 16) out.push(`${el.id} font<16`)
      })
      if (document.documentElement.scrollWidth > innerWidth) out.push('scroll horizontal')
      return out
    })
    expect(problems).toEqual([])
    await expect(page.getByLabel('CORREO ELECTRÓNICO')).toBeVisible()
    await expect(page.getByLabel('CONTRASEÑA', { exact: true })).toHaveAccessibleDescription(/mínimo 8 caracteres/i)
  })

  test('el aviso de datos personales cabe o se puede recorrer: título visible y "Acepto" alcanzable', async ({ page }) => {
    await setup(page)
    await fillForm(page)
    await page.locator('button[type=submit]').click()
    const dialog = page.getByRole('dialog', { name: /tratamiento de datos personales/i })
    await expect(dialog).toBeVisible()
    await settle(page, '.consent-card')
    await expect(dialog).toBeFocused() // el foco entra al diálogo (antes se quedaba detrás)
    await expect(page.getByRole('heading', { name: /tratamiento de datos/i })).toBeInViewport() // antes se recortaba por arriba en pantallas bajas
    const accept = page.getByRole('button', { name: /acepto y continuar/i })
    await accept.scrollIntoViewIfNeeded()
    await expect(accept).toBeInViewport({ ratio: 0.9 }) // tolerancia de 1–2 px por redondeo de DPR alto
    const box = await accept.boundingBox()
    expect(box!.height).toBeGreaterThanOrEqual(43.5)
  })

  test('Esc cierra el aviso sin salir del formulario y devuelve el foco', async ({ page }) => {
    await setup(page)
    await fillForm(page)
    await page.locator('button[type=submit]').click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).toBeHidden()
    expect(new URL(page.url()).pathname).toBe('/registro')
    await expect(page.locator('#reg-business')).toBeFocused()
    await expect(page.locator('#reg-email')).toHaveValue('ana@empresa.com') // no se pierde lo escrito
  })

  test('"No acepto" vuelve al inicio', async ({ page }) => {
    await setup(page)
    await openConsent(page)
    const reject = page.getByRole('button', { name: /no acepto/i })
    await reject.scrollIntoViewIfNeeded()
    await expect(reject).toBeInViewport({ ratio: 0.9 })
    await reject.click({ force: true }) // la comprobación de "estable" de Playwright se cuelga en WebKit bajo carga; ya verificamos que está a la vista
    await expect(page).toHaveURL(/\/$/)
  })

  test('correo ya registrado: se muestra el mensaje en español del servidor', async ({ page }) => {
    await setup(page, { status: 409, body: { error: 'Ya existe una cuenta con ese correo. Usa Ingresar.' } })
    await openConsent(page)
    const accept = page.getByRole('button', { name: /acepto y continuar/i })
    await accept.scrollIntoViewIfNeeded()
    await expect(accept).toBeInViewport({ ratio: 0.9 })
    await accept.click({ force: true })
    await expect(page.getByRole('alert')).toContainText(/ya existe una cuenta con ese correo/i)
  })

  test('error técnico del servidor: mensaje genérico, sin texto interno', async ({ page }) => {
    await setup(page, { status: 500, body: 'Edge Function crashed: TypeError at line 42' })
    await openConsent(page)
    const accept = page.getByRole('button', { name: /acepto y continuar/i })
    await accept.scrollIntoViewIfNeeded()
    await expect(accept).toBeInViewport({ ratio: 0.9 })
    await accept.click({ force: true })
    const alert = page.getByRole('alert')
    await expect(alert).toBeVisible()
    await expect(alert).not.toContainText(/edge function|typeerror|line 42/i)
  })
})
