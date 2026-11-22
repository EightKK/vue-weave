import type {
  CalendarBandLocalTime, CalendarBandOptions, CalendarBandUnit, TimelineBand, TimelineBar, TimelineBarEnd, TimelineDependency, TimelineDependencyType,
  TimelineLoadSegment, TimelineRow, TimelineSummary,
} from './types.js'
import type { TimelineBaselineVariance } from './types.js'
import type { TimelineConstraintEdit, TimelineConstraintKind, TimelineConstraints } from './types.js'
import { firstIndex, intervalsMeet } from './intervals.js'
import { cachedDateFormat, zonedInstant, zoneFormat, zoneOffset, zoneTransition } from './timeZone.js'
import { maxUtcOffsetMinutes } from './workCalendar.js'
import { duplicateIdError, inContext, invalidIdError, isId, uniqueIds } from './ids.js'
import { isDependencyType } from './dependencyTypes.js'

export interface TimeRange {
  start: number
  end: number
}

export type EditMode = 'move' | 'start' | 'end'

/**
 * The `TimelineColumnResize.id` of the row label column, which has no `TimelineColumn` of its own. Do not use it as
 * the ID of a `TimelineColumn` in a chart with `columnsResizable`.
 */
export const timelineLabelColumnId = '$label'

/**
 * The baseline set ID of the single unnamed `TimelineBar.baseline`, for `baselineIds` and `baselineLabel`. A
 * `TimelineBar.baselines` entry may not use it.
 */
export const timelineBaselineId = '$baseline'

/** The most baseline sets GanttChart and `renderTimelineSvg` draw at once. */
export const timelineBaselineLimit = 3

/** Every `TimelineConstraintKind`, in the order GanttChart describes and draws them. */
export const timelineConstraintKinds: readonly TimelineConstraintKind[] = Object.freeze([
  'startNoEarlierThan', 'startNoLaterThan', 'finishNoEarlierThan', 'finishNoLaterThan', 'fixedStart',
] as const)

function checkConstraintKind(kind: unknown): asserts kind is TimelineConstraintKind {
  if (!timelineConstraintKinds.includes(kind as TimelineConstraintKind)) throw new Error('Unknown constraint kind: ' + String(kind))
}

/**
 * Whether the interval breaks the constraint `kind` at `time`: a start before `startNoEarlierThan` or after
 * `startNoLaterThan`, a finish (`end`) before `finishNoEarlierThan` or after `finishNoLaterThan`, or a start other than
 * `fixedStart`. GanttChart and `renderTimelineSvg` draw such a constraint as violated.
 */
export function timelineConstraintViolated(range: TimeRange, kind: TimelineConstraintKind, time: number): boolean {
  checkConstraintKind(kind)
  switch (kind) {
    case 'startNoEarlierThan': return range.start < time
    case 'startNoLaterThan': return range.start > time
    case 'finishNoEarlierThan': return range.end < time
    case 'finishNoLaterThan': return range.end > time
    default: return range.start !== time
  }
}

/**
 * The constraint fields of any object, for example a `ScheduleTask`, as a new `TimelineConstraints` with only the
 * kinds that are set, or undefined when none is. Use it to build `TimelineBar.constraints` from scheduler tasks; the
 * other direction needs no helper, because `{ ...task, ...bar.constraints }` is a valid `ScheduleTask`.
 */
export function timelineConstraints(source: Readonly<TimelineConstraints> | undefined): TimelineConstraints | undefined {
  let result: TimelineConstraints | undefined
  for (const kind of timelineConstraintKinds) {
    const time = source?.[kind]
    if (time === undefined) continue
    if (typeof time !== 'number' || !Number.isFinite(time)) throw new RangeError(`Constraint ${kind} must be a finite time`)
    ;(result ??= {})[kind] = time
  }
  return result
}

/**
 * Apply a GanttChart `constraint-edit` proposal: returns a new array in which the bar `change.id` is a copy with
 * `constraints[change.kind]` set to `change.after`, or without it when `after` is undefined (the `constraints` field is
 * left out once it is empty). Other bars are the same objects. The input is not modified. Throws an Error for an unknown
 * bar or kind and a RangeError for an `after` that is not a finite time. `before` is not compared with the bar.
 */
export function applyTimelineConstraintEdit<B extends TimelineBar>(bars: readonly B[], change: TimelineConstraintEdit): B[] {
  checkConstraintKind(change.kind)
  const after = change.after
  if (after !== undefined && (typeof after !== 'number' || !Number.isFinite(after))) {
    throw new RangeError(`Constraint ${change.kind} must be a finite time`)
  }
  let found = false
  const result = bars.map(bar => {
    if (bar.id !== change.id) return bar
    found = true
    const constraints: TimelineConstraints = { ...bar.constraints }
    if (after === undefined) delete constraints[change.kind]
    else constraints[change.kind] = after
    const { constraints: _previous, ...rest } = bar
    return (Object.values(constraints).some(value => value !== undefined) ? { ...rest, constraints } : rest) as B
  })
  if (!found) throw new Error('Unknown bar: ' + change.id)
  return result
}

/** A bar's interval in baseline set `id`: `bar.baseline` for `timelineBaselineId`, otherwise the matching `bar.baselines` entry. */
export function timelineBaseline(bar: Pick<TimelineBar, 'baseline' | 'baselines'>, id: string): TimeRange | undefined {
  if (id === timelineBaselineId) return bar.baseline
  return bar.baselines?.find(item => item.id === id)
}

/**
 * Every baseline set ID that occurs in `bars`: `timelineBaselineId` first when any bar has a `baseline`, then the
 * `baselines` IDs in order of first appearance. GanttChart draws the first `timelineBaselineLimit` of them when
 * `baselineIds` is omitted.
 */
export function timelineBaselineIds(bars: readonly Pick<TimelineBar, 'baseline' | 'baselines'>[]): string[] {
  const ids: string[] = []
  const seen = new Set<string>()
  if (bars.some(bar => bar.baseline)) {
    ids.push(timelineBaselineId)
    seen.add(timelineBaselineId)
  }
  for (const bar of bars) {
    for (const item of bar.baselines ?? []) {
      if (seen.has(item.id)) continue
      seen.add(item.id)
      ids.push(item.id)
    }
  }
  return ids
}

