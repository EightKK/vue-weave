import { test as base, expect, type Page } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8')) as { version: string }
const releaseLine = version.split('.').slice(0, 2).join('.')

// Vue catches errors thrown in event handlers and render functions and reports them with console.error, so they never
// reach pageerror. Every test therefore also fails when the page logs a console error.
const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [async ({ page }, use) => {
    const errors: string[] = []
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()) })
    await use(errors)
    expect(errors, 'console errors').toEqual([])
  }, { auto: true }],
})

async function openComponentFixture(page: Page) {
  // Serve built public entries and Vue without adding diagnostic pages to the distributed demo.
  await page.route('**/component-test/**', async route => {
    const filename = new URL(route.request().url()).pathname.slice('/component-test/'.length)
    if (filename === '') {
      return route.fulfill({ path: fileURLToPath(new URL('./fixtures/components.html', import.meta.url)) })
    }
    if (filename === 'vue.js') {
      return route.fulfill({
        path: fileURLToPath(new URL('../../node_modules/vue/dist/vue.esm-browser.prod.js', import.meta.url)),
        contentType: 'text/javascript',
      })
    }
    if (/^[\w-]+\.(?:js|css)$/.test(filename)) {
      return route.fulfill({
        path: fileURLToPath(new URL('../../dist/' + filename, import.meta.url)),
        contentType: filename.endsWith('.css') ? 'text/css' : 'text/javascript',
      })
    }
    return route.fulfill({ status: 404, body: 'Not found' })
  })
  await page.goto('/component-test/')
}

test('row hierarchy failures notify, cancel pending edits and recover on replacement data', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await openComponentFixture(page)
  const timeline = page.getByRole('region', { name: 'Timeline fixture', exact: true })
  const bar = timeline.getByRole('button', { name: 'Editable bar 1–3', exact: true })
  await expect(bar).toBeVisible()
  const box = (await bar.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 100, box.y + box.height / 2, { steps: 5 })
  await timeline.getByRole('button', { name: 'Missing parent', exact: true }).dispatchEvent('click')
  await page.mouse.up()
  await expect(timeline.getByRole('status', { name: 'Validation reports' })).toHaveText('Unknown parent for row: a')
  await expect(timeline.getByText('No rows to display', { exact: true })).toBeVisible()
  await expect(timeline.getByRole('status', { name: 'Accepted edits' })).toHaveText('0')
  await timeline.getByRole('button', { name: 'Restore rows', exact: true }).click()
  await expect(bar).toBeVisible()
  await timeline.getByRole('button', { name: 'Cyclic rows', exact: true }).click()
  await expect(timeline.getByRole('status', { name: 'Validation reports' })).toHaveText('Unknown parent for row: a; The timeline row hierarchy contains a cycle')
  await expect(timeline.getByText('No rows to display', { exact: true })).toBeVisible()
  await timeline.getByRole('button', { name: 'Restore rows', exact: true }).click()
  await expect(bar).toBeVisible()
  await bar.press('ArrowRight')
  await expect(timeline.getByRole('button', { name: 'Editable bar 2–4', exact: true })).toBeVisible()
  await expect(timeline.getByRole('status', { name: 'Accepted edits' })).toHaveText('1')
  expect(errors).toEqual([])
})

test('zero-padding graphs recover from empty data in both directions', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await openComponentFixture(page)
  const graph = page.getByRole('region', { name: 'Graph fixture', exact: true })
  for (const direction of ['LR', 'TB']) {
    await graph.getByRole('button', { name: direction + ' direction', exact: true }).click()
    await expect(graph.getByRole('button', { name: 'Node A', exact: true })).toBeVisible()
    await graph.getByRole('button', { name: 'Empty graph', exact: true }).click()
    await expect(graph.getByText('No nodes to display', { exact: true })).toBeVisible()
    await expect(graph.getByRole('button', { name: 'Node A', exact: true })).toHaveCount(0)
    await graph.getByRole('button', { name: 'Restore nodes', exact: true }).click()
    await expect(graph.getByRole('button', { name: 'Node A', exact: true })).toBeVisible()
    await graph.getByRole('button', { name: 'Zoom in', exact: true }).click()
    await graph.getByRole('button', { name: 'Fit to view', exact: true }).click()
  }
  expect(errors).toEqual([])
})

test('selection, controlled edits, validation and cancellation', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await expect(page).toHaveTitle('Vue Weave — Examples')
  await expect(page.getByRole('link', { name: `Vue Weave ${releaseLine}`, exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Fit to view', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Zoom in', exact: true })).toHaveCount(2)
  await page.locator('.vw-zoom-tools').getByRole('button', { name: 'Zoom in', exact: true }).click()
  await page.getByRole('button', { name: 'Fit to view', exact: true }).click()
  const plan = page.getByRole('button', { name: 'Split · plan 09:00–11:00', exact: true })
  await expect(plan).toBeVisible()
  await page.getByRole('button', { name: 'Split Operation 101', exact: true }).click()
  await expect(plan).toHaveAttribute('aria-pressed', 'true')
  await plan.press('ArrowRight')
  await expect(page.getByRole('button', { name: 'Split · plan 09:15–11:15', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Split · plan 09:15–11:15', exact: true }).press('Shift+ArrowRight')
  await expect(page.getByRole('button', { name: 'Split · plan 09:15–11:30', exact: true })).toBeVisible()
  await page.getByLabel('Reject edits').check()
  await page.getByRole('button', { name: 'Split · plan 09:15–11:30', exact: true }).press('ArrowRight')
  await expect(page.getByRole('status').filter({ hasText: 'locked' })).toBeVisible()
  await page.getByLabel('Reject edits').uncheck()
  await page.getByRole('button', { name: 'Reset', exact: true }).click()

  async function dragEnd(delta: number, cancel = false) {
    const bar = page.getByRole('button', { name: 'Split · plan 09:00–11:00', exact: true })
    const box = (await bar.boundingBox())!
    await page.mouse.move(box.x + box.width - 4, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width - 4 + delta, box.y + box.height / 2, { steps: 6 })
    if (cancel) await page.keyboard.press('Escape')
    await page.mouse.up()
  }
  await dragEnd(29)
  await expect(page.getByRole('button', { name: 'Split · plan 09:00–11:15', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  await dragEnd(58, true)
  await expect(plan).toBeVisible()
  // Simulate a source refresh while the pointer gesture owns capture.
  const initial = (await plan.boundingBox())!
  await page.mouse.move(initial.x + initial.width / 2, initial.y + initial.height / 2)
  await page.mouse.down()
  await page.mouse.move(initial.x + initial.width / 2 + 58, initial.y + initial.height / 2, { steps: 5 })
  await page.getByRole('button', { name: 'Reset', exact: true }).dispatchEvent('click')
  await page.mouse.up()
  await expect(plan).toBeVisible()
  expect(errors).toEqual([])
})

test('demo built-in theme switch applies the stylesheet theme classes', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
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

test('direction, slots, milestones, theme and virtual rows', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Direction').selectOption('TB')
  await expect(page.locator('.vw-network-stage')).toHaveCSS('height', '470px')
  await page.getByLabel('Custom nodes').check()
  await expect(page.locator('.vw-network-node > rect')).toHaveCount(6)
  await page.getByLabel('Dark theme').check()
  await expect(page.locator('.demo')).toHaveClass(/dark/)
  await page.getByRole('button', { name: 'Project delivery', exact: true }).click()
  await expect(page.locator('.vw-gantt-bar.milestone')).toHaveCount(1)
  await page.getByRole('button', { name: 'Release 15:00–15:00', exact: true }).press('ArrowRight')
  await expect(page.getByRole('button', { name: 'Release 15:15–15:15', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '1,000 resources', exact: true }).click()
  expect(await page.locator('.vw-gantt-row').count()).toBeLessThan(15)
  await page.getByRole('button', { name: 'Last resource', exact: true }).click()
  await expect(page.getByText('Resource 1000', { exact: true })).toBeVisible()
  expect(await page.locator('.vw-gantt-row').count()).toBeLessThan(15)
  await page.screenshot({ path: 'test-results/large-dark.png', fullPage: true })
})

test('mobile layout and horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  const viewport = page.locator('.vw-gantt-scroll')
  expect(await viewport.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true)
  await page.screenshot({ path: 'test-results/mobile.png', fullPage: true })
})

test('graph moves are controlled and connections can be accepted or rejected', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await page.getByLabel('Edit graph').check()
  const split = page.getByRole('button', { name: 'Split Operation 101', exact: true })
  const finish = page.getByRole('button', { name: 'Finish Operation 102', exact: true })
  await split.click()
  await finish.click({ modifiers: ['Shift'] })
  await expect(split).toHaveAttribute('aria-pressed', 'true')
  await expect(finish).toHaveAttribute('aria-pressed', 'true')

  const initial = await split.getAttribute('transform')
  const box = (await split.boundingBox())!
  await page.mouse.move(box.x + 35, box.y + 30)
  await page.mouse.down()
  await page.mouse.move(box.x + 35, box.y + 110, { steps: 8 })
  await page.mouse.up()
  await expect(split).not.toHaveAttribute('transform', initial!)
  await expect(page.getByText('Moved 2 nodes.', { exact: true })).toBeVisible()
  const committed = await split.getAttribute('transform')
  await split.press('ArrowRight')
  await expect(split).not.toHaveAttribute('transform', committed!)
  const beforeNavigation = await page.locator('.vw-network-stage > g').getAttribute('transform')
  await page.getByRole('button', { name: 'Navigate graph overview' }).click({ position: { x: 20, y: 30 } })
  await expect(page.locator('.vw-network-stage > g')).not.toHaveAttribute('transform', beforeNavigation!)
  await page.getByRole('button', { name: 'Fit to view' }).click()

  await page.getByRole('button', { name: 'Start connection from Material A1', exact: true }).press('Enter')
  await page.getByRole('button', { name: 'Connect to Split', exact: true }).press('Enter')
  await expect(page.getByRole('status').filter({ hasText: 'already exists' })).toBeVisible()
  await page.getByRole('button', { name: 'Start connection from Material A1', exact: true }).press('Enter')
  await page.getByRole('button', { name: 'Connect to Finish', exact: true }).press('Enter')
  await expect(page.getByRole('status').filter({ hasText: 'Connected' })).toBeVisible()
  await expect(page.locator('.vw-network-edge')).toHaveCount(7)
  expect(errors).toEqual([])
})

test('hierarchy, header bands, baselines and markers compose with controlled edits', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Planning overlays').check()
  await expect(page.getByText('Operating window · UTC')).toBeVisible()
  await expect(page.getByText('Shift review', { exact: true })).toBeVisible()
  await expect(page.locator('.vw-gantt-row')).toHaveCount(3)
  await expect(page.locator('.vw-gantt-baseline')).toHaveCount(4)
  const baseline = page.locator('.vw-gantt-baseline').first()
  const original = await baseline.getAttribute('style')
  await page.getByRole('button', { name: 'Split · plan 09:00–11:00', exact: true }).press('ArrowRight')
  await expect(page.getByRole('button', { name: 'Split · plan 09:15–11:15', exact: true })).toBeVisible()
  await expect(baseline).toHaveAttribute('style', original!)
  await page.getByRole('button', { name: 'Collapse Production schedule' }).click()
  await expect(page.locator('.vw-gantt-row')).toHaveCount(1)
  await expect(page.locator('.vw-gantt-bar')).toHaveCount(0)
  await expect(page.locator('.vw-gantt-links')).toHaveCount(0)
  await page.getByRole('button', { name: 'Expand Production schedule' }).click()
  await expect(page.getByRole('button', { name: 'Split · plan 09:15–11:15', exact: true })).toBeVisible()
})

test('named port drag, edge reconnection and undo preserve the graph', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'Project delivery', exact: true }).click()
  await page.getByLabel('Edit graph').check()
  const source = page.getByRole('button', { name: 'Start connection from Design · Output', exact: true })
  const target = page.getByRole('button', { name: /^(Start connection from|Connect to) Release · Input$/ })
  await expect(source).toBeVisible()
  const a = (await source.boundingBox())!, b = (await target.boundingBox())!
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 })
  await expect(page.locator('.vw-connection-preview')).toHaveAttribute('d', /^M .+ L /)
  await page.mouse.up()
  await expect(page.locator('.vw-network-edge')).toHaveCount(5)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('.vw-network-edge')).toHaveCount(4)

  const edge = page.getByRole('button', { name: 'Select edge da', exact: true })
  const path = await edge.getAttribute('d')
  await edge.press('Enter')
  await page.getByRole('button', { name: 'Reconnect target of da', exact: true }).press('Enter')
  await page.getByRole('button', { name: 'Connect to Release · Input', exact: true }).press('Enter')
  await expect(page.getByRole('status').filter({ hasText: 'Reconnected edge da' })).toBeVisible()
  await expect(edge).not.toHaveAttribute('d', path!)
  await expect(page.locator('.vw-network-edge')).toHaveCount(4)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(edge).toHaveAttribute('d', path!)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(edge).not.toHaveAttribute('d', path!)

  const secondEdge = page.getByRole('button', { name: 'Select edge du', exact: true })
  await secondEdge.press('Enter')
  const endpoint = (await page.getByRole('button', { name: 'Reconnect source of du', exact: true }).boundingBox())!
  const replacement = (await page.getByRole('button', { name: 'Start connection from API · Output', exact: true }).boundingBox())!
  await page.mouse.move(endpoint.x + endpoint.width / 2, endpoint.y + endpoint.height / 2)
  await page.mouse.down()
  await page.mouse.move(replacement.x + replacement.width / 2, replacement.y + replacement.height / 2, { steps: 10 })
  await page.mouse.up()
  await expect(page.getByRole('status').filter({ hasText: 'Reconnected edge du' })).toBeVisible()
  await expect(page.locator('.vw-network-edge')).toHaveCount(4)
  expect(errors).toEqual([])
})

test('range selection and group movement commit an atomic batch', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Edit graph').check()
  const lots = page.locator('.vw-network-node').filter({ hasText: 'Lot A123-' })
  const boxes = await Promise.all([lots.first().boundingBox(), lots.last().boundingBox()])
  const [a, b] = boxes
  await page.keyboard.down('Shift')
  await page.mouse.move(a!.x - 9, a!.y - 12)
  await page.mouse.down()
  await page.mouse.move(b!.x + b!.width + 8, b!.y + b!.height + 7, { steps: 8 })
  await expect(page.locator('.vw-box-selection')).toBeVisible()
  await page.mouse.up()
  await page.keyboard.up('Shift')
  await expect(lots.first()).toHaveAttribute('aria-pressed', 'true')
  await expect(lots.last()).toHaveAttribute('aria-pressed', 'true')
  const before = await Promise.all([lots.first().getAttribute('transform'), lots.last().getAttribute('transform')])
  await page.getByRole('button', { name: 'Move group Intermediate lots', exact: true }).press('ArrowDown')
  await expect(lots.first()).not.toHaveAttribute('transform', before[0]!)
  await expect(lots.last()).not.toHaveAttribute('transform', before[1]!)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(lots.first()).toHaveAttribute('transform', before[0]!)
  await expect(lots.last()).toHaveAttribute('transform', before[1]!)
})

test('timeline columns edit through validation and keep summary bars when collapsed', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Planning overlays').check()
  const input = page.getByRole('textbox', { name: 'Cutting station · Resource note', exact: true })
  await expect(input).toHaveValue('Machine 01')
  await input.fill('Cancelled note')
  await input.press('Escape')
  await expect(input).toHaveValue('Machine 01')
  await input.fill('Machine 01 — Cell A')
  await input.press('Enter')
  await expect(input).toHaveValue('Machine 01 — Cell A')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(input).toHaveValue('Machine 01')
  await input.fill('')
  await input.press('Enter')
  await expect(page.getByRole('status').filter({ hasText: 'cannot be empty' })).toBeVisible()
  await expect(input).toHaveValue('Machine 01')
  const summary = page.locator('.vw-gantt-summary')
  await expect(summary).toHaveCount(1)
  const style = await summary.getAttribute('style')
  await page.getByRole('button', { name: 'Collapse Production schedule' }).click()
  await expect(summary).toHaveAttribute('style', style!)
  await expect(input).toHaveCount(0)
})

test('calendar-aware edits propagate downstream, expose overload and preserve the accepted plan on failure', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Scheduling', exact: true }).click()
  const finish = page.getByTestId('schedule-finish')
  const cutting = page.getByRole('button', { name: /^Cut order A \d\d Nov.*–/ })
  const inspection = page.getByRole('button', { name: /^Inspect order A \d\d Nov.*–/ })
  const packing = page.getByRole('button', { name: /^Pack order A \d\d Nov.*–/ })
  await expect(finish).toHaveText('09 Nov 16:00')
  await expect(page.locator('.vw-gantt-links path.highlighted')).toHaveCount(2)
  await expect(page.getByTestId('schedule-overload')).toHaveText('1 resource-hour')
  await expect(page.getByRole('table', { name: 'Overload intervals' })).toContainText('Cut order A, Cut order B')
  await cutting.press('ArrowRight')
  await expect(finish).toHaveText('09 Nov 17:00')
  await expect(inspection).toHaveAttribute('aria-label', 'Inspect order A 09 Nov 13:00–09 Nov 15:00')
  await expect(page.getByTestId('schedule-overload')).toHaveText('2 resource-hours')
  await cutting.press('ArrowRight')
  await expect(finish).toHaveText('11 Nov 09:00')
  await expect(packing).toHaveAttribute('aria-label', 'Pack order A 09 Nov 16:00–11 Nov 09:00')
  for (let edit = 0; edit < 8; edit++) await cutting.press('ArrowRight')
  await expect(page.getByRole('status').filter({ hasText: 'exceed the available shifts' })).toBeVisible()
  await expect(finish).toHaveText('11 Nov 17:00')
  await expect(cutting).toHaveAttribute('aria-label', 'Cut order A 11 Nov 09:00–11 Nov 12:00')
  await page.getByRole('button', { name: 'Reset schedule' }).click()
  await expect(finish).toHaveText('09 Nov 16:00')
  await expect(page.getByTestId('schedule-overload')).toHaveText('1 resource-hour')
})

test('the scheduling demo shades non-working time and describes critical, float, deadline and split bars', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'Scheduling', exact: true }).click()
  const plan = page.getByRole('region', { name: 'Gantt chart', exact: true }).first()
  const equipment = page.getByRole('region', { name: 'Gantt chart', exact: true }).nth(1)
  const shading = plan.locator('.vw-gantt-non-working')
  await expect(shading.first()).toBeVisible()
  expect(await shading.count()).toBeGreaterThan(0)
  expect(await equipment.locator('.vw-gantt-non-working').count()).toBeGreaterThan(0)
  const shade = page.getByRole('checkbox', { name: 'Shade non-working time', exact: true })
  await shade.uncheck()
  await expect(page.locator('.vw-gantt-non-working')).toHaveCount(0)
  await shade.check()
  await expect(shading.first()).toBeVisible()

  // Names stay as before; the critical path, float and deadline go into the description.
  const cutting = plan.getByRole('button', { name: 'Cut order A 09 Nov 08:00–09 Nov 11:00', exact: true })
  const other = plan.getByRole('button', { name: 'Cut order B 09 Nov 10:00–09 Nov 12:00', exact: true })
  const inspection = plan.getByRole('button', { name: 'Inspect order A 09 Nov 11:00–09 Nov 14:00', exact: true })
  const packing = plan.getByRole('button', { name: 'Pack order A 09 Nov 14:00–09 Nov 16:00', exact: true })
  await expect(cutting).toHaveAccessibleDescription(/^Critical\. Float until 09 Nov 11:00\. Arrow keys move/)
  await expect(cutting).toHaveClass(/vw-critical/)
  await expect(other).toHaveAccessibleDescription(/^Float until 09 Nov 16:00\. Arrow keys move/)
  await expect(other).not.toHaveClass(/vw-critical/)
  await expect(plan.locator('.vw-gantt-float')).toHaveCount(1)
  await expect(packing).toHaveAccessibleDescription('Critical. Float until 09 Nov 16:00. Deadline 09 Nov 17:00.')
  await expect(plan.locator('.vw-gantt-deadline')).toHaveCount(1)

  // Inspection crosses the lunch break, so it is drawn as two work pieces joined by a connector.
  await expect(inspection).toHaveClass(/vw-segmented/)
  await expect(inspection.locator('.vw-gantt-segment')).toHaveCount(2)
  await expect(inspection.locator('.vw-gantt-segment-gap')).toHaveCount(1)
  const [first, second] = await inspection.locator('.vw-gantt-segment').evaluateAll(elements => elements.map(element => element.getBoundingClientRect()))
  expect(second!.x - (first!.x + first!.width)).toBeCloseTo(18, 0)

  // Two moves push packing past the dispatch cut-off: it is marked late and its work is split by the plant closure.
  await cutting.press('ArrowRight')
  const moved = plan.getByRole('button', { name: 'Cut order A 09 Nov 09:00–09 Nov 12:00', exact: true })
  await moved.press('ArrowRight')
  const late = plan.getByRole('button', { name: 'Pack order A 09 Nov 16:00–11 Nov 09:00', exact: true })
  await expect(late).toHaveAccessibleDescription('Critical. Float until 11 Nov 09:00. Deadline 09 Nov 17:00. Late.')
  await expect(late).toHaveClass(/vw-late/)
  await expect(late.locator('.vw-gantt-segment')).toHaveCount(2)
  await expect(plan.locator('.vw-gantt-deadline.vw-late')).toHaveCount(1)

  // The SVG export draws the same layers with the stylesheet colours.
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export schedule SVG', exact: true }).click()
  const { readFile } = await import('node:fs/promises')
  const svg = (await readFile((await (await pending).path())!)).toString('utf8')
  expect(svg).toContain('fill="#eaeff3"')
  expect(svg).toContain('stroke="#b42318"')
  expect(svg.match(/class="vw-gantt-segment"/g)?.length).toBe(4)
  expect(svg).toContain('class="vw-gantt-float"')
  expect(svg).toContain('class="vw-gantt-deadline vw-late"')

  // Without the critical overlay, the descriptions return to the edit hint alone.
  await page.getByRole('checkbox', { name: 'Show critical path and float', exact: true }).uncheck()
  await expect(plan.locator('.vw-critical, .vw-late, .vw-gantt-float, .vw-gantt-deadline')).toHaveCount(0)
  await expect(plan.getByRole('button', { name: 'Cut order A 09 Nov 10:00–09 Nov 14:00', exact: true }))
    .toHaveAccessibleDescription('Arrow keys move. Shift resizes the end. Alt resizes the start. Escape cancels.')
  expect(errors).toEqual([])
})

