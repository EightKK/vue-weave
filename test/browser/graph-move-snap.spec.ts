// NetworkGraph editing: node and group moves, drag previews under culling, routing during drags, snapping, alignment
// guides, auto-pan, waypoints and resizing.
import {
  expect, test, animationFrames, boxCenter, chainNode, dragBy, fixtureStatus, graphMinimap, graphNode, openExample, openGraphEditor,
  openNetworkFixture, pageErrors, pressAndMove, pressAndMoveTo, readCamera, readJson, type Point,
} from './support'

test('range selection and group movement commit an atomic batch', async ({ page }) => {
  const errors = pageErrors(page)
  await openExample(page, 'graph-and-gantt')
  await page.getByLabel('Edit graph').check()
  const lots = graphNode(page, /^Lot A123-/)
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
  expect(errors).toEqual([])
})

test('dragging a node under culling emits one proposal and keeps the node rendered', async ({ page }) => {
  const errors = pageErrors(page)
  await openNetworkFixture(page, '?nodes=600&cull=1&draggable=1')
  const node = chainNode(page, 'N0001')
  await pressAndMove(page, node, 40, 30, 6)
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
      await pressAndMove(page, node, 30, 70, 5)
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

  await dragBy(page, outer, 30, 20, { steps: 5 })
  await expect(last).toHaveText('B,C,D')
  await expect(events).toHaveText('1')

  await dragBy(page, inner, 30, 20, { steps: 5 })
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
  const { x, y } = boxCenter(box)
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
  await expect(graphMinimap(page).locator('rect:not(.vw-minimap-window)')).toHaveCount(300)
  await expect(page.getByRole('button', { name: 'Start connection from N0001', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Move group Group 0 within Parent 0', exact: true })).toBeVisible()
  const node = chainNode(page, 'N0001')
  const box = (await node.boundingBox())!
  const { x, y } = boxCenter(box)
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
  await pressAndMove(page, box, 60, 40, 6)
  await expect(node).toHaveCount(1)
  expect(await edges.count()).toBeGreaterThanOrEqual(before)
  // The edges attached to the dragged node follow it.
  const [incoming, outgoing] = await edges.evaluateAll(list => list.slice(1, 3).map(el => el.getAttribute('d')))
  expect(incoming).toMatch(/^M /)
  expect(outgoing).not.toBe(incoming)
  await page.mouse.up()
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
  const start = boxCenter(box)
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
  await pressAndMove(page, box, 0, 60 - box.height / 2, 4)
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
  await pressAndMoveTo(page, handle, { x: handle.x + 80, y: handle.y + 40 }, 4)
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

test('process lanes: with Route around steps, dragging a step across an unrelated orthogonal route reroutes it during the drag', async ({ page }) => {
  const errors = pageErrors(page)
  await openExample(page, 'process-lanes')
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
  const start = boxCenter(step)
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
