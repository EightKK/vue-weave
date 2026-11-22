// Shared parts of the graph interchange formats (Mermaid flowcharts, GraphML and draw.io): the public input, result and
// warning types, the table-driven shape and marker mappings, the input checks of the writers and the collector that
// the readers fill. `interchange.ts` re-exports the public types; the helpers are internal.
import type { GraphEdge, GraphEdgeMarker, GraphLayoutDirection, GraphNodeSize, GraphPoint } from './graph.js'
import { indexGraph } from './graph.js'
import type { GraphEdgeStyle } from './graphRouting.js'
import type { ChartTone, NetworkGroup, NetworkNode, NetworkNodeShape } from './types.js'
import { checkGraphGroups, groupCycleError, unknownParentGroupError } from './graphGroupChecks.js'
import { isId } from './ids.js'

/**
 * A NetworkGraph diagram for the graph writers (`toMermaid`, `toGraphMl`, `toDrawio`): the `nodes`, `edges` and
 * `groups` props, plus saved `positions` (top-left corners) and `sizes` where the format can hold them. Every
 * `GraphInterchangeImport` is one, so a read diagram can be written again.
 */
export interface GraphInterchangeInput {
  nodes: readonly NetworkNode[]
  edges: readonly GraphEdge[]
  groups?: readonly NetworkGroup[]
  positions?: ReadonlyMap<string, GraphPoint>
  sizes?: ReadonlyMap<string, GraphNodeSize>
}

/**
 * The kind of a problem a graph reader worked around. `unsupported-statement`: a Mermaid statement that is read but
 * ignored (styling, classes, click handlers, directions inside subgraphs, front matter, accessibility text, invisible
 * links). `unsupported-shape`: a node shape NetworkGraph does not draw, read as a rectangle. `unsupported-style`: an
 * edge decoration NetworkGraph does not draw, read as an arrow. `unsupported-element`: a part of the file without a
 * NetworkGraph counterpart (GraphML hyperedges, ports and further top-level graphs, draw.io cells that are neither a
 * vertex nor an edge), left out. `skipped-node`, `skipped-edge`, `skipped-group`: an item with an invalid or repeated
 * ID, an edge whose end is missing, unknown or a group, and a group without any node; left out. `group-member`: a node
 * placed in a second group, which stays in the first. `invalid-value`: an unreadable coordinate or size, left out.
 * `shifted-positions`: coordinates below 0, so every position and waypoint was moved by the same amount (NetworkGraph
 * positions are nonnegative).
 */
export type GraphInterchangeWarningCode =
  | 'unsupported-statement' | 'unsupported-shape' | 'unsupported-style' | 'unsupported-element'
  | 'skipped-node' | 'skipped-edge' | 'skipped-group' | 'group-member' | 'invalid-value' | 'shifted-positions'

export interface GraphInterchangeWarning {
  code: GraphInterchangeWarningCode
  /** The ID of the node, edge or group the warning is about, when there is one. */
  id?: string
  /** The one-based line of Mermaid text the warning is about. */
  line?: number
  /** An English description for logs; match on `code`. */
  message: string
}

/**
 * The result of `fromMermaid`, `fromGraphMl`, `fromDrawio` and `fromDrawioAsync`: the props of NetworkGraph. It is a
 * `GraphInterchangeInput`, so the writers accept it.
 */
export interface GraphInterchangeImport {
  nodes: NetworkNode[]
  edges: GraphEdge[]
  /** Nested groups, parents before their children. Only groups with at least one node (directly or nested). */
  groups: NetworkGroup[]
  /** Top-left corners of the nodes the file places; empty for Mermaid. Nonnegative (see `shifted-positions`). */
  positions: Map<string, GraphPoint>
  /** Sizes of the nodes the file gives one; empty for Mermaid. */
  sizes: Map<string, GraphNodeSize>
  /** The flow direction of a Mermaid flowchart (`TD` is read as `TB`). Not set by the other readers. */
  direction?: GraphLayoutDirection
  warnings: GraphInterchangeWarning[]
}

