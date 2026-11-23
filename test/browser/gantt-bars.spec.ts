// GanttChart editing: bar selection, moves and resizes, dependencies and lag, progress, constraints, deletion and
// rejected proposals.
import {
  expect, test, centerOf, dragBy, ganttBar, graphZoom, openComponentFixture, openExample, openGanttFixture, openTimelineEditing, pageErrors,
  pressAndMove, pressAndMoveTo, releaseLine,
} from './support'

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
  await openExample(page, 'graph-and-gantt')
  await expect(page).toHaveTitle('Graph and Gantt basics | Vue Weave')
  await expect(page.getByRole('button', { name: `v${releaseLine}`, exact: true })).toBeVisible()
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

test('a move preview shifts the segments of a split bar and a resize preview draws it unsegmented', async ({ page }) => {
  const errors = pageErrors(page)
  await openExample(page, 'scheduling')
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
  await openExample(page, 'graph-and-gantt')
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
  await openExample(page, 'graph-and-gantt')
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

test('the timeline editing demo edits a bar and reports it in Japanese', async ({ page }) => {
  const errors = pageErrors(page)
  const demo = await openExample(page, 'timeline-editing', { locale: 'ja' })
  const chart = demo.getByRole('region', { name: '編集できるタイムライン', exact: true })
  await expect(chart).toBeVisible()
  await expect(demo.getByRole('button', { name: 'タイムラインの変更を元に戻す', exact: true })).toBeDisabled()
  await chart.getByRole('button', { name: /^ワイヤーフレーム / }).first().press('ArrowRight')
  await expect(demo.getByRole('status').filter({ hasText: 'ワイヤーフレーム →' })).toBeVisible()
  await expect(demo.getByRole('button', { name: 'タイムラインの変更を元に戻す', exact: true })).toBeEnabled()
  expect(errors).toEqual([])
})

test('background-click reports a click on an empty row or below the rows, but not bars, drags or the heading column', async ({ page }) => {
  const errors = pageErrors(page)
  const { chart, out } = await openGanttFixture(page, '')
  const clicks = out('Background clicks')
  const barA = chart.getByRole('button', { name: 'Task A 0–2', exact: true })
  const box = (await barA.boundingBox())!
  // 50 pixels per unit from the start of Task A at time 0.
  const at = (time: number) => box.x + time * 50
  await page.mouse.click(at(10), box.y + box.height / 2)
  await expect(clicks).toHaveText('{"time":10,"rowId":"r1"}')
  // A bar click selects without a background click; a drag on the background is not a click.
  await barA.click()
  await page.mouse.move(at(9), box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(at(11), box.y + box.height / 2, { steps: 4 })
  await page.mouse.up()
  await chart.getByText('Row 1', { exact: true }).click()
  await expect(clicks).toHaveText('{"time":10,"rowId":"r1"}')
  // Below the last row there is no row.
  const rowB = (await chart.getByRole('button', { name: 'Task B 4–6', exact: true }).boundingBox())!
  await page.mouse.click(at(10), rowB.y + rowB.height + 40)
  await expect(clicks).toHaveText('{"time":10,"rowId":"r1"};{"time":10}')
  expect(errors).toEqual([])
})
