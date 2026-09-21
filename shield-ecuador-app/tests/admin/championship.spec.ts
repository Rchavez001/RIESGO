import { test, expect, Page } from '@playwright/test'

const CHAMP = { id: 'ch-1', name: 'Copa Ciber Dojo', status: 'registration_closed', min_belt: 'black', max_age: 18,
  registration_opens_at: '2026-09-01T05:00:00Z', registration_closes_at: '2026-10-01T05:00:00Z', questions_per_match: 5,
  time_limit_easy_seconds: 60, time_limit_medium_seconds: 90, time_limit_hard_seconds: 120, rules_text: 'Reglas', created_at: '2026-09-01T00:00:00Z' }
const REGS = [{ id: 'r1', championship_id: 'ch-1', user_id: 'aaaaaaaa-1111-2222-3333-444444444444', birthdate: '2010-05-10', belt_at_registration: 'black', registered_at: '2026-09-05T10:00:00Z' }]
const MATCHES = [{ id: 'm1', round: 1, scheduled_at: '2026-11-02T15:00:00Z', status: 'scheduled', player1_id: 'bbbbbbbb-1111-2222-3333-444444444444', player2_id: 'cccccccc-1111-2222-3333-444444444444', winner_id: null }]

async function setup(page: Page, champ: Record<string, unknown> = CHAMP) {
  const calls = { patch: [] as any[], draw: [] as any[], secret: [] as any[] }
  await page.route('**/api/rest/v1/championships?*', r => {
    const req = r.request()
    if (req.method() === 'PATCH') { calls.patch.push(JSON.parse(req.postData() || '{}')); return r.fulfill({ status: 204, body: '' }) }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([champ]) })
  })
  await page.route('**/api/rest/v1/championship_registrations?*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(REGS) }))
  await page.route('**/api/rest/v1/championship_matches?*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(MATCHES) }))
  await page.route('**/api/functions/v1/championship-draw-round1', r => { calls.draw.push(JSON.parse(r.request().postData() || '{}')); return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ matches_created: 1, byes: 0, emails: [{ user_id: 'x', ok: true }] }) }) })
  await page.route('**/api/functions/v1/save-app-secret', r => { calls.secret.push(JSON.parse(r.request().postData() || '{}')); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"saved":true}' }) })
  return calls
}

async function openChamp(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Administrador de Ciber Dojo', level: 1 })).toBeVisible()
  if (await page.evaluate(() => innerWidth <= 1180)) await page.locator('#menuToggle').click()
  await page.locator('.nav-item', { hasText: 'Campeonato' }).click()
  await expect(page.locator('#championship')).toHaveClass(/active/)
  await expect(page.locator('#champName')).toHaveValue('Copa Ciber Dojo')
}

const tomorrowLocal = () => { const d = new Date(Date.now() + 2 * 86_400_000); d.setSeconds(0, 0); return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 16) }

