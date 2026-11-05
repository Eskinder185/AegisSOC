import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { login, resetData, runDemo } from './helpers'

test.describe('Topology explorer', () => {
  test('empty state is honest, then real hosts and source links appear', async ({ page, request }) => {
    await resetData(request)
    await login(page)
    await page.goto('/app/topology')
    await expect(page.getByText('No hosts observed yet')).toBeVisible()
    await runDemo(page)
    await page.goto('/app/topology')
    const host = page.getByRole('button', { name: /^ws-fin-02,/ })
    await expect(host).toBeVisible()
    await host.click()
    await expect(page.getByRole('complementary', { name: 'Selection details' })).toContainText('ws-fin-02')
    await expect(page.getByRole('complementary', { name: 'Selection details' })).toContainText('not proof that it is online')
    await page.screenshot({ path: 'test-results/redesign/topology.png' })
    // table alternative carries the same hosts
    await page.getByRole('button', { name: 'Table' }).click()
    await expect(page.getByRole('table')).toContainText('ws-fin-02')
    // filter + deep link into the asset page
    await page.getByLabel('Only hosts with open alerts').check()
    await page.goto('/app/assets?host=ws-fin-02')
    await expect(page.getByText('ws-fin-02').first()).toBeVisible()
  })

  test('no serious accessibility violations', async ({ page }) => {
    await login(page)
    await page.goto('/app/topology')
    await expect(page.getByRole('button', { name: /^ws-fin-02,/ })).toBeVisible()
    const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze()
    expect(res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical').map((v) => v.id + ': ' + v.nodes[0].html.slice(0, 120))).toEqual([])
  })
})
