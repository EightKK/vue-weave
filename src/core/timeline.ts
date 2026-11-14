import type {
  CalendarBandOptions, CalendarBandUnit, TimelineBand, TimelineBar, TimelineBarEnd, TimelineDependency, TimelineDependencyType,
  TimelineLoadSegment, TimelineRow, TimelineSummary,
} from './types.js'

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

export function timeTicks(window: TimeRange, step: number, anchor = 0): number[] {
  checkRange(window, true)
  if (!Number.isFinite(anchor) || !Number.isFinite(step) || step <= 0) throw new RangeError('Invalid tick step or anchor')
  const first = Math.ceil((window.start - anchor) / step)
  const last = Math.floor((window.end - anchor) / step)
  const count = Math.max(0, last - first + 1)
  if (count > 10000) throw new RangeError('Too many ticks; increase the tick step or reduce the visible window')
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

export function intersectsWindow(bar: TimeRange, window: TimeRange) {
  if (bar.start === bar.end) return bar.start >= window.start && bar.start < window.end
  return bar.end > window.start && bar.start < window.end
}

/** Snap displacement relative to the original interval, preserving off-grid starts. */
export function editTimeRange(
  range: TimeRange, mode: EditMode, delta: number, step: number, bounds: TimeRange, minDuration = step,
): TimeRange {
  checkRange(range, true)
  checkRange(bounds)
  if (!Number.isFinite(delta) || !Number.isFinite(step) || step <= 0 || !Number.isFinite(minDuration) || minDuration <= 0) {
    throw new RangeError('Editing requires a finite displacement and positive snap/minimum duration')
  }
  if (!['move', 'start', 'end'].includes(mode)) throw new RangeError('Unknown edit mode')
  if (range.start < bounds.start || range.end > bounds.end) throw new RangeError('Editable intervals must fit inside editBounds')
  const duration = range.end - range.start
  if (mode !== 'move' && duration < minDuration) throw new RangeError('The interval is shorter than minDuration')
  const snapped = Math.sign(delta) * Math.round(Math.abs(delta) / step) * step
  const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))
  if (mode === 'move') {
    const start = clamp(range.start + snapped, bounds.start, bounds.end - duration)
    return { start, end: start + duration }
  }
  if (mode === 'start') return { start: clamp(range.start + snapped, bounds.start, range.end - minDuration), end: range.end }
  return { start: range.start, end: clamp(range.end + snapped, range.start + minDuration, bounds.end) }
}

