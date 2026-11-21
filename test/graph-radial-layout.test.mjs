import assert from 'node:assert/strict'
import { test } from 'node:test'
import { layoutRadialGraph } from '@eightkk/vue-weave/core'

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
