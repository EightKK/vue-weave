import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  aggregateTimeBuckets, calendarBands, createTimeBucketColumns, createWindowedDataState, resolveWindowedRequest, setWindowedView,
  timeBucketIndex, timeBucketIndexRange, windowedCoverage,
} from '@eightkk/vue-weave/core'
import { day, hour, utc } from './helpers/time.mjs'

const days = (count, origin = 0) => Array.from({ length: count }, (_, index) => ({ start: origin + index * day, end: origin + (index + 1) * day }))
const valuesOf = (cells, rowId) => cells.filter(cell => cell.rowId === rowId).map(cell => cell.value)
const statusesOf = (cells, rowId) => cells.filter(cell => cell.rowId === rowId).map(cell => cell.status)

test('createTimeBucketColumns gives deterministic IDs, labels and widths', () => {
  const columns = createTimeBucketColumns(days(2))
  assert.deepEqual(columns, [
    { id: 'bucket:0', label: '0', width: 80, start: 0, end: day },
    { id: `bucket:${day}`, label: String(day), width: 80, start: day, end: 2 * day },
  ])
  // A window that scrolls keeps the IDs of the periods it still shows.
  assert.equal(createTimeBucketColumns(days(2, day))[0].id, columns[1].id)
  const custom = createTimeBucketColumns([{ id: 'mon', label: 'Mon', start: 0, end: 8 }, { start: 16, end: 24 }], {
    idPrefix: 'shift-', width: (period, index) => 50 + index,
  })
  assert.deepEqual(custom.map(column => [column.id, column.label, column.width]), [['mon', 'Mon', 50], ['shift-16', '16', 51]])
  const labelled = createTimeBucketColumns(days(1), { id: (_, index) => 'd' + index, label: period => `from ${period.start}`, width: 120 })
  assert.deepEqual(labelled[0], { id: 'd0', label: 'from 0', width: 120, start: 0, end: day })
  assert.deepEqual(createTimeBucketColumns([]), [])
})

test('createTimeBucketColumns validates periods, IDs and widths and allows gaps', () => {
  assert.doesNotThrow(() => createTimeBucketColumns([{ start: 0, end: 1 }, { start: 1, end: 2 }, { start: 5, end: 6 }]))
  assert.throws(() => createTimeBucketColumns([{ start: 0, end: Infinity }]), RangeError)
  assert.throws(() => createTimeBucketColumns([{ start: Number.NaN, end: 1 }]), RangeError)
  assert.throws(() => createTimeBucketColumns([{ start: 1, end: 1 }]), /start < end/)
  assert.throws(() => createTimeBucketColumns([{ start: 2, end: 1 }]), RangeError)
  assert.throws(() => createTimeBucketColumns([{ start: 0, end: 2 }, { start: 1, end: 3 }]), /overlaps or precedes/)
  assert.throws(() => createTimeBucketColumns([{ start: 5, end: 6 }, { start: 0, end: 1 }]), RangeError)
  assert.throws(() => createTimeBucketColumns([{ id: 'a', start: 0, end: 1 }, { id: 'a', start: 1, end: 2 }]),
    error => error.constructor === Error && error.message === 'Duplicate time bucket ID: a')
  assert.throws(() => createTimeBucketColumns([{ start: 0, end: 1 }], { id: () => '' }), /Invalid time bucket ID: ""/)
  assert.throws(() => createTimeBucketColumns([{ start: 0, end: 1 }], { width: 0 }), RangeError)
  assert.throws(() => createTimeBucketColumns([{ start: 0, end: 1 }], { width: () => Number.NaN }), RangeError)
  assert.throws(() => createTimeBucketColumns('x'), TypeError)
  assert.throws(() => createTimeBucketColumns([null]), TypeError)
})

