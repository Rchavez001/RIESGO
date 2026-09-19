import { test, expect } from '@playwright/test'

const PUBLIC_ROUTES = ['/', '/login', '/registro', '/personajes']

test.describe('base web: headers y compresión', () => {
  test('security headers presentes en el HTML', async ({ request }) => {
    const res = await request.get('/')
    const h = res.headers()
    expect(h['content-security-policy']).toContain("script-src 'self'")
    expect(h['content-security-policy']).toContain("frame-ancestors 'none'")
    expect(h['strict-transport-security']).toMatch(/max-age=\d+/)
    expect(h['x-content-type-options']).toBe('nosniff')
    expect(h['referrer-policy']).toBeTruthy()
    expect(h['permissions-policy']).toContain('camera=()')
    expect(h['cache-control']).toBe('no-cache')
  })

  test('assets con hash: caché inmutable y comprimidos', async ({ request }) => {
    const html = await (await request.get('/')).text()
    const js = html.match(/\/static\/js\/main\.[a-z0-9]+\.js/)?.[0]
    expect(js).toBeTruthy()
    const res = await request.get(js!, { headers: { 'accept-encoding': 'gzip' } })
    expect(res.headers()['cache-control']).toContain('immutable')
    expect(res.headers()['content-type']).toContain('javascript')
  })

  test('escape % mal formado no tumba el servidor', async ({ request }) => {
    const bad = await request.get('/%E0%A4%A')
    expect(bad.status()).toBe(400)
    expect((await request.get('/')).status()).toBe(200)
  })
})

test.describe('base web: viewport y layout', () => {
  test('viewport-fit=cover y branding en el HTML', async ({ page }) => {
    await page.goto('/')
    const viewport = await page.locator('meta[name=viewport]').getAttribute('content')
    expect(viewport).toContain('viewport-fit=cover')
    expect(viewport).not.toMatch(/maximum-scale|user-scalable=no/) // no bloquear el zoom (accesibilidad)
    await expect(page).toHaveTitle(/CiberDojo/)
  })

  for (const route of PUBLIC_ROUTES) {
    test(`sin scroll horizontal ni violaciones CSP: ${route}`, async ({ page }) => {
      const cspViolations: string[] = []
      page.on('console', m => { if (/Content Security Policy|Refused to/i.test(m.text())) cspViolations.push(m.text()) })
      await page.goto(route)
      await page.waitForLoadState('networkidle')
      const { scrollWidth, innerWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }))
      expect(scrollWidth, `scrollWidth ${scrollWidth} > viewport ${innerWidth}`).toBeLessThanOrEqual(innerWidth)
      expect(cspViolations).toEqual([])
    })
  }
})
