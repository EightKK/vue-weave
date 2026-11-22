// TreeGrid: treegrid keyboard navigation inside and outside the rendered window, expansion and lazy children,
// activation payloads and linked highlights, cell and spreadsheet editing, row structure proposals, undo and RTL.
import { expect, test, openExample, pageErrors, serveFixture, type Page } from './support'

async function openTreeGrid(page: Page) {
  const errors = pageErrors(page)
  await openExample(page, 'tree-grid')
  const demo = page.locator('section[aria-labelledby="tree-grid-title"]')
  const grid = demo.getByRole('treegrid', { name: 'Product matrix', exact: true })
  await expect(grid).toBeVisible()
  return {
    errors, demo, grid,
    header: (name: string) => grid.getByRole('rowheader', { name, exact: true }),
    row: (name: string) => grid.getByRole('row').filter({ has: page.getByRole('rowheader', { name, exact: true }) }),
    status: demo.getByRole('status', { name: 'Tree grid status', exact: true }),
    selection: demo.getByRole('status', { name: 'Tree grid selection', exact: true }),
    button: (name: string) => demo.getByRole('button', { name, exact: true }),
    announcement: grid.locator('xpath=..').locator('[aria-live="polite"]'),
  }
}

/** Role, row index, column index and text of the focused element. */
const focused = (page: Page) => page.evaluate(() => {
  const el = document.activeElement as HTMLElement
  const row = el.closest('[role="row"]')
  return {
    role: el.getAttribute('role'), col: Number(el.getAttribute('aria-colindex')), row: Number(row?.getAttribute('aria-rowindex')),
    name: el.getAttribute('aria-label') ?? el.textContent!.trim(), inGrid: Boolean(el.closest('[role="treegrid"]')),
  }
})

/** Whether the focused element lies inside the scroller's visible area (not under the sticky header or tree column). */
const focusedVisible = (page: Page) => page.evaluate(() => {
  const el = document.activeElement as HTMLElement
  const grid = el.closest('[role="treegrid"]') as HTMLElement
  const box = el.getBoundingClientRect(), view = grid.getBoundingClientRect()
  const tree = el.getAttribute('role') === 'rowheader' ? 0 : 260
  return box.top >= view.top + 36 - 1 && box.bottom <= view.top + grid.clientHeight + 1
    && box.left >= view.left + tree - 1 && box.right <= view.left + grid.clientWidth + 1
})

/** Sends clipboard events with a DataTransfer to the focused element and returns the copied text. */
const clipboard = (page: Page, type: 'copy' | 'cut' | 'paste', text = '') => page.evaluate(([kind, value]) => {
  const data = new DataTransfer()
  if (value) data.setData('text/plain', value)
  document.activeElement!.dispatchEvent(new ClipboardEvent(kind, { clipboardData: data, bubbles: true, cancelable: true }))
  return data.getData('text/plain')
}, [type, text] as const)

/** Text of a data cell in the row with this header, by column index (aria-colindex). */
const cellOf = (row: ReturnType<Awaited<ReturnType<typeof openTreeGrid>>['row']>, colindex: number) => row.locator(`[role="gridcell"][aria-colindex="${colindex}"]`)

