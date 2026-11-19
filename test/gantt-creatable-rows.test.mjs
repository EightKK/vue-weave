import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { GanttChart } from 'vue-weave'
import { renderComponent } from './helpers/ssr.mjs'

const hour = 3_600_000
const rows = [{ id: 'p', label: 'Parent' }, { id: 'r1', label: 'Row 1', parentId: 'p' }, { id: 'r2', label: 'Row 2' }]
const bars = [
  { id: 'a', rowId: 'r1', label: 'A', start: hour, end: 3 * hour, editable: true },
  { id: 'b', rowId: 'r2', label: 'B', start: 4 * hour, end: 6 * hour },
]

const chartProps = { rows, bars, dependencies: [{ id: 'ab', from: 'a', to: 'b' }], range: { start: 0, end: 10 * hour }, pixelsPerUnit: 10 / hour }
const render = (props = {}) => renderComponent(GanttChart, { ...chartProps, ...props })

test('GanttChart server markup is unchanged without creatable and cascade', async () => {
  for (const extra of [{}, { connectable: true, reconnectable: true, selectedDependencyId: 'ab' }, { dir: 'rtl', progressEditable: true }]) {
    const plain = await render(extra)
    const disabled = await render({
      ...extra, creatable: false, createDuration: hour, validateCreate: () => false, cascade: () => [{ id: 'b', before: bars[1], after: bars[0], mode: 'move', source: 'pointer' }],
    })
    assert.equal(disabled, plain)
    assert.doesNotMatch(plain, /vw-creatable|vw-gantt-create|vw-gantt-cascade|Add bar to/)
  }
})

test('GanttChart renders an add button for each creatable row on the server', async () => {
  const html = await render({ creatable: row => row.id !== 'p', labels: { createIn: 'Balken hinzufügen zu' } })
  const buttons = html.match(/<button type="button" class="vw-gantt-create-button"[^>]*>/g)
  assert.deepEqual(buttons, [
    '<button type="button" class="vw-gantt-create-button" aria-label="Balken hinzufügen zu Row 1">',
    '<button type="button" class="vw-gantt-create-button" aria-label="Balken hinzufügen zu Row 2">',
  ])
  // The parent row keeps its expand toggle and gets no button; no preview exists before a gesture.
  assert.match(html, /aria-label="Collapse Parent">▾<\/button><div class="vw-row-content">/)
  assert.doesNotMatch(html, /vw-gantt-create-preview|vw-gantt-cascade-preview/)
  assert.equal((await render({ creatable: true })).match(/vw-gantt-create-button/g).length, 3)
  assert.doesNotMatch(await render({ creatable: true, readonly: true }), /vw-gantt-create-button/)
})

test('GanttChart reports an invalid createDuration through validation-error', async () => {
  for (const createDuration of [0, -hour, Number.NaN, Infinity]) {
    const reported = []
    const app = createSSRApp({ render: () => h(GanttChart, { ...chartProps, creatable: true, createDuration, onValidationError: error => reported.push(error) }) })
    app.config.errorHandler = () => {}
    const html = await renderToString(app)
    assert.equal(reported.length, 1)
    assert.ok(reported[0] instanceof RangeError)
    assert.match(reported[0].message, /createDuration/)
    assert.match(html, /No rows to display/)
  }
})
