import { indexGraph } from './graph.js'
import type { GraphEdge, IdentifiedNode } from './graph.js'
import { KeyedMinHeap } from './graphHeap.js'
import { unknownReferenceError } from './ids.js'
import { checkLayoutNumber } from './graphOptions.js'
import { traverseGraph } from './graphTraversal.js'
import { stronglyConnectedComponents } from './graphWalk.js'

export interface TopologicalOrderResult {
  /** Nodes in dependency order (input order breaks ties). Nodes on or behind a cycle are omitted. */
  order: string[]
  /** True when every node was ordered. */
  acyclic: boolean
  /** Nodes that could not be ordered because they lie on a cycle or depend on one, in input order. */
  blocked: string[]
}

/** Kahn's algorithm. A self-loop is a cycle. Never throws for cycles; unknown edge endpoints throw an Error. */
export function topologicalOrder(nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[]): TopologicalOrderResult {
  const index = indexGraph(nodes, edges)
  const remaining = new Map<string, number>()
  for (const [id, parents] of index.incoming) remaining.set(id, parents.length)
  const order: string[] = nodes.map(node => node.id).filter(id => remaining.get(id) === 0)
  for (let i = 0; i < order.length; i++) {
    for (const child of index.outgoing.get(order[i]!)!) {
      const left = remaining.get(child)! - 1
      remaining.set(child, left)
      if (left === 0) order.push(child)
    }
  }
  const done = new Set(order)
  const blocked = nodes.map(node => node.id).filter(id => !done.has(id))
  return { order, acyclic: blocked.length === 0, blocked }
}

/**
 * Strongly connected components that contain a cycle: every component with more than one node, plus
 * each node with a self-loop. Members follow input order and components are ordered by their first member.
 */
export function findGraphCycles(nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[]): string[][] {
  const index = indexGraph(nodes, edges)
  const position = new Map(nodes.map((node, i) => [node.id, i]))
  const selfLoops = new Set(edges.filter(edge => edge.from === edge.to).map(edge => edge.from))

  const found: string[][] = []
  for (const members of stronglyConnectedComponents(index.outgoing)) {
    if (members.length > 1 || selfLoops.has(members[0]!)) {
      found.push(members.sort((a, b) => position.get(a)! - position.get(b)!))
    }
  }
  return found.sort((a, b) => position.get(a[0]!)! - position.get(b[0]!)!)
}

export interface ShortestGraphPathOptions {
  /** Default true follows edge direction only; false lets edges be walked in both directions. */
  directed?: boolean
  /** Edge cost; must be finite and nonnegative. Without it every edge costs 1 (breadth-first search). */
  weight?: (edge: GraphEdge) => number
}

export interface GraphPathResult {
  /** Node IDs from the start to the end, inclusive. */
  nodeIds: string[]
  /** IDs of the traversed edges, one fewer than nodeIds. */
  edgeIds: string[]
  /** Total cost: the edge count, or the sum of weights. */
  distance: number
}

