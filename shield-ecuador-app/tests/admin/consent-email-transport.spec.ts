import { test, expect, Page } from '@playwright/test'

// T23b.a (REQ-21 a, b, d): formulario de configuración de transporte de correo saliente. `GET/POST
// /email-transport` (admin-consent/handler.ts) exigen `privacy_admin` (ADMIN_ONLY, mismo candado que
// T23.b); la sección completa queda oculta para editor/auditor, no solo de solo lectura. Mismo patrón de
// mocking que consent-email-change.spec.ts: el foco es el formulario, no la autenticación.
const USER = { id: '0d9b7c1e-2f3a-4b5c-8d6e-7f8091a2b3c4', email: 'admin.uno@example.test' }
const FID = '11111111-2222-4333-8444-555555555555'
const AAL2_TOKEN = 'eyJhbGciOiJFUzI1NiJ9.dG90cC1hYWwy.c2lnMg'

const SETTINGS = {
  settings_version: 3,
  controller_name: 'Club de Ciberseguridad',
  controller_address: 'Av. Ejemplo 123, Quito',
  controller_phone: '+593999999999',
  privacy_email: 'privacidad@example.test',
  dpo_name: 'Persona Delegada',
  dpo_contact: 'dpo@example.test',
  privacy_policy_url: 'https://example.test/privacidad',
  unsubscribe_subject: 'Baja de tratamiento de datos',
  response_days: 15,
  ip_retention_days: 730,
  four_eyes_publish: true,
}

const SMTP_TRANSPORT = {
  transport_version: 2,
  mode: 'smtp',
  from_name: 'Privacidad CiberDojo',
  from_email: 'privacidad@example.test',
  smtp_host: 'smtp.example.test',
  smtp_port: 465,
  smtp_username: 'privacidad@example.test',
  password_set: true,
  created_by: USER.id,
  created_at: '2026-10-10T12:00:00.000Z',
}

type Opts = {
  roles?: string[]
  transport?: unknown
  getStatus?: number
  saveStatus?: number
  saveBody?: unknown
  testStatus?: number
  testBody?: unknown
}
type Seen = { url: string; method: string; session: string | undefined; body: string | null }

async function setup(page: Page, o: Opts = {}) {
  const seen: Seen[] = []
  const roles = o.roles ?? ['privacy_admin']
  const transport = o.transport === undefined ? null : o.transport
  await page.route('**/api/privacy/**', async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname.replace('/api/privacy', '') + url.search
    seen.push({ url: path, method: req.method(), session: req.headers()['x-admin-session'], body: req.postData() })
    const json = (status: number, body: unknown) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (path === '/auth/token?grant_type=password') return json(200, { access_token: AAL2_TOKEN, refresh_token: 'r1', user: USER })
    if (path === '/auth/user') return json(200, { ...USER, factors: [{ id: FID, factor_type: 'totp', status: 'verified' }] })
    if (path === `/auth/factors/${FID}/challenge`) return json(200, { id: 'c-1', expires_at: 9999999999 })
    if (path === `/auth/factors/${FID}/verify`) return json(200, { access_token: AAL2_TOKEN, refresh_token: 'r2', user: USER })
    if (path === '/fn/admin-consent/session') return json(200, { user_id: USER.id, roles })
    if (path === '/auth/logout') return route.fulfill({ status: 204, body: '' })
    if (path === '/fn/admin-consent/documents' && req.method() === 'GET') return json(200, [])
    if (path === '/fn/admin-consent/settings' && req.method() === 'GET') return json(200, SETTINGS)
    if (path === '/fn/admin-consent/settings/history' && req.method() === 'GET') return json(200, [])
    if (path === '/fn/admin-consent/email-transport' && req.method() === 'GET') {
      if (o.getStatus && o.getStatus !== 200) return json(o.getStatus, { error: 'forbidden' })
      return json(200, transport)
    }
    if (path === '/fn/admin-consent/email-transport' && req.method() === 'POST') {
      if (o.saveStatus && o.saveStatus !== 200) return json(o.saveStatus, o.saveBody ?? { error: 'invalid_input' })
      const body = JSON.parse(req.postData() || '{}')
      return json(200, {
        transport_version: (transport as typeof SMTP_TRANSPORT | null)?.transport_version ? (transport as typeof SMTP_TRANSPORT).transport_version + 1 : 1,
        mode: body.mode,
        from_name: body.from_name,
        from_email: body.from_email,
        smtp_host: body.smtp_host ?? null,
        smtp_port: body.smtp_port ?? null,
        smtp_username: body.smtp_username ?? null,
        password_set: body.mode === 'smtp',
        created_by: USER.id,
        created_at: '2026-10-14T12:00:00.000Z',
      })
    }
    if (path === '/fn/admin-consent/email-transport/test' && req.method() === 'POST') {
      if (o.testStatus && o.testStatus !== 200) return json(o.testStatus, o.testBody ?? { error: 'rate_limited' })
      return json(200, o.testBody ?? { success: true, error_code: null })
    }
    return json(404, { error: 'not_found' })
  })
  return { seen }
}

