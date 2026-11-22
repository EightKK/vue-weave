import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import {
  intlTimeFormatter, eventCalendarDays, eventCalendarMonthGrid, eventCalendarRange, eventCalendarTimeAt, eventCalendarTimeOfDay, layoutCalendarDayEvents,
  packCalendarEventLanes, shiftEventCalendarDate, validateCalendarEvents,
} from '@eightkk/vue-weave/core'
import { EventCalendar } from '@eightkk/vue-weave'
import { renderComponent } from './helpers/ssr.mjs'
import { hour, day, utcText as utc } from './helpers/time.mjs'

// Wednesday, November 11, 2026.
const wednesday = utc('2026-11-11T10:30:00')

test('eventCalendarRange covers the day, the week from weekStartsOn and the whole weeks of the month grid', () => {
  assert.deepEqual(eventCalendarRange('day', wednesday), { start: utc('2026-11-11T00:00:00'), end: utc('2026-11-12T00:00:00') })
  assert.deepEqual(eventCalendarRange('week', wednesday), { start: utc('2026-11-09T00:00:00'), end: utc('2026-11-16T00:00:00') })
  assert.deepEqual(eventCalendarRange('week', wednesday, { weekStartsOn: 0 }), { start: utc('2026-11-08T00:00:00'), end: utc('2026-11-15T00:00:00') })
  // November 1, 2026 is a Sunday and November 30 a Monday, so a Monday grid runs from October 26 to December 7.
  assert.deepEqual(eventCalendarRange('month', wednesday), { start: utc('2026-10-26T00:00:00'), end: utc('2026-12-07T00:00:00') })
  assert.deepEqual(eventCalendarRange('month', wednesday, { weekStartsOn: 0 }), { start: utc('2026-11-01T00:00:00'), end: utc('2026-12-06T00:00:00') })
})

test('eventCalendarDays and eventCalendarMonthGrid list local dates and mark the days of other months', () => {
  const week = eventCalendarDays('week', wednesday)
  assert.equal(week.length, 7)
  assert.deepEqual(week.map(entry => entry.weekday), [1, 2, 3, 4, 5, 6, 0])
  assert.deepEqual(week[0], { start: utc('2026-11-09T00:00:00'), end: utc('2026-11-10T00:00:00'), year: 2026, month: 11, day: 9, weekday: 1, inMonth: true })
  const grid = eventCalendarMonthGrid(wednesday)
  assert.equal(grid.length, 6)
  assert.ok(grid.every(row => row.length === 7))
  assert.deepEqual(grid[0].map(entry => entry.inMonth), [false, false, false, false, false, false, true])
  assert.deepEqual(grid[5].map(entry => `${entry.month}/${entry.day}`), ['11/30', '12/1', '12/2', '12/3', '12/4', '12/5', '12/6'])
  // February 2027 starts on a Monday and has 28 days: exactly four weeks.
  assert.equal(eventCalendarMonthGrid(utc('2027-02-10T00:00:00')).length, 4)
})

test('days follow local midnights across daylight-saving changes and time of day round-trips', () => {
  const timeZone = 'Europe/Berlin'
  // October 25, 2026: clocks go back at 03:00 CEST, so the local day has 25 hours.
  const [longDay] = eventCalendarDays('day', Date.parse('2026-10-25T12:00:00+01:00'), { timeZone })
  assert.equal(longDay.start, Date.parse('2026-10-25T00:00:00+02:00'))
  assert.equal(longDay.end - longDay.start, 25 * hour)
  // March 29, 2026: 23 hours.
  const [shortDay] = eventCalendarDays('day', Date.parse('2026-03-29T12:00:00+02:00'), { timeZone })
  assert.equal(shortDay.end - shortDay.start, 23 * hour)
  const nine = Date.parse('2026-10-25T09:00:00+01:00')
  assert.equal(eventCalendarTimeOfDay(longDay.start, nine, { timeZone }), 9 * hour)
  assert.equal(eventCalendarTimeAt(longDay.start, 9 * hour, { timeZone }), nine)
  for (const time of [longDay.start, nine, longDay.start + 90 * 60_000, longDay.end - 1]) {
    assert.equal(eventCalendarTimeAt(longDay.start, eventCalendarTimeOfDay(longDay.start, time, { timeZone }), { timeZone }) <= time, true)
  }
  assert.equal(eventCalendarTimeOfDay(longDay.start, longDay.end, { timeZone }), 24 * hour)
  // A week view across the change still has seven local days.
  const week = eventCalendarDays('week', nine, { timeZone })
  assert.equal(week.length, 7)
  assert.equal(week[6].end - week[0].start, 7 * day + hour)
})

