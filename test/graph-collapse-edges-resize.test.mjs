import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import {
  applyGraphPositions, applyGraphSizes, collapseGraphGroups, graphPathEndpoints, graphPolylinePath, graphSmoothPath, layoutLayeredGraph,
  routeGraphEdges, routeGraphPorts,
} from 'vue-weave/core'
import { NetworkGraph, collapseGraphGroups as rootCollapse, routeGraphEdges as rootRoute, applyGraphSizes as rootSizes } from 'vue-weave'

const nodes = [
  { id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }, { id: 'd', label: 'D' }, { id: 'e', label: 'E' },
]
const edges = [
  { id: 'ab', from: 'a', to: 'b', label: 'feeds' }, { id: 'bc', from: 'b', to: 'c' }, { id: 'ac', from: 'a', to: 'c', label: 'feeds' },
  { id: 'cd', from: 'c', to: 'd' }, { id: 'de', from: 'd', to: 'e' }, { id: 'be', from: 'b', to: 'e' }, { id: 'aa', from: 'a', to: 'a' },
]
const byId = list => new Map(list.map(item => [item.id, item]))
const freeze = value => {
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) freeze(item)
    Object.freeze(value)
  }
  return value
}
// Every segment of a path drawn only with M, L, H and V commands, as pairs of points.
function segments(path) {
  const tokens = path.match(/[MLHV]|[-+]?\d*\.?\d+(?:e[-+]?\d+)?/gi)
  const points = []
  let command = '', x = 0, y = 0
  for (let i = 0; i < tokens.length;) {
    if (/[MLHV]/.test(tokens[i])) command = tokens[i++]
    if (command === 'M' || command === 'L') {
      x = Number(tokens[i++])
      y = Number(tokens[i++])
    } else if (command === 'H') x = Number(tokens[i++])
    else if (command === 'V') y = Number(tokens[i++])
    else throw new Error('Unexpected command ' + command + ' in ' + path)
    points.push({ x, y })
  }
  return points.slice(1).map((point, index) => [points[index], point])
}
const onBorder = (box, point) => {
  const near = (a, b) => Math.abs(a - b) <= 0.01
  return ((near(point.x, box.x) || near(point.x, box.x + box.width)) && point.y >= box.y - 0.01 && point.y <= box.y + box.height + 0.01)
    || ((near(point.y, box.y) || near(point.y, box.y + box.height)) && point.x >= box.x - 0.01 && point.x <= box.x + box.width + 0.01)
}

test('collapseGraphGroups replaces a collapsed group with a proxy, re-attaches and merges edges and drops internal ones', () => {
  assert.equal(rootCollapse, collapseGraphGroups)
  const groups = [{ id: 'g', label: 'Group', nodeIds: ['b', 'c'] }]
  const input = freeze({ nodes: structuredClone(nodes), edges: structuredClone(edges), groups: structuredClone(groups) })
  const result = collapseGraphGroups(input.nodes, input.edges, input.groups, new Set(['g']))
  // The proxy takes the place of the first member.
  assert.deepEqual(result.nodes.map(node => node.id), ['a', 'g', 'd', 'e'])
  assert.deepEqual(result.nodes[1], {
    id: 'g', label: 'Group', detail: '2 nodes', shape: 'rounded', data: { collapsedGroup: 'g', nodeIds: ['b', 'c'] },
  })
  // ab and ac merge into one edge with the first ID and the shared label; bc is internal.
  assert.deepEqual(result.edges, [
    { id: 'ab', from: 'a', to: 'g', label: 'feeds' }, { id: 'cd', from: 'g', to: 'd', label: undefined, data: undefined }, { id: 'de', from: 'd', to: 'e' },
    { id: 'be', from: 'g', to: 'e' }, { id: 'aa', from: 'a', to: 'a' },
  ].map(edge => Object.fromEntries(Object.entries(edge).filter(([, value]) => value !== undefined))))
  assert.deepEqual([...result.mergedEdges], [['ab', ['ab', 'ac']], ['cd', ['cd']], ['be', ['be']]])
  assert.deepEqual(result.hiddenEdgeIds, ['bc'])
  assert.deepEqual([...result.owners], [['b', 'g'], ['c', 'g']])
  assert.deepEqual([...result.proxies], [['g', { id: 'g', label: 'Group', nodeIds: ['b', 'c'] }]])
  assert.deepEqual(result.groups, [])
  // Unchanged edges are the input objects; the inputs are not modified.
  assert.equal(result.edges[2], input.edges[4])
  assert.deepEqual(input.nodes, nodes)
  assert.deepEqual(input.edges, edges)
  // Nothing collapsed returns the input lists' items unchanged.
  const none = collapseGraphGroups(nodes, edges, groups, [])
  assert.deepEqual(none.nodes, nodes)
  assert.deepEqual(none.edges, edges)
  assert.deepEqual(none.groups, groups)
})

