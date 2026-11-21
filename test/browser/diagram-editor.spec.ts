// Diagram editor parts: GraphPalette drags and keyboard inserts onto NetworkGraph, and PropertyInspector edits of the
// selected node (accepted, refused by the field checks, rejected by validateChange and cancelled by stale data).
import { expect, openDemo, pageErrors, test, type Page } from './support'

async function openEditor(page: Page) {
  const errors = pageErrors(page)
  await openDemo(page, 'Diagram editor')
  const demo = page.locator('section[aria-labelledby="diagram-editor-title"]')
  const palette = demo.getByRole('listbox', { name: 'Shapes', exact: true })
  const canvas = demo.getByLabel('Diagram canvas', { exact: true })
  const inspector = demo.getByRole('form', { name: 'Node properties', exact: true })
  await expect(palette).toBeVisible()
  await expect(canvas).toBeVisible()
  return {
    errors, demo, palette, canvas, inspector,
    option: (name: RegExp) => palette.getByRole('option', { name }),
    node: (name: string) => canvas.getByRole('button', { name, exact: true }),
    status: demo.getByRole('status', { name: 'Diagram editor status' }),
    button: (name: string) => demo.getByRole('button', { name, exact: true }),
  }
}

test('dragging a palette item onto the canvas adds a node at the drop point, and undo removes it', async ({ page }) => {
  const { errors, option, canvas, node, status, inspector, button } = await openEditor(page)
  await option(/^Decision/).dragTo(canvas, { targetPosition: { x: 420, y: 330 } })
  await expect(status).toHaveText('Added Decision 2.')
  const added = node('Decision 2')
  await expect(added).toBeVisible()
  await expect(added.locator('polygon.vw-node-shape')).toHaveCount(1)
  // The new node is centred on the drop point (give or take half a grid cell) and selected in the inspector.
  const box = (await added.boundingBox())!, area = (await canvas.boundingBox())!
  expect(Math.abs(box.x + box.width / 2 - (area.x + 420))).toBeLessThan(15)
  expect(Math.abs(box.y + box.height / 2 - (area.y + 330))).toBeLessThan(15)
  await expect(inspector.getByLabel('Label', { exact: true })).toHaveValue('Decision 2')
  await expect(inspector.getByLabel('Shape', { exact: true })).toHaveValue('2')
  await button('Undo').click()
  await expect(node('Decision 2')).toHaveCount(0)
  await expect(inspector).toContainText('Select a node to edit it.')
  expect(errors).toEqual([])
})

test('the palette is a listbox with one tab stop, a filter box and Enter or Space to insert at the view centre', async ({ page }) => {
  const { errors, palette, option, canvas, node, status, demo } = await openEditor(page)
  const options = palette.getByRole('option')
  await expect(options).toHaveCount(6)
  await expect(palette.getByRole('group', { name: 'Flow' }).getByRole('option')).toHaveCount(5)
  await expect(palette.locator('[tabindex="0"]')).toHaveCount(1)
  await option(/^Start/).focus()
  await page.keyboard.press('ArrowDown')
  await expect(option(/^Step/)).toBeFocused()
  await expect(option(/^Step/)).toHaveAttribute('aria-selected', 'true')
  await page.keyboard.press('End')
  await expect(option(/^Data store/)).toBeFocused()
  await page.keyboard.press('Home')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(status).toHaveText('Added Step 2.')
  // Space inserts too; the new node is placed around the centre of the visible canvas.
  await page.keyboard.press('Space')
  await expect(status).toHaveText('Added Step 3.')
  const box = (await node('Step 2').boundingBox())!, area = (await canvas.boundingBox())!
  expect(Math.abs(box.x + box.width / 2 - (area.x + area.width / 2))).toBeLessThan(area.width / 2)
  // The filter matches keywords; ArrowDown moves from the box to the first match.
  const search = demo.getByRole('searchbox', { name: 'Filter shapes' })
  await search.fill('gateway')
  await expect(options).toHaveCount(1)
  await page.keyboard.press('ArrowDown')
  await expect(option(/^Decision/)).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(node('Decision 2')).toBeVisible()
  await search.fill('nothing like this')
  await expect(options).toHaveCount(0)
  await expect(demo.getByRole('status').filter({ hasText: 'No shapes match the filter.' })).toBeVisible()
  await search.press('Escape')
  await expect(options).toHaveCount(6)
  expect(errors).toEqual([])
})

test('inspector edits are applied as proposals and go through the edit history', async ({ page }) => {
  const { errors, inspector, node, status, button } = await openEditor(page)
  await node('Check request Clerk').click()
  const label = inspector.getByLabel('Label', { exact: true })
  await expect(label).toHaveValue('Check request')
  await expect(inspector.getByLabel('ID', { exact: true })).toHaveAttribute('readonly', '')
  await label.fill('Review request')
  await label.press('Enter')
  await expect(status).toHaveText('Changed label of Review request to Review request.')
  await expect(node('Review request Clerk')).toBeVisible()
  // Selects, checkboxes and colours commit at once.
  await inspector.getByLabel('Shape', { exact: true }).selectOption({ label: 'Hexagon' })
  await expect(node('Review request Clerk').locator('polygon.vw-node-shape')).toHaveCount(1)
  await inspector.getByLabel('Colour', { exact: true }).selectOption({ label: 'Amber' })
  await expect(node('Review request Clerk')).toHaveClass(/vw-tone-amber/)
  await inspector.getByLabel('Accent', { exact: true }).fill('#ff0000')
  await expect(status).toHaveText('Changed accent of Review request to #ff0000.')
  await inspector.getByLabel('Lock position', { exact: true }).check()
  await expect(node('Review request Clerk')).not.toHaveClass(/vw-is-draggable/)
  // A blur commits a text draft, too.
  const detail = inspector.getByLabel('Detail', { exact: true })
  await detail.fill('Back office')
  await inspector.getByLabel('Width', { exact: true }).focus()
  await expect(node('Review request Back office')).toBeVisible()
  for (let i = 0; i < 5; i++) await button('Undo').click()
  await expect(node('Review request Clerk')).toBeVisible()
  await expect(node('Review request Clerk')).toHaveClass(/vw-tone-blue/)
  await expect(inspector.getByLabel('Shape', { exact: true })).toHaveValue('0')
  await button('Undo').click()
  await expect(node('Check request Clerk')).toBeVisible()
  await expect(label).toHaveValue('Check request')
  expect(errors).toEqual([])
})