test('a move preview shifts the segments of a split bar and a resize preview draws it unsegmented', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'Scheduling', exact: true }).click()
  const plan = page.getByRole('region', { name: 'Gantt chart', exact: true }).first()
  const cutting = plan.getByRole('button', { name: /^Cut order A \d\d Nov.*–/ })
  // A requested start of 10:00 splits the cutting order around the lunch break.
  await cutting.press('ArrowRight')
  await cutting.press('ArrowRight')
  await expect(cutting).toHaveAttribute('aria-label', 'Cut order A 09 Nov 10:00–09 Nov 14:00')
  const segments = cutting.locator('.vw-gantt-segment')
  await expect(segments).toHaveCount(2)
  const left = () => segments.evaluateAll(elements => elements.map(element => element.getBoundingClientRect().x))
  const before = await left()

  const box = (await cutting.boundingBox())!
  const y = box.y + box.height / 2
  await page.mouse.move(box.x + box.width / 2, y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 36, y, { steps: 6 })
  await expect(cutting).toHaveAttribute('aria-label', 'Cut order A 09 Nov 12:00–09 Nov 16:00')
  await expect(cutting).toHaveClass(/dragging/)
  await expect(segments).toHaveCount(2)
  const during = await left()
  expect(during[0]! - before[0]!).toBeCloseTo(36, 0)
  expect(during[1]! - before[1]!).toBeCloseTo(36, 0)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(cutting).toHaveAttribute('aria-label', 'Cut order A 09 Nov 10:00–09 Nov 14:00')
  await expect(cutting).not.toHaveClass(/dragging/)
  expect(await left()).toEqual(before)

  // Resizing previews the plain interval; the parent would reschedule and supply new segments.
  await page.mouse.move(box.x + box.width - 3, y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width + 18, y, { steps: 4 })
  await expect(cutting).toHaveAttribute('aria-label', 'Cut order A 09 Nov 10:00–09 Nov 15:00')
  await expect(cutting).not.toHaveClass(/vw-segmented/)
  await expect(segments).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(segments).toHaveCount(2)
  expect(errors).toEqual([])
})

test('a bar click or drag emits select once and keyboard edits keep focus in a narrow viewport', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 640, height: 900 })
  await page.goto('/')
  const count = page.getByRole('status', { name: 'Select events', exact: true })
  const plan = page.getByRole('button', { name: 'Split · plan 09:00–11:00', exact: true })
  await expect(plan).toBeVisible()
  await expect(count).toHaveText('0')
  await plan.click()
  await expect(count).toHaveText('1')
  const box = (await plan.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2, { steps: 5 })
  await page.mouse.up()
  await expect(count).toHaveText('2')
  await page.getByRole('button', { name: 'Reset', exact: true }).click()

  // Moving a focused bar far to the right keeps focus and scrolls it into view.
  const moving = page.locator('.vw-gantt-bar[aria-label^="Split · plan"]')
  await moving.focus()
  for (let i = 0; i < 24; i++) await moving.press('ArrowRight')
  await expect(page.locator('.vw-gantt-bar:focus')).toHaveCount(1)
  const region = page.getByRole('region', { name: 'Gantt chart', exact: true })
  await expect.poll(() => region.evaluate(el => el.scrollLeft)).toBeGreaterThan(0)
  const focused = (await page.locator('.vw-gantt-bar:focus').boundingBox())!
  const area = (await region.boundingBox())!
  expect(focused.x + focused.width).toBeLessThanOrEqual(area.x + area.width + 1)
  expect(errors).toEqual([])
})

test('dragging a bar near the viewport edge scrolls the timeline and keeps the preview in sync', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.setViewportSize({ width: 640, height: 900 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  const region = page.getByRole('region', { name: 'Gantt chart', exact: true })
  const bar = page.getByRole('button', { name: 'Split · plan 09:00–11:00', exact: true })
  // In a narrow viewport the bar can start below the fold (font metrics differ by platform); mouse input outside the
  // viewport reaches no element, so bring it into view before measuring.
  await bar.scrollIntoViewIfNeeded()
  const area = (await region.boundingBox())!
  const box = (await bar.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(area.x + area.width - 10, box.y + box.height / 2, { steps: 8 })
  await expect.poll(() => region.evaluate(el => el.scrollLeft)).toBeGreaterThan(50)
  await page.mouse.up()
  await expect(page.locator('.vw-gantt-bar[aria-label^="Split · plan"]')).not.toHaveAttribute('aria-label', 'Split · plan 09:00–11:00')
  expect(errors).toEqual([])
})

async function openNetworkFixture(page: Page, search: string) {
  await page.route('**/network-test/**', async route => {
    const filename = new URL(route.request().url()).pathname.slice('/network-test/'.length)
    if (filename === '') return route.fulfill({ path: fileURLToPath(new URL('./fixtures/network.html', import.meta.url)) })
    if (filename === 'vue.js') {
      return route.fulfill({
        path: fileURLToPath(new URL('../../node_modules/vue/dist/vue.esm-browser.prod.js', import.meta.url)),
        contentType: 'text/javascript',
      })
    }
    if (/^[\w-]+\.(?:js|css)$/.test(filename)) {
      return route.fulfill({
        path: fileURLToPath(new URL('../../dist/' + filename, import.meta.url)),
        contentType: filename.endsWith('.css') ? 'text/css' : 'text/javascript',
      })
    }
    return route.fulfill({ status: 404, body: 'Not found' })
  })
  await page.goto('/network-test/' + search)
  await expect(page.getByLabel('Network graph', { exact: true })).toBeVisible()
}

type Camera = { x: number; y: number; scale: number }
const readCamera = (page: Page) => page.evaluate(() => (window as any).__vw.graph().getViewport() as Camera)
const chainNode = (page: Page, name?: string) => name
  ? page.getByRole('button', { name, exact: true }) : page.getByRole('button', { name: /^N\d{4}$/ })

test('viewport culling renders the visible window, keeps selected and focused nodes and follows focusNode', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await openNetworkFixture(page, '?nodes=600&cull=1&minimap=1')
  const rendered = await chainNode(page).count()
  expect(rendered).toBeGreaterThan(0)
  expect(rendered).toBeLessThan(600)
  await expect(chainNode(page, 'N0000')).toBeVisible()
  await expect(chainNode(page, 'N0450')).toHaveCount(0)
  // The minimap still shows every node, plus its viewport window.
  await expect(page.getByRole('button', { name: 'Navigate graph overview' }).locator('rect')).toHaveCount(601)

  await chainNode(page, 'N0000').focus()
  await page.keyboard.press('Enter')
  await expect(chainNode(page, 'N0000')).toHaveAttribute('aria-pressed', 'true')
  const before = await readCamera(page)
  await page.evaluate(() => (window as any).__vw.graph().focusNode('N0450'))
  const after = await readCamera(page)
  expect(after.scale).toBe(before.scale)
  const target = chainNode(page, 'N0450')
  await expect(target).toHaveCount(1)
  const stage = (await page.getByLabel('Network graph', { exact: true }).boundingBox())!
  const box = (await target.boundingBox())!
  expect(Math.abs(box.x + box.width / 2 - (stage.x + stage.width / 2))).toBeLessThan(25)
  expect(Math.abs(box.y + box.height / 2 - (stage.y + stage.height / 2))).toBeLessThan(25)
  // N0000 is far away but selected, so it stays in the DOM. Distant unrelated nodes do not.
  await expect(chainNode(page, 'N0000')).toHaveCount(1)
  await expect(chainNode(page, 'N0300')).toHaveCount(0)

  // Selecting another node (which also moves focus) releases N0000.
  await target.click()
  await expect(chainNode(page, 'N0000')).toHaveCount(0)
  // A focused, unselected node survives a jump of the camera.
  const neighbor = chainNode(page, 'N0452')
  await neighbor.focus()
  await page.evaluate(() => (window as any).__vw.graph().setViewport({ x: 0, y: 0, scale: 1 }))
  await expect(chainNode(page, 'N0000')).toHaveCount(1)
  await expect(neighbor).toHaveCount(1)
  await expect(neighbor).toBeFocused()
  await expect(chainNode(page, 'N0200')).toHaveCount(0)
  // Fit to view shows the whole chain, so culling keeps every node.
  await page.evaluate(() => (window as any).__vw.graph().fit())
  await expect(chainNode(page, 'N0452')).toHaveCount(1)
  await expect(chainNode(page)).toHaveCount(600)
  expect(await page.evaluate(() => {
    try { (window as any).__vw.graph().focusNode('missing') } catch (error) { return (error as Error).message }
  })).toBe('Unknown node: missing')
  expect(errors).toEqual([])
})

test('fit to view shows a long chain below 10% and the fitted viewport can be restored', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await openNetworkFixture(page, '?nodes=100&cull=1')
  // The automatic initial view stays readable instead of shrinking the chain to dots.
  expect((await readCamera(page)).scale).toBeGreaterThanOrEqual(0.1)
  await page.getByRole('button', { name: 'Fit to view', exact: true }).click()
  const fitted = await readCamera(page)
  expect(fitted.scale).toBeLessThan(0.1)
  const stage = (await page.getByLabel('Network graph', { exact: true }).boundingBox())!
  await expect(chainNode(page)).toHaveCount(100)
  for (const name of ['N0000', 'N0050', 'N0099']) {
    const box = (await chainNode(page, name).boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(stage.x - 0.5)
    expect(box.x + box.width).toBeLessThanOrEqual(stage.x + stage.width + 0.5)
    expect(box.y).toBeGreaterThanOrEqual(stage.y - 0.5)
    expect(box.y + box.height).toBeLessThanOrEqual(stage.y + stage.height + 0.5)
  }
  // Zooming out stops at the fit scale; a saved fitted viewport is accepted again.
  await page.evaluate(() => (window as any).__vw.graph().zoom(0.5))
  expect((await readCamera(page)).scale).toBeCloseTo(fitted.scale, 6)
  await page.evaluate(() => (window as any).__vw.graph().setViewport({ x: 0, y: 0, scale: 1 }))
  await page.evaluate(viewport => (window as any).__vw.graph().setViewport(viewport), fitted)
  expect(await readCamera(page)).toEqual(fitted)
  expect(await page.evaluate(() => {
    try { (window as any).__vw.graph().setViewport({ x: 0, y: 0, scale: 0.001 }) } catch (error) { return (error as Error).message }
  })).toMatch(/^Viewport scale must be between the fit scale /)
  expect(errors).toEqual([])
})

test('without cullOffscreen every node stays in the DOM', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await openNetworkFixture(page, '?nodes=600&cull=0')
  await expect(chainNode(page)).toHaveCount(600)
  expect(errors).toEqual([])
})

test('dragging a node under culling emits one proposal and keeps the node rendered', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await openNetworkFixture(page, '?nodes=600&cull=1&draggable=1')
  const node = chainNode(page, 'N0001')
  const box = (await node.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 30, { steps: 6 })
  await expect(node).toHaveCount(1)
  await page.mouse.up()
  await expect(page.getByRole('status', { name: 'Last move', exact: true })).toHaveText('N0001')
  await expect(page.getByRole('status', { name: 'Move events', exact: true })).toHaveText('1')
  await expect(node).toHaveCount(1)
  expect(errors).toEqual([])
})

type TouchPoint = { x: number; y: number; id: number }
async function touch(cdp: Awaited<ReturnType<ReturnType<Page['context']>['newCDPSession']>>, type: 'touchStart' | 'touchMove' | 'touchEnd', points: TouchPoint[]) {
  await cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points })
}

test('two-finger pinch zooms around the midpoint, clamps, pans and leaves one-finger gestures alone', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await openNetworkFixture(page, '?nodes=3&draggable=1')
  const cdp = await page.context().newCDPSession(page)
  const stage = (await page.getByLabel('Network graph', { exact: true }).boundingBox())!
  const cx = stage.x + stage.width / 2, cy = stage.y + stage.height / 2
  const events = page.getByRole('status', { name: 'Viewport events', exact: true })

  // One finger on the background still pans.
  const start = await readCamera(page)
  const eventsBefore = Number(await events.textContent())
  await touch(cdp, 'touchStart', [{ x: stage.x + 8, y: stage.y + 8, id: 1 }])
  await touch(cdp, 'touchMove', [{ x: stage.x + 38, y: stage.y + 28, id: 1 }])
  await touch(cdp, 'touchEnd', [])
  await expect.poll(async () => (await readCamera(page)).x - start.x).toBeCloseTo(30, 0)
  const panned = await readCamera(page)
  expect(panned.y - start.y).toBeCloseTo(20, 0)
  expect(panned.scale).toBe(start.scale)

  // Spreading two fingers to twice the distance doubles the scale and keeps the midpoint anchored.
  const a = { x: cx - 50, y: cy, id: 1 }, b = { x: cx + 50, y: cy, id: 2 }
  const rect = { left: stage.x, top: stage.y }
  const worldAt = (camera: Camera, x: number, y: number) => ({ x: (x - rect.left - camera.x) / camera.scale, y: (y - rect.top - camera.y) / camera.scale })
  const beforePinch = await readCamera(page)
  const anchor = worldAt(beforePinch, cx, cy)
  await touch(cdp, 'touchStart', [a, b])
  await touch(cdp, 'touchMove', [{ ...a, x: cx - 100 }, { ...b, x: cx + 100 }])
  await expect.poll(async () => (await readCamera(page)).scale / beforePinch.scale).toBeCloseTo(2, 1)
  const zoomed = await readCamera(page)
  const anchored = worldAt(zoomed, cx, cy)
  expect(anchored.x).toBeCloseTo(anchor.x, 0)
  expect(anchored.y).toBeCloseTo(anchor.y, 0)
  expect(Number(await events.textContent())).toBeGreaterThan(eventsBefore)
  // Moving both fingers together pans without changing the scale.
  await touch(cdp, 'touchMove', [{ ...a, x: cx - 60, y: cy + 20 }, { ...b, x: cx + 140, y: cy + 20 }])
  await expect.poll(async () => (await readCamera(page)).x - zoomed.x).toBeCloseTo(40, 0)
  const dragged = await readCamera(page)
  expect(dragged.scale).toBeCloseTo(zoomed.scale, 5)
  expect(dragged.y - zoomed.y).toBeCloseTo(20, 0)
  // Extreme spreading and squeezing respects the zoom clamp.
  await touch(cdp, 'touchMove', [{ ...a, x: stage.x + 2 }, { ...b, x: stage.x + stage.width - 2 }])
  await touch(cdp, 'touchMove', [{ ...a, x: cx, y: cy }, { ...b, x: cx + 1, y: cy }])
  await expect.poll(async () => (await readCamera(page)).scale).toBe(0.1)
  await touch(cdp, 'touchMove', [{ ...a, x: stage.x + 2, y: cy }, { ...b, x: stage.x + stage.width - 2, y: cy }])
  await touch(cdp, 'touchMove', [{ ...a, x: stage.x + 2, y: stage.y + 2 }, { ...b, x: stage.x + stage.width - 2, y: stage.y + stage.height - 2 }])
  await expect.poll(async () => (await readCamera(page)).scale).toBe(3)
  await touch(cdp, 'touchEnd', [])

  // A node drag in progress is cancelled by the second finger and never proposes a move.
  await page.evaluate(() => (window as any).__vw.graph().fit())
  const node = (await chainNode(page, 'N0001').boundingBox())!
  const nx = node.x + node.width / 2, ny = node.y + node.height / 2
  await touch(cdp, 'touchStart', [{ x: nx, y: ny, id: 1 }])
  await touch(cdp, 'touchMove', [{ x: nx + 25, y: ny + 15, id: 1 }])
  const fitScale = (await readCamera(page)).scale
  await touch(cdp, 'touchStart', [{ x: nx + 25, y: ny + 15, id: 1 }, { x: nx + 125, y: ny + 15, id: 2 }])
  await touch(cdp, 'touchMove', [{ x: nx + 25, y: ny + 15, id: 1 }, { x: nx + 225, y: ny + 15, id: 2 }])
  await touch(cdp, 'touchEnd', [])
  await expect.poll(async () => (await readCamera(page)).scale).toBeGreaterThan(fitScale)
  await expect(page.getByRole('status', { name: 'Move events', exact: true })).toHaveText('0')

  // Plain wheel input does not move the camera.
  const wheelStart = await readCamera(page)
  await page.mouse.move(cx, cy)
  await page.mouse.wheel(0, 120)
  expect(await readCamera(page)).toEqual(wheelStart)
  expect(errors).toEqual([])
})

test('moving a parent group proposes one batch with every descendant; a child moves only its own members', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await openNetworkFixture(page, '?preset=groups&draggable=1')
  const outer = page.getByRole('button', { name: 'Move group Outer', exact: true })
  const inner = page.getByRole('button', { name: 'Move group Inner within Outer', exact: true })
  await expect(outer).toBeVisible()
  await expect(inner).toBeVisible()
  const last = page.getByRole('status', { name: 'Last move', exact: true })
  const events = page.getByRole('status', { name: 'Move events', exact: true })

  const o = (await outer.boundingBox())!
  await page.mouse.move(o.x + o.width / 2, o.y + o.height / 2)
  await page.mouse.down()
  await page.mouse.move(o.x + o.width / 2 + 30, o.y + o.height / 2 + 20, { steps: 5 })
  await page.mouse.up()
  await expect(last).toHaveText('B,C,D')
  await expect(events).toHaveText('1')

  const i = (await inner.boundingBox())!
  await page.mouse.move(i.x + i.width / 2, i.y + i.height / 2)
  await page.mouse.down()
  await page.mouse.move(i.x + i.width / 2 + 30, i.y + i.height / 2 + 20, { steps: 5 })
  await page.mouse.up()
  await expect(last).toHaveText('C,D')
  await expect(events).toHaveText('2')

  await outer.focus()
  await page.keyboard.press('ArrowRight')
  await expect(last).toHaveText('B,C,D')
  await expect(events).toHaveText('3')
  expect(errors).toEqual([])
})

test('matchIds dims non-matching nodes and focusNode accepts a scale', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await openNetworkFixture(page, '?nodes=5&match=N0001,N0002')
  await expect(chainNode(page, 'N0000')).toHaveClass(/vw-dimmed/)
  await expect(chainNode(page, 'N0001')).not.toHaveClass(/vw-dimmed/)
  await expect(chainNode(page, 'N0002')).not.toHaveClass(/vw-dimmed/)
  await expect(chainNode(page, 'N0004')).toHaveClass(/vw-dimmed/)
  // Dimming is presentational: the node still reports its name and can be selected.
  await chainNode(page, 'N0000').click()
  await expect(chainNode(page, 'N0000')).toHaveAttribute('aria-pressed', 'true')
  await page.evaluate(() => (window as any).__vw.graph().focusNode('N0004', { scale: 1 }))
  expect((await readCamera(page)).scale).toBe(1)
  const stage = (await page.getByLabel('Network graph', { exact: true }).boundingBox())!
  const box = (await chainNode(page, 'N0004').boundingBox())!
  expect(Math.abs(box.x + box.width / 2 - (stage.x + stage.width / 2))).toBeLessThan(25)
  expect(errors).toEqual([])
})

test('nested group rectangles stay inside the fitted view, the minimap and the exported SVG', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await openNetworkFixture(page, '?preset=groups&minimap=1')
  const stage = page.getByLabel('Network graph', { exact: true })
  await page.evaluate(() => (window as any).__vw.graph().fit())
  const rects = page.locator('.vw-network-group rect')
  await expect(rects).toHaveCount(2)
  const frame = (await stage.boundingBox())!
  const boxes = await rects.evaluateAll(list => list.map(el => {
    const r = el.getBoundingClientRect()
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
  }))
  const top = Math.min(...boxes.map(box => box.top)), bottom = Math.max(...boxes.map(box => box.bottom))
  const left = Math.min(...boxes.map(box => box.left)), right = Math.max(...boxes.map(box => box.right))
  // Every group, including the parent that reaches above the first node row, is inside the stage and centred.
  expect(top).toBeGreaterThanOrEqual(frame.y - 0.5)
  expect(bottom).toBeLessThanOrEqual(frame.y + frame.height + 0.5)
  expect(Math.abs((top - frame.y) - (frame.y + frame.height - bottom))).toBeLessThan(1.5)
  expect(left).toBeGreaterThanOrEqual(frame.x - 0.5)
  expect(right).toBeLessThanOrEqual(frame.x + frame.width + 0.5)
  // The minimap frames the groups too.
  const viewTop = await page.getByRole('button', { name: 'Navigate graph overview' }).locator('svg').evaluate(el => el.viewBox.baseVal.y)
  expect(viewTop).toBeLessThan(0)
  // The export frames them as well: no content coordinate is negative after the export translation.
  const svg = await page.evaluate(() => (window as any).__vw.graph().exportSvg() as string)
  expect(svg).toMatch(/<svg[^>]* width="[\d.]+" height="[\d.]+"/)
  expect(errors).toEqual([])
})

test('culled drag previews keep the edges of dragged nodes rendered', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await openNetworkFixture(page, '?nodes=600&cull=1&draggable=1')
  const edges = page.locator('.vw-network-edge')
  const node = chainNode(page, 'N0002')
  const box = (await node.boundingBox())!
  const before = await edges.count()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40, { steps: 6 })
  await expect(node).toHaveCount(1)
  expect(await edges.count()).toBeGreaterThanOrEqual(before)
  // The edges attached to the dragged node follow it.
  const [incoming, outgoing] = await edges.evaluateAll(list => list.slice(1, 3).map(el => el.getAttribute('d')))
  expect(incoming).toMatch(/^M /)
  expect(outgoing).not.toBe(incoming)
  await page.mouse.up()
  expect(errors).toEqual([])
})

