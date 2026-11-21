// draw.io (diagrams.net): `toDrawio` writes an uncompressed `mxfile`, `fromDrawio` reads uncompressed pages and
// `fromDrawioAsync` also inflates compressed ones. Uses the DOM-free XML reader of the interchange formats.
import type { GraphEdge, GraphEdgeMarker, GraphLayoutDirection, GraphNodeSize, GraphPoint } from './graph.js'
import { layoutLayeredGraph } from './graph.js'
import type { GraphEdgeStyle } from './graphRouting.js'
import type { ChartTone, NetworkNode } from './types.js'
import { defaultNodeHeight, defaultNodeWidth } from './graphOptions.js'
import { parseXml, type XmlElement } from './interchangeXml.js'
import {
  checkGraphInterchangeInput, createGraphCollector, formatNumber, graphDrawioMarkers, graphShapeFormat, isChartTone,
  readGraphMarker, readGraphShape, readNumber, splitLabel, uniqueName, xmlAttribute,
  type GraphCollector, type GraphInterchangeImport, type GraphInterchangeImportOptions, type GraphInterchangeInput,
} from './interchangeGraph.js'

export interface DrawioOptions {
  /** The name of the page. Default `Page-1`. */
  pageName?: string
  /** The direction of the `layoutLayeredGraph` layout that places nodes without a position. Default `LR`. */
  direction?: GraphLayoutDirection
}

export interface DrawioImportOptions extends GraphInterchangeImportOptions {
  /** The page to read: its zero-based index or its name. Default the first page. */
  page?: number | string
}

export interface DrawioAsyncImportOptions extends DrawioImportOptions {
  /**
   * The largest inflated page, in characters of its URI-encoded text, that `fromDrawioAsync` accepts before it throws a
   * RangeError, so a small compressed file cannot expand without bound. Default 20,000,000.
   */
  maxInflatedLength?: number
}

// Fill and stroke colours of the tones: the draw.io standard palette entries closest to them.
const toneColors: Readonly<Record<ChartTone, { fill: string; stroke: string }>> = {
  teal: { fill: '#d5e8d4', stroke: '#82b366' },
  blue: { fill: '#dae8fc', stroke: '#6c8ebf' },
  amber: { fill: '#ffe6cc', stroke: '#d79b00' },
  violet: { fill: '#e1d5e7', stroke: '#9673a6' },
}
const edgeStyles: Readonly<Record<GraphEdgeStyle, string>> = {
  orthogonal: 'edgeStyle=orthogonalEdgeStyle;', curve: 'curved=1;', straight: 'edgeStyle=none;',
}
const groupPadding = 20
const groupHeader = 30

interface Rect { x: number; y: number; width: number; height: number }

function markerStyle(end: 'start' | 'end', marker: GraphEdgeMarker) {
  const { name, fill } = graphDrawioMarkers[marker] ?? graphDrawioMarkers.arrow
  return `${end}Arrow=${name};` + (fill === undefined ? '' : `${end}Fill=${fill ? 1 : 0};`)
}

/**
 * Write a diagram as an uncompressed draw.io file (`mxfile` with one `diagram` page holding an `mxGraphModel`). Nodes
 * become vertex cells with the node ID, the label (and a line break and the detail) as value, a style for the shape
 * (`rounded=0`, `rounded=1`, `rhombus`, `ellipse`, `shape=hexagon`; other shapes as rectangles) and the tone (fill
 * and stroke colours plus `vwTone`), and the geometry from `positions` and `sizes` (default 144 by 58). Nodes without
 * a position are placed with `layoutLayeredGraph` in `options.direction`. Groups become container cells
 * (`container=1`) framing their members and nested groups, whose geometry is relative to the container as draw.io
 * expects. Edges become edge cells in the layer with `endArrow`/`startArrow` for the markers, the edge style,
 * `flowAnimation=1` for animated edges and the waypoints. Cell IDs are the item IDs; an ID used twice (for example a
 * node and an edge) gets a suffix, and the root and layer cells take `0` and `1` unless a node uses them. Throws the
 * Errors and RangeErrors of NetworkGraph's input checks.
 */
