// NetworkGraph editing: connections and ports, typed port rules, edge selection and reconnection, deletion, inline labels
// and rejected proposals.
import {
  expect, test, centerOf, chainNode, dragBy, dragTo, fixtureStatus, graphStage, openDemo, openGraphEditor, openNetworkFixture, pageErrors,
  pressAndMove, pressAndMoveTo, type Page,
} from './support'

// Clicks the middle of an SVG path. A straight horizontal edge has an empty bounding box, so locator.click cannot target it.
async function clickPath(page: Page, path: ReturnType<Page['locator']>, modifiers: string[] = []) {
  const point = await path.evaluate(el => {
    const shape = el as SVGPathElement
    const middle = shape.getPointAtLength(shape.getTotalLength() / 2)
    const screen = new DOMPoint(middle.x, middle.y).matrixTransform(shape.getScreenCTM()!)
    return { x: screen.x, y: screen.y }
  })
  for (const key of modifiers) await page.keyboard.down(key)
  await page.mouse.click(point.x, point.y)
  for (const key of modifiers) await page.keyboard.up(key)
}

test('graph moves are controlled and connections can be accepted or rejected', async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto('gallery.html')
  await page.getByLabel('Edit graph').check()
  const split = page.getByRole('button', { name: 'Split Operation 101', exact: true })
  const finish = page.getByRole('button', { name: 'Finish Operation 102', exact: true })
  await split.click()
  await finish.click({ modifiers: ['Shift'] })
  await expect(split).toHaveAttribute('aria-pressed', 'true')
  await expect(finish).toHaveAttribute('aria-pressed', 'true')

  const initial = await split.getAttribute('transform')
  const box = (await split.boundingBox())!
  await page.mouse.move(box.x + 35, box.y + 30)
  await page.mouse.down()
  await page.mouse.move(box.x + 35, box.y + 110, { steps: 8 })
  await page.mouse.up()
  await expect(split).not.toHaveAttribute('transform', initial!)
  await expect(page.getByText('Moved 2 nodes.', { exact: true })).toBeVisible()
  const committed = await split.getAttribute('transform')
  await split.press('ArrowRight')
  await expect(split).not.toHaveAttribute('transform', committed!)
  const beforeNavigation = await page.locator('.vw-network-stage > g').getAttribute('transform')
  await page.getByRole('button', { name: 'Navigate graph overview' }).click({ position: { x: 20, y: 30 } })
  await expect(page.locator('.vw-network-stage > g')).not.toHaveAttribute('transform', beforeNavigation!)
  await page.getByRole('button', { name: 'Fit to view' }).click()

  await page.getByRole('button', { name: 'Start connection from Material A1', exact: true }).press('Enter')
  await page.getByRole('button', { name: 'Connect to Split', exact: true }).press('Enter')
  await expect(page.getByRole('status').filter({ hasText: 'already exists' })).toBeVisible()
  await page.getByRole('button', { name: 'Start connection from Material A1', exact: true }).press('Enter')
  await page.getByRole('button', { name: 'Connect to Finish', exact: true }).press('Enter')
  await expect(page.getByRole('status').filter({ hasText: 'Connected' })).toBeVisible()
  await expect(page.locator('.vw-network-edge')).toHaveCount(7)
  expect(errors).toEqual([])
})

test('named port drag, edge reconnection and undo preserve the graph', async ({ page }) => {
  const errors = pageErrors(page)
  await openDemo(page, 'Project delivery')
  await page.getByLabel('Edit graph').check()
  const source = page.getByRole('button', { name: 'Start connection from Design · Output', exact: true })
  const target = page.getByRole('button', { name: /^(Start connection from|Connect to) Release · Input$/ })
  await expect(source).toBeVisible()
  await pressAndMoveTo(page, source, target, 12)
  await expect(page.locator('.vw-connection-preview')).toHaveAttribute('d', /^M .+ L /)
  await page.mouse.up()
  await expect(page.locator('.vw-network-edge')).toHaveCount(5)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(page.locator('.vw-network-edge')).toHaveCount(4)

  const edge = page.getByRole('button', { name: 'Select edge da', exact: true })
  const path = await edge.getAttribute('d')
  await edge.press('Enter')
  await page.getByRole('button', { name: 'Reconnect target of da', exact: true }).press('Enter')
  await page.getByRole('button', { name: 'Connect to Release · Input', exact: true }).press('Enter')
  await expect(page.getByRole('status').filter({ hasText: 'Reconnected edge da' })).toBeVisible()
  await expect(edge).not.toHaveAttribute('d', path!)
  await expect(page.locator('.vw-network-edge')).toHaveCount(4)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(edge).toHaveAttribute('d', path!)
  await page.getByRole('button', { name: 'Redo', exact: true }).click()
  await expect(edge).not.toHaveAttribute('d', path!)

  const secondEdge = page.getByRole('button', { name: 'Select edge du', exact: true })
  await secondEdge.press('Enter')
  await dragTo(page, page.getByRole('button', { name: 'Reconnect source of du', exact: true }), page.getByRole('button', { name: 'Start connection from API · Output', exact: true }), { steps: 10 })
  await expect(page.getByRole('status').filter({ hasText: 'Reconnected edge du' })).toBeVisible()
  await expect(page.locator('.vw-network-edge')).toHaveCount(4)
  expect(errors).toEqual([])
})

