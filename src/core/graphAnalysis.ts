import { indexGraph } from './graph.js'
import type { GraphEdge, GraphGroup, IdentifiedNode } from './graph.js'

interface Arc {
  to: number
  cost: number
}

interface Indexed {
  ids: string[]
  count: number
}

function indexNodes(nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[]): Indexed & { position: Map<string, number> } {
  indexGraph(nodes, edges)
  const ids = nodes.map(node => node.id)
  return { ids, count: ids.length, position: new Map(ids.map((id, i) => [id, i])) }
}

function edgeCost(edge: GraphEdge, weight: ((edge: GraphEdge) => number) | undefined, allowZero: boolean): number {
  if (!weight) return 1
  const cost = weight(edge)
  if (!Number.isFinite(cost) || cost < 0 || (!allowZero && cost === 0)) {
    throw new RangeError(`Edge weights must be finite and ${allowZero ? 'nonnegative' : 'greater than 0'}: ${edge.id}`)
  }
  return cost
}

/** Binary min-heap of [key, sequence, value]; the sequence breaks ties so pops are deterministic. */
class MinHeap {
  private readonly items: [number, number, number][] = []
  private sequence = 0

  get size(): number { return this.items.length }

  push(key: number, value: number): void {
    const item: [number, number, number] = [key, this.sequence++, value]
    const items = this.items
    let i = items.push(item) - 1
    while (i > 0) {
      const parent = (i - 1) >> 1
      if (!MinHeap.before(item, items[parent]!)) break
      items[i] = items[parent]!
      i = parent
    }
    items[i] = item
  }

  pop(): [number, number] {
    const items = this.items
    const top = items[0]!
    const last = items.pop()!
    if (items.length) {
      let i = 0
      for (;;) {
        let child = 2 * i + 1
        if (child >= items.length) break
        if (child + 1 < items.length && MinHeap.before(items[child + 1]!, items[child]!)) child++
        if (!MinHeap.before(items[child]!, last)) break
        items[i] = items[child]!
        i = child
      }
      items[i] = last
    }
    return [top[0], top[2]]
  }

  private static before(a: [number, number, number], b: [number, number, number]): boolean {
    return a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])
  }
}

/**
 * Weakly connected components (edge direction ignored). Each component lists its node IDs in input order and
 * components are ordered by their first node's input position. Isolated nodes are single-node components.
 */
export function graphComponents(nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[]): string[][] {
  const { ids, count, position } = indexNodes(nodes, edges)
  const neighbors: number[][] = ids.map(() => [])
  for (const edge of edges) {
    const a = position.get(edge.from)!
    const b = position.get(edge.to)!
    neighbors[a]!.push(b)
    neighbors[b]!.push(a)
  }
  const label = new Array<number>(count).fill(-1)
  const result: string[][] = []
  for (let root = 0; root < count; root++) {
    if (label[root] !== -1) continue
    const queue = [root]
    label[root] = result.length
    for (let head = 0; head < queue.length; head++) {
      for (const next of neighbors[queue[head]!]!) {
        if (label[next] === -1) {
          label[next] = result.length
          queue.push(next)
        }
      }
    }
    result.push([])
  }
  for (let i = 0; i < count; i++) result[label[i]!]!.push(ids[i]!)
  return result
}

export interface GraphDegreeCentralityOptions {
  /** Which edges count: incoming, outgoing or both. Default `'both'`. */
  direction?: 'in' | 'out' | 'both'
  /** Divide each count by n − 1 (0 when the graph has fewer than two nodes). Default false: raw counts. */
  normalized?: boolean
}

/**
 * Degree per node ID, in input order. Every edge counts once, so parallel edges add up. A self-loop is one
 * incoming and one outgoing edge: it adds 1 to `'in'`, 1 to `'out'` and 2 to `'both'`. Normalized values can
 * exceed 1 when parallel edges or self-loops are present.
 */