export function toDrawio(graph: GraphInterchangeInput, options: DrawioOptions = {}): string {
  const { nodes, edges, groups, positions, sizes } = checkGraphInterchangeInput(graph, 'draw.io')
  const pageName = options.pageName ?? 'Page-1'
  if (typeof pageName !== 'string') throw new Error('pageName must be a string')
  const taken = new Set(nodes.map(node => node.id))
  const rootId = uniqueName('0', taken), layerId = uniqueName('1', taken)
  const groupIds = new Map(groups.map(group => [group.id, uniqueName(group.id, taken)]))
  const edgeIds = new Map(edges.map(edge => [edge.id, uniqueName(edge.id, taken)]))
  // Absolute boxes of the nodes: saved positions, else the layered layout.
  const layout = nodes.some(node => !positions.has(node.id)) ? layoutLayeredGraph(nodes, edges, { direction: options.direction ?? 'LR' }) : undefined
  const boxes = new Map<string, Rect>()
  for (const node of nodes) {
    const point = positions.get(node.id) ?? layout!.boxes.get(node.id)!
    const size: GraphNodeSize = sizes.get(node.id) ?? { width: defaultNodeWidth, height: defaultNodeHeight }
    boxes.set(node.id, { x: point.x, y: point.y, width: size.width, height: size.height })
  }
  // Group frames, innermost first: the union of the members and nested frames, padded, with room for the label.
  const frames = new Map<string, Rect>()
  const bounds = new Map<string, { left: number; top: number; right: number; bottom: number }>()
  const extend = (id: string, rect: Rect) => {
    const current = bounds.get(id)
    const next = { left: rect.x, top: rect.y, right: rect.x + rect.width, bottom: rect.y + rect.height }
    bounds.set(id, current ? {
      left: Math.min(current.left, next.left), top: Math.min(current.top, next.top),
      right: Math.max(current.right, next.right), bottom: Math.max(current.bottom, next.bottom),
    } : next)
  }
  for (const group of groups) for (const id of group.nodeIds) extend(group.id, boxes.get(id)!)
  for (let i = groups.length - 1; i >= 0; i--) {
    const group = groups[i]!
    const box = bounds.get(group.id)
    const frame = box ? {
      x: box.left - groupPadding, y: box.top - groupPadding - groupHeader,
      width: box.right - box.left + 2 * groupPadding, height: box.bottom - box.top + 2 * groupPadding + groupHeader,
    } : { x: 0, y: 0, width: defaultNodeWidth, height: defaultNodeHeight }
    frames.set(group.id, frame)
    if (group.parentId !== undefined) extend(group.parentId, frame)
  }
  const ownerOf = new Map<string, string>()
  for (const group of groups) for (const id of group.nodeIds) ownerOf.set(id, group.id)
  const parentCell = (groupId: string | undefined) => groupId === undefined ? layerId : groupIds.get(groupId)!
  const relative = (rect: Rect, groupId: string | undefined) => {
    const origin = groupId === undefined ? { x: 0, y: 0 } : frames.get(groupId)!
    return `<mxGeometry x="${formatNumber(rect.x - origin.x)}" y="${formatNumber(rect.y - origin.y)}" width="${formatNumber(rect.width)}" height="${formatNumber(rect.height)}" as="geometry"/>`
  }
  const lines = [
    '<mxfile host="vue-weave">',
    `  <diagram id="vw-page-1" name="${xmlAttribute(pageName)}">`,
    '    <mxGraphModel grid="1" gridSize="10" page="0">',
    '      <root>',
    `        <mxCell id="${xmlAttribute(rootId)}"/>`,
    `        <mxCell id="${xmlAttribute(layerId)}" parent="${xmlAttribute(rootId)}"/>`,
  ]
  for (const group of groups) {
    lines.push(`        <mxCell id="${xmlAttribute(groupIds.get(group.id)!)}" value="${xmlAttribute(group.label)}"`
      + ' style="rounded=0;container=1;collapsible=0;dashed=1;fillColor=none;verticalAlign=top;align=left;spacingLeft=8;"'
      + ` vertex="1" parent="${xmlAttribute(parentCell(group.parentId))}">${relative(frames.get(group.id)!, group.parentId)}</mxCell>`)
  }
  for (const node of nodes) {
    let style = graphShapeFormat(node.shape).drawio
    if (isChartTone(node.tone)) style += `fillColor=${toneColors[node.tone].fill};strokeColor=${toneColors[node.tone].stroke};vwTone=${node.tone};`
    const value = node.detail === undefined ? node.label : node.label + '\n' + node.detail
    const owner = ownerOf.get(node.id)
    lines.push(`        <mxCell id="${xmlAttribute(node.id)}" value="${xmlAttribute(value)}" style="${xmlAttribute(style)}"`
      + ` vertex="1" parent="${xmlAttribute(parentCell(owner))}">${relative(boxes.get(node.id)!, owner)}</mxCell>`)
  }
  for (const edge of edges) {
    let style = markerStyle('end', edge.markerEnd ?? 'arrow') + markerStyle('start', edge.markerStart ?? 'none')
    if (edge.edgeStyle !== undefined && Object.hasOwn(edgeStyles, edge.edgeStyle)) style += edgeStyles[edge.edgeStyle]
    if (edge.animated) style += 'flowAnimation=1;'
    if (edge.dashed) style += 'dashed=1;'
    const points = edge.points?.length
      ? '<Array as="points">' + edge.points.map(point => `<mxPoint x="${formatNumber(point.x)}" y="${formatNumber(point.y)}"/>`).join('') + '</Array>'
      : ''
    lines.push(`        <mxCell id="${xmlAttribute(edgeIds.get(edge.id)!)}" value="${xmlAttribute(edge.label ?? '')}" style="${style}" edge="1"`
      + ` parent="${xmlAttribute(layerId)}" source="${xmlAttribute(edge.from)}" target="${xmlAttribute(edge.to)}">`
      + `<mxGeometry relative="1" as="geometry">${points}</mxGeometry></mxCell>`)
  }
  lines.push('      </root>', '    </mxGraphModel>', '  </diagram>', '</mxfile>')
  return lines.join('\n') + '\n'
}

