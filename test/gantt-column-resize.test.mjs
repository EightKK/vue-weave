import assert from 'node:assert/strict'
import { test } from 'node:test'
import { timelineLabelColumnId } from 'vue-weave/core'
import { GanttChart } from 'vue-weave'
import { renderComponent } from './helpers/ssr.mjs'

const hour = 3_600_000
const rows = [{ id: 'r1', label: 'Line A' }, { id: 'r2', label: 'Line B' }]
const bars = [{ id: 'b', rowId: 'r1', label: 'Cut', start: 0, end: hour }]
const columns = [{ id: 'owner', label: 'Owner', width: 90, value: () => 'Ana' }]
const render = props => renderComponent(GanttChart, {
  rows, bars, range: { start: 0, end: 4 * hour }, ...props,
})

test('GanttChart renders no column resize handles without columnsResizable', async () => {
  const plain = await render({ columns })
  assert.doesNotMatch(plain, /vw-column-resize|role="separator"/)
  assert.match(plain, /^<div class="vw-gantt"><div class="vw-gantt-toolbar">/)
  assert.equal(await render({ columns, columnsResizable: false }), plain)
  // labelWidth sets the label column width through the theme variable on the canvas.
  assert.match(await render({ labelWidth: 200 }), /class="vw-gantt-canvas" style="[^"]*--vw-grid-step:80px;--vw-row-label-width:200px;"/)
})

test('GanttChart renders a separator for the label column and each extra column with columnsResizable', async () => {
  const html = await render({ columns, columnsResizable: true, labelWidth: 180, minColumnWidth: 60, maxColumnWidth: 400 })
  const handles = [...html.matchAll(/<div class="vw-column-resize"[^>]*>/g)].map(match => match[0])
  assert.equal(handles.length, 2)
  assert.match(handles[0], /style="left:calc\(var\(--vw-row-label-width\) \+ -8px\);" role="separator" tabindex="0" aria-orientation="vertical" aria-label="Resize column Rows" aria-valuenow="180" aria-valuemin="60" aria-valuemax="400"/)
  assert.match(handles[1], /style="left:calc\(var\(--vw-row-label-width\) \+ 82px\);" role="separator"[^>]* aria-label="Resize column Owner" aria-valuenow="90"/)
  // The separators follow their header cells.
  assert.match(html, /aria-label="Resize column Rows"[^>]*><\/div><div class="vw-extra-column" style="width:90px;">Owner<\/div><div class="vw-column-resize"/)
  const rtl = await render({ columns, columnsResizable: true, dir: 'rtl', labels: { resizeColumn: 'Change width of' } })
  assert.match(rtl, /style="right:calc\(var\(--vw-row-label-width\) \+ 82px\);"[^>]* aria-label="Change width of Owner" aria-valuenow="90" aria-valuemin="48" aria-valuemax="800"/)
  assert.match(rtl, /aria-label="Change width of Rows" aria-valuenow="154"/)
  assert.equal(timelineLabelColumnId, '$label')
})

test('GanttChart validates the column resize props', async () => {
  const errors = []
  const fail = props => render({ ...props, 'onValidationError': error => errors.push(error) }).catch(error => error)
  assert.ok(await fail({ labelWidth: 0 }) instanceof RangeError)
  assert.ok(await fail({ minColumnWidth: Number.NaN }) instanceof RangeError)
  assert.ok(await fail({ minColumnWidth: 50, maxColumnWidth: 40 }) instanceof RangeError)
  const reserved = await fail({ columnsResizable: true, columns: [{ ...columns[0], id: timelineLabelColumnId }] })
  assert.match(reserved.message, /reserved/)
  assert.equal(errors.length, 4)
})
