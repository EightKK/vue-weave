<script setup lang="ts" generic="C extends TaskBoardCard = TaskBoardCard">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, useId, watch } from 'vue'
import {
  groupBoardCards, type TaskBoardCard, type TaskBoardCardMove, type TaskBoardCardMoveValidator, type TaskBoardColumn,
  type TaskBoardColumnStatus, type TaskBoardGroups, type TaskBoardLabels, type TaskBoardLane, type TaskBoardMoveCancel,
  type TaskBoardMoveCancelReason, type TaskBoardPosition,
} from '../core/taskBoard.js'
import type { ChartDirection } from '../core/types.js'
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
   * the full `cards` array. Pass a new function when the criteria change.
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
  /** Invalid columns, lanes or cards were detected; carries the error. The board then renders its empty state. */
  'validation-error': [error: Error]
}>()

defineSlots<{
  /** Content of a card button. Keep it non-interactive: the card is a button. */
  card(props: { card: C; selected: boolean; moving: boolean; column: TaskBoardColumn; lane?: TaskBoardLane }): unknown
  /** Content of a column header, with the card count and WIP state of the column. */
  'column-header'(props: { column: TaskBoardColumn; status: TaskBoardColumnStatus }): unknown
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
const validationError = ref<Error>()
const emptyGroups: TaskBoardGroups<C> = { rows: [], columns: [], positions: new Map() }
const groups = shallowRef<TaskBoardGroups<C>>(emptyGroups)
watch([() => props.cards, () => props.columns, () => props.lanes, () => props.filter], () => {
  try {
    groups.value = groupBoardCards(props.cards, props.columns, props.lanes, { filter: props.filter })
    validationError.value = undefined
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error))
    groups.value = emptyGroups
    validationError.value = failure
    emit('validation-error', failure)
    throw error
  }
}, { immediate: true })

const laned = computed(() => Boolean(props.lanes?.length))
const rtl = computed(() => props.dir === 'rtl')
const cardById = computed(() => new Map(props.cards.map(card => [card.id, card])))
const laneOf = (index: number) => laned.value ? props.lanes![index] : undefined
const movable = (card: C) => !props.readonly && card.draggable !== false && !validationError.value
const collapsedColumns = computed(() => new Set(props.collapsedColumnIds))
const collapsedLanes = computed(() => new Set(props.collapsedLaneIds))
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
function toggleColumn(id: string) {
  const ids = props.collapsedColumnIds ?? []
  emit('update:collapsedColumnIds', ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id])
}
function toggleLane(id: string) {
  const ids = props.collapsedLaneIds ?? []
  emit('update:collapsedLaneIds', ids.includes(id) ? ids.filter(item => item !== id) : [...ids, id])
}
const toggleName = (collapsed: boolean, label: string) => `${collapsed ? messages.value.expand : messages.value.collapse} ${label}`
function countText(status: TaskBoardColumnStatus | { count: number; total: number }) {
  return status.count === status.total ? String(status.count) : `${status.count} ${messages.value.of} ${status.total}`
}
const laneCount = (r: number) => groups.value.rows[r]!.cells.reduce((sum, cell) => sum + cell.cards.length, 0)
const laneTotal = (r: number) => groups.value.rows[r]!.cells.reduce((sum, cell) => sum + cell.total, 0)
const boardStyle = computed(() => ({
  '--vw-board-column-count': String(Math.max(1, props.columns.length)),
  ...props.height === undefined ? {} : { height: typeof props.height === 'number' ? props.height + 'px' : props.height },
}))

function cellName(column: TaskBoardColumn, lane?: TaskBoardLane) {
  return lane ? `${column.label} · ${lane.label}` : column.label
}
function columnDescription(status: TaskBoardColumnStatus) {
  const parts = [`${countText(status)} ${status.total === 1 ? messages.value.card : messages.value.cards}`]
  if (status.wipMin !== undefined) parts.push(`${messages.value.wipMin} ${status.wipMin}`)
  if (status.wipLimit !== undefined) parts.push(`${messages.value.wipLimit} ${status.wipLimit}`)
  if (status.underMinimum) parts.push(messages.value.underMinimum)
  if (status.overLimit) parts.push(messages.value.overLimit)
  return parts.join(', ')
}

