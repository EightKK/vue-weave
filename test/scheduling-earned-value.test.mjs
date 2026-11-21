import assert from 'node:assert/strict'
import { test } from 'node:test'
import { computeEarnedValue, maxEarnedValuePoints, rollupEarnedValue } from '@eightkk/vue-weave/core'

const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 1e-9, `${message ?? ''} expected ${expected}, got ${actual}`)

test('computeEarnedValue derives PV, EV, AC and the indicators of a task from the standard formulas', () => {
  const result = computeEarnedValue([{ id: 'a', budget: 1000, start: 0, end: 10, progress: 0.4, actualCost: 500 }], { statusDate: 5 })
  const [task] = result.tasks
  assert.equal(task.id, 'a')
  assert.equal(task.bac, 1000)
  assert.equal(task.pv, 500)
  close(task.ev, 400)
  assert.equal(task.ac, 500)
  close(task.sv, -100)
  close(task.cv, -100)
  close(task.spi, 0.8)
  close(task.cpi, 0.8)
  // EAC = AC + (BAC − EV) / CPI = 500 + 600 / 0.8 = 1250, the same as BAC / CPI.
  close(task.etc, 750)
  close(task.eac, 1250)
  close(task.vac, -250)
  // TCPI = (BAC − EV) / (BAC − AC) = 600 / 500.
  close(task.tcpi, 1.2)
  close(task.percentComplete, 0.4)
  assert.equal(result.statusDate, 5)
  assert.equal(result.eacMethod, 'cpi')
  assert.deepEqual(result.series, [])
})

test('the EAC methods divide the remaining work by CPI, CPI × SPI or nothing', () => {
  const tasks = [{ id: 'a', budget: 1000, start: 0, end: 10, progress: 0.4, actualCost: 500 }]
  close(computeEarnedValue(tasks, { statusDate: 5, eacMethod: 'cpi-spi' }).tasks[0].eac, 500 + 600 / 0.64)
  const budget = computeEarnedValue(tasks, { statusDate: 5, eacMethod: 'budget' }).tasks[0]
  close(budget.eac, 1100)
  close(budget.etc, 600)
  close(budget.vac, -100)
  assert.throws(() => computeEarnedValue(tasks, { statusDate: 5, eacMethod: 'spi' }), { name: 'Error', message: 'Unknown EAC method: "spi" (use cpi, cpi-spi, budget)' })
})

test('totals sum the base values and derive budget-weighted indicators; rollupEarnedValue groups summary rows', () => {
  const tasks = [
    { id: 'a', budget: 100, start: 0, end: 10, progress: 1, actualCost: 120 },
    { id: 'b', budget: 300, start: 10, end: 20, progress: 0.5, actualCost: 100 },
    { id: 'c', budget: 600, start: 20, end: 30 },
  ]
  const result = computeEarnedValue(tasks, { statusDate: 20 })
  assert.deepEqual(result.tasks.map(task => task.pv), [100, 300, 0])
  const { totals } = result
  assert.equal(totals.bac, 1000)
  assert.equal(totals.pv, 400)
  assert.equal(totals.ev, 250)
  assert.equal(totals.ac, 220)
  close(totals.spi, 250 / 400)
  close(totals.cpi, 250 / 220)
  close(totals.eac, 220 + 750 / (250 / 220))
  assert.deepEqual(totals, rollupEarnedValue(result.tasks))
  const group = rollupEarnedValue(result.tasks.filter(task => task.id !== 'c'), { eacMethod: 'budget' })
  assert.equal(group.bac, 400)
  assert.equal(group.eac, 220 + 150)
  assert.deepEqual(rollupEarnedValue([]), { bac: 0, pv: 0, ev: 0, ac: 0, sv: 0, cv: 0, etc: 0, eac: 0, vac: 0 })
  assert.throws(() => rollupEarnedValue([{ bac: 1, pv: 0, ev: -1, ac: 0 }]), { name: 'RangeError', message: 'ev of earned value item 0 must be a finite number ≥ 0 (got -1)' })
  assert.throws(() => rollupEarnedValue('x'), { name: 'Error', message: 'Earned value items must be an array' })
})

test('a status date before the start gives no planned value and one after the end the whole budget', () => {
  const tasks = [{ id: 'a', budget: 800, start: 10, end: 20 }]
  const before = computeEarnedValue(tasks, { statusDate: 0 }).tasks[0]
  assert.equal(before.pv, 0)
  assert.equal(before.spi, undefined)
  assert.equal(before.cpi, undefined)
  assert.equal(before.sv, 0)
  // No cost yet: the remaining work is forecast at its budget.
  assert.equal(before.eac, 800)
  assert.equal(before.tcpi, 1)
  assert.equal(computeEarnedValue(tasks, { statusDate: 10 }).tasks[0].pv, 0)
  assert.equal(computeEarnedValue(tasks, { statusDate: 20 }).tasks[0].pv, 800)
  assert.equal(computeEarnedValue(tasks, { statusDate: 99 }).tasks[0].pv, 800)
})

