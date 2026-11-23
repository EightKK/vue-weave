// The scheduling demo (calendars, constraints, status date, exports, network view, manual tasks, summary links, actuals, scenarios) and resource planning.
import { expect, test, dragBy, dragTo, openExample, pageErrors, pressAndMove, pressAndMoveTo, type Locator, type Page } from './support'

async function openResourcePlanning(page: Page) {
  const errors = pageErrors(page)
  await openExample(page, 'resource-planning')
  const chart = page.getByRole('region', { name: 'Resource plan', exact: true })
  await expect(chart).toBeVisible()
  return { errors, chart, notice: page.getByRole('status', { name: 'Planning notice', exact: true }), summary: page.getByRole('status', { name: 'Plan summary', exact: true }) }
}

async function openServerPlanning(page: Page) {
  const context = await openResourcePlanning(page)
  await page.getByRole('checkbox', { name: 'Save through the mock server', exact: true }).check()
  const saveStatus = page.getByRole('status', { name: 'Save status', exact: true })
  await expect(saveStatus).toContainText('Accepted version v1')
  return {
    ...context, saveStatus,
    server: (label: string) => page.getByRole('radio', { name: label, exact: true }),
    serverState: page.getByText(/^Server version v\d+ · \d+ commits$/),
    undo: page.getByRole('button', { name: 'Undo planning change', exact: true }),
    redo: page.getByRole('button', { name: 'Redo planning change', exact: true }),
  }
}

/** Everything a planner sees of the accepted plan: every projected bar, every load segment and B's assignments. */
async function planState(page: Page, chart: Locator) {
  const names = (locator: Locator) => locator.evaluateAll(elements => elements.map(element => element.getAttribute('aria-label') ?? '').sort())
  const assigned = page.getByRole('group', { name: 'Assignments of Mold B', exact: true }).getByRole('button', { name: /^Unassign / })
  await expect(assigned.first()).toBeVisible()
  return {
    bars: await names(chart.getByRole('button', { name: / · (Press 1|Press 2|Crew) \d\d:\d\d–\d\d:\d\d/ })),
    load: await names(chart.getByRole('img', { name: /: load \d/ })),
    assignments: await assigned.allTextContents(),
  }
}

const centreY = async (locator: Locator) => { const box = (await locator.boundingBox())!; return box.y + box.height / 2 }

test('the scheduling demo compares two baseline sets, toggles them through baselineIds and exports them', async ({ page }) => {
  const errors = pageErrors(page)
  await openExample(page, 'scheduling')
  const plan = page.getByRole('region', { name: 'Gantt chart', exact: true }).first()
  const cutting = plan.getByRole('button', { name: 'Cut order A 09 Nov 08:00–09 Nov 11:00', exact: true })
  // By default the single original-plan baseline is drawn as before.
  await expect(plan.locator('.vw-gantt-baseline')).toHaveCount(4)
  await expect(plan.locator('[data-vw-baseline]')).toHaveCount(0)
  const fullHeight = (await cutting.boundingBox())!.height

  await page.getByRole('checkbox', { name: 'Compare baseline sets', exact: true }).check()
  const sets = page.getByRole('group', { name: 'Baseline sets', exact: true })
  const original = plan.locator('[data-vw-baseline="plan"]')
  const revised = plan.locator('[data-vw-baseline="rev1"]')
  await expect(original).toHaveCount(4)
  await expect(revised).toHaveCount(4)
  // The name is unchanged; both sets and their variance are in the description.
  await expect(cutting).toHaveAccessibleDescription(new RegExp('^Critical\\. Float until 09 Nov 11:00\\. '
    + 'Original plan 09 Nov 08:00–09 Nov 11:00: start \\+0 h, finish \\+0 h, duration \\+0 h\\. '
    + 'Revision 1 09 Nov 09:00–09 Nov 12:00: start −1 h, finish −1 h, duration \\+0 h\\. Arrow keys move'))
  await expect(revised.first()).toHaveAttribute('title', 'Revision 1 · Cut order A 09 Nov 09:00–09 Nov 12:00 · start −1 h, finish −1 h, duration +0 h')
  // The strips are distinguishable: different colours, stacked in selection order below the bar without overlapping it or each other.
  const geometry = async () => {
    const bar = (await cutting.boundingBox())!
    const [first, second] = [(await original.first().boundingBox())!, (await revised.first().boundingBox())!]
    return { bar, first, second }
  }
  let { bar, first, second } = await geometry()
  expect(bar.height).toBeCloseTo(fullHeight - 3, 0)
  expect(first.y).toBeGreaterThanOrEqual(bar.y + bar.height)
  expect(second.y).toBeGreaterThanOrEqual(first.y + first.height)
  expect(first.height).toBeCloseTo(3, 0)
  const colour = (strip: typeof original) => strip.first().evaluate(element => getComputedStyle(element).backgroundColor)
  expect(await colour(original)).not.toBe(await colour(revised))
  // The strip still lies inside its row.
  const row = (await plan.locator('.vw-gantt-row').first().boundingBox())!
  expect(second.y + second.height).toBeLessThanOrEqual(row.y + row.height)

  // Unchecking a set removes it from baselineIds; the other one is drawn as the single baseline in the first slot.
  await sets.getByRole('checkbox', { name: 'Original plan', exact: true }).uncheck()
  await expect(original).toHaveCount(0)
  await expect(revised).toHaveCount(4)
  await expect(revised.first()).not.toHaveClass(/vw-gantt-baseline-2/)
  expect((await revised.first().boundingBox())!.height).toBeCloseTo(4, 0)
  expect((await cutting.boundingBox())!.height).toBeCloseTo(fullHeight, 0)
  await expect(cutting).toHaveAccessibleDescription(/^Critical\. Float until 09 Nov 11:00\. Revision 1 09 Nov 09:00–09 Nov 12:00: start −1 h/)
  await sets.getByRole('checkbox', { name: 'Revision 1', exact: true }).uncheck()
  await expect(plan.locator('.vw-gantt-baseline')).toHaveCount(0)
  await sets.getByRole('checkbox', { name: 'Original plan', exact: true }).check()
  await sets.getByRole('checkbox', { name: 'Revision 1', exact: true }).check()
  await expect(plan.locator('.vw-gantt-baseline-2')).toHaveCount(4)
  ;({ bar, first, second } = await geometry())
  expect(second.y).toBeGreaterThan(first.y)

  // The SVG export draws the same sets; the Microsoft Project export writes them as numbered baselines.
  const { readFile } = await import('node:fs/promises')
  const download = async (name: string) => {
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name, exact: true }).click()
    return (await readFile((await (await pending).path())!)).toString('utf8')
  }
  const svg = await download('Export schedule SVG')
  expect(svg.match(/<g class="vw-gantt-baseline vw-gantt-baseline-1">/g)).toHaveLength(4)
  expect(svg.match(/<g class="vw-gantt-baseline vw-gantt-baseline-2">/g)).toHaveLength(4)
  expect(svg).toContain('<title>Revision 1 · Cut order A 09 Nov 09:00–09 Nov 12:00 · start −1 h, finish −1 h, duration +0 h</title>')
  const xml = await download('Export MS Project XML')
  expect(xml).toContain('<Baseline><Number>0</Number><Interim>0</Interim><Start>2026-11-09T08:00:00</Start><Finish>2026-11-09T11:00:00</Finish>')
  expect(xml).toContain('<Baseline><Number>1</Number><Interim>0</Interim><Start>2026-11-09T09:00:00</Start><Finish>2026-11-09T12:00:00</Finish>')

  // Turning the comparison off restores the single baseline and the original descriptions.
  await page.getByRole('checkbox', { name: 'Compare baseline sets', exact: true }).uncheck()
  await expect(plan.locator('[data-vw-baseline]')).toHaveCount(0)
  await expect(plan.locator('.vw-gantt-baseline')).toHaveCount(4)
  await expect(cutting).toHaveAccessibleDescription(/^Critical\. Float until 09 Nov 11:00\. Arrow keys move/)
  expect(errors).toEqual([])
})

