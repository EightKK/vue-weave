import {
  indexGraph, layoutLayeredGraph, type GraphBox, type GraphEdge, type GraphLayout, type GraphLayoutOptions, type GraphLayoutRoute,
  type GraphNodeSize, type GraphPoint, type IdentifiedNode,
} from './graph.js'
import { graphIncidentCurve } from './graphCurve.js'
import { checkLayoutSizes, defaultColumnGap, defaultNodeHeight, defaultNodeWidth, defaultPadding, defaultRowGap } from './graphOptions.js'
import { assertGraphLayoutDirection } from './graphOrient.js'
import { SpatialGrid, graphPathPolylines, segmentMeetsRect, type SpatialRect } from './graphSpatial.js'
import { unknownReferenceError } from './ids.js'

/**
 * A position a node already has: the top-left corner of its box, optionally with the box size and rank. A `GraphBox`
 * from an earlier layout fits.
 */
export type GraphKnownPosition = GraphPoint & Partial<GraphNodeSize> & { rank?: number }

/** Options of `layoutGraphIncrementally`. */
/**
 * Options of `layoutGraphIncrementally`: the shared layout options, where `direction` is the direction in which
 * successors are placed after their predecessors, `nodeWidth` and `nodeHeight` size a node without a size of its own
 * (from its position or `sizes`), `columnGap` and `rowGap` are the free space kept between boxes along and across the
 * flow, and `padding` is added to the right and bottom of the layout size (and is where a graph without positions starts).
 */
export interface GraphIncrementalLayoutOptions extends GraphLayoutOptions {
  /** Node sizes by ID. A size in a node's position wins over this one. */
  sizes?: ReadonlyMap<string, GraphNodeSize>
  /** Pinned nodes. Each must be a node with a position; it never moves, whatever the other options say. */
  fixedIds?: Iterable<string>
  /**
   * Relaxed mode: how far, in chart units, a positioned node that is not fixed may be pushed across the flow to free the
   * place a new node wants next to its neighbours. Default 0: no positioned node moves.
   */
  maxDisplacement?: number
  /**
   * Default false: new boxes stay at nonnegative coordinates, as the NetworkGraph `positions` prop requires, so a new
   * node whose flow side would leave that area (a predecessor of a node at the left edge in LR) is placed beside its
   * neighbour in the same rank instead and listed in `fallbackIds`. True lets new boxes take negative coordinates.
   */
  allowNegative?: boolean
  /**
   * An earlier layout of the same graph. Edges whose two end boxes are unchanged in the result keep its path, label
   * anchor and route metadata; the other edges get the curve drawn for a moved node.
   */
  previousLayout?: Pick<GraphLayout, 'boxes' | 'paths' | 'edgeLabels'> & Partial<Pick<GraphLayout, 'routes'>>
}

/** The result of `layoutGraphIncrementally`: a complete layout, plus what happened to which node. */
export interface GraphIncrementalLayout extends GraphLayout {
  /** New nodes (without a position), in the order they were placed. */
  placedIds: string[]
  /** Positioned nodes that the relaxed mode pushed aside, in input order. Empty unless `maxDisplacement` is positive. */
  movedIds: string[]
  /** New nodes placed beside their neighbour, across the flow, because their flow side would leave the nonnegative area. */
  fallbackIds: string[]
}

const eps = 1e-9
// Free-slot search: jumps past blocking boxes per direction before the slot past every box is used.
const maxJumps = 256

// A box in flow coordinates: `a` along the flow (growing towards successors), `c` across it.
interface FlowRect {
  a1: number
  a2: number
  c1: number
  c2: number
}

function positive(value: number) {
  return Number.isFinite(value) && value > 0
}

