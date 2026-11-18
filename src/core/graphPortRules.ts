import { indexGraph } from './graph.js'
import type { GraphConnection, GraphEdge, GraphPort, IdentifiedNode } from './graph.js'

/** Which way connections may use an endpoint: `in` only as a target, `out` only as a source, `both` either way. */
export type GraphPortDirection = 'in' | 'out' | 'both'

/** What one connection endpoint (a named port, or a node without ports) accepts. Every field is optional. */
export interface GraphPortRule {
  /**
   * The type tag of the endpoint, or a list of accepted tags. Two endpoints are compatible when either has no type or
   * they share at least one tag.
   */
  type?: string | readonly string[]
  /**
   * Which way connections may use the endpoint. It applies together with `GraphPort.direction`: a port with
   * `direction: 'target'` stays a target only, whatever its rule says. Default `both`.
   */
  direction?: GraphPortDirection
  /** The most edges that may use the endpoint, counting each edge end. A non-negative integer; omit for no limit. */
  maxConnections?: number
}

/**
 * Connection rules for a graph, kept apart from the node and port data so existing data and types stay unchanged.
 * A connection end on a named port uses `ports[nodeId][portId]`, a connection end without a port uses `nodes[nodeId]`,
 * and either falls back to `default`. An endpoint without any rule accepts every connection.
 */
export interface GraphPortRules {
  /** Rules of named ports, keyed by node ID and then port ID. */
  ports?: Readonly<Record<string, Readonly<Record<string, GraphPortRule>>>>
  /** Rules of the node itself, for connections without a port (the single handle of a node without ports). */
  nodes?: Readonly<Record<string, GraphPortRule>>
  /** Rule of every endpoint that has no rule of its own. */
  default?: GraphPortRule
}

/** Why a connection breaks the rules. */
export type GraphConnectionRejectionCode = 'unknown-node' | 'unknown-port' | 'direction' | 'type-mismatch' | 'limit-reached'

/** A rejected connection: a machine-readable code, a readable reason, and the endpoint that broke a rule. */
export interface GraphConnectionRejection {
  ok: false
  code: GraphConnectionRejectionCode
  reason: string
  /** The connection end that broke the rule. */
  end: 'from' | 'to'
  node: string
  port?: string
}

/** The result of `checkGraphConnection`. */
export type GraphConnectionCheck = { ok: true } | GraphConnectionRejection

/** One rule an existing edge breaks, reported by `graphConnectionViolations`. */
export interface GraphConnectionViolation {
  edgeId: string
  code: Exclude<GraphConnectionRejectionCode, 'unknown-node' | 'unknown-port'>
  reason: string
  end: 'from' | 'to'
  node: string
  port?: string
}

/** The fixed end of a connection in progress. `end` is the end the candidates would take, `to` by default. */
export interface GraphConnectionOrigin {
  node: string
  port?: string
  end?: 'from' | 'to'
}

/**
 * Valid targets of a connection in progress. A node without ports is a valid target when it is in `nodeIds`; a port is
 * valid when `ports.get(nodeId)` has its ID. `nodeIds` also lists every node with at least one valid port.
 */
export interface GraphConnectionTargets {
  nodeIds: Set<string>
  ports: Map<string, Set<string>>
}

/** Checks built once over a graph and its rules; see `createGraphConnectionChecker`. */
export interface GraphConnectionChecker {
  /** Same as `checkGraphConnection` on the graph the checker was built for. */
  check(connection: GraphConnection, replacingEdgeId?: string): GraphConnectionCheck
  /** Same as `graphConnectionTargets` on the graph the checker was built for. */
  targets(origin: GraphConnectionOrigin, replacingEdgeId?: string): GraphConnectionTargets
}

type Endpoint = {
  key: string
  node: string
  port?: string
  name: string
  canIn: boolean
  canOut: boolean
  types?: readonly string[]
  max?: number
}

const directions = new Set(['in', 'out', 'both'])

