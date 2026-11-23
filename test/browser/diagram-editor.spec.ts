// Diagram editor parts: GraphPalette drags and keyboard inserts onto NetworkGraph, and PropertyInspector edits of the
// selected node (accepted, refused by the field checks, rejected by validateChange and cancelled by stale data), and its list fields.
import { expect, test, fixtureStatus, openExample, pageErrors, serveFixture, type Page } from './support'

async function openEditor(page: Page) {
  const errors = pageErrors(page)
  await openExample(page, 'diagram-editor')
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

async function openInspectorFixture(page: Page, search = '') {
  const errors = pageErrors(page)
  await serveFixture(page, 'inspector-test', 'inspector.html')
  await page.goto('/inspector-test/' + search)
  const form = page.getByRole('form', { name: 'Task properties', exact: true })
  await expect(form).toBeVisible()
  return {
    errors, form, events: fixtureStatus(page, 'Events'),
    resources: form.getByRole('group', { name: 'Resources', exact: true }),
    links: form.getByRole('group', { name: 'Predecessors', exact: true }),
  }
}

test('inspector assignments: adding, editing and removing rows each propose the whole list', async ({ page }) => {
  const { errors, resources, events } = await openInspectorFixture(page)
  await expect(resources.getByRole('combobox', { name: 'Resource for Crane', exact: true })).toHaveValue('crane')
  await expect(resources.getByRole('textbox', { name: 'Units for Crane', exact: true })).toHaveValue('1')
  await resources.getByRole('button', { name: 'Add assignment', exact: true }).click()
  await expect(events).toHaveText('["list-change",{"id":"build","field":"assignments","kind":"assignments","before":[{"resourceId":"crane","units":1}],"after":[{"resourceId":"crane","units":1},{"resourceId":"crew","units":1}]}]')
  // The new row's resource select takes focus; a resource another row uses cannot be picked again.
  const crew = resources.getByRole('combobox', { name: 'Resource for Crew', exact: true })
  await expect(crew).toBeFocused()
  await expect(crew.locator('option[value="crane"]')).toBeDisabled()
  const units = resources.getByRole('textbox', { name: 'Units for Crew', exact: true })
  // Units are whole numbers, as resource assignments require.
  await units.fill('1.5')
  await units.press('Enter')
  await expect(resources.locator('..').getByRole('alert')).toHaveText('Units for Crew must be a positive integer')
  await expect(units).toHaveAttribute('aria-invalid', 'true')
  await units.fill('2')
  await units.press('Enter')
  await expect(events).toContainText('"after":[{"resourceId":"crane","units":1},{"resourceId":"crew","units":2}]')
  await expect(units).not.toHaveAttribute('aria-invalid')
  await crew.selectOption('truck')
  await expect(events).toContainText('"after":[{"resourceId":"crane","units":1},{"resourceId":"truck","units":2}]')
  await expect(resources.getByRole('textbox', { name: 'Units for Truck', exact: true })).toHaveValue('2')
  await resources.getByRole('button', { name: 'Remove Crane', exact: true }).click()
  await expect(events).toContainText('"after":[{"resourceId":"truck","units":2}]')
  await expect(resources.getByRole('button', { name: 'Remove Crane' })).toHaveCount(0)
  await expect(resources.getByRole('button', { name: 'Add assignment', exact: true })).toBeFocused()
  // Keyboard only: Tab reaches the units box, Enter commits.
  await page.keyboard.press('Shift+Tab')
  await expect(resources.getByRole('button', { name: 'Remove Truck', exact: true })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(resources.getByRole('textbox', { name: 'Units for Truck', exact: true })).toBeFocused()
  expect(errors).toEqual([])
})

test('inspector list rejections show inline, keep the draft until Escape, and stale data drops a draft', async ({ page }) => {
  const { errors, resources, links, events } = await openInspectorFixture(page)
  const units = resources.getByRole('textbox', { name: 'Units for Crane', exact: true })
  await units.fill('5')
  await units.press('Enter')
  await expect(resources).toHaveAccessibleDescription('At most 3 units in total.')
  await expect(resources.locator('..').getByRole('alert')).toHaveText('At most 3 units in total.')
  await expect(units).toHaveAttribute('aria-invalid', 'true')
  await expect(units).toHaveValue('5')
  await expect(events).toHaveText('["list-change-rejected","assignments","At most 3 units in total."]')
  await units.press('Escape')
  await expect(units).toHaveValue('1')
  await expect(resources.locator('..').getByRole('alert')).toHaveCount(0)
  // Text that is no number is refused by the field checks without a proposal.
  await units.fill('lots')
  await units.press('Enter')
  await expect(resources.locator('..').getByRole('alert')).toHaveText('Units for Crane must be a positive integer')
  await expect(events).toHaveText('["list-change-rejected","assignments","At most 3 units in total."]')
  // New source data under a draft drops it and its message.
  await page.evaluate(() => (window as any).changeRemotely())
  await expect(units).toHaveValue('2')
  await expect(resources.locator('..').getByRole('alert')).toHaveCount(0)
  // Dependencies: a rejected type change is set back and reported with the default reason; lag is in hours.
  const type = links.getByRole('combobox', { name: 'Type for Design', exact: true })
  await type.selectOption('SF')
  await expect(type).toHaveValue('FS')
  await expect(links.locator('..').getByRole('alert')).toHaveText('This change was rejected.')
  const lag = links.getByRole('textbox', { name: 'Lag for Design', exact: true })
  await expect(lag).toHaveValue('2')
  await lag.fill('-1 h')
  await lag.press('Enter')
  await expect(events).toContainText('"after":[{"predecessorId":"design","type":"FS","lag":-3600000}]')
  await expect(links.locator('..').getByRole('alert')).toHaveCount(0)
  await links.getByRole('button', { name: 'Add dependency', exact: true }).click()
  await expect(events).toContainText('{"predecessorId":"permit","type":"FS","lag":0}]')
  await expect(links.getByRole('button', { name: 'Add dependency', exact: true })).toBeDisabled()
  expect(errors).toEqual([])
})

test('inspector list messages belong to their cells, and a lag in display units is rounded to whole model units', async ({ page }) => {
  const { errors, resources, links, events } = await openInspectorFixture(page)
  await resources.getByRole('button', { name: 'Add assignment', exact: true }).click()
  const crane = resources.getByRole('textbox', { name: 'Units for Crane', exact: true })
  const crew = resources.getByRole('textbox', { name: 'Units for Crew', exact: true })
  await expect(crew).toHaveValue('1')
  const alert = resources.locator('..').getByRole('alert')
  // Two cells of one table are refused, each keeping its own draft and mark.
  await crane.fill('5')
  await crane.press('Enter')
  await expect(alert).toHaveText('At most 3 units in total.')
  await crew.fill('1.5')
  await crew.press('Enter')
  await expect(alert).toHaveText('Units for Crew must be a positive integer')
  await expect(crane).toHaveAttribute('aria-invalid', 'true')
  await expect(crew).toHaveAttribute('aria-invalid', 'true')
  await expect(resources.getByRole('combobox', { name: 'Resource for Crane', exact: true })).not.toHaveAttribute('aria-invalid')
  // Escape in one cell drops only that cell's draft and message; the other cell keeps its rejection.
  await crew.press('Escape')
  await expect(crew).toHaveValue('1')
  await expect(crew).not.toHaveAttribute('aria-invalid')
  await expect(crane).toHaveValue('5')
  await expect(crane).toHaveAttribute('aria-invalid', 'true')
  await expect(alert).toHaveText('At most 3 units in total.')
  // Typing in another cell does not clear it either.
  await crew.fill('2')
  await expect(crane).toHaveAttribute('aria-invalid', 'true')
  await expect(alert).toHaveText('At most 3 units in total.')
  await crane.press('Escape')
  await expect(alert).toHaveCount(0)
  // A rejected type change marks the type select.
  const type = links.getByRole('combobox', { name: 'Type for Design', exact: true })
  await type.selectOption('SF')
  await expect(type).toHaveValue('FS')
  await expect(type).toHaveAttribute('aria-invalid', 'true')
  await expect(links.getByRole('textbox', { name: 'Lag for Design', exact: true })).not.toHaveAttribute('aria-invalid')
  // A third of an hour is 1,200,000 ms, not 1,199,999.88.
  const lag = links.getByRole('textbox', { name: 'Lag for Design', exact: true })
  await lag.fill('0.3333333')
  await lag.press('Enter')
  await expect(events).toContainText('"after":[{"predecessorId":"design","type":"FS","lag":1200000}]')
  expect(errors).toEqual([])
})

test('inspector list fields stay controlled and work right to left in the dark theme', async ({ page }) => {
  const { errors, form, resources, events } = await openInspectorFixture(page, '?ignore&rtl&dark')
  await expect(form).toHaveAttribute('dir', 'rtl')
  await resources.getByRole('button', { name: 'Remove Crane', exact: true }).click()
  await expect(events).toContainText('"after":[]')
  // The parent ignored the proposal: the row is still shown.
  await expect(resources.getByRole('textbox', { name: 'Units for Crane', exact: true })).toHaveValue('1')
  const add = resources.getByRole('button', { name: 'Add assignment', exact: true })
  await expect(add).toHaveCSS('background-color', 'rgb(30, 51, 67)')
  // In right-to-left layout the units box is left of the resource select.
  const select = (await resources.getByRole('combobox', { name: 'Resource for Crane' }).boundingBox())!
  const box = (await resources.getByRole('textbox', { name: 'Units for Crane' }).boundingBox())!
  expect(box.x).toBeLessThan(select.x)
  expect(errors).toEqual([])
})

test('the diagram editor speaks Japanese on the Japanese page', async ({ page }) => {
  const errors = pageErrors(page)
  const demo = await openExample(page, 'diagram-editor', { locale: 'ja' })
  await expect(demo.getByRole('heading', { name: '図形', exact: true })).toBeVisible()
  await expect(demo.getByRole('form', { name: 'ノードのプロパティ', exact: true })).toBeVisible()
  await expect(demo.getByRole('button', { name: '元に戻す', exact: true })).toBeDisabled()
  await expect(demo.getByLabel('ラベル', { exact: true })).toHaveValue('申請を確認')
  await expect(demo.getByRole('status', { name: 'エディターの状態' })).toHaveText('図形を図へドラッグするか、フォーカスして Enter を押してください。')
  expect(errors).toEqual([])
})