/**
 * Places the nodes of a graph that have no position yet next to the ones that do, without moving those. Every node in
 * `positions` keeps its box exactly (unless the relaxed mode `maxDisplacement` pushes it, and fixed nodes never move);
 * each new node goes on the flow side of its placed neighbours (after its predecessors, or before its successors when
 * no predecessor is placed) in the first free place across the flow, nearest to the middle of those neighbours, below
 * before above, keeping `columnGap` along and `rowGap` across the flow from every box. New nodes are placed in
 * breadth-first order from the placed ones, so a chain of new nodes follows its dependency order and several new nodes
 * of one neighbour stack around it. Components without any positioned node are laid out together with
 * layoutLayeredGraph and placed after all other boxes across the flow (below them for LR and RL, to their right for TB
 * and BT; at the padding when nothing has a position). Positions of IDs that are not nodes are ignored. Deterministic
 * for the same input; self-loops and cycles are allowed. Overlap tests use a bucket grid, so the cost grows with the
 * number of nodes and edges, not with their square.
 *
 * Edges get the curve drawn for a moved node between their boxes, or keep their path from `previousLayout` while both
 * end boxes are unchanged. Throws Error for invalid graphs (as indexGraph), a fixed ID that is not a node or has no
 * position, and RangeError for an unknown direction, a non-finite position, a size that is not finite and positive, and
 * gaps, padding or `maxDisplacement` that are not finite and nonnegative. The inputs are not modified.
 */
