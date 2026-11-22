import assert from 'node:assert/strict'
import { test } from 'node:test'
import { expandRecurrence, expandRecurringEvents, fromICalendar, toICalendar } from '@eightkk/vue-weave/core'

const hour = 3_600_000
const utc = text => Date.parse(text + 'Z')
const iso = time => new Date(time).toISOString().slice(0, 16)
const wrap = (...events) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', ...events.flat(), 'END:VCALENDAR', ''].join('\r\n')
const vevent = (...lines) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT']

// A weekly Berlin standup across the end of daylight saving time (October 25, 2026), with an EXDATE, an RDATE and a
// changed instance (RECURRENCE-ID), plus a floating daily event and a rule this reader does not expand.
const text = wrap(
  vevent(
    'UID:standup@example.com', 'DTSTART;TZID=Europe/Berlin:20261019T090000', 'DTEND;TZID=Europe/Berlin:20261019T091500',
    'RRULE:FREQ=WEEKLY;BYDAY=MO,TH;UNTIL=20261106T000000Z', 'EXDATE;TZID=Europe/Berlin:20261022T090000',
    'RDATE;TZID=Europe/Berlin:20261031T100000', 'SUMMARY:Standup',
  ),
  vevent(
    'UID:standup@example.com', 'RECURRENCE-ID;TZID=Europe/Berlin:20261029T090000', 'DTSTART;TZID=Europe/Berlin:20261029T113000',
    'DTEND;TZID=Europe/Berlin:20261029T120000', 'SUMMARY:Standup (late)',
  ),
  vevent('UID:floating@example.com', 'DTSTART:20261101T090000', 'DURATION:PT30M', 'RRULE:FREQ=DAILY;COUNT=2', 'SUMMARY:Floating'),
  vevent('UID:hourly@example.com', 'DTSTART:20261101T090000Z', 'RRULE:FREQ=DAILY;BYHOUR=9,17', 'SUMMARY:Twice a day'),
  vevent('UID:once@example.com', 'DTSTART:20261102T120000Z', 'DTEND:20261102T130000Z', 'SUMMARY:Once'),
)

test('fromICalendar keeps its default for recurring events: the first instance with a warning, changed instances skipped', () => {
  const plain = fromICalendar(text, { utcOffsetMinutes: 540 })
  assert.deepEqual(fromICalendar(text, { utcOffsetMinutes: 540, recurrence: 'first' }), plain)
  assert.deepEqual(plain.events.map(event => event.id), ['standup@example.com', 'floating@example.com', 'hourly@example.com', 'once@example.com'])
  assert.equal(plain.events[0].recurrenceRule, 'FREQ=WEEKLY;BYDAY=MO,TH;UNTIL=20261106T000000Z')
  assert.equal(plain.events[0].recurrence, undefined)
  assert.deepEqual(plain.warnings.map(warning => warning.code), ['recurrence', 'skipped-event', 'recurrence', 'recurrence'])
})

test("fromICalendar with recurrence: 'series' returns the parsed series and the changed instances", () => {
  const { events, warnings } = fromICalendar(text, { utcOffsetMinutes: 540, recurrence: 'series' })
  assert.deepEqual(events.map(event => event.id), ['standup@example.com', 'standup@example.com:' + utc('2026-10-29T08:00'), 'floating@example.com', 'hourly@example.com', 'once@example.com'])
  assert.deepEqual(events[0].recurrence, {
    timeZone: 'Europe/Berlin', rule: { frequency: 'weekly', until: utc('2026-11-06T00:00'), byWeekday: [{ weekday: 1 }, { weekday: 4 }] },
    exdates: [utc('2026-10-22T07:00')], rdates: [utc('2026-10-31T09:00')],
  })
  assert.deepEqual(events[1], {
    id: 'standup@example.com:' + utc('2026-10-29T08:00'), summary: 'Standup (late)', start: utc('2026-10-29T10:30'), end: utc('2026-10-29T11:00'),
    allDay: false, seriesId: 'standup@example.com', recurrenceId: utc('2026-10-29T08:00'),
  })
  // A floating series repeats at the import offset; a rule with BYHOUR is not expanded and keeps the default.
  assert.deepEqual(events[2].recurrence, { utcOffsetMinutes: 540, rule: { frequency: 'daily', count: 2 } })
  assert.equal(events[3].recurrence, undefined)
  assert.equal(events[4].recurrence, undefined)
  assert.deepEqual(warnings.map(warning => [warning.code, warning.eventId]), [['recurrence', 'hourly@example.com']])
  assert.match(warnings[0].message, /Unsupported recurrence rule part: BYHOUR/)
  // The series feed expandRecurringEvents directly, with the same result as the range option.
  const calendar = events.map(({ summary, ...event }) => ({ ...event, label: summary }))
  const range = { start: utc('2026-10-01T00:00'), end: utc('2026-12-01T00:00') }
  assert.deepEqual(
    expandRecurringEvents(calendar, range).map(event => [event.id, event.start, event.end]),
    fromICalendar(text, { utcOffsetMinutes: 540, recurrence: { range } }).events.map(event => [event.id, event.start, event.end]),
  )
})