test('graph edges select by click and keyboard, toggle with modifiers and show reconnect handles', async ({ page }) => {
  const { errors, button } = await openGraphEditor(page)
  const rs = button('Select edge rs'), fp = button('Select edge fp'), s1 = button('Select edge 72')
  const lot = button('Lot A123-01 72 units')
  await lot.click()
  await expect(lot).toHaveAttribute('aria-pressed', 'true')
  // A plain edge click selects it, replaces the node selection and activates its reconnect handles.
  await clickPath(page, rs)
  await expect(rs).toHaveAttribute('aria-pressed', 'true')
  await expect(rs).toHaveClass(/\bvw-is-selected\b/)
  await expect(lot).toHaveAttribute('aria-pressed', 'false')
  await expect(button('Reconnect target of rs')).toBeVisible()
  await clickPath(page, fp, ['Shift'])
  await expect(rs).toHaveAttribute('aria-pressed', 'true')
  await expect(fp).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('.vw-edge-selected')).toHaveCount(2)
  // Ctrl+Enter toggles an edge out of the selection; a plain Enter replaces it.
  await fp.focus()
  await page.keyboard.press('Control+Enter')
  await expect(fp).toHaveAttribute('aria-pressed', 'false')
  await expect(rs).toHaveAttribute('aria-pressed', 'true')
  await s1.press('Enter')
  await expect(s1).toHaveAttribute('aria-pressed', 'true')
  await expect(rs).toHaveAttribute('aria-pressed', 'false')
  await expect(button('Reconnect source of 72')).toBeVisible()
  await expect(button('Reconnect target of rs')).toHaveCount(0)
  // A plain node click clears the edge selection and its handles.
  await lot.click()
  await expect(s1).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('.vw-edge-selected')).toHaveCount(0)
  await expect(button('Reconnect source of 72')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('graph deletion by keyboard removes nodes, edges and incident edges, validates and undoes', async ({ page }) => {
  const { errors, button, status, edges, nodes } = await openGraphEditor(page)
  const stage = page.getByLabel('Network graph', { exact: true })
  await expect(edges).toHaveCount(6)
  const fp = button('Select edge fp')
  await fp.press('Enter')
  await fp.press('Delete')
  await expect(edges).toHaveCount(5)
  await expect(status('Deleted 1 edge.')).toBeVisible()
  await expect(stage).toBeFocused()
  await button('Undo').click()
  await expect(edges).toHaveCount(6)

  // A focused node outside the selection is deleted alone, with its incident edges; its group keeps the other lot.
  const lot1 = button('Lot A123-01 72 units'), lot2 = button('Lot A123-02 48 units')
  await lot1.focus()
  await page.keyboard.press('Backspace')
  await expect(lot1).toHaveCount(0)
  await expect(edges).toHaveCount(4)
  await expect(status('Deleted 1 node and 2 edges.')).toBeVisible()
  await expect(button('Move group Intermediate lots')).toBeVisible()
  await button('Undo').click()
  await expect(lot1).toBeVisible()
  await expect(edges).toHaveCount(6)

  // Nothing is proposed while a drag is in flight.
  await pressAndMove(page, lot2, 30, 40, 5)
  await page.keyboard.press('Delete')
  await page.mouse.up()
  await expect(status('Moved node lot2.')).toBeVisible()
  await expect(nodes).toHaveCount(6)

  // A focused node inside the selection deletes the whole selection as one proposal.
  const split = button('Split Operation 101'), finish = button('Finish Operation 102')
  await split.click()
  await finish.click({ modifiers: ['Shift'] })
  await finish.press('Delete')
  await expect(nodes).toHaveCount(4)
  await expect(edges).toHaveCount(0)
  await expect(status('Deleted 2 nodes and 6 edges.')).toBeVisible()
  await button('Undo').click()
  await expect(nodes).toHaveCount(6)
  await expect(edges).toHaveCount(6)

  // The demo rejects deleting every node; the graph reports the reason and keeps the data.
  await split.click()
  for (const name of ['Material A1 120 units', 'Lot A123-01 72 units', 'Lot A123-02 48 units', 'Finish Operation 102', 'Product B 120 units']) {
    await button(name).click({ modifiers: ['Shift'] })
  }
  await split.press('Delete')
  await expect(status('Keep at least one node in the graph.')).toBeVisible()
  await expect(page.locator('.vw-network .vw-sr-only[aria-live]')).toHaveText('Keep at least one node in the graph.')
  await expect(nodes).toHaveCount(6)
  expect(errors).toEqual([])
})

test('inline label editing proposes node and edge labels, validates them and returns focus', async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto('gallery.html')
  await page.getByLabel('Edit graph').check()
  await page.getByLabel('Edit labels').check()
  const status = (text: string) => page.getByRole('status').filter({ hasText: text })
  const split = page.getByRole('button', { name: 'Split Operation 101', exact: true })
  await split.dblclick()
  const editor = page.getByRole('textbox', { name: 'Edit label of Split', exact: true })
  await expect(editor).toBeFocused()
  await expect(editor).toHaveValue('Split')
  // The editor covers the node: same start edge, centred vertically.
  const [e, n] = [(await editor.boundingBox())!, (await split.boundingBox())!]
  expect(Math.abs(e.x - n.x)).toBeLessThan(2)
  expect(Math.abs(e.y + e.height / 2 - (n.y + n.height / 2))).toBeLessThan(2)
  await editor.fill('Split A')
  await editor.press('Enter')
  const renamed = page.getByRole('button', { name: 'Split A Operation 101', exact: true })
  await expect(status('Renamed node split to Split A.')).toBeVisible()
  await expect(renamed).toBeFocused()
  await expect(editor).toHaveCount(0)

  // F2 opens the editor from the keyboard; the validator rejects an empty label and the label is kept.
  await renamed.press('F2')
  const again = page.getByRole('textbox', { name: 'Edit label of Split A', exact: true })
  await expect(again).toBeFocused()
  await again.fill('   ')
  await again.press('Enter')
  await expect(status('A label cannot be empty.')).toBeVisible()
  await expect(renamed).toBeVisible()
  // Escape discards the text; Enter on the node still selects it.
  await renamed.press('F2')
  await again.fill('Discarded')
  await again.press('Escape')
  await expect(again).toHaveCount(0)
  await expect(renamed).toBeFocused()
  await renamed.press('Enter')
  await expect(renamed).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByRole('textbox', { name: /^Edit label of/ })).toHaveCount(0)

  // An edge label: F2 on the focused edge, and leaving the editor proposes the text.
  await page.getByRole('button', { name: 'Select edge 72', exact: true }).press('F2')
  const edgeEditor = page.getByRole('textbox', { name: 'Edit label of 72', exact: true })
  await expect(edgeEditor).toHaveValue('72')
  await edgeEditor.fill('72 units')
  await page.getByRole('heading', { name: 'Network', exact: true }).click()
  await expect(status('Renamed edge s1 to 72 units.')).toBeVisible()
  await expect(page.locator('.vw-edge-label', { hasText: '72 units' })).toBeVisible()

  // A change of the source data while the editor is open cancels it without a proposal.
  const raw = page.getByRole('button', { name: 'Material A1 120 units', exact: true })
  await raw.dblclick()
  const rawEditor = page.getByRole('textbox', { name: 'Edit label of Material A1', exact: true })
  await rawEditor.fill('Stale')
  await page.getByRole('button', { name: 'Undo', exact: true }).dispatchEvent('click')
  await expect(rawEditor).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Select edge 72', exact: true })).toBeVisible()
  await expect(raw).toBeVisible()
  await expect(raw).toBeFocused()
  await expect(page.getByRole('button', { name: /^Stale/ })).toHaveCount(0)
  expect(errors).toEqual([])
})

