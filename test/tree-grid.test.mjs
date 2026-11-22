import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  applyTreeGridEdits, buildTreeGridClear, buildTreeGridFill, buildTreeGridPaste, createTreeGridIndex, deleteTreeGridRows,
  findTreeGridLine, flattenTreeGrid, insertTreeGridRow, isTreeGridCellEditable, matchTreeGridEntities, moveTimelineRow,
  resolveTreeGridCell, treeGridCellValue, treeGridColumnAt, treeGridColumnOffsets, treeGridColumnWindow, treeGridDropAt,
  treeGridKeyAction, treeGridPositionAt, treeGridRangeText, treeGridRowCreate, treeGridRowMoveForKey, treeGridRowWindow,
} from '@eightkk/vue-weave/core'

const rows = [
  { id: 'a', label: 'Assembly A', entities: [{ kind: 'item', id: 'A' }] },
  { id: 'a1', parentId: 'a', label: 'Bolt', entities: [{ kind: 'item', id: 'BOLT' }], data: { qty: 4 } },
  { id: 'a2', parentId: 'a', label: 'Plate', entities: [{ kind: 'item', id: 'PLATE' }], data: { qty: 1 } },
  { id: 'b', label: 'Assembly B', childStatus: 'unloaded' },
  { id: 'c', label: 'Assembly C', entities: [{ kind: 'item', id: 'C' }] },
  { id: 'c1', parentId: 'c', label: 'Bolt (C)', entities: [{ kind: 'item', id: 'BOLT' }], data: { qty: 8 } },
]
const columns = [
  {
    id: 'qty', label: 'Qty', width: 80, value: row => row.data?.qty, editor: { kind: 'number', min: 0, integer: true },
    update: (row, value) => ({ ...row, data: { ...row.data, qty: value } }),
  },
  { id: 'color', label: 'Color', width: 100, editor: { kind: 'select', choices: [{ value: 'red', label: 'Red' }, { value: 'blue', label: 'Blue' }] } },
  { id: 'stock', label: 'Stock', width: 90, editor: { kind: 'number' }, missingCell: 'unknown' },
  { id: 'ok', label: 'OK', width: 60, editor: { kind: 'checkbox' }, editable: row => row.id !== 'c1' },
]
const cells = [
  { rowId: 'a1', columnId: 'color', value: 'red' },
  { rowId: 'a1', columnId: 'stock', value: 0 },
  { rowId: 'a2', columnId: 'stock', status: 'not-applicable' },
  { rowId: 'c1', columnId: 'stock', status: 'loading', entities: [{ kind: 'stock', id: 'c1' }] },
  { rowId: 'a2', columnId: 'color', value: 'blue', editable: false },
]
const index = createTreeGridIndex({ rows, columns, cells })

test('flattening follows the expanded rows and adds status lines for children still to load', () => {
  const collapsed = flattenTreeGrid(index, [])
  assert.deepEqual(collapsed.lines.map(line => line.row.id), ['a', 'b', 'c'])
  assert.deepEqual(collapsed.lines.map(line => [line.expandable, line.posinset, line.setsize, line.level]), [[true, 1, 3, 1], [true, 2, 3, 1], [true, 3, 3, 1]])
  const open = flattenTreeGrid(index, new Set(['a', 'b', 'c', 'unknown-id', 'a1']))
  assert.deepEqual(open.lines.map(line => `${line.kind}:${line.row.id}`), ['row:a', 'row:a1', 'row:a2', 'row:b', 'status:b', 'row:c', 'row:c1'])
  const status = open.lines[4]
  assert.equal(status.status, 'unloaded')
  assert.equal(status.parent, 3)
  assert.equal(status.level, 2)
  assert.equal(open.lines[1].parent, 0)
  assert.equal(open.lines[1].expandable, false)
  assert.equal(open.statusLine.get('b'), 4)
  // Loading children after some arrived: the status line follows them.
  const paged = createTreeGridIndex({ rows: [...rows, { id: 'b1', parentId: 'b', label: 'B part' }].map(row => row.id === 'b' ? { ...row, childStatus: 'loading' } : row), columns })
  const pagedLines = flattenTreeGrid(paged, ['b']).lines
  assert.deepEqual(pagedLines.map(line => `${line.kind}:${line.row.id}`), ['row:a', 'row:b', 'row:b1', 'status:b', 'row:c'])
  assert.deepEqual([pagedLines[2].setsize, pagedLines[3].posinset], [2, 2])
  // Empty-loaded rows are leaves.
  const empty = createTreeGridIndex({ rows: [{ id: 'x', label: 'X', childStatus: 'loaded-empty' }], columns: [] })
  assert.equal(flattenTreeGrid(empty, ['x']).lines[0].expandable, false)
})

