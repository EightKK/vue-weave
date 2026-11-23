// Task board (kanban) helpers for the TaskBoard component and for applications that keep board data elsewhere. Cards
// sit in cells of columns × lanes. The order of the `cards` array is the order inside every cell, so grouping is stable
// and a move only reorders that array. Free of Vue and the DOM.
import type { ChartTone } from './types.js'
import { checkId, formatId, invalidIdError, isId, unknownReferenceError } from './ids.js'

/**
 * A status column of a task board. `wipLimit` is a work-in-progress limit: the column is over it with more cards.
 * `wipMin` is the opposite, a minimum: the column is under it with fewer cards. Both count every card of the column,
 * whether or not a filter hides it.
 */
export interface TaskBoardColumn {
  id: string
  label: string
  /** Optional second line of the column header. */
  detail?: string
  /** A non-negative integer. Exceeding it only marks the column; moves are blocked by `validateCardMove` alone. */
  wipLimit?: number
  /** A non-negative integer, at most `wipLimit` when that is set. Falling below it only marks the column. */
  wipMin?: number
}

/** A horizontal swimlane of a task board, for example a team or a priority. */
export interface TaskBoardLane {
  id: string
  label: string
  detail?: string
}

/**
 * A card of a task board. `D` types the optional `data` payload; it defaults to `unknown`. `laneId` is required when the
 * board has lanes and ignored when it has none.
 */
export interface TaskBoardCard<D = unknown> {
  id: string
  columnId: string
  laneId?: string
  label: string
  detail?: string
  tone?: ChartTone
  /** False keeps the card in place: it can be selected and activated but not moved. */
  draggable?: boolean
  /** Application data. The component passes it through untouched. */
  data?: D
}

/**
 * The place of a card: its column, its lane (only on boards with lanes) and its index among the cards of that cell. In
 * a proposal's `after`, `index` counts the cards of the target cell without the moved card, including the cards that a
 * `filter` hides, so `applyBoardCardMove` places the card where the board showed it. `before.index` counts all cards too.
 */
export interface TaskBoardPosition {
  columnId: string
  laneId?: string
  index: number
}

/**
 * A card move proposal from TaskBoard (`card-move`). Apply it with `applyBoardCardMove(cards, change)`. A proposal
 * without `laneId` comes from a board without lanes.
 */
export interface TaskBoardCardMove {
  id: string
  before: TaskBoardPosition
  after: TaskBoardPosition
  source: 'pointer' | 'keyboard'
}

/** Synchronous check of a `card-move` proposal. Accept with true or undefined; reject with false or a reason. */
export type TaskBoardCardMoveValidator = (change: TaskBoardCardMove) => boolean | string | void

/**
 * Why TaskBoard ended a pick-up or drag without a proposal (`card-move-cancel`). `no-target` also covers a drop on the
 * card's own place; `api` is the exposed `cancelMove()`.
 */
export type TaskBoardMoveCancelReason = 'escape' | 'pointer-cancel' | 'no-target' | 'blur' | 'data-change' | 'api'

/** A cancelled card move: the card, its position when the move started and the reason. */
export interface TaskBoardMoveCancel {
  id: string
  before: TaskBoardPosition
  reason: TaskBoardMoveCancelReason
  source: 'pointer' | 'keyboard'
}

/**
 * Payload of the TaskBoard `background-click` event: where a primary click on empty board space landed. `columnId` is
 * set for a click in a cell (a column body, also a collapsed column's strip), `laneId` for a cell of a board with lanes;
 * both are undefined for the board background between and around the cells.
 */
export interface TaskBoardBackgroundClick {
  columnId?: string
  laneId?: string
}

/**
 * The cards of one column in one lane (`laneId` is undefined on a board without lanes), in `cards` order. With a
 * `filter`, `cards` holds only the cards that pass it.
 */
export interface TaskBoardCell<C extends TaskBoardCard = TaskBoardCard> {
  columnId: string
  laneId?: string
  cards: C[]
  /** For each entry of `cards`, its index among all cards of the cell, hidden ones included (`TaskBoardPosition.index`). */
  indices: number[]
  /** The number of cards in the cell, hidden ones included. */
  total: number
}

/**
 * The card counts of a column over all lanes, with its WIP limit and minimum. `count` is the number of cards shown (those
 * that pass the filter) and `total` the number of all cards. The WIP state looks at `total`: `overLimit` is
 * `total > wipLimit`, `atLimit` `total >= wipLimit` and `underMinimum` `total < wipMin`.
 */
export interface TaskBoardColumnStatus {
  id: string
  count: number
  total: number
  wipLimit?: number
  wipMin?: number
  atLimit: boolean
  overLimit: boolean
  underMinimum: boolean
}

/**
 * Cards grouped by `groupBoardCards`. `rows` holds one entry per lane in lane order, or a single entry without
 * `laneId` on a board without lanes; each row has one cell per column in column order.
 */
export interface TaskBoardGroups<C extends TaskBoardCard = TaskBoardCard> {
  rows: { laneId?: string; cells: TaskBoardCell<C>[] }[]
  columns: TaskBoardColumnStatus[]
  /** Every card's position by card ID. */
  positions: Map<string, TaskBoardPosition>
}

