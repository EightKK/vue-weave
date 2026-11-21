import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createTimeScale, dependencyPath, renderTimelineSvg } from '@eightkk/vue-weave/core'
import { GanttChart } from '@eightkk/vue-weave'

const hour = 3_600_000
const rows = [{ id: 'r1', label: 'Row 1' }, { id: 'r2', label: 'Row 2' }]
const bars = [
  { id: 'a', rowId: 'r1', label: 'A', start: hour, end: 3 * hour },
  { id: 'b', rowId: 'r2', label: 'B', start: 5 * hour, end: 6 * hour },
  { id: 'm', rowId: 'r2', label: 'Launch', start: 7 * hour, end: 7 * hour },
]

const chartProps = { rows, bars, dependencies: [{ id: 'ab', from: 'a', to: 'b' }], range: { start: 0, end: 10 * hour }, pixelsPerUnit: 10 / hour }

function renderChart(props = {}, slots) {
  const app = createSSRApp({ render: () => h(GanttChart, { ...chartProps, ...props }, slots) })
  app.config.errorHandler = () => {}
  return renderToString(app)
}

const linkPaths = html => [...html.matchAll(/<path class="[^"]*" d="(M [^"]+)" marker-end/g)].map(match => match[1])

test('dependencyPath keeps the orthogonal default and draws rounded and curved connectors', () => {
  assert.equal(dependencyPath(10, 20, 110, 80), 'M 10 20 H 60 V 80 H 110')
  assert.equal(dependencyPath(10, 20, 110, 80, 'orthogonal'), dependencyPath(10, 20, 110, 80))
  assert.equal(dependencyPath(110, 20, 10, 80), 'M 110 20 h 10 V 50 H 0 V 80 H 10')

  const rounded = dependencyPath(10, 20, 110, 80, 'rounded')
  assert.equal(rounded, 'M 10 20 L 54 20 Q 60 20 60 26 L 60 74 Q 60 80 66 80 L 110 80')
  // Backward links loop around through the middle with four rounded corners, ending at the target.
  const back = dependencyPath(110, 20, 10, 80, 'rounded')
  assert.equal((back.match(/Q/g) ?? []).length, 4)
  assert.match(back, /^M 110 20 .* L 10 80$/)
  // A corner radius never exceeds half of a short segment.
  assert.equal(dependencyPath(0, 0, 40, 4, 'rounded'), 'M 0 0 L 18 0 Q 20 0 20 2 L 20 2 Q 20 4 22 4 L 40 4')
  // Same row: the forward path is a straight line, the backward one loops below the row.
  assert.equal(dependencyPath(0, 10, 40, 10, 'rounded'), 'M 0 10 L 20 10 L 20 10 L 40 10')
  assert.match(dependencyPath(40, 10, 0, 10, 'rounded'), /Q 50 24/)

  assert.equal(dependencyPath(10, 20, 110, 80, 'curve'), 'M 10 20 C 60 20 60 80 110 80')
  assert.equal(dependencyPath(110, 20, 10, 80, 'curve'), 'M 110 20 C 140 20 140 50 60 50 S -20 80 10 80')
  assert.throws(() => dependencyPath(0, 0, 10, 10, 'wavy'), RangeError)
})

test('renderTimelineSvg draws dependencies in the requested style', () => {
  const rows = [{ id: 'r1', label: 'Row 1' }, { id: 'r2', label: 'Row 2' }]
  const bars = [
    { id: 'a', rowId: 'r1', label: 'A', start: 0, end: 2 * hour },
    { id: 'b', rowId: 'r2', label: 'B', start: 3 * hour, end: 4 * hour },
  ]
  const dependencies = [{ id: 'ab', from: 'a', to: 'b' }]
  const scale = createTimeScale({ start: 0, end: 6 * hour }, 40 / hour)
  const plain = renderTimelineSvg(rows, bars, dependencies, scale)
  assert.equal(renderTimelineSvg(rows, bars, dependencies, scale, { dependencyStyle: 'orthogonal' }), plain)
  assert.match(renderTimelineSvg(rows, bars, dependencies, scale, { dependencyStyle: 'curve' }), /d="M [\d.]+ [\d.]+ C /)
  assert.match(renderTimelineSvg(rows, bars, dependencies, scale, { dependencyStyle: 'rounded' }), /d="M [^"]* Q /)
  assert.throws(() => renderTimelineSvg(rows, bars, dependencies, scale, { dependencyStyle: 'wavy' }), RangeError)
})

test('GanttChart dependencyStyle shapes the connectors and validates its value', async () => {
  const plain = await renderChart()
  assert.equal(await renderChart({ dependencyStyle: 'orthogonal' }), plain)
  assert.deepEqual(linkPaths(plain), ['M 30 33 H 40 V 99 H 50'])
  assert.deepEqual(linkPaths(await renderChart({ dependencyStyle: 'curve' })), ['M 30 33 C 40 33 40 99 50 99'])
  assert.match(linkPaths(await renderChart({ dependencyStyle: 'rounded' }))[0], / Q /)
  const reported = []
  const html = await renderChart({ dependencyStyle: 'wavy', onValidationError: error => reported.push(error.message) })
  assert.deepEqual(reported, ['Unknown dependencyStyle: wavy'])
  assert.match(html, /No rows to display/)
})
