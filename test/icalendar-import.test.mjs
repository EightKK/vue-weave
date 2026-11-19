import assert from 'node:assert/strict'
import { test } from 'node:test'
import { fromICalendar, timelineFromICalendar, toICalendar, validateTimelineData } from 'vue-weave/core'

const hour = 3_600_000
const day = 24 * hour
const wrap = (...events) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//test//EN', ...events.flat(), 'END:VCALENDAR', ''].join('\r\n')
const vevent = (...lines) => ['BEGIN:VEVENT', ...lines, 'END:VEVENT']

test('toICalendar output round-trips through fromICalendar, including escaping, folding and unicode', () => {
  const events = [
    { id: 'a@example.com', summary: 'Kick-off; "plan", part 1\\2', start: Date.parse('2026-11-09T08:00:00Z'), end: Date.parse('2026-11-09T09:30:00Z'), description: 'Line one\nLine two, with ; and \\ ' + 'long '.repeat(40) + 'ünïcödé 日本語'.repeat(10) },
    { id: 'b@example.com', summary: 'Gate', start: Date.parse('2026-11-10T12:00:00Z'), end: Date.parse('2026-11-10T12:00:00Z') },
    { id: 'c@example.com', summary: '', start: 0, end: day },
  ]
  const text = toICalendar(events, { calendarName: 'Plan, v1', timestamp: 0 })
  const imported = fromICalendar(text)
  assert.deepEqual(imported.warnings, [])
  assert.equal(imported.name, 'Plan, v1')
  assert.deepEqual(imported.events.map(({ allDay, ...event }) => event), events)
  assert.equal(imported.events.every(event => event.allDay === false), true)
  assert.equal(toICalendar(imported.events, { calendarName: imported.name, timestamp: 0 }), text)
})

test('fromICalendar unfolds lines, accepts LF and CR line ends, and unescapes text', () => {
  const lf = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:u1', 'DTSTART:20261109T080000Z', 'SUMMARY:Hello\\, wor', ' ld\\; ok', '\t\\nnext\\N', 'DESCRIPTION:a\\\\b\\xc', 'END:VEVENT', 'END:VCALENDAR'].join('\n')
  for (const text of [lf, lf.replaceAll('\n', '\r'), '﻿' + lf]) {
    const [event] = fromICalendar(text).events
    assert.equal(event.summary, 'Hello, world; ok\nnext\n')
    assert.equal(event.description, 'a\\b\\xc')
  }
})

