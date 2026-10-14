import { test, expect, Page } from '@playwright/test'

// T21.c.1 (REQ-13 b): editor de título/contenido de un borrador dentro de la pestaña "Versiones"
// (T21.b), con vista previa vía GET /documents/:id/preview (T14, renderConsent). Mismo patrón de mocking
// con page.route que consent-documents.spec.ts: el foco es el editor, no la autenticación (privacy-login.spec.ts).
const USER = { id: '0d9b7c1e-2f3a-4b5c-8d6e-7f8091a2b3c4', email: 'admin.uno@example.test' }
const FID = '11111111-2222-4333-8444-555555555555'
const AAL2_TOKEN = 'eyJhbGciOiJFUzI1NiJ9.dG90cC1hYWwy.c2lnMg'

const DRAFT = {
  id: 'd-2', version: '1.1', title: 'Aviso de consentimiento', content_md: '# Aviso\n\nTexto {{responsable_nombre}}.',
  content_sha256: 'a', purposes: [], status: 'draft', requires_reconsent: false, change_summary: 'ajustes menores',
  based_on_id: 'd-1', created_by: USER.id, created_at: '2026-10-10T12:00:00Z', updated_by: null, updated_at: null,
  published_by: null, published_at: null, retired_by: null, retired_at: null, acceptance_count: 0,
}
const PUBLISHED = {
  id: 'd-1', version: '1.0', title: 'Aviso de consentimiento', content_md: '# y', content_sha256: 'b',
  purposes: [], status: 'published', requires_reconsent: true, change_summary: null,
  based_on_id: null, created_by: USER.id, created_at: '2026-09-01T09:00:00Z', updated_by: null, updated_at: null,
  published_by: USER.id, published_at: '2026-09-02T09:00:00Z', retired_by: null, retired_at: null, acceptance_count: 42,
}
const DOCS = [DRAFT, PUBLISHED]

type Opts = {
  roles?: string[]
  patchStatus?: number
  patchBody?: unknown
  previewStatus?: number
  previewBody?: unknown
}
type Seen = { url: string; method: string; session: string | undefined; body: string | null }

async function setup(page: Page, o: Opts = {}) {
  const seen: Seen[] = []
  const roles = o.roles ?? ['privacy_editor', 'privacy_admin']
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
    if (path === '/fn/admin-consent/documents' && req.method() === 'GET') return json(200, DOCS)
    if (path === `/fn/admin-consent/documents/${DRAFT.id}` && req.method() === 'PATCH') {
      if (o.patchStatus && o.patchStatus !== 200) return json(o.patchStatus, o.patchBody ?? { error: 'invalid_input' })
      const patch = JSON.parse(req.postData() || '{}')
      return json(200, o.patchBody ?? { ...DRAFT, ...patch })
    }
    if (path === `/fn/admin-consent/documents/${DRAFT.id}/preview` && req.method() === 'GET') {
      if (o.previewStatus && o.previewStatus !== 200) return json(o.previewStatus, o.previewBody ?? { error: 'settings_unavailable' })
      return json(200, o.previewBody ?? {
        document: { id: DRAFT.id, version: DRAFT.version, status: 'draft' },
        rendered_md: 'Aviso\n\nTexto {{responsable_nombre}}.',
        rendered_sha256: 'deadbeef',
        unknown: [],
        unresolved: ['responsable_nombre'],
      })
    }
    return json(404, { error: 'not_found' })
  })
  return seen
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

