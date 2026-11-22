import type { GraphEdge, GraphLayout, GraphLayoutDirection } from './graph.js'
import { isFiniteRect } from './graphGeometry.js'
import { assertGraphLayoutDirection, isVerticalDirection } from './graphOrient.js'
import { unknownReferenceError } from './ids.js'

export interface CrossingItem {
  rank: number
  a: number
  b: number
}

/** Count pairs of edges between the same two adjacent ranks whose endpoints strictly swap order. */
export function countAdjacentCrossings(items: CrossingItem[]): number {
  const groups = new Map<number, CrossingItem[]>()
  for (const item of items) {
    const group = groups.get(item.rank)
    if (group) group.push(item)
    else groups.set(item.rank, [item])
  }
  let total = 0
  for (const group of groups.values()) {
    if (group.length < 2) continue
    group.sort((p, q) => p.a - q.a || p.b - q.b)
    const values = Array.from(new Set(group.map(item => item.b))).sort((p, q) => p - q)
    const index = new Map(values.map((value, i) => [value, i + 1]))
    const tree = new Array<number>(values.length + 1).fill(0)
    group.forEach((item, seen) => {
      const at = index.get(item.b)!
      let notAbove = 0
      for (let i = at; i > 0; i -= i & -i) notAbove += tree[i]!
      total += seen - notAbove
      for (let i = at; i < tree.length; i += i & -i) tree[i]! += 1
    })
  }
  return total
}

/**
 * Count crossings between edges that connect adjacent ranks, measured on the node centres of a layout.
 * Long edges, same-rank edges and self-loops use their own routes and are not counted. Throws a RangeError for an
 * unknown direction or a box of an edge end without finite geometry and rank, and an Error for an edge end without a
 * box.
 */
export function countGraphCrossings(layout: GraphLayout, edges: readonly GraphEdge[], direction: GraphLayoutDirection = 'LR'): number {
  assertGraphLayoutDirection(direction)
  const vertical = isVerticalDirection(direction)
  const items: CrossingItem[] = []
  const boxOf = (id: string, edgeId: string) => {
    const box = layout.boxes.get(id)
    if (!box) throw unknownReferenceError('node', 'graph edge ' + edgeId, id)
    if (!isFiniteRect(box, 'any') || !Number.isFinite(box.rank)) throw new RangeError('Graph box geometry must be finite: ' + id)
    return box
  }
  for (const { id, from, to } of edges) {
    const source = boxOf(from, id), target = boxOf(to, id)
    if (Math.abs(source.rank - target.rank) !== 1) continue
    const [low, high] = source.rank < target.rank ? [source, target] : [target, source]
    const centre = (box: typeof low) => vertical ? box.x + box.width / 2 : box.y + box.height / 2
    items.push({ rank: low.rank, a: centre(low), b: centre(high) })
  }
  return countAdjacentCrossings(items)
}

/**
 * The neighbours of each node in lower (`above`) and higher (`below`) ranks, in edge order, and the edges between
 * adjacent ranks as [lower, higher] pairs. Same-rank edges and self-loops are left out. Shared by the crossing reduction
 * of the layered and the swimlane layouts.
 */
export function rankNeighbours(edges: readonly GraphEdge[], ranks: ReadonlyMap<string, number>) {
  const above = new Map<string, string[]>()
  const below = new Map<string, string[]>()
  const adjacent: [string, string][] = []
  const push = (map: Map<string, string[]>, key: string, value: string) => {
    const list = map.get(key)
    if (list) list.push(value)
    else map.set(key, [value])
  }
  for (const { from, to } of edges) {
    const a = ranks.get(from)!, b = ranks.get(to)!
    if (a === b) continue
    const [low, high] = a < b ? [from, to] : [to, from]
    push(below, low, high)
    push(above, high, low)
    if (Math.abs(a - b) === 1) adjacent.push([low, high])
  }
  return { above, below, adjacent }
}

/** Reorder nodes inside each column (in place) with alternating barycenter/median sweeps; never worse than the input order. */
export function reduceCrossings(
  columns: string[][],
  edges: readonly GraphEdge[],
  ranks: ReadonlyMap<string, number>,
  method: 'barycenter' | 'median',
  sweeps: number,
): void {
  const { above, below, adjacent } = rankNeighbours(edges, ranks)

  const position = new Map<string, number>()
  const place = (column: string[]) => column.forEach((id, i) => position.set(id, i - (column.length - 1) / 2))
  columns.forEach(column => column && place(column))
  const count = () => countAdjacentCrossings(adjacent.map(([low, high]) => ({ rank: ranks.get(low)!, a: position.get(low)!, b: position.get(high)! })))

  let best = columns.map(column => column?.slice())
  let bestCount = count()

  for (let sweep = 0; sweep < sweeps && bestCount > 0; sweep++) {
    const down = sweep % 2 === 0
    const first = down ? 1 : columns.length - 2
    const step = down ? 1 : -1
    for (let rank = first; rank >= 0 && rank < columns.length; rank += step) {
      const column = columns[rank]
      if (!column || column.length < 2) continue
      const neighbours = down ? above : below
      const keys = new Map<string, number>()
      for (const id of column) {
        const values = (neighbours.get(id) ?? []).map(other => position.get(other)!).sort((p, q) => p - q)
        if (!values.length) keys.set(id, position.get(id)!)
        else if (method === 'barycenter') keys.set(id, values.reduce((sum, value) => sum + value, 0) / values.length)
        else {
          const mid = values.length >> 1
          keys.set(id, values.length % 2 ? values[mid]! : (values[mid - 1]! + values[mid]!) / 2)
        }
      }
      const current = new Map(column.map((id, i) => [id, i]))
      column.sort((p, q) => keys.get(p)! - keys.get(q)! || current.get(p)! - current.get(q)!)
      place(column)
    }
    const crossings = count()
    if (crossings < bestCount) {
      bestCount = crossings
      best = columns.map(column => column?.slice())
    }
  }

  columns.forEach((column, rank) => {
    if (!column) return
    column.splice(0, column.length, ...best[rank]!)
  })
}
