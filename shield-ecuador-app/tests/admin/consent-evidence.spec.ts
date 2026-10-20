import { test, expect, Page } from '@playwright/test'

// T24.b (REQ-17): Evidencia — búsqueda por correo/user_id (GET /evidence, PRIVACY_ROLES, T16.c) con
// historial de IP enmascarada, y "Revelar IP" con motivo (POST /evidence/reveal-ip, ADMIN_ONLY, T16.d.1).
// Mismo patrón de mocking que consent-audit-log.spec.ts: el foco es el panel de evidencia, no la
// autenticación.
const USER = { id: '0d9b7c1e-2f3a-4b5c-8d6e-7f8091a2b3c4', email: 'admin.uno@example.test' }
const FID = '11111111-2222-4333-8444-555555555555'
const AAL2_TOKEN = 'eyJhbGciOiJFUzI1NiJ9.dG90cC1hYWwy.c2lnMg'
const TITULAR_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

const MASKED_ITEMS = [
  {
    document_version: '1.1',
    purpose_code: 'registro_aprendizaje',
    decision: 'granted',
    channel: 'registro',
    server_ts: '2026-10-15T10:00:00.000Z',
    rendered_sha256: 'sha-1',
    ip_masked: '203.0.113.xxx',
  },
  {
    document_version: '1.1',
    purpose_code: 'boletin',
    decision: 'denied',
    channel: 'registro',
    server_ts: '2026-10-15T10:00:00.000Z',
    rendered_sha256: 'sha-1',
    ip_masked: null,
  },
]

const REVEALED_ITEMS = [
  { ...MASKED_ITEMS[0], ip: '203.0.113.77', ip_masked: undefined },
  { ...MASKED_ITEMS[1], ip: null, ip_masked: undefined },
]

