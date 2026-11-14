<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, onUnmounted, ref, shallowRef, useId, watch } from 'vue'
import type { TimelineBar, TimelineDependency, TimelineRow, TimelineEdit, GanttLabels, EditValidator, TimelineBand, TimelineMarker, TimelineColumn, TimelineCellEdit, TimelineSummary } from '../core/types.js'
import type {
  BatchEditValidator, TimelineBarEnd, TimelineConnection, TimelineConnectionValidator, TimelineLoadRow, TimelineLoadSegment,
  TimelineReconnect, TimelineZoomPreset, TimelineZoomState,
} from '../core/types.js'
import {
  createTimeScale, createTimelineRowTree, dependencyPath, dependencyTimes, editTimeRange, intersectsWindow, validateTimelineData,
  summarizeTimelineRows, timeTicks, timelineLabelColumnId, visibleRows, type EditMode, type TimeRange, type TimeScale,
} from '../core/timeline.js'
import { dependencyEndsForType, dependencyTypeForEnds, moveTimeRanges, resourceLoadHistogram, type ResourceLoadHistogram } from '../core/timeline.js'
import type { ChartDirection, GanttExportOptions, GanttPngExportOptions } from '../core/types.js'
import type {
  BarsDeleteValidator, ProgressEditValidator, TimelineContextMenu, TimelineContextTarget, TimelineFitOptions, TimelineProgressEdit,
} from '../core/types.js'
import type { CreateValidator, TimelineCascade, TimelineCreate } from '../core/types.js'
import type { RowMoveValidator, TimelineRowMove, TimelineRowPosition } from '../core/types.js'
import type { ColumnResizeValidator, TimelineColumnResize } from '../core/types.js'
import { renderTimelineSvg } from '../core/exportSvg.js'
import { checkNonWorkingPeriods, progressAt, progressTime, segmentPieces, snapProgress } from '../core/barSegments.js'
import { progressLinePoints, progressLineTime } from '../core/barSegments.js'
import { exportFont, rasterizeSvg, readExportTheme } from './exportImage.js'

const props = withDefaults(defineProps<{
  /** Rows of the chart, in display order. Each has an ID, label, optional detail, optional `parentId` for hierarchy, and opaque data. Required. */
  rows: readonly TimelineRow[]
  /** Bars drawn on the rows. Each has an ID, `rowId`, label and numeric half-open `[start, end)` interval in the units of `range`; a zero-duration bar is a milestone. Required. */
  bars: readonly TimelineBar[]
  /** Links between bars by ID, with an optional FS, SS, FF or SF type. They are drawn only; scheduling constraints are enforced by the application. Default: `[]`. */
  dependencies?: readonly TimelineDependency[]
  /** IDs of dependencies drawn with the highlight style. */
  highlightedDependencyIds?: ReadonlySet<string>
  /** Visible axis bounds as a finite `{ start, end }` with `start < end`, in the caller's time units. Required. */
  range: TimeRange
  /** Base linear time scale in pixels per time unit. Default: 80 pixels per hour, in milliseconds. */
  pixelsPerUnit?: number
  /** Candidate tick intervals in time units, positive and ascending. The first step that keeps tick labels at least 76 px apart is used. Default: 30 minutes, 1, 2, 4 and 24 hours, in milliseconds. */
  tickSteps?: readonly number[]
  /** Step in time units that edit displacements snap to; also the default minimum duration. Default: 900000 (15 minutes in milliseconds). */
  snap?: number
  /** Formats a time for tick labels and accessible bar labels. Default: UTC `HH:mm`. */
  formatTime?: (time: number) => string
  /** Controlled set of selected bar IDs, highlighted in the chart. With `multiSelect`, clicks propose changes through `update:selectedIds`. */
  selectedIds?: ReadonlySet<string>
  /** Controlled set of collapsed row IDs. When omitted, the component keeps the collapsed set itself; changes are reported through `update:collapsedIds`. */
  collapsedIds?: ReadonlySet<string>
  /** Header levels drawn above the ticks. Each level is an ordered list of non-overlapping `{ start, end, label }` intervals. */
  headerBands?: readonly (readonly TimelineBand[])[]
  /** Vertical markers with a unique ID, finite time and label, drawn inside the visible time window. */
  markers?: readonly TimelineMarker[]
  /** Extra sticky columns next to the row label, each with an ID, label, pixel width, `value(row, summary)` and optional `editable`. */
  columns?: readonly TimelineColumn[]
  /** Draws an aggregated interval on parent rows that have no bar of their own. Opt-in. Default: false. */
  showSummaries?: boolean
  /** Synchronous check of a cell edit proposal. Return `true` or nothing to accept, `false` or a reason string to reject. */
  validateCellEdit?: (change: TimelineCellEdit) => boolean | string | void
  /** Fixed row height in pixels; at least `8 + laneCount * 14`. Default: 66. */
  rowHeight?: number
  /** Number of bar lanes per row. Default: 1. */
  laneCount?: number
  /** Height of the scroll viewport, as a number of pixels or a CSS length. Default: 316px. */
  height?: number | string
  /** Overrides for the English UI strings and accessible names; fields you omit keep their defaults. */
  labels?: Partial<GanttLabels>
  /** Disables all editing (bar edits, connections, creation, deletion, progress, row moves and cell edits). Default: false. */
  readonly?: boolean
  /** Interval that bars must stay inside to be editable and that proposals are kept within. Default: `range`. */
  editBounds?: TimeRange
  /** Smallest duration, in time units, that a resize may propose. Default: the active `snap`. */
  minDuration?: number
  /** Synchronous check of a bar edit proposal. Return `true` or nothing to accept, `false` or a reason string to reject. */
  validateEdit?: EditValidator
  /** Custom time-to-pixel mapping that replaces the linear scale, before component zoom is applied. */
  scale?: TimeScale
  /** Shows the zoom buttons. Default: true. */
  showControls?: boolean
  /** Scrolls the timeline horizontally while a pointer drag is held near the left or right edge of the viewport. Default: true. */
  autoScroll?: boolean
  /** Shows link handles on bars so a drag or two activations propose a new dependency through `connect`. Opt-in. Default: false. */
  connectable?: boolean
  /** Lets a selected dependency be moved to other bar ends, proposed through `reconnect`. Opt-in. Default: false. */
  reconnectable?: boolean
  /** Synchronous check of a connection proposal; receives the existing dependency ID when reconnecting. Return `true` or nothing to accept, `false` or a reason string to reject. */
  validateConnection?: TimelineConnectionValidator
  /** Controlled selected dependency ID. When omitted, the component tracks the selection itself. */
  selectedDependencyId?: string
  /** With `selectedIds`, click toggles membership with Ctrl, Meta or Shift and moves all selected editable bars together. Opt-in. Default: false. */
  multiSelect?: boolean
  /** Synchronous check of a whole batch of edits. Without it, each change goes through `validateEdit` and the first rejection rejects the batch. */
  validateEdits?: BatchEditValidator
  /** Lets a move also propose a different row for a bar, by pointer or Up/Down arrows, carried as `row` on the edit. Opt-in. Default: false. */
  rowDraggable?: boolean
  /** Named zoom levels, each with a unique `id`, label, `pixelsPerUnit` and optional `tickSteps`, `headerBands` and `snap`. The active preset replaces the matching props. */
  zoomPresets?: readonly TimelineZoomPreset[]
  /** Controlled ID of the active zoom preset. An unknown ID is reported through `validation-error`. */
  zoomPreset?: string
  /** Draws a "now" marker. Opt-in. Default: false. */
  showNow?: boolean
  /** Time of the "now" marker, in the units of `range`. Supply it for deterministic output; otherwise the clock is read after mounting. */
  now?: number
  /** Resource load rows drawn below the task rows on the same time axis. Each has a unique ID, label and optional detail. */
  loadRows?: readonly TimelineLoadRow[]
  /** Load segments (`resourceId`, `start`, `end`, `load`, `capacity`) drawn in the load rows. They must reference a load row and not overlap within a resource. */
  loadSegments?: readonly TimelineLoadSegment[]
  /** Height of each load row in pixels; at least 16. Default: 44. */
  loadRowHeight?: number
  /** Zooms the time axis between 65% and 300% with a two-finger pinch. Opt-in. Default: false. */
  pinchZoom?: boolean
  /** Text direction: `ltr`, `rtl` or `auto`. `rtl` places row headings on the right and runs time right to left. Default: `ltr`. */
  dir?: ChartDirection
  /** Half-open intervals shaded as non-working time behind the grid. They may overlap and need not be sorted. */
  nonWorkingPeriods?: readonly TimeRange[]
  /** Shows a progress slider on editable bars, proposed through `progress-edit`. Opt-in. Default: false. */
  progressEditable?: boolean
  /** Step that progress proposals snap to, greater than 0 and at most 1. Default: 0.05. */
  progressStep?: number
  /** Synchronous check of a progress edit proposal. Return `true` or nothing to accept, `false` or a reason string to reject. */
  validateProgressEdit?: ProgressEditValidator
  /** Lets Delete or Backspace on a focused deletable bar propose its removal through `bars-delete`. Opt-in. Default: false. */
  deletable?: boolean
  /** Synchronous check of a bar deletion proposal. Return `true` or nothing to accept, `false` or a reason string to reject. */
  validateBarsDelete?: BarsDeleteValidator
  /** Hover delay in milliseconds before the `tooltip` slot appears; finite and nonnegative. Default: 400. */
  tooltipDelay?: number
  /** Reports context menu requests through `context-menu` instead of opening the browser menu. The component renders no menu. Opt-in. Default: false. */
  contextMenu?: boolean
  /** Enables proposing new bars by dragging or clicking an empty part of a row, or via its add button. Pass `true` for every row or a predicate to choose rows. Default: false. */
  creatable?: boolean | ((row: TimelineRow) => boolean)
  /** Length in time units of a bar proposed by a click or the add button; finite and positive. Default: 4 times `snap`. */
  createDuration?: number
  /** Synchronous check of a new bar proposal. Return `true` or nothing to accept, `false` or a reason string to reject. */
  validateCreate?: CreateValidator
  /** Synchronous, side-effect-free callback returning follow-on edits of other bars for a move or resize. They are previewed during a drag and proposed with it as one batch through `edits`. */
  cascade?: TimelineCascade
  /** Shows a move handle on each row heading to propose hierarchy moves by drag or Alt+arrow keys, through `row-move`. Opt-in. Default: false. */
  rowsReorderable?: boolean
  /** Synchronous check of a row move proposal. Return `true` or nothing to accept, `false` or a reason string to reject. */
  validateRowMove?: RowMoveValidator
  /** Time in the units of `range` at which a labelled status-date line is drawn. Must be finite. */
  statusDate?: number
  /** With `statusDate`, also draws a progress line that kinks to each bar's progress point. No effect without `statusDate`. Opt-in. Default: false. */
  showProgressLine?: boolean
  /** Shows resize separators on the row label column and each extra column, proposing new widths through `column-resize`. Opt-in. Default: false. */
  columnsResizable?: boolean
  /** Width in pixels of the row label column; finite and positive. Default: the theme width. */
  labelWidth?: number
  /** Smallest width in pixels that a column resize may propose. Default: 48. */
  minColumnWidth?: number
  /** Largest width in pixels that a column resize may propose; at least `minColumnWidth`. Default: 800. */
  maxColumnWidth?: number
  /** Synchronous check of a column resize proposal. Return `true` or nothing to accept, `false` or a reason string to reject. */
  validateColumnResize?: ColumnResizeValidator
}>(), {
  dir: 'ltr',
  progressStep: 0.05,
  tooltipDelay: 400,
  showControls: true,
  autoScroll: true,
  dependencies: () => [],
  rowHeight: 66,
  laneCount: 1,
  pixelsPerUnit: 80 / 3_600_000,
  tickSteps: () => [1_800_000, 3_600_000, 7_200_000, 14_400_000, 86_400_000],
  snap: 900_000,
  formatTime: (time: number) => new Date(time).toISOString().slice(11, 16),
  loadRowHeight: 44,
})
const emit = defineEmits<{
  /** A bar was activated by click or Enter/Space; carries its ID. Fires once per click, on release. */
  select: [id: string]
  /** Invalid input data or props were detected; carries the error. The chart then renders its empty state. */
  'validation-error': [error: Error]
  /** Proposal to move or resize one bar. The parent applies it by updating the bar. */
  edit: [change: TimelineEdit]
  /** The set of collapsed row IDs changed; supports `v-model:collapsed-ids`. */
  'update:collapsedIds': [ids: Set<string>]
  /** Proposal to change a column cell; `after` is a string the parent converts and applies. */
  'cell-edit': [change: TimelineCellEdit]
  /** A cell edit was rejected by `validateCellEdit`; carries the proposal and the reason. */
  'cell-edit-rejected': [change: TimelineCellEdit, reason: string]
  /** A bar edit was rejected by `validateEdit`; carries the proposal and the reason. */
  'edit-rejected': [change: TimelineEdit, reason: string]
  /** The set of selected bar IDs changed; supports `v-model:selected-ids`. */
  'update:selectedIds': [ids: Set<string>]
  /** Proposal for several bar changes at once, from a multiple-selection move or a `cascade`. The parent applies them together. */
  edits: [changes: TimelineEdit[]]
  /** A batch of edits was rejected; carries the proposals and the reason. */
  'edits-rejected': [changes: TimelineEdit[], reason: string]
  /** Proposal to add a dependency; carries `from`, `to` and the derived type. The parent assigns an ID and adds it. */
  connect: [connection: TimelineConnection]
  /** Proposal to move a dependency endpoint; carries the ID plus `before` and `after` connections. The parent replaces the dependency. */
  reconnect: [change: TimelineReconnect]
  /** A connection or reconnection was rejected by `validateConnection`; carries the proposal and the reason. */
  'connect-rejected': [connection: TimelineConnection, reason: string]
  /** A dependency was activated by click, Enter or Space; carries its ID. */
  'dependency-select': [id: string]
  /** The selected dependency ID changed; supports `v-model:selected-dependency-id`. */
  'update:selectedDependencyId': [id: string]
  /** Delete or Backspace was pressed on a focused dependency; carries its ID. The parent removes it to accept. Not emitted when `readonly`. */
  'dependency-delete': [id: string]
  /** The active zoom preset changed; carries the preset ID. Supports `v-model:zoom-preset`. */
  'update:zoomPreset': [id: string]
  /** The zoom factor or active preset changed through the buttons, presets or pinch; carries the zoom state. */
  'zoom-change': [state: TimelineZoomState]
  /** Proposal to change a bar's progress (0 to 1). The parent sets `progress` to `after` to accept. */
  'progress-edit': [change: TimelineProgressEdit]
  /** A progress edit was rejected by `validateProgressEdit`; carries the proposal and the reason. */
  'progress-edit-rejected': [change: TimelineProgressEdit, reason: string]
  /** Proposal to remove bars; carries their IDs. The parent removes them to accept. */
  'bars-delete': [ids: string[]]
  /** A bar deletion was rejected by `validateBarsDelete`; carries the IDs and the reason. */
  'bars-delete-rejected': [ids: string[], reason: string]
  /** A context menu was requested by pointer or keyboard; carries the target, position and source. Only with `contextMenu`. */
  'context-menu': [event: TimelineContextMenu]
  /** Proposal to add a bar; carries `rowId`, `lane`, `start`, `end` and `source`. The parent assigns an ID and adds it. */
  create: [proposal: TimelineCreate]
  /** A new bar was rejected by `validateCreate`; carries the proposal and the reason. */
  'create-rejected': [proposal: TimelineCreate, reason: string]
  /** Proposal to move a row in the hierarchy; carries `before` and `after` positions. Apply it with `moveTimelineRow`. */
  'row-move': [change: TimelineRowMove]
  /** A row move was rejected by `validateRowMove`; carries the proposal and the reason. */
  'row-move-rejected': [change: TimelineRowMove, reason: string]
  /** Proposal to resize a column; carries `id`, `before` and `after` widths in pixels. The parent applies the new width. */
  'column-resize': [change: TimelineColumnResize]
  /** A column resize was rejected by `validateColumnResize`; carries the proposal and the reason. */
  'column-resize-rejected': [change: TimelineColumnResize, reason: string]
}>()

