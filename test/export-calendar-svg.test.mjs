import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  defaultSvgExportTheme, eventCalendarDays, eventCalendarRange, expandRecurringEvents, layoutCalendarAgenda, layoutCalendarDayEvents,
  renderEventCalendarSvg, renderTaskBoardSvg, renderTreeGridSvg,
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

  assert.throws(() => renderEventCalendarSvg(events, date, { view: 'list' }), { name: 'RangeError', message: /Unsupported event calendar export view: list/ })
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

/** The `<text>` elements of an export with their x, anchor, direction and content, in document order. */
const textRuns = svg => [...svg.matchAll(/<text ([^>]*)>([^<]*)<\/text>/g)].map(([, attributes, text]) => ({
  text, x: Number(/(?:^| )x="([^"]*)"/.exec(attributes)?.[1]),
  anchor: /text-anchor="([^"]*)"/.exec(attributes)?.[1], direction: /(?:^| )direction="([^"]*)"/.exec(attributes)?.[1],
}))

test('renderEventCalendarSvg draws the agenda: day groups with all-day entries first and multi-day events on each day', () => {
  const resources = [{ id: 'room-a', label: 'Room A' }]
  const svg = renderEventCalendarSvg(events, date, { view: 'agenda', resources, now: at(11, 10), selectedId: 'review' })
  assertWellFormed(svg)
  // The days of the week that have events, in the order of layoutCalendarAgenda; Monday 9 November has none.
  const days = eventCalendarDays('agenda', date)
  const agenda = layoutCalendarAgenda(events, days).filter(day => day.items.length)
  assert.deepEqual(agenda.map(day => day.index), [1, 2, 3, 5, 6])
  assert.deepEqual(svgTexts(svg), [
    'Nov 9 – 15, 2026',
    'Tuesday, November 10, 2026', 'All day', 'Offsite',
    'Wednesday, November 11, 2026', 'All day', 'Offsite', '09:00–11:00', 'Design review', '09:00–09:30', 'Standup',
    'Thursday, November 12, 2026', 'All day', 'Offsite', '12:00–13:00', 'Lunch', 'Room A',
    // The trip starts on Saturday morning, covers Sunday completely and ends after the week.
    'Saturday, November 14, 2026', '08:00–', 'Trip',
    'Sunday, November 15, 2026', 'All day', 'Trip',
  ])
  // Entries are named like the component's agenda buttons; today's date is drawn in the accent colour.
  assert.equal(svg.match(/<title>Offsite, Tue, Nov 10 – Thu, Nov 12, All day<\/title>/g).length, 3)
  assert.match(svg, /<title>Lunch, Thu, Nov 12 12:00–13:00, Room A<\/title>/)
  assert.match(svg, new RegExp(`fill="${defaultSvgExportTheme.accent}">Wednesday, November 11, 2026<`))
  assert.match(svg, new RegExp(`fill="${defaultSvgExportTheme.text}">Tuesday, November 10, 2026<`))
  assert.match(svg, new RegExp(`stroke="${defaultSvgExportTheme.accent}" stroke-width="2"`), 'the selected entry has an outline')
  assert.match(svg, /<g class="vw-calendar-agenda">/)
  // Five days, eight entries of 24 px with 4 px gaps, 8 px padding above and below each day.
  const entries = [1, 3, 2, 1, 1]
  assert.equal(svgSize(svg).height, 36 + entries.reduce((sum, n) => sum + n * 24 + (n - 1) * 4 + 16, 0))
})

test('renderEventCalendarSvg follows agendaDays, the empty state and the narrow agenda layout', () => {
  const three = svgTexts(renderEventCalendarSvg(events, date, { view: 'agenda', agendaDays: 3 }))
  assert.equal(three[0], 'Nov 11 – 13, 2026', 'the heading spans the agenda days, as the toolbar title')
  assert.deepEqual(three.filter(text => text.endsWith(', 2026')).slice(1), ['Wednesday, November 11, 2026', 'Thursday, November 12, 2026'])
  assert.ok(!three.includes('Trip'))
  const one = svgTexts(renderEventCalendarSvg(events, date, { view: 'agenda', agendaDays: 1 }))
  assert.equal(one[0], 'Wednesday, November 11, 2026', 'a one-day agenda is titled with the long date')
  assert.throws(() => renderEventCalendarSvg(events, date, { view: 'agenda', agendaDays: 0 }), { name: 'RangeError', message: /agendaDays/ })
  assert.throws(() => renderEventCalendarSvg(events, date, { view: 'agenda', agendaDays: 1.5 }), RangeError)

  const empty = renderEventCalendarSvg([], date, { view: 'agenda' })
  assertWellFormed(empty)
  assert.deepEqual(svgTexts(empty), ['Nov 9 – 15, 2026', 'No events to display'])
  assert.equal(svgSize(empty).height, 36 + 64)
  assert.deepEqual(svgTexts(renderEventCalendarSvg(events, at(30, 9), { view: 'agenda', heading: false, labels: { empty: 'Keine Termine' } })), ['Keine Termine'])

  // Below 700 px the date sits above the entries, which take the whole width.
  const narrow = renderEventCalendarSvg(events, date, { view: 'agenda', width: 500, heading: false })
  assert.match(narrow, /<svg x="12" y="8" width="476" height="24" overflow="hidden"><text[^>]*>Tuesday, November 10, 2026</)
  assert.match(narrow, /<rect x="12" y="36" width="476" height="24" rx="4"/)
  const wide = renderEventCalendarSvg(events, date, { view: 'agenda', width: 900, heading: false })
  assert.match(wide, /<svg x="12" y="8" width="156" height="24" overflow="hidden"><text[^>]*>Tuesday, November 10, 2026</)
  assert.match(wide, /<rect x="180" y="8" width="708" height="24" rx="4"/)
})

