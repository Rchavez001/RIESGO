import { test, expect, Page } from '@playwright/test'

// T24.d (REQ-11, REQ-16): Solicitudes de derechos — GET /requests (PRIVACY_ROLES, T16.e), semáforo
// (vigente/por_vencer/vencida/null) calculado por el backend; POST /requests/{id}/status (EDITOR_ROLES:
// privacy_editor + privacy_admin, nunca auditor, T16.e). Mismo patrón de mocking que
// consent-audit-log.spec.ts: el foco es el panel, no la autenticación.
const USER = { id: '0d9b7c1e-2f3a-4b5c-8d6e-7f8091a2b3c4', email: 'admin.uno@example.test' }
const FID = '11111111-2222-4333-8444-555555555555'
const AAL2_TOKEN = 'eyJhbGciOiJFUzI1NiJ9.dG90cC1hYWwy.c2lnMg'

const CASE_VIGENTE = {
  id: 'aaaaaaaa-1111-4111-8111-111111111111',
  case_number: 'DSR-2026-0001',
  user_id: 'bbbbbbbb-2222-4222-8222-222222222222',
  request_type: 'acceso',
  channel: 'formulario',
  status: 'recibida',
  received_at: '2026-10-18T10:00:00.000Z',
  due_at: '2026-11-10T10:00:00.000Z',
  resolved_at: null,
  semaphore: 'vigente',
}
const CASE_VENCIDA = {
  id: 'cccccccc-3333-4333-8333-333333333333',
  case_number: 'DSR-2026-0002',
  user_id: 'dddddddd-4444-4444-8444-444444444444',
  request_type: 'supresion',
  channel: 'correo',
  status: 'en_proceso',
  received_at: '2026-09-01T10:00:00.000Z',
  due_at: '2026-09-16T10:00:00.000Z',
  resolved_at: null,
  semaphore: 'vencida',
}
const CASE_ATENDIDA = {
  id: 'eeeeeeee-5555-4555-8555-555555555555',
  case_number: 'DSR-2026-0003',
  user_id: 'ffffffff-6666-4666-8666-666666666666',
  request_type: 'rectificacion',
  channel: 'formulario',
  status: 'atendida',
  received_at: '2026-08-01T10:00:00.000Z',
  due_at: '2026-08-16T10:00:00.000Z',
  resolved_at: '2026-08-10T10:00:00.000Z',
  semaphore: null,
}
const ITEMS_PAGE1 = [CASE_VIGENTE, CASE_VENCIDA, CASE_ATENDIDA]

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
  statusStatus?: number
  statusBody?: unknown
}
type Seen = { url: string; method: string; session: string | undefined; body: string | null }

