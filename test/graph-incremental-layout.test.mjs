import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nextTick, shallowRef } from 'vue'
import {
  applyGraphPositions, buildGraphLayoutRequests, createGraphExpansion, graphExpansionView, graphLayoutChangeMetrics, graphLayoutInputKey,
  graphLayoutMessageFromJson, graphLayoutMessageToJson, layoutGraphIncrementally, layoutLayeredGraph, mergeGraphExpansionPage,
  parseGraphLayoutMessage, routeGraphEdges,
} from 'vue-weave/core'
import { useAsyncGraphLayout } from 'vue-weave'
import { centre } from './helpers/builders.mjs'

const nodes = (...ids) => ids.map(id => ({ id, label: id.toUpperCase() }))
const edge = (from, to, id = from + to) => ({ id, from, to })
const positionsOf = layout => new Map([...layout.boxes].map(([id, box]) => [id, { x: box.x, y: box.y }]))

function assertKept(before, after) {
  for (const [id, box] of before.boxes) assert.deepEqual(after.boxes.get(id), box, 'moved: ' + id)
}
function assertNoOverlap(layout, gap = 0) {
  const boxes = [...layout.boxes]
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const [ida, a] = boxes[i], [idb, b] = boxes[j]
      const overlap = a.x < b.x + b.width + gap && b.x < a.x + a.width + gap && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap
      assert.equal(overlap, false, `${ida} and ${idb} overlap`)
    }
  }
}

const baseNodes = nodes('a', 'b', 'c')
const baseEdges = [edge('a', 'b'), edge('b', 'c')]

test('layoutGraphIncrementally keeps every positioned node exactly and places new ones without overlaps', () => {
  const before = layoutLayeredGraph(baseNodes, baseEdges)
  const grown = [...baseNodes, ...nodes('d', 'e', 'f')]
  const grownEdges = [...baseEdges, edge('b', 'd'), edge('b', 'e'), edge('c', 'f')]
  const after = layoutGraphIncrementally(grown, grownEdges, before.boxes)
  assertKept(before, after)
  assertNoOverlap(after)
  assert.deepEqual(after.placedIds, ['d', 'e', 'f'])
  assert.deepEqual(after.movedIds, [])
  assert.deepEqual(after.fallbackIds, [])
  const metrics = graphLayoutChangeMetrics(positionsOf(before), after, { edges: grownEdges })
  assert.deepEqual(metrics, { compared: 3, maxDisplacement: 0, totalDisplacement: 0, movedIds: [], overlaps: 0, edgeBoxIntersections: 0 })
  // Every node has a box, every edge a path and a label anchor, and the size covers every box.
  for (const { id } of grown) assert.ok(after.boxes.has(id))
  for (const { id } of grownEdges) assert.equal(typeof after.paths.get(id), 'string')
  for (const box of after.boxes.values()) {
    assert.ok(box.x + box.width <= after.width && box.y + box.height <= after.height)
  }
  // Several new nodes of one anchor are stacked in its next column, keeping the row gap.
  const d = after.boxes.get('d'), e = after.boxes.get('e'), c = after.boxes.get('c')
  assert.equal(d.x, c.x)
  assert.equal(e.x, c.x)
  assert.ok(Math.abs(d.y - c.y) >= c.height + 24 && Math.abs(e.y - d.y) >= d.height + 24)
  // Edges between unchanged boxes keep the previous path when the previous layout is given.
  const kept = layoutGraphIncrementally(grown, grownEdges, before.boxes, { previousLayout: before })
  assert.equal(kept.paths.get('ab'), before.paths.get('ab'))
  const long = layoutLayeredGraph(baseNodes, [...baseEdges, edge('a', 'c')])
  const withLong = layoutGraphIncrementally(grown, [...grownEdges, edge('a', 'c')], long.boxes, { previousLayout: long })
  assert.equal(withLong.paths.get('ac'), long.paths.get('ac'))
  assert.notEqual(layoutGraphIncrementally(grown, [...grownEdges, edge('a', 'c')], long.boxes).paths.get('ac'), long.paths.get('ac'))
})

