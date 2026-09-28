import { chromium, devices } from '@playwright/test'

const browser = await chromium.launch()

async function check(deviceName, deviceDesc) {
  const context = await browser.newContext({ ...deviceDesc })
  const page = await context.newPage()
  await page.goto('http://localhost:8793/')
  await page.waitForTimeout(600)
  await page.locator('.cinema-sensei-video-btn').click()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `/tmp/modal_${deviceName}.png` })

  const info = await page.evaluate(() => {
    const dlg = document.querySelector('.sensei-video-dialog')
    const r = dlg.getBoundingClientRect()
    return { viewportH: innerHeight, top: Math.round(r.top), bottom: Math.round(r.bottom), gapAbove: Math.round(r.top), gapBelow: Math.round(innerHeight - r.bottom) }
  })
  console.log(`${deviceName} (${deviceDesc.viewport.width}x${deviceDesc.viewport.height}): dialog top=${info.top} bottom=${info.bottom} gapAbove=${info.gapAbove} gapBelow=${info.gapBelow}`)
  await context.close()
}

await check('pixel7', devices['Pixel 7'])
await check('iphone8', { viewport: { width: 414, height: 736 }, userAgent: devices['iPhone 8 Plus'].userAgent, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
await check('iphonese', devices['iPhone SE'])

await browser.close()
