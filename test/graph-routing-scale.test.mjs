import assert from 'node:assert/strict'
import { test } from 'node:test'
import { layoutLayeredGraph, routeGraphEdges } from '@eightkk/vue-weave/core'
import { byId, polyline } from './helpers/builders.mjs'
import { seededRandom } from './helpers/seeded.mjs'

// Whether an axis-aligned segment passes through the interior of a rectangle grown by `margin`.
function crosses(a, b, box, margin = 0) {
  const x1 = Math.min(a.x, b.x), x2 = Math.max(a.x, b.x), y1 = Math.min(a.y, b.y), y2 = Math.max(a.y, b.y)
  const e = 1e-6
  return x1 < box.x + box.width + margin - e && box.x - margin + e < x2 && y1 < box.y + box.height + margin - e && box.y - margin + e < y2
    // A segment along one axis only enters when it lies strictly inside along the other.
    && (x1 !== x2 || (box.x - margin + e < x1 && x1 < box.x + box.width + margin - e))
    && (y1 !== y2 || (box.y - margin + e < y1 && y1 < box.y + box.height + margin - e))
}

function crossings(points, boxes, margin = 0) {
  let count = 0
  for (const box of boxes) {
    for (let i = 1; i < points.length; i++) if (crosses(points[i - 1], points[i], box, margin)) count++
  }
  return count
}

function assertOrthogonal(points) {
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1], b = points[i]
    assert.ok(a.x === b.x || a.y === b.y, `segment ${i} is not axis-aligned: ${JSON.stringify([a, b])}`)
  }
}

test('routeGraphEdges avoidNodes routes a layered graph of 3,000 nodes around every box', () => {
  const nodes = [], edges = []
  const { random } = seededRandom(7)
  for (let rank = 0; rank < 30; rank++) for (let i = 0; i < 100; i++) nodes.push({ id: `n${rank}_${i}` })
  for (let rank = 1; rank < 30; rank++) {
    for (let i = 0; i < 100; i++) {
      edges.push({ id: `e${rank}_${i}`, from: `n${rank - 1}_${Math.floor(random() * 100)}`, to: `n${rank}_${i}` })
      if (i % 10 === 0 && rank > 3) edges.push({ id: `l${rank}_${i}`, from: `n${rank - 3}_${Math.floor(random() * 100)}`, to: `n${rank}_${i}` })
    }
  }
  const layout = layoutLayeredGraph(nodes, edges)
  const map = byId(nodes)
  const started = performance.now()
  const routed = routeGraphEdges(layout, edges, map, { style: 'orthogonal', avoidNodes: true })
  const elapsed = performance.now() - started
  assert.ok(elapsed < 20_000, `routing took ${Math.round(elapsed)} ms`)
  // Check a sample of edges against every box except their own.
  const boxes = [...layout.boxes]
  for (const edge of edges.filter((_, i) => i % 50 === 0)) {
    const points = polyline(routed.paths.get(edge.id))
    assertOrthogonal(points)
    assert.equal(crossings(points, boxes.filter(([id]) => id !== edge.from && id !== edge.to).map(([, box]) => box)), 0, edge.id)
  }
})
