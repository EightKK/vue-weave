import { assertGraphLayoutDirection, graphDirectionOrientation, graphFlowSides, isVerticalDirection, orientGraphLayout } from './graphOrient.js'
import { reduceCrossings } from './graphCrossings.js'
import { graphPathEndpoints } from './graphView.js'
import { assertGraphPortSide, graphSideAnchor, isGraphPortSide } from './graphPortSide.js'
import { heapPop, heapPush } from './graphHeap.js'
import {
  checkLayoutNumber, checkLayoutSizes, defaultColumnGap, defaultNodeHeight, defaultNodeWidth, defaultPadding, defaultRowGap,
  sameRankTurnDistance,
} from './graphOptions.js'
import { graphIncidentCurve, graphPortControls } from './graphCurve.js'
import { isGraphRouteValid, markBuiltinRoutes, type GraphRoutingPolicy } from './graphGeometry.js'
import { duplicateIdError, inContext, invalidIdError, isId, unknownReferenceError } from './ids.js'
import type { GraphEdgeStyle } from './graphRouting.js'
import { walkWithinHops } from './graphWalk.js'

export interface GraphPort {
  id: string
  side: 'left' | 'right' | 'top' | 'bottom'
  direction?: 'source' | 'target' | 'both'
  offset?: number
  label?: string
}

export interface IdentifiedNode {
  id: string
  ports?: readonly GraphPort[]
}

/** An edge between two nodes. `D` types the optional `data` payload; it defaults to `unknown`. */
export interface GraphEdge<D = unknown> extends GraphConnection {
  id: string
  label?: string
  /** Application data. The components pass it through untouched. */
  data?: D
  /**
   * Optional waypoints in chart coordinates. `routeGraphEdges` (and NetworkGraph) draws the edge through them: a
   * polyline in the straight and orthogonal styles and a smooth curve through the points in the curve style.
   */
  points?: readonly GraphPoint[]
  /** Routing style of this edge. Overrides the NetworkGraph `edgeStyle` prop and the `style` option of `routeGraphEdges`. */
  edgeStyle?: GraphEdgeStyle
  /** Decoration at the target end, drawn by NetworkGraph and `renderGraphSvg`. Default `'arrow'`. */
  markerEnd?: GraphEdgeMarker
  /** Decoration at the source end, drawn by NetworkGraph and `renderGraphSvg`. Default `'none'`. */
  markerStart?: GraphEdgeMarker
  /**
   * Draws the default NetworkGraph edge with a dash pattern that flows from source to target (class `vw-is-animated`),
   * still under `prefers-reduced-motion: reduce` and in print. `renderGraphSvg` draws it dashed without motion.
   */
  animated?: boolean
  /**
   * Draws the edge with a static dash pattern (class `vw-is-dashed`, `stroke-dasharray="5 4"` in `renderGraphSvg`), for
   * example a BPMN message flow. `animated` wins when both are set.
   */
  dashed?: boolean
}

/**
 * A decoration at one end of an edge. `arrow` is the filled arrowhead NetworkGraph has always drawn, `open-arrow` a
 * line arrowhead, `circle` and `diamond` hollow shapes filled with the graph background, `bar` a line across the edge
 * and `none` no decoration. `hollow-arrow` is a triangle filled with the graph background, the end of a BPMN message flow.
 */
export type GraphEdgeMarker = 'arrow' | 'open-arrow' | 'hollow-arrow' | 'circle' | 'diamond' | 'bar' | 'none'

export interface GraphIndex {
  incoming: Map<string, string[]>
  outgoing: Map<string, string[]>
}

