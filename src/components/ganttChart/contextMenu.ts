// Context menu requests of GanttChart (`contextMenu`): the menu keys, what a right-click or menu key targets and where.
// The chart reports the request through `context-menu`; the parent renders the menu. DOM-typed plain TypeScript that
// runs in event handlers only.
import type { TimelineBarEnd, TimelineContextMenu, TimelineContextTarget, TimelineRow } from '../../core/types.js'
import type { TimeScale } from '../../core/timeline.js'

/** The ContextMenu key or Shift+F10. */
export function isMenuKey(event: KeyboardEvent) {
  return event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey)
}

/** The request of a menu key on `element`: the target at the centre of the element. */
export function keyboardMenuRequest(element: Element, target: TimelineContextTarget, rowId?: string): TimelineContextMenu {
  const rect = element.getBoundingClientRect()
  const menu: TimelineContextMenu = { target, clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2, source: 'keyboard' }
  if (rowId !== undefined) menu.rowId = rowId
  return menu
}

/**
 * The bar or dependency an element inside `root` belongs to: a bar, its progress, constraint or link handle, or a
 * dependency hit path (which carries its ID with `contextMenu`). A bar must be one that `hasBar` knows.
 */
export function contextTarget(element: Element | undefined, root: Element | undefined, hasBar: (id: string) => boolean): TimelineContextTarget | undefined {
  const owner = element?.closest<HTMLElement | SVGElement>('[data-vw-bar], [data-vw-progress], [data-vw-constraint], [data-vw-link], [data-vw-dependency]')
  if (!owner || !root?.contains(owner)) return undefined
  const { vwBar, vwProgress, vwConstraint, vwLink, vwDependency } = owner.dataset
  if (vwDependency !== undefined) return { kind: 'dependency', id: vwDependency }
  const id = vwBar ?? vwProgress ?? vwConstraint ?? (vwLink ? (JSON.parse(vwLink) as [string, TimelineBarEnd])[0] : undefined)
  return id !== undefined && hasBar(id) ? { kind: 'bar', id } : undefined
}

/** Where the scrolled chart lies: the canvas box, the scroll offsets and the axis, for `pointerMenuRequest`. */
export interface ContextMenuGeometry {
  /** The canvas box in client coordinates. */
  rect: DOMRect
  scrollTop: number
  /** Horizontal scroll distance from the inline start. */
  scrollStart: number
  headerHeight: number
  rowHeight: number
  /** Pixels from the time area's inline-start edge to a client x coordinate. */
  timeAreaOffset: (clientX: number, rect: DOMRect) => number
  axis: TimeScale
  rows: readonly { row: TimelineRow }[]
}

/**
 * The request of a right-click at a client position: the element's bar or dependency, otherwise the displayed row
 * under the pointer, otherwise the chart; with the time under the pointer when it is over the visible time area, and
 * the row ID when it is over a row. The sticky header and row heading column cover the scrolled content; neither is
 * part of the body or the time area.
 */
export function pointerMenuRequest(
  clientX: number, clientY: number, target: TimelineContextTarget | undefined, geometry: ContextMenuGeometry,
): TimelineContextMenu {
  const { rect, axis } = geometry
  const x = geometry.timeAreaOffset(clientX, rect)
  const y = clientY - rect.top - geometry.headerHeight
  const inHeader = clientY < rect.top + geometry.scrollTop + geometry.headerHeight
  const inTime = x >= geometry.scrollStart && x >= 0 && x <= axis.width
  const row = !inHeader && y >= 0 ? geometry.rows[Math.floor(y / geometry.rowHeight)]?.row : undefined
  const menu: TimelineContextMenu = {
    target: target ?? (row ? { kind: 'row', id: row.id } : { kind: 'chart' }),
    clientX, clientY, source: 'pointer',
  }
  if (inTime) menu.time = axis.toTime(x)
  if (row) menu.rowId = row.id
  return menu
}