export function layoutGraphIncrementally(
  nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[], positions: ReadonlyMap<string, GraphKnownPosition>,
  options: GraphIncrementalLayoutOptions = {},
): GraphIncrementalLayout {
  const {
    direction = 'LR', nodeWidth = defaultNodeWidth, nodeHeight = defaultNodeHeight, sizes, columnGap = defaultColumnGap, rowGap = defaultRowGap,
    padding = defaultPadding, maxDisplacement = 0, allowNegative = false, previousLayout,
  } = options
  assertGraphLayoutDirection(direction)
  checkLayoutSizes(nodeWidth, nodeHeight, { columnGap, rowGap, padding, maxDisplacement })
  for (const [id, size] of sizes ?? []) {
    if (!positive(size?.width) || !positive(size?.height)) throw new RangeError('Graph node sizes must be finite and positive: ' + id)
  }
  const index = indexGraph(nodes, edges)
  const fixed = new Set<string>()
  for (const id of options.fixedIds ?? []) {
    if (!index.outgoing.has(id)) throw unknownReferenceError('node', 'fixedIds', id)
    if (!positions.has(id)) throw new Error('A fixed graph node needs a position: ' + id)
    fixed.add(id)
  }

  const horizontal = direction === 'LR' || direction === 'RL'
  const reversed = direction === 'RL' || direction === 'BT'
  const toFlow = (x: number, y: number, width: number, height: number): FlowRect => {
    const along = horizontal ? x : y, alongSize = horizontal ? width : height
    const cross = horizontal ? y : x, crossSize = horizontal ? height : width
    const a1 = reversed ? -(along + alongSize) : along
    return { a1, a2: a1 + alongSize, c1: cross, c2: cross + crossSize }
  }
  const fromFlow = (rect: FlowRect) => {
    const along = reversed ? -rect.a2 : rect.a1
    return horizontal ? { x: along, y: rect.c1 } : { x: rect.c1, y: along }
  }
  const sizeOf = (id: string, position?: GraphKnownPosition): GraphNodeSize => {
    if (position?.width !== undefined || position?.height !== undefined) {
      const width = position.width ?? sizes?.get(id)?.width ?? nodeWidth, height = position.height ?? sizes?.get(id)?.height ?? nodeHeight
      if (!positive(width) || !positive(height)) throw new RangeError('Graph node sizes must be finite and positive: ' + id)
      return { width, height }
    }
    return sizes?.get(id) ?? { width: nodeWidth, height: nodeHeight }
  }

  // Positioned nodes, in input order.
  const boxes = new Map<string, GraphBox>()
  const flow = new Map<string, FlowRect>()
  const gridIndex = new Map<string, number>()
  const ids: string[] = []
  let totalSize = 0
  for (const { id } of nodes) {
    const position = positions.get(id)
    if (!position) continue
    if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) throw new RangeError('Graph positions must be finite: ' + id)
    const { width, height } = sizeOf(id, position)
    const rank = Number.isFinite(position.rank) ? position.rank! : 0
    boxes.set(id, { x: position.x, y: position.y, width, height, rank })
    totalSize += (width + height) / 2
  }
  for (const { id } of nodes) if (!boxes.has(id)) totalSize += (sizeOf(id).width + sizeOf(id).height) / 2
  const grid = new SpatialGrid(Math.max(1, nodes.length ? totalSize / nodes.length : 1) + Math.max(columnGap, rowGap))
  let crossEnd = -Infinity
  const enter = (id: string, rect: FlowRect) => {
    flow.set(id, rect)
    gridIndex.set(id, grid.insert({ x1: rect.a1, y1: rect.c1, x2: rect.a2, y2: rect.c2 }))
    ids.push(id)
    crossEnd = Math.max(crossEnd, rect.c2)
  }
  for (const [id, box] of boxes) enter(id, toFlow(box.x, box.y, box.width, box.height))
  const existing = new Set(boxes.keys())
  const origins = new Map([...flow].map(([id, rect]) => [id, rect.c1]))

  // Blocking boxes of a candidate: boxes closer than the gaps (touching at exactly the gap is free).
  const blockers = (rect: FlowRect, skip?: ReadonlySet<string>) => {
    const found: string[] = []
    grid.visit({ x1: rect.a1 - columnGap, y1: rect.c1 - rowGap, x2: rect.a2 + columnGap, y2: rect.c2 + rowGap }, (i, other) => {
      if (other.x1 < rect.a2 + columnGap - eps && rect.a1 - columnGap + eps < other.x2
        && other.y1 < rect.c2 + rowGap - eps && rect.c1 - rowGap + eps < other.y2) {
        const id = ids[i]!
        if (!skip?.has(id)) found.push(id)
      }
    })
    return found
  }
  const crossOk = (c: number) => allowNegative || c >= -eps
  const alongOk = (a1: number, a2: number) => {
    if (allowNegative) return true
    return reversed ? -a2 >= -eps : a1 >= -eps
  }
  const free = (a1: number, a2: number, c: number, length: number, sign: 1 | -1): number | undefined => {
    for (let jump = 0; jump < maxJumps; jump++) {
      if (!crossOk(c)) return undefined
      const found = blockers({ a1, a2, c1: c, c2: c + length })
      if (!found.length) return c
      let next = sign > 0 ? -Infinity : Infinity
      for (const id of found) {
        const other = flow.get(id)!
        next = sign > 0 ? Math.max(next, other.c2 + rowGap) : Math.min(next, other.c1 - rowGap - length)
      }
      c = next
    }
    return undefined
  }

  const movedIds = new Set<string>()
  // Relaxed mode: push the positioned, unfixed boxes that block a candidate away from it across the flow, each by at
  // most `maxDisplacement` from where it started, when that leaves them clear of every other box.
  const push = (rect: FlowRect): boolean => {
    const found = blockers(rect)
    if (!found.length) return true
    const middle = (rect.c1 + rect.c2) / 2
    const next = new Map<string, FlowRect>()
    for (const id of found) {
      if (!existing.has(id) || fixed.has(id)) return false
      const other = flow.get(id)!
      const shift = (other.c1 + other.c2) / 2 >= middle ? rect.c2 + rowGap - other.c1 : rect.c1 - rowGap - other.c2
      const c1 = other.c1 + shift
      if (Math.abs(c1 - origins.get(id)!) > maxDisplacement + eps) return false
      if (!crossOk(c1) && c1 < other.c1) return false
      next.set(id, { ...other, c1, c2: other.c2 + shift })
    }
    const separated = (a: FlowRect, b: FlowRect) => !(b.a1 < a.a2 + columnGap - eps && a.a1 - columnGap + eps < b.a2
      && b.c1 < a.c2 + rowGap - eps && a.c1 - rowGap + eps < b.c2)
    for (const [id, moved] of next) {
      if (!separated(moved, rect)) return false
      for (const other of blockers(moved, new Set([id]))) {
        const target = next.get(other)
        if (!target || !separated(moved, target)) return false
      }
    }
    for (const [id, moved] of next) {
      flow.set(id, moved)
      grid.move(gridIndex.get(id)!, { x1: moved.a1, y1: moved.c1, x2: moved.a2, y2: moved.c2 })
      crossEnd = Math.max(crossEnd, moved.c2)
      movedIds.add(id)
    }
    return !blockers(rect).length
  }

  // Breadth-first order from the positioned nodes, over both edge directions.
  const ranks = new Map<string, number>([...boxes].map(([id, box]) => [id, box.rank]))
  const queue: string[] = []
  const queued = new Set<string>(existing)
  for (const { id } of nodes) {
    if (queued.has(id)) continue
    const near = [...index.incoming.get(id)!, ...index.outgoing.get(id)!].some(other => existing.has(other))
    if (near) {
      queue.push(id)
      queued.add(id)
    }
  }
  const placedIds: string[] = [], fallbackIds: string[] = []
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!
    const { width, height } = sizeOf(id)
    const length = horizontal ? width : height, across = horizontal ? height : width
    const predecessors = index.incoming.get(id)!.filter(other => other !== id && flow.has(other))
    const successors = index.outgoing.get(id)!.filter(other => other !== id && flow.has(other))
    const after = predecessors.length > 0
    const anchors = [...new Set(after ? predecessors : successors)]
    let a1: number
    if (after) a1 = Math.max(...anchors.map(other => flow.get(other)!.a2)) + columnGap
    else a1 = Math.min(...anchors.map(other => flow.get(other)!.a1)) - columnGap - length
    let middle = 0
    for (const other of anchors) middle += (flow.get(other)!.c1 + flow.get(other)!.c2) / 2
    let c0 = middle / anchors.length - across / 2
    let rank = after ? Math.max(...anchors.map(other => ranks.get(other)!)) + 1 : Math.min(...anchors.map(other => ranks.get(other)!)) - 1
    if (!alongOk(a1, a1 + length)) {
      // Beside the nearest anchor along the flow, in its rank.
      const anchor = anchors.reduce((best, other) => (after ? flow.get(other)!.a2 > flow.get(best)!.a2 : flow.get(other)!.a1 < flow.get(best)!.a1) ? other : best)
      const rect = flow.get(anchor)!
      a1 = reversed ? Math.min(rect.a1, -length) : Math.max(rect.a1, 0)
      c0 = rect.c1
      rank = ranks.get(anchor)!
      fallbackIds.push(id)
    }
    if (!allowNegative) c0 = Math.max(0, c0)
    const a2 = a1 + length
    if (maxDisplacement > 0) push({ a1, a2, c1: c0, c2: c0 + across })
    const down = free(a1, a2, c0, across, 1), up = free(a1, a2, c0, across, -1)
    let c: number
    if (down !== undefined && (up === undefined || down - c0 <= c0 - up)) c = down
    else if (up !== undefined) c = up
    else c = crossEnd + rowGap
    enter(id, { a1, a2, c1: c, c2: c + across })
    ranks.set(id, rank)
    placedIds.push(id)
    for (const other of [...index.outgoing.get(id)!, ...index.incoming.get(id)!]) {
      if (queued.has(other)) continue
      queued.add(other)
      queue.push(other)
    }
  }

  // Components without a positioned node: one layered block after every other box across the flow.
  const loose = nodes.filter(node => !queued.has(node.id))
  const blockBoxes = new Map<string, GraphBox>()
  if (loose.length) {
    const looseIds = new Set(loose.map(node => node.id))
    let maxWidth = 0, maxHeight = 0
    for (const { id } of loose) {
      const size = sizeOf(id)
      maxWidth = Math.max(maxWidth, size.width)
      maxHeight = Math.max(maxHeight, size.height)
    }
    const block = layoutLayeredGraph(loose, edges.filter(edge => looseIds.has(edge.from)), {
      direction, nodeWidth: maxWidth, nodeHeight: maxHeight, columnGap, rowGap, padding: 0,
    })
    let offsetX = padding, offsetY = padding
    if (ids.length) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
      for (const id of ids) {
        const rect = flow.get(id)!, { x, y } = fromFlow(rect), size = boxes.get(id) ?? sizeOf(id)
        minX = Math.min(minX, x)
        minY = Math.min(minY, y)
        maxX = Math.max(maxX, x + size.width)
        maxY = Math.max(maxY, y + size.height)
      }
      if (horizontal) {
        offsetX = minX
        offsetY = maxY + rowGap
      } else {
        offsetX = maxX + rowGap
        offsetY = minY
      }
    }
    for (const { id } of loose) {
      const box = block.boxes.get(id)!, size = sizeOf(id)
      blockBoxes.set(id, { x: box.x + offsetX, y: box.y + offsetY, width: size.width, height: size.height, rank: box.rank })
    }
  }

  const resultBoxes = new Map<string, GraphBox>()
  let right = 0, bottom = 0
  for (const { id } of nodes) {
    let box = blockBoxes.get(id)
    if (!box) {
      const point = fromFlow(flow.get(id)!), size = boxes.get(id) ?? sizeOf(id)
      box = { x: point.x, y: point.y, width: size.width, height: size.height, rank: ranks.get(id)! }
      // A positioned node that did not move keeps its exact coordinates, free of rounding in the flow transform.
      const original = boxes.get(id)
      if (original && !movedIds.has(id)) box = original
    }
    resultBoxes.set(id, box)
    right = Math.max(right, box.x + box.width)
    bottom = Math.max(bottom, box.y + box.height)
  }

  const paths = new Map<string, string>()
  const edgeLabels = new Map<string, { x: number; y: number }>()
  const routes = previousLayout?.routes && new Map<string, GraphLayoutRoute>()
  const same = (a: GraphBox | undefined, b: GraphBox | undefined) => !!a && !!b
    && a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
  for (const edge of edges) {
    const source = resultBoxes.get(edge.from)!, target = resultBoxes.get(edge.to)!
    const kept = previousLayout?.paths.get(edge.id)
    if (kept !== undefined && same(previousLayout!.boxes.get(edge.from), source) && same(previousLayout!.boxes.get(edge.to), target)) {
      paths.set(edge.id, kept)
      const label = previousLayout!.edgeLabels.get(edge.id)
      if (label) edgeLabels.set(edge.id, label)
      const route = previousLayout!.routes?.get(edge.id)
      if (route) routes!.set(edge.id, route)
      continue
    }
    const curve = graphIncidentCurve(source, target, edge.from === edge.to, direction)
    paths.set(edge.id, curve.path)
    edgeLabels.set(edge.id, curve.label)
  }
  return {
    boxes: resultBoxes, paths, edgeLabels, width: Math.max(1, right + padding), height: Math.max(1, bottom + padding),
    ...routes && { routes },
    placedIds: [...placedIds, ...loose.map(node => node.id)],
    movedIds: nodes.filter(node => movedIds.has(node.id)).map(node => node.id),
    fallbackIds,
  }
}

