import assert from 'node:assert/strict'
import { test } from 'node:test'
import { nextTick, ref } from 'vue'
import {
  buildViewBindingIndex, collapseGraphGroups, resolveCollapsedTargets, resolveEntityRefs, resolveLoadTargets, resolveViewTargets,
  traverseGraph,
} from '@eightkk/vue-weave/core'
import { revealLinkedTarget, useLinkedSelection } from '@eightkk/vue-weave'

const task = id => ({ kind: 'task', id })
const node = id => ({ view: 'graph', kind: 'node', id })
const bar = id => ({ view: 'timeline', kind: 'bar', id })
const load = (resourceId, start, end) => ({ view: 'load', resourceId, start, end })
const bindings = [
  { entity: task('A'), target: node('n1') }, { entity: task('A'), target: node('n2') },
  { entity: task('A'), target: bar('b1') }, { entity: task('A'), target: bar('b2') },
  { entity: { kind: 'resource', id: 'A' }, target: node('r1') },
]

test('O07: one task maps to two nodes and two bars, a resource with the same ID stays separate', () => {
  const index = buildViewBindingIndex(bindings)
  assert.deepEqual(resolveViewTargets(index, [task('A')]).targets, [node('n1'), node('n2'), bar('b1'), bar('b2')])
  assert.deepEqual(resolveViewTargets(index, [{ kind: 'resource', id: 'A' }]).targets, [node('r1')])
  assert.deepEqual(resolveEntityRefs(index, [node('r1')]).entities, [{ kind: 'resource', id: 'A' }])
  assert.deepEqual(resolveEntityRefs(index, [bar('b2')]).entities, [task('A')])
})

test('bindings: many-to-many, duplicates, unknown entries, inputs untouched, validation', () => {
  const input = [...bindings, bindings[0], { entity: task('B'), target: node('n1') }]
  const copy = structuredClone(input)
  const index = buildViewBindingIndex(input)
  assert.deepEqual(input, copy)
  assert.deepEqual(resolveEntityRefs(index, [node('n1')]).entities, [task('A'), task('B')])
  const targets = resolveViewTargets(index, [task('A'), task('A'), task('B'), task('zzz')])
  assert.deepEqual(targets.targets.filter(t => t.id === 'n1'), [node('n1')])
  assert.deepEqual(targets.unknown, [task('zzz')])
  assert.deepEqual(resolveEntityRefs(index, [node('missing'), node('missing')]).unknown, [node('missing')])
  // A graph node and a timeline bar that share an ID do not collide.
  assert.deepEqual(resolveEntityRefs(buildViewBindingIndex([{ entity: task('T'), target: node('x') }]), [bar('x')]).unknown, [bar('x')])
  assert.throws(() => buildViewBindingIndex([{ entity: { kind: '', id: 'a' }, target: node('n') }]), /Invalid entity/)
  assert.throws(() => buildViewBindingIndex([{ entity: task('a'), target: load('r', 5, 1) }]), RangeError)
})

test('load targets resolve by overlap and stale ranges become unknown', () => {
  const index = buildViewBindingIndex([{ entity: task('A'), target: load('R1', 2, 6) }])
  assert.deepEqual(resolveEntityRefs(index, [load('R1', 5, 9)]).entities, [task('A')])
  assert.deepEqual(resolveEntityRefs(index, [load('R1', 6, 9)]).unknown, [load('R1', 6, 9)])
  assert.deepEqual(resolveEntityRefs(index, [load('R2', 2, 6)]).unknown, [load('R2', 2, 6)])

  const segments = [
    { resourceId: 'R1', start: 0, end: 4, load: 1 }, { resourceId: 'R1', start: 4, end: 8, load: 2 },
    { resourceId: 'R2', start: 0, end: 8, load: 1 },
  ]
  const hit = resolveLoadTargets(segments, [load('R1', 3, 5), load('R1', 3, 4), load('R1', 8, 12), load('R3', 0, 1)])
  assert.deepEqual(hit.segments, [segments[0], segments[1]])
  assert.deepEqual(hit.unknown, [load('R1', 8, 12), load('R3', 0, 1)])
  assert.throws(() => resolveLoadTargets(segments, [bar('b')]), /load target/)
})

const gnodes = ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, label: id }))
const gedges = [
  { id: 'ab', from: 'a', to: 'b' }, { id: 'bc', from: 'b', to: 'c' }, { id: 'cd', from: 'c', to: 'd' },
  { id: 'ad', from: 'a', to: 'd' }, { id: 'xb', from: 'e', to: 'b' },
]

