import assert from 'node:assert/strict'
import { test } from 'node:test'
import { layoutGraphIncrementally, graphLayoutChangeMetrics, layoutLayeredGraph } from '@eightkk/vue-weave/core'

const edge = (from, to, id = from + to) => ({ id, from, to })

const positionsOf = layout => new Map([...layout.boxes].map(([id, box]) => [id, { x: box.x, y: box.y }]))

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
