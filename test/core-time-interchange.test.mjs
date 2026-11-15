import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  buildWorkPeriods, calculateResourceLoad, calendarBands, editTimeRange, invertWorkPeriods, moveTimeRanges, normalizeWorkPeriods,
  rescheduleFromStatusDate, scheduleTasks, timeTicks, timelineFromCsvTable, toICalendar, toMsProjectXml, validateTimelineData,
} from 'vue-weave/core'

/** The original algorithm: every segment copies the active set. */
function referenceLoad(range, tasks, resources, assignments) {
  const segments = []
  for (const resource of resources) {
    const events = new Map()
    const at = time => {
      let event = events.get(time)
      if (!event) events.set(time, event = { starts: [], ends: [] })
      return event
    }
    at(range.start)
    at(range.end)
    for (const period of normalizeWorkPeriods(resource.periods ?? [range], range)) {
      at(period.start).capacity = resource.capacity
      at(period.end).capacity = 0
    }
    for (const assignment of assignments.filter(item => item.resourceId === resource.id)) {
      const task = tasks.find(item => item.id === assignment.taskId)
      for (const period of normalizeWorkPeriods(task.work, range)) {
        at(period.start).starts.push({ taskId: task.id, units: assignment.units ?? 1 })
        at(period.end).ends.push({ taskId: task.id, units: assignment.units ?? 1 })
      }
    }
    const times = [...events.keys()].sort((a, b) => a - b)
    const active = new Set()
    let load = 0, capacity = 0
    for (let i = 0; i < times.length - 1; i++) {
      const event = events.get(times[i])
      for (const { taskId, units } of event.ends) {
        load -= units
        active.delete(taskId)
      }
      for (const { taskId, units } of event.starts) {
        load += units
        active.add(taskId)
      }
      capacity = event.capacity ?? capacity
      segments.push({ resourceId: resource.id, start: times[i], end: times[i + 1], load, capacity,
        overload: Math.max(0, load - capacity), taskIds: [...active] })
    }
  }
  return segments
}

test('calculateResourceLoad shares taskIds arrays between segments with the same tasks and keeps the output', () => {
  // 2,000 tasks on one shared daily calendar, starting in ten batches ten days apart, each with 200 work slices.
  const day = 24, tasks = []
  for (let i = 0; i < 2000; i++) {
    const first = 10 * Math.floor(i / 200)
    tasks.push({ id: 't' + i, work: Array.from({ length: 200 }, (_, k) => ({ start: (first + k) * day + 8, end: (first + k) * day + 16 })) })
  }
  const range = { start: 0, end: 310 * day }
  const resources = [{ id: 'crew', capacity: 500, periods: Array.from({ length: 310 }, (_, d) => ({ start: d * day + 6, end: d * day + 18 })) }]
  const assignments = tasks.map(task => ({ resourceId: 'crew', taskId: task.id }))
  const started = performance.now()
  const segments = calculateResourceLoad(range, tasks, resources, assignments)
  const elapsed = performance.now() - started
  const arrays = new Set(segments.map(segment => segment.taskIds))
  let stored = 0
  for (const ids of arrays) stored += ids.length
  // Copying the active set per segment stored 400,000 IDs in over 1,000 arrays; shared arrays store each set once.
  assert.ok(stored <= 25_000 && arrays.size <= 25, `stored ${stored} task IDs in ${arrays.size} arrays`)
  assert.ok(elapsed < 2000, `took ${elapsed} ms`)
  const busiest = segments.reduce((best, segment) => segment.load > best.load ? segment : best)
  assert.equal(busiest.taskIds.length, busiest.load)
  assert.deepEqual(segments, referenceLoad(range, tasks, resources, assignments))
})

