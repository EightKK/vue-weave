import assert from 'node:assert/strict'
import { test } from 'node:test'
import { calculateResourceLoad, resourceLoadHistogram } from '@eightkk/vue-weave/core'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { GanttChart } from '@eightkk/vue-weave'
import { renderComponent } from './helpers/ssr.mjs'

const hour = 3_600_000
const rows = [{ id: 'r1', label: 'Row 1' }, { id: 'r2', label: 'Row 2' }]
const bars = [
  { id: 'a', rowId: 'r1', label: 'Alpha', start: hour, end: 3 * hour, editable: true },
  { id: 'b', rowId: 'r2', label: 'Beta', start: 4 * hour, end: 6 * hour, editable: true },
]

const base = {
  rows, bars, range: { start: 0, end: 8 * hour }, dependencies: [{ id: 'ab', from: 'a', to: 'b' }],
  connectable: true, reconnectable: true, multiSelect: true, rowDraggable: true, pinchZoom: true,
  selectedIds: new Set(['a']), selectedDependencyId: 'ab',
  zoomPresets: [{ id: 'day', label: 'Day', pixelsPerUnit: 40 / hour, tickSteps: [2 * hour], headerBands: [[{ start: 0, end: 8 * hour, label: 'Shift A' }]] }],
  zoomPreset: 'day',
  loadRows: [{ id: 'cnc', label: 'CNC cell' }],
  loadSegments: [
    { resourceId: 'cnc', start: 0, end: 2 * hour, load: 1, capacity: 1 },
    { resourceId: 'cnc', start: 2 * hour, end: 4 * hour, load: 2, capacity: 1, overload: 1 },
  ],
}

test('load histograms group calculateResourceLoad output and validate references', () => {
  const range = { start: 0, end: 8 * hour }
  const tasks = [{ id: 'a', work: [{ start: 0, end: 4 * hour }] }, { id: 'b', work: [{ start: 2 * hour, end: 6 * hour }] }]
  const segments = calculateResourceLoad(range, tasks, [{ id: 'cnc', capacity: 1 }, { id: 'idle', capacity: 2 }],
    [{ resourceId: 'cnc', taskId: 'a' }, { resourceId: 'cnc', taskId: 'b' }])
  const histogram = resourceLoadHistogram([...segments].reverse(), ['cnc', 'idle', 'empty'])
  assert.deepEqual([...histogram.keys()], ['cnc', 'idle', 'empty'])
  const cnc = histogram.get('cnc')
  assert.equal(cnc.peak, 2)
  assert.deepEqual(cnc.segments.map(segment => [segment.start / hour, segment.end / hour, segment.load]), [[0, 2, 1], [2, 4, 2], [4, 6, 1], [6, 8, 0]])
  assert.equal(histogram.get('idle').peak, 2)
  assert.deepEqual(histogram.get('empty'), { segments: [], peak: 0 })
  assert.equal(resourceLoadHistogram(segments).size, 2)

  assert.throws(() => resourceLoadHistogram(segments, ['cnc']), /Unknown resource/)
  assert.throws(() => resourceLoadHistogram([{ resourceId: 'x', start: 0, end: 2, load: 1, capacity: 1 }, { resourceId: 'x', start: 1, end: 3, load: 1, capacity: 1 }]), /Overlapping/)
  assert.throws(() => resourceLoadHistogram([{ resourceId: 'x', start: 0, end: 2, load: -1, capacity: 1 }]), RangeError)
  assert.throws(() => resourceLoadHistogram([{ resourceId: 'x', start: 2, end: 2, load: 1, capacity: 1 }]), RangeError)
})

test('editing, preset, histogram and now-marker props render on the server without reading the clock', async () => {
  const html = await renderComponent(GanttChart, { ...base, showNow: true })
  assert.ok(!/NaN|Infinity/.test(html))
  assert.match(html, /aria-label="Start dependency from finish of Alpha"/)
  assert.match(html, /aria-label="Select dependency Alpha → Beta FS"/)
  assert.match(html, /aria-label="Reconnect target of Alpha → Beta FS"/)
  assert.match(html, /aria-label="Zoom level"/)
  assert.match(html, /aria-pressed="true"[^>]*>Day</)
  assert.match(html, /Shift A/)
  assert.match(html, /aria-label="CNC cell 02:00–04:00: load 2 \/ capacity 1, overloaded by 1"/)
  assert.match(html, /vw-pinch-zoom/)
  // Without an explicit time the clock is read only after mounting.
  assert.ok(!html.includes('vw-gantt-now'))
  const fixed = await renderComponent(GanttChart, { ...base, showNow: true, now: 5 * hour })
  assert.match(fixed, /vw-gantt-now/)
  assert.match(fixed, /title="Now 05:00"/)
  const hidden = await renderComponent(GanttChart, { ...base, now: 5 * hour })
  assert.ok(!hidden.includes('vw-gantt-now'))
})

test('invalid presets and load segments report validation-error and render the empty state', async () => {
  for (const [props, expected] of [
    [{ zoomPreset: 'missing' }, /Unknown zoom preset/],
    [{ zoomPresets: [{ id: 'x', label: 'X', pixelsPerUnit: 0 }], zoomPreset: undefined }, /pixelsPerUnit/],
    [{ loadSegments: [{ resourceId: 'other', start: 0, end: hour, load: 1, capacity: 1 }] }, /Unknown resource/],
    [{ loadRows: [{ id: 'cnc', label: 'A' }, { id: 'cnc', label: 'B' }] }, /Duplicate load row ID: cnc/],
    [{ now: Number.NaN, showNow: true }, /now must be finite/],
  ]) {
    const reported = []
    const app = createSSRApp({ render: () => h(GanttChart, { ...base, ...props, onValidationError: error => reported.push(error) }) })
    app.config.errorHandler = () => {}
    const html = await renderToString(app)
    assert.equal(reported.length, 1)
    assert.match(reported[0].message, expected)
    assert.match(html, /No rows to display/)
  }
})
