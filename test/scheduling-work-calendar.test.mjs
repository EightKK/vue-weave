import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildWorkPeriods } from '@eightkk/vue-weave/core'
import { hour, utcText as utc } from './helpers/time.mjs'

const range = (start, end) => ({ start: utc(start), end: utc(end) })
const period = (start, end) => ({ start: utc(start), end: utc(end) })
const everyDay = (startMinute, endMinute) => [0, 1, 2, 3, 4, 5, 6].map(weekday => ({ weekday, startMinute, endMinute }))

test('America/New_York spring-forward shortens shifts and skips wall times in the gap', () => {
  // 2026-03-08 02:00 EST jumps to 03:00 EDT (07:00Z).
  const periods = buildWorkPeriods(range('2026-03-07T00:00', '2026-03-10T00:00'), {
    timeZone: 'America/New_York',
    weekly: [
      { weekday: 6, startMinute: 22 * 60, endMinute: 30 * 60 },
      { weekday: 0, startMinute: 2 * 60, endMinute: 2 * 60 + 30 },
      { weekday: 0, startMinute: 9 * 60, endMinute: 17 * 60 },
      { weekday: 1, startMinute: 2 * 60 + 30, endMinute: 4 * 60 },
    ],
  })
  assert.deepEqual(periods, [
    period('2026-03-08T03:00', '2026-03-08T10:00'),
    period('2026-03-08T13:00', '2026-03-08T21:00'),
    period('2026-03-09T06:30', '2026-03-09T08:00'),
  ])
  assert.equal(periods[0].end - periods[0].start, 7 * hour)
  const gap = buildWorkPeriods(range('2026-03-08T00:00', '2026-03-09T00:00'), {
    timeZone: 'America/New_York', weekly: [{ weekday: 0, startMinute: 2 * 60 + 30, endMinute: 4 * 60 }],
  })
  assert.deepEqual(gap, [period('2026-03-08T07:00', '2026-03-08T08:00')])
})

test('America/New_York fall-back lengthens shifts and resolves repeated wall times to the earlier instant', () => {
  // 2026-11-01 02:00 EDT falls back to 01:00 EST (06:00Z).
  const periods = buildWorkPeriods(range('2026-10-31T12:00', '2026-11-02T12:00'), {
    timeZone: 'America/New_York',
    weekly: [{ weekday: 6, startMinute: 22 * 60, endMinute: 30 * 60 }, { weekday: 0, startMinute: 90, endMinute: 150 }],
  })
  assert.deepEqual(periods, [period('2026-11-01T02:00', '2026-11-01T11:00')])
  const repeated = buildWorkPeriods(range('2026-11-01T00:00', '2026-11-02T00:00'), {
    timeZone: 'America/New_York', weekly: [{ weekday: 0, startMinute: 90, endMinute: 150 }],
  })
  assert.deepEqual(repeated, [period('2026-11-01T05:30', '2026-11-01T07:30')])
})

test('Europe/Berlin day shifts follow both transitions and date overrides use local dates', () => {
  const spring = buildWorkPeriods(range('2026-03-28T00:00', '2026-03-31T00:00'), {
    timeZone: 'Europe/Berlin', weekly: everyDay(8 * 60, 16 * 60), exceptions: { '2026-03-29': [] },
  })
  assert.deepEqual(spring, [
    period('2026-03-28T07:00', '2026-03-28T15:00'),
    period('2026-03-30T06:00', '2026-03-30T14:00'),
  ])
  const autumn = buildWorkPeriods(range('2026-10-24T00:00', '2026-10-27T00:00'), {
    timeZone: 'Europe/Berlin', weekly: [...everyDay(8 * 60, 16 * 60), { weekday: 6, startMinute: 22 * 60, endMinute: 30 * 60 }],
  })
  assert.deepEqual(autumn, [
    period('2026-10-24T06:00', '2026-10-24T14:00'),
    period('2026-10-24T20:00', '2026-10-25T05:00'),
    period('2026-10-25T07:00', '2026-10-25T15:00'),
    period('2026-10-26T07:00', '2026-10-26T15:00'),
  ])
})

test('zones without transitions match the fixed-offset calendar', () => {
  const week = {
    weekly: [{ weekday: 1, startMinute: 21 * 60, endMinute: 26 * 60 }, { weekday: 3, startMinute: 8 * 60, endMinute: 12 * 60 }],
    exceptions: { '2026-11-10': [] },
  }
  const span = range('2026-11-01T00:00', '2026-11-20T00:00')
  assert.deepEqual(buildWorkPeriods(span, { ...week, timeZone: 'Asia/Tokyo' }), buildWorkPeriods(span, { ...week, utcOffsetMinutes: 540 }))
  assert.deepEqual(buildWorkPeriods(span, { ...week, timeZone: 'UTC' }), buildWorkPeriods(span, week))
  const tokyo = buildWorkPeriods(range('2026-11-09T00:00', '2026-11-10T00:00'), {
    timeZone: 'Asia/Tokyo', weekly: [{ weekday: 1, startMinute: 9 * 60, endMinute: 17 * 60 }],
  })
  assert.deepEqual(tokyo, [period('2026-11-09T00:00', '2026-11-09T08:00')])
})

test('time-zone calendars validate the zone and are deterministic', () => {
  const span = range('2026-03-01T00:00', '2026-04-01T00:00')
  const week = { timeZone: 'America/New_York', weekly: everyDay(60, 180) }
  assert.deepEqual(buildWorkPeriods(span, week), buildWorkPeriods(span, { ...week }))
  assert.throws(() => buildWorkPeriods(span, { weekly: [], timeZone: 'Mars/Olympus_Mons' }), RangeError)
  assert.throws(() => buildWorkPeriods(span, { weekly: [], timeZone: '' }), RangeError)
  assert.throws(() => buildWorkPeriods(span, { weekly: [], timeZone: 'UTC', utcOffsetMinutes: 0 }), /either/)
  assert.throws(() => buildWorkPeriods(range('2026-01-01T00:00', '2037-01-10T00:00'), week), /3,661/)
})

test('fixed-offset calendars are not subject to the time-zone horizon margin', () => {
  const day = 86_400_000, max = 8.64e15
  assert.deepEqual(buildWorkPeriods({ start: max - 3 * day, end: max - day }, { weekly: [] }), [])
  assert.throws(() => buildWorkPeriods({ start: max - 3 * day, end: max - day }, { weekly: [], timeZone: 'UTC' }), /horizon/)
})