test('tree grid semantics: counts, levels, expansion and a bounded window of cells', async ({ page }) => {
  const { errors, grid, row, header } = await openTreeGrid(page)
  await expect(grid).toHaveAttribute('aria-rowcount', '118')
  await expect(grid).toHaveAttribute('aria-colcount', '31')
  await expect(grid.getByRole('columnheader', { name: 'Product', exact: true })).toHaveAttribute('aria-colindex', '1')
  await expect(row('Tools')).toHaveAttribute('aria-level', '1')
  await expect(row('Tools')).toHaveAttribute('aria-expanded', 'true')
  await expect(row('Tools Basic 001')).toHaveAttribute('aria-level', '3')
  await expect(row('Tools Basic 001')).not.toHaveAttribute('aria-expanded', /.*/)
  await expect(row('Tools Basic 001')).toHaveAttribute('aria-setsize', '100')
  await expect(cellOf(row('Tools Basic 001'), 2)).toHaveText('SKU-00000')
  await expect(cellOf(row('Tools Basic 001'), 6)).toHaveText('Northwind')
  // Distinct states: a listed 0, known none, unknown (missing) and not applicable.
  await expect(row('Tools Basic 012').getByRole('gridcell', { name: 'Not applicable' }).first()).toBeVisible()
  await expect(row('Tools Basic 001').getByRole('gridcell', { name: 'Unknown' }).first()).toBeAttached()
  expect(await grid.getByRole('gridcell').count()).toBeLessThan(1000)
  await expect(header('Tools')).toHaveAttribute('tabindex', '0')
  expect(errors).toEqual([])
})