// ---------------------------------------------------------------------------------------------------------------------
// Reading

interface Cell {
  id: string
  value: string
  style: Map<string, string>
  /** The first style entry without `=`, such as `ellipse`, `rhombus` or `text`. */
  styleName?: string
  vertex: boolean
  edge: boolean
  parent?: string
  source?: string
  target?: string
  geometry?: XmlElement
}

function parseStyle(text: string) {
  const style = new Map<string, string>()
  let styleName: string | undefined
  for (const part of text.split(';')) {
    const entry = part.trim()
    if (entry === '') continue
    const equals = entry.indexOf('=')
    if (equals < 0) {
      styleName ??= entry
      style.set(entry, '')
    } else style.set(entry.slice(0, equals), entry.slice(equals + 1))
  }
  return { style, styleName }
}

const htmlEntities: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: '\'', nbsp: ' ' }

/** The text of an HTML label: line breaks from `<br>` and block ends, tags removed, entities decoded. */
function htmlText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(?:div|p|li)>(?!$)/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&(?:#(\d{1,7})|#x([0-9a-f]{1,6})|([a-z]+));/gi, (match, dec: string | undefined, hex: string | undefined, name: string | undefined) => {
      if (name !== undefined) return Object.hasOwn(htmlEntities, name.toLowerCase()) ? htmlEntities[name.toLowerCase()]! : match
      const code = dec !== undefined ? Number(dec) : parseInt(hex!, 16)
      return code <= 0x10ffff && !(code >= 0xd800 && code <= 0xdfff) ? String.fromCodePoint(code) : match
    })
}

function cellText(cell: Cell) {
  return cell.style.get('html') === '1' ? htmlText(cell.value) : cell.value
}