test('traverseGraph follows direction, hop limit and reports unknown IDs', () => {
  const graph = { nodes: gnodes, edges: gedges }
  const fwd = traverseGraph(graph, ['b'], { direction: 'forward' })
  assert.deepEqual(fwd.nodeIds, ['b', 'c', 'd'])
  assert.deepEqual(fwd.edgeIds, ['bc', 'cd'])
  const back = traverseGraph(graph, ['d'], { direction: 'backward', maxHops: 1 })
  assert.deepEqual(back.nodeIds, ['d', 'c', 'a'])
  assert.deepEqual(back.edgeIds, ['cd', 'ad'])
  // Both directions are independent: starting at c does not reach e through b.
  const both = traverseGraph(graph, ['c'], { maxHops: 1 })
  assert.deepEqual(new Set(both.nodeIds), new Set(['c', 'b', 'd']))
  assert.deepEqual(traverseGraph(graph, ['b'], { maxHops: 0 }), { nodeIds: ['b'], edgeIds: [], unknownIds: [] })
  assert.deepEqual(traverseGraph(graph, ['nope', 'b', 'nope'], { direction: 'forward', maxHops: 1 }).unknownIds, ['nope'])
  assert.throws(() => traverseGraph(graph, ['a'], { maxHops: -1 }), RangeError)
  assert.throws(() => traverseGraph(graph, ['a'], { maxHops: 1.5 }), RangeError)
  assert.throws(() => traverseGraph({ nodes: gnodes, edges: [{ id: 'bad', from: 'a', to: 'zz' }] }, ['a']), { name: 'Error', message: 'Unknown node in graph edge bad: zz' })
})

test('traverseGraph terminates on cycles and walks a long chain without recursion', () => {
  const cyc = traverseGraph({
    nodes: [{ id: 'a' }, { id: 'b' }], edges: [{ id: 'e1', from: 'a', to: 'b' }, { id: 'e2', from: 'b', to: 'a' }],
  }, ['a'], { direction: 'forward' })
  assert.deepEqual(cyc.nodeIds, ['a', 'b'])
  assert.deepEqual(cyc.edgeIds, ['e1', 'e2'])
  const n = 120000
  const nodes = Array.from({ length: n }, (_, i) => ({ id: 'n' + i }))
  const edges = Array.from({ length: n - 1 }, (_, i) => ({ id: 'e' + i, from: 'n' + i, to: 'n' + (i + 1) }))
  const result = traverseGraph({ nodes, edges }, ['n0'], { direction: 'forward' })
  assert.equal(result.nodeIds.length, n)
  assert.equal(result.edgeIds.length, n - 1)
})

test('resolveCollapsedTargets matches collapseGraphGroups', () => {
  const nodes = ['a', 'b', 'c', 'd'].map(id => ({ id, label: id }))
  const edges = [
    { id: 'e1', from: 'a', to: 'c' }, { id: 'e2', from: 'b', to: 'c' }, { id: 'e3', from: 'a', to: 'b' }, { id: 'e4', from: 'c', to: 'd' },
  ]
  const groups = [{ id: 'g', label: 'G', nodeIds: ['a', 'b'] }]
  const collapse = collapseGraphGroups(nodes, edges, groups, ['g'])
  const r = resolveCollapsedTargets(collapse, { nodeIds: ['a', 'c', 'g', 'zz'], edgeIds: ['e2', 'e3', 'e4', 'nope'] }, edges)
  // a is hidden: it resolves to the proxy g. e2 merged into e1; e3 is inside g; e4 is visible.
  assert.deepEqual(r.nodeIds, ['g', 'c'])
  assert.deepEqual(r.edgeIds, ['e1', 'e4'])
  assert.deepEqual(r.unknownNodeIds, ['zz'])
  assert.deepEqual(r.unknownEdgeIds, ['nope'])
  for (const id of r.edgeIds) assert.ok(collapse.edges.some(edge => edge.id === id))
})

test('useLinkedSelection: the acting view owns the selection and others only highlight', () => {
  const seen = []
  const linked = useLinkedSelection({ bindings, onSelect: (entities, owner) => seen.push([entities.length, owner]) })
  const first = linked.select('graph', [node('n1')])
  assert.equal(first.changed, true)
  assert.deepEqual([...linked.graph.value.selectedNodeIds], ['n1'])
  assert.deepEqual([...linked.graph.value.highlightedNodeIds], ['n2'])
  assert.deepEqual([...linked.timeline.value.selectedBarIds], [])
  assert.deepEqual([...linked.timeline.value.highlightedBarIds], ['b1', 'b2'])
  assert.equal(linked.owner.value, 'graph')
  // Reporting the same selection again, as an echoed event would, changes nothing.
  assert.equal(linked.select('graph', [node('n1')]).changed, false)
  assert.deepEqual(seen, [[1, 'graph']])
  // Selecting in another view moves ownership; the old view keeps no selection.
  linked.select('timeline', [bar('b1')])
  assert.deepEqual([...linked.timeline.value.selectedBarIds], ['b1'])
  assert.deepEqual([...linked.timeline.value.highlightedBarIds], ['b2'])
  assert.deepEqual([...linked.graph.value.selectedNodeIds], [])
  assert.deepEqual([...linked.graph.value.highlightedNodeIds].sort(), ['n1', 'n2'])
  assert.deepEqual(linked.selectedEntities.value, [task('A')])
  assert.equal(linked.clearSelection(), true)
  assert.equal(linked.clearSelection(), false)
  assert.deepEqual([...linked.graph.value.highlightedNodeIds], [])
  assert.throws(() => linked.select('graph', [bar('b1')]), /reported by view/)
})

