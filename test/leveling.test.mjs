import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calculateResourceLoad, levelResources, scheduleTasks } from 'vue-weave/core'
import { dates, link, task } from './helpers/builders.mjs'

const range = { start: 0, end: 40 }
const shifts = [{ start: 0, end: 4 }, { start: 5, end: 9 }, { start: 24, end: 28 }, { start: 29, end: 33 }]
const machine = [{ id: 'm', capacity: 1 }]
const on = (...ids) => ids.map(taskId => ({ resourceId: 'm', taskId }))

function assertReproducible(input, result) {
  const replay = scheduleTasks({ ...input, tasks: result.leveledTasks })
  assert.deepEqual(replay.tasks, result.tasks)
  assert.equal(replay.finish, result.finish)
}

test('leveling delays the task with more float and reports the delay', () => {
  const input = { range, tasks: [task('a', 4), task('b', 2)], resources: machine, assignments: on('a', 'b') }
  const original = JSON.stringify(input)
  const result = levelResources(input)
  assert.equal(result.ok, true)
  assert.deepEqual(dates(result), [['a', 0, 4], ['b', 4, 6]])
  assert.equal(result.finish, 6)
  assert.deepEqual(result.delays, [{ taskId: 'b', before: { start: 0, end: 2 }, after: { start: 4, end: 6 }, delay: 4, cause: 'capacity', pauses: [] }])
  assert.deepEqual([result.overloads, result.unresolvedTaskIds], [[], []])
  assert.deepEqual(result.leveledTasks, [task('a', 4), task('b', 2, { startNoEarlierThan: 4 })])
  assertReproducible(input, result)
  assert.equal(JSON.stringify(input), original)
})

test('priority, float, early start and ID order the serial heuristic deterministically', () => {
  const prioritized = levelResources({ range, tasks: [task('a', 4), task('b', 2, { priority: 10 })], resources: machine, assignments: on('a', 'b') })
  assert.deepEqual(dates(prioritized), [['a', 2, 6], ['b', 0, 2]])
  const tied = input => levelResources({ range, tasks: input, resources: machine, assignments: on('x', 'y') })
  const forward = tied([task('x', 2), task('y', 2)]), backward = tied([task('y', 2), task('x', 2)])
  assert.deepEqual(dates(forward), [['x', 0, 2], ['y', 2, 4]])
  assert.deepEqual(dates(backward), [['y', 2, 4], ['x', 0, 2]])
  const early = levelResources({ range, tasks: [task('z', 2, { startNoEarlierThan: 1 }), task('w', 1, { startNoEarlierThan: 2 }), task('long', 10)],
    resources: machine, assignments: on('z', 'w') })
  assert.deepEqual(dates(early), [['z', 1, 3], ['w', 3, 4], ['long', 0, 10]])
  const input = { range, tasks: [task('a', 3), task('b', 2), task('c', 2), task('d', 1)], dependencies: [link('a', 'd')],
    resources: [{ id: 'm', capacity: 2 }], assignments: [...on('a', 'b', 'c'), { resourceId: 'm', taskId: 'd', units: 2 }] }
  assert.deepEqual(levelResources(input), levelResources(input))
})

test('dependents of a delayed task move with it and report the predecessor cause', () => {
  const input = { range, tasks: [task('a', 4), task('b', 2), task('c', 1)], dependencies: [link('b', 'c')],
    resources: machine, assignments: on('a', 'b') }
  const result = levelResources(input)
  assert.deepEqual(dates(result), [['a', 0, 4], ['b', 4, 6], ['c', 6, 7]])
  assert.deepEqual(result.delays.map(d => [d.taskId, d.delay, d.cause]), [['b', 4, 'capacity'], ['c', 4, 'predecessor']])
  assertReproducible(input, result)
})

test('splittable tasks fill free capacity and the split is recorded as pauses', () => {
  const tasks = splittable => [task('fixed', 2, { fixedStart: 2, priority: 1 }), task('b', 4, { splittable })]
  const split = levelResources({ range, tasks: tasks(true), resources: machine, assignments: on('fixed', 'b') })
  assert.deepEqual(dates(split), [['fixed', 2, 4], ['b', 0, 6]])
  assert.deepEqual(split.tasks[1].work, [{ start: 0, end: 2 }, { start: 4, end: 6 }])
  assert.deepEqual(split.leveledTasks[1].pauses, [{ start: 2, end: 4 }])
  assert.deepEqual(split.delays, [{ taskId: 'b', before: { start: 0, end: 4 }, after: { start: 0, end: 6 }, delay: 0, cause: 'capacity', pauses: [{ start: 2, end: 4 }] }])
  assertReproducible({ range, tasks: tasks(true) }, split)
  const whole = levelResources({ range, tasks: tasks(false), resources: machine, assignments: on('fixed', 'b') })
  assert.deepEqual(dates(whole), [['fixed', 2, 4], ['b', 4, 8]])
})

