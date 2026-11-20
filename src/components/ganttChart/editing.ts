// Pure edit arithmetic of GanttChart: what a key press proposes for progress, constraints and column widths, the
// intervals of drag to create, and the follow-on changes of a `cascade`. Nothing here reads the DOM or Vue state.
import type { TimelineBar, TimelineCascade, TimelineEdit } from '../../core/types.js'
import { editTimeRange, type TimeRange } from '../../core/timeline.js'
import { snapProgress } from '../../core/barSegments.js'

/** Keys of a slider or separator, with the modifier state that changes their step. */
export interface KeyInput {
  key: string
  shiftKey: boolean
}

/**
 * Progress proposed by a key on a progress slider, or undefined for other keys. Left and Right follow the visual
 * direction, so progress grows towards the left in right-to-left charts; Up and Page Up always grow it.
 */
export function progressForKey(event: KeyInput, current: number, step: number, rtl: boolean) {
  const forward = (event.key === 'ArrowRight') !== rtl
  return event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? snapProgress(current + (forward ? step : -step), step)
    : event.key === 'ArrowUp' ? snapProgress(current + step, step)
      : event.key === 'ArrowDown' ? snapProgress(current - step, step)
        : event.key === 'PageUp' ? snapProgress(current + 0.25, step)
          : event.key === 'PageDown' ? snapProgress(current - 0.25, step)
            : event.key === 'Home' ? 0 : event.key === 'End' ? 1 : undefined
}

/** `before` moved by a whole number of snap steps and kept inside `bounds`. */
export function stepConstraintTime(before: number, delta: number, snap: number, bounds: TimeRange) {
  const { start, end } = bounds
  if (before >= start && before <= end) return editTimeRange({ start: before, end: before }, 'move', delta, snap, bounds).start
  const steps = Math.sign(delta) * Math.round(Math.abs(delta) / snap)
  return Math.max(start, Math.min(end, before + steps * snap))
}

/**
 * What a key on a constraint slider proposes: `{ after }` with the new time, `{ after: undefined }` to remove the
 * constraint (Delete or Backspace), or undefined for other keys. Left and Right follow the visual direction, so
 * ArrowLeft moves to later times in right-to-left charts; Up and Page Up move to later times, as they increase a slider.
 * Shift makes the arrows take a tick step instead of a snap step.
 */
export function constraintForKey(
  event: KeyInput, before: number, rtl: boolean, snap: number, tickStep: number, bounds: TimeRange,
): { after: number | undefined } | undefined {
  const step = event.shiftKey ? tickStep : snap
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    return { after: stepConstraintTime(before, (event.key === 'ArrowRight') !== rtl ? step : -step, snap, bounds) }
  }
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') return { after: stepConstraintTime(before, event.key === 'ArrowUp' ? step : -step, snap, bounds) }
  if (event.key === 'PageUp' || event.key === 'PageDown') return { after: stepConstraintTime(before, event.key === 'PageUp' ? tickStep : -tickStep, snap, bounds) }
  if (event.key === 'Home' || event.key === 'End') return { after: event.key === 'Home' ? bounds.start : bounds.end }
  if (event.key === 'Delete' || event.key === 'Backspace') return { after: undefined }
  return undefined
}

/** A column width rounded to whole pixels and kept inside `[min, max]`. */
export function clampWidth(width: number, min: number, max: number) {
  return Math.round(Math.max(min, Math.min(max, width)))
}

/**
 * The width a key on a column separator proposes, or undefined for other keys. The arrows move the column edge on
 * screen by 10 px (40 px with Shift), so ArrowLeft widens a column in right-to-left charts.
 */
export function columnWidthForKey(event: KeyInput, width: number, rtl: boolean, min: number, max: number) {
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    const direction = (event.key === 'ArrowRight') !== rtl ? 1 : -1
    return clampWidth(width + direction * (event.shiftKey ? 40 : 10), min, max)
  }
  if (event.key === 'Home' || event.key === 'End') return event.key === 'Home' ? min : max
  return undefined
}

/** The nearest multiple of `step` from `origin`. */
export function snapToGrid(time: number, origin: number, step: number) {
  return origin + Math.round((time - origin) / step) * step
}

/** `[start, start + length)` moved inside `bounds`, and shortened only when the bounds are shorter. */
export function fitInBounds(start: number, length: number, bounds: TimeRange): TimeRange {
  const { start: low, end: high } = bounds
  const size = Math.min(length, high - low)
  const from = Math.max(low, Math.min(high - size, start))
  return { start: from, end: from + size }
}

/**
 * The snapped interval between the press time `from` and the pointer time `to` of a drag to create, at least `minimum`
 * long and inside `bounds`. A too short interval grows away from the press point.
 */
export function createSpan(from: number, to: number, origin: number, snap: number, bounds: TimeRange, minimum: number): TimeRange {
  const a = snapToGrid(from, origin, snap), b = snapToGrid(to, origin, snap)
  const start = Math.max(bounds.start, Math.min(a, b)), end = Math.min(bounds.end, Math.max(a, b))
  if (end - start >= minimum) return { start, end }
  return b >= a ? fitInBounds(start, minimum, bounds) : fitInBounds(end - minimum, minimum, bounds)
}

/** The lowest lane of a row that no bar of `bars` overlaps during `range`, or lane 0 when every lane is taken. */
export function freeLane(bars: readonly TimelineBar[], range: TimeRange, laneCount: number) {
  const busy = bars.filter(bar => bar.start === bar.end
    ? bar.start >= range.start && bar.start < range.end : bar.start < range.end && range.start < bar.end)
  let lane = 0
  while (lane < laneCount && busy.some(bar => (bar.lane ?? 0) === lane)) lane++
  return lane < laneCount ? lane : 0
}

/** The follow-on changes of a `cascade` call, or the reason it failed. */
export type CascadeResult = { changes: TimelineEdit[] } | { error: string }

/**
 * Ask `cascade` for the follow-on changes of each primary change. Changes for unknown bars and for the primary bars
 * are ignored, the last change returned for a bar wins, and a change that keeps a bar's interval and row is dropped.
 * A throwing callback or an invalid interval becomes a rejection reason (`fallback` when its message is empty).
 */
export function cascadeChanges(
  changes: readonly TimelineEdit[], cascade: TimelineCascade, bars: ReadonlyMap<string, TimelineBar>, fallback: string,
): CascadeResult {
  const primary = new Set(changes.map(change => change.id))
  const merged = new Map<string, TimelineEdit>()
  try {
    for (const change of changes) {
      for (const next of cascade(change)) {
        if (!bars.has(next.id) || primary.has(next.id)) continue
        const { start, end } = next.after
        if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new RangeError('Invalid cascaded change for bar: ' + next.id)
        merged.set(next.id, next)
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { error: message || fallback }
  }
  return {
    changes: [...merged.values()].filter(change => {
      const bar = bars.get(change.id)!
      return change.after.start !== bar.start || change.after.end !== bar.end || (change.row !== undefined && change.row.after !== bar.rowId)
    }),
  }
}

/** Identity of the snapped primary changes of a drag step, so `cascade` is asked again only when they differ. */
export function cascadeChangeKey(changes: readonly TimelineEdit[]) {
  return JSON.stringify(changes.map(change => [change.id, change.after.start, change.after.end, change.row?.after]))
}
