// TreeGrid header controls: column resizing (keyboard, pointer preview, cancellation, rejection, right-to-left), header
// sorting and filtering with the hierarchy kept, focus staying on the header controls, and the site example.
import { expect, expectStructuralAccessibility, test, openExample, pageErrors, serveFixture, type Page } from './support'

/** The fixture in fixtures/tree-grid-columns.html: Tools (Saw 30, Drill 120, Hammer 15) and Garden (Hose 25, Rake 8). */
async function openColumns(page: Page, search = '') {
  const errors = pageErrors(page)
  await serveFixture(page, 'tree-grid-columns-test', 'tree-grid-columns.html')
  await page.goto('/tree-grid-columns-test/' + search)
  const grid = page.getByRole('treegrid')
  await expect(grid).toBeVisible()
  const events = page.getByRole('status', { name: 'Events', exact: true })
  const logged = async () => (await events.textContent() ?? '').split('\n').filter(Boolean).map(line => JSON.parse(line))
  /** The row header names in display order. */
  const order = async () => (await grid.getByRole('rowheader').allTextContents()).map(text => text.trim())
  return {
    errors, grid, logged, order,
    header: (name: string) => grid.getByRole('columnheader', { name, exact: true }),
    button: (name: string) => grid.getByRole('button', { name, exact: true }),
    separator: (name: string) => grid.getByRole('separator', { name: 'Resize column ' + name, exact: true }),
    cell: (row: string, colindex: number) => grid.getByRole('row').filter({ has: page.getByRole('rowheader', { name: row, exact: true }) })
      .locator(`[role="gridcell"][aria-colindex="${colindex}"]`),
  }
}

const widthOf = (locator: ReturnType<Page['locator']>) => locator.evaluate(el => Math.round(el.getBoundingClientRect().width))

test('header sort buttons propose the next sort, and siblings are sorted within their parent', async ({ page }) => {
  const { errors, header, button, order, logged } = await openColumns(page)
  await expect(header('Price')).toHaveAttribute('aria-sort', 'none')
  await expect(header('Name')).toHaveAttribute('aria-sort', 'none')
  await button('Sort by Price').click()
  await expect(header('Price')).toHaveAttribute('aria-sort', 'ascending')
  await expect.poll(order).toEqual(['Tools', 'Hammer', 'Saw', 'Drill', 'Garden', 'Rake', 'Hose'])
  await expect(button('Sort by Price (ascending)')).toBeFocused()
  // Enter on the focused button: descending, and the focus stays on the button while the rows change.
  await page.keyboard.press('Enter')
  await expect(header('Price')).toHaveAttribute('aria-sort', 'descending')
  await expect.poll(order).toEqual(['Tools', 'Drill', 'Saw', 'Hammer', 'Garden', 'Hose', 'Rake'])
  await expect(button('Sort by Price (descending)')).toBeFocused()
  // A second column becomes the first rule; the earlier rule keeps its direction in its button's name only.
  await button('Sort by Name').click()
  await expect(header('Name')).toHaveAttribute('aria-sort', 'ascending')
  await expect(header('Price')).not.toHaveAttribute('aria-sort')
  await expect(button('Sort by Price (descending)')).toBeVisible()
  await expect.poll(order).toEqual(['Garden', 'Hose', 'Rake', 'Tools', 'Drill', 'Hammer', 'Saw'])
  // Space removes a descending rule.
  await button('Sort by Price (descending)').focus()
  await page.keyboard.press('Space')
  await expect(header('Price')).toHaveAttribute('aria-sort', 'none')
  expect((await logged()).filter(entry => entry[0] === 'sort').map(entry => entry[1])).toEqual([
    [{ ruleId: 'price', direction: 'asc' }], [{ ruleId: 'price', direction: 'desc' }],
    [{ ruleId: '$label', direction: 'asc' }, { ruleId: 'price', direction: 'desc' }], [{ ruleId: '$label', direction: 'asc' }],
  ])
  expect(errors).toEqual([])
})

