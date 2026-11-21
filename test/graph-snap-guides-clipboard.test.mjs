import assert from 'node:assert/strict'
import { test } from 'node:test'
import { cloneGraphElements, graphAlignmentGuides, snapGraphPoint } from '@eightkk/vue-weave/core'
import { NetworkGraph, cloneGraphElements as rootClone, graphAlignmentGuides as rootGuides } from '@eightkk/vue-weave'
import { renderComponent } from './helpers/ssr.mjs'

const rect = (x, y, width = 100, height = 40) => ({ x, y, width, height })

test('graphAlignmentGuides snaps left, centre and right edges to the nearest neighbour anchor', () => {
  assert.equal(rootGuides, graphAlignmentGuides)
  // Left edge 3 units right of a neighbour's left edge.
  assert.deepEqual(graphAlignmentGuides(rect(203, 500, 60), [rect(200, 0)], 5), {
    dx: -3, dy: 0, guides: [{ axis: 'x', position: 200, from: 0, to: 540 }],
  })
  // Boxes of the same width align on all three anchors at once.
  assert.deepEqual(graphAlignmentGuides(rect(203, 500), [rect(200, 0)], 5).guides.map(guide => guide.position), [200, 250, 300])
  // Centre to centre: a 40-wide box centred at 252 meets a 100-wide box centred at 250. The guide spans both boxes.
  assert.deepEqual(graphAlignmentGuides(rect(232, 100, 40, 20), [rect(200, 0)], 4), {
    dx: -2, dy: 0, guides: [{ axis: 'x', position: 250, from: 0, to: 120 }],
  })
  // Right edge to the neighbour's right edge, from above.
  assert.deepEqual(graphAlignmentGuides(rect(304, -90, 0, 20), [rect(200, 0)], 6), {
    dx: -4, dy: 0, guides: [{ axis: 'x', position: 300, from: -90, to: 40 }],
  })
  // Left edge to a right edge (a flush side-by-side placement) counts as well.
  assert.deepEqual(graphAlignmentGuides(rect(302, 300), [rect(200, 0)], 5).guides, [{ axis: 'x', position: 300, from: 0, to: 340 }])
})

test('graphAlignmentGuides snaps top, middle and bottom edges and both axes at once', () => {
  assert.deepEqual(graphAlignmentGuides(rect(500, 13), [rect(0, 10)], 5), {
    dx: 0, dy: -3, guides: [
      // The same height: top, middle and bottom all align, one guide each.
      { axis: 'y', position: 10, from: 0, to: 600 },
      { axis: 'y', position: 30, from: 0, to: 600 },
      { axis: 'y', position: 50, from: 0, to: 600 },
    ],
  })
  // Middle of a 20-high box (y 22..42, middle 32) against the middle of a 40-high box at 10 (middle 30).
  assert.deepEqual(graphAlignmentGuides(rect(500, 22, 100, 20), [rect(0, 10)], 6), {
    dx: 0, dy: -2, guides: [{ axis: 'y', position: 30, from: 0, to: 600 }],
  })
  // Both axes: the x shift of 3 aligns the right edge with the first box's centre and the left edge with the second
  // box; on y the box already sits at the first box's middle and bottom.
  const both = graphAlignmentGuides(rect(97, 72, 50, 20), [rect(0, 52, 300, 40), rect(100, 400, 10, 10)], 5)
  assert.equal(both.dx, 3)
  assert.equal(both.dy, 0)
  assert.deepEqual(both.guides, [
    { axis: 'x', position: 100, from: 72, to: 410 },
    { axis: 'x', position: 150, from: 52, to: 92 },
    { axis: 'y', position: 72, from: 0, to: 300 },
    { axis: 'y', position: 92, from: 0, to: 300 },
  ])
})

