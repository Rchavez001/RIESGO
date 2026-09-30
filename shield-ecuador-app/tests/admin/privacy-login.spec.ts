import { test, expect, Page } from '@playwright/test'

// T05.b (D-01, SEC-03): acceso individual al módulo de consentimiento desde el panel — correo + contraseña, TOTP (alta
// con QR si no hay factor) y sesión verificada por admin-consent. Supabase Auth y la función se simulan con page.route;
// el recorrido con Auth y TOTP reales está en supabase/tests/consent/admin_login_local.cjs.
const USER = { id: '0d9b7c1e-2f3a-4b5c-8d6e-7f8091a2b3c4', email: 'admin.uno@example.test' }
const FID = '11111111-2222-4333-8444-555555555555'
const PW_TOKEN = 'eyJhbGciOiJFUzI1NiJ9.cGFzc3dvcmQtYWFsMQ.c2lnMQ' // tras la contraseña (aal1)
const AAL2_TOKEN = 'eyJhbGciOiJFUzI1NiJ9.dG90cC1hYWwy.c2lnMg' // tras verificar el TOTP (aal2)
const SECRET = 'JBSWY3DPEHPK3PXP'

type Opts = { factors?: Array<{ id: string; factor_type: string; status: string }>; badPassword?: boolean; badCode?: boolean; sessionStatus?: number; sessionBody?: unknown }
type Seen = { url: string; method: string; session: string | undefined; body: string | null }

async function setup(page: Page, o: Opts = {}) {
  const seen: Seen[] = []
  await page.route('**/api/privacy/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname.replace('/api/privacy', '') + url.search
    seen.push({ url: path, method: req.method(), session: req.headers()['x-admin-session'], body: req.postData() })
    const json = (status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (path === '/auth/token?grant_type=password') {
      return o.badPassword ? json(400, { error: 'invalid_grant', error_description: 'Invalid login credentials' })
        : json(200, { access_token: PW_TOKEN, refresh_token: 'r1', user: USER })
    }
    if (path === '/auth/user') return json(200, { ...USER, factors: o.factors ?? [{ id: FID, factor_type: 'totp', status: 'verified' }] })
    if (path === '/auth/factors') {
      return json(200, { id: FID, type: 'totp', totp: { qr_code: 'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>', secret: SECRET, uri: 'otpauth://totp/x' } })
    }
    if (path === `/auth/factors/${FID}/challenge`) return json(200, { id: 'c-1', expires_at: 9999999999 })
    if (path === `/auth/factors/${FID}/verify`) {
      return o.badCode ? json(422, { code: 'mfa_verification_failed', msg: 'Invalid TOTP code entered' })
        : json(200, { access_token: AAL2_TOKEN, refresh_token: 'r2', user: USER })
    }
    if (path === '/fn/admin-consent/session') return json(o.sessionStatus ?? 200, o.sessionBody ?? { user_id: USER.id, roles: ['privacy_editor', 'privacy_auditor'] })
    if (path === '/auth/logout') return route.fulfill({ status: 204, body: '' })
    return json(404, { error: 'not_found' })
  })
  return seen
}

async function openConsent(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Administrador de Ciber Dojo', level: 1 })).toBeVisible()
  if (await page.evaluate(() => innerWidth <= 1180)) await page.locator('#menuToggle').click()
  await page.locator('.nav-item', { hasText: 'Consentimiento informado' }).click()
  await expect(page.locator('#consent')).toHaveClass(/active/)
}

async function login(page: Page, password = 'correcta-123') {
  await page.locator('#consent').getByLabel('Correo').fill(USER.email)
  await page.locator('#consent').getByLabel('Contraseña').fill(password)
  await page.locator('#consent').getByRole('button', { name: 'Entrar' }).click()
}

