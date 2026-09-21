import { test, expect, Page } from '@playwright/test'
import { signedIn } from './auth-fixture'
import { settle } from './helpers'

const ua = (page: Page) => page.evaluate(() => navigator.userAgent)
const isAndroid = async (page: Page) => /android/i.test(await ua(page))
const isIos = async (page: Page) => /iphone|ipad/i.test(await ua(page))

// The PWA prompt only exists on phones/tablets (iOS and Android user agents) and appears 4 s after load.
async function openPublic(page: Page) {
  await page.goto('/')
  const dialog = page.getByRole('dialog', { name: 'Instalar Ciber Dojo' })
  return dialog
}

test.describe('PWAInstallPrompt', () => {
  test('aparece tras unos segundos como diálogo modal y toma el foco (solo móviles)', async ({ page }) => {
    await page.goto('/')
    test.skip(!(await isAndroid(page)) && !(await isIos(page)), 'solo iOS/Android')
    const dialog = page.getByRole('dialog', { name: 'Instalar Ciber Dojo' })
    await expect(dialog).toBeVisible({ timeout: 12_000 })
    await expect(dialog).toHaveAttribute('aria-modal', 'true')
    await expect(dialog).toBeFocused()
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const small = await dialog.evaluate(el => [...el.querySelectorAll('button')].filter(b => b.getBoundingClientRect().height < 43.5).map(b => `${b.textContent?.trim() || b.getAttribute('aria-label')} ${Math.round(b.getBoundingClientRect().height)}px`))
    expect(small).toEqual([])
  })

  test('Escape lo cierra, devuelve el scroll y no vuelve a molestar (se recuerda 14 días)', async ({ page }) => {
    await page.goto('/')
    test.skip(!(await isAndroid(page)) && !(await isIos(page)), 'solo iOS/Android')
    const dialog = page.getByRole('dialog', { name: 'Instalar Ciber Dojo' })
    await expect(dialog).toBeVisible({ timeout: 12_000 })
    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0, { timeout: 15_000 })
    await expect.poll(() => page.evaluate(() => document.body.style.overflow)).not.toBe('hidden') // se libera al terminar la animación de salida
    const until = Number(await page.evaluate(() => localStorage.getItem('_pwa_hidden_until')))
    expect(until - Date.now()).toBeGreaterThan(13 * 86_400_000)
    await page.reload()
    await page.waitForTimeout(5500)
    await expect(page.getByRole('dialog', { name: 'Instalar Ciber Dojo' })).toHaveCount(0)
  })

  test('el foco no sale del diálogo con Tab', async ({ page }) => {
    await page.goto('/')
    test.skip(!(await isAndroid(page)) && !(await isIos(page)), 'solo iOS/Android')
    const dialog = page.getByRole('dialog', { name: 'Instalar Ciber Dojo' })
    await expect(dialog).toBeVisible({ timeout: 12_000 })
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab')
      expect(await page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'))).toBe(true)
    }
  })

  test('no aparece mientras la persona escribe en un formulario', async ({ page }) => {
    await page.goto('/login')
    test.skip(!(await isAndroid(page)) && !(await isIos(page)), 'solo iOS/Android')
    const field = page.locator('input').first()
    await field.focus()
    await page.waitForTimeout(6000)
    await expect(page.getByRole('dialog', { name: 'Instalar Ciber Dojo' })).toHaveCount(0)
    await expect(field).toBeFocused()
  })

  test('Android: si el aviso nativo llega con el diálogo ya abierto, aparece el botón de instalar', async ({ page }) => {
    await page.goto('/')
    test.skip(!(await isAndroid(page)), 'solo Android')
    const dialog = page.getByRole('dialog', { name: 'Instalar Ciber Dojo' })
    await expect(dialog).toBeVisible({ timeout: 12_000 })
    await expect(dialog.getByRole('button', { name: /instalar en este dispositivo/i })).toHaveCount(0)
    await page.evaluate(() => {
      const e = new Event('beforeinstallprompt', { cancelable: true }) as Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> }
      e.prompt = async () => {}
      e.userChoice = Promise.resolve({ outcome: 'dismissed' })
      window.dispatchEvent(e)
    })
    await expect(dialog.getByRole('button', { name: /instalar en este dispositivo/i })).toBeVisible()
  })

  test('en escritorio no hay aviso', async ({ page }) => {
    await page.goto('/')
    test.skip((await isAndroid(page)) || (await isIos(page)), 'solo escritorio')
    await page.waitForTimeout(5500)
    await expect(page.getByRole('dialog', { name: 'Instalar Ciber Dojo' })).toHaveCount(0)
  })
})

test.describe('PageTransition: cambio de ruta', () => {
  test('tras navegar dentro de la app el foco pasa al contenido nuevo (no se queda en el enlace pulsado)', async ({ page }) => {
    await signedIn(page)
    await page.goto('/dashboard')
    await settle(page, 'main')
    const more = page.getByRole('button', { name: 'Más' })
    if (await more.isVisible()) await more.click() // en móvil los enlaces están en el cajón
    const link = page.locator('a[href="/dojos"]:visible').first()
    await link.click()
    await expect(page).toHaveURL(/\/dojos$/)
    await expect(page.locator('#contenido')).toBeFocused()
  })
})