test.describe('T21.c.1 · editor de título/contenido de un borrador + vista previa', () => {
  test.beforeEach(async ({}, info) => { test.skip(info.project.name !== 'desktop-chrome', 'servidor: una sola vez') })

  test('"Editar" solo en la fila del borrador, nunca en la publicada', async ({ page }) => {
    await setup(page)
    await openConsentAsIdentity(page)
    const rows = page.locator('#consentDocsRows tr')
    await expect(rows.nth(0)).toContainText('1.1')
    await expect(rows.nth(0).getByRole('button', { name: 'Editar' })).toBeVisible()
    await expect(rows.nth(1)).toContainText('1.0')
    await expect(rows.nth(1).getByRole('button', { name: 'Editar' })).toHaveCount(0)
  })

  test('rol solo auditor: sin botón "Editar" en ninguna fila', async ({ page }) => {
    await setup(page, { roles: ['privacy_auditor'] })
    await openConsentAsIdentity(page)
    await expect(page.locator('#consentDocsRows').getByRole('button', { name: 'Editar' })).toHaveCount(0)
  })

  test('abrir el editor rellena título y contenido del borrador', async ({ page }) => {
    await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Editar' }).click()
    await expect(page.locator('#consentDraftEditor')).toBeVisible()
    await expect(page.locator('#consentEditorTitle')).toHaveValue(DRAFT.title)
    await expect(page.locator('#consentEditorContent')).toHaveValue(DRAFT.content_md)
  })

  test('guardar cambios: PATCH con title+content_md, actualiza la fila y pide la vista previa', async ({ page }) => {
    const seen = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Editar' }).click()
    await page.locator('#consentEditorTitle').fill('Aviso de consentimiento (revisado)')
    await page.locator('#consentEditorContent').fill('# Aviso\n\nTexto nuevo {{responsable_nombre}}.')
    await page.locator('#consentEditorForm').getByRole('button', { name: 'Guardar cambios' }).click()

    await expect(page.locator('#consentDocsRows tr').nth(0)).toContainText('Aviso de consentimiento (revisado)')
    await expect(page.locator('#consentPreview')).toContainText('Texto {{responsable_nombre}}.')
    await expect(page.locator('#consentPreview mark')).toHaveText('{{responsable_nombre}}')
    await expect(page.locator('#consentPreviewWarning')).toContainText('responsable_nombre')

    const patch = seen.find((s) => s.url === `/fn/admin-consent/documents/${DRAFT.id}` && s.method === 'PATCH')!
    expect(patch.session).toBe(AAL2_TOKEN)
    expect(JSON.parse(patch.body!)).toEqual({ title: 'Aviso de consentimiento (revisado)', content_md: '# Aviso\n\nTexto nuevo {{responsable_nombre}}.' })

    const preview = seen.find((s) => s.url === `/fn/admin-consent/documents/${DRAFT.id}/preview` && s.method === 'GET')!
    expect(preview.session).toBe(AAL2_TOKEN)
  })

  test('sin marcadores pendientes: la vista previa no muestra el aviso', async ({ page }) => {
    await setup(page, { previewBody: { document: { id: DRAFT.id, version: DRAFT.version, status: 'draft' }, rendered_md: 'Texto completo.', rendered_sha256: 'x', unknown: [], unresolved: [] } })
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Editar' }).click()
    await page.locator('#consentEditorForm').getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.locator('#consentPreview')).toContainText('Texto completo.')
    await expect(page.locator('#consentPreviewWarning')).toBeHidden()
  })

  test('guardar sin título ni contenido: no llama al backend', async ({ page }) => {
    const seen = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Editar' }).click()
    await page.locator('#consentEditorTitle').fill('')
    await page.locator('#consentEditorForm').getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.locator('#consentEditorMessage')).toContainText('obligatorios')
    expect(seen.some((s) => s.url === `/fn/admin-consent/documents/${DRAFT.id}` && s.method === 'PATCH')).toBe(false)
  })

  test('error al guardar (edición concurrente): mensaje legible, sin perder lo escrito', async ({ page }) => {
    await setup(page, { patchStatus: 409, patchBody: { error: 'concurrent_modification' } })
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Editar' }).click()
    await page.locator('#consentEditorContent').fill('# Cambio local sin guardar')
    await page.locator('#consentEditorForm').getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.locator('#consentEditorMessage')).toContainText('Alguien más editó este borrador')
    await expect(page.locator('#consentEditorContent')).toHaveValue('# Cambio local sin guardar')
  })

  test('el guardado funciona aunque la vista previa falle después', async ({ page }) => {
    await setup(page, { previewStatus: 503, previewBody: { error: 'settings_unavailable' } })
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Editar' }).click()
    await page.locator('#consentEditorForm').getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.locator('#consentDocsRows tr').nth(0)).toContainText(DRAFT.title)
    await expect(page.locator('#consentEditorMessage')).toContainText('configuración no disponible')
  })

  test('cerrar el editor limpia el panel', async ({ page }) => {
    await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Editar' }).click()
    await expect(page.locator('#consentDraftEditor')).toBeVisible()
    await page.locator('#consentEditorClose').click()
    await expect(page.locator('#consentDraftEditor')).toBeHidden()
    await expect(page.locator('#consentEditorTitle')).toHaveValue('')
  })
})