function validateRule(rule: unknown, where: string): GraphPortRule {
  if (rule === null || typeof rule !== 'object') throw new Error('Graph port rule must be an object: ' + where)
  const { type, direction, maxConnections } = rule as GraphPortRule
  if (type !== undefined) {
    const list: readonly unknown[] = typeof type === 'string' ? [type] : Array.isArray(type) ? type : [undefined]
    if (list.some(item => typeof item !== 'string' || item === '')) {
      throw new Error('Graph port rule type must be a nonempty string or a list of them: ' + where)
    }
  }
  if (direction !== undefined && !directions.has(direction)) {
    throw new Error(`Graph port rule direction must be in, out or both: ${where} has ${String(direction)}`)
  }
  if (maxConnections !== undefined && (typeof maxConnections !== 'number' || !Number.isInteger(maxConnections) || maxConnections < 0)) {
    throw new RangeError(`Graph port rule maxConnections must be a non-negative integer: ${where} has ${String(maxConnections)}`)
  }
  return rule as GraphPortRule
}

function entries<T>(record: Readonly<Record<string, T>> | undefined, what: string): [string, T][] {
  if (record === undefined) return []
  if (record === null || typeof record !== 'object') throw new Error('Graph port rules ' + what + ' must be an object')
  return Object.entries(record)
}

function endKey(node: string, port: string | undefined) {
  return JSON.stringify([node, port ?? null])
}

function typeText(types: readonly string[]) {
  return types.join(', ')
}

/**
 * Builds the rule index once: validates the graph (as `indexGraph` does) and the rules, and counts the edge ends at every
 * endpoint. `check` and `targets` then answer in constant time per endpoint, so a checker suits `validateConnection` and
 * hints over thousands of nodes. Rules that name an unknown node or port throw an Error, an invalid `type` or
 * `direction` an Error, and a negative, fractional or non-finite `maxConnections` a RangeError. Inputs are not modified.
 */
export function createGraphConnectionChecker(
  nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[], rules: GraphPortRules,
): GraphConnectionChecker {
  const { endpoint, counts, edgeById } = indexPortRules(nodes, edges, rules)
  const excluded = (replacingEdgeId: string | undefined) => {
    if (replacingEdgeId === undefined) return undefined
    const edge = edgeById.get(replacingEdgeId)
    if (!edge) throw new Error('Unknown edge in graph connection check: ' + replacingEdgeId)
    return [endKey(edge.from, edge.fromPort), endKey(edge.to, edge.toPort)] as const
  }
  const usedBy = (skip: readonly string[] | undefined) => (key: string) => {
    let used = counts.get(key) ?? 0
    if (skip) for (const item of skip) if (item === key) used--
    return used
  }
  return {
    check(connection, replacingEdgeId) {
      const used = usedBy(excluded(replacingEdgeId))
      const from = endpoint(connection.from, connection.fromPort, 'from')
      if ('ok' in from) return from
      const to = endpoint(connection.to, connection.toPort, 'to')
      if ('ok' in to) return to
      const broken = evaluate(from, to, used, true)[0]
      return broken ? { ok: false, ...broken } : { ok: true }
    },
    targets(origin, replacingEdgeId) {
      const used = usedBy(excluded(replacingEdgeId))
      const end = origin.end ?? 'to'
      const result: GraphConnectionTargets = { nodeIds: new Set(), ports: new Map() }
      const fixed = endpoint(origin.node, origin.port, end === 'to' ? 'from' : 'to')
      if ('ok' in fixed) return result
      for (const node of nodes) {
        const candidates = node.ports ? node.ports.map(port => port.id) : [undefined]
        for (const portId of candidates) {
          const other = endpoint(node.id, portId, end) as Endpoint
          const [from, to] = end === 'to' ? [fixed, other] : [other, fixed]
          if (evaluate(from, to, used, true).length) continue
          result.nodeIds.add(node.id)
          if (portId === undefined) continue
          let ports = result.ports.get(node.id)
          if (!ports) result.ports.set(node.id, ports = new Set())
          ports.add(portId)
        }
      }
      return result
    },
  }
}

