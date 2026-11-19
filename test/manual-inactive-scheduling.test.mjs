import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildPlacementInput, calculateResourceLoad, collectScheduleReasons, levelResources, parseWeaveSnapshot, propagateEdit,
  rescheduleFromStatusDate, restoreWeaveSnapshot, scheduleTasks, scheduleToGraph, serializeWeaveSnapshot,
} from 'vue-weave/core'
import { dates, link } from './helpers/builders.mjs'

const range = { start: 0, end: 40 }
const shifts = [{ start: 0, end: 4 }, { start: 5, end: 9 }, { start: 24, end: 28 }, { start: 29, end: 33 }]

test('a manual task keeps its dates against predecessors, bounds, mode, duration and calendar; successors follow it', () => {
  const input = {
    range, calendars: [{ id: 'shift', periods: shifts }],
    tasks: [
      { id: 'a', duration: 5 },
      { id: 'm', duration: 99, calendarId: 'shift', startNoEarlierThan: 20, fixedStart: 30, mode: 'alap', manual: { start: 3, end: 8 } },
      { id: 'b', duration: 4 },
    ],
    dependencies: [link('a', 'm'), link('m', 'b')],
  }
  const original = JSON.stringify(input)
  const result = scheduleTasks(input)
  assert.equal(result.ok, true)
  assert.equal(result.finish, 12)
  assert.deepEqual(result.tasks[1], {
    id: 'm', start: 3, end: 8, work: [{ start: 3, end: 4 }, { start: 5, end: 8 }],
    latestStart: 3, latestEnd: 8, totalFloat: 0, workFloat: 0, critical: false, manual: true,
  })
  // The link into m binds nothing, so a is not held back by it and floats to the project finish.
  assert.deepEqual(result.tasks.map(t => [t.id, t.start, t.end, t.latestStart, t.latestEnd, t.totalFloat, t.critical]), [
    ['a', 0, 5, 7, 12, 7, false], ['m', 3, 8, 3, 8, 0, false], ['b', 8, 12, 8, 12, 0, true],
  ])
  assert.equal('manual' in result.tasks[0], false)
  assert.deepEqual(result.criticalDependencyIds, [])
  assert.deepEqual(result.manualConflicts, [{ taskId: 'm', dependencyId: 'a-m' }])
  assert.equal('inactiveTaskIds' in result, false)
  assert.equal(JSON.stringify(input), original)
})

test('manual dates extend the project finish, may lie in time off and can be a milestone', () => {
  const result = scheduleTasks({
    range, calendars: [{ id: 'shift', periods: shifts }], defaultCalendarId: 'shift',
    tasks: [{ id: 'x', duration: 2 }, { id: 'm', duration: 0, manual: { start: 10, end: 30 } }, { id: 'off', duration: 4, manual: { start: 18, end: 20 } }, { id: 'flag', duration: 3, manual: { start: 6, end: 6 } }],
  })
  assert.equal(result.ok, true)
  assert.equal(result.finish, 30)
  // x floats in working time up to the manual finish: its latest work is [27, 28) and [29, 30).
  assert.deepEqual(result.tasks.map(t => [t.id, t.start, t.end, t.latestStart, t.latestEnd, t.totalFloat]), [
    ['x', 0, 2, 27, 30, 11], ['m', 10, 30, 10, 30, 0], ['off', 18, 20, 18, 20, 0], ['flag', 6, 6, 6, 6, 0],
  ])
  assert.deepEqual(result.tasks[1].work, [{ start: 24, end: 28 }, { start: 29, end: 30 }])
  assert.deepEqual(result.tasks[2].work, [])
  assert.deepEqual(result.tasks[3].work, [])
})

