import { test, expect, type Page } from '@playwright/test'
import { fileURLToPath } from 'node:url'

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
  await expect(page.getByRole('link', { name: 'Vue Weave 0.4', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Fit to view', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Zoom in', exact: true })).toHaveCount(2)
  await page.locator('.vft-zoom-tools').getByRole('button', { name: 'Zoom in', exact: true }).click()
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

test('direction, slots, milestones, theme and virtual rows', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Direction').selectOption('TB')
  await expect(page.locator('.vft-network-stage')).toHaveCSS('height', '470px')
  await page.getByLabel('Custom nodes').check()
  await expect(page.locator('.vft-network-node > rect')).toHaveCount(6)
  await page.getByLabel('Dark theme').check()
  await expect(page.locator('.demo')).toHaveClass(/dark/)
  await page.getByRole('button', { name: 'Project delivery', exact: true }).click()
  await expect(page.locator('.vft-gantt-bar.milestone')).toHaveCount(1)
  await page.getByRole('button', { name: 'Release 15:00–15:00', exact: true }).press('ArrowRight')
  await expect(page.getByRole('button', { name: 'Release 15:15–15:15', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '1,000 resources', exact: true }).click()
  expect(await page.locator('.vft-gantt-row').count()).toBeLessThan(15)
  await page.getByRole('button', { name: 'Last resource', exact: true }).click()
  await expect(page.getByText('Resource 1000', { exact: true })).toBeVisible()
  expect(await page.locator('.vft-gantt-row').count()).toBeLessThan(15)
  await page.screenshot({ path: 'test-results/large-dark.png', fullPage: true })
})

test('mobile layout and horizontal scrolling', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  const viewport = page.locator('.vft-gantt-scroll')
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
  const beforeNavigation = await page.locator('.vft-network-stage > g').getAttribute('transform')
  await page.getByRole('button', { name: 'Navigate graph overview' }).click({ position: { x: 20, y: 30 } })
  await expect(page.locator('.vft-network-stage > g')).not.toHaveAttribute('transform', beforeNavigation!)
  await page.getByRole('button', { name: 'Fit to view' }).click()

  await page.getByRole('button', { name: 'Start connection from Material A1', exact: true }).press('Enter')
  await page.getByRole('button', { name: 'Connect to Split', exact: true }).press('Enter')
  await expect(page.getByRole('status').filter({ hasText: 'already exists' })).toBeVisible()
  await page.getByRole('button', { name: 'Start connection from Material A1', exact: true }).press('Enter')
  await page.getByRole('button', { name: 'Connect to Finish', exact: true }).press('Enter')
  await expect(page.getByRole('status').filter({ hasText: 'Connected' })).toBeVisible()
  await expect(page.locator('.vft-network-edge')).toHaveCount(7)
  expect(errors).toEqual([])
})

test('hierarchy, header bands, baselines and markers compose with controlled edits', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Planning overlays').check()
  await expect(page.getByText('Operating window · UTC')).toBeVisible()
  await expect(page.getByText('Shift review', { exact: true })).toBeVisible()
  await expect(page.locator('.vft-gantt-row')).toHaveCount(3)
  await expect(page.locator('.vft-gantt-baseline')).toHaveCount(4)
  const baseline = page.locator('.vft-gantt-baseline').first()
  const original = await baseline.getAttribute('style')
  await page.getByRole('button', { name: 'Split · plan 09:00–11:00', exact: true }).press('ArrowRight')
  await expect(page.getByRole('button', { name: 'Split · plan 09:15–11:15', exact: true })).toBeVisible()
  await expect(baseline).toHaveAttribute('style', original!)
  await page.getByRole('button', { name: 'Collapse Production schedule' }).click()
  await expect(page.locator('.vft-gantt-row')).toHaveCount(1)
  await expect(page.locator('.vft-gantt-bar')).toHaveCount(0)
  await expect(page.locator('.vft-gantt-links')).toHaveCount(0)
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
  await expect(page.locator('.vft-connection-preview')).toHaveAttribute('d', /^M .+ L /)
  await page.mouse.up()
  await expect(page.locator('.vft-network-edge')).toHaveCount(5)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('.vft-network-edge')).toHaveCount(4)

  const edge = page.getByRole('button', { name: 'Select edge da', exact: true })
  const path = await edge.getAttribute('d')
  await edge.press('Enter')
  await page.getByRole('button', { name: 'Reconnect target of da', exact: true }).press('Enter')
  await page.getByRole('button', { name: 'Connect to Release · Input', exact: true }).press('Enter')
  await expect(page.getByRole('status').filter({ hasText: 'Reconnected edge da' })).toBeVisible()
  await expect(edge).not.toHaveAttribute('d', path!)
  await expect(page.locator('.vft-network-edge')).toHaveCount(4)
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
  await expect(page.locator('.vft-network-edge')).toHaveCount(4)
  expect(errors).toEqual([])
})

