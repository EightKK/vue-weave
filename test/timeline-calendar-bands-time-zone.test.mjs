import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calendarBands } from 'vue-weave/core'
import { sha256Json } from './helpers/seeded.mjs'

const hour = 3_600_000
const day = 24 * hour
const at = text => Date.parse(text)
const range = (start, end) => ({ start: at(start), end: at(end) })
const hours = bands => bands.map(band => (band.end - band.start) / hour)
const labels = bands => bands.map(band => band.label)
const starts = bands => bands.map(band => new Date(band.start).toISOString())

test('calendarBands without timeZone returns the same bands as before time zones were supported', () => {
  // SHA-256 of these results computed with the implementation that had only utcOffsetMinutes.
  const out = []
  const ranges = [
    range('2025-03-28T13:17:05.250Z', '2025-04-02T07:00:00Z'),
    range('2025-10-20T00:00:00Z', '2025-11-03T00:00:00Z'),
    range('0099-12-30T22:00:00Z', '0100-01-02T00:00:00Z'),
    { start: -3 * day + 0.5, end: 4 * day },
  ]
  const steps = { hour: [1, 2, 3, 6, 24], day: [1, 3], week: [1, 2], month: [1, 5], year: [1, 25] }
  for (const base of ranges) {
    for (const unit of ['hour', 'day', 'week', 'month', 'year']) {
      const span = unit === 'hour' ? base : { start: base.start - (unit === 'year' ? 3000 : unit === 'month' ? 400 : 60) * day, end: base.end }
      for (const step of steps[unit]) {
        for (const utcOffsetMinutes of [undefined, 0, 90, -570, 1080, -1080]) {
          for (const weekStartsOn of unit === 'week' ? [undefined, 0, 3] : [undefined]) {
            out.push(calendarBands(span, unit, { utcOffsetMinutes, step, weekStartsOn }))
            out.push(calendarBands(span, unit, { utcOffsetMinutes, step, weekStartsOn, label: (start, end) => start + '/' + end }))
          }
        }
      }
    }
  }
  assert.equal(sha256Json(out), '8b91f3ce301664a4244d418b5f7f9a13cb29d462c45d3443b5ed8166d1039c0d')
})

test('calendarBands in a zone without daylight saving equals the matching fixed offset', () => {
  const span = range('2025-03-01T05:30:00Z', '2025-11-20T00:00:00Z')
  for (const [unit, step] of [['hour', 1], ['hour', 6], ['day', 1], ['day', 3], ['week', 2], ['month', 1], ['month', 5], ['year', 1]]) {
    const hourSpan = unit === 'hour' ? { start: span.start, end: span.start + 40 * day } : span
    assert.deepEqual(calendarBands(hourSpan, unit, { timeZone: 'UTC', step }), calendarBands(hourSpan, unit, { step }))
    // Etc/GMT-9 is UTC+9.
    assert.deepEqual(calendarBands(hourSpan, unit, { timeZone: 'Etc/GMT-9', step }), calendarBands(hourSpan, unit, { utcOffsetMinutes: 540, step }))
  }
})

