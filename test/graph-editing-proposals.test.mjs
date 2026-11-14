import assert from 'node:assert/strict'
import { test } from 'node:test'
import { graphDeletion, removeGraphElements } from 'vue-weave/core'
import { graphDeletion as rootGraphDeletion } from 'vue-weave'

const nodes = [
  { id: 'a', label: 'Alpha', detail: 'first' },
  { id: 'b', label: 'Beta' },
  { id: 'c', label: 'Gamma' },
  { id: 'd', label: 'Delta' },
]
const edges = [
  { id: 'ab', from: 'a', to: 'b', label: 'One' },
  { id: 'bc', from: 'b', to: 'c' },
  { id: 'cd', from: 'c', to: 'd' },
  { id: 'loop', from: 'b', to: 'b' },
  { id: 'da', from: 'd', to: 'a' },
]

test('graphDeletion adds incident edges, removes duplicates and keeps input order', () => {
  assert.equal(rootGraphDeletion, graphDeletion)
  // A self-loop and both directions of a cycle count as incident.
  assert.deepEqual(graphDeletion(nodes, edges, ['b']), { nodeIds: ['b'], edgeIds: ['ab', 'bc', 'loop'] })
  assert.deepEqual(
    graphDeletion(nodes, edges, ['d', 'b', 'd'], ['cd', 'da', 'cd']),
    { nodeIds: ['b', 'd'], edgeIds: ['ab', 'bc', 'cd', 'loop', 'da'] },
  )
  assert.deepEqual(graphDeletion(nodes, edges, [], ['da', 'ab']), { nodeIds: [], edgeIds: ['ab', 'da'] })
  assert.deepEqual(graphDeletion(nodes, edges, new Set(['c'])), { nodeIds: ['c'], edgeIds: ['bc', 'cd'] })
  assert.deepEqual(graphDeletion(nodes, edges, []), { nodeIds: [], edgeIds: [] })
})

test('graphDeletion rejects unknown IDs and invalid graphs', () => {
  assert.throws(() => graphDeletion(nodes, edges, ['missing']), { name: 'Error', message: 'Unknown node in graph deletion: missing' })
  assert.throws(() => graphDeletion(nodes, edges, [], ['missing']), { name: 'Error', message: 'Unknown edge in graph deletion: missing' })
  assert.throws(() => graphDeletion([...nodes, { id: 'a', label: 'Again' }], edges, ['a']), /Duplicate graph node ID: a/)
  assert.throws(() => graphDeletion(nodes, [{ id: 'x', from: 'a', to: 'nowhere' }], []), /Unknown endpoint on graph edge: x/)
})

test('removeGraphElements returns new arrays and leaves the input untouched', () => {
  const frozenNodes = Object.freeze(nodes.map(node => Object.freeze({ ...node })))
  const frozenEdges = Object.freeze(edges.map(edge => Object.freeze({ ...edge })))
  const before = JSON.stringify([frozenNodes, frozenEdges])
  const deletion = graphDeletion(frozenNodes, frozenEdges, ['c'], ['ab'])
  const result = removeGraphElements(frozenNodes, frozenEdges, deletion)
  assert.deepEqual(result.nodes.map(node => node.id), ['a', 'b', 'd'])
  assert.deepEqual(result.edges.map(edge => edge.id), ['loop', 'da'])
  assert.notEqual(result.nodes, frozenNodes)
  assert.notEqual(result.edges, frozenEdges)
  // Remaining elements keep their identity and the inputs are unchanged.
  assert.equal(result.nodes[0], frozenNodes[0])
  assert.equal(JSON.stringify([frozenNodes, frozenEdges]), before)
  assert.deepEqual(deletion, { nodeIds: ['c'], edgeIds: ['ab', 'bc', 'cd'] })
})

test('removeGraphElements drops edges of removed nodes even when the deletion omits them', () => {
  const result = removeGraphElements(nodes, edges, { nodeIds: ['a'], edgeIds: [] })
  assert.deepEqual(result.nodes.map(node => node.id), ['b', 'c', 'd'])
  assert.deepEqual(result.edges.map(edge => edge.id), ['bc', 'cd', 'loop'])
  const empty = removeGraphElements(nodes, edges, { nodeIds: [], edgeIds: [] })
  assert.deepEqual(empty, { nodes, edges })
  assert.notEqual(empty.nodes, nodes)
  assert.throws(() => removeGraphElements(nodes, edges, { nodeIds: ['zz'], edgeIds: [] }), /Unknown node in graph deletion: zz/)
  assert.throws(() => removeGraphElements(nodes, edges, { nodeIds: [], edgeIds: ['zz'] }), /Unknown edge in graph deletion: zz/)
})
