// The demo shell, themes, forced colours, reduced motion, print, image export and the design gallery showcases.
import { expect, test, ganttRegion, openComponentFixture, openDemo, openGanttFixture, openTimelineEditing, pageErrors } from './support'

test('demo built-in theme switch applies the stylesheet theme classes', async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto('/gallery.html')
  const demo = page.locator('.demo')
  const surface = () => page.locator('.vw-network').first().evaluate(el => getComputedStyle(el).getPropertyValue('--vw-surface').trim())
  expect(await surface()).toBe('')
  await page.getByLabel('Built-in theme').selectOption('vw-theme-dark')
  await expect(demo).toHaveClass(/vw-theme-dark/)
  expect(await surface()).toBe('#182a37')
  await page.getByLabel('Built-in theme').selectOption('vw-theme-auto')
  await expect(demo).toHaveClass(/vw-theme-auto/)
  expect(await surface()).toBe('')
  await page.emulateMedia({ colorScheme: 'dark' })
  expect(await surface()).toBe('#182a37')
  expect(errors).toEqual([])
})

test('mobile layout and horizontal scrolling', async ({ page }) => {
  const errors = pageErrors(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/gallery.html')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  const viewport = ganttRegion(page)
  expect(await viewport.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true })
  expect(errors).toEqual([])
})

test('opt-in dark theme classes apply built-in variables; auto follows the colour scheme', async ({ page }) => {
  const errors = pageErrors(page)
  await openComponentFixture(page)
  const gantt = page.locator('.vw-gantt').first()
  const graph = page.locator('.vw-network').first()
  const read = (locator: typeof gantt) => locator.evaluate(el => ({
    surface: getComputedStyle(el).getPropertyValue('--vw-surface').trim(),
    now: getComputedStyle(el).getPropertyValue('--vw-now').trim(),
    color: getComputedStyle(el).color,
  }))
  const light = await read(gantt)
  expect(light.surface).toBe('')
  await gantt.evaluate(el => el.classList.add('vw-theme-dark'))
  await graph.evaluate(el => el.classList.add('vw-theme-dark'))
  expect(await read(gantt)).toEqual({ surface: '#182a37', now: '#ff8f7a', color: 'rgb(229, 237, 243)' })
  expect((await read(graph)).surface).toBe('#182a37')
  await expect(gantt).toHaveCSS('background-color', 'rgb(24, 42, 55)')
  await gantt.evaluate(el => el.classList.replace('vw-theme-dark', 'vw-theme-auto'))
  expect((await read(gantt)).surface).toBe('')
  await page.emulateMedia({ colorScheme: 'dark' })
  expect((await read(gantt)).surface).toBe('#182a37')
  await page.emulateMedia({ colorScheme: 'light' })
  expect((await read(gantt)).surface).toBe('')
  expect(errors).toEqual([])
})

test('forced colors use system colours for bars and selection', async ({ page }) => {
  const errors = pageErrors(page)
  await page.emulateMedia({ forcedColors: 'active' })
  await openComponentFixture(page)
  const bar = page.locator('.vw-gantt-bar').first()
  await expect(bar).toBeVisible()
  expect(await page.evaluate(() => matchMedia('(forced-colors: active)').matches)).toBe(true)
  const styles = await bar.evaluate(el => {
    const probe = document.createElement('span')
    probe.style.color = 'CanvasText'
    document.body.append(probe)
    const canvasText = getComputedStyle(probe).color
    probe.remove()
    const cs = getComputedStyle(el)
    return { adjust: cs.forcedColorAdjust, border: cs.borderTopColor, canvasText }
  })
  expect(styles.adjust).toBe('none')
  expect(styles.border).toBe(styles.canvasText)
  await bar.focus()
  await expect(bar).toHaveCSS('outline-style', 'solid')
  expect(errors).toEqual([])
})

