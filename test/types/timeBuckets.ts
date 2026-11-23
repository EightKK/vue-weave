// Type-level checks for the time bucket helpers: custom item types flow into accessors and reducers, columns are
// buckets, and visible windows are ranges. Checked by `npm run typecheck`.
import {
  aggregateTimeBuckets, calendarBands, createTimeBucketColumns, timeBucketIndexRange, type TimeBucketCell, type TimeBucketColumn,
  type TimelineVisibleWindow, type WindowedCellStatus,
} from '../../src/core/index'

// calendarBands output is a valid period list; the custom period type reaches the options.
const columns: TimeBucketColumn[] = createTimeBucketColumns(calendarBands({ start: 0, end: 864e5 * 7 }, 'day'), {
  label: band => band.label.slice(5),
})
const shifts = createTimeBucketColumns([{ start: 0, end: 8, shift: 'early' }], { id: period => period.shift })
void shifts

interface Reading { line: string; at: number; good: number; total: number }
declare const readings: Reading[]
const cells: TimeBucketCell[] = aggregateTimeBuckets(readings, columns, {
  rule: 'ratio',
  rules: { scrap: (values, context) => values.length ? Math.max(...values) - context.items[0]!.good : null },
  itemRow: reading => reading.line, itemTime: reading => reading.at, itemValue: reading => reading.good,
  itemDenominator: reading => reading.total,
})
const status: WindowedCellStatus = cells[0]!.status
const value: number | null = cells[0]!.value
void status
void value

// Default items hold an instant or an interval.
aggregateTimeBuckets([{ rowId: 'r', time: 0, value: 1 }, { rowId: 'r', start: 0, end: 1, value: 2 }], columns, { placement: 'prorate' })
// @ts-expect-error an accessor must return a number
aggregateTimeBuckets(readings, columns, { itemValue: reading => reading.line })
// @ts-expect-error an unknown rule name
aggregateTimeBuckets([], columns, { rule: 'mean' })
// @ts-expect-error buckets need IDs: create them with createTimeBucketColumns
aggregateTimeBuckets([], [{ start: 0, end: 1 }])

declare const window: TimelineVisibleWindow
const span: { start: number; end: number } = timeBucketIndexRange(columns, window)
void span