test('arrows, Home/End, Ctrl+Home/End and PageUp/PageDown move focus beyond the rendered window', async ({ page }) => {
  const { errors, grid, header } = await openTreeGrid(page)
  await page.getByRole('button', { name: 'Redo', exact: true }).focus()
  await page.keyboard.press('Shift+Tab')
  await page.getByRole('button', { name: 'Undo', exact: true }).focus()
  // Tab from the controls lands on the roving tab stop, the first row header.
  await header('Tools').focus()
  await page.keyboard.press('ArrowDown')
  await expect(header('Tools Basic')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  expect(await focused(page)).toMatchObject({ role: 'gridcell', col: 2, row: 3 })
  await page.keyboard.press('End')
  expect(await focused(page)).toMatchObject({ role: 'gridcell', col: 31, row: 3, inGrid: true })
  expect(await focusedVisible(page)).toBe(true)
  await expect(grid.getByRole('columnheader', { name: 'W24', exact: true })).toBeVisible()
  await page.keyboard.press('Home')
  await expect(header('Tools Basic')).toBeFocused()
  await page.keyboard.press('Control+End')
  expect(await focused(page)).toMatchObject({ role: 'gridcell', col: 31, row: 118 })
  expect(await focusedVisible(page)).toBe(true)
  await page.keyboard.press('Home')
  await expect(header('Archived products')).toBeFocused()
  await page.keyboard.press('Control+Home')
  await expect(header('Tools')).toBeFocused()
  expect(await grid.evaluate(el => el.scrollTop)).toBe(0)
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  const start = await focused(page)
  for (let i = 0; i < 6; i++) await page.keyboard.press('PageDown')
  const down = await focused(page)
  expect(down.col).toBe(start.col)
  expect(down.row).toBeGreaterThan(start.row + 50)
  expect(await focusedVisible(page)).toBe(true)
  for (let i = 0; i < 6; i++) await page.keyboard.press('PageUp')
  expect(await focused(page)).toMatchObject({ row: start.row, col: start.col })
  expect(errors).toEqual([])
})

test('the focused cell stays rendered and focused through far wheel scrolls, without a focusout', async ({ page }) => {
  const { errors, grid, header } = await openTreeGrid(page)
  await header('Tools Basic 002').click()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  expect(await focused(page)).toMatchObject({ role: 'gridcell', col: 3, row: 5 })
  await page.evaluate(() => {
    const w = window as unknown as { __blurs: number }
    w.__blurs = 0
    document.addEventListener('focusout', () => { w.__blurs++ }, true)
  })
  await grid.hover()
  for (let i = 0; i < 6; i++) await page.mouse.wheel(600, 900)
  await expect.poll(() => grid.evaluate(el => el.scrollTop)).toBeGreaterThan(2000)
  for (let i = 0; i < 6; i++) await page.mouse.wheel(-600, -900)
  await expect.poll(() => grid.evaluate(el => el.scrollTop)).toBe(0)
  for (let i = 0; i < 6; i++) await page.mouse.wheel(1200, 1200)
  expect(await focused(page)).toMatchObject({ role: 'gridcell', col: 3, row: 5, inGrid: true })
  expect(await page.evaluate(() => (window as unknown as { __blurs: number }).__blurs)).toBe(0)
  // Keys continue from the focused cell and scroll it back.
  await page.keyboard.press('ArrowDown')
  expect(await focused(page)).toMatchObject({ role: 'gridcell', col: 3, row: 6 })
  expect(await focusedVisible(page)).toBe(true)
  expect(errors).toEqual([])
})

test('expand and collapse, lazy children with a status line, a failed load and its retry', async ({ page }) => {
  const { errors, grid, row, header, demo } = await openTreeGrid(page)
  await header('Tools').click()
  await page.keyboard.press('ArrowLeft')
  await expect(row('Tools')).toHaveAttribute('aria-expanded', 'false')
  await expect(grid).toHaveAttribute('aria-rowcount', '13')
  await page.keyboard.press('ArrowRight')
  await expect(row('Tools')).toHaveAttribute('aria-expanded', 'true')
  // Collapsing an ancestor of the focused cell moves focus to the nearest shown ancestor.
  await header('Tools Basic 003').click()
  await page.keyboard.press('ArrowRight')
  await header('Tools').locator('.vw-tree-grid-toggle').click()
  await expect(header('Tools')).toBeFocused()
  // The lazy group: expanding asks the parent to load; a status line shows the state.
  await demo.getByRole('checkbox', { name: 'Fail next load' }).check()
  await header('Tools').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Home')
  await expect(header('Archived products')).toBeFocused()
  await page.keyboard.press('ArrowRight')
  await expect(row('Archived products')).toHaveAttribute('aria-expanded', 'true')
  await expect(grid.getByRole('status')).toHaveText('Loading…')
  await expect(grid.getByRole('status')).toHaveText('Failed to load')
  await page.keyboard.press('ArrowDown')
  await expect(page.locator(':focus')).toHaveAttribute('aria-label', 'Failed to load')
  await page.keyboard.press('Enter')
  await expect(grid.getByRole('status')).toHaveText('Loading…')
  await expect(header('Archived 01')).toBeVisible()
  await expect(grid.getByRole('status')).toHaveCount(0)
  await expect(row('Archived 01')).toHaveAttribute('aria-level', '2')
  expect(errors).toEqual([])
})

test('activation reports rows, cells and entities and links highlights with the graph', async ({ page }) => {
  const { errors, demo, grid, header, row, status, selection } = await openTreeGrid(page)
  await header('Tools Basic 001').click()
  await expect(status).toHaveText('Activated Tools Basic 001 by pointer; entities product:p0.')
  await expect(row('Tools Basic 001')).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(status).toHaveText('Activated Tools Basic 002 by keyboard; entities product:p1.')
  // The supplier cell stands for a supplier entity: the graph highlights its node, and every cell of that supplier.
  for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(status).toHaveText('Activated Tools Basic 002 · supplier by keyboard; entities supplier:sup-1.')
  await expect(selection).toContainText('Linked: sup-1')
  const graph = demo.getByRole('img', { name: 'Categories and suppliers' })
  await expect(graph.locator('.vw-network-node.vw-is-highlighted')).toHaveCount(1)
  await expect(cellOf(row('Tools Basic 002'), 6)).toHaveClass(/vw-is-highlighted/)
  await expect(cellOf(row('Tools Basic 001'), 6)).not.toHaveClass(/vw-is-highlighted/)
  // A graph selection highlights the linked rows.
  await graph.getByRole('button', { name: 'Garden Pro', exact: true }).click()
  await grid.evaluate(el => { el.scrollTop = 3300 })
  await expect(row('Garden Pro')).toHaveClass(/vw-is-highlighted/)
  await expect(row('Tools Basic 002')).toHaveAttribute('aria-selected', 'false')
  expect(errors).toEqual([])
})

test('cell editing: typing, typed editors, Enter, Tab, Escape and an inline rejection', async ({ page }) => {
  const { errors, grid, header, row, status } = await openTreeGrid(page)
  await header('Tools Basic 001').click()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  // Typing starts the editor with the typed text; Enter commits and moves down.
  await page.keyboard.type('42')
  const editor = grid.getByRole('textbox', { name: 'Edit Price for Tools Basic 001', exact: true })
  await expect(editor).toBeFocused()
  await expect(editor).toHaveValue('42')
  await page.keyboard.press('Enter')
  await expect(status).toHaveText('Tools Basic 001 · price: 5 → 42.')
  await expect(cellOf(row('Tools Basic 001'), 3)).toHaveText('42')
  expect(await focused(page)).toMatchObject({ role: 'gridcell', col: 3, row: 5 })
  // F2 opens with the current text; Escape cancels and returns focus to the cell.
  await page.keyboard.press('F2')
  const second = grid.getByRole('textbox', { name: 'Edit Price for Tools Basic 002', exact: true })
  await expect(second).toHaveValue('42.25')
  await page.keyboard.type('99')
  await page.keyboard.press('Escape')
  await expect(second).toHaveCount(0)
  await expect(status).toHaveText('Edit cancelled (cell, escape).')
  expect(await focused(page)).toMatchObject({ role: 'gridcell', col: 3, row: 5 })
  // A rejected value keeps the editor open with the reason shown and announced.
  await page.keyboard.type('20000')
  await page.keyboard.press('Enter')
  await expect(second).toHaveAttribute('aria-invalid', 'true')
  await expect(grid.getByText('Prices above 10,000 need approval.')).toBeVisible()
  await expect(status).toHaveText('Rejected: Prices above 10,000 need approval.')
  await page.keyboard.press('Escape')
  // A parse error from the typed editor; Tab commits and moves right.
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  const launch = grid.getByRole('textbox', { name: 'Edit Launch for Tools Basic 002', exact: true })
  await launch.fill('2025-02-30')
  await page.keyboard.press('Enter')
  await expect(launch).toHaveAttribute('aria-invalid', 'true')
  await expect(grid.getByText('Not a calendar date: 2025-02-30')).toBeVisible()
  await launch.fill('2025-02-03')
  await page.keyboard.press('Tab')
  await expect(cellOf(row('Tools Basic 002'), 5)).toHaveText('2025-02-03')
  expect(await focused(page)).toMatchObject({ role: 'gridcell', col: 6, row: 5 })
  // A select editor, and a checkbox that toggles at once.
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('Enter')
  const select = grid.getByRole('combobox', { name: 'Edit Status for Tools Basic 002', exact: true })
  await select.selectOption('discontinued')
  await select.press('Enter')
  await expect(cellOf(row('Tools Basic 002'), 4)).toHaveText('Discontinued')
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowUp')
  for (let i = 0; i < 3; i++) await page.keyboard.press('ArrowRight')
  await expect(cellOf(row('Tools Basic 001'), 7)).toHaveText('No')
  // Typing a letter does not toggle a checkbox; Space does.
  await page.keyboard.press('a')
  await expect(cellOf(row('Tools Basic 001'), 7)).toHaveText('No')
  await page.keyboard.press('Space')
  await expect(cellOf(row('Tools Basic 001'), 7)).toHaveText('Yes')
  // A double-click opens the editor too; a category row is read-only.
  await cellOf(row('Tools Basic 001'), 2).dblclick()
  await expect(grid.getByRole('textbox', { name: 'Edit SKU for Tools Basic 001', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(cellOf(row('Tools'), 2)).toHaveAttribute('aria-readonly', 'true')
  expect(errors).toEqual([])
})

test('IME composition commits once, after the composition ends', async ({ page }) => {
  const { errors, grid, header, row, status } = await openTreeGrid(page)
  await header('Tools Basic 001').click()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('F2')
  const editor = grid.getByRole('textbox', { name: 'Edit SKU for Tools Basic 001', exact: true })
  await expect(editor).toBeFocused()
  await editor.evaluate((input: HTMLInputElement) => {
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    input.value = 'にほん'
    input.dispatchEvent(new InputEvent('input', { bubbles: true, isComposing: true }))
    // The Enter that confirms the composition belongs to the input method.
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, isComposing: true }))
  })
  await expect(editor).toBeVisible()
  await expect(status).not.toContainText('sku')
  await editor.evaluate((input: HTMLInputElement) => {
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'にほん' }))
  })
  await page.keyboard.press('Enter')
  await expect(status).toHaveText('Tools Basic 001 · sku: SKU-00000 → にほん.')
  await expect(cellOf(row('Tools Basic 001'), 2)).toHaveText('にほん')
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(cellOf(row('Tools Basic 001'), 2)).toHaveText('SKU-00000')
  expect(errors).toEqual([])
})

