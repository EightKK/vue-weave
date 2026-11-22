import { indexGraph, layoutLayeredGraph, type GraphBox, type GraphEdge, type GraphLayout, type GraphLayoutDirection, type GraphPort, type IdentifiedNode } from './graph.js'
import { assertGraphLayoutDirection, graphFlowSides, isVerticalDirection } from './graphOrient.js'
import { checkLayoutNumber, checkLayoutNumbers, defaultPadding } from './graphOptions.js'

/**
 * How `layoutFlowGraph` turns quantities into pixels. `pixelsPerUnit` fixes the scale; `fitExtent` picks the largest
 * scale at which the fullest rank (its node sizes plus the gaps between them) fits into that cross-flow extent. Boxes with
 * a small nonzero value raised to `minNodeSize` are not part of that fit, so a rank holding them can exceed it slightly.
 */
export type GraphFlowScale = { pixelsPerUnit: number } | { fitExtent: number }

/** The scale used when `options.scale` is left out; compared by identity to tell it from an explicit `fitExtent`. */
const defaultScale: GraphFlowScale = { fitExtent: 360 }

/** Options of `layoutFlowGraph`. `N` and `E` type the nodes and edges that the accessors receive. */
export interface GraphFlowOptions<N extends IdentifiedNode = IdentifiedNode, E extends GraphEdge = GraphEdge> {
  /** The quantity that flows along an edge, in the edge's unit. Must be a finite number of at least 0. Required. */
  quantity: (edge: E) => number
  /**
   * The unit of every quantity (`'pcs'`), or the unit of each edge (`edge => edge.data.unit`). Required. Quantities in
   * different units are never added: edges whose unit is not `displayUnit` are left out of the picture and listed in
   * `excluded`.
   */
  unit: string | ((edge: E) => string)
  /** The unit the projection draws and sums. Required when `unit` is a function; defaults to `unit` when it is a string. */
  displayUnit?: string
  /** Direction of the flow. Default `'LR'`. */
  direction?: GraphLayoutDirection
  /** Size of every node box along the flow. Positive. Default 24. */
  nodeThickness?: number
  /** Cross-flow gap between neighbouring nodes of one rank. Default 16. */
  nodeGap?: number
  /** Gap between ranks along the flow, where the bands run. Default 120. */
  rankGap?: number
  /** Margin around the picture. Default 20. */
  padding?: number
  /**
   * Default `{ fitExtent: 360 }`, grown for a rank whose gaps and minimum node sizes do not fit into 360. An explicit
   * `fitExtent` too small for a rank throws a RangeError instead.
   */
  scale?: GraphFlowScale
  /** Smallest cross-flow size of a node box, so a node without flow stays visible. Positive. Default 2. */
  minNodeSize?: number
  /** Smallest drawn stroke width of a band, so a zero quantity stays a selectable hairline. Default 1. */
  minBandWidth?: number
  /** Gap between the picture and the reference lanes, and between two reference lanes. Default 12. */
  referenceGap?: number
  /** Number of barycenter sweeps of the layered layout that order the nodes of each rank. Positive integer. Default 4. */
  crossingSweeps?: number
  /** Node name used in band labels. Defaults to the node's `label` when it is a string, else its ID. */
  nodeLabel?: (node: N) => string
  /** Quantity text used in band labels. Default `` `${quantity} ${unit}` ``. */
  formatQuantity?: (quantity: number, unit: string) => string
}

/** One node of a flow projection. All totals are in the projection's `unit`. */
export interface GraphFlowNode {
  /** The original node ID. */
  id: string
  /** The node box in chart coordinates; `rank` counts ranks along the flow. */
  box: GraphBox
  rank: number
  /** Position of the node within its rank, from the top (LR, RL) or the left (TB, BT). */
  order: number
  /** Sum of the forward bands that end here. */
  inflow: number
  /** Sum of the forward bands that start here. */
  outflow: number
  /** `outflow - inflow`, as given: negative where less leaves than arrives (scrap, stock, rounding — the caller decides). */
  difference: number
  /**
   * `max(inflow, outflow)`. The cross-flow size of the box is `max(inflow + referenceInflow, outflow + referenceOutflow)
   * × scale` (at least `minNodeSize`), so it equals `value × scale` for a node without reference bands and also holds the
   * reference stacks of one that has them.
   */
  value: number
  /** Sum of the reference (loop) bands that end here. Not part of `inflow` or `value`. */
  referenceInflow: number
  /** Sum of the reference (loop) bands that start here. Not part of `outflow` or `value`. */
  referenceOutflow: number
}