test('links into a manual task never make its predecessors infeasible; each violated link is a manual conflict', () => {
  const pinned = scheduleTasks({
    range,
    tasks: [{ id: 'p', duration: 5, fixedStart: 10 }, { id: 'q', duration: 3 }, { id: 'm', duration: 2, manual: { start: 0, end: 2 } }],
    dependencies: [link('p', 'm'), link('q', 'm')],
  })
  assert.equal(pinned.ok, true)
  assert.deepEqual(pinned.tasks.map(t => [t.id, t.start, t.end, t.latestStart, t.totalFloat]), [
    ['p', 10, 15, 10, 0], ['q', 0, 3, 12, 12], ['m', 0, 2, 0, 0],
  ])
  assert.deepEqual(pinned.manualConflicts, [{ taskId: 'm', dependencyId: 'p-m' }, { taskId: 'm', dependencyId: 'q-m' }])

  // Every link type is measured in elapsed time against the manual dates [10, 12); a [0, 5) is the predecessor.
  const types = [['FS', 5, false], ['FS', 6, true], ['SS', 10, false], ['SS', 11, true], ['FF', 7, false], ['FF', 8, true], ['SF', 12, false], ['SF', 13, true]]
  const result = scheduleTasks({
    range,
    tasks: [{ id: 'a', duration: 5 }, { id: 'm', duration: 2, manual: { start: 10, end: 12 } }],
    dependencies: types.map(([type, lag], i) => ({ id: 'l' + i, from: 'a', to: 'm', type, lag })),
  })
  assert.deepEqual(result.manualConflicts.map(item => item.dependencyId), types.flatMap(([, , conflict], i) => conflict ? ['l' + i] : []))
  assert.equal('manualConflicts' in scheduleTasks({ range, tasks: [{ id: 'a', duration: 5 }, { id: 'm', duration: 2, manual: { start: 10, end: 12 } }], dependencies: [link('a', 'm')] }), false)
})

test('manual dates and the inactive flag are validated like other scheduling input', () => {
  const run = (task, extra = {}) => () => scheduleTasks({ range, tasks: [{ id: 't', duration: 2, ...task }], ...extra })
  assert.throws(run({ manual: 5 }), { name: 'Error', message: 'Manual dates must be an object with a start and an end: t' })
  assert.throws(run({ manual: null }), { name: 'Error', message: 'Manual dates must be an object with a start and an end: t' })
  assert.throws(run({ manual: { start: 1 } }), { name: 'RangeError', message: 'Manual dates must be numbers: t' })
  assert.throws(run({ manual: { start: Number.NaN, end: 2 } }), { name: 'RangeError', message: 'Scheduling dates must align with the horizon and quantum' })
  assert.throws(run({ manual: { start: 1, end: 3 } }, { quantum: 2 }), { name: 'RangeError', message: 'Scheduling dates must align with the horizon and quantum' })
  assert.throws(run({ manual: { start: 4, end: 3 } }), { name: 'RangeError', message: 'Manual dates cannot end before they start: t' })
  assert.throws(run({ manual: { start: -1, end: 3 } }), { name: 'RangeError', message: 'Manual dates must lie inside the schedule range: t' })
  assert.throws(run({ manual: { start: 38, end: 41 } }), { name: 'RangeError', message: 'Manual dates must lie inside the schedule range: t' })
  assert.throws(run({ inactive: 'yes' }), { name: 'Error', message: 'Invalid inactive flag: t' })
  // An inactive task is still validated in full, and still owns its ID.
  assert.throws(run({ inactive: true, duration: -1 }), { name: 'RangeError', message: 'Invalid task duration: t' })
  assert.throws(run({ inactive: true, manual: { start: 4, end: 3 } }), { name: 'RangeError', message: 'Manual dates cannot end before they start: t' })
  assert.throws(() => scheduleTasks({ range, tasks: [{ id: 't', duration: 1, inactive: true }, { id: 't', duration: 1 }] }), { name: 'Error', message: 'Duplicate task ID: t' })
  assert.throws(() => scheduleTasks({ range, tasks: [{ id: 't', duration: 1, inactive: true }], dependencies: [link('t', 'zz')] }), { name: 'Error', message: 'Unknown dependency endpoint: t-zz' })
  assert.equal(run({ manual: { start: 0, end: 40 } })().ok, true)
})

test('a manual task after the deadline is infeasible, and a cycle through a manual task is still a cycle', () => {
  assert.deepEqual(scheduleTasks({ range, deadline: 10, tasks: [{ id: 'a', duration: 2 }, { id: 'm', duration: 1, manual: { start: 5, end: 12 } }] }), {
    ok: false, code: 'infeasible', taskId: 'm', constraints: ['deadline'], dependencyIds: [],
  })
  assert.equal(scheduleTasks({ range, deadline: 12, tasks: [{ id: 'm', duration: 1, manual: { start: 5, end: 12 } }] }).ok, true)
  assert.deepEqual(scheduleTasks({
    range, tasks: [{ id: 'a', duration: 2 }, { id: 'm', duration: 1, manual: { start: 5, end: 6 } }], dependencies: [link('a', 'm'), link('m', 'a')],
  }), { ok: false, code: 'cycle', cycles: [{ taskIds: ['a', 'm'], dependencyIds: ['a-m', 'm-a'] }] })
})