test('calendar day periods in an IANA zone keep their DST length and labels', () => {
  // Europe/Berlin moves to summer time on 2026-03-29 (a 23-hour day) and back on 2026-10-25 (a 25-hour day).
  const range = { start: utc(2026, 3, 27, 23), end: utc(2026, 3, 30, 22) }
  const columns = createTimeBucketColumns(calendarBands(range, 'day', { timeZone: 'Europe/Berlin' }))
  assert.deepEqual(columns.map(column => column.label), ['2026-03-28', '2026-03-29', '2026-03-30'])
  assert.deepEqual(columns.map(column => (column.end - column.start) / hour), [24, 23, 24])
  const autumn = createTimeBucketColumns(calendarBands({ start: utc(2026, 10, 24, 22), end: utc(2026, 10, 25, 23) }, 'day', { timeZone: 'Europe/Berlin' }))
  assert.deepEqual(autumn.map(column => (column.end - column.start) / hour), [25])
  // A reading at 23:30 local time on the short day lands in that day, and local midnight starts the next one.
  const cells = aggregateTimeBuckets([
    { rowId: 'r', time: utc(2026, 3, 29, 21, 30), value: 1 },
    { rowId: 'r', time: utc(2026, 3, 29, 22), value: 10 },
  ], columns)
  assert.deepEqual(valuesOf(cells, 'r'), [0, 1, 10])
})

test('timeBucketIndex and timeBucketIndexRange respect half-open boundaries and gaps', () => {
  const buckets = [{ start: 0, end: 10 }, { start: 10, end: 20 }, { start: 30, end: 40 }]
  assert.equal(timeBucketIndex(buckets, 0), 0)
  assert.equal(timeBucketIndex(buckets, 9.5), 0)
  assert.equal(timeBucketIndex(buckets, 10), 1)
  assert.equal(timeBucketIndex(buckets, 20), -1)
  assert.equal(timeBucketIndex(buckets, 25), -1)
  assert.equal(timeBucketIndex(buckets, 39), 2)
  assert.equal(timeBucketIndex(buckets, 40), -1)
  assert.equal(timeBucketIndex(buckets, -1), -1)
  assert.equal(timeBucketIndex([], 1), -1)
  assert.throws(() => timeBucketIndex(buckets, Number.NaN), RangeError)
  assert.deepEqual(timeBucketIndexRange(buckets, { start: 0, end: 10 }), { start: 0, end: 1 })
  assert.deepEqual(timeBucketIndexRange(buckets, { start: 5, end: 10.5 }), { start: 0, end: 2 })
  assert.deepEqual(timeBucketIndexRange(buckets, { start: 10, end: 31 }), { start: 1, end: 3 })
  assert.deepEqual(timeBucketIndexRange(buckets, { start: 20, end: 30 }), { start: 2, end: 2 })
  assert.deepEqual(timeBucketIndexRange(buckets, { start: -5, end: 100 }), { start: 0, end: 3 })
  assert.deepEqual(timeBucketIndexRange(buckets, { start: 15, end: 15 }), { start: 1, end: 1 })
  assert.deepEqual(timeBucketIndexRange(buckets, { start: 50, end: 60 }), { start: 3, end: 3 })
  assert.throws(() => timeBucketIndexRange(buckets, { start: 2, end: 1 }), RangeError)
  assert.throws(() => timeBucketIndexRange(buckets, { start: 0, end: Infinity }), RangeError)
  // A GanttChart visible window (with row IDs) works as a range.
  const columns = createTimeBucketColumns(days(30))
  const window = { start: 3.5 * day, end: 7 * day, rowIds: ['a'], expandedIds: [] }
  const { start, end } = timeBucketIndexRange(columns, window)
  assert.deepEqual(columns.slice(start, end).map(column => column.start / day), [3, 4, 5, 6])
})

