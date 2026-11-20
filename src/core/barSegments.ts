// Internal geometry shared by GanttChart and renderTimelineSvg. Not part of the public entry points.
import { baselineVariance, timelineBaseline, timelineBaselineIds, timelineBaselineLimit, type TimeRange } from './timeline.js'
import type { TimelineBand, TimelineBar, TimelineLoadRow, TimelineLoadSegment, TimelineMarker, TimelineMarkerRange } from './types.js'
import { checkId, uniqueIds, withContext } from './ids.js'

export interface SegmentPiece extends TimeRange {
  /** Completed fraction of this piece, between 0 and 1. */
  filled: number
}

/**
 * Split a segmented bar into its work pieces and the gaps between and around them. `progress` is distributed over
 * working time, so a half-complete bar fills the first half of its work, not of its elapsed span.
 */
export function segmentPieces(range: TimeRange, segments: readonly TimeRange[], progress?: number) {
  let total = 0
  for (const segment of segments) total += segment.end - segment.start
  let remaining = (progress ?? 0) * total
  let cursor = range.start
  const pieces: SegmentPiece[] = []
  const gaps: TimeRange[] = []
  for (const segment of segments) {
    if (segment.start > cursor) gaps.push({ start: cursor, end: segment.start })
    const length = segment.end - segment.start
    const done = Math.max(0, Math.min(length, remaining))
    remaining -= done
    pieces.push({ start: segment.start, end: segment.end, filled: length > 0 ? done / length : 0 })
    cursor = segment.end
  }
  if (cursor < range.end) gaps.push({ start: cursor, end: range.end })
  return { pieces, gaps }
}

/**
 * The time at which `progress` (0 to 1) of the work is done: linear over the bar, or over working time when the bar
 * has segments, matching how `segmentPieces` fills them.
 */
export function progressTime(range: TimeRange, segments: readonly TimeRange[] | undefined, progress: number) {
  if (!segments?.length) return range.start + (range.end - range.start) * progress
  let total = 0
  for (const segment of segments) total += segment.end - segment.start
  let remaining = progress * total
  for (const segment of segments) {
    const length = segment.end - segment.start
    if (remaining <= length) return segment.start + remaining
    remaining -= length
  }
  return segments[segments.length - 1]!.end
}

/** The inverse of `progressTime`: completed fraction of the work at `time`, clamped to 0..1. */
export function progressAt(range: TimeRange, segments: readonly TimeRange[] | undefined, time: number) {
  if (!segments?.length) {
    const duration = range.end - range.start
    return duration > 0 ? Math.max(0, Math.min(1, (time - range.start) / duration)) : 0
  }
  let total = 0, done = 0
  for (const segment of segments) {
    const length = segment.end - segment.start
    total += length
    done += Math.max(0, Math.min(length, time - segment.start))
  }
  return total > 0 ? done / total : 0
}

/**
 * Snap a progress value to `step`, clamped to 0..1. Exactly 1 is also a candidate, so a step that does not divide 1
 * can still reach completion. Floating-point noise from the multiplication is removed.
 */
export function snapProgress(value: number, step: number) {
  let snapped = Math.round(value / step) * step
  if (Math.abs(1 - value) < Math.abs(value - snapped)) snapped = 1
  return Math.max(0, Math.min(1, Math.round(snapped * 1e9) / 1e9))
}

/** Validate non-working periods: finite endpoints with start < end. Overlaps are allowed. */
export function checkNonWorkingPeriods(periods: readonly TimeRange[] | undefined) {
  for (const period of periods ?? []) {
    if (!Number.isFinite(period.start) || !Number.isFinite(period.end) || period.end <= period.start) {
      throw new RangeError('nonWorkingPeriods must have finite endpoints with start < end')
    }
  }
}

/**
 * Validate extra timeline columns, as `renderTimelineSvg` and GanttChart do: IDs that are non-empty strings and unique
 * (`Invalid column ID: <value>`, `Duplicate column ID: <id>`) and widths that are finite and positive
 * (`RangeError: Invalid timeline column width: <id>`). Returns the total width.
 */
export function checkTimelineColumns(columns: readonly { readonly id: string; readonly width: number }[]): number {
  const ids = new Set<string>()
  let total = 0
  for (const column of columns) {
    checkId('column', column.id, ids)
    if (!Number.isFinite(column.width) || column.width <= 0) throw new RangeError('Invalid timeline column width: ' + column.id)
    total += column.width
  }
  return total
}

