import { Page } from '@playwright/test'

// PageTransition (framer-motion) scales/blurs each route for ~0.6 s; measuring during it yields
// fractional sizes. Resolves once the element's box has stayed identical for 6 animation frames.
export async function settle(page: Page, selector = 'main, .auth-card, #root > *') {
  await page.waitForFunction((sel) => {
    const el = document.querySelector(sel)
    if (!el) return false
    const w = window as unknown as { __settle?: { key: string; n: number } }
    const r = el.getBoundingClientRect()
    const key = [r.x, r.y, r.width, r.height].map(v => v.toFixed(2)).join(',')
    w.__settle = w.__settle && w.__settle.key === key ? { key, n: w.__settle.n + 1 } : { key, n: 0 }
    return w.__settle.n >= 6
  }, selector, { polling: 'raf' })
}
