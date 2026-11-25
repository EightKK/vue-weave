<script setup lang="ts" generic="C extends TaskBoardCard = TaskBoardCard">
import { computed, onBeforeUnmount, ref, shallowRef, useId, watch } from 'vue'
import {
  groupBoardCards, type TaskBoardCard, type TaskBoardCardMove, type TaskBoardCardMoveValidator, type TaskBoardColumn,
  type TaskBoardColumnStatus, type TaskBoardBackgroundClick, type TaskBoardGroups, type TaskBoardLabels, type TaskBoardLane, type TaskBoardMoveCancel,
  type TaskBoardMoveCancelReason, type TaskBoardPosition,
} from '../core/taskBoard.js'
import type { ChartDirection } from '../core/types.js'
import { renderTaskBoardSvg, type TaskBoardExportOptions, type TaskBoardPngExportOptions } from '../core/exportBoardSvg.js'
import { exportFont, rasterizeSvg, readExportTheme, withExportColours } from './exportImage.js'
import { usePendingFocus } from './shared/focus.js'
import { capturePointer, edgeScroller, pastThreshold, releasePointer } from './shared/pointer.js'
import { rejectionReason, useValidatedSource } from './shared/validation.js'
import { cellSize, fullCellIndex, neighbourCard, stepBoardTarget, type BoardTarget } from './taskBoard/navigation.js'

const props = withDefaults(defineProps<{
  /** Status columns, in display order. Each has a unique ID, a label, an optional detail and an optional `wipLimit`. Required. */
  columns: readonly TaskBoardColumn[]
  /** Cards, each with a unique ID, `columnId`, `laneId` (on a board with lanes), label and optional detail, tone and data. The array order is the order inside every cell. Required. */
  cards: readonly C[]
  /** Horizontal swimlanes, in display order. Without lanes (or with an empty array) the board has one row of cells. */
  lanes?: readonly TaskBoardLane[]
  /** Controlled selected card ID; supports `v-model:selected-id`. */
  selectedId?: string
  /** Disables moving cards; cards can still be selected and activated. Default: false. */
  readonly?: boolean
  /**
   * Shows only the cards for which it returns true. Column counts show "shown of all" while it hides cards; WIP limits and
   * minimums still count every card. Move proposals count hidden cards in their indices, so `applyBoardCardMove` works on
   * the full `cards` array. Pass a new function when the criteria change. A move in progress is cancelled only when the
   * shown cards change, but every new function regroups the board, so keep its identity (for example in a `computed`).
   */
  filter?: (card: C) => boolean
  /** Shows a collapse/expand button in every column header and lane header. Default: false. */
  collapsible?: boolean
  /** Controlled IDs of the collapsed columns; supports `v-model:collapsed-column-ids`. A collapsed column is a narrow strip and not a drop target. */
  collapsedColumnIds?: readonly string[]
  /** Controlled IDs of the collapsed lanes; supports `v-model:collapsed-lane-ids`. A collapsed lane shows only its header and is not a drop target. */
  collapsedLaneIds?: readonly string[]
  /** Synchronous check of a card move proposal. Return `true` or nothing to accept, `false` or a reason string to reject. */
  validateCardMove?: TaskBoardCardMoveValidator
  /** Overrides for the English UI strings and accessible names; fields you omit keep their defaults. */
  labels?: Partial<TaskBoardLabels>
  /** Text direction: `ltr`, `rtl` or `auto`. `rtl` places the first column on the right. Default: `ltr`. */
  dir?: ChartDirection
  /** Height of the scroll viewport, as a number of pixels or a CSS length. Default: the height of the content. */
  height?: number | string
  /** Scrolls the board while a pointer drag is held near an edge of the viewport. Default: true. */
  autoScroll?: boolean
}>(), {
  lanes: undefined, selectedId: undefined, filter: undefined, collapsible: false, collapsedColumnIds: undefined,
  collapsedLaneIds: undefined, readonly: false, validateCardMove: undefined, labels: undefined,
  dir: 'ltr', height: undefined, autoScroll: true,
})