export function graphDegreeCentrality(
  nodes: readonly IdentifiedNode[],
  edges: readonly GraphEdge[],
  options: GraphDegreeCentralityOptions = {},
): Map<string, number> {
  const { direction = 'both', normalized = false } = options
  if (direction !== 'in' && direction !== 'out' && direction !== 'both') throw new RangeError("direction must be 'in', 'out' or 'both'")
  const { ids, count } = indexNodes(nodes, edges)
  const degree = new Map<string, number>(ids.map(id => [id, 0]))
  for (const edge of edges) {
    if (direction !== 'in') degree.set(edge.from, degree.get(edge.from)! + 1)
    if (direction !== 'out') degree.set(edge.to, degree.get(edge.to)! + 1)
  }
  const scale = normalized ? (count > 1 ? 1 / (count - 1) : 0) : 1
  if (normalized) for (const [id, value] of degree) degree.set(id, value * scale)
  return degree
}

export interface GraphBetweennessOptions {
  /** Default true follows edge direction only; false lets edges be walked both ways. */
  directed?: boolean
  /** Scale scores to [0, 1]. Default true. */
  normalized?: boolean
  /** Edge length; must be finite and greater than 0. Without it every edge has length 1. */
  weight?: (edge: GraphEdge) => number
}

/**
 * Betweenness centrality by Brandes' algorithm: for every node, the share of shortest paths between other node
 * pairs that pass through it. Cost is O(V·E) without `weight` and O(V·(E + V) log V) with it, so it suits graphs of
 * a few thousand nodes. Parallel edges count as distinct shortest paths; self-loops never lie on shortest paths.
 * Lengths that differ by less than a relative 1e-12 are treated as equal.
 *
 * Normalization divides by (n − 1)(n − 2), the number of ordered node pairs excluding the node itself. For undirected
 * graphs the raw score counts each unordered pair once (the ordered sum halved) and the divisor is (n − 1)(n − 2) / 2,
 * which gives the same result as dividing the ordered sum by (n − 1)(n − 2). With fewer than three nodes, normalized scores are 0.
 */
export function graphBetweennessCentrality(
  nodes: readonly IdentifiedNode[],
  edges: readonly GraphEdge[],
  options: GraphBetweennessOptions = {},
): Map<string, number> {
  const { directed = true, normalized = true, weight } = options
  const { ids, count, position } = indexNodes(nodes, edges)
  const adjacency: Arc[][] = ids.map(() => [])
  for (const edge of edges) {
    const cost = edgeCost(edge, weight, false)
    const a = position.get(edge.from)!
    const b = position.get(edge.to)!
    if (a === b) continue
    adjacency[a]!.push({ to: b, cost })
    if (!directed) adjacency[b]!.push({ to: a, cost })
  }

  const score = new Array<number>(count).fill(0)
  const sigma = new Array<number>(count)
  const dist = new Array<number>(count)
  const delta = new Array<number>(count)
  const predecessors: number[][] = ids.map(() => [])

  for (let source = 0; source < count; source++) {
    sigma.fill(0)
    dist.fill(Infinity)
    delta.fill(0)
    for (const list of predecessors) list.length = 0
    sigma[source] = 1
    dist[source] = 0
    const order: number[] = []

    if (!weight) {
      const queue = [source]
      for (let head = 0; head < queue.length; head++) {
        const v = queue[head]!
        order.push(v)
        for (const { to } of adjacency[v]!) {
          if (dist[to] === Infinity) {
            dist[to] = dist[v]! + 1
            queue.push(to)
          }
          if (dist[to] === dist[v]! + 1) {
            sigma[to] += sigma[v]!
            predecessors[to]!.push(v)
          }
        }
      }
    } else {
      const heap = new MinHeap()
      const settled = new Array<boolean>(count).fill(false)
      heap.push(0, source)
      while (heap.size) {
        const [d, v] = heap.pop()
        if (settled[v]) continue
        settled[v] = true
        order.push(v)
        for (const { to, cost } of adjacency[v]!) {
          if (settled[to]) continue
          const next = d + cost
          const known = dist[to]!
          const tolerance = 1e-12 * Math.max(1, Math.abs(next))
          if (known === Infinity || next < known - tolerance) {
            dist[to] = next
            sigma[to] = sigma[v]!
            predecessors[to]!.length = 0
            predecessors[to]!.push(v)
            heap.push(next, to)
          } else if (Math.abs(next - known) <= tolerance) {
            sigma[to] += sigma[v]!
            predecessors[to]!.push(v)
          }
        }
      }
    }

    for (let i = order.length - 1; i >= 0; i--) {
      const w = order[i]!
      for (const v of predecessors[w]!) delta[v] += (sigma[v]! / sigma[w]!) * (1 + delta[w]!)
      if (w !== source) score[w] += delta[w]!
    }
  }

  const result = new Map<string, number>()
  let scale = directed ? 1 : 0.5
  if (normalized) scale = count > 2 ? 1 / ((count - 1) * (count - 2)) : 0
  for (let i = 0; i < count; i++) result.set(ids[i]!, score[i]! * scale)
  return result
}

