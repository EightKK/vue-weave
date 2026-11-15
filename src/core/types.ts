import type { GraphBox, GraphEdge, GraphLayout, GraphPoint, IdentifiedNode } from './graph.js'
import type { GraphGroup } from './graph.js'
import type { EditMode, TimeRange } from './timeline.js'
import type { SvgExportThemeInput } from './exportSvg.js'
import type { GraphRect } from './graphView.js'

export type ChartTone = 'teal' | 'blue' | 'amber' | 'violet'

/**
 * A node of NetworkGraph. `D` types the optional `data` payload; it defaults to `unknown`, so `NetworkNode` without a type
 * argument is unchanged.
 */
export interface NetworkNode<D = unknown> extends IdentifiedNode {
  label: string
  detail?: string
  tone?: ChartTone
  draggable?: boolean
  /** False keeps the node out of NetworkGraph deletion proposals (`deletable`). */
  deletable?: boolean
  shape?: 'box' | 'rounded'
  /** False hides the NetworkGraph resize handles of this node (`resizable`). */
  resizable?: boolean
  /** Application data. The components pass it through untouched. */
  data?: D
}

/**
 * A custom NetworkGraph layout. `N` and `E` type the nodes and edges it receives; with collapsed groups they include
 * proxy nodes and re-attached edges (see `GraphShownNode` and `GraphShownEdge`).
 */
export type GraphLayoutFunction<N extends NetworkNode = NetworkNode, E extends GraphEdge = GraphEdge> = (
  nodes: readonly N[],
  edges: readonly E[],
) => GraphLayout

export interface GraphViewport {
  x: number
  y: number
  scale: number
}

/** A GanttChart row. `D` types the optional `data` payload; it defaults to `unknown`. */
export interface TimelineRow<D = unknown> {
  id: string
  parentId?: string
  label: string
  detail?: string
  /** Application data. The components pass it through untouched. */
  data?: D
}

/** A GanttChart bar. `D` types the optional `data` payload; it defaults to `unknown`. */
export interface TimelineBar<D = unknown> extends TimeRange {
  id: string
  rowId: string
  label: string
  lane?: number
  tone?: ChartTone
  appearance?: 'outline' | 'solid'
  editable?: boolean
  progress?: number
  /**
   * The single unnamed baseline, drawn below the bar. It takes part in baseline selection as the set
   * `timelineBaselineId` (`'$baseline'`).
   */
  baseline?: TimeRange
  /**
   * Named baselines, at most one per set ID (for example `plan` or `rev1`). Each is a finite interval with `end >= start`;
   * the set ID `timelineBaselineId` is reserved for `baseline`. GanttChart `baselineIds` chooses the sets that are drawn.
   */
  baselines?: readonly TimelineBaseline[]
  /** Application data. The components pass it through untouched. */
  data?: D
  /** Draws the bar with the critical outline (`--vw-critical`) and adds `GanttLabels.critical` to its description. */
  critical?: boolean
  /** Latest finish that keeps the plan; a float line is drawn from `end` to it. Finite and not before `end`. */
  latestEnd?: number
  /** A due time, drawn as an indicator in the bar's lane. A bar whose `end` is after it is marked late. */
  deadline?: number
  /**
   * Worked pieces of a split bar: sorted, non-overlapping, positive-length intervals inside [start, end]. The gaps are
   * drawn as a thin connector. Not allowed on milestones.
   */
  segments?: readonly TimeRange[]
  /**
   * Whether Delete or Backspace may propose removing the bar when the chart's `deletable` prop is set.
   * Defaults to `editable`.
   */
  deletable?: boolean
  /**
   * Scheduling constraints, drawn as markers in the bar's lane and added to its description. The fields are named as in
   * `ScheduleTask`, so they spread into a task unchanged. Each is a finite time in the chart's units. The chart does not
   * move the bar to meet them; a constraint that the bar's dates break is drawn as violated.
   */
  constraints?: TimelineConstraints
}

/**
 * The scheduling constraints of a bar, named as in `ScheduleTask`. Times are in the chart's units. Logically conflicting
 * combinations are allowed; whether they can be met is decided by the scheduler.
 */