// Moves. A move starts with a pointer drag or a Space key press on a movable card and keeps the card in place while a
// drop indicator shows the target; only a drop proposes `card-move`. Changes to `cards`, `columns`, `lanes` or
// `readonly` cancel a move in progress.
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
let pendingFocus: string | undefined
let scrollFrame = 0

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
  if (scrollFrame) cancelAnimationFrame(scrollFrame)
  scrollFrame = 0
  if (gesture?.element.hasPointerCapture?.(gesture.pointerId)) gesture.element.releasePointerCapture(gesture.pointerId)
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
  // A drop on the card's own place, among the shown cards, is no move even if hidden cards sit next to it.
  const unchanged = from.column === target.column && from.lane === target.lane && from.index === target.index
  const after = unchanged ? active.before : positionOf(target, active.id)
  const description = describeTarget(target, active.id)
  endMove()
  if (samePosition(active.before, after)) {
    notice.value = messages.value.moveCancelled
    return
  }
  const change: TaskBoardCardMove = { id: active.id, before: active.before, after, source: active.source }
  const result = props.validateCardMove?.(change)
  const reason = result === false ? messages.value.moveRejected : typeof result === 'string' ? result : undefined
  if (reason !== undefined) {
    notice.value = reason
    emit('card-move-rejected', change, reason)
    return
  }
  const card = cardById.value.get(active.id)
  notice.value = `${messages.value.moved} ${card?.label ?? active.id}: ${description}`
  pendingFocus = active.id
  emit('card-move', change)
}

watch([() => props.cards, () => props.columns, () => props.lanes, () => props.readonly, () => props.filter, collapsedColumns, collapsedLanes],
  () => cancelMove('data-change'))
// After the parent applies a move, the card is rendered in its new cell; give it the focus back.
watch(() => props.cards, async () => {
  const id = pendingFocus
  pendingFocus = undefined
  if (id === undefined) return
  await nextTick()
  focusCard(id)
})

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
function cardBlur(card: C) {
  const active = activeMove.value
  if (active?.source === 'keyboard' && active.id === card.id) cancelMove('blur')
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
  element.setPointerCapture?.(event.pointerId)
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
    if (Math.hypot(event.clientX - gesture.x, event.clientY - gesture.y) < 4) return
    const before = groups.value.positions.get(gesture.id)
    if (!before) return
    gesture.moved = true
    activeMove.value = { id: gesture.id, source: 'pointer', before }
  }
  followPointer()
  if (props.autoScroll && !scrollFrame) scrollFrame = requestAnimationFrame(scrollNearEdge)
}
/** Scrolls the viewport while the pointer is held within 36 px of one of its edges, faster nearer the edge. */
function scrollNearEdge() {
  scrollFrame = 0
  const gesture = pointer, view = scroller.value
  if (!gesture?.moved || !view) return
  const box = view.getBoundingClientRect(), zone = 36
  const speed = (distance: number) => distance < zone ? Math.ceil((zone - Math.max(0, distance)) / 3) : 0
  const dx = speed(box.right - gesture.clientX) - speed(gesture.clientX - box.left)
  const dy = speed(box.bottom - gesture.clientY) - speed(gesture.clientY - box.top)
  if (!dx && !dy) return
  const left = view.scrollLeft, top = view.scrollTop
  view.scrollBy(dx, dy)
  if (view.scrollLeft === left && view.scrollTop === top) return
  followPointer()
  scrollFrame = requestAnimationFrame(scrollNearEdge)
}
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

function cardStyle(card: C) {
  const offset = dragOffset.value
  return offset && activeMove.value?.id === card.id && activeMove.value.source === 'pointer'
    ? { transform: `translate(${offset.x}px, ${offset.y}px)` } : undefined
}

defineExpose({
  /** Move the keyboard focus to a card. Returns false when the card is not shown. */
  focusCard,
  /** Cancel a pick-up or drag in progress, reporting `card-move-cancel` with reason `escape`. */
  cancelMove: () => cancelMove('escape'),
})
</script>

