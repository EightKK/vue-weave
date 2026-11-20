import type { GraphPoint, GraphPort } from './graph.js'
import { heapPop, heapPush } from './graphHeap.js'
import { isGraphPortSide } from './graphPortSide.js'
import { SpatialGrid, type SpatialRect } from './graphSpatial.js'
import type { GraphRect } from './graphView.js'

type Side = GraphPort['side']

/** One end of an orthogonal route: a point on a node border and the side of the node it leaves or enters through. */
export interface GraphRouteEnd extends GraphPoint {
  side: Side
}

/** Settings of obstacle-avoiding orthogonal routing (`findOrthogonalRoute`, `routeGraphEdges`, NetworkGraph `avoidNodes`). */
export interface GraphObstacleAvoidance {
  /** Distance in chart units that routes keep from every box. Finite and nonnegative. Default 8. */
  clearance?: number
  /** Extra cost of each bend, in chart units of length. Finite and nonnegative. Default 24. */
  bendPenalty?: number
}

// Directions: 0 right (+x), 1 down (+y), 2 left (-x), 3 up (-y).
const DX = [1, 0, -1, 0] as const
const DY = [0, 1, 0, -1] as const
const sideDirection: Record<Side, number> = { right: 0, bottom: 1, left: 2, top: 3 }
// Expanded search states per region before a search gives up, so a boxed-in end cannot scan the whole graph.
const maxExpansions = 200_000
// Regions with at most this many search states use typed arrays.
const denseLimit = 2 ** 16
const eps = 1e-9

type Rect = SpatialRect

/**
 * Internal: obstacle boxes grown by the clearance, in a uniform bucket grid (`SpatialGrid`, indexed like `inflated`)
 * for segment queries. Built once per routing call in O(n) for n boxes.
 */
export interface GraphObstacleIndex {
  ids: readonly string[]
  raw: readonly Rect[]
  inflated: readonly Rect[]
  clearance: number
  cell: number
  grid: SpatialGrid
  /** Sorted distinct x and y coordinates of the grown boxes' edges. */
  xBorders: readonly number[]
  yBorders: readonly number[]
  /** Bounds of the grown boxes; undefined without boxes. */
  bounds?: Rect
  /** Whether every box lies at nonnegative coordinates, so routes stay at or above 0 as the other routes do. */
  nonnegative: boolean
}

export interface ResolvedAvoidance {
  clearance: number
  bendPenalty: number
}

/** Internal: validates the `avoidNodes` option; undefined when avoidance is off. */
export function resolveObstacleAvoidance(value: unknown, name = 'avoidNodes'): ResolvedAvoidance | undefined {
  if (value === undefined || value === false) return undefined
  if (value !== true && (value === null || typeof value !== 'object')) {
    throw new RangeError(name + ' must be a boolean or an options object')
  }
  const { clearance = 8, bendPenalty = 24 } = value === true ? {} : value as GraphObstacleAvoidance
  if (typeof clearance !== 'number' || !Number.isFinite(clearance) || clearance < 0) {
    throw new RangeError('clearance must be finite and nonnegative')
  }
  if (typeof bendPenalty !== 'number' || !Number.isFinite(bendPenalty) || bendPenalty < 0) {
    throw new RangeError('bendPenalty must be finite and nonnegative')
  }
  return { clearance, bendPenalty }
}

/** Internal: indexes boxes (in iteration order) as obstacles grown by `clearance`. */
export function buildGraphObstacleIndex(boxes: Iterable<readonly [string, GraphRect]>, clearance: number): GraphObstacleIndex {
  const ids: string[] = [], raw: Rect[] = [], inflated: Rect[] = []
  let size = 0, nonnegative = true
  let bounds: Rect | undefined
  for (const [id, box] of boxes) {
    const x2 = box.x + box.width, y2 = box.y + box.height
    const rect = { x1: box.x - clearance, y1: box.y - clearance, x2: x2 + clearance, y2: y2 + clearance }
    ids.push(id)
    raw.push({ x1: box.x, y1: box.y, x2, y2 })
    inflated.push(rect)
    if (box.x < 0 || box.y < 0) nonnegative = false
    size += (rect.x2 - rect.x1 + rect.y2 - rect.y1) / 2
    bounds = bounds
      ? { x1: Math.min(bounds.x1, rect.x1), y1: Math.min(bounds.y1, rect.y1), x2: Math.max(bounds.x2, rect.x2), y2: Math.max(bounds.y2, rect.y2) }
      : { ...rect }
  }
  const cell = Math.max(1, ids.length ? size / ids.length : 1)
  const grid = new SpatialGrid(cell)
  for (const rect of inflated) grid.insert(rect)
  const xBorders = sortedUnique(inflated.flatMap(rect => [rect.x1, rect.x2]))
  const yBorders = sortedUnique(inflated.flatMap(rect => [rect.y1, rect.y2]))
  return { ids, raw, inflated, clearance, cell, grid, xBorders, yBorders, bounds, nonnegative }
}

