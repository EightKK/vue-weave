import assert from 'node:assert/strict'
import { test } from 'node:test'
import { h } from 'vue'
import { TreeGrid } from '@eightkk/vue-weave'
import { renderComponent } from './helpers/ssr.mjs'

const groups = Array.from({ length: 50 }, (_, g) => ({ id: 'g' + g, label: `Group ${g + 1}` }))
const items = groups.flatMap(group => Array.from({ length: 100 }, (_, i) => ({ id: `${group.id}-${i}`, parentId: group.id, label: `${group.label} item ${i + 1}` })))
const rows = [...groups, ...items, { id: 'lazy', label: 'Lazy group', childStatus: 'loading' }]
const columns = [
  { id: 'code', label: 'Code', width: 90, value: row => row.id },
  ...Array.from({ length: 200 }, (_, c) => ({ id: 'd' + c, label: 'Day ' + (c + 1), width: 60, missingCell: c % 2 ? 'unknown' : 'empty' })),
]
const cells = [
  { rowId: 'g0', columnId: 'd0', value: 0 },
  { rowId: 'g0', columnId: 'd1', status: 'not-applicable' },
  { rowId: 'g0', columnId: 'd2', value: true, tone: 'teal' },
]

test('TreeGrid renders a bounded window of a large grid on the server with stable markup', async () => {
  const props = { rows, columns, cells, expandedIds: ['g0', 'lazy'], height: 400, labels: { grid: 'Matrix' }, highlightedRowIds: ['g0-1'] }
  const html = await renderComponent(TreeGrid, props)
  assert.match(html, /role="treegrid" aria-label="Matrix" aria-rowcount="153" aria-colcount="202" aria-readonly="true"/)
  assert.match(html, /role="columnheader" aria-colindex="1">Name</)
  const renderedRows = html.match(/role="row"/g).length - 1
  const renderedCells = html.match(/role="gridcell"/g).length
  assert.ok(renderedRows > 5 && renderedRows < 30, `rendered rows ${renderedRows}`)
  assert.ok(renderedCells < 30 * 25, `rendered cells ${renderedCells}`)
  // Values, states and the default roving tab stop on the first row header.
  assert.match(html, /aria-rowindex="2" aria-level="1" aria-setsize="51" aria-posinset="1" aria-expanded="true"/)
  assert.match(html, /role="rowheader" class="vw-tree-grid-header-cell vw-is-active" data-vw-col="0" aria-colindex="1" tabindex="0" aria-label="Group 1"/)
  assert.match(html, /aria-colindex="3" tabindex="-1"[^>]*>0</)
  assert.match(html, /vw-is-not-applicable[^>]*>.*?n\/a<\/span><span class="vw-sr-only">Not applicable</)
  assert.match(html, /vw-tone-teal[^>]*>Yes/)
  assert.match(html, /vw-is-highlighted/)
  assert.doesNotMatch(html, /undefined|NaN/)
  // Two renders give the same markup (useId), so hydration matches.
  assert.equal(await renderComponent(TreeGrid, props), html)
})

test('TreeGrid renders status lines, slots, the empty state and right-to-left on the server', async () => {
  const html = await renderComponent(TreeGrid, {
    rows: [{ id: 'lazy', label: 'Lazy', childStatus: 'failed' }, { id: 'x', label: 'X', detail: 'Extra' }], columns: columns.slice(0, 3),
    expandedIds: ['lazy'], dir: 'rtl', editable: true, spreadsheet: true, rowsEditable: true,
  }, {
    'row-header': ({ row, line }) => h('em', `${row.label} at ${line.level}`),
    cell: ({ column, cell }) => h('b', `${column.id}:${cell.state}`),
  })
  assert.match(html, /class="vw-tree-grid vw-rtl vw-is-editable vw-is-spreadsheet" dir="rtl"/)
  assert.match(html, /<span role="status" class="vw-tree-grid-status">Failed to load</)
  assert.match(html, /<em>Lazy at 1<\/em>/)
  assert.match(html, /<b>d1:unknown<\/b>/)
  assert.match(html, /aria-label="Add row below Lazy"/)
  assert.match(html, /aria-description="Extra"/)
  const empty = await renderComponent(TreeGrid, { rows: [], columns }, { empty: () => h('p', 'Nothing yet') })
  assert.match(empty, /Nothing yet/)
})
