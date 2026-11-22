import type { TimeRange } from './timeline.js'
import type { WindowedCellStatus } from './windowedData.js'
import { duplicateIdError, invalidIdError, isId } from './ids.js'

/**
 * Time bucket columns and aggregation for period tables: rows (items or metrics) by columns (days, weeks, shifts), with
 * sparse cells. Buckets are caller-defined half-open periods `[start, end)` in the caller's time units, sorted and
 * without overlaps; gaps between them (nights, weekends, breaks) are allowed. Generate calendar periods with
 * `calendarBands` (days, weeks or months in an IANA zone or a fixed offset), working periods with `buildWorkPeriods`,
 * or pass your own. Everything here is pure and does not modify its inputs.
 */

/** A caller-defined half-open period `[start, end)`; `calendarBands` returns them with labels. */
export interface TimeBucketPeriod extends TimeRange {
  /** Column ID. Defaults to `idPrefix` followed by `start`. */
  id?: string
  /** Column label. Used when the `label` option is not given. */
  label?: string
}

/** A period with its column ID: what the aggregation and search helpers take. `TimeBucketColumn` is one. */
export interface TimeBucket extends TimeRange {
  id: string
}

/** A column descriptor for a period table. */
export interface TimeBucketColumn extends TimeBucket {
  label: string
  /** Column width in pixels. */
  width: number
}

export interface TimeBucketColumnOptions<P extends TimeBucketPeriod = TimeBucketPeriod> {
  /** Column ID of a period. Wins over `period.id`. Default `period.id`, else `idPrefix + period.start`. */
  id?: (period: P, index: number) => string
  /** Prefix of the default column IDs. Default `'bucket:'`, so a period starting at 0 is `bucket:0`. */
  idPrefix?: string
  /** Column label of a period. Default `period.label`, else `String(period.start)`. */
  label?: (period: P, index: number) => string
  /** Column width in pixels, for every column or per period. A positive finite number. Default 80. */
  width?: number | ((period: P, index: number) => number)
}

/** Built-in aggregation rules. See `aggregateTimeBuckets`. */
export type TimeBucketRuleName = 'sum' | 'count' | 'min' | 'max' | 'first' | 'last' | 'ratio' | 'precomputed'

export interface TimeBucketReducerContext<T> {
  rowId: string
  bucket: TimeBucket
  /** The items placed in the bucket, in the order of `values`. */
  items: readonly T[]
}

/**
 * A custom rule: the value of one loaded bucket from the values placed in it, in time order (ties in input order).
 * Called with an empty array for a loaded bucket without items. Returns a finite number, or null for no value.
 */
export type TimeBucketReducer<T> = (values: readonly number[], context: TimeBucketReducerContext<T>) => number | null

export type TimeBucketRule<T = TimeBucketItem> = TimeBucketRuleName | TimeBucketReducer<T>

/**
 * How an item with an interval is placed: `start` in the bucket that contains its start; `overlap` with its whole
 * value in every bucket it overlaps; `prorate` split over the buckets it overlaps in proportion to the overlap
 * (parts in gaps or outside every bucket are dropped). An instant, or a zero-length interval, is placed in the bucket
 * that contains it.
 */
export type TimeBucketPlacement = 'start' | 'overlap' | 'prorate'

/**
 * What is loaded: half-open ranges whose union is loaded for every row (a bucket counts as loaded only when the union
 * covers all of it), or a function giving the state of a row's bucket: `true`, `'loaded'` or `'loaded-empty'` for
 * loaded, `false` or `'unloaded'`, `'loading'` or `'failed'` for not loaded. `windowedCoverage` gives the latter.
 */
export type TimeBucketLoaded = readonly TimeRange[] | ((rowId: string, bucket: TimeBucket) => boolean | WindowedCellStatus)

/** The default item shape. Give `time` for an instant, or `start` and `end` for a half-open interval. */
export interface TimeBucketItem {
  rowId: string
  time?: number
  start?: number
  end?: number
  value: number
  /** Denominator of a `ratio` row: `value` is then the numerator. */
  denominator?: number
}

