import assert from 'node:assert/strict'
import { test } from 'node:test'
import { layoutLayeredGraph, placeGraphEdgeLabels, routeGraphEdges } from '@eightkk/vue-weave/core'
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
  for (const samples of [0, 2.5, 33, 40]) {
    assert.throws(() => placeGraphEdgeLabels(layout, edges, { samples }), { name: 'RangeError', message: `samples must be an integer from 1 to 32 (got ${samples})` })
  }
  for (const [index, obstacles] of [[0, [null]], [1, [{ x: 0, y: 0, width: 1, height: 1 }, undefined]], [0, [{ x: 0, y: 0, width: Number.NaN, height: 1 }]]]) {
    assert.throws(() => placeGraphEdgeLabels(layout, edges, { obstacles }), { name: 'RangeError', message: 'Invalid edge label obstacle at index ' + index })
  }
  assert.throws(() => placeGraphEdgeLabels(layout, edges, { labelSize: () => 'wide' }), { name: 'RangeError', message: 'Invalid edge label size: e0' })
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
  // Quality: far fewer labels cover a node or another label than at the midpoints.
  const conflicts = anchors => {
    const boxes = edges.map(edge => labelBox(anchors.get(edge.id), edge.label))
    let count = 0
    for (let i = 0; i < boxes.length; i++) {
      for (const node of layout.boxes.values()) if (overlaps(boxes[i], node)) count++
      for (let j = i + 1; j < boxes.length; j++) if (overlaps(boxes[i], boxes[j])) count++
    }
    return count
  }
  const before = conflicts(layout.edgeLabels), after = conflicts(placed.edgeLabels)
  assert.ok(before > 0)
  assert.ok(after * 2 < before, `${after} conflicts after placement, ${before} before`)
})

test('NetworkGraph edgeLabelPlacement is opt-in and checked', async () => {
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
})

// A layout without nodes: the given paths, each label at the router's spot just above the middle of its first segment.
function manual(paths, { width = 600, height = 400, boxes = [] } = {}) {
  const edgeLabels = new Map()
  for (const [id, path] of paths) {
    const [x1, y1, x2, y2] = (path.match(/-?\d+(?:\.\d+)?/g) ?? []).map(Number)
    if (y2 !== undefined) edgeLabels.set(id, { x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 6 })
  }
  return { boxes: new Map(boxes), paths: new Map(paths), edgeLabels, width, height }
}
const edgeOf = (id, label) => ({ id, from: 'a', to: 'b', ...label !== undefined && { label } })

test('placeGraphEdgeLabels keeps a label beside its route when the gap is smaller than the margin', () => {
  const layout = manual([['flat', 'M 100 200 L 500 200']])
  const edges = [edgeOf('flat', 'flows')]
  for (const [gap, margin] of [[0, 6], [1, 8], [3, 2], [10, 0]]) {
    const anchor = placeGraphEdgeLabels(layout, edges, { gap, margin }).edgeLabels.get('flat')
    const box = labelBox(anchor, 'flows')
    // Above the route, `gap` from it, not on it.
    assert.ok(Math.abs(box.y + box.height - (200 - gap)) < 1e-6, `gap ${gap}, margin ${margin}: bottom ${box.y + box.height}`)
    assert.ok(Math.abs(anchor.x - 300) < 1e-6)
  }
})

test('placeGraphEdgeLabels moves a label off another edge that crosses its spot', () => {
  // A vertical edge ends just above the middle of the long one, right where its label would go.
  const layout = manual([['long', 'M 100 200 L 500 200'], ['cross', 'M 300 20 L 300 196']])
  const edges = [edgeOf('long', 'carries'), edgeOf('cross')]
  const box = labelBox(placeGraphEdgeLabels(layout, edges).edgeLabels.get('long'), 'carries')
  const crossed = box.x < 300 && box.x + box.width > 300 && box.y < 196
  assert.ok(!crossed, `label ${JSON.stringify(box)} crosses the vertical edge`)
  // Without the vertical edge the label stays at the middle.
  const alone = placeGraphEdgeLabels(layout, [edges[0]]).edgeLabels.get('long')
  assert.ok(Math.abs(alone.x - 300) < 1e-6)
})