test('layoutGraphIncrementally places successors after and predecessors before their neighbours in all four directions', () => {
  const allNodes = [...baseNodes, ...nodes('s', 'p')]
  const allEdges = [...baseEdges, edge('c', 's'), edge('p', 'b')]
  for (const direction of ['LR', 'RL', 'TB', 'BT']) {
    // Room before the first node, so predecessors fit on their flow side.
    const before = layoutLayeredGraph(baseNodes, baseEdges, { direction, padding: 400 })
    const after = layoutGraphIncrementally(allNodes, allEdges, before.boxes, { direction })
    assertKept(before, after)
    assertNoOverlap(after)
    assert.deepEqual(after.fallbackIds, [], direction)
    const along = point => direction === 'LR' ? point.x : direction === 'RL' ? -point.x : direction === 'TB' ? point.y : -point.y
    const of = id => along(centre(after.boxes.get(id)))
    assert.ok(of('s') > of('c'), direction + ': successor after')
    assert.ok(of('p') < of('b'), direction + ': predecessor before')
    assert.equal(after.boxes.get('s').rank, after.boxes.get('c').rank + 1)
    assert.equal(after.boxes.get('p').rank, after.boxes.get('b').rank - 1)
    // The free space along the flow is the column gap.
    const s = after.boxes.get('s'), c = after.boxes.get('c')
    const gap = direction === 'LR' ? s.x - (c.x + c.width) : direction === 'RL' ? c.x - (s.x + s.width)
      : direction === 'TB' ? s.y - (c.y + c.height) : c.y - (s.y + s.height)
    assert.equal(gap, 50, direction)
  }
})

test('layoutGraphIncrementally keeps new boxes nonnegative unless allowNegative is set', () => {
  const before = layoutLayeredGraph(baseNodes, baseEdges)
  const allNodes = [...baseNodes, ...nodes('p')]
  const allEdges = [...baseEdges, edge('p', 'a')]
  const after = layoutGraphIncrementally(allNodes, allEdges, before.boxes)
  assertKept(before, after)
  assertNoOverlap(after)
  assert.deepEqual(after.fallbackIds, ['p'])
  // Beside its successor, in the same rank.
  assert.equal(after.boxes.get('p').x, before.boxes.get('a').x)
  assert.equal(after.boxes.get('p').rank, 0)
  const free = layoutGraphIncrementally(allNodes, allEdges, before.boxes, { allowNegative: true })
  assert.deepEqual(free.fallbackIds, [])
  assert.ok(free.boxes.get('p').x + free.boxes.get('p').width + 50 === before.boxes.get('a').x)
  assert.ok(free.boxes.get('p').x < 0)
})

test('layoutGraphIncrementally places a chain of new nodes in dependency order', () => {
  const before = layoutLayeredGraph(baseNodes, baseEdges)
  const chain = nodes('n1', 'n2', 'n3', 'n4')
  // Listed in reverse so input order is not what decides.
  const chainEdges = [edge('n3', 'n4'), edge('n2', 'n3'), edge('n1', 'n2'), edge('c', 'n1')]
  const after = layoutGraphIncrementally([...baseNodes, ...chain.reverse()], [...baseEdges, ...chainEdges], before.boxes)
  assertKept(before, after)
  assertNoOverlap(after)
  assert.deepEqual(after.placedIds, ['n1', 'n2', 'n3', 'n4'])
  const xs = ['c', 'n1', 'n2', 'n3', 'n4'].map(id => after.boxes.get(id).x)
  for (let i = 1; i < xs.length; i++) assert.equal(xs[i], xs[i - 1] + 144 + 50)
  assert.deepEqual(['n1', 'n2', 'n3', 'n4'].map(id => after.boxes.get(id).rank), [3, 4, 5, 6])
})

test('layoutGraphIncrementally lays out new components without a positioned node in a free area after the others', () => {
  const before = layoutLayeredGraph(baseNodes, baseEdges)
  const allNodes = [...baseNodes, ...nodes('x', 'y', 'lonely')]
  const allEdges = [...baseEdges, edge('x', 'y')]
  for (const direction of ['LR', 'TB']) {
    const start = layoutLayeredGraph(baseNodes, baseEdges, { direction })
    const after = layoutGraphIncrementally(allNodes, allEdges, start.boxes, { direction })
    assertKept(start, after)
    assertNoOverlap(after)
    const bottom = Math.max(...[...start.boxes.values()].map(box => box.y + box.height))
    const right = Math.max(...[...start.boxes.values()].map(box => box.x + box.width))
    for (const id of ['x', 'y', 'lonely']) {
      const box = after.boxes.get(id)
      if (direction === 'LR') assert.ok(box.y >= bottom + 24, id)
      else assert.ok(box.x >= right + 24, id)
    }
    // Laid out as a layered block: x before y.
    if (direction === 'LR') assert.ok(after.boxes.get('y').x > after.boxes.get('x').x)
    else assert.ok(after.boxes.get('y').y > after.boxes.get('x').y)
  }
  void before
  // Without any position the whole graph is that block, at the padding.
  const fresh = layoutGraphIncrementally(baseNodes, baseEdges, new Map())
  assert.deepEqual([...fresh.boxes.values()].map(box => [box.x, box.y]), [[20, 20], [214, 20], [408, 20]])
})

