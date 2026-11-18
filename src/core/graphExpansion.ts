import type { GraphEdge } from './graph.js'
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
  /** Loaded nodes that are neither expanded nor being expanded, in load order. */
  frontierIds: string[]
}

function checkPage<N extends { id: string }, E extends GraphEdge>(page: GraphExpansionPage<N, E>) {
  if (!page || typeof page !== 'object') throw new TypeError('A graph page must be an object')
  const nodeIds = new Set<string>()
  for (const node of page.nodes ?? []) {
    if (typeof node?.id !== 'string' || node.id === '') throw new Error('Graph page nodes need a non-empty string ID')
    if (nodeIds.has(node.id)) throw new Error('Duplicate node ID in one graph page: ' + node.id)
    nodeIds.add(node.id)
  }
  const edgeIds = new Set<string>()
  for (const edge of page.edges ?? []) {
    if (typeof edge?.id !== 'string' || edge.id === '') throw new Error('Graph page edges need a non-empty string ID')
    if (edgeIds.has(edge.id)) throw new Error('Duplicate edge ID in one graph page: ' + edge.id)
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

/** Marks nodes as being expanded, so they leave the frontier until their page is merged or the expansion is cancelled. */
export function beginGraphExpansion<N extends { id: string }, E extends GraphEdge>(
  state: GraphExpansionState<N, E>, ids: Iterable<string>,
): GraphExpansionState<N, E> {
  const pendingIds = new Set(state.pendingIds)
  for (const id of ids) if (!state.expandedIds.has(id)) pendingIds.add(id)
  return { ...state, pendingIds }
}

/** Forgets that nodes are being expanded (after a failed or aborted load); they return to the frontier. */
export function cancelGraphExpansion<N extends { id: string }, E extends GraphEdge>(
  state: GraphExpansionState<N, E>, ids: Iterable<string>,
): GraphExpansionState<N, E> {
  const pendingIds = new Set(state.pendingIds)
  for (const id of ids) pendingIds.delete(id)
  return { ...state, pendingIds }
}

/**
 * Merges a page into the state: nodes and edges are added or replaced by ID, so overlapping pages (a cycle reached from
 * two sides, a neighbour shared by two expanded nodes) never duplicate anything, and `expandedIds` (the nodes whose
 * neighbours the page holds) are marked expanded and no longer pending. Throws Error for an item without a non-empty
 * string ID, an ID twice in the page or an edge without string ends. The inputs are not modified.
 */
export function mergeGraphExpansionPage<N extends { id: string }, E extends GraphEdge>(
  state: GraphExpansionState<N, E>, page: GraphExpansionPage<N, E>, expandedIds: Iterable<string> = [],
): GraphExpansionState<N, E> {
  checkPage(page)
  const nodes = new Map(state.nodes)
  for (const node of page.nodes ?? []) nodes.set(node.id, node)
  const edges = new Map(state.edges)
  for (const edge of page.edges ?? []) edges.set(edge.id, edge)
  const expanded = new Set(state.expandedIds)
  const pendingIds = new Set(state.pendingIds)
  for (const id of expandedIds) {
    expanded.add(id)
    pendingIds.delete(id)
  }
  return { nodes, edges, expandedIds: expanded, pendingIds }
}

/** The component input of a state: the loaded nodes, the edges between them, the dangling edges and the frontier. */
export function graphExpansionView<N extends { id: string }, E extends GraphEdge>(state: GraphExpansionState<N, E>): GraphExpansionView<N, E> {
  const { resolved, dangling } = splitDanglingLinks([...state.edges.values()], state.nodes)
  const frontierIds: string[] = []
  for (const id of state.nodes.keys()) if (!state.expandedIds.has(id) && !state.pendingIds.has(id)) frontierIds.push(id)
  return { nodes: [...state.nodes.values()], edges: resolved, dangling, frontierIds }
}