/**
 * The variance of a bar against a baseline, in the units of the bar: `start` and `end` are the bar's dates minus the
 * baseline's and `duration` is the bar's length minus the baseline's, so positive values mean later or longer. Throws a
 * RangeError for non-finite times.
 */
export function baselineVariance(bar: TimeRange, baseline: TimeRange): TimelineBaselineVariance {
  for (const value of [bar.start, bar.end, baseline.start, baseline.end]) {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError('baselineVariance needs finite times')
  }
  const zero = (value: number) => value === 0 ? 0 : value
  return {
    start: zero(bar.start - baseline.start),
    end: zero(bar.end - baseline.end),
    duration: zero((bar.end - bar.start) - (baseline.end - baseline.start)),
  }
}

/** A monotonic, continuous mapping. All components use the same coordinate space. */
export interface TimeScale {
  width: number
  toX(time: number): number
  toTime(x: number): number
}

function checkRange(range: TimeRange, allowPoint = false) {
  if (!Number.isFinite(range.start) || !Number.isFinite(range.end) || range.end < range.start
    || (!allowPoint && range.end === range.start)) {
    throw new RangeError('A range must have finite ordered endpoints')
  }
}

export function createTimeScale(range: TimeRange, pixelsPerUnit: number): TimeScale {
  checkRange(range)
  if (!Number.isFinite(pixelsPerUnit) || pixelsPerUnit <= 0) throw new RangeError('pixelsPerUnit must be finite and positive')
  const width = (range.end - range.start) * pixelsPerUnit
  if (!Number.isFinite(width)) throw new RangeError('The time axis is too wide')
  return {
    width,
    toX: time => (time - range.start) * pixelsPerUnit,
    toTime: x => range.start + x / pixelsPerUnit,
  }
}

/**
 * Mirror a scale for a right-to-left axis: the range start maps to `width` and the range end to 0. Both mappings
 * stay inverse; round trips are exact whenever they are exact for `scale` and `width - x` is exactly representable
 * (for example integer pixel positions). GanttChart does not need it, because it positions elements from the inline
 * start edge; it is used to export right-to-left SVG and is available for custom renderers.
 */
export function mirrorTimeScale(scale: TimeScale): TimeScale {
  const width = scale.width
  if (!Number.isFinite(width) || width <= 0) throw new RangeError('A time scale needs a positive finite width')
  return {
    width,
    toX: time => width - scale.toX(time),
    toTime: x => scale.toTime(width - x),
  }
}

/** Decimal places (at most 15) that represent a value exactly as a scaled safe integer, or undefined. */
function decimalPlaces(value: number) {
  for (let places = 0, scale = 1; places <= 15; places++, scale *= 10) {
    const scaled = Math.round(value * scale)
    if (!Number.isSafeInteger(scaled)) return undefined
    if (scaled / scale === value) return places
  }
  return undefined
}

/**
 * The power of ten that turns a fractional step and the other values of a snapped computation into exact safe
 * integers, so that, for example, three steps of 0.1 give 0.3. Integer steps, and values without a short decimal
 * form, return 1: they keep plain floating-point arithmetic.
 */
function decimalScale(step: number, values: readonly number[]) {
  if (Number.isInteger(step)) return 1
  let places = 0
  for (const value of [step, ...values]) {
    const own = decimalPlaces(value)
    if (own === undefined) return 1
    places = Math.max(places, own)
  }
  const scale = 10 ** places
  return [step, ...values].every(value => {
    const integer = Math.round(value * scale)
    return Number.isSafeInteger(integer) && integer / scale === value
  }) ? scale : 1
}

/** Values multiplied by a decimal scale, rounded to the integers they represent. A scale of 1 leaves them unchanged. */
function scaled(scale: number, values: readonly number[]) {
  return scale === 1 ? values.slice() : values.map(value => Math.round(value * scale))
}

/**
 * Ticks at `anchor + k × step` inside the closed window. With a fractional step, tick values are computed in exact
 * decimal arithmetic when the step and anchor have at most 15 decimal places, so ticks of 0.1 are 0.1, 0.2, 0.3 and
 * not 0.30000000000000004. Integer steps use plain arithmetic.
 */
export function timeTicks(window: TimeRange, step: number, anchor = 0): number[] {
  checkRange(window, true)
  if (!Number.isFinite(anchor) || !Number.isFinite(step) || step <= 0) throw new RangeError('Invalid tick step or anchor')
  const first = Math.ceil((window.start - anchor) / step)
  const last = Math.floor((window.end - anchor) / step)
  if (!Number.isFinite(first) || !Number.isFinite(last)) {
    throw new RangeError('The tick window is too far from the anchor for this tick step')
  }
  const count = Math.max(0, last - first + 1)
  if (count > 10000) throw new RangeError('Too many ticks; increase the tick step or reduce the visible window')
  const scale = decimalScale(step, [anchor])
  if (scale !== 1) {
    const [unit, origin] = scaled(scale, [step, anchor]) as [number, number]
    // Exact while every scaled tick is a safe integer; otherwise fall back to plain arithmetic.
    if (Number.isSafeInteger(origin + first * unit) && Number.isSafeInteger(origin + last * unit)) {
      return Array.from({ length: count }, (_, i) => (origin + (first + i) * unit) / scale)
    }
  }
  return Array.from({ length: count }, (_, i) => anchor + (first + i) * step)
}

export function visibleRows(scrollTop: number, bodyHeight: number, rowHeight: number, count: number, overscan = 2) {
  if (![scrollTop, bodyHeight, rowHeight, count, overscan].every(Number.isFinite) || rowHeight <= 0
    || bodyHeight < 0 || count < 0 || overscan < 0 || !Number.isInteger(count) || !Number.isInteger(overscan)) {
    throw new RangeError('Invalid virtual row geometry')
  }
  const top = Math.max(0, scrollTop)
  return {
    first: Math.min(count, Math.max(0, Math.floor(top / rowHeight) - overscan)),
    afterLast: Math.min(count, Math.ceil((top + bodyHeight) / rowHeight) + overscan),
  }
}

