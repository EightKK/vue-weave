import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { GanttChart } from '@eightkk/vue-weave'
import { createTimeScale, defaultSvgExportTheme, renderTimelineSvg } from '@eightkk/vue-weave/core'
import { hour } from './helpers/time.mjs'

const rows = [{ id: 'r1', label: 'Row 1' }, { id: 'r2', label: 'Row 2' }, { id: 'r3', label: 'Row 3' }]
const bars = [
  { id: 'a', rowId: 'r1', label: 'A', start: hour, end: 3 * hour },
  { id: 'b', rowId: 'r2', label: 'B', start: 5 * hour, end: 6 * hour },
]
const range = { start: 0, end: 10 * hour }
const chartProps = { rows, bars, range, pixelsPerUnit: 10 / hour }
const freeze = { id: 'freeze', start: 2 * hour, end: 4 * hour, label: 'Code freeze' }
const closed = { id: 'closed', start: 5 * hour, end: 7 * hour, label: 'Office closed', tone: 'teal', rowIds: ['r2'] }

function render(props = {}) {
  const app = createSSRApp({ render: () => h(GanttChart, { ...chartProps, ...props }) })
  app.config.errorHandler = () => {}
  return renderToString(app)
}

test('GanttChart markup is unchanged when markerRanges is unused or empty', async () => {
  const plain = await render()
  assert.equal(await render({ markerRanges: [] }), plain)
  assert.doesNotMatch(plain, /vw-gantt-range/)
  const decorated = { markers: [{ id: 'm', time: 3 * hour, label: 'M' }], statusDate: 4 * hour, dir: 'rtl' }
  assert.equal(await render({ ...decorated, markerRanges: [] }), await render(decorated))
})

test('GanttChart draws a marker range as a body band and a named header label', async () => {
  const html = await render({ markerRanges: [freeze] })
  assert.match(html, /<div class="vw-gantt-range" style="left:calc\(var\(--vw-label-area-width\) \+ 20px\);width:20px;" aria-hidden="true"><span><\/span><\/div>/)
  assert.match(html, /<span class="vw-gantt-range-label" style="left:20px;width:20px;" role="img" aria-label="Code freeze 02:00–04:00" title="Code freeze 02:00–04:00">Code freeze<\/span>/)
  // A custom formatTime names the range the way it names bars.
  const custom = await render({ markerRanges: [freeze], formatTime: time => `t${time / hour}` })
  assert.match(custom, /aria-label="Code freeze t2–t4"/)
})

test('GanttChart restricts a marker range to rows, applies its tone and mirrors it in RTL', async () => {
  const html = await render({ markerRanges: [closed] })
  // Row r2 is the second displayed row: one row height below the header.
  assert.match(html, /class="vw-gantt-range vw-is-row vw-tone-teal vw-has-tone" style="left:calc\(var\(--vw-label-area-width\) \+ 50px\);width:20px;top:calc\(var\(--vw-header-height\) \+ 66px\);height:66px;"/)
  assert.match(html, /class="vw-gantt-range-label vw-tone-teal vw-has-tone"/)
  // A collapsed parent hides its child rows, and their bands with them.
  const nested = [{ id: 'p', label: 'P' }, { id: 'c', label: 'C', parentId: 'p' }]
  const hidden = await render({ rows: nested, bars: [], markerRanges: [{ ...closed, rowIds: ['c'] }], collapsedIds: new Set(['p']) })
  assert.doesNotMatch(hidden, /vw-gantt-range vw-is-row/)
  assert.match(hidden, /vw-gantt-range-label/)
  const rtl = await render({ markerRanges: [freeze], dir: 'rtl' })
  assert.match(rtl, /class="vw-gantt-range" style="right:calc\(var\(--vw-label-area-width\) \+ 20px\);width:20px;"/)
  assert.match(rtl, /class="vw-gantt-range-label" style="right:20px;width:20px;"/)
})

test('GanttChart clips marker ranges to the chart range and skips those outside it', async () => {
  const html = await render({
    markerRanges: [{ id: 'early', start: -5 * hour, end: hour, label: 'Early' }, { id: 'late', start: 20 * hour, end: 30 * hour, label: 'Late' }],
  })
  assert.match(html, /class="vw-gantt-range-label" style="left:0px;width:10px;" role="img" aria-label="Early 19:00–01:00"/)
  assert.doesNotMatch(html, /Late/)
})

