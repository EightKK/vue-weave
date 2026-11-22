import type { GraphPoint } from './graph.js'
import { isFiniteGraphPoint, isFiniteRect } from './graphGeometry.js'
import { checkLayoutNumber } from './graphOptions.js'
import type { GraphRect } from './graphView.js'

/**
 * An alignment guide in chart coordinates. Axis `x` is a vertical line at `x = position` that runs from `y = from`
 * to `y = to`; axis `y` is a horizontal line at `y = position` that runs from `x = from` to `x = to`.
 */
export interface GraphAlignmentGuide {
  axis: 'x' | 'y'
  position: number
  from: number
  to: number
}

/** The shift that aligns a moving rectangle with its nearest neighbours, and the guides of the aligned position. */
export interface GraphAlignment {
  dx: number
  dy: number
  guides: GraphAlignmentGuide[]
}

type Axis = 'x' | 'y'

// Anchors compare equal within this distance, so a shift computed in floating point still counts as aligned.
const alignedWithin = 1e-9

/** Start, centre and end of a rectangle along an axis. */
function anchors(rect: GraphRect, axis: Axis): [number, number, number] {
  const start = axis === 'x' ? rect.x : rect.y
  const size = axis === 'x' ? rect.width : rect.height
  return [start, start + size / 2, start + size]
}

function nearestShift(moving: GraphRect, others: readonly GraphRect[], threshold: number, axis: Axis) {
  const own = anchors(moving, axis)
  let best: number | undefined, distance = Infinity
  for (const other of others) {
    const target = anchors(other, axis)
    for (const from of own) {
      for (const to of target) {
        const shift = to - from
        const gap = Math.abs(shift)
        // Strictly closer only: on a tie the earlier rectangle and the earlier anchors win.
        if (gap <= threshold && gap < distance) {
          best = shift
          distance = gap
        }
      }
    }
  }
  return best
}

function collectGuides(moving: GraphRect, others: readonly GraphRect[], axis: Axis) {
  const own = anchors(moving, axis)
  const across: Axis = axis === 'x' ? 'y' : 'x'
  const [movingFrom, , movingTo] = anchors(moving, across)
  const lines = new Map<number, GraphAlignmentGuide>()
  for (const other of others) {
    const target = anchors(other, axis)
    const [otherFrom, , otherTo] = anchors(other, across)
    for (const from of own) {
      for (const to of target) {
        if (Math.abs(to - from) > alignedWithin * Math.max(1, Math.abs(to))) continue
        let line: GraphAlignmentGuide | undefined
        for (const [position, existing] of lines) {
          if (Math.abs(position - to) <= alignedWithin * Math.max(1, Math.abs(to))) line = existing
        }
        if (!line) lines.set(to, line = { axis, position: to, from: movingFrom, to: movingTo })
        line.from = Math.min(line.from, otherFrom)
        line.to = Math.max(line.to, otherTo)
      }
    }
  }
  return [...lines.values()].sort((a, b) => a.position - b.position)
}

/**
 * Aligns a moving rectangle with other rectangles. On each axis the start, centre and end of `moving` (left, centre
 * and right on x; top, middle and bottom on y) are compared with the same three anchors of every rectangle in
 * `others`, and the smallest shift whose distance is at most `threshold` is returned as `dx` or `dy` (0 when nothing
 * is close enough). Ties go to the earlier rectangle in `others`, then to the start, centre and end anchors of
 * `moving` in that order, then to those of the other rectangle. `guides` lists one line per aligned position of the
 * shifted rectangle, x guides first, each sorted by position and spanning the shifted rectangle and every rectangle
 * aligned at that position. All values are in chart units. Throws a RangeError for a negative or non-finite
 * threshold and for rectangles with non-finite values or a negative size.
 */
export function graphAlignmentGuides(moving: GraphRect, others: readonly GraphRect[], threshold: number): GraphAlignment {
  checkLayoutNumber('threshold', threshold, 'nonnegative')
  if (!isFiniteRect(moving)) throw new RangeError('The moving rectangle needs finite coordinates and a nonnegative size')
  for (let index = 0; index < others.length; index++) {
    if (!isFiniteRect(others[index])) throw new RangeError('Alignment rectangle ' + index + ' needs finite coordinates and a nonnegative size')
  }
  const dx = nearestShift(moving, others, threshold, 'x')
  const dy = nearestShift(moving, others, threshold, 'y')
  const shifted = { ...moving, x: moving.x + (dx ?? 0), y: moving.y + (dy ?? 0) }
  const guides = [
    ...dx === undefined ? [] : collectGuides(shifted, others, 'x'),
    ...dy === undefined ? [] : collectGuides(shifted, others, 'y'),
  ]
  return { dx: dx ?? 0, dy: dy ?? 0, guides }
}

/**
 * Rounds both coordinates of a point to the nearest multiple of `grid`. Throws a RangeError for a grid that is not a
 * positive finite number or a point with non-finite coordinates. Returns a new point.
 */
export function snapGraphPoint(point: GraphPoint, grid: number): GraphPoint {
  checkLayoutNumber('grid', grid, 'positive')
  if (!isFiniteGraphPoint(point)) throw new RangeError('A snapped point needs finite coordinates')
  // Adding 0 turns a rounded -0 into 0.
  return { x: Math.round(point.x / grid) * grid + 0, y: Math.round(point.y / grid) * grid + 0 }
}