const emit = defineEmits<{
  /** Proposal to move a card; carries its ID, `before` and `after` positions and the source. Apply it with `applyBoardCardMove`. */
  'card-move': [change: TaskBoardCardMove]
  /** A card move was rejected by `validateCardMove`; carries the proposal and the reason. */
  'card-move-rejected': [change: TaskBoardCardMove, reason: string]
  /** A pick-up or drag ended without a proposal; carries the card, its position and the reason. */
  'card-move-cancel': [event: TaskBoardMoveCancel]
  /** A card was activated by click or Enter (or Space on a card that cannot move); carries its ID. */
  'card-activate': [id: string]
  /** The selected card ID changed; supports `v-model:selected-id`. */
  'update:selectedId': [id: string]
  /** The collapsed column IDs a toggle proposes; supports `v-model:collapsed-column-ids`. */
  'update:collapsedColumnIds': [ids: string[]]
  /** The collapsed lane IDs a toggle proposes; supports `v-model:collapsed-lane-ids`. */
  'update:collapsedLaneIds': [ids: string[]]
  /**
   * A primary click landed on empty board space (a cell or the board background, not a card, header or control) and the
   * pointer did not move past the drag threshold; carries the column and lane of the cell. Use it to clear the selection.
   */
  'background-click': [event: TaskBoardBackgroundClick]
  /** Invalid columns, lanes or cards were detected; carries the error. The board then renders its empty state. */
  'validation-error': [error: Error]
}>()

defineSlots<{
  /** Content of a card button. Keep it non-interactive: the card is a button. */
  card(props: { card: C; selected: boolean; moving: boolean; column: TaskBoardColumn; lane?: TaskBoardLane }): unknown
  /**
   * Content of a column header, with the card count and WIP state of the column. It replaces the whole header, the
   * built-in collapse toggle included: `collapsed` is the column's collapsed state, `toggle()` proposes the toggled
   * `collapsedColumnIds` (`update:collapsedColumnIds`) like the built-in toggle, and `toggleLabel` is that toggle's
   * accessible name ("Collapse To do" or "Expand To do"), so the slot can draw its own toggle button.
   */
  'column-header'(props: {
    column: TaskBoardColumn; status: TaskBoardColumnStatus; collapsed: boolean; toggle: () => void; toggleLabel: string
  }): unknown
  /** Content of a cell without cards, and (without `column`) of a board without columns. */
  empty(props: { column?: TaskBoardColumn; lane?: TaskBoardLane }): unknown
}>()

const messages = computed<TaskBoardLabels>(() => ({
  region: 'Task board', empty: 'No columns to display', emptyCell: 'No cards', card: 'card', cards: 'cards', wipLimit: 'WIP limit',
  overLimit: 'Over WIP limit', wipMin: 'WIP minimum', underMinimum: 'Under WIP minimum', collapse: 'Collapse', expand: 'Expand',
  moveHint: 'Space picks the card up. Arrow keys move it, Space or Enter drops it and Escape cancels.',
  moveRejected: 'This card move was rejected.', pickedUp: 'Picked up', moved: 'Moved', moveCancelled: 'Move cancelled.',
  position: 'position', of: 'of', lane: 'lane',
  ...props.labels,
}))

const uid = useId()
const root = ref<HTMLElement>()
const scroller = ref<HTMLElement>()
const notice = ref('')

// Invalid input is reported through `validation-error` and never rendered. The error is rethrown, as in GanttChart, so
// development builds still surface it.
const emptyGroups: TaskBoardGroups<C> = { rows: [], columns: [], positions: new Map() }
const { value: groups, error: validationError } = useValidatedSource(
  [() => props.cards, () => props.columns, () => props.lanes, () => props.filter],
  () => groupBoardCards(props.cards, props.columns, props.lanes, { filter: props.filter }),
  { report: error => emit('validation-error', error), fallback: emptyGroups },
)

const laned = computed(() => Boolean(props.lanes?.length))
const rtl = computed(() => props.dir === 'rtl')
const cardById = computed(() => new Map(props.cards.map(card => [card.id, card])))
const laneOf = (index: number) => laned.value ? props.lanes![index] : undefined
const movable = (card: C) => !props.readonly && card.draggable !== false && !validationError.value
// The collapsed IDs by value: an equal array passed inline (a new array on every render of the parent) changes nothing.
const idKey = (ids: readonly string[] | undefined) => JSON.stringify([...new Set(ids ?? [])].sort())
const collapsedColumnKey = computed(() => idKey(props.collapsedColumnIds))
const collapsedLaneKey = computed(() => idKey(props.collapsedLaneIds))
const collapsedColumns = computed(() => new Set<string>(JSON.parse(collapsedColumnKey.value) as string[]))
const collapsedLanes = computed(() => new Set<string>(JSON.parse(collapsedLaneKey.value) as string[]))
const columnCollapsed = (index: number) => collapsedColumns.value.has(props.columns[index]?.id as string)
const laneCollapsed = (index: number) => laned.value && collapsedLanes.value.has(props.lanes![index]?.id as string)
// The groups as the keyboard sees them: the cards of collapsed columns and lanes are not rendered, so they are skipped.
const navGroups = computed<TaskBoardGroups<C>>(() => {
  if (!collapsedColumns.value.size && !collapsedLanes.value.size) return groups.value
  return {
    ...groups.value,
    rows: groups.value.rows.map((row, r) => ({
      ...row, cells: row.cells.map((cell, c) => laneCollapsed(r) || columnCollapsed(c) ? { ...cell, cards: [], indices: [] } : cell),
    })),
  }
})
const gridColumns = computed(() => collapsedColumns.value.size && props.columns.some(column => collapsedColumns.value.has(column.id))
  ? props.columns.map(column => collapsedColumns.value.has(column.id) ? 'var(--vw-board-collapsed-width)' : 'minmax(var(--vw-board-column-width), 1fr)').join(' ')
  : undefined)