test('graphAlignmentGuides includes the threshold edge, breaks ties deterministically and reports no match', () => {
  assert.equal(graphAlignmentGuides(rect(205, 500), [rect(200, 0)], 5).dx, -5)
  assert.deepEqual(graphAlignmentGuides(rect(205.001, 500), [rect(200, 0)], 5), { dx: 0, dy: 0, guides: [] })
  // A zero threshold still reports exact alignment.
  assert.deepEqual(graphAlignmentGuides(rect(200, 500, 60), [rect(200, 0)], 0), {
    dx: 0, dy: 0, guides: [{ axis: 'x', position: 200, from: 0, to: 540 }],
  })
  // Equal distances on both sides: the earlier rectangle wins, whatever the sign.
  assert.equal(graphAlignmentGuides(rect(203, 500, 0, 0), [rect(206, 0, 0, 0), rect(200, 100, 0, 0)], 5).dx, 3)
  assert.equal(graphAlignmentGuides(rect(203, 500, 0, 0), [rect(200, 100, 0, 0), rect(206, 0, 0, 0)], 5).dx, -3)
  // Two neighbours aligned at the same position share one guide that spans all of them.
  assert.deepEqual(graphAlignmentGuides(rect(202, 200, 60), [rect(200, 0), rect(200, 400, 10, 10)], 5), {
    dx: -2, dy: 0, guides: [{ axis: 'x', position: 200, from: 0, to: 410 }],
  })
  const repeated = [graphAlignmentGuides(rect(48, 48), [rect(0, 0), rect(100, 100)], 10), graphAlignmentGuides(rect(48, 48), [rect(0, 0), rect(100, 100)], 10)]
  assert.deepEqual(repeated[0], repeated[1])
  assert.deepEqual(graphAlignmentGuides(rect(0, 0), [], 10), { dx: 0, dy: 0, guides: [] })
  assert.deepEqual(graphAlignmentGuides(rect(0, 0), [rect(500, 500)], 10), { dx: 0, dy: 0, guides: [] })
})

test('graphAlignmentGuides validates the threshold and rectangles and does not modify them', () => {
  for (const threshold of [-1, Number.NaN, Infinity]) {
    assert.throws(() => graphAlignmentGuides(rect(0, 0), [], threshold), { name: 'RangeError', message: /threshold/ })
  }
  assert.throws(() => graphAlignmentGuides(rect(Number.NaN, 0), [], 1), RangeError)
  assert.throws(() => graphAlignmentGuides(rect(0, 0, -1, 10), [], 1), RangeError)
  assert.throws(() => graphAlignmentGuides(rect(0, 0), [rect(0, 0), rect(0, Infinity)], 1), { name: 'RangeError', message: /rectangle 1/ })
  const moving = Object.freeze(rect(3, 3)), others = Object.freeze([Object.freeze(rect(0, 0))])
  const result = graphAlignmentGuides(moving, others, 5)
  assert.deepEqual(moving, rect(3, 3))
  assert.equal(result.dx, -3)
})

test('snapGraphPoint rounds to the grid and validates its input', () => {
  assert.deepEqual(snapGraphPoint({ x: 29, y: 31 }, 20), { x: 20, y: 40 })
  assert.ok(Object.is(snapGraphPoint({ x: -4, y: 0 }, 20).x, 0))
  assert.deepEqual(snapGraphPoint({ x: 0.26, y: 0.24 }, 0.5), { x: 0.5, y: 0 })
  for (const grid of [0, -5, Number.NaN, Infinity]) assert.throws(() => snapGraphPoint({ x: 0, y: 0 }, grid), RangeError)
  assert.throws(() => snapGraphPoint({ x: Number.NaN, y: 0 }, 10), RangeError)
})

const nodes = [
  { id: 'a', label: 'Alpha', ports: [{ id: 'out', side: 'right' }], data: { weight: 1 } },
  { id: 'b', label: 'Beta' },
  { id: 'c', label: 'Gamma' },
  { id: 'd', label: 'Delta' },
]
const edges = [
  { id: 'ab', from: 'a', to: 'b', fromPort: 'out', label: 'One', data: { kind: 'flow' } },
  { id: 'bc', from: 'b', to: 'c' },
  { id: 'ca', from: 'c', to: 'a' },
  { id: 'bb', from: 'b', to: 'b' },
  { id: 'cd', from: 'c', to: 'd' },
]
const suffix = (id, kind) => kind + ':' + id

test('cloneGraphElements copies the nodes and only the edges between them with new IDs', () => {
  assert.equal(rootClone, cloneGraphElements)
  const calls = []
  const result = cloneGraphElements(nodes, edges, ['b', 'a', 'b'], { createId: (id, kind) => (calls.push(kind + ' ' + id), id + '2') })
  // Input order, not request order; createId runs once per copy, nodes first.
  assert.deepEqual(calls, ['node a', 'node b', 'edge ab', 'edge bb'])
  assert.deepEqual(result.nodes, [
    { id: 'a2', label: 'Alpha', ports: [{ id: 'out', side: 'right' }], data: { weight: 1 } },
    { id: 'b2', label: 'Beta' },
  ])
  assert.deepEqual(result.edges, [
    { id: 'ab2', from: 'a2', to: 'b2', fromPort: 'out', label: 'One', data: { kind: 'flow' } },
    { id: 'bb2', from: 'b2', to: 'b2' },
  ])
  // Shallow copies keep ports and data by reference.
  assert.equal(result.nodes[0].ports, nodes[0].ports)
  assert.equal(result.nodes[0].data, nodes[0].data)
  assert.equal(result.edges[0].data, edges[0].data)
  assert.deepEqual(result.idMap, { nodes: new Map([['a', 'a2'], ['b', 'b2']]), edges: new Map([['ab', 'ab2'], ['bb', 'bb2']]) })
  assert.deepEqual(result.positions, new Map())
  // The copies form a valid graph with the originals.
  assert.doesNotThrow(() => cloneGraphElements([...nodes, ...result.nodes], [...edges, ...result.edges], [], { createId: suffix }))
  assert.deepEqual(cloneGraphElements(nodes, edges, [], { createId: suffix }), {
    nodes: [], edges: [], positions: new Map(), idMap: { nodes: new Map(), edges: new Map() },
  })
})

