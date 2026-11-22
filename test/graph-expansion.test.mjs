import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  countGraphCrossings, filterGraph, findGraphCycles, graphEdgeEndpoint, graphNeighborhood, indexGraph, layoutLayeredGraph,
  layoutRadialGraph, layoutTreeGraph, searchGraphNodes, shortestGraphPath, topologicalOrder,
} from '@eightkk/vue-weave/core'
import { chainEdges, graphEdges, graphNodes, nodeIds } from './helpers/builders.mjs'
import { seededRandom } from './helpers/seeded.mjs'

const nodes = (...ids) => graphNodes(ids, id => id.toUpperCase() + ' node')
const edges = (...pairs) => graphEdges(pairs, 'e')

const crossed = [nodes('a', 'b', 'c', 'd'), edges(['a', 'd'], ['b', 'c'])]

function boxesOverlap(a, b) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

function assertNoOverlap(layout) {
  const boxes = [...layout.boxes.values()]
  for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.equal(boxesOverlap(boxes[i], boxes[j]), false)
  for (const box of boxes) {
    assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= layout.width + 1e-9 && box.y + box.height <= layout.height + 1e-9)
  }
}

test('crossing reduction is opt-in and lowers crossings', () => {
  const [n, e] = crossed
  const plain = layoutLayeredGraph(n, e)
  assert.deepEqual(layoutLayeredGraph(n, e, { crossingReduction: 'none' }), plain)
  assert.equal(countGraphCrossings(plain, e), 1)
  for (const crossingReduction of ['barycenter', 'median']) {
    const better = layoutLayeredGraph(n, e, { crossingReduction })
    assert.equal(countGraphCrossings(better, e), 0)
    assert.deepEqual(better, layoutLayeredGraph(n, e, { crossingReduction }))
    assert.equal(better.boxes.get('d').y < better.boxes.get('c').y, true)
  }
})

test('countGraphCrossings validates the direction, the edge ends and the boxes it measures', () => {
  const [n, e] = crossed
  const layout = layoutLayeredGraph(n, e)
  for (const direction of ['LR', 'RL', 'TB', 'BT']) assert.equal(typeof countGraphCrossings(layout, e, direction), 'number')
  assert.throws(() => countGraphCrossings(layout, e, 'XY'), { name: 'RangeError', message: 'Unknown layout direction' })
  assert.throws(() => countGraphCrossings(layout, edges(['a', 'zz'])), { name: 'Error', message: 'Unknown node in graph edge e0: zz' })
  const boxes = new Map(layout.boxes)
  boxes.set('d', { ...boxes.get('d'), y: Number.NaN })
  assert.throws(() => countGraphCrossings({ ...layout, boxes }, e), { name: 'RangeError', message: 'Graph box geometry must be finite: d' })
  boxes.set('d', { ...layout.boxes.get('d'), rank: undefined })
  assert.throws(() => countGraphCrossings({ ...layout, boxes }, e), RangeError)
  // Boxes that no edge ends at are not measured.
  boxes.set('d', layout.boxes.get('d'))
  boxes.set('extra', { x: Number.NaN, y: 0, width: 1, height: 1, rank: 0 })
  assert.equal(countGraphCrossings({ ...layout, boxes }, e), 1)
})

test('crossing reduction handles a denser bipartite graph and never worsens the input order', () => {
  const left = ['a', 'b', 'c', 'd', 'e', 'f'], right = ['g', 'h', 'i', 'j', 'k', 'l']
  const n = nodes(...left, ...right)
  const e = edges(...left.map((id, i) => [id, right[right.length - 1 - i]]), ['a', 'h'], ['f', 'k'])
  const plain = layoutLayeredGraph(n, e)
  const reduced = layoutLayeredGraph(n, e, { crossingReduction: 'barycenter' })
  assert.ok(countGraphCrossings(plain, e) > 0)
  assert.ok(countGraphCrossings(reduced, e) < countGraphCrossings(plain, e))
  assert.deepEqual(new Set(reduced.boxes.keys()), new Set(plain.boxes.keys()))
  assertNoOverlap(reduced)
})