/** The IDs with `id` removed when present, or added at the end. */
const toggled = (ids: readonly string[] | undefined, id: string) => ids?.includes(id) ? ids.filter(item => item !== id) : [...ids ?? [], id]
const toggleColumn = (id: string) => emit('update:collapsedColumnIds', toggled(props.collapsedColumnIds, id))
const toggleLane = (id: string) => emit('update:collapsedLaneIds', toggled(props.collapsedLaneIds, id))
const toggleName = (collapsed: boolean, label: string) => `${collapsed ? messages.value.expand : messages.value.collapse} ${label}`
function countText(status: TaskBoardColumnStatus | { count: number; total: number }) {
  return status.count === status.total ? String(status.count) : `${status.count} ${messages.value.of} ${status.total}`
}
const boardStyle = computed(() => ({
  '--vw-board-column-count': String(Math.max(1, props.columns.length)),
  ...props.height === undefined ? {} : { height: typeof props.height === 'number' ? props.height + 'px' : props.height },
}))

function cellName(column: TaskBoardColumn, lane?: TaskBoardLane) {
  return lane ? `${column.label} · ${lane.label}` : column.label
}
const cardsText = (status: { count: number; total: number }) => `${countText(status)} ${status.total === 1 ? messages.value.card : messages.value.cards}`
function columnDescription(status: TaskBoardColumnStatus) {
  const parts = [cardsText(status)]
  if (status.wipMin !== undefined) parts.push(`${messages.value.wipMin} ${status.wipMin}`)
  if (status.wipLimit !== undefined) parts.push(`${messages.value.wipLimit} ${status.wipLimit}`)
  if (status.underMinimum) parts.push(messages.value.underMinimum)
  if (status.overLimit) parts.push(messages.value.overLimit)
  return parts.join(', ')
}

// View models of the column and lane headers. The column description also describes the cells and the toggle, so a
// collapsed column still reports its count and WIP state to assistive technology.
const columnViews = computed(() => groups.value.columns.map((status, c) => {
  const column = props.columns[c]!, collapsed = collapsedColumns.value.has(column.id)
  return {
    column, status, collapsed, toggleName: toggleName(collapsed, column.label), descriptionId: `${uid}-column-${c}`,
    description: columnDescription(status), count: countText(status) + (status.wipLimit === undefined ? '' : ' / ' + status.wipLimit),
  }
}))
const laneViews = computed(() => groups.value.rows.map((row, r) => {
  const lane = laneOf(r), collapsed = laneCollapsed(r)
  const counts = { count: row.cells.reduce((sum, cell) => sum + cell.cards.length, 0), total: row.cells.reduce((sum, cell) => sum + cell.total, 0) }
  return {
    row, lane, collapsed, toggleName: lane ? toggleName(collapsed, lane.label) : '', descriptionId: `${uid}-lane-${r}`,
    description: cardsText(counts), count: countText(counts),
  }
}))
// Card descriptions: the detail (the accessible name is the label alone) and, for a movable card, the move hint. IDs
// use the card's index, since card IDs may hold characters that an ID reference list cannot.
const cardIndex = computed(() => new Map(props.cards.map((card, index) => [card.id, index])))
const detailId = (card: C) => `${uid}-detail-${cardIndex.value.get(card.id)}`
function cardDescribedBy(card: C) {
  const ids = [...card.detail ? [detailId(card)] : [], ...movable(card) ? [`${uid}-move-hint`] : []]
  return ids.length ? ids.join(' ') : undefined
}

