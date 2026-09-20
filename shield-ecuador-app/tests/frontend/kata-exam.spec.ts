import { test, expect, Page } from '@playwright/test'
import { signedIn } from './auth-fixture'
import { settle } from './helpers'

const OPTIONS = ['Confiar porque menciona tu nombre.', 'Comprobar por un canal oficial antes de actuar.', 'Pagar un monto pequeño.', 'Responder con tus datos.']
const cases = Array.from({ length: 5 }, (_, i) => ({ id: `C${i + 1}`, topic: `Tema ${i + 1}`, sublevel: 1, prompt: `Caso número ${i + 1}: recibes un mensaje urgente. ¿Qué haces?`, options: OPTIONS, terms: {} }))
const REVEAL = { correct: 1, explanation: 'Comprueba siempre por un canal oficial.' }

const view = (answers: Record<string, number>) => {
  const finished = Object.keys(answers).length === 5
  return { id: 'att-1', dojo: 'passwords', belt: 'blanco', answers, finished, score: finished ? 4 : null, passed: finished ? true : null,
    cases: cases.map(c => finished ? { ...c, ...REVEAL } : c) }
}

async function setup(page: Page, opts: { anonymous?: boolean } = {}) {
  await signedIn(page, { anonymous: opts.anonymous })
  const answers: Record<string, number> = {}
  await page.route('**/rest/v1/rpc/learning_start_exam', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(view(answers)) }))
  await page.route('**/rest/v1/rpc/learning_exam_answer', r => {
    const b = r.request().postDataJSON()
    answers[b.p_case] = b.p_answer
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(view(answers)) })
  })
}

async function open(page: Page) {
  await page.goto('/kata/EXAM_BLANCO_AMARILLO')
  await expect(page.getByText('Caso 1 de 5')).toBeVisible()
  await settle(page, '.learning-page')
}

test.describe('/kata/:code', () => {
  test('primer caso: opciones ≥44px, sin scroll horizontal y "Enviar" desactivado hasta elegir', async ({ page }) => {
    await setup(page)
    await open(page)
    const small = await page.evaluate(() => [...document.querySelectorAll('.answer-option, .exam-card .neon-button, .learning-actions button')]
      .filter(e => e.getBoundingClientRect().height < 43.5).map(e => `${e.className} ${Math.round(e.getBoundingClientRect().height)}px`))
    expect(small).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.getByRole('button', { name: /enviar y continuar/i })).toBeDisabled()
    await expect(page.getByText(/respuesta correcta|recomendada/i)).toHaveCount(0)
  })

  test('elegir marca la opción con texto (no solo color) y se puede cambiar antes de enviar', async ({ page }) => {
    await setup(page)
    await open(page)
    const opts = page.locator('.answer-option')
    await opts.nth(0).click()
    await expect(opts.nth(0)).toHaveAttribute('aria-pressed', 'true')
    await expect(opts.nth(0)).toContainText('Elegida')
    await opts.nth(2).click()
    await expect(opts.nth(0)).not.toContainText('Elegida')
    await expect(opts.nth(2)).toContainText('Elegida')
    await expect(page.getByRole('button', { name: /enviar y continuar/i })).toBeEnabled()
  })

  test('enviar avanza al siguiente caso con foco en la pregunta; el quinto muestra el resultado con explicaciones', async ({ page }) => {
    test.setTimeout(90_000)
    await page.emulateMedia({ reducedMotion: 'reduce' }) // el scroll suave retrasa las comprobaciones de estabilidad de WebKit
    await setup(page)
    await open(page)
    for (let n = 1; n <= 4; n++) {
      await page.locator('.answer-option').nth(1).click()
      await page.getByRole('button', { name: /enviar y continuar/i }).click()
      await expect(page.getByText(`Caso ${n + 1} de 5`)).toBeVisible()
      await expect(page.locator('.exam-card .learning-prompt')).toBeFocused()
    }
    await expect(page.getByText('Desafío final')).toBeVisible()
    await page.locator('.answer-option').nth(1).click()
    await page.getByRole('button', { name: /enviar y ver resultado/i }).click()
    await expect(page.getByRole('heading', { name: /aprobaste tu kata/i })).toBeFocused()
    await expect(page.getByText('Acertaste 4 de 5 casos (80 %)')).toBeVisible()
    await expect(page.getByText('Comprueba siempre por un canal oficial.').first()).toBeVisible()
  })

  test('antes de terminar el examen las respuestas correctas no están en la página', async ({ page }) => {
    await setup(page)
    await open(page)
    await expect(page.getByText('Comprueba siempre por un canal oficial.')).toHaveCount(0)
  })

  test('invitado: el kata queda cerrado y se le invita a registrarse', async ({ page }) => {
    await setup(page, { anonymous: true })
    await page.goto('/kata/EXAM_BLANCO_AMARILLO')
    await expect(page.getByRole('heading', { name: /regístrate para continuar/i })).toBeVisible()
    await expect(page.getByText('Caso 1 de 5')).toHaveCount(0)
  })

  test('si falla: mensaje sin detalles del servidor y reintento', async ({ page }) => {
    await setup(page)
    await page.route('**/rest/v1/rpc/learning_start_exam', r => r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"deadlock detected"}' }))
    await page.goto('/kata/EXAM_BLANCO_AMARILLO')
    const alert = page.getByRole('alert')
    await expect(alert).toBeVisible()
    await expect(alert).not.toContainText(/deadlock/i)
    await expect(page.getByRole('button', { name: /recuperar examen/i })).toBeVisible()
  })

  test('examen inexistente: mensaje accesible y salida a la lista', async ({ page }) => {
    await setup(page)
    await page.goto('/kata/NO-EXISTE')
    await expect(page.getByRole('alert')).toContainText(/no encontramos este examen/i)
    await settle(page, '.learning-page')
    const back = page.getByRole('button', { name: /volver a dojos/i }).first()
    expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(43.5)
    await back.click()
    await expect(page).toHaveURL(/\/dojos$/)
  })
})
