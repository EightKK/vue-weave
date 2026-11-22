<script setup lang="ts" generic="R extends TimelineRow = TimelineRow, B extends TimelineBar = TimelineBar">
import { computed, h, nextTick, onBeforeUnmount, onMounted, onScopeDispose, onUnmounted, ref, shallowRef, useId, watch, type Slots } from 'vue'
import type { TimelineBar, TimelineDependency, TimelineRow, TimelineEdit, GanttLabels, EditValidator, TimelineBand, TimelineMarker, TimelineColumn, TimelineCellEdit, TimelineSummary } from '../core/types.js'
import type {
  BatchEditValidator, TimelineBarEnd, TimelineConnection, TimelineConnectionValidator, TimelineLoadRow, TimelineLoadSegment,
  TimelineReconnect, TimelineZoomPreset, TimelineZoomState,
} from '../core/types.js'
import {
  createTimeScale, createTimelineRowTree, dependencyPath, dependencyTimes, editTimeRange, intersectsWindow,
  summarizeTimelineRows, timeTicks, timelineLabelColumnId, visibleRows, type DependencyPathStyle, type EditMode, type TimeRange, type TimeScale,
} from '../core/timeline.js'
import { dependencyEndsForType, dependencyTypeForEnds, moveTimeRanges, type ResourceLoadHistogram } from '../core/timeline.js'
import { formatDependencyLag } from '../core/timeline.js'
import type { ChartDirection, GanttExportOptions, GanttPngExportOptions, TimelineMarkerRange } from '../core/types.js'
import type {
  BarsDeleteValidator, ProgressEditValidator, TimelineContextMenu, TimelineContextTarget, TimelineFitOptions, TimelineProgressEdit,
} from '../core/types.js'
import type { CreateValidator, TimelineCascade, TimelineCreate } from '../core/types.js'
import type { RowMoveValidator, TimelineRowMove } from '../core/types.js'
import type { ColumnResizeValidator, TimelineColumnResize } from '../core/types.js'
import { renderTimelineSvg } from '../core/exportSvg.js'
import { tickLabelsWithRoom } from '../core/workingTimeScale.js'
import { progressAt, progressTime, segmentPieces, snapProgress } from '../core/barSegments.js'
import { lagLabelPoint, progressLinePoints, progressLineTime } from '../core/barSegments.js'
import { baselineLayout, baselineSelection, baselineStrips, type BaselineTextOptions } from '../core/barSegments.js'
import { timelineBaselineId } from '../core/timeline.js'
import { timelineConstraintKinds, timelineConstraintViolated } from '../core/timeline.js'
import type { ConstraintEditValidator, TimelineConstraintEdit, TimelineConstraintKind } from '../core/types.js'
import type { TimelineEditCancel, TimelineEditCancelReason, TimelineSelectDetail } from '../core/types.js'
import type { LoadViewTarget, RevealOptions, RevealResult, ViewTarget, ViewTargetEvent, ViewTargetSource } from '../core/viewBindings.js'
import { resolveLoadTargets } from '../core/viewBindings.js'
import { fieldValuesEqual, formatFieldValue, parseFieldValue, validateFieldValue } from '../core/fieldEditing.js'
import type { FieldCheck, FieldValue, TimelineFieldEdit, TimelineFieldSpec } from '../core/fieldEditing.js'
import { exportFont, rasterizeSvg, readExportTheme } from './exportImage.js'
import type { TimelineDrop } from './types.js'
import type { TimelineVisibleWindow } from '../core/windowedData.js'
import {
  canvasInset, clipSpan, drawableWindow, inRangeAndWindow, inRowWindow, inTimeWindow, intervalBox as axisBox, linkHandleOffset,
  rowScrollTop, sameItems, sameRange, type RowWindow,
} from './ganttChart/geometry.js'
import { validateGanttProps } from './ganttChart/validateProps.js'
import { useBarTooltip } from './ganttChart/useBarTooltip.js'
import {
  cascadeChanges, cascadeChangeKey, clampWidth, columnWidthForKey, constraintForKey, createSpan, fitInBounds, freeLane, progressForKey,
  snapToGrid, stepConstraintTime, type CascadeResult,
} from './ganttChart/editing.js'
import {
  rowChildren as rowChildList, rowDropAt, rowMoveForKey, rowPosition as rowPositionIn, type RowDrop,
} from './ganttChart/rowMoves.js'

import { sheetKey, useSheet } from './ganttChart/sheet.js'
import { nextTimelineSort, type TimelineViewFilter, type TimelineViewSort } from '../core/timelineView.js'
import { filterActive, headerColumnIds, sameOption, withColumnFilter } from './ganttChart/headerControls.js'
import type { TimelineSheetEdit } from '../core/types.js'

const props = withDefaults(defineProps<{
  /** Rows of the chart, in display order. Each has an ID, label, optional detail, optional `parentId` for hierarchy, and opaque data. Required. */
  rows: readonly R[]
  /** Bars drawn on the rows. Each has an ID, `rowId`, label and numeric half-open `[start, end)` interval in the units of `range`; a zero-duration bar is a milestone. Required. */
  bars: readonly B[]
  /** Links between bars by ID, with an optional FS, SS, FF or SF type. They are drawn only; scheduling constraints are enforced by the application. Default: `[]`. */
  dependencies?: readonly TimelineDependency[]
  /** IDs of dependencies drawn with the highlight style. */
  highlightedDependencyIds?: ReadonlySet<string>
  /** Visible axis bounds as a finite `{ start, end }` with `start < end`, in the caller's time units. Required. */
  range: TimeRange
  /** Base linear time scale in pixels per time unit. Default: 80 pixels per hour, in milliseconds. */
  pixelsPerUnit?: number
  /** Candidate tick intervals in time units, positive and ascending. The first step that keeps tick labels at least 76 px apart is used; where no step does (a squeezed part of a non-linear `scale`), labels without 76 px before the next tick are left out. Default: 30 minutes, 1, 2, 4 and 24 hours, in milliseconds. */
  tickSteps?: readonly number[]
  /** Step in time units that edit displacements snap to; also the default minimum duration. Default: 900000 (15 minutes in milliseconds). */
  snap?: number
  /** Formats a time for tick labels and accessible bar labels. Default: UTC `HH:mm`. */
  formatTime?: (time: number) => string
  /** Formats a non-zero dependency `lag`, in the units of `range`, for its connector label and description. Default: `formatDependencyLag`, signed hours of milliseconds such as `+2 h`. */
  formatLag?: (lag: number) => string
  /** Controlled set of selected bar IDs, highlighted in the chart. With `multiSelect`, clicks propose changes through `update:selectedIds`. */
  selectedIds?: ReadonlySet<string>
  /** Controlled set of collapsed row IDs. When omitted, the component keeps the collapsed set itself; changes are reported through `update:collapsedIds`. */
  collapsedIds?: ReadonlySet<string>
  /** Header levels drawn above the ticks. Each level is an ordered list of non-overlapping `{ start, end, label }` intervals. */
  headerBands?: readonly (readonly TimelineBand[])[]
  /** Vertical markers with a unique ID, finite time and label, drawn inside the visible time window. */
  markers?: readonly TimelineMarker[]
  /**
   * Highlighted half-open ranges `[start, end)`, each with a unique ID, label, optional `tone` and optional `rowIds`: a
   * shaded band across the body (or across those rows only) with its label at the bottom of the header, drawn inside
   * the visible time window. `end` must be greater than `start`. Opt-in.
   */
  markerRanges?: readonly TimelineMarkerRange[]
  /** Extra sticky columns next to the row label, each with an ID, label, pixel width, `value(row, summary)` and optional `editable`. */
  columns?: readonly TimelineColumn<R>[]
  /**
   * Spreadsheet mode for the built-in extra column cells: rectangular selection, copy, cut and paste as tab-separated
   * text, Delete to clear, fill down (Ctrl/Cmd+D or the fill handle) and typing to edit. Each operation is proposed as
   * one `sheet-edit`. Opt-in. Default: false.
   */
  spreadsheet?: boolean
  /**
   * Synchronous check of a whole `sheet-edit` batch after its cells passed `validateFieldEdit` and `validateCellEdit`.
   * Return `true` or nothing to accept, `false` or a reason string to reject the whole batch.
   */
  validateSheetEdit?: (change: TimelineSheetEdit<R>) => boolean | string | void
  /** Draws an aggregated interval on parent rows that have no bar of their own. Opt-in. Default: false. */
  showSummaries?: boolean
  /**
   * Lets a dependency end name a summary row (a row with child rows) when no bar has that ID. The end joins the start or
   * finish edge of the row's rollup bar, so it is drawn with `showSummaries` when the row has a rollup; otherwise the
   * dependency is hidden. With `connectable`, rollup bars also get link handles. Opt-in. Default: false.
   */
  summaryDependencies?: boolean
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
  /**
   * Zooms the time axis between 65% and 300% with Ctrl+wheel or Meta+wheel (and desktop trackpad pinches, which arrive
   * as Ctrl+wheel), keeping the time under the pointer in place. A plain wheel still scrolls. Opt-in. Default: false.
   */
  wheelZoom?: boolean
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
  /** Shape of the dependency connectors: `orthogonal` (default), `rounded` (rounded corners) or `curve`. Opt-in. */
  dependencyStyle?: DependencyPathStyle
  /** Keeps each `headerBands` label inside the visible part of its band while the timeline scrolls. Opt-in. Default: false. */
  stickyBandLabels?: boolean
  /** Reports context menu requests through `context-menu` instead of opening the browser menu. The component renders no menu. Opt-in. Default: false. */
  contextMenu?: boolean
  /** Enables proposing new bars by dragging or clicking an empty part of a row, or via its add button. Pass `true` for every row or a predicate to choose rows. Default: false. */
  creatable?: boolean | ((row: R) => boolean)
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
  /**
   * Shows a sort button in the header of these columns: `true` for the row label column and every extra column, or a
   * list of column IDs (`timelineLabelColumnId` for the row label column). Activating it proposes the next sort
   * (ascending, descending, none) through `update:sort`; the chart never reorders rows itself. An unknown ID is reported
   * through `validation-error`. Opt-in. Default: false.
   */
  sortableColumns?: boolean | readonly string[]
  /**
   * The applied sort, shown on the sort button of each rule's column (`ruleId` is the column ID) by its glyph and name.
   * Supports `v-model:sort`, for example with `useTimelineView`'s `state.sort` and `setSort`. Default: none.
   */
  sort?: readonly TimelineViewSort[]
  /**
   * Shows a filter button in the header of these columns (`true`: the row label column and every extra column). It
   * opens a small dialog with a text filter, plus a value list for a `select` field, and proposes the filters through
   * `update:filters`; the chart never filters rows itself. An unknown ID is reported through `validation-error`.
   * Opt-in. Default: false.
   */
  filterableColumns?: boolean | readonly string[]
  /** The applied column filters, shown on the filter buttons. Supports `v-model:filters`. Default: none. */
  filters?: readonly TimelineViewFilter[]
  /** Width in pixels of the row label column; finite and positive. Default: the theme width. */
  labelWidth?: number
  /** Smallest width in pixels that a column resize may propose. Default: 48. */
  minColumnWidth?: number
  /** Largest width in pixels that a column resize may propose; at least `minColumnWidth`. Default: 800. */
  maxColumnWidth?: number
  /** Synchronous check of a column resize proposal. Return `true` or nothing to accept, `false` or a reason string to reject. */
  validateColumnResize?: ColumnResizeValidator
  /**
   * Baseline sets drawn below the bars, in slot order: at most 3 unique IDs from `TimelineBar.baselines`, and
   * `timelineBaselineId` for `TimelineBar.baseline`. `[]` draws none. Default: the first 3 of `timelineBaselineIds(bars)`.
   */
  baselineIds?: readonly string[]
  /** Label of a baseline set in titles and descriptions. Default: `labels.baseline` for `timelineBaselineId`, otherwise the set ID. */
  baselineLabel?: (id: string) => string
  /** Formats a baseline variance (`baselineVariance`) in titles and descriptions. Default: `formatDependencyLag`, signed hours such as `+2 h`. */
  formatVariance?: (delta: number) => string
  /** Shows a slider handle at each `constraints` time of an editable bar, moved by drag or keys and proposed through `constraint-edit`. Opt-in. Default: false. */
  constraintsEditable?: boolean
  /** Synchronous check of a constraint edit proposal. Return `true` or nothing to accept, `false` or a reason string to reject. */
  validateConstraintEdit?: ConstraintEditValidator
  /**
   * IDs of bars drawn with the display-only highlight style (`vw-is-highlighted`), for example items linked from another
   * view. Unlike `selectedIds`, they are never deleted or moved with the selection, do not mark dependencies and do not
   * cancel gestures when they change. Highlighted bars outside the visible window are not kept rendered.
   */
  highlightedBarIds?: ReadonlySet<string>
  /**
   * Makes load segments focusable buttons that report `target-enter`, `target-leave` and `target-activate` with a load
   * target. Without it, load segments keep their image role and accessible names. Opt-in. Default: false.
   */
  loadSelectable?: boolean
  /**
   * Load ranges drawn with the display-only highlight style (`vw-is-highlighted`), for example load linked from another
   * view. A segment is highlighted when it belongs to the target's resource and overlaps its half-open range, so the
   * targets stay valid when the load is recalculated and its segment boundaries move. Works with or without
   * `loadSelectable` and never changes accessible names. Default: none.
   */
  highlightedLoadTargets?: readonly LoadViewTarget[]
  /**
   * Load ranges drawn as selected (`vw-is-selected`), matched like `highlightedLoadTargets`. With `loadSelectable`, the
   * matching segment buttons also get `aria-pressed="true"`. The chart never changes this set itself. Default: none.
   */
  selectedLoadTargets?: readonly LoadViewTarget[]
  /** Accepts HTML drag and drop on the chart and emits `bar-drop` with the row and time under the drop point. Opt-in. Default: false. */
  droppable?: boolean
  /**
   * Milliseconds that `visible-window-change` waits for scrolling, resizing or zooming to settle before it reports the
   * window; during a long scroll it still reports at most about every four delays. Default: 100.
   */
  visibleWindowDelay?: number
  /**
   * Synchronous check of a typed field edit proposal from a column with `field`. Return `true` or nothing to accept,
   * `false` or a reason string to reject.
   */
  validateFieldEdit?: (change: TimelineFieldEdit<R>) => boolean | string | void
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
  formatLag: formatDependencyLag,
  formatVariance: formatDependencyLag,
  loadRowHeight: 44,
})
const emit = defineEmits<{
  /**
   * A bar was activated by click or Enter/Space; carries its ID and whether the click ended a drag of that bar
   * (`detail.dragged`, the release after a move or resize proposal). Fires once per click, on release.
   */
  select: [id: string, detail: TimelineSelectDetail]
  /** Invalid input data or props were detected; carries the error. The chart then renders its empty state. */
  'validation-error': [error: Error]
  /** Proposal to move or resize one bar. The parent applies it by updating the bar. */
  edit: [change: TimelineEdit]
  /** The set of collapsed row IDs changed; supports `v-model:collapsed-ids`. */
  'update:collapsedIds': [ids: Set<string>]
  /** Proposal of a whole spreadsheet operation (`spreadsheet`): paste, fill or clear, to be applied as one step. */
  'sheet-edit': [change: TimelineSheetEdit<R>]
  /**
   * A spreadsheet operation was rejected as a whole: by a read-only cell, text a field cannot read, a ragged or
   * oversized paste, or a validator. `change` is the batch when `validateSheetEdit` rejected it.
   */
  'sheet-edit-rejected': [reason: string, change?: TimelineSheetEdit<R>]
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
  /**
   * A header sort button (`sortableColumns`) proposes a new sort (`nextTimelineSort`): only that column's rule changes, and
   * the other rules are kept. Apply it to
   * the rows, for example with `useTimelineView`'s `setSort`, and pass it back as `sort`. Supports `v-model:sort`.
   */
  'update:sort': [sort: TimelineViewSort[]]
  /**
   * A header filter (`filterableColumns`) proposes the new list of column filters. Apply it to the rows, for example with
   * `useTimelineView`'s `setFilters`, and pass it back as `filters`. Supports `v-model:filters`.
   */
  'update:filters': [filters: TimelineViewFilter[]]
  /** Proposal to move or remove a bar constraint; carries the bar ID, kind, `before`, `after` and source. Apply it with `applyTimelineConstraintEdit`. */
  'constraint-edit': [change: TimelineConstraintEdit]
  /** A constraint edit was rejected by `validateConstraintEdit`; carries the proposal and the reason. */
  'constraint-edit-rejected': [change: TimelineConstraintEdit, reason: string]
  /** The pointer entered, or keyboard focus reached, a bar, dependency, row or (with `loadSelectable`) load segment. */
  'target-enter': [event: ViewTargetEvent]
  /** The pointer or keyboard focus left a target reported by `target-enter`. */
  'target-leave': [event: ViewTargetEvent]
  /** A bar, dependency, row heading or (with `loadSelectable`) load segment was activated by click, Enter or Space. */
  'target-activate': [event: ViewTargetEvent]
  /** Something was dropped on the chart; carries the snapped time, the row under the drop point and `dataTransfer`. Only with `droppable`. */
  'bar-drop': [event: TimelineDrop]
  /**
   * The rendered window changed: its half-open time window `[start, end)` and the rendered row IDs (after collapsing,
   * with overscan) plus the expanded parent rows, for loading only what is shown (`useWindowedData`). Emitted only after
   * mounting, once the window settles (`visibleWindowDelay`), and only when it differs from the last one reported:
   * scrolling, resizing, zooming, collapsing and new rows can each change it.
   */
  'visible-window-change': [window: TimelineVisibleWindow]
  /** Proposal to change a typed field of a column with `field`. Such columns never emit `cell-edit`. */
  'field-edit': [change: TimelineFieldEdit<R>]
  /** A field edit was rejected by `validateFieldEdit`; carries the proposal and the reason. */
  'field-edit-rejected': [change: TimelineFieldEdit<R>, reason: string]
  /** An in-flight edit was cancelled; carries the reason, the bars of the gesture and the cell of a cancelled `cell-editor`. */
  'edit-cancel': [event: TimelineEditCancel]
}>()

