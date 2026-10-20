// Unit test for the PRIVACY_FN_RE allowlist in central-admin-app/server.js (T16.b, SEC-03/H08): decides which
// admin-consent subpaths the proxy forwards with the admin's own JWT (never the service role). Requiring
// server.js directly would start a real HTTP server (side effect at module load), so this test extracts just
// the regex literal from the source instead of importing the module.
// Run: node tests/privacy-fn-route.test.cjs
const fs = require('fs')
const path = require('path')
const assert = require('assert')

const source = fs.readFileSync(path.join(__dirname, '..', 'central-admin-app', 'server.js'), 'utf8')
const match = /const PRIVACY_FN_RE = (\/.*\/);/.exec(source)
assert.ok(match, 'PRIVACY_FN_RE not found in server.js')
const PRIVACY_FN_RE = eval(match[1])

const ok = [
  '/fn/admin-consent/session',
  '/fn/admin-consent/audit-log',
  '/fn/admin-consent/audit-log?limit=50&offset=0',
  '/fn/admin-consent/audit-log/export.csv',
  '/fn/admin-consent/audit-log/export.csv?reason=auditoria&from=2026-10-01',
  '/fn/admin-consent/documents/doc-1/publish',
  // T24.a: `reason` con espacios u otro texto libre llega percent-encoded (encodeURIComponent).
  '/fn/admin-consent/audit-log/export.csv?reason=auditor%C3%ADa%20trimestral&actor_id=11111111-2222-4333-8444-555555555555',
  '/fn/admin-consent/evidence/export.pdf?user_id=11111111-2222-4333-8444-555555555555&reason=solicitud%20ARCO',
]
for (const p of ok) assert.ok(PRIVACY_FN_RE.test(p), `should allow ${p}`)

const bad = [
  '/fn/admin-consent/../other-function',
  '/fn/admin-consent/audit-log/..csv',
  '/fn/admin-consent/audit-log/.csv',
  '/fn/admin-consent/audit-log/export.csv/..',
  '/fn/other-function',
  '/fn/admin-consentx/audit-log',
  // T24.a: percent-encoding mal formado (sin dos dígitos hexadecimales) sigue bloqueado.
  '/fn/admin-consent/audit-log/export.csv?reason=auditoria%2',
  '/fn/admin-consent/audit-log/export.csv?reason=auditoria%zz',
  '/fn/admin-consent/audit-log?action=a b',
]
for (const p of bad) assert.ok(!PRIVACY_FN_RE.test(p), `should block ${p}`)

console.log(`privacy-fn-route tests passed (${ok.length} allowed, ${bad.length} blocked)`)
