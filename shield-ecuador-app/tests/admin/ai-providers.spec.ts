import { test, expect, Page } from '@playwright/test'

const SECRET = 'sk-test-SUPER-SECRET-1234567890'

async function openAi(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Administrador de Ciber Dojo', level: 1 })).toBeVisible()
  if (await page.evaluate(() => innerWidth <= 1180)) await page.locator('#menuToggle').click()
  await page.locator('.nav-item', { hasText: 'IA y auditoría' }).click()
  await expect(page.locator('#ai')).toHaveClass(/active/)
}

const captureKeyCalls = async (page: Page, status = 200, body: unknown = { provider_key: 'x', saved: true }) => {
  const calls: Array<Record<string, unknown>> = []
  await page.route('**/api/functions/v1/save-provider-key', r => { calls.push(JSON.parse(r.request().postData() || '{}')); return r.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) }) })
  return calls
}

test.describe('A4 · IA y auditoría', () => {
  test('lista los proveedores reales con su estado y sin mostrar nunca una clave', async ({ page }) => {
    await openAi(page)
    const cards = page.locator('#aiProviders .ai-provider')
    await expect(cards).toHaveCount(3)
    await expect(cards.first()).toContainText('Claude <b>x</b>') // como texto
    expect(await page.locator('#aiProviders b').count()).toBe(0)
    await expect(cards.nth(0)).toContainText('clave guardada')
    await expect(cards.nth(1)).toContainText('sin clave')
    await expect(cards.nth(2)).toContainText('inactivo')
    await expect(page.locator('#aiProvidersNote')).toContainText('3 proveedores. 2 con clave guardada.')
    // ni valor ni máscara en el DOM: el campo siempre está vacío
    for (const v of await page.locator('#aiProviders input').evaluateAll(els => els.map(e => (e as HTMLInputElement).value))) expect(v).toBe('')
  })

  test('ya no finge: sin "Probar algoritmo", sin "Modo local" y sin instrucciones que no se guardan', async ({ page }) => {
    await openAi(page)
    await expect(page.getByRole('button', { name: /probar algoritmo/i })).toHaveCount(0)
    await expect(page.getByRole('button', { name: /agregar ia/i })).toHaveCount(0)
    await expect(page.locator('#ai')).not.toContainText('Modo local')
    await expect(page.locator('#ai textarea')).toHaveCount(0)
    await expect(page.locator('#ai')).toContainText('Supabase Vault')
  })

  test('guardar una clave: solo viajan el id del proveedor y la clave; el campo se vacía; la clave no queda en ningún sitio', async ({ page }) => {
    const calls = await captureKeyCalls(page)
    await openAi(page)
    const card = page.locator('#aiProviders .ai-provider').nth(1)
    await card.locator('input[type="password"]').fill(SECRET)
    await card.getByRole('button', { name: 'Guardar clave' }).click()
    await expect.poll(() => calls.length).toBe(1)
    expect(calls[0]).toEqual({ provider_key: 'deepseek', api_key: SECRET })
    await expect(page.getByText(/Clave guardada de forma cifrada/)).toBeVisible()
    for (const v of await page.locator('#aiProviders input').evaluateAll(els => els.map(e => (e as HTMLInputElement).value))) expect(v).toBe('')
    expect(await page.evaluate(() => JSON.stringify({ ...localStorage }))).not.toContain(SECRET)
    expect(await page.content()).not.toContain(SECRET)
  })

  test('una clave demasiado corta no se envía', async ({ page }) => {
    const calls = await captureKeyCalls(page)
    await openAi(page)
    const card = page.locator('#aiProviders .ai-provider').nth(1)
    await card.locator('input[type="password"]').fill('abc')
    await card.getByRole('button', { name: 'Guardar clave' }).click()
    await expect(page.getByText(/parece incompleta/)).toBeVisible()
    expect(calls).toEqual([])
  })

  test('si el servidor rechaza la clave: se avisa con el mensaje del servidor y sin repetir la clave', async ({ page }) => {
    await captureKeyCalls(page, 403, { error: 'Admin role required' })
    await openAi(page)
    const card = page.locator('#aiProviders .ai-provider').nth(0)
    await card.locator('input[type="password"]').fill(SECRET)
    await card.getByRole('button', { name: 'Reemplazar clave' }).click()
    await expect(page.getByText('No se pudo guardar la clave: Admin role required')).toBeVisible()
    expect(await page.content()).not.toContain(SECRET)
  })

  test('los campos de clave son de tipo contraseña, con etiqueta accesible y ≥44 px; sin desbordes', async ({ page }) => {
    await openAi(page)
    const inputs = page.locator('#aiProviders input')
    await expect(inputs).toHaveCount(3)
    for (let i = 0; i < 3; i++) {
      await expect(inputs.nth(i)).toHaveAttribute('type', 'password')
      await expect(inputs.nth(i)).toHaveAttribute('autocomplete', 'new-password')
    }
    await expect(page.getByLabel(/Nueva clave de API para DeepSeek/)).toBeAttached()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const small = await page.evaluate(() => [...document.querySelectorAll('#ai button, #ai input')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height < 43.5 }).length)
    expect(small).toBe(0)
  })

  test('si no se pueden leer los proveedores: aviso y sin lista', async ({ page }) => {
    await page.route('**/api/rest/v1/ai_providers*', r => r.fulfill({ status: 500, body: 'boom' }))
    await openAi(page)
    await expect(page.locator('#aiProvidersNote')).toContainText('No se pudieron leer los proveedores')
    await expect(page.locator('#aiProviders .ai-provider')).toHaveCount(0)
  })
})
