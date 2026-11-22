import {
  routeGraphPorts, type GraphBox, type GraphEdge, type GraphLayout, type GraphLayoutDirection, type GraphLayoutRoute, type GraphNodeSize,
  type GraphPoint, type IdentifiedNode,
} from './graph.js'
import { collapseGraphGroups, type GraphCollapseResult, type GraphShownEdge, type GraphShownNode } from './graphCollapse.js'
import { graphIncidentCurve } from './graphCurve.js'
import { isFiniteRect, markBuiltinRoutes } from './graphGeometry.js'
import { assertGraphLayoutDirection, isGraphLayoutDirection } from './graphOrient.js'
import { isGraphPortSide } from './graphPortSide.js'
import type { GraphLabels, NetworkGroup, NetworkNode } from './types.js'
import { invalidIdError, isId } from './ids.js'

/**
 * Which of the two layouts NetworkGraph asks for a request is: 'shown' lays out the nodes and edges it draws (with
 * collapsed groups, their proxies and re-attached edges); 'expanded' lays out the full input and is used only to place
 * the proxies of collapsed groups, so only its boxes matter.
 */
export type GraphLayoutScope = 'expanded' | 'shown'

/** The input of `buildGraphLayoutRequests`: everything that can change a layout. */
export interface GraphLayoutRequestInput<N extends NetworkNode = NetworkNode, E extends GraphEdge = GraphEdge, G extends NetworkGroup = NetworkGroup> {
  nodes: readonly N[]
  edges: readonly E[]
  groups?: readonly G[]
  /** Collapsed group IDs, as passed to NetworkGraph `collapsedGroupIds`. IDs of groups that do not exist are ignored. */
  collapsedGroupIds?: Iterable<string>
  /** Layout direction. Default 'LR'. */
  direction?: GraphLayoutDirection
  /**
   * Saved or fixed node positions to pass to the layout engine. Give them only when the engine honours them: they are
   * part of the input key, so every change asks for a new layout. NetworkGraph applies its `positions` prop after
   * layout either way.
   */
  positions?: ReadonlyMap<string, GraphPoint>
  /** Node sizes to pass to the layout engine. Like `positions`, give them only when the engine uses them. */
  sizes?: ReadonlyMap<string, GraphNodeSize>
  /**
   * Incremental layout: nodes the engine must keep where `positions` puts them (pinned). Optional; like `positions`,
   * part of the input key, so give them only when the engine honours them. IDs that are not nodes of a request (such as
   * members of a collapsed group in the 'shown' request) are passed as they are; engines ignore them.
   */
  fixedIds?: ReadonlySet<string>
  /**
   * Incremental layout: nodes that are new since the previous layout (for example the page of a graph expansion), which
   * the engine places around the others. Optional and part of the input key, like `fixedIds`.
   */
  addedIds?: ReadonlySet<string>
  /**
   * Engine settings. Must be JSON-serializable; its JSON text is part of the input key, so build it with a stable key
   * order.
   */
  settings?: unknown
  /**
   * Caller-managed version of anything else that changes the layout, such as node `data` a custom engine reads or the
   * engine's own version. Default ''.
   */
  revision?: string
  /**
   * The NetworkGraph `labels` the proxy detail text is built from (`collapsedNode` and `collapsedNodes`). Defaults "node"
   * and "nodes", as in NetworkGraph.
   */
  labels?: Partial<Pick<GraphLabels, 'collapsedNode' | 'collapsedNodes'>>
}

/** One layout to compute, as a layout engine or Worker receives it. */
export interface GraphLayoutRequest<N extends NetworkNode = NetworkNode, E extends GraphEdge = GraphEdge, G extends NetworkGroup = NetworkGroup> {
  /** ID of this request. Responses echo it; a response to an older request is not used. */
  requestId: string
  /** Identifies the layout input (see `graphLayoutInputKey`); responses echo it. */
  inputKey: string
  scope: GraphLayoutScope
  revision: string
  nodes: readonly N[]
  edges: readonly E[]
  /** The groups drawn with these nodes: the input groups for 'expanded', the groups that stay drawn for 'shown'. */
  groups: readonly G[]
  direction: GraphLayoutDirection
  positions?: ReadonlyMap<string, GraphPoint>
  sizes?: ReadonlyMap<string, GraphNodeSize>
  /** Pinned nodes, as given in the input; present only when the input has some. */
  fixedIds?: ReadonlySet<string>
  /** New nodes, as given in the input; present only when the input has some. */
  addedIds?: ReadonlySet<string>
  settings?: unknown
}

