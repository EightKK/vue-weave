import test from 'node:test'
import assert from 'node:assert/strict'
import {
  aggregateTimeBuckets, createTimeBucketColumns, createTreeGridIndex, resolveTreeGridCell, treeGridCellContentFromTimeBucket,
  treeGridCellsFromTimeBuckets,
} from '@eightkk/vue-weave/core'

const columns = createTimeBucketColumns([{ start: 0, end: 10 }, { start: 10, end: 20 }, { start: 20, end: 30 }])
const rows = [{ id: 'sum', label: 'Sum' }, { id: 'last', label: 'Last' }]

test('time bucket cells: loaded values, known none and load states reach TreeGrid without turning into 0', () => {
  const cells = aggregateTimeBuckets([{ rowId: 'sum', time: 1, value: 5 }, { rowId: 'last', time: 2, value: 7 }], columns, {
    rowIds: ['sum', 'last'], rules: { sum: 'sum', last: 'last' }, loaded: [{ start: 0, end: 20 }],
  })
  const grid = treeGridCellsFromTimeBuckets(cells)
  const index = createTreeGridIndex({ rows, columns, cells: grid })
  const state = (rowId, columnId) => resolveTreeGridCell(index, rowId, columnId)
  assert.deepEqual(grid.find(cell => cell.rowId === 'sum' && cell.columnId === 'bucket:0'), { rowId: 'sum', columnId: 'bucket:0', value: 5 })
  assert.deepEqual(grid.find(cell => cell.rowId === 'sum' && cell.columnId === 'bucket:10'), { rowId: 'sum', columnId: 'bucket:10', value: 0 })
  assert.deepEqual(grid.find(cell => cell.rowId === 'last' && cell.columnId === 'bucket:10'), { rowId: 'last', columnId: 'bucket:10', status: 'none' })
  assert.deepEqual(grid.find(cell => cell.rowId === 'sum' && cell.columnId === 'bucket:20'), { rowId: 'sum', columnId: 'bucket:20', status: 'unloaded' })
  assert.ok(state('sum', 'bucket:20'))
})

test('time bucket cells: extra content is added to values only, inputs are not changed, bad input throws', () => {
  const cell = Object.freeze({ rowId: 'r', columnId: 'c', value: 3, status: 'loaded', count: 1 })
  assert.deepEqual(treeGridCellContentFromTimeBucket(cell, { tone: 'danger', editable: true }), { tone: 'danger', editable: true, value: 3 })
  assert.deepEqual(treeGridCellContentFromTimeBucket({ ...cell, value: null, status: 'loading' }, { tone: 'danger' }), { status: 'loading' })
  assert.throws(() => treeGridCellContentFromTimeBucket(null), TypeError)
  assert.throws(() => treeGridCellContentFromTimeBucket({ ...cell, status: 'weird' }), /Unknown time bucket cell status: weird/)
  assert.throws(() => treeGridCellsFromTimeBuckets('x'), TypeError)
})
