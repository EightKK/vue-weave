// Diagram editor parts, beyond diagram-editor.spec.ts: GraphPalette drags with readPaletteDrop onto NetworkGraph and
// GanttChart (fixtures/palette-drop.html), keyboard and focus contracts, and PropertyInspector field kinds, rejections,
// focusField and cancelEdits (fixtures/inspector-fields.html).
import { expect, test, fixtureStatus, pageErrors, serveFixture, type Page } from './support'

const hour = 3_600_000

async function openPalette(page: Page, search = '') {
  const errors = pageErrors(page)
  await serveFixture(page, 'palette-drop-test', 'palette-drop.html')
  await page.goto('/palette-drop-test/' + search)
  const palette = page.getByRole('listbox', { name: 'Fixture palette', exact: true })
  await expect(palette).toBeVisible()
  const graph = page.getByLabel('Drop graph', { exact: true })
  const log = fixtureStatus(page, 'Log')
  await expect(graph).toBeVisible()
  return {
    errors, palette, graph, log,
    option: (name: RegExp) => palette.getByRole('option', { name }),
    search: page.getByRole('searchbox', { name: 'Filter shapes', exact: true }),
    button: (name: string) => page.getByRole('button', { name, exact: true }),
    lines: async () => ((await log.textContent()) ?? '').split('\n').filter(Boolean).map(line => JSON.parse(line) as unknown[]),
    dragstarts: () => page.evaluate(() => (window as any).__dragstarts as { types: string[]; effectAllowed: string; payload: string; text: string }[]),
  }
}

test('a palette drag carries a typed payload, and the drop onto the graph reads it with readPaletteDrop', async ({ page }) => {
  const { errors, option, graph, lines, dragstarts, log } = await openPalette(page)
  await option(/^Start/).dragTo(graph, { targetPosition: { x: 300, y: 150 } })
  await expect(graph.getByRole('button', { name: 'Start', exact: true })).toBeVisible()
  const [start] = await dragstarts()
  expect(start.types).toEqual(expect.arrayContaining(['application/x-vue-weave-palette+json', 'text/plain']))
  expect(start.effectAllowed).toBe('copy')
  expect(JSON.parse(start.payload)).toEqual({ id: 'start', data: { kind: 'event' } })
  expect(start.text).toBe('Start')
  const [drop] = await lines()
  expect(drop[0]).toBe('node-drop')
  expect(drop[1]).toEqual({ id: 'start', data: { kind: 'event' } })
  const first = drop[2] as { x: number; y: number }
  expect(Number.isFinite(first.x) && Number.isFinite(first.y)).toBe(true)
  // An item without data drops as `{ id }` only.
  await option(/^Step/).dragTo(graph, { targetPosition: { x: 500, y: 80 } })
  await expect(log).toContainText('"node-drop",{"id":"step"}')
  await expect(graph.getByRole('button', { name: 'Step', exact: true })).toBeVisible()
  // A drop further right and higher on the stage maps to a larger x and a smaller y in chart coordinates.
  const second = (await lines())[1][2] as { x: number; y: number }
  expect(second.x).toBeGreaterThan(first.x)
  expect(second.y).toBeLessThan(first.y)
  expect(errors).toEqual([])
})

test('the same payload drops onto a droppable GanttChart row', async ({ page }) => {
  const { errors, option, lines } = await openPalette(page)
  const rowTwo = page.locator('.vw-gantt-row').nth(1)
  await rowTwo.scrollIntoViewIfNeeded()
  await option(/^Decision/).dragTo(rowTwo, { targetPosition: { x: 400, y: 20 } })
  await expect.poll(async () => (await lines()).filter(line => line[0] === 'bar-drop').length).toBe(1)
  expect((await lines())[0]).toEqual(['bar-drop', { id: 'decision' }, 'r2'])
  expect(errors).toEqual([])
})

