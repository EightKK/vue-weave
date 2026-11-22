// Bar overlays of GanttChart: the accessible description of a bar from its critical, float, deadline, constraint and
// baseline facts, and the pixel geometry of a split bar's work segments. Plain TypeScript.
import type { GanttLabels, TimelineBar } from '../../core/types.js'
import type { EditMode, TimeRange } from '../../core/timeline.js'
import { segmentPieces } from '../../core/barSegments.js'
import type { InlineSide } from './geometry.js'

export type BarSegments = { pieces: { key: number; style: Record<string, string>; filled: number }[]; gaps: { key: number; style: Record<string, string> }[] }
/** Critical, float, deadline and segment overlays. A bar without these fields gets none and renders as a plain bar. */
export type BarOverlay = { description?: string; late: boolean; segments?: BarSegments }

export interface BarOverlayInput {
  /** The interval of the bar as drawn. */
  range: TimeRange
  /** The texts of the bar's constraints (`constraintText`) and of its described baselines (`baselineStrips`). */
  constraints: readonly string[]
  baselines: readonly string[]
  labels: GanttLabels
  formatTime: (time: number) => string
  /** The segment geometry, asked for only when the bar has an overlay. */
  segments: () => BarSegments | undefined
}

export function barOverlay(bar: TimelineBar, input: BarOverlayInput): BarOverlay | undefined {
  const { labels, formatTime } = input
  const note = bar.description?.trim()
  if (!note && !bar.critical && bar.latestEnd === undefined && bar.deadline === undefined && !bar.segments && !input.baselines.length
    && !input.constraints.length) return undefined
  const parts: string[] = []
  // The application's own text comes first; a trailing full stop is dropped because the parts are joined with '. '.
  if (note) parts.push(note.replace(/\.+$/, ''))
  if (bar.critical) parts.push(labels.critical!)
  if (bar.latestEnd !== undefined) parts.push(`${labels.float} ${formatTime(bar.latestEnd)}`)
  if (bar.deadline !== undefined) parts.push(`${labels.deadline} ${formatTime(bar.deadline)}`)
  const late = bar.deadline !== undefined && input.range.end > bar.deadline
  if (late) parts.push(labels.late!)
  parts.push(...input.constraints, ...input.baselines)
  return { description: parts.length ? parts.join('. ') + '.' : undefined, late, segments: input.segments() }
}

/**
 * The drawn work pieces of a bar: shifted with a move preview (`range` is the previewed interval), and none during a
 * resize preview (`mode` other than `move`) or without segments.
 */
export function workSegments(bar: TimelineBar, range: TimeRange, previewMode: EditMode | undefined) {
  if (!bar.segments || (previewMode !== undefined && previewMode !== 'move')) return undefined
  const delta = range.start - bar.start
  return delta ? bar.segments.map(segment => ({ start: segment.start + delta, end: segment.end + delta })) : bar.segments
}

/**
 * Pixel geometry of the work pieces and gaps of a segmented bar, relative to the bar; children are positioned inside
 * its 1px border.
 */
export function segmentGeometry(
  range: TimeRange, segments: readonly TimeRange[], progress: number | undefined, toX: (time: number) => number, side: InlineSide,
): BarSegments {
  const { pieces, gaps } = segmentPieces(range, segments, progress)
  const origin = toX(range.start)
  const place = (part: TimeRange) => {
    const left = toX(part.start) - origin
    return { [side]: `${left - 1}px`, width: `${toX(part.end) - origin - left}px` }
  }
  return {
    pieces: pieces.map(piece => ({ key: piece.start, style: place(piece), filled: piece.filled })),
    gaps: gaps.map(gap => ({ key: gap.start, style: place(gap) })),
  }
}