test('an inactive task, its links and its result entry are left out of the calculation', () => {
  const input = {
    range,
    tasks: [{ id: 'a', duration: 5 }, { id: 'x', duration: 10, inactive: true }, { id: 'b', duration: 3 }, { id: 'y', duration: 1, inactive: false }],
    dependencies: [link('a', 'x'), link('x', 'b'), link('a', 'y')],
  }
  const result = scheduleTasks(input)
  assert.equal(result.ok, true)
  assert.deepEqual(dates(result), [['a', 0, 5], ['b', 0, 3], ['y', 5, 6]])
  assert.deepEqual(result.inactiveTaskIds, ['x'])
  assert.deepEqual(result.criticalDependencyIds, ['a-y'])
  assert.equal(result.finish, 6)
  // Activating it again restores the links.
  assert.deepEqual(dates(scheduleTasks({ ...input, tasks: input.tasks.map(task => ({ ...task, inactive: false })) })), [['a', 0, 5], ['x', 5, 15], ['b', 15, 18], ['y', 5, 6]])
  // A cycle through an inactive task is no cycle.
  assert.equal(scheduleTasks({ ...input, dependencies: [link('a', 'x'), link('x', 'a')] }).ok, true)
})

test('traces explain manual tasks with manual reasons and leave inactive tasks out', () => {
  const input = {
    range,
    tasks: [{ id: 'a', duration: 5 }, { id: 'm', duration: 2, manual: { start: 3, end: 8 } }, { id: 'b', duration: 4 }, { id: 'x', duration: 1, inactive: true }],
    dependencies: [link('a', 'm'), link('m', 'b'), link('x', 'b')],
  }
  const plain = scheduleTasks(input)
  const result = scheduleTasks(input, { explain: true })
  assert.deepEqual({ ...result, trace: undefined }, { ...plain, trace: undefined })
  assert.deepEqual([...result.trace.taskReasonIds.keys()], ['a', 'm', 'b'])
  const manual = result.trace.reasons.filter(reason => reason.taskId === 'm')
  assert.deepEqual(manual.map(({ id: _id, ...reason }) => reason), [
    { taskId: 'm', phase: 'earliest', kind: 'manual', bound: 'startLower', candidateTime: 3, placedTime: 3, parentReasonIds: [] },
    { taskId: 'm', phase: 'latest', kind: 'manual', bound: 'startUpper', candidateTime: 3, placedTime: 3, parentReasonIds: [] },
  ])
  const chain = collectScheduleReasons(result.trace, 'b', { phases: ['earliest'] })
  assert.deepEqual(chain.map(reason => [reason.taskId, reason.kind, reason.dependencyId]), [['b', 'dependency', 'm-b'], ['m', 'manual', undefined]])
  assert.throws(() => collectScheduleReasons(result.trace, 'x'), /Unknown task in schedule trace: x/)
})

test('an ALAP predecessor of a manual task stops at the link only when its earliest dates meet it', () => {
  const result = scheduleTasks({
    range,
    tasks: [
      { id: 'p', duration: 2, mode: 'alap' }, { id: 'late', duration: 2, mode: 'alap', startNoEarlierThan: 11 },
      { id: 'm', duration: 2, manual: { start: 10, end: 12 } }, { id: 'z', duration: 20 },
    ],
    dependencies: [link('p', 'm'), link('late', 'm')],
  }, { explain: true })
  assert.equal(result.ok, true)
  assert.deepEqual(result.tasks.map(t => [t.id, t.start, t.end, t.earliestStart, t.latestStart, t.totalFloat]), [
    ['p', 8, 10, 0, 18, 18], ['late', 18, 20, 11, 18, 7], ['m', 10, 12, undefined, 10, 0], ['z', 0, 20, undefined, 0, 0],
  ])
  assert.deepEqual(result.manualConflicts, [{ taskId: 'm', dependencyId: 'late-m' }])
  const placement = result.trace.reasons.find(reason => reason.taskId === 'p' && reason.phase === 'placement')
  assert.equal(placement.kind, 'dependency')
  assert.equal(placement.dependencyId, 'p-m')
})

