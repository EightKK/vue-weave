<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, shallowRef, useId, watch } from 'vue'
import type { TimelineBar, TimelineDependency, TimelineRow, TimelineEdit, GanttLabels, EditValidator, TimelineBand, TimelineMarker, TimelineColumn, TimelineCellEdit, TimelineSummary } from '../core/types.js'
import {
  createTimeScale, createTimelineRowTree, dependencyPath, dependencyTimes, editTimeRange, intersectsWindow, validateTimelineData,
  summarizeTimelineRows, timeTicks, visibleRows, type EditMode, type TimeRange, type TimeScale,
} from '../core/timeline.js'

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
}>(), {
  showControls: true,
  autoScroll: true,
  dependencies: () => [],
  rowHeight: 66,
  laneCount: 1,
  pixelsPerUnit: 80 / 3_600_000,
  tickSteps: () => [1_800_000, 3_600_000, 7_200_000, 14_400_000, 86_400_000],
  snap: 900_000,
  formatTime: (time: number) => new Date(time).toISOString().slice(11, 16),
})
const emit = defineEmits<{
  select: [id: string]
  'validation-error': [error: Error]
  edit: [change: TimelineEdit]
  'update:collapsedIds': [ids: Set<string>]
  'cell-edit': [change: TimelineCellEdit]
  'cell-edit-rejected': [change: TimelineCellEdit, reason: string]
  'edit-rejected': [change: TimelineEdit, reason: string]
}>()

defineSlots<{
  legend(): unknown
  'row-heading'(): unknown
  row(props: { row: TimelineRow; index: number; depth: number; expanded: boolean }): unknown
  cell(props: { row: TimelineRow; column: TimelineColumn; value: string | number; summary?: TimelineSummary }): unknown
  bar(props: { bar: TimelineBar; range: TimeRange; selected: boolean }): unknown
  tick(props: { time: number; label: string }): unknown
  empty(): unknown
}>()
const messages = computed<GanttLabels>(() => ({
  region: 'Gantt chart', rows: 'Rows', empty: 'No rows to display',
  zoom: 'Timeline zoom', zoomIn: 'Zoom in', zoomOut: 'Zoom out',
  editHint: 'Arrow keys move. Shift resizes the end. Alt resizes the start. Escape cancels.',
  expandRow: 'Expand', collapseRow: 'Collapse', baseline: 'Baseline',
  rejected: 'This change was rejected.', ...props.labels,
}))
const notice = ref('')
const bounds = computed(() => props.editBounds ?? props.range)
const minimum = computed(() => props.minDuration ?? props.snap)
// Invalid input is reported through `validation-error` and never rendered. The error is rethrown so
// development builds still surface it (production Vue logs it instead of rendering invalid data).
const validationError = ref<Error>()
const tree = shallowRef<ReturnType<typeof createTimelineRowTree>>([])
function validateProps() {
  validateTimelineData(props.rows, props.bars, props.dependencies, props.laneCount)
  createTimeScale(props.range, props.pixelsPerUnit)
  createTimeScale(bounds.value, 1)
  if (!Number.isFinite(props.rowHeight) || props.rowHeight < 8 + props.laneCount * 14) throw new RangeError('rowHeight is too small for laneCount')
  if (!Number.isFinite(props.snap) || props.snap <= 0 || !Number.isFinite(minimum.value) || minimum.value <= 0) throw new RangeError('Invalid snap or minDuration')
  if (!props.tickSteps.length || props.tickSteps.some((step, i) => !Number.isFinite(step) || step <= 0 || (i > 0 && step < props.tickSteps[i - 1]!))) throw new RangeError('tickSteps must be positive and ascending')
  if (props.scale && (!Number.isFinite(props.scale.width) || props.scale.width <= 0)) throw new RangeError('Invalid time scale width')
  // Derive the hierarchy here so parent references and cycles use the same error boundary.
  return createTimelineRowTree(props.rows)
}
// Controlled props are watched by reference. Pass new arrays and objects instead of mutating them in place.
watch([
  () => props.rows, () => props.bars, () => props.dependencies, () => props.laneCount, () => props.rowHeight, () => props.snap,
  () => props.range, () => props.editBounds, () => props.minDuration, () => props.tickSteps, () => props.pixelsPerUnit, () => props.scale,
], () => {
  try {
    tree.value = validateProps()
    validationError.value = undefined
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error))
    tree.value = []
    validationError.value = failure
    emit('validation-error', failure)
    throw error
  }
}, { immediate: true })
const marker = useId()
const scroller = ref<HTMLElement>()
const viewport = ref({ width: 1150, height: 321, left: 0, top: 0, labels: 154 })
const bandHeight = 26
const headerHeight = computed(() => 40 + bandHeight * (props.headerBands?.length ?? 0))
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
const axis = computed<TimeScale>(() => {
  const base = props.scale ?? createTimeScale(props.range, props.pixelsPerUnit)
  if (!Number.isFinite(base.width) || base.width <= 0) throw new RangeError('Invalid time scale width')
  return { width: base.width * zoom.value, toX: time => base.toX(time) * zoom.value, toTime: x => base.toTime(x / zoom.value) }
})
const tickStep = computed(() => props.tickSteps.find(step => axis.value.toX(props.range.start + step) >= 76)
  ?? props.tickSteps.at(-1) ?? props.snap)
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
const shownBands = computed(() => (props.headerBands ?? []).map(level => {
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
const ticks = computed(() => timeTicks(timeWindow.value, tickStep.value, props.range.start))
const gridStep = computed(() => axis.value.toX(props.range.start + tickStep.value))
const preview = ref<{ id: string; range: TimeRange }>()
const focusedBarId = ref<string>()
let pendingReveal: string | undefined
let lastClientX = 0
let scrollFrame = 0
let drag: { id: string; pointerId: number; initialX: number; initial: TimeRange; mode: EditMode; target: HTMLElement } | undefined
let observer: ResizeObserver | undefined

function rangeOf(bar: TimelineBar) {
  return preview.value?.id === bar.id ? preview.value.range : bar
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
      bars: bars.filter(bar => preview.value?.id === bar.id || focusedBarId.value === bar.id || intersectsWindow(rangeOf(bar), timeWindow.value)),
      summary: item.hasChildren && props.showSummaries && !bars.length ? summaries.value?.get(item.row.id) : undefined,
      baselines: bars.filter(bar => bar.baseline && intersectsWindow(bar.baseline, timeWindow.value)),
    }
  })
})

