import { test, expect, Page } from '@playwright/test'

// T23.b (REQ-15): cambio del correo de privacidad con verificación (correo nuevo → código de 6 dígitos
// válido 30 min → confirmar). `POST /settings/email-change` y `POST /settings/email-change/confirm`
// (admin-consent/handler.ts) exigen `privacy_admin` (ADMIN_ONLY, mismo candado que T23.a); la sección
// completa queda oculta para editor/auditor, no solo de solo lectura (a diferencia de T23.a). Mismo
// patrón de mocking que consent-settings.spec.ts: el foco es el formulario, no la autenticación.
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

type Opts = {
  roles?: string[]
  requestStatus?: number
  requestBody?: unknown
  confirmStatus?: number
  confirmBody?: unknown
}
type Seen = { url: string; method: string; session: string | undefined; body: string | null }

async function setup(page: Page, o: Opts = {}) {
  const seen: Seen[] = []
  const roles = o.roles ?? ['privacy_admin']
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
    if (path === '/fn/admin-consent/settings/email-change') {
      if (o.requestStatus && o.requestStatus !== 200) return json(o.requestStatus, o.requestBody ?? { error: 'forbidden' })
      return json(200, { expires_at: '2026-10-14T13:00:00.000Z' })
    }
    if (path === '/fn/admin-consent/settings/email-change/confirm') {
      if (o.confirmStatus && o.confirmStatus !== 200) return json(o.confirmStatus, o.confirmBody ?? { error: 'forbidden' })
      const patch = JSON.parse(req.postData() || '{}')
      return json(200, { ...SETTINGS, privacy_email: 'nuevo@example.test', settings_version: SETTINGS.settings_version + 1, _code: patch.code })
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

test.describe('T23.b · Correo de privacidad con verificación', () => {
  test.beforeEach(async ({}, info) => { test.skip(info.project.name !== 'desktop-chrome', 'servidor: una sola vez') })

  test('privacy_admin ve el correo vigente y el formulario de nuevo correo', async ({ page }) => {
    await setup(page)
    await openConsentAsIdentity(page)
    await expect(page.locator('#consentEmailChange')).toBeVisible()
    await expect(page.locator('#consentEmailChangeCurrent')).toContainText(SETTINGS.privacy_email)
    await expect(page.locator('#consentEmailChangeRequestForm')).toBeVisible()
    await expect(page.locator('#consentEmailChangePending')).toBeHidden()
  })

  test('rol solo editor: no ve la sección de correo de privacidad', async ({ page }) => {
    await setup(page, { roles: ['privacy_editor'] })
    await openConsentAsIdentity(page)
    await expect(page.locator('#consentEmailChange')).toBeHidden()
  })

  test('rol solo auditor: no ve la sección de correo de privacidad', async ({ page }) => {
    await setup(page, { roles: ['privacy_auditor'] })
    await openConsentAsIdentity(page)
    await expect(page.locator('#consentEmailChange')).toBeHidden()
  })

  test('nuevo correo vacío: no llama al backend', async ({ page }) => {
    const { seen } = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentEmailChangeRequestForm').getByRole('button', { name: 'Enviar código de verificación' }).click()
    await expect(page.locator('#consentEmailChangeMessage')).not.toBeEmpty()
    expect(seen.some((s) => s.url === '/fn/admin-consent/settings/email-change')).toBe(false)
  })

  test('enviar código con éxito: muestra el formulario de código con el correo y el vencimiento', async ({ page }) => {
    const { seen } = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentEmailChangeNewEmail').fill('nuevo@example.test')
    await page.locator('#consentEmailChangeRequestForm').getByRole('button', { name: 'Enviar código de verificación' }).click()

    await expect(page.locator('#consentEmailChangeRequestForm')).toBeHidden()
    await expect(page.locator('#consentEmailChangePending')).toBeVisible()
    await expect(page.locator('#consentEmailChangePendingInfo')).toContainText('nuevo@example.test')

    const call = seen.find((s) => s.url === '/fn/admin-consent/settings/email-change')!
    expect(call.session).toBe(AAL2_TOKEN)
    expect(JSON.parse(call.body || '{}')).toEqual({ new_email: 'nuevo@example.test' })
  })

  test('correo saliente no configurado: mensaje de error, formulario de nuevo correo sigue visible', async ({ page }) => {
    await setup(page, { requestStatus: 400, requestBody: { error: 'email_transport_not_configured' } })
    await openConsentAsIdentity(page)
    await page.locator('#consentEmailChangeNewEmail').fill('nuevo@example.test')
    await page.locator('#consentEmailChangeRequestForm').getByRole('button', { name: 'Enviar código de verificación' }).click()
    await expect(page.locator('#consentEmailChangeMessage')).not.toBeEmpty()
    await expect(page.locator('#consentEmailChangeRequestForm')).toBeVisible()
  })

  test('código con formato inválido: no llama al backend', async ({ page }) => {
    const { seen } = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentEmailChangeNewEmail').fill('nuevo@example.test')
    await page.locator('#consentEmailChangeRequestForm').getByRole('button', { name: 'Enviar código de verificación' }).click()
    await page.locator('#consentEmailChangeCode').fill('12a')
    await page.locator('#consentEmailChangeConfirmForm').getByRole('button', { name: 'Confirmar' }).click()
    await expect(page.locator('#consentEmailChangeMessage')).not.toBeEmpty()
    expect(seen.some((s) => s.url === '/fn/admin-consent/settings/email-change/confirm')).toBe(false)
  })

  test('código incorrecto: mensaje de error, el formulario de código sigue visible', async ({ page }) => {
    await setup(page, { confirmStatus: 400, confirmBody: { error: 'invalid_code' } })
    await openConsentAsIdentity(page)
    await page.locator('#consentEmailChangeNewEmail').fill('nuevo@example.test')
    await page.locator('#consentEmailChangeRequestForm').getByRole('button', { name: 'Enviar código de verificación' }).click()
    await page.locator('#consentEmailChangeCode').fill('000000')
    await page.locator('#consentEmailChangeConfirmForm').getByRole('button', { name: 'Confirmar' }).click()
    await expect(page.locator('#consentEmailChangeMessage')).toContainText('incorrecto')
    await expect(page.locator('#consentEmailChangePending')).toBeVisible()
  })

  test('intentos agotados (429): mensaje de error propio', async ({ page }) => {
    await setup(page, { confirmStatus: 429, confirmBody: { error: 'attempts_exhausted' } })
    await openConsentAsIdentity(page)
    await page.locator('#consentEmailChangeNewEmail').fill('nuevo@example.test')
    await page.locator('#consentEmailChangeRequestForm').getByRole('button', { name: 'Enviar código de verificación' }).click()
    await page.locator('#consentEmailChangeCode').fill('000000')
    await page.locator('#consentEmailChangeConfirmForm').getByRole('button', { name: 'Confirmar' }).click()
    await expect(page.locator('#consentEmailChangeMessage')).toContainText('agotaron')
  })

  test('código vencido (410): mensaje de error propio', async ({ page }) => {
    await setup(page, { confirmStatus: 410, confirmBody: { error: 'code_expired' } })
    await openConsentAsIdentity(page)
    await page.locator('#consentEmailChangeNewEmail').fill('nuevo@example.test')
    await page.locator('#consentEmailChangeRequestForm').getByRole('button', { name: 'Enviar código de verificación' }).click()
    await page.locator('#consentEmailChangeCode').fill('000000')
    await page.locator('#consentEmailChangeConfirmForm').getByRole('button', { name: 'Confirmar' }).click()
    await expect(page.locator('#consentEmailChangeMessage')).toContainText('venció')
  })

  test('confirmar con éxito: actualiza el correo vigente y la versión, vuelve al formulario de nuevo correo', async ({ page }) => {
    const { seen } = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentEmailChangeNewEmail').fill('nuevo@example.test')
    await page.locator('#consentEmailChangeRequestForm').getByRole('button', { name: 'Enviar código de verificación' }).click()
    await page.locator('#consentEmailChangeCode').fill('654321')
    await page.locator('#consentEmailChangeConfirmForm').getByRole('button', { name: 'Confirmar' }).click()

    await expect(page.locator('#consentEmailChangePending')).toBeHidden()
    await expect(page.locator('#consentEmailChangeRequestForm')).toBeVisible()
    await expect(page.locator('#consentEmailChangeCurrent')).toContainText('nuevo@example.test')
    await expect(page.locator('#consentSettingsVersion')).toContainText('4')

    const call = seen.find((s) => s.url === '/fn/admin-consent/settings/email-change/confirm')!
    expect(JSON.parse(call.body || '{}')).toEqual({ code: '654321' })
  })

  test('cancelar pendiente: vuelve al formulario de nuevo correo sin llamar al backend', async ({ page }) => {
    const { seen } = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentEmailChangeNewEmail').fill('nuevo@example.test')
    await page.locator('#consentEmailChangeRequestForm').getByRole('button', { name: 'Enviar código de verificación' }).click()
    await expect(page.locator('#consentEmailChangePending')).toBeVisible()

    await page.locator('#consentEmailChangeCancel').click()
    await expect(page.locator('#consentEmailChangePending')).toBeHidden()
    await expect(page.locator('#consentEmailChangeRequestForm')).toBeVisible()
    expect(seen.filter((s) => s.url === '/fn/admin-consent/settings/email-change/confirm')).toHaveLength(0)
  })
})
