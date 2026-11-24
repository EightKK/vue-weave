// The culling bounds of NetworkGraph's saved layouts. A saved change (a drop, a resize) usually changes a few paths, so
// the bounds of the other edges are taken from the previous saved layout instead of parsing every path again.
import type { GraphLayout } from '../../core/graph.js'
import { graphLayoutBounds, type GraphBounds, type GraphRect } from '../../core/graphView.js'

type BoundsLayout = Pick<GraphLayout, 'boxes' | 'paths' | 'edgeLabels'>

/**
 * `graphLayoutBounds(layout)`, taking the rectangle of each edge whose path and label are the same in `before` from
 * `previous` (the bounds of `before`). The result equals `graphLayoutBounds(layout)`, in the same order.
 */
export function updateLayoutBounds(layout: BoundsLayout, before?: BoundsLayout, previous?: GraphBounds): GraphBounds {
  if (!before || !previous) return graphLayoutBounds(layout)
  // Edges measured again, in a layout of their own, and the rectangles kept (null for an edge without one).
  const paths = new Map<string, string>(), edgeLabels = new Map<string, { x: number; y: number }>()
  const kept = new Map<string, GraphRect | null>()
  for (const [id, path] of layout.paths) {
    const label = layout.edgeLabels.get(id), old = before.edgeLabels.get(id)
    if (before.paths.get(id) === path && (old === label || (old && label && old.x === label.x && old.y === label.y))) {
      kept.set(id, previous.edges.get(id) ?? null)
      continue
    }
    paths.set(id, path)
    if (label) edgeLabels.set(id, label)
  }
  const measured = graphLayoutBounds({ boxes: layout.boxes, paths, edgeLabels })
  if (!kept.size) return measured
  const edges = new Map<string, GraphRect>()
  for (const id of layout.paths.keys()) {
    const rect = kept.has(id) ? kept.get(id) : measured.edges.get(id)
    if (rect) edges.set(id, rect)
  }
  return { nodes: measured.nodes, edges }
}
