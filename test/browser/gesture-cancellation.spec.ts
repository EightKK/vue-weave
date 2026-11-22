// Gesture cancellation in both components: context menus, fresh but equal props, a second pointer, changed source data and gesture events.
import {
  expect, test, boxCenter, centerOf, chainNode, dragBy, ganttBar, openGanttFixture, openGestureFixture, openNetworkFixture, pageErrors,
  pressAndMove, pressAndMoveTo, type Page,
} from './support'

// A second, primary pen pointer as synthetic events: isPrimary is per pointer type, so a pen is primary next to the
// mouse. Chromium's input emulation routes pen and mouse through one device, so the events are dispatched directly;
// capturing a synthetic pointer throws, so capture requests for it are ignored.
async function allowSyntheticCapture(page: Page) {
  await page.evaluate(() => {
    const capture = Element.prototype.setPointerCapture
    Element.prototype.setPointerCapture = function (id) {
      try { capture.call(this, id) } catch (error) { if ((error as Error).name !== 'NotFoundError') throw error }
    }
  })
}

async function pen(target: { dispatchEvent(type: string, init?: object): Promise<void> }, type: 'pointerdown' | 'pointermove' | 'pointerup', clientX: number, clientY: number) {
  await target.dispatchEvent(type, {
    pointerId: 7, pointerType: 'pen', isPrimary: true, button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1,
    clientX, clientY, bubbles: true, cancelable: true, composed: true,
  })
}

test('dir="auto" follows a runtime change of an ancestor dir attribute and cancels a gesture in flight', async ({ page }) => {
  const errors = pageErrors(page)
  const setDocumentDir = (dir: string | null) => page.evaluate(value => {
    if (value === null) document.documentElement.removeAttribute('dir')
    else document.documentElement.setAttribute('dir', value)
  }, dir)

  // Graph: the zoom tools follow the inline end; a node drag in flight ends without a proposal.
  await openNetworkFixture(page, '?preset=groups&minimap=1&dir=auto&draggable=1')
  const graph = page.locator('.vw-network')
  const stage = (await page.getByLabel('Network graph', { exact: true }).boundingBox())!
  const toolsCentre = async () => {
    const tools = (await page.getByRole('group', { name: 'Graph zoom', exact: true }).boundingBox())!
    return tools.x + tools.width / 2
  }
  await expect(graph).not.toHaveClass(/vw-rtl/)
  expect(await toolsCentre()).toBeGreaterThan(stage.x + stage.width / 2)
  const node = page.getByRole('button', { name: 'A', exact: true })
  await pressAndMove(page, node, 30, 20)
  await setDocumentDir('rtl')
  await expect(graph).toHaveClass(/vw-rtl/)
  await expect(graph).not.toHaveAttribute('dir', /./)
  expect(await toolsCentre()).toBeLessThan(stage.x + stage.width / 2)
  await page.mouse.up()
  await expect(page.getByRole('status', { name: 'Move events', exact: true })).toHaveText('0')
  await setDocumentDir('ltr')
  await expect(graph).not.toHaveClass(/vw-rtl/)
  expect(await toolsCentre()).toBeGreaterThan(stage.x + stage.width / 2)

  // Gantt: the label column and the time origin move to the inline start of the new direction.
  await setDocumentDir(null)
  const { chart } = await openGanttFixture(page, '?auto=1')
  const gantt = page.locator('.vw-gantt')
  const geometry = async () => {
    const region = (await chart.boundingBox())!
    const label = (await chart.getByText('Row 1', { exact: true }).boundingBox())!
    const bar = (await ganttBar(chart, 'Task A').boundingBox())!
    return { middle: region.x + region.width / 2, label: label.x + label.width / 2, bar: bar.x + bar.width / 2 }
  }
  await expect(gantt).not.toHaveClass(/vw-rtl/)
  const ltr = await geometry()
  expect(ltr.label).toBeLessThan(ltr.middle)
  expect(ltr.bar).toBeGreaterThan(ltr.label)
  await setDocumentDir('rtl')
  await expect(gantt).toHaveClass(/vw-rtl/)
  await expect(async () => {
    const rtl = await geometry()
    expect(rtl.label).toBeGreaterThan(rtl.middle)
    expect(rtl.bar).toBeLessThan(rtl.label)
  }).toPass()
  await setDocumentDir('ltr')
  await expect(gantt).not.toHaveClass(/vw-rtl/)
  await expect(async () => {
    const back = await geometry()
    expect(back.label).toBeCloseTo(ltr.label, 0)
    expect(back.bar).toBeCloseTo(ltr.bar, 0)
  }).toPass()
  expect(errors).toEqual([])
})