test('shiftEventCalendarDate keeps the local time and clamps the day of the month', () => {
  assert.equal(shiftEventCalendarDate('day', wednesday, 1), wednesday + day)
  assert.equal(shiftEventCalendarDate('week', wednesday, -2), wednesday - 14 * day)
  assert.equal(shiftEventCalendarDate('month', utc('2026-01-31T09:15:00'), 1), utc('2026-02-28T09:15:00'))
  assert.equal(shiftEventCalendarDate('month', utc('2026-03-31T09:15:00'), -13), utc('2025-02-28T09:15:00'))
  const timeZone = 'Europe/Berlin'
  const before = Date.parse('2026-10-24T09:00:00+02:00')
  assert.equal(shiftEventCalendarDate('day', before, 1, { timeZone }), Date.parse('2026-10-25T09:00:00+01:00'))
})

test('calendar helpers validate their inputs', () => {
  assert.throws(() => eventCalendarRange('year', 0), { name: 'RangeError', message: 'Unknown event calendar view: year' })
  assert.throws(() => eventCalendarDays('day', Number.NaN), { name: 'RangeError', message: 'date must be finite' })
  assert.throws(() => eventCalendarRange('week', 0, { weekStartsOn: 7 }), { name: 'RangeError', message: 'weekStartsOn must be 0 to 6' })
  assert.throws(() => eventCalendarRange('week', 0, { timeZone: 'Mars/Base' }), { name: 'RangeError', message: 'Invalid time zone: Mars/Base' })
  assert.throws(() => shiftEventCalendarDate('day', 0, 0.5), { name: 'RangeError', message: 'steps must be an integer' })
  assert.throws(() => layoutCalendarDayEvents([], { start: 1, end: 1 }), RangeError)
  assert.throws(() => layoutCalendarDayEvents([{ id: 'a', start: 2, end: 1 }], { start: 0, end: 10 }), { name: 'RangeError', message: 'Event a must have finite start <= end' })
  assert.throws(() => layoutCalendarDayEvents([{ id: 'a', start: 0, end: 1 }, { id: 'a', start: 0, end: 1 }], { start: 0, end: 10 }), { name: 'Error', message: 'Duplicate event ID: a' })
  assert.throws(() => packCalendarEventLanes([], [{ start: 5, end: 10 }, { start: 0, end: 5 }]), RangeError)
  assert.throws(() => packCalendarEventLanes([{ id: '', start: 0, end: 1 }], []), { name: 'Error', message: 'Invalid event ID: ""' })
})

