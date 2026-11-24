import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  defaultSvgExportTheme, eventCalendarRange, expandRecurringEvents, layoutCalendarDayEvents, renderEventCalendarSvg,
} from '@eightkk/vue-weave/core'
import { assertWellFormed, hostile, svgSize, svgTexts } from './helpers/svg.mjs'

const hour = 3_600_000
const day = 24 * hour
// Wednesday 2026-11-11 in UTC; the week (from Monday) is 9 to 15 November.
const date = Date.UTC(2026, 10, 11, 10)
const at = (d, h, m = 0) => Date.UTC(2026, 10, d, h, m)
const events = [
  { id: 'standup', start: at(11, 9), end: at(11, 9, 30), label: 'Standup', tone: 'teal' },
  { id: 'review', start: at(11, 9), end: at(11, 11), label: 'Design review' },
  { id: 'lunch', start: at(12, 12), end: at(12, 13), label: 'Lunch', color: '#ff0000', resourceId: 'room-a' },
  { id: 'offsite', start: at(10, 0), end: at(13, 0), label: 'Offsite', allDay: true, tone: 'amber' },
  { id: 'trip', start: at(14, 8), end: at(16, 18), label: 'Trip' },
]

test('renderEventCalendarSvg draws the week view with the all-day row and timed events', () => {
  const svg = renderEventCalendarSvg(events, date, { title: 'Week', now: at(11, 10, 30), selectedId: 'review' })
  assertWellFormed(svg)
  const texts = svgTexts(svg)
  assert.ok(texts.includes('Nov 9 – 15, 2026'), 'the heading is the toolbar title')
  for (const text of ['Mon, Nov 9', 'Sun, Nov 15', 'All day', 'Offsite', 'Trip', 'Design review', '09:00–11:00', '00:00', '23:00']) {
    assert.ok(texts.includes(text), 'draws ' + text)
  }
  assert.ok(texts.includes('09:00–09:30 Standup'), 'a short event has one line')
  assert.match(svg, /<title>Now 10:30<\/title>/)
  assert.match(svg, /<title>Design review, Wed, Nov 11 09:00–11:00<\/title>/)
  assert.match(svg, /<title>Offsite, Tue, Nov 10 – Thu, Nov 12, All day<\/title>/)
  assert.match(svg, new RegExp(`stroke="${defaultSvgExportTheme.accent}" stroke-width="2"`), 'the selected event has an outline')
  assert.match(svg, /fill="#ff0000"/, 'the event colour is the accent stripe')
  const { width, height } = svgSize(svg)
  assert.equal(width, 896)
  assert.ok(height > 24 * 48, 'the whole day is drawn')
})

test('renderEventCalendarSvg places overlapping events like layoutCalendarDayEvents', () => {
  const svg = renderEventCalendarSvg(events, date, { width: 56 + 7 * 100, heading: false })
  const placed = layoutCalendarDayEvents(events.filter(event => !event.allDay && event.end - event.start < day), { start: at(11, 0), end: at(12, 0) })
  assert.deepEqual(placed.map(item => [item.id, item.column, item.columns]), [['review', 0, 2], ['standup', 1, 2]])
  // Wednesday is the third column: x = 56 + 2 * 100; two events side by side, 50 px each.
  const box = id => {
    const group = new RegExp(`<title>${id}[^<]*</title>(?:<rect[^>]*stroke="${defaultSvgExportTheme.accent}"[^>]*/>)?<rect x="([\\d.]+)" y="([\\d.]+)" width="([\\d.]+)" height="([\\d.]+)"`).exec(svg)
    return group.slice(1).map(Number)
  }
  const review = box('Design review'), standup = box('Standup')
  assert.equal(review[0], 56 + 200 + 1)
  assert.equal(standup[0], 56 + 200 + 50 + 1)
  assert.equal(review[2], 47)
  assert.equal(review[3], 2 * 48)
  assert.equal(standup[1], review[1])
})

test('renderEventCalendarSvg draws the day view by resource and the month view with "+N more"', () => {
  const resources = [{ id: 'room-a', label: 'Room A', detail: '8 seats' }, { id: 'room-b', label: 'Room B' }]
  const daySvg = renderEventCalendarSvg(events, at(12, 9), { view: 'day', resources, dayStart: 8, dayEnd: 18 })
  assertWellFormed(daySvg)
  const dayTexts = svgTexts(daySvg)
  for (const text of ['Thursday, November 12, 2026', 'Resources', 'Room A', '8 seats', 'Room B', 'Lunch', '08:00', '17:00']) {
    assert.ok(dayTexts.includes(text), 'draws ' + text)
  }
  assert.ok(!dayTexts.includes('18:00') && !dayTexts.includes('07:00'), 'only dayStart to dayEnd')

  const busy = Array.from({ length: 5 }, (_, i) => ({ id: 'e' + i, start: at(18, 9 + i), end: at(18, 10 + i), label: 'Busy ' + i }))
  const month = renderEventCalendarSvg([...events, ...busy], date, { view: 'month', maxMonthLanes: 3 })
  assertWellFormed(month)
  const texts = svgTexts(month)
  assert.ok(texts.includes('November 2026'))
  assert.ok(texts.includes('MON') && texts.includes('SUN'), 'weekday names')
  assert.ok(texts.includes('+3 more'), 'hidden events of a day')
  assert.ok(texts.includes('09:00 Busy 0') && texts.includes('10:00 Busy 1'))
  assert.ok(!texts.includes('11:00 Busy 2'), 'lanes past the limit are hidden')
  assert.ok(texts.includes('Offsite'))
  const weeks = (eventCalendarRange('month', date).end - eventCalendarRange('month', date).start) / (7 * day)
  assert.equal(svgSize(month).height, 36 + 26 + weeks * (26 + 3 * 22 + 6))
})

