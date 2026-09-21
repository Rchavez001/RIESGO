import { defineConfig, devices } from '@playwright/test'

// Suite for central-admin-app (rows A0–A15 of DESIGN_REVIEW_CHECKLIST.md). It starts the real server.js
// against a mock Supabase upstream (tests/admin/start-admin.cjs), so authentication, headers and the proxy
// are exercised for real:   npx playwright test -c playwright.admin.config.ts
export default defineConfig({
  testDir: './tests/admin',
  reporter: 'list',
  workers: 3,
  webServer: { command: 'node tests/admin/start-admin.cjs', port: 3198, reuseExistingServer: true, timeout: 30_000 },
  use: { baseURL: 'http://127.0.0.1:3198', httpCredentials: { username: 'admin', password: 'test-pass-123' } },
  projects: [
    { name: 'iphone-se-safari', use: { ...devices['iPhone SE'] } },
    { name: 'iphone-14-safari', use: { ...devices['iPhone 14'] } },
    { name: 'ipad-safari', use: { ...devices['iPad (gen 7)'] } },
    { name: 'pixel-7-chrome', use: { ...devices['Pixel 7'] } },
    { name: 'galaxy-s9-chrome', use: { ...devices['Galaxy S9+'] } },
    { name: 'desktop-chrome', use: { ...devices['Desktop Chrome'] } },
    { name: 'desktop-safari', use: { ...devices['Desktop Safari'] } },
  ],
})