test('layoutGraphIncrementally handles cycles and self-loops and is deterministic', () => {
  const before = layoutLayeredGraph(baseNodes, baseEdges)
  const allNodes = [...baseNodes, ...nodes('u', 'v', 'w')]
  const allEdges = [...baseEdges, edge('c', 'u'), edge('u', 'v'), edge('v', 'u', 'vu'), edge('v', 'a', 'va'), edge('w', 'w'), edge('u', 'u')]
  const first = layoutGraphIncrementally(allNodes, allEdges, before.boxes)
  const second = layoutGraphIncrementally(allNodes, allEdges, before.boxes)
  assert.deepEqual([...first.boxes], [...second.boxes])
  assert.deepEqual([...first.paths], [...second.paths])
  assertKept(before, first)
  assertNoOverlap(first)
  for (const { id } of allEdges) assert.equal(typeof first.paths.get(id), 'string')
  // v has a placed predecessor (u) and a placed successor (a); it goes after u.
  assert.ok(first.boxes.get('v').x > first.boxes.get('u').x)
})

test('layoutGraphIncrementally only moves unfixed positioned nodes in relaxed mode, by at most maxDisplacement', () => {
  // A neighbour sits right where the new successor of a wants to go.
  const placed = nodes('a', 'b', 'blocker')
  const positions = new Map([['a', { x: 20, y: 100 }], ['b', { x: 400, y: 400 }], ['blocker', { x: 214, y: 110 }]])
  const allNodes = [...placed, ...nodes('n')]
  const allEdges = [edge('a', 'n'), edge('a', 'b')]
  const strict = layoutGraphIncrementally(allNodes, allEdges, positions)
  assert.deepEqual(strict.boxes.get('blocker'), { x: 214, y: 110, width: 144, height: 58, rank: 0 })
  assert.notEqual(strict.boxes.get('n').y, 100)
  const relaxed = layoutGraphIncrementally(allNodes, allEdges, positions, { maxDisplacement: 100 })
  assert.deepEqual(relaxed.movedIds, ['blocker'])
  assert.equal(relaxed.boxes.get('n').y, 100)
  assert.equal(relaxed.boxes.get('blocker').x, 214)
  assertNoOverlap(relaxed)
  const metrics = graphLayoutChangeMetrics(positions, relaxed)
  assert.ok(metrics.maxDisplacement > 0 && metrics.maxDisplacement <= 100)
  assert.deepEqual(metrics.movedIds, ['blocker'])
  // Too little room: nobody moves.
  const tight = layoutGraphIncrementally(allNodes, allEdges, positions, { maxDisplacement: 10 })
  assert.deepEqual(tight.movedIds, [])
  // Fixed nodes never move, also in relaxed mode.
  const pinned = layoutGraphIncrementally(allNodes, allEdges, positions, { maxDisplacement: 1000, fixedIds: ['blocker', 'a'] })
  assert.deepEqual(pinned.movedIds, [])
  for (const [id, point] of positions) {
    assert.equal(pinned.boxes.get(id).x, point.x)
    assert.equal(pinned.boxes.get(id).y, point.y)
  }
  assertNoOverlap(pinned)
})

