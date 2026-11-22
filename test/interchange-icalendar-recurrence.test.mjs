import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyRecurringEdit, expandRecurrence, expandRecurringEvents, fromICalendar, toICalendar } from '@eightkk/vue-weave/core'
import { hour, utcText as utc } from './helpers/time.mjs'

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
    'BEGIN:VTIMEZONE', 'TZID:America/New_York', 'DTSTART:20250309T020000', 'TZOFFSETFROM:-0500', 'TZOFFSETTO:-0400', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU',
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

test('a series with utcOffsetMinutes is written with a fixed-offset TZID and keeps its local weekdays on reimport', () => {
  // Mondays at 08:00 at +09:00 are Sundays at 23:00 UTC, so a series written in UTC would come back on Sundays.
  const start = Date.parse('2026-11-02T08:00:00+09:00')
  const local = time => Date.parse(time + '+09:00')
  const event = {
    id: 'tokyo@example.com', summary: 'Weekly', start, end: start + hour,
    recurrence: { utcOffsetMinutes: 540, rule: 'FREQ=WEEKLY;BYDAY=MO;UNTIL=20261130', exdates: [local('2026-11-09T08:00:00')], rdates: [local('2026-11-11T08:00:00')] },
  }
  const ics = toICalendar([event], { timestamp: 0 })
  const lines = ics.split('\r\n')
  for (const line of [
    'BEGIN:VTIMEZONE', 'TZID:UTC+0900', 'TZOFFSETFROM:+0900', 'TZOFFSETTO:+0900', 'DTSTART;TZID=UTC+0900:20261102T080000', 'DTEND;TZID=UTC+0900:20261102T090000',
    'RRULE:FREQ=WEEKLY;UNTIL=20261130T145959Z;BYDAY=MO', 'EXDATE;TZID=UTC+0900:20261109T080000', 'RDATE;TZID=UTC+0900:20261111T080000',
  ]) assert.ok(lines.includes(line), line)
  // The reader takes the offset from the VTIMEZONE, whatever its own utcOffsetMinutes.
  const imported = fromICalendar(ics, { recurrence: 'series', utcOffsetMinutes: -300 })
  assert.deepEqual(imported.warnings, [])
  const again = imported.events[0]
  assert.deepEqual(again.recurrence, {
    utcOffsetMinutes: 540, rule: { frequency: 'weekly', until: local('2026-11-30T23:59:59'), byWeekday: [{ weekday: 1 }] },
    exdates: [local('2026-11-09T08:00:00')], rdates: [local('2026-11-11T08:00:00')],
  })
  const range = { start: utc('2026-10-01T00:00'), end: utc('2027-01-01T00:00') }
  const occurrences = expandRecurrence({ ...again.recurrence, id: again.id, start: again.start, end: again.end }, range)
  assert.deepEqual(occurrences, expandRecurrence({ ...event.recurrence, id: event.id, start: event.start, end: event.end }, range))
  assert.deepEqual(occurrences.map(occurrence => iso(occurrence.start)), ['2026-11-01T23:00', '2026-11-10T23:00', '2026-11-15T23:00', '2026-11-22T23:00', '2026-11-29T23:00'])
  // Negative and half-hour offsets; an offset of 0 is UTC.
  const newfoundland = toICalendar([{ ...event, recurrence: { utcOffsetMinutes: -210, rule: 'FREQ=DAILY;COUNT=2' } }], { timestamp: 0 })
  assert.match(newfoundland, /\r\nTZID:UTC-0330\r\n[^]*TZOFFSETTO:-0330\r\n[^]*DTSTART;TZID=UTC-0330:20261101T193000\r\n/)
  assert.equal(fromICalendar(newfoundland, { recurrence: 'series' }).events[0].recurrence.utcOffsetMinutes, -210)
  const zero = toICalendar([{ ...event, recurrence: { utcOffsetMinutes: 0, rule: 'FREQ=DAILY;COUNT=2' } }], { timestamp: 0 })
  assert.ok(!zero.includes('VTIMEZONE') && zero.includes('DTSTART:20261101T230000Z'))
  assert.throws(() => toICalendar([{ ...event, recurrence: { utcOffsetMinutes: 2000, rule: 'FREQ=DAILY' } }]), RangeError)
})