test('a context menu during a graph node drag cancels the drag without a proposal', async ({ page }) => {
  const errors = pageErrors(page)
  for (const menu of [false, true]) {
    await openNetworkFixture(page, '?nodes=5&draggable=1' + (menu ? '&menu=1' : ''))
    const out = (name: string) => page.getByRole('status', { name, exact: true })
    const node = chainNode(page, 'N0001')
    const box = (await node.boundingBox())!
    const { x, y } = boxCenter(box)
    // macOS Control-click: a primary press followed by contextmenu; the native menu then swallows pointerup.
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 40, y + 30, { steps: 6 })
    await node.dispatchEvent('contextmenu', { button: 0, clientX: x + 40, clientY: y + 30 })
    await page.mouse.up()
    await expect(out('Move events')).toHaveText('0')
    await expect(out('Last move')).toHaveText('')
    await expect(out('Menu events')).toHaveText('0')
    // Without a gesture the menu request and a later drag behave as before.
    if (menu) {
      await node.click({ button: 'right' })
      await expect(out('Menu events')).toHaveText('1')
      expect(JSON.parse((await out('Last menu').textContent())!)).toMatchObject({ target: { kind: 'node', id: 'N0001' }, source: 'pointer' })
    }
    await dragBy(page, node, 40, 30)
    await expect(out('Move events')).toHaveText('1')
    await expect(out('Last move')).toHaveText('N0001')
  }
  expect(errors).toEqual([])
})

test('a context menu during a gantt bar drag cancels the drag without an edit proposal', async ({ page }) => {
  const errors = pageErrors(page)
  for (const search of ['', '?interactions=1']) {
    const { chart, out } = await openGanttFixture(page, search)
    const bar = chart.getByRole('button', { name: 'Task A 0–2', exact: true })
    // The accessible name follows the drag preview, so keep the element itself.
    const element = (await bar.elementHandle())!
    const box = (await bar.boundingBox())!
    const { x, y } = boxCenter(box)
    // macOS Control-click: a primary press followed by contextmenu; the native menu then swallows pointerup.
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 100, y, { steps: 6 })
    await element.dispatchEvent('contextmenu', { button: 0, clientX: x + 100, clientY: y })
    await page.mouse.up()
    await expect(out('Last edit')).toHaveText('')
    if (search) {
      // The menu request is still reported for the bar.
      expect(JSON.parse((await out('Last context menu').textContent())!)).toMatchObject({ target: { kind: 'bar', id: 'a' }, source: 'pointer' })
    }
    // Without a gesture a drag still proposes an edit.
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 100, y, { steps: 6 })
    await page.mouse.up()
    await expect(out('Last edit')).not.toHaveText('')
    expect(JSON.parse((await out('Last edit').textContent())!)).toMatchObject({ id: 'a', mode: 'move', source: 'pointer' })
  }
  expect(errors).toEqual([])
})

