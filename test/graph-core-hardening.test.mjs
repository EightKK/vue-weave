import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  collapseGraphGroups, graphEdgeEndpoint, graphPathBounds, graphPathEndpoints, graphPolylinePath, graphPortAnchor, graphSmoothPath, indexGraph,
  layoutRadialGraph, routeGraphEdges, routeGraphPorts, scheduleTasks, scheduleToGraph,
} from 'vue-weave/core'

test('radial layout of a 200,000-node star does not overflow the call stack', () => {
  const nodes = [{ id: 'r' }]
  const edges = []
  for (let i = 0; i < 200000; i++) {
    nodes.push({ id: 'n' + i })
    edges.push({ id: 'e' + i, from: 'r', to: 'n' + i })
  }
  const layout = layoutRadialGraph(nodes, edges)
  assert.equal(layout.boxes.size, 200001)
  assert.equal(layout.boxes.get('r').rank, 0)
  assert.equal(layout.boxes.get('n199999').rank, 1)
})

// A small deterministic PRNG so the randomised inputs are reproducible.
function random(seed) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

// Straightforward reference: walk every parent chain to find the outermost collapsed ancestor.
function expectedCollapse(nodes, groups, collapsed) {
  const byId = new Map(groups.map(group => [group.id, group]))
  const outermost = new Map()
  for (const group of groups) {
    let found
    for (let current = group; current; current = byId.get(current.parentId)) if (collapsed.has(current.id)) found = current.id
    outermost.set(group.id, found)
  }
  const memberOf = new Map()
  for (const group of groups) for (const id of group.nodeIds) memberOf.set(id, group.id)
  const owners = new Map()
  for (const node of nodes) {
    const proxy = memberOf.has(node.id) ? outermost.get(memberOf.get(node.id)) : undefined
    if (proxy !== undefined) owners.set(node.id, proxy)
  }
  const shown = groups.filter(group => outermost.get(group.id) === undefined).map(group => ({
    ...group,
    nodeIds: [
      ...group.nodeIds.filter(id => !owners.has(id)),
      ...groups.filter(child => child.parentId === group.id && outermost.get(child.id) === child.id).map(child => child.id),
    ],
  }))
  const proxies = groups.filter(group => outermost.get(group.id) === group.id).map(group => group.id)
  return { owners, shown, proxies }
}

test('collapseGraphGroups matches a reference on randomised nested groups', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const next = random(seed)
    const nodes = Array.from({ length: 30 }, (_, i) => ({ id: 'n' + i, label: 'N' + i }))
    const groups = []
    for (let g = 0; g < 10; g++) {
      const group = { id: 'g' + g, label: 'G' + g, nodeIds: [] }
      // Parents refer to earlier groups, then the list is shuffled, so input order is not topological.
      if (g > 0 && next() < 0.7) group.parentId = 'g' + Math.floor(next() * g)
      groups.push(group)
    }
    for (const node of nodes) {
      if (next() < 0.8) groups[Math.floor(next() * groups.length)].nodeIds.push(node.id)
    }
    // Every group needs a member so that any collapsed group has nodes.
    groups.forEach((group, i) => { if (!group.nodeIds.length) group.nodeIds.push('extra' + i) })
    for (const group of groups) for (const id of group.nodeIds) if (id.startsWith('extra')) nodes.push({ id, label: id })
    for (let i = groups.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [groups[i], groups[j]] = [groups[j], groups[i]]
    }
    const edges = Array.from({ length: 40 }, (_, i) => ({
      id: 'e' + i, from: nodes[Math.floor(next() * nodes.length)].id, to: nodes[Math.floor(next() * nodes.length)].id,
    }))
    const collapsed = new Set(groups.filter(() => next() < 0.35).map(group => group.id))
    const result = collapseGraphGroups(nodes, edges, groups, collapsed)
    const expected = expectedCollapse(nodes, groups, collapsed)
    assert.deepEqual([...result.owners], [...expected.owners], 'owners, seed ' + seed)
    assert.deepEqual(result.groups, expected.shown, 'groups, seed ' + seed)
    assert.deepEqual([...result.proxies.keys()], expected.proxies, 'proxies, seed ' + seed)
    for (const edge of edges) {
      const from = expected.owners.get(edge.from), to = expected.owners.get(edge.to)
      assert.equal(result.hiddenEdgeIds.includes(edge.id), from !== undefined && from === to, 'hidden edge, seed ' + seed)
    }
  }
})