test('cloneGraphElements moves saved positions by the offset', () => {
  const positions = new Map([['a', { x: 10, y: 20 }], ['c', { x: 0, y: 5 }], ['d', { x: 99, y: 99 }]])
  const result = cloneGraphElements(nodes, edges, ['a', 'b', 'c'], { createId: suffix, positions, offset: { x: 40, y: -5 } })
  // b has no saved position, so its copy has none either; d was not copied.
  assert.deepEqual(result.positions, new Map([['node:a', { x: 50, y: 15 }], ['node:c', { x: 40, y: 0 }]]))
  assert.deepEqual(result.edges.map(edge => edge.id), ['edge:ab', 'edge:bc', 'edge:ca', 'edge:bb'])
  assert.deepEqual(cloneGraphElements(nodes, edges, ['a'], { createId: suffix, positions }).positions, new Map([['node:a', { x: 10, y: 20 }]]))
  assert.throws(() => cloneGraphElements(nodes, edges, ['a'], { createId: suffix, positions, offset: { x: Number.NaN, y: 0 } }), RangeError)
  assert.throws(() => cloneGraphElements(nodes, edges, ['a'], { createId: suffix, positions: new Map([['a', { x: Infinity, y: 0 }]]) }), RangeError)
})

test('cloneGraphElements moves edge waypoints by the offset without changing the input', () => {
  const routed = edges.map(edge => edge.id === 'bc' ? { ...edge, points: [{ x: 100, y: 50 }, { x: 140, y: 80 }] } : edge)
  const snapshot = structuredClone(routed)
  const result = cloneGraphElements(nodes, routed, ['b', 'c'], { createId: suffix, offset: { x: 40, y: -5 } })
  assert.deepEqual(result.edges.find(edge => edge.id === 'edge:bc').points, [{ x: 140, y: 45 }, { x: 180, y: 75 }])
  // Edges without waypoints get none.
  assert.equal('points' in result.edges.find(edge => edge.id === 'edge:bb'), false)
  assert.deepEqual(routed, snapshot)
  assert.notEqual(result.edges.find(edge => edge.id === 'edge:bc').points, routed[1].points)
  // Without an offset the waypoints are equal copies.
  const same = cloneGraphElements(nodes, routed, ['b', 'c'], { createId: suffix })
  assert.deepEqual(same.edges.find(edge => edge.id === 'edge:bc').points, routed[1].points)
  // A waypoint that overflows when moved is rejected.
  const far = edges.map(edge => edge.id === 'bc' ? { ...edge, points: [{ x: Number.MAX_VALUE, y: 0 }] } : edge)
  assert.throws(() => cloneGraphElements(nodes, far, ['b', 'c'], { createId: suffix, offset: { x: Number.MAX_VALUE, y: 0 } }), {
    name: 'RangeError', message: 'Copied edge waypoints must be finite: bc',
  })
})

test('cloneGraphElements rejects unknown, empty, repeated and colliding IDs', () => {
  assert.throws(() => cloneGraphElements(nodes, edges, ['zz'], { createId: suffix }), { name: 'Error', message: 'Unknown node in graph clone: zz' })
  assert.throws(() => cloneGraphElements(nodes, edges, ['a'], { createId: () => '' }), { name: 'Error', message: 'Invalid graph node ID: "" (createId for a)' })
  assert.throws(() => cloneGraphElements(nodes, edges, ['a', 'b'], { createId: () => 'same' }), { name: 'Error', message: 'Duplicate graph node ID: same (createId for b)' })
  assert.throws(() => cloneGraphElements(nodes, edges, ['a'], { createId: () => 'c' }), { name: 'Error', message: 'Duplicate graph node ID: c (createId for a)' })
  // Edge IDs must not collide with existing edges; node and edge IDs are separate collections.
  assert.throws(() => cloneGraphElements(nodes, edges, ['a', 'b'], { createId: (id, kind) => kind === 'node' ? id + '2' : 'bc' }), { name: 'Error', message: 'Duplicate graph edge ID: bc (createId for ab)' })
  assert.doesNotThrow(() => cloneGraphElements(nodes, edges, ['a', 'b'], { createId: (id, kind) => kind === 'node' ? id + '2' : id.slice(0, 1) }))
  assert.throws(() => cloneGraphElements(nodes, edges, ['a'], {}), /createId/)
  assert.throws(() => cloneGraphElements([...nodes, { id: 'a', label: 'Again' }], edges, ['a'], { createId: suffix }), /Duplicate graph node ID: a/)
})

