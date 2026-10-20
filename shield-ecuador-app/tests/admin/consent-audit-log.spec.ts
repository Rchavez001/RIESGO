import { test, expect, Page } from '@playwright/test'

// T24.a (REQ-16): bitácora administrativa (GET /audit-log, GET /audit-log/export.csv, admin-consent/
// handler.ts, T16.a/T16.b) — los tres roles del módulo la ven (PRIVACY_ROLES), a diferencia de las
// secciones ADMIN_ONLY (correo saliente, T23b). Mismo patrón de mocking que consent-diff.spec.ts: el foco
// es el panel de bitácora, no la autenticación.
const USER = { id: '0d9b7c1e-2f3a-4b5c-8d6e-7f8091a2b3c4', email: 'admin.uno@example.test' }
const FID = '11111111-2222-4333-8444-555555555555'
const AAL2_TOKEN = 'eyJhbGciOiJFUzI1NiJ9.dG90cC1hYWwy.c2lnMg'

const ROW_PUBLISH = {
  id: 2,
  actor_id: USER.id,
  actor_email_hmac: 'hmac-1',
  actor_role: 'privacy_admin',
  action: 'consent_document.publish',
  entity: 'consent_documents',
  entity_id: 'doc-1',
  before: { status: 'draft' },
  after: { status: 'published', title: 'Aviso de consentimiento (revisado)' },
  diff: null,
  reason: 'Publicación trimestral',
  created_at: '2026-10-15T10:00:00.000Z',
}
const ROW_REVEAL = {
  id: 1,
  actor_id: USER.id,
  actor_email_hmac: 'hmac-1',
  actor_role: 'privacy_editor',
  action: 'evidence.reveal_ip',
  entity: 'consent_records',
  entity_id: 'user-9',
  before: null,
  after: { row_count: 3 },
  diff: null,
  reason: 'Solicitud ARCO',
  created_at: '2026-10-14T09:00:00.000Z',
}
const ROWS_PAGE1 = [ROW_PUBLISH, ROW_REVEAL]

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
  listStatus?: number
  listBody?: unknown
  page2Items?: unknown[]
  total?: number
  exportStatus?: number
  exportBody?: unknown
  exportCsv?: string
}
type Seen = { url: string; method: string; session: string | undefined; body: string | null }