test('a context menu, new bars, a second pointer, pointercancel or lost capture during a constraint drag cancel it without a proposal', async ({ page }) => {
  const errors = pageErrors(page)
  for (const search of ['?constraints=1', '?constraints=1&interactions=1&pinch=1']) {
    const { chart, out } = await openGanttFixture(page, search)
    await allowSyntheticCapture(page)
    const finish = chart.getByRole('slider', { name: 'Finish no later than · Task A', exact: true })
    const element = (await finish.elementHandle())!
    const box = (await finish.boundingBox())!
    const { x, y } = boxCenter(box)
    /** Press the handle, drag 2 units to the right, run `interrupt`, then release. */
    const drag = async (interrupt: () => Promise<unknown>) => {
      await page.mouse.move(x, y)
      await page.mouse.down()
      await page.mouse.move(x + 100, y, { steps: 5 })
      await expect(finish).toHaveAttribute('aria-valuetext', '5')
      await interrupt()
      await expect(finish).toHaveAttribute('aria-valuetext', '3')
      await page.mouse.move(x + 150, y, { steps: 2 })
      await page.mouse.up()
      await expect(finish).toHaveAttribute('aria-valuetext', '3')
    }
    // macOS Control-click: the menu swallows pointerup.
    await drag(() => element.dispatchEvent('contextmenu', { button: 0, clientX: x + 100, clientY: y }))
    if (search.includes('interactions')) {
      // The menu is still reported for the bar.
      expect(JSON.parse((await out('Last context menu').textContent())!)).toMatchObject({ target: { kind: 'bar', id: 'a' }, source: 'pointer' })
      // A right-click on a handle starts no drag and reports the bar, its row and the time under the pointer, from which
      // an application can offer to add a constraint.
      await page.mouse.click(x + 2, y, { button: 'right' })
      const menu = JSON.parse((await out('Last context menu').textContent())!)
      expect(menu).toMatchObject({ target: { kind: 'bar', id: 'a' }, rowId: 'r1', source: 'pointer' })
      expect(menu.time).toBeCloseTo(3.04, 1)
    }
    // New bars from the parent, even equal ones, are new source data.
    await drag(() => page.getByRole('button', { name: 'Replace bars', exact: true }).dispatchEvent('click'))
    // The browser ends or takes the pointer.
    await drag(() => element.dispatchEvent('pointercancel', { pointerId: 1, pointerType: 'mouse', isPrimary: true, bubbles: true }))
    await drag(() => element.dispatchEvent('lostpointercapture', { pointerId: 1, pointerType: 'mouse', isPrimary: true, bubbles: true }))
    // Escape on the focused handle.
    await drag(() => page.keyboard.press('Escape'))
    await expect(out('Constraint edits')).toHaveText('0')

    // A second primary pointer (a pen) cannot take over or start another constraint drag.
    const fixed = (await chart.getByRole('slider', { name: 'Must start on · Task B', exact: true }).elementHandle())!
    const other = (await fixed.boundingBox())!
    await page.mouse.move(x, y)
    await page.mouse.down()
    await page.mouse.move(x + 100, y, { steps: 5 })
    await pen(fixed, 'pointerdown', other.x + other.width / 2, other.y + other.height / 2)
    await pen(fixed, 'pointermove', other.x + 200, other.y + other.height / 2)
    await pen(fixed, 'pointerup', other.x + 200, other.y + other.height / 2)
    await page.mouse.up()
    await expect(out('Constraint edits')).toHaveText('1')
    expect(JSON.parse((await out('Last constraint edit').textContent())!)).toEqual({ id: 'a', kind: 'finishNoLaterThan', before: 3, after: 5, source: 'pointer' })

    if (search.includes('pinch')) {
      // With pinchZoom a second touch starts a pinch, which cancels the constraint drag of the first touch.
      const touch = (type: string, pointerId: number, clientX: number, target = element) => target.dispatchEvent(type, {
        pointerId, pointerType: 'touch', isPrimary: pointerId === 11, button: type === 'pointermove' ? -1 : 0, buttons: type === 'pointerup' ? 0 : 1,
        clientX, clientY: y, bubbles: true, cancelable: true, composed: true,
      })
      await touch('pointerdown', 11, x)
      await touch('pointermove', 11, x + 100)
      await expect(finish).toHaveAttribute('aria-valuetext', '5')
      await touch('pointerdown', 12, x + 300)
      await expect(finish).toHaveAttribute('aria-valuetext', '3')
      await touch('pointermove', 11, x + 150)
      await touch('pointerup', 12, x + 300)
      await touch('pointerup', 11, x + 150)
      await expect(out('Constraint edits')).toHaveText('1')
    }
  }
  expect(errors).toEqual([])
})

