// Internal spatial helpers: a uniform bucket grid of rectangles and a flattener for SVG path data. Used by the
// incremental layout, its change metrics, obstacle routing and NetworkGraph's drag preview. Not exported from the
// package entry points.
import type { GraphPoint } from './graph.js'

/** An axis-aligned rectangle by its corners. */
export interface SpatialRect {
  x1: number
  y1: number
  x2: number
  y2: number
}

const keyRange = 2 ** 25
// Rectangles that span more cells than this along an axis are kept in a list every query checks.
const maxSpan = 64

function cellKey(kx: number, ky: number) {
  return (kx + keyRange) * 2 ** 26 + (ky + keyRange)
}

function inRange(k: number) {
  return k > -keyRange && k < keyRange
}

/**
 * A bucket grid of rectangles identified by their insertion index. Each rectangle is entered in the cells it covers, or
 * in a short list when it is very large or far out, so a query visits the rectangles near an area in time proportional
 * to their number. Rectangles can be moved and removed.
 */
export class SpatialGrid {
  readonly cell: number
  private readonly buckets = new Map<number, number[]>()
  private readonly large = new Set<number>()
  private readonly rects: (SpatialRect | undefined)[] = []
  private readonly stamps: number[] = []
  private stamp = 0

  constructor(cell: number) {
    this.cell = Number.isFinite(cell) && cell > 0 ? cell : 1
  }

  get size() {
    return this.rects.length
  }

  rect(index: number): SpatialRect | undefined {
    return this.rects[index]
  }

  private span(rect: SpatialRect) {
    const kx1 = Math.floor(rect.x1 / this.cell), kx2 = Math.floor(rect.x2 / this.cell)
    const ky1 = Math.floor(rect.y1 / this.cell), ky2 = Math.floor(rect.y2 / this.cell)
    const large = kx2 - kx1 > maxSpan || ky2 - ky1 > maxSpan || !inRange(kx1) || !inRange(kx2) || !inRange(ky1) || !inRange(ky2)
    return { kx1, kx2, ky1, ky2, large }
  }

  private enter(index: number, rect: SpatialRect) {
    const { kx1, kx2, ky1, ky2, large } = this.span(rect)
    if (large) {
      this.large.add(index)
      return
    }
    for (let kx = kx1; kx <= kx2; kx++) {
      for (let ky = ky1; ky <= ky2; ky++) {
        const key = cellKey(kx, ky)
        const list = this.buckets.get(key)
        if (list) list.push(index)
        else this.buckets.set(key, [index])
      }
    }
  }

  private leave(index: number, rect: SpatialRect) {
    const { kx1, kx2, ky1, ky2, large } = this.span(rect)
    if (large) {
      this.large.delete(index)
      return
    }
    for (let kx = kx1; kx <= kx2; kx++) {
      for (let ky = ky1; ky <= ky2; ky++) {
        const key = cellKey(kx, ky)
        const list = this.buckets.get(key)
        if (!list) continue
        const at = list.indexOf(index)
        if (at >= 0) list.splice(at, 1)
        if (!list.length) this.buckets.delete(key)
      }
    }
  }

  /** Adds a rectangle and returns its index. */
  insert(rect: SpatialRect): number {
    const index = this.rects.length
    this.rects.push({ ...rect })
    this.stamps.push(0)
    this.enter(index, rect)
    return index
  }

  /** Moves a rectangle to a new place. */
  move(index: number, rect: SpatialRect) {
    const current = this.rects[index]
    if (current) this.leave(index, current)
    this.rects[index] = { ...rect }
    this.enter(index, rect)
  }

  /**
   * Calls `visit` once with every rectangle whose cells overlap the area, until it returns true; the caller tests the
   * exact geometry. Returns true when `visit` did.
   */
  visit(area: SpatialRect, visit: (index: number, rect: SpatialRect) => boolean | void): boolean {
    // A rectangle is visited once per query: its stamp is set to the query's on the first visit.
    const stamp = ++this.stamp
    const stamps = this.stamps, rects = this.rects
    for (const index of this.large) {
      if (stamps[index] === stamp) continue
      stamps[index] = stamp
      if (visit(index, rects[index]!)) return true
    }
    const kx1 = Math.floor(area.x1 / this.cell), kx2 = Math.floor(area.x2 / this.cell)
    const ky1 = Math.floor(area.y1 / this.cell), ky2 = Math.floor(area.y2 / this.cell)
    if ((kx2 - kx1 + 1) * (ky2 - ky1 + 1) > this.buckets.size) {
      for (let index = 0; index < rects.length; index++) {
        const rect = rects[index]
        if (!rect || stamps[index] === stamp) continue
        stamps[index] = stamp
        if (visit(index, rect)) return true
      }
      return false
    }
    for (let kx = Math.max(kx1, 1 - keyRange); kx <= Math.min(kx2, keyRange - 1); kx++) {
      for (let ky = Math.max(ky1, 1 - keyRange); ky <= Math.min(ky2, keyRange - 1); ky++) {
        const list = this.buckets.get(cellKey(kx, ky))
        if (!list) continue
        for (const index of list) {
          if (stamps[index] === stamp) continue
          stamps[index] = stamp
          if (visit(index, rects[index]!)) return true
        }
      }
    }
    return false
  }
}

