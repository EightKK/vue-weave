import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildViewBindingIndex, calculateResourceLoad, resolveEntityRefs, scheduleTasks, taskViewBindings,
} from '@eightkk/vue-weave/core'
import { taskViewBindings as fromVueEntry, useLinkedSelection } from '@eightkk/vue-weave'

const tasks = [{ id: 'A', work: [{ start: 0, end: 2 }] }, { id: 'B', work: [{ start: 2, end: 5 }] }, { id: 'C' }]
const assignments = [{ taskId: 'A', resourceId: 'press' }, { taskId: 'B', resourceId: 'press' }, { taskId: 'B', resourceId: 'crew' }]
const dependencies = [{ id: 'A-B', from: 'A', to: 'B' }]
const describe = bindings => bindings.map(({ entity, target }) => [entity.kind + ':' + entity.id, target.view === 'load'
  ? `load ${target.resourceId} ${target.start}-${target.end}` : `${target.view} ${target.kind} ${target.id}`])
/** The task IDs the bindings select for each load segment, next to the ones calculateResourceLoad counts in it. */
function selectedPerSegment(load, bindings) {
  const index = buildViewBindingIndex(bindings)
  return load.map(segment => ({
    segment: `${segment.resourceId} ${segment.start}-${segment.end}`,
    counted: [...segment.taskIds].sort(),
    selected: resolveEntityRefs(index, [{ view: 'load', resourceId: segment.resourceId, start: segment.start, end: segment.end }])
      .entities.map(entity => entity.id).sort(),
  }))
}
function assertAgreesWithLoad(load, bindings) {
  for (const row of selectedPerSegment(load, bindings)) assert.deepEqual(row.selected, row.counted, row.segment)
}