export function indexGraph(nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[]): GraphIndex {
  const incoming = new Map<string, string[]>()
  const outgoing = new Map<string, string[]>()
  const edgeIds = new Set<string>()
  const portsByNode = new Map<string, Map<string, GraphPort>>()

  for (const { id, ports } of nodes) {
    if (!isId(id)) throw invalidIdError('graph node', id)
    if (outgoing.has(id)) throw duplicateIdError('graph node', id)
    if (ports) {
      const indexed = new Map<string, GraphPort>()
      for (const port of ports) {
        if (!isId(port.id)) throw inContext(invalidIdError('port', port.id), 'graph node ' + id)
        if (indexed.has(port.id)) throw inContext(duplicateIdError('port', port.id), 'graph node ' + id)
        const offset = port.offset ?? 0.5
        if (!['source', 'target', 'both'].includes(port.direction ?? 'both') || !Number.isFinite(offset) || offset < 0 || offset > 1) {
          throw new Error('Invalid graph port on node: ' + id)
        }
        assertGraphPortSide(id, port)
        indexed.set(port.id, port)
      }
      portsByNode.set(id, indexed)
    }
    incoming.set(id, [])
    outgoing.set(id, [])
  }

  for (const { id, from, to, fromPort, toPort } of edges) {
    if (!isId(id)) throw invalidIdError('graph edge', id)
    const children = outgoing.get(from)
    const parents = incoming.get(to)
    if (!children) throw unknownReferenceError('node', 'graph edge ' + id, from)
    if (!parents) throw unknownReferenceError('node', 'graph edge ' + id, to)
    for (const [node, portId, forbidden] of [[from, fromPort, 'target'], [to, toPort, 'source']] as const) {
      if (portId === undefined) continue
      const port = portsByNode.get(node)?.get(portId)
      if (!port) throw unknownReferenceError('port', 'graph edge ' + id, portId)
      if (port.direction === forbidden) throw new Error('Invalid port on graph edge: ' + id)
    }
    if (edgeIds.has(id)) throw duplicateIdError('graph edge', id)
    edgeIds.add(id)
    children.push(to)
    parents.push(from)
  }

  return { incoming, outgoing }
}

export function graphNeighborhood(index: GraphIndex, id: string, maxHops = Infinity): Set<string> {
  if (maxHops < 0 || (maxHops !== Infinity && !Number.isInteger(maxHops))) throw new RangeError('maxHops must be a nonnegative integer or Infinity')
  if (!index.outgoing.has(id)) return new Set()
  const result = new Set([id])

  // Traverse each direction independently so a shared parent does not pull in siblings.
  for (const adjacency of [index.incoming, index.outgoing]) {
    walkWithinHops([id], node => adjacency.get(node), node => node, maxHops, (neighbor, reached) => {
      if (reached) result.add(neighbor)
    })
  }

  return result
}

function componentIds(index: GraphIndex): Map<string, number> {
  const visited = new Set<string>()
  const finishOrder: string[] = []

  // Iterative Kosaraju traversal also works for deep chains.
  for (const id of index.outgoing.keys()) {
    if (visited.has(id)) continue
    const stack = [{ id, cursor: 0 }]
    visited.add(id)

    while (stack.length) {
      const frame = stack[stack.length - 1]!
      const children = index.outgoing.get(frame.id)!
      if (frame.cursor === children.length) {
        finishOrder.push(frame.id)
        stack.pop()
        continue
      }

      const next = children[frame.cursor++]!
      if (visited.has(next)) continue
      visited.add(next)
      stack.push({ id: next, cursor: 0 })
    }
  }

  const components = new Map<string, number>()
  let component = 0

  for (const id of finishOrder.reverse()) {
    if (components.has(id)) continue
    const stack = [id]
    components.set(id, component)

    while (stack.length) {
      for (const parent of index.incoming.get(stack.pop()!)!) {
        if (components.has(parent)) continue
        components.set(parent, component)
        stack.push(parent)
      }
    }

    component++
  }

  return components
}

function computeRanks(index: GraphIndex): Map<string, number> {
  const components = componentIds(index)
  const children = new Map<number, Set<number>>()
  const ranks = new Map<number, number>()

  for (const component of components.values()) {
    children.set(component, new Set())
    ranks.set(component, 0)
  }

  for (const [from, destinations] of index.outgoing) {
    const source = components.get(from)!
    for (const to of destinations) {
      const target = components.get(to)!
      if (source !== target) children.get(source)!.add(target)
    }
  }

  // The second DFS pass assigns component IDs in topological order.
  for (const [source, destinations] of children) {
    for (const target of destinations) {
      ranks.set(target, Math.max(ranks.get(target)!, ranks.get(source)! + 1))
    }
  }

  return new Map(Array.from(components, ([id, component]) => [id, ranks.get(component)!]))
}

