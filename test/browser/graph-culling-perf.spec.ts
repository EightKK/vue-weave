// Correctness of NetworkGraph's culled rendering of a large graph with orthogonal edges that avoid the nodes. With
// `cullOffscreen` the component reuses the routes of unchanged edges between saved layouts; what it draws must stay
// what the same graph draws without culling. These tests compare geometry only and never gate on timings.
import { expect, test, dragBy, fixtureStatus, pageErrors, serveFixture, type Page } from './support'

async function openCulling(page: Page, search: string) {
  await serveFixture(page, 'graph-culling-test', 'graph-culling.html')
  await page.goto('/graph-culling-test/' + search)
  await expect(page.getByLabel('Network graph', { exact: true })).toBeVisible({ timeout: 20_000 })
}

// The path data of every rendered edge, by edge ID.
async function renderedEdges(page: Page): Promise<Map<string, string>> {
  const entries = await page.locator('.vw-edge-hit').evaluateAll(list => list.map(element => [element.getAttribute('data-vw-edge')!, element.getAttribute('d')!]))
  return new Map(entries as [string, string][])
}

async function focusNode(page: Page, id: string) {
  await page.evaluate(node => (window as any).__vw.graph().focusNode(node, { scale: 1 }), id)
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
}

// The geometry the same graph draws without culling, every edge in the DOM.
async function reference(page: Page, positions = '') {
  const other = await page.context().newPage()
  try {
    await openCulling(other, '?cull=0' + (positions ? '&positions=' + positions : ''))
    const edges = await renderedEdges(other)
    const svg = await other.evaluate(() => (window as any).__vw.graph().exportSvg() as string)
    return { edges, svg }
  } finally {
    await other.close()
  }
}

function expectSameEdges(rendered: Map<string, string>, expected: Map<string, string>) {
  expect(rendered.size).toBeGreaterThan(0)
  const mismatched = [...rendered].filter(([id, path]) => expected.get(id) !== path).map(([id]) => id)
  expect(mismatched).toEqual([])
}

test('a panned culled graph draws the newly visible edges as the unculled graph does, and exports every edge', async ({ page }) => {
  const errors = pageErrors(page)
  const full = await reference(page)
  expect(full.edges.size).toBe(29 * 30 + 30 * 29 + 116)
  await openCulling(page, '?cull=1')
  await focusNode(page, 'N0000')
  const first = await renderedEdges(page)
  expect(first.size).toBeLessThan(full.edges.size)
  expectSameEdges(first, full.edges)

  // The far corner of the graph: none of its edges were rendered before.
  await focusNode(page, 'N0899')
  const far = await renderedEdges(page)
  expect(far.has('d899') && far.has('r899')).toBe(true)
  expect([...far.keys()].filter(id => first.has(id))).toEqual([])
  expectSameEdges(far, full.edges)

  // Export does not depend on culling: the document equals the unculled graph's and holds every edge path.
  const svg = await page.evaluate(() => (window as any).__vw.graph().exportSvg() as string)
  expect(svg).toBe(full.svg)
  const missing = [...full.edges].filter(([, path]) => !svg.includes(`d="${path}"`)).map(([id]) => id)
  expect(missing).toEqual([])
  expect(errors).toEqual([])
})

test('dragging a node of a culled graph updates its edges and keeps every other route as the unculled graph draws it', async ({ page }) => {
  const errors = pageErrors(page)
  await openCulling(page, '?cull=1')
  await focusNode(page, 'N0031')
  const before = await renderedEdges(page)
  const incident = ['d31', 'd32', 'r31', 'r61']
  for (const id of incident) expect(before.has(id), id).toBe(true)

  await dragBy(page, page.getByRole('button', { name: 'N0031', exact: true }), 70, 45)
  await expect(fixtureStatus(page, 'Move events')).toHaveText('1')
  const positions = (await fixtureStatus(page, 'Positions').textContent())!
  expect(positions).toMatch(/^N0031:/)
  const moved = await renderedEdges(page)
  for (const id of incident) expect(moved.get(id), id).not.toBe(before.get(id))

  // Another node dropped onto the long-edge lane of an edge it does not touch (the edges three columns long run in
  // lanes the layout drew between the columns): that route must now go around the node, as routing the whole graph
  // again draws it. Then the far corner, which the moves did not render.
  const other = page.getByRole('button', { name: 'N0002', exact: true })
  const crossed = await page.locator('svg').first().evaluate(svg => {
    const view = svg.getBoundingClientRect()
    const inside = (point: DOMPoint) => point.x > view.left + 120 && point.x < view.right - 120 && point.y > view.top + 80 && point.y < view.bottom - 80
    for (const path of svg.querySelectorAll<SVGPathElement>('.vw-edge-hit[data-vw-edge^="s"]')) {
      const length = path.getTotalLength()
      // A point at least 150 units from both ends, so the node lands on the lane and not on an end node's side.
      for (let at = 150; at < length - 150; at += 20) {
        const local = path.getPointAtLength(at)
        const point = new DOMPoint(local.x, local.y).matrixTransform(path.getScreenCTM()!)
        if (inside(point)) return { id: path.getAttribute('data-vw-edge')!, x: point.x, y: point.y }
      }
    }
    return undefined
  })
  expect(crossed).toBeTruthy()
  const start = (await other.boundingBox())!
  await dragBy(page, other, crossed!.x - (start.x + start.width / 2), crossed!.y - (start.y + start.height / 2))
  await expect(fixtureStatus(page, 'Move events')).toHaveText('2')
  expect((await renderedEdges(page)).get(crossed!.id)).not.toBe(moved.get(crossed!.id))
  const saved = (await fixtureStatus(page, 'Positions').textContent())!
  const near = await renderedEdges(page)
  await focusNode(page, 'N0899')
  const far = await renderedEdges(page)

  const full = await reference(page, saved)
  expectSameEdges(near, full.edges)
  expectSameEdges(far, full.edges)
  expect(await page.evaluate(() => (window as any).__vw.graph().exportSvg() as string)).toBe(full.svg)
  expect(errors).toEqual([])
})

test('source data that changes during a drag of a culled graph cancels the gesture', async ({ page }) => {
  const errors = pageErrors(page)
  await openCulling(page, '?cull=1')
  await focusNode(page, 'N0031')
  const node = page.getByRole('button', { name: 'N0031', exact: true })
  const box = (await node.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 40, box.y + box.height / 2 + 30, { steps: 4 })
  // The parent saves a position for another node mid-gesture: a new saved layout, which cancels the drag.
  await page.evaluate(() => (window as any).__vw.place('N0500', 9000, 40))
  await expect(fixtureStatus(page, 'Positions')).toHaveText('N0500:9000:40')
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 60, { steps: 2 })
  await page.mouse.up()
  // The cancelled drag proposes nothing on release.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  await expect(fixtureStatus(page, 'Move events')).toHaveText('0')
  await expect(fixtureStatus(page, 'Positions')).toHaveText('N0500:9000:40')
  expect(errors).toEqual([])
})