test('placeGraphEdgeLabels keeps labels inside the layout when there is room', () => {
  // Routes along the top and right borders: the preferred spot above or right of each is outside the layout.
  const layout = manual([['top', 'M 100 4 L 500 4'], ['right', 'M 596 100 L 596 300']])
  const edges = [edgeOf('top', 'along top'), edgeOf('right', 'down')]
  const placed = placeGraphEdgeLabels(layout, edges)
  for (const edge of edges) {
    const box = labelBox(placed.edgeLabels.get(edge.id), edge.label)
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= 600 && box.y + box.height <= 400, `${edge.id} outside: ${JSON.stringify(box)}`)
  }
})

test('placeGraphEdgeLabels keeps labels clear of wide edges with edgeWidth', () => {
  const layout = manual([['band', 'M 100 200 L 500 200'], ['thin', 'M 100 170 L 500 170']])
  const edges = [edgeOf('band', 'band'), edgeOf('thin', 'thin')]
  const widths = { band: 30 }
  const placed = placeGraphEdgeLabels(layout, edges, { edgeWidth: edge => widths[edge.id], gap: 3 })
  // The band's own label keeps the gap from the band's outer side.
  const own = labelBox(placed.edgeLabels.get('band'), 'band')
  const inside = (box, top, bottom) => box.y < bottom && box.y + box.height > top
  assert.ok(!inside(own, 185, 215), `band label inside the band: ${JSON.stringify(own)}`)
  assert.ok(Math.abs(own.y + own.height - 182) < 1e-6 || Math.abs(own.y - 218) < 1e-6, JSON.stringify(own))
  // The thin edge's label does not reach into the band below it.
  assert.ok(!inside(labelBox(placed.edgeLabels.get('thin'), 'thin'), 185, 215))
  // Without the widths, the band's label sits right above its centre line, inside the band.
  assert.ok(inside(labelBox(placeGraphEdgeLabels(layout, edges).edgeLabels.get('band'), 'band'), 185, 215))
  // Nothing (undefined or null) and 0 are thin lines; other values are checked.
  assert.deepEqual(placeGraphEdgeLabels(layout, edges, { edgeWidth: () => null }).edgeLabels, placeGraphEdgeLabels(layout, edges).edgeLabels)
  assert.deepEqual(placeGraphEdgeLabels(layout, edges, { edgeWidth: () => 0 }).edgeLabels, placeGraphEdgeLabels(layout, edges).edgeLabels)
  for (const width of [-1, Number.NaN, Infinity, '4']) {
    assert.throws(() => placeGraphEdgeLabels(layout, edges, { edgeWidth: () => width }), { name: 'RangeError', message: 'Invalid edge width: band' })
  }
})

test('placeGraphEdgeLabels rejects duplicate and invalid edge IDs in any order', () => {
  const layout = manual([['a', 'M 100 200 L 500 200'], ['b', 'M 100 100 L 500 100']])
  const first = edgeOf('a', 'one'), second = edgeOf('a', 'two')
  for (const edges of [[first, second], [second, first], [edgeOf('b', 'x'), first, edgeOf('b', 'y')]]) {
    assert.throws(() => placeGraphEdgeLabels(layout, edges), { name: 'Error', message: /^Duplicate edge ID: (a|b)$/ })
  }
  assert.throws(() => placeGraphEdgeLabels(layout, [{ ...first, id: '' }]), { name: 'Error', message: 'Invalid edge ID: ""' })
})

test('placeGraphEdgeLabels keeps the anchors of zero-length and empty routes and of edgeIds without text', () => {
  const layout = manual([['dot', 'M 50 50 L 50 50'], ['empty', ''], ['flat', 'M 100 200 L 500 200'], ['quiet', 'M 100 300 L 500 300']])
  layout.edgeLabels.set('empty', { x: 7, y: 9 })
  const edges = [edgeOf('dot', 'dot'), edgeOf('empty', 'empty'), edgeOf('flat', 'flat'), edgeOf('quiet')]
  const placed = placeGraphEdgeLabels(layout, edges)
  assert.deepEqual(placed.edgeLabels.get('dot'), layout.edgeLabels.get('dot'))
  assert.deepEqual(placed.edgeLabels.get('empty'), { x: 7, y: 9 })
  // An edge without text may be named in edgeIds: its anchor is kept and nothing else changes.
  const quiet = placeGraphEdgeLabels(layout, edges, { edgeIds: ['quiet'] })
  assert.deepEqual(quiet.edgeLabels, layout.edgeLabels)
})

