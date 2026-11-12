import type { GraphBox, GraphEdge, GraphLayout, IdentifiedNode } from './graph.js'
import type { GraphGroup } from './graph.js'
import type { EditMode, TimeRange } from './timeline.js'

export type ChartTone = 'teal' | 'blue' | 'amber' | 'violet'

export interface NetworkNode extends IdentifiedNode {
  label: string
  detail?: string
  tone?: ChartTone
  draggable?: boolean
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
