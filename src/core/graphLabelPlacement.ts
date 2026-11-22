// Opt-in placement of edge labels that avoids node boxes, other labels and other edges. The routers put each label
// just above the middle of its route; this module moves labels along and beside their routes to free space.
import type { GraphEdge, GraphLayout, GraphPoint } from './graph.js'
import { markBuiltinRoutes } from './graphGeometry.js'
import { checkLayoutNumber, describeValue } from './graphOptions.js'
import { SpatialGrid, graphPathPolylines, segmentMeetsRect, type SpatialRect } from './graphSpatial.js'
import { checkId } from './ids.js'
import type { GraphRect } from './graphView.js'

/** The width and height of one edge label in chart units. */
export interface GraphEdgeLabelSize {
  width: number
  height: number
}

/**
 * Options of `placeGraphEdgeLabels` and the NetworkGraph `edgeLabelPlacement` prop. The font size and glyph width must
 * be finite numbers > 0, `gap` and `margin` finite numbers ≥ 0 and `samples` an integer from 1 to 32; otherwise a
 * RangeError names the option, as for the layouts (for example `gap must be a finite number ≥ 0 (got -1)` or
 * `samples must be an integer from 1 to 32 (got 40)`).
 */
export interface GraphEdgeLabelPlacementOptions<E extends GraphEdge = GraphEdge> {
  /** Font size of the labels in chart units, used to estimate their size and baseline. Default 11, the stylesheet's `.vw-edge-label` size. */
  fontSize?: number
  /** Average glyph width as a fraction of the font size, used to estimate the label width from its text. Default 0.6. */
  glyphWidth?: number
  /**
   * The exact size of an edge's label, for callers that measure their text. Return nothing (undefined or null) to use
   * the estimate. The box is centred horizontally on the anchor and vertically on `anchor.y - 0.35 × fontSize`.
   */
  labelSize?: (edge: E, text: string) => GraphEdgeLabelSize | null | undefined
  /** The text of an edge's label. Default: `edge.label`. Edges without text keep their anchor and are not avoided. */
  labelText?: (edge: E) => string | undefined
  /** Distance between a route and a label placed beside it. Default 3. */
  gap?: number
  /**
   * The drawn width of an edge in chart units, for edges drawn wider than a thin line, such as the bands of a flow
   * diagram. A label beside such an edge keeps `gap` from its outer side (`gap + width / 2` from its centre line), and
   * other labels avoid its full width. Return nothing (undefined or null) or 0 for a thin line; any other value must
   * be a finite number ≥ 0, else a RangeError names the edge. Default: every edge is a thin line.
   */
  edgeWidth?: (edge: E) => number | null | undefined
  /** Free space kept around each label when checking overlaps. Default 2. */
  margin?: number
  /** Number of positions tried along each route, besides the middles of its longest segments. An integer from 1 to 32. Default 9. */
  samples?: number
  /**
   * Only these edges' labels are placed; the labels of the other edges keep their anchors and are avoided like nodes.
   * Every ID must be an edge in `edges`. Default: all edges.
   */
  edgeIds?: Iterable<string>
  /** More areas to keep labels out of, such as group headers or a legend. */
  obstacles?: readonly GraphRect[]
}

/**
 * The NetworkGraph `edgeLabelPlacement` prop: `midpoint` keeps the label anchors of the layout and routing (the
 * default), `avoid` places labels with `placeGraphEdgeLabels` and its default options, and an options object places
 * them with those options.
 */
export type GraphEdgeLabelPlacement<E extends GraphEdge = GraphEdge> =
  | 'midpoint'
  | 'avoid'
  | Omit<GraphEdgeLabelPlacementOptions<E>, 'edgeIds' | 'labelText'>

interface Segment {
  a: GraphPoint
  b: GraphPoint
  /** Arc length of the route at `a`. */
  start: number
  length: number
}

