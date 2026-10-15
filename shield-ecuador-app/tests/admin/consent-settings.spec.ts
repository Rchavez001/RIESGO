import { test, expect, Page } from '@playwright/test'

// T23.a (REQ-14): formulario de configuración del responsable y delegado. `GET /settings` (T15) acepta
// cualquier rol de PRIVACY_ROLES; `POST /settings` (T15) exige `privacy_admin` (ADMIN_ONLY, mismo candado
// que "Publicar"/"Retirar"). `privacy_email` y `four_eyes_publish` no son parte de este formulario (el
// primero tiene su propio flujo de verificación, T23.b; el segundo no está en el alcance de REQ-14). Mismo
// patrón de mocking que consent-retire.spec.ts: el foco es el formulario, no la autenticación.
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

const HISTORY = [
  { ...SETTINGS, settings_version: 3, created_by: '0d9b7c1e-2f3a-4b5c-8d6e-7f8091a2b3c4', created_at: '2026-10-10T12:00:00Z' },
  { ...SETTINGS, settings_version: 2, controller_name: 'Nombre anterior', created_by: '1a2b3c4d-5e6f-4789-a0b1-c2d3e4f50617', created_at: '2026-09-01T08:00:00Z' },
]

type Opts = {
  roles?: string[]
  getStatus?: number
  getBody?: unknown
  postStatus?: number
  postBody?: unknown
  historyStatus?: number
  historyErrorBody?: unknown
  historyBody?: unknown[]
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
    if (path === '/fn/admin-consent/settings' && req.method() === 'GET') {
      if (o.getStatus && o.getStatus !== 200) return json(o.getStatus, o.getBody ?? { error: 'settings_unavailable' })
      return json(200, SETTINGS)
    }
    if (path === '/fn/admin-consent/settings' && req.method() === 'POST') {
      if (o.postStatus && o.postStatus !== 200) return json(o.postStatus, o.postBody ?? { error: 'forbidden' })
      const patch = JSON.parse(req.postData() || '{}')
      return json(200, { ...SETTINGS, ...patch, settings_version: SETTINGS.settings_version + 1 })
    }
    if (path === '/fn/admin-consent/settings/history' && req.method() === 'GET') {
      if (o.historyStatus && o.historyStatus !== 200) return json(o.historyStatus, o.historyErrorBody ?? { error: 'forbidden' })
      return json(200, o.historyBody ?? HISTORY)
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

test.describe('T23.a · Configuración del responsable y delegado', () => {
  test.beforeEach(async ({}, info) => { test.skip(info.project.name !== 'desktop-chrome', 'servidor: una sola vez') })

  test('carga los valores vigentes al entrar', async ({ page }) => {
    await setup(page)
    await openConsentAsIdentity(page)
    await expect(page.locator('#consentSettingsControllerName')).toHaveValue(SETTINGS.controller_name)
    await expect(page.locator('#consentSettingsControllerAddress')).toHaveValue(SETTINGS.controller_address)
    await expect(page.locator('#consentSettingsControllerPhone')).toHaveValue(SETTINGS.controller_phone)
    await expect(page.locator('#consentSettingsDpoName')).toHaveValue(SETTINGS.dpo_name)
    await expect(page.locator('#consentSettingsDpoContact')).toHaveValue(SETTINGS.dpo_contact)
    await expect(page.locator('#consentSettingsPolicyUrl')).toHaveValue(SETTINGS.privacy_policy_url)
    await expect(page.locator('#consentSettingsUnsubscribeSubject')).toHaveValue(SETTINGS.unsubscribe_subject)
    await expect(page.locator('#consentSettingsResponseDays')).toHaveValue(String(SETTINGS.response_days))
    await expect(page.locator('#consentSettingsIpRetentionDays')).toHaveValue(String(SETTINGS.ip_retention_days))
    await expect(page.locator('#consentSettingsVersion')).toContainText('3')
  })

  test('privacy_admin ve "Guardar" y los campos habilitados', async ({ page }) => {
    await setup(page, { roles: ['privacy_admin'] })
    await openConsentAsIdentity(page)
    await expect(page.locator('#consentSettingsForm').getByRole('button', { name: 'Guardar' })).toBeVisible()
    await expect(page.locator('#consentSettingsControllerName')).toBeEnabled()
  })

  test('rol solo editor: sin botón "Guardar", campos de solo lectura', async ({ page }) => {
    await setup(page, { roles: ['privacy_editor'] })
    await openConsentAsIdentity(page)
    await expect(page.locator('#consentSettingsForm').getByRole('button', { name: 'Guardar' })).toBeHidden()
    await expect(page.locator('#consentSettingsControllerName')).toBeDisabled()
    await expect(page.locator('#consentSettingsControllerName')).toHaveValue(SETTINGS.controller_name)
  })

  test('rol solo auditor: sin botón "Guardar", campos de solo lectura', async ({ page }) => {
    await setup(page, { roles: ['privacy_auditor'] })
    await openConsentAsIdentity(page)
    await expect(page.locator('#consentSettingsForm').getByRole('button', { name: 'Guardar' })).toBeHidden()
    await expect(page.locator('#consentSettingsControllerAddress')).toBeDisabled()
  })

  test('asunto del correo de baja vacío: no llama al backend', async ({ page }) => {
    const { seen } = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentSettingsUnsubscribeSubject').fill('')
    await page.locator('#consentSettingsForm').getByRole('button', { name: 'Guardar' }).click()
    await expect(page.locator('#consentSettingsMessage')).not.toBeEmpty()
    expect(seen.some((s) => s.url === '/fn/admin-consent/settings' && s.method === 'POST')).toBe(false)
  })

  test('plazo de respuesta fuera de rango (91): no llama al backend', async ({ page }) => {
    const { seen } = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentSettingsResponseDays').fill('91')
    await page.locator('#consentSettingsForm').getByRole('button', { name: 'Guardar' }).click()
    await expect(page.locator('#consentSettingsMessage')).not.toBeEmpty()
    expect(seen.some((s) => s.url === '/fn/admin-consent/settings' && s.method === 'POST')).toBe(false)
  })

  test('plazo de conservación de IP negativo: no llama al backend', async ({ page }) => {
    const { seen } = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentSettingsIpRetentionDays').fill('-1')
    await page.locator('#consentSettingsForm').getByRole('button', { name: 'Guardar' }).click()
    await expect(page.locator('#consentSettingsMessage')).not.toBeEmpty()
    expect(seen.some((s) => s.url === '/fn/admin-consent/settings' && s.method === 'POST')).toBe(false)
  })

  test('guardar con éxito: body exacto sin privacy_email/four_eyes_publish, refleja la settings_version nueva', async ({ page }) => {
    const { seen } = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentSettingsControllerPhone').fill('+593988888888')
    await page.locator('#consentSettingsForm').getByRole('button', { name: 'Guardar' }).click()
    await expect(page.locator('#consentSettingsVersion')).toContainText('4')

    const postCall = seen.find((s) => s.url === '/fn/admin-consent/settings' && s.method === 'POST')!
    expect(postCall.session).toBe(AAL2_TOKEN)
    const body = JSON.parse(postCall.body || '{}')
    expect(body).toEqual({
      controller_name: SETTINGS.controller_name,
      controller_address: SETTINGS.controller_address,
      controller_phone: '+593988888888',
      dpo_name: SETTINGS.dpo_name,
      dpo_contact: SETTINGS.dpo_contact,
      privacy_policy_url: SETTINGS.privacy_policy_url,
      unsubscribe_subject: SETTINGS.unsubscribe_subject,
      response_days: SETTINGS.response_days,
      ip_retention_days: SETTINGS.ip_retention_days,
    })
    expect(body.privacy_email).toBeUndefined()
    expect(body.four_eyes_publish).toBeUndefined()
  })

  test('campos opcionales vacíos: viajan como null, nunca ""', async ({ page }) => {
    const { seen } = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentSettingsControllerName').fill('')
    await page.locator('#consentSettingsDpoContact').fill('')
    await page.locator('#consentSettingsForm').getByRole('button', { name: 'Guardar' }).click()
    await expect(page.locator('#consentSettingsVersion')).toContainText('4')

    const postCall = seen.find((s) => s.url === '/fn/admin-consent/settings' && s.method === 'POST')!
    const body = JSON.parse(postCall.body || '{}')
    expect(body.controller_name).toBeNull()
    expect(body.dpo_contact).toBeNull()
  })

  test('error real del backend (invalid_input): mensaje legible, no pierde lo escrito', async ({ page }) => {
    await setup(page, { postStatus: 400, postBody: { error: 'invalid_input' } })
    await openConsentAsIdentity(page)
    await page.locator('#consentSettingsControllerPhone').fill('+593900000000')
    await page.locator('#consentSettingsForm').getByRole('button', { name: 'Guardar' }).click()
    await expect(page.locator('#consentSettingsMessage')).not.toBeEmpty()
    await expect(page.locator('#consentSettingsControllerPhone')).toHaveValue('+593900000000')
    await expect(page.locator('#consentSettingsVersion')).toContainText('3') // no se actualizó: el guardado falló
  })
})

// T23.c: historial de versiones (GET /settings/history, PRIVACY_ROLES, solo lectura). Mismos campos que
// `GET /settings` ya muestra para la vigente, más "quién" (created_by) y "cuándo" (created_at).
test.describe('T23.c · Historial de versiones de configuración', () => {
  test.beforeEach(async ({}, info) => { test.skip(info.project.name !== 'desktop-chrome', 'servidor: una sola vez') })

  for (const roles of [['privacy_editor'], ['privacy_admin'], ['privacy_auditor']]) {
    test(`rol ${roles[0]}: ve el historial, más reciente primero, con quién y cuándo`, async ({ page }) => {
      await setup(page, { roles })
      await openConsentAsIdentity(page)
      const rows = page.locator('#consentSettingsHistoryRows tr')
      await expect(rows).toHaveCount(2)
      await expect(rows.nth(0)).toContainText('3') // settings_version DESC
      await expect(rows.nth(0)).toContainText(HISTORY[0].created_by)
      await expect(rows.nth(1)).toContainText('2')
    })
  }

  test('sin historial todavía → mensaje explícito', async ({ page }) => {
    await setup(page, { historyBody: [] })
    await openConsentAsIdentity(page)
    await expect(page.locator('#consentSettingsHistoryRows')).toContainText('Sin historial todavía.')
  })

  test('error del backend al listar → mensaje legible, tabla vacía sin el mensaje de "sin historial"', async ({ page }) => {
    await setup(page, { historyStatus: 403, historyErrorBody: { error: 'forbidden' } })
    await openConsentAsIdentity(page)
    await expect(page.locator('#consentSettingsHistoryMessage')).not.toBeEmpty()
    await expect(page.locator('#consentSettingsHistoryRows')).not.toContainText('Sin historial todavía.')
    await expect(page.locator('#consentSettingsHistoryRows tr')).toHaveCount(0)
  })

  test('botón "Actualizar" vuelve a pedir el historial', async ({ page }) => {
    const { seen } = await setup(page)
    await openConsentAsIdentity(page)
    seen.length = 0
    await page.locator('#consentSettingsHistoryRefresh').click()
    await expect.poll(() => seen.some((s) => s.url === '/fn/admin-consent/settings/history' && s.method === 'GET')).toBe(true)
  })

  test('guardar la configuración recarga el historial', async ({ page }) => {
    const { seen } = await setup(page)
    await openConsentAsIdentity(page)
    seen.length = 0
    await page.locator('#consentSettingsForm').getByRole('button', { name: 'Guardar' }).click()
    await expect(page.locator('#consentSettingsVersion')).toContainText('4')
    await expect.poll(() => seen.some((s) => s.url === '/fn/admin-consent/settings/history' && s.method === 'GET')).toBe(true)
  })

  test('cerrar sesión limpia la tabla', async ({ page }) => {
    await setup(page)
    await openConsentAsIdentity(page)
    await expect(page.locator('#consentSettingsHistoryRows tr')).toHaveCount(2)
    await page.locator('#privacyLogout').click()
    await expect(page.locator('#consentSettingsHistoryRows')).toBeEmpty()
  })
})
