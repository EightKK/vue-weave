import type { GraphEdge } from './graph.js'
import type { GraphCollapseResult } from './graphCollapse.js'
import { checkId, uniqueIds, unknownReferenceError } from './ids.js'

export type GraphTraversalDirection = 'forward' | 'backward' | 'both'

export interface GraphTraversalOptions {
  /** `forward` follows edges from source to target, `backward` the reverse. Default: `both`. */
  direction?: GraphTraversalDirection
  /** Largest number of edges between a start node and a reached node. A nonnegative integer or Infinity. Default: Infinity. */
  maxHops?: number
}

export interface GraphTraversalResult {
  /** The known start nodes and every node reached from them, in discovery order. */
  nodeIds: string[]
  /** Every edge followed from a node that was expanded, in discovery order. */
  edgeIds: string[]
  /** Start IDs that are not nodes of the graph, deduplicated, in input order. */
  unknownIds: string[]
}

/**
 * Finds the nodes and edges reached from `startIds` along `options.direction` within `options.maxHops`. With `both`,
 * the two directions are walked independently, so a shared parent does not pull in its other children. The walk is
 * iterative, so it handles long chains, and it terminates on cycles. Unknown start IDs are reported in `unknownIds`
 * instead of throwing. Throws RangeError for an invalid `maxHops` or direction and Error for a duplicate or empty node
 * or edge ID or an edge with an unknown endpoint. The inputs are not modified.
 */
export function traverseGraph(
  graph: { nodes: readonly { id: string }[]; edges: readonly GraphEdge[] },
  startIds: Iterable<string>,
  options: GraphTraversalOptions = {},
): GraphTraversalResult {
  const { direction = 'both', maxHops = Infinity } = options
  if (direction !== 'forward' && direction !== 'backward' && direction !== 'both') throw new RangeError('Invalid traversal direction: ' + String(direction))
  if (typeof maxHops !== 'number' || maxHops < 0 || (maxHops !== Infinity && !Number.isInteger(maxHops))) {
    throw new RangeError('maxHops must be a nonnegative integer or Infinity')
  }
  const nodeIds = uniqueIds(graph.nodes, 'graph node')
  const outgoing = new Map<string, { edge: string; node: string }[]>()
  const incoming = new Map<string, { edge: string; node: string }[]>()
  const seenEdges = new Set<string>()
  for (const { id, from, to } of graph.edges) {
    checkId('graph edge', id, seenEdges)
    if (!nodeIds.has(from)) throw unknownReferenceError('node', 'graph edge ' + id, from)
    if (!nodeIds.has(to)) throw unknownReferenceError('node', 'graph edge ' + id, to)
    for (const [map, key, node] of [[outgoing, from, to], [incoming, to, from]] as const) {
      const list = map.get(key)
      if (list) list.push({ edge: id, node })
      else map.set(key, [{ edge: id, node }])
    }
  }

  const starts: string[] = []
  const unknownIds: string[] = []
  const startSeen = new Set<string>()
  for (const id of startIds) {
    if (startSeen.has(id)) continue
    startSeen.add(id)
    if (nodeIds.has(id)) starts.push(id)
    else unknownIds.push(id)
  }

  const reachedNodes = new Set<string>(starts)
  const reachedEdges = new Set<string>()
  const adjacencies = direction === 'forward' ? [outgoing] : direction === 'backward' ? [incoming] : [incoming, outgoing]
  for (const adjacency of adjacencies) {
    const depth = new Map<string, number>()
    const queue: string[] = []
    for (const id of starts) {
      depth.set(id, 0)
      queue.push(id)
    }
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i]!
      const d = depth.get(id)!
      if (d >= maxHops) continue
      for (const next of adjacency.get(id) ?? []) {
        reachedEdges.add(next.edge)
        if (depth.has(next.node)) continue
        depth.set(next.node, d + 1)
        reachedNodes.add(next.node)
        queue.push(next.node)
      }
    }
  }
  return { nodeIds: [...reachedNodes], edgeIds: [...reachedEdges], unknownIds }
}

export interface CollapsedTargetsResult {
  /** Visible node or proxy IDs that stand for the given node IDs, deduplicated, in input order. */
  nodeIds: string[]
  /** Visible edge IDs (kept or merged) that stand for the given edge IDs, deduplicated, in input order. */
  edgeIds: string[]
  /** Given node IDs that are neither visible nor hidden inside a collapsed group. */
  unknownNodeIds: string[]
  /** Given edge IDs that are neither visible, merged nor hidden inside a collapsed group. */
  unknownEdgeIds: string[]
}

/**
 * Resolves node and edge IDs of the full graph to what a `collapseGraphGroups` result shows. A visible node stays as it
 * is and a hidden node resolves to its proxy through `owners`. A visible edge stays, an edge merged into a re-attached
 * edge resolves to the merged edge, and an edge dropped because both ends are inside one collapsed group resolves to
 * that group's proxy node, which is added to `nodeIds`. `edges` must be the edges that were given to
 * `collapseGraphGroups`; they supply the endpoints of dropped edges. The inputs are not modified.
 */
export function resolveCollapsedTargets(
  collapse: Pick<GraphCollapseResult, 'nodes' | 'edges' | 'owners' | 'mergedEdges' | 'hiddenEdgeIds'>,
  ids: { nodeIds?: Iterable<string>; edgeIds?: Iterable<string> },
  edges: readonly GraphEdge[],
): CollapsedTargetsResult {
  const visibleNodes = new Set(collapse.nodes.map(node => node.id))
  const visibleEdges = new Set(collapse.edges.map(edge => edge.id))
  const mergedInto = new Map<string, string>()
  for (const [merged, originals] of collapse.mergedEdges) for (const id of originals) mergedInto.set(id, merged)
  const hidden = new Set(collapse.hiddenEdgeIds)
  const byId = new Map<string, GraphEdge>()
  for (const edge of edges) byId.set(edge.id, edge)

  const nodeIds = new Set<string>()
  const edgeIds = new Set<string>()
  const unknownNodeIds = new Set<string>()
  const unknownEdgeIds = new Set<string>()
  const resolveNode = (id: string): string | undefined => visibleNodes.has(id) ? id : collapse.owners.get(id)

  for (const id of ids.nodeIds ?? []) {
    const resolved = resolveNode(id)
    if (resolved === undefined) unknownNodeIds.add(id)
    else nodeIds.add(resolved)
  }
  for (const id of ids.edgeIds ?? []) {
    const merged = mergedInto.get(id)
    if (merged !== undefined) edgeIds.add(merged)
    else if (visibleEdges.has(id)) edgeIds.add(id)
    else if (hidden.has(id)) {
      const edge = byId.get(id)
      const proxy = edge && resolveNode(edge.from)
      if (proxy) nodeIds.add(proxy)
      else unknownEdgeIds.add(id)
    } else unknownEdgeIds.add(id)
  }
  return { nodeIds: [...nodeIds], edgeIds: [...edgeIds], unknownNodeIds: [...unknownNodeIds], unknownEdgeIds: [...unknownEdgeIds] }
}