test('ratios with a zero denominator are undefined, never NaN or Infinity', () => {
  const result = computeEarnedValue([
    { id: 'free', budget: 0, start: 0, end: 10, progress: 0.5 },
    { id: 'idle', budget: 100, start: 0, end: 10, progress: 0, actualCost: 50 },
    { id: 'over', budget: 100, start: 0, end: 10, progress: 0.5, actualCost: 150 },
    { id: 'done', budget: 100, start: 0, end: 10, progress: 1, actualCost: 100 },
  ], { statusDate: 5 })
  const [free, idle, over, done] = result.tasks
  assert.deepEqual(free, { id: 'free', bac: 0, pv: 0, ev: 0, ac: 0, sv: 0, cv: 0, etc: 0, eac: 0, vac: 0 })
  // CPI 0: the remaining work never completes at this efficiency, so EAC, ETC and VAC are undefined.
  assert.equal(idle.cpi, 0)
  assert.equal(idle.spi, 0)
  assert.equal('eac' in idle || 'etc' in idle || 'vac' in idle, false)
  close(idle.tcpi, 2)
  // The budget is spent: no TCPI.
  assert.equal(over.tcpi, undefined)
  close(over.eac, 150 + 50 / (50 / 150))
  // Nothing remains: ETC 0 and TCPI undefined (BAC − AC is 0).
  assert.equal(done.etc, 0)
  assert.equal(done.eac, 100)
  assert.equal(done.tcpi, undefined)
  for (const task of result.tasks) {
    for (const value of Object.values(task)) if (typeof value === 'number') assert.ok(Number.isFinite(value), task.id)
  }
})

test('a milestone accrues its whole budget at its start', () => {
  const tasks = [{ id: 'm', budget: 50, start: 10, end: 10 }]
  assert.equal(computeEarnedValue(tasks, { statusDate: 9 }).tasks[0].pv, 0)
  assert.equal(computeEarnedValue(tasks, { statusDate: 10 }).tasks[0].pv, 50)
  const { series } = computeEarnedValue(tasks, { statusDate: 0, series: { step: 5, start: 0, end: 15 } })
  assert.deepEqual(series.map(point => point.pv), [0, 0, 50, 50])
})

test('planned value accrues over the working time of the task calendar only', () => {
  // Working 0–4 and 6–10; the task spans 0–10, so it has 8 units of work.
  const calendars = [{ id: 'shifts', periods: [{ start: 6, end: 10 }, { start: 0, end: 4 }] }]
  const tasks = [
    { id: 'cal', budget: 80, start: 0, end: 10, calendarId: 'shifts' },
    { id: 'linear', budget: 80, start: 0, end: 10 },
  ]
  const pv = statusDate => computeEarnedValue(tasks, { statusDate, calendars }).tasks.map(task => task.pv)
  assert.deepEqual(pv(4), [40, 32])
  // Nothing accrues during the break.
  assert.deepEqual(pv(6), [40, 48])
  assert.deepEqual(pv(8), [60, 64])
  // The default calendar applies to tasks without calendarId.
  assert.deepEqual(computeEarnedValue(tasks, { statusDate: 5, calendars, defaultCalendarId: 'shifts' }).tasks.map(task => task.pv), [40, 40])
  // Planned dates without working time accrue over elapsed time.
  const night = computeEarnedValue([{ id: 'n', budget: 10, start: 4, end: 6, calendarId: 'shifts' }], { statusDate: 5, calendars })
  assert.equal(night.tasks[0].pv, 5)
})

test('the series has PV at every point and EV and AC up to the status date from the history', () => {
  const tasks = [
    {
      id: 'a', budget: 100, start: 0, end: 10, actualCost: 90,
      history: [{ time: 2, progress: 0.2, actualCost: 25 }, { time: 5, progress: 0.5 }, { time: 7, progress: 0.6, actualCost: 70 }],
    },
    { id: 'b', budget: 100, start: 10, end: 20, progress: 0.1, actualCost: 5 },
  ]
  const result = computeEarnedValue(tasks, { statusDate: 8, series: { step: 4 } })
  // Progress defaults to the last history record; the status date is inserted as a point.
  assert.equal(result.tasks[0].ev, 60)
  assert.equal(result.tasks[0].ac, 90)
  assert.deepEqual(result.series.map(point => point.time), [0, 4, 8, 12, 16, 20])
  assert.deepEqual(result.series.map(point => point.pv), [0, 40, 80, 120, 160, 200])
  assert.deepEqual(result.series.map(point => point.ev), [0, 20, 70, undefined, undefined, undefined])
  assert.deepEqual(result.series.map(point => point.ac), [0, 25, 95, undefined, undefined, undefined])
  assert.equal('ev' in result.series[3], false)
  // The status-date values replace a history record at the status date.
  const inserted = computeEarnedValue(tasks, { statusDate: 7, series: { step: 4, start: 0, end: 10 } }).series
  assert.deepEqual(inserted.map(point => point.time), [0, 4, 7, 8, 10])
  assert.deepEqual(inserted.map(point => point.ev), [0, 20, 70, undefined, undefined])
  assert.deepEqual(inserted.map(point => point.ac), [0, 25, 95, undefined, undefined])
  assert.deepEqual(computeEarnedValue([], { statusDate: 0, series: { step: 1 } }).series, [])
  assert.throws(() => computeEarnedValue(tasks, { statusDate: 8, series: { step: 1e-9 } }), {
    name: 'RangeError', message: `The series would have more than ${maxEarnedValuePoints} points; use a larger series.step (got 1e-9)`,
  })
})

