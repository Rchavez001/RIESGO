import { test, expect, Page } from '@playwright/test'

// T22.a (REQ-13 c): acción "Comparar" dentro de la pestaña "Versiones" — diff lado a lado contra
// GET /documents/:id/diff (T14, sin cambios de backend). Mismo patrón de mocking que
// consent-documents.spec.ts/consent-editor.spec.ts: el foco es el panel de comparación, no la
// autenticación (privacy-login.spec.ts) ni el editor (consent-editor.spec.ts).
const USER = { id: '0d9b7c1e-2f3a-4b5c-8d6e-7f8091a2b3c4', email: 'admin.uno@example.test' }
const FID = '11111111-2222-4333-8444-555555555555'
const AAL2_TOKEN = 'eyJhbGciOiJFUzI1NiJ9.dG90cC1hYWwy.c2lnMg'

const DRAFT_PURPOSES = [{ code: 'registro_aprendizaje', label: 'Registro y aprendizaje', description: '', required: true, order: 1 }]

const DRAFT = {
  id: 'd-2', version: '1.1', title: 'Aviso de consentimiento (revisado)', content_md: 'Linea 1\nLinea 2\nLinea nueva\nLinea 3',
  content_sha256: 'a', purposes: DRAFT_PURPOSES, status: 'draft', requires_reconsent: true, change_summary: 'ajustes menores',
  based_on_id: 'd-1', created_by: USER.id, created_at: '2026-10-10T12:00:00Z', updated_by: null, updated_at: null,
  published_by: null, published_at: null, retired_by: null, retired_at: null, acceptance_count: 0,
}
const PUBLISHED = {
  id: 'd-1', version: '1.0', title: 'Aviso de consentimiento', content_md: 'Linea 1\nLinea 2\nLinea 3', content_sha256: 'b',
  purposes: DRAFT_PURPOSES, status: 'published', requires_reconsent: false, change_summary: null,
  based_on_id: null, created_by: USER.id, created_at: '2026-09-01T09:00:00Z', updated_by: null, updated_at: null,
  published_by: USER.id, published_at: '2026-09-02T09:00:00Z', retired_by: null, retired_at: null, acceptance_count: 42,
}
const DOCS = [DRAFT, PUBLISHED]

// Mismo cómputo que `diffDraft` (admin-consent/handler.ts, DIFF_FIELDS = title/content_md/purposes/requires_reconsent):
// solo los campos que de verdad cambiaron entre `base` (vigente) y `draft`.
const DIFF_CHANGED = {
  base: { id: PUBLISHED.id, version: PUBLISHED.version },
  draft: { id: DRAFT.id, version: DRAFT.version, status: 'draft' },
  changes: {
    title: { before: PUBLISHED.title, after: DRAFT.title },
    content_md: { before: PUBLISHED.content_md, after: DRAFT.content_md },
    requires_reconsent: { before: PUBLISHED.requires_reconsent, after: DRAFT.requires_reconsent },
  },
}
const DIFF_NO_CHANGES = { base: { id: PUBLISHED.id, version: PUBLISHED.version }, draft: { id: DRAFT.id, version: DRAFT.version, status: 'draft' }, changes: {} }
const DIFF_NO_BASE = { base: null, draft: { id: DRAFT.id, version: DRAFT.version, status: 'draft' }, changes: {} }

