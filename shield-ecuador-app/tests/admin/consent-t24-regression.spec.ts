import { test, expect, Page } from '@playwright/test'

// T24.e (REQ-18): "tests E2E de regresión cruzada" que cierra T24 — a diferencia del resto de specs de
// T24 (cada uno aislado por sección), estos recorren varias secciones EN LA MISMA sesión para confirmar
// que el candado de cada rol se sostiene en conjunto, no solo por archivo: (1) editor no ve "Publicar"
// (Documentos) ni "Revelar IP" (Evidencia) en la misma sesión; (2) auditor no ve "Publicar" (Documentos),
// "Revelar IP" (Evidencia) ni "Cambiar estado" (Solicitudes) en la misma sesión, pero sí puede usar
// "Verificar integridad" (T24.e, solo lectura); (3) como privacy_admin, cada acción realizada en una
// sección distinta (revelar IP, cambiar estado de una solicitud, publicar un borrador) queda reflejada
// al recargar la Bitácora — sin necesitar tres sesiones ni tres archivos separados para comprobarlo.
const USER = { id: '0d9b7c1e-2f3a-4b5c-8d6e-7f8091a2b3c4', email: 'admin.uno@example.test' }
const FID = '11111111-2222-4333-8444-555555555555'
const AAL2_TOKEN = 'eyJhbGciOiJFUzI1NiJ9.dG90cC1hYWwy.c2lnMg'
const TITULAR_ID = 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee'

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

const EVIDENCE_MASKED = [{
  document_version: '1.1', purpose_code: 'registro_aprendizaje', decision: 'granted', channel: 'registro',
  server_ts: '2026-10-15T10:00:00.000Z', rendered_sha256: 'sha-1', ip_masked: '203.0.113.xxx',
}]
const EVIDENCE_REVEALED = [{ ...EVIDENCE_MASKED[0], ip: '203.0.113.77', ip_masked: undefined }]

const CASE_VIGENTE = {
  id: 'cccccccc-1111-4111-8111-111111111111', case_number: 'DSR-2026-0001', user_id: TITULAR_ID,
  request_type: 'acceso', channel: 'formulario', status: 'recibida',
  received_at: '2026-10-18T10:00:00.000Z', due_at: '2026-11-10T10:00:00.000Z', resolved_at: null, semaphore: 'vigente',
}

type Opts = { roles?: string[] }
type Seen = { url: string; method: string; session: string | undefined; body: string | null }

// Las tres acciones de la prueba 3 añaden su propia fila a este array ANTES de responder con éxito
// (simulando la bitácora real: cada acción deja su entrada de inmediato, no al final de la sesión), para
// que recargar `/audit-log` después muestre las tres sin necesitar un backend real.
function makeAuditLedger() {
  const rows: Record<string, unknown>[] = []
  let nextId = 1
  return {
    rows,
    push(action: string, entity: string, entityId: string) {
      rows.unshift({
        id: nextId++, actor_id: USER.id, actor_email_hmac: 'hmac-1', actor_role: 'privacy_admin',
        action, entity, entity_id: entityId, before: null, after: null, diff: null,
        reason: 'motivo de prueba', created_at: new Date().toISOString(),
      })
    },
  }
}

async function setup(page: Page, o: Opts = {}) {
  const seen: Seen[] = []
  const roles = o.roles ?? ['privacy_admin']
  const ledger = makeAuditLedger()
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
    if (path === '/fn/admin-consent/documents' && req.method() === 'GET') return json(200, [DRAFT, PUBLISHED])
    if (path === `/fn/admin-consent/documents/${DRAFT.id}/publish` && req.method() === 'POST') {
      ledger.push('consent_document.publish', 'consent_documents', DRAFT.id)
      return json(200, { ...DRAFT, status: 'published', published_by: USER.id, published_at: '2026-10-20T12:00:00Z' })
    }
    if (url.pathname.endsWith('/evidence') && req.method() === 'GET') return json(200, { user_id: TITULAR_ID, items: EVIDENCE_MASKED })
    if (url.pathname.endsWith('/evidence/reveal-ip') && req.method() === 'POST') {
      ledger.push('evidence.reveal_ip', 'consent_records', TITULAR_ID)
      return json(200, { user_id: TITULAR_ID, items: EVIDENCE_REVEALED })
    }
    if (req.method() === 'GET' && url.pathname.endsWith('/requests')) return json(200, { items: [CASE_VIGENTE], total: 1 })
    if (req.method() === 'POST' && /\/requests\/[^/]+\/status$/.test(url.pathname)) {
      ledger.push('data_subject_request.update_status', 'data_subject_requests', CASE_VIGENTE.id)
      const body = req.postDataJSON()
      return json(200, { ...CASE_VIGENTE, status: body.new_status })
    }
    if (req.method() === 'GET' && url.pathname.endsWith('/audit-log')) return json(200, { items: ledger.rows, total: ledger.rows.length })
    if (req.method() === 'GET' && url.pathname.endsWith('/verify-chains')) {
      return json(200, { consent: { broken: false, first_broken_id: null, detail: null }, audit: { broken: false, first_broken_id: null, detail: null } })
    }
    return json(404, { error: 'not_found' })
  })
  return { seen, ledger }
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

