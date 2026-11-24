import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import {
  eventCalendarDays, eventCalendarRange, expandRecurringEvents, layoutCalendarAgenda, shiftEventCalendarDate,
} from '@eightkk/vue-weave/core'
import { EventCalendar } from '@eightkk/vue-weave'
import { renderComponent } from './helpers/ssr.mjs'
import { day, utcText as utc } from './helpers/time.mjs'

// Wednesday, November 11, 2026.
const wednesday = utc('2026-11-11T10:30:00')

test('the agenda covers the week of the date, or agendaDays days from its day, and steps by that range', () => {
  assert.deepEqual(eventCalendarRange('agenda', wednesday), eventCalendarRange('week', wednesday))
  assert.deepEqual(eventCalendarRange('agenda', wednesday, { weekStartsOn: 0 }), { start: utc('2026-11-08T00:00:00'), end: utc('2026-11-15T00:00:00') })
  assert.deepEqual(eventCalendarRange('agenda', wednesday, { agendaDays: 3 }), { start: utc('2026-11-11T00:00:00'), end: utc('2026-11-14T00:00:00') })
  assert.deepEqual(eventCalendarDays('agenda', wednesday, { agendaDays: 2 }).map(entry => entry.day), [11, 12])
  assert.equal(eventCalendarDays('agenda', wednesday).length, 7)
  assert.equal(shiftEventCalendarDate('agenda', wednesday, 1), wednesday + 7 * day)
  assert.equal(shiftEventCalendarDate('agenda', wednesday, -2, { agendaDays: 3 }), wednesday - 6 * day)
  // Other views ignore agendaDays.
  assert.deepEqual(eventCalendarRange('week', wednesday, { agendaDays: 3 }), eventCalendarRange('week', wednesday))
  assert.equal(shiftEventCalendarDate('day', wednesday, 1, { agendaDays: 3 }), wednesday + day)
  // Local days across a daylight-saving change.
  const timeZone = 'Europe/Berlin'
  const days = eventCalendarDays('agenda', Date.parse('2026-10-24T12:00:00+02:00'), { timeZone, agendaDays: 2 })
  assert.deepEqual(days.map(entry => entry.end - entry.start), [day, day + 3_600_000])
  for (const agendaDays of [0, 1.5, 367, Number.NaN]) {
    assert.throws(() => eventCalendarRange('agenda', wednesday, { agendaDays }), { name: 'RangeError', message: 'agendaDays must be an integer from 1 to 366' })
  }
})

test('layoutCalendarAgenda lists the events of each day, all-day entries first, independent of input order', () => {
  const days = eventCalendarDays('agenda', wednesday, { agendaDays: 3 })
  const events = [
    { id: 'late', start: utc('2026-11-11T15:00:00'), end: utc('2026-11-11T16:00:00') },
    { id: 'early', start: utc('2026-11-11T09:00:00'), end: utc('2026-11-11T10:00:00') },
    { id: 'long', start: utc('2026-11-11T09:00:00'), end: utc('2026-11-11T12:00:00') },
    { id: 'offsite', start: utc('2026-11-11T00:00:00'), end: utc('2026-11-12T00:00:00'), allDay: true },
    // Overnight: from Wednesday 22:00 to Friday 02:00, so Thursday is covered completely.
    { id: 'night', start: utc('2026-11-11T22:00:00'), end: utc('2026-11-13T02:00:00') },
    { id: 'deadline', start: utc('2026-11-12T17:00:00'), end: utc('2026-11-12T17:00:00') },
    { id: 'outside', start: utc('2026-11-20T09:00:00'), end: utc('2026-11-20T10:00:00') },
  ]
  const frozen = structuredClone(events)
  const agenda = layoutCalendarAgenda(events, days)
  assert.deepEqual(events, frozen)
  assert.deepEqual(agenda.map(entry => [entry.index, entry.start, entry.end]), days.map((entry, index) => [index, entry.start, entry.end]))
  assert.deepEqual(agenda[0].items.map(item => item.id), ['offsite', 'long', 'early', 'late', 'night'])
  assert.deepEqual(agenda[0].items[4], {
    id: 'night', start: utc('2026-11-11T22:00:00'), end: utc('2026-11-12T00:00:00'), allDay: false, continuesBefore: false, continuesAfter: true,
  })
  assert.deepEqual(agenda[1].items, [
    { id: 'night', start: utc('2026-11-12T00:00:00'), end: utc('2026-11-13T00:00:00'), allDay: true, continuesBefore: true, continuesAfter: true },
    { id: 'deadline', start: utc('2026-11-12T17:00:00'), end: utc('2026-11-12T17:00:00'), allDay: false, continuesBefore: false, continuesAfter: false },
  ])
  assert.deepEqual(agenda[2].items.map(item => [item.id, item.allDay, item.continuesBefore, item.continuesAfter]), [['night', false, true, false]])
  // Input order does not matter.
  assert.deepEqual(layoutCalendarAgenda([...events].reverse(), days), agenda)
  // A day without events is returned with no items.
  assert.deepEqual(layoutCalendarAgenda([], days.slice(0, 1)), [{ index: 0, start: days[0].start, end: days[0].end, items: [] }])
})

