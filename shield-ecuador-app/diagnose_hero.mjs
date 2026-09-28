import { chromium, devices } from '@playwright/test'

const browser = await chromium.launch()

async function check(deviceName, deviceDesc) {
  const context = await browser.newContext({ ...deviceDesc })
  const page = await context.newPage()
  await page.goto('http://localhost:8793/')
  await page.waitForTimeout(600)
  await page.screenshot({ path: `/tmp/hero_${deviceName}.png` })

  const info = await page.evaluate(() => {
    const btn = document.querySelector('.cinema-sensei-video-btn')
    const r = btn.getBoundingClientRect()
    return { viewportH: innerHeight, btnTop: Math.round(r.top), btnBottom: Math.round(r.bottom), pctTop: Math.round((r.top / innerHeight) * 100), pctMid: Math.round((((r.top + r.bottom) / 2) / innerHeight) * 100) }
  })
  console.log(`${deviceName} (${deviceDesc.viewport.width}x${deviceDesc.viewport.height}): btn top=${info.btnTop} (${info.pctTop}%) mid=${info.pctMid}% of viewport ${info.viewportH}`)
  await context.close()
}

await check('pixel7', devices['Pixel 7'])
await check('iphone14', devices['iPhone 14'])
await check('iphonese', devices['iPhone SE'])

await browser.close()