test('renderEventCalendarSvg draws the agenda in the time zone, locale and direction of the calendar', () => {
  const svg = renderEventCalendarSvg(events, date, { view: 'agenda', timeZone: 'Asia/Tokyo', locale: 'ja-JP', direction: 'rtl', heading: false, width: 900 })
  assertWellFormed(svg)
  const texts = svgTexts(svg)
  // 09:00 UTC is 18:00 in Tokyo; the trip starts at 17:00 on the 14th there. Times keep their left-to-right order.
  assert.ok(texts.includes('2026年11月11日水曜日'))
  const runs = textRuns(svg)
  for (const time of ['18:00–20:00', '17:00–', 'All day']) {
    assert.deepEqual(runs.find(run => run.text === time), { text: time, x: 700, anchor: 'end', direction: undefined }, time + ': left to right, ending at the inline start')
  }
  // The date column is at the right edge and the entries to its left, with the accent stripe at their right edge.
  assert.match(svg, /<svg x="732" y="8" width="156" height="24" overflow="hidden"><text x="156"[^>]*direction="rtl"/)
  assert.match(svg, /<rect x="12" y="8" width="708" height="24" rx="4"[^>]*\/><rect x="717" y="8" width="3"/)
})

test('right-to-left exports keep times left to right at the inline start and the title after them; left-to-right text is unchanged', () => {
  const late = [{ id: 'late', start: at(11, 21), end: at(11, 22), label: 'Late deploy' }]
  const formatTime = time => `${new Date(time).getUTCHours() % 12}:00 ${new Date(time).getUTCHours() < 12 ? 'AM' : 'PM'}`
  // The time and the title are separate runs: the time is left-to-right text whose right end is at the inline start
  // of the event box, the title right-to-left text starting one estimated time and space (0.6 em per character) further
  // left. No Unicode isolates or bidi reordering are involved, so every renderer places them alike.
  const pair = (svg, time) => {
    const runs = textRuns(svg)
    const index = runs.findIndex(run => run.text === time)
    return [runs[index], runs[index + 1]]
  }
  const estimate = (text, size) => [...text].length * size * 0.6
  const at3 = n => Math.round(n * 1000) / 1000
  const monthSvg = renderEventCalendarSvg(late, date, { view: 'month', direction: 'rtl' })
  assertWellFormed(monthSvg)
  assert.doesNotMatch(monthSvg, /[⁦-⁩]/)
  const [time, title] = pair(monthSvg, '21:00')
  assert.deepEqual(time, { text: '21:00', x: time.x, anchor: 'end', direction: undefined }, 'month: the time is left to right, ending at the inline start')
  assert.deepEqual(title, { text: 'Late deploy', x: at3(time.x - estimate('21:00 ', 11)), anchor: undefined, direction: 'rtl' })
  const [twelve, twelveTitle] = pair(renderEventCalendarSvg(late, date, { view: 'month', direction: 'rtl', formatTime }), '9:00 PM')
  assert.equal(twelve.anchor, 'end', 'a 12-hour time is one left-to-right run, not split by the title')
  assert.equal(twelveTitle.x, at3(twelve.x - estimate('9:00 PM ', 11)))
  const week = textRuns(renderEventCalendarSvg(late, date, { direction: 'rtl' }))
  assert.equal(week.find(run => run.text === '21:00–22:00')?.anchor, 'end', 'a range keeps its left-to-right order')
  assert.equal(week.find(run => run.text === 'Late deploy')?.direction, 'rtl')
  const [short, shortTitle] = pair(renderEventCalendarSvg(late, date, { direction: 'rtl', hourHeight: 24 }), '21:00–22:00')
  assert.equal(short.anchor, 'end')
  assert.deepEqual(shortTitle, { text: 'Late deploy', x: at3(short.x - estimate('21:00–22:00 ', 11)), anchor: undefined, direction: 'rtl' })
  // Left-to-right output keeps one run per line.
  assert.ok(svgTexts(renderEventCalendarSvg(late, date, { view: 'month' })).includes('21:00 Late deploy'))
  assert.ok(svgTexts(renderEventCalendarSvg(late, date)).includes('21:00–22:00'))
  assert.ok(svgTexts(renderEventCalendarSvg(late, date, { hourHeight: 24 })).includes('21:00–22:00 Late deploy'))
  assert.doesNotMatch(renderEventCalendarSvg(late, date, { view: 'agenda' }), /[⁦-⁩]/)
  // The accessible names in <title> are not changed.
  assert.match(renderEventCalendarSvg(late, date, { view: 'month', direction: 'rtl' }), /<title>Late deploy, Wed, Nov 11 21:00–22:00<\/title>/)
})