/** A computed layout for one request. */
export interface GraphLayoutResponse {
  requestId: string
  inputKey: string
  scope: GraphLayoutScope
  layout: GraphLayout
}

/** The requests `buildGraphLayoutRequests` makes for one input. */
export interface GraphLayoutRequests<N extends NetworkNode = NetworkNode, E extends GraphEdge = GraphEdge, G extends NetworkGroup = NetworkGroup> {
  /** The layout NetworkGraph draws. */
  shown: GraphLayoutRequest<GraphShownNode<N, G>, GraphShownEdge<E, G>, NetworkGroup>
  /** Present only while a group is collapsed: the full input, to place the proxies. */
  expanded?: GraphLayoutRequest<N, E, G>
  /** The collapsed view, as NetworkGraph builds it, while a group is collapsed. */
  collapse?: GraphCollapseResult<N, E>
}

/** The parts of a request, other than its nodes and edges, that `graphLayoutInputKey` reads. */
export interface GraphLayoutKeyInput {
  scope: GraphLayoutScope
  nodes: readonly IdentifiedNode[]
  edges: readonly GraphEdge[]
  groups?: readonly NetworkGroup[]
  /** The active collapsed group IDs; their order does not matter. */
  collapsedGroupIds?: Iterable<string>
  direction?: GraphLayoutDirection
  positions?: ReadonlyMap<string, GraphPoint>
  sizes?: ReadonlyMap<string, GraphNodeSize>
  fixedIds?: ReadonlySet<string>
  addedIds?: ReadonlySet<string>
  settings?: unknown
  revision?: string
}

function sortedEntries<V>(map: ReadonlyMap<string, V> | undefined): [string, V][] | undefined {
  if (!map?.size) return undefined
  return [...map].sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0)
}

/**
 * A string that identifies a layout input: the scope, direction, settings and revision, and, in order, the nodes (ID,
 * label, detail, shape and ports), the edges (ID, ends, ports, label and waypoints), the groups, the collapsed group IDs
 * and any positions and sizes given to the engine. A change to any of them gives a different key, even when the node IDs
 * stay the same. Node and edge `data` is not read; change `revision` when it affects the layout. Throws RangeError for an
 * unknown direction or scope, and for settings that cannot be serialized to JSON.
 */
export function graphLayoutInputKey(input: GraphLayoutKeyInput): string {
  const { scope, direction = 'LR', revision = '' } = input
  if (scope !== 'expanded' && scope !== 'shown') throw new RangeError('Unknown graph layout scope: ' + String(scope))
  assertGraphLayoutDirection(direction)
  let settings: string | undefined
  try {
    settings = JSON.stringify(input.settings)
  } catch (error) {
    throw new RangeError('Graph layout settings must be JSON-serializable: ' + (error as Error).message)
  }
  const nodes = input.nodes.map((node) => {
    const { id, label, detail, shape } = node as Partial<NetworkNode> & IdentifiedNode
    return [id, label, detail, shape, node.ports?.map(port => [port.id, port.side, port.direction, port.offset, port.label])]
  })
  const edges = input.edges.map(edge => [
    edge.id, edge.from, edge.to, edge.fromPort, edge.toPort, edge.label, edge.points?.map(point => [point.x, point.y]),
  ])
  const groups = input.groups?.map(group => [group.id, group.label, group.parentId, group.nodeIds])
  const collapsed = input.collapsedGroupIds ? [...new Set(input.collapsedGroupIds)].sort() : []
  const positions = sortedEntries(input.positions)?.map(([id, point]) => [id, point.x, point.y])
  const sizes = sortedEntries(input.sizes)?.map(([id, size]) => [id, size.width, size.height])
  const fixed = input.fixedIds?.size ? [...input.fixedIds].sort() : undefined
  const added = input.addedIds?.size ? [...input.addedIds].sort() : undefined
  // The incremental fields are appended only when present, so keys of inputs without them are unchanged.
  const incremental = fixed || added ? [fixed, added] : []
  return JSON.stringify(['vw-layout-1', scope, direction, revision, settings, nodes, edges, groups, collapsed, positions, sizes, ...incremental])
}