test('fresh but equal inline graph groups, labels and avoidNodes keep a drag or pan alive; a real change still cancels', async ({ page }) => {
  const errors = pageErrors(page)
  for (const search of ['?chart=graph', '?chart=graph&collapsed=1']) {
    const { proposals, last, control } = await openGestureFixture(page, search)
    const stage = page.getByLabel('Gesture graph', { exact: true })
    const node = page.getByRole('button', { name: 'Node A', exact: true })
    // A drag across a parent render proposes exactly one move.
    await dragBy(page, node, 60, 40, () => control('Re-render').dispatchEvent('click'))
    await expect(proposals).toHaveText('1')
    await expect(last).toHaveText(/^move \{"id":"A"/)
    // A pan re-renders the parent on every viewport-change and still follows the pointer all the way.
    const before = (await node.boundingBox())!
    const area = (await stage.boundingBox())!
    await page.mouse.move(area.x + 12, area.y + area.height - 12)
    await page.mouse.down()
    await page.mouse.move(area.x + 72, area.y + area.height - 32, { steps: 6 })
    await page.mouse.up()
    const after = (await node.boundingBox())!
    expect(after.x - before.x).toBeCloseTo(60, 0)
    expect(after.y - before.y).toBeCloseTo(-20, 0)
    // A real change of the obstacle clearance mid-drag cancels the drag without a proposal.
    await dragBy(page, node, 60, 40, () => control('Change clearance').dispatchEvent('click'))
    await expect(proposals).toHaveText('1')
    // A real change of the groups mid-drag cancels the drag without a proposal.
    await dragBy(page, node, 60, 40, () => control('Change groups').dispatchEvent('click'))
    await expect(page.getByRole('button', { name: 'Move group First 1', exact: true })).toBeVisible()
    await expect(proposals).toHaveText('1')
  }
  expect(errors).toEqual([])
})

test('fresh but equal inline Gantt range, editBounds and tickSteps keep a drag alive; a real change still cancels', async ({ page }) => {
  const errors = pageErrors(page)
  const { proposals, last, control } = await openGestureFixture(page, '?chart=gantt')
  const bar = page.getByRole('button', { name: 'Task A 2–6', exact: true })
  await dragBy(page, bar, 50, 0, () => control('Re-render').dispatchEvent('click'))
  await expect(proposals).toHaveText('1')
  expect(JSON.parse((await last.textContent())!.slice('edit '.length))).toMatchObject({ id: 'a', after: { start: 7, end: 11 } })
  await dragBy(page, bar, 50, 0, () => control('Change range').dispatchEvent('click'))
  await expect(proposals).toHaveText('1')
  expect(errors).toEqual([])
})

test('a pen cannot start a second gesture while a mouse gesture is in flight', async ({ page }) => {
  const errors = pageErrors(page)
  // Graph: a pen press on the background during a mouse pan does not take the pan over.
  await openGestureFixture(page, '?chart=graph')
  await allowSyntheticCapture(page)
  const stage = page.getByLabel('Gesture graph', { exact: true })
  const node = page.getByRole('button', { name: 'Node A', exact: true })
  const area = (await stage.boundingBox())!
  const before = (await node.boundingBox())!
  const bottom = area.y + area.height - 12
  await page.mouse.move(area.x + 12, bottom)
  await page.mouse.down()
  await page.mouse.move(area.x + 22, bottom, { steps: 2 })
  await pen(stage, 'pointerdown', area.x + 300, bottom)
  await page.mouse.move(area.x + 72, bottom, { steps: 4 })
  await pen(stage, 'pointerup', area.x + 300, bottom)
  await page.mouse.up()
  expect((await node.boundingBox())!.x - before.x).toBeCloseTo(60, 0)

  // Gantt: a pen drag on a bar during a mouse create drag proposes nothing.
  const { proposals, last } = await openGestureFixture(page, '?chart=gantt')
  await allowSyntheticCapture(page)
  const row = (await page.locator('.vw-gantt-row').first().boundingBox())!
  const taskB = page.getByRole('button', { name: 'Task B 8–12', exact: true })
  const box = (await taskB.boundingBox())!
  const { x, y } = boxCenter(box)
  await page.mouse.move(row.x + 450, row.y + row.height / 2)
  await page.mouse.down()
  await page.mouse.move(row.x + 520, row.y + row.height / 2, { steps: 4 })
  // The accessible name would follow a drag preview, so keep the element itself.
  const element = (await taskB.elementHandle())!
  await pen(element, 'pointerdown', x, y)
  await pen(element, 'pointermove', x + 50, y)
  await pen(element, 'pointerup', x + 50, y)
  await page.mouse.up()
  await expect(proposals).toHaveText('1')
  await expect(last).toHaveText(/^create /)
  expect(errors).toEqual([])
})

test('changed dependencies cancel a cascading bar drag without a proposal', async ({ page }) => {
  const errors = pageErrors(page)
  const { proposals, last, control } = await openGestureFixture(page, '?chart=gantt&cascade=1')
  const bar = page.getByRole('button', { name: 'Task A 2–6', exact: true })
  await dragBy(page, bar, 50, 0, () => control('Change dependencies').dispatchEvent('click'))
  await expect(page.locator('.vw-gantt-cascade-preview')).toHaveCount(0)
  await expect(proposals).toHaveText('0')
  // Without a change the cascade is proposed with the drag.
  await dragBy(page, bar, 50, 0)
  await expect(proposals).toHaveText('1')
  expect(JSON.parse((await last.textContent())!.slice('edits '.length))).toMatchObject([{ id: 'a' }, { id: 'b', after: { start: 13, end: 17 } }])
  expect(errors).toEqual([])
})

test('graph gesture events: every gesture-start has exactly one gesture-end, on commit and on each cancellation', async ({ page }) => {
  const errors = pageErrors(page)
  await openNetworkFixture(page, '?nodes=6&draggable=1&connectable=1&boxselect=1&resizable=1&gestures=1')
  const log = page.getByRole('status', { name: 'Gesture events' })
  const open = page.getByRole('status', { name: 'Open gestures' })
  const all: string[] = []
  // Checks the events since the last check, keeps them for the final pairing and clears the log.
  async function expectEvents(expected: string[]) {
    await expect(log).toHaveText(expected.join(' | '))
    await expect(open).toHaveText('0')
    all.push(...expected)
    await page.evaluate(() => (window as any).__vw.clearGestureLog())
  }
  const button = (name: string) => page.getByRole('button', { name, exact: true })
  const pressAndMoveNode = (name: string) => pressAndMove(page, button(name), 30, 12)
  // The pointer ID of the last press, for synthetic cancellation events.
  await page.evaluate(() => document.addEventListener('pointerdown', event => { (window as any).__pointerId = event.pointerId }, true))
  const dispatch = (type: string) => page.evaluate((eventType) => {
    const target = document.querySelector('.vw-network-stage')!
    const event = eventType === 'contextmenu'
      ? new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2 })
      : new PointerEvent(eventType, { bubbles: true, pointerId: (window as any).__pointerId, isPrimary: true })
    target.dispatchEvent(event)
  }, type)

  // A committed drag: the proposal comes before the end.
  await pressAndMoveNode('N0002')
  await expect(log).toHaveText('start node-drag pointer')
  await expect(open).toHaveText('1')
  await page.mouse.up()
  await expect(page.getByRole('status', { name: 'Move events' })).toHaveText('1')
  await expectEvents(['start node-drag pointer', 'end node-drag pointer committed'])

  // Escape.
  await pressAndMoveNode('N0003')
  await page.keyboard.press('Escape')
  await expect(open).toHaveText('0')
  await page.mouse.up()
  await expectEvents(['start node-drag pointer', 'end node-drag pointer cancelled'])

  // New source data during the drag.
  await pressAndMoveNode('N0003')
  await page.evaluate(() => (window as any).__vw.refresh())
  await expect(open).toHaveText('0')
  await page.mouse.up()
  await expectEvents(['start node-drag pointer', 'end node-drag pointer cancelled'])

  // Pointer cancellation and a context menu during the drag.
  for (const type of ['pointercancel', 'contextmenu']) {
    await pressAndMoveNode('N0004')
    await dispatch(type)
    await expect(open).toHaveText('0')
    await page.mouse.up()
    await expectEvents(['start node-drag pointer', 'end node-drag pointer cancelled'])
  }
  await expect(page.getByRole('status', { name: 'Move events' })).toHaveText('1')

  // A camera method during the drag.
  await pressAndMoveNode('N0004')
  await page.evaluate(() => (window as any).__vw.graph().zoom(1.1))
  await page.mouse.up()
  await expectEvents(['start node-drag pointer', 'end node-drag pointer cancelled'])

  // Background pan and box selection.
  const stage = (await page.getByLabel('Network graph', { exact: true }).boundingBox())!
  await page.mouse.move(stage.x + 6, stage.y + 6)
  await page.mouse.down()
  await page.mouse.move(stage.x + 40, stage.y + 30, { steps: 3 })
  await page.mouse.up()
  await expectEvents(['start pan pointer', 'end pan pointer committed'])
  await page.keyboard.down('Shift')
  await page.mouse.move(stage.x + 6, stage.y + 6)
  await page.mouse.down()
  await page.mouse.move(stage.x + 60, stage.y + 50, { steps: 3 })
  await page.mouse.up()
  await page.keyboard.up('Shift')
  await expectEvents(['start box-select pointer', 'end box-select pointer committed'])

  // A pointer connection dragged from one handle to another, and a keyboard connection armed and cancelled.
  const from = await centerOf(button('Start connection from N0000'))
  const to = await centerOf(button('Start connection from N0005'))
  await pressAndMoveTo(page, from, to, 5)
  await expect(log).toHaveText('start connect pointer')
  await page.mouse.up()
  await expectEvents(['start connect pointer', 'end connect pointer committed'])
  await page.getByRole('button', { name: 'Start connection from N0001', exact: true }).focus()
  await page.keyboard.press('Enter')
  await expect(log).toHaveText('start connect keyboard')
  await page.keyboard.press('Escape')
  await expectEvents(['start connect keyboard', 'end connect keyboard cancelled'])

  // Keyboard moves are single proposals, not gestures.
  await page.getByRole('button', { name: 'N0001', exact: true }).focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('status', { name: 'Move events' })).toHaveText('2')
  await expect(log).toHaveText('')

  // A resize handle drag. Selecting the node first is a press without movement: a committed drag without a proposal.
  await page.getByRole('button', { name: 'N0002', exact: true }).click()
  await expectEvents(['start node-drag pointer', 'end node-drag pointer committed'])
  const corner = await centerOf(button('Resize N0002 · bottom right'))
  await dragBy(page, corner, 30, 20, { steps: 3 })
  await expectEvents(['start node-resize pointer', 'end node-resize pointer committed'])

  // Over the whole session, each start is followed by exactly one end of the same gesture before the next start.
  for (let i = 0; i < all.length; i += 2) {
    expect(all[i]).toMatch(/^start /)
    expect(all[i + 1]).toMatch(new RegExp('^end ' + all[i]!.slice('start '.length) + ' (committed|cancelled)$'))
  }
  expect(errors).toEqual([])
})

