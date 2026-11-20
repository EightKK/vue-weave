import type { GraphPoint } from './graph.js'
import { isFiniteGraphPoint } from './graphGeometry.js'
import type { GraphRect } from './graphView.js'

function finitePoint(point: GraphPoint, what: string) {
  if (!isFiniteGraphPoint(point)) throw new RangeError(what + ' must have finite x and y coordinates')
}

function validatePolygon(polygon: readonly GraphPoint[]) {
  if (!Array.isArray(polygon)) throw new RangeError('A selection polygon must be an array of points')
  for (const point of polygon) finitePoint(point, 'Every polygon point')
}

// Whether `point` lies on the closed segment from `a` to `b`, with a tolerance relative to the segment length.
function onSegment(point: GraphPoint, a: GraphPoint, b: GraphPoint) {
  const cross = (b.x - a.x) * (point.y - a.y) - (b.y - a.y) * (point.x - a.x)
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  if (Math.abs(cross) > 1e-9 * Math.max(1, length)) return false
  return point.x >= Math.min(a.x, b.x) && point.x <= Math.max(a.x, b.x) && point.y >= Math.min(a.y, b.y) && point.y <= Math.max(a.y, b.y)
}

// Even-odd crossing test without validation; the caller has validated the inputs.
function contains(point: GraphPoint, polygon: readonly GraphPoint[]) {
  let inside = false
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const a = polygon[i]!, b = polygon[j]!
    if (onSegment(point, a, b)) return true
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/**
 * Whether a point lies inside a polygon given by its vertices in order; the polygon is closed implicitly. Uses the
 * even-odd rule, so the overlapping loops of a self-intersecting lasso alternate between inside and outside. A point on
 * an edge or vertex counts as inside. A polygon with fewer than three vertices contains nothing. Throws RangeError for a
 * non-finite coordinate.
 */
export function graphPointInPolygon(point: GraphPoint, polygon: readonly GraphPoint[]): boolean {
  finitePoint(point, 'The point')
  validatePolygon(polygon)
  return polygon.length >= 3 && contains(point, polygon)
}

/**
 * The IDs of the boxes whose centre lies inside a polygon (see graphPointInPolygon), in the iteration order of `boxes`.
 * Use it with the `boxes` of a GraphLayout for a free-form (lasso) selection. A polygon with fewer than three vertices
 * selects nothing. Throws RangeError for a non-finite polygon coordinate or box geometry.
 */
export function graphNodesInPolygon(boxes: ReadonlyMap<string, GraphRect>, polygon: readonly GraphPoint[]): string[] {
  validatePolygon(polygon)
  if (polygon.length < 3) return []
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
  for (const point of polygon) {
    left = Math.min(left, point.x)
    top = Math.min(top, point.y)
    right = Math.max(right, point.x)
    bottom = Math.max(bottom, point.y)
  }
  const ids: string[] = []
  for (const [id, box] of boxes) {
    if (![box.x, box.y, box.width, box.height].every(Number.isFinite)) throw new RangeError('Graph box geometry must be finite: ' + id)
    const center = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    if (center.x < left || center.x > right || center.y < top || center.y > bottom) continue
    if (contains(center, polygon)) ids.push(id)
  }
  return ids
}