interface Candidate {
  /** Centre of the label box. */
  x: number
  y: number
  /** The preference cost: distance from the middle of the route and the side. */
  base: number
  /** Whether the box is centred on the route, which then crosses its own label. */
  onPath: boolean
}

// Cost weights, in units of label area.
const nodeWeight = 4
const labelWeight = 4
const obstacleWeight = 4
const outsideWeight = 2
const edgeWeight = 0.5
const travelWeight = 0.6
const sideWeights = [0, 0.1, 0.35]
const baselineRatio = 0.35
const lineHeight = 1.25
const longestSegments = 4
// Crossed edges counted per position at most; where routes are this dense, more of them make no difference.
const maxCrossings = 6

// A numeric option, checked with the message format of the layouts, or its default.
function option(name: string, value: number | undefined, fallback: number, rule: 'positive' | 'nonnegative' | 'positiveInteger'): number {
  if (value === undefined) return fallback
  checkLayoutNumber(name, value, rule)
  return value
}

function checkSamples(value: number | undefined): number {
  if (value === undefined) return 9
  if (!Number.isInteger(value) || value < 1 || value > 32) {
    throw new RangeError(`samples must be an integer from 1 to 32 (got ${describeValue(value)})`)
  }
  return value
}

function toRect(x: number, y: number, width: number, height: number, grow: number): SpatialRect {
  return { x1: x - width / 2 - grow, y1: y - height / 2 - grow, x2: x + width / 2 + grow, y2: y + height / 2 + grow }
}

function grow(rect: SpatialRect, by: number): SpatialRect {
  return { x1: rect.x1 - by, y1: rect.y1 - by, x2: rect.x2 + by, y2: rect.y2 + by }
}

function overlap(a: SpatialRect, b: SpatialRect) {
  const w = Math.min(a.x2, b.x2) - Math.max(a.x1, b.x1), h = Math.min(a.y2, b.y2) - Math.max(a.y1, b.y1)
  return w > 0 && h > 0 ? w * h : 0
}

function routeSegments(path: string): Segment[] {
  const segments: Segment[] = []
  let total = 0
  for (const line of graphPathPolylines(path)) {
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1]!, b = line[i]!
      const length = Math.hypot(b.x - a.x, b.y - a.y)
      if (!(length > 0)) continue
      segments.push({ a, b, start: total, length })
      total += length
    }
  }
  return segments
}

/** The segment holding arc length `s`, found by binary search. */
function segmentAt(segments: readonly Segment[], s: number): Segment {
  let low = 0, high = segments.length - 1
  while (low < high) {
    const mid = (low + high + 1) >> 1
    if (segments[mid]!.start <= s) low = mid
    else high = mid - 1
  }
  return segments[low]!
}

/**
 * The checked size options of edge label placement and the label and edge sizes they give. Internal: shared with
 * NetworkGraph's drag preview, which needs the same label boxes to find the labels a change reaches.
 */
export interface EdgeLabelGeometry<E extends GraphEdge> {
  fontSize: number
  gap: number
  margin: number
  /** Distance from the baseline of a label up to the centre of its box. */
  shift: number
  /** The size of a label's box: `labelSize`, else the estimate from the text. */
  size(edge: E, text: string): GraphEdgeLabelSize
  /** Half the drawn width of an edge: 0 for a thin line. */
  halfWidth(edge: E): number
}

