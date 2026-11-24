import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  applyGraphPositions, applyGraphSizes, createGraphRouteCache, layoutLayeredGraph, routeGraphEdges, routeGraphPorts,
} from '@eightkk/vue-weave/core'
import { byId, deepFreeze } from './helpers/builders.mjs'
import { createPrng } from './helpers/prng.mjs'

// A random graph with shapes, ports, parallel edges, self-loops, waypoints and per-edge styles.
function randomGraph(random, size) {
  const nodes = [], edges = []
  for (let i = 0; i < size; i++) {
    const node = { id: 'n' + i }
    if (random.chance(0.1)) node.shape = random.pick(['diamond', 'ellipse', 'stadium'])
    if (random.chance(0.1)) node.ports = [{ id: 'out', side: 'right' }, { id: 'up', side: 'top', offset: 0.3 }]
    nodes.push(node)
  }
  for (let i = 1; i < size; i++) {
    const from = 'n' + random.int(0, i - 1), to = 'n' + i
    const edge = { id: 'e' + i, from, to }
    if (random.chance(0.1)) edge.edgeStyle = random.pick(['straight', 'curve'])
    if (random.chance(0.05)) edge.points = [{ x: random.int(0, 1200), y: random.int(0, 600) }]
    if (nodes[Number(from.slice(1))].ports && random.chance(0.5)) edge.fromPort = 'out'
    edges.push(edge)
    if (random.chance(0.05)) edges.push({ id: 'p' + i, from, to })
    if (random.chance(0.03)) edges.push({ id: 'l' + i, from: to, to })
  }
  return { nodes, edges }
}

// Routes a sequence of edits with one cache and checks every result against routing without a cache.
function assertSameAsUncached(seed, { size = 60, steps = 10, options }) {
  const random = createPrng(seed)
  const { nodes, edges } = randomGraph(random, size)
  const nodesById = byId(nodes)
  const direction = options.direction ?? 'LR'
  const base = layoutLayeredGraph(nodes, edges, { direction })
  const cache = createGraphRouteCache()
  let positions = new Map(), sizes = new Map()
  for (let step = 0; step < steps; step++) {
    if (step) {
      positions = new Map(positions)
      sizes = new Map(sizes)
      for (let k = random.int(1, 3); k > 0; k--) {
        const id = 'n' + random.int(0, size - 1), box = base.boxes.get(id)
        // Moves along one axis, both axes, or back to an earlier place; now and then a resize.
        const dx = random.chance(0.3) ? 0 : random.int(-150, 150), dy = random.chance(0.3) ? 0 : random.int(-120, 120)
        positions.set(id, { x: Math.max(0, box.x + dx), y: Math.max(0, box.y + dy) })
        if (random.chance(0.15)) sizes.set(id, { width: random.int(60, 200), height: random.int(30, 90) })
      }
    }
    const placed = positions.size ? applyGraphPositions(base, edges, positions, direction) : base
    const sized = sizes.size ? applyGraphSizes(placed, edges, sizes, direction) : placed
    const ported = routeGraphPorts(sized, nodesById, edges, direction, { policy: options.policy })
    const expected = routeGraphEdges(ported, edges, nodesById, options)
    const actual = routeGraphEdges(ported, edges, nodesById, { ...options, cache })
    assert.deepEqual(actual, expected, `seed ${seed}, step ${step}`)
    assert.deepEqual([...actual.paths.keys()], [...expected.paths.keys()], `path order, seed ${seed}, step ${step}`)
  }
}

test('routeGraphEdges with a cache returns what it returns without one, across moves and resizes', () => {
  const variants = [
    { style: 'orthogonal', avoidNodes: true, cornerRadius: 6 },
    { style: 'orthogonal', avoidNodes: { clearance: 0, bendPenalty: 10 }, direction: 'TB' },
    { style: 'orthogonal', avoidNodes: true, parallelSpacing: 8 },
    { style: 'orthogonal' },
    { style: 'straight', parallelSpacing: 6 },
    { style: 'curve', avoidNodes: true },
    { style: 'orthogonal', avoidNodes: true, policy: 'preserve' },
  ]
  variants.forEach((options, i) => {
    for (let seed = 1; seed <= 3; seed++) assertSameAsUncached(100 * i + seed, { options })
  })
})

