// GanttChart editing: keyboard row moves, context menus, creating bars by pointer, touch and keyboard, and indenting,
// outdenting and dragging rows.
import { expect, test, ganttRow, openGanttFixture, openTimelineEditing, pageErrors, pressAndMove, pressAndMoveTo, touch, type Page } from './support'

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
  await page.getByRole('region', { name: 'Live demo' }).getByRole('heading', { name: 'Timeline editing', exact: true }).click()
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