test('layoutCalendarDayEvents places overlapping events side by side, clipped to the day, independent of input order', () => {
  const dayRange = { start: 0, end: day }
  const events = [
    { id: 'a', start: 9 * hour, end: 11 * hour },
    { id: 'b', start: 10 * hour, end: 12 * hour },
    { id: 'c', start: 11 * hour, end: 13 * hour },
    { id: 'd', start: 14 * hour, end: 15 * hour },
    { id: 'late', start: 23 * hour, end: 26 * hour },
    { id: 'early', start: -2 * hour, end: hour },
    { id: 'outside', start: day, end: day + hour },
    { id: 'point', start: 14 * hour, end: 14 * hour },
  ]
  const expected = [
    { id: 'early', start: 0, end: hour, column: 0, columns: 1 },
    { id: 'a', start: 9 * hour, end: 11 * hour, column: 0, columns: 2 },
    { id: 'b', start: 10 * hour, end: 12 * hour, column: 1, columns: 2 },
    { id: 'c', start: 11 * hour, end: 13 * hour, column: 0, columns: 2 },
    { id: 'd', start: 14 * hour, end: 15 * hour, column: 0, columns: 2 },
    { id: 'point', start: 14 * hour, end: 14 * hour, column: 1, columns: 2 },
    { id: 'late', start: 23 * hour, end: day, column: 0, columns: 1 },
  ]
  assert.deepEqual(layoutCalendarDayEvents(events, dayRange), expected)
  assert.deepEqual(layoutCalendarDayEvents([...events].reverse(), dayRange), expected)
  // A point in time inside another event still takes the next free column.
  assert.equal(layoutCalendarDayEvents([events[3], events[7]], dayRange, { minDuration: 0 }).find(item => item.id === 'point').column, 1)
  assert.deepEqual(layoutCalendarDayEvents([{ id: 'x', start: hour, end: hour + 1 }, { id: 'y', start: hour + 2, end: hour + 3 }], dayRange)
    .map(item => item.column), [0, 0])
  assert.deepEqual(layoutCalendarDayEvents([{ id: 'x', start: hour, end: hour + 1 }, { id: 'y', start: hour + 2, end: hour + 3 }], dayRange, { minDuration: hour })
    .map(item => item.column), [0, 1])
  assert.deepEqual(events[0], { id: 'a', start: 9 * hour, end: 11 * hour })
})

test('packCalendarEventLanes stacks multi-day events on the lowest free lane', () => {
  const days = eventCalendarDays('week', wednesday)
  const at = (date, time = '00:00:00') => utc(`2026-11-${date}T${time}`)
  const events = [
    { id: 'trip', start: at('07'), end: at('11') },
    { id: 'expo', start: at('10'), end: at('13') },
    { id: 'meeting', start: at('12', '09:00:00'), end: at('12', '10:00:00') },
    { id: 'holiday', start: at('15'), end: at('17') },
    { id: 'next', start: at('16'), end: at('17') },
    { id: 'deadline', start: at('13', '17:00:00'), end: at('13', '17:00:00') },
  ]
  const result = packCalendarEventLanes(events, days)
  assert.equal(result.lanes, 2)
  assert.deepEqual(result.segments, [
    { id: 'trip', lane: 0, startIndex: 0, endIndex: 2, continuesBefore: true, continuesAfter: false },
    { id: 'expo', lane: 1, startIndex: 1, endIndex: 4, continuesBefore: false, continuesAfter: false },
    { id: 'meeting', lane: 0, startIndex: 3, endIndex: 4, continuesBefore: false, continuesAfter: false },
    { id: 'deadline', lane: 0, startIndex: 4, endIndex: 5, continuesBefore: false, continuesAfter: false },
    { id: 'holiday', lane: 0, startIndex: 6, endIndex: 7, continuesBefore: false, continuesAfter: true },
  ])
  assert.deepEqual(packCalendarEventLanes([...events].reverse(), days), result)
})

test('validateCalendarEvents checks IDs, intervals and resource references', () => {
  const resources = [{ id: 'room-a', label: 'Room A' }]
  assert.doesNotThrow(() => validateCalendarEvents([{ id: 'e', start: 0, end: 1, label: 'E', resourceId: 'room-a' }], resources))
  assert.throws(() => validateCalendarEvents([{ id: 'e', start: 0, end: 1, label: 'E', resourceId: 'room-b' }], resources),
    { name: 'Error', message: 'Unknown resource in event e: room-b' })
  assert.throws(() => validateCalendarEvents([], [{ id: 'r', label: 'R' }, { id: 'r', label: 'R' }]), { message: 'Duplicate resource ID: r' })
  assert.throws(() => validateCalendarEvents([{ id: 5, start: 0, end: 1, label: 'E' }]), { message: 'Invalid event ID: 5' })
  assert.throws(() => validateCalendarEvents([{ id: 'e', start: 0, end: Number.NaN, label: 'E' }]), RangeError)
})

const events = [
  { id: 'standup', label: 'Standup', start: utc('2026-11-11T09:00:00'), end: utc('2026-11-11T09:30:00'), resourceId: 'a' },
  { id: 'review', label: 'Design review', start: utc('2026-11-11T09:15:00'), end: utc('2026-11-11T11:00:00'), resourceId: 'b', tone: 'teal' },
  { id: 'offsite', label: 'Offsite', start: utc('2026-11-12T00:00:00'), end: utc('2026-11-14T00:00:00'), allDay: true },
]
const resources = [{ id: 'a', label: 'Room A' }, { id: 'b', label: 'Room B', detail: '8 seats' }]

