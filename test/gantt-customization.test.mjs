import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { GanttChart } from '@eightkk/vue-weave'
import { ganttScale } from './helpers/builders.mjs'
import { hour } from './helpers/time.mjs'

const rows = [{ id: 'r1', label: 'Row 1' }, { id: 'r2', label: 'Row 2' }]
const bars = [
  { id: 'a', rowId: 'r1', label: 'A', start: hour, end: 3 * hour },
  { id: 'b', rowId: 'r2', label: 'B', start: 5 * hour, end: 6 * hour },
  { id: 'm', rowId: 'r2', label: 'Launch', start: 7 * hour, end: 7 * hour },
]

const chartProps = { rows, bars, dependencies: [{ id: 'ab', from: 'a', to: 'b' }], ...ganttScale() }

function renderChart(props = {}, slots) {
  const app = createSSRApp({ render: () => h(GanttChart, { ...chartProps, ...props }, slots) })
  app.config.errorHandler = () => {}
  return renderToString(app)
}

test('GanttChart milestones with bar slot content are marked so the diamond does not clip the content', async () => {
  const bar = ({ bar }) => h('span', { class: 'custom' }, bar.label)
  const slotted = await renderChart({}, { bar })
  assert.match(slotted, /class="vw-gantt-bar vw-tone-blue vw-is-solid vw-is-milestone vw-has-slot"/)
  assert.equal((slotted.match(/vw-has-slot/g) ?? []).length, 1)
  assert.doesNotMatch(await renderChart(), /vw-has-slot/)
})

test('GanttChart bars drop their native title while the tooltip slot replaces it', async () => {
  const plain = await renderChart()
  assert.match(plain, /title="A 01:00–03:00"/)
  const withTooltip = await renderChart({}, { tooltip: ({ bar }) => bar.label })
  assert.doesNotMatch(withTooltip, /title="A 01:00–03:00"/)
  assert.match(withTooltip, /aria-label="A 01:00–03:00"/)
})

test('GanttChart stickyBandLabels leaves the server markup unchanged before scrolling', async () => {
  const headerBands = [[{ start: 0, end: 10 * hour, label: 'Shift' }]]
  assert.equal(await renderChart({ headerBands, stickyBandLabels: true }), await renderChart({ headerBands }))
})
