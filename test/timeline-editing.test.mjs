import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  calculateResourceLoad, calendarBands, dependencyEndsForType, dependencyTimes, dependencyTypeForEnds, intersectsWindow, moveTimeRanges,
  resourceLoadHistogram,
} from 'vue-weave/core'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { GanttChart } from 'vue-weave'
import { renderComponent } from './helpers/ssr.mjs'

const hour = 3_600_000
const day = 24 * hour

test('dependency types derive from joined bar ends and round-trip', () => {
  assert.equal(dependencyTypeForEnds('finish', 'start'), 'FS')
  assert.equal(dependencyTypeForEnds('start', 'start'), 'SS')
  assert.equal(dependencyTypeForEnds('finish', 'finish'), 'FF')
  assert.equal(dependencyTypeForEnds('start', 'finish'), 'SF')
  for (const type of ['FS', 'SS', 'FF', 'SF']) {
    const ends = dependencyEndsForType(type)
    assert.equal(dependencyTypeForEnds(ends.from, ends.to), type)
    // The ends agree with the endpoints used for drawing.
    const times = dependencyTimes({ start: 0, end: 10 }, { start: 20, end: 30 }, type)
    assert.equal(times.from, ends.from === 'start' ? 0 : 10)
    assert.equal(times.to, ends.to === 'start' ? 20 : 30)
  }
  assert.deepEqual(dependencyEndsForType(), { from: 'finish', to: 'start' })
  assert.throws(() => dependencyTypeForEnds('middle', 'start'), RangeError)
  assert.throws(() => dependencyEndsForType('XX'), /Invalid dependency type/)
})

test('group moves snap once and clamp to keep relative offsets inside bounds', () => {
  const bounds = { start: 0, end: 100 }
  const ranges = [{ start: 10, end: 30 }, { start: 50, end: 80 }, { start: 60, end: 60 }]
  const frozen = Object.freeze(ranges.map(range => Object.freeze({ ...range })))
  assert.deepEqual(moveTimeRanges(frozen, 12, 5, bounds), [{ start: 20, end: 40 }, { start: 60, end: 90 }, { start: 70, end: 70 }])
  // The last interval reaches the end first, so the whole group stops there.
  assert.deepEqual(moveTimeRanges(ranges, 50, 5, bounds), [{ start: 30, end: 50 }, { start: 70, end: 100 }, { start: 80, end: 80 }])
  assert.deepEqual(moveTimeRanges(ranges, -50, 5, bounds), [{ start: 0, end: 20 }, { start: 40, end: 70 }, { start: 50, end: 50 }])
  assert.deepEqual(moveTimeRanges(ranges, 2, 5, bounds), ranges)
  assert.deepEqual(moveTimeRanges([], 10, 5, bounds), [])
  assert.throws(() => moveTimeRanges([{ start: -1, end: 5 }], 5, 5, bounds), /editBounds/)
  assert.throws(() => moveTimeRanges(ranges, Number.NaN, 5, bounds), RangeError)
  assert.throws(() => moveTimeRanges(ranges, 5, 0, bounds), RangeError)
  assert.throws(() => moveTimeRanges([{ start: 5, end: 1 }], 5, 5, bounds), RangeError)
})

// Band boundaries strictly inside `within`; clipped band edges at the range ends are not boundaries.
function boundaries(range, unit, options, within) {
  return calendarBands(range, unit, options).slice(1).map(band => band.start)
    .filter(time => time > within.start && time < within.end)
}

function assertSameGrid(first, second, unit, options) {
  const overlap = { start: Math.max(first.start, second.start), end: Math.min(first.end, second.end) }
  const expected = boundaries(first, unit, options, overlap)
  assert.ok(expected.length > 1, 'the overlap contains several boundaries')
  assert.deepEqual(boundaries(second, unit, options, overlap), expected)
}

