import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { buildWorkPeriods, createTimeScale, createWorkingTimeScale, defaultNonWorkingRatio, invertWorkPeriods } from 'vue-weave/core'
import { GanttChart } from 'vue-weave'

const hour = 3_600_000
const day = 24 * hour
const range = { start: 0, end: 10 * hour }
// Working 2-4 h and 6-9 h.
const periods = [{ start: 2 * hour, end: 4 * hour }, { start: 6 * hour, end: 9 * hour }]
const close = (a, b, message) => assert.ok(Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b)), `${message ?? ''} ${a} vs ${b}`)
const px = 100 / hour

test('working time gets the base width and non-working time the compressed width', () => {
  const scale = createWorkingTimeScale(range, periods, px, 0.25)
  assert.equal(defaultNonWorkingRatio, 0.1)
  assert.equal(scale.toX(range.start), 0)
  assert.equal(scale.toX(range.end), scale.width)
  // Gaps: 0-2 h, 4-6 h and 9-10 h (5 h) at 25 px/h; work: 5 h at 100 px/h.
  close(scale.width, 5 * 100 + 5 * 25)
  close(scale.toX(2 * hour), 50)
  close(scale.toX(4 * hour), 250)
  close(scale.toX(6 * hour), 300)
  close(scale.toX(9 * hour), 600)
  close(scale.toX(3 * hour), 150)
  // A ratio of 1 is the plain linear scale.
  const linear = createWorkingTimeScale(range, periods, px, 1)
  const reference = createTimeScale(range, px)
  for (let time = -hour; time <= 11 * hour; time += hour / 3) close(linear.toX(time), reference.toX(time))
})

test('round trips hold at boundaries, inside segments and outside the range', () => {
  const scale = createWorkingTimeScale(range, periods, px)
  for (const time of [0, 2 * hour, 4 * hour, 6 * hour, 9 * hour, 10 * hour]) {
    assert.equal(scale.toTime(scale.toX(time)), time)
  }
  for (const x of [0, scale.width]) assert.equal(scale.toX(scale.toTime(x)), x)
  for (let time = -5 * hour; time <= 15 * hour; time += hour / 7) close(scale.toTime(scale.toX(time)), time)
  for (let x = -300; x <= scale.width + 300; x += 3.7) close(scale.toX(scale.toTime(x)), x)
  // Extrapolation keeps the slope of the edge segment (non-working at both ends here).
  close(scale.toX(-hour), -hour * px * 0.1)
  close(scale.toX(11 * hour) - scale.width, hour * px * 0.1)
  const workEdge = createWorkingTimeScale(range, [{ start: 0, end: 10 * hour }], px)
  close(workEdge.toX(-hour), -100)
  close(workEdge.toX(11 * hour), workEdge.width + 100)
})

test('the scale is strictly increasing and continuous', () => {
  const scale = createWorkingTimeScale(range, periods, px, 0.01)
  let previous = scale.toX(-3 * hour)
  for (let time = -3 * hour + 60_000; time <= 13 * hour; time += 60_000) {
    const x = scale.toX(time)
    assert.ok(x > previous, `toX increases at ${time}`)
    previous = x
  }
  for (const boundary of [2 * hour, 4 * hour, 6 * hour, 9 * hour]) {
    close(scale.toX(boundary - 1e-3), scale.toX(boundary), 'continuous')
    close(scale.toX(boundary + 1e-3), scale.toX(boundary), 'continuous')
  }
  let previousTime = scale.toTime(-100)
  for (let x = -99; x <= scale.width + 100; x += 1) {
    const time = scale.toTime(x)
    assert.ok(time > previousTime)
    previousTime = time
  }
})

