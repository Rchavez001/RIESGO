import { test, expect, Page } from '@playwright/test'

const TOPICS = [
  { topic: 'fuera de alcance', total: 6, out_of_scope: 6, helpful: 0, not_helpful: 0, last_at: '2026-09-10T10:00:00Z' },
  { topic: 'token <b>x</b>', total: 4, out_of_scope: 0, helpful: 1, not_helpful: 2, last_at: '2026-09-10T10:00:00Z' },
  { topic: 'doble factor', total: 1, out_of_scope: 0, helpful: 0, not_helpful: 0, last_at: '2026-09-10T10:00:00Z' },
]

async function setup(page: Page, topics: unknown = TOPICS) {
  await page.route('**/api/rest/v1/rpc/admin_sensei_topics', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(topics) }))
  await page.route('**/api/rest/v1/sensei_consultations?*', r => r.request().headers()['prefer'] === 'count=exact'
    ? r.fulfill({ status: 200, headers: { 'Content-Range': '0-0/11' }, contentType: 'application/json', body: '[{"id":"x"}]' })
    : r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }))
}

async function openPanel(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Administrador de Ciber Dojo', level: 1 })).toBeVisible()
  if (await page.evaluate(() => innerWidth <= 1180)) await page.locator('#menuToggle').click()
  await page.locator('.nav-item', { hasText: 'Preguntas abiertas' }).click()
  await expect(page.locator('#openQuestions')).toHaveClass(/active/)
}

test.describe('A9 · Preguntas abiertas', () => {
  test('los temas y el total vienen de la base de datos (no cuatro temas inventados)', async ({ page }) => {
    await setup(page)
    await openPanel(page)
    const rows = page.locator('#topicStats .topic-row')
    await expect(rows).toHaveCount(3)
    await expect(rows.nth(0)).toContainText('fuera de alcance')
    await expect(rows.nth(0)).toContainText('6 preguntas')
    await expect(rows.nth(2)).toContainText('1 pregunta')
    await expect(rows.nth(1)).toContainText('1 útil(es) · 2 no útil(es)')
    await expect(page.locator('#openQuestionsNote')).toContainText('11 preguntas registradas en total')
    await expect(page.locator('#openQuestions')).not.toContainText('Fraude bancario por mensaje')
    await expect(page.locator('#openQuestions')).not.toContainText('42 inquietudes')
  })

  test('el tema se muestra como texto y "fuera de alcance" se distingue', async ({ page }) => {
    await setup(page)
    await openPanel(page)
    await expect(page.locator('#topicStats')).toContainText('token <b>x</b>')
    expect(await page.locator('#topicStats b').count()).toBe(0)
    await expect(page.locator('#topicStats .topic-row.out')).toHaveCount(1)
  })

  test('ya no existe "Simular pregunta" y la explicación describe el proceso real y sus límites', async ({ page }) => {
    await setup(page)
    await openPanel(page)
    await expect(page.getByRole('button', { name: /simular/i })).toHaveCount(0)
    await expect(page.locator('#openQuestions')).not.toContainText('Modo local')
    await expect(page.locator('#openQuestions ol li')).toHaveCount(5)
    await expect(page.locator('#openQuestions')).toContainText('palabras clave')
    await expect(page.locator('#openQuestions')).toContainText('1.000 caracteres')
    await expect(page.locator('#openQuestions')).toContainText('20 consultas cada 10 minutos')
  })

  test('sin consultas: mensaje claro; con fallo: aviso y sin cifras', async ({ page }) => {
    await setup(page, [])
    await openPanel(page)
    await expect(page.locator('#topicStats')).toContainText('Todavía nadie ha hecho preguntas')
  })

  test('si falla la lectura: aviso y sin lista', async ({ page }) => {
    await page.route('**/api/rest/v1/rpc/admin_sensei_topics', r => r.fulfill({ status: 500, body: 'boom' }))
    await openPanel(page)
    await expect(page.locator('#openQuestionsNote')).toContainText('No se pudieron leer los temas')
    await expect(page.locator('#topicStats .topic-row')).toHaveCount(0)
  })

  test('sin scroll horizontal y con botones ≥44 px', async ({ page }) => {
    await setup(page)
    await openPanel(page)
    await expect(page.locator('#topicStats .topic-row')).toHaveCount(3)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const small = await page.evaluate(() => [...document.querySelectorAll('#openQuestions button')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height < 43.5 }).length)
    expect(small).toBe(0)
  })
})