/**
 * The layout requests for one input, made the way NetworkGraph calls its `layout` function. Without collapsed groups
 * there is one 'shown' request for the input itself. With collapsed groups (IDs of groups that do not exist are dropped,
 * as NetworkGraph does) the 'shown' request holds the collapsed view from `collapseGraphGroups`, with the proxy detail
 * text built from `labels` like NetworkGraph builds it, and an 'expanded' request holds the full input. The requests
 * get the IDs `requestId + ':shown'` and `requestId + ':expanded'`. Throws like `collapseGraphGroups` and
 * `graphLayoutInputKey`. The inputs are not modified.
 */
export function buildGraphLayoutRequests<N extends NetworkNode, E extends GraphEdge, G extends NetworkGroup = NetworkGroup>(
  input: GraphLayoutRequestInput<N, E, G>, requestId: string,
): GraphLayoutRequests<N, E, G> {
  if (!isId(requestId)) throw invalidIdError('graph layout request', requestId)
  const { nodes, edges, groups = [], direction = 'LR', positions, sizes, fixedIds, addedIds, settings, revision = '' } = input
  const known = new Set(groups.map(group => group.id))
  const active = input.collapsedGroupIds && groups.length ? [...new Set(input.collapsedGroupIds)].filter(id => known.has(id)) : []
  const shared = {
    direction, revision, ...positions?.size && { positions }, ...sizes?.size && { sizes }, ...fixedIds?.size && { fixedIds },
    ...addedIds?.size && { addedIds }, ...settings !== undefined && { settings },
  }
  const request = <RN extends NetworkNode, RE extends GraphEdge, RG extends NetworkGroup>(
    scope: GraphLayoutScope, scopeNodes: readonly RN[], scopeEdges: readonly RE[], scopeGroups: readonly RG[], collapsed: readonly string[],
  ): GraphLayoutRequest<RN, RE, RG> => ({
    requestId: requestId + ':' + scope,
    inputKey: graphLayoutInputKey({ scope, nodes: scopeNodes, edges: scopeEdges, groups: scopeGroups, collapsedGroupIds: collapsed, ...shared }),
    scope, nodes: scopeNodes, edges: scopeEdges, groups: scopeGroups, ...shared,
  })
  if (!active.length) {
    return { shown: request('shown', nodes as readonly GraphShownNode<N, G>[], edges as readonly GraphShownEdge<E, G>[], groups as readonly NetworkGroup[], []) }
  }
  const { collapsedNode = 'node', collapsedNodes = 'nodes' } = input.labels ?? {}
  const collapse = collapseGraphGroups(nodes, edges, groups, active, {
    detail: group => group.nodeIds.length + ' ' + (group.nodeIds.length === 1 ? collapsedNode : collapsedNodes),
  })
  return {
    shown: request('shown', collapse.nodes as GraphShownNode<N, G>[], collapse.edges as GraphShownEdge<E, G>[], collapse.groups, active),
    expanded: request('expanded', nodes, edges, groups, []),
    collapse,
  }
}

function isMap(value: unknown): value is Map<unknown, unknown> {
  return value instanceof Map
}

function finite(...values: unknown[]) {
  return values.every(value => typeof value === 'number' && Number.isFinite(value))
}

