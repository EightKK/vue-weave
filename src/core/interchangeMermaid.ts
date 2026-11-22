// Mermaid flowcharts: `toMermaid` writes a NetworkGraph diagram as a `flowchart`, and `fromMermaid` reads a documented
// subset of the flowchart syntax back. Pure string code without a DOM, written with loops.
import type { GraphEdge, GraphEdgeMarker, GraphLayoutDirection } from './graph.js'
import type { NetworkGroup, NetworkNode, NetworkNodeShape } from './types.js'
import {
  checkGraphInterchangeInput, createGraphCollector, graphShapeFormat, nestedIndent, readGraphShape,
  type GraphCollector, type GraphInterchangeImport, type GraphInterchangeImportOptions, type GraphInterchangeInput, type GraphWarn,
} from './interchangeGraph.js'
import { dropInvalidXmlChars, predefinedEntities, referencedCharacter } from './interchangeXml.js'
import { stripBom } from './interchangeShared.js'

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

/**
 * Text for a quoted Mermaid label: characters that could end the label or be read as markup become `#<code>;`, and
 * characters that no reader decodes (C0 controls other than tab and line breaks, U+FFFE, U+FFFF and unpaired
 * surrogates) are dropped, as in the XML writers.
 */
function mermaidText(text: string) {
  return dropInvalidXmlChars(text).replace(/[#"<>&|`\r\n]/g, char => '#' + char.codePointAt(0) + ';')
}

const namedEntities: Record<string, string> = { ...predefinedEntities, nbsp: ' ', num: '#' }

function decodeMermaidText(text: string) {
  return text.replace(/#(?:(\d{1,7})|([A-Za-z]+));/g, (match, code: string | undefined, name: string | undefined) => {
    if (code !== undefined) {
      // The code points XML allows, as in the XML reader; any other reference stays as written.
      return referencedCharacter(Number(code)) ?? match
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
    const indent = nestedIndent('  ', depth.get(group.id)! + 1)
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

interface ParsedGroup {
  id: string
  label: string
  parentId?: string
  line: number
}

interface ParsedEdge {
  from: string
  to: string
  link: Link
  line: number
}

/** The directions of the flowchart header, with `TD` read as `TB` and the arrow forms. */
const headerDirections: Readonly<Record<string, GraphLayoutDirection>> = {
  TD: 'TB', TB: 'TB', LR: 'LR', RL: 'RL', BT: 'BT', '>': 'LR', '<': 'RL', '^': 'BT', V: 'TB',
}

const markerOf = (char: string | undefined): GraphEdgeMarker => char === undefined ? 'none' : markerOfChar[char]!

/**
 * The statement reader of `fromMermaid`: a cursor over the lines of the text (`lineIndex`, `source`, the current line,
 * and `pos`) and the nodes, subgraphs and edges read so far, in file order. Every method moves the cursor forward with
 * loops; none recurses.
 */
class FlowchartReader {
  readonly parsed = new Map<string, ParsedNode>()
  readonly groups: ParsedGroup[] = []
  readonly edges: ParsedEdge[] = []
  /** The subgraph each node belongs to, and the parent of each subgraph. */
  readonly groupOf = new Map<string, string>()
  private readonly groupParent = new Map<string, string | undefined>()
  /** The subgraphs open at the cursor, innermost last. */
  private readonly open: string[] = []
  private subgraphCount = 0
  // Node and group IDs met so far (a subgraph mentioned as a node counts once, as the collector counts it). With the
  // edges they must stay within maxItems while the text is read, not only when the result is collected.
  private readonly seenIds = new Set<string>()
  private readonly lines: readonly string[]
  private readonly warn: GraphWarn
  private readonly maxItems: number
  /** Only text that toMermaid wrote with encoded IDs has the marker; other files keep their `vw_` IDs as written. */
  private readonly decodeIds: boolean
  private lineIndex = 0
  private source = ''
  private pos = 0

  constructor(lines: readonly string[], warn: GraphWarn, maxItems: number) {
    this.lines = lines
    this.warn = warn
    this.maxItems = maxItems
    this.decodeIds = lines.some(line => line.trim() === encodedIdsMarker)
  }

  private fail(reason: string, at = this.pos): never {
    throw new Error(`Invalid Mermaid flowchart at line ${this.lineIndex + 1}, column ${at + 1}: ${reason}`)
  }

  private decodeId(id: string) {
    return this.decodeIds ? decodeMermaidId(id) : id
  }

  private skipSpace() {
    while (this.pos < this.source.length && (this.source[this.pos] === ' ' || this.source[this.pos] === '\t')) this.pos++
  }

  private startLine(index: number) {
    this.lineIndex = index
    this.source = this.lines[index]!
    this.pos = 0
  }

  private tooMany() {
    return new RangeError(`The Mermaid file has more than ${this.maxItems} nodes, edges and groups (maxItems)`)
  }

  private see(id: string) {
    if (this.seenIds.has(id)) return
    if (this.seenIds.size + this.edges.length + 1 > this.maxItems) throw this.tooMany()
    this.seenIds.add(id)
  }

  /** The index of the `"` that closes the quoted text starting at the cursor. */
  private quoteEnd() {
    const close = this.source.indexOf('"', this.pos + 1)
    if (close < 0) this.fail('unterminated quoted text')
    return close
  }

  /**
   * Skip the comments, directives and front matter before the header and read the header line. Returns the direction,
   * `TB` when the header has none.
   */
  readHeader(): GraphLayoutDirection {
    const { lines } = this
    const blank = (line: string) => /^\s*(?:%%.*)?$/.test(line)
    let index = 0
    while (index < lines.length && blank(lines[index]!)) index++
    if (index < lines.length && lines[index]!.trim() === '---') {
      const start = index
      for (index++; index < lines.length && lines[index]!.trim() !== '---'; index++);
      if (index >= lines.length) {
        this.lineIndex = start
        this.fail('unterminated front matter', 0)
      }
      this.warn('unsupported-statement', 'The front matter was ignored', undefined, start + 1)
      index++
      while (index < lines.length && blank(lines[index]!)) index++
    }
    if (index >= lines.length) throw new Error('Not a Mermaid flowchart: the text has no diagram')
    this.startLine(index)
    this.skipSpace()
    header.lastIndex = this.pos
    const head = header.exec(this.source)
    if (!head) {
      const type = diagramTypes.exec(this.source.slice(this.pos))
      if (type) throw new Error(`Unsupported Mermaid diagram type: ${type[1]}. Only flowchart and graph diagrams can be read`)
      throw new Error('Not a Mermaid flowchart: the text does not start with flowchart or graph')
    }
    let direction: GraphLayoutDirection = 'TB'
    if (head[1] !== undefined) {
      const value = head[1].toUpperCase()
      if (!Object.hasOwn(headerDirections, value)) this.fail('unknown direction ' + head[1], this.pos + this.source.slice(this.pos).indexOf(head[1]))
      direction = headerDirections[value]!
    }
    this.pos = header.lastIndex
    return direction
  }

  /** Read the statements after the header up to the end of the text. */
  readStatements() {
    for (;;) {
      this.skipSpace()
      if (this.pos >= this.source.length) {
        if (this.lineIndex + 1 >= this.lines.length) break
        this.startLine(this.lineIndex + 1)
        continue
      }
      if (this.source[this.pos] === ';') {
        this.pos++
        continue
      }
      if (this.source.startsWith('%%', this.pos)) {
        this.pos = this.source.length
        continue
      }
      keyword.lastIndex = this.pos
      const word = keyword.exec(this.source)?.[1]
      if (word === undefined) this.readChain()
      else this.readKeywordStatement(word, keyword.lastIndex)
    }
    if (this.open.length) {
      this.lineIndex = this.lines.length - 1
      throw new Error(`Invalid Mermaid flowchart: subgraph ${this.open.at(-1)} has no end`)
    }
  }

  /** A statement that starts with a keyword, which ends at `end`. */
  private readKeywordStatement(word: string, end: number) {
    if (word === 'subgraph') {
      this.readSubgraph(end)
      return
    }
    if (word === 'end') {
      if (!this.open.length) this.fail('end without a subgraph')
      this.open.pop()
      this.pos = end
      return
    }
    if (word === 'direction') {
      this.pos = end
      const value = this.restOfStatement().trim()
      this.warn('unsupported-statement', `The direction ${value} inside a subgraph was ignored`, this.open.at(-1), this.lineIndex + 1)
      return
    }
    if (word === 'accDescr' && /^accDescr\s*\{/.test(this.source.slice(this.pos))) {
      this.skipDescriptionBlock()
      return
    }
    this.warn('unsupported-statement', `The ${word} statement was ignored`, undefined, this.lineIndex + 1)
    // Skip only this statement: `style a fill:red; b --> c` still reads the link after the semicolon.
    this.pos = end
    this.restOfStatement()
  }

  /** `subgraph id`, `subgraph id[title]` or `subgraph title`, which opens a group. */
  private readSubgraph(end: number) {
    this.pos = end
    // The subgraph statement ends at a `;` outside quotes, like the others: `subgraph g; a --> b; end` is one line.
    const rest = this.restOfStatement().trim()
    if (rest === '') this.fail('expected a subgraph ID or title', end)
    let id: string | undefined, raw: string
    const titled = /^([^\s[\]"]+)\s*\[(.*)\]$/.exec(rest)
    if (titled) {
      id = this.decodeId(titled[1]!)
      raw = titled[2]!.trim()
    } else if (/^[^\s"]+$/.test(rest)) {
      id = this.decodeId(rest)
      raw = rest
    } else raw = rest
    if (raw.length >= 2 && raw.startsWith('"') && raw.endsWith('"')) raw = raw.slice(1, -1)
    if (id === undefined) id = 'subGraph' + this.subgraphCount
    this.subgraphCount++
    const parentId = this.open.at(-1)
    this.see(id)
    this.groups.push({ id, label: decodeMermaidText(raw.replace(lineBreak, '\n')), ...(parentId === undefined ? {} : { parentId }), line: this.lineIndex + 1 })
    if (!this.groupParent.has(id)) this.groupParent.set(id, parentId)
    this.open.push(id)
  }

  /** Skip an `accDescr { … }` block, which may span lines, up to the first `}` after the cursor. */
  private skipDescriptionBlock() {
    const start = this.lineIndex
    let index = start, close = this.source.indexOf('}', this.pos)
    while (close < 0 && ++index < this.lines.length) close = this.lines[index]!.indexOf('}')
    if (close < 0) this.fail('unterminated accDescr { … }')
    this.warn('unsupported-statement', 'The accessible description was ignored', undefined, start + 1)
    this.startLine(index)
    this.pos = close + 1
  }

  /** The text up to the next `;` outside double quotes, or to the end of the line; the cursor stops at that `;`. */
  private restOfStatement() {
    let end = this.pos
    let quoted = false
    for (; end < this.source.length; end++) {
      if (this.source[end] === '"') quoted = !quoted
      else if (this.source[end] === ';' && !quoted) break
    }
    const rest = this.source.slice(this.pos, end)
    this.pos = end
    return rest
  }

  /** Whether group `inner` is `outer` or nested in it. */
  private within(inner: string, outer: string) {
    for (let current: string | undefined = inner; current !== undefined; current = this.groupParent.get(current)) {
      if (current === outer) return true
    }
    return false
  }

  /** Record a mention of a node: the first one creates it, and one inside a subgraph may put it there. */
  private mention(id: string) {
    let node = this.parsed.get(id)
    if (!node) {
      this.see(id)
      node = { line: this.lineIndex + 1 }
      this.parsed.set(id, node)
    }
    const group = this.open.at(-1)
    if (group === undefined) return node
    const current = this.groupOf.get(id)
    if (current === undefined || this.within(group, current)) this.groupOf.set(id, group)
    else if (!this.within(current, group)) {
      this.warn('group-member', `Node ${id} is in subgraph ${current} and stays there, not in ${group}`, id, this.lineIndex + 1)
    }
    return node
  }

  /** Read quoted or unquoted text up to one of the closers; returns the raw text and the closer that ended it. */
  private readDelimited(enders: readonly (readonly [string, string])[]) {
    const start = this.pos
    const expected = () => enders.map(([token]) => token).join(' or ')
    if (this.source[this.pos] === '"') {
      const close = this.quoteEnd()
      const raw = this.source.slice(this.pos + 1, close)
      this.pos = close + 1
      this.skipSpace()
      const ender = enders.find(([token]) => this.source.startsWith(token, this.pos))
      if (!ender) this.fail(`expected ${expected()} after the quoted text`)
      this.pos += ender[0].length
      return { raw, name: ender[1] }
    }
    let best: { index: number; ender: readonly [string, string] } | undefined
    for (const ender of enders) {
      const index = this.source.indexOf(ender[0], this.pos)
      if (index >= 0 && (!best || index < best.index)) best = { index, ender }
    }
    if (!best) this.fail(`expected ${expected()}`, start)
    this.pos = best.index + best.ender[0].length
    return { raw: this.source.slice(start, best.index).trim(), name: best.ender[1] }
  }

  /** Read `@{ key: value, … }` after a node ID. */
  private readProperties() {
    const start = this.pos
    this.pos += 2
    const properties = new Map<string, string>()
    for (;;) {
      while (this.pos < this.source.length && /[\s,]/.test(this.source[this.pos]!)) this.pos++
      if (this.pos >= this.source.length) this.fail('unterminated @{ … }', start)
      if (this.source[this.pos] === '}') {
        this.pos++
        return properties
      }
      const key = /([A-Za-z][\w-]*)\s*:\s*/y
      key.lastIndex = this.pos
      const match = key.exec(this.source)
      if (!match) this.fail('expected a property name in @{ … }')
      this.pos = key.lastIndex
      let value: string
      if (this.source[this.pos] === '"') {
        const close = this.quoteEnd()
        value = this.source.slice(this.pos + 1, close)
        this.pos = close + 1
      } else {
        const end = /[,}]/g
        end.lastIndex = this.pos
        const found = end.exec(this.source)
        if (!found) this.fail('unterminated @{ … }', start)
        value = this.source.slice(this.pos, found.index).trim()
        this.pos = found.index
      }
      properties.set(match[1]!, value)
    }
  }

  /** A node ID with an optional shape and text (delimiters or `@{ … }`) and `:::class`; returns the ID. */
  private readNode() {
    nodeIdPattern.lastIndex = this.pos
    const match = nodeIdPattern.exec(this.source)
    if (!match) this.fail('expected a node ID')
    const id = this.decodeId(match[0])
    this.pos = nodeIdPattern.lastIndex
    const node = this.mention(id)
    let raw: string | undefined, shape: string | undefined
    if (this.source.startsWith('@{', this.pos)) {
      const properties = this.readProperties()
      if (properties.has('shape')) shape = properties.get('shape')!
      if (properties.has('label')) raw = properties.get('label')!
      for (const key of properties.keys()) {
        if (key !== 'shape' && key !== 'label') this.warn('unsupported-statement', `The node property ${key} was ignored`, id, this.lineIndex + 1)
      }
      if (shape !== undefined || raw !== undefined) shape ??= node.shape ?? 'box'
    } else {
      const token = shapeTokens.find(({ open }) => this.source.startsWith(open, this.pos))
      if (token) {
        this.pos += token.open.length
        const text = this.readDelimited(token.closers)
        raw = text.raw
        shape = text.name
      }
    }
    if (shape !== undefined) {
      node.shape = shape
      node.line = this.lineIndex + 1
      if (raw !== undefined) {
        const { label, detail } = readNodeText(raw)
        node.label = label
        node.detail = detail
      }
    }
    classSuffix.lastIndex = this.pos
    if (classSuffix.exec(this.source)) {
      this.warn('unsupported-statement', 'The class assignment ' + this.source.slice(this.pos, classSuffix.lastIndex) + ' was ignored', id, this.lineIndex + 1)
      this.pos = classSuffix.lastIndex
    }
    return id
  }

  /** Nodes joined by `&`. */
  private readNodeList() {
    const ids = [this.readNode()]
    for (;;) {
      this.skipSpace()
      if (this.source[this.pos] !== '&') return ids
      this.pos++
      this.skipSpace()
      ids.push(this.readNode())
    }
  }

  /** A link with its `id@`, its `-- text -->` or `|text|` label; undefined when no link starts at the cursor. */
  private readLink(): Link | undefined {
    let id: string | undefined
    edgeIdPattern.lastIndex = this.pos
    const named = edgeIdPattern.exec(this.source)
    if (named) {
      id = this.decodeId(named[1]!)
      this.pos = edgeIdPattern.lastIndex
    }
    const link = this.readArrow() ?? this.readTextArrow()
    if (!link) {
      if (id !== undefined) this.fail('expected a link after the edge ID')
      return undefined
    }
    this.skipSpace()
    if (this.source[this.pos] === '|') link.label = this.readPipeLabel()
    if (id !== undefined) link.id = id
    return link
  }

  /** A link without text (`-->`, `---`, `-.->`, `==>`, `~~~`, …); the cursor stays when there is none. */
  private readArrow(): Link | undefined {
    plainLink.lastIndex = this.pos
    const plain = plainLink.exec(this.source)
    if (!plain) return undefined
    const body = plain[2]!
    // `--` and `==` without an end open a link with text, read by `readTextArrow`.
    if ((body === '--' || body === '==') && plain[3] === undefined) return undefined
    this.pos = plainLink.lastIndex
    return { start: markerOf(plain[1]), end: markerOf(plain[3]), invisible: body[0] === '~' }
  }

  /** A link with text inside it (`-- text -->`, `== text ==>`, `-. text .->`). */
  private readTextArrow(): Link | undefined {
    const start = this.pos
    linkOpener.lastIndex = this.pos
    const opener = linkOpener.exec(this.source)
    if (!opener) return undefined
    this.pos = linkOpener.lastIndex
    this.skipSpace()
    let label: string | undefined
    let searchFrom = this.pos
    if (this.source[this.pos] === '"') {
      const close = this.quoteEnd()
      label = this.source.slice(this.pos + 1, close)
      searchFrom = close + 1
    }
    const closer = closers[opener[2]!]!
    closer.lastIndex = searchFrom
    let found: RegExpExecArray | null
    for (;;) {
      found = closer.exec(this.source)
      if (!found) this.fail('unterminated link text', start)
      if (opener[2] === '-.' || found[2] !== undefined || found[1]!.length >= 3) break
    }
    if (label === undefined) label = this.source.slice(this.pos, found.index).trim()
    else if (this.source.slice(searchFrom, found.index).trim() !== '') this.fail('unexpected text after the quoted link text', searchFrom)
    this.pos = closer.lastIndex
    return { start: markerOf(opener[1]), end: markerOf(found[2]), label: decodeMermaidText(label), invisible: false }
  }

  /** The `|text|` label after a link; the cursor is at the first `|`. */
  private readPipeLabel() {
    this.pos++
    let raw: string
    if (this.source[this.pos] === '"') {
      const close = this.quoteEnd()
      raw = this.source.slice(this.pos + 1, close)
      this.pos = close + 1
      this.skipSpace()
      if (this.source[this.pos] !== '|') this.fail('expected | after the link text')
      this.pos++
    } else {
      const close = this.source.indexOf('|', this.pos)
      if (close < 0) this.fail('unterminated |link text|')
      raw = this.source.slice(this.pos, close).trim()
      this.pos = close + 1
    }
    return decodeMermaidText(raw.replace(lineBreak, '\n'))
  }

  /** A statement of nodes and links: `a --> b`, chains (`a --> b --> c`) and `&` lists (`a & b --> c`). */
  private readChain() {
    let current = this.readNodeList()
    for (;;) {
      this.skipSpace()
      if (this.pos >= this.source.length || this.source[this.pos] === ';' || this.source.startsWith('%%', this.pos)) return
      const link = this.readLink()
      if (!link) this.fail('expected a link, & or the end of the statement')
      this.skipSpace()
      const next = this.readNodeList()
      if (link.invisible) {
        this.warn('unsupported-statement', 'An invisible link (~~~) was ignored', undefined, this.lineIndex + 1)
      } else {
        // `a & b --> c & d` expands to every pair. Check the count before expanding, so a few `&` lists cannot build an
        // edge list far beyond maxItems before the collector rejects it.
        if (this.edges.length + current.length * next.length + this.seenIds.size > this.maxItems) throw this.tooMany()
        for (const from of current) for (const to of next) this.edges.push({ from, to, link, line: this.lineIndex + 1 })
      }
      current = next
    }
  }
}

/** Hand what a reader read to the collector: groups first, so a node or edge that names a subgraph is reported against it. */
function collectFlowchart(reader: FlowchartReader, collector: GraphCollector) {
  for (const group of reader.groups) collector.addGroup(group, group.line)
  for (const [id, node] of reader.parsed) {
    if (collector.groups.has(id) && node.shape === undefined) continue
    const shape: NetworkNodeShape = node.shape === undefined ? 'box' : readGraphShape(node.shape, collector.warn, id, node.line)
    const item: NetworkNode = {
      id,
      label: node.label ?? id,
      ...(node.detail === undefined ? {} : { detail: node.detail }),
      ...(shape === 'box' ? {} : { shape }),
    }
    if (!collector.addNode(item, node.line)) continue
    const group = reader.groupOf.get(id)
    if (group !== undefined && collector.groups.has(group)) collector.addMember(group, id, node.line)
  }
  for (const { from, to, link, line } of reader.edges) {
    const edge: Omit<GraphEdge, 'id'> & { id?: string } = {
      ...(link.id === undefined ? {} : { id: link.id }),
      from, to,
      ...(link.label === undefined || link.label === '' ? {} : { label: link.label }),
      ...(link.end === 'arrow' ? {} : { markerEnd: link.end }),
      ...(link.start === 'none' ? {} : { markerStart: link.start }),
    }
    collector.addEdge(edge, line)
  }
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
  const reader = new FlowchartReader(stripBom(text).split(/\r\n|\n|\r/), collector.warn, options.maxItems ?? 100_000)
  const direction = reader.readHeader()
  reader.readStatements()
  collectFlowchart(reader, collector)
  return collector.finish(direction)
}