test('built-in rules aggregate values per row and treat empty loaded buckets by rule', () => {
  const buckets = createTimeBucketColumns(days(3))
  const items = [
    { rowId: 'qty', time: 0, value: 2 }, { rowId: 'qty', time: day - 1, value: 3 }, { rowId: 'qty', time: 2 * day, value: 4 },
    { rowId: 'stock', time: 5, value: 9 }, { rowId: 'stock', time: 1, value: 7 }, { rowId: 'stock', time: 2 * day, value: 1 },
  ]
  const run = rule => aggregateTimeBuckets(items, buckets, { rule })
  assert.deepEqual(valuesOf(run('sum'), 'qty'), [5, 0, 4])
  assert.deepEqual(valuesOf(run('count'), 'qty'), [2, 0, 1])
  assert.deepEqual(valuesOf(run('min'), 'stock'), [7, null, 1])
  assert.deepEqual(valuesOf(run('max'), 'stock'), [9, null, 1])
  // first and last follow time, not input order.
  assert.deepEqual(valuesOf(run('first'), 'stock'), [7, null, 1])
  assert.deepEqual(valuesOf(run('last'), 'stock'), [9, null, 1])
  const sums = run('sum')
  assert.deepEqual(statusesOf(sums, 'qty'), ['loaded', 'loaded-empty', 'loaded'])
  assert.deepEqual(sums[0], { rowId: 'qty', columnId: 'bucket:0', value: 5, status: 'loaded', count: 2 })
  // Rows in first-appearance order, buckets in time order.
  assert.deepEqual(sums.map(cell => cell.rowId), ['qty', 'qty', 'qty', 'stock', 'stock', 'stock'])
  // Mixed rules by row, as a Map or a plain object.
  const mixed = aggregateTimeBuckets(items, buckets, { rules: { stock: 'last' } })
  assert.deepEqual(valuesOf(mixed, 'qty'), [5, 0, 4])
  assert.deepEqual(valuesOf(mixed, 'stock'), [9, null, 1])
  const mapped = aggregateTimeBuckets(items, buckets, { rule: 'max', rules: new Map([['qty', 'sum']]) })
  assert.deepEqual(valuesOf(mapped, 'qty'), [5, 0, 4])
  assert.deepEqual(valuesOf(mapped, 'stock'), [9, null, 1])
  // Ties in time keep input order for first and last.
  const ties = aggregateTimeBuckets([{ rowId: 'r', time: 0, value: 1 }, { rowId: 'r', time: 0, value: 2 }], buckets.slice(0, 1), { rule: 'last' })
  assert.equal(ties[0].value, 2)
})

test('custom reducers receive values and items in time order, also for empty buckets', () => {
  const buckets = createTimeBucketColumns(days(2))
  const calls = []
  const median = (values, context) => {
    calls.push({ values: [...values], ids: context.items.map(item => item.id), bucket: context.bucket.id, rowId: context.rowId })
    if (!values.length) return null
    const sorted = [...values].sort((a, b) => a - b)
    return sorted[Math.floor(sorted.length / 2)]
  }
  const cells = aggregateTimeBuckets([
    { id: 'b', rowId: 'r', time: 3, value: 5 }, { id: 'a', rowId: 'r', time: 1, value: 1 }, { id: 'c', rowId: 'r', time: 2, value: 9 },
  ], buckets, { rule: median })
  assert.deepEqual(valuesOf(cells, 'r'), [5, null])
  assert.deepEqual(calls, [
    { values: [1, 9, 5], ids: ['a', 'c', 'b'], bucket: 'bucket:0', rowId: 'r' },
    { values: [], ids: [], bucket: `bucket:${day}`, rowId: 'r' },
  ])
  assert.throws(() => aggregateTimeBuckets([{ rowId: 'r', time: 0, value: 1 }], buckets, { rule: () => Number.NaN }), RangeError)
  assert.throws(() => aggregateTimeBuckets([{ rowId: 'r', time: 0, value: 1 }], buckets, { rule: () => '1' }), RangeError)
})

test('the ratio rule weights numerators and denominators instead of averaging percentages', () => {
  const buckets = createTimeBucketColumns([{ start: 0, end: 2 * day }, { start: 2 * day, end: 3 * day }])
  // Day 1: 9 good of 10 (90 %); day 2: 10 good of 100 (10 %). The two-day yield is 19 / 110, not the mean 50 %.
  const items = [
    { rowId: 'yield', time: 0, value: 9, denominator: 10 },
    { rowId: 'yield', time: day, value: 10, denominator: 100 },
    { rowId: 'yield', time: 2 * day, value: 0, denominator: 0 },
  ]
  const cells = aggregateTimeBuckets(items, buckets, { rule: 'ratio' })
  assert.equal(cells[0].value, 19 / 110)
  assert.equal(cells[0].numerator, 19)
  assert.equal(cells[0].denominator, 110)
  // A zero denominator has no ratio.
  assert.equal(cells[1].value, null)
  assert.equal(cells[1].status, 'loaded')
  const empty = aggregateTimeBuckets([], buckets, { rule: 'ratio', rowIds: ['yield'] })
  assert.deepEqual(empty[0], { rowId: 'yield', columnId: 'bucket:0', value: null, status: 'loaded-empty', count: 0, numerator: 0, denominator: 0 })
  assert.throws(() => aggregateTimeBuckets([{ rowId: 'yield', time: 0, value: 1 }], buckets, { rule: 'ratio' }), /Denominator/)
  // Custom accessors, for example a rate stored as good and total counts.
  const custom = aggregateTimeBuckets([{ line: 'L1', at: 0, good: 3, total: 4 }], buckets, {
    rule: 'ratio', itemRow: item => item.line, itemTime: item => item.at, itemValue: item => item.good, itemDenominator: item => item.total,
  })
  assert.equal(custom[0].value, 0.75)
})