test('crossing reduction validates options and lays out 12,000-node chains without recursion', () => {
  assert.throws(() => layoutLayeredGraph([], [], { crossingReduction: 'bogus' }), RangeError)
  assert.throws(() => layoutLayeredGraph([], [], { crossingSweeps: 0 }), RangeError)
  const ids = nodeIds(12000)
  const layout = layoutLayeredGraph(nodes(...ids), chainEdges(ids), { crossingReduction: 'barycenter' })
  assert.equal(layout.boxes.size, 12000)
  // One node per rank: a chain has nothing to reorder, so every node stays on the first row.
  assert.equal(layout.boxes.get('n11999').rank, 11999)
  assert.equal(new Set([...layout.boxes.values()].map(box => box.y)).size, 1)
})

test('RL and BT mirror LR and TB consistently', () => {
  const n = nodes('a', 'b', 'c', 'd')
  const e = [...edges(['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd'], ['a', 'd']), { id: 'loop', from: 'b', to: 'b', label: 'x' }]
  const lr = layoutLayeredGraph(n, e)
  const rl = layoutLayeredGraph(n, e, { direction: 'RL' })
  assert.equal(rl.width, lr.width)
  assert.equal(rl.height, lr.height)
  for (const [id, box] of lr.boxes) {
    const mirrored = rl.boxes.get(id)
    assert.equal(mirrored.x, lr.width - box.x - box.width)
    assert.equal(mirrored.y, box.y)
    assert.equal(mirrored.rank, box.rank)
  }
  assert.ok(rl.boxes.get('a').x > rl.boxes.get('d').x)
  const tb = layoutLayeredGraph(n, e, { direction: 'TB' })
  const bt = layoutLayeredGraph(n, e, { direction: 'BT' })
  for (const [id, box] of tb.boxes) assert.equal(bt.boxes.get(id).y, tb.height - box.y - box.height)
  assert.ok(bt.boxes.get('a').y > bt.boxes.get('d').y)
  for (const layout of [rl, bt]) {
    assert.deepEqual(new Set(layout.paths.keys()), new Set(e.map(edge => edge.id)))
    assert.deepEqual(new Set(layout.edgeLabels.keys()), new Set(e.map(edge => edge.id)))
    for (const path of layout.paths.values()) {
      const numbers = path.match(/-?\d+(\.\d+)?/g).map(Number)
      assert.ok(numbers.every(Number.isFinite))
    }
  }
  // The first path point of a forward edge starts at the mirrored source side.
  const start = rl.paths.get('e0').match(/^M (\S+) (\S+)/)
  assert.equal(Number(start[1]), rl.boxes.get('a').x)
  assert.equal(graphEdgeEndpoint(rl, new Map(), e[0], 'from', 'RL').x, rl.boxes.get('a').x)
  assert.equal(graphEdgeEndpoint(bt, new Map(), e[0], 'from', 'BT').side, 'top')
  assert.equal(graphEdgeEndpoint(rl, new Map(), e[0], 'to', 'RL').side, 'right')
})

test('tree layout centres parents over children, handles forests and routes non-tree edges', () => {
  const n = nodes('r', 'a', 'b', 'c', 'x', 'y')
  const e = edges(['r', 'a'], ['r', 'b'], ['a', 'c'], ['x', 'y'], ['c', 'b'], ['b', 'r'], ['a', 'a'])
  const layout = layoutTreeGraph(n, e)
  assertNoOverlap(layout)
  const mid = id => layout.boxes.get(id).y
  assert.equal(mid('r'), (mid('a') + mid('b')) / 2 === mid('r') ? mid('r') : NaN)
  assert.equal(layout.boxes.get('r').rank, 0)
  assert.equal(layout.boxes.get('c').rank, 2)
  assert.equal(layout.boxes.get('x').rank, 0)
  assert.deepEqual(new Set(layout.paths.keys()), new Set(e.map(edge => edge.id)))
  assert.deepEqual(layout, layoutTreeGraph(n, e))
  for (const direction of ['TB', 'RL', 'BT']) {
    const oriented = layoutTreeGraph(n, e, { direction })
    assertNoOverlap(oriented)
    assert.equal(oriented.paths.size, e.length)
  }
  const tb = layoutTreeGraph(n, e, { direction: 'TB' })
  assert.ok(tb.boxes.get('c').y > tb.boxes.get('r').y)
  assert.equal(tb.boxes.get('r').width, 144)
})

