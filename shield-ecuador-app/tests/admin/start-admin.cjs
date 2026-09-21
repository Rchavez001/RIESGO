// Test harness for central-admin-app: a mock "Supabase" upstream plus the real server.js pointed at it.
// The mock records the headers of the last request it received (GET /__last) so tests can check what the
// admin proxy actually forwards. Used by playwright.admin.config.ts (webServer).
const http = require('http')
const { spawn } = require('child_process')
const path = require('path')

const UPSTREAM_PORT = 3199
const ADMIN_PORT = 3198
let last = null

http.createServer((req, res) => {
  if (req.url === '/__last') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify(last))
    return
  }
  const chunks = []
  req.on('data', (c) => chunks.push(c))
  req.on('end', () => {
    last = { method: req.method, url: req.url, headers: req.headers, bytes: Buffer.concat(chunks).length }
    const url = req.url
    const headers = { 'Content-Type': 'application/json' }
    let body = url.startsWith('/rest/v1/') ? '[]' : '{}'
    // PostgREST-style exact counts for the Resumen panel
    if (req.headers.prefer === 'count=exact') {
      const total = url.startsWith('/rest/v1/users') ? 42 : url.includes('kind=eq.question') ? 210 : url.includes('kind=eq.case') ? 35 : 0
      headers['Content-Range'] = `0-0/${total}`
      body = '[{"id":"x"}]'
    }
    if (url.startsWith('/rest/v1/learning_dojos')) {
      const belts = ['blanco', 'amarillo', 'naranja', 'verde', 'azul', 'marron', 'negro']
      body = JSON.stringify(belts.map((belt, rank) => ({ id: `dojo-${rank}`, rank, title: `Dojo ${rank + 1} <b>x</b>`, belt, exam_code: `EXAM_${rank}` })))
    }
    res.writeHead(200, headers)
    res.end(body)
  })
}).listen(UPSTREAM_PORT, '127.0.0.1')

const child = spawn(process.execPath, [path.join(__dirname, '..', '..', 'central-admin-app', 'server.js')], {
  stdio: 'inherit',
  env: {
    ...process.env,
    PORT: String(ADMIN_PORT),
    CENTRAL_ADMIN_USER: 'admin',
    CENTRAL_ADMIN_PASSWORD: 'test-pass-123',
    SUPABASE_URL: `http://127.0.0.1:${UPSTREAM_PORT}`,
    SUPABASE_SERVICE_ROLE_KEY: 'test-service-role-key',
  },
})
child.on('exit', (code) => process.exit(code ?? 0))
process.on('SIGTERM', () => child.kill())
process.on('SIGINT', () => child.kill())