/**
 * Whether an interval overlaps a window. Intervals are half-open, so one that ends at `window.start` or starts at
 * `window.end` does not overlap; a zero-duration interval (milestone) overlaps when it lies inside the closed window,
 * so a milestone at either window edge counts.
 */
export function intersectsWindow(bar: TimeRange, window: TimeRange) {
  if (bar.start === bar.end) return bar.start >= window.start && bar.start <= window.end
  return bar.end > window.start && bar.start < window.end
}

/** Snap displacement relative to the original interval, preserving off-grid starts. */
export function editTimeRange(
  range: TimeRange, mode: EditMode, delta: number, step: number, bounds: TimeRange, minDuration = step,
): TimeRange {
  checkRange(range, true)
  checkRange(bounds)
  if (!Number.isFinite(delta)) throw new RangeError('delta must be finite')
  if (!Number.isFinite(step) || step <= 0) throw new RangeError('snap must be finite and positive')
  if (!Number.isFinite(minDuration) || minDuration <= 0) throw new RangeError('minDuration must be finite and positive')
  if (!['move', 'start', 'end'].includes(mode)) throw new RangeError('Unknown edit mode')
  if (range.start < bounds.start || range.end > bounds.end) throw new RangeError('Editable intervals must fit inside editBounds')
  if (mode !== 'move' && range.end - range.start < minDuration) throw new RangeError('The interval is shorter than minDuration')
  const steps = Math.sign(delta) * Math.round(Math.abs(delta) / step)
  const values = [step, range.start, range.end, bounds.start, bounds.end, minDuration]
  // A fractional step is computed on exact scaled integers, see decimalScale; integer steps keep plain arithmetic.
  const scale = decimalScale(step, values.slice(1))
  const exact = scale === 1 ? undefined : snapRange(scaled(scale, values), mode, steps, scale)
  return exact ?? snapRange(values, mode, steps, 1)!
}

/** The snapped edit on (possibly scaled) values; undefined when scaled arithmetic would not stay exact. */
function snapRange(values: readonly number[], mode: EditMode, steps: number, scale: number): TimeRange | undefined {
  const [step, rangeStart, rangeEnd, boundsStart, boundsEnd, minDuration] = values as [number, number, number, number, number, number]
  const duration = rangeEnd - rangeStart
  const snapped = steps * step
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
  let start = rangeStart, end = rangeEnd
  if (mode === 'move') {
    start = clamp(rangeStart + snapped, boundsStart, boundsEnd - duration)
    end = start + duration
  } else if (mode === 'start') start = clamp(rangeStart + snapped, boundsStart, rangeEnd - minDuration)
  else end = clamp(rangeEnd + snapped, rangeStart + minDuration, boundsEnd)
  if (scale !== 1 && !(Number.isSafeInteger(snapped) && Number.isSafeInteger(start) && Number.isSafeInteger(end))) return undefined
  return { start: start / scale, end: end / scale }
}

/** Shape of a dependency connector: right angles (default), right angles with rounded corners, or a smooth curve. */
export type DependencyPathStyle = 'orthogonal' | 'rounded' | 'curve'

const dependencyPathStyles: readonly string[] = ['orthogonal', 'rounded', 'curve']
const dependencyCornerRadius = 6
const dependencyCurveReach = 30

/**
 * SVG path of a dependency connector from (x1, y1) to (x2, y2). It leaves the source and enters the target horizontally,
 * and loops around through the middle when the target starts left of the source. Any other style throws RangeError.
 */
export function dependencyPath(x1: number, y1: number, x2: number, y2: number, style: DependencyPathStyle = 'orthogonal') {
  if (!dependencyPathStyles.includes(style)) throw new RangeError('Unknown dependency path style: ' + String(style))
  if (style === 'curve') {
    if (x1 < x2) {
      const middle = (x1 + x2) / 2
      return `M ${x1} ${y1} C ${middle} ${y1} ${middle} ${y2} ${x2} ${y2}`
    }
    const middleY = (y1 + y2) / 2 + (y1 === y2 ? 14 : 0)
    const reach = dependencyCurveReach
    return `M ${x1} ${y1} C ${x1 + reach} ${y1} ${x1 + reach} ${middleY} ${(x1 + x2) / 2} ${middleY} S ${x2 - reach} ${y2} ${x2} ${y2}`
  }
  const points: [number, number][] = x1 < x2
    ? [[x1, y1], [(x1 + x2) / 2, y1], [(x1 + x2) / 2, y2], [x2, y2]]
    : [[x1, y1], [x1 + 10, y1], [x1 + 10, (y1 + y2) / 2 + (y1 === y2 ? 14 : 0)],
        [x2 - 10, (y1 + y2) / 2 + (y1 === y2 ? 14 : 0)], [x2 - 10, y2], [x2, y2]]
  if (style === 'orthogonal') {
    if (x1 < x2) return `M ${x1} ${y1} H ${points[1]![0]} V ${y2} H ${x2}`
    return `M ${x1} ${y1} h 10 V ${points[2]![1]} H ${x2 - 10} V ${y2} H ${x2}`
  }
  return roundedPolyline(points, dependencyCornerRadius)
}

// A polyline whose corners are rounded with quadratic curves; a radius never exceeds half of either adjacent segment.
function roundedPolyline(points: readonly (readonly [number, number])[], radius: number) {
  let path = `M ${points[0]![0]} ${points[0]![1]}`
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1]!, [x, y] = points[i]!, [nx, ny] = points[i + 1]!
    const before = Math.hypot(x - px, y - py), after = Math.hypot(nx - x, ny - y)
    const r = Math.min(radius, before / 2, after / 2)
    if (r <= 0) {
      path += ` L ${x} ${y}`
      continue
    }
    const ax = x - (x - px) / before * r, ay = y - (y - py) / before * r
    const bx = x + (nx - x) / after * r, by = y + (ny - y) / after * r
    path += ` L ${ax} ${ay} Q ${x} ${y} ${bx} ${by}`
  }
  const [lx, ly] = points[points.length - 1]!
  return path + ` L ${lx} ${ly}`
}