test('graph resize, waypoint and reconnect drags end cancelled without a proposal on Escape, new source data and pointercancel', async ({ page }) => {
  const errors = pageErrors(page)
  await openNetworkFixture(page, '?nodes=6&draggable=1&resizable=1&editableedges=1&reconnectable=1&gestures=1')
  const button = (name: string) => page.getByRole('button', { name, exact: true })
  const log = page.getByRole('status', { name: 'Gesture events' })
  const open = page.getByRole('status', { name: 'Open gestures' })
  const proposals = page.getByRole('status', { name: 'Edit proposals' })
  await page.evaluate(() => document.addEventListener('pointerdown', event => { (window as any).__pointerId = event.pointerId }, true))
  const cancellations: Record<string, () => Promise<void>> = {
    Escape: () => page.keyboard.press('Escape'),
    'new source data': () => page.evaluate(() => (window as any).__vw.refresh()),
    pointercancel: () => page.evaluate(() => {
      const event = new PointerEvent('pointercancel', { bubbles: true, pointerId: (window as any).__pointerId, isPrimary: true })
      document.querySelector('.vw-network-stage')!.dispatchEvent(event)
    }),
  }
  // Each drag: how to start it (selecting its node or edge first), its gesture kind and what its preview changes.
  const drags = [
    {
      kind: 'node-resize', handle: 'Resize N0002 · bottom right', select: () => button('N0002').click(),
      preview: () => chainNode(page, 'N0002').locator('rect').first().getAttribute('width'),
    },
    {
      kind: 'edge-reshape', handle: 'Add waypoint 1 · e3', select: () => button('Select edge e3').press('Enter'),
      preview: () => page.locator('.vw-edge-hit[data-vw-edge="e3"]').getAttribute('d'),
    },
    {
      kind: 'reconnect', handle: 'Reconnect target of e3', select: () => button('Select edge e3').press('Enter'),
      preview: () => page.locator('.vw-connection-preview').count().then(String),
    },
  ]
  for (const drag of drags) {
    for (const [name, cancel] of Object.entries(cancellations)) {
      await drag.select()
      await page.evaluate(() => (window as any).__vw.clearGestureLog())
      const before = await drag.preview()
      await pressAndMove(page, button(drag.handle), 30, 25)
      await expect(log, `${drag.kind} ${name}`).toHaveText(`start ${drag.kind} pointer`)
      await expect.poll(drag.preview, `${drag.kind} ${name} preview`).not.toBe(before)
      await cancel()
      await expect(open, `${drag.kind} ${name}`).toHaveText('0')
      await expect(log).toHaveText(`start ${drag.kind} pointer | end ${drag.kind} pointer cancelled`)
      await expect.poll(drag.preview, `${drag.kind} ${name} preview`).toBe(before)
      await page.mouse.up()
      await expect(proposals, `${drag.kind} ${name}`).toHaveText('')
    }
  }
  expect(errors).toEqual([])
})