test('calculateResourceLoad output equals the copying algorithm on irregular data, including order', () => {
  let seed = 7
  const random = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648
  for (let round = 0; round < 20; round++) {
    const tasks = Array.from({ length: 12 }, (_, i) => ({
      id: 'x' + i,
      work: Array.from({ length: 1 + Math.floor(random() * 6) }, () => {
        const start = Math.floor(random() * 90)
        return { start, end: start + 1 + Math.floor(random() * 10) }
      }),
    }))
    const resources = [
      { id: 'a', capacity: 3 },
      { id: 'b', capacity: 2, periods: [{ start: 10, end: 40 }, { start: 45, end: 80 }] },
    ]
    const assignments = tasks.flatMap((task, i) => [
      { resourceId: 'a', taskId: task.id, units: 1 + (i % 3) },
      ...(i % 2 ? [{ resourceId: 'b', taskId: task.id }] : []),
    ])
    // Periodic repeats reuse memoized states.
    tasks.push({ id: 'p', work: Array.from({ length: 9 }, (_, k) => ({ start: k * 10, end: k * 10 + 5 })) })
    assignments.push({ resourceId: 'a', taskId: 'p' })
    const range = { start: 0, end: 100 }
    assert.deepEqual(calculateResourceLoad(range, tasks, resources, assignments), referenceLoad(range, tasks, resources, assignments))
  }
})

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
  const range = { start: Date.UTC(2026, 10, 9), end: Date.UTC(2026, 10, 10) }
  const week = { weekly: [{ weekday: 1, startMinute: 0, endMinute: 60 }] }
  // UTC−17:00: Monday 00:00 local is Monday 17:00 UTC.
  assert.deepEqual(buildWorkPeriods(range, { ...week, utcOffsetMinutes: -1020 }), [
    { start: Date.UTC(2026, 10, 9, 17), end: Date.UTC(2026, 10, 9, 18) },
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
  // scheduleTasks takes its own links and still reports a self-link as a one-task cycle.
  assert.deepEqual(scheduleTasks({ range: { start: 0, end: 10 }, tasks: [{ id: 'x', duration: 2 }], dependencies: [{ id: 'self', from: 'x', to: 'x' }] }),
    { ok: false, code: 'cycle', cycles: [{ taskIds: ['x'], dependencyIds: ['self'] }] })
})

test('MSPDI and iCalendar round start and end to whole seconds and derive the duration from them', () => {
  const xml = toMsProjectXml({ name: 'P', tasks: [{ id: 'a', name: 'A', start: 0, end: 1500 }, { id: 'b', name: 'B', start: 400, end: 1400 }] })
  assert.match(xml, /<Start>1970-01-01T00:00:00<\/Start><Finish>1970-01-01T00:00:02<\/Finish><Duration>PT0H0M2S<\/Duration>/)
  assert.match(xml, /<Start>1970-01-01T00:00:00<\/Start><Finish>1970-01-01T00:00:01<\/Finish><Duration>PT0H0M1S<\/Duration>/)
  assert.match(xml, /<StartDate>1970-01-01T00:00:00<\/StartDate><FinishDate>1970-01-01T00:00:02<\/FinishDate>/)
  const late = toMsProjectXml({ name: 'P', tasks: [{ id: 'a', name: 'A', start: 999, end: 61_000 }] })
  assert.match(late, /<Start>1970-01-01T00:00:01<\/Start><Finish>1970-01-01T00:01:01<\/Finish><Duration>PT0H1M0S<\/Duration>/)

  const ics = events => toICalendar(events, { timestamp: 0 })
  // 500–900 ms rounds to one instant, so no DTEND equal to DTSTART is written.
  const instant = ics([{ id: 'e', summary: 'E', start: 500, end: 900 }])
  assert.match(instant, /DTSTART:19700101T000001Z\r\n/)
  assert.doesNotMatch(instant, /DTEND/)
  const span = ics([{ id: 'e', summary: 'E', start: 400, end: 1600 }])
  assert.match(span, /DTSTART:19700101T000000Z\r\nDTEND:19700101T000002Z\r\n/)
})

