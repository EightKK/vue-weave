import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import {
  buildWorkPeriods, createTimeScale, defaultSvgExportTheme, invertWorkPeriods, renderTimelineSvg, scheduleTasks, scheduledBarFields,
  validateTimelineData,
} from 'vue-weave/core'
import { GanttChart } from 'vue-weave'

const hour = 3_600_000

test('invertWorkPeriods returns the sorted gaps between work periods inside the range', () => {
  const range = { start: 0, end: 30 }
  assert.deepEqual(invertWorkPeriods([{ start: 5, end: 9 }, { start: 0, end: 4 }, { start: 24, end: 30 }], range), [
    { start: 4, end: 5 }, { start: 9, end: 24 },
  ])
  // Leading and trailing time off, periods reaching outside the range and a period that only touches its end.
  assert.deepEqual(invertWorkPeriods([{ start: -10, end: 2 }, { start: 10, end: 12 }, { start: 30, end: 40 }], range), [
    { start: 2, end: 10 }, { start: 12, end: 30 },
  ])
})

test('invertWorkPeriods merges touching and overlapping periods and handles empty or full coverage', () => {
  const range = { start: 0, end: 20 }
  assert.deepEqual(invertWorkPeriods([{ start: 2, end: 6 }, { start: 6, end: 8 }, { start: 4, end: 7 }, { start: 12, end: 14 }], range), [
    { start: 0, end: 2 }, { start: 8, end: 12 }, { start: 14, end: 20 },
  ])
  assert.deepEqual(invertWorkPeriods([], range), [{ start: 0, end: 20 }])
  assert.deepEqual(invertWorkPeriods([{ start: 0, end: 10 }, { start: 10, end: 20 }], range), [])
  assert.deepEqual(invertWorkPeriods([{ start: 25, end: 30 }], range), [{ start: 0, end: 20 }])
})

test('invertWorkPeriods validates its input and does not mutate it', () => {
  const periods = Object.freeze([Object.freeze({ start: 4, end: 2 })])
  assert.throws(() => invertWorkPeriods(periods, { start: 0, end: 10 }), RangeError)
  assert.throws(() => invertWorkPeriods([{ start: 1, end: 1 }], { start: 0, end: 10 }), RangeError)
  assert.throws(() => invertWorkPeriods([{ start: 0.5, end: 2 }], { start: 0, end: 10 }), RangeError)
  assert.throws(() => invertWorkPeriods([{ start: 0, end: Number.NaN }], { start: 0, end: 10 }), RangeError)
  assert.throws(() => invertWorkPeriods([], { start: 10, end: 10 }), RangeError)
  assert.throws(() => invertWorkPeriods([], { start: 0, end: Infinity }), RangeError)
  const input = [{ start: 6, end: 8 }, { start: 2, end: 4 }]
  const copy = structuredClone(input)
  invertWorkPeriods(input, { start: 0, end: 10 })
  assert.deepEqual(input, copy)
})

test('invertWorkPeriods turns a weekly calendar into its non-working time', () => {
  const day = 24 * hour
  const range = { start: Date.UTC(2026, 10, 9), end: Date.UTC(2026, 10, 9) + day }
  const shifts = buildWorkPeriods(range, { weekly: [{ weekday: 1, startMinute: 8 * 60, endMinute: 12 * 60 }, { weekday: 1, startMinute: 13 * 60, endMinute: 17 * 60 }] })
  assert.deepEqual(invertWorkPeriods(shifts, range).map(gap => [(gap.start - range.start) / hour, (gap.end - range.start) / hour]), [
    [0, 8], [12, 13], [17, 24],
  ])
})

function plan() {
  const result = scheduleTasks({
    range: { start: 0, end: 30 },
    calendars: [{ id: 'shift', periods: [{ start: 0, end: 4 }, { start: 5, end: 9 }, { start: 24, end: 30 }] }],
    defaultCalendarId: 'shift',
    tasks: [{ id: 'cut', duration: 6 }, { id: 'side', duration: 2 }, { id: 'done', duration: 0 }],
    dependencies: [{ id: 'cut-done', from: 'cut', to: 'done' }],
  })
  assert.ok(result.ok)
  return result
}

