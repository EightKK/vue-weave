// GraphML: `toGraphMl` writes a NetworkGraph diagram with its own <key> definitions, and `fromGraphMl` reads them back
// along with the graphics of yEd files. Uses the DOM-free XML reader of the interchange formats.
import type { GraphEdge, GraphEdgeMarker, GraphPoint } from './graph.js'
import type { NetworkGroup, NetworkNode } from './types.js'
import { parseXml, type XmlElement } from './interchangeXml.js'
import {
  checkGraphInterchangeInput, createGraphCollector, formatNumber, isChartTone, isGraphEdgeStyle, isGraphMarker,
  readGraphMarker, readGraphShape, readNumber, splitLabel, uniqueName, xmlAttribute, xmlText,
  type GraphCollector, type GraphInterchangeImport, type GraphInterchangeImportOptions, type GraphInterchangeInput,
} from './interchangeGraph.js'

export interface GraphMlOptions {
  /** Write `edgedefault="directed"` (default true) or `undirected`. */
  directed?: boolean
}

// The keys `toGraphMl` writes: [key ID, domain, attr.name, attr.type].
const keys: readonly (readonly [string, 'node' | 'edge', string, string])[] = [
  ['label', 'node', 'label', 'string'],
  ['detail', 'node', 'detail', 'string'],
  ['shape', 'node', 'shape', 'string'],
  ['tone', 'node', 'tone', 'string'],
  ['x', 'node', 'x', 'double'],
  ['y', 'node', 'y', 'double'],
  ['width', 'node', 'width', 'double'],
  ['height', 'node', 'height', 'double'],
  ['edge-label', 'edge', 'label', 'string'],
  ['marker-start', 'edge', 'markerStart', 'string'],
  ['marker-end', 'edge', 'markerEnd', 'string'],
  ['edge-style', 'edge', 'edgeStyle', 'string'],
  ['animated', 'edge', 'animated', 'boolean'],
  ['points', 'edge', 'points', 'string'],
]

const data = (key: string, value: string) => `<data key="${key}">${xmlText(value)}</data>`

/**
 * Write a diagram as GraphML. The document declares `<key>`s for the node `label`, `detail`, `shape`, `tone`, `x`,
 * `y`, `width` and `height` (the top-left corner from `positions` and the size from `sizes`) and the edge `label`,
 * `markerStart`, `markerEnd`, `edgeStyle`, `animated` and `points` (waypoints as `x,y x,y …`), and writes the values a
 * node or edge has. Groups become nodes with a nested `<graph>` (ID `<group>:`) that holds their members and nested
 * groups; a group whose ID is also a node's gets a `-2` suffix, since GraphML node IDs share one namespace. Edges are
 * written in the top-level graph after the nodes. Ports and `data` are not written. Throws the Errors and RangeErrors
 * of NetworkGraph's input checks.
 */
