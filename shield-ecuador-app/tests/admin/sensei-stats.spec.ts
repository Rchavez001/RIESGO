import { test, expect, Page } from '@playwright/test'

const ROWS = [
  { id: 'c1', question_text: 'Me llegó un mensaje <b>del banco</b> y dejé mi cédula 0102030405 ' + 'x'.repeat(300), is_cybersecurity: true, feedback_helpful: true, sentiment_label: 'positivo', created_at: '2026-09-10T10:00:00Z' },
  { id: 'c2', question_text: '¿Quién ganó el partido?', is_cybersecurity: false, feedback_helpful: null, sentiment_label: null, created_at: '2026-09-09T10:00:00Z' },
]
const DAILY = [{ day: '2026-09-10', total_consultations: 30, helpful_yes: 12, positive_feedback: 9 }]

async function setup(page: Page) {
  await page.route('**/api/rest/v1/sensei_consultations?*', r => {
    const url = r.request().url()
    if (r.request().headers()['prefer'] === 'count=exact') {
      const total = url.includes('is_cybersecurity=eq.false') ? 17 : url.includes('feedback_helpful=eq.true') ? 64 : url.includes('sentiment_label=eq.positivo') ? 50 : 128
      return r.fulfill({ status: 200, headers: { 'Content-Range': `0-0/${total}` }, contentType: 'application/json', body: '[{"id":"x"}]' })
    }
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(ROWS) })
  })
  await page.route('**/api/rest/v1/sensei_consultation_stats*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(DAILY) }))
}

async function openSensei(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Administrador de Ciber Dojo', level: 1 })).toBeVisible()
  if (await page.evaluate(() => innerWidth <= 1180)) await page.locator('#menuToggle').click()
  await page.locator('.nav-item', { hasText: 'Sensei IA' }).click()
  await expect(page.locator('#senseiStats')).toHaveClass(/active/)
}

test.describe('A7 · Sensei IA', () => {
  test('las cifras son totales de la base (antes: como mucho 20, las filas descargadas)', async ({ page }) => {
    await setup(page)
    await openSensei(page)
    await expect(page.locator('#senseiMetricTotal')).toHaveText('128')
    await expect(page.locator('#senseiMetricOut')).toHaveText('17')
    await expect(page.locator('#senseiMetricHelpful')).toHaveText('64')
    await expect(page.locator('#senseiMetricPositive')).toHaveText('50')
    await expect(page.locator('#senseiStatsNote')).toContainText('128 consultas')
    await expect(page.locator('#senseiMetricGrid')).toHaveAttribute('aria-busy', 'false')
  })

  test('las consultas se muestran como texto, recortadas a 200 caracteres y avisando que pueden llevar datos personales', async ({ page }) => {
    await setup(page)
    await openSensei(page)
    const first = page.locator('#senseiConsultationList .question-row').first()
    await expect(first).toContainText('<b>del banco</b>')
    expect(await page.locator('#senseiConsultationList b').count()).toBe(0)
    expect((await first.textContent())!.length).toBeLessThan(330)
    await expect(first).toContainText('…')
    await expect(page.locator('#senseiStats')).toContainText('puede contener datos personales')
    await expect(page.locator('#senseiConsultationList')).toContainText('fuera de alcance')
    await expect(page.locator('#senseiConsultationList')).toContainText('sin opinión')
  })

  test('resumen diario con tildes', async ({ page }) => {
    await setup(page)
    await openSensei(page)
    await expect(page.locator('#senseiDailyStats')).toContainText('30 consultas · 12 útiles · 9 positivas')
    await expect(page.locator('#senseiStats')).toContainText('Últimas consultas')
  })

  test('si falla la lectura: "—" y aviso, nunca ceros que parezcan datos', async ({ page }) => {
    await page.route('**/api/rest/v1/sensei_consultation*', r => r.fulfill({ status: 500, body: 'boom' }))
    await openSensei(page)
    await expect(page.locator('#senseiStatsNote')).toContainText('No se pudieron leer las estadísticas')
    await expect(page.locator('#senseiMetricTotal')).toHaveText('—')
  })

  test('sin scroll horizontal y con botones ≥44 px', async ({ page }) => {
    await setup(page)
    await openSensei(page)
    await expect(page.locator('#senseiMetricTotal')).toHaveText('128')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const small = await page.evaluate(() => [...document.querySelectorAll('#senseiStats button')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height < 43.5 }).length)
    expect(small).toBe(0)
  })
})