/** The cells of an `mxGraphModel`, including those wrapped in `UserObject` or `object` elements. */
function readCells(model: XmlElement, warn: GraphCollector['warn']) {
  const root = model.children.find(child => child.name === 'root')
  if (!root) throw new Error('The draw.io model has no root element')
  const cells = new Map<string, Cell>()
  for (const element of root.children) {
    let attributes = element.attributes
    let cellElement: XmlElement | undefined = element
    let value = attributes.get('value') ?? ''
    if (element.name === 'UserObject' || element.name === 'object') {
      cellElement = element.children.find(child => child.name === 'mxCell')
      value = attributes.get('label') ?? ''
      attributes = new Map([...(cellElement?.attributes ?? []), ['id', attributes.get('id') ?? '']])
    } else if (element.name !== 'mxCell') {
      warn('unsupported-element', `The element ${element.name} in the draw.io model was ignored`)
      continue
    }
    const id = attributes.get('id') ?? ''
    const vertex = attributes.get('vertex') === '1', edge = attributes.get('edge') === '1'
    if (id === '' || cells.has(id)) {
      if (vertex || edge) warn(vertex ? 'skipped-node' : 'skipped-edge', id === '' ? 'A cell without an ID was left out' : `The cell ID ${id} is used before; the cell was left out`, id || undefined)
      continue
    }
    const { style, styleName } = parseStyle(attributes.get('style') ?? '')
    cells.set(id, {
      id, value, style, ...(styleName === undefined ? {} : { styleName }), vertex, edge,
      ...(attributes.has('parent') ? { parent: attributes.get('parent')! } : {}),
      ...(attributes.has('source') ? { source: attributes.get('source')! } : {}),
      ...(attributes.has('target') ? { target: attributes.get('target')! } : {}),
      ...(cellElement?.children.some(child => child.name === 'mxGeometry')
        ? { geometry: cellElement.children.find(child => child.name === 'mxGeometry')! } : {}),
    })
  }
  return cells
}

// Style names that draw a vertex shape (the first style entry without `=`).
const namedShapeStyles = new Set([
  'ellipse', 'rhombus', 'hexagon', 'triangle', 'swimlane', 'text', 'label', 'image', 'line', 'doubleEllipse', 'cloud', 'actor',
])
const orthogonalStyles = new Set(['orthogonalEdgeStyle', 'elbowEdgeStyle', 'entityRelationEdgeStyle', 'segmentEdgeStyle', 'isometricEdgeStyle'])

