import { test, expect, Page } from '@playwright/test'

// 1×1 PNG
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64')
const CAMPAIGN = { id: 'c1', name: 'Campaña <b>x</b>', moment: 'inicio', duration_seconds: 10, validity_type: 'indefinido', status: 'activa', link_url: 'https://ejemplo.com/a', message: 'Mensaje', target_all: true, target_sectors: [], donation_type: 'unica', donation_period_months: null, value_tier: 1, image_url: null, created_at: '2026-09-01T00:00:00Z' }
const TIERS = [
  { value_tier: 1, min_usd: 0, max_usd: 99, weight: 1 },
  { value_tier: 2, min_usd: 100, max_usd: 499, weight: 2 },
  { value_tier: 3, min_usd: 500, max_usd: 999, weight: 4 },
  { value_tier: 4, min_usd: 1000, max_usd: null, weight: 8 },
]

async function setup(page: Page) {
  const calls = { campaign: [] as Array<{ method: string; url: string; body: any }>, upload: [] as Array<{ url: string; type: string | undefined; bytes: number }>, tiers: [] as any[], settings: [] as any[] }
  await page.route('**/api/rest/v1/central_admin_campaigns*', r => {
    const req = r.request()
    if (req.method() === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([CAMPAIGN]) })
    const body = req.postData() ? JSON.parse(req.postData()!) : null
    calls.campaign.push({ method: req.method(), url: decodeURIComponent(req.url()), body })
    return r.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify([{ ...CAMPAIGN, ...(body || {}), id: 'c1' }]) })
  })
  await page.route('**/api/rest/v1/central_admin_campaign_tier_weights*', r => {
    const req = r.request()
    if (req.method() === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(TIERS) })
    calls.tiers.push(JSON.parse(req.postData() || '{}'))
    return r.fulfill({ status: 204, body: '' })
  })
  await page.route('**/api/rest/v1/central_admin_campaign_settings*', r => {
    const req = r.request()
    if (req.method() === 'GET') return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 1, max_image_kb: 500, max_image_width: 1920, max_image_height: 1920 }]) })
    calls.settings.push(JSON.parse(req.postData() || '{}'))
    return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: 1, ...JSON.parse(req.postData() || '{}') }]) })
  })
  await page.route('**/api/rest/v1/central_admin_campaign_audit*', r => r.fulfill({ status: 201, body: '' }))
  await page.route('**/api/storage/v1/object/campaign-ads/*', r => { calls.upload.push({ url: r.request().url(), type: r.request().headers()['content-type'], bytes: r.request().postDataBuffer()?.length ?? 0 }); return r.fulfill({ status: 200, contentType: 'application/json', body: '{}' }) })
  return calls
}

async function openAds(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Administrador de Ciber Dojo', level: 1 })).toBeVisible()
  if (await page.evaluate(() => innerWidth <= 1180)) await page.locator('#menuToggle').click()
  await page.locator('.nav-item', { hasText: 'Propaganda' }).click()
  await expect(page.locator('#ads')).toHaveClass(/active/)
  await expect(page.locator('#campaignList .campaign-row')).toHaveCount(1)
  await page.locator('#campaignList .campaign-row').click()
  await expect(page.locator('#adName')).toHaveValue('Campaña <b>x</b>')
}

const save = (page: Page) => page.locator('#saveCampaign').dispatchEvent('click') // WebKit móvil: el formulario es muy largo