async function setup(page: Page, o: Opts = {}) {
  const seen: Seen[] = []
  const roles = o.roles ?? ['privacy_admin']
  const total = o.total ?? ROWS_PAGE1.length
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
    if (req.method() === 'GET' && url.pathname.endsWith('/audit-log')) {
      if (o.listStatus && o.listStatus !== 200) return json(o.listStatus, o.listBody ?? { error: 'forbidden' })
      const offset = Number(url.searchParams.get('offset') || '0')
      if (offset > 0 && o.page2Items) return json(200, { items: o.page2Items, total })
      return json(200, o.listBody ?? { items: ROWS_PAGE1, total })
    }
    if (req.method() === 'GET' && url.pathname.endsWith('/audit-log/export.csv')) {
      if (o.exportStatus && o.exportStatus !== 200) return json(o.exportStatus, o.exportBody ?? { error: 'reason_required' })
      return route.fulfill({
        status: 200,
        contentType: 'text/csv; charset=utf-8',
        headers: { 'Content-Disposition': 'attachment; filename="audit-log-export.csv"' },
        body: o.exportCsv ?? 'id,action\r\n2,consent_document.publish\r\n',
      })
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

test.describe('T24.a · Bitácora administrativa', () => {
  test.beforeEach(async ({}, info) => { test.skip(info.project.name !== 'desktop-chrome', 'servidor: una sola vez') })

  for (const role of ['privacy_admin', 'privacy_editor', 'privacy_auditor']) {
    test(`rol ${role}: ve la sección y la carga al entrar`, async ({ page }) => {
      const { seen } = await setup(page, { roles: [role] })
      await openConsentAsIdentity(page)
      await expect(page.locator('#consentAuditLog')).toBeVisible()
      expect(seen.some((s) => s.url.startsWith('/fn/admin-consent/audit-log?') && s.method === 'GET')).toBe(true)
      await expect(page.locator('#consentAuditRows tr')).toHaveCount(2)
    })
  }

  test('muestra fecha, actor, rol, acción, entidad y motivo de cada fila (más reciente primero según el backend)', async ({ page }) => {
    await setup(page)
    await openConsentAsIdentity(page)
    const rows = page.locator('#consentAuditRows tr')
    await expect(rows.nth(0)).toContainText('consent_document.publish')
    await expect(rows.nth(0)).toContainText('Publicación trimestral')
    await expect(rows.nth(1)).toContainText('evidence.reveal_ip')
    await expect(rows.nth(1)).toContainText('Solicitud ARCO')
  })

  test('sin entradas: mensaje explícito en la tabla', async ({ page }) => {
    await setup(page, { listBody: { items: [], total: 0 } })
    await openConsentAsIdentity(page)
    await expect(page.locator('#consentAuditRows')).toContainText('Sin entradas para los filtros seleccionados.')
  })

  test('error del backend al listar: mensaje legible, tabla vacía', async ({ page }) => {
    await setup(page, { listStatus: 403, listBody: { error: 'forbidden' } })
    await openConsentAsIdentity(page)
    await expect(page.locator('#consentAuditMessage')).not.toBeEmpty()
    await expect(page.locator('#consentAuditRows tr')).toHaveCount(0)
  })

  test('filtrar: manda from/to/actor_id/action en el query con la sesión aal2', async ({ page }) => {
    const { seen } = await setup(page)
    await openConsentAsIdentity(page)
    seen.length = 0
    await page.locator('#consentAuditFrom').fill('2026-10-01')
    await page.locator('#consentAuditTo').fill('2026-10-19')
    await page.locator('#consentAuditActorId').fill(USER.id)
    await page.locator('#consentAuditAction').fill('consent_document.publish')
    await page.locator('#consentAuditFilterForm').getByRole('button', { name: 'Filtrar' }).click()

    const call = seen.find((s) => s.url.startsWith('/fn/admin-consent/audit-log?') && s.method === 'GET')!
    expect(call.session).toBe(AAL2_TOKEN)
    expect(call.url).toContain('from=2026-10-01')
    expect(call.url).toContain('to=2026-10-19')
    expect(call.url).toContain(`actor_id=${USER.id}`)
    expect(call.url).toContain('action=consent_document.publish')
  })

  test('limpiar filtros: vacía los campos y vuelve a pedir sin filtros', async ({ page }) => {
    const { seen } = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentAuditActorId').fill(USER.id)
    await page.locator('#consentAuditFilterForm').getByRole('button', { name: 'Filtrar' }).click()
    seen.length = 0
    await page.locator('#consentAuditClear').click()
    await expect(page.locator('#consentAuditActorId')).toHaveValue('')
    const call = seen.find((s) => s.url.startsWith('/fn/admin-consent/audit-log?') && s.method === 'GET')!
    expect(call.url).not.toContain('actor_id=')
  })

  test('paginación: "Siguiente" pide offset=50 y "Anterior" queda deshabilitado en la primera página', async ({ page }) => {
    const PAGE2 = [{ ...ROW_PUBLISH, id: 3, action: 'documents.create' }]
    const { seen } = await setup(page, { total: 51, page2Items: PAGE2 })
    await openConsentAsIdentity(page)
    await expect(page.locator('#consentAuditPrev')).toBeDisabled()
    await expect(page.locator('#consentAuditPageInfo')).toContainText('Mostrando 1-2 de 51')

    await page.locator('#consentAuditNext').click()
    const call = seen.find((s) => s.url.includes('offset=50'))!
    expect(call).toBeTruthy()
    await expect(page.locator('#consentAuditRows tr')).toHaveCount(1)
    await expect(page.locator('#consentAuditRows tr').nth(0)).toContainText('documents.create')
    await expect(page.locator('#consentAuditPrev')).toBeEnabled()
    await expect(page.locator('#consentAuditNext')).toBeDisabled()
  })

  test('"Ver detalle" muestra metadatos y el diff genérico de before/after', async ({ page }) => {
    await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentAuditRows tr').nth(0).getByRole('button', { name: 'Ver detalle' }).click()
    await expect(page.locator('#consentAuditDetailView')).toBeVisible()
    await expect(page.locator('#consentAuditDetailMeta')).toContainText('consent_document.publish')
    await expect(page.locator('#consentAuditDetailMeta')).toContainText('Publicación trimestral')

    const statusField = page.locator('#consentAuditDetailFields .consent-diff-field', { hasText: 'status' })
    await expect(statusField.locator('td.diff-removed')).toHaveText('draft')
    await expect(statusField.locator('td.diff-added')).toHaveText('published')
    const titleField = page.locator('#consentAuditDetailFields .consent-diff-field', { hasText: 'title' })
    await expect(titleField.locator('td.diff-added')).toHaveText('Aviso de consentimiento (revisado)')
  })

  test('"Ver detalle" con before null: muestra solo el lado "después"', async ({ page }) => {
    await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentAuditRows tr').nth(1).getByRole('button', { name: 'Ver detalle' }).click()
    const field = page.locator('#consentAuditDetailFields .consent-diff-field', { hasText: 'row_count' })
    await expect(field.locator('td.diff-added')).toHaveText('3')
    await expect(field.locator('td.diff-removed')).toHaveCount(0)
  })

  test('cerrar el detalle lo oculta y limpia el contenido', async ({ page }) => {
    await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentAuditRows tr').nth(0).getByRole('button', { name: 'Ver detalle' }).click()
    await expect(page.locator('#consentAuditDetailView')).toBeVisible()
    await page.locator('#consentAuditDetailClose').click()
    await expect(page.locator('#consentAuditDetailView')).toBeHidden()
    await expect(page.locator('#consentAuditDetailFields')).toBeEmpty()
  })

  test('exportar sin motivo: no llama al backend', async ({ page }) => {
    const { seen } = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentAuditExportForm').getByRole('button', { name: 'Exportar CSV' }).click()
    await expect(page.locator('#consentAuditExportMessage')).toContainText('motivo es obligatorio')
    expect(seen.some((s) => s.url.includes('/audit-log/export.csv'))).toBe(false)
  })

  test('exportar con motivo: descarga el CSV con el motivo (con espacios) y los filtros en el query', async ({ page }) => {
    const { seen } = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentAuditActorId').fill(USER.id)
    await page.locator('#consentAuditFilterForm').getByRole('button', { name: 'Filtrar' }).click()
    await page.locator('#consentAuditExportReason').fill('auditoría trimestral')

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('#consentAuditExportForm').getByRole('button', { name: 'Exportar CSV' }).click(),
    ])
    expect(download.suggestedFilename()).toBe('bitacora-consentimiento.csv')
    await expect(page.locator('#consentAuditExportMessage')).toContainText('descargada')

    const call = seen.find((s) => s.url.includes('/audit-log/export.csv'))!
    expect(call.session).toBe(AAL2_TOKEN)
    expect(call.url).toContain(`reason=${encodeURIComponent('auditoría trimestral')}`)
    expect(call.url).toContain(`actor_id=${USER.id}`)
    expect(call.url).not.toContain('limit=')
    expect(call.url).not.toContain('offset=')
    await expect(page.locator('#consentAuditExportReason')).toHaveValue('')
  })

  test('error del backend al exportar (reason_required): mensaje legible, el campo no se vacía', async ({ page }) => {
    await setup(page, { exportStatus: 400, exportBody: { error: 'reason_required' } })
    await openConsentAsIdentity(page)
    await page.locator('#consentAuditExportReason').fill('motivo')
    await page.locator('#consentAuditExportForm').getByRole('button', { name: 'Exportar CSV' }).click()
    await expect(page.locator('#consentAuditExportMessage')).toContainText('obligatorio')
    await expect(page.locator('#consentAuditExportReason')).toHaveValue('motivo')
  })

  test('cerrar sesión limpia filtros, tabla, detalle y el formulario de exportación', async ({ page }) => {
    await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentAuditActorId').fill(USER.id)
    await page.locator('#consentAuditRows tr').nth(0).getByRole('button', { name: 'Ver detalle' }).click()
    await page.locator('#consentAuditExportReason').fill('motivo')
    await page.locator('#privacyLogout').click()
    await expect(page.locator('#consentAuditLog')).toBeHidden()
    await expect(page.locator('#consentAuditActorId')).toHaveValue('')
    await expect(page.locator('#consentAuditRows')).toBeEmpty()
    await expect(page.locator('#consentAuditDetailView')).toBeHidden()
    await expect(page.locator('#consentAuditExportReason')).toHaveValue('')
  })
})
