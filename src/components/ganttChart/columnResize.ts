// Column resizing of GanttChart (`columnsResizable`): the widths of the row label column and the extra columns, the
// separators at the inline-end edge of each header cell, their pointer preview and keyboard steps, and the proposal.
// The parent accepts `column-resize` by setting the column width or `labelWidth`. Nothing here depends on the time
// axis: the chart passes in its gesture record (one pointer gesture at a time), the inline side and the validator.
import { computed, ref, shallowRef, watch, type Ref } from 'vue'
import type { TimelineColumn, TimelineColumnResize, TimelineRow } from '../../core/types.js'
import { timelineLabelColumnId } from '../../core/timeline.js'
import type { ValidatorResult } from '../shared/validation.js'
import { clampWidth, columnWidthForKey } from './editing.js'
import type { HeaderControls } from './headerControls.js'
import type { InlineSide } from './geometry.js'

/** The pointer gesture of a separator drag, as the chart's gesture record holds it. */
export interface ColumnGesture { type: 'column'; id: string; pointerId: number; target: HTMLElement; x: number; before: number }

/** The props that column resizing reads. */
export interface ColumnResizeProps<R extends TimelineRow> {
  readonly columns?: readonly TimelineColumn<R>[]
  readonly columnsResizable?: boolean
  readonly labelWidth?: number
  readonly minColumnWidth?: number
  readonly maxColumnWidth?: number
  readonly validateColumnResize?: (change: TimelineColumnResize) => boolean | string | void
}

export interface ColumnResizeOptions<R extends TimelineRow> {
  props: ColumnResizeProps<R>
  /** The chart root, whose `--vw-row-label-width` gives the label column width when `labelWidth` is not set. */
  root: Ref<HTMLElement | undefined>
  mounted: () => boolean
  /** Whether the props failed validation; no separators are drawn then. */
  invalid: () => boolean
  side: () => InlineSide
  rtl: () => boolean
  labels: () => { rows: string; resizeColumn: string; columnResizeRejected: string }
  /** Announce a validator result and return its rejection reason (undefined accepts). */
  settle: (result: ValidatorResult, fallback?: string) => string | undefined
  propose: (change: TimelineColumnResize) => void
  reject: (change: TimelineColumnResize, reason: string) => void
  /** The pointer position along the inline axis: `clientX`, negated in right-to-left charts. */
  inlineClientX: (clientX: number) => number
  /** Whether a press may start a pointer gesture (primary button, no gesture in flight). */
  primaryPress: (event: PointerEvent) => boolean
  /** Whether a pointer gesture or an armed connection owns the pointer or keyboard. */
  gestureActive: () => boolean
  /** Record the separator drag as the chart's gesture and capture the pointer on `target`. */
  begin: (event: PointerEvent, target: HTMLElement, start: Omit<ColumnGesture, 'pointerId' | 'target'>) => void
  /** The separator drag in flight that the pointer of `event` owns. */
  owned: (event: PointerEvent) => ColumnGesture | undefined
  /** Finish the drag on `pointerup`, or cancel every gesture for any other end (the chart's `endOwnedGesture`). */
  end: (active: ColumnGesture, event: PointerEvent) => void
  /** Forget the separator drag and release its pointer capture. */
  release: () => void
}

/** One cell of the header row: a column title or a resize separator. */
export interface HeaderCell {
  key: string
  className: string
  style: Record<string, string>
  attrs: Record<string, string | number>
  on: Record<string, (event: Event) => void>
  text: string
  /** Sort and filter controls (`sortableColumns`, `filterableColumns`); absent keeps the plain header cell. */
  controls?: HeaderControls
}