/**
 * Checks a layout computed for a request and returns it. The response must echo the request's `requestId`, `inputKey`
 * and `scope` (Error otherwise, for a stale or foreign response). Every request node needs a finite box with a positive
 * size. For a 'shown' request, as NetworkGraph checks its layout, the width and height must also be finite and
 * positive, every edge needs a path, and route metadata, when present, must have finite points and the edge's ports.
 * Throws Error for a missing box, path or map, or a mismatched route, and RangeError for invalid numbers.
 */
export function validateGraphLayoutResponse(request: GraphLayoutRequest, response: GraphLayoutResponse): GraphLayout {
  if (response.requestId !== request.requestId || response.inputKey !== request.inputKey || response.scope !== request.scope) {
    throw new Error(`Graph layout response ${String(response.requestId)} does not answer request ${request.requestId}`)
  }
  const { layout } = response
  if (!layout || !isMap(layout.boxes)) throw new Error('Graph layout response has no boxes: ' + request.requestId)
  for (const node of request.nodes) {
    const box = layout.boxes.get(node.id) as GraphBox | undefined
    if (!box) throw new Error('Missing layout box: ' + node.id)
    if (!isFiniteRect(box, 'positive')) throw new RangeError('Invalid layout box: ' + node.id)
  }
  if (request.scope === 'expanded') return layout
  if (!finite(layout.width, layout.height) || layout.width <= 0 || layout.height <= 0) {
    throw new RangeError('A graph layout must have positive finite dimensions: ' + request.requestId)
  }
  if (!isMap(layout.paths) || !isMap(layout.edgeLabels)) throw new Error('Graph layout response has no paths or edge labels: ' + request.requestId)
  if (layout.routes !== undefined && !isMap(layout.routes)) throw new Error('Graph layout routes must be a Map: ' + request.requestId)
  for (const edge of request.edges) {
    if (typeof layout.paths.get(edge.id) !== 'string') throw new Error('Missing layout path: ' + edge.id)
    const route = layout.routes?.get(edge.id)
    if (!route) continue
    if (!finite(route.start?.x, route.start?.y, route.end?.x, route.end?.y) || !(route.points ?? []).every(point => finite(point?.x, point?.y))) {
      throw new RangeError('Invalid route points: ' + edge.id)
    }
    if (route.fromPort !== edge.fromPort || route.toPort !== edge.toPort) throw new Error('Route ports do not match edge: ' + edge.id)
    for (const side of [route.fromSide, route.toSide]) {
      if (side !== undefined && !isGraphPortSide(side)) throw new Error('Invalid route side: ' + edge.id)
    }
  }
  return layout
}

/** Options of `completeGraphLayout`. */
export interface GraphLayoutCompletionOptions {
  /** Layout direction, which picks the sides of the temporary curves. Default 'LR'. */
  direction?: GraphLayoutDirection
}

/** The result of `completeGraphLayout`. */
export interface GraphLayoutCompletion {
  /** The layout with temporary routes added, or the input layout when nothing was missing. */
  layout: GraphLayout
  /** Edges that received a temporary built-in route, in input order. */
  temporaryEdgeIds: string[]
  /** Edges without a path that could not be routed because a box of an end is missing, in input order. */
  unresolvedEdgeIds: string[]
}

/**
 * Fills in temporary routes for the edges a cached layout has no path for, such as an edge connected while a new layout
 * is computed. An edge whose end boxes both exist gets the curve the core draws for a moved node, or between its ports
 * when it has named ports, and a label anchor; it is listed in `temporaryEdgeIds`, and the routing policy 'preserve'
 * treats it as a built-in route, so it is redrawn when routed. Other paths, boxes and route metadata are kept. Throws
 * RangeError for an unknown direction. The inputs are not modified.
 */