const slots = defineSlots<{
  legend(): unknown
  'row-heading'(): unknown
  row(props: { row: TimelineRow; index: number; depth: number; expanded: boolean }): unknown
  cell(props: { row: TimelineRow; column: TimelineColumn; value: string | number; summary?: TimelineSummary }): unknown
  bar(props: { bar: TimelineBar; range: TimeRange; selected: boolean }): unknown
  tick(props: { time: number; label: string }): unknown
  empty(): unknown
  'load-row'(props: { row: TimelineLoadRow; peak: number }): unknown
  'load-segment'(props: { segment: TimelineLoadSegment; row: TimelineLoadRow; peak: number; overload: number }): unknown
  tooltip(props: { bar: TimelineBar; range: TimeRange; selected: boolean }): unknown
}>()
const messages = computed<GanttLabels>(() => ({
  region: 'Gantt chart', rows: 'Rows', empty: 'No rows to display',
  zoom: 'Timeline zoom', zoomIn: 'Zoom in', zoomOut: 'Zoom out',
  editHint: 'Arrow keys move. Shift resizes the end. Alt resizes the start. Escape cancels.',
  expandRow: 'Expand', collapseRow: 'Collapse', baseline: 'Baseline',
  rejected: 'This change was rejected.',
  connectFrom: 'Start dependency from', connectTo: 'Connect dependency to', startOf: 'start of', finishOf: 'finish of',
  selectDependency: 'Select dependency', reconnectSource: 'Reconnect source of', reconnectTarget: 'Reconnect target of',
  connectionRejected: 'This dependency was rejected.', zoomPresets: 'Zoom level', now: 'Now',
  loadRegion: 'Resource load', load: 'load', capacity: 'capacity', overload: 'overloaded by',
  moveRowHint: 'Up and Down arrows move the bar to another row.',
  critical: 'Critical', float: 'Float until', deadline: 'Deadline', late: 'Late',
  progressOf: 'Progress of', deleteHint: 'Delete or Backspace removes the bar.',
  createIn: 'Add bar to', createRejected: 'This new bar was rejected.',
  moveRow: 'Move row', rowMoveRejected: 'This row move was rejected.', statusDate: 'Status date',
  resizeColumn: 'Resize column', columnResizeRejected: 'This column resize was rejected.',
  // Indenting follows the visual direction: towards the row text, which is on the right in right-to-left charts.
  moveRowKeysHint: `Alt+Up and Alt+Down move the row among its siblings. Alt+Shift+${rtl.value ? 'Left' : 'Right'} indents it and `
    + `Alt+Shift+${rtl.value ? 'Right' : 'Left'} outdents it. Drag to move it; Escape cancels.`,
  ...props.labels,
}))
const notice = ref('')
const bounds = computed(() => props.editBounds ?? props.range)
// Zoom presets replace the linear scale settings while they are active.
const localPreset = ref<string>()
const activePreset = computed(() => {
  const id = props.zoomPreset ?? localPreset.value
  return id === undefined ? undefined : props.zoomPresets?.find(preset => preset.id === id)
})
const activePixelsPerUnit = computed(() => activePreset.value?.pixelsPerUnit ?? props.pixelsPerUnit)
const activeTickSteps = computed(() => activePreset.value?.tickSteps ?? props.tickSteps)
const activeBands = computed(() => activePreset.value?.headerBands ?? props.headerBands)
const activeSnap = computed(() => activePreset.value?.snap ?? props.snap)
const minimum = computed(() => props.minDuration ?? activeSnap.value)
// Invalid input is reported through `validation-error` and never rendered. The error is rethrown so
// development builds still surface it (production Vue logs it instead of rendering invalid data).
const validationError = ref<Error>()
const tree = shallowRef<ReturnType<typeof createTimelineRowTree>>([])
const loadHistogram = shallowRef<Map<string, ResourceLoadHistogram>>()
function validateLoad() {
  if (!props.loadRows?.length) {
    if (props.loadSegments?.length) throw new Error('loadSegments require loadRows')
    return undefined
  }
  const ids = new Set<string>()
  for (const row of props.loadRows) {
    if (!row.id || ids.has(row.id)) throw new Error('Invalid or duplicate load row ID: ' + row.id)
    ids.add(row.id)
  }
  if (!Number.isFinite(props.loadRowHeight) || props.loadRowHeight < 16) throw new RangeError('loadRowHeight must be at least 16')
  return resourceLoadHistogram(props.loadSegments ?? [], ids)
}
function validatePresets() {
  const ids = new Set<string>()
  for (const preset of props.zoomPresets ?? []) {
    if (!preset.id || ids.has(preset.id)) throw new Error('Invalid or duplicate zoom preset: ' + preset.id)
    if (!Number.isFinite(preset.pixelsPerUnit) || preset.pixelsPerUnit <= 0) throw new RangeError('Invalid zoom preset pixelsPerUnit: ' + preset.id)
    ids.add(preset.id)
  }
  if (props.zoomPreset !== undefined && !ids.has(props.zoomPreset)) throw new Error('Unknown zoom preset: ' + props.zoomPreset)
}
function validateProps() {
  validateTimelineData(props.rows, props.bars, props.dependencies, props.laneCount)
  validatePresets()
  createTimeScale(props.range, activePixelsPerUnit.value)
  createTimeScale(bounds.value, 1)
  if (!Number.isFinite(props.rowHeight) || props.rowHeight < 8 + props.laneCount * 14) throw new RangeError('rowHeight is too small for laneCount')
  if (!Number.isFinite(activeSnap.value) || activeSnap.value <= 0 || !Number.isFinite(minimum.value) || minimum.value <= 0) throw new RangeError('Invalid snap or minDuration')
  const steps = activeTickSteps.value
  if (!steps.length || steps.some((step, i) => !Number.isFinite(step) || step <= 0 || (i > 0 && step < steps[i - 1]!))) throw new RangeError('tickSteps must be positive and ascending')
  if (props.scale && (!Number.isFinite(props.scale.width) || props.scale.width <= 0)) throw new RangeError('Invalid time scale width')
  if (props.now !== undefined && !Number.isFinite(props.now)) throw new RangeError('now must be finite')
  checkNonWorkingPeriods(props.nonWorkingPeriods)
  if (!Number.isFinite(props.progressStep) || props.progressStep <= 0 || props.progressStep > 1) {
    throw new RangeError('progressStep must be greater than 0 and at most 1')
  }
  if (!Number.isFinite(props.tooltipDelay) || props.tooltipDelay < 0) throw new RangeError('tooltipDelay must be finite and nonnegative')
  if (props.createDuration !== undefined && (!Number.isFinite(props.createDuration) || props.createDuration <= 0)) {
    throw new RangeError('createDuration must be finite and positive')
  }
  if (props.statusDate !== undefined && (typeof props.statusDate !== 'number' || !Number.isFinite(props.statusDate))) {
    throw new RangeError('statusDate must be finite')
  }
  if (props.labelWidth !== undefined && (typeof props.labelWidth !== 'number' || !Number.isFinite(props.labelWidth) || props.labelWidth <= 0)) {
    throw new RangeError('labelWidth must be finite and positive')
  }
  const minWidth = props.minColumnWidth ?? 48
  if (typeof minWidth !== 'number' || !Number.isFinite(minWidth) || minWidth <= 0) throw new RangeError('minColumnWidth must be finite and positive')
  if (props.maxColumnWidth !== undefined && (typeof props.maxColumnWidth !== 'number' || !Number.isFinite(props.maxColumnWidth)
    || props.maxColumnWidth < minWidth)) {
    throw new RangeError('maxColumnWidth must be finite and at least minColumnWidth')
  }
  if (props.columnsResizable && props.columns?.some(column => column.id === timelineLabelColumnId)) {
    throw new Error('The column ID is reserved for the row label column: ' + timelineLabelColumnId)
  }
  // Derive the hierarchy here so parent references and cycles use the same error boundary.
  return { tree: createTimelineRowTree(props.rows), load: validateLoad() }
}
// Controlled props are watched by reference. Pass new arrays and objects instead of mutating them in place.
watch([
  () => props.rows, () => props.bars, () => props.dependencies, () => props.laneCount, () => props.rowHeight, () => props.snap,
  () => props.range, () => props.editBounds, () => props.minDuration, () => props.tickSteps, () => props.pixelsPerUnit, () => props.scale,
  () => props.zoomPresets, () => props.zoomPreset, activePreset, () => props.loadRows, () => props.loadSegments, () => props.loadRowHeight,
  () => props.now, () => props.nonWorkingPeriods, () => props.progressStep, () => props.tooltipDelay, () => props.createDuration,
  () => props.statusDate, () => props.labelWidth, () => props.minColumnWidth, () => props.maxColumnWidth, () => props.columnsResizable,
], () => {
  try {
    const result = validateProps()
    tree.value = result.tree
    loadHistogram.value = result.load
    validationError.value = undefined
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error))
    tree.value = []
    loadHistogram.value = undefined
    validationError.value = failure
    emit('validation-error', failure)
    throw error
  }
}, { immediate: true })
const marker = useId()
const scroller = ref<HTMLElement>()
const canvas = ref<HTMLElement>()
const viewport = ref({ width: 1150, height: 321, left: 0, top: 0, labels: 154 })
// Right-to-left: the time axis starts at the right edge. Internally, horizontal positions are measured from the
// inline-start edge (`left` in LTR, `right` in RTL), so `viewport.left` and all axis math stay direction-independent.
const root = ref<HTMLElement>()
const inheritedRtl = ref(false)
const rtl = computed(() => props.dir === 'rtl' || (props.dir === 'auto' && inheritedRtl.value))
const inlineSide = computed(() => rtl.value ? 'right' : 'left')
function detectDirection() {
  const element = root.value
  inheritedRtl.value = props.dir === 'auto' && element !== undefined && getComputedStyle(element).direction === 'rtl'
}
/** Horizontal scroll distance from the inline start. RTL containers report zero or negative `scrollLeft`. */
function scrollStart(el: HTMLElement) {
  return rtl.value ? Math.max(0, -el.scrollLeft) : el.scrollLeft
}
function setScrollStart(el: HTMLElement, value: number) {
  el.scrollLeft = rtl.value ? -Math.max(0, value) : value
}
/** A client x coordinate along the inline axis, increasing towards later times. */
function inlineClientX(clientX: number) {
  return rtl.value ? -clientX : clientX
}
/** Pixels from the visible time area's inline-start edge to a client x coordinate. */
function timeAreaOffset(clientX: number, rect: DOMRect) {
  return rtl.value ? rect.right - viewport.value.labels - clientX : clientX - rect.left - viewport.value.labels
}
const bandHeight = 26
const headerHeight = computed(() => 40 + bandHeight * (activeBands.value?.length ?? 0))
const localCollapsed = ref(new Set<string>())
const collapsed = computed(() => props.collapsedIds ?? localCollapsed.value)
const summaries = computed(() => validationError.value ? undefined : props.showSummaries || props.columns?.length
  ? summarizeTimelineRows(tree.value, props.bars) : undefined)
const columnWidth = computed(() => {
  const ids = new Set<string>()
  let width = 0
  for (const column of props.columns ?? []) {
    if (!column.id || ids.has(column.id) || !Number.isFinite(column.width) || column.width <= 0) {
      throw new Error('Invalid timeline column: ' + column.id)
    }
    ids.add(column.id)
    width += column.width
  }
  return width
})
function canEditCell(row: TimelineRow, column: TimelineColumn) {
  if (props.readonly) return false
  return typeof column.editable === 'function' ? column.editable(row) : Boolean(column.editable)
}
function cellValue(row: TimelineRow, column: TimelineColumn) {
  return column.value(row, summaries.value?.get(row.id))
}
function cancelCell(event: KeyboardEvent, row: TimelineRow, column: TimelineColumn) {
  const input = event.currentTarget as HTMLInputElement
  input.value = String(cellValue(row, column))
  input.blur()
}
function commitCell(event: Event, row: TimelineRow, column: TimelineColumn) {
  const input = event.currentTarget as HTMLInputElement
  const before = cellValue(row, column)
  const after = input.value
  input.value = String(before)
  if (!canEditCell(row, column) || String(before) === after) return
  const change: TimelineCellEdit = { rowId: row.id, columnId: column.id, before, after }
  const result = props.validateCellEdit?.(change)
  if (result === false || typeof result === 'string') {
    notice.value = typeof result === 'string' ? result : messages.value.rejected
    emit('cell-edit-rejected', change, notice.value)
  } else {
    notice.value = ''
    emit('cell-edit', change)
  }
}
const displayedRows = computed(() => {
  const result: typeof tree.value = []
  for (let index = 0; index < tree.value.length;) {
    const item = tree.value[index]!
    result.push(item)
    index = collapsed.value.has(item.row.id) ? item.afterSubtree : index + 1
  }
  return result
})
function toggleRow(id: string) {
  const next = new Set(collapsed.value)
  if (next.has(id)) next.delete(id)
  else next.add(id)
  localCollapsed.value = next
  emit('update:collapsedIds', next)
}
const zoom = ref(1)
const minZoom = 0.65
const maxZoom = 3
const axis = computed<TimeScale>(() => {
  const base = props.scale ?? createTimeScale(props.range, activePixelsPerUnit.value)
  if (!Number.isFinite(base.width) || base.width <= 0) throw new RangeError('Invalid time scale width')
  return { width: base.width * zoom.value, toX: time => base.toX(time) * zoom.value, toTime: x => base.toTime(x / zoom.value) }
})
// Smallest on-screen distance between neighbouring ticks of `step` inside the visible window.
// A custom scale can be piecewise, so the first interval does not represent the rest.
function minTickGap(step: number) {
  const { start, end } = timeWindow.value
  const anchor = props.range.start
  const first = Math.ceil((start - anchor) / step)
  const last = Math.floor((end - anchor) / step)
  if (last - first + 1 > 10000) return 0
  if (last <= first) return axis.value.toX(anchor + step) - axis.value.toX(anchor)
  let gap = Infinity
  let previous = axis.value.toX(anchor + first * step)
  for (let index = first + 1; index <= last; index++) {
    const x = axis.value.toX(anchor + index * step)
    gap = Math.min(gap, x - previous)
    previous = x
  }
  return gap
}
const tickStep = computed(() => activeTickSteps.value.find(step => minTickGap(step) >= 76)
  ?? activeTickSteps.value.at(-1) ?? activeSnap.value)
const rowOrder = computed(() => new Map(displayedRows.value.map(({ row }, index) => [row.id, index])))
const barById = computed(() => new Map((validationError.value ? [] : props.bars).map(bar => [bar.id, bar])))
const barsByRow = computed(() => {
  const groups = new Map<string, TimelineBar[]>()
  for (const bar of validationError.value ? [] : props.bars) {
    if (!groups.has(bar.rowId)) groups.set(bar.rowId, [])
    groups.get(bar.rowId)!.push(bar)
  }
  return groups
})
const laneHeight = computed(() => (props.rowHeight - 8) / props.laneCount)
const barHeight = computed(() => Math.max(1, laneHeight.value - 6))
const bodyHeight = computed(() => displayedRows.value.length * props.rowHeight)
const xWindow = computed(() => ({
  left: Math.min(axis.value.width, Math.max(0, viewport.value.left - 80)),
  right: Math.min(axis.value.width, Math.max(0, viewport.value.left + viewport.value.width - viewport.value.labels + 80)),
}))
const timeWindow = computed(() => ({
  start: axis.value.toTime(xWindow.value.left),
  end: axis.value.toTime(xWindow.value.right),
}))
const rowWindow = computed(() => visibleRows(
  viewport.value.top,
  Math.max(0, viewport.value.height - headerHeight.value),
  props.rowHeight,
  displayedRows.value.length,
))
const shownBands = computed(() => (activeBands.value ?? []).map(level => {
  let previousEnd = -Infinity
  return level.flatMap(band => {
    if (!Number.isFinite(band.start) || !Number.isFinite(band.end) || band.end <= band.start || band.start < previousEnd) {
      throw new Error('Timeline bands must be finite, ordered and nonoverlapping')
    }
    previousEnd = band.end
    const start = Math.max(band.start, props.range.start, timeWindow.value.start)
    const end = Math.min(band.end, props.range.end, timeWindow.value.end)
    if (end <= start) return []
    return [{ ...band, x: axis.value.toX(start), width: axis.value.toX(end) - axis.value.toX(start) }]
  })
}))
const shownMarkers = computed(() => {
  const ids = new Set<string>()
  return (props.markers ?? []).filter(item => {
    if (!item.id || ids.has(item.id) || !Number.isFinite(item.time)) throw new Error('Invalid timeline marker: ' + item.id)
    ids.add(item.id)
    return item.time >= timeWindow.value.start && item.time < timeWindow.value.end
  })
})
// Markers, then the status date (`statusDate`), share one template element so a chart without a status date renders
// exactly the markup it did before.
const markerEntries = computed(() => {
  const entries: { key: string; time: number; label: string; className?: string; role?: string; name?: string }[] = shownMarkers.value
    .map(item => ({ key: 'marker:' + item.id, time: item.time, label: item.label }))
  const time = props.statusDate
  if (time !== undefined && !validationError.value && time >= props.range.start && time <= props.range.end
    && time >= timeWindow.value.start && time <= timeWindow.value.end) {
    const label = messages.value.statusDate!
    entries.push({ key: 'status', time, label, className: 'vw-gantt-status-date', role: 'img', name: `${label} ${props.formatTime(time)}` })
  }
  return entries
})
/**
 * The progress line through one displayed row, in row coordinates of the visible time window: a vertical line at the
 * status date that kinks to the progress point of each bar that is behind or ahead (`progressLineTime`). Every bar of
 * the row counts, also one outside the visible time window, so the line keeps its shape while scrolling.
 */
function progressSegment(rowId: string): { points: string } | undefined {
  const status = props.statusDate
  if (!props.showProgressLine || status === undefined || validationError.value) return undefined
  const kinks = (barsByRow.value.get(rowId) ?? []).flatMap(bar => {
    const range = rangeOf(bar)
    const time = progressLineTime({ ...range, progress: shownProgress(bar), segments: workSegments(bar, range) }, status)
    return time === undefined ? [] : [{ x: axis.value.toX(time), y: laneTop(bar) + barHeight.value / 2, reach: barHeight.value / 2 }]
  })
  return { points: progressLinePoints(axis.value.toX(status), 0, props.rowHeight, kinks).map(([x, y]) => x + ',' + y).join(' ') }
}
// The clock is read only after mounting so server and client render the same markup.
const clientNow = ref<number>()
let nowTimer: ReturnType<typeof setInterval> | undefined
let mounted = false
function syncClock() {
  if (nowTimer !== undefined) clearInterval(nowTimer)
  nowTimer = undefined
  clientNow.value = undefined
  if (!mounted || !props.showNow || props.now !== undefined) return
  clientNow.value = Date.now()
  nowTimer = setInterval(() => { clientNow.value = Date.now() }, 30_000)
}
watch(() => [props.showNow, props.now], syncClock)
const nowTime = computed(() => {
  if (!props.showNow) return undefined
  const time = props.now ?? clientNow.value
  return time !== undefined && Number.isFinite(time) && time >= props.range.start && time <= props.range.end
    && time >= timeWindow.value.start && time <= timeWindow.value.end ? time : undefined
})
const ticks = computed(() => timeTicks(timeWindow.value, tickStep.value, props.range.start))
// Grid lines are drawn at each tick's own x (as exportSvg does), so non-linear scales stay aligned with the labels.
const tickXs = computed(() => ticks.value.map(tick => ({ tick, x: axis.value.toX(tick) })))
// Kept for custom stylesheets that read --vw-grid-step; the built-in styles no longer use it.
const gridStep = computed(() => axis.value.toX(props.range.start + tickStep.value) - axis.value.toX(props.range.start))
type BarPreview = { range: TimeRange; rowShift: number; mode: EditMode }
const previews = shallowRef<ReadonlyMap<string, BarPreview>>()
const focusedBarId = ref<string>()
let pendingReveal: string | undefined
let pendingFocus: string | undefined
let suppressSelection: string | undefined
let lastClientX = 0
let lastClientY = 0
let scrollFrame = 0
let drag: {
  id: string; pointerId: number; initialX: number; initialY: number; initial: TimeRange; mode: EditMode; target: HTMLElement
  group: readonly TimelineBar[]
} | undefined
let observer: ResizeObserver | undefined