export function toGraphMl(graph: GraphInterchangeInput, options: GraphMlOptions = {}): string {
  const { nodes, edges, groups, childGroups, positions, sizes } = checkGraphInterchangeInput(graph, 'GraphML')
  const directed = options.directed ?? true
  const taken = new Set(nodes.map(node => node.id))
  const groupIds = new Map(groups.map(group => [group.id, uniqueName(group.id, taken)]))
  const nodeXml = (node: NetworkNode, indent: string) => {
    let out = `${indent}<node id="${xmlAttribute(node.id)}">` + data('label', node.label)
    if (node.detail !== undefined) out += data('detail', node.detail)
    if (node.shape !== undefined) out += data('shape', String(node.shape))
    if (node.tone !== undefined) out += data('tone', String(node.tone))
    const point = positions.get(node.id)
    if (point) out += data('x', formatNumber(point.x)) + data('y', formatNumber(point.y))
    const size = sizes.get(node.id)
    if (size) out += data('width', formatNumber(size.width)) + data('height', formatNumber(size.height))
    return out + '</node>'
  }
  const byId = new Map(nodes.map(node => [node.id, node]))
  const lines = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<graphml xmlns="http://graphml.graphdrawing.org/xmlns" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"'
      + ' xsi:schemaLocation="http://graphml.graphdrawing.org/xmlns http://graphml.graphdrawing.org/xmlns/1.0/graphml.xsd">',
    ...keys.map(([id, domain, name, type]) => `  <key id="${id}" for="${domain}" attr.name="${name}" attr.type="${type}"/>`),
    `  <graph id="G" edgedefault="${directed ? 'directed' : 'undirected'}">`,
  ]
  const grouped = new Set<string>()
  for (const group of groups) for (const id of group.nodeIds) grouped.add(id)
  for (const node of nodes) if (!grouped.has(node.id)) lines.push(nodeXml(node, '    '))
  // Groups as nested graphs, written with an explicit stack (open tag, members, children, close tag).
  const stack: { group: NetworkGroup; indent: string; close: boolean }[] = []
  const roots = groups.filter(group => group.parentId === undefined)
  for (let i = roots.length - 1; i >= 0; i--) stack.push({ group: roots[i]!, indent: '    ', close: false })
  while (stack.length) {
    const { group, indent, close } = stack.pop()!
    if (close) {
      lines.push(`${indent}  </graph>`, `${indent}</node>`)
      continue
    }
    const id = groupIds.get(group.id)!
    lines.push(`${indent}<node id="${xmlAttribute(id)}">${data('label', group.label)}`,
      `${indent}  <graph id="${xmlAttribute(id + ':')}" edgedefault="${directed ? 'directed' : 'undirected'}">`)
    for (const member of group.nodeIds) lines.push(nodeXml(byId.get(member)!, indent + '    '))
    stack.push({ group, indent, close: true })
    const children = childGroups.get(group.id) ?? []
    for (let i = children.length - 1; i >= 0; i--) stack.push({ group: children[i]!, indent: indent + '    ', close: false })
  }
  for (const edge of edges) {
    let out = `    <edge id="${xmlAttribute(edge.id)}" source="${xmlAttribute(edge.from)}" target="${xmlAttribute(edge.to)}">`
    if (edge.label !== undefined) out += data('edge-label', edge.label)
    if (edge.markerStart !== undefined) out += data('marker-start', String(edge.markerStart))
    if (edge.markerEnd !== undefined) out += data('marker-end', String(edge.markerEnd))
    if (edge.edgeStyle !== undefined) out += data('edge-style', String(edge.edgeStyle))
    if (edge.animated !== undefined) out += data('animated', edge.animated ? 'true' : 'false')
    if (edge.points?.length) out += data('points', edge.points.map(point => formatNumber(point.x) + ',' + formatNumber(point.y)).join(' '))
    lines.push(out + '</edge>')
  }
  lines.push('  </graph>', '</graphml>')
  return lines.join('\n') + '\n'
}

// ---------------------------------------------------------------------------------------------------------------------
// Reading

interface KeyDefinition {
  name: string
  domain: string
  yfiles?: string
  fallback?: string
}

/** Every element below `root` in document order, without recursion. */
function* descendants(root: XmlElement): Generator<XmlElement> {
  const stack = [...root.children].reverse()
  while (stack.length) {
    const element = stack.pop()!
    yield element
    for (let i = element.children.length - 1; i >= 0; i--) stack.push(element.children[i]!)
  }
}