test('collapseGraphGroups uses the outermost collapsed group and keeps parents around collapsed children', () => {
  const groups = [
    { id: 'outer', label: 'Outer', nodeIds: ['a'] }, { id: 'inner', label: 'Inner', nodeIds: ['b', 'c'], parentId: 'outer' },
    { id: 'deep', label: 'Deep', nodeIds: ['d'], parentId: 'inner' },
  ]
  // Collapsing the inner group keeps the outer group, which now holds the proxy.
  const inner = collapseGraphGroups(nodes, edges, groups, ['inner'])
  assert.deepEqual(inner.nodes.map(node => node.id), ['a', 'inner', 'e'])
  assert.deepEqual(inner.nodes[1].data, { collapsedGroup: 'inner', nodeIds: ['b', 'c', 'd'] })
  assert.deepEqual(inner.groups, [{ id: 'outer', label: 'Outer', nodeIds: ['a', 'inner'] }])
  assert.deepEqual(inner.edges.map(edge => [edge.id, edge.from, edge.to]), [['ab', 'a', 'inner'], ['de', 'inner', 'e'], ['aa', 'a', 'a']])
  assert.deepEqual([...inner.mergedEdges], [['ab', ['ab', 'ac']], ['de', ['de', 'be']]])
  assert.deepEqual(inner.hiddenEdgeIds, ['bc', 'cd'])
  // A collapsed ancestor wins over a collapsed descendant.
  const both = collapseGraphGroups(nodes, edges, groups, ['deep', 'outer'], { detail: group => group.label + ' · ' + group.nodeIds.length })
  assert.deepEqual([...both.proxies.keys()], ['outer'])
  assert.deepEqual(both.nodes, [
    { id: 'outer', label: 'Outer', detail: 'Outer · 4', shape: 'rounded', data: { collapsedGroup: 'outer', nodeIds: ['a', 'b', 'c', 'd'] } },
    { id: 'e', label: 'E' },
  ])
  // The self-loop on a is internal to the outer group.
  assert.deepEqual(both.edges.map(edge => [edge.id, edge.from, edge.to]), [['de', 'outer', 'e']])
  assert.deepEqual(both.groups, [])
  const single = collapseGraphGroups(nodes, edges, groups, ['deep'], { detail: () => undefined })
  assert.equal('detail' in single.nodes.find(node => node.id === 'deep'), false)
  assert.equal(collapseGraphGroups(nodes, edges, groups, ['deep']).nodes.find(node => node.id === 'deep').detail, '1 node')
})