export function dependencyTimes(source: TimeRange, target: TimeRange, type: TimelineDependency['type'] = 'FS') {
  return {
    from: type[0] === 'S' ? source.start : source.end,
    to: type[1] === 'F' ? target.end : target.start,
  }
}

function checkSegments(bar: TimelineBar) {
  const segments = bar.segments!
  if (bar.start === bar.end) throw new RangeError('A milestone cannot have segments: ' + bar.id)
  if (!Array.isArray(segments) || !segments.length) throw new RangeError('segments must contain at least one interval: ' + bar.id)
  let previousEnd = bar.start
  for (const segment of segments) {
    if (!Number.isFinite(segment.start) || !Number.isFinite(segment.end) || segment.end <= segment.start
      || segment.start < previousEnd || segment.end > bar.end) {
      throw new RangeError('Segments must be sorted, nonoverlapping, positive-length intervals within the bar: ' + bar.id)
    }
    previousEnd = segment.end
  }
}

function checkConstraints(bar: TimelineBar) {
  const constraints: unknown = bar.constraints
  if (!constraints || typeof constraints !== 'object' || Array.isArray(constraints)) throw new Error('constraints must be an object: ' + bar.id)
  for (const kind of timelineConstraintKinds) {
    const time = (constraints as TimelineConstraints)[kind]
    if (time !== undefined && (typeof time !== 'number' || !Number.isFinite(time))) {
      throw new RangeError(`Constraint ${kind} of bar ${bar.id} must be a finite time`)
    }
  }
}

function checkBaselines(bar: TimelineBar) {
  const list: unknown = bar.baselines
  if (!Array.isArray(list)) throw new Error('baselines must be an array: ' + bar.id)
  const ids = new Set<string>()
  for (const item of list as NonNullable<TimelineBar['baselines']>) {
    if (!isId(item?.id)) throw inContext(invalidIdError('baseline set', item?.id), 'bar ' + bar.id)
    if (item.id === timelineBaselineId) {
      throw new Error(`The baseline set ID ${timelineBaselineId} is reserved for TimelineBar.baseline: ${bar.id}`)
    }
    if (ids.has(item.id)) throw inContext(duplicateIdError('baseline set', item.id), 'bar ' + bar.id)
    ids.add(item.id)
    if (typeof item.start !== 'number' || typeof item.end !== 'number' || !Number.isFinite(item.start) || !Number.isFinite(item.end)
      || item.end < item.start) {
      throw new RangeError(`Baseline ${item.id} of bar ${bar.id} must have finite endpoints with start <= end`)
    }
  }
}

/** Options of `validateTimelineData`. */
export interface TimelineDataOptions {
  /**
   * Accept a dependency end that names a summary row (a row other rows have as `parentId`) when no bar has that ID, as
   * GanttChart `summaryDependencies` and `renderTimelineSvg` `summaryDependencies` draw them. Default false: every
   * dependency end must be a bar ID.
   */
  summaryDependencies?: boolean
}

/**
 * Validate once per input change. IDs must be unique within each collection (rows, bars, dependencies); a row and a
 * bar may share an ID. Throws an Error for a dependency from a bar to itself, naming the dependency and the bar.
 * (`scheduleTasks`, which takes its own links, reports such a link as a cycle instead.) Throws a RangeError for a
 * dependency `lag` that is not a finite number. With `options.summaryDependencies`, a dependency end may also be the ID
 * of a summary row; an ID that is both a bar ID and a row ID always means the bar. As in `scheduleTasks`, a dependency
 * between a summary row and a bar or summary row below it throws an Error.
 */
export function validateTimelineData(
  rows: readonly TimelineRow[], bars: readonly TimelineBar[],
  dependencies: readonly TimelineDependency[] = [], laneCount = 1, options: TimelineDataOptions = {},
) {
  if (!Number.isInteger(laneCount) || laneCount <= 0) throw new RangeError('laneCount must be a positive integer')
  const rowIds = uniqueIds(rows, 'row')
  const barIds = uniqueIds(bars, 'bar')
  uniqueIds(dependencies, 'dependency')
  for (const bar of bars) {
    checkRange(bar, true)
    if (bar.baseline) checkRange(bar.baseline, true)
    if (bar.baselines !== undefined) checkBaselines(bar)
    if (!rowIds.has(bar.rowId)) throw new Error('Unknown row for bar: ' + bar.id)
    const lane = bar.lane ?? 0
    if (!Number.isInteger(lane) || lane < 0 || lane >= laneCount) throw new RangeError('Invalid lane for bar: ' + bar.id)
    if (bar.progress !== undefined && (!Number.isFinite(bar.progress) || bar.progress < 0 || bar.progress > 1)) {
      throw new RangeError('Progress must be between zero and one: ' + bar.id)
    }
    if (bar.latestEnd !== undefined && (!Number.isFinite(bar.latestEnd) || bar.latestEnd < bar.end)) {
      throw new RangeError('latestEnd must be finite and not before the end: ' + bar.id)
    }
    if (bar.deadline !== undefined && !Number.isFinite(bar.deadline)) throw new RangeError('deadline must be finite: ' + bar.id)
    if (bar.description !== undefined && typeof bar.description !== 'string') throw new Error('description must be a string: ' + bar.id)
    if (bar.segments !== undefined) checkSegments(bar)
    if (bar.constraints !== undefined) checkConstraints(bar)
  }
  // Summary rows (rows with child rows) that a dependency may end at with `summaryDependencies`.
  const summaryIds = new Set<string>()
  if (options.summaryDependencies) for (const row of rows) if (row.parentId !== undefined) summaryIds.add(row.parentId)
  const known = (id: string) => barIds.has(id) || summaryIds.has(id)
  // The row of a dependency end: a bar's row, or the summary row itself.
  const barRows = summaryIds.size ? new Map(bars.map(bar => [bar.id, bar.rowId])) : undefined
  const rowParents = summaryIds.size ? new Map(rows.map(row => [row.id, row.parentId])) : undefined
  const rowOf = (id: string) => barRows!.get(id) ?? id
  /** Whether the summary row `summary` lies above `row`. The step limit ends the walk on a parent cycle. */
  const above = (summary: string, row: string) => {
    let id = rowParents!.get(row)
    for (let steps = 0; id !== undefined && steps < rows.length; steps++) {
      if (id === summary) return true
      id = rowParents!.get(id)
    }
    return false
  }
  for (const dependency of dependencies) {
    if (!known(dependency.from) || !known(dependency.to)) throw new Error('Unknown dependency endpoint: ' + dependency.id)
    if (dependency.from === dependency.to) {
      throw new Error('A dependency cannot link a bar to itself: ' + dependency.id + ' on bar ' + dependency.from)
    }
    // As in `scheduleTasks`, a summary cannot be linked with anything inside it.
    for (const [summary, other] of [[dependency.from, dependency.to], [dependency.to, dependency.from]] as const) {
      if (barIds.has(summary) || !summaryIds.has(summary) || !above(summary, rowOf(other))) continue
      throw new Error(`Dependency ${dependency.id} links summary row ${summary} with its own subtask ${other}`)
    }
    if (dependency.type && !isDependencyType(dependency.type)) throw new Error('Invalid dependency type: ' + dependency.id)
    const lag = dependency.lag
    if (lag !== undefined && (typeof lag !== 'number' || !Number.isFinite(lag))) throw new RangeError('Dependency lag must be finite: ' + dependency.id)
  }
}