test('calendarBands follows the Europe/Berlin daylight-saving transitions of 2025', () => {
  const timeZone = 'Europe/Berlin'
  // Spring: 2025-03-30 has 23 hours, 02:00 to 03:00 is skipped.
  const spring = calendarBands(range('2025-03-28T23:00:00Z', '2025-04-01T22:00:00Z'), 'day', { timeZone })
  assert.deepEqual(labels(spring), ['2025-03-29', '2025-03-30', '2025-03-31', '2025-04-01'])
  assert.deepEqual(hours(spring), [24, 23, 24, 24])
  assert.deepEqual(starts(spring).slice(1, 3), ['2025-03-29T23:00:00.000Z', '2025-03-30T22:00:00.000Z'])
  const springHours = calendarBands(range('2025-03-29T23:00:00Z', '2025-03-30T22:00:00Z'), 'hour', { timeZone })
  assert.equal(springHours.length, 23)
  assert.deepEqual(labels(springHours).slice(0, 4), ['00:00', '01:00', '03:00', '04:00'])
  assert.ok(hours(springHours).every(length => length === 1))
  // Autumn: 2025-10-26 has 25 hours, 02:00 to 03:00 occurs twice.
  const autumn = calendarBands(range('2025-10-24T22:00:00Z', '2025-10-27T23:00:00Z'), 'day', { timeZone })
  assert.deepEqual(labels(autumn), ['2025-10-25', '2025-10-26', '2025-10-27'])
  assert.deepEqual(hours(autumn), [24, 25, 24])
  const autumnHours = calendarBands(range('2025-10-25T22:00:00Z', '2025-10-26T23:00:00Z'), 'hour', { timeZone })
  assert.equal(autumnHours.length, 25)
  assert.deepEqual(labels(autumnHours).slice(0, 5), ['00:00', '01:00', '02:00', '02:00', '03:00'])
  assert.deepEqual(starts(autumnHours).slice(2, 4), ['2025-10-26T00:00:00.000Z', '2025-10-26T01:00:00.000Z'])
  assert.ok(hours(autumnHours).every(length => length === 1))
  // Multi-hour bands restart at local midnight: the first quarter of each transition day absorbs the change.
  const quarters = calendarBands(range('2025-10-25T22:00:00Z', '2025-10-26T23:00:00Z'), 'hour', { timeZone, step: 6 })
  assert.deepEqual(labels(quarters), ['00:00', '06:00', '12:00', '18:00'])
  assert.deepEqual(hours(quarters), [7, 6, 6, 6])
  const springQuarters = calendarBands(range('2025-03-29T23:00:00Z', '2025-03-30T22:00:00Z'), 'hour', { timeZone, step: 6 })
  assert.deepEqual(hours(springQuarters), [5, 6, 6, 6])
  // With step 2, each occurrence of a grid time starts a band: 02:00 starts two bands on the autumn day.
  const pairs = calendarBands(range('2025-10-25T22:00:00Z', '2025-10-26T05:00:00Z'), 'hour', { timeZone, step: 2 })
  assert.deepEqual(labels(pairs), ['00:00', '02:00', '02:00', '04:00'])
  assert.deepEqual(hours(pairs), [2, 1, 2, 2])
})

test('calendarBands passes local fields and the offset to the label callback', () => {
  const calls = []
  const bands = calendarBands(range('2025-10-26T00:00:00Z', '2025-10-26T02:00:00Z'), 'hour', {
    timeZone: 'Europe/Berlin',
    label: (start, end, local) => {
      calls.push([start, end, local])
      return `${String(local.hour).padStart(2, '0')}:00 UTC+${local.utcOffsetMinutes / 60}`
    },
  })
  assert.deepEqual(labels(bands), ['02:00 UTC+2', '02:00 UTC+1'])
  assert.deepEqual(calls[1], [at('2025-10-26T01:00:00Z'), at('2025-10-26T02:00:00Z'), {
    year: 2025, month: 10, day: 26, hour: 2, minute: 0, weekday: 0, utcOffsetMinutes: 60, timeZone: 'Europe/Berlin',
  }])
  // Fixed offsets pass the same fields, without a zone.
  const fixed = []
  calendarBands(range('2025-01-01T00:00:00Z', '2025-01-02T00:00:00Z'), 'day', { utcOffsetMinutes: -90, label: (start, end, local) => {
    fixed.push(local)
    return ''
  } })
  assert.deepEqual(fixed[0], { year: 2024, month: 12, day: 31, hour: 0, minute: 0, weekday: 2, utcOffsetMinutes: -90, timeZone: undefined })
})

test('calendarBands starts a day at 01:00 when America/Santiago skips midnight', () => {
  const timeZone = 'America/Santiago'
  // On 2022-09-11 clocks moved from 00:00 (UTC-4) to 01:00 (UTC-3).
  const days = calendarBands(range('2022-09-10T04:00:00Z', '2022-09-13T03:00:00Z'), 'day', { timeZone })
  assert.deepEqual(labels(days), ['2022-09-10', '2022-09-11', '2022-09-12'])
  assert.deepEqual(starts(days), ['2022-09-10T04:00:00.000Z', '2022-09-11T04:00:00.000Z', '2022-09-12T03:00:00.000Z'])
  assert.deepEqual(hours(days), [24, 23, 24])
  const locals = []
  calendarBands(range('2022-09-11T04:00:00Z', '2022-09-12T03:00:00Z'), 'day', { timeZone, label: (start, end, local) => {
    locals.push(local)
    return ''
  } })
  assert.equal(locals[0].day, 11)
  assert.equal(locals[0].hour, 1)
  const hourBands = calendarBands(range('2022-09-11T02:00:00Z', '2022-09-11T06:00:00Z'), 'hour', { timeZone })
  assert.deepEqual(labels(hourBands), ['22:00', '23:00', '01:00', '02:00'])
  // On 2022-04-03 clocks moved back from 00:00 (UTC-3) to 23:00 (UTC-4), so 2022-04-02 has 25 hours.
  const autumn = calendarBands(range('2022-04-02T03:00:00Z', '2022-04-04T04:00:00Z'), 'day', { timeZone })
  assert.deepEqual(hours(autumn), [25, 24])
  const lateHours = calendarBands(range('2022-04-03T01:00:00Z', '2022-04-03T04:00:00Z'), 'hour', { timeZone })
  assert.deepEqual(labels(lateHours), ['22:00', '23:00', '23:00'])
})