test('propagateEdit moves the dates of a manual task and refuses inactive tasks', () => {
  const input = {
    range,
    tasks: [{ id: 'a', duration: 5 }, { id: 'm', duration: 9, manual: { start: 3, end: 8 } }, { id: 'b', duration: 4 }, { id: 'x', duration: 1, inactive: true }],
    dependencies: [link('m', 'b'), link('x', 'b')],
  }
  const original = JSON.stringify(input)
  const moved = propagateEdit(input, { id: 'm', start: 6 })
  assert.equal(moved.ok, true)
  assert.deepEqual(moved.changes, [
    { id: 'm', before: { start: 3, end: 8 }, after: { start: 6, end: 11 } },
    { id: 'b', before: { start: 8, end: 12 }, after: { start: 11, end: 15 } },
  ])
  assert.equal(moved.schedule.tasks[1].manual, true)
  const resized = propagateEdit(input, { id: 'm', start: 4, end: 6 })
  assert.deepEqual(resized.changes.map(change => [change.id, change.after.start, change.after.end]), [['m', 4, 6], ['b', 6, 10]])
  assert.deepEqual(propagateEdit(input, { id: 'm', start: 38 }), { ok: false, code: 'infeasible', taskId: 'm', constraints: ['range'], dependencyIds: [] })
  assert.throws(() => propagateEdit(input, { id: 'm', start: 5, end: 4 }), { name: 'RangeError' })
  assert.throws(() => propagateEdit(input, { id: 'x', start: 1 }), { name: 'Error', message: 'Cannot edit an inactive task: x' })
  assert.throws(() => propagateEdit(input, { id: 'zz', start: 1 }), { name: 'Error', message: 'Unknown task: zz' })
  // Ordinary tasks are edited as before, with the inactive task still left out.
  assert.deepEqual(propagateEdit(input, { id: 'a', start: 2 }).changes, [{ id: 'a', before: { start: 0, end: 5 }, after: { start: 2, end: 7 } }])
  assert.equal(JSON.stringify(input), original)
})

test('leveling reserves manual tasks first without moving them and ignores inactive tasks and their assignments', () => {
  const input = {
    range, resources: [{ id: 'r', capacity: 1 }],
    tasks: [{ id: 'a', duration: 4 }, { id: 'm', duration: 1, manual: { start: 2, end: 6 } }, { id: 'x', duration: 3, inactive: true }, { id: 'm2', duration: 1, manual: { start: 4, end: 5 } }],
    assignments: [{ resourceId: 'r', taskId: 'a' }, { resourceId: 'r', taskId: 'm' }, { resourceId: 'r', taskId: 'x' }, { resourceId: 'r', taskId: 'm2' }],
  }
  const original = JSON.stringify(input)
  const result = levelResources(input, { explain: true })
  assert.equal(result.ok, true)
  assert.deepEqual(dates(result), [['a', 6, 10], ['m', 2, 6], ['m2', 4, 5]])
  assert.deepEqual(result.leveledTasks.map(task => task.startNoEarlierThan), [6, undefined, undefined, undefined])
  assert.deepEqual(result.delays.map(delay => [delay.taskId, delay.delay, delay.cause]), [['a', 6, 'capacity']])
  // The two manual tasks overlap: the later one keeps its dates and its overload.
  assert.deepEqual(result.unresolvedTaskIds, ['m2'])
  assert.deepEqual(result.overloads.map(segment => [segment.start, segment.end, segment.load, segment.taskIds]), [[4, 5, 2, ['m', 'm2']]])
  assert.deepEqual(result.inactiveTaskIds, ['x'])
  const capacity = result.trace.reasons.find(reason => reason.taskId === 'm2' && reason.kind === 'capacity')
  assert.deepEqual([capacity.range, capacity.relatedTaskIds, capacity.placedTime], [{ start: 4, end: 5 }, ['m'], 4])
  assert.deepEqual(result.trace.reasons.filter(reason => reason.kind === 'manual' && reason.phase === 'leveling').map(reason => reason.taskId), ['m', 'm2'])
  assert.equal(JSON.stringify(input), original)
  assert.throws(() => levelResources({ ...input, assignments: [{ resourceId: 'r', taskId: 'zz' }] }), /Unknown task in assignment: zz$/)
  assert.throws(() => levelResources({ ...input, assignments: [{ resourceId: 'nope', taskId: 'm' }] }), /Unknown resource in assignment: nope$/)
})