// Moves. A move starts with a pointer drag or a Space key press on a movable card and keeps the card in place while a
// drop indicator shows the target; only a drop proposes `card-move`. Changes to `cards`, `columns`, `lanes`, `readonly`,
// the collapsed column or lane IDs (by value) or the cards that `filter` shows cancel a move in progress.
type ActiveMove = { id: string; source: 'pointer' | 'keyboard'; before: TaskBoardPosition }
type PointerGesture = {
  id: string; pointerId: number; element: HTMLElement; x: number; y: number; scrollLeft: number; scrollTop: number
  clientX: number; clientY: number; moved: boolean
}
const activeMove = shallowRef<ActiveMove>()
const dropTarget = shallowRef<BoardTarget>()
const dragOffset = ref<{ x: number; y: number }>()
let pointer: PointerGesture | undefined
let skipClick = false

/** The grid cell of a card with its index among the shown cards of that cell (its full index without a filter). */
function targetOf(id: string): BoardTarget {
  const position = groups.value.positions.get(id)!
  const column = props.columns.findIndex(item => item.id === position.columnId)
  const lane = laned.value ? props.lanes!.findIndex(item => item.id === position.laneId) : 0
  const index = groups.value.rows[lane]!.cells[column]!.cards.findIndex(card => card.id === id)
  return { column, lane, index }
}
/** The proposed position of a drop: the target index is translated into an index among all cards of the cell. */
function positionOf(target: BoardTarget, id: string): TaskBoardPosition {
  const lane = laneOf(target.lane)
  return { columnId: props.columns[target.column]!.id, ...lane ? { laneId: lane.id } : {}, index: fullCellIndex(groups.value, target, id) }
}
function samePosition(a: TaskBoardPosition, b: TaskBoardPosition) {
  return a.columnId === b.columnId && a.laneId === b.laneId && a.index === b.index
}
/** Whether moving the card into the target column would take that column over its WIP limit. */
function exceedsLimit(target: BoardTarget, id: string) {
  const status = groups.value.columns[target.column]
  const card = cardById.value.get(id)
  if (!status || status.wipLimit === undefined || !card) return false
  return card.columnId !== status.id && status.total + 1 > status.wipLimit
}
function describeTarget(target: BoardTarget, id: string) {
  const column = props.columns[target.column]!, lane = laneOf(target.lane)
  const size = cellSize(groups.value, target.lane, target.column, id) + 1
  const text = [column.label]
  if (lane) text.push(`${messages.value.lane} ${lane.label}`)
  text.push(`${messages.value.position} ${target.index + 1} ${messages.value.of} ${size}`)
  if (exceedsLimit(target, id)) text.push(messages.value.overLimit)
  return text.join(', ') + '.'
}

/** The cells and drop indicator of one grid cell, in display order. */
function cellItems(lane: number, column: number) {
  const cards = groups.value.rows[lane]?.cells[column]?.cards ?? []
  const target = dropTarget.value, moving = activeMove.value?.id
  const at = target && target.lane === lane && target.column === column ? target.index : -1
  const items: ({ kind: 'card'; card: C } | { kind: 'drop'; over: boolean })[] = []
  const indicator = () => ({ kind: 'drop' as const, over: exceedsLimit(target!, moving!) })
  let visible = 0
  for (const card of cards) {
    if (card.id !== moving) {
      if (visible === at) items.push(indicator())
      visible++
    }
    items.push({ kind: 'card', card })
  }
  if (at === visible) items.push(indicator())
  return items
}

function select(card: C) {
  if (props.selectedId !== card.id) emit('update:selectedId', card.id)
  emit('card-activate', card.id)
}

function endMove() {
  const gesture = pointer
  pointer = undefined
  activeMove.value = undefined
  dropTarget.value = undefined
  dragOffset.value = undefined
  edgeScroll.stop()
  if (gesture) releasePointer(gesture.element, gesture.pointerId)
}
function cancelMove(reason: TaskBoardMoveCancelReason = 'escape') {
  const active = activeMove.value
  if (!active) return
  endMove()
  notice.value = messages.value.moveCancelled
  emit('card-move-cancel', { id: active.id, before: active.before, reason, source: active.source })
}
function drop() {
  const active = activeMove.value, target = dropTarget.value
  if (!active) return
  if (!target) return cancelMove('no-target')
  const from = targetOf(active.id)
  // A drop on the card's own place, among the shown cards, is no move even if hidden cards sit next to it: it ends like
  // a release outside every cell.
  const unchanged = from.column === target.column && from.lane === target.lane && from.index === target.index
  const after = unchanged ? active.before : positionOf(target, active.id)
  if (samePosition(active.before, after)) return cancelMove('no-target')
  const description = describeTarget(target, active.id)
  endMove()
  const change: TaskBoardCardMove = { id: active.id, before: active.before, after, source: active.source }
  const reason = rejectionReason(props.validateCardMove?.(change), messages.value.moveRejected)
  if (reason !== undefined) {
    notice.value = reason
    emit('card-move-rejected', change, reason)
    return
  }
  const card = cardById.value.get(active.id)
  notice.value = `${messages.value.moved} ${card?.label ?? active.id}: ${description}`
  pendingFocus.request(active.id)
  emit('card-move', change)
}

