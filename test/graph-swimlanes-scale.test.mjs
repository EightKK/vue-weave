import assert from 'node:assert/strict'
import { test } from 'node:test'
import { layoutSwimlaneGraph } from '@eightkk/vue-weave/core'

test('swimlane layout lists the nodes of a lane cell larger than a call can take arguments', () => {
  // nodeIds.push(...cell) overflowed the call stack past about 120,000 nodes in one lane and rank.
  const nodes = Array.from({ length: 150000 }, (_, i) => ({ id: 'n' + i }))
  const layout = layoutSwimlaneGraph(nodes, [], { lanes: ['a'], laneOf: () => 'a', crossingReduction: 'none' })
  assert.equal(layout.lanes[0].nodeIds.length, 150000)
  assert.equal(layout.lanes[0].nodeIds[149999], 'n149999')
})
