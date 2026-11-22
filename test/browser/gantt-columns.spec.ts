// GanttChart editing: columns and their resizing, field and cell editing with input methods, file import, external
// drops and edits cancelled by new source data.
import {
  expect, test, boxCenter, dragBy, openLinkedGanttFixture, openTimelineEditing, pageErrors, pressAndMove, type LinkedFixture, type Page,
} from './support'

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

test('timeline columns edit through validation and keep summary bars when collapsed', async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto('gallery.html')
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
  await page.goto('gallery.html')
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