test('layoutGraphIncrementally appends a 12,000-node chain to a layout of a few thousand boxes', () => {
  const existingNodes = Array.from({ length: 3000 }, (_, i) => ({ id: 'x' + i }))
  const existingEdges = existingNodes.slice(1).map((node, i) => edge('x' + i, node.id, 'xe' + i))
  const before = layoutLayeredGraph(existingNodes, existingEdges.filter((_, i) => i % 50 !== 49))
  const chain = Array.from({ length: 12_000 }, (_, i) => ({ id: 'n' + i }))
  const chainEdges = chain.map((node, i) => edge(i ? 'n' + (i - 1) : 'x1500', node.id, 'ne' + i))
  const allNodes = [...existingNodes, ...chain], allEdges = [...existingEdges, ...chainEdges]
  const after = layoutGraphIncrementally(allNodes, allEdges, before.boxes)
  assert.equal(after.boxes.size, 15_000)
  assert.equal(after.placedIds.length, 12_000)
  const metrics = graphLayoutChangeMetrics(positionsOf(before), after)
  assert.equal(metrics.compared, 3000)
  assert.equal(metrics.maxDisplacement, 0)
  assert.equal(metrics.overlaps, 0)
  // The chain runs along the flow, one column per node.
  assert.equal(after.boxes.get('n11999').rank, after.boxes.get('x1500').rank + 12_000)
})

test('layoutGraphIncrementally validates its input and ignores positions of unknown nodes', () => {
  const positions = new Map([['a', { x: 0, y: 0 }], ['gone', { x: Number.NaN, y: 0 }]])
  const result = layoutGraphIncrementally(baseNodes, baseEdges, positions)
  assert.equal(result.boxes.has('gone'), false)
  assert.deepEqual(result.boxes.get('a'), { x: 0, y: 0, width: 144, height: 58, rank: 0 })
  assert.throws(() => layoutGraphIncrementally(baseNodes, baseEdges, new Map([['a', { x: Infinity, y: 0 }]])), RangeError)
  assert.throws(() => layoutGraphIncrementally(baseNodes, baseEdges, new Map([['a', { x: 0, y: 0, width: 0 }]])), RangeError)
  assert.throws(() => layoutGraphIncrementally(baseNodes, baseEdges, positions, { direction: 'up' }), RangeError)
  for (const name of ['columnGap', 'rowGap', 'padding', 'maxDisplacement']) {
    assert.throws(() => layoutGraphIncrementally(baseNodes, baseEdges, positions, { [name]: -1 }), RangeError, name)
  }
  assert.throws(() => layoutGraphIncrementally(baseNodes, baseEdges, positions, { nodeWidth: 0 }), RangeError)
  assert.throws(() => layoutGraphIncrementally(baseNodes, baseEdges, positions, { sizes: new Map([['b', { width: 10, height: -1 }]]) }), RangeError)
  assert.throws(() => layoutGraphIncrementally(baseNodes, baseEdges, positions, { fixedIds: ['zzz'] }), { name: 'Error', message: 'Unknown node in fixedIds: zzz' })
  assert.throws(() => layoutGraphIncrementally(baseNodes, baseEdges, positions, { fixedIds: ['b'] }), /needs a position: b/)
  assert.throws(() => layoutGraphIncrementally(baseNodes, [edge('a', 'q')], positions), /Unknown node in graph edge .*: q/)
  assert.throws(() => layoutGraphIncrementally([...baseNodes, { id: 'a' }], baseEdges, positions), /Duplicate graph node ID/)
  // Sizes: from the position, then from `sizes`, then the defaults. Inputs are not modified.
  const sizes = new Map([['b', { width: 60, height: 30 }]])
  const sized = layoutGraphIncrementally(baseNodes, baseEdges, new Map([['a', { x: 0, y: 0, width: 80, height: 40 }]]), { sizes })
  assert.equal(sized.boxes.get('a').width, 80)
  assert.equal(sized.boxes.get('b').width, 60)
  assert.equal(sized.boxes.get('c').width, 144)
  assert.equal(positions.size, 2)
})