test('the large graph demo preset renders a viewport slice of thousands of nodes', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'Large graph', exact: true }).click()
  await expect(page.getByText('3750 nodes')).toBeVisible()
  const nodes = page.getByRole('button', { name: /^Node \d+ Rank \d+$/ })
  await expect(nodes.first()).toBeVisible()
  const rendered = await nodes.count()
  expect(rendered).toBeGreaterThan(0)
  expect(rendered).toBeLessThan(3000)
  await page.getByRole('searchbox', { name: 'Search nodes' }).fill('Node 3750')
  await page.getByRole('searchbox', { name: 'Search nodes' }).press('Enter')
  await expect(page.getByRole('button', { name: 'Node 3750 Rank 150', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

async function openTimelineEditing(page: Page) {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'Timeline editing', exact: true }).click()
  const chart = page.getByRole('region', { name: 'Editable timeline', exact: true })
  await expect(chart).toBeVisible()
  const status = (text: string) => page.getByRole('status').filter({ hasText: text })
  return { errors, chart, status }
}

test('gantt dependencies connect by keyboard and pointer, reject duplicates, reconnect, delete and cancel', async ({ page }) => {
  const { errors, chart, status } = await openTimelineEditing(page)
  const links = chart.getByRole('button', { name: /^Select dependency / })
  await expect(links).toHaveCount(1)

  await chart.getByRole('button', { name: 'Start dependency from finish of Billing API', exact: true }).press('Enter')
  await expect(chart.getByRole('button', { name: 'Start dependency from finish of Billing API', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await chart.getByRole('button', { name: 'Connect dependency to start of Acceptance tests', exact: true }).press('Enter')
  await expect(status('Added FS dependency from Billing API to Acceptance tests.')).toBeVisible()
  await expect(links).toHaveCount(2)
  await chart.getByRole('button', { name: 'Start dependency from finish of Billing API', exact: true }).press('Space')
  await chart.getByRole('button', { name: 'Connect dependency to finish of Acceptance tests', exact: true }).press('Enter')
  await expect(status('These bars are already linked.')).toBeVisible()
  await expect(links).toHaveCount(2)

  // Escape discards an armed handle.
  await chart.getByRole('button', { name: 'Start dependency from start of Checkout UI', exact: true }).press('Enter')
  await expect(chart.getByRole('button', { name: 'Connect dependency to finish of Wireframes', exact: true })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(chart.getByRole('button', { name: 'Start dependency from finish of Wireframes', exact: true })).toBeVisible()

  // Pointer drag between handles derives the type from the joined ends.
  const source = (await chart.getByRole('button', { name: 'Start dependency from finish of Wireframes', exact: true }).boundingBox())!
  const target = (await chart.getByRole('button', { name: 'Start dependency from finish of Checkout UI', exact: true }).boundingBox())!
  await page.mouse.move(source.x + source.width / 2, source.y + source.height / 2)
  await page.mouse.down()
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 10 })
  await expect(chart.locator('.vw-gantt-link-preview path')).toHaveAttribute('d', /^M .+ L /)
  await page.mouse.up()
  await expect(status('Added FF dependency from Wireframes to Checkout UI.')).toBeVisible()
  await expect(links).toHaveCount(3)
  await expect(chart.locator('.vw-gantt-link-preview')).toHaveCount(0)

  // Select a dependency, move its target end with the keyboard, then delete it.
  await chart.getByRole('button', { name: 'Select dependency Wireframes → Billing API FS', exact: true }).press('Enter')
  await expect(status('Selected dependency wireframes-api.')).toBeVisible()
  await chart.getByRole('button', { name: 'Reconnect target of Wireframes → Billing API FS', exact: true }).press('Enter')
  await chart.getByRole('button', { name: 'Connect dependency to start of Acceptance tests', exact: true }).press('Enter')
  await expect(status('Reconnected wireframes-api as FS to Acceptance tests.')).toBeVisible()
  const moved = chart.getByRole('button', { name: 'Select dependency Wireframes → Acceptance tests FS', exact: true })
  await moved.press('Enter')
  await moved.press('Delete')
  await expect(status('Deleted dependency wireframes-api.')).toBeVisible()
  await expect(links).toHaveCount(2)

  // A source-data change cancels an armed connection.
  await chart.getByRole('button', { name: 'Start dependency from finish of Checkout UI', exact: true }).press('Enter')
  await expect(chart.getByRole('button', { name: 'Connect dependency to start of Billing API', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Reset timeline', exact: true }).dispatchEvent('click')
  await expect(chart.getByRole('button', { name: 'Start dependency from start of Billing API', exact: true })).toBeVisible()
  await expect(chart.getByRole('button', { name: 'Start dependency from finish of Checkout UI', exact: true })).toHaveAttribute('aria-pressed', 'false')
  await expect(links).toHaveCount(1)
  expect(errors).toEqual([])
})

test('gantt multi-selection moves bars as one batch and bars move between rows with validation', async ({ page }) => {
  const { errors, chart, status } = await openTimelineEditing(page)
  const api = chart.locator('.vw-gantt-bar[aria-label^="Billing API"]')
  const ui = chart.locator('.vw-gantt-bar[aria-label^="Checkout UI"]')
  await chart.getByRole('button', { name: 'Billing API 10:00–13:00', exact: true }).click()
  await chart.getByRole('button', { name: 'Checkout UI 10:00–14:00', exact: true }).click({ modifiers: ['Shift'] })
  await expect(api).toHaveAttribute('aria-pressed', 'true')
  await expect(ui).toHaveAttribute('aria-pressed', 'true')
  await ui.press('ArrowRight')
  await expect(status('Moved 2 bars.')).toBeVisible()
  await expect(api).toHaveAttribute('aria-label', 'Billing API 10:15–13:15')
  await expect(ui).toHaveAttribute('aria-label', 'Checkout UI 10:15–14:15')

  // A pointer drag moves the whole selection and keeps it selected.
  await page.getByRole('button', { name: 'Reset timeline', exact: true }).click()
  await chart.getByRole('button', { name: 'Billing API 10:00–13:00', exact: true }).click()
  await chart.getByRole('button', { name: 'Checkout UI 10:00–14:00', exact: true }).click({ modifiers: ['Control'] })
  const box = (await api.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 58, box.y + box.height / 2, { steps: 6 })
  await page.mouse.up()
  await expect(api).toHaveAttribute('aria-label', 'Billing API 10:30–13:30')
  await expect(ui).toHaveAttribute('aria-label', 'Checkout UI 10:30–14:30')
  await expect(api).toHaveAttribute('aria-pressed', 'true')
  await expect(ui).toHaveAttribute('aria-pressed', 'true')

  // A batch row move that the application rejects changes nothing.
  await api.press('ArrowDown')
  await expect(status('Only acceptance work can move to Quality.')).toBeVisible()
  await expect(api).toHaveAttribute('aria-label', 'Billing API 10:30–13:30')

  // Keyboard row move keeps focus on the moved bar.
  const wireframes = chart.getByRole('button', { name: 'Wireframes 08:00–10:00', exact: true })
  await wireframes.click()
  await expect(api).toHaveAttribute('aria-pressed', 'false')
  await wireframes.press('ArrowDown')
  await expect(status('Moved Wireframes to Platform team.')).toBeVisible()
  await expect(chart.locator('.vw-gantt-bar:focus')).toHaveAttribute('aria-label', 'Wireframes 08:00–10:00')
  await page.keyboard.press('ArrowUp')
  await expect(status('Moved Wireframes to Product team.')).toBeVisible()

  // Pointer row drags propose the row under the pointer; Escape cancels a drag.
  const tests = chart.getByRole('button', { name: 'Acceptance tests 14:00–16:00', exact: true })
  const start = (await tests.boundingBox())!
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2 - 66, { steps: 6 })
  await expect(chart.locator('.vw-gantt-bar.dragging')).toHaveAttribute('style', /translateY\(-66px\)/)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(chart.locator('.vw-gantt-bar.dragging')).toHaveCount(0)
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2 - 66, { steps: 6 })
  await page.mouse.up()
  await expect(status('Moved Acceptance tests to Web team.')).toBeVisible()
  const checkout = (await ui.boundingBox())!
  await page.mouse.move(checkout.x + checkout.width / 2, checkout.y + checkout.height / 2)
  await page.mouse.down()
  await page.mouse.move(checkout.x + checkout.width / 2, checkout.y + checkout.height / 2 + 66, { steps: 6 })
  await page.mouse.up()
  await expect(status('Only acceptance work can move to Quality.')).toBeVisible()
  expect(errors).toEqual([])
})

test('gantt zoom presets, now marker and resource load histogram share the time axis', async ({ page }) => {
  const { errors, chart, status } = await openTimelineEditing(page)
  const presets = page.getByRole('group', { name: 'Zoom level', exact: true })
  await expect(presets.getByRole('button', { name: 'Hours', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(chart.getByText('Day 2026-11-09', { exact: true })).toBeVisible()
  await expect(chart.locator('.vw-gantt-now')).toHaveText('Now')
  await expect(chart.locator('.vw-gantt-now')).toHaveAttribute('title', 'Now 11:30')
  await expect(chart.getByRole('group', { name: 'Resource load Engineering pool', exact: true })).toBeVisible()
  const overload = chart.getByRole('img', { name: 'Engineering pool 10:00–13:00: load 2 / capacity 1, overloaded by 1', exact: true })
  await expect(overload).toBeVisible()
  await expect(chart.locator('.vw-gantt-load-segment.overloaded')).toHaveCount(1)
  const bar = (await chart.getByRole('button', { name: 'Billing API 10:00–13:00', exact: true }).boundingBox())!
  const segment = (await overload.boundingBox())!
  expect(Math.abs(segment.x - bar.x)).toBeLessThanOrEqual(1)

  // Moving work updates the histogram.
  const checkout = chart.locator('.vw-gantt-bar[aria-label^="Checkout UI"]')
  await checkout.click()
  for (let i = 0; i < 12; i++) await checkout.press('ArrowRight')
  await expect(checkout).toHaveAttribute('aria-label', 'Checkout UI 13:00–17:00')
  await expect(chart.locator('.vw-gantt-load-segment.overloaded')).toHaveCount(1)
  await expect(chart.getByRole('img', { name: 'Engineering pool 14:00–16:00: load 2 / capacity 1, overloaded by 1', exact: true })).toBeAttached()

  await presets.getByRole('button', { name: 'Shifts', exact: true }).click()
  await expect(presets.getByRole('button', { name: 'Shifts', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(chart.getByText('Shift from 08:00', { exact: true })).toBeVisible()
  await expect(status('100% · shifts')).toBeVisible()
  const zoomIn = page.getByRole('group', { name: 'Timeline zoom', exact: true }).getByRole('button', { name: 'Zoom in', exact: true })
  await zoomIn.click()
  await expect(status('135% · shifts')).toBeVisible()
  await presets.getByRole('button', { name: 'Hours', exact: true }).click()
  await expect(status('100% · hours')).toBeVisible()
  expect(errors).toEqual([])
})

test('gantt two-pointer touch pinch zooms the time axis', async ({ page }) => {
  const { errors, chart, status } = await openTimelineEditing(page)
  const output = page.getByRole('group', { name: 'Timeline zoom', exact: true }).locator('output')
  await expect(output).toHaveText('100%')
  await chart.evaluate(element => {
    const rect = element.getBoundingClientRect()
    const x = rect.left + rect.width / 2, y = rect.top + 200
    const fire = (type: string, pointerId: number, clientX: number) => element.dispatchEvent(new PointerEvent(type, {
      pointerId, pointerType: 'touch', isPrimary: pointerId === 11, clientX, clientY: y, bubbles: true, cancelable: true,
    }))
    fire('pointerdown', 11, x - 50)
    fire('pointerdown', 12, x + 50)
    for (let step = 1; step <= 5; step++) {
      fire('pointermove', 11, x - 50 - step * 10)
      fire('pointermove', 12, x + 50 + step * 10)
    }
    fire('pointerup', 11, x - 100)
    fire('pointerup', 12, x + 100)
  })
  await expect(output).toHaveText('200%')
  await expect(status('200% · hours')).toBeVisible()
  // A single touch pointer does not zoom.
  await chart.evaluate(element => {
    const rect = element.getBoundingClientRect()
    const fire = (type: string, clientX: number) => element.dispatchEvent(new PointerEvent(type, {
      pointerId: 21, pointerType: 'touch', isPrimary: true, clientX, clientY: rect.top + 200, bubbles: true, cancelable: true,
    }))
    fire('pointerdown', rect.left + 300)
    fire('pointermove', rect.left + 500)
    fire('pointerup', rect.left + 500)
  })
  await expect(output).toHaveText('200%')
  expect(errors).toEqual([])
})

async function openGanttFixture(page: Page, search: string) {
  await page.route('**/gantt-test/**', async route => {
    const filename = new URL(route.request().url()).pathname.slice('/gantt-test/'.length)
    if (filename === '') return route.fulfill({ path: fileURLToPath(new URL('./fixtures/gantt.html', import.meta.url)) })
    if (filename === 'vue.js') {
      return route.fulfill({
        path: fileURLToPath(new URL('../../node_modules/vue/dist/vue.esm-browser.prod.js', import.meta.url)),
        contentType: 'text/javascript',
      })
    }
    if (/^[\w-]+\.(?:js|css)$/.test(filename)) {
      return route.fulfill({
        path: fileURLToPath(new URL('../../dist/' + filename, import.meta.url)),
        contentType: filename.endsWith('.css') ? 'text/css' : 'text/javascript',
      })
    }
    return route.fulfill({ status: 404, body: 'Not found' })
  })
  await page.goto('/gantt-test/' + search)
  const chart = page.getByRole('region', { name: 'Gantt chart', exact: true })
  await expect(chart).toBeVisible()
  const out = (name: string) => page.getByRole('status', { name, exact: true })
  return { chart, out }
}

test('gantt keyboard row moves emit plain time ranges like pointer moves', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const { chart, out } = await openGanttFixture(page, '?rowDraggable=1')
  await chart.getByRole('button', { name: 'Task A 0–2', exact: true }).press('ArrowDown')
  await expect(out('Last edit')).not.toHaveText('')
  expect(JSON.parse((await out('Last edit').textContent())!)).toEqual({
    id: 'a', before: { start: 0, end: 2 }, after: { start: 0, end: 2 }, mode: 'move', source: 'keyboard', row: { before: 'r1', after: 'r2' },
  })
  expect(errors).toEqual([])
})

test('gantt grid lines follow every tick of a piecewise scale in both directions and through zoom', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  for (const search of ['?piecewise=1', '?piecewise=1&rtl=1']) {
    const rtl = search.includes('rtl')
    const { chart } = await openGanttFixture(page, search)
    // The inline-start edge of each element: left in left-to-right charts, right in right-to-left ones.
    const edges = (selector: string) => chart.locator(selector).evaluateAll((elements, mirrored) => elements
      .map(element => element.getBoundingClientRect())
      .map(rect => Math.round(mirrored ? rect.right : rect.left)), rtl)
    for (const zoom of ['100%', '135%']) {
      if (zoom !== '100%') await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
      await expect(page.getByRole('group', { name: 'Timeline zoom', exact: true }).getByText(zoom, { exact: true })).toBeVisible()
      // Labels 0..90 start at their tick; the closing tick label at 100 is aligned to the other side.
      const labels = (await edges('.vw-gantt-tick:not(.end)'))
      const grid = await edges('.vw-gantt-grid-line')
      const head = await edges('.vw-gantt-tick-line')
      expect(labels).toHaveLength(10)
      expect(grid).toHaveLength(11)
      expect(grid.slice(0, 10)).toEqual(labels)
      expect(head).toEqual(grid)
      // The compressed half keeps a line for every tick: 50..90 are 10 units apart but only 1 px per unit.
      const gaps = grid.slice(6).map((x, i) => Math.abs(x - grid[i + 5]!))
      expect(gaps.every(gap => gap > 0 && gap < 20)).toBe(true)
    }
  }
  expect(errors).toEqual([])
})

test('gantt readonly keeps dependency selection but proposes no delete', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const { chart, out } = await openGanttFixture(page, '?readonly=1')
  const link = chart.getByRole('button', { name: 'Select dependency Task A → Task B FS', exact: true })
  await link.press('Delete')
  await link.press('Backspace')
  await link.press('Enter')
  await expect(out('Dependency selects')).toHaveText('1')
  await expect(out('Dependency deletes')).toHaveText('0')
  await expect(chart.getByRole('button', { name: /^Start dependency / })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('gantt zoom presets ignore the active preset and a controlled parent that declines a change', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  for (const search of ['', '?controlled=1']) {
    const { chart } = await openGanttFixture(page, search)
    const zoom = page.getByRole('group', { name: 'Timeline zoom', exact: true }).locator('output')
    const presets = page.getByRole('group', { name: 'Zoom level', exact: true })
    if (!search) await presets.getByRole('button', { name: 'Wide', exact: true }).click()
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
    await expect(zoom).toHaveText('135%')
    const scroller = chart
    await scroller.evaluate(el => { el.scrollLeft = 1500 })
    // The active preset is a no-op: zoom and scroll stay.
    await presets.getByRole('button', { name: 'Wide', exact: true }).click()
    await expect(zoom).toHaveText('135%')
    expect(await scroller.evaluate(el => el.scrollLeft)).toBe(1500)
    if (search) {
      // A parent that ignores the update keeps the zoom, and its stale centre is not applied to a later change.
      await presets.getByRole('button', { name: 'Narrow', exact: true }).click()
      await expect(zoom).toHaveText('135%')
      await expect(presets.getByRole('button', { name: 'Wide', exact: true })).toHaveAttribute('aria-pressed', 'true')
      await scroller.evaluate(el => { el.scrollLeft = 1500 })
      await page.getByRole('button', { name: 'Parent switches to Narrow', exact: true }).click()
      await expect(presets.getByRole('button', { name: 'Narrow', exact: true })).toHaveAttribute('aria-pressed', 'true')
      expect(await scroller.evaluate(el => el.scrollLeft)).toBe(1500)
      await expect(zoom).toHaveText('135%')
    } else {
      // A real change resets the zoom and keeps the centre.
      const centreAt = (el: HTMLElement, scale: number) =>
        (el.scrollLeft + (el.clientWidth - el.querySelector('.vw-gantt-corner')!.getBoundingClientRect().width) / 2) / scale
      const centre = await scroller.evaluate(centreAt, 1.35 * 50)
      await presets.getByRole('button', { name: 'Narrow', exact: true }).click()
      await expect(zoom).toHaveText('100%')
      await expect.poll(() => scroller.evaluate(centreAt, 25)).toBeCloseTo(centre, -1)
    }
  }
  expect(errors).toEqual([])
})

test('gantt real two-finger touch pinch survives a drifting midpoint without native panning', async ({ page }) => {
  const { errors, chart } = await openTimelineEditing(page)
  const cdp = await page.context().newCDPSession(page)
  const output = page.getByRole('group', { name: 'Timeline zoom', exact: true }).locator('output')
  // Zoom in first so the scroller can pan, then pinch on empty row background where touch-action is pan-x pan-y.
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await page.getByRole('button', { name: 'Zoom in', exact: true }).click()
  await expect(output).toHaveText('182%')
  const spot = await chart.evaluate(el => {
    const r = el.getBoundingClientRect()
    for (const y of [150, 200, 250, 300]) for (let x = 400; x < r.width - 200; x += 10) {
      const free = [x - 100, x + 100].every(px => /^vw-gantt-(row|grid)/.test(String(document.elementFromPoint(r.left + px, r.top + y)?.className ?? '')))
      if (free) return { x: r.left + x, y: r.top + y }
    }
    return undefined
  })
  expect(spot).toBeDefined()
  await chart.evaluate(el => {
    const log = { cancels: 0, twoFingerMoves: 0, prevented: 0, singleMoves: 0, singlePrevented: 0 }
    el.addEventListener('pointercancel', () => { log.cancels++ })
    // Registered after the component's own listener, so it sees the final defaultPrevented state.
    el.addEventListener('touchmove', event => {
      if (event.touches.length >= 2) { log.twoFingerMoves++; if (event.defaultPrevented) log.prevented++ }
      else { log.singleMoves++; if (event.defaultPrevented) log.singlePrevented++ }
    }, { passive: true })
    ;(window as any).__pinchLog = log
  })
  const { x: cx, y: cy } = spot!
  await touch(cdp, 'touchStart', [{ x: cx - 40, y: cy, id: 1 }, { x: cx + 40, y: cy, id: 2 }])
  // The midpoint drifts down and sideways while the fingers spread, as a real pinch does.
  for (let step = 1; step <= 12; step++) {
    await touch(cdp, 'touchMove', [{ x: cx - 40 + step * 4, y: cy + step * 5, id: 1 }, { x: cx + 40 + step * 16, y: cy + step * 5, id: 2 }])
  }
  await touch(cdp, 'touchEnd', [])
  await expect.poll(async () => Number.parseInt((await output.textContent())!, 10)).toBeGreaterThan(182)
  const log = await page.evaluate(() => (window as any).__pinchLog)
  expect(log.cancels).toBe(0)
  expect(log.twoFingerMoves).toBeGreaterThan(0)
  expect(log.prevented).toBe(log.twoFingerMoves)
  // One finger still scrolls natively.
  const scrollBefore = await chart.evaluate(el => el.scrollLeft)
  await touch(cdp, 'touchStart', [{ x: cx, y: cy, id: 1 }])
  await touch(cdp, 'touchMove', [{ x: cx - 80, y: cy, id: 1 }])
  await touch(cdp, 'touchMove', [{ x: cx - 160, y: cy, id: 1 }])
  await touch(cdp, 'touchEnd', [])
  await expect.poll(() => chart.evaluate(el => el.scrollLeft)).not.toBe(scrollBefore)
  expect((await page.evaluate(() => (window as any).__pinchLog)).singlePrevented).toBe(0)
  expect(errors).toEqual([])
})

test('gantt progress slider edits by pointer and keyboard, cancels with Escape and follows the visual direction', async ({ page }) => {
  const { errors, chart, status } = await openTimelineEditing(page)
  const api = chart.getByRole('button', { name: 'Billing API 10:00–13:00', exact: true })
  const slider = chart.getByRole('slider', { name: 'Progress of Billing API', exact: true })
  await expect(slider).toHaveAttribute('aria-valuetext', '30%')
  await expect(slider).toHaveAttribute('aria-valuenow', '30')
  const centre = async () => {
    const box = (await slider.boundingBox())!
    return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  }
  // The slider sits on the progress boundary: 30% of the three-hour bar.
  let bar = (await api.boundingBox())!
  let handle = await centre()
  expect(Math.abs(handle.x - (bar.x + bar.width * 0.3))).toBeLessThanOrEqual(1)

  // A drag previews the fill and proposes the snapped value on release: 69 px of 345 px is 20%.
  await page.mouse.move(handle.x, handle.y)
  await page.mouse.down()
  await page.mouse.move(handle.x + 69, handle.y, { steps: 6 })
  await expect(slider).toHaveAttribute('aria-valuetext', '50%')
  await expect(api.locator('.vw-bar-progress')).toHaveAttribute('style', /width: 50%/)
  await page.mouse.up()
  await expect(status('Billing API progress 50%.')).toBeVisible()
  await expect(slider).toBeFocused()

  // Escape discards a drag preview without a proposal.
  handle = await centre()
  await page.mouse.move(handle.x, handle.y)
  await page.mouse.down()
  await page.mouse.move(handle.x + 69, handle.y, { steps: 6 })
  await expect(slider).toHaveAttribute('aria-valuetext', '70%')
  await page.keyboard.press('Escape')
  await expect(slider).toHaveAttribute('aria-valuetext', '50%')
  await page.mouse.up()
  await expect(status('Billing API progress 50%.')).toBeVisible()

  // Each key press proposes one step: arrows by 5%, Page keys by 25%, Home and End to the limits.
  for (const [key, text] of [['ArrowRight', '55%'], ['ArrowDown', '50%'], ['ArrowUp', '55%'], ['PageDown', '30%'], ['End', '100%'], ['Home', '0%']]) {
    await slider.press(key)
    await expect(status(`Billing API progress ${text}.`)).toBeVisible()
    await expect(slider).toHaveAttribute('aria-valuetext', text)
  }

  // Right to left: progress grows towards the left, and ArrowLeft increases it.
  await page.getByRole('checkbox', { name: 'Right-to-left timeline', exact: true }).check()
  await slider.press('ArrowLeft')
  await expect(status('Billing API progress 5%.')).toBeVisible()
  await slider.press('PageUp')
  await expect(status('Billing API progress 30%.')).toBeVisible()
  bar = (await api.boundingBox())!
  handle = await centre()
  expect(Math.abs(handle.x - (bar.x + bar.width * 0.7))).toBeLessThanOrEqual(1)
  await slider.press('ArrowRight')
  await expect(status('Billing API progress 25%.')).toBeVisible()
  expect(errors).toEqual([])
})

test('gantt bars delete by keyboard with their dependencies and undo restores them', async ({ page }) => {
  const { errors, chart, status } = await openTimelineEditing(page)
  const links = chart.getByRole('button', { name: /^Select dependency / })
  const wireframes = chart.getByRole('button', { name: 'Wireframes 08:00–10:00', exact: true })
  const api = chart.getByRole('button', { name: 'Billing API 10:00–13:00', exact: true })
  const ui = chart.getByRole('button', { name: 'Checkout UI 10:00–14:00', exact: true })
  const undo = page.getByRole('button', { name: 'Undo timeline change', exact: true })
  await expect(wireframes).toHaveAccessibleDescription(/Delete or Backspace removes the bar\./)

  // Delete removes the focused bar and the dependency that touches it; focus stays in the chart.
  await wireframes.press('Delete')
  await expect(status('Deleted Wireframes.')).toBeVisible()
  await expect(wireframes).toHaveCount(0)
  await expect(links).toHaveCount(0)
  await expect(chart).toBeFocused()
  await undo.click()
  await expect(wireframes).toBeVisible()
  await expect(links).toHaveCount(1)
  await page.getByRole('button', { name: 'Redo timeline change', exact: true }).click()
  await expect(wireframes).toHaveCount(0)
  await undo.click()
  await expect(links).toHaveCount(1)

  // A bar in the selection deletes every selected bar in one proposal; Backspace works too.
  await api.click()
  await ui.click({ modifiers: ['Shift'] })
  await ui.press('Backspace')
  await expect(status('Deleted 2 bars.')).toBeVisible()
  await expect(api).toHaveCount(0)
  await expect(ui).toHaveCount(0)
  await expect(links).toHaveCount(0)
  await undo.click()
  await expect(api).toBeVisible()
  await expect(ui).toBeVisible()
  await expect(links).toHaveCount(1)

  // The application can reject a deletion through validateBarsDelete.
  await wireframes.click()
  for (const bar of [api, ui, chart.getByRole('button', { name: 'Acceptance tests 14:00–16:00', exact: true })]) await bar.click({ modifiers: ['Shift'] })
  await api.press('Delete')
  await expect(status('Keep at least one task in the plan.')).toBeVisible()
  await expect(chart.locator('.vw-gantt-bar')).toHaveCount(4)
  expect(errors).toEqual([])
})

test('gantt context menu opens by right-click and Shift+F10, adds a task at the clicked time and returns focus', async ({ page }) => {
  const { errors, chart, status } = await openTimelineEditing(page)
  // 15:00 is one hour (115 px) after Checkout UI ends, in the empty part of the Web team row.
  const ui = (await chart.getByRole('button', { name: 'Checkout UI 10:00–14:00', exact: true }).boundingBox())!
  await page.mouse.click(ui.x + ui.width + 115, ui.y + ui.height / 2, { button: 'right' })
  const rowMenu = page.getByRole('menu', { name: 'Actions for Web team', exact: true })
  await expect(rowMenu.getByRole('menuitem', { name: 'Add task here', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(status('Added New task 1 at 15:00–16:00 to Web team.')).toBeVisible()
  await expect(rowMenu).toHaveCount(0)
  await expect(chart.getByRole('button', { name: 'New task 1 15:00–16:00', exact: true })).toBeVisible()

  // Shift+F10 opens the menu for the focused bar; Escape closes it and returns focus to the bar.
  const api = chart.getByRole('button', { name: 'Billing API 10:00–13:00', exact: true })
  await api.press('Shift+F10')
  const barMenu = page.getByRole('menu', { name: 'Actions for Billing API', exact: true })
  await expect(barMenu.getByRole('menuitem', { name: 'Delete', exact: true })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(barMenu.getByRole('menuitem', { name: 'Set progress to 100%', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(barMenu).toHaveCount(0)
  await expect(api).toBeFocused()
  await api.press('Shift+F10')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(status('Billing API progress 100%.')).toBeVisible()
  await expect(chart.getByRole('slider', { name: 'Progress of Billing API', exact: true })).toHaveAttribute('aria-valuetext', '100%')
  await expect(api).toBeFocused()

  // Right-clicking a bar targets it; Delete removes it together with its dependency.
  const box = (await api.boundingBox())!
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { button: 'right' })
  await barMenu.getByRole('menuitem', { name: 'Delete', exact: true }).click()
  await expect(status('Deleted Billing API.')).toBeVisible()
  await expect(chart.getByRole('button', { name: /^Select dependency / })).toHaveCount(0)
  await expect(chart).toBeFocused()
  await page.getByRole('button', { name: 'Undo timeline change', exact: true }).click()

  // A focused dependency opens its own menu; a pointer press outside closes a menu.
  await chart.getByRole('button', { name: 'Select dependency Wireframes → Billing API FS', exact: true }).press('Shift+F10')
  await page.getByRole('menu', { name: 'Actions for dependency wireframes-api', exact: true }).getByRole('menuitem', { name: 'Delete dependency', exact: true }).click()
  await expect(status('Deleted dependency wireframes-api.')).toBeVisible()
  const header = (await chart.locator('.vw-gantt-time-head').boundingBox())!
  await page.mouse.click(header.x + 300, header.y + header.height / 2, { button: 'right' })
  const chartMenu = page.getByRole('menu', { name: 'Timeline actions', exact: true })
  await expect(chartMenu.getByRole('menuitem')).toHaveText(['Fit all bars'])
  await page.getByRole('heading', { name: 'Timeline editing', exact: true }).click()
  await expect(chartMenu).toHaveCount(0)
  expect(errors).toEqual([])
})

test('gantt tooltip appears after the hover delay or at once on keyboard focus, stays hoverable and hides on Escape', async ({ page }) => {
  const { errors, chart } = await openTimelineEditing(page)
  const api = chart.getByRole('button', { name: 'Billing API 10:00–13:00', exact: true })
  const tooltip = page.getByRole('tooltip')
  const region = (await chart.boundingBox())!
  const away = () => page.mouse.move(region.x + 4, region.y + region.height - 4)
  await expect(tooltip).toHaveCount(0)
  await api.hover()
  await expect(tooltip).toHaveText('Billing API10:00–13:00 · 30% complete')
  const id = (await tooltip.getAttribute('id'))!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // The tooltip is described after the existing hints and stays inside the chart viewport.
  await expect(api).toHaveAttribute('aria-describedby', new RegExp(`-hint \\S+-row-hint \\S+-delete-hint ${id}$`))
  const tip = (await tooltip.boundingBox())!
  expect(tip.x).toBeGreaterThanOrEqual(region.x)
  expect(tip.y).toBeGreaterThanOrEqual(region.y)
  expect(tip.x + tip.width).toBeLessThanOrEqual(region.x + region.width)

  // The pointer can move onto the tooltip without hiding it; Escape dismisses it.
  await page.mouse.move(tip.x + tip.width / 2, tip.y + tip.height / 2, { steps: 4 })
  await page.waitForTimeout(300)
  await expect(tooltip).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(tooltip).toHaveCount(0)
  await expect(api).not.toHaveAttribute('aria-describedby', /tooltip/)

  // Pressing a bar hides the tooltip, and none appears during the drag.
  await away()
  await api.hover()
  await expect(tooltip).toBeVisible()
  const box = (await api.boundingBox())!
  await page.mouse.down()
  await expect(tooltip).toHaveCount(0)
  await page.mouse.move(box.x + box.width / 2 + 58, box.y + box.height / 2, { steps: 6 })
  await page.waitForTimeout(500)
  await expect(tooltip).toHaveCount(0)
  await page.keyboard.press('Escape')
  await page.mouse.up()

  // Keyboard focus shows the tooltip without the delay; Escape hides it and keeps focus.
  await away()
  await chart.getByRole('button', { name: 'Start dependency from start of Billing API', exact: true }).focus()
  await page.keyboard.press('Shift+Tab')
  await expect(api).toBeFocused()
  await expect(tooltip).toBeVisible({ timeout: 250 })
  await expect(tooltip).toContainText('Billing API')
  await page.keyboard.press('Escape')
  await expect(tooltip).toHaveCount(0)
  await expect(api).toBeFocused()
  expect(errors).toEqual([])
})

test('gantt fit all bars and fit selection zoom to the bars and scroll them into view', async ({ page }) => {
  const { errors, chart, status } = await openTimelineEditing(page)
  const output = page.getByRole('group', { name: 'Timeline zoom', exact: true }).locator('output')
  const fitSelection = page.getByRole('button', { name: 'Fit selection', exact: true })
  await expect(output).toHaveText('100%')
  await expect(fitSelection).toBeDisabled()
  const area = await chart.evaluate(el => {
    const corner = el.querySelector('.vw-gantt-corner')!.getBoundingClientRect()
    const rect = el.getBoundingClientRect()
    return { left: corner.right, right: rect.left + el.clientLeft + el.clientWidth }
  })
  const width = area.right - area.left

  // All bars span 08:00–16:00 (920 px at 100%); the zoom leaves 24 px on each side.
  await page.getByRole('button', { name: 'Fit all bars', exact: true }).click()
  const all = Math.round(Math.min(3, Math.max(0.65, (width - 48) / 920)) * 100) + '%'
  await expect(output).toHaveText(all)
  await expect(status(all + ' · hours')).toBeVisible()
  // Wireframes starts at the start of the range, so scrolling stops there and the spare 48 px end up on the right.
  const first = (await chart.getByRole('button', { name: /^Wireframes / }).boundingBox())!
  const last = (await chart.getByRole('button', { name: /^Acceptance tests / }).boundingBox())!
  expect(Math.abs(first.x - area.left)).toBeLessThanOrEqual(1)
  expect(Math.abs(area.right - (last.x + last.width) - 48)).toBeLessThanOrEqual(1.5)

  // Three hours need more than the 300% limit, so the selection is centred at the maximum zoom.
  const api = chart.getByRole('button', { name: /^Billing API / })
  await api.click()
  await fitSelection.click()
  await expect(output).toHaveText('300%')
  await expect(status('Fitted Billing API into view.')).toBeVisible()
  const box = (await api.boundingBox())!
  expect(Math.abs(box.x + box.width / 2 - (area.left + area.right) / 2)).toBeLessThanOrEqual(1.5)
  expect(errors).toEqual([])
})

/** Pixel positions in the timeline editing demo, measured from Checkout UI (10:00–14:00 in the Web team row, 115 px per hour). */
async function editingGeometry(chart: ReturnType<Page['getByRole']>, rtl = false) {
  const ui = (await chart.getByRole('button', { name: 'Checkout UI 10:00–14:00', exact: true }).boundingBox())!
  return {
    ui,
    /** Client x of a time of day in hours, for example 14.5 for 14:30. */
    at: (hours: number) => rtl ? ui.x + ui.width - (hours - 10) * 115 : ui.x + (hours - 10) * 115,
    /** Client y at the middle of a task row: 0 Product team, 1 Platform team, 2 Web team, 3 Quality. */
    row: (index: number) => ui.y + ui.height / 2 + (index - 2) * 66,
  }
}

test('gantt drag to create previews and proposes new bars, rejects through validateCreate, cancels with Escape and has a keyboard path', async ({ page }) => {
  const { errors, chart, status } = await openTimelineEditing(page)
  const { at, row } = await editingGeometry(chart)
  const preview = chart.locator('.vw-gantt-create-preview')
  const bars = chart.locator('.vw-gantt-bar')
  await expect(bars).toHaveCount(4)

  // A drag over the empty part of the Web team row previews the snapped interval and proposes it on release.
  await page.mouse.move(at(14.5), row(2))
  await page.mouse.down()
  await page.mouse.move(at(16) + 4, row(2), { steps: 6 })
  await expect(preview).toHaveCount(1)
  const shown = (await preview.boundingBox())!
  expect(Math.abs(shown.x - at(14.5))).toBeLessThanOrEqual(1)
  expect(Math.abs(shown.width - 1.5 * 115)).toBeLessThanOrEqual(1)
  await expect(preview).toHaveAttribute('aria-hidden', 'true')
  await page.mouse.up()
  await expect(status('Added New task 1 at 14:30–16:00 to Web team.')).toBeVisible()
  await expect(chart.getByRole('button', { name: 'New task 1 14:30–16:00', exact: true })).toBeVisible()
  await expect(preview).toHaveCount(0)

  // A click without movement proposes createDuration (four snaps: one hour) from the snapped press time.
  await page.mouse.click(at(13) + 3, row(0))
  await expect(status('Added New task 2 at 13:00–14:00 to Product team.')).toBeVisible()
  await expect(bars).toHaveCount(6)

  // validateCreate rejects new work in the Quality row; the reason is announced and nothing is added.
  await page.mouse.move(at(10), row(3))
  await page.mouse.down()
  await page.mouse.move(at(12), row(3), { steps: 5 })
  await expect(preview).toHaveCount(1)
  await page.mouse.up()
  await expect(status('New tasks cannot be added to Quality.')).toBeVisible()
  await expect(page.locator('.vw-gantt [aria-live="polite"]').filter({ hasText: 'New tasks cannot be added to Quality.' })).toHaveCount(1)
  await expect(bars).toHaveCount(6)

  // Escape discards an in-flight create drag.
  await page.mouse.move(at(14), row(1))
  await page.mouse.down()
  await page.mouse.move(at(15.5), row(1), { steps: 5 })
  await expect(preview).toHaveCount(1)
  await expect(chart).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(preview).toHaveCount(0)
  await page.mouse.up()
  await expect(bars).toHaveCount(6)
  await expect(status('New tasks cannot be added to Quality.')).toBeVisible()

  // Pressing a bar, its handles or the row heading starts no create gesture.
  await page.mouse.click(at(11), row(1))
  await chart.getByText('Platform team', { exact: true }).click()
  await expect(bars).toHaveCount(6)

  // Keyboard path: each creatable row has an add button that proposes createDuration at the first time in view.
  const add = chart.getByRole('button', { name: 'Add bar to Platform team', exact: true })
  await add.focus()
  await page.keyboard.press('Enter')
  await expect(status('Added New task 3 at 08:00–09:00 to Platform team.')).toBeVisible()
  await expect(add).toBeFocused()
  await page.getByRole('button', { name: 'Undo timeline change', exact: true }).click()
  await expect(chart.getByRole('button', { name: /^New task 3 / })).toHaveCount(0)
  await expect(bars).toHaveCount(6)
  expect(errors).toEqual([])
})

test('gantt auto-arranged lanes stack an overlapping new task and keep the lane under the pointer', async ({ page }) => {
  const { errors, chart, status } = await openTimelineEditing(page)
  const { at, row } = await editingGeometry(chart)
  const api = chart.getByRole('button', { name: 'Billing API 10:00–13:00', exact: true })
  // Drag backwards from 13:30 to 11:00 so the new task overlaps Billing API in the same lane.
  await page.mouse.move(at(13.5), row(1))
  await page.mouse.down()
  await page.mouse.move(at(11), row(1), { steps: 6 })
  await page.mouse.up()
  await expect(status('Added New task 1 at 11:00–13:30 to Platform team.')).toBeVisible()
  const created = chart.getByRole('button', { name: 'New task 1 11:00–13:30', exact: true })
  const sameLane = [(await api.boundingBox())!, (await created.boundingBox())!]
  expect(Math.abs(sameLane[0]!.y - sameLane[1]!.y)).toBeLessThanOrEqual(0.5)

  const arrange = page.getByRole('checkbox', { name: 'Auto-arrange lanes', exact: true })
  await arrange.check()
  await expect.poll(async () => (await created.boundingBox())!.y - (await api.boundingBox())!.y).toBeGreaterThan(20)
  const [first, second] = [(await api.boundingBox())!, (await created.boundingBox())!]
  expect(second.y).toBeGreaterThanOrEqual(first.y + first.height)

  // With two lanes, a drag in the lower half of the Web team row creates the task in lane 1.
  const ui = (await chart.getByRole('button', { name: 'Checkout UI 10:00–14:00', exact: true }).boundingBox())!
  const rowTop = ui.y - 7
  await page.mouse.move(at(14.5), rowTop + 50)
  await page.mouse.down()
  await page.mouse.move(at(16), rowTop + 50, { steps: 5 })
  await page.mouse.up()
  await expect(status('Added New task 2 at 14:30–16:00 to Web team.')).toBeVisible()
  const lower = (await chart.getByRole('button', { name: 'New task 2 14:30–16:00', exact: true }).boundingBox())!
  expect(lower.y).toBeGreaterThanOrEqual(ui.y + ui.height)

  await arrange.uncheck()
  await expect.poll(async () => Math.abs((await created.boundingBox())!.y - (await api.boundingBox())!.y)).toBeLessThanOrEqual(0.5)
  expect(errors).toEqual([])
})

test('gantt create drag follows the visual direction in right-to-left charts and scrolls near the edge', async ({ page }) => {
  const { errors, chart, status } = await openTimelineEditing(page)
  await page.getByRole('checkbox', { name: 'Right-to-left timeline', exact: true }).check()
  const { at, row } = await editingGeometry(chart, true)
  // In RTL later times are further left: dragging left from 14:30 reaches 16:00.
  await page.mouse.move(at(14.5), row(2))
  await page.mouse.down()
  await page.mouse.move(at(16) - 4, row(2), { steps: 6 })
  const shown = (await chart.locator('.vw-gantt-create-preview').boundingBox())!
  expect(Math.abs(shown.x - at(16))).toBeLessThanOrEqual(1)
  expect(Math.abs(shown.x + shown.width - at(14.5))).toBeLessThanOrEqual(1)
  await page.mouse.up()
  await expect(status('Added New task 1 at 14:30–16:00 to Web team.')).toBeVisible()
  await expect(chart.getByRole('button', { name: 'New task 1 14:30–16:00', exact: true })).toBeVisible()

  // Back to LTR in a narrow viewport: dragging towards the right edge scrolls and extends the new interval.
  await page.getByRole('checkbox', { name: 'Right-to-left timeline', exact: true }).uncheck()
  await page.setViewportSize({ width: 640, height: 900 })
  const corner = (await chart.locator('.vw-gantt-corner').boundingBox())!
  const area = (await chart.boundingBox())!
  const y = (await editingGeometry(chart)).row(2)
  await page.mouse.move(corner.x + corner.width + 115, y)
  await page.mouse.down()
  await page.mouse.move(area.x + area.width - 10, y, { steps: 8 })
  await expect.poll(() => chart.evaluate(el => el.scrollLeft)).toBeGreaterThan(50)
  await page.mouse.up()
  await expect(page.getByRole('status').filter({ hasText: /^Added New task 2 at 09:00–1[3-8]:\d\d to Web team\.$/ })).toBeVisible()
  expect(errors).toEqual([])
})

test('gantt create by touch: a tap proposes a bar and the second touch of a pinch cancels the gesture', async ({ page }) => {
  const { errors, chart, status } = await openTimelineEditing(page)
  const { at, row } = await editingGeometry(chart)
  const cdp = await page.context().newCDPSession(page)
  const output = page.getByRole('group', { name: 'Timeline zoom', exact: true }).locator('output')
  const bars = chart.locator('.vw-gantt-bar')
  await touch(cdp, 'touchStart', [{ x: at(15) + 3, y: row(2), id: 1 }])
  await touch(cdp, 'touchEnd', [])
  await expect(status('Added New task 1 at 15:00–16:00 to Web team.')).toBeVisible()
  await expect(bars).toHaveCount(5)

  // The first finger lands on empty row background and would create a bar; the second one turns it into a pinch.
  const y = row(2)
  await touch(cdp, 'touchStart', [{ x: at(16.5), y, id: 1 }])
  await touch(cdp, 'touchStart', [{ x: at(16.5), y, id: 1 }, { x: at(17.5), y, id: 2 }])
  for (let step = 1; step <= 8; step++) {
    await touch(cdp, 'touchMove', [{ x: at(16.5) - step * 8, y, id: 1 }, { x: at(17.5) + step * 8, y, id: 2 }])
  }
  await touch(cdp, 'touchEnd', [])
  await expect.poll(async () => Number.parseInt((await output.textContent())!, 10)).toBeGreaterThan(100)
  await expect(chart.locator('.vw-gantt-create-preview')).toHaveCount(0)
  // Bars outside the zoomed time window are virtualized, so the status shows that nothing was added.
  await expect(status('Added New task 1 at 15:00–16:00 to Web team.')).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: 'New task 2' })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('the scheduling demo previews cascaded operations during a drag and applies them as one batch', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'Scheduling', exact: true }).click()
  const plan = page.getByRole('region', { name: 'Gantt chart', exact: true }).first()
  const cutting = plan.getByRole('button', { name: /^Cut order A \d\d Nov.*–/ })
  const inspection = plan.getByRole('button', { name: /^Inspect order A \d\d Nov.*–/ })
  const packing = plan.getByRole('button', { name: /^Pack order A \d\d Nov.*–/ })
  const ghosts = plan.locator('.vw-gantt-cascade-preview')
  await expect(cutting).toHaveAttribute('aria-label', 'Cut order A 09 Nov 08:00–09 Nov 11:00')
  const box = (await cutting.boundingBox())!
  const inspect = (await inspection.boundingBox())!
  const y = box.y + box.height / 2
  const drag = async () => {
    await page.mouse.move(box.x + box.width / 2, y)
    await page.mouse.down()
    // 36 px is two hours: the requested start becomes 10:00.
    await page.mouse.move(box.x + box.width / 2 + 36, y, { steps: 6 })
  }

  // Inspection (14:00–16:00) and packing follow the dragged order while it is held; Escape discards the preview.
  await drag()
  await expect(ghosts).toHaveCount(2)
  const ghost = (await ghosts.first().boundingBox())!
  expect(ghost.x - inspect.x).toBeCloseTo(54, 0)
  expect(ghost.width).toBeCloseTo(36, 0)
  expect(ghost.y).toBeCloseTo(inspect.y, 0)
  await expect(inspection).toHaveAttribute('aria-label', 'Inspect order A 09 Nov 11:00–09 Nov 14:00')
  await page.keyboard.press('Escape')
  await expect(ghosts).toHaveCount(0)
  await page.mouse.up()
  await expect(cutting).toHaveAttribute('aria-label', 'Cut order A 09 Nov 08:00–09 Nov 11:00')

  // Release proposes the move and the cascaded operations as one batch; the demo recalculates the plan from it.
  await drag()
  await expect(ghosts).toHaveCount(2)
  await page.mouse.up()
  await expect(page.getByRole('status').filter({ hasText: 'Plan recalculated. 2 other operations changed.' })).toBeVisible()
  await expect(ghosts).toHaveCount(0)
  await expect(cutting).toHaveAttribute('aria-label', 'Cut order A 09 Nov 10:00–09 Nov 14:00')
  await expect(inspection).toHaveAttribute('aria-label', 'Inspect order A 09 Nov 14:00–09 Nov 16:00')
  await expect(packing).toHaveAttribute('aria-label', 'Pack order A 09 Nov 16:00–11 Nov 09:00')

  // A resize is not cascaded and is still rejected by validateEdit through the single edit path.
  const resized = (await cutting.boundingBox())!
  await page.mouse.move(resized.x + resized.width - 3, y)
  await page.mouse.down()
  await page.mouse.move(resized.x + resized.width + 18, y, { steps: 4 })
  await expect(ghosts).toHaveCount(0)
  await page.mouse.up()
  await expect(page.getByRole('status').filter({ hasText: 'Move the bar to change the requested start.' })).toBeVisible()
  expect(errors).toEqual([])
})

test('gantt context-menu, progress and delete proposals carry exact targets, times and rows in both directions', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  for (const rtl of [false, true]) {
    const { chart, out } = await openGanttFixture(page, '?interactions=1' + (rtl ? '&rtl=1' : ''))
    const json = async (name: string) => JSON.parse((await out(name).textContent()) || 'null')
    const barA = chart.getByRole('button', { name: 'Task A 0–2', exact: true })
    const a = (await barA.boundingBox())!
    // Positions along the time axis: 50 px per unit from the inline-start edge of Task A (time 0).
    const origin = rtl ? a.x + a.width : a.x
    const at = (time: number) => Math.round(origin + (rtl ? -time : time) * 50)
    const timeOf = (x: number) => (rtl ? origin - x : x - origin) / 50
    const y = Math.round(a.y + a.height / 2)

    await page.mouse.click(at(0.5), y, { button: 'right' })
    const onBar = await json('Last context menu')
    expect(onBar).toMatchObject({ target: { kind: 'bar', id: 'a' }, rowId: 'r1', clientX: at(0.5), clientY: y, source: 'pointer' })
    expect(onBar.time).toBeCloseTo(timeOf(at(0.5)), 3)
    // Empty time area of a row, the row heading and the header.
    await page.mouse.click(at(10), y + 66, { button: 'right' })
    const onRow = await json('Last context menu')
    expect(onRow).toMatchObject({ target: { kind: 'row', id: 'r2' }, rowId: 'r2' })
    expect(onRow.time).toBeCloseTo(timeOf(at(10)), 3)
    await chart.getByText('Row 1', { exact: true }).click({ button: 'right' })
    const heading = await json('Last context menu')
    expect(heading).toMatchObject({ target: { kind: 'row', id: 'r1' }, rowId: 'r1', source: 'pointer' })
    expect(heading).not.toHaveProperty('time')
    await page.mouse.click(at(3), Math.round(a.y - 20), { button: 'right' })
    const header = await json('Last context menu')
    expect(header).toMatchObject({ target: { kind: 'chart' } })
    expect(header.time).toBeCloseTo(timeOf(at(3)), 3)
    expect(header).not.toHaveProperty('rowId')

    // The keyboard reports the focused element's centre and no time.
    await barA.press('Shift+F10')
    const keyboard = await json('Last context menu')
    expect(keyboard).toMatchObject({ target: { kind: 'bar', id: 'a' }, rowId: 'r1', source: 'keyboard' })
    expect(keyboard).not.toHaveProperty('time')
    expect(keyboard.clientX).toBeCloseTo(a.x + a.width / 2, 1)
    expect(keyboard.clientY).toBeCloseTo(a.y + a.height / 2, 1)
    const link = chart.getByRole('button', { name: 'Select dependency Task A → Task B FS', exact: true })
    await link.press('ContextMenu')
    expect(await json('Last context menu')).toMatchObject({ target: { kind: 'dependency', id: 'ab' }, source: 'keyboard' })

    // Progress: a pointer drag over half the bar, then keys. The parent applies nothing, so each key starts at 0.
    const slider = chart.getByRole('slider', { name: 'Progress of Task A', exact: true })
    const handle = (await slider.boundingBox())!
    expect(Math.abs(handle.x + handle.width / 2 - origin)).toBeLessThanOrEqual(0.5)
    await page.mouse.move(origin, handle.y + handle.height / 2)
    await page.mouse.down()
    await page.mouse.move(at(1), handle.y + handle.height / 2, { steps: 5 })
    await page.mouse.up()
    expect(await json('Last progress edit')).toEqual({ id: 'a', after: 0.5, source: 'pointer' })
    await slider.press(rtl ? 'ArrowLeft' : 'ArrowRight')
    expect(await json('Last progress edit')).toEqual({ id: 'a', after: 0.05, source: 'keyboard' })
    await slider.press('End')
    expect(await json('Last progress edit')).toEqual({ id: 'a', after: 1, source: 'keyboard' })
    // Lowering progress that is already 0 proposes nothing.
    await slider.press(rtl ? 'ArrowRight' : 'ArrowLeft')
    expect(await json('Last progress edit')).toEqual({ id: 'a', after: 1, source: 'keyboard' })

    // Delete proposes the focused bar, but not while a connection is armed.
    await chart.getByRole('button', { name: 'Start dependency from finish of Task A', exact: true }).press('Enter')
    await barA.press('Delete')
    await expect(out('Last delete')).toHaveText('')
    await page.keyboard.press('Escape')
    await barA.press('Backspace')
    await expect(out('Last delete')).toHaveText('["a"]')

    // fitToBars validates synchronously, ignores an empty set, clamps to the maximum zoom and centres the bar.
    const attempts = await page.evaluate(() => {
      const chart = (window as any).ganttChart.value
      const attempt = (run: () => unknown) => {
        try {
          run()
          return 'ok'
        } catch (error) {
          return `${(error as Error).name}: ${(error as Error).message}`
        }
      }
      return [attempt(() => chart.fitToBars(['nope'])), attempt(() => chart.fitToBars(['a'], { padding: -1 })), attempt(() => chart.fitToBars([]))]
    })
    expect(attempts).toEqual(['Error: Unknown bar: nope', 'RangeError: padding must be finite and nonnegative', 'ok'])
    await expect(out('Zoom events')).toHaveText('')
    await page.getByRole('button', { name: 'Fit Task B', exact: true }).click()
    await expect(out('Zoom events')).toHaveText('3/')
    const area = await chart.evaluate(el => {
      const corner = el.querySelector('.vw-gantt-corner')!.getBoundingClientRect()
      const rect = el.getBoundingClientRect()
      return el.closest('[dir="rtl"]') ? { left: rect.left + el.clientLeft, right: corner.left } : { left: corner.right, right: rect.left + el.clientLeft + el.clientWidth }
    })
    const b = (await chart.getByRole('button', { name: 'Task B 4–6', exact: true }).boundingBox())!
    expect(b.width).toBeCloseTo(300, 0)
    expect(Math.abs(b.x + b.width / 2 - (area.left + area.right) / 2)).toBeLessThanOrEqual(1.5)
  }
  expect(errors).toEqual([])
})

test('network direction, crossing reduction and layout controls', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  const split = page.getByRole('button', { name: /^Split/ }).first()
  await expect(split).toBeVisible()
  for (const direction of ['RL', 'BT', 'LR']) {
    await page.getByLabel('Direction').selectOption(direction)
    await expect(page.locator('.vw-network-node').first()).toBeVisible()
  }
  await page.getByLabel('Crossing reduction').selectOption('barycenter')
  for (const layout of ['tree', 'radial', 'layered']) {
    await page.getByLabel('Graph layout').selectOption(layout)
    await expect(page.locator('.vw-network-node').first()).toBeVisible()
  }
  expect(errors).toEqual([])
})

test('opt-in dark theme classes apply built-in variables; auto follows the colour scheme', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
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
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
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
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
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
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
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
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await openComponentFixture(page)
  await page.locator('.vw-gantt-bar').first().click()
  const display = (selector: string) => page.evaluate(sel => [...document.querySelectorAll(sel)].map(el => getComputedStyle(el).display), selector)
  const zoomTools = await display('.vw-zoom-tools')
  expect(zoomTools.length).toBeGreaterThan(0)
  expect(zoomTools.every(value => value !== 'none')).toBe(true)
  await expect(page.locator('.vw-gantt-scroll')).toHaveCSS('overflow-y', 'auto')
  await page.emulateMedia({ media: 'print' })
  expect((await display('.vw-zoom-tools, .vw-minimap, .vw-bar-handle, .vw-gantt-toolbar')).every(value => value === 'none')).toBe(true)
  await expect(page.locator('.vw-gantt-scroll')).toHaveCSS('overflow-y', 'visible')
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

test('right-to-left gantt mirrors layout, pointer drag, resize, keyboard moves and scrollToTime', async ({ page }) => {
  const { errors, chart, status } = await openTimelineEditing(page)
  await page.getByRole('checkbox', { name: 'Right-to-left timeline', exact: true }).check()
  await expect(chart.locator('xpath=ancestor::div[contains(@class, "vw-gantt")][1]')).toHaveAttribute('dir', 'rtl')
  const api = chart.locator('.vw-gantt-bar[aria-label^="Billing API"]')
  const corner = chart.locator('.vw-gantt-corner')
  const box = async (locator: typeof api) => (await locator.boundingBox())!
  // The heading column is on the right and time runs from right to left: 08:00 touches the headings,
  // and Billing API (from 10:00) starts where Wireframes (until 10:00) ends.
  const heading = await box(corner)
  const wireframes = await box(chart.getByRole('button', { name: 'Wireframes 08:00–10:00', exact: true }))
  let bar = await box(api)
  expect(heading.x).toBeGreaterThan(bar.x)
  expect(Math.abs(wireframes.x + wireframes.width - heading.x)).toBeLessThanOrEqual(1)
  expect(Math.abs(bar.x + bar.width - wireframes.x)).toBeLessThanOrEqual(1)
  expect(await chart.evaluate(element => element.scrollLeft)).toBeLessThanOrEqual(0)

  // Dragging to the left proposes a later interval: 58 px at 115 px per hour snaps to 30 minutes.
  await page.mouse.move(bar.x + bar.width / 2, bar.y + bar.height / 2)
  await page.mouse.down()
  await page.mouse.move(bar.x + bar.width / 2 - 58, bar.y + bar.height / 2, { steps: 6 })
  await page.mouse.up()
  await expect(status('Billing API → 10:30–13:30.')).toBeVisible()
  await expect(api).toHaveAttribute('aria-label', 'Billing API 10:30–13:30')

  // The start handle sits on the right edge; dragging it 29 px to the left moves the start 15 minutes later.
  const startHandle = await box(api.locator('.vw-bar-handle.first'))
  bar = await box(api)
  expect(startHandle.x + startHandle.width).toBeGreaterThan(bar.x + bar.width - 2)
  await page.mouse.move(startHandle.x + startHandle.width / 2, startHandle.y + startHandle.height / 2)
  await page.mouse.down()
  await page.mouse.move(startHandle.x + startHandle.width / 2 - 29, startHandle.y + startHandle.height / 2, { steps: 5 })
  await page.mouse.up()
  await expect(status('Billing API → 10:45–13:30.')).toBeVisible()

  // Arrow keys follow the visual direction: Left is later, Right is earlier; Shift still resizes the end.
  await api.focus()
  await api.press('ArrowLeft')
  await expect(status('Billing API → 11:00–13:45.')).toBeVisible()
  await expect(api).toBeFocused()
  await api.press('ArrowRight')
  await expect(status('Billing API → 10:45–13:30.')).toBeVisible()
  await api.press('Shift+ArrowLeft')
  await expect(status('Billing API → 10:45–13:45.')).toBeVisible()

  // scrollToTime puts 12:00 at the inline-start (right) edge of the time area, using a negative scrollLeft.
  const zoomIn = page.getByRole('group', { name: 'Timeline zoom', exact: true }).getByRole('button', { name: 'Zoom in', exact: true })
  await zoomIn.click()
  await zoomIn.click()
  await expect(status('182% · hours')).toBeVisible()
  await page.getByRole('button', { name: 'Scroll to 12:00', exact: true }).click()
  await expect.poll(() => chart.evaluate(element => element.scrollLeft)).toBeLessThan(-800)
  const tests = chart.getByRole('button', { name: 'Acceptance tests 14:00–16:00', exact: true })
  const pixelsPerHour = 115 * 1.35 * 1.35
  await expect.poll(async () => {
    const [edge, target] = [await box(corner), await box(tests)]
    return Math.abs(target.x + target.width - (edge.x - 2 * pixelsPerHour))
  }).toBeLessThanOrEqual(1.5)

  // Back to left-to-right: the headings return to the left and 12:00 stays at the inline-start edge.
  await page.getByRole('checkbox', { name: 'Right-to-left timeline', exact: true }).uncheck()
  await expect.poll(async () => {
    const [edge, target] = [await box(corner), await box(tests)]
    return Math.abs(target.x - (edge.x + edge.width + 2 * pixelsPerHour))
  }).toBeLessThanOrEqual(1.5)
  expect(await chart.evaluate(element => element.scrollLeft)).toBeGreaterThan(800)
  expect(errors).toEqual([])
})

test('right-to-left network graph mirrors the chrome and label alignment but not the geometry', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const measure = async () => {
    const stage = (await page.getByLabel('Network graph', { exact: true }).boundingBox())!
    const minimap = (await page.getByRole('button', { name: 'Navigate graph overview', exact: true }).boundingBox())!
    const tools = (await page.getByRole('group', { name: 'Graph zoom', exact: true }).boundingBox())!
    const node = page.getByRole('button', { name: 'A', exact: true })
    const box = (await node.locator('rect').first().boundingBox())!
    const text = (await node.locator('text.vw-node-title').boundingBox())!
    return { stage, minimap, tools, box, text }
  }
  await openNetworkFixture(page, '?preset=groups&minimap=1')
  const ltr = await measure()
  await openNetworkFixture(page, '?preset=groups&minimap=1&dir=rtl')
  await expect(page.locator('.vw-network')).toHaveAttribute('dir', 'rtl')
  const rtl = await measure()
  // Geometry is unchanged; the minimap and zoom tools move to the left; labels align to the right.
  expect(rtl.box).toEqual(ltr.box)
  expect(ltr.minimap.x).toBeGreaterThan(ltr.stage.x + ltr.stage.width / 2)
  expect(rtl.minimap.x + rtl.minimap.width).toBeLessThan(rtl.stage.x + rtl.stage.width / 2)
  expect(rtl.tools.x + rtl.tools.width).toBeLessThan(rtl.stage.x + rtl.stage.width / 2)
  expect(ltr.text.x - ltr.box.x).toBeLessThan(ltr.box.x + ltr.box.width - (ltr.text.x + ltr.text.width))
  expect(rtl.box.x + rtl.box.width - (rtl.text.x + rtl.text.width)).toBeLessThan(rtl.text.x - rtl.box.x)
  await expect(page.getByRole('button', { name: 'Fit to view', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Fit to view', exact: true }).click()

  // dir="auto" follows an inherited right-to-left direction after mounting.
  // The attribute is set once parsing ends, before the deferred module script mounts the app.
  await page.addInitScript(() => document.addEventListener('readystatechange', () => {
    if (document.readyState === 'interactive') document.documentElement.setAttribute('dir', 'rtl')
  }))
  await openNetworkFixture(page, '?preset=groups&minimap=1&dir=auto')
  await expect(page.locator('.vw-network')).toHaveClass(/vw-rtl/)
  await expect(page.locator('.vw-network')).not.toHaveAttribute('dir', /./)
  expect(errors).toEqual([])
})

async function openGraphEditor(page: Page) {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await page.getByLabel('Edit graph').check()
  const button = (name: string) => page.getByRole('button', { name, exact: true })
  const status = (text: string) => page.getByRole('status').filter({ hasText: text })
  return { errors, button, status, edges: page.locator('.vw-network-edge'), nodes: page.locator('.vw-network-node') }
}

// Clicks the middle of an SVG path. A straight horizontal edge has an empty bounding box, so locator.click cannot target it.
async function clickPath(page: Page, path: ReturnType<Page['locator']>, modifiers: string[] = []) {
  const point = await path.evaluate(el => {
    const shape = el as SVGPathElement
    const middle = shape.getPointAtLength(shape.getTotalLength() / 2)
    const screen = new DOMPoint(middle.x, middle.y).matrixTransform(shape.getScreenCTM()!)
    return { x: screen.x, y: screen.y }
  })
  for (const key of modifiers) await page.keyboard.down(key)
  await page.mouse.click(point.x, point.y)
  for (const key of modifiers) await page.keyboard.up(key)
}

test('graph edges select by click and keyboard, toggle with modifiers and show reconnect handles', async ({ page }) => {
  const { errors, button } = await openGraphEditor(page)
  const rs = button('Select edge rs'), fp = button('Select edge fp'), s1 = button('Select edge 72')
  const lot = button('Lot A123-01 72 units')
  await lot.click()
  await expect(lot).toHaveAttribute('aria-pressed', 'true')
  // A plain edge click selects it, replaces the node selection and activates its reconnect handles.
  await clickPath(page, rs)
  await expect(rs).toHaveAttribute('aria-pressed', 'true')
  await expect(rs).toHaveClass(/selected/)
  await expect(lot).toHaveAttribute('aria-pressed', 'false')
  await expect(button('Reconnect target of rs')).toBeVisible()
  await clickPath(page, fp, ['Shift'])
  await expect(rs).toHaveAttribute('aria-pressed', 'true')
  await expect(fp).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.vw-edge-selected')).toHaveCount(2)
  // Ctrl+Enter toggles an edge out of the selection; a plain Enter replaces it.
  await fp.focus()
  await page.keyboard.press('Control+Enter')
  await expect(fp).toHaveAttribute('aria-pressed', 'false')
  await expect(rs).toHaveAttribute('aria-pressed', 'true')
  await s1.press('Enter')
  await expect(s1).toHaveAttribute('aria-pressed', 'true')
  await expect(rs).toHaveAttribute('aria-pressed', 'false')
  await expect(button('Reconnect source of 72')).toBeVisible()
  await expect(button('Reconnect target of rs')).toHaveCount(0)
  // A plain node click clears the edge selection and its handles.
  await lot.click()
  await expect(s1).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.vw-edge-selected')).toHaveCount(0)
  await expect(button('Reconnect source of 72')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('graph deletion by keyboard removes nodes, edges and incident edges, validates and undoes', async ({ page }) => {
  const { errors, button, status, edges, nodes } = await openGraphEditor(page)
  const stage = page.getByLabel('Network graph', { exact: true })
  await expect(edges).toHaveCount(6)
  const fp = button('Select edge fp')
  await fp.press('Enter')
  await fp.press('Delete')
  await expect(edges).toHaveCount(5)
  await expect(status('Deleted 1 edge.')).toBeVisible()
  await expect(stage).toBeFocused()
  await button('Undo').click()
  await expect(edges).toHaveCount(6)

  // A focused node outside the selection is deleted alone, with its incident edges; its group keeps the other lot.
  const lot1 = button('Lot A123-01 72 units'), lot2 = button('Lot A123-02 48 units')
  await lot1.focus()
  await page.keyboard.press('Backspace')
  await expect(lot1).toHaveCount(0)
  await expect(edges).toHaveCount(4)
  await expect(status('Deleted 1 node and 2 edges.')).toBeVisible()
  await expect(button('Move group Intermediate lots')).toBeVisible()
  await button('Undo').click()
  await expect(lot1).toBeVisible()
  await expect(edges).toHaveCount(6)

  // Nothing is proposed while a drag is in flight.
  const box = (await lot2.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 40, { steps: 5 })
  await page.keyboard.press('Delete')
  await page.mouse.up()
  await expect(status('Moved node lot2.')).toBeVisible()
  await expect(nodes).toHaveCount(6)

  // A focused node inside the selection deletes the whole selection as one proposal.
  const split = button('Split Operation 101'), finish = button('Finish Operation 102')
  await split.click()
  await finish.click({ modifiers: ['Shift'] })
  await finish.press('Delete')
  await expect(nodes).toHaveCount(4)
  await expect(edges).toHaveCount(0)
  await expect(status('Deleted 2 nodes and 6 edges.')).toBeVisible()
  await button('Undo').click()
  await expect(nodes).toHaveCount(6)
  await expect(edges).toHaveCount(6)

  // The demo rejects deleting every node; the graph reports the reason and keeps the data.
  await split.click()
  for (const name of ['Material A1 120 units', 'Lot A123-01 72 units', 'Lot A123-02 48 units', 'Finish Operation 102', 'Product B 120 units']) {
    await button(name).click({ modifiers: ['Shift'] })
  }
  await split.press('Delete')
  await expect(status('Keep at least one node in the graph.')).toBeVisible()
  await expect(page.locator('.vw-network .vw-sr-only[aria-live]')).toHaveText('Keep at least one node in the graph.')
  await expect(nodes).toHaveCount(6)
  expect(errors).toEqual([])
})

test('graph context menu opens by right-click and Shift+F10 and returns focus on Escape', async ({ page }) => {
  const { errors, button, status, edges } = await openGraphEditor(page)
  const finish = button('Finish Operation 102')
  await finish.click({ button: 'right' })
  const nodeMenu = page.getByRole('menu', { name: 'Actions for Finish', exact: true })
  await expect(nodeMenu).toBeVisible()
  await expect(nodeMenu.getByRole('menuitem', { name: 'Delete', exact: true })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(nodeMenu.getByRole('menuitem', { name: 'Focus node', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(nodeMenu).toHaveCount(0)
  await expect(finish).toBeFocused()

  // The keyboard opens the menu for the focused edge; Delete goes through the same proposal path.
  const fp = button('Select edge fp')
  await fp.focus()
  await page.keyboard.press('Shift+F10')
  const edgeMenu = page.getByRole('menu', { name: 'Actions for edge fp', exact: true })
  await expect(edgeMenu.getByRole('menuitem', { name: 'Delete', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(edgeMenu).toHaveCount(0)
  await expect(edges).toHaveCount(5)
  await expect(status('Deleted 1 edge.')).toBeVisible()
  await expect(page.getByLabel('Network graph', { exact: true })).toBeFocused()

  // The empty canvas and a group label have their own targets; a click outside closes the menu.
  await page.getByLabel('Network graph', { exact: true }).click({ button: 'right', position: { x: 12, y: 12 } })
  const canvasMenu = page.getByRole('menu', { name: 'Graph actions', exact: true })
  await expect(canvasMenu.getByRole('menuitem', { name: 'Fit selection', exact: true })).toBeVisible()
  await page.getByRole('heading', { name: 'Network', exact: true }).click()
  await expect(canvasMenu).toHaveCount(0)
  await button('Move group Intermediate lots').click({ button: 'right' })
  await page.getByRole('menu', { name: 'Actions for group Intermediate lots', exact: true }).getByRole('menuitem', { name: 'Select group' }).click()
  await expect(button('Lot A123-01 72 units')).toHaveAttribute('aria-pressed', 'true')
  await expect(button('Lot A123-02 48 units')).toHaveAttribute('aria-pressed', 'true')
  expect(errors).toEqual([])
})

test('graph tooltip shows on hover after a delay and on keyboard focus, stays hoverable and hides with Escape or a drag', async ({ page }) => {
  const { errors, button } = await openGraphEditor(page)
  const tooltip = page.getByRole('tooltip')
  const split = button('Split Operation 101')
  await expect(split).not.toHaveAttribute('aria-describedby', /./)
  await split.hover()
  await expect(tooltip).toContainText('Operation 101')
  const id = (await tooltip.getAttribute('id'))!
  expect(id).toBeTruthy()
  await expect(split).toHaveAttribute('aria-describedby', id)
  // The pointer can move onto the tooltip without hiding it.
  const tip = (await tooltip.boundingBox())!
  await page.mouse.move(tip.x + tip.width / 2, tip.y + tip.height / 2)
  await page.waitForTimeout(400)
  await expect(tooltip).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(tooltip).toHaveCount(0)
  await expect(split).not.toHaveAttribute('aria-describedby', /./)

  // Keyboard focus shows the tooltip of the focused node at once.
  await split.focus()
  await page.keyboard.press('Tab')
  const lot1 = button('Lot A123-01 72 units')
  await expect(lot1).toBeFocused()
  await expect(tooltip).toContainText('72 units')
  await expect(lot1).toHaveAttribute('aria-describedby', id)
  await page.keyboard.press('Escape')
  await expect(tooltip).toHaveCount(0)

  // Edges show a tooltip too, and a drag hides any tooltip.
  await button('Select edge fp').focus()
  await expect(tooltip).toContainText('Finish → Product B')
  const lot2 = button('Lot A123-02 48 units')
  await lot2.hover()
  await expect(tooltip).toContainText('48 units')
  const box = (await lot2.boundingBox())!
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 30, { steps: 5 })
  await expect(tooltip).toHaveCount(0)
  await page.mouse.up()
  expect(errors).toEqual([])
})

test('fit selection centres the selected nodes in the demo', async ({ page }) => {
  const { errors, button, status } = await openGraphEditor(page)
  const fit = button('Fit selection')
  await expect(fit).toBeDisabled()
  const lot1 = button('Lot A123-01 72 units'), lot2 = button('Lot A123-02 48 units')
  await lot1.click()
  await lot2.click({ modifiers: ['Shift'] })
  await fit.click()
  await expect(status('Fitted 2 nodes.')).toBeVisible()
  const stage = (await page.getByLabel('Network graph', { exact: true }).boundingBox())!
  const a = (await lot1.boundingBox())!, b = (await lot2.boundingBox())!
  const left = Math.min(a.x, b.x), right = Math.max(a.x + a.width, b.x + b.width)
  const top = Math.min(a.y, b.y), bottom = Math.max(a.y + a.height, b.y + b.height)
  expect(Math.abs((left + right) / 2 - (stage.x + stage.width / 2))).toBeLessThan(2)
  expect(Math.abs((top + bottom) / 2 - (stage.y + stage.height / 2))).toBeLessThan(2)
  expect(top).toBeGreaterThanOrEqual(stage.y + 23)
  expect(bottom).toBeLessThanOrEqual(stage.y + stage.height - 23)
  expect(errors).toEqual([])
})

test('fit with ids and padding fits the union under culling and validates its input', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await openNetworkFixture(page, '?nodes=600&cull=1')
  const events = page.getByRole('status', { name: 'Viewport events', exact: true })
  const before = Number(await events.textContent())
  await page.evaluate(() => (window as any).__vw.graph().fit({ ids: new Set(['N0450', 'N0452']), padding: 40 }))
  await expect(events).toHaveText(String(before + 1))
  const camera = await readCamera(page)
  expect(camera.scale).toBeCloseTo(1.15, 6)
  const stage = (await page.getByLabel('Network graph', { exact: true }).boundingBox())!
  const first = (await chainNode(page, 'N0450').boundingBox())!, last = (await chainNode(page, 'N0452').boundingBox())!
  expect(Math.abs((first.x + last.x + last.width) / 2 - (stage.x + stage.width / 2))).toBeLessThan(1)
  expect(first.x).toBeGreaterThanOrEqual(stage.x + 40)
  await expect(chainNode(page, 'N0000')).toHaveCount(0)
  // A tight padding on a wide union scales down; the scale never drops below the zoom minimum.
  await page.evaluate(() => (window as any).__vw.graph().fit({ ids: ['N0000', 'N0599'], padding: 10 }))
  expect((await readCamera(page)).scale).toBeLessThan(0.1)
  // An empty list changes nothing and emits nothing.
  const fitted = await readCamera(page)
  const count = await events.textContent()
  await page.evaluate(() => (window as any).__vw.graph().fit({ ids: [] }))
  expect(await readCamera(page)).toEqual(fitted)
  await expect(events).toHaveText(count!)
  const failure = (options: unknown) => page.evaluate(value => {
    try { (window as any).__vw.graph().fit(value) } catch (error) { return (error as Error).name + ': ' + (error as Error).message }
  }, options)
  expect(await failure({ ids: ['missing'] })).toBe('Error: Unknown node: missing')
  expect(await failure({ ids: ['N0001'], padding: -1 })).toMatch(/^RangeError: /)
  expect(await failure({ padding: Number.NaN })).toMatch(/^RangeError: /)
  expect(await readCamera(page)).toEqual(fitted)
  // fit() without options still shows the whole chain.
  await page.evaluate(() => (window as any).__vw.graph().fit())
  await expect(chainNode(page)).toHaveCount(600)
  expect(errors).toEqual([])
})

test('culling keeps selected edges rendered; Delete proposes the edge selection', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await openNetworkFixture(page, '?nodes=600&cull=1&edgeselect=1&delete=1')
  const e0 = page.getByRole('button', { name: 'Select edge e0', exact: true })
  await e0.press('Enter')
  await expect(e0).toHaveAttribute('aria-pressed', 'true')
  await page.getByLabel('Network graph', { exact: true }).focus()
  await page.evaluate(() => (window as any).__vw.graph().focusNode('N0450'))
  await expect(chainNode(page, 'N0000')).toHaveCount(0)
  await expect(e0).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Select edge e300', exact: true })).toHaveCount(0)
  // With focus on the canvas, Delete proposes the selection; the selected node joins with its incident edges.
  await page.getByLabel('Network graph', { exact: true }).press('Delete')
  await expect(page.getByRole('status', { name: 'Last deletion', exact: true })).toHaveText('{"nodeIds":[],"edgeIds":["e0"]}')
  await chainNode(page, 'N0450').click()
  await chainNode(page, 'N0450').press('Delete')
  await expect(page.getByRole('status', { name: 'Last deletion', exact: true })).toHaveText('{"nodeIds":["N0450"],"edgeIds":["e449","e450"]}')
  expect(errors).toEqual([])
})

test('context-menu events report the target, chart point and source and suppress the native menu', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await openNetworkFixture(page, '?nodes=5&menu=1')
  await page.evaluate(() => document.addEventListener('contextmenu', event => {
    (window as any).__menuPrevented = event.defaultPrevented
  }))
  const last = async () => JSON.parse((await page.getByRole('status', { name: 'Last menu', exact: true }).textContent())!)
  const events = page.getByRole('status', { name: 'Menu events', exact: true })
  const node = chainNode(page, 'N0001')
  const box = (await node.boundingBox())!
  await page.mouse.click(box.x + 20, box.y + 15, { button: 'right' })
  await expect(events).toHaveText('1')
  const pointer = await last()
  expect(pointer.target).toEqual({ kind: 'node', id: 'N0001' })
  expect(pointer.source).toBe('pointer')
  // Mouse event coordinates are whole pixels.
  expect(Math.abs(pointer.clientX - (box.x + 20))).toBeLessThanOrEqual(1)
  expect(Math.abs(pointer.clientY - (box.y + 15))).toBeLessThanOrEqual(1)
  expect(await page.evaluate(() => (window as any).__menuPrevented)).toBe(true)
  // The chart point inverts the camera: it maps back to the clicked screen point.
  const stage = (await page.getByLabel('Network graph', { exact: true }).boundingBox())!
  const camera = await readCamera(page)
  expect(stage.x + camera.x + pointer.point.x * camera.scale).toBeCloseTo(pointer.clientX, 3)
  expect(stage.y + camera.y + pointer.point.y * camera.scale).toBeCloseTo(pointer.clientY, 3)

  // Edges and the empty canvas are targets too.
  const edge = page.locator('.vw-network-edge').first()
  const path = await edge.evaluate(el => {
    const shape = el as SVGPathElement
    const middle = shape.getPointAtLength(shape.getTotalLength() / 2)
    const point = new DOMPoint(middle.x, middle.y).matrixTransform(shape.getScreenCTM()!)
    return { x: point.x, y: point.y }
  })
  // The drawn path is thin; without edgesSelectable there is no wider hit area.
  await page.mouse.click(path.x, path.y, { button: 'right' })
  await expect(events).toHaveText('2')
  expect((await last()).target).toEqual({ kind: 'edge', id: 'e0' })
  await page.mouse.click(stage.x + 6, stage.y + 6, { button: 'right' })
  await expect(events).toHaveText('3')
  expect((await last()).target).toEqual({ kind: 'canvas' })

  // The ContextMenu key reports the centre of the focused node once, even if the browser follows with its own event.
  await node.focus()
  await page.keyboard.press('ContextMenu')
  await expect(events).toHaveText('4')
  const keyboard = await last()
  expect(keyboard.source).toBe('keyboard')
  expect(keyboard.target).toEqual({ kind: 'node', id: 'N0001' })
  const rect = await node.evaluate(el => el.getBoundingClientRect().toJSON())
  expect(keyboard.clientX).toBeCloseTo(rect.x + rect.width / 2, 3)
  expect(keyboard.clientY).toBeCloseTo(rect.y + rect.height / 2, 3)
  // Shift+F10 on the focused stage reports the canvas at the stage centre.
  await page.getByLabel('Network graph', { exact: true }).focus()
  await page.keyboard.press('Shift+F10')
  await expect(events).toHaveText('5')
  const canvas = await last()
  expect(canvas).toMatchObject({ target: { kind: 'canvas' }, source: 'keyboard' })
  expect(canvas.clientX).toBeCloseTo(stage.x + stage.width / 2, 3)
  await page.waitForTimeout(300)
  await expect(events).toHaveText('5')
  // Without the prop nothing is reported and the browser keeps its own menu.
  await openNetworkFixture(page, '?nodes=5')
  await page.evaluate(() => document.addEventListener('contextmenu', event => {
    (window as any).__menuPrevented = event.defaultPrevented
    event.preventDefault()
  }))
  await chainNode(page, 'N0001').click({ button: 'right' })
  expect(await page.evaluate(() => (window as any).__menuPrevented)).toBe(false)
  await expect(page.getByRole('status', { name: 'Menu events', exact: true })).toHaveText('0')
  expect(errors).toEqual([])
})

test('the tooltip slot follows the camera and is placed before the node in right-to-left graphs', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await openNetworkFixture(page, '?nodes=3&tooltip=1&dir=rtl')
  const node = chainNode(page, 'N0001')
  const tooltip = page.getByRole('tooltip')
  await node.hover()
  await expect(tooltip).toHaveText('Tip N0001')
  const place = async () => {
    const [tip, box] = [(await tooltip.boundingBox())!, (await node.boundingBox())!]
    return { gap: box.x - (tip.x + tip.width), top: tip.y - box.y }
  }
  const before = await place()
  expect(Math.abs(before.gap - 8)).toBeLessThan(2)
  // Zooming moves the node; the tooltip stays attached to it.
  await page.evaluate(() => (window as any).__vw.graph().zoom(1.3))
  const after = await place()
  expect(Math.abs(after.gap - 8)).toBeLessThan(2)
  expect(Math.abs(after.top - before.top)).toBeLessThan(1)
  // Leaving the node and the tooltip hides it after the grace period.
  await page.mouse.move(2, 2)
  await expect(tooltip).toHaveCount(0)
  expect(errors).toEqual([])
})

type Point = { x: number; y: number }
// JSON turns -0 into 0, so the expectation adds 0 as well.
const snapped = (point: Point, grid: number) => ({ x: Math.round(point.x / grid) * grid + 0, y: Math.round(point.y / grid) * grid + 0 })
const fixtureStatus = (page: Page, name: string) => page.getByRole('status', { name, exact: true })
const readJson = async (page: Page, name: string) => JSON.parse(await fixtureStatus(page, name).textContent() || 'null')
async function dragBy(page: Page, target: ReturnType<Page['locator']>, dx: number, dy: number, hold?: () => Promise<void>) {
  const box = (await target.boundingBox())!
  const x = box.x + box.width / 2, y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + dx, y + dy, { steps: 6 })
  await hold?.()
  await page.mouse.up()
}

test('snap to grid lands pointer and keyboard moves on the grid and the background follows the camera', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await openNetworkFixture(page, '?nodes=4&draggable=1&snap=20&background=dots')
  const backdrop = page.locator('.vw-network-backdrop')
  await expect(backdrop).toHaveAttribute('aria-hidden', 'true')
  const pattern = backdrop.locator('pattern')
  await expect(pattern).toHaveAttribute('id', /-background$/)
  await expect(pattern).toHaveAttribute('width', '20')
  const fill = page.locator('.vw-network-background')
  await expect(fill).toHaveAttribute('fill', `url(#${await pattern.getAttribute('id')})`)
  await expect(page.locator('.vw-network')).toHaveClass(/vw-network-patterned/)

  // A drag of 37 x 23 screen pixels at scale 1.15 moves N0001 from (214, 20) by about (32, 20): it lands on (240, 40).
  expect((await readCamera(page)).scale).toBeCloseTo(1.15, 6)
  await dragBy(page, chainNode(page, 'N0001'), 37, 23)
  await expect(fixtureStatus(page, 'Move events')).toHaveText('1')
  expect(await readJson(page, 'Last after')).toEqual({ N0001: { x: 240, y: 40 } })
  await expect(chainNode(page, 'N0001')).toHaveAttribute('transform', 'translate(240 40)')

  // Arrow keys step to the next grid line, four lines with Shift; N0002 starts off the grid at x 408.
  const n2 = chainNode(page, 'N0002')
  await n2.press('ArrowRight')
  expect(await readJson(page, 'Last after')).toEqual({ N0002: { x: 420, y: 20 } })
  await n2.press('Shift+ArrowDown')
  expect(await readJson(page, 'Last after')).toEqual({ N0002: { x: 420, y: 100 } })
  await n2.press('ArrowLeft')
  expect(await readJson(page, 'Last after')).toEqual({ N0002: { x: 400, y: 100 } })
  // At the origin a move towards negative coordinates proposes nothing.
  await chainNode(page, 'N0000').press('ArrowUp')
  await chainNode(page, 'N0000').press('ArrowUp')
  await expect(fixtureStatus(page, 'Move events')).toHaveText('5')
  expect(await readJson(page, 'Last after')).toEqual({ N0000: { x: 20, y: 0 } })

  // The pattern is drawn in chart units: zooming out widens the cells so they stay at least 8 pixels apart.
  await page.evaluate(() => (window as any).__vw.graph().setViewport({ x: 13, y: 7, scale: 0.2 }))
  await expect(pattern).toHaveAttribute('width', '40')
  await expect(pattern.locator('circle')).toHaveAttribute('r', '5')
  await expect(fill).toHaveAttribute('x', '-105')
  expect(errors).toEqual([])
})

test('alignment guides snap a dragged node to its neighbours, win over the grid and show guide lines during the drag', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await openNetworkFixture(page, '?nodes=4&draggable=1&guides=1&snap=50')
  const guides = page.locator('.vw-guide')
  // Four pixels down is within the 6-pixel threshold of the row, so the top, middle and bottom guides appear.
  await dragBy(page, chainNode(page, 'N0001'), 30, 4, async () => {
    await expect(guides).toHaveCount(3)
    await expect(page.locator('.vw-guides')).toHaveAttribute('aria-hidden', 'true')
    await expect(guides.first()).toHaveAttribute('y1', '20')
    await expect(guides.first()).toHaveAttribute('y2', '20')
    await expect(guides.first()).toHaveAttribute('x1', '20')
    await expect(guides.first()).toHaveAttribute('x2', '746')
  })
  await expect(guides).toHaveCount(0)
  // The guide keeps y at 20 instead of the 50-unit grid line at 0; x, without a guide, snaps to the grid.
  expect(await readJson(page, 'Last after')).toEqual({ N0001: { x: 250, y: 20 } })
  // Forty pixels down is outside the threshold: no guides, and the grid decides.
  await dragBy(page, chainNode(page, 'N0001'), 0, 40, async () => {
    await expect(chainNode(page, 'N0001')).not.toHaveAttribute('transform', 'translate(250 20)')
    await expect(guides).toHaveCount(0)
  })
  expect(await readJson(page, 'Last after')).toEqual({ N0001: { x: 250, y: 50 } })
  expect(errors).toEqual([])
})

test('auto-pan moves the camera while a node drag is held near the edge and stops on release', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await openNetworkFixture(page, '?nodes=30&draggable=1&autopan=1')
  await page.evaluate(() => (window as any).__vw.graph().setViewport({ x: 0, y: 100, scale: 1 }))
  const stage = (await page.getByLabel('Network graph', { exact: true }).boundingBox())!
  const node = chainNode(page, 'N0002')
  const box = (await node.boundingBox())!
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const edgeX = stage.x + stage.width - 10
  const viewportEvents = Number(await fixtureStatus(page, 'Viewport events').textContent())
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(edgeX, start.y, { steps: 10 })
  // Holding still near the right edge keeps panning towards later ranks.
  await expect.poll(async () => (await readCamera(page)).x).toBeLessThan(-150)
  expect(Number(await fixtureStatus(page, 'Viewport events').textContent())).toBeGreaterThan(viewportEvents + 3)
  // The previewed node stays under the pointer while the chart moves.
  const held = (await node.boundingBox())!
  expect(Math.abs(held.x + held.width / 2 - edgeX)).toBeLessThan(25)
  await page.mouse.up()
  const released = await readCamera(page)
  await page.waitForTimeout(200)
  expect(await readCamera(page)).toEqual(released)
  await expect(fixtureStatus(page, 'Move events')).toHaveText('1')
  // The proposal includes the distance the camera travelled, not only the pointer movement.
  const moved = (await readJson(page, 'Last after')).N0002 as Point
  expect(moved.x).toBeGreaterThan(408 + (edgeX - start.x) + 150)
  expect(moved.x).toBeCloseTo(408 + edgeX - start.x - released.x, 0)
  expect(errors).toEqual([])
})

test('toGraphPoint, getViewportCenter and drop events report chart coordinates', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await openNetworkFixture(page, '?nodes=4&drop=1&snap=10')
  const stageLocator = page.getByLabel('Network graph', { exact: true })
  const stage = (await stageLocator.boundingBox())!
  const centre = await page.evaluate(({ x, y }) => {
    const graph = (window as any).__vw.graph()
    return { point: graph.toGraphPoint(x, y), centre: graph.getViewportCenter() }
  }, { x: stage.x + stage.width / 2, y: stage.y + stage.height / 2 })
  expect(centre.point.x).toBeCloseTo(centre.centre.x, 3)
  expect(centre.point.y).toBeCloseTo(centre.centre.y, 3)
  const camera = await readCamera(page)
  const at = { x: Math.round(stage.x + 123), y: Math.round(stage.y + 77) }
  const result = await stageLocator.evaluate((svg, at) => {
    const data = new DataTransfer()
    data.setData('text/plain', 'operation')
    const init = { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y, dataTransfer: data }
    const over = new DragEvent('dragover', init), drop = new DragEvent('drop', init)
    svg.dispatchEvent(over)
    svg.dispatchEvent(drop)
    return { over: over.defaultPrevented, drop: drop.defaultPrevented, point: (window as any).__vw.graph().toGraphPoint(at.x, at.y) }
  }, at)
  expect(result).toMatchObject({ over: true, drop: true })
  expect(result.point.x).toBeCloseTo((at.x - stage.x - camera.x) / camera.scale, 3)
  expect(await readJson(page, 'Last drop')).toEqual({
    point: snapped(result.point, 10), clientX: at.x, clientY: at.y, text: 'operation',
  })
  expect(await page.evaluate(() => {
    try { (window as any).__vw.graph().toGraphPoint(Number.NaN, 0) } catch (error) { return (error as Error).name }
  })).toBe('RangeError')

  // Without droppable the browser keeps its default handling and nothing is reported.
  await openNetworkFixture(page, '?nodes=4')
  expect(await stageLocator.evaluate(svg => {
    const over = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() })
    svg.dispatchEvent(over)
    svg.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }))
    return over.defaultPrevented
  })).toBe(false)
  await expect(fixtureStatus(page, 'Last drop')).toHaveText('')
  expect(errors).toEqual([])
})

test('clipboard shortcuts propose copy, paste and duplicate with the focused or selected elements', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await openNetworkFixture(page, '?nodes=4&clipboard=1&snap=10&edgeselect=1')
  await chainNode(page, 'N0001').click()
  await page.keyboard.press('Control+c')
  expect(await readJson(page, 'Last copy')).toEqual({ nodeIds: ['N0001'], edgeIds: [], positions: { N0001: { x: 214, y: 20 } } })
  // A focused node outside the selection stands alone.
  await chainNode(page, 'N0002').focus()
  await page.keyboard.press('Control+d')
  expect(await readJson(page, 'Last duplicate')).toEqual({ nodeIds: ['N0002'], edgeIds: [], positions: { N0002: { x: 408, y: 20 } } })
  // From a selected edge, the node and edge selections are copied together.
  await page.getByRole('button', { name: 'Select edge e0', exact: true }).press('Enter')
  await page.keyboard.press('Meta+c')
  expect(await readJson(page, 'Last copy')).toEqual({ nodeIds: ['N0001'], edgeIds: ['e0'], positions: { N0001: { x: 214, y: 20 } } })

  // Paste goes to the pointer while it is over the stage, otherwise to the centre of the viewport, on the grid.
  const stage = (await page.getByLabel('Network graph', { exact: true }).boundingBox())!
  const pointer = { x: Math.round(stage.x + 300), y: Math.round(stage.y + 200) }
  await page.mouse.move(pointer.x, pointer.y)
  await page.keyboard.press('Control+v')
  const atPointer = await page.evaluate(({ x, y }) => (window as any).__vw.graph().toGraphPoint(x, y), pointer)
  expect(await readJson(page, 'Last paste')).toEqual({ point: snapped(atPointer, 10) })
  await page.mouse.move(stage.x + 5, stage.y - 20)
  await page.keyboard.press('Control+v')
  const centre = await page.evaluate(() => (window as any).__vw.graph().getViewportCenter())
  expect(await readJson(page, 'Last paste')).toEqual({ point: snapped(centre, 10) })

  // Without the prop the keys keep their default meaning and nothing is proposed.
  await openNetworkFixture(page, '?nodes=4')
  await chainNode(page, 'N0001').focus()
  await page.keyboard.press('Control+c')
  await expect(fixtureStatus(page, 'Last copy')).toHaveText('')
  expect(errors).toEqual([])
})

test('native copy, paste and drop listeners on the component still reach its root element', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const dispatch = () => page.locator('.vw-network').evaluate(root => {
    const stage = root.querySelector('.vw-network-stage')!
    stage.dispatchEvent(new ClipboardEvent('copy', { bubbles: true }))
    stage.dispatchEvent(new ClipboardEvent('paste', { bubbles: true }))
    stage.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }))
  })
  // With the new props off, and with them on, the parent's native listeners receive the events.
  for (const search of ['?nodes=3&native=1', '?nodes=3&native=1&clipboard=1&drop=1']) {
    await openNetworkFixture(page, search)
    await dispatch()
    await expect(fixtureStatus(page, 'Native events')).toHaveText('copy paste drop')
  }
  // The component's own proposals use other names and still arrive.
  await expect(fixtureStatus(page, 'Last drop')).not.toHaveText('')
  expect(errors).toEqual([])
})

test('the demo palette adds nodes by drag and drop and by keyboard on the grid, and undo removes them', async ({ page }) => {
  const { errors, button, status, nodes } = await openGraphEditor(page)
  await page.getByLabel('Snap to grid').check()
  await expect(page.locator('.vw-network-background')).toHaveCount(1)
  const stage = page.getByLabel('Network graph', { exact: true })
  await button('Add operation').dragTo(stage, { targetPosition: { x: 400, y: 150 } })
  await expect(status('Added Operation 1.')).toBeVisible()
  const added = button('Operation 1 New operation')
  const [, x, y] = (await added.getAttribute('transform'))!.match(/^translate\((\S+) (\S+)\)$/)!
  expect(Number(x) % 20).toBe(0)
  expect(Number(y) % 20).toBe(0)
  // The dropped node is centred on the drop point, give or take half a grid cell.
  const box = (await added.boundingBox())!, area = (await stage.boundingBox())!
  expect(Math.abs(box.x + box.width / 2 - (area.x + 400))).toBeLessThan(15)
  expect(Math.abs(box.y + box.height / 2 - (area.y + 150))).toBeLessThan(15)
  await button('Add lot').press('Enter')
  await expect(button('Lot 1 New lot')).toBeVisible()
  await button('Add operation').focus()
  await page.keyboard.press('Space')
  await expect(button('Operation 2 New operation')).toBeVisible()
  await expect(nodes).toHaveCount(9)
  for (let i = 0; i < 3; i++) await button('Undo').click()
  await expect(nodes).toHaveCount(6)
  await expect(button('Operation 1 New operation')).toHaveCount(0)
  await button('Redo').click()
  await expect(button('Operation 1 New operation')).toBeVisible()
  expect(errors).toEqual([])
})

test('demo copy, paste and duplicate go through the edit history, and guides appear in an aligned drag', async ({ page }) => {
  const { errors, button, status, nodes, edges } = await openGraphEditor(page)
  const split = button('Split Operation 101'), lot = button('Lot A123-01 72 units')
  await split.click()
  await lot.click({ modifiers: ['Shift'] })
  await page.keyboard.press('Control+c')
  await expect(status('Copied 2 nodes.')).toBeVisible()
  const stage = (await page.getByLabel('Network graph', { exact: true }).boundingBox())!
  await page.mouse.move(stage.x + 20, stage.y + 20)
  await page.keyboard.press('Control+v')
  await expect(status('Pasted 2 nodes and 1 edge.')).toBeVisible()
  await expect(nodes).toHaveCount(8)
  await expect(edges).toHaveCount(7)
  await expect(button('Split (copy) Operation 101')).toHaveAttribute('aria-pressed', 'true')
  await button('Undo').click()
  await expect(nodes).toHaveCount(6)
  await expect(edges).toHaveCount(6)

  await button('Finish Operation 102').focus()
  await page.keyboard.press('Control+d')
  await expect(status('Duplicated 1 node.')).toBeVisible()
  await expect(button('Finish (copy) Operation 102')).toBeVisible()
  await expect(nodes).toHaveCount(7)
  await button('Undo').click()
  await expect(nodes).toHaveCount(6)
  await button('Redo').click()
  await expect(button('Finish (copy) Operation 102')).toBeVisible()

  // The two lots share a column, so a slightly sideways drag of one aligns with the other.
  await page.getByLabel('Alignment guides').check()
  await dragBy(page, lot, 3, 50, async () => {
    await expect(page.locator('.vw-guide').first()).toBeAttached()
  })
  await expect(status('Moved node lot1.')).toBeVisible()
  await expect(page.locator('.vw-guide')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('force graph layout renders selectable nodes without overlapping boxes', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  const nodes = page.locator('.vw-network-node')
  await expect(nodes.first()).toBeVisible()
  const count = await nodes.count()
  await page.getByLabel('Graph layout').selectOption('force')
  await page.getByLabel('Edit graph').check()
  await expect(nodes).toHaveCount(count)
  const split = page.getByRole('button', { name: 'Split Operation 101', exact: true })
  const finish = page.getByRole('button', { name: 'Finish Operation 102', exact: true })
  await expect(split).toBeVisible()
  await split.click()
  await finish.click({ modifiers: ['Shift'] })
  await expect(split).toHaveAttribute('aria-pressed', 'true')
  await expect(finish).toHaveAttribute('aria-pressed', 'true')
  const boxes = await nodes.evaluateAll(elements => elements.map(element => {
    const { x, y, width, height } = element.getBoundingClientRect()
    return { x, y, width, height }
  }))
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!, b = boxes[j]!
      expect(a.x + a.width <= b.x + 0.5 || b.x + b.width <= a.x + 0.5 || a.y + a.height <= b.y + 0.5 || b.y + b.height <= a.y + 0.5).toBe(true)
    }
  }
  expect(errors).toEqual([])
})

test('the demo offers the force layout up to 1,000 nodes and falls back to layered for the large graph', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  const layout = page.getByLabel('Graph layout')
  const force = layout.locator('option', { hasText: 'force' })
  await layout.selectOption('force')
  await expect(force).toBeEnabled()
  await page.getByRole('button', { name: 'Large graph', exact: true }).click()
  await expect(layout).toHaveValue('layered')
  await expect(force).toBeDisabled()
  await expect(page.getByRole('status').filter({ hasText: 'The force layout is offered for up to 1,000 nodes; switched to the layered layout.' })).toBeVisible()
  await expect(page.locator('.vw-network-node').first()).toBeVisible()
  await page.getByRole('button', { name: 'Manufacturing', exact: true }).click()
  await expect(force).toBeEnabled()
  expect(errors).toEqual([])
})

test('the graph Undo and Redo buttons are hidden in the scheduling and timeline editing demos', async ({ page }) => {
  await page.goto('/')
  const undo = page.getByRole('button', { name: 'Undo', exact: true }), redo = page.getByRole('button', { name: 'Redo', exact: true })
  await expect(undo).toBeVisible()
  for (const name of ['Scheduling', 'Timeline editing']) {
    await page.getByRole('button', { name, exact: true }).click()
    await expect(undo).toHaveCount(0)
    await expect(redo).toHaveCount(0)
  }
  await page.getByRole('button', { name: 'Manufacturing', exact: true }).click()
  await expect(undo).toBeVisible()
})

test('demo groups collapse and expand by click and keyboard, through the edit history', async ({ page }) => {
  const { errors, button, status, edges } = await openGraphEditor(page)
  await page.getByLabel('Collapsible groups').check()
  const collapse = button('Collapse group Intermediate lots'), expand = button('Expand group Intermediate lots')
  await expect(collapse).toHaveAttribute('aria-expanded', 'true')
  await collapse.click()
  await expect(status('Collapsed Intermediate lots.')).toBeVisible()
  await expect(expand).toHaveAttribute('aria-expanded', 'false')
  await expect(expand).toBeFocused()
  // One proxy replaces both lots; the parallel edges into and out of the group merge.
  const proxy = button('Intermediate lots 2 nodes')
  await expect(proxy).toBeVisible()
  await expect(button('Lot A123-01 72 units')).toHaveCount(0)
  await expect(button('Move group Intermediate lots')).toHaveCount(0)
  await expect(edges).toHaveCount(4)
  // Moving the proxy moves both members.
  await proxy.focus()
  await page.keyboard.press('ArrowDown')
  await expect(status('Moved 2 nodes.')).toBeVisible()
  await expect(proxy).toBeVisible()
  await expand.focus()
  await page.keyboard.press('Enter')
  await expect(status('Expanded Intermediate lots.')).toBeVisible()
  await expect(collapse).toBeFocused()
  await expect(button('Lot A123-01 72 units')).toBeVisible()
  await expect(edges).toHaveCount(6)
  await button('Undo').click()
  await expect(proxy).toBeVisible()
  await button('Undo').click()
  await button('Undo').click()
  await expect(button('Lot A123-02 48 units')).toBeVisible()
  await expect(collapse).toBeVisible()
  await button('Redo').click()
  await expect(proxy).toBeVisible()
  expect(errors).toEqual([])
})

test('a pointer click on a proxy expand toggle expands the group and does not start a connection', async ({ page }) => {
  const { errors, button, status } = await openGraphEditor(page)
  await page.getByLabel('Collapsible groups').check()
  for (const direction of ['LR', 'TB', 'RL', 'BT']) {
    await page.getByLabel('Direction').selectOption(direction)
    await button('Collapse group Intermediate lots').click()
    await expect(status('Collapsed Intermediate lots.')).toBeVisible()
    const expand = button('Expand group Intermediate lots')
    // The toggle and the proxy's connection handle do not overlap, so a real click reaches the toggle.
    const toggle = (await expand.boundingBox())!
    const handle = (await button('Start connection from Intermediate lots').boundingBox())!
    expect(toggle.x + toggle.width <= handle.x || handle.x + handle.width <= toggle.x
      || toggle.y + toggle.height <= handle.y || handle.y + handle.height <= toggle.y).toBe(true)
    await page.mouse.click(toggle.x + toggle.width / 2, toggle.y + toggle.height / 2)
    await expect(status('Expanded Intermediate lots.')).toBeVisible()
    await expect(expand).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Connect to / })).toHaveCount(0)
  }
  expect(errors).toEqual([])
})

