// Internal geometry of NetworkGraph node shapes and edge markers, shared by the component, the edge routing and the SVG
// export so that they draw the same outlines. `index.ts` does not export this module.
import type { GraphEdge, GraphEdgeMarker, GraphPoint } from './graph.js'

/** The node shapes drawn inside the box instead of a rectangle. */
export type GraphOutlineShape = 'diamond' | 'ellipse' | 'hexagon'

type Rect = { x: number; y: number; width: number; height: number }

/** The outline shape of a node, or undefined for a rectangle (`box`, `rounded`, no shape or an unknown value). */
export function graphOutlineShape(node: unknown): GraphOutlineShape | undefined {
  const shape = (node as { shape?: unknown } | undefined)?.shape
  return shape === 'diamond' || shape === 'ellipse' || shape === 'hexagon' ? shape : undefined
}

// How far the pointed ends of a hexagon reach in from the box sides: 60-degree corners, at most a quarter of the width.
function hexagonInset(width: number, height: number) {
  return Math.min(height / 2 / Math.sqrt(3), width / 4)
}

/** An SVG element that draws an outline shape: an ellipse, or a polygon through its corner points. */
export type GraphOutlineElement =
  | { tag: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { tag: 'polygon'; points: GraphPoint[] }

/**
 * The outline of a shape in a `width` by `height` box at the origin, `inset` units inside the box on every side, as the
 * default renderer draws it (the rectangle shapes are inset by 2 as well).
 */
export function graphOutlineElement(shape: GraphOutlineShape, width: number, height: number, inset = 2): GraphOutlineElement {
  const w = Math.max(0, width - 2 * inset), h = Math.max(0, height - 2 * inset)
  const left = inset, top = inset, cx = width / 2, cy = height / 2
  if (shape === 'ellipse') return { tag: 'ellipse', cx, cy, rx: w / 2, ry: h / 2 }
  if (shape === 'diamond') {
    return { tag: 'polygon', points: [{ x: cx, y: top }, { x: left + w, y: cy }, { x: cx, y: top + h }, { x: left, y: cy }] }
  }
  const q = hexagonInset(w, h)
  return {
    tag: 'polygon', points: [
      { x: left, y: cy }, { x: left + q, y: top }, { x: left + w - q, y: top },
      { x: left + w, y: cy }, { x: left + w - q, y: top + h }, { x: left + q, y: top + h },
    ],
  }
}

/** The `points` attribute of a polygon, with coordinates rounded to hundredths. */
export function graphPolygonPoints(points: readonly GraphPoint[]): string {
  const format = (value: number) => String(Math.round(value * 100) / 100 + 0)
  return points.map(point => format(point.x) + ',' + format(point.y)).join(' ')
}

/**
 * Where the ray from the centre of a box towards a point leaves the outline of a shape inscribed in the box (touching
 * the middle of each box side, so the side midpoints, where ports and orthogonal routes attach, lie on the outline).
 * Returns undefined when the point is the centre.
 */
export function clipToGraphOutline(box: Rect, shape: GraphOutlineShape, toward: GraphPoint): GraphPoint | undefined {
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2
  const dx = toward.x - cx, dy = toward.y - cy
  if (!dx && !dy) return undefined
  const a = box.width / 2, b = box.height / 2, ux = Math.abs(dx), uy = Math.abs(dy)
  let t: number
  if (shape === 'ellipse') t = 1 / Math.sqrt((ux / a) ** 2 + (uy / b) ** 2)
  else if (shape === 'diamond') t = 1 / (ux / a + uy / b)
  else {
    // The top and bottom edges, and the slanted edges x + q·y/b = a of the pointed ends.
    const q = hexagonInset(box.width, box.height)
    t = a / (ux + q * uy / b)
    if (uy) t = Math.min(t, b / uy)
  }
  return { x: cx + dx * t, y: cy + dy * t }
}

/**
 * Where the line through a point of a box side, perpendicular to that side, meets the outline of a shape inscribed in
 * the box: the end of an orthogonal route that leaves the side at that point.
 */
export function graphOutlineAlong(box: Rect, shape: GraphOutlineShape, point: GraphPoint, side: 'left' | 'right' | 'top' | 'bottom'): GraphPoint {
  const a = box.width / 2, b = box.height / 2, cx = box.x + a, cy = box.y + b
  const across = side === 'left' || side === 'right'
  // The distance from the centre along the side, relative to the half side.
  const t = Math.min(1, across ? Math.abs(point.y - cy) / b : Math.abs(point.x - cx) / a)
  const half = across ? a : b
  let reach: number
  if (shape === 'ellipse') reach = half * Math.sqrt(1 - t * t)
  else if (shape === 'diamond') reach = half * (1 - t)
  else {
    // The pointed ends are on the left and right; the top and bottom sides are straight between them.
    const q = hexagonInset(box.width, box.height), dx = t * a
    reach = across ? a - q * t : dx <= a - q ? b : b * (a - dx) / q
  }
  if (across) return { x: side === 'right' ? cx + reach : cx - reach, y: point.y }
  return { x: point.x, y: side === 'bottom' ? cy + reach : cy - reach }
}

/** The text anchors of a node label and detail centred in a shape of `height`; they match the box text at height 58. */
export function graphOutlineText(width: number, height: number, detail: boolean) {
  return { x: width / 2, title: height / 2 + (detail ? -5 : 5), detail: height / 2 + 14 }
}

const markerKinds: readonly string[] = ['arrow', 'open-arrow', 'circle', 'diamond', 'bar', 'none']

/** The marker at one end of an edge, with the defaults filled in. Throws RangeError for an unknown marker. */
export function graphEdgeMarker(edge: GraphEdge, end: 'start' | 'end'): GraphEdgeMarker {
  const value = end === 'end' ? edge.markerEnd : edge.markerStart
  if (value === undefined) return end === 'end' ? 'arrow' : 'none'
  if (!markerKinds.includes(value)) throw new RangeError(`Unknown edge marker on graph edge ${edge.id}: ${String(value)}`)
  return value
}

/**
 * How a marker is drawn in its 7 by 7 marker box (`refY` 3.5): `fill` paints the shape in the edge colour, `stroke`
 * outlines it, and `hollow` outlines it and fills it with the graph background.
 */
export interface GraphMarkerDrawing {
  refX: number
  paint: 'fill' | 'stroke' | 'hollow'
  strokeWidth?: number
  element: { tag: 'path'; d: string } | { tag: 'circle'; cx: number; cy: number; r: number }
}

const markerDrawings: Record<Exclude<GraphEdgeMarker, 'none'>, GraphMarkerDrawing> = {
  'arrow': { refX: 6, paint: 'fill', element: { tag: 'path', d: 'M 0 0 L 7 3.5 L 0 7 z' } },
  'open-arrow': { refX: 6, paint: 'stroke', strokeWidth: 1.2, element: { tag: 'path', d: 'M 1 0.8 L 6.2 3.5 L 1 6.2' } },
  'circle': { refX: 6.1, paint: 'hollow', strokeWidth: 1.1, element: { tag: 'circle', cx: 3.5, cy: 3.5, r: 2.6 } },
  'diamond': { refX: 6.4, paint: 'hollow', strokeWidth: 1.1, element: { tag: 'path', d: 'M 0.6 3.5 L 3.5 1.1 L 6.4 3.5 L 3.5 5.9 z' } },
  'bar': { refX: 6, paint: 'stroke', strokeWidth: 1.3, element: { tag: 'path', d: 'M 5.4 0.8 V 6.2' } },
}

export function graphMarkerDrawing(kind: Exclude<GraphEdgeMarker, 'none'>): GraphMarkerDrawing {
  return markerDrawings[kind]
}
