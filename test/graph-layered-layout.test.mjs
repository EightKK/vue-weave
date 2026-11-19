import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyGraphPositions, routeGraphPorts, graphNeighborhood, indexGraph, layoutLayeredGraph } from 'vue-weave/core'

const nodes = (...ids) => ids.map(id => ({ id, label: id }))
const edges = (...pairs) => pairs.map(([from, to], i) => ({ id: String(i), from, to }))

test('branch, merge, disconnected nodes and a skip edge preserve ranks', () => {
  const result = layoutLayeredGraph(nodes('a', 'b', 'c', 'd', 'e', 'isolated'),
    edges(['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd'], ['d', 'e'], ['a', 'e']))
  assert.deepEqual(['a', 'b', 'c', 'd', 'e', 'isolated'].map(id => result.boxes.get(id).rank), [0, 1, 1, 2, 3, 0])
  assert.match(result.paths.get('5'), / V /)
  assert.ok(result.edgeLabels.has('5'))
})

test('cycles are condensed; top-to-bottom output swaps geometry and path coordinates', () => {
  const n = nodes('a', 'b', 'c')
  const e = edges(['a', 'b'], ['b', 'a'], ['b', 'b'], ['b', 'c'])
  const lr = layoutLayeredGraph(n, e)
  const tb = layoutLayeredGraph(n, e, { direction: 'TB', nodeWidth: 58, nodeHeight: 144 })
  assert.equal(lr.boxes.get('a').rank, lr.boxes.get('b').rank)
  assert.equal(tb.boxes.get('c').y, lr.boxes.get('c').x)
  assert.equal(tb.width, lr.height)
  assert.ok(!tb.paths.get('3').includes('NaN'))
  const start = tb.paths.get('3').match(/^M ([\d.]+) ([\d.]+)/)
  const source = tb.boxes.get('b')
  assert.equal(Number(start[1]), source.x + source.width / 2)
  assert.equal(Number(start[2]), source.y + source.height)
})

test('deep chains use iterative traversal', () => {
  const n = nodes(...Array.from({ length: 12000 }, (_, i) => String(i)))
  const e = edges(...n.slice(1).map((node, i) => [n[i].id, node.id]))
  assert.equal(layoutLayeredGraph(n, e).boxes.get('11999').rank, 11999)
})

test('neighborhood keeps siblings out and respects depth', () => {
  const graph = indexGraph(nodes('root', 'a', 'b', 'child'), edges(['root', 'a'], ['root', 'b'], ['a', 'child']))
  assert.deepEqual([...graphNeighborhood(graph, 'a', 1)].sort(), ['a', 'child', 'root'])
  assert.throws(() => graphNeighborhood(graph, 'a', -1), RangeError)
})

test('duplicate and dangling graph data fail explicitly', () => {
  assert.throws(() => indexGraph(nodes('a', 'a'), []), /Duplicate/)
  assert.throws(() => indexGraph(nodes('a'), edges(['a', 'b'])), /Unknown/)
  assert.throws(() => layoutLayeredGraph([], [], { nodeWidth: NaN }), RangeError)
})

test('saved graph positions reroute incident edges and keep untouched geometry', () => {
  const base = layoutLayeredGraph(nodes('a', 'b', 'c'), edges(['a', 'b'], ['b', 'c']))
  const moved = applyGraphPositions(base, edges(['a', 'b'], ['b', 'c']), new Map([['a', { x: 30, y: 260 }]]))
  assert.equal(moved.boxes.get('a').y, 260)
  assert.notEqual(base.boxes.get('a').y, 260)
  assert.notEqual(moved.paths.get('0'), base.paths.get('0'))
  assert.equal(moved.paths.get('1'), base.paths.get('1'))
  assert.ok(moved.height > base.height)
  assert.throws(() => applyGraphPositions(base, [], new Map([['a', { x: -1, y: 0 }]])), /nonnegative/)
})

test('named ports validate direction and use moved endpoint coordinates', () => {
  const graphNodes = [
    { id: 'a', ports: [{ id: 'output', side: 'bottom', direction: 'source', offset: 0.25 }] },
    { id: 'b', ports: [{ id: 'input', side: 'left', direction: 'target' }] },
  ]
  const graphEdges = [{ id: 'line', from: 'a', to: 'b', fromPort: 'output', toPort: 'input' }]
  assert.throws(() => indexGraph(graphNodes, [{ ...graphEdges[0], from: 'b', fromPort: 'input' }]), /Invalid port/)
  assert.throws(() => indexGraph(graphNodes, [{ ...graphEdges[0], toPort: 'missing' }]), /Invalid port/)
  const layout = layoutLayeredGraph(graphNodes, graphEdges, { nodeWidth: 100, nodeHeight: 40 })
  const moved = applyGraphPositions(layout, graphEdges, new Map([['a', { x: 40, y: 120 }]]))
  const routed = routeGraphPorts(moved, new Map(graphNodes.map(node => [node.id, node])), graphEdges, 'LR')
  assert.match(routed.paths.get('line'), /^M 65 160 C /)
  const target = moved.boxes.get('b')
  assert.ok(routed.paths.get('line').endsWith(target.x + ' ' + (target.y + 20)))
})

test('long edges reuse lanes so headroom follows overlap, not edge count', () => {
  const count = 300
  const chain = nodes(...Array.from({ length: count }, (_, i) => 'n' + i))
  const links = []
  for (let i = 0; i + 1 < count; i++) links.push({ id: 'e' + i, from: 'n' + i, to: 'n' + (i + 1) })
  for (let i = 0; i + 2 < count; i++) links.push({ id: 's' + i, from: 'n' + i, to: 'n' + (i + 2) })
  const layout = layoutLayeredGraph(chain, links)
  assert.ok(layout.boxes.get('n0').y <= 20 + 2 * 9, 'headroom ' + layout.boxes.get('n0').y)
  assert.ok(layout.height < 200)
  const laneOf = id => Number(layout.paths.get(id).match(/ V (-?[\d.]+) H /)[1])
  assert.notEqual(laneOf('s0'), laneOf('s1'))
  assert.equal(laneOf('s0'), laneOf('s2'))
  const tb = layoutLayeredGraph(chain, links, { direction: 'TB' })
  assert.ok(tb.boxes.get('n0').x <= 20 + 2 * 9)
  // Three skip edges that all span the same column keep distinct lanes.
  const overlap = layoutLayeredGraph(nodes('a', 'b', 'c'), edges(['a', 'b'], ['b', 'c'], ['a', 'c'], ['a', 'c']))
  assert.equal(new Set(['2', '3'].map(id => overlap.paths.get(id).match(/ V (-?[\d.]+) H /)[1])).size, 2)
  assert.equal(overlap.boxes.get('a').y, 20 + 2 * 9)
})