test('overrides of a series are written with its UID and a RECURRENCE-ID, and replace their occurrence on reimport', () => {
  const start = Date.parse('2026-11-02T09:00:00+01:00')
  const series = { id: 'sync@example.com', label: 'Sync', start, end: start + hour, recurrence: { timeZone: 'Europe/Berlin', rule: 'FREQ=WEEKLY;BYDAY=MO;COUNT=4' } }
  const target = { seriesId: series.id, recurrenceId: Date.parse('2026-11-09T09:00:00+01:00') }
  const edited = applyRecurringEdit([series], target, { start: Date.parse('2026-11-10T14:00:00+01:00'), end: Date.parse('2026-11-10T15:00:00+01:00') }, 'occurrence')
  const lonely = { id: 'lonely', summary: 'Lonely', start: utc('2026-11-03T12:00'), end: utc('2026-11-03T13:00'), seriesId: 'gone', recurrenceId: utc('2026-11-03T12:00') }
  const ics = toICalendar([...edited.map(({ label, ...event }) => ({ ...event, summary: label })), lonely], { timestamp: 0 })
  assert.ok(ics.includes([
    'BEGIN:VEVENT', 'UID:sync@example.com', 'DTSTAMP:19700101T000000Z', 'RECURRENCE-ID;TZID=Europe/Berlin:20261109T090000',
    'DTSTART;TZID=Europe/Berlin:20261110T140000', 'DTEND;TZID=Europe/Berlin:20261110T150000', 'SUMMARY:Sync', 'END:VEVENT',
  ].join('\r\n')))
  // An override whose series is not in the export is written as a plain event.
  assert.ok(ics.includes('UID:lonely\r\nDTSTAMP:19700101T000000Z\r\nDTSTART:20261103T120000Z\r\n'))

  const range = { start: utc('2026-11-01T00:00'), end: utc('2026-12-01T00:00') }
  const expanded = fromICalendar(ics, { recurrence: { range } })
  assert.deepEqual(expanded.warnings, [])
  assert.deepEqual(expanded.events.map(event => [event.id, iso(event.start)]), [
    ['sync@example.com:' + utc('2026-11-02T08:00'), '2026-11-02T08:00'],
    ['sync@example.com:' + utc('2026-11-16T08:00'), '2026-11-16T08:00'],
    ['sync@example.com:' + utc('2026-11-23T08:00'), '2026-11-23T08:00'],
    ['sync@example.com:' + target.recurrenceId, '2026-11-10T13:00'],
    ['lonely', '2026-11-03T12:00'],
  ])
  // As a series the override comes back with the ID <seriesId>:<recurrenceId> and expands the same way.
  const imported = fromICalendar(ics, { recurrence: 'series' }).events
  assert.deepEqual(imported[1], {
    id: 'sync@example.com:' + target.recurrenceId, summary: 'Sync', start: utc('2026-11-10T13:00'), end: utc('2026-11-10T14:00'), allDay: false,
    seriesId: series.id, recurrenceId: target.recurrenceId,
  })
  assert.deepEqual(
    expandRecurringEvents(imported.filter(event => event.id !== 'lonely'), range).map(event => [event.id, event.start, event.end]),
    expandRecurringEvents(edited, range).map(event => [event.id, event.start, event.end]),
  )
})

test('VTIMEZONE observances begin before the first event, also in the southern hemisphere', () => {
  const event = { id: 'sydney@example.com', summary: 'Sydney', start: utc('2026-01-05T00:00'), end: utc('2026-01-05T01:00'), recurrence: { timeZone: 'Australia/Sydney', rule: 'FREQ=WEEKLY' } }
  const lines = toICalendar([event], { timestamp: 0 }).split('\r\n')
  const zone = lines.slice(lines.indexOf('BEGIN:VTIMEZONE'), lines.indexOf('END:VTIMEZONE') + 1)
  assert.deepEqual(zone, [
    'BEGIN:VTIMEZONE', 'TZID:Australia/Sydney',
    'BEGIN:STANDARD', 'DTSTART:20250406T030000', 'TZOFFSETFROM:+1100', 'TZOFFSETTO:+1000', 'RRULE:FREQ=YEARLY;BYMONTH=4;BYDAY=1SU', 'END:STANDARD',
    'BEGIN:DAYLIGHT', 'DTSTART:20251005T020000', 'TZOFFSETFROM:+1000', 'TZOFFSETTO:+1100', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=1SU', 'END:DAYLIGHT',
    'END:VTIMEZONE',
  ])
  const first = lines.find(line => line.startsWith('DTSTART;TZID=Australia/Sydney:')).split(':')[1]
  assert.equal(first, '20260105T110000')
  for (const onset of zone.filter(line => line.startsWith('DTSTART:'))) assert.ok(onset.slice(8) <= first, onset)
  // The weekly series expands the same after a round trip across both changes of 2026.
  const range = { start: utc('2026-01-01T00:00'), end: utc('2027-01-01T00:00') }
  const again = fromICalendar(lines.join('\r\n'), { recurrence: 'series' }).events[0]
  assert.deepEqual(
    expandRecurrence({ ...again.recurrence, id: again.id, start: again.start, end: again.end }, range),
    expandRecurrence({ ...event.recurrence, id: event.id, start: event.start, end: event.end }, range),
  )
})
