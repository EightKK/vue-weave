import assert from 'node:assert/strict'
import { test } from 'node:test'
import { h } from 'vue'
import { expandRecurringEvents } from '@eightkk/vue-weave/core'
import { EventCalendar } from '@eightkk/vue-weave'
import { renderComponent } from './helpers/ssr.mjs'
import { assertIdsResolve, renderStable } from './helpers/ssr-checks.mjs'
import { hour, utcText as utc } from './helpers/time.mjs'

// Wednesday, November 11, 2026.
const wednesday = utc('2026-11-11T10:30:00')
const events = [
  { id: 'standup', label: 'Standup', start: utc('2026-11-11T09:00'), end: utc('2026-11-11T09:30'), resourceId: 'a' },
  { id: 'review', label: 'Design review', start: utc('2026-11-11T09:15'), end: utc('2026-11-11T11:00'), resourceId: 'b' },
  { id: 'offsite', label: 'Offsite', start: utc('2026-11-12T00:00'), end: utc('2026-11-14T00:00'), allDay: true },
]
const resources = [{ id: 'a', label: 'Room A' }, { id: 'b', label: 'Room B' }]
const render = (props = {}, slots) => renderStable(() => renderComponent(EventCalendar, { events, date: wednesday, now: utc('2026-11-11T10:00'), ...props }, slots))

test('EventCalendar renders each view on the server without browser globals, identically on every render', async () => {
  for (const view of ['day', 'week', 'month']) {
    const html = await render({ view })
    assert.match(html, new RegExp(`vw-calendar-view-${view}`))
    assertIdsResolve(html)
  }
})

test('the week view has the toolbar, view switch, event names, live region and edit hint', async () => {
  const html = await render({ view: 'week' })
  assert.match(html, /aria-label="Standup, Wed, Nov 11 09:00–09:30"/)
  assert.match(html, /aria-label="Offsite, Thu, Nov 12 – Fri, Nov 13, All day"/)
  assert.match(html, /aria-label="Now 10:00"/)
  assert.match(html, /aria-live="polite"/)
  assert.match(html, /<span class="vw-calendar-title" data-allow-mismatch="text">Nov 9 – 15, 2026<\/span>/)
  for (const name of ['Previous', 'Today', 'Next']) assert.match(html, new RegExp(`>${name}<|aria-label="${name}"`))
  for (const name of ['Day', 'Week', 'Month']) assert.match(html, new RegExp(`>${name}<`))
  assert.match(html, /aria-pressed="true"[^>]*>Week</)
  assert.match(html, /class="vw-sr-only"/)
})

test('the day view with resources has one column per resource and names the resource on its events', async () => {
  const html = await render({ view: 'day', resources })
  assert.match(html, /Room A/)
  assert.match(html, /Room B/)
  assert.match(html, /Design review, Wed, Nov 11 09:15–11:00, Room B/)
  assert.doesNotMatch(html, /Offsite/)
})

