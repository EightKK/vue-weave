import assert from 'node:assert/strict'
import { test } from 'node:test'
import { graphNodesInPolygon, graphPointInPolygon, layoutLayeredGraph } from 'vue-weave/core'
import { graphNodesInPolygon as rootNodesInPolygon, graphPointInPolygon as rootPointInPolygon } from 'vue-weave'

const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]

test('graphPointInPolygon uses the even-odd rule and counts the outline as inside', () => {
  assert.equal(rootPointInPolygon, graphPointInPolygon)
  assert.equal(graphPointInPolygon({ x: 5, y: 5 }, square), true)
  assert.equal(graphPointInPolygon({ x: 11, y: 5 }, square), false)
  assert.equal(graphPointInPolygon({ x: -0.001, y: 5 }, square), false)
  // Vertices and edges are inside, in either winding order.
  assert.equal(graphPointInPolygon({ x: 0, y: 0 }, square), true)
  assert.equal(graphPointInPolygon({ x: 10, y: 4 }, [...square].reverse()), true)
  // A concave outline (a U shape) excludes its notch.
  const u = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 7 }, { x: 7, y: 7 }, { x: 7, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
  assert.equal(graphPointInPolygon({ x: 5, y: 3 }, u), false)
  assert.equal(graphPointInPolygon({ x: 5, y: 9 }, u), true)
  assert.equal(graphPointInPolygon({ x: 1, y: 3 }, u), true)
  // A self-intersecting bow tie: both lobes are inside, outside the crossing they are not.
  const bowtie = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }]
  assert.equal(graphPointInPolygon({ x: 2, y: 5 }, bowtie), true)
  assert.equal(graphPointInPolygon({ x: 5, y: 2 }, bowtie), false)
  // An outline that winds twice around a region leaves it outside (even-odd).
  const twice = [...square, { x: 0, y: 0 }, ...square]
  assert.equal(graphPointInPolygon({ x: 5, y: 5 }, twice), false)
})

test('graphPointInPolygon validates input and treats degenerate outlines as empty', () => {
  assert.equal(graphPointInPolygon({ x: 0, y: 0 }, []), false)
  assert.equal(graphPointInPolygon({ x: 0, y: 0 }, [{ x: 0, y: 0 }, { x: 1, y: 1 }]), false)
  assert.throws(() => graphPointInPolygon({ x: Number.NaN, y: 0 }, square), RangeError)
  assert.throws(() => graphPointInPolygon({ x: 0, y: 0 }, [...square, { x: Infinity, y: 0 }]), RangeError)
  assert.throws(() => graphPointInPolygon({ x: 0, y: 0 }, 'square'), RangeError)
  // Validation applies before the length check, so a bad point is reported for short outlines too.
  assert.throws(() => graphPointInPolygon({ x: 0, y: 0 }, [{ x: 0, y: Number.NaN }]), RangeError)
})

test('graphNodesInPolygon selects box centres in map order without mutating its inputs', () => {
  assert.equal(rootNodesInPolygon, graphNodesInPolygon)
  const boxes = new Map([
    ['c', { x: 20, y: 0, width: 10, height: 10, rank: 0 }],
    ['a', { x: 0, y: 0, width: 10, height: 10, rank: 0 }],
    // The polygon reaches into this box but not to its centre.
    ['b', { x: 8, y: 8, width: 20, height: 20, rank: 0 }],
  ])
  const triangle = [{ x: -5, y: -5 }, { x: 60, y: -5 }, { x: -5, y: 20 }]
  const before = JSON.stringify([...boxes])
  assert.deepEqual(graphNodesInPolygon(boxes, triangle), ['c', 'a'])
  assert.equal(JSON.stringify([...boxes]), before)
  assert.deepEqual(graphNodesInPolygon(boxes, triangle.slice(0, 2)), [])
  assert.deepEqual(graphNodesInPolygon(new Map(), triangle), [])
  assert.throws(() => graphNodesInPolygon(boxes, [...triangle, { x: 0, y: Number.NaN }]), RangeError)
  assert.throws(() => graphNodesInPolygon(new Map([['x', { x: Number.NaN, y: 0, width: 1, height: 1 }]]), triangle), RangeError)
  // Works on a laid-out graph, including a long chain, in loops.
  const ids = Array.from({ length: 2000 }, (_, i) => 'n' + i)
  const layout = layoutLayeredGraph(ids.map(id => ({ id, label: id })), ids.slice(1).map((id, i) => ({ id: 'e' + i, from: ids[i], to: id })))
  const all = [{ x: -1, y: -1 }, { x: layout.width + 1, y: -1 }, { x: layout.width + 1, y: layout.height + 1 }, { x: -1, y: layout.height + 1 }]
  assert.equal(graphNodesInPolygon(layout.boxes, all).length, ids.length)
})