// Which cards are shown, by cell. A new filter function that shows the same cards keeps a move going: the drop target
// counts shown cards, so it stays valid.
const shownKey = computed(() => JSON.stringify(groups.value.rows.map(row => row.cells.map(cell => cell.cards.map(card => card.id)))))
watch([() => props.cards, () => props.columns, () => props.lanes, () => props.readonly, shownKey, collapsedColumnKey, collapsedLaneKey],
  () => cancelMove('data-change'))
// After the parent applies a move, the card is rendered in its new cell; give it the focus back.
const pendingFocus = usePendingFocus(() => props.cards, focusCard)

function cardElement(id: string) {
  for (const element of root.value?.querySelectorAll<HTMLElement>('[data-vw-card]') ?? []) {
    if (element.dataset.vwCard === id) return element
  }
  return undefined
}
/** Move the keyboard focus to a card and scroll it into view. Returns whether the card is shown. */
function focusCard(id: string) {
  const element = cardElement(id)
  element?.focus()
  return Boolean(element)
}
function isRtl() {
  return root.value ? getComputedStyle(root.value).direction === 'rtl' : rtl.value
}

// Keyboard: Space picks a movable card up, arrows move the drop indicator, Space or Enter drops and Escape cancels.
// Outside a move, Enter activates the card and the arrow keys move the focus between cards.
function cardKeys(event: KeyboardEvent, card: C) {
  const active = activeMove.value
  if (active) {
    if (event.key === 'Escape') {
      event.preventDefault()
      cancelMove('escape')
      return
    }
    if (active.source !== 'keyboard' || active.id !== card.id) return
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault()
      drop()
      return
    }
    const next = dropTarget.value && stepBoardTarget(groups.value, dropTarget.value, event.key, card.id, isRtl(), { column: columnCollapsed, lane: laneCollapsed })
    if (!next) return
    event.preventDefault()
    dropTarget.value = next
    notice.value = describeTarget(next, card.id)
    return
  }
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault()
    if (event.key === ' ' && movable(card)) return pickUp(card)
    return select(card)
  }
  const next = neighbourCard(navGroups.value, card.id, event.key, isRtl())
  if (!next) return
  event.preventDefault()
  if (next.id !== card.id) focusCard(next.id)
}
function pickUp(card: C) {
  const before = groups.value.positions.get(card.id)
  if (!before) return
  activeMove.value = { id: card.id, source: 'keyboard', before }
  dropTarget.value = targetOf(card.id)
  notice.value = `${messages.value.pickedUp} ${card.label}. ${describeTarget(dropTarget.value, card.id)}`
}
function cardBlur(event: FocusEvent, card: C) {
  const active = activeMove.value
  if (active?.source === 'keyboard' && active.id === card.id) cancelMove('blur')
  // Focus that leaves the card for another place drops a pending focus request, so a move the parent applies later (or
  // never) does not pull the focus back from wherever it went. A redraw that removes the focused card blurs it too; the
  // check waits until that update is done, and a removed card keeps the request.
  const element = event.target as Element
  queueMicrotask(() => {
    if (element.isConnected && document.activeElement !== element) pendingFocus.cancel(card.id)
  })
}
function cardClick(card: C) {
  if (skipClick) {
    skipClick = false
    return
  }
  select(card)
}

