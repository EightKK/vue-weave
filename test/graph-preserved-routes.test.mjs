import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  applyGraphPositions, applyGraphSizes, completeGraphLayout, graphPathEndpoints, isGraphRouteValid, layoutLayeredGraph, routeGraphEdges, routeGraphPorts,
} from 'vue-weave/core'
import { completeGraphLayout as rootComplete, isGraphRouteValid as rootValid } from 'vue-weave'
import { byId } from './helpers/builders.mjs'

const nodes = [
  { id: 'a', label: 'A', ports: [{ id: 'out', side: 'right', offset: 0.25 }] },
  { id: 'b', label: 'B', ports: [{ id: 'in', side: 'left' }] },
  { id: 'c', label: 'C' },
]
const edges = [
  { id: 'ab', from: 'a', to: 'b', fromPort: 'out', toPort: 'in' },
  { id: 'ac', from: 'a', to: 'c' },
  { id: 'bc', from: 'b', to: 'c' },
]
const box = (x, y) => ({ x, y, width: 100, height: 40, rank: 0 })
// A layout from an external engine: a polyline between the named ports, with route metadata, and two curves without.
function external() {
  return {
    boxes: new Map([['a', box(20, 20)], ['b', box(220, 20)], ['c', box(220, 120)]]),
    paths: new Map([
      ['ab', 'M 120 30 L 170 30 L 170 40 L 220 40'],
      ['ac', 'M 120 40 C 170 40, 170 140, 220 140'],
      ['bc', 'M 270 60 Q 300 90 270 120'],
    ]),
    edgeLabels: new Map([['ab', { x: 170, y: 28 }], ['ac', { x: 170, y: 90 }], ['bc', { x: 290, y: 90 }]]),
    width: 400,
    height: 200,
    routes: new Map([['ab', {
      start: { x: 120, y: 30 }, end: { x: 220, y: 40 }, fromPort: 'out', toPort: 'in', fromSide: 'right', toSide: 'left',
      points: [{ x: 170, y: 30 }, { x: 170, y: 40 }],
    }]]),
  }
}
// The full routing pipeline NetworkGraph runs on a layout.
function pipeline(layout, options = {}) {
  const { positions, sizes, policy, style = 'curve', edgeList = edges, nodeList = nodes } = options
  const placed = positions ? applyGraphPositions(layout, edgeList, positions) : layout
  const sized = sizes ? applyGraphSizes(placed, edgeList, sizes) : placed
  const ported = routeGraphPorts(sized, byId(nodeList), edgeList, 'LR', { policy })
  return routeGraphEdges(ported, edgeList, byId(nodeList), { style, policy })
}

test('the preserve policy keeps an external route between named ports that builtin redraws', () => {
  const layout = external()
  const builtin = routeGraphPorts(layout, byId(nodes), edges, 'LR')
  assert.notEqual(builtin.paths.get('ab'), layout.paths.get('ab'))
  const preserved = routeGraphPorts(layout, byId(nodes), edges, 'LR', { policy: 'preserve' })
  assert.equal(preserved.paths.get('ab'), layout.paths.get('ab'))
  assert.deepEqual(preserved.edgeLabels.get('ab'), layout.edgeLabels.get('ab'))
  assert.deepEqual(preserved.routes, layout.routes)
  // Kept in every edge style, even where builtin draws every edge again.
  for (const style of ['curve', 'orthogonal', 'straight']) {
    const routed = pipeline(external(), { policy: 'preserve', style })
    for (const edge of edges) assert.equal(routed.paths.get(edge.id), layout.paths.get(edge.id), style + ' ' + edge.id)
  }
  // Builtin replaces the metadata of the edges it redraws and keeps the shape of the routes.
  assert.deepEqual(builtin.routes.get('ab').start, { x: 120, y: 30 })
  assert.deepEqual(builtin.routes.get('ab').end, { x: 220, y: 40 })
  assert.deepEqual(builtin.routes.get('ab').points, [])
  assert.equal(layout.paths.get('ab'), 'M 120 30 L 170 30 L 170 40 L 220 40', 'the input is not modified')
  assert.equal(rootValid, isGraphRouteValid)
  assert.equal(rootComplete, completeGraphLayout)
})