/** The band of one edge of a flow projection. */
export interface GraphFlowBand {
  /** The original edge ID. */
  edgeId: string
  from: string
  to: string
  quantity: number
  unit: string
  /** `quantity × scale`, exactly. */
  thickness: number
  /** The drawn stroke width: `thickness`, at least `minBandWidth`. */
  width: number
  /**
   * True for an edge that closes a cycle (a rework loop) or is a self-loop. It is stacked below the forward bands of
   * both ends, routed back through a lane beside the ranks, drawn dashed by the renderers, and counted in
   * `referenceInflow` and `referenceOutflow` instead of `inflow`, `outflow` and `value`.
   */
  reference: boolean
  selfLoop: boolean
  /** The source box side the band leaves through: the downstream side (right for LR, left for RL, bottom for TB, top for BT). */
  sourceSide: GraphPort['side']
  /** The target box side the band enters through: the upstream side. */
  targetSide: GraphPort['side']
  /** Where the band starts along its source side, from the top end (left, right) or left end (top, bottom) of that side; it covers `[sourceOffset, sourceOffset + thickness]`. */
  sourceOffset: number
  /** Where the band starts along its target side, measured like `sourceOffset`. */
  targetOffset: number
  /** The centre line of the band in chart coordinates; stroke it with `width`. */
  path: string
  /** Accessible text such as `Cut → Inspect: 60 pcs`. */
  label: string
}

/** An edge whose unit is not the displayed unit; it is not drawn and not added to any total. */
export interface GraphFlowExcludedEdge {
  edgeId: string
  from: string
  to: string
  unit: string
  quantity: number
}

/**
 * The result of `layoutFlowGraph`. It is a `GraphLayout` (boxes for every node, a path for every band, no edge label
 * anchors), so it can be the NetworkGraph `layout` and the layout of `renderGraphSvg`, for the edges that have a band.
 */
export interface GraphFlowLayout extends GraphLayout {
  /** The displayed unit. */
  unit: string
  /** Pixels per unit, the same across the whole picture. */
  scale: number
  direction: GraphLayoutDirection
  /** One entry per node, in input order. */
  nodes: GraphFlowNode[]
  /** One band per edge in the displayed unit, in input order. */
  bands: GraphFlowBand[]
  /** Edges in another unit, in input order. */
  excluded: GraphFlowExcludedEdge[]
}

/**
 * Drawing of one edge as a band with real width: the NetworkGraph `edgeBands` prop and the `renderGraphSvg` option of
 * the same name take these by edge ID. `graphFlowBands` builds them from a flow projection.
 */
export interface GraphEdgeBand {
  /** Stroke width of the band in chart units. Finite and at least 0. */
  width: number
  /** Draws the band as a dashed reference band (a loop that is not part of the node totals). */
  reference?: boolean
  /** Accessible name of the band; replaces the edge label in the name of its hit area. */
  label?: string
}

function coordinate(value: number) {
  const rounded = Math.round(value * 1000) / 1000
  return String(rounded === 0 ? 0 : rounded)
}

/**
 * Projects quantities on the edges of a graph into a Sankey-style picture: node boxes ordered in ranks along the flow
 * and, for each edge, a band whose width is `quantity × scale` on one scale for the whole picture.
 *
 * Ranks come from the layered layout (`layoutLayeredGraph` with barycenter crossing reduction) of the forward edges.
 * Each node box is `nodeThickness` long along the flow and `max(inflow, outflow) × scale` across it (at least
 * `minNodeSize`; see `GraphFlowNode.value` for nodes with reference bands). Bands are stacked along a node side from
 * its top (LR, RL) or left (TB, BT), sorted by the position of their other end, so they cross as little as possible.
 * The totals are reported as given and never balanced: where inflow and outflow differ, the shorter stack leaves the
 * rest of the box empty and `difference` says by how much.
 *
 * Units are never mixed: only edges whose unit is `displayUnit` are drawn and summed; the others are returned in
 * `excluded`. A quantity of 0 keeps its band, with `thickness` 0, drawn as a `minBandWidth` hairline.
 *
 * Cycles terminate: an iterative depth-first search in input order marks the edges that close a cycle, and self-loops,
 * as reference bands. They are routed back through lanes beside the ranks (below for LR and RL, to the right for TB and
 * BT), drawn dashed by the renderers, and counted in `referenceInflow` and `referenceOutflow`, not in the node totals.
 * Loops are not unrolled; to show rework as forward flow across periods, give each period its own node copies first.
 *
 * Throws Error for unknown endpoints, duplicate IDs and a missing or empty unit, and RangeError for a quantity that is
 * not a finite number of at least 0, an unknown direction and invalid sizes. The inputs are not modified.
 */