test('EventCalendar renders the week, the per-resource day and the month view on the server', async () => {
  const week = await renderComponent(EventCalendar, { events, date: wednesday, now: utc('2026-11-11T10:00:00') })
  assert.match(week, /vw-calendar-view-week/)
  assert.match(week, /aria-label="Standup, Wed, Nov 11 09:00–09:30"/)
  assert.match(week, /aria-label="Offsite, Thu, Nov 12 – Fri, Nov 13, All day"/)
  // Plain spaces around the dash, whatever the ICU version (Node.js writes thin spaces), so the title hydrates in a browser.
  assert.match(week, /<span class="vw-calendar-title">Nov 9 – 15, 2026<\/span>/)
  assert.match(week, /aria-label="Now 10:00"/)
  assert.match(week, /aria-live="polite"/)
  // Two overlapping events share the day column.
  assert.match(week, /inset-inline-start:calc\(50% \+ 1px\)/)

  const day = await renderComponent(EventCalendar, { events, resources, date: wednesday, view: 'day' })
  assert.match(day, /Room A/)
  assert.match(day, /8 seats/)
  assert.match(day, /Design review, Wed, Nov 11 09:15–11:00, Room B/)

  const month = await renderComponent(EventCalendar, { events, date: wednesday, view: 'month', maxMonthLanes: 1, labels: { more: 'weitere' } })
  assert.match(month, /November 2026/)
  assert.match(month, /aria-label="Show day Wednesday, November 11, 2026"/)
  assert.match(month, /\+1 weitere/)
})

test('EventCalendar uses the time zone and locale for labels and supports right-to-left and slots', async () => {
  const html = await renderComponent(EventCalendar, {
    events: [{ id: 'm', label: 'Meeting', start: Date.parse('2026-11-11T09:00:00+01:00'), end: Date.parse('2026-11-11T10:00:00+01:00') }],
    date: wednesday, view: 'day', timeZone: 'Europe/Berlin', locale: 'de-DE', dir: 'rtl', dayStart: 8, dayEnd: 18,
  }, { event: ({ event }) => h('em', event.label + ' slot') })
  assert.match(html, /dir="rtl"/)
  assert.match(html, /Mittwoch, 11\. November 2026/)
  assert.match(html, /Meeting, Mi\., 11\. Nov\. 09:00–10:00/)
  assert.match(html, /<em>Meeting slot<\/em>/)
  // The week title in the locale and with plain spaces, like the time labels from 12-hour formats.
  const week = await renderComponent(EventCalendar, { events: [], date: wednesday, locale: 'en-US', formatTime: undefined })
  assert.doesNotMatch(week, /[\u00a0\u2009\u202f]/)
  // Hours 8 to 17 are drawn; 09:00 is one hour below the top.
  assert.match(html, />08:00</)
  assert.doesNotMatch(html, />18:00</)
  assert.match(html, /top:48px/)
})

