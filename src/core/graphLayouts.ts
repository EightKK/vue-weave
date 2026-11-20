import { indexGraph } from './graph.js'
import type { GraphBox, GraphEdge, GraphLayout, GraphLayoutOptions, IdentifiedNode } from './graph.js'
import { assertGraphLayoutDirection, graphDirectionOrientation, isVerticalDirection, orientGraphLayout } from './graphOrient.js'
import {
  checkLayoutNumber, checkLayoutSizes, defaultColumnGap, defaultNodeHeight, defaultNodeWidth, defaultPadding, defaultRowGap,
  sameRankTurnDistance,
} from './graphOptions.js'
import { unknownReferenceError } from './ids.js'

/** Options of `layoutTreeGraph`: the shared layout options (`columnGap` between depth levels, `rowGap` between adjacent leaves) plus roots. */
export interface GraphTreeLayoutOptions extends GraphLayoutOptions {
  /** Node IDs placed first as tree roots. Remaining roots are nodes without incoming edges, then any node left over in a cycle. */
  roots?: readonly string[]
}

export interface GraphRadialLayoutOptions {
  nodeWidth?: number
  nodeHeight?: number
  /** Free space between neighbouring rings and between neighbouring nodes on one ring. */
  ringGap?: number
  padding?: number
  /** Node IDs placed first as tree roots. See GraphTreeLayoutOptions.roots. */
  roots?: readonly string[]
}

interface Forest {
  roots: string[]
  /** Breadth-first discovery order; parents always precede their children. */
  order: string[]
  depth: Map<string, number>
  children: Map<string, string[]>
}

// Breadth-first spanning forest. Edges that do not become tree edges (cross, back, forward, self) stay routed but do not place nodes.
function spanningForest(nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[], requested: readonly string[] = []): Forest {
  const index = indexGraph(nodes, edges)
  for (const id of requested) if (!index.outgoing.has(id)) throw unknownReferenceError('node', 'roots', id)
  const hasParent = new Set<string>()
  for (const { from, to } of edges) if (from !== to) hasParent.add(to)

  const candidates = [...requested, ...nodes.map(node => node.id).filter(id => !hasParent.has(id)), ...nodes.map(node => node.id)]
  const depth = new Map<string, number>()
  const children = new Map<string, string[]>(nodes.map(node => [node.id, []]))
  const order: string[] = []
  const roots: string[] = []

  for (const root of candidates) {
    if (depth.has(root)) continue
    roots.push(root)
    depth.set(root, 0)
    const start = order.length
    order.push(root)
    for (let i = start; i < order.length; i++) {
      const id = order[i]!
      for (const next of index.outgoing.get(id)!) {
        if (depth.has(next)) continue
        depth.set(next, depth.get(id)! + 1)
        children.get(id)!.push(next)
        order.push(next)
      }
    }
  }
  return { roots, order, depth, children }
}

/** Left-to-right drawing of an edge between two boxes that were already placed; returns the right-most x it needs. */
function routeEdge(edge: GraphEdge, source: GraphBox, target: GraphBox, columnGap: number, paths: Map<string, string>, labels: Map<string, { x: number; y: number }>): number {
  const x1 = source.x + source.width
  const y1 = source.y + source.height / 2
  const y2 = target.y + target.height / 2
  if (edge.from === edge.to) {
    const turn = x1 + sameRankTurnDistance(columnGap)
    const endY = y2 - target.height / 3
    paths.set(edge.id, `M ${x1} ${y1} C ${turn + 6} ${y1}, ${turn + 6} ${endY}, ${x1} ${endY}`)
    labels.set(edge.id, { x: turn + 9, y: (y1 + endY) / 2 })
    return turn + 6
  }
  if (target.x >= x1) {
    const middle = (x1 + target.x) / 2
    paths.set(edge.id, `M ${x1} ${y1} C ${middle} ${y1}, ${middle} ${y2}, ${target.x} ${y2}`)
    labels.set(edge.id, { x: middle, y: (y1 + y2) / 2 - 7 })
    return x1
  }
  // Same-depth and back edges leave the right side and enter the left side with an S-curve.
  const reach = Math.max(12, Math.min(24, columnGap / 2))
  const a = x1 + reach, b = Math.max(0, target.x - reach)
  paths.set(edge.id, `M ${x1} ${y1} C ${a} ${y1}, ${b} ${y2}, ${target.x} ${y2}`)
  labels.set(edge.id, { x: (x1 + 3 * a + 3 * b + target.x) / 8, y: (y1 + y2) / 2 - 7 })
  return a
}