export interface TimeBucketAggregateOptions<T = TimeBucketItem> {
  /** Rule of every row without an entry in `rules`. Default `'sum'`. */
  rule?: TimeBucketRule<T>
  /** Rules by row ID (a Map or a plain object), for tables that mix metrics. */
  rules?: ReadonlyMap<string, TimeBucketRule<T>> | Readonly<Record<string, TimeBucketRule<T>>>
  /** Rows to emit, in order. Items of other rows are ignored. Default: the rows of the items, in first-appearance order. */
  rowIds?: readonly string[]
  /** What is loaded. Default: everything. Buckets that are not loaded get their status and a null value, never 0. */
  loaded?: TimeBucketLoaded
  /** Placement of interval items. Default `'start'`. */
  placement?: TimeBucketPlacement
  /**
   * Carry the value of `last` rows into later loaded buckets without items (running balances, stock levels), and seed
   * it from the last item before the bucket (also before the first bucket or in a gap). The carry stops at a bucket
   * that is not loaded. `true` for every `last` row, or a predicate by row ID. Default false.
   */
  carryForward?: boolean | ((rowId: string) => boolean)
  /** Row of an item. Default `item.rowId`. */
  itemRow?: (item: T) => string
  /** Instant or half-open interval of an item. Default `item.time`, else `{ start: item.start, end: item.end }`. */
  itemTime?: (item: T) => number | TimeRange
  /** Value (the numerator for `ratio` rows) of an item. Default `item.value`. */
  itemValue?: (item: T) => number
  /** Denominator of an item of a `ratio` row. Default `item.denominator`. */
  itemDenominator?: (item: T) => number
  /** Most cells (rows times buckets) one call may emit; more throws RangeError. Default 1000000. */
  maxCells?: number
}

/**
 * One cell of a period table. Its `status` uses the loading states of `windowedData`, not TreeGrid statuses: convert it
 * with `treeGridCellsFromTimeBuckets` (or `treeGridCellContentFromTimeBucket`) before passing it to TreeGrid.
 */
export interface TimeBucketCell {
  rowId: string
  /** The bucket's `id`. */
  columnId: string
  /** The aggregated value; null when the bucket is not loaded, or the rule gives no value (see `aggregateTimeBuckets`). */
  value: number | null
  /** `loaded` (items were placed), `loaded-empty` (loaded, no items), or the not-loaded state. */
  status: WindowedCellStatus
  /** Number of items placed in the bucket. */
  count: number
  /** Sums of numerators and denominators of a loaded `ratio` cell, for further roll-ups. */
  numerator?: number
  denominator?: number
  /** True when `value` was carried forward from an earlier bucket or item. */
  carried?: boolean
}

const defaultWidth = 80
const defaultMaxCells = 1_000_000
const ruleNames: ReadonlySet<string> = new Set(['sum', 'count', 'min', 'max', 'first', 'last', 'ratio', 'precomputed'])
const placements: ReadonlySet<string> = new Set(['start', 'overlap', 'prorate'])
const statuses: ReadonlySet<string> = new Set(['unloaded', 'loading', 'loaded-empty', 'loaded', 'failed'])

function checkPeriods(periods: readonly TimeRange[], kind: string) {
  if (!Array.isArray(periods)) throw new TypeError(`${kind}s must be an array`)
  let previousEnd = -Infinity
  for (let index = 0; index < periods.length; index++) {
    const period = periods[index]
    if (typeof period !== 'object' || period === null) throw new TypeError(`${kind} ${index} must be an object`)
    const { start, end } = period
    if (typeof start !== 'number' || typeof end !== 'number' || !Number.isFinite(start) || !Number.isFinite(end)) {
      throw new RangeError(`${kind} ${index} must have a finite start and end`)
    }
    if (!(start < end)) throw new RangeError(`${kind} ${index} [${start}, ${end}) must have start < end`)
    if (start < previousEnd) {
      throw new RangeError(`${kind} ${index} [${start}, ${end}) overlaps or precedes the previous one; sort periods by time without overlaps`)
    }
    previousEnd = end
  }
}

function checkBuckets(buckets: readonly TimeBucket[]) {
  checkPeriods(buckets, 'Time bucket')
  const seen = new Set<string>()
  for (const bucket of buckets) {
    if (!isId(bucket.id)) throw invalidIdError('time bucket', bucket.id)
    if (seen.has(bucket.id)) throw duplicateIdError('time bucket', bucket.id)
    seen.add(bucket.id)
  }
}