// Calls `visit` once with every obstacle whose bucket overlaps the rectangle, until it returns true. The callers test
// the exact geometry, so visiting each obstacle once gives the same answers as any other visiting order.
function visitNear(index: GraphObstacleIndex, area: Rect, visit: (id: number) => boolean | void): boolean {
  return index.grid.visit(area, visit)
}

// Per-route exceptions: an obstacle grown around an end is tested at its own size (1), or ignored (0) when even its
// box holds the end, so ends close to other nodes can still be reached.
type Overrides = ReadonlyMap<number, 0 | 1>

function rectOf(index: GraphObstacleIndex, id: number, overrides: Overrides): Rect | undefined {
  const mode = overrides.get(id)
  return mode === undefined ? index.inflated[id] : mode === 1 ? index.raw[id] : undefined
}

function strictlyInside(rect: Rect, point: GraphPoint) {
  return rect.x1 + eps < point.x && point.x < rect.x2 - eps && rect.y1 + eps < point.y && point.y < rect.y2 - eps
}

// Whether an axis-aligned segment passes through the interior of an obstacle. Running along a border is allowed.
function blocked(index: GraphObstacleIndex, overrides: Overrides, x1: number, y1: number, x2: number, y2: number) {
  const area = { x1: Math.min(x1, x2), y1: Math.min(y1, y2), x2: Math.max(x1, x2), y2: Math.max(y1, y2) }
  return visitNear(index, area, (id) => {
    const rect = rectOf(index, id, overrides)
    return Boolean(rect && rect.x1 + eps < area.x2 && area.x1 < rect.x2 - eps && rect.y1 + eps < area.y2 && area.y1 < rect.y2 - eps)
  })
}

/**
 * Internal: whether a polyline crosses no box of the index (at box size, without clearance), except the boxes named in
 * `except`.
 */
export function graphPolylineClear(index: GraphObstacleIndex, points: readonly GraphPoint[], except: ReadonlySet<string>) {
  const overrides = new Map<number, 0 | 1>()
  index.ids.forEach((id, i) => overrides.set(i, except.has(id) ? 0 : 1))
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!, b = points[i]!
    if (blocked(index, overrides, a.x, a.y, b.x, b.y)) return false
  }
  return true
}

function sortedUnique(values: number[]) {
  values.sort((a, b) => a - b)
  const result: number[] = []
  for (const value of values) if (!result.length || value - result[result.length - 1]! > eps) result.push(value)
  return result
}

function nearestIndex(lines: readonly number[], value: number) {
  let low = 0, high = lines.length - 1
  while (low < high) {
    const middle = (low + high) >> 1
    if (lines[middle]! < value - eps) low = middle + 1
    else high = middle
  }
  return low
}

interface QueueItem {
  f: number
  h: number
  order: number
  state: number
  g: number
}

function before(a: QueueItem, b: QueueItem) {
  return a.f < b.f || (a.f === b.f && (a.h < b.h || (a.h === b.h && a.order < b.order)))
}

function simplifyRoute(points: readonly GraphPoint[]): GraphPoint[] {
  const result: GraphPoint[] = []
  for (const point of points) {
    const last = result[result.length - 1]
    if (last && Math.abs(last.x - point.x) < eps && Math.abs(last.y - point.y) < eps) continue
    const previous = result[result.length - 2]
    if (previous && last && ((Math.abs(previous.x - last.x) < eps && Math.abs(last.x - point.x) < eps)
      || (Math.abs(previous.y - last.y) < eps && Math.abs(last.y - point.y) < eps))) result.pop()
    result.push({ x: point.x, y: point.y })
  }
  return result
}