const slots = defineSlots<{
  legend(): unknown
  'row-heading'(): unknown
  row(props: { row: R; index: number; depth: number; expanded: boolean }): unknown
  cell(props: { row: R; column: TimelineColumn<R>; value: string | number; summary?: TimelineSummary }): unknown
  bar(props: { bar: B; range: TimeRange; selected: boolean }): unknown
  tick(props: { time: number; label: string }): unknown
  empty(): unknown
  'load-row'(props: { row: TimelineLoadRow; peak: number }): unknown
  'load-segment'(props: { segment: TimelineLoadSegment; row: TimelineLoadRow; peak: number; overload: number }): unknown
  tooltip(props: { bar: B; range: TimeRange; selected: boolean }): unknown
  /**
   * Editor of a cell of a column with `field`, shown after the cell is activated (click, Enter, Space or F2). `commit`
   * checks the value with the field spec and `validateFieldEdit`, emits `field-edit`, closes the editor and returns focus
   * to the cell; on failure the editor stays open and `validation` holds the error. `commitText` parses text with the
   * field first. `cancel` and Escape close it without a proposal. A `cell` slot takes precedence over this slot.
   */
  'cell-editor'(props: {
    row: R; column: TimelineColumn<R>; field: TimelineFieldSpec<R>; value: FieldValue; draft: FieldValue
    validation: FieldCheck; error: string | undefined; source: ViewTargetSource
    commit: (value: FieldValue, source?: ViewTargetSource) => FieldCheck
    commitText: (text: string, source?: ViewTargetSource) => FieldCheck
    cancel: () => void
  }): unknown
}>()
const messages = computed<GanttLabels>(() => ({
  region: 'Gantt chart', rows: 'Rows', empty: 'No rows to display',
  zoom: 'Timeline zoom', zoomIn: 'Zoom in', zoomOut: 'Zoom out',
  editHint: 'Arrow keys move. Shift resizes the end. Alt resizes the start. Escape cancels.',
  expandRow: 'Expand', collapseRow: 'Collapse', baseline: 'Baseline',
  baselineStart: 'start', baselineFinish: 'finish', baselineDuration: 'duration',
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
  resizeColumn: 'Resize column', columnResizeRejected: 'This column resize was rejected.', lag: 'Lag',
  sortBy: 'Sort by', sortedAscending: 'ascending', sortedDescending: 'descending', filterBy: 'Filter', filtered: 'filtered', filterContains: 'Contains', filterValues: 'Show values',
  clearFilter: 'Clear filter',
  startNoEarlierThan: 'Start no earlier than', startNoLaterThan: 'Start no later than', finishNoEarlierThan: 'Finish no earlier than',
  finishNoLaterThan: 'Finish no later than', fixedStart: 'Must start on', constraintViolated: 'violated',
  constraintHint: 'Arrow keys move the constraint by one snap step, Shift+arrow and Page keys by one tick step. Delete removes it. Escape cancels a drag.',
  constraintRejected: 'This constraint change was rejected.',
  sheetHint: 'Arrow keys move, Shift extends the selection. Enter, F2 or typing edits. Delete clears. Ctrl+D fills down.',
  sheetReadOnly: 'Read-only cell.',
  sheetRagged: 'The pasted rows must have the same number of cells.',
  sheetOutside: 'The pasted cells extend past the table.',
  sheetRejected: 'This sheet change was rejected.',
  // Indenting follows the visual direction: towards the row text, which is on the right in right-to-left charts.
  moveRowKeysHint: `Alt+Up and Alt+Down move the row among its siblings. Alt+Shift+${rtl.value ? 'Left' : 'Right'} indents it and `
    + `Alt+Shift+${rtl.value ? 'Right' : 'Left'} outdents it. Drag to move it; Escape cancels.`,
  ...props.labels,
}))
const notice = ref('')
// `range`, `editBounds`, `tickSteps` and `baselineIds` are compared by value, so inline literals in a parent template
// neither re-run validation nor cancel an in-flight gesture each time the parent renders. A real change still does both.
const stableRange = computed<TimeRange>(previous => previous && sameRange(previous, props.range) ? previous : props.range)
const stableEditBounds = computed<TimeRange | undefined>(previous => sameRange(previous, props.editBounds) ? previous : props.editBounds)
const stableTickSteps = computed<readonly number[]>(previous => sameItems(previous, props.tickSteps)!)
const stableBaselineIds = computed<readonly string[] | undefined>(previous => sameItems(previous, props.baselineIds))
const bounds = computed(() => stableEditBounds.value ?? stableRange.value)
// Zoom presets replace the linear scale settings while they are active.
const localPreset = ref<string>()
const activePreset = computed(() => {
  const id = props.zoomPreset ?? localPreset.value
  return id === undefined ? undefined : props.zoomPresets?.find(preset => preset.id === id)
})
const activePixelsPerUnit = computed(() => activePreset.value?.pixelsPerUnit ?? props.pixelsPerUnit)
const activeTickSteps = computed(() => activePreset.value?.tickSteps ?? stableTickSteps.value)
const activeBands = computed(() => activePreset.value?.headerBands ?? props.headerBands)
const activeSnap = computed(() => activePreset.value?.snap ?? props.snap)
const minimum = computed(() => props.minDuration ?? activeSnap.value)
// Invalid input is reported through `validation-error` and never rendered. The error is rethrown so
// development builds still surface it (production Vue logs it instead of rendering invalid data).
const validationError = ref<Error>()
const tree = shallowRef<ReturnType<typeof createTimelineRowTree<R>>>([])
// The `rows` that `tree` was built from. Other validated props (`now`, `markers`, ...) reuse the tree, so a change of
// them neither rebuilds the rows nor cancels a gesture that depends on them.
let treeRows: readonly R[] | undefined
const loadHistogram = shallowRef<Map<string, ResourceLoadHistogram>>()
// Header sorting and filtering (`sortableColumns`, `filterableColumns`): the column IDs that get controls. Lists are
// compared by value, so an inline literal in a parent template does not count as a change.
const stableSortable = computed<boolean | readonly string[] | undefined>(previous => sameOption(previous, props.sortableColumns))
const stableFilterable = computed<boolean | readonly string[] | undefined>(previous => sameOption(previous, props.filterableColumns))
const sortableIds = computed(() => headerColumnIds(stableSortable.value, props.columns ?? []))
const filterableIds = computed(() => headerColumnIds(stableFilterable.value, props.columns ?? []))
function validateProps() {
  return validateGanttProps({
    rows: props.rows, bars: props.bars, dependencies: props.dependencies, laneCount: props.laneCount,
    summaryDependencies: props.summaryDependencies, zoomPresets: props.zoomPresets, zoomPreset: props.zoomPreset,
    range: stableRange.value, pixelsPerUnit: activePixelsPerUnit.value, bounds: bounds.value, rowHeight: props.rowHeight,
    snap: activeSnap.value, minDuration: minimum.value, tickSteps: activeTickSteps.value, scale: props.scale, now: props.now,
    nonWorkingPeriods: props.nonWorkingPeriods, progressStep: props.progressStep, tooltipDelay: props.tooltipDelay,
    dependencyStyle: props.dependencyStyle, createDuration: props.createDuration, statusDate: props.statusDate,
    labelWidth: props.labelWidth, minColumnWidth: props.minColumnWidth, maxColumnWidth: props.maxColumnWidth,
    columnsResizable: props.columnsResizable || sortableIds.value.size > 0 || filterableIds.value.size > 0, columns: props.columns,
    sortableColumns: stableSortable.value, filterableColumns: stableFilterable.value,
    headerBands: activeBands.value, markers: props.markers,
    markerRanges: props.markerRanges, baselineIds: stableBaselineIds.value, loadRows: props.loadRows,
    loadSegments: props.loadSegments, loadRowHeight: props.loadRowHeight,
    ...(treeRows !== undefined && treeRows === props.rows ? { tree: tree.value } : {}),
  })
}
// Controlled props are watched by reference. Pass new arrays and objects instead of mutating them in place.
watch([
  () => props.rows, () => props.bars, () => props.dependencies, () => props.laneCount, () => props.rowHeight, () => props.snap,
  () => stableRange.value, () => stableEditBounds.value, () => props.minDuration, () => stableTickSteps.value, () => props.pixelsPerUnit, () => props.scale,
  () => props.zoomPresets, () => props.zoomPreset, activePreset, () => props.loadRows, () => props.loadSegments, () => props.loadRowHeight,
  () => props.now, () => props.nonWorkingPeriods, () => props.progressStep, () => props.tooltipDelay, () => props.dependencyStyle, () => props.createDuration,
  () => props.statusDate, () => props.labelWidth, () => props.minColumnWidth, () => props.maxColumnWidth, () => props.columnsResizable,
  () => props.columns, () => props.headerBands, () => props.markers, () => stableBaselineIds.value, () => props.markerRanges,
  () => props.summaryDependencies, stableSortable, stableFilterable,
], () => {
  try {
    const result = validateProps()
    if (result.tree !== tree.value) tree.value = result.tree
    treeRows = props.rows
    loadHistogram.value = result.load
    validationError.value = undefined
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error))
    treeRows = undefined
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
// The label corner sets `viewport.labels`. It only exists while the data is valid, so it is (re)observed as it comes and goes.
const cornerEl = ref<HTMLElement | null>()
let observedCorner: HTMLElement | undefined
const viewport = ref({ width: 1150, height: 321, left: 0, top: 0, labels: 154 })
// Right-to-left: the time axis starts at the right edge. Internally, horizontal positions are measured from the
// inline-start edge (`left` in LTR, `right` in RTL), so `viewport.left` and all axis math stay direction-independent.
const root = ref<HTMLElement>()
const inheritedRtl = ref(false)
const rtl = computed(() => props.dir === 'rtl' || (props.dir === 'auto' && inheritedRtl.value))
const inlineSide = computed(() => rtl.value ? 'right' : 'left')
// With `dir="auto"`, a MutationObserver on the `dir` attributes of the ancestors detects the direction again when one
// of them changes; the `rtl` watcher below then cancels gestures and keeps the scroll position.
let directionObserver: MutationObserver | undefined
function detectDirection() {
  const element = root.value
  inheritedRtl.value = props.dir === 'auto' && element !== undefined && getComputedStyle(element).direction === 'rtl'
  directionObserver?.disconnect()
  directionObserver = undefined
  if (props.dir !== 'auto' || !element || typeof MutationObserver === 'undefined') return
  directionObserver = new MutationObserver(() => {
    inheritedRtl.value = props.dir === 'auto' && getComputedStyle(element).direction === 'rtl'
  })
  for (let ancestor = element.parentElement; ancestor; ancestor = ancestor.parentElement) {
    directionObserver.observe(ancestor, { attributes: true, attributeFilter: ['dir'] })
  }
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
  let width = 0
  for (const column of props.columns ?? []) width += column.width
  return width
})
function canEditCell(row: R, column: TimelineColumn<R>) {
  if (props.readonly) return false
  return typeof column.editable === 'function' ? column.editable(row) : Boolean(column.editable)
}
function cellValue(row: R, column: TimelineColumn<R>) {
  return column.value(row, summaries.value?.get(row.id))
}
/**
 * Whether a key belongs to an input method composition (for example the Enter that confirms a Japanese conversion).
 * Such keys are left to the input method: they neither commit nor cancel an edit. keyCode 229 covers browsers that
 * end the composition before dispatching that key.
 */
function composing(event: KeyboardEvent) {
  return event.isComposing || event.keyCode === 229
}
/**
 * Text being edited in the built-in cell inputs (plain and typed), by cell key, with the source text it edits. The
 * inputs show the draft instead of the source text, so a re-render during an edit (or an input method composition)
 * keeps what was typed. A commit or Escape ends the draft; new source text for the cell discards it, which cancels the
 * edit. Deliberately not reactive: the input already shows the text, and typing must not re-render the chart.
 */
const cellDrafts = new Map<string, { text: string; source: string }>()
/** The text a built-in cell input shows: its draft while one is in progress for this source text, else the source text. */
function cellInputText(key: string, source: string) {
  const draft = cellDrafts.get(key)
  if (draft && draft.source === source) return draft.text
  cellDrafts.delete(key)
  return source
}
function recordCellDraft(event: Event, key: string, source: string) {
  cellDrafts.set(key, { text: (event.currentTarget as HTMLInputElement).value, source })
}
function plainCellText(row: R, column: TimelineColumn<R>) {
  return String(cellValue(row, column))
}
/** Enter in a plain cell input commits through `change` by leaving the input (in a spreadsheet, it commits and moves down). */
function cellEnter(event: KeyboardEvent, row: R, column: TimelineColumn<R>) {
  if (composing(event)) return
  if (commitSheetInput(event, row, column)) return
  event.preventDefault()
  ;(event.currentTarget as HTMLInputElement).blur()
}
function cancelCell(event: KeyboardEvent, row: R, column: TimelineColumn<R>) {
  // Escape during a composition cancels the composition only; keep the text and focus. Do not let the region's Escape
  // handler see it either.
  event.stopPropagation()
  if (composing(event)) return
  event.preventDefault()
  const input = event.currentTarget as HTMLInputElement
  cellDrafts.delete(cellKey(row, column))
  input.value = plainCellText(row, column)
  endSheetEdit(row, column)
  input.blur()
}
function commitCell(event: Event, row: R, column: TimelineColumn<R>) {
  commitCellText(event.currentTarget as HTMLInputElement, row, column)
}
function commitCellText(input: HTMLInputElement, row: R, column: TimelineColumn<R>) {
  const before = cellValue(row, column)
  const after = input.value
  cellDrafts.delete(cellKey(row, column))
  input.value = String(before)
  if (!canEditCell(row, column) || String(before) === after) return
  const change: TimelineCellEdit = { rowId: row.id, columnId: column.id, before, after }
  const reason = settle(props.validateCellEdit?.(change))
  if (reason !== undefined) emit('cell-edit-rejected', change, reason)
  else emit('cell-edit', change)
}

// Typed field editing (`TimelineColumn.field`). Such a column emits `field-edit` only, never `cell-edit`. A `cell` slot
// owns the cell; otherwise the `cell-editor` slot edits it, or the built-in text input parses the text with
// the field. Columns without `field` render and behave as plain columns.
type CellEditorState = {
  rowId: string; columnId: string; before: FieldValue; draft: FieldValue; validation: FieldCheck; source: ViewTargetSource
}
const cellEditor = shallowRef<CellEditorState>()
/** The cell of the built-in field input whose text could not be read, with the reason. */
const fieldInputError = shallowRef<{ key: string; error: string }>()
function cellKey(row: TimelineRow, column: TimelineColumn<R>) {
  return JSON.stringify([row.id, column.id])
}
function editingCell(row: TimelineRow, column: TimelineColumn<R>) {
  const state = cellEditor.value
  return state !== undefined && state.rowId === row.id && state.columnId === column.id
}
function fieldText(row: R, column: TimelineColumn<R>) {
  return formatFieldValue(column.field!, column.field!.get(row))
}
const dataSelectors = {
  vwBar: '[data-vw-bar]', vwRowHandle: '[data-vw-row-handle]', vwCell: '[data-vw-cell]', vwCellEditor: '[data-vw-cell-editor]',
  vwRowHeading: '[data-vw-row-heading]',
}
/** The rendered element whose data attribute holds `value`. Values are compared directly, so IDs need no CSS escaping. */
function dataElement(attribute: keyof typeof dataSelectors, value: string) {
  for (const element of scroller.value?.querySelectorAll<HTMLElement>(dataSelectors[attribute]) ?? []) {
    if (element.dataset[attribute] === value) return element
  }
  return undefined
}
/** Return focus to the cell of a closed editor, or to the chart region when the cell is gone. */
async function focusCell(key: string) {
  await nextTick()
  const cell = dataElement('vwCell', key)
  if (cell) cell.focus({ preventScroll: true })
  else scroller.value?.focus({ preventScroll: true })
}
async function startCellEditor(row: R, column: TimelineColumn<R>, source: ViewTargetSource) {
  if (!column.field || !canEditCell(row, column)) return
  // Opening another cell's editor cancels the open one, as Escape would, without moving focus back to it.
  if (cellEditor.value) cancelCellEditor('escape', false)
  const before = column.field.get(row)
  cellEditor.value = { rowId: row.id, columnId: column.id, before, draft: before, validation: { ok: true }, source }
  hideTooltip()
  await nextTick()
  const editor = dataElement('vwCellEditor', cellKey(row, column))
  const first = editor?.querySelector<HTMLElement>('input, select, textarea, button, [tabindex]:not([tabindex="-1"]), [contenteditable]:not([contenteditable="false"])')
  ;(first ?? editor)?.focus({ preventScroll: true })
}
function closeCellEditor(returnFocus: boolean) {
  const state = cellEditor.value
  if (!state) return
  const key = JSON.stringify([state.rowId, state.columnId])
  const editor = dataElement('vwCellEditor', key)
  const focused = typeof document !== 'undefined' && editor?.contains(document.activeElement)
  cellEditor.value = undefined
  if (returnFocus || focused) void focusCell(key)
}
/** Close an open `cell-editor` without a proposal and report it through `edit-cancel`. */
function cancelCellEditor(reason: TimelineEditCancelReason, returnFocus = reason === 'escape') {
  const state = cellEditor.value
  if (!state) return
  closeCellEditor(returnFocus)
  emit('edit-cancel', { reason, barIds: [], cell: { rowId: state.rowId, columnId: state.columnId } })
}
function editorTarget() {
  const state = cellEditor.value
  const row = state && rowById.value.get(state.rowId) as R | undefined
  const column = state && props.columns?.find(item => item.id === state.columnId)
  return state && row && column?.field && canEditCell(row, column) ? { state, row, column, field: column.field } : undefined
}
/** Propose `after` for a field cell. Shared by the `cell-editor` slot and the built-in field input. */
function proposeField(row: R, column: TimelineColumn<R>, before: FieldValue, after: FieldValue, source: ViewTargetSource): FieldCheck {
  const field = column.field!
  const check = validateFieldValue(field, after)
  if (!check.ok) {
    notice.value = check.error
    return check
  }
  if (fieldValuesEqual(before, after)) return check
  const change: TimelineFieldEdit<R> = { rowId: row.id, columnId: column.id, fieldId: field.id, before, after, source }
  const reason = settle(props.validateFieldEdit?.(change))
  if (reason !== undefined) {
    emit('field-edit-rejected', change, reason)
    return { ok: false, code: 'custom', error: reason }
  }
  emit('field-edit', change)
  return check
}
function commitCellEditor(value: FieldValue, source?: ViewTargetSource): FieldCheck {
  const target = editorTarget()
  if (!target) {
    cancelCellEditor('source-changed')
    return { ok: false, code: 'invalid', error: messages.value.rejected }
  }
  const { state, row, column } = target
  // An unchanged value closes the editor without a proposal, even when the current value would not pass validation.
  if (fieldValuesEqual(state.before, value)) {
    closeCellEditor(true)
    return { ok: true }
  }
  const result = proposeField(row, column, state.before, value, source ?? state.source)
  if (result.ok) closeCellEditor(true)
  else cellEditor.value = { ...state, draft: value, validation: result }
  return result
}
function commitCellEditorText(text: string, source?: ViewTargetSource): FieldCheck {
  const target = editorTarget()
  if (!target) return commitCellEditor(null, source)
  // The formatted current value, committed unedited, keeps the current value as it is.
  if (text === formatFieldValue(target.field, target.state.before)) return commitCellEditor(target.state.before, source)
  const parsed = parseFieldValue(target.field, text)
  if (parsed.ok) return commitCellEditor(parsed.value, source)
  notice.value = parsed.error
  cellEditor.value = { ...target.state, validation: parsed }
  return parsed
}
function cellEditorProps(row: R, column: TimelineColumn<R>) {
  const state = cellEditor.value!
  return {
    row, column, field: column.field!, value: state.before, draft: state.draft, validation: state.validation,
    error: state.validation.ok ? undefined : state.validation.error, source: state.source,
    commit: commitCellEditor, commitText: commitCellEditorText, cancel: () => cancelCellEditor('escape'),
  }
}
function cellEditorKeys(event: KeyboardEvent) {
  // The slot committed or cancelled on this key and focus is about to return to the cell button. Prevent the default
  // action so that the same Enter or Space does not activate the button and open the editor again.
  if (!cellEditor.value) return event.preventDefault()
  if (event.key !== 'Escape' || event.defaultPrevented) return
  // Escape during an input method composition cancels the composition only; the editor stays open.
  event.stopPropagation()
  if (composing(event)) return
  event.preventDefault()
  cancelCellEditor('escape')
}
/**
 * The built-in field input: Enter or a change parses the text with the field and proposes the value. Text left as the
 * current value is shown ends the edit without a proposal.
 */
function commitFieldInput(event: Event, row: R, column: TimelineColumn<R>) {
  commitFieldText(event.currentTarget as HTMLInputElement, row, column)
}
function commitFieldText(input: HTMLInputElement, row: R, column: TimelineColumn<R>) {
  const field = column.field!
  const before = field.get(row)
  const key = cellKey(row, column)
  const shown = formatFieldValue(field, before)
  if (!canEditCell(row, column) || input.value === shown) {
    if (fieldInputError.value?.key === key) fieldInputError.value = undefined
    cellDrafts.delete(key)
    input.value = shown
    return
  }
  const parsed = parseFieldValue(field, input.value)
  if (!parsed.ok) {
    // Keep the text so it can be corrected; the reason is announced and the input is marked invalid. The error belongs
    // to this draft and goes with it when the source text changes.
    cellDrafts.set(key, { text: input.value, source: shown })
    fieldInputError.value = { key, error: parsed.error }
    notice.value = parsed.error
    return
  }
  if (fieldInputError.value?.key === key) fieldInputError.value = undefined
  cellDrafts.delete(key)
  input.value = shown
  proposeField(row, column, before, parsed.value, 'keyboard')
}
function fieldInputEnter(event: KeyboardEvent, row: R, column: TimelineColumn<R>) {
  // The Enter that confirms an input method conversion keeps the text and focus; a later Enter commits.
  if (composing(event)) return
  if (commitSheetInput(event, row, column)) return
  event.preventDefault()
  commitFieldInput(event, row, column)
}
function cancelFieldInput(event: KeyboardEvent, row: R, column: TimelineColumn<R>) {
  event.stopPropagation()
  if (composing(event)) return
  event.preventDefault()
  const input = event.currentTarget as HTMLInputElement
  const key = cellKey(row, column)
  cellDrafts.delete(key)
  input.value = fieldText(row, column)
  if (fieldInputError.value?.key === key) fieldInputError.value = undefined
  endSheetEdit(row, column)
}
// New rows or columns, or a row hidden by collapsing, cancel an open cell editor.
watch([() => props.rows, () => props.columns, () => props.readonly, () => props.collapsedIds, localCollapsed], () => {
  const state = cellEditor.value
  if (!state) return
  cancelCellEditor(rowById.value.has(state.rowId) && !rowOrder.value.has(state.rowId) ? 'hidden' : 'source-changed')
})
// New source text for a cell with a draft, or a row that is hidden or gone, discards the draft (and its parse error)
// before the next render, so the input shows the source text again.
watch([() => props.rows, () => props.columns, () => props.readonly, () => props.collapsedIds, localCollapsed, summaries], () => {
  for (const [key, draft] of cellDrafts) {
    const [rowId, columnId] = JSON.parse(key) as [string, string]
    const row = rowOrder.value.has(rowId) ? rowById.value.get(rowId) as R | undefined : undefined
    const column = props.columns?.find(item => item.id === columnId)
    const current = row && column && canEditCell(row, column)
      ? (column.field ? fieldText(row, column) : plainCellText(row, column)) : undefined
    if (current === draft.source) continue
    cellDrafts.delete(key)
    if (fieldInputError.value?.key === key) fieldInputError.value = undefined
  }
})
// The cell with a parse error is watched on its own: its source text can change without new props (a `field.get` that
// reads other reactive state), and the error belongs to the draft of the old text.
watch(() => {
  const error = fieldInputError.value
  if (!error) return true
  const draft = cellDrafts.get(error.key)
  const [rowId, columnId] = JSON.parse(error.key) as [string, string]
  const row = rowOrder.value.has(rowId) ? rowById.value.get(rowId) as R | undefined : undefined
  const column = props.columns?.find(item => item.id === columnId)
  return Boolean(draft && row && column?.field && canEditCell(row, column) && fieldText(row, column) === draft.source)
}, current => {
  if (current) return
  const key = fieldInputError.value!.key
  cellDrafts.delete(key)
  fieldInputError.value = undefined
})
const displayedRows = computed(() => {
  const result: typeof tree.value = []
  for (let index = 0; index < tree.value.length;) {
    const item = tree.value[index]!
    result.push(item)
    index = collapsed.value.has(item.row.id) ? item.afterSubtree : index + 1
  }
  return result
})
const sheet = useSheet<R>({
  rows: () => displayedRows.value, columns: () => props.columns ?? [],
  editable: canEditCell, value: cellValue,
  messages: () => ({ readOnly: messages.value.sheetReadOnly!, ragged: messages.value.sheetRagged!, outside: messages.value.sheetOutside! }),
  validateField: change => rejection(props.validateFieldEdit?.(change)),
  validateCell: change => rejection(props.validateCellEdit?.(change)),
  validateSheet: change => rejection(props.validateSheetEdit?.(change), messages.value.sheetRejected),
  propose: change => {
    notice.value = ''
    emit('sheet-edit', change)
  },
  reject: (reason, change) => {
    notice.value = reason
    emit('sheet-edit-rejected', reason, change)
  },
  focus: (index, key) => {
    if (scroller.value) scrollRowIntoView(scroller.value, index)
    syncViewport()
    void focusCell(key)
  },
  edit: (row, column, text) => { void editSheetCell(row, column, text) },
  rowAt: clientY => {
    const area = canvas.value
    const count = displayedRows.value.length
    if (!area || !count) return undefined
    const y = clientY - area.getBoundingClientRect().top - headerHeight.value
    return Math.max(0, Math.min(count - 1, Math.floor(y / props.rowHeight)))
  },
  autoScroll: clientY => {
    const el = scroller.value
    if (!el) return
    const rect = el.getBoundingClientRect()
    const edge = Math.min(32, props.rowHeight)
    const step = clientY > rect.bottom - edge ? 1 : clientY < rect.top + headerHeight.value + edge ? -1 : 0
    if (!step) return
    el.scrollTop += step * Math.ceil(props.rowHeight / 2)
    syncViewport()
  },
  rtl: () => rtl.value,
  busy: (): boolean => gestureActive(),
})
// A fill handle drag that new data ends is reported like any other cancelled gesture, before the sheet drops it.
watch([() => props.spreadsheet, () => props.readonly], () => {
  if (sheet.fill.value) cancelGestures('source-changed')
  sheet.reset()
})
/**
 * Clipboard events while a spreadsheet cell has focus. They are read on the document because a browser may dispatch
 * them to the body rather than to a focused element that is not editable.
 */
