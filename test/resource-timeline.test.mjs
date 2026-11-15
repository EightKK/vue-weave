import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  calculateResourceLoad, createResourceTimelineProjector, levelResources, projectResourceTimeline, proposeResourceAssignment,
  resolveResourceTimelineEdit, resolveResourceTimelineEdits, resourceTimelineBarId, resourceTimelineCascade, scheduleTasks,
  validateTimelineData,
} from 'vue-weave/core'

const range = { start: 0, end: 10 }
const id = (taskId, resourceId) => JSON.stringify([taskId, resourceId])
const loads = segments => segments.map(({ resourceId, start, end, load, capacity, taskIds }) =>
  [resourceId, start, end, load, capacity, [...taskIds]])

// O04: R1 and R2 with capacity 1; A (priority 2) on R1 and R2, B (priority 1) on R1, both two units long.
function o04() {
  return {
    range,
    resources: [{ id: 'R1', capacity: 1 }, { id: 'R2', capacity: 1 }],
    tasks: [{ id: 'A', duration: 2, priority: 2 }, { id: 'B', duration: 2, priority: 1 }],
    assignments: [{ taskId: 'A', resourceId: 'R1' }, { taskId: 'A', resourceId: 'R2' }, { taskId: 'B', resourceId: 'R1' }],
  }
}
const resources = [{ id: 'R1', label: 'Lathe' }, { id: 'R2', label: 'Mill' }]
const taskBars = (schedule, labels = { A: 'Cut', B: 'Drill' }) =>
  schedule.tasks.map(task => ({ id: task.id, label: labels[task.id], start: task.start, end: task.end }))

test('O04: a task on two resources has two bars, but its load is counted once per resource', () => {
  const input = o04()
  const before = scheduleTasks(input)
  assert.equal(before.ok, true)
  const projection = projectResourceTimeline({ resources, tasks: taskBars(before), assignments: input.assignments })
  assert.equal(projection.bars.length, 3)
  assert.deepEqual(projection.bars.map(bar => [bar.id, bar.rowId, bar.label, bar.start, bar.end, bar.lane]), [
    [id('A', 'R1'), 'R1', 'Cut · Lathe', 0, 2, 0],
    [id('A', 'R2'), 'R2', 'Cut · Mill', 0, 2, 0],
    [id('B', 'R1'), 'R1', 'Drill · Lathe', 0, 2, 1],
  ])
  assert.equal(projection.laneCount, 2)
  assert.deepEqual([...projection.origins], [
    [id('A', 'R1'), { taskId: 'A', resourceId: 'R1' }],
    [id('A', 'R2'), { taskId: 'A', resourceId: 'R2' }],
    [id('B', 'R1'), { taskId: 'B', resourceId: 'R1' }],
  ])
  assert.deepEqual(projection.rows, [{ id: 'R1', label: 'Lathe' }, { id: 'R2', label: 'Mill' }])
  validateTimelineData(projection.rows, projection.bars, projection.dependencies, projection.laneCount)

  // Load comes from the original two tasks and three assignments, not from the projected bars.
  assert.deepEqual(loads(calculateResourceLoad(range, before.tasks, input.resources, input.assignments)), [
    ['R1', 0, 2, 2, 1, ['A', 'B']], ['R1', 2, 10, 0, 1, []],
    ['R2', 0, 2, 1, 1, ['A']], ['R2', 2, 10, 0, 1, []],
  ])

  const leveled = levelResources(input)
  assert.equal(leveled.ok, true)
  assert.deepEqual(leveled.tasks.map(task => [task.id, task.start, task.end]), [['A', 0, 2], ['B', 2, 4]])
  assert.deepEqual(loads(calculateResourceLoad(range, leveled.tasks, input.resources, input.assignments)), [
    ['R1', 0, 2, 1, 1, ['A']], ['R1', 2, 4, 1, 1, ['B']], ['R1', 4, 10, 0, 1, []],
    ['R2', 0, 2, 1, 1, ['A']], ['R2', 2, 10, 0, 1, []],
  ])
  const after = projectResourceTimeline({ resources, tasks: taskBars(leveled), assignments: input.assignments })
  assert.equal(after.bars.length, 3)
  assert.equal(after.laneCount, 1)
})