// A* over the grid of lines inside one region. Returns the points from `s` to `e`, or undefined.
function searchRegion(
  index: GraphObstacleIndex, overrides: Overrides, region: Rect, s: GraphPoint, e: GraphPoint, from: GraphRouteEnd, to: GraphRouteEnd,
  bendPenalty: number,
): GraphPoint[] | undefined {
  // Borders: the region and the edges of the grown boxes inside it (and of the boxes tested at their own size). Lines run
  // halfway between neighbouring borders, through the middle of each free channel, plus the lines through both ends.
  // The global borders are already sorted, so the sorts below merge a few values into sorted runs.
  const within = (borders: readonly number[], low: number, high: number) => {
    const result = [low]
    for (let i = nearestIndex(borders, low); i < borders.length && borders[i]! < high; i++) if (borders[i]! > low) result.push(borders[i]!)
    result.push(high)
    return result
  }
  const bx = within(index.xBorders, region.x1, region.x2), by = within(index.yBorders, region.y1, region.y2)
  for (const [id, mode] of overrides) {
    if (mode !== 1) continue
    const rect = index.raw[id]!
    for (const x of [rect.x1, rect.x2]) if (x > region.x1 && x < region.x2) bx.push(x)
    for (const y of [rect.y1, rect.y2]) if (y > region.y1 && y < region.y2) by.push(y)
  }
  const lines = (borders: number[], a: number, b: number) => {
    const sorted = sortedUnique(borders)
    const result: number[] = []
    for (let i = 1; i < sorted.length; i++) result.push((sorted[i - 1]! + sorted[i]!) / 2)
    result.push(a, b)
    return sortedUnique(result)
  }
  const xs = lines(bx, s.x, e.x), ys = lines(by, s.y, e.y)
  const nx = xs.length, ny = ys.length
  const si = nearestIndex(xs, s.x), sj = nearestIndex(ys, s.y), ei = nearestIndex(xs, e.x), ej = nearestIndex(ys, e.y)
  // Lines along the side of an end's own node: running along them hugs the node, so they cost double.
  const hugX = new Set<number>(), hugY = new Set<number>()
  for (const [end, i, j] of [[from, si, sj], [to, ei, ej]] as const) {
    if (end.side === 'left' || end.side === 'right') hugX.add(i)
    else hugY.add(j)
  }
  const goal = ej * nx + ei
  const inward = (sideDirection[to.side] + 2) % 4
  // Small regions keep their search state in typed arrays, large ones in maps that grow with the explored states.
  const states = nx * ny * 4
  const dense = states <= denseLimit
  const bestDense = dense ? new Float64Array(states).fill(Infinity) : undefined
  const parentDense = dense ? new Float64Array(states).fill(-1) : undefined
  const freeDense = dense ? new Int8Array(states / 2) : undefined
  const bestSparse = new Map<number, number>(), parentSparse = new Map<number, number>(), freeSparse = new Map<number, number>()
  const bestOf = (state: number) => bestDense ? bestDense[state]! : bestSparse.get(state) ?? Infinity
  const parentOf = (state: number) => parentDense ? parentDense[state]! : parentSparse.get(state) ?? -1
  const record = (state: number, g: number, from: number) => {
    if (bestDense) {
      bestDense[state] = g
      parentDense![state] = from
    } else {
      bestSparse.set(state, g)
      parentSparse.set(state, from)
    }
  }
  const free = (i: number, j: number, direction: number) => {
    // Key by the segment's lower vertex and its axis; 1 is free, 2 blocked.
    const i2 = i + DX[direction]!, j2 = j + DY[direction]!
    const key = (Math.min(j, j2) * nx + Math.min(i, i2)) * 2 + (direction % 2)
    let value = freeDense ? freeDense[key]! : freeSparse.get(key) ?? 0
    if (!value) {
      value = blocked(index, overrides, xs[i]!, ys[j]!, xs[i2]!, ys[j2]!) ? 2 : 1
      if (freeDense) freeDense[key] = value
      else freeSparse.set(key, value)
    }
    return value === 1
  }
  // Length plus a lower bound of the bends still needed, counting arrival from a direction other than `inward` as a
  // bend: none straight ahead, one when the end lies ahead but off the line, two when it lies level or behind.
  const heuristic = (i: number, j: number, direction: number) => {
    const dx = e.x - xs[i]!, dy = e.y - ys[j]!
    const length = Math.abs(dx) + Math.abs(dy)
    if (Math.abs(dx) < eps && Math.abs(dy) < eps) return 0
    const along = DX[direction]! * dx + DY[direction]! * dy
    const across = Math.abs(DX[direction]! * dy - DY[direction]! * dx)
    let bends: number
    if (along > eps && across < eps) bends = direction === inward ? 0 : 1
    else if (along > eps) {
      // The one turn heads along the other axis towards the end.
      const turned = direction % 2 === 0 ? (dy > 0 ? 1 : 3) : (dx > 0 ? 0 : 2)
      bends = turned === inward ? 1 : 2
    } else bends = 2
    return length + bends * bendPenalty
  }
  const start = (sj * nx + si) * 4 + sideDirection[from.side]
  const heap: QueueItem[] = []
  let order = 0, expanded = 0
  record(start, 0, -1)
  const startH = heuristic(si, sj, sideDirection[from.side])
  heapPush(heap, { f: startH, h: startH, order: order++, state: start, g: 0 }, before)
  let found: number | undefined
  while (heap.length) {
    const item = heapPop(heap, before)!
    if (item.g > bestOf(item.state)) continue
    const direction = item.state % 4, vertex = (item.state - direction) / 4
    if (vertex === goal) {
      found = item.state
      break
    }
    if (++expanded > maxExpansions) return undefined
    const i = vertex % nx, j = (vertex - i) / nx
    for (let next = 0; next < 4; next++) {
      if (next === (direction + 2) % 4) continue
      const i2 = i + DX[next]!, j2 = j + DY[next]!
      if (i2 < 0 || j2 < 0 || i2 >= nx || j2 >= ny || !free(i, j, next)) continue
      const length = Math.abs(xs[i2]! - xs[i]!) + Math.abs(ys[j2]! - ys[j]!)
      const hug = next % 2 === 1 ? hugX.has(i) : hugY.has(j)
      const target = j2 * nx + i2
      const g = item.g + length * (hug ? 2 : 1) + (next !== direction ? bendPenalty : 0)
        + (target === goal && next !== inward ? bendPenalty : 0)
      const state = target * 4 + next
      if (bestOf(state) <= g) continue
      record(state, g, item.state)
      const h = heuristic(i2, j2, next)
      heapPush(heap, { f: g + h, h, order: order++, state, g }, before)
    }
  }
  if (found === undefined) return undefined
  const points: GraphPoint[] = []
  for (let state = found; state >= 0; state = parentOf(state)) {
    const vertex = (state - state % 4) / 4, i = vertex % nx
    points.push({ x: xs[i]!, y: ys[(vertex - i) / nx]! })
  }
  points.reverse()
  // The grid lines through the ends are the ends' own coordinates.
  points[0] = { x: s.x, y: s.y }
  points[points.length - 1] = { x: e.x, y: e.y }
  return points
}

