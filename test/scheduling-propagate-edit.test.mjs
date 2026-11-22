import assert from 'node:assert/strict'
import { test } from 'node:test'
import { propagateEdit, scheduleTasks } from '@eightkk/vue-weave/core'
import { dates as planDates } from './helpers/builders.mjs'

// The plan of the scheduling guide: cut 0–4, inspection 5–7 after the break at 4, other 2–4.
const plan = {
  range: { start: 0, end: 30 }, quantum: 1,
  calendars: [{ id: 'shift', periods: [{ start: 0, end: 4 }, { start: 5, end: 9 }, { start: 24, end: 30 }] }],
  defaultCalendarId: 'shift',
  tasks: [{ id: 'cut', duration: 4 }, { id: 'inspect', duration: 2 }, { id: 'other', duration: 2, startNoEarlierThan: 2 }],
  dependencies: [{ id: 'cut-inspect', from: 'cut', to: 'inspect', type: 'FS' }],
}

const dates = result => planDates(result.schedule)

test('propagateEdit pins the edited task and reports the downstream changes in input order', () => {
  const moved = propagateEdit(plan, { id: 'cut', start: 1 })
  assert.equal(moved.ok, true)
  // Cutting now works 1–4 and 5–6, so inspection follows at 6.
  assert.deepEqual(moved.changes, [
    { id: 'cut', before: { start: 0, end: 4 }, after: { start: 1, end: 6 } },
    { id: 'inspect', before: { start: 5, end: 7 }, after: { start: 6, end: 8 } },
  ])
  assert.deepEqual(dates(moved), [['cut', 1, 6], ['inspect', 6, 8], ['other', 2, 4]])
  assert.equal(moved.schedule.tasks[0].critical, true)

  // Moving a task to where it already is changes nothing.
  const same = propagateEdit(plan, { id: 'cut', start: 0 })
  assert.deepEqual(same.changes, [])
  const base = scheduleTasks(plan)
  assert.deepEqual(dates(same), base.tasks.map(task => [task.id, task.start, task.end]))
})

test('propagateEdit resizes through end by recomputing the working duration on the task calendar', () => {
  // [0, 7) holds 4 + 2 working units across the break.
  const longer = propagateEdit(plan, { id: 'cut', start: 0, end: 7 })
  assert.deepEqual(longer.changes, [
    { id: 'cut', before: { start: 0, end: 4 }, after: { start: 0, end: 7 } },
    { id: 'inspect', before: { start: 5, end: 7 }, after: { start: 7, end: 9 } },
  ])
  const shorter = propagateEdit(plan, { id: 'cut', start: 0, end: 2 })
  assert.deepEqual(dates(shorter), [['cut', 0, 2], ['inspect', 2, 4], ['other', 2, 4]])
  // Work after the closed gap counts only its working time: 5–9 and 24–25.
  const spanning = propagateEdit(plan, { id: 'other', start: 5, end: 25 })
  assert.deepEqual(spanning.changes, [{ id: 'other', before: { start: 2, end: 4 }, after: { start: 5, end: 25 } }])
  assert.deepEqual(spanning.schedule.tasks[2].work, [{ start: 5, end: 9 }, { start: 24, end: 25 }])
})

test('propagateEdit returns infeasible and cycle failures unchanged', () => {
  // A start in a break is not a working start, like fixedStart.
  assert.deepEqual(propagateEdit(plan, { id: 'cut', start: 4 }), {
    ok: false, code: 'infeasible', taskId: 'cut', constraints: ['fixedStart', 'calendar'], dependencyIds: [],
  })
  // The predecessor still binds, and so do the task's own bounds.
  assert.deepEqual(propagateEdit(plan, { id: 'inspect', start: 1 }), {
    ok: false, code: 'infeasible', taskId: 'inspect', constraints: ['fixedStart'], dependencyIds: ['cut-inspect'],
  })
  assert.deepEqual(propagateEdit(plan, { id: 'other', start: 0 }).constraints, ['startNoEarlierThan', 'fixedStart'])
  // An existing fixed start is replaced.
  const fixed = { ...plan, tasks: [...plan.tasks.slice(0, 2), { id: 'other', duration: 2, fixedStart: 2 }] }
  assert.deepEqual(propagateEdit(fixed, { id: 'other', start: 6 }).changes, [{ id: 'other', before: { start: 2, end: 4 }, after: { start: 6, end: 8 } }])

  const cyclic = { ...plan, dependencies: [...plan.dependencies, { id: 'back', from: 'inspect', to: 'cut' }] }
  const cycle = propagateEdit(cyclic, { id: 'cut', start: 1 })
  assert.deepEqual(cycle, scheduleTasks(cyclic))
  assert.equal(cycle.code, 'cycle')

  // When only the unedited plan fails, there is nothing to compare with: its failure is returned.
  const late = {
    range: { start: 0, end: 10 },
    tasks: [{ id: 'a', duration: 4 }, { id: 'b', duration: 2, finishNoLaterThan: 5 }],
    dependencies: [{ id: 'ab', from: 'a', to: 'b' }],
  }
  assert.equal(scheduleTasks(late).ok, false)
  assert.deepEqual(propagateEdit(late, { id: 'a', start: 0, end: 2 }), scheduleTasks(late))
})

test('propagateEdit validates the edit and never mutates its input', () => {
  assert.throws(() => propagateEdit(plan, { id: 'nope', start: 0 }), { name: 'Error', message: 'Unknown task: nope' })
  assert.throws(() => propagateEdit({ ...plan, quantum: 2 }, { id: 'cut', start: 1 }), RangeError)
  assert.throws(() => propagateEdit(plan, { id: 'cut', start: 0.5 }), RangeError)
  assert.throws(() => propagateEdit(plan, { id: 'cut', start: 3, end: 2 }), RangeError)
  assert.throws(() => propagateEdit(plan, { id: 'cut' }), RangeError)
  const frozen = Object.freeze({
    ...plan,
    tasks: Object.freeze(plan.tasks.map(task => Object.freeze({ ...task }))),
    dependencies: Object.freeze(plan.dependencies.map(link => Object.freeze({ ...link }))),
  })
  const result = propagateEdit(frozen, { id: 'cut', start: 1, end: 6 })
  assert.equal(result.ok, true)
  assert.deepEqual(frozen.tasks[0], { id: 'cut', duration: 4 })
})