test('graphLayoutChangeMetrics counts displacement, overlapping pairs and edges through unrelated boxes', () => {
  const boxes = new Map([
    ['a', { x: 0, y: 0, width: 100, height: 50, rank: 0 }],
    ['b', { x: 300, y: 0, width: 100, height: 50, rank: 1 }],
    ['c', { x: 150, y: 0, width: 100, height: 50, rank: 0 }],
    ['d', { x: 160, y: 10, width: 50, height: 20, rank: 0 }],
  ])
  const paths = new Map([['ab', 'M 100 25 L 300 25'], ['ac', 'M 100 25 C 120 25, 130 25, 150 25'], ['side', 'M 0 50 L 400 50']])
  const edges = [{ id: 'ab', from: 'a', to: 'b' }, { id: 'ac', from: 'a', to: 'c' }, { id: 'side', from: 'a', to: 'b' }]
  const before = new Map([['a', { x: 0, y: 0 }], ['b', { x: 300, y: 40 }], ['c', { x: 147, y: 4 }], ['missing', { x: 1, y: 1 }]])
  const metrics = graphLayoutChangeMetrics(before, { boxes, paths }, { edges })
  assert.equal(metrics.compared, 3)
  assert.equal(metrics.maxDisplacement, 40)
  assert.equal(metrics.totalDisplacement, 45)
  assert.deepEqual(metrics.movedIds, ['b', 'c'])
  // c and d overlap; a path along the bottom border passes through no interior.
  assert.equal(metrics.overlaps, 1)
  // ab passes through c and d; ac ends at c.
  assert.equal(metrics.edgeBoxIntersections, 2)
  assert.equal(graphLayoutChangeMetrics(before, { boxes }).edgeBoxIntersections, 0)
  assert.throws(() => graphLayoutChangeMetrics(new Map([['a', { x: Number.NaN, y: 0 }]]), { boxes }), RangeError)
})

test('an expansion page placed with layoutGraphIncrementally leaves the shown nodes in place', () => {
  let state = createGraphExpansion({ nodes: nodes('a') })
  let layout = layoutGraphIncrementally(graphExpansionView(state).nodes, graphExpansionView(state).edges, new Map())
  const pages = [
    { nodes: nodes('a', 'b', 'c'), edges: [edge('a', 'b'), edge('c', 'a'), edge('b', 'zz')] },
    { nodes: nodes('b', 'd', 'e'), edges: [edge('b', 'd'), edge('e', 'b'), edge('d', 'a')] },
  ]
  for (const page of pages) {
    state = mergeGraphExpansionPage(state, page, [page.nodes[0].id])
    const view = graphExpansionView(state)
    const next = layoutGraphIncrementally(view.nodes, view.edges, layout.boxes, { previousLayout: layout })
    assertKept(layout, next)
    assertNoOverlap(next)
    assert.equal(graphLayoutChangeMetrics(positionsOf(layout), next, { edges: view.edges }).maxDisplacement, 0)
    layout = next
  }
  assert.equal(layout.boxes.size, 5)
})

test('layout requests carry fixed and added node IDs additively, through JSON, structured clone and useAsyncGraphLayout', async () => {
  const graphNodes = nodes('a', 'b', 'c')
  const positions = new Map([['a', { x: 0, y: 0 }]])
  const plain = buildGraphLayoutRequests({ nodes: graphNodes, edges: baseEdges, positions }, 'r')
  assert.equal('fixedIds' in plain.shown, false)
  assert.equal('addedIds' in plain.shown, false)
  // Keys of inputs without the new fields are unchanged; empty sets are the same as none.
  assert.equal(plain.shown.inputKey, graphLayoutInputKey({ scope: 'shown', nodes: graphNodes, edges: baseEdges, groups: [], positions }))
  const empty = buildGraphLayoutRequests({ nodes: graphNodes, edges: baseEdges, positions, fixedIds: new Set(), addedIds: new Set() }, 'r')
  assert.equal(empty.shown.inputKey, plain.shown.inputKey)
  const fixedIds = new Set(['a']), addedIds = new Set(['c'])
  const requests = buildGraphLayoutRequests({ nodes: graphNodes, edges: baseEdges, positions, fixedIds, addedIds }, 'r')
  assert.equal(requests.shown.fixedIds, fixedIds)
  assert.equal(requests.shown.addedIds, addedIds)
  assert.notEqual(requests.shown.inputKey, plain.shown.inputKey)
  assert.notEqual(
    buildGraphLayoutRequests({ nodes: graphNodes, edges: baseEdges, positions, fixedIds, addedIds: new Set(['b']) }, 'r').shown.inputKey,
    requests.shown.inputKey,
  )
  // Order of the IDs does not matter.
  assert.equal(
    graphLayoutInputKey({ scope: 'shown', nodes: graphNodes, edges: baseEdges, addedIds: new Set(['b', 'c']) }),
    graphLayoutInputKey({ scope: 'shown', nodes: graphNodes, edges: baseEdges, addedIds: new Set(['c', 'b']) }),
  )
  const message = { type: 'request', request: requests.shown }
  const json = JSON.parse(JSON.stringify(graphLayoutMessageToJson(message)))
  assert.deepEqual(json.request.fixedIds, ['a'])
  assert.deepEqual(json.request.addedIds, ['c'])
  const back = graphLayoutMessageFromJson(json)
  assert.deepEqual(back.request.fixedIds, fixedIds)
  assert.deepEqual(back.request.addedIds, addedIds)
  assert.throws(() => graphLayoutMessageFromJson({ ...json, request: { ...json.request, addedIds: [1] } }), /addedIds must be an array of IDs/)
  assert.equal(parseGraphLayoutMessage(message), message)
  assert.throws(() => parseGraphLayoutMessage({ type: 'request', request: { ...requests.shown, fixedIds: ['a'] } }), /fixedIds must be a Set/)
  const plainJson = graphLayoutMessageToJson({ type: 'request', request: plain.shown })
  assert.equal('fixedIds' in plainJson.request, false)

  // useAsyncGraphLayout hands them to the adapter and keeps them on the frame.
  const seen = []
  const input = shallowRef({ nodes: graphNodes, edges: baseEdges, positions, fixedIds, addedIds })
  const graph = useAsyncGraphLayout({
    input,
    adapter: (request) => {
      seen.push(request)
      return layoutGraphIncrementally(request.nodes, request.edges, request.positions ?? new Map(), { fixedIds: request.fixedIds })
    },
  })
  for (let i = 0; i < 5; i++) await nextTick()
  assert.equal(seen.length, 1)
  assert.equal(seen[0].fixedIds, fixedIds)
  assert.equal(seen[0].addedIds, addedIds)
  assert.equal(graph.desired.value.fixedIds, fixedIds)
  assert.equal(graph.display.value.addedIds, addedIds)
  assert.deepEqual(graph.display.value.layouts.shown.boxes.get('a'), { x: 0, y: 0, width: 144, height: 58, rank: 0 })
  // A frame without them has none.
  input.value = { nodes: graphNodes, edges: baseEdges }
  for (let i = 0; i < 5; i++) await nextTick()
  assert.equal('fixedIds' in seen[1], false)
  assert.equal('addedIds' in graph.desired.value, false)
  graph.dispose()
})

