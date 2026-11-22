// Keyboard arithmetic of TaskBoard: where an arrow key takes a picked-up card or the focus. Internal, not exported.
import type { TaskBoardCard, TaskBoardGroups } from '../../core/taskBoard.js'

/** A drop target by grid indexes: `lane` is the row of `TaskBoardGroups.rows`, `index` counts the cell without the moved card. */
export interface BoardTarget {
  column: number
  lane: number
  index: number
}

/** The number of cards in a cell without the card being moved. */
export function cellSize(groups: TaskBoardGroups, lane: number, column: number, movingId?: string) {
  const cards = groups.rows[lane]?.cells[column]?.cards ?? []
  return movingId === undefined ? cards.length : cards.filter(card => card.id !== movingId).length
}

/**
 * The target after a key press while a card is picked up, or `undefined` for a key that does not move it. Up and Down
 * step through the cell and continue into the previous or next lane; Left and Right change the column in the visual
 * direction (`rtl` swaps them), keeping the index where the target cell allows; Home and End go to the first and the
 * last place of the cell.
 */
export function stepBoardTarget(groups: TaskBoardGroups, target: BoardTarget, key: string, movingId: string, rtl: boolean): BoardTarget | undefined {
  const size = (lane: number, column: number) => cellSize(groups, lane, column, movingId)
  const lanes = groups.rows.length, columns = groups.columns.length
  const { column, lane, index } = target
  if (key === 'ArrowUp') {
    if (index > 0) return { column, lane, index: index - 1 }
    return lane > 0 ? { column, lane: lane - 1, index: size(lane - 1, column) } : target
  }
  if (key === 'ArrowDown') {
    if (index < size(lane, column)) return { column, lane, index: index + 1 }
    return lane < lanes - 1 ? { column, lane: lane + 1, index: 0 } : target
  }
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const step = (key === 'ArrowRight') !== rtl ? 1 : -1
    const next = Math.min(columns - 1, Math.max(0, column + step))
    return { column: next, lane, index: Math.min(index, size(lane, next)) }
  }
  if (key === 'Home') return { column, lane, index: 0 }
  if (key === 'End') return { column, lane, index: size(lane, column) }
  return undefined
}

/**
 * The card that an arrow key moves the focus to, outside a move: Up and Down go to the previous or next card of the
 * column, across lanes; Left and Right to the nearest card of the next column with cards in the same lane, in the
 * visual direction. `undefined` for other keys; the card itself at an edge.
 */
export function neighbourCard<C extends TaskBoardCard>(groups: TaskBoardGroups<C>, id: string, key: string, rtl: boolean): C | undefined {
  const position = groups.positions.get(id)
  if (!position) return undefined
  const column = groups.columns.findIndex(item => item.id === position.columnId)
  const lane = Math.max(0, groups.rows.findIndex(row => row.laneId === position.laneId))
  const cards = (laneIndex: number, columnIndex: number) => groups.rows[laneIndex]?.cells[columnIndex]?.cards ?? []
  const self = cards(lane, column)[position.index]
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    const down = key === 'ArrowDown'
    const here = cards(lane, column)
    const next = here[position.index + (down ? 1 : -1)]
    if (next) return next
    for (let other = lane + (down ? 1 : -1); other >= 0 && other < groups.rows.length; other += down ? 1 : -1) {
      const list = cards(other, column)
      if (list.length) return down ? list[0] : list[list.length - 1]
    }
    return self
  }
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const step = (key === 'ArrowRight') !== rtl ? 1 : -1
    for (let other = column + step; other >= 0 && other < groups.columns.length; other += step) {
      const list = cards(lane, other)
      if (list.length) return list[Math.min(position.index, list.length - 1)]
    }
    return self
  }
  return undefined
}