test('demo edge style switches between curves, orthogonal routes and straight lines', async ({ page }) => {
  const { errors } = await openGraphEditor(page)
  const fp = page.locator('.vw-network-edge').last()
  await expect(fp).toHaveAttribute('d', / C /)
  const style = page.getByLabel('Edge style')
  await style.selectOption('orthogonal')
  await expect(fp).toHaveAttribute('d', /^M [\d. ]+(?: [LQ] [\d. ]+)+$/)
  // The split to lot edge turns at right angles: every segment is horizontal or vertical.
  const d = (await page.locator('.vw-network-edge').nth(1).getAttribute('d'))!
  let previous: number[] = []
  for (const [, command, values] of d.matchAll(/([MLQ]) ([^MLQ]+)/g)) {
    const numbers = values!.trim().split(' ').map(Number)
    // Line segments are axis-aligned; a Q command only rounds a corner.
    if (command === 'L') expect(numbers[0] === previous[0] || numbers[1] === previous[1]).toBe(true)
    previous = numbers.slice(-2)
  }
  await style.selectOption('straight')
  await expect(fp).toHaveAttribute('d', /^M [\d.]+ [\d.]+ L [\d.]+ [\d.]+$/)
  await style.selectOption('curve')
  await expect(fp).toHaveAttribute('d', / C /)
  expect(errors).toEqual([])
})

