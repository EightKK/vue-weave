// Linked views, asynchronous layout, saved editing against a mock server and windowed loading of a large plan.
import { expect, test, emptyGraphPoint, openExample, pageErrors, pressAndMove, type Page } from './support'

async function openPersistence(page: Page) {
  const errors = pageErrors(page)
  await openExample(page, 'saved-editing')
  const chart = page.getByRole('region', { name: 'Saved timeline', exact: true })
  await expect(chart).toBeVisible()
  return {
    errors, chart, saveStatus: page.getByRole('status', { name: 'Save status', exact: true }),
    server: (label: string) => page.getByRole('radio', { name: label, exact: true }),
    weld: (time: string) => chart.getByRole('button', { name: 'Weld frames ' + time, exact: true }),
  }
}

async function openLinkedDemo(page: Page) {
  const errors = pageErrors(page)
  await openExample(page, 'linked-views')
  const demo = page.locator('section[aria-labelledby="linked-title"]')
  await expect(demo.getByRole('button', { name: /^Cut order A 10:00/ })).toBeVisible()
  return {
    errors, demo,
    node: (label: string) => demo.getByRole('button', { name: new RegExp('^' + label + ' ES ') }),
    bar: (label: string) => demo.getByRole('button', { name: new RegExp('^' + label + ' \\d\\d:\\d\\d') }),
    summary: demo.getByRole('status', { name: 'Linked selection' }),
    navigation: demo.getByRole('status', { name: 'Navigation message' }),
  }
}

async function openAsyncDemo(page: Page) {
  const errors = pageErrors(page)
  await openExample(page, 'async-layout')
  const demo = page.locator('section[aria-labelledby="async-title"]')
  await expect(demo.getByRole('button', { name: /^Receive/ })).toBeVisible()
  return {
    errors, demo,
    frame: demo.getByLabel('Displayed frame'),
    status: demo.getByRole('status', { name: 'Layout status' }),
    log: demo.getByRole('list', { name: 'Layout responses' }),
  }
}

async function openLargePlanDemo(page: Page) {
  const errors = pageErrors(page)
  await openExample(page, 'large-plan')
  const demo = page.locator('section[aria-labelledby="large-plan-title"]')
  const status = demo.getByRole('status', { name: 'Window status' })
  const loaded = demo.getByLabel('Loaded bars', { exact: true })
  const requests = demo.getByLabel('Requests', { exact: true })
  const timeline = demo.getByRole('region', { name: 'Large plan timeline' })
  const count = async (locator: ReturnType<Page['getByLabel']>) => Number((await locator.textContent())!.replaceAll(',', ''))
  return { errors, demo, status, loaded, requests, timeline, count }
}

