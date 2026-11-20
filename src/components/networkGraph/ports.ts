// Connection handles of NetworkGraph nodes and ports, their `data-vw-port` keys, and connection proposals between them.
import { graphPortAnchor, type GraphBox, type GraphConnection, type GraphPoint, type GraphPort } from '../../core/graph.js'
import type { NetworkNode } from '../../core/types.js'

/** A node, or one of its ports, as an end of a connection. */
export type PortRef = { node: string; port?: string }
export type PortHandle = PortRef & GraphPoint & { label: string; direction: NonNullable<GraphPort['direction']> }

/**
 * The connection handle of a node, or of one of its ports, at a box: a node without ports has one handle in a top
 * corner (the left one with `rl`), a node with ports one per port.
 */
export function connectHandle(node: NetworkNode, port: GraphPort | undefined, box: GraphBox, rl: boolean): PortHandle {
  return !port
    ? { node: node.id, label: node.label, direction: 'both' as const, port: undefined, x: rl ? box.x + 10 : box.x + box.width - 10, y: box.y + 11 }
    : {
      node: node.id, port: port.id, label: node.label + ' · ' + (port.label ?? port.id),
      direction: port.direction ?? 'both', ...graphPortAnchor(box, port),
    }
}

/** The `data-vw-port` key of a handle. */
export function portKey(ref: PortRef) {
  return JSON.stringify([ref.node, ref.port])
}

/** The reference a `data-vw-port` key names, or undefined when it is not a key `portKey` writes. */
export function parsePortKey(key: string): PortRef | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(key)
  } catch {
    return undefined
  }
  if (!Array.isArray(parsed) || parsed.length !== 2) return undefined
  const ref: PortRef = { node: parsed[0], port: parsed[1] ?? undefined }
  return portKey(ref) === key ? ref : undefined
}

/** The connection from one end to the other, with the port names only when they are set. */
export function connectionBetween(from: PortRef, to: PortRef): GraphConnection {
  const connection: GraphConnection = { from: from.node, to: to.node }
  if (from.port !== undefined) connection.fromPort = from.port
  if (to.port !== undefined) connection.toPort = to.port
  return connection
}