test('precomputed values are taken as-is and duplicates are rejected', () => {
  const buckets = createTimeBucketColumns(days(3))
  const cells = aggregateTimeBuckets([
    { rowId: 'oee', time: 0, value: 0.815 }, { rowId: 'oee', time: 2 * day, value: 0.7 },
  ], buckets, { rule: 'precomputed' })
  assert.deepEqual(valuesOf(cells, 'oee'), [0.815, null, 0.7])
  assert.deepEqual(statusesOf(cells, 'oee'), ['loaded', 'loaded-empty', 'loaded'])
  assert.throws(() => aggregateTimeBuckets([{ rowId: 'oee', time: 0, value: 1 }, { rowId: 'oee', time: 1, value: 2 }], buckets, { rule: 'precomputed' }),
    error => error.constructor === Error && /Duplicate precomputed time bucket value: row oee in bucket bucket:0/.test(error.message))
})

test('interval items are placed by start, overlap or prorated share', () => {
  const buckets = createTimeBucketColumns([{ start: 0, end: 10 }, { start: 10, end: 20 }, { start: 30, end: 40 }])
  const items = [{ rowId: 'r', start: 5, end: 35, value: 30 }, { rowId: 'r', start: 12, end: 12, value: 1 }]
  assert.deepEqual(valuesOf(aggregateTimeBuckets(items, buckets), 'r'), [30, 1, 0])
  assert.deepEqual(valuesOf(aggregateTimeBuckets(items, buckets, { placement: 'overlap' }), 'r'), [30, 31, 30])
  // 5 of 30 units in the first bucket, 10 in the second, 10 in the gap (dropped), 5 in the third. A milestone counts whole.
  assert.deepEqual(valuesOf(aggregateTimeBuckets(items, buckets, { placement: 'prorate' }), 'r'), [5, 11, 5])
  assert.deepEqual(valuesOf(aggregateTimeBuckets(items, buckets, { placement: 'prorate', rule: 'count' }), 'r'), [1, 2, 1])
  // An interval ending on a boundary does not reach the next bucket.
  assert.deepEqual(valuesOf(aggregateTimeBuckets([{ rowId: 'r', start: 0, end: 10, value: 4 }], buckets, { placement: 'overlap' }), 'r'), [4, 0, 0])
  const ratio = aggregateTimeBuckets([{ rowId: 'r', start: 0, end: 20, value: 10, denominator: 20 }], buckets, { placement: 'prorate', rule: 'ratio' })
  assert.deepEqual(ratio.slice(0, 2).map(cell => [cell.numerator, cell.denominator, cell.value]), [[5, 10, 0.5], [5, 10, 0.5]])
  assert.throws(() => aggregateTimeBuckets([{ rowId: 'r', start: 5, end: 1, value: 1 }], buckets), RangeError)
  assert.throws(() => aggregateTimeBuckets(items, buckets, { placement: 'spread' }), RangeError)
})

test('buckets outside the loaded coverage are unloaded, never 0', () => {
  const buckets = createTimeBucketColumns(days(4))
  const items = [{ rowId: 'r', time: 0, value: 1 }, { rowId: 'r', time: 2 * day, value: 5 }]
  // Days 0 and 1 are loaded as two adjoining ranges; day 2 only half; day 3 not at all.
  const cells = aggregateTimeBuckets(items, buckets, { loaded: [{ start: day, end: 2 * day }, { start: 0, end: day }, { start: 2 * day, end: 2.5 * day }] })
  assert.deepEqual(valuesOf(cells, 'r'), [1, 0, null, null])
  assert.deepEqual(statusesOf(cells, 'r'), ['loaded', 'loaded-empty', 'unloaded', 'unloaded'])
  assert.equal(cells[2].count, 1)
  // A function per row and bucket can report loading and failed states too.
  const byFunction = aggregateTimeBuckets(items, buckets, {
    rowIds: ['r', 'other'],
    loaded: (rowId, bucket) => rowId === 'other' ? 'failed' : bucket.start >= 3 * day ? 'loading' : bucket.start === day ? 'loaded-empty' : true,
  })
  assert.deepEqual(statusesOf(byFunction, 'r'), ['loaded', 'loaded-empty', 'loaded', 'loading'])
  assert.deepEqual(statusesOf(byFunction, 'other'), ['failed', 'failed', 'failed', 'failed'])
  assert.deepEqual(valuesOf(byFunction, 'other'), [null, null, null, null])
  assert.throws(() => aggregateTimeBuckets(items, buckets, { loaded: () => 'done' }), RangeError)
  assert.throws(() => aggregateTimeBuckets(items, buckets, { loaded: [{ start: 2, end: 1 }] }), RangeError)
})