test('Gantt: turning summaryDependencies off cancels a connection armed from a rollup bar', async ({ page }) => {
  const errors = pageErrors(page)
  const { chart, out } = await openGanttFixture(page, '?summaries=1')
  const fromPhase = chart.getByRole('button', { name: 'Start dependency from finish of Phase', exact: true })
  await fromPhase.press('Enter')
  await expect(fromPhase).toHaveAttribute('aria-pressed', 'true')
  await expect(chart.getByRole('button', { name: 'Connect dependency to start of Task B', exact: true })).toHaveCount(1)

  // The summary row is no longer a dependency end: the armed connection ends without a proposal.
  await page.getByRole('button', { name: 'Turn summary links off', exact: true }).click()
  await expect(out('Last edit cancel')).toHaveText('{"reason":"source-changed","barIds":["p"]}')
  await expect(fromPhase).toHaveCount(0)
  const taskB = chart.getByRole('button', { name: 'Start dependency from start of Task B', exact: true })
  await expect(taskB).toHaveCount(1)
  await taskB.press('Enter')
  await expect(taskB).toHaveAttribute('aria-pressed', 'true')
  await expect(out('Connections')).toHaveText('0')
  expect(errors).toEqual([])
})

test('Gantt: a zoom change cancels a progress drag as a source change, while a bar drag refuses the zoom buttons', async ({ page }) => {
  const errors = pageErrors(page)
  const { chart, out } = await openGanttFixture(page, '?interactions=1&cancels=1')
  const zoom = page.getByRole('group', { name: 'Timeline zoom', exact: true })
  const slider = chart.getByRole('slider', { name: 'Progress of Task A', exact: true })
  const handle = (await slider.boundingBox())!
  const { x, y } = boxCenter(handle)
  await page.mouse.move(x, y)
  await page.mouse.down()
  await page.mouse.move(x + 30, y, { steps: 3 })
  // The zoom buttons change the time axis under the pointer: the progress preview ends without a proposal.
  await zoom.getByRole('button', { name: 'Zoom in', exact: true }).dispatchEvent('click')
  await expect(zoom.locator('output')).toHaveText('135%')
  await expect(out('Last edit cancel')).toHaveText('{"reason":"source-changed","barIds":["a"]}')
  await page.mouse.move(x + 60, y, { steps: 3 })
  await page.mouse.up()
  await expect(out('Last progress edit')).toHaveText('')
  // A bar drag scrolls at the edges, so the zoom buttons wait for it instead of cancelling it.
  const taskB = chart.getByRole('button', { name: /^Task B \d/ })
  await pressAndMove(page, taskB, 70, 0, 4)
  await expect(taskB).toHaveClass(/\bvw-is-dragging\b/)
  await zoom.getByRole('button', { name: 'Zoom out', exact: true }).dispatchEvent('click')
  await expect(zoom.locator('output')).toHaveText('135%')
  await page.mouse.up()
  await expect(out('Last edit')).toContainText('"id":"b"')
  expect(errors).toEqual([])
})
