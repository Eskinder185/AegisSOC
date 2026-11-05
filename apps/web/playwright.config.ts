import { defineConfig, devices } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Load the local-only dev password from the repo .env (never committed). CI passes AEGIS_DEV_PASSWORD directly.
try {
  const env = readFileSync(resolve(process.cwd(), '../../.env'), 'utf8')
  for (const line of env.split(/\r?\n/)) {
    const m = /^([A-Z_]+)=(.*)$/.exec(line)
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2]
  }
} catch {
  /* no .env: rely on the environment */
}

export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { actionTimeout: 10_000, baseURL: 'http://127.0.0.1:5180', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  webServer: { command: 'npm run dev', url: 'http://127.0.0.1:5180', reuseExistingServer: true, timeout: 60_000 },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1360, height: 900 } } },
  ],
})
