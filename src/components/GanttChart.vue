<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, useId, watch } from 'vue'
import type { TimelineBar, TimelineDependency, TimelineRow, TimelineEdit, GanttLabels, EditValidator, TimelineBand, TimelineMarker, TimelineColumn, TimelineCellEdit, TimelineSummary } from '../core/types.js'
import type {
  BatchEditValidator, TimelineBarEnd, TimelineConnection, TimelineConnectionValidator, TimelineLoadRow, TimelineLoadSegment,
  TimelineReconnect, TimelineZoomPreset, TimelineZoomState,
} from '../core/types.js'
import {
  createTimeScale, createTimelineRowTree, dependencyPath, dependencyTimes, editTimeRange, intersectsWindow, validateTimelineData,
  summarizeTimelineRows, timeTicks, visibleRows, type EditMode, type TimeRange, type TimeScale,
} from '../core/timeline.js'
import { dependencyEndsForType, dependencyTypeForEnds, moveTimeRanges, resourceLoadHistogram, type ResourceLoadHistogram } from '../core/timeline.js'
import type { ChartDirection, GanttExportOptions, GanttPngExportOptions } from '../core/types.js'
import { renderTimelineSvg } from '../core/exportSvg.js'
import { exportFont, rasterizeSvg, readExportTheme } from './exportImage.js'

