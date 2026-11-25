// TreeGrid header sorting and filtering in core: projectTreeGridRows keeps the hierarchy, and treeGridCellText gives the
// text the grid shows. Also the SSR markup of the opt-in header controls.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createTreeGridIndex, nextTimelineSort, projectTreeGridRows, renderTreeGridSvg, timelineLabelColumnId, treeGridCellText,
  treeGridColumnOffsets, treeGridDefaultLabels,
} from '@eightkk/vue-weave/core'
import { TreeGrid } from '@eightkk/vue-weave'
import { renderComponent } from './helpers/ssr.mjs'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'

const rows = [
  { id: 'tools', label: 'Tools' },
  { id: 'saw', parentId: 'tools', label: 'Saw', data: { price: 30, status: 'active', ok: true } },
  { id: 'drill', parentId: 'tools', label: 'Drill', data: { price: 120, status: 'discontinued', ok: false } },
  { id: 'hammer', parentId: 'tools', label: 'Hammer', data: { price: 15, status: 'active', ok: true } },
  { id: 'garden', label: 'Garden' },
  { id: 'hose', parentId: 'garden', label: 'Hose', data: { price: 25, status: 'active' } },
  { id: 'rake', parentId: 'garden', label: 'Rake', data: { status: 'discontinued' } },
  { id: 'kitchen', label: 'Kitchen', childStatus: 'unloaded' },
]
const columns = [
  { id: 'price', label: 'Price', width: 80, value: row => row.data?.price, editor: { kind: 'number', format: value => `$${value}` } },
  {
    id: 'status', label: 'Status', width: 100, value: row => row.data?.status,
    editor: { kind: 'select', choices: [{ value: 'active', label: 'Active' }, { value: 'discontinued', label: 'Discontinued' }] },
  },
  { id: 'ok', label: 'OK', width: 60, value: row => row.data?.ok },
  { id: 'stock', label: 'Stock', width: 60, missingCell: 'unknown' },
]
const cells = [
  { rowId: 'saw', columnId: 'stock', value: 4 },
  { rowId: 'drill', columnId: 'stock', value: 0 },
  { rowId: 'hose', columnId: 'stock', status: 'none' },
]
const input = { rows, columns, cells }
const ids = list => list.map(row => row.id)

test('treeGridCellText gives the text the grid shows', () => {
  const index = createTreeGridIndex(input)
  assert.equal(treeGridCellText(index, 'saw', 'price'), '$30')
  assert.equal(treeGridCellText(index, 'saw', 'status'), 'Active')
  assert.equal(treeGridCellText(index, 'saw', 'ok'), 'Yes')
  assert.equal(treeGridCellText(index, 'drill', 'ok', { labels: { no: 'Nein' } }), 'Nein')
  assert.equal(treeGridCellText(index, 'saw', 'stock'), '4')
  assert.equal(treeGridCellText(index, 'drill', 'stock'), '0')
  assert.equal(treeGridCellText(index, 'hose', 'stock'), '')
  assert.equal(treeGridCellText(index, 'tools', 'price'), '')
  assert.equal(treeGridCellText(index, 'saw', 'price', { formatValue: (value, { row, column }) => `${row.id}/${column.id}/${value}` }), 'saw/price/30')
  assert.throws(() => treeGridCellText(index, 'nope', 'price'), /Unknown row/)
  assert.equal(treeGridDefaultLabels.sortBy, 'Sort by')
  assert.equal(treeGridDefaultLabels.resizeColumn, 'Resize column')
})