test('the month view shows day buttons, a "+N more" button and its own edit hint', async () => {
  const html = await render({ view: 'month', maxMonthLanes: 1 })
  assert.match(html, /November 2026/)
  assert.match(html, /aria-label="Show day Wednesday, November 11, 2026"/)
  assert.match(html, /\+1 more/)
  assert.match(html, /-month-hint" class="vw-sr-only">/)
})

test('timeZone and locale change the days, hours and text, and the output stays stable', async () => {
  const berlin = await render({
    events: [{ id: 'm', label: 'Meeting', start: Date.parse('2026-11-11T09:00:00+01:00'), end: Date.parse('2026-11-11T10:00:00+01:00') }],
    view: 'day', timeZone: 'Europe/Berlin', locale: 'de-DE', dayStart: 8, dayEnd: 18,
  })
  assert.match(berlin, /Mittwoch, 11\. November 2026/)
  assert.match(berlin, /Meeting, Mi\., 11\. Nov\. 09:00–10:00/)
  assert.doesNotMatch(berlin, />18:00</)
  // The same instant is the previous evening in New York.
  const newYork = await render({
    events: [{ id: 'm', label: 'Meeting', start: Date.parse('2026-11-11T03:00:00Z'), end: Date.parse('2026-11-11T04:00:00Z') }],
    view: 'week', timeZone: 'America/New_York', date: Date.parse('2026-11-11T12:00:00Z'),
  })
  assert.match(newYork, /Meeting, Tue, Nov 10 22:00–23:00/)
  // The title carries no thin or no-break spaces, which differ between Node.js and browsers and caused a hydration mismatch.
  for (const locale of ['en-US', 'en-GB', 'de-DE', 'fr-FR', 'ja-JP', 'ar-EG']) {
    const html = await render({ view: 'week', locale })
    assert.doesNotMatch(html, /[   ]/, locale)
    assert.match(html, /<span class="vw-calendar-title" data-allow-mismatch="text">/, locale)
  }
  assert.match(await render({ view: 'week', locale: 'ja-JP' }), /2026/)
  // An invalid locale is reported by rejecting the render, like other invalid input.
  await assert.rejects(renderComponent(EventCalendar, { events, date: wednesday, locale: 'not a locale' }), { message: /Invalid locale/ })
})

test('recurring series are named as such and render the same on every render', async () => {
  const weekly = utc('2026-11-02T09:00')
  const series = { id: 'sync', label: 'Sync', start: weekly, end: weekly + hour, recurrence: { rule: 'FREQ=WEEKLY;BYDAY=MO,WE;COUNT=6' } }
  const occurrences = expandRecurringEvents([series], { start: utc('2026-11-01T00:00'), end: utc('2026-12-01T00:00') })
  assert.equal(occurrences.length, 6)
  const html = await render({ events: occurrences, view: 'week', date: utc('2026-11-04T10:00') })
  assert.match(html, /aria-label="Sync, Mon, Nov 2 09:00–10:00, Recurring"/)
  assert.match(html, /aria-label="Sync, Wed, Nov 4 09:00–10:00, Recurring"/)
  assert.match(html, /vw-is-recurring/)
  assert.match(await render({ events: occurrences, view: 'week', date: utc('2026-11-04T10:00'), labels: { recurring: 'Serie' } }), /, Serie"/)
  const month = await render({ events: occurrences, view: 'month', date: utc('2026-11-04T10:00') })
  assert.match(month, /Sync, Mon, Nov 2 09:00–10:00, Recurring/)
})

test('right-to-left writes dir="rtl", keeps names and mirrors the offsets', async () => {
  const ltr = await render({ view: 'week' })
  const rtl = await render({ view: 'week', dir: 'rtl' })
  assert.match(rtl, /dir="rtl"/)
  assert.match(rtl, /vw-rtl/)
  assert.doesNotMatch(ltr, /dir="rtl"|vw-rtl/)
  assert.match(rtl, /aria-label="Standup, Wed, Nov 11 09:00–09:30"/)
  assertIdsResolve(rtl)
  assert.doesNotMatch(await render({ dir: 'auto' }), /dir="|vw-rtl/)
})

test('opt-in props: toolbar, hours, creatable, readonly, labels and slots', async () => {
  assert.doesNotMatch(await render({ showToolbar: false }), /vw-calendar-title/)
  const hours = await render({ view: 'day', dayStart: 8, dayEnd: 12 })
  assert.match(hours, />08:00</)
  assert.doesNotMatch(hours, />12:00</)
  const labelled = await render({ labels: { region: 'Kalender' } })
  assert.match(labelled, /aria-label="Kalender"/)
  const slotted = await render({ view: 'week' }, { event: ({ event }) => h('em', event.label + ' slot') })
  assert.match(slotted, /<em>Standup slot<\/em>/)
  const custom = await render({ view: 'week', formatTime: time => 'T' + (time % (24 * hour)) / hour })
  assert.match(custom, /T9/)
  assertIdsResolve(await render({ creatable: true, readonly: true }))
})

test('empty data renders every view with its grid and no event buttons', async () => {
  for (const view of ['day', 'week', 'month']) {
    const html = await render({ events: [], view })
    assert.match(html, new RegExp(`vw-calendar-view-${view}`))
    assert.doesNotMatch(html, /data-event-id|vw-calendar-event/)
    assertIdsResolve(html)
  }
  const noRooms = await render({ events: [], resources: [], view: 'day' })
  assert.match(noRooms, /vw-calendar-view-day/)
})

test('invalid input rejects the render', async () => {
  await assert.rejects(renderComponent(EventCalendar, { events: [{ id: 'x', label: 'X', start: 2, end: 1 }], date: wednesday }), { name: 'RangeError' })
  await assert.rejects(renderComponent(EventCalendar, { events, date: wednesday, timeZone: 'Mars/Base' }), { message: /time zone/i })
})