const props = withDefaults(defineProps<{
  rows: readonly TimelineRow[]
  bars: readonly TimelineBar[]
  dependencies?: readonly TimelineDependency[]
  highlightedDependencyIds?: ReadonlySet<string>
  range: TimeRange
  pixelsPerUnit?: number
  tickSteps?: readonly number[]
  snap?: number
  formatTime?: (time: number) => string
  selectedIds?: ReadonlySet<string>
  collapsedIds?: ReadonlySet<string>
  headerBands?: readonly (readonly TimelineBand[])[]
  markers?: readonly TimelineMarker[]
  columns?: readonly TimelineColumn[]
  showSummaries?: boolean
  validateCellEdit?: (change: TimelineCellEdit) => boolean | string | void
  rowHeight?: number
  laneCount?: number
  height?: number | string
  labels?: Partial<GanttLabels>
  readonly?: boolean
  editBounds?: TimeRange
  minDuration?: number
  validateEdit?: EditValidator
  scale?: TimeScale
  showControls?: boolean
  autoScroll?: boolean
  connectable?: boolean
  reconnectable?: boolean
  validateConnection?: TimelineConnectionValidator
  selectedDependencyId?: string
  multiSelect?: boolean
  validateEdits?: BatchEditValidator
  rowDraggable?: boolean
  zoomPresets?: readonly TimelineZoomPreset[]
  zoomPreset?: string
  showNow?: boolean
  now?: number
  loadRows?: readonly TimelineLoadRow[]
  loadSegments?: readonly TimelineLoadSegment[]
  loadRowHeight?: number
  pinchZoom?: boolean
  dir?: ChartDirection
}>(), {
  dir: 'ltr',
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
  select: [id: string]
  'validation-error': [error: Error]
  edit: [change: TimelineEdit]
  'update:collapsedIds': [ids: Set<string>]
  'cell-edit': [change: TimelineCellEdit]
  'cell-edit-rejected': [change: TimelineCellEdit, reason: string]
  'edit-rejected': [change: TimelineEdit, reason: string]
  'update:selectedIds': [ids: Set<string>]
  edits: [changes: TimelineEdit[]]
  'edits-rejected': [changes: TimelineEdit[], reason: string]
  connect: [connection: TimelineConnection]
  reconnect: [change: TimelineReconnect]
  'connect-rejected': [connection: TimelineConnection, reason: string]
  'dependency-select': [id: string]
  'update:selectedDependencyId': [id: string]
  'dependency-delete': [id: string]
  'update:zoomPreset': [id: string]
  'zoom-change': [state: TimelineZoomState]
}>()

defineSlots<{
  legend(): unknown
  'row-heading'(): unknown
  row(props: { row: TimelineRow; index: number; depth: number; expanded: boolean }): unknown
  cell(props: { row: TimelineRow; column: TimelineColumn; value: string | number; summary?: TimelineSummary }): unknown
  bar(props: { bar: TimelineBar; range: TimeRange; selected: boolean }): unknown
  tick(props: { time: number; label: string }): unknown
  empty(): unknown
  'load-row'(props: { row: TimelineLoadRow; peak: number }): unknown
  'load-segment'(props: { segment: TimelineLoadSegment; row: TimelineLoadRow; peak: number; overload: number }): unknown
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
  moveRowHint: 'Up and Down arrows move the bar to another row.', ...props.labels,
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
  // Derive the hierarchy here so parent references and cycles use the same error boundary.
  return { tree: createTimelineRowTree(props.rows), load: validateLoad() }
}
// Controlled props are watched by reference. Pass new arrays and objects instead of mutating them in place.
watch([
  () => props.rows, () => props.bars, () => props.dependencies, () => props.laneCount, () => props.rowHeight, () => props.snap,
  () => props.range, () => props.editBounds, () => props.minDuration, () => props.tickSteps, () => props.pixelsPerUnit, () => props.scale,
  () => props.zoomPresets, () => props.zoomPreset, activePreset, () => props.loadRows, () => props.loadSegments, () => props.loadRowHeight,
  () => props.now,
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
const tickStep = computed(() => activeTickSteps.value.find(step => axis.value.toX(props.range.start + step) >= 76)
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
const gridStep = computed(() => axis.value.toX(props.range.start + tickStep.value))
type BarPreview = { range: TimeRange; rowShift: number }
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
  return 7 + (bar.lane ?? 0) * laneHeight.value
}

const shownRows = computed(() => {
  const { first, afterLast } = rowWindow.value
  return displayedRows.value.slice(first, afterLast).map((item, i) => {
    const bars = barsByRow.value.get(item.row.id) ?? []
    return {
      ...item,
      index: first + i,
      bars: bars.filter(bar => previews.value?.has(bar.id) || focusedBarId.value === bar.id || intersectsWindow(rangeOf(bar), timeWindow.value)),
      summary: item.hasChildren && props.showSummaries && !bars.length ? summaries.value?.get(item.row.id) : undefined,
      baselines: bars.filter(bar => bar.baseline && intersectsWindow(bar.baseline, timeWindow.value)),
    }
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
  const range = rangeOf(bar)
  const left = axis.value.toX(range.start)
  const width = axis.value.toX(range.end) - left
  return { left: left - (width === 0 ? 5 : 0), width: width === 0 ? 10 : width }
}

function barStyle(bar: TimelineBar) {
  const box = barBox(bar)
  const shift = previews.value?.get(bar.id)?.rowShift
  return {
    [inlineSide.value]: `calc(var(--vft-label-area-width) + ${box.left}px)`,
    width: `${box.width}px`,
    height: `${barHeight.value}px`,
    top: `${laneTop(bar)}px`,
    ...(shift ? { transform: `translateY(${shift * props.rowHeight}px)` } : {}),
  }
}

function summaryStyle(summary: TimelineSummary) {
  const left = axis.value.toX(summary.start)
  return {
    [inlineSide.value]: `calc(var(--vft-label-area-width) + ${left}px)`,
    width: `${Math.max(3, axis.value.toX(summary.end) - left)}px`,
  }
}

function baselineStyle(bar: TimelineBar) {
  const baseline = bar.baseline!
  const left = axis.value.toX(baseline.start)
  const width = axis.value.toX(baseline.end) - left
  return {
    [inlineSide.value]: `calc(var(--vft-label-area-width) + ${left - (width === 0 ? 1.5 : 0)}px)`,
    width: `${Math.max(3, width)}px`,
    top: `${laneTop(bar) + barHeight.value + 1}px`,
  }
}

function syncViewport() {
  const el = scroller.value
  if (!el) return
  const labels = el.querySelector('.vft-gantt-corner')?.getBoundingClientRect().width ?? 154
  viewport.value = {
    width: el.clientWidth, height: el.clientHeight, left: scrollStart(el), top: el.scrollTop, labels,
  }
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
  if (!scroller.value || drag) return
  await applyZoom(zoom.value * factor)
}

let pendingCenter: number | undefined
function choosePreset(id: string) {
  const el = scroller.value
  if (drag) return
  if (el) pendingCenter = axis.value.toTime(scrollStart(el) + Math.max(0, (el.clientWidth - viewport.value.labels) / 2))
  localPreset.value = id
  zoom.value = 1
  emit('update:zoomPreset', id)
}
watch(() => activePreset.value?.id, async () => {
  const time = pendingCenter
  pendingCenter = undefined
  const el = scroller.value
  if (time === undefined || !el) return
  await nextTick()
  setScrollStart(el, axis.value.toX(time) - Math.max(0, (el.clientWidth - viewport.value.labels) / 2))
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
  pinch = undefined
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
    const change: TimelineEdit = { id: bar.id, before: { start: bar.start, end: bar.end }, after: { ...after }, mode, source }
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
  previews.value = new Map(drag.group.map((bar, i) => [bar.id, { range: ranges[i]!, rowShift: shift }]))
}

const scrollEdge = 40
const scrollSpeed = 24
function autoScrollStep() {
  scrollFrame = 0
  const el = scroller.value
  if (!drag || !el) return
  if (previews.value) {
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
      if (el.scrollLeft !== before) updatePreview()
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
  if (preview) suppressSelection = id
  cancelEdit()
  proposeAll(changes)
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
  if (!editable(bar) || drag) return
  if (props.rowDraggable && (event.key === 'ArrowUp' || event.key === 'ArrowDown') && !event.altKey && !event.shiftKey) {
    const group = movingGroup(bar)
    const shift = rowShiftFor(group, event.key === 'ArrowUp' ? -1 : 1)
    event.preventDefault()
    if (!shift) return
    pendingFocus = bar.id
    proposeAll(buildChanges(group, group, 'move', 'keyboard', shift))
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
    proposeAll(buildChanges(group, moveTimeRanges(group, delta, activeSnap.value, bounds.value), mode, 'keyboard', 0))
    return
  }
  propose({
    id: bar.id, before, mode, source: 'keyboard',
    after: editTimeRange(before, mode, delta, activeSnap.value, bounds.value, minimum.value),
  })
}

function onBarBlur(id: string) {
  if (focusedBarId.value === id) focusedBarId.value = undefined
  if (pendingReveal === id) pendingReveal = undefined
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
  for (const element of scroller.value?.querySelectorAll<HTMLElement>('[data-vft-bar]') ?? []) {
    if (element.dataset.vftBar === id) return element.focus({ preventScroll: true })
  }
}
// After a keyboard edit, wait for the parent to apply it (new bars), then keep the bar in view.
watch(() => props.bars, async () => {
  const id = pendingReveal
  const moved = pendingFocus
  pendingReveal = undefined
  pendingFocus = undefined
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
    [inlineSide.value]: `calc(var(--vft-label-area-width) + ${x}px)`,
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
  const element = document.elementFromPoint(event.clientX, event.clientY)?.closest<HTMLElement>('[data-vft-link], [data-vft-bar]')
  if (!element || !scroller.value?.contains(element)) {
    linkDraft.value = undefined
    return
  }
  if (element.dataset.vftLink) {
    const [bar, end] = JSON.parse(element.dataset.vftLink) as [string, TimelineBarEnd]
    return completeLink({ bar, end })
  }
  // Dropping on a bar body picks its nearer end.
  const rect = element.getBoundingClientRect()
  const firstHalf = event.clientX < rect.left + rect.width / 2
  completeLink({ bar: element.dataset.vftBar!, end: firstHalf !== rtl.value ? 'start' : 'finish' })
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
  if (!pending || pending.fixed.bar === target.bar || !barById.value.has(target.bar)) return
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
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    selectDependency(id)
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    emit('dependency-delete', id)
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

// A new source interval or coordinate system invalidates an in-flight gesture.
watch([
  () => props.bars, () => props.rows, () => props.collapsedIds, localCollapsed, () => props.headerBands, () => props.columns, () => props.range,
  () => props.scale, () => props.pixelsPerUnit, () => props.snap, () => props.readonly, () => props.editBounds, () => props.minDuration,
  () => props.rowHeight, () => props.laneCount, () => props.autoScroll,
  activePreset, () => props.multiSelect ? props.selectedIds : undefined, () => props.multiSelect, () => props.rowDraggable,
], cancelEdit)

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
/** Width of the row heading column, read from `--vft-row-label-width`. */
function rowLabelWidth() {
  const value = root.value ? parseFloat(getComputedStyle(root.value).getPropertyValue('--vft-row-label-width')) : NaN
  return Number.isFinite(value) && value >= 0 ? value : 154
}
/**
 * A standalone SVG document of the chart with the default rendering: every displayed row (respecting collapsed rows),
 * the whole range at the current zoom, header bands, ticks, markers, the now line and load rows. Slots are not used.
 */
function exportSvg(options: GanttExportOptions = {}) {
  if (validationError.value) throw validationError.value
  const { includeLoad = true, theme, ...rest } = options
  const time = props.now ?? clientNow.value
  return renderTimelineSvg(props.rows, props.bars, props.dependencies, axis.value, {
    idPrefix: 'vft-export-' + marker.replace(/[^\w-]/g, ''),
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
defineExpose({ scrollToTime, scrollToRow, cancelEdit, exportSvg, exportPng })

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
  const corner = scroller.value.querySelector('.vft-gantt-corner')
  if (corner) observer.observe(corner)
})
onUnmounted(() => {
  mounted = false
  cancelEdit()
  observer?.disconnect()
  if (nowTimer !== undefined) clearInterval(nowTimer)
})
</script>

<template>
  <div ref="root" class="vft-gantt" :class="{ 'vft-rtl': rtl }" :dir="dir === 'rtl' ? 'rtl' : undefined">
    <div class="vft-gantt-toolbar">
      <slot name="legend" />
      <div v-if="zoomPresets?.length" class="vft-gantt-presets" role="group" :aria-label="messages.zoomPresets">
        <button v-for="preset in zoomPresets" :key="preset.id" type="button" :aria-pressed="activePreset?.id === preset.id"
          @click="choosePreset(preset.id)">{{ preset.label }}</button>
      </div>
      <div v-if="showControls !== false" class="vft-gantt-zoom" role="group" :aria-label="messages.zoom">
        <button type="button" :aria-label="messages.zoomOut" :disabled="zoom <= minZoom" @click="setZoom(1 / 1.35)">−</button>
        <output>{{ Math.round(zoom * 100) }}%</output>
        <button type="button" :aria-label="messages.zoomIn" :disabled="zoom >= maxZoom" @click="setZoom(1.35)">＋</button>
      </div>
    </div>
    <div
      ref="scroller" class="vft-gantt-scroll" :class="{ 'vft-pinch-zoom': pinchZoom }" :style="{ height: typeof height === 'number' ? height + 'px' : height }" role="region" :aria-label="messages.region" tabindex="0"
      @keydown.esc="cancelEdit" @scroll.passive="syncViewport" @pointerdown="trackTouch"
      @pointermove="moveTouch($event); moveEdit($event); moveLink($event)"
      @pointerup="endTouch($event); finishEdit($event); finishLink($event)"
      @pointercancel="endTouch($event); finishEdit($event); finishLink($event)"
      @lostpointercapture="finishEdit($event); finishLink($event)"
    >
      <div v-if="!validationError" ref="canvas" class="vft-gantt-canvas" :style="{
        width: `calc(var(--vft-label-area-width) + ${axis.width}px)`,
        height: `${headerHeight + bodyHeight + loadHeight}px`,
        '--vft-label-area-width': `calc(var(--vft-row-label-width) + ${columnWidth}px)`,
        '--vft-header-height': `${headerHeight}px`,
        '--vft-axis-width': `${axis.width}px`,
        '--vft-grid-step': `${gridStep}px`,
      }">
        <div class="vft-gantt-head">
          <div class="vft-gantt-corner" :class="{ 'vft-column-group': columns?.length }">
            <div class="vft-name-column"><slot name="row-heading">{{ messages.rows }}</slot></div>
            <div v-for="column in columns" :key="column.id" class="vft-extra-column" :style="{ width: column.width + 'px' }">{{ column.label }}</div>
          </div>
          <div class="vft-gantt-time-head" :style="{ top: (headerHeight - 40) + 'px' }">
            <span v-for="tick in ticks" :key="tick" class="vft-gantt-tick" :class="{ end: tick === range.end }" :style="{ [inlineSide]: `${axis.toX(tick)}px` }"><slot name="tick" :time="tick" :label="formatTime(tick)">{{ formatTime(tick) }}</slot></span>
          </div>
          <div v-for="(level, index) in shownBands" :key="index" class="vft-gantt-band-level"
            :style="{ top: (index * bandHeight) + 'px', height: bandHeight + 'px' }">
            <div v-for="band in level" :key="band.start" class="vft-gantt-band"
              :style="{ [inlineSide]: band.x + 'px', width: band.width + 'px' }">{{ band.label }}</div>
          </div>
        </div>
        <div class="vft-gantt-grid" aria-hidden="true"></div>
        <div v-for="item in shownMarkers" :key="item.id" class="vft-gantt-marker"
          :style="{ [inlineSide]: `calc(var(--vft-label-area-width) + ${axis.toX(item.time)}px)` }">
          <span>{{ item.label }}</span>
        </div>
        <div v-if="nowTime !== undefined" class="vft-gantt-marker vft-gantt-now" :title="`${messages.now} ${formatTime(nowTime)}`"
          :style="{ [inlineSide]: `calc(var(--vft-label-area-width) + ${axis.toX(nowTime)}px)` }">
          <span>{{ messages.now }}</span>
        </div>
        <div v-for="row in shownRows" :key="row.row.id" class="vft-gantt-row"
          :style="{ top: `${headerHeight + row.index * rowHeight}px`, height: `${rowHeight}px` }"
        >
          <div class="vft-gantt-row-label" :class="{ 'vft-column-group': columns?.length }"
          >
            <div class="vft-name-column" :class="{ 'vft-tree-row': row.hasChildren || row.depth > 0 }"
              :style="{ '--vft-row-depth': Math.min(row.depth, 5) }">
            <button v-if="row.hasChildren" type="button" class="vft-row-toggle"
              :aria-expanded="!collapsed.has(row.row.id)"
              :aria-label="`${collapsed.has(row.row.id) ? messages.expandRow : messages.collapseRow} ${row.row.label}`"
              @click="toggleRow(row.row.id)">{{ collapsed.has(row.row.id) ? (rtl ? '◂' : '▸') : '▾' }}</button>
            <div class="vft-row-content">
              <slot name="row" :row="row.row" :index="row.index" :depth="row.depth" :expanded="!collapsed.has(row.row.id)">
                <strong>{{ row.row.label }}</strong>
                <small v-if="row.row.detail">{{ row.row.detail }}</small>
              </slot>
            </div>
            </div>
            <div v-for="column in columns" :key="column.id" class="vft-extra-column" :style="{ width: column.width + 'px' }">
              <slot name="cell" :row="row.row" :column="column" :value="cellValue(row.row, column)" :summary="summaries?.get(row.row.id)">
                <input v-if="canEditCell(row.row, column)" class="vft-cell-input" type="text"
                  :aria-label="row.row.label + ' · ' + column.label" :value="cellValue(row.row, column)"
                  @change="commitCell($event, row.row, column)" @keydown.enter.prevent="($event.target as HTMLInputElement).blur()"
                  @keydown.esc.stop.prevent="cancelCell($event, row.row, column)">
                <span v-else :title="String(cellValue(row.row, column))">{{ cellValue(row.row, column) }}</span>
              </slot>
            </div>
          </div>
          <div v-if="row.summary && intersectsWindow(row.summary, timeWindow)" class="vft-gantt-summary"
            :style="summaryStyle(row.summary)"
            :title="`${row.row.label} · ${row.summary.count} · ${formatTime(row.summary.start)}–${formatTime(row.summary.end)}`">
            <span v-if="row.summary.progress !== undefined" :style="{ width: (row.summary.progress * 100) + '%' }"></span>
          </div>
          <div v-for="bar in row.baselines" :key="bar.id" class="vft-gantt-baseline"
            :style="baselineStyle(bar)" :title="`${messages.baseline} · ${bar.label} ${formatTime(bar.baseline!.start)}–${formatTime(bar.baseline!.end)}`"></div>
          <button
            v-for="bar in row.bars" :key="bar.id" type="button" class="vft-gantt-bar"
            :class="[`vft-tone-${bar.tone ?? 'blue'}`, bar.appearance === 'outline' ? 'outline' : 'solid', {
              selected: selectedIds?.has(bar.id), editable: editable(bar), dragging: previews?.has(bar.id), milestone: bar.start === bar.end,
            }]"
            :style="barStyle(bar)" :data-vft-bar="bar.id"
            :title="`${bar.label} ${formatTime(rangeOf(bar).start)}–${formatTime(rangeOf(bar).end)}`"
            :aria-label="`${bar.label} ${formatTime(rangeOf(bar).start)}–${formatTime(rangeOf(bar).end)}`"
            :aria-pressed="Boolean(selectedIds?.has(bar.id))"
            @keydown="editWithKeys($event, bar)" @focus="focusedBarId = bar.id" @blur="onBarBlur(bar.id)"
            :aria-describedby="editable(bar) ? (rowDraggable ? `${marker}-hint ${marker}-row-hint` : marker + '-hint') : undefined"
            @pointerdown="startEdit($event, bar)" @click="clickBar(bar, $event)"
          >
            <span v-if="bar.progress !== undefined" class="vft-bar-progress" :style="{ width: (bar.progress * 100) + '%' }" aria-hidden="true"></span>
            <slot name="bar" :bar="bar" :range="rangeOf(bar)" :selected="Boolean(selectedIds?.has(bar.id))">
              <span class="vft-bar-text">{{ bar.label }}</span>
            </slot>
            <span v-if="editable(bar) && bar.end - bar.start >= minimum" class="vft-bar-handle first" data-edit-mode="start" aria-hidden="true"></span>
            <span v-if="editable(bar) && bar.end - bar.start >= minimum" class="vft-bar-handle last" data-edit-mode="end" aria-hidden="true"></span>
          </button>
          <template v-if="linkHandlesVisible">
            <template v-for="bar in row.bars" :key="bar.id + ':links'">
              <button v-for="end in (['start', 'finish'] as const)" :key="end" type="button" class="vft-gantt-link-handle"
                :class="[end, { active: linkPressed(bar, end) }]" :style="linkHandleStyle(bar, end)"
                :data-vft-link="linkKey({ bar: bar.id, end })" :aria-label="linkHandleName(bar, end)"
                :aria-pressed="linkPressed(bar, end)"
                @pointerdown="startLink($event, bar, end)" @click.stop="activateLink(bar, end, $event)"
                @keydown.enter.stop.prevent="activateLink(bar, end, $event)" @keydown.space.stop.prevent="activateLink(bar, end, $event)"></button>
            </template>
          </template>
        </div>
        <svg v-if="shownLines.length" class="vft-gantt-links" aria-hidden="true"
          :width="xWindow.right - xWindow.left" :height="(rowWindow.afterLast - rowWindow.first) * rowHeight"
          :style="{
            [inlineSide]: `calc(var(--vft-label-area-width) + ${xWindow.left}px)`,
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
        <svg v-if="dependencyTargets && shownLines.length" class="vft-gantt-link-hits"
          :width="xWindow.right - xWindow.left" :height="(rowWindow.afterLast - rowWindow.first) * rowHeight"
          :style="{
            [inlineSide]: `calc(var(--vft-label-area-width) + ${xWindow.left}px)`,
            top: `${headerHeight + rowWindow.first * rowHeight}px`,
          }"
          :viewBox="`${xWindow.left} ${rowWindow.first * rowHeight} ${xWindow.right - xWindow.left} ${(rowWindow.afterLast - rowWindow.first) * rowHeight}`"
        >
          <path v-for="line in shownLines" :key="line.id" class="vft-dependency-hit" :class="{ active: activeDependencyId === line.id }"
            :d="line.path" role="button" tabindex="0" :aria-label="`${messages.selectDependency} ${dependencyName(line.dependency)}`"
            :aria-pressed="activeDependencyId === line.id"
            @click="selectDependency(line.id)" @keydown="dependencyKeys($event, line.id)" />
        </svg>
        <button v-for="item in reconnectHandles" :key="item.end" type="button" class="vft-gantt-reconnect-handle"
          :style="{ [inlineSide]: `calc(var(--vft-label-area-width) + ${item.x - 6}px)`, top: `${headerHeight + item.y - 6}px` }"
          :aria-label="item.label" :aria-pressed="Boolean(linkDraft?.dependency && linkDraft.role === item.end)"
          @pointerdown="reconnectDependency(item.dependency, item.end, $event)"
          @click.stop="clickReconnect(item.dependency, item.end)"
          @keydown.enter.stop.prevent="reconnectDependency(item.dependency, item.end)"
          @keydown.space.stop.prevent="reconnectDependency(item.dependency, item.end)"></button>
        <svg v-if="linkPreviewPath" class="vft-gantt-link-preview" width="1" height="1" overflow="visible" aria-hidden="true"
          :style="{ top: `${headerHeight}px` }">
          <path :d="linkPreviewPath" />
        </svg>
        <div v-for="item in shownLoadRows" :key="item.row.id" class="vft-gantt-load-row" role="group"
          :aria-label="`${messages.loadRegion} ${item.row.label}`"
          :style="{ top: `${headerHeight + bodyHeight + item.index * loadRowHeight}px`, height: `${loadRowHeight}px` }">
          <div class="vft-gantt-row-label">
            <slot name="load-row" :row="item.row" :peak="item.peak">
              <strong>{{ item.row.label }}</strong>
              <small v-if="item.row.detail">{{ item.row.detail }}</small>
            </slot>
          </div>
          <div v-for="segment in item.segments" :key="segment.key" class="vft-gantt-load-segment"
            :class="{ overloaded: segment.overload > 0, idle: segment.segment.load === 0 }" role="img"
            :aria-label="segment.label" :title="segment.label"
            :style="{ [inlineSide]: `calc(var(--vft-label-area-width) + ${segment.left}px)`, width: `${segment.width}px` }">
            <slot name="load-segment" :segment="segment.segment" :row="item.row" :peak="item.peak" :overload="segment.overload">
              <span class="vft-load-fill" :style="{ height: segment.fill + '%' }"></span>
              <span v-if="segment.overload > 0" class="vft-load-over" :style="{ bottom: segment.capacity + '%', height: segment.over + '%' }"></span>
              <span class="vft-load-capacity" :style="{ bottom: segment.capacity + '%' }"></span>
            </slot>
          </div>
        </div>
      </div>
    </div>
    <div v-if="validationError || !rows.length" class="vft-gantt-empty"><slot name="empty">{{ messages.empty }}</slot></div>
    <span :id="marker + '-hint'" class="vft-sr-only">{{ messages.editHint }}</span>
    <span v-if="rowDraggable" :id="marker + '-row-hint'" class="vft-sr-only">{{ messages.moveRowHint }}</span>
    <span class="vft-sr-only" aria-live="polite">{{ notice }}</span>
  </div>
</template>