function leftToRightTree(nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[], roots: readonly string[] | undefined, nodeWidth: number, nodeHeight: number, columnGap: number, rowGap: number, padding: number): GraphLayout {
  const forest = spanningForest(nodes, edges, roots)
  const slot = new Map<string, number>()
  const preorder: string[] = []
  let leaves = 0

  // Children are pushed in reverse so the first one is visited first.
  const stack = forest.roots.slice().reverse()
  while (stack.length) {
    const id = stack.pop()!
    preorder.push(id)
    const kids = forest.children.get(id)!
    if (!kids.length) slot.set(id, leaves++)
    for (let i = kids.length - 1; i >= 0; i--) stack.push(kids[i]!)
  }

  // Children come after their parent in preorder, so one reverse pass centres every parent over its children.
  for (let i = preorder.length - 1; i >= 0; i--) {
    const id = preorder[i]!
    const kids = forest.children.get(id)!
    if (kids.length) slot.set(id, (slot.get(kids[0]!)! + slot.get(kids[kids.length - 1]!)!) / 2)
  }

  const boxes = new Map<string, GraphBox>()
  let maxDepth = 0
  for (const id of forest.order) {
    const depth = forest.depth.get(id)!
    maxDepth = Math.max(maxDepth, depth)
    boxes.set(id, {
      x: padding + depth * (nodeWidth + columnGap),
      y: padding + slot.get(id)! * (nodeHeight + rowGap),
      width: nodeWidth, height: nodeHeight, rank: depth,
    })
  }

  const paths = new Map<string, string>()
  const edgeLabels = new Map<string, { x: number; y: number }>()
  let routeRight = 0
  for (const edge of edges) routeRight = Math.max(routeRight, routeEdge(edge, boxes.get(edge.from)!, boxes.get(edge.to)!, columnGap, paths, edgeLabels))

  const nodeRight = nodes.length ? padding + (maxDepth + 1) * (nodeWidth + columnGap) - columnGap : 0
  const nodeBottom = nodes.length ? padding + leaves * (nodeHeight + rowGap) - rowGap : 0
  return {
    boxes, paths, edgeLabels,
    width: Math.max(1, Math.max(nodeRight, routeRight + 6) + padding),
    height: Math.max(1, nodeBottom + padding),
  }
}

/**
 * Tidy tree layout for forests. Depth maps to columns (LR) and leaves are spaced evenly with each parent
 * centred over its children. Edges that are not tree edges are drawn as extra curves.
 */
export function layoutTreeGraph(
  nodes: readonly IdentifiedNode[],
  edges: readonly GraphEdge[],
  options: GraphTreeLayoutOptions = {},
): GraphLayout {
  const {
    direction = 'LR', nodeWidth = defaultNodeWidth, nodeHeight = defaultNodeHeight, columnGap = defaultColumnGap, rowGap = defaultRowGap,
    padding = defaultPadding, roots,
  } = options
  assertGraphLayoutDirection(direction)
  checkLayoutSizes(nodeWidth, nodeHeight, { columnGap, rowGap, padding })
  const vertical = isVerticalDirection(direction)
  const base = vertical
    ? leftToRightTree(nodes, edges, roots, nodeHeight, nodeWidth, columnGap, rowGap, padding)
    : leftToRightTree(nodes, edges, roots, nodeWidth, nodeHeight, columnGap, rowGap, padding)
  if (direction === 'LR') return base
  return orientGraphLayout(base, graphDirectionOrientation(direction))
}

