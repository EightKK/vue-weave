// NetworkGraph editing: moves, connections and ports, selection, deletion, menus and tooltips, snapping, clipboard, groups, waypoints, resizing, labels, lasso and toolbars.
import {
  expect, test, animationFrames, centerOf, chainNode, dragBy, fixtureStatus, openDemo, openGraphEditor, openNetworkFixture, pageErrors, pressAndMove, readCamera,
  type Page,
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

type Point = { x: number; y: number }

// JSON turns -0 into 0, so the expectation adds 0 as well.
const snapped = (point: Point, grid: number) => ({ x: Math.round(point.x / grid) * grid + 0, y: Math.round(point.y / grid) * grid + 0 })

const readJson = async (page: Page, name: string) => JSON.parse(await fixtureStatus(page, name).textContent() || 'null')

test('graph moves are controlled and connections can be accepted or rejected', async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto('/gallery.html')
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
  const a = (await source.boundingBox())!, b = (await target.boundingBox())!
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 12 })
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
  const endpoint = (await page.getByRole('button', { name: 'Reconnect source of du', exact: true }).boundingBox())!
  const replacement = (await page.getByRole('button', { name: 'Start connection from API · Output', exact: true }).boundingBox())!
  await page.mouse.move(endpoint.x + endpoint.width / 2, endpoint.y + endpoint.height / 2)
  await page.mouse.down()
  await page.mouse.move(replacement.x + replacement.width / 2, replacement.y + replacement.height / 2, { steps: 10 })
  await page.mouse.up()
  await expect(page.getByRole('status').filter({ hasText: 'Reconnected edge du' })).toBeVisible()
  await expect(page.locator('.vw-network-edge')).toHaveCount(4)
  expect(errors).toEqual([])
})

test('range selection and group movement commit an atomic batch', async ({ page }) => {
  await page.goto('/gallery.html')
  await page.getByLabel('Edit graph').check()
  const lots = page.locator('.vw-network-node').filter({ hasText: 'Lot A123-' })
  const boxes = await Promise.all([lots.first().boundingBox(), lots.last().boundingBox()])
  const [a, b] = boxes
  await page.keyboard.down('Shift')
  await page.mouse.move(a!.x - 9, a!.y - 12)
  await page.mouse.down()
  await page.mouse.move(b!.x + b!.width + 8, b!.y + b!.height + 7, { steps: 8 })
  await expect(page.locator('.vw-box-selection')).toBeVisible()
  await page.mouse.up()
  await page.keyboard.up('Shift')
  await expect(lots.first()).toHaveAttribute('aria-pressed', 'true')
  await expect(lots.last()).toHaveAttribute('aria-pressed', 'true')
  const before = await Promise.all([lots.first().getAttribute('transform'), lots.last().getAttribute('transform')])
  await page.getByRole('button', { name: 'Move group Intermediate lots', exact: true }).press('ArrowDown')
  await expect(lots.first()).not.toHaveAttribute('transform', before[0]!)
  await expect(lots.last()).not.toHaveAttribute('transform', before[1]!)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(lots.first()).toHaveAttribute('transform', before[0]!)
  await expect(lots.last()).toHaveAttribute('transform', before[1]!)
})

test('dragging a node under culling emits one proposal and keeps the node rendered', async ({ page }) => {
  const errors = pageErrors(page)
  await openNetworkFixture(page, '?nodes=600&cull=1&draggable=1')
  const node = chainNode(page, 'N0001')
  const box = (await node.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 30, { steps: 6 })
  await expect(node).toHaveCount(1)
  await page.mouse.up()
  await expect(page.getByRole('status', { name: 'Last move', exact: true })).toHaveText('N0001')
  await expect(page.getByRole('status', { name: 'Move events', exact: true })).toHaveText('1')
  await expect(node).toHaveCount(1)
  expect(errors).toEqual([])
})

test('the preserve routing policy keeps an external port route while an unrelated node is dragged', async ({ page }) => {
  const errors = pageErrors(page)
  const paths = () => page.locator('[data-vw-edge]').evaluateAll(list => Object.fromEntries(list.map(item => [item.getAttribute('data-vw-edge'), item.getAttribute('d')])))
  for (const policy of ['preserve', 'builtin']) {
    await openNetworkFixture(page, `?preset=ports&draggable=1&edgeselect=1&style=orthogonal&policy=${policy}`)
    const external = await page.evaluate(() => (window as any).__vw.external.path as string)
    const initial = await paths()
    if (policy === 'preserve') expect(initial.ab).toBe(external)
    else expect(initial.ab).not.toBe(external)
    // The drag preview updates the dragged node's edges locally; it must equal the full routing of the committed move.
    for (const [name, count] of [['D', '1'], ['B', '2']] as const) {
      const node = chainNode(page, name)
      const box = (await node.boundingBox())!
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
      await page.mouse.down()
      await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 70, { steps: 5 })
      const preview = await paths()
      if (name === 'D') {
        expect(preview.ab).toBe(initial.ab)
        expect(preview.e2).not.toBe(initial.e2)
      } else expect(preview.ab).not.toBe(initial.ab)
      await page.mouse.up()
      await expect(page.getByRole('status', { name: 'Move events', exact: true })).toHaveText(count)
      expect(await paths()).toEqual(preview)
    }
    // The SVG export draws the same routes as the screen, preserved ones included.
    const exported = await page.evaluate(() => (window as any).__vw.graph().exportSvg() as string)
    const exportedPaths = [...exported.matchAll(/<path d="([^"]+)"[^>]*marker-end=/g)].map(match => match[1]).sort()
    expect(exportedPaths).toEqual(Object.values(await paths()).sort())
  }
  expect(errors).toEqual([])
})