test('an open editor is cancelled when the source data changes', async ({ page }) => {
  const { errors, grid, header, status } = await openTreeGrid(page)
  await header('Tools').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Control+Home')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('F2')
  await expect(grid.getByRole('textbox', { name: 'Edit SKU for Tools Basic 001', exact: true })).toBeVisible()
  // The lazy load replaces the rows while the editor is open.
  await expect(status).toHaveText('Edit cancelled (cell, source-changed).')
  await expect(grid.getByRole('textbox')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('spreadsheet ranges: copy, paste beyond the window, fill down, the fill handle, clear and undo', async ({ page }) => {
  const { errors, grid, header, row, status, button } = await openTreeGrid(page)
  await header('Tools Basic 001').click()
  for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowRight')
  // W01..W02 of rows 001 and 002.
  await page.keyboard.press('Shift+ArrowRight')
  await page.keyboard.press('Shift+ArrowDown')
  await expect(grid.locator('.vw-tree-grid-cell.vw-is-in-range')).toHaveCount(4)
  const copied = await clipboard(page, 'copy')
  expect(copied.split('\r\n')).toHaveLength(2)
  // A paste of 60 lines into W01 reaches rows that are not rendered.
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('ArrowLeft')
  const lines = Array.from({ length: 60 }, (_, i) => String(i + 1)).join('\n')
  await clipboard(page, 'paste', lines)
  await expect(status).toHaveText('paste: 60 cells changed.')
  await expect(row('Tools Basic 060')).toHaveCount(0)
  await grid.evaluate(el => { el.scrollTop = 1800 })
  await expect(cellOf(row('Tools Basic 060'), 8)).toHaveText('60')
  // An oversized paste is rejected as a whole.
  await header('Tools Basic 001').click()
  await page.keyboard.press('End')
  await clipboard(page, 'paste', '1\t2\t3')
  await expect(status).toHaveText('Rejected: The pasted cells do not fit in the grid.')
  // Fill down with Ctrl+D over a range of W01.
  await page.keyboard.press('Home')
  for (let i = 0; i < 7; i++) await page.keyboard.press('ArrowRight')
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowDown')
  await page.keyboard.press('Control+d')
  await expect(status).toHaveText('fill: 3 cells changed.')
  await expect(cellOf(row('Tools Basic 004'), 8)).toHaveText('1')
  // The fill handle drags the range down.
  const handle = grid.locator('.vw-tree-grid-fill-handle')
  const box = (await handle.boundingBox())!
  await page.mouse.move(box.x + 3, box.y + 3)
  await page.mouse.down()
  await page.mouse.move(box.x + 3, box.y + 3 + 32 * 2, { steps: 4 })
  await page.mouse.up()
  await expect(status).toHaveText('fill: 2 cells changed.')
  await expect(cellOf(row('Tools Basic 006'), 8)).toHaveText('1')
  // Delete clears the range (here one cell); undo restores it.
  await page.keyboard.press('Escape')
  await cellOf(row('Tools Basic 006'), 8).click()
  await page.keyboard.press('Delete')
  await expect(status).toHaveText('clear: 1 cells changed.')
  await expect(cellOf(row('Tools Basic 006'), 8)).toContainText('Unknown')
  await button('Undo').click()
  await expect(cellOf(row('Tools Basic 006'), 8)).toHaveText('1')
  expect(errors).toEqual([])
})

test('row structure: create, delete with descendants, keyboard moves, rejection and undo', async ({ page }) => {
  const { errors, grid, header, row, status, button } = await openTreeGrid(page)
  await header('Tools Basic 001').click()
  await page.keyboard.press('Control+Enter')
  await expect(status).toHaveText('Added New product 1.')
  await expect(header('New product 1')).toBeFocused()
  await expect(row('New product 1')).toHaveAttribute('aria-posinset', '2')
  // Alt+Down moves it one place; Alt+Shift+Left outdents a product to the top level, which the parent rejects.
  await page.keyboard.press('Alt+ArrowDown')
  await expect(status).toHaveText('Moved New product 1 into Tools Basic.')
  await expect(row('New product 1')).toHaveAttribute('aria-posinset', '3')
  await expect(header('New product 1')).toBeFocused()
  await page.keyboard.press('Alt+Shift+ArrowLeft')
  await page.keyboard.press('Alt+Shift+ArrowLeft')
  await expect(status).toHaveText('Rejected: A product needs a category.')
  // Delete removes a row with its descendants; a top-level category is protected.
  await grid.evaluate(el => { el.scrollTop = 3000 })
  await header('Tools Pro').click()
  await page.keyboard.press('Delete')
  await expect(status).toHaveText('Deleted Tools Pro with its rows.')
  await expect(header('Tools Pro')).toHaveCount(0)
  await header('Garden').click()
  await grid.getByRole('button', { name: 'Delete Garden', exact: true }).click()
  await expect(status).toHaveText('Rejected: Top-level categories cannot be deleted.')
  // The row action buttons add a child row.
  await grid.getByRole('button', { name: 'Add child row to Garden', exact: true }).click()
  await expect(status).toHaveText('Added New group 2.')
  await expect(row('New group 2')).toHaveAttribute('aria-level', '2')
  await button('Undo').click()
  await button('Undo').click()
  await expect(grid).toHaveAttribute('aria-rowcount', '119')
  await expect(header('Tools Pro')).toBeAttached()
  await expect(header('New group 2')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('row structure: a pointer drag moves a row inside another, and data changes cancel a drag', async ({ page }) => {
  const { errors, grid, header, row, status } = await openTreeGrid(page)
  const source = (await header('Tools Basic 002').boundingBox())!
  const target = (await header('Tools Basic 005').boundingBox())!
  await page.mouse.move(source.x + 60, source.y + source.height / 2)
  await page.mouse.down()
  await page.mouse.move(target.x + 60, target.y + target.height / 2, { steps: 6 })
  await expect(row('Tools Basic 005')).toHaveClass(/vw-is-drop-inside/)
  await expect(grid.locator('xpath=..').locator('[aria-live="polite"]')).toHaveText('Move Tools Basic 002 into Tools Basic 005')
  await page.mouse.up()
  await expect(status).toHaveText('Moved Tools Basic 002 into Tools Basic 005.')
  await expect(row('Tools Basic 005')).toHaveAttribute('aria-expanded', 'false')
  // A drag in flight is cancelled when the rows change (the lazy group finishes loading).
  await header('Tools').click()
  await page.keyboard.press('Control+End')
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Control+Home')
  const again = (await header('Tools Basic 003').boundingBox())!
  await page.mouse.move(again.x + 60, again.y + again.height / 2)
  await page.mouse.down()
  await page.mouse.move(again.x + 60, again.y + again.height * 3, { steps: 4 })
  await expect(grid.locator('.vw-tree-grid-drop')).toHaveCount(1)
  await expect(status).toHaveText('Edit cancelled (row-move, source-changed).')
  await expect(grid.locator('.vw-tree-grid-drop')).toHaveCount(0)
  await page.mouse.up()
  await expect(status).toHaveText('Edit cancelled (row-move, source-changed).')
  expect(errors).toEqual([])
})

test('right-to-left: the tree column is on the right and the arrow keys follow the visual direction', async ({ page }) => {
  const { errors, demo, grid, header, row } = await openTreeGrid(page)
  await demo.getByRole('checkbox', { name: 'Right to left' }).check()
  await expect(grid.locator('xpath=..')).toHaveAttribute('dir', 'rtl')
  const head = (await header('Tools Basic 001').boundingBox())!
  const cell = (await cellOf(row('Tools Basic 001'), 2).boundingBox())!
  expect(head.x).toBeGreaterThan(cell.x)
  await header('Tools Basic 001').click()
  await page.keyboard.press('ArrowLeft')
  expect(await focused(page)).toMatchObject({ role: 'gridcell', col: 2 })
  await page.keyboard.press('End')
  expect(await focused(page)).toMatchObject({ role: 'gridcell', col: 31 })
  await page.keyboard.press('ArrowRight')
  expect(await focused(page)).toMatchObject({ role: 'gridcell', col: 30 })
  await header('Tools').click()
  await page.keyboard.press('ArrowRight')
  await expect(row('Tools')).toHaveAttribute('aria-expanded', 'false')
  expect(errors).toEqual([])
})

test('the tree grid example shows its grid and controls in Japanese', async ({ page }) => {
  const errors = pageErrors(page)
  const demo = await openExample(page, 'tree-grid', { locale: 'ja' })
  await expect(demo.getByRole('treegrid', { name: '製品マトリクス' })).toBeVisible()
  await expect(demo.getByRole('button', { name: '元に戻す', exact: true })).toBeDisabled()
  await expect(demo.getByRole('checkbox', { name: '次の読み込みを失敗させる', exact: true })).toBeVisible()
  await expect(demo.getByRole('status', { name: 'ツリーグリッドの選択' })).toHaveText('連動しているものはありません。')
  expect(errors).toEqual([])
})

/** The fixture in fixtures/tree-grid.html: Pending (children loading), Group (One, Two), Bravo and Charlie. */
async function openTreeGridFixture(page: Page, search = '') {
  const errors = pageErrors(page)
  await serveFixture(page, 'tree-grid-test', 'tree-grid.html')
  await page.goto('/tree-grid-test/' + search)
  const grid = page.getByRole('treegrid')
  await expect(grid).toBeVisible()
  const row = (name: string) => grid.getByRole('row').filter({ has: page.getByRole('rowheader', { name, exact: true }) })
  const events = page.getByRole('status', { name: 'Events', exact: true })
  const logged = async () => (await events.textContent() ?? '').split('\n').filter(Boolean).map(line => JSON.parse(line))
  return { errors, grid, row, events, logged, header: (name: string) => grid.getByRole('rowheader', { name, exact: true }) }
}

test('fixture: copying a range with a status line and pasting it back in place changes nothing', async ({ page }) => {
  const { errors, row, header, logged } = await openTreeGridFixture(page)
  await cellOf(row('Pending'), 3).click()
  // Pending, its status line, Group: the copy leaves the status line out, as the paste skips it.
  await page.keyboard.press('Shift+ArrowDown')
  await page.keyboard.press('Shift+ArrowDown')
  const text = await clipboard(page, 'copy')
  expect(text).toBe('0\r\n1')
  await clipboard(page, 'paste', text)
  await expect(cellOf(row('Bravo'), 3)).toHaveText('4')
  await expect(cellOf(row('Group'), 3)).toHaveText('1')
  expect(await logged()).toEqual([])
  await header('Pending').click()
  expect(errors).toEqual([])
})

test('fixture: committing a select without changing it proposes nothing, also when a label equals another value', async ({ page }) => {
  const { errors, row, logged } = await openTreeGridFixture(page)
  await cellOf(row('Bravo'), 2).click()
  await page.keyboard.press('Enter')
  const select = page.getByRole('combobox', { name: 'Edit Status for Bravo', exact: true })
  await expect(select).toBeFocused()
  await select.press('Enter')
  await expect(select).toHaveCount(0)
  await expect(cellOf(row('Bravo'), 2)).toHaveText('Active')
  expect(await logged()).toEqual([])
  // Enter moved down to Charlie; back up, choosing the option labelled "A" proposes its value B.
  await page.keyboard.press('ArrowUp')
  await page.keyboard.press('Enter')
  await page.getByRole('combobox', { name: 'Edit Status for Bravo', exact: true }).selectOption('B')
  await page.keyboard.press('Enter')
  expect(await logged()).toEqual([['cell-edit', 'bravo', 'status', 'A', 'B']])
  expect(errors).toEqual([])
})

test('fixture: rows shown or hidden during a fill handle drag cancel it instead of filling from another row', async ({ page }) => {
  const { errors, grid, row, logged } = await openTreeGridFixture(page)
  await cellOf(row('One'), 3).click()
  const box = (await grid.locator('.vw-tree-grid-fill-handle').boundingBox())!
  await page.mouse.move(box.x + 3, box.y + 3)
  await page.mouse.down()
  await page.mouse.move(box.x + 3, box.y + 3 + 32 * 3, { steps: 4 })
  await page.evaluate(() => (window as unknown as { collapseGroup(): void }).collapseGroup())
  await expect(row('One')).toHaveCount(0)
  await page.mouse.up()
  expect(await logged()).toEqual([['edit-cancel', 'fill', 'source-changed']])
  await expect(cellOf(row('Bravo'), 3)).toHaveText('4')
  expect(errors).toEqual([])
})

test('fixture: fills respect maxSheetCells', async ({ page }) => {
  const { errors, row, logged } = await openTreeGridFixture(page, '?max=1')
  await cellOf(row('Group'), 3).click()
  for (let i = 0; i < 3; i++) await page.keyboard.press('Shift+ArrowDown')
  await page.keyboard.press('Control+d')
  expect(await logged()).toEqual([['sheet-edit-rejected', 'fill', 'The fill holds more than 1 cells']])
  await expect(cellOf(row('Two'), 3)).toHaveText('3')
  expect(errors).toEqual([])
})

test('fixture: an edit committed by moving the focus out of the grid leaves the focus there', async ({ page }) => {
  const { errors, row, logged } = await openTreeGridFixture(page)
  await cellOf(row('Bravo'), 3).click()
  await page.keyboard.press('7')
  const notes = page.getByRole('textbox', { name: 'Notes', exact: true })
  await notes.click()
  await expect.poll(logged).toEqual([['cell-edit', 'bravo', 'qty', 4, 7]])
  await expect(cellOf(row('Bravo'), 3)).toHaveText('7')
  await expect(notes).toBeFocused()
  await page.keyboard.type('ok')
  await expect(notes).toHaveValue('ok')
  expect(errors).toEqual([])
})

test('fixture: focusCell and startEdit refuse an unknown column', async ({ page }) => {
  const { errors } = await openTreeGridFixture(page)
  const result = await page.evaluate(() => {
    const grid = (window as unknown as { grid: { focusCell(p: object): boolean; startEdit(p: object): boolean } }).grid
    return [
      grid.focusCell({ rowId: 'bravo', columnId: 'retired' }), grid.startEdit({ rowId: 'bravo', columnId: 'retired' }),
      grid.focusCell({ rowId: 'bravo', columnId: 'qty' }), grid.focusCell({ rowId: 'bravo' }),
    ]
  })
  expect(result).toEqual([false, false, true, true])
  expect(errors).toEqual([])
})
