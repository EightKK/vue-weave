// The arithmetic of NetworkGraph's moves, keyboard steps, snapping and resizes, in chart units. Every result keeps
// positions nonnegative, as saved positions must be.
import type { GraphBox, GraphNodeSize, GraphPoint } from '../../core/graph.js'
import type { GraphRect } from '../../core/graphView.js'

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
