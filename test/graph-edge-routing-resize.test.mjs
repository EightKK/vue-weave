import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  applyGraphPositions, applyGraphSizes, graphEdgeEndpoint, graphPathEndpoints, graphPolylinePath, graphSmoothPath, layoutLayeredGraph,
  routeGraphEdges, routeGraphPorts,
} from 'vue-weave/core'
import { routeGraphEdges as rootRoute, applyGraphSizes as rootSizes } from 'vue-weave'
import { byId, deepFreeze as freeze, onBorder, segments } from './helpers/builders.mjs'

const nodes = [
  { id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }, { id: 'd', label: 'D' }, { id: 'e', label: 'E' },
]

const edges = [
  { id: 'ab', from: 'a', to: 'b', label: 'feeds' }, { id: 'bc', from: 'b', to: 'c' }, { id: 'ac', from: 'a', to: 'c', label: 'feeds' },
  { id: 'cd', from: 'c', to: 'd' }, { id: 'de', from: 'd', to: 'e' }, { id: 'be', from: 'b', to: 'e' }, { id: 'aa', from: 'a', to: 'a' },
]

test('routeGraphEdges keeps the curve layout without waypoints and validates options', () => {
  assert.equal(rootRoute, routeGraphEdges)
  const layout = layoutLayeredGraph(nodes, edges)
  const map = byId(nodes)
  assert.equal(routeGraphEdges(layout, edges, map), layout)
  assert.equal(routeGraphEdges(layout, edges, map, { style: 'curve', direction: 'TB' }), layout)
  assert.throws(() => routeGraphEdges(layout, edges, map, { style: 'zigzag' }), RangeError)
  assert.throws(() => routeGraphEdges(layout, edges, map, { style: 'orthogonal', cornerRadius: -1 }), RangeError)
  assert.throws(() => routeGraphEdges(layout, [{ ...edges[0], points: [{ x: NaN, y: 0 }] }], map), RangeError)
  assert.throws(() => routeGraphEdges(layout, [{ id: 'x', from: 'a', to: 'zz' }], map, { style: 'straight' }), { name: 'Error', message: 'Unknown node in graph edge x: zz' })
  assert.throws(() => graphPolylinePath([{ x: 0, y: 0 }], Infinity), RangeError)
})

test('orthogonal routes are axis-aligned, start and end on the box borders and keep bypass lanes in every direction', () => {
  for (const direction of ['LR', 'TB', 'RL', 'BT']) {
    const layout = layoutLayeredGraph(nodes, edges, { direction })
    const routed = routeGraphEdges(layout, edges, byId(nodes), { style: 'orthogonal', direction })
    assert.equal(routed.boxes, layout.boxes)
    for (const edge of edges) {
      const path = routed.paths.get(edge.id)
      for (const [from, to] of segments(path)) assert.ok(from.x === to.x || from.y === to.y, direction + ' ' + edge.id + ': ' + path)
      const ends = graphPathEndpoints(path)
      assert.ok(onBorder(layout.boxes.get(edge.from), ends.start), direction + ' start ' + edge.id)
      assert.ok(onBorder(layout.boxes.get(edge.to), ends.end), direction + ' end ' + edge.id)
      assert.ok(routed.edgeLabels.has(edge.id))
    }
    // The long edge a → c already runs in a bypass lane and is kept as the layout drew it.
    assert.equal(routed.paths.get('ac'), layout.paths.get('ac'))
    // Adjacent ranks meet face to face: one straight segment.
    assert.equal(segments(routed.paths.get('ab')).length, 1)
  }
  // Moved nodes are routed between the sides that face each other, with one turn pair.
  const moved = applyGraphPositions(layoutLayeredGraph(nodes, edges), edges, new Map([['b', { x: 400, y: 300 }]]))
  const routed = routeGraphEdges(moved, edges, byId(nodes), { style: 'orthogonal' })
  assert.equal(routed.paths.get('ab'), 'M 164 67 L 282 67 L 282 329 L 400 329')
  // Rounded corners use quadratic curves at each turn.
  const rounded = routeGraphEdges(moved, edges, byId(nodes), { style: 'orthogonal', cornerRadius: 6 })
  assert.equal(rounded.paths.get('ab'), 'M 164 67 L 276 67 Q 282 67 282 73 L 282 323 Q 282 329 288 329 L 400 329')
})

