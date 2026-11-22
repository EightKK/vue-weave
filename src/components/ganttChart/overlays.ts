// Time overlays of GanttChart, clipped to the drawn part of the axis: header bands, marker ranges, markers, the status
// date, the tick lines of the time header and non-working time. Plain TypeScript that returns the elements to render.
import type { TimelineBand, TimelineMarker, TimelineMarkerRange } from '../../core/types.js'
import type { TimeRange } from '../../core/timeline.js'
import { canvasInset, clipSpan, type InlineSide } from './geometry.js'

/** An overlay element of the template: its key, classes, style and optional role, accessible name and `aria-hidden`. */
export type OverlayElement = { key: string; classes: string | string[]; style: Record<string, string>; role?: string; name?: string; hidden?: 'true' }
export type MarkerEntry = OverlayElement & { label: string }
export type HeadLine = OverlayElement & { text: string }
/** The drawn part of a marker range: its offset and width on the axis, tone classes and accessible name. */
export type ShownRange = { item: TimelineMarkerRange; left: number; width: number; tone: string[]; name: string }

/** Each level of header bands, clipped to the drawn window, with the offset and width of each band. */
export function shownBands(levels: readonly (readonly TimelineBand[])[], window: TimeRange, toX: (time: number) => number) {
  return levels.map(level => level.flatMap(band => {
    const span = clipSpan(band.start, band.end, window)
    if (!span) return []
    return [{ ...band, x: toX(span.start), width: toX(span.end) - toX(span.start) }]
  }))
}

/** The visible part of each marker range (`markerRanges`), clipped to the drawn window. */
export function shownRanges(
  ranges: readonly TimelineMarkerRange[], window: TimeRange, toX: (time: number) => number, formatTime: (time: number) => string,
): ShownRange[] {
  return ranges.flatMap(item => {
    const span = clipSpan(item.start, item.end, window)
    if (!span) return []
    const left = toX(span.start)
    const tone = item.tone === undefined ? [] : [`vw-tone-${item.tone}`, 'vw-has-tone']
    return [{ item, left, width: toX(span.end) - left, tone, name: `${item.label} ${formatTime(item.start)}–${formatTime(item.end)}` }]
  })
}

export interface MarkerEntryInput {
  ranges: readonly ShownRange[]
  /** The rows a marker range with `rowIds` is drawn on, with their displayed indices. */
  rangeRows: (rowIds: readonly string[]) => readonly { rowId: string; index: number }[]
  /** The markers inside the visible time window. */
  markers: readonly TimelineMarker[]
  /** The status date and its label when its line is drawn. */
  status?: { time: number; label: string }
  side: InlineSide
  toX: (time: number) => number
  rowHeight: number
  formatTime: (time: number) => string
}

/**
 * The vertical overlays across the body, in paint order: marker range bands (one per row for a range with `rowIds`),
 * markers, then the status date. They share one template element so that a chart without marker ranges or a status
 * date renders exactly the markup it did before.
 */
export function markerEntries(input: MarkerEntryInput): MarkerEntry[] {
  const { side, toX, rowHeight } = input
  const entries: MarkerEntry[] = []
  for (const { item, left, width, tone } of input.ranges) {
    const style = { [side]: canvasInset(left), width: `${width}px` }
    if (!item.rowIds) {
      entries.push({ key: 'range:' + item.id, label: '', classes: ['vw-gantt-range', ...tone], style, hidden: 'true' })
      continue
    }
    for (const { rowId, index } of input.rangeRows(item.rowIds)) {
      entries.push({
        key: 'range:' + item.id + ':' + rowId, label: '', classes: ['vw-gantt-range', 'vw-is-row', ...tone], hidden: 'true',
        style: { ...style, top: `calc(var(--vw-header-height) + ${index * rowHeight}px)`, height: `${rowHeight}px` },
      })
    }
  }
  for (const item of input.markers) {
    entries.push({ key: 'marker:' + item.id, label: item.label, classes: 'vw-gantt-marker', style: { [side]: canvasInset(toX(item.time)) } })
  }
  const status = input.status
  if (status) {
    entries.push({
      key: 'status', label: status.label, classes: ['vw-gantt-marker', 'vw-gantt-status-date'], role: 'img',
      name: `${status.label} ${input.formatTime(status.time)}`, style: { [side]: canvasInset(toX(status.time)) },
    })
  }
  return entries
}

/**
 * The elements of the time header behind the tick labels: the tick lines, then the header labels of the marker ranges
 * (named like a status-date marker). They share one template element so that a chart without marker ranges renders
 * exactly the markup it did before.
 */
export function headLines(ticks: readonly { tick: number; x: number }[], ranges: readonly ShownRange[], side: InlineSide): HeadLine[] {
  const lines: HeadLine[] = ticks.map(line => ({
    key: 'line-' + line.tick, text: '', classes: 'vw-gantt-tick-line', style: { [side]: `${line.x}px` }, hidden: 'true',
  }))
  for (const { item, left, width, tone, name } of ranges) {
    lines.push({
      key: 'range-' + item.id, text: item.label, classes: ['vw-gantt-range-label', ...tone], role: 'img', name,
      style: { [side]: `${left}px`, width: `${width}px` },
    })
  }
  return lines
}

/** Non-working periods clipped to the drawn window, keyed by their index in `periods`. */
export function nonWorkingSpans(periods: readonly TimeRange[], window: TimeRange, toX: (time: number) => number) {
  return periods.flatMap((period, index) => {
    const span = clipSpan(period.start, period.end, window)
    if (!span) return []
    const left = toX(span.start)
    return [{ key: index, left, width: toX(span.end) - left }]
  })
}