test('tree and radial layouts accept cycles, empty input and explicit roots', () => {
  const cycle = nodes('a', 'b', 'c')
  const e = edges(['a', 'b'], ['b', 'c'], ['c', 'a'])
  for (const layout of [layoutTreeGraph(cycle, e), layoutRadialGraph(cycle, e)]) {
    assert.equal(layout.boxes.size, 3)
    assert.equal(layout.paths.size, 3)
    assertNoOverlap(layout)
  }
  assert.equal(layoutTreeGraph(cycle, e, { roots: ['b'] }).boxes.get('b').rank, 0)
  assert.equal(layoutRadialGraph(cycle, e, { roots: ['c'] }).boxes.get('c').rank, 0)
  for (const empty of [layoutTreeGraph([], [], { padding: 0 }), layoutRadialGraph([], [], { padding: 0 })]) {
    assert.ok(empty.width > 0 && empty.height > 0)
  }
  assert.throws(() => layoutTreeGraph(cycle, e, { roots: ['zz'] }), { name: 'Error', message: 'Unknown node in roots: zz' })
  assert.throws(() => layoutRadialGraph(cycle, e, { roots: ['zz'] }), { name: 'Error', message: 'Unknown node in roots: zz' })
  assert.throws(() => layoutTreeGraph(cycle, e, { nodeWidth: 0 }), RangeError)
  assert.throws(() => layoutTreeGraph(cycle, e, { rowGap: -1 }), RangeError)
  assert.throws(() => layoutTreeGraph(cycle, e, { direction: 'up' }), RangeError)
  assert.throws(() => layoutRadialGraph(cycle, e, { ringGap: Infinity }), RangeError)
  assert.throws(() => layoutTreeGraph(cycle, edges(['a', 'zz'])), /Unknown node in graph edge .*: zz/)
})

test('radial layout places depth rings around a centred root without overlaps', () => {
  const ids = ['r', ...Array.from({ length: 20 }, (_, i) => 'n' + i)]
  const n = nodes(...ids)
  const e = edges(...ids.slice(1).map((id, i) => [i < 6 ? 'r' : 'n' + (i - 6), id]), ['n3', 'n3'])
  const layout = layoutRadialGraph(n, e)
  assertNoOverlap(layout)
  const centre = id => { const b = layout.boxes.get(id); return { x: b.x + b.width / 2, y: b.y + b.height / 2 } }
  const root = centre('r')
  const radius = id => Math.hypot(centre(id).x - root.x, centre(id).y - root.y)
  assert.ok(radius('n0') > 0)
  assert.ok(Math.abs(radius('n0') - radius('n1')) < 1e-6)
  assert.ok(radius('n6') > radius('n0'))
  assert.deepEqual(layout, layoutRadialGraph(n, e))
  // Disconnected roots share the first ring.
  const forest = layoutRadialGraph(nodes('a', 'b', 'c'), [])
  assertNoOverlap(forest)
  assert.equal(forest.boxes.size, 3)
})

test('tree layout of a 12,000-node chain is iterative', () => {
  const ids = nodeIds(12000)
  const chain = chainEdges(ids)
  assert.equal(layoutTreeGraph(nodes(...ids), chain).boxes.size, 12000)
  assert.equal(layoutRadialGraph(nodes(...ids), chain).boxes.size, 12000)
  assert.equal(findGraphCycles(nodes(...ids), chain).length, 0)
  assert.equal(topologicalOrder(nodes(...ids), chain).order.length, 12000)
})

test('topologicalOrder returns an order or reports blocked nodes', () => {
  const n = nodes('a', 'b', 'c', 'd')
  assert.deepEqual(topologicalOrder(n, edges(['c', 'b'], ['b', 'a'], ['c', 'd'])), { order: ['c', 'b', 'd', 'a'], acyclic: true, blocked: [] })
  const cyclic = topologicalOrder(n, edges(['a', 'b'], ['b', 'a'], ['b', 'c']))
  assert.equal(cyclic.acyclic, false)
  assert.deepEqual(cyclic.order, ['d'])
  assert.deepEqual(cyclic.blocked, ['a', 'b', 'c'])
  assert.equal(topologicalOrder(n, edges(['a', 'a'])).acyclic, false)
  assert.deepEqual(topologicalOrder([], []), { order: [], acyclic: true, blocked: [] })
  assert.throws(() => topologicalOrder(n, edges(['a', 'zz'])), Error)
})

