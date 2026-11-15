import { graphPortAnchor, type GraphBox, type GraphEdge, type GraphLayout, type GraphLayoutDirection, type GraphPoint, type GraphPort, type IdentifiedNode } from './graph.js'
import { graphPathEndpoints } from './graphView.js'
import { assertGraphPortSide } from './graphPortSide.js'

/** How NetworkGraph and `routeGraphEdges` draw edges. `curve` is the layout's own routing. */
export type GraphEdgeStyle = 'curve' | 'orthogonal' | 'straight'

export interface GraphEdgeRouteOptions {
  /** Default 'curve': only edges with waypoints are rerouted, every other path is kept. */
  style?: GraphEdgeStyle
  /** Layout direction; picks the sides an orthogonal edge leaves and enters. Default 'LR'. */
  direction?: GraphLayoutDirection
  /** Radius of the rounded corners of orthogonal routes, in chart units. Default 0 (sharp corners). */
  cornerRadius?: number
}

type Side = GraphPort['side']
type Anchor = GraphPoint & { side: Side }

const normals: Record<Side, readonly [number, number]> = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] }
// Length of the straight piece an orthogonal route keeps before it turns away from a node side.
const stub = 16

function horizontal(side: Side) {
  return side === 'left' || side === 'right'
}

function format(value: number) {
  return String(Math.round(value * 100) / 100 + 0)
}

function sidePoint(box: GraphBox, side: Side, offset = 0.5): Anchor {
  return { ...graphPortAnchor(box, { id: '', side, offset }), side }
}

// Where the ray from the box centre towards a point leaves the box.
function clipToBorder(box: GraphBox, toward: GraphPoint): Anchor {
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2
  const dx = toward.x - cx, dy = toward.y - cy
  if (!dx && !dy) return { x: box.x + box.width, y: cy, side: 'right' }
  const tx = dx ? box.width / 2 / Math.abs(dx) : Infinity, ty = dy ? box.height / 2 / Math.abs(dy) : Infinity
  const t = Math.min(tx, ty)
  return { x: cx + dx * t, y: cy + dy * t, side: tx <= ty ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'bottom' : 'top') }
}

// The side facing a point, at the point's height (or width) when the side spans it, so the first leg can be straight.
function sideFacing(box: GraphBox, toward: GraphPoint): Anchor {
  const dx = (toward.x - box.x - box.width / 2) / (box.width / 2), dy = (toward.y - box.y - box.height / 2) / (box.height / 2)
  const clamp = (value: number, low: number, size: number) => {
    const inset = Math.min(6, size / 2)
    return Math.min(low + size - inset, Math.max(low + inset, value))
  }
  if (Math.abs(dx) >= Math.abs(dy)) {
    return { x: dx >= 0 ? box.x + box.width : box.x, y: clamp(toward.y, box.y, box.height), side: dx >= 0 ? 'right' : 'left' }
  }
  return { x: clamp(toward.x, box.x, box.width), y: dy >= 0 ? box.y + box.height : box.y, side: dy >= 0 ? 'bottom' : 'top' }
}

// Sides an orthogonal edge without waypoints leaves and enters: facing each other along the layout axis, or both on the
// direction's outgoing side when the boxes overlap along that axis.
function defaultSides(source: GraphBox, target: GraphBox, direction: GraphLayoutDirection): [Side, Side] {
  if (direction === 'LR' || direction === 'RL') {
    if (target.x >= source.x + source.width) return ['right', 'left']
    if (source.x >= target.x + target.width) return ['left', 'right']
    return direction === 'LR' ? ['right', 'right'] : ['left', 'left']
  }
  if (target.y >= source.y + source.height) return ['bottom', 'top']
  if (source.y >= target.y + target.height) return ['top', 'bottom']
  return direction === 'TB' ? ['bottom', 'bottom'] : ['top', 'top']
}

// A detour coordinate along one axis. In a layout at nonnegative coordinates it stays at or above 0, inside the chart;
// when either anchor lies at a negative coordinate (a caller-supplied layout) the chart does not start at 0 and the
// detour keeps its full stub.
function detour(value: number, a: number, b: number) {
  return a < 0 || b < 0 ? value : Math.max(0, value)
}

