import { test, expect, Page } from '@playwright/test'
import { signedIn } from './auth-fixture'
import { settle } from './helpers'

const ANSWER = { consultation_id: 'c-1', is_cybersecurity: true, validation_reason: 'Tema aceptado.', answer: 'No compartas el código con nadie; contacta al banco por su canal oficial.', sources: [], ask_more_prompt: '¿Necesitas algo más del Sensei?' }

async function setup(page: Page, opts: { anonymous?: boolean } = {}) {
  await signedIn(page, opts)
  await page.route('**/functions/v1/ask-sensei', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ANSWER) }))
  await page.route('**/rest/v1/sensei_consultations*', r => r.fulfill({ status: 204, body: '' }))
}

async function open(page: Page) {
  await page.goto('/sensei')
  await expect(page.getByRole('heading', { name: /pregunta al sensei/i })).toBeVisible()
  await settle(page, '.sensei-consult-layout')
}

const ask = async (page: Page, text: string) => {
  await page.getByLabel('Tu pregunta para el sensei').fill(text)
  await page.getByRole('button', { name: /preguntar/i }).click()
}

test.describe('/sensei', () => {
  test('primera pantalla: aviso de IA y de privacidad, sin scroll horizontal, "Preguntar" ≥44px y desactivado sin texto', async ({ page }) => {
    await setup(page)
    await open(page)
    await expect(page.getByRole('log')).toContainText(/asistente de inteligencia artificial/i)
    await expect(page.getByRole('log')).toContainText(/no incluyas contraseñas/i)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const send = page.getByRole('button', { name: /preguntar/i })
    await expect(send).toBeDisabled()
    expect((await send.boundingBox())!.height).toBeGreaterThanOrEqual(43.5)
    await expect(page.getByLabel('Tu pregunta para el sensei')).toHaveAttribute('maxlength', '1000')
  })

  test('preguntar: la respuesta aparece en el registro, el campo se vacía y la conversación queda a la vista', async ({ page }) => {
    await setup(page)
    await open(page)
    await ask(page, 'Me llegó un mensaje del banco pidiendo un código, ¿qué hago?')
    const log = page.getByRole('log')
    await expect(log).toContainText('No compartas el código con nadie')
    await expect(page.getByLabel('Tu pregunta para el sensei')).toHaveValue('')
    await expect.poll(() => log.evaluate(e => e.scrollHeight - e.scrollTop - e.clientHeight < 4)).toBe(true)
  })

  test('opinión: Sí/No con estado, envía solo columnas de feedback y confirma', async ({ page }) => {
    test.setTimeout(90_000) // WebKit con 3 procesos en paralelo es lento en el aside
    await setup(page)
    let patch: Record<string, unknown> | null = null
    await page.route('**/rest/v1/sensei_consultations*', r => { patch = r.request().postDataJSON(); return r.fulfill({ status: 204, body: '' }) })
    await open(page)
    await ask(page, '¿Qué es phishing?')
    await expect(page.getByText('¿Necesitas algo más?')).toBeVisible()
    const no = page.getByRole('button', { name: 'No', exact: true })
    await no.click()
    await expect(no).toHaveAttribute('aria-pressed', 'true')
    for (const b of [no, page.getByRole('button', { name: 'Sí', exact: true })]) expect((await b.boundingBox())!.height).toBeGreaterThanOrEqual(43.5)
    await page.getByLabel(/fue de ayuda/i).fill('Gracias, claro')
    await page.getByRole('button', { name: /sí ayudó/i }).click()
    await expect(page.getByText(/quedó registrada/i)).toBeVisible()
    expect(Object.keys(patch!).sort()).toEqual(['feedback_helpful', 'feedback_text', 'sentiment_label', 'sentiment_score'])
  })

  test('si falla guardar la opinión: aviso y se puede reintentar', async ({ page }) => {
    test.setTimeout(90_000) // WebKit con 3 procesos en paralelo es lento en el aside
    await setup(page)
    let fail = true
    await page.route('**/rest/v1/sensei_consultations*', r => fail
      ? r.fulfill({ status: 403, contentType: 'application/json', body: '{"message":"permission denied for table sensei_consultations"}' })
      : r.fulfill({ status: 204, body: '' }))
    await open(page)
    await ask(page, '¿Qué es phishing?')
    await page.getByRole('button', { name: 'No', exact: true }).click()
    await page.getByRole('button', { name: /no ayudó/i }).click()
    const alert = page.getByRole('alert')
    await expect(alert).toContainText(/no pudimos guardar tu opinión/i)
    await expect(alert).not.toContainText(/permission denied/i)
    fail = false
    await page.getByRole('button', { name: /no ayudó/i }).click()
    await expect(page.getByText(/quedó registrada/i)).toBeVisible()
  })

  test('límite de consultas (429): muestra el mensaje del servidor y no responde con el banco local', async ({ page }) => {
    await setup(page)
    await page.route('**/functions/v1/ask-sensei', r => r.fulfill({ status: 429, contentType: 'application/json', body: '{"error":"Hiciste muchas consultas seguidas. Espera unos minutos e inténtalo de nuevo."}' }))
    await open(page)
    await ask(page, '¿Qué es phishing?')
    await expect(page.getByRole('log')).toContainText(/muchas consultas seguidas/i)
    await expect(page.getByRole('log')).not.toContainText(/definición breve/i)
  })

  test('si el servicio falla (500): responde con reglas locales y sin detalles del servidor', async ({ page }) => {
    await setup(page)
    await page.route('**/functions/v1/ask-sensei', r => r.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"stack trace at line 42"}' }))
    await open(page)
    await ask(page, '¿Qué es phishing?')
    await expect(page.getByRole('log')).toContainText(/definición breve/i)
    await expect(page.locator('body')).not.toContainText(/stack trace/i)
  })

  test('invitado: /sensei queda cerrado y se le invita a registrarse', async ({ page }) => {
    await setup(page, { anonymous: true })
    await page.goto('/sensei')
    await expect(page.getByRole('heading', { name: /regístrate para continuar/i })).toBeVisible()
    await expect(page.getByLabel('Tu pregunta para el sensei')).toHaveCount(0)
  })
})
