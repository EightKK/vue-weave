import type { GraphLayout } from './graph.js'
import type { GraphViewport } from './types.js'

/** An axis-aligned rectangle in graph (world) coordinates. */
export interface GraphRect {
  x: number
  y: number
  width: number
  height: number
}

/** Bounding rectangles of the nodes and edges of a layout, keyed by ID. */
export interface GraphBounds {
  nodes: Map<string, GraphRect>
  edges: Map<string, GraphRect>
}

export interface GraphCullKeep {
  nodes?: Iterable<string>
  edges?: Iterable<string>
}

export interface GraphVisibleIds {
  nodes: Set<string>
  edges: Set<string>
}

/**
 * Returns the part of the world that a camera shows. `overscan` is a margin in screen pixels added on every side,
 * so it covers the same screen distance at every zoom level.
 */
export function graphViewportRect(
  camera: GraphViewport, size: { width: number; height: number }, overscan = 0,
): GraphRect {
  const values = [camera.x, camera.y, camera.scale, size.width, size.height, overscan]
  if (!values.every(Number.isFinite) || camera.scale <= 0 || size.width < 0 || size.height < 0 || overscan < 0) {
    throw new RangeError('A graph viewport needs a positive scale, nonnegative size and nonnegative overscan')
  }
  return {
    x: (-camera.x - overscan) / camera.scale,
    y: (-camera.y - overscan) / camera.scale,
    width: (size.width + 2 * overscan) / camera.scale,
    height: (size.height + 2 * overscan) / camera.scale,
  }
}

/** Whether two rectangles overlap or touch. */
export function graphRectsIntersect(a: GraphRect, b: GraphRect): boolean {
  return a.x <= b.x + b.width && a.x + a.width >= b.x && a.y <= b.y + b.height && a.y + a.height >= b.y
}

const argumentCounts: Record<string, number> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 }

/**
 * Bounding rectangle of an SVG path string. Curves are bounded by their control points, which always contain
 * the curve, so the result can be larger than the drawn stroke but never smaller. Arcs are bounded by their
 * end points grown by the larger radius. Returns undefined when the path has no coordinates.
 */
export function graphPathBounds(path: string): GraphRect | undefined {
  const tokens = path.match(/[a-zA-Z]|[-+]?(?:\d*\.\d+|\d+\.?)(?:e[-+]?\d+)?/g) ?? []
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
  let x = 0, y = 0, startX = 0, startY = 0
  const include = (px: number, py: number, grow = 0) => {
    left = Math.min(left, px - grow)
    top = Math.min(top, py - grow)
    right = Math.max(right, px + grow)
    bottom = Math.max(bottom, py + grow)
  }
  let index = 0
  while (index < tokens.length) {
    const token = tokens[index]!
    if (!/[a-zA-Z]/.test(token)) throw new Error('Invalid SVG path data: ' + path)
    index++
    const command = token.toUpperCase()
    const relative = token !== command
    const count = argumentCounts[command]
    if (count === undefined) throw new Error('Unsupported SVG path command: ' + token)
    if (count === 0) {
      x = startX
      y = startY
      continue
    }
    let first = true
    // A command can be followed by repeated argument groups; a repeated M continues as L.
    while (index < tokens.length && !/[a-zA-Z]/.test(tokens[index]!)) {
      const args = tokens.slice(index, index + count).map(Number)
      if (args.length < count || args.some(value => !Number.isFinite(value))) throw new Error('Invalid SVG path data: ' + path)
      index += count
      const ox = relative ? x : 0, oy = relative ? y : 0
      if (command === 'H') x = args[0]! + ox
      else if (command === 'V') y = args[0]! + oy
      else if (command === 'A') {
        const nx = args[5]! + ox, ny = args[6]! + oy
        const radius = Math.max(Math.abs(args[0]!), Math.abs(args[1]!))
        include(x, y, radius)
        include(nx, ny, radius)
        x = nx
        y = ny
      } else {
        // Control points come before the end point in C, S, Q and T.
        for (let i = 0; i < count - 2; i += 2) include(args[i]! + ox, args[i + 1]! + oy)
        x = args[count - 2]! + ox
        y = args[count - 1]! + oy
      }
      if (command === 'M' && first) {
        startX = x
        startY = y
      }
      first = false
      include(x, y)
    }
  }
  return left === Infinity ? undefined : { x: left, y: top, width: right - left, height: bottom - top }
}

/** Computes the bounding rectangle of every node and edge path in a layout. Edge labels are included. */
export function graphLayoutBounds(layout: Pick<GraphLayout, 'boxes' | 'paths' | 'edgeLabels'>, labelReach = 80): GraphBounds {
  const nodes = new Map<string, GraphRect>()
  for (const [id, box] of layout.boxes) nodes.set(id, { x: box.x, y: box.y, width: box.width, height: box.height })
  const edges = new Map<string, GraphRect>()
  for (const [id, path] of layout.paths) {
    const bounds = graphPathBounds(path)
    const label = layout.edgeLabels.get(id)
    if (!bounds && !label) continue
    let left = bounds?.x ?? Infinity, top = bounds?.y ?? Infinity
    let right = bounds ? bounds.x + bounds.width : -Infinity, bottom = bounds ? bounds.y + bounds.height : -Infinity
    if (label) {
      left = Math.min(left, label.x - labelReach)
      right = Math.max(right, label.x + labelReach)
      top = Math.min(top, label.y - 16)
      bottom = Math.max(bottom, label.y + 8)
    }
    edges.set(id, { x: left, y: top, width: right - left, height: bottom - top })
  }
  return { nodes, edges }
}

/**
 * Selects the nodes and edges whose bounds intersect `view`. IDs listed in `keep` are always included when they
 * exist, which lets a caller retain the selected, focused or currently edited elements.
 */
export function cullGraphElements(bounds: GraphBounds, view: GraphRect, keep: GraphCullKeep = {}): GraphVisibleIds {
  const nodes = new Set<string>(), edges = new Set<string>()
  for (const [id, rect] of bounds.nodes) if (graphRectsIntersect(rect, view)) nodes.add(id)
  for (const [id, rect] of bounds.edges) if (graphRectsIntersect(rect, view)) edges.add(id)
  for (const id of keep.nodes ?? []) if (bounds.nodes.has(id)) nodes.add(id)
  for (const id of keep.edges ?? []) if (bounds.edges.has(id)) edges.add(id)
  return { nodes, edges }
}

/** Camera that centers a world point at the given scale. */
export function graphCameraAt(
  point: { x: number; y: number }, size: { width: number; height: number }, scale: number,
): GraphViewport {
  if (![point.x, point.y, size.width, size.height, scale].every(Number.isFinite) || scale <= 0) {
    throw new RangeError('Centering a graph point requires finite coordinates and a positive scale')
  }
  return { x: size.width / 2 - point.x * scale, y: size.height / 2 - point.y * scale, scale }
}