test('saved editing leaves the state unchanged when the server rejects a save', async ({ page }) => {
  const { errors, saveStatus, server, weld } = await openPersistence(page)
  await server('Reject').check()
  await weld('13:00–17:00').press('ArrowRight')
  await expect(saveStatus).toContainText('Rejected by the server (server-validation). Nothing changed.')
  await expect(weld('13:00–17:00')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Undo saved change', exact: true })).toBeDisabled()
  await expect(page.getByText('Server version v1 · 0 commits')).toBeVisible()
  await page.getByRole('button', { name: 'Dismiss save message', exact: true }).click()
  await expect(saveStatus).toContainText('Accepted version v1')
  expect(errors).toEqual([])
})

test('saved editing shows an unknown result and reconciles it with the server instead of resending', async ({ page }) => {
  const { errors, saveStatus, server, weld } = await openPersistence(page)
  await server('Result unknown').check()
  await weld('13:00–17:00').press('ArrowRight')
  await expect(saveStatus).toContainText('Saving')
  await expect(saveStatus).toContainText('Result unknown')
  // The client neither commits nor resends: the accepted state is unchanged and the server holds one commit.
  await expect(weld('13:00–17:00')).toBeVisible()
  await expect(page.getByText('Server version v2 · 1 commits')).toBeVisible()
  await page.getByRole('button', { name: 'Check with server', exact: true }).click()
  await expect(page.getByRole('status', { name: 'Last action', exact: true })).toContainText('The server had applied the save')
  await expect(weld('13:15–17:15')).toBeVisible()
  await expect(saveStatus).toContainText('Accepted version v2')
  await expect(page.getByText('Server version v2 · 1 commits')).toBeVisible()
  expect(errors).toEqual([])
})

test('saved editing detects a version conflict, reloads the latest version and restores snapshots through the server', async ({ page }) => {
  const { chart, errors, saveStatus, server, weld } = await openPersistence(page)
  await server('Version conflict').check()
  await weld('13:00–17:00').press('ArrowRight')
  await expect(saveStatus).toContainText('Version conflict')
  await expect(weld('13:00–17:00')).toBeVisible()
  await page.getByRole('button', { name: 'Load latest version', exact: true }).click()
  await expect(chart.getByText('Site survey (edited remotely)')).toBeVisible()
  await expect(page.getByRole('status', { name: 'Last action', exact: true })).toContainText('Loaded version')
  await expect(page.getByRole('status', { name: 'History reset', exact: true })).toContainText('History was reset')

  await server('Accept').check()
  await weld('13:00–17:00').press('ArrowRight')
  await expect(weld('13:15–17:15')).toBeVisible()
  // Undo is a restore transaction: the server gets a new version, the history position moves back once.
  await page.getByRole('button', { name: 'Undo saved change', exact: true }).click()
  await expect(weld('13:00–17:00')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Undo saved change', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Redo saved change', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Redo saved change', exact: true }).click()
  await expect(weld('13:15–17:15')).toBeVisible()
  expect(errors).toEqual([])
})

test('saved editing edits typed cells with number, select and checkbox editors', async ({ page }) => {
  const { chart, errors, saveStatus } = await openPersistence(page)
  await chart.getByRole('button', { name: /^Weld frames · Effort/ }).click()
  const effort = chart.getByRole('textbox', { name: 'Effort editor', exact: true })
  await expect(effort).toBeFocused()
  await effort.fill('abc')
  await effort.press('Enter')
  await expect(effort).toHaveAttribute('aria-invalid', 'true')
  await expect(chart.getByRole('alert')).toBeVisible()
  await effort.fill('0')
  await effort.press('Enter')
  await expect(chart.getByRole('button', { name: 'Weld frames · Effort 0', exact: true })).toBeFocused()
  await expect(saveStatus).toContainText('Accepted version v2')
  await chart.getByRole('button', { name: 'Weld frames · Effort 0', exact: true }).click()
  await chart.getByRole('textbox', { name: 'Effort editor', exact: true }).fill('7.25')
  await chart.getByRole('textbox', { name: 'Effort editor', exact: true }).press('Enter')
  // The server normalises the stored effort to one decimal.
  await expect(chart.getByRole('button', { name: 'Weld frames · Effort 7.3', exact: true })).toBeVisible()
  await expect(saveStatus).toContainText('Accepted version v3')

  await chart.getByRole('button', { name: /^Paint · Owner/ }).click()
  await chart.getByRole('combobox', { name: 'Owner editor', exact: true }).selectOption({ label: 'Ben' })
  await expect(chart.getByRole('button', { name: 'Paint · Owner Ben', exact: true })).toBeVisible()
  await expect(saveStatus).toContainText('Accepted version v4')
  await chart.getByRole('button', { name: 'Paint · Done No', exact: true }).click()
  await chart.getByRole('checkbox', { name: 'Done editor', exact: true }).click()
  await expect(chart.getByRole('button', { name: 'Paint · Done Yes', exact: true })).toBeVisible()
  await expect(saveStatus).toContainText('Accepted version v5')
  // The time field reads UTC text and moves the bar through the same transaction.
  await chart.getByRole('button', { name: /^Paint · Start/ }).click()
  await chart.getByRole('textbox', { name: 'Start editor', exact: true }).fill('2026-11-09 18:00')
  await chart.getByRole('textbox', { name: 'Start editor', exact: true }).press('Enter')
  await expect(chart.getByRole('button', { name: 'Paint 18:00–20:00', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('saved editing writes JSON and restores the same IDs, document and view settings', async ({ page }) => {
  const { chart, errors, weld } = await openPersistence(page)
  await page.getByRole('searchbox', { name: 'Search tasks', exact: true }).fill('Weld')
  await expect(chart.getByRole('button', { name: /^Site survey/ })).toHaveCount(0)
  await page.getByRole('combobox', { name: 'Sort by' }).selectOption('effort')
  await page.getByRole('checkbox', { name: 'Show Done column' }).uncheck()
  await page.getByRole('button', { name: 'Save JSON', exact: true }).click()
  const json = page.getByRole('textbox', { name: 'Snapshot JSON', exact: true })
  const text = await json.inputValue()
  const saved = JSON.parse(text) as { schemaVersion: number; kind: string; data: { rows: { id: string }[]; bars: { id: string }[] }; view: { timeline: { search: { query: string }; sort: unknown[]; columns: { id: string; visible: boolean }[] } } }
  expect(saved.schemaVersion).toBe(1)
  expect(saved.data.rows.map(row => row.id)).toEqual(['survey', 'design', 'weld', 'paint', 'ship'])
  expect(saved.view.timeline.search.query).toBe('Weld')
  expect(saved.view.timeline.columns.find(column => column.id === 'done')?.visible).toBe(false)

  // Change the document and the view, then load the JSON back.
  await page.getByRole('searchbox', { name: 'Search tasks', exact: true }).fill('')
  await page.getByRole('combobox', { name: 'Sort by' }).selectOption('')
  await page.getByRole('checkbox', { name: 'Show Done column' }).check()
  await weld('13:00–17:00').press('ArrowRight')
  await expect(page.getByRole('status', { name: 'Save status', exact: true })).toContainText('Accepted version v2')
  await expect(weld('13:15–17:15')).toBeVisible()
  await json.fill(text)
  await page.getByRole('button', { name: 'Load JSON', exact: true }).click()
  await expect(page.getByRole('status', { name: 'JSON status', exact: true })).toContainText('Loaded 5 tasks and the saved view')
  await expect(weld('13:00–17:00')).toBeVisible()
  await expect(page.getByRole('searchbox', { name: 'Search tasks', exact: true })).toHaveValue('Weld')
  await expect(page.getByRole('combobox', { name: 'Sort by' })).toHaveValue('effort')
  await expect(page.getByRole('checkbox', { name: 'Show Done column' })).not.toBeChecked()
  await expect(chart.getByRole('button', { name: /^Site survey/ })).toHaveCount(0)

  // Broken JSON is reported and changes nothing.
  await json.fill(text.replace('"schemaVersion": 1', '"schemaVersion": 7'))
  await page.getByRole('button', { name: 'Load JSON', exact: true }).click()
  await expect(page.getByRole('status', { name: 'JSON status', exact: true })).toContainText('Cannot load')
  await expect(weld('13:00–17:00')).toBeVisible()
  // R10: a reference to an unknown row is found before anything is applied; the document and the view stay as they are.
  const broken = JSON.parse(text) as { data: { bars: { rowId: string }[] }; view: { timeline: { search: { query: string } } } }
  broken.data.bars[0]!.rowId = 'ghost'
  broken.view.timeline.search.query = ''
  await json.fill(JSON.stringify(broken))
  await page.getByRole('button', { name: 'Load JSON', exact: true }).click()
  await expect(page.getByRole('status', { name: 'JSON status', exact: true })).toContainText('Cannot load')
  await expect(page.getByRole('searchbox', { name: 'Search tasks', exact: true })).toHaveValue('Weld')
  await expect(weld('13:00–17:00')).toBeVisible()
  expect(errors).toEqual([])
})

test('linked views: a graph selection highlights bars without selecting or deleting them', async ({ page }) => {
  const { errors, demo, node, bar, summary } = await openLinkedDemo(page)
  await node('Cut order B').click()
  await expect(node('Cut order B')).toHaveAttribute('aria-pressed', 'true')
  await expect(summary).toContainText('Selected in graph: Cut order B')
  await expect(bar('Cut order B')).toHaveClass(/\bvw-is-highlighted\b/)
  // The timeline owns no selection: the highlighted bar is not selected.
  await expect(bar('Cut order B')).toHaveAttribute('aria-pressed', 'false')
  await expect(bar('Cut order B')).not.toHaveClass(/\bvw-is-selected\b/)
  await expect(bar('Cut order A')).not.toHaveClass(/\bvw-is-highlighted\b/)

  // The impact range adds the dependent tasks as highlights too.
  await demo.getByRole('combobox', { name: 'Impact direction' }).selectOption('forward')
  await demo.getByRole('combobox', { name: 'Impact hop limit' }).selectOption('1')
  await expect(bar('Inspect')).toHaveClass(/\bvw-is-highlighted\b/)
  await expect(bar('Pack')).not.toHaveClass(/\bvw-is-highlighted\b/)
  await demo.getByRole('combobox', { name: 'Impact hop limit' }).selectOption('all')
  await expect(bar('Pack')).toHaveClass(/\bvw-is-highlighted\b/)
  await expect(bar('Pack')).toHaveAttribute('aria-pressed', 'false')

  // Delete on a highlighted bar proposes only that bar; the other highlighted bars and the selected node are not included.
  await bar('Inspect').focus()
  await page.keyboard.press('Delete')
  await expect(demo.getByLabel('Delete proposals')).toHaveText(/Delete proposals: 1\b/)
  await expect(demo.getByLabel('Delete proposals').locator('..')).toContainText('last: Inspect;')
  await expect(node('Cut order B')).toHaveAttribute('aria-pressed', 'true')
  await expect(bar('Inspect')).toHaveAttribute('aria-pressed', 'false')

  // Selecting a bar moves the selection to the timeline and clears the graph's own selection: no ping-pong.
  await bar('Pack').click()
  await expect(summary).toContainText('Selected in timeline: Pack')
  await expect(bar('Pack')).toHaveAttribute('aria-pressed', 'true')
  await expect(node('Pack')).toHaveAttribute('aria-pressed', 'false')
  await expect(node('Pack')).toHaveClass(/\bvw-is-highlighted\b/)
  await expect(node('Cut order B')).toHaveAttribute('aria-pressed', 'false')
  await page.keyboard.press('Escape')
  await page.mouse.move(2, 2)
  await expect(summary).toContainText('Nothing selected')
  await expect(node('Pack')).not.toHaveClass(/\bvw-is-highlighted\b/)
  expect(errors).toEqual([])
})

test('linked views: a click on the empty graph canvas clears the selection in every view', async ({ page }) => {
  const { errors, demo, node, bar, summary } = await openLinkedDemo(page)
  await expect(demo.getByText('Click the empty graph canvas or press Escape to clear the selection.', { exact: false })).toBeVisible()
  const stage = demo.getByRole('img', { name: 'Linked network diagram', exact: true })
  await node('Cut order B').click()
  await expect(node('Cut order B')).toHaveAttribute('aria-pressed', 'true')
  await expect(bar('Cut order B')).toHaveClass(/\bvw-is-highlighted\b/)
  await stage.click({ position: await emptyGraphPoint(stage) })
  await expect(summary).toContainText('Nothing selected')
  await expect(node('Cut order B')).toHaveAttribute('aria-pressed', 'false')
  await expect(bar('Cut order B')).not.toHaveClass(/\bvw-is-highlighted\b/)

  // A selection made in the timeline is cleared from the graph canvas as well.
  await bar('Pack').click()
  await expect(bar('Pack')).toHaveAttribute('aria-pressed', 'true')
  await expect(node('Pack')).toHaveClass(/\bvw-is-highlighted\b/)
  await stage.click({ position: await emptyGraphPoint(stage) })
  await expect(summary).toContainText('Nothing selected')
  await expect(bar('Pack')).toHaveAttribute('aria-pressed', 'false')
  await expect(node('Pack')).not.toHaveClass(/\bvw-is-highlighted\b/)
  expect(errors).toEqual([])
})

test('linked views: an external task list selects by entity and every view only highlights', async ({ page }) => {
  const { errors, demo, node, bar, summary } = await openLinkedDemo(page)
  const list = demo.getByRole('list', { name: 'Task list' })
  const item = (label: string) => list.getByRole('button', { name: label, exact: true })
  await item('Cut order A').click()
  await expect(item('Cut order A')).toHaveAttribute('aria-pressed', 'true')
  await expect(summary).toContainText('Selected in task list: Cut order A')
  // No view owns the selection: the graph and the timeline highlight the task without selecting it.
  await expect(node('Cut order A')).toHaveClass(/\bvw-is-highlighted\b/)
  await expect(node('Cut order A')).toHaveAttribute('aria-pressed', 'false')
  await expect(bar('Cut order A')).toHaveClass(/\bvw-is-highlighted\b/)
  await expect(bar('Cut order A')).toHaveAttribute('aria-pressed', 'false')
  await expect(demo.locator('.vw-gantt-load-segment.vw-is-highlighted')).toHaveCount(2)
  await expect(demo.locator('.vw-gantt-load-segment.vw-is-selected')).toHaveCount(0)

  // A view selection replaces it, and the list shows that selection too.
  await bar('Pack').click()
  await expect(summary).toContainText('Selected in timeline: Pack')
  await expect(item('Pack')).toHaveAttribute('aria-pressed', 'true')
  await expect(item('Cut order A')).toHaveAttribute('aria-pressed', 'false')
  await expect(node('Cut order A')).not.toHaveClass(/\bvw-is-highlighted\b/)

  // Selecting from the list again takes the selection back from the timeline.
  await item('Inspect').click()
  await expect(summary).toContainText('Selected in task list: Inspect')
  await expect(bar('Pack')).toHaveAttribute('aria-pressed', 'false')
  await expect(bar('Inspect')).toHaveClass(/\bvw-is-highlighted\b/)
  // Clicking the selected list item again clears the selection.
  await item('Inspect').click()
  await expect(summary).toContainText('Nothing selected')
  await expect(item('Inspect')).toHaveAttribute('aria-pressed', 'false')
  await expect(bar('Inspect')).not.toHaveClass(/\bvw-is-highlighted\b/)

  // Clear selection works for an entity selection.
  await item('Prepare stock').click()
  await expect(node('Prepare stock')).toHaveClass(/\bvw-is-highlighted\b/)
  await demo.getByRole('button', { name: 'Clear selection', exact: true }).click()
  await expect(summary).toContainText('Nothing selected')
  await expect(node('Prepare stock')).not.toHaveClass(/\bvw-is-highlighted\b/)
  expect(errors).toEqual([])
})

test('linked views: hover propagates to the other views and clears on leave', async ({ page }) => {
  const { errors, demo, node, bar, summary } = await openLinkedDemo(page)
  await bar('Cut order A').hover()
  await expect(node('Cut order A')).toHaveClass(/\bvw-is-highlighted\b/)
  await expect(summary).toContainText('Hovering: Cut order A')
  // Load linked by hover is highlighted through `highlightedLoadTargets`; the segments are matched by range overlap.
  await expect(demo.locator('.vw-gantt-load-segment.vw-is-highlighted')).toHaveCount(2)
  await expect(node('Cut order B')).not.toHaveClass(/\bvw-is-highlighted\b/)
  await demo.getByRole('heading', { name: 'Linked planning views' }).hover()
  await expect(node('Cut order A')).not.toHaveClass(/\bvw-is-highlighted\b/)
  await expect(demo.locator('.vw-gantt-load-segment.vw-is-highlighted, .vw-gantt-load-segment.vw-is-selected')).toHaveCount(0)
  await expect(summary).toContainText('Nothing selected')

  await node('Inspect').hover()
  await expect(bar('Inspect')).toHaveClass(/\bvw-is-highlighted\b/)
  await expect(bar('Inspect')).toHaveAttribute('aria-pressed', 'false')
  await page.mouse.move(2, 2)
  await expect(bar('Inspect')).not.toHaveClass(/\bvw-is-highlighted\b/)
  expect(errors).toEqual([])
})

test('linked views: an overloaded load segment highlights the competing tasks', async ({ page }) => {
  const { errors, demo, node, bar, summary } = await openLinkedDemo(page)
  const overloaded = demo.getByRole('button', { name: 'CNC cell 10:00–12:00: load 2 / capacity 1, overloaded by 1' })
  await overloaded.click()
  await expect(summary).toContainText('Selected in load: Cut order A, Cut order B')
  for (const label of ['Cut order A', 'Cut order B']) {
    await expect(node(label)).toHaveClass(/\bvw-is-highlighted\b/)
    await expect(node(label)).toHaveAttribute('aria-pressed', 'false')
    await expect(bar(label)).toHaveClass(/\bvw-is-highlighted\b/)
    await expect(bar(label)).toHaveAttribute('aria-pressed', 'false')
  }
  await expect(node('Inspect')).not.toHaveClass(/\bvw-is-highlighted\b/)
  await expect(demo.locator('.vw-gantt-load-segment.vw-is-selected')).toHaveCount(1)
  await expect(overloaded).toHaveClass(/\bvw-is-selected\b/)
  await expect(overloaded).toHaveAttribute('aria-pressed', 'true')
  // The segment after the overload belongs to cutting order A alone.
  await page.mouse.move(2, 2)
  const following = demo.getByRole('button', { name: 'CNC cell 12:00–13:00: load 1 / capacity 1' })
  await following.focus()
  await following.press('Enter')
  await expect(summary).toHaveText(/^Selected in load: Cut order A(\.|$)/)
  await expect(bar('Cut order B')).not.toHaveClass(/\bvw-is-highlighted\b/)
  await expect(bar('Cut order A')).toHaveClass(/\bvw-is-highlighted\b/)
  expect(errors).toEqual([])
})

test('linked views: the context toolbar follows the selected node and hides for hidden targets', async ({ page }) => {
  const { errors, demo, node, summary } = await openLinkedDemo(page)
  const toolbar = demo.getByRole('toolbar', { name: 'Selected graph item' })
  await expect(toolbar).toBeHidden()
  await node('Inspect').click()
  await expect(toolbar).toBeVisible()
  const place = async () => {
    const [t, n] = await Promise.all([toolbar.boundingBox(), node('Inspect').boundingBox()])
    return { t: t!, n: n! }
  }
  const before = await place()
  expect(Math.abs(before.t.x + before.t.width / 2 - (before.n.x + before.n.width / 2))).toBeLessThan(6)
  const fontSize = await toolbar.evaluate(element => getComputedStyle(element).fontSize)
  // Zooming moves and scales the node, and the toolbar follows it without scaling its text.
  await demo.getByRole('button', { name: 'Zoom out' }).first().click()
  await expect.poll(async () => (await place()).n.width).toBeLessThan(before.n.width)
  const after = await place()
  expect(Math.abs(after.t.x + after.t.width / 2 - (after.n.x + after.n.width / 2))).toBeLessThan(6)
  expect(after.t.width).toBeCloseTo(before.t.width, 0)
  expect(await toolbar.evaluate(element => getComputedStyle(element).fontSize)).toBe(fontSize)
  // The toolbar's own action goes to the counterpart in the timeline.
  await toolbar.getByRole('button', { name: 'Show in timeline' }).click()
  await expect(demo.getByRole('status', { name: 'Navigation message' })).toContainText('Showing Inspect in the timeline.')

  // A node hidden by a collapsed group has no on-screen rectangle: the toolbar goes away.
  await node('Cut order A').click()
  await expect(toolbar).toBeVisible()
  await demo.getByRole('button', { name: 'Collapse group Cutting cell' }).click()
  await expect(toolbar).toBeHidden()
  await expect(summary).toContainText('Selected in graph: Cut order A')
  expect(errors).toEqual([])
})

test('linked views: a time range highlights the active tasks and, on request, related ones without selecting them', async ({ page }) => {
  const { errors, demo, node, bar, summary } = await openLinkedDemo(page)
  const controls = demo.getByRole('group', { name: 'Time range controls' })
  const result = demo.getByRole('status', { name: 'Time range result' })
  await expect(result).toHaveText('Time range off.')
  await expect(controls.getByRole('combobox', { name: 'Range relation' })).toBeDisabled()
  await controls.getByRole('checkbox', { name: 'Explore a time range' }).check()
  // 10:30–11:30: both cutting orders run; preparation ended at 10:00.
  await expect(result).toHaveText('Active 10:30–11:30: Cut order A, Cut order B.')
  for (const label of ['Cut order A', 'Cut order B']) {
    await expect(node(label)).toHaveClass(/\bvw-is-highlighted\b/)
    await expect(node(label)).toHaveAttribute('aria-pressed', 'false')
    await expect(bar(label)).toHaveClass(/\bvw-is-highlighted\b/)
    await expect(bar(label)).toHaveAttribute('aria-pressed', 'false')
  }
  await expect(node('Prepare stock')).not.toHaveClass(/\bvw-is-highlighted\b/)
  await expect(summary).toContainText('Nothing selected')

  // Related tasks are marked separately (`relatedIds`) in the graph and are not active.
  const relation = controls.getByRole('combobox', { name: 'Range relation' })
  await relation.selectOption('successors')
  await expect(result).toHaveText('Active 10:30–11:30: Cut order A, Cut order B. Related: Inspect, Pack.')
  await expect(node('Inspect')).toHaveClass(/\bvw-is-related\b/)
  await expect(node('Inspect')).not.toHaveClass(/\bvw-is-highlighted\b/)
  await expect(node('Prepare stock')).not.toHaveClass(/\bvw-is-related\b/)
  await relation.selectOption('predecessors')
  await expect(result).toHaveText('Active 10:30–11:30: Cut order A, Cut order B. Related: Prepare stock.')
  await expect(node('Prepare stock')).toHaveClass(/\bvw-is-related\b/)
  await expect(node('Inspect')).not.toHaveClass(/\bvw-is-related\b/)

  // Restricting to the CNC cell rows and moving the range: cutting order B ends at 12:00 (half-open), so only A is active.
  await relation.selectOption('active')
  await controls.getByRole('combobox', { name: 'Range resource' }).selectOption('cnc')
  await controls.getByLabel('Range start').fill('12:00')
  await controls.getByLabel('Range end').fill('13:00')
  await expect(result).toHaveText('Active 12:00–13:00: Cut order A.')
  await expect(node('Cut order B')).not.toHaveClass(/\bvw-is-highlighted\b/)
  await expect(node('Cut order A')).toHaveClass(/\bvw-is-highlighted\b/)
  await controls.getByLabel('Range end').fill('11:00')
  await expect(result).toHaveText('The range end is before its start.')
  await expect(node('Cut order A')).not.toHaveClass(/\bvw-is-highlighted\b/)
  await controls.getByLabel('Range end').fill('13:00')
  await expect(node('Cut order A')).toHaveClass(/\bvw-is-highlighted\b/)

  // Range highlights never join a selection: deleting the selected bar proposes only that bar.
  await bar('Pack').click()
  await expect(summary).toContainText('Selected in timeline: Pack')
  await expect(bar('Cut order A')).toHaveClass(/\bvw-is-highlighted\b/)
  await expect(bar('Cut order A')).toHaveAttribute('aria-pressed', 'false')
  await bar('Pack').press('Delete')
  await expect(demo.getByLabel('Delete proposals').locator('..')).toContainText('last: Pack;')
  // Turning the range off removes its highlights and keeps the selection.
  await controls.getByRole('checkbox', { name: 'Explore a time range' }).uncheck()
  await expect(result).toHaveText('Time range off.')
  await page.mouse.move(2, 2)
  await expect(bar('Cut order A')).not.toHaveClass(/\bvw-is-highlighted\b/)
  await expect(bar('Pack')).toHaveAttribute('aria-pressed', 'true')
  expect(errors).toEqual([])
})

test('linked views: reveal handles collapsed groups, collapsed rows and unknown targets', async ({ page }) => {
  const { errors, demo, node, bar, navigation } = await openLinkedDemo(page)
  // Collapse the graph group, then select the bar of a hidden member in the timeline.
  await demo.getByRole('button', { name: 'Collapse group Cutting cell' }).click()
  await expect(node('Cut order A')).toHaveCount(0)
  await bar('Cut order A').click()
  // The hidden node highlights its proxy.
  await expect(demo.getByRole('button', { name: /^Cutting cell 2 nodes/ })).toHaveClass(/\bvw-is-highlighted\b/)
  await demo.getByRole('button', { name: 'Go to graph' }).click()
  await expect(navigation).toContainText('Cut order A is hidden inside the collapsed group “Cutting cell”.')
  await expect(node('Cut order A')).toHaveCount(0)
  await navigation.getByRole('button', { name: 'Expand and show' }).click()
  await expect(navigation).toContainText('Showing Cut order A in the graph.')
  await expect(node('Cut order A')).toBeVisible()
  await expect(demo.getByRole('button', { name: 'Collapse group Cutting cell' })).toBeVisible()
  // Reaching the node by "go to" did not change the selection.
  await expect(bar('Cut order A')).toHaveAttribute('aria-pressed', 'true')

  // The same for a collapsed timeline row.
  await demo.getByRole('button', { name: 'Collapse Cutting cell' }).click()
  await expect(bar('Cut order B')).toHaveCount(0)
  await node('Cut order B').click()
  await demo.getByRole('button', { name: 'Go to timeline' }).click()
  await expect(navigation).toContainText('Cut order B is hidden inside the collapsed row “Cutting cell”.')
  await navigation.getByRole('button', { name: 'Expand and show' }).click()
  await expect(navigation).toContainText('Showing Cut order B in the timeline.')
  await expect(bar('Cut order B')).toBeVisible()

  // An unknown task is reported and nothing moves or changes.
  await demo.getByRole('combobox', { name: 'Task to go to' }).selectOption('retired')
  await demo.getByRole('button', { name: 'Go to timeline' }).click()
  await expect(navigation).toContainText('No timeline bar is known for “retired”.')
  await expect(navigation.getByRole('button', { name: 'Expand and show' })).toHaveCount(0)
  await expect(node('Cut order B')).toHaveAttribute('aria-pressed', 'true')
  expect(errors).toEqual([])
})

test('async layout: responses that arrive out of order never replace the newest frame', async ({ page }) => {
  const { errors, demo, frame, status, log } = await openAsyncDemo(page)
  await expect(frame).toHaveText('8 nodes, 8 links, 0 collapsed groups')
  await expect(status).toContainText('Layout up to date')
  // A manual camera: new frames must not re-fit it, because the layout function keeps its identity.
  await demo.getByRole('button', { name: 'Zoom in', exact: true }).click()
  const camera = () => demo.locator('svg g[transform^="translate("]').first().getAttribute('transform')
  const zoomed = await camera()
  await demo.getByRole('combobox', { name: 'Response timing' }).selectOption('reverse')
  // Request A (the shortcut link) is answered after request B (collapsing Intake); only B's frame may be shown.
  await demo.getByRole('checkbox', { name: 'Shortcut link Receive to Pack' }).check()
  await expect(status).toContainText('Computing layout')
  await demo.getByRole('button', { name: 'Collapse group Intake' }).click()
  await expect(frame).toHaveText('8 nodes, 9 links, 1 collapsed group')
  await expect(log.getByRole('listitem').filter({ hasText: 'discarded (superseded)' })).toHaveCount(1, { timeout: 5000 })
  await expect(status).toContainText('Layout up to date')
  // The late, superseded response did not bring the 9-link frame back.
  await expect(frame).toHaveText('8 nodes, 9 links, 1 collapsed group')
  await expect(demo.getByRole('button', { name: /^Intake 3 nodes/ })).toBeVisible()
  expect(await camera()).toBe(zoomed)
  expect(errors).toEqual([])
})

test('async layout: toggling collapse while a layout is pending does not throw', async ({ page }) => {
  const { errors, demo, frame, status } = await openAsyncDemo(page)
  await demo.getByRole('combobox', { name: 'Response timing' }).selectOption('slow')
  await demo.getByRole('button', { name: 'Collapse group Intake' }).click()
  await expect(status).toContainText('Computing layout')
  // The displayed frame is still the old one while the new input is pending.
  await expect(frame).toHaveText('8 nodes, 8 links, 0 collapsed groups')
  await demo.getByRole('button', { name: 'Expand all groups' }).click()
  await demo.getByRole('button', { name: 'Collapse group Assembly' }).click()
  await demo.getByRole('checkbox', { name: 'Shortcut link Receive to Pack' }).check()
  await expect(status).toContainText('Layout up to date', { timeout: 8000 })
  await expect(frame).toHaveText('8 nodes, 9 links, 1 collapsed group')
  await expect(demo.getByRole('button', { name: /^Assembly 3 nodes/ })).toBeVisible()
  expect(errors).toEqual([])
})

test('async layout: a failing service keeps the last consistent frame and recovers', async ({ page }) => {
  const { errors, demo, frame, status } = await openAsyncDemo(page)
  await demo.getByRole('checkbox', { name: 'Layout service fails' }).check()
  await demo.getByRole('checkbox', { name: 'Shortcut link Receive to Pack' }).check()
  await expect(demo.getByRole('alert')).toContainText('Showing the last consistent layout.')
  // The new link is drawn at once on the previous boxes with a temporary route; the failed layout is not shown.
  await expect(frame).toHaveText('8 nodes, 9 links, 0 collapsed groups')
  await expect(demo.getByLabel('Frame source')).toHaveText('provisional')
  await expect(demo.getByRole('button', { name: /^Receive/ })).toBeVisible()
  await demo.getByRole('checkbox', { name: 'Layout service fails' }).uncheck()
  await demo.getByRole('checkbox', { name: 'Shortcut link Receive to Pack' }).uncheck()
  await demo.getByRole('checkbox', { name: 'Shortcut link Receive to Pack' }).check()
  await expect(frame).toHaveText('8 nodes, 9 links, 0 collapsed groups')
  await expect(demo.getByLabel('Frame source')).toHaveText('layout')
  await expect(demo.getByRole('alert')).toHaveCount(0)
  await expect(status).toContainText('Layout up to date')
  expect(errors).toEqual([])
})

test('async layout: the preserve routing policy keeps the engine routes of ported edges, also in a Worker', async ({ page }) => {
  const { errors, demo, frame } = await openAsyncDemo(page)
  const paths = () => demo.locator('path.vw-network-edge').evaluateAll(list => list.map(path => path.getAttribute('d')).join('|'))
  // Wait for the engine's frame: the synchronous initial frame is provisional and its paths are not the engine's.
  await expect(demo.getByLabel('Frame source')).toHaveText('layout')
  await expect(demo.getByRole('status', { name: 'Layout status' })).toContainText('Layout up to date')
  const builtin = await paths()
  await demo.getByRole('combobox', { name: 'Routing policy' }).selectOption('preserve')
  await expect.poll(paths).not.toBe(builtin)
  const preserved = await paths()
  // The engine draws elbows from port to port; under 'preserve' they are kept instead of the built-in curves.
  expect(preserved.split('|').every(path => / H .* V .* H /.test(path))).toBe(true)
  // A link connected while a layout is pending is drawn at once (temporary route) and the graph stays valid.
  await demo.getByRole('combobox', { name: 'Response timing' }).selectOption('slow')
  await demo.getByRole('checkbox', { name: 'Shortcut link Receive to Pack' }).check()
  await expect(demo.getByRole('status', { name: 'Layout status' })).toContainText('Computing layout')
  await expect(demo.getByRole('status', { name: 'Layout status' })).toContainText('Layout up to date', { timeout: 8000 })
  await expect(frame).toHaveText('8 nodes, 9 links, 0 collapsed groups')
  // The same computation in a Web Worker gives the same routes.
  await demo.getByRole('combobox', { name: 'Response timing' }).selectOption('fast')
  await demo.getByRole('checkbox', { name: 'Compute in a Web Worker' }).check()
  await demo.getByRole('checkbox', { name: 'Shortcut link Receive to Pack' }).uncheck()
  await expect(frame).toHaveText('8 nodes, 8 links, 0 collapsed groups')
  await expect.poll(paths).toBe(preserved)
  expect(errors).toEqual([])
})

test('async layout: a result that arrives during a drag waits for the drag to end and does not cancel it (R11)', async ({ page }) => {
  const { errors, demo, frame, status } = await openAsyncDemo(page)
  await expect(demo.getByLabel('Frame source')).toHaveText('layout')
  await demo.getByRole('combobox', { name: 'Response timing' }).selectOption('slow')
  await demo.getByRole('checkbox', { name: 'Shortcut link Receive to Pack' }).check()
  await expect(demo.getByLabel('Frame source')).toHaveText('provisional')
  const box = (await demo.getByRole('button', { name: /^Ship/ }).boundingBox())!
  await pressAndMove(page, box, 10, 10)
  // The graph reported the drag through `gesture-start`; the demo binds no pointer listeners of its own, only the
  // composable's `gestureListeners`.
  await expect(demo.getByLabel('Graph gesture')).toHaveText('node-drag (pointer) in progress')
  // The engine answers while the pointer is still down: the finished frame waits.
  await expect(status).toContainText('Layout ready, shown after the gesture', { timeout: 5000 })
  await expect(demo.getByLabel('Frame source')).toHaveText('provisional')
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 20, { steps: 3 })
  await expect(demo.getByLabel('Graph gesture')).toHaveText('node-drag (pointer) in progress')
  await page.mouse.up()
  // The drag was not cancelled by the new layout: it ended with a proposal and a committed `gesture-end`, then the
  // waiting frame was shown.
  await expect(demo.getByLabel('Graph gesture')).toHaveText('node-drag (pointer) committed')
  await expect(demo.getByLabel('Last proposed move')).toHaveText(/^Ship by [1-9]\d*, [1-9]\d*$/)
  await expect(status).toContainText('Layout up to date')
  await expect(demo.getByLabel('Frame source')).toHaveText('layout')
  await expect(frame).toHaveText('8 nodes, 9 links, 0 collapsed groups')
  expect(errors).toEqual([])
})

test('linked views: the context toolbar keeps its size and tracks the target rectangle at every zoom level', async ({ page }) => {
  const { errors, demo, node } = await openLinkedDemo(page)
  const toolbar = demo.getByRole('toolbar', { name: 'Selected graph item' })
  await node('Inspect').click()
  await expect(toolbar).toBeVisible()
  const measure = async () => {
    const [t, n] = await Promise.all([toolbar.boundingBox(), node('Inspect').boundingBox()])
    const fontSize = await toolbar.evaluate(element => getComputedStyle(element).fontSize)
    return { t: t!, n: n!, fontSize }
  }
  /** The toolbar is centred on the target and sits 8 px above it, or 8 px below when there is no room above. */
  const tracks = ({ t, n }: { t: { x: number; y: number; width: number; height: number }; n: { x: number; y: number; width: number; height: number } }) =>
    Math.abs(t.x + t.width / 2 - (n.x + n.width / 2)) < 3
    && (Math.abs(t.y + t.height + 8 - n.y) < 3 || Math.abs(t.y - (n.y + n.height + 8)) < 3)
  const initial = await measure()
  expect(tracks(initial)).toBe(true)
  const widths = [initial.n.width]
  for (const step of ['Zoom in', 'Zoom in', 'Zoom out', 'Zoom out', 'Zoom out', 'Zoom out']) {
    const previous = widths[widths.length - 1]!
    await demo.getByRole('button', { name: step, exact: true }).first().click()
    await expect.poll(async () => (await measure()).n.width).not.toBeCloseTo(previous, 0)
    await expect.poll(async () => tracks(await measure())).toBe(true)
    const now = await measure()
    widths.push(now.n.width)
    // Plain HTML over the graph: the text and the box keep their CSS pixel size while the node scales.
    expect(now.fontSize).toBe(initial.fontSize)
    expect(now.t.height).toBeCloseTo(initial.t.height, 1)
    expect(now.t.width).toBeCloseTo(initial.t.width, 0)
  }
  // The node really was drawn at several scales.
  expect(Math.max(...widths) / Math.min(...widths)).toBeGreaterThan(1.5)

  // Panned out of the visible area by keyboard, the target has no visible rectangle and the toolbar goes away; it
  // comes back, tracking again, once the target is visible.
  const stage = demo.getByLabel('Linked network diagram', { exact: true })
  const graphBox = (await stage.boundingBox())!
  await stage.focus()
  let presses = 0
  while ((await node('Inspect').boundingBox())!.x < graphBox.x + graphBox.width + 10 && presses < 80) {
    await stage.press('ArrowLeft')
    presses++
  }
  await expect(toolbar).toBeHidden()
  for (let i = 0; i < presses; i++) await stage.press('ArrowRight')
  await expect(toolbar).toBeVisible()
  await expect.poll(async () => tracks(await measure())).toBe(true)

  // A target hidden inside a collapsed group (no rectangle at all) hides the toolbar too.
  await node('Cut order A').click()
  await expect(toolbar).toBeVisible()
  await demo.getByRole('button', { name: 'Collapse group Cutting cell' }).click()
  await expect(toolbar).toBeHidden()
  expect(errors).toEqual([])
})

test.describe('linked views: the context toolbar and deletion', () => {
  async function openToolbarDemo(page: Page) {
    const opened = await openLinkedDemo(page)
    const { demo } = opened
    const toolbar = demo.getByRole('toolbar', { name: 'Selected graph item' })
    const stage = demo.getByLabel('Linked network diagram', { exact: true })
    const edge = (id: string) => demo.getByRole('button', { name: 'Select edge ' + id, exact: true })
    // The toolbar is given the graph component; ask it for a target's rectangle the way the toolbar does.
    // A role query skips a hidden toolbar, so the element is found by CSS here.
    const rect = (target: unknown) => demo.locator('.linked-graph [role="toolbar"]').evaluate((element, value) => {
      // The toolbar receives the graph as a prop; find its vnode by walking the app's component tree. The site's layout
      // nests the demo deeply, so the walk allows a deep tree.
      const find = (vnode: any, depth = 0): any => {
        if (!vnode || typeof vnode !== 'object' || depth > 400) return undefined
        if (vnode.component?.props?.graph) return vnode.component.props.graph
        const children = [vnode.component?.subTree, vnode.suspense?.activeBranch, ...(Array.isArray(vnode.children) ? vnode.children : [])]
        for (const child of children) { const found = find(child, depth + 1); if (found) return found }
        return undefined
      }
      const graph = find((document.querySelector('#app') as any)?._vnode)
      const result = graph.getTargetClientRect(value) as DOMRect | undefined
      return result && { width: result.width, height: result.height }
    }, target)
    const tasks = demo.getByRole('status', { name: 'Graph tasks', exact: true })
    return { ...opened, toolbar, stage, edge, rect, tasks }
  }

  test('deleting the selected node hides the toolbar and it does not move to another item', async ({ page }) => {
    const { errors, node, toolbar, stage, rect, tasks } = await openToolbarDemo(page)
    await node('Inspect').click()
    await expect(toolbar).toBeVisible()
    await expect(toolbar).toContainText('Inspect')
    expect(await rect({ view: 'graph', kind: 'node', id: 'inspect' })).toBeTruthy()
    await expect(tasks).toHaveText('Graph tasks: 5')
    await node('Inspect').press('Delete')
    await expect(tasks).toHaveText('Graph tasks: 4')
    await expect(node('Inspect')).toHaveCount(0)
    await expect(toolbar).toBeHidden()
    expect(await rect({ view: 'graph', kind: 'node', id: 'inspect' })).toBeUndefined()
    // Nothing else is selected, so the toolbar stays away after later layout and camera changes.
    await stage.focus()
    await stage.press('ArrowLeft')
    await stage.press('ArrowRight')
    await expect(toolbar).toBeHidden()
    await expect(node('Pack')).toBeVisible()
    expect(errors).toEqual([])
  })

  test('deleting the selected edge hides the toolbar', async ({ page }) => {
    const { errors, demo, edge, toolbar, rect, tasks } = await openToolbarDemo(page)
    await edge('cutA-inspect').press('Enter')
    await expect(toolbar).toBeVisible()
    await expect(toolbar).toContainText('Cut order A to Inspect')
    expect(await rect({ view: 'graph', kind: 'edge', id: 'cutA-inspect' })).toBeTruthy()
    await edge('cutA-inspect').press('Delete')
    await expect(edge('cutA-inspect')).toHaveCount(0)
    await expect(toolbar).toBeHidden()
    expect(await rect({ view: 'graph', kind: 'edge', id: 'cutA-inspect' })).toBeUndefined()
    // Only the edge went; both tasks are still drawn.
    await expect(tasks).toHaveText('Graph tasks: 5')
    await expect(demo.getByRole('button', { name: /^Inspect ES / })).toBeVisible()
    expect(errors).toEqual([])
  })

  test('deleting another node keeps the toolbar on the selected target', async ({ page }) => {
    const { errors, node, toolbar, tasks } = await openToolbarDemo(page)
    await node('Inspect').click()
    await expect(toolbar).toBeVisible()
    const place = async () => {
      const [t, n] = await Promise.all([toolbar.boundingBox(), node('Inspect').boundingBox()])
      return Math.abs(t!.x + t!.width / 2 - (n!.x + n!.width / 2))
    }
    await expect.poll(place).toBeLessThan(6)
    // Focus Pack without selecting it, then delete it: only that unselected node is proposed.
    await node('Pack').focus()
    await node('Pack').press('Delete')
    await expect(tasks).toHaveText('Graph tasks: 4')
    await expect(node('Pack')).toHaveCount(0)
    await expect(toolbar).toBeVisible()
    await expect(toolbar).toContainText('Inspect')
    await expect.poll(place).toBeLessThan(6)
    expect(errors).toEqual([])
  })
})

test('large plan: only the visible window is fetched and scrolling loads more', async ({ page }) => {
  const { errors, demo, status, loaded, requests, timeline, count } = await openLargePlanDemo(page)
  await expect(status).toContainText('Loaded')
  await expect(timeline.getByRole('button', { name: /^Job 1 / }).first()).toBeVisible()
  const firstLoaded = await count(loaded)
  expect(firstLoaded).toBeGreaterThan(0)
  expect(firstLoaded).toBeLessThan(await count(demo.getByLabel('Total bars', { exact: true })))
  await expect(demo.getByRole('list', { name: 'Row load status' }).getByText('Line 0001: Loaded', { exact: true })).toBeVisible()
  // Collapsing an area re-reports the window: the lines of the next area come into view and are requested.
  const beforeCollapse = await count(requests)
  await timeline.getByRole('button', { name: 'Collapse Area 01', exact: true }).first().click()
  await expect.poll(() => count(requests)).toBeGreaterThan(beforeCollapse)
  await expect(status).toContainText('Loaded')
  await expect(demo.getByRole('list', { name: 'Row load status' }).getByText('Line 0021: Loaded', { exact: true })).toBeVisible()
  await expect(demo.getByRole('list', { name: 'Row load status' }).getByText('Line 0001: Loaded', { exact: true })).toHaveCount(0)
  await timeline.getByRole('button', { name: 'Expand Area 01', exact: true }).first().click()
  const firstRequests = await count(requests)
  // Scroll to later weeks and further down: new cells are requested and merged by ID.
  await timeline.evaluate(element => { element.scrollLeft = 4000; element.scrollTop = 48 * 66 })
  await expect.poll(() => count(requests)).toBeGreaterThan(firstRequests)
  await expect(status).toContainText('Loaded')
  // Line 0050 is a spare line: its cells loaded and are empty, which is not the same as not loaded.
  await expect(demo.getByRole('list', { name: 'Row load status' }).getByText('Line 0050: Loaded, no tasks in view', { exact: true })).toBeVisible()
  await expect.poll(() => count(loaded)).toBeGreaterThan(firstLoaded)
  await expect(demo.getByLabel('Visible window', { exact: true })).not.toHaveText(/^01-0/)
  // A new filter is another condition: the data is reloaded and holds only critical jobs.
  await demo.getByRole('combobox', { name: 'Filter' }).selectOption('critical')
  await expect(status).toContainText('Loaded')
  await expect.poll(() => count(loaded)).toBeLessThan(firstLoaded)
  expect(errors).toEqual([])
})

test('large plan: a failed window keeps the loaded bars and Retry loads it', async ({ page }) => {
  const { errors, demo, status, loaded, timeline, count } = await openLargePlanDemo(page)
  await expect(status).toContainText('Loaded')
  const before = await count(loaded)
  const retry = demo.getByRole('button', { name: 'Retry', exact: true })
  await expect(retry).toBeDisabled()
  await demo.getByRole('checkbox', { name: 'Data source fails' }).check()
  await timeline.evaluate(element => { element.scrollLeft = 6000 })
  await expect(status).toContainText('Failed to load')
  await expect(demo.getByRole('alert')).toContainText('The plan service is unavailable')
  // What was loaded before stays.
  expect(await count(loaded)).toBe(before)
  await expect(retry).toBeEnabled()
  await demo.getByRole('checkbox', { name: 'Data source fails' }).uncheck()
  await demo.getByRole('combobox', { name: 'Response time' }).selectOption('slow')
  await retry.click()
  await expect(status).toContainText('Loading')
  await expect(status).toContainText('Loaded', { timeout: 5000 })
  await expect(demo.getByRole('alert')).toHaveCount(0)
  await expect(retry).toBeDisabled()
  await expect.poll(() => count(loaded)).toBeGreaterThan(before)
  expect(errors).toEqual([])
})

test('large plan: neighbours load one hop at a time and dangling links wait for their ends', async ({ page }) => {
  const { errors, demo, count } = await openLargePlanDemo(page)
  const graph = demo.getByRole('img', { name: 'Neighbourhood graph' })
  const parts = demo.getByLabel('Loaded parts', { exact: true })
  const expand = demo.getByRole('button', { name: 'Expand neighbours', exact: true })
  await expect(parts).toHaveText('1')
  await expect(demo.getByLabel('Selected part', { exact: true })).toHaveText('Part 1')
  await expand.click()
  await expect(parts).toHaveText('4')
  await expect(expand).toBeDisabled()
  await expect(graph.getByRole('button', { name: 'Part 2', exact: true })).toBeVisible()
  expect(await count(demo.getByLabel('Pending links', { exact: true }))).toBeGreaterThan(0)
  // Expanding a neighbour adds only the parts not loaded yet.
  await graph.getByRole('button', { name: 'Part 2', exact: true }).click()
  await expect(demo.getByLabel('Selected part', { exact: true })).toHaveText('Part 2')
  await expect(expand).toBeEnabled()
  await expand.click()
  await expect.poll(() => count(parts)).toBeGreaterThan(4)
  await expect(graph.getByRole('button', { name: 'Part 3', exact: true })).toBeVisible()
  // An induced failure leaves the graph as it was.
  const loadedParts = await count(parts)
  await demo.getByRole('checkbox', { name: 'Data source fails' }).check()
  await graph.getByRole('button', { name: 'Part 3', exact: true }).click()
  await expand.click()
  await expect(demo.getByRole('alert')).toContainText('Could not load the neighbours of Part 3')
  expect(await count(parts)).toBe(loadedParts)
  await expect(expand).toBeEnabled()
  expect(errors).toEqual([])
})

test('large plan: with Keep positions when expanding, the parts already shown stay where they are on screen', async ({ page }) => {
  const { errors, demo, count } = await openLargePlanDemo(page)
  const graph = demo.getByRole('img', { name: 'Neighbourhood graph' })
  const parts = demo.getByLabel('Loaded parts', { exact: true })
  const expand = demo.getByRole('button', { name: 'Expand neighbours', exact: true })
  const part = (name: string) => graph.getByRole('button', { name, exact: true })
  const largestMove = demo.getByLabel('Largest move of shown parts', { exact: true })
  await graph.scrollIntoViewIfNeeded()
  await demo.getByRole('checkbox', { name: 'Keep positions when expanding' }).check()
  await expect(largestMove).toHaveText('none yet')
  await expand.click()
  await expect(parts).toHaveText('4')
  await expect(largestMove).toHaveText('0')
  await part('Part 2').click()
  await expect(demo.getByLabel('Selected part', { exact: true })).toHaveText('Part 2')
  const before = await Promise.all(['Part 1', 'Part 2'].map(async name => (await part(name).boundingBox())!))
  await expand.click()
  await expect.poll(() => count(parts)).toBeGreaterThan(4)
  await expect(part('Part 3')).toBeAttached()
  await expect(largestMove).toHaveText('0')
  const after = await Promise.all(['Part 1', 'Part 2'].map(async name => (await part(name).boundingBox())!))
  for (let i = 0; i < before.length; i++) {
    expect(after[i]!.x).toBeCloseTo(before[i]!.x, 1)
    expect(after[i]!.y).toBeCloseTo(before[i]!.y, 1)
    expect(after[i]!.width).toBeCloseTo(before[i]!.width, 1)
  }
  expect(errors).toEqual([])
})

test('the saved editing example saves JSON and reports it in Japanese', async ({ page }) => {
  const errors = pageErrors(page)
  const demo = await openExample(page, 'saved-editing', { locale: 'ja' })
  await expect(demo.getByRole('region', { name: '保存するタイムライン', exact: true })).toBeVisible()
  await demo.getByRole('button', { name: 'JSON を保存', exact: true }).click()
  await expect(demo.getByRole('status', { name: 'JSON の状態' })).toContainText('タスク 5 件と表示状態を JSON で保存しました')
  expect(errors).toEqual([])
})
