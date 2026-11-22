// GanttChart editing: bar moves and resizes, dependencies, progress, constraints, deletion, menus, creation, row moves, columns, cell editing and file import.
import {
  expect, test, boxCenter, centerOf, dragBy, ganttBar, ganttRow, graphZoom, openComponentFixture, openDemo, openGanttFixture,
  openLinkedGanttFixture, openTimelineEditing, pageErrors, pressAndMove, pressAndMoveTo, releaseLine, touch, type LinkedFixture, type Page,
} from './support'

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

test('row hierarchy failures notify, cancel pending edits and recover on replacement data', async ({ page }) => {
  const errors = pageErrors(page)
  await openComponentFixture(page)
  const timeline = page.getByRole('region', { name: 'Timeline fixture', exact: true })
  const bar = timeline.getByRole('button', { name: 'Editable bar 1–3', exact: true })
  await expect(bar).toBeVisible()
  await pressAndMove(page, bar, 100, 0, 5)
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

test('selection, controlled edits, validation and cancellation', async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto('/gallery.html')
  await expect(page).toHaveTitle('Vue Weave — Examples')
  await expect(page.getByRole('link', { name: `Vue Weave ${releaseLine}`, exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Fit to view', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Zoom in', exact: true })).toHaveCount(2)
  await graphZoom(page).getByRole('button', { name: 'Zoom in', exact: true }).click()
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
  await pressAndMove(page, plan, 58, 0, 5)
  await page.getByRole('button', { name: 'Reset', exact: true }).dispatchEvent('click')
  await page.mouse.up()
  await expect(plan).toBeVisible()
  expect(errors).toEqual([])
})

test('timeline columns edit through validation and keep summary bars when collapsed', async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto('/gallery.html')
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
  expect(errors).toEqual([])
})

test('a move preview shifts the segments of a split bar and a resize preview draws it unsegmented', async ({ page }) => {
  const errors = pageErrors(page)
  await openDemo(page, 'Scheduling')
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
  await pressAndMove(page, box, 36, 0, 6)
  await expect(cutting).toHaveAttribute('aria-label', 'Cut order A 09 Nov 12:00–09 Nov 16:00')
  await expect(cutting).toHaveClass(/\bvw-is-dragging\b/)
  await expect(segments).toHaveCount(2)
  const during = await left()
  expect(during[0]! - before[0]!).toBeCloseTo(36, 0)
  expect(during[1]! - before[1]!).toBeCloseTo(36, 0)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(cutting).toHaveAttribute('aria-label', 'Cut order A 09 Nov 10:00–09 Nov 14:00')
  await expect(cutting).not.toHaveClass(/\bvw-is-dragging\b/)
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
  const errors = pageErrors(page)
  await page.setViewportSize({ width: 640, height: 900 })
  await page.goto('/gallery.html')
  const count = page.getByRole('status', { name: 'Select events', exact: true })
  const plan = page.getByRole('button', { name: 'Split · plan 09:00–11:00', exact: true })
  await expect(plan).toBeVisible()
  await expect(count).toHaveText('0')
  await plan.click()
  await expect(count).toHaveText('1')
  await dragBy(page, plan, 30, 0, { steps: 5 })
  await expect(count).toHaveText('2')
  await page.getByRole('button', { name: 'Reset', exact: true }).click()

  // Moving a focused bar far to the right keeps focus and scrolls it into view.
  const moving = ganttBar(page, 'Split · plan')
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
  const errors = pageErrors(page)
  await page.setViewportSize({ width: 640, height: 900 })
  await page.goto('/gallery.html')
  await page.getByRole('button', { name: 'Reset', exact: true }).click()
  const region = page.getByRole('region', { name: 'Gantt chart', exact: true })
  const bar = page.getByRole('button', { name: 'Split · plan 09:00–11:00', exact: true })
  // In a narrow viewport the bar can start below the fold (font metrics differ by platform); mouse input outside the
  // viewport reaches no element, so bring it into view before measuring.
  await bar.scrollIntoViewIfNeeded()
  const area = (await region.boundingBox())!
  const box = (await bar.boundingBox())!
  await pressAndMoveTo(page, box, { x: area.x + area.width - 10, y: box.y + box.height / 2 }, 8)
  await expect.poll(() => region.evaluate(el => el.scrollLeft)).toBeGreaterThan(50)
  await page.mouse.up()
  await expect(ganttBar(page, 'Split · plan')).not.toHaveAttribute('aria-label', 'Split · plan 09:00–11:00')
  expect(errors).toEqual([])
})

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
  await pressAndMoveTo(page, source, target, 10)
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
  const api = ganttBar(chart, 'Billing API')
  const ui = ganttBar(chart, 'Checkout UI')
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
  await dragBy(page, api, 58, 0)
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
  await pressAndMove(page, start, 0, -66, 6)
  await expect(chart.locator('.vw-gantt-bar.vw-is-dragging')).toHaveAttribute('style', /translateY\(-66px\)/)
  await page.keyboard.press('Escape')
  await page.mouse.up()
  await expect(chart.locator('.vw-gantt-bar.vw-is-dragging')).toHaveCount(0)
  await dragBy(page, start, 0, -66)
  await expect(status('Moved Acceptance tests to Web team.')).toBeVisible()
  await dragBy(page, ui, 0, 66)
  await expect(status('Only acceptance work can move to Quality.')).toBeVisible()
  expect(errors).toEqual([])
})