test('findGraphCycles returns non-trivial components and self-loops', () => {
  const n = nodes('a', 'b', 'c', 'd', 'e', 'f', 'g')
  const e = edges(['a', 'b'], ['b', 'c'], ['c', 'a'], ['c', 'd'], ['d', 'e'], ['e', 'd'], ['f', 'f'], ['a', 'a'])
  assert.deepEqual(findGraphCycles(n, e), [['a', 'b', 'c'], ['d', 'e'], ['f']])
  assert.deepEqual(findGraphCycles(n, edges(['a', 'b'])), [])
  assert.deepEqual(findGraphCycles([], []), [])
})

test('findGraphCycles finds a 12,000-node single cycle without recursion', () => {
  const ids = nodeIds(12000)
  const cycles = findGraphCycles(nodes(...ids), chainEdges(ids, true))
  assert.equal(cycles.length, 1)
  assert.deepEqual(cycles[0], ids)
  assert.deepEqual(topologicalOrder(nodes(...ids), chainEdges(ids, true)).order, [])
})

test('shortestGraphPath supports BFS, Dijkstra, undirected search and unreachable targets', () => {
  const n = nodes('a', 'b', 'c', 'd', 'z')
  const e = [
    { id: 'ab', from: 'a', to: 'b', w: 1 }, { id: 'bd', from: 'b', to: 'd', w: 1 }, { id: 'ac', from: 'a', to: 'c', w: 5 },
    { id: 'cd', from: 'c', to: 'd', w: 5 }, { id: 'ad', from: 'a', to: 'd', w: 10 },
  ]
  assert.deepEqual(shortestGraphPath(n, e, 'a', 'd'), { nodeIds: ['a', 'd'], edgeIds: ['ad'], distance: 1 })
  assert.deepEqual(shortestGraphPath(n, e, 'a', 'd', { weight: edge => edge.w }), { nodeIds: ['a', 'b', 'd'], edgeIds: ['ab', 'bd'], distance: 2 })
  assert.deepEqual(shortestGraphPath(n, e, 'a', 'a'), { nodeIds: ['a'], edgeIds: [], distance: 0 })
  assert.equal(shortestGraphPath(n, e, 'd', 'a'), null)
  assert.deepEqual(shortestGraphPath(n, e, 'd', 'a', { directed: false, weight: edge => edge.w })?.nodeIds, ['d', 'b', 'a'])
  assert.equal(shortestGraphPath(n, e, 'a', 'z', { directed: false }), null)
  assert.throws(() => shortestGraphPath(n, e, 'a', 'nope'), { name: 'Error', message: 'Unknown node in toId: nope' })
  assert.throws(() => shortestGraphPath(n, e, 'nope', 'a'), { name: 'Error', message: 'Unknown node in fromId: nope' })
  assert.throws(() => shortestGraphPath(n, e, 'a', 'd', { weight: () => -1 }), RangeError)
  assert.throws(() => shortestGraphPath(n, e, 'a', 'd', { weight: () => NaN }), RangeError)
})

