import { test, expect, Page } from '@playwright/test'

// T21.b (REQ-13 a, b): pestaña "Versiones" del módulo de consentimiento — lista las versiones de
// GET /documents (T21.a) y permite crear un borrador desde la vigente con POST /documents (T14).
// Mismo patrón de mocking que privacy-login.spec.ts (page.route sobre /api/privacy/**, sin pasar por un
// Supabase real): aquí el foco es la pantalla, no la autenticación en sí (ya cubierta en ese archivo).
const USER = { id: '0d9b7c1e-2f3a-4b5c-8d6e-7f8091a2b3c4', email: 'admin.uno@example.test' }
const FID = '11111111-2222-4333-8444-555555555555'
const AAL2_TOKEN = 'eyJhbGciOiJFUzI1NiJ9.dG90cC1hYWwy.c2lnMg'

const DOCS = [
  {
    id: 'd-2', version: '1.1', title: 'Aviso de consentimiento', content_md: '# x', content_sha256: 'a',
    purposes: [], status: 'draft', requires_reconsent: false, change_summary: 'ajustes menores',
    based_on_id: 'd-1', created_by: USER.id, created_at: '2026-10-10T12:00:00Z', updated_by: null, updated_at: null,
    published_by: null, published_at: null, retired_by: null, retired_at: null, acceptance_count: 0,
  },
  {
    id: 'd-1', version: '1.0', title: 'Aviso de consentimiento', content_md: '# y', content_sha256: 'b',
    purposes: [], status: 'published', requires_reconsent: true, change_summary: null,
    based_on_id: null, created_by: USER.id, created_at: '2026-09-01T09:00:00Z', updated_by: null, updated_at: null,
    published_by: USER.id, published_at: '2026-09-02T09:00:00Z', retired_by: null, retired_at: null, acceptance_count: 42,
  },
]

type Opts = { roles?: string[]; documentsStatus?: number; documentsBody?: unknown; createStatus?: number; createBody?: unknown }
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
    if (path === '/fn/admin-consent/documents' && req.method() === 'GET') {
      return json(o.documentsStatus ?? 200, o.documentsBody ?? DOCS)
    }
    if (path === '/fn/admin-consent/documents' && req.method() === 'POST') {
      return json(o.createStatus ?? 201, o.createBody ?? { ...DOCS[0], id: 'd-3', version: JSON.parse(req.postData() || '{}').version })
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

test.describe('T21.b · pestaña Versiones del módulo de consentimiento', () => {
  test.beforeEach(async ({}, info) => { test.skip(info.project.name !== 'desktop-chrome', 'servidor: una sola vez') })

  test('lista las versiones de GET /documents, más reciente primero, con aceptaciones', async ({ page }) => {
    const seen = await setup(page)
    await openConsentAsIdentity(page)
    const table = page.locator('#consentDocuments')
    await expect(table).toBeVisible()
    const rows = table.locator('tbody tr')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0)).toContainText('1.1')
    await expect(rows.nth(0)).toContainText('Borrador')
    await expect(rows.nth(1)).toContainText('1.0')
    await expect(rows.nth(1)).toContainText('Publicada')
    await expect(rows.nth(1)).toContainText('42')
    const call = seen.find((s) => s.url === '/fn/admin-consent/documents' && s.method === 'GET')!
    expect(call.session).toBe(AAL2_TOKEN)
  })

  test('sin ninguna versión: mensaje claro en vez de una tabla vacía confusa', async ({ page }) => {
    await setup(page, { documentsBody: [] })
    await openConsentAsIdentity(page)
    await expect(page.locator('#consentDocuments')).toContainText('Sin versiones todavía.')
  })

  test('rol editor/admin ve el formulario de crear borrador; rol solo auditor no', async ({ page }) => {
    await setup(page, { roles: ['privacy_editor'] })
    await openConsentAsIdentity(page)
    await expect(page.locator('#consentDraftForm')).toBeVisible()
  })

  test('rol solo auditor: lista visible, sin el botón de crear borrador', async ({ page }) => {
    await setup(page, { roles: ['privacy_auditor'] })
    await openConsentAsIdentity(page)
    await expect(page.locator('#consentDocuments')).toBeVisible()
    await expect(page.locator('#consentDraftForm')).toBeHidden()
  })

  test('crear borrador desde vigente: envía version y resumen, y recarga la lista', async ({ page }) => {
    const seen = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentDraftVersion').fill('1.2')
    await page.locator('#consentDraftSummary').fill('aclara el plazo de conservación')
    await page.locator('#consent').getByRole('button', { name: 'Crear borrador desde vigente' }).click()
    await expect(page.locator('#consentDraftVersion')).toHaveValue('')
    const create = seen.find((s) => s.url === '/fn/admin-consent/documents' && s.method === 'POST')!
    expect(create.session).toBe(AAL2_TOKEN)
    expect(JSON.parse(create.body!)).toEqual({ version: '1.2', change_summary: 'aclara el plazo de conservación' })
    // tras crear, se vuelve a pedir la lista (segunda llamada GET)
    expect(seen.filter((s) => s.url === '/fn/admin-consent/documents' && s.method === 'GET').length).toBeGreaterThan(1)
  })

  test('crear borrador sin escribir versión: no llama al backend', async ({ page }) => {
    const seen = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consent').getByRole('button', { name: 'Crear borrador desde vigente' }).click()
    await expect(page.locator('#consentDocsMessage')).toContainText('Escribe la versión nueva.')
    expect(seen.some((s) => s.url === '/fn/admin-consent/documents' && s.method === 'POST')).toBe(false)
  })

  test('el backend rechaza el borrador (sin rol editor): mensaje legible, sin romper la pantalla', async ({ page }) => {
    await setup(page, { createStatus: 403, createBody: { error: 'forbidden' } })
    await openConsentAsIdentity(page)
    await page.locator('#consentDraftVersion').fill('1.2')
    await page.locator('#consent').getByRole('button', { name: 'Crear borrador desde vigente' }).click()
    await expect(page.locator('#consentDocsMessage')).toContainText('no tiene un rol del módulo')
  })

  test('error al listar: mensaje legible y tabla vacía, no datos a medias', async ({ page }) => {
    await setup(page, { documentsStatus: 403, documentsBody: { error: 'forbidden' } })
    await openConsentAsIdentity(page)
    await expect(page.locator('#consentDocsMessage')).toContainText('no tiene un rol del módulo')
    await expect(page.locator('#consentDocuments tbody tr')).toHaveCount(0)
  })

  test('cerrar sesión del módulo: la pestaña Versiones desaparece y no deja datos visibles', async ({ page }) => {
    await setup(page)
    await openConsentAsIdentity(page)
    await expect(page.locator('#consentDocuments')).toBeVisible()
    await page.locator('#consent').getByRole('button', { name: 'Cerrar sesión del módulo' }).click()
    await expect(page.locator('#consentDocuments')).toBeHidden()
    await expect(page.locator('#consentDocsRows')).toBeEmpty()
  })
})
