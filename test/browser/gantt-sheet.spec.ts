// GanttChart spreadsheet mode (`spreadsheet`): selection, clipboard, clear, fill, typing to edit and atomic rejection.
import { expect, test, centerOf, openGanttSheetFixture, pageErrors, touch, type Page, realTouchChromiumOnly } from './support'

async function writeClipboard(page: Page, text: string) {
  await page.evaluate(value => navigator.clipboard.writeText(value), text)
}
async function readClipboard(page: Page) {
  // WebKit denies navigator.clipboard.readText() to scripts (it needs a user gesture and a permission Playwright cannot
  // grant), so there the text the chart wrote into the last copy event is read instead (see beforeEach).
  if (page.context().browser()?.browserType().name() === 'webkit') return page.evaluate(() => (window as any).__vwCopied as string)
  return page.evaluate(() => navigator.clipboard.readText())
}
/** Events of one kind from the fixture log. */
function only(events: unknown[][], kind: string) {
  return events.filter(entry => entry[0] === kind)
}

test.beforeEach(async ({ context, browserName }) => {
  // The clipboard permission names exist in Chromium only; Firefox and WebKit reject them.
  if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  // A window listener runs after the chart's own copy handler, so it sees the text the chart put into the event.
  if (browserName === 'webkit') {
    await context.addInitScript(() => window.addEventListener('copy', event => {
      (window as any).__vwCopied = event.clipboardData?.getData('text/plain')
    }))
  }
})

test('paste proposes plain and typed cells as one batch, and copy writes tab-separated text', async ({ page }) => {
  const errors = pageErrors(page)
  const { cell, events, clearEvents } = await openGanttSheetFixture(page)
  await cell('Alpha · Owner Ann').click()
  await writeClipboard(page, 'Zed\t7\r\nYu\t5\r\n')
  await page.keyboard.press('Control+V')
  await expect(cell('Beta · Hours 5')).toBeVisible()
  await expect(cell('Alpha · Owner Zed')).toBeVisible()
  expect(await events()).toEqual([['sheet-edit', {
    action: 'paste',
    fieldEdits: [
      { rowId: 'a', columnId: 'hours', fieldId: 'hours', before: 1, after: 7, source: 'keyboard' },
      { rowId: 'b', columnId: 'hours', fieldId: 'hours', before: 2, after: 5, source: 'keyboard' },
    ],
    cellEdits: [
      { rowId: 'a', columnId: 'owner', before: 'Ann', after: 'Zed' },
      { rowId: 'b', columnId: 'owner', before: 'Ben', after: 'Yu' },
    ],
  }]])

  // Shift+click selects a rectangle; copying it writes CRLF records, quoting a cell with a tab.
  await clearEvents()
  await cell('Alpha · Owner Zed').click()
  await writeClipboard(page, '"a\tb"')
  await page.keyboard.press('Control+V')
  await expect(cell('Alpha · Owner a\tb')).toBeVisible()
  await cell('Alpha · Owner a\tb').click()
  await cell('Beta · Hours 5').click({ modifiers: ['Shift'] })
  await expect(cell('Beta · Owner Yu')).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Control+C')
  expect(await readClipboard(page)).toBe('"a\tb"\t7\r\nYu\t5')

  // One copied value fills the whole selection.
  await clearEvents()
  await cell('Gamma · Owner Cy').click()
  await page.keyboard.press('Shift+ArrowDown')
  await writeClipboard(page, 'Q')
  await page.keyboard.press('Control+V')
  await expect(cell('Gamma · Owner Q')).toBeVisible()
  await expect(cell('Delta · Owner Q')).toBeVisible()

  // Cut copies the selection and clears it as one batch.
  await page.keyboard.press('Control+X')
  expect(await readClipboard(page)).toBe('Q\r\nQ')
  await expect(cell('Delta · Owner')).toBeVisible()
  expect(only(await events(), 'sheet-edit').map(entry => (entry[1] as { action: string }).action)).toEqual(['paste', 'clear'])
  expect(errors).toEqual([])
})