function rangeOf(bar: TimelineBar) {
  return previews.value?.get(bar.id)?.range ?? bar
}

function laneTop(bar: TimelineBar) {
  return laneOffset(bar.lane ?? 0)
}
function laneOffset(lane: number) {
  return 7 + lane * laneHeight.value
}

const shownRows = computed(() => {
  const { first, afterLast } = rowWindow.value
  return displayedRows.value.slice(first, afterLast).map((item, i) => {
    const bars = barsByRow.value.get(item.row.id) ?? []
    const shown = bars.filter(bar => previews.value?.has(bar.id) || focusedBarId.value === bar.id || intersectsWindow(rangeOf(bar), timeWindow.value))
    const overlays = new Map<string, BarOverlay>()
    for (const bar of shown) {
      const overlay = barOverlay(bar)
      if (overlay) overlays.set(bar.id, overlay)
    }
    return {
      ...item,
      index: first + i,
      bars: shown,
      overlays,
      creatable: canCreateIn(item.row),
      reorderable: rowHandlesVisible.value,
      progress: progressSegment(item.row.id),
      summary: item.hasChildren && props.showSummaries && !bars.length ? summaries.value?.get(item.row.id) : undefined,
      baselines: bars.filter(bar => bar.baseline && intersectsWindow(bar.baseline, timeWindow.value)),
      floats: bars.flatMap(bar => {
        const end = rangeOf(bar).end
        return bar.latestEnd !== undefined && bar.latestEnd > end && intersectsWindow({ start: end, end: bar.latestEnd }, timeWindow.value)
          ? [{ bar, style: floatStyle(bar, end, bar.latestEnd) }] : []
      }),
      deadlines: bars.flatMap(bar => bar.deadline !== undefined && bar.deadline >= timeWindow.value.start && bar.deadline < timeWindow.value.end
        ? [{ bar, late: rangeOf(bar).end > bar.deadline, style: deadlineStyle(bar, bar.deadline) }] : []),
    }
  })
})

// Critical, float, deadline and segment overlays. A bar without these fields gets no overlay and renders as before.
type BarOverlay = {
  description?: string
  late: boolean
  segments?: { pieces: { key: number; style: Record<string, string>; filled: number }[]; gaps: { key: number; style: Record<string, string> }[] }
}
const barIndex = computed(() => new Map((validationError.value ? [] : props.bars).map((bar, index) => [bar.id, index])))
function barOverlay(bar: TimelineBar): BarOverlay | undefined {
  if (!bar.critical && bar.latestEnd === undefined && bar.deadline === undefined && !bar.segments) return undefined
  const range = rangeOf(bar)
  const parts: string[] = []
  if (bar.critical) parts.push(messages.value.critical!)
  if (bar.latestEnd !== undefined) parts.push(`${messages.value.float} ${props.formatTime(bar.latestEnd)}`)
  if (bar.deadline !== undefined) parts.push(`${messages.value.deadline} ${props.formatTime(bar.deadline)}`)
  const late = bar.deadline !== undefined && range.end > bar.deadline
  if (late) parts.push(messages.value.late!)
  return { description: parts.length ? parts.join('. ') + '.' : undefined, late, segments: segmentGeometry(bar, range) }
}
/**
 * Pixel geometry of a segmented bar. A move preview shifts the segments with the bar; a resize preview draws the bar
 * unsegmented, because the parent reschedules the work and supplies new segments.
 */
function segmentGeometry(bar: TimelineBar, range: TimeRange): BarOverlay['segments'] {
  const shifted = workSegments(bar, range)
  if (!shifted) return undefined
  const { pieces, gaps } = segmentPieces(range, shifted, shownProgress(bar))
  const origin = axis.value.toX(range.start)
  // Children are positioned inside the 1px bar border.
  const place = (part: TimeRange) => {
    const left = axis.value.toX(part.start) - origin
    return { [inlineSide.value]: `${left - 1}px`, width: `${axis.value.toX(part.end) - origin - left}px` }
  }
  return {
    pieces: pieces.map(piece => ({ key: piece.start, style: place(piece), filled: piece.filled })),
    gaps: gaps.map(gap => ({ key: gap.start, style: place(gap) })),
  }
}
/** The drawn work pieces: shifted with a move preview, and none during a resize preview or without segments. */
function workSegments(bar: TimelineBar, range: TimeRange) {
  const preview = previews.value?.get(bar.id)
  if (!bar.segments || (preview && preview.mode !== 'move')) return undefined
  const delta = range.start - bar.start
  return delta ? bar.segments.map(segment => ({ start: segment.start + delta, end: segment.end + delta })) : bar.segments
}
/** Progress as drawn: the pointer preview of a progress drag, otherwise the bar's own value. */
function shownProgress(bar: TimelineBar) {
  const preview = progressPreview.value
  return preview?.id === bar.id ? preview.value : bar.progress
}
function barDescriptionId(bar: TimelineBar) {
  return `${marker}-bar-${barIndex.value.get(bar.id)}`
}
/** Description IDs in a fixed order: overlay text, edit hints, the delete hint, then a tooltip while it is shown. */
function barDescribedBy(bar: TimelineBar, overlay: BarOverlay | undefined) {
  const ids: string[] = []
  if (overlay?.description) ids.push(barDescriptionId(bar))
  if (editable(bar)) ids.push(marker + '-hint')
  if (editable(bar) && props.rowDraggable) ids.push(marker + '-row-hint')
  if (canDelete(bar)) ids.push(marker + '-delete-hint')
  if (tooltipBar.value?.id === bar.id) ids.push(tooltipId)
  return ids.length ? ids.join(' ') : undefined
}
function barTitle(bar: TimelineBar, overlay: BarOverlay | undefined) {
  const range = rangeOf(bar)
  const title = `${bar.label} ${props.formatTime(range.start)}–${props.formatTime(range.end)}`
  return overlay?.description ? `${title} · ${overlay.description}` : title
}
function rowShiftStyle(bar: TimelineBar) {
  const shift = previews.value?.get(bar.id)?.rowShift
  return shift ? { transform: `translateY(${shift * props.rowHeight}px)` } : {}
}
function floatStyle(bar: TimelineBar, end: number, latestEnd: number) {
  const left = axis.value.toX(end)
  return {
    [inlineSide.value]: `calc(var(--vw-label-area-width) + ${left}px)`,
    width: `${axis.value.toX(latestEnd) - left}px`,
    top: `${laneTop(bar) + barHeight.value / 2 - 4}px`,
    ...rowShiftStyle(bar),
  }
}
function deadlineStyle(bar: TimelineBar, deadline: number) {
  return {
    [inlineSide.value]: `calc(var(--vw-label-area-width) + ${axis.value.toX(deadline) - 5}px)`,
    top: `${laneTop(bar) - 3}px`,
    height: `${barHeight.value + 6}px`,
    ...rowShiftStyle(bar),
  }
}
// Non-working time is drawn behind the grid over the task rows and inside each load row, clipped to the visible window.
const shownNonWorking = computed(() => {
  if (validationError.value || !props.nonWorkingPeriods?.length) return []
  const low = Math.max(props.range.start, timeWindow.value.start)
  const high = Math.min(props.range.end, timeWindow.value.end)
  return props.nonWorkingPeriods.flatMap((period, index) => {
    const start = Math.max(period.start, low), end = Math.min(period.end, high)
    if (end <= start) return []
    const left = axis.value.toX(start)
    return [{ key: index, left, width: axis.value.toX(end) - left }]
  })
})

function dependencyName(dep: TimelineDependency) {
  return `${barById.value.get(dep.from)?.label ?? dep.from} → ${barById.value.get(dep.to)?.label ?? dep.to} ${dep.type ?? 'FS'}`
}

const shownLines = computed(() => {
  const { first, afterLast } = rowWindow.value
  const { left, right } = xWindow.value
  return (validationError.value ? [] : props.dependencies).flatMap(dep => {
    const source = barById.value.get(dep.from)
    const target = barById.value.get(dep.to)
    if (!source || !target) return []
    const sourceIndex = rowOrder.value.get(source.rowId)
    const targetIndex = rowOrder.value.get(target.rowId)
    if (sourceIndex === undefined || targetIndex === undefined) return []
    const sourceRow = sourceIndex + (previews.value?.get(source.id)?.rowShift ?? 0)
    const targetRow = targetIndex + (previews.value?.get(target.id)?.rowShift ?? 0)
    if (Math.max(sourceRow, targetRow) < first || Math.min(sourceRow, targetRow) >= afterLast) return []
    const endpoints = dependencyTimes(rangeOf(source), rangeOf(target), dep.type)
    const x1 = axis.value.toX(endpoints.from)
    const x2 = axis.value.toX(endpoints.to)
    if (Math.max(x1, x2) + 10 < left || Math.min(x1, x2) - 10 > right) return []
    const y1 = sourceRow * props.rowHeight + laneTop(source) + barHeight.value / 2
    const y2 = targetRow * props.rowHeight + laneTop(target) + barHeight.value / 2
    return [{ ...dep, path: dependencyPath(x1, y1, x2, y2), x1, y1, x2, y2, dependency: dep }]
  })
})

function barBox(bar: TimelineBar) {
  return intervalBox(rangeOf(bar))
}
/** Inline-start offset and width of an interval on the time axis; a milestone is 10 px wide around its time. */
function intervalBox(range: TimeRange) {
  const left = axis.value.toX(range.start)
  const width = axis.value.toX(range.end) - left
  return { left: left - (width === 0 ? 5 : 0), width: width === 0 ? 10 : width }
}
/** Canvas position of a preview interval in a displayed row and lane. */
function previewStyle(range: TimeRange, rowIndex: number, lane: number) {
  const box = intervalBox(range)
  return {
    [inlineSide.value]: `calc(var(--vw-label-area-width) + ${box.left}px)`,
    width: `${box.width}px`,
    top: `${headerHeight.value + rowIndex * props.rowHeight + laneOffset(lane)}px`,
    height: `${barHeight.value}px`,
  }
}

function barStyle(bar: TimelineBar) {
  const box = barBox(bar)
  return {
    [inlineSide.value]: `calc(var(--vw-label-area-width) + ${box.left}px)`,
    width: `${box.width}px`,
    height: `${barHeight.value}px`,
    top: `${laneTop(bar)}px`,
    ...rowShiftStyle(bar),
  }
}

function summaryStyle(summary: TimelineSummary) {
  const left = axis.value.toX(summary.start)
  return {
    [inlineSide.value]: `calc(var(--vw-label-area-width) + ${left}px)`,
    width: `${Math.max(3, axis.value.toX(summary.end) - left)}px`,
  }
}

function baselineStyle(bar: TimelineBar) {
  const baseline = bar.baseline!
  const left = axis.value.toX(baseline.start)
  const width = axis.value.toX(baseline.end) - left
  return {
    [inlineSide.value]: `calc(var(--vw-label-area-width) + ${left - (width === 0 ? 1.5 : 0)}px)`,
    width: `${Math.max(3, width)}px`,
    top: `${laneTop(bar) + barHeight.value + 1}px`,
  }
}

function syncViewport() {
  const el = scroller.value
  if (!el) return
  const labels = el.querySelector('.vw-gantt-corner')?.getBoundingClientRect().width ?? 154
  viewport.value = {
    width: el.clientWidth, height: el.clientHeight, left: scrollStart(el), top: el.scrollTop, labels,
  }
  measureLabelColumn()
}

/** Change the zoom factor while keeping the time at `anchor` (pixels from the timeline's visible left edge) in place. */
async function applyZoom(next: number, anchor?: number) {
  const el = scroller.value
  if (!el) return
  const offset = anchor ?? Math.max(0, (el.clientWidth - viewport.value.labels) / 2)
  const time = axis.value.toTime(scrollStart(el) + offset)
  zoom.value = Math.max(minZoom, Math.min(maxZoom, next))
  await nextTick()
  setScrollStart(el, axis.value.toX(time) - offset)
  syncViewport()
}

async function setZoom(factor: number) {
  if (!scroller.value || drag || createDrag) return
  await applyZoom(zoom.value * factor)
}

// The centre time to keep when a preset chosen by the user takes effect. It is tagged with the chosen id, so a
// controlled parent that ignores the update neither resets the zoom nor leaves a stale centre for a later change.
let pendingPreset: { id: string; time: number } | undefined
function choosePreset(id: string) {
  const el = scroller.value
  if (drag || createDrag || id === activePreset.value?.id) return
  pendingPreset = el
    ? { id, time: axis.value.toTime(scrollStart(el) + Math.max(0, (el.clientWidth - viewport.value.labels) / 2)) }
    : undefined
  localPreset.value = id
  emit('update:zoomPreset', id)
  // A parent that accepts the id has applied it by the end of this flush. Otherwise drop the stale centre.
  const requested = pendingPreset
  void nextTick(() => { if (pendingPreset === requested) pendingPreset = undefined })
}
watch(() => activePreset.value?.id, async id => {
  const pending = pendingPreset
  pendingPreset = undefined
  const el = scroller.value
  if (!pending || pending.id !== id) return
  zoom.value = 1
  if (!el) return
  await nextTick()
  setScrollStart(el, axis.value.toX(pending.time) - Math.max(0, (el.clientWidth - viewport.value.labels) / 2))
  syncViewport()
})
watch([zoom, () => activePreset.value?.id], ([value, preset]) => {
  emit('zoom-change', preset === undefined ? { zoom: value } : { zoom: value, preset })
})

function editable(bar: TimelineBar) {
  return !props.readonly && Boolean(bar.editable) && bar.start >= bounds.value.start && bar.end <= bounds.value.end
}

function cancelEdit() {
  const previous = drag
  drag = undefined
  previews.value = undefined
  stopAutoScroll()
  if (previous?.target.hasPointerCapture(previous.pointerId)) previous.target.releasePointerCapture(previous.pointerId)
  cancelLink()
  cancelProgress()
  cancelCreate()
  cancelRowDrag()
  cancelColumnResize()
  clearCascade()
  pinch = undefined
}

/** Whether a gesture owns the pointer or keyboard: an edit drag, a progress drag, a connection, a create drag or a pinch. */
function gestureActive() {
  return Boolean(drag || progressDrag || linkDrag || linkDraft.value || pinch || createDrag || rowDrag || columnDrag)
}

function rejection(result: boolean | string | void) {
  return result === false ? messages.value.rejected : typeof result === 'string' ? result : undefined
}

function propose(change: TimelineEdit) {
  if (change.before.start === change.after.start && change.before.end === change.after.end && !change.row) return
  const result = props.validateEdit?.(change)
  if (result === false || typeof result === 'string') {
    notice.value = typeof result === 'string' ? result : messages.value.rejected
    emit('edit-rejected', change, notice.value)
  } else {
    notice.value = ''
    emit('edit', change)
  }
}

/** A single change keeps the `edit` contract; several changes form one atomic `edits` batch. */
function proposeAll(changes: TimelineEdit[]) {
  if (changes.length <= 1) {
    if (changes[0]) propose(changes[0])
    return
  }
  const reason = props.validateEdits
    ? rejection(props.validateEdits(changes))
    : changes.reduce<string | undefined>((found, change) => found ?? rejection(props.validateEdit?.(change)), undefined)
  if (reason !== undefined) {
    notice.value = reason
    emit('edits-rejected', changes, reason)
  } else {
    notice.value = ''
    emit('edits', changes)
  }
}

// Cascade (`cascade`): follow-on changes of other bars, drawn as ghosts during a drag and proposed with the edit.
type CascadeResult = { changes: TimelineEdit[] } | { error: string }
const cascadeGhosts = shallowRef<readonly TimelineEdit[]>()
let cascadeKey: string | undefined
let cascadeResult: CascadeResult | undefined

/**
 * Ask `cascade` for the follow-on changes of each primary change. Changes for unknown bars and for the primary bars
 * are ignored, the last change returned for a bar wins, and a change that keeps a bar's interval and row is dropped.
 * A throwing callback or an invalid interval becomes a rejection reason.
 */