test('multi-week calendar bands follow a fixed grid whatever the range start', () => {
  const end = Date.parse('2025-06-01T00:00:00Z')
  const a = { start: Date.parse('2025-01-06T00:00:00Z'), end }
  const b = { start: Date.parse('2025-01-13T00:00:00Z'), end }
  const c = { start: Date.parse('2025-01-16T12:00:00Z'), end }
  for (const options of [{ step: 2 }, { step: 3 }, { step: 2, weekStartsOn: 0 }, { step: 4, utcOffsetMinutes: 9 * 60 }, { step: 2, utcOffsetMinutes: -300, weekStartsOn: 6 }]) {
    assertSameGrid(a, b, 'week', options)
    assertSameGrid(a, c, 'week', options)
    assertSameGrid(b, c, 'week', options)
  }
  // Week 0 contains 1970-01-01, so two-week Monday bands start on 2025-01-13, not on the range start 2025-01-06.
  const fortnights = calendarBands(a, 'week', { step: 2 })
  assert.deepEqual(fortnights.slice(0, 3).map(band => band.label), ['2024-12-30', '2025-01-13', '2025-01-27'])
  assert.equal(fortnights[0].start, a.start)
  assert.deepEqual(calendarBands(b, 'week', { step: 2 }).slice(0, 2).map(band => band.label), ['2025-01-13', '2025-01-27'])
  // Week starts stay on the requested weekday in the offset.
  for (const band of calendarBands(c, 'week', { step: 3, utcOffsetMinutes: 9 * 60, weekStartsOn: 3 }).slice(1)) {
    assert.equal(new Date(band.start + 9 * 3_600_000).getUTCDay(), 3)
    assert.equal((band.start + 9 * 3_600_000) % day, 0)
  }
})

test('multi-month and multi-year calendar bands follow a fixed grid, including steps that do not divide 12', () => {
  const end = Date.parse('2028-01-01T00:00:00Z')
  const a = { start: Date.parse('2025-06-15T00:00:00Z'), end }
  const b = { start: Date.parse('2026-02-01T00:00:00Z'), end }
  for (const options of [{ step: 5 }, { step: 7 }, { step: 5, utcOffsetMinutes: -8 * 60 }, { step: 3 }, { step: 6 }]) {
    assertSameGrid(a, b, 'month', options)
  }
  // Months are counted from 1970-01: 2025-01 is month 660, a multiple of 5.
  assert.deepEqual(calendarBands(b, 'month', { step: 5 }).slice(0, 3).map(band => band.label), ['2025-11', '2026-04', '2026-09'])
  const years = { start: Date.parse('2001-03-01T00:00:00Z'), end: Date.parse('2060-01-01T00:00:00Z') }
  assertSameGrid(years, { start: Date.parse('2017-07-01T00:00:00Z'), end: years.end }, 'year', { step: 7 })
  assert.deepEqual(calendarBands(years, 'year', { step: 25 }).map(band => band.label), ['2000', '2025', '2050'])
})

test('calendar bands keep years 0 to 99 literal', () => {
  const range = { start: Date.parse('0050-06-01T00:00:00Z'), end: Date.parse('0052-06-01T00:00:00Z') }
  const years = calendarBands(range, 'year')
  assert.deepEqual(years.map(band => band.label), ['0050', '0051', '0052'])
  assert.equal(years[1].start, Date.parse('0051-01-01T00:00:00Z'))
  const months = calendarBands({ start: Date.parse('0099-11-15T00:00:00Z'), end: Date.parse('0100-02-01T00:00:00Z') }, 'month')
  assert.deepEqual(months.map(band => band.label), ['0099-11', '0099-12', '0100-01'])
  assert.equal(months[1].start, Date.parse('0099-12-01T00:00:00Z'))
  const days = calendarBands({ start: Date.parse('0010-03-01T12:00:00Z'), end: Date.parse('0010-03-03T00:00:00Z') }, 'day')
  assert.deepEqual(days.map(band => band.label), ['0010-03-01', '0010-03-02'])
})

test('intersectsWindow keeps intervals half-open and counts milestones at either window edge', () => {
  const window = { start: 10, end: 20 }
  assert.equal(intersectsWindow({ start: 10, end: 10 }, window), true, 'milestone at the window start')
  assert.equal(intersectsWindow({ start: 20, end: 20 }, window), true, 'milestone at the window end')
  assert.equal(intersectsWindow({ start: 15, end: 15 }, window), true)
  assert.equal(intersectsWindow({ start: 9, end: 9 }, window), false)
  assert.equal(intersectsWindow({ start: 21, end: 21 }, window), false)
  assert.equal(intersectsWindow({ start: 5, end: 10 }, window), false, 'a bar ending at the window start')
  assert.equal(intersectsWindow({ start: 20, end: 25 }, window), false, 'a bar starting at the window end')
  assert.equal(intersectsWindow({ start: 5, end: 11 }, window), true)
  assert.equal(intersectsWindow({ start: 19, end: 25 }, window), true)
  assert.equal(intersectsWindow({ start: 0, end: 30 }, window), true)
  assert.equal(intersectsWindow({ start: 12, end: 18 }, window), true)
  // A point window still contains a milestone at the same time.
  assert.equal(intersectsWindow({ start: 10, end: 10 }, { start: 10, end: 10 }), true)
})