export interface GraphBox {
  x: number
  y: number
  width: number
  height: number
  rank: number
}

/**
 * Optional metadata of one routed edge, which an external layout or router can return next to its SVG path. The
 * `preserve` routing policy uses it to check that a kept route still starts and ends where the edge does: at the named
 * port when the edge has one, on the given box side, and at the same points as the path.
 */
export interface GraphLayoutRoute {
  /** First point of the route, on the source box border (at the source port when the edge has one). */
  start: GraphPoint
  /** Last point of the route, on the target box border (at the target port when the edge has one). */
  end: GraphPoint
  /** The source port the route leaves from; it must equal the edge's `fromPort`. */
  fromPort?: string
  /** The target port the route enters; it must equal the edge's `toPort`. */
  toPort?: string
  /** The side of the source box the route leaves through (its first direction of travel is away from it). */
  fromSide?: GraphPort['side']
  /** The side of the target box the route enters through (its last direction of travel is into it). */
  toSide?: GraphPort['side']
  /** Bend points between `start` and `end`, in order. */
  points?: readonly GraphPoint[]
}

export interface GraphLayout {
  boxes: Map<string, GraphBox>
  paths: Map<string, string>
  edgeLabels: Map<string, { x: number; y: number }>
  width: number
  height: number
  /**
   * Optional route metadata by edge ID. The built-in layouts do not set it. When a layout has it, `applyGraphPositions`,
   * `applyGraphSizes`, `routeGraphPorts` and `routeGraphEdges` carry it into their results: entries of edges that a
   * moved or resized node rerouted are removed, and entries of edges that the port or style routing redrew are replaced.
   */
  routes?: Map<string, GraphLayoutRoute>
}

/** LR and TB are the defaults; RL and BT mirror them so ranks grow right-to-left or bottom-to-top. */
export type GraphLayoutDirection = 'LR' | 'TB' | 'RL' | 'BT'

/** Ordering heuristic that reduces edge crossings between adjacent ranks. */
export type GraphCrossingReduction = 'none' | 'barycenter' | 'median'

/**
 * Options shared by the rank-based layouts (layered, tree, swimlane and incremental). Defaults: direction LR, nodes
 * 144 by 58, columnGap 50, rowGap 24, padding 20. Sizes must be finite numbers > 0 and gaps and padding finite
 * numbers ≥ 0, otherwise the layout throws a RangeError that names the option.
 */
export interface GraphLayoutOptions {
  /** Flow direction: ranks grow along it. Default 'LR'. */
  direction?: GraphLayoutDirection
  /** Width of a node box. Default 144. */
  nodeWidth?: number
  /** Height of a node box. Default 58. */
  nodeHeight?: number
  /** Free space between ranks along the flow (between depth levels in the tree layout). Default 50. */
  columnGap?: number
  /** Free space between neighbouring boxes of one rank across the flow (between adjacent leaves in the tree layout, between nodes of one lane in one rank in the swimlane layout). Default 24. */
  rowGap?: number
  /** Margin around the layout. Default 20. */
  padding?: number
}

/** Options accepted by layoutLayeredGraph: the shared layout options plus opt-in crossing reduction. */
export interface GraphLayeredLayoutOptions extends GraphLayoutOptions {
  /** Opt-in reordering of nodes within each rank. Default 'none' keeps input order. */
  crossingReduction?: GraphCrossingReduction
  /** Maximum number of alternating down/up sweeps when crossingReduction is enabled. Default 8. */
  crossingSweeps?: number
}

type LaneEntry = [end: number, lane: number]

const laneBefore = (a: LaneEntry, b: LaneEntry) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])
const numberBefore = (a: number, b: number) => a < b

/**
 * Interval-graph colouring of the horizontal spans of long edges (rank jump above one).
 * Edges whose spans do not overlap share a lane, so headroom grows with the number of
 * simultaneously overlapping edges rather than with the total number of long edges.
 */