function cascadeFor(changes: readonly TimelineEdit[]): CascadeResult {
  const primary = new Set(changes.map(change => change.id))
  const merged = new Map<string, TimelineEdit>()
  try {
    for (const change of changes) {
      for (const next of props.cascade!(change)) {
        if (!barById.value.has(next.id) || primary.has(next.id)) continue
        const { start, end } = next.after
        if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) throw new RangeError('Invalid cascaded change for bar: ' + next.id)
        merged.set(next.id, next)
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { error: message || messages.value.rejected }
  }
  return {
    changes: [...merged.values()].filter(change => {
      const bar = barById.value.get(change.id)!
      return change.after.start !== bar.start || change.after.end !== bar.end || (change.row !== undefined && change.row.after !== bar.rowId)
    }),
  }
}
/** Call `cascade` again only when the snapped primary changes differ from the previous call. */
function updateCascade(changes: readonly TimelineEdit[]) {
  const key = JSON.stringify(changes.map(change => [change.id, change.after.start, change.after.end, change.row?.after]))
  if (key === cascadeKey) return
  cascadeKey = key
  cascadeResult = changes.length ? cascadeFor(changes) : { changes: [] }
  cascadeGhosts.value = 'changes' in cascadeResult && cascadeResult.changes.length ? cascadeResult.changes : undefined
}
function clearCascade() {
  cascadeKey = undefined
  cascadeResult = undefined
  cascadeGhosts.value = undefined
}
const cascadeBoxes = computed(() => (cascadeGhosts.value ?? []).flatMap(change => {
  const bar = barById.value.get(change.id)
  const index = bar && rowOrder.value.get(change.row?.after ?? bar.rowId)
  const { first, afterLast } = rowWindow.value
  if (!bar || index === undefined || index < first || index >= afterLast || !intersectsWindow(change.after, timeWindow.value)) return []
  return [{ id: change.id, style: previewStyle(change.after, index, bar.lane ?? 0) }]
}))

/**
 * Propose move and resize changes. With `cascade`, the follow-on changes join the primary ones (which come first) in
 * one `edits` batch; when there are none, a single change keeps the `edit` contract.
 */
function proposeEdits(changes: readonly TimelineEdit[], cascaded?: CascadeResult) {
  const primary = changes.filter(change => change.row || change.before.start !== change.after.start || change.before.end !== change.after.end)
  if (!primary.length) return
  if (!props.cascade) return proposeAll(primary)
  const result = cascaded ?? cascadeFor(primary)
  if ('error' in result) {
    notice.value = result.error
    if (primary.length === 1) emit('edit-rejected', primary[0]!, result.error)
    else emit('edits-rejected', primary, result.error)
    return
  }
  proposeAll([...primary, ...result.changes])
}

/** Bars that move together: the selected editable bars when multiSelect includes this bar, otherwise the bar itself. */
function movingGroup(bar: TimelineBar) {
  if (!props.multiSelect || !props.selectedIds?.has(bar.id)) return [bar]
  const group = [bar]
  for (const id of props.selectedIds) {
    const other = barById.value.get(id)
    if (other && other.id !== bar.id && editable(other)) group.push(other)
  }
  return group
}

function rowShiftFor(group: readonly TimelineBar[], delta: number) {
  if (!props.rowDraggable || !delta) return 0
  let min = -Infinity, max = Infinity
  const last = displayedRows.value.length - 1
  for (const bar of group) {
    const index = rowOrder.value.get(bar.rowId)
    if (index === undefined) return 0
    min = Math.max(min, -index)
    max = Math.min(max, last - index)
  }
  return Math.max(min, Math.min(max, delta))
}

function buildChanges(group: readonly TimelineBar[], ranges: readonly TimeRange[], mode: EditMode, source: TimelineEdit['source'], shift: number) {
  return group.flatMap((bar, i) => {
    const after = ranges[i]!
    const change: TimelineEdit = { id: bar.id, before: { start: bar.start, end: bar.end }, after: { start: after.start, end: after.end }, mode, source }
    if (shift) change.row = { before: bar.rowId, after: displayedRows.value[rowOrder.value.get(bar.rowId)! + shift]!.row.id }
    return change.row || after.start !== bar.start || after.end !== bar.end ? [change] : []
  })
}

function startEdit(event: PointerEvent, bar: TimelineBar) {
  suppressSelection = undefined
  if (!editable(bar) || drag || pinch || !event.isPrimary || event.button !== 0 || linkDrag) return
  const target = event.target as HTMLElement
  const mode = (target.closest<HTMLElement>('[data-edit-mode]')?.dataset.editMode ?? 'move') as EditMode
  if (mode !== 'move' && bar.end - bar.start < minimum.value) return
  const control = event.currentTarget as HTMLElement
  control.focus({ preventScroll: true })
  drag = {
    id: bar.id, pointerId: event.pointerId,
    initialX: inlineClientX(event.clientX) + (scroller.value ? scrollStart(scroller.value) : 0),
    initialY: event.clientY + (scroller.value?.scrollTop ?? 0),
    initial: { start: bar.start, end: bar.end }, mode, target: control,
    group: mode === 'move' ? movingGroup(bar) : [bar],
  }
  control.setPointerCapture(event.pointerId)
  lastClientX = event.clientX
  lastClientY = event.clientY
  startAutoScroll()
}

function moveEdit(event: PointerEvent) {
  if (!drag || drag.pointerId !== event.pointerId) return
  lastClientX = event.clientX
  lastClientY = event.clientY
  updatePreview()
}

function updatePreview() {
  if (!drag) return
  const deltaX = inlineClientX(lastClientX) + (scroller.value ? scrollStart(scroller.value) : 0) - drag.initialX
  const deltaY = lastClientY + (scroller.value?.scrollTop ?? 0) - drag.initialY
  const shift = drag.mode === 'move' ? rowShiftFor(drag.group, Math.round(deltaY / props.rowHeight)) : 0
  if (Math.abs(deltaX) < 2 && !shift && !previews.value) return
  const anchor = drag.mode === 'end' ? drag.initial.end : drag.initial.start
  const deltaTime = axis.value.toTime(axis.value.toX(anchor) + deltaX) - anchor
  const ranges = drag.group.length > 1
    ? moveTimeRanges(drag.group, deltaTime, activeSnap.value, bounds.value)
    : [editTimeRange(drag.initial, drag.mode, deltaTime, activeSnap.value, bounds.value, minimum.value)]
  const mode = drag.mode
  previews.value = new Map(drag.group.map((bar, i) => [bar.id, { range: ranges[i]!, rowShift: shift, mode }]))
  if (props.cascade) updateCascade(buildChanges(drag.group, ranges, mode, 'pointer', shift))
}

const scrollEdge = 40
const scrollSpeed = 24
function autoScrollStep() {
  scrollFrame = 0
  const el = scroller.value
  if (!(drag || createDrag) || !el) return
  if (drag ? previews.value : createPreview.value) {
    const rect = el.getBoundingClientRect()
    // The time area excludes the sticky label column, which sits on the inline-start side.
    const left = rect.left + (rtl.value ? 0 : viewport.value.labels) + scrollEdge
    const right = rect.right - (rtl.value ? viewport.value.labels : 0) - scrollEdge
    const depth = lastClientX < left ? (left - lastClientX) / scrollEdge : lastClientX > right ? (lastClientX - right) / scrollEdge : 0
    if (depth > 0) {
      const before = el.scrollLeft
      // Moving towards the visual left scrolls to earlier times in LTR and to later times in RTL.
      const towardsStart = (lastClientX < left) !== rtl.value
      setScrollStart(el, scrollStart(el) + (towardsStart ? -1 : 1) * Math.ceil(Math.min(1, depth) * scrollSpeed))
      if (el.scrollLeft !== before) {
        if (drag) updatePreview()
        else updateCreatePreview()
      }
    }
  }
  scrollFrame = requestAnimationFrame(autoScrollStep)
}
function startAutoScroll() {
  if (props.autoScroll && !scrollFrame && typeof requestAnimationFrame === 'function') scrollFrame = requestAnimationFrame(autoScrollStep)
}
function stopAutoScroll() {
  if (scrollFrame && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(scrollFrame)
  scrollFrame = 0
}

function finishEdit(event: PointerEvent) {
  if (!drag || drag.pointerId !== event.pointerId) return
  if (event.type !== 'pointerup') return cancelEdit()
  lastClientX = event.clientX
  lastClientY = event.clientY
  updatePreview()
  const { group, mode, id } = drag
  const preview = previews.value
  const shift = preview?.get(id)?.rowShift ?? 0
  const changes = preview ? buildChanges(group, group.map(bar => preview.get(bar.id)!.range), mode, 'pointer', shift) : []
  // The last preview step already asked `cascade` about exactly these changes.
  const cascaded = cascadeResult
  if (preview) suppressSelection = id
  cancelEdit()
  proposeEdits(changes, cascaded)
}

function clickBar(bar: TimelineBar, event: MouseEvent) {
  const dragged = suppressSelection === bar.id
  suppressSelection = undefined
  if (props.multiSelect && !dragged) {
    const toggle = event.ctrlKey || event.metaKey || event.shiftKey
    const ids = new Set(toggle ? props.selectedIds : [])
    if (toggle && ids.has(bar.id)) ids.delete(bar.id)
    else ids.add(bar.id)
    emit('update:selectedIds', ids)
  }
  emit('select', bar.id)
}

function editWithKeys(event: KeyboardEvent, bar: TimelineBar) {
  if (event.key === 'Escape') return cancelEdit()
  if (props.contextMenu && isMenuKey(event)) return keyboardContextMenu(event, { kind: 'bar', id: bar.id }, bar.rowId)
  if (props.deletable && (event.key === 'Delete' || event.key === 'Backspace')) return deleteFrom(event, bar)
  if (!editable(bar) || drag) return
  if (props.rowDraggable && (event.key === 'ArrowUp' || event.key === 'ArrowDown') && !event.altKey && !event.shiftKey) {
    const group = movingGroup(bar)
    const shift = rowShiftFor(group, event.key === 'ArrowUp' ? -1 : 1)
    event.preventDefault()
    if (!shift) return
    pendingFocus = bar.id
    proposeEdits(buildChanges(group, group, 'move', 'keyboard', shift))
    return
  }
  if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return
  const mode: EditMode = event.altKey ? 'start' : event.shiftKey ? 'end' : 'move'
  if (mode !== 'move' && bar.end - bar.start < minimum.value) return
  event.preventDefault()
  const before = { start: bar.start, end: bar.end }
  // Left and Right follow the visual direction: in RTL, ArrowLeft moves towards later times.
  const delta = (event.key === 'ArrowLeft') !== rtl.value ? -activeSnap.value : activeSnap.value
  pendingReveal = bar.id
  const group = mode === 'move' ? movingGroup(bar) : [bar]
  if (group.length > 1) {
    proposeEdits(buildChanges(group, moveTimeRanges(group, delta, activeSnap.value, bounds.value), mode, 'keyboard', 0))
    return
  }
  proposeEdits([{
    id: bar.id, before, mode, source: 'keyboard',
    after: editTimeRange(before, mode, delta, activeSnap.value, bounds.value, minimum.value),
  }])
}

function onBarFocus(event: FocusEvent, bar: TimelineBar) {
  focusedBarId.value = bar.id
  focusTooltip(event, bar)
}
function onBarBlur(id: string) {
  if (focusedBarId.value === id) focusedBarId.value = undefined
  if (pendingReveal === id) pendingReveal = undefined
  blurTooltip(id)
}

// Bar deletion. Delete or Backspace proposes the focused bar, or the whole selection when the bar is part of it.
let pendingDelete = false
function canDelete(bar: TimelineBar) {
  return Boolean(props.deletable) && !props.readonly && Boolean(bar.deletable ?? bar.editable)
}
function deleteFrom(event: KeyboardEvent, bar: TimelineBar) {
  if (!canDelete(bar)) return
  event.preventDefault()
  if (gestureActive()) return
  const selected = props.multiSelect && props.selectedIds?.has(bar.id) ? props.selectedIds : undefined
  const ids = selected ? props.bars.filter(other => selected.has(other.id) && canDelete(other)).map(other => other.id) : [bar.id]
  const reason = rejection(props.validateBarsDelete?.(ids))
  if (reason !== undefined) {
    notice.value = reason
    emit('bars-delete-rejected', ids, reason)
  } else {
    notice.value = ''
    pendingDelete = true
    emit('bars-delete', ids)
  }
}

/** Scroll horizontally only when the bar lies outside the visible timeline area. */
function revealBar(id: string) {
  const el = scroller.value
  const bar = barById.value.get(id)
  if (!el || !bar) return
  const left = axis.value.toX(bar.start)
  const right = Math.max(left, axis.value.toX(bar.end))
  const visibleWidth = Math.max(0, el.clientWidth - viewport.value.labels)
  const margin = 16
  const scrolled = scrollStart(el)
  if (left < scrolled) setScrollStart(el, Math.max(0, left - margin))
  else if (right > scrolled + visibleWidth) setScrollStart(el, Math.max(0, right - visibleWidth + margin))
  syncViewport()
}
function focusBar(id: string) {
  for (const element of scroller.value?.querySelectorAll<HTMLElement>('[data-vw-bar]') ?? []) {
    if (element.dataset.vwBar === id) return element.focus({ preventScroll: true })
  }
}
// After a keyboard edit, wait for the parent to apply it (new bars), then keep the bar in view.
watch(() => props.bars, async () => {
  const id = pendingReveal
  const moved = pendingFocus
  const deleted = pendingDelete
  pendingReveal = undefined
  pendingFocus = undefined
  pendingDelete = false
  if (focusedBarId.value !== undefined && !barById.value.has(focusedBarId.value)) focusedBarId.value = undefined
  if (deleted) {
    // A removed bar takes keyboard focus with it; keep focus in the chart region.
    await nextTick()
    const el = scroller.value
    const active = document.activeElement
    if (el && (!active || active === document.body || !active.isConnected)) el.focus({ preventScroll: true })
  }
  if (id === undefined && moved === undefined) return
  await nextTick()
  // A bar that changed rows is a new element; restore keyboard focus to it.
  if (moved !== undefined) {
    const bar = barById.value.get(moved)
    const index = bar && rowOrder.value.get(bar.rowId)
    const el = scroller.value
    if (el && index !== undefined) {
      const top = index * props.rowHeight
      const visible = Math.max(0, el.clientHeight - headerHeight.value)
      if (top < el.scrollTop) el.scrollTop = top
      else if (top + props.rowHeight > el.scrollTop + visible) el.scrollTop = top + props.rowHeight - visible
      syncViewport()
      await nextTick()
      focusBar(moved)
    }
  }
  if (id !== undefined && focusedBarId.value === id) revealBar(id)
})

// Row hierarchy moves (`rowsReorderable`). Each row heading gets a move handle: Alt+Up/Down move the row among its
// siblings, Alt+Shift+Left/Right outdent or indent it in the visual direction, and a pointer drag previews a drop
// position between rows. Proposals are emitted as `row-move`; the parent applies them with `moveTimelineRow`.
const rowHandlesVisible = computed(() => Boolean(props.rowsReorderable) && !props.readonly && !validationError.value)
/** Children of each parent row (`undefined` for the roots) in tree order. */
const rowChildren = computed(() => {
  const children = new Map<string | undefined, TimelineRow[]>()
  for (const { row } of tree.value) {
    let list = children.get(row.parentId)
    if (!list) children.set(row.parentId, list = [])
    list.push(row)
  }
  return children
})
const rowById = computed(() => new Map(tree.value.map(item => [item.row.id, item.row])))
function rowPlace(parentId: string | undefined, index: number): TimelineRowPosition {
  return parentId === undefined ? { index } : { parentId, index }
}
function rowPosition(row: TimelineRow): TimelineRowPosition {
  return rowPlace(row.parentId, rowChildren.value.get(row.parentId)!.indexOf(row))
}
let pendingRowFocus: string | undefined
function proposeRowMove(change: TimelineRowMove) {
  if (change.before.parentId === change.after.parentId && change.before.index === change.after.index) return
  const reason = props.validateRowMove?.(change)
  const message = reason === false ? messages.value.rowMoveRejected! : typeof reason === 'string' ? reason : undefined
  if (message !== undefined) {
    notice.value = message
    emit('row-move-rejected', change, message)
    return
  }
  notice.value = ''
  pendingRowFocus = change.id
  emit('row-move', change)
}
function rowHandleKeys(event: KeyboardEvent, row: TimelineRow) {
  if (!event.altKey || !rowHandlesVisible.value) return
  const before = rowPosition(row)
  const siblings = rowChildren.value.get(row.parentId)!
  let after: TimelineRowPosition | undefined
  if (event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    // Indent towards the row text: right in left-to-right charts, left in right-to-left charts.
    if ((event.key === 'ArrowRight') !== rtl.value) {
      const previous = siblings[before.index - 1]
      if (previous) after = rowPlace(previous.id, rowChildren.value.get(previous.id)?.length ?? 0)
    } else if (row.parentId !== undefined) {
      const parent = rowPosition(rowById.value.get(row.parentId)!)
      after = rowPlace(parent.parentId, parent.index + 1)
    }
  } else if (!event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    const index = before.index + (event.key === 'ArrowUp' ? -1 : 1)
    if (index >= 0 && index < siblings.length) after = rowPlace(row.parentId, index)
  } else {
    return
  }
  event.preventDefault()
  if (!after || gestureActive()) return
  proposeRowMove({ id: row.id, before, after, source: 'keyboard' })
}
type RowDrop = { gap: number; depth: number; target: TimelineRowPosition }
const rowDrop = shallowRef<RowDrop>()
let rowDrag: { id: string; pointerId: number; target: HTMLElement; y: number; moved: boolean } | undefined
function startRowDrag(event: PointerEvent, row: TimelineRow) {
  if (!rowHandlesVisible.value || gestureActive() || !event.isPrimary || event.button !== 0) return
  const target = event.currentTarget as HTMLElement
  // Keep a mouse drag from selecting text; focus the handle so that Escape cancels.
  if (event.pointerType !== 'touch') event.preventDefault()
  target.focus({ preventScroll: true })
  hideTooltip()
  rowDrag = { id: row.id, pointerId: event.pointerId, target, y: event.clientY, moved: false }
  target.setPointerCapture(event.pointerId)
}
/**
 * The drop position under a client y coordinate: before a row in the upper half of a displayed row, otherwise after
 * it, which is its first child when its children are shown. Positions inside the dragged subtree are not offered.
 */
function rowDropAt(id: string, clientY: number): RowDrop | undefined {
  const rows = displayedRows.value
  if (!canvas.value || !rows.length) return undefined
  const y = Math.max(0, Math.min(rows.length * props.rowHeight - 1, clientY - canvas.value.getBoundingClientRect().top - headerHeight.value))
  const index = Math.floor(y / props.rowHeight)
  const upper = y - index * props.rowHeight < props.rowHeight / 2
  const item = rows[index]!
  if (item.row.id === id) return undefined
  let parentId: string | undefined, depth: number, position: number
  if (upper) {
    parentId = item.row.parentId
    depth = item.depth
    position = rowChildren.value.get(parentId)!.filter(row => row.id !== id).indexOf(item.row)
  } else if (item.hasChildren && !collapsed.value.has(item.row.id)) {
    parentId = item.row.id
    depth = item.depth + 1
    position = 0
  } else {
    parentId = item.row.parentId
    depth = item.depth
    position = rowChildren.value.get(parentId)!.filter(row => row.id !== id).indexOf(item.row) + 1
  }
  for (let ancestor = parentId; ancestor !== undefined; ancestor = rowById.value.get(ancestor)?.parentId) {
    if (ancestor === id) return undefined
  }
  return { gap: upper ? index : index + 1, depth, target: rowPlace(parentId, position) }
}
function moveRowDrag(event: PointerEvent) {
  const active = rowDrag
  if (!active || active.pointerId !== event.pointerId) return
  if (!active.moved && Math.abs(event.clientY - active.y) < 4) return
  active.moved = true
  rowDrop.value = rowDropAt(active.id, event.clientY)
}
function cancelRowDrag() {
  const active = rowDrag
  rowDrag = undefined
  rowDrop.value = undefined
  if (active?.target.hasPointerCapture(active.pointerId)) active.target.releasePointerCapture(active.pointerId)
}
function finishRowDrag(event: PointerEvent) {
  const active = rowDrag
  if (!active || active.pointerId !== event.pointerId) return
  if (event.type !== 'pointerup') return cancelRowDrag()
  moveRowDrag(event)
  const drop = active.moved ? rowDrop.value : undefined
  const row = rowById.value.get(active.id)
  cancelRowDrag()
  if (drop && row) proposeRowMove({ id: row.id, before: rowPosition(row), after: drop.target, source: 'pointer' })
}
const rowDropStyle = computed(() => {
  const drop = rowDrop.value
  if (!drop) return undefined
  const indent = 9 + Math.min(drop.depth, 5) * 11
  return {
    [inlineSide.value]: `${indent}px`,
    width: `calc(var(--vw-label-area-width) + ${axis.value.width - indent}px)`,
    top: `${headerHeight.value + drop.gap * props.rowHeight - 1}px`,
  }
})
// After the parent applies a row move, keep the row in view and return focus to its handle.
watch(() => props.rows, async () => {
  const id = pendingRowFocus
  pendingRowFocus = undefined
  if (id === undefined) return
  await nextTick()
  const index = rowOrder.value.get(id)
  const el = scroller.value
  if (!el || index === undefined) return
  const top = index * props.rowHeight
  const visible = Math.max(0, el.clientHeight - headerHeight.value)
  if (top < el.scrollTop) el.scrollTop = top
  else if (top + props.rowHeight > el.scrollTop + visible) el.scrollTop = top + props.rowHeight - visible
  syncViewport()
  await nextTick()
  for (const element of el.querySelectorAll<HTMLElement>('[data-vw-row-handle]')) {
    if (element.dataset.vwRowHandle === id) return element.focus({ preventScroll: true })
  }
})

// Dependency creation and reconnection. A draft keeps one fixed bar end while the user picks the other one.
type LinkEnd = { bar: string; end: TimelineBarEnd }
type LinkDraft = { fixed: LinkEnd; role: 'from' | 'to'; dependency?: TimelineDependency }
const linkDraft = ref<LinkDraft>()
const linkPoint = ref<{ x: number; y: number }>()
let linkDrag: { pointerId: number; target: HTMLElement; x: number; y: number } | undefined
let skipLinkClick = false
const localDependency = ref<string>()
const activeDependencyId = computed(() => props.selectedDependencyId ?? localDependency.value)
const linkHandlesVisible = computed(() => !props.readonly && !validationError.value && (props.connectable || Boolean(linkDraft.value?.dependency)))
const dependencyTargets = computed(() => (props.connectable || props.reconnectable) && !validationError.value)

function linkKey(end: LinkEnd) {
  return JSON.stringify([end.bar, end.end])
}
function linkPressed(bar: TimelineBar, end: TimelineBarEnd) {
  const fixed = linkDraft.value?.fixed
  return Boolean(fixed && fixed.bar === bar.id && fixed.end === end)
}
function linkHandleName(bar: TimelineBar, end: TimelineBarEnd) {
  const action = linkDraft.value && !linkPressed(bar, end) ? messages.value.connectTo : messages.value.connectFrom
  return `${action} ${end === 'start' ? messages.value.startOf : messages.value.finishOf} ${bar.label}`
}
function linkHandleStyle(bar: TimelineBar, end: TimelineBarEnd) {
  const box = barBox(bar)
  // Keep handles inside the axis so the sticky label column never covers them.
  const x = Math.max(0, Math.min(axis.value.width - 12, end === 'start' ? box.left - 15 : box.left + box.width + 3))
  return {
    [inlineSide.value]: `calc(var(--vw-label-area-width) + ${x}px)`,
    top: `${laneTop(bar) + barHeight.value / 2 - 6}px`,
  }
}
/** Body coordinates of a bar end, relative to the time axis origin and the first row. */
function linkOrigin(end: LinkEnd) {
  const bar = barById.value.get(end.bar)
  const index = bar && rowOrder.value.get(bar.rowId)
  if (!bar || index === undefined) return undefined
  const range = rangeOf(bar)
  return { x: axis.value.toX(end.end === 'start' ? range.start : range.end), y: index * props.rowHeight + laneTop(bar) + barHeight.value / 2 }
}
const linkPreviewPath = computed(() => {
  const draft = linkDraft.value, point = linkPoint.value
  if (!draft || !point) return undefined
  const origin = linkOrigin(draft.fixed)
  return origin ? `M ${origin.x} ${origin.y} L ${point.x} ${point.y}` : undefined
})
function captureLink(event: PointerEvent) {
  const target = event.currentTarget as HTMLElement
  linkDrag = { pointerId: event.pointerId, target, x: event.clientX, y: event.clientY }
  target.focus({ preventScroll: true })
  target.setPointerCapture(event.pointerId)
}
function startLink(event: PointerEvent, bar: TimelineBar, end: TimelineBarEnd) {
  skipLinkClick = false
  if (linkDraft.value || !props.connectable || !event.isPrimary || event.button !== 0 || drag || pinch) return
  linkDraft.value = { fixed: { bar: bar.id, end }, role: 'to' }
  captureLink(event)
}
function moveLink(event: PointerEvent) {
  if (linkDrag?.pointerId !== event.pointerId || !canvas.value) return
  if (!linkPoint.value && Math.hypot(event.clientX - linkDrag.x, event.clientY - linkDrag.y) < 4) return
  const rect = canvas.value.getBoundingClientRect()
  linkPoint.value = { x: timeAreaOffset(event.clientX, rect), y: event.clientY - rect.top - headerHeight.value }
}
function clearLinkCapture() {
  const previous = linkDrag
  linkDrag = undefined
  linkPoint.value = undefined
  if (previous?.target.hasPointerCapture(previous.pointerId)) previous.target.releasePointerCapture(previous.pointerId)
}
function cancelLink() {
  if (linkDrag) skipLinkClick = true
  clearLinkCapture()
  linkDraft.value = undefined
}
function finishLink(event: PointerEvent) {
  if (linkDrag?.pointerId !== event.pointerId) return
  if (event.type !== 'pointerup') return cancelLink()
  moveLink(event)
  const dragged = Boolean(linkPoint.value)
  clearLinkCapture()
  skipLinkClick = true
  // A press without movement leaves the end armed for a second click or key.
  if (!dragged) return
  const element = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-vw-link], [data-vw-bar]')
  if (!element || !scroller.value?.contains(element)) {
    linkDraft.value = undefined
    return
  }
  if (element.dataset.vwLink) {
    const [bar, end] = JSON.parse(element.dataset.vwLink) as [string, TimelineBarEnd]
    return completeLink({ bar, end })
  }
  // Dropping on a bar body picks its nearer end.
  const rect = element.getBoundingClientRect()
  const firstHalf = event.clientX < rect.left + rect.width / 2
  completeLink({ bar: element.dataset.vwBar!, end: firstHalf !== rtl.value ? 'start' : 'finish' })
}
function activateLink(bar: TimelineBar, end: TimelineBarEnd, event: MouseEvent | KeyboardEvent) {
  if (event.type === 'click' && skipLinkClick) {
    skipLinkClick = false
    return
  }
  if (linkDraft.value) completeLink({ bar: bar.id, end })
  else if (props.connectable) linkDraft.value = { fixed: { bar: bar.id, end }, role: 'to' }
}
function completeLink(target: LinkEnd) {
  const pending = linkDraft.value
  linkDraft.value = undefined
  notice.value = ''
  if (props.readonly || !pending || pending.fixed.bar === target.bar || !barById.value.has(target.bar)) return
  const [from, to] = pending.role === 'from' ? [target, pending.fixed] : [pending.fixed, target]
  const connection: TimelineConnection = { from: from.bar, to: to.bar, type: dependencyTypeForEnds(from.end, to.end) }
  const dependency = pending.dependency
  const before: TimelineConnection | undefined = dependency && { from: dependency.from, to: dependency.to, type: dependency.type ?? 'FS' }
  if (before && before.from === connection.from && before.to === connection.to && before.type === connection.type) return
  const result = props.validateConnection?.(connection, dependency?.id)
  if (result === false || typeof result === 'string') {
    notice.value = typeof result === 'string' ? result : messages.value.connectionRejected ?? messages.value.rejected
    emit('connect-rejected', connection, notice.value)
  } else if (dependency && before) {
    emit('reconnect', { id: dependency.id, before, after: connection })
  } else {
    emit('connect', connection)
  }
}
function selectDependency(id: string) {
  localDependency.value = id
  emit('update:selectedDependencyId', id)
  emit('dependency-select', id)
}
function dependencyKeys(event: KeyboardEvent, id: string) {
  if (props.contextMenu && isMenuKey(event)) {
    keyboardContextMenu(event, { kind: 'dependency', id })
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    selectDependency(id)
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    // Selection stays possible when readonly, like bar selection; deleting is an edit proposal.
    if (!props.readonly) emit('dependency-delete', id)
  }
}
const reconnectHandles = computed(() => {
  const id = activeDependencyId.value
  if (!props.reconnectable || props.readonly || id === undefined) return []
  const line = shownLines.value.find(item => item.id === id)
  if (!line) return []
  const name = dependencyName(line.dependency)
  return [
    { end: 'from' as const, x: line.x1, y: line.y1, label: `${messages.value.reconnectSource} ${name}`, dependency: line.dependency },
    { end: 'to' as const, x: line.x2, y: line.y2, label: `${messages.value.reconnectTarget} ${name}`, dependency: line.dependency },
  ]
})
function reconnectDependency(dependency: TimelineDependency, end: 'from' | 'to', event?: PointerEvent) {
  if (event && (!event.isPrimary || event.button !== 0 || drag || linkDrag || pinch)) return
  skipLinkClick = false
  const ends = dependencyEndsForType(dependency.type)
  const fixed = end === 'from' ? { bar: dependency.to, end: ends.to } : { bar: dependency.from, end: ends.from }
  linkDraft.value = { fixed, role: end, dependency }
  if (event) captureLink(event)
}
function clickReconnect(dependency: TimelineDependency, end: 'from' | 'to') {
  if (skipLinkClick) skipLinkClick = false
  else reconnectDependency(dependency, end)
}
watch(() => props.dependencies, () => {
  cancelLink()
  if (localDependency.value !== undefined && !props.dependencies.some(dep => dep.id === localDependency.value)) localDependency.value = undefined
})
watch(() => [props.connectable, props.reconnectable], cancelLink)

// Two-pointer touch pinch zooms the time axis around the midpoint. A second touch cancels any in-flight edit.
const touches = new Map<number, { x: number; y: number }>()
let pinch: { distance: number; zoom: number; anchor: number } | undefined
function touchSpan() {
  const [a, b] = [...touches.values()]
  return { distance: Math.hypot(a!.x - b!.x, a!.y - b!.y), x: (a!.x + b!.x) / 2 }
}
function trackTouch(event: PointerEvent) {
  if (!props.pinchZoom || event.pointerType !== 'touch') return
  touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
  const el = scroller.value
  if (touches.size !== 2 || !el) return
  cancelEdit()
  hideTooltip()
  const span = touchSpan()
  pinch = { distance: Math.max(1, span.distance), zoom: zoom.value, anchor: Math.max(0, timeAreaOffset(span.x, el.getBoundingClientRect())) }
}
function moveTouch(event: PointerEvent) {
  if (!touches.has(event.pointerId)) return
  touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
  if (!pinch || touches.size !== 2) return
  event.preventDefault()
  const next = Math.max(minZoom, Math.min(maxZoom, pinch.zoom * touchSpan().distance / pinch.distance))
  if (Math.abs(next - zoom.value) > 0.001) void applyZoom(next, pinch.anchor)
}
function endTouch(event: PointerEvent) {
  touches.delete(event.pointerId)
  if (touches.size < 2) pinch = undefined
}
watch(() => props.pinchZoom, () => {
  touches.clear()
  pinch = undefined
})
// `touch-action: pan-x pan-y` keeps one-finger scrolling native but lets the browser take over a two-finger pan,
// which ends the pinch with `pointercancel`. A non-passive `touchmove` listener refuses that takeover while two
// touches are down; single-touch moves stay untouched.
function holdPinch(event: TouchEvent) {
  if (props.pinchZoom && event.touches.length >= 2 && event.cancelable) event.preventDefault()
}

// A new source interval or coordinate system invalidates an in-flight gesture.
watch([
  () => props.bars, () => props.rows, () => props.collapsedIds, localCollapsed, () => props.headerBands, () => props.columns, () => props.range,
  () => props.scale, () => props.pixelsPerUnit, () => props.snap, () => props.readonly, () => props.editBounds, () => props.minDuration,
  () => props.rowHeight, () => props.laneCount, () => props.autoScroll,
  activePreset, () => props.multiSelect ? props.selectedIds : undefined, () => props.multiSelect, () => props.rowDraggable,
  () => props.progressEditable, () => props.progressStep, () => props.createDuration, () => props.rowsReorderable,
  () => props.columnsResizable, () => props.labelWidth, () => props.minColumnWidth, () => props.maxColumnWidth,
], cancelEdit)

// Column resizing (`columnsResizable`). A separator at the inline-end edge of each header cell previews pointer
// drags and proposes keyboard steps; the parent accepts `column-resize` by setting the column width or `labelWidth`.
const minColumnSize = computed(() => props.minColumnWidth ?? 48)
const maxColumnSize = computed(() => Math.max(minColumnSize.value, props.maxColumnWidth ?? 800))
/** The rendered width of the row label column, read from `--vw-row-label-width` after mounting. */
const measuredLabelWidth = ref<number>()
const columnResize = shallowRef<{ id: string; width: number }>()
let columnDrag: { id: string; pointerId: number; target: HTMLElement; x: number; before: number } | undefined
function measureLabelColumn() {
  if (!props.columnsResizable || columnResize.value || !root.value) return
  const width = parseFloat(getComputedStyle(root.value).getPropertyValue('--vw-row-label-width'))
  measuredLabelWidth.value = Number.isFinite(width) && width > 0 ? width : undefined
}
watch(() => props.columnsResizable, () => { if (mounted) measureLabelColumn() })
function clampColumnWidth(width: number) {
  return Math.round(Math.max(minColumnSize.value, Math.min(maxColumnSize.value, width)))
}
function shownColumnWidth(column: TimelineColumn) {
  return columnResize.value?.id === column.id ? columnResize.value.width : column.width
}
/** Extra width of the columns while a column drag is previewed. */
const columnResizeDelta = computed(() => {
  const preview = columnResize.value
  const column = preview && props.columns?.find(item => item.id === preview.id)
  return column ? preview.width - column.width : 0
})
/** `labelWidth` or a previewed label column width, set on the canvas so that the default markup stays unchanged. */
const labelWidthStyle = computed(() => {
  const preview = columnResize.value
  const width = preview?.id === timelineLabelColumnId ? preview.width : props.labelWidth
  return width === undefined ? undefined : { '--vw-row-label-width': width + 'px' }
})
const resizeHandles = computed(() => {
  if (!props.columnsResizable || validationError.value) return []
  const preview = columnResize.value
  const label = props.labelWidth ?? measuredLabelWidth.value ?? 154
  const handles = [{ id: timelineLabelColumnId, label: messages.value.rows, width: label, shown: preview?.id === timelineLabelColumnId ? preview.width : label, offset: 0 }]
  let offset = 0
  for (const column of props.columns ?? []) {
    const shown = shownColumnWidth(column)
    offset += shown
    handles.push({ id: column.id, label: column.label, width: column.width, shown, offset })
  }
  return handles
})
type ResizeHandle = (typeof resizeHandles.value)[number]
interface HeaderCell {
  key: string
  className: string
  style: Record<string, string>
  attrs: Record<string, string | number>
  on: Record<string, (event: Event) => void>
  text: string
}
function handleCell(handle: ResizeHandle): HeaderCell {
  const pointer = (event: Event) => event as PointerEvent
  return {
    key: '\u0000resize:' + handle.id,
    className: columnResize.value?.id === handle.id ? 'vw-column-resize active' : 'vw-column-resize',
    style: { [inlineSide.value]: `calc(var(--vw-row-label-width) + ${handle.offset - 8}px)` },
    attrs: {
      role: 'separator', tabindex: 0, 'aria-orientation': 'vertical', 'aria-label': `${messages.value.resizeColumn} ${handle.label}`,
      'aria-valuenow': handle.shown, 'aria-valuemin': minColumnSize.value, 'aria-valuemax': maxColumnSize.value,
    },
    on: {
      pointerdown: event => startColumnResize(pointer(event), handle),
      pointermove: event => moveColumnResize(pointer(event)),
      pointerup: event => finishColumnResize(pointer(event)),
      pointercancel: event => finishColumnResize(pointer(event)),
      lostpointercapture: event => finishColumnResize(pointer(event)),
      keydown: event => columnResizeKeys(event as KeyboardEvent, handle),
    },
    text: '',
  }
}
/** The extra column headers, each followed by its resize separator, after the label column's separator. */
const headerCells = computed(() => {
  const handles = resizeHandles.value
  const cells: HeaderCell[] = handles.length ? [handleCell(handles[0]!)] : []
  ;(props.columns ?? []).forEach((column, index) => {
    cells.push({ key: column.id, className: 'vw-extra-column', style: { width: shownColumnWidth(column) + 'px' }, attrs: {}, on: {}, text: column.label })
    if (handles[index + 1]) cells.push(handleCell(handles[index + 1]!))
  })
  return cells
})
function proposeColumnResize(change: TimelineColumnResize) {
  if (change.before === change.after) return
  const reason = props.validateColumnResize?.(change)
  const message = reason === false ? messages.value.columnResizeRejected! : typeof reason === 'string' ? reason : undefined
  if (message !== undefined) {
    notice.value = message
    emit('column-resize-rejected', change, message)
    return
  }
  notice.value = ''
  emit('column-resize', change)
}
function startColumnResize(event: PointerEvent, handle: ResizeHandle) {
  // The scroller would otherwise treat the press as the start of a pan, selection or new bar.
  event.stopPropagation()
  if (!props.columnsResizable || gestureActive() || !event.isPrimary || event.button !== 0) return
  const target = event.currentTarget as HTMLElement
  // Keep a mouse drag from selecting text; focus the handle so that Escape cancels.
  if (event.pointerType !== 'touch') event.preventDefault()
  target.focus({ preventScroll: true })
  hideTooltip()
  columnDrag = { id: handle.id, pointerId: event.pointerId, target, x: inlineClientX(event.clientX), before: handle.width }
  target.setPointerCapture(event.pointerId)
}
function moveColumnResize(event: PointerEvent) {
  const active = columnDrag
  if (!active || active.pointerId !== event.pointerId) return
  // Dragging towards the inline end widens the column: right in left-to-right charts, left in right-to-left charts.
  const width = clampColumnWidth(active.before + inlineClientX(event.clientX) - active.x)
  if (columnResize.value?.id !== active.id || columnResize.value.width !== width) columnResize.value = { id: active.id, width }
}
function cancelColumnResize() {
  const active = columnDrag
  columnDrag = undefined
  columnResize.value = undefined
  if (active?.target.hasPointerCapture(active.pointerId)) active.target.releasePointerCapture(active.pointerId)
}
function finishColumnResize(event: PointerEvent) {
  const active = columnDrag
  if (!active || active.pointerId !== event.pointerId) return
  if (event.type !== 'pointerup') return cancelColumnResize()
  moveColumnResize(event)
  const after = columnResize.value?.width ?? active.before
  cancelColumnResize()
  proposeColumnResize({ id: active.id, before: active.before, after, source: 'pointer' })
}
function columnResizeKeys(event: KeyboardEvent, handle: ResizeHandle) {
  let after: number
  if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    // The arrows move the column edge on screen, so ArrowLeft widens a column in right-to-left charts.
    const direction = (event.key === 'ArrowRight') !== rtl.value ? 1 : -1
    after = clampColumnWidth(handle.width + direction * (event.shiftKey ? 40 : 10))
  } else if (event.key === 'Home' || event.key === 'End') {
    after = event.key === 'Home' ? minColumnSize.value : maxColumnSize.value
  } else {
    return
  }
  event.preventDefault()
  if (gestureActive()) return
  proposeColumnResize({ id: handle.id, before: handle.width, after, source: 'keyboard' })
}

