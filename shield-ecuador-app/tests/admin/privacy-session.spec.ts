import { test, expect } from '@playwright/test'

// T05.a (SEC-03, H08): el módulo de consentimiento solo se alcanza con la sesión individual del admin (JWT de Supabase
// Auth en X-Admin-Session), nunca con la Basic Auth compartida + service role del proxy.
const BASE = 'http://127.0.0.1:3198'
const UPSTREAM = 'http://127.0.0.1:3199'
const good = { Authorization: 'Basic ' + Buffer.from('admin:test-pass-123').toString('base64') }
const mk = () => `m${Date.now()}${Math.floor(Math.random() * 1e9)}`
const seenUpstream = (marker: string) => fetch(`${UPSTREAM}/__find?contains=${marker}`).then(r => r.json())
const call = (path: string, init: RequestInit = {}) => fetch(BASE + path, { redirect: 'manual', ...init, headers: { ...good, ...(init.headers as Record<string, string> || {}) } })

test.describe('módulo de consentimiento: sesión individual del admin', () => {
  test.beforeEach(async ({}, info) => { test.skip(info.project.name !== 'desktop-chrome', 'servidor: una sola vez') })

  test('el proxy con service role no alcanza tablas, RPC ni funciones del módulo (403, sin llegar a Supabase)', async () => {
    const paths = [
      '/api/rest/v1/admin_roles?select=*',
      '/api/rest/v1/admin%5Froles?select=*',
      '/api/rest/v1/ADMIN_ROLES?select=*',
      '/api/rest/v1/users?select=id,admin_roles(*)',
      '/api/rest/v1/users?select=id,roles:admin%5Froles(role)',
      '/api/rest/v1/admin_audit_log?select=*',
      '/api/rest/v1/consent_records?select=*',
      '/api/rest/v1/consent_documents?select=*',
      '/api/rest/v1/privacy_settings?select=*',
      '/api/rest/v1/privacy_settings_current?select=*',
      '/api/rest/v1/privacy_email_verifications?select=*',
      '/api/rest/v1/data_subject_requests?select=*',
      '/api/rest/v1/rpc/verify_audit_chain',
      '/api/rest/v1/rpc/unlink_user_consent_evidence',
      '/api/rest/v1/rpc/has_privacy_role',
      '/api/functions/v1/admin-consent/session',
      '/api/functions/v1/Admin-Consent/session',
    ]
    for (const p of paths) {
      const marker = mk()
      const url = `${p}${p.includes('?') ? '&' : '?'}m=${marker}`
      const res = await call(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      expect(res.status, p).toBe(403)
      expect(await seenUpstream(marker), p).toBeNull()
    }
  })

  test('el proxy de Auth con service role está cerrado (permitía borrar el TOTP de un admin o generarle un enlace)', async () => {
    for (const p of ['/api/auth/v1/admin/users', '/api/auth/v1/admin/generate_link', '/api/auth/v1/user', '/api/auth/v1/admin/users/x/factors/y']) {
      const marker = mk()
      const res = await call(`${p}?m=${marker}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })
      expect(res.status, p).toBe(403)
      expect(await seenUpstream(marker), p).toBeNull()
    }
  })

  test('lo que no es del módulo sigue pasando por el proxy (sin regresiones)', async () => {
    const marker = mk()
    const res = await call(`/api/rest/v1/users?select=id&m=${marker}`)
    expect(res.status).toBe(200)
    expect((await seenUpstream(marker)).headers.apikey).toBe('test-service-role-key')
  })

  test('admin-consent sin X-Admin-Session (o con un valor que no es un JWT) → 401 sin llegar a Supabase', async () => {
    for (const session of [undefined, '', 'Basic abc', 'no-es-un-jwt']) {
      const marker = mk()
      const res = await call(`/api/privacy/fn/admin-consent/session?m=${marker}`, {
        method: 'POST',
        headers: session === undefined ? {} : { 'X-Admin-Session': session },
      })
      expect(res.status, String(session)).toBe(401)
      expect((await res.json()).error).toBe('admin_session_required')
      expect(await seenUpstream(marker)).toBeNull()
    }
  })

  test('admin-consent con X-Admin-Session: llega con el JWT del admin y la clave anon, nunca con la service role', async () => {
    const marker = mk()
    const jwt = `eyJhbGciOiJFUzI1NiJ9.${marker}.c2ln`
    const res = await call(`/api/privacy/fn/admin-consent/session?m=${marker}`, { method: 'POST', headers: { 'X-Admin-Session': jwt } })
    expect(res.status).toBe(200)
    const seen = await seenUpstream(marker)
    expect(seen.url).toBe(`/functions/v1/admin-consent/session?m=${marker}`)
    expect(seen.headers.authorization).toBe(`Bearer ${jwt}`)
    expect(seen.headers.apikey).toBe('test-anon-key')
    expect(JSON.stringify(seen.headers)).not.toContain('test-service-role-key')
    expect(seen.headers['x-admin-session']).toBeUndefined()
  })

  test('/api/privacy/fn solo lleva a admin-consent (también con ".." codificado)', async () => {
    for (const p of ['/api/privacy/fn/save-app-secret', '/api/privacy/fn/admin-consent/%2e%2e/save-app-secret', '/api/privacy/fn/admin-consent/..%2fsave-app-secret', '/api/privacy/fn/admin-consentX']) {
      const marker = mk()
      const res = await call(`${p}?m=${marker}`, { method: 'POST', headers: { 'X-Admin-Session': 'a.b.c' } })
      expect(res.status, p).toBe(404)
      expect(await seenUpstream(marker), p).toBeNull()
    }
  })

  test('Auth del módulo: login con contraseña va con la clave anon, nunca con la service role', async () => {
    const marker = mk()
    const res = await call('/api/privacy/auth/token?grant_type=password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: `${marker}@example.test`, password: 'x' }),
    })
    expect(res.status).toBe(200)
    const seen = await seenUpstream(marker)
    expect(seen.url).toBe('/auth/v1/token?grant_type=password')
    expect(seen.headers.apikey).toBe('test-anon-key')
    expect(seen.headers.authorization).toBe('Bearer test-anon-key')
    expect(JSON.stringify(seen.headers)).not.toContain('test-service-role-key')
  })

  test('Auth del módulo: factores y usuario llevan el JWT del admin', async () => {
    const marker = mk()
    const jwt = `eyJhbGciOiJFUzI1NiJ9.${marker}.c2ln`
    const res = await call('/api/privacy/auth/factors/11111111-2222-4333-8444-555555555555/verify', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Admin-Session': jwt },
      body: JSON.stringify({ challenge_id: marker, code: '123456' }),
    })
    expect(res.status).toBe(200)
    const seen = await seenUpstream(marker)
    expect(seen.url).toBe('/auth/v1/factors/11111111-2222-4333-8444-555555555555/verify')
    expect(seen.headers.authorization).toBe(`Bearer ${jwt}`)
    expect(seen.headers.apikey).toBe('test-anon-key')
  })

  test('Auth del módulo: solo la lista cerrada de rutas (sin signup, admin, otros grant_type ni borrar factores)', async () => {
    const cases: Array<[string, string]> = [
      ['POST', '/api/privacy/auth/signup'],
      ['POST', '/api/privacy/auth/admin/users'],
      ['POST', '/api/privacy/auth/token?grant_type=id_token'],
      ['POST', '/api/privacy/auth/token?grant_type=password&x=1'],
      ['POST', '/api/privacy/auth/otp'],
      ['POST', '/api/privacy/auth/recover'],
      ['DELETE', '/api/privacy/auth/factors/11111111-2222-4333-8444-555555555555'],
      ['POST', '/api/privacy/auth/factors/../admin/users/verify'],
      ['GET', '/api/privacy/auth/token?grant_type=password'],
    ]
    for (const [method, p] of cases) {
      const marker = mk()
      const res = await call(p, { method, headers: { 'Content-Type': 'application/json', 'X-Admin-Session': `a.${marker}.c` }, body: method === 'GET' ? undefined : JSON.stringify({ m: marker }) })
      expect(res.status, `${method} ${p}`).toBe(404)
      expect(await seenUpstream(marker), `${method} ${p}`).toBeNull()
    }
  })

  test('las rutas del módulo siguen detrás de la Basic Auth del panel', async () => {
    const res = await fetch(`${BASE}/api/privacy/auth/token?grant_type=password`, { method: 'POST', body: '{}' })
    expect(res.status).toBe(401)
  })
})
