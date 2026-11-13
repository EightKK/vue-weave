import { indexGraph } from './graph.js'
import type { GraphBox, GraphEdge, GraphLayout, GraphLayoutDirection, IdentifiedNode } from './graph.js'
import { orientGraphLayout } from './graphOrient.js'

export interface GraphTreeLayoutOptions {
  direction?: GraphLayoutDirection
  nodeWidth?: number
  nodeHeight?: number
  /** Distance between depth levels. */
  columnGap?: number
  /** Distance between adjacent leaves. */
  rowGap?: number
  padding?: number
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

function checkNumbers(values: Record<string, number>, positive: readonly string[]) {
  for (const [name, value] of Object.entries(values)) {
    if (!Number.isFinite(value) || value < 0 || (positive.includes(name) && value === 0)) {
      throw new RangeError(name + ' must be finite and positive (spacing may be zero)')
    }
  }
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
  for (const id of requested) if (!index.outgoing.has(id)) throw new Error(`Unknown root node ID: ${id}`)
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
    const turn = x1 + Math.min(24, Math.max(6, columnGap / 2))
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
  const { direction = 'LR', nodeWidth = 144, nodeHeight = 58, columnGap = 50, rowGap = 24, padding = 20, roots } = options
  if (!['LR', 'TB', 'RL', 'BT'].includes(direction)) throw new RangeError('Unknown layout direction')
  checkNumbers({ nodeWidth, nodeHeight, columnGap, rowGap, padding }, ['nodeWidth', 'nodeHeight'])
  const vertical = direction === 'TB' || direction === 'BT'
  const base = vertical
    ? leftToRightTree(nodes, edges, roots, nodeHeight, nodeWidth, columnGap, rowGap, padding)
    : leftToRightTree(nodes, edges, roots, nodeWidth, nodeHeight, columnGap, rowGap, padding)
  if (direction === 'LR') return base
  return orientGraphLayout(base, { transpose: vertical, flipX: direction === 'RL', flipY: direction === 'BT' })
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
  const { nodeWidth = 144, nodeHeight = 58, ringGap = 40, padding = 20, roots } = options
  checkNumbers({ nodeWidth, nodeHeight, ringGap, padding }, ['nodeWidth', 'nodeHeight'])
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
  const rings = Math.max(...forest.order.map(ringOf))
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