test('O05: moving B to another resource row replaces its assignment and keeps two tasks', () => {
  const input = {
    range, resources: [{ id: 'R1', capacity: 1 }, { id: 'R2', capacity: 1 }],
    tasks: [{ id: 'A', duration: 2 }, { id: 'B', duration: 2 }],
    assignments: [{ taskId: 'A', resourceId: 'R1' }, { taskId: 'B', resourceId: 'R1' }],
  }
  const snapshot = JSON.stringify(input)
  const schedule = scheduleTasks(input)
  const projection = projectResourceTimeline({ resources, tasks: taskBars(schedule), assignments: input.assignments })
  const edit = {
    id: id('B', 'R1'), before: { start: 0, end: 2 }, after: { start: 0, end: 2 }, mode: 'move', source: 'pointer',
    row: { before: 'R1', after: 'R2' },
  }
  const resolution = resolveResourceTimelineEdit(projection, edit)
  assert.deepEqual(resolution, { ok: true, assignmentReplacement: { taskId: 'B', fromResourceId: 'R1', toResourceId: 'R2' } })
  const proposal = proposeResourceAssignment({ assignments: input.assignments, resourceIds: ['R1', 'R2'], taskIds: ['A', 'B'] }, {
    kind: 'replace', ...resolution.assignmentReplacement,
  })
  assert.equal(proposal.ok, true)
  assert.deepEqual(proposal.assignments, [{ taskId: 'A', resourceId: 'R1' }, { taskId: 'B', resourceId: 'R2' }])
  assert.equal(input.tasks.length, 2)
  assert.deepEqual(loads(calculateResourceLoad(range, schedule.tasks, input.resources, proposal.assignments)), [
    ['R1', 0, 2, 1, 1, ['A']], ['R1', 2, 10, 0, 1, []],
    ['R2', 0, 2, 1, 1, ['B']], ['R2', 2, 10, 0, 1, []],
  ])
  const moved = projectResourceTimeline({ resources, tasks: taskBars(schedule), assignments: proposal.assignments })
  assert.deepEqual(moved.bars.map(bar => [bar.id, bar.lane]), [[id('A', 'R1'), 0], [id('B', 'R2'), 0]])
  assert.equal(JSON.stringify(input), snapshot)
})

test('O06: touching bars on one resource share a lane and do not overload', () => {
  const tasks = [{ id: 'A', label: 'A', start: 0, end: 2 }, { id: 'B', label: 'B', start: 2, end: 4 }]
  const assignments = [{ taskId: 'A', resourceId: 'R1' }, { taskId: 'B', resourceId: 'R1' }]
  const projection = projectResourceTimeline({ resources: [{ id: 'R1', label: 'Lathe' }], tasks, assignments })
  assert.equal(projection.laneCount, 1)
  assert.deepEqual(projection.bars.map(bar => bar.lane), [0, 0])
  const work = tasks.map(({ id, start, end }) => ({ id, work: [{ start, end }] }))
  assert.deepEqual(loads(calculateResourceLoad(range, work, [{ id: 'R1', capacity: 1 }], assignments)), [
    ['R1', 0, 2, 1, 1, ['A']], ['R1', 2, 4, 1, 1, ['B']], ['R1', 4, 10, 0, 1, []],
  ])
})

test('bar IDs are JSON tuples that do not depend on input order or separators', () => {
  assert.equal(resourceTimelineBarId('a|b', 'c'), '["a|b","c"]')
  assert.notEqual(resourceTimelineBarId('a|b', 'c'), resourceTimelineBarId('a', 'b|c'))
  assert.throws(() => resourceTimelineBarId('', 'R1'), /task ID and a resource ID/)
  const tasks = [{ id: 'A', label: 'A', start: 0, end: 2 }, { id: 'B', label: 'B', start: 1, end: 3 }]
  const assignments = [{ taskId: 'A', resourceId: 'R1' }, { taskId: 'B', resourceId: 'R2' }, { taskId: 'A', resourceId: 'R2' }]
  const one = projectResourceTimeline({ resources, tasks, assignments })
  const two = projectResourceTimeline({ resources: resources.toReversed(), tasks: tasks.toReversed(), assignments: assignments.toReversed() })
  const ids = projection => projection.bars.map(bar => bar.id).sort()
  assert.deepEqual(ids(one), [id('A', 'R1'), id('A', 'R2'), id('B', 'R2')].sort())
  assert.deepEqual(ids(two), ids(one))
  // Bars follow task order, then row order.
  assert.deepEqual(two.bars.map(bar => bar.id), [id('B', 'R2'), id('A', 'R2'), id('A', 'R1')])
})