test('a changed port or route metadata that no longer fits falls back to built-in routing', () => {
  const movedPort = nodes.map(node => node.id === 'a' ? { ...node, ports: [{ id: 'out', side: 'right', offset: 0.75 }] } : node)
  const otherSide = nodes.map(node => node.id === 'b' ? { ...node, ports: [{ id: 'in', side: 'top' }] } : node)
  const renamed = edges.map(edge => edge.id === 'ab' ? { ...edge, fromPort: undefined } : edge)
  for (const [name, nodeList, edgeList] of [['offset', movedPort, edges], ['side', otherSide, edges], ['edge port', nodes, renamed]]) {
    const layout = external()
    assert.equal(isGraphRouteValid(layout, byId(nodeList), edgeList[0]), false, name)
    const preserved = routeGraphPorts(layout, byId(nodeList), edgeList, 'LR', { policy: 'preserve' })
    const builtin = routeGraphPorts(layout, byId(nodeList), edgeList, 'LR')
    assert.equal(preserved.paths.get('ab'), builtin.paths.get('ab'), name)
    assert.notEqual(preserved.paths.get('ab'), layout.paths.get('ab'), name)
  }
  // Metadata that disagrees with the edge or with the path.
  const cases = {
    side: { fromSide: 'top' },
    port: { toPort: 'other' },
    start: { start: { x: 120, y: 31 } },
    point: { points: [{ x: Number.NaN, y: 0 }] },
  }
  for (const [name, change] of Object.entries(cases)) {
    const layout = external()
    layout.routes.set('ab', { ...layout.routes.get('ab'), ...change })
    assert.equal(isGraphRouteValid(layout, byId(nodes), edges[0]), false, name)
  }
  // Without metadata the path ends are checked against the boxes.
  const layout = external()
  assert.equal(isGraphRouteValid(layout, byId(nodes), edges[1]), true)
  layout.paths.set('ac', 'M 110 40 C 170 40, 170 140, 220 140')
  assert.equal(isGraphRouteValid(layout, byId(nodes), edges[1]), false)
  layout.paths.set('ac', 'not a path')
  assert.equal(isGraphRouteValid(layout, byId(nodes), edges[1]), false)
  layout.paths.delete('ac')
  assert.equal(isGraphRouteValid(layout, byId(nodes), edges[1]), false)
})

test('only the edges of a moved or resized node are rerouted; unrelated routes stay', () => {
  const layout = external()
  const positions = new Map([['c', { x: 240, y: 150 }]])
  const placed = applyGraphPositions(layout, edges, positions)
  // The metadata of a rerouted edge is removed; the rest is carried over.
  assert.deepEqual([...placed.routes.keys()], ['ab'])
  assert.notEqual(placed.paths.get('ac'), layout.paths.get('ac'))
  for (const style of ['curve', 'orthogonal', 'straight']) {
    const preserved = pipeline(external(), { positions, policy: 'preserve', style })
    const builtin = pipeline(external(), { positions, style })
    assert.equal(preserved.paths.get('ab'), layout.paths.get('ab'), style)
    for (const id of ['ac', 'bc']) assert.equal(preserved.paths.get(id), builtin.paths.get(id), style + ' ' + id)
  }
  // The same for a resize, and for a move of a ported node.
  const resized = pipeline(external(), { sizes: new Map([['c', { width: 140, height: 60 }]]), policy: 'preserve', style: 'orthogonal' })
  assert.equal(resized.paths.get('ab'), layout.paths.get('ab'))
  assert.equal(isGraphRouteValid(applyGraphSizes(external(), edges, new Map([['c', { width: 140, height: 60 }]])), byId(nodes), edges[1]), false)
  const movedA = new Map([['a', { x: 30, y: 30 }]])
  const preserved = pipeline(external(), { positions: movedA, policy: 'preserve', style: 'orthogonal' })
  const builtin = pipeline(external(), { positions: movedA, style: 'orthogonal' })
  assert.equal(preserved.paths.get('bc'), layout.paths.get('bc'))
  assert.equal(preserved.paths.get('ab'), builtin.paths.get('ab'))
  assert.equal(preserved.paths.get('ac'), builtin.paths.get('ac'))
  const ends = graphPathEndpoints(preserved.paths.get('ab'))
  assert.deepEqual(ends.start, { x: 130, y: 40 })
})

