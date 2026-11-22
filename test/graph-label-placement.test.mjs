import assert from 'node:assert/strict'
import { test } from 'node:test'
import { layoutLayeredGraph, placeGraphEdgeLabels, renderGraphSvg, routeGraphEdges } from '@eightkk/vue-weave/core'
import { NetworkGraph } from '@eightkk/vue-weave'
import { byId, deepFreeze } from './helpers/builders.mjs'
import { renderComponent } from './helpers/ssr.mjs'

// The estimated label box around an anchor with the default options: 11-unit font, 0.6 glyph width, 1.25 line height,
// the baseline 0.35 × 11 below the box centre.
function labelBox(anchor, text, { fontSize = 11, glyphWidth = 0.6 } = {}) {
  const width = [...text].length * glyphWidth * fontSize, height = fontSize * 1.25
  const cy = anchor.y - 0.35 * fontSize
  return { x: anchor.x - width / 2, y: cy - height / 2, width, height }
}
const overlaps = (a, b) => Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x) > 1e-6
  && Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y) > 1e-6

function graph(nodes, edges, positions, options = {}) {
  const layout = layoutLayeredGraph(nodes, edges, { nodeWidth: 100, nodeHeight: 40 })
  const boxes = new Map([...layout.boxes].map(([id, box]) => [id, { ...box, ...positions.get(id) }]))
  const placed = { ...layout, boxes, width: 1000, height: 600 }
  return routeGraphEdges(placed, edges, byId(nodes), options)
}

// A hub with spokes to nodes packed around it: the midpoints of the short spokes fall on or between other boxes.
function hub() {
  const nodes = [{ id: 'hub' }]
  const edges = []
  const positions = new Map([['hub', { x: 450, y: 280 }]])
  const ring = [[300, 140], [450, 120], [600, 140], [640, 280], [600, 420], [450, 440], [300, 420], [260, 280]]
  ring.forEach(([x, y], i) => {
    nodes.push({ id: 'n' + i })
    positions.set('n' + i, { x, y })
    edges.push({ id: 'e' + i, from: 'hub', to: 'n' + i, label: 'spoke ' + i })
  })
  // A crowding node right on the midpoint of the hub-n1 spoke.
  nodes.push({ id: 'block' })
  positions.set('block', { x: 450, y: 205 })
  return { nodes, edges, layout: graph(nodes, edges, positions, { style: 'straight' }) }
}

test('placeGraphEdgeLabels moves labels off node boxes when there is space', () => {
  const { edges, layout } = hub()
  const before = edges.filter(edge => [...layout.boxes.values()].some(box => overlaps(box, labelBox(layout.edgeLabels.get(edge.id), edge.label))))
  assert.ok(before.length > 0, 'some midpoint labels overlap a node')
  const placed = placeGraphEdgeLabels(layout, edges)
  for (const edge of edges) {
    const box = labelBox(placed.edgeLabels.get(edge.id), edge.label)
    for (const [id, node] of placed.boxes) assert.ok(!overlaps(box, node), edge.id + ' overlaps ' + id)
  }
  // Paths, boxes and size are kept.
  assert.equal(placed.paths, layout.paths)
  assert.equal(placed.boxes, layout.boxes)
  assert.equal(placed.width, layout.width)
})

test('placeGraphEdgeLabels keeps labels of a dense bundle apart', () => {
  // Six parallel edges stacked 12 units apart: the default labels sit on top of each other's text.
  const nodes = [{ id: 'a' }, { id: 'b' }]
  const edges = Array.from({ length: 6 }, (_, i) => ({ id: 'p' + i, from: 'a', to: 'b', label: 'link ' + i }))
  const layout = graph(nodes, edges, new Map([['a', { x: 40, y: 200 }], ['b', { x: 700, y: 200 }]]), { style: 'straight', parallelSpacing: 12 })
  const midpoint = edges.map(edge => labelBox(layout.edgeLabels.get(edge.id), edge.label))
  assert.ok(midpoint.some((box, i) => midpoint.some((other, j) => i !== j && overlaps(box, other))), 'midpoint labels overlap')
  const placed = placeGraphEdgeLabels(layout, edges)
  const boxes = edges.map(edge => labelBox(placed.edgeLabels.get(edge.id), edge.label))
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) assert.ok(!overlaps(boxes[i], boxes[j]), edges[i].id + ' overlaps ' + edges[j].id)
  }
})

