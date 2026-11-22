import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  beginGraphExpansion, cancelGraphExpansion, createGraphExpansion, graphExpansionView, mergeGraphExpansionPage,
} from '@eightkk/vue-weave/core'

const node = id => ({ id })
const edge = (from, to) => ({ id: from + to, from, to })
const keys = byKey => Object.fromEntries([...(byKey ?? [])].map(([key, ids]) => [key, [...ids]]))
const frontier = (state, key) => graphExpansionView(state, key === undefined ? undefined : { key }).frontierIds

test('unkeyed graph expansion keeps the state shape of earlier releases', () => {
  let state = createGraphExpansion({ nodes: [node('a')] })
  assert.deepEqual(Object.keys(state), ['nodes', 'edges', 'expandedIds', 'pendingIds'])
  state = beginGraphExpansion(state, ['a'])
  state = mergeGraphExpansionPage(state, { nodes: [node('b')], edges: [edge('a', 'b')] }, ['a'])
  state = cancelGraphExpansion(beginGraphExpansion(state, ['b']), ['b'])
  assert.deepEqual(Object.keys(state), ['nodes', 'edges', 'expandedIds', 'pendingIds'])
  assert.deepEqual(frontier(state), ['b'])
})

test('keyed expansion tracks forward and backward separately', () => {
  // b ← a → c: expanding a forward loads c; expanding it backward later loads b.
  let state = createGraphExpansion({ nodes: [node('a')] })
  state = beginGraphExpansion(state, ['a'], { key: 'forward' })
  assert.deepEqual(keys(state.pendingIdsByKey), { forward: ['a'] })
  assert.deepEqual(frontier(state, 'forward'), [])
  assert.deepEqual(frontier(state, 'backward'), ['a'])
  assert.deepEqual(frontier(state), ['a'])

  state = mergeGraphExpansionPage(state, { nodes: [node('c')], edges: [edge('a', 'c')] }, ['a'], { key: 'forward' })
  assert.deepEqual(keys(state.expandedIdsByKey), { forward: ['a'] })
  assert.deepEqual(keys(state.pendingIdsByKey), {})
  assert.deepEqual([...state.expandedIds], [])
  assert.deepEqual(frontier(state, 'forward'), ['c'])
  assert.deepEqual(frontier(state, 'backward'), ['a', 'c'])
  // A node expanded for one key only stays in the unkeyed frontier.
  assert.deepEqual(frontier(state), ['a', 'c'])

  // Beginning an expansion that is already done for the key is a no-op for that node.
  assert.deepEqual(keys(beginGraphExpansion(state, ['a', 'c'], { key: 'forward' }).pendingIdsByKey), { forward: ['c'] })

  // A failed backward load returns a to the backward frontier only.
  const failed = cancelGraphExpansion(beginGraphExpansion(state, ['a'], { key: 'backward' }), ['a'], { key: 'backward' })
  assert.deepEqual(frontier(failed, 'backward'), ['a', 'c'])
  assert.deepEqual(keys(failed.pendingIdsByKey), {})

  state = mergeGraphExpansionPage(beginGraphExpansion(state, ['a'], { key: 'backward' }), { nodes: [node('b')], edges: [edge('b', 'a')] }, ['a'], { key: 'backward' })
  assert.deepEqual(keys(state.expandedIdsByKey), { forward: ['a'], backward: ['a'] })
  assert.deepEqual(frontier(state, 'backward'), ['c', 'b'])
  assert.deepEqual(graphExpansionView(state).edges.map(item => item.id), ['ac', 'ba'])
})

test('unkeyed expansion covers every key, and keyed and unkeyed pending stay apart', () => {
  let state = createGraphExpansion({ nodes: [node('a'), node('b')] })
  state = beginGraphExpansion(state, ['a'])
  // An unkeyed expansion in flight takes the node out of every keyed frontier.
  assert.deepEqual(frontier(state, 'calls'), ['b'])
  // A keyed begin on a fully expanded node is skipped.
  state = mergeGraphExpansionPage(state, {}, ['a'])
  assert.equal(beginGraphExpansion(state, ['a'], { key: 'calls' }).pendingIdsByKey.size, 0)
  assert.deepEqual(frontier(state, 'calls'), ['b'])

  // Cancelling without a key leaves a keyed expansion of the same node in flight, and the reverse.
  state = beginGraphExpansion(beginGraphExpansion(state, ['b'], { key: 'calls' }), ['b'])
  const unkeyedCancelled = cancelGraphExpansion(state, ['b'])
  assert.deepEqual(frontier(unkeyedCancelled), ['b'])
  assert.deepEqual(frontier(unkeyedCancelled, 'calls'), [])
  const keyedCancelled = cancelGraphExpansion(state, ['b'], { key: 'calls' })
  assert.deepEqual(frontier(keyedCancelled), [])
  assert.deepEqual(keys(keyedCancelled.pendingIdsByKey), {})

  // An unkeyed merge keeps the keyed fields and marks the node expanded for every key.
  const merged = mergeGraphExpansionPage(state, {}, ['b'])
  assert.deepEqual(keys(merged.pendingIdsByKey), { calls: ['b'] })
  assert.deepEqual(frontier(merged, 'calls'), [])
  assert.deepEqual(frontier(merged, 'owns'), [])
})

test('keyed expansion never modifies its input and validates the key', () => {
  const base = mergeGraphExpansionPage(createGraphExpansion({ nodes: [node('a')] }), {}, ['a'], { key: 'forward' })
  const expanded = base.expandedIdsByKey
  const forwardIds = expanded.get('forward')
  const begun = beginGraphExpansion(base, ['x'], { key: 'forward' })
  const merged = mergeGraphExpansionPage(begun, { nodes: [node('x')] }, ['x'], { key: 'forward' })
  cancelGraphExpansion(begun, ['x'], { key: 'forward' })
  assert.equal(base.expandedIdsByKey, expanded)
  assert.deepEqual([...forwardIds], ['a'])
  assert.equal(base.pendingIdsByKey.size, 0)
  assert.deepEqual(keys(begun.pendingIdsByKey), { forward: ['x'] })
  assert.deepEqual(keys(merged.expandedIdsByKey), { forward: ['a', 'x'] })
  assert.notEqual(merged.expandedIdsByKey, begun.expandedIdsByKey)

  // A hand-built state without keyed fields stays valid.
  const handBuilt = { nodes: new Map([['a', node('a')]]), edges: new Map(), expandedIds: new Set(), pendingIds: new Set() }
  assert.deepEqual(frontier(handBuilt, 'forward'), ['a'])
  assert.deepEqual(keys(beginGraphExpansion(handBuilt, ['a'], { key: 'forward' }).pendingIdsByKey), { forward: ['a'] })

  for (const key of ['', 3, null]) {
    const message = 'Invalid graph expansion key: ' + (key === '' ? '""' : String(key))
    assert.throws(() => beginGraphExpansion(base, ['a'], { key }), { name: 'Error', message })
    assert.throws(() => cancelGraphExpansion(base, ['a'], { key }), { name: 'Error', message })
    assert.throws(() => mergeGraphExpansionPage(base, {}, ['a'], { key }), { name: 'Error', message })
    assert.throws(() => graphExpansionView(base, { key }), { name: 'Error', message })
  }
  assert.throws(() => graphExpansionView(base, 'forward'), { name: 'TypeError', message: 'Graph expansion options must be an object' })
})
