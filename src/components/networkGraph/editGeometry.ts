// The arithmetic of NetworkGraph's moves, keyboard steps, snapping and resizes, in chart units. Every result keeps
// positions nonnegative, as saved positions must be.
import type { GraphBox, GraphNodeSize, GraphPoint } from '../../core/graph.js'
import type { GraphRect } from '../../core/graphView.js'
import { graphAlignmentGuides, type GraphAlignmentGuide } from '../../core/graphSnapping.js'

/** Unit steps of the arrow keys. */
export const arrowOffsets: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1],
}

export function clampPoint(point: GraphPoint): GraphPoint {
  return { x: Math.max(0, point.x), y: Math.max(0, point.y) }
}

export function snapValue(value: number, grid: number) {
  return Math.round(value / grid) * grid + 0
}

/** The next grid line (or four with Shift) from a value in a direction, or a plain step of 10 (40) without a grid. */
export function stepValue(value: number, direction: number, shift: boolean, grid: number | undefined) {
  if (!direction) return value
  if (grid === undefined) return value + direction * (shift ? 40 : 10)
  const cells = shift ? 4 : 1
  return direction > 0 ? (Math.floor(value / grid + 1e-9) + cells) * grid : (Math.ceil(value / grid - 1e-9) - cells) * grid + 0
}

/** Moves every position by the same offset, reduced so that none becomes negative. */
export function movePositions(before: ReadonlyMap<string, GraphPoint>, dx: number, dy: number) {
  for (const point of before.values()) {
    dx = Math.max(dx, -point.x)
    dy = Math.max(dy, -point.y)
  }
  return new Map([...before].map(([id, point]) => [id, { x: point.x + dx, y: point.y + dy }]))
}

/** The bounding box of nodes at the given positions, with their sizes from `boxes`. */
export function movedBounds(before: ReadonlyMap<string, GraphPoint>, boxes: ReadonlyMap<string, GraphBox>): GraphRect {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
  for (const [id, point] of before) {
    const box = boxes.get(id)!
    left = Math.min(left, point.x)
    top = Math.min(top, point.y)
    right = Math.max(right, point.x + box.width)
    bottom = Math.max(bottom, point.y + box.height)
  }
  return { x: left, y: top, width: right - left, height: bottom - top }
}

/**
 * The reference point of a move: the top-left corner of the dragged or focused node, or of the bounding box of the
 * moved nodes. It lands on the grid; the other moved nodes keep their offsets from it.
 */
export function referencePoint(before: ReadonlyMap<string, GraphPoint>, node: string | undefined, boxes: ReadonlyMap<string, GraphBox>): GraphPoint {
  return (node === undefined ? undefined : before.get(node)) ?? movedBounds(before, boxes)
}

// The lowest reference coordinate that keeps every moved node at a nonnegative position, on the grid when given.
function clampTarget(start: number, target: number, low: number, grid?: number) {
  if (target - start >= low) return target
  return grid === undefined ? start + low : Math.ceil((start + low) / grid - 1e-9) * grid + 0
}

/** The positions after moving the reference point to `target`; `node` (the reference node, if any) lands exactly on it. */
export function placeMoved(
  before: ReadonlyMap<string, GraphPoint>, reference: GraphPoint, target: GraphPoint, node?: string, gridX?: number, gridY?: number,
) {
  let lowX = -Infinity, lowY = -Infinity
  for (const point of before.values()) {
    lowX = Math.max(lowX, -point.x)
    lowY = Math.max(lowY, -point.y)
  }
  const x = clampTarget(reference.x, target.x, lowX, gridX), y = clampTarget(reference.y, target.y, lowY, gridY)
  const dx = x - reference.x, dy = y - reference.y
  return new Map([...before].map(([id, point]) => [id, id === node
    ? { x, y } : { x: Math.max(0, point.x + dx), y: Math.max(0, point.y + dy) }]))
}

export type Corner = 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight'
export const corners: readonly Corner[] = ['topLeft', 'topRight', 'bottomLeft', 'bottomRight']

/** Whether a corner controls the left (`west`) and top (`north`) edges of a box. */
export function cornerSides(corner: Corner) {
  return { west: corner === 'topLeft' || corner === 'bottomLeft', north: corner === 'topLeft' || corner === 'topRight' }
}