/** Index of the last bucket that starts at or before `time`, or -1. */
function lastStartingAtOrBefore(buckets: readonly TimeRange[], time: number) {
  let low = 0, high = buckets.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (buckets[middle]!.start <= time) low = middle + 1
    else high = middle
  }
  return low - 1
}

function finiteTime(time: unknown, name: string): number {
  if (typeof time !== 'number' || !Number.isFinite(time)) throw new RangeError(`${name} must be a finite number`)
  return time
}

/**
 * Column descriptors `{ id, label, width, start, end }` for half-open periods. IDs are deterministic: by default
 * `idPrefix + start`, so a column keeps its ID when the shown periods scroll. Throws TypeError for a non-array or a
 * period that is not an object, RangeError for a non-finite or empty period, periods out of order or overlapping (gaps
 * are allowed), and a width that is not positive and finite, and Error for an invalid or duplicate column ID.
 */
export function createTimeBucketColumns<P extends TimeBucketPeriod>(
  periods: readonly P[], options: TimeBucketColumnOptions<P> = {},
): TimeBucketColumn[] {
  checkPeriods(periods, 'Time bucket period')
  const { id, idPrefix = 'bucket:', label, width = defaultWidth } = options
  if (typeof idPrefix !== 'string') throw new TypeError('idPrefix must be a string')
  const seen = new Set<string>()
  const columns: TimeBucketColumn[] = []
  for (let index = 0; index < periods.length; index++) {
    const period = periods[index]!
    const columnId = id ? id(period, index) : period.id ?? idPrefix + period.start
    if (!isId(columnId)) throw invalidIdError('time bucket', columnId)
    if (seen.has(columnId)) throw duplicateIdError('time bucket', columnId)
    seen.add(columnId)
    const columnLabel = label ? label(period, index) : period.label ?? String(period.start)
    if (typeof columnLabel !== 'string') throw new TypeError(`Label of time bucket ${columnId} must be a string`)
    const columnWidth = typeof width === 'function' ? width(period, index) : width
    if (typeof columnWidth !== 'number' || !Number.isFinite(columnWidth) || columnWidth <= 0) {
      throw new RangeError(`Width of time bucket ${columnId} must be a positive finite number`)
    }
    columns.push({ id: columnId, label: columnLabel, width: columnWidth, start: period.start, end: period.end })
  }
  return columns
}

/**
 * Index of the bucket that contains `time` (`start <= time < end`), or -1 when it is before, after or between the
 * buckets. A binary search: the buckets must be sorted without overlaps, as `createTimeBucketColumns` checks; they are
 * not validated again. Throws RangeError for a non-finite time.
 */
export function timeBucketIndex(buckets: readonly TimeRange[], time: number): number {
  finiteTime(time, 'time')
  const index = lastStartingAtOrBefore(buckets, time)
  return index >= 0 && time < buckets[index]!.end ? index : -1
}

/**
 * The half-open index range `{ start, end }` of the buckets that overlap a time range `[start, end)`, such as
 * GanttChart's `TimelineVisibleWindow`: `buckets.slice(start, end)` are the columns a period table shows to follow the
 * chart. An empty range, or one between buckets, gives `start === end`. A binary search over sorted, non-overlapping
 * buckets, which are not validated again. Throws RangeError for a non-finite range or `end < start`.
 */
export function timeBucketIndexRange(buckets: readonly TimeRange[], range: TimeRange): { start: number; end: number } {
  const start = finiteTime(range?.start, 'Range start'), end = finiteTime(range?.end, 'Range end')
  if (end < start) throw new RangeError(`Range [${start}, ${end}) must have start <= end`)
  const before = lastStartingAtOrBefore(buckets, start)
  const first = before >= 0 && buckets[before]!.end > start ? before : before + 1
  // The buckets that start before `end`.
  let low = first, high = buckets.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (buckets[middle]!.start < end) low = middle + 1
    else high = middle
  }
  const stop = end === start ? first : low
  return { start: first, end: stop }
}

interface BucketAccumulator<T> {
  count: number
  sum: number
  denominator: number
  min: number
  max: number
  firstKey: number
  firstValue: number
  lastKey: number
  lastValue: number
  entries?: { key: number; order: number; value: number; item: T }[]
}

interface RowAccumulator<T> {
  rule: TimeBucketRule<T>
  carry: boolean
  buckets: Map<number, BucketAccumulator<T>>
  /** For carried rows: the latest item before bucket `index` and after the previous bucket, by bucket index. */
  before?: Map<number, { key: number; value: number }>
}

