import type { GraphEdge } from './graph.js'
import { duplicateIdError, formatId, inContext, invalidIdError, isId } from './ids.js'
import { splitDanglingLinks, type DanglingLink } from './windowedData.js'

/**
 * Incremental neighbourhood expansion of a partially loaded graph. The application loads pages of nodes and edges (for
 * example the direct neighbours of one node at a time) and merges them here: nodes and edges are deduplicated by ID,
 * expanded nodes are remembered, and edges to nodes that are not loaded yet are kept apart from the component input.
 * Pure and immutable: every function returns a new state. Layout stability on expansion is not handled here.
 */
export interface GraphExpansionState<N extends { id: string } = { id: string }, E extends GraphEdge = GraphEdge> {
  /** Loaded nodes by ID, in first-arrival order; a later page replaces a node with the same ID. */
  readonly nodes: ReadonlyMap<string, N>
  /** Loaded edges by ID, in first-arrival order, including dangling ones. */
  readonly edges: ReadonlyMap<string, E>
  /** Nodes whose neighbours have been loaded. */
  readonly expandedIds: ReadonlySet<string>
  /** Nodes whose expansion is in flight (`beginGraphExpansion`). */
  readonly pendingIds: ReadonlySet<string>
  /**
   * Nodes expanded for one key only (a direction such as `forward`, or a relation), by key. A node in `expandedIds` is
   * expanded for every key, whether or not it is listed here. Absent until a keyed page is merged.
   */
  readonly expandedIdsByKey?: ReadonlyMap<string, ReadonlySet<string>>
  /** Nodes whose expansion for one key is in flight, by key. Absent until a keyed expansion begins. */
  readonly pendingIdsByKey?: ReadonlyMap<string, ReadonlySet<string>>
}

/** Selects a keyed expansion: what was expanded, for example `forward`, `backward` or a relation name. */
export interface GraphExpansionKeyOptions {
  /** A non-empty string. Without it, a call works on the whole expansion of the nodes, as it always has. */
  key?: string
}

/** A page of a graph source: the nodes and edges it returned. */
export interface GraphExpansionPage<N extends { id: string } = { id: string }, E extends GraphEdge = GraphEdge> {
  nodes?: readonly N[]
  edges?: readonly E[]
}

/** What to pass to NetworkGraph, and what to keep aside. */
export interface GraphExpansionView<N extends { id: string } = { id: string }, E extends GraphEdge = GraphEdge> {
  /** Every loaded node. */
  nodes: N[]
  /** Edges whose both ends are loaded: safe for NetworkGraph `edges`. */
  edges: E[]
  /** Edges with an end that is not loaded yet; they move to `edges` once that node arrives. */
  dangling: DanglingLink<E>[]
  /**
   * Loaded nodes that are neither expanded nor being expanded, in load order. With a `key`, nodes expanded or being
   * expanded entirely or for that key are left out.
   */
  frontierIds: string[]
}

function checkPage<N extends { id: string }, E extends GraphEdge>(page: GraphExpansionPage<N, E>) {
  if (!page || typeof page !== 'object') throw new TypeError('A graph page must be an object')
  const nodeIds = new Set<string>()
  for (const node of page.nodes ?? []) {
    if (!isId(node?.id)) throw invalidIdError('graph page node', node?.id)
    if (nodeIds.has(node.id)) throw inContext(duplicateIdError('graph page node', node.id), 'in one page')
    nodeIds.add(node.id)
  }
  const edgeIds = new Set<string>()
  for (const edge of page.edges ?? []) {
    if (!isId(edge?.id)) throw invalidIdError('graph page edge', edge?.id)
    if (edgeIds.has(edge.id)) throw inContext(duplicateIdError('graph page edge', edge.id), 'in one page')
    if (typeof edge.from !== 'string' || typeof edge.to !== 'string') throw new Error('Graph page edge needs string ends: ' + edge.id)
    edgeIds.add(edge.id)
  }
}

/** A state holding an optional first page (for example the selected nodes), with nothing expanded. */
export function createGraphExpansion<N extends { id: string }, E extends GraphEdge = GraphEdge>(
  seed: GraphExpansionPage<N, E> = {},
): GraphExpansionState<N, E> {
  return mergeGraphExpansionPage<N, E>({ nodes: new Map(), edges: new Map(), expandedIds: new Set(), pendingIds: new Set() }, seed)
}

function expansionKey(options: GraphExpansionKeyOptions | undefined): string | undefined {
  if (options === undefined) return undefined
  if (!options || typeof options !== 'object') throw new TypeError('Graph expansion options must be an object')
  const { key } = options
  if (key !== undefined && !isId(key)) throw new Error('Invalid graph expansion key: ' + formatId(key))
  return key
}

/** A copy of `byKey` with `change` applied to a copy of the set of `key`; a set left empty is removed. */
function updateKeyed(
  byKey: ReadonlyMap<string, ReadonlySet<string>> | undefined, key: string, change: (ids: Set<string>) => void,
): ReadonlyMap<string, ReadonlySet<string>> {
  const next = new Map(byKey)
  const ids = new Set(byKey?.get(key))
  change(ids)
  if (ids.size) next.set(key, ids)
  else next.delete(key)
  return next
}

/**
 * Marks nodes as being expanded, so they leave the frontier until their page is merged or the expansion is cancelled.
 * With `options.key`, marks them as being expanded for that key only (in `pendingIdsByKey`); nodes already expanded,
 * entirely or for that key, are skipped. Throws Error for a key that is not a non-empty string.
 */