test('searchGraphNodes and filterGraph match text or predicates without mutating input', () => {
  const n = [{ id: 'db-1', label: 'Primary Database' }, { id: 'web', label: 'Frontend' }, { id: 'cache' }, { id: 'queue', label: 'Jobs' }]
  const e = edges(['web', 'cache'], ['cache', 'db-1'], ['db-1', 'queue'])
  const before = JSON.stringify([n, e])
  assert.deepEqual(searchGraphNodes(n, 'DATA').map(node => node.id), ['db-1'])
  assert.deepEqual(searchGraphNodes(n, 'db').map(node => node.id), ['db-1'])
  assert.deepEqual(searchGraphNodes(n, 'db', { fields: ['label'] }), [])
  assert.deepEqual(searchGraphNodes(n, '  ').length, 4)
  const direct = filterGraph(n, e, 'database')
  assert.deepEqual(direct.nodes.map(node => node.id), ['db-1'])
  assert.deepEqual(direct.edges, [])
  const near = filterGraph(n, e, 'database', { neighborhood: 1 })
  assert.deepEqual(near.nodes.map(node => node.id), ['db-1', 'cache', 'queue'])
  assert.deepEqual(near.edges.map(edge => edge.id), ['e1', 'e2'])
  assert.deepEqual(filterGraph(n, e, node => node.id !== 'cache').edges.map(edge => edge.id), ['e2'])
  assert.deepEqual(filterGraph(n, e, () => false), { nodes: [], edges: [] })
  assert.notEqual(near.nodes, n)
  assert.equal(JSON.stringify([n, e]), before)
  assert.throws(() => filterGraph(n, edges(['web', 'zz']), 'x'), Error)
  assert.throws(() => filterGraph(n, e, 'x', { neighborhood: -1 }), RangeError)
  assert.throws(() => filterGraph(n, e, 'x', { neighborhood: 1.5 }), { name: 'RangeError', message: 'neighborhood must be an integer ≥ 0 (got 1.5)' })
})

test('filterGraph keeps the union of the neighbourhoods of every match, walking each direction on its own', () => {
  const { pick } = seededRandom(4242)
  for (let round = 0; round < 40; round++) {
    const ids = nodeIds(3 + pick(25))
    const links = Array.from({ length: pick(40) }, (_, i) => ({ id: 'e' + i, from: ids[pick(ids.length)], to: ids[pick(ids.length)] }))
    const graph = graphNodes(ids)
    const matched = new Set(ids.filter(() => pick(4) === 0))
    const hops = pick(4)
    const index = indexGraph(graph, links)
    const expected = new Set([...matched].flatMap(id => [...graphNeighborhood(index, id, hops)]))
    const result = filterGraph(graph, links, node => matched.has(node.id), { neighborhood: hops })
    assert.deepEqual(result.nodes.map(node => node.id), ids.filter(id => expected.has(id)))
    assert.deepEqual(result.edges, links.filter(link => expected.has(link.from) && expected.has(link.to)))
  }
  // A shared parent does not pull in its other children.
  const shared = filterGraph(nodes('p', 'a', 'b'), edges(['p', 'a'], ['p', 'b']), node => node.id === 'a', { neighborhood: 5 })
  assert.deepEqual(shared.nodes.map(node => node.id), ['p', 'a'])
})

test('filterGraph walks once from every match, so a 20,000-node chain where every node matches stays linear', () => {
  const ids = nodeIds(20000)
  const chain = chainEdges(ids)
  // Each match used to walk the whole chain on its own, about 400 million steps; one walk from all matches visits
  // every node once per direction.
  const result = filterGraph(nodes(...ids), chain, () => true, { neighborhood: 20000 })
  assert.equal(result.nodes.length, 20000)
  assert.equal(result.edges.length, 19999)
  const tail = filterGraph(nodes(...ids), chain, node => node.id === 'n19999', { neighborhood: 20000 })
  assert.equal(tail.nodes.length, 20000)
  assert.deepEqual(filterGraph(nodes(...ids), chain, node => node.id === 'n10', { neighborhood: 2 }).nodes.map(node => node.id),
    ['n8', 'n9', 'n10', 'n11', 'n12'])
})

