import type { GraphBox, GraphLayout } from './graph.js'

interface Orientation {
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

/** Transpose and/or mirror a finished layout without mutating it. */
export function orientGraphLayout(base: GraphLayout, o: Orientation): GraphLayout {
  const width = o.transpose ? base.height : base.width
  const height = o.transpose ? base.width : base.height
  const boxes = new Map<string, GraphBox>()
  for (const [id, box] of base.boxes) {
    const w = o.transpose ? box.height : box.width, h = o.transpose ? box.width : box.height
    const x = o.transpose ? box.y : box.x, y = o.transpose ? box.x : box.y
    boxes.set(id, { x: o.flipX ? width - x - w : x, y: o.flipY ? height - y - h : y, width: w, height: h, rank: box.rank })
  }
  const edgeLabels = new Map<string, { x: number; y: number }>()
  for (const [id, point] of base.edgeLabels) {
    const x = o.transpose ? point.y : point.x, y = o.transpose ? point.x : point.y
    edgeLabels.set(id, { x: o.flipX ? width - x : x, y: o.flipY ? height - y : y })
  }
  const paths = new Map<string, string>()
  for (const [id, path] of base.paths) paths.set(id, mapPath(path, o, width, height))
  return { boxes, paths, edgeLabels, width, height }
}

export function flipGraphLayout(base: GraphLayout, axis: 'x' | 'y'): GraphLayout {
  return orientGraphLayout(base, axis === 'x' ? { flipX: true } : { flipY: true })
}
