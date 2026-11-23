// NetworkGraph editing: clipboard and palette, edge selection under culling, group collapse, edge styles, lasso selection
// and toolbar, group and minimap slots.
import {
  expect, test, chainNode, dragBy, emptyGraphPoint, fixtureStatus, graphMinimap, graphNode, graphStage, graphZoom, openGraphEditor,
  openNetworkFixture, pageErrors, readJson, snapped, openExample,
} from './support'

test('culling keeps selected edges rendered; Delete proposes the edge selection', async ({ page }) => {
  const errors = pageErrors(page)
  await openNetworkFixture(page, '?nodes=600&cull=1&edgeselect=1&delete=1')
  const e0 = page.getByRole('button', { name: 'Select edge e0', exact: true })
  await e0.press('Enter')
  await expect(e0).toHaveAttribute('aria-pressed', 'true')
  await page.getByLabel('Network graph', { exact: true }).focus()
  await page.evaluate(() => (window as any).__vw.graph().focusNode('N0450'))
  await expect(chainNode(page, 'N0000')).toHaveCount(0)
  await expect(e0).toHaveCount(1)
  await expect(page.getByRole('button', { name: 'Select edge e300', exact: true })).toHaveCount(0)
  // With focus on the canvas, Delete proposes the selection; the selected node joins with its incident edges.
  await page.getByLabel('Network graph', { exact: true }).press('Delete')
  await expect(page.getByRole('status', { name: 'Last deletion', exact: true })).toHaveText('{"nodeIds":[],"edgeIds":["e0"]}')
  await chainNode(page, 'N0450').click()
  await chainNode(page, 'N0450').press('Delete')
  await expect(page.getByRole('status', { name: 'Last deletion', exact: true })).toHaveText('{"nodeIds":["N0450"],"edgeIds":["e449","e450"]}')
  expect(errors).toEqual([])
})

test('clipboard shortcuts propose copy, paste and duplicate with the focused or selected elements', async ({ page }) => {
  const errors = pageErrors(page)
  await openNetworkFixture(page, '?nodes=4&clipboard=1&snap=10&edgeselect=1')
  await chainNode(page, 'N0001').click()
  await page.keyboard.press('Control+c')
  expect(await readJson(page, 'Last copy')).toEqual({ nodeIds: ['N0001'], edgeIds: [], positions: { N0001: { x: 214, y: 20 } } })
  // A focused node outside the selection stands alone.
  await chainNode(page, 'N0002').focus()
  await page.keyboard.press('Control+d')
  expect(await readJson(page, 'Last duplicate')).toEqual({ nodeIds: ['N0002'], edgeIds: [], positions: { N0002: { x: 408, y: 20 } } })
  // From a selected edge, the node and edge selections are copied together.
  await page.getByRole('button', { name: 'Select edge e0', exact: true }).press('Enter')
  await page.keyboard.press('Meta+c')
  expect(await readJson(page, 'Last copy')).toEqual({ nodeIds: ['N0001'], edgeIds: ['e0'], positions: { N0001: { x: 214, y: 20 } } })

  // Paste goes to the pointer while it is over the stage, otherwise to the centre of the viewport, on the grid.
  const stage = (await page.getByLabel('Network graph', { exact: true }).boundingBox())!
  const pointer = { x: Math.round(stage.x + 300), y: Math.round(stage.y + 200) }
  await page.mouse.move(pointer.x, pointer.y)
  // Read the chart point before the paste: the fixture writes the proposal into an inline status above the stage, and
  // where that text wraps depends on the engine's font metrics, so the stage can move down a line after the paste.
  const atPointer = await page.evaluate(({ x, y }) => (window as any).__vw.graph().toGraphPoint(x, y), pointer)
  await page.keyboard.press('Control+v')
  expect(await readJson(page, 'Last paste')).toEqual({ point: snapped(atPointer, 10) })
  await page.mouse.move(stage.x + 5, stage.y - 20)
  await page.keyboard.press('Control+v')
  const centre = await page.evaluate(() => (window as any).__vw.graph().getViewportCenter())
  expect(await readJson(page, 'Last paste')).toEqual({ point: snapped(centre, 10) })

  // Without the prop the keys keep their default meaning and nothing is proposed.
  await openNetworkFixture(page, '?nodes=4')
  await chainNode(page, 'N0001').focus()
  await page.keyboard.press('Control+c')
  await expect(fixtureStatus(page, 'Last copy')).toHaveText('')
  expect(errors).toEqual([])
})