/**
 * Validate header bands, then markers, as `renderTimelineSvg` and GanttChart do: each band level finite, ordered and
 * nonoverlapping (RangeError), marker IDs non-empty and unique (Error) and marker times finite (RangeError).
 */
export function checkBandsAndMarkers(
  bands: readonly (readonly TimelineBand[])[] | undefined, markers: readonly TimelineMarker[] | undefined,
) {
  for (const level of bands ?? []) {
    let previousEnd = -Infinity
    for (const band of level) {
      if (!Number.isFinite(band.start) || !Number.isFinite(band.end) || band.end <= band.start || band.start < previousEnd) {
        throw new RangeError('Timeline bands must be finite, ordered and nonoverlapping')
      }
      previousEnd = band.end
    }
  }
  const markerIds = new Set<string>()
  for (const item of markers ?? []) {
    checkId('marker', item.id, markerIds)
    if (!Number.isFinite(item.time)) throw new RangeError('Invalid timeline marker: ' + item.id)
  }
}

/**
 * Validate load rows, as `renderTimelineSvg` and GanttChart do: without load rows there may be no load segments;
 * otherwise the row IDs must be non-empty and unique and `loadRowHeight` at least 16. Returns the load row IDs, or
 * undefined when there are no load rows.
 */
export function checkLoadRows(
  loadRows: readonly TimelineLoadRow[] | undefined, loadSegments: readonly TimelineLoadSegment[] | undefined, loadRowHeight: number,
): Set<string> | undefined {
  if (!loadRows?.length) {
    if (loadSegments?.length) throw new Error('loadSegments require loadRows')
    return undefined
  }
  const ids = uniqueIds(loadRows, 'load row')
  if (!Number.isFinite(loadRowHeight) || loadRowHeight < 16) throw new RangeError('loadRowHeight must be at least 16')
  return ids
}

/**
 * Validate `markerRanges`: unique non-empty IDs, finite endpoints with start < end (a zero-width range is rejected; a
 * point in time is a `TimelineMarker`) and, when `rowIds` is given, row IDs that `knownRows` contains.
 */
export function checkMarkerRanges(ranges: readonly TimelineMarkerRange[] | undefined, knownRows: ReadonlySet<string>) {
  const ids = new Set<string>()
  for (const range of ranges ?? []) {
    checkId('marker range', range.id, ids)
    if (typeof range.start !== 'number' || typeof range.end !== 'number' || !Number.isFinite(range.start)
      || !Number.isFinite(range.end) || range.end <= range.start) {
      throw new RangeError('A marker range must have finite endpoints with start < end: ' + range.id)
    }
    for (const rowId of range.rowIds ?? []) {
      if (!knownRows.has(rowId)) throw new Error('Unknown row for marker range ' + range.id + ': ' + rowId)
    }
  }
}

/**
 * Time of the progress point at which a bar kinks the progress line, or undefined when it does not: a milestone, a
 * bar that is complete by the status date, and a bar that has not started by it and has no progress keep the line
 * straight. Other bars kink it at their progress point (`progressTime`), behind or ahead of the status date.
 */
export function progressLineTime(
  bar: TimeRange & { progress?: number; segments?: readonly TimeRange[] }, statusDate: number,
): number | undefined {
  if (bar.start === bar.end) return undefined
  const progress = bar.progress ?? 0
  if (!(bar.start < statusDate && progress < 1) && !(progress > 0 && bar.end > statusDate)) return undefined
  return progressTime(bar, bar.segments, progress)
}

/**
 * Points of a progress line: a vertical line at `x` from `top` to `bottom` that turns to each kink's x at its y,
 * leaving and rejoining the vertical `reach` pixels above and below. Kinks are visited from top to bottom.
 */
export function progressLinePoints(x: number, top: number, bottom: number, kinks: readonly { x: number; y: number; reach: number }[]) {
  const points: [number, number][] = [[x, top]]
  for (const kink of [...kinks].sort((a, b) => a.y - b.y || a.x - b.x)) {
    points.push([x, kink.y - kink.reach], [kink.x, kink.y], [x, kink.y + kink.reach])
  }
  points.push([x, bottom])
  return points
}