test('links are drawn once between representative projections, with origins', () => {
  const tasks = [{ id: 'A', label: 'A', start: 0, end: 2 }, { id: 'B', label: 'B', start: 2, end: 4 }, { id: 'C', label: 'C', start: 4, end: 5 }]
  const assignments = [{ taskId: 'A', resourceId: 'R1' }, { taskId: 'A', resourceId: 'R2' }, { taskId: 'B', resourceId: 'R2' }]
  const dependencies = [
    { id: 'ab', from: 'A', to: 'B', type: 'FS', lag: 0 }, { id: 'bc', from: 'B', to: 'C' }, { id: 'pa', from: 'P', to: 'A' },
  ]
  const input = { resources, tasks, assignments, dependencies, unplannedTaskIds: ['P'] }
  const snapshot = JSON.stringify(input)
  const projection = projectResourceTimeline(input)
  assert.deepEqual(projection.dependencies, [{ id: 'ab', from: id('A', 'R1'), to: id('B', 'R2'), type: 'FS', lag: 0 }])
  assert.deepEqual([...projection.dependencyOrigins], [['ab', 'ab']])
  assert.deepEqual(projection.omittedDependencyIds, ['ab'])
  assert.deepEqual(projection.hiddenDependencyIds, ['bc', 'pa'])
  assert.deepEqual(projection.unplannedTaskIds, ['P'])
  assert.deepEqual([...projection.taskBarIds], [['A', [id('A', 'R1'), id('A', 'R2')]], ['B', [id('B', 'R2')]], ['C', []]])
  validateTimelineData(projection.rows, projection.bars, projection.dependencies, projection.laneCount)

  const selected = projectResourceTimeline(input, { preferredBarIds: [id('A', 'R2')] })
  assert.deepEqual(selected.dependencies.map(link => [link.from, link.to]), [[id('A', 'R2'), id('B', 'R2')]])
  assert.equal(JSON.stringify(input), snapshot)
})

test('projection rejects malformed input', () => {
  const tasks = [{ id: 'A', label: 'A', start: 0, end: 2 }]
  const base = { resources, tasks, assignments: [] }
  assert.throws(() => projectResourceTimeline({ ...base, tasks: [...tasks, ...tasks] }), /duplicate task ID: A/)
  assert.throws(() => projectResourceTimeline({ ...base, resources: [resources[0], resources[0]] }), /duplicate resource ID: R1/)
  assert.throws(() => projectResourceTimeline({ ...base, assignments: [{ taskId: 'X', resourceId: 'R1' }] }), /Unknown task or resource/)
  assert.throws(() => projectResourceTimeline({ ...base, assignments: [{ taskId: 'A', resourceId: 'R9' }] }), /Unknown task or resource/)
  assert.throws(() => projectResourceTimeline({
    ...base, assignments: [{ taskId: 'A', resourceId: 'R1' }, { taskId: 'A', resourceId: 'R1', units: 2 }],
  }), /Duplicate resource assignment for task: A/)
  assert.throws(() => projectResourceTimeline({ ...base, dependencies: [{ id: 'x', from: 'A', to: 'Z' }] }), /Unknown dependency endpoint: x/)
  assert.throws(() => projectResourceTimeline({ ...base, dependencies: [{ id: 'x', from: 'A', to: 'A' }] }), /itself: x/)
  assert.throws(() => projectResourceTimeline({ ...base, unplannedTaskIds: ['A'] }), /both placed and unplanned: A/)
})

test('a projector returns the same projection while the input fields are the same objects', () => {
  const project = createResourceTimelineProjector()
  const tasks = [{ id: 'A', label: 'A', start: 0, end: 2 }]
  const assignments = [{ taskId: 'A', resourceId: 'R1' }]
  const first = project({ resources, tasks, assignments })
  assert.equal(project({ resources, tasks, assignments }), first)
  const next = project({ resources, tasks: [...tasks], assignments })
  assert.notEqual(next, first)
  assert.deepEqual(next.bars, first.bars)
})

function twoResourceTask() {
  const tasks = [{ id: 'A', label: 'A', start: 0, end: 2 }, { id: 'B', label: 'B', start: 2, end: 4 }]
  const assignments = [{ taskId: 'A', resourceId: 'R1' }, { taskId: 'A', resourceId: 'R2' }, { taskId: 'B', resourceId: 'R1' }]
  return projectResourceTimeline({ resources: [...resources, { id: 'R3', label: 'Saw' }], tasks, assignments })
}
const move = (barId, before, after, row) => ({ id: barId, before, after, mode: 'move', source: 'pointer', ...(row ? { row } : {}) })