test('periods are clipped, sorted and united; an empty list gives a uniformly compressed scale', () => {
  const messy = [
    { start: 6 * hour, end: 20 * hour },
    { start: -5 * hour, end: -1 * hour },
    { start: 30 * hour, end: 40 * hour },
    { start: 3 * hour, end: 5 * hour },
    { start: 2 * hour, end: 4 * hour },
    { start: 5 * hour, end: 5.5 * hour },
  ]
  const messyScale = createWorkingTimeScale(range, messy, px)
  const cleanScale = createWorkingTimeScale(range, [{ start: 2 * hour, end: 5.5 * hour }, { start: 6 * hour, end: 10 * hour }], px)
  assert.equal(messyScale.width, cleanScale.width)
  for (let time = -hour; time <= 11 * hour; time += hour / 5) assert.equal(messyScale.toX(time), cleanScale.toX(time))
  // The inputs are not modified.
  assert.equal(messy[0].start, 6 * hour)
  const empty = createWorkingTimeScale(range, [], px, 0.2)
  close(empty.width, 10 * 20)
  close(empty.toX(5 * hour), 100)
  close(empty.toTime(100), 5 * hour)
  // Periods that all fall outside the range count as empty.
  close(createWorkingTimeScale(range, [{ start: 20 * hour, end: 30 * hour }], px, 0.2).width, 200)
  // Fully working range.
  close(createWorkingTimeScale(range, [{ start: -hour, end: 20 * hour }], px).width, 1000)
})

test('changing the ratio or pixelsPerUnit changes x only, never times', () => {
  const probes = [0, 2 * hour, 3 * hour, 4.5 * hour, 7 * hour, 10 * hour]
  const a = createWorkingTimeScale(range, periods, px, 0.1)
  const b = createWorkingTimeScale(range, periods, px * 3, 0.5)
  for (const time of probes) {
    assert.notEqual(a.toX(time) === b.toX(time), time !== 0)
    close(a.toTime(a.toX(time)), time)
    close(b.toTime(b.toX(time)), time)
  }
  // Positions scale exactly with pixelsPerUnit at a fixed ratio.
  const c = createWorkingTimeScale(range, periods, px * 4, 0.1)
  for (const time of probes) close(c.toX(time), 4 * a.toX(time))
})

test('round trips hold across the Berlin daylight-saving changes', () => {
  const week = {
    timeZone: 'Europe/Berlin',
    weekly: [1, 2, 3, 4, 5].flatMap(weekday => [
      { weekday, startMinute: 8 * 60, endMinute: 12 * 60 },
      { weekday, startMinute: 13 * 60, endMinute: 17 * 60 },
    ]),
  }
  for (const start of [Date.UTC(2026, 2, 23), Date.UTC(2026, 9, 19)]) {
    const span = { start, end: start + 14 * day }
    const work = buildWorkPeriods(span, week)
    // The clocks change on the Sunday of the second week.
    assert.ok(work.length > 10)
    const scale = createWorkingTimeScale(span, work, 60 / hour, 0.05)
    for (const period of work) {
      assert.equal(scale.toTime(scale.toX(period.start)), period.start)
      assert.equal(scale.toTime(scale.toX(period.end)), period.end)
      close(scale.toX(period.end) - scale.toX(period.start), (period.end - period.start) * 60 / hour)
      const middle = (period.start + period.end) / 2
      close(scale.toTime(scale.toX(middle)), middle)
    }
    for (const gap of invertWorkPeriods(work, span)) {
      close(scale.toX(gap.end) - scale.toX(gap.start), (gap.end - gap.start) * 3 / hour)
      const middle = (gap.start + gap.end) / 2
      close(scale.toTime(scale.toX(middle)), middle)
    }
    // Every working day is 8 h wide at the working width, whichever side of the switch it is on.
    const firstDay = work.filter(period => period.start < work[0].start + day)
    close(firstDay.reduce((total, period) => total + scale.toX(period.end) - scale.toX(period.start), 0), 8 * 60)
  }
})