export interface TimelineConstraints {
  /** The bar may not start before this time. */
  startNoEarlierThan?: number
  /** The bar may not start after this time. */
  startNoLaterThan?: number
  /** The bar may not finish before this time. */
  finishNoEarlierThan?: number
  /** The bar may not finish after this time. */
  finishNoLaterThan?: number
  /**
   * The bar must start at this time. It is independent of the bar's own `start`: a bar that starts at another time is
   * drawn with the constraint violated, as the scheduler would report it.
   */
  fixedStart?: number
}

/** The name of one scheduling constraint. See `timelineConstraintKinds`. */
export type TimelineConstraintKind = keyof TimelineConstraints

/**
 * A constraint proposal from GanttChart (`constraintsEditable`). Apply it with `applyTimelineConstraintEdit`, or set
 * the bar's `constraints[kind]` to `after` (remove it when `after` is undefined).
 */
export interface TimelineConstraintEdit {
  /** The bar ID. */
  id: string
  kind: TimelineConstraintKind
  /** The constraint's time before the edit, or undefined when the bar did not have it. */
  before: number | undefined
  /** The proposed time, snapped and kept inside `editBounds`, or undefined to remove the constraint. */
  after: number | undefined
  source: 'pointer' | 'keyboard'
}

/** Synchronous check of a `constraint-edit` proposal. Accept with true or undefined; reject with false or a reason. */
export type ConstraintEditValidator = (change: TimelineConstraintEdit) => boolean | string | void

/** A recorded interval of a bar in the baseline set `id`, for example `plan` or `rev1`. */
export interface TimelineBaseline extends TimeRange {
  /** Nonempty ID of the baseline set, unique per bar. */
  id: string
}

/** A bar's interval minus a baseline: positive values are later or longer than the baseline. See `baselineVariance`. */
export interface TimelineBaselineVariance {
  /** `bar.start - baseline.start`. */
  start: number
  /** `bar.end - baseline.end`. */
  end: number
  /** `(bar.end - bar.start) - (baseline.end - baseline.start)`. */
  duration: number
}

export interface TimelineSummary extends TimeRange {
  count: number
  progress?: number
}

/** An extra GanttChart column. `R` types the rows its callbacks receive. */
export interface TimelineColumn<R extends TimelineRow = TimelineRow> {
  id: string
  label: string
  width: number
  value: (row: R, summary?: TimelineSummary) => string | number
  editable?: boolean | ((row: R) => boolean)
}

export interface TimelineCellEdit {
  rowId: string
  columnId: string
  before: string | number
  after: string
}

export interface TimelineBand extends TimeRange {
  label: string
}

export interface TimelineMarker {
  id: string
  time: number
  label: string
}

export interface TimelineDependency {
  id: string
  from: string
  to: string
  type?: 'FS' | 'SS' | 'FF' | 'SF'
  /**
   * Lag in the chart's time units (milliseconds by default): the elapsed time between the linked bar ends. A negative
   * value is a lead. GanttChart draws a non-zero lag as a label on the connector and in the dependency's description;
   * omitted or 0 draws nothing extra. `ScheduleLink` extends this type, so the lag reaches `scheduleTasks`.
   */
  lag?: number
}

export interface TimelineEdit {
  id: string
  before: TimeRange
  after: TimeRange
  mode: EditMode
  source: 'pointer' | 'keyboard'
  /** Present only when the proposal moves the bar to another row (`rowDraggable`). */
  row?: { before: string; after: string }
}

export type EditValidator = (change: TimelineEdit) => boolean | string | void

export interface GraphLabels {
  region: string
  empty: string
  zoom: string
  zoomIn: string
  zoomOut: string
  fit: string
  minimap?: string
  connectFrom?: string
  connectTo?: string
  reconnectSource?: string
  reconnectTarget?: string
  moveGroup?: string
  rejected?: string
  selectEdge?: string
  groupWithin?: string
  /** Announced when `validateDelete` returns false. */
  deleteRejected?: string
  /** Name prefix of the toggle that collapses a group, followed by the group label. Default "Collapse group". */
  collapseGroup?: string
  /** Name prefix of the toggle that expands a collapsed group, followed by the group label. Default "Expand group". */
  expandGroup?: string
  /** Proxy detail after a member count of one. Default "node". */
  collapsedNode?: string
  /** Proxy detail after any other member count. Default "nodes". */
  collapsedNodes?: string
  /** Name prefix of a waypoint handle, followed by its number and the edge label or ID. Default "Move waypoint". */
  moveWaypoint?: string
  /** Name prefix of a handle that inserts a waypoint, followed by its number and the edge label or ID. Default "Add waypoint". */
  addWaypoint?: string
  /** Announced when `validateEdgeReshape` returns false. Default "This edge change was rejected." */
  reshapeRejected?: string
  /** Name prefix of a resize handle, followed by the node label and the corner. Default "Resize". */
  resizeNode?: string
  /** Corner names of the resize handles. Defaults "top left", "top right", "bottom left" and "bottom right". */
  topLeft?: string
  topRight?: string
  bottomLeft?: string
  bottomRight?: string
  /** Announced when `validateNodeResize` returns false. Default "This resize was rejected." */
  resizeRejected?: string
}

