// NetworkGraph's opt-in edge label placement (`edgeLabelPlacement`). The saved layout places every label; a drag
// preview places again only the labels of the edges whose routes it changes and the labels near the nodes it changes,
// against the edges and nodes around them, so a frame stays cheap on large graphs. The whole set is placed again once
// the change is saved.
import type { GraphEdge, GraphLayout, GraphPoint } from '../../core/graph.js'
import {
  edgeLabelGeometry, placeGraphEdgeLabels, type EdgeLabelGeometry, type GraphEdgeLabelPlacement, type GraphEdgeLabelPlacementOptions,
} from '../../core/graphLabelPlacement.js'
import { defaultLabelReach, rectsMeet } from '../../core/graphSpatial.js'
import { graphPathBounds, type GraphRect } from '../../core/graphView.js'
import { LayeredMap } from './previewGeometry.js'

/** Validates the `edgeLabelPlacement` prop; undefined keeps the routers' midpoint labels. */
export function resolveEdgeLabelPlacement<E extends GraphEdge>(value: GraphEdgeLabelPlacement<E> | undefined): GraphEdgeLabelPlacementOptions<E> | undefined {
  if (value === undefined || value === 'midpoint') return undefined
  if (value === 'avoid') return {}
  if (value === null || typeof value !== 'object') throw new RangeError('edgeLabelPlacement must be midpoint, avoid or an options object')
  // The component draws `edge.label` and places every label itself.
  return { ...value, edgeIds: undefined, labelText: undefined } as GraphEdgeLabelPlacementOptions<E>
}

/**
 * The placement options with the widths of `edgeBands`: a band's label keeps its gap from the outer side of the band,
 * and other labels avoid the whole band. Edges without a band keep the `edgeWidth` of the options.
 */
export function withBandWidths<E extends GraphEdge>(
  options: GraphEdgeLabelPlacementOptions<E>, bands: ReadonlyMap<string, { width: number }> | undefined,
): GraphEdgeLabelPlacementOptions<E> {
  if (!bands?.size) return options
  const own = options.edgeWidth
  return { ...options, edgeWidth: edge => bands.get(edge.id)?.width ?? own?.(edge) }
}

function pathBounds(path: string | undefined): GraphRect | undefined {
  if (path === undefined) return undefined
  try {
    return graphPathBounds(path)
  } catch {
    return undefined
  }
}

function grown(rect: GraphRect, by: number): GraphRect {
  return { x: rect.x - by, y: rect.y - by, width: rect.width + 2 * by, height: rect.height + 2 * by }
}

/** The bounds of every edge path of a layout, computed once per saved layout. */
export function edgePathBounds(layout: GraphLayout, edges: readonly GraphEdge[]): ReadonlyMap<string, GraphRect> {
  const result = new Map<string, GraphRect>()
  for (const edge of edges) {
    const bounds = pathBounds(layout.paths.get(edge.id))
    if (bounds) result.set(edge.id, bounds)
  }
  return result
}

/**
 * Places the labels of a preview again: those of the `edgeIds` whose route the preview changes and those whose label
 * box lies near a changed node. Edges of `edgeIds` whose route is unchanged keep their saved anchors, so their labels
 * do not jump when a drag starts. Returns the preview with those labels and the IDs of all edges whose label it changes.
 */
export function placePreviewLabels<E extends GraphEdge>(
  preview: GraphLayout, saved: GraphLayout, edges: readonly E[], edgesById: ReadonlyMap<string, E>, savedBounds: ReadonlyMap<string, GraphRect>,
  changedNodes: readonly string[], edgeIds: readonly string[], options: GraphEdgeLabelPlacementOptions<E>,
): { layout: GraphLayout; edges: string[] } {
  const geometry: EdgeLabelGeometry<E> = edgeLabelGeometry(options)
  // How far a placed label can reach from its route: at least the default reach, more for long labels and wide edges.
  const reachOf = (edge: E) => {
    const size = geometry.size(edge, edge.label!)
    return Math.max(defaultLabelReach, geometry.gap + geometry.margin + size.width + size.height + 2 * geometry.halfWidth(edge))
  }
  const labelRect = (edge: E, anchor: GraphPoint): GraphRect => {
    const { width, height } = geometry.size(edge, edge.label!)
    return { x: anchor.x - width / 2, y: anchor.y - geometry.shift - height / 2, width, height }
  }
  const labels = new Map<string, GraphPoint | undefined>()
  const replace = new Set<string>()
  const current = new Map<string, GraphRect>()
  const areas: GraphRect[] = []
  for (const id of edgeIds) {
    const edge = edgesById.get(id)
    const path = preview.paths.get(id)
    if (edge?.label && path !== undefined && path === saved.paths.get(id)) {
      labels.set(id, saved.edgeLabels.get(id))
      continue
    }
    const bounds = pathBounds(path)
    if (bounds) current.set(id, bounds)
    if (!edge?.label || !bounds) continue
    replace.add(id)
    areas.push(grown(bounds, reachOf(edge)))
  }
  const boxes = changedNodes.flatMap(id => {
    const box = preview.boxes.get(id)
    return box ? [grown(box, defaultLabelReach)] : []
  })
  if (boxes.length) {
    for (const edge of edges) {
      if (replace.has(edge.id) || !edge.label) continue
      const anchor = labels.has(edge.id) ? labels.get(edge.id) : preview.edgeLabels.get(edge.id)
      if (!anchor) continue
      const rect = labelRect(edge, anchor)
      if (!boxes.some(box => rectsMeet(box, rect))) continue
      replace.add(edge.id)
      const bounds = current.get(edge.id) ?? savedBounds.get(edge.id)
      if (bounds) areas.push(grown(bounds, reachOf(edge)))
    }
    areas.push(...boxes)
  }
  if (!replace.size && !labels.size) return { layout: preview, edges: [...edgeIds] }
  const restored: GraphLayout = labels.size ? { ...preview, edgeLabels: new LayeredMap(preview.edgeLabels, labels) } : preview
  if (replace.size) {
    // Only the edges around the placed labels take part: their routes and kept labels are what those labels avoid.
    const nearby = edges.filter(edge => {
      if (replace.has(edge.id)) return true
      const bounds = current.get(edge.id) ?? savedBounds.get(edge.id)
      if (bounds === undefined) return false
      const anchor = edge.label ? restored.edgeLabels.get(edge.id) : undefined
      const reach = grown(bounds, defaultLabelReach)
      const label = anchor && labelRect(edge, anchor)
      return areas.some(area => rectsMeet(area, reach) || (label !== undefined && rectsMeet(area, label)))
    })
    const placed = placeGraphEdgeLabels(restored, nearby, { ...options, edgeIds: replace })
    for (const id of replace) labels.set(id, placed.edgeLabels.get(id))
  }
  const changed = new Set([...edgeIds, ...replace])
  return { layout: { ...preview, edgeLabels: new LayeredMap(preview.edgeLabels, labels) }, edges: [...changed] }
}