test('demo waypoints are added, moved and removed by keyboard and pointer with undo', async ({ page }) => {
  const { errors, button, status } = await openGraphEditor(page)
  await page.getByLabel('Editable edges').check()
  const fp = button('Select edge fp')
  await fp.press('Enter')
  await button('Add waypoint 1 · fp').press('Enter')
  await expect(status('Edge fp has 1 waypoint.')).toBeVisible()
  const waypoint = button('Move waypoint 1 · fp')
  await expect(waypoint).toBeVisible()
  const y = Number(await waypoint.getAttribute('cy'))
  await waypoint.press('ArrowDown')
  await expect(waypoint).toHaveAttribute('cy', String(y + 10))
  await waypoint.press('Shift+ArrowDown')
  await expect(waypoint).toHaveAttribute('cy', String(y + 50))
  // A pointer drag moves it; the preview follows the pointer.
  const before = y + 50
  await dragBy(page, waypoint, 0, 30, async () => {
    await expect.poll(async () => Number(await waypoint.getAttribute('cy'))).toBeGreaterThan(before)
  })
  await expect(status('Edge fp has 1 waypoint.')).toBeVisible()
  await expect.poll(async () => Number(await waypoint.getAttribute('cy'))).toBeGreaterThan(before + 10)
  // Dragging the second insert handle adds a waypoint after the first.
  await dragBy(page, button('Add waypoint 2 · fp'), 0, -30)
  await expect(status('Edge fp has 2 waypoints.')).toBeVisible()
  await button('Move waypoint 2 · fp').press('Delete')
  await expect(status('Edge fp has 1 waypoint.')).toBeVisible()
  await waypoint.press('Delete')
  await expect(status('Edge fp has 0 waypoints.')).toBeVisible()
  await expect(button('Move waypoint 1 · fp')).toHaveCount(0)
  await expect(fp).toBeFocused()
  await button('Undo').click()
  await expect(button('Move waypoint 1 · fp')).toBeVisible()
  // Escape cancels a drag in flight without a proposal.
  const cy = await waypoint.getAttribute('cy')
  const box = (await waypoint.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + 60, { steps: 4 })
  await expect(waypoint).not.toHaveAttribute('cy', cy!)
  await page.keyboard.press('Escape')
  await expect(waypoint).toHaveAttribute('cy', cy!)
  await page.mouse.up()
  await expect(status('Undid the last edit.')).toBeVisible()
  // validateEdgeReshape rejects a fifth waypoint with its reason.
  for (let i = 0; i < 3; i++) await button('Add waypoint 1 · fp').press('Enter')
  await expect(status('Edge fp has 4 waypoints.')).toBeVisible()
  await button('Add waypoint 1 · fp').press('Enter')
  await expect(status('Use at most 4 waypoints per edge.')).toBeVisible()
  await expect(button('Move waypoint 5 · fp')).toHaveCount(0)
  for (let i = 0; i < 3; i++) await button('Undo').click()
  // Waypoints are kept in the other edge styles.
  await page.getByLabel('Edge style').selectOption('orthogonal')
  await expect(button('Move waypoint 1 · fp')).toBeVisible()
  expect(errors).toEqual([])
})