test.describe('A14 · Propaganda', () => {
  test('lista con tildes y estado en texto; datos como texto', async ({ page }) => {
    await setup(page)
    await openAds(page)
    await expect(page.locator('#ads')).toContainText('Campañas configurables')
    await expect(page.locator('#ads')).toContainText('Límites de imagen')
    await expect(page.locator('#ads')).toContainText('Donación y prioridad de exhibición')
    await expect(page.locator('#campaignList')).toContainText('Campaña <b>x</b>')
    expect(await page.locator('#campaignList b').count()).toBe(0)
    await expect(page.locator('#campaignList .campaign-row')).toHaveAttribute('aria-pressed', 'true')
  })

  test('enlace: solo https y sin espacios; javascript:, http y data: se rechazan sin escribir', async ({ page }) => {
    const calls = await setup(page)
    await openAds(page)
    for (const bad of ['javascript:alert(1)', 'http://ejemplo.com', 'data:text/html,<script>', 'https://con espacios.com', 'ftp://x.com']) {
      await page.locator('#adLink').fill(bad)
      await save(page)
      await expect(page.getByText(/El enlace debe empezar por https/).last()).toBeVisible()
    }
    expect(calls.campaign.filter(c => c.method !== 'GET')).toEqual([])
    await page.locator('#adLink').fill('https://ejemplo.com/oferta')
    await save(page)
    await expect.poll(() => calls.campaign.filter(c => c.method === 'PATCH').length).toBe(1)
    expect(calls.campaign.find(c => c.method === 'PATCH')!.body.link_url).toBe('https://ejemplo.com/oferta')
  })

  test('duración, mensaje, periodo de donación y sectores se validan (el 0 ya no pasa a 10)', async ({ page }) => {
    const calls = await setup(page)
    await openAds(page)
    await page.locator('#adDuration').fill('0')
    await save(page)
    await expect(page.getByText(/entre 1 y 120/).last()).toBeVisible()
    await page.locator('#adDuration').fill('121')
    await save(page)
    await expect(page.getByText(/entre 1 y 120/).last()).toBeVisible()
    await page.locator('#adDuration').fill('15')
    await page.locator('#adMessage').evaluate((el: HTMLTextAreaElement) => { el.maxLength = 5000; el.value = 'x'.repeat(501) })
    await save(page)
    await expect(page.getByText(/hasta 120 caracteres y el mensaje hasta 500/).last()).toBeVisible()
    await page.locator('#adMessage').fill('Mensaje válido')
    await page.locator('#adDonationType').selectOption('continua')
    await page.locator('#adDonationPeriod').fill('999')
    await save(page)
    await expect(page.getByText(/entero entre 1 y 120/).last()).toBeVisible()
    await page.locator('#adDonationType').selectOption('unica')
    await page.locator('#adTargetAll').uncheck()
    await save(page)
    await expect(page.getByText(/Elige al menos un sector/).last()).toBeVisible()
    expect(calls.campaign.filter(c => c.method !== 'GET')).toEqual([])
  })

  test('imagen: solo PNG/JPEG/WebP; un HTML o SVG se rechaza y el nombre del archivo lo decide el tipo, no la extensión original', async ({ page }) => {
    const calls = await setup(page)
    await openAds(page)
    const file = page.locator('#adImageFile')
    await file.setInputFiles({ name: 'oferta.html', mimeType: 'text/html', buffer: Buffer.from('<script>alert(1)</script>') })
    await expect(page.locator('#adImageStatus')).toContainText('Solo se permiten imágenes PNG, JPEG o WebP')
    await file.setInputFiles({ name: 'dibujo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>') })
    await expect(page.locator('#adImageStatus')).toContainText('Solo se permiten imágenes')
    expect(calls.upload).toEqual([])
    // un PNG real con nombre engañoso
    await file.setInputFiles({ name: 'logo.html', mimeType: 'image/png', buffer: PNG })
    await expect(page.locator('#adImageStatus')).toContainText('Lista para subir')
    await save(page)
    await expect.poll(() => calls.upload.length).toBe(1)
    expect(calls.upload[0].url).toMatch(/\/campaign-ads\/\d+-[a-z0-9]+\.png$/)
    expect(calls.upload[0].type).toBe('image/png')
    await expect.poll(() => calls.campaign.filter(c => c.method === 'PATCH').length).toBe(1)
    expect(calls.campaign.find(c => c.method === 'PATCH')!.body.image_url).toMatch(/^https:\/\/wbbcjiqzbzswxsmwjqlw\.supabase\.co\/storage\/v1\/object\/public\/campaign-ads\/\d+-[a-z0-9]+\.png$/)
  })

  test('límites de imagen: fuera de rango se rechazan; los válidos se guardan', async ({ page }) => {
    const calls = await setup(page)
    await openAds(page)
    const status = page.locator('#adsSettingsStatus')
    await page.locator('#adsMaxKb').fill('5000')
    await page.locator('#saveAdsSettings').dispatchEvent('click')
    await expect(status).toContainText('1 a 1024 KB')
    await page.locator('#adsMaxKb').fill('300')
    await page.locator('#adsMaxWidth').fill('99999')
    await page.locator('#saveAdsSettings').dispatchEvent('click')
    await expect(status).toContainText('1 a 4096 px')
    expect(calls.settings).toEqual([])
    await page.locator('#adsMaxWidth').fill('1200')
    await page.locator('#saveAdsSettings').dispatchEvent('click')
    await expect.poll(() => calls.settings.length).toBe(1)
    expect(calls.settings[0]).toMatchObject({ max_image_kb: 300, max_image_width: 1200 })
  })

  test('prioridades: los rangos de los niveles no pueden superponerse', async ({ page }) => {
    const calls = await setup(page)
    await openAds(page)
    const status = page.locator('#tierWeightsStatus')
    await page.locator('.tier-weights-row').nth(1).locator('.tier-min').fill('50') // 50 está dentro del nivel 1 (0–99)
    await page.locator('#saveTierWeights').dispatchEvent('click')
    await expect(status).toContainText('se superponen')
    expect(calls.tiers).toEqual([])
    await page.locator('.tier-weights-row').nth(1).locator('.tier-min').fill('100')
    await page.locator('#saveTierWeights').dispatchEvent('click')
    await expect.poll(() => calls.tiers.length).toBe(4)
  })

  test('sin scroll horizontal y con controles ≥44 px', async ({ page }) => {
    await setup(page)
    await openAds(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const small = await page.evaluate(() => [...document.querySelectorAll('#ads button:not(:disabled), #ads input:not([type="checkbox"]):not([type="file"]), #ads select, #ads textarea')].filter(e => { const r = e.getBoundingClientRect(); return r.width && r.height < 43.5 }).map(e => e.id || e.className))
    expect(small).toEqual([])
  })
})
