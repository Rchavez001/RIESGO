import { test, expect, Page } from '@playwright/test'

const SUMMARY = { total: 86, authorized: 82, new_30d: 80, admins: 1, onboarded: 0, by_belt: { white: 85, yellow: 1 }, by_role: { user: 85, admin: 1 } }
const row = (n: number, over: Record<string, unknown> = {}) => ({ id: `u${String(n).padStart(7, '0')}-1111-2222-3333-444444444444`, belt: 'white', role: 'user', total_points: 10 * n, sector: 'comercio', email_domain: `empresa${n}.com.ec`, created_at: '2026-09-01T10:00:00Z', last_evaluation_at: null, data_processing_authorized: true, ...over })

async function setup(page: Page, total = 86) {
  const seen: string[] = []
  await page.route('**/api/rest/v1/rpc/admin_user_summary', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SUMMARY) }))
  await page.route('**/api/rest/v1/users?*', r => {
    const url = r.request().url()
    seen.push(url)
    const offset = Number(/offset=(\d+)/.exec(url)?.[1] ?? 0)
    const rows = Array.from({ length: Math.min(25, total - offset) }, (_, i) => row(offset + i + 1, i === 0 ? { email_domain: '<b>x</b>.com', sector: '<i>s</i>', data_processing_authorized: false, role: 'admin', belt: 'yellow' } : {}))
    return r.fulfill({ status: 200, headers: { 'Content-Range': `${offset}-${offset + rows.length - 1}/${total}` }, contentType: 'application/json', body: JSON.stringify(rows) })
  })
  return seen
}

async function openUsers(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Administrador de Ciber Dojo', level: 1 })).toBeVisible()
  if (await page.evaluate(() => innerWidth <= 1180)) await page.locator('#menuToggle').click()
  await page.locator('.nav-item', { hasText: /^Usuarios$/ }).click()
  await expect(page.locator('#users')).toHaveClass(/active/)
}

test.describe('A12 · Usuarios', () => {
  test('las cifras y la lista son reales; ya no aparecen las tres personas inventadas', async ({ page }) => {
    await setup(page)
    await openUsers(page)
    await expect(page.locator('#userMetricTotal')).toHaveText('86')
    await expect(page.locator('#userMetricNew')).toHaveText('80')
    await expect(page.locator('#userMetricAuthorized')).toHaveText('82')
    await expect(page.locator('#userMetricAdmins')).toHaveText('1')
    await expect(page.locator('#userRows tr')).toHaveCount(25)
    await expect(page.locator('#userPageInfo')).toContainText('Mostrando 1–25 de 86')
    for (const fake of ['Ana Paredes', 'Luis Mora', 'Rosa Vera']) await expect(page.locator('#users')).not.toContainText(fake)
    await expect(page.locator('#userBelts')).toContainText('blanco')
    await expect(page.locator('#userBelts')).toContainText('85 personas')
  })

  test('no hay botón de "dar de baja" simulado y el panel explica la privacidad', async ({ page }) => {
    await setup(page)
    await openUsers(page)
    await expect(page.getByRole('button', { name: /dar de baja/i })).toHaveCount(0)
    await expect(page.locator('#users')).not.toContainText('Maqueta')
    await expect(page.locator('#users')).toContainText('cifrados')
    await expect(page.locator('#users')).toContainText('identificador corto')
  })

  test('la lista solo pide campos no identificativos (sin nombre, correo ni teléfono)', async ({ page }) => {
    const seen = await setup(page)
    await openUsers(page)
    await expect.poll(() => seen.some(u => u.includes('order=created_at'))).toBe(true)
    const select = decodeURIComponent(/select=([^&]+)/.exec(seen.find(u => u.includes('order=created_at'))!)![1])
    expect(select).not.toMatch(/email(?!_domain)|full_name|phone|location|encrypted|birthdate/)
    expect(select).toContain('email_domain')
  })

  test('cada fila muestra el identificador corto, nunca el completo, y los datos como texto', async ({ page }) => {
    await setup(page)
    await openUsers(page)
    const first = page.locator('#userRows tr').first()
    await expect(first).toContainText('u0000001')
    expect(await page.locator('#userRows').innerHTML()).not.toContain('u0000001-1111')
    await expect(first).toContainText('<b>x</b>.com')
    expect(await page.locator('#userRows b, #userRows i').count()).toBe(0)
    await expect(first).toContainText('administrador')
    await expect(first).toContainText('amarillo')
    await expect(first.locator('td').last()).toHaveText('No')
  })

  test('paginación y filtros piden lo correcto', async ({ page }) => {
    const seen = await setup(page)
    await openUsers(page)
    await expect(page.locator('#userRows tr')).toHaveCount(25)
    await page.locator('#userNext').click()
    await expect(page.locator('#userPageInfo')).toContainText('Mostrando 26–50 de 86')
    await expect(page.locator('#userPrev')).toBeEnabled()
    await page.locator('#userFilterBelt').selectOption('yellow')
    await expect.poll(() => seen.some(u => u.includes('belt=eq.yellow') && u.includes('offset=0'))).toBe(true)
    await page.locator('#userFilterRole').selectOption('admin')
    await expect.poll(() => seen.some(u => u.includes('belt=eq.yellow') && u.includes('role=eq.admin'))).toBe(true)
  })

  test('si falla: avisos claros y sin cifras inventadas', async ({ page }) => {
    await page.route('**/api/rest/v1/rpc/admin_user_summary', r => r.fulfill({ status: 500, body: 'boom' }))
    await page.route('**/api/rest/v1/users?*', r => r.fulfill({ status: 500, body: 'boom' }))
    await openUsers(page)
    await expect(page.locator('#usersNote')).toContainText('No se pudo leer el resumen')
    await expect(page.locator('#userMetricTotal')).toHaveText('—')
    await expect(page.locator('#userRows')).toContainText('No se pudo cargar la lista')
  })

  test('la tabla tiene encabezados con scope, no desborda la página y los controles miden ≥44 px', async ({ page }) => {
    await setup(page)
    await openUsers(page)
    await expect(page.locator('#userRows tr')).toHaveCount(25)
    await expect(page.getByRole('columnheader', { name: 'Autorizó datos' })).toBeAttached()
    await expect(page.getByRole('rowheader').first()).toBeAttached()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const small = await page.evaluate(() => [...document.querySelectorAll('#users button:not(:disabled), #users select')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height < 43.5 }).map(e => e.id))
    expect(small).toEqual([])
  })
})
