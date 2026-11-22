// Generates the card thumbnails of the documentation site: one screenshot of the live demo of every example and
// showcase in site/examples/registry.ts, written to site/public/thumbnails/<id>.png.
// Run it by hand after adding or visibly changing an example; it is not part of CI:
//
//   npm run build:demo && node scripts/site-thumbnails.mjs [id ...]
//
// It serves preview/ with scripts/serve.mjs, so build first. Screenshots are taken at 1280×800 CSS pixels and scaled
// to 640×400 with Pillow (python3), quantized to a 256-colour palette to keep the files small. CHROMIUM_PATH selects a
// Chromium executable as in playwright.config.ts. Pass IDs to regenerate only those thumbnails.
import { spawn, execFileSync } from 'node:child_process'
import { mkdir, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from '@playwright/test'
import { examples } from '../site/examples/registry.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
const output = join(root, 'site', 'public', 'thumbnails')
const only = new Set(process.argv.slice(2))
const width = 1280, height = 800

const targets = examples
  .map(entry => ({ id: entry.id, path: `${entry.kind === 'showcase' ? 'showcase' : 'examples'}/${entry.id}/` }))
  .filter(target => only.size === 0 || only.has(target.id))

const server = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: root, env: { ...process.env, VW_PORT: '0' }, stdio: ['ignore', 'pipe', 'inherit'] })
const base = await new Promise((resolve, reject) => {
  let text = ''
  const timer = setTimeout(() => reject(new Error('The server did not start. Run npm run build:demo first.')), 10000)
  server.once('exit', code => { clearTimeout(timer); reject(new Error('The server exited: ' + code)) })
  server.stdout.on('data', data => {
    const match = (text += data).match(/http:\/\/127\.0\.0\.1:\d+\/vue-weave\//)
    if (match) { clearTimeout(timer); resolve(match[0]) }
  })
})

const work = join(tmpdir(), 'vue-weave-thumbnails-' + process.pid)
await mkdir(work, { recursive: true })
await mkdir(output, { recursive: true })
const browser = await chromium.launch(process.env.CHROMIUM_PATH
  ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox', '--no-zygote', '--disable-gpu'] } : {})
try {
  const page = await browser.newPage({ viewport: { width: width + 96, height: height + 400 }, deviceScaleFactor: 1, reducedMotion: 'reduce' })
  for (const target of targets) {
    await page.goto(base + target.path)
    await page.locator('.vw-site-frame[data-ready]').waitFor()
    const box = await page.locator('.vw-site-demo').boundingBox()
    if (!box) throw new Error('No demo panel on ' + target.path)
    // Below the fixed navigation bar.
    await page.evaluate(y => window.scrollTo(0, y), box.y - 80)
    const panel = await page.locator('.vw-site-demo').boundingBox()
    // A demo shorter than the thumbnail is captured at its own height and a narrower width, keeping the 16:10 shape, so
    // the page below the demo panel stays out of the picture.
    const clipHeight = Math.min(height, Math.floor(panel.height))
    const clip = { x: panel.x, y: panel.y, width: Math.min(panel.width, Math.round(clipHeight * width / height)), height: clipHeight }
    // Let layouts, fits and transitions settle.
    await page.waitForTimeout(800)
    const raw = join(work, target.id + '.png')
    await page.screenshot({ path: raw, clip })
    const file = join(output, target.id + '.png')
    execFileSync('python3', ['-I', '-c', [
      'import sys',
      'from PIL import Image',
      'image = Image.open(sys.argv[1]).convert("RGB").resize((640, 400), Image.LANCZOS)',
      'image.quantize(colors=256, method=Image.Quantize.MEDIANCUT, dither=Image.Dither.NONE).save(sys.argv[2], optimize=True)',
    ].join('\n'), raw, file])
    console.log('Wrote ' + file)
  }
} finally {
  await browser.close()
  server.kill()
  await rm(work, { recursive: true, force: true })
}
