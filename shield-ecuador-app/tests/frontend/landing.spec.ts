import { test, expect } from '@playwright/test'
import { signedIn } from './auth-fixture'

test.describe('landing /', () => {
  test.beforeEach(async ({ page }) => {
    // El aviso de instalar la PWA (fila 20) sale sobre la página a los pocos segundos; aquí se aísla.
    await page.addInitScript(() => localStorage.setItem('_pwa_hidden_until', String(Date.now() + 86_400_000)))
    await page.goto('/')
    await page.waitForLoadState('networkidle')
  })

  test('elementos interactivos de header y hero miden ≥44px', async ({ page }) => {
    const small = await page.evaluate(() => {
      const out: string[] = []
      document.querySelectorAll('.cinema-header a, .cinema-hero a, .cinema-hero button').forEach(el => {
        const r = el.getBoundingClientRect()
        if (r.width && r.height && (r.height < 43.5 || r.width < 43.5)) out.push(`${el.className || el.tagName} ${Math.round(r.width)}x${Math.round(r.height)}`)
      })
      return out
    })
    expect(small).toEqual([])
  })

  test('el CTA principal se ve sin hacer scroll en móvil vertical', async ({ page, viewport }) => {
    test.skip(!viewport || viewport.width > 700 || viewport.width > viewport.height, 'solo móvil vertical')
    const top = await page.locator('.cinema-actions .cinema-button').first().evaluate(e => e.getBoundingClientRect().top)
    // El alto real visible en Safari iOS es ~50–110px menor que el viewport emulado (barras del navegador).
    expect(top).toBeLessThan(viewport!.height - 60)
  })

  test('el botón del video del Sensei también se ve sin hacer scroll en móvil vertical', async ({ page, viewport }) => {
    // El titular + párrafo + botones + este botón + el aviso de abajo suman más alto que el
    // viewport en un teléfono corto (ej. iPhone SE) si el espaciado no es lo bastante compacto.
    test.skip(!viewport || viewport.width > 700 || viewport.width > viewport.height, 'solo móvil vertical')
    const top = await page.locator('.cinema-sensei-video-btn').evaluate(e => e.getBoundingClientRect().top)
    expect(top).toBeLessThan(viewport!.height - 60)
  })

  test('en móvil horizontal el titular y el CTA aparecen en la primera pantalla o a un scroll', async ({ page, viewport }) => {
    test.skip(!viewport || viewport.height > 520 || viewport.width < viewport.height, 'solo móvil horizontal')
    const { headerH, ctaBottom } = await page.evaluate(() => ({
      headerH: document.querySelector('.cinema-header')!.getBoundingClientRect().height,
      ctaBottom: document.querySelector('.cinema-actions')!.getBoundingClientRect().bottom,
    }))
    expect(headerH).toBeLessThanOrEqual(70)
    expect(ctaBottom).toBeLessThanOrEqual(viewport!.height * 1.5)
  })

  test('modal del video: diálogo accesible, Esc cierra y devuelve el foco', async ({ page, viewport }) => {
    const trigger = page.locator('.cinema-sensei-video-btn')
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: /primer consejo/i })
    await expect(dialog).toBeVisible()
    await expect(page.getByRole('button', { name: /cerrar video/i })).toBeFocused()
    const box = await page.locator('.sensei-video-stage video').boundingBox()
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport!.height + 1) // el video cabe entero, también en horizontal
    expect(box!.width).toBeLessThanOrEqual(viewport!.width)
    await page.keyboard.press('Escape')
    await expect(dialog).toBeHidden()
    await expect(trigger).toBeFocused()
  })

  test('al terminar el video aparece el llamado a registrarse', async ({ page }) => {
    await page.locator('.cinema-sensei-video-btn').click()
    await page.locator('.sensei-video-stage video').evaluate((v: HTMLVideoElement) => { v.dispatchEvent(new Event('ended')) })
    await expect(page.getByRole('link', { name: /regístrate gratis/i })).toBeVisible()
    await expect(page.getByRole('link', { name: /probar sin cuenta/i }).last()).toBeVisible()
  })

  test('el video del Sensei también se ve con una cuenta ya registrada', async ({ page }) => {
    await signedIn(page)
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(page.locator('.cinema-sensei-video-btn')).toBeVisible()
  })
})