test('fromICalendar reads UTC, floating, date and TZID times', () => {
  const text = wrap(
    vevent('UID:utc', 'DTSTART:20261109T080000Z', 'DTEND:20261109T093000Z', 'SUMMARY:Utc'),
    vevent('UID:floating', 'DTSTART:20261109T080000', 'DTEND:20261109T090000', 'SUMMARY:Floating'),
    vevent('UID:date', 'DTSTART;VALUE=DATE:20261109', 'DTEND;VALUE=DATE:20261111', 'SUMMARY:Two days'),
    vevent('UID:date1', 'DTSTART;VALUE=DATE:20261231', 'SUMMARY:One day'),
    vevent('UID:berlin', 'DTSTART;TZID=Europe/Berlin:20261109T090000', 'DTEND;TZID=Europe/Berlin:20261109T100000', 'SUMMARY:Berlin'),
    vevent('UID:summer', 'DTSTART;TZID="America/New_York":20260715T090000', 'DTEND;TZID=America/New_York:20260715T100000', 'SUMMARY:NY'),
    vevent('UID:vendor', 'DTSTART;TZID=/mozilla.org/20050126_1/Europe/Berlin:20261109T090000', 'SUMMARY:Prefixed'),
  )
  const { events, warnings } = fromICalendar(text)
  assert.deepEqual(warnings, [])
  const byId = Object.fromEntries(events.map(event => [event.id, event]))
  assert.deepEqual([byId.utc.start, byId.utc.end], [Date.parse('2026-11-09T08:00:00Z'), Date.parse('2026-11-09T09:30:00Z')])
  assert.deepEqual([byId.floating.start, byId.floating.end], [Date.parse('2026-11-09T08:00:00Z'), Date.parse('2026-11-09T09:00:00Z')])
  assert.deepEqual([byId.date.start, byId.date.end, byId.date.allDay], [Date.parse('2026-11-09T00:00:00Z'), Date.parse('2026-11-11T00:00:00Z'), true])
  assert.deepEqual([byId.date1.start, byId.date1.end], [Date.parse('2026-12-31T00:00:00Z'), Date.parse('2027-01-01T00:00:00Z')])
  // Berlin is UTC+1 in November and New York UTC-4 in July.
  assert.deepEqual([byId.berlin.start, byId.berlin.end], [Date.parse('2026-11-09T08:00:00Z'), Date.parse('2026-11-09T09:00:00Z')])
  assert.equal(byId.summer.start, Date.parse('2026-07-15T13:00:00Z'))
  assert.equal(byId.vendor.start, Date.parse('2026-11-09T08:00:00Z'))
  assert.equal(byId.vendor.end, byId.vendor.start)

  const shifted = fromICalendar(text, { utcOffsetMinutes: 540 }).events
  assert.equal(shifted[1].start, Date.parse('2026-11-08T23:00:00Z'))
  assert.equal(shifted[2].start, Date.parse('2026-11-08T15:00:00Z'))
  assert.equal(shifted[0].start, byId.utc.start)
  assert.equal(shifted[4].start, byId.berlin.start)
  assert.throws(() => fromICalendar(text, { utcOffsetMinutes: 2000 }), RangeError)
})

test('a daylight-saving gap moves forward and a repeated hour takes its first occurrence', () => {
  const text = wrap(
    vevent('UID:gap', 'DTSTART;TZID=Europe/Berlin:20260329T023000', 'SUMMARY:Gap'),
    vevent('UID:repeat', 'DTSTART;TZID=Europe/Berlin:20261025T023000', 'SUMMARY:Repeat'),
  )
  const [gap, repeat] = fromICalendar(text).events
  assert.equal(gap.start, Date.parse('2026-03-29T01:00:00Z'))
  assert.equal(repeat.start, Date.parse('2026-10-25T00:30:00Z'))
})

test('an unknown TZID is reported and read as local time at the offset', () => {
  const text = wrap(vevent('UID:u', 'DTSTART;TZID=Eastern Standard Time:20261109T080000', 'DTEND;TZID=Eastern Standard Time:20261109T090000', 'SUMMARY:Windows zone'))
  const { events, warnings } = fromICalendar(text, { utcOffsetMinutes: 60 })
  assert.equal(events[0].start, Date.parse('2026-11-09T07:00:00Z'))
  assert.equal(events[0].end, Date.parse('2026-11-09T08:00:00Z'))
  assert.deepEqual(warnings.map(warning => [warning.code, warning.eventId]), [['unknown-time-zone', 'u'], ['unknown-time-zone', 'u']])
  assert.equal(warnings[0].line > 0, true)
})