test('finding lines falls back to the nearest displayed ancestor', () => {
  const flat = flattenTreeGrid(index, ['b'])
  assert.deepEqual(findTreeGridLine(index, flat, { rowId: 'a1' }), { line: 0, exact: false })
  assert.deepEqual(findTreeGridLine(index, flat, { rowId: 'b', status: true }), { line: 2, exact: true })
  assert.deepEqual(findTreeGridLine(index, flattenTreeGrid(index, []), { rowId: 'b', status: true }), { line: 1, exact: false })
  assert.equal(findTreeGridLine(index, flat, { rowId: 'nope' }), undefined)
  assert.deepEqual(treeGridPositionAt(index, flat, { line: 2, column: 2 }), { rowId: 'b', columnId: 'color', status: true })
})

test('validation reports duplicates, unknown references, cycles and bad values', () => {
  assert.throws(() => createTreeGridIndex({ rows: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }], columns }), /Duplicate row ID: a \(tree grid rows\)/)
  assert.throws(() => createTreeGridIndex({ rows: [{ id: 'a', parentId: 'zz', label: 'A' }], columns }), /Unknown parent for row: a/)
  assert.throws(() => createTreeGridIndex({ rows: [{ id: 'a', parentId: 'b', label: 'A' }, { id: 'b', parentId: 'a', label: 'B' }], columns }), /cycle/)
  assert.throws(() => createTreeGridIndex({ rows, columns: [...columns, { id: 'qty', label: 'Q', width: 10 }] }), /Duplicate column ID: qty/)
  assert.throws(() => createTreeGridIndex({ rows, columns: [{ id: 'w', label: 'W', width: 0 }] }), RangeError)
  assert.throws(() => createTreeGridIndex({ rows, columns, cells: [{ rowId: 'zz', columnId: 'color', value: 1 }] }), /Unknown row in tree grid cell: zz/)
  assert.throws(() => createTreeGridIndex({ rows, columns, cells: [{ rowId: 'a', columnId: 'zz', value: 1 }] }), /Unknown column in tree grid cell: zz/)
  assert.throws(() => createTreeGridIndex({ rows, columns, cells: [...cells, { rowId: 'a1', columnId: 'color', value: 'x' }] }), /Duplicate tree grid cell: a1 \/ color/)
  assert.throws(() => createTreeGridIndex({ rows, columns, cells: [{ rowId: 'a1', columnId: 'qty', value: 1 }] }), /field column/)
  assert.throws(() => createTreeGridIndex({ rows, columns, cells: [{ rowId: 'a1', columnId: 'color' }] }), /needs a value or a status/)
  assert.throws(() => createTreeGridIndex({ rows, columns, cells: [{ rowId: 'a1', columnId: 'color', value: Number.NaN }] }), RangeError)
  assert.throws(() => createTreeGridIndex({ rows, columns, cells: [{ rowId: 'a1', columnId: 'color', value: {} }] }), TypeError)
  assert.throws(() => createTreeGridIndex({ rows, columns, cells: [{ rowId: 'a1', columnId: 'color', status: 'later' }] }), RangeError)
  assert.throws(() => createTreeGridIndex({ rows: [{ id: 'x', label: 'X', childStatus: 'soon' }], columns }), RangeError)
  assert.throws(() => createTreeGridIndex({ rows, columns, missingCell: 'blank' }), RangeError)
  assert.throws(() => createTreeGridIndex({ rows: [{ id: 'x', label: 'X', entities: [{ kind: '', id: 'y' }] }], columns }), /Invalid entity kind ID/)
})