/** Moves the box edges that a corner controls, keeping the opposite edges, the minimum size and a nonnegative origin. */
export function resizeBox(box: GraphRect, corner: Corner, left: number, top: number, right: number, bottom: number, min: GraphNodeSize): GraphRect {
  const { west, north } = cornerSides(corner)
  const x0 = west ? Math.max(0, Math.min(left, box.x + box.width - min.width)) : box.x
  const x1 = west ? box.x + box.width : Math.max(box.x + min.width, right)
  const y0 = north ? Math.max(0, Math.min(top, box.y + box.height - min.height)) : box.y
  const y1 = north ? box.y + box.height : Math.max(box.y + min.height, bottom)
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

/** A value on the grid, or the value itself without one. */
export function snapTo(value: number, grid: number | undefined) {
  return grid === undefined ? value : snapValue(value, grid)
}

/** Plain copies of an edge's waypoints. */
export function copyPoints(points: readonly GraphPoint[] | undefined): GraphPoint[] {
  return (points ?? []).map(point => ({ x: point.x, y: point.y }))
}

/**
 * The positions of a pointer drag by `dx`, `dy` with a grid or alignment guides: the reference point of the move (see
 * referencePoint) snaps and the other moved nodes keep their offsets from it. With `guides`, the moved bounds snap to
 * the edges and centres of `guides.others` within `guides.threshold` chart units, guides win over the grid on the
 * axis they align, and the result carries the guide lines of the final position.
 */
export function snappedMove(
  before: ReadonlyMap<string, GraphPoint>, node: string | undefined, boxes: ReadonlyMap<string, GraphBox>, dx: number, dy: number,
  grid: number | undefined, guides?: { others: readonly GraphRect[]; threshold: number },
): { positions: Map<string, GraphPoint>; guides?: GraphAlignmentGuide[] } {
  const reference = referencePoint(before, node, boxes)
  const bounds = movedBounds(before, boxes)
  let gridX = grid, gridY = grid
  if (guides) {
    const match = graphAlignmentGuides({ ...bounds, x: bounds.x + dx, y: bounds.y + dy }, guides.others, guides.threshold)
    if (match.guides.some(guide => guide.axis === 'x')) {
      dx += match.dx
      gridX = undefined
    }
    if (match.guides.some(guide => guide.axis === 'y')) {
      dy += match.dy
      gridY = undefined
    }
  }
  const target = {
    x: gridX === undefined ? reference.x + dx : snapValue(reference.x + dx, gridX),
    y: gridY === undefined ? reference.y + dy : snapValue(reference.y + dy, gridY),
  }
  const positions = placeMoved(before, reference, target, node, gridX, gridY)
  // Guides for the final position, which may also be aligned by the grid or the nonnegative clamp.
  return { positions, guides: guides && graphAlignmentGuides(movedBounds(positions, boxes), guides.others, 1e-6).guides }
}

/**
 * The positions of an arrow key move by `offset` (unit steps): 10 (40 with Shift) without a grid; with one, the
 * reference point steps to the next grid line (four with Shift) and `node`, the focused node, lands on it.
 */
export function keyMove(
  before: ReadonlyMap<string, GraphPoint>, node: string | undefined, boxes: ReadonlyMap<string, GraphBox>,
  offset: readonly [number, number], shift: boolean, grid: number | undefined,
) {
  if (grid === undefined) {
    const step = shift ? 40 : 10
    return movePositions(before, offset[0] * step, offset[1] * step)
  }
  const anchor = node !== undefined && before.has(node) ? node : undefined
  const reference = referencePoint(before, anchor, boxes)
  const target = { x: stepValue(reference.x, offset[0], shift, grid), y: stepValue(reference.y, offset[1], shift, grid) }
  return placeMoved(before, reference, target, anchor, grid, grid)
}

/** The box after an arrow key step (see stepValue) of the edges that a resize handle's corner controls. */
export function keyResize(
  before: GraphRect, corner: Corner, offset: readonly [number, number], shift: boolean, grid: number | undefined, min: GraphNodeSize,
) {
  const step = (value: number, direction: number) => stepValue(value, direction, shift, grid)
  const { west, north } = cornerSides(corner)
  const right = before.x + before.width, bottom = before.y + before.height
  return resizeBox(before, corner,
    west ? step(before.x, offset[0]) : before.x, north ? step(before.y, offset[1]) : before.y,
    west ? right : step(right, offset[0]), north ? bottom : step(bottom, offset[1]), min)
}

/** The box after a pointer drag of a resize handle by `dx`, `dy` chart units, with the moved edges on the grid. */
export function dragResize(box: GraphRect, corner: Corner, dx: number, dy: number, grid: number | undefined, min: GraphNodeSize) {
  return resizeBox(box, corner, snapTo(box.x + dx, grid), snapTo(box.y + dy, grid),
    snapTo(box.x + box.width + dx, grid), snapTo(box.y + box.height + dy, grid), min)
}