export function dependencyPath(x1: number, y1: number, x2: number, y2: number) {
  if (x1 < x2) {
    const middle = (x1 + x2) / 2
    return `M ${x1} ${y1} H ${middle} V ${y2} H ${x2}`
  }
  const middleY = (y1 + y2) / 2 + (y1 === y2 ? 14 : 0)
  return `M ${x1} ${y1} h 10 V ${middleY} H ${x2 - 10} V ${y2} H ${x2}`
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

/** Validate once per input change. IDs are unique across the entire chart. */
export function validateTimelineData(
  rows: readonly TimelineRow[], bars: readonly TimelineBar[],
  dependencies: readonly TimelineDependency[] = [], laneCount = 1,
) {
  if (!Number.isInteger(laneCount) || laneCount <= 0) throw new RangeError('laneCount must be a positive integer')
  function uniqueIds(items: readonly { id: string }[], kind: string) {
    const ids = new Set<string>()
    for (const item of items) {
      if (!item.id || ids.has(item.id)) throw new Error('Invalid or duplicate ' + kind + ' ID: ' + item.id)
      ids.add(item.id)
    }
    return ids
  }
  const rowIds = uniqueIds(rows, 'row')
  const barIds = uniqueIds(bars, 'bar')
  uniqueIds(dependencies, 'dependency')
  for (const bar of bars) {
    checkRange(bar, true)
    if (bar.baseline) checkRange(bar.baseline, true)
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
    if (bar.segments !== undefined) checkSegments(bar)
  }
  for (const dependency of dependencies) {
    if (!barIds.has(dependency.from) || !barIds.has(dependency.to)) throw new Error('Unknown dependency endpoint: ' + dependency.id)
    if (dependency.type && !['FS', 'SS', 'FF', 'SF'].includes(dependency.type)) throw new Error('Invalid dependency type')
  }
}


/** Build a stable preorder and validate that every row reaches a root. */
export function createTimelineRowTree(rows: readonly TimelineRow[]) {
  const ids = new Set(rows.map(row => row.id))
  if (ids.size !== rows.length || ids.has('')) throw new Error('Invalid or duplicate row IDs')
  const roots: TimelineRow[] = []
  const children = new Map<string, TimelineRow[]>()
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
  const ordered: { row: TimelineRow; depth: number; hasChildren: boolean; afterSubtree: number }[] = []
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
  if (!['FS', 'SS', 'FF', 'SF'].includes(type)) throw new Error('Invalid dependency type')
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
  const snapped = Math.sign(delta) * Math.round(Math.abs(delta) / step) * step
  const shift = ranges.length ? Math.max(min, Math.min(max, snapped)) : 0
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

/**
 * Whether two intervals of one row may not share a lane. Bars are half-open, so touching bars fit in one lane; a
 * milestone conflicts with every bar that contains its time and with milestones at the same time.
 */
function lanesConflict(a: TimeRange, b: TimeRange) {
  const pointA = a.start === a.end, pointB = b.start === b.end
  if (pointA && pointB) return a.start === b.start
  if (pointA) return b.start <= a.start && a.start < b.end
  if (pointB) return a.start <= b.start && b.start < a.end
  return a.start < b.end && b.start < a.end
}

/** Index of the first interval in a start-sorted lane that starts after `time`. */
function startsAfter(lane: readonly TimeRange[], time: number) {
  let low = 0, high = lane.length
  while (low < high) {
    const middle = (low + high) >>> 1
    if (lane[middle]!.start > time) high = middle
    else low = middle + 1
  }
  return low
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
        return !(next > 0 && lanesConflict(items[next - 1]!, bar)) && !(next < items.length && lanesConflict(items[next]!, bar))
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
        while (lane < last.length && lanesConflict(last[lane]!, bar)) lane++
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

/**
 * Build one header band level from calendar units in epoch milliseconds. Bands are aligned to a fixed UTC offset,
 * clipped to the range and labelled from their unclipped boundaries.
 */
export function calendarBands(range: TimeRange, unit: CalendarBandUnit, options: CalendarBandOptions = {}): TimelineBand[] {
  checkRange(range)
  const { utcOffsetMinutes = 0, step = 1, weekStartsOn = 1, label } = options
  if (!['hour', 'day', 'week', 'month', 'year'].includes(unit)) throw new RangeError('Unknown calendar band unit: ' + unit)
  if (!Number.isInteger(utcOffsetMinutes) || Math.abs(utcOffsetMinutes) > 18 * 60) {
    throw new RangeError('utcOffsetMinutes must be an integer between -1080 and 1080')
  }
  if (!Number.isSafeInteger(step) || step <= 0 || (unit === 'hour' && 24 % step !== 0)) {
    throw new RangeError('step must be a positive integer (a divisor of 24 for hours)')
  }
  if (!Number.isInteger(weekStartsOn) || weekStartsOn < 0 || weekStartsOn > 6) throw new RangeError('weekStartsOn must be 0 to 6')
  const offset = utcOffsetMinutes * minuteMs
  // Civil fields are read with UTC getters from shifted instants.
  const civil = (time: number) => new Date(time + offset)
  const fromCivil = (year: number, month: number, day = 1, hour = 0) => Date.UTC(year, month, day, hour) - offset
  function first(): number {
    const date = civil(range.start)
    const year = date.getUTCFullYear(), month = date.getUTCMonth(), day = date.getUTCDate()
    if (unit === 'hour') return fromCivil(year, month, day, date.getUTCHours() - date.getUTCHours() % step)
    if (unit === 'day') {
      const midnight = fromCivil(year, month, day)
      const index = Math.floor((midnight + offset) / dayMs)
      return midnight - (((index % step) + step) % step) * dayMs
    }
    if (unit === 'week') return fromCivil(year, month, day - ((date.getUTCDay() - weekStartsOn + 7) % 7))
    if (unit === 'month') return fromCivil(year, month - month % step)
    return fromCivil(year - ((year % step) + step) % step, 0)
  }
  function next(time: number): number {
    const date = civil(time)
    const year = date.getUTCFullYear(), month = date.getUTCMonth(), day = date.getUTCDate()
    if (unit === 'hour') return fromCivil(year, month, day, date.getUTCHours() + step)
    if (unit === 'day') return fromCivil(year, month, day + step)
    if (unit === 'week') return fromCivil(year, month, day + 7 * step)
    if (unit === 'month') return fromCivil(year, month + step)
    return fromCivil(year + step, 0)
  }
  function defaultLabel(start: number) {
    const date = civil(start)
    const ymd = String(date.getUTCFullYear()).padStart(4, '0') + '-' + pad(date.getUTCMonth() + 1) + '-' + pad(date.getUTCDate())
    if (unit === 'hour') return pad(date.getUTCHours()) + ':' + pad(date.getUTCMinutes())
    if (unit === 'month') return ymd.slice(0, 7)
    if (unit === 'year') return ymd.slice(0, 4)
    return ymd
  }
  const bands: TimelineBand[] = []
  for (let start = first(); start < range.end;) {
    const end = next(start)
    if (!Number.isFinite(end) || end <= start) throw new RangeError('Calendar bands exceed the supported date range')
    if (end > range.start) {
      if (bands.length >= 10000) throw new RangeError('Too many calendar bands; increase the unit or step')
      bands.push({ start: Math.max(start, range.start), end: Math.min(end, range.end), label: label ? label(start, end) : defaultLabel(start) })
    }
    start = end
  }
  return bands
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
      if (group.segments[i]!.start < group.segments[i - 1]!.end) throw new Error('Overlapping load segments for resource: ' + id)
    }
  }
  return groups
}
