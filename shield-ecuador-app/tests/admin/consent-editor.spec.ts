import { test, expect, Page } from '@playwright/test'

// T21.c.1 (REQ-13 b): editor de título/contenido de un borrador dentro de la pestaña "Versiones"
// (T21.b), con vista previa vía GET /documents/:id/preview (T14, renderConsent). Mismo patrón de mocking
// con page.route que consent-documents.spec.ts: el foco es el editor, no la autenticación (privacy-login.spec.ts).
const USER = { id: '0d9b7c1e-2f3a-4b5c-8d6e-7f8091a2b3c4', email: 'admin.uno@example.test' }
const FID = '11111111-2222-4333-8444-555555555555'
const AAL2_TOKEN = 'eyJhbGciOiJFUzI1NiJ9.dG90cC1hYWwy.c2lnMg'

// T21.c.3: dos finalidades ya existentes en el borrador (código inmutable al abrir el editor); el código
// real de REQ-03 (`registro_aprendizaje`/`novedades`/`publicidad_personalizada`) no importa para este test
// de UI, solo que haya más de una y que sus `code` no cambien tras guardarlas.
const DRAFT_PURPOSES = [
  { code: 'registro_aprendizaje', label: 'Registro y aprendizaje', description: 'Uso para operar el servicio', required: true, order: 1 },
  { code: 'novedades', label: 'Novedades', description: '', required: false, order: 2 },
]

const DRAFT = {
  id: 'd-2', version: '1.1', title: 'Aviso de consentimiento', content_md: '# Aviso\n\nTexto {{responsable_nombre}}.',
  content_sha256: 'a', purposes: DRAFT_PURPOSES, status: 'draft', requires_reconsent: false, change_summary: 'ajustes menores',
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
  extraDocs?: Array<typeof DRAFT>
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
    if (path === '/fn/admin-consent/documents' && req.method() === 'GET') return json(200, [...DOCS, ...(o.extraDocs ?? [])])
    const patchMatch = path.match(/^\/fn\/admin-consent\/documents\/([^/]+)$/)
    if (patchMatch && req.method() === 'PATCH') {
      if (o.patchStatus && o.patchStatus !== 200) return json(o.patchStatus, o.patchBody ?? { error: 'invalid_input' })
      const base = [...DOCS, ...(o.extraDocs ?? [])].find((d) => d.id === patchMatch[1]) ?? DRAFT
      const patch = JSON.parse(req.postData() || '{}')
      return json(200, o.patchBody ?? { ...base, ...patch })
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
    expect(JSON.parse(patch.body!)).toEqual({ title: 'Aviso de consentimiento (revisado)', content_md: '# Aviso\n\nTexto nuevo {{responsable_nombre}}.', purposes: DRAFT_PURPOSES })

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

  test('cerrar el editor sin cambios: no pide confirmación y limpia el panel', async ({ page }) => {
    await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Editar' }).click()
    await expect(page.locator('#consentDraftEditor')).toBeVisible()
    let dialogShown = false
    page.on('dialog', () => { dialogShown = true })
    await page.locator('#consentEditorClose').click()
    await expect(page.locator('#consentDraftEditor')).toBeHidden()
    await expect(page.locator('#consentEditorTitle')).toHaveValue('')
    expect(dialogShown).toBe(false)
  })
})

