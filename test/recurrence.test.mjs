import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  applyRecurringEdit, expandRecurrence, expandRecurringEvents, formatRecurrenceRule, parseRecurrenceRule, validateCalendarEvents,
} from '@eightkk/vue-weave/core'
import { EventCalendar } from '@eightkk/vue-weave'
import { renderComponent } from './helpers/ssr.mjs'
import { hour, day, utcText as utc } from './helpers/time.mjs'

const iso = time => new Date(time).toISOString().slice(0, 16)
const all = { start: utc('1970-01-01T00:00'), end: utc('2100-01-01T00:00') }
const starts = (series, range = all, options) => expandRecurrence(series, range, options).map(occurrence => iso(occurrence.start))

test('a weekly BYDAY rule keeps the local time across daylight-saving changes in New York and Berlin', () => {
  // New York springs forward on Sunday, March 8, 2026: 09:00 EST is 14:00 UTC, 09:00 EDT 13:00 UTC.
  const start = Date.parse('2026-03-02T09:00:00-05:00')
  const occurrences = expandRecurrence(
    { id: 'sync', start, end: start + hour, rule: 'FREQ=WEEKLY;BYDAY=MO,WE;COUNT=6', timeZone: 'America/New_York' }, all,
  )
  assert.deepEqual(occurrences.map(occurrence => [iso(occurrence.start), iso(occurrence.end)]), [
    ['2026-03-02T14:00', '2026-03-02T15:00'], ['2026-03-04T14:00', '2026-03-04T15:00'], ['2026-03-09T13:00', '2026-03-09T14:00'],
    ['2026-03-11T13:00', '2026-03-11T14:00'], ['2026-03-16T13:00', '2026-03-16T14:00'], ['2026-03-18T13:00', '2026-03-18T14:00'],
  ])
  assert.deepEqual(occurrences[2], { id: 'sync:' + utc('2026-03-09T13:00'), seriesId: 'sync', recurrenceId: utc('2026-03-09T13:00'), start: utc('2026-03-09T13:00'), end: utc('2026-03-09T14:00') })

  // Berlin falls back on Sunday, October 25, 2026: 09:00 CEST is 07:00 UTC, 09:00 CET 08:00 UTC. UNTIL is inclusive.
  const berlin = Date.parse('2026-10-19T09:00:00+02:00')
  assert.deepEqual(starts({ id: 'b', start: berlin, end: berlin + hour, rule: 'FREQ=WEEKLY;UNTIL=20261102T080000Z', timeZone: 'Europe/Berlin' }), [
    '2026-10-19T07:00', '2026-10-26T08:00', '2026-11-02T08:00',
  ])
  // The duration is kept in local time: 22:00 to 04:00 is 7 hours across the change and 6 hours the night after.
  const night = Date.parse('2026-10-24T22:00:00+02:00')
  const nights = expandRecurrence({ id: 'n', start: night, end: Date.parse('2026-10-25T04:00:00+01:00'), rule: 'FREQ=DAILY;COUNT=2', timeZone: 'Europe/Berlin' }, all)
  assert.deepEqual(nights.map(occurrence => (occurrence.end - occurrence.start) / hour), [7, 6])
})

test('skipped and repeated local times follow RFC 5545 section 3.3.5', () => {
  // 02:30 does not exist on March 8 in New York: it takes the offset before the gap (EST), so it is 07:30 UTC.
  const gap = Date.parse('2026-03-07T02:30:00-05:00')
  assert.deepEqual(starts({ id: 'g', start: gap, end: gap, rule: 'FREQ=DAILY;COUNT=3', timeZone: 'America/New_York' }), [
    '2026-03-07T07:30', '2026-03-08T07:30', '2026-03-09T06:30',
  ])
  // 01:30 exists twice on November 1: the first (EDT) occurrence is taken.
  const fold = Date.parse('2026-10-31T01:30:00-04:00')
  assert.deepEqual(starts({ id: 'f', start: fold, end: fold, rule: 'FREQ=DAILY;COUNT=3', timeZone: 'America/New_York' }), [
    '2026-10-31T05:30', '2026-11-01T05:30', '2026-11-02T06:30',
  ])
})

test('COUNT, UNTIL, INTERVAL and WKST', () => {
  const start = utc('2026-01-01T10:00')
  assert.deepEqual(starts({ id: 'a', start, end: start, rule: 'FREQ=DAILY;INTERVAL=2;COUNT=3' }), ['2026-01-01T10:00', '2026-01-03T10:00', '2026-01-05T10:00'])
  assert.deepEqual(starts({ id: 'a', start, end: start, rule: 'FREQ=DAILY;INTERVAL=2;UNTIL=20260107T100000Z' }), [
    '2026-01-01T10:00', '2026-01-03T10:00', '2026-01-05T10:00', '2026-01-07T10:00',
  ])
  // A date UNTIL includes its whole day.
  assert.deepEqual(starts({ id: 'a', start, end: start, rule: 'FREQ=DAILY;UNTIL=20260102' }), ['2026-01-01T10:00', '2026-01-02T10:00'])
  // RFC 5545 section 3.3.10: WKST changes which days share a two-week period.
  const tuesday = utc('1997-08-05T09:00')
  assert.deepEqual(starts({ id: 'w', start: tuesday, end: tuesday, rule: 'FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=MO' }), [
    '1997-08-05T09:00', '1997-08-10T09:00', '1997-08-19T09:00', '1997-08-24T09:00',
  ])
  assert.deepEqual(starts({ id: 'w', start: tuesday, end: tuesday, rule: 'FREQ=WEEKLY;INTERVAL=2;COUNT=4;BYDAY=TU,SU;WKST=SU' }), [
    '1997-08-05T09:00', '1997-08-17T09:00', '1997-08-19T09:00', '1997-08-31T09:00',
  ])
  // A rule object works like its text, and BYMONTH limits a daily rule.
  assert.deepEqual(starts({ id: 'o', start, end: start, rule: { frequency: 'daily', byMonth: [2], count: 2 } }), ['2026-01-01T10:00', '2026-02-01T10:00'])
})