// Pointer drags (mouse, pen and touch). The card follows the pointer after a 4 px threshold; the drop target is the
// cell under the pointer and the place between its cards nearest to the pointer.
function pressCard(event: PointerEvent, card: C) {
  skipClick = false
  if (!movable(card) || activeMove.value || !event.isPrimary || event.button !== 0) return
  const element = event.currentTarget as HTMLElement
  const before = groups.value.positions.get(card.id)
  if (!before) return
  // Keep a mouse drag from selecting text; focus the card so that Escape cancels.
  if (event.pointerType !== 'touch') event.preventDefault()
  element.focus({ preventScroll: true })
  pointer = {
    id: card.id, pointerId: event.pointerId, element, x: event.clientX, y: event.clientY, clientX: event.clientX, clientY: event.clientY,
    scrollLeft: scroller.value?.scrollLeft ?? 0, scrollTop: scroller.value?.scrollTop ?? 0, moved: false,
  }
  capturePointer(element, event.pointerId)
}
function targetAt(clientX: number, clientY: number, id: string): BoardTarget | undefined {
  for (const cell of root.value?.querySelectorAll<HTMLElement>('[data-vw-cell]') ?? []) {
    const box = cell.getBoundingClientRect()
    if (clientX < box.left || clientX >= box.right || clientY < box.top || clientY >= box.bottom) continue
    const [lane, column] = cell.dataset.vwCell!.split(':').map(Number) as [number, number]
    let index = 0
    for (const element of cell.querySelectorAll<HTMLElement>('[data-vw-card]')) {
      if (element.dataset.vwCard === id) continue
      const rect = element.getBoundingClientRect()
      if (clientY > rect.top + rect.height / 2) index++
    }
    return { column, lane, index }
  }
  return undefined
}
function followPointer() {
  const gesture = pointer
  if (!gesture?.moved) return
  const view = scroller.value
  dragOffset.value = {
    x: gesture.clientX - gesture.x + (view ? view.scrollLeft - gesture.scrollLeft : 0),
    y: gesture.clientY - gesture.y + (view ? view.scrollTop - gesture.scrollTop : 0),
  }
  dropTarget.value = targetAt(gesture.clientX, gesture.clientY, gesture.id)
}
function moveCard(event: PointerEvent) {
  const gesture = pointer
  if (!gesture || event.pointerId !== gesture.pointerId) return
  gesture.clientX = event.clientX
  gesture.clientY = event.clientY
  if (!gesture.moved) {
    if (!pastThreshold(gesture, event)) return
    const before = groups.value.positions.get(gesture.id)
    if (!before) return
    gesture.moved = true
    activeMove.value = { id: gesture.id, source: 'pointer', before }
  }
  followPointer()
  if (props.autoScroll) edgeScroll.start()
}
/** Scrolls the viewport while the pointer is held within 36 px of one of its edges, faster nearer the edge. */
const edgeScroll = edgeScroller(() => {
  const gesture = pointer, view = scroller.value
  return gesture?.moved && view ? { scroller: view, clientX: gesture.clientX, clientY: gesture.clientY } : undefined
}, followPointer)
function releaseCard(event: PointerEvent) {
  const gesture = pointer
  if (!gesture || event.pointerId !== gesture.pointerId) return
  if (!gesture.moved) {
    pointer = undefined
    return
  }
  skipClick = true
  if (event.type !== 'pointerup') return cancelMove('pointer-cancel')
  gesture.clientX = event.clientX
  gesture.clientY = event.clientY
  followPointer()
  drop()
}
function lostCapture(event: PointerEvent) {
  if (pointer && event.pointerId === pointer.pointerId) {
    if (pointer.moved) cancelMove('pointer-cancel')
    else pointer = undefined
  }
}
onBeforeUnmount(endMove)

// Clicks on empty board space. A press on a cell or the board background is remembered and reported as
// `background-click` when the same pointer is released before the drag threshold; cards, headers and controls are not
// empty space, and a press on the scrollbar is ignored.
let backgroundPress: { pointerId: number; x: number; y: number; click: TaskBoardBackgroundClick } | undefined
const notBackground = 'button, a, input, select, textarea, label, summary, [tabindex], [contenteditable], .vw-board-column-head, .vw-board-lane-head'
function pressBackground(event: PointerEvent) {
  backgroundPress = undefined
  if (!event.isPrimary || event.button !== 0 || activeMove.value || pointer || validationError.value) return
  const target = event.target as Element, view = scroller.value
  const blocker = target.closest(notBackground)
  if (!view || (blocker && blocker !== view && view.contains(blocker))) return
  if (target === view && (event.offsetX >= view.clientWidth || event.offsetY >= view.clientHeight)) return
  const cell = target.closest<HTMLElement>('[data-vw-cell], [data-vw-collapsed-cell]')
  const click: TaskBoardBackgroundClick = {}
  if (cell) {
    const [lane, column] = (cell.dataset.vwCell ?? cell.dataset.vwCollapsedCell)!.split(':').map(Number) as [number, number]
    const columnId = props.columns[column]?.id, laneId = laneOf(lane)?.id
    if (columnId !== undefined) click.columnId = columnId
    if (laneId !== undefined) click.laneId = laneId
  }
  backgroundPress = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, click }
}
function releaseBackground(event: PointerEvent) {
  const press = backgroundPress
  if (!press || event.pointerId !== press.pointerId) return
  backgroundPress = undefined
  if (event.type === 'pointerup' && !activeMove.value && !pastThreshold(press, event)) emit('background-click', press.click)
}