// Axis-aligned route between two anchors without waypoints. `b.side` is the side the route enters.
function connect(a: Anchor, b: Anchor): GraphPoint[] {
  const [ax, ay] = normals[a.side], [bx, by] = normals[b.side]
  if (horizontal(a.side) && horizontal(b.side)) {
    if (ax !== bx && (b.x - a.x) * ax >= 0) {
      const x = (a.x + b.x) / 2
      return [a, { x, y: a.y }, { x, y: b.y }, b]
    }
    if (ax === bx) {
      const x = detour(ax > 0 ? Math.max(a.x, b.x) + stub : Math.min(a.x, b.x) - stub, a.x, b.x)
      return [a, { x, y: a.y }, { x, y: b.y }, b]
    }
    const xa = detour(a.x + ax * stub, a.x, b.x), xb = detour(b.x + bx * stub, a.x, b.x), y = (a.y + b.y) / 2
    return [a, { x: xa, y: a.y }, { x: xa, y }, { x: xb, y }, { x: xb, y: b.y }, b]
  }
  if (!horizontal(a.side) && !horizontal(b.side)) {
    if (ay !== by && (b.y - a.y) * ay >= 0) {
      const y = (a.y + b.y) / 2
      return [a, { x: a.x, y }, { x: b.x, y }, b]
    }
    if (ay === by) {
      const y = detour(ay > 0 ? Math.max(a.y, b.y) + stub : Math.min(a.y, b.y) - stub, a.y, b.y)
      return [a, { x: a.x, y }, { x: b.x, y }, b]
    }
    const ya = detour(a.y + ay * stub, a.y, b.y), yb = detour(b.y + by * stub, a.y, b.y), x = (a.x + b.x) / 2
    return [a, { x: a.x, y: ya }, { x, y: ya }, { x, y: yb }, { x: b.x, y: yb }, b]
  }
  if (horizontal(a.side)) {
    const corner = { x: b.x, y: a.y }
    if ((corner.x - a.x) * ax >= 0 && (corner.y - b.y) * by >= 0) return [a, corner, b]
    const x = detour(a.x + ax * stub, a.x, b.x), y = detour(b.y + by * stub, a.y, b.y)
    return [a, { x, y: a.y }, { x, y }, { x: b.x, y }, b]
  }
  const corner = { x: a.x, y: b.y }
  if ((corner.y - a.y) * ay >= 0 && (corner.x - b.x) * bx >= 0) return [a, corner, b]
  const y = detour(a.y + ay * stub, a.y, b.y), x = detour(b.x + bx * stub, a.x, b.x)
  return [a, { x: a.x, y }, { x, y }, { x, y: b.y }, b]
}

// Axis-aligned route through waypoints: each leg turns once, and the last leg enters along the target side's normal.
function connectThrough(a: Anchor, waypoints: readonly GraphPoint[], b: Anchor): GraphPoint[] {
  const points: GraphPoint[] = [a]
  let current: GraphPoint = a, alongX = horizontal(a.side)
  for (const point of waypoints) {
    const corner = alongX ? { x: point.x, y: current.y } : { x: current.x, y: point.y }
    points.push(corner, point)
    // The leg ends along the other axis unless it was straight.
    if (alongX ? point.y !== current.y : point.x !== current.x) alongX = !alongX
    current = point
  }
  points.push(horizontal(b.side) ? { x: current.x, y: b.y } : { x: b.x, y: current.y }, b)
  return points
}

function assertFinitePoints(points: readonly GraphPoint[]) {
  for (const point of points) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new RangeError('Path points must have finite x and y')
  }
}

function simplify(points: readonly GraphPoint[]): GraphPoint[] {
  const result: GraphPoint[] = []
  for (const point of points) {
    const last = result[result.length - 1]
    if (last && Math.abs(last.x - point.x) < 1e-9 && Math.abs(last.y - point.y) < 1e-9) continue
    const before = result[result.length - 2]
    // Drop a middle point on a straight axis-aligned run.
    if (before && last && ((before.x === last.x && last.x === point.x) || (before.y === last.y && last.y === point.y))) result.pop()
    result.push({ x: point.x, y: point.y })
  }
  return result
}

/**
 * SVG path data of a polyline through `points`. A positive `cornerRadius` rounds each corner with a quadratic curve,
 * never cutting more than half of either adjoining segment. Throws RangeError for a non-finite point or a negative or
 * non-finite corner radius.
 */
