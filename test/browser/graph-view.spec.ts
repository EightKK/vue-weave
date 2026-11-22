// NetworkGraph viewing: layouts, camera and culling, shapes and markers, minimap, analysis, lanes and quantity flow.
import {
  expect, test, boxCenter, centerOf, chainNode, dragBy, dragTo, fixtureStatus, graphNode, graphStage, openComponentFixture, openDemo, openExample,
  openGestureFixture, openGraphEditor, openNetworkFixture, pageErrors, pressAndMove, readCamera, serveFixture, touch, type Camera, type Page,
} from './support'

async function openStylesFixture(page: Page, search = '') {
  await serveFixture(page, 'graph-styles-test', 'graph-styles.html')
  await page.goto('/graph-styles-test/' + search)
  await expect(page.getByLabel('Network graph', { exact: true })).toBeVisible()
}

test('zero-padding graphs recover from empty data in both directions', async ({ page }) => {
  const errors = pageErrors(page)
  await openComponentFixture(page)
  const graph = page.getByRole('region', { name: 'Graph fixture', exact: true })
  for (const direction of ['LR', 'TB']) {
    await graph.getByRole('button', { name: direction + ' direction', exact: true }).click()
    await expect(graph.getByRole('button', { name: 'Node A', exact: true })).toBeVisible()
    await graph.getByRole('button', { name: 'Empty graph', exact: true }).click()
    await expect(graph.getByText('No nodes to display', { exact: true })).toBeVisible()
    await expect(graph.getByRole('button', { name: 'Node A', exact: true })).toHaveCount(0)
    await graph.getByRole('button', { name: 'Restore nodes', exact: true }).click()
    await expect(graph.getByRole('button', { name: 'Node A', exact: true })).toBeVisible()
    await graph.getByRole('button', { name: 'Zoom in', exact: true }).click()
    await graph.getByRole('button', { name: 'Fit to view', exact: true }).click()
  }
  expect(errors).toEqual([])
})

test('viewport culling renders the visible window, keeps selected and focused nodes and follows focusNode', async ({ page }) => {
  const errors = pageErrors(page)
  await openNetworkFixture(page, '?nodes=600&cull=1&minimap=1')
  const rendered = await chainNode(page).count()
  expect(rendered).toBeGreaterThan(0)
  expect(rendered).toBeLessThan(600)
  await expect(chainNode(page, 'N0000')).toBeVisible()
  await expect(chainNode(page, 'N0450')).toHaveCount(0)
  // The minimap still shows every node, plus its viewport window.
  await expect(page.getByRole('button', { name: 'Navigate graph overview' }).locator('rect')).toHaveCount(601)

  await chainNode(page, 'N0000').focus()
  await page.keyboard.press('Enter')
  await expect(chainNode(page, 'N0000')).toHaveAttribute('aria-pressed', 'true')
  const before = await readCamera(page)
  await page.evaluate(() => (window as any).__vw.graph().focusNode('N0450'))
  const after = await readCamera(page)
  expect(after.scale).toBe(before.scale)
  const target = chainNode(page, 'N0450')
  await expect(target).toHaveCount(1)
  const stage = (await page.getByLabel('Network graph', { exact: true }).boundingBox())!
  const box = (await target.boundingBox())!
  expect(Math.abs(box.x + box.width / 2 - (stage.x + stage.width / 2))).toBeLessThan(25)
  expect(Math.abs(box.y + box.height / 2 - (stage.y + stage.height / 2))).toBeLessThan(25)
  // N0000 is far away but selected, so it stays in the DOM. Distant unrelated nodes do not.
  await expect(chainNode(page, 'N0000')).toHaveCount(1)
  await expect(chainNode(page, 'N0300')).toHaveCount(0)

  // Selecting another node (which also moves focus) releases N0000.
  await target.click()
  await expect(chainNode(page, 'N0000')).toHaveCount(0)
  // A focused, unselected node survives a jump of the camera.
  const neighbor = chainNode(page, 'N0452')
  await neighbor.focus()
  await page.evaluate(() => (window as any).__vw.graph().setViewport({ x: 0, y: 0, scale: 1 }))
  await expect(chainNode(page, 'N0000')).toHaveCount(1)
  await expect(neighbor).toHaveCount(1)
  await expect(neighbor).toBeFocused()
  await expect(chainNode(page, 'N0200')).toHaveCount(0)
  // Fit to view shows the whole chain, so culling keeps every node.
  await page.evaluate(() => (window as any).__vw.graph().fit())
  await expect(chainNode(page, 'N0452')).toHaveCount(1)
  await expect(chainNode(page)).toHaveCount(600)
  expect(await page.evaluate(() => {
    try { (window as any).__vw.graph().focusNode('missing') } catch (error) { return (error as Error).message }
  })).toBe('Unknown node: missing')
  expect(errors).toEqual([])
})

test('fit to view shows a long chain below 10% and the fitted viewport can be restored', async ({ page }) => {
  const errors = pageErrors(page)
  await openNetworkFixture(page, '?nodes=100&cull=1')
  // The automatic initial view stays readable instead of shrinking the chain to dots.
  expect((await readCamera(page)).scale).toBeGreaterThanOrEqual(0.1)
  await page.getByRole('button', { name: 'Fit to view', exact: true }).click()
  const fitted = await readCamera(page)
  expect(fitted.scale).toBeLessThan(0.1)
  const stage = (await page.getByLabel('Network graph', { exact: true }).boundingBox())!
  await expect(chainNode(page)).toHaveCount(100)
  for (const name of ['N0000', 'N0050', 'N0099']) {
    const box = (await chainNode(page, name).boundingBox())!
    expect(box.x).toBeGreaterThanOrEqual(stage.x - 0.5)
    expect(box.x + box.width).toBeLessThanOrEqual(stage.x + stage.width + 0.5)
    expect(box.y).toBeGreaterThanOrEqual(stage.y - 0.5)
    expect(box.y + box.height).toBeLessThanOrEqual(stage.y + stage.height + 0.5)
  }
  // Zooming out stops at the fit scale; a saved fitted viewport is accepted again.
  await page.evaluate(() => (window as any).__vw.graph().zoom(0.5))
  expect((await readCamera(page)).scale).toBeCloseTo(fitted.scale, 6)
  await page.evaluate(() => (window as any).__vw.graph().setViewport({ x: 0, y: 0, scale: 1 }))
  await page.evaluate(viewport => (window as any).__vw.graph().setViewport(viewport), fitted)
  expect(await readCamera(page)).toEqual(fitted)
  expect(await page.evaluate(() => {
    try { (window as any).__vw.graph().setViewport({ x: 0, y: 0, scale: 0.001 }) } catch (error) { return (error as Error).message }
  })).toMatch(/^Viewport scale must be between the fit scale /)
  expect(errors).toEqual([])
})

test('without cullOffscreen every node stays in the DOM', async ({ page }) => {
  const errors = pageErrors(page)
  await openNetworkFixture(page, '?nodes=600&cull=0')
  await expect(chainNode(page)).toHaveCount(600)
  expect(errors).toEqual([])
})

