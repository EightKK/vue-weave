// Internal helpers for port and box sides. Not exported from the package entry points.

type PortSide = 'left' | 'right' | 'top' | 'bottom'

/** Whether a value is one of the four port sides. Compares by value, so inherited names such as 'constructor' fail. */
export function isGraphPortSide(side: unknown): side is PortSide {
  return side === 'left' || side === 'right' || side === 'top' || side === 'bottom'
}

/** Throws a descriptive Error naming the node and port when a port side is not one of the four sides. */
export function assertGraphPortSide(nodeId: string, port: { id: string; side: unknown }): void {
  if (!isGraphPortSide(port.side)) {
    throw new Error(`Invalid graph port on node ${nodeId}: port ${port.id} has side ${String(port.side)}, expected left, right, top or bottom`)
  }
}

/** The outward unit normal of each box side. */
export const graphSideNormals: Readonly<Record<PortSide, readonly [number, number]>> = {
  left: [-1, 0], right: [1, 0], top: [0, -1], bottom: [0, 1],
}

/**
 * The point at `offset` (0 to 1) along one side of a box: from the top of a left or right side, from the left of a top
 * or bottom side. `graphPortAnchor` places ports with it.
 */
export function graphSideAnchor(box: { x: number; y: number; width: number; height: number }, side: PortSide, offset: number): { x: number; y: number } {
  if (side === 'left' || side === 'right') {
    return { x: box.x + (side === 'right' ? box.width : 0), y: box.y + box.height * offset }
  }
  return { x: box.x + box.width * offset, y: box.y + (side === 'bottom' ? box.height : 0) }
}
