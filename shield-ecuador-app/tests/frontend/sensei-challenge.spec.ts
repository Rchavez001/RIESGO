import { test, expect, Page } from '@playwright/test'
import { signedIn } from './auth-fixture'
import { settle } from './helpers'

const Q = { id: 'P1-0001', belt: 'blanco', kind: 'question', topic: 'Códigos', sublevel: 1, terms: {},
  prompt: 'Un mensaje pide tu código de verificación. ¿Qué haces?',
  options: ['Se lo doy si insiste.', 'Compruebo por un canal oficial.', 'Lo comparto solo una vez.', 'Respondo con mis datos.'] }
const CORRECT = 1
const EXPLANATION = 'Un código de verificación no se comparte: confirma por un canal oficial.'

async function setup(page: Page) {
  await signedIn(page)
  // Deterministic coin (0.1 → cara) and instant coin under reduced motion, so the flow is scriptable.
  await page.addInitScript(() => { Math.random = () => 0.1 })
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.route('**/rest/v1/rpc/minigame_random_question', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(Q) }))
  await page.route('**/rest/v1/rpc/minigame_check_answer', r => {
    const { p_answer } = r.request().postDataJSON()
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ correct: p_answer === CORRECT, correct_index: CORRECT, explanation: EXPLANATION }) })
  })
}

async function openChallenge(page: Page) {
  await page.goto('/dashboard')
  await settle(page, 'main')
  const more = page.getByRole('button', { name: 'Más' })
  if (await more.isVisible()) await more.click()
  const open = page.getByRole('button', { name: 'Desafiando al Sensei' })
  await open.click()
  await expect(page.getByRole('dialog', { name: 'Desafiando al Sensei' })).toBeVisible()
  await settle(page, '.sensei-challenge-modal')
}

const dialog = (page: Page) => page.getByRole('dialog', { name: 'Desafiando al Sensei' })
const startAsUser = async (page: Page) => {
  await dialog(page).getByRole('button', { name: 'Cara', exact: true }).click()
  await dialog(page).getByRole('button', { name: /lanzar moneda/i }).click()
  await expect(dialog(page).getByText(Q.prompt)).toBeVisible({ timeout: 10_000 })
}
const optionByText = (page: Page, text: string) => dialog(page).locator('.sensei-option-btn', { hasText: text })

test.describe('Desafiando al Sensei', () => {
  test('apertura: diálogo modal con foco dentro, sin scroll de fondo, objetivos ≥44px y sin desborde', async ({ page }) => {
    await setup(page)
    await openChallenge(page)
    await expect(dialog(page)).toHaveAttribute('aria-modal', 'true')
    await expect(dialog(page).getByRole('button', { name: 'Cara', exact: true })).toBeFocused()
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden')
    const small = await dialog(page).evaluate(el => [...el.querySelectorAll('button')]
      .filter(b => b.getBoundingClientRect().height < 43.5).map(b => `${b.textContent?.trim() || b.getAttribute('aria-label')} ${Math.round(b.getBoundingClientRect().height)}px`))
    expect(small).toEqual([])
    expect(await dialog(page).evaluate(el => el.scrollWidth <= el.clientWidth)).toBe(true)
  })

  test('Escape cierra fuera de partida y devuelve el scroll', async ({ page }) => {
    await setup(page)
    await openChallenge(page)
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
  })

  test('respuesta correcta: la pregunta llega sin la respuesta, se marca con texto y permite elegir casilla', async ({ page }) => {
    await setup(page)
    await openChallenge(page)
    await startAsUser(page)
    await expect(dialog(page).getByText('✓ Correcta')).toHaveCount(0)
    await optionByText(page, 'canal oficial').click()
    await expect(dialog(page).getByText(EXPLANATION)).toBeVisible()
    await expect(optionByText(page, 'canal oficial')).toContainText('✓ Correcta')
    const next = dialog(page).getByRole('button', { name: /elegir casilla/i })
    await expect(next).toBeFocused()
    await next.click()
    const board = dialog(page).getByRole('group', { name: /tablero de tres en raya/i })
    await board.getByRole('button', { name: /casilla 1, vacía/i }).click()
    await expect(board.getByRole('button', { name: /casilla 1: tu ficha/i })).toBeDisabled()
  })

  test('respuesta incorrecta: cede el turno y muestra la correcta sin depender del color', async ({ page }) => {
    await setup(page)
    await openChallenge(page)
    await startAsUser(page)
    await optionByText(page, 'Se lo doy').click()
    await expect(dialog(page).getByText(/cedes tu turno/i)).toBeVisible()
    await expect(optionByText(page, 'canal oficial')).toContainText('✓ Correcta')
    await expect(dialog(page).getByRole('button', { name: /^continuar$/i })).toBeFocused()
  })

  test('salir a mitad de partida pide confirmación', async ({ page }) => {
    await setup(page)
    await openChallenge(page)
    await startAsUser(page)
    page.once('dialog', d => d.dismiss())
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toBeVisible()
    page.once('dialog', d => d.accept())
    await page.keyboard.press('Escape')
    await expect(dialog(page)).toHaveCount(0)
  })

  test('si falla la carga: mensaje sin detalles del servidor y "Reintentar" vuelve al inicio sin recargar', async ({ page }) => {
    await setup(page)
    await page.route('**/rest/v1/rpc/minigame_random_question', r => r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"connection to server lost","code":"XX000"}' }))
    await openChallenge(page)
    await dialog(page).getByRole('button', { name: 'Cara', exact: true }).click()
    await dialog(page).getByRole('button', { name: /lanzar moneda/i }).click()
    const alert = dialog(page).getByRole('alert')
    await expect(alert).toBeVisible({ timeout: 10_000 })
    await expect(alert).not.toContainText(/connection to server/i)
    await dialog(page).getByRole('button', { name: /reintentar/i }).click()
    await expect(dialog(page).getByRole('button', { name: /lanzar moneda/i })).toBeVisible()
  })
})