function borderPoint(box: GraphBox, toward: { x: number; y: number }) {
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2
  const dx = toward.x - cx, dy = toward.y - cy
  if (dx === 0 && dy === 0) return { x: cx, y: cy }
  const t = Math.min(dx === 0 ? Infinity : box.width / 2 / Math.abs(dx), dy === 0 ? Infinity : box.height / 2 / Math.abs(dy), 1)
  return { x: cx + dx * t, y: cy + dy * t }
}

/**
 * Radial layout: nodes sit on concentric rings by breadth-first depth from the roots. A single root is placed
 * at the centre; several roots share the first ring. Each subtree receives an angular wedge proportional to its leaf count.
 */
export function layoutRadialGraph(
  nodes: readonly IdentifiedNode[],
  edges: readonly GraphEdge[],
  options: GraphRadialLayoutOptions = {},
): GraphLayout {
  const { nodeWidth = defaultNodeWidth, nodeHeight = defaultNodeHeight, ringGap = 40, padding = defaultPadding, roots } = options
  checkLayoutSizes(nodeWidth, nodeHeight, { ringGap, padding })
  const forest = spanningForest(nodes, edges, roots)
  const empty: GraphLayout = { boxes: new Map(), paths: new Map(), edgeLabels: new Map(), width: Math.max(1, 2 * padding), height: Math.max(1, 2 * padding) }
  if (!nodes.length) return empty

  const leafCount = new Map<string, number>()
  for (let i = forest.order.length - 1; i >= 0; i--) {
    const id = forest.order[i]!
    const kids = forest.children.get(id)!
    leafCount.set(id, kids.length ? kids.reduce((sum, kid) => sum + leafCount.get(kid)!, 0) : 1)
  }
  const totalLeaves = forest.roots.reduce((sum, root) => sum + leafCount.get(root)!, 0)

  // Several roots share ring 1 around an empty centre.
  const virtual = forest.roots.length > 1
  const ringOf = (id: string) => forest.depth.get(id)! + (virtual ? 1 : 0)
  const angle = new Map<string, number>()
  const wedges: [string, number, number][] = []
  let cursor = -Math.PI / 2
  for (const root of forest.roots) {
    const span = (2 * Math.PI * leafCount.get(root)!) / totalLeaves
    wedges.push([root, cursor, cursor + span])
    cursor += span
  }
  while (wedges.length) {
    const [id, start, end] = wedges.pop()!
    angle.set(id, (start + end) / 2)
    let at = start
    for (const kid of forest.children.get(id)!) {
      const span = ((end - start) * leafCount.get(kid)!) / leafCount.get(id)!
      wedges.push([kid, at, at + span])
      at += span
    }
  }

  const diagonal = Math.hypot(nodeWidth, nodeHeight)
  const step = diagonal + ringGap
  // Siblings in one ring are at least one leaf wedge apart, so this radius keeps their boxes from touching.
  const wedge = (2 * Math.PI) / totalLeaves
  const minRadius = totalLeaves > 1 ? step / (2 * Math.sin(Math.min(wedge / 2, Math.PI / 2))) : 0
  // A loop rather than Math.max(...array), which overflows the call stack for very large graphs.
  let rings = 0
  for (const id of forest.order) rings = Math.max(rings, ringOf(id))
  const radius = [0]
  for (let ring = 1; ring <= rings; ring++) radius.push(Math.max(radius[ring - 1]! + step, minRadius))

  const centres = new Map<string, { x: number; y: number }>()
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const id of forest.order) {
    const r = radius[ringOf(id)]!
    const point = { x: r * Math.cos(angle.get(id)!), y: r * Math.sin(angle.get(id)!) }
    centres.set(id, point)
    minX = Math.min(minX, point.x - nodeWidth / 2)
    maxX = Math.max(maxX, point.x + nodeWidth / 2)
    minY = Math.min(minY, point.y - nodeHeight / 2)
    maxY = Math.max(maxY, point.y + nodeHeight / 2)
  }

  const boxes = new Map<string, GraphBox>()
  for (const { id } of nodes) {
    const point = centres.get(id)!
    boxes.set(id, {
      x: point.x - nodeWidth / 2 - minX + padding, y: point.y - nodeHeight / 2 - minY + padding,
      width: nodeWidth, height: nodeHeight, rank: forest.depth.get(id)!,
    })
  }

  const paths = new Map<string, string>()
  const edgeLabels = new Map<string, { x: number; y: number }>()
  let right = maxX - minX + padding
  for (const edge of edges) {
    const source = boxes.get(edge.from)!, target = boxes.get(edge.to)!
    if (edge.from === edge.to) {
      const x = source.x + source.width, y = source.y + source.height / 2
      paths.set(edge.id, `M ${x} ${y} C ${x + 30} ${y + 18}, ${x + 30} ${y - 28}, ${x} ${y - 12}`)
      edgeLabels.set(edge.id, { x: x + 21, y: y - 16 })
      right = Math.max(right, x + 30)
      continue
    }
    const from = borderPoint(source, { x: target.x + target.width / 2, y: target.y + target.height / 2 })
    const to = borderPoint(target, { x: source.x + source.width / 2, y: source.y + source.height / 2 })
    paths.set(edge.id, `M ${from.x} ${from.y} L ${to.x} ${to.y}`)
    edgeLabels.set(edge.id, { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - 6 })
  }

  return {
    boxes, paths, edgeLabels,
    width: Math.max(1, right + padding),
    height: Math.max(1, maxY - minY + 2 * padding),
  }
}

