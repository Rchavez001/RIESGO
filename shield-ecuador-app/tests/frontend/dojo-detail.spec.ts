import { test, expect, Page } from '@playwright/test'
import { signedIn } from './auth-fixture'
import { settle } from './helpers'

const Q1 = {
  id: 'P3-0001', topic: 'Premios inesperados', sublevel: 1,
  prompt: 'Recibes un mensaje que anuncia un premio en un sorteo al que no te inscribiste. Para entregarlo, pide un pago hoy. ¿Qué idea conviene recordar para evaluar lo que ocurre?',
  options: ['Un premio es auténtico si menciona tu nombre completo.', 'Un premio inesperado con pago urgente puede ser un engaño; el mensaje no demuestra que exista el sorteo.', 'Un pago pequeño no puede formar parte de una estafa.', 'La palabra «oficial» demuestra que la oferta fue revisada.'],
  terms: { contraseña: 'Secreto que permite entrar a una cuenta.', 'canal oficial': 'Contacto cuya procedencia comprobaste.' },
}
const Q2 = { ...Q1, id: 'P3-0002', topic: 'Enlaces cortos', prompt: 'Te llega un enlace acortado de un supuesto banco. ¿Qué haces primero?' }
const REVEAL = { correct: 1, explanation: 'Un premio inesperado con pago urgente puede ser un engaño. En la práctica: no pagues y comprueba por un canal oficial.' }

const state = (over: Record<string, unknown>) => ({ dojo: 'passwords', cursor: 0, answered: 0, total: 30, complete: false, version: '3.0.0', selected: null, question: Q1, ...over })

async function setup(page: Page, opts: { anonymous?: boolean } = {}) {
  await signedIn(page, { anonymous: opts.anonymous })
  let step: 'q1' | 'a1' | 'q2' = 'q1'
  await page.route('**/rest/v1/rpc/learning_state', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(step === 'q1' ? state({}) : step === 'a1' ? state({ answered: 1, selected: 0, question: { ...Q1, ...REVEAL } }) : state({ cursor: 1, answered: 1, question: Q2 })) }))
  await page.route('**/rest/v1/rpc/learning_answer', r => { step = 'a1'; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state({ answered: 1, selected: 0, question: { ...Q1, ...REVEAL } })) }) })
  await page.route('**/rest/v1/rpc/learning_next', r => { step = 'q2'; return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(state({ cursor: 1, answered: 1, question: Q2 })) }) })
}

async function openDojo(page: Page) {
  await page.goto('/dojo/passwords')
  await expect(page.locator('.answer-option').first()).toBeVisible()
  await settle(page, '.learning-page')
}

const isPhone = (page: Page) => page.evaluate(() => innerWidth <= 700 || innerHeight <= 520)