test('projectTreeGridRows sorts siblings within their parent, stably, with cells without a value last', () => {
  assert.deepEqual(ids(projectTreeGridRows(input, {}).rows), ids(rows))
  const asc = projectTreeGridRows(input, { sort: [{ ruleId: 'price', direction: 'asc' }] })
  // Groups have no price and keep their order; within each group the prices ascend and Rake (no price) goes last.
  assert.deepEqual(ids(asc.rows), ['tools', 'hammer', 'saw', 'drill', 'garden', 'hose', 'rake', 'kitchen'])
  const desc = projectTreeGridRows(input, { sort: [{ ruleId: 'price', direction: 'desc' }] })
  assert.deepEqual(ids(desc.rows), ['tools', 'drill', 'saw', 'hammer', 'garden', 'hose', 'rake', 'kitchen'])
  // The tree column sorts by label; a second rule breaks ties.
  const byLabel = projectTreeGridRows(input, { sort: [{ ruleId: timelineLabelColumnId, direction: 'desc' }] })
  assert.deepEqual(ids(byLabel.rows), ['tools', 'saw', 'hammer', 'drill', 'kitchen', 'garden', 'rake', 'hose'])
  const twoRules = projectTreeGridRows(input, { sort: [{ ruleId: 'status', direction: 'asc' }, { ruleId: 'price', direction: 'desc' }] })
  assert.deepEqual(ids(twoRules.rows), ['tools', 'saw', 'hammer', 'drill', 'garden', 'hose', 'rake', 'kitchen'])
  // Booleans compare as 0 and 1; sparse cells sort too.
  assert.deepEqual(ids(projectTreeGridRows(input, { sort: [{ ruleId: 'ok', direction: 'asc' }] }).rows).slice(0, 4), ['tools', 'drill', 'saw', 'hammer'])
  assert.deepEqual(ids(projectTreeGridRows(input, { sort: [{ ruleId: 'stock', direction: 'asc' }] }).rows).slice(0, 4), ['tools', 'drill', 'saw', 'hammer'])
  // A registered rule wins over a column of the same ID.
  const rule = projectTreeGridRows({ ...input, sortRules: { price: (a, b) => a.label.length - b.label.length } }, { sort: [{ ruleId: 'price', direction: 'asc' }] })
  assert.deepEqual(ids(rule.rows), ['tools', 'saw', 'drill', 'hammer', 'garden', 'hose', 'rake', 'kitchen'])
  // nextTimelineSort proposals apply directly.
  assert.deepEqual(nextTimelineSort([], 'price'), [{ ruleId: 'price', direction: 'asc' }])
})

test('projectTreeGridRows keeps the ancestors of matching rows and filters cells with their rows', () => {
  const text = projectTreeGridRows(input, { filters: [{ columnId: 'status', text: ' discont ' }] })
  assert.deepEqual(ids(text.rows), ['tools', 'drill', 'garden', 'rake'])
  assert.deepEqual(text.matchedRowIds, ['drill', 'rake'])
  assert.deepEqual(text.cells, [cells[1]])
  // The displayed text is searched: the price shows as "$120".
  assert.deepEqual(ids(projectTreeGridRows(input, { filters: [{ columnId: 'price', text: '$1' }] }).rows), ['tools', 'drill', 'hammer'])
  // A value list compares raw values; the tree column reads labels.
  const values = projectTreeGridRows(input, { filters: [{ columnId: 'status', values: ['active'] }, { columnId: timelineLabelColumnId, text: 'h' }] })
  assert.deepEqual(ids(values.rows), ['tools', 'hammer', 'garden', 'hose'])
  assert.deepEqual(ids(projectTreeGridRows(input, { filters: [{ columnId: 'status', values: [] }] }).rows), [])
  // A parent that matches keeps its own place; its children that do not match are dropped.
  assert.deepEqual(ids(projectTreeGridRows(input, { filters: [{ columnId: timelineLabelColumnId, text: 'garden' }] }).rows), ['garden'])
  // A blank filter and a filter on a cell without a value.
  assert.equal(projectTreeGridRows(input, { filters: [{ columnId: 'price', text: '  ' }] }).rows.length, rows.length)
  assert.deepEqual(ids(projectTreeGridRows(input, { filters: [{ columnId: 'stock', values: [0] }] }).rows), ['tools', 'drill'])
  // Sort and filter together.
  const both = projectTreeGridRows(input, { sort: [{ ruleId: 'price', direction: 'desc' }], filters: [{ columnId: 'status', values: ['active'] }] })
  assert.deepEqual(ids(both.rows), ['tools', 'saw', 'hammer', 'garden', 'hose'])
})

test('projectTreeGridRows reports unknown columns, validates its input and never mutates it', () => {
  const frozen = structuredClone({ rows: rows.map(({ data, ...row }) => row), cells })
  const snapshot = JSON.stringify(frozen)
  const sort = [{ ruleId: 'nope', direction: 'asc' }]
  const filters = [{ columnId: 'missing', text: 'x' }]
  const result = projectTreeGridRows({ rows: frozen.rows, columns, cells: frozen.cells }, { sort, filters })
  assert.equal(JSON.stringify(frozen), snapshot)
  assert.deepEqual(result.diagnostics.map(item => [item.code, item.id]), [['unknown-column', 'missing'], ['unknown-sort-rule', 'nope']])
  assert.deepEqual(ids(result.rows), ids(frozen.rows))
  assert.notEqual(result.rows, frozen.rows)
  assert.throws(() => projectTreeGridRows(input, { sort: [{ ruleId: 'price', direction: 'up' }] }), RangeError)
  assert.throws(() => projectTreeGridRows(input, { sort: 'price' }), TypeError)
  assert.throws(() => projectTreeGridRows(input, { filters: [{ columnId: 'price', values: [Number.NaN] }] }), RangeError)
  assert.throws(() => projectTreeGridRows(input, { filters: [{ text: 'x' }] }), TypeError)
  assert.throws(() => projectTreeGridRows(input, null), TypeError)
  assert.throws(() => projectTreeGridRows({ rows: [{ id: 'a', label: 'A', parentId: 'b' }, { id: 'b', label: 'B', parentId: 'a' }], columns }, {}), /cycle/i)
  assert.throws(() => projectTreeGridRows({ rows: [...rows, { id: 'saw', label: 'Again' }], columns }, {}), /Duplicate/)
})