test('a disabled item neither drags nor inserts, and a drop without a palette payload is ignored', async ({ page }) => {
  const { errors, option, graph, lines, dragstarts, button, palette } = await openPalette(page)
  const locked = option(/^Locked/)
  await expect(locked).toHaveAttribute('aria-disabled', 'true')
  await expect(locked).toHaveAttribute('draggable', 'false')
  await locked.dragTo(graph, { targetPosition: { x: 300, y: 150 } })
  expect(await dragstarts()).toEqual([])
  expect(await lines()).toEqual([])
  // Enter and Space on it emit nothing, but it can hold the focus.
  await locked.focus()
  await page.keyboard.press('Enter')
  await page.keyboard.press('Space')
  expect(await lines()).toEqual([])
  await expect(locked).toBeFocused()
  // Foreign drags (plain text; the palette type with malformed JSON) reach node-drop but read as nothing and add no node.
  await button('Foreign text').dragTo(graph, { targetPosition: { x: 300, y: 150 } })
  await expect.poll(async () => (await lines()).length).toBe(1)
  expect((await lines())[0].slice(0, 2)).toEqual(['node-drop', null])
  await button('Broken payload').dragTo(graph, { targetPosition: { x: 300, y: 150 } })
  await expect.poll(async () => (await lines()).length).toBe(2)
  expect((await lines())[1].slice(0, 2)).toEqual(['node-drop', null])
  await expect(graph.getByRole('button')).toHaveCount(1)
  expect(await palette.getByRole('option').count()).toBe(5)
  expect(errors).toEqual([])
})

test('Enter and Space insert once per press, held keys do not repeat, and modified keys do nothing', async ({ page }) => {
  const { errors, option, lines } = await openPalette(page)
  await option(/^Start/).focus()
  await page.keyboard.press('Enter')
  expect(await lines()).toEqual([['insert', 'start', { kind: 'event' }]])
  // A held key sends repeat events: one insert for the press.
  await page.keyboard.down('Space')
  await page.keyboard.down('Space')
  await page.keyboard.down('Space')
  await page.keyboard.up('Space')
  expect((await lines()).length).toBe(2)
  await page.keyboard.press('Control+Enter')
  await page.keyboard.press('Alt+Space')
  await page.keyboard.press('Meta+Enter')
  expect((await lines()).length).toBe(2)
  // Arrow keys with a modifier are left to the browser and do not move the focus.
  await page.keyboard.press('Control+ArrowDown')
  await expect(option(/^Start/)).toBeFocused()
  expect(errors).toEqual([])
})

test('arrow keys stop at the ends of the list and Home and End jump to them, across sections', async ({ page }) => {
  const { errors, option } = await openPalette(page)
  await option(/^Start/).focus()
  await page.keyboard.press('ArrowUp')
  await expect(option(/^Start/)).toBeFocused()
  await page.keyboard.press('End')
  await expect(option(/^Locked/)).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(option(/^Locked/)).toBeFocused()
  await page.keyboard.press('ArrowUp')
  await expect(option(/^Data store/)).toBeFocused()
  // From the last item of the first section into the next section.
  await option(/^Decision/).focus()
  await page.keyboard.press('ArrowDown')
  await expect(option(/^Data store/)).toBeFocused()
  await page.keyboard.press('Home')
  await expect(option(/^Start/)).toBeFocused()
  expect(errors).toEqual([])
})

test('focusItem focuses a shown item, including a disabled one, and resolves false for one that is not shown', async ({ page }) => {
  const { errors, option, button, lines, search, palette } = await openPalette(page)
  await button('Focus Decision').click()
  await expect(option(/^Decision/)).toBeFocused()
  expect(await lines()).toEqual([['focus', 'decision', true]])
  // The focused item holds the only tab stop.
  await expect(palette.locator('[tabindex="0"]')).toHaveCount(1)
  await expect(option(/^Decision/)).toHaveAttribute('tabindex', '0')
  await expect(option(/^Decision/)).toHaveAttribute('aria-selected', 'true')
  await expect(option(/^Start/)).toHaveAttribute('tabindex', '-1')
  await button('Focus Locked').click()
  await expect(option(/^Locked/)).toBeFocused()
  await button('Focus missing').click()
  expect((await lines()).slice(1)).toEqual([['focus', 'locked', true], ['focus', 'missing', false]])
  // Without an ID it focuses the item that holds the tab stop.
  await option(/^Step/).focus()
  await button('Focus default').click()
  await expect(option(/^Step/)).toBeFocused()
  // An item hidden by the filter is not shown, so it cannot take focus; the tab stop moves to the first shown item.
  await search.fill('gateway')
  await expect(palette.getByRole('option')).toHaveCount(1)
  await expect(option(/^Decision/)).toHaveAttribute('tabindex', '0')
  await button('Focus Locked').click()
  expect((await lines()).at(-1)).toEqual(['focus', 'locked', false])
  await expect(option(/^Decision/)).toHaveAttribute('tabindex', '0')
  expect(errors).toEqual([])
})

