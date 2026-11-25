import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  aggregateTimeBuckets, createTimeBucketColumns, defaultSvgExportTheme, flattenTreeGrid, createTreeGridIndex, renderTreeGridSvg,
  timelineLabelColumnId, treeGridCellsFromTimeBuckets,
} from '@eightkk/vue-weave/core'
import { assertWellFormed, hostile, svgSize, svgTexts } from './helpers/svg.mjs'

const rows = [
  { id: 'tools', label: 'Tools', detail: '3 items' },
  { id: 'saw', parentId: 'tools', label: 'Saw', data: { price: 30, status: 'active', ok: true } },
  { id: 'drill', parentId: 'tools', label: 'Drill', data: { price: 120, status: 'discontinued', ok: false } },
  { id: 'hammer', parentId: 'tools', label: 'Hammer', data: { price: 15, status: 'active', ok: true } },
  { id: 'garden', label: 'Garden' },
  { id: 'hose', parentId: 'garden', label: 'Hose', data: { price: 25, status: 'active' } },
  { id: 'kitchen', label: 'Kitchen', childStatus: 'unloaded' },
]
const columns = [
  { id: 'price', label: 'Price', width: 80, value: row => row.data?.price, editor: { kind: 'number', format: value => `$${value}` } },
  {
    id: 'status', label: 'Status', width: 110, value: row => row.data?.status,
    editor: { kind: 'select', choices: [{ value: 'active', label: 'Active' }, { value: 'discontinued', label: 'Discontinued' }] },
  },
  { id: 'ok', label: 'OK', width: 60, value: row => row.data?.ok },
  { id: 'stock', label: 'Stock', width: 60, missingCell: 'unknown' },
]
const cells = [
  { rowId: 'saw', columnId: 'stock', value: 4, tone: 'teal' },
  { rowId: 'drill', columnId: 'stock', status: 'failed' },
  { rowId: 'hose', columnId: 'stock', status: 'none' },
]
const rowOrder = svg => [...svg.matchAll(/<g class="vw-tree-grid-row(?: vw-is-status)?"><title>([^<]*)<\/title>/g)].map(match => match[1])

test('renderTreeGridSvg draws the header, the whole tree and the cell texts the grid shows', () => {
  const svg = renderTreeGridSvg(rows, columns, { cells, title: 'Catalog' })
  assertWellFormed(svg)
  const texts = svgTexts(svg)
  for (const text of ['Name', 'Price', 'Status', 'OK', 'Stock', 'Tools', '3 items', 'Saw', '$30', 'Active', 'Discontinued', 'Yes', 'No', '4', '?', '!', '–']) {
    assert.ok(texts.includes(text), 'draws ' + text)
  }
  // Every row is expanded by default, so the status line of the unloaded children shows too.
  assert.deepEqual(rowOrder(svg), ['Tools 3 items', 'Saw', 'Drill', 'Hammer', 'Garden', 'Hose', 'Kitchen', 'Not loaded'])
  assert.ok(texts.includes('Not loaded'))
  assert.match(svg, /<title>Failed to load<\/title>/, 'states carry their full word')
  assert.match(svg, new RegExp(`fill="${defaultSvgExportTheme.tones.teal.pale}"`), 'toned cells are filled')
  assert.match(svg, /text-anchor="end"[^>]*>\$30</, 'numbers align at the end')
  assert.deepEqual(svgSize(svg), { width: 240 + 80 + 110 + 60 + 60, height: 36 + 8 * 32 })
})

test('renderTreeGridSvg follows expandedIds, row and column ranges and the tree column option', () => {
  const index = createTreeGridIndex({ rows, columns, cells })
  const flat = flattenTreeGrid(index, ['tools'])
  const svg = renderTreeGridSvg(rows, columns, { cells, expandedIds: ['tools'] })
  assert.deepEqual(rowOrder(svg), flat.lines.map(line => line.row.label === 'Tools' ? 'Tools 3 items' : line.row.label))
  // An expanded row points down, a collapsed one towards the reading direction.
  assert.match(svg, /<path d="M 10 50 L 14 54 L 18 50"/, 'expanded glyph')
  assert.match(svg, /<path d="M 12 176 L 16 180 L 12 184"/, 'collapsed glyph')

  const part = renderTreeGridSvg(rows, columns, { cells, rowRange: { start: 1, end: 3 }, columnRange: { start: 1, end: 3 }, rowHeight: 20, headerHeight: 24 })
  assertWellFormed(part)
  assert.deepEqual(rowOrder(part), ['Saw', 'Drill'])
  const texts = svgTexts(part)
  assert.ok(!texts.includes('Price') && !texts.includes('Stock') && texts.includes('Status') && texts.includes('OK'))
  assert.deepEqual(svgSize(part), { width: 240 + 110 + 60, height: 24 + 2 * 20 })

  const noTree = renderTreeGridSvg(rows, columns, { cells, includeTreeColumn: false })
  assert.equal(svgSize(noTree).width, 310)
  assert.ok(!svgTexts(noTree).includes('Name'))
  assert.throws(() => renderTreeGridSvg(rows, columns, { rowRange: { start: 0, end: 99 } }), RangeError)
  assert.throws(() => renderTreeGridSvg(rows, columns, { columnRange: { start: 2, end: 1 } }), RangeError)
  assert.throws(() => renderTreeGridSvg(rows, columns, { includeTreeColumn: false, columnRange: { start: 0, end: 0 } }), RangeError)
})

