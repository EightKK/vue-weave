import { flipGraphLayout } from './graphOrient.js'
import { reduceCrossings } from './graphCrossings.js'
import { graphPathEndpoints } from './graphView.js'

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

export interface GraphEdge extends GraphConnection {
  id: string
  label?: string
  data?: unknown
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
        if (!port.id || indexed.has(port.id) || !['left', 'right', 'top', 'bottom'].includes(port.side)
          || !['source', 'target', 'both'].includes(port.direction ?? 'both') || !Number.isFinite(offset) || offset < 0 || offset > 1) {
          throw new Error('Invalid graph port on node: ' + id)
        }
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

export function graphPortAnchor(box: GraphBox, port: GraphPort): GraphPoint {
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
 * custom layout chooses its own sides.
 */
export function graphEdgeEndpoint(layout: GraphLayout, nodes: ReadonlyMap<string, IdentifiedNode>, edge: GraphConnection, end: 'from' | 'to', direction: GraphLayoutDirection) {
  const box = layout.boxes.get(edge[end])!
  const port = nodes.get(edge[end])?.ports?.find(port => port.id === (end === 'from' ? edge.fromPort : edge.toPort))
  if (port) return { ...graphPortAnchor(box, port), side: port.side }
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

/** Route named endpoints after the node layout and any saved positions are applied. */
export function routeGraphPorts(layout: GraphLayout, nodes: ReadonlyMap<string, IdentifiedNode>, edges: readonly GraphEdge[], direction: GraphLayoutDirection): GraphLayout {
  if (!edges.some(edge => edge.fromPort !== undefined || edge.toPort !== undefined)) return layout
  const paths = new Map(layout.paths)
  const edgeLabels = new Map(layout.edgeLabels)
  const outward = (point: GraphPoint & { side: GraphPort['side'] }, distance: number): GraphPoint => {
    const offsets = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] } as const
    const [dx, dy] = offsets[point.side]
    return {
      x: Math.min(layout.width, Math.max(0, point.x + dx * distance)),
      y: Math.min(layout.height, Math.max(0, point.y + dy * distance)),
    }
  }
  for (const edge of edges) {
    if (edge.fromPort === undefined && edge.toPort === undefined) continue
    const from = graphEdgeEndpoint(layout, nodes, edge, 'from', direction)
    const to = graphEdgeEndpoint(layout, nodes, edge, 'to', direction)
    const distance = Math.min(72, Math.max(22, Math.hypot(to.x - from.x, to.y - from.y) / 3))
    const a = outward(from, distance), b = outward(to, distance)
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
    const box = boxes.get(id)
    if (!box) continue
    if (![point.x, point.y].every(value => Number.isFinite(value) && value >= 0)) {
      throw new RangeError('Graph positions must be finite and nonnegative: ' + id)
    }
    if (point.x === box.x && point.y === box.y) continue
    boxes.set(id, { ...box, x: point.x, y: point.y })
    moved.add(id)
    width = Math.max(width, point.x + box.width + 32)
    height = Math.max(height, point.y + box.height + 32)
  }
  if (!moved.size) return layout

  const paths = new Map(layout.paths)
  const edgeLabels = new Map(layout.edgeLabels)
  for (const edge of edges) {
    if (!moved.has(edge.from) && !moved.has(edge.to)) continue
    const source = boxes.get(edge.from)!
    const target = boxes.get(edge.to)!
    if (edge.from === edge.to) {
      const x = source.x + source.width
      const y = source.y + source.height / 2
      paths.set(edge.id, `M ${x} ${y} C ${x + 30} ${y + 18}, ${x + 30} ${y - 28}, ${x} ${y - 12}`)
      edgeLabels.set(edge.id, { x: x + 21, y: y - 16 })
    } else if (direction === 'TB' || direction === 'BT') {
      const forward = target.y + target.height / 2 >= source.y + source.height / 2
      const x1 = source.x + source.width / 2, x2 = target.x + target.width / 2
      const y1 = source.y + (forward ? source.height : 0), y2 = target.y + (forward ? 0 : target.height)
      const mid = (y1 + y2) / 2
      paths.set(edge.id, `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`)
      edgeLabels.set(edge.id, { x: (x1 + x2) / 2, y: mid - 6 })
    } else {
      const forward = target.x + target.width / 2 >= source.x + source.width / 2
      const x1 = source.x + (forward ? source.width : 0), x2 = target.x + (forward ? 0 : target.width)
      const y1 = source.y + source.height / 2, y2 = target.y + target.height / 2
      const mid = (x1 + x2) / 2
      paths.set(edge.id, `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`)
      edgeLabels.set(edge.id, { x: mid, y: (y1 + y2) / 2 - 6 })
    }
  }
  return { boxes, paths, edgeLabels, width, height }
}
