import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildViewBindingIndex, resolveEntityRefs, scheduleTasks, taskViewBindings } from '@eightkk/vue-weave/core'
import { taskViewBindings as fromVueEntry, useLinkedSelection } from '@eightkk/vue-weave'

const tasks = [{ id: 'A', start: 0, end: 2 }, { id: 'B', start: 2, end: 5 }, { id: 'C' }]
const assignments = [{ taskId: 'A', resourceId: 'press' }, { taskId: 'B', resourceId: 'press' }, { taskId: 'B', resourceId: 'crew' }]
const dependencies = [{ id: 'A-B', from: 'A', to: 'B' }]

test('taskViewBindings binds each task to its node, bar, row and load, and each dependency to its edge and arrow', () => {
  const input = structuredClone({ tasks, assignments, dependencies })
  const bindings = taskViewBindings(input)
  assert.deepEqual(bindings.map(({ entity, target }) => [entity.kind + ':' + entity.id, target.view === 'load'
    ? `load ${target.resourceId} ${target.start}-${target.end}` : `${target.view} ${target.kind} ${target.id}`]), [
    ['task:A', 'graph node A'], ['task:A', 'timeline bar A'], ['task:A', 'timeline row A'], ['task:A', 'load press 0-2'],
    ['task:B', 'graph node B'], ['task:B', 'timeline bar B'], ['task:B', 'timeline row B'], ['task:B', 'load press 2-5'], ['task:B', 'load crew 2-5'],
    ['task:C', 'graph node C'], ['task:C', 'timeline bar C'], ['task:C', 'timeline row C'],
    ['dependency:A-B', 'graph edge A-B'], ['dependency:A-B', 'timeline dependency A-B'],
  ])
  // The input is not modified, and the bindings share no objects with it.
  assert.deepEqual(input, { tasks, assignments, dependencies })
  bindings[0].entity.id = 'changed'
  assert.equal(input.tasks[0].id, 'A')
  assert.strictEqual(fromVueEntry, taskViewBindings)
})

test('taskViewBindings takes entity kinds and works with a schedule, the binding index and useLinkedSelection', () => {
  const schedule = scheduleTasks({ range: { start: 0, end: 20 }, tasks: [{ id: 'A', duration: 2 }, { id: 'B', duration: 3 }], dependencies })
  assert.ok(schedule.ok)
  const bindings = taskViewBindings({ tasks: schedule.tasks, assignments: [{ taskId: 'B', resourceId: 'press' }], dependencies, taskKind: 'operation', dependencyKind: 'link' })
  const index = buildViewBindingIndex(bindings)
  // A load segment overlapping B's range finds B; edges and arrows find the link.
  assert.deepEqual(resolveEntityRefs(index, [{ view: 'load', resourceId: 'press', start: 3, end: 4 }]).entities, [{ kind: 'operation', id: 'B' }])
  assert.deepEqual(resolveEntityRefs(index, [{ view: 'graph', kind: 'edge', id: 'A-B' }]).entities, [{ kind: 'link', id: 'A-B' }])
  const linked = useLinkedSelection({ bindings })
  linked.select('timeline', [{ view: 'timeline', kind: 'bar', id: 'B' }])
  assert.deepEqual([...linked.graph.value.highlightedNodeIds], ['B'])
  assert.deepEqual([...linked.timeline.value.highlightedRowIds], ['B'])
  assert.deepEqual(linked.load.value.highlighted, [{ view: 'load', resourceId: 'press', start: 2, end: 5 }])
})

test('taskViewBindings without assignments or dependencies needs no times', () => {
  assert.deepEqual(taskViewBindings({ tasks: [{ id: 'x' }] }).map(binding => binding.target.view), ['graph', 'timeline', 'timeline'])
  assert.deepEqual(taskViewBindings({ tasks: [] }), [])
})

test('taskViewBindings validates IDs, references, kinds and the times of assigned tasks', () => {
  assert.throws(() => taskViewBindings({ tasks: [{ id: '' }] }), { name: 'Error', message: 'Invalid task ID: ""' })
  assert.throws(() => taskViewBindings({ tasks: [{ id: 'A' }, { id: 'A' }] }), { name: 'Error', message: 'Duplicate task ID: A' })
  assert.throws(() => taskViewBindings({ tasks, dependencies: [{ id: 'd' }, { id: 'd' }] }), { name: 'Error', message: 'Duplicate dependency ID: d' })
  assert.throws(() => taskViewBindings({ tasks, dependencies: [{ id: 7 }] }), { name: 'Error', message: 'Invalid dependency ID: 7' })
  assert.throws(() => taskViewBindings({ tasks, assignments: [{ taskId: 'X', resourceId: 'press' }] }), { name: 'Error', message: 'Unknown task in assignment: X' })
  assert.throws(() => taskViewBindings({ tasks, assignments: [{ taskId: 'A', resourceId: '' }] }), { name: 'Error', message: 'Invalid resource ID: "" (assignment of task A)' })
  assert.throws(() => taskViewBindings({ tasks, taskKind: '' }), { name: 'Error', message: /Invalid entity kind/ })
  assert.throws(() => taskViewBindings({ tasks, dependencyKind: '' }), { name: 'Error', message: /Invalid entity kind/ })
  // An assigned task needs a finite range that does not end before it starts.
  assert.throws(() => taskViewBindings({ tasks, assignments: [{ taskId: 'C', resourceId: 'press' }] }), RangeError)
  assert.throws(() => taskViewBindings({ tasks: [{ id: 'A', start: 4, end: 2 }], assignments: [{ taskId: 'A', resourceId: 'press' }] }), RangeError)
  assert.throws(() => taskViewBindings({ tasks: [{ id: 'A', start: 0, end: Infinity }], assignments: [{ taskId: 'A', resourceId: 'press' }] }), RangeError)
  // A milestone is a zero-duration range and binds as one.
  assert.deepEqual(taskViewBindings({ tasks: [{ id: 'M', start: 3, end: 3 }], assignments: [{ taskId: 'M', resourceId: 'crew' }] }).at(-1).target,
    { view: 'load', resourceId: 'crew', start: 3, end: 3 })
})
