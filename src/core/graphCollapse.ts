import type { GraphEdge } from './graph.js'
import type { NetworkGroup, NetworkNode } from './types.js'
import { checkGraphGroups, checkGroupHierarchy, emptyGroupError } from './graphGroupChecks.js'
import { unknownReferenceError } from './ids.js'

/** A collapsed group as `collapseGraphGroups` reports it. */
export interface GraphCollapsedGroup {
  /** The group ID, which is also the ID of its proxy node. */
  id: string
  label: string
  /** Every hidden node of the group and its descendant groups, in input order. */
  nodeIds: string[]
}

/** Data of a proxy node made by `collapseGraphGroups`. */
export interface GraphCollapsedNodeData {
  collapsedGroup: string
  nodeIds: string[]
}

/** A proxy node made by `collapseGraphGroups`: it stands for a collapsed group and has its ID and label. */
export type GraphCollapsedNode = NetworkNode<GraphCollapsedNodeData>

/**
 * A node that NetworkGraph draws and hands to its `node` and `tooltip` slots, its `layout` function and its export
 * callbacks: an input node of type `N`, or, when the graph has groups (`G` is not `never`), a `GraphCollapsedNode`
 * proxy of a collapsed group.
 */
export type GraphShownNode<N extends NetworkNode = NetworkNode, G extends NetworkGroup = NetworkGroup> =
  N | ([G] extends [never] ? never : GraphCollapsedNode)

/**
 * An edge that NetworkGraph draws and hands to its `edge` and `tooltip` slots, its `layout` function and its export
 * callbacks: an input edge of type `E`, or, when the graph has groups (`G` is not `never`), an edge that merges several
 * edges re-attached to a collapsed group, which has no `data`.
 */
export type GraphShownEdge<E extends GraphEdge = GraphEdge, G extends NetworkGroup = NetworkGroup> =
  E | ([G] extends [never] ? never : GraphEdge<never>)

export interface GraphCollapseOptions {
  /** Detail text of a proxy node. Default "1 node" or "N nodes". Return undefined for no detail. */
  detail?: (group: GraphCollapsedGroup) => string | undefined
}

export interface GraphCollapseResult<N extends NetworkNode = NetworkNode, E extends GraphEdge = GraphEdge> {
  /** Visible nodes in input order; each proxy takes the place of its group's first member. */
  nodes: (N | NetworkNode)[]
  /**
   * Visible edges in input order. An edge between two visible nodes is kept as it is. Edges re-attached to a proxy are
   * merged into one edge per source, source port, target and target port; it keeps the ID of the first original edge.
   */
  edges: (E | GraphEdge)[]
  /** The groups that stay drawn, with each collapsed child group replaced by its proxy among the parent's nodeIds. */
  groups: NetworkGroup[]
  /** The outermost collapsed groups by proxy ID, in group input order. */
  proxies: Map<string, GraphCollapsedGroup>
  /** Every hidden node ID mapped to the proxy that stands for it. */
  owners: Map<string, string>
  /** Each re-attached edge ID mapped to the original edge IDs merged into it, in input order. */
  mergedEdges: Map<string, string[]>
  /** Original IDs of the edges dropped because both ends are inside the same collapsed group. */
  hiddenEdgeIds: string[]
}

/**
 * Replaces each outermost collapsed group with one proxy node. The proxy has the group's ID and label, a detail with the
 * member count, the rounded shape and `data` of type GraphCollapsedNodeData. Member nodes are removed, edges are
 * re-attached to the proxy (dropping the port on that end), edges inside one collapsed group are dropped, and parallel
 * re-attached edges are merged; a merged edge keeps its label, edgeStyle, markers, animated and dashed flags only when every merged
 * edge has the same value. Throws Error for a duplicate or empty group ID, an unknown parent, a parent cycle, an
 * unknown or repeated member, an unknown collapsed ID, or a collapsed group ID that is also a visible node ID. The
 * inputs are not modified.
 */