test('monthly ordinals, BYSETPOS, short months and February 29', () => {
  const friday = utc('2026-01-30T10:00')
  assert.deepEqual(starts({ id: 'm', start: friday, end: friday, rule: 'FREQ=MONTHLY;BYDAY=-1FR;COUNT=4' }), [
    '2026-01-30T10:00', '2026-02-27T10:00', '2026-03-27T10:00', '2026-04-24T10:00',
  ])
  // The last weekday of the month.
  assert.deepEqual(starts({ id: 'm', start: friday, end: friday, rule: 'FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1;COUNT=4' }), [
    '2026-01-30T10:00', '2026-02-27T10:00', '2026-03-31T10:00', '2026-04-30T10:00',
  ])
  // The second Monday, and the second Monday of March in a yearly rule.
  const monday = utc('2026-01-12T08:00')
  assert.deepEqual(starts({ id: 'm', start: monday, end: monday, rule: 'FREQ=MONTHLY;BYDAY=2MO;COUNT=3' }), ['2026-01-12T08:00', '2026-02-09T08:00', '2026-03-09T08:00'])
  assert.deepEqual(starts({ id: 'y', start: monday, end: monday, rule: 'FREQ=YEARLY;BYMONTH=3;BYDAY=2MO;COUNT=2' }), ['2026-01-12T08:00', '2026-03-09T08:00'])
  // BYMONTHDAY=31 skips the months without a 31st; -1 is the last day of every month.
  const last = utc('2026-01-31T10:00')
  assert.deepEqual(starts({ id: 'd', start: last, end: last, rule: 'FREQ=MONTHLY;BYMONTHDAY=31;COUNT=4' }), [
    '2026-01-31T10:00', '2026-03-31T10:00', '2026-05-31T10:00', '2026-07-31T10:00',
  ])
  assert.deepEqual(starts({ id: 'd', start: last, end: last, rule: 'FREQ=MONTHLY;BYMONTHDAY=-1;COUNT=3' }), ['2026-01-31T10:00', '2026-02-28T10:00', '2026-03-31T10:00'])
  // A plain monthly rule on the 31st also skips short months.
  assert.deepEqual(starts({ id: 'd', start: last, end: last, rule: 'FREQ=MONTHLY;COUNT=3' }), ['2026-01-31T10:00', '2026-03-31T10:00', '2026-05-31T10:00'])
  // A yearly all-day event on February 29 repeats in leap years only.
  const leap = utc('2024-02-29T00:00')
  const leaps = expandRecurrence({ id: 'l', start: leap, end: leap + day, rule: 'FREQ=YEARLY;COUNT=3' }, all)
  assert.deepEqual(leaps.map(occurrence => [iso(occurrence.start), occurrence.end - occurrence.start]), [['2024-02-29T00:00', day], ['2028-02-29T00:00', day], ['2032-02-29T00:00', day]])
  // A rule that never matches stops after a Gregorian cycle and keeps the first instance.
  assert.deepEqual(starts({ id: 'n', start: leap, end: leap, rule: 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=30' }), ['2024-02-29T00:00'])
  assert.deepEqual(starts({ id: 'n', start: leap, end: leap, rule: 'FREQ=DAILY;BYMONTH=2;BYMONTHDAY=31' }), ['2024-02-29T00:00'])
})

test('EXDATE removes starts but counts towards COUNT, RDATE adds starts, and the range is half-open', () => {
  const start = utc('2026-01-01T10:00')
  const series = { id: 's', start, end: start + hour, rule: 'FREQ=DAILY;COUNT=5', exdates: [utc('2026-01-03T10:00')], rdates: [utc('2026-01-10T15:00'), utc('2026-01-02T10:00')] }
  const occurrences = expandRecurrence(series, all)
  assert.deepEqual(occurrences.map(occurrence => iso(occurrence.start)), ['2026-01-01T10:00', '2026-01-02T10:00', '2026-01-04T10:00', '2026-01-05T10:00', '2026-01-10T15:00'])
  assert.equal(occurrences.at(-1).end - occurrences.at(-1).start, hour)
  // Occurrences that overlap the range only; the one ending at range.start is outside, the one running into it inside.
  assert.deepEqual(starts(series, { start: utc('2026-01-02T11:00'), end: utc('2026-01-04T10:30') }), ['2026-01-04T10:00'])
  assert.deepEqual(starts(series, { start: utc('2026-01-02T10:30'), end: utc('2026-01-04T10:00') }), ['2026-01-02T10:00'])
  // An RDATE-only set.
  assert.deepEqual(starts({ id: 'r', start, end: start, rdates: [utc('2026-02-01T09:00')] }), ['2026-01-01T10:00', '2026-02-01T09:00'])
  // DTSTART is the first instance even with an UNTIL before it (RFC 5545 section 3.8.5.3); later instances are not.
  assert.deepEqual(starts({ id: 'u', start, end: start + hour, rule: 'FREQ=DAILY;UNTIL=20251231T000000Z', rdates: [utc('2026-01-03T10:00')] }), [
    '2026-01-01T10:00', '2026-01-03T10:00',
  ])
  assert.deepEqual(expandRecurringEvents([{ id: 'u', label: 'U', start, end: start + hour, recurrence: { rule: { frequency: 'weekly', until: start - 1 } } }], all)
    .map(event => event.id), ['u:' + start])
  // Without COUNT a range far after the start is reached without walking the instances before it.
  assert.deepEqual(starts({ id: 'f', start, end: start + hour, rule: 'FREQ=DAILY' }, { start: utc('2090-06-01T00:00'), end: utc('2090-06-03T00:00') }, { maxOccurrences: 5 }), [
    '2090-06-01T10:00', '2090-06-02T10:00',
  ])
})

test('maxOccurrences bounds the work and the result', () => {
  const start = utc('2026-01-01T10:00')
  assert.throws(() => expandRecurrence({ id: 'x', start, end: start, rule: 'FREQ=DAILY' }, { start, end: start + 30 * day }, { maxOccurrences: 10 }),
    { name: 'RangeError', message: 'The recurrence of event x has more than 10 occurrences (maxOccurrences)' })
  // With COUNT the instances before the range count too.
  assert.throws(() => expandRecurrence({ id: 'x', start, end: start, rule: 'FREQ=DAILY;COUNT=100' }, { start: start + 90 * day, end: start + 91 * day }, { maxOccurrences: 50 }), RangeError)
  assert.equal(expandRecurrence({ id: 'x', start, end: start, rule: 'FREQ=DAILY' }, { start, end: start + 30 * day }).length, 30)
  assert.throws(() => expandRecurrence({ id: 'x', start, end: start, rule: 'FREQ=DAILY' }, { start, end: start }), RangeError)
  assert.throws(() => expandRecurrence({ id: 'x', start, end: start, rule: 'FREQ=DAILY' }, all, { maxOccurrences: 0 }), RangeError)
  assert.throws(() => expandRecurrence({ id: '', start, end: start, rule: 'FREQ=DAILY' }, all), /Invalid event ID/)
  assert.throws(() => expandRecurrence({ id: 'x', start, end: start - 1, rule: 'FREQ=DAILY' }, all), RangeError)
  assert.throws(() => expandRecurrence({ id: 'x', start, end: start, rule: 'FREQ=DAILY', timeZone: 'Mars/Base' }, all), /Invalid time zone/)
})

test('parseRecurrenceRule reads RRULE text, formatRecurrenceRule writes it, and invalid rules throw', () => {
  assert.deepEqual(parseRecurrenceRule('RRULE:freq=monthly;interval=2;byday=2MO,-1fr;bymonth=1,7;bysetpos=1;wkst=su;count=4'), {
    frequency: 'monthly', interval: 2, count: 4, byWeekday: [{ weekday: 1, ordinal: 2 }, { weekday: 5, ordinal: -1 }], byMonth: [1, 7], bySetPosition: [1], weekStart: 0,
  })
  assert.deepEqual(parseRecurrenceRule('FREQ=YEARLY;BYMONTHDAY=-1,15;UNTIL=20261231T235959Z'), { frequency: 'yearly', until: utc('2026-12-31T23:59:59'), byMonthDay: [-1, 15] })
  // A floating or date UNTIL is read in the given zone; a date covers the whole local day.
  assert.equal(parseRecurrenceRule('FREQ=DAILY;UNTIL=20260701T090000', { timeZone: 'Europe/Berlin' }).until, utc('2026-07-01T07:00'))
  assert.equal(parseRecurrenceRule('FREQ=DAILY;UNTIL=20260701', { utcOffsetMinutes: 540 }).until, utc('2026-07-01T15:00') - 1)
  for (const text of ['FREQ=WEEKLY;INTERVAL=2;BYDAY=MO,WE,FR;UNTIL=20261231T235959Z', 'FREQ=MONTHLY;COUNT=10;BYMONTHDAY=-1', 'FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU;BYSETPOS=1;WKST=SU']) {
    const rule = parseRecurrenceRule(text)
    assert.deepEqual(parseRecurrenceRule(formatRecurrenceRule(rule)), rule)
  }
  assert.equal(formatRecurrenceRule({ frequency: 'weekly', until: utc('2026-12-31T23:00'), byWeekday: [{ weekday: 1 }] }, { timeZone: 'Asia/Tokyo', allDay: true }), 'FREQ=WEEKLY;UNTIL=20270101;BYDAY=MO')
  const errors = [
    ['FREQ=HOURLY', Error, /Unsupported recurrence frequency: HOURLY/],
    ['FREQ=DAILY;BYHOUR=9', Error, /Unsupported recurrence rule part: BYHOUR/],
    ['FREQ=YEARLY;BYWEEKNO=20', Error, /Unsupported recurrence rule part: BYWEEKNO/],
    ['FREQ=DAILY;X-NAME=1', Error, /Unknown recurrence rule part: X-NAME/],
    ['FREQ=FORTNIGHTLY', Error, /Unknown recurrence frequency/],
    ['COUNT=2', Error, /needs FREQ/],
    ['', Error, /must not be empty/],
    ['FREQ=DAILY;COUNT=2;COUNT=3', Error, /Repeated recurrence rule part: COUNT/],
    ['FREQ=DAILY;COUNT=2;UNTIL=20260101', Error, /both COUNT and UNTIL/],
    ['FREQ=WEEKLY;BYDAY=2MO', Error, /ordinal/],
    ['FREQ=WEEKLY;BYMONTHDAY=1', Error, /BYMONTHDAY cannot be used with FREQ=WEEKLY/],
    ['FREQ=DAILY;BYSETPOS=1', Error, /BYSETPOS needs/],
    ['FREQ=DAILY;INTERVAL=0', RangeError, /INTERVAL/],
    ['FREQ=DAILY;COUNT=1.5', RangeError, /COUNT/],
    ['FREQ=MONTHLY;BYMONTHDAY=32', RangeError, /BYMONTHDAY/],
    ['FREQ=YEARLY;BYMONTH=13', RangeError, /BYMONTH/],
    ['FREQ=WEEKLY;BYDAY=XX', RangeError, /BYDAY/],
    ['FREQ=DAILY;UNTIL=20260230', RangeError, /UNTIL/],
  ]
  for (const [text, type, message] of errors) assert.throws(() => parseRecurrenceRule(text), error => error.constructor === type && message.test(error.message), text)
  assert.throws(() => parseRecurrenceRule(42), /must be a string/)
  assert.throws(() => formatRecurrenceRule({ frequency: 'weekly', byWeekday: [{ weekday: 7 }] }), RangeError)
})

const weekly = utc('2026-11-02T09:00')
const meeting = { id: 'sync', label: 'Sync', start: weekly, end: weekly + hour, resourceId: 'atlas', recurrence: { rule: 'FREQ=WEEKLY;BYDAY=MO,WE;COUNT=6' } }
const november = { start: utc('2026-11-01T00:00'), end: utc('2026-12-01T00:00') }

test('expandRecurringEvents returns concrete events, with overrides in place of the occurrences they change', () => {
  const override = { id: 'sync:' + utc('2026-11-04T09:00'), label: 'Sync (moved)', start: utc('2026-11-05T14:00'), end: utc('2026-11-05T15:00'), seriesId: 'sync', recurrenceId: utc('2026-11-04T09:00') }
  const plain = { id: 'lunch', label: 'Lunch', start: utc('2026-11-03T12:00'), end: utc('2026-11-03T13:00') }
  const input = [plain, meeting, override]
  const expanded = expandRecurringEvents(input, november)
  assert.deepEqual(expanded.map(event => [event.id, iso(event.start)]), [
    ['lunch', '2026-11-03T12:00'],
    ['sync:' + utc('2026-11-02T09:00'), '2026-11-02T09:00'],
    ['sync:' + utc('2026-11-09T09:00'), '2026-11-09T09:00'],
    ['sync:' + utc('2026-11-11T09:00'), '2026-11-11T09:00'],
    ['sync:' + utc('2026-11-16T09:00'), '2026-11-16T09:00'],
    ['sync:' + utc('2026-11-18T09:00'), '2026-11-18T09:00'],
    [override.id, '2026-11-05T14:00'],
  ])
  assert.deepEqual(expanded[1], { id: 'sync:' + weekly, label: 'Sync', start: weekly, end: weekly + hour, resourceId: 'atlas', seriesId: 'sync', recurrenceId: weekly })
  assert.equal(input[1], meeting)
  assert.ok(meeting.recurrence)
  validateCalendarEvents(expanded)
  // The calendar zone applies to series without their own zone: 09:00 in Tokyo is 00:00 UTC.
  const tokyo = expandRecurringEvents([{ ...meeting, start: utc('2026-11-02T00:00'), end: utc('2026-11-02T01:00') }], november, { timeZone: 'Asia/Tokyo' })
  assert.equal(tokyo.length, 6)
  assert.throws(() => validateCalendarEvents([{ ...plain, seriesId: '' }]), /Invalid series ID/)
  assert.throws(() => validateCalendarEvents([{ ...plain, recurrenceId: Number.NaN }]), RangeError)
})

test('applyRecurringEdit changes one occurrence with an override and deletes it with an EXDATE', () => {
  const target = { seriesId: 'sync', recurrenceId: utc('2026-11-09T09:00') }
  const moved = applyRecurringEdit([meeting], target, { start: utc('2026-11-09T11:00'), end: utc('2026-11-09T12:30'), resourceId: 'lab' }, 'occurrence')
  assert.equal(moved.length, 2)
  assert.equal(moved[0], meeting)
  assert.deepEqual(moved[1], {
    id: 'sync:' + target.recurrenceId, label: 'Sync', start: utc('2026-11-09T11:00'), end: utc('2026-11-09T12:30'), resourceId: 'lab', seriesId: 'sync', recurrenceId: target.recurrenceId,
  })
  const expanded = expandRecurringEvents(moved, november)
  assert.deepEqual(expanded.filter(event => event.seriesId === 'sync' && event.recurrenceId === target.recurrenceId).map(event => iso(event.start)), ['2026-11-09T11:00'])
  // A second change of the same occurrence updates the override.
  const again = applyRecurringEdit(moved, target, { start: utc('2026-11-09T13:00'), end: utc('2026-11-09T14:00') }, 'occurrence')
  assert.equal(again.length, 2)
  assert.equal(iso(again[1].start), '2026-11-09T13:00')
  assert.equal(again[1].resourceId, 'lab')
  // Delete: the start becomes an EXDATE and the override goes away.
  const deleted = applyRecurringEdit(again, target, 'delete', 'occurrence')
  assert.deepEqual(deleted, [{ ...meeting, recurrence: { ...meeting.recurrence, exdates: [target.recurrenceId] } }])
  assert.equal(expandRecurringEvents(deleted, november).length, 5)
})

test('applyRecurringEdit splits a series for this and following occurrences', () => {
  // COUNT=6 from November 2: the 9th is the third instance, so the old series keeps 2 and the new one gets 4.
  const target = { seriesId: 'sync', recurrenceId: utc('2026-11-09T09:00') }
  const override = { id: 'later', label: 'Later', start: utc('2026-11-16T15:00'), end: utc('2026-11-16T16:00'), seriesId: 'sync', recurrenceId: utc('2026-11-16T09:00') }
  const split = applyRecurringEdit([meeting, override], target, { start: utc('2026-11-10T10:00'), end: utc('2026-11-10T10:30') }, 'following')
  assert.deepEqual(split.map(event => event.id), ['sync', 'sync:' + target.recurrenceId, 'later'])
  assert.equal(split[0].recurrence.rule, 'FREQ=WEEKLY;COUNT=2;BYDAY=MO,WE')
  // Moved by a day: Monday and Wednesday become Tuesday and Thursday, with the new time and duration.
  assert.equal(split[1].recurrence.rule, 'FREQ=WEEKLY;COUNT=4;BYDAY=TU,TH')
  assert.deepEqual(split[2], { ...override, seriesId: 'sync:' + target.recurrenceId, recurrenceId: utc('2026-11-17T10:00') })
  assert.deepEqual(expandRecurringEvents(split, november).map(event => [iso(event.start), (event.end - event.start) / 60_000]), [
    ['2026-11-02T09:00', 60], ['2026-11-04T09:00', 60], ['2026-11-10T10:00', 30], ['2026-11-12T10:00', 30], ['2026-11-19T10:00', 30], ['2026-11-16T15:00', 60],
  ])
  // Without COUNT the old series ends with UNTIL just before the occurrence; delete keeps only the earlier part.
  const daily = { id: 'd', label: 'Daily', start: utc('2026-11-02T08:00'), end: utc('2026-11-02T08:15'), recurrence: { rule: { frequency: 'daily' }, exdates: [utc('2026-11-03T08:00'), utc('2026-11-06T08:00')] } }
  const cut = applyRecurringEdit([daily], { seriesId: 'd', recurrenceId: utc('2026-11-05T08:00') }, 'delete', 'following')
  assert.deepEqual(cut, [{ ...daily, recurrence: { rule: { frequency: 'daily', until: utc('2026-11-05T08:00') - 1 }, exdates: [utc('2026-11-03T08:00')] } }])
  assert.deepEqual(expandRecurringEvents(cut, november).map(event => iso(event.start)), ['2026-11-02T08:00', '2026-11-04T08:00'])
  const later = applyRecurringEdit([daily], { seriesId: 'd', recurrenceId: utc('2026-11-05T08:00') }, { start: utc('2026-11-05T12:00'), end: utc('2026-11-05T12:15') }, 'following', { newSeriesId: 'd2' })
  assert.deepEqual(later[1].recurrence, { rule: { frequency: 'daily' }, exdates: [utc('2026-11-06T12:00')] })
  assert.deepEqual(expandRecurringEvents(later, { start: utc('2026-11-02T00:00'), end: utc('2026-11-08T00:00') }).map(event => iso(event.start)), [
    '2026-11-02T08:00', '2026-11-04T08:00', '2026-11-05T12:00', '2026-11-07T12:00',
  ])
})

test('applyRecurringEdit moves or deletes the whole series', () => {
  const override = { id: 'o', label: 'Sync', start: utc('2026-11-04T15:00'), end: utc('2026-11-04T16:00'), seriesId: 'sync', recurrenceId: utc('2026-11-04T09:00') }
  const target = { seriesId: 'sync', recurrenceId: utc('2026-11-09T09:00') }
  const series = { ...meeting, recurrence: { rule: { frequency: 'weekly', byWeekday: [{ weekday: 1 }, { weekday: 3 }], until: utc('2026-11-18T09:00') } } }
  const moved = applyRecurringEdit([series, override], target, { start: utc('2026-11-10T10:00'), end: utc('2026-11-10T12:00'), resourceId: 'lab' }, 'series')
  assert.deepEqual(moved[0], {
    ...series, start: utc('2026-11-03T10:00'), end: utc('2026-11-03T12:00'), resourceId: 'lab',
    recurrence: { rule: { frequency: 'weekly', byWeekday: [{ weekday: 2 }, { weekday: 4 }], until: utc('2026-11-19T10:00') } },
  })
  assert.deepEqual(moved[1], { ...override, recurrenceId: utc('2026-11-05T10:00') })
  assert.deepEqual(expandRecurringEvents(moved, november).map(event => iso(event.start)), [
    '2026-11-03T10:00', '2026-11-10T10:00', '2026-11-12T10:00', '2026-11-17T10:00', '2026-11-19T10:00', '2026-11-04T15:00',
  ])
  // Editing the first occurrence with the following scope is the same as the series scope.
  const first = { seriesId: 'sync', recurrenceId: weekly }
  const change = { start: weekly + hour, end: weekly + 2 * hour }
  assert.deepEqual(applyRecurringEdit([meeting], first, change, 'following'), applyRecurringEdit([meeting], first, change, 'series'))
  assert.deepEqual(applyRecurringEdit([meeting, override, { id: 'other', label: 'Other', start: 0, end: 0 }], target, 'delete', 'series').map(event => event.id), ['other'])
})

test('an override that a series edit moves takes the ID of its new occurrence, so IDs stay unique', () => {
  const start = utc('2026-11-02T09:00')
  const week = 7 * day
  let events = [{ id: 's', label: 'S', start, end: start + hour, recurrence: { rule: 'FREQ=WEEKLY;COUNT=4' } }]
  events = applyRecurringEdit(events, { seriesId: 's', recurrenceId: start + week }, { start: start + week + hour, end: start + week + 2 * hour }, 'occurrence')
  // The whole series moves a week later: the first occurrence now has the recurrenceId the override had.
  events = applyRecurringEdit(events, { seriesId: 's', recurrenceId: start }, { start: start + week, end: start + week + hour }, 'series')
  assert.deepEqual(events[1], {
    id: 's:' + (start + 2 * week), label: 'S', start: start + week + hour, end: start + week + 2 * hour, seriesId: 's', recurrenceId: start + 2 * week,
  })
  const expanded = expandRecurringEvents(events, november)
  assert.doesNotThrow(() => validateCalendarEvents(expanded))
  assert.deepEqual(expanded.map(event => event.id), ['s:' + (start + week), 's:' + (start + 3 * week), 's:' + (start + 4 * week), 's:' + (start + 2 * week)])
  // The occurrence whose ID the override had before can get an override of its own.
  const again = applyRecurringEdit(events, { seriesId: 's', recurrenceId: start + week }, { start: start + week + 2 * hour, end: start + week + 3 * hour }, 'occurrence')
  assert.doesNotThrow(() => validateCalendarEvents(expandRecurringEvents(again, november)))

  // `following` moves later overrides to the new series under its ID; an override with an ID of its own keeps it.
  const custom = { id: 'custom', label: 'C', start: start + 3 * week, end: start + 3 * week + hour, seriesId: 's', recurrenceId: start + 3 * week }
  const split = applyRecurringEdit([...events.slice(0, 1), custom, events[1]], { seriesId: 's', recurrenceId: start + 2 * week },
    { start: start + 2 * week + day, end: start + 2 * week + day + hour }, 'following', { newSeriesId: 'n' })
  assert.deepEqual(split.filter(event => event.seriesId !== undefined).map(event => [event.id, event.seriesId, event.recurrenceId]), [
    ['custom', 'n', start + 3 * week + day],
  ])
})

test('a moved override keeps its old ID when its new occurrence ID is taken, and the edit throws when neither ID is free', () => {
  const start = utc('2026-11-02T09:00')
  const week = 7 * day
  const unique = events => assert.doesNotThrow(() => validateCalendarEvents(expandRecurringEvents(events, november)))
  const series = { id: 's', label: 'S', start, end: start + hour, recurrence: { rule: 'FREQ=WEEKLY;COUNT=4' } }
  const override = { id: 's:' + (start + week), label: 'S', start: start + week + 2 * hour, end: start + week + 3 * hour, seriesId: 's', recurrenceId: start + week }
  // The series moves an hour later. An unrelated event already has the ID the override would take, and no occurrence
  // starts at the override's old recurrenceId any more, so it keeps its old ID.
  const other = { id: 's:' + (start + week + hour), label: 'Other', start: 0, end: hour }
  const moved = applyRecurringEdit([series, override, other], { seriesId: 's', recurrenceId: start }, { start: start + hour, end: start + 2 * hour }, 'series')
  assert.deepEqual(moved.map(event => [event.id, event.recurrenceId]), [['s', undefined], ['s:' + (start + week), start + week + hour], [other.id, undefined]])
  unique(moved)

  // `following` the same way: the later override would take the ID `n:<recurrenceId>` of the new series.
  const later = { ...override, id: 's:' + (start + 2 * week), start: start + 2 * week, end: start + 2 * week + hour, recurrenceId: start + 2 * week }
  const split = applyRecurringEdit([series, later, { ...other, id: 'n:' + (start + 2 * week + hour) }], { seriesId: 's', recurrenceId: start + week },
    { start: start + week + hour, end: start + week + 2 * hour }, 'following', { newSeriesId: 'n' })
  assert.deepEqual(split.map(event => [event.id, event.seriesId, event.recurrenceId]), [
    ['s', undefined, undefined], ['n', undefined, undefined], ['s:' + (start + 2 * week), 'n', start + 2 * week + hour], ['n:' + (start + 2 * week + hour), undefined, undefined],
  ])
  unique(split)

  // A two-instance series moved a week later: the override of the second instance would take an ID another event has,
  // and its old ID is the ID of the moved first occurrence, so no ID can be kept and the edit throws.
  const twice = { ...series, recurrence: { rule: 'FREQ=WEEKLY;COUNT=2' } }
  const taken = { ...other, id: 's:' + (start + 2 * week) }
  const weekLater = { start: start + week, end: start + week + hour }
  assert.throws(() => applyRecurringEdit([twice, override, taken], { seriesId: 's', recurrenceId: start }, weekLater, 'series'), /Duplicate event ID: s:/)
  // Without the other event the override takes its new ID, and the expansion has unique IDs.
  unique(applyRecurringEdit([twice, override], { seriesId: 's', recurrenceId: start }, weekLater, 'series'))

  // Two overrides on both sides of the end of daylight saving time move to the same occurrence of the next day: both
  // new IDs are the same, and the old ID of the first is the ID of the moved first occurrence, so the edit throws.
  const fold = Date.parse('2026-11-01T01:30:00-04:00')
  const daily = { id: 'd', label: 'D', start: fold - day, end: fold - day + hour, recurrence: { rule: 'FREQ=DAILY;COUNT=5', timeZone: 'America/New_York' } }
  const first = { id: 'd:' + fold, label: 'D', start: fold, end: fold + hour, seriesId: 'd', recurrenceId: fold }
  const second = { id: 'd:' + (fold + hour), label: 'D', start: fold + hour, end: fold + 2 * hour, seriesId: 'd', recurrenceId: fold + hour }
  assert.throws(() => applyRecurringEdit([daily, first, second], { seriesId: 'd', recurrenceId: fold - day }, { start: fold, end: fold + hour }, 'series'), /Duplicate event ID: d:/)
  // Moved a week, the old IDs are free: both overrides keep them.
  const shifted = applyRecurringEdit([daily, first, second], { seriesId: 'd', recurrenceId: fold - day }, { start: fold - day + week, end: fold - day + week + hour }, 'series')
  assert.deepEqual(shifted.map(event => event.id), ['d', 'd:' + fold, 'd:' + (fold + hour)])
  assert.equal(shifted[1].recurrenceId, shifted[2].recurrenceId)
})

test('applyRecurringEdit validates its input and never mutates it', () => {
  const events = Object.freeze([Object.freeze({ ...meeting })])
  const target = { seriesId: 'sync', recurrenceId: weekly }
  assert.throws(() => applyRecurringEdit(events, { seriesId: 'nope', recurrenceId: weekly }, 'delete', 'series'), /Unknown recurring event: nope/)
  assert.throws(() => applyRecurringEdit(events, target, 'delete', 'all'), /Unknown recurring edit scope: all/)
  assert.throws(() => applyRecurringEdit(events, target, { start: 2, end: 1 }, 'occurrence'), RangeError)
  assert.throws(() => applyRecurringEdit(events, { seriesId: 'sync', recurrenceId: Number.NaN }, 'delete', 'occurrence'), RangeError)
  assert.throws(() => applyRecurringEdit([...events, { id: 'sync:' + utc('2026-11-09T09:00'), label: 'x', start: 0, end: 0 }], { seriesId: 'sync', recurrenceId: utc('2026-11-09T09:00') }, { start: 0, end: 0 }, 'following'), /Duplicate event ID/)
  applyRecurringEdit(events, { seriesId: 'sync', recurrenceId: utc('2026-11-09T09:00') }, { start: 0, end: 0 }, 'following')
  assert.equal(events[0].recurrence.rule, meeting.recurrence.rule)
})

test('applyRecurringEdit splits a series at an occurrence that already has an override', () => {
  // "This event" first adds the override sync:<recurrenceId>; "this and following" then replaces it with a new series
  // whose default ID is that same ID.
  const target = { seriesId: 'sync', recurrenceId: utc('2026-11-09T09:00') }
  const once = applyRecurringEdit([meeting], target, { start: utc('2026-11-09T10:00'), end: utc('2026-11-09T11:00') }, 'occurrence')
  const split = applyRecurringEdit(once, target, { start: utc('2026-11-09T11:00'), end: utc('2026-11-09T12:00') }, 'following')
  assert.deepEqual(split.map(event => [event.id, event.recurrence?.rule]), [['sync', 'FREQ=WEEKLY;COUNT=2;BYDAY=MO,WE'], ['sync:' + target.recurrenceId, 'FREQ=WEEKLY;COUNT=4;BYDAY=MO,WE']])
  assert.deepEqual(expandRecurringEvents(split, november).map(event => iso(event.start)), [
    '2026-11-02T09:00', '2026-11-04T09:00', '2026-11-09T11:00', '2026-11-11T11:00', '2026-11-16T11:00', '2026-11-18T11:00',
  ])
  // An event that is not the dropped override still blocks the ID.
  assert.throws(() => applyRecurringEdit([...once, { id: 'x', label: 'x', start: 0, end: 0 }], target, { start: 0, end: 0 }, 'following', { newSeriesId: 'x' }), /Duplicate event ID: x/)
})

test('applyRecurringEdit splits at an RDATE without changing the pattern of the rule', () => {
  // Weekly on Thursdays (COUNT=4) with an extra Saturday: the Saturday is between the second and the third Thursday.
  const thursday = utc('2026-11-05T09:00'), saturday = utc('2026-11-14T09:00')
  const series = { id: 't', label: 'T', start: thursday, end: thursday + hour, recurrence: { rule: 'FREQ=WEEKLY;COUNT=4', rdates: [saturday] } }
  const target = { seriesId: 't', recurrenceId: saturday }
  const split = applyRecurringEdit([series], target, { start: utc('2026-11-14T11:00'), end: utc('2026-11-14T11:30') }, 'following', { newSeriesId: 't2' })
  assert.deepEqual(split[0].recurrence, { rule: 'FREQ=WEEKLY;COUNT=2', rdates: [] })
  // The new series starts at the next Thursday, moved by the same two hours, and the Saturday is one of its RDATEs.
  assert.deepEqual(split[1], {
    ...series, id: 't2', start: utc('2026-11-19T11:00'), end: utc('2026-11-19T11:30'), recurrence: { rule: 'FREQ=WEEKLY;COUNT=2', rdates: [utc('2026-11-14T11:00')] },
  })
  assert.deepEqual(expandRecurringEvents(split, november).map(event => [iso(event.start), iso(event.end)]), [
    ['2026-11-05T09:00', '2026-11-05T10:00'], ['2026-11-12T09:00', '2026-11-12T10:00'], ['2026-11-14T11:00', '2026-11-14T11:30'],
    ['2026-11-19T11:00', '2026-11-19T11:30'], ['2026-11-26T11:00', '2026-11-26T11:30'],
  ])
  // An RDATE after the last rule instance: the new series has no rule.
  const late = { ...series, recurrence: { rule: 'FREQ=WEEKLY;COUNT=2', rdates: [saturday] } }
  const tail = applyRecurringEdit([late], target, { start: saturday + hour, end: saturday + 2 * hour }, 'following', { newSeriesId: 't2' })
  assert.deepEqual(tail[1].recurrence, { rdates: [] })
  assert.deepEqual(expandRecurringEvents(tail, november).map(event => iso(event.start)), ['2026-11-05T09:00', '2026-11-12T09:00', '2026-11-14T10:00'])
  // A start that is neither a rule instance nor an RDATE is not an occurrence.
  assert.throws(() => applyRecurringEdit([series], { seriesId: 't', recurrenceId: utc('2026-11-13T09:00') }, 'delete', 'following'), /Event t has no occurrence at/)
})

test('applyRecurringEdit rejects moves to another day that would change the meaning of the rule', () => {
  const monday = utc('2026-11-09T09:00')
  const move = (rule, change, scope = 'series', start = monday) => applyRecurringEdit(
    [{ id: 's', label: 'S', start, end: start + hour, recurrence: { rule } }], { seriesId: 's', recurrenceId: start }, change, scope,
  )
  const nextDay = { start: monday + day, end: monday + day + hour }
  for (const rule of ['FREQ=MONTHLY;BYDAY=2MO', 'FREQ=MONTHLY;BYDAY=MO;BYSETPOS=2', 'FREQ=YEARLY;BYMONTH=11;BYDAY=2MO']) {
    assert.throws(() => move(rule, nextDay), /Event s cannot move to another day: its recurrence rule has (BYDAY ordinals|BYSETPOS)/, rule)
  }
  // The 31st does not exist in every month, so moving the 30th to the 31st (or the other way) is rejected too.
  const thirtieth = utc('2026-11-30T09:00')
  assert.throws(() => move('FREQ=MONTHLY;BYMONTHDAY=30', { start: thirtieth + day, end: thirtieth + day + hour }, 'series', thirtieth), /BYMONTHDAY/)
  // BYMONTH stays only while the occurrence stays in its month.
  assert.throws(() => move('FREQ=WEEKLY;BYMONTH=11', { start: thirtieth + day, end: thirtieth + day + hour }, 'series', thirtieth), /BYMONTH, and the occurrence moves to another month/)
  assert.equal(move('FREQ=WEEKLY;BYMONTH=11;BYDAY=MO', nextDay)[0].recurrence.rule, 'FREQ=WEEKLY;BYMONTH=11;BYDAY=TU')
  // A move within the day keeps such rules, and a plain BYMONTHDAY moves with the occurrence.
  assert.equal(move('FREQ=MONTHLY;BYDAY=2MO', { start: monday + 2 * hour, end: monday + 3 * hour })[0].recurrence.rule, 'FREQ=MONTHLY;BYDAY=2MO')
  assert.equal(move('FREQ=MONTHLY;BYMONTHDAY=9,20', nextDay)[0].recurrence.rule, 'FREQ=MONTHLY;BYMONTHDAY=10,21')
  // "This and following" checks the same.
  const later = utc('2026-12-14T09:00')
  assert.throws(() => applyRecurringEdit([{ id: 's', label: 'S', start: monday, end: monday + hour, recurrence: { rule: 'FREQ=MONTHLY;BYDAY=2MO' } }],
    { seriesId: 's', recurrenceId: later }, { start: later + day, end: later + day + hour }, 'following'), /BYDAY ordinals/)
})

test('rules that can never match return the first instance without walking a Gregorian cycle', () => {
  const start = utc('2026-01-31T10:00')
  const never = [
    'FREQ=DAILY;BYMONTH=2;BYMONTHDAY=30', 'FREQ=DAILY;BYMONTH=4,6,9,11;BYMONTHDAY=31,-31', 'FREQ=MONTHLY;BYMONTH=2,4', 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=-30',
    'FREQ=MONTHLY;BYDAY=6MO,-6FR', 'FREQ=DAILY;BYDAY=MO;BYSETPOS=2', 'FREQ=WEEKLY;BYDAY=MO;BYSETPOS=8,-8',
  ]
  const began = performance.now()
  for (let round = 0; round < 150; round++) {
    for (const rule of never) assert.deepEqual(starts({ id: 'n', start, end: start, rule }), ['2026-01-31T10:00'], rule)
  }
  // About a thousand expansions; walking 146,097 days each took over 100 ms per expansion.
  assert.ok(performance.now() - began < 10_000)
  // Rules that match rarely still match.
  const leap = utc('2024-02-29T00:00')
  assert.deepEqual(starts({ id: 'l', start: leap, end: leap, rule: 'FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29;COUNT=2' }), ['2024-02-29T00:00', '2028-02-29T00:00'])
  assert.deepEqual(starts({ id: 'f', start, end: start, rule: 'FREQ=MONTHLY;BYDAY=5FR;COUNT=2' }), ['2026-01-31T10:00', '2026-05-29T10:00'])
  assert.deepEqual(starts({ id: 'p', start, end: start, rule: 'FREQ=DAILY;BYDAY=MO;BYSETPOS=1;COUNT=2' }), ['2026-01-31T10:00', '2026-02-02T10:00'])
})

test('a weekly rule keeps the local time across the southern-hemisphere daylight-saving changes of Sydney', () => {
  // Sydney leaves daylight saving on Sunday, April 5, 2026 (+11:00 to +10:00) and starts it again on October 4.
  const april = Date.parse('2026-03-30T09:00:00+11:00')
  assert.deepEqual(starts({ id: 's', start: april, end: april + hour, rule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=3', timeZone: 'Australia/Sydney' }), [
    '2026-03-29T22:00', '2026-04-05T23:00', '2026-04-12T23:00',
  ])
  const october = Date.parse('2026-09-28T09:00:00+10:00')
  assert.deepEqual(starts({ id: 's', start: october, end: october + hour, rule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=3', timeZone: 'Australia/Sydney' }), [
    '2026-09-27T23:00', '2026-10-04T22:00', '2026-10-11T22:00',
  ])
})

test('maxOccurrences may equal the number of instances', () => {
  const start = utc('2026-01-01T10:00')
  assert.equal(expandRecurrence({ id: 'c', start, end: start, rule: 'FREQ=DAILY;COUNT=5' }, all, { maxOccurrences: 5 }).length, 5)
  assert.throws(() => expandRecurrence({ id: 'c', start, end: start, rule: 'FREQ=DAILY;COUNT=5' }, all, { maxOccurrences: 4 }), RangeError)
  const range = { start, end: start + 10 * day }
  assert.equal(expandRecurrence({ id: 'd', start, end: start, rule: 'FREQ=DAILY' }, range, { maxOccurrences: 10 }).length, 10)
  assert.throws(() => expandRecurrence({ id: 'd', start, end: start, rule: 'FREQ=DAILY' }, range, { maxOccurrences: 9 }), RangeError)
})

test('EventCalendar names occurrences of a recurring series and leaves other events unchanged', async () => {
  const events = expandRecurringEvents([meeting, { id: 'lunch', label: 'Lunch', start: utc('2026-11-03T12:00'), end: utc('2026-11-03T13:00') }], november)
  const html = await renderComponent(EventCalendar, { events, date: utc('2026-11-04T10:00') })
  assert.match(html, /aria-label="Sync, Mon, Nov 2 09:00–10:00, Recurring"/)
  assert.match(html, /aria-label="Lunch, Tue, Nov 3 12:00–13:00"/)
  assert.match(html, /vw-is-recurring/)
  const german = await renderComponent(EventCalendar, { events, date: utc('2026-11-04T10:00'), labels: { recurring: 'Serie' } })
  assert.match(german, /aria-label="Sync, Mon, Nov 2 09:00–10:00, Serie"/)
})
