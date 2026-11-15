// Internal helper for the curve of an edge whose node was moved or resized. Not exported from the package entry
// points; `applyGraphPositions` and `applyGraphSizes` draw rerouted edges with it, and NetworkGraph uses it to reroute
// only the edges of the dragged nodes during a preview.
import type { GraphBox, GraphLayoutDirection, GraphPoint } from './graph.js'

/** The path and label anchor of an edge between two boxes, as drawn after a move. A self-loop passes the same box twice. */
export function graphIncidentCurve(
  source: GraphBox, target: GraphBox, selfLoop: boolean, direction: GraphLayoutDirection,
): { path: string; label: GraphPoint } {
  if (selfLoop) {
    const x = source.x + source.width
    const y = source.y + source.height / 2
    return { path: `M ${x} ${y} C ${x + 30} ${y + 18}, ${x + 30} ${y - 28}, ${x} ${y - 12}`, label: { x: x + 21, y: y - 16 } }
  }
  if (direction === 'TB' || direction === 'BT') {
    const forward = target.y + target.height / 2 >= source.y + source.height / 2
    const x1 = source.x + source.width / 2, x2 = target.x + target.width / 2
    const y1 = source.y + (forward ? source.height : 0), y2 = target.y + (forward ? 0 : target.height)
    const mid = (y1 + y2) / 2
    return { path: `M ${x1} ${y1} C ${x1} ${mid}, ${x2} ${mid}, ${x2} ${y2}`, label: { x: (x1 + x2) / 2, y: mid - 6 } }
  }
  const forward = target.x + target.width / 2 >= source.x + source.width / 2
  const x1 = source.x + (forward ? source.width : 0), x2 = target.x + (forward ? 0 : target.width)
  const y1 = source.y + source.height / 2, y2 = target.y + target.height / 2
  const mid = (x1 + x2) / 2
  return { path: `M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`, label: { x: mid, y: (y1 + y2) / 2 - 6 } }
}
