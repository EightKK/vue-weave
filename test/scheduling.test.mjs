import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildWorkPeriods, scheduleTasks, calculateResourceLoad } from 'vue-weave/core'

const range = { start: 0, end: 40 }
const shifts = [{ start: 0, end: 4 }, { start: 5, end: 9 }, { start: 24, end: 28 }, { start: 29, end: 33 }]
const calendar = { calendars: [{ id: 'shift', periods: shifts }], defaultCalendarId: 'shift' }
const task = (id, duration, constraints = {}) => ({ id, duration, ...constraints })
const link = (from, to, type, lag) => ({ id: from + '-' + to, from, to, type, lag })

test('weekly calendar clips night shifts at a civil holiday and respects UTC offset', () => {
  const date = value => Date.parse(value + '+09:00')
  const monday = date('2026-11-09T21:30:00'), wednesday = date('2026-11-11T10:00:00')
  assert.deepEqual(buildWorkPeriods({ start: monday, end: wednesday }, {
    utcOffsetMinutes: 540,
    weekly: [{ weekday: 1, startMinute: 21 * 60, endMinute: 26 * 60 }, { weekday: 3, startMinute: 8 * 60, endMinute: 12 * 60 }],
    exceptions: { '2026-11-10': [] },
  }), [
    { start: monday, end: date('2026-11-10T00:00:00') },
    { start: date('2026-11-11T08:00:00'), end: wednesday },
  ])
  assert.throws(() => buildWorkPeriods({ start: monday, end: wednesday }, {
    weekly: [], exceptions: { '2026-02-30': [] },
  }), /exception date/)
})

test('FS crosses breaks without inflating work and includes the controlling link', () => {
  const input = { range, ...calendar, tasks: [task('a', 4), task('b', 5), task('slack', 2)],
    dependencies: [link('a', 'b')] }
  const original = JSON.stringify(input)
  const result = scheduleTasks(input)
  assert.equal(result.ok, true)
  assert.equal(result.finish, 25)
  assert.deepEqual(result.tasks.map(t => [t.id, t.start, t.end, t.latestStart, t.latestEnd, t.totalFloat, t.critical]), [
    ['a', 0, 4, 0, 4, 0, true], ['b', 5, 25, 5, 25, 0, true], ['slack', 0, 2, 8, 25, 7, false],
  ])
  assert.deepEqual(result.tasks[1].work, [{ start: 5, end: 9 }, { start: 24, end: 25 }])
  assert.deepEqual(result.criticalDependencyIds, ['a-b'])
  assert.equal(JSON.stringify(input), original)
})

test('all dependency endpoints and signed elapsed lag apply consistently', () => {
  const cases = [
    ['FS', 2, 9, 13],
    ['SS', -1, 4, 8],
    ['FF', 2, 5, 9],
    ['SF', 3, 4, 8],
  ]
  for (const [type, lag, start, end] of cases) {
    const result = scheduleTasks({ range, tasks: [task('a', 2, { fixedStart: 5 }), task('b', 4)],
      dependencies: [link('a', 'b', type, lag)] })
    assert.equal(result.ok, true, type)
    assert.deepEqual([result.tasks[1].start, result.tasks[1].end], [start, end], type)
  }
})

test('FF with a finish bound in a break advances to the next feasible completion tick', () => {
  const result = scheduleTasks({ range, ...calendar, tasks: [task('a', 4), task('b', 2)],
    dependencies: [link('a', 'b', 'FF', 1)] })
  assert.equal(result.ok, true)
  assert.deepEqual([result.tasks[1].start, result.tasks[1].end, result.tasks[1].totalFloat], [3, 6, 0])
  assert.deepEqual(result.tasks[1].work, [{ start: 3, end: 4 }, { start: 5, end: 6 }])
})

test('task calendars override the project calendar and milestones can fall in a break', () => {
  const result = scheduleTasks({ range, ...calendar, calendars: [
    ...calendar.calendars, { id: 'night', periods: [{ start: 9, end: 15 }] },
  ], tasks: [task('gate', 0, { fixedStart: 4 }), task('night', 2, { calendarId: 'night' })],
  dependencies: [link('gate', 'night')] })
  assert.equal(result.ok, true)
  assert.deepEqual(result.tasks.map(t => [t.start, t.end, t.work.length]), [[4, 4, 0], [9, 11, 1]])
})

test('cycles, impossible fixed starts and violated deadlines return no partial plan', () => {
  assert.deepEqual(scheduleTasks({ range, tasks: [task('a', 2), task('b', 2)],
    dependencies: [link('a', 'b'), link('b', 'a')] }),
  { ok: false, code: 'cycle', cycles: [{ taskIds: ['a', 'b'], dependencyIds: ['a-b', 'b-a'] }] })
  assert.deepEqual(scheduleTasks({ range, ...calendar, tasks: [task('a', 2, { fixedStart: 4 })] }),
    { ok: false, code: 'infeasible', taskId: 'a', constraints: ['fixedStart', 'calendar'], dependencyIds: [] })
  assert.deepEqual(scheduleTasks({ range, ...calendar, deadline: 4, tasks: [task('a', 5)] }),
    { ok: false, code: 'infeasible', taskId: 'a', constraints: ['range', 'deadline'], dependencyIds: [] })
  assert.throws(() => scheduleTasks({ range, quantum: 2, tasks: [task('a', 3)] }), /duration/)
})