const shownLines = computed(() => {
  const { first, afterLast } = rowWindow.value
  const { left, right } = xWindow.value
  return (validationError.value ? [] : props.dependencies).flatMap(dep => {
    const source = barById.value.get(dep.from)
    const target = barById.value.get(dep.to)
    if (!source || !target) return []
    const sourceRow = rowOrder.value.get(source.rowId)
    const targetRow = rowOrder.value.get(target.rowId)
    if (sourceRow === undefined || targetRow === undefined) return []
    if (Math.max(sourceRow, targetRow) < first || Math.min(sourceRow, targetRow) >= afterLast) return []
    const endpoints = dependencyTimes(rangeOf(source), rangeOf(target), dep.type)
    const x1 = axis.value.toX(endpoints.from)
    const x2 = axis.value.toX(endpoints.to)
    if (Math.max(x1, x2) + 10 < left || Math.min(x1, x2) - 10 > right) return []
    const y1 = sourceRow * props.rowHeight + laneTop(source) + barHeight.value / 2
    const y2 = targetRow * props.rowHeight + laneTop(target) + barHeight.value / 2
    return [{ ...dep, path: dependencyPath(x1, y1, x2, y2) }]
  })
})

function barStyle(bar: TimelineBar) {
  const range = rangeOf(bar)
  const left = axis.value.toX(range.start)
  const width = axis.value.toX(range.end) - left
  return {
    left: `calc(var(--vft-label-area-width) + ${left - (width === 0 ? 5 : 0)}px)`,
    width: `${width === 0 ? 10 : width}px`,
    height: `${barHeight.value}px`,
    top: `${laneTop(bar)}px`,
  }
}