test('calendar bands align to a fixed offset, clip to the range and label unclipped units', () => {
  const offset = 9 * 60
  // 2026-11-09 08:00 JST to 2026-11-11 17:00 JST.
  const start = Date.parse('2026-11-09T08:00:00+09:00')
  const end = Date.parse('2026-11-11T17:00:00+09:00')
  const days = calendarBands({ start, end }, 'day', { utcOffsetMinutes: offset })
  assert.deepEqual(days.map(band => band.label), ['2026-11-09', '2026-11-10', '2026-11-11'])
  assert.equal(days[0].start, start)
  assert.equal(days[1].start, Date.parse('2026-11-10T00:00:00+09:00'))
  assert.equal(days.at(-1).end, end)
  for (let i = 1; i < days.length; i++) assert.equal(days[i].start, days[i - 1].end)

  const weeks = calendarBands({ start: Date.parse('2026-11-04T00:00:00Z'), end: Date.parse('2026-11-20T00:00:00Z') }, 'week')
  assert.deepEqual(weeks.map(band => band.label), ['2026-11-02', '2026-11-09', '2026-11-16'])
  const sundays = calendarBands({ start: Date.parse('2026-11-04T00:00:00Z'), end: Date.parse('2026-11-09T00:00:00Z') }, 'week', { weekStartsOn: 0 })
  assert.deepEqual(sundays.map(band => band.label), ['2026-11-01', '2026-11-08'])

  const months = calendarBands({ start: Date.parse('2026-11-15T00:00:00Z'), end: Date.parse('2027-02-02T00:00:00Z') }, 'month')
  assert.deepEqual(months.map(band => band.label), ['2026-11', '2026-12', '2027-01', '2027-02'])
  const quarters = calendarBands({ start: Date.parse('2026-02-01T00:00:00Z'), end: Date.parse('2026-08-01T00:00:00Z') }, 'month', { step: 3 })
  assert.deepEqual(quarters.map(band => band.label), ['2026-01', '2026-04', '2026-07'])
  assert.deepEqual(calendarBands({ start: Date.parse('2026-06-01T00:00:00Z'), end: Date.parse('2027-06-01T00:00:00Z') }, 'year').map(band => band.label), ['2026', '2027'])

  const shifts = calendarBands({ start, end: start + day }, 'hour', { utcOffsetMinutes: offset, step: 6 })
  assert.deepEqual(shifts.map(band => band.label), ['06:00', '12:00', '18:00', '00:00', '06:00'])
  const labelled = calendarBands({ start, end: start + 2 * day }, 'day', {
    utcOffsetMinutes: offset, label: (from, to) => String((to - from) / hour),
  })
  assert.deepEqual(labelled.map(band => band.label), ['24', '24', '24'])

  assert.throws(() => calendarBands({ start, end }, 'decade'), RangeError)
  assert.throws(() => calendarBands({ start, end }, 'day', { utcOffsetMinutes: 2000 }), RangeError)
  assert.throws(() => calendarBands({ start, end }, 'hour', { step: 5 }), RangeError)
  assert.throws(() => calendarBands({ start, end }, 'week', { weekStartsOn: 7 }), RangeError)
  assert.throws(() => calendarBands({ start: end, end: start }, 'day'), RangeError)
  assert.throws(() => calendarBands({ start: 0, end: 20000 * hour }, 'hour'), /Too many/)
})

test('load histograms group calculateResourceLoad output and validate references', () => {
  const range = { start: 0, end: 8 * hour }
  const tasks = [{ id: 'a', work: [{ start: 0, end: 4 * hour }] }, { id: 'b', work: [{ start: 2 * hour, end: 6 * hour }] }]
  const segments = calculateResourceLoad(range, tasks, [{ id: 'cnc', capacity: 1 }, { id: 'idle', capacity: 2 }],
    [{ resourceId: 'cnc', taskId: 'a' }, { resourceId: 'cnc', taskId: 'b' }])
  const histogram = resourceLoadHistogram([...segments].reverse(), ['cnc', 'idle', 'empty'])
  assert.deepEqual([...histogram.keys()], ['cnc', 'idle', 'empty'])
  const cnc = histogram.get('cnc')
  assert.equal(cnc.peak, 2)
  assert.deepEqual(cnc.segments.map(segment => [segment.start / hour, segment.end / hour, segment.load]), [[0, 2, 1], [2, 4, 2], [4, 6, 1], [6, 8, 0]])
  assert.equal(histogram.get('idle').peak, 2)
  assert.deepEqual(histogram.get('empty'), { segments: [], peak: 0 })
  assert.equal(resourceLoadHistogram(segments).size, 2)

  assert.throws(() => resourceLoadHistogram(segments, ['cnc']), /Unknown resource/)
  assert.throws(() => resourceLoadHistogram([{ resourceId: 'x', start: 0, end: 2, load: 1, capacity: 1 }, { resourceId: 'x', start: 1, end: 3, load: 1, capacity: 1 }]), /Overlapping/)
  assert.throws(() => resourceLoadHistogram([{ resourceId: 'x', start: 0, end: 2, load: -1, capacity: 1 }]), RangeError)
  assert.throws(() => resourceLoadHistogram([{ resourceId: 'x', start: 2, end: 2, load: 1, capacity: 1 }]), RangeError)
})