/** Options of `layoutCircularGraph`. `N` is the node type, so `sort` receives your own nodes. */
export interface GraphCircularLayoutOptions<N extends IdentifiedNode = IdentifiedNode> {
  nodeWidth?: number
  nodeHeight?: number
  /** Free space between neighbouring boxes on the circle. */
  nodeGap?: number
  padding?: number
  /** Circle radius (distance from the circle centre to the box centres). Throws a RangeError when neighbouring boxes would overlap. Default: the smallest radius that keeps `nodeGap` between neighbours. */
  radius?: number
  /** Angle of the first node in radians, measured clockwise from the positive x axis in screen coordinates. Default: -Math.PI / 2 (top). */
  startAngle?: number
  /** Place nodes clockwise on screen. Default true. */
  clockwise?: boolean
  /** Reorders the nodes before placement (a stable sort of a copy). Default: input order. */
  sort?: (a: N, b: N) => number
}

export interface GraphGridLayoutOptions {
  nodeWidth?: number
  nodeHeight?: number
  columnGap?: number
  rowGap?: number
  padding?: number
  /** Nodes per row, a positive integer. Default: Math.ceil(Math.sqrt(nodeCount)). */
  columns?: number
}

/** Options of `layoutConcentricGraph`. `N` is the node type, so `level` receives your own nodes. */
export interface GraphConcentricLayoutOptions<N extends IdentifiedNode = IdentifiedNode> {
  nodeWidth?: number
  nodeHeight?: number
  /** Free space between neighbouring rings and between neighbouring nodes on one ring. */
  ringGap?: number
  padding?: number
  /** Ring metric. Higher values sit closer to the centre. `degree` is the number of incident edges, self-loops excluded. Default: the degree. Must return a finite number. */
  level?: (node: N, degree: number) => number
  /** Groups levels into rings: nodes share a ring when floor(level / levelWidth) is equal. Positive. Default: one ring per distinct level. */
  levelWidth?: number
  /** Angle of the first node of each ring in radians. Default: -Math.PI / 2 (top). */
  startAngle?: number
}