test('rescheduling from a status date keeps manual dates and accepts progress of inactive tasks', () => {
  const input = {
    range,
    tasks: [{ id: 'a', duration: 4 }, { id: 'm', duration: 1, manual: { start: 2, end: 6 } }, { id: 'b', duration: 2 }, { id: 'x', duration: 3, inactive: true }],
    dependencies: [link('m', 'b')],
  }
  const result = rescheduleFromStatusDate(input, 3, new Map([['a', 0.5], ['m', 0.5], ['x', 1]]))
  assert.equal(result.ok, true)
  assert.deepEqual(dates(result), [['a', 0, 5], ['m', 2, 6], ['b', 6, 8]])
  assert.deepEqual(result.tasks[0].work, [{ start: 0, end: 2 }, { start: 3, end: 5 }])
  assert.throws(() => rescheduleFromStatusDate(input, 3, new Map([['zz', 1]])), /Unknown task in progress: zz/)
})

test('resource load, placement and network diagrams leave inactive tasks out', () => {
  const tasks = [{ id: 'a', work: [{ start: 0, end: 2 }] }]
  const resources = [{ id: 'r', capacity: 1 }]
  const assignments = [{ resourceId: 'r', taskId: 'a' }, { resourceId: 'r', taskId: 'x' }]
  assert.throws(() => calculateResourceLoad(range, tasks, resources, assignments),
    /Unknown task in assignment: x\. Tasks left out of a schedule result as inactive must be listed in options\.inactiveTaskIds/)
  const load = calculateResourceLoad(range, tasks, resources, assignments, { inactiveTaskIds: ['x'] })
  assert.deepEqual(load, calculateResourceLoad(range, tasks, resources, [assignments[0]]))
  assert.throws(() => calculateResourceLoad(range, tasks, resources, assignments, { inactiveTaskIds: ['a', 'x'] }), /An inactive task cannot have workload: a/)
  assert.throws(() => calculateResourceLoad(range, tasks, resources, [{ resourceId: 'zz', taskId: 'x' }], { inactiveTaskIds: ['x'] }), /Unknown resource in assignment: zz$/)

  const input = {
    range,
    tasks: [{ id: 'p', duration: 1 }, { id: 'q', duration: 1 }, { id: 'x', duration: 1, inactive: true }, { id: 'm', duration: 1, manual: { start: 0, end: 1 } }],
    dependencies: [link('p', 'q'), link('x', 'q'), link('p', 'm')],
  }
  const placement = buildPlacementInput(input, ['q', 'm'])
  assert.deepEqual(placement.diagnostics, [{ code: 'unplaced-predecessor', taskId: 'q', predecessorId: 'p', dependencyId: 'p-q' }])
  assert.deepEqual(placement.excludedDependencyIds, ['p-q', 'x-q', 'p-m'])
  assert.equal(buildPlacementInput(input, ['p', 'q', 'm']).ok, true)

  const schedule = scheduleTasks(input)
  const graph = scheduleToGraph(schedule, input.dependencies)
  assert.deepEqual(graph.nodes.map(node => node.id), ['p', 'q', 'm'])
  assert.deepEqual(graph.edges.map(edge => edge.id), ['p-q', 'p-m'])
  assert.equal(graph.nodes[2].data.task.manual, true)
  assert.throws(() => scheduleToGraph(schedule, [link('p', 'zz')]), /Unknown dependency endpoint: p-zz/)
})

test('planning snapshots keep manual and inactive tasks and validate the flag', () => {
  const data = {
    range,
    tasks: [{ id: 'a', duration: 2 }, { id: 'm', duration: 1, manual: { start: 4, end: 9 } }, { id: 'x', duration: 3, inactive: true }],
    dependencies: [link('a', 'm'), link('x', 'a')],
    resources: [{ id: 'r', capacity: 1 }],
    assignments: [{ resourceId: 'r', taskId: 'x' }],
  }
  const text = serializeWeaveSnapshot({ kind: 'planning', data })
  const parsed = parseWeaveSnapshot(text)
  assert.equal(parsed.ok, true, JSON.stringify(parsed.diagnostics))
  const restored = restoreWeaveSnapshot(parsed.snapshot, {})
  assert.equal(restored.ok, true)
  assert.deepEqual(restored.snapshot.input.tasks, data.tasks)
  assert.deepEqual(restored.snapshot.schedule, scheduleTasks(data))
  const bad = JSON.parse(text)
  bad.data.tasks[2].inactive = 'yes'
  const rejected = parseWeaveSnapshot(JSON.stringify(bad))
  assert.equal(rejected.ok, false)
  assert.deepEqual(rejected.diagnostics.map(item => [item.code, item.path]), [['structure', 'data.tasks[2].inactive']])
})