test('collapseGraphGroups reports the same errors for cycles and unknown parents', () => {
  const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
  const group = (id, member, parentId) => ({ id, label: id, nodeIds: [member], ...(parentId === undefined ? {} : { parentId }) })
  // The first group in input order whose parent chain reaches a cycle is named, whether or not it is on the cycle.
  assert.throws(() => collapseGraphGroups(nodes, [], [group('x', 'a', 'y'), group('y', 'b', 'z'), group('z', 'c', 'y')], []), {
    name: 'Error', message: 'Graph group hierarchy contains a cycle at group: x',
  })
  assert.throws(() => collapseGraphGroups(nodes, [], [group('y', 'b', 'y')], []), { message: 'Graph group hierarchy contains a cycle at group: y' })
  assert.throws(() => collapseGraphGroups(nodes, [], [group('r', 'd'), group('y', 'b', 'z'), group('z', 'c', 'y')], []), {
    message: 'Graph group hierarchy contains a cycle at group: y',
  })
  assert.throws(() => collapseGraphGroups(nodes, [], [group('x', 'a', 'y'), group('y', 'b', 'nope')], []), {
    name: 'Error', message: 'Unknown parent group: nope (group y)',
  })
})

test('collapseGraphGroups stays near-linear for deep nesting and many flat groups', () => {
  const deepNodes = Array.from({ length: 20000 }, (_, i) => ({ id: 'n' + i }))
  const deepGroups = deepNodes.map((node, i) => ({ id: 'g' + i, label: 'G' + i, nodeIds: [node.id], ...(i ? { parentId: 'g' + (i - 1) } : {}) }))
  let started = performance.now()
  const deep = collapseGraphGroups(deepNodes, [], deepGroups, ['g19999'])
  const deepTime = performance.now() - started
  assert.equal(deep.groups.length, 19999)
  assert.deepEqual(deep.groups[19998].nodeIds, ['n19998', 'g19999'])
  started = performance.now()
  const flatGroups = deepNodes.map((node, i) => ({ id: 'g' + i, label: 'G' + i, nodeIds: [node.id] }))
  const flat = collapseGraphGroups(deepNodes, [], flatGroups, ['g0'])
  const flatTime = performance.now() - started
  assert.equal(flat.groups.length, 19999)
  // The quadratic version needed several seconds for these inputs; a near-linear one takes milliseconds.
  assert.ok(deepTime < 1500, 'deep nesting took ' + deepTime + ' ms')
  assert.ok(flatTime < 1500, 'flat groups took ' + flatTime + ' ms')
})

test('port sides must be one of the four sides', () => {
  const box = { x: 0, y: 0, width: 100, height: 40, rank: 0 }
  const layout = { boxes: new Map([['a', box], ['b', { ...box, x: 200 }]]), paths: new Map(), edgeLabels: new Map(), width: 300, height: 40 }
  for (const side of ['constructor', 'toString', 'middle', undefined]) {
    const nodes = new Map([['a', { id: 'a', ports: [{ id: 'out', side }] }], ['b', { id: 'b' }]])
    const edges = [{ id: 'ab', from: 'a', to: 'b', fromPort: 'out' }]
    const message = `Invalid graph port on node a: port out has side ${String(side)}, expected left, right, top or bottom`
    assert.throws(() => indexGraph([...nodes.values()], edges), { name: 'Error', message })
    assert.throws(() => graphEdgeEndpoint(layout, nodes, edges[0], 'from', 'LR'), { name: 'Error', message })
    assert.throws(() => routeGraphPorts(layout, nodes, edges, 'LR'), { name: 'Error', message })
    for (const style of ['orthogonal', 'straight']) assert.throws(() => routeGraphEdges(layout, edges, nodes, { style }), { name: 'Error', message })
    assert.throws(() => graphPortAnchor(box, { id: 'out', side }), { name: 'Error', message: `Invalid graph port out: side ${String(side)}, expected left, right, top or bottom` })
  }
})