test('a route cache reuses unchanged routes and drops edges that are gone', () => {
  const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
  const edges = [{ id: 'ab', from: 'a', to: 'b' }, { id: 'cd', from: 'c', to: 'd' }]
  const nodesById = byId(nodes)
  const options = { style: 'orthogonal', avoidNodes: true }
  const layout = routeGraphPorts(layoutLayeredGraph(nodes, edges), nodesById, edges, 'LR')
  const cache = createGraphRouteCache()
  const first = routeGraphEdges(layout, edges, nodesById, { ...options, cache })
  // The same input again, a removed edge, a changed waypoint and a new edge all match routing without the cache.
  assert.deepEqual(routeGraphEdges(layout, edges, nodesById, { ...options, cache }), first)
  const fewer = [edges[0]]
  assert.deepEqual(routeGraphEdges(layout, fewer, nodesById, { ...options, cache }), routeGraphEdges(layout, fewer, nodesById, options))
  const bent = [{ ...edges[0], points: [{ x: 100, y: 200 }] }, edges[1]]
  assert.deepEqual(routeGraphEdges(layout, bent, nodesById, { ...options, cache }), routeGraphEdges(layout, bent, nodesById, options))
  const more = [...edges, { id: 'ac', from: 'a', to: 'c' }]
  const wider = routeGraphPorts(layoutLayeredGraph(nodes, more), nodesById, more, 'LR')
  assert.deepEqual(routeGraphEdges(wider, more, nodesById, { ...options, cache }), routeGraphEdges(wider, more, nodesById, options))
  // Other options route every edge again.
  assert.deepEqual(
    routeGraphEdges(layout, edges, nodesById, { style: 'straight', cache }), routeGraphEdges(layout, edges, nodesById, { style: 'straight' }),
  )
})

test('a changed node shape or port reroutes its edges even when the node object is changed in place', () => {
  const nodes = [{ id: 'a', ports: [{ id: 'out', side: 'right' }] }, { id: 'b' }]
  const edges = [{ id: 'ab', from: 'a', to: 'b', fromPort: 'out' }]
  const options = { style: 'orthogonal', avoidNodes: true }
  const layout = routeGraphPorts(layoutLayeredGraph(nodes, edges), byId(nodes), edges, 'LR')
  const cache = createGraphRouteCache()
  routeGraphEdges(layout, edges, byId(nodes), { ...options, cache })
  nodes[0].ports[0].side = 'bottom'
  nodes[1].shape = 'diamond'
  assert.deepEqual(routeGraphEdges(layout, edges, byId(nodes), { ...options, cache }), routeGraphEdges(layout, edges, byId(nodes), options))
})

test('results of a cached call share no objects with later results', () => {
  const nodes = [{ id: 'a' }, { id: 'b' }]
  const edges = [{ id: 'ab', from: 'a', to: 'b' }]
  const options = { style: 'orthogonal', avoidNodes: true }
  const layout = deepFreeze(routeGraphPorts(layoutLayeredGraph(nodes, edges), byId(nodes), edges, 'LR'))
  const cache = createGraphRouteCache()
  const first = routeGraphEdges(layout, edges, byId(nodes), { ...options, cache })
  const label = { ...first.edgeLabels.get('ab') }
  first.edgeLabels.get('ab').x += 1000
  assert.deepEqual(routeGraphEdges(layout, edges, byId(nodes), { ...options, cache }).edgeLabels.get('ab'), label)
})

test('routeGraphEdges rejects a cache that does not come from createGraphRouteCache', () => {
  const nodes = [{ id: 'a' }, { id: 'b' }]
  const edges = [{ id: 'ab', from: 'a', to: 'b' }]
  const layout = layoutLayeredGraph(nodes, edges)
  assert.throws(
    () => routeGraphEdges(layout, edges, byId(nodes), { style: 'orthogonal', cache: { graphRouteCache: true } }),
    { name: 'Error', message: 'The route cache must come from createGraphRouteCache' },
  )
})

test('a node moved onto a long-edge lane it does not touch reroutes that edge with a cache too', () => {
  // Columns of five nodes; edge `long` runs in a lane the layered layout draws over the top of the middle columns.
  const nodes = [], edges = []
  for (let i = 0; i < 20; i++) {
    nodes.push({ id: 'n' + i })
    if (i % 5) edges.push({ id: 'd' + i, from: 'n' + (i - 1), to: 'n' + i })
    if (i >= 5) edges.push({ id: 'r' + i, from: 'n' + (i - 5), to: 'n' + i })
  }
  edges.push({ id: 'long', from: 'n1', to: 'n16' })
  const nodesById = byId(nodes)
  const base = layoutLayeredGraph(nodes, edges)
  const options = { style: 'orthogonal', avoidNodes: true }
  const cache = createGraphRouteCache()
  const route = positions => {
    const ported = routeGraphPorts(positions ? applyGraphPositions(base, edges, positions, 'LR') : base, nodesById, edges, 'LR')
    const expected = routeGraphEdges(ported, edges, nodesById, options)
    assert.deepEqual(routeGraphEdges(ported, edges, nodesById, { ...options, cache }), expected)
    return expected.paths.get('long')
  }
  const lane = route()
  assert.match(lane, /^M[\d\s.HV]+$/)
  // n19, at the far end of the graph, dropped across the lane, then moved back.
  assert.notEqual(route(new Map([['n19', { x: 500, y: 0 }]])), lane)
  assert.equal(route(), lane)
})