/**
 * Default text of a dependency lag in GanttChart (`formatLag`) and `renderTimelineSvg`: a signed number of hours of a
 * millisecond lag, rounded to two decimals, such as `+2 h`, `+0.5 h` or `−1.25 h` (a lead, with U+2212 MINUS SIGN).
 * Charts in other time units should pass their own formatter. Throws a RangeError for a non-finite lag.
 */
export function formatDependencyLag(lag: number): string {
  if (typeof lag !== 'number' || !Number.isFinite(lag)) throw new RangeError('lag must be finite')
  return (lag < 0 ? '\u2212' : '+') + Math.round(Math.abs(lag) / 36_000) / 100 + ' h'
}


/** Build a stable preorder and validate that every row reaches a root. */
export function createTimelineRowTree<R extends TimelineRow>(rows: readonly R[]) {
  const ids = uniqueIds(rows, 'row')
  const roots: R[] = []
  const children = new Map<string, R[]>()
  for (const row of rows) {
    if (row.parentId === undefined) {
      roots.push(row)
      continue
    }
    if (!ids.has(row.parentId)) throw new Error('Unknown parent for row: ' + row.id)
    let group = children.get(row.parentId)
    if (!group) children.set(row.parentId, group = [])
    group.push(row)
  }
  const ordered: { row: R; depth: number; hasChildren: boolean; afterSubtree: number }[] = []
  const stack = roots.slice().reverse().map(row => ({ row, depth: 0 }))
  const ancestors: number[] = []
  while (stack.length) {
    const { row, depth } = stack.pop()!
    while (ancestors.length > depth) ordered[ancestors.pop()!]!.afterSubtree = ordered.length
    const group = children.get(row.id)
    ancestors.push(ordered.length)
    ordered.push({ row, depth, hasChildren: Boolean(group), afterSubtree: 0 })
    if (group) for (let i = group.length - 1; i >= 0; i--) stack.push({ row: group[i]!, depth: depth + 1 })
  }
  if (ordered.length !== rows.length) throw new Error('The timeline row hierarchy contains a cycle')
  while (ancestors.length) ordered[ancestors.pop()!]!.afterSubtree = ordered.length
  return ordered
}


/** Roll up descendant leaf bars. Explicit parent bars remain separate. */
export function summarizeTimelineRows(tree: ReturnType<typeof createTimelineRowTree>, bars: readonly TimelineBar[]): Map<string, TimelineSummary> {
  type Aggregate = { start: number; end: number; count: number; knownDuration: number; completed: number }
  const leaves = new Set(tree.filter(item => !item.hasChildren).map(item => item.row.id))
  const totals = new Map<string, Aggregate>()
  function merge(id: string, value: Aggregate) {
    const total = totals.get(id)
    if (!total) {
      totals.set(id, { ...value })
      return
    }
    total.start = Math.min(total.start, value.start)
    total.end = Math.max(total.end, value.end)
    total.count += value.count
    total.knownDuration += value.knownDuration
    total.completed += value.completed
  }
  for (const bar of bars) {
    if (!leaves.has(bar.rowId)) continue
    const knownDuration = bar.progress === undefined ? 0 : bar.end - bar.start
    merge(bar.rowId, { start: bar.start, end: bar.end, count: 1, knownDuration, completed: knownDuration * (bar.progress ?? 0) })
  }
  for (let index = tree.length - 1; index >= 0; index--) {
    const { row } = tree[index]!
    const total = totals.get(row.id)
    if (total && row.parentId !== undefined) merge(row.parentId, total)
  }
  return new Map([...totals].map(([id, value]) => [id, {
    start: value.start, end: value.end, count: value.count,
    progress: value.knownDuration ? value.completed / value.knownDuration : undefined,
  }]))
}

/** Derive the dependency type joining a source bar end to a target bar end. */
export function dependencyTypeForEnds(from: TimelineBarEnd, to: TimelineBarEnd): TimelineDependencyType {
  const letter = (end: TimelineBarEnd) => {
    if (end !== 'start' && end !== 'finish') throw new RangeError('A bar end must be start or finish')
    return end === 'start' ? 'S' : 'F'
  }
  return (letter(from) + letter(to)) as TimelineDependencyType
}

/** The bar ends a dependency type joins. FS joins the source finish to the target start. */
export function dependencyEndsForType(type: TimelineDependency['type'] = 'FS'): { from: TimelineBarEnd; to: TimelineBarEnd } {
  if (!isDependencyType(type)) throw new Error('Invalid dependency type')
  return { from: type[0] === 'S' ? 'start' : 'finish', to: type[1] === 'S' ? 'start' : 'finish' }
}

/**
 * Move several intervals by one snapped displacement. The displacement is clamped so every interval stays inside
 * bounds, which preserves the relative offsets of the group.
 */
