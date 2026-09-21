import { test, expect, Page } from '@playwright/test'
import { signedIn } from './auth-fixture'
import { settle } from './helpers'

const OWN = 'https://wbbcjiqzbzswxsmwjqlw.supabase.co/storage/v1/object/public/campaign-ads/1-abc.png'
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
const ad = (over: Record<string, unknown>) => ({ id: 'c1', image_url: OWN, link_url: 'https://ejemplo.com/oferta', message: 'Oferta', duration_seconds: 30, ...over })

async function open(page: Page, campaign: unknown) {
  await signedIn(page)
  await page.route('**/rest/v1/rpc/get_next_campaign_for_user', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(campaign) }))
  await page.route('**/storage/v1/object/public/campaign-ads/**', r => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }))
  await page.route('https://evil.example/**', r => r.fulfill({ status: 200, contentType: 'image/gif', body: PNG }))
  await page.goto('/dashboard')
  await settle(page, 'main')
}

test.describe('anuncio de campaña (propaganda)', () => {
  test('un anuncio con imagen de nuestro bucket y enlace https se muestra con el enlace', async ({ page }) => {
    await open(page, ad({}))
    const link = page.locator('a.campaign-ad-card')
    await expect(link).toBeAttached()
    await expect(link).toHaveAttribute('href', 'https://ejemplo.com/oferta')
    await expect(link).toHaveAttribute('rel', /noopener/)
    await expect(link.locator('img')).toHaveAttribute('src', OWN)
  })

  test('un enlace javascript: no se convierte en enlace (la imagen se ve, pero no ejecuta nada al pulsarla)', async ({ page }) => {
    await open(page, ad({ link_url: 'javascript:window.__pwn=1' }))
    await expect(page.locator('.campaign-ad-card img')).toBeAttached()
    await expect(page.locator('a.campaign-ad-card')).toHaveCount(0)
    expect(await page.evaluate(() => (window as any).__pwn)).toBeUndefined()
  })

  test('una imagen que no es de nuestro bucket (píxel de seguimiento) no se carga ni se muestra el anuncio', async ({ page }) => {
    const requested: string[] = []
    page.on('request', r => { if (r.url().startsWith('https://evil.example')) requested.push(r.url()) })
    await open(page, ad({ image_url: 'https://evil.example/pixel.gif' }))
    await page.waitForTimeout(800)
    await expect(page.locator('.campaign-ad-card')).toHaveCount(0)
    expect(requested).toEqual([])
  })
})