test('moving a parent group proposes one batch with every descendant; a child moves only its own members', async ({ page }) => {
  const errors = pageErrors(page)
  await openNetworkFixture(page, '?preset=groups&draggable=1')
  const outer = page.getByRole('button', { name: 'Move group Outer', exact: true })
  const inner = page.getByRole('button', { name: 'Move group Inner within Outer', exact: true })
  await expect(outer).toBeVisible()
  await expect(inner).toBeVisible()
  const last = page.getByRole('status', { name: 'Last move', exact: true })
  const events = page.getByRole('status', { name: 'Move events', exact: true })

  const o = (await outer.boundingBox())!
  await page.mouse.move(o.x + o.width / 2, o.y + o.height / 2)
  await page.mouse.down()
  await page.mouse.move(o.x + o.width / 2 + 30, o.y + o.height / 2 + 20, { steps: 5 })
  await page.mouse.up()
  await expect(last).toHaveText('B,C,D')
  await expect(events).toHaveText('1')

  const i = (await inner.boundingBox())!
  await page.mouse.move(i.x + i.width / 2, i.y + i.height / 2)
  await page.mouse.down()
  await page.mouse.move(i.x + i.width / 2 + 30, i.y + i.height / 2 + 20, { steps: 5 })
  await page.mouse.up()
  await expect(last).toHaveText('C,D')
  await expect(events).toHaveText('2')

  await outer.focus()
  await page.keyboard.press('ArrowRight')
  await expect(last).toHaveText('B,C,D')
  await expect(events).toHaveText('3')
  expect(errors).toEqual([])
})

// Structural guard for drag cost: the number of items that re-render, not wall-clock time.
test('a node drag preview re-renders only the dragged node and its edges, without culling', async ({ page }) => {
  const errors = pageErrors(page)
  await openNetworkFixture(page, '?nodes=300&draggable=1&slots=1&minimap=1')
  await expect(page.locator('.vw-test-node')).toHaveCount(300)
  const node = chainNode(page, 'N0001')
  const box = (await node.boundingBox())!
  const x = box.x + box.width / 2, y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  // Past the drag threshold, so every following move updates the preview.
  await page.mouse.move(x + 10, y + 6)
  const transform = await node.getAttribute('transform')
  await page.evaluate(() => {
    const vw = (window as any).__vw
    vw.renders.node = vw.renders.edge = 0
    vw.changed = new Set()
    vw.observer = new MutationObserver(records => {
      for (const record of records) {
        const target = record.target instanceof Element ? record.target : record.target.parentElement
        const owner = target?.closest('[data-vw-node], [data-edge]')
        if (owner) vw.changed.add(owner.getAttribute('data-vw-node') ?? owner.getAttribute('data-edge'))
      }
    })
    vw.observer.observe(document.querySelector('.vw-network-stage')!, { subtree: true, attributes: true, childList: true, characterData: true })
  })
  const moves = 8
  for (let i = 1; i <= moves; i++) await page.mouse.move(x + 10 + i * 7, y + 6 + i * 3)
  await expect(node).not.toHaveAttribute('transform', transform!)
  const counts = await page.evaluate(() => {
    const vw = (window as any).__vw
    vw.observer.takeRecords()
    vw.observer.disconnect()
    return { node: vw.renders.node, edge: vw.renders.edge, changed: [...vw.changed].sort() }
  })
  // One render of the dragged node and of each of its two edges per move; nothing else in the stage changes.
  expect(counts.node).toBeGreaterThanOrEqual(1)
  expect(counts.node).toBeLessThanOrEqual(moves)
  expect(counts.edge).toBeLessThanOrEqual(2 * moves)
  expect(counts.changed).toEqual(['N0001', 'e0', 'e1'])
  await page.mouse.up()
  await expect(page.getByRole('status', { name: 'Last move', exact: true })).toHaveText('N0001')
  expect(errors).toEqual([])
})

