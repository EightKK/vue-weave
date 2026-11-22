import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildWorkPeriods, calendarBands, editTimeRange, invertWorkPeriods, moveTimeRanges, normalizeWorkPeriods, scheduleTasks, timeTicks,
  validateTimelineData,
} from '@eightkk/vue-weave/core'
import { utc } from './helpers/time.mjs'

test('invertWorkPeriods accepts finite non-integer periods while normalizeWorkPeriods still needs integers', () => {
  const periods = [{ start: 1.25, end: 2.5 }, { start: 0.5, end: 1.25 }, { start: 3.75, end: 9 }]
  assert.deepEqual(invertWorkPeriods(periods, { start: 0, end: 4.5 }), [
    { start: 0, end: 0.5 }, { start: 2.5, end: 3.75 },
  ])
  assert.deepEqual(invertWorkPeriods([], { start: 0.1, end: 0.2 }), [{ start: 0.1, end: 0.2 }])
  assert.throws(() => invertWorkPeriods([{ start: 0, end: Infinity }], { start: 0, end: 1 }), RangeError)
  assert.throws(() => invertWorkPeriods([{ start: 1, end: 1 }], { start: 0, end: 2 }), RangeError)
  assert.throws(() => invertWorkPeriods([], { start: 1, end: 1 }), RangeError)
  assert.throws(() => invertWorkPeriods([], { start: 0, end: NaN }), RangeError)
  assert.throws(() => normalizeWorkPeriods(periods, { start: 0, end: 5 }), /integer/)
})

test('fixed UTC offsets share one limit of ±1080 minutes', () => {
  const range = { start: utc(2026, 11, 9), end: utc(2026, 11, 10) }
  const week = { weekly: [{ weekday: 1, startMinute: 0, endMinute: 60 }] }
  // UTC−17:00: Monday 00:00 local is Monday 17:00 UTC.
  assert.deepEqual(buildWorkPeriods(range, { ...week, utcOffsetMinutes: -1020 }), [
    { start: utc(2026, 11, 9, 17), end: utc(2026, 11, 9, 18) },
  ])
  assert.equal(buildWorkPeriods(range, { ...week, utcOffsetMinutes: 1080 }).length, 0)
  assert.equal(buildWorkPeriods(range, { ...week, utcOffsetMinutes: 840 }).length, 0)
  for (const utcOffsetMinutes of [1081, -1081, 1.5]) {
    assert.throws(() => buildWorkPeriods(range, { ...week, utcOffsetMinutes }), /between -1080 and 1080/)
    assert.throws(() => calendarBands(range, 'day', { utcOffsetMinutes }), /between -1080 and 1080/)
  }
  assert.equal(calendarBands(range, 'day', { utcOffsetMinutes: -1080 }).length, 2)
})

test('timeTicks throws instead of returning nothing when the window is too far from the anchor', () => {
  assert.throws(() => timeTicks({ start: 1e308, end: 1e308 }, 1, -1e308), /too far from the anchor/)
  assert.throws(() => timeTicks({ start: -1e308, end: 1e308 }, 1e-300), RangeError)
  assert.deepEqual(timeTicks({ start: 1e308, end: 1e308 }, 1e308), [1e308])
})

