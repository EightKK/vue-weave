import { defineConfig } from '@playwright/test'

const port = Number(process.env.VW_PORT) || 4173

export default defineConfig({
  testDir: './test/browser',
  fullyParallel: false,
  // The specs share one static server on port 4173 (VW_PORT overrides it) and must not depend on each other or on server state.
  // Two workers run whole files side by side (fullyParallel stays off); fixed, so CI and local runs behave the same.
  workers: 2,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    viewport: { width: 1440, height: 1000 },
    launchOptions: process.env.CHROMIUM_PATH ? {
      executablePath: process.env.CHROMIUM_PATH,
      args: ['--no-sandbox', '--no-zygote', '--disable-gpu'],
    } : {},
  },
  webServer: {
    command: 'node scripts/serve.mjs',
    url: `http://127.0.0.1:${port}`,
    reuseExistingServer: false,
  },
})