test.describe('A10 · Campeonato (administración)', () => {
  test('carga la configuración real y las etiquetas llevan tildes', async ({ page }) => {
    await setup(page)
    await openChamp(page)
    await expect(page.locator('#champStatus')).toHaveValue('registration_closed')
    await expect(page.locator('#championship')).toContainText('Configuración del campeonato activo')
    await expect(page.locator('#championship')).toContainText('Cinturón requerido')
    await expect(page.locator('#championship')).toContainText('Edad máxima')
    await expect(page.locator('#championship')).toContainText('No se puede deshacer')
  })

  test('guardar valida los números en lugar de sustituirlos en silencio y exige cierre posterior a la apertura', async ({ page }) => {
    const calls = await setup(page)
    await openChamp(page)
    const status = page.locator('#champConfigStatus')
    await page.locator('#champMaxAge').fill('0')
    await page.locator('#champTimeEasy').fill('2')
    await page.locator('#champSaveConfig').click()
    await expect(status).toContainText('edad máxima (1–100)')
    await expect(status).toContainText('tiempo fácil (5–600 s)')
    expect(calls.patch).toEqual([])
    await page.locator('#champMaxAge').fill('18')
    await page.locator('#champTimeEasy').fill('60')
    await page.locator('#champRegCloses').fill('2020-01-01T10:00')
    await page.locator('#champSaveConfig').click()
    await expect(status).toContainText('posterior a la apertura')
    expect(calls.patch).toEqual([])
    await page.locator('#champRegCloses').fill('2026-12-01T10:00')
    await page.locator('#champSaveConfig').click()
    await expect.poll(() => calls.patch.length).toBe(1)
    expect(calls.patch[0]).toMatchObject({ max_age: 18, questions_per_match: 5, time_limit_easy_seconds: 60, status: 'registration_closed' })
  })

  test('los inscritos se muestran con edad e identificador corto, nunca con fecha de nacimiento ni id completo', async ({ page }) => {
    await setup(page)
    await openChamp(page)
    const row = page.locator('#champRegistrationList .progress-row').first()
    await expect(row).toContainText('participante aaaaaaaa')
    await expect(row).toContainText(/edad \d+ años/)
    const html = await page.locator('#champRegistrationList').innerHTML()
    expect(html).not.toContain('2010-05-10')
    expect(html).not.toContain('aaaaaaaa-1111')
    await expect(page.locator('#champMatchList')).toContainText('bbbbbbbb')
    expect(await page.locator('#champMatchList').innerHTML()).not.toContain('bbbbbbbb-1111')
  })

  test('sortear: exige estado cerrado, fecha futura y ventana 1–168; no llama a la función si algo falla', async ({ page }) => {
    const calls = await setup(page, { ...CHAMP, status: 'registration_open' })
    await openChamp(page)
    await page.locator('#champDrawScheduledAt').fill(tomorrowLocal())
    await page.locator('#champDrawRound1').click()
    await expect(page.getByText(/guarda primero el estado/i)).toBeVisible()
    expect(calls.draw).toEqual([])
  })

  test('sortear: fecha pasada y ventana fuera de rango se rechazan en la pantalla', async ({ page }) => {
    const calls = await setup(page)
    await openChamp(page)
    await page.locator('#champDrawScheduledAt').fill('2020-01-01T10:00')
    await page.locator('#champDrawRound1').click()
    await expect(page.getByText(/debe estar en el futuro/i)).toBeVisible()
    await page.locator('#champDrawScheduledAt').fill(tomorrowLocal())
    await page.locator('#champDrawWindowHours').fill('999')
    await page.locator('#champDrawRound1').click()
    await expect(page.getByText(/entre 1 y 168/i).last()).toBeVisible()
    expect(calls.draw).toEqual([])
  })

  test('sortear: la confirmación dice cuántos inscritos y que no se deshace; cancelar no envía; aceptar envía una vez', async ({ page }) => {
    const calls = await setup(page)
    await openChamp(page)
    await page.locator('#champDrawScheduledAt').fill(tomorrowLocal())
    let asked = ''
    page.once('dialog', d => { asked = d.message(); void d.dismiss() })
    await page.locator('#champDrawRound1').click()
    await expect.poll(() => asked).toContain('1 inscrito(s)')
    expect(asked).toContain('NO se puede deshacer')
    expect(calls.draw).toEqual([])
    page.once('dialog', d => void d.accept())
    await page.locator('#champDrawRound1').click()
    await expect(page.locator('#champDrawResult')).toContainText('1 combates creados')
    expect(calls.draw).toHaveLength(1)
    expect(calls.draw[0]).toMatchObject({ championship_id: 'ch-1', window_hours: 24 })
    expect(typeof calls.draw[0].scheduled_at).toBe('string')
  })

  test('mientras se sortea el botón queda desactivado (un doble clic no lo repite)', async ({ page }) => {
    const calls = await setup(page)
    await page.route('**/api/functions/v1/championship-draw-round1', async r => { calls.draw.push(1); await new Promise(res => setTimeout(res, 1500)); await r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ matches_created: 1, byes: 0, emails: [] }) }) })
    await openChamp(page)
    await page.locator('#champDrawScheduledAt').fill(tomorrowLocal())
    page.on('dialog', d => void d.accept())
    await page.locator('#champDrawRound1').click()
    await expect(page.locator('#champDrawRound1')).toBeDisabled()
    await expect(page.locator('#champDrawResult')).toContainText('combates creados', { timeout: 10_000 })
    expect(calls.draw).toHaveLength(1)
  })

  test('clave de Resend: corta se rechaza; válida se envía con el nombre exacto, el campo se vacía y no queda en el DOM ni en localStorage', async ({ page }) => {
    const calls = await setup(page)
    await openChamp(page)
    const KEY = 're_SUPER_SECRET_1234567890abcdef'
    await page.locator('#champResendKey').fill('re_corta')
    await page.locator('#champResendKeySave').click()
    await expect(page.locator('#champResendStatus')).toContainText('parece incompleta')
    expect(calls.secret).toEqual([])
    await page.locator('#champResendKey').fill(KEY)
    await page.locator('#champResendKeySave').click()
    await expect.poll(() => calls.secret.length).toBe(1)
    expect(calls.secret[0]).toEqual({ name: 'resend_api_key', value: KEY })
    await expect(page.locator('#champResendKey')).toHaveValue('')
    expect(await page.content()).not.toContain(KEY)
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain(KEY)
    await expect(page.locator('#champResendKey')).toHaveAttribute('autocomplete', 'new-password')
  })

  test('sin scroll horizontal y con controles ≥44 px', async ({ page }) => {
    await setup(page)
    await openChamp(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const small = await page.evaluate(() => [...document.querySelectorAll('#championship button:not(:disabled), #championship input:not([type="checkbox"]), #championship select, #championship textarea')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height < 43.5 }).map(e => e.id || e.className))
    expect(small).toEqual([])
  })
})