export interface GraphPageRankOptions {
  /** Probability of following a link rather than jumping to a random node; in [0, 1). Default 0.85. */
  damping?: number
  /** Stop when the L1 change between iterations drops below this; finite and greater than 0. Default 1e-6. */
  tolerance?: number
  /** Iteration cap; a positive integer. Default 100. */
  maxIterations?: number
  /** Edge weight; finite and nonnegative. Without it every edge counts 1. */
  weight?: (edge: GraphEdge) => number
}

export interface GraphPageRankResult {
  /** Score per node ID in input order; the scores sum to 1 (the map is empty for an empty graph). */
  scores: Map<string, number>
  /** Iterations performed. */
  iterations: number
  /** False when `maxIterations` was reached before the change fell below `tolerance`. */
  converged: boolean
}

/**
 * PageRank by power iteration. Edges point from the linking node to the linked one; parallel edges add their
 * weights and a self-loop is an ordinary link. Nodes without outgoing weight (dangling) spread their score uniformly
 * over all nodes. Returns `{ scores, iterations, converged }` rather than a bare map so callers can detect a run
 * that hit the iteration cap.
 */
export function graphPageRank(
  nodes: readonly IdentifiedNode[],
  edges: readonly GraphEdge[],
  options: GraphPageRankOptions = {},
): GraphPageRankResult {
  const { damping = 0.85, tolerance = 1e-6, maxIterations = 100, weight } = options
  if (!Number.isFinite(damping) || damping < 0 || damping >= 1) throw new RangeError('damping must be in [0, 1)')
  if (!Number.isFinite(tolerance) || tolerance <= 0) throw new RangeError('tolerance must be finite and greater than 0')
  if (!Number.isInteger(maxIterations) || maxIterations < 1) throw new RangeError('maxIterations must be a positive integer')
  const { ids, count, position } = indexNodes(nodes, edges)
  if (!count) return { scores: new Map(), iterations: 0, converged: true }

  const links: Arc[][] = ids.map(() => [])
  const outWeight = new Array<number>(count).fill(0)
  for (const edge of edges) {
    const cost = edgeCost(edge, weight, true)
    if (cost === 0) continue
    const a = position.get(edge.from)!
    links[a]!.push({ to: position.get(edge.to)!, cost })
    outWeight[a] += cost
  }

  let rank = new Array<number>(count).fill(1 / count)
  let next = new Array<number>(count)
  let iterations = 0
  let converged = false
  while (iterations < maxIterations && !converged) {
    iterations++
    let dangling = 0
    for (let i = 0; i < count; i++) if (outWeight[i] === 0) dangling += rank[i]!
    next.fill((1 - damping) / count + (damping * dangling) / count)
    for (let i = 0; i < count; i++) {
      if (outWeight[i] === 0) continue
      const share = (damping * rank[i]!) / outWeight[i]!
      for (const { to, cost } of links[i]!) next[to] += share * cost
    }
    let change = 0
    for (let i = 0; i < count; i++) change += Math.abs(next[i]! - rank[i]!)
    ;[rank, next] = [next, rank]
    converged = change < tolerance
  }
  // Renormalize to cancel floating-point drift so the scores sum to 1.
  let total = 0
  for (const value of rank) total += value
  return { scores: new Map(ids.map((id, i) => [id, rank[i]! / total])), iterations, converged }
}