test('forced colors emphasise the now line and markers in both directions', async ({ page }) => {
  const errors = pageErrors(page)
  await page.emulateMedia({ forcedColors: 'active' })
  for (const [search, side] of [['', 'left'], ['?rtl=1', 'right']] as const) {
    const { chart } = await openGanttFixture(page, search)
    await expect(chart.getByText('Review', { exact: true })).toBeVisible()
    const edges = (selector: string) => chart.locator(selector).first().evaluate(el => {
      const cs = getComputedStyle(el)
      return { left: cs.borderLeftWidth, right: cs.borderRightWidth, style: cs.borderInlineStartStyle }
    })
    const marker = { left: '0px', right: '0px', style: 'dashed', [side]: '2px' }
    const now = { left: '0px', right: '0px', style: 'solid', [side]: '3px' }
    expect(await edges('.vw-gantt-marker')).toEqual(marker)
    expect(await edges('.vw-gantt-now')).toEqual(now)
  }
  expect(errors).toEqual([])
})

test('reduced motion removes stylesheet transitions and animations', async ({ page }) => {
  const errors = pageErrors(page)
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await openComponentFixture(page)
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true)
  const offenders = await page.evaluate(() => [...document.querySelectorAll('.vw-gantt, .vw-gantt *, .vw-network, .vw-network *')]
    .filter(el => { const cs = getComputedStyle(el); return cs.transitionDuration.split(', ').some(d => d !== '0s') || cs.animationName !== 'none' })
    .map(el => el.className.toString()))
  expect(offenders).toEqual([])
  expect(errors).toEqual([])
})

test('print media hides interactive chrome and expands the Gantt scroller', async ({ page }) => {
  const errors = pageErrors(page)
  await openComponentFixture(page)
  await page.locator('.vw-gantt-bar').first().click()
  const display = (selector: string) => page.evaluate(sel => [...document.querySelectorAll(sel)].map(el => getComputedStyle(el).display), selector)
  const zoomTools = await display('.vw-zoom-tools')
  expect(zoomTools.length).toBeGreaterThan(0)
  expect(zoomTools.every(value => value !== 'none')).toBe(true)
  await expect(ganttRegion(page)).toHaveCSS('overflow-y', 'auto')
  await page.emulateMedia({ media: 'print' })
  expect((await display('.vw-zoom-tools, .vw-minimap, .vw-bar-handle, .vw-gantt-toolbar')).every(value => value === 'none')).toBe(true)
  await expect(ganttRegion(page)).toHaveCSS('overflow-y', 'visible')
  await expect(page.locator('.vw-network').first()).toHaveCSS('print-color-adjust', 'exact')
  expect(errors).toEqual([])
})

