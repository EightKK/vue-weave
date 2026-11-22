import {
  graphPortAnchor, type GraphBox, type GraphEdge, type GraphLayout, type GraphLayoutDirection, type GraphLayoutRoute, type GraphPoint, type GraphPort,
  type IdentifiedNode,
} from './graph.js'
import { graphPathEndpoints } from './graphView.js'
import { readPathSegments } from './graphPathData.js'
import { isGraphRouteValid, isOnGraphBoxSide, markBuiltinRoutes, type GraphRoutingPolicy } from './graphGeometry.js'
import { checkLayoutNumber } from './graphOptions.js'
import { assertGraphLayoutDirection, graphFlowSides } from './graphOrient.js'
import { assertGraphPortSide, graphSideAnchor, graphSideNormals as normals } from './graphPortSide.js'
import { clipToGraphOutline, graphOutlineAlong, graphOutlineShape, isGraphFlowchartShape } from './graphShapes.js'
import {
  buildGraphObstacleIndex, graphPolylineClear, resolveObstacleAvoidance, routeAroundObstacles, type GraphObstacleAvoidance,
  type GraphObstacleIndex, type ResolvedAvoidance,
} from './graphObstacleRouting.js'
import { unknownReferenceError } from './ids.js'

/** How NetworkGraph and `routeGraphEdges` draw edges. `curve` is the layout's own routing. */
export type GraphEdgeStyle = 'curve' | 'orthogonal' | 'straight'

const edgeStyles: readonly string[] = ['curve', 'orthogonal', 'straight']

export interface GraphEdgeRouteOptions {
  /**
   * Default 'curve': only edges with waypoints are rerouted, every other path is kept. An edge's own `edgeStyle`
   * overrides it for that edge.
   */
  style?: GraphEdgeStyle
  /** Layout direction; picks the sides an orthogonal edge leaves and enters. Default 'LR'. */
  direction?: GraphLayoutDirection
  /** Radius of the rounded corners of orthogonal routes, in chart units. Default 0 (sharp corners). */
  cornerRadius?: number
  /**
   * Default 'builtin'. 'preserve' keeps every path the layout drew while it still fits its nodes and ports (see
   * `isGraphRouteValid`), whatever the style, and routes only the other edges: edges with `points`, edges of moved or
   * resized nodes, edges whose port changed, and edges the port routing redrew.
   */
  policy?: GraphRoutingPolicy
  /**
   * Opt-in distance, in chart units, between parallel edges: edges between the same two nodes (in either direction)
   * that have no `points` and no named ports, and self-loops of one node without them. They are spread symmetrically
   * around the line between the box centres, in every style; self-loops are nested. A single edge is not changed.
   * Default undefined: parallel edges are drawn on top of each other.
   */
  parallelSpacing?: number
  /**
   * Opt-in: orthogonal edges without waypoints go around the node boxes, `true` for the defaults or the settings (see
   * `findOrthogonalRoute`). Every box of the layout is an obstacle, collapsed-group proxies included. An edge that has no
   * route around the boxes keeps the plain orthogonal route. Default undefined: routes do not avoid boxes.
   */
  avoidNodes?: boolean | GraphObstacleAvoidance
}

/**
 * Internal: the place of an edge among the parallel edges between the same two nodes, or among the self-loops of one
 * node. `reversed` is true when the edge runs from the node with the greater ID to the other one.
 */
export interface GraphParallelSlot {
  index: number
  count: number
  reversed: boolean
}

/**
 * Internal: the parallel slots of a list of edges, by edge ID. Edges without waypoints and named ports between the same
 * unordered pair of nodes (or self-loops of the same node) form a group in input order; an edge alone gets no slot.
 */
export function graphParallelSlots(edges: readonly GraphEdge[]): Map<string, GraphParallelSlot> {
  const groups = new Map<string, GraphEdge[]>()
  for (const edge of edges) {
    if (edge.points?.length || edge.fromPort !== undefined || edge.toPort !== undefined) continue
    const key = JSON.stringify(edge.from <= edge.to ? [edge.from, edge.to] : [edge.to, edge.from])
    let group = groups.get(key)
    if (!group) groups.set(key, group = [])
    group.push(edge)
  }
  const slots = new Map<string, GraphParallelSlot>()
  for (const group of groups.values()) {
    if (group.length < 2) continue
    group.forEach((edge, index) => slots.set(edge.id, { index, count: group.length, reversed: edge.from > edge.to }))
  }
  return slots
}