test.describe('/dojo/:id', () => {
  test('primera pantalla móvil: la pregunta aparece sin tener que bajar', async ({ page }) => {
    await setup(page)
    await openDojo(page)
    test.skip(!(await isPhone(page)), 'solo teléfonos')
    const top = await page.locator('.learning-prompt').evaluate(e => e.getBoundingClientRect().top)
    const vh = await page.evaluate(() => innerHeight)
    expect(top).toBeLessThan(vh - 65 - 40) // sobre la barra inferior de 65px con margen; antes la introducción ocupaba toda la primera pantalla
  })

  test('opciones y "palabras que te pueden ayudar" ≥44px; sin scroll horizontal; sin marcar nada antes de responder', async ({ page }) => {
    await setup(page)
    await openDojo(page)
    const small = await page.evaluate(() => [...document.querySelectorAll('.answer-option, .learning-terms summary, .learning-actions button')]
      .filter(e => { const r = e.getBoundingClientRect(); return r.height < 43.5 }).map(e => `${e.className} ${Math.round(e.getBoundingClientRect().height)}px`))
    expect(small).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.locator('.answer-option.correct')).toHaveCount(0)
    await expect(page.getByText('Respuesta recomendada')).toHaveCount(0)
  })

  test('responder: la explicación queda a la vista y enfocada, y el resultado no depende solo del color', async ({ page }) => {
    await setup(page)
    await openDojo(page)
    await page.locator('.answer-option').nth(0).click()
    const feedback = page.locator('.learning-feedback-anchor')
    await expect(feedback).toBeVisible()
    await expect(feedback).toBeFocused()
    await expect(feedback).toBeInViewport({ ratio: 0.3 })
    await expect(page.locator('.answer-option').nth(1)).toContainText('Respuesta recomendada')
    await expect(page.locator('.answer-option').nth(0)).toContainText('Tu respuesta')
    await expect(page.locator('.answer-option').nth(0)).toBeDisabled()
  })

  test('continuar: la nueva pregunta queda enfocada y a la vista (antes la página seguía abajo)', async ({ page }) => {
    await setup(page)
    await openDojo(page)
    await page.locator('.answer-option').nth(0).click()
    const next = page.getByRole('button', { name: /ya leí la explicación/i })
    await next.click()
    const prompt = page.locator('.learning-prompt')
    await expect(prompt).toContainText('enlace acortado')
    await expect(prompt).toBeFocused()
    await expect.poll(() => prompt.evaluate(e => { const r = e.getBoundingClientRect(); return r.top >= -1 && r.top < innerHeight * 0.7 })).toBe(true)
  })

  test('invitado: aviso para registrarse y el texto no promete guardar en una cuenta', async ({ page }) => {
    await setup(page, { anonymous: true })
    await openDojo(page)
    await expect(page.getByRole('note')).toContainText(/modo invitado/i)
    await expect(page.getByRole('link', { name: /regístrate gratis/i })).toBeVisible()
    await expect(page.getByText(/respuestas en esta sesión/i)).toBeVisible()
    await expect(page.getByText(/guardadas en tu cuenta/i)).toHaveCount(0)
  })

  test('invitado en el tope de 10 (INV-SEC): invitación a registrarse, no el botón de reintentar', async ({ page }) => {
    await setup(page, { anonymous: true })
    await openDojo(page)
    await page.route('**/rest/v1/rpc/learning_answer', r => r.fulfill({
      status: 400, contentType: 'application/json',
      body: JSON.stringify({ code: 'P0001', message: 'GUEST_LIMIT_REACHED: Como invitado, regístrate para seguir con las 30 preguntas de este dojo.' }),
    }))
    await page.locator('.answer-option').first().click()
    await expect(page.getByRole('heading', { name: /regístrate para seguir/i })).toBeVisible()
    await expect(page.getByText(/GUEST_LIMIT_REACHED/)).toHaveCount(0)
    const cta = page.getByRole('button', { name: /regístrate gratis/i })
    await expect(cta).toBeVisible()
    await cta.click()
    await expect(page).toHaveURL(/\/registro$/)
    await expect(page.getByRole('button', { name: /recuperar mi avance/i })).toHaveCount(0)
  })

  test('si falla la carga: mensaje y reintento, sin detalles del servidor', async ({ page }) => {
    await setup(page)
    await page.route('**/rest/v1/rpc/learning_state', r => r.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"deadlock detected"}' }))
    await page.goto('/dojo/passwords')
    const alert = page.getByRole('alert')
    await expect(alert).toBeVisible()
    await expect(alert).not.toContainText(/deadlock/i)
    await expect(page.getByRole('button', { name: /recuperar mi avance/i })).toBeVisible()
  })

  test('dojo inexistente: mensaje accesible y salida a la lista', async ({ page }) => {
    await setup(page)
    await page.goto('/dojo/no-existe')
    await expect(page.getByRole('alert')).toContainText(/no encontramos este dojo/i)
    await settle(page, '.learning-page')
    const back = page.getByRole('button', { name: /volver a dojos/i })
    expect((await back.boundingBox())!.height).toBeGreaterThanOrEqual(43.5)
    await back.click()
    await expect(page).toHaveURL(/\/dojos$/)
  })
})