test('a 12,000-deep chain indexes and flattens without recursion', () => {
  const chain = Array.from({ length: 12_000 }, (_, i) => ({ id: 'n' + i, label: 'N' + i, ...i ? { parentId: 'n' + (i - 1) } : {} }))
  const deep = createTreeGridIndex({ rows: chain, columns: [] })
  const flat = flattenTreeGrid(deep, chain.map(row => row.id))
  assert.equal(flat.lines.length, 12_000)
  assert.equal(flat.lines.at(-1).level, 12_000)
  assert.deepEqual(findTreeGridLine(deep, flattenTreeGrid(deep, ['n0']), { rowId: 'n11999' }), { line: 1, exact: false })
  const cycle = chain.map(row => row.id === 'n0' ? { ...row, parentId: 'n11999' } : row)
  assert.throws(() => createTreeGridIndex({ rows: cycle, columns: [] }), /cycle/)
})

test('cells resolve values, statuses and the missing-cell rule', () => {
  assert.deepEqual(resolveTreeGridCell(index, 'a1', 'qty'), { state: 'value', value: 4, entities: [], source: 'column' })
  assert.equal(resolveTreeGridCell(index, 'a1', 'stock').value, 0)
  assert.equal(resolveTreeGridCell(index, 'a1', 'stock').state, 'value')
  assert.equal(resolveTreeGridCell(index, 'a', 'qty').state, 'empty')
  assert.equal(resolveTreeGridCell(index, 'a', 'stock').state, 'unknown')
  assert.equal(resolveTreeGridCell(index, 'a', 'stock').source, 'missing')
  assert.equal(resolveTreeGridCell(index, 'a2', 'stock').state, 'not-applicable')
  assert.equal(resolveTreeGridCell(index, 'c1', 'stock').state, 'loading')
  assert.equal(resolveTreeGridCell(createTreeGridIndex({ rows, columns, missingCell: 'none' }), 'a', 'color').state, 'none')
  assert.equal(treeGridCellValue(index, 'a2', 'stock'), null)
  assert.throws(() => resolveTreeGridCell(index, 'a', 'zz'), /Unknown column/)
  assert.equal(isTreeGridCellEditable(index, 'a1', 'qty'), true)
  assert.equal(isTreeGridCellEditable(index, 'a2', 'color'), false)
  assert.equal(isTreeGridCellEditable(index, 'c1', 'ok'), false)
})

test('windows and column lookup use cumulative widths', () => {
  const offsets = treeGridColumnOffsets(columns)
  assert.deepEqual(offsets, [0, 80, 180, 270, 330])
  assert.equal(treeGridColumnAt(offsets, 0), 0)
  assert.equal(treeGridColumnAt(offsets, 179), 1)
  assert.equal(treeGridColumnAt(offsets, 180), 2)
  assert.equal(treeGridColumnAt(offsets, 9999), 3)
  assert.deepEqual(treeGridColumnWindow(offsets, { scrollStart: 85, viewport: 100 }), { start: 1, end: 3 })
  assert.deepEqual(treeGridColumnWindow(offsets, { scrollStart: 85, viewport: 100, overscan: 1 }), { start: 0, end: 4 })
  assert.deepEqual(treeGridRowWindow({ scrollTop: 320, viewport: 160, rowHeight: 32, count: 1000, overscan: 2 }), { start: 8, end: 17 })
  assert.deepEqual(treeGridRowWindow({ scrollTop: 0, viewport: 160, rowHeight: 32, count: 0 }), { start: 0, end: 0 })
  assert.throws(() => treeGridRowWindow({ scrollTop: 0, viewport: 10, rowHeight: 0, count: 3 }), RangeError)
})