export function layoutFlowGraph<N extends IdentifiedNode, E extends GraphEdge>(
  nodes: readonly N[], edges: readonly E[], options: GraphFlowOptions<N, E>,
): GraphFlowLayout {
  const {
    quantity, unit, direction = 'LR', nodeThickness = 24, nodeGap = 16, rankGap = 120, padding = defaultPadding, scale = defaultScale,
    minNodeSize = 2, minBandWidth = 1, referenceGap = 12, crossingSweeps = 4,
  } = options ?? ({} as GraphFlowOptions<N, E>)
  if (typeof quantity !== 'function') throw new Error('layoutFlowGraph needs a quantity accessor')
  if (typeof unit !== 'function' && (typeof unit !== 'string' || !unit)) throw new Error('layoutFlowGraph needs a unit: a non-empty string or an accessor')
  const displayUnit = options.displayUnit ?? (typeof unit === 'string' ? unit : undefined)
  if (typeof displayUnit !== 'string' || !displayUnit) throw new Error('layoutFlowGraph needs a displayUnit when unit is an accessor')
  assertGraphLayoutDirection(direction)
  checkLayoutNumbers({ nodeThickness, minNodeSize }, 'positive')
  checkLayoutNumbers({ nodeGap, rankGap, padding, minBandWidth, referenceGap }, 'nonnegative')
  checkLayoutNumber('crossingSweeps', crossingSweeps, 'positiveInteger')
  const fixed = scale && 'pixelsPerUnit' in scale ? scale.pixelsPerUnit : undefined
  const fit = scale && 'fitExtent' in scale ? scale.fitExtent : undefined
  if (fixed !== undefined) checkLayoutNumber('pixelsPerUnit', fixed, 'positive')
  else if (fit !== undefined) checkLayoutNumber('fitExtent', fit, 'positive')
  else throw new RangeError('scale must be { pixelsPerUnit } or { fitExtent }')
  indexGraph(nodes, edges)

  const nodeName = options.nodeLabel ?? ((node: N) => {
    const label = (node as { label?: unknown }).label
    return typeof label === 'string' ? label : node.id
  })
  const format = options.formatQuantity ?? ((value: number, name: string) => `${value} ${name}`)

  // Units and quantities. Every edge is validated, also the ones another unit leaves out.
  const included: { edge: E; index: number; quantity: number }[] = []
  const excluded: GraphFlowExcludedEdge[] = []
  edges.forEach((edge, index) => {
    const value = quantity(edge)
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new RangeError(`Flow quantity of edge ${edge.id} must be a finite number of at least 0`)
    }
    const name = typeof unit === 'string' ? unit : unit(edge)
    if (typeof name !== 'string' || !name) throw new Error('Flow unit of edge ' + edge.id + ' must be a non-empty string')
    if (name === displayUnit) included.push({ edge, index, quantity: value })
    else excluded.push({ edgeId: edge.id, from: edge.from, to: edge.to, unit: name, quantity: value })
  })

  // Reference edges: those an iterative depth-first search in input order finds closing a cycle (including self-loops).
  const outgoing = new Map<string, number[]>(nodes.map(node => [node.id, []]))
  included.forEach(({ edge }, i) => outgoing.get(edge.from)!.push(i))
  const state = new Map<string, 1 | 2>()
  const reference = new Set<number>()
  for (const { id } of nodes) {
    if (state.has(id)) continue
    state.set(id, 1)
    const stack = [{ id, cursor: 0 }]
    while (stack.length) {
      const frame = stack[stack.length - 1]!
      const list = outgoing.get(frame.id)!
      if (frame.cursor === list.length) {
        state.set(frame.id, 2)
        stack.pop()
        continue
      }
      const i = list[frame.cursor++]!
      const next = included[i]!.edge.to
      const seen = state.get(next)
      if (seen === 1) reference.add(i)
      else if (seen === undefined) {
        state.set(next, 1)
        stack.push({ id: next, cursor: 0 })
      }
    }
  }

  // Ranks and the order within each rank from the layered layout of the forward edges, which form a DAG.
  const forward = included.filter((_, i) => !reference.has(i)).map(({ edge }) => ({ id: edge.id, from: edge.from, to: edge.to }))
  const layered = layoutLayeredGraph(nodes.map(({ id }) => ({ id })), forward, { crossingReduction: 'barycenter', crossingSweeps })
  const columns: string[][] = []
  for (const { id } of nodes) (columns[layered.boxes.get(id)!.rank] ??= []).push(id)
  for (const column of columns) column?.sort((a, b) => layered.boxes.get(a)!.y - layered.boxes.get(b)!.y)

  // Totals, by node, in the displayed unit only.
  const totals = new Map(nodes.map(({ id }) => [id, { inflow: 0, outflow: 0, referenceInflow: 0, referenceOutflow: 0 }]))
  included.forEach(({ edge, quantity: value }, i) => {
    const source = totals.get(edge.from)!, target = totals.get(edge.to)!
    if (reference.has(i)) {
      source.referenceOutflow += value
      target.referenceInflow += value
    } else {
      source.outflow += value
      target.inflow += value
    }
  })
  const value = (id: string) => {
    const total = totals.get(id)!
    return Math.max(total.inflow, total.outflow)
  }
  // The box also holds the stacks of the reference bands, below the forward ones.
  const extentValue = (id: string) => {
    const total = totals.get(id)!
    return Math.max(total.inflow + total.referenceInflow, total.outflow + total.referenceOutflow)
  }

  let pixels = fixed ?? 0
  if (fit !== undefined) {
    let best = Infinity
    for (const column of columns) {
      if (!column) continue
      const sum = column.reduce((total, id) => total + extentValue(id), 0)
      if (sum === 0) continue
      const empty = column.filter(id => extentValue(id) === 0).length
      // The default extent grows for a rank too full for it: to the rank's gaps plus `minNodeSize` for every node.
      const extent = scale === defaultScale ? Math.max(fit, (column.length - 1) * nodeGap + column.length * minNodeSize) : fit
      const available = extent - (column.length - 1) * nodeGap - empty * minNodeSize
      if (available <= 0) throw new RangeError('fitExtent is too small for the gaps and minimum node sizes of a rank')
      best = Math.min(best, available / sum)
    }
    pixels = best === Infinity ? 0 : best
  }
  const bands = included.map(({ edge, quantity: amount }) => ({ edge, amount, thickness: amount * pixels }))

  // Reference lanes beside the ranks, one per reference band in input order. A reference band leaves its source along
  // the flow, turns into its lane `reach` past the source rank, runs back, and turns into the target `reach` before
  // its rank; deeper lanes reach further, so the loops nest instead of crossing each other.
  const lanes = new Map<number, { depth: number; reach: number; index: number }>()
  let deepest = 0, reachMax = 0
  bands.forEach(({ thickness }, i) => {
    if (!reference.has(i)) return
    const width = Math.max(thickness, minBandWidth)
    deepest += referenceGap
    lanes.set(i, { depth: deepest + width / 2, reach: deepest + width / 2, index: lanes.size })
    deepest += width
    reachMax = Math.max(reachMax, deepest)
  })
  // Loops of the first and last rank need room beyond the padding.
  const inset = padding + Math.max(0, reachMax - padding)

  // Abstract coordinates: u along the flow, v across it. Each rank is centred on the fullest one.
  const size = (id: string) => Math.max(extentValue(id) * pixels, minNodeSize)
  const extents = columns.map(column => column ? column.reduce((total, id) => total + size(id), 0) + (column.length - 1) * nodeGap : 0)
  const largest = extents.reduce((max, extent) => Math.max(max, extent), 0)
  const place = new Map<string, { u: number; v: number; size: number; rank: number; order: number }>()
  columns.forEach((column, rank) => {
    if (!column) return
    let v = padding + (largest - extents[rank]!) / 2
    column.forEach((id, order) => {
      place.set(id, { u: inset + rank * (nodeThickness + rankGap), v, size: size(id), rank, order })
      v += size(id) + nodeGap
    })
  })
  const rankCount = columns.length
  const along = Math.max(1, 2 * inset + Math.max(0, rankCount * (nodeThickness + rankGap) - rankGap))
  const across = Math.max(1, padding + largest + deepest + padding)

  // Band stacks from the top of each node side: forward bands sorted by the position of their other end (then input
  // order), then reference bands with the deepest lane first.
  const centre = (id: string) => place.get(id)!.v + place.get(id)!.size / 2
  const outStacks = new Map<string, number[]>(), inStacks = new Map<string, number[]>()
  const push = (map: Map<string, number[]>, key: string, i: number) => {
    const list = map.get(key)
    if (list) list.push(i)
    else map.set(key, [i])
  }
  bands.forEach(({ edge }, i) => {
    push(outStacks, edge.from, i)
    push(inStacks, edge.to, i)
  })
  const sourceV = new Map<number, number>(), targetV = new Map<number, number>()
  for (const [stacks, end, offsets] of [[outStacks, 'to', sourceV], [inStacks, 'from', targetV]] as const) {
    for (const [id, list] of stacks) {
      list.sort((a, b) => {
        const la = lanes.get(a), lb = lanes.get(b)
        if (la || lb) return !la ? -1 : !lb ? 1 : lb.index - la.index
        return centre(bands[a]!.edge[end]) - centre(bands[b]!.edge[end]) || a - b
      })
      let v = place.get(id)!.v
      for (const i of list) {
        offsets.set(i, v)
        v += bands[i]!.thickness
      }
    }
  }

  // From abstract to chart coordinates.
  const vertical = isVerticalDirection(direction)
  const mirrored = direction === 'RL' || direction === 'BT'
  const point = (u: number, v: number) => {
    const a = mirrored ? along - u : u
    return vertical ? { x: v, y: a } : { x: a, y: v }
  }
  const pathOf = (commands: [string, ...[number, number][]][]) => commands.map(([command, ...points]) => command + ' '
    + points.map(([u, v]) => { const p = point(u, v); return coordinate(p.x) + ' ' + coordinate(p.y) }).join(', ')).join(' ')
  const boxes = new Map<string, GraphBox>()
  for (const { id } of nodes) {
    const { u, v, size: extent, rank } = place.get(id)!
    const a = mirrored ? along - u - nodeThickness : u
    boxes.set(id, vertical
      ? { x: v, y: a, width: extent, height: nodeThickness, rank }
      : { x: a, y: v, width: nodeThickness, height: extent, rank })
  }
  // The faces of a box that the flow leaves and enters.
  const { exit, entry } = graphFlowSides(direction)
  const byId = new Map<string, N>(nodes.map(node => [node.id, node]))

  const paths = new Map<string, string>()
  const result: GraphFlowBand[] = bands.map(({ edge, amount, thickness }, i) => {
    const width = Math.max(thickness, minBandWidth)
    const source = place.get(edge.from)!, target = place.get(edge.to)!
    const selfLoop = edge.from === edge.to
    const label = `${nodeName(byId.get(edge.from)!)} → ${nodeName(byId.get(edge.to)!)}: ${format(amount, displayUnit)}`
    const u1 = source.u + nodeThickness, u2 = target.u
    const v1 = sourceV.get(i)! + thickness / 2, v2 = targetV.get(i)! + thickness / 2
    const lane = lanes.get(i)
    let path: string
    if (lane) {
      const v = padding + largest + lane.depth
      path = pathOf([['M', [u1, v1]], ['L', [u1 + lane.reach, v1]], ['L', [u1 + lane.reach, v]], ['L', [u2 - lane.reach, v]], ['L', [u2 - lane.reach, v2]], ['L', [u2, v2]]])
    } else {
      const middle = (u1 + u2) / 2
      path = pathOf([['M', [u1, v1]], ['C', [middle, v1], [middle, v2], [u2, v2]]])
    }
    paths.set(edge.id, path)
    return {
      edgeId: edge.id, from: edge.from, to: edge.to, quantity: amount, unit: displayUnit, thickness, width, reference: reference.has(i), selfLoop,
      sourceSide: exit, targetSide: entry, sourceOffset: sourceV.get(i)! - source.v, targetOffset: targetV.get(i)! - target.v, path, label,
    }
  })

  const flowNodes: GraphFlowNode[] = nodes.map(({ id }) => {
    const total = totals.get(id)!, { rank, order } = place.get(id)!
    return {
      id, box: boxes.get(id)!, rank, order, inflow: total.inflow, outflow: total.outflow, difference: total.outflow - total.inflow,
      value: value(id), referenceInflow: total.referenceInflow, referenceOutflow: total.referenceOutflow,
    }
  })
  return {
    boxes, paths, edgeLabels: new Map(), width: vertical ? across : along, height: vertical ? along : across,
    unit: displayUnit, scale: pixels, direction, nodes: flowNodes, bands: result, excluded,
  }
}