function sheetClipboard(event: Event) {
  const active = document.activeElement
  if (!props.spreadsheet || !(active instanceof HTMLElement) || !active.classList.contains('vw-sheet-cell') || !scroller.value?.contains(active)) return
  const clipboard = event as ClipboardEvent
  if (event.type === 'copy') sheet.copy(clipboard)
  else if (event.type === 'cut') sheet.cut(clipboard)
  else sheet.paste(clipboard)
}
const clipboardEvents = ['copy', 'cut', 'paste'] as const
onMounted(() => { for (const type of clipboardEvents) document.addEventListener(type, sheetClipboard) })
onUnmounted(() => { for (const type of clipboardEvents) document.removeEventListener(type, sheetClipboard) })
watch([displayedRows, () => props.columns], () => {
  if (sheet.fill.value) cancelForSource(true)
  sheet.refresh()
})
/** Whether a cell is shown as a spreadsheet cell button (no `cell` or `cell-editor` slot, editor closed). */
function sheetCell(row: R, column: TimelineColumn<R>) {
  return props.spreadsheet && !slots.cell && !slots['cell-editor'] && sheet.editing.value !== cellKey(row, column)
}
/** The one spreadsheet cell in the Tab order: the active cell while it is rendered, else the first rendered cell. */
const tabbableSheetCell = computed(() => {
  const columns = props.columns ?? []
  if (!props.spreadsheet || !columns.length) return undefined
  const shown = shownRows.value
  const active = sheet.end.value
  if (active && shown.some(item => item.row.id === active.row)) return sheetKey(active.row, active.column)
  const first = shown[0]
  return first ? cellKey(first.row, columns[0]!) : undefined
})
/** Open the built-in single-cell editor of a spreadsheet cell; `text` replaces the cell text (typing to edit). */
async function editSheetCell(row: R, column: TimelineColumn<R>, text?: string) {
  if (!canEditCell(row, column)) return
  const key = cellKey(row, column)
  if (text !== undefined) cellDrafts.set(key, { text, source: column.field ? fieldText(row, column) : plainCellText(row, column) })
  sheet.select(row.id, column.id, false)
  sheet.editing.value = key
  await focusCell(key)
  const input = dataElement('vwCell', key)
  if (input instanceof HTMLInputElement) input.setSelectionRange(input.value.length, input.value.length)
}
/** Close the spreadsheet editor of a cell and return focus to its cell button. */
function endSheetEdit(row: R, column: TimelineColumn<R>) {
  const key = cellKey(row, column)
  if (sheet.editing.value !== key) return false
  sheet.editing.value = undefined
  void focusCell(key)
  return true
}
/**
 * Enter (down, Shift+Enter up) or Tab (along the row) in a spreadsheet editor: commit, then select the next cell.
 * Text a field cannot read keeps the editor open. Returns false when the input is not a spreadsheet editor.
 */
function commitSheetInput(event: KeyboardEvent, row: R, column: TimelineColumn<R>) {
  const key = cellKey(row, column)
  if (!props.spreadsheet || sheet.editing.value !== key) return false
  event.preventDefault()
  event.stopPropagation()
  const input = event.currentTarget as HTMLInputElement
  if (column.field) commitFieldText(input, row, column)
  else commitCellText(input, row, column)
  if (fieldInputError.value?.key === key) return true
  sheet.editing.value = undefined
  const forward = event.shiftKey ? -1 : 1
  if (event.key === 'Tab') sheet.moveFrom(row.id, column.id, 0, forward)
  else sheet.moveFrom(row.id, column.id, forward, 0)
  return true
}
function sheetInputTab(event: KeyboardEvent, row: R, column: TimelineColumn<R>) {
  if (!composing(event)) commitSheetInput(event, row, column)
}
function sheetButtonFocus(row: R, column: TimelineColumn<R>) {
  if (sheet.end.value?.row !== row.id || sheet.end.value.column !== column.id) sheet.select(row.id, column.id, false)
}
/** Focus leaving a spreadsheet editor (a click elsewhere) commits it through `change` and closes it. */
function leaveSheetCell(event: FocusEvent, row: R, column: TimelineColumn<R>) {
  if (event.target instanceof HTMLInputElement && sheet.editing.value === cellKey(row, column)) sheet.editing.value = undefined
}
/** Accessible name of a row's expand toggle. */
function toggleName(row: TimelineRow) {
  return `${collapsed.value.has(row.id) ? messages.value.expandRow : messages.value.collapseRow} ${row.label}`
}
/** Glyph of a row's expand toggle: pointing towards the row text when collapsed, down when expanded. */
function toggleGlyph(id: string) {
  return collapsed.value.has(id) ? (rtl.value ? '◂' : '▸') : '▾'
}
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
  const base = props.scale ?? createTimeScale(stableRange.value, activePixelsPerUnit.value)
  if (!Number.isFinite(base.width) || base.width <= 0) throw new RangeError('Invalid time scale width')
  return { width: base.width * zoom.value, toX: time => base.toX(time) * zoom.value, toTime: x => base.toTime(x / zoom.value) }
})
// Smallest on-screen distance between neighbouring ticks of `step` inside the visible window.
// A custom scale can be piecewise, so the first interval does not represent the rest.
function minTickGap(step: number) {
  const { start, end } = timeWindow.value
  const anchor = stableRange.value.start
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
  const groups = new Map<string, B[]>()
  for (const bar of validationError.value ? [] : props.bars) {
    if (!groups.has(bar.rowId)) groups.set(bar.rowId, [])
    groups.get(bar.rowId)!.push(bar)
  }
  return groups
})
const laneHeight = computed(() => (props.rowHeight - 8) / props.laneCount)
// Baseline sets drawn below the bars (`baselineIds`). Two or three sets take `reserve` pixels from the bar height.
const baselineChoice = computed(() => validationError.value ? { ids: [], described: false } : baselineSelection(props.bars, stableBaselineIds.value))
const baselineGeometry = computed(() => baselineLayout(baselineChoice.value.ids.length))
const barHeight = computed(() => Math.max(1, laneHeight.value - 6 - baselineGeometry.value.reserve))
const bodyHeight = computed(() => displayedRows.value.length * props.rowHeight)
// The windows keep their objects while their values stay the same, so a vertical scroll does not recompute what
// depends on the time window, and a horizontal scroll does not recompute what depends on the row window.
const xWindow = computed<{ left: number; right: number }>(previous => {
  const left = Math.min(axis.value.width, Math.max(0, viewport.value.left - 80))
  const right = Math.min(axis.value.width, Math.max(0, viewport.value.left + viewport.value.width - viewport.value.labels + 80))
  return previous && previous.left === left && previous.right === right ? previous : { left, right }
})
const timeWindow = computed<TimeRange>(previous => {
  const next = { start: axis.value.toTime(xWindow.value.left), end: axis.value.toTime(xWindow.value.right) }
  return previous && sameRange(previous, next) ? previous : next
})
const rowWindow = computed<RowWindow>(previous => {
  const next = visibleRows(
    viewport.value.top,
    Math.max(0, viewport.value.height - headerHeight.value),
    props.rowHeight,
    displayedRows.value.length,
  )
  return previous && previous.first === next.first && previous.afterLast === next.afterLast ? previous : next
})
/** The part of the axis that can be drawn: `range` inside the visible time window. Overlays are clipped to it. */
const drawnWindow = computed(() => drawableWindow(stableRange.value, timeWindow.value))
const shownBands = computed(() => (activeBands.value ?? []).map(level => level.flatMap(band => {
  const span = clipSpan(band.start, band.end, drawnWindow.value)
  if (!span) return []
  return [{ ...band, x: axis.value.toX(span.start), width: axis.value.toX(span.end) - axis.value.toX(span.start) }]
})))
// With `stickyBandLabels`, a band that starts before the visible part of the axis indents its label to the visible start.
// The indent leaves the band's own padding, set by the stylesheet or a theme, unchanged.
function stickyBandStyle(x: number) {
  const offset = props.stickyBandLabels ? viewport.value.left - x : 0
  return offset > 0 ? { textIndent: `${offset}px` } : {}
}
const shownMarkers = computed(() => (props.markers ?? []).filter(item => inTimeWindow(item.time, timeWindow.value)))
/** The visible part of each marker range (`markerRanges`), clipped to the drawn window. */
const shownRanges = computed(() => {
  if (validationError.value || !props.markerRanges?.length) return []
  return props.markerRanges.flatMap(item => {
    const span = clipSpan(item.start, item.end, drawnWindow.value)
    if (!span) return []
    const left = axis.value.toX(span.start)
    const tone = item.tone === undefined ? [] : [`vw-tone-${item.tone}`, 'vw-has-tone']
    return [{ item, left, width: axis.value.toX(span.end) - left, tone, name: `${item.label} ${props.formatTime(item.start)}–${props.formatTime(item.end)}` }]
  })
})
/** The rows a marker range with `rowIds` is drawn on: those displayed inside the virtual row window, once each. */
function rangeRows(rowIds: readonly string[]) {
  return [...new Set(rowIds)].flatMap(rowId => {
    const index = rowOrder.value.get(rowId)
    return index !== undefined && inRowWindow(index, rowWindow.value) ? [{ rowId, index }] : []
  })
}
/** The status date (`statusDate`) when its line is drawn. */
const statusTime = computed(() => {
  const time = props.statusDate
  return time !== undefined && !validationError.value && inRangeAndWindow(time, stableRange.value, timeWindow.value) ? time : undefined
})
type OverlayElement = { key: string; classes: string | string[]; style: Record<string, string>; role?: string; name?: string; hidden?: 'true' }
type MarkerEntry = OverlayElement & { label: string }
/**
 * The vertical overlays across the body, in paint order: marker range bands (one per row for a range with `rowIds`),
 * markers, then the status date. They share one template element so that a chart without marker ranges or a status
 * date renders exactly the markup it did before.
 */
const markerEntries = computed(() => {
  const entries: MarkerEntry[] = []
  for (const { item, left, width, tone } of shownRanges.value) {
    const style = { [inlineSide.value]: canvasInset(left), width: `${width}px` }
    if (!item.rowIds) {
      entries.push({ key: 'range:' + item.id, label: '', classes: ['vw-gantt-range', ...tone], style, hidden: 'true' })
      continue
    }
    for (const { rowId, index } of rangeRows(item.rowIds)) {
      entries.push({
        key: 'range:' + item.id + ':' + rowId, label: '', classes: ['vw-gantt-range', 'vw-is-row', ...tone], hidden: 'true',
        style: { ...style, top: `calc(var(--vw-header-height) + ${index * props.rowHeight}px)`, height: `${props.rowHeight}px` },
      })
    }
  }
  for (const item of shownMarkers.value) {
    entries.push({
      key: 'marker:' + item.id, label: item.label, classes: 'vw-gantt-marker',
      style: { [inlineSide.value]: canvasInset(axis.value.toX(item.time)) },
    })
  }
  const time = statusTime.value
  if (time !== undefined) {
    const label = messages.value.statusDate!
    entries.push({
      key: 'status', label, classes: ['vw-gantt-marker', 'vw-gantt-status-date'], role: 'img', name: `${label} ${props.formatTime(time)}`,
      style: { [inlineSide.value]: canvasInset(axis.value.toX(time)) },
    })
  }
  return entries
})
type HeadLine = OverlayElement & { text: string }
/**
 * The elements of the time header behind the tick labels: the tick lines, then the header labels of the marker ranges
 * (named like a status-date marker). They share one template element so that a chart without marker ranges renders
 * exactly the markup it did before.
 */
const headLines = computed(() => {
  const lines: HeadLine[] = tickXs.value.map(line => ({
    key: 'line-' + line.tick, text: '', classes: 'vw-gantt-tick-line', style: { [inlineSide.value]: `${line.x}px` }, hidden: 'true',
  }))
  for (const { item, left, width, tone, name } of shownRanges.value) {
    lines.push({
      key: 'range-' + item.id, text: item.label, classes: ['vw-gantt-range-label', ...tone], role: 'img', name,
      style: { [inlineSide.value]: `${left}px`, width: `${width}px` },
    })
  }
  return lines
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
  return time !== undefined && Number.isFinite(time) && inRangeAndWindow(time, stableRange.value, timeWindow.value) ? time : undefined
})
const ticks = computed(() => timeTicks(timeWindow.value, tickStep.value, stableRange.value.start))
// Grid lines are drawn at each tick's own x (as exportSvg does), so non-linear scales stay aligned with the labels.
const tickXs = computed(() => ticks.value.map(tick => ({ tick, x: axis.value.toX(tick) })))
// Tick labels with room before the next tick; a working-time scale squeezes ticks in non-working time together, and
// those labels are left out (their tick and grid lines stay) so labels never overlap.
const tickLabels = computed(() => {
  const shown = tickLabelsWithRoom(ticks.value, axis.value.toX, tickStep.value, stableRange.value.end)
  return tickXs.value.filter((_, index) => shown[index])
})
// Kept for custom stylesheets that read --vw-grid-step; the built-in styles no longer use it.
const gridStep = computed(() => axis.value.toX(stableRange.value.start + tickStep.value) - axis.value.toX(stableRange.value.start))
type BarPreview = { range: TimeRange; rowShift: number; mode: EditMode }
const previews = shallowRef<ReadonlyMap<string, BarPreview>>()
const focusedBarId = ref<string>()
let pendingReveal: string | undefined
let pendingFocus: string | undefined
let suppressSelection: string | undefined
let lastClientX = 0
let lastClientY = 0
let scrollFrame = 0
/**
 * The pointer gesture in flight. At most one exists, because every gesture start checks `pointerGestureActive`. Each
 * kind records the pointer and the element that captured it; what the gesture draws lives in its own reactive preview
 * (`previews`, `linkPoint`, `progressPreview`, `constraintPreview`, `createPreview`, `rowDrop`, `columnResize`).
 */
type Gesture =
  | {
    type: 'bar'; id: string; pointerId: number; target: HTMLElement; initialX: number; initialY: number; initial: TimeRange; mode: EditMode
    group: readonly TimelineBar[]
  }
  | { type: 'progress'; id: string; pointerId: number; target: HTMLElement; x: number }
  | { type: 'constraint'; id: string; kind: TimelineConstraintKind; pointerId: number; target: HTMLElement; x: number; origin: number; before: number }
  | { type: 'link'; pointerId: number; target: HTMLElement; x: number; y: number }
  | { type: 'create'; pointerId: number; target: HTMLElement; rowId: string; time: number; x: number; moved: boolean }
  | { type: 'row'; id: string; pointerId: number; target: HTMLElement; y: number; moved: boolean }
  | { type: 'column'; id: string; pointerId: number; target: HTMLElement; x: number; before: number }
  | { type: 'pinch'; distance: number; zoom: number; anchor: number }
type GestureType = Gesture['type']
let gesture: Gesture | undefined
/** The gesture of `type` when it is the one in flight, and, with an event, when that event's pointer owns it. */
function gestureOf<T extends GestureType>(type: T, event?: PointerEvent): Extract<Gesture, { type: T }> | undefined {
  const active = gesture
  if (active?.type !== type || (event && (active.type === 'pinch' || active.pointerId !== event.pointerId))) return undefined
  return active as Extract<Gesture, { type: T }>
}
/** End the gesture of `type` when it is in flight and release its pointer capture; returns the ended gesture. */
function endGesture(type: GestureType) {
  const active = gestureOf(type)
  if (!active) return undefined
  gesture = undefined
  if (active.type !== 'pinch' && active.target.hasPointerCapture(active.pointerId)) active.target.releasePointerCapture(active.pointerId)
  return active
}
/** Whether a bar move or resize, or a drag to create, is in flight: the gestures that scroll at the viewport edges. */
function scrollingGesture() {
  return gesture?.type === 'bar' || gesture?.type === 'create'
}
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
      summary: item.hasChildren && props.showSummaries && !bars.length ? drawnSummaries.value?.get(item.row.id) : undefined,
      baselines: shownBaselines(bars),
      floats: bars.flatMap(bar => {
        const end = rangeOf(bar).end
        return bar.latestEnd !== undefined && bar.latestEnd > end && intersectsWindow({ start: end, end: bar.latestEnd }, timeWindow.value)
          ? [{ bar, style: floatStyle(bar, end, bar.latestEnd) }] : []
      }),
      decorations: [
        ...bars.flatMap(bar => bar.deadline !== undefined && inTimeWindow(bar.deadline, timeWindow.value)
          ? [{ key: bar.id + ':deadline', className: rangeOf(bar).end > bar.deadline ? 'vw-gantt-deadline vw-late' : 'vw-gantt-deadline', style: deadlineStyle(bar, bar.deadline) }]
          : []),
        // The constraints of a bar with handles (`constraintsEditable`) are drawn by its handles instead.
        ...bars.flatMap(bar => bar.constraints && !(constraintHandlesVisible.value && canEditConstraints(bar) && shown.includes(bar))
          ? constraintMarks(bar) : []),
      ],
    }
  })
})

// Critical, float, deadline and segment overlays. A bar without these fields gets no overlay and renders as a plain bar.
type BarOverlay = {
  description?: string
  late: boolean
  segments?: { pieces: { key: number; style: Record<string, string>; filled: number }[]; gaps: { key: number; style: Record<string, string> }[] }
}
const barIndex = computed(() => new Map((validationError.value ? [] : props.bars).map((bar, index) => [bar.id, index])))
function barOverlay(bar: TimelineBar): BarOverlay | undefined {
  const range = rangeOf(bar)
  // Named baseline sets (or `baselineIds`) add each selected baseline with its variance to the description.
  const strips = baselineChoice.value.described ? baselineStrips(bar, range, baselineChoice.value, baselineText.value) : []
  const constraints = barConstraints(bar)
  const note = bar.description?.trim()
  if (!note && !bar.critical && bar.latestEnd === undefined && bar.deadline === undefined && !bar.segments && !strips.length && !constraints.length) return undefined
  const parts: string[] = []
  // The application's own text comes first; a trailing full stop is dropped because the parts are joined with '. '.
  if (note) parts.push(note.replace(/\.+$/, ''))
  if (bar.critical) parts.push(messages.value.critical!)
  if (bar.latestEnd !== undefined) parts.push(`${messages.value.float} ${props.formatTime(bar.latestEnd)}`)
  if (bar.deadline !== undefined) parts.push(`${messages.value.deadline} ${props.formatTime(bar.deadline)}`)
  const late = bar.deadline !== undefined && range.end > bar.deadline
  if (late) parts.push(messages.value.late!)
  for (const item of constraints) parts.push(constraintText(item))
  for (const strip of strips) parts.push(`${strip.label} ${strip.dates}: ${strip.variance}`)
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
    [inlineSide.value]: canvasInset(left),
    width: `${axis.value.toX(latestEnd) - left}px`,
    top: `${laneTop(bar) + barHeight.value / 2 - 4}px`,
    ...rowShiftStyle(bar),
  }
}
function deadlineStyle(bar: TimelineBar, deadline: number) {
  return {
    [inlineSide.value]: canvasInset(axis.value.toX(deadline) - 5),
    top: `${laneTop(bar) - 3}px`,
    height: `${barHeight.value + 6}px`,
    ...rowShiftStyle(bar),
  }
}
// Non-working time is drawn behind the grid over the task rows and inside each load row, clipped to the visible window.
const shownNonWorking = computed(() => {
  if (validationError.value || !props.nonWorkingPeriods?.length) return []
  return props.nonWorkingPeriods.flatMap((period, index) => {
    const span = clipSpan(period.start, period.end, drawnWindow.value)
    if (!span) return []
    const left = axis.value.toX(span.start)
    return [{ key: index, left, width: axis.value.toX(span.end) - left }]
  })
})

/** The name of a dependency end: the bar label or, for a summary row end (`summaryDependencies`), the row label. */
function endLabel(id: string) {
  return barById.value.get(id)?.label ?? (props.summaryDependencies ? rowById.value.get(id)?.label : undefined) ?? id
}
function dependencyName(dep: TimelineDependency) {
  return `${endLabel(dep.from)} → ${endLabel(dep.to)} ${dep.type ?? 'FS'}`
}

// Summary rows as dependency ends (`summaryDependencies`). The rollups then follow the time ranges of a drag preview,
// so a rollup bar and the dependencies that end at it move with the dragged descendants. Without the prop, the rollups
// are those of `summaries`.
const drawnSummaries = computed(() => {
  const moved = previews.value
  if (!props.summaryDependencies || !props.showSummaries || !moved?.size || validationError.value) return summaries.value
  return summarizeTimelineRows(tree.value, props.bars.map(bar => {
    const range = moved.get(bar.id)?.range
    return range ? { ...bar, start: range.start, end: range.end } : bar
  }))
})
/** The drawn rollup and displayed row index of each summary row a dependency end can name. Empty without the prop. */
const summaryAnchors = computed(() => {
  const anchors = new Map<string, { range: TimeRange; index: number }>()
  if (!props.summaryDependencies || !props.showSummaries || validationError.value) return anchors
  const rollups = drawnSummaries.value
  displayedRows.value.forEach((item, index) => {
    const id = item.row.id
    // A rollup is drawn only on a parent row without bars; an ID that is also a bar ID names the bar.
    const rollup = item.hasChildren && !barsByRow.value.has(id) && !barById.value.has(id) ? rollups?.get(id) : undefined
    if (rollup) anchors.set(id, { range: rollup, index })
  })
  return anchors
})
/**
 * A dependency end in body coordinates: its interval, displayed row (shifted by a row preview) and vertical offset in
 * the row. A bar end follows its preview; a summary end is the middle of the row's rollup bar.
 */
function dependencyEnd(id: string) {
  const bar = barById.value.get(id)
  if (bar) {
    const index = rowOrder.value.get(bar.rowId)
    if (index === undefined) return undefined
    return { range: rangeOf(bar), row: index + (previews.value?.get(bar.id)?.rowShift ?? 0), offset: laneTop(bar) + barHeight.value / 2 }
  }
  const anchor = summaryAnchors.value.get(id)
  return anchor && { range: anchor.range, row: anchor.index, offset: props.rowHeight / 2 }
}

