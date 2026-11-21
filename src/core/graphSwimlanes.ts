import { layoutLayeredGraph } from './graph.js'
import type { GraphBox, GraphEdge, GraphLayout, GraphLayoutOptions, GraphPoint, IdentifiedNode } from './graph.js'
import { countAdjacentCrossings, rankNeighbours } from './graphCrossings.js'
import {
  assertGraphLayoutDirection, graphDirectionOrientation, isVerticalDirection, orientGraphLayout, orientGraphRect,
} from './graphOrient.js'
import {
  checkLayoutNumber, checkLayoutSizes, defaultColumnGap, defaultNodeHeight, defaultNodeWidth, defaultPadding, defaultRowGap,
  sameRankTurnDistance,
} from './graphOptions.js'
import type { GraphRect } from './graphView.js'
import { duplicateIdError, invalidIdError, isId, unknownReferenceError } from './ids.js'

/** One lane of a swimlane layout, in the order the caller lists it. `label` defaults to the ID. */
export interface GraphSwimlaneSpec {
  id: string
  label?: string
}

/**
 * The drawn geometry of one lane: the band across the whole flow (header included) and its header (title) area, in
 * layout coordinates. NetworkGraph `lanes` and `renderGraphSvg` `lanes` take this shape.
 */
export interface GraphSwimlaneBand extends GraphRect {
  id: string
  label: string
  /** The title area at the flow start of the band; it lies inside the band. A zero size draws no header. */
  header: GraphRect
}

/** A lane of a `layoutSwimlaneGraph` result: its band plus its position in the lane order and its nodes. */
export interface GraphSwimlane extends GraphSwimlaneBand {
  /** Position in the caller's lane order, from 0. */
  index: number
  /** IDs of the nodes in the lane, by rank and then by their order inside the lane. */
  nodeIds: string[]
}

/** The result of `layoutSwimlaneGraph`: a `GraphLayout` for the NetworkGraph `layout` prop plus the lane geometry. */
export interface GraphSwimlaneLayout extends GraphLayout {
  /** Every lane in the caller's order, empty lanes included. */
  lanes: GraphSwimlane[]
  /** Every pool in display order; only present with the `pools` option. */
  pools?: GraphSwimlanePool[]
}

/**
 * A pool (BPMN participant) of a swimlane layout: a container around consecutive lanes with a title band at the flow
 * start. `label` defaults to the ID.
 */
export interface GraphSwimlanePoolSpec {
  id: string
  label?: string
  /** IDs of the pool's lanes. They must be consecutive in the `lanes` order; their order here does not matter. */
  lanes: readonly string[]
}

/**
 * The drawn geometry of one pool: the rectangle around its lanes (title band included) and the title band, in layout
 * coordinates. NetworkGraph `pools` and `renderGraphSvg` `pools` take this shape. A title band that is taller than it
 * is wide shows its title rotated, reading from bottom to top.
 */
export interface GraphSwimlanePoolBand extends GraphRect {
  id: string
  label: string
  /** The title band at the flow start of the pool; it lies inside the pool. A zero size draws no title band. */
  header: GraphRect
  /** IDs of the pool's lanes in display order. NetworkGraph draws these lanes inside the pool's group. */
  laneIds: readonly string[]
}

/** A pool of a `layoutSwimlaneGraph` result: its band plus its position in display order. */
export interface GraphSwimlanePool extends GraphSwimlanePoolBand {
  /** Position in display order, from 0. */
  index: number
  laneIds: string[]
}

/**
 * Options of `layoutSwimlaneGraph`: the shared layout options plus the lanes. `N` is the node type, so a `laneOf`
 * function receives your own nodes. `direction` LR and RL give horizontal lanes stacked top to bottom; TB and BT give
 * vertical lanes stacked left to right. `rowGap` is the distance between nodes of one lane in one rank, and `padding`
 * the margin around the bands.
 */