test('capacity sweep treats half-open boundaries and a closed resource independently', () => {
  const jobs = [
    { id: 'a', work: [{ start: 0, end: 4 }, { start: 5, end: 7 }] },
    { id: 'b', work: [{ start: 3, end: 5 }] },
  ]
  const resources = [{ id: 'm', capacity: 1, periods: [{ start: 0, end: 4 }, { start: 5, end: 7 }] }]
  const assignments = jobs.map(({ id }) => ({ resourceId: 'm', taskId: id }))
  const segments = calculateResourceLoad({ start: 0, end: 7 }, jobs, resources, assignments)
  assert.deepEqual(segments.map(s => [s.start, s.end, s.load, s.capacity, s.overload, s.taskIds]), [
    [0, 3, 1, 1, 0, ['a']], [3, 4, 2, 1, 1, ['a', 'b']],
    [4, 5, 1, 0, 1, ['b']], [5, 7, 1, 1, 0, ['a']],
  ])
  assert.throws(() => calculateResourceLoad(range, jobs, resources, [...assignments, assignments[0]]), /Duplicate/)
})

test('workFloat measures milestone float in working time while totalFloat stays elapsed', () => {
  const periods = Array.from({ length: 7 }, (_, day) => ({ start: day * 24 + 9, end: day * 24 + 17 }))
  const result = scheduleTasks({
    range: { start: 0, end: 168 }, calendars: [{ id: 'office', periods }], defaultCalendarId: 'office',
    tasks: [task('a', 8), task('m', 0), task('b', 24)],
    dependencies: [link('a', 'm')],
  })
  assert.equal(result.ok, true)
  const [a, m, b] = result.tasks
  assert.equal(b.totalFloat, 0)
  assert.equal(b.workFloat, 0)
  assert.equal(a.totalFloat, 16)
  assert.equal(a.workFloat, 16)
  assert.equal(m.totalFloat, 48)
  assert.equal(m.workFloat, 16)
  assert.equal(m.workFloat, a.workFloat)
})

test('cycle failures name every strongly connected group, self-loops included', () => {
  const result = scheduleTasks({ range, tasks: ['s', 'a', 'b', 'c', 'd', 'e', 'f', 'loop'].map(id => task(id, 1)), dependencies: [
    link('s', 'a'), link('a', 'b'), link('b', 'c'), link('c', 'a'), link('b', 'd'),
    link('e', 'f'), link('f', 'e'), link('loop', 'loop'), link('c', 'b'),
  ] })
  assert.deepEqual(result, { ok: false, code: 'cycle', cycles: [
    { taskIds: ['a', 'b', 'c'], dependencyIds: ['a-b', 'b-c', 'c-a', 'c-b'] },
    { taskIds: ['e', 'f'], dependencyIds: ['e-f', 'f-e'] },
    { taskIds: ['loop'], dependencyIds: ['loop-loop'] },
  ] })
})

test('cycle detection is iterative for long cycles', () => {
  const count = 20_000
  const tasks = Array.from({ length: count }, (_, i) => task('t' + i, 1))
  const dependencies = tasks.map((_, i) => link('t' + i, 't' + ((i + 1) % count)))
  const result = scheduleTasks({ range: { start: 0, end: 40_000 }, tasks, dependencies })
  assert.equal(result.code, 'cycle')
  assert.equal(result.cycles.length, 1)
  assert.equal(result.cycles[0].taskIds.length, count)
  assert.equal(result.cycles[0].dependencyIds.length, count)
})

test('infeasible failures name the conflicting bounds and dependencies', () => {
  assert.deepEqual(scheduleTasks({ range, tasks: [task('a', 10), task('b', 2, { finishNoLaterThan: 8 })],
    dependencies: [link('a', 'b')] }),
  { ok: false, code: 'infeasible', taskId: 'b', constraints: ['finishNoLaterThan'], dependencyIds: ['a-b'] })
  assert.deepEqual(scheduleTasks({ range, tasks: [task('m', 0, { finishNoEarlierThan: 5, startNoLaterThan: 3 })] }),
    { ok: false, code: 'infeasible', taskId: 'm', constraints: ['startNoLaterThan', 'finishNoEarlierThan'], dependencyIds: [] })
  assert.deepEqual(scheduleTasks({ range, tasks: [task('a', 4), task('b', 2, { startNoLaterThan: 3 })], dependencies: [
    { id: 'ss', from: 'a', to: 'b', type: 'SS', lag: 2 }, link('a', 'b'), { id: 'late', from: 'a', to: 'b', type: 'SS', lag: 4 },
  ] }),
  { ok: false, code: 'infeasible', taskId: 'b', constraints: ['startNoLaterThan'], dependencyIds: ['a-b', 'late'] })
})

