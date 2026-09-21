import { test, expect, Page } from '@playwright/test'
import { signedIn } from './auth-fixture'
import { settle } from './helpers'

const OPTIONS = ['Compartir el código.', 'Comprobar por un canal oficial.', 'Pagar un monto pequeño.', 'Responder con tus datos.']
const q = (index: number) => ({ index, question_id: `Q${index}`, prompt: `Pregunta número ${index + 1}: ¿qué haces ante un mensaje urgente?`, options: OPTIONS, time_limit_seconds: 30 })
const start = (index: number, remaining = 30) => ({ match_id: 'm-1', question: q(index), score_so_far: 0, remaining_seconds: remaining, answered_so_far: index, total_questions: 3 })

type Opts = { remaining?: number; startIndex?: number }

// The mock keeps the same state machine the server has: answer -> (closed clock) -> start_match opens the next question.
async function setup(page: Page, opts: Opts = {}) {
  await signedIn(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  let index = opts.startIndex ?? 0
  const calls: { start: number; answers: number[] } = { start: 0, answers: [] }
  await page.route('**/rest/v1/rpc/championship_start_match', r => {
    calls.start++
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(start(index, calls.start === 1 ? opts.remaining ?? 30 : 30)) })
  })
  await page.route('**/rest/v1/rpc/championship_answer_question', r => {
    const { p_answer_index } = r.request().postDataJSON()
    calls.answers.push(p_answer_index)
    const finished = index === 2
    const body = { correct: p_answer_index === 1, correct_index: 1, explanation: 'Un mensaje urgente se comprueba por un canal oficial.', has_next: !finished, finished }
    index++
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) })
  })
  return calls
}

async function open(page: Page) {
  await page.goto('/campeonato/combate/m-1')
  await expect(page.getByRole('heading', { name: /pregunta número 1|pregunta número 2/i })).toBeVisible()
  await settle(page, '.learning-page')
}

test.describe('/campeonato/combate/:id', () => {
  test('pregunta: progreso, reloj con nombre, opciones ≥44px, aviso del reloj y sin scroll horizontal', async ({ page }) => {
    await setup(page)
    await open(page)
    await expect(page.getByText('PREGUNTA 1 DE 3')).toBeVisible()
    await expect(page.getByRole('timer', { name: 'Tiempo restante' })).toContainText(/Tiempo restante: \d+ s/)
    await expect(page.getByText(/el tiempo de esta pregunta sigue corriendo/i)).toBeVisible()
    const small = await page.evaluate(() => [...document.querySelectorAll('.answer-option')].filter(e => e.getBoundingClientRect().height < 43.5).length)
    expect(small).toBe(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.getByText(/respuesta correcta/i)).toHaveCount(0)
  })

  test('responder: envía el índice, marca con texto (no solo color), explica y enfoca la explicación', async ({ page }) => {
    const calls = await setup(page)
    await open(page)
    await page.locator('.answer-option').nth(0).click()
    const feedback = page.locator('.champ-feedback')
    await expect(feedback).toBeVisible()
    await expect(feedback).toBeFocused()
    await expect(feedback).toContainText('✕ Incorrecto')
    await expect(page.locator('.answer-option').nth(1)).toContainText('✓ Respuesta correcta')
    await expect(page.locator('.answer-option').nth(0)).toContainText('✕ Tu respuesta')
    await expect(page.locator('.answer-option').nth(0)).toBeDisabled()
    expect(calls.answers).toEqual([0])
  })

  test('siguiente: abre la pregunta con start_match (el reloj corre desde ahí) y la enfoca', async ({ page }) => {
    const calls = await setup(page)
    await open(page)
    await page.locator('.answer-option').nth(1).click()
    await expect(page.getByText(/empieza cuando la abres/i)).toBeVisible()
    await page.getByRole('button', { name: 'Siguiente pregunta' }).click()
    const prompt = page.getByRole('heading', { name: /pregunta número 2/i })
    await expect(prompt).toBeFocused()
    await expect(page.getByText('PREGUNTA 2 DE 3')).toBeVisible()
    expect(calls.start).toBe(2)
  })

  test('terminar: resumen enfocado con el recuento de aciertos', async ({ page }) => {
    test.setTimeout(90_000)
    await setup(page)
    await open(page)
    for (let n = 0; n < 2; n++) {
      await page.locator('.answer-option').nth(1).click()
      await page.getByRole('button', { name: 'Siguiente pregunta' }).click()
      await expect(page.getByText(`PREGUNTA ${n + 2} DE 3`)).toBeVisible()
    }
    await page.locator('.answer-option').nth(1).click()
    const done = page.getByRole('heading', { name: '¡Terminaste tu combate!' })
    await expect(done).toBeFocused()
    await expect(page.getByText('Respondiste correctamente 3 de 3 preguntas.')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Volver al campeonato' })).toBeVisible()
  })

  test('se acaba el tiempo: se envía -1 automáticamente y se avisa con texto', async ({ page }) => {
    test.setTimeout(60_000)
    const calls = await setup(page, { remaining: 2 })
    await open(page)
    await expect(page.locator('.champ-feedback')).toContainText('✕ Se acabó el tiempo', { timeout: 15_000 })
    expect(calls.answers).toEqual([-1])
  })

  test('al recargar a mitad de combate se muestra la pregunta en curso con el tiempo que queda', async ({ page }) => {
    await setup(page, { startIndex: 1, remaining: 17 })
    await open(page)
    await expect(page.getByText('PREGUNTA 2 DE 3')).toBeVisible()
    const shown = await page.getByRole('timer', { name: 'Tiempo restante' }).textContent()
    expect(Number(/(\d+) s/.exec(shown ?? '')?.[1])).toBeLessThanOrEqual(17)
  })

  test('combate no disponible: mensaje del servidor con tildes y salida', async ({ page }) => {
    await signedIn(page)
    await page.route('**/rest/v1/rpc/championship_start_match', r => r.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ code: 'P0001', message: 'La ventana de este combate ya cerró.' }) }))
    await page.goto('/campeonato/combate/m-1')
    await expect(page.getByRole('alert')).toContainText('La ventana de este combate ya cerró.')
    await settle(page, '.learning-page')
    const back = page.getByRole('button', { name: 'Volver al campeonato' })
    expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(43.5)
    await back.click()
    await expect(page).toHaveURL(/\/campeonato$/)
  })

  test('error del servidor: mensaje genérico sin detalles internos', async ({ page }) => {
    await signedIn(page)
    await page.route('**/rest/v1/rpc/championship_start_match', r => r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"deadlock detected"}' }))
    await page.goto('/campeonato/combate/m-1')
    await expect(page.getByRole('alert')).toBeVisible()
    await expect(page.getByRole('alert')).not.toContainText(/deadlock/)
  })
})
