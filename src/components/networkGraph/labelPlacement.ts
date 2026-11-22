// NetworkGraph's opt-in edge label placement (`edgeLabelPlacement`). The saved layout places every label; a drag
// preview places again only the labels of the edges it reroutes and the labels near the nodes it changes, against the
// edges and nodes around them, so a frame stays cheap on large graphs. The whole set is placed again once the change
// is saved.
import type { GraphEdge, GraphLayout } from '../../core/graph.js'
import { placeGraphEdgeLabels, type GraphEdgeLabelPlacement, type GraphEdgeLabelPlacementOptions } from '../../core/graphLabelPlacement.js'
import { graphPathBounds, type GraphRect } from '../../core/graphView.js'
import { LayeredMap } from './previewGeometry.js'

// How far a label can reach from its route or from a changed node, in chart units (as graphLayoutBounds assumes).
const labelReach = 80

/** Validates the `edgeLabelPlacement` prop; undefined keeps the routers' midpoint labels. */
export function resolveEdgeLabelPlacement<E extends GraphEdge>(value: GraphEdgeLabelPlacement<E> | undefined): GraphEdgeLabelPlacementOptions<E> | undefined {
  if (value === undefined || value === 'midpoint') return undefined
  if (value === 'avoid') return {}
  if (value === null || typeof value !== 'object') throw new RangeError('edgeLabelPlacement must be midpoint, avoid or an options object')
  // The component draws `edge.label` and places every label itself.
  return { ...value, edgeIds: undefined, labelText: undefined } as GraphEdgeLabelPlacementOptions<E>
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

function meets(a: GraphRect, b: GraphRect) {
  return a.x <= b.x + b.width && b.x <= a.x + a.width && a.y <= b.y + b.height && b.y <= a.y + a.height
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
 * Places the labels of a preview again: those of the rerouted `edgeIds` and those whose saved anchor lies near a
 * changed node. Returns the preview with those labels and the IDs of all edges whose label it changes.
 */
export function placePreviewLabels<E extends GraphEdge>(
  preview: GraphLayout, edges: readonly E[], edgesById: ReadonlyMap<string, E>, savedBounds: ReadonlyMap<string, GraphRect>,
  changedNodes: readonly string[], edgeIds: readonly string[], options: GraphEdgeLabelPlacementOptions<E>,
): { layout: GraphLayout; edges: string[] } {
  const replace = new Set<string>()
  const current = new Map<string, GraphRect>()
  const areas: GraphRect[] = []
  for (const id of edgeIds) {
    const bounds = pathBounds(preview.paths.get(id))
    if (bounds) current.set(id, bounds)
    if (!edgesById.get(id)?.label || !bounds) continue
    replace.add(id)
    areas.push(grown(bounds, labelReach))
  }
  const boxes = changedNodes.flatMap(id => {
    const box = preview.boxes.get(id)
    return box ? [grown(box, labelReach)] : []
  })
  if (boxes.length) {
    for (const edge of edges) {
      if (replace.has(edge.id) || !edge.label) continue
      const anchor = preview.edgeLabels.get(edge.id)
      if (!anchor || !boxes.some(box => meets(box, { x: anchor.x, y: anchor.y, width: 0, height: 0 }))) continue
      replace.add(edge.id)
      const bounds = current.get(edge.id) ?? savedBounds.get(edge.id)
      if (bounds) areas.push(grown(bounds, labelReach))
    }
    areas.push(...boxes)
  }
  if (!replace.size) return { layout: preview, edges: [...edgeIds] }
  // Only the edges around the placed labels take part: their routes and kept labels are what those labels avoid.
  const nearby = edges.filter(edge => {
    if (replace.has(edge.id)) return true
    const bounds = current.get(edge.id) ?? savedBounds.get(edge.id)
    return bounds !== undefined && areas.some(area => meets(area, grown(bounds, labelReach)))
  })
  const placed = placeGraphEdgeLabels(preview, nearby, { ...options, edgeIds: replace })
  const labels = new Map<string, { x: number; y: number } | undefined>()
  for (const id of replace) labels.set(id, placed.edgeLabels.get(id))
  const changed = new Set([...edgeIds, ...replace])
  return { layout: { ...preview, edgeLabels: new LayeredMap(preview.edgeLabels, labels) }, edges: [...changed] }
}