test('unnamed edge endpoints follow the drawn path after moves, in every direction and for custom layouts', async () => {
  const { applyGraphPositions, graphPathEndpoints, routeGraphPorts } = await import('@eightkk/vue-weave/core')
  const assertMatchesPath = (layout, nodeMap, edgeList, direction) => {
    for (const edge of edgeList) {
      const drawn = graphPathEndpoints(layout.paths.get(edge.id))
      for (const [end, point] of [['from', drawn.start], ['to', drawn.end]]) {
        const endpoint = graphEdgeEndpoint(layout, nodeMap, edge, end, direction)
        assert.deepEqual([endpoint.x, endpoint.y], [point.x, point.y], `${direction} ${edge.id} ${end}`)
      }
    }
  }
  // The review case: LR A→B with A moved to the right of B leaves A's left side and enters B's right side.
  const ab = [nodes('a', 'b'), edges(['a', 'b'])]
  const base = layoutLayeredGraph(...ab)
  const moved = applyGraphPositions(base, ab[1], new Map([['a', { x: 300, y: 20 }], ['b', { x: 0, y: 20 }]]))
  const box = moved.boxes.get('a')
  const from = graphEdgeEndpoint(moved, new Map(), ab[1][0], 'from', 'LR')
  const to = graphEdgeEndpoint(moved, new Map(), ab[1][0], 'to', 'LR')
  assert.deepEqual(from, { x: 300, y: 20 + box.height / 2, side: 'left' })
  assert.deepEqual(to, { x: moved.boxes.get('b').width, y: 20 + box.height / 2, side: 'right' })

  const graph = [nodes('a', 'b', 'c'), [...edges(['a', 'b'], ['b', 'c'], ['a', 'c']), { id: 'loop', from: 'b', to: 'b' }]]
  for (const direction of ['LR', 'RL', 'TB', 'BT']) {
    const layout = layoutLayeredGraph(...graph, { direction })
    assertMatchesPath(layout, new Map(), graph[1], direction)
    const reversed = applyGraphPositions(layout, graph[1], new Map([['a', { x: 600, y: 600 }], ['c', { x: 0, y: 0 }]]), direction)
    assertMatchesPath(reversed, new Map(), graph[1], direction)
  }
  for (const layout of [layoutTreeGraph(...graph), layoutRadialGraph(...graph)]) assertMatchesPath(layout, new Map(), graph[1], 'LR')

  // A custom layout that connects top to bottom while declaring LR.
  const custom = {
    boxes: new Map([['a', { x: 0, y: 0, width: 100, height: 40 }], ['b', { x: 0, y: 200, width: 100, height: 40 }]]),
    paths: new Map([['e0', 'M 50 40 C 50 120, 50 120, 50 200']]), edgeLabels: new Map(), width: 200, height: 300,
  }
  assert.deepEqual(graphEdgeEndpoint(custom, new Map(), ab[1][0], 'from', 'LR'), { x: 50, y: 40, side: 'bottom' })
  assert.deepEqual(graphEdgeEndpoint(custom, new Map(), ab[1][0], 'to', 'LR'), { x: 50, y: 200, side: 'top' })

  // Named ports still take precedence, and the unnamed end of a half-ported edge stays on the drawn side.
  const ported = nodes('a', 'b').map(node => ({ ...node, ports: [{ id: 'p', side: 'bottom' }] }))
  const nodeMap = new Map(ported.map(node => [node.id, node]))
  const portEdges = [{ id: 'e0', from: 'a', to: 'b', fromPort: 'p' }]
  const routed = routeGraphPorts(moved, nodeMap, portEdges, 'LR')
  assert.equal(graphEdgeEndpoint(routed, nodeMap, portEdges[0], 'from', 'LR').side, 'bottom')
  assert.equal(graphEdgeEndpoint(routed, nodeMap, portEdges[0], 'to', 'LR').side, 'right')
  assertMatchesPath(routed, nodeMap, portEdges, 'LR')
  // Without an edge ID there is no drawn path, so the direction decides.
  assert.equal(graphEdgeEndpoint(moved, new Map(), { from: 'a', to: 'b' }, 'from', 'LR').side, 'right')
})

test('graphPathEndpoints returns the first moveto and the final current point', async () => {
  const { graphPathEndpoints } = await import('@eightkk/vue-weave/core')
  assert.deepEqual(graphPathEndpoints('M 1 2 C 3 4, 5 6, 7 8'), { start: { x: 1, y: 2 }, end: { x: 7, y: 8 } })
  assert.deepEqual(graphPathEndpoints('m 1 2 l 3 4 h 1e1 v -2'), { start: { x: 1, y: 2 }, end: { x: 14, y: 4 } })
  assert.deepEqual(graphPathEndpoints('M 1 2 L 5 5 Z'), { start: { x: 1, y: 2 }, end: { x: 1, y: 2 } })
  assert.equal(graphPathEndpoints(''), undefined)
  assert.throws(() => graphPathEndpoints('M 1 x'), /Invalid SVG path data/)
})
