import { indexGraph } from './graph.js'
import type { GraphEdge, IdentifiedNode } from './graph.js'

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
    if (!index.outgoing.has(id)) throw new Error('Unknown node in graph deletion: ' + id)
    removedNodes.add(id)
  }
  const knownEdges = new Set(edges.map(edge => edge.id))
  const removedEdges = new Set<string>()
  for (const id of edgeIds) {
    if (!knownEdges.has(id)) throw new Error('Unknown edge in graph deletion: ' + id)
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