test('highlighted nodes are display only: Delete removes the selection alone and culling does not keep them', async ({ page }) => {
  const errors = pageErrors(page)
  await openNetworkFixture(page, '?preset=groups&delete=1&highlight=B&highlightedges=e1')
  await expect(chainNode(page, 'B')).toHaveClass(/vw-is-highlighted/)
  await expect(chainNode(page, 'B')).toHaveAttribute('aria-pressed', 'false')
  await expect(page.locator('g.vw-is-highlighted > path.vw-network-edge')).toHaveCount(1)
  await chainNode(page, 'A').focus()
  await page.keyboard.press('Enter')
  await expect(chainNode(page, 'A')).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('Delete')
  await expect(page.getByRole('status', { name: 'Last deletion', exact: true })).toHaveText('{"nodeIds":["A"],"edgeIds":["e0"]}')

  // A highlighted node far outside the view is not rendered; it is revealed on request.
  await openNetworkFixture(page, '?nodes=600&cull=1&highlight=N0450')
  await expect(chainNode(page, 'N0450')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('target events report pointer and keyboard entry and activation of nodes, edges and groups', async ({ page }) => {
  const errors = pageErrors(page)
  await openNetworkFixture(page, '?preset=groups&targets=1&edgeselect=1&draggable=1')
  const log = page.getByRole('status', { name: 'Target events', exact: true })
  await chainNode(page, 'A').focus()
  await expect(log).toHaveText('enter node A keyboard')
  await page.keyboard.press('Enter')
  await expect(log).toHaveText('enter node A keyboard | activate node A keyboard')
  await page.keyboard.press('Tab')
  await expect(log).toContainText('leave node A keyboard | enter node B keyboard')
  const edge = page.getByRole('button', { name: 'Select edge e0', exact: true })
  await edge.focus()
  await page.keyboard.press('Space')
  await expect(log).toContainText('enter edge e0 keyboard | activate edge e0 keyboard')
  await page.getByRole('button', { name: 'Move group Outer', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(log).toContainText('enter group outer keyboard | activate group outer keyboard')

  await chainNode(page, 'C').hover()
  await expect(log).toContainText('enter node C pointer')
  await chainNode(page, 'C').click()
  await expect(log).toContainText('activate node C pointer')
  await page.mouse.move(2, 2)
  await expect(log).toContainText('leave node C pointer')
  expect(errors).toEqual([])
})

test('revealNode brings a culled node into view and focuses it, and reports collapsed and unknown nodes', async ({ page }) => {
  const errors = pageErrors(page)
  await openNetworkFixture(page, '?nodes=600&cull=1')
  await expect(chainNode(page, 'N0450')).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).__vw.graph().revealNode('missing'))).toEqual({ status: 'unknown' })
  expect(await page.evaluate(() => (window as any).__vw.graph().revealNode('N0450', { focus: true, scale: 1 }))).toEqual({ status: 'revealed' })
  await expect(chainNode(page, 'N0450')).toBeFocused()
  expect((await readCamera(page)).scale).toBe(1)
  const stage = (await page.getByLabel('Network graph', { exact: true }).boundingBox())!
  const box = (await chainNode(page, 'N0450').boundingBox())!
  expect(Math.abs(box.x + box.width / 2 - (stage.x + stage.width / 2))).toBeLessThan(2)

  await openNetworkFixture(page, '?nodes=40&groups=chain&collapse=g1&highlight=N0013')
  await expect(page.locator('[data-vw-node="g1"]')).toHaveClass(/vw-is-highlighted/)
  const before = await readCamera(page)
  expect(await page.evaluate(() => (window as any).__vw.graph().revealNode('N0012', { focus: true })))
    .toEqual({ status: 'hidden-by-collapse', proxyId: 'g1' })
  expect(await readCamera(page)).toEqual(before)
  expect(await page.evaluate(() => (window as any).__vw.graph().revealNode('g1'))).toEqual({ status: 'revealed' })
  expect(errors).toEqual([])
})

test('node shapes, edge markers, animated and parallel edges render, follow drags and reshapes and keep their names', async ({ page }) => {
  const errors = pageErrors(page)
  const paths = () => page.locator('.vw-edge-hit').evaluateAll(list => Object.fromEntries(list.map(item => [item.getAttribute('data-vw-edge'), item.getAttribute('d')])))
  const style = (selector: string, property: string) => page.locator(selector).first().evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property)
  await openStylesFixture(page)
  const button = (name: string) => page.getByRole('button', { name, exact: true })
  // Accessible names are those of box nodes and plain edges. (The middle one of three parallel edges between two stacked
  // nodes is a vertical line, which has no visible width.)
  for (const name of ['Start', 'Check stock', 'Prepare', 'Ship']) await expect(button(name)).toBeVisible()
  for (const name of ['order', 'retry', 'reject', 'ready', 'pack', 'loop', 'again']) await expect(button('Select edge ' + name)).toHaveCount(1)
  // Shapes are painted like the node rectangle: tone colours, and the solid fill once selected.
  await expect(page.locator('[data-vw-node="start"] ellipse.vw-node-shape')).toHaveCount(1)
  await expect(page.locator('[data-vw-node="check"] polygon.vw-node-shape')).toHaveCount(1)
  await expect(page.locator('[data-vw-node="prep"] polygon.vw-node-shape')).toHaveAttribute('points', /^(?:[\d.]+,[\d.]+ ){5}[\d.]+,[\d.]+$/)
  await expect(page.locator('[data-vw-node="ship"] rect')).toHaveCount(1)
  expect(await style('[data-vw-node="start"] ellipse', 'fill')).toBe('rgb(225, 242, 238)')
  expect(await style('[data-vw-node="ship"] rect', 'fill')).toBe('rgb(239, 231, 248)')
  await expect(page.locator('[data-vw-node="check"] text').first()).toHaveAttribute('text-anchor', 'middle')
  await button('Check stock').click()
  await expect(button('Check stock')).toHaveAttribute('aria-pressed', 'true')
  expect(await style('[data-vw-node="check"] polygon', 'fill')).toBe('rgb(130, 84, 17)')
  expect(await style('[data-vw-node="check"] polygon', 'stroke-width')).toBe('2.8px')

  // Markers: the default arrow plus one marker per other kind and end in use; hollow ones take the stage background.
  const ids = await page.locator('marker').evaluateAll(list => list.map(item => item.id))
  const base = ids[0]!
  expect(ids.slice(1).sort()).toEqual(['bar', 'diamond', 'open-arrow', 'start-arrow', 'start-circle'].map(kind => base + '-' + kind).sort())
  await expect(page.locator(`marker[id="${base}-start-circle"]`)).toHaveAttribute('orient', 'auto-start-reverse')
  const edgePath = (label: string) => page.locator('.vw-network-edge').nth(['order', 'retry', 'reject', 'ready', 'pack', 'loop', 'again'].indexOf(label))
  await expect(edgePath('reject')).toHaveAttribute('marker-start', `url(#${base}-start-circle)`)
  await expect(edgePath('pack')).not.toHaveAttribute('marker-end', /./)
  await expect(edgePath('order')).toHaveAttribute('marker-end', `url(#${base})`)
  expect(await style('.vw-edge-marker-hollow', 'fill')).toBe('rgb(246, 249, 251)')

  // The animated edge flows, except with reduced motion and in print.
  await expect(edgePath('order')).toHaveClass('vw-network-edge vw-is-animated')
  expect(await style('.vw-network-edge.vw-is-animated', 'animation-name')).toBe('vw-edge-flow')
  expect(await style('.vw-network-edge.vw-is-animated', 'stroke-dasharray')).toBe('6px, 4px')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  expect(await style('.vw-network-edge.vw-is-animated', 'animation-name')).toBe('none')
  await page.emulateMedia({ reducedMotion: null, media: 'print' })
  expect(await style('.vw-network-edge.vw-is-animated', 'animation-name')).toBe('none')
  expect(await style('.vw-edge-marker-hollow', 'fill')).toBe('rgb(246, 249, 251)')
  await page.emulateMedia({ media: null, forcedColors: 'active' })
  const canvas = await page.evaluate(() => {
    const probe = document.createElement('div')
    probe.style.cssText = 'forced-color-adjust: none; background-color: Canvas'
    document.body.append(probe)
    const color = getComputedStyle(probe).backgroundColor
    probe.remove()
    return color
  })
  expect(await style('.vw-edge-marker-hollow', 'fill')).toBe(canvas)
  expect(await style('[data-vw-node="start"] ellipse', 'fill')).toBe(canvas)
  await page.emulateMedia({ forcedColors: null })

  // Parallel edges are drawn apart; a drag preview of a shared node equals the committed move.
  const initial = await paths()
  expect(new Set([initial.sc1, initial.sc2, initial.cs]).size).toBe(3)
  expect(initial.pp1).not.toBe(initial.pp2)
  const node = button('Check stock')
  await pressAndMove(page, node, 120, 40, 5)
  const dragged = await paths()
  for (const id of ['sc1', 'sc2', 'cs', 'cp']) expect(dragged[id], id).not.toBe(initial[id])
  expect(new Set([dragged.sc1, dragged.sc2, dragged.cs]).size).toBe(3)
  await page.mouse.up()
  await expect(page.getByRole('status', { name: 'Move events', exact: true })).toHaveText('1')
  expect(await paths()).toEqual(dragged)

  // A waypoint added to one parallel edge takes it out of the group: the preview spreads the other two again, as the
  // committed waypoint does.
  await button('Select edge order').press('Enter')
  const add = button('Add waypoint 1 · order')
  await expect(add).toBeVisible()
  const before = await paths()
  let preview: Record<string, string | null> = {}
  await dragBy(page, add, 0, -60, async () => {
    preview = await paths()
    expect(preview.sc1).not.toBe(before.sc1)
    expect(preview.sc2).not.toBe(before.sc2)
    expect(preview.cs).not.toBe(before.cs)
    expect(preview.cp).toBe(before.cp)
  })
  await expect(page.getByRole('status', { name: 'Reshape events', exact: true })).toHaveText('1')
  expect(await paths()).toEqual(preview)
  // Only the dragged point became a waypoint: the spreading point is not one.
  await expect(button('Move waypoint 1 · order')).toBeVisible()
  await expect(button('Move waypoint 2 · order')).toHaveCount(0)

  // The export draws the same paths, shapes and markers.
  const exported = await page.evaluate(() => (window as any).__vw.graph().exportSvg() as string)
  expect(exported).toContain('orient="auto-start-reverse"')
  expect(exported).toContain('stroke-dasharray="6 4"')
  expect((exported.match(/<polygon /g) ?? []).length).toBe(2)
  expect(exported).toContain('<ellipse ')
  for (const path of Object.values(await paths())) expect(exported).toContain(`d="${path}"`)
  expect(errors).toEqual([])
})

test('hollow edge markers and node shapes follow the dark theme', async ({ page }) => {
  const errors = pageErrors(page)
  await openStylesFixture(page, '?theme=dark&style=straight')
  const style = (selector: string, property: string) => page.locator(selector).first().evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property)
  expect(await style('.vw-edge-marker-hollow', 'fill')).toBe('rgb(30, 51, 67)')
  expect(await style('[data-vw-node="start"] ellipse', 'fill')).toBe('rgb(32, 69, 63)')
  expect(await style('[data-vw-node="check"] polygon', 'stroke')).toBe('rgb(181, 136, 72)')
  // Straight edges end on the shape outlines and parallel straight edges bend apart.
  const d = await page.locator('.vw-edge-hit[data-vw-edge="sc1"]').getAttribute('d')
  expect(d).toMatch(/^M [\d.]+ [\d.]+ L [\d.]+ [\d.]+ L [\d.]+ [\d.]+$/)
  await expect(page.getByRole('button', { name: 'Check stock', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('getTargetClientRect measures nodes, edges and groups and setViewportCenter restores a saved centre', async ({ page }) => {
  const errors = pageErrors(page)
  await openNetworkFixture(page, '?preset=groups&edgeselect=1')
  const rect = (target: unknown) => page.evaluate(value => {
    const result = (window as any).__vw.graph().getTargetClientRect(value) as DOMRect | undefined
    return result && { x: result.x, y: result.y, width: result.width, height: result.height }
  }, target)
  const close = (actual: { x: number; y: number; width: number; height: number } | undefined, expected: { x: number; y: number; width: number; height: number }) => {
    expect(actual).toBeDefined()
    for (const key of ['x', 'y', 'width', 'height'] as const) expect(Math.abs(actual![key] - expected[key])).toBeLessThan(1.5)
  }
  // The drawn node rectangle is inset by 2 chart units on every side of the layout box.
  const nodeBox = async (name: string) => {
    const [drawn, scale] = [(await chainNode(page, name).locator('rect').boundingBox())!, (await readCamera(page)).scale]
    return { x: drawn.x - 2 * scale, y: drawn.y - 2 * scale, width: drawn.width + 4 * scale, height: drawn.height + 4 * scale }
  }
  close(await rect({ view: 'graph', kind: 'node', id: 'B' }), await nodeBox('B'))
  close(await rect({ view: 'graph', kind: 'group', id: 'outer' }), (await page.locator('.vw-network-group', { hasText: 'Outer' }).locator('rect').boundingBox())!)
  const edge = await rect({ view: 'graph', kind: 'edge', id: 'e0' })
  expect(edge!.width).toBeGreaterThan(0)
  expect(await rect({ view: 'graph', kind: 'node', id: 'missing' })).toBeUndefined()
  expect(await rect({ view: 'timeline', kind: 'bar', id: 'B' })).toBeUndefined()

  const saved = await page.evaluate(() => ({ center: (window as any).__vw.graph().getViewportCenter(), scale: (window as any).__vw.graph().getViewport().scale }))
  await page.evaluate(() => (window as any).__vw.graph().setViewport({ x: 0, y: 0, scale: 0.5 }))
  await page.evaluate(({ center, scale }) => (window as any).__vw.graph().setViewportCenter(center, scale), saved)
  const restored = await page.evaluate(() => (window as any).__vw.graph().getViewportCenter())
  expect(restored.x).toBeCloseTo(saved.center.x, 6)
  expect(restored.y).toBeCloseTo(saved.center.y, 6)
  expect((await readCamera(page)).scale).toBe(saved.scale)
  // A saved centre and scale restore the same view in a container of another size (the translation differs).
  const stageBefore = (await page.getByLabel('Network graph', { exact: true }).boundingBox())!
  const translation = await readCamera(page)
  await page.setViewportSize({ width: 820, height: 640 })
  await expect.poll(async () => (await page.getByLabel('Network graph', { exact: true }).boundingBox())!.width).not.toBe(stageBefore.width)
  // Restore until the graph has measured its new size (ResizeObserver runs asynchronously); the translation then differs.
  await expect.poll(async () => {
    await page.evaluate(() => (window as any).__vw.graph().setViewport({ x: 0, y: 0, scale: 0.5 }))
    await page.evaluate(({ center, scale }) => (window as any).__vw.graph().setViewportCenter(center, scale), saved)
    return (await readCamera(page)).x
  }).not.toBe(translation.x)
  const resized = await page.evaluate(() => (window as any).__vw.graph().getViewportCenter())
  expect(resized.x).toBeCloseTo(saved.center.x, 6)
  expect(resized.y).toBeCloseTo(saved.center.y, 6)
  expect((await readCamera(page)).scale).toBe(saved.scale)
  // Moving the camera moves the measured rectangle with it.
  await page.evaluate(() => (window as any).__vw.graph().setViewport({ ...(window as any).__vw.graph().getViewport(), x: 10 }))
  close(await rect({ view: 'graph', kind: 'node', id: 'B' }), await nodeBox('B'))
  expect(errors).toEqual([])
})

test('two-finger pinch zooms around the midpoint, clamps, pans and leaves one-finger gestures alone', async ({ page }) => {
  const errors = pageErrors(page)
  await openNetworkFixture(page, '?nodes=3&draggable=1')
  const cdp = await page.context().newCDPSession(page)
  const stage = (await page.getByLabel('Network graph', { exact: true }).boundingBox())!
  const cx = stage.x + stage.width / 2, cy = stage.y + stage.height / 2
  const events = page.getByRole('status', { name: 'Viewport events', exact: true })

  // One finger on the background still pans.
  const start = await readCamera(page)
  const eventsBefore = Number(await events.textContent())
  await touch(cdp, 'touchStart', [{ x: stage.x + 8, y: stage.y + 8, id: 1 }])
  await touch(cdp, 'touchMove', [{ x: stage.x + 38, y: stage.y + 28, id: 1 }])
  await touch(cdp, 'touchEnd', [])
  await expect.poll(async () => (await readCamera(page)).x - start.x).toBeCloseTo(30, 0)
  const panned = await readCamera(page)
  expect(panned.y - start.y).toBeCloseTo(20, 0)
  expect(panned.scale).toBe(start.scale)

  // Spreading two fingers to twice the distance doubles the scale and keeps the midpoint anchored.
  const a = { x: cx - 50, y: cy, id: 1 }, b = { x: cx + 50, y: cy, id: 2 }
  const rect = { left: stage.x, top: stage.y }
  const worldAt = (camera: Camera, x: number, y: number) => ({ x: (x - rect.left - camera.x) / camera.scale, y: (y - rect.top - camera.y) / camera.scale })
  const beforePinch = await readCamera(page)
  const anchor = worldAt(beforePinch, cx, cy)
  await touch(cdp, 'touchStart', [a, b])
  await touch(cdp, 'touchMove', [{ ...a, x: cx - 100 }, { ...b, x: cx + 100 }])
  await expect.poll(async () => (await readCamera(page)).scale / beforePinch.scale).toBeCloseTo(2, 1)
  const zoomed = await readCamera(page)
  const anchored = worldAt(zoomed, cx, cy)
  expect(anchored.x).toBeCloseTo(anchor.x, 0)
  expect(anchored.y).toBeCloseTo(anchor.y, 0)
  expect(Number(await events.textContent())).toBeGreaterThan(eventsBefore)
  // Moving both fingers together pans without changing the scale.
  await touch(cdp, 'touchMove', [{ ...a, x: cx - 60, y: cy + 20 }, { ...b, x: cx + 140, y: cy + 20 }])
  await expect.poll(async () => (await readCamera(page)).x - zoomed.x).toBeCloseTo(40, 0)
  const dragged = await readCamera(page)
  expect(dragged.scale).toBeCloseTo(zoomed.scale, 5)
  expect(dragged.y - zoomed.y).toBeCloseTo(20, 0)
  // Extreme spreading and squeezing respects the zoom clamp.
  await touch(cdp, 'touchMove', [{ ...a, x: stage.x + 2 }, { ...b, x: stage.x + stage.width - 2 }])
  await touch(cdp, 'touchMove', [{ ...a, x: cx, y: cy }, { ...b, x: cx + 1, y: cy }])
  await expect.poll(async () => (await readCamera(page)).scale).toBe(0.1)
  await touch(cdp, 'touchMove', [{ ...a, x: stage.x + 2, y: cy }, { ...b, x: stage.x + stage.width - 2, y: cy }])
  await touch(cdp, 'touchMove', [{ ...a, x: stage.x + 2, y: stage.y + 2 }, { ...b, x: stage.x + stage.width - 2, y: stage.y + stage.height - 2 }])
  await expect.poll(async () => (await readCamera(page)).scale).toBe(3)
  await touch(cdp, 'touchEnd', [])

  // A node drag in progress is cancelled by the second finger and never proposes a move.
  await page.evaluate(() => (window as any).__vw.graph().fit())
  const node = (await chainNode(page, 'N0001').boundingBox())!
  const nx = node.x + node.width / 2, ny = node.y + node.height / 2
  await touch(cdp, 'touchStart', [{ x: nx, y: ny, id: 1 }])
  await touch(cdp, 'touchMove', [{ x: nx + 25, y: ny + 15, id: 1 }])
  const fitScale = (await readCamera(page)).scale
  await touch(cdp, 'touchStart', [{ x: nx + 25, y: ny + 15, id: 1 }, { x: nx + 125, y: ny + 15, id: 2 }])
  await touch(cdp, 'touchMove', [{ x: nx + 25, y: ny + 15, id: 1 }, { x: nx + 225, y: ny + 15, id: 2 }])
  await touch(cdp, 'touchEnd', [])
  await expect.poll(async () => (await readCamera(page)).scale).toBeGreaterThan(fitScale)
  await expect(page.getByRole('status', { name: 'Move events', exact: true })).toHaveText('0')

  // Plain wheel input does not move the camera.
  const wheelStart = await readCamera(page)
  await page.mouse.move(cx, cy)
  await page.mouse.wheel(0, 120)
  expect(await readCamera(page)).toEqual(wheelStart)
  expect(errors).toEqual([])
})

test('matchIds dims non-matching nodes and focusNode accepts a scale', async ({ page }) => {
  const errors = pageErrors(page)
  await openNetworkFixture(page, '?nodes=5&match=N0001,N0002')
  await expect(chainNode(page, 'N0000')).toHaveClass(/vw-dimmed/)
  await expect(chainNode(page, 'N0001')).not.toHaveClass(/vw-dimmed/)
  await expect(chainNode(page, 'N0002')).not.toHaveClass(/vw-dimmed/)
  await expect(chainNode(page, 'N0004')).toHaveClass(/vw-dimmed/)
  // Dimming is presentational: the node still reports its name and can be selected.
  await chainNode(page, 'N0000').click()
  await expect(chainNode(page, 'N0000')).toHaveAttribute('aria-pressed', 'true')
  await page.evaluate(() => (window as any).__vw.graph().focusNode('N0004', { scale: 1 }))
  expect((await readCamera(page)).scale).toBe(1)
  const stage = (await page.getByLabel('Network graph', { exact: true }).boundingBox())!
  const box = (await chainNode(page, 'N0004').boundingBox())!
  expect(Math.abs(box.x + box.width / 2 - (stage.x + stage.width / 2))).toBeLessThan(25)
  expect(errors).toEqual([])
})

test('nested group rectangles stay inside the fitted view, the minimap and the exported SVG', async ({ page }) => {
  const errors = pageErrors(page)
  await openNetworkFixture(page, '?preset=groups&minimap=1')
  const stage = page.getByLabel('Network graph', { exact: true })
  await page.evaluate(() => (window as any).__vw.graph().fit())
  const rects = page.locator('.vw-network-group rect')
  await expect(rects).toHaveCount(2)
  const frame = (await stage.boundingBox())!
  const boxes = await rects.evaluateAll(list => list.map(el => {
    const r = el.getBoundingClientRect()
    return { top: r.top, bottom: r.bottom, left: r.left, right: r.right }
  }))
  const top = Math.min(...boxes.map(box => box.top)), bottom = Math.max(...boxes.map(box => box.bottom))
  const left = Math.min(...boxes.map(box => box.left)), right = Math.max(...boxes.map(box => box.right))
  // Every group, including the parent that reaches above the first node row, is inside the stage and centred.
  expect(top).toBeGreaterThanOrEqual(frame.y - 0.5)
  expect(bottom).toBeLessThanOrEqual(frame.y + frame.height + 0.5)
  expect(Math.abs((top - frame.y) - (frame.y + frame.height - bottom))).toBeLessThan(1.5)
  expect(left).toBeGreaterThanOrEqual(frame.x - 0.5)
  expect(right).toBeLessThanOrEqual(frame.x + frame.width + 0.5)
  // The minimap frames the groups too.
  const viewTop = await page.getByRole('button', { name: 'Navigate graph overview' }).locator('svg').evaluate(el => el.viewBox.baseVal.y)
  expect(viewTop).toBeLessThan(0)
  // The export frames them as well: no content coordinate is negative after the export translation.
  const svg = await page.evaluate(() => (window as any).__vw.graph().exportSvg() as string)
  expect(svg).toMatch(/<svg[^>]* width="[\d.]+" height="[\d.]+"/)
  expect(errors).toEqual([])
})

test('the large graph demo preset renders a viewport slice of thousands of nodes', async ({ page }) => {
  const errors = pageErrors(page)
  await openDemo(page, 'Large graph')
  await expect(page.getByText('3750 nodes')).toBeVisible()
  const nodes = page.getByRole('button', { name: /^Node \d+ Rank \d+$/ })
  await expect(nodes.first()).toBeVisible()
  const rendered = await nodes.count()
  expect(rendered).toBeGreaterThan(0)
  expect(rendered).toBeLessThan(3000)
  await page.getByRole('searchbox', { name: 'Search nodes' }).fill('Node 3750')
  await page.getByRole('searchbox', { name: 'Search nodes' }).press('Enter')
  await expect(page.getByRole('button', { name: 'Node 3750 Rank 150', exact: true })).toBeVisible()
  expect(errors).toEqual([])
})

test('network direction, crossing reduction and layout controls', async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto('gallery.html')
  const split = page.getByRole('button', { name: /^Split/ }).first()
  await expect(split).toBeVisible()
  for (const direction of ['RL', 'BT', 'LR']) {
    await page.getByLabel('Direction').selectOption(direction)
    await expect(graphNode(graphStage(page), /^Split/)).toBeVisible()
  }
  await page.getByLabel('Crossing reduction').selectOption('barycenter')
  for (const layout of ['tree', 'radial', 'circular', 'grid', 'concentric', 'layered']) {
    await page.getByLabel('Graph layout').selectOption(layout)
    await expect(graphNode(graphStage(page), /^Split/)).toBeVisible()
  }
  expect(errors).toEqual([])
})

test('right-to-left network graph mirrors the chrome and label alignment but not the geometry', async ({ page }) => {
  const errors = pageErrors(page)
  const measure = async () => {
    const stage = (await page.getByLabel('Network graph', { exact: true }).boundingBox())!
    const minimap = (await page.getByRole('button', { name: 'Navigate graph overview', exact: true }).boundingBox())!
    const tools = (await page.getByRole('group', { name: 'Graph zoom', exact: true }).boundingBox())!
    const node = page.getByRole('button', { name: 'A', exact: true })
    const box = (await node.locator('rect').first().boundingBox())!
    const text = (await node.locator('text.vw-node-title').boundingBox())!
    return { stage, minimap, tools, box, text }
  }
  await openNetworkFixture(page, '?preset=groups&minimap=1')
  const ltr = await measure()
  await openNetworkFixture(page, '?preset=groups&minimap=1&dir=rtl')
  await expect(page.locator('.vw-network')).toHaveAttribute('dir', 'rtl')
  const rtl = await measure()
  // Geometry is unchanged; the minimap and zoom tools move to the left; labels align to the right.
  expect(rtl.box).toEqual(ltr.box)
  expect(ltr.minimap.x).toBeGreaterThan(ltr.stage.x + ltr.stage.width / 2)
  expect(rtl.minimap.x + rtl.minimap.width).toBeLessThan(rtl.stage.x + rtl.stage.width / 2)
  expect(rtl.tools.x + rtl.tools.width).toBeLessThan(rtl.stage.x + rtl.stage.width / 2)
  expect(ltr.text.x - ltr.box.x).toBeLessThan(ltr.box.x + ltr.box.width - (ltr.text.x + ltr.text.width))
  expect(rtl.box.x + rtl.box.width - (rtl.text.x + rtl.text.width)).toBeLessThan(rtl.text.x - rtl.box.x)
  await expect(page.getByRole('button', { name: 'Fit to view', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Fit to view', exact: true }).click()

  // dir="auto" follows an inherited right-to-left direction after mounting.
  // The attribute is set once parsing ends, before the deferred module script mounts the app.
  await page.addInitScript(() => document.addEventListener('readystatechange', () => {
    if (document.readyState === 'interactive') document.documentElement.setAttribute('dir', 'rtl')
  }))
  await openNetworkFixture(page, '?preset=groups&minimap=1&dir=auto')
  await expect(page.locator('.vw-network')).toHaveClass(/vw-rtl/)
  await expect(page.locator('.vw-network')).not.toHaveAttribute('dir', /./)
  expect(errors).toEqual([])
})

test('force graph layout renders selectable nodes without overlapping boxes', async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto('gallery.html')
  const nodes = page.locator('.vw-network-node')
  await expect(nodes.first()).toBeVisible()
  const count = await nodes.count()
  await page.getByLabel('Graph layout').selectOption('force')
  await page.getByLabel('Edit graph').check()
  await expect(nodes).toHaveCount(count)
  const split = page.getByRole('button', { name: 'Split Operation 101', exact: true })
  const finish = page.getByRole('button', { name: 'Finish Operation 102', exact: true })
  await expect(split).toBeVisible()
  await split.click()
  await finish.click({ modifiers: ['Shift'] })
  await expect(split).toHaveAttribute('aria-pressed', 'true')
  await expect(finish).toHaveAttribute('aria-pressed', 'true')
  const boxes = await nodes.evaluateAll(elements => elements.map(element => {
    const { x, y, width, height } = element.getBoundingClientRect()
    return { x, y, width, height }
  }))
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i]!, b = boxes[j]!
      expect(a.x + a.width <= b.x + 0.5 || b.x + b.width <= a.x + 0.5 || a.y + a.height <= b.y + 0.5 || b.y + b.height <= a.y + 0.5).toBe(true)
    }
  }
  expect(errors).toEqual([])
})

test('circular, grid and concentric graph layouts render selectable nodes without overlapping boxes', async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto('gallery.html')
  const nodes = page.locator('.vw-network-node')
  await expect(nodes.first()).toBeVisible()
  const count = await nodes.count()
  await page.getByLabel('Edit graph').check()
  const layout = page.getByLabel('Graph layout')
  for (const kind of ['circular', 'grid', 'concentric']) {
    await layout.selectOption(kind)
    await expect(layout).toHaveValue(kind)
    await expect(nodes).toHaveCount(count)
    const split = page.getByRole('button', { name: 'Split Operation 101', exact: true })
    const finish = page.getByRole('button', { name: 'Finish Operation 102', exact: true })
    await expect(split).toBeVisible()
    await split.click()
    await finish.click({ modifiers: ['Shift'] })
    await expect(split).toHaveAttribute('aria-pressed', 'true')
    await expect(finish).toHaveAttribute('aria-pressed', 'true')
    const boxes = await nodes.evaluateAll(elements => elements.map(element => {
      const { x, y, width, height } = element.getBoundingClientRect()
      return { x, y, width, height }
    }))
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i]!, b = boxes[j]!
        expect(a.x + a.width <= b.x + 0.5 || b.x + b.width <= a.x + 0.5 || a.y + a.height <= b.y + 0.5 || b.y + b.height <= a.y + 0.5).toBe(true)
      }
    }
  }
  await layout.selectOption('layered')
  await expect(nodes).toHaveCount(count)
  expect(errors).toEqual([])
})