function readModel(model: XmlElement, collector: GraphCollector): GraphInterchangeImport {
  const { warn } = collector
  const cells = readCells(model, warn)
  // Vertices with vertex children are groups. Their absolute origin is the sum of the container offsets above them.
  const parentVertex = (cell: Cell) => {
    const parent = cell.parent === undefined ? undefined : cells.get(cell.parent)
    return parent?.vertex ? parent : undefined
  }
  const containers = new Set<string>()
  for (const cell of cells.values()) {
    if (cell.vertex) {
      const parent = parentVertex(cell)
      if (parent) containers.add(parent.id)
    }
  }
  const origin = new Map<string, GraphPoint>()
  const offset = (cell: Cell | undefined): GraphPoint => {
    // The absolute top-left corner of a container, climbing the parent chain with a loop and stopping at a cycle.
    if (!cell) return { x: 0, y: 0 }
    const chain: Cell[] = []
    const seen = new Set<string>()
    let current: Cell | undefined = cell
    while (current && !origin.has(current.id) && !seen.has(current.id)) {
      seen.add(current.id)
      chain.push(current)
      current = parentVertex(current)
    }
    let base = current && origin.has(current.id) ? origin.get(current.id)! : { x: 0, y: 0 }
    for (let i = chain.length - 1; i >= 0; i--) {
      const geometry = chain[i]!.geometry?.attributes
      base = { x: base.x + (readNumber(geometry?.get('x')) ?? 0), y: base.y + (readNumber(geometry?.get('y')) ?? 0) }
      origin.set(chain[i]!.id, base)
    }
    return origin.get(cell.id)!
  }
  // Groups, parents first: by depth in the container chain (a cycle counts as the top level).
  const groupDepth = (cell: Cell) => {
    let level = 0
    const seen = new Set<string>([cell.id])
    for (let parent = parentVertex(cell); parent && !seen.has(parent.id); parent = parentVertex(parent)) {
      seen.add(parent.id)
      level++
    }
    return level
  }
  const groupCells = [...cells.values()].filter(cell => containers.has(cell.id))
    .map((cell, index) => ({ cell, index, level: groupDepth(cell) }))
    .sort((a, b) => a.level - b.level || a.index - b.index)
  for (const { cell } of groupCells) {
    const parent = parentVertex(cell)
    collector.addGroup({ id: cell.id, label: cellText(cell), ...(parent && containers.has(parent.id) ? { parentId: parent.id } : {}) })
  }
  const edgeLabels = new Map<string, string[]>()
  for (const cell of cells.values()) {
    if (!cell.vertex || containers.has(cell.id)) continue
    const parent = cell.parent === undefined ? undefined : cells.get(cell.parent)
    if (parent?.edge) {
      const text = cellText(cell)
      if (text !== '') edgeLabels.set(parent.id, [...edgeLabels.get(parent.id) ?? [], text])
      continue
    }
    const { label, detail } = splitLabel(cellText(cell))
    const node: NetworkNode = { id: cell.id, label, ...(detail === undefined ? {} : { detail }) }
    const shapeStyle = cell.style.get('shape')
    // `shape=mxgraph.flowchart.decision` is read by its last part; a named style (`ellipse`) or `rounded=1` otherwise.
    const shapeName = cell.style.get('vwShape') || (shapeStyle && shapeStyle.slice(shapeStyle.lastIndexOf('.') + 1))
      || (cell.styleName !== undefined && namedShapeStyles.has(cell.styleName) ? cell.styleName : undefined)
      || (cell.style.get('rounded') === '1' ? 'rounded' : undefined)
    if (shapeName) {
      const shape = readGraphShape(shapeName, warn, cell.id)
      if (shape !== 'box') node.shape = shape
    }
    const tone = cell.style.get('vwTone')
    const fill = cell.style.get('fillColor')?.toLowerCase()
    if (isChartTone(tone)) node.tone = tone
    else if (fill) {
      const match = (Object.keys(toneColors) as ChartTone[]).find(name => toneColors[name].fill === fill)
      if (match) node.tone = match
    }
    if (!collector.addNode(node)) continue
    const owner = parentVertex(cell)
    if (owner && containers.has(owner.id)) collector.addMember(owner.id, cell.id)
    const geometry = cell.geometry?.attributes
    if (geometry && geometry.get('relative') !== '1') {
      const base = offset(owner)
      const fields = ['x', 'y', 'width', 'height'].map(name => geometry.has(name) ? readNumber(geometry.get(name)) : 0)
      const [x, y, width, height] = fields
      if (x === undefined || y === undefined) warn('invalid-value', `Node ${cell.id} has an unreadable position, which was left out`, cell.id)
      else collector.positions.set(cell.id, { x: base.x + x, y: base.y + y })
      if (width === undefined || height === undefined || !(width > 0 && height > 0)) {
        if (geometry.has('width') || geometry.has('height')) warn('invalid-value', `Node ${cell.id} has an unreadable size, which was left out`, cell.id)
      } else collector.sizes.set(cell.id, { width, height })
    }
  }
  for (const cell of cells.values()) {
    if (cell.vertex) continue
    if (!cell.edge) {
      if (cell.parent !== undefined && cells.get(cell.parent)?.parent !== undefined) {
        warn('unsupported-element', `The cell ${cell.id} is neither a vertex nor an edge and was ignored`, cell.id)
      }
      continue
    }
    const text = cellText(cell)
    const label = text !== '' ? text : edgeLabels.get(cell.id)?.join('\n')
    const edge: Omit<GraphEdge, 'id'> & { id?: string } = { id: cell.id, from: cell.source ?? '', to: cell.target ?? '' }
    if (label !== undefined && label !== '') edge.label = label
    // An unfilled `block` or `classic` arrow is the hollow triangle of a BPMN message flow.
    const marker = (side: 'end' | 'start', fallback: string) => {
      const name = cell.style.get(side + 'Arrow') || fallback
      const hollow = cell.style.get(side + 'Fill') === '0' && (name === 'block' || name === 'classic')
      return hollow ? 'hollow-arrow' : readGraphMarker(name, warn, cell.id)
    }
    const end = marker('end', 'classic')
    const start = marker('start', 'none')
    if (end !== 'arrow') edge.markerEnd = end
    if (start !== 'none') edge.markerStart = start
    const edgeStyle = cell.style.get('edgeStyle')
    if (edgeStyle !== undefined && orthogonalStyles.has(edgeStyle)) edge.edgeStyle = 'orthogonal'
    else if (cell.style.get('curved') === '1') edge.edgeStyle = 'curve'
    else if (edgeStyle === 'none') edge.edgeStyle = 'straight'
    if (cell.style.get('flowAnimation') === '1') edge.animated = true
    if (cell.style.get('dashed') === '1') edge.dashed = true
    const array = cell.geometry?.children.find(child => child.name === 'Array' && child.attributes.get('as') === 'points')
    if (array) {
      const base = offset(cell.parent === undefined ? undefined : parentVertex(cell))
      const points: GraphPoint[] = []
      for (const point of array.children) {
        if (point.name !== 'mxPoint') continue
        const x = point.attributes.has('x') ? readNumber(point.attributes.get('x')) : 0
        const y = point.attributes.has('y') ? readNumber(point.attributes.get('y')) : 0
        if (x === undefined || y === undefined) warn('invalid-value', `Edge ${cell.id} has an unreadable waypoint, which was left out`, cell.id)
        else points.push({ x: base.x + x, y: base.y + y })
      }
      if (points.length) edge.points = points
    }
    collector.addEdge(edge)
  }
  return collector.finish()
}

