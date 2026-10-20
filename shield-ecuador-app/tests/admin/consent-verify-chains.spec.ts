import { test, expect, Page } from '@playwright/test'

// T24.e (REQ-18): botón "Verificar integridad" — GET /verify-chains (PRIVACY_ROLES, T16.f), sin disparo
// automático (a diferencia de #consentAuditLog/#consentRequests): solo corre cuando el admin lo pide.
// Mismo patrón de mocking que consent-requests.spec.ts: el foco es el panel, no la autenticación.
const USER = { id: '0d9b7c1e-2f3a-4b5c-8d6e-7f8091a2b3c4', email: 'admin.uno@example.test' }
const FID = '11111111-2222-4333-8444-555555555555'
const AAL2_TOKEN = 'eyJhbGciOiJFUzI1NiJ9.dG90cC1hYWwy.c2lnMg'

const OK = { broken: false, first_broken_id: null, detail: null }

type Opts = { roles?: string[]; verifyStatus?: number; verifyBody?: unknown }
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
    if (req.method() === 'GET' && url.pathname.endsWith('/audit-log')) return json(200, { items: [], total: 0 })
    if (req.method() === 'GET' && url.pathname.endsWith('/requests')) return json(200, { items: [], total: 0 })
    if (req.method() === 'GET' && url.pathname.endsWith('/verify-chains')) {
      if (o.verifyStatus && o.verifyStatus !== 200) return json(o.verifyStatus, o.verifyBody ?? { error: 'forbidden' })
      return json(200, o.verifyBody ?? { consent: OK, audit: OK })
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

test.describe('T24.e · Verificación de integridad', () => {
  test.beforeEach(async ({}, info) => { test.skip(info.project.name !== 'desktop-chrome', 'servidor: una sola vez') })

  for (const role of ['privacy_admin', 'privacy_editor', 'privacy_auditor']) {
    test(`rol ${role}: ve la sección, sin pedir nada hasta pulsar el botón`, async ({ page }) => {
      const { seen } = await setup(page, { roles: [role] })
      await openConsentAsIdentity(page)
      await expect(page.locator('#consentVerifyChains')).toBeVisible()
      expect(seen.some((s) => s.url.startsWith('/fn/admin-consent/verify-chains'))).toBe(false)
    })
  }

  test('pulsar "Verificar integridad": pide GET /verify-chains con la sesión aal2 y muestra ambas cadenas íntegras', async ({ page }) => {
    const { seen } = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentVerifyChainsButton').click()

    const call = seen.find((s) => s.url.startsWith('/fn/admin-consent/verify-chains') && s.method === 'GET')!
    expect(call.session).toBe(AAL2_TOKEN)
    await expect(page.locator('#consentVerifyChainsResult')).toContainText('Evidencia de consentimiento: cadena íntegra.')
    await expect(page.locator('#consentVerifyChainsResult')).toContainText('Bitácora administrativa: cadena íntegra.')
  })

  test('cadena de evidencia rota: señala el eslabón y el detalle, sin afectar el texto de la bitácora', async ({ page }) => {
    await setup(page, { verifyBody: { consent: { broken: true, first_broken_id: 3, detail: 'row_hash no coincide' }, audit: OK } })
    await openConsentAsIdentity(page)
    await page.locator('#consentVerifyChainsButton').click()
    await expect(page.locator('#consentVerifyChainsResult')).toContainText('Evidencia de consentimiento: cadena ROTA — primer eslabón afectado #3 (row_hash no coincide)')
    await expect(page.locator('#consentVerifyChainsResult')).toContainText('Bitácora administrativa: cadena íntegra.')
  })

  test('cadena de bitácora rota: señala el eslabón de la bitácora', async ({ page }) => {
    await setup(page, { verifyBody: { consent: OK, audit: { broken: true, first_broken_id: 7, detail: 'prev_hash no coincide' } } })
    await openConsentAsIdentity(page)
    await page.locator('#consentVerifyChainsButton').click()
    await expect(page.locator('#consentVerifyChainsResult')).toContainText('Bitácora administrativa: cadena ROTA — primer eslabón afectado #7 (prev_hash no coincide)')
  })

  test('error del backend: mensaje legible, sin resultado previo', async ({ page }) => {
    await setup(page, { verifyStatus: 403, verifyBody: { error: 'forbidden' } })
    await openConsentAsIdentity(page)
    await page.locator('#consentVerifyChainsButton').click()
    await expect(page.locator('#consentVerifyChainsMessage')).not.toBeEmpty()
    await expect(page.locator('#consentVerifyChainsResult')).toBeEmpty()
  })

  test('cerrar sesión limpia el resultado y el mensaje, y oculta la sección', async ({ page }) => {
    await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentVerifyChainsButton').click()
    await expect(page.locator('#consentVerifyChainsResult')).not.toBeEmpty()
    await page.locator('#privacyLogout').click()
    await expect(page.locator('#consentVerifyChains')).toBeHidden()
    await expect(page.locator('#consentVerifyChainsResult')).toBeEmpty()
    await expect(page.locator('#consentVerifyChainsMessage')).toBeEmpty()
  })
})
