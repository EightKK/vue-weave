// Route metadata checks for the `preserve` routing policy. This module imports only types from graph.ts, which imports
// it, so the two modules do not depend on each other at load time.
import type { GraphBox, GraphEdge, GraphLayout, GraphPoint, GraphPort, IdentifiedNode } from './graph.js'
import { graphPathEndpoints, type GraphRect } from './graphView.js'
import { graphSideAnchor, isGraphPortSide } from './graphPortSide.js'

/**
 * How the core routing functions and NetworkGraph treat the edge paths of a layout. 'builtin' (the default) redraws
 * every edge with a named port and, in the orthogonal and straight edge styles, every edge. 'preserve' keeps each path
 * the layout drew while it still fits its nodes and ports, and redraws only the others.
 */
export type GraphRoutingPolicy = 'builtin' | 'preserve'

// Distance within which a route end counts as being on a box border or at a port anchor, in chart units.
const tolerance = 0.5

// Edges of a layout whose paths were drawn by the core (a rerouted edge of a moved or resized node, a port route, a
// styled route or a temporary route), not by the layout itself. A side table keeps the public layout shape unchanged.
const builtinRoutes = new WeakMap<GraphLayout, ReadonlySet<string>>()

/** Internal: the edges of a layout whose paths the core drew, as recorded by the functions that produced it. */
export function builtinRoutedEdges(layout: GraphLayout): ReadonlySet<string> {
  return builtinRoutes.get(layout) ?? new Set()
}

/**
 * Internal: records on `result` the built-in routes of `source` plus `added`, and returns `result`. Only a newly
 * created layout object is passed as `result`.
 */
export function markBuiltinRoutes<L extends GraphLayout>(result: L, source: GraphLayout, added: Iterable<string>): L {
  const inherited = builtinRoutes.get(source)
  const ids = new Set(inherited)
  for (const id of added) ids.add(id)
  if (ids.size) builtinRoutes.set(result, ids)
  return result
}

function near(a: number, b: number) {
  return Math.abs(a - b) <= tolerance
}

/**
 * Internal: whether a value is a rectangle with finite `x`, `y`, `width` and `height`. `size` also requires a
 * nonnegative (the default) or positive width and height; `any` accepts any finite size. Null and undefined are not
 * rectangles, so callers can throw their own RangeError instead of a TypeError.
 */
export function isFiniteRect(rect: unknown, size: 'any' | 'nonnegative' | 'positive' = 'nonnegative'): rect is GraphRect {
  if (!rect || typeof rect !== 'object') return false
  const { x, y, width, height } = rect as Partial<GraphRect>
  if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(width) || !Number.isFinite(height)) return false
  if (size === 'any') return true
  return size === 'positive' ? width! > 0 && height! > 0 : width! >= 0 && height! >= 0
}

/** Internal: whether a value is a point with finite coordinates. */
export function isFiniteGraphPoint(point: GraphPoint | undefined): point is GraphPoint {
  return !!point && Number.isFinite(point.x) && Number.isFinite(point.y)
}

/**
 * Internal: whether a point lies on one side of a box, or on any side when `side` is undefined, within half a chart
 * unit.
 */
export function isOnGraphBoxSide(box: GraphBox, point: GraphPoint, side?: GraphPort['side']): boolean {
  const withinX = point.x >= box.x - tolerance && point.x <= box.x + box.width + tolerance
  const withinY = point.y >= box.y - tolerance && point.y <= box.y + box.height + tolerance
  const sides = {
    left: near(point.x, box.x) && withinY, right: near(point.x, box.x + box.width) && withinY,
    top: near(point.y, box.y) && withinX, bottom: near(point.y, box.y + box.height) && withinX,
  }
  return side === undefined ? sides.left || sides.right || sides.top || sides.bottom : sides[side]
}

// Whether one end of a route fits its node: at the anchor of the named port (leaving or entering through the port's
// side), or on the box border (on the given side) without a port.
function endFits(box: GraphBox, node: IdentifiedNode | undefined, point: GraphPoint, portId: string | undefined, side: GraphPort['side'] | undefined) {
  if (side !== undefined && !isGraphPortSide(side)) return false
  if (portId === undefined) return isOnGraphBoxSide(box, point, side)
  const port = node?.ports?.find(item => item.id === portId)
  if (!port || !isGraphPortSide(port.side) || (side !== undefined && side !== port.side)) return false
  const anchor = graphSideAnchor(box, port.side, port.offset ?? 0.5)
  return near(point.x, anchor.x) && near(point.y, anchor.y)
}

/**
 * Whether the routing policy 'preserve' keeps the path of an edge in a layout. The path must exist and must have been
 * drawn by the layout, not rerouted by the core because a node moved or was resized; the edge must have no `points`
 * (explicit waypoints always win); and both ends must fit the current boxes: at the anchor of a named port, otherwise on
 * the box border. When the layout has route metadata for the edge (`layout.routes`), its ports must equal the edge's,
 * its sides must match the ports or the borders its ends lie on, its points must be finite, and the path must start and
 * end at its `start` and `end`. Without metadata the ends are read from the path. Never throws; a path it cannot read
 * is not kept.
 */
export function isGraphRouteValid(layout: GraphLayout, nodes: ReadonlyMap<string, IdentifiedNode>, edge: GraphEdge): boolean {
  if (edge.points?.length || builtinRoutedEdges(layout).has(edge.id)) return false
  const path = layout.paths.get(edge.id)
  const source = layout.boxes.get(edge.from), target = layout.boxes.get(edge.to)
  if (typeof path !== 'string' || !source || !target) return false
  let drawn: { start: GraphPoint; end: GraphPoint } | undefined
  try {
    drawn = graphPathEndpoints(path)
  } catch {
    return false
  }
  const route = layout.routes?.get(edge.id)
  let start: GraphPoint, end: GraphPoint
  if (route) {
    if (!isFiniteGraphPoint(route.start) || !isFiniteGraphPoint(route.end) || !(route.points ?? []).every(isFiniteGraphPoint)) return false
    if (route.fromPort !== edge.fromPort || route.toPort !== edge.toPort) return false
    if (drawn && !(near(drawn.start.x, route.start.x) && near(drawn.start.y, route.start.y)
      && near(drawn.end.x, route.end.x) && near(drawn.end.y, route.end.y))) return false
    start = route.start
    end = route.end
  } else {
    if (!drawn) return false
    start = drawn.start
    end = drawn.end
  }
  return endFits(source, nodes.get(edge.from), start, edge.fromPort, route?.fromSide)
    && endFits(target, nodes.get(edge.to), end, edge.toPort, route?.toSide)
}
