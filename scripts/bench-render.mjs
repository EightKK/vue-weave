// Measures rendering in headless Chromium: GanttChart, NetworkGraph and (when the build has it) TreeGrid mounted with
// generated data at a few sizes. Run after `npm run build` (`npm run bench:render` does both). It reports
//   - first render: mount start to the end of the first painted frame,
//   - scroll: frame duration (p50, p95) while the view moves a little every frame for 120 frames,
//   - drag: one pointer drag with the real mouse, as the time from each pointermove to the end of the next frame, and
//     from release to the parent receiving the proposal and to the applied change being painted.
// It applies no pass/fail threshold and is not part of `test:e2e`. The numbers belong to one machine; see
// docs/performance.md.
//
//   node scripts/bench-render.mjs [--runs 3] [--only gantt,graph,treegrid]
//
// CHROMIUM_PATH selects an existing Chromium (launched with --no-sandbox --no-zygote --disable-gpu, as in
// playwright.config.ts). VW_PORT fixes the port of the static server that serves dist/ and the page in scripts/bench/;
// by default a free port is used.
import { chromium } from '@playwright/test'
import { createReadStream, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { cpus } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
const args = process.argv.slice(2)
const option = (flag, fallback) => { const at = args.indexOf(flag); return at === -1 ? fallback : args[at + 1] }
const runs = Number(option('--runs', 3))
if (!Number.isInteger(runs) || runs < 1) throw new Error('--runs must be a positive integer')
const only = option('--only', '')?.split(',').filter(Boolean)

if (!existsSync(join(root, 'dist', 'index.js'))) throw new Error('dist/ is missing. Run `npm run build` first.')

const files = {
  '/': ['scripts/bench/render.html', 'text/html; charset=utf-8'],
  '/lib/vue.js': ['node_modules/vue/dist/vue.esm-browser.prod.js', 'text/javascript'],
  '/lib/index.js': ['dist/index.js', 'text/javascript'],
  '/lib/style.css': ['dist/style.css', 'text/css'],
}
const server = createServer((request, response) => {
  const path = new URL(request.url, 'http://127.0.0.1').pathname
  // The entry imports its shared chunk by relative name (./core-<hash>.js).
  const chunk = /^\/lib\/(core-[\w-]+\.js)$/.exec(path)
  if (path === '/favicon.ico') { response.writeHead(204).end(); return }
  const entry = chunk ? [`dist/${chunk[1]}`, 'text/javascript'] : files[path]
  if (!entry || !existsSync(join(root, entry[0]))) { response.writeHead(404).end('Not found'); return }
  response.writeHead(200, { 'Content-Type': entry[1], 'Cache-Control': 'no-cache' })
  createReadStream(join(root, entry[0])).pipe(response)
})
await new Promise(resolve => server.listen(Number(process.env.VW_PORT ?? 0), '127.0.0.1', resolve))
const origin = `http://127.0.0.1:${server.address().port}`

const browser = await chromium.launch(process.env.CHROMIUM_PATH
  ? { executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox', '--no-zygote', '--disable-gpu'] }
  : {})

const median = values => {
  const sorted = values.filter(value => value !== null && value !== undefined).sort((a, b) => a - b)
  if (!sorted.length) return null
  const middle = sorted.length >> 1
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

const scenarios = [
  { kind: 'gantt', label: 'GanttChart (rows, one bar each, chained dependencies)', sizes: [100, 1000, 5000], bar: '.vw-gantt-bar' },
  { kind: 'graph', label: 'NetworkGraph (layered layout, draggable)', sizes: [100, 1000, 3000], bar: '.vw-network-node' },
  { kind: 'graph-culled', label: 'NetworkGraph with cullOffscreen', sizes: [1000, 3000], bar: '.vw-network-node' },
  { kind: 'treegrid', label: 'TreeGrid (roots expanded)', sizes: [[1000, 20], [10000, 50], [50000, 100]] },
].filter(item => !only?.length || only.includes(item.kind))

async function once(scenario, spec) {
  const [size, columns] = Array.isArray(spec) ? spec : [spec, undefined]
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const problems = []
  page.on('pageerror', error => problems.push(error.message))
  page.on('console', message => { if (message.type() === 'error') problems.push(message.text()) })
  try {
    await page.goto(origin + '/')
    await page.waitForFunction(() => window.benchReady === true)
    if (scenario.kind === 'treegrid' && !(await page.evaluate(() => window.bench.has('TreeGrid')))) return null
    const mounted = await page.evaluate(options => window.bench.mount(options), { kind: scenario.kind, size, columns })
    const scroll = await page.evaluate(() => window.bench.scroll(120))
    let drag = null
    if (scenario.bar) {
      if (scenario.kind.startsWith('graph')) await page.evaluate(() => window.bench.placeGraph())
      else await page.evaluate(() => { document.querySelector('.vw-gantt-scroll').scrollTop = 0; document.querySelector('.vw-gantt-scroll').scrollLeft = 0 })
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
      const target = page.locator(scenario.bar).first()
      const box = await target.boundingBox()
      if (!box) throw new Error(`${scenario.kind} ${size}: no visible ${scenario.bar}`)
      const x = box.x + box.width / 2, y = box.y + box.height / 2
      await page.mouse.move(x, y)
      await page.evaluate(() => window.bench.armInteraction())
      await page.mouse.down()
      for (let step = 1; step <= 12; step++) await page.mouse.move(x + step * 5, y + step * 2)
      await page.mouse.up()
      drag = await page.evaluate(() => window.bench.readInteraction())
    }
    if (problems.length) throw new Error(`${scenario.kind} ${size}: page errors: ${problems.join('; ')}`)
    return { mounted, scroll, drag }
  } finally {
    await page.close()
  }
}

const results = []
for (const scenario of scenarios) {
  for (const spec of scenario.sizes) {
    const [size, columns] = Array.isArray(spec) ? spec : [spec, undefined]
    const samples = []
    for (let i = 0; i < runs; i++) {
      const sample = await once(scenario, spec)
      if (!sample) break
      samples.push(sample)
    }
    if (!samples.length) { console.error(`${scenario.kind}: not in this build, skipped`); break }
    const pick = get => median(samples.map(get))
    const row = {
      kind: scenario.kind, size, columns, runs: samples.length,
      domNodes: samples[0].mounted.domNodes,
      firstRenderMs: pick(s => s.mounted.firstRenderMs),
      scrollP50Ms: pick(s => s.scroll.p50), scrollP95Ms: pick(s => s.scroll.p95), scrollMaxMs: pick(s => s.scroll.max),
      dragMoveP50Ms: pick(s => s.drag?.moves.p50 ?? null), dragMoveP95Ms: pick(s => s.drag?.moves.p95 ?? null),
      dragProposalMs: pick(s => s.drag?.proposalMs ?? null), dragAppliedMs: pick(s => s.drag?.appliedMs ?? null),
    }
    results.push(row)
    console.error(`${scenario.kind} ${size}${columns ? ' x ' + columns : ''}: first render ${row.firstRenderMs.toFixed(0)} ms, scroll p95 ${row.scrollP95Ms.toFixed(1)} ms`)
  }
}
const browserVersion = browser.version()
await browser.close()
server.close()

const fmt = value => value === null || value === undefined ? 'n/a' : value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1) : value.toFixed(2)
const lines = ['| Component | Size | DOM nodes | First render (ms) | Scroll frame p50 / p95 (ms) | Drag move p50 / p95 (ms) | Drag release to proposal (ms) | Drag release to painted change (ms) |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
for (const row of results) {
  lines.push(`| ${row.kind} | ${row.size}${row.columns ? ' x ' + row.columns : ''} | ${row.domNodes} | ${fmt(row.firstRenderMs)} | ${fmt(row.scrollP50Ms)} / ${fmt(row.scrollP95Ms)} | ${fmt(row.dragMoveP50Ms)} / ${fmt(row.dragMoveP95Ms)} | ${fmt(row.dragProposalMs)} | ${fmt(row.dragAppliedMs)} |`)
}
console.log(lines.join('\n'))

const out = join(root, 'artifacts', 'bench')
mkdirSync(out, { recursive: true })
writeFileSync(join(out, 'render.json'), JSON.stringify({
  measuredAt: new Date().toISOString(), node: process.version, browser: 'Chromium ' + browserVersion,
  cpu: cpus()[0]?.model, cores: cpus().length, runs, rows: results,
}, null, 2) + '\n')
console.error(`\nWrote ${join(out, 'render.json')}`)