test.describe('T05.b · acceso individual al módulo de consentimiento', () => {
  test('sin sesión: formulario de acceso, sin identidad ni token', async ({ page }) => {
    await setup(page)
    await openConsent(page)
    await expect(page.locator('#consent').getByLabel('Correo')).toBeVisible()
    await expect(page.locator('#consent').getByLabel('Contraseña')).toHaveAttribute('type', 'password')
    await expect(page.locator('#privacyIdentity')).toBeHidden()
  })

  test('con factor TOTP ya verificado: contraseña → código → sesión verificada con el token aal2', async ({ page }) => {
    const seen = await setup(page)
    await openConsent(page)
    await login(page)
    await expect(page.locator('#consent').getByLabel('Código de 6 dígitos')).toBeVisible()
    await expect(page.locator('#privacyEnroll')).toBeHidden()
    await expect(page.locator('#consent').getByLabel('Contraseña')).toHaveValue('') // la contraseña no se queda en el formulario
    await page.locator('#consent').getByLabel('Código de 6 dígitos').fill('123456')
    await page.locator('#consent').getByRole('button', { name: 'Verificar' }).click()

    await expect(page.locator('#privacyIdentity')).toBeVisible()
    await expect(page.locator('#privacyIdentity')).toContainText(USER.email)
    await expect(page.locator('#privacyIdentity')).toContainText('privacy_editor')
    await expect(page.locator('#privacyIdentity')).toContainText('privacy_auditor')

    const verify = seen.find(s => s.url === `/auth/factors/${FID}/verify`)!
    expect(verify.session).toBe(PW_TOKEN)
    expect(JSON.parse(verify.body!)).toEqual({ challenge_id: 'c-1', code: '123456' })
    const session = seen.find(s => s.url === '/fn/admin-consent/session')!
    expect(session.method).toBe('POST')
    expect(session.session).toBe(AAL2_TOKEN) // la acción del módulo va con la sesión aal2, no con la de solo contraseña
    expect(seen.some(s => s.url === '/auth/factors')).toBe(false) // no se da de alta otro factor
  })

  test('sin factor TOTP: alta con QR y clave manual, luego verificación', async ({ page }) => {
    const seen = await setup(page, { factors: [] })
    await openConsent(page)
    await login(page)
    await expect(page.locator('#privacyEnroll')).toBeVisible()
    await expect(page.locator('#privacyQr')).toHaveAttribute('src', /^data:image\/svg\+xml/)
    await expect(page.locator('#privacySecret')).toHaveText(SECRET)
    await page.locator('#consent').getByLabel('Código de 6 dígitos').fill('654321')
    await page.locator('#consent').getByRole('button', { name: 'Verificar' }).click()
    await expect(page.locator('#privacyIdentity')).toContainText(USER.email)
    const enroll = seen.find(s => s.url === '/auth/factors')!
    expect(enroll.session).toBe(PW_TOKEN)
    expect(JSON.parse(enroll.body!).factor_type).toBe('totp')
    // tras verificar, la clave del factor desaparece de la pantalla
    await expect(page.locator('#privacyEnroll')).toBeHidden()
    await expect(page.locator('#privacySecret')).toHaveText('')
  })

  test('un factor sin verificar (alta abandonada) no cuenta: se ofrece un alta nueva', async ({ page }) => {
    await setup(page, { factors: [{ id: 'viejo', factor_type: 'totp', status: 'unverified' }] })
    await openConsent(page)
    await login(page)
    await expect(page.locator('#privacyEnroll')).toBeVisible()
  })

  test('contraseña incorrecta: mensaje claro, sin avanzar y sin dejar la contraseña escrita', async ({ page }) => {
    const seen = await setup(page, { badPassword: true })
    await openConsent(page)
    await login(page, 'mala')
    await expect(page.locator('#privacyMessage')).toContainText('Correo o contraseña incorrectos')
    await expect(page.locator('#consent').getByLabel('Contraseña')).toHaveValue('')
    await expect(page.locator('#consent').getByLabel('Código de 6 dígitos')).toBeHidden()
    expect(seen.some(s => s.url.startsWith('/fn/'))).toBe(false)
  })

  test('código TOTP incorrecto: mensaje y se puede reintentar, sin sesión del módulo', async ({ page }) => {
    const seen = await setup(page, { badCode: true })
    await openConsent(page)
    await login(page)
    await page.locator('#consent').getByLabel('Código de 6 dígitos').fill('000000')
    await page.locator('#consent').getByRole('button', { name: 'Verificar' }).click()
    await expect(page.locator('#privacyMessage')).toContainText('Código incorrecto')
    await expect(page.locator('#consent').getByLabel('Código de 6 dígitos')).toBeVisible()
    await expect(page.locator('#consent').getByLabel('Código de 6 dígitos')).toHaveValue('')
    expect(seen.some(s => s.url.startsWith('/fn/'))).toBe(false)
  })

  test('el código solo admite 6 dígitos', async ({ page }) => {
    const seen = await setup(page)
    await openConsent(page)
    await login(page)
    await page.locator('#consent').getByLabel('Código de 6 dígitos').fill('12ab')
    await page.locator('#consent').getByRole('button', { name: 'Verificar' }).click()
    await expect(page.locator('#privacyMessage')).toContainText('6 dígitos')
    expect(seen.some(s => s.url.endsWith('/verify'))).toBe(false)
  })

  test('cuenta sin rol del módulo: se explica y no se muestra identidad', async ({ page }) => {
    await setup(page, { sessionStatus: 403, sessionBody: { error: 'forbidden' } })
    await openConsent(page)
    await login(page)
    await page.locator('#consent').getByLabel('Código de 6 dígitos').fill('123456')
    await page.locator('#consent').getByRole('button', { name: 'Verificar' }).click()
    await expect(page.locator('#privacyMessage')).toContainText('no tiene un rol del módulo')
    await expect(page.locator('#privacyIdentity')).toBeHidden()
  })

  test('el token vive solo en memoria: nada en localStorage ni sessionStorage', async ({ page }) => {
    await setup(page)
    await openConsent(page)
    await login(page)
    await page.locator('#consent').getByLabel('Código de 6 dígitos').fill('123456')
    await page.locator('#consent').getByRole('button', { name: 'Verificar' }).click()
    await expect(page.locator('#privacyIdentity')).toBeVisible()
    await page.locator('#saveAll').click() // "Guardar borrador" persiste el estado de la consola en localStorage
    const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }) + JSON.stringify({ ...sessionStorage }))
    for (const secret of [PW_TOKEN, AAL2_TOKEN, '"r1"', '"r2"', SECRET]) expect(stored).not.toContain(secret)
  })

  test('cerrar sesión del módulo: avisa a Auth con la sesión y vuelve al formulario', async ({ page }) => {
    const seen = await setup(page)
    await openConsent(page)
    await login(page)
    await page.locator('#consent').getByLabel('Código de 6 dígitos').fill('123456')
    await page.locator('#consent').getByRole('button', { name: 'Verificar' }).click()
    await expect(page.locator('#privacyIdentity')).toBeVisible()
    await page.locator('#consent').getByRole('button', { name: 'Cerrar sesión del módulo' }).click()
    await expect(page.locator('#consent').getByLabel('Correo')).toBeVisible()
    await expect(page.locator('#privacyIdentity')).toBeHidden()
    const logout = seen.find(s => s.url === '/auth/logout')!
    expect(logout.session).toBe(AAL2_TOKEN)
  })
})
