import { test, expect, Page } from '@playwright/test'
import { signedIn } from './auth-fixture'
import { settle } from './helpers'

async function open(page: Page, path = '/dojos') {
  await page.goto(path)
  await expect(page.locator('.app-shell')).toBeVisible()
  await settle(page, '.dojo-main')
}
const isDrawer = (page: Page) => page.evaluate(() => innerWidth <= 960)

test.describe('shell autenticado', () => {
  test('sin scroll horizontal, targets ≥44px y sin violaciones CSP', async ({ page }) => {
    const csp: string[] = []
    page.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) csp.push(m.text()) })
    await signedIn(page)
    await open(page)
    const problems = await page.evaluate(() => {
      const out: string[] = []
      document.querySelectorAll('.app-shell a, .app-shell button').forEach(el => {
        const r = el.getBoundingClientRect()
        if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') return
        if (el.closest('.dojo-sidebar') && innerWidth <= 960) return // cajón cerrado, fuera de pantalla
        if (r.height < 43.5 || r.width < 43.5) out.push(`${el.className || el.tagName} ${Math.round(r.width)}x${Math.round(r.height)}`)
      })
      if (document.documentElement.scrollWidth > innerWidth) out.push('scroll horizontal')
      return out
    })
    expect(problems).toEqual([])
    expect(csp).toEqual([])
  })

  test('barra inferior: 5 destinos, una línea, ≤72px (≤60px en horizontal), pegada al borde', async ({ page }) => {
    await signedIn(page)
    await open(page)
    test.skip(!(await isDrawer(page)), 'solo cajón móvil/tablet')
    const nav = page.getByRole('navigation', { name: 'Navegación principal' })
    await expect(nav.locator('.bottom-link')).toHaveCount(5)
    const m = await nav.evaluate(el => {
      const r = el.getBoundingClientRect()
      const labels = [...el.querySelectorAll('.bottom-link span')].map(s => ({ t: s.textContent, clipped: s.scrollWidth > s.clientWidth }))
      return { h: r.height, gap: innerHeight - r.bottom, labels }
    })
    const landscapePhone = await page.evaluate(() => innerHeight <= 520)
    expect(m.h).toBeLessThanOrEqual(landscapePhone ? 60 : 72)
    expect(Math.abs(m.gap)).toBeLessThan(1.5)
    expect(m.labels.filter(l => l.clipped)).toEqual([]) // ninguna etiqueta cortada con "…"
  })

  test('el contenido no queda tapado por la barra inferior ni por "Frase dojo"', async ({ page }) => {
    await signedIn(page)
    await open(page)
    test.skip(!(await isDrawer(page)), 'solo cajón móvil/tablet')
    const { padBottom, navH } = await page.evaluate(() => ({
      padBottom: parseFloat(getComputedStyle(document.querySelector('.dojo-main')!).paddingBottom),
      navH: document.querySelector('.mobile-bottom-nav')!.getBoundingClientRect().height,
    }))
    expect(padBottom).toBeGreaterThanOrEqual(navH)
    const pill = page.locator('.wisdom-pill')
    if (await pill.count()) {
      const [pb, nb] = await Promise.all([pill.evaluate(e => e.getBoundingClientRect().bottom), page.locator('.mobile-bottom-nav').evaluate(e => e.getBoundingClientRect().top)])
      expect(pb).toBeLessThanOrEqual(nb + 0.5) // antes quedaba escondido detrás de la barra
    }
  })

  test('cajón: cerrado es inerte; "Más" lo abre como diálogo con foco dentro; Esc lo cierra y devuelve el foco', async ({ page }) => {
    await signedIn(page)
    await open(page)
    test.skip(!(await isDrawer(page)), 'solo cajón móvil/tablet')
    const drawer = page.locator('#dojo-sidebar')
    await expect(drawer).toHaveAttribute('inert', '')
    await page.getByRole('button', { name: 'Más' }).click()
    const dialog = page.getByRole('dialog', { name: 'Menú principal' })
    await expect(dialog).toBeVisible()
    await expect(drawer).not.toHaveAttribute('inert', '')
    await expect(dialog).toBeFocused()
    expect(await page.evaluate(() => document.body.style.overflow)).toBe('hidden')
    await page.keyboard.press('Escape')
    await expect(page.locator('#dojo-sidebar')).toHaveAttribute('inert', '')
    await expect(page.locator('.floating-menu-toggle')).toBeFocused()
    expect(await page.evaluate(() => document.body.style.overflow)).not.toBe('hidden')
  })

  test('cajón: "Perfil" navega y cierra el cajón', async ({ page }) => {
    await signedIn(page)
    await open(page)
    test.skip(!(await isDrawer(page)), 'solo cajón móvil/tablet')
    await page.getByRole('button', { name: 'Más' }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('dialog').getByRole('link', { name: 'Perfil' }).click()
    await expect(page).toHaveURL(/\/perfil$/)
    await expect(page.locator('#dojo-sidebar')).toHaveAttribute('inert', '')
  })

  test('escritorio: barra lateral permanente, sin barra inferior, con enlace para saltar al contenido', async ({ page }) => {
    await signedIn(page)
    await open(page)
    test.skip(await isDrawer(page), 'solo escritorio')
    await expect(page.locator('#dojo-sidebar')).not.toHaveAttribute('inert', '')
    await expect(page.locator('.mobile-bottom-nav')).toBeHidden()
    await expect(page.getByRole('navigation', { name: 'Secciones' })).toBeVisible()
    // WebKit no pone los enlaces en el orden de Tab por defecto (ajuste de macOS/Safari): se enfoca por código.
    const skip = page.getByRole('link', { name: 'Ir al contenido' })
    await skip.focus()
    expect(await skip.evaluate(e => e.getBoundingClientRect().top)).toBeGreaterThanOrEqual(0) // aparece al recibir el foco
    await page.keyboard.press('Enter') // Safari no da foco al enlace con el ratón: el enlace de salto se usa con teclado
    expect(page.url()).toContain('#contenido')
    await expect(page.locator('#contenido')).toBeVisible()
  })

  test('invitado: el Campeonato pide registrarse', async ({ page }) => {
    await signedIn(page, { anonymous: true })
    await open(page)
    await page.goto('/campeonato')
    await expect(page.getByRole('heading', { name: /regístrate para tener la experiencia completa/i })).toBeVisible()
    await expect(page.getByRole('button', { name: /regístrate gratis/i })).toBeVisible()
  })

  test('admin en vista de estudiante: "Admin" es una navegación real a /admin/ (no una ruta del SPA)', async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem('cyberdojo_view_as_user', 'true'))
    await signedIn(page, { role: 'admin' })
    await open(page)
    const link = page.locator('#dojo-sidebar').getByRole('link', { name: 'Admin', includeHidden: true })
    await expect(link).toHaveAttribute('href', '/admin/')
  })
})