export function moveTimeRanges(ranges: readonly TimeRange[], delta: number, step: number, bounds: TimeRange): TimeRange[] {
  checkRange(bounds)
  if (!Number.isFinite(delta) || !Number.isFinite(step) || step <= 0) {
    throw new RangeError('Moving requires a finite displacement and a positive snap')
  }
  let min = -Infinity, max = Infinity
  for (const range of ranges) {
    checkRange(range, true)
    if (range.start < bounds.start || range.end > bounds.end) throw new RangeError('Editable intervals must fit inside editBounds')
    min = Math.max(min, bounds.start - range.start)
    max = Math.min(max, bounds.end - range.end)
  }
  const steps = Math.sign(delta) * Math.round(Math.abs(delta) / step)
  const shift = ranges.length ? Math.max(min, Math.min(max, steps * step)) : 0
  // A fractional step is applied on exact scaled integers, see decimalScale; integer steps keep plain arithmetic.
  const values = Number.isInteger(step) ? [] : [step, bounds.start, bounds.end, ...ranges.flatMap(range => [range.start, range.end])]
  const scale = values.length ? decimalScale(step, values.slice(1)) : 1
  if (scale !== 1) {
    const [unit, low, high, ...ends] = scaled(scale, values) as number[]
    let scaledMin = -Infinity, scaledMax = Infinity
    for (let i = 0; i < ends.length; i += 2) {
      scaledMin = Math.max(scaledMin, low! - ends[i]!)
      scaledMax = Math.min(scaledMax, high! - ends[i + 1]!)
    }
    const scaledShift = Math.max(scaledMin, Math.min(scaledMax, steps * unit!))
    const moved = ends.map(value => value + scaledShift)
    if (Number.isSafeInteger(steps * unit!) && moved.every(Number.isSafeInteger)) {
      return ranges.map((_, index) => ({ start: moved[2 * index]! / scale, end: moved[2 * index + 1]! / scale }))
    }
  }
  return ranges.map(range => ({ start: range.start + shift, end: range.end + shift }))
}

/**
 * Remove bars and every dependency that starts or ends at one of them, for example to accept a GanttChart
 * `bars-delete` proposal. Returns new arrays and leaves the inputs unchanged. Every ID must name a bar in `bars`.
 */
export function removeTimelineBars<B extends TimelineBar, D extends TimelineDependency>(
  bars: readonly B[], dependencies: readonly D[], ids: Iterable<string>,
): { bars: B[]; dependencies: D[] } {
  const known = new Set(bars.map(bar => bar.id))
  const removed = new Set<string>()
  for (const id of ids) {
    if (!known.has(id)) throw new Error('Unknown bar: ' + id)
    removed.add(id)
  }
  return {
    bars: bars.filter(bar => !removed.has(bar.id)),
    dependencies: dependencies.filter(dependency => !removed.has(dependency.from) && !removed.has(dependency.to)),
  }
}

export interface AssignLanesOptions {
  /**
   * Keep each bar's current `lane` (default 0) unless it conflicts with a bar placed before it in input order; only
   * conflicting bars move, to the lowest free lane. Without it, lanes are assigned first-fit in start order.
   */
  keepLanes?: boolean
}

export interface AssignLanesResult<B extends TimelineBar = TimelineBar> {
  /** New bar objects in input order, each with `lane` set. */
  bars: B[]
  /** The largest lane count of any row, at least 1. Pass it as GanttChart `laneCount`. */
  laneCount: number
  /** Lanes used by each row that has bars: the highest lane plus one. */
  rowLaneCounts: Map<string, number>
}

/** Index of the first interval in a start-sorted lane that starts after `time`. */
function startsAfter(lane: readonly TimeRange[], time: number) {
  return firstIndex(lane.length, index => lane[index]!.start > time)
}

/**
 * Assign lanes so that the bars of one row never overlap within a lane. The default first-fit pass in start order
 * (ties keep input order) uses the fewest lanes possible. `keepLanes` keeps stable lanes for interactive edits.
 * Returns new bar objects and leaves the input unchanged.
 */
export function assignLanes<B extends TimelineBar>(bars: readonly B[], options: AssignLanesOptions = {}): AssignLanesResult<B> {
  const rows = new Map<string, number[]>()
  bars.forEach((bar, index) => {
    checkRange(bar, true)
    if (bar.lane !== undefined && (!Number.isInteger(bar.lane) || bar.lane < 0)) throw new RangeError('Invalid lane for bar: ' + bar.id)
    let indexes = rows.get(bar.rowId)
    if (!indexes) rows.set(bar.rowId, indexes = [])
    indexes.push(index)
  })
  const lanes: number[] = new Array(bars.length)
  const rowLaneCounts = new Map<string, number>()
  for (const [rowId, indexes] of rows) {
    let count = 0
    if (options.keepLanes) {
      // Each lane holds its placed intervals sorted by start; they never conflict, so only the neighbours of a new
      // interval can conflict with it.
      const placed: TimeRange[][] = []
      const fits = (lane: number, bar: TimeRange) => {
        const items = placed[lane]
        if (!items) return true
        const next = startsAfter(items, bar.start)
        return !(next > 0 && intervalsMeet(items[next - 1]!, bar)) && !(next < items.length && intervalsMeet(items[next]!, bar))
      }
      for (const index of indexes) {
        const bar = bars[index]!
        let lane = bar.lane ?? 0
        if (!fits(lane, bar)) {
          lane = 0
          while (!fits(lane, bar)) lane++
        }
        const items = placed[lane] ??= []
        items.splice(startsAfter(items, bar.start), 0, bar)
        lanes[index] = lane
        count = Math.max(count, lane + 1)
      }
    } else {
      // Placed in start order, a lane is free when its last interval does not conflict with the next one.
      const order = indexes.slice().sort((a, b) => bars[a]!.start - bars[b]!.start || a - b)
      const last: TimeRange[] = []
      for (const index of order) {
        const bar = bars[index]!
        let lane = 0
        while (lane < last.length && intervalsMeet(last[lane]!, bar)) lane++
        last[lane] = bar
        lanes[index] = lane
      }
      count = last.length
    }
    rowLaneCounts.set(rowId, count)
  }
  let laneCount = 1
  for (const count of rowLaneCounts.values()) laneCount = Math.max(laneCount, count)
  return { bars: bars.map((bar, index) => ({ ...bar, lane: lanes[index]! })), laneCount, rowLaneCounts }
}

