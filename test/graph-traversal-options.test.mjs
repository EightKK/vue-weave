import assert from 'node:assert/strict'
import { test } from 'node:test'
import { graphTracePath, traverseGraph } from '@eightkk/vue-weave/core'
import { seededRandom } from './helpers/seeded.mjs'

// a → b → c → d → b is a cycle; a → c is an `info` edge, every other edge a `flow` edge; x → b joins from outside.
const graph = Object.freeze({
  nodes: Object.freeze(['a', 'b', 'c', 'd', 'x'].map(id => Object.freeze({ id }))),
  edges: Object.freeze([
    ['ab', 'a', 'b', 'flow'], ['bc', 'b', 'c', 'flow'], ['cd', 'c', 'd', 'flow'], ['ac', 'a', 'c', 'info'], ['db', 'd', 'b', 'flow'],
    ['xb', 'x', 'b', 'flow'],
  ].map(([id, from, to, kind]) => Object.freeze({ id, from, to, kind }))),
})
const flowOnly = edge => edge.kind === 'flow'

test('traverseGraph without the new options returns only nodeIds, edgeIds and unknownIds', () => {
  const plain = traverseGraph(graph, ['c'])
  assert.deepEqual(plain, { nodeIds: ['c', 'b', 'a', 'd', 'x'], edgeIds: ['bc', 'ac', 'ab', 'db', 'xb', 'cd'], unknownIds: [] })
  assert.deepEqual(traverseGraph(graph, ['c'], { paths: false }), plain)
})

test('the option walk finds the same nodes and edges as the plain walk on random graphs', () => {
  const { pick } = seededRandom(20261122)
  for (let round = 0; round < 60; round++) {
    const count = 2 + pick(14)
    const nodes = Array.from({ length: count }, (_, i) => ({ id: 'n' + i }))
    const edges = Array.from({ length: pick(count * 3) }, (_, i) => ({ id: 'e' + i, from: 'n' + pick(count), to: 'n' + pick(count) }))
    const starts = Array.from({ length: 1 + pick(3) }, () => 'n' + pick(count))
    for (const direction of ['forward', 'backward', 'both']) {
      for (const maxHops of [0, 1, 2, Infinity]) {
        const plain = traverseGraph({ nodes, edges }, starts, { direction, maxHops })
        for (const extra of [{ maxNodes: Infinity }, { paths: true }, { edgeFilter: () => true }]) {
          const { nodeIds, edgeIds, unknownIds, truncated } = traverseGraph({ nodes, edges }, starts, { direction, maxHops, ...extra })
          assert.deepEqual({ nodeIds, edgeIds, unknownIds }, plain)
          if (maxHops === Infinity) assert.deepEqual(truncated, [])
        }
      }
    }
  }
})

test('paths record the first step into each node, multiply reached nodes and rebuild paths', () => {
  const result = traverseGraph(graph, ['a'], { direction: 'forward', paths: true })
  assert.deepEqual(result.nodeIds, ['a', 'b', 'c', 'd'])
  assert.deepEqual(result.edgeIds, ['ab', 'ac', 'bc', 'cd', 'db'])
  assert.deepEqual(result.truncated, [])
  assert.deepEqual(Object.keys(result.via), ['forward'])
  assert.deepEqual([...result.via.forward], [
    ['b', { edgeId: 'ab', previousId: 'a' }], ['c', { edgeId: 'ac', previousId: 'a' }], ['d', { edgeId: 'cd', previousId: 'c' }],
  ])
  assert.deepEqual(result.multiplyReachedIds, ['b', 'c'])
  assert.deepEqual(graphTracePath(result, 'd'), { direction: 'forward', nodeIds: ['a', 'c', 'd'], edgeIds: ['ac', 'cd'] })
  assert.deepEqual(graphTracePath(result, 'a'), { nodeIds: ['a'], edgeIds: [] })
  assert.equal(graphTracePath(result, 'x'), undefined)
  assert.equal(graphTracePath(result, 'nope'), undefined)
  assert.equal(graphTracePath(result, 'd', { direction: 'backward' }), undefined)
})

test('edgeFilter follows one relation and sees each edge once per walk direction', () => {
  const calls = []
  const result = traverseGraph(graph, ['a'], {
    direction: 'forward', paths: true, edgeFilter: (edge, direction) => { calls.push(edge.id + ' ' + direction); return flowOnly(edge) },
  })
  assert.deepEqual(calls, ['ab forward', 'ac forward', 'bc forward', 'cd forward', 'db forward'])
  assert.deepEqual(result.nodeIds, ['a', 'b', 'c', 'd'])
  assert.deepEqual(result.edgeIds, ['ab', 'bc', 'cd', 'db'])
  assert.deepEqual(graphTracePath(result, 'd').edgeIds, ['ab', 'bc', 'cd'])
  assert.deepEqual(result.multiplyReachedIds, ['b'])

  const both = []
  traverseGraph(graph, ['c'], { edgeFilter: (edge, direction) => { both.push(edge.id + ' ' + direction); return true } })
  assert.equal(new Set(both).size, both.length)
  assert.ok(both.includes('cd backward') && both.includes('cd forward'))

  // The direction lets a filter follow different relations upstream and downstream.
  const upstreamInfo = traverseGraph(graph, ['c'], { direction: 'both', edgeFilter: (edge, direction) => direction === 'forward' || edge.kind === 'info' })
  assert.deepEqual(upstreamInfo.nodeIds, ['c', 'a', 'd', 'b'])
  assert.throws(() => traverseGraph(graph, ['a'], { edgeFilter: () => { throw new Error('filter failed') } }), { message: 'filter failed' })
})