test('a read-only cell, ragged or oversized text, an unreadable value or validateSheetEdit rejects the whole batch', async ({ page }) => {
  const errors = pageErrors(page)
  const { cell, events } = await openGanttSheetFixture(page, '?limit')
  const notice = page.locator('.vw-sr-only[aria-live]')
  const paste = async (text: string) => {
    await writeClipboard(page, text)
    await page.keyboard.press('Control+V')
  }
  await cell('Gamma · Owner Cy').click()
  await paste('x\t1\tz')
  await expect(notice).toHaveText('Gamma · Code: Read-only cell.')
  await paste('a\tb\r\nc')
  await expect(notice).toHaveText('The pasted rows must have the same number of cells.')
  await cell('Delta · Owner Di').click()
  await paste('a\r\nb')
  await expect(notice).toHaveText('The pasted cells extend past the table.')
  await cell('Alpha · Hours 1').click()
  await paste('99')
  await expect(notice).toContainText('Alpha · Hours:')
  // Nine hours in every row add up to 45 > 30: validateSheetEdit rejects the batch and receives it.
  await cell('Phase · Hours 8').click()
  await page.keyboard.press('Shift+ArrowDown')
  await page.keyboard.press('Shift+ArrowDown')
  await page.keyboard.press('Shift+ArrowDown')
  await page.keyboard.press('Shift+ArrowDown')
  await paste('9')
  await expect(notice).toHaveText('Total hours exceed 30.')
  const log = await events()
  expect(only(log, 'sheet-edit')).toEqual([])
  const rejected = only(log, 'sheet-edit-rejected')
  expect(rejected).toHaveLength(5)
  expect(rejected.slice(0, 4).every(entry => entry[2] === null)).toBe(true)
  expect((rejected[4]![2] as { fieldEdits: unknown[] }).fieldEdits).toHaveLength(5)
  await expect(cell('Gamma · Owner Cy')).toBeVisible()
  await expect(cell('Delta · Hours 4')).toBeVisible()
  expect(errors).toEqual([])
})

