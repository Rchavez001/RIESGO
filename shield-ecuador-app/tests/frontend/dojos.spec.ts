import { test, expect, Page } from '@playwright/test'
import { signedIn } from './auth-fixture'
import { settle } from './helpers'

const IDS = ['passwords', 'assets', 'backup', 'access', 'phishing', 'incident', 'mentorship']

const overview = (answeredFirst = 12) => IDS.map((id, i) => ({ id, answered: i === 0 ? answeredFirst : 0, passed: false, unlocked: i === 0 }))

async function setup(page: Page, opts: { anonymous?: boolean; answeredFirst?: number } = {}) {
  await signedIn(page, { anonymous: opts.anonymous })
  await page.route('**/rest/v1/rpc/learning_overview', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(overview(opts.answeredFirst)) }))
}

async function openList(page: Page) {
  await page.goto('/dojos')
  await expect(page.getByRole('heading', { name: /dojos de ciberseguridad/i })).toBeVisible()
  await expect(page.locator('.learning-dojo-card')).toHaveCount(7)
  await settle(page, '.learning-page')
}

test.describe('/dojos', () => {
  test('7 tarjetas, sin scroll horizontal y todos los botones ≥44px', async ({ page }) => {
    await setup(page)
    await openList(page)
    const small = await page.evaluate(() => [...document.querySelectorAll('.learning-dojo-card button')]
      .filter(e => { const r = e.getBoundingClientRect(); return r.height < 43.5 })
      .map(e => `${(e.textContent || '').trim()} ${Math.round(e.getBoundingClientRect().height)}px`))
    expect(small).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })

  test('el botón principal se ve como botón (antes cyan primary no tenía estilo) y el bloqueado se distingue', async ({ page }) => {
    await setup(page)
    await openList(page)
    const cards = page.locator('.learning-dojo-card')
    const first = cards.nth(0).getByRole('button', { name: /continuar mi entrenamiento/i })
    await expect(first).toBeEnabled()
    const bg = await first.evaluate(e => getComputedStyle(e).backgroundImage)
    expect(bg).toContain('gradient') // relleno propio, no texto suelto
    await expect(cards.nth(0)).not.toHaveClass(/is-locked/)
    const second = cards.nth(1)
    await expect(second).toHaveClass(/is-locked/)
    const cta = second.getByRole('button', { name: /comenzar entrenamiento/i })
    await expect(cta).toBeDisabled()
    await expect(cta).toHaveAccessibleDescription(/se abre cuando apruebes el cinturón anterior/i)
  })

  test('continuar lleva al dojo y el kata sigue bloqueado hasta responder las 30', async ({ page }) => {
    await setup(page)
    await openList(page)
    const first = page.locator('.learning-dojo-card').nth(0)
    await expect(first.getByRole('button', { name: /kata · 5 casos/i })).toBeDisabled()
    await expect(first.getByRole('button', { name: /kata · 5 casos/i })).toHaveAccessibleDescription(/se abre al responder las 30 preguntas/i)
    await first.getByRole('button', { name: /continuar mi entrenamiento/i }).click()
    await expect(page).toHaveURL(/\/dojo\/passwords$/)
  })

  test('con 30 respuestas el kata se habilita', async ({ page }) => {
    await setup(page, { answeredFirst: 30 })
    await openList(page)
    const kata = page.locator('.learning-dojo-card').nth(0).getByRole('button', { name: /kata · 5 casos/i })
    await expect(kata).toBeEnabled()
    await kata.click()
    await expect(page).toHaveURL(/\/kata\//)
  })

  test('si falla la carga: mensaje sin detalles del servidor y reintento que funciona', async ({ page }) => {
    await setup(page)
    let fail = true
    await page.route('**/rest/v1/rpc/learning_overview', r => fail
      ? r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"relation does not exist"}' })
      : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(overview()) }))
    await page.goto('/dojos')
    const alert = page.getByRole('alert')
    await expect(alert).toBeVisible()
    await expect(alert).not.toContainText(/relation does not exist/i)
    fail = false
    await alert.getByRole('button', { name: /volver a intentar/i }).click()
    await expect(page.getByRole('alert')).toBeHidden()
    await expect(page.getByRole('button', { name: /continuar mi entrenamiento/i })).toBeVisible()
  })

  test('invitado: los dojos bloqueados invitan a registrarse y al tocarlos aparece el aviso', async ({ page }) => {
    await setup(page, { anonymous: true })
    await openList(page)
    const second = page.locator('.learning-dojo-card').nth(1)
    await expect(second.getByText('Regístrate gratis para desbloquear este dojo.')).toBeVisible()
    const cta = second.getByRole('button', { name: /comenzar entrenamiento/i })
    await expect(cta).toBeEnabled()
    await cta.click()
    await expect(page.getByRole('heading', { name: /regístrate para continuar/i })).toBeVisible()
  })
})