const minuteMs = 60_000
const dayMs = 86_400_000

function pad(value: number) {
  return String(value).padStart(2, '0')
}

const hourMs = 3_600_000
const maxCalendarBands = 10000
/** Default `Intl.DateTimeFormat` options of locale-aware `calendarBands` labels, by unit. */
const calendarLabelFormats: Readonly<Record<CalendarBandUnit, Intl.DateTimeFormatOptions>> = {
  hour: { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' },
  day: { year: 'numeric', month: 'short', day: 'numeric' },
  week: { year: 'numeric', month: 'short', day: 'numeric' },
  month: { year: 'numeric', month: 'long' },
  year: { year: 'numeric' },
}

/** A band boundary: the instant and the local wall time there, expressed as if it were UTC. */
interface BandBoundary {
  instant: number
  wall: number
}

/**
 * Build one header band level from calendar units in epoch milliseconds. Bands are aligned to a fixed UTC offset or
 * to local time in an IANA `timeZone`, clipped to the range and labelled from their unclipped boundaries: ISO-like by
 * default, with `Intl.DateTimeFormat` when `locale` or `labelFormat` is set, or by a custom `label` function.
 *
 * With `timeZone`, day, week, month and year bands start at the first instant of their local date: local midnight,
 * or the end of a daylight-saving gap that skips midnight. A local date that the zone skips entirely has no band.
 * Hour bands start where local time reaches a multiple of `step` hours counted from local midnight, so a 23-hour day
 * has 23 one-hour bands and a 25-hour day 25, with the repeated hour twice. A grid hour inside a gap starts its band at
 * the end of the gap, so its band is shorter (and absent when the gap ends on the next grid hour).
 */
export function calendarBands(range: TimeRange, unit: CalendarBandUnit, options: CalendarBandOptions = {}): TimelineBand[] {
  checkRange(range)
  const { utcOffsetMinutes, timeZone, step = 1, weekStartsOn = 1, label, locale, labelFormat } = options
  if (!['hour', 'day', 'week', 'month', 'year'].includes(unit)) throw new RangeError('Unknown calendar band unit: ' + unit)
  if (timeZone !== undefined && utcOffsetMinutes !== undefined) {
    throw new RangeError('Specify either timeZone or utcOffsetMinutes, not both')
  }
  const fixedOffset = utcOffsetMinutes ?? 0
  if (!Number.isInteger(fixedOffset) || Math.abs(fixedOffset) > maxUtcOffsetMinutes) {
    throw new RangeError(`utcOffsetMinutes must be an integer between -${maxUtcOffsetMinutes} and ${maxUtcOffsetMinutes}`)
  }
  if (!Number.isSafeInteger(step) || step <= 0 || (unit === 'hour' && 24 % step !== 0)) {
    throw new RangeError('step must be a positive integer (a divisor of 24 for hours)')
  }
  if (!Number.isInteger(weekStartsOn) || weekStartsOn < 0 || weekStartsOn > 6) throw new RangeError('weekStartsOn must be 0 to 6')
  const format = timeZone === undefined ? undefined : zoneFormat(timeZone)
  // Locale-aware labels format the local wall time of the band start, which is expressed as if it were UTC.
  const intlLabel = !label && (locale !== undefined || labelFormat !== undefined)
    ? cachedDateFormat(locale ?? 'en-US', { ...(labelFormat ?? calendarLabelFormats[unit]), timeZone: 'UTC' })
    : undefined
  const offset = fixedOffset * minuteMs
  // Zone rules are looked up up to two days around an instant, so it must stay inside the Date range.
  const checkZoneTime = (time: number) => {
    if (!Number.isFinite(new Date(time - 2 * dayMs).getTime()) || !Number.isFinite(new Date(time + 2 * dayMs).getTime())) {
      throw new RangeError('Calendar bands exceed the supported date range')
    }
  }
  // Boundaries are computed as local wall times expressed as if they were UTC: civil fields are read and written with
  // UTC getters and setters.
  const toInstant = (wall: number) => {
    if (!format) return wall - offset
    checkZoneTime(wall)
    return zonedInstant(format, wall)
  }
  const offsetAt = (instant: number) => format ? zoneOffset(format, instant) : offset
  // setUTCFullYear keeps years 0 to 99 literal, unlike Date.UTC, and normalizes overflowing months, days and hours.
  const fromCivil = (year: number, month: number, day = 1, hour = 0) => {
    const date = new Date(0)
    date.setUTCFullYear(year, month, day)
    date.setUTCHours(hour, 0, 0, 0)
    return date.getTime()
  }
  const modulo = (value: number) => ((value % step) + step) % step
  if (format) {
    checkZoneTime(range.start)
    checkZoneTime(range.end)
  }
  const startWall = range.start + offsetAt(range.start)
  // Multi-unit bands follow a fixed grid counted from the Unix epoch (days, weeks, months) or from year 0 (years), so
  // overlapping ranges agree on their boundaries whatever their starts.
  function first(): number {
    const date = new Date(startWall)
    const year = date.getUTCFullYear(), month = date.getUTCMonth(), day = date.getUTCDate()
    if (unit === 'hour') return fromCivil(year, month, day, date.getUTCHours() - date.getUTCHours() % step)
    if (unit === 'day') {
      const midnight = fromCivil(year, month, day)
      const index = Math.floor(midnight / dayMs)
      return midnight - modulo(index) * dayMs
    }
    if (unit === 'week') {
      const weekStart = fromCivil(year, month, day - ((date.getUTCDay() - weekStartsOn + 7) % 7))
      // Week 0 is the week containing 1970-01-01, a Thursday.
      const epochWeekStart = -((4 - weekStartsOn + 7) % 7)
      const index = Math.round((Math.round(weekStart / dayMs) - epochWeekStart) / 7)
      return weekStart - modulo(index) * 7 * dayMs
    }
    if (unit === 'month') return fromCivil(year, month - modulo((year - 1970) * 12 + month))
    return fromCivil(year - modulo(year), 0)
  }
  function next(wall: number): number {
    const date = new Date(wall)
    const year = date.getUTCFullYear(), month = date.getUTCMonth(), day = date.getUTCDate()
    if (unit === 'hour') return fromCivil(year, month, day, date.getUTCHours() + step)
    if (unit === 'day') return fromCivil(year, month, day + step)
    if (unit === 'week') return fromCivil(year, month, day + 7 * step)
    if (unit === 'month') return fromCivil(year, month + step)
    return fromCivil(year + step, 0)
  }
  function defaultLabel(wall: number) {
    if (intlLabel) return intlLabel.format(wall)
    const date = new Date(wall)
    const ymd = String(date.getUTCFullYear()).padStart(4, '0') + '-' + pad(date.getUTCMonth() + 1) + '-' + pad(date.getUTCDate())
    if (unit === 'hour') return pad(date.getUTCHours()) + ':' + pad(date.getUTCMinutes())
    if (unit === 'month') return ymd.slice(0, 7)
    if (unit === 'year') return ymd.slice(0, 4)
    return ymd
  }
  function localTime(start: BandBoundary): CalendarBandLocalTime {
    const date = new Date(start.wall)
    return {
      year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), hour: date.getUTCHours(),
      minute: date.getUTCMinutes(), weekday: date.getUTCDay(), utcOffsetMinutes: (start.wall - start.instant) / minuteMs, timeZone,
    }
  }
  const bands: TimelineBand[] = []
  const push = (start: BandBoundary, end: number) => {
    if (end <= range.start || end <= start.instant || start.instant >= range.end) return
    if (bands.length >= maxCalendarBands) throw new RangeError('Too many calendar bands; increase the unit or step')
    bands.push({
      start: Math.max(start.instant, range.start), end: Math.min(end, range.end),
      label: label ? label(start.instant, end, localTime(start)) : defaultLabel(start.wall),
    })
  }
  if (format && unit === 'hour') {
    zonedHourBands(format, Math.floor(startWall / dayMs) * dayMs, range.end, step, toInstant, push)
    return bands
  }
  let wall = first()
  for (let start = toInstant(wall); start < range.end;) {
    const nextWall = next(wall)
    const end = Number.isFinite(nextWall) ? toInstant(nextWall) : Number.NaN
    if (!Number.isFinite(end) || end < start || (!format && end === start)) {
      throw new RangeError('Calendar bands exceed the supported date range')
    }
    // With a time zone, the band starts at its first local instant, which differs from `wall` after a gap.
    push({ instant: start, wall: format ? start + zoneOffset(format, start) : wall }, end)
    wall = nextWall
    start = end
  }
  return bands
}

