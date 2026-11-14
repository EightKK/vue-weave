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