/** The number of arguments of each SVG path command, by upper-case command letter. */
export const svgPathArgumentCounts: Readonly<Record<string, number>> = { M: 2, L: 2, H: 1, V: 1, C: 6, S: 4, Q: 4, T: 2, A: 7, Z: 0 }
const token = /([MLHVCSQTAZmlhvcsqtaz])|([+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)/g
const curveSteps = 16

/**
 * The polylines an SVG path traces, one per subpath: lines and corners as they are, cubic and quadratic Bézier curves
 * sampled at 16 steps, and arcs and the smooth shorthand commands (S, T) approximated by their control and end points.
 * Absolute and relative commands are read. Malformed data ends the path where it stops making sense.
 */
export function graphPathPolylines(path: string): GraphPoint[][] {
  const result: GraphPoint[][] = []
  let current: GraphPoint[] | undefined
  let command = '', x = 0, y = 0, startX = 0, startY = 0
  const values: number[] = []
  const add = (px: number, py: number) => {
    if (!current) {
      current = [{ x, y }]
      result.push(current)
    }
    current.push({ x: px, y: py })
    x = px
    y = py
  }
  const flush = () => {
    const count = svgPathArgumentCounts[command.toUpperCase()]
    if (count === undefined) return
    const relative = command !== command.toUpperCase()
    const upper = command.toUpperCase()
    while (values.length >= count && count > 0) {
      const args = values.splice(0, count)
      const ox = relative ? x : 0, oy = relative ? y : 0
      switch (upper) {
        case 'M':
          x = args[0]! + ox
          y = args[1]! + oy
          startX = x
          startY = y
          current = [{ x, y }]
          result.push(current)
          // Further pairs after a moveto are lines.
          command = relative ? 'l' : 'L'
          return flush()
        case 'L':
        case 'T':
          add(args[0]! + ox, args[1]! + oy)
          break
        case 'H':
          add(args[0]! + ox, y)
          break
        case 'V':
          add(x, args[0]! + oy)
          break
        case 'C': {
          const x0 = x, y0 = y
          const [x1, y1, x2, y2, x3, y3] = [args[0]! + ox, args[1]! + oy, args[2]! + ox, args[3]! + oy, args[4]! + ox, args[5]! + oy]
          for (let i = 1; i <= curveSteps; i++) {
            const t = i / curveSteps, u = 1 - t
            add(u * u * u * x0 + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
              u * u * u * y0 + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3)
          }
          break
        }
        case 'Q': {
          const x0 = x, y0 = y
          const [x1, y1, x2, y2] = [args[0]! + ox, args[1]! + oy, args[2]! + ox, args[3]! + oy]
          for (let i = 1; i <= curveSteps; i++) {
            const t = i / curveSteps, u = 1 - t
            add(u * u * x0 + 2 * u * t * x1 + t * t * x2, u * u * y0 + 2 * u * t * y1 + t * t * y2)
          }
          break
        }
        case 'S':
          add(args[0]! + ox, args[1]! + oy)
          add(args[2]! + ox, args[3]! + oy)
          break
        case 'A':
          add(args[5]! + ox, args[6]! + oy)
          break
      }
    }
  }
  for (const match of path.matchAll(token)) {
    if (match[1]) {
      flush()
      values.length = 0
      command = match[1]
      if (command === 'Z' || command === 'z') {
        if (current) add(startX, startY)
        current = undefined
      }
      continue
    }
    const value = Number(match[2])
    if (!Number.isFinite(value)) return result
    values.push(value)
  }
  flush()
  return result
}

/**
 * Whether the segment from `a` to `b` meets the rectangle. With `open`, only the interior counts (shrunk by `eps`), so
 * a segment along a border or ending on it does not; otherwise the border counts too (grown by `eps`).
 */
export function segmentMeetsRect(a: GraphPoint, b: GraphPoint, rect: SpatialRect, open: boolean, eps = 1e-6): boolean {
  const grow = open ? -eps : eps
  const x1 = rect.x1 - grow, y1 = rect.y1 - grow, x2 = rect.x2 + grow, y2 = rect.y2 + grow
  if (x1 > x2 || y1 > y2) return false
  // Liang–Barsky clipping of the segment against the rectangle.
  let t0 = 0, t1 = 1
  const dx = b.x - a.x, dy = b.y - a.y
  const clip = (p: number, q: number) => {
    if (p === 0) return open ? q > 0 : q >= 0
    const r = q / p
    if (p < 0) {
      if (r > t1) return false
      if (r > t0) t0 = r
    } else {
      if (r < t0) return false
      if (r < t1) t1 = r
    }
    return true
  }
  if (!clip(-dx, a.x - x1) || !clip(dx, x2 - a.x) || !clip(-dy, a.y - y1) || !clip(dy, y2 - a.y)) return false
  return open ? t0 < t1 || (dx === 0 && dy === 0) : t0 <= t1
}
