import { expect, type APIRequestContext, type Page } from '@playwright/test'

export const PASSWORD = process.env.AEGIS_DEV_PASSWORD ?? ''

/** Signs in through the real login form. */
export async function login(page: Page, user = 'analyst') {
  expect(PASSWORD, 'AEGIS_DEV_PASSWORD must be set (see .env)').not.toBe('')
  await page.goto('/login')
  await page.getByLabel('Username').fill(user)
  await page.getByLabel('Password').fill(PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
  await expect(page).toHaveURL(/\/app/)
}

/** Resets telemetry/case state through the guarded dev-reset endpoint (admin + confirmation header). */
export async function resetData(request: APIRequestContext) {
  const login = await request.post('/api/auth/login', { data: { username: 'admin', password: PASSWORD } })
  expect(login.ok(), `login ${login.status()} ${await login.text()} pwlen=${PASSWORD.length}`).toBeTruthy()
  const csrf = (await request.storageState()).cookies.find((c) => c.name === 'XSRF-TOKEN')?.value
  const headers: Record<string, string> = { 'X-Confirm': 'DELETE-DEV-DATA' }
  if (csrf) headers['X-XSRF-TOKEN'] = decodeURIComponent(csrf)
  const res = await request.post('/api/admin/dev/reset', { headers })
  expect(res.ok(), await res.text()).toBeTruthy()
  // rules back to built-in v1 so the detection-improvement journey is repeatable
  await request.post('/api/auth/logout', { headers })
}

export async function runDemo(page: Page) {
  await page.goto('/app')
  await page.getByRole('button', { name: /Run safe demo/ }).first().click()
  await expect(page.getByText(/Demo replayed/)).toBeVisible({ timeout: 45_000 })
}