test('keys move, extend and collapse the selection; typing, Enter, Tab and Escape edit like a spreadsheet', async ({ page }) => {
  const errors = pageErrors(page)
  const { chart, cell, events, clearEvents } = await openGanttSheetFixture(page)
  await expect(chart.locator('.vw-sheet-cell[tabindex="0"]')).toHaveCount(1)
  await cell('Alpha · Owner Ann').click()
  await page.keyboard.press('ArrowRight')
  await expect(cell('Alpha · Hours 1')).toBeFocused()
  await page.keyboard.press('Shift+ArrowDown')
  await expect(cell('Beta · Hours 2')).toBeFocused()
  await expect(chart.locator('.vw-sheet-cell[aria-pressed="true"]')).toHaveCount(2)
  await expect(chart.locator('.vw-sheet-cell[tabindex="0"]')).toHaveAccessibleName('Beta · Hours 2')
  await page.keyboard.press('Escape')
  await expect(chart.locator('.vw-sheet-cell[aria-pressed="true"]')).toHaveCount(1)
  await page.keyboard.press('Tab')
  await expect(cell('Beta · Code B')).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(cell('Beta · Hours 2')).toBeFocused()
  await page.keyboard.press('Home')
  await expect(cell('Beta · Owner Ben')).toBeFocused()
  await page.keyboard.press('Control+A')
  await expect(chart.locator('.vw-sheet-cell[aria-pressed="true"]')).toHaveCount(15)
  await page.keyboard.press('Escape')

  // Delete clears an optional typed cell to null and a plain cell to empty text.
  await cell('Beta · Hours 2').click()
  await page.keyboard.press('Delete')
  await expect(cell('Beta · Hours')).toBeVisible()
  await cell('Beta · Owner Ben').click()
  await page.keyboard.press('Backspace')
  await expect(cell('Beta · Owner')).toBeVisible()
  expect(only(await events(), 'sheet-edit').map(entry => entry[1])).toEqual([
    { action: 'clear', fieldEdits: [{ rowId: 'b', columnId: 'hours', fieldId: 'hours', before: 2, after: null, source: 'keyboard' }], cellEdits: [] },
    { action: 'clear', fieldEdits: [], cellEdits: [{ rowId: 'b', columnId: 'owner', before: 'Ben', after: '' }] },
  ])

  // Typing replaces the text; Enter commits one field-edit and moves down.
  await clearEvents()
  await cell('Gamma · Hours 3').click()
  await page.keyboard.press('1')
  const gamma = chart.getByRole('textbox', { name: 'Gamma · Hours', exact: true })
  await expect(gamma).toHaveValue('1')
  await page.keyboard.type('2')
  await page.keyboard.press('Enter')
  await expect(cell('Delta · Hours 4')).toBeFocused()
  await expect(cell('Gamma · Hours 12')).toBeVisible()
  expect(await events()).toEqual([['field-edit', { rowId: 'c', columnId: 'hours', fieldId: 'hours', before: 3, after: 12, source: 'keyboard' }]])

  // Text a field cannot read keeps the editor open; Escape cancels and returns focus to the cell.
  await page.keyboard.type('99')
  const delta = chart.getByRole('textbox', { name: 'Delta · Hours', exact: true })
  await page.keyboard.press('Enter')
  await expect(delta).toHaveAttribute('aria-invalid', 'true')
  await page.keyboard.press('Escape')
  await expect(cell('Delta · Hours 4')).toBeFocused()

  // Tab commits a plain cell with cell-edit and moves along the row; F2 and double-click open the editor too.
  await cell('Gamma · Owner Cy').click()
  await page.keyboard.type('Xyz')
  await page.keyboard.press('Tab')
  await expect(cell('Gamma · Hours 12')).toBeFocused()
  await expect(cell('Gamma · Owner Xyz')).toBeVisible()
  await page.keyboard.press('F2')
  await expect(chart.getByRole('textbox', { name: 'Gamma · Hours', exact: true })).toHaveValue('12')
  await page.keyboard.press('Escape')
  await cell('Delta · Owner Di').dblclick()
  await expect(chart.getByRole('textbox', { name: 'Delta · Owner', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(cell('Delta · Owner Di')).toBeFocused()

  // A read-only cell announces why typing does nothing.
  await cell('Gamma · Code C').click()
  await page.keyboard.press('k')
  await expect(page.locator('.vw-sr-only[aria-live]')).toHaveText('Gamma · Code: Read-only cell.')
  expect(errors).toEqual([])
})

test('the fill handle fills down by pointer without a bar drop; Escape and new rows cancel it', async ({ page }) => {
  const errors = pageErrors(page)
  const { chart, cell, events, clearEvents } = await openGanttSheetFixture(page, '?droppable')
  await cell('Alpha · Owner Ann').click()
  await cell('Alpha · Hours 1').click({ modifiers: ['Shift'] })
  const handle = chart.locator('.vw-sheet-fill')
  const start = await centerOf(handle)
  const target = await centerOf(chart.getByRole('button', { name: /^Bar Delta/ }))
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(target.x + 60, target.y, { steps: 6 })
  await expect(cell('Gamma · Owner Cy')).toHaveClass(/vw-is-filling/)
  await page.mouse.up()
  await expect(cell('Delta · Hours 1')).toBeVisible()
  const log = await events()
  expect(only(log, 'bar-drop')).toEqual([])
  expect(only(log, 'sheet-edit')).toEqual([['sheet-edit', {
    action: 'fill',
    fieldEdits: ['b', 'c', 'd'].map((rowId, i) => ({ rowId, columnId: 'hours', fieldId: 'hours', before: i + 2, after: 1, source: 'pointer' })),
    cellEdits: [['b', 'Ben'], ['c', 'Cy'], ['d', 'Di']].map(([rowId, before]) => ({ rowId, columnId: 'owner', before, after: 'Ann' })),
  }]])
  await expect(chart.locator('.vw-sheet-cell[aria-pressed="true"]')).toHaveCount(8)

  // Escape during the drag cancels it.
  await clearEvents()
  await cell('Phase · Owner Pam').click()
  const from = await centerOf(handle)
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x, target.y, { steps: 4 })
  await page.keyboard.press('Escape')
  await page.mouse.up()
  // New rows during the drag cancel it too.
  await page.mouse.move(from.x, from.y)
  await page.mouse.down()
  await page.mouse.move(from.x, target.y, { steps: 4 })
  await page.getByRole('button', { name: 'Replace rows', exact: true }).evaluate(button => (button as HTMLButtonElement).click())
  await page.mouse.up()
  expect(await events()).toEqual([])
  await expect(cell('Alpha · Owner Ann')).toBeVisible()

  // Ctrl+D fills down from the first selected row.
  await cell('Alpha · Owner Ann').click()
  await writeClipboard(page, 'Bo')
  await page.keyboard.press('Control+V')
  await cell('Alpha · Owner Bo').click()
  await page.keyboard.press('Shift+ArrowDown')
  await page.keyboard.press('Shift+ArrowDown')
  await page.keyboard.press('Shift+ArrowDown')
  await page.keyboard.press('Control+d')
  await expect(cell('Delta · Owner Bo')).toBeVisible()
  expect(errors).toEqual([])
})

test('a fill handle drag reports Escape, cancelEdit() and new rows through edit-cancel, and survives unrelated prop changes', async ({ page }) => {
  const errors = pageErrors(page)
  const { chart, cell, events, clearEvents } = await openGanttSheetFixture(page, '?cancels')
  const handle = chart.locator('.vw-sheet-fill')
  const target = await centerOf(cell('Delta · Owner Di'))
  /** Select Alpha's owner and drag its fill handle down to Delta, keeping the button pressed. */
  async function startFill() {
    await cell('Alpha · Owner Ann').click()
    const from = await centerOf(handle)
    await page.mouse.move(from.x, from.y)
    await page.mouse.down()
    await page.mouse.move(from.x, target.y, { steps: 4 })
    await expect(cell('Gamma · Owner Cy')).toHaveClass(/vw-is-filling/)
  }
  const press = (name: string) => page.getByRole('button', { name, exact: true }).evaluate(button => (button as HTMLButtonElement).click())
  for (const [cancel, reason] of [
    [() => page.keyboard.press('Escape'), 'escape'],
    [() => press('Cancel edit'), 'api'],
    [() => press('Replace rows'), 'source-changed'],
  ] as const) {
    await clearEvents()
    await startFill()
    await cancel()
    await expect(cell('Gamma · Owner Cy')).not.toHaveClass(/vw-is-filling/)
    await page.mouse.up()
    expect(await events(), reason).toEqual([['edit-cancel', { reason, barIds: [] }]])
  }
  // A prop that does not change the rows, such as `now`, neither rebuilds the rows nor cancels the drag.
  await clearEvents()
  await startFill()
  await press('Next now')
  await press('Next now')
  await expect(cell('Gamma · Owner Cy')).toHaveClass(/vw-is-filling/)
  await page.mouse.up()
  const log = await events()
  expect(only(log, 'edit-cancel')).toEqual([])
  expect(only(log, 'sheet-edit')).toHaveLength(1)
  await expect(cell('Delta · Owner Ann')).toBeVisible()
  expect(errors).toEqual([])
})

test('touch taps select cells and the fill handle fills by touch', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', realTouchChromiumOnly)
  const errors = pageErrors(page)
  const { chart, cell, events } = await openGanttSheetFixture(page)
  const cdp = await page.context().newCDPSession(page)
  const tap = async (point: { x: number; y: number }) => {
    await touch(cdp, 'touchStart', [point])
    await touch(cdp, 'touchEnd', [])
  }
  await tap(await centerOf(cell('Alpha · Hours 1')))
  await expect(cell('Alpha · Hours 1')).toHaveAttribute('aria-pressed', 'true')
  const from = await centerOf(chart.locator('.vw-sheet-fill'))
  const to = await centerOf(cell('Gamma · Hours 3'))
  await touch(cdp, 'touchStart', [from])
  for (let i = 1; i <= 5; i++) await touch(cdp, 'touchMove', [{ x: from.x, y: from.y + (to.y - from.y) * i / 5 }])
  await touch(cdp, 'touchEnd', [])
  await expect(cell('Gamma · Hours 1')).toBeVisible()
  expect(only(await events(), 'sheet-edit')).toHaveLength(1)
  expect(errors).toEqual([])
})

test('a keyboard cut clears the cells when the browser runs the copy but execCommand reports false (WebKit)', async ({ page }) => {
  const errors = pageErrors(page)
  const { cell, events, clearEvents } = await openGanttSheetFixture(page)
  // WebKit runs the copy event of execCommand('copy') from a cell that holds no text selection, and returns false.
  await page.evaluate(() => {
    document.execCommand = (command: string) => {
      if (command !== 'copy') return false
      // Firefox builds the event's clipboard data from dataType and data and ignores clipboardData (see clipboardEvent).
      const data = new DataTransfer()
      const init: ClipboardEventInit & { dataType: string; data: string } = {
        clipboardData: data, dataType: 'text/plain', data: '', bubbles: true, cancelable: true,
      }
      const event = new ClipboardEvent('copy', init)
      document.activeElement!.dispatchEvent(event)
      ;(window as any).__vwCut = (event.clipboardData ?? data).getData('text/plain')
      return false
    }
  })
  await clearEvents()
  await cell('Gamma · Owner Cy').click()
  await page.keyboard.press('Shift+ArrowDown')
  await page.keyboard.press('Control+X')
  expect(await page.evaluate(() => (window as any).__vwCut)).toBe('Cy\r\nDi')
  await expect(cell('Gamma · Owner')).toBeVisible()
  await expect(cell('Delta · Owner')).toBeVisible()
  expect(only(await events(), 'sheet-edit').map(entry => (entry[1] as { action: string }).action)).toEqual(['clear'])
  expect(errors).toEqual([])
})

test('collapsed rows stay out of the sheet, slots own their cells, read-only charts reject and RTL arrows follow the view', async ({ page }) => {
  const errors = pageErrors(page)
  const { chart, cell } = await openGanttSheetFixture(page)
  await chart.getByRole('button', { name: 'Collapse Phase', exact: true }).click()
  await cell('Phase · Owner Pam').click()
  await page.keyboard.press('Control+A')
  await page.keyboard.press('Control+C')
  expect(await readClipboard(page)).toBe('Pam\t8\tP\r\nCy\t3\tC\r\nDi\t4\tD')

  const slotted = await openGanttSheetFixture(page, '?slot')
  await expect(slotted.chart.locator('.vw-sheet-cell')).toHaveCount(0)
  await expect(slotted.chart.getByText('Pam', { exact: true })).toBeVisible()

  const readonly = await openGanttSheetFixture(page, '?readonly')
  await readonly.cell('Alpha · Owner Ann').click()
  await expect(readonly.chart.locator('.vw-sheet-fill')).toHaveCount(0)
  await page.keyboard.press('Delete')
  await expect(page.locator('.vw-sr-only[aria-live]')).toHaveText('Alpha · Owner: Read-only cell.')

  const rtl = await openGanttSheetFixture(page, '?rtl')
  await rtl.cell('Alpha · Owner Ann').click()
  await page.keyboard.press('ArrowLeft')
  await expect(rtl.cell('Alpha · Hours 1')).toBeFocused()
  expect(errors).toEqual([])
})