test('placeGraphEdgeLabels keeps a free label just above the middle of its route', () => {
  const nodes = [{ id: 'a' }, { id: 'b' }]
  const edges = [{ id: 'a-b', from: 'a', to: 'b', label: 'flows' }]
  const layout = graph(nodes, edges, new Map([['a', { x: 40, y: 200 }], ['b', { x: 500, y: 200 }]]), { style: 'straight' })
  const before = layout.edgeLabels.get('a-b'), after = placeGraphEdgeLabels(layout, edges).edgeLabels.get('a-b')
  assert.ok(Math.abs(after.x - before.x) < 1e-6)
  assert.ok(Math.abs(after.y - before.y) < 0.5, `baseline ${after.y} near ${before.y}`)
})

test('placeGraphEdgeLabels is deterministic, does not mutate its input and leaves unlabelled edges alone', () => {
  const { edges, layout } = hub()
  const plain = [...edges, { id: 'quiet', from: 'n0', to: 'n2' }]
  const routed = routeGraphEdges(layout, plain, byId([...layout.boxes.keys()].map(id => ({ id }))), { style: 'straight' })
  const snapshot = new Map(routed.edgeLabels)
  deepFreeze(plain)
  const first = placeGraphEdgeLabels(routed, plain)
  const second = placeGraphEdgeLabels(routed, [...plain].reverse())
  assert.deepEqual([...first.edgeLabels].sort(), [...second.edgeLabels].sort())
  assert.deepEqual(routed.edgeLabels, snapshot)
  assert.notEqual(first.edgeLabels, routed.edgeLabels)
  assert.deepEqual(first.edgeLabels.get('quiet'), routed.edgeLabels.get('quiet'))
})

test('placeGraphEdgeLabels places only edgeIds and avoids the kept labels and extra obstacles', () => {
  const { edges, layout } = hub()
  const placed = placeGraphEdgeLabels(layout, edges, { edgeIds: ['e1'] })
  for (const edge of edges.filter(edge => edge.id !== 'e1')) assert.deepEqual(placed.edgeLabels.get(edge.id), layout.edgeLabels.get(edge.id))
  const e1 = labelBox(placed.edgeLabels.get('e1'), 'spoke 1')
  for (const node of placed.boxes.values()) assert.ok(!overlaps(e1, node))

  // An obstacle over the free spot the label took sends it elsewhere.
  const blocked = placeGraphEdgeLabels(layout, edges, { edgeIds: ['e1'], obstacles: [e1] })
  assert.notDeepEqual(blocked.edgeLabels.get('e1'), placed.edgeLabels.get('e1'))
  assert.ok(!overlaps(labelBox(blocked.edgeLabels.get('e1'), 'spoke 1'), e1))
  assert.throws(() => placeGraphEdgeLabels(layout, edges, { edgeIds: ['missing'] }), /Unknown edge in edgeIds: missing/)
})

test('placeGraphEdgeLabels uses measured label sizes and labelText', () => {
  const { edges, layout } = hub()
  const calls = []
  const placed = placeGraphEdgeLabels(layout, edges, {
    labelText: edge => edge.id === 'e3' ? 'custom' : undefined,
    labelSize: (edge, text) => {
      calls.push([edge.id, text])
      return { width: 30, height: 10 }
    },
  })
  assert.deepEqual(calls, [['e3', 'custom']])
  for (const edge of edges.filter(edge => edge.id !== 'e3')) assert.deepEqual(placed.edgeLabels.get(edge.id), layout.edgeLabels.get(edge.id))
  assert.throws(() => placeGraphEdgeLabels(layout, edges, { labelSize: () => ({ width: -1, height: 4 }) }), RangeError)
})

