import assert from 'node:assert/strict'
import { test } from 'node:test'
import { findOrthogonalRoute, layoutLayeredGraph, renderGraphSvg, routeGraphEdges } from '@eightkk/vue-weave/core'
import { NetworkGraph } from '@eightkk/vue-weave'
import { byId, polyline } from './helpers/builders.mjs'
import { seededRandom } from './helpers/seeded.mjs'
import { renderComponent } from './helpers/ssr.mjs'

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

const normals = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] }
// The first leg leaves along the side's normal and the last leg enters against it.
function assertSides(points, fromSide, toSide) {
  const [fx, fy] = normals[fromSide], [tx, ty] = normals[toSide]
  const a = points[0], b = points[1], y = points[points.length - 2], z = points[points.length - 1]
  assert.equal(Math.sign(b.x - a.x) + 0, fx + 0, 'leaves along x of ' + fromSide)
  assert.equal(Math.sign(b.y - a.y) + 0, fy + 0, 'leaves along y of ' + fromSide)
  assert.equal(Math.sign(z.x - y.x) + 0, -tx + 0, 'enters along x of ' + toSide)
  assert.equal(Math.sign(z.y - y.y) + 0, -ty + 0, 'enters along y of ' + toSide)
}

test('findOrthogonalRoute goes around a blocking box with the clearance and keeps both sides', () => {
  const source = { x: 0, y: 0, width: 100, height: 50 }, target = { x: 300, y: 0, width: 100, height: 50 }
  const wall = { x: 150, y: -20, width: 100, height: 120 }
  const from = { x: 100, y: 25, side: 'right' }, to = { x: 300, y: 25, side: 'left' }
  const route = findOrthogonalRoute(from, to, [source, target, wall], { clearance: 10 })
  assert.ok(route)
  assert.deepEqual(route[0], { x: 100, y: 25 })
  assert.deepEqual(route[route.length - 1], { x: 300, y: 25 })
  assertOrthogonal(route)
  assertSides(route, 'right', 'left')
  assert.equal(crossings(route, [wall], 10 - 1e-3), 0)
  assert.equal(crossings(route, [source, target]), 0)
  // Without the wall the route is a straight line.
  assert.deepEqual(findOrthogonalRoute(from, to, [source, target]), [{ x: 100, y: 25 }, { x: 300, y: 25 }])
})

test('findOrthogonalRoute is deterministic and does not depend on the obstacle order', () => {
  const obstacles = []
  for (let i = 0; i < 40; i++) obstacles.push({ x: 60 + (i % 8) * 70, y: 40 + Math.floor(i / 8) * 60, width: 40, height: 30 })
  // The boxes of both ends are obstacles too.
  obstacles.push({ x: 0, y: 185, width: 40, height: 30 }, { x: 680, y: 10, width: 40, height: 30 })
  const from = { x: 40, y: 200, side: 'right' }, to = { x: 700, y: 10, side: 'top' }
  const first = findOrthogonalRoute(from, to, obstacles)
  assert.ok(first)
  assert.deepEqual(findOrthogonalRoute(from, to, obstacles), first)
  assert.deepEqual(findOrthogonalRoute(from, to, [...obstacles].reverse()), first)
  assertOrthogonal(first)
  assertSides(first, 'right', 'top')
  assert.equal(crossings(first, obstacles.slice(0, 40), 8 - 1e-3), 0)
  assert.equal(crossings(first, obstacles.slice(40)), 0)
})

test('findOrthogonalRoute returns undefined when an end is boxed in, and stays at nonnegative coordinates', () => {
  const inner = { x: 100, y: 100, width: 40, height: 40 }
  const ring = [
    { x: 60, y: 60, width: 120, height: 10 }, { x: 60, y: 170, width: 120, height: 10 },
    { x: 60, y: 60, width: 10, height: 120 }, { x: 170, y: 60, width: 10, height: 120 },
  ]
  const from = { x: 140, y: 120, side: 'right' }, to = { x: 400, y: 120, side: 'left' }
  assert.equal(findOrthogonalRoute(from, to, [inner, ...ring, { x: 400, y: 100, width: 40, height: 40 }]), undefined)
  // A box at the top-left corner: the route goes around it below rather than at negative coordinates.
  const route = findOrthogonalRoute({ x: 0, y: 5, side: 'left' }, { x: 300, y: 5, side: 'left' }, [{ x: 0, y: 0, width: 50, height: 10 }])
  assert.ok(route)
  assert.ok(route.every(point => point.x >= 0 && point.y >= 0), JSON.stringify(route))
})