test('layoutCalendarAgenda lists the occurrences of a recurring series on their days', () => {
  const series = [{ id: 'sync', label: 'Sync', start: utc('2026-11-03T16:00:00'), end: utc('2026-11-03T16:30:00'), recurrence: { rule: 'FREQ=WEEKLY;BYDAY=TU;COUNT=4' } }]
  const range = eventCalendarRange('agenda', wednesday, { agendaDays: 14 })
  const occurrences = expandRecurringEvents(series, range)
  const agenda = layoutCalendarAgenda(occurrences, eventCalendarDays('agenda', wednesday, { agendaDays: 14 }))
  const listed = agenda.filter(entry => entry.items.length).map(entry => new Date(entry.start).toISOString().slice(0, 10))
  assert.deepEqual(listed, ['2026-11-17', '2026-11-24'])
})

test('layoutCalendarAgenda validates its inputs', () => {
  const days = [{ start: 0, end: 10 }]
  assert.throws(() => layoutCalendarAgenda('x', days), { name: 'RangeError', message: 'events must be an array' })
  assert.throws(() => layoutCalendarAgenda([], 'x'), { name: 'RangeError', message: 'days must be an array' })
  assert.throws(() => layoutCalendarAgenda([], [{ start: 5, end: 10 }, { start: 0, end: 5 }]), RangeError)
  assert.throws(() => layoutCalendarAgenda([], [{ start: 5, end: 5 }]), RangeError)
  assert.throws(() => layoutCalendarAgenda([{ id: 'a', start: 2, end: 1 }], days), { name: 'RangeError', message: 'Event a must have finite start <= end' })
  assert.throws(() => layoutCalendarAgenda([{ id: 'a', start: 0, end: 1 }, { id: 'a', start: 0, end: 1 }], days), { name: 'Error', message: 'Duplicate event ID: a' })
  assert.throws(() => layoutCalendarAgenda([{ id: '', start: 0, end: 1 }], days), { name: 'Error', message: 'Invalid event ID: ""' })
})

const events = [
  { id: 'standup', label: 'Standup', start: utc('2026-11-11T09:00:00'), end: utc('2026-11-11T09:30:00'), resourceId: 'a' },
  { id: 'review', label: 'Design review', start: utc('2026-11-11T09:15:00'), end: utc('2026-11-11T11:00:00'), resourceId: 'b' },
  { id: 'offsite', label: 'Offsite', start: utc('2026-11-12T00:00:00'), end: utc('2026-11-14T00:00:00'), allDay: true },
  { id: 'sync-1', label: 'Sync', start: utc('2026-11-13T16:00:00'), end: utc('2026-11-13T16:30:00'), seriesId: 'sync', recurrenceId: utc('2026-11-13T16:00:00') },
]
const resources = [{ id: 'a', label: 'Room A' }, { id: 'b', label: 'Room B' }]

