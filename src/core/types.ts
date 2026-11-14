import type { GraphBox, GraphEdge, GraphLayout, GraphPoint, IdentifiedNode } from './graph.js'
import type { GraphGroup } from './graph.js'
import type { EditMode, TimeRange } from './timeline.js'
import type { SvgExportThemeInput } from './exportSvg.js'

export type ChartTone = 'teal' | 'blue' | 'amber' | 'violet'

export interface NetworkNode extends IdentifiedNode {
  label: string
  detail?: string
  tone?: ChartTone
  draggable?: boolean
  /** False keeps the node out of NetworkGraph deletion proposals (`deletable`). */
  deletable?: boolean
  shape?: 'box' | 'rounded'
  data?: unknown
}

export type GraphLayoutFunction = (
  nodes: readonly NetworkNode[],
  edges: readonly GraphEdge[],
) => GraphLayout

export interface GraphViewport {
  x: number
  y: number
  scale: number
}

export interface TimelineRow {
  id: string
  parentId?: string
  label: string
  detail?: string
  data?: unknown
}

export interface TimelineBar extends TimeRange {
  id: string
  rowId: string
  label: string
  lane?: number
  tone?: ChartTone
  appearance?: 'outline' | 'solid'
  editable?: boolean
  progress?: number
  baseline?: TimeRange
  data?: unknown
}

export interface TimelineSummary extends TimeRange {
  count: number
  progress?: number
}

export interface TimelineColumn {
  id: string
  label: string
  width: number
  value: (row: TimelineRow, summary?: TimelineSummary) => string | number
  editable?: boolean | ((row: TimelineRow) => boolean)
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
  baseline?: string
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
}

export interface NetworkNodeSlot {
  node: NetworkNode
  box: GraphBox
  selected: boolean
  dimmed?: boolean
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

/** Props of the NetworkGraph `tooltip` slot. */
export interface NetworkTooltipSlot {
  target: { kind: 'node'; node: NetworkNode } | { kind: 'edge'; edge: GraphEdge }
}

/** The bar end a dependency handle belongs to. `start` maps to S and `finish` to F in a dependency type. */
export type TimelineBarEnd = 'start' | 'finish'

export type TimelineDependencyType = 'FS' | 'SS' | 'FF' | 'SF'

/** A dependency proposal from GanttChart. The parent assigns an ID and updates `dependencies`. */
export interface TimelineConnection {
  from: string
  to: string
  type: TimelineDependencyType
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

export interface CalendarBandOptions {
  /** Fixed offset from UTC in minutes. Daylight-saving transitions are not applied. */
  utcOffsetMinutes?: number
  /** Number of units per band. Defaults to 1. */
  step?: number
  /** First day of a week, 0 = Sunday to 6 = Saturday. Defaults to 1 (Monday). */
  weekStartsOn?: number
  /** Label for an unclipped band. Times are epoch milliseconds. */
  label?: (start: number, end: number) => string
}

/** Text direction of a component. `auto` follows the inherited CSS direction after mounting. */
export type ChartDirection = 'ltr' | 'rtl' | 'auto'

/** Options of the `exportSvg` method on GanttChart. Current props, collapsed rows and zoom supply everything else. */
export interface GanttExportOptions {
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
  /** Colours that replace the values read from the `--vft-*` custom properties. */
  theme?: SvgExportThemeInput
  barLabel?: (bar: TimelineBar) => string
  rowLabel?: (row: TimelineRow) => string
}

/** Options of the `exportSvg` method on NetworkGraph. */
export interface GraphExportOptions {
  /** Margin around the content in pixels. Default 16. */
  padding?: number
  /** Paint an opaque background. Default true. */
  background?: boolean
  title?: string
  /** Prefix for marker IDs. Defaults to an ID unique to the component instance. */
  idPrefix?: string
  /** Colours that replace the values read from the `--vft-*` custom properties. */
  theme?: SvgExportThemeInput
  /** Draw selected nodes in the selected style. Default true. */
  includeSelection?: boolean
  nodeLabel?: (node: NetworkNode) => string
  nodeDetail?: (node: NetworkNode) => string | undefined
  edgeLabel?: (edge: GraphEdge) => string | undefined
}

/** Raster options shared by the `exportPng` methods. */
export interface PngExportOptions {
  /** Device pixels per CSS pixel, greater than 0 and at most 8. Default 1. */
  scale?: number
}

export interface GanttPngExportOptions extends GanttExportOptions, PngExportOptions {}
export interface GraphPngExportOptions extends GraphExportOptions, PngExportOptions {}