test('treegrid keys move focus, expand, collapse and go to the parent', () => {
  const flat = flattenTreeGrid(index, ['a'])
  const context = { lines: flat.lines, columnCount: 5, pageSize: 2 }
  assert.deepEqual(treeGridKeyAction({ key: 'ArrowDown' }, { line: 0, column: 0 }, context), { type: 'move', to: { line: 1, column: 0 } })
  assert.deepEqual(treeGridKeyAction({ key: 'ArrowLeft' }, { line: 0, column: 0 }, context), { type: 'collapse', line: 0 })
  assert.deepEqual(treeGridKeyAction({ key: 'ArrowLeft' }, { line: 2, column: 0 }, context), { type: 'move', to: { line: 0, column: 0 } })
  assert.deepEqual(treeGridKeyAction({ key: 'ArrowRight' }, { line: 3, column: 0 }, context), { type: 'expand', line: 3 })
  assert.deepEqual(treeGridKeyAction({ key: 'ArrowRight' }, { line: 1, column: 0 }, context), { type: 'move', to: { line: 1, column: 1 } })
  assert.deepEqual(treeGridKeyAction({ key: 'ArrowLeft' }, { line: 3, column: 0 }, { ...context, rtl: true }), { type: 'expand', line: 3 })
  assert.deepEqual(treeGridKeyAction({ key: 'End', ctrlKey: true }, { line: 0, column: 0 }, context), { type: 'move', to: { line: 4, column: 4 } })
  assert.deepEqual(treeGridKeyAction({ key: 'Home' }, { line: 2, column: 3 }, context), { type: 'move', to: { line: 2, column: 0 } })
  assert.deepEqual(treeGridKeyAction({ key: 'PageDown' }, { line: 0, column: 2 }, context), { type: 'move', to: { line: 2, column: 2 } })
  assert.deepEqual(treeGridKeyAction({ key: 'PageDown' }, { line: 4, column: 2 }, context), { type: 'move', to: { line: 4, column: 2 } })
  assert.deepEqual(treeGridKeyAction({ key: 'Enter' }, { line: 1, column: 2 }, context), { type: 'activate', at: { line: 1, column: 2 } })
  assert.equal(treeGridKeyAction({ key: 'ArrowDown', shiftKey: true }, { line: 0, column: 1 }, context), undefined)
  assert.equal(treeGridKeyAction({ key: 'x' }, { line: 0, column: 1 }, context), undefined)
})

test('entity matches mark every usage row and cell of an entity', () => {
  const matches = matchTreeGridEntities({ rows, columns, cells }, [{ kind: 'item', id: 'BOLT' }, { kind: 'stock', id: 'c1' }])
  assert.deepEqual(matches.rowIds, ['a1', 'c1'])
  assert.deepEqual(matches.cells, [{ rowId: 'c1', columnId: 'stock' }])
  assert.deepEqual(matchTreeGridEntities(index, []), { rowIds: [], cells: [] })
})