test('a node drag preview with the minimap, connection handles and groups changes only the items of the dragged node', async ({ page }) => {
  const errors = pageErrors(page)
  await openNetworkFixture(page, '?nodes=300&draggable=1&minimap=1&connectable=1&groups=chain&reads=1&menu=1')
  await expect(page.locator('.vw-minimap rect:not(.vw-minimap-window)')).toHaveCount(300)
  await expect(page.getByRole('button', { name: 'Start connection from N0001', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Move group Group 0 within Parent 0', exact: true })).toBeVisible()
  const node = chainNode(page, 'N0001')
  const box = (await node.boundingBox())!
  const x = box.x + box.width / 2, y = box.y + box.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  // Past the drag threshold, so every following move updates the preview.
  await page.mouse.move(x + 10, y + 6)
  const transform = await node.getAttribute('transform')
  await page.evaluate(() => {
    const vw = (window as any).__vw
    const root = document.querySelector('.vw-network')!
    const minimapRects = [...root.querySelectorAll('.vw-minimap rect:not(.vw-minimap-window)')]
    vw.reads.count = 0
    vw.records = 0
    vw.changed = new Set()
    // Each mutation is attributed to the item it belongs to: a node (with its connection handle), an edge (named by
    // `data-vw-edge` with the context menu on), a group frame or a minimap rectangle, which follows the node order.
    const owner = (element: Element | null) => {
      const group = element?.closest('.vw-network-group')
      if (group) return 'group ' + group.querySelector('[data-vw-group]')?.getAttribute('data-vw-group')
      const item = element?.closest('[data-vw-node], [data-vw-edge]')
      if (item) return item.getAttribute('data-vw-node') ?? item.getAttribute('data-vw-edge')
      const index = element ? minimapRects.indexOf(element) : -1
      if (index >= 0) return 'minimap N' + String(index).padStart(4, '0')
      if (element?.closest('.vw-minimap')) return 'minimap view'
      return 'other ' + element?.tagName + '.' + element?.getAttribute('class')
    }
    vw.observer = new MutationObserver(records => {
      for (const record of records) {
        vw.records++
        vw.changed.add(owner(record.target instanceof Element ? record.target : record.target.parentElement))
      }
    })
    vw.observer.observe(root, { subtree: true, attributes: true, childList: true, characterData: true })
  })
  const moves = 8
  for (let i = 1; i <= moves; i++) await page.mouse.move(x + 10 + i * 7, y + 6 + i * 5)
  await expect(node).not.toHaveAttribute('transform', transform!)
  const result = await page.evaluate(() => {
    const vw = (window as any).__vw
    vw.observer.takeRecords().forEach(() => vw.records++)
    vw.observer.disconnect()
    return { reads: vw.reads.count, records: vw.records, changed: [...vw.changed].sort() }
  })
  // The dragged node, its handle and its two edges, the frames of its group and of the parent group, its minimap
  // rectangle and the minimap view of the taller graph change; nothing else does, and the work per move does not
  // read the other 299 nodes.
  expect(result.changed).toEqual(['N0001', 'e0', 'e1', 'group g0', 'group p0', 'minimap N0001', 'minimap view'])
  expect(result.records).toBeLessThanOrEqual(12 * moves)
  expect(result.reads).toBeLessThan(40 * moves)
  await page.mouse.up()
  await expect(page.getByRole('status', { name: 'Last move', exact: true })).toHaveText('N0001')
  expect(errors).toEqual([])
})

test('culled drag previews keep the edges of dragged nodes rendered', async ({ page }) => {
  const errors = pageErrors(page)
  await openNetworkFixture(page, '?nodes=600&cull=1&draggable=1')
  const edges = page.locator('.vw-network-edge')
  const node = chainNode(page, 'N0002')
  const box = (await node.boundingBox())!
  const before = await edges.count()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 40, { steps: 6 })
  await expect(node).toHaveCount(1)
  expect(await edges.count()).toBeGreaterThanOrEqual(before)
  // The edges attached to the dragged node follow it.
  const [incoming, outgoing] = await edges.evaluateAll(list => list.slice(1, 3).map(el => el.getAttribute('d')))
  expect(incoming).toMatch(/^M /)
  expect(outgoing).not.toBe(incoming)
  await page.mouse.up()
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
  const box = (await lot2.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 40, { steps: 5 })
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

test('graph context menu opens by right-click and Shift+F10 and returns focus on Escape', async ({ page }) => {
  const { errors, button, status, edges } = await openGraphEditor(page)
  const finish = button('Finish Operation 102')
  await finish.click({ button: 'right' })
  const nodeMenu = page.getByRole('menu', { name: 'Actions for Finish', exact: true })
  await expect(nodeMenu).toBeVisible()
  await expect(nodeMenu.getByRole('menuitem', { name: 'Delete', exact: true })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(nodeMenu.getByRole('menuitem', { name: 'Focus node', exact: true })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(nodeMenu).toHaveCount(0)
  await expect(finish).toBeFocused()

  // The keyboard opens the menu for the focused edge; Delete goes through the same proposal path.
  const fp = button('Select edge fp')
  await fp.focus()
  await page.keyboard.press('Shift+F10')
  const edgeMenu = page.getByRole('menu', { name: 'Actions for edge fp', exact: true })
  await expect(edgeMenu.getByRole('menuitem', { name: 'Delete', exact: true })).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(edgeMenu).toHaveCount(0)
  await expect(edges).toHaveCount(5)
  await expect(status('Deleted 1 edge.')).toBeVisible()
  await expect(page.getByLabel('Network graph', { exact: true })).toBeFocused()

  // The empty canvas and a group label have their own targets; a click outside closes the menu.
  await page.getByLabel('Network graph', { exact: true }).click({ button: 'right', position: { x: 12, y: 12 } })
  const canvasMenu = page.getByRole('menu', { name: 'Graph actions', exact: true })
  await expect(canvasMenu.getByRole('menuitem', { name: 'Fit selection', exact: true })).toBeVisible()
  await page.getByRole('heading', { name: 'Network', exact: true }).click()
  await expect(canvasMenu).toHaveCount(0)
  await button('Move group Intermediate lots').click({ button: 'right' })
  await page.getByRole('menu', { name: 'Actions for group Intermediate lots', exact: true }).getByRole('menuitem', { name: 'Select group' }).click()
  await expect(button('Lot A123-01 72 units')).toHaveAttribute('aria-pressed', 'true')
  await expect(button('Lot A123-02 48 units')).toHaveAttribute('aria-pressed', 'true')
  expect(errors).toEqual([])
})

test('graph tooltip shows on hover after a delay and on keyboard focus, stays hoverable and hides with Escape or a drag', async ({ page }) => {
  // A controlled clock: time flows as usual, and runFor below runs the tooltip's hide timer at once.
  await page.clock.install()
  const { errors, button } = await openGraphEditor(page)
  const tooltip = page.getByRole('tooltip')
  const split = button('Split Operation 101')
  await expect(split).not.toHaveAttribute('aria-describedby', /./)
  await split.hover()
  await expect(tooltip).toContainText('Operation 101')
  const id = (await tooltip.getAttribute('id'))!
  expect(id).toBeTruthy()
  await expect(split).toHaveAttribute('aria-describedby', id)
  // The pointer can move onto the tooltip without hiding it.
  const tip = (await tooltip.boundingBox())!
  await page.mouse.move(tip.x + tip.width / 2, tip.y + tip.height / 2)
  // Past the 150 ms grace period of the hide timer.
  await page.clock.runFor(400)
  await expect(tooltip).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(tooltip).toHaveCount(0)
  await expect(split).not.toHaveAttribute('aria-describedby', /./)

  // Keyboard focus shows the tooltip of the focused node at once.
  await split.focus()
  await page.keyboard.press('Tab')
  const lot1 = button('Lot A123-01 72 units')
  await expect(lot1).toBeFocused()
  await expect(tooltip).toContainText('72 units')
  await expect(lot1).toHaveAttribute('aria-describedby', id)
  await page.keyboard.press('Escape')
  await expect(tooltip).toHaveCount(0)

  // Edges show a tooltip too, and a drag hides any tooltip.
  await button('Select edge fp').focus()
  await expect(tooltip).toContainText('Finish → Product B')
  const lot2 = button('Lot A123-02 48 units')
  await lot2.hover()
  await expect(tooltip).toContainText('48 units')
  const box = (await lot2.boundingBox())!
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 30, box.y + box.height / 2 + 30, { steps: 5 })
  await expect(tooltip).toHaveCount(0)
  await page.mouse.up()
  expect(errors).toEqual([])
})

test('fit selection centres the selected nodes in the demo', async ({ page }) => {
  const { errors, button, status } = await openGraphEditor(page)
  const fit = button('Fit selection')
  await expect(fit).toBeDisabled()
  const lot1 = button('Lot A123-01 72 units'), lot2 = button('Lot A123-02 48 units')
  await lot1.click()
  await lot2.click({ modifiers: ['Shift'] })
  await fit.click()
  await expect(status('Fitted 2 nodes.')).toBeVisible()
  const stage = (await page.getByLabel('Network graph', { exact: true }).boundingBox())!
  const a = (await lot1.boundingBox())!, b = (await lot2.boundingBox())!
  const left = Math.min(a.x, b.x), right = Math.max(a.x + a.width, b.x + b.width)
  const top = Math.min(a.y, b.y), bottom = Math.max(a.y + a.height, b.y + b.height)
  expect(Math.abs((left + right) / 2 - (stage.x + stage.width / 2))).toBeLessThan(2)
  expect(Math.abs((top + bottom) / 2 - (stage.y + stage.height / 2))).toBeLessThan(2)
  expect(top).toBeGreaterThanOrEqual(stage.y + 23)
  expect(bottom).toBeLessThanOrEqual(stage.y + stage.height - 23)
  expect(errors).toEqual([])
})

test('fit with ids and padding fits the union under culling and validates its input', async ({ page }) => {
  const errors = pageErrors(page)
  await openNetworkFixture(page, '?nodes=600&cull=1')
  const events = page.getByRole('status', { name: 'Viewport events', exact: true })
  const before = Number(await events.textContent())
  await page.evaluate(() => (window as any).__vw.graph().fit({ ids: new Set(['N0450', 'N0452']), padding: 40 }))
  await expect(events).toHaveText(String(before + 1))
  const camera = await readCamera(page)
  expect(camera.scale).toBeCloseTo(1.15, 6)
  const stage = (await page.getByLabel('Network graph', { exact: true }).boundingBox())!
  const first = (await chainNode(page, 'N0450').boundingBox())!, last = (await chainNode(page, 'N0452').boundingBox())!
  expect(Math.abs((first.x + last.x + last.width) / 2 - (stage.x + stage.width / 2))).toBeLessThan(1)
  expect(first.x).toBeGreaterThanOrEqual(stage.x + 40)
  await expect(chainNode(page, 'N0000')).toHaveCount(0)
  // A tight padding on a wide union scales down; the scale never drops below the zoom minimum.
  await page.evaluate(() => (window as any).__vw.graph().fit({ ids: ['N0000', 'N0599'], padding: 10 }))
  expect((await readCamera(page)).scale).toBeLessThan(0.1)
  // An empty list changes nothing and emits nothing.
  const fitted = await readCamera(page)
  const count = await events.textContent()
  await page.evaluate(() => (window as any).__vw.graph().fit({ ids: [] }))
  expect(await readCamera(page)).toEqual(fitted)
  await expect(events).toHaveText(count!)
  const failure = (options: unknown) => page.evaluate(value => {
    try { (window as any).__vw.graph().fit(value) } catch (error) { return (error as Error).name + ': ' + (error as Error).message }
  }, options)
  expect(await failure({ ids: ['missing'] })).toBe('Error: Unknown node: missing')
  expect(await failure({ ids: ['N0001'], padding: -1 })).toMatch(/^RangeError: /)
  expect(await failure({ padding: Number.NaN })).toMatch(/^RangeError: /)
  expect(await readCamera(page)).toEqual(fitted)
  // fit() without options still shows the whole chain.
  await page.evaluate(() => (window as any).__vw.graph().fit())
  await expect(chainNode(page)).toHaveCount(600)
  expect(errors).toEqual([])
})

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

test('context-menu events report the target, chart point and source and suppress the native menu', async ({ page }) => {
  const errors = pageErrors(page)
  await openNetworkFixture(page, '?nodes=5&menu=1')
  await page.evaluate(() => document.addEventListener('contextmenu', event => {
    (window as any).__menuPrevented = event.defaultPrevented
  }))
  const last = async () => JSON.parse((await page.getByRole('status', { name: 'Last menu', exact: true }).textContent())!)
  const events = page.getByRole('status', { name: 'Menu events', exact: true })
  const node = chainNode(page, 'N0001')
  const box = (await node.boundingBox())!
  await page.mouse.click(box.x + 20, box.y + 15, { button: 'right' })
  await expect(events).toHaveText('1')
  const pointer = await last()
  expect(pointer.target).toEqual({ kind: 'node', id: 'N0001' })
  expect(pointer.source).toBe('pointer')
  // Mouse event coordinates are whole pixels.
  expect(Math.abs(pointer.clientX - (box.x + 20))).toBeLessThanOrEqual(1)
  expect(Math.abs(pointer.clientY - (box.y + 15))).toBeLessThanOrEqual(1)
  expect(await page.evaluate(() => (window as any).__menuPrevented)).toBe(true)
  // The chart point inverts the camera: it maps back to the clicked screen point.
  const stage = (await page.getByLabel('Network graph', { exact: true }).boundingBox())!
  const camera = await readCamera(page)
  expect(stage.x + camera.x + pointer.point.x * camera.scale).toBeCloseTo(pointer.clientX, 3)
  expect(stage.y + camera.y + pointer.point.y * camera.scale).toBeCloseTo(pointer.clientY, 3)

  // Edges and the empty canvas are targets too.
  const edge = page.locator('.vw-network-edge').first()
  const path = await edge.evaluate(el => {
    const shape = el as SVGPathElement
    const middle = shape.getPointAtLength(shape.getTotalLength() / 2)
    const point = new DOMPoint(middle.x, middle.y).matrixTransform(shape.getScreenCTM()!)
    return { x: point.x, y: point.y }
  })
  // The drawn path is thin; without edgesSelectable there is no wider hit area.
  await page.mouse.click(path.x, path.y, { button: 'right' })
  await expect(events).toHaveText('2')
  expect((await last()).target).toEqual({ kind: 'edge', id: 'e0' })
  await page.mouse.click(stage.x + 6, stage.y + 6, { button: 'right' })
  await expect(events).toHaveText('3')
  expect((await last()).target).toEqual({ kind: 'canvas' })

  // The ContextMenu key reports the centre of the focused node once, even if the browser follows with its own event.
  await node.focus()
  await page.keyboard.press('ContextMenu')
  await expect(events).toHaveText('4')
  const keyboard = await last()
  expect(keyboard.source).toBe('keyboard')
  expect(keyboard.target).toEqual({ kind: 'node', id: 'N0001' })
  const rect = await node.evaluate(el => el.getBoundingClientRect().toJSON())
  expect(keyboard.clientX).toBeCloseTo(rect.x + rect.width / 2, 3)
  expect(keyboard.clientY).toBeCloseTo(rect.y + rect.height / 2, 3)
  // Shift+F10 on the focused stage reports the canvas at the stage centre.
  await page.getByLabel('Network graph', { exact: true }).focus()
  await page.keyboard.press('Shift+F10')
  await expect(events).toHaveText('5')
  const canvas = await last()
  expect(canvas).toMatchObject({ target: { kind: 'canvas' }, source: 'keyboard' })
  expect(canvas.clientX).toBeCloseTo(stage.x + stage.width / 2, 3)
  // A contextmenu event the browser sends after the key has been dispatched by the next frames.
  await animationFrames(page, 3)
  await expect(events).toHaveText('5')
  // Without the prop nothing is reported and the browser keeps its own menu.
  await openNetworkFixture(page, '?nodes=5')
  await page.evaluate(() => document.addEventListener('contextmenu', event => {
    (window as any).__menuPrevented = event.defaultPrevented
    event.preventDefault()
  }))
  await chainNode(page, 'N0001').click({ button: 'right' })
  expect(await page.evaluate(() => (window as any).__menuPrevented)).toBe(false)
  await expect(page.getByRole('status', { name: 'Menu events', exact: true })).toHaveText('0')
  expect(errors).toEqual([])
})

test('the tooltip slot follows the camera and is placed before the node in right-to-left graphs', async ({ page }) => {
  const errors = pageErrors(page)
  await openNetworkFixture(page, '?nodes=3&tooltip=1&dir=rtl')
  const node = chainNode(page, 'N0001')
  const tooltip = page.getByRole('tooltip')
  await node.hover()
  await expect(tooltip).toHaveText('Tip N0001')
  const place = async () => {
    const [tip, box] = [(await tooltip.boundingBox())!, (await node.boundingBox())!]
    return { gap: box.x - (tip.x + tip.width), top: tip.y - box.y }
  }
  const before = await place()
  expect(Math.abs(before.gap - 8)).toBeLessThan(2)
  // Zooming moves the node; the tooltip stays attached to it.
  await page.evaluate(() => (window as any).__vw.graph().zoom(1.3))
  const after = await place()
  expect(Math.abs(after.gap - 8)).toBeLessThan(2)
  expect(Math.abs(after.top - before.top)).toBeLessThan(1)
  // Leaving the node and the tooltip hides it after the grace period.
  await page.mouse.move(2, 2)
  await expect(tooltip).toHaveCount(0)
  expect(errors).toEqual([])
})

test('snap to grid lands pointer and keyboard moves on the grid and the background follows the camera', async ({ page }) => {
  const errors = pageErrors(page)
  await openNetworkFixture(page, '?nodes=4&draggable=1&snap=20&background=dots')
  const backdrop = page.locator('.vw-network-backdrop')
  await expect(backdrop).toHaveAttribute('aria-hidden', 'true')
  const pattern = backdrop.locator('pattern')
  await expect(pattern).toHaveAttribute('id', /-background$/)
  await expect(pattern).toHaveAttribute('width', '20')
  const fill = page.locator('.vw-network-background')
  await expect(fill).toHaveAttribute('fill', `url(#${await pattern.getAttribute('id')})`)
  await expect(page.locator('.vw-network')).toHaveClass(/vw-network-patterned/)

  // A drag of 37 x 23 screen pixels at scale 1.15 moves N0001 from (214, 20) by about (32, 20): it lands on (240, 40).
  expect((await readCamera(page)).scale).toBeCloseTo(1.15, 6)
  await dragBy(page, chainNode(page, 'N0001'), 37, 23)
  await expect(fixtureStatus(page, 'Move events')).toHaveText('1')
  expect(await readJson(page, 'Last after')).toEqual({ N0001: { x: 240, y: 40 } })
  await expect(chainNode(page, 'N0001')).toHaveAttribute('transform', 'translate(240 40)')

  // Arrow keys step to the next grid line, four lines with Shift; N0002 starts off the grid at x 408.
  const n2 = chainNode(page, 'N0002')
  await n2.press('ArrowRight')
  expect(await readJson(page, 'Last after')).toEqual({ N0002: { x: 420, y: 20 } })
  await n2.press('Shift+ArrowDown')
  expect(await readJson(page, 'Last after')).toEqual({ N0002: { x: 420, y: 100 } })
  await n2.press('ArrowLeft')
  expect(await readJson(page, 'Last after')).toEqual({ N0002: { x: 400, y: 100 } })
  // At the origin a move towards negative coordinates proposes nothing.
  await chainNode(page, 'N0000').press('ArrowUp')
  await chainNode(page, 'N0000').press('ArrowUp')
  await expect(fixtureStatus(page, 'Move events')).toHaveText('5')
  expect(await readJson(page, 'Last after')).toEqual({ N0000: { x: 20, y: 0 } })

  // The pattern is drawn in chart units: zooming out widens the cells so they stay at least 8 pixels apart.
  await page.evaluate(() => (window as any).__vw.graph().setViewport({ x: 13, y: 7, scale: 0.2 }))
  await expect(pattern).toHaveAttribute('width', '40')
  await expect(pattern.locator('circle')).toHaveAttribute('r', '5')
  await expect(fill).toHaveAttribute('x', '-105')
  expect(errors).toEqual([])
})

test('alignment guides snap a dragged node to its neighbours, win over the grid and show guide lines during the drag', async ({ page }) => {
  const errors = pageErrors(page)
  await openNetworkFixture(page, '?nodes=4&draggable=1&guides=1&snap=50')
  const guides = page.locator('.vw-guide')
  // Four pixels down is within the 6-pixel threshold of the row, so the top, middle and bottom guides appear.
  await dragBy(page, chainNode(page, 'N0001'), 30, 4, async () => {
    await expect(guides).toHaveCount(3)
    await expect(page.locator('.vw-guides')).toHaveAttribute('aria-hidden', 'true')
    await expect(guides.first()).toHaveAttribute('y1', '20')
    await expect(guides.first()).toHaveAttribute('y2', '20')
    await expect(guides.first()).toHaveAttribute('x1', '20')
    await expect(guides.first()).toHaveAttribute('x2', '746')
  })
  await expect(guides).toHaveCount(0)
  // The guide keeps y at 20 instead of the 50-unit grid line at 0; x, without a guide, snaps to the grid.
  expect(await readJson(page, 'Last after')).toEqual({ N0001: { x: 250, y: 20 } })
  // Forty pixels down is outside the threshold: no guides, and the grid decides.
  await dragBy(page, chainNode(page, 'N0001'), 0, 40, async () => {
    await expect(chainNode(page, 'N0001')).not.toHaveAttribute('transform', 'translate(250 20)')
    await expect(guides).toHaveCount(0)
  })
  expect(await readJson(page, 'Last after')).toEqual({ N0001: { x: 250, y: 50 } })
  expect(errors).toEqual([])
})

test('auto-pan moves the camera while a node drag is held near the edge and stops on release', async ({ page }) => {
  const errors = pageErrors(page)
  await openNetworkFixture(page, '?nodes=30&draggable=1&autopan=1')
  await page.evaluate(() => (window as any).__vw.graph().setViewport({ x: 0, y: 100, scale: 1 }))
  const stage = (await page.getByLabel('Network graph', { exact: true }).boundingBox())!
  const node = chainNode(page, 'N0002')
  const box = (await node.boundingBox())!
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
  const edgeX = stage.x + stage.width - 10
  const viewportEvents = Number(await fixtureStatus(page, 'Viewport events').textContent())
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(edgeX, start.y, { steps: 10 })
  // Holding still near the right edge keeps panning towards later ranks.
  await expect.poll(async () => (await readCamera(page)).x).toBeLessThan(-150)
  expect(Number(await fixtureStatus(page, 'Viewport events').textContent())).toBeGreaterThan(viewportEvents + 3)
  // The previewed node stays under the pointer while the chart moves.
  const held = (await node.boundingBox())!
  expect(Math.abs(held.x + held.width / 2 - edgeX)).toBeLessThan(25)
  await page.mouse.up()
  const released = await readCamera(page)
  // The auto-pan loop runs once per frame; ten frames later the camera has not moved.
  await animationFrames(page, 10)
  expect(await readCamera(page)).toEqual(released)
  await expect(fixtureStatus(page, 'Move events')).toHaveText('1')
  // The proposal includes the distance the camera travelled, not only the pointer movement.
  const moved = (await readJson(page, 'Last after')).N0002 as Point
  expect(moved.x).toBeGreaterThan(408 + (edgeX - start.x) + 150)
  expect(moved.x).toBeCloseTo(408 + edgeX - start.x - released.x, 0)
  expect(errors).toEqual([])
})

test('toGraphPoint, getViewportCenter and drop events report chart coordinates', async ({ page }) => {
  const errors = pageErrors(page)
  await openNetworkFixture(page, '?nodes=4&drop=1&snap=10')
  const stageLocator = page.getByLabel('Network graph', { exact: true })
  const stage = (await stageLocator.boundingBox())!
  const centre = await page.evaluate(({ x, y }) => {
    const graph = (window as any).__vw.graph()
    return { point: graph.toGraphPoint(x, y), centre: graph.getViewportCenter() }
  }, { x: stage.x + stage.width / 2, y: stage.y + stage.height / 2 })
  expect(centre.point.x).toBeCloseTo(centre.centre.x, 3)
  expect(centre.point.y).toBeCloseTo(centre.centre.y, 3)
  const camera = await readCamera(page)
  const at = { x: Math.round(stage.x + 123), y: Math.round(stage.y + 77) }
  const result = await stageLocator.evaluate((svg, at) => {
    const data = new DataTransfer()
    data.setData('text/plain', 'operation')
    const init = { bubbles: true, cancelable: true, clientX: at.x, clientY: at.y, dataTransfer: data }
    const over = new DragEvent('dragover', init), drop = new DragEvent('drop', init)
    svg.dispatchEvent(over)
    svg.dispatchEvent(drop)
    return { over: over.defaultPrevented, drop: drop.defaultPrevented, point: (window as any).__vw.graph().toGraphPoint(at.x, at.y) }
  }, at)
  expect(result).toMatchObject({ over: true, drop: true })
  expect(result.point.x).toBeCloseTo((at.x - stage.x - camera.x) / camera.scale, 3)
  expect(await readJson(page, 'Last drop')).toEqual({
    point: snapped(result.point, 10), clientX: at.x, clientY: at.y, text: 'operation',
  })
  expect(await page.evaluate(() => {
    try { (window as any).__vw.graph().toGraphPoint(Number.NaN, 0) } catch (error) { return (error as Error).name }
  })).toBe('RangeError')

  // Without droppable the browser keeps its default handling and nothing is reported.
  await openNetworkFixture(page, '?nodes=4')
  expect(await stageLocator.evaluate(svg => {
    const over = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() })
    svg.dispatchEvent(over)
    svg.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() }))
    return over.defaultPrevented
  })).toBe(false)
  await expect(fixtureStatus(page, 'Last drop')).toHaveText('')
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
  await page.keyboard.press('Control+v')
  const atPointer = await page.evaluate(({ x, y }) => (window as any).__vw.graph().toGraphPoint(x, y), pointer)
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

test('demo waypoints are added, moved and removed by keyboard and pointer with undo', async ({ page }) => {
  const { errors, button, status } = await openGraphEditor(page)
  await page.getByLabel('Editable edges').check()
  const fp = button('Select edge fp')
  await fp.press('Enter')
  await button('Add waypoint 1 · fp').press('Enter')
  await expect(status('Edge fp has 1 waypoint.')).toBeVisible()
  const waypoint = button('Move waypoint 1 · fp')
  await expect(waypoint).toBeVisible()
  const y = Number(await waypoint.getAttribute('cy'))
  await waypoint.press('ArrowDown')
  await expect(waypoint).toHaveAttribute('cy', String(y + 10))
  await waypoint.press('Shift+ArrowDown')
  await expect(waypoint).toHaveAttribute('cy', String(y + 50))
  // A pointer drag moves it; the preview follows the pointer.
  const before = y + 50
  await dragBy(page, waypoint, 0, 30, async () => {
    await expect.poll(async () => Number(await waypoint.getAttribute('cy'))).toBeGreaterThan(before)
  })
  await expect(status('Edge fp has 1 waypoint.')).toBeVisible()
  await expect.poll(async () => Number(await waypoint.getAttribute('cy'))).toBeGreaterThan(before + 10)
  // Dragging the second insert handle adds a waypoint after the first.
  await dragBy(page, button('Add waypoint 2 · fp'), 0, -30)
  await expect(status('Edge fp has 2 waypoints.')).toBeVisible()
  await button('Move waypoint 2 · fp').press('Delete')
  await expect(status('Edge fp has 1 waypoint.')).toBeVisible()
  await waypoint.press('Delete')
  await expect(status('Edge fp has 0 waypoints.')).toBeVisible()
  await expect(button('Move waypoint 1 · fp')).toHaveCount(0)
  await expect(fp).toBeFocused()
  await button('Undo').click()
  await expect(button('Move waypoint 1 · fp')).toBeVisible()
  // Escape cancels a drag in flight without a proposal.
  const cy = await waypoint.getAttribute('cy')
  const box = (await waypoint.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2, box.y + 60, { steps: 4 })
  await expect(waypoint).not.toHaveAttribute('cy', cy!)
  await page.keyboard.press('Escape')
  await expect(waypoint).toHaveAttribute('cy', cy!)
  await page.mouse.up()
  await expect(status('Undid the last edit.')).toBeVisible()
  // validateEdgeReshape rejects a fifth waypoint with its reason.
  for (let i = 0; i < 3; i++) await button('Add waypoint 1 · fp').press('Enter')
  await expect(status('Edge fp has 4 waypoints.')).toBeVisible()
  await button('Add waypoint 1 · fp').press('Enter')
  await expect(status('Use at most 4 waypoints per edge.')).toBeVisible()
  await expect(button('Move waypoint 5 · fp')).toHaveCount(0)
  for (let i = 0; i < 3; i++) await button('Undo').click()
  // Waypoints are kept in the other edge styles.
  await page.getByLabel('Edge style').selectOption('orthogonal')
  await expect(button('Move waypoint 1 · fp')).toBeVisible()
  expect(errors).toEqual([])
})

test('demo nodes resize by pointer and keyboard with undo', async ({ page }) => {
  const { errors, button, status } = await openGraphEditor(page)
  await page.getByLabel('Resizable nodes').check()
  const finish = button('Finish Operation 102')
  await finish.click()
  const corner = button('Resize Finish · bottom right')
  await expect(corner).toBeVisible()
  const frame = finish.locator('svg')
  await expect(frame).toHaveAttribute('width', '144')
  await corner.press('ArrowRight')
  await expect(status('Resized Finish to 154 × 58.')).toBeVisible()
  await expect(frame).toHaveAttribute('width', '154')
  await corner.press('Shift+ArrowDown')
  await expect(status('Resized Finish to 154 × 98.')).toBeVisible()
  // Resizing from the top-left corner moves the origin and keeps the opposite corner.
  const x = (await finish.boundingBox())!.x
  await button('Resize Finish · top left').press('ArrowLeft')
  await expect(status('Resized Finish to 164 × 98.')).toBeVisible()
  await expect.poll(async () => (await finish.boundingBox())!.x).toBeLessThan(x)
  // A pointer drag of a corner proposes the dragged size, never below the minimum.
  await dragBy(page, corner, -400, -400)
  await expect(status('Resized Finish to 40 × 24.')).toBeVisible()
  await expect(frame).toHaveAttribute('height', '24')
  await dragBy(page, corner, 60, 30)
  await expect.poll(async () => Number(await frame.getAttribute('width'))).toBeGreaterThan(60)
  // validateNodeResize rejects an oversized node; Escape cancels a drag without a proposal.
  const width = await frame.getAttribute('width')
  await dragBy(page, corner, 600, 0)
  await expect(status('Keep nodes within 360 × 200.')).toBeVisible()
  await expect(frame).toHaveAttribute('width', width!)
  const handle = (await corner.boundingBox())!
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2)
  await page.mouse.down()
  await page.mouse.move(handle.x + 80, handle.y + 40, { steps: 4 })
  await expect(frame).not.toHaveAttribute('width', width!)
  await page.keyboard.press('Escape')
  await expect(frame).toHaveAttribute('width', width!)
  await page.mouse.up()
  await expect(frame).toHaveAttribute('width', width!)
  await button('Undo').click()
  await expect(frame).toHaveAttribute('width', '40')
  for (let i = 0; i < 4; i++) await button('Undo').click()
  await expect(frame).toHaveAttribute('width', '144')
  expect(errors).toEqual([])
})

test('a manual graph camera survives accepted connections, deletions and group toggles; a layout change re-fits', async ({ page }) => {
  const { errors, button, status, edges } = await openGraphEditor(page)
  const world = page.locator('.vw-network-stage > g')
  const tools = page.getByRole('group', { name: 'Graph zoom', exact: true })
  const level = tools.getByRole('status'), zoomIn = tools.getByRole('button', { name: 'Zoom in', exact: true })
  await expect(edges).toHaveCount(6)
  const fitted = (await level.textContent())!
  await zoomIn.click()
  await expect(level).not.toHaveText(fitted)
  const zoomed = (await world.getAttribute('transform'))!
  const zoomedLevel = (await level.textContent())!

  await button('Start connection from Material A1').press('Enter')
  await button('Connect to Finish').press('Enter')
  await expect(status('Connected')).toBeVisible()
  await expect(edges).toHaveCount(7)
  await expect(world).toHaveAttribute('transform', zoomed)
  await expect(level).toHaveText(zoomedLevel)

  const fp = button('Select edge fp')
  await fp.press('Enter')
  await fp.press('Delete')
  await expect(edges).toHaveCount(6)
  await expect(world).toHaveAttribute('transform', zoomed)

  await page.getByLabel('Collapsible groups').check()
  await button('Collapse group Intermediate lots').click()
  await expect(button('Intermediate lots 2 nodes')).toBeVisible()
  await expect(world).toHaveAttribute('transform', zoomed)
  await button('Expand group Intermediate lots').click()
  await expect(button('Lot A123-01 72 units')).toBeVisible()
  await expect(world).toHaveAttribute('transform', zoomed)

  // Fit to view returns to automatic fitting; zooming makes the camera manual again.
  await button('Fit to view').click()
  await expect(level).toHaveText(fitted)
  await zoomIn.click()
  await expect(level).toHaveText(zoomedLevel)
  // A layout change moves every node, so it re-fits even a manual camera.
  await page.getByLabel('Direction').selectOption('RL')
  await expect(world).not.toHaveAttribute('transform', zoomed)
  await expect(level).toHaveText(fitted)
  expect(errors).toEqual([])
})

test('inline label editing proposes node and edge labels, validates them and returns focus', async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto('/gallery.html')
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

test('lasso selection selects the nodes whose centre the outline encloses, keeps modifiers and cancels on Escape', async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto('/gallery.html')
  await page.getByLabel('Edit graph').check()
  await page.getByLabel('Lasso selection').check()
  const lots = page.locator('.vw-network-node').filter({ hasText: 'Lot A123-' })
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

test('toolbar slots follow the selected node and edge, and group and minimap slots restyle the graph', async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto('/gallery.html')
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
  await page.locator('.vw-zoom-tools').getByRole('button', { name: 'Zoom out', exact: true }).click()
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
  const lots = page.locator('.vw-network-node').filter({ hasText: 'Lot A123-' })
  const before = await lots.first().getAttribute('transform')
  await page.getByRole('button', { name: 'Move group Intermediate lots', exact: true }).press('ArrowDown')
  await expect(lots.first()).not.toHaveAttribute('transform', before!)
  await page.getByRole('button', { name: 'Undo', exact: true }).click()
  await expect(lots.first()).toHaveAttribute('transform', before!)
  // The minimap draws its nodes through the minimap-node slot and still navigates.
  await split.click()
  await expect(page.locator('.vw-minimap .demo-minimap-node')).toHaveCount(6)
  await expect(page.locator('.vw-minimap .demo-minimap-node.is-selected')).toHaveCount(1)
  const camera = await page.locator('.vw-network-stage > g').first().getAttribute('transform')
  await page.getByRole('button', { name: 'Navigate graph overview' }).click({ position: { x: 20, y: 30 } })
  await expect(page.locator('.vw-network-stage > g').first()).not.toHaveAttribute('transform', camera!)
  // Without the slots the default overlay returns.
  await page.getByLabel('Item toolbars').uncheck()
  await expect(page.locator('.vw-has-slot')).toHaveCount(0)
  await expect(page.locator('.vw-minimap .demo-minimap-node')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('typed port rules hint valid targets, reject type and limit violations with a reason and allow limit-1 reconnects', async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto('/gallery.html')
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
  await graph.locator('svg.vw-network-stage').scrollIntoViewIfNeeded()
  const a = (await handle('Start connection from Sensor · Reading').boundingBox())!
  const b = (await handle('Start connection from Average · Input B').boundingBox())!
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2)
  await page.mouse.down()
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2 + 20, { steps: 6 })
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
  await graph.locator('svg.vw-network-stage').scrollIntoViewIfNeeded()
  const backup = (await handle('Start connection from Backup sensor · Reading').boundingBox())!
  const full = (await handle('Start connection from Average · Input A').boundingBox())!
  await page.mouse.move(backup.x + backup.width / 2, backup.y + backup.height / 2)
  await page.mouse.down()
  await page.mouse.move(full.x + full.width / 2, full.y + full.height / 2, { steps: 10 })
  await page.mouse.up()
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

test('process lanes: with Route around steps, dragging a step across an unrelated orthogonal route reroutes it during the drag', async ({ page }) => {
  const errors = pageErrors(page)
  await openDemo(page, 'Process lanes')
  const stage = page.getByLabel('Process lane graph', { exact: true })
  await stage.scrollIntoViewIfNeeded()
  await page.getByLabel('Process edge style').selectOption('orthogonal')
  await page.getByLabel('Route around steps').check()
  // Edge 2 is the receive → cut hand-over; Final check is not one of its ends.
  const edge = stage.locator('.vw-network-edge').nth(2)
  const before = await edge.getAttribute('d')
  const middle = await edge.evaluate((path: SVGPathElement) => {
    const point = path.getPointAtLength(path.getTotalLength() / 2)
    const matrix = path.getScreenCTM()!
    return { x: point.x * matrix.a + point.y * matrix.c + matrix.e, y: point.x * matrix.b + point.y * matrix.d + matrix.f }
  })
  const step = (await stage.getByRole('button', { name: 'Final check', exact: true }).boundingBox())!
  const start = { x: step.x + step.width / 2, y: step.y + step.height / 2 }
  await page.mouse.move(start.x, start.y)
  await page.mouse.down()
  await page.mouse.move(middle.x, middle.y, { steps: 10 })
  // Still dragging: the route goes around the step's preview box.
  await expect.poll(() => edge.getAttribute('d')).not.toBe(before)
  // Back where it started, the route is the saved one again.
  await page.mouse.move(start.x, start.y, { steps: 10 })
  await expect.poll(() => edge.getAttribute('d')).toBe(before)
  await page.mouse.up()
  await expect(edge).toHaveAttribute('d', before!)
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