test('rejected and invalid inspector edits show their reason inline and change nothing', async ({ page }) => {
  const { errors, inspector, node, status } = await openEditor(page)
  await node('Check request Clerk').click()
  const label = inspector.getByLabel('Label', { exact: true })
  await label.fill('Done')
  await label.press('Enter')
  const alert = inspector.getByRole('alert')
  await expect(alert).toHaveText('Another node is already called Done.')
  await expect(status).toHaveText('Rejected: Another node is already called Done.')
  await expect(label).toHaveAttribute('aria-invalid', 'true')
  await expect(label).toHaveAccessibleDescription(/Another node is already called Done\./)
  await expect(node('Check request Clerk')).toBeVisible()
  // A refused draft is not proposed again on blur; Escape drops it and shows the item's value again.
  const width = inspector.getByLabel('Width', { exact: true })
  await width.fill('200')
  await width.press('Enter')
  await expect(status).toHaveText('Changed width of Check request to 200.')
  await expect(alert).toHaveText('Another node is already called Done.')
  await label.focus()
  await inspector.getByLabel('Detail', { exact: true }).focus()
  await expect(status).toHaveText('Changed width of Check request to 200.')
  await label.focus()
  await label.press('Escape')
  await expect(alert).toHaveCount(0)
  await expect(label).toHaveValue('Check request')
  // Field checks run before validateChange: required, number syntax and range.
  await label.fill('')
  await label.press('Enter')
  await expect(alert).toHaveText('A value is required')
  await label.press('Escape')
  await width.fill('wide')
  await width.press('Enter')
  await expect(alert).toHaveText('Not a number: wide')
  await width.fill('1000')
  await width.press('Enter')
  await expect(alert).toHaveText('The value is outside the allowed range')
  await width.fill('180')
  await width.press('Enter')
  await expect(alert).toHaveCount(0)
  await expect(status).toHaveText('Changed width of Check request to 180.')
  expect(errors).toEqual([])
})

test('a draft is dropped when the edited value or the selected node changes', async ({ page }) => {
  const { errors, inspector, node, status, button } = await openEditor(page)
  // Clicking Undo and Redo from script keeps the focus, and so the draft, in the inspector.
  const press = (name: string) => button(name).evaluate(element => (element as HTMLButtonElement).click())
  await node('Check request Clerk').click()
  const label = inspector.getByLabel('Label', { exact: true })
  const detail = inspector.getByLabel('Detail', { exact: true })
  await label.fill('Check order')
  await label.press('Enter')
  await expect(node('Check order Clerk')).toBeVisible()
  // The value under the label draft changes: the draft is dropped without a proposal.
  await label.fill('Stale name')
  await press('Undo')
  await expect(label).toHaveValue('Check request')
  await expect(label).toBeFocused()
  await label.press('Enter')
  await expect(status).toHaveText('Changed label of Check order to Check order.')
  // A draft in another field survives the change.
  await detail.fill('Clerk on duty')
  await press('Redo')
  await expect(label).toHaveValue('Check order')
  await expect(detail).toHaveValue('Clerk on duty')
  await detail.press('Escape')
  await expect(detail).toHaveValue('Clerk')
  // Another node: the message of a rejected draft is dropped with it.
  await label.fill('Done')
  await label.press('Enter')
  await expect(inspector.getByRole('alert')).toBeVisible()
  await node('Done').click()
  await expect(inspector.getByRole('alert')).toHaveCount(0)
  await expect(label).toHaveValue('Done')
  await expect(label).not.toHaveAttribute('aria-invalid', 'true')
  expect(errors).toEqual([])
})

test('the palette and inspector follow a right-to-left direction', async ({ page }) => {
  const { errors, demo, palette, inspector } = await openEditor(page)
  await demo.getByLabel('Right to left').check()
  await expect(demo.locator('.vw-palette')).toHaveAttribute('dir', 'rtl')
  await expect(inspector).toHaveAttribute('dir', 'rtl')
  const option = (await palette.getByRole('option').first().boundingBox())!
  const label = (await palette.getByRole('option').first().locator('.vw-palette-label').boundingBox())!
  const preview = (await palette.getByRole('option').first().locator('.vw-palette-preview').boundingBox())!
  // The preview sits at the inline start, which is the right edge.
  expect(preview.x).toBeGreaterThan(label.x)
  expect(preview.x + preview.width).toBeLessThanOrEqual(option.x + option.width)
  expect(errors).toEqual([])
})