test('export controls download a whole-chart SVG and a scaled PNG for both components', async ({ page }) => {
  const { readFile } = await import('node:fs/promises')
  const pngSize = (bytes: Buffer) => {
    expect(bytes.subarray(1, 4).toString('ascii')).toBe('PNG')
    return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) }
  }
  const save = async (name: string) => {
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name, exact: true }).click()
    const file = await pending
    return { name: file.suggestedFilename(), bytes: await readFile((await file.path())!) }
  }
  const { errors, chart, status } = await openTimelineEditing(page)
  // Scroll away first: the export still covers the whole range and every row.
  await chart.evaluate(element => { element.scrollLeft = 400 })
  const svg = await save('Export SVG')
  expect(svg.name).toBe('timeline.svg')
  const text = svg.bytes.toString('utf8')
  // 138 px heading column + 10 h at 115 px; 66 px header, 4 rows of 66 px and 2 load rows of 44 px.
  expect(text).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" width="1288" height="418"/)
  for (const label of ['Wireframes', 'Billing API', 'Checkout UI', 'Acceptance tests', 'Quality', 'Engineering pool', 'Day 2026-11-09', 'Now', 'Team']) {
    expect(text).toContain('>' + label + '<')
  }
  expect(text).not.toContain('<script')
  await expect(status('Exported SVG (')).toBeVisible()
  const png = await save('Export PNG')
  expect(png.name).toBe('timeline.png')
  expect(pngSize(png.bytes)).toEqual({ width: 2576, height: 836 })
  await expect(status('Exported PNG 2576 × 836 px.')).toBeVisible()

  await page.getByRole('button', { name: 'Manufacturing', exact: true }).click()
  const graphSvg = await save('Export graph SVG')
  const graphText = graphSvg.bytes.toString('utf8')
  expect(graphSvg.name).toBe('network.svg')
  const nodeCount = await page.locator('.vw-network-node').count()
  expect(graphText.match(/<g transform="translate\(/g)?.length).toBe(nodeCount + 1)
  const [, width, height] = /^<svg [^>]*width="([\d.]+)" height="([\d.]+)"/.exec(graphText)!
  const graphPng = await save('Export graph PNG')
  expect(graphPng.name).toBe('network.png')
  expect(pngSize(graphPng.bytes)).toEqual({ width: Math.ceil(Number(width) * 2), height: Math.ceil(Number(height) * 2) })

  // Culling and the camera do not limit the export, and oversized PNGs are refused with a RangeError message.
  await page.getByRole('button', { name: 'Large graph', exact: true }).click()
  await expect(page.getByText('3750 nodes')).toBeVisible()
  const large = (await save('Export graph SVG')).bytes.toString('utf8')
  expect(large.match(/<g transform="translate\(/g)?.length).toBe(3751)
  await page.getByRole('button', { name: 'Export graph PNG', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'exceeds the maximum canvas size' })).toBeVisible()
  expect(errors).toEqual([])
})

test('the graph Undo and Redo buttons are hidden in the scheduling and timeline editing demos', async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto('/gallery.html')
  const undo = page.getByRole('button', { name: 'Undo', exact: true }), redo = page.getByRole('button', { name: 'Redo', exact: true })
  await expect(undo).toBeVisible()
  for (const name of ['Scheduling', 'Timeline editing']) {
    await page.getByRole('button', { name, exact: true }).click()
    await expect(undo).toHaveCount(0)
    await expect(redo).toHaveCount(0)
  }
  await page.getByRole('button', { name: 'Manufacturing', exact: true }).click()
  await expect(undo).toBeVisible()
  expect(errors).toEqual([])
})

test('the workflow builder showcase applies step moves and connections through the controlled API', async ({ page }) => {
  const errors = pageErrors(page)
  await openDemo(page, 'Workflow builder')
  const showcase = page.getByRole('region', { name: 'Workflow builder' })
  // The zoom percentage is an <output>, which also has the status role.
  const status = (text: string) => showcase.getByRole('status').filter({ hasText: text })

  const summarize = showcase.getByRole('button', { name: 'Summarize order', exact: true })
  const initial = await summarize.getAttribute('transform')
  await summarize.press('ArrowDown')
  await expect(summarize).not.toHaveAttribute('transform', initial!)
  await expect(status('Moved Summarize order.')).toBeVisible()

  const edges = showcase.locator('.sc-workflow-edge')
  await expect(edges).toHaveCount(7)
  await showcase.getByRole('button', { name: 'Start connection from Log skipped order · output', exact: true }).press('Enter')
  await showcase.getByRole('button', { name: 'Connect to Notify team · input', exact: true }).press('Enter')
  await expect(status('Connected Log skipped order to Notify team.')).toBeVisible()
  await expect(edges).toHaveCount(8)
  await showcase.getByRole('button', { name: 'Start connection from Summarize order · output', exact: true }).press('Enter')
  await showcase.getByRole('button', { name: 'Connect to Look up customer · input', exact: true }).press('Enter')
  await expect(status('Rejected: That connection would create a loop.')).toBeVisible()
  await showcase.getByRole('button', { name: 'Start connection from Check payment · true', exact: true }).press('Enter')
  await showcase.getByRole('button', { name: 'Connect to Summarize order · input', exact: true }).press('Enter')
  await expect(status('Rejected: These steps are already connected.')).toBeVisible()
  await expect(edges).toHaveCount(8)
  expect(errors).toEqual([])
})