const shownLines = computed(() => {
  const { first, afterLast } = rowWindow.value
  const { left, right } = xWindow.value
  return (validationError.value ? [] : props.dependencies).flatMap(dep => {
    const source = dependencyEnd(dep.from)
    const target = dependencyEnd(dep.to)
    if (!source || !target) return []
    const sourceRow = source.row
    const targetRow = target.row
    if (Math.max(sourceRow, targetRow) < first || Math.min(sourceRow, targetRow) >= afterLast) return []
    const endpoints = dependencyTimes(source.range, target.range, dep.type)
    const x1 = axis.value.toX(endpoints.from)
    const x2 = axis.value.toX(endpoints.to)
    if (Math.max(x1, x2) + 10 < left || Math.min(x1, x2) - 10 > right) return []
    const y1 = sourceRow * props.rowHeight + source.offset
    const y2 = targetRow * props.rowHeight + target.offset
    const lag = dep.lag ? lagLabel(dep, dep.lag, lagLabelPoint(x1, y1, x2, y2, sourceRow * props.rowHeight, props.rowHeight)) : undefined
    return [{ ...dep, path: dependencyPath(x1, y1, x2, y2, props.dependencyStyle), x1, y1, x2, y2, dependency: dep, lag }]
  })
})
/**
 * Box of the three dependency layers (connectors, lag labels and hit paths): the visible time window over the virtual
 * row window, in body coordinates.
 */
const linkLayer = computed(() => {
  const { left, right } = xWindow.value
  const { first, afterLast } = rowWindow.value
  const width = right - left, height = (afterLast - first) * props.rowHeight
  return {
    width, height,
    style: { [inlineSide.value]: canvasInset(left), top: `${headerHeight.value + first * props.rowHeight}px` },
    viewBox: `${left} ${first * props.rowHeight} ${width} ${height}`,
  }
})
// Lag labels (`TimelineDependency.lag`). A dependency without a lag, or with lag 0, draws exactly what it did before.
const dependencyIndex = computed(() => new Map((validationError.value ? [] : props.dependencies).map((dep, index) => [dep.id, index])))
function lagLabel(dep: TimelineDependency, lag: number, point: ReturnType<typeof lagLabelPoint>) {
  const text = props.formatLag(lag)
  return { ...point, text, id: `${marker}-lag-${dependencyIndex.value.get(dep.id)}`, description: `${messages.value.lag} ${text}` }
}
type LinkShapeProps = { tag: 'path' | 'text'; attrs: Record<string, unknown>; text?: string }
/** One element of the dependency layer (a connector) or of the lag label layer above the marker lines (a lag label). */
function LinkShape(shape: LinkShapeProps) {
  return h(shape.tag, shape.attrs, shape.text)
}
const linkShapes = computed(() => shownLines.value.map((line): LinkShapeProps & { key: string } => ({
  key: line.id,
  tag: 'path',
  attrs: {
    class: {
      'vw-is-related': props.selectedIds?.has(line.from) || props.selectedIds?.has(line.to),
      'vw-is-highlighted': props.highlightedDependencyIds?.has(line.id),
      'vw-is-selected': dependencyTargets.value && activeDependencyId.value === line.id,
    },
    d: line.path,
    'marker-end': `url(#${marker})`,
  },
})))
/**
 * The dependency layer (default slot), followed by the lag label layer (`lag` slot) when a dependency has a lag. Without
 * lags it renders the dependency layer alone, so such charts render exactly the markup they did before.
 */
function DependencyLayers(_props: Record<string, never>, { slots }: { slots: Slots }) {
  const links = slots.default?.() ?? []
  if (lagShapes.value.length) return [...links, ...(slots.lag?.() ?? [])]
  return links.length === 1 ? links[0] : links
}
// Lag labels have their own layer, stacked above the marker, now and status-date lines (and the bars, whose gaps they
// sit in), so a line crossing a label does not cover its text. A chart without lags renders no layer.
const lagShapes = computed(() => {
  const shapes: (LinkShapeProps & { key: string })[] = []
  for (const line of shownLines.value) {
    const label = line.lag
    if (!label) continue
    shapes.push({
      key: 'lag:' + line.id,
      tag: 'text',
      attrs: {
        id: label.id, class: { 'vw-gantt-lag': true, 'vw-is-highlighted': props.highlightedDependencyIds?.has(line.id) },
        x: label.x, y: label.y, 'text-anchor': label.anchor, 'aria-label': label.description,
      },
      text: label.text,
    })
  }
  return shapes
})

function barBox(bar: TimelineBar) {
  return intervalBox(rangeOf(bar))
}
/** Inline-start offset and width of an interval on the time axis; a milestone is 10 px wide around its time. */
function intervalBox(range: TimeRange) {
  return axisBox(axis.value.toX, range)
}
/** Canvas position of a preview interval in a displayed row and lane. */
function previewStyle(range: TimeRange, rowIndex: number, lane: number) {
  const box = intervalBox(range)
  return {
    [inlineSide.value]: canvasInset(box.left),
    width: `${box.width}px`,
    top: `${headerHeight.value + rowIndex * props.rowHeight + laneOffset(lane)}px`,
    height: `${barHeight.value}px`,
  }
}

function barStyle(bar: TimelineBar) {
  const box = barBox(bar)
  return {
    [inlineSide.value]: canvasInset(box.left),
    width: `${box.width}px`,
    height: `${barHeight.value}px`,
    top: `${laneTop(bar)}px`,
    ...rowShiftStyle(bar),
  }
}

function summaryStyle(summary: TimelineSummary) {
  const left = axis.value.toX(summary.start)
  return {
    [inlineSide.value]: canvasInset(left),
    width: `${Math.max(3, axis.value.toX(summary.end) - left)}px`,
  }
}

function baselineStyle(bar: TimelineBar, baseline: TimeRange, slot: number) {
  const left = axis.value.toX(baseline.start)
  const width = axis.value.toX(baseline.end) - left
  return {
    [inlineSide.value]: canvasInset(left - (width === 0 ? 1.5 : 0)),
    width: `${Math.max(3, width)}px`,
    top: `${laneTop(bar) + barHeight.value + baselineGeometry.value.offset(slot)}px`,
  }
}
const baselineText = computed<BaselineTextOptions>(() => ({
  label: props.baselineLabel ?? (id => id === timelineBaselineId ? messages.value.baseline! : id),
  formatTime: props.formatTime, formatVariance: props.formatVariance,
  start: messages.value.baselineStart!, finish: messages.value.baselineFinish!, duration: messages.value.baselineDuration!,
}))
type ShownBaseline = { key: string; className: string; style: Record<string, string>; title: string; set?: string }
/**
 * The baseline strips of a row inside the visible time window. With only `TimelineBar.baseline` (no named sets and no
 * `baselineIds`) each is drawn as a single baseline strip; otherwise one strip per selected set, with its slot class, set ID and
 * variance title.
 */
function shownBaselines(bars: readonly TimelineBar[]): ShownBaseline[] {
  const choice = baselineChoice.value
  if (!choice.described) {
    return bars.filter(bar => choice.ids.length && bar.baseline && intersectsWindow(bar.baseline, timeWindow.value)).map(bar => ({
      key: bar.id, className: 'vw-gantt-baseline', style: baselineStyle(bar, bar.baseline!, 0),
      title: `${baselineText.value.label(timelineBaselineId)} · ${bar.label} ${props.formatTime(bar.baseline!.start)}–${props.formatTime(bar.baseline!.end)}`,
    }))
  }
  const multiple = choice.ids.length > 1
  return bars.flatMap(bar => baselineStrips(bar, rangeOf(bar), choice, baselineText.value)
    .filter(strip => intersectsWindow(strip.range, timeWindow.value))
    .map(strip => ({
      key: bar.id + ':' + strip.id,
      className: multiple ? `vw-gantt-baseline vw-gantt-baseline-${strip.slot + 1}` : 'vw-gantt-baseline',
      style: baselineStyle(bar, strip.range, strip.slot),
      title: `${strip.label} · ${bar.label} ${strip.dates} · ${strip.variance}`,
      set: strip.id,
    })))
}

/** Measure the viewport, the label column and the scroll position. A viewport that did not change keeps its object. */
function syncViewport() {
  const el = scroller.value
  if (!el) return
  const labels = el.querySelector('.vw-gantt-corner')?.getBoundingClientRect().width ?? 154
  setViewport({ width: el.clientWidth, height: el.clientHeight, left: scrollStart(el), top: el.scrollTop, labels })
  measureLabelColumn()
}
/**
 * `scroll` events: only the scroll position. Sizes and the label column are measured by the ResizeObserver (and every
 * explicit `syncViewport`), so scrolling reads no layout beyond the scroll offsets.
 */
function syncScroll() {
  const el = scroller.value
  if (el) setViewport({ ...viewport.value, left: scrollStart(el), top: el.scrollTop })
}
function setViewport(next: typeof viewport.value) {
  const current = viewport.value
  if (next.width !== current.width || next.height !== current.height || next.left !== current.left || next.top !== current.top
    || next.labels !== current.labels) viewport.value = next
}

/** Width of the visible time area: the scroll viewport without the sticky label column. */
function timeAreaWidth(el: HTMLElement) {
  return Math.max(0, el.clientWidth - viewport.value.labels)
}

/** Change the zoom factor while keeping the time at `anchor` (pixels from the timeline's visible left edge) in place. */
async function applyZoom(next: number, anchor?: number) {
  const el = scroller.value
  if (!el) return
  const offset = anchor ?? timeAreaWidth(el) / 2
  const time = axis.value.toTime(scrollStart(el) + offset)
  zoom.value = Math.max(minZoom, Math.min(maxZoom, next))
  await nextTick()
  setScrollStart(el, axis.value.toX(time) - offset)
  syncViewport()
}

async function setZoom(factor: number) {
  if (!scroller.value || scrollingGesture()) return
  await applyZoom(zoom.value * factor)
}

// The centre time to keep when a preset chosen by the user takes effect. It is tagged with the chosen id, so a
// controlled parent that ignores the update neither resets the zoom nor leaves a stale centre for a later change.
let pendingPreset: { id: string; time: number } | undefined
function choosePreset(id: string) {
  const el = scroller.value
  if (scrollingGesture() || id === activePreset.value?.id) return
  pendingPreset = el
    ? { id, time: axis.value.toTime(scrollStart(el) + timeAreaWidth(el) / 2) }
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
  setScrollStart(el, axis.value.toX(pending.time) - timeAreaWidth(el) / 2)
  syncViewport()
})
watch([zoom, () => activePreset.value?.id], ([value, preset]) => {
  emit('zoom-change', preset === undefined ? { zoom: value } : { zoom: value, preset })
})

function editable(bar: TimelineBar) {
  return !props.readonly && Boolean(bar.editable) && bar.start >= bounds.value.start && bar.end <= bounds.value.end
}

/**
 * The bars of the in-flight pointer gesture or armed connection, or undefined when none is in flight. `fill` counts a
 * spreadsheet fill handle drag, which has no bars.
 */
function gestureInFlight(fill = true): { barIds: string[]; rowId?: string } | undefined {
  const active = gesture
  const ids = new Set<string>()
  if (active?.type === 'bar') for (const bar of active.group) ids.add(bar.id)
  if (active?.type === 'progress' || active?.type === 'constraint') ids.add(active.id)
  if (linkDraft.value) ids.add(linkDraft.value.fixed.bar)
  if (!ids.size && active?.type !== 'create' && active?.type !== 'row' && active?.type !== 'column' && !(fill && sheet.fill.value)) return undefined
  return active?.type === 'create' ? { barIds: [...ids], rowId: active.rowId } : { barIds: [...ids] }
}
/**
 * End every pointer gesture and armed connection, and report it through `edit-cancel` when one was in flight. With
 * `keepFill`, a spreadsheet fill handle drag goes on.
 */
function cancelGestures(reason: TimelineEditCancelReason, keepFill = false) {
  const info = gestureInFlight(!keepFill)
  resetGestures(keepFill)
  if (info) emit('edit-cancel', { reason, barIds: info.barIds })
}
/** Cancel everything in flight: gestures, an armed connection and an open cell editor. */
function cancelEdit(reason: TimelineEditCancelReason = 'api') {
  cancelGestures(reason)
  cancelCellEditor(reason)
}
/**
 * New source data or coordinates: `hidden` when the gesture's row is no longer displayed, otherwise `source-changed`.
 * A fill handle drag depends only on the displayed rows and the columns, so it is cancelled only with `fill`.
 */
function cancelForSource(fill = false) {
  const info = gestureInFlight(fill)
  if (!info) return resetGestures(!fill)
  const hidden = info.barIds.some(id => {
    const bar = barById.value.get(id)
    return bar !== undefined && !rowOrder.value.has(bar.rowId)
  }) || (info.rowId !== undefined && rowById.value.has(info.rowId) && !rowOrder.value.has(info.rowId))
  cancelGestures(hidden ? 'hidden' : 'source-changed', !fill)
}

/** Reset every pointer gesture and armed connection without reporting it; with `keepFill`, not a fill handle drag. */
function resetGestures(keepFill = false) {
  endGesture('bar')
  previews.value = undefined
  stopAutoScroll()
  cancelLink()
  cancelProgress()
  cancelCreate()
  cancelRowDrag()
  cancelColumnResize()
  cancelConstraint()
  clearCascade()
  endGesture('pinch')
  if (!keepFill) sheet.cancelFill()
}

/**
 * Whether a pointer owns a gesture: an edit, progress, link, create, row or column drag, a pinch or a spreadsheet fill
 * handle drag. `isPrimary` is per pointer type, so a mouse and a pen (or touch) can both be primary; every pointer
 * gesture start checks this.
 */
function pointerGestureActive(): boolean {
  return gesture !== undefined || Boolean(sheet.fill.value)
}
// Pointer events of the scroll viewport. The gestures capture the pointer on an element inside it, so their events
// bubble here; each handler ignores events of other pointers and gestures. Column separators handle their own events.
function movePointer(event: PointerEvent) {
  moveTouch(event)
  moveEdit(event)
  moveLink(event)
  moveProgress(event)
  moveConstraint(event)
  moveCreate(event)
  moveRowDrag(event)
}
/** `pointerup` and `pointercancel`: end a touch of a pinch, then finish (or cancel) the gesture of the pointer. */
function releasePointer(event: PointerEvent) {
  endTouch(event)
  finishGesture(event)
}
/** Finish the gesture of the pointer on release; any other event, such as a lost capture, cancels it. */
function finishGesture(event: PointerEvent) {
  finishEdit(event)
  finishLink(event)
  finishProgress(event)
  finishConstraint(event)
  finishCreate(event)
  finishRowDrag(event)
}
/** Whether a gesture owns the pointer or keyboard: a pointer gesture or an armed connection. */
function gestureActive(): boolean {
  return pointerGestureActive() || Boolean(linkDraft.value)
}

/** The rejection reason of a validator result: `fallback` for `false`, the returned string, or undefined to accept. */
function rejection(result: boolean | string | void, fallback = messages.value.rejected) {
  return result === false ? fallback : typeof result === 'string' ? result : undefined
}
/**
 * Announce the outcome of a proposal in the live region before it is emitted: the rejection reason of the validator
 * result, or nothing when it is accepted. Returns the reason.
 */
function settle(result: boolean | string | void, fallback?: string) {
  const reason = rejection(result, fallback)
  notice.value = reason ?? ''
  return reason
}

/** Emit `edit` or `edit-rejected`; returns whether `edit` was emitted. */
function propose(change: TimelineEdit) {
  if (change.before.start === change.after.start && change.before.end === change.after.end && !change.row) return false
  const reason = settle(props.validateEdit?.(change))
  if (reason !== undefined) emit('edit-rejected', change, reason)
  else emit('edit', change)
  return reason === undefined
}

/** A single change keeps the `edit` contract; several changes form one atomic `edits` batch. Returns whether `edit` or `edits` was emitted. */
function proposeAll(changes: TimelineEdit[]) {
  if (changes.length <= 1) return changes[0] ? propose(changes[0]) : false
  const reason = props.validateEdits
    ? rejection(props.validateEdits(changes))
    : changes.reduce<string | undefined>((found, change) => found ?? rejection(props.validateEdit?.(change)), undefined)
  notice.value = reason ?? ''
  if (reason !== undefined) emit('edits-rejected', changes, reason)
  else emit('edits', changes)
  return reason === undefined
}

// Cascade (`cascade`): follow-on changes of other bars, drawn as ghosts during a drag and proposed with the edit.
const cascadeGhosts = shallowRef<readonly TimelineEdit[]>()
let cascadeKey: string | undefined
let cascadeResult: CascadeResult | undefined

/** The follow-on changes that `cascade` proposes with these primary changes. */
function cascadeFor(changes: readonly TimelineEdit[]): CascadeResult {
  return cascadeChanges(changes, props.cascade!, barById.value, messages.value.rejected)
}
/** Call `cascade` again only when the snapped primary changes differ from the previous call. */
function updateCascade(changes: readonly TimelineEdit[]) {
  const key = cascadeChangeKey(changes)
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
  if (!bar || index === undefined || !inRowWindow(index, rowWindow.value) || !intersectsWindow(change.after, timeWindow.value)) return []
  return [{ id: change.id, style: previewStyle(change.after, index, bar.lane ?? 0) }]
}))

/**
 * Propose move and resize changes. With `cascade`, the follow-on changes join the primary ones (which come first) in
 * one `edits` batch; when there are none, a single change keeps the `edit` contract.
 */
