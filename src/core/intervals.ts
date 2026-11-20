// Internal helpers for half-open intervals `[start, end)` and sorted breakpoints, shared by scheduling, leveling, resource
// load, recorded actuals and the timeline. Not exported from index.ts.
import type { TimeRange } from './timeline.js'

/** The first index in `[0, length)` for which `matches` holds, or `length`. `matches` must be false, then true. */
export function firstIndex(length: number, matches: (index: number) => boolean) {
  let left = 0, right = length
  while (left < right) {
    const middle = left + Math.floor((right - left) / 2)
    if (matches(middle)) right = middle
    else left = middle + 1
  }
  return left
}

/**
 * Whether two intervals share time. A milestone (`start === end`) meets an interval that contains its time and a
 * milestone at the same time; two intervals meet when they overlap.
 */
export function intervalsMeet(a: TimeRange, b: TimeRange) {
  const pointA = a.start === a.end, pointB = b.start === b.end
  if (pointA && pointB) return a.start === b.start
  if (pointA) return b.start <= a.start && a.start < b.end
  if (pointB) return a.start <= b.start && b.start < a.end
  return a.start < b.end && b.start < a.end
}

/** Whether two sorted lists of disjoint intervals overlap anywhere. */
export function rangesOverlap(a: readonly TimeRange[], b: readonly TimeRange[]): boolean {
  let j = 0
  for (const range of a) {
    while (j < b.length && b[j]!.end <= range.start) j++
    if (j < b.length && b[j]!.start < range.end) return true
  }
  return false
}

/** Copies of sorted ranges, with each range that starts where the one before it ends joined to it. */
export function joinTouching(ranges: readonly TimeRange[]): TimeRange[] {
  const result: TimeRange[] = []
  for (const range of ranges) {
    const previous = result.at(-1)
    if (previous?.end === range.start) previous.end = range.end
    else result.push({ start: range.start, end: range.end })
  }
  return result
}

/** Sorted copies of ranges with overlapping and touching ones joined. */
export function uniteRanges(ranges: readonly TimeRange[]): TimeRange[] {
  const sorted = [...ranges].sort((a, b) => a.start - b.start)
  const result: TimeRange[] = []
  for (const range of sorted) {
    const previous = result.at(-1)
    if (previous && previous.end >= range.start) previous.end = Math.max(previous.end, range.end)
    else result.push({ start: range.start, end: range.end })
  }
  return result
}

/** Remove half-open cuts from sorted, disjoint periods. Both inputs must be normalized. */
export function subtractPeriods(periods: readonly TimeRange[], cuts: readonly TimeRange[]): TimeRange[] {
  const result: TimeRange[] = []
  let c = 0
  for (const period of periods) {
    let start = period.start
    while (c < cuts.length && cuts[c]!.end <= start) c++
    for (let i = c; i < cuts.length && cuts[i]!.start < period.end; i++) {
      const cut = cuts[i]!
      if (cut.start > start) result.push({ start, end: cut.start })
      start = Math.max(start, cut.end)
    }
    if (start < period.end) result.push({ start, end: period.end })
  }
  return result
}