/** The data values of an element by `attr.name` (and the yEd graphics), with key defaults filled in. */
function readData(element: XmlElement, domain: 'node' | 'edge', definitions: Map<string, KeyDefinition>) {
  const values = new Map<string, string>()
  let graphics: XmlElement | undefined
  for (const child of element.children) {
    if (child.name !== 'data') continue
    const definition = definitions.get(child.attributes.get('key') ?? '')
    if (!definition || (definition.domain !== domain && definition.domain !== 'all')) continue
    if (definition.yfiles === domain + 'graphics') graphics = child
    else if (!values.has(definition.name)) values.set(definition.name, child.text)
  }
  for (const definition of definitions.values()) {
    if (definition.fallback === undefined || (definition.domain !== domain && definition.domain !== 'all')) continue
    if (!values.has(definition.name)) values.set(definition.name, definition.fallback)
  }
  return { values, graphics }
}

/** Label, geometry and shape of a yEd node (`y:ShapeNode`, `y:GenericNode`, `y:GroupNode`, …). */
function readYedNode(graphics: XmlElement) {
  let label: string | undefined, geometry: XmlElement | undefined, shape: string | undefined
  for (const element of descendants(graphics)) {
    if (element.name === 'Geometry' && !geometry) geometry = element
    else if (element.name === 'NodeLabel' && label === undefined && element.text.trim() !== '') label = element.text.trim()
    else if (element.name === 'Shape' && shape === undefined) shape = element.attributes.get('type')
    else if (element.name === 'GenericNode' && shape === undefined) {
      const configuration = element.attributes.get('configuration')
      if (configuration) shape = configuration.slice(configuration.lastIndexOf('.') + 1)
    }
  }
  return { label, geometry, shape }
}

function readPoints(text: string) {
  const points: GraphPoint[] = []
  for (const pair of text.trim().split(/\s+/)) {
    if (pair === '') continue
    const [x, y, extra] = pair.split(',')
    const px = readNumber(x), py = readNumber(y)
    if (px === undefined || py === undefined || extra !== undefined) return undefined
    points.push({ x: px, y: py })
  }
  return points
}

function readNode(collector: GraphCollector, element: XmlElement, id: string, definitions: Map<string, KeyDefinition>) {
  const { warn } = collector
  const { values, graphics } = readData(element, 'node', definitions)
  const yed = graphics ? readYedNode(graphics) : undefined
  const text = values.get('label') ?? values.get('name')
  let label = text ?? id, detail = values.get('detail')
  if (text === undefined && yed?.label !== undefined) ({ label, detail } = splitLabel(yed.label))
  const node: NetworkNode = { id, label, ...(detail === undefined ? {} : { detail }) }
  // An own `shape` key keeps `box`; other rectangles leave the shape unset, as the other readers do.
  const own = values.get('shape')?.trim()
  const shapeName = own || yed?.shape
  if (shapeName) {
    const shape = readGraphShape(shapeName, warn, id)
    if (shape !== 'box' || own) node.shape = shape
  }
  const tone = values.get('tone')?.trim()
  if (tone !== undefined && tone !== '') {
    if (isChartTone(tone)) node.tone = tone
    else warn('invalid-value', `Node ${id} has an unknown tone ${tone}, which was left out`, id)
  }
  if (!collector.addNode(node)) return false
  const geometry = yed?.geometry?.attributes
  const field = (name: 'x' | 'y' | 'width' | 'height') => values.get(name) ?? geometry?.get(name)
  const [x, y, width, height] = (['x', 'y', 'width', 'height'] as const).map(field)
  if (x !== undefined || y !== undefined) {
    const px = readNumber(x), py = readNumber(y)
    if (px === undefined || py === undefined) warn('invalid-value', `Node ${id} has an unreadable position, which was left out`, id)
    else collector.positions.set(id, { x: px, y: py })
  }
  if (width !== undefined || height !== undefined) {
    const w = readNumber(width), h = readNumber(height)
    if (w === undefined || h === undefined || w <= 0 || h <= 0) warn('invalid-value', `Node ${id} has an unreadable size, which was left out`, id)
    else collector.sizes.set(id, { width: w, height: h })
  }
  return true
}