test('ALAP tasks consume free float without moving any other task', () => {
  const plan = mode => scheduleTasks({ range, tasks: [task('a', 2, { mode }), task('b', 4), task('c', 1), task('x', 10)],
    dependencies: [link('a', 'c'), link('b', 'c')] })
  const asap = plan(undefined), alap = plan('alap')
  assert.deepEqual(plan('asap'), asap)
  assert.equal('earliestStart' in asap.tasks[0], false)
  assert.deepEqual(alap.tasks.map(t => [t.id, t.start, t.end]), [['a', 2, 4], ['b', 0, 4], ['c', 4, 5], ['x', 0, 10]])
  assert.deepEqual([alap.tasks[0].earliestStart, alap.tasks[0].earliestEnd, alap.tasks[0].totalFloat], [0, 2, 7])
  assert.deepEqual(alap.tasks.slice(1), asap.tasks.slice(1))
  assert.deepEqual([alap.finish, alap.criticalDependencyIds], [asap.finish, asap.criticalDependencyIds])
  assert.deepEqual(alap.tasks[0].work, [{ start: 2, end: 4 }])
  const held = scheduleTasks({ range, tasks: [task('a', 2, { mode: 'alap' }), task('b', 2), task('x', 10)],
    dependencies: [link('a', 'b')] })
  assert.deepEqual(held.tasks.map(t => [t.start, t.end, t.latestStart]), [[0, 2, 6], [2, 4, 8], [0, 10, 0]])
})

test('ALAP chains, bounds and calendars place tasks at their latest permitted dates', () => {
  const chain = scheduleTasks({ range, tasks: [task('a', 2, { mode: 'alap' }), task('b', 2, { mode: 'alap' }), task('x', 10)],
    dependencies: [link('a', 'b')] })
  assert.deepEqual(chain.tasks.map(t => [t.start, t.end]), [[6, 8], [8, 10], [0, 10]])
  const bounded = scheduleTasks({ range, tasks: [
    task('f', 2, { mode: 'alap', finishNoLaterThan: 6 }), task('s', 2, { mode: 'alap', startNoLaterThan: 3 }),
    task('fixed', 2, { mode: 'alap', fixedStart: 1 }), task('m', 0, { mode: 'alap' }), task('x', 10),
  ] })
  assert.deepEqual(bounded.tasks.map(t => [t.id, t.start, t.end]), [['f', 4, 6], ['s', 3, 5], ['fixed', 1, 3], ['m', 10, 10], ['x', 0, 10]])
  const shifted = scheduleTasks({ range, ...calendar, tasks: [task('x', 9), task('a', 2, { mode: 'alap' })] })
  assert.equal(shifted.finish, 25)
  assert.deepEqual([shifted.tasks[1].start, shifted.tasks[1].end], [8, 25])
  assert.deepEqual(shifted.tasks[1].work, [{ start: 8, end: 9 }, { start: 24, end: 25 }])
  const deadline = scheduleTasks({ range, deadline: 12, tasks: [task('a', 2, { mode: 'alap' })] })
  assert.deepEqual([deadline.tasks[0].start, deadline.tasks[0].end], [0, 2])
  assert.throws(() => scheduleTasks({ range, tasks: [task('a', 2, { mode: 'late' })] }), /mode/)
})

test('pauses interrupt work and successors follow the interrupted finish', () => {
  const input = { range, tasks: [task('a', 4, { pauses: [{ start: 2, end: 3 }, { start: 30, end: 40 }] }), task('b', 1)],
    dependencies: [link('a', 'b')] }
  const result = scheduleTasks(input)
  assert.deepEqual([result.tasks[0].start, result.tasks[0].end], [0, 5])
  assert.deepEqual(result.tasks[0].work, [{ start: 0, end: 2 }, { start: 3, end: 5 }])
  assert.deepEqual([result.tasks[1].start, result.tasks[1].end], [5, 6])
  assert.equal(input.tasks[0].pauses.length, 2)
  const breakOnly = scheduleTasks({ range, ...calendar, tasks: [task('a', 6, { pauses: [{ start: 4, end: 5 }] })] })
  assert.deepEqual(breakOnly.tasks[0].work, [{ start: 0, end: 4 }, { start: 5, end: 7 }])
  assert.deepEqual(scheduleTasks({ range, tasks: [task('a', 2, { fixedStart: 3, pauses: [{ start: 3, end: 4 }] })] }),
    { ok: false, code: 'infeasible', taskId: 'a', constraints: ['fixedStart', 'calendar'], dependencyIds: [] })
  assert.throws(() => scheduleTasks({ range, quantum: 2, tasks: [task('a', 2, { pauses: [{ start: 1, end: 2 }] })] }), RangeError)
  assert.throws(() => scheduleTasks({ range, tasks: [task('a', 2, { pauses: [{ start: 2, end: 2 }] })] }), RangeError)
})
