// Structural accessibility of the main demo of each component, checked with DOM APIs only (see
// expectStructuralAccessibility in ./support): accessible names, unique IDs, ARIA references and required owned roles.
import { expect, expectStructuralAccessibility, openExample, pageErrors, serveFixture, test } from './support'

const demos = [
  { component: 'NetworkGraph', id: 'graph-and-gantt', root: '.vw-network' },
  { component: 'GanttChart', id: 'timeline-editing', root: '.vw-gantt' },
  { component: 'TaskBoard', id: 'task-board', root: '.vw-board' },
  { component: 'EventCalendar', id: 'event-calendar', root: '.vw-calendar' },
  { component: 'TreeGrid', id: 'tree-grid', root: '.vw-tree-grid' },
  { component: 'GraphPalette', id: 'diagram-editor', root: '.vw-palette' },
  { component: 'PropertyInspector', id: 'diagram-editor', root: '.vw-inspector' },
]

for (const { component, id, root } of demos) {
  test(`${component} in its main demo has names, unique IDs, valid ARIA references and required owned roles`, async ({ page }) => {
    const errors = pageErrors(page)
    const demo = await openExample(page, id)
    const region = demo.locator(root).first()
    await expect(region).toBeVisible()
    await expectStructuralAccessibility(region)
    expect(errors).toEqual([])
  })
}

test('TaskBoard with collapsed columns and lanes keeps its names, IDs and references', async ({ page }) => {
  const errors = pageErrors(page)
  const demo = await openExample(page, 'task-board')
  const board = demo.getByRole('region', { name: 'Sprint board', exact: true })
  await board.getByRole('button', { name: 'Collapse Doing', exact: true }).click()
  await board.getByRole('button', { name: 'Collapse API team', exact: true }).click()
  await expect(board.getByRole('button', { name: 'Expand Doing', exact: true })).toBeVisible()
  await expectStructuralAccessibility(demo.locator('.vw-board').first())
  expect(errors).toEqual([])
})

test('EventCalendar day and month views keep their structure', async ({ page }) => {
  const errors = pageErrors(page)
  const demo = await openExample(page, 'event-calendar')
  const calendar = demo.getByRole('region', { name: 'Room bookings', exact: true })
  for (const view of ['Day', 'Month']) {
    await calendar.getByRole('button', { name: view, exact: true }).click()
    await expect(calendar.getByRole('button', { name: view, exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expectStructuralAccessibility(demo.locator('.vw-calendar').first())
  }
  expect(errors).toEqual([])
})

test('GraphPalette with a filter and PropertyInspector with a selected node keep their structure', async ({ page }) => {
  const errors = pageErrors(page)
  const demo = await openExample(page, 'diagram-editor')
  await demo.getByRole('searchbox', { name: 'Filter shapes' }).fill('gateway')
  await expectStructuralAccessibility(demo.locator('.vw-palette').first())
  await demo.getByLabel('Diagram canvas', { exact: true }).getByRole('button', { name: 'Check request Clerk', exact: true }).click()
  await expect(demo.getByRole('form', { name: 'Node properties', exact: true }).getByLabel('Label', { exact: true })).toHaveValue('Check request')
  await expectStructuralAccessibility(demo.locator('.vw-inspector').first())
  expect(errors).toEqual([])
})

test('PropertyInspector list fields keep their structure', async ({ page }) => {
  const errors = pageErrors(page)
  await serveFixture(page, 'inspector-test', 'inspector.html')
  await page.goto('/inspector-test/')
  const form = page.getByRole('form', { name: 'Task properties', exact: true })
  await expect(form.getByRole('group', { name: 'Resources', exact: true })).toBeVisible()
  await expectStructuralAccessibility(form)
  expect(errors).toEqual([])
})

test('the helper reports each kind of violation it checks', async ({ page }) => {
  await page.setContent(`<main id="m">
    <button id="x"></button><button id="x" aria-label="Twice"></button>
    <div role="listbox" aria-label="Empty list"></div><div role="option">Orphan</div>
    <div role="grid" aria-label="G"><div role="row"><span role="gridcell">ok</span></div></div>
    <input aria-label="Ref" aria-describedby="nowhere">
    <input type="text">
  </main>`)
  let message = ''
  try { await expectStructuralAccessibility(page.locator('#m')) } catch (error) { message = String(error) }
  for (const text of ['has no accessible name', 'is used by', 'aria-describedby names missing id', 'nowhere', 'owns no option or group', 'must be inside listbox or group']) {
    expect(message).toContain(text)
  }
  await page.setContent(`<main id="ok">
    <button aria-label="Save"></button><label>Name <input></label><div role="listbox" aria-label="L"><div role="option">One</div></div>
    <div role="tablist" aria-label="T"><button role="tab" id="t1" aria-controls="p1">Tab</button></div><div id="p1" role="tabpanel"></div>
    <div role="grid" aria-label="G"><div role="row"><span role="columnheader">H</span></div></div>
  </main>`)
  await expectStructuralAccessibility(page.locator('#ok'))
  await expectStructuralAccessibility(page.locator('#ok'), { ignore: ['name'] })
})