function assignLongEdgeLanes(edges: readonly GraphEdge[], ranks: ReadonlyMap<string, number>) {
  const spans: { id: string; start: number; end: number; order: number }[] = []
  edges.forEach(({ id, from, to }, order) => {
    const source = ranks.get(from)!, target = ranks.get(to)!
    if (target - source > 1) spans.push({ id, start: source, end: target, order })
  })
  spans.sort((a, b) => a.start - b.start || a.order - b.order)
  const lanes = new Map<string, number>()
  const active: LaneEntry[] = []
  const free: number[] = []
  let count = 0
  for (const span of spans) {
    while (active.length && active[0]![0] <= span.start) heapPush(free, heapPop(active, laneBefore)![1], numberBefore)
    const lane = free.length ? heapPop(free, numberBefore)! : count++
    lanes.set(span.id, lane)
    heapPush(active, [span.end, lane], laneBefore)
  }
  return { lanes, count }
}

/**
 * Deterministic layered layout. Ranks come from the condensation of the strongly connected components, so every node of
 * a cycle shares one rank: a large cycle becomes a single column (or row for TB and BT) whose length grows with the
 * number of nodes, and the edges inside it use same-rank side routes. A 5,000-node cycle with the default sizes is
 * about 214 by 410,000 units. Break or filter large cycles before layout (findGraphCycles finds them), or use
 * layoutForceGraph, when that shape is not wanted.
 */
export function layoutLayeredGraph(
  nodes: readonly IdentifiedNode[],
  edges: readonly GraphEdge[],
  options: GraphLayeredLayoutOptions = {},
): GraphLayout {
  const {
    direction = 'LR', nodeWidth = defaultNodeWidth, nodeHeight = defaultNodeHeight, columnGap = defaultColumnGap, rowGap = defaultRowGap,
    padding = defaultPadding, crossingReduction = 'none', crossingSweeps = 8,
  } = options
  assertGraphLayoutDirection(direction)
  if (!['none', 'barycenter', 'median'].includes(crossingReduction)) throw new RangeError('Unknown crossingReduction method')
  checkLayoutNumber('crossingSweeps', crossingSweeps, 'positiveInteger')
  checkLayoutSizes(nodeWidth, nodeHeight, { columnGap, rowGap, padding })
  if (direction === 'LR') return leftToRightLayered(nodes, edges, nodeWidth, nodeHeight, columnGap, rowGap, padding, crossingReduction, crossingSweeps)
  // Other directions lay out the left-to-right drawing (with swapped node sizes for TB and BT) and turn it.
  const vertical = isVerticalDirection(direction)
  const base = leftToRightLayered(
    nodes, edges, vertical ? nodeHeight : nodeWidth, vertical ? nodeWidth : nodeHeight, columnGap, rowGap, padding, crossingReduction, crossingSweeps,
  )
  return orientGraphLayout(base, graphDirectionOrientation(direction))
}