test('calendar-aware edits propagate downstream, expose overload and preserve the accepted plan on failure', async ({ page }) => {
  const errors = pageErrors(page)
  await openExample(page, 'scheduling')
  const finish = page.getByTestId('schedule-finish')
  const cutting = page.getByRole('button', { name: /^Cut order A \d\d Nov.*–/ })
  const inspection = page.getByRole('button', { name: /^Inspect order A \d\d Nov.*–/ })
  const packing = page.getByRole('button', { name: /^Pack order A \d\d Nov.*–/ })
  await expect(finish).toHaveText('09 Nov 16:00')
  await expect(page.locator('.vw-gantt-links path.vw-is-highlighted')).toHaveCount(2)
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
  expect(errors).toEqual([])
})

test('the scheduling demo shades non-working time and describes critical, float, deadline and split bars', async ({ page }) => {
  const errors = pageErrors(page)
  await openExample(page, 'scheduling')
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

test('the scheduling demo shows scheduling constraints, reschedules when one moves and reports an infeasible one', async ({ page }) => {
  const errors = pageErrors(page)
  await openExample(page, 'scheduling')
  const plan = page.getByRole('region', { name: 'Gantt chart', exact: true }).first()
  const finish = page.getByTestId('schedule-finish')
  const toggle = page.getByRole('checkbox', { name: 'Show scheduling constraints', exact: true })
  const packing = plan.getByRole('button', { name: 'Pack order A 09 Nov 14:00–09 Nov 16:00', exact: true })
  // Off by default: no markers, no handles and the descriptions of before.
  await expect(toggle).not.toBeChecked()
  await expect(plan.locator('.vw-gantt-constraint')).toHaveCount(0)
  await expect(packing).toHaveAccessibleDescription('Critical. Float until 09 Nov 16:00. Deadline 09 Nov 17:00.')

  await toggle.check()
  await expect(finish).toHaveText('09 Nov 16:00')
  // Packing is not editable, so its hard cut-off is a marker in its description; cutting order B gets a handle.
  await expect(packing).toHaveAccessibleDescription('Critical. Float until 09 Nov 16:00. Deadline 09 Nov 17:00. Finish no later than 09 Nov 17:00.')
  await expect(plan.locator('.vw-gantt-constraint.vw-is-finish.vw-is-upper[aria-hidden="true"]')).toHaveCount(1)
  const constraint = plan.getByRole('slider', { name: 'Start no earlier than · Cut order B', exact: true })
  await expect(constraint).toHaveAttribute('aria-valuetext', '09 Nov 10:00')
  await expect(plan.getByRole('slider')).toHaveCount(1)

  // A drag of 3 hours (18 px each) proposes 13:00; the demo reschedules.
  const status = page.getByRole('status').filter({ hasText: /Cut order B|Infeasible/ })
  let box = (await constraint.boundingBox())!
  await dragBy(page, box, 54, 0)
  await expect(status).toHaveText('Cut order B: start no earlier than 09 Nov 13:00. Plan recalculated.')
  await expect(plan.getByRole('button', { name: 'Cut order B 09 Nov 13:00–09 Nov 15:00', exact: true })).toBeVisible()
  await expect(constraint).toHaveAttribute('aria-valuetext', '09 Nov 13:00')

  // Three more hours leave packing no room before the cut-off: the scheduler's diagnostic is shown and nothing changes.
  box = (await constraint.boundingBox())!
  await dragBy(page, box, 54, 0)
  await expect(status).toHaveText('Infeasible: Pack order A cannot meet its finish no later than with the link Cut order B → Pack order A. The change was not applied.')
  await expect(constraint).toHaveAttribute('aria-valuetext', '09 Nov 13:00')
  await expect(finish).toHaveText('09 Nov 16:00')

  // The keyboard: one hour later, then Delete removes the constraint and cutting order B starts at 08:00.
  await constraint.press('ArrowRight')
  await expect(status).toHaveText('Cut order B: start no earlier than 09 Nov 14:00. Plan recalculated.')
  await constraint.press('Delete')
  await expect(status).toHaveText('Constraint removed from Cut order B. Plan recalculated.')
  await expect(constraint).toHaveCount(0)
  await expect(plan.getByRole('button', { name: 'Cut order B 09 Nov 08:00–09 Nov 10:00', exact: true })).toBeFocused()

  // The SVG export draws the marker; the MS Project export writes the single constraint of packing.
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export schedule SVG', exact: true }).click()
  const { readFile } = await import('node:fs/promises')
  const svg = (await readFile((await (await pending).path())!)).toString('utf8')
  expect(svg).toContain('<g class="vw-gantt-constraint vw-is-finish vw-is-upper"><title>Finish no later than · Pack order A 09 Nov 17:00</title>')
  const xmlDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export MS Project XML', exact: true }).click()
  const xml = (await readFile((await (await xmlDownload).path())!)).toString('utf8')
  expect(xml).toContain('<ConstraintType>7</ConstraintType><ConstraintDate>2026-11-09T17:00:00</ConstraintDate>')

  // Turned off, the chart is as before.
  await page.getByRole('button', { name: 'Reset schedule', exact: true }).click()
  await toggle.uncheck()
  await expect(plan.locator('.vw-gantt-constraint')).toHaveCount(0)
  await expect(packing).toHaveAccessibleDescription('Critical. Float until 09 Nov 16:00. Deadline 09 Nov 17:00.')
  await expect(finish).toHaveText('09 Nov 16:00')
  expect(errors).toEqual([])
})

test('the scheduling demo previews cascaded operations during a drag and applies them as one batch', async ({ page }) => {
  const errors = pageErrors(page)
  await openExample(page, 'scheduling')
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
    await pressAndMove(page, box, 36, 0, 6)
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

test('the scheduling demo draws the status date and progress line and reschedules from the status date', async ({ page }) => {
  const errors = pageErrors(page)
  await openExample(page, 'scheduling')
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
  const errors = pageErrors(page)
  await openExample(page, 'scheduling')
  // At the start of the range the done hour of cutting order B cannot lie before the status date.
  await page.getByRole('slider', { name: 'Status date', exact: true }).fill(String(Date.parse('2026-11-09T08:00:00+09:00')))
  await page.getByRole('button', { name: 'Reschedule from status date', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'The reported progress does not fit before status date 09 Nov 08:00. Choose a later status date.' })).toBeVisible()
  await expect(page.getByTestId('schedule-finish')).toHaveText('09 Nov 16:00')
  expect(errors).toEqual([])
})

test('the scheduling demo exports Microsoft Project XML, iCalendar and CSV files', async ({ page }) => {
  const errors = pageErrors(page)
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
  await openExample(page, 'scheduling')
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
  // Three links; the lead of cutting order B before packing is written in tenths of a minute.
  expect(xml.text.match(/<PredecessorLink>/g)).toHaveLength(3)
  expect(xml.text).toContain('<LinkLag>-1200</LinkLag>')

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
  const errors = pageErrors(page)
  await openExample(page, 'scheduling')
  const toggle = page.getByRole('checkbox', { name: 'Network diagram', exact: true })
  await expect(page.getByLabel('Schedule network diagram', { exact: true })).toHaveCount(0)
  await toggle.check()
  const diagram = page.getByLabel('Schedule network diagram', { exact: true })
  await expect(diagram).toBeVisible()
  const nodes = diagram.locator('.vw-network-node')
  await expect(nodes).toHaveCount(4)
  const cutting = diagram.getByRole('button', { name: 'Cut order A ES 09 Nov 08:00 · EF 09 Nov 11:00 · Float 0 h', exact: true })
  await expect(cutting).toHaveClass(/vw-tone-amber/)
  await expect(cutting).toHaveClass(/\bvw-is-related\b/)
  await expect(diagram.getByRole('button', { name: /^Cut order B ES 09 Nov 10:00 · EF 09 Nov 12:00 · Float [1-9]\d* h$/ })).not.toHaveClass(/\bvw-is-related\b/)
  await expect(diagram.locator('.vw-network-edge.vw-is-related')).toHaveCount(2)
  // The diagram follows plan changes.
  await page.getByRole('region', { name: 'Gantt chart', exact: true }).first().getByRole('button', { name: /^Cut order A \d\d Nov.*–/ }).press('ArrowRight')
  await expect(diagram.getByRole('button', { name: /^Cut order A ES 09 Nov 09:00 · EF 09 Nov 12:00/ })).toBeVisible()
  await toggle.uncheck()
  await expect(diagram).toHaveCount(0)
  expect(errors).toEqual([])
})

test('the scheduling demo pins inspection manually, lists manual conflicts and leaves an inactive order out of the plan', async ({ page }) => {
  const errors = pageErrors(page)
  await openExample(page, 'scheduling')
  const plan = page.getByRole('region', { name: 'Gantt chart', exact: true }).first()
  const equipment = page.getByRole('region', { name: 'Gantt chart', exact: true }).nth(1)
  const cutting = plan.getByRole('button', { name: /^Cut order A \d\d Nov.*–/ })
  const other = plan.getByRole('button', { name: /^Cut order B \d\d Nov.*–/ })
  const inspection = plan.getByRole('button', { name: /^Inspect order A \d\d Nov.*–/ })
  const packing = plan.getByRole('button', { name: /^Pack order A \d\d Nov.*–/ })
  const manual = page.getByRole('checkbox', { name: 'Schedule inspection manually', exact: true })
  const cancel = page.getByRole('checkbox', { name: 'Cancel order B (inactive)', exact: true })
  const conflicts = page.getByRole('region', { name: 'Manual date conflicts', exact: true })
  const status = page.getByRole('status').filter({ hasText: /Inspect order A|Cut order B|Plan recalculated|Rescheduled|Original plan/ })
  const editHint = 'Arrow keys move. Shift resizes the end. Alt resizes the start. Escape cancels.'

  // Off by default: inspection is scheduled automatically, critical and not editable.
  await expect(manual).not.toBeChecked()
  await expect(cancel).not.toBeChecked()
  await expect(conflicts).toHaveCount(0)
  await expect(plan.getByText('Inspection station', { exact: true })).toBeVisible()
  await expect(inspection).toHaveAccessibleDescription('Critical. Float until 09 Nov 14:00.')

  // Manual: pinned at its planned dates, violet, editable, without float or critical overlay.
  await manual.check()
  await expect(status).toHaveText('Inspect order A is scheduled manually at 09 Nov 11:00–09 Nov 14:00. Its links no longer move it; move or resize its bar.')
  await expect(plan.getByText('Inspection · manual', { exact: true })).toBeVisible()
  await expect(inspection).toHaveAttribute('aria-label', 'Inspect order A 09 Nov 11:00–09 Nov 14:00')
  await expect(inspection).toHaveClass(/vw-tone-violet/)
  await expect(inspection).not.toHaveClass(/vw-critical/)
  // TimelineBar.description comes first in the accessible description; the name stays the same.
  await expect(inspection).toHaveAccessibleDescription('Manually scheduled: its links do not move it. ' + editHint)
  await expect(inspection).toHaveAttribute('title', 'Inspect order A 09 Nov 11:00–09 Nov 14:00 · Manually scheduled: its links do not move it.')
  await expect(conflicts).toContainText('None: the manual dates meet every link into them.')

  // Cutting order A one hour later finishes after the pinned inspection starts: the inspection stays and the broken link is listed.
  await cutting.press('ArrowRight')
  await expect(cutting).toHaveAttribute('aria-label', 'Cut order A 09 Nov 09:00–09 Nov 12:00')
  await expect(status).toHaveText('Plan recalculated. 0 other operations changed. 1 manual date conflict.')
  await expect(inspection).toHaveAttribute('aria-label', 'Inspect order A 09 Nov 11:00–09 Nov 14:00')
  await expect(conflicts.getByRole('listitem')).toHaveText(['Inspect order A starts before Cut order A finishes (link Cut order A → Inspect order A)'])

  // Dragging the manual bar one hour later previews packing, then moves the manual dates; packing follows and the conflict is resolved.
  const ghosts = plan.locator('.vw-gantt-cascade-preview')
  await pressAndMove(page, inspection, 18, 0, 6)
  await expect(ghosts).toHaveCount(1)
  await page.mouse.up()
  await expect(status).toHaveText('Plan recalculated. 1 other operation changed.')
  await expect(inspection).toHaveAttribute('aria-label', 'Inspect order A 09 Nov 12:00–09 Nov 15:00')
  await expect(packing).toHaveAttribute('aria-label', 'Pack order A 09 Nov 15:00–09 Nov 17:00')
  await expect(conflicts.getByRole('listitem')).toHaveCount(0)
  await expect(conflicts).toContainText('None')
  await expect(page.getByTestId('schedule-finish')).toHaveText('09 Nov 17:00')

  // Inactive: cutting order B keeps a placeholder bar but leaves the load view, the network diagram and the chart links.
  await page.getByRole('checkbox', { name: 'Network diagram', exact: true }).check()
  const diagram = page.getByLabel('Schedule network diagram', { exact: true })
  await expect(diagram.locator('.vw-network-node')).toHaveCount(4)
  await expect(diagram.locator('.vw-network-edge')).toHaveCount(3)
  const doubleLoad = equipment.getByRole('button', { name: '2 / 1 09 Nov 10:00–09 Nov 12:00', exact: true })
  await expect(doubleLoad).toBeVisible()
  await expect(page.getByTestId('schedule-overload')).toHaveText('2 resource-hours')
  await expect(plan.locator('.vw-gantt-lag')).toHaveText('−2 h')
  await cancel.check()
  await expect(status).toHaveText('Cut order B is inactive: it no longer drives packing or loads the CNC cell. Plan recalculated.')
  await expect(plan.getByText('CNC cell · inactive', { exact: true })).toBeVisible()
  await expect(other).toHaveAttribute('aria-label', 'Cut order B 09 Nov 10:00–09 Nov 12:00')
  await expect(other).toHaveClass(/vw-is-outline/)
  await expect(other).not.toHaveClass(/vw-is-editable/)
  await expect(other).toHaveAccessibleDescription('Inactive: takes no part in the plan.')
  await expect(plan.locator('.vw-gantt-lag')).toHaveCount(0)
  await expect(doubleLoad).toHaveCount(0)
  await expect(equipment.getByRole('button', { name: '1 / 1 09 Nov 09:00–09 Nov 12:00', exact: true })).toBeVisible()
  await expect(page.getByTestId('schedule-overload')).toHaveText('0 resource-hours')
  await expect(diagram.locator('.vw-network-node')).toHaveCount(3)
  await expect(diagram.locator('.vw-network-edge')).toHaveCount(2)
  await expect(diagram.getByRole('button', { name: /^Cut order B / })).toHaveCount(0)

  // Exports: Microsoft Project marks the inactive task, iCalendar leaves it out and the CSV says how each task is scheduled.
  const { readFile } = await import('node:fs/promises')
  async function save(name: string) {
    const pending = page.waitForEvent('download')
    await page.getByRole('button', { name, exact: true }).click()
    return (await readFile((await (await pending).path())!)).toString('utf8')
  }
  const xml = await save('Export MS Project XML')
  expect(xml).toContain('<Name>Cut order B</Name><Active>0</Active>')
  expect(xml).toContain('<Name>Inspect order A</Name><Active>1</Active><Manual>1</Manual>')
  expect(xml.match(/<PredecessorLink>/g)).toHaveLength(3)
  const ics = await save('Export iCalendar')
  expect(ics).not.toContain('SUMMARY:Cut order B')
  expect(ics).toContain('DESCRIPTION:Inspection · manual\r\n')
  const csv = (await save('Export CSV')).split('\r\n')
  expect(csv[0]).toBe('Operation,WBS,Task,Start,End,Progress,Scheduling')
  expect(csv[2]).toBe('Cut order B,2,Cut order B,09 Nov 10:00,09 Nov 12:00,0.5,Inactive')
  expect(csv[3]).toBe('Inspect order A,3,Inspect order A,09 Nov 12:00,09 Nov 15:00,0.25,Manual')

  // Rescheduling from the status date keeps the manual dates and ignores the inactive order.
  await page.getByRole('button', { name: 'Reschedule from status date', exact: true }).click()
  await expect(status).toHaveText('Rescheduled from status date 09 Nov 12:00. 0 operations moved.')
  await expect(inspection).toHaveAttribute('aria-label', 'Inspect order A 09 Nov 12:00–09 Nov 15:00')

  // Reset turns both options off and restores the original plan.
  await page.getByRole('button', { name: 'Reset schedule', exact: true }).click()
  await expect(status).toHaveText('Original plan restored.')
  await expect(manual).not.toBeChecked()
  await expect(cancel).not.toBeChecked()
  await expect(conflicts).toHaveCount(0)
  await expect(inspection).toHaveAttribute('aria-label', 'Inspect order A 09 Nov 11:00–09 Nov 14:00')
  await expect(inspection).not.toHaveClass(/vw-tone-violet/)
  await expect(other).not.toHaveClass(/vw-is-outline/)
  await expect(plan.locator('.vw-gantt-lag')).toHaveText('−2 h')
  await expect(diagram.locator('.vw-network-node')).toHaveCount(4)
  await expect(page.getByTestId('schedule-finish')).toHaveText('09 Nov 16:00')
  await expect(page.getByTestId('schedule-overload')).toHaveText('1 resource-hour')
  expect(errors).toEqual([])
})

test('the scheduling demo labels a lead and its cascade preview and batch honour the lead', async ({ page }) => {
  const errors = pageErrors(page)
  await openExample(page, 'scheduling')
  const plan = page.getByRole('region', { name: 'Gantt chart', exact: true }).first()
  await expect(plan.locator('.vw-gantt-lag')).toHaveText('−2 h')
  const other = plan.getByRole('button', { name: /^Cut order B \d\d Nov.*–/ })
  const packing = plan.getByRole('button', { name: /^Pack order A \d\d Nov.*–/ })
  const ghosts = plan.locator('.vw-gantt-cascade-preview')
  await expect(other).toHaveAttribute('aria-label', 'Cut order B 09 Nov 10:00–09 Nov 12:00')
  await expect(packing).toHaveAttribute('aria-label', 'Pack order A 09 Nov 14:00–09 Nov 16:00')
  const box = (await other.boundingBox())!
  const pack = (await packing.boundingBox())!
  // 90 px is five hours: cutting order B would end at 17:00, so with the two-hour lead packing starts at 15:00 the
  // same day. Without the lead it would wait for 17:00 and move past the plant closure to 11 November.
  await pressAndMove(page, box, 90, 0, 9)
  await expect(ghosts).toHaveCount(1)
  const ghost = (await ghosts.first().boundingBox())!
  expect(ghost.x - pack.x).toBeCloseTo(18, 0)
  expect(ghost.width).toBeCloseTo(36, 0)
  expect(ghost.y).toBeCloseTo(pack.y, 0)
  await page.mouse.up()
  await expect(page.getByRole('status').filter({ hasText: 'Plan recalculated. 1 other operation changed.' })).toBeVisible()
  await expect(other).toHaveAttribute('aria-label', 'Cut order B 09 Nov 15:00–09 Nov 17:00')
  await expect(packing).toHaveAttribute('aria-label', 'Pack order A 09 Nov 15:00–09 Nov 17:00')
  expect(errors).toEqual([])
})

test('resource planning places an unplanned task from the backlog by keyboard and refuses an unplaced predecessor', async ({ page }) => {
  const { errors, chart, notice, summary } = await openResourcePlanning(page)
  // Task A needs two resources: it has two bars, one set of dates.
  await expect(chart.getByRole('button', { name: 'Mold A · Press 1 08:00–11:00', exact: true })).toBeVisible()
  await expect(chart.getByRole('button', { name: 'Mold A · Crew 08:00–11:00', exact: true })).toBeVisible()
  await expect(summary).toContainText('Calculated with scheduleTasks')
  await expect(summary).toContainText('overloaded interval')

  // Inspect E depends on Rework D, which has no dates yet: refused as a diagnostic, never silently dropped.
  await page.getByRole('button', { name: 'Place Inspect E', exact: true }).click()
  await page.getByRole('button', { name: 'Confirm placement of Inspect E', exact: true }).click()
  await expect(notice).toContainText('Inspect E depends on Rework D, which is not placed yet')
  await expect(page.getByRole('region', { name: /^Preview/ })).toHaveCount(0)

  await page.getByRole('searchbox', { name: 'Search unplanned tasks', exact: true }).fill('rework')
  await expect(page.getByRole('button', { name: 'Place Inspect E', exact: true })).toHaveCount(0)
  await page.getByRole('button', { name: 'Place Rework D', exact: true }).click()
  await page.getByLabel('Row for Rework D', { exact: true }).selectOption({ label: 'Press 2' })
  await page.getByLabel('Start for Rework D', { exact: true }).selectOption({ label: '08:00' })
  await page.getByRole('button', { name: 'Confirm placement of Rework D', exact: true }).click()
  const preview = page.getByRole('region', { name: 'Preview: placed Rework D', exact: true })
  await expect(preview).toContainText('Calculated with scheduleTasks')
  await expect(chart.getByRole('button', { name: /^Rework D/ })).toHaveCount(0)
  await preview.getByRole('button', { name: 'Apply change', exact: true }).click()
  await expect(chart.getByRole('button', { name: 'Rework D · Press 2 08:00–10:00', exact: true })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Unplanned task list' }).getByText('Rework D')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('resource planning moves a bar to another resource as one change, undoes it once and reveals diagnostics', async ({ page }) => {
  const { errors, chart, notice, summary } = await openResourcePlanning(page)
  const before = chart.getByRole('button', { name: 'Mold B · Press 1 09:00–11:00', exact: true })
  await before.press('ArrowDown')
  const preview = page.getByRole('region', { name: 'Preview: Mold B reassigned', exact: true })
  await expect(preview).toContainText('Replace Press 1 with Press 2 for Mold B')
  await expect(preview).toContainText('No overloaded interval')
  // Nothing changes until the preview is applied.
  await expect(before).toBeVisible()
  await preview.getByRole('button', { name: 'Apply change', exact: true }).click()
  const after = chart.getByRole('button', { name: 'Mold B · Press 2 09:00–11:00', exact: true })
  await expect(after).toBeVisible()
  await expect(after).toBeFocused()
  await expect(before).toHaveCount(0)
  await expect(summary).toContainText('No overloaded interval')

  // One undo restores both the assignment and the load.
  await page.getByRole('button', { name: 'Undo planning change', exact: true }).click()
  await expect(before).toBeVisible()
  await expect(after).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Undo planning change', exact: true })).toBeDisabled()
  await expect(summary).toContainText('overloaded interval')

  // A diagnostic highlights and reveals its bars.
  await page.getByRole('button', { name: /Resource overload/ }).first().click()
  await expect(notice).toContainText('Highlighted 3 bar(s)')
  await expect(chart.locator('.vw-is-highlighted')).toHaveCount(3)

  // A horizontal move changes the task's dates for every projection.
  await chart.getByRole('button', { name: 'Mold A · Crew 08:00–11:00', exact: true }).press('ArrowRight')
  const horizontal = page.getByRole('region', { name: 'Preview: Mold A rescheduled', exact: true })
  await expect(horizontal).toContainText('every row that shows it')
  await horizontal.getByRole('button', { name: 'Apply change', exact: true }).click()
  await expect(chart.getByRole('button', { name: 'Mold A · Press 1 08:15–11:15', exact: true })).toBeVisible()
  await expect(chart.getByRole('button', { name: 'Mold A · Crew 08:15–11:15', exact: true })).toBeVisible()

  // Leveling says which calculation ran and does not claim more than it did.
  await page.getByRole('combobox', { name: 'Capacity policy' }).selectOption('level')
  await expect(summary).toContainText('Calculated with levelResources')
  await expect(summary).not.toContainText('Not resolved')
  expect(errors).toEqual([])
})

test('server-backed resource planning: a rejected or conflicting reassignment leaves bars, assignments and load unchanged', async ({ page }) => {
  const { errors, chart, notice, saveStatus, server, serverState, undo } = await openServerPlanning(page)
  const pressOne = chart.getByRole('button', { name: 'Mold B · Press 1 09:00–11:00', exact: true })
  await pressOne.click()
  const before = await planState(page, chart)
  expect(before.bars).toContain('Mold B · Press 1 09:00–11:00')
  expect(before.assignments).toEqual(['Unassign Press 1'])
  expect(before.load.length).toBeGreaterThan(0)

  await server('Reject').check()
  await pressOne.press('ArrowDown')
  const preview = page.getByRole('region', { name: 'Preview: Mold B reassigned', exact: true })
  await expect(preview).toContainText('Replace Press 1 with Press 2 for Mold B')
  await preview.getByRole('button', { name: 'Apply change', exact: true }).click()
  // While the save is in flight the candidate exists only in the preview; the chart and load keep the accepted plan.
  await expect(saveStatus).toContainText('Rejected by the server (server-validation). Nothing changed.')
  await expect(notice).toContainText('Not applied: Mold B reassigned was rejected by the server')
  await expect(preview).toHaveCount(0)
  expect(await planState(page, chart)).toEqual(before)
  await expect(serverState).toHaveText('Server version v1 · 0 commits')
  await expect(undo).toBeDisabled()
  await page.getByRole('button', { name: 'Dismiss save message', exact: true }).click()

  // A version conflict: another planner lengthened Finish C first. Nothing of the reassignment is applied either.
  await server('Version conflict').check()
  await pressOne.press('ArrowDown')
  await preview.getByRole('button', { name: 'Apply change', exact: true }).click()
  await expect(saveStatus).toContainText('Version conflict: the server is at version v2, not v1. Nothing changed')
  expect(await planState(page, chart)).toEqual(before)
  await expect(undo).toBeDisabled()
  // Loading the latest version brings the other planner's change, and still not the rejected reassignment.
  await page.getByRole('button', { name: 'Load latest version', exact: true }).click()
  await expect(chart.getByRole('button', { name: 'Finish C · Press 2 11:00–14:00', exact: true })).toBeVisible()
  await expect(pressOne).toBeVisible()
  await expect(chart.getByRole('button', { name: /^Mold B · Press 2/ })).toHaveCount(0)
  await expect(saveStatus).toContainText('Accepted version v2')
  expect(errors).toEqual([])
})

test('server-backed resource planning: an accepted move commits schedule and assignment together and one undo restores both through the server', async ({ page }) => {
  const { errors, chart, saveStatus, serverState, undo, redo } = await openServerPlanning(page)
  const pressOne = chart.getByRole('button', { name: 'Mold B · Press 1 09:00–11:00', exact: true })
  await pressOne.click()
  const before = await planState(page, chart)

  // One pointer drag changes the resource row and the time: one proposal, one transaction.
  const box = (await pressOne.boundingBox())!
  const perMinute = box.width / 120
  const rowTwo = await centreY(chart.getByRole('button', { name: /^Finish C · Press 2 / }))
  await dragBy(page, pressOne, 15 * perMinute + 2, rowTwo - (box.y + box.height / 2))
  const preview = page.getByRole('region', { name: 'Preview: Mold B reassigned', exact: true })
  await expect(preview).toContainText('Replace Press 1 with Press 2 for Mold B')
  await expect(preview).toContainText('Request Mold B at 09:15–11:15')
  await preview.getByRole('button', { name: 'Apply change', exact: true }).click()
  await expect(saveStatus).toContainText('Saving changes based on version v1')
  await expect(saveStatus).toContainText('Accepted version v2')
  const moved = chart.getByRole('button', { name: 'Mold B · Press 2 09:15–11:15', exact: true })
  await expect(moved).toBeVisible()
  await expect(moved).toBeFocused()
  await expect(pressOne).toHaveCount(0)
  await expect(serverState).toHaveText('Server version v2 · 1 commits')
  const after = await planState(page, chart)
  expect(after.assignments).toEqual(['Unassign Press 2'])
  expect(after.load).not.toEqual(before.load)

  // One undo, saved as a restore: the dates, the assignment and the load all return together.
  await undo.click()
  await expect(saveStatus).toContainText('Accepted version v3')
  await expect(pressOne).toBeVisible()
  await expect(serverState).toHaveText('Server version v3 · 2 commits')
  expect(await planState(page, chart)).toEqual(before)
  await expect(undo).toBeDisabled()
  // Redo is a restore through the server as well.
  await redo.click()
  await expect(saveStatus).toContainText('Accepted version v4')
  await expect(moved).toBeVisible()
  expect(await planState(page, chart)).toEqual(after)
  expect(errors).toEqual([])
})

test('resource planning: placement, reassignment and rescheduling propose the same operation by pointer and keyboard', async ({ page }) => {
  const { errors, chart } = await openResourcePlanning(page)
  await page.getByText('Received proposals', { exact: true }).click()
  const log = page.getByRole('list', { name: 'Received proposals', exact: true })
  const last = async () => (await log.getByRole('listitem').last().textContent())!.trim()
  const operation = (entry: string) => entry.replace(/^(pointer|keyboard): /, '')
  const previewChanges = () => page.getByRole('list', { name: 'Proposed changes', exact: true }).allTextContents()
  const discard = () => page.getByRole('button', { name: 'Discard preview', exact: true }).click()
  const moldB = chart.getByRole('button', { name: 'Mold B · Press 1 09:00–11:00', exact: true })
  const bBox = (await moldB.boundingBox())!
  const perMinute = bBox.width / 120
  const rowTwo = await centreY(chart.getByRole('button', { name: /^Finish C · Press 2 / }))

  // 1. Placement from the backlog: a pointer drop at 10:15 on Press 2, then the keyboard form with the same choice.
  const regionBox = (await chart.boundingBox())!
  await page.getByRole('list', { name: 'Unplanned task list' }).getByRole('listitem').filter({ hasText: 'Rework D' })
    .dragTo(chart, { targetPosition: { x: bBox.x + 75 * perMinute + 2 - regionBox.x, y: rowTwo - regionBox.y } })
  await expect.poll(last).toBe('pointer: place Rework D on Press 2 at 10:15')
  const pointerPlace = await previewChanges()
  await discard()
  await page.getByRole('button', { name: 'Place Rework D', exact: true }).press('Enter')
  await page.getByLabel('Row for Rework D', { exact: true }).selectOption({ label: 'Press 2' })
  await page.getByLabel('Start for Rework D', { exact: true }).selectOption({ label: '10:15' })
  await page.getByRole('button', { name: 'Confirm placement of Rework D', exact: true }).press('Enter')
  await expect.poll(last).toBe('keyboard: place Rework D on Press 2 at 10:15')
  expect(await previewChanges()).toEqual(pointerPlace)
  await expect(page.getByRole('region', { name: 'Preview: placed Rework D', exact: true })).toBeVisible()
  await discard()

  // 2. A vertical move replaces the assignment: Down arrow, then a vertical drag to the Press 2 row.
  await moldB.press('ArrowDown')
  await expect.poll(last).toBe('keyboard: reassign Mold B on Press 2 at 09:00–11:00')
  const keyboardMove = await previewChanges()
  await discard()
  await dragBy(page, moldB, 0, rowTwo - (bBox.y + bBox.height / 2))
  await expect.poll(last).toMatch(/^pointer: /)
  expect(operation(await last())).toBe(operation('keyboard: reassign Mold B on Press 2 at 09:00–11:00'))
  expect(await previewChanges()).toEqual(keyboardMove)
  await discard()

  // 3. A horizontal move changes the schedule: Right arrow (one snap step), then a drag by the same snapped distance.
  const crew = chart.getByRole('button', { name: 'Mold A · Crew 08:00–11:00', exact: true })
  await crew.press('ArrowRight')
  await expect.poll(last).toBe('keyboard: reschedule Mold A on Crew at 08:15–11:15')
  const keyboardShift = await previewChanges()
  await discard()
  await dragBy(page, crew, 15 * perMinute + 2, 0)
  await expect.poll(last).toBe('pointer: reschedule Mold A on Crew at 08:15–11:15')
  expect(await previewChanges()).toEqual(keyboardShift)
  await discard()

  // Nothing was applied by any of the six proposals.
  await expect(moldB).toBeVisible()
  await expect(crew).toBeVisible()
  await expect(chart.getByRole('button', { name: /^Rework D/ })).toHaveCount(0)
  await expect(log.getByRole('listitem')).toHaveCount(6)
  expect(errors).toEqual([])
})

test('the scheduling demo draws opt-in links to and from a summary task and edits them like other links', async ({ page }) => {
  const errors = pageErrors(page)
  await openExample(page, 'scheduling')
  // Off by default: the scheduling page keeps its two charts.
  await expect(page.getByRole('region', { name: 'Summary task links timeline', exact: true })).toHaveCount(0)
  await page.getByRole('checkbox', { name: 'Summary task links', exact: true }).check()
  const chart = page.getByRole('region', { name: 'Summary task links timeline', exact: true })
  await expect(chart).toBeVisible()
  // The example is the last panel of the page; pointer gestures need it on screen.
  await chart.scrollIntoViewIfNeeded()
  const status = (text: string) => page.getByRole('status').filter({ hasText: text })
  const links = chart.getByRole('button', { name: /^Select dependency / })
  const into = chart.getByRole('button', { name: 'Select dependency Design review → Build phase FS', exact: true })
  const out = chart.getByRole('button', { name: 'Select dependency Build phase → Final inspection FS', exact: true })
  await expect(links).toHaveCount(2)
  await expect(into).toHaveCount(1)
  await expect(out).toHaveCount(1)

  // The links end at the edges of the rollup bar: into its start, out of its finish.
  const rollup = chart.locator('.vw-gantt-summary')
  await expect(rollup).toHaveAttribute('title', 'Build phase · 2 · 10:00–13:00')
  const edges = async () => {
    const style = (await rollup.getAttribute('style'))!
    const left = Number(/\+ ([\d.]+)px\)/.exec(style)![1]), width = Number(/width: ?([\d.]+)px/.exec(style)![1])
    return { start: left, finish: left + width }
  }
  let edge = await edges()
  await expect(into).toHaveAttribute('d', new RegExp(` H ${edge.start}$`))
  await expect(out).toHaveAttribute('d', new RegExp(`^M ${edge.finish} `))

  // Dragging a subtask moves the rollup bar and the link out of it during the preview and after the accepted edit.
  const frame = chart.getByRole('button', { name: 'Frame 10:00–13:00', exact: true })
  await pressAndMove(page, frame, 70, 0, 6)
  await expect(rollup).toHaveAttribute('title', 'Build phase · 2 · 10:00–14:00')
  edge = await edges()
  await expect(out).toHaveAttribute('d', new RegExp(`^M ${edge.finish} `))
  await page.mouse.up()
  await expect(status('Frame requested from 11:00. Build phase 10:00–14:00.')).toBeVisible()
  await expect(chart.getByRole('button', { name: 'Final inspection 14:00–15:00', exact: true })).toBeVisible()
  await expect(out).toHaveAttribute('d', new RegExp(`^M ${(await edges()).finish} `))

  // Keyboard selection and deletion work as for links between bars.
  await out.press('Enter')
  await expect(status('Selected link build-inspect. Press Delete to remove it.')).toBeVisible()
  await expect(out).toHaveAttribute('aria-pressed', 'true')
  await out.press('Delete')
  await expect(status('Deleted link build-inspect.')).toBeVisible()
  await expect(links).toHaveCount(1)

  // The rollup bar has link handles: drag from its finish onto a bar to propose a link out of the summary. Without the
  // link, the inspection starts at the beginning of the horizon.
  const target = (await chart.getByRole('button', { name: 'Final inspection 08:00–09:00', exact: true }).boundingBox())!
  await pressAndMoveTo(page, chart.getByRole('button', { name: 'Start dependency from finish of Build phase', exact: true }), { x: target.x + 4, y: target.y + target.height / 2 }, 10)
  await expect(chart.locator('.vw-gantt-link-preview path')).toHaveAttribute('d', /^M .+ L /)
  await page.mouse.up()
  await expect(status('Added FS link from Build phase to Final inspection.')).toBeVisible()
  await expect(out).toHaveCount(1)
  await expect(chart.getByRole('button', { name: 'Final inspection 14:00–15:00', exact: true })).toBeVisible()

  // Links into the summary go through validateConnection: a duplicate and an FF link into it are rejected.
  await chart.getByRole('button', { name: 'Start dependency from start of Design review', exact: true }).press('Enter')
  await chart.getByRole('button', { name: 'Connect dependency to start of Build phase', exact: true }).press('Enter')
  await expect(status('These tasks are already linked.')).toBeVisible()
  await into.press('Enter')
  await into.press('Delete')
  await expect(status('Deleted link design-build.')).toBeVisible()
  await chart.getByRole('button', { name: 'Start dependency from finish of Design review', exact: true }).press('Enter')
  await chart.getByRole('button', { name: 'Connect dependency to finish of Build phase', exact: true }).press('Enter')
  await expect(status('A FF link cannot end at the summary Build phase. Link to the subtask that should finish instead.')).toBeVisible()
  await expect(links).toHaveCount(1)

  // Dropping a dragged link on the rollup bar body joins its nearer end.
  const from = (await chart.getByRole('button', { name: 'Start dependency from finish of Design review', exact: true }).boundingBox())!
  const bar = (await rollup.boundingBox())!
  await dragTo(page, from, { x: bar.x + 6, y: bar.y + bar.height / 2 }, { steps: 10 })
  await expect(status('Added FS link from Design review to Build phase.')).toBeVisible()
  await expect(into).toHaveCount(1)

  // The SVG export draws the summary links too.
  await page.getByRole('button', { name: 'Export summary links SVG', exact: true }).click()
  await expect(status('Exported summary links SVG with 2 dependency lines.')).toBeVisible()
  expect(errors).toEqual([])
})

test('plan scenarios: create a candidate, compare, highlight a row, discard, adopt and undo as one step', async ({ page }) => {
  const errors = pageErrors(page)
  await openExample(page, 'linked-views')
  await page.getByRole('checkbox', { name: 'Compare plan scenarios' }).check()
  const panel = page.locator('section[aria-labelledby="scenario-title"]')
  const status = panel.getByRole('status', { name: 'Scenario status' })
  const revision = panel.getByLabel('Current plan revision')
  const selected = panel.getByLabel('Scenario selection')
  const node = (label: string) => panel.getByRole('button', { name: new RegExp('^' + label + ' ES ') })
  const bar = (label: string) => panel.getByRole('button', { name: new RegExp('^' + label + ' \\d\\d:\\d\\d') })
  const comparison = panel.getByRole('table', { name: 'Plan comparison' })
  const tasks = panel.getByRole('table', { name: 'Task changes' })
  await expect(revision).toHaveText('Current plan revision r1, finish 17:00')

  // A selection made before the candidate exists.
  await bar('Prepare stock').click()
  await expect(selected).toHaveText('Selected: Prepare stock')

  await panel.getByRole('combobox', { name: 'Candidate strategy' }).selectOption('push')
  await panel.getByRole('button', { name: 'Create candidate' }).click()
  await expect(status).toContainText('Candidate created from revision r1')
  await expect(comparison.getByRole('row', { name: /^Final completion/ })).toHaveText(/17:00\s*20:00\s*\+3 h/)
  await expect(comparison.getByRole('row', { name: /^Deadline misses/ })).toHaveText(/0\s*1\s*1 gained, 0 lost/)
  await expect(comparison.getByRole('row', { name: /^Overload CNC cell/ })).toHaveText(/2 unit-h\s*2 unit-h\s*±0 unit-h/)
  // The current plan is drawn under the candidate bars as a baseline set.
  await expect(panel.locator('.vw-gantt-baseline')).toHaveCount(5)
  await expect(revision).toHaveText('Current plan revision r1, finish 17:00')

  await panel.getByRole('radio', { name: 'Tasks I changed' }).check()
  await expect(tasks.getByRole('button')).toHaveText(['Cut order A', 'Cut order B'])
  await panel.getByRole('radio', { name: 'Tasks that moved as a result' }).check()
  await expect(tasks.getByRole('button')).toHaveText(['Prepare stock', 'Inspect', 'Pack'])

  // Selecting a row highlights the task and the changed tasks downstream in both views, and its load ranges.
  await tasks.getByRole('button', { name: 'Inspect', exact: true }).click()
  await expect(tasks.getByRole('button', { name: 'Inspect', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(node('Inspect')).toHaveClass(/\bvw-is-highlighted\b/)
  await expect(node('Pack')).toHaveClass(/\bvw-is-highlighted\b/)
  await expect(node('Cut order A')).not.toHaveClass(/\bvw-is-highlighted\b/)
  await expect(bar('Inspect')).toHaveClass(/\bvw-is-highlighted\b/)
  await expect(bar('Pack')).toHaveClass(/\bvw-is-highlighted\b/)
  await expect(panel.locator('.vw-gantt-load-segment.vw-is-highlighted').first()).toBeVisible()
  await expect(panel.getByLabel('Candidate reasons')).toContainText('after cutA-inspect')

  // Discard restores the plan and the selection exactly.
  await panel.getByRole('button', { name: 'Discard candidate' }).click()
  await expect(status).toHaveText('Candidate discarded. The current plan and selection are as before.')
  await expect(comparison).toHaveCount(0)
  await expect(selected).toHaveText('Selected: Prepare stock')
  await expect(revision).toHaveText('Current plan revision r1, finish 17:00')
  await expect(panel.locator('.vw-gantt-baseline')).toHaveCount(0)
  await expect(panel.locator('.vw-is-highlighted')).toHaveCount(0)

  // A change of the current plan while comparing makes the candidate stale; adopting it is refused.
  await panel.getByRole('combobox', { name: 'Candidate strategy' }).selectOption('move')
  await panel.getByRole('button', { name: 'Create candidate' }).click()
  await expect(comparison.getByRole('row', { name: /^Final completion/ })).toHaveText(/17:00\s*19:00\s*\+2 h/)
  await panel.getByRole('button', { name: "Simulate another planner's change" }).click()
  await expect(panel.getByRole('alert')).toContainText('moved from revision r1 to r2')
  await expect(comparison.getByRole('row', { name: /^Final completion/ })).toHaveText(/18:00\s*19:00\s*\+1 h/)
  await expect(panel.getByRole('button', { name: 'Adopt candidate' })).toBeDisabled()
  await panel.getByRole('button', { name: 'Discard candidate' }).click()
  await expect(revision).toHaveText('Current plan revision r2, finish 18:00')

  // A partly loaded current plan is never shown as a complete comparison.
  await panel.getByRole('button', { name: 'Create candidate' }).click()
  await panel.getByRole('checkbox', { name: 'Current plan only partly loaded' }).check()
  await expect(panel.getByRole('alert')).toContainText('Incomplete comparison')
  await expect(panel.getByRole('button', { name: 'Adopt candidate' })).toBeDisabled()
  await panel.getByRole('checkbox', { name: 'Current plan only partly loaded' }).uncheck()

  // Adopt is one history entry: one Undo restores the previous plan.
  await panel.getByRole('button', { name: 'Adopt candidate' }).click()
  await expect(status).toContainText('Adopted: Move Cut order A to the backup saw.')
  await expect(revision).toHaveText('Current plan revision r3, finish 20:00')
  await panel.getByRole('button', { name: 'Undo plan change' }).click()
  await expect(revision).toHaveText('Current plan revision r2, finish 18:00')
  await panel.getByRole('button', { name: 'Undo plan change' }).click()
  await expect(revision).toHaveText('Current plan revision r1, finish 17:00')
  expect(errors).toEqual([])
})

test('the scheduling demo shows plan, recorded actuals and remaining forecast from rescheduleFromActuals', async ({ page }) => {
  const errors = pageErrors(page)
  await openExample(page, 'scheduling')
  // Off by default: the scheduling page keeps its charts.
  await expect(page.getByRole('region', { name: 'Recorded actuals timeline', exact: true })).toHaveCount(0)
  await page.getByRole('checkbox', { name: 'Recorded actuals', exact: true }).check()
  const chart = page.getByRole('region', { name: 'Recorded actuals timeline', exact: true })
  await expect(chart).toBeVisible()
  await chart.scrollIntoViewIfNeeded()
  const bar = (name: string) => chart.getByRole('button', { name, exact: true })
  // Finished cutting keeps its overrun actual and has no forecast; interrupted milling keeps both actual pieces.
  await expect(bar('Cut stock · actual 08:00–11:30')).toHaveCount(1)
  await expect(chart.getByRole('button', { name: /^Cut stock · forecast/ })).toHaveCount(0)
  await expect(bar('Mill housing · actual 11:40–14:00')).toHaveAccessibleDescription(/Recorded actual work/)
  await expect(bar('Mill housing · actual 11:40–14:00').locator('.vw-gantt-segment')).toHaveCount(2)
  await expect(bar('Mill housing · forecast 14:00–16:40')).toHaveAccessibleDescription(/Remaining work forecast/)
  await expect(bar('Mill housing · forecast 14:00–16:40')).toHaveClass(/vw-is-outline/)
  await expect(bar('Mill housing · actual 11:40–14:00')).toHaveClass(/vw-is-solid/)
  // The original plan is the baseline strip of each task's first bar.
  await expect(bar('Paint frame · forecast 08:00–10:00')).toHaveAccessibleDescription(/Original plan/)
  await expect(chart.locator('.vw-gantt-baseline')).toHaveCount(5)
  await expect(page.getByRole('list', { name: 'Recorded actuals legend', exact: true }).getByRole('listitem')).toHaveCount(3)
  const diagnostics = page.getByRole('list', { name: 'Recorded actuals diagnostics', exact: true })
  await expect(diagnostics.getByRole('listitem')).toHaveText(['Mill housing: Actual work outside the shift calendar (kept as recorded) 12:00–12:20'])
  await expect(page.getByTestId('actuals-finish')).toHaveText('11:00')

  // Without the upward revision welding is finished; successors move while every actual bar stays where it was.
  const actualNames = () => chart.getByRole('button', { name: / · actual / }).evaluateAll(items => items.map(item => item.getAttribute('aria-label')))
  const before = await actualNames()
  expect(before).toHaveLength(3)
  await page.getByRole('checkbox', { name: 'Welding needs 3 h more', exact: true }).uncheck()
  await expect(bar('Paint frame · forecast 16:40–09:40')).toHaveCount(1)
  await expect(bar('Pack · forecast 09:40–10:40')).toHaveCount(1)
  await expect(chart.getByRole('button', { name: /^Weld frame · forecast/ })).toHaveCount(0)
  await expect(page.getByTestId('actuals-finish')).toHaveText('10:40')
  expect(await actualNames()).toEqual(before)
  expect(errors).toEqual([])
})

test('resource planning clears the selection and the inspector on a click on empty chart space or Escape', async ({ page }) => {
  const { errors, chart, notice } = await openResourcePlanning(page)
  await expect(page.getByText('Click empty chart space or press Escape to clear the selection.', { exact: false })).toBeVisible()
  const inspector = page.getByRole('region', { name: 'Task inspector', exact: true })
  await expect(inspector).toContainText('Select a bar to edit its task.')
  const crew = chart.getByRole('button', { name: 'Mold A · Crew 08:00–11:00', exact: true })
  await crew.click()
  await expect(crew).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('region', { name: 'Task Mold A', exact: true })).toBeVisible()
  await expect(page.getByRole('group', { name: 'Assignments of Mold A', exact: true })).toBeVisible()
  // Mold A is the only placed task of the Crew row, so the row is empty after 11:00 (60 px per hour).
  const box = (await crew.boundingBox())!
  await page.mouse.click(box.x + box.width + 90, box.y + box.height / 2)
  await expect(crew).toHaveAttribute('aria-pressed', 'false')
  await expect(notice).toContainText('Selection cleared.')
  await expect(inspector).toContainText('Select a bar to edit its task.')
  await expect(page.getByRole('group', { name: 'Assignments of Mold A', exact: true })).toHaveCount(0)

  // Escape in the chart clears it too.
  await crew.click()
  await expect(crew).toHaveAttribute('aria-pressed', 'true')
  await crew.press('Escape')
  await expect(crew).toHaveAttribute('aria-pressed', 'false')
  await expect(inspector).toContainText('Select a bar to edit its task.')
  expect(errors).toEqual([])
})

test('the resource planning example previews a change in Japanese', async ({ page }) => {
  const errors = pageErrors(page)
  const demo = await openExample(page, 'resource-planning', { locale: 'ja' })
  await expect(demo.getByRole('region', { name: 'リソースの計画', exact: true })).toBeVisible()
  await expect(demo.getByRole('button', { name: '計画の変更を元に戻す', exact: true })).toBeDisabled()
  await expect(demo.getByRole('status', { name: '計画の概要' })).toContainText('scheduleTasks で計算。')
  await expect(demo.getByRole('heading', { name: '未計画のタスク', exact: true })).toBeVisible()
  await expect(demo.getByRole('heading', { name: '計画の診断', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})