test('native copy, paste and drop listeners on the component still reach its root element', async ({ page }) => {
  const errors = pageErrors(page)
  const dispatch = () => page.locator('.vw-network').evaluate(root => {
    const stage = root.querySelector('.vw-network-stage')!
    stage.dispatchEvent(new ClipboardEvent('copy', { bubbles: true }))
    stage.dispatchEvent(new ClipboardEvent('paste', { bubbles: true }))
    stage.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }))
  })
  // With the new props off, and with them on, the parent's native listeners receive the events.
  for (const search of ['?nodes=3&native=1', '?nodes=3&native=1&clipboard=1&drop=1']) {
    await openNetworkFixture(page, search)
    await dispatch()
    await expect(fixtureStatus(page, 'Native events')).toHaveText('copy paste drop')
  }
  // The component's own proposals use other names and still arrive.
  await expect(fixtureStatus(page, 'Last drop')).not.toHaveText('')
  expect(errors).toEqual([])
})

test('the demo palette adds nodes by drag and drop and by keyboard on the grid, and undo removes them', async ({ page }) => {
  const { errors, button, status, nodes } = await openGraphEditor(page)
  await page.getByLabel('Snap to grid').check()
  await expect(page.locator('.vw-network-background')).toHaveCount(1)
  const stage = page.getByLabel('Network graph', { exact: true })
  await button('Add operation').dragTo(stage, { targetPosition: { x: 400, y: 150 } })
  await expect(status('Added Operation 1.')).toBeVisible()
  const added = button('Operation 1 New operation')
  const [, x, y] = (await added.getAttribute('transform'))!.match(/^translate\((\S+) (\S+)\)$/)!
  expect(Number(x) % 20).toBe(0)
  expect(Number(y) % 20).toBe(0)
  // The dropped node is centred on the drop point, give or take half a grid cell.
  const box = (await added.boundingBox())!, area = (await stage.boundingBox())!
  expect(Math.abs(box.x + box.width / 2 - (area.x + 400))).toBeLessThan(15)
  expect(Math.abs(box.y + box.height / 2 - (area.y + 150))).toBeLessThan(15)
  await button('Add lot').press('Enter')
  await expect(button('Lot 1 New lot')).toBeVisible()
  await button('Add operation').focus()
  await page.keyboard.press('Space')
  await expect(button('Operation 2 New operation')).toBeVisible()
  await expect(nodes).toHaveCount(9)
  for (let i = 0; i < 3; i++) await button('Undo').click()
  await expect(nodes).toHaveCount(6)
  await expect(button('Operation 1 New operation')).toHaveCount(0)
  await button('Redo').click()
  await expect(button('Operation 1 New operation')).toBeVisible()
  expect(errors).toEqual([])
})