function summaryStyle(summary: TimelineSummary) {
  const left = axis.value.toX(summary.start)
  return {
    left: `calc(var(--vft-label-area-width) + ${left}px)`,
    width: `${Math.max(3, axis.value.toX(summary.end) - left)}px`,
  }
}

function baselineStyle(bar: TimelineBar) {
  const baseline = bar.baseline!
  const left = axis.value.toX(baseline.start)
  const width = axis.value.toX(baseline.end) - left
  return {
    left: `calc(var(--vft-label-area-width) + ${left - (width === 0 ? 1.5 : 0)}px)`,
    width: `${Math.max(3, width)}px`,
    top: `${laneTop(bar) + barHeight.value + 1}px`,
  }
}

function syncViewport() {
  const el = scroller.value
  if (!el) return
  const labels = el.querySelector('.vft-gantt-corner')?.getBoundingClientRect().width ?? 154
  viewport.value = {
    width: el.clientWidth, height: el.clientHeight, left: el.scrollLeft, top: el.scrollTop, labels,
  }
}

async function setZoom(factor: number) {
  const el = scroller.value
  if (!el || drag) return
  const center = Math.max(0, (el.clientWidth - viewport.value.labels) / 2)
  const time = axis.value.toTime(el.scrollLeft + center)
  zoom.value = Math.max(0.65, Math.min(3, zoom.value * factor))
  await nextTick()
  el.scrollLeft = axis.value.toX(time) - center
  syncViewport()
}

function editable(bar: TimelineBar) {
  return !props.readonly && Boolean(bar.editable) && bar.start >= bounds.value.start && bar.end <= bounds.value.end
}

function cancelEdit() {
  const previous = drag
  drag = undefined
  preview.value = undefined
  stopAutoScroll()
  if (previous?.target.hasPointerCapture(previous.pointerId)) previous.target.releasePointerCapture(previous.pointerId)
}

function propose(change: TimelineEdit) {
  if (change.before.start === change.after.start && change.before.end === change.after.end) return
  const result = props.validateEdit?.(change)
  if (result === false || typeof result === 'string') {
    notice.value = typeof result === 'string' ? result : messages.value.rejected
    emit('edit-rejected', change, notice.value)
  } else {
    notice.value = ''
    emit('edit', change)
  }
}

function startEdit(event: PointerEvent, bar: TimelineBar) {
  if (!editable(bar) || drag || !event.isPrimary || event.button !== 0) return
  const target = event.target as HTMLElement
  const mode = (target.closest<HTMLElement>('[data-edit-mode]')?.dataset.editMode ?? 'move') as EditMode
  if (mode !== 'move' && bar.end - bar.start < minimum.value) return
  const control = event.currentTarget as HTMLElement
  control.focus({ preventScroll: true })
  drag = {
    id: bar.id, pointerId: event.pointerId,
    initialX: event.clientX + (scroller.value?.scrollLeft ?? 0),
    initial: { start: bar.start, end: bar.end }, mode, target: control,
  }
  control.setPointerCapture(event.pointerId)
  lastClientX = event.clientX
  startAutoScroll()
}

function moveEdit(event: PointerEvent) {
  if (!drag || drag.pointerId !== event.pointerId) return
  lastClientX = event.clientX
  updatePreview()
}

function updatePreview() {
  if (!drag) return
  const deltaX = lastClientX + (scroller.value?.scrollLeft ?? 0) - drag.initialX
  if (Math.abs(deltaX) < 2 && !preview.value) return
  const anchor = drag.mode === 'end' ? drag.initial.end : drag.initial.start
  const deltaTime = axis.value.toTime(axis.value.toX(anchor) + deltaX) - anchor
  preview.value = {
    id: drag.id,
    range: editTimeRange(drag.initial, drag.mode, deltaTime, props.snap, bounds.value, minimum.value),
  }
}

