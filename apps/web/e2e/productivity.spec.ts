import AxeBuilder from '@axe-core/playwright'
import { expect, test } from '@playwright/test'
import { login, resetData, runDemo } from './helpers'

test.describe('Productivity: palette, shortcuts, triage, saved views, sidebar', () => {
  test.beforeAll(async ({ playwright }) => {
    const ctx = await playwright.request.newContext({ baseURL: 'http://127.0.0.1:5180' })
    await resetData(ctx)
    await ctx.dispose()
  })

  test.beforeEach(async ({ page }) => {
    await login(page)
    await runDemo(page)
  })

  test('command palette navigates to pages and finds real alerts', async ({ page }) => {
    await page.keyboard.press('Control+k')
    const box = page.getByRole('combobox', { name: /Search pages/ })
    await expect(box).toBeFocused()
    await box.fill('hunt')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/app\/hunt/)

    await page.keyboard.press('Control+k')
    await page.getByRole('combobox', { name: /Search pages/ }).fill('Repeated failed')
    const option = page.getByRole('option', { name: /Repeated failed sign-ins/ }).first()
    await expect(option).toBeVisible()
    await option.click()
    await expect(page).toHaveURL(/\/app\/alerts\/\d+/)
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' })).toBeVisible()
  })

  test('palette has no serious accessibility violations', async ({ page }) => {
    await page.keyboard.press('Control+k')
    await expect(page.getByRole('combobox', { name: /Search pages/ })).toBeVisible()
    const res = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag22aa']).analyze()
    expect(res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical')).toEqual([])
  })

  test('chord shortcuts and help dialog', async ({ page }) => {
    await page.keyboard.press('g')
    await page.keyboard.press('a')
    await expect(page).toHaveURL(/\/app\/alerts/)
    await page.keyboard.press('?')
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog', { name: 'Keyboard shortcuts' })).toBeHidden()
  })

  test('keyboard triage: j/k moves, x selects, Enter opens', async ({ page }) => {
    await page.goto('/app/alerts')
    await expect(page.locator('tbody tr').first()).toBeVisible()
    await page.keyboard.press('j')
    await page.keyboard.press('j')
    await page.keyboard.press('k')
    await expect(page.locator('tr[data-cursor="true"]')).toHaveCount(1)
    await page.keyboard.press('x')
    await expect(page.getByRole('region', { name: 'Bulk actions' })).toContainText('1 selected')
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(/\/app\/alerts\/\d+/)
  })

  test('saved views persist a filter and can be reapplied', async ({ page }) => {
    await page.goto('/app/alerts?severity=HIGH')
    await page.getByRole('button', { name: 'Save view' }).click()
    await page.getByLabel('View name').fill('High only')
    await page.getByRole('dialog').getByRole('button', { name: 'Save view' }).click()
    await page.goto('/app/alerts')
    await page.getByLabel('Saved views').selectOption('High only')
    await expect(page).toHaveURL(/severity=HIGH/)
    expect(await page.evaluate(() => localStorage.getItem('aegis.alertViews'))).toContain('High only')
  })

  test('sidebar collapses, keeps labels for assistive tech, and remembers the choice', async ({ page }) => {
    await page.getByRole('button', { name: 'Collapse sidebar' }).click()
    await expect(page.getByRole('navigation', { name: 'Primary' }).getByRole('link', { name: 'Alerts' })).toBeVisible()
    await page.reload()
    await expect(page.getByRole('button', { name: 'Expand sidebar' })).toBeVisible()
    await page.getByRole('button', { name: 'Expand sidebar' }).click()
  })
})