test('the label editor follows the camera in right-to-left graphs and a data refresh cancels it', async ({ page }) => {
  const errors = pageErrors(page)
  await openNetworkFixture(page, '?nodes=3&labels=1&dir=rtl')
  const node = chainNode(page, 'N0001')
  const lastLabel = page.getByRole('status', { name: 'Last label', exact: true })
  await page.evaluate(() => (window as any).__vw.graph().zoom(1.3))
  await node.dblclick()
  const editor = page.getByRole('textbox', { name: 'Edit label of N0001', exact: true })
  await expect(editor).toBeFocused()
  // Right to left: the editor starts at the node's right edge.
  const placed = async () => {
    const [e, n] = [(await editor.boundingBox())!, (await node.boundingBox())!]
    return { end: e.x + e.width - (n.x + n.width), middle: e.y + e.height / 2 - (n.y + n.height / 2) }
  }
  let place = await placed()
  expect(Math.abs(place.end)).toBeLessThan(2)
  expect(Math.abs(place.middle)).toBeLessThan(2)
  await expect(editor).toHaveAttribute('dir', 'auto')
  // Zooming keeps the editor open and on the node.
  await page.evaluate(() => (window as any).__vw.graph().zoom(0.7))
  await expect(editor).toBeFocused()
  place = await placed()
  expect(Math.abs(place.end)).toBeLessThan(2)
  expect(Math.abs(place.middle)).toBeLessThan(2)
  // New source positions cancel the edit; focus returns to the node.
  await editor.fill('Renamed')
  await page.evaluate(() => (window as any).__vw.refresh())
  await expect(editor).toHaveCount(0)
  await expect(node).toBeFocused()
  await expect(lastLabel).toHaveText('')
  await node.press('F2')
  await editor.fill('Renamed')
  await editor.press('Enter')
  await expect(lastLabel).toHaveText(JSON.stringify({ kind: 'node', id: 'N0001', before: 'N0001', after: 'Renamed' }))
  // The component does not change the label itself.
  await expect(node).toBeFocused()
  // An unchanged label proposes nothing.
  await node.press('F2')
  await editor.press('Enter')
  await expect(lastLabel).toHaveText(JSON.stringify({ kind: 'node', id: 'N0001', before: 'N0001', after: 'Renamed' }))
  expect(errors).toEqual([])
})