export function collapseGraphGroups<N extends NetworkNode, E extends GraphEdge>(
  nodes: readonly N[],
  edges: readonly E[],
  groups: readonly NetworkGroup[],
  collapsedIds: Iterable<string>,
  options: GraphCollapseOptions = {},
): GraphCollapseResult<N, E> {
  const nodeIds = new Set(nodes.map(node => node.id))
  const { byId, memberOf } = checkGraphGroups(groups, id => nodeIds.has(id))
  const children = checkGroupHierarchy(groups, byId)
  const collapsed = new Set<string>()
  for (const id of collapsedIds) {
    if (!byId.has(id)) throw unknownReferenceError('group', 'collapsedIds', id)
    collapsed.add(id)
  }
  // The outermost collapsed ancestor (or the group itself) of every group. A loop climbs to the nearest group whose
  // answer is known (or past the root) and fills in the answers on the way back down, so each group is resolved once.
  const outermost = new Map<string, string | undefined>()
  for (const group of groups) {
    const chain: NetworkGroup[] = []
    let current: NetworkGroup | undefined = group
    while (current && !outermost.has(current.id)) {
      chain.push(current)
      current = current.parentId === undefined ? undefined : byId.get(current.parentId)
    }
    let found = current ? outermost.get(current.id) : undefined
    for (let i = chain.length - 1; i >= 0; i--) {
      const item = chain[i]!
      if (found === undefined && collapsed.has(item.id)) found = item.id
      outermost.set(item.id, found)
    }
  }
  const owners = new Map<string, string>()
  const proxies = new Map<string, GraphCollapsedGroup>()
  for (const group of groups) {
    if (outermost.get(group.id) === group.id) proxies.set(group.id, { id: group.id, label: group.label, nodeIds: [] })
  }
  for (const node of nodes) {
    const group = memberOf.get(node.id)
    const proxy = group === undefined ? undefined : outermost.get(group)
    if (proxy === undefined) continue
    owners.set(node.id, proxy)
    proxies.get(proxy)!.nodeIds.push(node.id)
  }
  for (const proxy of proxies.values()) {
    if (nodeIds.has(proxy.id) && !owners.has(proxy.id)) throw new Error('Collapsed group ID is also a node ID: ' + proxy.id)
    if (!proxy.nodeIds.length) throw emptyGroupError(proxy.id)
  }
  const detail = options.detail ?? ((group: GraphCollapsedGroup) => group.nodeIds.length + (group.nodeIds.length === 1 ? ' node' : ' nodes'))
  const visible: (N | NetworkNode)[] = []
  const placed = new Set<string>()
  for (const node of nodes) {
    const proxyId = owners.get(node.id)
    if (proxyId === undefined) {
      visible.push(node)
      continue
    }
    if (placed.has(proxyId)) continue
    placed.add(proxyId)
    const proxy = proxies.get(proxyId)!
    const text = detail(proxy)
    const data: GraphCollapsedNodeData = { collapsedGroup: proxy.id, nodeIds: [...proxy.nodeIds] }
    visible.push({ id: proxy.id, label: proxy.label, ...(text === undefined ? {} : { detail: text }), shape: 'rounded', data })
  }

  const result: (E | GraphEdge)[] = []
  const mergedEdges = new Map<string, string[]>()
  const merged = new Map<string, { index: number; edges: E[] }>()
  const hiddenEdgeIds: string[] = []
  for (const edge of edges) {
    if (!nodeIds.has(edge.from)) throw unknownReferenceError('node', 'graph edge ' + edge.id, edge.from)
    if (!nodeIds.has(edge.to)) throw unknownReferenceError('node', 'graph edge ' + edge.id, edge.to)
    const from = owners.get(edge.from), to = owners.get(edge.to)
    if (from === undefined && to === undefined) {
      result.push(edge)
      continue
    }
    if (from !== undefined && from === to) {
      hiddenEdgeIds.push(edge.id)
      continue
    }
    const fromPort = from === undefined ? edge.fromPort : undefined, toPort = to === undefined ? edge.toPort : undefined
    const key = JSON.stringify([from ?? edge.from, fromPort, to ?? edge.to, toPort])
    const entry = merged.get(key)
    if (entry) {
      entry.edges.push(edge)
      continue
    }
    merged.set(key, { index: result.length, edges: [edge] })
    result.push(edge)
  }
  for (const { index, edges: group } of merged.values()) {
    const first = group[0]!
    const from = owners.get(first.from) ?? first.from, to = owners.get(first.to) ?? first.to
    const fromPort = owners.has(first.from) ? undefined : first.fromPort, toPort = owners.has(first.to) ? undefined : first.toPort
    let edge: GraphEdge
    if (group.length === 1) {
      // Waypoints were placed for the original ends, so a re-attached edge drops them.
      edge = { ...first, from, to }
      delete edge.fromPort
      delete edge.toPort
      delete edge.points
    } else {
      const label = group.every(item => item.label === first.label) ? first.label : undefined
      edge = { id: first.id, from, to }
      if (label !== undefined) edge.label = label
      // Appearance survives only when every merged edge agrees on it.
      const edgeStyle = group.every(item => item.edgeStyle === first.edgeStyle) ? first.edgeStyle : undefined
      const markerStart = group.every(item => item.markerStart === first.markerStart) ? first.markerStart : undefined
      const markerEnd = group.every(item => item.markerEnd === first.markerEnd) ? first.markerEnd : undefined
      const animated = group.every(item => item.animated === first.animated) ? first.animated : undefined
      const dashed = group.every(item => item.dashed === first.dashed) ? first.dashed : undefined
      if (edgeStyle !== undefined) edge.edgeStyle = edgeStyle
      if (markerStart !== undefined) edge.markerStart = markerStart
      if (markerEnd !== undefined) edge.markerEnd = markerEnd
      if (animated !== undefined) edge.animated = animated
      if (dashed !== undefined) edge.dashed = dashed
    }
    if (fromPort !== undefined) edge.fromPort = fromPort
    if (toPort !== undefined) edge.toPort = toPort
    result[index] = edge
    mergedEdges.set(first.id, group.map(item => item.id))
  }

  // Groups inside a collapsed group disappear; a collapsed child becomes a direct member of its parent.
  const shown: NetworkGroup[] = []
  for (const group of groups) {
    if (outermost.get(group.id) !== undefined) continue
    const ids = group.nodeIds.filter(id => !owners.has(id))
    for (const child of children.get(group.id) ?? []) {
      if (proxies.has(child.id)) ids.push(child.id)
    }
    shown.push({ ...group, nodeIds: ids })
  }
  return { nodes: visible, edges: result, groups: shown, proxies, owners, mergedEdges, hiddenEdgeIds }
}