// Progress editing (`progressEditable`). A slider at the progress boundary previews pointer drags and proposes
// keyboard steps; the parent accepts `progress-edit` by setting the bar's progress.
const progressPreview = ref<{ id: string; value: number }>()
let progressDrag: { id: string; pointerId: number; target: HTMLElement; x: number } | undefined
function canEditProgress(bar: TimelineBar) {
  return Boolean(props.progressEditable) && !props.readonly && Boolean(bar.editable) && bar.start !== bar.end
}
const progressHandlesVisible = computed(() => Boolean(props.progressEditable) && !props.readonly && !validationError.value)
const linkEnds = ['start', 'finish'] as const
type BarHandle = TimelineBarEnd | 'progress'
/**
 * The handles drawn beside a bar: its link handles, then its progress slider (a button with the slider role). They
 * share one template loop so that a chart without progress editing renders exactly the markup it did before.
 */
function barHandles(bar: TimelineBar): readonly BarHandle[] {
  const ends = linkHandlesVisible.value ? linkEnds : []
  return progressHandlesVisible.value && canEditProgress(bar) ? [...ends, 'progress'] : ends
}
function handleAttrs(bar: TimelineBar, handle: BarHandle) {
  if (handle !== 'progress') {
    return {
      class: ['vw-gantt-link-handle', handle, { active: linkPressed(bar, handle) }],
      style: linkHandleStyle(bar, handle),
      'data-vw-link': linkKey({ bar: bar.id, end: handle }),
      'aria-label': linkHandleName(bar, handle),
      'aria-pressed': linkPressed(bar, handle),
    }
  }
  const value = shownProgress(bar) ?? 0
  return {
    class: ['vw-gantt-progress-handle', { dragging: progressPreview.value?.id === bar.id }],
    style: progressHandleStyle(bar),
    'data-vw-progress': bar.id,
    role: 'slider',
    'aria-label': `${messages.value.progressOf} ${bar.label}`,
    'aria-valuemin': 0,
    'aria-valuemax': 100,
    'aria-valuenow': Math.round(value * 10000) / 100,
    'aria-valuetext': percent(value),
  }
}
function pressHandle(event: PointerEvent, bar: TimelineBar, handle: BarHandle) {
  if (handle === 'progress') startProgress(event, bar)
  else startLink(event, bar, handle)
}
function clickHandle(event: MouseEvent, bar: TimelineBar, handle: BarHandle) {
  event.stopPropagation()
  if (handle !== 'progress') activateLink(bar, handle, event)
}
function handleKeys(event: KeyboardEvent, bar: TimelineBar, handle: BarHandle) {
  if (handle === 'progress') return progressKeys(event, bar)
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.stopPropagation()
  event.preventDefault()
  activateLink(bar, handle, event)
}
function percent(value: number) {
  return Math.round(value * 100) + '%'
}
function progressHandleStyle(bar: TimelineBar) {
  const range = rangeOf(bar)
  const x = axis.value.toX(progressTime(range, workSegments(bar, range), shownProgress(bar) ?? 0))
  return {
    [inlineSide.value]: `calc(var(--vw-label-area-width) + ${x - 6}px)`,
    top: `${laneTop(bar) + barHeight.value - 6}px`,
    ...rowShiftStyle(bar),
  }
}
function cancelProgress() {
  const previous = progressDrag
  progressDrag = undefined
  progressPreview.value = undefined
  if (previous?.target.hasPointerCapture(previous.pointerId)) previous.target.releasePointerCapture(previous.pointerId)
}
function proposeProgress(change: TimelineProgressEdit) {
  if (change.after === (change.before ?? 0)) return
  const reason = rejection(props.validateProgressEdit?.(change))
  if (reason !== undefined) {
    notice.value = reason
    emit('progress-edit-rejected', change, reason)
  } else {
    notice.value = ''
    emit('progress-edit', change)
  }
}
function startProgress(event: PointerEvent, bar: TimelineBar) {
  if (!canEditProgress(bar) || gestureActive() || !event.isPrimary || event.button !== 0) return
  const target = event.currentTarget as HTMLElement
  hideTooltip()
  target.focus({ preventScroll: true })
  progressDrag = { id: bar.id, pointerId: event.pointerId, target, x: event.clientX }
  target.setPointerCapture(event.pointerId)
}
/** Map the pointer to progress over the bar, or over its working time when it has segments, as the fill is drawn. */
function moveProgress(event: PointerEvent) {
  const active = progressDrag
  if (!active || active.pointerId !== event.pointerId || !canvas.value) return
  if (!progressPreview.value && Math.abs(event.clientX - active.x) < 2) return
  const bar = barById.value.get(active.id)
  if (!bar) return cancelProgress()
  const time = axis.value.toTime(timeAreaOffset(event.clientX, canvas.value.getBoundingClientRect()))
  progressPreview.value = { id: bar.id, value: snapProgress(progressAt(bar, workSegments(bar, bar), time), props.progressStep) }
}
function finishProgress(event: PointerEvent) {
  const active = progressDrag
  if (!active || active.pointerId !== event.pointerId) return
  if (event.type !== 'pointerup') return cancelProgress()
  moveProgress(event)
  const preview = progressPreview.value
  const bar = barById.value.get(active.id)
  cancelProgress()
  if (preview && bar) proposeProgress({ id: bar.id, before: bar.progress, after: preview.value, source: 'pointer' })
}
function progressKeys(event: KeyboardEvent, bar: TimelineBar) {
  if (event.key === 'Escape') return cancelEdit()
  if (props.contextMenu && isMenuKey(event)) return keyboardContextMenu(event, { kind: 'bar', id: bar.id }, bar.rowId)
  if (!canEditProgress(bar) || gestureActive()) return
  const current = bar.progress ?? 0
  const step = props.progressStep
  // Left and Right follow the visual direction: in RTL progress grows towards the left.
  const forward = (event.key === 'ArrowRight') !== rtl.value
  const next = event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? snapProgress(current + (forward ? step : -step), step)
    : event.key === 'ArrowUp' ? snapProgress(current + step, step)
      : event.key === 'ArrowDown' ? snapProgress(current - step, step)
        : event.key === 'PageUp' ? snapProgress(current + 0.25, step)
          : event.key === 'PageDown' ? snapProgress(current - 0.25, step)
            : event.key === 'Home' ? 0 : event.key === 'End' ? 1 : undefined
  if (next === undefined) return
  event.preventDefault()
  proposeProgress({ id: bar.id, before: bar.progress, after: next, source: 'keyboard' })
}

