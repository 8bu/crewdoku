import { defineConfig, devices } from '@playwright/test'

// Browser E2E for the real app. Specs are `e2e/*.e2e.ts` so Vitest's default
// `*.test.ts` / `*.spec.ts` globs never collect them. The server is the
// production bundle under `vite preview`. `--mode e2e` keeps a local
// `.env.production` (the PostHog token) out of the build, so analytics stay
// off, and `dist-e2e` keeps that bundle away from the deployable `dist`.
const PORT = 4174
const BASE_URL = `http://localhost:${PORT}`
const CI = Boolean(process.env.CI)

export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.e2e.ts',
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 2 : 0,
  reporter: CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    // The app picks its language from the browser; pin it so labels are English.
    locale: 'en-US',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: `pnpm exec vite build --mode e2e --outDir dist-e2e && pnpm exec vite preview --outDir dist-e2e --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !CI,
    timeout: 120_000,
  },
})
