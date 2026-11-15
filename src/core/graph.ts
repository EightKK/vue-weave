import { flipGraphLayout } from './graphOrient.js'
import { reduceCrossings } from './graphCrossings.js'
import { graphPathEndpoints } from './graphView.js'
import { assertGraphPortSide, isGraphPortSide } from './graphPortSide.js'
import { graphIncidentCurve, graphPortControls } from './graphCurve.js'

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
}

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
    if (!id) throw new Error('Graph node IDs must not be empty')
    if (outgoing.has(id)) throw new Error(`Duplicate graph node ID: ${id}`)
    if (ports) {
      const indexed = new Map<string, GraphPort>()
      for (const port of ports) {
        const offset = port.offset ?? 0.5
        if (!port.id || indexed.has(port.id)
          || !['source', 'target', 'both'].includes(port.direction ?? 'both') || !Number.isFinite(offset) || offset < 0 || offset > 1) {
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
    if (!id) throw new Error('Graph edge IDs must not be empty')
    const children = outgoing.get(from)
    const parents = incoming.get(to)
    if (!children || !parents) throw new Error(`Unknown endpoint on graph edge: ${id}`)
    for (const [node, portId, forbidden] of [[from, fromPort, 'target'], [to, toPort, 'source']] as const) {
      if (portId === undefined) continue
      const port = portsByNode.get(node)?.get(portId)
      if (!port || port.direction === forbidden) throw new Error('Invalid port on graph edge: ' + id)
    }
    if (edgeIds.has(id)) throw new Error(`Duplicate graph edge ID: ${id}`)
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
    const visited = new Set([id])
    const queue = [{ id, depth: 0 }]

    for (let i = 0; i < queue.length; i++) {
      const current = queue[i]!
      if (current.depth >= maxHops) continue

      for (const neighbor of adjacency.get(current.id)!) {
        if (visited.has(neighbor)) continue
        visited.add(neighbor)
        result.add(neighbor)
        queue.push({ id: neighbor, depth: current.depth + 1 })
      }
    }
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

export interface GraphLayout {
  boxes: Map<string, GraphBox>
  paths: Map<string, string>
  edgeLabels: Map<string, { x: number; y: number }>
  width: number
  height: number
}

/** LR and TB are the defaults; RL and BT mirror them so ranks grow right-to-left or bottom-to-top. */
export type GraphLayoutDirection = 'LR' | 'TB' | 'RL' | 'BT'

/** Ordering heuristic that reduces edge crossings between adjacent ranks. */
export type GraphCrossingReduction = 'none' | 'barycenter' | 'median'

export interface GraphLayoutOptions {
  direction?: GraphLayoutDirection
  nodeWidth?: number
  nodeHeight?: number
  columnGap?: number
  rowGap?: number
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

function heapPush<T>(heap: T[], item: T, before: (a: T, b: T) => boolean) {
  let i = heap.push(item) - 1
  while (i > 0) {
    const parent = (i - 1) >> 1
    if (!before(item, heap[parent]!)) break
    heap[i] = heap[parent]!
    i = parent
  }
  heap[i] = item
}

function heapPop<T>(heap: T[], before: (a: T, b: T) => boolean): T | undefined {
  const top = heap[0]
  const last = heap.pop()
  if (last === undefined || heap.length === 0) return top
  let i = 0
  for (;;) {
    let child = 2 * i + 1
    if (child >= heap.length) break
    if (child + 1 < heap.length && before(heap[child + 1]!, heap[child]!)) child++
    if (!before(heap[child]!, last)) break
    heap[i] = heap[child]!
    i = child
  }
  heap[i] = last
  return top
}

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
    while (active.length && active[0]![0] <= span.start) heapPush(free, heapPop(active, (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]))![1], (a, b) => a < b)
    const lane = free.length ? heapPop(free, (a, b) => a < b)! : count++
    lanes.set(span.id, lane)
    heapPush(active, [span.end, lane], (a, b) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]))
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
  const { direction = 'LR', nodeWidth = 144, nodeHeight = 58, columnGap = 50, rowGap = 24, padding = 20, crossingReduction = 'none', crossingSweeps = 8 } = options
  if (!['LR', 'TB', 'RL', 'BT'].includes(direction)) throw new RangeError('Unknown layout direction')
  if (!['none', 'barycenter', 'median'].includes(crossingReduction)) throw new RangeError('Unknown crossingReduction method')
  if (!Number.isInteger(crossingSweeps) || crossingSweeps < 1) throw new RangeError('crossingSweeps must be a positive integer')
  for (const [name, value] of Object.entries({ nodeWidth, nodeHeight, columnGap, rowGap, padding })) {
    if (!Number.isFinite(value) || value < 0 || ((name === 'nodeWidth' || name === 'nodeHeight') && value === 0)) {
      throw new RangeError(name + ' must be finite and positive (spacing may be zero)')
    }
  }
  if (direction === 'RL' || direction === 'BT') {
    const base = layoutLayeredGraph(nodes, edges, { ...options, direction: direction === 'RL' ? 'LR' : 'TB' })
    return flipGraphLayout(base, direction === 'RL' ? 'x' : 'y')
  }
  if (direction === 'TB') {
    const base = layoutLayeredGraph(nodes, edges, { ...options, direction: 'LR', nodeWidth: nodeHeight, nodeHeight: nodeWidth })
    return {
      boxes: new Map([...base.boxes].map(([id, box]) => [id, {
        x: box.y, y: box.x, width: box.height, height: box.width, rank: box.rank,
      }])),
      paths: new Map([...base.paths].map(([id, path]) => [id, transposePath(path)])),
      edgeLabels: new Map([...base.edgeLabels].map(([id, point]) => [id, { x: point.y, y: point.x }])),
      width: base.height, height: base.width,
    }
  }
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
      const turn = x1 + Math.min(24, columnGap / 2)
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

// Only absolute M, C, H and V commands generated above are transposed.
function transposePath(path: string): string {
  return path.replace(/([MCHV]) ([^MCHV]+)/g, (_match, command: string, values: string) => {
    const numbers = values.replaceAll(',', ' ').trim().split(/\s+/).map(Number)
    if (command === 'H') return 'V ' + numbers.join(' ') + ' '
    if (command === 'V') return 'H ' + numbers.join(' ') + ' '
    const result: number[] = []
    for (let i = 0; i < numbers.length; i += 2) result.push(numbers[i + 1]!, numbers[i]!)
    return command + ' ' + result.join(' ') + ' '
  }).trim()
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
  const offset = port.offset ?? 0.5
  if (port.side === 'left' || port.side === 'right') {
    return { x: box.x + (port.side === 'right' ? box.width : 0), y: box.y + box.height * offset }
  }
  return { x: box.x + box.width * offset, y: box.y + (port.side === 'bottom' ? box.height : 0) }
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
  const side: GraphPort['side'] = direction === 'TB' ? (end === 'from' ? 'bottom' : 'top')
    : direction === 'BT' ? (end === 'from' ? 'top' : 'bottom')
    : direction === 'RL' ? (end === 'from' ? 'left' : 'right') : (end === 'from' ? 'right' : 'left')
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

/** Route named endpoints after the node layout and any saved positions are applied. */
export function routeGraphPorts(layout: GraphLayout, nodes: ReadonlyMap<string, IdentifiedNode>, edges: readonly GraphEdge[], direction: GraphLayoutDirection): GraphLayout {
  if (!edges.some(edge => edge.fromPort !== undefined || edge.toPort !== undefined)) return layout
  const paths = new Map(layout.paths)
  const edgeLabels = new Map(layout.edgeLabels)
  // Control points stay inside the layout.
  const clamp = (point: GraphPoint): GraphPoint => ({
    x: Math.min(layout.width, Math.max(0, point.x)),
    y: Math.min(layout.height, Math.max(0, point.y)),
  })
  for (const edge of edges) {
    if (edge.fromPort === undefined && edge.toPort === undefined) continue
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
  }
  return { ...layout, paths, edgeLabels }
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
  return { ...rerouteIncidentEdges(layout, boxes, edges, moved, direction), width, height }
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
  return { ...rerouteIncidentEdges(layout, boxes, edges, changed, direction), width, height }
}

// Curves for the edges that touch a moved or resized node; other routes are kept.
function rerouteIncidentEdges(
  layout: GraphLayout, boxes: Map<string, GraphBox>, edges: readonly GraphEdge[], moved: ReadonlySet<string>, direction: GraphLayoutDirection,
): GraphLayout {
  const paths = new Map(layout.paths)
  const edgeLabels = new Map(layout.edgeLabels)
  for (const edge of edges) {
    if (!moved.has(edge.from) && !moved.has(edge.to)) continue
    const source = edgeEndBox(boxes, edge, edge.from)
    const target = edgeEndBox(boxes, edge, edge.to)
    const { path, label } = graphIncidentCurve(source, target, edge.from === edge.to, direction)
    paths.set(edge.id, path)
    edgeLabels.set(edge.id, label)
  }
  return { boxes, paths, edgeLabels, width: layout.width, height: layout.height }
}