test('the database schema showcase traces relationships and keeps table moves controlled', async ({ page }) => {
  const errors = pageErrors(page)
  await openDemo(page, 'Database schema')
  const showcase = page.getByRole('region', { name: 'Database schema' })
  const status = (text: string) => showcase.getByRole('status').filter({ hasText: text })

  const tasks = showcase.getByRole('button', { name: 'tasks 7 columns', exact: true })
  await tasks.click()
  await expect(tasks).toHaveAttribute('aria-pressed', 'true')
  await expect(status('tasks: references projects, users · referenced by comments, task_tags.')).toBeVisible()
  await expect(showcase.locator('.vw-is-highlighted .sc-schema-edge')).toHaveCount(4)
  await expect(showcase.locator('.vw-network-node.vw-dimmed')).toHaveCount(2)

  // Two Shift+ArrowLeft presses move tags past the right edge of task_tags, so their relationship changes sides.
  const tags = showcase.getByRole('button', { name: 'tags 3 columns', exact: true })
  const initial = await tags.getAttribute('transform')
  await tags.press('Shift+ArrowLeft')
  await expect(tags).not.toHaveAttribute('transform', initial!)
  await expect(status('Moved tags.')).toBeVisible()
  await tags.press('Shift+ArrowLeft')
  await expect(status('Moved tags; relationships switched sides.')).toBeVisible()
  await expect(tags).toBeFocused()
  expect(errors).toEqual([])
})

