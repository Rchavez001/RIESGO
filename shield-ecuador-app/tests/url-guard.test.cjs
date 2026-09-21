// Unit test for supabase/functions/_shared/url-guard.ts (pure logic, transpiled with the frontend's TypeScript).
// Run: node tests/url-guard.test.cjs
const fs = require('fs')
const path = require('path')
const ts = require(path.join(__dirname, '..', 'frontend', 'node_modules', 'typescript'))
const assert = require('assert')

const source = fs.readFileSync(path.join(__dirname, '..', 'supabase', 'functions', '_shared', 'url-guard.ts'), 'utf8')
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
const m = { exports: {} }
new Function('module', 'exports', js)(m, m.exports)
const { publicHttpUrlProblem: problem, isPrivateIpv4 } = m.exports

const ok = ['https://www.bleepingcomputer.com/feed', 'http://example.com/a?b=c', 'https://thehackernews.com', 'https://api.deepseek.com/v1/chat/completions']
for (const u of ok) assert.strictEqual(problem(u), null, `should allow ${u}`)

const bad = [
  'javascript:alert(1)', 'file:///etc/passwd', 'ftp://example.com/x', 'data:text/html,<script>', 'gopher://example.com',
  'http://localhost/admin', 'http://LOCALHOST:8080', 'http://app.localhost', 'http://foo.internal/x', 'http://printer.local',
  'http://127.0.0.1/', 'http://127.1.2.3/', 'http://0.0.0.0/', 'http://10.0.0.5/', 'http://172.16.0.1/', 'http://172.31.255.255/',
  'http://192.168.1.1/', 'http://169.254.169.254/latest/meta-data/', 'http://100.64.0.1/', 'http://224.0.0.1/',
  'http://[::1]/', 'http://[fe80::1]/', 'http://[::ffff:127.0.0.1]/',
  'http://2130706433/', 'http://0x7f000001/', 'http://017700000001/',
  'https://user:pass@example.com/', 'https://user@example.com/',
  'http://intranet/', 'not a url', '', 'http://',
]
for (const u of bad) assert.notStrictEqual(problem(u), null, `should block ${JSON.stringify(u)}`)

// https-only mode (provider base_url: it receives API keys and prompts)
assert.strictEqual(problem('https://api.example.com/v1', { httpsOnly: true }), null)
assert.notStrictEqual(problem('http://api.example.com/v1', { httpsOnly: true }), null)

assert.ok(!isPrivateIpv4('8.8.8.8') && !isPrivateIpv4('172.32.0.1') && !isPrivateIpv4('172.15.0.1'))
assert.ok(isPrivateIpv4('172.16.0.1') && isPrivateIpv4('169.254.169.254'))
console.log(`url-guard tests passed (${ok.length} allowed, ${bad.length} blocked)`)
