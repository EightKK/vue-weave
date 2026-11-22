import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nextTick, ref } from 'vue'
import { buildViewBindingIndex, resolveTimeRangeTargets, timelineBarsInRange } from '@eightkk/vue-weave/core'
import { useLinkedSelection } from '@eightkk/vue-weave'

const ids = bars => bars.map(bar => bar.id)
const range = (start, end) => ({ start, end })
const bar = (id, start, end, extra = {}) => ({ id, rowId: extra.rowId ?? 'r1', label: id, start, end, ...extra })

test('timelineBarsInRange: half-open overlap of bar intervals', () => {
  const bars = [bar('before', 0, 10), bar('touchStart', 5, 10), bar('inside', 12, 14), bar('across', 8, 30), bar('touchEnd', 20, 25), bar('after', 21, 30)]
  // Selection [10, 20): a bar ending exactly at 10 and one starting exactly at 20 are not active.
  assert.deepEqual(ids(timelineBarsInRange(bars, range(10, 20))), ['inside', 'across'])
  assert.deepEqual(ids(timelineBarsInRange(bars, range(9, 21))), ['before', 'touchStart', 'inside', 'across', 'touchEnd'])
})

test('timelineBarsInRange: milestones count at the selection start but not at its end', () => {
  const bars = [bar('atStart', 10, 10), bar('inside', 15, 15), bar('atEnd', 20, 20), bar('before', 9, 9)]
  assert.deepEqual(ids(timelineBarsInRange(bars, range(10, 20))), ['atStart', 'inside'])
})

test('timelineBarsInRange: a split bar uses its work segments, so a pause covering the selection is not active', () => {
  // Work 09:00-12:00 and 13:00-17:00 with a lunch pause 12:00-13:00.
  const split = bar('split', 9, 17, { segments: [range(9, 12), range(13, 17)] })
  const plain = bar('plain', 9, 17)
  assert.deepEqual(ids(timelineBarsInRange([split, plain], range(12, 13))), ['plain'])
  assert.deepEqual(ids(timelineBarsInRange([split, plain], range(12.5, 12.75))), ['plain'])
  assert.deepEqual(ids(timelineBarsInRange([split, plain], range(11.5, 12.5))), ['split', 'plain'])
  assert.deepEqual(ids(timelineBarsInRange([split], range(12, 13.01))), ['split'])
  // Instant selections at the segment boundaries follow the half-open rule.
  assert.deepEqual(ids(timelineBarsInRange([split], range(12, 12))), [])
  assert.deepEqual(ids(timelineBarsInRange([split], range(13, 13))), ['split'])
})

test('timelineBarsInRange: an empty range is an instant', () => {
  const bars = [bar('work', 10, 20), bar('ends', 5, 10), bar('milestone', 10, 10), bar('otherMilestone', 11, 11)]
  assert.deepEqual(ids(timelineBarsInRange(bars, range(10, 10))), ['work', 'milestone'])
  assert.deepEqual(ids(timelineBarsInRange(bars, range(20, 20))), [])
})

test('timelineBarsInRange: row restriction, input order and untouched input', () => {
  const bars = [bar('x1', 0, 10, { rowId: 'machineX' }), bar('y1', 0, 10, { rowId: 'machineY' }), bar('x2', 5, 15, { rowId: 'machineX' })]
  const copy = structuredClone(bars)
  const found = timelineBarsInRange(bars, range(4, 6), { rowIds: ['machineX'] })
  assert.deepEqual(ids(found), ['x1', 'x2'])
  assert.equal(found[0], bars[0])
  assert.deepEqual(ids(timelineBarsInRange(bars, range(4, 6), { rowIds: new Set(['unknown']) })), [])
  assert.deepEqual(ids(timelineBarsInRange(bars, range(4, 6), { rowIds: [] })), [])
  assert.deepEqual(bars, copy)
})

test('timelineBarsInRange: validation', () => {
  const bars = [bar('a', 0, 10)]
  assert.throws(() => timelineBarsInRange(bars, range(10, 5)), RangeError)
  assert.throws(() => timelineBarsInRange(bars, range(Number.NaN, 5)), RangeError)
  assert.throws(() => timelineBarsInRange(bars, range(0, Infinity)), RangeError)
  assert.throws(() => timelineBarsInRange([bar('bad', 5, 1)], range(0, 10)), RangeError)
  assert.throws(() => timelineBarsInRange([bar('bad', 0, Number.NaN)], range(0, 10)), RangeError)
  assert.throws(() => timelineBarsInRange([bar('bad', 0, 10, { segments: [] })], range(0, 10)), RangeError)
  assert.throws(() => timelineBarsInRange([bar('bad', 0, 10, { segments: [range(3, 3)] })], range(0, 10)), RangeError)
  assert.throws(() => timelineBarsInRange([bar('bad', 5, 5, { segments: [range(5, 6)] })], range(0, 10)), RangeError)
})