test('thousands of periods stay exact and fast', () => {
  const count = 5000
  const long = { start: 0, end: count * 2 * hour }
  const many = Array.from({ length: count }, (_, index) => ({ start: index * 2 * hour, end: index * 2 * hour + hour }))
  const scale = createWorkingTimeScale(long, many.reverse(), px, 0.1)
  close(scale.width, count * (100 + 10))
  for (let index = 0; index < count; index += 97) {
    const start = index * 2 * hour
    assert.equal(scale.toTime(scale.toX(start)), start)
    close(scale.toX(start + hour), scale.toX(start) + 100)
    close(scale.toX(start + 2 * hour) - scale.toX(start + hour), 10)
  }
  const begin = performance.now()
  let total = 0
  for (let index = 0; index < 200_000; index++) total += scale.toTime(scale.toX((index * 7919) % long.end))
  assert.ok(Number.isFinite(total))
  assert.ok(performance.now() - begin < 5000)
})

test('inputs are validated', () => {
  assert.throws(() => createWorkingTimeScale({ start: 0, end: 0 }, [], px), RangeError)
  assert.throws(() => createWorkingTimeScale({ start: 5, end: 1 }, [], px), RangeError)
  assert.throws(() => createWorkingTimeScale({ start: 0, end: Number.POSITIVE_INFINITY }, [], px), RangeError)
  assert.throws(() => createWorkingTimeScale({ start: Number.NaN, end: 1 }, [], px), RangeError)
  for (const bad of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) assert.throws(() => createWorkingTimeScale(range, periods, bad), RangeError)
  // A fully collapsed non-working interval would not be invertible.
  for (const bad of [0, -0.1, 1.01, Number.NaN, Number.POSITIVE_INFINITY]) assert.throws(() => createWorkingTimeScale(range, periods, px, bad), RangeError)
  assert.throws(() => createWorkingTimeScale(range, [{ start: 3, end: 3 }], px), RangeError)
  assert.throws(() => createWorkingTimeScale(range, [{ start: 4, end: 3 }], px), RangeError)
  assert.throws(() => createWorkingTimeScale(range, [{ start: 0, end: Number.NaN }], px), RangeError)
  assert.throws(() => createWorkingTimeScale({ start: 0, end: 1e308 }, [], 1e10), RangeError)
})

const rows = [{ id: 'r', label: 'Row' }]
const bars = [
  { id: 'a', rowId: 'r', label: 'Work', start: 2 * hour, end: 4 * hour },
  { id: 'b', rowId: 'r', label: 'Break', start: 4 * hour, end: 6 * hour },
]
const render = props => renderToString(createSSRApp({ render: () => h(GanttChart, { rows, bars, range, snap: hour, formatTime: String, ...props }) }))
const barBox = (html, id) => {
  const match = html.match(new RegExp('class="vw-gantt-bar[^"]*" style="(?:left|right):calc\\(var\\(--vw-label-area-width\\) \\+ ([\\d.]+)px\\);width:([\\d.]+)px[^"]*" data-vw-bar="' + id + '"'))
  assert.ok(match, 'bar ' + id + ' is rendered')
  return { offset: Number(match[1]), width: Number(match[2]) }
}

test('GanttChart renders on the server with the working-time scale and places bars by it', async () => {
  const scale = createWorkingTimeScale(range, periods, px, 0.1)
  for (const dir of [undefined, 'rtl']) {
    const html = await render({ scale, dir })
    const work = barBox(html, 'a')
    const rest = barBox(html, 'b')
    close(work.offset, scale.toX(2 * hour))
    close(work.width, 200)
    close(rest.offset, scale.toX(4 * hour))
    close(rest.width, 20)
    // The same value is positioned from the inline start edge: right-to-left only swaps the CSS property.
    if (dir === 'rtl') assert.match(html, /vw-rtl/)
  }
  // Without the scale the bars are linear again.
  const linear = await render({ pixelsPerUnit: px })
  close(barBox(linear, 'b').width, 200)
})
