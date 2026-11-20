// NetworkGraph's drag-preview layout. A node drag, resize or waypoint drag changes a few nodes or one edge, so the
// preview layout shares the saved layout's maps and recomputes only the edges that touch a changed node. The result
// equals arranging and routing the whole graph with the previewed positions, sizes and waypoints, as the saved layout
// is computed.
import { graphIncidentCurve } from '../../core/graphCurve.js'
import {
  routeGraphPorts, type GraphBox, type GraphEdge, type GraphLayout, type GraphLayoutDirection, type GraphLayoutRoute, type GraphNodeSize,
  type GraphPoint, type IdentifiedNode,
} from '../../core/graph.js'
import { isGraphRouteValid, type GraphRoutingPolicy } from '../../core/graphGeometry.js'
import { graphParallelSlots, type GraphParallelSlot } from '../../core/graphRouting.js'
import type { GraphRect } from '../../core/graphView.js'
import { LayeredMap, largestExtent, placeBox, type Extents } from './previewGeometry.js'

export type ParallelSlots = ReadonlyMap<string, GraphParallelSlot> | undefined
/** One edge routed on its own: its path and label, how far it stretches the layout, and its route metadata. */
export type SingleRoute = { path: string; label: GraphPoint | undefined; width: number; height: number; route: GraphLayoutRoute | undefined }

/** The nodes and edges a preview changes. */
export type PreviewChange = {
  moving: ReadonlyMap<string, GraphPoint> | undefined
  resizing: { id: string; box: GraphRect } | undefined
  reshaping: { id: string; points: GraphPoint[] } | undefined
}

/**
 * The saved layouts and indexes a preview is built from. The component implements the costly ones as getters of its
 * computed values, so they are only computed (and only tracked) once a preview needs them.
 */
export interface PreviewContext {
  /** The layout before saved positions and sizes. */
  readonly base: GraphLayout
  /** The base layout with saved positions and sizes. */
  readonly arranged: GraphLayout
  /** The arranged layout with every edge routed: the layout shown without a preview. */
  readonly saved: GraphLayout
  readonly positions: ReadonlyMap<string, GraphPoint> | undefined
  readonly sizes: ReadonlyMap<string, GraphNodeSize> | undefined
  readonly direction: GraphLayoutDirection
  readonly policy: GraphRoutingPolicy
  readonly nodesById: ReadonlyMap<string, IdentifiedNode>
  readonly edgesById: ReadonlyMap<string, GraphEdge>
  /** The IDs of the edges at each node. */
  readonly incidentEdges: ReadonlyMap<string, readonly string[]>
  readonly parallelSlots: ParallelSlots
  /** How far the saved positions and sizes stretch the layout. */
  readonly savedExtents: Extents
  /** How far the port routes of the redrawn port edges reach before they are clamped to the layout size. */
  readonly portReach: Extents
  /** How far the styled routes of the saved layout stretch it. */
  readonly routeExtents: Extents
  /** The edges that the edge routing draws itself (see `styled`). */
  readonly styledEdgeIds: readonly string[]
  /** Whether the edge routing draws an edge itself, with the given parallel slots (default: the saved ones). */
  styled(edge: GraphEdge, slots?: ParallelSlots): boolean
  /** One edge routed on its own over `boxes`. */
  route(boxes: Map<string, GraphBox>, edge: GraphEdge, path: string, label: GraphPoint | undefined, routes: boolean, slots: ParallelSlots): SingleRoute
  /** The edges outside `skip` that a changed box now obstructs or frees (`avoidNodes`). */
  obstructions(changed: ReadonlyMap<string, GraphBox>, before: ReadonlyMap<string, GraphBox>, skip: ReadonlySet<string>): readonly string[]
}

export function hasPorts(edge: GraphEdge) {
  return edge.fromPort !== undefined || edge.toPort !== undefined
}