test('calendarBands follows the 30-minute daylight-saving shift of Australia/Lord_Howe', () => {
  const timeZone = 'Australia/Lord_Howe'
  // 2025-10-05 02:00 (UTC+10:30) became 02:30 (UTC+11): the 02:00 band starts at 02:30 and lasts 30 minutes.
  const spring = calendarBands(range('2025-10-04T14:30:00Z', '2025-10-04T17:00:00Z'), 'hour', { timeZone })
  assert.deepEqual(labels(spring), ['01:00', '02:30', '03:00'])
  assert.deepEqual(hours(spring), [1, 0.5, 1])
  // 2025-04-06 02:00 (UTC+11) became 01:30 (UTC+10:30): the 01:00 band lasts 90 minutes.
  const autumn = calendarBands(range('2025-04-05T14:00:00Z', '2025-04-05T17:30:00Z'), 'hour', { timeZone })
  assert.deepEqual(labels(autumn), ['01:00', '02:00', '03:00'])
  assert.deepEqual(hours(autumn), [1.5, 1, 1])
  const days = calendarBands(range('2025-10-03T13:30:00Z', '2025-10-06T13:00:00Z'), 'day', { timeZone })
  assert.deepEqual(hours(days), [24, 23.5, 24])
})

test('calendarBands leaves out the calendar day that Pacific/Apia skipped in December 2011', () => {
  const timeZone = 'Pacific/Apia'
  // 2011-12-29 24:00 (UTC-10) became 2011-12-31 00:00 (UTC+14); 2011-12-30 did not exist.
  const days = calendarBands(range('2011-12-28T10:00:00Z', '2012-01-01T10:00:00Z'), 'day', { timeZone })
  assert.deepEqual(labels(days), ['2011-12-28', '2011-12-29', '2011-12-31', '2012-01-01'])
  assert.deepEqual(hours(days), [24, 24, 24, 24])
  assert.equal(days[2].start, at('2011-12-30T10:00:00Z'))
  const hourBands = calendarBands(range('2011-12-30T08:00:00Z', '2011-12-30T12:00:00Z'), 'hour', { timeZone })
  assert.deepEqual(labels(hourBands), ['22:00', '23:00', '00:00', '01:00'])
  assert.deepEqual(starts(hourBands).slice(2), ['2011-12-30T10:00:00.000Z', '2011-12-30T11:00:00.000Z'])
  // Two-day bands keep the epoch grid: the band of 2011-12-30 and 2011-12-31 has only its second day.
  const pairs = calendarBands(range('2011-12-26T10:00:00Z', '2012-01-02T10:00:00Z'), 'day', { timeZone, step: 2 })
  assert.deepEqual(labels(pairs), ['2011-12-26', '2011-12-28', '2011-12-31', '2012-01-01'])
  assert.deepEqual(hours(pairs), [48, 48, 24, 48])
  const week = calendarBands(range('2011-12-25T10:00:00Z', '2012-01-01T10:00:00Z'), 'week', { timeZone })
  assert.deepEqual(labels(week), ['2011-12-19', '2011-12-26'])
  assert.deepEqual(hours(week), [24, 144])
})