type Side = GraphPort['side']
type Anchor = GraphPoint & { side: Side }

// Length of the straight piece an orthogonal route keeps before it turns away from a node side.
const stub = 16

function horizontal(side: Side) {
  return side === 'left' || side === 'right'
}

function format(value: number) {
  return String(Math.round(value * 100) / 100 + 0)
}

function sidePoint(box: GraphBox, side: Side, offset = 0.5): Anchor {
  return { ...graphSideAnchor(box, side, offset), side }
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
// A node with an outline shape is entered at the middle of the side, which lies on its outline.
function sideFacing(box: GraphBox, toward: GraphPoint, outline = false): Anchor {
  const dx = (toward.x - box.x - box.width / 2) / (box.width / 2), dy = (toward.y - box.y - box.height / 2) / (box.height / 2)
  const clamp = (value: number, low: number, size: number) => {
    const inset = Math.min(6, size / 2)
    return Math.min(low + size - inset, Math.max(low + inset, value))
  }
  if (Math.abs(dx) >= Math.abs(dy)) {
    const side = dx >= 0 ? 'right' : 'left'
    return outline ? sidePoint(box, side) : { x: dx >= 0 ? box.x + box.width : box.x, y: clamp(toward.y, box.y, box.height), side }
  }
  const side = dy >= 0 ? 'bottom' : 'top'
  return outline ? sidePoint(box, side) : { x: clamp(toward.x, box.x, box.width), y: dy >= 0 ? box.y + box.height : box.y, side }
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
  checkLayoutNumber('cornerRadius', cornerRadius, 'nonnegative')
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

/**
 * One routed edge: its path, label anchor and the polyline (or curve control points) it was drawn through, and its
 * route metadata when it was drawn rather than kept.
 */
interface GraphEdgeRoute {
  path: string
  label: GraphPoint
  points: GraphPoint[]
  route?: GraphLayoutRoute
}

// The settings that apply to every edge of one routing call.
interface RouteSettings {
  style: GraphEdgeStyle
  direction: GraphLayoutDirection
  cornerRadius: number
  /** The parallel spacing; undefined leaves parallel edges as they are. */
  spacing?: number
  slots?: ReadonlyMap<string, GraphParallelSlot>
  /** Obstacle avoidance of orthogonal edges, with the obstacle index built on first use. */
  avoid?: { settings: ResolvedAvoidance; index: () => GraphObstacleIndex }
}

function centre(box: GraphBox): GraphPoint {
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}

// The distance of a parallel slot from the centre line when the slots are `step` apart.
function slotOffset(slot: GraphParallelSlot, step: number) {
  return (slot.index - (slot.count - 1) / 2) * step
}

// The point a parallel edge of the straight and curve styles is drawn through: the middle of the line between the box
// centres, moved sideways by the edge's offset. The sideways direction follows the node pair in ID order, so the edges of
// both directions are spread along one axis. Boxes with the same centre are spread across the layout direction.
function parallelWaypoint(source: GraphBox, target: GraphBox, slot: GraphParallelSlot, spacing: number, direction: GraphLayoutDirection) {
  const a = centre(slot.reversed ? target : source), b = centre(slot.reversed ? source : target)
  let nx = a.y - b.y, ny = b.x - a.x
  const length = Math.hypot(nx, ny)
  if (length) {
    nx /= length
    ny /= length
  } else if (direction === 'LR' || direction === 'RL') {
    nx = 0
    ny = 1
  } else {
    nx = 1
    ny = 0
  }
  const offset = slotOffset(slot, spacing)
  return { x: (a.x + b.x) / 2 + nx * offset, y: (a.y + b.y) / 2 + ny * offset }
}

// Unit directions of the segments of an axis-aligned route.
function segmentDirections(points: readonly GraphPoint[]) {
  const list: GraphPoint[] = []
  for (let i = 1; i < points.length; i++) {
    list.push({ x: Math.sign(points[i]!.x - points[i - 1]!.x), y: Math.sign(points[i]!.y - points[i - 1]!.y) })
  }
  return list
}

// The normal to the left of a direction, in the sense of `shiftRoute`.
function leftOf(direction: GraphPoint): GraphPoint {
  return { x: -direction.y, y: direction.x }
}

// An axis-aligned route without repeated points or straight runs (see `simplify`) moved sideways by `offset`: every
// segment moves along its normal and each corner moves to where its two moved segments meet, so the route stays
// axis-aligned and its ends slide along their box sides.
function shiftRoute(points: readonly GraphPoint[], offset: number): GraphPoint[] {
  const directions = segmentDirections(points)
  return points.map((point, i) => {
    const before = directions[i - 1], after = directions[i]
    const x = (before ? leftOf(before).x : 0) + (after ? leftOf(after).x : 0)
    const y = (before ? leftOf(before).y : 0) + (after ? leftOf(after).y : 0)
    return { x: point.x + offset * x, y: point.y + offset * y }
  })
}

// How far `shiftRoute` may move a route either way: every segment keeps at least 2 units of its direction and both ends
// stay at least 2 units away from the corners of their box sides.
function shiftLimit(points: readonly GraphPoint[], source: GraphBox, target: GraphBox) {
  const directions = segmentDirections(points), count = directions.length
  const along = (a: GraphPoint, b: GraphPoint) => leftOf(a).x * b.x + leftOf(a).y * b.y
  let limit = Infinity
  for (let i = 0; i < count; i++) {
    const direction = directions[i]!
    const change = Math.abs((i + 1 < count ? along(directions[i + 1]!, direction) : 0) - (i > 0 ? along(directions[i - 1]!, direction) : 0))
    const length = Math.abs(points[i + 1]!.x - points[i]!.x) + Math.abs(points[i + 1]!.y - points[i]!.y)
    if (change) limit = Math.min(limit, (length - 2) / change)
  }
  const room = (box: GraphBox, point: GraphPoint, direction: GraphPoint) => direction.x
    ? Math.min(point.y - box.y, box.y + box.height - point.y) - 2
    : Math.min(point.x - box.x, box.x + box.width - point.x) - 2
  if (count) {
    limit = Math.min(limit, room(source, points[0]!, directions[0]!), room(target, points[count]!, directions[count - 1]!))
  }
  return Math.max(0, limit)
}

// Self-loop `slot.index` of nested loops on one side of a box: each loop starts and ends further out along the side
// (`spacing` apart, closer when the side is short) and reaches `spacing` further away from it than the one before.
function nestedLoop(box: GraphBox, side: Side, slot: GraphParallelSlot, spacing: number): GraphPoint[] {
  const length = horizontal(side) ? box.height : box.width
  const near = 0.35 * length
  const step = slot.count > 1 ? Math.min(spacing, Math.max(0, near - 2) / (slot.count - 1)) : 0
  const shift = slot.index * step
  const a = sidePoint(box, side, (near - shift) / length), b = sidePoint(box, side, (length - near + shift) / length)
  const [nx, ny] = normals[side], reach = stub + slot.index * spacing
  const out = (point: GraphPoint) => horizontal(side)
    ? { x: detour(point.x + nx * reach, a.x, b.x), y: point.y }
    : { x: point.x, y: detour(point.y + ny * reach, a.y, b.y) }
  return [a, out(a), out(b), b]
}

function routeEdge(layout: GraphLayout, edge: GraphEdge, nodes: ReadonlyMap<string, IdentifiedNode>, settings: RouteSettings): GraphEdgeRoute | undefined {
  const { direction, cornerRadius, spacing } = settings
  const style = edge.edgeStyle ?? settings.style
  const source = layout.boxes.get(edge.from), target = layout.boxes.get(edge.to)
  if (!source) throw unknownReferenceError('node', 'graph edge ' + edge.id, edge.from)
  if (!target) throw unknownReferenceError('node', 'graph edge ' + edge.id, edge.to)
  const waypoints = edge.points ?? []
  for (const point of waypoints) {
    if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) throw new RangeError('Graph edge waypoints must be finite: ' + edge.id)
  }
  // A parallel slot only applies without waypoints and named ports (a preview can route an edge with new waypoints).
  const slot = spacing !== undefined && !waypoints.length && edge.fromPort === undefined && edge.toPort === undefined
    ? settings.slots?.get(edge.id) : undefined
  if (style === 'curve' && !waypoints.length && !slot) return undefined
  const port = (end: 'from' | 'to'): Anchor | undefined => {
    const id = end === 'from' ? edge.fromPort : edge.toPort
    const found = id === undefined ? undefined : nodes.get(edge[end])?.ports?.find(item => item.id === id)
    if (found) assertGraphPortSide(edge[end], found)
    return found && { ...graphPortAnchor(end === 'from' ? source : target, found), side: found.side }
  }
  const fromPort = port('from'), toPort = port('to')
  if (style === 'orthogonal' && !waypoints.length && !fromPort && !toPort && edge.from !== edge.to) {
    // Keep an axis-aligned route the layout already drew between the current boxes, such as a long-edge bypass lane.
    // The layered layout gives parallel long edges lanes of their own.
    const path = layout.paths.get(edge.id)
    if (path !== undefined && /^M[\d\s.,eE+-]+(?:[HV][\d\s.,eE+-]+)+$/.test(path)) {
      const ends = graphPathEndpoints(path)
      if (ends && isOnGraphBoxSide(source, ends.start) && isOnGraphBoxSide(target, ends.end)
        && (!settings.avoid || graphPolylineClear(settings.avoid.index(), axisPathPoints(path), new Set([edge.from, edge.to])))) {
        const label = layout.edgeLabels.get(edge.id)
        return { path, label: label ?? ends.start, points: [] }
      }
    }
  }
  // Where a straight line from the box centre towards a point leaves the node: its outline shape, or its box border.
  const clip = (box: GraphBox, id: string, toward: GraphPoint): Anchor => {
    const border = clipToBorder(box, toward)
    const shape = graphOutlineShape(nodes.get(id))
    const point = shape && clipToGraphOutline(box, shape, toward)
    return point ? { ...point, side: border.side } : border
  }
  let points: GraphPoint[]
  // The bend points of a curve: the waypoints, or the point that spreads a parallel edge.
  let through: readonly GraphPoint[] = waypoints
  if (edge.from === edge.to && !waypoints.length) {
    // A self-loop is a bracket on the direction's outgoing side, or between its ports.
    const side = graphFlowSides(direction).exit
    if (slot) points = nestedLoop(source, side, slot, spacing!)
    else {
      const a = fromPort ?? sidePoint(source, side, 0.35)
      let b = toPort ?? sidePoint(source, side, 0.65)
      if (a.x === b.x && a.y === b.y) b = sidePoint(source, side, a === fromPort ? 0.8 : 0.65)
      points = connect(a, b)
    }
  } else if (style === 'orthogonal') {
    if (waypoints.length) {
      const a = fromPort ?? sideFacing(source, waypoints[0]!, Boolean(graphOutlineShape(nodes.get(edge.from))))
      const b = toPort ?? sideFacing(target, waypoints[waypoints.length - 1]!, Boolean(graphOutlineShape(nodes.get(edge.to))))
      points = connectThrough(a, waypoints, b)
    } else {
      const [fromSide, toSide] = defaultSides(source, target, direction)
      const a = fromPort ?? sidePoint(source, fromSide), b = toPort ?? sidePoint(target, toSide)
      const avoided = settings.avoid && routeAroundObstacles(settings.avoid.index(), a, b, settings.avoid.settings.bendPenalty)
      // The route keeps the sides of its ends, which `sides` below reads from the first and last point.
      points = avoided ? [a, ...avoided.slice(1, -1), b] : connect(a, b)
    }
  } else {
    if (slot) through = [parallelWaypoint(source, target, slot, spacing!, direction)]
    const a = fromPort ?? clip(source, edge.from, through[0] ?? toPort ?? centre(target))
    const b = toPort ?? clip(target, edge.to, through[through.length - 1] ?? fromPort ?? centre(source))
    points = [a, ...through, b]
  }
  const sides = { from: (points[0] as Partial<Anchor>).side, to: (points[points.length - 1] as Partial<Anchor>).side }
  points = simplify(points)
  if (slot && style === 'orthogonal' && edge.from !== edge.to) {
    // Parallel orthogonal edges are the same route shifted sideways, closer together when the route or the sides are short.
    const step = slot.count > 1 ? Math.min(spacing!, shiftLimit(points, source, target) / ((slot.count - 1) / 2)) : 0
    const offset = slotOffset(slot, step)
    // The route of the reverse direction is the same route reversed, whose left is the other side.
    points = shiftRoute(points, slot.reversed ? -offset : offset)
  }
  const flowchart = (id: string) => isGraphFlowchartShape(graphOutlineShape(nodes.get(id)))
  const spreadOrLoop = (slot && style === 'orthogonal') || (edge.from === edge.to && !waypoints.length)
  if (spreadOrLoop || (style === 'orthogonal' && (flowchart(edge.from) || flowchart(edge.to)))) {
    // Self-loops and spread orthogonal edges leave their sides away from the middle, and flowchart shapes need not touch
    // the middle of a side, so an end that is not at a port is moved along its first (or last) leg onto the outline.
    const attach = (point: GraphPoint, next: GraphPoint | undefined, id: string, side: Side | undefined) => {
      const shape = graphOutlineShape(nodes.get(id))
      if (!shape || (!spreadOrLoop && !isGraphFlowchartShape(shape))) return point
      if (!side || !next || (horizontal(side) ? next.y !== point.y : next.x !== point.x)) return point
      return graphOutlineAlong(layout.boxes.get(id)!, shape, point, side)
    }
    const last = points.length - 1
    if (!fromPort) points[0] = attach(points[0]!, points[1], edge.from, sides.from)
    if (!toPort) points[last] = attach(points[last]!, points[last - 1], edge.to, sides.to)
  }
  const start = points[0]!, end = points[points.length - 1]!
  const middle = halfway(points)
  const path = style === 'curve' ? graphSmoothPath(points) : graphPolylinePath(points, style === 'orthogonal' ? cornerRadius : 0)
  // A curve records the points it was drawn through: its waypoints, the spreading point or the corners of a loop.
  const bends = style !== 'curve' || (edge.from === edge.to && !through.length) ? points.slice(1, -1) : through
  const route: GraphLayoutRoute = {
    start: { x: start.x, y: start.y }, end: { x: end.x, y: end.y }, fromPort: edge.fromPort, toPort: edge.toPort,
    fromSide: sides.from, toSide: sides.to, points: bends.map(point => ({ x: point.x, y: point.y })),
  }
  return { path, label: { x: middle.x, y: middle.y - 6 }, points, route }
}

function validateRouteOptions(options: GraphEdgeRouteOptions) {
  const { style = 'curve', direction = 'LR', cornerRadius = 0, policy = 'builtin', parallelSpacing, avoidNodes } = options
  if (!edgeStyles.includes(style)) throw new RangeError('Unknown edge style: ' + style)
  if (policy !== 'builtin' && policy !== 'preserve') throw new RangeError('Unknown routing policy: ' + String(policy))
  assertGraphLayoutDirection(direction)
  checkLayoutNumber('cornerRadius', cornerRadius, 'nonnegative')
  if (parallelSpacing !== undefined) checkLayoutNumber('parallelSpacing', parallelSpacing, 'positive')
  return { style, direction, cornerRadius, policy, spacing: parallelSpacing, avoid: resolveObstacleAvoidance(avoidNodes) }
}

// The points of an absolute path of M, H and V commands, such as a long-edge bypass lane. The path must be valid.
function axisPathPoints(path: string): GraphPoint[] {
  const points: GraphPoint[] = []
  readPathSegments(path, 'strict', ({ x, y }) => points.push({ x, y }))
  return points
}

// Obstacle indexes by box map, for callers that route the edges of one immutable box map in several calls.
const obstacleIndexes = new WeakMap<ReadonlyMap<string, GraphBox>, Map<number, GraphObstacleIndex>>()

/**
 * Reroutes the edges of a finished layout (after positions and sizes) in an edge style: the `style` option, or the
 * edge's own `edgeStyle`. `straight` draws straight lines between the nodes, clipped on the line between the box
 * centres to the box border, or to the outline of a `diamond`, `ellipse` or `hexagon` node; `orthogonal` draws
 * axis-aligned segments that leave and enter along the layout direction and keeps a long-edge bypass lane the layout
 * already drew between the current boxes. Named ports keep their anchors and sides. An edge with `points` goes through
 * its waypoints in every style, smoothly in `curve`. With `curve`, edges without waypoints keep their paths, so the
 * result is the input layout when no edge has waypoints, a style of its own or (with `parallelSpacing`) a parallel edge.
 * With `parallelSpacing`, parallel edges are spread apart (see `GraphEdgeRouteOptions`). With `policy: 'preserve'` every
 * valid path from the layout is kept, whatever the style, and is not spread. Route metadata (`layout.routes`) is carried
 * over when the layout has it, with the entries of redrawn edges replaced. Throws Error for an unknown endpoint,
 * RangeError for a non-finite waypoint, an unknown style (of the options or of an edge), direction or policy, a bad
 * corner radius or a parallel spacing that is not a positive finite number. Boxes are kept; width and height grow to
 * include the routes. With `avoidNodes`, orthogonal edges without waypoints (self-loops excepted) are routed around every
 * box of the layout with `findOrthogonalRoute`, and a bypass lane is kept only while it crosses no other box; an edge
 * without such a route keeps the plain orthogonal route. A bad `avoidNodes` value throws RangeError.
 */
export function routeGraphEdges(
  layout: GraphLayout, edges: readonly GraphEdge[], nodes: ReadonlyMap<string, IdentifiedNode>, options: GraphEdgeRouteOptions = {},
): GraphLayout {
  return routeGraphEdgesWithSlots(layout, edges, nodes, options, options.parallelSpacing === undefined ? undefined : graphParallelSlots(edges))
}

/**
 * Internal: `routeGraphEdges` with the parallel slots of another edge list, so NetworkGraph can route a few edges of a
 * graph the way the whole graph routes them. Without `parallelSpacing` the slots are ignored. With `reuseObstacles`, the
 * obstacle index of `avoidNodes` is cached per box map, which the caller must then never change.
 */
export function routeGraphEdgesWithSlots(
  layout: GraphLayout, edges: readonly GraphEdge[], nodes: ReadonlyMap<string, IdentifiedNode>, options: GraphEdgeRouteOptions,
  slots: ReadonlyMap<string, GraphParallelSlot> | undefined, reuseObstacles = false,
): GraphLayout {
  const { style, direction, cornerRadius, policy, spacing, avoid: avoidance } = validateRouteOptions(options)
  for (const edge of edges) {
    if (edge.edgeStyle !== undefined && !edgeStyles.includes(edge.edgeStyle)) {
      throw new RangeError(`Unknown edge style on graph edge ${edge.id}: ${String(edge.edgeStyle)}`)
    }
  }
  const active = spacing === undefined ? undefined : slots
  let obstacles: GraphObstacleIndex | undefined
  const avoid = avoidance && {
    settings: avoidance,
    index: () => {
      if (obstacles) return obstacles
      const cache = reuseObstacles ? obstacleIndexes.get(layout.boxes) ?? new Map<number, GraphObstacleIndex>() : undefined
      if (cache) obstacleIndexes.set(layout.boxes, cache)
      obstacles = cache?.get(avoidance.clearance) ?? buildGraphObstacleIndex(layout.boxes, avoidance.clearance)
      cache?.set(avoidance.clearance, obstacles)
      return obstacles
    },
  }
  const settings: RouteSettings = { style, direction, cornerRadius, spacing, slots: active, avoid }
  if (style === 'curve' && !edges.some(edge => edge.points?.length || (edge.edgeStyle ?? style) !== 'curve' || active?.has(edge.id))) {
    return layout
  }
  const paths = new Map(layout.paths)
  const edgeLabels = new Map(layout.edgeLabels)
  const routes = layout.routes && new Map(layout.routes)
  const redrawn: string[] = []
  let { width, height } = layout
  for (const edge of edges) {
    if (policy === 'preserve' && isGraphRouteValid(layout, nodes, edge)) continue
    const route = routeEdge(layout, edge, nodes, settings)
    if (!route) continue
    paths.set(edge.id, route.path)
    edgeLabels.set(edge.id, route.label)
    if (route.route) {
      routes?.set(edge.id, route.route)
      redrawn.push(edge.id)
    }
    for (const point of route.points) {
      width = Math.max(width, point.x + 8)
      height = Math.max(height, point.y + 8)
    }
  }
  return markBuiltinRoutes({ boxes: layout.boxes, paths, edgeLabels, width, height, ...routes && { routes } }, layout, redrawn)
}