test('edits of several projections of one task resolve to one schedule change', () => {
  const projection = twoResourceTask()
  const result = resolveResourceTimelineEdits(projection, [
    move(id('A', 'R1'), { start: 0, end: 2 }, { start: 1, end: 3 }),
    move(id('A', 'R2'), { start: 0, end: 2 }, { start: 1, end: 3 }),
    move(id('B', 'R1'), { start: 2, end: 4 }, { start: 3, end: 5 }),
  ])
  assert.deepEqual(result, {
    ok: true,
    scheduleChanges: [
      { taskId: 'A', before: { start: 0, end: 2 }, after: { start: 1, end: 3 }, mode: 'move', source: 'pointer' },
      { taskId: 'B', before: { start: 2, end: 4 }, after: { start: 3, end: 5 }, mode: 'move', source: 'pointer' },
    ],
    assignmentReplacements: [],
  })
  const conflict = resolveResourceTimelineEdits(projection, [
    move(id('A', 'R1'), { start: 0, end: 2 }, { start: 1, end: 3 }),
    move(id('A', 'R2'), { start: 0, end: 2 }, { start: 2, end: 4 }),
  ])
  assert.equal(conflict.ok, false)
  assert.equal(conflict.code, 'conflicting-schedule')
  assert.deepEqual(conflict.barIds, [id('A', 'R1'), id('A', 'R2')])
})

test('a diagonal move resolves to a schedule change and an assignment replacement together', () => {
  const projection = twoResourceTask()
  assert.deepEqual(resolveResourceTimelineEdit(projection, move(id('B', 'R1'), { start: 2, end: 4 }, { start: 3, end: 5 }, { before: 'R1', after: 'R3' })), {
    ok: true,
    scheduleChange: { taskId: 'B', before: { start: 2, end: 4 }, after: { start: 3, end: 5 }, mode: 'move', source: 'pointer' },
    assignmentReplacement: { taskId: 'B', fromResourceId: 'R1', toResourceId: 'R3' },
  })
})

test('moving a projection onto a resource the task already has is rejected', () => {
  const projection = twoResourceTask()
  const result = resolveResourceTimelineEdit(projection, move(id('A', 'R1'), { start: 0, end: 2 }, { start: 0, end: 2 }, { before: 'R1', after: 'R2' }))
  assert.equal(result.ok, false)
  assert.equal(result.code, 'already-assigned')
  assert.deepEqual(result.barIds, [id('A', 'R1')])
  const both = resolveResourceTimelineEdits(projection, [
    move(id('A', 'R1'), { start: 0, end: 2 }, { start: 0, end: 2 }, { before: 'R1', after: 'R3' }),
    move(id('A', 'R2'), { start: 0, end: 2 }, { start: 0, end: 2 }, { before: 'R2', after: 'R3' }),
  ])
  assert.equal(both.code, 'conflicting-assignment')
  const assignments = [{ taskId: 'A', resourceId: 'R1' }, { taskId: 'A', resourceId: 'R2' }]
  assert.deepEqual(proposeResourceAssignment({ assignments }, { kind: 'replace', taskId: 'A', fromResourceId: 'R1', toResourceId: 'R2' }), {
    ok: false, code: 'already-assigned', reason: 'The task is already assigned to the resource: A, R2',
  })
})

test('stale edits are rejected and unknown rows throw', () => {
  const projection = twoResourceTask()
  assert.equal(resolveResourceTimelineEdit(projection, move(id('A', 'R3'), { start: 0, end: 2 }, { start: 1, end: 3 })).code, 'stale')
  assert.equal(resolveResourceTimelineEdit(projection, move(id('A', 'R1'), { start: 1, end: 3 }, { start: 2, end: 4 })).code, 'stale')
  assert.equal(resolveResourceTimelineEdit(projection, move(id('B', 'R1'), { start: 2, end: 4 }, { start: 2, end: 4 }, { before: 'R2', after: 'R3' })).code, 'stale')
  assert.throws(() => resolveResourceTimelineEdit(projection, move(id('B', 'R1'), { start: 2, end: 4 }, { start: 2, end: 4 }, { before: 'R1', after: 'R9' })), /Unknown resource row: R9/)
})