/** Checks the size options of `placeGraphEdgeLabels` (see GraphEdgeLabelPlacementOptions). Internal. */
export function edgeLabelGeometry<E extends GraphEdge>(options: GraphEdgeLabelPlacementOptions<E>): EdgeLabelGeometry<E> {
  const fontSize = option('fontSize', options.fontSize, 11, 'positive')
  const glyphWidth = option('glyphWidth', options.glyphWidth, 0.6, 'positive')
  const gap = option('gap', options.gap, 3, 'nonnegative')
  const margin = option('margin', options.margin, 2, 'nonnegative')
  return {
    fontSize, gap, margin, shift: baselineRatio * fontSize,
    size(edge, text) {
      const size = options.labelSize?.(edge, text)
      if (size === undefined || size === null) return { width: Math.max(1, [...text].length) * glyphWidth * fontSize, height: fontSize * lineHeight }
      if (typeof size !== 'object' || ![size.width, size.height].every(Number.isFinite) || !(size.width > 0) || !(size.height > 0)) {
        throw new RangeError('Invalid edge label size: ' + edge.id)
      }
      return { width: size.width, height: size.height }
    },
    halfWidth(edge) {
      const width = options.edgeWidth?.(edge)
      if (width === undefined || width === null) return 0
      if (typeof width !== 'number' || !Number.isFinite(width) || width < 0) throw new RangeError('Invalid edge width: ' + edge.id)
      return width / 2
    },
  }
}

/**
 * Places edge labels where they do not cover node boxes, other labels or other edges, when there is space for them,
 * and returns a new layout with the new `edgeLabels`; the input is not changed. Each label is tried at positions along
 * its route, beside it on either side and on it, and the one with the least overlap wins, preferring positions near
 * the middle of the route and above or right of it. Labels are placed one at a time, those of shorter routes and then
 * wider labels first, ties in edge ID order, so the result is deterministic.
 *
 * Anchors keep the meaning of `GraphLayout.edgeLabels`: the horizontal centre and the baseline of the text, as
 * NetworkGraph and `renderGraphSvg` draw it. Label sizes are estimated from the text length unless `labelSize` gives
 * them. Throws an Error for an invalid or duplicate edge ID (`Duplicate edge ID: <id>`), an edge without a layout path
 * or an unknown ID in `edgeIds`, and a RangeError for an invalid option, label size, edge width or obstacle (naming
 * its index).
 */