test('explicit edge points win over a preserved route', () => {
  const withPoints = edges.map(edge => edge.id === 'ac' ? { ...edge, points: [{ x: 180, y: 100 }] } : edge)
  for (const style of ['curve', 'orthogonal', 'straight']) {
    const preserved = pipeline(external(), { edgeList: withPoints, policy: 'preserve', style })
    const builtin = pipeline(external(), { edgeList: withPoints, style })
    assert.equal(preserved.paths.get('ac'), builtin.paths.get('ac'), style)
    assert.notEqual(preserved.paths.get('ac'), external().paths.get('ac'))
    assert.equal(preserved.paths.get('bc'), external().paths.get('bc'))
    // The redrawn edge gets new metadata (an orthogonal route may merge the waypoint into a straight run).
    const route = preserved.routes.get('ac')
    const drawn = graphPathEndpoints(preserved.paths.get('ac')).start
    assert.ok(Math.abs(route.start.x - drawn.x) < 0.01 && Math.abs(route.start.y - drawn.y) < 0.01, style)
    if (style !== 'orthogonal') assert.deepEqual(route.points, [{ x: 180, y: 100 }], style)
  }
  assert.equal(isGraphRouteValid(external(), byId(nodes), withPoints[1]), false)
})

test('the default policy is unchanged and layouts without metadata get none', () => {
  const layered = layoutLayeredGraph(nodes, edges)
  const positions = new Map([['b', { x: 400, y: 200 }]])
  for (const style of ['curve', 'orthogonal', 'straight']) {
    const plain = routeGraphEdges(routeGraphPorts(applyGraphPositions(layered, edges, positions), byId(nodes), edges, 'LR'), edges, byId(nodes), { style })
    const explicit = pipeline(layered, { positions, policy: 'builtin', style })
    assert.deepEqual(explicit, plain)
    assert.equal('routes' in plain, false)
  }
  assert.equal('routes' in applyGraphSizes(layered, edges, new Map([['a', { width: 10, height: 10 }]])), false)
  assert.throws(() => routeGraphPorts(layered, byId(nodes), edges, 'LR', { policy: 'keep' }), RangeError)
  assert.throws(() => routeGraphEdges(layered, edges, byId(nodes), { policy: 'keep' }), RangeError)
})

test('completeGraphLayout adds temporary routes for new edges whose boxes exist', () => {
  const layout = external()
  const connected = [...edges, { id: 'ca', from: 'c', to: 'a' }, { id: 'cb', from: 'c', to: 'b', toPort: 'in' }, { id: 'cx', from: 'c', to: 'x' }]
  const result = completeGraphLayout(layout, nodes, connected)
  assert.deepEqual(result.temporaryEdgeIds, ['ca', 'cb'])
  assert.deepEqual(result.unresolvedEdgeIds, ['cx'])
  assert.ok(result.layout.paths.has('ca') && result.layout.edgeLabels.has('ca'))
  assert.deepEqual(graphPathEndpoints(result.layout.paths.get('cb')).end, { x: 220, y: 40 })
  for (const id of ['ab', 'ac', 'bc']) assert.equal(result.layout.paths.get(id), layout.paths.get(id))
  assert.equal(layout.paths.has('ca'), false, 'the input is not modified')
  assert.deepEqual(completeGraphLayout(layout, nodes, edges), { layout, temporaryEdgeIds: [], unresolvedEdgeIds: [] })
  // Temporary routes count as built-in routes, so the preserve policy redraws them in the edge style.
  const complete = connected.slice(0, 5)
  assert.equal(isGraphRouteValid(result.layout, byId(nodes), complete[3]), false)
  const routed = routeGraphEdges(result.layout, complete, byId(nodes), { style: 'orthogonal', policy: 'preserve' })
  assert.equal(routed.paths.get('ac'), layout.paths.get('ac'))
  assert.match(routed.paths.get('ca'), /^M [\d.]+ [\d.]+( L [\d.]+ [\d.]+)+$/)
  assert.throws(() => completeGraphLayout(layout, nodes, connected, { direction: 'XY' }), RangeError)
})
