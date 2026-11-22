// NetworkGraph editing: context menus, tooltips, fit and the camera, and chart coordinates of pointer and drop events.
import {
  expect, test, animationFrames, boxCenter, chainNode, fixtureStatus, openGraphEditor, openNetworkFixture, pageErrors, readCamera, readJson,
  snapped,
} from './support'

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

test('toGraphPoint, getViewportCenter and drop events report chart coordinates', async ({ page }) => {
  const errors = pageErrors(page)
  await openNetworkFixture(page, '?nodes=4&drop=1&snap=10')
  const stageLocator = page.getByLabel('Network graph', { exact: true })
  const stage = (await stageLocator.boundingBox())!
  const centre = await page.evaluate(({ x, y }) => {
    const graph = (window as any).__vw.graph()
    return { point: graph.toGraphPoint(x, y), centre: graph.getViewportCenter() }
  }, boxCenter(stage))
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