test('the filter matches every word in labels, details, sections and keywords, ignoring case', async ({ page }) => {
  const { errors, search, palette, option, button } = await openPalette(page)
  const shown = async (text: string) => { await search.fill(text); return palette.getByRole('option').allTextContents() }
  await expect.poll(() => shown('GATEWAY')).toEqual([expect.stringMatching(/^Decision/)])
  await expect.poll(() => shown('branch')).toEqual([expect.stringMatching(/^Decision/)])
  await expect.poll(() => shown('flow')).toHaveLength(3)
  await expect.poll(() => shown('data lock')).toHaveLength(1)
  await expect.poll(() => shown('begin flow')).toEqual([expect.stringMatching(/^Start/)])
  await expect.poll(() => shown('flow data')).toHaveLength(0)
  await expect(page.getByRole('status').filter({ hasText: 'No shapes match the filter.' })).toBeVisible()
  // With no match ArrowDown has nowhere to go, and Escape clears the box and restores the list.
  await search.press('ArrowDown')
  await expect(search).toBeFocused()
  await search.press('Escape')
  await expect(search).toHaveValue('')
  await expect(palette.getByRole('option')).toHaveCount(5)
  await search.focus()
  await search.press('ArrowDown')
  await expect(option(/^Start/)).toBeFocused()
  // A section whose items are all filtered out loses its group.
  await search.fill('store')
  await expect(palette.getByRole('group')).toHaveCount(1)
  await expect(palette.getByRole('group', { name: 'Data' })).toBeVisible()
  await button('Focus default').click()
  await expect(option(/^Data store/)).toBeFocused()
  expect(errors).toEqual([])
})