export interface GanttLabels {
  region: string
  rows: string
  empty: string
  zoom: string
  zoomIn: string
  zoomOut: string
  editHint: string
  rejected: string
  expandRow?: string
  collapseRow?: string
  /** Label of the unnamed baseline (`TimelineBar.baseline`) in titles and descriptions. Default "Baseline". */
  baseline?: string
  /** Word before the start variance in baseline titles and descriptions. Default "start". */
  baselineStart?: string
  /** Word before the finish variance in baseline titles and descriptions. Default "finish". */
  baselineFinish?: string
  /** Word before the duration variance in baseline titles and descriptions. Default "duration". */
  baselineDuration?: string
  connectFrom?: string
  connectTo?: string
  startOf?: string
  finishOf?: string
  selectDependency?: string
  reconnectSource?: string
  reconnectTarget?: string
  connectionRejected?: string
  zoomPresets?: string
  now?: string
  loadRegion?: string
  load?: string
  capacity?: string
  overload?: string
  moveRowHint?: string
  /** Bar description for `TimelineBar.critical`. Default "Critical". */
  critical?: string
  /** Bar description prefix before the formatted `latestEnd`. Default "Float until". */
  float?: string
  /** Bar description prefix before the formatted `deadline`. Default "Deadline". */
  deadline?: string
  /** Bar description for a bar that ends after its deadline. Default "Late". */
  late?: string
  /** Accessible name prefix of the progress slider, followed by the bar label. Default "Progress of". */
  progressOf?: string
  /** Description of a deletable bar. Default "Delete or Backspace removes the bar." */
  deleteHint?: string
  /** Accessible name prefix of the add-bar button of a creatable row, followed by the row label. Default "Add bar to". */
  createIn?: string
  /** Announced when `validateCreate` returns false. Default "This new bar was rejected." */
  createRejected?: string
  /** Accessible name prefix of a row's move handle (`rowsReorderable`), followed by the row label. Default "Move row". */
  moveRow?: string
  /** Description of the row move handles. Default lists the Alt key shortcuts. */
  moveRowKeysHint?: string
  /** Announced when `validateRowMove` returns false. Default "This row move was rejected." */
  rowMoveRejected?: string
  /** Label of the status-date line (`statusDate`). Default "Status date". */
  statusDate?: string
  /** Accessible name prefix of a column resize handle (`columnsResizable`), followed by the column label. Default "Resize column". */
  resizeColumn?: string
  /** Announced when `validateColumnResize` returns false. Default "This column resize was rejected." */
  columnResizeRejected?: string
  /** Description prefix of a dependency with a non-zero `lag`, before the formatted lag. Default "Lag". */
  lag?: string
  /** Text of a `startNoEarlierThan` constraint in descriptions and handle names. Default "Start no earlier than". */
  startNoEarlierThan?: string
  /** Text of a `startNoLaterThan` constraint. Default "Start no later than". */
  startNoLaterThan?: string
  /** Text of a `finishNoEarlierThan` constraint. Default "Finish no earlier than". */
  finishNoEarlierThan?: string
  /** Text of a `finishNoLaterThan` constraint. Default "Finish no later than". */
  finishNoLaterThan?: string
  /** Text of a `fixedStart` constraint. Default "Must start on". */
  fixedStart?: string
  /** Added after a constraint that the bar's dates break, in descriptions and handle values. Default "violated". */
  constraintViolated?: string
  /** Description of the constraint handles (`constraintsEditable`). Default lists the keys. */
  constraintHint?: string
  /** Announced when `validateConstraintEdit` returns false. Default "This constraint change was rejected." */
  constraintRejected?: string
}