export function placeGraphEdgeLabels<L extends GraphLayout, E extends GraphEdge = GraphEdge>(
  layout: L, edges: readonly E[], options: GraphEdgeLabelPlacementOptions<E> = {},
): L {
  const geometry = edgeLabelGeometry(options)
  const { fontSize, gap, margin, shift } = geometry
  const samples = checkSamples(options.samples)
  const textOf = options.labelText ?? ((edge: E) => edge.label)
  const sizeOf = geometry.size

  const byId = new Map<string, E>()
  const seen = new Set<string>()
  // Half the drawn width of each wide edge; thin lines are left out.
  const halfWidths = new Map<string, number>()
  let widest = 0
  for (const edge of edges) {
    checkId('edge', edge.id, seen)
    if (layout.paths.get(edge.id) === undefined) throw new Error('Missing layout path: ' + edge.id)
    byId.set(edge.id, edge)
    const half = geometry.halfWidth(edge)
    if (half > 0) {
      halfWidths.set(edge.id, half)
      widest = Math.max(widest, half)
    }
  }
  let chosen: Set<string> | undefined
  if (options.edgeIds !== undefined) {
    chosen = new Set()
    for (const id of options.edgeIds) {
      if (!byId.has(id)) throw new Error('Unknown edge in edgeIds: ' + String(id))
      chosen.add(id)
    }
  }

  // Routes and label sizes first: with `edgeIds`, only what lies near the routes of those edges is indexed.
  const routes = new Map<string, Segment[]>()
  for (const edge of edges) routes.set(edge.id, routeSegments(layout.paths.get(edge.id)!))
  const kept: { anchor: GraphPoint; size: GraphEdgeLabelSize }[] = []
  const pending: { edge: E; size: GraphEdgeLabelSize; segments: Segment[]; total: number }[] = []
  let region: SpatialRect | undefined
  for (const edge of edges) {
    const text = textOf(edge)
    if (!text) continue
    const size = sizeOf(edge, text)
    const segments = routes.get(edge.id)!
    if ((chosen && !chosen.has(edge.id)) || !segments.length) {
      const anchor = layout.edgeLabels.get(edge.id)
      if (anchor) kept.push({ anchor, size })
      continue
    }
    const last = segments[segments.length - 1]!
    pending.push({ edge, size, segments, total: last.start + last.length })
    if (!chosen) continue
    const reach = gap + margin + size.width + size.height + 2 * widest
    for (const { a, b } of segments) {
      const x1 = Math.min(a.x, b.x) - reach, y1 = Math.min(a.y, b.y) - reach, x2 = Math.max(a.x, b.x) + reach, y2 = Math.max(a.y, b.y) + reach
      if (!region) region = { x1, y1, x2, y2 }
      else region = { x1: Math.min(region.x1, x1), y1: Math.min(region.y1, y1), x2: Math.max(region.x2, x2), y2: Math.max(region.y2, y2) }
    }
  }
  pending.sort((a, b) => a.total - b.total || b.size.width - a.size.width || (a.edge.id < b.edge.id ? -1 : a.edge.id > b.edge.id ? 1 : 0))
  const near = (rect: SpatialRect) => !region || (rect.x1 <= region.x2 && rect.x2 >= region.x1 && rect.y1 <= region.y2 && rect.y2 >= region.y1)

  const cell = Math.max(32, fontSize * 6), pieceLength = cell * 8
  const obstacles = new SpatialGrid(cell), obstacleWeights: number[] = []
  const addObstacle = (rect: SpatialRect, weight: number) => {
    if (!near(rect)) return
    obstacles.insert(rect)
    obstacleWeights.push(weight)
  }
  for (const box of layout.boxes.values()) addObstacle({ x1: box.x, y1: box.y, x2: box.x + box.width, y2: box.y + box.height }, nodeWeight)
  for (const [index, area] of (options.obstacles ?? []).entries()) {
    if (!area || ![area.x, area.y, area.width, area.height].every(Number.isFinite) || area.width < 0 || area.height < 0) {
      throw new RangeError('Invalid edge label obstacle at index ' + index)
    }
    addObstacle({ x1: area.x, y1: area.y, x2: area.x + area.width, y2: area.y + area.height }, obstacleWeight)
  }

  // Route segments, so labels avoid crossing other edges. Long segments are indexed in pieces, so the grid does not
  // check them on every query; the pieces of a wide edge are indexed with its width.
  const lines = new SpatialGrid(cell), owners: string[] = [], ends: [GraphPoint, GraphPoint][] = []
  for (const [id, segments] of routes) {
    const half = halfWidths.get(id) ?? 0
    for (const { a, b, length } of segments) {
      const pieces = Math.ceil(length / pieceLength)
      for (let i = 0; i < pieces; i++) {
        const p = i === 0 ? a : { x: a.x + (b.x - a.x) * i / pieces, y: a.y + (b.y - a.y) * i / pieces }
        const q = i === pieces - 1 ? b : { x: a.x + (b.x - a.x) * (i + 1) / pieces, y: a.y + (b.y - a.y) * (i + 1) / pieces }
        const rect = { x1: Math.min(p.x, q.x) - half, y1: Math.min(p.y, q.y) - half, x2: Math.max(p.x, q.x) + half, y2: Math.max(p.y, q.y) + half }
        if (!near(rect)) continue
        lines.insert(rect)
        owners.push(id)
        ends.push([p, q])
      }
    }
  }

  // Labels kept as they are count as placed.
  const labels = new SpatialGrid(cell)
  for (const { anchor, size } of kept) {
    const rect = toRect(anchor.x, anchor.y - shift, size.width, size.height, 0)
    if (near(rect)) labels.insert(rect)
  }

  const width = layout.width, height = layout.height
  const edgeLabels = new Map(layout.edgeLabels)
  const layoutRect = { x1: 0, y1: 0, x2: width, y2: height }
  for (const { edge, size, segments, total } of pending) {
    const area = size.width * size.height, padded = (size.width + 2 * margin) * (size.height + 2 * margin)
    const ownHalf = halfWidths.get(edge.id) ?? 0
    const candidates: Candidate[] = []
    const addAt = (s: number) => {
      const segment = segmentAt(segments, s)
      const t = Math.min(1, Math.max(0, (s - segment.start) / segment.length))
      const px = segment.a.x + (segment.b.x - segment.a.x) * t, py = segment.a.y + (segment.b.y - segment.a.y) * t
      const ux = (segment.b.x - segment.a.x) / segment.length, uy = (segment.b.y - segment.a.y) / segment.length
      // The normal that points up, or right on a vertical segment, comes first.
      let nx = uy, ny = -ux
      if (ny > 1e-9 || (Math.abs(ny) <= 1e-9 && nx < 0)) {
        nx = -nx
        ny = -ny
      }
      const travel = travelWeight * area * Math.abs(s - total / 2) / Math.max(total / 2, 1)
      const reach = gap + ownHalf + Math.abs(nx) * size.width / 2 + Math.abs(ny) * size.height / 2
      candidates.push({ x: px + nx * reach, y: py + ny * reach, base: travel + sideWeights[0]! * area, onPath: false })
      candidates.push({ x: px - nx * reach, y: py - ny * reach, base: travel + sideWeights[1]! * area, onPath: false })
      candidates.push({ x: px, y: py, base: travel + sideWeights[2]! * area, onPath: true })
    }
    for (let i = 0; i < samples; i++) addAt(total * (i + 1) / (samples + 1))
    if (samples % 2 === 0) addAt(total / 2)
    const longest = segments.map((segment, index) => index)
      .sort((a, b) => segments[b]!.length - segments[a]!.length || a - b)
      .slice(0, longestSegments)
    for (const index of longest) addAt(segments[index]!.start + segments[index]!.length / 2)
    // Cheapest preference first; stable, so ties keep the order above.
    const order = candidates.map((candidate, index) => index).sort((a, b) => candidates[a]!.base - candidates[b]!.base || a - b)

    let best: Candidate | undefined, bestCost = Infinity
    for (const index of order) {
      const candidate = candidates[index]!
      if (candidate.base >= bestCost) break
      let cost = candidate.base
      const box = toRect(candidate.x, candidate.y, size.width, size.height, margin)
      // The share of the padded box outside the layout, weighed in label area like the other costs.
      const outside = padded - overlap(box, layoutRect)
      if (outside > 0) cost += outsideWeight * area * Math.min(1, outside / padded)
      if (cost >= bestCost) continue
      obstacles.visit(box, (at, rect) => {
        cost += obstacleWeights[at]! * overlap(box, rect)
        return cost >= bestCost
      })
      if (cost >= bestCost) continue
      labels.visit(box, (at, rect) => {
        cost += labelWeight * overlap(box, rect)
        return cost >= bestCost
      })
      if (cost >= bestCost) continue
      // Other edges count when they meet the padded box, grown by their half width. The label's own route counts only
      // where it enters the label box itself, grown by its half width: a label beside its route keeps `gap` to it,
      // which may be less than `margin`, and a label on its route is meant to cover it.
      const own = toRect(candidate.x, candidate.y, size.width, size.height, ownHalf)
      const crossed = new Set<string>()
      lines.visit(box, at => {
        const owner = owners[at]!
        if (crossed.has(owner)) return false
        const [a, b] = ends[at]!
        if (owner === edge.id) {
          if (candidate.onPath || !segmentMeetsRect(a, b, own, true)) return false
        } else {
          const half = halfWidths.get(owner)
          if (!segmentMeetsRect(a, b, half ? grow(box, half) : box, true)) return false
        }
        crossed.add(owner)
        cost += edgeWeight * area
        return cost >= bestCost || crossed.size >= maxCrossings
      })
      if (cost < bestCost) {
        best = candidate
        bestCost = cost
      }
    }
    if (!best) continue
    labels.insert(toRect(best.x, best.y, size.width, size.height, 0))
    edgeLabels.set(edge.id, { x: best.x, y: best.y + shift })
  }
  return markBuiltinRoutes({ ...layout, edgeLabels }, layout, [])
}
