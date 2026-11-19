import assert from 'node:assert/strict'
import { test } from 'node:test'
import { rescheduleFromStatusDate, scheduleTasks } from 'vue-weave/core'

const plan = {
  range: { start: 0, end: 100 },
  tasks: [
    { id: 'a', duration: 10 }, { id: 'b', duration: 10 }, { id: 'c', duration: 10 }, { id: 'd', duration: 4 },
    { id: 'early', duration: 10, startNoEarlierThan: 20 }, { id: 'm', duration: 0 },
  ],
  dependencies: [{ id: 'ab', from: 'a', to: 'b' }, { id: 'bc', from: 'b', to: 'c' }, { id: 'cm', from: 'c', to: 'm' }],
}

const dates = result => Object.fromEntries(result.tasks.map(task => [task.id, [task.start, task.end, task.work.map(w => [w.start, w.end])]]))
const finishLinked = (type, lag, extra = {}) => ({
  range: { start: 0, end: 20 },
  tasks: [{ id: 'a', duration: 6 }, { id: 'b', duration: 4, ...extra }],
  dependencies: [{ id: 'ab', from: 'a', to: 'b', type, lag }],
})

test('rescheduleFromStatusDate keeps done work, splits partial tasks and moves unstarted work after the status date', () => {
  const snapshot = structuredClone(plan)
  const result = rescheduleFromStatusDate(plan, 15, new Map([['a', 1], ['b', 0.3], ['early', 0.5], ['m', 0.5]]))
  assert.equal(result.ok, true)
  const tasks = dates(result)
  // Done: unchanged. Partly done: 3 units kept at 10–13, the remaining 7 from the status date.
  assert.deepEqual(tasks.a, [0, 10, [[0, 10]]])
  assert.deepEqual(tasks.b, [10, 22, [[10, 13], [15, 22]]])
  // Not started: after the status date and after its predecessor.
  assert.deepEqual(tasks.c, [22, 32, [[22, 32]]])
  assert.deepEqual(tasks.d, [15, 19, [[15, 19]]])
  // Ahead of plan: the done half is placed to end at the status date; a milestone counts as not started.
  assert.deepEqual(tasks.early, [10, 20, [[10, 20]]])
  assert.deepEqual(tasks.m, [32, 32, []])
  assert.equal(result.finish, 32)
  // The dependency into the started task no longer applies.
  assert.deepEqual(result.criticalDependencyIds, ['bc', 'cm'])
  assert.deepEqual(plan, snapshot)
  // Without progress, every task starts at or after the status date.
  const fresh = dates(rescheduleFromStatusDate(plan, 15, new Map()))
  assert.deepEqual(fresh.a, [15, 25, [[15, 25]]])
  assert.deepEqual(fresh.early, [20, 30, [[20, 30]]])
})

test('rescheduleFromStatusDate splits around calendar breaks and rounds done work down to quanta', () => {
  const input = {
    range: { start: 0, end: 40 }, quantum: 1,
    calendars: [{ id: 'shift', periods: [{ start: 0, end: 4 }, { start: 6, end: 20 }] }], defaultCalendarId: 'shift',
    tasks: [{ id: 'x', duration: 6 }, { id: 'y', duration: 4 }],
  }
  assert.deepEqual(dates(scheduleTasks(input)).x, [0, 8, [[0, 4], [6, 8]]])
  const result = rescheduleFromStatusDate(input, 5, new Map([['x', 0.5], ['y', 0.2]]))
  // x: 3 units done at 0–3, paused until the status date, then 3 units from 6 (the break 4–6 is not working time).
  assert.deepEqual(dates(result).x, [0, 9, [[0, 3], [6, 9]]])
  // y: 0.2 × 4 rounds down to zero done units, so it is treated as not started.
  assert.deepEqual(dates(result).y, [6, 10, [[6, 10]]])
  // A fixed start before the status date makes an unstarted task infeasible.
  const fixed = rescheduleFromStatusDate({ ...input, tasks: [{ id: 'x', duration: 2, fixedStart: 0 }] }, 5, new Map())
  assert.equal(fixed.ok, false)
  assert.equal(fixed.code, 'infeasible')
})

test('rescheduleFromStatusDate keeps finish-to-finish links into started tasks and delays their remaining work', () => {
  const input = finishLinked('FF')
  assert.deepEqual(dates(scheduleTasks(input)).b, [2, 6, [[2, 6]]])
  const snapshot = structuredClone(input)
  // b is half done at the status date: its done half ends there, and its remaining half waits for a to finish.
  const result = rescheduleFromStatusDate(input, 2, new Map([['b', 0.5]]))
  assert.equal(result.ok, true)
  assert.deepEqual(dates(result).a, [2, 8, [[2, 8]]])
  assert.deepEqual(dates(result).b, [0, 8, [[0, 2], [6, 8]]])
  assert.deepEqual(result.criticalDependencyIds, ['ab'])
  assert.deepEqual(input, snapshot)
  // The lag is honoured.
  assert.deepEqual(dates(rescheduleFromStatusDate(finishLinked('FF', 3), 2, new Map([['b', 0.5]]))).b, [0, 11, [[0, 2], [9, 11]]])
  // A link that the remaining work already satisfies changes nothing.
  assert.deepEqual(dates(rescheduleFromStatusDate(finishLinked('FF', -6), 2, new Map([['b', 0.5]]))).b, [0, 4, [[0, 4]]])
  // On a calendar, the remaining work resumes as late as needed and no later; delays carry along a chain.
  const chain = rescheduleFromStatusDate({
    range: { start: 0, end: 40 },
    calendars: [{ id: 'shift', periods: [{ start: 0, end: 4 }, { start: 6, end: 40 }] }],
    tasks: [{ id: 'a', duration: 3 }, { id: 'b', duration: 4, calendarId: 'shift' }, { id: 'c', duration: 4 }],
    dependencies: [{ id: 'ab', from: 'a', to: 'b', type: 'FF', lag: 2 }, { id: 'bc', from: 'b', to: 'c', type: 'FF', lag: 1 }],
  }, 2, new Map([['b', 0.5], ['c', 0.5]]))
  assert.deepEqual(dates(chain).b, [0, 7, [[0, 2], [3, 4], [6, 7]]])
  assert.deepEqual(dates(chain).c, [0, 8, [[0, 2], [6, 8]]])
  assert.deepEqual(chain.criticalDependencyIds, ['ab', 'bc'])
})