/** The English UI strings and accessible names of TaskBoard; pass a partial object as `labels` to override them. */
export interface TaskBoardLabels {
  /** Name of the board region. Default "Task board". */
  region: string
  /** Shown when there are no columns. Default "No columns to display". */
  empty: string
  /** Shown in a cell without cards. Default "No cards". */
  emptyCell: string
  /** Text after a card count of one. Default "card". */
  card: string
  /** Text after any other card count. Default "cards". */
  cards: string
  /** Words before the WIP limit in the column description. Default "WIP limit". */
  wipLimit: string
  /** Warning of a column over its WIP limit. Default "Over WIP limit". */
  overLimit: string
  /** Words before the WIP minimum in the column description. Default "WIP minimum". */
  wipMin: string
  /** Warning of a column under its WIP minimum. Default "Under WIP minimum". */
  underMinimum: string
  /** Name of the button that collapses a column or lane, followed by its label. Default "Collapse". */
  collapse: string
  /** Name of the button that expands a collapsed column or lane, followed by its label. Default "Expand". */
  expand: string
  /** Description of every movable card. */
  moveHint: string
  /** Announced when `validateCardMove` returns false. Default "This card move was rejected." */
  moveRejected: string
  /** Start of the pick-up announcement, followed by the card label. Default "Picked up". */
  pickedUp: string
  /** Start of the drop announcement, followed by the card label. Default "Moved". */
  moved: string
  /** Announced, after the card label, when a move ends without a proposal. Default "move cancelled". */
  moveCancelled: string
  /** Word before the position of a card in a cell. Default "position". */
  position: string
  /** Word between a position and the cell size. Default "of". */
  of: string
  /** Word before the lane label in announcements. Default "lane". */
  lane: string
}

const usesLanes = (lanes: readonly TaskBoardLane[] | undefined) => lanes !== undefined && lanes.length > 0

function checkWipLimit(column: TaskBoardColumn) {
  const limit = column.wipLimit, min = column.wipMin
  if (limit !== undefined && (!Number.isInteger(limit) || limit < 0)) {
    throw new RangeError(`The WIP limit of column ${column.id} must be a non-negative integer: ${String(limit)}`)
  }
  if (min !== undefined && (!Number.isInteger(min) || min < 0)) {
    throw new RangeError(`The WIP minimum of column ${column.id} must be a non-negative integer: ${String(min)}`)
  }
  if (min !== undefined && limit !== undefined && min > limit) {
    throw new RangeError(`The WIP minimum of column ${column.id} must not exceed its WIP limit: ${min} > ${limit}`)
  }
}

/**
 * Group cards into cells of columns × lanes. Cards keep their `cards` order inside each cell. Throws an Error for an
 * invalid or duplicate column, lane or card ID and for a card whose column or lane is unknown (or, on a board with
 * lanes, missing), and a RangeError for a WIP limit or minimum that is not a non-negative integer or a minimum above the
 * limit. Without `lanes` (or with an empty array) the board has a single row of cells and card `laneId`s are ignored.
 *
 * `options.filter` keeps the cards it rejects out of `cells[].cards`. Positions, indices and WIP states still look at
 * all cards, so a proposal built from the filtered view stays valid for the full `cards` array. A filter that is not a
 * function throws a TypeError.
 */
export function groupBoardCards<C extends TaskBoardCard>(
  cards: readonly C[], columns: readonly TaskBoardColumn[], lanes?: readonly TaskBoardLane[],
  options: { filter?: (card: C) => boolean } = {},
): TaskBoardGroups<C> {
  const filter = options.filter
  if (filter !== undefined && typeof filter !== 'function') {
    throw new TypeError(`The board filter must be a function: ${filter === null ? 'null' : typeof filter}`)
  }
  const columnIds = new Set<string>()
  for (const column of columns) {
    checkId('column', column?.id, columnIds)
    checkWipLimit(column)
  }
  const laneIds = new Set<string>()
  for (const lane of lanes ?? []) checkId('lane', lane?.id, laneIds)
  const laned = usesLanes(lanes)
  const rows = (laned ? lanes!.map(lane => lane.id as string | undefined) : [undefined]).map(laneId => ({
    laneId, cells: columns.map(column => ({
      columnId: column.id, ...laneId === undefined ? {} : { laneId }, cards: [] as C[], indices: [] as number[], total: 0,
    })),
  }))
  const rowIndex = new Map(rows.map((row, index) => [row.laneId, index]))
  const columnIndex = new Map(columns.map((column, index) => [column.id, index]))
  const cardIds = new Set<string>()
  const positions = new Map<string, TaskBoardPosition>()
  const counts = columns.map(() => 0), totals = columns.map(() => 0)
  for (const card of cards) {
    checkId('card', card?.id, cardIds)
    const column = columnIndex.get(card.columnId)
    if (column === undefined) throw unknownReferenceError('column', 'card ' + card.id, card.columnId)
    const laneId = laned ? card.laneId : undefined
    if (laned && (!isId(laneId) || !laneIds.has(laneId))) throw unknownReferenceError('lane', 'card ' + card.id, card.laneId)
    const cell = rows[rowIndex.get(laneId)!]!.cells[column]!
    positions.set(card.id, { columnId: card.columnId, ...laneId === undefined ? {} : { laneId }, index: cell.total })
    totals[column]!++
    if (filter && !filter(card)) {
      cell.total++
      continue
    }
    cell.cards.push(card)
    cell.indices.push(cell.total++)
    counts[column]!++
  }
  return {
    rows,
    columns: columns.map((column, index) => {
      const count = counts[index]!, total = totals[index]!, limit = column.wipLimit, min = column.wipMin
      return {
        id: column.id, count, total, ...limit === undefined ? {} : { wipLimit: limit }, ...min === undefined ? {} : { wipMin: min },
        atLimit: limit !== undefined && total >= limit, overLimit: limit !== undefined && total > limit,
        underMinimum: min !== undefined && total < min,
      }
    }),
    positions,
  }
}

