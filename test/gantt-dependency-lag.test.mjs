import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import {
  createTimeScale, defaultSvgExportTheme, formatDependencyLag, propagateEdit, renderTimelineSvg, scheduleTasks, validateTimelineData,
} from '@eightkk/vue-weave/core'
import { GanttChart } from '@eightkk/vue-weave'
import { renderWith } from './helpers/ssr.mjs'
import { hour } from './helpers/time.mjs'

const rows = [{ id: 'p', label: 'Parent' }, { id: 'r1', label: 'Row 1', parentId: 'p' }, { id: 'r2', label: 'Row 2' }]
const bars = [
  { id: 'a', rowId: 'r1', label: 'A', start: hour, end: 3 * hour, editable: true },
  { id: 'b', rowId: 'r2', label: 'B', start: 5 * hour, end: 6 * hour },
]
const range = { start: 0, end: 10 * hour }
const link = (extra = {}) => [{ id: 'ab', from: 'a', to: 'b', ...extra }]
const chartProps = { rows, bars, range, pixelsPerUnit: 10 / hour }
const render = renderWith(GanttChart, chartProps)

test('validateTimelineData accepts finite lags and leads and rejects any other lag with a RangeError', () => {
  for (const lag of [undefined, 0, hour, -hour, 0.5]) assert.doesNotThrow(() => validateTimelineData(rows, bars, link({ lag })))
  for (const lag of [Number.NaN, Infinity, -Infinity, '1', null]) {
    assert.throws(() => validateTimelineData(rows, bars, link({ lag })), { name: 'RangeError', message: 'Dependency lag must be finite: ab' })
  }
})

test('formatDependencyLag writes signed hours of a millisecond lag and rejects non-finite values', () => {
  assert.equal(formatDependencyLag(2 * hour), '+2 h')
  assert.equal(formatDependencyLag(hour / 2), '+0.5 h')
  assert.equal(formatDependencyLag(-1.25 * hour), '−1.25 h')
  assert.equal(formatDependencyLag(-60_000), '−0.02 h')
  for (const lag of [Number.NaN, Infinity, '1']) assert.throws(() => formatDependencyLag(lag), RangeError)
})

test('chart dependencies with a lag schedule the same as ScheduleLinks, so cascades built from them honour it', () => {
  const tasks = [{ id: 'a', duration: 2 }, { id: 'b', duration: 2 }]
  const input = lag => ({ range: { start: 0, end: 40 }, tasks, dependencies: [{ id: 'ab', from: 'a', to: 'b', type: 'FS', lag }] })
  const dates = result => result.tasks.map(task => [task.id, task.start, task.end])
  assert.deepEqual(dates(scheduleTasks(input(undefined))), [['a', 0, 2], ['b', 2, 4]])
  assert.deepEqual(dates(scheduleTasks(input(3))), [['a', 0, 2], ['b', 5, 7]])
  assert.deepEqual(dates(scheduleTasks({ ...input(-1), tasks: [tasks[0], { id: 'b', duration: 2, startNoEarlierThan: 0 }] })), [['a', 0, 2], ['b', 1, 3]])
  // A cascade preview: moving the predecessor pushes the successor to its new end plus the lag.
  assert.deepEqual(propagateEdit(input(3), { id: 'a', start: 4 }).changes, [
    { id: 'a', before: { start: 0, end: 2 }, after: { start: 4, end: 6 } },
    { id: 'b', before: { start: 5, end: 7 }, after: { start: 9, end: 11 } },
  ])
  // Each link keeps its own lag; the input is not modified.
  const frozen = Object.freeze({ ...input(3), dependencies: Object.freeze([Object.freeze(input(3).dependencies[0])]) })
  assert.equal(propagateEdit(frozen, { id: 'a', start: 1 }).schedule.tasks[1].start, 6)
})

test('GanttChart server markup is byte-identical with an omitted lag, a zero lag and wheelZoom', async () => {
  const configs = [
    {}, { connectable: true, reconnectable: true, selectedDependencyId: 'ab', contextMenu: true }, { dir: 'rtl', connectable: true },
    { highlightedDependencyIds: new Set(['ab']), deletable: true, formatLag: () => 'unused', labels: { lag: 'Verzug' } },
  ]
  for (const extra of configs) {
    const plain = await render({ ...extra, dependencies: link() })
    assert.equal(await render({ ...extra, dependencies: link({ lag: 0 }) }), plain)
    assert.equal(await render({ ...extra, dependencies: link(), wheelZoom: true }), plain)
    assert.doesNotMatch(plain, /vw-gantt-lag|-lag-|aria-describedby="[^"]*lag/)
  }
})

