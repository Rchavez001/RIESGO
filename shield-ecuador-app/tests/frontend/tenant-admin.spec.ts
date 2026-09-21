import { test, expect, Page } from '@playwright/test'
import { signedIn } from './auth-fixture'
import { settle } from './helpers'

const isMobile = (page: Page) => page.evaluate(() => innerWidth <= 820)

async function openTenant(page: Page) {
  await signedIn(page, { role: 'admin', name: 'Admin Ciber Dojo' })
  await page.goto('/tenant-admin')
  await expect(page.getByRole('heading', { name: /operaciones saas/i })).toBeVisible()
  await settle(page, '.tenant-workspace')
}

test.describe('/tenant-admin (prototipo)', () => {
  test('un usuario que no es administrador no ve la pantalla', async ({ page }) => {
    await signedIn(page, { role: 'user' })
    await page.goto('/tenant-admin')
    await expect(page.getByRole('heading', { name: /operaciones saas/i })).toHaveCount(0)
    await expect(page).not.toHaveURL(/tenant-admin/)
  })

  test('avisa que es un prototipo y no simula que guarda', async ({ page }) => {
    await openTenant(page)
    await expect(page.getByRole('note')).toContainText(/vista de prototipo/i)
    await page.getByRole('button', { name: 'Guardar cambios' }).click()
    const status = page.locator('.tenant-message')
    await expect(status).toContainText(/prototipo/i)
    await expect(status).not.toContainText(/configuración guardada|guardada para/i)
    await page.getByRole('button', { name: 'Generar preguntas IA' }).click()
    await expect(status).toContainText(/no se generó nada/i)
  })

  test('sin scroll horizontal de la página, botones activos ≥44px y controles sin función deshabilitados', async ({ page }) => {
    await openTenant(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const small = await page.evaluate(() => [...document.querySelectorAll('.tenant-admin button:not(:disabled), .tenant-admin select, .tenant-admin input:not([type="checkbox"])')]
      .filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height < 43.5 })
      .map(e => `${e.className || e.tagName} ${Math.round(e.getBoundingClientRect().height)}px`))
    expect(small).toEqual([])
    await expect(page.getByRole('button', { name: 'Nuevo' })).toBeDisabled()
    await expect(page.getByRole('button', { name: /base de datos/i })).toBeDisabled()
  })

  test('elegir un inquilino lo marca (aria-pressed) y cambia el detalle; los números se limitan al rango', async ({ page }) => {
    await openTenant(page)
    const andes = page.getByRole('button', { name: /andes tech/i })
    await andes.click()
    await expect(andes).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('heading', { name: 'Andes Tech', level: 2 })).toBeVisible()
    const base = page.getByRole('spinbutton', { name: 'Preguntas base por dojo' })
    await base.fill('0')
    await expect(base).toHaveValue('1') // antes "0" se convertía en 10 sin avisar
    await base.fill('999')
    await expect(base).toHaveValue('50')
  })

  test('la lista de verificación refleja el formulario en lugar de estar siempre marcada', async ({ page }) => {
    await openTenant(page)
    const item = page.locator('.tenant-checklist label', { hasText: /Prompt generador configurado/ }).locator('input')
    await expect(item).toBeChecked()
    await page.getByRole('textbox', { name: 'Prompt de generación' }).fill('')
    await expect(item).not.toBeChecked()
  })
})

test.describe('AdminShell (administrador en pantallas de la app)', () => {
  async function openShell(page: Page) {
    await signedIn(page, { role: 'admin', name: 'Admin Ciber Dojo' })
    await page.goto('/perfil')
    await expect(page.getByRole('heading', { name: 'Mi perfil', level: 1 })).toBeVisible()
    await settle(page, '.adm-content')
  }

  test('enlace para saltar al contenido, punto de referencia main y objetivos ≥44px', async ({ page }) => {
    await openShell(page)
    await expect(page.getByRole('main')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Saltar al contenido' })).toBeAttached()
    await expect(page.getByRole('link', { name: 'Panel de administración' })).toBeAttached()
    const small = await page.evaluate(() => [...document.querySelectorAll('.adm-shell a.adm-nav-item, .adm-shell button')]
      .filter(e => !e.closest('[inert]'))
      .filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height < 43.5 })
      .map(e => `${e.className} ${Math.round(e.getBoundingClientRect().height)}px`))
    expect(small).toEqual([])
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })

  test('menú en teléfono: cerrado es inerte, abrir enfoca dentro, Escape cierra y devuelve el foco', async ({ page }) => {
    await openShell(page)
    test.skip(!(await isMobile(page)), 'solo teléfonos/tablets pequeñas')
    const side = page.locator('#adm-sidebar')
    const menu = page.getByRole('button', { name: 'Abrir menú de administración' })
    await expect(side).toHaveAttribute('inert', '')
    await expect(menu).toHaveAttribute('aria-expanded', 'false')
    await menu.click()
    const close = page.getByRole('button', { name: 'Cerrar menú de administración' })
    await expect(close).toHaveAttribute('aria-expanded', 'true')
    await expect(side).not.toHaveAttribute('inert', '')
    await expect(side.locator('a, button').first()).toBeFocused()
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden')
    await page.keyboard.press('Escape')
    await expect(side).toHaveAttribute('inert', '')
    await expect(page.getByRole('button', { name: 'Abrir menú de administración' })).toBeFocused()
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
  })

  test('"Ver como usuario" lleva a la app de usuario', async ({ page }) => {
    await openShell(page)
    if (await isMobile(page)) await page.getByRole('button', { name: 'Abrir menú de administración' }).click()
    await page.getByRole('button', { name: 'Ver como usuario' }).click()
    await expect(page).toHaveURL(/\/dashboard$/)
  })
})