test('useLinkedSelection: hover enters and leaves, unbound targets and reactive bindings', async () => {
  const source = ref([{ entity: task('A'), target: bar('b1') }])
  const linked = useLinkedSelection({ bindings: source })
  linked.hoverEnter('timeline', bar('b1'))
  assert.deepEqual(linked.hoveredEntities.value, [task('A')])
  assert.deepEqual([...linked.timeline.value.selectedBarIds], [])
  linked.hoverEnter('graph', node('none'))
  assert.deepEqual(linked.hoveredEntities.value, [])
  linked.hoverEnter('timeline', bar('b1'))
  linked.hoverLeave('timeline', bar('other')) // a late leave of another item is ignored
  assert.equal(linked.hoveredEntities.value.length, 1)
  linked.hoverLeave('timeline', bar('b1'))
  assert.deepEqual(linked.hoveredEntities.value, [])

  const res = linked.select('graph', [node('n9')])
  assert.deepEqual(res.unknown, [node('n9')])
  assert.deepEqual([...linked.graph.value.selectedNodeIds], ['n9'])
  source.value = [...source.value, { entity: task('A'), target: node('n9') }]
  await nextTick()
  assert.deepEqual([...linked.timeline.value.highlightedBarIds], ['b1'])
})

test('useLinkedSelection selectEntities: an external view selects by entity, without an owner', () => {
  const seen = []
  const linked = useLinkedSelection({
    bindings,
    onSelect: (entities, owner) => seen.push([entities.map(e => e.kind + ':' + e.id), owner, linked.selectionSource.value]),
  })
  const ghost = { kind: 'task', id: 'ghost' }
  const res = linked.selectEntities([task('A'), ghost, task('A')], { source: 'table' })
  assert.equal(res.changed, true)
  assert.deepEqual(res.unknown, [ghost])
  // Deduplicated, in input order, unbound entities included.
  assert.deepEqual(linked.selectedEntities.value, [task('A'), ghost])
  assert.equal(linked.owner.value, undefined)
  assert.equal(linked.selectionSource.value, 'table')
  // No view owns it: nothing is selected, everything bound is highlighted.
  assert.deepEqual([...linked.graph.value.selectedNodeIds], [])
  assert.deepEqual([...linked.graph.value.highlightedNodeIds].sort(), ['n1', 'n2'])
  assert.deepEqual([...linked.timeline.value.selectedBarIds], [])
  assert.deepEqual([...linked.timeline.value.highlightedBarIds].sort(), ['b1', 'b2'])
  assert.deepEqual(seen, [[['task:A', 'task:ghost'], undefined, 'table']])

  // The same entity set from the same source, as an echoed table event would report it, changes nothing.
  assert.equal(linked.selectEntities(new Set([ghost, task('A')]), { source: 'table' }).changed, false)
  assert.equal(seen.length, 1)
  // Another source is a new selection.
  assert.equal(linked.selectEntities([task('A'), ghost]).changed, true)
  assert.equal(linked.selectionSource.value, undefined)
  assert.equal(seen.length, 2)

  // A view selection replaces it, and an entity selection replaces a view selection.
  linked.select('graph', [node('n1')])
  assert.equal(linked.owner.value, 'graph')
  assert.equal(linked.selectionSource.value, undefined)
  assert.deepEqual([...linked.graph.value.selectedNodeIds], ['n1'])
  assert.equal(linked.selectEntities([task('A')], { source: 'table' }).changed, true)
  assert.equal(linked.owner.value, undefined)
  assert.deepEqual([...linked.graph.value.selectedNodeIds], [])
  assert.deepEqual([...linked.graph.value.highlightedNodeIds].sort(), ['n1', 'n2'])
  assert.equal(linked.select('graph', [node('n1')]).changed, true)

  // clearSelection and an empty input clear an entity selection.
  linked.selectEntities([task('A')], { source: 'table' })
  assert.equal(linked.clearSelection(), true)
  assert.deepEqual(linked.selectedEntities.value, [])
  assert.deepEqual([...linked.timeline.value.highlightedBarIds], [])
  assert.equal(linked.clearSelection(), false)
  linked.selectEntities([task('A')], { source: 'table' })
  assert.deepEqual(linked.selectEntities([], { source: 'table' }), { changed: true, unknown: [] })
  assert.deepEqual(linked.selectedEntities.value, [])
  assert.deepEqual(linked.selectEntities([]), { changed: false, unknown: [] })
  assert.deepEqual(seen.at(-1), [[], undefined, undefined])
})