async function openConsentAsIdentity(page: Page) {
  await page.goto('/')
  if (await page.evaluate(() => innerWidth <= 1180)) await page.locator('#menuToggle').click()
  await page.locator('.nav-item', { hasText: 'Consentimiento informado' }).click()
  await page.locator('#consent').getByLabel('Correo').fill(USER.email)
  await page.locator('#consent').getByLabel('Contraseña').fill('correcta-123')
  await page.locator('#consent').getByRole('button', { name: 'Entrar' }).click()
  await page.locator('#consent').getByLabel('Código de 6 dígitos').fill('123456')
  await page.locator('#consent').getByRole('button', { name: 'Verificar' }).click()
  await expect(page.locator('#privacyIdentity')).toBeVisible()
}

test.describe('T23b.a · Formulario de transporte de correo saliente', () => {
  test.beforeEach(async ({}, info) => { test.skip(info.project.name !== 'desktop-chrome', 'servidor: una sola vez') })

  test('privacy_admin sin transporte configurado: mensaje explícito, modo resend por defecto', async ({ page }) => {
    await setup(page)
    await openConsentAsIdentity(page)
    await expect(page.locator('#consentEmailTransport')).toBeVisible()
    await expect(page.locator('#consentEmailTransportVersion')).toContainText('Sin transporte configurado todavía.')
    await expect(page.locator('#consentEmailTransportMode')).toHaveValue('resend')
    await expect(page.locator('#consentEmailTransportSmtpFields')).toBeHidden()
  })

  test('privacy_admin con transporte SMTP vigente: formulario relleno, contraseña nunca en el DOM', async ({ page }) => {
    await setup(page, { transport: SMTP_TRANSPORT })
    await openConsentAsIdentity(page)
    await expect(page.locator('#consentEmailTransportVersion')).toContainText('Versión de transporte vigente: 2')
    await expect(page.locator('#consentEmailTransportVersion')).toContainText('Contraseña: configurada')
    await expect(page.locator('#consentEmailTransportMode')).toHaveValue('smtp')
    await expect(page.locator('#consentEmailTransportSmtpFields')).toBeVisible()
    await expect(page.locator('#consentEmailTransportSmtpHost')).toHaveValue('smtp.example.test')
    await expect(page.locator('#consentEmailTransportSmtpPassword')).toHaveValue('')
  })

  test('rol solo editor: no ve la sección de correo saliente', async ({ page }) => {
    await setup(page, { roles: ['privacy_editor'] })
    await openConsentAsIdentity(page)
    await expect(page.locator('#consentEmailTransport')).toBeHidden()
  })

  test('rol solo auditor: no ve la sección de correo saliente', async ({ page }) => {
    await setup(page, { roles: ['privacy_auditor'] })
    await openConsentAsIdentity(page)
    await expect(page.locator('#consentEmailTransport')).toBeHidden()
  })

  test('nombre o correo del remitente vacíos: no llama al backend', async ({ page }) => {
    const { seen } = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentEmailTransportForm').getByRole('button', { name: 'Guardar' }).click()
    await expect(page.locator('#consentEmailTransportMessage')).not.toBeEmpty()
    expect(seen.some((s) => s.url === '/fn/admin-consent/email-transport' && s.method === 'POST')).toBe(false)
  })

  test('guardar en modo resend: no manda campos smtp_*', async ({ page }) => {
    const { seen } = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentEmailTransportFromName').fill('Privacidad CiberDojo')
    await page.locator('#consentEmailTransportFromEmail').fill('privacidad@example.test')
    await page.locator('#consentEmailTransportForm').getByRole('button', { name: 'Guardar' }).click()

    await expect(page.locator('#consentEmailTransportMessage')).toContainText('guardado')
    const call = seen.find((s) => s.url === '/fn/admin-consent/email-transport' && s.method === 'POST')!
    expect(call.session).toBe(AAL2_TOKEN)
    const body = JSON.parse(call.body || '{}')
    expect(body).toEqual({ mode: 'resend', from_name: 'Privacidad CiberDojo', from_email: 'privacidad@example.test' })
  })

  test('modo smtp sin host ni usuario: no llama al backend', async ({ page }) => {
    const { seen } = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentEmailTransportFromName').fill('Privacidad CiberDojo')
    await page.locator('#consentEmailTransportFromEmail').fill('privacidad@example.test')
    await page.locator('#consentEmailTransportMode').selectOption('smtp')
    await expect(page.locator('#consentEmailTransportSmtpFields')).toBeVisible()
    await page.locator('#consentEmailTransportForm').getByRole('button', { name: 'Guardar' }).click()
    await expect(page.locator('#consentEmailTransportMessage')).not.toBeEmpty()
    expect(seen.some((s) => s.url === '/fn/admin-consent/email-transport' && s.method === 'POST')).toBe(false)
  })

  test('guardar en modo smtp con contraseña nueva: payload correcto y el campo queda vacío después', async ({ page }) => {
    const { seen } = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentEmailTransportFromName').fill('Privacidad CiberDojo')
    await page.locator('#consentEmailTransportFromEmail').fill('privacidad@example.test')
    await page.locator('#consentEmailTransportMode').selectOption('smtp')
    await page.locator('#consentEmailTransportSmtpHost').fill('smtp.example.test')
    await page.locator('#consentEmailTransportSmtpPort').selectOption('2525')
    await page.locator('#consentEmailTransportSmtpUsername').fill('privacidad@example.test')
    await page.locator('#consentEmailTransportSmtpPassword').fill('clave-smtp-nueva')
    await page.locator('#consentEmailTransportForm').getByRole('button', { name: 'Guardar' }).click()

    await expect(page.locator('#consentEmailTransportMessage')).toContainText('guardado')
    const call = seen.find((s) => s.url === '/fn/admin-consent/email-transport' && s.method === 'POST')!
    const body = JSON.parse(call.body || '{}')
    expect(body).toEqual({
      mode: 'smtp',
      from_name: 'Privacidad CiberDojo',
      from_email: 'privacidad@example.test',
      smtp_host: 'smtp.example.test',
      smtp_port: 2525,
      smtp_username: 'privacidad@example.test',
      smtp_password: 'clave-smtp-nueva',
    })
    await expect(page.locator('#consentEmailTransportSmtpPassword')).toHaveValue('')
  })

  test('guardar en modo smtp sin escribir contraseña: no manda smtp_password (conserva la vigente)', async ({ page }) => {
    const { seen } = await setup(page, { transport: SMTP_TRANSPORT })
    await openConsentAsIdentity(page)
    await page.locator('#consentEmailTransportForm').getByRole('button', { name: 'Guardar' }).click()

    const call = seen.find((s) => s.url === '/fn/admin-consent/email-transport' && s.method === 'POST')!
    const body = JSON.parse(call.body || '{}')
    expect(body.smtp_password).toBeUndefined()
  })

  test('error del backend (smtp_password_required): mensaje legible, contraseña queda vacía igual', async ({ page }) => {
    await setup(page, { saveStatus: 400, saveBody: { error: 'smtp_password_required' } })
    await openConsentAsIdentity(page)
    await page.locator('#consentEmailTransportFromName').fill('Privacidad CiberDojo')
    await page.locator('#consentEmailTransportFromEmail').fill('privacidad@example.test')
    await page.locator('#consentEmailTransportMode').selectOption('smtp')
    await page.locator('#consentEmailTransportSmtpHost').fill('smtp.example.test')
    await page.locator('#consentEmailTransportSmtpUsername').fill('privacidad@example.test')
    await page.locator('#consentEmailTransportForm').getByRole('button', { name: 'Guardar' }).click()

    await expect(page.locator('#consentEmailTransportMessage')).toContainText('todavía no hay ninguna guardada')
    await expect(page.locator('#consentEmailTransportSmtpPassword')).toHaveValue('')
  })

  test('error del backend (invalid_input): mensaje legible', async ({ page }) => {
    await setup(page, { saveStatus: 400, saveBody: { error: 'invalid_input' } })
    await openConsentAsIdentity(page)
    await page.locator('#consentEmailTransportFromName').fill('Privacidad CiberDojo')
    await page.locator('#consentEmailTransportFromEmail').fill('privacidad@example.test')
    await page.locator('#consentEmailTransportForm').getByRole('button', { name: 'Guardar' }).click()

    await expect(page.locator('#consentEmailTransportMessage')).toContainText('el puerto SMTP debe ser 465 o 2525')
  })

  test('error del backend (smtp_fields_required): mensaje legible', async ({ page }) => {
    await setup(page, { saveStatus: 400, saveBody: { error: 'smtp_fields_required' } })
    await openConsentAsIdentity(page)
    await page.locator('#consentEmailTransportFromName').fill('Privacidad CiberDojo')
    await page.locator('#consentEmailTransportFromEmail').fill('privacidad@example.test')
    await page.locator('#consentEmailTransportMode').selectOption('smtp')
    await page.locator('#consentEmailTransportSmtpHost').fill('smtp.example.test')
    await page.locator('#consentEmailTransportSmtpUsername').fill('privacidad@example.test')
    await page.locator('#consentEmailTransportForm').getByRole('button', { name: 'Guardar' }).click()

    await expect(page.locator('#consentEmailTransportMessage')).toContainText('el host, el puerto y el usuario son obligatorios')
  })

  test('cerrar sesión limpia la sección', async ({ page }) => {
    await setup(page, { transport: SMTP_TRANSPORT })
    await openConsentAsIdentity(page)
    await expect(page.locator('#consentEmailTransportVersion')).toContainText('Versión de transporte vigente: 2')
    await page.locator('#privacyLogout').click()
    await expect(page.locator('#consentEmailTransport')).toBeHidden()
    await expect(page.locator('#consentEmailTransportVersion')).toHaveText('')
  })
})

