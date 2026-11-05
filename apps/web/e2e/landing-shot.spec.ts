import { test } from '@playwright/test'

// Visual review harness (not an assertion suite): writes screenshots to test-results/redesign.
const DIR = 'test-results/redesign'

test('landing shots', async ({ page }) => {
  test.setTimeout(150_000)
  for (const w of [1920, 1440, 1280, 768, 375]) {
    await page.setViewportSize({ width: w, height: w === 375 ? 812 : w === 768 ? 1024 : 900 })
    await page.goto('/')
    await page.waitForTimeout(2500)
    await page.screenshot({ path: `${DIR}/s-${w}-top.png` })
    await page.getByTestId('story-stage').scrollIntoViewIfNeeded()
    await page.waitForTimeout(600)
    await page.screenshot({ path: `${DIR}/s-${w}-story.png` })
  }
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Pause' }).click({ timeout: 8000 }).catch(() => {})
  for (const [i, name] of [[2, 'Collect'], [3, 'Detect'], [4, 'Investigate'], [5, 'Respond']] as const) {
    await page.getByRole('list', { name: 'Story steps' }).getByRole('button', { name: new RegExp(`${i}\\. ${name}`) }).click()
    await page.waitForTimeout(2200)
    await page.getByTestId('story-stage').scrollIntoViewIfNeeded()
    await page.screenshot({ path: `${DIR}/stage-${i}.png` })
  }
  await page.getByRole('button', { name: 'Explore the 3D Network' }).click()
  await page.waitForTimeout(1200)
  await page.getByRole('button', { name: 'AegisSOC', exact: true }).last().click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: `${DIR}/entity-selected.png` })
  await page.getByRole('button', { name: 'Analyst', exact: true }).first().click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${DIR}/analyst.png` })
  await page.getByRole('button', { name: 'Basic', exact: true }).first().click()
  await page.getByRole('tab', { name: 'Suspicious login' }).scrollIntoViewIfNeeded()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${DIR}/scenarios.png` })
  await page.evaluate(() => localStorage.setItem('aegis.theme', 'light'))
  await page.goto('/')
  await page.waitForTimeout(2500)
  await page.getByTestId('story-stage').scrollIntoViewIfNeeded()
  await page.getByRole('button', { name: 'Pause' }).click({ timeout: 8000 }).catch(() => {})
  await page.getByRole('list', { name: 'Story steps' }).getByRole('button', { name: /3\. Detect/ }).click()
  await page.waitForTimeout(2000)
  await page.screenshot({ path: `${DIR}/light-stage-3.png` })
})