test('a palette without searchable shows no filter box, and an item slot keeps the option, its keyboard and its drag', async ({ page }) => {
  const { errors, palette, option, graph, lines } = await openPalette(page, '?nosearch&slot')
  await expect(page.getByRole('searchbox')).toHaveCount(0)
  await expect(palette.locator('.slotted')).toHaveCount(5)
  await expect(palette.locator('.vw-palette-preview')).toHaveCount(0)
  await expect(option(/^Start \(active\)/)).toHaveAttribute('tabindex', '0')
  await option(/^Start/).focus()
  await page.keyboard.press('ArrowDown')
  await expect(option(/^Step \(active\)/)).toBeFocused()
  await page.keyboard.press('Enter')
  expect(await lines()).toEqual([['insert', 'step', null]])
  await option(/^Data store/).dragTo(graph, { targetPosition: { x: 200, y: 100 } })
  await expect(graph.getByRole('button', { name: 'Data store', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('right to left: the list keeps its vertical keys and a drop onto the graph still works', async ({ page }) => {
  const { errors, palette, option, graph, lines } = await openPalette(page, '?rtl')
  await expect(page.locator('.vw-palette')).toHaveAttribute('dir', 'rtl')
  await expect(palette).toHaveAttribute('aria-orientation', 'vertical')
  await option(/^Start/).focus()
  await page.keyboard.press('ArrowLeft')
  await page.keyboard.press('ArrowRight')
  await expect(option(/^Start/)).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(option(/^Step/)).toBeFocused()
  await option(/^Step/).dragTo(graph, { targetPosition: { x: 300, y: 120 } })
  await expect.poll(async () => (await lines()).length).toBe(1)
  expect((await lines())[0].slice(0, 2)).toEqual(['node-drop', { id: 'step' }])
  expect(errors).toEqual([])
})

async function openFields(page: Page, search = '') {
  const errors = pageErrors(page)
  await serveFixture(page, 'inspector-fields-test', 'inspector-fields.html')
  await page.goto('/inspector-fields-test/' + search)
  const form = page.getByRole('form', { name: 'Item properties', exact: true })
  await expect(form).toBeVisible()
  const events = fixtureStatus(page, 'Events')
  return {
    errors, form, events,
    field: (name: string) => form.getByLabel(name, { exact: true }),
    alert: form.getByRole('alert'),
    button: (name: string) => page.getByRole('button', { name, exact: true }),
    // Click from script, which keeps the focus (and so a draft) where it is.
    press: (name: string) => page.getByRole('button', { name, exact: true }).evaluate(element => (element as HTMLButtonElement).click()),
    lines: async () => ((await events.textContent()) ?? '').split('\n').filter(Boolean).map(line => JSON.parse(line) as unknown[]),
  }
}

test('each field kind commits its typed value: number, time, duration, select, multiple select, checkbox and colour', async ({ page }) => {
  const { errors, field, lines, events, form } = await openFields(page)
  await expect(field('Count')).toHaveValue('3')
  await expect(field('Start')).toHaveValue('2026-11-11 09:00')
  await expect(field('Effort')).toHaveValue('2h')
  await expect(field('Count')).toHaveAttribute('inputmode', 'decimal')
  await expect(field('Effort')).toHaveAttribute('inputmode', 'decimal')
  await field('Count').fill('5')
  await field('Count').press('Enter')
  await field('Start').fill('2026-11-12 10:30')
  await field('Start').press('Enter')
  await field('Effort').fill('1.5')
  await field('Effort').press('Enter')
  await field('State').selectOption({ label: 'Closed' })
  await field('Tags').selectOption([{ label: 'Alpha' }, { label: 'Beta' }])
  await field('Done').check()
  await field('Accent').fill('#00ff00')
  const changes = (await lines()).filter(line => line[0] === 'change').map(line => line[1] as Record<string, unknown>)
  expect(changes).toEqual([
    { id: 'one', field: 'count', before: 3, after: 5 },
    { id: 'one', field: 'start', before: Date.UTC(2026, 10, 11, 9), after: Date.UTC(2026, 10, 12, 10, 30) },
    { id: 'one', field: 'effort', before: 2 * hour, after: 1.5 * hour },
    { id: 'one', field: 'state', before: 'open', after: 'closed' },
    { id: 'one', field: 'tags', before: ['a'], after: ['a', 'b'] },
    { id: 'one', field: 'done', before: false, after: true },
    { id: 'one', field: 'accent', before: '#336699', after: '#00ff00' },
  ])
  // The parent applied each one, so the controls show the new values.
  await expect(field('Count')).toHaveValue('5')
  await expect(field('Start')).toHaveValue('2026-11-12 10:30')
  await expect(field('State')).toHaveValue('1')
  await expect(field('Done')).toBeChecked()
  // Committing the value an item already has proposes nothing.
  await field('Count').fill('5')
  await field('Count').press('Enter')
  await field('Count').fill('6')
  await field('Count').press('Enter')
  expect((await lines()).filter(line => line[0] === 'change')).toHaveLength(8)
  // The optional select offers an empty choice named by labels.none; the multiple one does not.
  await expect(field('State').locator('option').first()).toHaveText('(nothing)')
  await expect(field('Tags').locator('option')).toHaveCount(3)
  await field('State').selectOption({ label: '(nothing)' })
  await expect(events).toContainText('"field":"state","before":"closed","after":null')
  await expect(form).toHaveAttribute('novalidate', '')
  expect(errors).toEqual([])
})

test('field checks, validateChange reasons and the default rejection text show inline without changing the item', async ({ page }) => {
  const { errors, field, lines, form } = await openFields(page)
  const alertOf = (name: string) => field(name).locator('xpath=ancestor::div[contains(@class, "vw-inspector-field")]').getByRole('alert')
  const attempt = async (name: string, text: string) => { await field(name).fill(text); await field(name).press('Enter') }
  await attempt('Name', '')
  await expect(alertOf('Name')).toHaveText('A value is required')
  await expect(field('Name')).toHaveAttribute('aria-invalid', 'true')
  await expect(field('Name')).toHaveAccessibleDescription('Shown in lists A value is required')
  for (const [text, message] of [
    ['2.5', 'The value must be an integer'], ['-1', 'The value is outside the allowed range'], ['11', 'The value is outside the allowed range'], ['many', 'Not a number: many'],
  ]) {
    await attempt('Count', text)
    await expect(alertOf('Count')).toHaveText(message)
  }
  await attempt('Start', 'tomorrow')
  await expect(alertOf('Start')).toBeVisible()
  await attempt('Effort', 'long')
  await expect(alertOf('Effort')).toBeVisible()
  expect(await lines()).toEqual([])
  // Escape drops each draft with its message.
  for (const name of ['Name', 'Count', 'Start', 'Effort']) await field(name).press('Escape')
  await expect(form.getByRole('alert')).toHaveCount(0)
  // validateChange: a reason, false (labels.rejected) and a blank reason (also labels.rejected).
  await attempt('Name', 'Reserved')
  await expect(alertOf('Name')).toHaveText('Reserved is taken.')
  await attempt('Count', '7')
  await expect(alertOf('Count')).toHaveText('Not allowed.')
  await attempt('Count', '8')
  await expect(alertOf('Count')).toHaveText('Not allowed.')
  expect((await lines()).map(line => line.slice(0, 3))).toEqual([
    ['change-rejected', 'name', 'Reserved is taken.'], ['change-rejected', 'count', 'Not allowed.'], ['change-rejected', 'count', 'Not allowed.'],
  ])
  await expect(field('Count')).toHaveAttribute('aria-invalid', 'true')
  await expect(field('Name')).toHaveValue('Reserved')
  expect(errors).toEqual([])
})

test('a parent that ignores a proposal leaves selects, checkboxes and multiple selects on the old value', async ({ page }) => {
  const { errors, field, lines } = await openFields(page, '?ignore')
  await field('State').selectOption({ label: 'Closed' })
  await expect(field('State')).toHaveValue('0')
  await field('Done').click()
  await expect(field('Done')).not.toBeChecked()
  await field('Tags').selectOption([{ label: 'Beta' }, { label: 'Gamma' }])
  await expect(field('Tags').locator('option:checked')).toHaveText(['Alpha'])
  await field('Accent').fill('#ff0000')
  await expect(field('Accent')).toHaveValue('#336699')
  expect((await lines()).filter(line => line[0] === 'change')).toHaveLength(4)
  expect(errors).toEqual([])
})

test('read-only fields cannot be edited, though they can be focused', async ({ page }) => {
  const { errors, field, button, lines } = await openFields(page)
  await expect(field('Code')).toHaveAttribute('readonly', '')
  await expect(field('Locked state')).toBeDisabled()
  await expect(field('Locked done')).toBeDisabled()
  await field('Code').focus()
  await page.keyboard.type('X')
  await page.keyboard.press('Enter')
  await expect(field('Code')).toHaveValue('W-1')
  expect(await lines()).toEqual([])
  await button('Focus code').click()
  await expect(field('Code')).toBeFocused()
  expect(errors).toEqual([])
})

test('focusField focuses the control of a field and resolves false for an unknown one or a disabled control', async ({ page }) => {
  const { errors, field, button, lines } = await openFields(page)
  await button('Focus name').click()
  await expect(field('Name')).toBeFocused()
  await button('Focus count').click()
  await expect(field('Count')).toBeFocused()
  await button('Focus state').click()
  await expect(field('State')).toBeFocused()
  // A read-only checkbox is disabled and cannot take the focus: the call says so instead of claiming success.
  await button('Focus lockedDone').click()
  await expect(button('Focus lockedDone')).toBeFocused()
  await button('Focus missing').click()
  expect(await lines()).toEqual([
    ['focus', 'name', true], ['focus', 'count', true], ['focus', 'state', true], ['focus', 'lockedDone', false], ['focus', 'missing', false],
  ])
  expect(errors).toEqual([])
})

test('cancelEdits drops every draft and message without a proposal, and Escape reaches the page only when there is nothing to drop', async ({ page }) => {
  const { errors, field, alert, press, lines } = await openFields(page)
  // A refused draft stays with its message when the focus leaves; a valid draft is proposed on blur, so keep one field open.
  await field('Count').fill('many')
  await field('Count').press('Enter')
  await expect(alert).toHaveText('Not a number: many')
  await field('Name').fill('Draft name')
  await press('Cancel edits')
  await expect(field('Name')).toHaveValue('Weld')
  await expect(field('Count')).toHaveValue('3')
  await expect(alert).toHaveCount(0)
  await expect(field('Count')).not.toHaveAttribute('aria-invalid')
  expect(await lines()).toEqual([])
  // Escape with a draft is taken by the field: it does not propagate. Without one it does.
  await field('Note').focus()
  await field('Name').fill('Another draft')
  await field('Name').press('Escape')
  await expect(field('Name')).toHaveValue('Weld')
  expect(await lines()).toEqual([])
  await field('Name').press('Escape')
  expect(await lines()).toEqual([['escape-reached']])
  expect(errors).toEqual([])
})

test('a draft ends with its edit: another item drops all drafts, a remote change drops only the draft over it', async ({ page }) => {
  const { errors, field, press, button, form, lines } = await openFields(page)
  await field('Count').fill('many')
  await field('Count').press('Enter')
  await field('Name').fill('Local name')
  await press('Rename remotely')
  await expect(field('Name')).toHaveValue('Remote')
  await expect(field('Count')).toHaveValue('many')
  await expect(field('Count')).toHaveAttribute('aria-invalid', 'true')
  await field('Name').fill('Second draft')
  await press('Other item')
  await expect(field('Name')).toHaveValue('Cut')
  await expect(field('Count')).toHaveValue('3')
  await expect(field('Count')).not.toHaveAttribute('aria-invalid')
  expect(await lines()).toEqual([])
  // Without an item the form shows its empty text.
  await button('Clear item').click()
  await expect(form.getByText('No item.')).toBeVisible()
  await expect(form.getByRole('textbox')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('a field slot controls commit, commitText and cancel with the same checks as the built-in controls', async ({ page }) => {
  const { errors, field, button, lines } = await openFields(page)
  await expect(field('Note')).toHaveValue('hi')
  await button('Commit note').click()
  await expect.poll(async () => (await lines()).map(line => line[0])).toEqual(['change', 'commit'])
  expect((await lines())[0][1]).toEqual({ id: 'one', field: 'note', before: 'hi', after: 'Committed' })
  expect((await lines())[1]).toEqual(['commit', true])
  await expect(field('Note')).toHaveValue('Committed')
  await button('Commit note text').click()
  await expect(field('Note')).toHaveValue('Typed')
  await button('Cancel note').click()
  // cancel() has no result and proposes nothing.
  expect((await lines()).slice(-2)).toEqual([['commitText', true], ['cancel', null]])
  await expect(field('Note')).toHaveValue('Typed')
  expect(errors).toEqual([])
})

test('the inspector works right to left, and Enter in a field does not submit the form', async ({ page }) => {
  const { errors, form, field, events } = await openFields(page, '?rtl')
  await expect(form).toHaveAttribute('dir', 'rtl')
  await expect(form).toHaveClass(/vw-rtl/)
  const url = page.url()
  await field('Name').fill('Weld 2')
  await field('Name').press('Enter')
  await expect(events).toContainText('"after":"Weld 2"')
  expect(page.url()).toBe(url)
  expect(errors).toEqual([])
})