test('placeGraphEdgeLabels places labels beside curved routes', () => {
  // A cubic arch with a node box right where the label would sit above its middle.
  const path = 'M 100 300 C 150 100 450 100 500 300'
  const node = { x: 270, y: 120, width: 60, height: 30 }
  const layout = manual([['arch', path]], { boxes: [['n', node]] })
  layout.edgeLabels.set('arch', { x: 300, y: 144 })
  const anchor = placeGraphEdgeLabels(layout, [edgeOf('arch', 'arch label')]).edgeLabels.get('arch')
  const box = labelBox(anchor, 'arch label')
  assert.ok(!overlaps(box, node), 'label covers the node')
  // No point of the curve lies inside the label box (shrunk by half a unit for the flattening).
  for (let i = 0; i <= 200; i++) {
    const t = i / 200, u = 1 - t
    const x = u ** 3 * 100 + 3 * u * u * t * 150 + 3 * u * t * t * 450 + t ** 3 * 500
    const y = u ** 3 * 300 + 3 * u * u * t * 100 + 3 * u * t * t * 100 + t ** 3 * 300
    assert.ok(!(x > box.x + 0.5 && x < box.x + box.width - 0.5 && y > box.y + 0.5 && y < box.y + box.height - 0.5), `curve point ${x},${y} inside`)
  }
})

test('placeGraphEdgeLabels treats a labelSize of null as the estimate', () => {
  const { edges, layout } = hub()
  assert.deepEqual(placeGraphEdgeLabels(layout, edges, { labelSize: () => null }).edgeLabels, placeGraphEdgeLabels(layout, edges).edgeLabels)
})

// The edge label anchors of server-rendered HTML, by label text.
function renderedLabels(html) {
  const anchors = new Map()
  for (const [, x, y, text] of html.matchAll(/<text class="vw-edge-label" x="([^"]+)" y="([^"]+)">([^<]*)<\/text>/g)) anchors.set(text, { x: Number(x), y: Number(y) })
  return anchors
}

test('NetworkGraph renders the anchors placeGraphEdgeLabels gives, with band widths from edgeBands', async () => {
  const { nodes, edges, layout } = hub()
  // The routed layout as a custom layout: the curve style keeps its paths, so the component places exactly these.
  const props = { nodes, edges, layout: () => layout, height: 600 }
  const expected = placeGraphEdgeLabels(layout, edges)
  const rendered = renderedLabels(await renderComponent(NetworkGraph, { ...props, edgeLabelPlacement: 'avoid' }))
  assert.equal(rendered.size, edges.length)
  for (const edge of edges) assert.deepEqual(rendered.get(edge.label), expected.edgeLabels.get(edge.id), edge.id)
  const midpoint = renderedLabels(await renderComponent(NetworkGraph, props))
  assert.notDeepEqual(midpoint, rendered)
  for (const edge of edges) assert.deepEqual(midpoint.get(edge.label), layout.edgeLabels.get(edge.id), edge.id)

  // A band's label keeps its gap from the outer side of the band.
  const edgeBands = new Map([['e3', { width: 24 }], ['e7', { width: 16 }]])
  const banded = placeGraphEdgeLabels(layout, edges, { edgeWidth: edge => edgeBands.get(edge.id)?.width })
  assert.notDeepEqual(banded.edgeLabels.get('e3'), expected.edgeLabels.get('e3'))
  const withBands = renderedLabels(await renderComponent(NetworkGraph, { ...props, edgeBands, edgeLabelPlacement: { gap: 3 } }))
  for (const edge of edges) assert.deepEqual(withBands.get(edge.label), banded.edgeLabels.get(edge.id), edge.id)
})