/** Boxes from centre points, then straight border-to-border edges (self-loops as a small curve on the right side). */
function finishStraightLayout(nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[], centres: ReadonlyMap<string, { x: number; y: number }>, ranks: ReadonlyMap<string, number>, nodeWidth: number, nodeHeight: number, padding: number): GraphLayout {
  if (!nodes.length) return { boxes: new Map(), paths: new Map(), edgeLabels: new Map(), width: Math.max(1, 2 * padding), height: Math.max(1, 2 * padding) }
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const { id } of nodes) {
    const point = centres.get(id)!
    minX = Math.min(minX, point.x - nodeWidth / 2)
    maxX = Math.max(maxX, point.x + nodeWidth / 2)
    minY = Math.min(minY, point.y - nodeHeight / 2)
    maxY = Math.max(maxY, point.y + nodeHeight / 2)
  }
  const boxes = new Map<string, GraphBox>()
  for (const { id } of nodes) {
    const point = centres.get(id)!
    boxes.set(id, {
      x: point.x - nodeWidth / 2 - minX + padding, y: point.y - nodeHeight / 2 - minY + padding,
      width: nodeWidth, height: nodeHeight, rank: ranks.get(id)!,
    })
  }
  const paths = new Map<string, string>()
  const edgeLabels = new Map<string, { x: number; y: number }>()
  let right = maxX - minX + padding
  for (const edge of edges) {
    const source = boxes.get(edge.from)!, target = boxes.get(edge.to)!
    if (edge.from === edge.to) {
      const x = source.x + source.width, y = source.y + source.height / 2
      paths.set(edge.id, `M ${x} ${y} C ${x + 30} ${y + 18}, ${x + 30} ${y - 28}, ${x} ${y - 12}`)
      edgeLabels.set(edge.id, { x: x + 21, y: y - 16 })
      right = Math.max(right, x + 30)
      continue
    }
    const from = borderPoint(source, { x: target.x + target.width / 2, y: target.y + target.height / 2 })
    const to = borderPoint(target, { x: source.x + source.width / 2, y: source.y + source.height / 2 })
    paths.set(edge.id, `M ${from.x} ${from.y} L ${to.x} ${to.y}`)
    edgeLabels.set(edge.id, { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 - 6 })
  }
  return { boxes, paths, edgeLabels, width: Math.max(1, right + padding), height: Math.max(1, maxY - minY + 2 * padding) }
}

/** Smallest circle radius at which `count` boxes of the given size keep `gap` between neighbours (centre distance of at least the diagonal plus the gap). */
function circleRadius(count: number, nodeWidth: number, nodeHeight: number, gap: number): number {
  return count > 1 ? (Math.hypot(nodeWidth, nodeHeight) + gap) / (2 * Math.sin(Math.PI / count)) : 0
}

/**
 * Circular layout: all nodes sit on one circle in input order (or in `sort` order). The radius grows linearly with the
 * node count so neighbouring boxes never overlap. Edges are straight lines between box borders; self-loops are small curves.
 */
export function layoutCircularGraph<N extends IdentifiedNode>(
  nodes: readonly N[],
  edges: readonly GraphEdge[],
  options: GraphCircularLayoutOptions<N> = {},
): GraphLayout {
  const {
    nodeWidth = defaultNodeWidth, nodeHeight = defaultNodeHeight, nodeGap = 40, padding = defaultPadding, radius, startAngle = -Math.PI / 2,
    clockwise = true, sort,
  } = options
  checkLayoutSizes(nodeWidth, nodeHeight, { nodeGap, padding })
  checkLayoutNumber('startAngle', startAngle, 'finite')
  if (radius !== undefined) checkLayoutNumber('radius', radius, 'positive')
  indexGraph(nodes, edges)
  const ordered = sort ? nodes.slice().sort(sort) : nodes
  const count = ordered.length
  const minimum = circleRadius(count, nodeWidth, nodeHeight, nodeGap)
  if (radius !== undefined && count > 1 && radius < minimum - 1e-9) throw new RangeError(`radius is too small: ${count} nodes need at least ${minimum}`)
  const r = radius === undefined ? minimum : count > 1 ? radius : 0
  const centres = new Map<string, { x: number; y: number }>()
  const ranks = new Map<string, number>()
  const direction = clockwise ? 1 : -1
  ordered.forEach((node, i) => {
    const angle = startAngle + (direction * 2 * Math.PI * i) / count
    centres.set(node.id, { x: r * Math.cos(angle), y: r * Math.sin(angle) })
    ranks.set(node.id, 0)
  })
  return finishStraightLayout(nodes, edges, centres, ranks, nodeWidth, nodeHeight, padding)
}