test('demo nodes resize by pointer and keyboard with undo', async ({ page }) => {
  const { errors, button, status } = await openGraphEditor(page)
  await page.getByLabel('Resizable nodes').check()
  const finish = button('Finish Operation 102')
  await finish.click()
  const corner = button('Resize Finish · bottom right')
  await expect(corner).toBeVisible()
  const frame = finish.locator('svg')
  await expect(frame).toHaveAttribute('width', '144')
  await corner.press('ArrowRight')
  await expect(status('Resized Finish to 154 × 58.')).toBeVisible()
  await expect(frame).toHaveAttribute('width', '154')
  await corner.press('Shift+ArrowDown')
  await expect(status('Resized Finish to 154 × 98.')).toBeVisible()
  // Resizing from the top-left corner moves the origin and keeps the opposite corner.
  const x = (await finish.boundingBox())!.x
  await button('Resize Finish · top left').press('ArrowLeft')
  await expect(status('Resized Finish to 164 × 98.')).toBeVisible()
  await expect.poll(async () => (await finish.boundingBox())!.x).toBeLessThan(x)
  // A pointer drag of a corner proposes the dragged size, never below the minimum.
  await dragBy(page, corner, -400, -400)
  await expect(status('Resized Finish to 40 × 24.')).toBeVisible()
  await expect(frame).toHaveAttribute('height', '24')
  await dragBy(page, corner, 60, 30)
  await expect.poll(async () => Number(await frame.getAttribute('width'))).toBeGreaterThan(60)
  // validateNodeResize rejects an oversized node; Escape cancels a drag without a proposal.
  const width = await frame.getAttribute('width')
  await dragBy(page, corner, 600, 0)
  await expect(status('Keep nodes within 360 × 200.')).toBeVisible()
  await expect(frame).toHaveAttribute('width', width!)
  const handle = (await corner.boundingBox())!
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(handle.x + 80, handle.y + 40, { steps: 4 })
  await expect(frame).not.toHaveAttribute('width', width!)
  await page.keyboard.press('Escape')
  await expect(frame).toHaveAttribute('width', width!)
  await page.mouse.up()
  await expect(frame).toHaveAttribute('width', width!)
  await button('Undo').click()
  await expect(frame).toHaveAttribute('width', '40')
  for (let i = 0; i < 4; i++) await button('Undo').click()
  await expect(frame).toHaveAttribute('width', '144')
  expect(errors).toEqual([])
})

