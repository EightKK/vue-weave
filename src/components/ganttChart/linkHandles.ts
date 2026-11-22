// Link handle geometry of GanttChart (`connectable`, `reconnectable`, `summaryDependencies`): the names, pressed state
// and positions of the link handles of bars and rollup bars, the origin of a dragged connection, and the reconnect
// handles of the selected dependency. Plain TypeScript: the chart passes getters for its reactive state.
import type { GanttLabels, TimelineBar, TimelineBarEnd, TimelineDependency } from '../../core/types.js'
import { intersectsWindow, type TimeRange } from '../../core/timeline.js'
import { canvasInset, inRowWindow, linkHandleOffset, type InlineSide, type RowWindow } from './geometry.js'

/** One end of a bar, or of the rollup bar of a summary row (`summaryDependencies`). */
export type LinkEnd = { bar: string; end: TimelineBarEnd }
/** A connection or reconnection in progress: one fixed end while the user picks the other one. */
export type LinkDraft = { fixed: LinkEnd; role: 'from' | 'to'; dependency?: TimelineDependency }
/** The drawn rollup and displayed row index of a summary row that a dependency end can name. */
export type SummaryAnchor = { range: TimeRange; index: number }
/**
 * Buttons placed on the canvas: the two reconnect handles of the selected dependency and, with `summaryDependencies`
 * and link handles shown, the link handles of the displayed rollup bars. They share one template loop, so a chart
 * without `summaryDependencies` renders exactly the markup it did before. The template reads `dependency` and `link`
 * of either kind for the data attributes.
 */
export type CanvasHandle = {
  key: string; className: string | (string | Record<string, boolean>)[]; style: Record<string, string>; label: string; pressed: boolean
} & (
  | { kind: 'reconnect'; dependency: TimelineDependency; end: 'from' | 'to'; link?: undefined }
  | { kind: 'link'; link: LinkEnd; dependency?: undefined }
)

export const linkEnds = ['start', 'finish'] as const

/** The `data-vw-link` value of a link handle. */
export function linkKey(end: LinkEnd) {
  return JSON.stringify([end.bar, end.end])
}

export interface LinkHandleOptions {
  draft: () => LinkDraft | undefined
  labels: () => GanttLabels
  bar: (id: string) => TimelineBar | undefined
  /** The displayed row index of a row ID, or undefined when the row is hidden. */
  rowIndex: (rowId: string) => number | undefined
  rowLabel: (id: string) => string | undefined
  anchors: () => ReadonlyMap<string, SummaryAnchor>
  /** The interval of a bar as drawn (its drag preview while one is in flight). */
  range: (bar: TimelineBar) => TimeRange
  /** Inline-start offset and width of a bar as drawn. */
  box: (bar: TimelineBar) => { left: number; width: number }
  toX: (time: number) => number
  axisWidth: () => number
  side: () => InlineSide
  rowHeight: () => number
  headerHeight: () => number
  laneTop: (bar: TimelineBar) => number
  barHeight: () => number
  rowWindow: () => RowWindow
  timeWindow: () => TimeRange
}

export function linkHandles(options: LinkHandleOptions) {
  function linkPressed(id: string, end: TimelineBarEnd) {
    const fixed = options.draft()?.fixed
    return Boolean(fixed && fixed.bar === id && fixed.end === end)
  }
  function linkHandleName(id: string, label: string, end: TimelineBarEnd) {
    const labels = options.labels()
    const action = options.draft() && !linkPressed(id, end) ? labels.connectTo : labels.connectFrom
    return `${action} ${end === 'start' ? labels.startOf : labels.finishOf} ${label}`
  }
  function linkHandleStyle(bar: TimelineBar, end: TimelineBarEnd) {
    const box = options.box(bar)
    const x = linkHandleOffset(box.left, box.width, end, options.axisWidth())
    return {
      [options.side()]: canvasInset(x),
      top: `${options.laneTop(bar) + options.barHeight() / 2 - 6}px`,
    }
  }
  /** Body coordinates of a bar end, relative to the time axis origin and the first row. */
  function linkOrigin(end: LinkEnd) {
    const bar = options.bar(end.bar)
    const index = bar && options.rowIndex(bar.rowId)
    const rowHeight = options.rowHeight()
    if (!bar || index === undefined) {
      // A summary row end (`summaryDependencies`): the edge of its rollup bar.
      const anchor = options.anchors().get(end.bar)
      if (!anchor) return undefined
      const time = end.end === 'start' ? anchor.range.start : anchor.range.end
      return { x: options.toX(time), y: anchor.index * rowHeight + rowHeight / 2 }
    }
    const range = options.range(bar)
    return { x: options.toX(end.end === 'start' ? range.start : range.end), y: index * rowHeight + options.laneTop(bar) + options.barHeight() / 2 }
  }
  /** The two reconnect handles at the ends of a drawn dependency line named `name`. */
  function reconnectHandles(line: { dependency: TimelineDependency; x1: number; y1: number; x2: number; y2: number }, name: string): CanvasHandle[] {
    const labels = options.labels(), draft = options.draft()
    const place = (x: number, y: number) => ({ [options.side()]: canvasInset(x - 6), top: `${options.headerHeight() + y - 6}px` })
    const pressed = (end: 'from' | 'to') => Boolean(draft?.dependency && draft.role === end)
    return [
      {
        kind: 'reconnect', key: 'from', className: 'vw-gantt-reconnect-handle', style: place(line.x1, line.y1),
        label: `${labels.reconnectSource} ${name}`, pressed: pressed('from'), dependency: line.dependency, end: 'from',
      },
      {
        kind: 'reconnect', key: 'to', className: 'vw-gantt-reconnect-handle', style: place(line.x2, line.y2),
        label: `${labels.reconnectTarget} ${name}`, pressed: pressed('to'), dependency: line.dependency, end: 'to',
      },
    ]
  }
  /** The link handles of the rollup bars inside the virtual row window and the visible time window. */
  function summaryLinkHandles(): CanvasHandle[] {
    const handles: CanvasHandle[] = []
    const rowHeight = options.rowHeight()
    for (const [id, anchor] of options.anchors()) {
      if (!inRowWindow(anchor.index, options.rowWindow()) || !intersectsWindow(anchor.range, options.timeWindow())) continue
      const left = options.toX(anchor.range.start)
      const width = Math.max(3, options.toX(anchor.range.end) - left)
      const label = options.rowLabel(id) ?? id
      for (const end of linkEnds) {
        const x = linkHandleOffset(left, width, end, options.axisWidth())
        handles.push({
          kind: 'link', key: linkKey({ bar: id, end }),
          className: ['vw-gantt-link-handle', `vw-is-${end}`, { 'vw-is-active': linkPressed(id, end) }],
          style: {
            [options.side()]: canvasInset(x),
            top: `${options.headerHeight() + anchor.index * rowHeight + rowHeight / 2 - 6}px`,
          },
          label: linkHandleName(id, label, end), pressed: linkPressed(id, end), link: { bar: id, end },
        })
      }
    }
    return handles
  }
  return { linkPressed, linkHandleName, linkHandleStyle, linkOrigin, reconnectHandles, summaryLinkHandles }
}
