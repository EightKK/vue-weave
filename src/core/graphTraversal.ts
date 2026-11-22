import type { GraphEdge } from './graph.js'
import type { GraphCollapseResult } from './graphCollapse.js'
import { checkId, uniqueIds, unknownReferenceError } from './ids.js'
import { walkInLockstep, walkWithinHops } from './graphWalk.js'

export type GraphTraversalDirection = 'forward' | 'backward' | 'both'

/** The direction of one walk of `traverseGraph`: `forward` follows an edge from source to target, `backward` the reverse. */
export type GraphWalkDirection = 'forward' | 'backward'

export interface GraphTraversalOptions<E extends GraphEdge = GraphEdge> {
  /** `forward` follows edges from source to target, `backward` the reverse. Default: `both`. */
  direction?: GraphTraversalDirection
  /** Largest number of edges between a start node and a reached node. A nonnegative integer or Infinity. Default: Infinity. */
  maxHops?: number
  /**
   * Follows only the edges for which this returns true, for example edges of one relation. Called with the edge and the
   * direction of the walk that meets it, at most once per edge and walk, also for edges of nodes at the hop limit (to
   * find `truncated` nodes). Default: every edge.
   */
  edgeFilter?: (edge: E, direction: GraphWalkDirection) => boolean
  /**
   * Largest number of nodes in `nodeIds`, starts included: a positive integer or Infinity. The known starts are always
   * included, even when there are more of them than `maxNodes`. A node counts once, however many walks reach it. Nodes
   * are admitted nearest first: with `both`, the two walks advance one hop at a time together, the backward walk first
   * at each hop. Default: Infinity.
   */
  maxNodes?: number
  /** Records `via` and `multiplyReachedIds`, so a path to each reached node can be rebuilt with `graphTracePath`. */
  paths?: boolean
}

/** A node with accepted edges that the walk did not follow because a limit stopped it. */
export interface GraphTraversalTruncation {
  nodeId: string
  /** The walk that stopped at the node. */
  direction: GraphWalkDirection
  /** `max-hops`: the node is `maxHops` edges from a start and has accepted edges to nodes the walk has not reached. `max-nodes`: an edge leads to a node that `maxNodes` left out. */
  reason: 'max-hops' | 'max-nodes'
}

/** How a walk first reached a node: the edge it followed and the node it came from. */
export interface GraphTraversalStep {
  edgeId: string
  previousId: string
}

/** Per walk, the first step into each node the walk reached, start nodes excepted. Only the walks that ran are present. */
export interface GraphTraversalVia {
  forward?: Map<string, GraphTraversalStep>
  backward?: Map<string, GraphTraversalStep>
}

export interface GraphTraversalResult {
  /** The known start nodes and every node reached from them, in discovery order. */
  nodeIds: string[]
  /** Every edge followed from a node that was expanded, in discovery order. */
  edgeIds: string[]
  /** Start IDs that are not nodes of the graph, deduplicated, in input order. */
  unknownIds: string[]
  /**
   * With `edgeFilter`, `maxNodes` or `paths: true`: the nodes at which a limit stopped a walk, once per node and walk, in
   * the order the walks met them. Empty when every accepted edge of the reached nodes was followed.
   */
  truncated?: GraphTraversalTruncation[]
  /** With `paths: true`: the step through which each walk first reached each node, which has the fewest hops in that walk. */
  via?: GraphTraversalVia
  /**
   * With `paths: true`: the reached nodes, starts excepted, into which more than one followed edge leads (in any walk),
   * so that more than one path reaches them. In `nodeIds` order.
   */
  multiplyReachedIds?: string[]
}

/** A path rebuilt by `graphTracePath`. */
export interface GraphTracedPath {
  /** The walk the path belongs to; absent for a start node, whose path is the node alone. */
  direction?: GraphWalkDirection
  /** From the start node to the node asked for. */
  nodeIds: string[]
  /** The edges between consecutive `nodeIds`, one fewer than `nodeIds`. */
  edgeIds: string[]
}

interface Adjacent<E> {
  edge: E
  node: string
}

/**
 * Finds the nodes and edges reached from `startIds` along `options.direction` within `options.maxHops`. With `both`,
 * the two directions are walked independently, so a shared parent does not pull in its other children. The walk is
 * iterative, so it handles long chains, and it terminates on cycles. Unknown start IDs are reported in `unknownIds`
 * instead of throwing. `edgeFilter`, `maxNodes` and `paths` are opt-in; without them the result has only `nodeIds`,
 * `edgeIds` and `unknownIds`. Throws RangeError for an invalid `maxHops`, `maxNodes` or direction, TypeError for an
 * `edgeFilter` that is not a function or a `paths` that is not a boolean, and Error for a duplicate or empty node or
 * edge ID or an edge with an unknown endpoint. Errors thrown by `edgeFilter` propagate. The inputs are not modified.
 */
