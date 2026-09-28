import { test, expect, Page } from '@playwright/test'
import { settle } from './helpers'

const SECTORS = [
  { code: 'comerciante', label: 'Comerciante', industry: 'Comercio y Ventas' },
  { code: 'contador', label: 'Contador/a', industry: 'Administración y Finanzas' },
  { code: 'otro', label: 'Otro', industry: null },
]

const NOTICE = {
  document_id: 'doc-1',
  version: '1.0',
  title: 'Tratamiento de datos personales',
  rendered_md: 'Autorizo el tratamiento de mis datos personales para fines internos de la aplicación.\n\nPuedo ejercer mis derechos escribiendo a privacidad@ciberdojo.example.',
  rendered_sha256: 'abc123',
  settings_version: 1,
  purposes: [
    { code: 'registro_aprendizaje', label: 'Registro y aprendizaje', required: true, order: 1 },
    { code: 'novedades', label: 'Novedades por correo', required: false, order: 2 },
  ],
  privacy_policy_url: null,
  privacy_email: 'privacidad@ciberdojo.example',
}

async function setup(page: Page, register?: { status: number; body: unknown }, notice: unknown = NOTICE) {
  await page.addInitScript(() => localStorage.setItem('_pwa_hidden_until', String(Date.now() + 86_400_000)))
  await page.route('**/rest/v1/business_sectors*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SECTORS) }))
  await page.route('**/functions/v1/get-consent-notice', r => r.fulfill({ status: notice ? 200 : 404, contentType: 'application/json', body: JSON.stringify(notice ?? { error: 'no publicado' }) }))
  await page.route('**/functions/v1/secure-register-user', r => r.fulfill({ status: register?.status ?? 400, contentType: 'application/json', body: JSON.stringify(register?.body ?? { error: 'x' }) }))
  await page.goto('/registro')
  await settle(page, '.auth-card')
}

// Acepta la finalidad obligatoria y confirma la edad — el mínimo para pasar al formulario.
async function acceptConsent(page: Page) {
  await settle(page, '.consent-step')
  await page.getByRole('checkbox', { name: /registro y aprendizaje/i }).check()
  await page.getByRole('checkbox', { name: /tengo 15 años o más/i }).check()
  await page.getByRole('button', { name: /acepto y continuar/i }).click()
  await settle(page, '.auth-card form')
}

async function fillForm(page: Page) {
  await page.fill('#reg-name', 'Ana Pérez')
  await page.fill('#reg-email', 'ana@empresa.com')
  await page.fill('#reg-password', 'MiClaveSegura1')
  await page.selectOption('#reg-business', 'comerciante')
}

test.describe('registro', () => {
  test('el aviso de privacidad es lo primero que se ve, antes del formulario', async ({ page }) => {
    await setup(page)
    await settle(page, '.consent-step')
    await expect(page.getByRole('heading', { name: /tratamiento de datos personales/i })).toBeVisible()
    await expect(page.locator('#reg-name')).toHaveCount(0) // el formulario no existe todavía
  })

  test('no se puede continuar sin aceptar la finalidad obligatoria', async ({ page }) => {
    await setup(page)
    await settle(page, '.consent-step')
    await page.getByRole('checkbox', { name: /tengo 15 años o más/i }).check()
    await page.getByRole('button', { name: /acepto y continuar/i }).click()
    await expect(page.getByRole('alert')).toContainText(/registro y aprendizaje/i)
    await expect(page.locator('#reg-name')).toHaveCount(0)
  })

  test('rechazar opcionales no impide continuar', async ({ page }) => {
    await setup(page)
    await settle(page, '.consent-step')
    await page.getByRole('checkbox', { name: /registro y aprendizaje/i }).check()
    await page.getByRole('checkbox', { name: /tengo 15 años o más/i }).check()
    // "novedades" (opcional) se deja sin marcar a propósito
    await page.getByRole('button', { name: /acepto y continuar/i }).click()
    await settle(page, '.auth-card form')
    await expect(page.locator('#reg-name')).toBeVisible()
  })

  test('declarar menos de 15 años bloquea el registro con instrucciones', async ({ page }) => {
    await setup(page)
    await settle(page, '.consent-step')
    await page.getByRole('checkbox', { name: /registro y aprendizaje/i }).check()
    // edad NO confirmada
    await page.getByRole('button', { name: /acepto y continuar/i }).click()
    await expect(page.getByText(/no podemos crear tu cuenta todavía/i)).toBeVisible()
    await expect(page.getByText('privacidad@ciberdojo.example')).toBeVisible()
    await expect(page.locator('#reg-name')).toHaveCount(0)
  })

  test('"No acepto" vuelve al inicio', async ({ page }) => {
    await setup(page)
    await settle(page, '.consent-step')
    await page.getByRole('button', { name: /no acepto/i }).click()
    await expect(page).toHaveURL(/\/$/)
  })

  test('sin un aviso publicado, se muestra un error en vez de un formulario roto', async ({ page }) => {
    await setup(page, undefined, null)
    await expect(page.getByRole('alert')).toContainText(/no podemos mostrar el aviso/i)
    await expect(page.locator('#reg-name')).toHaveCount(0)
  })

  test('formulario: inputs ≥16px, targets ≥44px, sin scroll horizontal, textos con tildes', async ({ page }) => {
    await setup(page)
    await acceptConsent(page)
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

  test('correo ya registrado: se muestra el mensaje en español del servidor', async ({ page }) => {
    await setup(page, { status: 409, body: { error: 'Ya existe una cuenta con ese correo. Usa Ingresar.' } })
    await acceptConsent(page)
    await fillForm(page)
    await page.locator('button[type=submit]').click()
    await expect(page.getByRole('alert')).toContainText(/ya existe una cuenta con ese correo/i)
  })

  test('error técnico del servidor: mensaje genérico, sin texto interno', async ({ page }) => {
    await setup(page, { status: 500, body: 'Edge Function crashed: TypeError at line 42' })
    await acceptConsent(page)
    await fillForm(page)
    await page.locator('button[type=submit]').click()
    const alert = page.getByRole('alert')
    await expect(alert).toBeVisible()
    await expect(alert).not.toContainText(/edge function|typeerror|line 42/i)
  })

  test('cuota no disponible (503 RATE_LIMIT_UNAVAILABLE): mensaje claro y se sigue en el formulario', async ({ page }) => {
    await setup(page, { status: 503, body: { error: 'RATE_LIMIT_UNAVAILABLE', message: 'El registro no está disponible en este momento, intenta en unos minutos' } })
    await acceptConsent(page)
    await fillForm(page)
    await page.locator('button[type=submit]').click()
    await expect(page.getByRole('alert')).toHaveText('El registro no está disponible en este momento, intenta en unos minutos')
    await expect(page.locator('#reg-email')).toHaveValue('ana@empresa.com') // no se pierde lo escrito
  })

  test('aviso cambiado a mitad de camino: vuelve a la pantalla de consentimiento en vez de fallar en seco', async ({ page }) => {
    await setup(page, { status: 409, body: { error: 'notice_changed', message: 'El aviso cambió.' } })
    await acceptConsent(page)
    await fillForm(page)
    await page.locator('button[type=submit]').click()
    await settle(page, '.consent-step')
    await expect(page.getByRole('heading', { name: /tratamiento de datos personales/i })).toBeVisible()
  })
})