/** Props of the NetworkGraph `node` slot. `N` types the node. */
export interface NetworkNodeSlot<N extends NetworkNode = NetworkNode> {
  node: N
  box: GraphBox
  selected: boolean
  dimmed?: boolean
  /** The current camera scale, for level-of-detail rendering in custom node slots. */
  scale: number
}

/** A waypoint proposal from NetworkGraph (`editableEdges`). Set the edge's `points` to `after` to accept it. */
export interface GraphEdgeReshape {
  id: string
  /** The edge's waypoints before the change; empty when it had none. */
  before: GraphPoint[]
  /** The proposed waypoints; empty when the last one was removed. */
  after: GraphPoint[]
}

/**
 * A resize proposal from NetworkGraph (`resizable`). Set the node's size to `after.width` and `after.height` (the `sizes`
 * prop) and, when `after.x` or `after.y` changed, its position (the `positions` prop).
 */
export interface GraphNodeResize {
  id: string
  before: GraphRect
  after: GraphRect
}

/** A visual group. `parentId` nests it inside another group; `nodeIds` lists only its direct members. */
export interface NetworkGroup extends GraphGroup {
  parentId?: string
}

export interface NetworkFocusOptions {
  /** Camera scale after centering, between 0.1 and 3. Defaults to the current scale. */
  scale?: number
}

/** Options of the NetworkGraph `fit` method. Without options, `fit()` shows the whole graph. */
export interface GraphFitOptions {
  /** Node IDs whose combined boxes are fitted. An empty list leaves the camera unchanged. */
  ids?: Iterable<string>
  /** Nonnegative margin in screen pixels kept around the fitted content. Default 0. */
  padding?: number
}

/** The element a NetworkGraph `context-menu` event refers to. */
export type GraphContextMenuTarget =
  | { kind: 'node'; id: string }
  | { kind: 'edge'; id: string }
  | { kind: 'group'; id: string }
  | { kind: 'canvas' }

/** Payload of the NetworkGraph `context-menu` event. The component renders no menu itself. */
export interface GraphContextMenu {
  target: GraphContextMenuTarget
  /** The pointer position, or the centre of the focused element, in chart (world) coordinates. */
  point: GraphPoint
  /** Viewport coordinates for positioning a menu, for example with `position: fixed`. */
  clientX: number
  clientY: number
  source: 'pointer' | 'keyboard'
}

/**
 * Payload of the NetworkGraph `copy-selection` and `duplicate-selection` events: node and edge IDs in input order, including every edge
 * between two listed nodes, and the current top-left position of each listed node in chart coordinates.
 */
export interface GraphClipboardSelection {
  nodeIds: string[]
  edgeIds: string[]
  positions: Map<string, GraphPoint>
}

/** Payload of the NetworkGraph `paste-request` event: where to place the pasted content, in chart coordinates. */
export interface GraphPaste {
  point: GraphPoint
}

/** Props of the NetworkGraph `tooltip` slot. `N` and `E` type the node or edge under the pointer. */
export interface NetworkTooltipSlot<N extends NetworkNode = NetworkNode, E extends GraphEdge = GraphEdge> {
  target: { kind: 'node'; node: N } | { kind: 'edge'; edge: E }
}

/** The bar end a dependency handle belongs to. `start` maps to S and `finish` to F in a dependency type. */
export type TimelineBarEnd = 'start' | 'finish'

export type TimelineDependencyType = 'FS' | 'SS' | 'FF' | 'SF'

/** A dependency proposal from GanttChart. The parent assigns an ID and updates `dependencies`. */
export interface TimelineConnection {
  from: string
  to: string
  type: TimelineDependencyType
  /**
   * The dependency's lag. Present only in `reconnect` proposals (`before` and `after`) of a dependency with a non-zero
   * lag, which a reconnection keeps. New `connect` proposals never carry one.
   */
  lag?: number
}

export interface TimelineReconnect {
  id: string
  before: TimelineConnection
  after: TimelineConnection
}

export type TimelineConnectionValidator = (
  connection: TimelineConnection,
  replacingDependencyId?: string,
) => boolean | string | void

export type BatchEditValidator = (changes: readonly TimelineEdit[]) => boolean | string | void

/** A progress proposal from GanttChart (`progressEditable`). The parent sets the bar's `progress` to `after`. */
export interface TimelineProgressEdit {
  id: string
  /** The bar's progress before the edit, or undefined when the bar had none (drawn as 0). */
  before: number | undefined
  /** Proposed progress from 0 to 1, snapped to `progressStep`; Home and End propose exactly 0 and 1. */
  after: number
  source: 'pointer' | 'keyboard'
}