test('taskViewBindings binds each task to its node, bar, row and load, and each dependency to its edge and arrow', () => {
  const input = structuredClone({ tasks, assignments, dependencies })
  const bindings = taskViewBindings(input)
  assert.deepEqual(describe(bindings), [
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

test('taskViewBindings binds a partial assignment only where calculateResourceLoad counts it', () => {
  // A uses R only for its first 2 work units; B uses R during [4, 6). The load in [4, 6) is B's alone.
  const work = [{ id: 'A', work: [{ start: 0, end: 10 }] }, { id: 'B', work: [{ start: 4, end: 6 }] }]
  const partial = [{ taskId: 'A', resourceId: 'R', workDuration: 2 }, { taskId: 'B', resourceId: 'R' }]
  const load = calculateResourceLoad({ start: 0, end: 10 }, work, [{ id: 'R', capacity: 1 }], partial)
  const bindings = taskViewBindings({ tasks: work, assignments: partial })
  assert.deepEqual(describe(bindings).filter(([, target]) => target.startsWith('load')), [['task:A', 'load R 0-2'], ['task:B', 'load R 4-6']])
  const index = buildViewBindingIndex(bindings)
  assert.deepEqual(resolveEntityRefs(index, [{ view: 'load', resourceId: 'R', start: 4, end: 6 }]).entities, [{ kind: 'task', id: 'B' }])
  assertAgreesWithLoad(load, bindings)
  // An offset part, and a part that starts after the work ends, which binds nothing.
  assert.deepEqual(describe(taskViewBindings({ tasks: work, assignments: [{ taskId: 'A', resourceId: 'R', workOffset: 3, workDuration: 4 }] })).at(3),
    ['task:A', 'load R 3-7'])
  assert.equal(taskViewBindings({ tasks: work, assignments: [{ taskId: 'A', resourceId: 'R', workOffset: 10 }] }).length, 6)
})

test('taskViewBindings leaves pauses and calendar breaks unbound, like calculateResourceLoad', () => {
  // The workshop calendar breaks for lunch at [4, 5); P pauses during [8, 10); S runs on the calendar; Q works through.
  const range = { start: 0, end: 20 }
  const schedule = scheduleTasks({
    range, calendars: [{ id: 'shop', periods: [{ start: 0, end: 4 }, { start: 5, end: 20 }] }],
    tasks: [
      { id: 'S', duration: 6, calendarId: 'shop' },
      { id: 'P', duration: 4, startNoEarlierThan: 6, pauses: [{ start: 8, end: 10 }] },
      { id: 'Q', duration: 12 },
      { id: 'off', duration: 3, inactive: true },
    ],
  })
  assert.ok(schedule.ok)
  const plan = [
    { taskId: 'S', resourceId: 'crew' }, { taskId: 'P', resourceId: 'crew' }, { taskId: 'Q', resourceId: 'crew', workOffset: 2, workDuration: 3 },
    { taskId: 'off', resourceId: 'crew' },
  ]
  const load = calculateResourceLoad(range, schedule.tasks, [{ id: 'crew', capacity: 2 }], plan, { inactiveTaskIds: schedule.inactiveTaskIds })
  const bindings = taskViewBindings({ tasks: schedule.tasks, assignments: plan, inactiveTaskIds: schedule.inactiveTaskIds })
  assert.deepEqual(describe(bindings).filter(([, target]) => target.startsWith('load')), [
    ['task:S', 'load crew 0-4'], ['task:S', 'load crew 5-7'], ['task:P', 'load crew 6-8'], ['task:P', 'load crew 10-12'], ['task:Q', 'load crew 2-5'],
  ])
  assertAgreesWithLoad(load, bindings)
  // The lunch break and the pause select nothing, although they lie inside the bars of S and P.
  const index = buildViewBindingIndex(bindings)
  assert.deepEqual(resolveEntityRefs(index, [{ view: 'load', resourceId: 'crew', start: 8, end: 10 }]).entities, [])
})

test('taskViewBindings takes entity kinds and works with a schedule, the binding index and useLinkedSelection', () => {
  const schedule = scheduleTasks({ range: { start: 0, end: 20 }, tasks: [{ id: 'A', duration: 2 }, { id: 'B', duration: 3 }], dependencies })
  assert.ok(schedule.ok)
  const bindings = taskViewBindings({ tasks: schedule.tasks, assignments: [{ taskId: 'B', resourceId: 'press' }], dependencies, taskKind: 'operation', dependencyKind: 'link' })
  const index = buildViewBindingIndex(bindings)
  // A load segment overlapping B's work finds B; edges and arrows find the link.
  assert.deepEqual(resolveEntityRefs(index, [{ view: 'load', resourceId: 'press', start: 3, end: 4 }]).entities, [{ kind: 'operation', id: 'B' }])
  assert.deepEqual(resolveEntityRefs(index, [{ view: 'graph', kind: 'edge', id: 'A-B' }]).entities, [{ kind: 'link', id: 'A-B' }])
  const linked = useLinkedSelection({ bindings })
  linked.select('timeline', [{ view: 'timeline', kind: 'bar', id: 'B' }])
  assert.deepEqual([...linked.graph.value.highlightedNodeIds], ['B'])
  assert.deepEqual([...linked.timeline.value.highlightedRowIds], ['B'])
  assert.deepEqual(linked.load.value.highlighted, [{ view: 'load', resourceId: 'press', start: 2, end: 5 }])
})

test('taskViewBindings without assignments or dependencies needs no work', () => {
  assert.deepEqual(taskViewBindings({ tasks: [{ id: 'x' }] }).map(binding => binding.target.view), ['graph', 'timeline', 'timeline'])
  assert.deepEqual(taskViewBindings({ tasks: [] }), [])
})

test('taskViewBindings validates IDs, references, kinds, work segments and assignment parts', () => {
  assert.throws(() => taskViewBindings({ tasks: [{ id: '' }] }), { name: 'Error', message: 'Invalid task ID: ""' })
  assert.throws(() => taskViewBindings({ tasks: [{ id: 'A' }, { id: 'A' }] }), { name: 'Error', message: 'Duplicate task ID: A' })
  assert.throws(() => taskViewBindings({ tasks, dependencies: [{ id: 'd' }, { id: 'd' }] }), { name: 'Error', message: 'Duplicate dependency ID: d' })
  assert.throws(() => taskViewBindings({ tasks, dependencies: [{ id: 7 }] }), { name: 'Error', message: 'Invalid dependency ID: 7' })
  assert.throws(() => taskViewBindings({ tasks, assignments: [{ taskId: 'X', resourceId: 'press' }] }), { name: 'Error', message: 'Unknown task in assignment: X' })
  assert.throws(() => taskViewBindings({ tasks, assignments: [{ taskId: 'A', resourceId: '' }] }), { name: 'Error', message: 'Invalid resource ID: "" (assignment of task A)' })
  assert.throws(() => taskViewBindings({ tasks, taskKind: '' }), { name: 'Error', message: /Invalid entity kind/ })
  assert.throws(() => taskViewBindings({ tasks, dependencyKind: '' }), { name: 'Error', message: /Invalid entity kind/ })
  assert.throws(() => taskViewBindings({ tasks, inactiveTaskIds: ['A'] }), { name: 'Error', message: 'An inactive task cannot have workload: A' })
  // An assigned task needs its work segments: safe integer endpoints and positive length.
  assert.throws(() => taskViewBindings({ tasks, assignments: [{ taskId: 'C', resourceId: 'press' }] }), { name: 'Error', message: 'Assigned task C needs its work segments (work)' })
  for (const work of [[{ start: 4, end: 2 }], [{ start: 0, end: Infinity }], [{ start: 0, end: 1.5 }], [{ start: 3, end: 3 }]]) {
    assert.throws(() => taskViewBindings({ tasks: [{ id: 'A', work }], assignments: [{ taskId: 'A', resourceId: 'press' }] }),
      { name: 'RangeError', message: 'Work segments need safe integer endpoints and positive length: task A' })
  }
  assert.throws(() => taskViewBindings({ tasks, assignments: [{ taskId: 'A', resourceId: 'press', workOffset: -1 }] }), RangeError)
  assert.throws(() => taskViewBindings({ tasks, assignments: [{ taskId: 'A', resourceId: 'press', workDuration: 0 }] }), RangeError)
  // A milestone has no work, so it adds no load and binds no load target; an inactive task's assignment is skipped.
  assert.equal(taskViewBindings({ tasks: [{ id: 'M', work: [] }], assignments: [{ taskId: 'M', resourceId: 'crew' }] }).length, 3)
  assert.equal(taskViewBindings({ tasks: [], assignments: [{ taskId: 'gone', resourceId: 'crew' }], inactiveTaskIds: new Set(['gone']) }).length, 0)
})

test('taskViewBindings binds more load periods than a call takes arguments', () => {
  // One task with 1,400 separate work periods on 100 resources: 140,000 load bindings.
  const work = Array.from({ length: 1400 }, (_, i) => ({ start: i * 2, end: i * 2 + 1 }))
  const assignments = Array.from({ length: 100 }, (_, r) => ({ taskId: 'A', resourceId: 'R' + r }))
  const bindings = taskViewBindings({ tasks: [{ id: 'A', work }, { id: 'B' }], assignments, dependencies: [{ id: 'd' }] })
  assert.equal(bindings.length, 3 + 140_000 + 3 + 2)
  assert.deepEqual(bindings[3].target, { view: 'load', resourceId: 'R0', start: 0, end: 1 })
  assert.deepEqual(bindings[3 + 139_999].target, { view: 'load', resourceId: 'R99', start: 2798, end: 2799 })
  assert.deepEqual(bindings.at(-3).target, { view: 'timeline', kind: 'row', id: 'B' })
})
