import AxeBuilder from '@axe-core/playwright'
import { expect, test, type Page } from '@playwright/test'

const stage = (p: Page) => p.getByTestId('story-stage')
const status = (p: Page) => p.getByTestId('step-status')
const aside = (p: Page) => p.getByRole('complementary', { name: 'Explanation' })
const stopAutoplay = (p: Page) => p.getByRole('button', { name: 'Pause' }).click({ timeout: 8000 }).catch(() => {})

test.describe('Homepage story', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await expect(status(page)).toContainText('Step 1 of 5')
  })

  test('renders the 3D scene by default with the same story available as text', async ({ page }) => {
    await expect(stage(page)).toHaveAttribute('data-mode', '3d')
    await expect(page.locator('canvas')).toBeVisible()
    await expect(stage(page).getByText('Computer', { exact: true })).toBeVisible()
    await expect(aside(page)).toContainText('Your computers and services create activity records')
  })

  test('step controls: next, back, pause, replay, direct step buttons', async ({ page }) => {
    await stopAutoplay(page)
    await page.getByRole('button', { name: /^Next/ }).click()
    await expect(status(page)).toContainText('Step 2 of 5 — Collect security information')
    await expect(aside(page)).toContainText('AegisSOC receives security information from connected sources.')
    await page.getByRole('button', { name: /^Next/ }).click()
    await expect(status(page)).toContainText('Step 3 of 5 — Detect suspicious activity')
    await page.getByRole('button', { name: /Back/ }).click()
    await expect(status(page)).toContainText('Step 2 of 5')
    await page.getByRole('list', { name: 'Story steps' }).getByRole('button', { name: /5\. Respond/ }).click()
    await expect(status(page)).toContainText('Step 5 of 5 — Respond and improve')
    await expect(aside(page)).toContainText('measure whether security improvements worked')
    await expect(page.getByRole('button', { name: /^Next/ })).toBeDisabled()
    await page.getByRole('button', { name: 'Replay' }).click()
    await expect(status(page)).toContainText('Step 1 of 5')
  })

  test('autoplay advances, and Pause stops it', async ({ page }) => {
    test.setTimeout(45_000)
    await expect(page.getByRole('button', { name: 'Pause' })).toBeVisible({ timeout: 8000 })
    await expect(status(page)).toContainText('Step 2 of 5', { timeout: 12_000 })
    await page.getByRole('button', { name: 'Pause' }).click()
    await page.waitForTimeout(9000)
    await expect(status(page)).toContainText('Step 2 of 5')
  })

  test('every object explains itself, plainly first and technically on demand', async ({ page }) => {
    await page.getByRole('button', { name: 'Explore the 3D Network' }).click()
    await expect(status(page)).toContainText('Exploring')
    const names = ['Computer', 'Server', 'Network equipment', 'Security sensor', 'AegisSOC', 'Security alert', 'Security analyst']
    for (const n of names) {
      await aside(page).getByRole('button', { name: n, exact: true }).click()
      const d = page.getByTestId('entity-detail')
      await expect(d.getByRole('heading', { level: 3, name: n })).toBeVisible()
      await expect(d.getByText('What is this?')).toBeVisible()
      await expect(d.getByText('Why does it matter?')).toBeVisible()
      await expect(d.getByText('Real-world example')).toBeVisible()
      await expect(d.getByText('Learn more: technical details')).toBeVisible()
      await aside(page).getByRole('button', { name: /Back to this step/ }).click()
    }
    await page.getByRole('button', { name: 'Back to the guided tour' }).click()
    await expect(status(page)).toContainText('Step 1 of 5')
  })

  test('every connection says what moves, why, and whether it is real, simulated or planned', async ({ page }) => {
    await page.getByRole('button', { name: 'Explore the 3D Network' }).click()
    const n = await aside(page).getByRole('button', { name: /→/ }).count()
    expect(n).toBe(7)
    for (let i = 0; i < n; i++) {
      await aside(page).getByRole('button', { name: /→/ }).nth(i).click()
      const d = page.getByTestId('connection-detail')
      await expect(d.getByText('What is exchanged?')).toBeVisible()
      await expect(d.getByText('Why does it matter?')).toBeVisible()
      await expect(d.locator('.badge')).toContainText(/Works in this build|Example from practice data|Planned/)
      await aside(page).getByRole('button', { name: /Back to this step/ }).click()
    }
    await aside(page).getByRole('button', { name: /Suspicious activity is flagged/ }).click()
    await expect(page.getByTestId('connection-detail')).toContainText('Example from practice data')
  })

  test('Analyst mode swaps in technical names and opens technical details; Basic restores plain language', async ({ page }) => {
    await stopAutoplay(page)
    await page.getByRole('button', { name: 'Analyst', exact: true }).first().click()
    await page.getByRole('list', { name: 'Story steps' }).getByRole('button', { name: /2\. Collect/ }).click()
    await aside(page).getByRole('button', { name: 'Data source / collector' }).click()
    await expect(page.getByTestId('entity-detail').locator('details')).toHaveAttribute('open', '')
    await expect(page.getByTestId('entity-detail')).toContainText('Suricata EVE import')
    expect(await page.evaluate(() => localStorage.getItem('aegis.landingMode'))).toBe('analyst')
    await page.getByRole('button', { name: 'Basic', exact: true }).first().click()
    await aside(page).getByRole('button', { name: /Back to this step/ }).click()
    await expect(aside(page).getByRole('button', { name: 'Security sensor', exact: true })).toBeVisible()
  })

  test('simple 2D diagram carries the same content and is operable by keyboard', async ({ page }) => {
    await page.getByRole('button', { name: 'Simple diagram' }).click()
    await expect(stage(page)).toHaveAttribute('data-mode', 'flat')
    const flat = page.getByRole('group', { name: 'The same story as a simple diagram' })
    await expect(flat.getByRole('button')).toHaveCount(7)
    await flat.getByRole('button', { name: /AegisSOC/ }).focus()
    await page.keyboard.press('Enter')
    await expect(page.getByTestId('entity-detail').getByRole('heading', { level: 3, name: 'AegisSOC' })).toBeVisible()
  })

  test('four security examples, switchable by mouse and arrow keys, each fully explained', async ({ page }) => {
    const tabs = page.getByRole('tablist', { name: 'Security examples' }).getByRole('tab')
    await expect(tabs).toHaveCount(4)
    for (const t of ['Suspicious login', 'Unusual network activity', 'Unauthorized access attempt', 'Possible malware activity']) {
      await page.getByRole('tab', { name: t }).click()
      const panel = page.getByRole('tabpanel')
      await expect(panel).toContainText('Practice data')
      for (const h of ['What AegisSOC can see', 'Why it may be suspicious', 'How an analyst investigates', 'What a defensive response might involve', 'Evidence needed to confirm it']) await expect(panel.getByText(h)).toBeVisible()
      await expect(panel.getByRole('list', { name: 'What happens, in order' }).getByRole('listitem')).toHaveCount(3)
    }
    await page.getByRole('tab', { name: 'Suspicious login' }).focus()
    await page.keyboard.press('ArrowRight')
    await expect(page.getByRole('tab', { name: 'Unusual network activity' })).toHaveAttribute('aria-selected', 'true')
  })

  test('glossary terms explain themselves and close with Escape', async ({ page }) => {
    await page.getByRole('button', { name: 'telemetry' }).click()
    await expect(page.getByRole('note')).toContainText('activity records')
    await page.keyboard.press('Escape')
    await expect(page.getByRole('note')).toHaveCount(0)
  })

  test('capability numbers never imply live monitoring', async ({ page }) => {
    await expect(page.getByText('Not connected')).toBeVisible()
    await expect(page.getByText('Live monitoring')).toBeVisible()
    await expect(page.getByText('Disabled', { exact: true })).toBeVisible()
    await expect(page.getByText('Security checks included')).toBeVisible()
  })

  test('Open the app leads to sign-in', async ({ page }) => {
    await page.getByRole('link', { name: 'Open the app' }).first().click()
    await expect(page).toHaveURL(/\/login/)
  })

  for (const mode of ['dark', 'light'] as const) {
    test(`accessibility: no serious violations (${mode}, 3D view)`, async ({ page }) => {
      await page.evaluate((m) => { localStorage.setItem('aegis.theme', m) }, mode)
      await page.reload()
      await expect(status(page)).toContainText('Step 1 of 5')
      await page.waitForTimeout(1200)
      const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze()
      expect(res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => `${v.id}: ${v.nodes[0].html.slice(0, 140)}`)).toEqual([])
    })
  }
})