/** The selected page: its model, or the compressed text of a page that has no model element. */
function selectPage(xml: string, page: number | string | undefined) {
  if (typeof xml !== 'string') throw new Error('draw.io XML must be a string')
  if (page !== undefined && typeof page !== 'string' && !(Number.isInteger(page) && page >= 0)) {
    throw new RangeError('page must be a nonnegative integer index or a page name')
  }
  const root = parseXml(xml)
  if (root.name === 'mxGraphModel') {
    if (page !== undefined && page !== 0) throw new Error('No draw.io page ' + page + ': the document has one page')
    return { model: root, name: '' }
  }
  if (root.name !== 'mxfile') throw new Error('Not a draw.io document: the root element is ' + root.name)
  const pages = root.children.filter(child => child.name === 'diagram')
  if (!pages.length) throw new Error('The draw.io file has no pages')
  const chosen = typeof page === 'string'
    ? pages.find(item => item.attributes.get('name') === page)
    : pages[page ?? 0]
  if (!chosen) throw new Error(typeof page === 'string' ? 'No draw.io page named ' + page : `No draw.io page ${page}: the file has ${pages.length}`)
  const name = chosen.attributes.get('name') ?? ''
  const model = chosen.children.find(child => child.name === 'mxGraphModel')
  if (model) return { model, name }
  const compressed = chosen.text.trim()
  if (compressed === '') throw new Error(`The draw.io page ${name} is empty`)
  return { compressed, name }
}

/**
 * Read an uncompressed draw.io (diagrams.net) file into NetworkGraph nodes, edges, groups, positions and sizes. Accepts
 * an `mxfile` (the first page, or `options.page` by zero-based index or name) or a bare `mxGraphModel`, as draw.io
 * saves with compression turned off (File, Properties). Uses the DOM-free XML reader of `fromMsProjectXml`: declared
 * entities are never expanded and nothing outside the text is loaded.
 *
 * Vertex cells become nodes: the value (as text; HTML labels with `html=1` lose their markup and keep line breaks) is
 * split into label (first line) and detail, the style gives the shape (`rhombus` diamond, `ellipse` ellipse,
 * `shape=hexagon` hexagon, `rounded=1` rounded; other shapes are boxes with an `unsupported-shape` warning) and the tone
 * (`vwTone`, or a fill colour that `toDrawio` writes), and the geometry the position and size. A vertex that contains
 * other vertices is a group (container, swimlane or `group` cell) and its frame is not kept; child geometry relative to
 * a container is made absolute. `UserObject` and `object` wrappers are read. Edge cells become edges with the cell ID,
 * value (or the text of label cells on the edge) as label, `endArrow` and `startArrow` as markers, the edge style
 * (orthogonal styles, `curved=1`, `edgeStyle=none`), `flowAnimation` and the waypoints. An edge that is not connected at
 * both ends, or connected to a group, is left out with a warning.
 *
 * Throws an Error for malformed XML, a root element other than `mxfile` or `mxGraphModel`, a missing page and a
 * compressed page (read it with `fromDrawioAsync`), and a RangeError for an invalid `page` and past `maxItems`.
 */