export interface GraphSwimlaneLayoutOptions<N extends IdentifiedNode = IdentifiedNode> extends GraphLayoutOptions {
  /** The lanes in display order: IDs or `{ id, label }`. The order is never changed; a lane without nodes still gets a band. */
  lanes: readonly (string | GraphSwimlaneSpec)[]
  /** The lane of each node: a function of the node or a map of node ID to lane ID. Every node needs a known lane. */
  laneOf: ((node: N) => string | undefined) | ReadonlyMap<string, string>
  /** Free space between neighbouring lane bands. Default 0. */
  laneGap?: number
  /** Space between a band's edges (and its header) and the nodes in it. Default 12. */
  lanePadding?: number
  /** Smallest band thickness across the flow. Default 0 (one node plus the padding). */
  minLaneSize?: number
  /** Thickness of the title area along the flow, at the flow start of each band. Default 120 for LR and RL, 32 for TB and BT. */
  headerSize?: number
  /** Ordering of the nodes of one lane in one rank. Lanes never change order. Default `barycenter`. */
  crossingReduction?: 'none' | 'barycenter'
  /** Maximum number of alternating sweeps of the crossing reduction. Default 8. */
  crossingSweeps?: number
  /**
   * Pools (BPMN participants) around the lanes, opt-in. With pools, every lane belongs to exactly one pool, the lanes of
   * a pool are consecutive in `lanes`, each pool gets a title band of `poolHeaderSize` before the lane headers, and
   * pools are `poolGap` apart. The lane of a pool with a single lane gets no header of its own (a zero-size header).
   */
  pools?: readonly GraphSwimlanePoolSpec[]
  /** Thickness of a pool's title band along the flow. Default 32. */
  poolHeaderSize?: number
  /** Free space between neighbouring pools, in place of `laneGap`. Default 24. */
  poolGap?: number
}

/**
 * Throws a descriptive error for a pool list that cannot be drawn: an empty or repeated ID, a label that is not a string
 * or a `laneIds` value that is not an array of IDs (Error), or a pool or title band that is not finite or has a
 * negative size (RangeError). `where` names the caller in the message.
 */
export function assertGraphSwimlanePools(pools: readonly GraphSwimlanePoolBand[], where: string): void {
  if (!Array.isArray(pools)) throw new Error(where + ' pools must be an array')
  const ids = new Set<string>()
  for (const pool of pools) {
    if (!isId(pool?.id)) throw invalidIdError('swimlane pool', pool?.id)
    if (ids.has(pool.id)) throw duplicateIdError('swimlane pool', pool.id)
    ids.add(pool.id)
    if (typeof pool.label !== 'string') throw new Error(where + ' pool ' + pool.id + ' needs a string label')
    if (!Array.isArray(pool.laneIds) || !pool.laneIds.every(isId)) throw new Error(where + ' pool ' + pool.id + ' needs an array of lane IDs')
    for (const rect of [pool, pool.header]) {
      if (!rect || ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.width < 0 || rect.height < 0) {
        throw new RangeError(where + ' pool ' + pool.id + ' needs finite geometry with nonnegative sizes')
      }
    }
  }
}

/**
 * Throws a descriptive error for a lane list that cannot be drawn: an empty or repeated ID (Error) or a band or header
 * that is not finite or has a negative size (RangeError). `where` names the caller in the message.
 */