/** Options of `graphLayoutChangeMetrics`. */
export interface GraphLayoutChangeOptions {
  /** Edges to test against unrelated boxes, with their paths from `after.paths`. Without them nothing is tested. */
  edges?: readonly GraphEdge[]
}

/** What `graphLayoutChangeMetrics` measured. A diagnostic of one layout change, not a benchmark. */
export interface GraphLayoutChangeMetrics {
  /** Nodes with a position before and a box after. */
  compared: number
  /** Largest distance a compared node moved (between top-left corners). */
  maxDisplacement: number
  /** Sum of the distances the compared nodes moved. */
  totalDisplacement: number
  /** Compared nodes that moved, in the order of `before`. */
  movedIds: string[]
  /** Pairs of boxes of `after` whose interiors overlap. */
  overlaps: number
  /** Pairs of an edge and a box other than its end boxes where the edge's path passes through the box's interior. */
  edgeBoxIntersections: number
}

/**
 * Measures a layout change for tests and evaluation: how far the nodes that had a position moved, how many box pairs
 * of the new layout overlap, and how many edge paths pass through boxes they do not connect (curves are sampled, so
 * that count is approximate for curves). Boxes go into a bucket grid, so the cost grows with the number of boxes and
 * path segments. It is a diagnostic of one change, not a quality score or benchmark. IDs of `before` without a box
 * after are ignored, and edges without a path or end box are skipped. Throws RangeError for non-finite coordinates.
 */