test('renderTreeGridSvg applies the sort and filters with projectTreeGridRows and marks the headers', () => {
  const sorted = renderTreeGridSvg(rows, columns, { cells, sort: [{ ruleId: 'price', direction: 'desc' }] })
  assertWellFormed(sorted)
  assert.deepEqual(rowOrder(sorted), ['Tools 3 items', 'Drill', 'Saw', 'Hammer', 'Garden', 'Hose', 'Kitchen', 'Not loaded'])
  assert.ok(svgTexts(sorted).includes('▼'))
  const filtered = renderTreeGridSvg(rows, columns, {
    cells, filters: [{ columnId: 'status', text: 'disc' }], sort: [{ ruleId: timelineLabelColumnId, direction: 'asc' }],
  })
  assert.deepEqual(rowOrder(filtered), ['Tools 3 items', 'Drill'])
  assert.ok(svgTexts(filtered).includes('▲'), 'the tree column header shows its sort')
  assert.ok(svgTexts(filtered).includes('⏷'), 'the filtered column is marked')
  // Rows a parent has already projected are drawn as given.
  const marked = renderTreeGridSvg(rows, columns, { cells, sort: [{ ruleId: 'price', direction: 'desc' }], applyView: false })
  assert.deepEqual(rowOrder(marked).slice(0, 3), ['Tools 3 items', 'Saw', 'Drill'])
  assert.ok(svgTexts(marked).includes('▼'))
})

test('renderTreeGridSvg draws period tables, selection, highlights and right-to-left grids', () => {
  const periods = [{ start: 0, end: 10, label: 'W1' }, { start: 10, end: 20, label: 'W2' }, { start: 20, end: 30, label: 'W3' }]
  const buckets = createTimeBucketColumns(periods, { width: 50 })
  const items = [{ rowId: 'a', time: 1, value: 2 }, { rowId: 'a', time: 3, value: 5 }, { rowId: 'b', time: 12, value: 4 }]
  const periodCells = treeGridCellsFromTimeBuckets(aggregateTimeBuckets(items, buckets, { rowIds: ['a', 'b'], loaded: [{ start: 0, end: 20 }] }))
  const tableRows = [{ id: 'a', label: 'Line A' }, { id: 'b', label: 'Line B' }]
  const svg = renderTreeGridSvg(tableRows, buckets.map(({ id, label, width }) => ({ id, label, width })), {
    cells: periodCells, selectedRowIds: ['b'], highlightedRowIds: ['a'], highlightedCells: [{ rowId: 'b', columnId: buckets[1].id }],
    highlightColor: '#ff00aa', selectedColor: 'rgb(1, 2, 3)', direction: 'rtl', treeColumnWidth: 100,
  })
  assertWellFormed(svg)
  const texts = svgTexts(svg)
  for (const text of ['W1', 'W2', 'W3', '7', '0', '4', '·']) assert.ok(texts.includes(text), 'draws ' + text)
  assert.match(svg, /fill="rgb\(1, 2, 3\)"/)
  assert.match(svg, /stroke="#ff00aa" stroke-width="2"/)
  assert.match(svg, /fill="#ff00aa"[^>]*direction="rtl"[^>]*>Line A</)
  assert.match(svg, /direction="rtl"/)
  // The tree column is on the right.
  assert.match(svg, /<svg x="150" y="0" width="100" height="36" overflow="hidden"><text x="92"[^>]*>Name</)
  assert.deepEqual(svgSize(svg), { width: 250, height: 36 + 64 })
})

test('renderTreeGridSvg escapes text, is deterministic, validates and never mutates its input', () => {
  const hostileRows = [{ id: 'x', label: hostile, detail: hostile }]
  const hostileColumns = [{ id: 'c', label: hostile, width: 90, value: () => hostile }]
  const options = { title: hostile, labels: { treeColumn: hostile } }
  const svg = renderTreeGridSvg(hostileRows, hostileColumns, options)
  assertWellFormed(svg)
  assert.ok(!svg.includes('<b>'))
  assert.equal(svg, renderTreeGridSvg(hostileRows, hostileColumns, options))
  const copy = structuredClone(cells)
  renderTreeGridSvg(rows, columns, { cells, sort: [{ ruleId: 'price', direction: 'asc' }] })
  assert.deepEqual(cells, copy)

  assert.throws(() => renderTreeGridSvg([{ id: 'a', label: 'A', parentId: 'b' }, { id: 'b', label: 'B', parentId: 'a' }], columns), /cycle/i)
  assert.throws(() => renderTreeGridSvg([{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }], columns), /Duplicate/)
  assert.throws(() => renderTreeGridSvg(rows, [{ id: 'c', label: 'C', width: 0 }]), RangeError)
  assert.throws(() => renderTreeGridSvg(rows, columns, { rowHeight: 0 }), RangeError)
  assert.throws(() => renderTreeGridSvg(rows, columns, { highlightColor: 'url(#x)' }), RangeError)
  assert.throws(() => renderTreeGridSvg(rows, columns, { sort: [{ ruleId: 'price', direction: 'up' }] }), RangeError)
  const empty = renderTreeGridSvg([], columns)
  assertWellFormed(empty)
  assert.ok(svgTexts(empty).includes('No rows to display'))
})

test('renderTreeGridSvg lays out a deep chain without recursion', () => {
  const chain = Array.from({ length: 12_000 }, (_, i) => ({ id: 'n' + i, label: 'N' + i, ...i ? { parentId: 'n' + (i - 1) } : {} }))
  const svg = renderTreeGridSvg(chain, [], { rowRange: { start: 11_990, end: 12_000 }, indent: 0 })
  assert.deepEqual(rowOrder(svg), Array.from({ length: 10 }, (_, i) => 'N' + (11_990 + i)))
})