function proposeEdits(changes: readonly TimelineEdit[], cascaded?: CascadeResult): boolean {
  const primary = changes.filter(change => change.row || change.before.start !== change.after.start || change.before.end !== change.after.end)
  if (!primary.length) return false
  if (!props.cascade) return proposeAll(primary)
  const result = cascaded ?? cascadeFor(primary)
  if ('error' in result) {
    notice.value = result.error
    if (primary.length === 1) emit('edit-rejected', primary[0]!, result.error)
    else emit('edits-rejected', primary, result.error)
    return false
  }
  return proposeAll([...primary, ...result.changes])
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
  if (!editable(bar) || !event.isPrimary || event.button !== 0 || gestureActive()) return
  const target = event.target as HTMLElement
  const mode = (target.closest<HTMLElement>('[data-edit-mode]')?.dataset.editMode ?? 'move') as EditMode
  if (mode !== 'move' && bar.end - bar.start < minimum.value) return
  const control = event.currentTarget as HTMLElement
  control.focus({ preventScroll: true })
  gesture = {
    type: 'bar', id: bar.id, pointerId: event.pointerId,
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
  if (!gestureOf('bar', event)) return
  lastClientX = event.clientX
  lastClientY = event.clientY
  updatePreview()
}

function updatePreview() {
  const drag = gestureOf('bar')
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
  const bar = gesture?.type === 'bar'
  if (!scrollingGesture() || !el) return
  if (bar ? previews.value : createPreview.value) {
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
        if (bar) updatePreview()
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
  const drag = gestureOf('bar', event)
  if (!drag) return
  if (event.type !== 'pointerup') return cancelGestures('pointer-cancel')
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
  resetGestures()
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
  emit('select', bar.id, { dragged })
  if (!dragged) activateTarget(barTarget(bar.id), clickSource(event))
}

function editWithKeys(event: KeyboardEvent, bar: TimelineBar) {
  if (event.key === 'Escape') return cancelEdit('escape')
  if (props.contextMenu && isMenuKey(event)) return keyboardContextMenu(event, { kind: 'bar', id: bar.id }, bar.rowId)
  if (props.deletable && (event.key === 'Delete' || event.key === 'Backspace')) return deleteFrom(event, bar)
  // Like the other keyboard paths, keys do not edit while a pointer gesture or an armed connection is in flight.
  if (!editable(bar) || gestureActive()) return
  if (props.rowDraggable && (event.key === 'ArrowUp' || event.key === 'ArrowDown') && !event.altKey && !event.shiftKey) {
    const group = movingGroup(bar)
    const shift = rowShiftFor(group, event.key === 'ArrowUp' ? -1 : 1)
    event.preventDefault()
    if (!shift) return
    // Focus follows the bar to its new row only after a proposal; a rejected one leaves nothing to follow.
    if (proposeEdits(buildChanges(group, group, 'move', 'keyboard', shift))) pendingFocus = bar.id
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
  focusTarget(event, barTarget(bar.id))
}
function onBarBlur(id: string) {
  blurTarget(barTarget(id))
  if (focusedBarId.value === id) focusedBarId.value = undefined
  if (pendingReveal === id) pendingReveal = undefined
  // An ignored keyboard row move must not pull focus back to the bar on a later, unrelated update of `bars`.
  if (pendingFocus === id) pendingFocus = undefined
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
  const reason = settle(props.validateBarsDelete?.(ids))
  if (reason !== undefined) {
    emit('bars-delete-rejected', ids, reason)
  } else {
    pendingDelete = true
    emit('bars-delete', ids)
  }
}

/** Scroll horizontally only when the bar lies outside the visible timeline area. */
function scrollBarIntoInlineView(id: string) {
  const el = scroller.value
  const bar = barById.value.get(id)
  if (!el || !bar) return
  const left = axis.value.toX(bar.start)
  const right = Math.max(left, axis.value.toX(bar.end))
  const visibleWidth = timeAreaWidth(el)
  const margin = 16
  const scrolled = scrollStart(el)
  if (left < scrolled) setScrollStart(el, Math.max(0, left - margin))
  else if (right > scrolled + visibleWidth) setScrollStart(el, Math.max(0, right - visibleWidth + margin))
  syncViewport()
}
function focusBar(id: string) {
  dataElement('vwBar', id)?.focus({ preventScroll: true })
}
/** Scroll vertically only when a displayed row lies outside the visible body. */
function scrollRowIntoView(el: HTMLElement, index: number) {
  const top = rowScrollTop(index, props.rowHeight, el.scrollTop, Math.max(0, el.clientHeight - headerHeight.value))
  if (top !== undefined) el.scrollTop = top
}
// After a keyboard edit, wait for the parent to apply it (new bars), then keep the bar in view.
watch(() => props.bars, async () => {
  const id = pendingReveal
  const moved = pendingFocus
  const deleted = pendingDelete
  const unconstrained = pendingConstraintFocus
  pendingReveal = undefined
  pendingFocus = undefined
  pendingDelete = false
  pendingConstraintFocus = undefined
  if (focusedBarId.value !== undefined && !barById.value.has(focusedBarId.value)) focusedBarId.value = undefined
  if (deleted) {
    // A removed bar takes keyboard focus with it; keep focus in the chart region.
    await nextTick()
    const el = scroller.value
    const active = document.activeElement
    if (el && (!active || active === document.body || !active.isConnected)) el.focus({ preventScroll: true })
  }
  if (unconstrained !== undefined) {
    // A removed constraint takes its handle, and keyboard focus, with it; return focus to the bar.
    await nextTick()
    const active = document.activeElement
    if (!active || active === document.body || !active.isConnected) focusBar(unconstrained)
  }
  if (id === undefined && moved === undefined) return
  await nextTick()
  // A bar that changed rows is a new element; restore keyboard focus to it.
  if (moved !== undefined) {
    const bar = barById.value.get(moved)
    const index = bar && rowOrder.value.get(bar.rowId)
    const el = scroller.value
    if (el && index !== undefined) {
      scrollRowIntoView(el, index)
      syncViewport()
      await nextTick()
      focusBar(moved)
    }
  }
  if (id !== undefined && focusedBarId.value === id) scrollBarIntoInlineView(id)
})

// Row hierarchy moves (`rowsReorderable`). Each row heading gets a move handle: Alt+Up/Down move the row among its
// siblings, Alt+Shift+Left/Right outdent or indent it in the visual direction, and a pointer drag previews a drop
// position between rows. Proposals are emitted as `row-move`; the parent applies them with `moveTimelineRow`.
const rowHandlesVisible = computed(() => Boolean(props.rowsReorderable) && !props.readonly && !validationError.value)
/** Children of each parent row (`undefined` for the roots) in tree order. */
const rowChildren = computed(() => rowChildList(tree.value))
const rowById = computed(() => new Map(tree.value.map(item => [item.row.id, item.row])))
function rowPosition(row: TimelineRow) {
  return rowPositionIn(row, rowChildren.value)
}
let pendingRowFocus: string | undefined
function proposeRowMove(change: TimelineRowMove) {
  if (change.before.parentId === change.after.parentId && change.before.index === change.after.index) return
  const reason = settle(props.validateRowMove?.(change), messages.value.rowMoveRejected!)
  if (reason !== undefined) return emit('row-move-rejected', change, reason)
  pendingRowFocus = change.id
  emit('row-move', change)
}
function rowHandleKeys(event: KeyboardEvent, row: TimelineRow) {
  if (!rowHandlesVisible.value) return
  const after = rowMoveForKey(event, row, rowChildren.value, rowById.value, rtl.value)
  if (after === 'ignore') return
  event.preventDefault()
  if (!after || gestureActive()) return
  proposeRowMove({ id: row.id, before: rowPosition(row), after, source: 'keyboard' })
}
const rowDrop = shallowRef<RowDrop>()
function startRowDrag(event: PointerEvent, row: TimelineRow) {
  if (!rowHandlesVisible.value || gestureActive() || !event.isPrimary || event.button !== 0) return
  const target = event.currentTarget as HTMLElement
  // Keep a mouse drag from selecting text; focus the handle so that Escape cancels.
  if (event.pointerType !== 'touch') event.preventDefault()
  target.focus({ preventScroll: true })
  hideTooltip()
  gesture = { type: 'row', id: row.id, pointerId: event.pointerId, target, y: event.clientY, moved: false }
  target.setPointerCapture(event.pointerId)
}
/** The drop position under a client y coordinate (`rowDropAt` of the row move helpers). */
function rowDropUnder(id: string, clientY: number): RowDrop | undefined {
  const rows = displayedRows.value
  if (!canvas.value || !rows.length) return undefined
  const y = clientY - canvas.value.getBoundingClientRect().top - headerHeight.value
  return rowDropAt(id, y, rows, props.rowHeight, rowChildren.value, rowById.value, collapsed.value)
}
function moveRowDrag(event: PointerEvent) {
  const active = gestureOf('row', event)
  if (!active) return
  if (!active.moved && Math.abs(event.clientY - active.y) < 4) return
  active.moved = true
  rowDrop.value = rowDropUnder(active.id, event.clientY)
}
function cancelRowDrag() {
  endGesture('row')
  rowDrop.value = undefined
}
function finishRowDrag(event: PointerEvent) {
  const active = gestureOf('row', event)
  if (!active) return
  if (event.type !== 'pointerup') return cancelGestures('pointer-cancel')
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
    width: canvasInset(axis.value.width - indent),
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
  scrollRowIntoView(el, index)
  syncViewport()
  await nextTick()
  dataElement('vwRowHandle', id)?.focus({ preventScroll: true })
})

// Dependency creation and reconnection. A draft keeps one fixed bar end while the user picks the other one.
type LinkEnd = { bar: string; end: TimelineBarEnd }
type LinkDraft = { fixed: LinkEnd; role: 'from' | 'to'; dependency?: TimelineDependency }
const linkDraft = ref<LinkDraft>()
const linkPoint = ref<{ x: number; y: number }>()
let skipLinkClick = false
const localDependency = ref<string>()
const activeDependencyId = computed(() => props.selectedDependencyId ?? localDependency.value)
const linkHandlesVisible = computed(() => !props.readonly && !validationError.value && (props.connectable || Boolean(linkDraft.value?.dependency)))
const dependencyTargets = computed(() => (props.connectable || props.reconnectable) && !validationError.value)

function linkKey(end: LinkEnd) {
  return JSON.stringify([end.bar, end.end])
}
function linkPressed(id: string, end: TimelineBarEnd) {
  const fixed = linkDraft.value?.fixed
  return Boolean(fixed && fixed.bar === id && fixed.end === end)
}
function linkHandleName(id: string, label: string, end: TimelineBarEnd) {
  const action = linkDraft.value && !linkPressed(id, end) ? messages.value.connectTo : messages.value.connectFrom
  return `${action} ${end === 'start' ? messages.value.startOf : messages.value.finishOf} ${label}`
}
function linkHandleStyle(bar: TimelineBar, end: TimelineBarEnd) {
  const box = barBox(bar)
  const x = linkHandleOffset(box.left, box.width, end, axis.value.width)
  return {
    [inlineSide.value]: canvasInset(x),
    top: `${laneTop(bar) + barHeight.value / 2 - 6}px`,
  }
}
/** Body coordinates of a bar end, relative to the time axis origin and the first row. */
function linkOrigin(end: LinkEnd) {
  const bar = barById.value.get(end.bar)
  const index = bar && rowOrder.value.get(bar.rowId)
  if (!bar || index === undefined) {
    // A summary row end (`summaryDependencies`): the edge of its rollup bar.
    const anchor = summaryAnchors.value.get(end.bar)
    if (!anchor) return undefined
    const time = end.end === 'start' ? anchor.range.start : anchor.range.end
    return { x: axis.value.toX(time), y: anchor.index * props.rowHeight + props.rowHeight / 2 }
  }
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
  gesture = { type: 'link', pointerId: event.pointerId, target, x: event.clientX, y: event.clientY }
  target.focus({ preventScroll: true })
  target.setPointerCapture(event.pointerId)
}
function startLink(event: PointerEvent, id: string, end: TimelineBarEnd) {
  skipLinkClick = false
  if (!props.connectable || !event.isPrimary || event.button !== 0 || gestureActive()) return
  linkDraft.value = { fixed: { bar: id, end }, role: 'to' }
  captureLink(event)
}
function moveLink(event: PointerEvent) {
  const linkDrag = gestureOf('link', event)
  if (!linkDrag || !canvas.value) return
  if (!linkPoint.value && Math.hypot(event.clientX - linkDrag.x, event.clientY - linkDrag.y) < 4) return
  const rect = canvas.value.getBoundingClientRect()
  linkPoint.value = { x: timeAreaOffset(event.clientX, rect), y: event.clientY - rect.top - headerHeight.value }
}
function clearLinkCapture() {
  const ended = endGesture('link')
  linkPoint.value = undefined
  return ended
}
function cancelLink() {
  if (clearLinkCapture()) skipLinkClick = true
  linkDraft.value = undefined
}
function finishLink(event: PointerEvent) {
  if (!gestureOf('link', event)) return
  if (event.type !== 'pointerup') return cancelGestures('pointer-cancel')
  moveLink(event)
  const dragged = Boolean(linkPoint.value)
  clearLinkCapture()
  skipLinkClick = true
  // A press without movement leaves the end armed for a second click or key.
  if (!dragged) return
  const element = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-vw-link], [data-vw-bar], [data-vw-summary]')
  if (!element || !scroller.value?.contains(element)) {
    linkDraft.value = undefined
    return
  }
  if (element.dataset.vwLink) {
    const [bar, end] = JSON.parse(element.dataset.vwLink) as [string, TimelineBarEnd]
    return completeLink({ bar, end })
  }
  // Dropping on a bar body, or on a rollup bar with `summaryDependencies`, picks its nearer end.
  const rect = element.getBoundingClientRect()
  const firstHalf = event.clientX < rect.left + rect.width / 2
  completeLink({ bar: element.dataset.vwBar ?? element.dataset.vwSummary!, end: firstHalf !== rtl.value ? 'start' : 'finish' })
}
function activateLink(id: string, end: TimelineBarEnd, event: MouseEvent | KeyboardEvent) {
  if (event.type === 'click' && skipLinkClick) {
    skipLinkClick = false
    return
  }
  if (linkDraft.value) completeLink({ bar: id, end })
  else if (props.connectable) linkDraft.value = { fixed: { bar: id, end }, role: 'to' }
}
function completeLink(target: LinkEnd) {
  const pending = linkDraft.value
  linkDraft.value = undefined
  notice.value = ''
  if (props.readonly || !pending || pending.fixed.bar === target.bar
    || !(barById.value.has(target.bar) || summaryAnchors.value.has(target.bar))) return
  const [from, to] = pending.role === 'from' ? [target, pending.fixed] : [pending.fixed, target]
  const connection: TimelineConnection = { from: from.bar, to: to.bar, type: dependencyTypeForEnds(from.end, to.end) }
  const dependency = pending.dependency
  const before: TimelineConnection | undefined = dependency && { from: dependency.from, to: dependency.to, type: dependency.type ?? 'FS' }
  if (before && before.from === connection.from && before.to === connection.to && before.type === connection.type) return
  // A reconnection keeps the dependency's lag; a new connection has none.
  if (before && dependency?.lag) {
    before.lag = dependency.lag
    connection.lag = dependency.lag
  }
  const reason = settle(props.validateConnection?.(connection, dependency?.id), messages.value.connectionRejected ?? messages.value.rejected)
  if (reason !== undefined) {
    emit('connect-rejected', connection, reason)
  } else if (dependency && before) {
    emit('reconnect', { id: dependency.id, before, after: connection })
  } else {
    emit('connect', connection)
  }
}
function selectDependency(id: string, source: ViewTargetSource = 'pointer') {
  localDependency.value = id
  emit('update:selectedDependencyId', id)
  emit('dependency-select', id)
  activateTarget(dependencyTarget(id), source)
}
function dependencyKeys(event: KeyboardEvent, id: string) {
  if (props.contextMenu && isMenuKey(event)) {
    keyboardContextMenu(event, { kind: 'dependency', id })
  } else if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    selectDependency(id, 'keyboard')
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    // Selection stays possible when readonly, like bar selection; deleting is an edit proposal.
    if (!props.readonly) emit('dependency-delete', id)
  }
}
/**
 * Buttons placed on the canvas: the two reconnect handles of the selected dependency and, with `summaryDependencies`
 * and link handles shown, the link handles of the displayed rollup bars. They share one template loop, so a chart
 * without `summaryDependencies` renders exactly the markup it did before. The template reads `dependency` and `link`
 * of either kind for the data attributes.
 */
type CanvasHandle = {
  key: string; className: string | (string | Record<string, boolean>)[]; style: Record<string, string>; label: string; pressed: boolean
} & (
  | { kind: 'reconnect'; dependency: TimelineDependency; end: 'from' | 'to'; link?: undefined }
  | { kind: 'link'; link: LinkEnd; dependency?: undefined }
)
const reconnectHandles = computed<CanvasHandle[]>(() => {
  const id = activeDependencyId.value
  if (!props.reconnectable || props.readonly || id === undefined) return []
  const line = shownLines.value.find(item => item.id === id)
  if (!line) return []
  const name = dependencyName(line.dependency)
  const place = (x: number, y: number) => ({ [inlineSide.value]: canvasInset(x - 6), top: `${headerHeight.value + y - 6}px` })
  const pressed = (end: 'from' | 'to') => Boolean(linkDraft.value?.dependency && linkDraft.value.role === end)
  return [
    {
      kind: 'reconnect', key: 'from', className: 'vw-gantt-reconnect-handle', style: place(line.x1, line.y1),
      label: `${messages.value.reconnectSource} ${name}`, pressed: pressed('from'), dependency: line.dependency, end: 'from',
    },
    {
      kind: 'reconnect', key: 'to', className: 'vw-gantt-reconnect-handle', style: place(line.x2, line.y2),
      label: `${messages.value.reconnectTarget} ${name}`, pressed: pressed('to'), dependency: line.dependency, end: 'to',
    },
  ]
})
const summaryLinkHandles = computed<CanvasHandle[]>(() => {
  if (!props.summaryDependencies || !linkHandlesVisible.value) return []
  const handles: CanvasHandle[] = []
  for (const [id, anchor] of summaryAnchors.value) {
    if (!inRowWindow(anchor.index, rowWindow.value) || !intersectsWindow(anchor.range, timeWindow.value)) continue
    const left = axis.value.toX(anchor.range.start)
    const width = Math.max(3, axis.value.toX(anchor.range.end) - left)
    const label = rowById.value.get(id)?.label ?? id
    for (const end of linkEnds) {
      const x = linkHandleOffset(left, width, end, axis.value.width)
      handles.push({
        kind: 'link', key: linkKey({ bar: id, end }),
        className: ['vw-gantt-link-handle', `vw-is-${end}`, { 'vw-is-active': linkPressed(id, end) }],
        style: {
          [inlineSide.value]: canvasInset(x),
          top: `${headerHeight.value + anchor.index * props.rowHeight + props.rowHeight / 2 - 6}px`,
        },
        label: linkHandleName(id, label, end), pressed: linkPressed(id, end), link: { bar: id, end },
      })
    }
  }
  return handles
})
const canvasHandles = computed(() => summaryLinkHandles.value.length ? [...reconnectHandles.value, ...summaryLinkHandles.value] : reconnectHandles.value)
function pressCanvasHandle(item: CanvasHandle, event: PointerEvent) {
  if (item.kind === 'reconnect') reconnectDependency(item.dependency, item.end, event)
  else startLink(event, item.link.bar, item.link.end)
}
function clickCanvasHandle(item: CanvasHandle, event: MouseEvent) {
  if (item.kind === 'reconnect') clickReconnect(item.dependency, item.end)
  else activateLink(item.link.bar, item.link.end, event)
}
function canvasHandleKeys(item: CanvasHandle, event: KeyboardEvent) {
  if (item.kind === 'reconnect') reconnectDependency(item.dependency, item.end)
  else activateLink(item.link.bar, item.link.end, event)
}
/** With link handles shown, a rollup bar that a dragged link can be dropped on carries its row ID. */
function summaryDropId(id: string) {
  return linkHandlesVisible.value && summaryAnchors.value.has(id) ? id : undefined
}
function reconnectDependency(dependency: TimelineDependency, end: 'from' | 'to', event?: PointerEvent) {
  if (event && (!event.isPrimary || event.button !== 0 || pointerGestureActive())) return
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
  // A cascading bar drag previews follow-on changes computed from the old dependencies; it is stale source data.
  if (gesture?.type === 'bar' && props.cascade) cancelGestures('source-changed')
  else cancelLinkDraft('source-changed')
  if (localDependency.value !== undefined && !props.dependencies.some(dep => dep.id === localDependency.value)) localDependency.value = undefined
})
watch(() => [props.connectable, props.reconnectable], () => cancelLinkDraft('source-changed'))
// A draft fixed at a summary row (`summaryDependencies`) is stale once that row is no longer a dependency end, for
// example when `summaryDependencies` or `showSummaries` is turned off.
watch(summaryAnchors, anchors => {
  const fixed = linkDraft.value?.fixed
  if (fixed && !barById.value.has(fixed.bar) && !anchors.has(fixed.bar)) cancelLinkDraft('source-changed')
})
/** Cancel a connection draft only, reporting it when one was armed or dragged. */
function cancelLinkDraft(reason: TimelineEditCancelReason) {
  const fixed = linkDraft.value?.fixed
  cancelLink()
  if (fixed) emit('edit-cancel', { reason, barIds: [fixed.bar] })
}

// Two-pointer touch pinch zooms the time axis around the midpoint. A second touch cancels any in-flight edit.
const touches = new Map<number, { x: number; y: number }>()
function touchSpan() {
  const [a, b] = [...touches.values()]
  return { distance: Math.hypot(a!.x - b!.x, a!.y - b!.y), x: (a!.x + b!.x) / 2 }
}
function trackTouch(event: PointerEvent) {
  if (!props.pinchZoom || event.pointerType !== 'touch') return
  touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
  const el = scroller.value
  if (touches.size !== 2 || !el) return
  cancelGestures('pointer-cancel')
  hideTooltip()
  const span = touchSpan()
  gesture = { type: 'pinch', distance: Math.max(1, span.distance), zoom: zoom.value, anchor: Math.max(0, timeAreaOffset(span.x, el.getBoundingClientRect())) }
}
function moveTouch(event: PointerEvent) {
  if (!touches.has(event.pointerId)) return
  touches.set(event.pointerId, { x: event.clientX, y: event.clientY })
  const pinch = gestureOf('pinch')
  if (!pinch || touches.size !== 2) return
  event.preventDefault()
  const next = Math.max(minZoom, Math.min(maxZoom, pinch.zoom * touchSpan().distance / pinch.distance))
  if (Math.abs(next - zoom.value) > 0.001) void applyZoom(next, pinch.anchor)
}
function endTouch(event: PointerEvent) {
  touches.delete(event.pointerId)
  if (touches.size < 2) endGesture('pinch')
}
watch(() => props.pinchZoom, () => {
  touches.clear()
  endGesture('pinch')
})
// `touch-action: pan-x pan-y` keeps one-finger scrolling native but lets the browser take over a two-finger pan,
// which ends the pinch with `pointercancel`. A non-passive `touchmove` listener refuses that takeover while two
// touches are down; single-touch moves stay untouched.
function holdPinch(event: TouchEvent) {
  if (props.pinchZoom && event.touches.length >= 2 && event.cancelable) event.preventDefault()
}

// Ctrl+wheel and Meta+wheel (`wheelZoom`) zoom the time axis around the pointer. Desktop trackpad pinches arrive as
// Ctrl+wheel with small deltas, so the factor follows deltaY and is clamped per event to one zoom button step. The
// listener is non-passive, so it is attached only while the prop is set; a plain wheel is never prevented.
const wheelStep = 1.35
let wheelTarget: HTMLElement | undefined
/** The time and anchor of a zoom whose scroll position is not applied yet; later events in the same tick build on it. */
let wheelPending: { time: number; offset: number } | undefined
function wheelDelta(event: WheelEvent, el: HTMLElement) {
  if (event.deltaMode === 1) return event.deltaY * 16
  if (event.deltaMode === 2) return event.deltaY * el.clientHeight
  return event.deltaY
}
async function zoomWithWheel(event: WheelEvent) {
  if (!(event.ctrlKey || event.metaKey) || !props.wheelZoom) return
  const el = scroller.value
  if (!el || validationError.value) return
  // Keep the browser from zooming the page, also at the zoom limits.
  if (event.cancelable) event.preventDefault()
  const delta = wheelDelta(event, el)
  if (!delta) return
  // A zoom changes the coordinate system, as a pinch does: in-flight gestures end without a proposal.
  if (gestureActive()) cancelGestures('source-changed')
  hideTooltip()
  const factor = Math.max(1 / wheelStep, Math.min(wheelStep, Math.exp(-delta * Math.log(wheelStep) / 100)))
  const next = Math.max(minZoom, Math.min(maxZoom, zoom.value * factor))
  if (Math.abs(next - zoom.value) < 1e-6) return
  const offset = Math.max(0, Math.min(timeAreaWidth(el), timeAreaOffset(event.clientX, el.getBoundingClientRect())))
  const pending = wheelPending
  // Until a pending zoom has scrolled, its anchor time defines where the axis will be.
  const time = pending
    ? axis.value.toTime(axis.value.toX(pending.time) - pending.offset + offset)
    : axis.value.toTime(scrollStart(el) + offset)
  zoom.value = next
  const mine = wheelPending = { time, offset }
  await nextTick()
  if (wheelPending !== mine) return
  wheelPending = undefined
  setScrollStart(el, axis.value.toX(time) - offset)
  syncViewport()
}
function syncWheelListener() {
  const el = props.wheelZoom && mounted ? scroller.value : undefined
  if (el === wheelTarget) return
  wheelTarget?.removeEventListener('wheel', zoomWithWheel)
  wheelTarget = el
  wheelTarget?.addEventListener('wheel', zoomWithWheel, { passive: false })
}
watch(() => props.wheelZoom, syncWheelListener, { flush: 'post' })

// A new source interval or coordinate system invalidates an in-flight gesture.
watch([
  () => props.bars, () => props.rows, () => props.collapsedIds, localCollapsed, () => props.headerBands, () => props.columns, () => stableRange.value,
  () => props.scale, () => props.pixelsPerUnit, () => props.snap, () => props.readonly, () => stableEditBounds.value, () => props.minDuration,
  () => props.rowHeight, () => props.laneCount, () => props.autoScroll, () => barHeight.value,
  activePreset, () => props.multiSelect ? props.selectedIds : undefined, () => props.multiSelect, () => props.rowDraggable,
  () => props.progressEditable, () => props.progressStep, () => props.createDuration, () => props.rowsReorderable,
  () => props.columnsResizable, () => props.labelWidth, () => props.minColumnWidth, () => props.maxColumnWidth,
  () => props.constraintsEditable,
], () => cancelForSource())
// A new zoom factor (buttons, presets, Ctrl+wheel, fitToBars) maps pointer positions to other times, so every gesture
// that previews times ends with `source-changed`. A pinch changes the zoom itself, and row, column and fill drags do
// not depend on the time axis; an armed keyboard connection has no pointer position and stays armed.
watch(zoom, () => {
  if (gesture && gesture.type !== 'pinch' && gesture.type !== 'row' && gesture.type !== 'column') cancelGestures('source-changed')
})