test('findOrthogonalRoute validates its input', () => {
  const end = { x: 0, y: 0, side: 'right' }
  assert.throws(() => findOrthogonalRoute({ x: NaN, y: 0, side: 'right' }, end, []), RangeError)
  assert.throws(() => findOrthogonalRoute(end, { x: 0, y: Infinity, side: 'left' }, []), RangeError)
  assert.throws(() => findOrthogonalRoute(end, { x: 0, y: 0, side: 'middle' }, []), RangeError)
  assert.throws(() => findOrthogonalRoute(end, end, [{ x: 0, y: 0, width: -1, height: 5 }]), RangeError)
  assert.throws(() => findOrthogonalRoute(end, end, [{ x: NaN, y: 0, width: 1, height: 5 }]), RangeError)
  assert.throws(() => findOrthogonalRoute(end, end, [], { clearance: -1 }), RangeError)
  assert.throws(() => findOrthogonalRoute(end, end, [], { clearance: Infinity }), RangeError)
  assert.throws(() => findOrthogonalRoute(end, end, [], { bendPenalty: NaN }), RangeError)
})

// Three nodes in a row along the layout direction; the middle one sits on the straight route from the first to the last.
function rowLayout(direction) {
  const along = [0, 220, 440]
  const reversed = direction === 'RL' || direction === 'BT'
  const order = reversed ? [2, 1, 0] : [0, 1, 2]
  const horizontal = direction === 'LR' || direction === 'RL'
  const boxes = new Map(['a', 'm', 'b'].map((id, i) => {
    const offset = along[order[i]]
    return [id, horizontal
      ? { x: offset + 20, y: id === 'm' ? 70 : 80, width: 140, height: id === 'm' ? 80 : 60, rank: i }
      : { x: id === 'm' ? 70 : 80, y: offset + 20, width: id === 'm' ? 80 : 60, height: 140, rank: i }]
  }))
  const placeholder = new Map([['a-b', 'M 0 0 C 1 1, 2 2, 3 3']])
  return { boxes, paths: placeholder, edgeLabels: new Map(), width: horizontal ? 640 : 240, height: horizontal ? 240 : 640 }
}

for (const direction of ['LR', 'RL', 'TB', 'BT']) {
  test(`routeGraphEdges with avoidNodes routes around a node in the way (${direction})`, () => {
    const layout = rowLayout(direction)
    const nodes = byId([{ id: 'a' }, { id: 'm' }, { id: 'b' }])
    const edges = [{ id: 'a-b', from: 'a', to: 'b' }]
    const plain = polyline(routeGraphEdges(layout, edges, nodes, { style: 'orthogonal', direction }).paths.get('a-b'))
    assert.ok(crossings(plain, [layout.boxes.get('m')]) > 0, 'the plain route crosses the middle node')
    const routed = routeGraphEdges(layout, edges, nodes, { style: 'orthogonal', direction, avoidNodes: { clearance: 6 } })
    const points = polyline(routed.paths.get('a-b'))
    assertOrthogonal(points)
    assert.equal(crossings(points, [layout.boxes.get('m')], 6 - 1e-3), 0)
    assert.equal(crossings(points, [layout.boxes.get('a'), layout.boxes.get('b')]), 0)
    // The ends stay where the plain route has them, on the sides facing each other along the direction.
    assert.deepEqual(points[0], plain[0])
    assert.deepEqual(points[points.length - 1], plain[plain.length - 1])
    const sides = { LR: ['right', 'left'], RL: ['left', 'right'], TB: ['bottom', 'top'], BT: ['top', 'bottom'] }[direction]
    assertSides(points, ...sides)
    assert.ok(routed.edgeLabels.has('a-b'))
    assert.deepEqual(routed.boxes, layout.boxes)
    // The same input gives the same output, and the input is not changed.
    assert.equal(routeGraphEdges(layout, edges, nodes, { style: 'orthogonal', direction, avoidNodes: { clearance: 6 } }).paths.get('a-b'), routed.paths.get('a-b'))
    assert.equal(layout.paths.get('a-b'), 'M 0 0 C 1 1, 2 2, 3 3')
  })
}

test('routeGraphEdges keeps the plain orthogonal route when no route around the boxes exists', () => {
  const boxes = new Map([
    ['a', { x: 100, y: 100, width: 40, height: 40, rank: 0 }],
    ['top', { x: 60, y: 60, width: 120, height: 10, rank: 0 }], ['bottom', { x: 60, y: 170, width: 120, height: 10, rank: 0 }],
    ['left', { x: 60, y: 60, width: 10, height: 120, rank: 0 }], ['right', { x: 170, y: 60, width: 10, height: 120, rank: 0 }],
    ['b', { x: 400, y: 100, width: 40, height: 40, rank: 1 }],
  ])
  const layout = { boxes, paths: new Map([['a-b', 'M 0 0']]), edgeLabels: new Map(), width: 500, height: 300 }
  const nodes = byId([...boxes.keys()].map(id => ({ id })))
  const edges = [{ id: 'a-b', from: 'a', to: 'b' }]
  const plain = routeGraphEdges(layout, edges, nodes, { style: 'orthogonal' })
  const avoided = routeGraphEdges(layout, edges, nodes, { style: 'orthogonal', avoidNodes: true })
  assert.equal(avoided.paths.get('a-b'), plain.paths.get('a-b'))
  assert.deepEqual(avoided.edgeLabels.get('a-b'), plain.edgeLabels.get('a-b'))
})