test('renderEventCalendarSvg follows timeZone, locale, weekStartsOn and right-to-left', () => {
  const svg = renderEventCalendarSvg(events, date, { timeZone: 'Asia/Tokyo', locale: 'ja-JP', weekStartsOn: 0, direction: 'rtl' })
  assertWellFormed(svg)
  const texts = svgTexts(svg)
  assert.ok(texts.some(text => text.includes('18:00')), 'the 09:00 UTC events start at 18:00 in Tokyo')
  assert.ok(texts.some(text => text.includes('11月8日')), 'the week starts on Sunday 8 November, in Japanese')
  assert.match(svg, /direction="rtl"/)
  // The first day column sits next to the gutter on the right.
  const ltr = renderEventCalendarSvg(events, date, { heading: false })
  const rtl = renderEventCalendarSvg(events, date, { heading: false, direction: 'rtl' })
  const columnX = (svg, label) => Number(new RegExp(`<svg x="([\\d.]+)"[^>]*><text[^>]*>${label}<`).exec(svg)[1])
  assert.ok(columnX(rtl, 'Mon, Nov 9') > columnX(rtl, 'Sun, Nov 15'))
  assert.ok(columnX(ltr, 'Mon, Nov 9') < columnX(ltr, 'Sun, Nov 15'))
})

test('renderEventCalendarSvg draws expanded recurring occurrences with the recurring name', () => {
  const series = [{ id: 'sync', start: at(9, 15), end: at(9, 16), label: 'Sync', recurrence: { rule: 'FREQ=DAILY;COUNT=3' } }]
  const occurrences = expandRecurringEvents(series, eventCalendarRange('week', date))
  assert.equal(occurrences.length, 3)
  const svg = renderEventCalendarSvg(occurrences, date, { labels: { recurring: 'Wiederkehrend' } })
  assertWellFormed(svg)
  assert.equal(svg.match(/<title>Sync, [^<]*, Wiederkehrend<\/title>/g).length, 3)
})

test('renderEventCalendarSvg escapes text, is deterministic and validates its input', () => {
  const hostileEvents = [{ id: 'x', start: at(11, 9), end: at(11, 10), label: hostile }]
  const options = { title: hostile, heading: hostile, labels: { allDay: hostile } }
  const svg = renderEventCalendarSvg(hostileEvents, date, options)
  assertWellFormed(svg)
  assert.ok(!svg.includes('<b>'))
  assert.equal(svg, renderEventCalendarSvg(hostileEvents, date, options))
  const copy = structuredClone(events)
  renderEventCalendarSvg(events, date, { view: 'month' })
  assert.deepEqual(events, copy)

  assert.throws(() => renderEventCalendarSvg(events, date, { view: 'agenda' }), { name: 'RangeError', message: /Unsupported event calendar export view: agenda/ })
  assert.throws(() => renderEventCalendarSvg(events, date, { view: 'constructor' }), RangeError)
  assert.throws(() => renderEventCalendarSvg(events, Number.NaN), RangeError)
  assert.throws(() => renderEventCalendarSvg([{ id: 'a', start: 2, end: 1, label: 'A' }], date), RangeError)
  assert.throws(() => renderEventCalendarSvg([{ id: 'a', start: 1, end: 2, label: 'A' }, { id: 'a', start: 1, end: 2, label: 'B' }], date), /Duplicate/)
  assert.throws(() => renderEventCalendarSvg(events, date, { resources: [{ id: 'room-b', label: 'B' }] }), /Unknown resource/)
  assert.throws(() => renderEventCalendarSvg(events, date, { dayStart: 10, dayEnd: 10 }), RangeError)
  assert.throws(() => renderEventCalendarSvg(events, date, { hourHeight: -1 }), RangeError)
  assert.throws(() => renderEventCalendarSvg(events, date, { width: Infinity }), RangeError)
  assert.throws(() => renderEventCalendarSvg(events, date, { maxMonthLanes: 0 }), RangeError)
  assert.throws(() => renderEventCalendarSvg(events, date, { timeZone: 'Mars/Base' }), RangeError)
  assert.throws(() => renderEventCalendarSvg(events, date, { locale: 'x-invalid-locale-$' }), RangeError)
  assert.throws(() => renderEventCalendarSvg([{ id: 'c', start: at(11, 9), end: at(11, 10), label: 'C', color: 'url(#evil)' }], date), RangeError)
})