test('projectTreeGridRows handles a deep chain without recursion', () => {
  const chain = Array.from({ length: 12_000 }, (_, i) => ({ id: 'n' + i, label: 'Node ' + i, ...i ? { parentId: 'n' + (i - 1) } : {} }))
  const result = projectTreeGridRows({ rows: chain, columns: [] }, { sort: [{ ruleId: timelineLabelColumnId, direction: 'desc' }], filters: [{ columnId: timelineLabelColumnId, text: 'Node 11999' }] })
  assert.equal(result.rows.length, 12_000)
  assert.deepEqual(result.matchedRowIds, ['n11999'])
})

test('TreeGrid renders the opt-in header controls on the server and keeps its default header without them', async () => {
  const plain = await renderComponent(TreeGrid, { rows, columns, cells, expandedIds: ['tools'] })
  assert.match(plain, /<div class="vw-tree-grid-corner" role="columnheader" aria-colindex="1">Name<\/div>/)
  assert.doesNotMatch(plain, /vw-column-resize|vw-column-sort|aria-sort/)
  const html = await renderComponent(TreeGrid, {
    rows, columns, cells, expandedIds: ['tools'], columnsResizable: true, sortableColumns: true, filterableColumns: ['status'],
    sort: [{ ruleId: 'price', direction: 'desc' }, { ruleId: 'status', direction: 'asc' }], filters: [{ columnId: 'status', values: ['active'] }],
    treeColumnWidth: 200, minColumnWidth: 40, maxColumnWidth: 400,
  })
  assert.match(html, /role="columnheader" aria-colindex="1" aria-label="Name" aria-sort="none"/)
  assert.match(html, /aria-colindex="2" aria-label="Price" aria-sort="descending"/)
  // A later rule shows its direction in the button's name, not in aria-sort.
  assert.match(html, /aria-colindex="3" aria-label="Status" style="[^"]*" data-vw-header="status"/)
  assert.match(html, /aria-label="Sort by Status \(ascending\)"/)
  assert.match(html, /aria-label="Filter Status \(filtered\)"/)
  assert.match(html, /role="separator" tabindex="0" aria-orientation="vertical" aria-label="Resize column Name" aria-valuenow="200" aria-valuemin="40" aria-valuemax="400"/)
  assert.match(html, /aria-label="Resize column Price" aria-valuenow="80"/)
  assert.doesNotMatch(html, /vw-column-filter-popover|undefined|NaN/)
  assert.equal(await renderComponent(TreeGrid, { rows, columns, sortableColumns: true }), await renderComponent(TreeGrid, { rows, columns, sortableColumns: true }))
})

