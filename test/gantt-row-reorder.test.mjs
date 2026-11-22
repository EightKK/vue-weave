import assert from 'node:assert/strict'
import { test } from 'node:test'
import { GanttChart } from '@eightkk/vue-weave'
import { renderWith } from './helpers/ssr.mjs'
import { ganttScale } from './helpers/builders.mjs'
import { hour } from './helpers/time.mjs'

const chartRows = [{ id: 'p', label: 'Parent' }, { id: 'r1', label: 'Row 1', parentId: 'p' }, { id: 'r2', label: 'Row 2' }]
const chartBars = [
  { id: 'a', rowId: 'r1', label: 'A', start: hour, end: 3 * hour, editable: true, progress: 0.5 },
  { id: 'b', rowId: 'r2', label: 'B', start: 4 * hour, end: 6 * hour },
]

const chartProps = { rows: chartRows, bars: chartBars, ...ganttScale() }
const render = renderWith(GanttChart, chartProps)

test('GanttChart server markup is unchanged without rowsReorderable and statusDate', async () => {
  for (const extra of [{}, { markers: [{ id: 'x', time: 2 * hour, label: 'X' }], showNow: true, now: hour }, { dir: 'rtl', rowDraggable: true, creatable: true }]) {
    const plain = await render(extra)
    assert.equal(await render({ ...extra, rowsReorderable: false, showProgressLine: true, validateRowMove: () => false }), plain)
    assert.doesNotMatch(plain, /vw-row-move-handle|vw-reorderable|vw-gantt-status-date|vw-gantt-progress-line|reorder-hint|Status date/)
  }
  assert.doesNotMatch(await render({ rowsReorderable: true, readonly: true }), /vw-row-move-handle/)
})

test('GanttChart renders row move handles with names and a keyboard hint on the server', async () => {
  const html = await render({ rowsReorderable: true, creatable: row => row.id === 'r2', labels: { moveRow: 'Zeile verschieben' } })
  const handles = html.match(/<button type="button" class="vw-row-move-handle"[^>]*>/g)
  assert.equal(handles.length, 3)
  assert.match(handles[1], /data-vw-row-handle="r1" aria-label="Zeile verschieben Row 1" aria-describedby="(v-\d+)-reorder-hint"/)
  const hint = /aria-describedby="([^"]+-reorder-hint)"/.exec(html)[1]
  assert.match(html, new RegExp(`<span id="${hint}" class="vw-sr-only">Alt\\+Up and Alt\\+Down move the row among its siblings\\. Alt\\+Shift\\+Right indents`))
  // The parent keeps its toggle after the handle, and the creatable row keeps its add button.
  assert.match(html, /aria-label="Zeile verschieben Parent"[^>]*><span aria-hidden="true">⋮⋮<\/span><\/button><button type="button" class="vw-row-toggle"/)
  assert.match(html, /aria-label="Zeile verschieben Row 2"[^>]*>.*?<\/button><!----><button type="button" class="vw-gantt-create-button" aria-label="Add bar to Row 2">/)
  assert.match(await render({ rowsReorderable: true, dir: 'rtl' }), /Alt\+Shift\+Left indents it and Alt\+Shift\+Right outdents it/)
})