/** The preview layout, the saved layout it was made from, and the nodes and edges whose geometry it changes. */
export function previewLayout(context: PreviewContext, { moving, resizing, reshaping }: PreviewChange) {
  // The indexes are read where they are needed, so a preview that does not need one does not depend on it.
  const { base, arranged, saved, positions, sizes, direction: dir } = context
  const pointOf = (id: string) => resizing?.id === id ? resizing.box : moving?.get(id) ?? positions?.get(id)
  const sizeOf = (id: string) => resizing?.id === id ? resizing.box : sizes?.get(id)
  // Changed nodes get the boxes the full arrangement would give them; every other box is the saved one.
  const changed = new Map<string, GraphBox>()
  let width = base.width, height = base.height
  for (const id of [...moving?.keys() ?? [], ...resizing ? [resizing.id] : []]) {
    const box = base.boxes.get(id)
    if (!box) continue
    const placed = placeBox(box, pointOf(id), sizeOf(id))
    changed.set(id, placed?.box ?? box)
    if (placed) {
      width = Math.max(width, placed.width)
      height = Math.max(height, placed.height)
    }
  }
  const rest = largestExtent(context.savedExtents, changed)
  width = Math.max(width, rest.width)
  height = Math.max(height, rest.height)
  const boxes = changed.size ? new LayeredMap(arranged.boxes, changed) : arranged.boxes
  // A node whose box differs from the layout box, so that its edges are drawn as curves between the final boxes.
  const placedNode = (id: string) => boxes.get(id) !== base.boxes.get(id)
  // Edges that touch a changed node, plus the reshaped edge, in input order of discovery.
  const ids = new Set<string>()
  for (const id of changed.keys()) for (const edgeId of context.incidentEdges.get(id) ?? []) ids.add(edgeId)
  if (reshaping) ids.add(reshaping.id)
  for (const id of context.obstructions(changed, arranged.boxes, ids)) ids.add(id)
  // With parallel spacing, an edge that gains waypoints leaves the parallel edges between its nodes, which spreads the
  // others again. Only the edges between the same two nodes can change their places.
  let slots = context.parallelSlots
  if (reshaping && slots) {
    const reshaped = context.edgesById.get(reshaping.id)!
    const pair = (context.incidentEdges.get(reshaped.from) ?? []).map(id => context.edgesById.get(id)!)
      .filter(edge => (edge.from === reshaped.from && edge.to === reshaped.to) || (edge.from === reshaped.to && edge.to === reshaped.from))
    const regrouped = graphParallelSlots(pair.map(edge => edge.id === reshaped.id ? { ...edge, points: reshaping.points } : edge))
    const moved = new Map<string, GraphParallelSlot | undefined>()
    for (const edge of pair) {
      const before = slots.get(edge.id), after = regrouped.get(edge.id)
      if (before?.index !== after?.index || before?.count !== after?.count) moved.set(edge.id, after)
    }
    if (moved.size) {
      slots = new LayeredMap(slots, moved)
      for (const id of moved.keys()) ids.add(id)
    }
  }
  const edges = [...ids].map(id => {
    const edge = context.edgesById.get(id)!
    return reshaping?.id === id ? { ...edge, points: reshaping.points } : edge
  })
  const paths = new Map<string, string>(), labels = new Map<string, GraphPoint | undefined>()
  // Route metadata, only when the layout has it: removed for a rerouted edge and replaced for a redrawn one.
  const routes = saved.routes && new Map<string, GraphLayoutRoute | undefined>()
  // With the preserve policy, the edges that keep the layout's path: a rerouted edge (touching a moved or resized node)
  // never does; any other edge has its layout box and path, so the check on the layout decides.
  const preserve = context.policy === 'preserve'
  const kept = new Set<string>()
  for (const edge of edges) {
    if (placedNode(edge.from) || placedNode(edge.to)) {
      const curve = graphIncidentCurve(boxes.get(edge.from)!, boxes.get(edge.to)!, edge.from === edge.to, dir)
      paths.set(edge.id, curve.path)
      labels.set(edge.id, curve.label)
      routes?.set(edge.id, undefined)
    } else {
      paths.set(edge.id, base.paths.get(edge.id)!)
      labels.set(edge.id, base.edgeLabels.get(edge.id))
      routes?.set(edge.id, arranged.routes?.get(edge.id))
      if (preserve && isGraphRouteValid(base, context.nodesById, edge)) kept.add(edge.id)
    }
  }
  // Ports. Their routes are clamped to the layout size, so a size change also reroutes the other port edges whose
  // control points reach past the smaller of the two sizes; the routes of the rest stay as saved. Kept paths are not
  // redrawn, and the reach of the saved layout only lists redrawn port edges.
  const ports = edges.filter(edge => hasPorts(edge) && !kept.has(edge.id))
  if (width !== arranged.width || height !== arranged.height) {
    const reach = context.portReach, limitX = Math.min(width, arranged.width), limitY = Math.min(height, arranged.height)
    const clamped = new Set<string>()
    for (const item of reach.byWidth) {
      if (item.width <= limitX) break
      clamped.add(item.id)
    }
    for (const item of reach.byHeight) {
      if (item.height <= limitY) break
      clamped.add(item.id)
    }
    for (const id of clamped) if (!ids.has(id)) ports.push(context.edgesById.get(id)!)
  }
  if (ports.length) {
    const arrangedPath = (id: string) => paths.has(id) ? paths.get(id)! : arranged.paths.get(id)!
    const arrangedLabel = (id: string) => labels.has(id) ? labels.get(id) : arranged.edgeLabels.get(id)
    // Every edge passed here is redrawn, so the default policy applies to this partial layout.
    const routed = routeGraphPorts({
      boxes, width, height, paths: new Map(ports.map(edge => [edge.id, arrangedPath(edge.id)])),
      edgeLabels: new Map(ports.flatMap(edge => {
        const label = arrangedLabel(edge.id)
        return label ? [[edge.id, label] as const] : []
      })),
      ...routes && { routes: new Map() },
    }, context.nodesById, ports, dir)
    for (const edge of ports) {
      paths.set(edge.id, routed.paths.get(edge.id)!)
      labels.set(edge.id, routed.edgeLabels.get(edge.id))
      routes?.set(edge.id, routed.routes?.get(edge.id))
    }
  }
  // Edge styles, waypoints and parallel edges, as routeGraphEdges draws them after the ports. A redrawn port route is a
  // built-in route, so the preserve policy routes it again like any styled edge.
  if (edges.some(edge => context.styled(edge, slots)) || context.styledEdgeIds.some(id => !ids.has(id))) {
    const others = largestExtent(context.routeExtents, ids)
    width = Math.max(width, others.width)
    height = Math.max(height, others.height)
    for (const edge of edges) {
      if (!context.styled(edge, slots) || kept.has(edge.id)) continue
      const route = context.route(boxes, edge, paths.get(edge.id)!, labels.get(edge.id), Boolean(routes), slots)
      paths.set(edge.id, route.path)
      labels.set(edge.id, route.label)
      routes?.set(edge.id, route.route)
      width = Math.max(width, route.width)
      height = Math.max(height, route.height)
    }
    // A styled edge outside the changed set keeps its saved route, whatever its port route became.
    for (const id of [...paths.keys()]) {
      if (ids.has(id) || !context.styled(context.edgesById.get(id)!)) continue
      paths.delete(id)
      labels.delete(id)
      routes?.delete(id)
    }
  }
  const preview: GraphLayout = {
    boxes, paths: new LayeredMap(saved.paths, paths), edgeLabels: new LayeredMap(saved.edgeLabels, labels), width, height,
    ...saved.routes && routes && { routes: new LayeredMap(saved.routes, routes) },
  }
  return { layout: preview, saved, nodes: [...changed.keys()], edges: [...paths.keys()] }
}