function cardStyle(card: C) {
  const offset = dragOffset.value
  return offset && activeMove.value?.id === card.id && activeMove.value.source === 'pointer'
    ? { transform: `translate(${offset.x}px, ${offset.y}px)` } : undefined
}

/**
 * A standalone SVG document of the board with the default rendering and the current theme colours: every column, lane
 * and shown card (respecting `filter` and the collapsed columns and lanes), whatever is scrolled into view. Slots are
 * not used. Throws the validation error of invalid props.
 */
function exportSvg(options: TaskBoardExportOptions<C> = {}) {
  if (validationError.value) throw validationError.value
  const { includeSelection = true, theme, ...rest } = options
  const style = root.value ? getComputedStyle(root.value) : undefined
  const read = (name: string) => style?.getPropertyValue(name).trim() || undefined
  return renderTaskBoardSvg(props.cards, props.columns, {
    ...rest,
    lanes: props.lanes, filter: props.filter, collapsedColumnIds: collapsedColumns.value, collapsedLaneIds: collapsedLanes.value,
    selectedId: includeSelection ? props.selectedId : undefined,
    labels: { empty: messages.value.empty, emptyCell: messages.value.emptyCell, of: messages.value.of, overLimit: messages.value.overLimit, underMinimum: messages.value.underMinimum },
    // currentColor or a colour function in these properties becomes the colour computed on the board.
    ...withExportColours(root.value, resolve => ({ wipWarningColor: resolve(read('--vw-board-wip-warning')), wipUnderColor: resolve(read('--vw-board-wip-under')) })),
    direction: isRtl() ? 'rtl' : 'ltr',
    theme: root.value ? readExportTheme(root.value, theme) : theme,
    fontFamily: root.value ? exportFont(root.value) : undefined,
  })
}
/** Rasterize `exportSvg(options)` to a PNG blob in the browser. */
async function exportPng(options: TaskBoardPngExportOptions<C> = {}) {
  const { scale = 1, ...rest } = options
  return rasterizeSvg(exportSvg(rest), scale)
}

defineExpose({
  /** Move the keyboard focus to a card. Returns false when the card is not shown. */
  focusCard,
  /** Cancel a pick-up or drag in progress, reporting `card-move-cancel` with reason `api`. */
  cancelMove: () => cancelMove('api'),
  /** A standalone SVG document of the board; see `TaskBoardExportOptions`. */
  exportSvg,
  /** A PNG blob of `exportSvg(options)` at `scale` device pixels per CSS pixel. Browser only. */
  exportPng,
})
</script>