test('fromICalendar with recurrence: { range } expands the series across a daylight-saving change', () => {
  const range = { start: utc('2026-10-01T00:00'), end: utc('2026-12-01T00:00') }
  const { events, warnings } = fromICalendar(text, { utcOffsetMinutes: 540, recurrence: { range } })
  assert.deepEqual(events.map(event => [event.id, iso(event.start), iso(event.end)]), [
    ['standup@example.com:' + utc('2026-10-19T07:00'), '2026-10-19T07:00', '2026-10-19T07:15'],
    ['standup@example.com:' + utc('2026-10-26T08:00'), '2026-10-26T08:00', '2026-10-26T08:15'],
    ['standup@example.com:' + utc('2026-10-31T09:00'), '2026-10-31T09:00', '2026-10-31T09:15'],
    ['standup@example.com:' + utc('2026-11-02T08:00'), '2026-11-02T08:00', '2026-11-02T08:15'],
    ['standup@example.com:' + utc('2026-11-05T08:00'), '2026-11-05T08:00', '2026-11-05T08:15'],
    ['standup@example.com:' + utc('2026-10-29T08:00'), '2026-10-29T10:30', '2026-10-29T11:00'],
    ['floating@example.com:' + utc('2026-11-01T00:00'), '2026-11-01T00:00', '2026-11-01T00:30'],
    ['floating@example.com:' + utc('2026-11-02T00:00'), '2026-11-02T00:00', '2026-11-02T00:30'],
    ['hourly@example.com', '2026-11-01T09:00', '2026-11-01T09:00'],
    ['once@example.com', '2026-11-02T12:00', '2026-11-02T13:00'],
  ])
  assert.deepEqual(events[1], {
    id: 'standup@example.com:' + utc('2026-10-26T08:00'), summary: 'Standup', start: utc('2026-10-26T08:00'), end: utc('2026-10-26T08:15'), allDay: false,
    recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO,TH;UNTIL=20261106T000000Z', seriesId: 'standup@example.com', recurrenceId: utc('2026-10-26T08:00'),
  })
  assert.deepEqual(warnings.map(warning => warning.code), ['recurrence'])
  // A narrower range keeps only the overlapping occurrences; the limit and the range are checked.
  const week = fromICalendar(text, { recurrence: { range: { start: utc('2026-10-26T00:00'), end: utc('2026-10-27T00:00') } } })
  assert.equal(week.events.filter(event => event.seriesId === 'standup@example.com' && event.recurrenceRule).length, 1)
  assert.throws(() => fromICalendar(text, { recurrence: { range, maxOccurrences: 2 } }), RangeError)
  assert.throws(() => fromICalendar(text, { recurrence: { range: { start: 1, end: 0 } } }), RangeError)
  assert.throws(() => fromICalendar(text, { recurrence: 'all' }), RangeError)
})

test('a changed instance with RANGE=THISANDFUTURE or an unreadable RECURRENCE-ID is skipped with a warning', () => {
  const file = wrap(
    vevent('UID:a', 'DTSTART:20261102T090000Z', 'RRULE:FREQ=DAILY;COUNT=3', 'SUMMARY:A'),
    vevent('UID:a', 'RECURRENCE-ID;RANGE=THISANDFUTURE:20261103T090000Z', 'DTSTART:20261103T100000Z', 'SUMMARY:A later'),
    vevent('UID:a', 'RECURRENCE-ID:soon', 'DTSTART:20261103T100000Z', 'SUMMARY:A broken'),
  )
  const { events, warnings } = fromICalendar(file, { recurrence: 'series' })
  assert.deepEqual(events.map(event => event.id), ['a'])
  assert.deepEqual(warnings.map(warning => warning.code), ['skipped-event', 'skipped-event'])
})