function newAccumulator<T>(custom: boolean): BucketAccumulator<T> {
  return {
    count: 0, sum: 0, denominator: 0, min: Infinity, max: -Infinity,
    firstKey: Infinity, firstValue: 0, lastKey: -Infinity, lastValue: 0, entries: custom ? [] : undefined,
  }
}

/**
 * Aggregate time-stamped quantities into sparse period-table cells `{ rowId, columnId, value, status, count }`, one for
 * every row and bucket, rows in order and buckets in time order. Each item is placed by its instant (`time`) or
 * interval (`start`/`end`, by `placement`); items outside every bucket are ignored (except to seed `carryForward`).
 *
 * Rules, for a loaded bucket with items / without items:
 * - `sum`: the total / 0. `count`: the number of items / 0.
 * - `min`, `max`: the extreme value / null. `first`, `last`: the value of the earliest or latest item (by time, or by
 *   interval start; ties in input order) / null, or with `carryForward` the value carried from before.
 * - `ratio`: sum of values divided by sum of denominators, so rates (yield, utilisation) are weighted, never an average
 *   of percentages; `numerator` and `denominator` are kept on the cell for roll-ups / null. A zero denominator gives null.
 * - `precomputed`: the value of the one item in the bucket, as-is (server-side aggregates) / null. Two items of one row
 *   in one bucket throw Error.
 * - a function: see `TimeBucketReducer`.
 *
 * A bucket that `loaded` does not cover gets status `unloaded` (or the `loading` or `failed` state the function gives)
 * and a null value, so missing data never shows as 0. Throws TypeError for inputs of the wrong type, RangeError for
 * invalid buckets (as `createTimeBucketColumns`), a non-finite time, value or denominator, an inverted interval or
 * loaded range, an unknown rule, placement or status, a custom result that is neither finite nor null, and more cells
 * than `maxCells`, and Error for an invalid or duplicate bucket or row ID and a repeated precomputed value. Runs in
 * O((items + cells) · log buckets), plus the overlapped buckets of each interval item.
 */