function leftToRightLayered(
  nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[], nodeWidth: number, nodeHeight: number, columnGap: number, rowGap: number,
  padding: number, crossingReduction: GraphCrossingReduction, crossingSweeps: number,
): GraphLayout {
  const ranks = computeRanks(indexGraph(nodes, edges))
  const columns: string[][] = []

  for (const { id } of nodes) {
    const rank = ranks.get(id)!
    const column = columns[rank] ??= []
    column.push(id)
  }

  if (crossingReduction !== 'none') reduceCrossings(columns, edges, ranks, crossingReduction, crossingSweeps)

  const largestColumn = columns.reduce((max, column) => Math.max(max, column?.length ?? 0), 0)
  const longLanes = assignLongEdgeLanes(edges, ranks)
  const top = padding + longLanes.count * 9
  const boxes = new Map<string, GraphBox>()

  columns.forEach((column, rank) => {
    const offset = (largestColumn - column.length) * (nodeHeight + rowGap) / 2
    column.forEach((id, row) => {
      boxes.set(id, {
        x: padding + rank * (nodeWidth + columnGap),
        y: top + offset + row * (nodeHeight + rowGap),
        width: nodeWidth,
        height: nodeHeight,
        rank,
      })
    })
  })

  let routeRight = 0
  const paths = new Map<string, string>()
  const edgeLabels = new Map<string, { x: number; y: number }>()

  for (const edge of edges) {
    const source = boxes.get(edge.from)!
    const target = boxes.get(edge.to)!
    const x1 = source.x + source.width
    const y1 = source.y + source.height / 2
    const y2 = target.y + target.height / 2
    const jump = target.rank - source.rank
    edgeLabels.set(edge.id, { x: (x1 + target.x) / 2, y: (y1 + y2) / 2 - 7 })

    if (jump === 0) {
      const turn = x1 + sameRankTurnDistance(columnGap)
      const endY = edge.from === edge.to ? y2 - target.height / 3 : y2
      routeRight = Math.max(routeRight, turn)
      edgeLabels.set(edge.id, { x: turn + 9, y: (y1 + endY) / 2 })
      paths.set(edge.id, `M ${x1} ${y1} C ${turn + 6} ${y1}, ${turn + 6} ${endY}, ${x1} ${endY}`)
    } else if (jump > 1) {
      const lane = top - 9 * (longLanes.lanes.get(edge.id)! + 1)
      const inset = columnGap / 3
      edgeLabels.set(edge.id, { x: (x1 + target.x) / 2, y: lane - 3 })
      paths.set(edge.id, `M ${x1} ${y1} H ${x1 + inset} V ${lane} H ${target.x - inset} V ${y2} H ${target.x}`)
    } else {
      const middle = (x1 + target.x) / 2
      paths.set(edge.id, `M ${x1} ${y1} C ${middle} ${y1}, ${middle} ${y2}, ${target.x} ${y2}`)
    }
  }

  const nodeRight = padding + Math.max(0, columns.length * (nodeWidth + columnGap) - columnGap)
  const layoutHeight = top + Math.max(0, largestColumn * (nodeHeight + rowGap) - rowGap) + padding
  return {
    boxes,
    paths,
    edgeLabels,
    width: Math.max(nodeRight, routeRight + 6) + padding,
    // Empty zero-padding layouts still need a measurable axis, including after TB transposition.
    height: layoutHeight === 0 ? 1 : layoutHeight,
  }
}

export interface GraphPoint {
  x: number
  y: number
}

export interface GraphNodeMove {
  id: string
  before: GraphPoint
  after: GraphPoint
}

export interface GraphConnection {
  from: string
  to: string
  fromPort?: string
  toPort?: string
}

export interface GraphReconnect {
  id: string
  before: GraphConnection
  after: GraphConnection
}

export interface GraphGroup {
  id: string
  label: string
  nodeIds: readonly string[]
}

/** The point of a port on a box side. Throws Error when `port.side` is not left, right, top or bottom. */
export function graphPortAnchor(box: GraphBox, port: GraphPort): GraphPoint {
  if (!isGraphPortSide(port.side)) throw new Error(`Invalid graph port ${port.id}: side ${String(port.side)}, expected left, right, top or bottom`)
  return graphSideAnchor(box, port.side, port.offset ?? 0.5)
}

/**
 * Where an edge meets its node. A named port gives its anchor. Otherwise, when the edge has an `id` and the layout
 * has a path for it, the drawn start or end point of that path is used, with the box side closest to it. Without a
 * path the side follows `direction`. Rendering and editing handles therefore agree after nodes are moved or when a
 * custom layout chooses its own sides. Throws an Error naming the edge and the node when the node has no layout box,
 * and an Error naming the node and the port when the port side is not left, right, top or bottom.
 */
export function graphEdgeEndpoint(layout: GraphLayout, nodes: ReadonlyMap<string, IdentifiedNode>, edge: GraphConnection, end: 'from' | 'to', direction: GraphLayoutDirection) {
  const box = edgeEndBox(layout.boxes, edge, edge[end])
  const port = nodes.get(edge[end])?.ports?.find(port => port.id === (end === 'from' ? edge.fromPort : edge.toPort))
  if (port) {
    assertGraphPortSide(edge[end], port)
    return { ...graphPortAnchor(box, port), side: port.side }
  }
  const sides = graphFlowSides(direction)
  const side = end === 'from' ? sides.exit : sides.entry
  const id = (edge as Partial<GraphEdge>).id
  const path = typeof id === 'string' ? layout.paths.get(id) : undefined
  const drawn = path === undefined ? undefined : graphPathEndpoints(path)
  if (!drawn) return { ...graphPortAnchor(box, { id: '', side }), side }
  const point = end === 'from' ? drawn.start : drawn.end
  // The closest side wins; the direction's default side wins ties, such as at a corner.
  const distances: Record<GraphPort['side'], number> = {
    left: Math.abs(point.x - box.x), right: Math.abs(point.x - box.x - box.width),
    top: Math.abs(point.y - box.y), bottom: Math.abs(point.y - box.y - box.height),
  }
  let nearest = side
  for (const candidate of ['left', 'right', 'top', 'bottom'] as const) {
    if (distances[candidate] < distances[nearest]) nearest = candidate
  }
  return { x: point.x, y: point.y, side: nearest }
}