function readEdge(collector: GraphCollector, element: XmlElement, directed: boolean, definitions: Map<string, KeyDefinition>) {
  const { warn } = collector
  const attributes = element.attributes
  const id = attributes.get('id')
  const { values, graphics } = readData(element, 'edge', definitions)
  const edge: Omit<GraphEdge, 'id'> & { id?: string } = {
    ...(id === undefined || id === '' ? {} : { id }),
    from: attributes.get('source') ?? '',
    to: attributes.get('target') ?? '',
  }
  if (attributes.has('sourceport') || attributes.has('targetport')) {
    warn('unsupported-element', `The ports of edge ${id ?? edge.from + ' → ' + edge.to} were ignored`, id)
  }
  const directedText = attributes.get('directed')
  const isDirected = directedText === undefined ? directed : directedText === 'true' || directedText === '1'
  let label = values.get('label'), start: GraphEdgeMarker | undefined, end: GraphEdgeMarker | undefined
  let points: GraphPoint[] | undefined
  if (graphics) {
    for (const item of descendants(graphics)) {
      if (item.name === 'EdgeLabel' && label === undefined && item.text.trim() !== '') label = item.text.trim()
      else if (item.name === 'Arrows') {
        const source = item.attributes.get('source'), target = item.attributes.get('target')
        if (source !== undefined) start = readGraphMarker(source, warn, id)
        if (target !== undefined) end = readGraphMarker(target, warn, id)
      } else if (item.name === 'Point' && graphics) {
        const x = readNumber(item.attributes.get('x')), y = readNumber(item.attributes.get('y'))
        if (x === undefined || y === undefined) warn('invalid-value', `Edge ${id ?? ''} has an unreadable waypoint, which was left out`, id)
        else (points ??= []).push({ x, y })
      }
    }
  }
  for (const [name, set] of [['markerStart', (m: GraphEdgeMarker) => { start = m }], ['markerEnd', (m: GraphEdgeMarker) => { end = m }]] as const) {
    const value = values.get(name)?.trim()
    if (value === undefined || value === '') continue
    if (isGraphMarker(value)) set(value)
    else set(readGraphMarker(value, warn, id))
  }
  if (end === undefined && !isDirected) end = 'none'
  if (label !== undefined) edge.label = label
  if (start !== undefined && start !== 'none') edge.markerStart = start
  if (end !== undefined && end !== 'arrow') edge.markerEnd = end
  const style = values.get('edgeStyle')?.trim()
  if (style !== undefined && style !== '') {
    if (isGraphEdgeStyle(style)) edge.edgeStyle = style
    else warn('invalid-value', `Edge ${id ?? ''} has an unknown edge style ${style}, which was left out`, id)
  }
  const animated = values.get('animated')?.trim()
  if (animated === 'true' || animated === '1') edge.animated = true
  else if (animated === 'false' || animated === '0') edge.animated = false
  const pointText = values.get('points')
  if (pointText !== undefined) {
    const read = readPoints(pointText)
    if (read === undefined) warn('invalid-value', `Edge ${id ?? ''} has unreadable waypoints, which were left out`, id)
    else points = read
  }
  if (points?.length) edge.points = points
  collector.addEdge(edge)
}

/**
 * Read a GraphML document into NetworkGraph nodes, edges, groups, positions and sizes. Uses the DOM-free XML reader of
 * `fromMsProjectXml`: declared entities are never expanded and nothing outside the text is loaded. Values come from
 * `<data>` whose `<key>` has the `attr.name` `label` (else `name`), `detail`, `shape`, `tone`, `x`, `y`, `width` and
 * `height` for nodes and `label`, `markerStart`, `markerEnd`, `edgeStyle`, `animated` and `points` for edges, as
 * `toGraphMl` writes them; `<default>` values apply. Other keys are ignored. yEd files are read as well: the first
 * `y:NodeLabel` (its first line as label, the rest as detail), `y:Geometry`, `y:Shape` type or `y:GenericNode`
 * configuration, and the `y:EdgeLabel`, `y:Arrows` and `y:Path` points of edges. A node with a nested `<graph>` is a
 * group with the nodes in it as members (nested graphs nest groups). Edges get the IDs `e1`, `e2`, … when they have
 * none; in an undirected graph (`edgedefault="undirected"` or `directed="false"`) an edge without a marker has
 * `markerEnd: 'none'`. Further top-level graphs, hyperedges and ports are reported as `unsupported-element`; see
 * `GraphInterchangeWarningCode` for the rest.
 *
 * Throws an Error for malformed XML (with the line and column), for a root element other than `graphml` and for a
 * document without a graph, and a RangeError past `maxItems`.
 */
