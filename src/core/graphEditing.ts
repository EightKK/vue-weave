import { indexGraph } from './graph.js'
import type { GraphEdge, GraphPoint, IdentifiedNode } from './graph.js'
import { duplicateIdError, inContext, invalidIdError, isId, unknownReferenceError } from './ids.js'

/**
 * A deletion proposal. `nodeIds` follows the order of the node array and `edgeIds` the order of the edge array.
 * `edgeIds` lists every edge that touches a deleted node, so applying the proposal leaves a consistent graph.
 */
export interface GraphDeletion {
  nodeIds: string[]
  edgeIds: string[]
}

/**
 * Normalizes a deletion: validates the graph and the requested IDs, adds every edge incident to a deleted node,
 * removes duplicates and sorts both lists into input order. Unknown node or edge IDs throw an Error.
 */
export function graphDeletion(
  nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[], nodeIds: Iterable<string>, edgeIds: Iterable<string> = [],
): GraphDeletion {
  const index = indexGraph(nodes, edges)
  const removedNodes = new Set<string>()
  for (const id of nodeIds) {
    if (!index.outgoing.has(id)) throw unknownReferenceError('node', 'graph deletion', id)
    removedNodes.add(id)
  }
  const knownEdges = new Set(edges.map(edge => edge.id))
  const removedEdges = new Set<string>()
  for (const id of edgeIds) {
    if (!knownEdges.has(id)) throw unknownReferenceError('edge', 'graph deletion', id)
    removedEdges.add(id)
  }
  return {
    nodeIds: nodes.filter(node => removedNodes.has(node.id)).map(node => node.id),
    edgeIds: edges.filter(edge => removedEdges.has(edge.id) || removedNodes.has(edge.from) || removedNodes.has(edge.to))
      .map(edge => edge.id),
  }
}

/**
 * Returns new node and edge arrays without the elements of `deletion`. Edges incident to a removed node are removed
 * too, even when `deletion.edgeIds` omits them. Unknown IDs throw an Error. The input arrays are not modified.
 */
export function removeGraphElements<N extends IdentifiedNode, E extends GraphEdge>(
  nodes: readonly N[], edges: readonly E[], deletion: GraphDeletion,
): { nodes: N[]; edges: E[] } {
  const normalized = graphDeletion(nodes, edges, deletion.nodeIds, deletion.edgeIds)
  const removedNodes = new Set(normalized.nodeIds), removedEdges = new Set(normalized.edgeIds)
  return {
    nodes: nodes.filter(node => !removedNodes.has(node.id)),
    edges: edges.filter(edge => !removedEdges.has(edge.id)),
  }
}

/** Options of `cloneGraphElements`. */
export interface GraphCloneOptions {
  /** Returns the ID of the copy of a node or an edge. IDs must be nonempty, unique and unused in the input arrays. */
  createId: (id: string, kind: 'node' | 'edge') => string
  /** Saved positions of the source nodes. Copies of the nodes that have one receive it, moved by `offset`. */
  positions?: ReadonlyMap<string, GraphPoint>
  /** Added to every copied position. Default `{ x: 0, y: 0 }`. */
  offset?: GraphPoint
}

/** The copies made by `cloneGraphElements`, and the IDs of the copies keyed by the source IDs. */
export interface GraphCloneResult<N extends IdentifiedNode = IdentifiedNode, E extends GraphEdge = GraphEdge> {
  nodes: N[]
  edges: E[]
  /** Positions of the copied nodes, keyed by the new node IDs. */
  positions: Map<string, GraphPoint>
  idMap: { nodes: Map<string, string>; edges: Map<string, string> }
}

/**
 * Copies the nodes listed in `nodeIds` and every edge whose source and target are both among them, in input order.
 * Copies are shallow: they keep every field (ports, data, labels) and only receive new IDs from `options.createId`,
 * and copied edges point at the copied nodes. Saved positions of the source nodes are moved by `options.offset` and
 * returned under the new IDs, and the waypoints (`points`) of copied edges are moved by the same offset so routes keep
 * their shape. Duplicate IDs in `nodeIds` are ignored. Throws an Error for an invalid graph, an unknown node ID, or a
 * new ID that is empty, repeated or already used by a node (or edge) of the input, and a RangeError for a non-finite
 * offset, copied position or copied waypoint. The input arrays, maps and waypoints are not modified.
 */
export function cloneGraphElements<N extends IdentifiedNode, E extends GraphEdge>(
  nodes: readonly N[], edges: readonly E[], nodeIds: Iterable<string>, options: GraphCloneOptions,
): GraphCloneResult<N, E> {
  indexGraph(nodes, edges)
  if (typeof options?.createId !== 'function') throw new Error('cloneGraphElements requires a createId function')
  const offset = options.offset ?? { x: 0, y: 0 }
  if (!Number.isFinite(offset.x) || !Number.isFinite(offset.y)) throw new RangeError('The clone offset must have finite coordinates')
  const usedNodes = new Set(nodes.map(node => node.id))
  const requested = new Set<string>()
  for (const id of nodeIds) {
    if (!usedNodes.has(id)) throw unknownReferenceError('node', 'graph clone', id)
    requested.add(id)
  }
  const newId = (id: string, kind: 'node' | 'edge', used: Set<string>) => {
    const created = options.createId(id, kind)
    if (!isId(created)) throw inContext(invalidIdError('graph ' + kind, created), 'createId for ' + id)
    if (used.has(created)) throw inContext(duplicateIdError('graph ' + kind, created), 'createId for ' + id)
    used.add(created)
    return created
  }
  const nodeMap = new Map<string, string>()
  const copiedNodes: N[] = []
  for (const node of nodes) {
    if (!requested.has(node.id)) continue
    const id = newId(node.id, 'node', usedNodes)
    nodeMap.set(node.id, id)
    copiedNodes.push({ ...node, id })
  }
  const usedEdges = new Set(edges.map(edge => edge.id))
  const edgeMap = new Map<string, string>()
  const copiedEdges: E[] = []
  for (const edge of edges) {
    const from = nodeMap.get(edge.from), to = nodeMap.get(edge.to)
    if (from === undefined || to === undefined) continue
    const id = newId(edge.id, 'edge', usedEdges)
    edgeMap.set(edge.id, id)
    const copy: E = { ...edge, id, from, to }
    if (edge.points) {
      copy.points = edge.points.map(point => {
        const x = point.x + offset.x, y = point.y + offset.y
        if (!Number.isFinite(x) || !Number.isFinite(y)) throw new RangeError('Copied edge waypoints must be finite: ' + edge.id)
        return { ...point, x, y }
      })
    }
    copiedEdges.push(copy)
  }
  const positions = new Map<string, GraphPoint>()
  for (const [source, id] of nodeMap) {
    const point = options.positions?.get(source)
    if (!point) continue
    const x = point.x + offset.x, y = point.y + offset.y
    if (!Number.isFinite(x) || !Number.isFinite(y)) throw new RangeError('Copied graph positions must be finite: ' + source)
    positions.set(id, { x, y })
  }
  return { nodes: copiedNodes, edges: copiedEdges, positions, idMap: { nodes: nodeMap, edges: edgeMap } }
}