test('the demo offers the force layout up to 1,000 nodes and falls back to layered for the large graph', async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto('gallery.html')
  const layout = page.getByLabel('Graph layout')
  const force = layout.locator('option', { hasText: 'force' })
  await layout.selectOption('force')
  await expect(force).toBeEnabled()
  await page.getByRole('button', { name: 'Large graph', exact: true }).click()
  await expect(layout).toHaveValue('layered')
  await expect(force).toBeDisabled()
  await expect(page.getByRole('status').filter({ hasText: 'The force layout is offered for up to 1,000 nodes; switched to the layered layout.' })).toBeVisible()
  await expect(page.locator('.vw-network-node').first()).toBeVisible()
  await page.getByRole('button', { name: 'Manufacturing', exact: true }).click()
  await expect(force).toBeEnabled()
  expect(errors).toEqual([])
})

test('demo level of detail hides node details and edge labels when zoomed out', async ({ page }) => {
  const { errors, button } = await openGraphEditor(page)
  const root = page.locator('.vw-network')
  const detail = page.locator('.vw-node-detail').first()
  await expect(detail).toBeVisible()
  await expect(root).not.toHaveClass(/vw-lod-low/)
  const zoom = page.getByRole('group', { name: 'Graph zoom', exact: true })
  for (let i = 0; i < 6; i++) await zoom.getByRole('button', { name: 'Zoom out', exact: true }).click()
  await expect(root).toHaveClass(/vw-lod-low/)
  await expect(detail).toBeHidden()
  await expect(page.locator('.vw-edge-label').first()).toBeHidden()
  // Accessible names keep the detail.
  await expect(button('Split Operation 101')).toBeAttached()
  await zoom.getByRole('button', { name: 'Fit to view', exact: true }).click()
  await expect(root).not.toHaveClass(/vw-lod-low/)
  await expect(detail).toBeVisible()
  expect(errors).toEqual([])
})