// T21.c.2: autoguardado con debounce + aviso de "cambios sin guardar". Mismo patrón de mocking que T21.c.1.
test.describe('T21.c.2 · autoguardado del borrador + aviso de cambios sin guardar', () => {
  test.beforeEach(async ({}, info) => { test.skip(info.project.name !== 'desktop-chrome', 'servidor: una sola vez') })

  test('escribir muestra "Cambios sin guardar" y, tras una pausa, autoguarda sin pulsar el botón', async ({ page }) => {
    const seen = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Editar' }).click()
    await page.locator('#consentEditorContent').fill('# Aviso\n\nTexto editado sin pulsar guardar.')
    await expect(page.locator('#consentEditorAutosaveStatus')).toContainText('Cambios sin guardar')

    await expect(page.locator('#consentEditorAutosaveStatus')).toContainText('Guardado automáticamente', { timeout: 5000 })
    const patches = seen.filter((s) => s.url === `/fn/admin-consent/documents/${DRAFT.id}` && s.method === 'PATCH')
    expect(patches).toHaveLength(1)
    expect(JSON.parse(patches[0].body!)).toEqual({ title: DRAFT.title, content_md: '# Aviso\n\nTexto editado sin pulsar guardar.', purposes: DRAFT_PURPOSES })
    await expect(page.locator('#consentDocsRows tr').nth(0)).toContainText(DRAFT.title)
  })

  test('escribir varias veces reinicia la pausa: solo un PATCH tras la última tecla', async ({ page }) => {
    const seen = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Editar' }).click()
    const content = page.locator('#consentEditorContent')
    await content.fill('# Aviso\n\nPrimer intento.')
    await page.waitForTimeout(700)
    await content.fill('# Aviso\n\nSegundo intento.')
    await page.waitForTimeout(700)
    await content.fill('# Aviso\n\nTexto final.')

    await expect(page.locator('#consentEditorAutosaveStatus')).toContainText('Guardado automáticamente', { timeout: 5000 })
    const patches = seen.filter((s) => s.url === `/fn/admin-consent/documents/${DRAFT.id}` && s.method === 'PATCH')
    expect(patches).toHaveLength(1)
    expect(JSON.parse(patches[0].body!)).toEqual({ title: DRAFT.title, content_md: '# Aviso\n\nTexto final.', purposes: DRAFT_PURPOSES })
  })

  test('autoguardado sin título: no llama al backend, sigue "Cambios sin guardar"', async ({ page }) => {
    const seen = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Editar' }).click()
    await page.locator('#consentEditorTitle').fill('')
    await page.waitForTimeout(2000)
    const patches = seen.filter((s) => s.url === `/fn/admin-consent/documents/${DRAFT.id}` && s.method === 'PATCH')
    expect(patches).toHaveLength(0)
    await expect(page.locator('#consentEditorAutosaveStatus')).toContainText('Cambios sin guardar')
  })

  test('cerrar con cambios sin guardar pide confirmación; cancelar conserva el editor abierto y el texto', async ({ page }) => {
    await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Editar' }).click()
    await page.locator('#consentEditorContent').fill('# Cambio local todavía sin guardar')
    await expect(page.locator('#consentEditorAutosaveStatus')).toContainText('Cambios sin guardar')
    page.once('dialog', (dialog) => void dialog.dismiss())
    await page.locator('#consentEditorClose').click()
    await expect(page.locator('#consentDraftEditor')).toBeVisible()
    await expect(page.locator('#consentEditorContent')).toHaveValue('# Cambio local todavía sin guardar')
  })

  test('cerrar con cambios sin guardar y confirmar: descarta y cierra el editor', async ({ page }) => {
    await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Editar' }).click()
    await page.locator('#consentEditorContent').fill('# Cambio que se va a descartar')
    page.once('dialog', (dialog) => void dialog.accept())
    await page.locator('#consentEditorClose').click()
    await expect(page.locator('#consentDraftEditor')).toBeHidden()
    await expect(page.locator('#consentEditorTitle')).toHaveValue('')
  })

  test('abrir otro borrador con cambios sin guardar pide confirmación', async ({ page }) => {
    const draft2 = { ...DRAFT, id: 'd-3', version: '1.2', title: 'Aviso de consentimiento (otro borrador)' }
    await setup(page, { extraDocs: [draft2] })
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr', { hasText: DRAFT.version }).getByRole('button', { name: 'Editar' }).click()
    await page.locator('#consentEditorContent').fill('# Cambio sin guardar en el primer borrador')
    page.once('dialog', (dialog) => void dialog.dismiss())
    await page.locator('#consentDocsRows tr', { hasText: draft2.version }).getByRole('button', { name: 'Editar' }).click()
    await expect(page.locator('#consentEditorContent')).toHaveValue('# Cambio sin guardar en el primer borrador')
  })
})

