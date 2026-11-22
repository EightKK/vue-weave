// Resource load rows of GanttChart (`loadRows`, `loadSegments`): the rows inside the vertical viewport below the task
// rows, and their segments inside the visible time window with fill heights, marks and accessible names. Plain
// TypeScript.
import type { GanttLabels, TimelineLoadRow, TimelineLoadSegment } from '../../core/types.js'
import { intersectsWindow, visibleRows, type ResourceLoadHistogram, type TimeRange } from '../../core/timeline.js'
import { resolveLoadTargets, type LoadViewTarget } from '../../core/viewBindings.js'

/** The load segments matched by `highlightedLoadTargets` and `selectedLoadTargets`, found again by range overlap. */
export function loadSegmentMarks(
  segments: readonly TimelineLoadSegment[], highlighted: readonly LoadViewTarget[] | undefined, selected: readonly LoadViewTarget[] | undefined,
) {
  const marks = (targets: readonly LoadViewTarget[] | undefined) =>
    new Set<TimelineLoadSegment>(targets?.length ? resolveLoadTargets(segments, targets).segments : [])
  return { highlighted: marks(highlighted), selected: marks(selected) }
}

export interface LoadRowInput {
  rows: readonly TimelineLoadRow[]
  histogram: ReadonlyMap<string, ResourceLoadHistogram>
  marks: ReturnType<typeof loadSegmentMarks>
  /** The vertical scroll position and the viewport height. */
  top: number
  height: number
  headerHeight: number
  /** Height of the task rows above the load rows. */
  bodyHeight: number
  rowHeight: number
  /** The visible time window. */
  window: TimeRange
  toX: (time: number) => number
  formatTime: (time: number) => string
  labels: GanttLabels
}

/** The load rows inside the vertical viewport, each with its segments inside the visible time window. */
export function shownLoadRows(input: LoadRowInput) {
  const { marks, labels, toX, formatTime } = input
  const offset = Math.max(0, input.top - input.bodyHeight)
  const covered = Math.max(0, input.bodyHeight - input.top)
  const visible = Math.max(0, input.height - input.headerHeight - covered)
  const { first, afterLast } = visibleRows(offset, visible, input.rowHeight, input.rows.length)
  return input.rows.slice(first, afterLast).map((row, i) => {
    const { segments, peak } = input.histogram.get(row.id)!
    const scale = Math.max(1e-9, peak)
    return {
      row, index: first + i, peak,
      segments: segments.filter(segment => intersectsWindow(segment, input.window)).map(segment => {
        const overload = segment.overload ?? Math.max(0, segment.load - segment.capacity)
        const left = toX(segment.start)
        return {
          segment, overload,
          key: segment.start,
          highlighted: marks.highlighted.has(segment), selected: marks.selected.has(segment),
          left, width: toX(segment.end) - left,
          fill: Math.min(segment.load, segment.capacity) / scale * 100,
          over: overload / scale * 100,
          capacity: segment.capacity / scale * 100,
          label: `${row.label} ${formatTime(segment.start)}–${formatTime(segment.end)}: ${labels.load} ${segment.load} / ${labels.capacity} ${segment.capacity}`
            + (overload > 0 ? `, ${labels.overload} ${overload}` : ''),
        }
      }),
    }
  })
}