test('rescheduleFromStatusDate keeps start-to-finish links into started tasks', () => {
  // b must finish no earlier than 5 units after a starts, and a, not started, moves to the status date 2.
  const result = rescheduleFromStatusDate(finishLinked('SF', 5), 2, new Map([['b', 0.5]]))
  assert.equal(result.ok, true)
  assert.deepEqual(dates(result).a, [2, 8, [[2, 8]]])
  assert.deepEqual(dates(result).b, [0, 7, [[0, 2], [5, 7]]])
})

test('rescheduleFromStatusDate drops start links into started tasks and every link into completed tasks', () => {
  for (const type of ['FS', 'SS']) {
    const result = rescheduleFromStatusDate(finishLinked(type, 8), 2, new Map([['b', 0.5]]))
    assert.equal(result.ok, true)
    assert.deepEqual(dates(result).b, [0, 4, [[0, 4]]])
    assert.deepEqual(result.criticalDependencyIds, [])
  }
  for (const type of ['FS', 'SS', 'FF', 'SF']) {
    const input = finishLinked(type, 1)
    const before = dates(scheduleTasks(input)).b
    const result = rescheduleFromStatusDate(input, 2, new Map([['b', 1]]))
    assert.equal(result.ok, true)
    assert.deepEqual(dates(result).b, before)
    assert.deepEqual(result.criticalDependencyIds, [])
  }
})

test('rescheduleFromStatusDate reports a kept finish link that cannot be met as infeasible', () => {
  // The link requires a finish at 8, after b's own finish bound 7.
  assert.deepEqual(rescheduleFromStatusDate(finishLinked('FF', 0, { finishNoLaterThan: 7 }), 2, new Map([['b', 0.5]])),
    { ok: false, code: 'infeasible', taskId: 'b', constraints: ['finishNoLaterThan'], dependencyIds: ['ab'] })
  // The required finish 21 lies after the horizon.
  assert.deepEqual(rescheduleFromStatusDate(finishLinked('FF', 13), 2, new Map([['b', 0.5]])),
    { ok: false, code: 'infeasible', taskId: 'b', constraints: ['range'], dependencyIds: ['ab'] })
  // The plan meets the deadline 9 with b at 2–6. At the status date 4, b is half done and a has not started, so a
  // moves to 4–8, still before the deadline, and the kept link requires b to finish at 10, after it.
  const deadlined = {
    range: { start: 0, end: 20 }, deadline: 9,
    tasks: [{ id: 'a', duration: 4 }, { id: 'b', duration: 4 }],
    dependencies: [{ id: 'ab', from: 'a', to: 'b', type: 'FF', lag: 2 }],
  }
  assert.deepEqual(dates(scheduleTasks(deadlined)).b, [2, 6, [[2, 6]]])
  assert.deepEqual(rescheduleFromStatusDate(deadlined, 4, new Map([['b', 0.5]])),
    { ok: false, code: 'infeasible', taskId: 'b', constraints: ['deadline'], dependencyIds: ['ab'] })
})

test('rescheduleFromStatusDate validates the status date and progress', () => {
  for (const status of [Number.NaN, Infinity, -1, 101]) assert.throws(() => rescheduleFromStatusDate(plan, status, new Map()), RangeError)
  for (const value of [-0.1, 1.5, Number.NaN]) assert.throws(() => rescheduleFromStatusDate(plan, 15, new Map([['a', value]])), RangeError)
  assert.throws(() => rescheduleFromStatusDate(plan, 15, new Map([['missing', 0.5]])), { name: 'Error', message: /Unknown task/ })
  assert.throws(() => rescheduleFromStatusDate({ ...plan, quantum: 2 }, 15, new Map()), RangeError)
  // A failing plan is returned unchanged.
  const cyclic = { ...plan, dependencies: [...plan.dependencies, { id: 'ca', from: 'c', to: 'a' }] }
  assert.equal(rescheduleFromStatusDate(cyclic, 15, new Map()).code, 'cycle')
})

test('rescheduleFromStatusDate rejects progress that is not a map', () => {
  const input = { range: { start: 0, end: 40 }, tasks: [{ id: 'a', duration: 10 }] }
  assert.throws(() => rescheduleFromStatusDate(input, 5, { a: 0.5 }), /Progress must be a Map/)
  assert.throws(() => rescheduleFromStatusDate(input, 5, undefined), /Progress must be a Map/)
  assert.equal(rescheduleFromStatusDate(input, 5, new Map([['a', 0.5]])).ok, true)
})