test('demo level of detail hides node details and edge labels when zoomed out', async ({ page }) => {
  const { errors, button } = await openGraphEditor(page)
  const root = page.locator('.vw-network')
  const detail = page.locator('.vw-node-detail').first()
  await expect(detail).toBeVisible()
  await expect(root).not.toHaveClass(/vw-lod-low/)
  const zoom = page.getByRole('group', { name: 'Graph zoom', exact: true })
  for (let i = 0; i < 6; i++) await zoom.getByRole('button', { name: 'Zoom out', exact: true }).click()
  await expect(root).toHaveClass(/vw-lod-low/)
  await expect(detail).toBeHidden()
  await expect(page.locator('.vw-edge-label').first()).toBeHidden()
  // Accessible names keep the detail.
  await expect(button('Split Operation 101')).toBeAttached()
  await zoom.getByRole('button', { name: 'Fit to view', exact: true }).click()
  await expect(root).not.toHaveClass(/vw-lod-low/)
  await expect(detail).toBeVisible()
  expect(errors).toEqual([])
})

test('gantt rows indent, outdent and move by keyboard with validation, focus return and undo', async ({ page }) => {
  const { errors, chart, status } = await openTimelineEditing(page)
  await expect(chart.getByRole('button', { name: /^Move row / })).toHaveCount(0)
  await expect(chart.locator('.vw-extra-column')).toHaveCount(0)
  await page.getByRole('checkbox', { name: 'Reorder rows', exact: true }).check()
  const handle = (label: string) => chart.getByRole('button', { name: 'Move row ' + label, exact: true })
  const wbs = (label: string) => chart.locator('.vw-gantt-row').filter({ has: page.getByRole('button', { name: 'Move row ' + label, exact: true }) }).locator('.vw-extra-column')
  const quality = handle('Quality')
  await expect(quality).toHaveAccessibleDescription(/^Alt\+Up and Alt\+Down move the row among its siblings\. Alt\+Shift\+Right indents/)
  await expect(wbs('Web team')).toHaveText('2.1')
  await expect(wbs('Quality')).toHaveText('3')

  // Indent makes Quality the last child of the platform team; focus returns to its handle.
  await quality.press('Alt+Shift+ArrowRight')
  await expect(status('Moved Quality to Platform team as WBS 2.2.')).toBeVisible()
  await expect(wbs('Quality')).toHaveText('2.2')
  await expect(handle('Quality')).toBeFocused()
  await page.keyboard.press('Alt+Shift+ArrowLeft')
  await expect(status('Moved Quality to the top level as WBS 3.')).toBeVisible()
  await expect(handle('Quality')).toBeFocused()
  await page.keyboard.press('Alt+ArrowUp')
  await expect(status('Moved Quality to the top level as WBS 2.')).toBeVisible()
  await expect(wbs('Platform team')).toHaveText('3')
  await expect(wbs('Web team')).toHaveText('3.1')
  await expect(handle('Quality')).toBeFocused()
  // The first sibling cannot move up or be indented; nothing is proposed.
  await handle('Product team').press('Alt+ArrowUp')
  await handle('Product team').press('Alt+Shift+ArrowRight')
  await expect(status('Moved Quality to the top level as WBS 2.')).toBeVisible()

  // The application rejects rows under Quality; the reason is announced.
  await handle('Platform team').press('Alt+Shift+ArrowRight')
  await expect(status('Quality cannot contain other teams.')).toBeVisible()
  await expect(chart.locator('xpath=..').locator('[aria-live="polite"]')).toHaveText('Quality cannot contain other teams.')
  await expect(wbs('Platform team')).toHaveText('3')

  // Undo and Redo restore the hierarchy with the rest of the timeline history.
  const undo = page.getByRole('button', { name: 'Undo timeline change', exact: true })
  await undo.click()
  await expect(wbs('Quality')).toHaveText('3')
  await undo.click()
  await expect(wbs('Quality')).toHaveText('2.2')
  await page.getByRole('button', { name: 'Redo timeline change', exact: true }).click()
  await expect(wbs('Quality')).toHaveText('3')

  // Bars keep following their rows.
  await expect(chart.locator('.vw-gantt-row').filter({ has: page.getByRole('button', { name: 'Move row Quality', exact: true }) }).getByRole('button', { name: 'Acceptance tests 14:00–16:00', exact: true })).toBeVisible()

  // In a right-to-left chart, Alt+Shift+Left indents towards the row text.
  await page.getByRole('checkbox', { name: 'Right-to-left timeline', exact: true }).check()
  await expect(handle('Quality')).toHaveAccessibleDescription(/Alt\+Shift\+Left indents it/)
  await handle('Quality').press('Alt+Shift+ArrowLeft')
  await expect(status('Moved Quality to Platform team as WBS 2.2.')).toBeVisible()
  await page.keyboard.press('Alt+Shift+ArrowRight')
  await expect(status('Moved Quality to the top level as WBS 3.')).toBeVisible()
  expect(errors).toEqual([])
})

