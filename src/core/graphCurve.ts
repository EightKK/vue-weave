// Internal helpers for the curve of an edge whose node was moved or resized, and for the curve of an edge with a named
// port. Not exported from the package entry points; `applyGraphPositions` and `applyGraphSizes` draw rerouted edges
// with them, `routeGraphPorts` draws port edges with them, and NetworkGraph uses them to reroute only the edges a drag
// preview changes.
import type { GraphBox, GraphLayoutDirection, GraphPoint, GraphPort } from './graph.js'

const outwardOffsets = { left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1] } as const

/**
 * The control points of the curve `routeGraphPorts` draws between two endpoints, before it clamps them to the layout:
 * each lies outward from its endpoint's side, a third of the distance between the endpoints and from 22 to 72 away.
 */
export function graphPortControls(
  from: GraphPoint & { side: GraphPort['side'] }, to: GraphPoint & { side: GraphPort['side'] },
): { a: GraphPoint; b: GraphPoint } {
  const distance = Math.min(72, Math.max(22, Math.hypot(to.x - from.x, to.y - from.y) / 3))
  const outward = (point: GraphPoint & { side: GraphPort['side'] }): GraphPoint => {
    const [dx, dy] = outwardOffsets[point.side]
    return { x: point.x + dx * distance, y: point.y + dy * distance }
  }
  return { a: outward(from), b: outward(to) }
}

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