test('projectTreeGridRows reads sort rules by own key only: columns named like Object.prototype members sort and filter', () => {
  const flat = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }]
  for (const id of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
    const own = [{ id, label: id, width: 70 }, { id: 'x', label: 'X', width: 30 }]
    const ownCells = [
      { rowId: 'a', columnId: id, value: 2 }, { rowId: 'b', columnId: id, value: 3 }, { rowId: 'c', columnId: id, value: 1 },
    ]
    const sort = [{ ruleId: id, direction: 'asc' }]
    for (const sortRules of [undefined, {}]) {
      const projected = projectTreeGridRows({ rows: flat, columns: own, cells: ownCells, sortRules }, { sort })
      assert.deepEqual(ids(projected.rows), ['c', 'a', 'b'], `${id} with sortRules ${JSON.stringify(sortRules)}`)
      assert.deepEqual(projected.diagnostics, [])
    }
    // A registered rule of that name (a computed key is an own property, even __proto__) still wins over the column.
    const registered = projectTreeGridRows(
      { rows: flat, columns: own, cells: ownCells, sortRules: { [id]: (x, y) => y.label.localeCompare(x.label) } }, { sort },
    )
    assert.deepEqual(ids(registered.rows), ['c', 'b', 'a'], id)
    // Without such a column the ID is reported, not taken from the prototype.
    const unknown = projectTreeGridRows({ rows: flat, columns: [], sortRules: {} }, { sort, filters: [{ columnId: id, text: 'x' }] })
    assert.deepEqual(ids(unknown.rows), ['a', 'b', 'c'], id)
    assert.deepEqual(unknown.diagnostics.map(item => [item.code, item.id]), [['unknown-column', id], ['unknown-sort-rule', id]])
    // Filters by text and by value.
    assert.deepEqual(ids(projectTreeGridRows({ rows: flat, columns: own, cells: ownCells }, { filters: [{ columnId: id, values: [3] }] }).rows), ['b'])
    assert.deepEqual(ids(projectTreeGridRows({ rows: flat, columns: own, cells: ownCells }, { filters: [{ columnId: id, text: '1' }] }).rows), ['c'])
    // Widths: the offsets and the export use the column's own width.
    assert.deepEqual(treeGridColumnOffsets(own), [0, 70, 100])
    const svg = renderTreeGridSvg(flat, own, { cells: ownCells, sort, sortRules: {}, treeColumnWidth: 100 })
    assert.match(svg, /<svg[^>]* width="200"/)
    assert.ok(svg.indexOf('>1<') < svg.indexOf('>2<') && svg.indexOf('>2<') < svg.indexOf('>3<'), id)
  }
})

test('TreeGrid without lines keeps its header controls on the server only when they are opted in', async () => {
  // Without header controls: the plain empty state, a single row with the text and no header.
  // Slot and fragment comments are left out of the comparisons.
  const bare = html => html.replace(/<!--[^]*?-->/g, '')
  const plain = bare(await renderComponent(TreeGrid, { rows: [], columns }))
  assert.match(plain, /aria-rowcount="1"[^>]*tabindex="0"[^>]*><div class="vw-tree-grid-empty" role="row" aria-rowindex="1"><div role="gridcell">No rows to display<\/div><\/div><\/div>/)
  assert.doesNotMatch(plain, /columnheader/)
  // With them: the header row stays (row 1) and the empty text is row 2 of the body.
  const kept = bare(await renderComponent(TreeGrid, { rows: [], columns, sortableColumns: true, filterableColumns: true, filters: [{ columnId: 'price', text: 'zzzz' }] }))
  assert.match(kept, /role="treegrid"[^>]*aria-rowcount="2"[^>]*tabindex="0"/)
  assert.match(kept, /class="vw-tree-grid-head[^"]*" role="row" aria-rowindex="1"/)
  assert.match(kept, /aria-label="Sort by Price"/)
  assert.match(kept, /aria-label="Filter Price \(filtered\)"/)
  assert.match(kept, /<div class="vw-tree-grid-body" role="rowgroup"><div class="vw-tree-grid-empty" role="row" aria-rowindex="2"[^>]*><div role="gridcell">No rows to display<\/div><\/div>/)
  // Invalid data still shows the plain empty state.
  const app = createSSRApp({ render: () => h(TreeGrid, { rows: [{ id: 'a', label: 'A', parentId: 'a' }], columns, sortableColumns: true }) })
  app.config.errorHandler = () => {}
  const invalid = bare(await renderToString(app))
  assert.match(invalid, /<div class="vw-tree-grid-empty" role="row" aria-rowindex="1">/)
  assert.doesNotMatch(invalid, /columnheader/)
})

test('TreeGrid reports invalid header options through validation-error', async () => {
  const cases = [
    [{ sortableColumns: ['nope'] }, /Unknown column in sortableColumns: nope/],
    [{ filterableColumns: 'price' }, /filterableColumns must be a boolean or a list of column IDs/],
    [{ minColumnWidth: 0 }, /minColumnWidth must be finite and positive/],
    [{ minColumnWidth: 50, maxColumnWidth: 40 }, /maxColumnWidth must be finite and at least minColumnWidth/],
    [{ columnsResizable: true, columns: [{ id: timelineLabelColumnId, label: 'X', width: 50 }] }, /reserved for the tree column/],
  ]
  for (const [extra, message] of cases) {
    const errors = []
    await renderComponent(TreeGrid, { rows, columns, ...extra, 'onValidation-error': error => errors.push(error) }).catch(() => {})
    assert.ok(errors.some(error => message.test(error.message)), `${JSON.stringify(Object.keys(extra))}: ${errors.map(error => error.message)}`)
  }
})
