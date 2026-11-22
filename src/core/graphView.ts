import type { GraphLayout, GraphPoint } from './graph.js'
import { readPathSegments } from './graphPathData.js'
import { defaultLabelReach, rectsMeet } from './graphSpatial.js'
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

/**
 * Whether the interiors of two rectangles overlap: on each axis, each rectangle starts strictly before the other ends
 * (open intervals, compared exactly, without a tolerance). Rectangles that only touch, along an edge or at a corner,
 * do not intersect. A rectangle of zero width or height (a segment or a point) intersects a rectangle whose interior it
 * passes through, but not one whose border it only lies on, and never another zero-size rectangle at the same place.
 */
export function graphRectsIntersect(a: GraphRect, b: GraphRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

/**
 * Bounding rectangle of an SVG path string. The result can be larger than the drawn stroke but never smaller:
 * Bézier curves (C, S, Q and T, including the implicit reflected control point of S and T) are bounded by their
 * control points, which always contain the curve. Elliptical arcs are bounded exactly: the end points plus the
 * horizontal and vertical extrema of the rotated ellipse that fall inside the swept angle, after the radius
 * correction of the SVG implementation notes. Stroke width is not included. Returns undefined when the path has
 * no coordinates. Throws when the path data is malformed (including data that does not begin with a moveto) or uses
 * an unsupported command.
 */
export function graphPathBounds(path: string): GraphRect | undefined {
  return scanPath(path).bounds
}

/**
 * First and last point of an SVG path string: the point of its first moveto, and the current point after its last
 * segment (the subpath start after a closing Z). Returns undefined when the path has no coordinates. Throws like
 * `graphPathBounds` for malformed data.
 */
export function graphPathEndpoints(path: string): { start: GraphPoint; end: GraphPoint } | undefined {
  const { start, end } = scanPath(path)
  return start && end ? { start, end } : undefined
}

function scanPath(path: string): { bounds?: GraphRect; start?: GraphPoint; end?: GraphPoint } {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
  const include = (px: number, py: number) => {
    left = Math.min(left, px)
    top = Math.min(top, py)
    right = Math.max(right, px)
    bottom = Math.max(bottom, py)
  }
  let x = 0, y = 0
  let firstPoint: GraphPoint | undefined
  // Last control point of the previous segment, used to reflect the implicit control point of S and T.
  let controlKind: 'C' | 'Q' | undefined
  let controlX = 0, controlY = 0

  readPathSegments(path, 'strict', ({ command, x0, y0, args, x: nx, y: ny }) => {
    x = nx
    y = ny
    let nextKind: 'C' | 'Q' | undefined
    if (command === 'Z') {
      controlKind = undefined
      return
    }
    if (command === 'A') {
      includeArc(x0, y0, args[0]!, args[1]!, args[2]!, args[3] === 1, args[4] === 1, nx, ny, include)
    } else if (command === 'T') {
      // The control point is the reflection of the previous Q/T control point, else the current point.
      controlX = controlKind === 'Q' ? 2 * x0 - controlX : x0
      controlY = controlKind === 'Q' ? 2 * y0 - controlY : y0
      include(controlX, controlY)
      nextKind = 'Q'
    } else if (command === 'C' || command === 'S' || command === 'Q') {
      const count = args.length
      if (command === 'S') {
        // The first control point is the reflection of the previous C/S second control point, else the current point.
        include(controlKind === 'C' ? 2 * x0 - controlX : x0, controlKind === 'C' ? 2 * y0 - controlY : y0)
      }
      for (let i = 0; i < count - 2; i += 2) include(args[i]!, args[i + 1]!)
      controlX = args[count - 4]!
      controlY = args[count - 3]!
      nextKind = command === 'Q' ? 'Q' : 'C'
    } else if (command === 'M') firstPoint ??= { x: nx, y: ny }
    controlKind = nextKind
    include(nx, ny)
  })
  if (left === Infinity) return {}
  return { bounds: { x: left, y: top, width: right - left, height: bottom - top }, start: firstPoint, end: { x, y } }
}

/**
 * Adds the extent of an SVG elliptical arc from (x1, y1) to (x2, y2) to a bounding box, using the
 * endpoint-to-center conversion of the SVG 1.1 implementation notes (F.6.5 and F.6.6). The end points themselves
 * are added by the caller.
 */
function includeArc(
  x1: number, y1: number, rx: number, ry: number, angle: number, largeArc: boolean, sweep: boolean,
  x2: number, y2: number, include: (x: number, y: number) => void,
) {
  // An arc whose end points coincide is omitted, and one with a zero radius is a straight line.
  if (x1 === x2 && y1 === y2) return
  rx = Math.abs(rx)
  ry = Math.abs(ry)
  if (rx === 0 || ry === 0) return
  const phi = (angle % 360) * Math.PI / 180
  const cos = Math.cos(phi), sin = Math.sin(phi)
  const hx = (x1 - x2) / 2, hy = (y1 - y2) / 2
  const px = cos * hx + sin * hy, py = -sin * hx + cos * hy
  // Scale the radii up when they are too small to reach between the end points.
  const lambda = (px * px) / (rx * rx) + (py * py) / (ry * ry)
  if (lambda > 1) {
    const scale = Math.sqrt(lambda)
    rx *= scale
    ry *= scale
  }
  const rx2 = rx * rx, ry2 = ry * ry
  const denominator = rx2 * py * py + ry2 * px * px
  const radicand = Math.max(0, (rx2 * ry2 - denominator) / denominator)
  const coefficient = (largeArc !== sweep ? 1 : -1) * Math.sqrt(radicand)
  const qx = coefficient * rx * py / ry, qy = -coefficient * ry * px / rx
  const cx = cos * qx - sin * qy + (x1 + x2) / 2, cy = sin * qx + cos * qy + (y1 + y2) / 2
  const ux = (px - qx) / rx, uy = (py - qy) / ry
  const vx = (-px - qx) / rx, vy = (-py - qy) / ry
  const theta1 = Math.atan2(uy, ux)
  let delta = Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy)
  if (!sweep && delta > 0) delta -= 2 * Math.PI
  else if (sweep && delta < 0) delta += 2 * Math.PI
  // Parameter angles where dx/dθ = 0 and dy/dθ = 0 on the rotated ellipse, each with its opposite.
  const thetaX = Math.atan2(-ry * sin, rx * cos), thetaY = Math.atan2(ry * cos, rx * sin)
  const span = Math.abs(delta), direction = delta < 0 ? -1 : 1, turn = 2 * Math.PI, slack = 1e-12
  for (const theta of [thetaX, thetaX + Math.PI, thetaY, thetaY + Math.PI]) {
    const offset = (((theta - theta1) * direction) % turn + turn) % turn
    // A tiny slack keeps extrema that land on an end point despite rounding; including them only adds area.
    if (offset > span + slack && offset < turn - slack) continue
    const ct = Math.cos(theta), st = Math.sin(theta)
    include(cx + rx * cos * ct - ry * sin * st, cy + rx * sin * ct + ry * cos * st)
  }
}

/** Computes the bounding rectangle of every node and edge path in a layout. Edge labels are included. */
export function graphLayoutBounds(layout: Pick<GraphLayout, 'boxes' | 'paths' | 'edgeLabels'>, labelReach = defaultLabelReach): GraphBounds {
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
 * Selects the nodes and edges whose bounds intersect or touch `view` (closed intervals, unlike graphRectsIntersect): the
 * bounds leave out the stroke width, so an element whose bounds only touch the view edge can still draw into it. IDs
 * listed in `keep` are always included when they exist, which lets a caller retain the selected, focused or currently
 * edited elements.
 */
export function cullGraphElements(bounds: GraphBounds, view: GraphRect, keep: GraphCullKeep = {}): GraphVisibleIds {
  const nodes = new Set<string>(), edges = new Set<string>()
  for (const [id, rect] of bounds.nodes) if (rectsMeet(rect, view)) nodes.add(id)
  for (const [id, rect] of bounds.edges) if (rectsMeet(rect, view)) edges.add(id)
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
