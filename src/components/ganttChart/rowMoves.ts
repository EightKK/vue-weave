// Pure row hierarchy arithmetic of GanttChart's row moves (`rowsReorderable`): sibling lists, positions, the target of
// a move key and the drop position under the pointer. The parent applies a proposal with `moveTimelineRow`.
import type { TimelineRow, TimelineRowPosition } from '../../core/types.js'

/** Children of each parent row (`undefined` for the roots), in tree order. */
export type RowChildren = ReadonlyMap<string | undefined, readonly TimelineRow[]>

/** One displayed row, as `createTimelineRowTree` lists it after collapsing. */
export interface DisplayedRow {
  row: TimelineRow
  depth: number
  hasChildren: boolean
}

/** A drop position between displayed rows: the gap index, the indent depth of the indicator and the proposed position. */
export interface RowDrop {
  gap: number
  depth: number
  target: TimelineRowPosition
}

export function rowChildren(rows: Iterable<{ row: TimelineRow }>): RowChildren {
  const children = new Map<string | undefined, TimelineRow[]>()
  for (const { row } of rows) {
    let list = children.get(row.parentId)
    if (!list) children.set(row.parentId, list = [])
    list.push(row)
  }
  return children
}

export function rowPlace(parentId: string | undefined, index: number): TimelineRowPosition {
  return parentId === undefined ? { index } : { parentId, index }
}

export function rowPosition(row: TimelineRow, children: RowChildren): TimelineRowPosition {
  return rowPlace(row.parentId, children.get(row.parentId)!.indexOf(row))
}

/** Modifier and key state of a move-handle key press. */
export interface RowMoveKey {
  key: string
  altKey: boolean
  shiftKey: boolean
}

/**
 * What a key on a row's move handle does: `'ignore'` for keys that are not row moves (no Alt, or another key), otherwise
 * the target position, or undefined when the row cannot move that way. Alt+Up and Alt+Down move the row among its
 * siblings; Alt+Shift with the arrow towards the row text indents it under its previous sibling (right in left-to-right
 * charts, left in right-to-left charts) and the other arrow outdents it after its parent.
 */
export function rowMoveForKey(
  event: RowMoveKey, row: TimelineRow, children: RowChildren, rowById: ReadonlyMap<string, TimelineRow>, rtl: boolean,
): TimelineRowPosition | undefined | 'ignore' {
  if (!event.altKey) return 'ignore'
  const before = rowPosition(row, children)
  const siblings = children.get(row.parentId)!
  if (event.shiftKey && (event.key === 'ArrowLeft' || event.key === 'ArrowRight')) {
    if ((event.key === 'ArrowRight') !== rtl) {
      const previous = siblings[before.index - 1]
      return previous ? rowPlace(previous.id, children.get(previous.id)?.length ?? 0) : undefined
    }
    if (row.parentId === undefined) return undefined
    const parent = rowPosition(rowById.get(row.parentId)!, children)
    return rowPlace(parent.parentId, parent.index + 1)
  }
  if (!event.shiftKey && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
    const index = before.index + (event.key === 'ArrowUp' ? -1 : 1)
    return index >= 0 && index < siblings.length ? rowPlace(row.parentId, index) : undefined
  }
  return 'ignore'
}

/**
 * The drop position for row `id` at `y` pixels below the top of the body: before a row in the upper half of a
 * displayed row, otherwise after it, which is its first child when its children are shown. Positions inside the
 * dragged subtree are not offered.
 */
export function rowDropAt(
  id: string, y: number, rows: readonly DisplayedRow[], rowHeight: number, children: RowChildren,
  rowById: ReadonlyMap<string, TimelineRow>, collapsed: ReadonlySet<string>,
): RowDrop | undefined {
  const clamped = Math.max(0, Math.min(rows.length * rowHeight - 1, y))
  const index = Math.floor(clamped / rowHeight)
  const upper = clamped - index * rowHeight < rowHeight / 2
  const item = rows[index]!
  if (item.row.id === id) return undefined
  let parentId: string | undefined, depth: number, position: number
  if (upper) {
    parentId = item.row.parentId
    depth = item.depth
    position = children.get(parentId)!.filter(row => row.id !== id).indexOf(item.row)
  } else if (item.hasChildren && !collapsed.has(item.row.id)) {
    parentId = item.row.id
    depth = item.depth + 1
    position = 0
  } else {
    parentId = item.row.parentId
    depth = item.depth
    position = children.get(parentId)!.filter(row => row.id !== id).indexOf(item.row) + 1
  }
  for (let ancestor = parentId; ancestor !== undefined; ancestor = rowById.get(ancestor)?.parentId) {
    if (ancestor === id) return undefined
  }
  return { gap: upper ? index : index + 1, depth, target: rowPlace(parentId, position) }
}
