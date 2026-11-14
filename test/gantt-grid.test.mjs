import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { renderTimelineSvg } from 'vue-weave/core'
import { GanttChart } from 'vue-weave'

// 0..50 is drawn at 10 px per unit and 50..100 at 1 px per unit: strictly increasing and invertible.
const scale = {
  width: 550,
  toX: time => time <= 50 ? time * 10 : 500 + (time - 50),
  toTime: x => x <= 500 ? x / 10 : 50 + (x - 500),
}
const rows = [{ id: 'r', label: 'Row' }]
const range = { start: 0, end: 100 }
const tickPositions = [0, 100, 200, 300, 400, 500, 510, 520, 530, 540, 550]

const render = props => renderToString(createSSRApp({ render: () => h(GanttChart, {
  rows, bars: [], range, scale, snap: 1, formatTime: String, ...props,
}) }))
const offsets = (html, className, side) => [...html.matchAll(
  new RegExp(`class="${className}(?: end)?"[^>]*style="${side}:([\\d.]+)px;?"`, 'g'),
)].map(match => Number(match[1]))

test('Gantt grid lines follow every tick of a piecewise time scale', async () => {
  const html = await render({ tickSteps: [10] })
  assert.deepEqual(offsets(html, 'vw-gantt-tick', 'left'), tickPositions)
  assert.deepEqual(offsets(html, 'vw-gantt-tick-line', 'left'), tickPositions)
  assert.deepEqual(offsets(html, 'vw-gantt-grid-line', 'left'), tickPositions)
  // One line per tick for the whole body, not one per row.
  assert.equal(html.split('vw-gantt-grid-line').length - 1, tickPositions.length)
})

test('Gantt grid lines mirror with the ticks in right-to-left charts', async () => {
  const html = await render({ tickSteps: [10], dir: 'rtl' })
  assert.deepEqual(offsets(html, 'vw-gantt-tick', 'right'), tickPositions)
  assert.deepEqual(offsets(html, 'vw-gantt-grid-line', 'right'), tickPositions)
  assert.deepEqual(offsets(html, 'vw-gantt-tick-line', 'right'), tickPositions)
  assert.deepEqual(offsets(html, 'vw-gantt-grid-line', 'left'), [])
})

test('Gantt screen grid lines match the per-tick lines of the SVG export', async () => {
  const html = await render({ tickSteps: [10] })
  const svg = renderTimelineSvg(rows, [], [], scale, { tickStep: 10, tickAnchor: 0, labelWidth: 0 })
  const exported = [...svg.matchAll(/<line x1="([\d.]+)" y1="0" x2="\1"/g)].map(match => Number(match[1]))
  assert.deepEqual(exported, tickPositions)
  assert.deepEqual(offsets(html, 'vw-gantt-grid-line', 'left'), exported)
})

test('Gantt label density uses the smallest visible tick gap', async () => {
  // The first interval of 10 and 50 is at least 76 px, but their narrowest visible gaps are 10 px and 50 px.
  const html = await render({ tickSteps: [10, 50, 100] })
  assert.deepEqual(offsets(html, 'vw-gantt-grid-line', 'left'), [0, 550])
})
