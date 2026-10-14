import { test, expect, Page } from '@playwright/test'

// T22.b (REQ-13 d): modal de "Publicar" un borrador — POST .../publish (T14) exige `privacy_admin`
// (ADMIN_ONLY, admin-consent/handler.ts), más restrictivo que "Editar"/"Comparar" (EDITOR_ROLES, que
// también aceptan `privacy_editor`). Mismo patrón de mocking que consent-diff.spec.ts/
// consent-documents.spec.ts: el foco es el modal de publicación, no la autenticación.
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

type Opts = { roles?: string[]; docs?: unknown[]; publishStatus?: number; publishBody?: unknown; patchStatus?: number; patchBody?: unknown }
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
    if (path === `/fn/admin-consent/documents/${DRAFT.id}` && req.method() === 'PATCH') {
      if (o.patchStatus && o.patchStatus !== 200) return json(o.patchStatus, o.patchBody ?? { error: 'forbidden' })
      return json(200, { ...DRAFT, requires_reconsent: JSON.parse(req.postData() || '{}').requires_reconsent })
    }
    if (path === `/fn/admin-consent/documents/${DRAFT.id}/publish` && req.method() === 'POST') {
      if (o.publishStatus && o.publishStatus !== 200) return json(o.publishStatus, o.publishBody ?? { error: 'forbidden' })
      return json(200, { ...DRAFT, status: 'published', published_by: USER.id, published_at: '2026-10-14T12:00:00Z' })
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

test.describe('T22.b · modal de "Publicar"', () => {
  test.beforeEach(async ({}, info) => { test.skip(info.project.name !== 'desktop-chrome', 'servidor: una sola vez') })

  test('"Publicar" visible solo para privacy_admin, nunca en la fila publicada', async ({ page }) => {
    await setup(page, { roles: ['privacy_admin'] })
    await openConsentAsIdentity(page)
    const rows = page.locator('#consentDocsRows tr')
    await expect(rows.nth(0).getByRole('button', { name: 'Publicar' })).toBeVisible()
    await expect(rows.nth(1).getByRole('button', { name: 'Publicar' })).toHaveCount(0)
  })

  test('rol solo editor (sin admin): sin botón "Publicar", aunque sí vea "Editar"/"Comparar"', async ({ page }) => {
    await setup(page, { roles: ['privacy_editor'] })
    await openConsentAsIdentity(page)
    await expect(page.locator('#consentDocsRows').getByRole('button', { name: 'Publicar' })).toHaveCount(0)
    await expect(page.locator('#consentDocsRows').getByRole('button', { name: 'Editar' })).toHaveCount(1)
  })

  test('rol solo auditor: sin botón "Publicar"', async ({ page }) => {
    await setup(page, { roles: ['privacy_auditor'] })
    await openConsentAsIdentity(page)
    await expect(page.locator('#consentDocsRows').getByRole('button', { name: 'Publicar' })).toHaveCount(0)
  })

  test('abrir el modal muestra el resumen de impacto de la vigente', async ({ page }) => {
    await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Publicar' }).click()
    await expect(page.locator('#consentPublishView')).toBeVisible()
    await expect(page.locator('#consentPublishImpact')).toContainText('v1.0')
    await expect(page.locator('#consentPublishImpact')).toContainText('42')
  })

  test('sin ninguna versión publicada vigente: mensaje de impacto distinto', async ({ page }) => {
    await setup(page, { docs: [DRAFT] })
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Publicar' }).click()
    await expect(page.locator('#consentPublishImpact')).toContainText('No hay ninguna versión publicada')
  })

  test('motivo vacío: no llama al backend', async ({ page }) => {
    const { seen } = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Publicar' }).click()
    await page.locator('#consentPublishConfirmVersion').fill(DRAFT.version)
    await page.locator('#consentPublishForm').getByRole('button', { name: 'Publicar' }).click()
    await expect(page.locator('#consentPublishMessage')).not.toBeEmpty()
    expect(seen.some((s) => s.url.includes('/publish'))).toBe(false)
  })

  test('versión de confirmación incorrecta: no llama al backend', async ({ page }) => {
    const { seen } = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Publicar' }).click()
    await page.locator('#consentPublishReason').fill('Nueva redacción revisada por legal.')
    await page.locator('#consentPublishConfirmVersion').fill('9.9')
    await page.locator('#consentPublishForm').getByRole('button', { name: 'Publicar' }).click()
    await expect(page.locator('#consentPublishMessage')).toContainText('1.1')
    expect(seen.some((s) => s.url.includes('/publish'))).toBe(false)
  })

  test('publicar con éxito: motivo y versión correctos, cierra el modal y recarga la lista', async ({ page }) => {
    const { seen, getDocumentsCalls } = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Publicar' }).click()
    await page.locator('#consentPublishReason').fill('Nueva redacción revisada por legal.')
    await page.locator('#consentPublishConfirmVersion').fill(DRAFT.version)
    const callsBefore = getDocumentsCalls()
    await page.locator('#consentPublishForm').getByRole('button', { name: 'Publicar' }).click()
    await expect(page.locator('#consentPublishView')).toBeHidden()

    const publishCall = seen.find((s) => s.url === `/fn/admin-consent/documents/${DRAFT.id}/publish` && s.method === 'POST')!
    expect(publishCall.session).toBe(AAL2_TOKEN)
    expect(JSON.parse(publishCall.body || '{}')).toEqual({ reason: 'Nueva redacción revisada por legal.' })
    expect(seen.some((s) => s.url === `/fn/admin-consent/documents/${DRAFT.id}` && s.method === 'PATCH')).toBe(false)
    expect(getDocumentsCalls()).toBe(callsBefore + 1) // recarga la lista tras publicar
  })

  test('cambiar "requiere reconsentimiento" aplica un PATCH antes de publicar, en ese orden', async ({ page }) => {
    const { seen } = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Publicar' }).click()
    await expect(page.locator('#consentPublishRequiresReconsent')).not.toBeChecked() // DRAFT.requires_reconsent === false
    await page.locator('#consentPublishRequiresReconsent').check()
    await page.locator('#consentPublishReason').fill('Cambia una finalidad obligatoria.')
    await page.locator('#consentPublishConfirmVersion').fill(DRAFT.version)
    await page.locator('#consentPublishForm').getByRole('button', { name: 'Publicar' }).click()
    await expect(page.locator('#consentPublishView')).toBeHidden()

    const patchIndex = seen.findIndex((s) => s.url === `/fn/admin-consent/documents/${DRAFT.id}` && s.method === 'PATCH')
    const publishIndex = seen.findIndex((s) => s.url === `/fn/admin-consent/documents/${DRAFT.id}/publish` && s.method === 'POST')
    expect(patchIndex).toBeGreaterThanOrEqual(0)
    expect(publishIndex).toBeGreaterThan(patchIndex) // el PATCH de requires_reconsent viaja ANTES del publish
    expect(JSON.parse(seen[patchIndex].body || '{}')).toEqual({ requires_reconsent: true })
  })

  test('si el PATCH de "requiere reconsentimiento" falla, no intenta publicar', async ({ page }) => {
    const { seen } = await setup(page, { patchStatus: 409, patchBody: { error: 'concurrent_modification' } })
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Publicar' }).click()
    await page.locator('#consentPublishRequiresReconsent').check()
    await page.locator('#consentPublishReason').fill('Motivo cualquiera.')
    await page.locator('#consentPublishConfirmVersion').fill(DRAFT.version)
    await page.locator('#consentPublishForm').getByRole('button', { name: 'Publicar' }).click()
    await expect(page.locator('#consentPublishMessage')).not.toBeEmpty()
    await expect(page.locator('#consentPublishView')).toBeVisible() // el modal sigue abierto: nada se publicó
    expect(seen.some((s) => s.url.includes('/publish'))).toBe(false)
  })

  test('error de "cuatro ojos": mensaje legible, el modal sigue abierto', async ({ page }) => {
    await setup(page, { publishStatus: 403, publishBody: { error: 'four_eyes_required' } })
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Publicar' }).click()
    await page.locator('#consentPublishReason').fill('Motivo cualquiera.')
    await page.locator('#consentPublishConfirmVersion').fill(DRAFT.version)
    await page.locator('#consentPublishForm').getByRole('button', { name: 'Publicar' }).click()
    await expect(page.locator('#consentPublishMessage')).not.toBeEmpty()
    await expect(page.locator('#consentPublishView')).toBeVisible()
  })

  test('cerrar el modal lo oculta y limpia los campos', async ({ page }) => {
    await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Publicar' }).click()
    await page.locator('#consentPublishReason').fill('Texto que se debe perder al cerrar.')
    await page.locator('#consentPublishConfirmVersion').fill('algo')
    await page.locator('#consentPublishClose').click()
    await expect(page.locator('#consentPublishView')).toBeHidden()
    await expect(page.locator('#consentPublishReason')).toHaveValue('')
    await expect(page.locator('#consentPublishConfirmVersion')).toHaveValue('')
  })
})
