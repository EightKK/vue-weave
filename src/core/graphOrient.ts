// Internal helpers for the four layout directions. Not exported from the package entry points. The layouts compute a
// left-to-right drawing and turn it into the requested direction here; the routing and flow code reads the default
// sides of a direction from here.
import type { GraphBox, GraphLayout, GraphLayoutDirection, GraphPort } from './graph.js'

const directions: readonly string[] = ['LR', 'TB', 'RL', 'BT']

/** Whether a value is one of the layout directions LR, TB, RL and BT. */
export function isGraphLayoutDirection(direction: unknown): direction is GraphLayoutDirection {
  return directions.includes(direction as string)
}

/** Throws RangeError('Unknown layout direction') unless `direction` is LR, TB, RL or BT. */
export function assertGraphLayoutDirection(direction: unknown): asserts direction is GraphLayoutDirection {
  if (!isGraphLayoutDirection(direction)) throw new RangeError('Unknown layout direction')
}

/** Whether a direction runs along the y axis (TB and BT). */
export function isVerticalDirection(direction: GraphLayoutDirection): boolean {
  return direction === 'TB' || direction === 'BT'
}

/**
 * The sides of a box an edge leaves (`exit`) and enters (`entry`) in a direction: right and left for LR, bottom and
 * top for TB, and mirrored for RL and BT. Any other value is read as LR.
 */
export function graphFlowSides(direction: GraphLayoutDirection): { exit: GraphPort['side']; entry: GraphPort['side'] } {
  return direction === 'TB' ? { exit: 'bottom', entry: 'top' }
    : direction === 'BT' ? { exit: 'top', entry: 'bottom' }
    : direction === 'RL' ? { exit: 'left', entry: 'right' } : { exit: 'right', entry: 'left' }
}

export interface Orientation {
  /** Swap the x and y axes first. */
  transpose?: boolean
  /** Mirror the x axis within the (post-transpose) layout width. */
  flipX?: boolean
  /** Mirror the y axis within the (post-transpose) layout height. */
  flipY?: boolean
}

// Maps absolute M, L, C, Q, H and V path commands through the orientation.
function mapPath(path: string, o: Orientation, width: number, height: number): string {
  const fx = (x: number) => (o.flipX ? width - x : x)
  const fy = (y: number) => (o.flipY ? height - y : y)
  return path.replace(/([MLCQHV])([^MLCQHV]*)/g, (_match, command: string, values: string) => {
    const numbers = values.split(/[\s,]+/).filter(Boolean).map(Number)
    if (command === 'H' || command === 'V') {
      const horizontal = (command === 'H') !== Boolean(o.transpose)
      return (o.transpose ? (command === 'H' ? 'V' : 'H') : command) + ' ' + numbers.map(horizontal ? fx : fy).join(' ') + ' '
    }
    const result: number[] = []
    for (let i = 0; i < numbers.length; i += 2) {
      const [x, y] = o.transpose ? [numbers[i + 1]!, numbers[i]!] : [numbers[i]!, numbers[i + 1]!]
      result.push(fx(x), fy(y))
    }
    return command + ' ' + result.join(' ') + ' '
  }).trim()
}

/**
 * A rectangle of a layout transposed and/or mirrored within the size of the oriented layout (`width` and `height` after
 * the transpose), as `orientGraphLayout` moves its boxes.
 */
export function orientGraphRect(
  rect: { x: number; y: number; width: number; height: number }, o: Orientation, width: number, height: number,
): { x: number; y: number; width: number; height: number } {
  const w = o.transpose ? rect.height : rect.width, h = o.transpose ? rect.width : rect.height
  const x = o.transpose ? rect.y : rect.x, y = o.transpose ? rect.x : rect.y
  return { x: o.flipX ? width - x - w : x, y: o.flipY ? height - y - h : y, width: w, height: h }
}

/** Transpose and/or mirror a finished layout without mutating it. */
export function orientGraphLayout(base: GraphLayout, o: Orientation): GraphLayout {
  const width = o.transpose ? base.height : base.width
  const height = o.transpose ? base.width : base.height
  const boxes = new Map<string, GraphBox>()
  for (const [id, box] of base.boxes) boxes.set(id, { ...orientGraphRect(box, o, width, height), rank: box.rank })
  const edgeLabels = new Map<string, { x: number; y: number }>()
  for (const [id, point] of base.edgeLabels) {
    const x = o.transpose ? point.y : point.x, y = o.transpose ? point.x : point.y
    edgeLabels.set(id, { x: o.flipX ? width - x : x, y: o.flipY ? height - y : y })
  }
  const paths = new Map<string, string>()
  for (const [id, path] of base.paths) paths.set(id, mapPath(path, o, width, height))
  return { boxes, paths, edgeLabels, width, height }
}

/**
 * The orientation that turns a left-to-right layout into `direction`: TB and BT transpose it (lay out the LR base with
 * node width and height swapped), RL mirrors x and BT mirrors y.
 */
export function graphDirectionOrientation(direction: GraphLayoutDirection): Orientation {
  return { transpose: isVerticalDirection(direction), flipX: direction === 'RL', flipY: direction === 'BT' }
}