export function graphPolylinePath(points: readonly GraphPoint[], cornerRadius = 0): string {
  if (!Number.isFinite(cornerRadius) || cornerRadius < 0) throw new RangeError('cornerRadius must be finite and nonnegative')
  assertFinitePoints(points)
  if (!points.length) return ''
  const first = points[0]!
  let path = `M ${format(first.x)} ${format(first.y)}`
  for (let i = 1; i < points.length; i++) {
    const point = points[i]!, next = points[i + 1]
    if (!next || cornerRadius === 0) {
      path += ` L ${format(point.x)} ${format(point.y)}`
      continue
    }
    const previous = points[i - 1]!
    const lengthIn = Math.hypot(point.x - previous.x, point.y - previous.y), lengthOut = Math.hypot(next.x - point.x, next.y - point.y)
    const radius = Math.min(cornerRadius, lengthIn / 2, lengthOut / 2)
    if (!(radius > 0)) {
      path += ` L ${format(point.x)} ${format(point.y)}`
      continue
    }
    const start = { x: point.x + (previous.x - point.x) * radius / lengthIn, y: point.y + (previous.y - point.y) * radius / lengthIn }
    const end = { x: point.x + (next.x - point.x) * radius / lengthOut, y: point.y + (next.y - point.y) * radius / lengthOut }
    path += ` L ${format(start.x)} ${format(start.y)} Q ${format(point.x)} ${format(point.y)} ${format(end.x)} ${format(end.y)}`
  }
  return path
}

/**
 * SVG path data of a smooth curve through every point (a Catmull-Rom spline drawn with cubic Bézier segments). Throws
 * RangeError for a non-finite point.
 */
export function graphSmoothPath(points: readonly GraphPoint[]): string {
  assertFinitePoints(points)
  if (!points.length) return ''
  const at = (index: number) => points[Math.max(0, Math.min(points.length - 1, index))]!
  let path = `M ${format(points[0]!.x)} ${format(points[0]!.y)}`
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2)
    const c1 = { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 }
    const c2 = { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 }
    path += ` C ${format(c1.x)} ${format(c1.y)}, ${format(c2.x)} ${format(c2.y)}, ${format(p2.x)} ${format(p2.y)}`
  }
  return path
}

// The point halfway along a polyline.
function halfway(points: readonly GraphPoint[]): GraphPoint {
  let total = 0
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i]!.x - points[i - 1]!.x, points[i]!.y - points[i - 1]!.y)
  let remaining = total / 2
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!
    const length = Math.hypot(b.x - a.x, b.y - a.y)
    if (length >= remaining && length > 0) return { x: a.x + (b.x - a.x) * remaining / length, y: a.y + (b.y - a.y) * remaining / length }
    remaining -= length
  }
  return points[0] ?? { x: 0, y: 0 }
}

function onBorder(box: GraphBox, point: GraphPoint) {
  const near = (a: number, b: number) => Math.abs(a - b) <= 0.5
  const withinX = point.x >= box.x - 0.5 && point.x <= box.x + box.width + 0.5
  const withinY = point.y >= box.y - 0.5 && point.y <= box.y + box.height + 0.5
  return ((near(point.x, box.x) || near(point.x, box.x + box.width)) && withinY)
    || ((near(point.y, box.y) || near(point.y, box.y + box.height)) && withinX)
}

/** One routed edge: its path, label anchor and the polyline (or curve control points) it was drawn through. */
interface GraphEdgeRoute {
  path: string
  label: GraphPoint
  points: GraphPoint[]
}

