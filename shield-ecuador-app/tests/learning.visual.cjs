// Local visual smoke check. All backend traffic is fulfilled in memory.
// Run after building frontend; screenshots are written under test-results.
const { chromium } = require('@playwright/test')
const http = require('http')
const fs = require('fs')
const path = require('path')
const assert = require('assert/strict')
const root = path.resolve(__dirname, '..')
const build = path.join(root, 'frontend/build')
const bank = JSON.parse(fs.readFileSync(path.join(root, 'Banco de preguntas/optimizado/banco_700_preguntas_300_casos.json'), 'utf8'))
const env = fs.readFileSync(path.join(root, 'frontend/.env'), 'utf8')
const backend = new URL(env.match(/^REACT_APP_SUPABASE_URL\s*=\s*["']?([^\s"']+)/m)[1])
const user = { id: '00000000-0000-0000-0000-000000000001', email: 'prueba@example.invalid', aud: 'authenticated', role: 'authenticated', app_metadata: {}, user_metadata: {} }
const profile = { ...user, role: 'user', belt: 'white', full_name: 'Persona de prueba', total_points: 0, onboarding_completed: true }
const mime = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.jpg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml' }
const server = http.createServer((req, res) => {
  const target = path.resolve(build, '.' + decodeURIComponent(new URL(req.url, 'http://localhost').pathname))
  if (!target.startsWith(build + path.sep) && target !== build) { res.writeHead(403); res.end(); return }
  const file = fs.existsSync(target) && fs.statSync(target).isFile() ? target : path.join(build, 'index.html')
  res.setHeader('Content-Type', mime[path.extname(file)] || 'application/octet-stream')
  fs.createReadStream(file).pipe(res)
})

;(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  let browser
  try {
    browser = await chromium.launch({ headless: true })
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block', reducedMotion: 'reduce' })
    const expiry = Math.floor(Date.now() / 1000) + 3600
    const token = [Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url'), Buffer.from(JSON.stringify({ sub: user.id, exp: expiry, aud: 'authenticated' })).toString('base64url'), 'test'].join('.')
    await ctx.addInitScript(({ key, session }) => localStorage.setItem(key, JSON.stringify(session)), {
      key: `sb-${backend.hostname.split('.')[0]}-auth-token`, session: { access_token: token, refresh_token: 'offline-test', expires_at: expiry, expires_in: 3600, token_type: 'bearer', user },
    })
    let state = { dojo: 'passwords', cursor: 16, answered: 17, total: 30, complete: false, selected: 0,
      question: bank.items.find(q => q.kind === 'question' && q.belt === 'blanco'), version: bank.version }
    await ctx.route('**/*', async route => {
      const url = new URL(route.request().url())
      if (url.hostname === '127.0.0.1') return route.continue()
      if (url.hostname !== backend.hostname) return route.abort()
      let data = []
      if (url.pathname.endsWith('/get-private-profile')) data = profile
      if (url.pathname.endsWith('/user')) data = user
      if (url.pathname.endsWith('/learning_state')) data = state
      if (url.pathname.endsWith('/learning_next')) { state = { ...state, cursor: 17, selected: null }; data = state }
      if (url.pathname.endsWith('/learning_overview')) data = bank.dojos.map(d => ({ id: d.id, answered: d.rank === 0 ? 17 : 0, unlocked: d.rank === 0, passed: false }))
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
    })
    const page = await ctx.newPage()
    const errors = []
    page.on('pageerror', e => errors.push(e.message))
    const origin = `http://127.0.0.1:${server.address().port}`
    await page.goto(origin + '/dojo/passwords')
    await page.getByText('Pregunta 17 de 30', { exact: false }).waitFor()
    await page.locator('.learning-page').screenshot({ path: path.join(root, 'test-results/learning-mobile.png') })
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), 'Horizontal overflow on mobile')
    await page.getByRole('button', { name: /Ya leí/ }).click()
    await page.getByText('Pregunta 18 de 30', { exact: false }).waitFor()
    await page.reload()
    await page.getByText('Pregunta 18 de 30', { exact: false }).waitFor()
    await page.setViewportSize({ width: 1440, height: 1000 })
    await page.goto(origin + '/dojos')
    await page.getByText('17 de 30 preguntas respondidas').waitFor()
    await page.locator('.learning-page').screenshot({ path: path.join(root, 'test-results/learning-dojos-desktop.png') })
    assert.equal(errors.length, 0, errors.join('\n'))
    console.log('PASS: mobile layout, saved cursor after reload, desktop catalogue, no browser errors')
  } finally {
    if (browser) await browser.close()
    await new Promise(resolve => server.close(resolve))
  }
})().catch(error => { console.error(error); process.exitCode = 1 })