test('scheduledBarFields derives dates, criticality, latest finish and split segments', () => {
  const result = plan()
  const [cut, side, done] = result.tasks
  assert.deepEqual(scheduledBarFields(cut), {
    start: 0, end: 7, critical: true, latestEnd: 7, segments: [{ start: 0, end: 4 }, { start: 5, end: 7 }],
  })
  // One work segment and milestones have no segments field at all.
  const sideFields = scheduledBarFields(side)
  assert.deepEqual(sideFields, { start: 0, end: 2, critical: false, latestEnd: 7 })
  assert.ok(!('segments' in sideFields))
  assert.deepEqual(scheduledBarFields(done), { start: 7, end: 7, critical: true, latestEnd: 7 })
  // The fields are valid bar input, including for the milestone.
  validateTimelineData([{ id: 'r', label: 'R' }], result.tasks.map(task => ({ id: task.id, rowId: 'r', label: task.id, ...scheduledBarFields(task) })))
})

test('scheduledBarFields returns new values and never mutates the task', () => {
  const task = plan().tasks[0]
  const snapshot = structuredClone(task)
  const frozen = Object.freeze({ ...task, work: Object.freeze(task.work.map(segment => Object.freeze({ ...segment }))) })
  const fields = scheduledBarFields(frozen)
  assert.deepEqual(task, snapshot)
  assert.notEqual(fields.segments, frozen.work)
  assert.notEqual(fields.segments[0], frozen.work[0])
  fields.segments[0].start = -1
  assert.equal(frozen.work[0].start, 0)
  assert.throws(() => scheduledBarFields({ ...task, latestEnd: task.end - 1 }), RangeError)
  assert.throws(() => scheduledBarFields({ ...task, end: Number.NaN }), RangeError)
})

const rows = [{ id: 'r', label: 'Row' }]
const base = { id: 'b', rowId: 'r', label: 'Bar', start: 2 * hour, end: 6 * hour }

test('validateTimelineData accepts the new bar fields', () => {
  validateTimelineData(rows, [{
    ...base, critical: true, latestEnd: 6 * hour, deadline: hour,
    segments: [{ start: 2 * hour, end: 3 * hour }, { start: 3 * hour, end: 4 * hour }, { start: 5 * hour, end: 6 * hour }],
  }])
  validateTimelineData(rows, [{ ...base, start: hour, end: hour, critical: false, latestEnd: 2 * hour, deadline: 0 }])
})

test('validateTimelineData rejects an invalid latest finish or deadline', () => {
  for (const latestEnd of [Number.NaN, Infinity, 5 * hour]) {
    assert.throws(() => validateTimelineData(rows, [{ ...base, latestEnd }]), RangeError)
  }
  for (const deadline of [Number.NaN, -Infinity]) {
    assert.throws(() => validateTimelineData(rows, [{ ...base, deadline }]), RangeError)
  }
})

test('validateTimelineData rejects unsorted, overlapping, empty or out-of-bar segments and segmented milestones', () => {
  const invalid = [
    [],
    [{ start: 4 * hour, end: 5 * hour }, { start: 2 * hour, end: 3 * hour }],
    [{ start: 2 * hour, end: 4 * hour }, { start: 3 * hour, end: 5 * hour }],
    [{ start: 3 * hour, end: 3 * hour }],
    [{ start: hour, end: 3 * hour }],
    [{ start: 5 * hour, end: 7 * hour }],
    [{ start: 2 * hour, end: Number.NaN }],
  ]
  for (const segments of invalid) {
    assert.throws(() => validateTimelineData(rows, [{ ...base, segments }]), RangeError, JSON.stringify(segments))
  }
  assert.throws(() => validateTimelineData(rows, [{ ...base, end: base.start, segments: [] }]), /milestone cannot have segments/)
  assert.throws(() => validateTimelineData(rows, [{ ...base, end: base.start, segments: [{ start: 2 * hour, end: 3 * hour }] }]), RangeError)
})