test('org chart showcase traces a reporting line and folds a team', async ({ page }) => {
  const errors = pageErrors(page)
  await openDemo(page, 'Org chart')
  const showcase = page.getByRole('region', { name: 'Org chart', exact: true })
  // The zoom percentage is an <output>, which also has the status role; the showcase status line comes last.
  const status = showcase.getByRole('status').last()
  await expect(status).toHaveText('Amara Okafor, Chief Executive Officer (Executive) · 4 direct reports.')
  await expect(showcase.getByRole('button', { name: 'Amara Okafor Chief Executive Officer', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await showcase.getByRole('button', { name: 'Hana Sato Backend Engineer', exact: true }).click()
  await expect(status).toHaveText('Hana Sato, Backend Engineer (Engineering) · reports to Priya Raman → Lukas Brenner → Amara Okafor.')
  const engineering = showcase.getByRole('button', { name: 'Engineering · 6', exact: true })
  await expect(engineering).toHaveAttribute('aria-expanded', 'true')
  await engineering.click()
  await expect(engineering).toHaveAttribute('aria-expanded', 'false')
  await expect(status).toHaveText('Engineering collapsed: 5 people below Lukas Brenner hidden.')
  await expect(showcase.getByRole('button', { name: 'Hana Sato Backend Engineer', exact: true })).toHaveCount(0)
  // The hidden selection moves to the department head.
  await expect(showcase.getByRole('button', { name: 'Lukas Brenner VP Engineering', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await showcase.getByRole('button', { name: 'Expand all', exact: true }).click()
  await expect(showcase.getByRole('button', { name: 'Hana Sato Backend Engineer', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('room bookings showcase moves stays and refuses an overlap', async ({ page }) => {
  const errors = pageErrors(page)
  await openDemo(page, 'Room bookings')
  const showcase = page.getByRole('region', { name: 'Room bookings', exact: true })
  // The zoom percentage is an <output>, which also has the status role; the showcase status line comes last.
  const status = showcase.getByRole('status').last()
  await showcase.getByRole('button', { name: 'Arjun Mehta Fri 27–Mon 30', exact: true }).press('ArrowRight')
  await expect(showcase.getByRole('button', { name: 'Arjun Mehta Sat 28–Tue 1', exact: true })).toBeVisible()
  await expect(status).toHaveText('Moved Arjun Mehta to Sat 28–Tue 1 (3 nights) in Room 101.')
  // Down from Room 203 lands on the Floor 3 heading; the app continues to the first room of that floor.
  await showcase.getByRole('button', { name: 'Daniel Kim Tue 1–Sat 5', exact: true }).press('ArrowDown')
  await expect(status).toHaveText('Moved Daniel Kim to Room 301, Tue 1–Sat 5 (4 nights).')
  const sara = showcase.getByRole('button', { name: 'Sara Haddad Thu 26–Sun 29', exact: true })
  await sara.press('ArrowRight')
  await expect(status).toHaveText('Room 302 is taken by Max Müller Sun 29–Wed 2.')
  await expect(sara).toBeVisible()
  expect(errors).toEqual([])
})

test('the product roadmap showcase moves projects through controlled edits and keeps shipped work fixed', async ({ page }) => {
  const errors = pageErrors(page)
  await openDemo(page, 'Product roadmap')
  const showcase = page.getByRole('region', { name: 'Product roadmap', exact: true })
  await expect(showcase.getByRole('heading', { name: 'Product roadmap', exact: true })).toBeVisible()
  await expect(showcase.getByRole('list', { name: 'Legend', exact: true })).toContainText('At risk')
  const setup = page.getByRole('button', { name: 'Guided setup Jan 11–Feb 22', exact: true })
  await setup.press('ArrowRight')
  await expect(page.getByRole('button', { name: 'Guided setup Jan 12–Feb 23', exact: true })).toBeFocused()
  await expect(showcase.getByRole('status').filter({ hasText: 'Moved Guided setup to Jan 12 – Feb 23' })).toBeVisible()
  // Shipped projects are not editable, so arrow keys propose nothing.
  const shipped = page.getByRole('button', { name: 'Welcome emails Jan 4–Jan 29', exact: true })
  await shipped.press('ArrowRight')
  await expect(shipped).toBeVisible()
  await page.getByRole('button', { name: 'Live cursors Jan 4–Feb 8', exact: true }).click()
  await expect(showcase.getByRole('status').filter({ hasText: 'Live cursors · Done · 100% done · Jonas Weber and Leo Park' })).toBeVisible()
  await page.getByRole('button', { name: 'Collapse Onboarding', exact: true }).click()
  await expect(page.getByRole('button', { name: /^Guided setup / })).toHaveCount(0)
  await page.getByRole('button', { name: 'Expand Onboarding', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Guided setup Jan 12–Feb 23', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('the sprint plan showcase rejects a move before a predecessor ends and accepts moves and progress edits', async ({ page }) => {
  const errors = pageErrors(page)
  await openDemo(page, 'Sprint plan')
  const showcase = page.getByRole('region', { name: 'Sprint plan', exact: true })
  await expect(showcase.getByRole('heading', { name: 'Sprint plan', exact: true })).toBeVisible()
  // Query rewriting starts exactly when Ranking signals ends, so one day earlier breaks the finish-to-start link.
  const rewrite = page.getByRole('button', { name: 'Query rewriting Nov 24–Dec 2', exact: true })
  await rewrite.press('ArrowLeft')
  await expect(showcase.getByRole('status').filter({ hasText: 'Not moved: Query rewriting cannot start before Nov 24: it waits for Ranking signals.' })).toBeVisible()
  await expect(rewrite).toBeVisible()
  const address = page.getByRole('button', { name: 'Address autocomplete Nov 18–Nov 26', exact: true })
  await address.press('ArrowRight')
  await expect(page.getByRole('button', { name: 'Address autocomplete Nov 19–Nov 27', exact: true })).toBeFocused()
  await expect(showcase.getByRole('status').filter({ hasText: 'Moved Address autocomplete to Nov 19 – Nov 27 (6 days).' })).toBeVisible()
  const progress = page.getByRole('slider', { name: 'Progress of Address autocomplete', exact: true })
  await expect(progress).toHaveAttribute('aria-valuenow', '60')
  await progress.press('ArrowRight')
  await expect(progress).toHaveAttribute('aria-valuenow', '65')
  await expect(showcase.getByRole('status').filter({ hasText: 'Address autocomplete is 65% done.' })).toBeVisible()
  expect(errors).toEqual([])
})

test('every design gallery showcase fits a phone-width page', async ({ page }) => {
  const errors = pageErrors(page)
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/gallery.html')
  for (const name of ['Workflow builder', 'Database schema', 'Org chart', 'Product roadmap', 'Sprint plan', 'Room bookings', 'Calendar views',
    'CI/CD pipeline', 'Knowledge graph', 'Construction program', 'Service map']) {
    await page.getByRole('button', { name, exact: true }).click()
    await expect(page.getByRole('region', { name, exact: true }).getByRole('heading', { name, exact: true })).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth), name).toBe(390)
  }
  expect(errors).toEqual([])
})

test('the calendar views showcase switches calendar zoom presets and locales and highlights marker ranges', async ({ page }) => {
  const errors = pageErrors(page)
  await openDemo(page, 'Calendar views')
  const showcase = page.getByRole('region', { name: 'Calendar views', exact: true })
  await expect(showcase.getByRole('heading', { name: 'Calendar views', exact: true })).toBeVisible()
  const levels = showcase.getByRole('group', { name: 'Zoom level', exact: true })
  await expect(levels.getByRole('button', { name: 'Weeks', exact: true })).toHaveAttribute('aria-pressed', 'true')
  // Marker ranges are named like status-date markers: label, then start and end in the chart's formatTime.
  const freeze = showcase.getByRole('img', { name: 'Code freeze 18 May–1 Jun', exact: true })
  await expect(freeze).toBeVisible()
  await expect(freeze).toHaveText('Code freeze')
  await expect(showcase.getByRole('img', { name: 'Golden Week 29 Apr–7 May', exact: true })).toBeVisible()
  // Golden Week shades the Tokyo row; the Labour Day closure shades Berlin and Lisbon.
  await expect(showcase.locator('.vw-gantt-range.vw-is-row')).toHaveCount(3)
  const band = (await showcase.locator('.vw-gantt-range:not(.vw-is-row)').first().boundingBox())!
  const label = (await freeze.boundingBox())!
  expect(Math.abs(band.x - label.x)).toBeLessThan(1)
  expect(Math.abs(band.width - label.width)).toBeLessThan(1)
  // The summer shutdown lies outside the visible time window at week zoom, so it is not rendered.
  const shutdown = showcase.getByRole('img', { name: 'Summer shutdown 10 Aug–24 Aug', exact: true })
  await expect(shutdown).toHaveCount(0)
  // The bar names and keyboard snap follow the active preset: one day per arrow key at week zoom.
  const api = page.getByRole('button', { name: 'API v2 13 Apr–15 May', exact: true })
  await api.press('ArrowRight')
  await expect(page.getByRole('button', { name: 'API v2 14 Apr–16 May', exact: true })).toBeFocused()
  // The status line uses intlTimeFormatter with dateStyle "full"; ICU versions differ in the comma after the weekday.
  await expect(showcase.getByRole('status').filter({ hasText: /^Moved API v2: Tuesday,? 14 April 2026 – Saturday,? 16 May 2026$/ })).toBeVisible()
  await levels.getByRole('button', { name: 'Months', exact: true }).click()
  await expect(levels.getByRole('button', { name: 'Months', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(shutdown).toBeVisible()
  await expect(showcase.getByText('August 2026', { exact: true })).toHaveCount(0)
  await expect(showcase.locator('.vw-gantt-band', { hasText: /^Aug$/ })).toBeVisible()
  // Another locale relabels presets, bands, bars and ranges.
  await showcase.getByLabel('Language').selectOption('de-DE')
  await expect(levels.getByRole('button', { name: 'Monate', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(showcase.getByRole('img', { name: 'Code freeze 18. Mai–1. Juni', exact: true })).toBeVisible()
  await expect(showcase.locator('.vw-gantt-band', { hasText: /^Mai$/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /^API v2 14\. Apr\.?–16\. Mai$/ })).toBeVisible()
  expect(errors).toEqual([])
})