<template>
  <div ref="root" class="vw-board" :class="{ 'vw-rtl': rtl }" :dir="dir === 'rtl' ? 'rtl' : undefined">
    <div ref="scroller" class="vw-board-scroll" role="region" :aria-label="messages.region" tabindex="0" :style="boardStyle">
      <div v-if="validationError || !columns.length" class="vw-board-empty"><slot name="empty">{{ messages.empty }}</slot></div>
      <div v-else class="vw-board-grid" :class="{ 'vw-has-lanes': laned, 'vw-is-moving': activeMove }"
        :style="gridColumns === undefined ? undefined : { gridTemplateColumns: gridColumns }">
        <div v-for="(column, c) in columns" :key="column.id" class="vw-board-column-head"
          :class="{
            'vw-is-over-limit': groups.columns[c]!.overLimit, 'vw-is-at-limit': groups.columns[c]!.atLimit,
            'vw-is-under-minimum': groups.columns[c]!.underMinimum, 'vw-is-collapsed': columnCollapsed(c),
          }">
          <slot name="column-header" :column="column" :status="groups.columns[c]!">
            <button v-if="collapsible" type="button" class="vw-board-toggle" :aria-expanded="!columnCollapsed(c)"
              :aria-label="toggleName(columnCollapsed(c), column.label)" @click="toggleColumn(column.id)">
              <span class="vw-board-toggle-icon" aria-hidden="true"></span>
            </button>
            <span class="vw-board-column-title">
              <strong>{{ column.label }}</strong>
              <small v-if="column.detail && !columnCollapsed(c)">{{ column.detail }}</small>
            </span>
            <span class="vw-board-count" aria-hidden="true">{{ countText(groups.columns[c]!) }}{{ column.wipLimit === undefined ? '' : ' / ' + column.wipLimit }}</span>
            <span v-if="groups.columns[c]!.overLimit && !columnCollapsed(c)" class="vw-board-wip-warning">{{ messages.overLimit }}</span>
            <span v-if="groups.columns[c]!.underMinimum && !columnCollapsed(c)" class="vw-board-wip-warning vw-is-under">{{ messages.underMinimum }}</span>
          </slot>
          <span :id="`${uid}-column-${c}`" hidden>{{ columnDescription(groups.columns[c]!) }}</span>
        </div>
        <template v-for="(row, r) in groups.rows" :key="row.laneId ?? ''">
          <div v-if="laneOf(r)" class="vw-board-lane-head" :class="{ 'vw-is-collapsed': laneCollapsed(r) }">
            <button v-if="collapsible" type="button" class="vw-board-toggle" :aria-expanded="!laneCollapsed(r)"
              :aria-label="toggleName(laneCollapsed(r), laneOf(r)!.label)" @click="toggleLane(laneOf(r)!.id)">
              <span class="vw-board-toggle-icon" aria-hidden="true"></span>
            </button>
            <span class="vw-board-lane-title"><strong>{{ laneOf(r)!.label }}</strong><small v-if="laneOf(r)!.detail">{{ laneOf(r)!.detail }}</small></span>
            <span v-if="collapsible || laneCollapsed(r)" class="vw-board-count" aria-hidden="true">{{ countText({ count: laneCount(r), total: laneTotal(r) }) }}</span>
          </div>
          <template v-if="!laneCollapsed(r)">
            <template v-for="(cell, c) in row.cells" :key="cell.columnId">
              <div v-if="columnCollapsed(c)" class="vw-board-cell vw-is-collapsed" aria-hidden="true"></div>
              <ul v-else class="vw-board-cell" role="list"
                :class="{ 'vw-is-over-limit': groups.columns[c]!.overLimit, 'vw-is-target': dropTarget?.lane === r && dropTarget?.column === c }"
                :aria-label="cellName(columns[c]!, laneOf(r))" :aria-describedby="`${uid}-column-${c}`" :data-vw-cell="`${r}:${c}`">
            <template v-for="item in cellItems(r, c)" :key="item.kind === 'card' ? item.card.id : '$drop'">
              <li v-if="item.kind === 'drop'" class="vw-board-drop" :class="{ 'vw-is-over-limit': item.over }" aria-hidden="true"></li>
              <li v-else class="vw-board-card-item">
                <button type="button" class="vw-board-card" :class="[`vw-tone-${item.card.tone ?? 'blue'}`, {
                  'vw-is-selected': selectedId === item.card.id, 'vw-is-movable': movable(item.card),
                  'vw-is-dragging': activeMove?.id === item.card.id && activeMove.source === 'pointer',
                  'vw-is-picked': activeMove?.id === item.card.id && activeMove.source === 'keyboard',
                }]" :style="cardStyle(item.card)" :data-vw-card="item.card.id" :aria-label="item.card.label"
                  :aria-pressed="selectedId === item.card.id" :aria-describedby="movable(item.card) ? `${uid}-move-hint` : undefined"
                  @keydown="cardKeys($event, item.card)" @blur="cardBlur(item.card)" @click="cardClick(item.card)"
                  @pointerdown="pressCard($event, item.card)" @pointermove="moveCard" @pointerup="releaseCard" @pointercancel="releaseCard"
                  @lostpointercapture="lostCapture">
                  <slot name="card" :card="item.card" :selected="selectedId === item.card.id" :moving="activeMove?.id === item.card.id"
                    :column="columns[c]!" :lane="laneOf(r)">
                    <span class="vw-board-card-label">{{ item.card.label }}</span>
                    <span v-if="item.card.detail" class="vw-board-card-detail">{{ item.card.detail }}</span>
                  </slot>
                </button>
              </li>
            </template>
            <li v-if="!cell.cards.length && !(dropTarget?.lane === r && dropTarget?.column === c)" class="vw-board-cell-empty">
              <slot name="empty" :column="columns[c]" :lane="laneOf(r)">{{ messages.emptyCell }}</slot>
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