export type ProgressEditValidator = (change: TimelineProgressEdit) => boolean | string | void

/** Synchronous check of a `bars-delete` proposal. Accept with true or undefined; reject with false or a reason. */
export type BarsDeleteValidator = (ids: readonly string[]) => boolean | string | void

/**
 * A new bar proposed by GanttChart (`creatable`): a drag or click on an empty part of a row, or the row's add button.
 * The parent assigns an ID and a label and adds the bar to accept it.
 */
export interface TimelineCreate {
  rowId: string
  /** Zero-based lane: the lane under the pointer, or the lowest free lane for the add button. */
  lane: number
  start: number
  end: number
  /** `keyboard` when the add button was activated with Enter or Space. */
  source: 'pointer' | 'keyboard'
}

/** A place in a row hierarchy: the parent row (absent for a root row) and the zero-based index among its children. */
export interface TimelineRowPosition {
  parentId?: string
  index: number
}

/**
 * A row hierarchy proposal from GanttChart (`rowsReorderable`). Apply it with
 * `moveTimelineRow(rows, change.id, change.after)`. `after.index` counts the new siblings without the moved row.
 */
export interface TimelineRowMove {
  id: string
  before: TimelineRowPosition
  after: TimelineRowPosition
  source: 'pointer' | 'keyboard'
}

/** Synchronous check of a `row-move` proposal. Accept with true or undefined; reject with false or a reason. */
export type RowMoveValidator = (change: TimelineRowMove) => boolean | string | void

/**
 * A column width proposal from GanttChart (`columnsResizable`). `id` is the `TimelineColumn.id`, or
 * `timelineLabelColumnId` for the row label column; set that column's `width` (or the `labelWidth` prop) to `after`
 * to accept it. Widths are in CSS pixels.
 */
export interface TimelineColumnResize {
  id: string
  before: number
  after: number
  source: 'pointer' | 'keyboard'
}

/** Synchronous check of a `column-resize` proposal. Accept with true or undefined; reject with false or a reason. */
export type ColumnResizeValidator = (change: TimelineColumnResize) => boolean | string | void

/** Synchronous check of a `create` proposal. Accept with true or undefined; reject with false or a reason. */
export type CreateValidator = (proposal: TimelineCreate) => boolean | string | void

/**
 * Auto-scheduling hook of GanttChart (`cascade`): the follow-on changes of other bars for one proposed move or resize.
 * It must be synchronous and free of side effects, because it also runs for every snapped step of a drag preview.
 */
export type TimelineCascade = (change: TimelineEdit) => readonly TimelineEdit[]

/** What a GanttChart `context-menu` event was opened on. */
export type TimelineContextTarget =
  | { kind: 'bar'; id: string }
  | { kind: 'dependency'; id: string }
  | { kind: 'row'; id: string }
  | { kind: 'chart' }

/** Payload of the GanttChart `context-menu` event. The component renders no menu itself. */
export interface TimelineContextMenu {
  target: TimelineContextTarget
  /** Time under the pointer when it is over the time area. Absent for the keyboard. */
  time?: number
  /** Displayed task row under the pointer, or the row of a bar opened from the keyboard. */
  rowId?: string
  /** Viewport coordinates of the pointer, or of the focused element's centre for the keyboard. */
  clientX: number
  clientY: number
  source: 'pointer' | 'keyboard'
}

/** Options of the GanttChart `fitToBars` method. */
export interface TimelineFitOptions {
  /** Space in screen pixels kept on each side of the fitted bars. Default 24. */
  padding?: number
}

export interface TimelineZoomPreset {
  id: string
  label: string
  pixelsPerUnit: number
  tickSteps?: readonly number[]
  headerBands?: readonly (readonly TimelineBand[])[]
  snap?: number
}

export interface TimelineZoomState {
  zoom: number
  preset?: string
}

export interface TimelineLoadRow {
  id: string
  label: string
  detail?: string
}

/** Structurally compatible with `ResourceLoadSegment` from `calculateResourceLoad`. */
export interface TimelineLoadSegment extends TimeRange {
  resourceId: string
  load: number
  capacity: number
  overload?: number
  taskIds?: readonly string[]
}