export function completeGraphLayout(
  layout: GraphLayout, nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[], options: GraphLayoutCompletionOptions = {},
): GraphLayoutCompletion {
  const { direction = 'LR' } = options
  assertGraphLayoutDirection(direction)
  const missing: GraphEdge[] = [], unresolvedEdgeIds: string[] = []
  for (const edge of edges) {
    if (layout.paths.has(edge.id)) continue
    if (layout.boxes.has(edge.from) && layout.boxes.has(edge.to)) missing.push(edge)
    else unresolvedEdgeIds.push(edge.id)
  }
  if (!missing.length) return { layout, temporaryEdgeIds: [], unresolvedEdgeIds }
  const paths = new Map(layout.paths), edgeLabels = new Map(layout.edgeLabels)
  for (const edge of missing) {
    const curve = graphIncidentCurve(layout.boxes.get(edge.from)!, layout.boxes.get(edge.to)!, edge.from === edge.to, direction)
    paths.set(edge.id, curve.path)
    edgeLabels.set(edge.id, curve.label)
  }
  let completed: GraphLayout = { ...layout, paths, edgeLabels }
  const ported = missing.filter(edge => edge.fromPort !== undefined || edge.toPort !== undefined)
  if (ported.length) completed = routeGraphPorts(completed, new Map(nodes.map(node => [node.id, node])), ported, direction)
  const temporaryEdgeIds = missing.map(edge => edge.id)
  // `completed` is a new object either way; the built-in routes of the input carry over with the temporary ones.
  return { layout: markBuiltinRoutes(completed, layout, temporaryEdgeIds), temporaryEdgeIds, unresolvedEdgeIds }
}

// Worker messages.

/** A request to compute a layout, sent to a Worker or another layout process. */
export interface GraphLayoutRequestMessage {
  type: 'request'
  request: GraphLayoutRequest
}

/** Asks the engine to stop computing a request. Its result, if one still arrives, is discarded either way. */
export interface GraphLayoutCancelMessage {
  type: 'cancel'
  requestId: string
  inputKey: string
}

/** A computed layout. */
export interface GraphLayoutSuccessMessage extends GraphLayoutResponse {
  type: 'success'
}

/** A failed request, with a description of the error. */
export interface GraphLayoutFailureMessage {
  type: 'failure'
  requestId: string
  inputKey: string
  scope: GraphLayoutScope
  message: string
}

/** A layout Worker message as sent by structured clone, with Maps. */
export type GraphLayoutWorkerMessage = GraphLayoutRequestMessage | GraphLayoutCancelMessage | GraphLayoutSuccessMessage | GraphLayoutFailureMessage

/** A `GraphLayout` with its Maps as entry arrays, for JSON. */
export interface GraphLayoutJson {
  boxes: [string, GraphBox][]
  paths: [string, string][]
  edgeLabels: [string, GraphPoint][]
  width: number
  height: number
  routes?: [string, GraphLayoutRoute][]
}

/** A `GraphLayoutRequest` with its Maps as entry arrays and its Sets as ID arrays, for JSON. */
export type GraphLayoutRequestJson = Omit<GraphLayoutRequest, 'positions' | 'sizes' | 'fixedIds' | 'addedIds'> & {
  positions?: [string, GraphPoint][]
  sizes?: [string, GraphNodeSize][]
  fixedIds?: string[]
  addedIds?: string[]
}

/** A layout Worker message in JSON form: every Map is an array of entries. */
export type GraphLayoutWorkerJsonMessage =
  | { type: 'request'; request: GraphLayoutRequestJson }
  | GraphLayoutCancelMessage
  | (Omit<GraphLayoutSuccessMessage, 'layout'> & { layout: GraphLayoutJson })
  | GraphLayoutFailureMessage

/** Converts a layout's Maps to entry arrays, for JSON. */
export function graphLayoutToJson(layout: GraphLayout): GraphLayoutJson {
  return {
    boxes: [...layout.boxes], paths: [...layout.paths], edgeLabels: [...layout.edgeLabels], width: layout.width, height: layout.height,
    ...layout.routes && { routes: [...layout.routes] },
  }
}

function invalid(what: string): never {
  throw new Error('Invalid graph layout message: ' + what)
}

function entries(value: unknown, what: string): [string, unknown][] {
  if (!Array.isArray(value)) invalid(what + ' must be an array of entries')
  for (const entry of value) {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== 'string') invalid(what + ' must hold [id, value] entries')
  }
  return value as [string, unknown][]
}

