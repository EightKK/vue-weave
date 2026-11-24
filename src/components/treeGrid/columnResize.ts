// Column resizing of TreeGrid (`columnsResizable`): a separator at the inline-end edge of the tree column header and of
// each column header, its pointer preview and keyboard steps, and the `column-resize` proposal. The parent accepts it by
// setting the column's `width`, or `treeColumnWidth` for the tree column (`timelineLabelColumnId`). Modelled on
// GanttChart's separators (ganttChart/columnResize.ts), without its gesture record: the separator captures the pointer.
import { computed, h, shallowRef, type VNode } from 'vue'
import type { ColumnResizeValidator, TimelineColumnResize } from '../../core/types.js'
import { clampWidth, columnWidthForKey } from '../ganttChart/editing.js'
import { rejectionReason } from '../shared/validation.js'

export interface TreeGridColumnResizeOptions {
  props: {
    readonly columnsResizable?: boolean
    readonly minColumnWidth?: number
    readonly maxColumnWidth?: number
    readonly validateColumnResize?: ColumnResizeValidator
  }
  rtl: () => boolean
  labels: () => { resizeColumn: string; columnResizeRejected: string }
  propose: (change: TimelineColumnResize) => void
  reject: (change: TimelineColumnResize, reason: string) => void
}

interface ColumnDrag { id: string; pointerId: number; x: number; before: number; width: number; target: HTMLElement }

export function useTreeGridColumnResize(options: TreeGridColumnResizeOptions) {
  const { props } = options
  const minWidth = computed(() => props.minColumnWidth ?? 48)
  const maxWidth = computed(() => Math.max(minWidth.value, props.maxColumnWidth ?? 800))
  /** The separator drag in flight; its `width` is the previewed width of column `id`. */
  const drag = shallowRef<ColumnDrag>()

  function propose(change: TimelineColumnResize) {
    if (change.before === change.after) return
    const reason = rejectionReason(props.validateColumnResize?.(change), options.labels().columnResizeRejected)
    if (reason !== undefined) options.reject(change, reason)
    else options.propose(change)
  }
  /** Ends the drag in flight without a proposal. Returns whether there was one. */
  function cancel() {
    const now = drag.value
    if (!now) return false
    drag.value = undefined
    if (now.target.hasPointerCapture?.(now.pointerId)) now.target.releasePointerCapture(now.pointerId)
    return true
  }
  function widthAt(now: ColumnDrag, clientX: number) {
    // Dragging towards the inline end widens the column: right in left-to-right grids, left in right-to-left grids.
    const delta = (clientX - now.x) * (options.rtl() ? -1 : 1)
    return clampWidth(now.before + delta, minWidth.value, maxWidth.value)
  }
  function down(event: PointerEvent, id: string, width: number) {
    // The grid would otherwise treat the press as a cell press.
    event.stopPropagation()
    if (event.button !== 0 || drag.value || !props.columnsResizable) return
    // Keep a mouse drag from selecting text; the separator takes focus so that Escape cancels.
    if (event.pointerType !== 'touch') event.preventDefault()
    const target = event.currentTarget as HTMLElement
    target.focus({ preventScroll: true })
    target.setPointerCapture?.(event.pointerId)
    drag.value = { id, pointerId: event.pointerId, x: event.clientX, before: width, width, target }
  }
  function move(event: PointerEvent) {
    const now = drag.value
    if (!now || event.pointerId !== now.pointerId) return
    const width = widthAt(now, event.clientX)
    if (width !== now.width) drag.value = { ...now, width }
  }
  function up(event: PointerEvent) {
    const now = drag.value
    if (!now || event.pointerId !== now.pointerId) return
    const after = widthAt(now, event.clientX)
    cancel()
    propose({ id: now.id, before: now.before, after, source: 'pointer' })
  }
  function end(event: PointerEvent) {
    if (drag.value && event.pointerId === drag.value.pointerId) cancel()
  }
  function keydown(event: KeyboardEvent, id: string, width: number) {
    // Keys on a separator are not grid navigation.
    event.stopPropagation()
    if (event.key === 'Escape') {
      if (cancel()) event.preventDefault()
      return
    }
    const after = columnWidthForKey(event, width, options.rtl(), minWidth.value, maxWidth.value)
    if (after === undefined) return
    event.preventDefault()
    if (drag.value) return
    propose({ id, before: width, after, source: 'keyboard' })
  }
  /** The previewed width of a column during a drag, else `width`. */
  function shownWidth(id: string, width: number) {
    return drag.value?.id === id ? drag.value.width : width
  }
  /** The separator of a header: `id` is the column ID or `timelineLabelColumnId`, `width` its current width. */
  function separator(id: string, label: string, width: number): VNode {
    return h('div', {
      class: ['vw-column-resize', { 'vw-is-active': drag.value?.id === id }], role: 'separator', tabindex: 0,
      'aria-orientation': 'vertical', 'aria-label': `${options.labels().resizeColumn} ${label}`,
      'aria-valuenow': shownWidth(id, width), 'aria-valuemin': minWidth.value, 'aria-valuemax': maxWidth.value,
      onPointerdown: (event: PointerEvent) => down(event, id, width), onPointermove: move, onPointerup: up,
      onPointercancel: end, onLostpointercapture: end, onKeydown: (event: KeyboardEvent) => keydown(event, id, width),
    })
  }
  return { drag, minWidth, maxWidth, separator, shownWidth, cancel }
}
