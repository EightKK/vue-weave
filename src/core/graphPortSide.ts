// Internal helpers for port sides. Not exported from the package entry points.

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