/**
 * The bands of a flow projection as the NetworkGraph `edgeBands` prop and the `renderGraphSvg` option expect them:
 * the drawn width, the reference flag and the accessible label, by edge ID.
 */
export function graphFlowBands(flow: Pick<GraphFlowLayout, 'bands'>): Map<string, GraphEdgeBand> {
  return new Map(flow.bands.map(band => [band.edgeId, { width: band.width, reference: band.reference, label: band.label }]))
}

/**
 * The default dash pattern of a reference band of the given drawn width: `10 6` for thin bands, lengthened with the
 * width (dash twice, gap at least three quarters of it) so a wide band reads as a dashed band rather than a comb of
 * stripes. For a straight-segment path (`M`/`L` commands, as `layoutFlowGraph` routes loops) the gaps are evened out so
 * the band starts and ends with a dash at its nodes.
 */
export function graphReferenceDash(width: number, path?: string) {
  const round = (value: number) => Math.round(value * 100) / 100
  const dash = Math.max(10, width * 2)
  let gap = Math.max(6, width * 0.75)
  const length = path === undefined ? undefined : polylineLength(path)
  if (length !== undefined) {
    const count = Math.floor((length + gap) / (dash + gap))
    if (count > 1) gap = (length - count * dash) / (count - 1)
  }
  return `${round(dash)} ${round(gap)}`
}