// Validates the graph and the rules and returns an endpoint resolver, the edge-end count per endpoint and the edges by ID.
function indexPortRules(nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[], rules: GraphPortRules) {
  indexGraph(nodes, edges)
  if (rules === null || typeof rules !== 'object') throw new Error('Graph port rules must be an object')
  const nodeById = new Map<string, IdentifiedNode>()
  const portsByNode = new Map<string, Map<string, GraphPort>>()
  for (const node of nodes) {
    nodeById.set(node.id, node)
    if (node.ports) portsByNode.set(node.id, new Map(node.ports.map(port => [port.id, port])))
  }
  const fallback = rules.default === undefined ? undefined : validateRule(rules.default, 'default')
  const portRules = new Map<string, GraphPortRule>()
  for (const [nodeId, byPort] of entries(rules.ports, 'ports')) {
    if (!nodeById.has(nodeId)) throw new Error('Unknown node in graph port rules: ' + nodeId)
    for (const [portId, rule] of entries(byPort, 'ports of ' + nodeId)) {
      if (!portsByNode.get(nodeId)?.has(portId)) throw new Error(`Unknown port in graph port rules: ${nodeId} · ${portId}`)
      portRules.set(endKey(nodeId, portId), validateRule(rule, nodeId + ' · ' + portId))
    }
  }
  const nodeRules = new Map<string, GraphPortRule>()
  for (const [nodeId, rule] of entries(rules.nodes, 'nodes')) {
    if (!nodeById.has(nodeId)) throw new Error('Unknown node in graph port rules: ' + nodeId)
    nodeRules.set(nodeId, validateRule(rule, nodeId))
  }

  const cache = new Map<string, Endpoint>()
  // The endpoint a connection end names, or a rejection when the node or port does not exist.
  const endpoint = (nodeId: string, portId: string | undefined, end: 'from' | 'to'): Endpoint | GraphConnectionRejection => {
    const key = endKey(nodeId, portId)
    const known = cache.get(key)
    if (known) return known
    const node = nodeById.get(nodeId)
    if (!node) return { ok: false, code: 'unknown-node', reason: 'Unknown node: ' + nodeId, end, node: nodeId, ...(portId === undefined ? {} : { port: portId }) }
    const named = (node as { label?: unknown }).label
    const label = typeof named === 'string' ? named : node.id
    let port: GraphPort | undefined
    if (portId !== undefined) {
      port = portsByNode.get(nodeId)?.get(portId)
      if (!port) return { ok: false, code: 'unknown-port', reason: `Unknown port ${portId} on ${label}`, end, node: nodeId, port: portId }
    }
    const rule = (port ? portRules.get(key) : nodeRules.get(nodeId)) ?? fallback
    const types = rule?.type === undefined ? undefined : typeof rule.type === 'string' ? [rule.type] : rule.type
    const info: Endpoint = {
      key, node: nodeId, name: port ? label + ' · ' + (port.label ?? port.id) : label,
      canIn: rule?.direction !== 'out' && port?.direction !== 'source',
      canOut: rule?.direction !== 'in' && port?.direction !== 'target',
    }
    if (portId !== undefined) info.port = portId
    if (types) info.types = types
    if (rule?.maxConnections !== undefined) info.max = rule.maxConnections
    cache.set(key, info)
    return info
  }

  const counts = new Map<string, number>()
  const edgeById = new Map<string, GraphEdge>()
  for (const edge of edges) {
    edgeById.set(edge.id, edge)
    for (const key of [endKey(edge.from, edge.fromPort), endKey(edge.to, edge.toPort)]) counts.set(key, (counts.get(key) ?? 0) + 1)
  }
  return { endpoint, counts, edgeById }
}

type Broken = Omit<GraphConnectionViolation, 'edgeId'>

// Every rule a connection between two known endpoints breaks, in a fixed order: direction, type, then limits.
// `used` returns how many other edge ends already use an endpoint. With `first`, it stops at the first broken rule.
function evaluate(from: Endpoint, to: Endpoint, used: (key: string) => number, first: boolean): Broken[] {
  const broken: Broken[] = []
  const at = (end: 'from' | 'to', point: Endpoint) => ({ end, node: point.node, ...(point.port === undefined ? {} : { port: point.port }) })
  if (!from.canOut) {
    broken.push({ code: 'direction', reason: `${from.name} accepts only incoming connections.`, ...at('from', from) })
    if (first) return broken
  }
  if (!to.canIn) {
    broken.push({ code: 'direction', reason: `${to.name} allows only outgoing connections.`, ...at('to', to) })
    if (first) return broken
  }
  if (from.types && to.types && !from.types.some(type => to.types!.includes(type))) {
    broken.push({
      code: 'type-mismatch', reason: `${to.name} accepts ${typeText(to.types)}, not ${typeText(from.types)} from ${from.name}.`, ...at('to', to),
    })
    if (first) return broken
  }
  const same = from.key === to.key
  for (const [end, point] of [['from', from], ['to', to]] as const) {
    if (point.max === undefined || (same && end === 'to')) continue
    if (used(point.key) + (same ? 2 : 1) > point.max) {
      const limit = point.max === 1 ? '1 connection' : point.max + ' connections'
      broken.push({ code: 'limit-reached', reason: `${point.name} already has its maximum of ${limit}.`, ...at(end, point) })
      if (first) return broken
    }
  }
  return broken
}

