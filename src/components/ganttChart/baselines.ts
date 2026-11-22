// Baseline strips of GanttChart (`TimelineBar.baseline`, `TimelineBar.baselines`, `baselineIds`): the strips of a row
// inside the visible time window, with their slot classes, positions and titles. Plain TypeScript.
import type { TimelineBar } from '../../core/types.js'
import { intersectsWindow, timelineBaselineId, type TimeRange } from '../../core/timeline.js'
import { baselineStrips, type BaselineTextOptions, type baselineSelection } from '../../core/barSegments.js'
import { canvasInset, type InlineSide } from './geometry.js'

export type ShownBaseline = { key: string; className: string; style: Record<string, string>; title: string; set?: string }

/** What `shownBaselines` needs from the chart, read once per call. */
export interface BaselineContext {
  choice: ReturnType<typeof baselineSelection>
  text: BaselineTextOptions
  /** The visible time window. */
  window: TimeRange
  /** The interval of a bar as drawn (its drag preview while one is in flight). */
  range: (bar: TimelineBar) => TimeRange
  toX: (time: number) => number
  side: InlineSide
  laneTop: (bar: TimelineBar) => number
  barHeight: number
  /** Offset below the bar of a baseline slot (`baselineLayout`). */
  offset: (slot: number) => number
  formatTime: (time: number) => string
}

function baselineStyle(context: BaselineContext, bar: TimelineBar, baseline: TimeRange, slot: number) {
  const left = context.toX(baseline.start)
  const width = context.toX(baseline.end) - left
  return {
    [context.side]: canvasInset(left - (width === 0 ? 1.5 : 0)),
    width: `${Math.max(3, width)}px`,
    top: `${context.laneTop(bar) + context.barHeight + context.offset(slot)}px`,
  }
}

/**
 * The baseline strips of a row inside the visible time window. With only `TimelineBar.baseline` (no named sets and no
 * `baselineIds`) each is drawn as a single baseline strip; otherwise one strip per selected set, with its slot class,
 * set ID and variance title.
 */
export function shownBaselines(bars: readonly TimelineBar[], context: BaselineContext): ShownBaseline[] {
  const { choice, text, window } = context
  if (!choice.described) {
    return bars.filter(bar => choice.ids.length && bar.baseline && intersectsWindow(bar.baseline, window)).map(bar => ({
      key: bar.id, className: 'vw-gantt-baseline', style: baselineStyle(context, bar, bar.baseline!, 0),
      title: `${text.label(timelineBaselineId)} · ${bar.label} ${context.formatTime(bar.baseline!.start)}–${context.formatTime(bar.baseline!.end)}`,
    }))
  }
  const multiple = choice.ids.length > 1
  return bars.flatMap(bar => baselineStrips(bar, context.range(bar), choice, text)
    .filter(strip => intersectsWindow(strip.range, window))
    .map(strip => ({
      key: bar.id + ':' + strip.id,
      className: multiple ? `vw-gantt-baseline vw-gantt-baseline-${strip.slot + 1}` : 'vw-gantt-baseline',
      style: baselineStyle(context, bar, strip.range, strip.slot),
      title: `${strip.label} · ${bar.label} ${strip.dates} · ${strip.variance}`,
      set: strip.id,
    })))
}