// The layout box of an edge end, with a descriptive error for a node the layout does not contain.
function edgeEndBox(boxes: ReadonlyMap<string, GraphBox>, edge: GraphConnection, nodeId: string) {
  const box = boxes.get(nodeId)
  if (box) return box
  const id = (edge as Partial<GraphEdge>).id
  const name = typeof id === 'string' ? id : `${edge.from} → ${edge.to}`
  throw new Error(`Graph edge ${name} references a node that is not in the layout: ${nodeId}`)
}

/** Options of `routeGraphPorts`. */
export interface GraphPortRouteOptions {
  /**
   * Default 'builtin': every edge with a named port is redrawn as a curve between its port anchors. 'preserve' keeps the
   * route of a port edge that the layout drew itself when it still starts and ends at its ports (see `isGraphRouteValid`),
   * and redraws only the others, such as the edges of a moved or resized node or of a changed port.
   */
  policy?: GraphRoutingPolicy
}

/**
 * Route named endpoints after the node layout and any saved positions are applied. With `policy: 'preserve'`, valid
 * routes from the layout are kept. Throws RangeError for an unknown policy.
 */
export function routeGraphPorts(
  layout: GraphLayout, nodes: ReadonlyMap<string, IdentifiedNode>, edges: readonly GraphEdge[], direction: GraphLayoutDirection,
  options: GraphPortRouteOptions = {},
): GraphLayout {
  const { policy = 'builtin' } = options
  if (policy !== 'builtin' && policy !== 'preserve') throw new RangeError('Unknown routing policy: ' + String(policy))
  if (!edges.some(edge => edge.fromPort !== undefined || edge.toPort !== undefined)) return layout
  const paths = new Map(layout.paths)
  const edgeLabels = new Map(layout.edgeLabels)
  const routes = layout.routes && new Map(layout.routes)
  const redrawn: string[] = []
  // Control points stay inside the layout.
  const clamp = (point: GraphPoint): GraphPoint => ({
    x: Math.min(layout.width, Math.max(0, point.x)),
    y: Math.min(layout.height, Math.max(0, point.y)),
  })
  for (const edge of edges) {
    if (edge.fromPort === undefined && edge.toPort === undefined) continue
    if (policy === 'preserve' && isGraphRouteValid(layout, nodes, edge)) continue
    const from = graphEdgeEndpoint(layout, nodes, edge, 'from', direction)
    const to = graphEdgeEndpoint(layout, nodes, edge, 'to', direction)
    const controls = graphPortControls(from, to)
    const a = clamp(controls.a), b = clamp(controls.b)
    if (edge.from === edge.to && from.x === to.x && from.y === to.y) {
      if (from.side === 'left' || from.side === 'right') {
        a.y = Math.max(0, a.y - 18)
        b.y = Math.min(layout.height, b.y + 18)
      } else {
        a.x = Math.max(0, a.x - 18)
        b.x = Math.min(layout.width, b.x + 18)
      }
    }
    paths.set(edge.id, `M ${from.x} ${from.y} C ${a.x} ${a.y}, ${b.x} ${b.y}, ${to.x} ${to.y}`)
    edgeLabels.set(edge.id, {
      x: (from.x + 3 * a.x + 3 * b.x + to.x) / 8,
      y: (from.y + 3 * a.y + 3 * b.y + to.y) / 8 - 6,
    })
    routes?.set(edge.id, {
      start: { x: from.x, y: from.y }, end: { x: to.x, y: to.y }, fromPort: edge.fromPort, toPort: edge.toPort,
      fromSide: from.side, toSide: to.side, points: [],
    })
    redrawn.push(edge.id)
  }
  return markBuiltinRoutes({ ...layout, paths, edgeLabels, ...routes && { routes } }, layout, redrawn)
}