// Column resizing (`columnsResizable`). A separator at the inline-end edge of each header cell previews pointer
// drags and proposes keyboard steps; the parent accepts `column-resize` by setting the column width or `labelWidth`.
const minColumnSize = computed(() => props.minColumnWidth ?? 48)
const maxColumnSize = computed(() => Math.max(minColumnSize.value, props.maxColumnWidth ?? 800))
/** The rendered width of the row label column, read from `--vw-row-label-width` after mounting. */
const measuredLabelWidth = ref<number>()
const columnResize = shallowRef<{ id: string; width: number }>()
function measureLabelColumn() {
  if (!props.columnsResizable || columnResize.value || !root.value) return
  const width = parseFloat(getComputedStyle(root.value).getPropertyValue('--vw-row-label-width'))
  measuredLabelWidth.value = Number.isFinite(width) && width > 0 ? width : undefined
}
watch(() => props.columnsResizable, () => { if (mounted) measureLabelColumn() })
function clampColumnWidth(width: number) {
  return clampWidth(width, minColumnSize.value, maxColumnSize.value)
}
function shownColumnWidth(column: TimelineColumn<R>) {
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
  /** Sort and filter controls (`sortableColumns`, `filterableColumns`); absent keeps the plain header cell. */
  controls?: HeaderControls
}
function handleCell(handle: ResizeHandle): HeaderCell {
  const pointer = (event: Event) => event as PointerEvent
  return {
    key: '\u0000resize:' + handle.id,
    className: columnResize.value?.id === handle.id ? 'vw-column-resize vw-is-active' : 'vw-column-resize',
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
    const controls = validationError.value ? undefined : headerControls(column.id, column.label, column)
    cells.push({
      key: column.id, className: controls ? 'vw-extra-column vw-header-controls' : 'vw-extra-column', style: { width: shownColumnWidth(column) + 'px' },
      attrs: controls?.attrs ?? {}, on: controls ? headerControlEvents(controls) : {}, text: column.label, ...(controls ? { controls } : {}),
    })
    if (handles[index + 1]) cells.push(handleCell(handles[index + 1]!))
  })
  return cells
})

// Header sorting and filtering (`sortableColumns`, `filterableColumns`). The header shows the controlled `sort` and
// `filters` and proposes changes; the parent reorders or filters the rows (for example with `useTimelineView`), and the
// new rows cancel an in-flight gesture like any other source change. `sortableIds` and `filterableIds` are defined
// with the validation above.
interface HeaderControls {
  id: string
  label: string
  sortable: boolean
  filterable: boolean
  direction?: TimelineViewSort['direction']
  filter?: TimelineViewFilter
  filtered: boolean
  attrs: Record<string, string>
  choices?: readonly { value: string | number; label?: string }[]
}
function headerControls(id: string, label: string, column?: TimelineColumn<R>): HeaderControls | undefined {
  const sortable = sortableIds.value.has(id), filterable = filterableIds.value.has(id)
  if (!sortable && !filterable) return undefined
  // Every rule of the sort shows its direction, not only the first one.
  const direction = props.sort?.find(rule => rule.ruleId === id)?.direction
  const filter = props.filters?.find(item => item.columnId === id)
  // The header is not a table row, so the sort state is part of the sort button's name instead of `aria-sort`.
  const attrs: Record<string, string> = { 'data-vw-header': id }
  const choices = column?.field?.kind === 'select' ? column.field.choices : undefined
  return { id, label, sortable, filterable, direction, filter, filtered: filterActive(filter), attrs, ...(choices ? { choices } : {}) }
}
const labelHeader = computed(() => validationError.value ? undefined : headerControls(timelineLabelColumnId, messages.value.rows))
const labelHeaderKey = '\u0000header:' + timelineLabelColumnId
/** `headerCells`, after the label column's own header when that has controls. */
const headerList = computed<HeaderCell[]>(() => {
  const controls = labelHeader.value
  if (!controls) return headerCells.value
  return [{ key: labelHeaderKey, className: 'vw-name-column vw-header-controls', style: {}, attrs: controls.attrs, on: headerControlEvents(controls), text: messages.value.rows, controls }, ...headerCells.value]
})
/**
 * Text typed into a filter box. Text being composed with an input method is proposed once, when the composition ends.
 * The box shows the applied filter: once the parent has handled the proposal, text it did not apply is replaced by the
 * applied text, as the value-list checkboxes are. Text that differs from it only in surrounding whitespace is left as
 * typed, since matching trims it anyway.
 */
function filterText(controls: HeaderControls, event: Event) {
  if ((event as InputEvent).isComposing) return
  const input = event.target as HTMLInputElement
  const id = controls.id
  proposeFilter(id, { text: input.value })
  void nextTick(() => {
    const applied = props.filters?.find(filter => filter.columnId === id)?.text ?? ''
    if (input.isConnected && input.value.trim() !== applied.trim()) input.value = applied
  })
}
function clearFilter(controls: HeaderControls) {
  proposeFilter(controls.id, { text: '', values: null })
  headerCellOf(controls.id)?.querySelector<HTMLInputElement>('.vw-column-filter-popover input[type="search"]')?.focus({ preventScroll: true })
}
const sortGlyph = (direction: TimelineViewSort['direction'] | undefined) => direction === 'asc' ? '▲' : direction === 'desc' ? '▼' : '↕'
function toggleSort(id: string) {
  emit('update:sort', nextTimelineSort(props.sort ?? [], id))
}
/** "Sort by Finish", with the applied direction in parentheses: "Sort by Finish (ascending)". */
function sortButtonName(controls: HeaderControls) {
  const name = `${messages.value.sortBy} ${controls.label}`
  const direction = controls.direction === 'asc' ? messages.value.sortedAscending : controls.direction === 'desc' ? messages.value.sortedDescending : undefined
  return direction ? `${name} (${direction})` : name
}
const filterName = (controls: HeaderControls) => `${messages.value.filterBy} ${controls.label}`
const filterButtonName = (controls: HeaderControls) => filterName(controls) + (controls.filtered ? ` (${messages.value.filtered})` : '')
function proposeFilter(id: string, patch: { text?: string; values?: (string | number)[] | null }) {
  emit('update:filters', withColumnFilter(props.filters ?? [], id, patch))
}
/** Whether a value-list choice is shown: every choice is while the filter has no value list. */
function choiceShown(controls: HeaderControls, value: string | number) {
  return !controls.filter?.values || controls.filter.values.includes(value)
}
function toggleChoice(controls: HeaderControls, value: string | number, event: Event) {
  const all = controls.choices!.map(choice => choice.value)
  const shown = all.filter(item => choiceShown(controls, item))
  const next = shown.includes(value) ? shown.filter(item => item !== value) : all.filter(item => item === value || shown.includes(item))
  proposeFilter(controls.id, { values: next.length === all.length ? null : next })
  // The box shows the applied filter: the parent's update checks it, and an ignored proposal leaves it as it was.
  ;(event.target as HTMLInputElement).checked = choiceShown(controls, value)
}
// The filter dialog of one column. It never renders on the server; Escape or a press outside closes it.
const openFilter = ref<string>()
function headerCellOf(id: string) {
  return [...(root.value?.querySelectorAll<HTMLElement>('[data-vw-header]') ?? [])].find(element => element.dataset.vwHeader === id)
}
function onOutsidePress(event: PointerEvent) {
  const id = openFilter.value
  if (id === undefined) return
  const cell = headerCellOf(id)
  if (!cell || !cell.contains(event.target as Node)) closeFilter(false)
}
function closeFilter(restoreFocus: boolean) {
  const id = openFilter.value
  if (id === undefined) return
  openFilter.value = undefined
  document.removeEventListener('pointerdown', onOutsidePress, true)
  if (restoreFocus) headerCellOf(id)?.querySelector<HTMLElement>('[data-vw-column-filter]')?.focus({ preventScroll: true })
}
function toggleFilter(id: string) {
  if (openFilter.value === id) return closeFilter(true)
  closeFilter(false)
  openFilter.value = id
  document.addEventListener('pointerdown', onOutsidePress, true)
  void nextTick(() => headerCellOf(id)?.querySelector<HTMLElement>('.vw-column-filter-popover input')?.focus({ preventScroll: true }))
}
function filterKeys(event: KeyboardEvent) {
  // Keys typed into the dialog are not chart shortcuts.
  event.stopPropagation()
  if (event.key === 'Escape' && !event.isComposing) {
    event.preventDefault()
    closeFilter(true)
  }
}
function filterFocusOut(event: FocusEvent, id: string) {
  const next = event.relatedTarget as Node | null
  if (next && openFilter.value === id && !headerCellOf(id)?.contains(next)) closeFilter(false)
}
function headerControlEvents(controls: HeaderControls): HeaderCell['on'] {
  return controls.filterable ? { focusout: event => filterFocusOut(event as FocusEvent, controls.id) } : {}
}
// A column that loses its filter control, or a chart that turns invalid, closes the dialog.
watch([filterableIds, validationError], () => {
  if (openFilter.value !== undefined && (validationError.value || !filterableIds.value.has(openFilter.value))) closeFilter(false)
})
onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutsidePress, true))

function proposeColumnResize(change: TimelineColumnResize) {
  if (change.before === change.after) return
  const reason = settle(props.validateColumnResize?.(change), messages.value.columnResizeRejected!)
  if (reason !== undefined) emit('column-resize-rejected', change, reason)
  else emit('column-resize', change)
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
  gesture = { type: 'column', id: handle.id, pointerId: event.pointerId, target, x: inlineClientX(event.clientX), before: handle.width }
  target.setPointerCapture(event.pointerId)
}
function moveColumnResize(event: PointerEvent) {
  const active = gestureOf('column', event)
  if (!active) return
  // Dragging towards the inline end widens the column: right in left-to-right charts, left in right-to-left charts.
  const width = clampColumnWidth(active.before + inlineClientX(event.clientX) - active.x)
  if (columnResize.value?.id !== active.id || columnResize.value.width !== width) columnResize.value = { id: active.id, width }
}
function cancelColumnResize() {
  endGesture('column')
  columnResize.value = undefined
}
function finishColumnResize(event: PointerEvent) {
  const active = gestureOf('column', event)
  if (!active) return
  if (event.type !== 'pointerup') return cancelGestures('pointer-cancel')
  moveColumnResize(event)
  const after = columnResize.value?.width ?? active.before
  cancelColumnResize()
  proposeColumnResize({ id: active.id, before: active.before, after, source: 'pointer' })
}
function columnResizeKeys(event: KeyboardEvent, handle: ResizeHandle) {
  const after = columnWidthForKey(event, handle.width, rtl.value, minColumnSize.value, maxColumnSize.value)
  if (after === undefined) return
  event.preventDefault()
  if (gestureActive()) return
  proposeColumnResize({ id: handle.id, before: handle.width, after, source: 'keyboard' })
}

// Progress editing (`progressEditable`). A slider at the progress boundary previews pointer drags and proposes
// keyboard steps; the parent accepts `progress-edit` by setting the bar's progress.
const progressPreview = ref<{ id: string; value: number }>()
function canEditProgress(bar: TimelineBar) {
  return Boolean(props.progressEditable) && !props.readonly && Boolean(bar.editable) && bar.start !== bar.end
}
const progressHandlesVisible = computed(() => Boolean(props.progressEditable) && !props.readonly && !validationError.value)
const linkEnds = ['start', 'finish'] as const
type BarHandle = TimelineBarEnd | 'progress' | TimelineConstraintKind
function isConstraintHandle(handle: BarHandle): handle is TimelineConstraintKind {
  return handle !== 'start' && handle !== 'finish' && handle !== 'progress'
}
/**
 * The handles drawn beside a bar: its link handles, then its progress slider and its constraint sliders (buttons with
 * the slider role). They share one template loop so that a chart without these props renders exactly the markup it
 * did before.
 */