test.describe('T23b.b · Botón "Enviar correo de prueba" + último resultado', () => {
  test.beforeEach(async ({}, info) => { test.skip(info.project.name !== 'desktop-chrome', 'servidor: una sola vez') })

  test('sin transporte configurado: el botón no aparece', async ({ page }) => {
    await setup(page)
    await openConsentAsIdentity(page)
    await expect(page.locator('#consentEmailTransportTestButton')).toBeHidden()
  })

  test('con transporte configurado: el botón aparece y, tras guardar, sigue visible', async ({ page }) => {
    const { seen } = await setup(page, { transport: SMTP_TRANSPORT })
    await openConsentAsIdentity(page)
    await expect(page.locator('#consentEmailTransportTestButton')).toBeVisible()

    await page.locator('#consentEmailTransportTestButton').click()
    await expect(page.locator('#consentEmailTransportTestResult')).toContainText('resultado: correcto')
    const call = seen.find((s) => s.url === '/fn/admin-consent/email-transport/test' && s.method === 'POST')!
    expect(call.session).toBe(AAL2_TOKEN)
    expect(call.body ?? null).toBeNull()
  })

  test('resultado con error (success:false + error_code): se muestra el código', async ({ page }) => {
    await setup(page, { transport: SMTP_TRANSPORT, testBody: { success: false, error_code: 'smtp_connect_failed' } })
    await openConsentAsIdentity(page)
    await page.locator('#consentEmailTransportTestButton').click()
    await expect(page.locator('#consentEmailTransportTestResult')).toContainText('con error (smtp_connect_failed)')
  })

  test('429 rate_limited: mensaje legible', async ({ page }) => {
    await setup(page, { transport: SMTP_TRANSPORT, testStatus: 429, testBody: { error: 'rate_limited' } })
    await openConsentAsIdentity(page)
    await page.locator('#consentEmailTransportTestButton').click()
    await expect(page.locator('#consentEmailTransportTestResult')).toContainText('espera un momento')
  })

  test('503 rate_limit_unavailable: mensaje legible', async ({ page }) => {
    await setup(page, { transport: SMTP_TRANSPORT, testStatus: 503, testBody: { error: 'rate_limit_unavailable' } })
    await openConsentAsIdentity(page)
    await page.locator('#consentEmailTransportTestButton').click()
    await expect(page.locator('#consentEmailTransportTestResult')).toContainText('No se pudo comprobar el límite')
  })

  test('400 email_transport_not_configured: mensaje legible', async ({ page }) => {
    await setup(page, { transport: SMTP_TRANSPORT, testStatus: 400, testBody: { error: 'email_transport_not_configured' } })
    await openConsentAsIdentity(page)
    await page.locator('#consentEmailTransportTestButton').click()
    await expect(page.locator('#consentEmailTransportTestResult')).toContainText('guárdalo primero')
  })

  test('cerrar sesión limpia el resultado y oculta el botón', async ({ page }) => {
    await setup(page, { transport: SMTP_TRANSPORT })
    await openConsentAsIdentity(page)
    await page.locator('#consentEmailTransportTestButton').click()
    await expect(page.locator('#consentEmailTransportTestResult')).not.toBeEmpty()
    await page.locator('#privacyLogout').click()
    await expect(page.locator('#consentEmailTransportTestButton')).toBeHidden()
    await expect(page.locator('#consentEmailTransportTestResult')).toHaveText('')
  })

  test('rol solo editor/auditor: no ve la sección ni el botón', async ({ page }) => {
    await setup(page, { roles: ['privacy_auditor'], transport: SMTP_TRANSPORT })
    await openConsentAsIdentity(page)
    await expect(page.locator('#consentEmailTransport')).toBeHidden()
    await expect(page.locator('#consentEmailTransportTestButton')).toBeHidden()
  })
})