test('maxHops truncation lists nodes with accepted edges left unfollowed', () => {
  const result = traverseGraph(graph, ['a'], { direction: 'forward', maxHops: 1, edgeFilter: flowOnly })
  assert.deepEqual(result.nodeIds, ['a', 'b'])
  assert.deepEqual(result.edgeIds, ['ab'])
  assert.deepEqual(result.truncated, [{ nodeId: 'b', direction: 'forward', reason: 'max-hops' }])
  // A node whose only edges the filter rejects is not truncated.
  const rejected = traverseGraph(graph, ['a'], { direction: 'forward', maxHops: 1, edgeFilter: edge => edge.id === 'ab' })
  assert.deepEqual(rejected.truncated, [])
  // maxNodes: Infinity reports hop truncation without limiting nodes; maxHops 0 stops at the starts.
  assert.deepEqual(traverseGraph(graph, ['x', 'd'], { direction: 'forward', maxHops: 0, maxNodes: Infinity }), {
    nodeIds: ['x', 'd'], edgeIds: [], unknownIds: [],
    truncated: [{ nodeId: 'x', direction: 'forward', reason: 'max-hops' }, { nodeId: 'd', direction: 'forward', reason: 'max-hops' }],
  })
})

test('maxNodes counts starts, admits nearest nodes first and counts a node once across both walks', () => {
  assert.deepEqual(traverseGraph(graph, ['a'], { direction: 'forward', maxNodes: 2 }), {
    nodeIds: ['a', 'b'], edgeIds: ['ab'], unknownIds: [],
    truncated: [{ nodeId: 'a', direction: 'forward', reason: 'max-nodes' }, { nodeId: 'b', direction: 'forward', reason: 'max-nodes' }],
  })
  // Starts are always kept, even beyond the cap; unknown starts do not count.
  const starts = traverseGraph(graph, ['a', 'zz', 'x', 'c'], { direction: 'forward', maxNodes: 1 })
  assert.deepEqual(starts.nodeIds, ['a', 'x', 'c'])
  assert.deepEqual(starts.edgeIds, ['ac'])
  assert.deepEqual(starts.unknownIds, ['zz'])
  assert.deepEqual(starts.truncated.map(item => item.nodeId), ['a', 'x', 'c'])

  // With `both`, the walks advance one hop at a time together: one node upstream and one downstream, not two upstream.
  const chain = {
    nodes: ['u2', 'u1', 's', 'v1'].map(id => ({ id })),
    edges: [{ id: 'e1', from: 'u2', to: 'u1' }, { id: 'e2', from: 'u1', to: 's' }, { id: 'e3', from: 's', to: 'v1' }],
  }
  assert.deepEqual(traverseGraph(chain, ['s'], { maxNodes: 3 }), {
    nodeIds: ['s', 'u1', 'v1'], edgeIds: ['e2', 'e3'], unknownIds: [], truncated: [{ nodeId: 'u1', direction: 'backward', reason: 'max-nodes' }],
  })

  // A node admitted by one walk costs nothing when the other walk reaches it.
  const shared = traverseGraph(graph, ['c'], { maxNodes: 4 })
  assert.deepEqual(shared.nodeIds, ['c', 'b', 'a', 'd'])
  assert.deepEqual(shared.edgeIds, ['bc', 'ac', 'ab', 'db', 'cd'])
  assert.deepEqual(shared.truncated, [{ nodeId: 'b', direction: 'backward', reason: 'max-nodes' }])
  const tight = traverseGraph(graph, ['c'], { maxNodes: 3 })
  assert.deepEqual(tight.nodeIds, ['c', 'b', 'a'])
  assert.deepEqual(tight.truncated, [
    { nodeId: 'c', direction: 'forward', reason: 'max-nodes' }, { nodeId: 'b', direction: 'backward', reason: 'max-nodes' },
  ])
})