/**
 * Hour bands in a time zone, one local date at a time from `dayWall`. Within a date the offset changes at most once,
 * at `transition`: a grid wall time before it maps with the earlier offset, one after it with the later offset, both
 * when it is repeated and to the transition when it is skipped.
 */
function zonedHourBands(
  format: Intl.DateTimeFormat, dayWall: number, rangeEnd: number, step: number,
  toInstant: (wall: number) => number, push: (start: BandBoundary, end: number) => void,
) {
  let dayStart = toInstant(dayWall)
  let startOffset = zoneOffset(format, dayStart)
  while (dayStart < rangeEnd) {
    const nextWall = dayWall + dayMs
    const nextStart = toInstant(nextWall)
    const nextOffset = zoneOffset(format, nextStart)
    const transition = nextOffset === startOffset ? Infinity : zoneTransition(format, dayStart, nextStart, startOffset)
    const boundaries: BandBoundary[] = [{ instant: dayStart, wall: dayStart + startOffset }]
    const add = (instant: number, zone: number) => {
      if (instant >= dayStart && instant < nextStart) boundaries.push({ instant, wall: instant + zone })
    }
    for (let hour = step; hour < 24; hour += step) {
      const wall = dayWall + hour * hourMs
      const early = wall - startOffset, late = wall - nextOffset
      const before = early < transition, after = late >= transition && transition !== Infinity
      if (before) add(early, startOffset)
      if (after) add(late, nextOffset)
      if (!before && !after) add(transition, nextOffset)
    }
    boundaries.sort((a, b) => a.instant - b.instant)
    for (let index = 0; index < boundaries.length; index++) {
      const boundary = boundaries[index]!, following = boundaries[index + 1]
      if (following && following.instant === boundary.instant) continue
      push(boundary, following?.instant ?? nextStart)
    }
    dayWall = nextWall
    dayStart = nextStart
    startOffset = nextOffset
  }
}

export interface ResourceLoadHistogram {
  segments: TimelineLoadSegment[]
  /** Largest load or capacity among the resource's segments; zero when every segment is empty. */
  peak: number
}

/**
 * Group load segments by resource for a histogram band. Segments are sorted by start and must not overlap within a
 * resource. When `resourceIds` is supplied, every segment must reference one of them and each ID gets an entry.
 */
export function resourceLoadHistogram(
  segments: readonly TimelineLoadSegment[], resourceIds?: Iterable<string>,
): Map<string, ResourceLoadHistogram> {
  const known = resourceIds ? new Set(resourceIds) : undefined
  const groups = new Map<string, ResourceLoadHistogram>()
  for (const id of known ?? []) groups.set(id, { segments: [], peak: 0 })
  for (const segment of segments) {
    checkRange(segment)
    if (!segment.resourceId || (known && !known.has(segment.resourceId))) {
      throw new Error('Unknown resource for load segment: ' + segment.resourceId)
    }
    if (!Number.isFinite(segment.load) || !Number.isFinite(segment.capacity) || segment.load < 0 || segment.capacity < 0) {
      throw new RangeError('Load and capacity must be finite and nonnegative: ' + segment.resourceId)
    }
    let group = groups.get(segment.resourceId)
    if (!group) groups.set(segment.resourceId, group = { segments: [], peak: 0 })
    group.segments.push(segment)
    group.peak = Math.max(group.peak, segment.load, segment.capacity)
  }
  for (const [id, group] of groups) {
    group.segments.sort((a, b) => a.start - b.start)
    for (let i = 1; i < group.segments.length; i++) {
      if (group.segments[i]!.start < group.segments[i - 1]!.end) throw new RangeError('Overlapping load segments for resource: ' + id)
    }
  }
  return groups
}