test('timelineFromCsvTable resolves header collisions predictably', () => {
  const options = { parseTime: Number }
  // Two custom headers with the same text are rejected.
  assert.throws(
    () => timelineFromCsvTable([['Name', 'Start', 'End'], ['Cut', '0', '5']], { ...options, headers: { row: 'Name', bar: ' name ' } }),
    /columns row and bar have the same header text: name/,
  )
  // A custom header wins over another column's default header, whatever the column order.
  const coded = timelineFromCsvTable([['Row', 'Bar', 'Start', 'End'], ['1', 'Cut', '0', '5']], { ...options, headers: { wbs: 'Row' } })
  assert.deepEqual(coded.rows, [{ id: 'row-1', label: '1' }])
  assert.throws(
    () => timelineFromCsvTable([['Row', 'Bar', 'End'], ['A', 'Cut', '5']], { ...options, headers: { start: 'End' } }),
    /end/i,
  )
  // Distinct custom headers, including swapped ones, still work.
  const swapped = timelineFromCsvTable([['WBS', 'Bar', 'Start', 'End'], ['Line A', 'Cut', '0', '5']], { ...options, headers: { row: 'WBS', wbs: 'Code' } })
  assert.deepEqual(swapped.rows, [{ id: 'row-1', label: 'Line A' }])
})

test('timelineFromCsvTable reads progress only in plain decimal notation', () => {
  const read = progress => timelineFromCsvTable([['Row', 'Bar', 'Start', 'End', 'Progress'], ['A', 'Cut', '0', '5', progress]], { parseTime: Number }).bars[0].progress
  assert.equal(read('0.25'), 0.25)
  assert.equal(read(' 1 '), 1)
  assert.equal(read('.5'), 0.5)
  assert.equal(read('1.'), 1)
  assert.equal(read('+0.5'), 0.5)
  assert.equal(read('0'), 0)
  for (const text of ['0x1', '0b1', '0o1', '1e0', '5e-1', 'Infinity', '-0', '1.5', '0.5.1', '½']) {
    assert.throws(() => read(text), /Progress must be a number from 0 to 1 on CSV line 2/, text)
  }
})

test('timelineFromCsvTable orders WBS parts beyond 2^53 exactly', () => {
  const big = '9007199254740992', bigger = '9007199254740993'
  const table = [['WBS', 'Bar', 'Start', 'End'], ['1.' + bigger, 'b', '0', '1'], ['1.' + big, 'a', '0', '1'], ['1.10', 'c', '0', '1'], ['1.9', 'd', '0', '1']]
  const { rows } = timelineFromCsvTable(table, { parseTime: Number })
  assert.deepEqual(rows.map(row => row.id), ['row-1', 'row-1.9', 'row-1.10', 'row-1.' + big, 'row-1.' + bigger])
})

test('interchange exports reject a missing required name or summary', () => {
  assert.throws(() => toMsProjectXml({ name: 'P', tasks: [{ id: 'a', start: 0, end: 1 }] }), /^Error: The name of task a is missing$/)
  assert.throws(() => toMsProjectXml({ tasks: [] }), /The project name is missing/)
  assert.throws(() => toICalendar([{ id: 'e', start: 0, end: 1 }], { timestamp: 0 }), /The summary of event e is missing/)
  assert.throws(() => toICalendar([{ id: 'e', summary: null, start: 0, end: 1 }], { timestamp: 0 }), /summary of event e is missing/)
  assert.match(toMsProjectXml({ name: '', tasks: [{ id: 'a', name: '', start: 0, end: 1000 }] }), /<Name><\/Name>/)
  assert.match(toICalendar([{ id: 'e', summary: '', start: 0, end: 1000 }], { timestamp: 0 }), /SUMMARY:\r\n/)
})

test('rescheduleFromStatusDate rejects progress that is not a map', () => {
  const input = { range: { start: 0, end: 40 }, tasks: [{ id: 'a', duration: 10 }] }
  assert.throws(() => rescheduleFromStatusDate(input, 5, { a: 0.5 }), /Progress must be a Map/)
  assert.throws(() => rescheduleFromStatusDate(input, 5, undefined), /Progress must be a Map/)
  assert.equal(rescheduleFromStatusDate(input, 5, new Map([['a', 0.5]])).ok, true)
})