test('cloneGraphElements leaves its input untouched', () => {
  const frozenNodes = Object.freeze(nodes.map(node => Object.freeze({ ...node })))
  const frozenEdges = Object.freeze(edges.map(edge => Object.freeze({ ...edge })))
  const positions = new Map([['a', Object.freeze({ x: 1, y: 2 })]])
  const before = JSON.stringify([frozenNodes, frozenEdges, [...positions]])
  const result = cloneGraphElements(frozenNodes, frozenEdges, ['a', 'b'], { createId: suffix, positions, offset: { x: 5, y: 5 } })
  assert.equal(JSON.stringify([frozenNodes, frozenEdges, [...positions]]), before)
  assert.notEqual(result.nodes[0], frozenNodes[0])
  assert.notEqual(result.positions.get('node:a'), positions.get('a'))
})

const render = (props, slots) => renderComponent(NetworkGraph, { nodes, edges, ...props }, slots)

test('NetworkGraph markup is unchanged by the editing props and the none background', async () => {
  const plain = await render({})
  assert.doesNotMatch(plain, /vw-network-patterned|vw-network-backdrop|<pattern|vw-guide/)
  const opted = await render({
    snapGrid: 20, alignmentGuides: true, guideThreshold: 3, autoPan: true, droppable: true, clipboard: true, background: 'none', backgroundGap: 30,
  })
  assert.equal(opted, plain)
  const groups = [{ id: 'g', label: 'Group', nodeIds: ['a', 'b'] }]
  assert.equal(await render({ groups, draggable: true, snapGrid: 10 }), await render({ groups, draggable: true }))
})

test('NetworkGraph renders a decorative background pattern on the server', async () => {
  const groups = [{ id: 'g', label: 'Group', nodeIds: ['a', 'b'] }]
  const plain = await render({ groups })
  for (const [background, shape] of [['dots', /<circle class="vw-network-pattern" cx="10" cy="10" r="[\d.]+"><\/circle>/], ['lines', /<path class="vw-network-pattern" stroke-width="[\d.]+" d="M 10 0 V 20 M 0 10 H 20"><\/path>/]]) {
    const html = await render({ groups, background, snapGrid: 20 })
    const id = html.match(/<pattern id="([^"]+)"/)[1]
    assert.match(id, /-background$/)
    assert.match(html, shape)
    assert.match(html, /<g class="vw-network-backdrop" aria-hidden="true"><pattern [^>]*patternUnits="userSpaceOnUse" x="-10" y="-10" width="20" height="20">/)
    assert.match(html, new RegExp(`<rect class="vw-network-background" [^>]*fill="url\\(#${id}\\)">`))
    assert.match(html, /^<div class="vw-network vw-network-patterned">/)
    // Everything else, groups included, is the markup without a background.
    const stripped = html.replace(/<g class="vw-network-backdrop"[\s\S]*?<\/rect><\/g>/, '').replace(' vw-network-patterned', '')
    assert.equal(stripped, plain)
  }
  // backgroundGap overrides the grid; the default gap is 20.
  assert.match(await render({ background: 'dots', snapGrid: 20, backgroundGap: 30 }), /width="30" height="30"/)
  assert.match(await render({ background: 'lines' }), /width="20" height="20"/)
})

test('NetworkGraph rejects invalid snapping, background and guide props while rendering', async () => {
  for (const snapGrid of [0, -10, Number.NaN, Infinity]) await assert.rejects(render({ snapGrid }), { name: 'RangeError', message: /snapGrid/ })
  for (const backgroundGap of [0, -1, Number.NaN]) {
    await assert.rejects(render({ background: 'dots', backgroundGap }), { name: 'RangeError', message: /backgroundGap/ })
  }
  for (const guideThreshold of [-1, Number.NaN, Infinity]) {
    await assert.rejects(render({ alignmentGuides: true, guideThreshold }), { name: 'RangeError', message: /guideThreshold/ })
  }
  await assert.rejects(render({ background: 'grid' }), { name: 'RangeError', message: 'Unknown NetworkGraph background: grid' })
})