// Drag to create (`creatable`). A press on the empty timeline area of a row previews a new bar while the pointer
// moves; release (or a click) proposes it, and the parent adds the bar to accept it. The template adds the row's add
// button in a `v-else-if` branch of the expand toggle, and the create and cascade previews in branches of the link
// preview, so a chart without these props renders exactly the markup it did before.
const createPreview = shallowRef<{ rowId: string; lane: number; range: TimeRange }>()
let createDrag: { pointerId: number; rowId: string; time: number; x: number; moved: boolean } | undefined
const createLength = computed(() => props.createDuration ?? 4 * activeSnap.value)
function canCreateIn(row: TimelineRow) {
  if (!props.creatable || props.readonly || validationError.value) return false
  return typeof props.creatable === 'function' ? Boolean(props.creatable(row)) : true
}
/** The nearest multiple of `snap` from the range start. */
function snapTime(time: number) {
  const step = activeSnap.value
  return props.range.start + Math.round((time - props.range.start) / step) * step
}
/** [start, start + length) moved inside editBounds, and shortened only when the bounds are shorter. */
function placeInBounds(start: number, length: number): TimeRange {
  const { start: low, end: high } = bounds.value
  const size = Math.min(length, high - low)
  const from = Math.max(low, Math.min(high - size, start))
  return { start: from, end: from + size }
}
/** The snapped interval between the press and the pointer, at least minDuration long and inside editBounds. */
function createInterval(from: number, to: number): TimeRange {
  const a = snapTime(from), b = snapTime(to)
  const start = Math.max(bounds.value.start, Math.min(a, b)), end = Math.min(bounds.value.end, Math.max(a, b))
  if (end - start >= minimum.value) return { start, end }
  // Too short: grow away from the press point.
  return b >= a ? placeInBounds(start, minimum.value) : placeInBounds(end - minimum.value, minimum.value)
}
/** Time under a client x coordinate, clamped to the axis. */
function timeAt(clientX: number) {
  const x = canvas.value ? timeAreaOffset(clientX, canvas.value.getBoundingClientRect()) : 0
  return axis.value.toTime(Math.max(0, Math.min(axis.value.width, x)))
}
/** Lane of a displayed row under a client y coordinate, clamped to the lanes. */
function laneAt(rowId: string, clientY: number) {
  const index = rowOrder.value.get(rowId)
  if (index === undefined || !canvas.value) return 0
  const offset = clientY - canvas.value.getBoundingClientRect().top - headerHeight.value - index * props.rowHeight - laneOffset(0)
  return Math.max(0, Math.min(props.laneCount - 1, Math.floor(offset / laneHeight.value)))
}
function pressRow(event: PointerEvent, row: TimelineRow) {
  // Bars, handles, cells and the heading column are descendants; only the row's own background is empty.
  const el = scroller.value, area = canvas.value
  if (event.target !== event.currentTarget || !el || !area || !canCreateIn(row) || !event.isPrimary || event.button !== 0 || gestureActive()) return
  const x = timeAreaOffset(event.clientX, area.getBoundingClientRect())
  if (x < 0 || x > axis.value.width) return
  // Keep a mouse drag from selecting text; focus goes to the region so that Escape cancels.
  if (event.pointerType !== 'touch') event.preventDefault()
  el.focus({ preventScroll: true })
  hideTooltip()
  createDrag = { pointerId: event.pointerId, rowId: row.id, time: axis.value.toTime(x), x: event.clientX, moved: false }
  el.setPointerCapture(event.pointerId)
  lastClientX = event.clientX
  lastClientY = event.clientY
  startAutoScroll()
}
function moveCreate(event: PointerEvent) {
  const active = createDrag
  if (!active || active.pointerId !== event.pointerId) return
  lastClientX = event.clientX
  lastClientY = event.clientY
  if (!active.moved && Math.abs(event.clientX - active.x) < 3) return
  active.moved = true
  updateCreatePreview()
}
function updateCreatePreview() {
  const active = createDrag
  if (!active?.moved) return
  createPreview.value = { rowId: active.rowId, lane: laneAt(active.rowId, lastClientY), range: createInterval(active.time, timeAt(lastClientX)) }
}
function cancelCreate() {
  const active = createDrag
  createDrag = undefined
  createPreview.value = undefined
  if (!active) return
  stopAutoScroll()
  if (scroller.value?.hasPointerCapture(active.pointerId)) scroller.value.releasePointerCapture(active.pointerId)
}
function finishCreate(event: PointerEvent) {
  const active = createDrag
  if (!active || active.pointerId !== event.pointerId) return
  if (event.type !== 'pointerup') return cancelCreate()
  moveCreate(event)
  const row = displayedRows.value[rowOrder.value.get(active.rowId) ?? -1]?.row
  const lane = laneAt(active.rowId, event.clientY)
  // A click without movement proposes `createDuration` from the snapped press time.
  const range = active.moved ? createInterval(active.time, timeAt(event.clientX)) : placeInBounds(snapTime(active.time), createLength.value)
  cancelCreate()
  if (row && canCreateIn(row)) proposeCreate({ rowId: row.id, lane, start: range.start, end: range.end, source: 'pointer' })
}
/** The add button of a row proposes `createDuration` from the first snapped time in view, in the lowest free lane. */
function createFromButton(event: MouseEvent, row: TimelineRow) {
  if (!canCreateIn(row) || gestureActive()) return
  const el = scroller.value
  const step = activeSnap.value
  const visible = el ? axis.value.toTime(Math.min(axis.value.width, scrollStart(el))) : props.range.start
  const range = placeInBounds(props.range.start + Math.ceil((visible - props.range.start) / step) * step, createLength.value)
  const busy = (barsByRow.value.get(row.id) ?? []).filter(bar => bar.start === bar.end
    ? bar.start >= range.start && bar.start < range.end : bar.start < range.end && range.start < bar.end)
  let lane = 0
  while (lane < props.laneCount && busy.some(bar => (bar.lane ?? 0) === lane)) lane++
  proposeCreate({ rowId: row.id, lane: lane < props.laneCount ? lane : 0, start: range.start, end: range.end, source: event.detail === 0 ? 'keyboard' : 'pointer' })
}
function proposeCreate(proposal: TimelineCreate) {
  const result = props.validateCreate?.(proposal)
  const reason = result === false ? messages.value.createRejected! : typeof result === 'string' ? result : undefined
  if (reason !== undefined) {
    notice.value = reason
    emit('create-rejected', proposal, reason)
  } else {
    notice.value = ''
    emit('create', proposal)
  }
}
const createBox = computed(() => {
  const preview = createPreview.value
  const index = preview && rowOrder.value.get(preview.rowId)
  return preview && index !== undefined ? previewStyle(preview.range, index, preview.lane) : undefined
})

