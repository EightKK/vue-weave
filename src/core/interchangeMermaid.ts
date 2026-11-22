// Mermaid flowcharts: `toMermaid` writes a NetworkGraph diagram as a `flowchart`, and `fromMermaid` reads a documented
// subset of the flowchart syntax back. Pure string code without a DOM, written with loops.
import type { GraphEdge, GraphEdgeMarker, GraphLayoutDirection } from './graph.js'
import type { NetworkGroup, NetworkNode, NetworkNodeShape } from './types.js'
import {
  checkGraphInterchangeInput, createGraphCollector, graphShapeFormat, readGraphShape,
  type GraphInterchangeImport, type GraphInterchangeImportOptions, type GraphInterchangeInput,
} from './interchangeGraph.js'

/** The direction written after `flowchart`. `TD` and `TB` both mean top to bottom. */
export type MermaidDirection = 'TD' | 'TB' | 'LR' | 'RL' | 'BT'

export interface MermaidOptions {
  /** The flow direction of the chart. Default `LR`, the NetworkGraph default. */
  direction?: MermaidDirection
  /**
   * Write edge IDs (`a e1@--> b`), which Mermaid reads from version 11.6. Default false: edges are written without IDs
   * and `fromMermaid` names them `e1`, `e2`, ….
   */
  edgeIds?: boolean
}

const directions = new Set<string>(['TD', 'TB', 'LR', 'RL', 'BT'])
// Words that would start another statement, so they cannot be written as plain node IDs.
const reservedIds = new Set([
  'end', 'graph', 'flowchart', 'subgraph', 'style', 'classDef', 'class', 'click', 'linkStyle', 'direction', 'accTitle',
  'accDescr', 'call', 'href', 'default',
])
const plainId = /^[A-Za-z0-9_]+$/
const encodedId = /^vw_(?:[A-Za-z0-9]|_[0-9a-f]{1,6}_)+$/

/**
 * The comment line `toMermaid` writes after the header when it encoded an ID. `fromMermaid` decodes `vw_` IDs only in
 * text that has this line, so the IDs of other Mermaid files are kept as written (`order` and `vw_order` stay two nodes).
 */
const encodedIdsMarker = '%% vue-weave: encoded-ids'

/**
 * The Mermaid ID of a node, edge or group ID. Mermaid has no quoting for IDs, so an ID that is not letters, digits and
 * underscores, is a keyword or starts with `vw_` is written as `vw_` followed by its letters and digits, with every other
 * character as `_<hex code point>_` (`a b` becomes `vw_a_20_b`). `fromMermaid` decodes such IDs when the text carries
 * `encodedIdsMarker`.
 */
function needsEncoding(id: string) {
  return !plainId.test(id) || reservedIds.has(id) || id.startsWith('vw_')
}

function mermaidId(id: string) {
  if (!needsEncoding(id)) return id
  let out = 'vw_'
  for (const char of id) out += /[A-Za-z0-9]/.test(char) ? char : '_' + char.codePointAt(0)!.toString(16) + '_'
  return out
}

function decodeMermaidId(id: string) {
  if (!encodedId.test(id)) return id
  return id.slice(3).replace(/_([0-9a-f]{1,6})_/g, (_, hex: string) => String.fromCodePoint(Math.min(parseInt(hex, 16), 0x10ffff)))
}