const rows = [{ id: 'r1', label: 'Row 1' }, { id: 'r2', label: 'Row 2' }]
const bars = [
  { id: 'a', rowId: 'r1', label: 'Alpha', start: hour, end: 3 * hour, editable: true },
  { id: 'b', rowId: 'r2', label: 'Beta', start: 4 * hour, end: 6 * hour, editable: true },
]
const base = {
  rows, bars, range: { start: 0, end: 8 * hour }, dependencies: [{ id: 'ab', from: 'a', to: 'b' }],
  connectable: true, reconnectable: true, multiSelect: true, rowDraggable: true, pinchZoom: true,
  selectedIds: new Set(['a']), selectedDependencyId: 'ab',
  zoomPresets: [{ id: 'day', label: 'Day', pixelsPerUnit: 40 / hour, tickSteps: [2 * hour], headerBands: [[{ start: 0, end: 8 * hour, label: 'Shift A' }]] }],
  zoomPreset: 'day',
  loadRows: [{ id: 'cnc', label: 'CNC cell' }],
  loadSegments: [
    { resourceId: 'cnc', start: 0, end: 2 * hour, load: 1, capacity: 1 },
    { resourceId: 'cnc', start: 2 * hour, end: 4 * hour, load: 2, capacity: 1, overload: 1 },
  ],
}

test('editing, preset, histogram and now-marker props render on the server without reading the clock', async () => {
  const html = await renderComponent(GanttChart, { ...base, showNow: true })
  assert.ok(!/NaN|Infinity/.test(html))
  assert.match(html, /aria-label="Start dependency from finish of Alpha"/)
  assert.match(html, /aria-label="Select dependency Alpha → Beta FS"/)
  assert.match(html, /aria-label="Reconnect target of Alpha → Beta FS"/)
  assert.match(html, /aria-label="Zoom level"/)
  assert.match(html, /aria-pressed="true"[^>]*>Day</)
  assert.match(html, /Shift A/)
  assert.match(html, /aria-label="CNC cell 02:00–04:00: load 2 \/ capacity 1, overloaded by 1"/)
  assert.match(html, /vw-pinch-zoom/)
  // Without an explicit time the clock is read only after mounting.
  assert.ok(!html.includes('vw-gantt-now'))
  const fixed = await renderComponent(GanttChart, { ...base, showNow: true, now: 5 * hour })
  assert.match(fixed, /vw-gantt-now/)
  assert.match(fixed, /title="Now 05:00"/)
  const hidden = await renderComponent(GanttChart, { ...base, now: 5 * hour })
  assert.ok(!hidden.includes('vw-gantt-now'))
})

test('invalid presets and load segments report validation-error and render the empty state', async () => {
  for (const [props, expected] of [
    [{ zoomPreset: 'missing' }, /Unknown zoom preset/],
    [{ zoomPresets: [{ id: 'x', label: 'X', pixelsPerUnit: 0 }], zoomPreset: undefined }, /pixelsPerUnit/],
    [{ loadSegments: [{ resourceId: 'other', start: 0, end: hour, load: 1, capacity: 1 }] }, /Unknown resource/],
    [{ loadRows: [{ id: 'cnc', label: 'A' }, { id: 'cnc', label: 'B' }] }, /duplicate load row/],
    [{ now: Number.NaN, showNow: true }, /now must be finite/],
  ]) {
    const reported = []
    const app = createSSRApp({ render: () => h(GanttChart, { ...base, ...props, onValidationError: error => reported.push(error) }) })
    app.config.errorHandler = () => {}
    const html = await renderToString(app)
    assert.equal(reported.length, 1)
    assert.match(reported[0].message, expected)
    assert.match(html, /No rows to display/)
  }
})