/** The length of a path made only of absolute `M` and `L` commands, or undefined for any other path. */
function polylineLength(path: string) {
  if (!/^\s*M[\s\d.,eE+-]*(L[\s\d.,eE+-]*)*$/.test(path)) return undefined
  let length = 0, last: [number, number] | undefined
  for (const match of path.matchAll(/([ML])([^ML]*)/g)) {
    const command = match[1], numbers = match[2]!.trim().split(/[\s,]+/).filter(Boolean).map(Number)
    if (numbers.length % 2 || numbers.some(value => !Number.isFinite(value))) return undefined
    for (let i = 0; i < numbers.length; i += 2) {
      const point: [number, number] = [numbers[i]!, numbers[i + 1]!]
      if (last && !(command === 'M' && i === 0)) length += Math.hypot(point[0] - last[0], point[1] - last[1])
      last = point
    }
  }
  return length
}

/** Validates an `edgeBands` map: every width finite and at least 0. Throws RangeError naming the edge. */
export function assertGraphEdgeBands(bands: ReadonlyMap<string, GraphEdgeBand>, owner: string) {
  for (const [id, band] of bands) {
    if (!band || typeof band.width !== 'number' || !Number.isFinite(band.width) || band.width < 0) {
      throw new RangeError(`${owner}: the band width of edge ${id} must be finite and nonnegative`)
    }
  }
}

/** Edges in drawing order for bands: wider bands first so thinner ones stay on top, then the other edges, each stably. */
export function graphBandOrder<E extends { id: string }>(edges: readonly E[], bands: ReadonlyMap<string, GraphEdgeBand>): E[] {
  return edges.map((edge, index) => ({ edge, index, width: bands.get(edge.id)?.width }))
    .sort((a, b) => (a.width === undefined ? 1 : 0) - (b.width === undefined ? 1 : 0) || (b.width ?? 0) - (a.width ?? 0) || a.index - b.index)
    .map(item => item.edge)
}