/**
 * Where the lag label of a dependency drawn by `dependencyPath(x1, y1, x2, y2)` goes, in the same inline-start
 * coordinates. Between rows the label sits in the gap at the edge of the source row that faces the target, beside the
 * connector's first vertical run and towards later times (`anchor: 'start'`); bars never reach into that gap. Within one
 * row it is centred above the horizontal run (`anchor: 'middle'`). `sourceTop` is the top of the source row.
 */
export function lagLabelPoint(x1: number, y1: number, x2: number, y2: number, sourceTop: number, rowHeight: number) {
  if (y1 === y2) return { x: (x1 + x2) / 2, y: x1 < x2 ? y1 - 7 : y1 + 23, anchor: 'middle' as const }
  return { x: (x1 < x2 ? (x1 + x2) / 2 : x1 + 10) + 4, y: y2 > y1 ? sourceTop + rowHeight : sourceTop, anchor: 'start' as const }
}

/**
 * The baseline sets to draw, in slot order. An explicit `baselineIds` is checked (nonempty, unique, at most
 * `timelineBaselineLimit`) and used as given, also for IDs that no bar has, so a set keeps its slot while data changes.
 * Without it, the first `timelineBaselineLimit` IDs of `timelineBaselineIds`. `described` is true when `baselineIds` is
 * given or a bar has named `baselines`; only then do titles and descriptions carry the variance, so charts with only
 * `TimelineBar.baseline` render as before.
 */
export function baselineSelection(bars: readonly TimelineBar[], baselineIds: readonly string[] | undefined) {
  if (baselineIds === undefined) {
    return { ids: timelineBaselineIds(bars).slice(0, timelineBaselineLimit), described: bars.some(bar => Boolean(bar.baselines?.length)) }
  }
  if (!Array.isArray(baselineIds)) throw new Error('baselineIds must be an array of baseline set IDs')
  const seen = new Set<string>()
  for (const id of baselineIds) withContext('baselineIds', () => checkId('baseline set', id, seen))
  if (baselineIds.length > timelineBaselineLimit) {
    throw new RangeError(`baselineIds can select at most ${timelineBaselineLimit} baseline sets`)
  }
  return { ids: [...baselineIds], described: true }
}
export type BaselineSelection = ReturnType<typeof baselineSelection>

/**
 * Vertical layout of `count` baseline strips below a bar, in pixels from the bar's bottom edge. One set keeps the
 * original 4 px strip 1 px below the bar. Two or three sets are 3 px strips 1 px apart; the bar is drawn `reserve`
 * pixels shorter so the strips fit in its lane (the row height never changes).
 */
export function baselineLayout(count: number) {
  if (count <= 1) return { reserve: 0, height: 4, offset: (_slot: number) => 1 }
  return { reserve: 4 * count - 5, height: 3, offset: (slot: number) => 1 + 4 * slot }
}

/** Words and formatters of baseline texts. */
export interface BaselineTextOptions {
  label: (id: string) => string
  formatTime: (time: number) => string
  formatVariance: (delta: number) => string
  start: string
  finish: string
  duration: string
}

/** One drawn baseline strip of a bar, with its texts. */
export interface BaselineStrip {
  id: string
  slot: number
  range: TimeRange
  /** The set label, from `BaselineTextOptions.label`. */
  label: string
  /** The formatted baseline dates, such as "09:00–11:00". */
  dates: string
  /** The variance, such as "start +1 h, finish +1 h, duration +0 h"; only when the selection is described. */
  variance?: string
}

/** The selected baselines that one bar has, in slot order. `current` is the bar's interval as drawn. */
export function baselineStrips(bar: TimelineBar, current: TimeRange, selection: BaselineSelection, text: BaselineTextOptions): BaselineStrip[] {
  const strips: BaselineStrip[] = []
  selection.ids.forEach((id, slot) => {
    const range = timelineBaseline(bar, id)
    if (!range) return
    const label = text.label(id)
    const dates = `${text.formatTime(range.start)}–${text.formatTime(range.end)}`
    let variance: string | undefined
    if (selection.described) {
      const delta = baselineVariance(current, range)
      variance = `${text.start} ${text.formatVariance(delta.start)}, ${text.finish} ${text.formatVariance(delta.end)}, `
        + `${text.duration} ${text.formatVariance(delta.duration)}`
    }
    strips.push({ id, slot, range, label, dates, variance })
  })
  return strips
}