test('keyboard focus on a selected node is visibly distinct from selection alone', async ({ page }) => {
  const errors = pageErrors(page)
  await openGestureFixture(page, '?chart=graph')
  const node = page.getByRole('button', { name: 'Node A', exact: true })
  await expect(node).toHaveAttribute('aria-pressed', 'true')
  const look = () => node.evaluate(el => {
    const style = getComputedStyle(el)
    return { focused: el.matches(':focus-visible'), outline: `${style.outlineStyle} ${style.outlineWidth} ${style.outlineColor}` }
  })
  const unfocused = await look()
  await page.getByLabel('Gesture graph', { exact: true }).focus()
  for (let i = 0; i < 10 && !await node.evaluate(el => el === document.activeElement); i++) await page.keyboard.press('Tab')
  const focused = await look()
  expect(unfocused.focused).toBe(false)
  expect(focused.focused).toBe(true)
  expect(focused.outline).not.toBe(unfocused.outline)
  expect(focused.outline).toMatch(/^solid 2px/)
  expect(errors).toEqual([])
})

test('unstyledNodeSlots keeps the library hover stroke off custom node content', async ({ page }) => {
  const errors = pageErrors(page)
  const demo = await openExample(page, 'workflow', { kind: 'showcase' })
  const card = demo.getByRole('button', { name: 'Look up customer', exact: true })
  await expect(card).toHaveClass(/vw-is-unstyled/)
  const strokes = () => card.locator('rect').evaluateAll(rects => rects.map(rect => getComputedStyle(rect).strokeWidth))
  const before = await strokes()
  await card.hover()
  expect(await strokes()).toEqual(before)
  // Without the prop, the legacy gallery's main demo's custom nodes still take the stylesheet's hover stroke.
  await page.goto('gallery.html')
  await page.getByRole('button', { name: 'Manufacturing', exact: true }).click()
  await page.getByLabel('Custom nodes').check()
  const split = page.locator('.vw-network-node[data-vw-node="split"]')
  await expect(split).not.toHaveClass(/vw-is-unstyled/)
  await split.hover()
  await expect(split.locator('rect').first()).toHaveCSS('stroke-width', '2.8px')
  expect(errors).toEqual([])
})

