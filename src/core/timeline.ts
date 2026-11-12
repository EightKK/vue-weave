import type { TimelineBar, TimelineDependency, TimelineRow, TimelineSummary } from './types.js'

export interface TimeRange {
  start: number
  end: number
}

export type EditMode = 'move' | 'start' | 'end'

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