test('gantt keyboard row moves emit plain time ranges like pointer moves', async ({ page }) => {
  const errors = pageErrors(page)
  const { chart, out } = await openGanttFixture(page, '?rowDraggable=1')
  await chart.getByRole('button', { name: 'Task A 0–2', exact: true }).press('ArrowDown')
  await expect(out('Last edit')).not.toHaveText('')
  expect(JSON.parse((await out('Last edit').textContent())!)).toEqual({
    id: 'a', before: { start: 0, end: 2 }, after: { start: 0, end: 2 }, mode: 'move', source: 'keyboard', row: { before: 'r1', after: 'r2' },
  })
  expect(errors).toEqual([])
})

test('gantt: an ignored keyboard row move does not pull focus back on a later bars update', async ({ page }) => {
  const errors = pageErrors(page)
  const { chart, out } = await openGanttFixture(page, '?rowDraggable=1&cancels=1')
  await chart.getByRole('button', { name: 'Task A 0–2', exact: true }).press('ArrowDown')
  await expect(out('Last edit')).not.toHaveText('')
  // The parent ignored the move. Focus moves on, and new but equal bars arrive later.
  const replace = page.getByRole('button', { name: 'Replace bars', exact: true })
  await replace.press('Enter')
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await expect(replace).toBeFocused()
  expect(errors).toEqual([])
})

test('gantt: bar keys do not edit while a connection is armed, and a bar press does not start a drag then', async ({ page }) => {
  const errors = pageErrors(page)
  const { chart, out } = await openGanttFixture(page, '?cancels=1')
  const start = chart.getByRole('button', { name: 'Start dependency from finish of Task A', exact: true })
  await start.press('Enter')
  await expect(start).toHaveAttribute('aria-pressed', 'true')
  const taskB = chart.getByRole('button', { name: 'Task B 4–6', exact: true })
  await taskB.focus()
  await taskB.press('ArrowRight')
  await taskB.press('Shift+ArrowRight')
  await expect(out('Last edit')).toHaveText('')
  await pressAndMove(page, taskB, 80, 0, 4)
  await expect(taskB).not.toHaveClass(/\bvw-is-dragging\b/)
  await page.mouse.up()
  await expect(out('Last edit')).toHaveText('')
  // Escape disarms the connection; then the keys edit again.
  await taskB.press('Escape')
  await expect(out('Last edit cancel')).toHaveText('{"reason":"escape","barIds":["a"]}')
  await taskB.press('ArrowRight')
  await expect(out('Last edit')).toContainText('"source":"keyboard"')
  expect(errors).toEqual([])
})

