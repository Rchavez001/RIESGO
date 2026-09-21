import { test, expect, Page } from '@playwright/test'

const BASE = 'http://127.0.0.1:3198'
const good = { Authorization: 'Basic ' + Buffer.from('admin:test-pass-123').toString('base64') }
const post = (path: string, body: unknown = {}) => fetch(BASE + path, { method: 'POST', headers: { ...good, 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const get = (path: string) => fetch(BASE + path, { headers: good })

// Service behaviour does not depend on the browser profile: run it once.
test.describe('A8 · T-Pot: servicio', () => {
  test.beforeEach(async ({}, info) => { test.skip(info.project.name !== 'desktop-chrome', 'servidor: una sola vez') })

  test('sin T-Pot conectado, el servidor declara que los datos son de demostración', async () => {
    for (const path of ['summary', 'logs', 'health', 'settings']) {
      const res = await get(`/api/admin/tpot/${path}`)
      expect(res.status, path).toBe(200)
      expect(res.headers.get('x-tpot-data-mode'), path).toBe('demo')
    }
  })

  test('las respuestas no llevan contraseñas ni secretos en claro', async () => {
    const text = (await (await get('/api/admin/tpot/summary')).text()) + (await (await get('/api/admin/tpot/logs')).text()) + (await (await get('/api/admin/tpot/iocs')).text())
    for (const secret of ['admin123', 'secret-token-123456', 'password":"password']) expect(text).not.toContain(secret)
  })

  test('flujo de un análisis: solo se aprueba lo auditado; lo rechazado, ya aprobado o desconocido no', async () => {
    const created = await (await post('/api/admin/tpot/ai-analysis', { filters: {}, options: {} })).json()
    expect(created.job_id).toBeTruthy()
    await new Promise(r => setTimeout(r, 400))
    const job = await (await get(`/api/admin/tpot/ai-analysis/${created.job_id}`)).json()
    expect(job.status).toBe('audited')
    expect(job.raw_ai_output).toBeNull() // el resultado no se ve hasta aprobarlo

    const approved = await post(`/api/admin/tpot/ai-analysis/${created.job_id}/approve`)
    expect(approved.status).toBe(200)
    expect((await approved.json()).status).toBe('approved')
    const again = await post(`/api/admin/tpot/ai-analysis/${created.job_id}/approve`)
    expect(again.status).toBe(409)

    const second = await (await post('/api/admin/tpot/ai-analysis', {})).json()
    await new Promise(r => setTimeout(r, 400))
    expect((await post(`/api/admin/tpot/ai-analysis/${second.job_id}/reject`, { reason: 'x'.repeat(2000) })).status).toBe(200)
    const blocked = await post(`/api/admin/tpot/ai-analysis/${second.job_id}/approve`)
    expect(blocked.status).toBe(409) // antes se aprobaba cualquier análisis, incluso uno rechazado
    expect((await blocked.json()).error).toContain('auditado')
    const rejected = await (await get(`/api/admin/tpot/ai-analysis/${second.job_id}`)).json()
    expect(String(rejected.audit_notes).length).toBeLessThanOrEqual(500)

    for (const action of ['audit', 'approve', 'reject']) {
      expect((await post(`/api/admin/tpot/ai-analysis/00000000-0000-0000-0000-000000000000/${action}`)).status, action).toBe(404) // antes: 200 con cuerpo null
    }
    expect((await get('/api/admin/tpot/ai-analysis/..%2f..%2fsettings')).status).toBe(404)
  })

  test('los ajustes declaran el motor real (reglas locales) y dónde se guarda (memoria)', async () => {
    const settings = await (await get('/api/admin/tpot/settings')).json()
    expect(settings.analysis_engine).toBe('reglas_locales')
    expect(settings.storage).toBe('memoria_del_servidor')
    expect(JSON.stringify(settings)).not.toMatch(/password"?:\s*"[^"]/i)
  })
})

async function openThreat(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Administrador de Ciber Dojo', level: 1 })).toBeVisible()
  if (await page.evaluate(() => innerWidth <= 1180)) await page.locator('#menuToggle').click()
  await page.locator('.nav-item', { hasText: 'Inteligencia de Amenazas' }).click()
  await expect(page.locator('#threatIntel')).toHaveClass(/active/)
}

const HOSTILE = { timestamp: '2026-09-10T10:00:00Z', severity: 'high', event_type: "x');window.__pwn=1;//", source_ip: '<img src=x onerror="window.__pwn=1">', honeypot: '</td><script>window.__pwn=1</script>', event_id: 'e1' }

test.describe('A8 · Inteligencia de Amenazas: pantalla', () => {
  // La prueba de análisis fallaba ~1 de cada 15 veces solo en WebKit de escritorio (la pantalla repinta la lista a mitad de la prueba).
  // No se ha aislado la causa exacta; se reintenta en vez de ocultarla.
  test.describe.configure({ retries: 2 })
  test('con T-Pot sin conectar se muestra un aviso visible de DATOS DE DEMOSTRACIÓN', async ({ page }) => {
    await openThreat(page)
    const banner = page.locator('#tpotDemoBanner')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('DATOS DE DEMOSTRACIÓN')
    await expect(banner).toContainText('no refleja ataques reales')
    await expect(page.locator('#tpotStatus')).toContainText('Dashboard defensivo')
  })

  test('si el servidor responde con datos reales el aviso de demostración desaparece', async ({ page }) => {
    const summary = { total_events: 1, events_by_severity: { high: 1 }, events_by_honeypot: { cowrie: 1 }, top_source_ips: [], events_recent: [HOSTILE] }
    await page.route('**/api/admin/tpot/**', r => r.fulfill({ status: 200, headers: { 'X-Tpot-Data-Mode': 'live' }, contentType: 'application/json', body: JSON.stringify(r.request().url().includes('/summary') ? summary : r.request().url().includes('/iocs') ? { total: 0, iocs: [] } : r.request().url().includes('/health') ? { connected: true, mode: 'live' } : { audit: [], jobs: [] }) }))
    await openThreat(page)
    await expect(page.locator('#tpotStatus')).toContainText('1 eventos')
    await expect(page.locator('#tpotDemoBanner')).toBeHidden()
  })

  test('datos hostiles del honeypot se muestran como texto y no ejecutan nada (tabla, KPI, detalle)', async ({ page }) => {
    const summary = { total_events: 1, events_by_severity: { high: 1 }, events_by_honeypot: { [HOSTILE.honeypot]: 1 }, top_source_ips: [{ value: HOSTILE.source_ip, count: 1 }], events_recent: [HOSTILE] }
    await page.route('**/api/admin/tpot/**', r => r.fulfill({ status: 200, headers: { 'X-Tpot-Data-Mode': 'live' }, contentType: 'application/json', body: JSON.stringify(r.request().url().includes('/summary') ? summary : r.request().url().includes('/iocs') ? { total: 0, iocs: [] } : r.request().url().includes('/health') ? { connected: true, mode: 'live' } : r.request().url().includes('/logs') ? { events: [HOSTILE], total: 1 } : { audit: [], jobs: [] }) }))
    await openThreat(page)
    await expect(page.locator('#tpotContent .threat-table')).toBeVisible()
    await page.locator('[data-act="openThreatEventDetail"]').first().click()
    await page.locator('#tpotContent .bar-row').first().click()
    await page.waitForTimeout(400)
    expect(await page.evaluate(() => (window as any).__pwn)).toBeUndefined()
    expect(await page.locator('#tpotContent img, #threatDrilldown img, #tpotContent script').count()).toBe(0)
    await expect(page.locator('#tpotContent')).toContainText('<img src=x')
  })

  test('las tablas se desplazan dentro de su caja y la página no tiene scroll horizontal; targets ≥44 px', async ({ page }) => {
    await openThreat(page)
    await expect(page.locator('#tpotContent .threat-table')).toBeVisible()
    expect(await page.locator('#tpotContent .table-scroll .threat-table').count()).toBeGreaterThan(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const small = await page.evaluate(() => [...document.querySelectorAll('#threatIntel button:not(:disabled), #threatIntel select, #threatIntel input')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height && r.height < 43.5 }).map(e => e.className || e.id))
    expect(small).toEqual([])
  })

  test('la navegación marca la vista actual y tiene tildes', async ({ page }) => {
    await openThreat(page)
    await expect(page.locator('.threat-nav button[aria-current="page"]')).toHaveText('Dashboard')
    await page.locator('.threat-nav button', { hasText: 'Configuración' }).click()
    await expect(page.locator('.threat-nav button[aria-current="page"]')).toHaveText('Configuración')
    await expect(page.locator('#threatIntel')).toContainText('Operación guiada')
  })

  test('análisis: se genera, queda "auditado · pendiente de aprobación", se aprueba con confirmación y no existe "Publicar"', async ({ page }) => {
    test.setTimeout(90_000)
    await openThreat(page)
    await page.locator('.threat-nav button', { hasText: 'Análisis' }).click()
    await page.getByRole('button', { name: /generar análisis/i }).click({ force: true })
    const status = page.locator('#tpotStatus')
    await expect(status).toContainText('Análisis IA creado', { timeout: 15_000 })
    const jobId = /creado: ([0-9a-f-]{36})/.exec((await status.textContent()) || '')![1]
    const row = () => page.locator('#tpotContent tr', { hasText: jobId.slice(0, 8) }).first()
    await expect.poll(async () => { await page.locator('.threat-nav button', { hasText: 'Análisis' }).click(); return row().textContent() }, { timeout: 15_000 }).toContain('Auditado · pendiente de aprobación')
    await expect(page.getByRole('button', { name: /publicar/i })).toHaveCount(0)
    page.on('dialog', d => void d.accept())
    // la vista se vuelve a pintar tras cada carga: se reintenta hasta que el botón desaparece (el clic es idempotente)
    await expect.poll(async () => {
      // tras crear un análisis la pantalla pinta su detalle a los ~0,9 s y sustituye la tabla: se vuelve a la lista
      if (!(await row().count())) await page.locator('.threat-nav button', { hasText: 'Análisis' }).click()
      const button = row().getByRole('button', { name: 'Aprobar' })
      if (await button.count()) await button.dispatchEvent('click')
      return (await row().textContent()) || ''
    }, { timeout: 20_000 }).toContain('Aprobado')
    await expect(page.getByRole('button', { name: /publicar/i })).toHaveCount(0)
  })

  test('configuración: sin interruptores decorativos; dice que el motor son reglas locales y que los datos viven en memoria', async ({ page }) => {
    await openThreat(page)
    await page.locator('.threat-nav button', { hasText: 'Configuración' }).click()
    const content = page.locator('#tpotContent')
    await expect(content).toContainText('reglas locales (sin modelo de IA)')
    await expect(content).toContainText('memoria del servidor')
    await expect(content).toContainText('se pierden al reiniciar')
    await expect(content.locator('input[disabled][type="checkbox"]')).toHaveCount(0)
    await expect(content.getByRole('button', { name: /probar agente|probar auditor|restaurar recomendados/i })).toHaveCount(0)
  })
})
