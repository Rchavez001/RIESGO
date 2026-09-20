import { Page } from '@playwright/test'

const REF = process.env.SUPABASE_REF ?? 'wbbcjiqzbzswxsmwjqlw'

export type FixtureUser = { anonymous?: boolean; role?: 'user' | 'admin'; belt?: string; name?: string }

// A signed-in session for the SPA without touching the real backend: a non-expired session is
// stored where supabase-js looks for it, and every network call the shell makes is answered here.
export async function signedIn(page: Page, opts: FixtureUser = {}) {
  const user = { id: opts.anonymous ? 'guest-1' : 'user-1', aud: 'authenticated', email: opts.anonymous ? '' : 'ana@empresa.com', is_anonymous: !!opts.anonymous, app_metadata: {}, user_metadata: {}, created_at: '2026-01-01T00:00:00Z' }
  await page.addInitScript(({ ref, user }) => {
    localStorage.setItem('_pwa_hidden_until', String(Date.now() + 86_400_000))
    localStorage.setItem('dojo_audio', 'off')
    localStorage.setItem(`sb-${ref}-auth-token`, JSON.stringify({ access_token: 'h.p.s', refresh_token: 'r', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user }))
  }, { ref: REF, user })

  // Playwright tries the most recently registered route first: the catch-all goes first so the specific mocks below win.
  await page.route('**/rest/v1/**', r => r.fulfill({ status: r.request().method() === 'POST' ? 201 : 200, contentType: 'application/json', body: '[]' }))
  await page.route('**/auth/v1/user*', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(user) }))
  await page.route('**/auth/v1/logout*', r => r.fulfill({ status: 204, body: '' }))
  await page.route('**/functions/v1/get-private-profile', r => opts.anonymous
    ? r.fulfill({ status: 404, contentType: 'application/json', body: '{}' })
    : r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: user.id, email: 'ana@empresa.com', full_name: opts.name ?? 'Ana Pérez', role: opts.role ?? 'user', belt: opts.belt ?? 'blanco', total_points: 120, onboarding_completed: true, created_at: '2026-01-01T00:00:00Z' }) }))
  await page.route('**/rest/v1/rpc/learning_overview', r => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([
    { id: 'passwords', answered: 3, passed: false, unlocked: true }, { id: 'assets', answered: 0, passed: false, unlocked: !!0 },
  ]) }))
  await page.route('**/rest/v1/rpc/get_next_campaign_for_user', r => r.fulfill({ status: 200, contentType: 'application/json', body: 'null' }))
}