/** Apply saved positions without changing the original layout or untouched routes. */
export function applyGraphPositions(
  layout: GraphLayout,
  edges: readonly GraphEdge[],
  positions: ReadonlyMap<string, GraphPoint>,
  direction: GraphLayoutDirection = 'LR',
): GraphLayout {
  if (!positions.size) return layout
  const boxes = new Map(layout.boxes)
  const moved = new Set<string>()
  let { width, height } = layout
  for (const [id, point] of positions) {
    if (![point?.x, point?.y].every(value => Number.isFinite(value) && value! >= 0)) {
      throw new RangeError('Graph positions must be finite and nonnegative: ' + id)
    }
    const box = boxes.get(id)
    if (!box) continue
    if (point.x === box.x && point.y === box.y) continue
    boxes.set(id, { ...box, x: point.x, y: point.y })
    moved.add(id)
    width = Math.max(width, point.x + box.width + 32)
    height = Math.max(height, point.y + box.height + 32)
  }
  if (!moved.size) return layout
  return rerouteIncidentEdges(layout, boxes, edges, moved, direction, width, height)
}

/** A node size for the `applyGraphSizes` overlay, in chart units. */
export interface GraphNodeSize {
  width: number
  height: number
}

/**
 * Apply saved node sizes on top of a layout (after any positions), keeping each box's top-left corner. Edges that touch
 * a resized node are rerouted like moved ones; other routes are kept. IDs without a box are ignored. Throws RangeError
 * for a size that is not finite and positive. Returns the same layout when nothing changes.
 */
export function applyGraphSizes(
  layout: GraphLayout,
  edges: readonly GraphEdge[],
  sizes: ReadonlyMap<string, GraphNodeSize>,
  direction: GraphLayoutDirection = 'LR',
): GraphLayout {
  if (!sizes.size) return layout
  const boxes = new Map(layout.boxes)
  const changed = new Set<string>()
  let { width, height } = layout
  for (const [id, size] of sizes) {
    if (![size.width, size.height].every(value => Number.isFinite(value) && value > 0)) {
      throw new RangeError('Graph node sizes must be finite and positive: ' + id)
    }
    const box = boxes.get(id)
    if (!box || (size.width === box.width && size.height === box.height)) continue
    boxes.set(id, { ...box, width: size.width, height: size.height })
    changed.add(id)
    width = Math.max(width, box.x + size.width + 32)
    height = Math.max(height, box.y + size.height + 32)
  }
  if (!changed.size) return layout
  return rerouteIncidentEdges(layout, boxes, edges, changed, direction, width, height)
}

// Curves for the edges that touch a moved or resized node; other routes are kept. Route metadata of a rerouted edge is
// removed, and the rerouted edges are remembered as built-in routes for the `preserve` policy.
function rerouteIncidentEdges(
  layout: GraphLayout, boxes: Map<string, GraphBox>, edges: readonly GraphEdge[], moved: ReadonlySet<string>, direction: GraphLayoutDirection,
  width: number, height: number,
): GraphLayout {
  const paths = new Map(layout.paths)
  const edgeLabels = new Map(layout.edgeLabels)
  const routes = layout.routes && new Map(layout.routes)
  const rerouted: string[] = []
  for (const edge of edges) {
    if (!moved.has(edge.from) && !moved.has(edge.to)) continue
    const source = edgeEndBox(boxes, edge, edge.from)
    const target = edgeEndBox(boxes, edge, edge.to)
    const { path, label } = graphIncidentCurve(source, target, edge.from === edge.to, direction)
    paths.set(edge.id, path)
    edgeLabels.set(edge.id, label)
    routes?.delete(edge.id)
    rerouted.push(edge.id)
  }
  return markBuiltinRoutes({ boxes, paths, edgeLabels, width, height, ...routes && { routes } }, layout, rerouted)
}
