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

/** Validate non-working periods: finite endpoints with start < end. Overlaps are allowed. */
export function checkNonWorkingPeriods(periods: readonly TimeRange[] | undefined) {
  for (const period of periods ?? []) {
    if (!Number.isFinite(period.start) || !Number.isFinite(period.end) || period.end <= period.start) {
      throw new RangeError('nonWorkingPeriods must have finite endpoints with start < end')
    }
  }
}