const scrollEdge = 40
const scrollSpeed = 24
function autoScrollStep() {
  scrollFrame = 0
  const el = scroller.value
  if (!drag || !el) return
  if (preview.value) {
    const rect = el.getBoundingClientRect()
    const left = rect.left + viewport.value.labels + scrollEdge
    const right = rect.right - scrollEdge
    const depth = lastClientX < left ? (left - lastClientX) / scrollEdge : lastClientX > right ? (lastClientX - right) / scrollEdge : 0
    if (depth > 0) {
      const before = el.scrollLeft
      el.scrollLeft += (lastClientX < left ? -1 : 1) * Math.ceil(Math.min(1, depth) * scrollSpeed)
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
  updatePreview()
  const change = preview.value ? {
    id: drag.id, before: { ...drag.initial }, after: { ...preview.value.range },
    mode: drag.mode, source: 'pointer' as const,
  } : undefined
  cancelEdit()
  if (change) propose(change)
}

function editWithKeys(event: KeyboardEvent, bar: TimelineBar) {
  if (event.key === 'Escape') return cancelEdit()
  if (!editable(bar) || drag || !['ArrowLeft', 'ArrowRight'].includes(event.key)) return
  const mode: EditMode = event.altKey ? 'start' : event.shiftKey ? 'end' : 'move'
  if (mode !== 'move' && bar.end - bar.start < minimum.value) return
  event.preventDefault()
  const before = { start: bar.start, end: bar.end }
  const delta = event.key === 'ArrowLeft' ? -props.snap : props.snap
  pendingReveal = bar.id
  propose({
    id: bar.id, before, mode, source: 'keyboard',
    after: editTimeRange(before, mode, delta, props.snap, bounds.value, minimum.value),
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
  if (left < el.scrollLeft) el.scrollLeft = Math.max(0, left - margin)
  else if (right > el.scrollLeft + visibleWidth) el.scrollLeft = Math.max(0, right - visibleWidth + margin)
  syncViewport()
}
// After a keyboard edit, wait for the parent to apply it (new bars), then keep the bar in view.
watch(() => props.bars, async () => {
  const id = pendingReveal
  if (id === undefined) return
  pendingReveal = undefined
  await nextTick()
  if (focusedBarId.value === id) revealBar(id)
})

// A new source interval or coordinate system invalidates an in-flight gesture.
watch([
  () => props.bars, () => props.rows, () => props.collapsedIds, localCollapsed, () => props.headerBands, () => props.columns, () => props.range,
  () => props.scale, () => props.pixelsPerUnit, () => props.snap, () => props.readonly, () => props.editBounds, () => props.minDuration,
  () => props.rowHeight, () => props.laneCount, () => props.autoScroll,
], cancelEdit)
function scrollToTime(time: number) {
  if (!Number.isFinite(time)) throw new RangeError('time must be finite')
  if (scroller.value) scroller.value.scrollLeft = axis.value.toX(time)
  syncViewport()
}
function scrollToRow(id: string) {
  const index = rowOrder.value.get(id)
  if (index !== undefined && scroller.value) scroller.value.scrollTop = index * props.rowHeight
  syncViewport()
}
defineExpose({ scrollToTime, scrollToRow, cancelEdit })

onMounted(() => {
  if (!scroller.value) return
  syncViewport()
  observer = new ResizeObserver(syncViewport)
  observer.observe(scroller.value)
  const corner = scroller.value.querySelector('.vft-gantt-corner')
  if (corner) observer.observe(corner)
})
onUnmounted(() => { cancelEdit(); observer?.disconnect() })
</script>

<template>
  <div class="vft-gantt">
    <div class="vft-gantt-toolbar">
      <slot name="legend" />
      <div v-if="showControls !== false" class="vft-gantt-zoom" role="group" :aria-label="messages.zoom">
        <button type="button" :aria-label="messages.zoomOut" :disabled="zoom <= 0.65" @click="setZoom(1 / 1.35)">−</button>
        <output>{{ Math.round(zoom * 100) }}%</output>
        <button type="button" :aria-label="messages.zoomIn" :disabled="zoom >= 3" @click="setZoom(1.35)">＋</button>
      </div>
    </div>
    <div
      ref="scroller" class="vft-gantt-scroll" :style="{ height: typeof height === 'number' ? height + 'px' : height }" role="region" :aria-label="messages.region" tabindex="0"
      @keydown.esc="cancelEdit" @scroll.passive="syncViewport" @pointermove="moveEdit" @pointerup="finishEdit"
      @pointercancel="finishEdit" @lostpointercapture="finishEdit"
    >
      <div v-if="!validationError" class="vft-gantt-canvas" :style="{
        width: `calc(var(--vft-label-area-width) + ${axis.width}px)`,
        height: `${headerHeight + bodyHeight}px`,
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
            <span v-for="tick in ticks" :key="tick" class="vft-gantt-tick" :class="{ end: tick === range.end }" :style="{ left: `${axis.toX(tick)}px` }"><slot name="tick" :time="tick" :label="formatTime(tick)">{{ formatTime(tick) }}</slot></span>
          </div>
          <div v-for="(level, index) in shownBands" :key="index" class="vft-gantt-band-level"
            :style="{ top: (index * bandHeight) + 'px', height: bandHeight + 'px' }">
            <div v-for="band in level" :key="band.start" class="vft-gantt-band"
              :style="{ left: band.x + 'px', width: band.width + 'px' }">{{ band.label }}</div>
          </div>
        </div>
        <div class="vft-gantt-grid" aria-hidden="true"></div>
        <div v-for="item in shownMarkers" :key="item.id" class="vft-gantt-marker"
          :style="{ left: `calc(var(--vft-label-area-width) + ${axis.toX(item.time)}px)` }">
          <span>{{ item.label }}</span>
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
              @click="toggleRow(row.row.id)">{{ collapsed.has(row.row.id) ? '▸' : '▾' }}</button>
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
              selected: selectedIds?.has(bar.id), editable: editable(bar), dragging: preview?.id === bar.id, milestone: bar.start === bar.end,
            }]"
            :style="barStyle(bar)"
            :title="`${bar.label} ${formatTime(rangeOf(bar).start)}–${formatTime(rangeOf(bar).end)}`"
            :aria-label="`${bar.label} ${formatTime(rangeOf(bar).start)}–${formatTime(rangeOf(bar).end)}`"
            :aria-pressed="Boolean(selectedIds?.has(bar.id))"
            @keydown="editWithKeys($event, bar)" @focus="focusedBarId = bar.id" @blur="onBarBlur(bar.id)" :aria-describedby="editable(bar) ? marker + '-hint' : undefined" @pointerdown="startEdit($event, bar)" @click="emit('select', bar.id)"
          >
            <span v-if="bar.progress !== undefined" class="vft-bar-progress" :style="{ width: (bar.progress * 100) + '%' }" aria-hidden="true"></span>
            <slot name="bar" :bar="bar" :range="rangeOf(bar)" :selected="Boolean(selectedIds?.has(bar.id))">
              <span class="vft-bar-text">{{ bar.label }}</span>
            </slot>
            <span v-if="editable(bar) && bar.end - bar.start >= minimum" class="vft-bar-handle first" data-edit-mode="start" aria-hidden="true"></span>
            <span v-if="editable(bar) && bar.end - bar.start >= minimum" class="vft-bar-handle last" data-edit-mode="end" aria-hidden="true"></span>
          </button>
        </div>
        <svg v-if="shownLines.length" class="vft-gantt-links" aria-hidden="true"
          :width="xWindow.right - xWindow.left" :height="(rowWindow.afterLast - rowWindow.first) * rowHeight"
          :style="{
            left: `calc(var(--vft-label-area-width) + ${xWindow.left}px)`,
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
            :class="{ related: selectedIds?.has(line.from) || selectedIds?.has(line.to), highlighted: highlightedDependencyIds?.has(line.id) }"
            :d="line.path" :marker-end="`url(#${marker})`"
          />
        </svg>
      </div>
    </div>
    <div v-if="validationError || !rows.length" class="vft-gantt-empty"><slot name="empty">{{ messages.empty }}</slot></div>
    <span :id="marker + '-hint'" class="vft-sr-only">{{ messages.editHint }}</span>
    <span class="vft-sr-only" aria-live="polite">{{ notice }}</span>
  </div>
</template>