/** Internal: `findOrthogonalRoute` over a prebuilt index. The ends are assumed valid. */
export function routeAroundObstacles(
  index: GraphObstacleIndex, from: GraphRouteEnd, to: GraphRouteEnd, bendPenalty: number,
): GraphPoint[] | undefined {
  const c = index.clearance
  // With every input at nonnegative coordinates the route stays there too, so a stub towards a negative coordinate
  // stops at 0.
  const nonnegative = index.nonnegative && from.x >= 0 && from.y >= 0 && to.x >= 0 && to.y >= 0
  const low = (value: number) => nonnegative ? Math.max(0, value) : value
  const stubPoint = (end: GraphRouteEnd) => {
    const direction = sideDirection[end.side]
    return { x: low(end.x + DX[direction]! * c), y: low(end.y + DY[direction]! * c) }
  }
  const s = stubPoint(from), e = stubPoint(to)
  const overrides = new Map<number, 0 | 1>()
  for (const point of [s, e]) {
    visitNear(index, { x1: point.x, y1: point.y, x2: point.x, y2: point.y }, (id) => {
      if (overrides.get(id) === 0 || !strictlyInside(index.inflated[id]!, point)) return
      overrides.set(id, strictlyInside(index.raw[id]!, point) ? 0 : 1)
    })
  }
  if (Math.abs(s.x - e.x) < eps && Math.abs(s.y - e.y) < eps) return simplifyRoute([from, s, to])
  // The whole routing area: every grown box and both ends with a margin, kept at or above 0 when the input is.
  const margin = Math.max(c, 8)
  const bounds = index.bounds ?? { x1: s.x, y1: s.y, x2: s.x, y2: s.y }
  const frame = {
    x1: Math.min(low(Math.min(bounds.x1, s.x, e.x) - margin), s.x, e.x),
    y1: Math.min(low(Math.min(bounds.y1, s.y, e.y) - margin), s.y, e.y),
    x2: Math.max(bounds.x2, s.x, e.x) + margin,
    y2: Math.max(bounds.y2, s.y, e.y) + margin,
  }
  // Search a region around both ends first and grow it fourfold until it covers the frame.
  let reach = Math.max(4 * index.cell, 4 * c, 64)
  for (;;) {
    const region = {
      x1: Math.max(frame.x1, Math.min(s.x, e.x) - reach), y1: Math.max(frame.y1, Math.min(s.y, e.y) - reach),
      x2: Math.min(frame.x2, Math.max(s.x, e.x) + reach), y2: Math.min(frame.y2, Math.max(s.y, e.y) + reach),
    }
    const route = searchRegion(index, overrides, region, s, e, from, to, bendPenalty)
    if (route) return simplifyRoute([from, ...route, to])
    if (region.x1 <= frame.x1 && region.y1 <= frame.y1 && region.x2 >= frame.x2 && region.y2 >= frame.y2) return undefined
    reach *= 4
  }
}