test('header filters keep the ancestors of matching rows, and keys in the dialog stay out of the grid', async ({ page }) => {
  const { errors, grid, button, order, logged } = await openColumns(page)
  await button('Filter Status').click()
  const dialog = grid.getByRole('dialog', { name: 'Filter Status', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('searchbox', { name: 'Contains' })).toBeFocused()
  await expect(button('Filter Status')).toHaveAttribute('aria-expanded', 'true')
  await dialog.getByRole('checkbox', { name: 'Discontinued' }).uncheck()
  await expect.poll(order).toEqual(['Tools', 'Saw', 'Hammer', 'Garden', 'Hose'])
  await expect(button('Filter Status (filtered)')).toBeVisible()
  await expect(dialog.getByRole('checkbox', { name: 'Discontinued' })).not.toBeChecked()
  // Typing filters at once; arrow keys and Home move the caret, not the active cell.
  const box = dialog.getByRole('searchbox', { name: 'Contains' })
  await box.fill('ive')
  await expect.poll(order).toEqual(['Tools', 'Saw', 'Hammer', 'Garden', 'Hose'])
  await box.press('ArrowDown')
  await box.press('Home')
  await expect(box).toBeFocused()
  // Escape closes the dialog and returns the focus to its button.
  await box.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(button('Filter Status (filtered)')).toBeFocused()
  expect((await logged()).filter(entry => entry[0] === 'filters').at(-1)![1]).toEqual([{ columnId: 'status', text: 'ive', values: ['active'] }])
  // Clear filter shows every row again.
  await button('Filter Status (filtered)').click()
  await grid.getByRole('dialog').getByRole('button', { name: 'Clear filter' }).click()
  await expect.poll(order).toEqual(['Tools', 'Saw', 'Drill', 'Hammer', 'Garden', 'Hose', 'Rake'])
  // A press outside the header closes the dialog.
  await page.getByRole('textbox', { name: 'Notes' }).click()
  await expect(grid.getByRole('dialog')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('a filter on the tree column matches row labels, and cell editing names the right row after a sort', async ({ page }) => {
  const { errors, grid, button, order, logged, cell } = await openColumns(page, '?sorted')
  await expect.poll(order).toEqual(['Tools', 'Drill', 'Saw', 'Hammer', 'Garden', 'Hose', 'Rake'])
  await button('Filter Name').click()
  await grid.getByRole('dialog', { name: 'Filter Name' }).getByRole('searchbox').fill('a')
  // Saw, Hammer, Garden and Rake contain "a"; Tools stays as the parent of Saw and Hammer.
  await expect.poll(order).toEqual(['Tools', 'Saw', 'Hammer', 'Garden', 'Rake'])
  await cell('Hammer', 2).dblclick()
  const editor = grid.getByRole('textbox', { name: 'Edit Price for Hammer', exact: true })
  await expect(editor).toBeFocused()
  await editor.fill('200')
  await editor.press('Enter')
  // The edit applies to the full rows; the sort then moves Hammer first.
  await expect.poll(order).toEqual(['Tools', 'Hammer', 'Saw', 'Garden', 'Rake'])
  expect((await logged()).find(entry => entry[0] === 'cell-edit')).toEqual(['cell-edit', 'hammer', 'price', 15, 200])
  expect(errors).toEqual([])
})

test('column separators resize by keyboard, and arrow keys follow the visual direction', async ({ page }) => {
  const { errors, header, separator, cell, logged } = await openColumns(page)
  const price = separator('Price')
  await expect(price).toHaveAttribute('aria-valuenow', '100')
  await expect(price).toHaveAttribute('aria-valuemin', '60')
  await expect(price).toHaveAttribute('aria-valuemax', '300')
  await price.focus()
  await page.keyboard.press('ArrowRight')
  await expect(price).toHaveAttribute('aria-valuenow', '110')
  expect(await widthOf(header('Price'))).toBe(110)
  expect(await widthOf(cell('Saw', 2))).toBe(110)
  await expect(price).toBeFocused()
  await page.keyboard.press('Shift+ArrowLeft')
  await expect(price).toHaveAttribute('aria-valuenow', '70')
  await page.keyboard.press('End')
  await expect(price).toHaveAttribute('aria-valuenow', '300')
  // The minimum width proposed by Home; a second Home proposes nothing.
  await page.keyboard.press('Home')
  await page.keyboard.press('Home')
  await expect(price).toHaveAttribute('aria-valuenow', '60')
  // The tree column is resizable too, and the validator rejects a too narrow one.
  await separator('Name').focus()
  await page.keyboard.press('Home')
  await expect(page.locator('[aria-live="polite"]')).toHaveText('The name column needs 150 px')
  await expect(separator('Name')).toHaveAttribute('aria-valuenow', '200')
  await page.keyboard.press('ArrowRight')
  await expect(separator('Name')).toHaveAttribute('aria-valuenow', '210')
  expect(await widthOf(header('Name'))).toBe(210)
  expect((await logged()).filter(entry => entry[0].startsWith('column-resize'))).toEqual([
    ['column-resize', 'price', 100, 110, 'keyboard'], ['column-resize', 'price', 110, 70, 'keyboard'],
    ['column-resize', 'price', 70, 300, 'keyboard'], ['column-resize', 'price', 300, 60, 'keyboard'],
    ['column-resize-rejected', '$label', 60, 'The name column needs 150 px'], ['column-resize', '$label', 200, 210, 'keyboard'],
  ])
  expect(errors).toEqual([])
})

test('right-to-left: ArrowLeft widens a column and a drag towards the left widens it', async ({ page }) => {
  const { errors, separator, logged } = await openColumns(page, '?rtl')
  const price = separator('Price')
  await price.focus()
  await page.keyboard.press('ArrowLeft')
  await expect(price).toHaveAttribute('aria-valuenow', '110')
  const box = (await price.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 - 30, box.y + box.height / 2, { steps: 4 })
  await page.mouse.up()
  await expect(price).toHaveAttribute('aria-valuenow', '140')
  expect((await logged()).filter(entry => entry[0] === 'column-resize')).toEqual([
    ['column-resize', 'price', 100, 110, 'keyboard'], ['column-resize', 'price', 110, 140, 'pointer'],
  ])
  expect(errors).toEqual([])
})

test('a separator drag previews the width, proposes on release and is cancelled by Escape or new data', async ({ page }) => {
  const { errors, header, separator, cell, logged } = await openColumns(page)
  const price = separator('Price')
  const drag = async (dx: number) => {
    const box = (await price.boundingBox())!
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 + dx, box.y + box.height / 2, { steps: 5 })
  }
  await drag(40)
  // The preview widens the header and the cells below it before anything is proposed.
  await expect(price).toHaveAttribute('aria-valuenow', '140')
  expect(await widthOf(header('Price'))).toBe(140)
  expect(await widthOf(cell('Drill', 2))).toBe(140)
  await expect(price).toHaveClass(/vw-is-active/)
  expect((await logged()).filter(entry => entry[0] === 'column-resize')).toEqual([])
  await page.mouse.up()
  await expect(price).toHaveAttribute('aria-valuenow', '140')
  // Escape during a drag restores the width without a proposal.
  await drag(-50)
  await expect(price).toHaveAttribute('aria-valuenow', '90')
  await page.keyboard.press('Escape')
  await expect(price).toHaveAttribute('aria-valuenow', '140')
  await page.mouse.up()
  // New rows during a drag cancel it too.
  await drag(30)
  await expect(price).toHaveAttribute('aria-valuenow', '170')
  await page.evaluate(() => (window as any).touchRows())
  await expect(price).toHaveAttribute('aria-valuenow', '140')
  await expect(price).not.toHaveClass(/vw-is-active/)
  await page.mouse.up()
  expect(await widthOf(header('Price'))).toBe(140)
  expect((await logged()).filter(entry => entry[0] === 'column-resize')).toEqual([['column-resize', 'price', 100, 140, 'pointer']])
  expect(errors).toEqual([])
})

const all = ['Tools', 'Saw', 'Drill', 'Hammer', 'Garden', 'Hose', 'Rake']

test('a filter that matches nothing keeps the header and its dialog, so the text can be edited or cleared', async ({ page }) => {
  const { errors, grid, button, order, logged } = await openColumns(page)
  await button('Filter Name').click()
  const dialog = grid.getByRole('dialog', { name: 'Filter Name', exact: true })
  const box = dialog.getByRole('searchbox', { name: 'Contains' })
  await expect(box).toBeFocused()
  await box.pressSequentially('zzzz')
  // No rows: the header row stays with the open dialog, and the empty text is the second row of the grid.
  await expect(grid.getByRole('rowheader')).toHaveCount(0)
  await expect(grid).toHaveAttribute('aria-rowcount', '2')
  await expect(grid.getByRole('row')).toHaveCount(2)
  await expect(grid.getByRole('row').nth(1)).toHaveAttribute('aria-rowindex', '2')
  await expect(grid.getByRole('gridcell', { name: 'No rows to display', exact: true })).toBeVisible()
  await expect(dialog).toBeVisible()
  await expect(box).toBeFocused()
  await expect(box).toHaveValue('zzzz')
  await expect(button('Filter Name (filtered)')).toHaveAttribute('aria-expanded', 'true')
  await expectStructuralAccessibility(grid)
  // Correcting the text brings matching rows back.
  await box.fill('saw')
  await expect.poll(order).toEqual(['Tools', 'Saw'])
  await expect(box).toBeFocused()
  // From zero rows again, Clear filter restores every row and keeps the focus in the dialog.
  await box.fill('zzzz')
  await expect(grid.getByRole('rowheader')).toHaveCount(0)
  await dialog.getByRole('button', { name: 'Clear filter' }).click()
  await expect.poll(order).toEqual(all)
  await expect(box).toBeFocused()
  await expect(box).toHaveValue('')
  await expect(grid).toHaveAttribute('aria-rowcount', '8')
  await expect(grid.getByRole('gridcell', { name: 'No rows to display' })).toHaveCount(0)
  const proposed = (await logged()).filter(entry => entry[0] === 'filters').map(entry => entry[1])
  expect(proposed.at(-1)).toEqual([])
  expect(proposed).toContainEqual([{ columnId: '$label', text: 'zzzz' }])
  expect(errors).toEqual([])
})

test('by keyboard only, a filter that matches nothing can be corrected and cleared from the zero-row grid', async ({ page }) => {
  const { errors, grid, button, order } = await openColumns(page)
  await page.getByRole('textbox', { name: 'Notes' }).focus()
  // The tree column header comes first in the tab order: its sort button, then its filter button.
  await page.keyboard.press('Tab')
  await expect(button('Sort by Name')).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(button('Filter Name')).toBeFocused()
  await page.keyboard.press('Enter')
  const dialog = grid.getByRole('dialog', { name: 'Filter Name', exact: true })
  const box = dialog.getByRole('searchbox', { name: 'Contains' })
  await expect(box).toBeFocused()
  await page.keyboard.type('zzzz')
  await expect(grid.getByRole('rowheader')).toHaveCount(0)
  await expect(box).toBeFocused()
  await expect(box).toHaveValue('zzzz')
  // Backspace and new text: Hammer matches, with its parent.
  for (let i = 0; i < 4; i++) await page.keyboard.press('Backspace')
  await expect.poll(order).toEqual(all)
  await page.keyboard.type('ham')
  await expect.poll(order).toEqual(['Tools', 'Hammer'])
  await page.keyboard.press('ControlOrMeta+A')
  await page.keyboard.type('nothing')
  await expect(grid.getByRole('rowheader')).toHaveCount(0)
  await expect(box).toHaveValue('nothing')
  // Tab reaches Clear filter in the dialog; Enter clears, and the focus returns to the box.
  await page.keyboard.press('Tab')
  await expect(dialog.getByRole('button', { name: 'Clear filter' })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect.poll(order).toEqual(all)
  await expect(box).toBeFocused()
  // Escape closes the dialog and returns the focus to its button.
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(button('Filter Name')).toBeFocused()
  expect(errors).toEqual([])
})

test('at zero rows the sort buttons and the column separators still work', async ({ page }) => {
  const { errors, grid, header, button, separator, logged } = await openColumns(page)
  await button('Filter Price').click()
  await grid.getByRole('dialog', { name: 'Filter Price' }).getByRole('searchbox').fill('999')
  await expect(grid.getByRole('rowheader')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(button('Filter Price (filtered)')).toBeFocused()
  // The sort button proposes, and the header shows the applied sort.
  await button('Sort by Price').click()
  await expect(header('Price')).toHaveAttribute('aria-sort', 'ascending')
  await expect(button('Sort by Price (ascending)')).toBeFocused()
  // The separator resizes by keyboard and by pointer.
  const price = separator('Price')
  await price.focus()
  await page.keyboard.press('ArrowRight')
  await expect(price).toHaveAttribute('aria-valuenow', '110')
  expect(await widthOf(header('Price'))).toBe(110)
  const box = (await price.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2, { steps: 5 })
  await expect(price).toHaveAttribute('aria-valuenow', '140')
  await page.mouse.up()
  expect(await widthOf(header('Price'))).toBe(140)
  await expect(grid.getByRole('gridcell', { name: 'No rows to display', exact: true })).toBeVisible()
  await expectStructuralAccessibility(grid)
  expect((await logged()).filter(entry => entry[0] === 'sort' || entry[0] === 'column-resize')).toEqual([
    ['sort', [{ ruleId: 'price', direction: 'asc' }]], ['column-resize', 'price', 100, 110, 'keyboard'], ['column-resize', 'price', 110, 140, 'pointer'],
  ])
  expect(errors).toEqual([])
})

test('the tree grid example sorts, filters and resizes its cost breakdown', async ({ page }) => {
  const errors = pageErrors(page)
  const demo = await openExample(page, 'tree-grid')
  const panel = demo.locator('section[aria-labelledby="tree-grid-columns-title"]')
  const grid = panel.getByRole('treegrid', { name: 'Cost breakdown', exact: true })
  await expect(grid).toBeVisible()
  const order = async () => (await grid.getByRole('rowheader').allTextContents()).map(text => text.trim())
  // Sorted by budget, descending, within each phase.
  await expect(grid.getByRole('columnheader', { name: 'Budget', exact: true })).toHaveAttribute('aria-sort', 'descending')
  await expect.poll(order).toEqual(['Design', 'Layout', 'Concept', 'Design review', 'Build', 'Frame', 'Wiring', 'Panels', 'Test', 'Field test', 'Bench test'])
  await grid.getByRole('button', { name: 'Filter Owner', exact: true }).click()
  await grid.getByRole('dialog', { name: 'Filter Owner' }).getByRole('searchbox').fill('ben')
  await expect.poll(order).toEqual(['Design', 'Layout', 'Build', 'Wiring'])
  await page.keyboard.press('Escape')
  await grid.getByRole('separator', { name: 'Resize column Owner', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(panel.getByRole('status', { name: 'Column status' })).toHaveText('Column owner: 90 → 100 px.')
  expect(errors).toEqual([])
})