type Opts = { roles?: string[]; diffStatus?: number; diffBody?: unknown }
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
    if (path === `/fn/admin-consent/documents/${DRAFT.id}/diff` && req.method() === 'GET') {
      if (o.diffStatus && o.diffStatus !== 200) return json(o.diffStatus, o.diffBody ?? { error: 'forbidden' })
      return json(200, o.diffBody ?? DIFF_CHANGED)
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

test.describe('T22.a · acción "Comparar" (diff lado a lado)', () => {
  test.beforeEach(async ({}, info) => { test.skip(info.project.name !== 'desktop-chrome', 'servidor: una sola vez') })

  test('"Comparar" solo en la fila del borrador, nunca en la publicada', async ({ page }) => {
    await setup(page)
    await openConsentAsIdentity(page)
    const rows = page.locator('#consentDocsRows tr')
    await expect(rows.nth(0).getByRole('button', { name: 'Comparar' })).toBeVisible()
    await expect(rows.nth(1).getByRole('button', { name: 'Comparar' })).toHaveCount(0)
  })

  test('rol solo auditor: sin botón "Comparar" en ninguna fila', async ({ page }) => {
    await setup(page, { roles: ['privacy_auditor'] })
    await openConsentAsIdentity(page)
    await expect(page.locator('#consentDocsRows').getByRole('button', { name: 'Comparar' })).toHaveCount(0)
  })

  test('abrir "Comparar" pide el diff con la sesión aal2 y muestra los campos cambiados', async ({ page }) => {
    const seen = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Comparar' }).click()
    await expect(page.locator('#consentDiffView')).toBeVisible()

    const call = seen.find((s) => s.url === `/fn/admin-consent/documents/${DRAFT.id}/diff` && s.method === 'GET')!
    expect(call.session).toBe(AAL2_TOKEN)

    const fields = page.locator('#consentDiffFields .consent-diff-field')
    await expect(fields).toHaveCount(3)
    await expect(fields.nth(0)).toContainText('Título')
    await expect(fields.nth(1)).toContainText('Contenido')
    await expect(fields.nth(2)).toContainText('Requiere reconsentimiento')
  })

  test('el contenido se compara línea a línea: una línea añadida queda resaltada sin tocar las demás', async ({ page }) => {
    await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Comparar' }).click()

    const contentField = page.locator('#consentDiffFields .consent-diff-field', { hasText: 'Contenido' })
    await expect(contentField.locator('td.diff-added', { hasText: 'Linea nueva' })).toBeVisible()
    await expect(contentField.locator('td.diff-removed')).toHaveCount(0) // inserción pura: nada se quitó
    await expect(contentField.locator('tr', { hasText: 'Linea 1' }).locator('td.diff-added, td.diff-removed')).toHaveCount(0)
  })

  test('el título cambiado muestra antes (quitado) y después (añadido)', async ({ page }) => {
    await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Comparar' }).click()

    const titleField = page.locator('#consentDiffFields .consent-diff-field', { hasText: 'Título' })
    await expect(titleField.locator('td.diff-removed')).toHaveText(PUBLISHED.title)
    await expect(titleField.locator('td.diff-added')).toHaveText(DRAFT.title)
  })

  test('sin diferencias con la vigente: mensaje explícito, sin campos', async ({ page }) => {
    await setup(page, { diffBody: DIFF_NO_CHANGES })
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Comparar' }).click()
    await expect(page.locator('#consentDiffFields')).toContainText('Sin diferencias')
    await expect(page.locator('#consentDiffFields .consent-diff-field')).toHaveCount(0)
  })

  test('sin ninguna versión publicada vigente: mensaje explícito, sin reclamar "sin diferencias"', async ({ page }) => {
    await setup(page, { diffBody: DIFF_NO_BASE })
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Comparar' }).click()
    await expect(page.locator('#consentDiffFields')).toContainText('No hay ninguna versión publicada')
  })

  test('error al pedir el diff: mensaje legible', async ({ page }) => {
    await setup(page, { diffStatus: 403, diffBody: { error: 'forbidden' } })
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Comparar' }).click()
    await expect(page.locator('#consentDiffMessage')).not.toBeEmpty()
  })

  test('cerrar el panel de comparación lo oculta y limpia el contenido', async ({ page }) => {
    await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Comparar' }).click()
    await expect(page.locator('#consentDiffView')).toBeVisible()
    await page.locator('#consentDiffClose').click()
    await expect(page.locator('#consentDiffView')).toBeHidden()
    await expect(page.locator('#consentDiffFields')).toBeEmpty()
  })
})