test('EventCalendar renders the agenda on the server: days with events, entries in order, names like the other views', async () => {
  const html = await renderComponent(EventCalendar, { events, resources, date: wednesday, view: 'agenda', now: utc('2026-11-11T10:00:00') })
  assert.match(html, /vw-calendar-view-agenda/)
  assert.match(html, /<span class="vw-calendar-title" data-allow-mismatch="text">Nov 9 – 15, 2026<\/span>/)
  assert.match(html, /<ul class="vw-calendar-agenda-days" role="list" aria-label="Agenda">/)
  const dates = [...html.matchAll(/class="vw-calendar-agenda-date">([^<]+)</g)].map(match => match[1])
  assert.deepEqual(dates, ['Wednesday, November 11, 2026', 'Thursday, November 12, 2026', 'Friday, November 13, 2026'])
  const names = [...html.matchAll(/class="vw-calendar-event vw-calendar-agenda-event[^"]*"[^>]*aria-label="([^"]+)"/g)].map(match => match[1])
  assert.deepEqual(names, [
    'Standup, Wed, Nov 11 09:00–09:30, Room A', 'Design review, Wed, Nov 11 09:15–11:00, Room B',
    'Offsite, Thu, Nov 12 – Fri, Nov 13, All day', 'Offsite, Thu, Nov 12 – Fri, Nov 13, All day', 'Sync, Fri, Nov 13 16:00–16:30, Recurring',
  ])
  // Only the first entry of a multi-day event is a Tab stop; every entry describes the agenda keys.
  assert.equal([...html.matchAll(/data-vw-event="offsite"/g)].length, 2)
  assert.match(html, /tabindex="0" data-vw-event="offsite"/)
  assert.match(html, /tabindex="-1" data-vw-event="offsite"/)
  assert.match(html, /id="[^"]+-agenda-hint" class="vw-sr-only">Up and Down arrows move between events/)
  assert.match(html, /aria-describedby="[^"]+-agenda-hint"/)
  assert.match(html, />09:00–09:30</)
  assert.match(html, />All day</)
  assert.match(html, /class="vw-calendar-agenda-day vw-is-today"/)
  // The agenda has no drag handles and does not offer itself in the default view switch.
  assert.doesNotMatch(html, /vw-calendar-handle/)
  assert.doesNotMatch(html, />\s*Agenda\s*<\/button>/)
  assert.doesNotMatch(html, /vw-is-editable/)
})

test('EventCalendar agenda: views, agendaDays, labels, locale, time zone, slots and the empty state', async () => {
  const withSwitch = await renderComponent(EventCalendar, { events, date: wednesday, views: ['week', 'agenda'], labels: { agenda: 'Liste' } })
  assert.match(withSwitch, /aria-pressed="false">\s*Liste\s*<\/button>/)
  assert.doesNotMatch(withSwitch, />\s*Day\s*<\/button>/)
  const short = await renderComponent(EventCalendar, { events, date: wednesday, view: 'agenda', agendaDays: 1 })
  assert.match(short, />Wednesday, November 11, 2026</)
  assert.doesNotMatch(short, /Offsite/)
  const german = await renderComponent(EventCalendar, {
    events, date: wednesday, view: 'agenda', locale: 'de-DE', timeZone: 'Europe/Berlin', dir: 'rtl', labels: { allDay: 'Ganztägig', dayEditHint: 'Pfeiltasten' },
  }, { event: ({ event, allDay, view }) => h('em', `${event.label} ${allDay} ${view}`) })
  assert.match(german, /dir="rtl"/)
  assert.match(german, />Mittwoch, 11\. November 2026</)
  assert.match(german, />10:00–10:30</)
  assert.match(german, /<em>Offsite true agenda<\/em>/)
  assert.match(german, /<em>Standup false agenda<\/em>/)
  assert.match(german, />Ganztägig</)
  assert.match(german, /-agenda-hint" class="vw-sr-only">Pfeiltasten</)
  // A range without events shows the empty text or slot.
  assert.match(await renderComponent(EventCalendar, { events: [], date: wednesday, view: 'agenda' }), /No events to display/)
  assert.match(await renderComponent(EventCalendar, { events: [], date: wednesday, view: 'agenda' }, { empty: () => h('p', 'Nothing') }), /<p>Nothing<\/p>/)
  // The week view is unchanged by the new props.
  const week = await renderComponent(EventCalendar, { events, date: wednesday, agendaDays: 3 })
  assert.match(week, /Nov 9 – 15, 2026/)
  assert.doesNotMatch(week, /vw-calendar-agenda/)
})

test('EventCalendar reports invalid views and agendaDays through validation-error', async () => {
  for (const [props, message] of [
    [{ views: ['week', 'year'] }, 'Unknown event calendar view: year'],
    [{ views: ['week', 'week'] }, 'views must be an array of distinct views'],
    [{ agendaDays: 0 }, 'agendaDays must be an integer from 1 to 366'],
    [{ view: 'agenda', agendaDays: 2.5 }, 'agendaDays must be an integer from 1 to 366'],
  ]) {
    const reported = []
    const app = createSSRApp({ render: () => h(EventCalendar, { events: [], date: wednesday, ...props, onValidationError: error => reported.push(error) }) })
    app.config.errorHandler = () => {}
    const html = await renderToString(app)
    assert.equal(reported.length, 1, message)
    assert.equal(reported[0].constructor, RangeError, message)
    assert.equal(reported[0].message, message)
    assert.match(html, /No events to display/)
  }
})