export function traverseGraph<E extends GraphEdge = GraphEdge>(
  graph: { nodes: readonly { id: string }[]; edges: readonly E[] },
  startIds: Iterable<string>,
  options: GraphTraversalOptions<E> = {},
): GraphTraversalResult {
  const { direction = 'both', maxHops = Infinity, edgeFilter, maxNodes, paths } = options
  if (direction !== 'forward' && direction !== 'backward' && direction !== 'both') throw new RangeError('Invalid traversal direction: ' + String(direction))
  if (typeof maxHops !== 'number' || maxHops < 0 || (maxHops !== Infinity && !Number.isInteger(maxHops))) {
    throw new RangeError('maxHops must be a nonnegative integer or Infinity')
  }
  if (maxNodes !== undefined && (typeof maxNodes !== 'number' || maxNodes < 1 || (maxNodes !== Infinity && !Number.isInteger(maxNodes)))) {
    throw new RangeError('maxNodes must be a positive integer or Infinity')
  }
  if (edgeFilter !== undefined && typeof edgeFilter !== 'function') {
    throw new TypeError('edgeFilter must be a function: ' + (edgeFilter === null ? 'null' : typeof edgeFilter))
  }
  if (paths !== undefined && typeof paths !== 'boolean') throw new TypeError('paths must be a boolean: ' + (paths === null ? 'null' : typeof paths))
  const nodeIds = uniqueIds(graph.nodes, 'graph node')
  const outgoing = new Map<string, Adjacent<E>[]>()
  const incoming = new Map<string, Adjacent<E>[]>()
  const seenEdges = new Set<string>()
  for (const edge of graph.edges) {
    const { id, from, to } = edge
    checkId('graph edge', id, seenEdges)
    if (!nodeIds.has(from)) throw unknownReferenceError('node', 'graph edge ' + id, from)
    if (!nodeIds.has(to)) throw unknownReferenceError('node', 'graph edge ' + id, to)
    for (const [map, key, node] of [[outgoing, from, to], [incoming, to, from]] as const) {
      const list = map.get(key)
      if (list) list.push({ edge, node })
      else map.set(key, [{ edge, node }])
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

  if (edgeFilter === undefined && maxNodes === undefined && paths !== true) {
    const reachedNodes = new Set<string>(starts)
    const reachedEdges = new Set<string>()
    const adjacencies = direction === 'forward' ? [outgoing] : direction === 'backward' ? [incoming] : [incoming, outgoing]
    for (const adjacency of adjacencies) {
      walkWithinHops(starts, id => adjacency.get(id), next => next.node, maxHops, (next, reached) => {
        reachedEdges.add(next.edge.id)
        if (reached) reachedNodes.add(next.node)
      })
    }
    return { nodeIds: [...reachedNodes], edgeIds: [...reachedEdges], unknownIds }
  }
  return traverseWithOptions(starts, unknownIds, outgoing, incoming, direction, maxHops, edgeFilter, maxNodes ?? Infinity, paths === true)
}

function traverseWithOptions<E extends GraphEdge>(
  starts: string[],
  unknownIds: string[],
  outgoing: ReadonlyMap<string, Adjacent<E>[]>,
  incoming: ReadonlyMap<string, Adjacent<E>[]>,
  direction: GraphTraversalDirection,
  maxHops: number,
  edgeFilter: GraphTraversalOptions<E>['edgeFilter'],
  maxNodes: number,
  paths: boolean,
): GraphTraversalResult {
  // The walks run in the order of the plain traversal (backward before forward), so without limits the discovery order
  // and therefore `nodeIds` and `edgeIds` are the same as without options.
  const directions: GraphWalkDirection[] = direction === 'forward' ? ['forward'] : direction === 'backward' ? ['backward'] : ['backward', 'forward']
  const adjacencies = directions.map(d => d === 'forward' ? outgoing : incoming)
  const startSet = new Set(starts)
  const admitted = new Set<string>(starts)
  const walkNodes = directions.map(() => [] as string[])
  const walkSeen = directions.map(() => new Set<string>(starts))
  const walkEdges = directions.map(() => new Set<string>())
  const via = directions.map(() => new Map<string, GraphTraversalStep>())
  const truncatedIn = directions.map(() => new Set<string>())
  const truncated: GraphTraversalTruncation[] = []
  const firstEdgeInto = new Map<string, string>()
  const multiple = new Set<string>()
  const accepts = (edge: E, walk: number) => edgeFilter === undefined || !!edgeFilter(edge, directions[walk]!)
  const truncate = (walk: number, nodeId: string, reason: GraphTraversalTruncation['reason']) => {
    if (truncatedIn[walk]!.has(nodeId)) return
    truncatedIn[walk]!.add(nodeId)
    truncated.push({ nodeId, direction: directions[walk]!, reason })
  }

  walkInLockstep(starts, adjacencies.map(adjacency => (id: string) => adjacency.get(id)), step => step.node, maxHops, (walk, from, step, seen) => {
    if (!accepts(step.edge, walk)) return false
    const next = step.node
    if (!seen && !admitted.has(next)) {
      if (admitted.size >= maxNodes) {
        truncate(walk, from, 'max-nodes')
        return false
      }
      admitted.add(next)
    }
    walkEdges[walk]!.add(step.edge.id)
    if (!seen) {
      walkNodes[walk]!.push(next)
      walkSeen[walk]!.add(next)
      if (paths) via[walk]!.set(next, { edgeId: step.edge.id, previousId: from })
    }
    if (paths && !startSet.has(next)) {
      const first = firstEdgeInto.get(next)
      if (first === undefined) firstEdgeInto.set(next, step.edge.id)
      else if (first !== step.edge.id) multiple.add(next)
    }
    return true
  }, (walk, id) => {
    // Only edges to nodes this walk has not reached would show more; every closer node is reached by now (breadth first).
    if (adjacencies[walk]!.get(id)?.some(step => !walkSeen[walk]!.has(step.node) && accepts(step.edge, walk))) truncate(walk, id, 'max-hops')
  })

  const nodeIds = new Set<string>(starts)
  for (const list of walkNodes) for (const id of list) nodeIds.add(id)
  const edgeIds = new Set<string>()
  for (const set of walkEdges) for (const id of set) edgeIds.add(id)
  const result: GraphTraversalResult = { nodeIds: [...nodeIds], edgeIds: [...edgeIds], unknownIds, truncated }
  if (paths) {
    const byDirection: GraphTraversalVia = {}
    directions.forEach((d, walk) => { byDirection[d] = via[walk]! })
    result.via = byDirection
    result.multiplyReachedIds = result.nodeIds.filter(id => multiple.has(id))
  }
  return result
}

/**
 * Rebuilds a path from a start node to `nodeId` from a `traverseGraph` result made with `paths: true`, following the
 * first step of each node back to a start. The path has the fewest hops within its walk. With `options.direction`, only
 * that walk is used; otherwise the walk with the shorter path, the backward walk on a tie. A start node gives a path of
 * the node alone. Returns undefined when the node was not reached (by that walk). Throws Error when the result has no
 * `via` or its steps form a cycle and RangeError for an invalid direction. The inputs are not modified.
 */
export function graphTracePath(
  result: Pick<GraphTraversalResult, 'nodeIds' | 'via'>,
  nodeId: string,
  options: { direction?: GraphWalkDirection } = {},
): GraphTracedPath | undefined {
  const { via } = result
  if (!via || typeof via !== 'object') throw new Error('graphTracePath needs a traverseGraph result made with paths: true')
  const { direction } = options
  if (direction !== undefined && direction !== 'forward' && direction !== 'backward') throw new RangeError('Invalid path direction: ' + String(direction))
  let best: GraphTracedPath | undefined
  for (const d of direction ? [direction] : ['backward', 'forward'] as const) {
    const steps = via[d]
    if (!steps?.has(nodeId)) continue
    const nodeIds = [nodeId]
    const edgeIds: string[] = []
    const visited = new Set(nodeIds)
    for (let step = steps.get(nodeId); step; step = steps.get(step.previousId)) {
      if (visited.has(step.previousId)) throw new Error('Traversal steps form a cycle at node ' + step.previousId)
      visited.add(step.previousId)
      edgeIds.push(step.edgeId)
      nodeIds.push(step.previousId)
    }
    if (!best || edgeIds.length < best.edgeIds.length) best = { direction: d, nodeIds: nodeIds.reverse(), edgeIds: edgeIds.reverse() }
  }
  if (best) return best
  if (direction && !via[direction]) return undefined
  if (via.backward?.has(nodeId) || via.forward?.has(nodeId) || !result.nodeIds.includes(nodeId)) return undefined
  return { nodeIds: [nodeId], edgeIds: [] }
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