test('range text, paste, clear and fill build one batch each', () => {
  const flat = flattenTreeGrid(index, ['a', 'c'])
  // Lines: a, a1, a2, b, c, c1.
  const range = { anchor: { line: 1, column: 1 }, focus: { line: 2, column: 3 } }
  assert.equal(treeGridRangeText(index, flat, range), '4\tRed\t0\r\n1\tBlue\t')
  const paste = buildTreeGridPaste(index, flat, { anchor: { line: 1, column: 1 }, focus: { line: 1, column: 1 } }, '5\tBlue\n2\tRed\n')
  assert.equal(paste.ok, true)
  assert.deepEqual(paste.edits, [
    { rowId: 'a1', columnId: 'qty', before: 4, after: 5, source: 'keyboard' },
    { rowId: 'a1', columnId: 'color', before: 'red', after: 'blue', source: 'keyboard' },
    { rowId: 'a2', columnId: 'qty', before: 1, after: 2, source: 'keyboard' },
  ])
  // A single value fills the range; parse errors and oversized pastes fail the batch.
  const one = buildTreeGridPaste(index, flat, { anchor: { line: 1, column: 1 }, focus: { line: 5, column: 1 } }, '7')
  assert.deepEqual(one.edits.map(edit => [edit.rowId, edit.after]), [['a1', 7], ['a2', 7], ['b', 7], ['c', 7], ['c1', 7]])
  const invalid = buildTreeGridPaste(index, flat, { anchor: { line: 1, column: 1 }, focus: { line: 1, column: 1 } }, 'many')
  assert.equal(invalid.ok, false)
  assert.equal(invalid.reason, 'invalid')
  assert.deepEqual(invalid.cell, { rowId: 'a1', columnId: 'qty' })
  assert.equal(buildTreeGridPaste(index, flat, { anchor: { line: 4, column: 3 }, focus: { line: 4, column: 3 } }, '1\t2\t3').reason, 'too-large')
  assert.equal(buildTreeGridPaste(index, flat, { anchor: { line: 4, column: 1 }, focus: { line: 4, column: 1 } }, '1\n2\n3\n4').reason, 'too-large')
  assert.equal(buildTreeGridPaste(index, flat, range, '1\t2\n3\t4', { maxCells: 3 }).reason, 'too-large')
  // A tall paste is rejected as too large instead of overflowing the call stack.
  assert.equal(buildTreeGridPaste(index, flat, range, '1\n'.repeat(300_000)).reason, 'too-large')
  // A range that starts on the row headers pastes from the first data column.
  const fromHeader = buildTreeGridPaste(index, flat, { anchor: { line: 1, column: 0 }, focus: { line: 1, column: 0 } }, '9')
  assert.deepEqual(fromHeader.edits, [{ rowId: 'a1', columnId: 'qty', before: 4, after: 9, source: 'keyboard' }])
  const clear = buildTreeGridClear(index, flat, range)
  assert.deepEqual(clear.edits.map(edit => [edit.rowId, edit.columnId, edit.after]), [['a1', 'qty', null], ['a1', 'color', null], ['a1', 'stock', null], ['a2', 'qty', null]])
  const filled = buildTreeGridFill(index, flat, { anchor: { line: 1, column: 1 }, focus: { line: 5, column: 1 } })
  assert.deepEqual(filled.edits.map(edit => [edit.rowId, edit.after]), [['a2', 4], ['b', 4], ['c', 4], ['c1', 4]])
})

test('applying edits returns new rows and cells and keeps the rest', () => {
  const result = applyTreeGridEdits({ rows, columns, cells }, [
    { rowId: 'a1', columnId: 'qty', before: 4, after: 6, source: 'keyboard' },
    { rowId: 'a1', columnId: 'color', before: 'red', after: null, source: 'keyboard' },
    { rowId: 'a2', columnId: 'stock', before: null, after: 3, source: 'keyboard' },
    { rowId: 'c', columnId: 'color', before: null, after: 'blue', source: 'pointer' },
  ])
  assert.equal(result.rows[1].data.qty, 6)
  assert.equal(result.rows[0], rows[0])
  assert.equal(rows[1].data.qty, 4)
  assert.deepEqual(result.cells.find(cell => cell.rowId === 'a2' && cell.columnId === 'stock'), { rowId: 'a2', columnId: 'stock', value: 3 })
  assert.equal(result.cells.some(cell => cell.rowId === 'a1' && cell.columnId === 'color'), false)
  assert.deepEqual(result.cells.at(-1), { rowId: 'c', columnId: 'color', value: 'blue' })
  assert.equal(cells.length, 5)
  createTreeGridIndex({ rows: result.rows, columns, cells: result.cells })
  assert.throws(() => applyTreeGridEdits({ rows, columns }, [{ rowId: 'zz', columnId: 'qty', before: null, after: 1, source: 'keyboard' }]), /Unknown row/)
  assert.throws(() => applyTreeGridEdits({ rows, columns: [{ id: 'f', label: 'F', width: 9, value: () => 1 }] }, [{ rowId: 'a', columnId: 'f', before: 1, after: 2, source: 'keyboard' }]), /no update/)
})