const segmented = {
  ...base, critical: true, latestEnd: 8 * hour, deadline: 5 * hour, progress: 0.5,
  segments: [{ start: 2 * hour, end: 3 * hour }, { start: 4 * hour, end: 6 * hour }],
}
const exportScale = createTimeScale({ start: 0, end: 10 * hour }, 10 / hour)

test('renderTimelineSvg draws shading, critical outlines, float lines, deadlines and segments', () => {
  const svg = renderTimelineSvg(rows, [segmented], [], exportScale, {
    labelWidth: 100, nonWorkingPeriods: [{ start: 3 * hour, end: 4 * hour }, { start: 9 * hour, end: 12 * hour }],
  })
  const theme = defaultSvgExportTheme
  // Shading lies inside the time area, behind every tick line, and is clipped to the window.
  assert.match(svg, new RegExp(`<rect x="130" width="10" y="40" height="66" fill="${theme.nonWorking}"/>`))
  assert.match(svg, new RegExp(`<rect x="190" width="10" y="40" height="66" fill="${theme.nonWorking}"/>`))
  assert.ok(svg.indexOf(theme.nonWorking) < svg.indexOf('<line'), 'shading is drawn before the grid lines')
  assert.equal(svg.match(/class="vft-gantt-segment"/g)?.length, 2)
  assert.equal(svg.match(/class="vft-gantt-segment-gap"/g)?.length, 1)
  assert.match(svg, /<rect x="120" width="10" y="47" height="52" class="vft-gantt-segment" rx="4" fill="[^"]+" stroke="#b42318" stroke-width="2"\/>/)
  // Half of three working hours is complete: all of the first hour and half an hour of the second piece.
  assert.match(svg, /<rect x="120" y="47" width="10" height="52" rx="4" fill="#ffffff" fill-opacity="0\.18"\/>/)
  assert.match(svg, /<rect x="140" y="47" width="5" height="52" rx="4" fill="#ffffff" fill-opacity="0\.18"\/>/)
  assert.match(svg, /<g class="vft-critical vft-late">/)
  assert.match(svg, /<g class="vft-gantt-float"><line x1="160" y1="73" x2="180" y2="73" stroke="#5b7083" stroke-width="2"\/>/)
  assert.match(svg, /<g class="vft-gantt-deadline vft-late"><title>Bar 05:00<\/title><line x1="150"/)
  assert.match(svg, /stroke="#a74f08" stroke-width="2" stroke-dasharray="4 3"/)
})

test('renderTimelineSvg mirrors the new layers right to left and reads theme overrides', () => {
  const svg = renderTimelineSvg(rows, [segmented], [], exportScale, {
    labelWidth: 100, direction: 'rtl', nonWorkingPeriods: [{ start: 3 * hour, end: 4 * hour }],
    theme: { nonWorking: '#010203', critical: '#040506', float: '#070809', deadline: '#0a0b0c' },
  })
  // The axis runs from x = 100 (range start) down to 0, so [3 h, 4 h) sits at 60–70.
  assert.match(svg, /<rect x="60" width="10" y="40" height="66" fill="#010203"\/>/)
  assert.match(svg, /<rect x="70" width="10" y="47" height="52" class="vft-gantt-segment" rx="4" fill="[^"]+" stroke="#040506"/)
  assert.match(svg, /<line x1="20" y1="73" x2="40" y2="73" stroke="#070809"/)
  assert.match(svg, /<line x1="21" y1="69" x2="21" y2="77" stroke="#070809"/)
  assert.match(svg, /<line x1="50" y1="44" x2="50" y2="102" stroke="#0a0b0c"/)
})