test('a cascade computed on task IDs updates every projection of the moved and the following tasks', () => {
  const projection = twoResourceTask()
  const input = { range, tasks: [{ id: 'A', duration: 2 }, { id: 'B', duration: 2 }], dependencies: [{ id: 'ab', from: 'A', to: 'B' }] }
  const snapshot = JSON.stringify(input)
  const cascade = resourceTimelineCascade(projection, input)
  assert.deepEqual(cascade(move(id('A', 'R1'), { start: 0, end: 2 }, { start: 1, end: 3 })), [
    { id: id('A', 'R2'), before: { start: 0, end: 2 }, after: { start: 1, end: 3 }, mode: 'move', source: 'pointer' },
    { id: id('B', 'R1'), before: { start: 2, end: 4 }, after: { start: 3, end: 5 }, mode: 'move', source: 'pointer' },
  ])
  assert.deepEqual(cascade({ id: id('A', 'R2'), before: { start: 0, end: 2 }, after: { start: 0, end: 3 }, mode: 'end', source: 'keyboard' }), [
    { id: id('A', 'R1'), before: { start: 0, end: 2 }, after: { start: 0, end: 3 }, mode: 'end', source: 'keyboard' },
    { id: id('B', 'R1'), before: { start: 2, end: 4 }, after: { start: 3, end: 5 }, mode: 'move', source: 'keyboard' },
  ])
  // The cascade edits resolve to one change per task.
  const change = move(id('A', 'R1'), { start: 0, end: 2 }, { start: 1, end: 3 })
  const resolved = resolveResourceTimelineEdits(projection, [change, ...cascade(change)])
  assert.deepEqual(resolved.scheduleChanges.map(item => [item.taskId, item.after.start, item.after.end]), [['A', 1, 3], ['B', 3, 5]])
  // A plan that cannot be met previews nothing.
  assert.deepEqual(cascade(move(id('A', 'R1'), { start: 0, end: 2 }, { start: 7, end: 9 })), [])
  assert.deepEqual(cascade(move('unknown', { start: 0, end: 2 }, { start: 1, end: 3 })), [])
  assert.equal(JSON.stringify(input), snapshot)
})

test('assignment proposals add, remove and replace without changing the state', () => {
  const assignments = [{ taskId: 'A', resourceId: 'R1', units: 2 }, { taskId: 'B', resourceId: 'R1' }]
  const state = { assignments, resourceIds: ['R1', 'R2'], taskIds: ['A', 'B'] }
  const snapshot = JSON.stringify(state)
  assert.deepEqual(proposeResourceAssignment(state, { kind: 'add', taskId: 'A', resourceId: 'R2', units: 1 }), {
    ok: true, assignments: [...assignments, { taskId: 'A', resourceId: 'R2', units: 1 }],
    added: [{ taskId: 'A', resourceId: 'R2', units: 1 }], removed: [],
  })
  assert.equal(proposeResourceAssignment(state, { kind: 'add', taskId: 'A', resourceId: 'R1' }).code, 'already-assigned')
  assert.deepEqual(proposeResourceAssignment(state, { kind: 'remove', taskId: 'A', resourceId: 'R1' }), {
    ok: true, assignments: [{ taskId: 'B', resourceId: 'R1' }], added: [], removed: [{ taskId: 'A', resourceId: 'R1', units: 2 }],
  })
  assert.equal(proposeResourceAssignment(state, { kind: 'remove', taskId: 'A', resourceId: 'R2' }).code, 'not-assigned')
  assert.deepEqual(proposeResourceAssignment(state, { kind: 'replace', taskId: 'A', fromResourceId: 'R1', toResourceId: 'R2' }).assignments, [
    { taskId: 'A', resourceId: 'R2', units: 2 }, { taskId: 'B', resourceId: 'R1' },
  ])
  assert.equal(proposeResourceAssignment(state, { kind: 'replace', taskId: 'A', fromResourceId: 'R2', toResourceId: 'R1' }).code, 'not-assigned')
  assert.throws(() => proposeResourceAssignment(state, { kind: 'add', taskId: 'A', resourceId: 'R9' }), /Unknown resource in assignment: R9/)
  assert.throws(() => proposeResourceAssignment(state, { kind: 'add', taskId: 'Z', resourceId: 'R1' }), /Unknown task in assignment: Z/)
  assert.throws(() => proposeResourceAssignment(state, { kind: 'add', taskId: 'B', resourceId: 'R2', units: 0 }), RangeError)
  assert.throws(() => proposeResourceAssignment({ assignments: [...assignments, assignments[1]] }, { kind: 'remove', taskId: 'B', resourceId: 'R1' }), /Duplicate/)
  assert.equal(JSON.stringify(state), snapshot)
})