<template>
  <div ref="root" class="vw-board" :class="{ 'vw-rtl': rtl }" :dir="dir === 'rtl' ? 'rtl' : undefined">
    <div ref="scroller" class="vw-board-scroll" role="region" :aria-label="messages.region" tabindex="0" :style="boardStyle"
      @pointerdown="pressBackground" @pointerup="releaseBackground" @pointercancel="releaseBackground">
      <div v-if="validationError || !columns.length" class="vw-board-empty"><slot name="empty">{{ messages.empty }}</slot></div>
      <div v-else class="vw-board-grid" :class="{ 'vw-has-lanes': laned, 'vw-is-moving': activeMove }"
        :style="gridColumns === undefined ? undefined : { gridTemplateColumns: gridColumns }">
        <div v-for="(item, c) in columnViews" :key="item.column.id" class="vw-board-column-head"
          :class="{
            'vw-is-over-limit': item.status.overLimit, 'vw-is-at-limit': item.status.atLimit,
            'vw-is-under-minimum': item.status.underMinimum, 'vw-is-collapsed': item.collapsed,
          }">
          <slot
            name="column-header" :column="item.column" :status="item.status" :collapsed="item.collapsed"
            :toggle="() => toggleColumn(item.column.id)" :toggleLabel="item.toggleName"
          >
            <button v-if="collapsible" type="button" class="vw-board-toggle" :aria-expanded="!item.collapsed"
              :aria-label="item.toggleName" :aria-describedby="item.descriptionId" @click="toggleColumn(item.column.id)">
              <span class="vw-board-toggle-icon" aria-hidden="true"></span>
            </button>
            <span class="vw-board-column-title">
              <strong>{{ item.column.label }}</strong>
              <small v-if="item.column.detail && !item.collapsed">{{ item.column.detail }}</small>
            </span>
            <span class="vw-board-count" aria-hidden="true">{{ item.count }}</span>
            <span v-if="item.status.overLimit && !item.collapsed" class="vw-board-wip-warning">{{ messages.overLimit }}</span>
            <span v-if="item.status.underMinimum && !item.collapsed" class="vw-board-wip-warning vw-is-under">{{ messages.underMinimum }}</span>
          </slot>
          <span :id="item.descriptionId" hidden>{{ item.description }}</span>
        </div>
        <template v-for="(laneView, r) in laneViews" :key="laneView.row.laneId ?? ''">
          <div v-if="laneView.lane" class="vw-board-lane-head" :class="{ 'vw-is-collapsed': laneView.collapsed }">
            <button v-if="collapsible" type="button" class="vw-board-toggle" :aria-expanded="!laneView.collapsed"
              :aria-label="laneView.toggleName" :aria-describedby="laneView.descriptionId" @click="toggleLane(laneView.lane.id)">
              <span class="vw-board-toggle-icon" aria-hidden="true"></span>
            </button>
            <span class="vw-board-lane-title"><strong>{{ laneView.lane.label }}</strong><small v-if="laneView.lane.detail">{{ laneView.lane.detail }}</small></span>
            <span v-if="collapsible || laneView.collapsed" class="vw-board-count" aria-hidden="true">{{ laneView.count }}</span>
            <span :id="laneView.descriptionId" hidden>{{ laneView.description }}</span>
          </div>
          <template v-if="!laneView.collapsed">
            <template v-for="(cell, c) in laneView.row.cells" :key="cell.columnId">
              <div v-if="columnViews[c]!.collapsed" class="vw-board-cell vw-is-collapsed" aria-hidden="true" :data-vw-collapsed-cell="`${r}:${c}`"></div>
              <ul v-else class="vw-board-cell" role="list"
                :class="{ 'vw-is-over-limit': columnViews[c]!.status.overLimit, 'vw-is-target': dropTarget?.lane === r && dropTarget?.column === c }"
                :aria-label="cellName(columnViews[c]!.column, laneView.lane)" :aria-describedby="columnViews[c]!.descriptionId" :data-vw-cell="`${r}:${c}`">
            <template v-for="item in cellItems(r, c)" :key="item.kind === 'card' ? item.card.id : '$drop'">
              <li v-if="item.kind === 'drop'" class="vw-board-drop" :class="{ 'vw-is-over-limit': item.over }" aria-hidden="true"></li>
              <li v-else class="vw-board-card-item">
                <button type="button" class="vw-board-card" :class="[`vw-tone-${item.card.tone ?? 'blue'}`, {
                  'vw-is-selected': selectedId === item.card.id, 'vw-is-movable': movable(item.card),
                  'vw-is-dragging': activeMove?.id === item.card.id && activeMove.source === 'pointer',
                  'vw-is-picked': activeMove?.id === item.card.id && activeMove.source === 'keyboard',
                }]" :style="cardStyle(item.card)" :data-vw-card="item.card.id" :aria-label="item.card.label"
                  :aria-pressed="selectedId === item.card.id" :aria-describedby="cardDescribedBy(item.card)"
                  @keydown="cardKeys($event, item.card)" @blur="cardBlur($event, item.card)" @click="cardClick(item.card)"
                  @pointerdown="pressCard($event, item.card)" @pointermove="moveCard" @pointerup="releaseCard" @pointercancel="releaseCard"
                  @lostpointercapture="lostCapture">
                  <slot name="card" :card="item.card" :selected="selectedId === item.card.id" :moving="activeMove?.id === item.card.id"
                    :column="columnViews[c]!.column" :lane="laneView.lane">
                    <span class="vw-board-card-label">{{ item.card.label }}</span>
                    <span v-if="item.card.detail" class="vw-board-card-detail">{{ item.card.detail }}</span>
                  </slot>
                </button>
                <span v-if="item.card.detail" :id="detailId(item.card)" hidden>{{ item.card.detail }}</span>
              </li>
            </template>
            <li v-if="!cell.cards.length && !(dropTarget?.lane === r && dropTarget?.column === c)" class="vw-board-cell-empty">
              <slot name="empty" :column="columnViews[c]!.column" :lane="laneView.lane">{{ messages.emptyCell }}</slot>
            </li>
              </ul>
            </template>
          </template>
        </template>
      </div>
    </div>
    <span :id="`${uid}-move-hint`" class="vw-sr-only">{{ messages.moveHint }}</span>
    <span class="vw-sr-only" aria-live="polite">{{ notice }}</span>
  </div>
</template>