test('DURATION, missing end, and conflicting or invalid ends', () => {
  const text = wrap(
    vevent('UID:d1', 'DTSTART:20261109T080000Z', 'DURATION:PT1H30M', 'SUMMARY:A'),
    vevent('UID:d2', 'DTSTART:20261109T080000Z', 'DURATION:P1W2DT3H4M5S', 'SUMMARY:B'),
    vevent('UID:d3', 'DTSTART;VALUE=DATE:20261109', 'DURATION:P3D', 'SUMMARY:C'),
    vevent('UID:d4', 'DTSTART:20261109T080000Z', 'DURATION:-PT1H', 'SUMMARY:D'),
    vevent('UID:d5', 'DTSTART:20261109T080000Z', 'DURATION:PT', 'SUMMARY:E'),
    vevent('UID:d6', 'DTSTART:20261109T080000Z', 'DTEND:20261109T070000Z', 'SUMMARY:F'),
    vevent('UID:d7', 'DTSTART:20261109T080000Z', 'DTEND:garbage', 'SUMMARY:G'),
    vevent('UID:d8', 'DTSTART:20261109T080000Z', 'DTEND:20261109T090000Z', 'DURATION:PT5H', 'SUMMARY:H'),
    vevent('UID:d9', 'DTSTART:20261109T080000Z', 'SUMMARY:I'),
  )
  const { events, warnings } = fromICalendar(text)
  const length = Object.fromEntries(events.map(event => [event.id, event.end - event.start]))
  assert.deepEqual(length, { d1: 1.5 * hour, d2: (9 * day) + 3 * hour + 4 * 60_000 + 5000, d3: 3 * day, d4: 0, d5: 0, d6: 0, d7: 0, d8: hour, d9: 0 })
  assert.deepEqual(warnings.map(warning => warning.eventId), ['d4', 'd5', 'd6', 'd7', 'd8'])
  assert.equal(warnings.every(warning => warning.code === 'invalid-value'), true)
})

test('RRULE events import their first instance with a warning; changed instances and broken events are skipped', () => {
  const text = wrap(
    vevent('UID:weekly', 'DTSTART:20261109T080000Z', 'DTEND:20261109T090000Z', 'RRULE:FREQ=WEEKLY;COUNT=4', 'EXDATE:20261116T080000Z', 'SUMMARY:Standup'),
    vevent('UID:weekly', 'RECURRENCE-ID:20261116T080000Z', 'DTSTART:20261116T100000Z', 'SUMMARY:Moved'),
    vevent('UID:dates', 'DTSTART:20261109T080000Z', 'RDATE:20261110T080000Z', 'SUMMARY:Extra'),
    vevent('UID:nostart', 'SUMMARY:No start'),
    vevent('UID:badstart', 'DTSTART:20261301T080000Z', 'SUMMARY:Bad month'),
    vevent('UID:dup', 'DTSTART:20261109T080000Z', 'SUMMARY:First'),
    vevent('UID:dup', 'DTSTART:20261110T080000Z', 'SUMMARY:Second'),
    vevent('DTSTART:20261109T080000Z', 'SUMMARY:No UID'),
  )
  const { events, warnings } = fromICalendar(text)
  assert.deepEqual(events.map(event => [event.id, event.summary]), [['weekly', 'Standup'], ['dates', 'Extra'], ['dup', 'First'], ['event-4', 'No UID']])
  assert.equal(events[0].recurrenceRule, 'FREQ=WEEKLY;COUNT=4')
  assert.equal(events[1].recurrenceRule, undefined)
  assert.deepEqual(warnings.map(warning => warning.code), ['recurrence', 'skipped-event', 'recurrence', 'skipped-event', 'skipped-event', 'skipped-event', 'missing-uid'])
  assert.equal(warnings.every(warning => typeof warning.message === 'string'), true)
})

test('fromICalendar ignores nested components, other components and unknown properties', () => {
  const text = wrap(
    ['BEGIN:VTIMEZONE', 'TZID:Europe/Berlin', 'BEGIN:STANDARD', 'DTSTART:19701025T030000', 'END:STANDARD', 'END:VTIMEZONE'],
    ['BEGIN:VTODO', 'UID:todo', 'DTSTART:20261109T080000Z', 'SUMMARY:Todo', 'END:VTODO'],
    vevent('UID:e', 'X-CUSTOM;FOO="a;b:c":value', 'BEGIN:VALARM', 'ACTION:DISPLAY', 'SUMMARY:alarm text', 'DTSTART:20000101T000000Z', 'END:VALARM', 'DTSTART:20261109T080000Z', 'summary:lowercase names work'),
    ['X-WR-CALNAME:Fallback'],
  )
  const { events, warnings, name } = fromICalendar(text)
  assert.deepEqual(warnings, [])
  assert.equal(name, 'Fallback')
  assert.deepEqual(events.map(event => [event.id, event.summary, event.start]), [['e', 'lowercase names work', Date.parse('2026-11-09T08:00:00Z')]])
})