// Tasks bound to graph nodes, timeline bars, rows and load ranges; dependencies to edges.
const task = id => ({ kind: 'task', id })
const dep = id => ({ kind: 'dependency', id })
const gnode = id => ({ view: 'graph', kind: 'node', id })
const gedge = id => ({ view: 'graph', kind: 'edge', id })
const tbar = id => ({ view: 'timeline', kind: 'bar', id })
// A cycle a -> b -> c -> a, plus c -> d.
const graph = {
  nodes: ['a', 'b', 'c', 'd'].map(id => ({ id })),
  edges: [{ id: 'ab', from: 'a', to: 'b' }, { id: 'bc', from: 'b', to: 'c' }, { id: 'ca', from: 'c', to: 'a' }, { id: 'cd', from: 'c', to: 'd' }],
}
const bindings = [
  ...['a', 'b', 'c', 'd'].flatMap(id => [{ entity: task(id), target: gnode('n-' + id) }, { entity: task(id), target: tbar('bar-' + id) }]),
  ...graph.edges.map(edge => ({ entity: dep(edge.id), target: gedge('e-' + edge.id) })),
]
const mappedGraph = {
  nodes: graph.nodes.map(node => ({ id: 'n-' + node.id })),
  edges: graph.edges.map(edge => ({ id: 'e-' + edge.id, from: 'n-' + edge.from, to: 'n-' + edge.to })),
}

test('resolveTimeRangeTargets: one bar bound to several entities, unknown bars and no traversal', () => {
  const index = buildViewBindingIndex([
    ...bindings,
    { entity: { kind: 'order', id: 'O1' }, target: tbar('bar-a') },
    { entity: { kind: 'order', id: 'O1' }, target: gnode('n-order') },
    { entity: { kind: 'resource', id: 'X' }, target: tbar('bar-a') },
    { entity: { kind: 'resource', id: 'X' }, target: { view: 'load', resourceId: 'X', start: 0, end: 10 } },
  ])
  const result = resolveTimeRangeTargets(index, ['bar-a', 'bar-a', 'bar-zz'])
  assert.deepEqual(result.activeBarIds, ['bar-a', 'bar-zz'])
  assert.deepEqual(result.activeEntities, [task('a'), { kind: 'order', id: 'O1' }, { kind: 'resource', id: 'X' }])
  assert.deepEqual(result.activeTargets, [
    tbar('bar-a'), tbar('bar-zz'), gnode('n-a'), gnode('n-order'), { view: 'load', resourceId: 'X', start: 0, end: 10 },
  ])
  assert.deepEqual(result.unknownBarIds, ['bar-zz'])
  assert.deepEqual(result.relatedEntities, [])
  assert.deepEqual(result.relatedTargets, [])
})

test('resolveTimeRangeTargets: traversal terminates on a cyclic graph and keeps active and related apart', () => {
  const index = buildViewBindingIndex(bindings)
  const successors = resolveTimeRangeTargets(index, ['bar-a'], { graph: mappedGraph, traversal: { direction: 'forward' } })
  assert.deepEqual(successors.activeEntities, [task('a')])
  assert.deepEqual(successors.relatedEntities, [task('b'), task('c'), task('d'), dep('ab'), dep('bc'), dep('ca'), dep('cd')])
  assert.ok(!successors.relatedTargets.some(t => t.id === 'n-a' || t.id === 'bar-a'))
  assert.ok(successors.relatedTargets.some(t => t.view === 'timeline' && t.id === 'bar-d'))

  // The traversal filter and node cap of traverseGraph pass through.
  const filtered = resolveTimeRangeTargets(index, ['bar-a'], { graph: mappedGraph, traversal: { direction: 'forward', edgeFilter: edge => edge.id !== 'e-bc' } })
  assert.deepEqual(filtered.relatedEntities, [task('b'), dep('ab')])
  const capped = resolveTimeRangeTargets(index, ['bar-a'], { graph: mappedGraph, traversal: { direction: 'forward', maxNodes: 2 } })
  assert.deepEqual(capped.relatedEntities, [task('b'), dep('ab')])

  const neighbours = resolveTimeRangeTargets(index, ['bar-a'], { graph: mappedGraph, traversal: { direction: 'both', maxHops: 1 } })
  assert.deepEqual(neighbours.relatedEntities.filter(e => e.kind === 'task'), [task('c'), task('b')])
  const predecessors = resolveTimeRangeTargets(index, ['bar-a'], { graph: mappedGraph, traversal: { direction: 'backward', maxHops: 1 } })
  assert.deepEqual(predecessors.relatedEntities, [task('c'), dep('ca')])
  const deep = resolveTimeRangeTargets(index, ['bar-d'], { graph: mappedGraph, traversal: { direction: 'backward' } })
  assert.deepEqual(deep.relatedEntities.filter(e => e.kind === 'task'), [task('c'), task('b'), task('a')])
  // Nothing reaches forward from d.
  assert.deepEqual(resolveTimeRangeTargets(index, ['bar-d'], { graph: mappedGraph, traversal: { direction: 'forward' } }).relatedTargets, [])
  // Two active tasks: neither is reported as related.
  const both = resolveTimeRangeTargets(index, ['bar-a', 'bar-b'], { graph: mappedGraph, traversal: { direction: 'both' } })
  assert.ok(!both.relatedEntities.some(e => e.id === 'a' || e.id === 'b'))

  assert.throws(() => resolveTimeRangeTargets(index, ['bar-a'], { graph: mappedGraph, traversal: { maxHops: -1 } }), RangeError)
  assert.throws(() => resolveTimeRangeTargets(index, ['bar-a'], { graph: mappedGraph, traversal: { direction: 'sideways' } }), RangeError)
})