test('leveling respects task calendars and resource availability', () => {
  const calendar = { calendars: [{ id: 'shift', periods: shifts }], defaultCalendarId: 'shift' }
  const input = { range, ...calendar, tasks: [task('a', 4), task('b', 2)], resources: machine, assignments: on('a', 'b') }
  const result = levelResources(input)
  assert.deepEqual(dates(result), [['a', 0, 4], ['b', 5, 7]])
  assertReproducible(input, result)
  const window = levelResources({ range, tasks: [task('a', 4)], resources: [{ id: 'm', capacity: 1, periods: [{ start: 10, end: 20 }] }], assignments: on('a') })
  assert.deepEqual(dates(window), [['a', 10, 14]])
  assert.deepEqual(window.overloads, [])
})

test('overloads that no permitted delay resolves stay at their earliest dates and are reported', () => {
  const deadline = levelResources({ range, deadline: 4, tasks: [task('a', 4), task('b', 2)], resources: machine, assignments: on('a', 'b') })
  assert.deepEqual(dates(deadline), [['a', 0, 4], ['b', 0, 2]])
  assert.deepEqual(deadline.unresolvedTaskIds, ['b'])
  assert.deepEqual(deadline.overloads.map(s => [s.start, s.end, s.load, s.capacity, s.taskIds]), [[0, 2, 2, 1, ['a', 'b']]])
  assert.deepEqual(deadline.delays, [])
  const successor = levelResources({ range, tasks: [task('a', 4), task('b', 2), task('c', 1, { finishNoLaterThan: 5 })],
    dependencies: [link('b', 'c')], resources: machine, assignments: on('a', 'b') })
  assert.equal(successor.ok, true)
  assert.deepEqual(dates(successor), [['a', 0, 4], ['b', 0, 2], ['c', 2, 3]])
  assert.deepEqual(successor.unresolvedTaskIds, ['b'])
  const tooLarge = levelResources({ range, tasks: [task('a', 2)], resources: machine, assignments: [{ resourceId: 'm', taskId: 'a', units: 2 }] })
  assert.deepEqual([dates(tooLarge), tooLarge.unresolvedTaskIds, tooLarge.overloads.length], [[['a', 0, 2]], ['a'], 1])
})

test('leveling places ALAP tasks as soon as possible and keeps milestones unconstrained', () => {
  const result = levelResources({ range, tasks: [task('a', 2, { mode: 'alap' }), task('gate', 0), task('x', 10)], dependencies: [link('a', 'gate')],
    resources: machine, assignments: on('a', 'gate') })
  assert.deepEqual(dates(result), [['a', 0, 2], ['gate', 2, 2], ['x', 0, 10]])
  assert.equal('mode' in result.leveledTasks[0], false)
})

test('leveling returns schedule failures and validates its inputs', () => {
  const cycle = levelResources({ range, tasks: [task('a', 1), task('b', 1)], dependencies: [link('a', 'b'), link('b', 'a')], resources: [], assignments: [] })
  assert.deepEqual(cycle, { ok: false, code: 'cycle', cycles: [{ taskIds: ['a', 'b'], dependencyIds: ['a-b', 'b-a'] }] })
  const infeasible = levelResources({ range, deadline: 2, tasks: [task('a', 4)], resources: [], assignments: [] })
  assert.deepEqual(infeasible, { ok: false, code: 'infeasible', taskId: 'a', constraints: ['range', 'deadline'], dependencyIds: [] })
  const base = { range, tasks: [task('a', 2)], resources: machine, assignments: on('a') }
  assert.throws(() => levelResources({ ...base, assignments: [{ resourceId: 'x', taskId: 'a' }] }), /Unknown/)
  assert.throws(() => levelResources({ ...base, assignments: [...on('a'), ...on('a')] }), /Duplicate/)
  assert.throws(() => levelResources({ ...base, resources: [{ id: 'm', capacity: -1 }] }), RangeError)
  assert.throws(() => levelResources({ ...base, quantum: 2, resources: [{ id: 'm', capacity: 1, periods: [{ start: 1, end: 3 }] }] }), RangeError)
  assert.throws(() => levelResources({ ...base, tasks: [task('a', 2, { priority: Number.NaN })] }), RangeError)
  assert.throws(() => levelResources({ ...base, tasks: [task('a', 2, { splittable: 'yes' })] }), /splittable/)
  assert.throws(() => levelResources({ ...base, assignments: [{ resourceId: 'm', taskId: 'a', units: 0 }] }), RangeError)
})

