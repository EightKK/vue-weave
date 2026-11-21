import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collapseGraphGroups } from '@eightkk/vue-weave/core'
import { collapseGraphGroups as rootCollapse } from '@eightkk/vue-weave'
import { deepFreeze as freeze } from './helpers/builders.mjs'

const nodes = [
  { id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }, { id: 'd', label: 'D' }, { id: 'e', label: 'E' },
]

const edges = [
  { id: 'ab', from: 'a', to: 'b', label: 'feeds' }, { id: 'bc', from: 'b', to: 'c' }, { id: 'ac', from: 'a', to: 'c', label: 'feeds' },
  { id: 'cd', from: 'c', to: 'd' }, { id: 'de', from: 'd', to: 'e' }, { id: 'be', from: 'b', to: 'e' }, { id: 'aa', from: 'a', to: 'a' },
]

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

test('collapseGraphGroups keeps edge appearance on merged edges only when every merged edge agrees', () => {
  const groups = [{ id: 'g', label: 'Group', nodeIds: ['b', 'c'] }]
  const look = { edgeStyle: 'curve', markerStart: 'circle', markerEnd: 'diamond', animated: true }
  const agree = collapseGraphGroups(nodes, [{ id: 'ab', from: 'a', to: 'b', ...look }, { id: 'ac', from: 'a', to: 'c', ...look }], groups, ['g'])
  assert.deepEqual(agree.edges, [{ id: 'ab', from: 'a', to: 'g', ...look }])
  const differ = collapseGraphGroups(nodes, [
    { id: 'ab', from: 'a', to: 'b', ...look },
    { id: 'ac', from: 'a', to: 'c', edgeStyle: 'orthogonal', markerStart: 'circle', markerEnd: 'arrow', animated: false },
  ], groups, ['g'])
  assert.deepEqual(differ.edges, [{ id: 'ab', from: 'a', to: 'g', markerStart: 'circle' }])
  // A field missing on one of the edges is dropped, and one missing on all stays absent.
  const partial = collapseGraphGroups(nodes, [{ id: 'ab', from: 'a', to: 'b', animated: true }, { id: 'ac', from: 'a', to: 'c' }], groups, ['g'])
  assert.deepEqual(partial.edges, [{ id: 'ab', from: 'a', to: 'g' }])
  assert.equal('markerEnd' in partial.edges[0], false)
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
  assert.throws(() => collapseGraphGroups(nodes, edges, groups, ['missing']), { name: 'Error', message: 'Unknown group in collapsedIds: missing' })
  assert.throws(() => collapseGraphGroups(nodes, edges, [...groups, { id: 'g', label: 'Again', nodeIds: ['c'] }], []), { name: 'Error', message: 'Duplicate graph group ID: g' })
  assert.throws(() => collapseGraphGroups(nodes, edges, [{ id: 'g', label: 'G', nodeIds: ['zz'] }], []), { name: 'Error', message: 'Unknown node in graph group g: zz' })
  assert.throws(() => collapseGraphGroups(nodes, edges, [{ ...groups[0], parentId: 'nope' }], []), { name: 'Error', message: 'Unknown parent group in graph group g: nope' })
  assert.throws(() => collapseGraphGroups(nodes, edges, [
    { id: 'x', label: 'X', nodeIds: ['a'], parentId: 'y' }, { id: 'y', label: 'Y', nodeIds: ['b'], parentId: 'x' },
  ], []), /cycle/)
  assert.throws(() => collapseGraphGroups(nodes, edges, [{ id: 'a', label: 'Clash', nodeIds: ['b'] }], ['a']), /also a node ID: a/)
  assert.throws(() => collapseGraphGroups(nodes, [{ id: 'x', from: 'a', to: 'zz' }], groups, ['g']), { name: 'Error', message: 'Unknown node in graph edge x: zz' })
})
