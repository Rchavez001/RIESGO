import { defineConfig, devices } from '@playwright/test'

// Responsive / hardening suite for frontend/ (see DESIGN_REVIEW_CHECKLIST.md).
// Run against a built app:  cd frontend && npm run build && PORT=8793 node static-server.js
//                           BASE_URL=http://localhost:8793 npx playwright test -c playwright.frontend.config.ts
// WebKit projects use Safari's engine, not real iOS hardware — see the checklist for what that cannot cover.
export default defineConfig({
  testDir: './tests/frontend',
  reporter: 'list',
  use: { baseURL: process.env.BASE_URL ?? 'http://localhost:8793' },
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