test.describe('shell autenticado: cajón en pantallas bajas', () => {
  test('todas las opciones del menú se alcanzan haciendo scroll dentro del cajón', async ({ page }) => {
    await signedIn(page)
    await open(page)
    test.skip(!(await isDrawer(page)), 'solo cajón móvil/tablet')
    await page.getByRole('button', { name: 'Más' }).click()
    const dialog = page.getByRole('dialog', { name: 'Menú principal' })
    const perfil = dialog.getByRole('link', { name: 'Perfil' })
    await perfil.evaluate(e => e.scrollIntoView({ block: 'nearest', behavior: 'instant' })) // evita la espera de "estable" de WebKit bajo carga
    await expect(perfil).toBeInViewport({ ratio: 0.9 })
    const logout = dialog.getByRole('button', { name: /salir de la aplicación/i })
    await logout.evaluate(e => e.scrollIntoView({ block: 'nearest', behavior: 'instant' }))
    await expect(logout).toBeInViewport({ ratio: 0.9 })
    // el cajón entero es el que hace scroll: ningún hijo queda recortado dentro de un contenedor con altura fija
    const clipped = await dialog.evaluate(el => [...el.children].filter(c => (c as HTMLElement).offsetHeight < c.scrollHeight - 1).map(c => c.className))
    expect(clipped).toEqual([])
  })
})