test('row create, delete and move proposals apply immutably', () => {
  const after = treeGridRowCreate(rows, 'a1', 'after')
  assert.deepEqual(after, { parentId: 'a', index: 1, referenceId: 'a1', placement: 'after', source: 'keyboard' })
  assert.deepEqual(treeGridRowCreate(rows, 'a', 'child', 'pointer'), { parentId: 'a', index: 2, referenceId: 'a', placement: 'child', source: 'pointer' })
  assert.deepEqual(treeGridRowCreate(rows, 'b', 'before'), { index: 1, referenceId: 'b', placement: 'before', source: 'keyboard' })
  const inserted = insertTreeGridRow(rows, after, { id: 'new', label: 'Washer' })
  assert.deepEqual(inserted.map(row => row.id), ['a', 'a1', 'new', 'a2', 'b', 'c', 'c1'])
  assert.equal(inserted[2].parentId, 'a')
  assert.throws(() => insertTreeGridRow(rows, after, { id: 'a1', label: 'Dup' }), /Duplicate row ID: a1/)
  assert.throws(() => insertTreeGridRow(rows, { parentId: 'a', index: 5 }, { id: 'z', label: 'Z' }), RangeError)

  const withCells = deleteTreeGridRows({ rows, cells }, { ids: ['a'], includeDescendants: true })
  assert.deepEqual(withCells.rows.map(row => row.id), ['b', 'c', 'c1'])
  assert.deepEqual(withCells.cells.map(cell => cell.rowId), ['c1'])
  const lifted = deleteTreeGridRows({ rows, cells }, { ids: ['a'], includeDescendants: false })
  assert.deepEqual(lifted.rows.map(row => [row.id, row.parentId]), [['a1', undefined], ['a2', undefined], ['b', undefined], ['c', undefined], ['c1', 'c']])
  assert.throws(() => deleteTreeGridRows({ rows }, { ids: ['zz'], includeDescendants: true }), /Unknown row/)

  // Keys as in GanttChart: Alt+arrows reorder, Alt+Shift indents and outdents; apply with moveTimelineRow.
  assert.deepEqual(treeGridRowMoveForKey({ key: 'ArrowDown', altKey: true }, rows, 'a1'), { parentId: 'a', index: 1 })
  assert.equal(treeGridRowMoveForKey({ key: 'ArrowUp', altKey: true }, rows, 'a1'), undefined)
  assert.deepEqual(treeGridRowMoveForKey({ key: 'ArrowRight', altKey: true, shiftKey: true }, rows, 'b'), { parentId: 'a', index: 2 })
  assert.deepEqual(treeGridRowMoveForKey({ key: 'ArrowLeft', altKey: true, shiftKey: true }, rows, 'a2'), { index: 1 })
  assert.deepEqual(treeGridRowMoveForKey({ key: 'ArrowLeft', altKey: true, shiftKey: true }, rows, 'b', true), { parentId: 'a', index: 2 })
  assert.equal(treeGridRowMoveForKey({ key: 'ArrowDown' }, rows, 'a1'), 'ignore')
  const moved = moveTimelineRow(rows, 'b', { parentId: 'a', index: 2 })
  assert.deepEqual(moved.map(row => row.id), ['a', 'a1', 'a2', 'b', 'c', 'c1'])
  assert.equal(moved[3].parentId, 'a')
  assert.throws(() => moveTimelineRow(rows, 'a', { parentId: 'a1', index: 0 }), /own subtree/)
})

test('drop places: before, after and inside, never into the dragged subtree', () => {
  const flat = flattenTreeGrid(index, ['a', 'c'])
  // Lines: a, a1, a2, b, c, c1.
  assert.deepEqual(treeGridDropAt(index, flat, 'c1', 1, 0.1), { line: 1, placement: 'before', target: { parentId: 'a', index: 0 } })
  assert.deepEqual(treeGridDropAt(index, flat, 'c1', 2, 0.9), { line: 2, placement: 'after', target: { parentId: 'a', index: 2 } })
  assert.deepEqual(treeGridDropAt(index, flat, 'c1', 3, 0.5), { line: 3, placement: 'inside', target: { parentId: 'b', index: 0 } })
  // The lower quarter of an expanded row is its first child.
  assert.deepEqual(treeGridDropAt(index, flat, 'c1', 0, 0.9), { line: 0, placement: 'after', target: { parentId: 'a', index: 0 } })
  assert.equal(treeGridDropAt(index, flat, 'a', 1, 0.5), undefined)
  assert.equal(treeGridDropAt(index, flat, 'a', 0, 0.5), undefined)
  // A drop that leaves the row where it is proposes nothing.
  assert.equal(treeGridDropAt(index, flat, 'a2', 1, 0.9), undefined)
})