test('GanttChart labels a non-zero lag on the connector and describes the dependency with it', async () => {
  const html = await render({ dependencies: link({ lag: 2 * hour }), connectable: true })
  const label = html.match(/<text id="([^"]+)" class="vw-gantt-lag" x="44" y="132" text-anchor="start" aria-label="Lag \+2 h">\+2 h<\/text>/)
  assert.ok(label, 'lag label between the rows, after the connector bend')
  // The name stays as before; the lag is the description of the focusable dependency.
  assert.match(html, new RegExp(`aria-label="Select dependency A → B FS" aria-describedby="${label[1]}"`))
  // The connector itself is unchanged; the label is in its own layer after the dependency layer, so it is stacked above
  // the marker, now and status-date lines.
  assert.match(html, /<path class="" d="M 30 99 H 40 V 165 H 50" marker-end="url\(#[^)]+\)"><\/path><!--\]--><\/svg><svg class="vw-gantt-lag-layer" aria-hidden="true"[^>]*><!--\[--><text/)

  const lead = await render({
    dependencies: link({ lag: -90 * 60_000 }), highlightedDependencyIds: new Set(['ab']), labels: { lag: 'Verzug' },
  })
  assert.match(lead, /<text id="[^"]+" class="vw-gantt-lag vw-is-highlighted" x="44" y="132" text-anchor="start" aria-label="Verzug −1\.5 h">−1\.5 h<\/text>/)
  // Without connectable or reconnectable the dependency layer is decorative, as before.
  assert.doesNotMatch(lead, /class="vw-dependency-hit[^>]*role="button"|aria-describedby="[^"]*lag/)

  const custom = await render({ dependencies: link({ lag: 3 }), formatLag: lag => `${lag} units` })
  assert.match(custom, />3 units<\/text>/)
  // Right to left: the same inline coordinates; the stylesheet mirrors the layer and turns each label back.
  assert.match(await render({ dependencies: link({ lag: hour }), dir: 'rtl' }), /class="vw-gantt-lag" x="44" y="132" text-anchor="start"/)
})

test('GanttChart reports a non-finite lag through validation-error', async () => {
  const reported = []
  const app = createSSRApp({ render: () => h(GanttChart, { ...chartProps, dependencies: link({ lag: Number.NaN }), onValidationError: error => reported.push(error) }) })
  app.config.errorHandler = () => {}
  const html = await renderToString(app)
  assert.equal(reported.length, 1)
  assert.ok(reported[0] instanceof RangeError)
  assert.match(html, /No rows to display/)
})

test('renderTimelineSvg draws the same lag label, unmirrored in right-to-left output, and nothing for a zero lag', () => {
  const scale = createTimeScale(range, 10 / hour)
  for (const direction of ['ltr', 'rtl']) {
    assert.equal(renderTimelineSvg(rows, bars, link({ lag: 0 }), scale, { direction }), renderTimelineSvg(rows, bars, link(), scale, { direction }))
  }
  const halo = `stroke="${defaultSvgExportTheme.surface}" stroke-width="3" stroke-linejoin="round" paint-order="stroke"`
  const ltr = renderTimelineSvg(rows, bars, link({ lag: 2 * hour }), scale)
  // 154 px of row headings, then the label 44 px into the axis, at the row boundary below the source row.
  assert.ok(ltr.includes(`<text class="vw-gantt-lag" x="198" y="172" text-anchor="start" dominant-baseline="central" font-size="10" font-weight="650" fill="${defaultSvgExportTheme.text}" ${halo}>+2 h</text>`))
  const rtl = renderTimelineSvg(rows, bars, link({ lag: 2 * hour }), scale, { direction: 'rtl', formatLag: lag => `${lag / hour} hours` })
  assert.ok(rtl.includes(`<text class="vw-gantt-lag" x="56" y="172" text-anchor="end" dominant-baseline="central" font-size="10" font-weight="650" fill="${defaultSvgExportTheme.text}" ${halo}>2 hours</text>`))
  const highlighted = renderTimelineSvg(rows, bars, link({ lag: -hour }), scale, { highlightedDependencyIds: ['ab'] })
  assert.match(highlighted, new RegExp(`fill="${defaultSvgExportTheme.dependencyHighlight}" stroke="${defaultSvgExportTheme.surface}"[^>]*>−1 h</text>`))
  // A same-row link centres its label above the connector.
  const sameRow = [...bars, { id: 'c', rowId: 'r2', label: 'C', start: 8 * hour, end: 9 * hour }]
  assert.match(renderTimelineSvg(rows, sameRow, [{ id: 'bc', from: 'b', to: 'c', lag: hour }], scale),
    /<text class="vw-gantt-lag" x="224" y="\d+" text-anchor="middle"/)
})

test('lag labels are drawn after the marker, now and status-date lines, and output without a lag keeps its order', () => {
  const scale = createTimeScale(range, 10 / hour)
  const lines = { markers: [{ id: 'm', time: 4 * hour, label: 'Review' }], now: 4 * hour, statusDate: 4 * hour }
  const svg = renderTimelineSvg(rows, bars, link({ lag: 2 * hour }), scale, lines)
  const label = svg.indexOf('class="vw-gantt-lag"')
  assert.ok(label > svg.lastIndexOf('>Review</text>') && label > svg.lastIndexOf('>Now</text>') && label > svg.lastIndexOf('>Status date</text>'))
  // Without a lag nothing moves: the connector layer is still followed directly by the marker.
  const plain = renderTimelineSvg(rows, bars, link(), scale, lines)
  assert.match(plain, /marker-end="url\(#vw-export-arrow\)"\/><\/g><g><title>Review /)
})

test('GanttChart stacks the lag label layer above the now line in the stylesheet', async () => {
  const { readFile } = await import('node:fs/promises')
  const css = await readFile(new URL(import.meta.resolve('@eightkk/vue-weave/style.css')), 'utf8')
  // The first rule whose whole selector is `selector`, in the (possibly minified) stylesheet.
  const zIndex = selector => Number(new RegExp(`(?:^|[}\\n])\\s*${selector.replace(/[.]/g, '\\.')}\\s*\\{[^}]*z-index:\\s*(\\d+)`).exec(css)?.[1])
  assert.equal(zIndex('.vw-gantt-now'), 3)
  // Equal z-index: the layer comes later in the canvas than the now line, so it is painted above it.
  assert.ok(zIndex('.vw-gantt-lag-layer') >= zIndex('.vw-gantt-now'))
  assert.ok(zIndex('.vw-gantt-lag-layer') > zIndex('.vw-gantt-links'))
})