test('useLinkedSelection selectEntities: input validation and re-resolution on bindings changes', async () => {
  const source = ref([{ entity: task('A'), target: bar('b1') }])
  const calls = []
  const linked = useLinkedSelection({ bindings: source, onSelect: entities => calls.push(entities) })
  assert.throws(() => linked.selectEntities([{ kind: '', id: 'x' }]), /Invalid entity reference/)
  assert.throws(() => linked.selectEntities([{ kind: 'task', id: '' }]), Error)
  assert.throws(() => linked.selectEntities([null]), /Invalid entity reference/)
  assert.throws(() => linked.selectEntities([task('A')], { source: 3 }), /source must be a string/)
  // A rejected call leaves the selection and onSelect untouched.
  assert.deepEqual(linked.selectedEntities.value, [])
  assert.deepEqual(calls, [])

  const input = [task('B')]
  const res = linked.selectEntities(input, { source: 'list' })
  assert.deepEqual(res.unknown, [task('B')])
  assert.deepEqual([...linked.timeline.value.highlightedBarIds], [])
  // The input is not kept by reference.
  input.push(task('A'))
  assert.deepEqual(linked.selectedEntities.value, [task('B')])
  source.value = [...source.value, { entity: task('B'), target: bar('b2') }, { entity: task('B'), target: node('n7') }]
  await nextTick()
  assert.deepEqual([...linked.timeline.value.highlightedBarIds], ['b2'])
  assert.deepEqual([...linked.graph.value.highlightedNodeIds], ['n7'])
  assert.deepEqual(linked.selectedEntities.value, [task('B')])
  // Hover still adds its own highlights on top.
  linked.hoverEnter('timeline', bar('b1'))
  assert.deepEqual([...linked.timeline.value.highlightedBarIds].sort(), ['b1', 'b2'])
})

test('revealLinkedTarget expands only what the application accepts and never reports a declined reveal as revealed', async () => {
  // A fake view: `n` is hidden in group `inner`, which is hidden in collapsed group `outer`.
  const collapsed = new Set(['outer', 'inner'])
  const calls = []
  const reveal = id => () => {
    calls.push(id)
    if (id === 'gone') return Promise.resolve({ status: 'unknown' })
    if (collapsed.has('outer')) return Promise.resolve({ status: 'hidden-by-collapse', proxyId: 'outer' })
    if (collapsed.has('inner')) return Promise.resolve({ status: 'hidden-by-collapse', proxyId: 'inner' })
    return Promise.resolve({ status: 'revealed' })
  }

  // Without `expand`, the hidden result is returned and nothing changes.
  assert.deepEqual(await revealLinkedTarget({ reveal: reveal('n') }), { status: 'hidden-by-collapse', proxyId: 'outer', expandedIds: [] })

  // The application declines: no move is reported and the collapsed set is untouched.
  const declined = await revealLinkedTarget({ reveal: reveal('n'), expand: () => false })
  assert.deepEqual(declined, { status: 'hidden-by-collapse', proxyId: 'outer', expandedIds: [], declined: true })
  assert.deepEqual([...collapsed], ['outer', 'inner'])

  // Accepting without changing the controlled set does not loop.
  const ignored = await revealLinkedTarget({ reveal: reveal('n'), expand: () => true })
  assert.equal(ignored.status, 'hidden-by-collapse')
  assert.equal(ignored.declined, true)

  // Nested collapses are expanded one by one, each followed by a fresh reveal.
  calls.length = 0
  const asked = []
  const shown = await revealLinkedTarget({
    reveal: reveal('n'),
    expand: async proxyId => {
      asked.push(proxyId)
      collapsed.delete(proxyId)
      return true
    },
  })
  assert.deepEqual(shown, { status: 'revealed', expandedIds: ['outer', 'inner'] })
  assert.deepEqual(asked, ['outer', 'inner'])
  assert.equal(calls.length, 3)

  // Unknown items and unmounted views are unknown; nothing is expanded.
  assert.deepEqual(await revealLinkedTarget({ reveal: reveal('gone'), expand: () => assert.fail('not asked') }), { status: 'unknown', expandedIds: [] })
  assert.deepEqual(await revealLinkedTarget({ reveal: () => undefined }), { status: 'unknown', expandedIds: [] })
  await assert.rejects(revealLinkedTarget({ reveal: reveal('n'), maxExpansions: -1 }), RangeError)
})
