import { test, expect, Page } from '@playwright/test'

// T22.c (REQ-13 d): acción "Retirar borrador" sin publicarlo — POST .../retire (T14) exige
// `privacy_admin` (ADMIN_ONLY, admin-consent/handler.ts), mismo candado que "Publicar". Mismo patrón
// de mocking que consent-publish.spec.ts: el foco es el modal de retiro, no la autenticación.
const USER = { id: '0d9b7c1e-2f3a-4b5c-8d6e-7f8091a2b3c4', email: 'admin.uno@example.test' }
const FID = '11111111-2222-4333-8444-555555555555'
const AAL2_TOKEN = 'eyJhbGciOiJFUzI1NiJ9.dG90cC1hYWwy.c2lnMg'

const DRAFT_PURPOSES = [{ code: 'registro_aprendizaje', label: 'Registro y aprendizaje', description: '', required: true, order: 1 }]

const DRAFT = {
  id: 'd-2', version: '1.1', title: 'Aviso de consentimiento (revisado)', content_md: 'Linea 1\nLinea 2',
  content_sha256: 'a', purposes: DRAFT_PURPOSES, status: 'draft', requires_reconsent: false, change_summary: 'ajustes menores',
  based_on_id: 'd-1', created_by: USER.id, created_at: '2026-10-10T12:00:00Z', updated_by: null, updated_at: null,
  published_by: null, published_at: null, retired_by: null, retired_at: null, acceptance_count: 0,
}
const PUBLISHED = {
  id: 'd-1', version: '1.0', title: 'Aviso de consentimiento', content_md: 'Linea 1\nLinea 2', content_sha256: 'b',
  purposes: DRAFT_PURPOSES, status: 'published', requires_reconsent: false, change_summary: null,
  based_on_id: null, created_by: USER.id, created_at: '2026-09-01T09:00:00Z', updated_by: null, updated_at: null,
  published_by: USER.id, published_at: '2026-09-02T09:00:00Z', retired_by: null, retired_at: null, acceptance_count: 42,
}

type Opts = { roles?: string[]; docs?: unknown[]; retireStatus?: number; retireBody?: unknown }
type Seen = { url: string; method: string; session: string | undefined; body: string | null }

async function setup(page: Page, o: Opts = {}) {
  const seen: Seen[] = []
  const roles = o.roles ?? ['privacy_admin']
  const docs = o.docs ?? [DRAFT, PUBLISHED]
  let getDocumentsCalls = 0
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
    if (path === '/fn/admin-consent/documents' && req.method() === 'GET') { getDocumentsCalls++; return json(200, docs) }
    if (path === `/fn/admin-consent/documents/${DRAFT.id}/retire` && req.method() === 'POST') {
      if (o.retireStatus && o.retireStatus !== 200) return json(o.retireStatus, o.retireBody ?? { error: 'forbidden' })
      return json(200, { ...DRAFT, status: 'retired', retired_by: USER.id, retired_at: '2026-10-14T12:00:00Z' })
    }
    return json(404, { error: 'not_found' })
  })
  return { seen, getDocumentsCalls: () => getDocumentsCalls }
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

