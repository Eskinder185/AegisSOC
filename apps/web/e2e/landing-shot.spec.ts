import { test } from '@playwright/test'
const DIR = 'test-results/redesign'
test('landing shots', async ({ page }) => {
  for (const [w, h] of [[1440, 900], [375, 812]] as const) {
    await page.setViewportSize({ width: w, height: h })
    await page.goto('/')
    await page.waitForTimeout(2500)
    await page.screenshot({ path: `${DIR}/landing-${w}.png` })
    await page.getByTestId('network-hero').scrollIntoViewIfNeeded()
    await page.waitForTimeout(800)
    await page.screenshot({ path: `${DIR}/hero-${w}.png` })
  }
})

test('landing has no horizontal overflow on phone', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await page.waitForTimeout(1500)
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  if (over > 0) throw new Error('overflow ' + over)
})