function pointLike(value: unknown, what: string) {
  const point = value as GraphPoint | null
  if (typeof point !== 'object' || point === null || !finite(point.x, point.y)) invalid(what + ' must have finite x and y')
}

function checkLayoutMaps(boxes: Iterable<[string, unknown]>, paths: Iterable<[string, unknown]>, labels: Iterable<[string, unknown]>,
  routes: Iterable<[string, unknown]> | undefined, width: unknown, height: unknown) {
  for (const [id, box] of boxes) {
    const value = box as GraphBox | null
    if (typeof value !== 'object' || value === null || !finite(value.x, value.y, value.width, value.height, value.rank)) invalid('box ' + id)
  }
  for (const [id, path] of paths) if (typeof path !== 'string') invalid('path ' + id)
  for (const [id, label] of labels) pointLike(label, 'edge label ' + id)
  for (const [id, route] of routes ?? []) {
    const value = route as GraphLayoutRoute | null
    if (typeof value !== 'object' || value === null) invalid('route ' + id)
    pointLike(value.start, 'route start ' + id)
    pointLike(value.end, 'route end ' + id)
    if (value.points !== undefined && !Array.isArray(value.points)) invalid('route points ' + id)
    for (const point of value.points ?? []) pointLike(point, 'route point ' + id)
  }
  if (!finite(width, height)) invalid('width and height must be finite numbers')
}

/** Rebuilds a layout from `graphLayoutToJson` output, checking its shape. Throws Error for malformed data. */
export function graphLayoutFromJson(value: unknown): GraphLayout {
  const json = value as Partial<GraphLayoutJson> | null
  if (typeof json !== 'object' || json === null) invalid('layout must be an object')
  const boxes = entries(json.boxes, 'boxes'), paths = entries(json.paths, 'paths'), labels = entries(json.edgeLabels, 'edgeLabels')
  const routes = json.routes === undefined ? undefined : entries(json.routes, 'routes')
  checkLayoutMaps(boxes, paths, labels, routes, json.width, json.height)
  return {
    boxes: new Map(boxes as [string, GraphBox][]), paths: new Map(paths as [string, string][]),
    edgeLabels: new Map(labels as [string, GraphPoint][]), width: json.width!, height: json.height!,
    ...routes && { routes: new Map(routes as [string, GraphLayoutRoute][]) },
  }
}

function checkHeader(message: Record<string, unknown>, scoped: boolean) {
  if (typeof message.requestId !== 'string' || !message.requestId) invalid('requestId must be a nonempty string')
  if (typeof message.inputKey !== 'string') invalid('inputKey must be a string')
  if (scoped && message.scope !== 'shown' && message.scope !== 'expanded') invalid('unknown scope')
}

function checkRequest(request: Record<string, unknown> | null) {
  if (typeof request !== 'object' || request === null) invalid('request must be an object')
  checkHeader(request, true)
  if (!Array.isArray(request.nodes) || !Array.isArray(request.edges) || !Array.isArray(request.groups)) invalid('request needs nodes, edges and groups arrays')
  if (typeof request.revision !== 'string' || !isGraphLayoutDirection(request.direction)) invalid('request needs a revision and a direction')
}

/** Converts a layout Worker message to its JSON form, with every Map as an array of entries. */
export function graphLayoutMessageToJson(message: GraphLayoutWorkerMessage): GraphLayoutWorkerJsonMessage {
  if (message.type === 'success') return { ...message, layout: graphLayoutToJson(message.layout) }
  if (message.type !== 'request') return { ...message }
  const { positions, sizes, fixedIds, addedIds, ...rest } = message.request
  return {
    type: 'request',
    request: {
      ...rest, ...positions && { positions: [...positions] }, ...sizes && { sizes: [...sizes] }, ...fixedIds && { fixedIds: [...fixedIds] },
      ...addedIds && { addedIds: [...addedIds] },
    },
  }
}

/**
 * Reads a layout Worker message in JSON form (for example after `JSON.parse`), checks its shape and rebuilds its Maps.
 * Throws Error for an unknown type, a missing `requestId` or `inputKey`, or malformed layout data.
 */