test('calendarBands builds week, month and year bands at local starts', () => {
  const timeZone = 'Europe/Berlin'
  const weeks = calendarBands(range('2025-03-23T23:00:00Z', '2025-04-06T22:00:00Z'), 'week', { timeZone })
  assert.deepEqual(labels(weeks), ['2025-03-24', '2025-03-31'])
  assert.deepEqual(hours(weeks), [167, 168])
  const sundays = calendarBands(range('2025-10-19T00:00:00Z', '2025-11-02T00:00:00Z'), 'week', { timeZone, weekStartsOn: 0 })
  assert.deepEqual(starts(sundays).slice(1), ['2025-10-25T22:00:00.000Z', '2025-11-01T23:00:00.000Z'])
  const months = calendarBands(range('2025-01-01T00:00:00Z', '2026-01-01T00:00:00Z'), 'month', { timeZone })
  // 2025-01-01T00:00Z is 01:00 in Berlin, so the first band is January, clipped by an hour.
  assert.deepEqual(labels(months).slice(0, 4), ['2025-01', '2025-02', '2025-03', '2025-04'])
  assert.deepEqual(starts(months).slice(1, 4), ['2025-01-31T23:00:00.000Z', '2025-02-28T23:00:00.000Z', '2025-03-31T22:00:00.000Z'])
  // March loses and October gains the transition hour.
  assert.equal(hours(months)[2], 31 * 24 - 1)
  assert.equal(hours(months)[9], 31 * 24 + 1)
  assert.deepEqual(months.at(-1), { start: at('2025-12-31T23:00:00Z'), end: at('2026-01-01T00:00:00Z'), label: '2026-01' })
  const years = calendarBands(range('2024-06-01T00:00:00Z', '2026-06-01T00:00:00Z'), 'year', { timeZone: 'America/New_York' })
  assert.deepEqual(labels(years), ['2024', '2025', '2026'])
  assert.deepEqual(starts(years).slice(1), ['2025-01-01T05:00:00.000Z', '2026-01-01T05:00:00.000Z'])
})

test('calendarBands in a time zone keeps the multi-unit grid stable across overlapping ranges', () => {
  const end = at('2026-06-01T00:00:00Z')
  const sources = [at('2025-01-01T00:00:00Z'), at('2025-02-17T13:45:00Z'), at('2025-03-30T00:30:00Z'), at('2025-10-26T00:30:00Z')]
  const cases = [
    ['hour', { step: 6 }], ['hour', { step: 3 }], ['day', { step: 3 }], ['day', { step: 7 }],
    ['week', { step: 2 }], ['week', { step: 3, weekStartsOn: 0 }], ['month', { step: 5 }], ['month', { step: 2 }],
  ]
  for (const timeZone of ['Europe/Berlin', 'America/Santiago', 'Australia/Lord_Howe']) {
    for (const [unit, options] of cases) {
      // Boundaries with their labels, leaving out the first band, which is clipped at the range start.
      const grids = sources.map(start => calendarBands({ start, end }, unit, { ...options, timeZone }).slice(1)
        .map(band => band.start + ' ' + band.label))
      for (let i = 1; i < grids.length; i++) {
        const shared = grids[0].filter(boundary => Number(boundary.split(' ')[0]) > sources[i])
        assert.ok(shared.length > 1)
        assert.deepEqual(grids[i], shared, `${timeZone} ${unit} ${JSON.stringify(options)} from ${new Date(sources[i]).toISOString()}`)
      }
    }
  }
})

test('calendarBands builds multi-year hour bands in a time zone quickly', () => {
  const span = range('2020-01-01T00:00:00Z', '2026-01-01T00:00:00Z')
  const startedAt = performance.now()
  const locals = []
  const bands = calendarBands(span, 'hour', { timeZone: 'Europe/Berlin', step: 6, label: (start, end, local) => {
    locals.push(local)
    return ''
  } })
  const elapsed = performance.now() - startedAt
  // 2192 local days of four bands, plus the bands of 2019-12-31 that end in the range.
  assert.equal(bands.length, 2192 * 4 + 1)
  assert.ok(locals.every(local => local.hour % 6 === 0 && local.minute === 0))
  assert.ok(elapsed < 5000, `took ${elapsed} ms`)
  for (let i = 1; i < bands.length; i++) assert.equal(bands[i].start, bands[i - 1].end)
  // The band limit still applies.
  assert.throws(() => calendarBands(span, 'hour', { timeZone: 'Europe/Berlin' }), /Too many calendar bands/)
})

test('calendarBands validates timeZone', () => {
  const span = range('2025-01-01T00:00:00Z', '2025-01-02T00:00:00Z')
  assert.throws(() => calendarBands(span, 'day', { timeZone: 'Europe/Berlin', utcOffsetMinutes: 60 }), {
    name: 'RangeError', message: 'Specify either timeZone or utcOffsetMinutes, not both',
  })
  assert.throws(() => calendarBands(span, 'day', { timeZone: 'Mars/Olympus_Mons' }), { name: 'RangeError', message: 'Invalid time zone: Mars/Olympus_Mons' })
  assert.throws(() => calendarBands(span, 'day', { timeZone: '' }), RangeError)
  assert.throws(() => calendarBands({ start: 8.64e15 - day, end: 8.64e15 }, 'day', { timeZone: 'Europe/Berlin' }), {
    name: 'RangeError', message: 'Calendar bands exceed the supported date range',
  })
})