test('orthogonal routes honour ports, sizes and waypoints', () => {
  const ported = [
    { id: 'p', label: 'P', ports: [{ id: 'down', side: 'bottom' }] }, { id: 'q', label: 'Q', ports: [{ id: 'top', side: 'top', offset: 0.25 }] },
  ]
  const links = [{ id: 'pq', from: 'p', to: 'q', fromPort: 'down', toPort: 'top' }]
  const layout = routeGraphPorts(layoutLayeredGraph(ported, links), byId(ported), links, 'LR')
  const routed = routeGraphEdges(layout, links, byId(ported), { style: 'orthogonal' })
  const path = routed.paths.get('pq')
  const ends = graphPathEndpoints(path)
  const p = layout.boxes.get('p'), q = layout.boxes.get('q')
  assert.deepEqual(ends.start, { x: p.x + p.width / 2, y: p.y + p.height })
  assert.deepEqual(ends.end, { x: q.x + q.width / 4, y: q.y })
  const parts = segments(path)
  for (const [from, to] of parts) assert.ok(from.x === to.x || from.y === to.y, path)
  // Leaves downward from the bottom port and enters the top port downward.
  assert.equal(parts[0][0].x, parts[0][1].x)
  assert.ok(parts[0][1].y > parts[0][0].y)
  assert.ok(parts.at(-1)[1].y > parts.at(-1)[0].y)

  const waypoints = [{ x: 300, y: 200 }, { x: 400, y: 260 }]
  const through = routeGraphEdges(layoutLayeredGraph(nodes, edges), [{ ...edges[0], points: waypoints }], byId(nodes), { style: 'orthogonal' })
  const route = segments(through.paths.get('ab'))
  for (const [from, to] of route) assert.ok(from.x === to.x || from.y === to.y)
  // Every waypoint lies on the route (a waypoint on a straight run is not a corner).
  const covers = ([from, to], point) => Math.min(from.x, to.x) <= point.x && point.x <= Math.max(from.x, to.x)
    && Math.min(from.y, to.y) <= point.y && point.y <= Math.max(from.y, to.y)
  for (const point of waypoints) assert.ok(route.some(segment => covers(segment, point)), JSON.stringify(point))
  // Routes through far waypoints widen the layout.
  assert.ok(through.height >= 268)
})

test('straight routes clip to the box borders, pass through waypoints and draw self-loops as brackets', () => {
  for (const direction of ['LR', 'TB', 'RL', 'BT']) {
    const layout = applyGraphPositions(layoutLayeredGraph(nodes, edges, { direction }), edges, new Map([['e', { x: 500, y: 400 }]]), direction)
    const routed = routeGraphEdges(layout, edges, byId(nodes), { style: 'straight', direction })
    for (const edge of edges) {
      const path = routed.paths.get(edge.id)
      const ends = graphPathEndpoints(path)
      assert.ok(onBorder(layout.boxes.get(edge.from), ends.start), direction + ' ' + edge.id + ' ' + path)
      assert.ok(onBorder(layout.boxes.get(edge.to), ends.end), direction + ' ' + edge.id + ' ' + path)
      if (edge.from !== edge.to) assert.equal(segments(path).length, 1)
    }
    // A self-loop leaves and re-enters the outgoing side.
    assert.equal(segments(routed.paths.get('aa')).length, 3)
  }
  const layout = layoutLayeredGraph(nodes, edges)
  const routed = routeGraphEdges(layout, [{ ...edges[0], points: [{ x: 190, y: 200 }] }], byId(nodes), { style: 'straight' })
  const path = routed.paths.get('ab')
  assert.match(path, / L 190 200 L /)
  // The clip points lie on the lines towards the waypoint.
  const ends = graphPathEndpoints(path)
  assert.ok(onBorder(layout.boxes.get('a'), ends.start) && onBorder(layout.boxes.get('b'), ends.end))
  // The label sits halfway along the route, 6 units above it.
  const label = routed.edgeLabels.get('ab')
  assert.ok(Math.abs(label.x - 190) < 1 && Math.abs(label.y - 194) < 1, JSON.stringify(label))
  // The curve style draws a smooth curve through waypoints and leaves other edges alone.
  const curved = routeGraphEdges(layout, [{ ...edges[0], points: [{ x: 190, y: 200 }] }, edges[1]], byId(nodes))
  assert.match(curved.paths.get('ab'), /^M [\d.]+ [\d.]+ C .* 190 200 C /)
  assert.equal(curved.paths.get('bc'), layout.paths.get('bc'))
  assert.equal(graphSmoothPath([{ x: 0, y: 0 }, { x: 6, y: 0 }]), 'M 0 0 C 1 0, 5 0, 6 0')
  assert.equal(graphPolylinePath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 4 }], 3), 'M 0 0 L 8 0 Q 10 0 10 2 L 10 4')
})