export type CalendarBandUnit = 'hour' | 'day' | 'week' | 'month' | 'year'

/** Local wall-clock fields of a band start, in the `timeZone` or fixed offset of `calendarBands`. */
export interface CalendarBandLocalTime {
  /** Astronomical year: 0 is 1 BC. */
  year: number
  /** 1 to 12. */
  month: number
  day: number
  hour: number
  minute: number
  /** 0 = Sunday to 6 = Saturday. */
  weekday: number
  /** Local time minus UTC at the band start, in minutes. Can be fractional for historical local mean time. */
  utcOffsetMinutes: number
  /** The `timeZone` option, or undefined for a fixed offset. */
  timeZone?: string
}

export interface CalendarBandOptions {
  /** Fixed offset from UTC in minutes. Daylight-saving transitions are not applied. Cannot be combined with `timeZone`. */
  utcOffsetMinutes?: number
  /**
   * IANA time zone such as `Europe/Berlin`. Bands then follow local dates and hours with daylight-saving rules, so a
   * day band can last 23 or 25 hours. Cannot be combined with `utcOffsetMinutes`.
   */
  timeZone?: string
  /** Number of units per band. Defaults to 1. */
  step?: number
  /** First day of a week, 0 = Sunday to 6 = Saturday. Defaults to 1 (Monday). */
  weekStartsOn?: number
  /** Label for an unclipped band. Times are epoch milliseconds; `local` holds the local fields of `start`. */
  label?: (start: number, end: number, local: CalendarBandLocalTime) => string
}

/** Text direction of a component. `auto` follows the inherited CSS direction after mounting. */
export type ChartDirection = 'ltr' | 'rtl' | 'auto'

/** Options of the `exportSvg` method on GanttChart. Current props, collapsed rows and zoom supply everything else. */
/** `R` and `B` type the rows and bars that `rowLabel` and `barLabel` receive. */
export interface GanttExportOptions<R extends TimelineRow = TimelineRow, B extends TimelineBar = TimelineBar> {
  /** Export only this time window. Defaults to the whole `range`. */
  timeRange?: TimeRange
  /** Export displayed rows `start` (inclusive) to `end` (exclusive), counted after collapsing. Defaults to all. */
  rowRange?: { start: number; end: number }
  /** Include load histogram rows. Default true. */
  includeLoad?: boolean
  /** Paint an opaque background. Default true. */
  background?: boolean
  title?: string
  /** Heading of the row column. Defaults to `labels.rows`; the `row-heading` slot is not exported. */
  rowHeading?: string
  /** Prefix for marker and clip-path IDs. Defaults to an ID unique to the component instance. */
  idPrefix?: string
  /** Colours that replace the values read from the `--vw-*` custom properties. */
  theme?: SvgExportThemeInput
  barLabel?: (bar: B) => string
  rowLabel?: (row: R) => string
  /** Include the `statusDate` line and, with `showProgressLine`, the progress line. Default true. */
  includeStatusDate?: boolean
}

/** Options of the `exportSvg` method on NetworkGraph. */
/** `N` and `E` type the nodes and edges that the label callbacks receive. */
export interface GraphExportOptions<N extends NetworkNode = NetworkNode, E extends GraphEdge = GraphEdge> {
  /** Margin around the content in pixels. Default 16. */
  padding?: number
  /** Paint an opaque background. Default true. */
  background?: boolean
  title?: string
  /** Prefix for marker IDs. Defaults to an ID unique to the component instance. */
  idPrefix?: string
  /** Colours that replace the values read from the `--vw-*` custom properties. */
  theme?: SvgExportThemeInput
  /** Draw selected nodes in the selected style. Default true. */
  includeSelection?: boolean
  nodeLabel?: (node: N) => string
  nodeDetail?: (node: N) => string | undefined
  edgeLabel?: (edge: E) => string | undefined
}

/** Raster options shared by the `exportPng` methods. */
export interface PngExportOptions {
  /** Device pixels per CSS pixel, greater than 0 and at most 8. Default 1. */
  scale?: number
}

export interface GanttPngExportOptions<R extends TimelineRow = TimelineRow, B extends TimelineBar = TimelineBar>
  extends GanttExportOptions<R, B>, PngExportOptions {}
export interface GraphPngExportOptions<N extends NetworkNode = NetworkNode, E extends GraphEdge = GraphEdge>
  extends GraphExportOptions<N, E>, PngExportOptions {}