test('coverage can come from a windowed data state', () => {
  const state0 = createWindowedDataState({ chunkSize: day, itemRange: item => ({ start: item.time, end: item.time + 1 }) })
  const planned = setWindowedView(state0, { start: 0, end: 2 * day, rowIds: ['r'] })
  const request = planned.start[0]
  const items = [{ id: 'x', rowId: 'r', time: 3, value: 2 }]
  const { state } = resolveWindowedRequest(planned.state, request.requestId, items)
  const buckets = createTimeBucketColumns(days(3))
  const cells = aggregateTimeBuckets([...state.items.values()], buckets, {
    rowIds: ['r'], loaded: (rowId, bucket) => windowedCoverage(state, { start: bucket.start, end: bucket.end, rowIds: [rowId] }).status,
  })
  assert.deepEqual(cells.map(cell => [cell.status, cell.value]), [['loaded', 2], ['loaded-empty', 0], ['unloaded', null]])
})

test('carryForward carries running balances only when opted in and stops at unloaded buckets', () => {
  const buckets = createTimeBucketColumns([{ start: 10, end: 20 }, { start: 20, end: 30 }, { start: 30, end: 40 }, { start: 50, end: 60 }, { start: 60, end: 70 }])
  const items = [
    { rowId: 'stock', time: 5, value: 100 }, // before the first bucket: the opening balance
    { rowId: 'stock', time: 25, value: 80 },
    { rowId: 'stock', time: 45, value: 70 }, // in the gap before the fourth bucket
  ]
  assert.deepEqual(valuesOf(aggregateTimeBuckets(items, buckets, { rule: 'last' }), 'stock'), [null, 80, null, null, null])
  const carried = aggregateTimeBuckets(items, buckets, { rule: 'last', carryForward: true })
  assert.deepEqual(valuesOf(carried, 'stock'), [100, 80, 80, 70, 70])
  assert.deepEqual(carried.map(cell => cell.carried ?? false), [true, false, true, true, true])
  assert.deepEqual(statusesOf(carried, 'stock'), ['loaded-empty', 'loaded', 'loaded-empty', 'loaded-empty', 'loaded-empty'])
  // An unloaded bucket breaks the carry until a new reading arrives.
  const gapped = aggregateTimeBuckets(items.slice(0, 2), buckets, { rule: 'last', carryForward: true, loaded: [{ start: 0, end: 30 }, { start: 50, end: 70 }] })
  assert.deepEqual(valuesOf(gapped, 'stock'), [100, 80, null, null, null])
  // Only `last` rows carry; a predicate picks rows.
  const picked = aggregateTimeBuckets([...items, { rowId: 'other', time: 15, value: 1 }], buckets, {
    rule: 'last', carryForward: rowId => rowId === 'other',
  })
  assert.deepEqual(valuesOf(picked, 'other'), [1, 1, 1, 1, 1])
  assert.deepEqual(valuesOf(picked, 'stock'), [null, 80, null, null, null])
  assert.deepEqual(valuesOf(aggregateTimeBuckets(items, buckets, { carryForward: true }), 'stock'), [0, 80, 0, 0, 0])
})