/**
 * Grid layout: nodes fill rows of `columns` in input order. `rank` is the row index. Edges are straight lines between
 * box borders, so they can cross other boxes; self-loops are small curves.
 */
export function layoutGridGraph(
  nodes: readonly IdentifiedNode[],
  edges: readonly GraphEdge[],
  options: GraphGridLayoutOptions = {},
): GraphLayout {
  const { nodeWidth = defaultNodeWidth, nodeHeight = defaultNodeHeight, columnGap = defaultColumnGap, rowGap = defaultRowGap, padding = defaultPadding } = options
  checkLayoutSizes(nodeWidth, nodeHeight, { columnGap, rowGap, padding })
  const columns = options.columns ?? Math.max(1, Math.ceil(Math.sqrt(nodes.length)))
  checkLayoutNumber('columns', columns, 'positiveInteger')
  indexGraph(nodes, edges)
  const centres = new Map<string, { x: number; y: number }>()
  const ranks = new Map<string, number>()
  nodes.forEach((node, i) => {
    const row = Math.floor(i / columns), column = i % columns
    centres.set(node.id, { x: column * (nodeWidth + columnGap) + nodeWidth / 2, y: row * (nodeHeight + rowGap) + nodeHeight / 2 })
    ranks.set(node.id, row)
  })
  return finishStraightLayout(nodes, edges, centres, ranks, nodeWidth, nodeHeight, padding)
}

/**
 * Concentric layout: nodes sit on rings chosen by a metric (the degree by default). Higher levels are closer to the
 * centre; `rank` is the ring index, 0 for the innermost. Each ring is large enough for its nodes and rings are at least
 * one node diagonal plus `ringGap` apart, so boxes never overlap. Nodes keep input order within a ring. Sorting the
 * distinct levels makes the work O(n + e + k log k) for k rings.
 */
export function layoutConcentricGraph<N extends IdentifiedNode>(
  nodes: readonly N[],
  edges: readonly GraphEdge[],
  options: GraphConcentricLayoutOptions<N> = {},
): GraphLayout {
  const {
    nodeWidth = defaultNodeWidth, nodeHeight = defaultNodeHeight, ringGap = 40, padding = defaultPadding, level, levelWidth,
    startAngle = -Math.PI / 2,
  } = options
  checkLayoutSizes(nodeWidth, nodeHeight, { ringGap, padding })
  if (levelWidth !== undefined) checkLayoutNumber('levelWidth', levelWidth, 'positive')
  checkLayoutNumber('startAngle', startAngle, 'finite')
  indexGraph(nodes, edges)
  const degree = new Map<string, number>(nodes.map(node => [node.id, 0]))
  for (const { from, to } of edges) {
    if (from === to) continue
    degree.set(from, degree.get(from)! + 1)
    degree.set(to, degree.get(to)! + 1)
  }
  const buckets = new Map<number, N[]>()
  for (const node of nodes) {
    const value = level ? level(node, degree.get(node.id)!) : degree.get(node.id)!
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError(`level must return a finite number (node ${node.id})`)
    const key = levelWidth === undefined ? value : Math.floor(value / levelWidth)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(node)
    else buckets.set(key, [node])
  }
  const keys = [...buckets.keys()].sort((a, b) => b - a)
  const step = Math.hypot(nodeWidth, nodeHeight) + ringGap
  const centres = new Map<string, { x: number; y: number }>()
  const ranks = new Map<string, number>()
  let previous = -Infinity
  keys.forEach((key, ring) => {
    const members = buckets.get(key)!
    const needed = circleRadius(members.length, nodeWidth, nodeHeight, ringGap)
    const radius = ring === 0 ? needed : Math.max(previous + step, needed)
    previous = radius
    members.forEach((node, i) => {
      const angle = startAngle + (2 * Math.PI * i) / members.length
      centres.set(node.id, { x: radius * Math.cos(angle), y: radius * Math.sin(angle) })
      ranks.set(node.id, ring)
    })
  })
  return finishStraightLayout(nodes, edges, centres, ranks, nodeWidth, nodeHeight, padding)
}