test('gantt row handles drag rows between rows with a drop indicator and cancel with Escape', async ({ page }) => {
  const { errors, chart, status } = await openTimelineEditing(page)
  await page.getByRole('checkbox', { name: 'Reorder rows', exact: true }).check()
  const handle = (label: string) => chart.getByRole('button', { name: 'Move row ' + label, exact: true })
  const wbs = (label: string) => chart.locator('.vw-gantt-row').filter({ has: page.getByRole('button', { name: 'Move row ' + label, exact: true }) }).locator('.vw-extra-column')
  const indicator = chart.locator('.vw-gantt-row-drop')
  const product = (await handle('Product team').boundingBox())!
  const web = (await chart.locator('.vw-gantt-row').filter({ has: page.getByRole('button', { name: 'Move row Web team', exact: true }) }).boundingBox())!
  const x = product.x + product.width / 2

  // Escape cancels a drag: the indicator disappears and releasing proposes nothing.
  await page.mouse.move(x, product.y + product.height / 2)
  await page.mouse.down()
  await page.mouse.move(x, web.y + web.height * 0.75, { steps: 8 })
  await expect(indicator).toBeVisible()
  const line = (await indicator.boundingBox())!
  expect(Math.abs(line.y - (web.y + web.height - 1))).toBeLessThan(3)
  await page.keyboard.press('Escape')
  await expect(indicator).toHaveCount(0)
  await page.mouse.up()
  await expect(wbs('Product team')).toHaveText('1')

  // The lower half of the web team's row drops the product team after it, inside the platform team.
  await page.mouse.move(x, product.y + product.height / 2)
  await page.mouse.down()
  await page.mouse.move(x, web.y + web.height * 0.75, { steps: 8 })
  await page.mouse.up()
  await expect(status('Moved Product team to Platform team as WBS 1.2.')).toBeVisible()
  await expect(wbs('Product team')).toHaveText('1.2')
  await expect(wbs('Platform team')).toHaveText('1')
  await expect(indicator).toHaveCount(0)
  await expect(handle('Product team')).toBeFocused()

  // A row cannot be dropped inside its own subtree.
  const platform = (await handle('Platform team').boundingBox())!
  const child = (await chart.locator('.vw-gantt-row').filter({ has: page.getByRole('button', { name: 'Move row Web team', exact: true }) }).boundingBox())!
  await page.mouse.move(platform.x + platform.width / 2, platform.y + platform.height / 2)
  await page.mouse.down()
  await page.mouse.move(platform.x + platform.width / 2, child.y + child.height * 0.3, { steps: 8 })
  await expect(indicator).toHaveCount(0)
  await page.mouse.up()
  await expect(wbs('Platform team')).toHaveText('1')
  await page.getByRole('button', { name: 'Undo timeline change', exact: true }).click()
  await expect(wbs('Product team')).toHaveText('1')
  expect(errors).toEqual([])
})

test('the scheduling demo draws the status date and progress line and reschedules from the status date', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'Scheduling', exact: true }).click()
  const plan = page.getByRole('region', { name: 'Gantt chart', exact: true }).first()
  const line = plan.getByRole('img', { name: 'Status date 09 Nov 12:00', exact: true })
  await expect(line).toBeVisible()
  await expect(line).toHaveClass(/vw-gantt-status-date/)
  const progress = plan.locator('.vw-gantt-progress-line')
  await expect(progress).toHaveCount(4)
  await expect(progress.first()).toHaveAttribute('aria-hidden', 'true')
  // Cutting order B (half done) and inspection (a quarter done) are behind the status date and kink the line.
  for (const [index, points] of [[0, 2], [1, 5], [2, 5], [3, 2]] as const) {
    expect((await progress.nth(index).locator('polyline').getAttribute('points'))!.split(' ').length).toBe(points)
  }
  const toggle = page.getByRole('checkbox', { name: 'Show progress line', exact: true })
  await toggle.uncheck()
  await expect(progress).toHaveCount(0)
  await toggle.check()
  await expect(progress.first()).toBeVisible()

  const slider = page.getByRole('slider', { name: 'Status date', exact: true })
  await slider.fill(String(Date.parse('2026-11-09T13:00:00+09:00')))
  await expect(plan.getByRole('img', { name: 'Status date 09 Nov 13:00', exact: true })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Status date and exports' }).locator('output')).toHaveText('09 Nov 13:00')
  await slider.fill(String(Date.parse('2026-11-09T12:00:00+09:00')))

  // Done work stays, partly done work is split at the status date and the rest moves after it.
  await page.getByRole('button', { name: 'Reschedule from status date', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Rescheduled from status date 09 Nov 12:00. 3 operations moved.' })).toBeVisible()
  await expect(plan.getByRole('button', { name: 'Cut order A 09 Nov 08:00–09 Nov 11:00', exact: true })).toBeVisible()
  await expect(plan.getByRole('button', { name: 'Cut order B 09 Nov 10:00–09 Nov 14:00', exact: true }).locator('.vw-gantt-segment')).toHaveCount(2)
  const inspection = plan.getByRole('button', { name: 'Inspect order A 09 Nov 11:00–09 Nov 14:30', exact: true })
  await expect(inspection.locator('.vw-gantt-segment')).toHaveCount(2)
  await expect(plan.getByRole('button', { name: 'Pack order A 09 Nov 14:30–09 Nov 16:30', exact: true })).toBeVisible()
  await expect(page.getByTestId('schedule-finish')).toHaveText('09 Nov 16:30')

  // The SVG export includes the status date and the progress line.
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export schedule SVG', exact: true }).click()
  const { readFile } = await import('node:fs/promises')
  const svg = (await readFile((await (await pending).path())!)).toString('utf8')
  expect(svg).toContain('<g class="vw-gantt-status-date"><title>Status date 09 Nov 12:00</title>')
  expect(svg).toContain('class="vw-gantt-progress-line"')
  await page.getByRole('button', { name: 'Reset schedule' }).click()
  await expect(page.getByTestId('schedule-finish')).toHaveText('09 Nov 16:00')
  expect(errors).toEqual([])
})

test('the scheduling demo reports a status date that leaves no room for the done work', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'Scheduling', exact: true }).click()
  // At the start of the range the done hour of cutting order B cannot lie before the status date.
  await page.getByRole('slider', { name: 'Status date', exact: true }).fill(String(Date.parse('2026-11-09T08:00:00+09:00')))
  await page.getByRole('button', { name: 'Reschedule from status date', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'The reported progress does not fit before status date 09 Nov 08:00. Choose a later status date.' })).toBeVisible()
  await expect(page.getByTestId('schedule-finish')).toHaveText('09 Nov 16:00')
  expect(errors).toEqual([])
})

test('the scheduling demo exports Microsoft Project XML, iCalendar and CSV files', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  // Record the media type of every blob that is turned into a download URL.
  await page.addInitScript(() => {
    const create = URL.createObjectURL.bind(URL)
    const types: string[] = []
    Object.assign(window, { blobTypes: types })
    URL.createObjectURL = (object: Blob | MediaSource) => {
      if (object instanceof Blob) types.push(object.type)
      return create(object)
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Scheduling', exact: true }).click()
  const { readFile } = await import('node:fs/promises')
  async function save(name: string) {
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name, exact: true }).click()
    const file = await pending
    return { filename: file.suggestedFilename(), text: (await readFile((await file.path())!)).toString('utf8') }
  }
  const xml = await save('Export MS Project XML')
  expect(xml.filename).toBe('schedule.xml')
  expect(xml.text).toMatch(/^<\?xml version="1.0" encoding="UTF-8" standalone="yes"\?>\n<Project xmlns="http:\/\/schemas.microsoft.com\/project">/)
  expect(xml.text).toContain('<Name>Cut order A</Name>')
  expect(xml.text).toContain('<Start>2026-11-09T08:00:00</Start><Finish>2026-11-09T11:00:00</Finish>')
  expect(xml.text).toContain('<PercentComplete>100</PercentComplete>')
  expect(xml.text.match(/<PredecessorLink>/g)).toHaveLength(2)

  const ics = await save('Export iCalendar')
  expect(ics.filename).toBe('schedule.ics')
  expect(ics.text.startsWith('BEGIN:VCALENDAR\r\nVERSION:2.0\r\n')).toBe(true)
  expect(ics.text).toContain('SUMMARY:Cut order A\r\n')
  expect(ics.text).toContain('DTSTART:20261108T230000Z\r\nDTEND:20261109T020000Z\r\n')
  expect(ics.text.endsWith('END:VCALENDAR\r\n')).toBe(true)

  const csv = await save('Export CSV')
  expect(csv.filename).toBe('schedule.csv')
  expect(csv.text.split('\r\n').slice(0, 2)).toEqual(['Operation,WBS,Task,Start,End,Progress', 'Cut order A,1,Cut order A,09 Nov 08:00,09 Nov 11:00,1'])
  expect(await page.evaluate(() => (window as unknown as { blobTypes: string[] }).blobTypes)).toEqual(['application/xml', 'text/calendar', 'text/csv'])
  expect(errors).toEqual([])
})

test('the scheduling demo shows the plan as a network diagram with critical tasks and links highlighted', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto('/')
  await page.getByRole('button', { name: 'Scheduling', exact: true }).click()
  const toggle = page.getByRole('checkbox', { name: 'Network diagram', exact: true })
  await expect(page.getByLabel('Schedule network diagram', { exact: true })).toHaveCount(0)
  await toggle.check()
  const diagram = page.getByLabel('Schedule network diagram', { exact: true })
  await expect(diagram).toBeVisible()
  const nodes = diagram.locator('.vw-network-node')
  await expect(nodes).toHaveCount(4)
  const cutting = diagram.getByRole('button', { name: 'Cut order A ES 09 Nov 08:00 · EF 09 Nov 11:00 · Float 0 h', exact: true })
  await expect(cutting).toHaveClass(/vw-tone-amber/)
  await expect(cutting).toHaveClass(/related/)
  await expect(diagram.getByRole('button', { name: /^Cut order B ES 09 Nov 10:00 · EF 09 Nov 12:00 · Float [1-9]\d* h$/ })).not.toHaveClass(/related/)
  await expect(diagram.locator('.vw-network-edge.related')).toHaveCount(2)
  // The diagram follows plan changes.
  await page.getByRole('region', { name: 'Gantt chart', exact: true }).first().getByRole('button', { name: /^Cut order A \d\d Nov.*–/ }).press('ArrowRight')
  await expect(diagram.getByRole('button', { name: /^Cut order A ES 09 Nov 09:00 · EF 09 Nov 12:00/ })).toBeVisible()
  await toggle.uncheck()
  await expect(diagram).toHaveCount(0)
  expect(errors).toEqual([])
})

test('gantt columns resize by pointer and keyboard with validation, Escape, undo and right-to-left keys', async ({ page }) => {
  const { errors, chart, status } = await openTimelineEditing(page)
  await expect(chart.getByRole('separator')).toHaveCount(0)
  await page.getByRole('checkbox', { name: 'Resize columns', exact: true }).check()
  const team = chart.getByRole('separator', { name: 'Resize column Team', exact: true })
  const wbs = chart.getByRole('separator', { name: 'Resize column WBS', exact: true })
  const cell = chart.locator('.vw-gantt-row .vw-extra-column').first()
  const bar = chart.getByRole('button', { name: 'Wireframes 08:00–10:00', exact: true })
  // The demo theme sets --vw-row-label-width to 138px; the separator reports the rendered width.
  await expect(team).toHaveAttribute('aria-valuenow', '138')
  await expect(team).toHaveAttribute('aria-valuemin', '48')
  await expect(wbs).toHaveAttribute('aria-valuenow', '52')
  await expect(wbs).toHaveAttribute('aria-orientation', 'vertical')

  // Arrow keys propose 10 px steps and Shift 40 px; widths never go below the minimum.
  await wbs.press('ArrowRight')
  await expect(status('Resized the WBS column to 62 px.')).toBeVisible()
  await expect(wbs).toHaveAttribute('aria-valuenow', '62')
  expect(Math.round((await cell.boundingBox())!.width)).toBe(62)
  await wbs.press('Shift+ArrowLeft')
  await expect(status('Resized the WBS column to 48 px.')).toBeVisible()

  // A pointer drag previews the width and proposes it on release; the timeline moves with the label area.
  const barStart = (await bar.boundingBox())!.x
  const box = (await team.boundingBox())!
  const x = box.x + box.width / 2, y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 60, y, { steps: 6 })
  await expect(team).toHaveAttribute('aria-valuenow', '198')
  await expect(team).toHaveClass(/active/)
  expect(Math.round((await bar.boundingBox())!.x - barStart)).toBe(60)
  await page.mouse.up()
  await expect(status('Resized the Team column to 198 px.')).toBeVisible()
  await expect(team).toBeFocused()

  // Escape cancels a drag: the preview is dropped and releasing proposes nothing.
  await page.mouse.move(x + 60, y)
  await page.mouse.down()
  await page.mouse.move(x + 100, y, { steps: 4 })
  await expect(team).toHaveAttribute('aria-valuenow', '238')
  await page.keyboard.press('Escape')
  await expect(team).toHaveAttribute('aria-valuenow', '198')
  await page.mouse.up()
  await expect(status('Resized the Team column to 198 px.')).toBeVisible()

  // The application rejects a narrow team column; the reason is announced.
  await team.press('Home')
  await expect(status('The team column needs at least 110 px.')).toBeVisible()
  await expect(chart.locator('xpath=..').locator('[aria-live="polite"]')).toHaveText('The team column needs at least 110 px.')
  await expect(team).toHaveAttribute('aria-valuenow', '198')

  // Undo and Redo restore widths with the rest of the timeline history.
  const undo = page.getByRole('button', { name: 'Undo timeline change', exact: true })
  await undo.click()
  await expect(team).toHaveAttribute('aria-valuenow', '138')
  await undo.click()
  await expect(wbs).toHaveAttribute('aria-valuenow', '62')
  await page.getByRole('button', { name: 'Redo timeline change', exact: true }).click()
  await expect(wbs).toHaveAttribute('aria-valuenow', '48')

  // Right to left: the column edge is on the left, so ArrowLeft and dragging left widen the column.
  await page.getByRole('checkbox', { name: 'Right-to-left timeline', exact: true }).check()
  await wbs.press('ArrowLeft')
  await expect(status('Resized the WBS column to 58 px.')).toBeVisible()
  await wbs.press('ArrowRight')
  await expect(status('Resized the WBS column to 48 px.')).toBeVisible()
  const rtlBox = (await team.boundingBox())!
  await page.mouse.move(rtlBox.x + rtlBox.width / 2, rtlBox.y + rtlBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(rtlBox.x + rtlBox.width / 2 - 30, rtlBox.y + rtlBox.height / 2, { steps: 5 })
  await page.mouse.up()
  await expect(status('Resized the Team column to 168 px.')).toBeVisible()
  expect(errors).toEqual([])
})

test('the timeline editing demo imports a CSV file as one undoable step and reports invalid files', async ({ page }) => {
  const { errors, chart, status } = await openTimelineEditing(page)
  const input = page.getByLabel('Import CSV', { exact: true })
  await input.focus()
  await expect(input).toBeFocused()
  const csv = '﻿Row,WBS,Bar,Start,End,Progress\r\nAssembly,1,"Frame, welded",09:00,11:00,0.5\r\nPaint,1.1,Primer,11:00,12:30,\r\n'
  await input.setInputFiles({ name: 'plan.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await expect(status('Imported 2 bars in 2 rows from plan.csv.')).toBeVisible()
  await expect(chart.getByRole('button', { name: 'Frame, welded 09:00–11:00', exact: true })).toBeVisible()
  const primer = chart.getByRole('button', { name: 'Primer 11:00–12:30', exact: true })
  await expect(primer).toBeVisible()
  await expect(chart.getByRole('button', { name: /^Wireframes / })).toHaveCount(0)
  await expect(chart.getByRole('button', { name: 'Collapse Assembly', exact: true })).toBeVisible()

  // Imported bars are editable like the others.
  await primer.press('ArrowRight')
  await expect(chart.getByRole('button', { name: 'Primer 11:15–12:45', exact: true })).toBeVisible()

  // An invalid file names the line and leaves the timeline unchanged.
  await input.setInputFiles({ name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('Row,Bar,Start,End\nA,X,soon,10:00\n') })
  await expect(status('Import failed: Invalid start time on CSV line 2: soon')).toBeVisible()
  await expect(chart.getByRole('button', { name: 'Primer 11:15–12:45', exact: true })).toBeVisible()
  await input.setInputFiles({ name: 'open.csv', mimeType: 'text/csv', buffer: Buffer.from('Row,Bar,Start,End\nA,"X,09:00,10:00\n') })
  await expect(status('Import failed: Unterminated quoted CSV field starting at line 2, column 3')).toBeVisible()

  // Undo restores the edit and then the previous plan.
  const undo = page.getByRole('button', { name: 'Undo timeline change', exact: true })
  await undo.click()
  await expect(primer).toBeVisible()
  await undo.click()
  await expect(chart.getByRole('button', { name: 'Wireframes 08:00–10:00', exact: true })).toBeVisible()
  await expect(primer).toHaveCount(0)
  expect(errors).toEqual([])
})

test('invalid markers, columns and header bands report validation-error and render the empty state', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await openComponentFixture(page)
  const timeline = page.getByRole('region', { name: 'Timeline fixture', exact: true })
  const bar = timeline.getByRole('button', { name: 'Editable bar 1–3', exact: true })
  const reports = timeline.getByRole('status', { name: 'Validation reports' })
  const empty = timeline.getByText('No rows to display', { exact: true })
  await expect(bar).toBeVisible()
  const expected: string[] = []
  for (const [control, message] of [
    ['Duplicate markers', 'Invalid timeline marker: m'],
    ['Invalid column width', 'Invalid timeline column: c'],
    ['Overlapping header bands', 'Timeline bands must be finite, ordered and nonoverlapping'],
  ] as const) {
    await timeline.getByRole('button', { name: control, exact: true }).click()
    expected.push(message)
    await expect(reports).toHaveText(expected.join('; '))
    await expect(empty).toBeVisible()
    await expect(bar).toHaveCount(0)
    await timeline.getByRole('button', { name: 'Restore display', exact: true }).click()
    await expect(bar).toBeVisible()
    await expect(empty).toHaveCount(0)
  }
  expect(errors).toEqual([])
})

test('a manual graph camera survives accepted connections, deletions and group toggles; a layout change re-fits', async ({ page }) => {
  const { errors, button, status, edges } = await openGraphEditor(page)
  const world = page.locator('.vw-network-stage > g')
  const tools = page.getByRole('group', { name: 'Graph zoom', exact: true })
  const level = tools.getByRole('status'), zoomIn = tools.getByRole('button', { name: 'Zoom in', exact: true })
  await expect(edges).toHaveCount(6)
  const fitted = (await level.textContent())!
  await zoomIn.click()
  await expect(level).not.toHaveText(fitted)
  const zoomed = (await world.getAttribute('transform'))!
  const zoomedLevel = (await level.textContent())!

  await button('Start connection from Material A1').press('Enter')
  await button('Connect to Finish').press('Enter')
  await expect(status('Connected')).toBeVisible()
  await expect(edges).toHaveCount(7)
  await expect(world).toHaveAttribute('transform', zoomed)
  await expect(level).toHaveText(zoomedLevel)

  const fp = button('Select edge fp')
  await fp.press('Enter')
  await fp.press('Delete')
  await expect(edges).toHaveCount(6)
  await expect(world).toHaveAttribute('transform', zoomed)

  await page.getByLabel('Collapsible groups').check()
  await button('Collapse group Intermediate lots').click()
  await expect(button('Intermediate lots 2 nodes')).toBeVisible()
  await expect(world).toHaveAttribute('transform', zoomed)
  await button('Expand group Intermediate lots').click()
  await expect(button('Lot A123-01 72 units')).toBeVisible()
  await expect(world).toHaveAttribute('transform', zoomed)

  // Fit to view returns to automatic fitting; zooming makes the camera manual again.
  await button('Fit to view').click()
  await expect(level).toHaveText(fitted)
  await zoomIn.click()
  await expect(level).toHaveText(zoomedLevel)
  // A layout change moves every node, so it re-fits even a manual camera.
  await page.getByLabel('Direction').selectOption('RL')
  await expect(world).not.toHaveAttribute('transform', zoomed)
  await expect(level).toHaveText(fitted)
  expect(errors).toEqual([])
})

test('a context menu during a graph node drag cancels the drag without a proposal', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  for (const menu of [false, true]) {
    await openNetworkFixture(page, '?nodes=5&draggable=1' + (menu ? '&menu=1' : ''))
    const out = (name: string) => page.getByRole('status', { name, exact: true })
    const node = chainNode(page, 'N0001')
    const box = (await node.boundingBox())!
    const x = box.x + box.width / 2, y = box.y + box.height / 2
    // macOS Control-click: a primary press followed by contextmenu; the native menu then swallows pointerup.
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 40, y + 30, { steps: 6 })
    await node.dispatchEvent('contextmenu', { button: 0, clientX: x + 40, clientY: y + 30 })
    await page.mouse.up()
    await expect(out('Move events')).toHaveText('0')
    await expect(out('Last move')).toHaveText('')
    await expect(out('Menu events')).toHaveText('0')
    // Without a gesture the menu request and a later drag behave as before.
    if (menu) {
      await node.click({ button: 'right' })
      await expect(out('Menu events')).toHaveText('1')
      expect(JSON.parse((await out('Last menu').textContent())!)).toMatchObject({ target: { kind: 'node', id: 'N0001' }, source: 'pointer' })
    }
    const after = (await node.boundingBox())!
    await page.mouse.move(after.x + after.width / 2, after.y + after.height / 2)
    await page.mouse.down()
    await page.mouse.move(after.x + after.width / 2 + 40, after.y + after.height / 2 + 30, { steps: 6 })
    await page.mouse.up()
    await expect(out('Move events')).toHaveText('1')
    await expect(out('Last move')).toHaveText('N0001')
  }
  expect(errors).toEqual([])
})

test('a context menu during a gantt bar drag cancels the drag without an edit proposal', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  for (const search of ['', '?interactions=1']) {
    const { chart, out } = await openGanttFixture(page, search)
    const bar = chart.getByRole('button', { name: 'Task A 0–2', exact: true })
    // The accessible name follows the drag preview, so keep the element itself.
    const element = (await bar.elementHandle())!
    const box = (await bar.boundingBox())!
    const x = box.x + box.width / 2, y = box.y + box.height / 2
    // macOS Control-click: a primary press followed by contextmenu; the native menu then swallows pointerup.
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 100, y, { steps: 6 })
    await element.dispatchEvent('contextmenu', { button: 0, clientX: x + 100, clientY: y })
    await page.mouse.up()
    await expect(out('Last edit')).toHaveText('')
    if (search) {
      // The menu request is still reported for the bar.
      expect(JSON.parse((await out('Last context menu').textContent())!)).toMatchObject({ target: { kind: 'bar', id: 'a' }, source: 'pointer' })
    }
    // Without a gesture a drag still proposes an edit.
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 100, y, { steps: 6 })
    await page.mouse.up()
    await expect(out('Last edit')).not.toHaveText('')
    expect(JSON.parse((await out('Last edit').textContent())!)).toMatchObject({ id: 'a', mode: 'move', source: 'pointer' })
  }
  expect(errors).toEqual([])
})