test('placeGraphEdgeLabels rejects invalid options and missing paths', () => {
  const { edges, layout } = hub()
  for (const options of [
    { fontSize: 0 }, { fontSize: Number.NaN }, { glyphWidth: -1 }, { gap: -1 }, { margin: Infinity }, { samples: 0 }, { samples: 2.5 },
    { samples: 33 }, { obstacles: [{ x: 0, y: 0, width: -1, height: 2 }] },
  ]) {
    assert.throws(() => placeGraphEdgeLabels(layout, edges, options), RangeError, JSON.stringify(options))
  }
  assert.throws(() => placeGraphEdgeLabels(layout, edges, { gap: -1 }), { name: 'RangeError', message: 'gap must be a finite number ≥ 0 (got -1)' })
  assert.throws(() => placeGraphEdgeLabels(layout, edges, { samples: 40 }), { name: 'RangeError', message: 'samples must be at most 32 (got 40)' })
  assert.throws(() => placeGraphEdgeLabels(layout, [...edges, { id: 'ghost', from: 'hub', to: 'n0', label: 'x' }]), /Missing layout path: ghost/)
})

test('placeGraphEdgeLabels places the labels of 2,000 edges', () => {
  const nodes = [], edges = []
  for (let i = 0; i < 1000; i++) nodes.push({ id: 'n' + i })
  for (let i = 0; i < 2000; i++) {
    const from = i % 1000, to = (from + 1 + (i % 7)) % 1000
    edges.push({ id: 'e' + i, from: 'n' + Math.min(from, to), to: 'n' + Math.max(from, to), label: 'edge ' + i })
  }
  const layout = routeGraphEdges(layoutLayeredGraph(nodes, edges), edges, byId(nodes), { style: 'orthogonal' })
  const started = performance.now()
  const placed = placeGraphEdgeLabels(layout, edges)
  assert.ok(performance.now() - started < 20_000)
  assert.equal(placed.edgeLabels.size, layout.edgeLabels.size)
  for (const point of placed.edgeLabels.values()) assert.ok(Number.isFinite(point.x) && Number.isFinite(point.y))
})

test('NetworkGraph edgeLabelPlacement is opt-in and the SVG export draws the placed labels', async () => {
  const { nodes, edges, layout } = hub()
  const positions = new Map([...layout.boxes].map(([id, box]) => [id, { x: box.x, y: box.y }]))
  const props = { nodes, edges, positions, edgeStyle: 'straight', options: { nodeWidth: 100, nodeHeight: 40 } }
  const base = await renderComponent(NetworkGraph, props)
  assert.equal(await renderComponent(NetworkGraph, { ...props, edgeLabelPlacement: 'midpoint' }), base)
  const avoided = await renderComponent(NetworkGraph, { ...props, edgeLabelPlacement: 'avoid' })
  assert.notEqual(avoided, base)
  assert.equal(await renderComponent(NetworkGraph, { ...props, edgeLabelPlacement: {} }), avoided)
  await assert.rejects(renderComponent(NetworkGraph, { ...props, edgeLabelPlacement: 'everywhere' }), RangeError)
  await assert.rejects(renderComponent(NetworkGraph, { ...props, edgeLabelPlacement: { gap: -2 } }), RangeError)

  const placed = placeGraphEdgeLabels(layout, edges)
  const anchor = placed.edgeLabels.get('e1')
  const num = value => String(Math.round(value * 1000) / 1000)
  assert.ok(renderGraphSvg(placed, nodes, edges).includes(`x="${num(anchor.x)}" y="${num(anchor.y)}"`))
})