export interface GraphInterchangeImportOptions {
  /**
   * The largest number of nodes, edges and groups together that the reader accepts before it throws a RangeError, to
   * bound the work done for an untrusted file. `fromDrawio` and `fromDrawioAsync` also count the label cells of edges.
   * Default 100,000.
   */
  maxItems?: number
}

// ---------------------------------------------------------------------------------------------------------------------
// Shapes and markers. Each table has one row per NetworkGraph value; extend them when `NetworkNodeShape` or
// `GraphEdgeMarker` grows. A shape without a row is written as a rectangle.

export interface GraphShapeFormat {
  /** The opening and closing delimiters of a Mermaid node declaration. */
  mermaid: readonly [string, string]
  /** The draw.io style fragment (ends with `;`). */
  drawio: string
}

export const graphShapeFormats: Readonly<Partial<Record<NetworkNodeShape, GraphShapeFormat>>> = {
  box: { mermaid: ['[', ']'], drawio: 'rounded=0;' },
  rounded: { mermaid: ['(', ')'], drawio: 'rounded=1;' },
  diamond: { mermaid: ['{', '}'], drawio: 'rhombus;' },
  ellipse: { mermaid: ['((', '))'], drawio: 'ellipse;' },
  hexagon: { mermaid: ['{{', '}}'], drawio: 'shape=hexagon;perimeter=hexagonPerimeter2;fixedSize=1;' },
  // Flowchart and BPMN shapes. Mermaid has no plain-syntax ellipse, document or data object: an ellipse is written as a
  // circle, document and data-object as boxes.
  circle: { mermaid: ['((', '))'], drawio: 'ellipse;aspect=fixed;vwShape=circle;' },
  stadium: { mermaid: ['([', '])'], drawio: 'rounded=1;arcSize=50;vwShape=stadium;' },
  parallelogram: { mermaid: ['[/', '/]'], drawio: 'shape=parallelogram;perimeter=parallelogramPerimeter;fixedSize=1;' },
  document: { mermaid: ['[', ']'], drawio: 'shape=document;boundedLbl=1;' },
  cylinder: { mermaid: ['[(', ')]'], drawio: 'shape=cylinder3;boundedLbl=1;' },
  'data-object': { mermaid: ['[', ']'], drawio: 'shape=note;size=12;' },
}

/** The format of a node's shape; unknown and missing shapes are rectangles (`box`). */
export function graphShapeFormat(shape: unknown): GraphShapeFormat {
  return (typeof shape === 'string' && Object.hasOwn(graphShapeFormats, shape)
    ? graphShapeFormats[shape as NetworkNodeShape] : undefined) ?? graphShapeFormats.box!
}

/**
 * Format-neutral shape names (lower case) that the readers recognise, from Mermaid, GraphML (yEd) and draw.io, and the
 * NetworkGraph shape of each. A name without an entry is read as a rectangle with an `unsupported-shape` warning.
 */
export const graphShapeNames: Readonly<Record<string, NetworkNodeShape>> = {
  box: 'box', rect: 'box', rectangle: 'box', square: 'box', process: 'box', proc: 'box', text: 'box', label: 'box',
  rounded: 'rounded', roundrectangle: 'rounded', 'rounded-rectangle': 'rounded', event: 'rounded',
  diamond: 'diamond', rhombus: 'diamond', diam: 'diamond', decision: 'diamond', question: 'diamond',
  ellipse: 'ellipse', oval: 'ellipse',
  hexagon: 'hexagon', hex: 'hexagon', prepare: 'hexagon',
  circle: 'circle', circ: 'circle', 'sm-circ': 'circle', start: 'circle', stop: 'circle', 'on-page_reference': 'circle',
  stadium: 'stadium', terminal: 'stadium', terminator: 'stadium', pill: 'stadium',
  parallelogram: 'parallelogram', 'parallelogram-alt': 'parallelogram', 'lean-r': 'parallelogram', 'lean-l': 'parallelogram',
  'in-out': 'parallelogram', data: 'parallelogram',
  document: 'document', doc: 'document',
  cylinder: 'cylinder', cylinder3: 'cylinder', cyl: 'cylinder', database: 'cylinder', db: 'cylinder', datastore: 'cylinder',
  stored_data: 'cylinder',
  'data-object': 'data-object', dataobject: 'data-object', note: 'data-object', card: 'data-object',
}

