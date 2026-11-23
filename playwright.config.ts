import { defineConfig } from '@playwright/test'

const requestedPort = process.env.VW_PORT?.trim() || '4173'
const port = Number(requestedPort)
// Port 0 would make serve.mjs pick a port the config cannot know, so the tests need a fixed one.
if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new RangeError(`VW_PORT must be a port number from 1 to 65535 for the browser tests, not "${requestedPort}".`)
}
const ci = Boolean(process.env.CI)

// Chromium is the default and the only engine the blocking CI job runs. Firefox and WebKit are opt-in:
// VW_BROWSERS=chromium,firefox,webkit (any comma-separated subset; see `npm run test:e2e:all`).
const engines = ['chromium', 'firefox', 'webkit'] as const
const requested = (process.env.VW_BROWSERS || 'chromium').split(',').map(name => name.trim()).filter(Boolean)
const unknown = requested.filter(name => !(engines as readonly string[]).includes(name))
if (unknown.length > 0 || requested.length === 0) {
  throw new Error(`VW_BROWSERS must list browsers from ${engines.join(', ')} separated by commas, got "${process.env.VW_BROWSERS}"${unknown.length ? ` (unknown: ${unknown.join(', ')})` : ''}`)
}

const projectFor = {
  // CHROMIUM_PATH selects an existing executable; these launch options apply to this project only.
  chromium: {
    name: 'chromium',
    use: {
      browserName: 'chromium' as const,
      launchOptions: process.env.CHROMIUM_PATH ? {
        executablePath: process.env.CHROMIUM_PATH,
        args: ['--no-sandbox', '--no-zygote', '--disable-gpu'],
      } : {},
    },
  },
  firefox: { name: 'firefox', use: { browserName: 'firefox' as const } },
  webkit: { name: 'webkit', use: { browserName: 'webkit' as const } },
}

export default defineConfig({
  testDir: './test/browser',
  fullyParallel: false,
  // The specs share one static server on port 4173 (VW_PORT overrides it) and must not depend on each other or on server state.
  // Two workers run whole files side by side (fullyParallel stays off); fixed, so CI and local runs behave the same.
  workers: 2,
  // One retry on CI absorbs a rare timing flake; a retry that passes is reported as flaky, not hidden.
  retries: ci ? 1 : 0,
  reporter: ci ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    // The site and the demo pages are served under /vue-weave/, as on GitHub Pages (scripts/serve.mjs). Specs open
    // them with relative URLs (`gallery.html`, `examples/tree-grid/`); the regression fixtures use absolute paths
    // (`/gantt-test/`) that page.route serves without the server.
    baseURL: `http://127.0.0.1:${port}/vue-weave/`,
    // Traces (kept for failed tests only) go to test-results/ and are uploaded by the CI browser job.
    trace: ci ? 'retain-on-failure' : 'off',
    viewport: { width: 1440, height: 1000 },
  },
  projects: engines.filter(name => requested.includes(name)).map(name => projectFor[name]),
  webServer: {
    command: 'node scripts/serve.mjs --strict-port',
    url: `http://127.0.0.1:${port}/vue-weave/`,
    reuseExistingServer: false,
  },
})