test('rowIds fixes the rows and their order and validates IDs', () => {
  const buckets = createTimeBucketColumns(days(1))
  const items = [{ rowId: 'a', time: 0, value: 1 }, { rowId: 'b', time: 0, value: 2 }]
  const cells = aggregateTimeBuckets(items, buckets, { rowIds: ['c', 'b'] })
  assert.deepEqual(cells.map(cell => [cell.rowId, cell.value, cell.status]), [['c', 0, 'loaded-empty'], ['b', 2, 'loaded']])
  assert.throws(() => aggregateTimeBuckets(items, buckets, { rowIds: ['a', 'a'] }), /Duplicate time bucket row ID: a/)
  assert.throws(() => aggregateTimeBuckets(items, buckets, { rowIds: [''] }), /Invalid time bucket row ID/)
  assert.throws(() => aggregateTimeBuckets([{ rowId: 3, time: 0, value: 1 }], buckets), error => error.constructor === Error)
})

test('aggregateTimeBuckets validates its inputs', () => {
  const buckets = createTimeBucketColumns(days(2))
  const item = { rowId: 'r', time: 0, value: 1 }
  assert.throws(() => aggregateTimeBuckets('x', buckets), TypeError)
  assert.throws(() => aggregateTimeBuckets([item], [{ id: 'a', start: 0, end: 2 }, { id: 'b', start: 1, end: 3 }]), RangeError)
  assert.throws(() => aggregateTimeBuckets([item], [{ id: 'a', start: 0, end: 1 }, { id: 'a', start: 1, end: 2 }]), /Duplicate time bucket ID: a/)
  assert.throws(() => aggregateTimeBuckets([item], [{ start: 0, end: 1 }]), /Invalid time bucket ID/)
  assert.throws(() => aggregateTimeBuckets([{ ...item, value: Number.NaN }], buckets), RangeError)
  assert.throws(() => aggregateTimeBuckets([{ ...item, value: '1' }], buckets), RangeError)
  assert.throws(() => aggregateTimeBuckets([{ ...item, time: Infinity }], buckets), RangeError)
  assert.throws(() => aggregateTimeBuckets([{ rowId: 'r', value: 1 }], buckets), RangeError)
  assert.throws(() => aggregateTimeBuckets([item], buckets, { rule: 'mean' }), /Unknown time bucket rule: mean/)
  assert.throws(() => aggregateTimeBuckets([item], buckets, { rules: { r: 'avg' } }), /Unknown time bucket rule of row r: avg/)
  assert.throws(() => aggregateTimeBuckets([item], buckets, { maxCells: 1 }), /exceed maxCells/)
  // Items outside every bucket are ignored.
  assert.deepEqual(valuesOf(aggregateTimeBuckets([{ ...item, time: -1 }, { ...item, time: 2 * day }], buckets), 'r'), [0, 0])
})

test('inputs are not modified and outputs are new objects', () => {
  const periods = Object.freeze([Object.freeze({ start: 0, end: day, label: 'Mon' })])
  const columns = createTimeBucketColumns(periods)
  assert.notEqual(columns[0], periods[0])
  const items = Object.freeze([Object.freeze({ rowId: 'r', start: 0, end: day, value: 3 })])
  const loaded = Object.freeze([Object.freeze({ start: 0, end: day })])
  const frozenColumns = Object.freeze(columns.map(column => Object.freeze(column)))
  const cells = aggregateTimeBuckets(items, frozenColumns, { loaded, placement: 'prorate', rule: values => values.length })
  assert.equal(cells[0].value, 1)
  assert.deepEqual(items[0], { rowId: 'r', start: 0, end: day, value: 3 })
  assert.deepEqual(loaded, [{ start: 0, end: day }])
})

test('100k items over a year of daily buckets aggregate in near-linear time', () => {
  const buckets = createTimeBucketColumns(days(365))
  const rows = 50
  const items = []
  for (let index = 0; index < 100_000; index++) {
    items.push({ rowId: 'r' + (index % rows), time: (index * 7919) % (365 * day), value: 1 })
  }
  const started = performance.now()
  const cells = aggregateTimeBuckets(items, buckets)
  const elapsed = performance.now() - started
  assert.equal(cells.length, rows * 365)
  assert.equal(cells.reduce((total, cell) => total + cell.value, 0), 100_000)
  assert.ok(elapsed < 2000, `took ${elapsed} ms`)
  const ratio = aggregateTimeBuckets(items.map(item => ({ ...item, denominator: 2 })), buckets, { rule: 'ratio', placement: 'prorate' })
  assert.ok(ratio.every(cell => cell.value === null || cell.value === 0.5))
})
