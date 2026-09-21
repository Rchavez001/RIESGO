import { test, expect, Page } from '@playwright/test'

async function openNews(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Administrador de Ciber Dojo', level: 1 })).toBeVisible()
  if (await page.evaluate(() => innerWidth <= 1180)) await page.locator('#menuToggle').click()
  await page.locator('.nav-item', { hasText: 'Agente noticias' }).click()
  await expect(page.locator('#newsAgent')).toHaveClass(/active/)
}

const GENERATED = [
  { id: 'g1', dojo_id: 'd', question_text: 'Pregunta segura', answer_text: 'R', explanation: 'E', kata_label: 'K', difficulty: 2, audit_status: 'pending', active: false, source_url: 'https://example.com/noticia', source_title: 'Noticia buena', extracted_at: '2026-09-10T10:00:00Z' },
  { id: 'g2', dojo_id: 'd', question_text: 'Pregunta con enlace hostil', answer_text: 'R', explanation: 'E', kata_label: 'K', difficulty: 2, audit_status: 'pending', active: false, source_url: 'javascript:window.__pwn=1', source_title: 'Clic aquí', extracted_at: '2026-09-10T10:00:00Z' },
]

async function withData(page: Page) {
  await page.route('**/api/rest/v1/questions?select=*source_type=eq.news_generated*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(GENERATED) }))
  await page.route('**/api/rest/v1/cyber_news_sources?select=*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 's1', name: 'Fuente <b>x</b>', url: 'https://example.com/feed', enabled: true, priority: 10 }]) }))
}

test.describe('A5 · Agente noticias', () => {
  test('textos con tildes y Puter.js no se carga hasta que se usa', async ({ page }) => {
    await openNews(page)
    await expect(page.locator('#newsAgent')).toContainText('Última ejecución')
    await expect(page.locator('#newsAgent')).toContainText('Guardar configuración')
    await expect(page.locator('#newsAgent')).toContainText('Historial de ejecuciones')
    expect(await page.evaluate(() => typeof (window as any).puter)).toBe('undefined')
    expect(await page.locator('script[src*="puter"]').count()).toBe(0)
  })

  test('un enlace de fuente con javascript: no es un enlace; los https sí; nada se ejecuta', async ({ page }) => {
    await withData(page)
    await openNews(page)
    const rows = page.locator('#newsGeneratedReport .news-generated-row')
    await expect(rows).toHaveCount(2)
    await expect(rows.nth(0).locator('a')).toHaveAttribute('href', 'https://example.com/noticia')
    await expect(rows.nth(0).locator('a')).toHaveAttribute('rel', /noopener/)
    await expect(rows.nth(1).locator('a')).toHaveCount(0)
    await expect(rows.nth(1)).toContainText('enlace no seguro')
    expect(await page.evaluate(() => (window as any).__pwn)).toBeUndefined()
  })

  test('agregar fuente: se rechazan javascript:, localhost, IP privada y metadatos de la nube; una URL pública se envía', async ({ page }) => {
    await withData(page)
    const posts: string[] = []
    await page.route('**/api/rest/v1/cyber_news_sources', r => {
      if (r.request().method() === 'POST') { posts.push(r.request().postData() || ''); return r.fulfill({ status: 201, body: '' }) }
      return r.fallback()
    })
    await openNews(page)
    for (const bad of ['javascript:alert(1)', 'http://localhost:8080/admin', 'http://169.254.169.254/latest/meta-data/', 'http://192.168.1.10/', 'http://[::1]/', 'file:///etc/passwd']) {
      await page.locator('#newsSourceName').fill('Prueba')
      await page.locator('#newsSourceUrl').fill(bad)
      await page.locator('#addNewsSource').click()
      await expect(page.getByText(/La URL de la fuente no es válida/).last()).toBeVisible()
    }
    expect(posts).toEqual([])
    await page.locator('#newsSourceUrl').fill('https://www.bleepingcomputer.com/feed/')
    await page.locator('#addNewsSource').click()
    await expect.poll(() => posts.length).toBe(1)
    expect(JSON.parse(posts[0]).url).toBe('https://www.bleepingcomputer.com/feed/')
  })

  test('las fuentes de la base se muestran como texto', async ({ page }) => {
    await withData(page)
    await openNews(page)
    await expect(page.locator('#newsSourceList')).toContainText('Fuente <b>x</b>')
    expect(await page.locator('#newsSourceList b').count()).toBe(0)
  })

  test('contenido manual: URL interna, archivo enorme o texto gigante se rechazan antes de enviarse', async ({ page }) => {
    test.setTimeout(90_000) // subir 11 MB en WebKit móvil es lento
    let calls = 0
    await page.route('**/api/functions/v1/quiz-generator', r => { calls++; return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }) })
    await openNews(page)
    await page.locator('#manualContentUrl').fill('http://10.0.0.5/secret')
    await page.locator('#manualContentGenerate').click({ force: true }) // WebKit móvil: el botón se desplaza al aparecer el estado
    await expect(page.locator('#manualContentStatus')).toContainText('La URL no es válida')
    await page.locator('#manualContentUrl').fill('')
    // el archivo se crea dentro de la página: transferir 11 MB por el protocolo satura WebKit móvil
    await page.evaluate(() => {
      const dt = new DataTransfer()
      dt.items.add(new File([new ArrayBuffer(11 * 1024 * 1024)], 'grande.pdf', { type: 'application/pdf' }))
      ;(document.querySelector('#manualContentFile') as HTMLInputElement).files = dt.files
    })
    await page.locator('#manualContentGenerate').click({ force: true }) // WebKit móvil: el botón se desplaza al aparecer el estado
    await expect(page.locator('#manualContentStatus')).toContainText('el máximo es 10 MB')
    await page.evaluate(() => { (document.querySelector('#manualContentFile') as HTMLInputElement).value = '' })
    await page.evaluate(() => { (document.querySelector('#manualContentText') as HTMLTextAreaElement).value = 'x'.repeat(60001) }) // fill() de 60 kB desestabiliza el scroll en WebKit móvil
    await page.locator('#manualContentGenerate').click({ force: true }) // WebKit móvil: el botón se desplaza al aparecer el estado
    await expect(page.locator('#manualContentStatus')).toContainText('el máximo es 60.000')
    expect(calls).toBe(0)
  })

  test('nuevo proveedor: base URL http/local/privada bloqueada; https público, identificador y clave válidos se envían', async ({ page }) => {
    const calls: Array<Record<string, unknown>> = []
    await page.route('**/api/functions/v1/save-provider-key', r => { calls.push(JSON.parse(r.request().postData() || '{}')); return r.fulfill({ status: 200, contentType: 'application/json', body: '{"saved":true}' }) })
    await openNews(page)
    await page.locator('#newsProviderAddNew').click()
    const status = page.locator('#newsProviderFormStatus')
    await page.locator('#npKey').fill('mi-proveedor')
    await page.locator('#npLabel').fill('Mi proveedor')
    await page.locator('#npModel').fill('modelo-1')
    await page.locator('#npApiKey').fill('clave-de-prueba-larga-123')
    for (const bad of ['http://api.ejemplo.com/v1', 'https://localhost/v1', 'https://169.254.169.254/', 'https://10.1.2.3/']) {
      await page.locator('#npBaseUrl').fill(bad)
      await page.locator('#npSave').click()
      await expect(status).toContainText('Base URL no permitida')
    }
    expect(calls).toEqual([])
    await page.locator('#npKey').fill('Mi Proveedor!')
    await page.locator('#npBaseUrl').fill('https://api.ejemplo.com/v1')
    await page.locator('#npSave').click()
    await expect(status).toContainText('minúsculas, números y guiones')
    await page.locator('#npKey').fill('mi-proveedor')
    await page.locator('#npApiKey').fill('corta')
    await page.locator('#npSave').click()
    await expect(status).toContainText('parece incompleta')
    await page.locator('#npApiKey').fill('clave-de-prueba-larga-123')
    await page.locator('#npSave').click()
    await expect.poll(() => calls.length).toBe(1)
    expect(calls[0]).toMatchObject({ provider_key: 'mi-proveedor', base_url: 'https://api.ejemplo.com/v1', provider_type: 'chat_completion' })
  })

  test('proveedores: la clave nunca se pone en el campo, el interruptor tiene nombre y guardar exige longitud', async ({ page }) => {
    await page.route('**/api/rest/v1/ai_providers?select=*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ provider_key: 'claude', label: 'Claude', provider_type: 'messages', model_name: 'm', active: true, default_timeout_seconds: 30, api_key_secret_id: 's1' }]) }))
    let calls = 0
    await page.route('**/api/functions/v1/save-provider-key', r => { calls++; return r.fulfill({ status: 200, contentType: 'application/json', body: '{"saved":true}' }) })
    await openNews(page)
    const input = page.locator('#newsProviderList .news-provider-key-input')
    await expect(input).toHaveValue('')
    await expect(input).toHaveAttribute('placeholder', /Clave guardada/)
    await expect(page.getByRole('checkbox', { name: 'Proveedor Claude activo' })).toBeChecked()
    await input.fill('abc')
    await page.locator('#newsProviderList .news-provider-key-save').click()
    await expect(page.getByText(/parece incompleta/).last()).toBeVisible()
    expect(calls).toBe(0)
  })

  test('sin scroll horizontal y con botones ≥44 px', async ({ page }) => {
    await withData(page)
    await openNews(page)
    await expect(page.locator('#newsGeneratedReport .news-generated-row')).toHaveCount(2)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const small = await page.evaluate(() => [...document.querySelectorAll('#newsAgent button:not(:disabled)')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height < 43.5 }).map(e => e.id || e.className))
    expect(small).toEqual([])
  })
})