test('useLinkedSelection timeRange: display-only highlights that never enter the selection', async () => {
  const bars = [
    { id: 'bar-a', rowId: 'machineX', label: 'a', start: 0, end: 10, segments: [range(0, 4), range(6, 10)] },
    { id: 'bar-b', rowId: 'machineX', label: 'b', start: 10, end: 20 },
    { id: 'bar-c', rowId: 'machineY', label: 'c', start: 0, end: 20 },
    { id: 'bar-d', rowId: 'machineY', label: 'd', start: 20, end: 30 },
  ]
  const timeRange = ref(undefined)
  const selected = []
  const linked = useLinkedSelection({ bindings, timeRange, onSelect: entities => selected.push(entities) })
  const before = { graph: linked.graph.value, timeline: linked.timeline.value, load: linked.load.value }
  assert.equal(linked.timeRange.value, undefined)
  assert.equal(before.graph.highlightedNodeIds.size, 0)
  assert.equal(before.graph.relatedNodeIds.size, 0)
  assert.equal(before.timeline.relatedBarIds.size, 0)
  assert.deepEqual(before.load.related, [])

  // Machine X, [2, 8): bar-a works in it (its pause 4-6 does not cover the whole range); bar-b does not.
  timeRange.value = { range: range(2, 8), bars, rowIds: ['machineX'], graph: mappedGraph, traversal: { direction: 'forward', maxHops: 1 } }
  await nextTick()
  assert.deepEqual(linked.timeRange.value.activeBarIds, ['bar-a'])
  assert.deepEqual([...linked.graph.value.highlightedNodeIds], ['n-a'])
  assert.deepEqual([...linked.timeline.value.highlightedBarIds], ['bar-a'])
  assert.deepEqual([...linked.graph.value.relatedNodeIds], ['n-b'])
  assert.deepEqual([...linked.graph.value.relatedEdgeIds], ['e-ab'])
  assert.deepEqual([...linked.timeline.value.relatedBarIds], ['bar-b'])
  // Nothing is selected: the range never writes into selectedIds and does not call onSelect.
  assert.equal(linked.owner.value, undefined)
  assert.equal(linked.graph.value.selectedNodeIds.size, 0)
  assert.equal(linked.timeline.value.selectedBarIds.size, 0)
  assert.deepEqual(selected, [])

  // The pause alone: machine X, [4, 6) is nothing.
  timeRange.value = { ...timeRange.value, range: range(4, 6) }
  await nextTick()
  assert.deepEqual(linked.timeRange.value.activeBarIds, [])
  assert.equal(linked.graph.value.highlightedNodeIds.size, 0)
  assert.equal(linked.graph.value.relatedNodeIds.size, 0)

  // A real selection in the graph keeps its own set; range highlights skip what the graph selected.
  timeRange.value = { range: range(2, 8), bars, graph: mappedGraph, traversal: { direction: 'forward', maxHops: 1 } }
  linked.select('graph', [gnode('n-b')])
  await nextTick()
  assert.deepEqual([...linked.graph.value.selectedNodeIds], ['n-b'])
  assert.deepEqual(new Set(linked.graph.value.highlightedNodeIds), new Set(['n-a', 'n-c']))
  assert.ok(!linked.graph.value.relatedNodeIds.has('n-b'))
  assert.ok(!linked.graph.value.relatedNodeIds.has('n-a'))
  assert.ok(linked.graph.value.relatedNodeIds.has('n-d'))
  assert.deepEqual([...linked.timeline.value.selectedBarIds], [])
  assert.deepEqual(selected.length, 1)
  assert.deepEqual(linked.selectedEntities.value, [task('b')])

  // Clearing the range restores the plain linked selection.
  timeRange.value = undefined
  await nextTick()
  assert.deepEqual([...linked.graph.value.highlightedNodeIds], [])
  assert.deepEqual([...linked.timeline.value.highlightedBarIds], ['bar-b'])
  assert.equal(linked.graph.value.relatedNodeIds.size, 0)
})

test('useLinkedSelection timeRange: invalid ranges throw RangeError when read', () => {
  const linked = useLinkedSelection({ bindings, timeRange: { range: range(5, 1), bars: [] } })
  assert.throws(() => linked.graph.value, RangeError)
})