export function assertGraphSwimlaneBands(lanes: readonly GraphSwimlaneBand[], where: string): void {
  if (!Array.isArray(lanes)) throw new Error(where + ' lanes must be an array')
  const ids = new Set<string>()
  for (const lane of lanes) {
    if (!isId(lane?.id)) throw invalidIdError('swimlane', lane?.id)
    if (ids.has(lane.id)) throw duplicateIdError('swimlane', lane.id)
    ids.add(lane.id)
    if (typeof lane.label !== 'string') throw new Error(where + ' lane ' + lane.id + ' needs a string label')
    for (const rect of [lane, lane.header]) {
      if (!rect || ![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.width < 0 || rect.height < 0) {
        throw new RangeError(where + ' lane ' + lane.id + ' needs finite geometry with nonnegative sizes')
      }
    }
  }
}

/**
 * The lane whose band contains a point, or the centre of a rectangle such as a node box, or undefined when it lies in
 * no band (in a gap between lanes or outside them all). Bands are half-open: a point on the far edge of one band
 * belongs to the next. Use it to turn a `node-move` proposal into a lane change, or to reject a move out of every lane.
 */
export function graphSwimlaneAt<L extends GraphSwimlaneBand>(lanes: readonly L[], target: GraphPoint | GraphRect): L | undefined {
  const rect = target as Partial<GraphRect>
  const x = rect.width === undefined ? target.x : target.x + rect.width / 2
  const y = rect.height === undefined ? target.y : target.y + rect.height / 2
  if (!Number.isFinite(x) || !Number.isFinite(y)) throw new RangeError('graphSwimlaneAt needs a finite point or rectangle')
  for (const lane of lanes) {
    if (x >= lane.x && x < lane.x + lane.width && y >= lane.y && y < lane.y + lane.height) return lane
  }
  return undefined
}

interface Sizes {
  poolHeaderSize: number
  poolGap: number
  along: number
  across: number
  columnGap: number
  rowGap: number
  laneGap: number
  lanePadding: number
  minLaneSize: number
  headerSize: number
  padding: number
}

/**
 * Swimlane layout: one band per lane in the caller's order, with the flow running along the bands. A node's rank
 * (position along the flow) comes from the dependency structure exactly as in `layoutLayeredGraph`, so every node of a
 * cycle shares one rank. Across the flow a node sits in its own lane's band; several nodes of one lane in one rank are
 * stacked inside it and the band grows to fit. With `crossingReduction: 'barycenter'` (the default) the nodes of one
 * lane in one rank are reordered to reduce crossings; the lane order itself never changes, and a lane without nodes
 * still gets a band, so adding a node or an edge keeps every lane in place relative to the others. Deterministic.
 *
 * Throws an Error for a duplicate or empty lane ID, a node without a lane or with an unknown lane, and the graph errors
 * of `indexGraph`; a RangeError for an unknown direction or crossing method and for sizes that are not finite and
 * nonnegative (node sizes positive). Traversals are iterative.
 */
export function layoutSwimlaneGraph<N extends IdentifiedNode>(
  nodes: readonly N[],
  edges: readonly GraphEdge[],
  options: GraphSwimlaneLayoutOptions<N>,
): GraphSwimlaneLayout {
  if (!options || !Array.isArray(options.lanes)) throw new Error('layoutSwimlaneGraph needs a lanes array')
  const {
    direction = 'LR', nodeWidth = defaultNodeWidth, nodeHeight = defaultNodeHeight, columnGap = defaultColumnGap, rowGap = defaultRowGap, laneGap = 0,
    lanePadding = 12, minLaneSize = 0, padding = defaultPadding, crossingReduction = 'barycenter', crossingSweeps = 8, laneOf,
  } = options
  assertGraphLayoutDirection(direction)
  const vertical = isVerticalDirection(direction)
  const headerSize = options.headerSize ?? (vertical ? 32 : 120)
  if (crossingReduction !== 'none' && crossingReduction !== 'barycenter') throw new RangeError('Unknown crossingReduction method')
  checkLayoutNumber('crossingSweeps', crossingSweeps, 'positiveInteger')
  checkLayoutSizes(nodeWidth, nodeHeight, { columnGap, rowGap, laneGap, lanePadding, minLaneSize, headerSize, padding })
  if (typeof laneOf !== 'function' && !(laneOf instanceof Map)) throw new Error('laneOf must be a function or a Map')
  const { poolHeaderSize = 32, poolGap = 24 } = options
  if (options.pools !== undefined) checkLayoutSizes(nodeWidth, nodeHeight, { poolHeaderSize, poolGap })

  const lanes: { id: string; label: string }[] = []
  const laneIndex = new Map<string, number>()
  for (const item of options.lanes) {
    // A lane is its ID or a spec with an ID; a value that is neither is shown as the invalid ID itself.
    const id: unknown = item !== null && typeof item === 'object' ? item.id : item
    if (!isId(id)) throw invalidIdError('swimlane', id)
    if (laneIndex.has(id)) throw duplicateIdError('swimlane', id)
    const label = typeof item === 'string' ? id : item.label ?? id
    if (typeof label !== 'string') throw new Error('Swimlane label must be a string: ' + id)
    laneIndex.set(id, lanes.length)
    lanes.push({ id, label })
  }

  const pools = options.pools === undefined ? undefined : resolvePools(options.pools, laneIndex, lanes)

  // Ranks of the layered layout (strongly connected components share one rank); it also validates the graph.
  const ranks = new Map<string, number>()
  for (const [id, box] of layoutLayeredGraph(nodes, edges).boxes) ranks.set(id, box.rank)

  const laneOfNode = new Map<string, number>()
  for (const node of nodes) {
    const lane = typeof laneOf === 'function' ? laneOf(node) : laneOf.get(node.id)
    if (lane === undefined || lane === null || lane === '') throw new Error('Graph node has no swimlane: ' + node.id)
    const index = laneIndex.get(lane)
    if (index === undefined) throw unknownReferenceError('swimlane', 'graph node ' + node.id, lane)
    laneOfNode.set(node.id, index)
  }

  const sizes: Sizes = {
    along: vertical ? nodeHeight : nodeWidth, across: vertical ? nodeWidth : nodeHeight,
    columnGap, rowGap, laneGap, lanePadding, minLaneSize, headerSize, padding, poolHeaderSize, poolGap,
  }
  const base = leftToRight(nodes, edges, lanes, laneOfNode, ranks, sizes, crossingReduction === 'barycenter' ? crossingSweeps : 0, pools)
  if (direction === 'LR') return base
  const orientation = graphDirectionOrientation(direction)
  const oriented = orientGraphLayout(base, orientation)
  const turn = (rect: GraphRect): GraphRect => orientGraphRect(rect, orientation, oriented.width, oriented.height)
  return {
    ...oriented,
    lanes: base.lanes.map(lane => ({ ...lane, ...turn(lane), header: turn(lane.header), nodeIds: lane.nodeIds })),
    ...base.pools && { pools: base.pools.map(pool => ({ ...pool, ...turn(pool), header: turn(pool.header), laneIds: pool.laneIds })) },
  }
}

// The pool of each lane, by lane position, and the pools in display order. Throws for invalid pools.
function resolvePools(specs: readonly GraphSwimlanePoolSpec[], laneIndex: ReadonlyMap<string, number>, lanes: readonly { id: string }[]) {
  if (!Array.isArray(specs)) throw new Error('layoutSwimlaneGraph pools must be an array')
  const poolOf = new Array<number>(lanes.length).fill(-1)
  const list: { id: string; label: string; first: number; last: number }[] = []
  const ids = new Set<string>()
  for (const spec of specs) {
    const id: unknown = spec?.id
    if (!isId(id)) throw invalidIdError('swimlane pool', id)
    if (ids.has(id)) throw duplicateIdError('swimlane pool', id)
    ids.add(id)
    const label = spec.label ?? id
    if (typeof label !== 'string') throw new Error('Swimlane pool label must be a string: ' + id)
    if (!Array.isArray(spec.lanes) || !spec.lanes.length) throw new Error('Swimlane pool needs at least one lane: ' + id)
    let first = Infinity, last = -1
    for (const lane of spec.lanes) {
      const index = laneIndex.get(lane)
      if (index === undefined) throw unknownReferenceError('swimlane', 'swimlane pool ' + id, lane)
      if (poolOf[index] !== -1) throw new Error('Swimlane ' + lane + ' is in more than one pool')
      poolOf[index] = list.length
      first = Math.min(first, index)
      last = Math.max(last, index)
    }
    if (last - first + 1 !== spec.lanes.length) throw new Error('The lanes of swimlane pool ' + id + ' must be consecutive')
    list.push({ id, label, first, last })
  }
  const missing = poolOf.indexOf(-1)
  if (missing >= 0) throw new Error('Swimlane ' + lanes[missing]!.id + ' is in no pool')
  // Display order follows the lanes; renumber the pools of the lanes accordingly.
  const order = list.map((_, index) => index).sort((a, b) => list[a]!.first - list[b]!.first)
  const position = new Array<number>(list.length)
  order.forEach((pool, index) => { position[pool] = index })
  return { laneToPool: poolOf.map(pool => position[pool]!), pools: order.map(pool => list[pool]!) }
}

// The layout with the flow from left to right and the lanes stacked from top to bottom.
function leftToRight(
  nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[], lanes: readonly { id: string; label: string }[],
  laneOfNode: ReadonlyMap<string, number>, ranks: ReadonlyMap<string, number>, sizes: Sizes, sweeps: number,
  pools?: ReturnType<typeof resolvePools>,
): GraphSwimlaneLayout {
  const { along, across, columnGap, rowGap, laneGap, lanePadding, minLaneSize, headerSize, padding } = sizes
  // Pools add a title band before the lane headers and their own gap between lanes of different pools.
  const poolHeader = pools ? sizes.poolHeaderSize : 0
  const laneCount = lanes.length
  let rankCount = 0
  for (const rank of ranks.values()) rankCount = Math.max(rankCount, rank + 1)
  // One cell per rank and lane, holding the cell's nodes in input order.
  const cells = new Map<number, string[]>()
  const cellOf = (id: string) => ranks.get(id)! * laneCount + laneOfNode.get(id)!
  for (const { id } of nodes) {
    const key = cellOf(id)
    const cell = cells.get(key)
    if (cell) cell.push(id)
    else cells.set(key, [id])
  }
  const slots = new Array<number>(laneCount).fill(1)
  for (const [key, cell] of cells) {
    const lane = key % laneCount
    slots[lane] = Math.max(slots[lane]!, cell.length)
  }
  const thickness = slots.map(count => Math.max(minLaneSize, 2 * lanePadding + count * across + (count - 1) * rowGap))
  const laneTop: number[] = []
  let cursor = padding
  for (let lane = 0; lane < laneCount; lane++) {
    if (pools && lane > 0 && pools.laneToPool[lane] !== pools.laneToPool[lane - 1]) cursor += sizes.poolGap - laneGap
    laneTop.push(cursor)
    cursor += thickness[lane]! + laneGap
  }

  // Centre of each node across the flow: the cell's stack is centred in its band.
  const position = new Map<string, number>()
  const place = (key: number, cell: readonly string[]) => {
    const lane = key % laneCount
    const stack = cell.length * across + (cell.length - 1) * rowGap
    const start = laneTop[lane]! + (thickness[lane]! - stack) / 2
    cell.forEach((id, slot) => position.set(id, start + slot * (across + rowGap) + across / 2))
  }
  for (const [key, cell] of cells) place(key, cell)

  if (sweeps > 0) reduceLaneCrossings(cells, edges, ranks, position, place, rankCount, laneCount, sweeps)

  const flowStart = padding + poolHeader + headerSize + lanePadding
  const boxes = new Map<string, GraphBox>()
  for (const { id } of nodes) {
    const rank = ranks.get(id)!
    boxes.set(id, { x: flowStart + rank * (along + columnGap), y: position.get(id)! - across / 2, width: along, height: across, rank })
  }

  let routeRight = 0
  const paths = new Map<string, string>()
  const edgeLabels = new Map<string, { x: number; y: number }>()
  for (const edge of edges) {
    const source = boxes.get(edge.from)!, target = boxes.get(edge.to)!
    const x1 = source.x + source.width, y1 = source.y + source.height / 2, y2 = target.y + target.height / 2
    if (target.rank === source.rank) {
      // Same-rank edges (inside a cycle) and self-loops turn on the right side, like the layered layout.
      const turn = x1 + sameRankTurnDistance(columnGap)
      const endY = edge.from === edge.to ? y2 - target.height / 3 : y2
      routeRight = Math.max(routeRight, turn + 6)
      paths.set(edge.id, `M ${x1} ${y1} C ${turn + 6} ${y1}, ${turn + 6} ${endY}, ${x1} ${endY}`)
      edgeLabels.set(edge.id, { x: turn + 9, y: (y1 + endY) / 2 })
    } else {
      // Ranks come from the condensation, so every other edge goes forward along the flow.
      const middle = (x1 + target.x) / 2
      paths.set(edge.id, `M ${x1} ${y1} C ${middle} ${y1}, ${middle} ${y2}, ${target.x} ${y2}`)
      edgeLabels.set(edge.id, { x: middle, y: (y1 + y2) / 2 - 7 })
    }
  }

  const nodesRight = flowStart + Math.max(1, rankCount) * (along + columnGap) - columnGap
  const flowEnd = Math.max(nodesRight + lanePadding, routeRight + 6)
  const laneList: GraphSwimlane[] = lanes.map((lane, index) => {
    const nodeIds: string[] = []
    // A loop rather than push(...cell), which overflows the call stack for a cell with very many nodes.
    for (let rank = 0; rank < rankCount; rank++) for (const id of cells.get(rank * laneCount + index) ?? []) nodeIds.push(id)
    const pool = pools?.pools[pools.laneToPool[index]!]
    const start = padding + poolHeader
    return {
      id: lane.id, label: lane.label, index, nodeIds,
      x: start, y: laneTop[index]!, width: flowEnd - start, height: thickness[index]!,
      header: { x: start, y: laneTop[index]!, width: pool && pool.first === pool.last ? 0 : headerSize, height: thickness[index]! },
    }
  })
  const poolList: GraphSwimlanePool[] | undefined = pools?.pools.map((pool, index) => {
    const y = laneTop[pool.first]!, height = laneTop[pool.last]! + thickness[pool.last]! - y
    return {
      id: pool.id, label: pool.label, index, laneIds: lanes.slice(pool.first, pool.last + 1).map(lane => lane.id),
      x: padding, y, width: flowEnd - padding, height, header: { x: padding, y, width: poolHeader, height },
    }
  })
  const bottom = laneCount ? laneTop[laneCount - 1]! + thickness[laneCount - 1]! : padding
  return {
    boxes, paths, edgeLabels, lanes: laneList, ...poolList && { pools: poolList },
    width: Math.max(1, flowEnd + padding),
    height: Math.max(1, bottom + padding),
  }
}

// Alternating barycenter sweeps over the cells of each rank. Nodes only move inside their own cell (one lane in one
// rank), so lanes keep their order; the best order found, by the crossings between adjacent ranks, is kept.
function reduceLaneCrossings(
  cells: Map<number, string[]>, edges: readonly GraphEdge[], ranks: ReadonlyMap<string, number>, position: Map<string, number>,
  place: (key: number, cell: readonly string[]) => void, rankCount: number, laneCount: number, sweeps: number,
) {
  const { above, below, adjacent } = rankNeighbours(edges, ranks)
  // Only cells with two or more nodes can change.
  const movable = [...cells.keys()].filter(key => cells.get(key)!.length > 1).sort((a, b) => a - b)
  if (!movable.length || !adjacent.length) return
  const count = () => countAdjacentCrossings(adjacent.map(([low, high]) => ({ rank: ranks.get(low)!, a: position.get(low)!, b: position.get(high)! })))
  const snapshot = () => new Map(movable.map(key => [key, cells.get(key)!.slice()]))
  let best = snapshot()
  let bestCount = count()
  const byRank = new Map<number, number[]>()
  for (const key of movable) {
    const rank = Math.floor(key / laneCount)
    const list = byRank.get(rank)
    if (list) list.push(key)
    else byRank.set(rank, [key])
  }
  const order = [...byRank.keys()].sort((a, b) => a - b)
  for (let sweep = 0; sweep < sweeps && bestCount > 0; sweep++) {
    const down = sweep % 2 === 0
    const neighbours = down ? above : below
    for (let i = 0; i < order.length; i++) {
      const rank = order[down ? i : order.length - 1 - i]!
      if (rank >= rankCount) continue
      for (const key of byRank.get(rank)!) {
        const cell = cells.get(key)!
        const keys = new Map<string, number>()
        for (const id of cell) {
          const others = neighbours.get(id)
          keys.set(id, others?.length ? others.reduce((sum, other) => sum + position.get(other)!, 0) / others.length : position.get(id)!)
        }
        const current = new Map(cell.map((id, slot) => [id, slot]))
        cell.sort((p, q) => keys.get(p)! - keys.get(q)! || current.get(p)! - current.get(q)!)
        place(key, cell)
      }
    }
    const crossings = count()
    if (crossings < bestCount) {
      bestCount = crossings
      best = snapshot()
    }
  }
  for (const [key, cell] of best) {
    cells.set(key, cell)
    place(key, cell)
  }
}