/** Markers by the names the readers recognise (lower case): draw.io arrow names, yEd arrow types and the own names. */
export const graphMarkerNames: Readonly<Record<string, GraphEdgeMarker>> = {
  arrow: 'arrow', classic: 'arrow', block: 'arrow', classicthin: 'arrow', blockthin: 'arrow', standard: 'arrow', delta: 'arrow',
  'open-arrow': 'open-arrow', open: 'open-arrow', openthin: 'open-arrow', plain: 'open-arrow',
  'hollow-arrow': 'hollow-arrow', white_delta: 'hollow-arrow',
  circle: 'circle', oval: 'circle', transparent_circle: 'circle',
  diamond: 'diamond', diamondthin: 'diamond', white_diamond: 'diamond',
  bar: 'bar', dash: 'bar', skewed_dash: 'bar',
  none: 'none',
}

/** How the draw.io writer draws each marker: the arrow name and whether it is filled. */
export const graphDrawioMarkers: Readonly<Record<GraphEdgeMarker, { name: string; fill?: boolean }>> = {
  arrow: { name: 'classic', fill: true },
  'open-arrow': { name: 'open' },
  'hollow-arrow': { name: 'block', fill: false },
  circle: { name: 'oval', fill: false },
  diamond: { name: 'diamond', fill: false },
  bar: { name: 'dash' },
  none: { name: 'none' },
}

const markerValues = new Set<string>(['arrow', 'open-arrow', 'hollow-arrow', 'circle', 'diamond', 'bar', 'none'])
const toneValues = new Set<string>(['teal', 'blue', 'amber', 'violet'])
const edgeStyleValues = new Set<string>(['curve', 'orthogonal', 'straight'])

export function isGraphMarker(value: unknown): value is GraphEdgeMarker {
  return typeof value === 'string' && markerValues.has(value)
}
export function isChartTone(value: unknown): value is ChartTone {
  return typeof value === 'string' && toneValues.has(value)
}
export function isGraphEdgeStyle(value: unknown): value is GraphEdgeStyle {
  return typeof value === 'string' && edgeStyleValues.has(value)
}

// ---------------------------------------------------------------------------------------------------------------------
// Writers

/** A checked writer input: groups ordered parents first, with their depth, children and direct members. */
export interface CheckedGraph {
  nodes: readonly NetworkNode[]
  edges: readonly GraphEdge[]
  /** Groups with every ancestor before them. */
  groups: NetworkGroup[]
  depth: Map<string, number>
  childGroups: Map<string, NetworkGroup[]>
  memberOf: Map<string, string>
  positions: ReadonlyMap<string, GraphPoint>
  sizes: ReadonlyMap<string, GraphNodeSize>
}

/**
 * Check a writer input as NetworkGraph would: node, edge, port and group IDs, edge ends, group members and parents
 * (`indexGraph` and the group checks throw their usual Errors), labels (Error) and positions and sizes (RangeError).
 */