test('routeGraphEdges avoidNodes leaves curves, waypoints and self-loops alone and validates the option', () => {
  const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const edges = [
    { id: 'a-b', from: 'a', to: 'b' }, { id: 'b-c', from: 'b', to: 'c', points: [{ x: 300, y: 10 }] },
    { id: 'c-c', from: 'c', to: 'c' },
  ]
  const layout = layoutLayeredGraph(nodes, edges)
  const map = byId(nodes)
  // Curve style without orthogonal edges or waypoints returns the layout itself.
  assert.equal(routeGraphEdges(layout, [edges[0]], map, { avoidNodes: true }), layout)
  const plain = routeGraphEdges(layout, edges, map, { style: 'orthogonal' })
  const avoided = routeGraphEdges(layout, edges, map, { style: 'orthogonal', avoidNodes: true })
  assert.equal(avoided.paths.get('b-c'), plain.paths.get('b-c'))
  assert.equal(avoided.paths.get('c-c'), plain.paths.get('c-c'))
  // An unobstructed edge between neighbouring ranks is the plain route.
  assert.equal(avoided.paths.get('a-b'), plain.paths.get('a-b'))
  assert.equal(routeGraphEdges(layout, edges, map, { style: 'orthogonal', avoidNodes: false }).paths.get('a-b'), plain.paths.get('a-b'))
  for (const avoidNodes of ['yes', 1, null, { clearance: -1 }, { clearance: NaN }, { bendPenalty: -2 }]) {
    assert.throws(() => routeGraphEdges(layout, edges, map, { style: 'orthogonal', avoidNodes }), RangeError, String(avoidNodes))
  }
  assert.throws(() => routeGraphEdges(layout, [{ id: 'x', from: 'a', to: 'missing' }], map, { style: 'orthogonal', avoidNodes: true }), Error)
})

test('routeGraphEdges avoidNodes keeps a clear bypass lane and reroutes one that crosses a node', () => {
  const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const edges = [{ id: 'a-b', from: 'a', to: 'b' }, { id: 'b-c', from: 'b', to: 'c' }, { id: 'a-c', from: 'a', to: 'c' }]
  const layout = layoutLayeredGraph(nodes, edges)
  const map = byId(nodes)
  const lane = routeGraphEdges(layout, edges, map, { style: 'orthogonal' }).paths.get('a-c')
  assert.equal(routeGraphEdges(layout, edges, map, { style: 'orthogonal', avoidNodes: true }).paths.get('a-c'), lane)
  // Lift b onto the lane: the lane is no longer kept, and the new route avoids b.
  const b = layout.boxes.get('b')
  const lifted = { ...layout, boxes: new Map([...layout.boxes, ['b', { ...b, y: 0 }]]) }
  const rerouted = routeGraphEdges(lifted, edges, map, { style: 'orthogonal', avoidNodes: true }).paths.get('a-c')
  assert.notEqual(rerouted, lane)
  assert.equal(crossings(polyline(rerouted), [lifted.boxes.get('b')]), 0)
})

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

test('NetworkGraph avoidNodes is opt-in and the SVG export draws the avoiding routes', async () => {
  const nodes = [{ id: 'a', label: 'A' }, { id: 'm', label: 'M' }, { id: 'b', label: 'B' }]
  const edges = [{ id: 'a-b', from: 'a', to: 'b' }]
  // m sits between a and b, on the straight route.
  const positions = new Map([['a', { x: 20, y: 80 }], ['m', { x: 220, y: 70 }], ['b', { x: 420, y: 80 }]])
  const render = props => renderComponent(NetworkGraph, { nodes, edges, positions, ...props })
  const base = await render({ edgeStyle: 'orthogonal' })
  assert.equal(await render({ edgeStyle: 'orthogonal', avoidNodes: false }), base)
  const avoided = await render({ edgeStyle: 'orthogonal', avoidNodes: true })
  assert.notEqual(avoided, base)
  assert.equal(await render({ avoidNodes: true }), await render({}))
  await assert.rejects(render({ edgeStyle: 'orthogonal', avoidNodes: { clearance: -4 } }), RangeError)

  const layout = layoutLayeredGraph(nodes, edges)
  const moved = { ...layout, boxes: new Map([...layout.boxes].map(([id, box]) => [id, { ...box, ...positions.get(id) }])) }
  const routed = routeGraphEdges(moved, edges, byId(nodes), { style: 'orthogonal', avoidNodes: true })
  const path = routed.paths.get('a-b')
  assert.equal(crossings(polyline(path), [moved.boxes.get('m')]), 0)
  assert.ok(renderGraphSvg(routed, nodes, edges).includes(path))
})