test('direction both keeps one first-step map per walk, so rebuilt paths never mix directions', () => {
  const result = traverseGraph(graph, ['c'], { paths: true })
  assert.deepEqual(result.nodeIds, ['c', 'b', 'a', 'd', 'x'])
  assert.deepEqual([...result.via.backward.keys()], ['b', 'a', 'd', 'x'])
  assert.deepEqual([...result.via.forward.keys()], ['d', 'b'])
  assert.deepEqual(result.multiplyReachedIds, ['b', 'a', 'd'])
  // d is one hop downstream and two hops upstream (d → b → c): the shorter walk wins.
  assert.deepEqual(graphTracePath(result, 'd'), { direction: 'forward', nodeIds: ['c', 'd'], edgeIds: ['cd'] })
  assert.deepEqual(graphTracePath(result, 'd', { direction: 'backward' }), { direction: 'backward', nodeIds: ['c', 'b', 'd'], edgeIds: ['bc', 'db'] })
  assert.deepEqual(graphTracePath(result, 'b'), { direction: 'backward', nodeIds: ['c', 'b'], edgeIds: ['bc'] })
  assert.deepEqual(graphTracePath(result, 'b', { direction: 'forward' }), { direction: 'forward', nodeIds: ['c', 'd', 'b'], edgeIds: ['cd', 'db'] })
  assert.equal(graphTracePath(result, 'x', { direction: 'forward' }), undefined)
  assert.deepEqual(graphTracePath(result, 'c', { direction: 'forward' }), { nodeIds: ['c'], edgeIds: [] })
})

test('new traversal options and graphTracePath validate their input', () => {
  for (const maxNodes of [0, -1, 1.5, NaN, '3', null]) {
    assert.throws(() => traverseGraph(graph, ['a'], { maxNodes }), { name: 'RangeError', message: 'maxNodes must be a positive integer or Infinity' })
  }
  assert.throws(() => traverseGraph(graph, ['a'], { edgeFilter: 'flow' }), { name: 'TypeError', message: 'edgeFilter must be a function: string' })
  assert.throws(() => traverseGraph(graph, ['a'], { edgeFilter: null }), { name: 'TypeError', message: 'edgeFilter must be a function: null' })
  assert.throws(() => traverseGraph(graph, ['a'], { paths: 'yes' }), { name: 'TypeError', message: 'paths must be a boolean: string' })
  assert.throws(() => graphTracePath(traverseGraph(graph, ['a']), 'b'), { name: 'Error', message: 'graphTracePath needs a traverseGraph result made with paths: true' })
  const result = traverseGraph(graph, ['a'], { paths: true })
  assert.throws(() => graphTracePath(result, 'b', { direction: 'both' }), { name: 'RangeError', message: 'Invalid path direction: both' })
  const looped = { nodeIds: ['p', 'q'], via: { forward: new Map([['p', { edgeId: 'e1', previousId: 'q' }], ['q', { edgeId: 'e2', previousId: 'p' }]]) } }
  assert.throws(() => graphTracePath(looped, 'p'), { name: 'Error', message: 'Traversal steps form a cycle at node p' })
})

test('a 12,000-node chain is walked with paths and limits without recursion', () => {
  const n = 12000
  const nodes = Array.from({ length: n }, (_, i) => ({ id: 'n' + i }))
  const edges = Array.from({ length: n - 1 }, (_, i) => ({ id: 'e' + i, from: 'n' + i, to: 'n' + (i + 1) }))
  const full = traverseGraph({ nodes, edges }, ['n0'], { direction: 'forward', paths: true, edgeFilter: () => true })
  assert.equal(full.nodeIds.length, n)
  assert.deepEqual(full.truncated, [])
  assert.deepEqual(full.multiplyReachedIds, [])
  const path = graphTracePath(full, 'n' + (n - 1))
  assert.equal(path.edgeIds.length, n - 1)
  assert.equal(path.nodeIds[0], 'n0')

  const capped = traverseGraph({ nodes, edges }, ['n0'], { direction: 'forward', paths: true, maxNodes: 11000 })
  assert.equal(capped.nodeIds.length, 11000)
  assert.deepEqual(capped.truncated, [{ nodeId: 'n10999', direction: 'forward', reason: 'max-nodes' }])
  assert.equal(graphTracePath(capped, 'n10999').edgeIds.length, 10999)
  assert.equal(graphTracePath(capped, 'n11000'), undefined)

  const hops = traverseGraph({ nodes, edges }, ['n6000'], { paths: true, maxHops: 5000 })
  assert.equal(hops.nodeIds.length, 10001)
  assert.deepEqual(hops.truncated, [
    { nodeId: 'n1000', direction: 'backward', reason: 'max-hops' }, { nodeId: 'n11000', direction: 'forward', reason: 'max-hops' },
  ])
  assert.deepEqual(graphTracePath(hops, 'n1000').edgeIds.slice(0, 2), ['e5999', 'e5998'])
  assert.equal(graphTracePath(hops, 'n11000').edgeIds.length, 5000)
})

test('the hop limit truncates only nodes with accepted edges to nodes the walk has not reached', () => {
  const loop = { nodes: [{ id: 'a' }, { id: 'b' }, { id: 'c' }], edges: [{ id: 'ab', from: 'a', to: 'b' }, { id: 'ba', from: 'b', to: 'a' }] }
  assert.deepEqual(traverseGraph(loop, ['a'], { direction: 'forward', maxHops: 1, maxNodes: Infinity }).truncated, [])
  const chain = { ...loop, edges: [...loop.edges, { id: 'bc', from: 'b', to: 'c' }] }
  assert.deepEqual(traverseGraph(chain, ['a'], { direction: 'forward', maxHops: 1, maxNodes: Infinity }).truncated, [
    { nodeId: 'b', direction: 'forward', reason: 'max-hops' },
  ])
})