test('renderTimelineSvg is unchanged without the new inputs and validates nonWorkingPeriods', () => {
  const plain = renderTimelineSvg(rows, [{ ...base, progress: 0.5 }], [], exportScale)
  assert.equal(renderTimelineSvg(rows, [{ ...base, progress: 0.5, critical: false }], [], exportScale, { nonWorkingPeriods: [] }), plain)
  assert.doesNotMatch(plain, /class="vft-|stroke-width="2"|#eaeff3/)
  for (const period of [{ start: 2, end: 2 }, { start: 3, end: 1 }, { start: Number.NaN, end: 1 }, { start: 0, end: Infinity }]) {
    assert.throws(() => renderTimelineSvg(rows, [base], [], exportScale, { nonWorkingPeriods: [period] }), RangeError)
  }
})

const chartProps = { rows, range: { start: 0, end: 10 * hour }, pixelsPerUnit: 10 / hour }

test('GanttChart renders shading, critical, float, deadline and segments on the server', async () => {
  const html = await renderToString(createSSRApp({ render: () => h(GanttChart, {
    ...chartProps, bars: [{ ...segmented, editable: true }],
    nonWorkingPeriods: [{ start: 3 * hour, end: 4 * hour }, { start: 3.5 * hour, end: 4.5 * hour }, { start: 20 * hour, end: 30 * hour }],
  }) }))
  // Overlapping intervals are drawn as given; intervals outside the window are not rendered.
  assert.match(html, /<div class="vft-gantt-non-working-layer" aria-hidden="true"><!--\[--><span class="vft-gantt-non-working" style="left:30px;width:10px;"><\/span><span class="vft-gantt-non-working" style="left:35px;width:10px;"><\/span><!--\]--><\/div><div class="vft-gantt-grid"/)
  assert.match(html, /class="vft-gantt-bar vft-tone-blue solid editable vft-critical vft-late vft-segmented"/)
  assert.match(html, /<span class="vft-gantt-segment" style="left:-1px;width:10px;" aria-hidden="true"><span class="vft-bar-progress" style="width:100%;"><\/span><\/span>/)
  assert.match(html, /<span class="vft-gantt-segment" style="left:19px;width:20px;" aria-hidden="true"><span class="vft-bar-progress" style="width:25%;"><\/span><\/span>/)
  assert.match(html, /<span class="vft-gantt-segment-gap" style="left:9px;width:10px;" aria-hidden="true">/)
  assert.match(html, /<div class="vft-gantt-float" style="left:calc\(var\(--vft-label-area-width\) \+ 60px\);width:20px;top:29px;" aria-hidden="true">/)
  assert.match(html, /<div class="vft-gantt-deadline vft-late" style="left:calc\(var\(--vft-label-area-width\) \+ 45px\);top:4px;height:58px;" aria-hidden="true">/)
  // The information is in the accessible description, not the accessible name.
  assert.match(html, /aria-label="Bar 02:00–06:00"/)
  const describedBy = /aria-describedby="([^"]+)"/.exec(html)[1].split(' ')
  assert.equal(describedBy.length, 2)
  assert.match(describedBy[1], /-hint$/)
  assert.match(html, new RegExp(`<span id="${describedBy[0]}" hidden>Critical\\. Float until 08:00\\. Deadline 05:00\\. Late\\.</span>`))
})

test('GanttChart localizes the bar description and mirrors the new layers right to left', async () => {
  const html = await renderToString(createSSRApp({ render: () => h(GanttChart, {
    ...chartProps, dir: 'rtl', bars: [{ ...segmented, id: 'b2' }], nonWorkingPeriods: [{ start: 3 * hour, end: 4 * hour }],
    labels: { critical: 'Kritisch', float: 'Puffer bis', deadline: 'Frist', late: 'Verspätet' },
  }) }))
  assert.match(html, /<span class="vft-gantt-non-working" style="right:30px;width:10px;">/)
  assert.match(html, /<span class="vft-gantt-segment" style="right:19px;width:20px;"/)
  assert.match(html, /class="vft-gantt-float" style="right:calc\(var\(--vft-label-area-width\) \+ 60px\)/)
  assert.match(html, /class="vft-gantt-deadline vft-late" style="right:calc\(var\(--vft-label-area-width\) \+ 45px\)/)
  // A bar that is not editable is described by its overlay text alone.
  const id = /aria-describedby="([^" ]+)"/.exec(html)[1]
  assert.match(html, new RegExp(`<span id="${id}" hidden>Kritisch\\. Puffer bis 08:00\\. Frist 05:00\\. Verspätet\\.</span>`))
})