test('the agenda export escapes text, is deterministic and does not change its input', () => {
  const hostileEvents = [
    { id: 'x', start: at(11, 9), end: at(11, 10), label: hostile, resourceId: 'r' },
    { id: 'y', start: at(12, 0), end: at(13, 0), label: hostile, allDay: true },
  ]
  const resources = [{ id: 'r', label: hostile }]
  const options = { view: 'agenda', resources, title: hostile, heading: hostile, labels: { allDay: hostile, empty: hostile }, direction: 'rtl' }
  const copy = structuredClone(hostileEvents)
  const svg = renderEventCalendarSvg(hostileEvents, date, options)
  assertWellFormed(svg)
  assert.ok(!svg.includes('<b>'))
  assert.equal(svg, renderEventCalendarSvg(hostileEvents, date, options))
  assert.deepEqual(hostileEvents, copy)
  const empty = renderEventCalendarSvg([], date, options)
  assertWellFormed(empty)
  assert.ok(!empty.includes('<b>'))
  assert.throws(() => renderEventCalendarSvg(events, date, { view: 'agenda', labels: { empty: 3 } }), TypeError)
})

test('the core renderers write colours that need a stylesheet as given, like renderGraphSvg and renderTimelineSvg', () => {
  // Without a DOM nothing can compute var() or currentColor: a colour that passes the colour check is written as is
  // (the components resolve such colours before they call these renderers), and a reference to a resource throws.
  for (const colour of ['var(--booking-color)', 'var(--booking-color, #123456)', 'currentColor', 'color-mix(in srgb, red 40%, blue)']) {
    const pattern = new RegExp('fill="' + colour.replace(/[()+.,%]/g, '\\$&') + '"')
    const calendar = renderEventCalendarSvg([{ id: 'b', start: at(11, 9), end: at(11, 10), label: 'Booking', color: colour }], date)
    assert.match(calendar, pattern, colour)
    assertWellFormed(calendar)
    const board = renderTaskBoardSvg([{ id: 'a', columnId: 'c', label: 'A' }, { id: 'b', columnId: 'c', label: 'B' }], [{ id: 'c', label: 'C', wipLimit: 1 }], { wipWarningColor: colour })
    assert.match(board, pattern, colour)
    const grid = renderTreeGridSvg([{ id: 'r', label: 'R' }], [{ id: 'x', label: 'X', width: 50 }], { highlightedRowIds: ['r'], highlightColor: colour, selectedRowIds: ['r'], selectedColor: colour })
    assert.match(grid, pattern, colour)
  }
  for (const colour of ['url(#p)', 'var(--x) url(#p)', 'red;fill:url(#p)']) {
    assert.throws(() => renderEventCalendarSvg([{ id: 'b', start: at(11, 9), end: at(11, 10), label: 'B', color: colour }], date), RangeError, colour)
  }
})

test('the core renderers call back with the objects they were given, so class instances keep their methods', () => {
  class Item {
    constructor(fields) { Object.assign(this, fields) }
    exportLabel() { return 'Exported ' + this.label }
    get kind() { return 'item' }
  }
  const items = [
    Object.freeze(new Item({ id: 'a', start: at(11, 9), end: at(11, 10), label: 'A', color: '#c81e78' })),
    new Item({ id: 'b', start: at(10, 0), end: at(12, 0), label: 'B', allDay: true, color: 'var(--x)' }),
  ]
  for (const view of ['day', 'week', 'month', 'agenda']) {
    const seen = []
    const svg = renderEventCalendarSvg(items, date, { view, eventLabel: event => { seen.push(event); return event.exportLabel() } })
    assert.match(svg, /Exported A/, view)
    assert.match(svg, /fill="#c81e78"/, view)
    assert.ok(seen.length > 0 && seen.every(event => items.includes(event)), view)
  }
  const cards = [new Item({ id: 'c', columnId: 'todo', label: 'C' })]
  const seenCards = []
  const board = renderTaskBoardSvg(cards, [{ id: 'todo', label: 'To do' }], { cardLabel: card => { seenCards.push(card); return card.exportLabel() } })
  assert.match(board, /Exported C/)
  assert.ok(seenCards.length > 0 && seenCards.every(card => card === cards[0]))
  const rows = [new Item({ id: 'r', label: 'R', data: { qty: 3 } })]
  const seenRows = []
  const grid = renderTreeGridSvg(rows, [{ id: 'q', label: 'Q', width: 50, value: row => row.data.qty }], {
    formatValue: (value, { row }) => { seenRows.push(row); return row.kind + ' ' + value },
  })
  assert.match(grid, /item 3/)
  assert.ok(seenRows.length > 0 && seenRows.every(row => row === rows[0]))
})