export function beginGraphExpansion<N extends { id: string }, E extends GraphEdge>(
  state: GraphExpansionState<N, E>, ids: Iterable<string>, options?: GraphExpansionKeyOptions,
): GraphExpansionState<N, E> {
  const key = expansionKey(options)
  if (key !== undefined) {
    const expandedForKey = state.expandedIdsByKey?.get(key)
    const pendingIdsByKey = updateKeyed(state.pendingIdsByKey, key, pending => {
      for (const id of ids) if (!state.expandedIds.has(id) && !expandedForKey?.has(id)) pending.add(id)
    })
    return { ...state, pendingIdsByKey }
  }
  const pendingIds = new Set(state.pendingIds)
  for (const id of ids) if (!state.expandedIds.has(id)) pendingIds.add(id)
  return { ...state, pendingIds }
}

/**
 * Forgets that nodes are being expanded (after a failed or aborted load); they return to the frontier. With
 * `options.key`, forgets only their expansion for that key; without, only their unkeyed expansion.
 */
export function cancelGraphExpansion<N extends { id: string }, E extends GraphEdge>(
  state: GraphExpansionState<N, E>, ids: Iterable<string>, options?: GraphExpansionKeyOptions,
): GraphExpansionState<N, E> {
  const key = expansionKey(options)
  if (key !== undefined) {
    const pendingIdsByKey = updateKeyed(state.pendingIdsByKey, key, pending => {
      for (const id of ids) pending.delete(id)
    })
    return { ...state, pendingIdsByKey }
  }
  const pendingIds = new Set(state.pendingIds)
  for (const id of ids) pendingIds.delete(id)
  return { ...state, pendingIds }
}

/**
 * Merges a page into the state: nodes and edges are added or replaced by ID, so overlapping pages (a cycle reached from
 * two sides, a neighbour shared by two expanded nodes) never duplicate anything, and `expandedIds` (the nodes whose
 * neighbours the page holds) are marked expanded and no longer pending. Throws Error for an item without a non-empty
 * string ID, an ID twice in the page or an edge without string ends. With `options.key`, `expandedIds` are marked
 * expanded for that key only (in `expandedIdsByKey`) and no longer pending for it; they stay in the unkeyed frontier.
 * Without a key they are expanded for every key. Throws Error for a key that is not a non-empty string. The inputs are
 * not modified.
 */
export function mergeGraphExpansionPage<N extends { id: string }, E extends GraphEdge>(
  state: GraphExpansionState<N, E>, page: GraphExpansionPage<N, E>, expandedIds: Iterable<string> = [],
  options?: GraphExpansionKeyOptions,
): GraphExpansionState<N, E> {
  const key = expansionKey(options)
  checkPage(page)
  const nodes = new Map(state.nodes)
  for (const node of page.nodes ?? []) nodes.set(node.id, node)
  const edges = new Map(state.edges)
  for (const edge of page.edges ?? []) edges.set(edge.id, edge)
  const keyed: { expandedIdsByKey?: ReadonlyMap<string, ReadonlySet<string>>; pendingIdsByKey?: ReadonlyMap<string, ReadonlySet<string>> } = {}
  if (state.expandedIdsByKey) keyed.expandedIdsByKey = state.expandedIdsByKey
  if (state.pendingIdsByKey) keyed.pendingIdsByKey = state.pendingIdsByKey
  if (key !== undefined) {
    const ids = [...expandedIds]
    keyed.expandedIdsByKey = updateKeyed(state.expandedIdsByKey, key, expanded => {
      for (const id of ids) expanded.add(id)
    })
    keyed.pendingIdsByKey = updateKeyed(state.pendingIdsByKey, key, pending => {
      for (const id of ids) pending.delete(id)
    })
    return { nodes, edges, expandedIds: state.expandedIds, pendingIds: state.pendingIds, ...keyed }
  }
  const expanded = new Set(state.expandedIds)
  const pendingIds = new Set(state.pendingIds)
  for (const id of expandedIds) {
    expanded.add(id)
    pendingIds.delete(id)
  }
  return { nodes, edges, expandedIds: expanded, pendingIds, ...keyed }
}

/**
 * The component input of a state: the loaded nodes, the edges between them, the dangling edges and the frontier. With
 * `options.key`, the frontier is that of the key: nodes expanded or pending entirely or for that key are left out.
 * Throws Error for a key that is not a non-empty string.
 */
export function graphExpansionView<N extends { id: string }, E extends GraphEdge>(
  state: GraphExpansionState<N, E>, options?: GraphExpansionKeyOptions,
): GraphExpansionView<N, E> {
  const key = expansionKey(options)
  const { resolved, dangling } = splitDanglingLinks([...state.edges.values()], state.nodes)
  const expandedForKey = key === undefined ? undefined : state.expandedIdsByKey?.get(key)
  const pendingForKey = key === undefined ? undefined : state.pendingIdsByKey?.get(key)
  const frontierIds: string[] = []
  for (const id of state.nodes.keys()) {
    if (state.expandedIds.has(id) || state.pendingIds.has(id) || expandedForKey?.has(id) || pendingForKey?.has(id)) continue
    frontierIds.push(id)
  }
  return { nodes: [...state.nodes.values()], edges: resolved, dangling, frontierIds }
}