// T21.c.3 (REQ-03): editor de finalidades (`purposes`) dentro del mismo panel de borrador. El código de
// una finalidad ya existente al abrir el editor (o ya guardada con éxito en esta sesión) es inmutable;
// el resto de campos y las finalidades nuevas (botón "Agregar finalidad") son editables. Mismo patrón de
// mocking que T21.c.1/T21.c.2.
test.describe('T21.c.3 · editor de finalidades, código inmutable para las existentes', () => {
  test.beforeEach(async ({}, info) => { test.skip(info.project.name !== 'desktop-chrome', 'servidor: una sola vez') })

  test('abrir el editor muestra las finalidades existentes, con el código bloqueado', async ({ page }) => {
    await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Editar' }).click()
    const rows = page.locator('#consentPurposesRows tr')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0).locator('.purpose-code')).toHaveValue('registro_aprendizaje')
    await expect(rows.nth(0).locator('.purpose-code')).toBeDisabled()
    await expect(rows.nth(0).locator('.purpose-label')).toHaveValue('Registro y aprendizaje')
    await expect(rows.nth(0).locator('.purpose-required')).toBeChecked()
    await expect(rows.nth(1).locator('.purpose-code')).toHaveValue('novedades')
    await expect(rows.nth(1).locator('.purpose-code')).toBeDisabled()
    await expect(rows.nth(1).locator('.purpose-required')).not.toBeChecked()
  })

  test('"Agregar finalidad" agrega una fila con código editable; guardar la incluye en el PATCH', async ({ page }) => {
    const seen = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Editar' }).click()
    await page.locator('#consentPurposeAdd').click()
    const rows = page.locator('#consentPurposesRows tr')
    await expect(rows).toHaveCount(3)
    await expect(rows.nth(2).locator('.purpose-code')).toBeEnabled()
    await rows.nth(2).locator('.purpose-code').fill('publicidad_personalizada')
    await rows.nth(2).locator('.purpose-label').fill('Publicidad personalizada')
    await page.locator('#consentEditorForm').getByRole('button', { name: 'Guardar cambios' }).click()

    const patch = seen.find((s) => s.url === `/fn/admin-consent/documents/${DRAFT.id}` && s.method === 'PATCH')!
    expect(JSON.parse(patch.body!).purposes).toEqual([
      ...DRAFT_PURPOSES,
      { code: 'publicidad_personalizada', label: 'Publicidad personalizada', description: '', required: false },
    ])
  })

  test('tras guardar con éxito, el código de una finalidad recién agregada queda bloqueado', async ({ page }) => {
    await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Editar' }).click()
    await page.locator('#consentPurposeAdd').click()
    const newRow = page.locator('#consentPurposesRows tr').nth(2)
    await newRow.locator('.purpose-code').fill('publicidad_personalizada')
    await newRow.locator('.purpose-label').fill('Publicidad personalizada')
    await expect(newRow.locator('.purpose-code')).toBeEnabled()
    await page.locator('#consentEditorForm').getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.locator('#consentEditorAutosaveStatus')).toContainText('Guardado a las')
    await expect(newRow.locator('.purpose-code')).toBeDisabled()
  })

  test('"Quitar" excluye esa finalidad del PATCH', async ({ page }) => {
    const seen = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Editar' }).click()
    await page.locator('#consentPurposesRows tr').nth(1).getByRole('button', { name: 'Quitar' }).click()
    await expect(page.locator('#consentPurposesRows tr')).toHaveCount(1)
    await page.locator('#consentEditorForm').getByRole('button', { name: 'Guardar cambios' }).click()
    const patch = seen.find((s) => s.url === `/fn/admin-consent/documents/${DRAFT.id}` && s.method === 'PATCH')!
    expect(JSON.parse(patch.body!).purposes).toEqual([DRAFT_PURPOSES[0]])
  })

  test('quitar todas las finalidades: mensaje de error, no llama al backend', async ({ page }) => {
    const seen = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Editar' }).click()
    await page.locator('#consentPurposesRows tr').nth(1).getByRole('button', { name: 'Quitar' }).click()
    await page.locator('#consentPurposesRows tr').nth(0).getByRole('button', { name: 'Quitar' }).click()
    await page.locator('#consentEditorForm').getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.locator('#consentEditorMessage')).toContainText('al menos una finalidad')
    expect(seen.some((s) => s.url === `/fn/admin-consent/documents/${DRAFT.id}` && s.method === 'PATCH')).toBe(false)
  })

  test('código repetido entre finalidades: mensaje de error, no llama al backend', async ({ page }) => {
    const seen = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Editar' }).click()
    await page.locator('#consentPurposeAdd').click()
    const newRow = page.locator('#consentPurposesRows tr').nth(2)
    await newRow.locator('.purpose-code').fill('novedades')
    await newRow.locator('.purpose-label').fill('Duplicada')
    await page.locator('#consentEditorForm').getByRole('button', { name: 'Guardar cambios' }).click()
    await expect(page.locator('#consentEditorMessage')).toContainText('repetido')
    expect(seen.some((s) => s.url === `/fn/admin-consent/documents/${DRAFT.id}` && s.method === 'PATCH')).toBe(false)
  })

  test('cambiar la etiqueta de una finalidad existente dispara el autoguardado', async ({ page }) => {
    const seen = await setup(page)
    await openConsentAsIdentity(page)
    await page.locator('#consentDocsRows tr').nth(0).getByRole('button', { name: 'Editar' }).click()
    await page.locator('#consentPurposesRows tr').nth(0).locator('.purpose-label').fill('Registro (actualizado)')
    await expect(page.locator('#consentEditorAutosaveStatus')).toContainText('Cambios sin guardar')
    await expect(page.locator('#consentEditorAutosaveStatus')).toContainText('Guardado automáticamente', { timeout: 5000 })
    const patches = seen.filter((s) => s.url === `/fn/admin-consent/documents/${DRAFT.id}` && s.method === 'PATCH')
    expect(patches).toHaveLength(1)
    expect(JSON.parse(patches[0].body!).purposes[0].label).toBe('Registro (actualizado)')
  })
})