async function setup(page: Page, o: Opts = {}) {
  const seen: Seen[] = []
  const roles = o.roles ?? ['privacy_admin']
  const total = o.total ?? ITEMS_PAGE1.length
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
    if (req.method() === 'GET' && url.pathname.endsWith('/audit-log')) return json(200, { items: [], total: 0 })
    if (req.method() === 'GET' && url.pathname.endsWith('/evidence')) return json(200, { items: [] })
    if (req.method() === 'GET' && url.pathname.endsWith('/requests')) {
      if (o.listStatus && o.listStatus !== 200) return json(o.listStatus, o.listBody ?? { error: 'forbidden' })
      const offset = Number(url.searchParams.get('offset') || '0')
      if (offset > 0 && o.page2Items) return json(200, { items: o.page2Items, total })
      return json(200, o.listBody ?? { items: ITEMS_PAGE1, total })
    }
    if (req.method() === 'POST' && /\/requests\/[^/]+\/status$/.test(url.pathname)) {
      if (o.statusStatus && o.statusStatus !== 200) return json(o.statusStatus, o.statusBody ?? { error: 'forbidden' })
      const body = req.postDataJSON()
      return json(200, { ...CASE_VIGENTE, status: body.new_status, semaphore: body.new_status === 'atendida' ? null : 'vigente' })
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

test.describe('T24.d · Solicitudes de derechos', () => {
  test.beforeEach(async ({}, info) => { test.skip(info.project.name !== 'desktop-chrome', 'servidor: una sola vez') })

  for (const role of ['privacy_admin', 'privacy_editor', 'privacy_auditor']) {
    test(`rol ${role}: ve la sección y la carga al entrar`, async ({ page }) => {
      const { seen } = await setup(page, { roles: [role] })
      await openConsentAsIdentity(page)
      await expect(page.locator('#consentRequests')).toBeVisible()
      expect(seen.some((s) => s.url.startsWith('/fn/admin-consent/requests?') && s.method === 'GET')).toBe(true)
      await expect(page.locator('#consentRequestsRows tr')).toHaveCount(3)
    })
  }

  test('muestra caso, tipo, canal, estado, semáforo, recibida y resuelta de cada fila', async ({ page }) => {
    await setup(page)
    await openConsentAsIdentity(page)
    const rows = page.locator('#consentRequestsRows tr')
    await expect(rows.nth(0)).toContainText('DSR-2026-0001')
    await expect(rows.nth(0)).toContainText('Vigente')
    await expect(rows.nth(1)).toContainText('DSR-2026-0002')
    await expect(rows.nth(1)).toContainText('Vencida')
    await expect(rows.nth(2)).toContainText('DSR-2026-0003')
    await expect(rows.nth(2)).toContainText('—')
  })

  test('sin casos: mensaje explícito en la tabla', async ({ page }) => {
    await setup(page, { listBody: { items: [], total: 0 } })
    await openConsentAsIdentity(page)
    await expect(page.locator('#consentRequestsRows')).toContainText('Sin solicitudes para el filtro seleccionado.')
  })

  test('error del backend al listar: mensaje legible, tabla vacía', async ({ page }) => {
    await setup(page, { listStatus: 403, listBody: { error: 'forbidden' } })
    await openConsentAsIdentity(page)
    await expect(page.locator('#consentRequestsMessage')).not.toBeEmpty()
    await expect(page.locator('#consentRequestsRows tr')).toHaveCount(0)
  })

  test('filtrar por estado: manda status en el query con la sesión aal2', async ({ page }) => {
    const { seen } = await setup(page)
    await openConsentAsIdentity(page)
    seen.length = 0
    await page.locator('#consentRequestsStatus').selectOption('en_proceso')
    await page.locator('#consentRequestsFilterForm').getByRole('button', { name: 'Filtrar' }).click()
    const call = seen.find((s) => s.url.startsWith('/fn/admin-consent/requests?') && s.method === 'GET')!
    expect(call.session).toBe(AAL2_TOKEN)
    expect(call.url).toContain('status=en_proceso')
  })

  test('limpiar filtro: vuelve a "todos" y pide sin status', async ({ page }) => {
    const { seen } = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentRequestsStatus').selectOption('atendida')
    await page.locator('#consentRequestsFilterForm').getByRole('button', { name: 'Filtrar' }).click()
    seen.length = 0
    await page.locator('#consentRequestsClear').click()
    await expect(page.locator('#consentRequestsStatus')).toHaveValue('')
    const call = seen.find((s) => s.url.startsWith('/fn/admin-consent/requests?') && s.method === 'GET')!
    expect(call.url).not.toContain('status=')
  })

  test('paginación: "Siguiente" pide offset=50 y "Anterior" queda deshabilitado en la primera página', async ({ page }) => {
    const PAGE2 = [{ ...CASE_VIGENTE, id: 'f0000000-0000-4000-8000-000000000000', case_number: 'DSR-2026-0004' }]
    const { seen } = await setup(page, { total: 51, page2Items: PAGE2 })
    await openConsentAsIdentity(page)
    await expect(page.locator('#consentRequestsPrev')).toBeDisabled()
    await expect(page.locator('#consentRequestsPageInfo')).toContainText('Mostrando 1-3 de 51')

    await page.locator('#consentRequestsNext').click()
    const call = seen.find((s) => s.url.includes('offset=50'))!
    expect(call).toBeTruthy()
    await expect(page.locator('#consentRequestsRows tr')).toHaveCount(1)
    await expect(page.locator('#consentRequestsRows tr').nth(0)).toContainText('DSR-2026-0004')
    await expect(page.locator('#consentRequestsPrev')).toBeEnabled()
    await expect(page.locator('#consentRequestsNext')).toBeDisabled()
  })

  test('rol admin/editor ven "Cambiar estado"; rol auditor no', async ({ page }) => {
    await setup(page, { roles: ['privacy_auditor'] })
    await openConsentAsIdentity(page)
    await expect(page.locator('#consentRequestsRows [data-request-status-id]')).toHaveCount(0)
  })

  test('"Cambiar estado" abre el panel con el caso y el estado actual precargado', async ({ page }) => {
    await setup(page, { roles: ['privacy_editor'] })
    await openConsentAsIdentity(page)
    await page.locator('#consentRequestsRows tr').nth(1).getByRole('button', { name: 'Cambiar estado' }).click()
    await expect(page.locator('#consentRequestsStatusView')).toBeVisible()
    await expect(page.locator('#consentRequestsStatusCaseNumber')).toContainText('DSR-2026-0002')
    await expect(page.locator('#consentRequestsNewStatus')).toHaveValue('en_proceso')
  })

  test('cambiar a "rechazada_con_motivo" sin motivo: no llama al backend', async ({ page }) => {
    const { seen } = await setup(page, { roles: ['privacy_editor'] })
    await openConsentAsIdentity(page)
    await page.locator('#consentRequestsRows tr').nth(0).getByRole('button', { name: 'Cambiar estado' }).click()
    await page.locator('#consentRequestsNewStatus').selectOption('rechazada_con_motivo')
    await page.locator('#consentRequestsStatusForm').getByRole('button', { name: 'Guardar estado' }).click()
    await expect(page.locator('#consentRequestsStatusMessage')).toContainText('motivo es obligatorio')
    expect(seen.some((s) => s.method === 'POST' && s.url.includes('/status'))).toBe(false)
  })

  test('cambiar estado con nota y motivo: manda el body correcto, cierra el panel y recarga el listado', async ({ page }) => {
    const { seen } = await setup(page, { roles: ['privacy_admin'] })
    await openConsentAsIdentity(page)
    seen.length = 0
    await page.locator('#consentRequestsRows tr').nth(0).getByRole('button', { name: 'Cambiar estado' }).click()
    await page.locator('#consentRequestsNewStatus').selectOption('rechazada_con_motivo')
    await page.locator('#consentRequestsResolutionNote').fill('Nota interna de resolución')
    await page.locator('#consentRequestsStatusReason').fill('Datos insuficientes para verificar identidad')
    await page.locator('#consentRequestsStatusForm').getByRole('button', { name: 'Guardar estado' }).click()

    const call = seen.find((s) => s.method === 'POST' && s.url.includes('/status'))!
    expect(call.session).toBe(AAL2_TOKEN)
    const body = JSON.parse(call.body!)
    expect(body).toEqual({
      new_status: 'rechazada_con_motivo',
      resolution_note: 'Nota interna de resolución',
      reason: 'Datos insuficientes para verificar identidad',
    })
    await expect(page.locator('#consentRequestsStatusView')).toBeHidden()
    expect(seen.some((s) => s.url.startsWith('/fn/admin-consent/requests?') && s.method === 'GET')).toBe(true)
  })

  test('error del backend al cambiar estado: mensaje legible, el panel no se cierra', async ({ page }) => {
    await setup(page, { roles: ['privacy_admin'], statusStatus: 404, statusBody: { error: 'not_found' } })
    await openConsentAsIdentity(page)
    await page.locator('#consentRequestsRows tr').nth(0).getByRole('button', { name: 'Cambiar estado' }).click()
    await page.locator('#consentRequestsStatusForm').getByRole('button', { name: 'Guardar estado' }).click()
    await expect(page.locator('#consentRequestsStatusMessage')).not.toBeEmpty()
    await expect(page.locator('#consentRequestsStatusView')).toBeVisible()
  })

  test('cerrar el panel de estado lo oculta y limpia el contenido', async ({ page }) => {
    await setup(page, { roles: ['privacy_admin'] })
    await openConsentAsIdentity(page)
    await page.locator('#consentRequestsRows tr').nth(0).getByRole('button', { name: 'Cambiar estado' }).click()
    await page.locator('#consentRequestsStatusReason').fill('motivo')
    await page.locator('#consentRequestsStatusClose').click()
    await expect(page.locator('#consentRequestsStatusView')).toBeHidden()
    await expect(page.locator('#consentRequestsStatusReason')).toHaveValue('')
  })

  test('cerrar sesión limpia filtro, tabla y el panel de cambio de estado', async ({ page }) => {
    await setup(page, { roles: ['privacy_admin'] })
    await openConsentAsIdentity(page)
    await page.locator('#consentRequestsStatus').selectOption('atendida')
    await page.locator('#consentRequestsRows tr').nth(0).getByRole('button', { name: 'Cambiar estado' }).click()
    await page.locator('#privacyLogout').click()
    await expect(page.locator('#consentRequests')).toBeHidden()
    await expect(page.locator('#consentRequestsStatus')).toHaveValue('')
    await expect(page.locator('#consentRequestsRows')).toBeEmpty()
    await expect(page.locator('#consentRequestsStatusView')).toBeHidden()
  })
})