export function graphLayoutChangeMetrics(
  before: ReadonlyMap<string, GraphPoint>, after: Pick<GraphLayout, 'boxes'> & Partial<Pick<GraphLayout, 'paths'>>,
  options: GraphLayoutChangeOptions = {},
): GraphLayoutChangeMetrics {
  let compared = 0, maxDisplacement = 0, totalDisplacement = 0
  const movedIds: string[] = []
  for (const [id, point] of before) {
    const box = after.boxes.get(id)
    if (!box) continue
    if (![point?.x, point?.y, box.x, box.y].every(Number.isFinite)) throw new RangeError('Graph positions must be finite: ' + id)
    const distance = Math.hypot(box.x - point.x, box.y - point.y)
    compared++
    totalDisplacement += distance
    maxDisplacement = Math.max(maxDisplacement, distance)
    if (distance > 0) movedIds.push(id)
  }
  const ids: string[] = [], rects: SpatialRect[] = []
  let size = 0
  for (const [id, box] of after.boxes) {
    if (![box.x, box.y, box.width, box.height].every(Number.isFinite)) throw new RangeError('Graph boxes must be finite: ' + id)
    ids.push(id)
    rects.push({ x1: box.x, y1: box.y, x2: box.x + box.width, y2: box.y + box.height })
    size += (Math.abs(box.width) + Math.abs(box.height)) / 2
  }
  const grid = new SpatialGrid(ids.length ? size / ids.length : 1)
  for (const rect of rects) grid.insert(rect)
  let overlaps = 0
  rects.forEach((rect, i) => {
    grid.visit(rect, (j, other) => {
      if (j > i && other.x1 < rect.x2 - eps && rect.x1 < other.x2 - eps && other.y1 < rect.y2 - eps && rect.y1 < other.y2 - eps) overlaps++
    })
  })
  let edgeBoxIntersections = 0
  const indexOf = new Map(ids.map((id, i) => [id, i]))
  for (const edge of options.edges ?? []) {
    const path = after.paths?.get(edge.id)
    if (path === undefined || !indexOf.has(edge.from) || !indexOf.has(edge.to)) continue
    const ends = new Set([indexOf.get(edge.from)!, indexOf.get(edge.to)!])
    const hit = new Set<number>()
    for (const line of graphPathPolylines(path)) {
      for (let k = 1; k < line.length; k++) {
        const a = line[k - 1]!, b = line[k]!
        const area = { x1: Math.min(a.x, b.x), y1: Math.min(a.y, b.y), x2: Math.max(a.x, b.x), y2: Math.max(a.y, b.y) }
        grid.visit(area, (j, rect) => {
          if (!ends.has(j) && !hit.has(j) && segmentMeetsRect(a, b, rect, true)) hit.add(j)
        })
      }
    }
    edgeBoxIntersections += hit.size
  }
  return { compared, maxDisplacement, totalDisplacement, movedIds, overlaps, edgeBoxIntersections }
}