test('EventCalendar reports invalid input through validation-error and renders its empty state', async () => {
  for (const [props, type, message] of [
    [{ events: [{ id: 'x', label: 'X', start: 2, end: 1 }] }, RangeError, 'Event x must have finite start <= end'],
    [{ events: [{ id: 'x', label: 'X', start: 0, end: 1, resourceId: 'z' }], resources }, Error, 'Unknown resource in event x: z'],
    [{ events: [], dayStart: 10, dayEnd: 9 }, RangeError, 'dayStart and dayEnd must be integers with 0 <= dayStart < dayEnd <= 24'],
    [{ events: [], snap: 0 }, RangeError, 'snap must be finite and positive'],
    [{ events: [], timeZone: 'Nowhere' }, RangeError, 'Invalid time zone: Nowhere'],
    [{ events: [], weekStartsOn: 7 }, RangeError, 'weekStartsOn must be 0 to 6'],
    [{ events: [], weekStartsOn: 1.5 }, RangeError, 'weekStartsOn must be 0 to 6'],
    [{ events: [], hourHeight: 0 }, RangeError, 'hourHeight must be finite and positive'],
    [{ events: [], maxMonthLanes: 0 }, RangeError, 'maxMonthLanes must be an integer >= 1'],
    [{ events: [], createDuration: -15 }, RangeError, 'createDuration must be finite and positive'],
    [{ events: [], now: Number.NaN }, RangeError, 'now must be finite'],
    [{ events: [], view: 'year' }, RangeError, 'Unknown event calendar view: year'],
    [{ events: [], locale: 'en_US' }, RangeError, 'Invalid locale: en_US'],
    [{ events: [], locale: ['de-DE', 'not a locale'] }, RangeError, 'Invalid locale: de-DE,not a locale'],
    [{ events: [], height: -1 }, RangeError, 'height must be a finite non-negative number of pixels or a CSS length'],
    [{ events: [], dir: 'up' }, RangeError, 'dir must be ltr, rtl or auto: up'],
  ]) {
    const reported = [], handled = []
    const app = createSSRApp({ render: () => h(EventCalendar, { date: wednesday, ...props, onValidationError: error => reported.push(error) }) })
    app.config.errorHandler = error => handled.push(error)
    const html = await renderToString(app)
    assert.equal(reported.length, 1, message)
    assert.equal(reported[0].constructor, type, message)
    assert.equal(reported[0].message, message)
    assert.deepEqual(handled, reported)
    assert.match(html, /No events to display/)
  }
})

test('EventCalendar labels the hour gutter with formatTime and keeps HH:mm by default', async () => {
  const twelveHour = intlTimeFormatter({ timeZone: 'Europe/Berlin', format: { hour: 'numeric', minute: '2-digit', hour12: true } })
  const html = await renderComponent(EventCalendar, {
    events: [], date: wednesday, view: 'day', timeZone: 'Europe/Berlin', dayStart: 8, dayEnd: 14, formatTime: twelveHour,
  })
  assert.match(html, />8:00\sAM</)
  assert.match(html, />12:00\sPM</)
  assert.doesNotMatch(html, />08:00</)
  const plain = await renderComponent(EventCalendar, { events: [], date: wednesday, view: 'day', timeZone: 'Europe/Berlin', dayStart: 8, dayEnd: 14 })
  assert.match(plain, />08:00</)
  assert.match(plain, />13:00</)
  // On the day clocks go forward, the skipped hour keeps its HH:mm label.
  const spring = await renderComponent(EventCalendar, {
    events: [], date: Date.parse('2026-03-29T12:00:00Z'), view: 'day', timeZone: 'Europe/Berlin', dayEnd: 4, formatTime: twelveHour,
  })
  assert.match(spring, />1:00\sAM</)
  assert.match(spring, />02:00</)
  assert.match(spring, />3:00\sAM</)
})

test('EventCalendar describes month view events with a hint that names Up and Down', async () => {
  const month = await renderComponent(EventCalendar, { events, date: wednesday, view: 'month' })
  const hint = month.match(/id="([^"]+-month-hint)" class="vw-sr-only">([^<]+)</)
  assert.ok(hint, 'the month hint is rendered')
  assert.match(hint[2], /Up and Down by a week/)
  assert.match(month, new RegExp(`aria-describedby="${hint[1]}"`))
  assert.doesNotMatch(month, /aria-describedby="[^"]+-days-hint"/)
  const week = await renderComponent(EventCalendar, { events, date: wednesday })
  assert.doesNotMatch(week, /-month-hint/)
  assert.match(week, /aria-describedby="[^"]+-days-hint"/)
  // A localized dayEditHint without monthEditHint is used in the month view too; monthEditHint overrides it.
  assert.match(await renderComponent(EventCalendar, { events, date: wednesday, view: 'month', labels: { dayEditHint: 'Pfeiltasten' } }), /-month-hint" class="vw-sr-only">Pfeiltasten</)
  assert.match(await renderComponent(EventCalendar, { events, date: wednesday, view: 'month', labels: { dayEditHint: 'A', monthEditHint: 'B' } }), /-month-hint" class="vw-sr-only">B</)
})