test('range selection and group movement commit an atomic batch', async ({ page }) => {
  await page.goto('/')
  await page.getByLabel('Edit graph').check()
  const lots = page.locator('.vft-network-node').filter({ hasText: 'Lot A123-' })
  const boxes = await Promise.all([lots.first().boundingBox(), lots.last().boundingBox()])
  const [a, b] = boxes
  await page.keyboard.down('Shift')
  await page.mouse.move(a!.x - 9, a!.y - 12)
  await page.mouse.down()
  await page.mouse.move(b!.x + b!.width + 8, b!.y + b!.height + 7, { steps: 8 })
  await expect(page.locator('.vft-box-selection')).toBeVisible()
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
  const summary = page.locator('.vft-gantt-summary')
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
  await expect(page.locator('.vft-gantt-links path.highlighted')).toHaveCount(2)
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
  const moving = page.locator('.vft-gantt-bar[aria-label^="Split · plan"]')
  await moving.focus()
  for (let i = 0; i < 24; i++) await moving.press('ArrowRight')
  await expect(page.locator('.vft-gantt-bar:focus')).toHaveCount(1)
  const region = page.getByRole('region', { name: 'Gantt chart', exact: true })
  await expect.poll(() => region.evaluate(el => el.scrollLeft)).toBeGreaterThan(0)
  const focused = (await page.locator('.vft-gantt-bar:focus').boundingBox())!
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
  const area = (await region.boundingBox())!
  const bar = page.getByRole('button', { name: 'Split · plan 09:00–11:00', exact: true })
  const box = (await bar.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(area.x + area.width - 10, box.y + box.height / 2, { steps: 8 })
  await expect.poll(() => region.evaluate(el => el.scrollLeft)).toBeGreaterThan(50)
  await page.mouse.up()
  await expect(page.locator('.vft-gantt-bar[aria-label^="Split · plan"]')).not.toHaveAttribute('aria-label', 'Split · plan 09:00–11:00')
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
  await page.evaluate(() => (window as any).__vw.graph().fit())
  await expect(chainNode(page, 'N0452')).toHaveCount(1)
  expect(await chainNode(page).count()).toBeLessThan(600)
  expect(await page.evaluate(() => {
    try { (window as any).__vw.graph().focusNode('missing') } catch (error) { return (error as Error).message }
  })).toBe('Unknown node: missing')
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
  await expect(chainNode(page, 'N0000')).toHaveClass(/vft-dimmed/)
  await expect(chainNode(page, 'N0001')).not.toHaveClass(/vft-dimmed/)
  await expect(chainNode(page, 'N0002')).not.toHaveClass(/vft-dimmed/)
  await expect(chainNode(page, 'N0004')).toHaveClass(/vft-dimmed/)
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
  await expect(chart.locator('.vft-gantt-link-preview path')).toHaveAttribute('d', /^M .+ L /)
  await page.mouse.up()
  await expect(status('Added FF dependency from Wireframes to Checkout UI.')).toBeVisible()
  await expect(links).toHaveCount(3)
  await expect(chart.locator('.vft-gantt-link-preview')).toHaveCount(0)

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
  const api = chart.locator('.vft-gantt-bar[aria-label^="Billing API"]')
  const ui = chart.locator('.vft-gantt-bar[aria-label^="Checkout UI"]')
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
  await expect(chart.locator('.vft-gantt-bar:focus')).toHaveAttribute('aria-label', 'Wireframes 08:00–10:00')
  await page.keyboard.press('ArrowUp')
  await expect(status('Moved Wireframes to Product team.')).toBeVisible()

  // Pointer row drags propose the row under the pointer; Escape cancels a drag.
  const tests = chart.getByRole('button', { name: 'Acceptance tests 14:00–16:00', exact: true })
  const start = (await tests.boundingBox())!
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2)
  await page.mouse.down()
  await page.mouse.move(start.x + start.width / 2, start.y + start.height / 2 - 66, { steps: 6 })
  await expect(chart.locator('.vft-gantt-bar.dragging')).toHaveAttribute('style', /translateY\(-66px\)/)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(chart.locator('.vft-gantt-bar.dragging')).toHaveCount(0)
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
  await expect(chart.locator('.vft-gantt-now')).toHaveText('Now')
  await expect(chart.locator('.vft-gantt-now')).toHaveAttribute('title', 'Now 11:30')
  await expect(chart.getByRole('group', { name: 'Resource load Engineering pool', exact: true })).toBeVisible()
  const overload = chart.getByRole('img', { name: 'Engineering pool 10:00–13:00: load 2 / capacity 1, overloaded by 1', exact: true })
  await expect(overload).toBeVisible()
  await expect(chart.locator('.vft-gantt-load-segment.overloaded')).toHaveCount(1)
  const bar = (await chart.getByRole('button', { name: 'Billing API 10:00–13:00', exact: true }).boundingBox())!
  const segment = (await overload.boundingBox())!
  expect(Math.abs(segment.x - bar.x)).toBeLessThanOrEqual(1)

  // Moving work updates the histogram.
  const checkout = chart.locator('.vft-gantt-bar[aria-label^="Checkout UI"]')
  await checkout.click()
  for (let i = 0; i < 12; i++) await checkout.press('ArrowRight')
  await expect(checkout).toHaveAttribute('aria-label', 'Checkout UI 13:00–17:00')
  await expect(chart.locator('.vft-gantt-load-segment.overloaded')).toHaveCount(1)
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