const SETTINGS = {
  settings_version: 1,
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
  searchStatus?: number
  searchBody?: unknown
  revealStatus?: number
  revealBody?: unknown
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
    if (path === '/fn/admin-consent/settings/history' && req.method() === 'GET') return json(200, [])
    if (url.pathname.endsWith('/audit-log') && req.method() === 'GET') return json(200, { items: [], total: 0 })
    if (url.pathname.endsWith('/evidence') && req.method() === 'GET') {
      if (o.searchStatus && o.searchStatus !== 200) return json(o.searchStatus, o.searchBody ?? { error: 'invalid_input' })
      if (o.searchBody) return json(200, o.searchBody)
      return json(200, { user_id: TITULAR_ID, items: MASKED_ITEMS })
    }
    if (url.pathname.endsWith('/evidence/reveal-ip') && req.method() === 'POST') {
      if (o.revealStatus && o.revealStatus !== 200) return json(o.revealStatus, o.revealBody ?? { error: 'reason_required' })
      return json(200, { user_id: TITULAR_ID, items: REVEALED_ITEMS })
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

async function searchByEmail(page: Page, email = 'titular@example.test') {
  await page.locator('#consentEvidenceEmail').fill(email)
  await page.locator('#consentEvidenceSearchForm').getByRole('button', { name: 'Buscar' }).click()
}

test.describe('T24.b · Evidencia de consentimiento', () => {
  test.beforeEach(async ({}, info) => { test.skip(info.project.name !== 'desktop-chrome', 'servidor: una sola vez') })

  for (const role of ['privacy_admin', 'privacy_editor', 'privacy_auditor']) {
    test(`rol ${role}: ve la sección sin pedir nada hasta que se busca`, async ({ page }) => {
      const { seen } = await setup(page, { roles: [role] })
      await openConsentAsIdentity(page)
      await expect(page.locator('#consentEvidence')).toBeVisible()
      expect(seen.some((s) => s.url.startsWith('/fn/admin-consent/evidence'))).toBe(false)
    })
  }

  test('buscar por correo: manda email en el query con la sesión aal2 y muestra el historial con IP enmascarada', async ({ page }) => {
    const { seen } = await setup(page)
    await openConsentAsIdentity(page)
    await searchByEmail(page, 'titular@example.test')

    const call = seen.find((s) => s.url.startsWith('/fn/admin-consent/evidence?') && s.method === 'GET')!
    expect(call.session).toBe(AAL2_TOKEN)
    expect(call.url).toContain(`email=${encodeURIComponent('titular@example.test')}`)
    await expect(page.locator('#consentEvidenceRows tr')).toHaveCount(2)
    await expect(page.locator('#consentEvidenceRows tr').nth(0)).toContainText('203.0.113.xxx')
    await expect(page.locator('#consentEvidenceRows tr').nth(1)).toContainText('n/d')
  })

  test('buscar por user_id: manda user_id en el query', async ({ page }) => {
    const { seen } = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentEvidenceUserId').fill(TITULAR_ID)
    await page.locator('#consentEvidenceSearchForm').getByRole('button', { name: 'Buscar' }).click()

    const call = seen.find((s) => s.url.startsWith('/fn/admin-consent/evidence?') && s.method === 'GET')!
    expect(call.url).toContain(`user_id=${TITULAR_ID}`)
    await expect(page.locator('#consentEvidenceRows tr')).toHaveCount(2)
  })

  test('escribir correo y user_id a la vez: no llama al backend', async ({ page }) => {
    const { seen } = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentEvidenceEmail').fill('titular@example.test')
    await page.locator('#consentEvidenceUserId').fill(TITULAR_ID)
    await page.locator('#consentEvidenceSearchForm').getByRole('button', { name: 'Buscar' }).click()
    await expect(page.locator('#consentEvidenceMessage')).toContainText('solo uno')
    expect(seen.some((s) => s.url.startsWith('/fn/admin-consent/evidence'))).toBe(false)
  })

  test('sin escribir ningún campo: no llama al backend', async ({ page }) => {
    const { seen } = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentEvidenceSearchForm').getByRole('button', { name: 'Buscar' }).click()
    await expect(page.locator('#consentEvidenceMessage')).toContainText('Escribe un correo')
    expect(seen.some((s) => s.url.startsWith('/fn/admin-consent/evidence'))).toBe(false)
  })

  test('sin resultados (sin usuario o sin historial): mensaje único, sin distinguir el motivo', async ({ page }) => {
    await setup(page, { searchBody: { user_id: null, items: [] } })
    await openConsentAsIdentity(page)
    await searchByEmail(page)
    await expect(page.locator('#consentEvidenceRows')).toContainText('Sin resultados para esa búsqueda.')
  })

  test('error del backend al buscar: mensaje legible, tabla vacía', async ({ page }) => {
    await setup(page, { searchStatus: 400, searchBody: { error: 'invalid_input' } })
    await openConsentAsIdentity(page)
    await searchByEmail(page)
    await expect(page.locator('#consentEvidenceMessage')).not.toBeEmpty()
    await expect(page.locator('#consentEvidenceRows tr')).toHaveCount(0)
  })

  test('privacy_admin: tras una búsqueda con resultados ve "Revelar IP"; editor y auditor no', async ({ page }) => {
    await setup(page, { roles: ['privacy_admin'] })
    await openConsentAsIdentity(page)
    await searchByEmail(page)
    await expect(page.locator('#consentEvidenceRevealForm')).toBeVisible()
  })

  for (const role of ['privacy_editor', 'privacy_auditor']) {
    test(`rol ${role}: tras una búsqueda con resultados NO ve "Revelar IP"`, async ({ page }) => {
      await setup(page, { roles: [role] })
      await openConsentAsIdentity(page)
      await searchByEmail(page)
      await expect(page.locator('#consentEvidenceRevealForm')).toBeHidden()
    })
  }

  test('revelar IP sin motivo: no llama al backend', async ({ page }) => {
    const { seen } = await setup(page)
    await openConsentAsIdentity(page)
    await searchByEmail(page)
    await page.locator('#consentEvidenceRevealForm').getByRole('button', { name: 'Revelar IP' }).click()
    await expect(page.locator('#consentEvidenceRevealMessage')).toContainText('motivo es obligatorio')
    expect(seen.some((s) => s.url.includes('/evidence/reveal-ip'))).toBe(false)
  })

  test('revelar IP con motivo: llama al backend con user_id y motivo, sustituye la IP enmascarada por la real y oculta el formulario', async ({ page }) => {
    const { seen } = await setup(page)
    await openConsentAsIdentity(page)
    await searchByEmail(page)
    await page.locator('#consentEvidenceRevealReason').fill('Solicitud ARCO')
    await page.locator('#consentEvidenceRevealForm').getByRole('button', { name: 'Revelar IP' }).click()

    const call = seen.find((s) => s.url.includes('/evidence/reveal-ip'))!
    expect(call.session).toBe(AAL2_TOKEN)
    expect(JSON.parse(call.body || '{}')).toEqual({ user_id: TITULAR_ID, reason: 'Solicitud ARCO' })
    await expect(page.locator('#consentEvidenceRows tr').nth(0)).toContainText('203.0.113.77')
    await expect(page.locator('#consentEvidenceRevealMessage')).toContainText('IP revelada')
    await expect(page.locator('#consentEvidenceRevealForm')).toBeHidden()
  })

  test('error al revelar (reason_required): mensaje legible, el motivo escrito no se pierde', async ({ page }) => {
    await setup(page, { revealStatus: 400, revealBody: { error: 'reason_required' } })
    await openConsentAsIdentity(page)
    await searchByEmail(page)
    await page.locator('#consentEvidenceRevealReason').fill('motivo')
    await page.locator('#consentEvidenceRevealForm').getByRole('button', { name: 'Revelar IP' }).click()
    await expect(page.locator('#consentEvidenceRevealMessage')).toContainText('motivo es obligatorio')
    await expect(page.locator('#consentEvidenceRevealReason')).toHaveValue('motivo')
  })

  test('una nueva búsqueda vuelve a enmascarar la IP y muestra "Revelar IP" otra vez', async ({ page }) => {
    await setup(page)
    await openConsentAsIdentity(page)
    await searchByEmail(page)
    await page.locator('#consentEvidenceRevealReason').fill('Solicitud ARCO')
    await page.locator('#consentEvidenceRevealForm').getByRole('button', { name: 'Revelar IP' }).click()
    await expect(page.locator('#consentEvidenceRevealForm')).toBeHidden()

    await searchByEmail(page, 'otro@example.test')
    await expect(page.locator('#consentEvidenceRows tr').nth(0)).toContainText('203.0.113.xxx')
    await expect(page.locator('#consentEvidenceRevealForm')).toBeVisible()
  })

  test('cerrar sesión limpia los campos, la tabla, los mensajes y oculta "Revelar IP"', async ({ page }) => {
    await setup(page)
    await openConsentAsIdentity(page)
    await searchByEmail(page)
    await page.locator('#privacyLogout').click()
    await expect(page.locator('#consentEvidence')).toBeHidden()
    await expect(page.locator('#consentEvidenceEmail')).toHaveValue('')
    await expect(page.locator('#consentEvidenceRows')).toBeEmpty()
    await expect(page.locator('#consentEvidenceRevealForm')).toBeHidden()
  })
})