export function checkGraphInterchangeInput(graph: GraphInterchangeInput, format: string): CheckedGraph {
  if (!graph || typeof graph !== 'object') throw new Error(format + ' export needs a graph object')
  const { nodes, edges, groups = [], positions = new Map(), sizes = new Map() } = graph
  if (!Array.isArray(nodes)) throw new Error('nodes must be an array')
  if (!Array.isArray(edges)) throw new Error('edges must be an array')
  if (!Array.isArray(groups)) throw new Error('groups must be an array')
  indexGraph(nodes, edges)
  for (const node of nodes) {
    if (typeof node.label !== 'string') throw new Error('Invalid label of graph node: ' + node.id)
    if (node.detail !== undefined && typeof node.detail !== 'string') throw new Error('Invalid detail of graph node: ' + node.id)
  }
  for (const edge of edges) {
    if (edge.label !== undefined && typeof edge.label !== 'string') throw new Error('Invalid label of graph edge: ' + edge.id)
    for (const point of edge.points ?? []) {
      if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) throw new RangeError('Edge waypoints must be finite: ' + edge.id)
    }
  }
  const nodeIds = new Set(nodes.map(node => node.id))
  const { byId, memberOf } = checkGraphGroups(groups, id => nodeIds.has(id))
  for (const group of groups) {
    if (typeof group.label !== 'string') throw new Error('Invalid label of graph group: ' + group.id)
  }
  // Depths by climbing each parent chain once, as `collapseGraphGroups` checks it.
  const depth = new Map<string, number>()
  const childGroups = new Map<string, NetworkGroup[]>()
  for (const group of groups) {
    const chain: NetworkGroup[] = []
    const onChain = new Set<string>()
    let current: NetworkGroup | undefined = group
    while (current && !depth.has(current.id)) {
      if (onChain.has(current.id)) throw groupCycleError(group.id)
      onChain.add(current.id)
      chain.push(current)
      if (current.parentId === undefined) {
        current = undefined
        break
      }
      const parent = byId.get(current.parentId)
      if (!parent) throw unknownParentGroupError(current)
      current = parent
    }
    let level = current ? depth.get(current.id)! + 1 : 0
    for (let i = chain.length - 1; i >= 0; i--) depth.set(chain[i]!.id, level++)
    if (group.parentId !== undefined) {
      const siblings = childGroups.get(group.parentId)
      if (siblings) siblings.push(group)
      else childGroups.set(group.parentId, [group])
    }
  }
  const ordered = [...groups].sort((a, b) => depth.get(a.id)! - depth.get(b.id)!)
  const isMap = (value: unknown) => typeof (value as Map<string, unknown>)?.get === 'function' && typeof (value as Map<string, unknown>)[Symbol.iterator] === 'function'
  if (!isMap(positions) || !isMap(sizes)) throw new Error('positions and sizes must be Maps')
  for (const [id, point] of positions) {
    if (!Number.isFinite(point?.x) || !Number.isFinite(point?.y)) throw new RangeError('Graph positions must be finite: ' + id)
  }
  for (const [id, size] of sizes) {
    if (!(Number.isFinite(size?.width) && size.width > 0 && Number.isFinite(size?.height) && size.height > 0)) {
      throw new RangeError('Graph node sizes must be finite and positive: ' + id)
    }
  }
  return { nodes, edges, groups: ordered, depth, childGroups, memberOf, positions, sizes }
}

/** `base`, or `base` with the first suffix `-2`, `-3`, … that is not in `taken`. Adds the result to `taken`. */
export function uniqueName(base: string, taken: Set<string>) {
  let name = base
  for (let n = 2; taken.has(name); n++) name = base + '-' + n
  taken.add(name)
  return name
}

/** A number for XML output, exact (the shortest text that reads back as the same number), without `-0`. */
export function formatNumber(value: number) {
  return String(value === 0 ? 0 : value)
}

const decimal = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?$/

/** A finite number from XML text, or undefined. */
export function readNumber(text: string | undefined) {
  if (text === undefined) return undefined
  const trimmed = text.trim()
  if (!decimal.test(trimmed)) return undefined
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : undefined
}

/** Split text into the node label (first line) and detail (the remaining lines, when there are any). */
export function splitLabel(text: string): { label: string; detail?: string } {
  const newline = text.indexOf('\n')
  return newline < 0 ? { label: text } : { label: text.slice(0, newline), detail: text.slice(newline + 1) }
}

// ---------------------------------------------------------------------------------------------------------------------
// Readers