test('GanttChart reports invalid marker ranges through validation-error', async () => {
  const cases = [
    [[freeze, { ...freeze }], Error, /^Duplicate marker range ID: freeze$/],
    [[{ ...freeze, id: '' }], Error, /^Invalid marker range ID: ""$/],
    [[{ ...freeze, end: freeze.start }], RangeError, /finite endpoints with start < end: freeze/],
    [[{ ...freeze, end: hour }], RangeError, /start < end/],
    [[{ ...freeze, start: Number.NaN }], RangeError, /start < end/],
    [[{ ...freeze, end: Infinity }], RangeError, /start < end/],
    [[{ ...freeze, rowIds: ['nope'] }], Error, /Unknown row for marker range freeze: nope/],
  ]
  for (const [markerRanges, type, message] of cases) {
    const errors = []
    const html = await render({ markerRanges, onValidationError: error => errors.push(error) })
    assert.equal(errors.length, 1, String(message))
    assert.equal(errors[0].constructor, type)
    assert.match(errors[0].message, message)
    assert.match(html, /No rows to display/)
  }
})

const scale = createTimeScale(range, 10 / hour)
const svg = (options = {}) => renderTimelineSvg(rows, bars, [], scale, options)

test('renderTimelineSvg is unchanged without marker ranges', () => {
  assert.equal(svg({ markerRanges: [] }), svg())
  assert.doesNotMatch(svg(), /vw-gantt-range/)
})

test('renderTimelineSvg draws marker ranges with bands, header labels, tones and row restrictions', () => {
  const out = svg({ markerRanges: [freeze, closed] })
  // Full-height band from the header (40 px) to the bottom of three 66 px rows, after the 154 px label column.
  assert.match(out, /<g class="vw-gantt-range"><title>Code freeze 02:00–04:00<\/title><rect x="174" width="20" y="40" height="198" fill="#f9efdc" fill-opacity="0.7"\/><\/g>/)
  assert.match(out, /<g class="vw-gantt-range-label"><title>Code freeze 02:00–04:00<\/title><rect x="174" width="20" y="27" height="13" fill="#f9efdc"\/>/)
  assert.match(out, />Code freeze<\/text>/)
  const teal = defaultSvgExportTheme.tones.teal
  assert.match(out, new RegExp(`<rect x="204" width="20" y="106" height="66" fill="${teal.pale}" fill-opacity="0.7"/>`))
  assert.match(out, new RegExp(`stroke="${teal.line}"`))
  // Theme colours apply to ranges without a tone.
  assert.match(svg({ markerRanges: [freeze], theme: { range: '#123456', rangeInk: '#654321' } }), /fill="#123456" fill-opacity="0.7"/)
  // Right-to-left output mirrors the axis: 02:00–04:00 sits 60–80 px from the left of the 100 px axis.
  assert.match(svg({ markerRanges: [freeze], direction: 'rtl' }), /<rect x="60" width="20" y="40" height="198"/)
  // A row outside rowRange, and a range outside timeRange, are left out.
  assert.doesNotMatch(svg({ markerRanges: [closed], rowRange: { start: 0, end: 1 } }), /<g class="vw-gantt-range">/)
  assert.doesNotMatch(svg({ markerRanges: [freeze], timeRange: { start: 5 * hour, end: 10 * hour } }), /Code freeze/)
})

test('renderTimelineSvg validates marker ranges like GanttChart', () => {
  assert.throws(() => svg({ markerRanges: [freeze, freeze] }), { name: 'Error', message: 'Duplicate marker range ID: freeze' })
  assert.throws(() => svg({ markerRanges: [{ ...freeze, end: freeze.start }] }), RangeError)
  assert.throws(() => svg({ markerRanges: [{ ...freeze, start: '1' }] }), RangeError)
  assert.throws(() => svg({ markerRanges: [{ ...freeze, rowIds: ['x'] }] }), { name: 'Error', message: /Unknown row for marker range/ })
})
