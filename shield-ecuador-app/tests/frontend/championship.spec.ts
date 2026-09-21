import { test, expect, Page } from '@playwright/test'
import { signedIn } from './auth-fixture'
import { settle } from './helpers'

const CHAMP = { id: 'ch-1', name: 'Copa Ciber Dojo', status: 'registration_open', min_belt: 'brown', max_age: 18,
  registration_opens_at: '2026-09-01T05:00:00Z', registration_closes_at: '2026-10-30T05:00:00Z', questions_per_match: 10,
  time_limit_easy_seconds: 30, time_limit_medium_seconds: 45, time_limit_hard_seconds: 60, rules_text: 'Sin ayuda externa.' }
const MATCH = { id: 'm-1', round: 1, scheduled_at: '2026-11-02T15:00:00Z', window_closes_at: '2026-11-02T17:00:00Z', status: 'scheduled', is_bye: false, winner_id: null, my_attempt_done: false }

async function setup(page: Page, status: unknown, opts: { anonymous?: boolean } = {}) {
  await signedIn(page, opts)
  await page.route('**/rest/v1/rpc/get_my_championship_status', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(status) }))
}

async function open(page: Page) {
  await page.goto('/campeonato')
  await expect(page.getByRole('heading', { name: 'Campeonato', level: 1 })).toBeVisible()
  await settle(page, '.learning-page')
}

test.describe('/campeonato', () => {
  test('reglas con tildes, cinturón en español, horas de Ecuador, sin scroll horizontal', async ({ page }) => {
    await setup(page, { championship: CHAMP, registered: false })
    await open(page)
    await expect(page.getByText('marrón', { exact: true })).toBeVisible()
    await expect(page.getByText('18 años')).toBeVisible()
    await expect(page.getByText(/30 s \(fácil\), 45 s \(media\), 60 s \(difícil\)/)).toBeVisible()
    await expect(page.getByText(/hora de Ecuador/).first()).toBeVisible()
    await expect(page.getByText('Sin ayuda externa.')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })

  test('inscripción: campo con etiqueta, límites y explicación de uso; botón desactivado sin fecha', async ({ page }) => {
    await setup(page, { championship: CHAMP, registered: false })
    await open(page)
    const date = page.getByLabel('Fecha de nacimiento')
    await expect(date).toHaveAttribute('max', /^\d{4}-\d{2}-\d{2}$/)
    await expect(date).toHaveAccessibleDescription(/comprobar el límite de edad/i)
    expect((await date.boundingBox())!.height).toBeGreaterThanOrEqual(43.5)
    const enroll = page.getByRole('button', { name: 'Inscribirme' })
    await expect(enroll).toBeDisabled()
    await date.fill('2010-05-10')
    await expect(enroll).toBeEnabled()
    expect((await enroll.boundingBox())!.height).toBeGreaterThanOrEqual(43.5)
  })

  test('inscribirse: envía la fecha, confirma y mueve el foco a la confirmación', async ({ page }) => {
    let registered = false
    let sent: Record<string, unknown> | null = null
    await setup(page, { championship: CHAMP, registered: false })
    await page.route('**/rest/v1/rpc/get_my_championship_status', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ championship: CHAMP, registered }) }))
    await page.route('**/rest/v1/rpc/register_for_championship', r => { sent = r.request().postDataJSON(); registered = true; return r.fulfill({ status: 200, contentType: 'application/json', body: '"reg-1"' }) })
    await open(page)
    await page.getByLabel('Fecha de nacimiento').fill('2010-05-10')
    await page.getByRole('button', { name: 'Inscribirme' }).click()
    const done = page.getByRole('status').filter({ hasText: 'Ya estás inscrito' })
    await expect(done).toBeVisible()
    await expect(done).toBeFocused()
    expect(sent).toEqual({ p_championship_id: 'ch-1', p_birthdate: '2010-05-10' })
  })

  test('rechazo de la inscripción (edad/cinturón): muestra el mensaje del servidor con tildes', async ({ page }) => {
    await setup(page, { championship: CHAMP, registered: false })
    await page.route('**/rest/v1/rpc/register_for_championship', r => r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: 'La edad máxima para este campeonato es de 18 años.' }) }))
    await open(page)
    await page.getByLabel('Fecha de nacimiento').fill('1990-01-01')
    await page.getByRole('button', { name: 'Inscribirme' }).click()
    await expect(page.getByRole('alert')).toContainText('La edad máxima para este campeonato es de 18 años.')
  })

  test('inscripciones cerradas', async ({ page }) => {
    await setup(page, { championship: { ...CHAMP, status: 'registration_closed' }, registered: false })
    await open(page)
    await expect(page.getByText('Las inscripciones no están abiertas en este momento.')).toBeVisible()
  })

  test('sin campeonato activo', async ({ page }) => {
    await setup(page, { championship: null })
    await open(page)
    await expect(page.getByText('No hay un campeonato activo en este momento.')).toBeVisible()
  })

  test('combate asignado: botón ≥44px que lleva a la pantalla del combate', async ({ page }) => {
    await setup(page, { championship: { ...CHAMP, status: 'in_progress' }, registered: true, my_match: MATCH })
    await open(page)
    const go = page.getByRole('button', { name: 'Ir a mi combate' })
    expect((await go.boundingBox())!.height).toBeGreaterThanOrEqual(43.5)
    await go.click()
    await expect(page).toHaveURL(/\/campeonato\/combate\/m-1$/)
  })

  test('pase directo (bye)', async ({ page }) => {
    await setup(page, { championship: { ...CHAMP, status: 'in_progress' }, registered: true, my_match: { ...MATCH, is_bye: true } })
    await open(page)
    await expect(page.getByText(/pase directo \(bye\)/)).toBeVisible()
  })

  test('si falla la carga: mensaje sin detalles y "Volver a intentar" se recupera', async ({ page }) => {
    await signedIn(page)
    let fail = true
    await page.route('**/rest/v1/rpc/get_my_championship_status', r => fail
      ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"relation championships does not exist"}' })
      : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ championship: CHAMP, registered: false }) }))
    await page.goto('/campeonato')
    const alert = page.getByRole('alert')
    await expect(alert).toBeVisible()
    await expect(alert).not.toContainText(/championships does not exist/)
    await settle(page, '[role="alert"]')
    const retry = alert.getByRole('button', { name: /volver a intentar/i })
    expect((await retry.boundingBox())!.height).toBeGreaterThanOrEqual(43.5)
    fail = false
    await retry.click()
    await expect(page.getByRole('heading', { name: 'Copa Ciber Dojo' })).toBeVisible()
  })

  test('invitado: /campeonato queda cerrado y se le invita a registrarse', async ({ page }) => {
    await setup(page, { championship: CHAMP, registered: false }, { anonymous: true })
    await page.goto('/campeonato')
    await expect(page.getByRole('heading', { name: /regístrate para continuar/i })).toBeVisible()
    await expect(page.getByLabel('Fecha de nacimiento')).toHaveCount(0)
  })
})