/**
 * The position of one card: its column, its lane when `lanes` is true and its index among the cards of the same cell
 * in `cards` order. Throws an Error for an unknown card ID.
 */
export function boardCardPosition(cards: readonly TaskBoardCard[], id: string, options: { lanes?: boolean } = {}): TaskBoardPosition {
  const card = cards.find(item => item.id === id)
  if (!card) throw unknownReferenceError('card', 'board', id)
  const laneId = options.lanes ? card.laneId : undefined
  let index = 0
  for (const item of cards) {
    if (item === card) break
    if (item.columnId === card.columnId && (!options.lanes || item.laneId === laneId)) index++
  }
  return { columnId: card.columnId, ...laneId === undefined ? {} : { laneId }, index }
}

function samePosition(a: TaskBoardPosition, b: TaskBoardPosition) {
  return a.columnId === b.columnId && a.laneId === b.laneId && a.index === b.index
}

/**
 * Apply a `card-move` proposal: a new array in which the card has the target column (and lane, when `after.laneId` is
 * set) and sits before the card that had `after.index` in the target cell, or after the last card of that cell. Cards
 * are never mutated; the moved card is a shallow copy. A proposal whose positions have no `laneId` treats each column as
 * one cell and keeps the card's `laneId`.
 *
 * Pass `board` to check the target column and lane against the board. Throws an Error for an unknown card, column or
 * lane and for a stale proposal (the card is no longer at `before`), and a RangeError for an index that is not an
 * integer from 0 to the size of the target cell.
 */
export function applyBoardCardMove<C extends TaskBoardCard>(
  cards: readonly C[], move: TaskBoardCardMove,
  board: { columns?: readonly TaskBoardColumn[]; lanes?: readonly TaskBoardLane[] } = {},
): C[] {
  if (!isId(move?.id)) throw invalidIdError('card', move?.id)
  const { before, after } = move
  if (!isId(after?.columnId)) throw invalidIdError('column', after?.columnId)
  if (after.laneId !== undefined && !isId(after.laneId)) throw invalidIdError('lane', after.laneId)
  if (board.columns && !board.columns.some(column => column.id === after.columnId)) {
    throw unknownReferenceError('column', 'card move ' + move.id, after.columnId)
  }
  if (after.laneId !== undefined && board.lanes && !board.lanes.some(lane => lane.id === after.laneId)) {
    throw unknownReferenceError('lane', 'card move ' + move.id, after.laneId)
  }
  const laned = after.laneId !== undefined || before?.laneId !== undefined
  if (laned && (after.laneId === undefined || before?.laneId === undefined)) {
    throw new Error(`A card move must name a lane in both positions or in neither: ${move.id}`)
  }
  const current = boardCardPosition(cards, move.id, { lanes: laned })
  if (!before || !samePosition(current, before)) {
    throw new Error(`Stale card move for ${move.id}: the card is at ${current.columnId}${laned ? ' / ' + formatId(current.laneId) : ''} index ${current.index}`)
  }
  const card = cards.find(item => item.id === move.id)!
  const inTarget = (item: TaskBoardCard) => item.columnId === after.columnId && (!laned || item.laneId === after.laneId)
  const rest = cards.filter(item => item !== card)
  const targetCards = rest.filter(inTarget)
  if (!Number.isInteger(after.index) || after.index < 0 || after.index > targetCards.length) {
    throw new RangeError(`The card index must be an integer from 0 to ${targetCards.length}: ${String(after.index)}`)
  }
  const moved = { ...card, columnId: after.columnId, ...laned ? { laneId: after.laneId } : {} } as C
  if (targetCards.length === 0) {
    // An empty cell: keep the card where it was in the array, so cards of other cells keep their relative order.
    return cards.map(item => item === card ? moved : item)
  }
  const result = rest.slice()
  const anchor = targetCards[after.index]
  const at = anchor ? result.indexOf(anchor) : result.indexOf(targetCards[targetCards.length - 1]!) + 1
  result.splice(at, 0, moved)
  return result
}