test('gantt readonly keeps dependency selection but proposes no delete', async ({ page }) => {
  const errors = pageErrors(page)
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

test('gantt progress slider edits by pointer and keyboard, cancels with Escape and follows the visual direction', async ({ page }) => {
  const { errors, chart, status } = await openTimelineEditing(page)
  const api = chart.getByRole('button', { name: 'Billing API 10:00–13:00', exact: true })
  const slider = chart.getByRole('slider', { name: 'Progress of Billing API', exact: true })
  await expect(slider).toHaveAttribute('aria-valuetext', '30%')
  await expect(slider).toHaveAttribute('aria-valuenow', '30')
  const centre = () => centerOf(slider)
  // The slider sits on the progress boundary: 30% of the three-hour bar.
  let bar = (await api.boundingBox())!
  let handle = await centre()
  expect(Math.abs(handle.x - (bar.x + bar.width * 0.3))).toBeLessThanOrEqual(1)

  // A drag previews the fill and proposes the snapped value on release: 69 px of 345 px is 20%.
  await pressAndMove(page, handle, 69, 0, 6)
  await expect(slider).toHaveAttribute('aria-valuetext', '50%')
  await expect(api.locator('.vw-bar-progress')).toHaveAttribute('style', /width: 50%/)
  await page.mouse.up()
  await expect(status('Billing API progress 50%.')).toBeVisible()
  await expect(slider).toBeFocused()

  // Escape discards a drag preview without a proposal.
  handle = await centre()
  await pressAndMove(page, handle, 69, 0, 6)
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

test('gantt constraint markers describe their bars and their handles drag, snap and propose without applying', async ({ page }) => {
  const errors = pageErrors(page)
  const { chart, out } = await openGanttFixture(page, '?constraints=1')
  const json = async () => JSON.parse((await out('Last constraint edit').textContent()) || 'null')
  const barA = chart.getByRole('button', { name: 'Task A 0–2', exact: true })
  const barB = chart.getByRole('button', { name: 'Task B 4–6', exact: true })
  // Constraints are added to the description; the accessible names stay as before.
  await expect(barA).toHaveAccessibleDescription(/^Start no earlier than 0\. Finish no later than 3\. Arrow keys move/)
  await expect(barB).toHaveAccessibleDescription(/^Start no later than 5\. Finish no earlier than 7, violated\. Must start on 4\. Arrow keys move/)
  const finish = chart.getByRole('slider', { name: 'Finish no later than · Task A', exact: true })
  const violated = chart.getByRole('slider', { name: 'Finish no earlier than · Task B', exact: true })
  await expect(chart.getByRole('slider')).toHaveCount(5)
  await expect(finish).toHaveAttribute('aria-valuetext', '3')
  await expect(finish).toHaveAccessibleDescription(/^Arrow keys move the constraint by one snap step/)
  await expect(violated).toHaveAttribute('aria-valuetext', '7, violated')
  await expect(violated).toHaveClass(/vw-is-violated/)
  await expect(finish).not.toHaveClass(/vw-is-violated/)

  // The glyph is centred on its time: 50 px per unit from Task A's start.
  const a = (await barA.boundingBox())!
  const centre = () => centerOf(finish)
  let handle = await centre()
  expect(Math.abs(handle.x - (a.x + 150))).toBeLessThanOrEqual(1)
  // A drag previews the snapped time and proposes it once on release: 2.4 units snap to 2. Nothing is applied.
  await pressAndMove(page, handle, 120, 0, 6)
  await expect(finish).toHaveAttribute('aria-valuetext', '5')
  await expect(finish).toHaveClass(/vw-is-dragging/)
  await expect(barA).toHaveAccessibleDescription(/Finish no later than 5\./)
  await page.mouse.up()
  expect(await json()).toEqual({ id: 'a', kind: 'finishNoLaterThan', before: 3, after: 5, source: 'pointer' })
  await expect(out('Constraint edits')).toHaveText('1')
  await expect(finish).toHaveAttribute('aria-valuetext', '3')
  await expect(finish).toBeFocused()
  // A drag is clamped to editBounds (here the range, from 0).
  handle = await centre()
  await dragBy(page, handle, -400, 0)
  expect(await json()).toMatchObject({ after: 0, source: 'pointer' })

  // Escape ends a drag without a proposal.
  handle = await centre()
  await pressAndMove(page, handle, 120, 0, 6)
  await expect(finish).toHaveAttribute('aria-valuetext', '5')
  await page.keyboard.press('Escape')
  await expect(finish).toHaveAttribute('aria-valuetext', '3')
  await page.mouse.up()
  await expect(out('Constraint edits')).toHaveText('2')

  // Keys propose one step each from the current value: arrows by snap, Shift and Page keys by the tick step, Home and
  // End to the bounds, Delete removes the constraint. Alt is left to the page.
  const keys: [string, number | undefined][] = [
    ['ArrowRight', 4], ['ArrowLeft', 2], ['ArrowUp', 4], ['ArrowDown', 2], ['Shift+ArrowRight', 4], ['PageDown', 2],
    ['Home', 0], ['End', 200], ['Delete', undefined],
  ]
  for (const [key, after] of keys) {
    await finish.press(key)
    expect(await json()).toEqual({ id: 'a', kind: 'finishNoLaterThan', before: 3, ...(after === undefined ? {} : { after }), source: 'keyboard' })
  }
  await expect(out('Constraint edits')).toHaveText(String(2 + keys.length))
  await finish.press('Alt+ArrowRight')
  await expect(out('Constraint edits')).toHaveText(String(2 + keys.length))

  // Decorative markers without the prop, and nothing to focus in a readonly chart.
  for (const search of ['?constraints=1&display=1', '?constraints=1&readonly=1']) {
    const { chart } = await openGanttFixture(page, search)
    await expect(chart.getByRole('slider')).toHaveCount(0)
    await expect(chart.locator('.vw-gantt-constraint')).toHaveCount(5)
    await expect(chart.locator('.vw-gantt-constraint[aria-hidden="true"]')).toHaveCount(5)
    await expect(chart.locator('.vw-gantt-constraint.vw-is-violated')).toHaveCount(1)
    await expect(chart.locator('.vw-gantt-constraint').first()).toBeVisible()
  }
  expect(errors).toEqual([])
})

test('gantt: a blank rejection reason rejects with the default text', async ({ page }) => {
  const errors = pageErrors(page)
  const { chart, out } = await openGanttFixture(page, '?blankReject=1')
  const live = chart.locator('xpath=..').locator('[aria-live="polite"]')
  await chart.getByRole('button', { name: 'Task A 0–2', exact: true }).press('ArrowRight')
  await expect(out('Last rejection')).toHaveText('edit a: This change was rejected.')
  await expect(live).toHaveText('This change was rejected.')
  await expect(out('Last edit')).toHaveText('')
  await chart.getByRole('button', { name: 'Start dependency from finish of Task B', exact: true }).press('Enter')
  await chart.getByRole('button', { name: 'Connect dependency to start of Task A', exact: true }).press('Enter')
  await expect(out('Last rejection')).toHaveText('connect b: This dependency was rejected.')
  await expect(live).toHaveText('This dependency was rejected.')
  await expect(out('Connections')).toHaveText('0')
  expect(errors).toEqual([])
})

test('gantt constraint edits are applied by the parent, rejected through the validator and mirrored right to left', async ({ page }) => {
  const errors = pageErrors(page)
  // The validator rejects: the reason is announced and nothing is proposed.
  let { chart, out } = await openGanttFixture(page, '?constraints=1&rejectConstraints=1')
  const live = chart.locator('xpath=..').locator('[aria-live="polite"]')
  const locked = chart.getByRole('slider', { name: 'Finish no later than · Task A', exact: true })
  await locked.press('ArrowRight')
  await expect(live).toHaveText('Constraints are locked in this test.')
  await dragBy(page, locked, 100, 0, { steps: 5 })
  await expect(out('Constraint edits')).toHaveText('0')
  await expect(locked).toHaveAttribute('aria-valuetext', '3')

  // The parent applies each proposal with applyTimelineConstraintEdit.
  ;({ chart, out } = await openGanttFixture(page, '?constraints=1&apply=1'))
  const barB = chart.getByRole('button', { name: 'Task B 4–6', exact: true })
  const violated = chart.getByRole('slider', { name: 'Finish no earlier than · Task B', exact: true })
  await violated.press('ArrowLeft')
  await expect(violated).toHaveAttribute('aria-valuetext', '6')
  await expect(violated).not.toHaveClass(/vw-is-violated/)
  await expect(violated).toBeFocused()
  await expect(barB).toHaveAccessibleDescription(/Finish no earlier than 6\. Must start on 4\./)
  await violated.press('ArrowRight')
  await expect(violated).toHaveAttribute('aria-valuetext', '7, violated')
  // Delete removes it; focus returns to the bar.
  await violated.press('Delete')
  await expect(violated).toHaveCount(0)
  await expect(barB).toBeFocused()
  await expect(barB).toHaveAccessibleDescription(/^Start no later than 5\. Must start on 4\. Arrow keys move/)
  // A pointer drag on the fixed start moves it; the bar itself stays where it is and the constraint is violated.
  const fixed = chart.getByRole('slider', { name: 'Must start on · Task B', exact: true })
  const box = (await fixed.boundingBox())!
  await dragBy(page, box, 52, 0, { steps: 5 })
  await expect(fixed).toHaveAttribute('aria-valuetext', '5, violated')
  await expect(barB).toBeVisible()

  // Right to left: later times are to the left, for the pointer and for the arrow keys.
  ;({ chart, out } = await openGanttFixture(page, '?constraints=1&rtl=1'))
  const json = async () => JSON.parse((await out('Last constraint edit').textContent()) || 'null')
  const finish = chart.getByRole('slider', { name: 'Finish no later than · Task A', exact: true })
  const a = (await chart.getByRole('button', { name: 'Task A 0–2', exact: true }).boundingBox())!
  const handle = (await finish.boundingBox())!
  expect(Math.abs(handle.x + handle.width / 2 - (a.x + a.width - 150))).toBeLessThanOrEqual(1)
  await dragBy(page, handle, -100, 0, { steps: 5 })
  expect(await json()).toEqual({ id: 'a', kind: 'finishNoLaterThan', before: 3, after: 5, source: 'pointer' })
  await finish.press('ArrowLeft')
  expect(await json()).toMatchObject({ after: 4, source: 'keyboard' })
  await finish.press('ArrowRight')
  expect(await json()).toMatchObject({ after: 2, source: 'keyboard' })
  // The flag of an upper bound points to earlier times: to the right in this chart.
  const flag = await finish.evaluate(element => {
    const box = element.getBoundingClientRect()
    const head = getComputedStyle(element, '::before')
    return { scale: getComputedStyle(element).scale, headLeft: parseFloat(head.left), width: box.width }
  })
  expect(flag).toEqual({ scale: '-1 1', headLeft: 0, width: 26 })
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
  // The demo navigation wraps onto more lines at this width, so bring the chart on screen before measuring.
  await chart.scrollIntoViewIfNeeded()
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

test('gantt context-menu, progress and delete proposals carry exact targets, times and rows in both directions', async ({ page }) => {
  const errors = pageErrors(page)
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

test('gantt rows indent, outdent and move by keyboard with validation, focus return and undo', async ({ page }) => {
  const { errors, chart, status } = await openTimelineEditing(page)
  await expect(chart.getByRole('button', { name: /^Move row / })).toHaveCount(0)
  await expect(chart.locator('.vw-extra-column')).toHaveCount(0)
  await page.getByRole('checkbox', { name: 'Reorder rows', exact: true }).check()
  const handle = (label: string) => chart.getByRole('button', { name: 'Move row ' + label, exact: true })
  const wbs = (label: string) => ganttRow(chart, label).locator('.vw-extra-column')
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
  await expect(ganttRow(chart, 'Quality').getByRole('button', { name: 'Acceptance tests 14:00–16:00', exact: true })).toBeVisible()

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
  const wbs = (label: string) => ganttRow(chart, label).locator('.vw-extra-column')
  const indicator = chart.locator('.vw-gantt-row-drop')
  const product = (await handle('Product team').boundingBox())!
  const web = (await ganttRow(chart, 'Web team').boundingBox())!
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
  const child = (await ganttRow(chart, 'Web team').boundingBox())!
  await pressAndMoveTo(page, platform, { x: platform.x + platform.width / 2, y: child.y + child.height * 0.3 }, 8)
  await expect(indicator).toHaveCount(0)
  await page.mouse.up()
  await expect(wbs('Platform team')).toHaveText('1')
  await page.getByRole('button', { name: 'Undo timeline change', exact: true }).click()
  await expect(wbs('Product team')).toHaveText('1')
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
  const { x, y } = boxCenter(box)
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 60, y, { steps: 6 })
  await expect(team).toHaveAttribute('aria-valuenow', '198')
  await expect(team).toHaveClass(/\bvw-is-active\b/)
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
  await dragBy(page, team, -30, 0, { steps: 5 })
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

test('the timeline editing demo imports a Microsoft Project XML file as one undoable step and reports invalid files', async ({ page }) => {
  const { errors, chart, status } = await openTimelineEditing(page)
  const input = page.getByLabel('Import MS Project XML', { exact: true })
  await input.focus()
  await expect(input).toBeFocused()
  const xml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Project xmlns="http://schemas.microsoft.com/project"><Name>Line retrofit</Name><Tasks>
<Task><UID>0</UID><Name>Line retrofit</Name><OutlineLevel>0</OutlineLevel><Start>2026-11-09T09:00:00</Start><Finish>2026-11-09T13:00:00</Finish></Task>
<Task><UID>1</UID><Name>Retrofit</Name><OutlineLevel>1</OutlineLevel><Summary>1</Summary><Start>2026-11-09T09:00:00</Start><Finish>2026-11-09T13:00:00</Finish></Task>
<Task><UID>2</UID><Name>Strip &amp; clean</Name><OutlineLevel>2</OutlineLevel><Start>2026-11-09T09:00:00</Start><Finish>2026-11-09T11:00:00</Finish><PercentComplete>50</PercentComplete></Task>
<Task><UID>3</UID><Name>Rewire</Name><OutlineLevel>2</OutlineLevel><Start>2026-11-09T11:00:00</Start><Finish>2026-11-09T13:00:00</Finish>
  <PredecessorLink><PredecessorUID>2</PredecessorUID><Type>1</Type></PredecessorLink>
  <PredecessorLink><PredecessorUID>9</PredecessorUID><Type>1</Type></PredecessorLink></Task>
<Task><UID>4</UID><Name>Handover</Name><OutlineLevel>1</OutlineLevel><Milestone>1</Milestone><Start>2026-11-09T13:00:00</Start><Finish>2026-11-09T13:00:00</Finish>
  <PredecessorLink><PredecessorUID>3</PredecessorUID><Type>1</Type></PredecessorLink></Task>
</Tasks></Project>`
  await input.setInputFiles({ name: 'retrofit.xml', mimeType: 'application/xml', buffer: Buffer.from(xml) })
  await expect(status('Imported 3 tasks and 2 dependencies from retrofit.xml with 1 warning.')).toBeVisible()
  await expect(chart.getByRole('button', { name: 'Strip & clean 09:00–11:00', exact: true })).toBeVisible()
  const rewire = chart.getByRole('button', { name: 'Rewire 11:00–13:00', exact: true })
  await expect(rewire).toBeVisible()
  await expect(chart.getByRole('button', { name: 'Handover 13:00–13:00', exact: true })).toBeVisible()
  await expect(chart.getByRole('button', { name: /^Wireframes / })).toHaveCount(0)
  // The summary task is a parent row without a bar of its own.
  await expect(chart.getByRole('button', { name: 'Collapse Retrofit', exact: true })).toBeVisible()
  await expect(chart.getByRole('button', { name: /^Retrofit / })).toHaveCount(0)
  await expect(chart.getByRole('button', { name: 'Select dependency Strip & clean → Rewire FS', exact: true })).toBeVisible()
  await expect(chart.getByRole('button', { name: 'Select dependency Rewire → Handover FS', exact: true })).toBeVisible()

  // Imported bars are editable like the others.
  await rewire.press('ArrowRight')
  await expect(chart.getByRole('button', { name: 'Rewire 11:15–13:15', exact: true })).toBeVisible()

  // An invalid file names the line and column and leaves the timeline unchanged.
  await input.setInputFiles({ name: 'bad.xml', mimeType: 'application/xml', buffer: Buffer.from('<Project>\n<Name>Plan &nbsp;</Name></Project>') })
  await expect(status('Import failed: Invalid XML at line 2, column 12: unknown or invalid entity &nbsp;')).toBeVisible()
  await input.setInputFiles({ name: 'book.xml', mimeType: 'application/xml', buffer: Buffer.from('<Workbook/>') })
  await expect(status('Import failed: Not a Microsoft Project XML document: the root element is Workbook')).toBeVisible()
  await expect(chart.getByRole('button', { name: 'Rewire 11:15–13:15', exact: true })).toBeVisible()

  // Undo restores the edit and then the previous plan.
  const undo = page.getByRole('button', { name: 'Undo timeline change', exact: true })
  await undo.click()
  await expect(rewire).toBeVisible()
  await undo.click()
  await expect(chart.getByRole('button', { name: 'Wireframes 08:00–10:00', exact: true })).toBeVisible()
  await expect(rewire).toHaveCount(0)
  expect(errors).toEqual([])
})

test('gantt dependency lag is labelled between the bars, describes the dependency and survives a reconnect', async ({ page }) => {
  const errors = pageErrors(page)
  for (const rtl of [false, true]) {
    const { chart, out } = await openGanttFixture(page, '?lag=1&interactions=1' + (rtl ? '&rtl=1' : ''))
    const label = chart.locator('.vw-gantt-lag')
    await expect(label).toHaveText('+2 u')
    await expect(label).toBeVisible()
    // The name is unchanged; the lag is the description.
    const link = chart.getByRole('button', { name: 'Select dependency Task A → Task B FS', exact: true })
    await expect(link).toHaveAccessibleDescription('Lag +2 u')
    // The label sits between the two bars and overlaps neither, also when the layer is mirrored.
    const [a, b, text] = await Promise.all([
      chart.getByRole('button', { name: 'Task A 0–2', exact: true }).boundingBox(),
      chart.getByRole('button', { name: 'Task B 4–6', exact: true }).boundingBox(),
      label.boundingBox(),
    ])
    const overlaps = (p: typeof a, q: typeof a) => p!.x < q!.x + q!.width && q!.x < p!.x + p!.width && p!.y < q!.y + q!.height && q!.y < p!.y + p!.height
    expect(overlaps(text, a) || overlaps(text, b)).toBe(false)
    if (rtl) expect(text!.x + text!.width).toBeLessThan(a!.x)
    else expect(text!.x).toBeGreaterThan(a!.x + a!.width)
    // The text is not mirrored: its glyphs advance in reading order on screen.
    expect(await label.evaluate(element => {
      const text = element as SVGTextElement
      const first = text.getStartPositionOfChar(0), last = text.getStartPositionOfChar(text.getNumberOfChars() - 1)
      const matrix = text.getScreenCTM()!
      return new DOMPoint(last.x, last.y).matrixTransform(matrix).x - new DOMPoint(first.x, first.y).matrixTransform(matrix).x
    })).toBeGreaterThan(0)
    // The SVG export draws the same label.
    expect(await page.evaluate(() => (window as any).ganttChart.value.exportSvg())).toMatch(/<text class="vw-gantt-lag"[^>]*>\+2 u<\/text>/)

    // Reconnecting keeps the lag in both connections; a new dependency has none.
    await link.press('Enter')
    await chart.getByRole('button', { name: 'Reconnect target of Task A → Task B FS', exact: true }).press('Enter')
    await chart.getByRole('button', { name: 'Connect dependency to finish of Task B', exact: true }).press('Enter')
    expect(JSON.parse((await out('Last reconnect').textContent())!)).toEqual({
      id: 'ab', before: { from: 'a', to: 'b', type: 'FS', lag: 2 }, after: { from: 'a', to: 'b', type: 'FF', lag: 2 },
    })
    await chart.getByRole('button', { name: 'Start dependency from finish of Task B', exact: true }).press('Enter')
    await chart.getByRole('button', { name: 'Connect dependency to start of Task A', exact: true }).press('Enter')
    expect(JSON.parse((await out('Last connection').textContent())!)).toEqual({ from: 'b', to: 'a', type: 'FS' })
    // The app edits a lag through its own UI; the dependency events carry the ID to look it up.
    await link.press('Shift+F10')
    expect(JSON.parse((await out('Last context menu').textContent())!).target).toEqual({ kind: 'dependency', id: 'ab' })
  }
  expect(errors).toEqual([])
})

test('gantt droppable reports external drops with row and time and writes nothing', async ({ page }) => {
  const errors = pageErrors(page)
  const { chart, json } = await openLinkedGanttFixture(page)
  const box = (await chart.getByRole('button', { name: 'Task B 8–12', exact: true }).boundingBox())!
  const accepted = await chart.evaluate((element, point) => {
    const target = document.elementFromPoint(point.x, point.y)!
    const dataTransfer = new DataTransfer()
    dataTransfer.setData('text/plain', 'backlog-7')
    const over = new DragEvent('dragover', { bubbles: true, cancelable: true, clientX: point.x, clientY: point.y, dataTransfer })
    target.dispatchEvent(over)
    target.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, clientX: point.x, clientY: point.y, dataTransfer }))
    return over.defaultPrevented && element.contains(target)
  }, { x: box.x + box.width + 40, y: box.y + box.height / 2 })
  expect(accepted).toBe(true)
  await expect.poll(() => json('Last drop')).toEqual({ time: 14, rowId: 'r2', text: 'backlog-7' })
  await expect(chart.getByRole('button', { name: /backlog/ })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('gantt typed field cells edit through the cell-editor slot with keyboard commit, cancel and focus return', async ({ page }) => {
  const errors = pageErrors(page)
  const { chart, out, json } = await openLinkedGanttFixture(page)
  const cell = chart.getByRole('button', { name: 'Row 1 · Effort 3', exact: true })
  const editor = chart.getByRole('textbox', { name: 'Effort editor', exact: true })
  await cell.focus()
  await page.keyboard.press('Enter')
  await expect(editor).toBeFocused()
  await editor.fill('abc')
  await editor.press('Enter')
  await expect(chart.getByRole('alert')).toHaveText(/Not a number/)
  await expect(editor).toBeFocused()
  await editor.fill('13')
  await editor.press('Enter')
  await expect(chart.getByRole('alert')).toHaveText('Thirteen is not allowed')
  await editor.fill('5')
  await editor.press('Enter')
  await expect(cell).toBeFocused()
  await expect.poll(() => json('Last field edit')).toEqual({ rowId: 'r1', columnId: 'effort', fieldId: 'effort', before: 3, after: 5, source: 'keyboard' })
  await expect(out('Field edits')).toHaveText('1')

  await page.keyboard.press('F2')
  await expect(editor).toBeFocused()
  await editor.fill('8')
  await editor.press('Escape')
  await expect(cell).toBeFocused()
  await expect(out('Field edits')).toHaveText('1')
  await expect.poll(() => json('Last cancel')).toEqual({ reason: 'escape', barIds: [], cell: { rowId: 'r1', columnId: 'effort' } })
  expect(errors).toEqual([])
})

test('gantt built-in field input parses the text and emits field-edit only', async ({ page }) => {
  const errors = pageErrors(page)
  const { chart, out, json } = await openLinkedGanttFixture(page, '?builtin')
  const input = chart.getByRole('textbox', { name: 'Row 2 · Effort', exact: true })
  await expect(input).toHaveValue('')
  await input.fill('-1')
  await input.press('Enter')
  await expect(input).toHaveAttribute('aria-invalid', 'true')
  await expect(out('Field edits')).toHaveText('0')
  await input.press('Escape')
  await expect(input).toHaveValue('')
  await expect(input).not.toHaveAttribute('aria-invalid', 'true')
  await input.fill('0')
  await input.press('Enter')
  await expect(input).toBeFocused()
  await expect.poll(() => json('Last field edit')).toEqual({ rowId: 'r2', columnId: 'effort', fieldId: 'effort', before: null, after: 0, source: 'keyboard' })
  expect(errors).toEqual([])
})

/**
 * Dispatch a keydown that an input method composition produces: `isComposing`, or the keyCode 229 that some browsers
 * send for the key that ends a composition. Returns whether a handler prevented its default action.
 */
async function compositionKey(target: ReturnType<Page['getByRole']>, key: 'Enter' | 'Escape', legacy = false) {
  return target.evaluate((element, { key, legacy }) => {
    const event = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, isComposing: !legacy })
    if (legacy) Object.defineProperty(event, 'keyCode', { value: 229 })
    element.dispatchEvent(event)
    return event.defaultPrevented
  }, { key, legacy })
}

test('gantt cell inputs leave Enter and Escape of an input method composition to the input method', async ({ page }) => {
  const errors = pageErrors(page)
  const { chart, out, json } = await openLinkedGanttFixture(page, '?builtin')
  const input = chart.getByRole('textbox', { name: 'Row 2 · Effort', exact: true })
  await input.fill('12')
  for (const legacy of [false, true]) {
    expect(await compositionKey(input, 'Enter', legacy)).toBe(false)
    expect(await compositionKey(input, 'Escape', legacy)).toBe(false)
  }
  await expect(input).toHaveValue('12')
  await expect(input).toBeFocused()
  await expect(out('Field edits')).toHaveText('0')
  // Only a later Enter outside the composition commits.
  await input.press('Enter')
  await expect.poll(() => json('Last field edit')).toEqual({ rowId: 'r2', columnId: 'effort', fieldId: 'effort', before: null, after: 12, source: 'keyboard' })
  await expect(out('Field edits')).toHaveText('1')

  // A cell-editor slot stays open on a composition's Escape.
  const { chart: slotted, out: slottedOut } = await openLinkedGanttFixture(page)
  await slotted.getByRole('button', { name: 'Row 1 · Effort 3', exact: true }).click()
  const editor = slotted.getByRole('textbox', { name: 'Effort editor', exact: true })
  await expect(editor).toBeFocused()
  await editor.fill('4')
  expect(await compositionKey(editor, 'Escape')).toBe(false)
  expect(await compositionKey(editor, 'Escape', true)).toBe(false)
  await expect(editor).toBeFocused()
  await expect(editor).toHaveValue('4')
  await expect(slottedOut('Cancels')).toHaveText('0')
  await editor.press('Escape')
  await expect(slottedOut('Cancels')).toHaveText('1')
  expect(errors).toEqual([])
})

test('gantt plain cell inputs keep composed text on Enter and Escape of an input method', async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto('/gallery.html')
  await page.getByLabel('Planning overlays').check()
  const input = page.getByRole('textbox', { name: 'Cutting station · Resource note', exact: true })
  await expect(input).toHaveValue('Machine 01')
  await input.fill('Machine 01 かこう')
  expect(await compositionKey(input, 'Enter')).toBe(false)
  expect(await compositionKey(input, 'Escape', true)).toBe(false)
  await expect(input).toBeFocused()
  await expect(input).toHaveValue('Machine 01 かこう')
  await input.press('Escape')
  await expect(input).toHaveValue('Machine 01')
  expect(errors).toEqual([])
})

test('a typed cell drops its parse error when its source value changes outside the props', async ({ page }) => {
  const errors = pageErrors(page)
  const { chart, out } = await openLinkedGanttFixture(page, '?builtin')
  const effort = chart.getByRole('textbox', { name: 'Row 2 · Effort', exact: true })
  await effort.fill('oops')
  await effort.press('Enter')
  await expect(effort).toHaveAttribute('aria-invalid', 'true')
  await page.evaluate(() => (window as unknown as { linkedFixture: LinkedFixture }).linkedFixture.setExternalEffort('r2', 2))
  await expect(effort).toHaveValue('2')
  await expect(effort).not.toHaveAttribute('aria-invalid', 'true')
  // The cell edits normally again.
  await effort.fill('3')
  await effort.press('Enter')
  await expect(effort).not.toHaveAttribute('aria-invalid', 'true')
  await expect(out('Field edits')).toHaveText('1')
  expect(errors).toEqual([])
})

test('gantt cell inputs keep typed and composed text through re-renders until commit or cancel', async ({ page }) => {
  const errors = pageErrors(page)
  const { chart, out, json } = await openLinkedGanttFixture(page, '?builtin&plain')
  const fixture = (action: 'rerender' | 'note' | 'effort') => page.evaluate(action => {
    const linked = (window as unknown as { linkedFixture: LinkedFixture }).linkedFixture
    if (action === 'rerender') linked.rerender()
    else if (action === 'note') linked.setRowData('r1', { note: 'Changed' })
    else linked.setRowData('r2', { effort: 7 })
  }, action)

  // Plain cell: composed text survives the composition's Enter and a re-render; a later Enter commits it.
  const note = chart.getByRole('textbox', { name: 'Row 1 · Note', exact: true })
  await expect(note).toHaveValue('Machine 01')
  await note.fill('Machine 01 かこう')
  expect(await compositionKey(note, 'Enter')).toBe(false)
  await fixture('rerender')
  await expect(note).toHaveValue('Machine 01 かこう')
  await expect(note).toBeFocused()
  await expect(out('Cell edits')).toHaveText('0')
  await note.press('Enter')
  await expect.poll(() => json('Last cell edit')).toEqual({ rowId: 'r1', columnId: 'note', before: 'Machine 01', after: 'Machine 01 かこう' })
  await expect(note).toHaveValue('Machine 01 かこう')
  // Escape after a re-render restores the source text.
  await note.fill('Draft')
  await fixture('rerender')
  await expect(note).toHaveValue('Draft')
  await note.press('Escape')
  await expect(note).toHaveValue('Machine 01 かこう')
  await expect(out('Cell edits')).toHaveText('1')
  // New source text for the cell discards the draft.
  await note.fill('Other')
  await fixture('note')
  await expect(note).toHaveValue('Changed')
  await fixture('rerender')
  await expect(note).toHaveValue('Changed')
  await note.press('Enter')
  await expect(out('Cell edits')).toHaveText('1')

  // Typed field input: the same for composed text, and unreadable text stays for correction through re-renders.
  const effort = chart.getByRole('textbox', { name: 'Row 2 · Effort', exact: true })
  await effort.fill('12')
  expect(await compositionKey(effort, 'Enter')).toBe(false)
  await fixture('rerender')
  await expect(effort).toHaveValue('12')
  await effort.fill('twelve')
  await effort.press('Enter')
  await expect(effort).toHaveAttribute('aria-invalid', 'true')
  await fixture('rerender')
  await expect(effort).toHaveValue('twelve')
  await expect(effort).toHaveAttribute('aria-invalid', 'true')
  await effort.press('Escape')
  await expect(effort).toHaveValue('')
  await expect(effort).not.toHaveAttribute('aria-invalid', 'true')
  await effort.fill('12')
  await fixture('rerender')
  await effort.press('Enter')
  await expect.poll(() => json('Last field edit')).toEqual({ rowId: 'r2', columnId: 'effort', fieldId: 'effort', before: null, after: 12, source: 'keyboard' })
  // New source data for the field discards the draft.
  await effort.fill('5')
  await fixture('effort')
  await expect(effort).toHaveValue('7')
  await fixture('rerender')
  await expect(effort).toHaveValue('7')
  await expect(out('Field edits')).toHaveText('1')
  expect(errors).toEqual([])
})

test('gantt built-in field input ends an unedited commit without a proposal and reads choice labels back', async ({ page }) => {
  const errors = pageErrors(page)
  const { chart, out, json } = await openLinkedGanttFixture(page, '?builtin')
  const stage = chart.getByRole('textbox', { name: 'Row 1 · Stage', exact: true })
  await expect(stage).toHaveValue('Machining, Inspection')
  await stage.press('Enter')
  await expect(stage).not.toHaveAttribute('aria-invalid', 'true')
  await expect(out('Field edits')).toHaveText('0')
  await stage.fill('Inspection, "Cut, weld"')
  await stage.press('Enter')
  await expect.poll(() => json('Last field edit')).toEqual({ rowId: 'r1', columnId: 'stage', fieldId: 'stage', before: [1, 2], after: [2, 3], source: 'keyboard' })
  await stage.fill('Machining, Painting')
  await stage.press('Enter')
  await expect(stage).toHaveAttribute('aria-invalid', 'true')
  await expect(out('Field edits')).toHaveText('1')
  expect(errors).toEqual([])
})

test('gantt edit-cancel reports gestures and cell editors cancelled by new source data', async ({ page }) => {
  const errors = pageErrors(page)
  const { chart, out, json } = await openLinkedGanttFixture(page)
  const taskB = chart.getByRole('button', { name: 'Task B 8–12', exact: true })
  await pressAndMove(page, taskB, 40, 0, 4)
  const dragged = chart.locator('[data-vw-bar="b"]')
  await expect(dragged).toHaveClass(/\bvw-is-dragging\b/)
  await page.evaluate(() => (window as unknown as { linkedFixture: LinkedFixture }).linkedFixture.replaceBars())
  await expect(out('Cancels')).toHaveText('1')
  expect(await json('Last cancel')).toEqual({ reason: 'source-changed', barIds: ['b'] })
  await page.mouse.up()
  await expect(out('Edits')).toHaveText('0')

  await chart.getByRole('button', { name: 'Row 1 · Effort 3', exact: true }).click()
  await expect(chart.getByRole('textbox', { name: 'Effort editor', exact: true })).toBeFocused()
  await page.getByRole('button', { name: 'Replace rows', exact: true }).click()
  await expect(out('Cancels')).toHaveText('2')
  expect(await json('Last cancel')).toEqual({ reason: 'source-changed', barIds: [], cell: { rowId: 'r1', columnId: 'effort' } })
  await expect(chart.getByRole('textbox', { name: 'Effort editor', exact: true })).toHaveCount(0)
  expect(errors).toEqual([])
})
