// Runs the browser tests on the engines named on the command line (default: chromium, firefox and webkit) by setting
// VW_BROWSERS for playwright.config.ts, so the scripts work the same on Windows and POSIX shells.
//   node scripts/e2e-browsers.mjs                  all three engines
//   node scripts/e2e-browsers.mjs firefox webkit   those two
//   node scripts/e2e-browsers.mjs firefox -- test/browser/gantt-view.spec.ts   extra arguments go to playwright
// Install the engines once with `npx playwright install chromium firefox webkit`. Build the library and the demo first.
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'

const separator = process.argv.indexOf('--')
const named = process.argv.slice(2, separator === -1 ? undefined : separator)
const extra = separator === -1 ? [] : process.argv.slice(separator + 1)
const engines = named.length > 0 ? named : ['chromium', 'firefox', 'webkit']

const cli = createRequire(import.meta.url).resolve('@playwright/test/cli')
const child = spawn(process.execPath, [cli, 'test', ...extra], {
  stdio: 'inherit',
  env: { ...process.env, VW_BROWSERS: engines.join(',') },
})
child.on('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)))
