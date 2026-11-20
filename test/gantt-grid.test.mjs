import assert from 'node:assert/strict'
import { test } from 'node:test'
import { renderTimelineSvg } from 'vue-weave/core'
import { GanttChart } from 'vue-weave'
import { renderComponent } from './helpers/ssr.mjs'

// 0..50 is drawn at 10 px per unit and 50..100 at 1 px per unit: strictly increasing and invertible.
const scale = {
  width: 550,
  toX: time => time <= 50 ? time * 10 : 500 + (time - 50),
  toTime: x => x <= 500 ? x / 10 : 50 + (x - 500),
}
const rows = [{ id: 'r', label: 'Row' }]
const range = { start: 0, end: 100 }
const tickPositions = [0, 100, 200, 300, 400, 500, 510, 520, 530, 540, 550]

const render = props => renderComponent(GanttChart, {
  rows, bars: [], range, scale, snap: 1, formatTime: String, ...props,
})
const offsets = (html, className, side) => [...html.matchAll(
  new RegExp(`class="${className}(?: vw-is-end)?"[^>]*style="${side}:([\\d.]+)px;?"`, 'g'),
)].map(match => Number(match[1]))

// Ticks 10 px apart in the squeezed part leave no room for a label; their lines stay.
const labelPositions = [0, 100, 200, 300, 400]

test('Gantt grid lines follow every tick of a piecewise time scale; squeezed ticks lose their labels', async () => {
  const html = await render({ tickSteps: [10] })
  assert.deepEqual(offsets(html, 'vw-gantt-tick', 'left'), labelPositions)
  assert.deepEqual(offsets(html, 'vw-gantt-tick-line', 'left'), tickPositions)
  assert.deepEqual(offsets(html, 'vw-gantt-grid-line', 'left'), tickPositions)
  // One line per tick for the whole body, not one per row.
  assert.equal(html.split('vw-gantt-grid-line').length - 1, tickPositions.length)
})

test('Gantt grid lines mirror with the ticks in right-to-left charts', async () => {
  const html = await render({ tickSteps: [10], dir: 'rtl' })
  assert.deepEqual(offsets(html, 'vw-gantt-tick', 'right'), labelPositions)
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
  // The export leaves out the same squeezed labels.
  const labels = [...svg.matchAll(/<text x="([\d.]+)" y="24" font-size="11" font-weight="700"/g)].map(match => Number(match[1]) - 7)
  assert.deepEqual(labels, labelPositions)
})

test('tick labels are kept where the scale leaves room: a working-time scale squeezes nights, never into overlapping labels', async () => {
  const { createWorkingTimeScale } = await import('vue-weave/core')
  const hour = 3_600_000
  const day = { start: 0, end: 48 * hour }
  // Working 08:00-17:00 on both days; nights keep a tenth of the width. 6-hour ticks are 22 px apart at night.
  const working = createWorkingTimeScale(day, [{ start: 8 * hour, end: 17 * hour }, { start: 32 * hour, end: 41 * hour }], 36 / hour, 0.1)
  const html = await renderComponent(GanttChart, {
    rows, bars: [], range: day, scale: working, snap: hour, tickSteps: [6 * hour], formatTime: time => String(time / hour),
  })
  const labels = [...html.matchAll(/class="vw-gantt-tick(?: vw-is-end)?"[^>]*style="left:([\d.]+)px;?"/g)].map(match => Number(match[1]))
  assert.ok(labels.length >= 2, 'some labels stay')
  for (let i = 1; i < labels.length; i++) assert.ok(labels[i] - labels[i - 1] >= 76, `labels ${labels[i - 1]} and ${labels[i]} overlap`)
  // Every tick keeps its grid line.
  assert.equal(offsets(html, 'vw-gantt-grid-line', 'left').length, 9)
  assert.ok(labels.length < 9, 'squeezed labels are left out')
  const svg = renderTimelineSvg(rows, [], [], working, { tickStep: 6 * hour, tickAnchor: 0, labelWidth: 0, formatTime: time => String(time / hour) })
  const exported = [...svg.matchAll(/<text x="[\d.]+" y="24" font-size="11" font-weight="700"[^>]*>(\d+)<\/text>/g)].map(match => Number(match[1]))
  assert.deepEqual(exported, [...html.matchAll(/class="vw-gantt-tick(?: vw-is-end)?"[^>]*>(?:<!--\[-->)?(\d+)/g)].map(match => Number(match[1])))
})

test('Gantt label density uses the smallest visible tick gap', async () => {
  // The first interval of 10 and 50 is at least 76 px, but their narrowest visible gaps are 10 px and 50 px.
  const html = await render({ tickSteps: [10, 50, 100] })
  assert.deepEqual(offsets(html, 'vw-gantt-grid-line', 'left'), [0, 550])
})