test('GanttChart places shading, segments and float lines with a custom scale', async () => {
  // A piecewise scale: the first 5 hours at 20 px per hour, the rest at 4 px per hour.
  const scale = {
    width: 120,
    toX: time => time <= 5 * hour ? time / hour * 20 : 100 + (time - 5 * hour) / hour * 4,
    toTime: x => x <= 100 ? x / 20 * hour : 5 * hour + (x - 100) / 4 * hour,
  }
  for (const time of [0, 2.5 * hour, 5 * hour, 7.5 * hour, 10 * hour]) assert.equal(scale.toTime(scale.toX(time)), time)
  const html = await renderToString(createSSRApp({ render: () => h(GanttChart, {
    ...chartProps, scale, bars: [segmented], nonWorkingPeriods: [{ start: 4 * hour, end: 6 * hour }],
  }) }))
  assert.match(html, /<span class="vft-gantt-non-working" style="left:80px;width:24px;"><\/span>/)
  assert.match(html, /<span class="vft-gantt-segment" style="left:-1px;width:20px;"/)
  assert.match(html, /<span class="vft-gantt-segment" style="left:39px;width:24px;"/)
  assert.match(html, /class="vft-gantt-float" style="left:calc\(var\(--vft-label-area-width\) \+ 104px\);width:8px;/)
})

test('GanttChart markup, names and descriptions are unchanged without the new inputs', async () => {
  const bars = [{ ...base, editable: true, progress: 0.5 }, { ...base, id: 'm', start: 7 * hour, end: 7 * hour }]
  const render = props => renderToString(createSSRApp({ render: () => h(GanttChart, { ...chartProps, ...props }) }))
  const plain = await render({ bars })
  assert.equal(await render({ bars: bars.map(bar => ({ ...bar, critical: false })), nonWorkingPeriods: [] }), plain)
  assert.doesNotMatch(plain, /vft-gantt-non-working|vft-critical|vft-late|vft-segmented|vft-gantt-segment|vft-gantt-float|vft-gantt-deadline|hidden>/)
  assert.match(plain, /title="Bar 02:00–06:00" aria-label="Bar 02:00–06:00" aria-pressed="false" aria-describedby="v-0-hint"/)
  assert.match(plain, /<span class="vft-bar-progress" style="width:50%;" aria-hidden="true"><\/span>/)
  assert.match(plain, /title="Bar 07:00–07:00" aria-label="Bar 07:00–07:00" aria-pressed="false">/)
})

test('GanttChart reports invalid nonWorkingPeriods and new bar fields through validation-error', async () => {
  for (const [props, expected] of [
    [{ bars: [base], nonWorkingPeriods: [{ start: 2 * hour, end: hour }] }, /nonWorkingPeriods/],
    [{ bars: [base], nonWorkingPeriods: [{ start: 0, end: Number.NaN }] }, /nonWorkingPeriods/],
    [{ bars: [{ ...base, latestEnd: hour }] }, /latestEnd/],
    [{ bars: [{ ...base, end: base.start, segments: [] }] }, /milestone/],
  ]) {
    const reported = []
    const app = createSSRApp({ render: () => h(GanttChart, { ...chartProps, ...props, onValidationError: error => reported.push(error) }) })
    app.config.errorHandler = () => {}
    const html = await renderToString(app)
    assert.equal(reported.length, 1)
    assert.ok(reported[0] instanceof RangeError)
    assert.match(reported[0].message, expected)
    assert.match(html, /No rows to display/)
    assert.doesNotMatch(html, /vft-gantt-canvas/)
  }
})