function barHandles(bar: TimelineBar): readonly BarHandle[] {
  const ends = linkHandlesVisible.value ? linkEnds : []
  const progress = progressHandlesVisible.value && canEditProgress(bar)
  const constraints = constraintHandlesVisible.value && canEditConstraints(bar) ? constraintHandleKinds(bar) : []
  return progress || constraints.length ? [...ends, ...(progress ? ['progress' as const] : []), ...constraints] : ends
}
function handleAttrs(bar: TimelineBar, handle: BarHandle) {
  if (isConstraintHandle(handle)) return constraintHandleAttrs(bar, handle)
  if (handle !== 'progress') {
    return {
      class: ['vw-gantt-link-handle', `vw-is-${handle}`, { 'vw-is-active': linkPressed(bar.id, handle) }],
      style: linkHandleStyle(bar, handle),
      'data-vw-link': linkKey({ bar: bar.id, end: handle }),
      'aria-label': linkHandleName(bar.id, bar.label, handle),
      'aria-pressed': linkPressed(bar.id, handle),
    }
  }
  const value = shownProgress(bar) ?? 0
  return {
    class: ['vw-gantt-progress-handle', { 'vw-is-dragging': progressPreview.value?.id === bar.id }],
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
  if (isConstraintHandle(handle)) startConstraint(event, bar, handle)
  else if (handle === 'progress') startProgress(event, bar)
  else startLink(event, bar.id, handle)
}
function clickHandle(event: MouseEvent, bar: TimelineBar, handle: BarHandle) {
  event.stopPropagation()
  if (handle !== 'progress' && !isConstraintHandle(handle)) activateLink(bar.id, handle, event)
}
function handleKeys(event: KeyboardEvent, bar: TimelineBar, handle: BarHandle) {
  if (isConstraintHandle(handle)) return constraintKeys(event, bar, handle)
  if (handle === 'progress') return progressKeys(event, bar)
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.stopPropagation()
  event.preventDefault()
  activateLink(bar.id, handle, event)
}
function percent(value: number) {
  return Math.round(value * 100) + '%'
}
function progressHandleStyle(bar: TimelineBar) {
  const range = rangeOf(bar)
  const x = axis.value.toX(progressTime(range, workSegments(bar, range), shownProgress(bar) ?? 0))
  return {
    [inlineSide.value]: canvasInset(x - 6),
    top: `${laneTop(bar) + barHeight.value - 6}px`,
    ...rowShiftStyle(bar),
  }
}
function cancelProgress() {
  endGesture('progress')
  progressPreview.value = undefined
}
function proposeProgress(change: TimelineProgressEdit) {
  if (change.after === (change.before ?? 0)) return
  const reason = settle(props.validateProgressEdit?.(change))
  if (reason !== undefined) emit('progress-edit-rejected', change, reason)
  else emit('progress-edit', change)
}
function startProgress(event: PointerEvent, bar: TimelineBar) {
  if (!canEditProgress(bar) || gestureActive() || !event.isPrimary || event.button !== 0) return
  const target = event.currentTarget as HTMLElement
  hideTooltip()
  target.focus({ preventScroll: true })
  gesture = { type: 'progress', id: bar.id, pointerId: event.pointerId, target, x: event.clientX }
  target.setPointerCapture(event.pointerId)
}
/** Map the pointer to progress over the bar, or over its working time when it has segments, as the fill is drawn. */
function moveProgress(event: PointerEvent) {
  const active = gestureOf('progress', event)
  if (!active || !canvas.value) return
  if (!progressPreview.value && Math.abs(event.clientX - active.x) < 2) return
  const bar = barById.value.get(active.id)
  if (!bar) return cancelProgress()
  const time = timeUnder(event.clientX, canvas.value)
  progressPreview.value = { id: bar.id, value: snapProgress(progressAt(bar, workSegments(bar, bar), time), props.progressStep) }
}
function finishProgress(event: PointerEvent) {
  const active = gestureOf('progress', event)
  if (!active) return
  if (event.type !== 'pointerup') return cancelGestures('pointer-cancel')
  moveProgress(event)
  const preview = progressPreview.value
  const bar = barById.value.get(active.id)
  cancelProgress()
  if (preview && bar) proposeProgress({ id: bar.id, before: bar.progress, after: preview.value, source: 'pointer' })
}
function progressKeys(event: KeyboardEvent, bar: TimelineBar) {
  if (event.key === 'Escape') return cancelEdit('escape')
  if (props.contextMenu && isMenuKey(event)) return keyboardContextMenu(event, { kind: 'bar', id: bar.id }, bar.rowId)
  if (!canEditProgress(bar) || gestureActive()) return
  const next = progressForKey(event, bar.progress ?? 0, props.progressStep, rtl.value)
  if (next === undefined) return
  event.preventDefault()
  proposeProgress({ id: bar.id, before: bar.progress, after: next, source: 'keyboard' })
}

// Constraint editing (`constraintsEditable`). Each constraint of an editable bar is a slider at its time: a pointer drag
// previews the snapped time, keys propose steps, and the parent accepts `constraint-edit` by updating `constraints`.
// The constraints of other bars, and of every bar without the prop, are decorative markers with the same glyph.
type ShownConstraint = { kind: TimelineConstraintKind; time: number; violated: boolean }
const constraintPreview = shallowRef<{ id: string; kind: TimelineConstraintKind; time: number }>()
let pendingConstraintFocus: string | undefined
const constraintHandlesVisible = computed(() => Boolean(props.constraintsEditable) && !props.readonly && !validationError.value)
function canEditConstraints(bar: TimelineBar) {
  return Boolean(props.constraintsEditable) && !props.readonly && Boolean(bar.editable)
}
/** A constraint's time as drawn: the pointer preview of a constraint drag, otherwise the bar's own value. */
function shownConstraint(bar: TimelineBar, kind: TimelineConstraintKind) {
  const preview = constraintPreview.value
  return preview?.id === bar.id && preview.kind === kind ? preview.time : bar.constraints?.[kind]
}
/** The constraints of a bar in `timelineConstraintKinds` order, checked against its interval as drawn. */
function barConstraints(bar: TimelineBar): ShownConstraint[] {
  if (!bar.constraints) return []
  const range = rangeOf(bar)
  return timelineConstraintKinds.flatMap(kind => {
    const time = shownConstraint(bar, kind)
    return time === undefined ? [] : [{ kind, time, violated: timelineConstraintViolated(range, kind, time) }]
  })
}
function constraintText(item: ShownConstraint) {
  const text = `${messages.value[item.kind]} ${props.formatTime(item.time)}`
  return item.violated ? `${text}, ${messages.value.constraintViolated}` : text
}
function constraintVisible(time: number) {
  return inTimeWindow(time, timeWindow.value)
}
function boundsStart(kind: TimelineConstraintKind) {
  return kind === 'fixedStart' || kind.startsWith('start')
}
/** Classes of the glyph: the bar end it bounds (a flag at the top or bottom), its direction and its state. */
function constraintClasses(bar: TimelineBar, item: ShownConstraint) {
  const side = item.kind === 'fixedStart' ? 'vw-is-fixed' : item.kind.endsWith('NoEarlierThan') ? 'vw-is-lower' : 'vw-is-upper'
  const preview = constraintPreview.value
  const dragging = preview?.id === bar.id && preview.kind === item.kind
  return ['vw-gantt-constraint', boundsStart(item.kind) ? 'vw-is-start' : 'vw-is-finish', side, item.violated ? 'vw-is-violated' : '',
    dragging ? 'vw-is-dragging' : ''].filter(Boolean).join(' ')
}
/** A 26 px wide box centred on the time that holds the flag; the stem reaches across the lane (`--vw-constraint-reach`). */
function constraintStyle(bar: TimelineBar, item: ShownConstraint) {
  return {
    [inlineSide.value]: canvasInset(axis.value.toX(item.time) - 13),
    top: `${boundsStart(item.kind) ? laneTop(bar) - 5 : laneTop(bar) + barHeight.value - 9}px`,
    '--vw-constraint-reach': `${barHeight.value + 10}px`,
    ...rowShiftStyle(bar),
  }
}
/** Decorative markers of the constraints of a bar inside the visible time window. */
function constraintMarks(bar: TimelineBar) {
  return barConstraints(bar).filter(item => constraintVisible(item.time)).map(item => ({
    key: bar.id + ':' + item.kind, className: constraintClasses(bar, item), style: constraintStyle(bar, item),
  }))
}
/** Kinds with a handle: the constraints inside the visible time window, and the one being dragged. */
function constraintHandleKinds(bar: TimelineBar) {
  const preview = constraintPreview.value
  return barConstraints(bar)
    .filter(item => constraintVisible(item.time) || (preview?.id === bar.id && preview.kind === item.kind))
    .map(item => item.kind)
}
function constraintHandleAttrs(bar: TimelineBar, kind: TimelineConstraintKind) {
  const item = barConstraints(bar).find(entry => entry.kind === kind)!
  return {
    class: constraintClasses(bar, item),
    style: constraintStyle(bar, item),
    'data-vw-constraint': bar.id,
    'data-vw-constraint-kind': kind,
    role: 'slider',
    'aria-label': `${messages.value[kind]} · ${bar.label}`,
    'aria-describedby': marker + '-constraint-hint',
    'aria-valuemin': bounds.value.start,
    'aria-valuemax': bounds.value.end,
    'aria-valuenow': item.time,
    'aria-valuetext': item.violated ? `${props.formatTime(item.time)}, ${messages.value.constraintViolated}` : props.formatTime(item.time),
  }
}
/** `before` moved by a whole number of snap steps and kept inside `editBounds`. */
function constraintTime(before: number, delta: number) {
  return stepConstraintTime(before, delta, activeSnap.value, bounds.value)
}
function cancelConstraint() {
  endGesture('constraint')
  constraintPreview.value = undefined
}
function proposeConstraint(change: TimelineConstraintEdit) {
  if (change.after === change.before) return
  const reason = settle(props.validateConstraintEdit?.(change), messages.value.constraintRejected!)
  if (reason !== undefined) return emit('constraint-edit-rejected', change, reason)
  if (change.after === undefined) pendingConstraintFocus = change.id
  emit('constraint-edit', change)
}
function startConstraint(event: PointerEvent, bar: TimelineBar, kind: TimelineConstraintKind) {
  const before = bar.constraints?.[kind]
  if (!canEditConstraints(bar) || before === undefined || gestureActive() || !event.isPrimary || event.button !== 0 || !canvas.value) return
  const target = event.currentTarget as HTMLElement
  hideTooltip()
  target.focus({ preventScroll: true })
  const origin = timeUnder(event.clientX, canvas.value)
  gesture = { type: 'constraint', id: bar.id, kind, pointerId: event.pointerId, target, x: event.clientX, origin, before }
  target.setPointerCapture(event.pointerId)
}
/** Move the constraint by the snapped time between the press and the pointer. */
function moveConstraint(event: PointerEvent) {
  const active = gestureOf('constraint', event)
  if (!active || !canvas.value) return
  if (!constraintPreview.value && Math.abs(event.clientX - active.x) < 2) return
  const time = timeUnder(event.clientX, canvas.value)
  constraintPreview.value = { id: active.id, kind: active.kind, time: constraintTime(active.before, time - active.origin) }
}
function finishConstraint(event: PointerEvent) {
  const active = gestureOf('constraint', event)
  if (!active) return
  if (event.type !== 'pointerup') return cancelGestures('pointer-cancel')
  moveConstraint(event)
  const preview = constraintPreview.value
  cancelConstraint()
  if (preview) proposeConstraint({ id: active.id, kind: active.kind, before: active.before, after: preview.time, source: 'pointer' })
}
function constraintKeys(event: KeyboardEvent, bar: TimelineBar, kind: TimelineConstraintKind) {
  if (event.key === 'Escape') return cancelEdit('escape')
  if (props.contextMenu && isMenuKey(event)) return keyboardContextMenu(event, { kind: 'bar', id: bar.id }, bar.rowId)
  const before = bar.constraints?.[kind]
  if (!canEditConstraints(bar) || before === undefined || event.altKey || event.ctrlKey || event.metaKey) return
  const step = constraintForKey(event, before, rtl.value, activeSnap.value, tickStep.value, bounds.value)
  if (!step) return
  event.preventDefault()
  if (gestureActive()) return
  proposeConstraint({ id: bar.id, kind, before, after: step.after, source: 'keyboard' })
}

// Drag to create (`creatable`). A press on the empty timeline area of a row previews a new bar while the pointer
// moves; release (or a click) proposes it, and the parent adds the bar to accept it. The template adds the row's add
// button in a `v-else-if` branch of the expand toggle, and the create and cascade previews in branches of the link
// preview, so a chart without these props renders exactly the markup it did before.
const createPreview = shallowRef<{ rowId: string; lane: number; range: TimeRange }>()
const createLength = computed(() => props.createDuration ?? 4 * activeSnap.value)
function canCreateIn(row: R) {
  if (!props.creatable || props.readonly || validationError.value) return false
  return typeof props.creatable === 'function' ? Boolean(props.creatable(row)) : true
}
/** The nearest multiple of `snap` from the range start. */
function snapTime(time: number) {
  return snapToGrid(time, stableRange.value.start, activeSnap.value)
}
/** [start, start + length) moved inside editBounds, and shortened only when the bounds are shorter. */
function placeInBounds(start: number, length: number) {
  return fitInBounds(start, length, bounds.value)
}
/** The snapped interval between the press and the pointer, at least minDuration long and inside editBounds. */
function createInterval(from: number, to: number) {
  return createSpan(from, to, stableRange.value.start, activeSnap.value, bounds.value, minimum.value)
}
/** Time under a client x coordinate of the canvas, also outside the axis. */
function timeUnder(clientX: number, area: HTMLElement) {
  return axis.value.toTime(timeAreaOffset(clientX, area.getBoundingClientRect()))
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
function pressRow(event: PointerEvent, row: R) {
  // Bars, handles, cells and the heading column are descendants; only the row's own background is empty.
  const el = scroller.value, area = canvas.value
  if (event.target !== event.currentTarget || !el || !area || !canCreateIn(row) || !event.isPrimary || event.button !== 0 || gestureActive()) return
  const x = timeAreaOffset(event.clientX, area.getBoundingClientRect())
  if (x < 0 || x > axis.value.width) return
  // Keep a mouse drag from selecting text; focus goes to the region so that Escape cancels.
  if (event.pointerType !== 'touch') event.preventDefault()
  el.focus({ preventScroll: true })
  hideTooltip()
  gesture = { type: 'create', pointerId: event.pointerId, target: el, rowId: row.id, time: axis.value.toTime(x), x: event.clientX, moved: false }
  el.setPointerCapture(event.pointerId)
  lastClientX = event.clientX
  lastClientY = event.clientY
  startAutoScroll()
}
function moveCreate(event: PointerEvent) {
  const active = gestureOf('create', event)
  if (!active) return
  lastClientX = event.clientX
  lastClientY = event.clientY
  if (!active.moved && Math.abs(event.clientX - active.x) < 3) return
  active.moved = true
  updateCreatePreview()
}
function updateCreatePreview() {
  const active = gestureOf('create')
  if (!active?.moved) return
  createPreview.value = { rowId: active.rowId, lane: laneAt(active.rowId, lastClientY), range: createInterval(active.time, timeAt(lastClientX)) }
}
function cancelCreate() {
  const active = endGesture('create')
  createPreview.value = undefined
  if (active) stopAutoScroll()
}
function finishCreate(event: PointerEvent) {
  const active = gestureOf('create', event)
  if (!active) return
  if (event.type !== 'pointerup') return cancelGestures('pointer-cancel')
  moveCreate(event)
  const row = displayedRows.value[rowOrder.value.get(active.rowId) ?? -1]?.row
  const lane = laneAt(active.rowId, event.clientY)
  // A click without movement proposes `createDuration` from the snapped press time.
  const range = active.moved ? createInterval(active.time, timeAt(event.clientX)) : placeInBounds(snapTime(active.time), createLength.value)
  cancelCreate()
  if (row && canCreateIn(row)) proposeCreate({ rowId: row.id, lane, start: range.start, end: range.end, source: 'pointer' })
}
/** The add button of a row proposes `createDuration` from the first snapped time in view, in the lowest free lane. */
function createFromButton(event: MouseEvent, row: R) {
  if (!canCreateIn(row) || gestureActive()) return
  const el = scroller.value
  const step = activeSnap.value
  const visible = el ? axis.value.toTime(Math.min(axis.value.width, scrollStart(el))) : stableRange.value.start
  const range = placeInBounds(stableRange.value.start + Math.ceil((visible - stableRange.value.start) / step) * step, createLength.value)
  const lane = freeLane(barsByRow.value.get(row.id) ?? [], range, props.laneCount)
  proposeCreate({ rowId: row.id, lane, start: range.start, end: range.end, source: clickSource(event) })
}
function proposeCreate(proposal: TimelineCreate) {
  const reason = settle(props.validateCreate?.(proposal), messages.value.createRejected!)
  if (reason !== undefined) emit('create-rejected', proposal, reason)
  else emit('create', proposal)
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
  // A menu opened during a pointer gesture (for example Control-click on macOS) can swallow pointerup, so every
  // gesture ends here without a proposal. An armed keyboard connection is kept.
  if (pointerGestureActive()) cancelGestures('pointer-cancel')
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
  const owner = element?.closest<HTMLElement | SVGElement>('[data-vw-bar], [data-vw-progress], [data-vw-constraint], [data-vw-link], [data-vw-dependency]')
  if (!owner || !scroller.value?.contains(owner)) return undefined
  const { vwBar, vwProgress, vwConstraint, vwLink, vwDependency } = owner.dataset
  if (vwDependency !== undefined) return { kind: 'dependency', id: vwDependency }
  const id = vwBar ?? vwProgress ?? vwConstraint ?? (vwLink ? (JSON.parse(vwLink) as [string, TimelineBarEnd])[0] : undefined)
  return id !== undefined && barById.value.has(id) ? { kind: 'bar', id } : undefined
}

// Target events (`target-enter`, `target-leave`, `target-activate`) report bars, dependencies, rows and, with
// `loadSelectable`, load segments as view targets. Keyboard focus counts as entering only when it is visible focus.
function barTarget(id: string): ViewTarget {
  return { view: 'timeline', kind: 'bar', id }
}
function dependencyTarget(id: string): ViewTarget {
  return { view: 'timeline', kind: 'dependency', id }
}
function rowTarget(id: string): ViewTarget {
  return { view: 'timeline', kind: 'row', id }
}
function loadTarget(resourceId: string, segment: TimelineLoadSegment): ViewTarget {
  return { view: 'load', resourceId, start: segment.start, end: segment.end }
}
/** Whether focus on an element is visible (keyboard) focus. Without `:focus-visible` support every focus counts. */
function focusVisible(element: Element) {
  try {
    return element.matches(':focus-visible')
  } catch {
    return true
  }
}
/** Targets entered by keyboard focus, keyed by their JSON, so that blur only leaves what focus entered. */
const keyboardTargets = new Set<string>()
function enterTarget(target: ViewTarget, source: ViewTargetSource) {
  emit('target-enter', { target, source })
}
function leaveTarget(target: ViewTarget, source: ViewTargetSource) {
  emit('target-leave', { target, source })
}
function activateTarget(target: ViewTarget, source: ViewTargetSource) {
  emit('target-activate', { target, source })
}
function focusTarget(event: FocusEvent, target: ViewTarget) {
  if (!focusVisible(event.target as Element)) return
  keyboardTargets.add(JSON.stringify(target))
  enterTarget(target, 'keyboard')
}
function blurTarget(target: ViewTarget) {
  if (keyboardTargets.delete(JSON.stringify(target))) leaveTarget(target, 'keyboard')
}
function clickSource(event: MouseEvent): ViewTargetSource {
  return event.detail === 0 ? 'keyboard' : 'pointer'
}
// Row heading text: one Tab stop for the whole heading column (a roving tabindex). Enter or Space activates the row as
// a click does; the arrow keys, Home and End move between the headings of the displayed rows.
const headingFocusId = ref<string>()
/** The heading in the tab order: the one focused last while it is rendered, else the first rendered one. */
const tabbableHeadingId = computed(() => {
  const rows = shownRows.value
  const id = headingFocusId.value
  return id !== undefined && rows.some(item => item.row.id === id) ? id : rows[0]?.row.id
})
async function focusRowHeading(index: number) {
  const row = displayedRows.value[index]?.row
  const el = scroller.value
  if (!row || !el) return
  headingFocusId.value = row.id
  scrollRowIntoView(el, index)
  syncViewport()
  await nextTick()
  dataElement('vwRowHeading', row.id)?.focus({ preventScroll: true })
}
function rowHeadingKeys(event: KeyboardEvent, row: TimelineRow) {
  // Keys of controls inside a `row` slot belong to those controls.
  if (event.target !== event.currentTarget || event.altKey || event.ctrlKey || event.metaKey) return
  const index = rowOrder.value.get(row.id)
  if (index === undefined) return
  const last = displayedRows.value.length - 1
  const next = { ArrowUp: index - 1, ArrowDown: index + 1, Home: 0, End: last }[event.key]
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    activateTarget(rowTarget(row.id), 'keyboard')
  } else if (next !== undefined) {
    event.preventDefault()
    if (next >= 0 && next <= last && next !== index) void focusRowHeading(next)
  }
}
function loadSegmentKeys(event: KeyboardEvent, target: ViewTarget) {
  if (event.key !== 'Enter' && event.key !== ' ') return
  event.preventDefault()
  activateTarget(target, 'keyboard')
}

// External drops (`droppable`). Only a droppable chart accepts an HTML drag, so other drags keep the browser's default
// handling. The chart reports the row and time under the drop point and writes nothing.
function acceptDrag(event: DragEvent) {
  if (props.droppable && !validationError.value) event.preventDefault()
}
function dropOnChart(event: DragEvent) {
  const el = scroller.value, area = canvas.value
  if (!props.droppable || validationError.value || !el || !area) return
  event.preventDefault()
  const { clientX, clientY, dataTransfer } = event
  const rect = area.getBoundingClientRect()
  const y = clientY - rect.top - headerHeight.value
  // The sticky header covers the scrolled content; the load rows follow the task rows.
  const inHeader = clientY < rect.top + el.scrollTop + headerHeight.value
  const row = !inHeader && y >= 0 && y < bodyHeight.value ? displayedRows.value[Math.floor(y / props.rowHeight)]?.row : undefined
  const time = Math.max(stableRange.value.start, Math.min(stableRange.value.end, snapTime(timeAt(clientX))))
  const drop: TimelineDrop = { time, clientX, clientY, dataTransfer }
  if (row) drop.rowId = row.id
  emit('bar-drop', drop)
}

// Tooltip slot (`useBarTooltip`).
const tooltipId = marker + '-tooltip'
const {
  bar: tooltipBar, element: tooltipEl, place: tooltipPlace, hide: hideTooltip, hoverBar, leaveBar, pressBar,
  focusBar: focusTooltip, blurBar: blurTooltip, enterTooltip, leaveTooltip,
} = useBarTooltip<B>({
  hasSlot: () => Boolean(slots.tooltip),
  allowed: () => mounted && Boolean(slots.tooltip) && !validationError.value && !gestureActive(),
  bars: () => barById.value,
  focusedBarId,
  delay: () => props.tooltipDelay,
  focusVisible,
  scroller,
  barElement: id => dataElement('vwBar', id),
  labelWidth: () => viewport.value.labels,
  headerHeight: () => headerHeight.value,
  rtl: () => rtl.value,
  placement: [viewport, axis, () => props.bars, displayedRows, rtl, headerHeight],
})
watch(linkDraft, draft => {
  if (draft) hideTooltip()
})

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
    for (const { row } of displayedRows.value) for (const bar of barsByRow.value.get(row.id) ?? []) chosen.push(bar)
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
  if (gesture && gesture.type !== 'row' && gesture.type !== 'column') cancelGestures('source-changed')
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
// Load segments matched by `highlightedLoadTargets` and `selectedLoadTargets`, found again by range overlap.
const loadSegmentMarks = computed(() => {
  const segments = props.loadSegments ?? []
  const marks = (targets: readonly LoadViewTarget[] | undefined) =>
    new Set<TimelineLoadSegment>(targets?.length ? resolveLoadTargets(segments, targets).segments : [])
  return { highlighted: marks(props.highlightedLoadTargets), selected: marks(props.selectedLoadTargets) }
})
const shownLoadRows = computed(() => {
  const histogram = loadHistogram.value
  const marks = loadSegmentMarks.value
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
          highlighted: marks.highlighted.has(segment), selected: marks.selected.has(segment),
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
function exportSvg(options: GanttExportOptions<R, B> = {}) {
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
    summaryDependencies: props.summaryDependencies,
    headerBands: activeBands.value,
    dependencyStyle: props.dependencyStyle,
    markers: props.markers,
    markerRanges: props.markerRanges,
    now: props.showNow && time !== undefined && time >= stableRange.value.start && time <= stableRange.value.end ? time : undefined,
    nowLabel: messages.value.now,
    tickStep: tickStep.value,
    tickAnchor: stableRange.value.start,
    formatTime: props.formatTime,
    formatLag: props.formatLag,
    baselineIds: stableBaselineIds.value,
    baselineLabel: baselineText.value.label,
    formatVariance: props.formatVariance,
    varianceLabels: { start: baselineText.value.start, finish: baselineText.value.finish, duration: baselineText.value.duration },
    rowHeading: rest.rowHeading ?? messages.value.rows,
    loadRows: includeLoad && loadHistogram.value ? props.loadRows : undefined,
    loadSegments: includeLoad && loadHistogram.value ? props.loadSegments : undefined,
    loadRowHeight: props.loadRowHeight,
    highlightedDependencyIds: props.highlightedDependencyIds,
    highlightedBarIds: props.highlightedBarIds,
    nonWorkingPeriods: props.nonWorkingPeriods,
    statusDate: includeStatusDate ? props.statusDate : undefined,
    statusDateLabel: messages.value.statusDate,
    showProgressLine: props.showProgressLine,
    constraintLabels: Object.fromEntries(timelineConstraintKinds.map(kind => [kind, messages.value[kind]!])),
    constraintViolatedLabel: messages.value.constraintViolated,
    direction: rtl.value ? 'rtl' : 'ltr',
    theme: root.value ? readExportTheme(root.value, theme) : theme,
    fontFamily: root.value ? exportFont(root.value) : undefined,
  })
}
/** Rasterize `exportSvg(options)` to a PNG blob in the browser. */
async function exportPng(options: GanttPngExportOptions<R, B> = {}) {
  const { scale = 1, ...rest } = options
  return rasterizeSvg(exportSvg(rest), scale)
}
/**
 * Scroll a bar into view, vertically and horizontally, wait for it to render and, with `focus`, move DOM focus to it.
 * Never throws for an ID: an unknown bar resolves `{ status: 'unknown' }`, and a bar whose row is hidden by a collapsed
 * ancestor resolves `{ status: 'hidden-by-collapse', proxyId }` with the nearest displayed ancestor row; neither scrolls.
 * Expanding the ancestors is up to the parent, which can call `revealBar` again after the rows are shown.
 */
async function revealBar(id: string, options: RevealOptions = {}): Promise<RevealResult> {
  const bar = barById.value.get(id)
  if (!bar) return { status: 'unknown' }
  if (!rowOrder.value.has(bar.rowId)) {
    let ancestor = rowById.value.get(bar.rowId)?.parentId
    while (ancestor !== undefined && !rowOrder.value.has(ancestor)) ancestor = rowById.value.get(ancestor)?.parentId
    return ancestor === undefined ? { status: 'unknown' } : { status: 'hidden-by-collapse', proxyId: ancestor }
  }
  const el = scroller.value
  if (el) {
    scrollRowIntoView(el, rowOrder.value.get(bar.rowId)!)
    scrollBarIntoInlineView(id)
  }
  // The bar is rendered once the new viewport has been applied; focus it only then.
  await nextTick()
  if (options.focus && barById.value.has(id)) focusBar(id)
  return { status: 'revealed' }
}
// The rendered window for partial data loading (`visible-window-change`). It is reported only after mounting, after a
// trailing delay that a long scroll cannot postpone beyond about four delays, and only when it changed.
const expandedParentIds = computed(() => {
  const ids: string[] = []
  for (const item of displayedRows.value) if (item.hasChildren && !collapsed.value.has(item.row.id)) ids.push(item.row.id)
  return ids
})
const visibleWindow = computed<TimelineVisibleWindow | undefined>(() => {
  if (validationError.value) return undefined
  const rowIds: string[] = []
  for (let index = rowWindow.value.first; index < rowWindow.value.afterLast; index++) rowIds.push(displayedRows.value[index]!.row.id)
  const { start, end } = timeWindow.value
  return { start, end: Math.max(start, end), rowIds, expandedIds: expandedParentIds.value }
})
let visibleWindowTimer: ReturnType<typeof setTimeout> | undefined
let visibleWindowSince = 0
let reportedWindow = ''
function scheduleVisibleWindow() {
  if (!mounted) return
  const delay = Math.max(0, Number.isFinite(props.visibleWindowDelay) ? props.visibleWindowDelay! : 100)
  if (visibleWindowTimer === undefined) visibleWindowSince = Date.now()
  else if (Date.now() - visibleWindowSince < 3 * delay) clearTimeout(visibleWindowTimer)
  else return
  visibleWindowTimer = setTimeout(reportVisibleWindow, delay)
}
function reportVisibleWindow() {
  visibleWindowTimer = undefined
  const value = visibleWindow.value
  if (!mounted || !value) return
  const key = JSON.stringify([value.start, value.end, value.rowIds, value.expandedIds])
  if (key === reportedWindow) return
  reportedWindow = key
  emit('visible-window-change', { start: value.start, end: value.end, rowIds: [...value.rowIds], expandedIds: [...value.expandedIds] })
}
watch(visibleWindow, scheduleVisibleWindow)

defineExpose({ scrollToTime, scrollToRow, cancelEdit: () => cancelEdit('api'), exportSvg, exportPng, fitToBars, revealBar })

// Switching direction mirrors every coordinate: cancel gestures and keep the same time at the inline-start edge.
watch(() => props.dir, detectDirection, { flush: 'post' })
onScopeDispose(() => directionObserver?.disconnect())
watch(rtl, async () => {
  cancelGestures('source-changed')
  const start = viewport.value.left
  await nextTick()
  if (scroller.value) setScrollStart(scroller.value, start)
  syncViewport()
})

function observeCorner(element: HTMLElement | null | undefined) {
  if (!observer || element === observedCorner) return
  if (observedCorner) observer.unobserve(observedCorner)
  observedCorner = element ?? undefined
  // Observing reports the initial size, which runs syncViewport.
  if (observedCorner) observer.observe(observedCorner)
  else syncViewport()
}
watch(cornerEl, observeCorner, { flush: 'post' })

onMounted(() => {
  mounted = true
  detectDirection()
  syncClock()
  if (!scroller.value) return
  syncViewport()
  observer = new ResizeObserver(syncViewport)
  observer.observe(scroller.value)
  observeCorner(cornerEl.value)
  scheduleVisibleWindow()
  scroller.value.addEventListener('touchmove', holdPinch, { passive: false })
  syncWheelListener()
})
onBeforeUnmount(() => {
  scroller.value?.removeEventListener('touchmove', holdPinch)
  wheelTarget?.removeEventListener('wheel', zoomWithWheel)
  wheelTarget = undefined
})
onUnmounted(() => {
  mounted = false
  resetGestures()
  hideTooltip()
  observer?.disconnect()
  observer = undefined
  observedCorner = undefined
  if (nowTimer !== undefined) clearInterval(nowTimer)
  if (visibleWindowTimer !== undefined) clearTimeout(visibleWindowTimer)
  visibleWindowTimer = undefined
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
      @keydown.esc="cancelEdit('escape')" @scroll.passive="syncScroll" @pointerdown="pressScroller" @contextmenu="onContextMenu"
      @dragenter="acceptDrag" @dragover="acceptDrag" @drop="dropOnChart"
      @pointermove="movePointer" @pointerup="releasePointer" @pointercancel="releasePointer" @lostpointercapture="finishGesture"
    >
      <div v-if="!validationError" ref="canvas" class="vw-gantt-canvas" :style="{
        width: canvasInset(axis.width),
        height: `${headerHeight + bodyHeight + loadHeight}px`,
        '--vw-label-area-width': `calc(var(--vw-row-label-width) + ${columnWidth + columnResizeDelta}px)`,
        '--vw-header-height': `${headerHeight}px`,
        '--vw-axis-width': `${axis.width}px`,
        '--vw-grid-step': `${gridStep}px`,
        ...labelWidthStyle,
      }">
        <div class="vw-gantt-head">
          <div ref="cornerEl" class="vw-gantt-corner" :class="{ 'vw-column-group': columns?.length }">
            <div v-if="!labelHeader" class="vw-name-column"><slot name="row-heading">{{ messages.rows }}</slot></div>
            <!-- Column headers and, with columnsResizable, their resize separators share one list so that the default markup stays unchanged.
              With sortableColumns or filterableColumns, the label column header joins the list and the headers get their controls. -->
            <template v-if="!labelHeader && !headerCells.some(cell => cell.controls)">
              <div v-for="cell in headerCells" :key="cell.key" :class="cell.className" :style="cell.style" v-bind="cell.attrs" v-on="cell.on">{{ cell.text }}</div>
            </template>
            <template v-else>
              <div v-for="cell in headerList" :key="cell.key" :class="cell.className" :style="cell.style" v-bind="cell.attrs" v-on="cell.on">
                <template v-if="cell.controls">
                  <button v-if="cell.controls.sortable" type="button" class="vw-column-sort" :class="{ 'vw-is-sorted': cell.controls.direction }"
                    :aria-label="sortButtonName(cell.controls)" @pointerdown.stop @click="toggleSort(cell.controls.id)">
                    <span class="vw-column-title"><slot v-if="cell.key === labelHeaderKey" name="row-heading">{{ messages.rows }}</slot><template v-else>{{ cell.text }}</template></span>
                    <span class="vw-sort-indicator" aria-hidden="true">{{ sortGlyph(cell.controls.direction) }}</span>
                  </button>
                  <span v-else class="vw-column-title"><slot v-if="cell.key === labelHeaderKey" name="row-heading">{{ messages.rows }}</slot><template v-else>{{ cell.text }}</template></span>
                  <template v-if="cell.controls.filterable">
                    <button type="button" class="vw-column-filter" :class="{ 'vw-is-active': cell.controls.filtered }" data-vw-column-filter
                      aria-haspopup="dialog" :aria-expanded="openFilter === cell.controls.id" :aria-label="filterButtonName(cell.controls)"
                      @pointerdown.stop @click="toggleFilter(cell.controls.id)" @keydown.esc.stop="closeFilter(true)"><span aria-hidden="true">⏷</span></button>
                    <div v-if="openFilter === cell.controls.id" class="vw-column-filter-popover" role="dialog" :aria-label="filterName(cell.controls)"
                      @pointerdown.stop @keydown="filterKeys">
                      <label class="vw-column-filter-text"><span>{{ messages.filterContains }}</span>
                        <input type="search" autocomplete="off" :value="cell.controls.filter?.text ?? ''" @input="filterText(cell.controls, $event)"
                          @compositionend="filterText(cell.controls, $event)">
                      </label>
                      <fieldset v-if="cell.controls.choices" class="vw-column-filter-values">
                        <legend>{{ messages.filterValues }}</legend>
                        <label v-for="(choice, index) in cell.controls.choices" :key="index">
                          <input type="checkbox" :checked="choiceShown(cell.controls, choice.value)" @change="toggleChoice(cell.controls, choice.value, $event)">
                          {{ choice.label ?? String(choice.value) }}
                        </label>
                      </fieldset>
                      <button type="button" class="vw-column-filter-clear" :disabled="!cell.controls.filter" @click="clearFilter(cell.controls)">{{ messages.clearFilter }}</button>
                    </div>
                  </template>
                </template>
                <template v-else>{{ cell.text }}</template>
              </div>
            </template>
          </div>
          <div class="vw-gantt-time-head" :style="{ top: (headerHeight - 40) + 'px' }">
            <span v-for="line in headLines" :key="line.key" :class="line.classes" :style="line.style" :role="line.role" :aria-label="line.name" :title="line.name" :aria-hidden="line.hidden">{{ line.text }}</span>
            <span v-for="{ tick, x } in tickLabels" :key="tick" class="vw-gantt-tick" :class="{ 'vw-is-end': tick === range.end }" :style="{ [inlineSide]: `${x}px` }"><slot name="tick" :time="tick" :label="formatTime(tick)">{{ formatTime(tick) }}</slot></span>
          </div>
          <div v-for="(level, index) in shownBands" :key="index" class="vw-gantt-band-level"
            :style="{ top: (index * bandHeight) + 'px', height: bandHeight + 'px' }">
            <div v-for="band in level" :key="band.start" class="vw-gantt-band"
              :style="{ [inlineSide]: band.x + 'px', width: band.width + 'px', ...stickyBandStyle(band.x) }">{{ band.label }}</div>
          </div>
        </div>
        <div v-if="shownNonWorking.length" class="vw-gantt-non-working-layer" aria-hidden="true">
          <span v-for="band in shownNonWorking" :key="band.key" class="vw-gantt-non-working"
            :style="{ [inlineSide]: band.left + 'px', width: band.width + 'px' }"></span>
        </div>
        <div class="vw-gantt-grid" aria-hidden="true">
          <span v-for="line in tickXs" :key="line.tick" class="vw-gantt-grid-line" :style="{ [inlineSide]: `${line.x}px` }"></span>
        </div>
        <div v-for="item in markerEntries" :key="item.key" :class="item.classes"
          :role="item.role" :aria-label="item.name" :title="item.name" :style="item.style" :aria-hidden="item.hidden">
          <span>{{ item.label }}</span>
        </div>
        <div v-if="nowTime !== undefined" class="vw-gantt-marker vw-gantt-now" :title="`${messages.now} ${formatTime(nowTime)}`"
          :style="{ [inlineSide]: canvasInset(axis.toX(nowTime)) }">
          <span>{{ messages.now }}</span>
        </div>
        <div v-for="row in shownRows" :key="row.row.id" class="vw-gantt-row"
          :style="{ top: `${headerHeight + row.index * rowHeight}px`, height: `${rowHeight}px` }"
          @pointerdown="pressRow($event, row.row)"
          @pointerenter="enterTarget(rowTarget(row.row.id), 'pointer')" @pointerleave="leaveTarget(rowTarget(row.row.id), 'pointer')"
        >
          <div class="vw-gantt-row-label" :class="{ 'vw-column-group': columns?.length }"
            @focusin="focusTarget($event, rowTarget(row.row.id))" @focusout="blurTarget(rowTarget(row.row.id))"
          >
            <div class="vw-name-column" :class="{ 'vw-tree-row': row.hasChildren || row.depth > 0, 'vw-creatable': row.creatable, 'vw-reorderable': row.reorderable }"
              :style="{ '--vw-row-depth': Math.min(row.depth, 5) }">
            <button v-if="row.hasChildren && !row.creatable && !row.reorderable" type="button" class="vw-row-toggle"
              :aria-expanded="!collapsed.has(row.row.id)"
              :aria-label="toggleName(row.row)"
              @click="toggleRow(row.row.id)">{{ toggleGlyph(row.row.id) }}</button>
            <template v-else-if="row.creatable && !row.reorderable">
              <button v-if="row.hasChildren" type="button" class="vw-row-toggle"
                :aria-expanded="!collapsed.has(row.row.id)"
                :aria-label="toggleName(row.row)"
                @click="toggleRow(row.row.id)">{{ toggleGlyph(row.row.id) }}</button>
              <button type="button" class="vw-gantt-create-button" :aria-label="`${messages.createIn} ${row.row.label}`"
                @click="createFromButton($event, row.row)"><span aria-hidden="true">+</span></button>
            </template>
            <template v-else-if="row.reorderable">
              <button type="button" class="vw-row-move-handle" :data-vw-row-handle="row.row.id"
                :aria-label="`${messages.moveRow} ${row.row.label}`" :aria-describedby="marker + '-reorder-hint'"
                @pointerdown="startRowDrag($event, row.row)" @keydown="rowHandleKeys($event, row.row)"><span aria-hidden="true">⋮⋮</span></button>
              <button v-if="row.hasChildren" type="button" class="vw-row-toggle"
                :aria-expanded="!collapsed.has(row.row.id)"
                :aria-label="toggleName(row.row)"
                @click="toggleRow(row.row.id)">{{ toggleGlyph(row.row.id) }}</button>
              <button v-if="row.creatable" type="button" class="vw-gantt-create-button" :aria-label="`${messages.createIn} ${row.row.label}`"
                @click="createFromButton($event, row.row)"><span aria-hidden="true">+</span></button>
            </template>
            <div class="vw-row-content" role="button" :tabindex="row.row.id === tabbableHeadingId ? 0 : -1" :data-vw-row-heading="row.row.id"
              @click="activateTarget(rowTarget(row.row.id), 'pointer')" @focus="headingFocusId = row.row.id"
              @keydown="rowHeadingKeys($event, row.row)">
              <slot name="row" :row="row.row" :index="row.index" :depth="row.depth" :expanded="!collapsed.has(row.row.id)">
                <strong>{{ row.row.label }}</strong>
                <small v-if="row.row.detail">{{ row.row.detail }}</small>
              </slot>
            </div>
            </div>
            <div v-for="(column, columnIndex) in columns" :key="column.id" class="vw-extra-column" :class="{ 'vw-sheet-column': spreadsheet }" :style="{ width: shownColumnWidth(column) + 'px' }"
              @focusout="spreadsheet && leaveSheetCell($event, row.row, column)">
              <button v-if="sheetCell(row.row, column)"
                type="button" class="vw-sheet-cell" :class="{ 'vw-is-filling': sheet.filling(row.index, columnIndex) }"
                :aria-pressed="sheet.selected(row.index, columnIndex)"
                :aria-label="row.row.label + ' · ' + column.label + ' ' + cellValue(row.row, column)"
                :aria-describedby="marker + '-sheet-hint'" :title="String(cellValue(row.row, column))"
                :tabindex="tabbableSheetCell === cellKey(row.row, column) ? 0 : -1"
                :data-vw-cell="cellKey(row.row, column)"
                @pointerdown.stop="sheet.startDrag($event, row.row.id, column.id)" @pointerup="sheet.finishPointer"
                @pointerenter="sheet.extendDrag($event, row.row.id, column.id)"
                @focus="sheetButtonFocus(row.row, column)"
                @keydown="sheet.keys($event, row.row.id, column.id)"
                @dblclick="editSheetCell(row.row, column)"
              >{{ cellValue(row.row, column) }}</button>
              <slot v-else name="cell" :row="row.row" :column="column" :value="cellValue(row.row, column)" :summary="summaries?.get(row.row.id)">
                <template v-if="column.field && $slots['cell-editor'] && canEditCell(row.row, column)">
                  <div v-if="editingCell(row.row, column)" class="vw-field-editor" :data-vw-cell-editor="cellKey(row.row, column)"
                    @keydown="cellEditorKeys">
                    <slot name="cell-editor" v-bind="cellEditorProps(row.row, column)" />
                  </div>
                  <button v-else type="button" class="vw-field-cell" :data-vw-cell="cellKey(row.row, column)"
                    :aria-label="`${row.row.label} · ${column.label} ${cellValue(row.row, column)}`" :title="String(cellValue(row.row, column))"
                    @click="startCellEditor(row.row, column, clickSource($event))"
                    @keydown.f2.prevent="startCellEditor(row.row, column, 'keyboard')">{{ cellValue(row.row, column) }}</button>
                </template>
                <input v-else-if="column.field && canEditCell(row.row, column)" class="vw-cell-input vw-field-input" type="text"
                  :data-vw-cell="cellKey(row.row, column)"
                  :aria-label="row.row.label + ' · ' + column.label"
                  :value="cellInputText(cellKey(row.row, column), fieldText(row.row, column))"
                  :aria-invalid="fieldInputError?.key === cellKey(row.row, column) ? 'true' : undefined"
                  @input="recordCellDraft($event, cellKey(row.row, column), fieldText(row.row, column))"
                  @change="commitFieldInput($event, row.row, column)" @keydown.enter="fieldInputEnter($event, row.row, column)"
                  @keydown.tab="sheetInputTab($event, row.row, column)" @keydown.esc="cancelFieldInput($event, row.row, column)">
                <input v-else-if="canEditCell(row.row, column)" class="vw-cell-input" type="text"
                  :data-vw-cell="spreadsheet ? cellKey(row.row, column) : undefined"
                  :aria-label="row.row.label + ' · ' + column.label"
                  :value="cellInputText(cellKey(row.row, column), plainCellText(row.row, column))"
                  @input="recordCellDraft($event, cellKey(row.row, column), plainCellText(row.row, column))"
                  @change="commitCell($event, row.row, column)" @keydown.enter="cellEnter($event, row.row, column)"
                  @keydown.tab="sheetInputTab($event, row.row, column)" @keydown.esc="cancelCell($event, row.row, column)">
                <span v-else :title="String(cellValue(row.row, column))">{{ cellValue(row.row, column) }}</span>
              </slot>
              <span v-if="spreadsheet && !readonly && !slots.cell && !slots['cell-editor'] && !sheet.editing.value && sheet.bounds.value?.bottom === row.index && sheet.bounds.value.right === columnIndex"
                class="vw-sheet-fill" aria-hidden="true" @click.stop.prevent @mousedown.prevent
                @pointerdown="sheet.startFill" @pointermove="sheet.moveFill"
                @pointerup="sheet.endFill" @pointercancel="sheet.endFill" @lostpointercapture="sheet.endFill" />
            </div>
          </div>
          <div v-if="row.summary && intersectsWindow(row.summary, timeWindow)" class="vw-gantt-summary"
            :style="summaryStyle(row.summary)"
            :title="`${row.row.label} · ${row.summary.count} · ${formatTime(row.summary.start)}–${formatTime(row.summary.end)}`"
            :data-vw-summary="summaryDropId(row.row.id)">
            <span v-if="row.summary.progress !== undefined" :style="{ width: (row.summary.progress * 100) + '%' }"></span>
          </div>
          <div v-for="strip in row.baselines" :key="strip.key" :class="strip.className"
            :style="strip.style" :title="strip.title" :data-vw-baseline="strip.set"></div>
          <div v-for="item in row.floats" :key="item.bar.id + ':float'" class="vw-gantt-float" :style="item.style" aria-hidden="true"></div>
          <button
            v-for="bar in row.bars" :key="bar.id" type="button" class="vw-gantt-bar"
            :class="[`vw-tone-${bar.tone ?? 'blue'}`, bar.appearance === 'outline' ? 'vw-is-outline' : 'vw-is-solid', {
              'vw-is-selected': selectedIds?.has(bar.id), 'vw-is-editable': editable(bar), 'vw-is-dragging': previews?.has(bar.id), 'vw-is-milestone': bar.start === bar.end,
              'vw-has-slot': bar.start === bar.end && Boolean($slots.bar),
              'vw-critical': bar.critical, 'vw-late': row.overlays.get(bar.id)?.late, 'vw-segmented': row.overlays.get(bar.id)?.segments,
              'vw-is-highlighted': highlightedBarIds?.has(bar.id),
            }]"
            :style="barStyle(bar)" :data-vw-bar="bar.id"
            :title="$slots.tooltip ? undefined : barTitle(bar, row.overlays.get(bar.id))"
            :aria-label="`${bar.label} ${formatTime(rangeOf(bar).start)}–${formatTime(rangeOf(bar).end)}`"
            :aria-pressed="Boolean(selectedIds?.has(bar.id))"
            @keydown="editWithKeys($event, bar)" @focus="onBarFocus($event, bar)" @blur="onBarBlur(bar.id)"
            :aria-describedby="barDescribedBy(bar, row.overlays.get(bar.id))"
            @pointerdown="pressBar(bar); startEdit($event, bar)" @click="clickBar(bar, $event)"
            @pointerenter="hoverBar(bar); enterTarget(barTarget(bar.id), 'pointer')" @pointerleave="leaveBar(bar); leaveTarget(barTarget(bar.id), 'pointer')"
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
            <span v-if="editable(bar) && bar.end - bar.start >= minimum" class="vw-bar-handle vw-is-first" data-edit-mode="start" aria-hidden="true"></span>
            <span v-if="editable(bar) && bar.end - bar.start >= minimum" class="vw-bar-handle vw-is-last" data-edit-mode="end" aria-hidden="true"></span>
            <span v-if="row.overlays.get(bar.id)?.description" :id="barDescriptionId(bar)" hidden>{{ row.overlays.get(bar.id)!.description }}</span>
          </button>
          <!-- Deadline indicators and the constraint markers of bars without handles share one list, so the default markup stays unchanged. -->
          <div v-for="item in row.decorations" :key="item.key" :class="item.className" :style="item.style" aria-hidden="true"></div>
          <template v-if="linkHandlesVisible || progressHandlesVisible || constraintHandlesVisible">
            <template v-for="bar in row.bars" :key="bar.id + ':links'">
              <button v-for="end in barHandles(bar)" :key="end" type="button" v-bind="handleAttrs(bar, end)"
                @pointerdown="pressHandle($event, bar, end)" @click="clickHandle($event, bar, end)" @keydown="handleKeys($event, bar, end)"></button>
            </template>
          </template>
          <svg v-if="row.progress" class="vw-gantt-progress-line" aria-hidden="true" :width="xWindow.right - xWindow.left" :height="rowHeight"
            :style="{ [inlineSide]: canvasInset(xWindow.left) }"
            :viewBox="`${xWindow.left} 0 ${xWindow.right - xWindow.left} ${rowHeight}`"><polyline :points="row.progress.points" /></svg>
        </div>
        <DependencyLayers v-if="shownLines.length">
        <svg class="vw-gantt-links" aria-hidden="true"
          :width="linkLayer.width" :height="linkLayer.height" :style="linkLayer.style" :viewBox="linkLayer.viewBox">
          <defs>
            <marker :id="marker" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
              <path d="M 0 0 L 6 3 L 0 6 z" fill="context-stroke" />
            </marker>
          </defs>
          <LinkShape v-for="shape in linkShapes" :key="shape.key" :tag="shape.tag" :attrs="shape.attrs" :text="shape.text" />
        </svg>
        <template #lag><svg class="vw-gantt-lag-layer" aria-hidden="true"
          :width="linkLayer.width" :height="linkLayer.height" :style="linkLayer.style" :viewBox="linkLayer.viewBox">
          <LinkShape v-for="shape in lagShapes" :key="shape.key" :tag="shape.tag" :attrs="shape.attrs" :text="shape.text" />
        </svg></template>
        </DependencyLayers>
        <svg v-if="dependencyTargets && shownLines.length" class="vw-gantt-link-hits"
          :width="linkLayer.width" :height="linkLayer.height" :style="linkLayer.style" :viewBox="linkLayer.viewBox">
          <path v-for="line in shownLines" :key="line.id" class="vw-dependency-hit" :class="{ 'vw-is-active': activeDependencyId === line.id }"
            :d="line.path" role="button" tabindex="0" :data-vw-dependency="contextMenu ? line.id : undefined"
            :aria-label="`${messages.selectDependency} ${dependencyName(line.dependency)}`"
            :aria-describedby="line.lag?.id"
            :aria-pressed="activeDependencyId === line.id"
            @click="selectDependency(line.id)" @keydown="dependencyKeys($event, line.id)"
            @pointerenter="enterTarget(dependencyTarget(line.id), 'pointer')" @pointerleave="leaveTarget(dependencyTarget(line.id), 'pointer')"
            @focus="focusTarget($event, dependencyTarget(line.id))" @blur="blurTarget(dependencyTarget(line.id))" />
        </svg>
        <button v-for="item in canvasHandles" :key="item.key" type="button" :class="item.className"
          :style="item.style" :aria-label="item.label" :aria-pressed="item.pressed"
          :data-vw-dependency="contextMenu && item.dependency ? item.dependency.id : undefined"
          :data-vw-link="item.link && linkKey(item.link)"
          @pointerdown="pressCanvasHandle(item, $event)"
          @click.stop="clickCanvasHandle(item, $event)"
          @keydown.enter.stop.prevent="canvasHandleKeys(item, $event)"
          @keydown.space.stop.prevent="canvasHandleKeys(item, $event)"></button>
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
            :style="{ [inlineSide]: canvasInset(band.left), width: band.width + 'px' }"></span>
          <div class="vw-gantt-row-label">
            <slot name="load-row" :row="item.row" :peak="item.peak">
              <strong>{{ item.row.label }}</strong>
              <small v-if="item.row.detail">{{ item.row.detail }}</small>
            </slot>
          </div>
          <div v-for="segment in item.segments" :key="segment.key" class="vw-gantt-load-segment"
            :class="{
              'vw-is-overloaded': segment.overload > 0, 'vw-is-idle': segment.segment.load === 0, 'vw-is-selectable': loadSelectable,
              'vw-is-highlighted': segment.highlighted && !segment.selected, 'vw-is-selected': segment.selected,
            }"
            :role="loadSelectable ? 'button' : 'img'" :tabindex="loadSelectable ? 0 : undefined"
            :aria-pressed="loadSelectable && selectedLoadTargets ? segment.selected : undefined"
            :aria-label="segment.label" :title="segment.label"
            @pointerenter="loadSelectable && enterTarget(loadTarget(item.row.id, segment.segment), 'pointer')"
            @pointerleave="loadSelectable && leaveTarget(loadTarget(item.row.id, segment.segment), 'pointer')"
            @focus="loadSelectable && focusTarget($event, loadTarget(item.row.id, segment.segment))"
            @blur="loadSelectable && blurTarget(loadTarget(item.row.id, segment.segment))"
            @click="loadSelectable && activateTarget(loadTarget(item.row.id, segment.segment), 'pointer')"
            @keydown="loadSelectable && loadSegmentKeys($event, loadTarget(item.row.id, segment.segment))"
            :style="{ [inlineSide]: canvasInset(segment.left), width: `${segment.width}px` }">
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
    <span v-if="!constraintHandlesVisible" :id="marker + '-hint'" class="vw-sr-only">{{ messages.editHint }}</span>
    <template v-else>
      <span :id="marker + '-hint'" class="vw-sr-only">{{ messages.editHint }}</span>
      <span :id="marker + '-constraint-hint'" class="vw-sr-only">{{ messages.constraintHint }}</span>
    </template>
    <span v-if="rowDraggable && !rowHandlesVisible" :id="marker + '-row-hint'" class="vw-sr-only">{{ messages.moveRowHint }}</span>
    <template v-else-if="rowHandlesVisible">
      <span v-if="rowDraggable" :id="marker + '-row-hint'" class="vw-sr-only">{{ messages.moveRowHint }}</span>
      <span :id="marker + '-reorder-hint'" class="vw-sr-only">{{ messages.moveRowKeysHint }}</span>
    </template>
    <span v-if="spreadsheet" :id="marker + '-sheet-hint'" class="vw-sr-only">{{ messages.sheetHint }}</span>
    <span class="vw-sr-only" aria-live="polite">{{ notice }}</span>
  </div>
</template>
