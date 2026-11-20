import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calendarBands } from 'vue-weave/core'

const hour = 3_600_000
const day = 24 * hour

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