export function fromDrawio(xml: string, options: DrawioImportOptions = {}): GraphInterchangeImport {
  const collector = createGraphCollector('draw.io', options)
  const selected = selectPage(xml, options.page)
  if (!selected.model) {
    throw new Error(`The draw.io page ${selected.name} is compressed; read it with fromDrawioAsync or save the file uncompressed`)
  }
  return readModel(selected.model, collector)
}

interface DecompressionStreamConstructor {
  new (format: string): { readable: ReadableStream<Uint8Array>; writable: WritableStream<Uint8Array> }
}

/** Inflate the text of a compressed page: base64, then raw deflate, then URI encoding. */
async function inflatePage(text: string, maxLength: number) {
  const Decompression = (globalThis as { DecompressionStream?: DecompressionStreamConstructor }).DecompressionStream
  if (typeof Decompression !== 'function') throw new Error('Reading a compressed draw.io page needs DecompressionStream, which this runtime does not have')
  let bytes: Uint8Array
  try {
    const binary = atob(text.replace(/\s+/g, ''))
    bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  } catch {
    throw new Error('The compressed draw.io page is not valid base64')
  }
  const stream = new Decompression('deflate-raw')
  const writer = stream.writable.getWriter()
  writer.write(bytes).catch(() => {})
  writer.close().catch(() => {})
  const reader = stream.readable.getReader()
  const decoder = new TextDecoder()
  let inflated = ''
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      inflated += decoder.decode(value, { stream: true })
      if (inflated.length > maxLength) {
        reader.cancel().catch(() => {})
        throw new RangeError(`The compressed draw.io page inflates to more than ${maxLength} characters (maxInflatedLength)`)
      }
    }
    inflated += decoder.decode()
  } catch (error) {
    if (error instanceof RangeError) throw error
    throw new Error('The compressed draw.io page cannot be inflated', { cause: error })
  }
  try {
    return decodeURIComponent(inflated)
  } catch {
    throw new Error('The inflated draw.io page is not URI-encoded text')
  }
}

/**
 * `fromDrawio` that also reads compressed pages (the default of draw.io files): the page text is base64, raw deflate
 * and URI encoding, inflated with the standard `DecompressionStream('deflate-raw')` of browsers, workers and Node.js
 * (an Error where the runtime has none). `options.maxInflatedLength` (default 20,000,000 characters) bounds the
 * inflated text; beyond it the promise rejects with a RangeError. Rejects with the Errors of `fromDrawio` otherwise,
 * and with an Error for text that is not base64, deflate or URI-encoded XML of an `mxGraphModel`.
 */
export async function fromDrawioAsync(xml: string, options: DrawioAsyncImportOptions = {}): Promise<GraphInterchangeImport> {
  const maxLength = options.maxInflatedLength ?? 20_000_000
  if (!(Number.isSafeInteger(maxLength) && maxLength > 0)) throw new RangeError('maxInflatedLength must be a positive integer')
  const collector = createGraphCollector('draw.io', options)
  const selected = selectPage(xml, options.page)
  if (selected.model) return readModel(selected.model, collector)
  const model = parseXml(await inflatePage(selected.compressed!, maxLength))
  if (model.name !== 'mxGraphModel') throw new Error('The inflated draw.io page is not an mxGraphModel: ' + model.name)
  return readModel(model, collector)
}