test('demo copy, paste and duplicate go through the edit history, and guides appear in an aligned drag', async ({ page }) => {
  const { errors, button, status, nodes, edges } = await openGraphEditor(page)
  const split = button('Split Operation 101'), lot = button('Lot A123-01 72 units')
  await split.click()
  await lot.click({ modifiers: ['Shift'] })
  await page.keyboard.press('Control+c')
  await expect(status('Copied 2 nodes.')).toBeVisible()
  const stage = (await page.getByLabel('Network graph', { exact: true }).boundingBox())!
  await page.mouse.move(stage.x + 20, stage.y + 20)
  await page.keyboard.press('Control+v')
  await expect(status('Pasted 2 nodes and 1 edge.')).toBeVisible()
  await expect(nodes).toHaveCount(8)
  await expect(edges).toHaveCount(7)
  await expect(button('Split (copy) Operation 101')).toHaveAttribute('aria-pressed', 'true')
  await button('Undo').click()
  await expect(nodes).toHaveCount(6)
  await expect(edges).toHaveCount(6)

  await button('Finish Operation 102').focus()
  await page.keyboard.press('Control+d')
  await expect(status('Duplicated 1 node.')).toBeVisible()
  await expect(button('Finish (copy) Operation 102')).toBeVisible()
  await expect(nodes).toHaveCount(7)
  await button('Undo').click()
  await expect(nodes).toHaveCount(6)
  await button('Redo').click()
  await expect(button('Finish (copy) Operation 102')).toBeVisible()

  // The two lots share a column, so a slightly sideways drag of one aligns with the other.
  await page.getByLabel('Alignment guides').check()
  await dragBy(page, lot, 3, 50, async () => {
    await expect(page.locator('.vw-guide').first()).toBeAttached()
  })
  await expect(status('Moved node lot1.')).toBeVisible()
  await expect(page.locator('.vw-guide')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('demo groups collapse and expand by click and keyboard, through the edit history', async ({ page }) => {
  const { errors, button, status, edges } = await openGraphEditor(page)
  await page.getByLabel('Collapsible groups').check()
  const collapse = button('Collapse group Intermediate lots'), expand = button('Expand group Intermediate lots')
  await expect(collapse).toHaveAttribute('aria-expanded', 'true')
  await collapse.click()
  await expect(status('Collapsed Intermediate lots.')).toBeVisible()
  await expect(expand).toHaveAttribute('aria-expanded', 'false')
  await expect(expand).toBeFocused()
  // One proxy replaces both lots; the parallel edges into and out of the group merge.
  const proxy = button('Intermediate lots 2 nodes')
  await expect(proxy).toBeVisible()
  await expect(button('Lot A123-01 72 units')).toHaveCount(0)
  await expect(button('Move group Intermediate lots')).toHaveCount(0)
  await expect(edges).toHaveCount(4)
  // Moving the proxy moves both members.
  await proxy.focus()
  await page.keyboard.press('ArrowDown')
  await expect(status('Moved 2 nodes.')).toBeVisible()
  await expect(proxy).toBeVisible()
  await expand.focus()
  await page.keyboard.press('Enter')
  await expect(status('Expanded Intermediate lots.')).toBeVisible()
  await expect(collapse).toBeFocused()
  await expect(button('Lot A123-01 72 units')).toBeVisible()
  await expect(edges).toHaveCount(6)
  await button('Undo').click()
  await expect(proxy).toBeVisible()
  await button('Undo').click()
  await button('Undo').click()
  await expect(button('Lot A123-02 48 units')).toBeVisible()
  await expect(collapse).toBeVisible()
  await button('Redo').click()
  await expect(proxy).toBeVisible()
  expect(errors).toEqual([])
})

test('a pointer click on a proxy expand toggle expands the group and does not start a connection', async ({ page }) => {
  const { errors, button, status } = await openGraphEditor(page)
  await page.getByLabel('Collapsible groups').check()
  for (const direction of ['LR', 'TB', 'RL', 'BT']) {
    await page.getByLabel('Direction').selectOption(direction)
    await button('Collapse group Intermediate lots').click()
    await expect(status('Collapsed Intermediate lots.')).toBeVisible()
    const expand = button('Expand group Intermediate lots')
    // The toggle and the proxy's connection handle do not overlap, so a real click reaches the toggle.
    const toggle = (await expand.boundingBox())!
    const handle = (await button('Start connection from Intermediate lots').boundingBox())!
    expect(toggle.x + toggle.width <= handle.x || handle.x + handle.width <= toggle.x
      || toggle.y + toggle.height <= handle.y || handle.y + handle.height <= toggle.y).toBe(true)
    await page.mouse.click(toggle.x + toggle.width / 2, toggle.y + toggle.height / 2)
    await expect(status('Expanded Intermediate lots.')).toBeVisible()
    await expect(expand).toHaveCount(0)
    await expect(page.getByRole('button', { name: /^Connect to / })).toHaveCount(0)
  }
  expect(errors).toEqual([])
})

test('demo edge style switches between curves, orthogonal routes and straight lines', async ({ page }) => {
  const { errors } = await openGraphEditor(page)
  const fp = page.locator('.vw-network-edge').last()
  await expect(fp).toHaveAttribute('d', / C /)
  const style = page.getByLabel('Edge style')
  await style.selectOption('orthogonal')
  await expect(fp).toHaveAttribute('d', /^M [\d. ]+(?: [LQ] [\d. ]+)+$/)
  // The split to lot edge turns at right angles: every segment is horizontal or vertical.
  const d = (await page.locator('.vw-network-edge').nth(1).getAttribute('d'))!
  let previous: number[] = []
  for (const [, command, values] of d.matchAll(/([MLQ]) ([^MLQ]+)/g)) {
    const numbers = values!.trim().split(' ').map(Number)
    // Line segments are axis-aligned; a Q command only rounds a corner.
    if (command === 'L') expect(numbers[0] === previous[0] || numbers[1] === previous[1]).toBe(true)
    previous = numbers.slice(-2)
  }
  await style.selectOption('straight')
  await expect(fp).toHaveAttribute('d', /^M [\d.]+ [\d.]+ L [\d.]+ [\d.]+$/)
  await style.selectOption('curve')
  await expect(fp).toHaveAttribute('d', / C /)
  expect(errors).toEqual([])
})

test('lasso selection selects the nodes whose centre the outline encloses, keeps modifiers and cancels on Escape', async ({ page }) => {
  const errors = pageErrors(page)
  await openExample(page, 'graph-and-gantt')
  await page.getByLabel('Edit graph').check()
  await page.getByLabel('Lasso selection').check()
  const lots = graphNode(page, /^Lot A123-/)
  const split = page.getByRole('button', { name: 'Split Operation 101', exact: true })
  type Box = { x: number; y: number; width: number; height: number }
  // A diamond around a set of boxes, drawn from its bottom corner.
  async function lasso(boxes: Box[], options: { modifiers?: string[]; cancel?: boolean } = {}) {
    const left = Math.min(...boxes.map(box => box.x)), right = Math.max(...boxes.map(box => box.x + box.width))
    const top = Math.min(...boxes.map(box => box.y)), bottom = Math.max(...boxes.map(box => box.y + box.height))
    const cx = (left + right) / 2, cy = (top + bottom) / 2
    const corners = [[cx, bottom + 30], [right + 40, cy], [cx, top - 30], [left - 40, cy], [cx - 4, bottom + 26]]
    for (const key of ['Shift', ...options.modifiers ?? []]) await page.keyboard.down(key)
    await page.mouse.move(corners[0]![0]!, corners[0]![1]!)
    await page.mouse.down()
    for (const [x, y] of corners.slice(1)) await page.mouse.move(x!, y!, { steps: 6 })
    await expect(page.locator('.vw-lasso-selection')).toBeVisible()
    await expect(page.locator('.vw-box-selection')).toHaveCount(0)
    if (options.cancel) await page.keyboard.press('Escape')
    await page.mouse.up()
    for (const key of [...options.modifiers ?? [], 'Shift'].reverse()) await page.keyboard.up(key)
    await expect(page.locator('.vw-lasso-selection')).toHaveCount(0)
  }
  const lotBoxes = [(await lots.first().boundingBox())!, (await lots.last().boundingBox())!]
  await lasso(lotBoxes)
  await expect(lots.first()).toHaveAttribute('aria-pressed', 'true')
  await expect(lots.last()).toHaveAttribute('aria-pressed', 'true')
  await expect(split).toHaveAttribute('aria-pressed', 'false')
  // Escape discards the outline and keeps the selection.
  const splitBox = (await split.boundingBox())!
  await lasso([splitBox], { cancel: true })
  await expect(lots.first()).toHaveAttribute('aria-pressed', 'true')
  await expect(split).toHaveAttribute('aria-pressed', 'false')
  // Ctrl (Meta) adds to the previous selection, as with box selection.
  await lasso([splitBox], { modifiers: ['Control'] })
  await expect(split).toHaveAttribute('aria-pressed', 'true')
  await expect(lots.first()).toHaveAttribute('aria-pressed', 'true')
  // A plain lasso replaces it; the selection moves as one batch.
  await lasso([splitBox])
  await expect(split).toHaveAttribute('aria-pressed', 'true')
  await expect(lots.first()).toHaveAttribute('aria-pressed', 'false')
  // Turning the lasso off brings back box selection.
  await page.getByLabel('Lasso selection').uncheck()
  await page.keyboard.down('Shift')
  await page.mouse.move(lotBoxes[0]!.x - 9, lotBoxes[0]!.y - 12)
  await page.mouse.down()
  await page.mouse.move(lotBoxes[1]!.x + lotBoxes[1]!.width + 8, lotBoxes[1]!.y + lotBoxes[1]!.height + 7, { steps: 8 })
  await expect(page.locator('.vw-box-selection')).toBeVisible()
  await expect(page.locator('.vw-lasso-selection')).toHaveCount(0)
  await page.mouse.up()
  await page.keyboard.up('Shift')
  await expect(lots.last()).toHaveAttribute('aria-pressed', 'true')
  expect(errors).toEqual([])
})

test('the graph and Gantt demo clears the shared selection on a click on the empty canvas or Escape, after a cancelled gesture', async ({ page }) => {
  const errors = pageErrors(page)
  await openExample(page, 'graph-and-gantt')
  const stage = graphStage(page)
  const split = stage.getByRole('button', { name: 'Split Operation 101', exact: true })
  const plan = page.getByRole('button', { name: 'Split · plan 09:00–11:00', exact: true })
  const status = page.getByRole('status').filter({ hasText: 'Selection cleared.' })
  // The demo opens with Split selected in the graph and its bars selected in the timeline.
  await expect(split).toHaveAttribute('aria-pressed', 'true')
  await expect(plan).toHaveAttribute('aria-pressed', 'true')
  await stage.click({ position: await emptyGraphPoint(stage) })
  await expect(split).toHaveAttribute('aria-pressed', 'false')
  await expect(plan).toHaveAttribute('aria-pressed', 'false')
  await expect(status).toBeVisible()

  // While editing, the first Escape only cancels an armed connection; the next one clears the selection.
  await page.getByLabel('Edit graph').check()
  await split.click()
  await expect(split).toHaveAttribute('aria-pressed', 'true')
  await expect(plan).toHaveAttribute('aria-pressed', 'true')
  const handle = stage.getByRole('button', { name: 'Start connection from Split', exact: true })
  await handle.press('Enter')
  await expect(handle).toHaveAttribute('aria-pressed', 'true')
  await handle.press('Escape')
  await expect(handle).toHaveAttribute('aria-pressed', 'false')
  await expect(split).toHaveAttribute('aria-pressed', 'true')
  await split.press('Escape')
  await expect(split).toHaveAttribute('aria-pressed', 'false')
  await expect(plan).toHaveAttribute('aria-pressed', 'false')
  expect(errors).toEqual([])
})

test('toolbar slots follow the selected node and edge, and group and minimap slots restyle the graph', async ({ page }) => {
  const errors = pageErrors(page)
  await openExample(page, 'graph-and-gantt')
  await page.getByLabel('Edit graph').check()
  await page.getByLabel('Item toolbars').check()
  const status = (text: string) => page.getByRole('status').filter({ hasText: text })
  const split = page.getByRole('button', { name: 'Split Operation 101', exact: true })
  const finish = page.getByRole('button', { name: 'Finish Operation 102', exact: true })
  const toolbar = page.getByRole('group', { name: 'Node actions Split', exact: true })
  await expect(toolbar).toHaveCount(0)
  await split.click()
  await expect(toolbar).toBeVisible()
  const placed = async () => {
    const [t, n] = [(await toolbar.boundingBox())!, (await split.boundingBox())!]
    return { gap: n.y - (t.y + t.height), center: t.x + t.width / 2 - (n.x + n.width / 2) }
  }
  let place = await placed()
  expect(place.gap).toBeGreaterThan(4)
  expect(Math.abs(place.center)).toBeLessThan(2)
  const fontSize = await toolbar.getByRole('button', { name: 'Frame', exact: true }).evaluate(element => getComputedStyle(element).fontSize)
  // Zooming moves the node; the toolbar follows it at the same text size.
  await graphZoom(page).getByRole('button', { name: 'Zoom out', exact: true }).click()
  place = await placed()
  expect(place.gap).toBeGreaterThan(4)
  expect(Math.abs(place.center)).toBeLessThan(2)
  expect(await toolbar.getByRole('button', { name: 'Frame', exact: true }).evaluate(element => getComputedStyle(element).fontSize)).toBe(fontSize)
  // Two selected nodes show no toolbar.
  await finish.click({ modifiers: ['Shift'] })
  await expect(page.getByRole('group', { name: /^Node actions/ })).toHaveCount(0)
  await split.click()
  await toolbar.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(status('Deleted 1 node')).toBeVisible()
  await expect(split).toHaveCount(0)
  await expect(toolbar).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(split).toBeVisible()

  // The edge toolbar follows the selected edge.
  const edges = page.locator('.vw-network-edge')
  const count = await edges.count()
  await page.getByRole('button', { name: 'Select edge 72', exact: true }).press('Enter')
  const edgeToolbar = page.getByRole('group', { name: 'Edge actions 72', exact: true })
  await expect(edgeToolbar).toBeVisible()
  await edgeToolbar.getByRole('button', { name: 'Remove', exact: true }).click()
  await expect(edges).toHaveCount(count - 1)
  await expect(edgeToolbar).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(edges).toHaveCount(count)

  // The group slot draws the frame; the move handle keeps its name and keys.
  await expect(page.locator('.vw-network-group.vw-has-slot .demo-group-frame')).toHaveCount(1)
  await expect(page.locator('.demo-group-label')).toHaveText('Intermediate lots')
  const lots = graphNode(page, /^Lot A123-/)
  const before = await lots.first().getAttribute('transform')
  await page.getByRole('button', { name: 'Move group Intermediate lots', exact: true }).press('ArrowDown')
  await expect(lots.first()).not.toHaveAttribute('transform', before!)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(lots.first()).toHaveAttribute('transform', before!)
  // The minimap draws its nodes through the minimap-node slot and still navigates.
  await split.click()
  await expect(graphMinimap(page).locator('.demo-minimap-node')).toHaveCount(6)
  await expect(graphMinimap(page).locator('.demo-minimap-node.is-selected')).toHaveCount(1)
  const camera = await page.locator('.vw-network-stage > g').first().getAttribute('transform')
  await page.getByRole('button', { name: 'Navigate graph overview' }).click({ position: { x: 20, y: 30 } })
  await expect(page.locator('.vw-network-stage > g').first()).not.toHaveAttribute('transform', camera!)
  // Without the slots the default overlay returns.
  await page.getByLabel('Item toolbars').uncheck()
  await expect(page.locator('.vw-has-slot')).toHaveCount(0)
  await expect(graphMinimap(page).locator('.demo-minimap-node')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('the graph palette adds a node and reports it in Japanese', async ({ page }) => {
  const errors = pageErrors(page)
  const demo = await openExample(page, 'graph-and-gantt', { locale: 'ja' })
  await demo.getByRole('checkbox', { name: 'グラフを編集', exact: true }).check()
  const palette = demo.getByRole('group', { name: 'ノードのパレット' })
  await palette.getByRole('button', { name: '工程を追加', exact: true }).click()
  await expect(demo.getByRole('status').filter({ hasText: '工程 1 を追加しました。' })).toBeVisible()
  await demo.getByRole('button', { name: '元に戻す', exact: true }).click()
  await expect(demo.getByRole('status').filter({ hasText: '直前の編集を元に戻しました。' })).toBeVisible()
  expect(errors).toEqual([])
})
