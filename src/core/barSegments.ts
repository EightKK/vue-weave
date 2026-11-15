// Internal geometry shared by GanttChart and renderTimelineSvg. Not part of the public entry points.
import type { TimeRange } from './timeline.js'

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