export function fromGraphMl(xml: string, options: GraphInterchangeImportOptions = {}): GraphInterchangeImport {
  if (typeof xml !== 'string') throw new Error('GraphML must be a string')
  const collector = createGraphCollector('GraphML', options)
  const { warn } = collector
  const root = parseXml(xml)
  if (root.name !== 'graphml') throw new Error('Not a GraphML document: the root element is ' + root.name)
  const definitions = new Map<string, KeyDefinition>()
  for (const key of root.children) {
    if (key.name !== 'key') continue
    const id = key.attributes.get('id')
    if (id === undefined) continue
    const fallback = key.children.find(child => child.name === 'default')?.text
    definitions.set(id, {
      name: key.attributes.get('name') ?? key.attributes.get('attr.name') ?? '',
      domain: key.attributes.get('for') ?? 'all',
      ...(key.attributes.has('yfiles.type') ? { yfiles: key.attributes.get('yfiles.type')! } : {}),
      ...(fallback === undefined ? {} : { fallback }),
    })
  }
  const graphs = root.children.filter(child => child.name === 'graph')
  if (!graphs.length) throw new Error('The GraphML document has no graph')
  if (graphs.length > 1) warn('unsupported-element', `Only the first of ${graphs.length} graphs was read`)
  // Pre-order walk over nested graphs with an explicit stack of child cursors.
  const edges: { element: XmlElement; directed: boolean }[] = []
  const stack: { children: XmlElement[]; index: number; group?: string; directed: boolean }[] = [
    { children: graphs[0]!.children, index: 0, directed: graphs[0]!.attributes.get('edgedefault') !== 'undirected' },
  ]
  while (stack.length) {
    const frame = stack.at(-1)!
    if (frame.index >= frame.children.length) {
      stack.pop()
      continue
    }
    const element = frame.children[frame.index++]!
    if (element.name === 'edge') edges.push({ element, directed: frame.directed })
    else if (element.name === 'hyperedge') warn('unsupported-element', 'A hyperedge was left out')
    else if (element.name === 'node') {
      const id = element.attributes.get('id') ?? ''
      if (element.children.some(child => child.name === 'port')) warn('unsupported-element', `The ports of node ${id} were ignored`, id)
      const nested = element.children.filter(child => child.name === 'graph')
      if (nested.length) {
        const { values, graphics } = readData(element, 'node', definitions)
        const label = values.get('label') ?? values.get('name') ?? (graphics ? readYedNode(graphics).label : undefined) ?? ''
        const group: NetworkGroup = { id, label, nodeIds: [], ...(frame.group === undefined ? {} : { parentId: frame.group }) }
        if (!collector.addGroup(group)) continue
        for (let i = nested.length - 1; i >= 0; i--) {
          stack.push({ children: nested[i]!.children, index: 0, group: id, directed: nested[i]!.attributes.get('edgedefault') === undefined
            ? frame.directed : nested[i]!.attributes.get('edgedefault') !== 'undirected' })
        }
      } else if (readNode(collector, element, id, definitions) && frame.group !== undefined) {
        collector.addMember(frame.group, id)
      }
    }
  }
  for (const { element, directed } of edges) readEdge(collector, element, directed, definitions)
  return collector.finish()
}