test('a blank rejection reason rejects label and delete proposals with the default text', async ({ page }) => {
  const errors = pageErrors(page)
  await openNetworkFixture(page, '?nodes=3&labels=1&delete=1&blankreject=1')
  const node = chainNode(page, 'N0001')
  const notice = page.locator('.vw-network .vw-sr-only[aria-live="polite"]')
  const proposals = page.getByRole('status', { name: 'Edit proposals', exact: true })
  await node.press('F2')
  const editor = page.getByRole('textbox', { name: 'Edit label of N0001', exact: true })
  await editor.fill('Renamed')
  await editor.press('Enter')
  await expect(notice).toHaveText('This label change was rejected.')
  await expect(proposals).toHaveText('label-edit-rejected:"This label change was rejected."')
  await expect(page.getByRole('status', { name: 'Last label', exact: true })).toHaveText('')
  await node.press('Delete')
  await expect(notice).toHaveText('This deletion was rejected.')
  await expect(proposals).toHaveText('label-edit-rejected:"This label change was rejected." delete-rejected:"This deletion was rejected."')
  await expect(page.getByRole('status', { name: 'Last deletion', exact: true })).toHaveText('')
  expect(errors).toEqual([])
})

test('typed port rules hint valid targets, reject type and limit violations with a reason and allow limit-1 reconnects', async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto('gallery.html')
  await page.getByLabel('Edit graph').check()
  await page.getByLabel('Typed ports').check()
  const graph = page.getByRole('group', { name: 'Typed port example', exact: true })
  const status = page.getByRole('status', { name: 'Typed port status', exact: true })
  const handle = (name: string) => graph.getByRole('button', { name, exact: true })
  const edges = graph.locator('.vw-network-edge')
  await expect(edges).toHaveCount(1)
  await expect(page.getByText('No rule violations', { exact: true })).toBeVisible()
  await expect(graph.locator('.vw-is-valid-target, .vw-is-invalid-target')).toHaveCount(0)

  // A pointer drag from a number output marks the free number inputs valid and the rest invalid, with the reason.
  await graphStage(graph, 'Typed port graph').scrollIntoViewIfNeeded()
  const a = (await handle('Start connection from Sensor · Reading').boundingBox())!
  const b = (await handle('Start connection from Average · Input B').boundingBox())!
  await pressAndMoveTo(page, a, { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 20 })
  await expect(handle('Connect to Average · Input B')).toHaveClass(/vw-is-valid-target/)
  await expect(handle('Connect to Display · Show')).toHaveClass(/vw-is-valid-target/)
  await expect(handle('Connect to Average · Input A')).toHaveClass(/vw-is-invalid-target/)
  await expect(handle('Connect to Average · Input A')).toHaveAccessibleDescription('Average · Input A already has its maximum of 1 connection.')
  await expect(handle('Connect to Title · Text')).toHaveAccessibleDescription('Title · Text allows only outgoing connections.')
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 6 })
  await page.mouse.up()
  await expect(status).toHaveText('Connected sensor to average.')
  await expect(edges).toHaveCount(2)
  await expect(graph.locator('.vw-is-valid-target, .vw-is-invalid-target')).toHaveCount(0)

  // The keyboard two-step connect gets the same hints and the same rejection path: text into a number input.
  await handle('Start connection from Title · Text').press('Enter')
  await expect(handle('Connect to Display · Show')).toHaveClass(/vw-is-valid-target/)
  await expect(handle('Connect to Average · Input B')).toHaveClass(/vw-is-invalid-target/)
  await handle('Connect to Average · Input B').press('Enter')
  await expect(status).toHaveText('Rejected: Average · Input B accepts number, not text from Title · Text.')
  await expect(edges).toHaveCount(2)

  // A pointer drop on a full limit-1 input is rejected with its reason.
  await graphStage(graph, 'Typed port graph').scrollIntoViewIfNeeded()
  await dragTo(page, handle('Start connection from Backup sensor · Reading'), handle('Start connection from Average · Input A'), { steps: 10 })
  await expect(status).toHaveText('Rejected: Average · Input A already has its maximum of 1 connection.')
  await expect(edges).toHaveCount(2)

  // Reconnecting the source of the edge into the limit-1 input does not count that edge against its own limit.
  await graph.getByRole('button', { name: 'Select edge reading', exact: true }).press('Enter')
  await handle('Reconnect source of reading').press('Enter')
  await expect(handle('Connect to Backup sensor · Reading')).toHaveClass(/vw-is-valid-target/)
  await expect(handle('Connect to Title · Text')).toHaveClass(/vw-is-invalid-target/)
  await handle('Connect to Backup sensor · Reading').press('Enter')
  await expect(status).toHaveText('Reconnected reading-a.')
  await expect(edges).toHaveCount(2)
  await expect(page.getByText('No rule violations', { exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('move, group move, resize, reshape and reconnect proposals are plain data that structuredClone copies', async ({ page }) => {
  const errors = pageErrors(page)
  await openNetworkFixture(page, '?preset=groups&draggable=1&resizable=1&editableedges=1&reconnectable=1')
  const button = (name: string) => page.getByRole('button', { name, exact: true })
  const log = fixtureStatus(page, 'Edit proposals')
  await dragBy(page, button('A'), 30, 20)
  await expect(log).toHaveText('node-move')
  await dragBy(page, button('Move group Inner within Outer'), 20, 30)
  await expect(log).toHaveText('node-move nodes-move')
  await button('B').click()
  await dragBy(page, button('Resize B · bottom right'), 20, 15)
  await expect(log).toHaveText('node-move nodes-move node-resize')
  await button('Select edge e0').press('Enter')
  await dragBy(page, button('Add waypoint 1 · e0'), 0, -30)
  await expect(log).toHaveText('node-move nodes-move node-resize edge-reshape')
  // A pointer reconnect of e0's target to D.
  await pressAndMove(page, button('Reconnect target of e0'), 10, 10)
  const target = await centerOf(button('Connect to D'))
  await page.mouse.move(target.x, target.y, { steps: 4 })
  await page.mouse.up()
  await expect(log).toHaveText('node-move nodes-move node-resize edge-reshape reconnect')
  await expect(fixtureStatus(page, 'Clone errors')).toHaveText('')
  expect(errors).toEqual([])
})

test('arrow keys on a node do not propose a move while a keyboard connection is armed', async ({ page }) => {
  const errors = pageErrors(page)
  await openNetworkFixture(page, '?nodes=4&draggable=1&connectable=1')
  const moves = fixtureStatus(page, 'Move events')
  await page.getByRole('button', { name: 'Start connection from N0001', exact: true }).press('Enter')
  await expect(page.getByRole('button', { name: 'Connect to N0002', exact: true })).toBeVisible()
  await chainNode(page, 'N0002').focus()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Shift+ArrowDown')
  await expect(moves).toHaveText('0')
  // Once the connection is cancelled, the keys move the node again.
  await page.keyboard.press('Escape')
  await expect(page.getByRole('button', { name: 'Connect to N0002', exact: true })).toHaveCount(0)
  await chainNode(page, 'N0002').press('ArrowRight')
  await expect(moves).toHaveText('1')
  expect(errors).toEqual([])
})