test('collapseGraphGroups keeps ports on visible ends, drops waypoints of re-attached edges and validates input', () => {
  const ported = [{ id: 'p', label: 'P', ports: [{ id: 'out', side: 'right' }] }, { id: 'q', label: 'Q', ports: [{ id: 'in', side: 'left' }] }, { id: 'r', label: 'R' }]
  const links = [
    { id: 'pq', from: 'p', to: 'q', fromPort: 'out', toPort: 'in', points: [{ x: 1, y: 2 }], data: 7 },
    { id: 'pr', from: 'p', to: 'r', fromPort: 'out' }, { id: 'pr2', from: 'p', to: 'r' },
  ]
  const result = collapseGraphGroups(ported, links, [{ id: 'g', label: 'G', nodeIds: ['q', 'r'] }], ['g'])
  // Edges from the same visible port merge; a different source port (none) stays separate. A single re-attached edge
  // keeps its data but loses its waypoints and the port on the proxy end.
  assert.deepEqual(result.edges, [{ id: 'pq', from: 'p', to: 'g', fromPort: 'out' }, { id: 'pr2', from: 'p', to: 'g' }])
  assert.deepEqual([...result.mergedEdges], [['pq', ['pq', 'pr']], ['pr2', ['pr2']]])
  const alone = collapseGraphGroups(ported, links.slice(0, 1), [{ id: 'g', label: 'G', nodeIds: ['q', 'r'] }], ['g'])
  assert.deepEqual(alone.edges, [{ id: 'pq', from: 'p', to: 'g', fromPort: 'out', data: 7 }])
  const groups = [{ id: 'g', label: 'G', nodeIds: ['b'] }]
  assert.throws(() => collapseGraphGroups(nodes, edges, groups, ['missing']), { name: 'Error', message: 'Unknown collapsed group: missing' })
  assert.throws(() => collapseGraphGroups(nodes, edges, [...groups, { id: 'g', label: 'Again', nodeIds: ['c'] }], []), /Invalid graph group: g/)
  assert.throws(() => collapseGraphGroups(nodes, edges, [{ id: 'g', label: 'G', nodeIds: ['zz'] }], []), /Invalid or repeated group member: zz/)
  assert.throws(() => collapseGraphGroups(nodes, edges, [{ ...groups[0], parentId: 'nope' }], []), /Unknown parent group: nope/)
  assert.throws(() => collapseGraphGroups(nodes, edges, [
    { id: 'x', label: 'X', nodeIds: ['a'], parentId: 'y' }, { id: 'y', label: 'Y', nodeIds: ['b'], parentId: 'x' },
  ], []), /cycle/)
  assert.throws(() => collapseGraphGroups(nodes, edges, [{ id: 'a', label: 'Clash', nodeIds: ['b'] }], ['a']), /also a node ID: a/)
  assert.throws(() => collapseGraphGroups(nodes, [{ id: 'x', from: 'a', to: 'zz' }], groups, ['g']), /Unknown endpoint/)
})