export function aggregateTimeBuckets<T = TimeBucketItem>(
  items: readonly T[], buckets: readonly TimeBucket[], options: TimeBucketAggregateOptions<T> = {},
): TimeBucketCell[] {
  if (!Array.isArray(items)) throw new TypeError('Time bucket items must be an array')
  checkBuckets(buckets)
  const {
    rule = 'sum', rules, rowIds, loaded, placement = 'start', carryForward = false, maxCells = defaultMaxCells,
  } = options
  const itemRow = options.itemRow ?? ((item: T) => (item as TimeBucketItem).rowId)
  const itemValue = options.itemValue ?? ((item: T) => (item as TimeBucketItem).value)
  const itemDenominator = options.itemDenominator ?? ((item: T) => (item as TimeBucketItem).denominator as number)
  const itemTime = options.itemTime ?? ((item: T) => {
    const { time, start, end } = item as TimeBucketItem
    return time !== undefined ? time : { start: start as number, end: end as number }
  })
  if (!placements.has(placement)) throw new RangeError('Unknown time bucket placement: ' + String(placement))
  if (typeof maxCells !== 'number' || Number.isNaN(maxCells) || maxCells < 0) throw new RangeError('maxCells must be a nonnegative number')
  const checkRule = (value: unknown, owner: string): TimeBucketRule<T> => {
    if (typeof value === 'function' || (typeof value === 'string' && ruleNames.has(value))) return value as TimeBucketRule<T>
    throw new RangeError(`Unknown time bucket rule${owner}: ${String(value)}`)
  }
  checkRule(rule, '')
  const ruleOf = (rowId: string): TimeBucketRule<T> => {
    if (rules instanceof Map) return rules.has(rowId) ? checkRule(rules.get(rowId), ' of row ' + rowId) : rule
    if (rules && Object.hasOwn(rules, rowId)) return checkRule((rules as Record<string, unknown>)[rowId], ' of row ' + rowId)
    return rule
  }
  const carries = (rowId: string, rowRule: TimeBucketRule<T>) =>
    rowRule === 'last' && (typeof carryForward === 'function' ? carryForward(rowId) === true : carryForward === true)

  const rows = new Map<string, RowAccumulator<T>>()
  const addRow = (rowId: string) => {
    const rowRule = ruleOf(rowId)
    const carry = carries(rowId, rowRule)
    const row: RowAccumulator<T> = { rule: rowRule, carry, buckets: new Map(), before: carry ? new Map() : undefined }
    rows.set(rowId, row)
    return row
  }
  const fixedRows = rowIds !== undefined
  if (fixedRows) {
    if (!Array.isArray(rowIds)) throw new TypeError('rowIds must be an array')
    for (const rowId of rowIds) {
      if (!isId(rowId)) throw invalidIdError('time bucket row', rowId)
      if (rows.has(rowId)) throw duplicateIdError('time bucket row', rowId)
      addRow(rowId)
    }
  }

  const bucketCount = buckets.length
  const place = (row: RowAccumulator<T>, index: number, key: number, value: number, denominator: number, order: number, item: T) => {
    let accumulator = row.buckets.get(index)
    if (!accumulator) row.buckets.set(index, accumulator = newAccumulator<T>(typeof row.rule === 'function'))
    if (row.rule === 'precomputed' && accumulator.count > 0) {
      throw new Error(`Duplicate precomputed time bucket value: row ${itemRow(item)} in bucket ${buckets[index]!.id}`)
    }
    accumulator.count++
    accumulator.sum += value
    accumulator.denominator += denominator
    if (value < accumulator.min) accumulator.min = value
    if (value > accumulator.max) accumulator.max = value
    if (key < accumulator.firstKey) { accumulator.firstKey = key; accumulator.firstValue = value }
    if (key >= accumulator.lastKey) { accumulator.lastKey = key; accumulator.lastValue = value }
    accumulator.entries?.push({ key, order, value, item })
  }
  const noteBefore = (row: RowAccumulator<T>, time: number, value: number) => {
    // The first bucket starting after `time`, when `time` is in no bucket.
    const next = lastStartingAtOrBefore(buckets, time) + 1
    if (next >= bucketCount) return
    const previous = row.before!.get(next)
    if (!previous || time >= previous.key) row.before!.set(next, { key: time, value })
  }

  for (let order = 0; order < items.length; order++) {
    const item = items[order]!
    const rowId = itemRow(item)
    let row = rows.get(rowId)
    if (!row) {
      if (fixedRows) continue
      if (!isId(rowId)) throw invalidIdError('time bucket row', rowId)
      row = addRow(rowId)
    }
    const value = itemValue(item)
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError(`Value of time bucket item ${order} must be a finite number`)
    let denominator = 0
    if (row.rule === 'ratio') {
      denominator = itemDenominator(item)
      if (typeof denominator !== 'number' || !Number.isFinite(denominator)) {
        throw new RangeError(`Denominator of time bucket item ${order} must be a finite number`)
      }
    }
    const time = itemTime(item)
    let start: number, end: number
    if (typeof time === 'number') {
      start = end = finiteTime(time, `Time of time bucket item ${order}`)
    } else {
      if (typeof time !== 'object' || time === null) throw new TypeError(`Time of time bucket item ${order} must be a number or a range`)
      start = finiteTime(time.start, `Start of time bucket item ${order}`)
      end = finiteTime(time.end, `End of time bucket item ${order}`)
      if (end < start) throw new RangeError(`Time bucket item ${order} [${start}, ${end}) must have start <= end`)
    }
    if (start === end || placement === 'start') {
      const index = timeBucketIndex(buckets, start)
      if (index >= 0) place(row, index, start, value, denominator, order, item)
      else if (row.carry) noteBefore(row, start, value)
      continue
    }
    if (row.carry && timeBucketIndex(buckets, start) < 0) noteBefore(row, start, value)
    const span = timeBucketIndexRange(buckets, { start, end })
    const length = end - start
    for (let index = span.start; index < span.end; index++) {
      const bucket = buckets[index]!
      if (placement === 'overlap') {
        place(row, index, start, value, denominator, order, item)
      } else {
        const share = (Math.min(end, bucket.end) - Math.max(start, bucket.start)) / length
        place(row, index, start, value * share, denominator * share, order, item)
      }
    }
  }

  if (rows.size * bucketCount > maxCells) {
    throw new RangeError(`${rows.size} rows by ${bucketCount} time buckets exceed maxCells (${maxCells})`)
  }

  // Loaded coverage: merged ranges, or a function by row and bucket.
  let coverage: TimeRange[] | undefined
  let loadedOf: ((rowId: string, bucket: TimeBucket) => boolean | WindowedCellStatus) | undefined
  if (typeof loaded === 'function') loadedOf = loaded
  else if (loaded !== undefined) {
    if (!Array.isArray(loaded)) throw new TypeError('loaded must be an array of ranges or a function')
    const ranges: TimeRange[] = []
    for (let index = 0; index < loaded.length; index++) {
      const range = loaded[index]
      const start = finiteTime(range?.start, `Start of loaded range ${index}`), end = finiteTime(range?.end, `End of loaded range ${index}`)
      if (end < start) throw new RangeError(`Loaded range ${index} [${start}, ${end}) must have start <= end`)
      if (end > start) ranges.push({ start, end })
    }
    ranges.sort((a, b) => a.start - b.start)
    coverage = []
    for (const range of ranges) {
      const last = coverage[coverage.length - 1]
      if (last && range.start <= last.end) last.end = Math.max(last.end, range.end)
      else coverage.push({ ...range })
    }
  }
  const loadedBuckets = coverage ? buckets.map(bucket => {
    const index = lastStartingAtOrBefore(coverage!, bucket.start)
    return index >= 0 && coverage![index]!.end >= bucket.end
  }) : undefined
  const stateOf = (rowId: string, index: number): 'loaded' | 'unloaded' | 'loading' | 'failed' => {
    if (loadedBuckets) return loadedBuckets[index] ? 'loaded' : 'unloaded'
    if (!loadedOf) return 'loaded'
    const state = loadedOf(rowId, buckets[index]!)
    if (state === true || state === 'loaded' || state === 'loaded-empty') return 'loaded'
    if (state === false) return 'unloaded'
    if (typeof state === 'string' && statuses.has(state)) return state as 'unloaded' | 'loading' | 'failed'
    throw new RangeError(`Unknown loaded state of row ${rowId} in time bucket ${buckets[index]!.id}: ${String(state)}`)
  }

  const cells: TimeBucketCell[] = []
  for (const [rowId, row] of rows) {
    const { rule: rowRule } = row
    let carried: number | null = null
    for (let index = 0; index < bucketCount; index++) {
      const bucket = buckets[index]!
      const accumulator = row.buckets.get(index)
      const count = accumulator?.count ?? 0
      if (row.carry) {
        const before = row.before!.get(index)
        if (before) carried = before.value
      }
      const state = stateOf(rowId, index)
      if (state !== 'loaded') {
        carried = null
        cells.push({ rowId, columnId: bucket.id, value: null, status: state, count })
        continue
      }
      const cell: TimeBucketCell = { rowId, columnId: bucket.id, value: null, status: count > 0 ? 'loaded' : 'loaded-empty', count }
      if (typeof rowRule === 'function') {
        const entries = accumulator?.entries ?? []
        entries.sort((a, b) => a.key - b.key || a.order - b.order)
        const result = rowRule(entries.map(entry => entry.value), { rowId, bucket, items: entries.map(entry => entry.item) })
        if (result !== null && (typeof result !== 'number' || !Number.isFinite(result))) {
          throw new RangeError(`Time bucket rule of row ${rowId} must return a finite number or null in bucket ${bucket.id}`)
        }
        cell.value = result
      } else if (rowRule === 'sum') cell.value = accumulator?.sum ?? 0
      else if (rowRule === 'count') cell.value = count
      else if (rowRule === 'ratio') {
        const numerator = accumulator?.sum ?? 0, denominator = accumulator?.denominator ?? 0
        cell.numerator = numerator
        cell.denominator = denominator
        cell.value = count > 0 && denominator !== 0 ? numerator / denominator : null
      } else if (accumulator) {
        cell.value = rowRule === 'min' ? accumulator.min : rowRule === 'max' ? accumulator.max
          : rowRule === 'first' ? accumulator.firstValue : rowRule === 'last' ? accumulator.lastValue : accumulator.sum
      }
      if (row.carry) {
        if (accumulator) carried = accumulator.lastValue
        else if (carried !== null) {
          cell.value = carried
          cell.carried = true
        }
      }
      cells.push(cell)
    }
  }
  return cells
}