export interface GraphCommunityOptions {
  /** Modularity resolution γ; larger values give smaller communities. Finite and greater than 0. Default 1. */
  resolution?: number
  /** Edge weight; finite and greater than 0. Without it every edge counts 1. */
  weight?: (edge: GraphEdge) => number
}

export interface GraphCommunityResult {
  /** Node IDs per community: members in input order, communities ordered by their first member's input position. */
  communities: string[][]
  /** Modularity of the partition at the given resolution (0 for a graph without edges). */
  modularity: number
}

interface LevelGraph {
  adjacency: Map<number, number>[]
  /** Weight of edges inside each super-node (each undirected edge once); it adds twice to the degree. */
  loops: number[]
}

/**
 * Louvain community detection: local moving of nodes to the neighbouring community with the best modularity gain,
 * then aggregation of communities into super-nodes, repeated until no node moves. Edge direction is ignored, parallel
 * edges and self-loops add their weights. Deterministic: nodes are visited in input order and ties keep the current
 * community. Modularity is Q = Σ_c [ in_c / 2m − γ (tot_c / 2m)² ]. Expect roughly O(E log V) time on typical graphs.
 */
export function detectGraphCommunities(
  nodes: readonly IdentifiedNode[],
  edges: readonly GraphEdge[],
  options: GraphCommunityOptions = {},
): GraphCommunityResult {
  const { resolution = 1, weight } = options
  if (!Number.isFinite(resolution) || resolution <= 0) throw new RangeError('resolution must be finite and greater than 0')
  const { ids, count, position } = indexNodes(nodes, edges)

  let level: LevelGraph = { adjacency: ids.map(() => new Map<number, number>()), loops: new Array<number>(count).fill(0) }
  let twoM = 0
  for (const edge of edges) {
    const w = edgeCost(edge, weight, false)
    const a = position.get(edge.from)!
    const b = position.get(edge.to)!
    twoM += 2 * w
    if (a === b) {
      level.loops[a] += w
    } else {
      level.adjacency[a]!.set(b, (level.adjacency[a]!.get(b) ?? 0) + w)
      level.adjacency[b]!.set(a, (level.adjacency[b]!.get(a) ?? 0) + w)
    }
  }

  // membership[i]: current super-node of original node i.
  let membership = Array.from({ length: count }, (_, i) => i)
  const original = level
  if (twoM > 0) {
    for (;;) {
      const size = level.adjacency.length
      const degree = level.adjacency.map((neighbors, i) => {
        let sum = 2 * level.loops[i]!
        for (const w of neighbors.values()) sum += w
        return sum
      })
      const community = Array.from({ length: size }, (_, i) => i)
      const total = degree.slice()
      let moved = false
      for (let pass = true; pass;) {
        pass = false
        for (let v = 0; v < size; v++) {
          const own = community[v]!
          const toCommunity = new Map<number, number>()
          for (const [u, w] of level.adjacency[v]!) toCommunity.set(community[u]!, (toCommunity.get(community[u]!) ?? 0) + w)
          total[own] -= degree[v]!
          let best = own
          let bestGain = (toCommunity.get(own) ?? 0) - (resolution * total[own]! * degree[v]!) / twoM
          for (const [c, w] of toCommunity) {
            if (c === own) continue
            const gain = w - (resolution * total[c]! * degree[v]!) / twoM
            if (gain > bestGain + 1e-12) {
              best = c
              bestGain = gain
            }
          }
          total[best] += degree[v]!
          if (best !== own) {
            community[v] = best
            pass = true
            moved = true
          }
        }
      }
      if (!moved) break

      // Aggregate: renumber communities by first appearance and build the next level graph.
      const renumber = new Map<number, number>()
      for (let v = 0; v < size; v++) if (!renumber.has(community[v]!)) renumber.set(community[v]!, renumber.size)
      const next: LevelGraph = {
        adjacency: Array.from({ length: renumber.size }, () => new Map<number, number>()),
        loops: new Array<number>(renumber.size).fill(0),
      }
      for (let v = 0; v < size; v++) {
        const a = renumber.get(community[v]!)!
        next.loops[a] += level.loops[v]!
        for (const [u, w] of level.adjacency[v]!) {
          if (u < v) continue
          const b = renumber.get(community[u]!)!
          if (a === b) next.loops[a] += w
          else {
            next.adjacency[a]!.set(b, (next.adjacency[a]!.get(b) ?? 0) + w)
            next.adjacency[b]!.set(a, (next.adjacency[b]!.get(a) ?? 0) + w)
          }
        }
      }
      membership = membership.map(previous => renumber.get(community[previous]!)!)
      level = next
    }
  }

  // Order communities by the first original node they contain.
  const order = new Map<number, number>()
  const communities: string[][] = []
  for (let i = 0; i < count; i++) {
    let c = order.get(membership[i]!)
    if (c === undefined) {
      c = communities.length
      order.set(membership[i]!, c)
      communities.push([])
    }
    communities[c]!.push(ids[i]!)
  }

  let modularity = 0
  if (twoM > 0) {
    const inside = new Array<number>(communities.length).fill(0)
    const total = new Array<number>(communities.length).fill(0)
    for (let v = 0; v < count; v++) {
      const c = order.get(membership[v]!)!
      total[c] += 2 * original.loops[v]!
      inside[c] += 2 * original.loops[v]!
      for (const [u, w] of original.adjacency[v]!) {
        total[c] += w
        if (order.get(membership[u]!) === c) inside[c] += w
      }
    }
    for (let c = 0; c < communities.length; c++) {
      modularity += inside[c]! / twoM - resolution * (total[c]! / twoM) ** 2
    }
  }
  return { communities, modularity }
}