test('polyline and smooth paths reject non-finite points', () => {
  for (const points of [[{ x: NaN, y: 0 }, { x: 1, y: 1 }], [{ x: 0, y: 0 }, { x: 1, y: Infinity }], [{ x: 0, y: 0 }, { x: 4, y: 0 }, { y: 2 }]]) {
    assert.throws(() => graphPolylinePath(points), RangeError)
    assert.throws(() => graphPolylinePath(points, 4), RangeError)
    assert.throws(() => graphSmoothPath(points), RangeError)
  }
})

test('orthogonal detours at negative coordinates keep the 16 unit stub', () => {
  const layout = (offset) => ({
    boxes: new Map([['a', { x: offset, y: offset, width: 100, height: 40, rank: 0 }], ['b', { x: offset + 50, y: offset + 100, width: 100, height: 40, rank: 1 }]]),
    paths: new Map(), edgeLabels: new Map(), width: 300, height: 300,
  })
  const edges = [{ id: 'ab', from: 'a', to: 'b' }]
  const nodes = new Map([['a', { id: 'a' }], ['b', { id: 'b' }]])
  // The boxes overlap along the x axis, so the LR route leaves and enters on the right and detours 16 units past both.
  const positive = routeGraphEdges(layout(100), edges, nodes, { style: 'orthogonal' }).paths.get('ab')
  assert.equal(positive, 'M 200 120 L 266 120 L 266 220 L 250 220')
  const negative = routeGraphEdges(layout(-1000), edges, nodes, { style: 'orthogonal' }).paths.get('ab')
  assert.equal(negative, 'M -900 -980 L -834 -980 L -834 -880 L -850 -880')
  // On the left side (RL) the detour runs 16 units left of the boxes instead of to x = 0.
  const left = routeGraphEdges(layout(-1000), edges, nodes, { style: 'orthogonal', direction: 'RL' }).paths.get('ab')
  assert.equal(left, 'M -1000 -980 L -1016 -980 L -1016 -880 L -950 -880')
  // In a nonnegative layout a detour near the origin is still kept inside the chart.
  assert.equal(routeGraphEdges(layout(4), edges, nodes, { style: 'orthogonal', direction: 'RL' }).paths.get('ab'), 'M 4 24 L 0 24 L 0 124 L 54 124')
  // Self-loop brackets at negative coordinates also keep their stub.
  const loop = routeGraphEdges(layout(-1000), [{ id: 'aa', from: 'a', to: 'a' }], nodes, { style: 'orthogonal', direction: 'BT' }).paths.get('aa')
  assert.equal(loop, 'M -965 -1000 L -965 -1016 L -935 -1016 L -935 -1000')
})

test('scheduleToGraph rejects duplicate dependency IDs', () => {
  const hour = 3_600_000
  const dependencies = [{ id: 'd', from: 'a', to: 'b' }, { id: 'd', from: 'a', to: 'c' }]
  const result = scheduleTasks({
    range: { start: 0, end: 10 * hour }, quantum: hour,
    tasks: [{ id: 'a', duration: hour }, { id: 'b', duration: hour }, { id: 'c', duration: hour }],
    dependencies: dependencies.slice(0, 1),
  })
  assert.throws(() => scheduleToGraph(result, dependencies), { name: 'Error', message: 'Duplicate dependency ID: d' })
})

test('SVG path scanning requires the data to start with a moveto', () => {
  for (const path of ['L 10 10', 'l 1 1', 'Z', 'z M 0 0', 'C 0 0, 1 1, 2 2']) {
    assert.throws(() => graphPathBounds(path), { name: 'Error', message: 'Invalid SVG path data: ' + path })
    assert.throws(() => graphPathEndpoints(path), { name: 'Error', message: 'Invalid SVG path data: ' + path })
  }
  assert.deepEqual(graphPathBounds('  m 10 10 l 5 5'), { x: 10, y: 10, width: 5, height: 5 })
  assert.equal(graphPathBounds('   '), undefined)
})