test('falls back to the 2D diagram when WebGL is unavailable', async ({ page }) => {
  await page.addInitScript(() => {
    const orig = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement, type: string, ...a: unknown[]) {
      if (/webgl/i.test(type)) return null
      return (orig as (...x: unknown[]) => unknown).call(this, type, ...a)
    } as typeof orig
  })
  await page.goto('/')
  await expect(stage(page)).toHaveAttribute('data-mode', 'flat')
  await expect(page.getByRole('button', { name: '3D scene' })).toBeDisabled()
  await page.getByRole('button', { name: /^Next/ }).click()
  await expect(status(page)).toContainText('Step 2 of 5')
})

test('reduced motion: no autoplay, story still fully usable', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await page.waitForTimeout(1500)
  await expect(page.getByRole('button', { name: 'Start the tour' })).toBeVisible()
  await expect(status(page)).toContainText('Step 1 of 5')
  await page.getByRole('button', { name: /^Next/ }).click()
  await expect(status(page)).toContainText('Step 2 of 5')
})

for (const [w, h] of [[375, 812], [768, 1024], [1280, 800], [1920, 1080]] as const) {
  test(`no horizontal overflow at ${w}px`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: h })
    await page.goto('/')
    await page.waitForTimeout(1200)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0)
  })
}

test('phone defaults to the simple diagram, and 3D is still available on request', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await page.goto('/')
  await expect(stage(page)).toHaveAttribute('data-mode', 'flat')
  await page.getByRole('button', { name: '3D scene' }).click()
  await expect(stage(page)).toHaveAttribute('data-mode', '3d')
})