test.describe('T22.c · acción "Retirar borrador"', () => {
  test.beforeEach(async ({}, info) => { test.skip(info.project.name !== 'desktop-chrome', 'servidor: una sola vez') })

  test('"Retirar" visible solo para privacy_admin, nunca en la fila publicada', async ({ page }) => {
    await setup(page, { roles: ['privacy_admin'] })
    await openConsentAsIdentity(page)
    const rows = page.locator('#consentDocsRows tr')
    await expect(rows.nth(0).getByRole('button', { name: 'Retirar' })).toBeVisible()
    await expect(rows.nth(1).getByRole('button', { name: 'Retirar' })).toHaveCount(0)
  })

  test('rol solo editor (sin admin): sin botón "Retirar", aunque sí vea "Editar"/"Comparar"', async ({ page }) => {
    await setup(page, { roles: ['privacy_editor'] })
    await openConsentAsIdentity(page)
    await expect(page.locator('#consentDocsRows').getByRole('button', { name: 'Retirar' })).toHaveCount(0)
    await expect(page.locator('#consentDocsRows').getByRole('button', { name: 'Editar' })).toHaveCount(1)
  })

  test('rol solo auditor: sin botón "Retirar"', async ({ page }) => {
    await setup(page, { roles: ['privacy_auditor'] })
    await openConsentAsIdentity(page)
    await expect(page.locator('#consentDocsRows').getByRole('button', { name: 'Retirar' })).toHaveCount(0)
  })

  test('motivo vacío: no llama al backend', async ({ page }) => {
    const { seen } = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Retirar' }).click()
    await page.locator('#consentRetireConfirmVersion').fill(DRAFT.version)
    await page.locator('#consentRetireForm').getByRole('button', { name: 'Retirar' }).click()
    await expect(page.locator('#consentRetireMessage')).not.toBeEmpty()
    expect(seen.some((s) => s.url.includes('/retire'))).toBe(false)
  })

  test('versión de confirmación incorrecta: no llama al backend', async ({ page }) => {
    const { seen } = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Retirar' }).click()
    await page.locator('#consentRetireReason').fill('Borrador abandonado: se reescribe desde cero.')
    await page.locator('#consentRetireConfirmVersion').fill('9.9')
    await page.locator('#consentRetireForm').getByRole('button', { name: 'Retirar' }).click()
    await expect(page.locator('#consentRetireMessage')).toContainText('1.1')
    expect(seen.some((s) => s.url.includes('/retire'))).toBe(false)
  })

  test('retirar con éxito: motivo y versión correctos, cierra el modal y recarga la lista', async ({ page }) => {
    const { seen, getDocumentsCalls } = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Retirar' }).click()
    await page.locator('#consentRetireReason').fill('Borrador abandonado: se reescribe desde cero.')
    await page.locator('#consentRetireConfirmVersion').fill(DRAFT.version)
    const callsBefore = getDocumentsCalls()
    await page.locator('#consentRetireForm').getByRole('button', { name: 'Retirar' }).click()
    await expect(page.locator('#consentRetireView')).toBeHidden()

    const retireCall = seen.find((s) => s.url === `/fn/admin-consent/documents/${DRAFT.id}/retire` && s.method === 'POST')!
    expect(retireCall.session).toBe(AAL2_TOKEN)
    expect(JSON.parse(retireCall.body || '{}')).toEqual({ reason: 'Borrador abandonado: se reescribe desde cero.' })
    expect(getDocumentsCalls()).toBe(callsBefore + 1) // recarga la lista tras retirar
  })

  test('error real del backend (ya no es borrador): mensaje legible, el modal sigue abierto', async ({ page }) => {
    await setup(page, { retireStatus: 409, retireBody: { error: 'not_draft' } })
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Retirar' }).click()
    await page.locator('#consentRetireReason').fill('Motivo cualquiera.')
    await page.locator('#consentRetireConfirmVersion').fill(DRAFT.version)
    await page.locator('#consentRetireForm').getByRole('button', { name: 'Retirar' }).click()
    await expect(page.locator('#consentRetireMessage')).not.toBeEmpty()
    await expect(page.locator('#consentRetireView')).toBeVisible() // el modal sigue abierto: nada se retiró
  })

  test('cerrar el modal lo oculta y limpia los campos', async ({ page }) => {
    await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Retirar' }).click()
    await page.locator('#consentRetireReason').fill('Texto que se debe perder al cerrar.')
    await page.locator('#consentRetireConfirmVersion').fill('algo')
    await page.locator('#consentRetireClose').click()
    await expect(page.locator('#consentRetireView')).toBeHidden()
    await expect(page.locator('#consentRetireReason')).toHaveValue('')
    await expect(page.locator('#consentRetireConfirmVersion')).toHaveValue('')
  })
})