export interface GraphCommunityGroupsOptions {
  /** Prefix of generated group IDs (`idPrefix + (index + 1)`). Default `'community-'`. */
  idPrefix?: string
  /** Group label from its members and its zero-based index in `communities`. Default `Community N`. */
  label?: (members: readonly string[], index: number) => string
  /** Communities with fewer members produce no group. A positive integer; default 2. */
  minSize?: number
}

/**
 * Turn communities into `NetworkGraph` `groups`. Numbering follows the position in `communities`, so skipped small
 * communities leave gaps and the IDs of the others stay stable. Group IDs must not collide with node IDs, because
 * collapsing a group uses the group ID for its proxy node; choose `idPrefix` accordingly. A node listed in two
 * communities throws an Error.
 */
export function graphCommunityGroups(
  communities: readonly (readonly string[])[],
  options: GraphCommunityGroupsOptions = {},
): GraphGroup[] {
  const { idPrefix = 'community-', label, minSize = 2 } = options
  if (!Number.isInteger(minSize) || minSize < 1) throw new RangeError('minSize must be a positive integer')
  if (typeof idPrefix !== 'string') throw new RangeError('idPrefix must be a string')
  const seen = new Set<string>()
  for (const members of communities) {
    for (const id of members) {
      if (seen.has(id)) throw new Error(`Graph node ${id} appears in more than one community`)
      seen.add(id)
    }
  }
  const groups: GraphGroup[] = []
  communities.forEach((members, index) => {
    if (members.length < minSize) return
    groups.push({
      id: `${idPrefix}${index + 1}`,
      label: label ? label(members, index) : `Community ${index + 1}`,
      nodeIds: [...members],
    })
  })
  return groups
}