/** Text for a quoted Mermaid label: characters that could end the label or be read as markup become `#<code>;`. */
function mermaidText(text: string) {
  return text.replace(/[#"<>&|`\r\n]/g, char => '#' + char.codePointAt(0) + ';')
}

const namedEntities: Record<string, string> = { quot: '"', amp: '&', lt: '<', gt: '>', apos: '\'', nbsp: ' ', num: '#' }

function decodeMermaidText(text: string) {
  return text.replace(/#(?:(\d{1,7})|([A-Za-z]+));/g, (match, code: string | undefined, name: string | undefined) => {
    if (code !== undefined) {
      const value = Number(code)
      return value <= 0x10ffff && !(value >= 0xd800 && value <= 0xdfff) ? String.fromCodePoint(value) : match
    }
    return Object.hasOwn(namedEntities, name!) ? namedEntities[name!]! : match
  })
}

const lineBreak = /<br\s*\/?>/gi

/** Label and detail from node text: the detail is what follows the first `<br>`, further `<br>`s are line breaks. */
function readNodeText(raw: string) {
  const parts = raw.split(lineBreak).map(decodeMermaidText)
  return parts.length > 1 ? { label: parts[0]!, detail: parts.slice(1).join('\n') } : { label: parts[0]! }
}

const endChars: Record<GraphEdgeMarker, string> = { arrow: '>', 'open-arrow': '>', 'hollow-arrow': '>', diamond: '>', circle: 'o', bar: 'x', none: '' }
const startChars: Record<GraphEdgeMarker, string> = { arrow: '<', 'open-arrow': '<', 'hollow-arrow': '<', diamond: '<', circle: 'o', bar: 'x', none: '' }

/**
 * Write a diagram as a Mermaid `flowchart`. Each node is declared once with its shape (`[ ]` box, `( )` rounded, `{ }`
 * diamond, `(( ))` ellipse and circle, `{{ }}` hexagon, `([ ])` stadium, `[( )]` cylinder, `[/ /]` parallelogram; other shapes, such as document and data-object, as boxes) and its quoted label, followed by `<br>` and the
 * detail when it has one. Groups become nested `subgraph … end` blocks with their direct members; edges follow at the
 * end, `-->` for an arrow (and any other end marker without a Mermaid form), `---` for `markerEnd: 'none'`, `--o` for a
 * circle and `--x` for a bar, with a matching start marker (`<-->`, `o--o`, `x--x`) when `markerStart` has the same
 * form, and the label as `|"…"|`. Characters that would end a label (`"`, `|`, `#`, `<`, `>`, `&`, backticks and line
 * breaks) are written as Mermaid entity codes such as `#34;`. IDs that Mermaid cannot hold are encoded (see
 * `fromMermaid`); a group whose encoded ID is also a node's gets a suffix. Positions, sizes, tones, ports, waypoints and
 * edge styles have no Mermaid form and are not written. Throws the Errors and RangeErrors of NetworkGraph's input
 * checks and an Error for an unknown `direction`.
 */
export function toMermaid(graph: GraphInterchangeInput, options: MermaidOptions = {}): string {
  const direction = options.direction ?? 'LR'
  if (!directions.has(direction)) throw new Error('Invalid Mermaid direction: ' + String(direction))
  const { nodes, edges, groups, childGroups, depth } = checkGraphInterchangeInput(graph, 'Mermaid')
  const nodeIds = new Map(nodes.map(node => [node.id, mermaidId(node.id)]))
  const taken = new Set(nodeIds.values())
  const groupIds = new Map<string, string>()
  for (const group of groups) {
    let id = mermaidId(group.id)
    if (taken.has(id)) {
      const base = id
      for (let n = 1; taken.has(id); n++) id = `${base}_g${n === 1 ? '' : n}`
    }
    taken.add(id)
    groupIds.set(group.id, id)
  }
  const byId = new Map(nodes.map(node => [node.id, node]))
  const declare = (node: NetworkNode) => {
    const [open, close] = graphShapeFormat(node.shape).mermaid
    const text = mermaidText(node.label) + (node.detail === undefined ? '' : '<br>' + mermaidText(node.detail))
    return `${nodeIds.get(node.id)}${open}"${text}"${close}`
  }
  const lines = ['flowchart ' + direction]
  const encoded = nodes.some(node => needsEncoding(node.id)) || groups.some(group => needsEncoding(group.id))
    || (options.edgeIds === true && edges.some(edge => needsEncoding(edge.id)))
  if (encoded) lines.push(encodedIdsMarker)
  const grouped = new Set<string>()
  for (const group of groups) for (const id of group.nodeIds) grouped.add(id)
  for (const node of nodes) if (!grouped.has(node.id)) lines.push('  ' + declare(node))
  const stack: { group: NetworkGroup; close: boolean }[] = []
  const roots = groups.filter(group => group.parentId === undefined)
  for (let i = roots.length - 1; i >= 0; i--) stack.push({ group: roots[i]!, close: false })
  while (stack.length) {
    const { group, close } = stack.pop()!
    const indent = '  '.repeat(depth.get(group.id)! + 1)
    if (close) {
      lines.push(indent + 'end')
      continue
    }
    lines.push(`${indent}subgraph ${groupIds.get(group.id)}["${mermaidText(group.label)}"]`)
    for (const id of group.nodeIds) lines.push(indent + '  ' + declare(byId.get(id)!))
    stack.push({ group, close: true })
    const children = childGroups.get(group.id) ?? []
    for (let i = children.length - 1; i >= 0; i--) stack.push({ group: children[i]!, close: false })
  }
  for (const edge of edges) {
    const end = endChars[edge.markerEnd ?? 'arrow'] ?? '>'
    const startChar = startChars[edge.markerStart ?? 'none'] ?? ''
    const start = end && startChar && (startChar === end || (startChar === '<' && end === '>')) ? startChar : ''
    let link = start + (end ? '--' + end : '---')
    if (edge.label !== undefined && edge.label !== '') link += `|"${mermaidText(edge.label)}"|`
    const id = options.edgeIds ? mermaidId(edge.id) + '@' : ''
    lines.push(`  ${nodeIds.get(edge.from)} ${id}${link} ${nodeIds.get(edge.to)}`)
  }
  return lines.join('\n') + '\n'
}

// ---------------------------------------------------------------------------------------------------------------------
// Reading

const diagramTypes = /^(sequenceDiagram|classDiagram(?:-v2)?|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|quadrantChart|requirementDiagram|gitGraph|C4\w*|mindmap|timeline|zenuml|sankey(?:-beta)?|xychart(?:-beta)?|block(?:-beta)?|packet(?:-beta)?|kanban|architecture(?:-beta)?|radar(?:-beta)?|treemap(?:-beta)?)\b/
const header = /(?:flowchart(?:-elk)?|graph)(?:[ \t]+([A-Za-z]{2}|[<>^v]))?[ \t]*(?=;|$)/y
const nodeIdPattern = /[\p{L}\p{N}_](?:[\p{L}\p{N}_]|[-.](?=[\p{L}\p{N}_]))*/uy
const edgeIdPattern = /([\p{L}\p{N}_]+)@(?=[<ox]?[-=~.])/uy
const plainLink = /(<|[ox](?=[-=]))?(-{2,}|={2,}|-\.+-|~{3,})(>|[ox](?![\p{L}\p{N}_]))?/uy
const linkOpener = /(<|[ox](?=[-=]))?(--|==|-\.)/uy
const classSuffix = /:::[\w-]+/y
const keyword = /(subgraph|end|classDef|class|style|click|linkStyle|direction|accTitle|accDescr)(?=[\s;:{]|$)/y
const closers: Record<string, RegExp> = {
  '--': /(-{2,})(>|[ox](?![\p{L}\p{N}_]))?/gu,
  '==': /(={2,})(>|[ox](?![\p{L}\p{N}_]))?/gu,
  '-.': /(\.+-)(>|[ox](?![\p{L}\p{N}_]))?/gu,
}
// Node shape delimiters, longest first, with the format-neutral shape name of each (see `graphShapeNames`).
const shapeTokens: readonly { open: string; closers: readonly (readonly [string, string])[] }[] = [
  { open: '(((', closers: [[')))', 'double-circle']] },
  { open: '((', closers: [['))', 'circle']] },
  { open: '([', closers: [['])', 'stadium']] },
  { open: '[[', closers: [[']]', 'subroutine']] },
  { open: '[(', closers: [[')]', 'cylinder']] },
  { open: '{{', closers: [['}}', 'hexagon']] },
  { open: '[/', closers: [['/]', 'parallelogram'], ['\\]', 'trapezoid']] },
  { open: '[\\', closers: [['\\]', 'parallelogram-alt'], ['/]', 'trapezoid-alt']] },
  { open: '[', closers: [[']', 'box']] },
  { open: '(', closers: [[')', 'rounded']] },
  { open: '{', closers: [['}', 'diamond']] },
  { open: '>', closers: [[']', 'asymmetric']] },
]
const markerOfChar: Record<string, GraphEdgeMarker> = { '<': 'arrow', '>': 'arrow', o: 'circle', x: 'bar' }

interface ParsedNode {
  label?: string
  detail?: string
  shape?: string
  line: number
}

interface Link {
  start: GraphEdgeMarker
  end: GraphEdgeMarker
  label?: string
  invisible: boolean
  id?: string
}

/**
 * Read a Mermaid flowchart into NetworkGraph nodes, edges and groups. Pure string parsing without a DOM, done with
 * loops. The text starts with `flowchart` or `graph` and an optional direction (`TD`, `TB`, `LR`, `RL`, `BT`, returned
 * as `direction` with `TD` as `TB`); `%%` comment lines, `%%{…}%%` directives and YAML front matter are skipped.
 * Statements end at a line break or `;`. Read: node declarations with the shapes `[ ]`, `( )`, `{ }`, `(( ))`, `{{ }}`
 * and the other Mermaid delimiters, quoted or unquoted text and `@{ shape: …, label: … }`; chains (`a --> b --> c`)
 * and `&` lists (`a & b --> c`, every pair); the links `-->`, `---`, `-.->`, `-.-`, `==>`, `===` and their longer
 * forms, with `o` and `x` ends, `<` starts, `|label|` or `-- label -->` text and `id@` edge IDs; and nested
 * `subgraph id[title] … end` blocks, which become groups. A node belongs to the first subgraph it appears in (or a
 * nested subgraph of it); a later mention in another subgraph is reported (`group-member`).
 *
 * Text: `"` quotes are removed, entity codes (`#35;`, `#quot;`) are decoded, and `<br>` splits a node's label from its
 * detail. Shapes NetworkGraph does not draw become boxes (`unsupported-shape`); the line style of dotted and thick
 * links is not kept. Ignored with an `unsupported-statement` warning: `classDef`, `class`, `:::class`, `style`, `click`,
 * `linkStyle`, `direction` inside subgraphs, `accTitle`, `accDescr`, front matter and invisible `~~~` links. Edges to a
 * subgraph are left out (`skipped-edge`). IDs written by `toMermaid` in the `vw_` form are decoded. Edges get the IDs
 * `e1`, `e2`, … unless they have an `id@`. Positions and sizes are empty.
 *
 * Throws an Error for a value that is not a string, for another Mermaid diagram type (`sequenceDiagram`, …), for text
 * without a flowchart header and, with the line and column, for syntax it cannot read and for unbalanced
 * `subgraph`/`end`; a RangeError past `maxItems`.
 */
export function fromMermaid(text: string, options: GraphInterchangeImportOptions = {}): GraphInterchangeImport {
  if (typeof text !== 'string') throw new Error('Mermaid text must be a string')
  const collector = createGraphCollector('Mermaid', options)
  const maxItems = options.maxItems ?? 100_000
  const { warn } = collector
  const lines = (text.charCodeAt(0) === 0xfeff ? text.slice(1) : text).split(/\r\n|\n|\r/)
  // Only text that toMermaid wrote with encoded IDs has the marker; other files keep their `vw_` IDs as written.
  const decodeIds = lines.some(line => line.trim() === encodedIdsMarker)
  const decodeId = (id: string) => decodeIds ? decodeMermaidId(id) : id
  let lineIndex = 0
  let source = ''
  let pos = 0
  const fail = (reason: string, at = pos): never => {
    throw new Error(`Invalid Mermaid flowchart at line ${lineIndex + 1}, column ${at + 1}: ${reason}`)
  }
  const skipSpace = () => {
    while (pos < source.length && (source[pos] === ' ' || source[pos] === '\t')) pos++
  }
  const blank = (line: string) => /^\s*(?:%%.*)?$/.test(line)

  // Front matter, comments and directives before the header.
  while (lineIndex < lines.length && blank(lines[lineIndex]!)) lineIndex++
  if (lineIndex < lines.length && lines[lineIndex]!.trim() === '---') {
    const start = lineIndex
    for (lineIndex++; lineIndex < lines.length && lines[lineIndex]!.trim() !== '---'; lineIndex++);
    if (lineIndex >= lines.length) {
      lineIndex = start
      fail('unterminated front matter', 0)
    }
    warn('unsupported-statement', 'The front matter was ignored', undefined, start + 1)
    lineIndex++
    while (lineIndex < lines.length && blank(lines[lineIndex]!)) lineIndex++
  }
  if (lineIndex >= lines.length) throw new Error('Not a Mermaid flowchart: the text has no diagram')
  source = lines[lineIndex]!
  pos = 0
  skipSpace()
  header.lastIndex = pos
  const head = header.exec(source)
  if (!head) {
    const type = diagramTypes.exec(source.slice(pos))
    if (type) throw new Error(`Unsupported Mermaid diagram type: ${type[1]}. Only flowchart and graph diagrams can be read`)
    throw new Error('Not a Mermaid flowchart: the text does not start with flowchart or graph')
  }
  let direction: GraphLayoutDirection = 'TB'
  if (head[1] !== undefined) {
    const value = head[1].toUpperCase()
    const named: Record<string, GraphLayoutDirection> = { TD: 'TB', TB: 'TB', LR: 'LR', RL: 'RL', BT: 'BT', '>': 'LR', '<': 'RL', '^': 'BT', V: 'TB' }
    if (!Object.hasOwn(named, value)) fail('unknown direction ' + head[1], pos + source.slice(pos).indexOf(head[1]))
    direction = named[value]!
  }
  pos = header.lastIndex

  const parsed = new Map<string, ParsedNode>()
  const groupOf = new Map<string, string>()
  const groupParent = new Map<string, string | undefined>()
  const groups: { id: string; label: string; parentId?: string; line: number }[] = []
  const edges: { from: string; to: string; link: Link; line: number }[] = []
  const open: string[] = []
  let subgraphCount = 0
  // Node and group IDs met so far (a subgraph mentioned as a node counts once, as the collector counts it). With the
  // edges they must stay within maxItems while the text is read, not only when the result is collected.
  const seenIds = new Set<string>()
  const tooMany = () => new RangeError(`The Mermaid file has more than ${maxItems} nodes, edges and groups (maxItems)`)
  const see = (id: string) => {
    if (seenIds.has(id)) return
    if (seenIds.size + edges.length + 1 > maxItems) throw tooMany()
    seenIds.add(id)
  }

  /** Whether group `inner` is `outer` or nested in it. */
  const within = (inner: string, outer: string) => {
    for (let current: string | undefined = inner; current !== undefined; current = groupParent.get(current)) {
      if (current === outer) return true
    }
    return false
  }
  const mention = (id: string) => {
    let node = parsed.get(id)
    if (!node) {
      see(id)
      node = { line: lineIndex + 1 }
      parsed.set(id, node)
    }
    const group = open.at(-1)
    if (group === undefined) return node
    const current = groupOf.get(id)
    if (current === undefined || within(group, current)) groupOf.set(id, group)
    else if (!within(current, group)) {
      warn('group-member', `Node ${id} is in subgraph ${current} and stays there, not in ${group}`, id, lineIndex + 1)
    }
    return node
  }

  /** Read quoted or unquoted text up to one of the closers; returns the raw text and the closer that ended it. */
  const readDelimited = (enders: readonly (readonly [string, string])[]) => {
    const start = pos
    if (source[pos] === '"') {
      const close = source.indexOf('"', pos + 1)
      if (close < 0) fail('unterminated quoted text')
      const raw = source.slice(pos + 1, close)
      pos = close + 1
      skipSpace()
      const ender = enders.find(([token]) => source.startsWith(token, pos))
      if (!ender) fail(`expected ${enders.map(([token]) => token).join(' or ')} after the quoted text`)
      pos += ender![0].length
      return { raw, name: ender![1] }
    }
    let best: { index: number; ender: readonly [string, string] } | undefined
    for (const ender of enders) {
      const index = source.indexOf(ender[0], pos)
      if (index >= 0 && (!best || index < best.index)) best = { index, ender }
    }
    if (!best) fail(`expected ${enders.map(([token]) => token).join(' or ')}`, start)
    pos = best!.index + best!.ender[0].length
    return { raw: source.slice(start, best!.index).trim(), name: best!.ender[1] }
  }

  /** Read `@{ key: value, … }` after a node ID. */
  const readProperties = () => {
    const start = pos
    pos += 2
    const properties = new Map<string, string>()
    for (;;) {
      while (pos < source.length && /[\s,]/.test(source[pos]!)) pos++
      if (pos >= source.length) fail('unterminated @{ … }', start)
      if (source[pos] === '}') {
        pos++
        return properties
      }
      const key = /([A-Za-z][\w-]*)\s*:\s*/y
      key.lastIndex = pos
      const match = key.exec(source)
      if (!match) fail('expected a property name in @{ … }')
      pos = key.lastIndex
      let value: string
      if (source[pos] === '"') {
        const close = source.indexOf('"', pos + 1)
        if (close < 0) fail('unterminated quoted text')
        value = source.slice(pos + 1, close)
        pos = close + 1
      } else {
        const end = /[,}]/g
        end.lastIndex = pos
        const found = end.exec(source)
        if (!found) fail('unterminated @{ … }', start)
        value = source.slice(pos, found!.index).trim()
        pos = found!.index
      }
      properties.set(match![1]!, value)
    }
  }

  const readNode = () => {
    nodeIdPattern.lastIndex = pos
    const match = nodeIdPattern.exec(source)
    if (!match) fail('expected a node ID')
    const id = decodeId(match![0])
    pos = nodeIdPattern.lastIndex
    const node = mention(id)
    let raw: string | undefined, shape: string | undefined
    if (source.startsWith('@{', pos)) {
      const properties = readProperties()
      if (properties.has('shape')) shape = properties.get('shape')!
      if (properties.has('label')) raw = properties.get('label')!
      for (const key of properties.keys()) {
        if (key !== 'shape' && key !== 'label') warn('unsupported-statement', `The node property ${key} was ignored`, id, lineIndex + 1)
      }
      if (shape !== undefined || raw !== undefined) shape ??= node.shape ?? 'box'
    } else {
      const token = shapeTokens.find(({ open }) => source.startsWith(open, pos))
      if (token) {
        pos += token.open.length
        const text = readDelimited(token.closers)
        raw = text.raw
        shape = text.name
      }
    }
    if (shape !== undefined) {
      node.shape = shape
      node.line = lineIndex + 1
      if (raw !== undefined) {
        const { label, detail } = readNodeText(raw)
        node.label = label
        node.detail = detail
      }
    }
    classSuffix.lastIndex = pos
    if (classSuffix.exec(source)) {
      warn('unsupported-statement', 'The class assignment ' + source.slice(pos, classSuffix.lastIndex) + ' was ignored', id, lineIndex + 1)
      pos = classSuffix.lastIndex
    }
    return id
  }

  const readNodeList = () => {
    const ids = [readNode()]
    for (;;) {
      skipSpace()
      if (source[pos] !== '&') return ids
      pos++
      skipSpace()
      ids.push(readNode())
    }
  }

  const readLink = (): Link | undefined => {
    let id: string | undefined
    edgeIdPattern.lastIndex = pos
    const named = edgeIdPattern.exec(source)
    if (named) {
      id = decodeId(named[1]!)
      pos = edgeIdPattern.lastIndex
    }
    const start = pos
    plainLink.lastIndex = pos
    const plain = plainLink.exec(source)
    let link: Link | undefined
    if (plain) {
      const body = plain[2]!
      const isOpener = (body === '--' || body === '==') && plain[3] === undefined
      if (!isOpener) {
        pos = plainLink.lastIndex
        link = {
          start: plain[1] === undefined ? 'none' : markerOfChar[plain[1]]!,
          end: plain[3] === undefined ? 'none' : markerOfChar[plain[3]]!,
          invisible: body[0] === '~',
        }
      }
    }
    if (!link) {
      linkOpener.lastIndex = pos
      const opener = linkOpener.exec(source)
      if (!opener) {
        if (id !== undefined) fail('expected a link after the edge ID')
        return undefined
      }
      pos = linkOpener.lastIndex
      skipSpace()
      let label: string | undefined
      let searchFrom = pos
      if (source[pos] === '"') {
        const close = source.indexOf('"', pos + 1)
        if (close < 0) fail('unterminated quoted text')
        label = source.slice(pos + 1, close)
        searchFrom = close + 1
      }
      const closer = closers[opener[2]!]!
      closer.lastIndex = searchFrom
      let found: RegExpExecArray | null
      for (;;) {
        found = closer.exec(source)
        if (!found) fail('unterminated link text', start)
        if (opener[2] === '-.' || found![2] !== undefined || found![1]!.length >= 3) break
      }
      if (label === undefined) label = source.slice(pos, found!.index).trim()
      else if (source.slice(searchFrom, found!.index).trim() !== '') fail('unexpected text after the quoted link text', searchFrom)
      pos = closer.lastIndex
      link = {
        start: opener[1] === undefined ? 'none' : markerOfChar[opener[1]]!,
        end: found![2] === undefined ? 'none' : markerOfChar[found![2]]!,
        label: decodeMermaidText(label),
        invisible: false,
      }
    }
    skipSpace()
    if (source[pos] === '|') {
      pos++
      let raw: string
      if (source[pos] === '"') {
        const close = source.indexOf('"', pos + 1)
        if (close < 0) fail('unterminated quoted text')
        raw = source.slice(pos + 1, close)
        pos = close + 1
        skipSpace()
        if (source[pos] !== '|') fail('expected | after the link text')
        pos++
      } else {
        const close = source.indexOf('|', pos)
        if (close < 0) fail('unterminated |link text|')
        raw = source.slice(pos, close).trim()
        pos = close + 1
      }
      link.label = decodeMermaidText(raw.replace(lineBreak, '\n'))
    }
    if (id !== undefined) link.id = id
    return link
  }

  const readChain = () => {
    let current = readNodeList()
    for (;;) {
      skipSpace()
      if (pos >= source.length || source[pos] === ';' || source.startsWith('%%', pos)) return
      const link = readLink()
      if (!link) fail('expected a link, & or the end of the statement')
      skipSpace()
      const next = readNodeList()
      if (link!.invisible) {
        warn('unsupported-statement', 'An invisible link (~~~) was ignored', undefined, lineIndex + 1)
      } else {
        // `a & b --> c & d` expands to every pair. Check the count before expanding, so a few `&` lists cannot build an
        // edge list far beyond maxItems before the collector rejects it.
        if (edges.length + current.length * next.length + seenIds.size > maxItems) throw tooMany()
        for (const from of current) for (const to of next) edges.push({ from, to, link: link!, line: lineIndex + 1 })
      }
      current = next
    }
  }

  // The text up to the next `;` outside double quotes, or to the end of the line; `pos` stops at that `;`.
  const restOfStatement = () => {
    let end = pos
    let quoted = false
    for (; end < source.length; end++) {
      if (source[end] === '"') quoted = !quoted
      else if (source[end] === ';' && !quoted) break
    }
    const rest = source.slice(pos, end)
    pos = end
    return rest
  }

  for (;;) {
    skipSpace()
    if (pos >= source.length) {
      lineIndex++
      if (lineIndex >= lines.length) break
      source = lines[lineIndex]!
      pos = 0
      continue
    }
    if (source[pos] === ';') {
      pos++
      continue
    }
    if (source.startsWith('%%', pos)) {
      pos = source.length
      continue
    }
    keyword.lastIndex = pos
    const word = keyword.exec(source)?.[1]
    if (word === 'subgraph') {
      pos = keyword.lastIndex
      // The subgraph statement ends at a `;` outside quotes, like the others: `subgraph g; a --> b; end` is one line.
      const rest = restOfStatement().trim()
      if (rest === '') fail('expected a subgraph ID or title', keyword.lastIndex)
      let id: string | undefined, raw: string
      const titled = /^([^\s[\]"]+)\s*\[(.*)\]$/.exec(rest)
      if (titled) {
        id = decodeId(titled[1]!)
        raw = titled[2]!.trim()
      } else if (/^[^\s"]+$/.test(rest)) {
        id = decodeId(rest)
        raw = rest
      } else raw = rest
      if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) raw = raw.slice(1, -1)
      if (id === undefined) id = 'subGraph' + subgraphCount
      subgraphCount++
      const parentId = open.at(-1)
      see(id)
      groups.push({ id, label: decodeMermaidText(raw.replace(lineBreak, '\n')), ...(parentId === undefined ? {} : { parentId }), line: lineIndex + 1 })
      if (!groupParent.has(id)) groupParent.set(id, parentId)
      open.push(id)
      continue
    }
    if (word === 'end') {
      if (!open.length) fail('end without a subgraph')
      open.pop()
      pos = keyword.lastIndex
      continue
    }
    if (word === 'direction') {
      pos = keyword.lastIndex
      const value = restOfStatement().trim()
      warn('unsupported-statement', `The direction ${value} inside a subgraph was ignored`, open.at(-1), lineIndex + 1)
      continue
    }
    if (word === 'accDescr' && /^accDescr\s*\{/.test(source.slice(pos))) {
      const start = lineIndex
      while (lineIndex < lines.length && !lines[lineIndex]!.includes('}')) lineIndex++
      if (lineIndex >= lines.length) {
        lineIndex = start
        fail('unterminated accDescr { … }', pos)
      }
      warn('unsupported-statement', 'The accessible description was ignored', undefined, start + 1)
      source = lines[lineIndex]!
      pos = source.indexOf('}') + 1
      continue
    }
    if (word !== undefined) {
      warn('unsupported-statement', `The ${word} statement was ignored`, undefined, lineIndex + 1)
      // Skip only this statement: `style a fill:red; b --> c` still reads the link after the semicolon.
      pos = keyword.lastIndex
      restOfStatement()
      continue
    }
    readChain()
  }
  if (open.length) {
    lineIndex = lines.length - 1
    throw new Error(`Invalid Mermaid flowchart: subgraph ${open.at(-1)} has no end`)
  }

  // Groups first, so a node or edge that names a subgraph is reported against it.
  for (const group of groups) collector.addGroup(group, group.line)
  for (const [id, node] of parsed) {
    if (collector.groups.has(id) && node.shape === undefined) continue
    const shape: NetworkNodeShape = node.shape === undefined ? 'box' : readGraphShape(node.shape, warn, id, node.line)
    const item: NetworkNode = {
      id,
      label: node.label ?? id,
      ...(node.detail === undefined ? {} : { detail: node.detail }),
      ...(shape === 'box' ? {} : { shape }),
    }
    if (!collector.addNode(item, node.line)) continue
    const group = groupOf.get(id)
    if (group !== undefined && collector.groups.has(group)) collector.addMember(group, id, node.line)
  }
  for (const { from, to, link, line } of edges) {
    const edge: Omit<GraphEdge, 'id'> & { id?: string } = {
      ...(link.id === undefined ? {} : { id: link.id }),
      from, to,
      ...(link.label === undefined || link.label === '' ? {} : { label: link.label }),
      ...(link.end === 'arrow' ? {} : { markerEnd: link.end }),
      ...(link.start === 'none' ? {} : { markerStart: link.start }),
    }
    collector.addEdge(edge, line)
  }
  return collector.finish(direction)
}
