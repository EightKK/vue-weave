import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createTimeScale, renderTimelineSvg } from 'vue-weave/core'
import { GanttChart } from 'vue-weave'
import { renderComponent } from './helpers/ssr.mjs'

const hour = 3_600_000
const chartRows = [{ id: 'p', label: 'Parent' }, { id: 'r1', label: 'Row 1', parentId: 'p' }, { id: 'r2', label: 'Row 2' }]
const chartBars = [
  { id: 'a', rowId: 'r1', label: 'A', start: hour, end: 3 * hour, editable: true, progress: 0.5 },
  { id: 'b', rowId: 'r2', label: 'B', start: 4 * hour, end: 6 * hour },
]

const chartProps = { rows: chartRows, bars: chartBars, range: { start: 0, end: 10 * hour }, pixelsPerUnit: 10 / hour }
const render = (props = {}) => renderComponent(GanttChart, { ...chartProps, ...props })

test('GanttChart renders the status date and a progress line on the server', async () => {
  const html = await render({ statusDate: 2.5 * hour, showProgressLine: true, labels: { statusDate: 'Stichtag' } })
  assert.match(html, /<div class="vw-gantt-marker vw-gantt-status-date" role="img" aria-label="Stichtag 02:30" title="Stichtag 02:30" style="left:calc\(var\(--vw-label-area-width\) \+ 25px\);"><span>Stichtag<\/span><\/div>/)
  const lines = html.match(/<svg class="vw-gantt-progress-line"[^>]*><polyline points="[^"]*"><\/polyline><\/svg>/g)
  assert.equal(lines.length, 3)
  // Row 1: bar A (1–3 h, 50%) kinks the line to its progress point at 2 h; the other rows keep it straight.
  assert.match(lines[1], /points="25,0 25,7 20,33 25,59 25,66"/)
  assert.match(lines[0], /points="25,0 25,66"/)
  assert.match(lines[0], /aria-hidden="true"/)
  const statusOnly = await render({ statusDate: 2.5 * hour })
  assert.match(statusOnly, /vw-gantt-status-date/)
  assert.doesNotMatch(statusOnly, /vw-gantt-progress-line/)
  const rtl = await render({ dir: 'rtl', statusDate: 2.5 * hour, showProgressLine: true })
  assert.match(rtl, /class="vw-gantt-marker vw-gantt-status-date"[^>]*style="right:calc\(var\(--vw-label-area-width\) \+ 25px\);"/)
  assert.match(rtl, /<svg class="vw-gantt-progress-line"[^>]*style="right:calc/)
  // Outside the range nothing is drawn.
  assert.doesNotMatch(await render({ statusDate: 20 * hour, showProgressLine: true }), /vw-gantt-status-date/)
})

test('GanttChart reports an invalid statusDate through validation-error', async () => {
  for (const statusDate of [Number.NaN, Infinity, '5']) {
    const reported = []
    const app = createSSRApp({ render: () => h(GanttChart, { ...chartProps, statusDate, onValidationError: error => reported.push(error) }) })
    app.config.errorHandler = () => {}
    const html = await renderToString(app)
    assert.equal(reported.length, 1)
    assert.ok(reported[0] instanceof RangeError)
    assert.match(reported[0].message, /statusDate/)
    assert.match(html, /No rows to display/)
  }
})

test('renderTimelineSvg draws the status date and the progress line only when asked', () => {
  const scale = createTimeScale({ start: 0, end: 10 * hour }, 10 / hour)
  const plain = renderTimelineSvg(chartRows, chartBars, [], scale)
  assert.equal(renderTimelineSvg(chartRows, chartBars, [], scale, { showProgressLine: true }), plain)
  const svg = renderTimelineSvg(chartRows, chartBars, [], scale, {
    statusDate: 2.5 * hour, showProgressLine: true, statusDateLabel: 'Stichtag', theme: { status: '#123456' },
  })
  assert.match(svg, /<g class="vw-gantt-status-date"><title>Stichtag 02:30<\/title><line x1="179" y1="40" x2="179" y2="238" stroke="#123456" stroke-width="2"\/>/)
  assert.match(svg, /<polyline class="vw-gantt-progress-line" fill="none" stroke="#123456" stroke-width="2" stroke-linejoin="round" points="179,40 179,113 174,139 179,165 179,238"\/>/)
  const rtl = renderTimelineSvg(chartRows, chartBars, [], scale, { statusDate: 2.5 * hour, direction: 'rtl' })
  assert.match(rtl, /<g class="vw-gantt-status-date"><title>Status date 02:30<\/title><line x1="75"/)
  assert.doesNotMatch(rtl, /vw-gantt-progress-line/)
  assert.throws(() => renderTimelineSvg(chartRows, chartBars, [], scale, { statusDate: Number.NaN }), RangeError)
})