function routeEdge(
  layout: GraphLayout, edge: GraphEdge, nodes: ReadonlyMap<string, IdentifiedNode>, style: GraphEdgeStyle, direction: GraphLayoutDirection, cornerRadius: number,
): GraphEdgeRoute | undefined {
  const source = layout.boxes.get(edge.from), target = layout.boxes.get(edge.to)
  if (!source || !target) throw new Error('Unknown endpoint on graph edge: ' + edge.id)
  const waypoints = edge.points ?? []
  for (const point of waypoints) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new RangeError('Graph edge waypoints must be finite: ' + edge.id)
  }
  if (style === 'curve' && !waypoints.length) return undefined
  const port = (end: 'from' | 'to'): Anchor | undefined => {
    const id = end === 'from' ? edge.fromPort : edge.toPort
    const found = id === undefined ? undefined : nodes.get(edge[end])?.ports?.find(item => item.id === id)
    if (found) assertGraphPortSide(edge[end], found)
    return found && { ...graphPortAnchor(end === 'from' ? source : target, found), side: found.side }
  }
  const fromPort = port('from'), toPort = port('to')
  if (style === 'orthogonal' && !waypoints.length && !fromPort && !toPort && edge.from !== edge.to) {
    // Keep an axis-aligned route the layout already drew between the current boxes, such as a long-edge bypass lane.
    const path = layout.paths.get(edge.id)
    if (path !== undefined && /^M[\d\s.,eE+-]+(?:[HV][\d\s.,eE+-]+)+$/.test(path)) {
      const ends = graphPathEndpoints(path)
      if (ends && onBorder(source, ends.start) && onBorder(target, ends.end)) {
        const label = layout.edgeLabels.get(edge.id)
        return { path, label: label ?? ends.start, points: [] }
      }
    }
  }
  let points: GraphPoint[]
  if (edge.from === edge.to && !waypoints.length) {
    // A self-loop is a bracket on the direction's outgoing side, or between its ports.
    const side: Side = direction === 'LR' ? 'right' : direction === 'RL' ? 'left' : direction === 'TB' ? 'bottom' : 'top'
    const a = fromPort ?? sidePoint(source, side, 0.35)
    let b = toPort ?? sidePoint(source, side, 0.65)
    if (a.x === b.x && a.y === b.y) b = sidePoint(source, side, a === fromPort ? 0.8 : 0.65)
    points = connect(a, b)
  } else if (style === 'orthogonal') {
    if (waypoints.length) {
      const a = fromPort ?? sideFacing(source, waypoints[0]!), b = toPort ?? sideFacing(target, waypoints[waypoints.length - 1]!)
      points = connectThrough(a, waypoints, b)
    } else {
      const [fromSide, toSide] = defaultSides(source, target, direction)
      points = connect(fromPort ?? sidePoint(source, fromSide), toPort ?? sidePoint(target, toSide))
    }
  } else {
    const centre = (box: GraphBox) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 })
    const a = fromPort ?? clipToBorder(source, waypoints[0] ?? toPort ?? centre(target))
    const b = toPort ?? clipToBorder(target, waypoints[waypoints.length - 1] ?? fromPort ?? centre(source))
    points = [a, ...waypoints, b]
  }
  points = simplify(points)
  const middle = halfway(points)
  const path = style === 'curve' ? graphSmoothPath(points) : graphPolylinePath(points, style === 'orthogonal' ? cornerRadius : 0)
  return { path, label: { x: middle.x, y: middle.y - 6 }, points }
}

/**
 * Reroutes the edges of a finished layout (after positions and sizes) in an edge style. `straight` draws straight lines
 * between the box borders, clipped on the line between the box centres; `orthogonal` draws axis-aligned segments that
 * leave and enter along the layout direction and keeps a long-edge bypass lane the layout already drew between the
 * current boxes. Named ports keep their anchors and sides. An edge with `points` goes through its waypoints in every
 * style, smoothly in `curve`. With `curve`, edges without waypoints keep their paths, so the result is the input layout
 * when no edge has waypoints. Throws Error for an unknown endpoint, RangeError for a non-finite waypoint, an unknown
 * style or direction, or a bad corner radius. Boxes are kept; width and height grow to include the routes.
 */
export function routeGraphEdges(
  layout: GraphLayout, edges: readonly GraphEdge[], nodes: ReadonlyMap<string, IdentifiedNode>, options: GraphEdgeRouteOptions = {},
): GraphLayout {
  const { style = 'curve', direction = 'LR', cornerRadius = 0 } = options
  if (!['curve', 'orthogonal', 'straight'].includes(style)) throw new RangeError('Unknown edge style: ' + style)
  if (!['LR', 'TB', 'RL', 'BT'].includes(direction)) throw new RangeError('Unknown layout direction')
  if (!Number.isFinite(cornerRadius) || cornerRadius < 0) throw new RangeError('cornerRadius must be finite and nonnegative')
  if (style === 'curve' && !edges.some(edge => edge.points?.length)) return layout
  const paths = new Map(layout.paths)
  const edgeLabels = new Map(layout.edgeLabels)
  let { width, height } = layout
  for (const edge of edges) {
    const route = routeEdge(layout, edge, nodes, style, direction, cornerRadius)
    if (!route) continue
    paths.set(edge.id, route.path)
    edgeLabels.set(edge.id, route.label)
    for (const point of route.points) {
      width = Math.max(width, point.x + 8)
      height = Math.max(height, point.y + 8)
    }
  }
  return { boxes: layout.boxes, paths, edgeLabels, width, height }
}