test.describe('T24.e · regresión cruzada (cierre de T24)', () => {
  test.beforeEach(async ({}, info) => { test.skip(info.project.name !== 'desktop-chrome', 'servidor: una sola vez') })

  test('editor: sin "Publicar" (Documentos) ni "Revelar IP" (Evidencia) en la misma sesión', async ({ page }) => {
    await setup(page, { roles: ['privacy_editor'] })
    await openConsentAsIdentity(page)

    await expect(page.locator('#consentDocsRows').getByRole('button', { name: 'Publicar' })).toHaveCount(0)
    await expect(page.locator('#consentDocsRows').getByRole('button', { name: 'Editar' })).toHaveCount(1)

    await page.locator('#consentEvidenceEmail').fill('titular@example.test')
    await page.locator('#consentEvidenceSearchForm').getByRole('button', { name: 'Buscar' }).click()
    await expect(page.locator('#consentEvidenceRows tr')).toHaveCount(1)
    await expect(page.locator('#consentEvidenceRevealForm')).toBeHidden()
  })

  test('auditor: sin "Publicar", sin "Revelar IP", sin "Cambiar estado" — pero sí "Verificar integridad"', async ({ page }) => {
    await setup(page, { roles: ['privacy_auditor'] })
    await openConsentAsIdentity(page)

    await expect(page.locator('#consentDocsRows').getByRole('button', { name: 'Publicar' })).toHaveCount(0)

    await page.locator('#consentEvidenceEmail').fill('titular@example.test')
    await page.locator('#consentEvidenceSearchForm').getByRole('button', { name: 'Buscar' }).click()
    await expect(page.locator('#consentEvidenceRevealForm')).toBeHidden()

    await expect(page.locator('#consentRequestsRows').getByRole('button', { name: 'Cambiar estado' })).toHaveCount(0)

    await page.locator('#consentVerifyChainsButton').click()
    await expect(page.locator('#consentVerifyChainsResult')).toContainText('cadena íntegra')
  })

  test('privacy_admin: revelar IP, cambiar estado de una solicitud y publicar un borrador quedan en la Bitácora al recargarla', async ({ page }) => {
    await setup(page)
    await openConsentAsIdentity(page)

    // Al entrar, la Bitácora carga vacía (ninguna acción se ha hecho todavía esta sesión).
    await expect(page.locator('#consentAuditRows')).toContainText('Sin entradas para los filtros seleccionados.')

    // Acción 1 (sección Evidencia): revelar IP.
    await page.locator('#consentEvidenceEmail').fill('titular@example.test')
    await page.locator('#consentEvidenceSearchForm').getByRole('button', { name: 'Buscar' }).click()
    await page.locator('#consentEvidenceRevealReason').fill('Solicitud ARCO')
    await page.locator('#consentEvidenceRevealForm').getByRole('button', { name: 'Revelar IP' }).click()
    await expect(page.locator('#consentEvidenceRevealMessage')).toContainText('IP revelada.')

    // Acción 2 (sección Solicitudes): cambiar estado.
    await page.locator('#consentRequestsRows').getByRole('button', { name: 'Cambiar estado' }).click()
    await page.locator('#consentRequestsNewStatus').selectOption('en_proceso')
    await page.locator('#consentRequestsStatusForm').getByRole('button', { name: 'Guardar estado' }).click()
    await expect(page.locator('#consentRequestsStatusView')).toBeHidden()

    // Acción 3 (sección Documentos): publicar el borrador.
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Publicar' }).click()
    await page.locator('#consentPublishReason').fill('Publicación de regresión cruzada')
    await page.locator('#consentPublishConfirmVersion').fill(DRAFT.version)
    await page.locator('#consentPublishForm').getByRole('button', { name: 'Publicar' }).click()
    await expect(page.locator('#consentPublishView')).toBeHidden()

    // Recargar la Bitácora (sin filtros): las tres acciones, hechas en tres secciones distintas de la
    // misma sesión, aparecen — sin reiniciar sesión ni abrir otro archivo de prueba para comprobarlo.
    await page.locator('#consentAuditFilterForm').getByRole('button', { name: 'Filtrar' }).click()
    const rows = page.locator('#consentAuditRows tr')
    await expect(rows).toHaveCount(3)
    await expect(page.locator('#consentAuditRows')).toContainText('evidence.reveal_ip')
    await expect(page.locator('#consentAuditRows')).toContainText('data_subject_request.update_status')
    await expect(page.locator('#consentAuditRows')).toContainText('consent_document.publish')
  })
})