export function graphLayoutMessageFromJson(value: unknown): GraphLayoutWorkerMessage {
  const message = value as Record<string, unknown> | null
  if (typeof message !== 'object' || message === null) invalid('message must be an object')
  switch (message.type) {
    case 'request': {
      const request = message.request as Record<string, unknown> | null
      checkRequest(request)
      const { positions, sizes, fixedIds, addedIds, ...rest } = request as unknown as GraphLayoutRequestJson
      const positionEntries = positions === undefined ? undefined : entries(positions, 'positions')
      const sizeEntries = sizes === undefined ? undefined : entries(sizes, 'sizes')
      for (const [id, point] of positionEntries ?? []) pointLike(point, 'position ' + id)
      for (const [id, size] of sizeEntries ?? []) {
        if (!finite((size as GraphNodeSize | null)?.width, (size as GraphNodeSize | null)?.height)) invalid('size ' + id)
      }
      for (const [name, list] of [['fixedIds', fixedIds], ['addedIds', addedIds]] as const) {
        if (list !== undefined && (!Array.isArray(list) || !list.every(id => typeof id === 'string'))) invalid(name + ' must be an array of IDs')
      }
      return {
        type: 'request',
        request: {
          ...rest, ...positionEntries && { positions: new Map(positionEntries as [string, GraphPoint][]) },
          ...sizeEntries && { sizes: new Map(sizeEntries as [string, GraphNodeSize][]) },
          ...fixedIds && { fixedIds: new Set(fixedIds) }, ...addedIds && { addedIds: new Set(addedIds) },
        },
      }
    }
    case 'cancel':
      checkHeader(message, false)
      return message as unknown as GraphLayoutCancelMessage
    case 'success':
      checkHeader(message, true)
      return { ...message as unknown as GraphLayoutSuccessMessage, layout: graphLayoutFromJson(message.layout) }
    case 'failure':
      checkHeader(message, true)
      if (typeof message.message !== 'string') invalid('failure needs a message string')
      return message as unknown as GraphLayoutFailureMessage
    default:
      return invalid('unknown type ' + String(message.type))
  }
}

/**
 * Checks a layout Worker message received by structured clone (as `postMessage` delivers it, with Maps) and returns it.
 * Throws Error for an unknown type, a missing `requestId` or `inputKey`, entry arrays where Maps are expected, or
 * malformed layout data.
 */
export function parseGraphLayoutMessage(value: unknown): GraphLayoutWorkerMessage {
  const message = value as Record<string, unknown> | null
  if (typeof message !== 'object' || message === null) invalid('message must be an object')
  switch (message.type) {
    case 'request': {
      const request = message.request as Record<string, unknown> | null
      checkRequest(request)
      for (const name of ['positions', 'sizes'] as const) {
        if (request![name] !== undefined && !isMap(request![name])) invalid(name + ' must be a Map')
      }
      for (const name of ['fixedIds', 'addedIds'] as const) {
        if (request![name] !== undefined && !(request![name] instanceof Set)) invalid(name + ' must be a Set')
      }
      return message as unknown as GraphLayoutRequestMessage
    }
    case 'cancel':
      checkHeader(message, false)
      return message as unknown as GraphLayoutCancelMessage
    case 'success': {
      checkHeader(message, true)
      const layout = message.layout as Partial<GraphLayout> | null
      if (typeof layout !== 'object' || layout === null || !isMap(layout.boxes) || !isMap(layout.paths) || !isMap(layout.edgeLabels)
        || (layout.routes !== undefined && !isMap(layout.routes))) invalid('layout must have Map boxes, paths and edgeLabels')
      checkLayoutMaps(layout.boxes, layout.paths, layout.edgeLabels, layout.routes, layout.width, layout.height)
      return message as unknown as GraphLayoutSuccessMessage
    }
    case 'failure':
      checkHeader(message, true)
      if (typeof message.message !== 'string') invalid('failure needs a message string')
      return message as unknown as GraphLayoutFailureMessage
    default:
      return invalid('unknown type ' + String(message.type))
  }
}