// Context menu (`contextMenu`). The component reports what was targeted and where; the parent renders the menu.
let keyboardMenu: { at: number; element: Element } | undefined
function isMenuKey(event: KeyboardEvent) {
  return event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)
}
function keyboardContextMenu(event: KeyboardEvent, target: TimelineContextTarget, rowId?: string) {
  event.preventDefault()
  const element = event.currentTarget as Element
  // Some browsers still follow the key with a `contextmenu` event on the focused element; it is ignored for a moment,
  // unless a pointer press shows that the next one comes from a real right-click.
  keyboardMenu = { at: event.timeStamp, element }
  hideTooltip()
  const rect = element.getBoundingClientRect()
  const menu: TimelineContextMenu = { target, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, source: 'keyboard' }
  if (rowId !== undefined) menu.rowId = rowId
  emit('context-menu', menu)
}
function pressScroller(event: PointerEvent) {
  keyboardMenu = undefined
  trackTouch(event)
}
function onContextMenu(event: MouseEvent) {
  // A menu opened during a create drag (for example Control-click on macOS) ends the drag without a proposal.
  if (createDrag) cancelCreate()
  const el = scroller.value, area = canvas.value
  if (!props.contextMenu || !el || !area) return
  const element = event.target instanceof Element ? event.target : undefined
  const recent = keyboardMenu
  keyboardMenu = undefined
  if (recent && element && recent.element.contains(element) && event.timeStamp - recent.at < 1000) {
    event.preventDefault()
    return
  }
  // Text inputs in columns keep the browser menu for copy and paste.
  if (element?.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return
  event.preventDefault()
  hideTooltip()
  const rect = area.getBoundingClientRect()
  const x = timeAreaOffset(event.clientX, rect)
  const y = event.clientY - rect.top - headerHeight.value
  // The sticky header and row heading column cover the scrolled content; neither is part of the body or time area.
  const inHeader = event.clientY < rect.top + el.scrollTop + headerHeight.value
  const inTime = x >= scrollStart(el) && x >= 0 && x <= axis.value.width
  const row = !inHeader && y >= 0 ? displayedRows.value[Math.floor(y / props.rowHeight)]?.row : undefined
  const menu: TimelineContextMenu = {
    target: contextTarget(element) ?? (row ? { kind: 'row', id: row.id } : { kind: 'chart' }),
    clientX: event.clientX, clientY: event.clientY, source: 'pointer',
  }
  if (inTime) menu.time = axis.value.toTime(x)
  if (row) menu.rowId = row.id
  emit('context-menu', menu)
}
function contextTarget(element: Element | undefined): TimelineContextTarget | undefined {
  const owner = element?.closest<HTMLElement | SVGElement>('[data-vw-bar], [data-vw-progress], [data-vw-link], [data-vw-dependency]')
  if (!owner || !scroller.value?.contains(owner)) return undefined
  const { vwBar, vwProgress, vwLink, vwDependency } = owner.dataset
  if (vwDependency !== undefined) return { kind: 'dependency', id: vwDependency }
  const id = vwBar ?? vwProgress ?? (vwLink ? (JSON.parse(vwLink) as [string, TimelineBarEnd])[0] : undefined)
  return id !== undefined && barById.value.has(id) ? { kind: 'bar', id } : undefined
}

// Tooltip slot. Shown next to a hovered bar after `tooltipDelay`, or at once next to a keyboard-focused bar, and never
// during a gesture. It stays while the pointer moves onto it, Escape dismisses it, and it is kept inside the viewport.
const tooltipId = marker + '-tooltip'
const tooltipTarget = ref<string>()
const tooltipEl = ref<HTMLElement>()
const tooltipPlace = ref<{ left: string; top: string }>()
const tooltipBar = computed(() => tooltipTarget.value === undefined ? undefined : barById.value.get(tooltipTarget.value))
let tooltipShowTimer: ReturnType<typeof setTimeout> | undefined
let tooltipHideTimer: ReturnType<typeof setTimeout> | undefined
let hoveredBar: string | undefined
let pressedBar: string | undefined
let dismissedBar: string | undefined
let keyboardFocusedBar: string | undefined
function tooltipAllowed() {
  return mounted && Boolean(slots.tooltip) && !validationError.value && !gestureActive()
}
function clearTooltipTimers() {
  if (tooltipShowTimer !== undefined) clearTimeout(tooltipShowTimer)
  if (tooltipHideTimer !== undefined) clearTimeout(tooltipHideTimer)
  tooltipShowTimer = tooltipHideTimer = undefined
}
function showTooltip(id: string) {
  clearTooltipTimers()
  if (!tooltipAllowed() || dismissedBar === id || !barById.value.has(id)) return
  if (tooltipTarget.value !== id) tooltipPlace.value = undefined
  tooltipTarget.value = id
  document.addEventListener('keydown', dismissTooltip)
}
function hideTooltip() {
  clearTooltipTimers()
  tooltipTarget.value = undefined
  tooltipPlace.value = undefined
  if (typeof document !== 'undefined') document.removeEventListener('keydown', dismissTooltip)
}
function dismissTooltip(event: KeyboardEvent) {
  if (event.key !== 'Escape' || tooltipTarget.value === undefined) return
  dismissedBar = tooltipTarget.value
  hideTooltip()
}
/** Hide after a short grace period so the pointer can travel from the bar onto the tooltip. */
function scheduleTooltipHide() {
  if (tooltipHideTimer !== undefined) clearTimeout(tooltipHideTimer)
  tooltipHideTimer = setTimeout(() => {
    tooltipHideTimer = undefined
    const held = keyboardFocusedBar !== undefined && focusedBarId.value === keyboardFocusedBar ? keyboardFocusedBar : undefined
    if (tooltipTarget.value !== undefined && tooltipTarget.value !== held) hideTooltip()
  }, 120)
}
function hoverBar(bar: TimelineBar) {
  if (!slots.tooltip) return
  hoveredBar = bar.id
  // Entering the bar again is a new trigger after an Escape dismissal.
  if (dismissedBar === bar.id) dismissedBar = undefined
  if (tooltipTarget.value === bar.id) {
    if (tooltipHideTimer !== undefined) clearTimeout(tooltipHideTimer)
    tooltipHideTimer = undefined
    return
  }
  if (pressedBar === bar.id || !tooltipAllowed()) return
  if (tooltipShowTimer !== undefined) clearTimeout(tooltipShowTimer)
  tooltipShowTimer = setTimeout(() => {
    tooltipShowTimer = undefined
    if (hoveredBar === bar.id && pressedBar !== bar.id) showTooltip(bar.id)
  }, props.tooltipDelay)
}
function leaveBar(bar: TimelineBar) {
  if (hoveredBar === bar.id) hoveredBar = undefined
  if (pressedBar === bar.id) pressedBar = undefined
  if (tooltipShowTimer !== undefined) clearTimeout(tooltipShowTimer)
  tooltipShowTimer = undefined
  if (tooltipTarget.value === bar.id) scheduleTooltipHide()
}
/** A press starts a click or a gesture: hide the tooltip until the pointer leaves the bar. */
function pressBar(bar: TimelineBar) {
  if (!slots.tooltip) return
  pressedBar = bar.id
  hideTooltip()
}
function focusTooltip(event: FocusEvent, bar: TimelineBar) {
  if (!slots.tooltip) return
  keyboardFocusedBar = undefined
  dismissedBar = undefined
  let keyboard = true
  try {
    keyboard = (event.currentTarget as Element).matches(':focus-visible')
  } catch {
    // Without :focus-visible support every focus counts as keyboard focus.
  }
  if (!keyboard) return
  keyboardFocusedBar = bar.id
  showTooltip(bar.id)
}
function blurTooltip(id: string) {
  if (keyboardFocusedBar === id) keyboardFocusedBar = undefined
  if (dismissedBar === id && hoveredBar !== id) dismissedBar = undefined
  if (tooltipTarget.value === id && hoveredBar !== id) hideTooltip()
}
function enterTooltip() {
  if (tooltipHideTimer !== undefined) clearTimeout(tooltipHideTimer)
  tooltipHideTimer = undefined
}
function leaveTooltip() {
  if (tooltipTarget.value !== undefined && hoveredBar !== tooltipTarget.value) scheduleTooltipHide()
}
/** Place the tooltip above the visible part of its bar, or below it, inside the scroll viewport. */
function placeTooltip() {
  const tip = tooltipEl.value, el = scroller.value, id = tooltipTarget.value
  if (!tip || !el || id === undefined) return
  const anchor = [...el.querySelectorAll<HTMLElement>('[data-vw-bar]')].find(element => element.dataset.vwBar === id)
  if (!anchor) return hideTooltip()
  const box = anchor.getBoundingClientRect()
  const outer = el.getBoundingClientRect()
  const area = {
    left: outer.left + el.clientLeft, top: outer.top + el.clientTop,
    right: outer.left + el.clientLeft + el.clientWidth, bottom: outer.top + el.clientTop + el.clientHeight,
  }
  // Only the part of the bar inside the time area counts; the sticky heading column and header cover the rest.
  const labels = viewport.value.labels
  const left = Math.max(box.left, rtl.value ? area.left : area.left + labels)
  const right = Math.min(box.right, rtl.value ? area.right - labels : area.right)
  if (right < left || box.bottom < area.top + headerHeight.value || box.top > area.bottom) return hideTooltip()
  const width = tip.offsetWidth, height = tip.offsetHeight, gap = 6
  let top = box.top - gap - height
  if (top < area.top) top = box.bottom + gap
  if (top + height > area.bottom) top = Math.max(area.top, area.bottom - height)
  const x = Math.max(area.left, Math.min(area.right - width, (left + right) / 2 - width / 2))
  // Convert from viewport coordinates to the tooltip's containing block, whichever element that is.
  const current = tip.getBoundingClientRect()
  const originX = current.left - (parseFloat(tip.style.left) || 0)
  const originY = current.top - (parseFloat(tip.style.top) || 0)
  tooltipPlace.value = { left: `${x - originX}px`, top: `${top - originY}px` }
}
watch(tooltipBar, bar => {
  if (!bar && tooltipTarget.value !== undefined) hideTooltip()
})
watch(linkDraft, draft => {
  if (draft) hideTooltip()
})
watch([tooltipTarget, viewport, axis, () => props.bars, displayedRows, rtl, headerHeight], () => {
  if (tooltipTarget.value !== undefined) placeTooltip()
}, { flush: 'post' })

/**
 * Zoom so the union interval of the bars fits the visible time area minus `padding` on each side, within the zoom
 * limits, then scroll it into view (centred when it fits). Without IDs, every bar in the displayed rows is used.
 * Validation errors are thrown at once; the returned promise resolves after the scroll position is applied.
 */
function fitToBars(ids?: Iterable<string>, options: TimelineFitOptions = {}): Promise<void> {
  const padding = options.padding ?? 24
  if (typeof padding !== 'number' || !Number.isFinite(padding) || padding < 0) throw new RangeError('padding must be finite and nonnegative')
  const chosen: TimelineBar[] = []
  if (ids === undefined) {
    for (const { row } of displayedRows.value) chosen.push(...barsByRow.value.get(row.id) ?? [])
  } else {
    for (const id of ids) {
      const bar = barById.value.get(id)
      if (!bar) throw new Error('Unknown bar: ' + id)
      chosen.push(bar)
    }
  }
  if (!chosen.length) return Promise.resolve()
  let start = Infinity, end = -Infinity
  for (const bar of chosen) {
    start = Math.min(start, bar.start)
    end = Math.max(end, bar.end)
  }
  const el = scroller.value
  const visible = Math.max(0, (el ? el.clientWidth : viewport.value.width) - viewport.value.labels)
  const available = Math.max(1, visible - 2 * padding)
  // The zoom factor scales the base scale linearly, so this also holds for a custom, non-linear scale.
  const span = (axis.value.toX(end) - axis.value.toX(start)) / zoom.value
  // The coordinate system changes: cancel pointer gestures (an armed keyboard connection is kept).
  if (drag || progressDrag || linkDrag || pinch || createDrag) cancelEdit()
  hideTooltip()
  if (span > 0) zoom.value = Math.max(minZoom, Math.min(maxZoom, available / span))
  return nextTick().then(() => {
    if (!el) return
    const left = axis.value.toX(start), right = axis.value.toX(end)
    setScrollStart(el, Math.max(0, right - left <= available ? (left + right) / 2 - visible / 2 : left - padding))
    syncViewport()
  })
}

// Load histogram rows follow the task rows on the same scroll surface.
const loadHeight = computed(() => loadHistogram.value ? (props.loadRows?.length ?? 0) * props.loadRowHeight : 0)
const shownLoadRows = computed(() => {
  const histogram = loadHistogram.value
  if (!histogram || !props.loadRows?.length) return []
  const offset = Math.max(0, viewport.value.top - bodyHeight.value)
  const covered = Math.max(0, bodyHeight.value - viewport.value.top)
  const visible = Math.max(0, viewport.value.height - headerHeight.value - covered)
  const { first, afterLast } = visibleRows(offset, visible, props.loadRowHeight, props.loadRows.length)
  return props.loadRows.slice(first, afterLast).map((row, i) => {
    const { segments, peak } = histogram.get(row.id)!
    const scale = Math.max(1e-9, peak)
    return {
      row, index: first + i, peak,
      segments: segments.filter(segment => intersectsWindow(segment, timeWindow.value)).map(segment => {
        const overload = segment.overload ?? Math.max(0, segment.load - segment.capacity)
        const left = axis.value.toX(segment.start)
        return {
          segment, overload,
          key: segment.start,
          left, width: axis.value.toX(segment.end) - left,
          fill: Math.min(segment.load, segment.capacity) / scale * 100,
          over: overload / scale * 100,
          capacity: segment.capacity / scale * 100,
          label: `${row.label} ${props.formatTime(segment.start)}–${props.formatTime(segment.end)}: ${messages.value.load} ${segment.load} / ${messages.value.capacity} ${segment.capacity}`
            + (overload > 0 ? `, ${messages.value.overload} ${overload}` : ''),
        }
      }),
    }
  })
})

function scrollToTime(time: number) {
  if (!Number.isFinite(time)) throw new RangeError('time must be finite')
  if (scroller.value) setScrollStart(scroller.value, axis.value.toX(time))
  syncViewport()
}
function scrollToRow(id: string) {
  const index = rowOrder.value.get(id)
  if (index !== undefined && scroller.value) scroller.value.scrollTop = index * props.rowHeight
  syncViewport()
}
/** Width of the row heading column, read from `--vw-row-label-width`. */
function rowLabelWidth() {
  const element = canvas.value ?? root.value
  const value = element ? parseFloat(getComputedStyle(element).getPropertyValue('--vw-row-label-width')) : NaN
  return Number.isFinite(value) && value >= 0 ? value : 154
}
/**
 * A standalone SVG document of the chart with the default rendering: every displayed row (respecting collapsed rows),
 * the whole range at the current zoom, header bands, ticks, markers, the now line and load rows. Slots are not used.
 */
function exportSvg(options: GanttExportOptions = {}) {
  if (validationError.value) throw validationError.value
  const { includeLoad = true, includeStatusDate = true, theme, ...rest } = options
  const time = props.now ?? clientNow.value
  return renderTimelineSvg(props.rows, props.bars, props.dependencies, axis.value, {
    idPrefix: 'vw-export-' + marker.replace(/[^\w-]/g, ''),
    ...rest,
    collapsedIds: collapsed.value,
    rowHeight: props.rowHeight,
    laneCount: props.laneCount,
    labelWidth: rowLabelWidth(),
    columns: props.columns,
    showSummaries: props.showSummaries,
    headerBands: activeBands.value,
    markers: props.markers,
    now: props.showNow && time !== undefined && time >= props.range.start && time <= props.range.end ? time : undefined,
    nowLabel: messages.value.now,
    tickStep: tickStep.value,
    tickAnchor: props.range.start,
    formatTime: props.formatTime,
    rowHeading: rest.rowHeading ?? messages.value.rows,
    loadRows: includeLoad && loadHistogram.value ? props.loadRows : undefined,
    loadSegments: includeLoad && loadHistogram.value ? props.loadSegments : undefined,
    loadRowHeight: props.loadRowHeight,
    highlightedDependencyIds: props.highlightedDependencyIds,
    nonWorkingPeriods: props.nonWorkingPeriods,
    statusDate: includeStatusDate ? props.statusDate : undefined,
    statusDateLabel: messages.value.statusDate,
    showProgressLine: props.showProgressLine,
    direction: rtl.value ? 'rtl' : 'ltr',
    theme: root.value ? readExportTheme(root.value, theme) : theme,
    fontFamily: root.value ? exportFont(root.value) : undefined,
  })
}
/** Rasterize `exportSvg(options)` to a PNG blob in the browser. */
async function exportPng(options: GanttPngExportOptions = {}) {
  const { scale = 1, ...rest } = options
  return rasterizeSvg(exportSvg(rest), scale)
}
defineExpose({ scrollToTime, scrollToRow, cancelEdit, exportSvg, exportPng, fitToBars })

// Switching direction mirrors every coordinate: cancel gestures and keep the same time at the inline-start edge.
watch(() => props.dir, detectDirection, { flush: 'post' })
watch(rtl, async () => {
  cancelEdit()
  const start = viewport.value.left
  await nextTick()
  if (scroller.value) setScrollStart(scroller.value, start)
  syncViewport()
})

onMounted(() => {
  mounted = true
  detectDirection()
  syncClock()
  if (!scroller.value) return
  syncViewport()
  observer = new ResizeObserver(syncViewport)
  observer.observe(scroller.value)
  const corner = scroller.value.querySelector('.vw-gantt-corner')
  if (corner) observer.observe(corner)
  scroller.value.addEventListener('touchmove', holdPinch, { passive: false })
})
onBeforeUnmount(() => scroller.value?.removeEventListener('touchmove', holdPinch))
onUnmounted(() => {
  mounted = false
  cancelEdit()
  hideTooltip()
  observer?.disconnect()
  if (nowTimer !== undefined) clearInterval(nowTimer)
})
</script>

<template>
  <div ref="root" class="vw-gantt" :class="{ 'vw-rtl': rtl }" :dir="dir === 'rtl' ? 'rtl' : undefined">
    <div class="vw-gantt-toolbar">
      <slot name="legend" />
      <div v-if="zoomPresets?.length" class="vw-gantt-presets" role="group" :aria-label="messages.zoomPresets">
        <button v-for="preset in zoomPresets" :key="preset.id" type="button" :aria-pressed="activePreset?.id === preset.id"
          @click="choosePreset(preset.id)">{{ preset.label }}</button>
      </div>
      <div v-if="showControls !== false" class="vw-gantt-zoom" role="group" :aria-label="messages.zoom">
        <button type="button" :aria-label="messages.zoomOut" :disabled="zoom <= minZoom" @click="setZoom(1 / 1.35)">−</button>
        <output>{{ Math.round(zoom * 100) }}%</output>
        <button type="button" :aria-label="messages.zoomIn" :disabled="zoom >= maxZoom" @click="setZoom(1.35)">＋</button>
      </div>
    </div>
    <div
      ref="scroller" class="vw-gantt-scroll" :class="{ 'vw-pinch-zoom': pinchZoom }" :style="{ height: typeof height === 'number' ? height + 'px' : height }" role="region" :aria-label="messages.region" tabindex="0"
      @keydown.esc="cancelEdit" @scroll.passive="syncViewport" @pointerdown="pressScroller" @contextmenu="onContextMenu"
      @pointermove="moveTouch($event); moveEdit($event); moveLink($event); moveProgress($event); moveCreate($event); moveRowDrag($event)"
      @pointerup="endTouch($event); finishEdit($event); finishLink($event); finishProgress($event); finishCreate($event); finishRowDrag($event)"
      @pointercancel="endTouch($event); finishEdit($event); finishLink($event); finishProgress($event); finishCreate($event); finishRowDrag($event)"
      @lostpointercapture="finishEdit($event); finishLink($event); finishProgress($event); finishCreate($event); finishRowDrag($event)"
    >
      <div v-if="!validationError" ref="canvas" class="vw-gantt-canvas" :style="{
        width: `calc(var(--vw-label-area-width) + ${axis.width}px)`,
        height: `${headerHeight + bodyHeight + loadHeight}px`,
        '--vw-label-area-width': `calc(var(--vw-row-label-width) + ${columnWidth + columnResizeDelta}px)`,
        '--vw-header-height': `${headerHeight}px`,
        '--vw-axis-width': `${axis.width}px`,
        '--vw-grid-step': `${gridStep}px`,
        ...labelWidthStyle,
      }">
        <div class="vw-gantt-head">
          <div class="vw-gantt-corner" :class="{ 'vw-column-group': columns?.length }">
            <div class="vw-name-column"><slot name="row-heading">{{ messages.rows }}</slot></div>
            <!-- Column headers and, with columnsResizable, their resize separators share one list so that the default markup stays unchanged. -->
            <div v-for="cell in headerCells" :key="cell.key" :class="cell.className" :style="cell.style" v-bind="cell.attrs" v-on="cell.on">{{ cell.text }}</div>
          </div>
          <div class="vw-gantt-time-head" :style="{ top: (headerHeight - 40) + 'px' }">
            <span v-for="line in tickXs" :key="'line-' + line.tick" class="vw-gantt-tick-line" :style="{ [inlineSide]: `${line.x}px` }" aria-hidden="true"></span>
            <span v-for="{ tick, x } in tickXs" :key="tick" class="vw-gantt-tick" :class="{ end: tick === range.end }" :style="{ [inlineSide]: `${x}px` }"><slot name="tick" :time="tick" :label="formatTime(tick)">{{ formatTime(tick) }}</slot></span>
          </div>
          <div v-for="(level, index) in shownBands" :key="index" class="vw-gantt-band-level"
            :style="{ top: (index * bandHeight) + 'px', height: bandHeight + 'px' }">
            <div v-for="band in level" :key="band.start" class="vw-gantt-band"
              :style="{ [inlineSide]: band.x + 'px', width: band.width + 'px' }">{{ band.label }}</div>
          </div>
        </div>
        <div v-if="shownNonWorking.length" class="vw-gantt-non-working-layer" aria-hidden="true">
          <span v-for="band in shownNonWorking" :key="band.key" class="vw-gantt-non-working"
            :style="{ [inlineSide]: band.left + 'px', width: band.width + 'px' }"></span>
        </div>
        <div class="vw-gantt-grid" aria-hidden="true">
          <span v-for="line in tickXs" :key="line.tick" class="vw-gantt-grid-line" :style="{ [inlineSide]: `${line.x}px` }"></span>
        </div>
        <div v-for="item in markerEntries" :key="item.key" class="vw-gantt-marker" :class="item.className"
          :role="item.role" :aria-label="item.name" :title="item.name"
          :style="{ [inlineSide]: `calc(var(--vw-label-area-width) + ${axis.toX(item.time)}px)` }">
          <span>{{ item.label }}</span>
        </div>
        <div v-if="nowTime !== undefined" class="vw-gantt-marker vw-gantt-now" :title="`${messages.now} ${formatTime(nowTime)}`"
          :style="{ [inlineSide]: `calc(var(--vw-label-area-width) + ${axis.toX(nowTime)}px)` }">
          <span>{{ messages.now }}</span>
        </div>
        <div v-for="row in shownRows" :key="row.row.id" class="vw-gantt-row"
          :style="{ top: `${headerHeight + row.index * rowHeight}px`, height: `${rowHeight}px` }"
          @pointerdown="pressRow($event, row.row)"
        >
          <div class="vw-gantt-row-label" :class="{ 'vw-column-group': columns?.length }"
          >
            <div class="vw-name-column" :class="{ 'vw-tree-row': row.hasChildren || row.depth > 0, 'vw-creatable': row.creatable, 'vw-reorderable': row.reorderable }"
              :style="{ '--vw-row-depth': Math.min(row.depth, 5) }">
            <button v-if="row.hasChildren && !row.creatable && !row.reorderable" type="button" class="vw-row-toggle"
              :aria-expanded="!collapsed.has(row.row.id)"
              :aria-label="`${collapsed.has(row.row.id) ? messages.expandRow : messages.collapseRow} ${row.row.label}`"
              @click="toggleRow(row.row.id)">{{ collapsed.has(row.row.id) ? (rtl ? '◂' : '▸') : '▾' }}</button>
            <template v-else-if="row.creatable && !row.reorderable">
              <button v-if="row.hasChildren" type="button" class="vw-row-toggle"
                :aria-expanded="!collapsed.has(row.row.id)"
                :aria-label="`${collapsed.has(row.row.id) ? messages.expandRow : messages.collapseRow} ${row.row.label}`"
                @click="toggleRow(row.row.id)">{{ collapsed.has(row.row.id) ? (rtl ? '◂' : '▸') : '▾' }}</button>
              <button type="button" class="vw-gantt-create-button" :aria-label="`${messages.createIn} ${row.row.label}`"
                @click="createFromButton($event, row.row)"><span aria-hidden="true">+</span></button>
            </template>
            <template v-else-if="row.reorderable">
              <button type="button" class="vw-row-move-handle" :data-vw-row-handle="row.row.id"
                :aria-label="`${messages.moveRow} ${row.row.label}`" :aria-describedby="marker + '-reorder-hint'"
                @pointerdown="startRowDrag($event, row.row)" @keydown="rowHandleKeys($event, row.row)"><span aria-hidden="true">⋮⋮</span></button>
              <button v-if="row.hasChildren" type="button" class="vw-row-toggle"
                :aria-expanded="!collapsed.has(row.row.id)"
                :aria-label="`${collapsed.has(row.row.id) ? messages.expandRow : messages.collapseRow} ${row.row.label}`"
                @click="toggleRow(row.row.id)">{{ collapsed.has(row.row.id) ? (rtl ? '◂' : '▸') : '▾' }}</button>
              <button v-if="row.creatable" type="button" class="vw-gantt-create-button" :aria-label="`${messages.createIn} ${row.row.label}`"
                @click="createFromButton($event, row.row)"><span aria-hidden="true">+</span></button>
            </template>
            <div class="vw-row-content">
              <slot name="row" :row="row.row" :index="row.index" :depth="row.depth" :expanded="!collapsed.has(row.row.id)">
                <strong>{{ row.row.label }}</strong>
                <small v-if="row.row.detail">{{ row.row.detail }}</small>
              </slot>
            </div>
            </div>
            <div v-for="column in columns" :key="column.id" class="vw-extra-column" :style="{ width: shownColumnWidth(column) + 'px' }">
              <slot name="cell" :row="row.row" :column="column" :value="cellValue(row.row, column)" :summary="summaries?.get(row.row.id)">
                <input v-if="canEditCell(row.row, column)" class="vw-cell-input" type="text"
                  :aria-label="row.row.label + ' · ' + column.label" :value="cellValue(row.row, column)"
                  @change="commitCell($event, row.row, column)" @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
                  @keydown.esc.stop.prevent="cancelCell($event, row.row, column)">
                <span v-else :title="String(cellValue(row.row, column))">{{ cellValue(row.row, column) }}</span>
              </slot>
            </div>
          </div>
          <div v-if="row.summary && intersectsWindow(row.summary, timeWindow)" class="vw-gantt-summary"
            :style="summaryStyle(row.summary)"
            :title="`${row.row.label} · ${row.summary.count} · ${formatTime(row.summary.start)}–${formatTime(row.summary.end)}`">
            <span v-if="row.summary.progress !== undefined" :style="{ width: (row.summary.progress * 100) + '%' }"></span>
          </div>
          <div v-for="bar in row.baselines" :key="bar.id" class="vw-gantt-baseline"
            :style="baselineStyle(bar)" :title="`${messages.baseline} · ${bar.label} ${formatTime(bar.baseline!.start)}–${formatTime(bar.baseline!.end)}`"></div>
          <div v-for="item in row.floats" :key="item.bar.id + ':float'" class="vw-gantt-float" :style="item.style" aria-hidden="true"></div>
          <button
            v-for="bar in row.bars" :key="bar.id" type="button" class="vw-gantt-bar"
            :class="[`vw-tone-${bar.tone ?? 'blue'}`, bar.appearance === 'outline' ? 'outline' : 'solid', {
              selected: selectedIds?.has(bar.id), editable: editable(bar), dragging: previews?.has(bar.id), milestone: bar.start === bar.end,
              'vw-critical': bar.critical, 'vw-late': row.overlays.get(bar.id)?.late, 'vw-segmented': row.overlays.get(bar.id)?.segments,
            }]"
            :style="barStyle(bar)" :data-vw-bar="bar.id"
            :title="barTitle(bar, row.overlays.get(bar.id))"
            :aria-label="`${bar.label} ${formatTime(rangeOf(bar).start)}–${formatTime(rangeOf(bar).end)}`"
            :aria-pressed="Boolean(selectedIds?.has(bar.id))"
            @keydown="editWithKeys($event, bar)" @focus="onBarFocus($event, bar)" @blur="onBarBlur(bar.id)"
            :aria-describedby="barDescribedBy(bar, row.overlays.get(bar.id))"
            @pointerdown="pressBar(bar); startEdit($event, bar)" @click="clickBar(bar, $event)"
            @pointerenter="hoverBar(bar)" @pointerleave="leaveBar(bar)"
          >
            <template v-if="row.overlays.get(bar.id)?.segments">
              <span v-for="gap in row.overlays.get(bar.id)!.segments!.gaps" :key="'gap:' + gap.key" class="vw-gantt-segment-gap" :style="gap.style" aria-hidden="true"></span>
              <span v-for="piece in row.overlays.get(bar.id)!.segments!.pieces" :key="piece.key" class="vw-gantt-segment" :style="piece.style" aria-hidden="true">
                <span v-if="shownProgress(bar) !== undefined" class="vw-bar-progress" :style="{ width: (piece.filled * 100) + '%' }"></span>
              </span>
            </template>
            <span v-else-if="shownProgress(bar) !== undefined" class="vw-bar-progress" :style="{ width: (shownProgress(bar)! * 100) + '%' }" aria-hidden="true"></span>
            <slot name="bar" :bar="bar" :range="rangeOf(bar)" :selected="Boolean(selectedIds?.has(bar.id))">
              <span class="vw-bar-text">{{ bar.label }}</span>
            </slot>
            <span v-if="editable(bar) && bar.end - bar.start >= minimum" class="vw-bar-handle first" data-edit-mode="start" aria-hidden="true"></span>
            <span v-if="editable(bar) && bar.end - bar.start >= minimum" class="vw-bar-handle last" data-edit-mode="end" aria-hidden="true"></span>
            <span v-if="row.overlays.get(bar.id)?.description" :id="barDescriptionId(bar)" hidden>{{ row.overlays.get(bar.id)!.description }}</span>
          </button>
          <div v-for="item in row.deadlines" :key="item.bar.id + ':deadline'" class="vw-gantt-deadline" :class="{ 'vw-late': item.late }"
            :style="item.style" aria-hidden="true"></div>
          <template v-if="(linkHandlesVisible || progressHandlesVisible) && !row.progress">
            <template v-for="bar in row.bars" :key="bar.id + ':links'">
              <button v-for="end in barHandles(bar)" :key="end" type="button" v-bind="handleAttrs(bar, end)"
                @pointerdown="pressHandle($event, bar, end)" @click="clickHandle($event, bar, end)" @keydown="handleKeys($event, bar, end)"></button>
            </template>
          </template>
          <template v-else-if="row.progress">
            <template v-if="linkHandlesVisible || progressHandlesVisible">
              <template v-for="bar in row.bars" :key="bar.id + ':links'">
                <button v-for="end in barHandles(bar)" :key="end" type="button" v-bind="handleAttrs(bar, end)"
                  @pointerdown="pressHandle($event, bar, end)" @click="clickHandle($event, bar, end)" @keydown="handleKeys($event, bar, end)"></button>
              </template>
            </template>
            <svg class="vw-gantt-progress-line" aria-hidden="true" :width="xWindow.right - xWindow.left" :height="rowHeight"
              :style="{ [inlineSide]: `calc(var(--vw-label-area-width) + ${xWindow.left}px)` }"
              :viewBox="`${xWindow.left} 0 ${xWindow.right - xWindow.left} ${rowHeight}`"><polyline :points="row.progress.points" /></svg>
          </template>
        </div>
        <svg v-if="shownLines.length" class="vw-gantt-links" aria-hidden="true"
          :width="xWindow.right - xWindow.left" :height="(rowWindow.afterLast - rowWindow.first) * rowHeight"
          :style="{
            [inlineSide]: `calc(var(--vw-label-area-width) + ${xWindow.left}px)`,
            top: `${headerHeight + rowWindow.first * rowHeight}px`,
          }"
          :viewBox="`${xWindow.left} ${rowWindow.first * rowHeight} ${xWindow.right - xWindow.left} ${(rowWindow.afterLast - rowWindow.first) * rowHeight}`"
        >
          <defs>
            <marker :id="marker" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M 0 0 L 6 3 L 0 6 z" fill="context-stroke" />
            </marker>
          </defs>
          <path v-for="line in shownLines" :key="line.id"
            :class="{ related: selectedIds?.has(line.from) || selectedIds?.has(line.to), highlighted: highlightedDependencyIds?.has(line.id), selected: dependencyTargets && activeDependencyId === line.id }"
            :d="line.path" :marker-end="`url(#${marker})`"
          />
        </svg>
        <svg v-if="dependencyTargets && shownLines.length" class="vw-gantt-link-hits"
          :width="xWindow.right - xWindow.left" :height="(rowWindow.afterLast - rowWindow.first) * rowHeight"
          :style="{
            [inlineSide]: `calc(var(--vw-label-area-width) + ${xWindow.left}px)`,
            top: `${headerHeight + rowWindow.first * rowHeight}px`,
          }"
          :viewBox="`${xWindow.left} ${rowWindow.first * rowHeight} ${xWindow.right - xWindow.left} ${(rowWindow.afterLast - rowWindow.first) * rowHeight}`"
        >
          <path v-for="line in shownLines" :key="line.id" class="vw-dependency-hit" :class="{ active: activeDependencyId === line.id }"
            :d="line.path" role="button" tabindex="0" :data-vw-dependency="contextMenu ? line.id : undefined"
            :aria-label="`${messages.selectDependency} ${dependencyName(line.dependency)}`"
            :aria-pressed="activeDependencyId === line.id"
            @click="selectDependency(line.id)" @keydown="dependencyKeys($event, line.id)" />
        </svg>
        <button v-for="item in reconnectHandles" :key="item.end" type="button" class="vw-gantt-reconnect-handle"
          :style="{ [inlineSide]: `calc(var(--vw-label-area-width) + ${item.x - 6}px)`, top: `${headerHeight + item.y - 6}px` }"
          :aria-label="item.label" :aria-pressed="Boolean(linkDraft?.dependency && linkDraft.role === item.end)"
          :data-vw-dependency="contextMenu ? item.dependency.id : undefined"
          @pointerdown="reconnectDependency(item.dependency, item.end, $event)"
          @click.stop="clickReconnect(item.dependency, item.end)"
          @keydown.enter.stop.prevent="reconnectDependency(item.dependency, item.end)"
          @keydown.space.stop.prevent="reconnectDependency(item.dependency, item.end)"></button>
        <svg v-if="linkPreviewPath" class="vw-gantt-link-preview" width="1" height="1" overflow="visible" aria-hidden="true"
          :style="{ top: `${headerHeight}px` }">
          <path :d="linkPreviewPath" />
        </svg>
        <div v-else-if="createBox" class="vw-gantt-create-preview" :style="createBox" aria-hidden="true"></div>
        <template v-else-if="cascadeBoxes.length">
          <div v-for="item in cascadeBoxes" :key="item.id" class="vw-gantt-cascade-preview" :style="item.style" aria-hidden="true"></div>
        </template>
        <div v-else-if="rowDropStyle" class="vw-gantt-row-drop" :style="rowDropStyle" aria-hidden="true"></div>
        <div v-for="item in shownLoadRows" :key="item.row.id" class="vw-gantt-load-row" role="group"
          :aria-label="`${messages.loadRegion} ${item.row.label}`"
          :style="{ top: `${headerHeight + bodyHeight + item.index * loadRowHeight}px`, height: `${loadRowHeight}px` }">
          <span v-for="band in shownNonWorking" :key="band.key" class="vw-gantt-non-working" aria-hidden="true"
            :style="{ [inlineSide]: `calc(var(--vw-label-area-width) + ${band.left}px)`, width: band.width + 'px' }"></span>
          <div class="vw-gantt-row-label">
            <slot name="load-row" :row="item.row" :peak="item.peak">
              <strong>{{ item.row.label }}</strong>
              <small v-if="item.row.detail">{{ item.row.detail }}</small>
            </slot>
          </div>
          <div v-for="segment in item.segments" :key="segment.key" class="vw-gantt-load-segment"
            :class="{ overloaded: segment.overload > 0, idle: segment.segment.load === 0 }" role="img"
            :aria-label="segment.label" :title="segment.label"
            :style="{ [inlineSide]: `calc(var(--vw-label-area-width) + ${segment.left}px)`, width: `${segment.width}px` }">
            <slot name="load-segment" :segment="segment.segment" :row="item.row" :peak="item.peak" :overload="segment.overload">
              <span class="vw-load-fill" :style="{ height: segment.fill + '%' }"></span>
              <span v-if="segment.overload > 0" class="vw-load-over" :style="{ bottom: segment.capacity + '%', height: segment.over + '%' }"></span>
              <span class="vw-load-capacity" :style="{ bottom: segment.capacity + '%' }"></span>
            </slot>
          </div>
        </div>
      </div>
    </div>
    <div v-if="validationError || !rows.length" class="vw-gantt-empty"><slot name="empty">{{ messages.empty }}</slot></div>
    <template v-else-if="deletable || tooltipBar">
      <span v-if="deletable" :id="marker + '-delete-hint'" class="vw-sr-only">{{ messages.deleteHint }}</span>
      <div v-if="tooltipBar" :id="tooltipId" ref="tooltipEl" class="vw-gantt-tooltip" role="tooltip"
        :style="tooltipPlace ?? { left: '0px', top: '0px', visibility: 'hidden' }"
        @pointerenter="enterTooltip" @pointerleave="leaveTooltip">
        <slot name="tooltip" :bar="tooltipBar" :range="rangeOf(tooltipBar)" :selected="Boolean(selectedIds?.has(tooltipBar.id))" />
      </div>
    </template>
    <span :id="marker + '-hint'" class="vw-sr-only">{{ messages.editHint }}</span>
    <span v-if="rowDraggable && !rowHandlesVisible" :id="marker + '-row-hint'" class="vw-sr-only">{{ messages.moveRowHint }}</span>
    <template v-else-if="rowHandlesVisible">
      <span v-if="rowDraggable" :id="marker + '-row-hint'" class="vw-sr-only">{{ messages.moveRowHint }}</span>
      <span :id="marker + '-reorder-hint'" class="vw-sr-only">{{ messages.moveRowKeysHint }}</span>
    </template>
    <span class="vw-sr-only" aria-live="polite">{{ notice }}</span>
  </div>
</template>
