// Drag-preview rerouting for `avoidNodes`. A box that a preview moves or resizes can now cross, or no longer need to
// avoid, the route of an edge it does not touch. The segments of the saved routes the router draws around boxes
// (orthogonal, without waypoints, not self-loops) are indexed once per saved layout, so each preview frame finds those
// edges with a spatial query of the old and new clearance areas of the changed boxes and reroutes them too.
import type { GraphBox, GraphEdge, GraphLayout, GraphPoint } from '../../core/graph.js'
import type { GraphEdgeStyle } from '../../core/graphRouting.js'
import { SpatialGrid, graphPathPolylines, segmentMeetsRect } from '../../core/graphSpatial.js'

/** The indexed route segments of a saved layout, with the edge that owns each one. */
export type AvoidedRoutes = { grid: SpatialGrid; owners: string[]; segments: [GraphPoint, GraphPoint][]; clearance: number }

/** Indexes the segments of the routes in `routed` that avoid node boxes; `edgeStyle` is the default style of the edges. */
export function indexAvoidedRoutes(
  routed: GraphLayout, edges: readonly GraphEdge[], edgeStyle: GraphEdgeStyle, clearance: number,
): AvoidedRoutes {
  let size = 0
  for (const box of routed.boxes.values()) size += (box.width + box.height) / 2
  const grid = new SpatialGrid(routed.boxes.size ? size / routed.boxes.size : 64)
  const owners: string[] = [], segments: [GraphPoint, GraphPoint][] = []
  for (const edge of edges) {
    if (edge.from === edge.to || edge.points?.length || (edge.edgeStyle ?? edgeStyle) !== 'orthogonal') continue
    const path = routed.paths.get(edge.id)
    if (path === undefined) continue
    for (const line of graphPathPolylines(path)) {
      for (let i = 1; i < line.length; i++) {
        const a = line[i - 1]!, b = line[i]!
        grid.insert({ x1: Math.min(a.x, b.x), y1: Math.min(a.y, b.y), x2: Math.max(a.x, b.x), y2: Math.max(a.y, b.y) })
        owners.push(edge.id)
        segments.push([a, b])
      }
    }
  }
  return { grid, owners, segments, clearance }
}

/**
 * The edges, other than those in `skip`, whose saved route meets the old or new clearance area of a changed box. Past
 * `limit` such edges it returns none: they follow once the move is saved.
 */
export function obstructedEdges(
  index: AvoidedRoutes, changed: ReadonlyMap<string, GraphBox>, before: ReadonlyMap<string, GraphBox>, skip: ReadonlySet<string>,
  limit: number,
) {
  const c = index.clearance
  const found = new Set<string>()
  for (const [id, box] of changed) {
    for (const area of [before.get(id), box]) {
      if (!area) continue
      const rect = { x1: area.x - c, y1: area.y - c, x2: area.x + area.width + c, y2: area.y + area.height + c }
      index.grid.visit(rect, (i) => {
        const owner = index.owners[i]!
        if (skip.has(owner) || found.has(owner)) return
        const [a, b] = index.segments[i]!
        if (segmentMeetsRect(a, b, rect, false)) found.add(owner)
      })
      if (found.size > limit) return []
    }
  }
  return [...found]
}