interface CollectedGroup {
  id: string
  label: string
  parentId?: string
  nodeIds: string[]
}

interface CollectedEdge {
  edge: Omit<GraphEdge, 'id'> & { id?: string }
  line?: number
}

export type GraphWarn = (code: GraphInterchangeWarningCode, message: string, id?: string, line?: number) => void

/**
 * The state a reader fills: nodes, groups and edges in file order, with the ID checks, the item limit and the
 * warnings. `finish` resolves the edges, drops empty groups and makes the positions nonnegative.
 */
export function createGraphCollector(format: string, options: GraphInterchangeImportOptions = {}) {
  const maxItems = options.maxItems ?? 100_000
  if (!(Number.isSafeInteger(maxItems) && maxItems > 0)) throw new RangeError('maxItems must be a positive integer')
  const nodes = new Map<string, NetworkNode>()
  const groups = new Map<string, CollectedGroup>()
  const memberOf = new Map<string, string>()
  const edges: CollectedEdge[] = []
  const positions = new Map<string, GraphPoint>()
  const sizes = new Map<string, GraphNodeSize>()
  const warnings: GraphInterchangeWarning[] = []
  let items = 0
  /** Count one item against `maxItems`: a node, edge or group, or another item a reader builds (draw.io edge labels). */
  const count = () => {
    if (++items > maxItems) throw new RangeError(`The ${format} file has more than ${maxItems} nodes, edges and groups (maxItems)`)
  }
  const warn: GraphWarn = (code, message, id, line) => {
    warnings.push({ code, ...(id === undefined ? {} : { id }), ...(line === undefined ? {} : { line }), message })
  }
  /** Add a node and return whether it was added; an invalid or repeated ID is skipped with a warning. */
  const addNode = (node: NetworkNode, line?: number) => {
    if (!isId(node.id)) {
      warn('skipped-node', 'A node without an ID was left out', undefined, line)
      return false
    }
    if (nodes.has(node.id) || groups.has(node.id)) {
      warn('skipped-node', `The ID ${node.id} is used before; the node was left out`, node.id, line)
      return false
    }
    count()
    nodes.set(node.id, node)
    return true
  }
  const addGroup = (group: { id: string; label: string; parentId?: string }, line?: number) => {
    if (!isId(group.id)) {
      warn('skipped-group', 'A group without an ID was left out', undefined, line)
      return false
    }
    if (groups.has(group.id) || nodes.has(group.id)) {
      warn('skipped-group', `The ID ${group.id} is used before; the group was left out`, group.id, line)
      return false
    }
    count()
    groups.set(group.id, { id: group.id, label: group.label, ...(group.parentId === undefined ? {} : { parentId: group.parentId }), nodeIds: [] })
    return true
  }
  /** Put a node in a group; a node already in a group stays there with a `group-member` warning. */
  const addMember = (groupId: string, nodeId: string, line?: number) => {
    const current = memberOf.get(nodeId)
    if (current === groupId) return
    if (current !== undefined) {
      warn('group-member', `Node ${nodeId} is in group ${current} and stays there, not in ${groupId}`, nodeId, line)
      return
    }
    memberOf.set(nodeId, groupId)
    groups.get(groupId)!.nodeIds.push(nodeId)
  }
  const addEdge = (edge: Omit<GraphEdge, 'id'> & { id?: string }, line?: number) => {
    count()
    edges.push({ edge, ...(line === undefined ? {} : { line }) })
  }
  const finish = (direction?: GraphLayoutDirection): GraphInterchangeImport => {
    // Edges: explicit IDs first, so a generated `e<n>` never takes an ID the file uses later.
    const taken = new Set<string>()
    const kept: CollectedEdge[] = []
    for (const item of edges) {
      const { edge, line } = item
      const name = isId(edge.id) ? edge.id : `${edge.from} → ${edge.to}`
      const bad = [edge.from, edge.to].find(end => !nodes.has(end))
      if (bad !== undefined) {
        const why = groups.has(bad) ? `ends at group ${bad}, which NetworkGraph edges cannot` : `ends at ${bad || 'nothing'}, which is not an imported node`
        warn('skipped-edge', `Edge ${name} ${why}; it was left out`, isId(edge.id) ? edge.id : undefined, line)
        continue
      }
      if (isId(edge.id)) {
        if (taken.has(edge.id)) {
          warn('skipped-edge', `The edge ID ${edge.id} is used before; the edge was left out`, edge.id, line)
          continue
        }
        taken.add(edge.id)
      }
      kept.push(item)
    }
    let next = 1
    const outEdges: GraphEdge[] = kept.map(({ edge }) => {
      if (isId(edge.id)) return edge as GraphEdge
      let id: string
      do id = 'e' + next++
      while (taken.has(id))
      taken.add(id)
      return { ...edge, id }
    })
    // Groups: keep those with a node, directly or in a nested group. Parents come before children in file order.
    const filled = new Set<string>()
    for (const group of groups.values()) {
      if (!group.nodeIds.length) continue
      for (let current: CollectedGroup | undefined = group; current && !filled.has(current.id);) {
        filled.add(current.id)
        current = current.parentId === undefined ? undefined : groups.get(current.parentId)
      }
    }
    const outGroups: NetworkGroup[] = []
    for (const group of groups.values()) {
      if (!filled.has(group.id)) {
        warn('skipped-group', `Group ${group.id} has no nodes and was left out`, group.id)
        continue
      }
      outGroups.push(group)
    }
    // Positions: NetworkGraph needs nonnegative coordinates, so move everything by the same amount when needed.
    let minX = 0, minY = 0
    for (const point of positions.values()) {
      minX = Math.min(minX, point.x)
      minY = Math.min(minY, point.y)
    }
    for (const edge of outEdges) {
      for (const point of edge.points ?? []) {
        minX = Math.min(minX, point.x)
        minY = Math.min(minY, point.y)
      }
    }
    let outPositions = positions
    if (minX < 0 || minY < 0) {
      const dx = -minX, dy = -minY
      warn('shifted-positions', `Coordinates below 0 were moved by (${formatNumber(dx)}, ${formatNumber(dy)})`)
      outPositions = new Map([...positions].map(([id, point]) => [id, { x: point.x + dx, y: point.y + dy }]))
      for (let i = 0; i < outEdges.length; i++) {
        const edge = outEdges[i]!
        if (edge.points) outEdges[i] = { ...edge, points: edge.points.map(point => ({ x: point.x + dx, y: point.y + dy })) }
      }
    }
    return {
      nodes: [...nodes.values()],
      edges: outEdges,
      groups: outGroups,
      positions: outPositions,
      sizes,
      ...(direction === undefined ? {} : { direction }),
      warnings,
    }
  }
  return { nodes, groups, memberOf, positions, sizes, warn, count, addNode, addGroup, addMember, addEdge, finish }
}

export type GraphCollector = ReturnType<typeof createGraphCollector>

/** The NetworkGraph shape of a format-neutral name (see `graphShapeNames`), or `box` with an `unsupported-shape` warning. */
export function readGraphShape(name: string, warn: GraphWarn, id: string | undefined, line?: number): NetworkNodeShape {
  const key = name.toLowerCase()
  if (Object.hasOwn(graphShapeNames, key)) return graphShapeNames[key]!
  warn('unsupported-shape', `The shape ${name} is drawn as a rectangle`, id, line)
  return 'box'
}

/** The marker of a reader name (see `graphMarkerNames`), or `arrow` with an `unsupported-style` warning. */
export function readGraphMarker(name: string, warn: GraphWarn, id: string | undefined): GraphEdgeMarker {
  const key = name.toLowerCase()
  if (Object.hasOwn(graphMarkerNames, key)) return graphMarkerNames[key]!
  warn('unsupported-style', `The edge end ${name} is drawn as an arrow`, id)
  return 'arrow'
}
