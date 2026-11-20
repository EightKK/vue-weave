import type { TimeRange, TimeScale } from './timeline.js'
import { invertWorkPeriods } from './workCalendar.js'

/** The default share of the working-time width that non-working time keeps. */
export const defaultNonWorkingRatio = 0.1

/**
 * A piecewise-linear `TimeScale` that gives working time `pixelsPerUnit` pixels per time unit and non-working time
 * `pixelsPerUnit * nonWorkingRatio`. Use it as the `scale` prop of GanttChart so working hours get more room.
 *
 * - `periods` are half-open `[start, end)` working periods, as `buildWorkPeriods` returns them. They are clipped to
 *   `range`, and they may be unsorted, overlapping or touching: they are sorted and united. Periods outside the
 *   range are ignored. Endpoints must be finite with positive length (`RangeError` otherwise).
 * - `nonWorkingRatio` is a fraction in `(0, 1]`, default 0.1. It cannot be 0: a collapsed interval would map many times
 *   to one pixel, so `toTime` could not invert `toX`. A ratio of 1 gives a plain linear scale.
 * - With no working period inside the range the whole range is non-working, so the scale is linear at
 *   `pixelsPerUnit * nonWorkingRatio`.
 * - Outside `range` the scale extrapolates linearly with the slope of the nearest edge segment, so `toX` and `toTime`
 *   stay strictly increasing and mutually inverse for drags past either edge. `toX(range.start)` is 0 and
 *   `toX(range.end)` is `width`.
 *
 * Both mappings binary-search precomputed breakpoints, so a call costs O(log n) for n periods. The round trip is exact
 * at segment boundaries and within floating-point rounding elsewhere. Changing the ratio or `pixelsPerUnit` changes
 * only x positions, never times. The scale does not depend on text direction; GanttChart positions from the inline
 * start edge in right-to-left charts.
 */
export function createWorkingTimeScale(
  range: TimeRange, periods: readonly TimeRange[], pixelsPerUnit: number, nonWorkingRatio: number = defaultNonWorkingRatio,
): TimeScale {
  if (!Number.isFinite(range.start) || !Number.isFinite(range.end) || range.end <= range.start) {
    throw new RangeError('A range must have finite ordered endpoints')
  }
  if (!Number.isFinite(pixelsPerUnit) || pixelsPerUnit <= 0) throw new RangeError('pixelsPerUnit must be finite and positive')
  if (!Number.isFinite(nonWorkingRatio) || nonWorkingRatio <= 0 || nonWorkingRatio > 1) {
    throw new RangeError('nonWorkingRatio must be greater than 0 and at most 1')
  }
  const slow = pixelsPerUnit * nonWorkingRatio
  if (!(slow > 0)) throw new RangeError('The time axis is too narrow')
  // Breakpoints: times[i] and xs[i] bound segment i, whose slope in pixels per unit is slopes[i].
  const times = [range.start], xs = [0], slopes: number[] = []
  const add = (end: number, slope: number) => {
    slopes.push(slope)
    xs.push(xs[xs.length - 1]! + (end - times[times.length - 1]!) * slope)
    times.push(end)
  }
  let cursor = range.start
  for (const gap of invertWorkPeriods(periods, range)) {
    if (gap.start > cursor) add(gap.start, pixelsPerUnit)
    add(gap.end, slow)
    cursor = gap.end
  }
  if (cursor < range.end) add(range.end, pixelsPerUnit)
  const last = slopes.length - 1
  const width = xs[last + 1]!
  if (!Number.isFinite(width) || width <= 0) throw new RangeError('The time axis is too wide')
  for (let i = 1; i < xs.length; i++) {
    if (!(xs[i]! > xs[i - 1]!)) throw new RangeError('The time axis is too wide or too narrow to stay strictly increasing')
  }

  // The largest segment index in [0, last] whose start is <= value.
  const find = (values: readonly number[], value: number) => {
    let low = 0, high = last
    while (low < high) {
      const mid = (low + high + 1) >> 1
      if (values[mid]! <= value) low = mid
      else high = mid - 1
    }
    return low
  }
  return {
    width,
    toX(time) {
      if (time <= range.start) return (time - range.start) * slopes[0]!
      if (time >= range.end) return width + (time - range.end) * slopes[last]!
      const i = find(times, time)
      return xs[i]! + (time - times[i]!) * slopes[i]!
    },
    toTime(x) {
      if (x <= 0) return range.start + x / slopes[0]!
      if (x >= width) return range.end + (x - width) / slopes[last]!
      const i = find(xs, x)
      return times[i]! + (x - xs[i]!) / slopes[i]!
    },
  }
}

/**
 * Which tick labels have room on a possibly non-linear scale (internal; GanttChart and renderTimelineSvg share it).
 * A label sits after its tick and is shown when the next tick (`tick + step`) is at least `gap` pixels further on; the
 * closing label at `end` sits before its tick and is shown when the previous tick is at least `gap` pixels back. On a
 * linear scale whose step keeps ticks `gap` apart every label is shown; where a working-time scale squeezes ticks
 * together, the squeezed labels are left out, so labels never overlap. The answer for a tick depends only on its
 * neighbours, so it does not change while the chart scrolls.
 */
export function tickLabelsWithRoom(ticks: readonly number[], toX: (time: number) => number, step: number, end: number, gap = 76) {
  return ticks.map(tick => tick === end
    ? toX(tick) - toX(tick - step) >= gap
    : toX(tick + step) - toX(tick) >= gap)
}