function assertEnd(end: GraphRouteEnd, name: string) {
  if (!end || !Number.isFinite(end.x) || !Number.isFinite(end.y)) throw new RangeError(name + ' must have finite x and y')
  if (!isGraphPortSide(end.side)) throw new RangeError(name + ' has an unknown side: ' + String(end.side))
}

/**
 * Finds an axis-aligned route from `from` to `to` that keeps `clearance` (default 8) away from every obstacle
 * rectangle, leaving `from` and entering `to` perpendicular to their sides (with a clearance of 0
 * the route may run along the border of an end's own node, which only costs extra). Include the boxes of the two end nodes in
 * `obstacles`: the route then never runs through them. The route minimises its length plus `bendPenalty` (default 24)
 * per bend, and is deterministic for the same input. Returns the polyline from `from` to `to`, or undefined when no route
 * exists or the bounded search gives up. When every input lies at nonnegative coordinates, so does the route.
 *
 * The search runs over a sparse grid: lines halfway between neighbouring obstacle edges (the middle of each free
 * channel) and through both ends, never a pixel grid. Obstacles go into a bucket grid in O(n); the search starts in a
 * region around both ends and grows it fourfold up to the whole area, each round taking O(k log k) for the k obstacles in
 * the region plus A* over at most 4·lx·ly states for lx by ly lines, capped at 200,000 expanded states.
 *
 * Throws RangeError for a non-finite end, an unknown side, an obstacle with non-finite coordinates or a negative or
 * non-finite size, and a negative or non-finite clearance or bend penalty.
 */
export function findOrthogonalRoute(
  from: GraphRouteEnd, to: GraphRouteEnd, obstacles: readonly GraphRect[], options: GraphObstacleAvoidance = {},
): GraphPoint[] | undefined {
  assertEnd(from, 'from')
  assertEnd(to, 'to')
  const { clearance, bendPenalty } = resolveObstacleAvoidance(options ?? {}, 'options')!
  obstacles.forEach((rect, i) => {
    if (![rect.x, rect.y, rect.width, rect.height].every(Number.isFinite) || rect.width < 0 || rect.height < 0) {
      throw new RangeError('Obstacle ' + i + ' must have finite coordinates and a nonnegative finite size')
    }
  })
  const index = buildGraphObstacleIndex(obstacles.map((rect, i) => [String(i), rect] as const), clearance)
  return routeAroundObstacles(index, from, to, bendPenalty)
}
