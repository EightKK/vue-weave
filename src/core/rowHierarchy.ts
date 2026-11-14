import { createTimelineRowTree } from './timeline.js'
import type { TimelineRow, TimelineRowPosition } from './types.js'

/**
 * Outline (WBS) codes of a row hierarchy in tree preorder: roots are numbered "1", "2", … and children append their
 * one-based position among their siblings ("1.2", "1.2.1"). Sibling order is the order of the rows in the array.
 * Throws an Error for duplicate IDs, unknown parents and cycles.
 */
export function timelineWbsCodes(rows: readonly TimelineRow[]): Map<string, string> {
  const tree = createTimelineRowTree(rows)
  const codes = new Map<string, string>()
  const counts = new Map<string | undefined, number>()
  for (const { row } of tree) {
    const count = (counts.get(row.parentId) ?? 0) + 1
    counts.set(row.parentId, count)
    codes.set(row.id, row.parentId === undefined ? String(count) : codes.get(row.parentId)! + '.' + count)
  }
  return codes
}

/** Children of each parent (`undefined` for the roots) in tree order. */
function childLists(rows: readonly TimelineRow[]) {
  const tree = createTimelineRowTree(rows)
  const children = new Map<string | undefined, TimelineRow[]>()
  for (const { row } of tree) {
    let list = children.get(row.parentId)
    if (!list) children.set(row.parentId, list = [])
    list.push(row)
  }
  return children
}

/** The parent and zero-based sibling index of a row. Throws an Error for an unknown row. */
export function timelineRowPosition(rows: readonly TimelineRow[], id: string): TimelineRowPosition {
  const row = rows.find(item => item.id === id)
  if (!row) throw new Error('Unknown row: ' + id)
  const index = childLists(rows).get(row.parentId)!.indexOf(row)
  return row.parentId === undefined ? { index } : { parentId: row.parentId, index }
}

/**
 * Move a row, with its subtree, under `target.parentId` (a root row without it) at sibling position `target.index`.
 * The index counts the new siblings without the moved row, from 0 (first) to their count (last). Returns the rows in
 * tree preorder, so every subtree follows its row; the moved row is a new object and every other row keeps its
 * identity. The input is not modified. Throws an Error for an unknown row or parent or a move into the row's own
 * subtree, and a RangeError for an index that is not an integer in range.
 */
export function moveTimelineRow<R extends TimelineRow>(rows: readonly R[], id: string, target: TimelineRowPosition): R[] {
  const children = childLists(rows) as Map<string | undefined, R[]>
  const byId = new Map(rows.map(row => [row.id, row]))
  const row = byId.get(id)
  if (!row) throw new Error('Unknown row: ' + id)
  const parentId = target.parentId
  if (parentId !== undefined && !byId.has(parentId)) throw new Error('Unknown parent row: ' + parentId)
  for (let ancestor = parentId; ancestor !== undefined; ancestor = byId.get(ancestor)!.parentId) {
    if (ancestor === id) throw new Error('A row cannot move into its own subtree: ' + id)
  }
  const siblings = (children.get(parentId) ?? []).filter(item => item.id !== id)
  if (!Number.isInteger(target.index) || target.index < 0 || target.index > siblings.length) {
    throw new RangeError(`The row index must be an integer from 0 to ${siblings.length}: ${target.index}`)
  }
  const { parentId: _previous, ...rest } = row
  const moved = (parentId === undefined ? rest : { ...rest, parentId }) as R
  children.set(row.parentId, children.get(row.parentId)!.filter(item => item.id !== id))
  siblings.splice(target.index, 0, moved)
  children.set(parentId, siblings)
  const ordered: R[] = []
  const stack = (children.get(undefined) ?? []).slice().reverse()
  while (stack.length) {
    const next = stack.pop()!
    ordered.push(next)
    const group = children.get(next.id)
    if (group) for (let i = group.length - 1; i >= 0; i--) stack.push(group[i]!)
  }
  return ordered
}

/** The target that makes a row the last child of its previous sibling. Throws an Error for a first sibling. */
export function indentTarget(rows: readonly TimelineRow[], id: string): TimelineRowPosition {
  const position = timelineRowPosition(rows, id)
  if (position.index === 0) throw new Error('The first row of its group cannot be indented: ' + id)
  const children = childLists(rows)
  const previous = children.get(position.parentId)![position.index - 1]!
  return { parentId: previous.id, index: children.get(previous.id)?.length ?? 0 }
}

/** The target that makes a row the next sibling after its parent. Throws an Error for a root row. */
export function outdentTarget(rows: readonly TimelineRow[], id: string): TimelineRowPosition {
  const position = timelineRowPosition(rows, id)
  if (position.parentId === undefined) throw new Error('A root row cannot be outdented: ' + id)
  const parent = timelineRowPosition(rows, position.parentId)
  return parent.parentId === undefined ? { index: parent.index + 1 } : { parentId: parent.parentId, index: parent.index + 1 }
}

/** Make a row the last child of its previous sibling (see `moveTimelineRow`). Throws an Error for a first sibling. */
export function indentTimelineRow<R extends TimelineRow>(rows: readonly R[], id: string): R[] {
  return moveTimelineRow(rows, id, indentTarget(rows, id))
}

/** Make a row the next sibling after its parent (see `moveTimelineRow`). Throws an Error for a root row. */
export function outdentTimelineRow<R extends TimelineRow>(rows: readonly R[], id: string): R[] {
  return moveTimelineRow(rows, id, outdentTarget(rows, id))
}