test('fractional steps snap without floating-point drift and integer steps are unchanged', () => {
  assert.deepEqual(timeTicks({ start: 0, end: 1 }, 0.1), [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1])
  assert.deepEqual(timeTicks({ start: 0, end: 0.5 }, 0.1, 0.05), [0.05, 0.15, 0.25, 0.35, 0.45])
  assert.deepEqual(timeTicks({ start: 1.2, end: 1.6 }, 0.2), [1.2, 1.4, 1.6])
  // A step without a short decimal form keeps plain arithmetic.
  assert.deepEqual(timeTicks({ start: 0, end: 1 }, 1 / 3), [0, 1 / 3, 2 / 3, 1])
  // Integer steps: bit-identical to anchor + k × step, also for a fractional anchor.
  for (const [window, step, anchor] of [[{ start: 0, end: 30 }, 7, 0.1], [{ start: -5.5, end: 99 }, 3, 0.3], [{ start: 1e15, end: 1e15 + 50 }, 10, 0]]) {
    const first = Math.ceil((window.start - anchor) / step), last = Math.floor((window.end - anchor) / step)
    assert.deepEqual(timeTicks(window, step, anchor), Array.from({ length: last - first + 1 }, (_, i) => anchor + (first + i) * step))
  }

  const bounds = { start: 0, end: 10 }
  assert.deepEqual(editTimeRange({ start: 0, end: 1 }, 'move', 0.3, 0.1, bounds), { start: 0.3, end: 1.3 })
  assert.deepEqual(editTimeRange({ start: 0.2, end: 0.7 }, 'move', 0.1, 0.1, bounds), { start: 0.3, end: 0.8 })
  assert.deepEqual(editTimeRange({ start: 0.1, end: 0.7 }, 'start', 0.21, 0.1, bounds), { start: 0.3, end: 0.7 })
  assert.deepEqual(editTimeRange({ start: 0.1, end: 0.7 }, 'end', -0.3, 0.1, bounds), { start: 0.1, end: 0.4 })
  // Clamped at the bounds and at the minimum duration.
  assert.deepEqual(editTimeRange({ start: 9.5, end: 9.8 }, 'move', 0.7, 0.1, bounds), { start: 9.7, end: 10 })
  assert.deepEqual(editTimeRange({ start: 0.1, end: 0.7 }, 'end', -5, 0.1, bounds, 0.2), { start: 0.1, end: 0.3 })
  // Round trip: moving forth and back restores the interval exactly.
  const moved = editTimeRange({ start: 0.7, end: 1.9 }, 'move', 0.3, 0.1, bounds)
  assert.deepEqual(editTimeRange(moved, 'move', -0.3, 0.1, bounds), { start: 0.7, end: 1.9 })
  // Integer steps keep plain arithmetic, including off-grid fractional starts.
  assert.deepEqual(editTimeRange({ start: 0.1, end: 0.3 }, 'move', 2.4, 2, { start: 0, end: 10 }), { start: 0.1 + 2, end: 0.1 + 2 + (0.3 - 0.1) })
  assert.deepEqual(editTimeRange({ start: 2, end: 5 }, 'end', 7.6, 3, { start: 0, end: 100 }), { start: 2, end: 14 })

  assert.deepEqual(moveTimeRanges([{ start: 0, end: 0.2 }, { start: 0.1, end: 0.4 }], 0.3, 0.1, bounds),
    [{ start: 0.3, end: 0.5 }, { start: 0.4, end: 0.7 }])
  assert.deepEqual(moveTimeRanges([{ start: 9.5, end: 9.9 }], 1, 0.1, bounds), [{ start: 9.6, end: 10 }])
  assert.deepEqual(moveTimeRanges([], 0.3, 0.1, bounds), [])
  assert.deepEqual(moveTimeRanges([{ start: 0.1, end: 0.3 }], 4, 2, bounds), [{ start: 0.1 + 4, end: 0.3 + 4 }])
})

test('validateTimelineData scopes ID uniqueness to each collection and rejects self-dependencies', () => {
  const rows = [{ id: 'x', label: 'Row' }]
  const bars = [{ id: 'x', rowId: 'x', label: 'Bar', start: 0, end: 1 }, { id: 'y', rowId: 'x', label: 'Other', start: 1, end: 2 }]
  // A row, a bar and a dependency may share an ID.
  assert.doesNotThrow(() => validateTimelineData(rows, bars, [{ id: 'x', from: 'x', to: 'y' }]))
  for (const type of [undefined, 'FS', 'SS', 'FF', 'SF']) {
    const dependencies = [{ id: 'xy', from: 'x', to: 'y' }, { id: 'loop', from: 'y', to: 'y', type }]
    assert.throws(() => validateTimelineData(rows, bars, dependencies), error =>
      error.constructor === Error && error.message === 'A dependency cannot link a bar to itself: loop on bar y')
  }
  // An unknown dependency type names the dependency.
  assert.throws(() => validateTimelineData(rows, bars, [{ id: 'xy', from: 'x', to: 'y', type: 'XX' }]),
    { name: 'Error', message: 'Invalid dependency type: xy' })
  // scheduleTasks takes its own links and still reports a self-link as a one-task cycle.
  assert.deepEqual(scheduleTasks({ range: { start: 0, end: 10 }, tasks: [{ id: 'x', duration: 2 }], dependencies: [{ id: 'self', from: 'x', to: 'x' }] }),
    { ok: false, code: 'cycle', cycles: [{ taskIds: ['x'], dependencyIds: ['self'] }] })
})