test('routeGraphEdges keeps the curve layout without waypoints and validates options', () => {
  assert.equal(rootRoute, routeGraphEdges)
  const layout = layoutLayeredGraph(nodes, edges)
  const map = byId(nodes)
  assert.equal(routeGraphEdges(layout, edges, map), layout)
  assert.equal(routeGraphEdges(layout, edges, map, { style: 'curve', direction: 'TB' }), layout)
  assert.throws(() => routeGraphEdges(layout, edges, map, { style: 'zigzag' }), RangeError)
  assert.throws(() => routeGraphEdges(layout, edges, map, { style: 'orthogonal', cornerRadius: -1 }), RangeError)
  assert.throws(() => routeGraphEdges(layout, [{ ...edges[0], points: [{ x: NaN, y: 0 }] }], map), RangeError)
  assert.throws(() => routeGraphEdges(layout, [{ id: 'x', from: 'a', to: 'zz' }], map, { style: 'straight' }), /Unknown endpoint/)
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

const groups = [{ id: 'g', label: 'Group', nodeIds: ['b', 'c'] }]
const render = props => renderToString(createSSRApp({ render: () => h(NetworkGraph, { nodes, edges, ...props }) }))

test('NetworkGraph server markup is unchanged by default values of the new inputs', async () => {
  const plain = await render({ groups, draggable: true, edgesSelectable: true })
  assert.equal(await render({ groups, draggable: true, edgesSelectable: true, edgeStyle: 'curve', collapsedGroupIds: new Set(), sizes: new Map(), lodThreshold: 0.05 }), plain)
  for (const name of ['vft-network-overlay', 'vft-lod-low', 'vft-group-toggle', 'vft-waypoint', 'vft-resize-handle']) assert.equal(plain.includes(name), false)
})

test('NetworkGraph renders collapsed groups, edge styles, waypoints, sizes and the LOD class on the server', async () => {
  const collapsible = await render({ groups, collapsibleGroups: true })
  assert.match(collapsible, /class="vft-network-overlay"/)
  assert.match(collapsible, /aria-label="Collapse group Group" aria-expanded="true" data-vft-toggle="g"/)
  const collapsed = await render({ groups, collapsibleGroups: true, collapsedGroupIds: new Set(['g']), labels: { expandGroup: 'Open' } })
  assert.match(collapsed, /aria-label="Open Group" aria-expanded="false" data-vft-toggle="g"/)
  assert.match(collapsed, /data-vft-node="g"[^>]*aria-label="Group 2 nodes"/)
  assert.equal(collapsed.includes('data-vft-node="b"'), false)
  assert.equal(collapsed.includes('class="vft-network-group"'), false)
  // A controlled set applies without toggles; unknown IDs are ignored.
  const controlled = await render({ groups, collapsedGroupIds: new Set(['g', 'gone']) })
  assert.match(controlled, /data-vft-node="g"/)
  assert.equal(controlled.includes('vft-group-toggle'), false)

  const orthogonal = await render({ edgeStyle: 'orthogonal' })
  const layout = layoutLayeredGraph(nodes, edges)
  const expected = routeGraphEdges(layout, edges, byId(nodes), { style: 'orthogonal', cornerRadius: 6 })
  assert.ok(orthogonal.includes(`d="${expected.paths.get('de')}"`))
  const straight = await render({ edgeStyle: 'straight', edges: [{ ...edges[0], points: [{ x: 190, y: 200 }] }] })
  assert.match(straight, /d="M [\d.]+ [\d.]+ L 190 200 L [\d.]+ [\d.]+"/)

  const sized = await render({ sizes: new Map([['a', { width: 220, height: 90 }]]) })
  assert.match(sized, /<svg width="220" height="90" overflow="hidden">/)

  // The initial camera scale is below 3 and above 0.05.
  assert.match(await render({ lodThreshold: 3 }), /class="vft-network vft-lod-low"/)
  assert.equal((await render({ lodThreshold: 0.05 })).includes('vft-lod-low'), false)
  for (const lodThreshold of [0, -1, 3.5, NaN]) await assert.rejects(render({ lodThreshold }), RangeError)
  await assert.rejects(render({ edgeStyle: 'wavy' }), { name: 'RangeError', message: /Unknown edge style: wavy/ })
  await assert.rejects(render({ resizable: true, minNodeSize: { width: 0, height: 10 } }), RangeError)
  await assert.rejects(render({ sizes: new Map([['a', { width: -5, height: 10 }]]) }), RangeError)
})

test('NetworkGraph passes the camera scale to node and edge slots and renders resize and waypoint handles', async () => {
  const scales = []
  await renderToString(createSSRApp({
    render: () => h(NetworkGraph, { nodes, edges }, {
      node: ({ node, scale }) => (scales.push(scale), h('text', node.label)),
      edge: ({ path, scale }) => (scales.push(scale), h('path', { d: path })),
    }),
  }))
  assert.equal(scales.length, nodes.length + edges.length)
  assert.ok(scales.every(scale => scale === scales[0] && scale > 0 && scale <= 3))

  const resizable = await render({ resizable: true, selectedId: 'b' })
  for (const corner of ['top left', 'top right', 'bottom left', 'bottom right']) assert.match(resizable, new RegExp(`aria-label="Resize B · ${corner}"`))
  assert.equal((await render({ resizable: true, selectedId: 'b', nodes: nodes.map(node => node.id === 'b' ? { ...node, resizable: false } : node) })).includes('vft-resize-handle'), false)
  assert.equal((await render({ resizable: true, selectedIds: new Set(['a', 'b']) })).includes('vft-resize-handle'), false)
  // Without a selected edge there are no waypoint handles, but edges get their hit areas.
  const editable = await render({ editableEdges: true })
  assert.match(editable, /aria-label="Select edge feeds"/)
  assert.equal(editable.includes('vft-waypoint'), false)
})
