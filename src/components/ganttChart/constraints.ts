// Constraint markers and handles of GanttChart (`TimelineBar.constraints`, `constraintsEditable`): the constraints a bar
// shows, their glyph classes and positions, their descriptions, and the attributes of their slider handles. Plain
// TypeScript: the chart passes getters for its reactive state, so these functions track it when they run in a computed
// or during render.
import type { GanttLabels, TimelineBar, TimelineConstraintKind } from '../../core/types.js'
import { timelineConstraintKinds, timelineConstraintViolated, type TimeRange } from '../../core/timeline.js'
import { canvasInset, inTimeWindow, type InlineSide } from './geometry.js'

/** A constraint as drawn: its kind, its time (the drag preview while one is in flight) and whether the bar breaks it. */
export type ShownConstraint = { kind: TimelineConstraintKind; time: number; violated: boolean }
/** The time a constraint drag previews. */
export type ConstraintPreview = { id: string; kind: TimelineConstraintKind; time: number }

export interface ConstraintViewOptions {
  preview: () => ConstraintPreview | undefined
  /** The interval of a bar as drawn (its drag preview while one is in flight). */
  range: (bar: TimelineBar) => TimeRange
  labels: () => GanttLabels
  formatTime: (time: number) => string
  toX: (time: number) => number
  side: () => InlineSide
  laneTop: (bar: TimelineBar) => number
  barHeight: () => number
  /** The row shift style of a bar during a move preview between rows. */
  rowShift: (bar: TimelineBar) => { transform?: string }
  /** The visible time window. */
  window: () => TimeRange
  /** `editBounds`, the range of the handles. */
  bounds: () => TimeRange
  /** The ID of the element that holds the constraint key hint. */
  hintId: () => string
}

/** Whether a constraint bounds the start of its bar (a flag at the top) rather than the finish (a flag at the bottom). */
function boundsStart(kind: TimelineConstraintKind) {
  return kind === 'fixedStart' || kind.startsWith('start')
}

export function constraintView(options: ConstraintViewOptions) {
  const dragging = (bar: TimelineBar, kind: TimelineConstraintKind) => {
    const preview = options.preview()
    return preview?.id === bar.id && preview.kind === kind
  }
  /** The constraints of a bar in `timelineConstraintKinds` order, checked against its interval as drawn. */
  function barConstraints(bar: TimelineBar): ShownConstraint[] {
    if (!bar.constraints) return []
    const range = options.range(bar)
    return timelineConstraintKinds.flatMap(kind => {
      const time = dragging(bar, kind) ? options.preview()!.time : bar.constraints?.[kind]
      return time === undefined ? [] : [{ kind, time, violated: timelineConstraintViolated(range, kind, time) }]
    })
  }
  function constraintText(item: ShownConstraint) {
    const labels = options.labels()
    const text = `${labels[item.kind]} ${options.formatTime(item.time)}`
    return item.violated ? `${text}, ${labels.constraintViolated}` : text
  }
  /** Classes of the glyph: the bar end it bounds (a flag at the top or bottom), its direction and its state. */
  function classes(bar: TimelineBar, item: ShownConstraint) {
    const side = item.kind === 'fixedStart' ? 'vw-is-fixed' : item.kind.endsWith('NoEarlierThan') ? 'vw-is-lower' : 'vw-is-upper'
    return ['vw-gantt-constraint', boundsStart(item.kind) ? 'vw-is-start' : 'vw-is-finish', side, item.violated ? 'vw-is-violated' : '',
      dragging(bar, item.kind) ? 'vw-is-dragging' : ''].filter(Boolean).join(' ')
  }
  /** A 26 px wide box centred on the time that holds the flag; the stem reaches across the lane (`--vw-constraint-reach`). */
  function style(bar: TimelineBar, item: ShownConstraint) {
    const top = options.laneTop(bar), height = options.barHeight()
    return {
      [options.side()]: canvasInset(options.toX(item.time) - 13),
      top: `${boundsStart(item.kind) ? top - 5 : top + height - 9}px`,
      '--vw-constraint-reach': `${height + 10}px`,
      ...options.rowShift(bar),
    }
  }
  /** Decorative markers of the constraints of a bar inside the visible time window. */
  function constraintMarks(bar: TimelineBar) {
    return barConstraints(bar).filter(item => inTimeWindow(item.time, options.window())).map(item => ({
      key: bar.id + ':' + item.kind, className: classes(bar, item), style: style(bar, item),
    }))
  }
  /** Kinds with a handle: the constraints inside the visible time window, and the one being dragged. */
  function constraintHandleKinds(bar: TimelineBar) {
    return barConstraints(bar)
      .filter(item => inTimeWindow(item.time, options.window()) || dragging(bar, item.kind))
      .map(item => item.kind)
  }
  function constraintHandleAttrs(bar: TimelineBar, kind: TimelineConstraintKind) {
    const item = barConstraints(bar).find(entry => entry.kind === kind)!
    const labels = options.labels(), bounds = options.bounds()
    return {
      class: classes(bar, item),
      style: style(bar, item),
      'data-vw-constraint': bar.id,
      'data-vw-constraint-kind': kind,
      role: 'slider',
      'aria-label': `${labels[kind]} · ${bar.label}`,
      'aria-describedby': options.hintId(),
      'aria-valuemin': bounds.start,
      'aria-valuemax': bounds.end,
      'aria-valuenow': item.time,
      'aria-valuetext': item.violated ? `${options.formatTime(item.time)}, ${labels.constraintViolated}` : options.formatTime(item.time),
    }
  }
  return { barConstraints, constraintText, constraintMarks, constraintHandleKinds, constraintHandleAttrs }
}