test('applyGraphSizes resizes boxes, reroutes incident edges and leaves other routes alone', () => {
  assert.equal(rootSizes, applyGraphSizes)
  const layout = freeze(layoutLayeredGraph(nodes, edges))
  assert.equal(applyGraphSizes(layout, edges, new Map()), layout)
  assert.equal(applyGraphSizes(layout, edges, new Map([['b', { width: 144, height: 58 }], ['zz', { width: 5, height: 5 }]])), layout)
  const sized = applyGraphSizes(layout, edges, new Map([['b', { width: 200, height: 100 }]]))
  assert.deepEqual(sized.boxes.get('b'), { ...layout.boxes.get('b'), width: 200, height: 100 })
  assert.equal(sized.paths.get('cd'), layout.paths.get('cd'))
  assert.notEqual(sized.paths.get('ab'), layout.paths.get('ab'))
  const b = sized.boxes.get('b')
  const ends = graphPathEndpoints(sized.paths.get('ab'))
  assert.deepEqual(ends.end, { x: b.x, y: b.y + 50 })
  assert.ok(sized.width >= b.x + 200)
  for (const size of [{ width: 0, height: 10 }, { width: 10, height: NaN }, { width: -1, height: 10 }]) {
    assert.throws(() => applyGraphSizes(layout, edges, new Map([['b', size]])), RangeError)
  }
  // TB reroutes vertically.
  const tb = layoutLayeredGraph(nodes, edges, { direction: 'TB' })
  const tall = applyGraphSizes(tb, edges, new Map([['a', { width: 300, height: 90 }]]), 'TB')
  const a = tall.boxes.get('a')
  assert.deepEqual(graphPathEndpoints(tall.paths.get('ab')).start, { x: a.x + 150, y: a.y + 90 })
})

test('position and size overlays name the edge and node when an incident edge has no layout box', () => {
  const layout = freeze(layoutLayeredGraph(nodes, edges))
  const stray = [...edges, { id: 'ax', from: 'a', to: 'x' }]
  const message = 'Graph edge ax references a node that is not in the layout: x'
  const moved = new Map([['a', { x: 500, y: 500 }]])
  assert.throws(() => applyGraphPositions(layout, stray, moved), { name: 'Error', message })
  assert.throws(() => applyGraphSizes(layout, stray, new Map([['a', { width: 300, height: 90 }]])), { name: 'Error', message })
  assert.throws(() => graphEdgeEndpoint(layout, new Map(), stray.at(-1), 'to', 'LR'), { name: 'Error', message })
  assert.throws(() => graphEdgeEndpoint(layout, new Map(), { from: 'y', to: 'a' }, 'from', 'LR'), {
    name: 'Error', message: 'Graph edge y → a references a node that is not in the layout: y',
  })
})

test('position and size overlays validate entries of unknown node IDs alike', () => {
  const layout = freeze(layoutLayeredGraph(nodes, edges))
  // Valid entries for unknown IDs are ignored by both overlays.
  assert.equal(applyGraphPositions(layout, edges, new Map([['zz', { x: 5, y: 5 }]])), layout)
  assert.equal(applyGraphSizes(layout, edges, new Map([['zz', { width: 5, height: 5 }]])), layout)
  // Invalid entries throw whether or not the node exists.
  for (const id of ['a', 'zz']) {
    assert.throws(() => applyGraphPositions(layout, edges, new Map([[id, { x: -1, y: 5 }]])), RangeError)
    assert.throws(() => applyGraphPositions(layout, edges, new Map([[id, { x: 5, y: Number.NaN }]])), RangeError)
    assert.throws(() => applyGraphSizes(layout, edges, new Map([[id, { width: 0, height: 5 }]])), RangeError)
  }
})
