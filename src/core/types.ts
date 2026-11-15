import type { GraphBox, GraphEdge, GraphLayout, IdentifiedNode } from './graph.js'
import type { EditMode, TimeRange } from './timeline.js'
import type { TimelineFieldSpec } from './fieldEditing.js'

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
  /** Optional typed field definition. Leave it unset to keep the plain text cell behaviour. */
  field?: TimelineFieldSpec
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
}

export interface NetworkNodeSlot {
  node: NetworkNode
  box: GraphBox
  selected: boolean
}