test('computeEarnedValue validates its input with descriptive errors', () => {
  const task = { id: 'a', budget: 10, start: 0, end: 10 }
  const fails = (tasks, options, name, message) => assert.throws(() => computeEarnedValue(tasks, options), { name, message })
  fails('a', { statusDate: 0 }, 'Error', 'Earned value tasks must be an array')
  fails([task], undefined, 'Error', 'Earned value options must be an object with a statusDate')
  fails([task], { statusDate: NaN }, 'RangeError', 'statusDate must be a finite number (got NaN)')
  fails([task, task], { statusDate: 0 }, 'Error', 'Duplicate task ID: a')
  fails([{ ...task, id: '' }], { statusDate: 0 }, 'Error', 'Invalid task ID: ""')
  fails([{ ...task, budget: -1 }], { statusDate: 0 }, 'RangeError', 'Budget of task a must be a finite number ≥ 0 (got -1)')
  fails([{ ...task, end: -1 }], { statusDate: 0 }, 'RangeError', 'Planned dates of task a must be finite with end ≥ start (got 0–-1)')
  fails([{ ...task, progress: 40 }], { statusDate: 0 }, 'RangeError', 'Progress must be between zero and one: a')
  fails([{ ...task, actualCost: Infinity }], { statusDate: 0 }, 'RangeError', 'Actual cost must be a finite number ≥ 0: a (got Infinity)')
  fails([{ ...task, calendarId: 'x' }], { statusDate: 0 }, 'Error', 'Unknown calendar: x (task a)')
  fails([task], { statusDate: 0, defaultCalendarId: 'x' }, 'Error', 'Unknown calendar: x')
  fails([task], { statusDate: 0, calendars: [{ id: 'c', periods: [{ start: 2, end: 2 }] }] }, 'RangeError',
    'Working periods must have finite endpoints and positive length (calendar c)')
  fails([task], { statusDate: 0, calendars: [{ id: 'c', periods: [] }, { id: 'c', periods: [] }] }, 'Error', 'Duplicate calendar ID: c')
  fails([{ ...task, history: {} }], { statusDate: 5 }, 'Error', 'History must be an array: a')
  fails([{ ...task, history: [{ time: 6, progress: 0 }] }], { statusDate: 5 }, 'RangeError',
    'History times of task a must be finite, strictly increasing and not after the status date (got 6)')
  fails([{ ...task, history: [{ time: 2, progress: 0 }, { time: 2, progress: 0.1 }] }], { statusDate: 5 }, 'RangeError',
    'History times of task a must be finite, strictly increasing and not after the status date (got 2)')
  fails([{ ...task, history: [{ time: 2, progress: 2 }] }], { statusDate: 5 }, 'RangeError', 'Progress must be between zero and one: a (history)')
  fails([task], { statusDate: 0, series: { step: 0 } }, 'RangeError', 'series.step must be a finite number > 0 (got 0)')
  fails([task], { statusDate: 0, series: { step: 1, start: 5, end: 1 } }, 'RangeError', 'series.end must be ≥ series.start (got 5–1)')
})

test('computeEarnedValue does not modify its arguments', () => {
  const tasks = [
    { id: 'a', budget: 100, start: 0, end: 10, progress: 0.5, actualCost: 40, calendarId: 'c', history: [{ time: 1, progress: 0.1, actualCost: 5 }] },
    { id: 'b', budget: 100, start: 5, end: 5 },
  ]
  const options = { statusDate: 4, calendars: [{ id: 'c', periods: [{ start: 5, end: 10 }, { start: 0, end: 3 }] }], series: { step: 2 } }
  const before = structuredClone({ tasks, options })
  const result = computeEarnedValue(tasks, options)
  assert.deepEqual({ tasks, options }, before)
  assert.equal(result.tasks[0].pv, 37.5)
})