/**
 * Checks one proposed connection against the rules and the current edges. Returns `{ ok: true }`, or a rejection with
 * a code (`unknown-node`, `unknown-port`, `direction`, `type-mismatch` or `limit-reached`), a readable reason and the
 * endpoint that broke the rule; the checks run in that order and the first broken rule is reported. With
 * `replacingEdgeId` (a reconnection), that edge is left out of the connection counts, so a port with
 * `maxConnections: 1` can move its own edge. An unknown `replacingEdgeId` throws an Error; see
 * `createGraphConnectionChecker` for the other errors. To check many proposals over the same data, build a checker once.
 */
export function checkGraphConnection(
  nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[], rules: GraphPortRules, connection: GraphConnection, replacingEdgeId?: string,
): GraphConnectionCheck {
  return createGraphConnectionChecker(nodes, edges, rules).check(connection, replacingEdgeId)
}

/**
 * The valid targets of a connection in progress from `origin`, in one pass over the nodes after indexing the edges once:
 * every port, and every node without ports, that `checkGraphConnection` would accept as the other end. A node with
 * ports is a target only through its ports. Self-connections are included when the rules allow them. With
 * `replacingEdgeId` (a reconnection), that edge is left out of the counts. An unknown origin has no targets.
 */
export function graphConnectionTargets(
  nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[], rules: GraphPortRules, origin: GraphConnectionOrigin, replacingEdgeId?: string,
): GraphConnectionTargets {
  return createGraphConnectionChecker(nodes, edges, rules).targets(origin, replacingEdgeId)
}

/**
 * Audits existing edges against the rules and returns every broken rule in edge order: direction and type checks per
 * edge, and for a limit the edges past it, counting edge ends in input order (the first `maxConnections` ends are kept).
 * An edge can appear more than once. Throws like `createGraphConnectionChecker`.
 */
export function graphConnectionViolations(
  nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[], rules: GraphPortRules,
): GraphConnectionViolation[] {
  const { endpoint } = indexPortRules(nodes, edges, rules)
  const seen = new Map<string, number>()
  const violations: GraphConnectionViolation[] = []
  for (const edge of edges) {
    // indexGraph has checked every endpoint, so both resolve.
    const from = endpoint(edge.from, edge.fromPort, 'from') as Endpoint, to = endpoint(edge.to, edge.toPort, 'to') as Endpoint
    for (const broken of evaluate(from, to, key => seen.get(key) ?? 0, false)) violations.push({ edgeId: edge.id, ...broken })
    seen.set(from.key, (seen.get(from.key) ?? 0) + 1)
    seen.set(to.key, (seen.get(to.key) ?? 0) + 1)
  }
  return violations
}

/**
 * A `validateConnection` function for NetworkGraph: the rules run first, and a rejection returns its reason without
 * calling `validate`; otherwise `validate` (when given) decides. Build it again when the nodes, edges or rules change.
 */
export function graphConnectionValidator(
  nodes: readonly IdentifiedNode[], edges: readonly GraphEdge[], rules: GraphPortRules,
  validate?: (connection: GraphConnection, replacingEdgeId?: string) => boolean | string | void,
): (connection: GraphConnection, replacingEdgeId?: string) => boolean | string | void {
  const checker = createGraphConnectionChecker(nodes, edges, rules)
  return (connection, replacingEdgeId) => {
    const result = checker.check(connection, replacingEdgeId)
    if (!result.ok) return result.reason
    return validate ? validate(connection, replacingEdgeId) : true
  }
}