/** Cheapest path between two nodes, or null when the target is unreachable. Ties favour earlier edges in input order. */
export function shortestGraphPath(
  nodes: readonly IdentifiedNode[],
  edges: readonly GraphEdge[],
  fromId: string,
  toId: string,
  options: ShortestGraphPathOptions = {},
): GraphPathResult | null {
  const { directed = true, weight } = options
  const index = indexGraph(nodes, edges)
  if (!index.outgoing.has(fromId)) throw unknownReferenceError('node', 'fromId', fromId)
  if (!index.outgoing.has(toId)) throw unknownReferenceError('node', 'toId', toId)

  const adjacency = new Map<string, { edge: GraphEdge; to: string; cost: number }[]>(nodes.map(node => [node.id, []]))
  for (const edge of edges) {
    const cost = weight ? weight(edge) : 1
    if (!Number.isFinite(cost) || cost < 0) throw new RangeError('Edge weights must be finite and nonnegative: ' + edge.id)
    adjacency.get(edge.from)!.push({ edge, to: edge.to, cost })
    if (!directed && edge.from !== edge.to) adjacency.get(edge.to)!.push({ edge, to: edge.from, cost })
  }

  const distance = new Map<string, number>([[fromId, 0]])
  const via = new Map<string, { previous: string; edgeId: string }>()
  // Ordered by distance, then insertion sequence for determinism.
  const heap = new KeyedMinHeap<string>()
  heap.push(0, fromId)
  const settled = new Set<string>()

  while (heap.size) {
    const [dist, id] = heap.pop()
    if (settled.has(id)) continue
    settled.add(id)
    if (id === toId) break
    for (const { edge, to, cost } of adjacency.get(id)!) {
      const next = dist + cost
      if (settled.has(to) || next >= (distance.get(to) ?? Infinity)) continue
      distance.set(to, next)
      via.set(to, { previous: id, edgeId: edge.id })
      heap.push(next, to)
    }
  }

  if (!distance.has(toId)) return null
  const nodeIds = [toId]
  const edgeIds: string[] = []
  for (let id = toId; id !== fromId;) {
    const step = via.get(id)!
    edgeIds.push(step.edgeId)
    nodeIds.push(step.previous)
    id = step.previous
  }
  return { nodeIds: nodeIds.reverse(), edgeIds: edgeIds.reverse(), distance: distance.get(toId)! }
}

export interface GraphSearchOptions {
  /** Fields compared against the text query. Default both. */
  fields?: readonly ('id' | 'label')[]
}

export interface GraphFilterOptions extends GraphSearchOptions {
  /** Also keep nodes within this many hops (either direction) of a match. Default 0. */
  neighborhood?: number
}

export type GraphNodeMatch<N> = string | ((node: N) => boolean)

function textMatcher<N extends IdentifiedNode>(query: string, fields: readonly ('id' | 'label')[]): (node: N) => boolean {
  const needle = query.trim().toLowerCase()
  return node => {
    if (!needle) return true
    for (const field of fields) {
      const value = field === 'id' ? node.id : (node as { label?: unknown }).label
      if (typeof value === 'string' && value.toLowerCase().includes(needle)) return true
    }
    return false
  }
}

/** Case-insensitive substring search over node id and label. An empty query matches every node. Returns a new array in input order. */
export function searchGraphNodes<N extends IdentifiedNode>(nodes: readonly N[], query: string, options: GraphSearchOptions = {}): N[] {
  const { fields = ['id', 'label'] } = options
  for (const field of fields) if (field !== 'id' && field !== 'label') throw new RangeError('Unknown search field')
  return nodes.filter(textMatcher<N>(query, fields))
}

/**
 * Keep the nodes selected by a predicate or text query, optionally widened to an N-hop neighbourhood,
 * together with the edges whose endpoints both survive. Inputs are not mutated.
 */
export function filterGraph<N extends IdentifiedNode, E extends GraphEdge>(
  nodes: readonly N[],
  edges: readonly E[],
  match: GraphNodeMatch<N>,
  options: GraphFilterOptions = {},
): { nodes: N[]; edges: E[] } {
  const { neighborhood = 0, fields = ['id', 'label'] } = options
  checkLayoutNumber('neighborhood', neighborhood, 'nonnegativeInteger')
  indexGraph(nodes, edges)
  const test = typeof match === 'string' ? textMatcher<N>(match, fields) : match
  const matches = nodes.filter(node => test(node)).map(node => node.id)
  // One walk from every match at once: each node is expanded once per direction, however many matches reach it.
  const keep = new Set(neighborhood ? traverseGraph({ nodes, edges }, matches, { maxHops: neighborhood }).nodeIds : matches)
  return {
    nodes: nodes.filter(node => keep.has(node.id)),
    edges: edges.filter(edge => keep.has(edge.from) && keep.has(edge.to)),
  }
}