test('toICalendar writes RRULE, EXDATE and RDATE in the series zone with a VTIMEZONE, and they round-trip', () => {
  const start = Date.parse('2026-03-02T09:00:00-05:00')
  const events = [
    {
      id: 'weekly@example.com', summary: 'Weekly', start, end: start + hour,
      recurrence: {
        timeZone: 'America/New_York', rule: { frequency: 'weekly', byWeekday: [{ weekday: 1 }], until: utc('2026-06-01T00:00') },
        exdates: [Date.parse('2026-03-16T09:00:00-04:00')], rdates: [Date.parse('2026-03-19T15:00:00-04:00')],
      },
    },
    { id: 'monthly@example.com', summary: 'Monthly', start: utc('2026-01-31T12:00'), end: utc('2026-01-31T12:00'), recurrence: { rule: 'FREQ=MONTHLY;BYMONTHDAY=-1;COUNT=3' } },
    { id: 'tokyo@example.com', summary: 'Tokyo', start: utc('2026-01-05T00:00'), end: utc('2026-01-05T01:00'), recurrence: { timeZone: 'Asia/Tokyo', rule: 'FREQ=DAILY;COUNT=2' } },
    { id: 'plain@example.com', summary: 'Plain', start: utc('2026-01-05T00:00'), end: utc('2026-01-05T01:00') },
  ]
  const ics = toICalendar(events, { timestamp: 0 })
  const lines = ics.split('\r\n')
  for (const line of [
    'BEGIN:VTIMEZONE', 'TZID:America/New_York', 'DTSTART:20260308T020000', 'TZOFFSETFROM:-0500', 'TZOFFSETTO:-0400', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
    'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU', 'TZID:Asia/Tokyo', 'TZOFFSETTO:+0900',
    'DTSTART;TZID=America/New_York:20260302T090000', 'DTEND;TZID=America/New_York:20260302T100000', 'RRULE:FREQ=WEEKLY;UNTIL=20260601T000000Z;BYDAY=MO',
    'EXDATE;TZID=America/New_York:20260316T090000', 'RDATE;TZID=America/New_York:20260319T150000',
    'DTSTART:20260131T120000Z', 'RRULE:FREQ=MONTHLY;COUNT=3;BYMONTHDAY=-1', 'DTSTART;TZID=Asia/Tokyo:20260105T090000',
  ]) assert.ok(lines.includes(line), line)
  assert.equal(lines.filter(line => line === 'BEGIN:VTIMEZONE').length, 2)
  // The plain event is written as before.
  assert.ok(ics.includes('UID:plain@example.com\r\nDTSTAMP:19700101T000000Z\r\nDTSTART:20260105T000000Z\r\nDTEND:20260105T010000Z\r\nSUMMARY:Plain'))

  const imported = fromICalendar(ics, { recurrence: 'series' })
  assert.deepEqual(imported.warnings, [])
  assert.deepEqual(imported.events[0].recurrence, events[0].recurrence)
  assert.deepEqual(imported.events[1].recurrence, { timeZone: 'UTC', rule: { frequency: 'monthly', count: 3, byMonthDay: [-1] } })
  const range = { start: utc('2026-01-01T00:00'), end: utc('2026-07-01T00:00') }
  for (const [index, event] of events.entries()) {
    if (!event.recurrence) continue
    const again = imported.events[index]
    assert.deepEqual(
      expandRecurrence({ ...again.recurrence, id: again.id, start: again.start, end: again.end }, range),
      expandRecurrence({ ...event.recurrence, id: event.id, start: event.start, end: event.end }, range),
    )
  }
  assert.throws(() => toICalendar([{ ...events[0], recurrence: { rule: 'FREQ=HOURLY' } }]), /Unsupported recurrence frequency/)
  assert.throws(() => toICalendar([{ ...events[0], recurrence: { timeZone: 'Mars/Base', rule: 'FREQ=DAILY' } }]), RangeError)
})
