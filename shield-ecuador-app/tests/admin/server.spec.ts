import { test, expect } from '@playwright/test'

const BASE = 'http://127.0.0.1:3198'
const UPSTREAM = 'http://127.0.0.1:3199'
const basic = (u: string, p: string) => ({ Authorization: 'Basic ' + Buffer.from(`${u}:${p}`).toString('base64') })
const good = basic('admin', 'test-pass-123')

// Node's fetch, not Playwright's request context: that one inherits the config's httpCredentials and would
// answer the 401 challenge by itself.
type Res = { status: () => number; headers: () => Record<string, string>; text: () => Promise<string>; json: () => Promise<any> }
function http() {
  const wrap = async (r: Response): Promise<Res> => { const t = await r.text(); return { status: () => r.status, headers: () => Object.fromEntries(r.headers.entries()), text: async () => t, json: async () => JSON.parse(t) } }
  return {
    get: async (path: string, o: { headers?: Record<string, string> } = {}) => wrap(await fetch(BASE + path, { headers: o.headers, redirect: 'manual' })),
    post: async (path: string, o: { headers?: Record<string, string>; data?: Buffer } = {}) => wrap(await fetch(BASE + path, { method: 'POST', headers: o.headers, body: o.data })),
  }
}

// Server-level behaviour does not depend on the browser profile: run it once.
test.describe('central-admin-app server', () => {
  test.beforeEach(async ({}, info) => { test.skip(info.project.name !== 'desktop-chrome', 'servidor: una sola vez') })

  test('sin credenciales o con credenciales erróneas: 401 con desafío Basic', async () => {
    const api = http()
    const none = await api.get('/')
    expect(none.status()).toBe(401)
    expect(none.headers()['www-authenticate']).toMatch(/^Basic/)
    expect((await api.get('/', { headers: basic('admin', 'mal') })).status()).toBe(401)
    expect((await api.get('/', { headers: basic('otro', 'test-pass-123') })).status()).toBe(401)
    expect((await api.get('/', { headers: good })).status()).toBe(200)
  })

  test('cabeceras de seguridad: CSP sin script inline, sin marcos, sin sniffing', async () => {
    const api = http()
    const h = (await api.get('/', { headers: good })).headers()
    const csp = h['content-security-policy']
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).toContain("object-src 'none'")
    const script = csp.split(';').map(s => s.trim()).find(s => s.startsWith('script-src'))!
    expect(script).not.toContain("'unsafe-inline'")
    expect(script).not.toContain("'unsafe-eval'")
    expect(h['x-content-type-options']).toBe('nosniff')
    expect(h['x-frame-options']).toBe('DENY')
    expect(h['referrer-policy']).toBe('no-referrer')
    expect(h['strict-transport-security']).toContain('max-age=')
  })

  test('solo se sirven los archivos de la consola (no el código del servidor ni package.json)', async () => {
    const api = http()
    for (const ok of ['/', '/index.html', '/app.js', '/styles.css', '/cyber-sensei.gif']) {
      expect((await api.get(ok, { headers: good })).status(), ok).toBe(200)
    }
    for (const no of ['/server.js', '/tpotService.js', '/package.json', '/Dockerfile', '/node-3100.err.log', '/tests/tpotService.test.js', '/..%2f..%2fpackage.json', '/%2e%2e/%2e%2e/package.json']) {
      expect((await api.get(no, { headers: good })).status(), no).toBe(404)
    }
  })

  test('una URL mal escapada responde 400 y el servidor sigue vivo', async () => {
    const api = http()
    expect((await api.get('/%E0%A4%A', { headers: good })).status()).toBe(400)
    expect((await api.get('/%', { headers: good })).status()).toBe(400)
    expect((await api.get('/', { headers: good })).status()).toBe(200)
  })

  test('el proxy añade la clave de servicio en el servidor y nunca la devuelve al navegador', async () => {
    const api = http()
    const res = await api.get('/api/rest/v1/users?select=id', { headers: good })
    expect(res.status()).toBe(200)
    expect(JSON.stringify(res.headers())).not.toContain('test-service-role-key')
    expect(await res.text()).not.toContain('test-service-role-key')
    const seen = await fetch(`${UPSTREAM}/__last`).then(r => r.json())
    expect(seen.url).toBe('/rest/v1/users?select=id')
    expect(seen.headers.apikey).toBe('test-service-role-key')
    // las credenciales Basic del administrador no se reenvían a Supabase
    expect(seen.headers.authorization).toBe('Bearer test-service-role-key')
  })

  test('un cuerpo de más de 5 MB se rechaza con 413 sin llegar a Supabase', async () => {
    const api = http()
    const res = await api.post('/api/rest/v1/questions', { headers: { ...good, 'Content-Type': 'application/json' }, data: Buffer.alloc(6 * 1024 * 1024, 97) })
    expect(res.status()).toBe(413)
  })

  test('los intentos de acceso fallidos se frenan (429) sin afectar a quien tiene la clave correcta', async () => {
    const api = http()
    let last = 0
    for (let i = 0; i < 14; i++) last = (await api.get('/', { headers: basic('admin', `intento-${i}`) })).status()
    expect(last).toBe(429)
    expect((await api.get('/', { headers: good })).status()).toBe(200)
  })
})