export function useColumnResize<R extends TimelineRow>(options: ColumnResizeOptions<R>) {
  const { props } = options
  const minColumnSize = computed(() => props.minColumnWidth ?? 48)
  const maxColumnSize = computed(() => Math.max(minColumnSize.value, props.maxColumnWidth ?? 800))
  /** The rendered width of the row label column, read from `--vw-row-label-width` after mounting. */
  const measuredLabelWidth = ref<number>()
  const columnResize = shallowRef<{ id: string; width: number }>()
  /** Total width of the extra columns as the props give them. */
  const columnWidth = computed(() => {
    let width = 0
    for (const column of props.columns ?? []) width += column.width
    return width
  })
  function measureLabelColumn() {
    const root = options.root.value
    if (!props.columnsResizable || columnResize.value || !root) return
    const width = parseFloat(getComputedStyle(root).getPropertyValue('--vw-row-label-width'))
    measuredLabelWidth.value = Number.isFinite(width) && width > 0 ? width : undefined
  }
  watch(() => props.columnsResizable, () => { if (options.mounted()) measureLabelColumn() })
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
    if (!props.columnsResizable || options.invalid()) return []
    const preview = columnResize.value
    const label = props.labelWidth ?? measuredLabelWidth.value ?? 154
    const handles = [{ id: timelineLabelColumnId, label: options.labels().rows, width: label, shown: preview?.id === timelineLabelColumnId ? preview.width : label, offset: 0 }]
    let offset = 0
    for (const column of props.columns ?? []) {
      const shown = shownColumnWidth(column)
      offset += shown
      handles.push({ id: column.id, label: column.label, width: column.width, shown, offset })
    }
    return handles
  })
  type ResizeHandle = (typeof resizeHandles.value)[number]
  function handleCell(handle: ResizeHandle): HeaderCell {
    const pointer = (event: Event) => event as PointerEvent
    return {
      key: '\u0000resize:' + handle.id,
      className: columnResize.value?.id === handle.id ? 'vw-column-resize vw-is-active' : 'vw-column-resize',
      style: { [options.side()]: `calc(var(--vw-row-label-width) + ${handle.offset - 8}px)` },
      attrs: {
        role: 'separator', tabindex: 0, 'aria-orientation': 'vertical', 'aria-label': `${options.labels().resizeColumn} ${handle.label}`,
        'aria-valuenow': handle.shown, 'aria-valuemin': minColumnSize.value, 'aria-valuemax': maxColumnSize.value,
      },
      on: {
        pointerdown: event => startColumnResize(pointer(event), handle),
        pointermove: event => columnPointer(pointer(event), false),
        pointerup: event => columnPointer(pointer(event), true),
        pointercancel: event => columnPointer(pointer(event), true),
        lostpointercapture: event => columnPointer(pointer(event), true),
        keydown: event => columnResizeKeys(event as KeyboardEvent, handle),
      },
      text: '',
    }
  }
  function proposeColumnResize(change: TimelineColumnResize) {
    if (change.before === change.after) return
    const reason = options.settle(props.validateColumnResize?.(change), options.labels().columnResizeRejected)
    if (reason !== undefined) options.reject(change, reason)
    else options.propose(change)
  }
  function startColumnResize(event: PointerEvent, handle: ResizeHandle) {
    // The scroller would otherwise treat the press as the start of a pan, selection or new bar.
    event.stopPropagation()
    if (!props.columnsResizable || !options.primaryPress(event)) return
    // Keep a mouse drag from selecting text; the separator takes focus so that Escape cancels.
    if (event.pointerType !== 'touch') event.preventDefault()
    options.begin(event, event.currentTarget as HTMLElement, { type: 'column', id: handle.id, x: options.inlineClientX(event.clientX), before: handle.width })
  }
  /** Pointer events of a column separator: a move, or the end (`pointerup`, `pointercancel` or a lost capture) of its drag. */
  function columnPointer(event: PointerEvent, end: boolean) {
    const active = options.owned(event)
    if (active && end) options.end(active, event)
    else if (active) moveColumnResize(active, event)
  }
  function moveColumnResize(active: ColumnGesture, event: PointerEvent) {
    // Dragging towards the inline end widens the column: right in left-to-right charts, left in right-to-left charts.
    const width = clampColumnWidth(active.before + options.inlineClientX(event.clientX) - active.x)
    if (columnResize.value?.id !== active.id || columnResize.value.width !== width) columnResize.value = { id: active.id, width }
  }
  function cancelColumnResize() {
    options.release()
    columnResize.value = undefined
  }
  function finishColumnResize(active: ColumnGesture, event: PointerEvent) {
    moveColumnResize(active, event)
    const after = columnResize.value?.width ?? active.before
    cancelColumnResize()
    proposeColumnResize({ id: active.id, before: active.before, after, source: 'pointer' })
  }
  function columnResizeKeys(event: KeyboardEvent, handle: ResizeHandle) {
    const after = columnWidthForKey(event, handle.width, options.rtl(), minColumnSize.value, maxColumnSize.value)
    if (after === undefined) return
    event.preventDefault()
    if (options.gestureActive()) return
    proposeColumnResize({ id: handle.id, before: handle.width, after, source: 'keyboard' })
  }
  return {
    columnResize, columnWidth, columnResizeDelta, labelWidthStyle, resizeHandles, measureLabelColumn, shownColumnWidth, handleCell,
    moveColumnResize, finishColumnResize, cancelColumnResize,
  }
}