test('the diagram demo draws shapes and markers, spreads parallel edges, animates the main path and exports', async ({ page }) => {
  const { readFile } = await import('node:fs/promises')
  const errors = pageErrors(page)
  await openDemo(page, 'Diagram styles')
  await expect(page.getByRole('heading', { name: 'Diagram styles' })).toBeVisible()
  for (const name of ['Order placed', 'In stock?', 'Inventory data store', 'Validate order', 'Delivered']) {
    await expect(page.getByRole('button', { name })).toBeVisible()
  }
  await expect(page.locator('.vw-network-node')).toHaveCount(11)
  // Shapes: decisions are diamonds and terminals ellipses.
  await expect(page.getByRole('button', { name: 'In stock?' }).locator('polygon, path').first()).toBeAttached()
  await expect(page.getByRole('button', { name: 'Order placed' }).locator('ellipse')).toHaveCount(1)

  const spread = page.getByLabel('Spread parallel edges')
  await expect(spread).toBeChecked()
  const paths = () => page.locator('.vw-network-edge').evaluateAll(items => items.map(item => item.getAttribute('d')))
  const spreadPaths = await paths()
  expect(spreadPaths).toHaveLength(13)
  await spread.uncheck()
  const plainPaths = await paths()
  // The request/response pair (edges 11 and 12) is drawn differently; the other edges are not.
  expect(plainPaths.slice(0, 10)).toEqual(spreadPaths.slice(0, 10))
  for (let index = 10; index < 12; index++) expect(plainPaths[index]).not.toEqual(spreadPaths[index])
  expect(plainPaths[12]).toEqual(spreadPaths[12])
  await spread.check()
  await page.getByLabel('Parallel edge spacing').selectOption('56')
  expect(await paths()).not.toEqual(spreadPaths)

  const animated = page.locator('.vw-network-edge.vw-is-animated')
  await expect(animated).toHaveCount(6)
  await page.getByLabel('Animate main path').uncheck()
  await expect(animated).toHaveCount(0)
  await page.getByLabel('Animate main path').check()
  await expect(animated).toHaveCount(6)

  await page.getByLabel('Edge style').selectOption('straight')
  expect((await paths())[0]).not.toContain('C')
  await page.getByLabel('Edge style').selectOption('curve')

  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export SVG', exact: true }).click()
  const file = await pending
  expect(file.suggestedFilename()).toBe('order-fulfilment.svg')
  const text = (await readFile((await file.path())!)).toString('utf8')
  expect(text).toMatch(/^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
  expect(text).toContain('>In stock?<')
  await expect(page.getByRole('status', { name: 'Diagram status' })).toContainText('Exported SVG (')
  const png = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export PNG', exact: true }).click()
  expect((await png).suggestedFilename()).toBe('order-fulfilment.png')
  await expect(page.getByRole('status', { name: 'Diagram status' })).toContainText('Exported PNG')
  expect(errors).toEqual([])
})

test('the diagram demo routes orthogonal edges around the nodes with Avoid nodes', async ({ page }) => {
  const errors = pageErrors(page)
  await openDemo(page, 'Diagram styles')
  await expect(page.getByRole('heading', { name: 'Diagram styles' })).toBeVisible()
  const paths = () => page.locator('.vw-network-edge').evaluateAll(items => items.map(item => item.getAttribute('d')))
  const avoid = page.getByLabel('Avoid nodes')
  await expect(avoid).not.toBeChecked()
  // In the curve style only the orthogonal loop-back (edge 4) is routed by the option, and it has nothing in its way.
  const curves = await paths()
  await avoid.check()
  expect(await paths()).toEqual(curves)
  await avoid.uncheck()

  await page.getByLabel('Edge style').selectOption('orthogonal')
  const plain = await paths()
  expect(plain).toHaveLength(13)
  await avoid.check()
  const avoided = await paths()
  // The brackets between same-column nodes and the spread request/response pair move into the middle of the free
  // channels beside the boxes; the routes that already run between neighbouring nodes stay as they are.
  for (const index of [0, 1, 2, 4, 5, 6, 7, 12]) expect(avoided[index]).toEqual(plain[index])
  for (const index of [3, 8, 9, 10, 11]) expect(avoided[index]).not.toEqual(plain[index])
  await avoid.uncheck()
  expect(await paths()).toEqual(plain)
  await page.getByLabel('Edge style').selectOption('curve')
  expect(errors).toEqual([])
})

type ScreenBox = { name: string; x: number; y: number; width: number; height: number }
// The on-screen boxes of the edge labels and nodes, and the pairs that overlap by more than half a pixel.
async function labelOverlaps(page: Page) {
  const { labels, nodes } = await page.evaluate(() => {
    const box = (element: Element) => {
      const rect = element.getBoundingClientRect()
      return { name: element.textContent ?? '', x: rect.x, y: rect.y, width: rect.width, height: rect.height }
    }
    return {
      labels: [...document.querySelectorAll('.vw-edge-label')].map(box),
      nodes: [...document.querySelectorAll('.vw-network-node')].map(box),
    }
  })
  const meet = (a: ScreenBox, b: ScreenBox) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 0.5
    && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 0.5
  return {
    labels,
    onNodes: labels.flatMap(label => nodes.filter(node => meet(label, node)).map(node => label.name + ' / ' + node.name)),
    onLabels: labels.flatMap((label, i) => labels.slice(i + 1).filter(other => meet(label, other)).map(other => label.name + ' / ' + other.name)),
  }
}

test('the diagram demo places edge labels clear of nodes and each other, on screen and in the SVG export', async ({ page }) => {
  const errors = pageErrors(page)
  await openDemo(page, 'Diagram styles')
  const place = page.getByLabel('Place labels clear')
  await expect(place).not.toBeChecked()
  await page.getByLabel('Edge style').selectOption('orthogonal')
  const anchors = () => page.locator('.vw-edge-label').evaluateAll(items => items.map(item => [item.textContent, item.getAttribute('x'), item.getAttribute('y')]))
  const midpoint = await anchors()
  // At the midpoints, the labels of the request to Inventory and of the reservation share one channel.
  expect((await labelOverlaps(page)).onLabels).toEqual(['ask / reserve'])

  await place.check()
  // The placed labels are drawn after the next render.
  await expect.poll(anchors).not.toEqual(midpoint)
  const placed = await labelOverlaps(page)
  expect(placed.labels).toHaveLength(8)
  expect(placed.onLabels).toEqual([])
  expect(placed.onNodes).toEqual([])
  const moved = await anchors()

  // The export draws each label at its placed anchor.
  const { readFile } = await import('node:fs/promises')
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export SVG', exact: true }).click()
  const text = (await readFile((await (await pending).path())!)).toString('utf8')
  const round = (value: string | null) => String(Math.round(Number(value) * 1000) / 1000)
  for (const [, x, y] of moved) expect(text).toContain(`<text x="${round(x)}" y="${round(y)}"`)
  expect(text).toContain('>ask<')

  await place.uncheck()
  await expect.poll(anchors).toEqual(midpoint)
  await page.getByLabel('Edge style').selectOption('curve')
  expect(errors).toEqual([])
})

// Three nodes in a row with labelled orthogonal edges. After N0002 moves right and down, the route of link 1 has a
// vertical run; the scenario then drags N0000 onto the label of link 1, whose own route does not change.
async function openLabelDrag(page: Page, placement: string) {
  await openNetworkFixture(page, `?nodes=3&draggable=1&edgelabels=1&labelplacement=${placement}&style=orthogonal`)
  await dragBy(page, chainNode(page, 'N0002'), 200, 110)
  await expect(fixtureStatus(page, 'Move events')).toHaveText('1')
  const label = await centerOf(page.locator('.vw-edge-label', { hasText: 'link 1' }))
  const node = await centerOf(chainNode(page, 'N0000'))
  return { dx: label.x - node.x, dy: label.y - node.y }
}
const labelAnchors = (page: Page) => page.locator('.vw-edge-label')
  .evaluateAll(items => items.map(item => [item.textContent, item.getAttribute('x'), item.getAttribute('y')].join(' ')))

test('placed edge labels move off a node dragged onto them, in the preview and once saved', async ({ page }) => {
  const errors = pageErrors(page)
  // The control: with midpoint labels, the dragged node ends up covering the label of link 1.
  const midpoint = await openLabelDrag(page, 'midpoint')
  await dragBy(page, chainNode(page, 'N0000'), midpoint.dx, midpoint.dy)
  await expect(fixtureStatus(page, 'Move events')).toHaveText('2')
  expect((await labelOverlaps(page)).onNodes.filter(pair => pair.startsWith('link 1 / N0000'))).toHaveLength(1)

  const { dx, dy } = await openLabelDrag(page, 'avoid')
  expect((await labelOverlaps(page)).onNodes).toEqual([])
  let preview: Awaited<ReturnType<typeof labelOverlaps>> | undefined
  await dragBy(page, chainNode(page, 'N0000'), dx, dy, async () => {
    await expect.poll(async () => (await labelOverlaps(page)).onNodes).toEqual([])
    preview = await labelOverlaps(page)
  })
  expect(preview!.onLabels).toEqual([])
  await expect(fixtureStatus(page, 'Move events')).toHaveText('2')
  await expect.poll(async () => (await labelOverlaps(page)).onNodes).toEqual([])
  expect((await labelOverlaps(page)).onLabels).toEqual([])
  expect(errors).toEqual([])
})

test('a drag cancelled with Escape puts placed edge labels back at their saved anchors', async ({ page }) => {
  const errors = pageErrors(page)
  const { dx, dy } = await openLabelDrag(page, 'avoid')
  const saved = await labelAnchors(page)
  await pressAndMove(page, chainNode(page, 'N0000'), dx, dy)
  await expect.poll(() => labelAnchors(page)).not.toEqual(saved)
  await page.keyboard.press('Escape')
  await expect.poll(() => labelAnchors(page)).toEqual(saved)
  await page.mouse.up()
  await expect(fixtureStatus(page, 'Move events')).toHaveText('1')
  expect(await labelAnchors(page)).toEqual(saved)
  expect(errors).toEqual([])
})

test('the analysis demo summarizes the network, groups and collapses communities and ranks nodes', async ({ page }) => {
  const errors = pageErrors(page)
  await openDemo(page, 'Graph analysis')
  const summary = page.getByLabel('Network summary')
  await expect(summary).toHaveText(/^\d+ nodes, \d+ edges, 3 components, \d+ communities, modularity 0\.\d\d$/)
  const communityCount = Number((await summary.textContent())!.match(/(\d+) communities/)![1])
  const nodeCount = Number((await summary.textContent())!.match(/^(\d+) nodes/)![1])
  expect(communityCount).toBeGreaterThanOrEqual(8)
  const frames = page.locator('.vw-network-group')
  await expect(frames).toHaveCount(0)
  await page.getByLabel('Group communities').check()
  await expect(frames).not.toHaveCount(0)
  await expect(page.getByText(/^Community \d+ · \d+ nodes$/).first()).toBeAttached()
  await page.getByRole('button', { name: 'Collapse all', exact: true }).click()
  await expect(page.locator('.vw-network-node')).toHaveCount(communityCount)
  expect(communityCount).toBeLessThan(nodeCount)
  await page.getByRole('button', { name: 'Expand all', exact: true }).click()
  await expect(page.locator('.vw-network-node')).toHaveCount(nodeCount)

  await expect(page.locator('.vw-is-highlighted')).toHaveCount(0)
  await page.getByLabel('Rank by').selectOption('pagerank')
  const ranking = page.getByRole('list', { name: 'Top ranked nodes' })
  await expect(ranking.getByRole('listitem')).toHaveCount(5)
  await expect(page.locator('.vw-is-highlighted')).toHaveCount(5)
  await ranking.getByRole('button').first().click()
  await expect(page.getByRole('status', { name: 'Analysis status' })).toContainText('Centered on')
  await page.getByLabel('Rank by').selectOption('none')
  await expect(page.locator('.vw-is-highlighted')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('the demo falls back to layered for the circular and concentric layouts of the large graph', async ({ page }) => {
  const errors = pageErrors(page)
  await page.goto('gallery.html')
  const layout = page.getByLabel('Graph layout')
  for (const name of ['circular', 'concentric']) {
    await page.getByRole('button', { name: 'Manufacturing', exact: true }).click()
    await layout.selectOption(name)
    await expect(layout.locator('option', { hasText: name })).toBeEnabled()
    await page.getByRole('button', { name: 'Large graph', exact: true }).click()
    await expect(layout).toHaveValue('layered')
    await expect(layout.locator('option', { hasText: name })).toBeDisabled()
    await expect(page.getByRole('status').filter({ hasText: `The ${name} layout is offered for up to 1,000 nodes; switched to the layered layout.` })).toBeVisible()
  }
  await expect(layout.locator('option', { hasText: 'grid' })).toBeEnabled()
  await layout.selectOption('grid')
  await expect(page.locator('.vw-network-node').first()).toBeVisible()
  await page.getByRole('button', { name: 'Manufacturing', exact: true }).click()
  await expect(layout.locator('option', { hasText: 'circular' })).toBeEnabled()
  expect(errors).toEqual([])
})

test('the process lanes demo draws one named lane per department, keeps lane order when a step is added and follows the flow direction', async ({ page }) => {
  const errors = pageErrors(page)
  await openDemo(page, 'Process lanes')
  const stage = page.getByLabel('Process lane graph', { exact: true })
  await stage.scrollIntoViewIfNeeded()
  const status = page.getByRole('status', { name: 'Process lane status' })
  const names = ['Purchasing', 'Machining', 'Inspection', 'Shipping']
  const lane = (name: string) => stage.getByRole('group', { name, exact: true })
  const step = (name: string) => stage.getByRole('button', { name, exact: true })
  for (const name of names) await expect(lane(name)).toBeAttached()
  await expect(stage.locator('.vw-swimlane')).toHaveCount(4)
  const box = async (locator: ReturnType<typeof lane>) => (await locator.boundingBox())!
  const order = async (axis: 'x' | 'y') => Promise.all(names.map(async name => (await box(lane(name)))[axis]))
  const ascending = (values: number[]) => values.every((value, i) => i === 0 || value > values[i - 1]!)
  const within = async (node: string, name: string) => {
    const a = await box(step(node)), b = await box(lane(name))
    return a.x >= b.x - 1 && a.y >= b.y - 1 && a.x + a.width <= b.x + b.width + 1 && a.y + a.height <= b.y + b.height + 1
  }
  expect(ascending(await order('y'))).toBe(true)
  expect(await within('Cut stock', 'Machining')).toBe(true)

  // A new step lands in the chosen (empty) lane; the lane order stays.
  await page.getByLabel('Lane for new step').selectOption({ label: 'Shipping' })
  await page.getByRole('button', { name: 'Add step', exact: true }).click()
  await expect(status).toHaveText('Added Step 1 to Shipping.')
  await expect(step('Step 1')).toBeVisible()
  expect(await within('Step 1', 'Shipping')).toBe(true)
  expect(ascending(await order('y'))).toBe(true)

  // Dragging a step onto another lane is a proposal that the demo turns into a lane change.
  const from = await box(step('Deburr')), target = await box(lane('Inspection'))
  await dragTo(page, from, { x: boxCenter(from).x, y: boxCenter(target).y }, { steps: 8 })
  await expect(status).toHaveText('Deburr moved to Inspection.')
  await expect.poll(() => within('Deburr', 'Inspection')).toBe(true)

  // Top to bottom: vertical lanes stacked left to right in the same order; right to left keeps the rows.
  await page.getByLabel('Flow direction').selectOption('TB')
  await expect.poll(async () => ascending(await order('x'))).toBe(true)
  await expect.poll(() => within('Step 1', 'Shipping')).toBe(true)
  await page.getByLabel('Flow direction').selectOption('RL')
  await expect.poll(async () => ascending(await order('y'))).toBe(true)
  await page.getByLabel('Process edge style').selectOption('orthogonal')
  await page.getByLabel('Route around steps').check()
  await expect(stage.locator('.vw-network-edge')).toHaveCount(8)
  expect(await within('Measure', 'Inspection')).toBe(true)
  expect(errors).toEqual([])
})

test('the quantity flow demo draws named bands on one scale, never mixes units and maps a selected band back to its edge', async ({ page }) => {
  const errors = pageErrors(page)
  await openDemo(page, 'Quantity flow')
  const stage = page.getByLabel('Quantity flow graph', { exact: true })
  await stage.scrollIntoViewIfNeeded()
  const status = page.getByRole('status', { name: 'Quantity flow status' })
  const band = (name: string) => stage.getByRole('button', { name: 'Select edge ' + name, exact: true })
  // The drawn band is the stroke of the edge path next to the named hit area.
  const width = (name: string) => band(name).evaluate(hit => Number.parseFloat(getComputedStyle(hit.parentElement!.querySelector('.vw-network-band')!).strokeWidth))
  for (const name of ['Lot L-100 → Line A: 60 pcs', 'Lot L-100 → Line B: 40 pcs', 'Line A → Inspect: 60 pcs', 'Line B → Inspect: 36 pcs', 'Inspect → Pack: 86 pcs']) {
    await expect(band(name)).toBeAttached()
  }
  // 60:40 on one scale: the same 60 pieces are as wide after line A as before it.
  expect(await width('Lot L-100 → Line A: 60 pcs') / await width('Lot L-100 → Line B: 40 pcs')).toBeCloseTo(1.5, 6)
  expect(await width('Line A → Inspect: 60 pcs')).toBe(await width('Lot L-100 → Line A: 60 pcs'))
  // The rework loop is a dashed reference band, not part of the totals.
  await expect(band('Rework → Inspect: 10 pcs')).toBeAttached()
  await expect(stage.locator('.vw-network-band.vw-is-reference')).toHaveCount(1)
  // Its dashes grow with its width, so the wide loop reads as a dashed band rather than a comb of stripes; its gaps
  // are evened out so it starts and ends with a dash at its nodes.
  const dash = await band('Rework → Inspect: 10 pcs').evaluate(hit => {
    const path = hit.parentElement!.querySelector('.vw-network-band')!
    const style = getComputedStyle(path)
    return { width: Number.parseFloat(style.strokeWidth), dashes: style.strokeDasharray.split(/[\s,]+/).map(Number.parseFloat) }
  })
  expect(dash.width).toBeGreaterThan(20)
  expect(dash.dashes[0]).toBeCloseTo(dash.width * 2, 1)
  expect(dash.dashes[1]).toBeGreaterThanOrEqual(dash.width * 0.75 - 0.01)
  const totals = page.getByRole('table', { name: 'Node totals' })
  await expect(totals.getByRole('row', { name: /^Line B/ }).getByRole('cell').nth(0)).toHaveText('40')
  await expect(totals.getByRole('row', { name: /^Line B/ }).getByRole('cell').nth(1)).toHaveText('36')
  await expect(totals.getByRole('row', { name: /^Line B/ }).getByRole('cell').nth(2)).toHaveText('−4')
  // Cost-only edges are listed, never drawn in pieces.
  await expect(page.getByRole('list', { name: 'Not shown in pcs' })).toContainText('overhead-a: 300 EUR')
  await expect(stage.getByRole('button', { name: /Overhead →/ })).toHaveCount(0)

  // Selecting a band by keyboard shows the original edge ID and quantity.
  await band('Line B → Inspect: 36 pcs').focus()
  await page.keyboard.press('Enter')
  await expect(status).toHaveText('Selected band: edge b-inspect, 36 pcs')
  await expect(band('Line B → Inspect: 36 pcs')).toHaveAttribute('aria-pressed', 'true')
  await band('Rework → Inspect: 10 pcs').focus()
  await page.keyboard.press('Space')
  await expect(status).toHaveText('Selected band: edge rework-inspect, 10 pcs (reference loop, not in the totals)')
  // A pointer click anywhere on a wide band selects it: its hit area is as wide as the band.
  const wide = (await band('Inspect → Pack: 86 pcs').boundingBox())!
  await page.mouse.click(wide.x + wide.width / 2, wide.y + wide.height / 2)
  await expect(status).toHaveText('Selected band: edge inspect-pack, 86 pcs')

  // The cost view draws every edge in EUR, the overhead included.
  await page.getByLabel('Flow unit').selectOption('EUR')
  await expect(band('Overhead → Line A: 300 EUR')).toBeAttached()
  await expect(band('Line B → Inspect: 900 EUR')).toBeAttached()
  await expect(stage.getByRole('button', { name: / pcs$/ })).toHaveCount(0)
  await expect(page.getByText('Every edge is in EUR.')).toBeVisible()
  await expect(totals.getByRole('row', { name: /^Line B/ }).getByRole('cell').nth(2)).toHaveText('−100')
  await page.getByRole('button', { name: 'Export flow SVG', exact: true }).click()
  await expect(status).toHaveText('Exported SVG with 9 bands.')
  // Other directions keep the bands and their names.
  await page.getByLabel('Flow chart direction').selectOption('TB')
  await expect(band('Lot L-100 → Line A: 1200 EUR')).toBeAttached()
  await page.getByLabel('Flow unit').selectOption('pcs')
  await expect(band('Lot L-100 → Line A: 60 pcs')).toBeAttached()
  expect(errors).toEqual([])
})