test('avoidNodes reroutes an edge that a moved unrelated box now crosses, but never an edge with waypoints', () => {
  const graphNodes = nodes('a', 'b', 'c')
  const edges = [edge('a', 'b'), { id: 'manual', from: 'a', to: 'b', points: [{ x: 300, y: 49 }] }]
  const positions = new Map([['a', { x: 20, y: 20 }], ['b', { x: 600, y: 20 }], ['c', { x: 300, y: 300 }]])
  const base = layoutGraphIncrementally(graphNodes, edges, positions)
  const nodesById = new Map(graphNodes.map(node => [node.id, node]))
  const options = { style: 'orthogonal', avoidNodes: true }
  const routed = routeGraphEdges(base, edges, nodesById, options)
  // c moves onto the straight route between a and b; neither edge touches c.
  const moved = applyGraphPositions(base, edges, new Map([['c', { x: 300, y: 20 }]]))
  const rerouted = routeGraphEdges(moved, edges, nodesById, options)
  assert.notEqual(rerouted.paths.get('ab'), routed.paths.get('ab'))
  assert.equal(rerouted.paths.get('manual'), routed.paths.get('manual'))
  assert.equal(graphLayoutChangeMetrics(new Map(), rerouted, { edges: [edges[0]] }).edgeBoxIntersections, 0)
  // Without avoidance the plain route runs through c.
  const plain = routeGraphEdges(moved, edges, nodesById, { style: 'orthogonal' })
  assert.equal(graphLayoutChangeMetrics(new Map(), plain, { edges: [edges[0]] }).edgeBoxIntersections, 1)
})

test('incremental layout places a new node with more anchors than a call can take arguments', () => {
  // Math.max(...anchors) overflowed the call stack past about 120,000 anchors.
  const count = 150000
  const nodes = [{ id: 'hub' }], edges = [], positions = new Map()
  for (let i = 0; i < count; i++) {
    nodes.push({ id: 'l' + i })
    edges.push({ id: 'e' + i, from: 'l' + i, to: 'hub' })
    positions.set('l' + i, { x: 0, y: i * 100 })
  }
  const result = layoutGraphIncrementally(nodes, edges, positions)
  assert.deepEqual(result.placedIds, ['hub'])
  assert.equal(result.boxes.get('hub').x, 144 + 50)
  assert.equal(result.boxes.get('hub').rank, 1)
})