test('malformed input: not a calendar throws, recoverable damage warns', () => {
  assert.throws(() => fromICalendar(42), /string/)
  assert.throws(() => fromICalendar(''), /VCALENDAR/)
  assert.throws(() => fromICalendar('hello world'), /VCALENDAR/)
  assert.throws(() => fromICalendar('BEGIN:VEVENT\r\nEND:VEVENT\r\n'), /VCALENDAR/)
  const damaged = wrap(
    ['NO COLON HERE'],
    vevent('UID:a', 'DTSTART:20261109T080000Z', 'garbage line', 'SUMMARY:A'),
    ['END:VTODO'],
    ['BEGIN:VEVENT', 'UID:cut', 'DTSTART:20261109T080000Z'],
  )
  const { events, warnings } = fromICalendar(damaged)
  assert.deepEqual(events.map(event => event.id), ['a'])
  assert.equal(warnings.filter(warning => warning.code === 'malformed').length >= 2, true)
  assert.equal(warnings.some(warning => warning.code === 'skipped-event' && /END:VEVENT/.test(warning.message)), true)
  // A calendar without a closing line and an empty calendar still parse.
  assert.deepEqual(fromICalendar('BEGIN:VCALENDAR\r\n').events, [])
  assert.deepEqual(fromICalendar('begin:vcalendar\r\nbegin:vevent\r\nuid:x\r\ndtstart:20261109T080000Z\r\nend:vevent\r\n').events.map(event => event.id), ['x'])
})

test('a long document with thousands of events and long lines imports in linear time', () => {
  const count = 20_000
  const body = []
  for (let index = 0; index < count; index++) {
    body.push(...vevent('UID:e' + index, 'DTSTART:20261109T080000Z', 'SUMMARY:' + 'x'.repeat(200)))
  }
  const started = Date.now()
  const { events } = fromICalendar(wrap(body))
  assert.equal(events.length, count)
  assert.ok(Date.now() - started < 5000)
})

test('timelineFromICalendar builds rows and bars that validate, and does not modify its input', () => {
  const { events } = fromICalendar(wrap(
    vevent('UID:a', 'DTSTART:20261109T080000Z', 'DTEND:20261109T090000Z', 'SUMMARY:Build', 'DESCRIPTION:Notes'),
    vevent('UID:b', 'DTSTART:20261110T080000Z', 'SUMMARY:Gate'),
  ))
  const original = JSON.stringify(events)
  const { rows, bars } = timelineFromICalendar(events)
  assert.equal(JSON.stringify(events), original)
  assert.deepEqual(rows, [{ id: 'a', label: 'Build' }, { id: 'b', label: 'Gate' }])
  assert.deepEqual(bars, [
    { id: 'a', rowId: 'a', label: 'Build', start: Date.parse('2026-11-09T08:00:00Z'), end: Date.parse('2026-11-09T09:00:00Z'), description: 'Notes' },
    { id: 'b', rowId: 'b', label: 'Gate', start: Date.parse('2026-11-10T08:00:00Z'), end: Date.parse('2026-11-10T08:00:00Z') },
  ])
  assert.doesNotThrow(() => validateTimelineData(rows, bars))
  assert.throws(() => timelineFromICalendar([{ id: 'x', summary: 'a', start: 2, end: 1 }]), RangeError)
  assert.throws(() => timelineFromICalendar([{ id: 'x', summary: 'a', start: 1, end: 2 }, { id: 'x', summary: 'a', start: 1, end: 2 }]), { name: 'Error', message: 'Duplicate event ID: x' })
  assert.throws(() => timelineFromICalendar([{ id: '', summary: 'a', start: 1, end: 2 }]), Error)
  assert.throws(() => timelineFromICalendar([{ id: 'x', start: 1, end: 2 }]), /summary/)
})
