// Pure geometry and windowing helpers of GanttChart. They know nothing about Vue or the DOM: positions are measured
// from the inline-start edge of the time axis, so right-to-left charts only differ in the CSS property they set.
import type { TimeRange } from '../../core/timeline.js'

/** The CSS property that holds inline-start offsets: `left`, or `right` in right-to-left charts. */
export type InlineSide = 'left' | 'right'

/** Rows `[first, afterLast)` of the virtual row window. */
export interface RowWindow {
  first: number
  afterLast: number
}

/** Whether two optional intervals have the same endpoints. */
export function sameRange(a: TimeRange | undefined, b: TimeRange | undefined) {
  return a === b || (a !== undefined && b !== undefined && a.start === b.start && a.end === b.end)
}

/**
 * `previous` when `next` holds the same items in the same order, otherwise `next`. Used by computeds that compare an
 * array prop by value, so that an inline literal in a parent template does not count as a change.
 */
export function sameItems<T>(previous: readonly T[] | undefined, next: readonly T[] | undefined): readonly T[] | undefined {
  return previous && Array.isArray(next) && previous.length === next.length && previous.every((item, i) => item === next[i]) ? previous : next
}

/** Whether a displayed row index is inside the virtual row window. */
export function inRowWindow(index: number, window: RowWindow) {
  return index >= window.first && index < window.afterLast
}

/** Whether a time is inside the half-open window `[start, end)`. */
export function inTimeWindow(time: number, window: TimeRange) {
  return time >= window.start && time < window.end
}

/** Whether a time is inside the closed range and the closed window, as the now and status-date lines are drawn. */
export function inRangeAndWindow(time: number, range: TimeRange, window: TimeRange) {
  return time >= range.start && time <= range.end && time >= window.start && time <= window.end
}

/** The intersection of `range` and `window`, the part of the axis that can be drawn. */
export function drawableWindow(range: TimeRange, window: TimeRange): TimeRange {
  return { start: Math.max(range.start, window.start), end: Math.min(range.end, window.end) }
}

/** `[start, end)` clipped to `window`, or undefined when nothing of it is left. */
export function clipSpan(start: number, end: number, window: TimeRange): TimeRange | undefined {
  const from = Math.max(start, window.start), to = Math.min(end, window.end)
  return to <= from ? undefined : { start: from, end: to }
}

/** Inline-start offset and width of an interval on the time axis; a milestone is 10 px wide around its time. */
export function intervalBox(toX: (time: number) => number, range: TimeRange) {
  const left = toX(range.start)
  const width = toX(range.end) - left
  return { left: left - (width === 0 ? 5 : 0), width: width === 0 ? 10 : width }
}

/**
 * Inline-start offset of the 12 px link handle at one end of a box, kept inside the axis so the sticky label column
 * never covers it.
 */
export function linkHandleOffset(left: number, width: number, end: 'start' | 'finish', axisWidth: number) {
  return Math.max(0, Math.min(axisWidth - 12, end === 'start' ? left - 15 : left + width + 3))
}

/** A CSS length from the inline-start edge of the canvas: the sticky label area plus `x` pixels of the time axis. */
export function canvasInset(x: number) {
  return `calc(var(--vw-label-area-width) + ${x}px)`
}

/** `scrollTop` that brings a row into the vertical viewport, or undefined when it is already inside it. */
export function rowScrollTop(index: number, rowHeight: number, scrollTop: number, visibleHeight: number) {
  const top = index * rowHeight
  if (top < scrollTop) return top
  if (top + rowHeight > scrollTop + visibleHeight) return Math.max(0, top + rowHeight - visibleHeight)
  return undefined
}
