import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import {
  baselineVariance, createTimeScale, defaultSvgExportTheme, renderTimelineSvg, timelineBaseline, timelineBaselineId,
  timelineBaselineIds, timelineBaselineLimit, toMsProjectXml, validateTimelineData,
} from 'vue-weave/core'
import { GanttChart } from 'vue-weave'

const hour = 3_600_000
const rows = [{ id: 'r', label: 'Row' }, { id: 's', label: 'Second' }]
const legacyBars = [
  { id: 'x', rowId: 'r', label: 'X', start: 2 * hour, end: 4 * hour, baseline: { start: hour, end: 3 * hour } },
  { id: 'y', rowId: 's', label: 'Y', start: 5 * hour, end: 6 * hour, baseline: { start: 5 * hour, end: 5 * hour } },
]
// The legacy baseline plus two named sets on one bar, listed in the order rev1, plan.
const named = [
  { ...legacyBars[0], baselines: [{ id: 'rev1', start: 2 * hour, end: 5 * hour }, { id: 'plan', start: hour, end: 2 * hour }] },
  { ...legacyBars[1], baselines: [{ id: 'plan', start: 4 * hour, end: 5 * hour }] },
]
const range = { start: 0, end: 8 * hour }
const chartProps = { rows, range, pixelsPerUnit: 20 / hour }
const render = (props = {}) => renderToString(createSSRApp({ render: () => h(GanttChart, { ...chartProps, bars: legacyBars, ...props }) }))
const strips = html => html.match(/<div class="vw-gantt-baseline[^>]*>/g) ?? []
const scale = createTimeScale(range, 20 / hour)

test('timelineBaseline, timelineBaselineIds and the reserved set ID', () => {
  assert.equal(timelineBaselineId, '$baseline')
  assert.equal(timelineBaselineLimit, 3)
  assert.deepEqual(timelineBaseline(named[0], timelineBaselineId), { start: hour, end: 3 * hour })
  assert.deepEqual(timelineBaseline(named[0], 'plan'), { id: 'plan', start: hour, end: 2 * hour })
  assert.equal(timelineBaseline(named[0], 'missing'), undefined)
  assert.equal(timelineBaseline({}, timelineBaselineId), undefined)
  // The legacy set first, then named sets in order of first appearance.
  assert.deepEqual(timelineBaselineIds(named), [timelineBaselineId, 'rev1', 'plan'])
  assert.deepEqual(timelineBaselineIds([named[1], named[0]]), [timelineBaselineId, 'plan', 'rev1'])
  assert.deepEqual(timelineBaselineIds(legacyBars), [timelineBaselineId])
  assert.deepEqual(timelineBaselineIds([{ baselines: [{ id: 'a', start: 0, end: 1 }] }]), ['a'])
  assert.deepEqual(timelineBaselineIds([{}]), [])
})

test('baselineVariance returns start, finish and duration deltas and rejects non-finite times', () => {
  assert.deepEqual(baselineVariance({ start: 3, end: 7 }, { start: 1, end: 8 }), { start: 2, end: -1, duration: -3 })
  assert.deepEqual(baselineVariance({ start: 1, end: 1 }, { start: 1, end: 1 }), { start: 0, end: 0, duration: 0 })
  assert.ok(Object.is(baselineVariance({ start: -0, end: 0 }, { start: 0, end: 0 }).start, 0), 'no negative zero')
  const bar = Object.freeze({ start: 0, end: 2 }), baseline = Object.freeze({ start: 1, end: 2 })
  assert.deepEqual(baselineVariance(bar, baseline), { start: -1, end: 0, duration: 1 })
  for (const value of [Number.NaN, Infinity, '1', undefined]) {
    assert.throws(() => baselineVariance({ start: value, end: 1 }, { start: 0, end: 1 }), { name: 'RangeError', message: 'baselineVariance needs finite times' })
    assert.throws(() => baselineVariance({ start: 0, end: 1 }, { start: 0, end: value }), RangeError)
  }
})

test('validateTimelineData checks named baselines: set IDs, uniqueness, the reserved ID and finite ordered intervals', () => {
  assert.doesNotThrow(() => validateTimelineData(rows, named))
  assert.doesNotThrow(() => validateTimelineData(rows, [{ ...legacyBars[0], baselines: [] }]))
  assert.doesNotThrow(() => validateTimelineData(rows, [{ ...legacyBars[0], baselines: [{ id: 'm', start: hour, end: hour }] }]))
  const bar = baselines => [{ ...legacyBars[0], baselines }]
  assert.throws(() => validateTimelineData(rows, bar({ id: 'plan' })), { name: 'Error', message: 'baselines must be an array: x' })
  assert.throws(() => validateTimelineData(rows, bar([{ id: '', start: 0, end: 1 }])), { name: 'Error', message: 'Invalid baseline set ID on bar: x' })
  assert.throws(() => validateTimelineData(rows, bar([{ start: 0, end: 1 }])), { message: 'Invalid baseline set ID on bar: x' })
  assert.throws(() => validateTimelineData(rows, bar([null])), { message: 'Invalid baseline set ID on bar: x' })
  assert.throws(() => validateTimelineData(rows, bar([{ id: '$baseline', start: 0, end: 1 }])),
    { name: 'Error', message: 'The baseline set ID $baseline is reserved for TimelineBar.baseline: x' })
  assert.throws(() => validateTimelineData(rows, bar([{ id: 'plan', start: 0, end: 1 }, { id: 'plan', start: 1, end: 2 }])),
    { name: 'Error', message: 'Duplicate baseline set plan on bar x' })
  for (const [start, end] of [[2, 1], [Number.NaN, 1], [0, Infinity], ['0', 1]]) {
    assert.throws(() => validateTimelineData(rows, bar([{ id: 'plan', start, end }])),
      { name: 'RangeError', message: 'Baseline plan of bar x must have finite endpoints with start <= end' })
  }
})

test('renderTimelineSvg output with only legacy baselines is unchanged by unused baseline options', () => {
  for (const direction of ['ltr', 'rtl']) {
    const plain = renderTimelineSvg(rows, legacyBars, [], scale, { direction })
    assert.equal(renderTimelineSvg(rows, legacyBars.map(bar => ({ ...bar, baselines: [] })), [], scale, { direction }), plain)
    assert.equal(renderTimelineSvg(rows, legacyBars, [], scale, {
      direction, baselineLabel: () => 'unused', formatVariance: () => 'unused', varianceLabels: { start: 'unused' },
    }), plain)
    // The original rectangle: 4 px high, 1 px below the 52 px bar, without a title.
    assert.match(plain, new RegExp(`<rect x="[\\d.]+" y="100" width="40" height="4" rx="2" fill="${defaultSvgExportTheme.baseline}"/>`))
    assert.doesNotMatch(plain, /vw-gantt-baseline/)
  }
})

test('renderTimelineSvg draws the selected baseline sets in slot order with distinct fills, variance titles and shorter bars', () => {
  const svg = renderTimelineSvg(rows, named, [], scale)
  // Default selection: the legacy set, then rev1 and plan in order of first appearance.
  const groups = svg.match(/<g class="vw-gantt-baseline[^"]*"><title>[^<]*<\/title><rect [^>]*\/><\/g>/g)
  assert.deepEqual(groups.map(group => /vw-gantt-baseline-(\d)/.exec(group)[1]), ['1', '2', '3', '1', '3'])
  assert.equal(groups[0], `<g class="vw-gantt-baseline vw-gantt-baseline-1"><title>Baseline · X 01:00–03:00 · start +1 h, finish +1 h, duration +0 h</title>`
    + `<rect x="174" y="93" width="40" height="3" rx="1.5" fill="${defaultSvgExportTheme.baseline}"/></g>`)
  assert.match(groups[1], new RegExp(`<title>rev1 · X 02:00–05:00 · start \\+0 h, finish −1 h, duration −1 h</title><rect x="194" y="97" width="60" height="3" rx="1.5" fill="${defaultSvgExportTheme.baseline2}"/>`))
  assert.match(groups[2], new RegExp(`<title>plan · X 01:00–02:00 · start \\+1 h, finish \\+2 h, duration \\+1 h</title><rect x="174" y="101" width="20" height="3" rx="1.5" fill="${defaultSvgExportTheme.baseline3}"/>`))
  // Three sets take 7 px from each bar (52 → 45), so the strips end inside the lane.
  assert.match(svg, /<rect x="194" width="40" y="47" height="45" rx="5"/)
  assert.notEqual(defaultSvgExportTheme.baseline2, defaultSvgExportTheme.baseline)
  assert.notEqual(defaultSvgExportTheme.baseline3, defaultSvgExportTheme.baseline2)

  // An explicit selection picks and orders the sets; two sets take 3 px from the bars.
  const chosen = renderTimelineSvg(rows, named, [], scale, {
    baselineIds: ['plan', 'rev1'], baselineLabel: id => id.toUpperCase(), formatVariance: delta => `${delta / hour}h`,
    varianceLabels: { start: 'S', finish: 'F', duration: 'D' }, barLabel: bar => bar.label + '!', theme: { baseline2: '#123456' },
  })
  assert.deepEqual([...chosen.matchAll(/<title>([A-Z0-9]+) · /g)].map(match => match[1]), ['PLAN', 'REV1', 'PLAN'])
  assert.match(chosen, /<g class="vw-gantt-baseline vw-gantt-baseline-2"><title>REV1 · X! 02:00–05:00 · S 0h, F -1h, D -1h<\/title><rect [^>]*fill="#123456"\/>/)
  assert.match(chosen, /<rect x="194" width="40" y="47" height="49" rx="5"/)
  // One named set is drawn like the single baseline, with a title.
  const one = renderTimelineSvg(rows, named, [], scale, { baselineIds: ['rev1'] })
  assert.match(one, /<g class="vw-gantt-baseline"><title>rev1 · [^<]*<\/title><rect x="194" y="100" width="60" height="4" rx="2" fill="#718497"\/><\/g>/)
  assert.match(one, /height="52" rx="5"/)
  // No sets: no strips, full bars.
  const none = renderTimelineSvg(rows, named, [], scale, { baselineIds: [] })
  assert.doesNotMatch(none, /vw-gantt-baseline|height="4" rx="2"/)
  // Right to left mirrors the strips with the bars.
  const rtl = renderTimelineSvg(rows, named, [], scale, { direction: 'rtl', baselineIds: ['plan'] })
  assert.match(rtl, /<g class="vw-gantt-baseline"><title>plan · X [^<]*<\/title><rect x="120" y="100" width="20"/)
})

test('renderTimelineSvg rejects an invalid baselineIds selection', () => {
  assert.throws(() => renderTimelineSvg(rows, named, [], scale, { baselineIds: ['a', 'b', 'c', 'd'] }),
    { name: 'RangeError', message: 'baselineIds can select at most 3 baseline sets' })
  assert.throws(() => renderTimelineSvg(rows, named, [], scale, { baselineIds: ['plan', 'plan'] }),
    { name: 'Error', message: 'Duplicate baseline set ID in baselineIds: plan' })
  assert.throws(() => renderTimelineSvg(rows, named, [], scale, { baselineIds: [''] }), { message: 'Invalid baseline set ID in baselineIds: ' })
  assert.throws(() => renderTimelineSvg(rows, named, [], scale, { baselineIds: 'plan' }), { message: 'baselineIds must be an array of baseline set IDs' })
})

test('toMsProjectXml writes task baselines with number, dates and duration, and validates them', () => {
  const xml = toMsProjectXml({
    name: 'P',
    tasks: [{ id: 'a', name: 'A', start: 0, end: 2 * hour, baselines: [{ number: 0, start: 499, end: hour + 500 }, { number: 10, start: hour, end: hour }] }],
    dependencies: [],
  }, { utcOffsetMinutes: 60 })
  assert.ok(xml.includes('<PercentComplete>0</PercentComplete>'
    + '<Baseline><Number>0</Number><Interim>0</Interim><Start>1970-01-01T01:00:00</Start><Finish>1970-01-01T02:00:01</Finish><Duration>PT1H0M1S</Duration></Baseline>'
    + '<Baseline><Number>10</Number><Interim>0</Interim><Start>1970-01-01T02:00:00</Start><Finish>1970-01-01T02:00:00</Finish><Duration>PT0H0M0S</Duration></Baseline>'
    + '</Task>'))
  // Baselines follow the predecessor links.
  const linked = toMsProjectXml({
    name: 'P', tasks: [{ id: 'a', name: 'A', start: 0, end: hour }, { id: 'b', name: 'B', start: hour, end: 2 * hour, baselines: [{ number: 1, start: 0, end: hour }] }],
    dependencies: [{ from: 'a', to: 'b' }],
  })
  assert.match(linked, /<\/PredecessorLink><Baseline><Number>1<\/Number>/)
  // Without baselines the output is as before.
  assert.doesNotMatch(toMsProjectXml({ name: 'P', tasks: [{ id: 'a', name: 'A', start: 0, end: hour, baselines: [] }] }), /Baseline/)
  const task = baselines => ({ name: 'P', tasks: [{ id: 'a', name: 'A', start: 0, end: hour, baselines }] })
  for (const number of [-1, 11, 1.5, '0', undefined]) {
    assert.throws(() => toMsProjectXml(task([{ number, start: 0, end: 1 }])), { name: 'RangeError', message: 'Baseline numbers must be integers from 0 to 10: a' })
  }
  assert.throws(() => toMsProjectXml(task([{ number: 0, start: 0, end: 1 }, { number: 0, start: 0, end: 2 }])), { name: 'Error', message: 'Duplicate baseline 0 on task a' })
  assert.throws(() => toMsProjectXml(task([{ number: 0, start: 2, end: 1 }])), { name: 'RangeError', message: 'Baseline 0 of task a cannot end before it starts' })
  assert.throws(() => toMsProjectXml(task([{ number: 0, start: Number.NaN, end: 1 }])), { name: 'RangeError', message: 'Baseline start must be a finite time' })
  assert.throws(() => toMsProjectXml(task({ number: 0 })), { name: 'Error', message: 'baselines must be an array: a' })
})

test('GanttChart server markup with only legacy baselines is unchanged by the unused baseline props', async () => {
  for (const extra of [{}, { dir: 'rtl' }, { laneCount: 2, rowHeight: 80 }, { labels: { baseline: 'Plan' } }]) {
    const plain = await render(extra)
    assert.equal(await render({ ...extra, formatVariance: () => 'unused', labels: { ...extra.labels, baselineStart: 'unused' } }), plain)
    assert.equal(await render({ ...extra, bars: legacyBars.map(bar => ({ ...bar, baselines: [] })) }), plain)
    assert.doesNotMatch(plain, /data-vw-baseline|vw-gantt-baseline-/)
  }
  // The strip markup itself, as in 0.1.
  assert.deepEqual(strips(await render()), [
    '<div class="vw-gantt-baseline" style="left:calc(var(--vw-label-area-width) + 20px);width:40px;top:60px;" title="Baseline · X 01:00–03:00">',
    '<div class="vw-gantt-baseline" style="left:calc(var(--vw-label-area-width) + 98.5px);width:3px;top:60px;" title="Baseline · Y 05:00–05:00">',
  ])
  // `baselineLabel` names the unnamed baseline too.
  assert.match(await render({ baselineLabel: id => id === timelineBaselineId ? 'Original' : id }), /title="Original · X 01:00–03:00"/)
})

test('GanttChart draws several baseline sets in slot order, respects baselineIds and describes the variance', async () => {
  const html = await render({ bars: named })
  assert.deepEqual(strips(html).map(tag => [/vw-gantt-baseline-(\d)/.exec(tag)[1], /data-vw-baseline="([^"]+)"/.exec(tag)[1], /top:(\d+)px/.exec(tag)[1]]), [
    ['1', '$baseline', '53'], ['2', 'rev1', '57'], ['3', 'plan', '61'], ['1', '$baseline', '53'], ['3', 'plan', '61'],
  ])
  // Three sets: bars are 7 px shorter, and the strips fit between the bar (7–52) and the row's end (66).
  assert.match(html, /data-vw-bar="x"/)
  assert.match(html, /width:40px;height:45px;top:7px;" data-vw-bar="x"/)
  assert.match(strips(html)[1], /title="rev1 · X 02:00–05:00 · start \+0 h, finish −1 h, duration −1 h"/)
  // The accessible name is unchanged; each baseline and its variance goes into the description.
  assert.match(html, /aria-label="X 02:00–04:00" aria-pressed="false" aria-describedby="([^"]+-bar-0)"/)
  assert.match(html, /<span id="[^"]+-bar-0" hidden>Baseline 01:00–03:00: start \+1 h, finish \+1 h, duration \+0 h\. rev1 02:00–05:00: start \+0 h, finish −1 h, duration −1 h\. plan 01:00–02:00: start \+1 h, finish \+2 h, duration \+1 h\.<\/span>/)

  // Selection and order follow baselineIds; labels and the variance format can be replaced.
  const chosen = await render({
    bars: named, baselineIds: ['plan', 'rev1'], baselineLabel: id => ({ plan: 'Plan', rev1: 'Revision 1' })[id] ?? id,
    formatVariance: delta => `${delta / hour}h`, labels: { baselineStart: 'Start', baselineFinish: 'Finish', baselineDuration: 'Length' },
  })
  assert.deepEqual(strips(chosen).map(tag => /data-vw-baseline="([^"]+)" ?/.exec(tag)?.[1] + '@' + /vw-gantt-baseline-(\d)/.exec(tag)[1]),
    ['plan@1', 'rev1@2', 'plan@1'])
  assert.match(chosen, /width:40px;height:49px;top:7px;" data-vw-bar="x"/)
  assert.match(chosen, />Plan 01:00–02:00: Start 1h, Finish 2h, Length 1h\. Revision 1 02:00–05:00: Start 0h, Finish -1h, Length -1h\.<\/span>/)
  // A single selected set is drawn as the single baseline, still described.
  const one = await render({ bars: named, baselineIds: ['plan'] })
  assert.deepEqual(strips(one).map(tag => tag.replace(/ title="[^"]*"/, '')), [
    '<div class="vw-gantt-baseline" style="left:calc(var(--vw-label-area-width) + 20px);width:20px;top:60px;" data-vw-baseline="plan">',
    '<div class="vw-gantt-baseline" style="left:calc(var(--vw-label-area-width) + 80px);width:20px;top:60px;" data-vw-baseline="plan">',
  ])
  // An empty selection hides every baseline, the legacy one included, and restores full bars and descriptions.
  const none = await render({ bars: named, baselineIds: [] })
  assert.deepEqual(strips(none), [])
  assert.match(none, /height:52px;top:7px;" data-vw-bar="x"/)
  assert.doesNotMatch(none, /-bar-0" hidden/)
  // Right to left: the strips are placed from the right edge.
  assert.match(await render({ bars: named, baselineIds: ['plan'], dir: 'rtl' }), /<div class="vw-gantt-baseline" style="right:calc\(var\(--vw-label-area-width\) \+ 20px\);width:20px;top:60px;"/)
})

test('GanttChart reports an invalid baselineIds or named baseline through validation-error', async () => {
  for (const [props, message] of [
    [{ baselineIds: ['a', 'b', 'c', 'd'] }, 'baselineIds can select at most 3 baseline sets'],
    [{ baselineIds: ['a', 'a'] }, 'Duplicate baseline set ID in baselineIds: a'],
    [{ bars: [{ ...legacyBars[0], baselines: [{ id: 'p', start: 1, end: 0 }] }] }, 'Baseline p of bar x must have finite endpoints with start <= end'],
  ]) {
    const reported = []
    const app = createSSRApp({ render: () => h(GanttChart, { ...chartProps, bars: legacyBars, ...props, onValidationError: error => reported.push(error) }) })
    app.config.errorHandler = () => {}
    const html = await renderToString(app)
    assert.deepEqual(reported.map(error => error.message), [message])
    assert.match(html, /No rows to display/)
  }
})
