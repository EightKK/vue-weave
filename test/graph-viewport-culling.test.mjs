import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  layoutLayeredGraph, cullGraphElements, graphCameraAt, graphLayoutBounds, graphPathBounds, graphRectsIntersect, graphViewportRect,
} from '@eightkk/vue-weave/core'
import { h } from 'vue'
import { NetworkGraph } from '@eightkk/vue-weave'
import { renderComponent } from './helpers/ssr.mjs'

const nodes = (...ids) => ids.map(id => ({ id, label: id }))
const edges = (...pairs) => pairs.map(([from, to], i) => ({ id: String(i), from, to }))

function bigGraph(count) {
  const n = nodes(...Array.from({ length: count }, (_, i) => 'n' + i))
  return { nodes: n, edges: edges(...n.slice(1).map((node, i) => [n[i].id, node.id])) }
}

const renderedNodeCount = html => (html.match(/class="vw-network-node/g) ?? []).length

test('viewport rectangles invert the camera transform and grow by a screen-space overscan', () => {
  const camera = { x: -200, y: -100, scale: 2 }
  assert.deepEqual(graphViewportRect(camera, { width: 400, height: 300 }), { x: 100, y: 50, width: 200, height: 150 })
  assert.deepEqual(graphViewportRect(camera, { width: 400, height: 300 }, 20), { x: 90, y: 40, width: 220, height: 170 })
  assert.throws(() => graphViewportRect({ x: 0, y: 0, scale: 0 }, { width: 1, height: 1 }), RangeError)
  assert.throws(() => graphViewportRect(camera, { width: NaN, height: 1 }), RangeError)
  const center = graphCameraAt({ x: 100, y: 50 }, { width: 400, height: 300 }, 2)
  const rect = graphViewportRect(center, { width: 400, height: 300 })
  assert.equal(rect.x + rect.width / 2, 100)
  assert.equal(rect.y + rect.height / 2, 50)
})

test('rectangle intersection needs overlapping interiors: touching edges and corners do not count', () => {
  const a = { x: 0, y: 0, width: 10, height: 10 }
  const both = b => {
    const result = graphRectsIntersect(a, b)
    assert.equal(graphRectsIntersect(b, a), result, 'symmetric')
    return result
  }
  // Corner and edge contact.
  assert.equal(both({ x: 10, y: 10, width: 5, height: 5 }), false)
  assert.equal(both({ x: -5, y: -5, width: 5, height: 5 }), false)
  assert.equal(both({ x: 10, y: 0, width: 5, height: 5 }), false)
  assert.equal(both({ x: 0, y: 10, width: 5, height: 5 }), false)
  assert.equal(both({ x: 0, y: -5, width: 10, height: 5 }), false)
  // Separated.
  assert.equal(both({ x: 10.5, y: 0, width: 5, height: 5 }), false)
  assert.equal(both({ x: 0, y: -8, width: 5, height: 7 }), false)
  // Overlapping, containing and equal; a tiny overlap counts (no tolerance).
  assert.equal(both({ x: 9.999, y: 0, width: 5, height: 5 }), true)
  assert.equal(both({ x: 2, y: 2, width: 3, height: 3 }), true)
  assert.equal(both({ x: -1, y: -1, width: 12, height: 12 }), true)
  assert.equal(both({ ...a }), true)
  // Zero-size rectangles: a point or segment through the interior intersects; one on the border does not.
  assert.equal(both({ x: 5, y: 5, width: 0, height: 0 }), true)
  assert.equal(both({ x: 5, y: -3, width: 0, height: 20 }), true)
  assert.equal(both({ x: 0, y: 0, width: 0, height: 0 }), false)
  assert.equal(both({ x: 10, y: 5, width: 0, height: 0 }), false)
  assert.equal(both({ x: 0, y: 0, width: 0, height: 10 }), false)
  assert.equal(graphRectsIntersect({ x: 1, y: 1, width: 0, height: 0 }, { x: 1, y: 1, width: 0, height: 0 }), false)
  assert.equal(graphRectsIntersect({ x: 0, y: 2, width: 4, height: 0 }, { x: 2, y: 0, width: 0, height: 4 }), true)
})

test('culling keeps elements whose bounds only touch the view, so their strokes still draw', () => {
  const view = { x: 0, y: 0, width: 100, height: 100 }
  const bounds = {
    nodes: new Map([['edge', { x: 100, y: 10, width: 20, height: 20 }], ['corner', { x: -20, y: -20, width: 20, height: 20 }], ['out', { x: 101, y: 0, width: 5, height: 5 }]]),
    edges: new Map([['line', { x: 0, y: 100, width: 50, height: 0 }], ['far', { x: 0, y: 100.5, width: 50, height: 0 }]]),
  }
  const visible = cullGraphElements(bounds, view)
  assert.deepEqual([...visible.nodes], ['edge', 'corner'])
  assert.deepEqual([...visible.edges], ['line'])
})

test('path bounds cover absolute and relative commands, curves, arcs and malformed input', () => {
  assert.deepEqual(graphPathBounds('M 10 20 C 30 0, 50 80, 60 40'), { x: 10, y: 0, width: 50, height: 80 })
  assert.deepEqual(graphPathBounds('M 5 5 H 25 V 45 H 15'), { x: 5, y: 5, width: 20, height: 40 })
  assert.deepEqual(graphPathBounds('m 10 10 l 5 5 h -20 v 10'), { x: -5, y: 10, width: 20, height: 15 })
  assert.deepEqual(graphPathBounds('M 0 0 L 4 4 8 0'), { x: 0, y: 0, width: 8, height: 4 })
  assert.deepEqual(graphPathBounds('M 10 10 A 5 5 0 0 1 20 10'), { x: 10, y: 5, width: 10, height: 5 })
  assert.equal(graphPathBounds(''), undefined)
  assert.throws(() => graphPathBounds('M 1'), /Invalid SVG path/)
  assert.throws(() => graphPathBounds('M 0 0 X 3 3'), /Unsupported/)
})

test('culling keeps boxes and edge paths that cross the viewport and any forced IDs', () => {
  const layout = layoutLayeredGraph(nodes('a', 'b', 'c', 'd'), edges(['a', 'b'], ['b', 'c'], ['c', 'd']))
  const bounds = graphLayoutBounds(layout)
  assert.equal(bounds.nodes.size, 4)
  assert.equal(bounds.edges.size, 3)
  const a = layout.boxes.get('a')
  // A window between a and b shows the connecting edge but neither node box.
  const gap = { x: a.x + a.width + 5, y: a.y + a.height / 2, width: 5, height: 1 }
  const between = cullGraphElements(bounds, gap)
  assert.deepEqual([...between.nodes], [])
  assert.deepEqual([...between.edges], ['0'])
  const first = cullGraphElements(bounds, { x: a.x, y: a.y, width: 1, height: 1 })
  assert.deepEqual([...first.nodes], ['a'])
  const kept = cullGraphElements(bounds, { x: a.x, y: a.y, width: 1, height: 1 }, { nodes: ['d', 'missing'], edges: ['2'] })
  assert.deepEqual([...kept.nodes].sort(), ['a', 'd'])
  assert.ok(kept.edges.has('2'))
  const everything = cullGraphElements(bounds, { x: -1e6, y: -1e6, width: 2e6, height: 2e6 })
  assert.equal(everything.nodes.size, 4)
})

test('long edge routes are culled by their full path, not only their end points', () => {
  const layout = layoutLayeredGraph(nodes('a', 'b', 'c', 'd'), edges(['a', 'b'], ['b', 'c'], ['c', 'd'], ['a', 'd']))
  const bounds = graphLayoutBounds(layout)
  const long = bounds.edges.get('3')
  const middle = { x: long.x + long.width / 2, y: long.y, width: 1, height: long.height }
  assert.ok(cullGraphElements(bounds, middle).edges.has('3'))
})

test('server rendering with cullOffscreen is deterministic and renders only the initial viewport', async () => {
  const graph = bigGraph(400)
  const render = (extra = {}) => renderComponent(NetworkGraph, { ...graph, cullOffscreen: true, ...extra })
  const first = await render(), second = await render()
  assert.equal(first, second)
  const all = await renderComponent(NetworkGraph, graph)
  assert.equal(renderedNodeCount(all), 400)
  const culled = renderedNodeCount(first)
  assert.ok(culled > 0 && culled < 400, 'rendered ' + culled)
  assert.ok(!first.includes('aria-label="n399"'))
  const selected = await render({ selectedId: 'n399' })
  assert.match(selected, /aria-label="n399"/)
  // The initial camera centers the selected node, so the window moves but stays small.
  assert.ok(renderedNodeCount(selected) < 400)
  assert.ok(!selected.includes('aria-label="n0"'))
  const wide = await render({ cullOverscan: 1e6 })
  assert.equal(renderedNodeCount(wide), 400)
})