test('leveled plans never exceed capacity when every task can be delayed', () => {
  const tasks = Array.from({ length: 30 }, (_, i) => task('t' + String(i).padStart(2, '0'), 1 + (i * 7) % 5, { priority: i % 3 }))
  const dependencies = tasks.slice(1).filter((_, i) => i % 4 === 0).map((t, i) => link(tasks[i].id, t.id))
  const resources = [{ id: 'm', capacity: 2 }, { id: 'n', capacity: 1, periods: [{ start: 0, end: 50 }, { start: 60, end: 200 }] }]
  const assignments = tasks.flatMap((t, i) => [
    { resourceId: 'm', taskId: t.id, units: 1 + (i % 2) },
    ...(i % 3 === 0 ? [{ resourceId: 'n', taskId: t.id }] : []),
  ])
  const input = { range: { start: 0, end: 200 }, tasks, dependencies, resources, assignments }
  const result = levelResources(input)
  assert.equal(result.ok, true)
  assert.deepEqual(result.unresolvedTaskIds, [])
  assert.deepEqual(result.overloads, [])
  assert.deepEqual(calculateResourceLoad(input.range, result.tasks, resources, assignments).filter(s => s.overload), [])
  assertReproducible(input, result)
})

/** Checks a leveled plan against capacity, availability and work amount without using the scheduler. */
function assertWithinCapacity(input, result) {
  const durations = new Map(input.tasks.map(t => [t.id, t.duration]))
  for (const t of result.tasks) {
    assert.equal(t.work.reduce((sum, w) => sum + w.end - w.start, 0), durations.get(t.id), 'work amount of ' + t.id)
  }
  for (const resource of input.resources) {
    const periods = resource.periods ?? [input.range]
    const users = input.assignments.filter(a => a.resourceId === resource.id)
    const edges = new Set([input.range.start, input.range.end, ...periods.flatMap(p => [p.start, p.end])])
    for (const t of result.tasks) for (const w of t.work) edges.add(w.start).add(w.end)
    const times = [...edges].sort((a, b) => a - b)
    for (let i = 0; i + 1 < times.length; i++) {
      const at = times[i]
      const capacity = periods.some(p => p.start <= at && at < p.end) ? resource.capacity : 0
      let load = 0
      for (const { taskId, units = 1 } of users) {
        const t = result.tasks.find(x => x.id === taskId)
        if (t.work.some(w => w.start <= at && at < w.end)) load += units
      }
      assert.ok(load <= capacity, `${resource.id} at ${at}: load ${load} > capacity ${capacity}`)
    }
  }
  assert.deepEqual([result.overloads, result.unresolvedTaskIds], [[], []])
}

test('a split task keeps its reserved start when an end bound applies', () => {
  const resources = [{ id: 'm', capacity: 1, periods: [{ start: 4, end: 5 }, { start: 6, end: 10 }] }]
  const input = { range: { start: 0, end: 10 }, tasks: [task('a', 4, { splittable: true, finishNoEarlierThan: 8 })], resources, assignments: on('a') }
  const result = levelResources(input)
  assert.equal(result.ok, true)
  assert.deepEqual(result.tasks[0].work, [{ start: 4, end: 5 }, { start: 6, end: 9 }])
  assert.deepEqual(result.delays, [{ taskId: 'a', before: { start: 4, end: 8 }, after: { start: 4, end: 9 }, delay: 0, cause: 'capacity', pauses: [{ start: 5, end: 6 }] }])
  assertWithinCapacity(input, result)
  assertReproducible(input, result)
})

test('split tasks under FF and SF end bounds stay within capacity', () => {
  const resources = [{ id: 'm', capacity: 1, periods: [{ start: 0, end: 3 }, { start: 4, end: 5 }, { start: 6, end: 20 }] }]
  for (const type of ['FF', 'SF']) {
    const input = {
      range: { start: 0, end: 20 },
      tasks: [task('gate', 2, { startNoEarlierThan: 6 }), task('a', 4, { splittable: true }), task('b', 2, { splittable: true })],
      dependencies: [link('gate', 'a', type)], resources, assignments: on('a', 'b'),
    }
    const result = levelResources(input)
    assert.equal(result.ok, true, type)
    assertWithinCapacity(input, result)
    assertReproducible(input, result)
  }
})

test('split tasks with calendars, existing pauses, fixed starts and quantum stay within capacity', () => {
  const resources = [{ id: 'm', capacity: 1, periods: [{ start: 0, end: 6 }, { start: 8, end: 14 }, { start: 16, end: 40 }] }]
  const input = {
    range, quantum: 2, calendars: [{ id: 'shift', periods: [{ start: 0, end: 10 }, { start: 12, end: 40 }] }], defaultCalendarId: 'shift',
    tasks: [
      task('a', 6, { splittable: true, finishNoEarlierThan: 18 }),
      task('b', 4, { splittable: true, pauses: [{ start: 2, end: 4 }] }),
      task('c', 4, { startNoEarlierThan: 4 }),
    ],
    resources, assignments: on('a', 'b', 'c'),
  }
  const result = levelResources(input)
  assert.equal(result.ok, true)
  assertWithinCapacity(input, result)
  assertReproducible(input, result)
})
