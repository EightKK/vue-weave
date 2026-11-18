import { indexGraph, type GraphEdge, type GraphEdgeMarker, type GraphLayout } from './graph.js'
import { graphEdgeMarker, graphMarkerDrawing, graphOutlineElement, graphOutlineShape, graphOutlineText } from './graphShapes.js'
import { graphPathBounds } from './graphView.js'
import { assertGraphSwimlaneBands, type GraphSwimlaneBand } from './graphSwimlanes.js'
import { assertGraphEdgeBands, graphBandOrder, type GraphEdgeBand } from './graphFlow.js'
import {
  createTimelineRowTree, dependencyPath, dependencyTimes, formatDependencyLag, intersectsWindow, mirrorTimeScale, resourceLoadHistogram,
  summarizeTimelineRows, timeTicks, timelineBaselineId, validateTimelineData, type DependencyPathStyle, type TimeRange, type TimeScale,
} from './timeline.js'
import { timelineConstraintKinds, timelineConstraintViolated } from './timeline.js'
import type {
  ChartTone, NetworkNode, TimelineBand, TimelineBar, TimelineColumn, TimelineDependency, TimelineLoadRow, TimelineLoadSegment,
  TimelineMarker, TimelineMarkerRange, TimelineRow,
} from './types.js'
import type { TimelineConstraintKind } from './types.js'
import { checkMarkerRanges, checkNonWorkingPeriods, lagLabelPoint, progressLinePoints, progressLineTime, segmentPieces } from './barSegments.js'
import { baselineLayout, baselineSelection, baselineStrips } from './barSegments.js'

/** Colours of one tone, matching the `--vw-<tone>-*` custom properties. */
export interface SvgToneColors {
  ink: string
  line: string
  pale: string
  solid: string
}

/** Colours used by the SVG exporters. Each field mirrors a `--vw-*` custom property. */
export interface SvgExportTheme {
  surface: string
  surfaceMuted: string
  text: string
  muted: string
  border: string
  grid: string
  edge: string
  accent: string
  onSolid: string
  /** Text colour on marker and now-flag labels. */
  markerInk: string
  /** The single baseline, and the first slot when several baseline sets are drawn (`--vw-baseline`). */
  baseline: string
  /** The second baseline slot (`--vw-baseline-2`). Defaults to `defaultSvgExportTheme.baseline2`. */
  baseline2?: string
  /** The third baseline slot (`--vw-baseline-3`). Defaults to `defaultSvgExportTheme.baseline3`. */
  baseline3?: string
  marker: string
  now: string
  load: string
  loadOverload: string
  loadCapacity: string
  dependencyHighlight: string
  /** Non-working time shading (`--vw-non-working`). Optional for compatibility; defaults to `defaultSvgExportTheme.nonWorking`. */
  nonWorking?: string
  /** Outline of critical bars (`--vw-critical`). Defaults to `defaultSvgExportTheme.critical`. */
  critical?: string
  /** Float lines (`--vw-float`). Defaults to `defaultSvgExportTheme.float`. */
  float?: string
  /** Deadline indicators and the late outline (`--vw-deadline`). Defaults to `defaultSvgExportTheme.deadline`. */
  deadline?: string
  /** Status-date line and progress line (`--vw-status`). Defaults to `defaultSvgExportTheme.status`. */
  status?: string
  /** Scheduling constraint markers (`--vw-constraint`). Defaults to `defaultSvgExportTheme.constraint`. */
  constraint?: string
  /** Violated constraint markers (`--vw-constraint-violated`). Defaults to `defaultSvgExportTheme.constraintViolated`. */
  constraintViolated?: string
  /** Fill of marker ranges without a tone (`--vw-range`). Defaults to `defaultSvgExportTheme.range`. */
  range?: string
  /** Label text of marker ranges without a tone (`--vw-range-ink`). Defaults to `defaultSvgExportTheme.rangeInk`. */
  rangeInk?: string
  /** Edge line of marker range labels without a tone (`--vw-range-line`). Defaults to `defaultSvgExportTheme.rangeLine`. */
  rangeLine?: string
  tones: Record<ChartTone, SvgToneColors>
}

/** A partial theme; omitted colours fall back to `defaultSvgExportTheme`. */
export type SvgExportThemeInput = Partial<Omit<SvgExportTheme, 'tones'>> & {
  tones?: Partial<Record<ChartTone, Partial<SvgToneColors>>>
}

/** The stylesheet's fallback colours. */
export const defaultSvgExportTheme: Readonly<Required<SvgExportTheme>> = Object.freeze({
  surface: '#ffffff', surfaceMuted: '#f6f9fb', text: '#172c3b', muted: '#4c6371', border: '#d8e2e9', grid: '#d9e4eb',
  edge: '#76929f', accent: '#245e96', onSolid: '#ffffff', markerInk: '#ffffff', baseline: '#718497', marker: '#a74f08', now: '#c23b22',
  load: '#6b96c5', loadOverload: '#b4441c', loadCapacity: '#31495b', dependencyHighlight: '#a74f08',
  nonWorking: '#eaeff3', critical: '#b42318', float: '#5b7083', deadline: '#a74f08', status: '#1f7a4d',
  baseline2: '#9a4c95', baseline3: '#23806f', constraint: '#a1246e', constraintViolated: '#c4161c',
  range: '#f9efdc', rangeInk: '#764908', rangeLine: '#b58848',
  tones: {
    teal: { ink: '#115e58', line: '#5d9c93', pale: '#e1f2ee', solid: '#2b756b' },
    blue: { ink: '#1d4d84', line: '#6b96c5', pale: '#e6effa', solid: '#29609a' },
    amber: { ink: '#764908', line: '#b58848', pale: '#f9efdc', solid: '#825411' },
    violet: { ink: '#523b78', line: '#9983ba', pale: '#efe7f8', solid: '#624888' },
  },
})

/** Options shared by the SVG exporters. */
export interface SvgExportOptions {
  /** Colours; omitted values use `defaultSvgExportTheme`. */
  theme?: SvgExportThemeInput
  /** CSS font-family list written on the root element. */
  fontFamily?: string
  /** Document title, written as `<title>` and the accessible name. */
  title?: string
  /** Paint an opaque background. Default true. */
  background?: boolean
  /** Prefix for the IDs of markers and clip paths, so several exports can be inlined in one page. Default `vw-export`. */
  idPrefix?: string
  /** Text direction of labels. For timelines, `rtl` also mirrors the time axis and places row headings on the right. */
  direction?: 'ltr' | 'rtl'
}

const tones: readonly ChartTone[] = ['teal', 'blue', 'amber', 'violet']
const defaultFont = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
// Characters that XML 1.0 forbids, and unpaired surrogates.
const invalidXml = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g
const entities: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', '\'': '&apos;' }

/** Escape text for XML content and attribute values and drop characters that XML 1.0 does not allow. */
export function escapeXml(value: string): string {
  return String(value).replace(invalidXml, '').replace(/[&<>"']/g, char => entities[char]!)
}

function num(value: number) {
  if (!Number.isFinite(value)) throw new RangeError('SVG export produced a non-finite coordinate')
  const rounded = Math.round(value * 1000) / 1000
  return String(rounded === 0 ? 0 : rounded)
}

const round = (value: number) => Number(num(value))

type Attributes = Record<string, string | number | undefined>
function tag(name: string, attributes: Attributes, content?: string) {
  let out = '<' + name
  for (const key in attributes) {
    const value = attributes[key]
    if (value === undefined) continue
    out += ' ' + key + '="' + (typeof value === 'number' ? num(value) : escapeXml(value)) + '"'
  }
  return content === undefined ? out + '/>' : out + '>' + content + '</' + name + '>'
}

function resolveTheme(input: SvgExportThemeInput = {}): Required<SvgExportTheme> {
  const { tones: toneInput, ...rest } = input
  const theme: Required<SvgExportTheme> = { ...defaultSvgExportTheme, tones: { ...defaultSvgExportTheme.tones } }
  for (const [key, value] of Object.entries(rest)) {
    if (value === undefined) continue
    if (typeof value !== 'string' || !Object.hasOwn(defaultSvgExportTheme, key)) throw new Error('Invalid export theme colour: ' + key)
    if (value.trim()) (theme as unknown as Record<string, string>)[key] = value.trim()
  }
  for (const tone of tones) {
    const custom = toneInput?.[tone]
    if (!custom) continue
    const merged = { ...theme.tones[tone] }
    for (const part of ['ink', 'line', 'pale', 'solid'] as const) {
      const value = custom[part]
      if (value !== undefined && typeof value !== 'string') throw new Error('Invalid export theme colour: ' + tone + '.' + part)
      if (value?.trim()) merged[part] = value.trim()
    }
    theme.tones[tone] = merged
  }
  return theme
}

/** The colours of a tone, or of blue for a missing or unknown tone (including inherited names such as `constructor`). */
function toneColors(theme: Required<SvgExportTheme>, tone: string | undefined) {
  return tone !== undefined && Object.hasOwn(theme.tones, tone) ? theme.tones[tone as keyof typeof theme.tones] : theme.tones.blue
}

function common(options: SvgExportOptions) {
  const prefix = options.idPrefix ?? 'vw-export'
  if (!/^[A-Za-z_][\w.-]*$/.test(prefix)) throw new Error('idPrefix must start with a letter or underscore and contain only letters, digits, _, . and -')
  if (options.direction !== undefined && options.direction !== 'ltr' && options.direction !== 'rtl') {
    throw new Error('direction must be ltr or rtl')
  }
  return {
    prefix, theme: resolveTheme(options.theme), rtl: options.direction === 'rtl',
    font: options.fontFamily?.trim() || defaultFont, background: options.background !== false,
  }
}

function svgDocument(width: number, height: number, options: SvgExportOptions, font: string, defs: string, body: string) {
  if (!(width > 0) || !(height > 0)) throw new RangeError('The exported image must have a positive size')
  const title = options.title
  return tag('svg', {
    xmlns: 'http://www.w3.org/2000/svg', width, height, viewBox: `0 0 ${num(width)} ${num(height)}`,
    'font-family': font, role: 'img', 'aria-label': title || undefined,
  }, (title ? tag('title', {}, escapeXml(title)) : '') + (defs ? '<defs>' + defs + '</defs>' : '') + body)
}

/**
 * A text run clipped to a box. `inset` is measured from the inline start edge of the box; a `centred` line is centred
 * in the box instead.
 */
function clippedText(
  box: { x: number; y: number; width: number; height: number }, rtl: boolean,
  lines: readonly { text: string; y: number; size: number; fill: string; weight?: number; inset?: number; halo?: string; centred?: boolean }[],
) {
  if (box.width <= 0 || box.height <= 0) return ''
  const content = lines.filter(line => line.text !== '').map(line => {
    const inset = line.inset ?? 0
    return tag('text', {
      x: line.centred ? box.width / 2 : rtl ? box.width - inset : inset, y: line.y, 'text-anchor': line.centred ? 'middle' : undefined,
      'font-size': line.size, 'font-weight': line.weight, fill: line.fill,
      direction: rtl ? 'rtl' : undefined, 'unicode-bidi': rtl ? 'embed' : undefined,
      stroke: line.halo, 'stroke-width': line.halo ? 3 : undefined, 'stroke-linejoin': line.halo ? 'round' : undefined,
      'paint-order': line.halo ? 'stroke' : undefined,
    }, escapeXml(line.text))
  }).join('')
  if (!content) return ''
  return tag('svg', { x: box.x, y: box.y, width: box.width, height: box.height, overflow: 'hidden' }, content)
}

/** A group rectangle in layout coordinates, for example the groups NetworkGraph draws. */
export interface GraphSvgGroup {
  id: string
  label: string
  x: number
  y: number
  width: number
  height: number
}

/** `N` and `E` type the nodes and edges that the label callbacks receive. */
export interface GraphSvgOptions<N extends NetworkNode = NetworkNode, E extends GraphEdge = GraphEdge> extends SvgExportOptions {
  /** Group rectangles drawn behind the nodes. */
  groups?: readonly GraphSvgGroup[]
  /**
   * Swimlane bands drawn behind the groups, edges and nodes, each with its title clipped to its header area, for
   * example the `lanes` of a `layoutSwimlaneGraph` result. Throws like NetworkGraph `lanes` for invalid lanes.
   */
  lanes?: readonly GraphSwimlaneBand[]
  /** Node IDs drawn in the selected style. */
  selectedIds?: Iterable<string>
  /** Node IDs whose box gets the highlight outline, like NetworkGraph `highlightedNodeIds`. Unknown IDs are ignored. */
  highlightedNodeIds?: Iterable<string>
  /** Edge IDs drawn as highlighted edges, like NetworkGraph `highlightedEdgeIds`. Unknown IDs are ignored. */
  highlightedEdgeIds?: Iterable<string>
  /** Colour of highlighted nodes and edges. Defaults to the theme's `dependencyHighlight`. */
  highlightColor?: string
  /** Margin around the content, in pixels. Default 16. */
  padding?: number
  /** Node title text. Defaults to `node.label`. */
  nodeLabel?: (node: N) => string
  /** Node detail text. Defaults to `node.detail`. */
  nodeDetail?: (node: N) => string | undefined
  /** Edge label text. Defaults to `edge.label`. */
  edgeLabel?: (edge: E) => string | undefined
  /**
   * Edges drawn as bands with real width, like the NetworkGraph `edgeBands` prop (for example `graphFlowBands` of a
   * `layoutFlowGraph` result): a translucent stroke of the band width without markers, dashed for a reference band,
   * with the band label as its `<title>`. Bands are drawn widest first, before the other edges, so thin bands stay
   * visible. Unknown IDs are ignored. Throws RangeError for a width that is not finite and at least 0.
   */
  edgeBands?: ReadonlyMap<string, GraphEdgeBand>
}

/**
 * Build a standalone SVG document of a whole graph with the default node rendering. Every node, edge, label and
 * group is included regardless of any camera or culling. Node shapes and edge markers are drawn like NetworkGraph draws
 * them; hollow markers are filled with the theme's `surfaceMuted`, and animated edges are dashed without motion. Throws
 * RangeError for an unknown edge marker. Runs without a DOM.
 */
export function renderGraphSvg<N extends NetworkNode, E extends GraphEdge>(
  layout: GraphLayout, nodes: readonly N[], edges: readonly E[], options: GraphSvgOptions<N, E> = {},
): string {
  indexGraph(nodes, edges)
  const { prefix, theme, rtl, font, background } = common(options)
  const padding = options.padding ?? 16
  if (!Number.isFinite(padding) || padding < 0) throw new RangeError('padding must be finite and nonnegative')
  if (!Number.isFinite(layout.width) || !Number.isFinite(layout.height) || layout.width < 0 || layout.height < 0) {
    throw new RangeError('The layout must have finite nonnegative dimensions')
  }
  let left = 0, top = 0, right = layout.width, bottom = layout.height
  const include = (x: number, y: number, width = 0, height = 0) => {
    left = Math.min(left, x)
    top = Math.min(top, y)
    right = Math.max(right, x + width)
    bottom = Math.max(bottom, y + height)
  }
  for (const node of nodes) {
    const box = layout.boxes.get(node.id)
    if (!box || ![box.x, box.y, box.width, box.height].every(Number.isFinite) || box.width <= 0 || box.height <= 0) {
      throw new RangeError('Missing or invalid layout box: ' + node.id)
    }
    include(box.x, box.y, box.width, box.height)
  }
  const edgeText = options.edgeLabel ?? ((edge: GraphEdge) => edge.label)
  const bands = options.edgeBands
  if (bands) assertGraphEdgeBands(bands, 'renderGraphSvg')
  for (const edge of edges) {
    const path = layout.paths.get(edge.id)
    if (path === undefined) throw new Error('Missing layout path: ' + edge.id)
    const bounds = graphPathBounds(path)
    const half = (bands?.get(edge.id)?.width ?? 0) / 2
    if (bounds) include(bounds.x - half, bounds.y - half, bounds.width + 2 * half, bounds.height + 2 * half)
    const label = layout.edgeLabels.get(edge.id)
    if (label && edgeText(edge)) include(label.x - 60, label.y - 14, 120, 20)
  }
  const groupIds = new Set<string>()
  for (const group of options.groups ?? []) {
    if (!group.id || groupIds.has(group.id)) throw new Error('Invalid or duplicate export group: ' + group.id)
    if (![group.x, group.y, group.width, group.height].every(Number.isFinite) || group.width < 0 || group.height < 0) {
      throw new RangeError('Invalid export group geometry: ' + group.id)
    }
    groupIds.add(group.id)
    include(group.x, group.y, group.width, group.height)
  }
  if (options.lanes !== undefined) {
    assertGraphSwimlaneBands(options.lanes, 'renderGraphSvg')
    for (const lane of options.lanes) include(lane.x, lane.y, lane.width, lane.height)
  }
  const width = right - left + 2 * padding, height = bottom - top + 2 * padding
  const selected = new Set(options.selectedIds ?? [])
  const highlightedNodes = new Set(options.highlightedNodeIds ?? [])
  const highlightedEdges = new Set(options.highlightedEdgeIds ?? [])
  if (options.highlightColor !== undefined && (typeof options.highlightColor !== 'string' || !options.highlightColor.trim())) {
    throw new Error('Invalid export highlight colour')
  }
  const highlight = options.highlightColor?.trim() || theme.dependencyHighlight
  const nodeLabel = options.nodeLabel ?? ((node: N) => node.label)
  const nodeDetail = options.nodeDetail ?? ((node: N) => node.detail)
  const arrow = prefix + '-arrow', arrowHighlight = prefix + '-arrow-highlight'
  // The highlight marker is only written when a drawn edge uses it, so an export without highlights is unchanged.
  const anyHighlightedEdge = edges.some(edge => highlightedEdges.has(edge.id) && !bands?.has(edge.id))
  // Other markers, and start markers, are also only written when an edge uses them.
  type Marker = Exclude<GraphEdgeMarker, 'none'>
  const markerId = (kind: Marker, end: 'start' | 'end', strong: boolean) => kind === 'arrow' && end === 'end'
    ? strong ? arrowHighlight : arrow
    : prefix + (end === 'start' ? '-start-' : '-') + kind + (strong ? '-highlight' : '')
  const markers = new Map<string, { kind: Marker; end: 'start' | 'end'; strong: boolean }>()
  for (const edge of edges) {
    if (bands?.has(edge.id)) continue
    const strong = highlightedEdges.has(edge.id)
    for (const end of ['start', 'end'] as const) {
      const kind = graphEdgeMarker(edge, end)
      if (kind !== 'none' && (kind !== 'arrow' || end === 'start')) markers.set(markerId(kind, end, strong), { kind, end, strong })
    }
  }
  const markerTag = (id: string, kind: Marker, end: 'start' | 'end', color: string) => {
    const { refX, paint, strokeWidth, element } = graphMarkerDrawing(kind)
    const colors = paint === 'fill' ? { fill: color } : {
      fill: paint === 'hollow' ? theme.surfaceMuted : 'none', stroke: color, 'stroke-width': strokeWidth,
      'stroke-linecap': 'round', 'stroke-linejoin': 'round',
    }
    return tag('marker', { id, markerWidth: 7, markerHeight: 7, refX, refY: 3.5, orient: end === 'start' ? 'auto-start-reverse' : 'auto' },
      element.tag === 'path' ? tag('path', { d: element.d, ...colors }) : tag('circle', { cx: element.cx, cy: element.cy, r: element.r, ...colors }))
  }
  const defs = tag('marker', { id: arrow, markerWidth: 7, markerHeight: 7, refX: 6, refY: 3.5, orient: 'auto' },
    tag('path', { d: 'M 0 0 L 7 3.5 L 0 7 z', fill: theme.edge }))
    + (anyHighlightedEdge ? tag('marker', { id: arrowHighlight, markerWidth: 7, markerHeight: 7, refX: 6, refY: 3.5, orient: 'auto' },
      tag('path', { d: 'M 0 0 L 7 3.5 L 0 7 z', fill: highlight })) : '')
    + [...markers].map(([id, { kind, end, strong }]) => markerTag(id, kind, end, strong ? highlight : theme.edge)).join('')
  const parts: string[] = []
  if (background) parts.push(tag('rect', { width, height, fill: theme.surfaceMuted }))
  const content: string[] = []
  // Lanes: alternating band fills, a header with a solid border and the title clipped to the header.
  options.lanes?.forEach((lane, index) => {
    const { header } = lane
    content.push(tag('g', { class: 'vw-swimlane' }, tag('title', {}, escapeXml(lane.label)) + tag('rect', {
      x: lane.x, y: lane.y, width: lane.width, height: lane.height,
      fill: index % 2 ? theme.surfaceMuted : theme.surface, stroke: theme.border,
    }) + (header.width > 0 && header.height > 0 ? tag('rect', {
      x: header.x, y: header.y, width: header.width, height: header.height, fill: theme.surfaceMuted, stroke: theme.border, 'stroke-width': 1.5,
    }) : '') + clippedText(header, rtl, [{ text: lane.label, y: Math.min(header.height / 2, 14) + 4, size: 12, weight: 700, fill: theme.text, inset: 8 }])))
  })
  for (const group of options.groups ?? []) {
    content.push(tag('g', {}, tag('rect', {
      x: group.x, y: group.y, width: group.width, height: group.height, rx: 10,
      fill: theme.surfaceMuted, 'fill-opacity': 0.7, stroke: theme.border, 'stroke-dasharray': '4 3',
    }) + tag('text', {
      x: rtl ? group.x + group.width - 8 : group.x + 8, y: group.y + 15, 'font-size': 10, fill: theme.text,
      direction: rtl ? 'rtl' : undefined, 'unicode-bidi': rtl ? 'embed' : undefined,
    }, escapeXml(group.label))))
  }
  for (const edge of bands ? graphBandOrder(edges, bands) : edges) {
    const strong = highlightedEdges.has(edge.id)
    const band = bands?.get(edge.id)
    if (band) {
      content.push(tag('path', {
        class: band.reference ? 'vw-flow-band vw-is-reference' : 'vw-flow-band', d: layout.paths.get(edge.id)!, fill: 'none',
        stroke: strong ? highlight : theme.edge, 'stroke-width': band.width,
        'stroke-opacity': band.reference ? 0.35 : strong ? 0.7 : 0.5, 'stroke-dasharray': band.reference ? '10 6' : undefined,
      }, band.label ? tag('title', {}, escapeXml(band.label)) : undefined))
      continue
    }
    const start = graphEdgeMarker(edge, 'start'), end = graphEdgeMarker(edge, 'end')
    content.push(tag('path', {
      d: layout.paths.get(edge.id)!, fill: 'none', stroke: strong ? highlight : theme.edge, 'stroke-width': strong ? 2.6 : 1.65,
      'stroke-dasharray': edge.animated ? '6 4' : undefined,
      'marker-start': start === 'none' ? undefined : `url(#${markerId(start, 'start', strong)})`,
      'marker-end': end === 'none' ? undefined : `url(#${markerId(end, 'end', strong)})`,
    }))
  }
  for (const edge of edges) {
    const label = layout.edgeLabels.get(edge.id)
    const text = edgeText(edge)
    if (!label || !text) continue
    content.push(tag('text', {
      x: label.x, y: label.y, 'font-size': 11, 'text-anchor': 'middle', fill: theme.text, stroke: theme.surfaceMuted,
      'stroke-width': 4, 'stroke-linejoin': 'round', 'paint-order': 'stroke',
      direction: rtl ? 'rtl' : undefined, 'unicode-bidi': rtl ? 'embed' : undefined,
    }, escapeXml(text)))
  }
  for (const node of nodes) {
    const box = layout.boxes.get(node.id)!
    const colors = toneColors(theme, node.tone)
    const active = selected.has(node.id)
    const label = nodeLabel(node), detail = nodeDetail(node)
    const ink = active ? theme.onSolid : colors.ink
    const strong = highlightedNodes.has(node.id)
    const paint = {
      fill: active ? colors.solid : colors.pale, stroke: strong ? highlight : active ? colors.ink : colors.line,
      'stroke-width': strong ? 3 : active ? 2.8 : 1.25,
    }
    // Diamonds, ellipses and hexagons are drawn inside the box, with centred text.
    const outline = graphOutlineShape(node)
    let shape: string, lines: { title: number; detail: number; inset: number; centred?: boolean }
    if (outline) {
      const element = graphOutlineElement(outline, box.width, box.height)
      const anchors = graphOutlineText(box.width, box.height, Boolean(detail))
      shape = element.tag === 'ellipse'
        ? tag('ellipse', { cx: element.cx, cy: element.cy, rx: element.rx, ry: element.ry, ...paint })
        : tag('polygon', { points: element.points.map(point => num(point.x) + ',' + num(point.y)).join(' '), ...paint, 'stroke-linejoin': 'round' })
      lines = { title: anchors.title, detail: anchors.detail, inset: 0, centred: true }
    } else {
      shape = tag('rect', {
        x: 2, y: 2, width: Math.max(0, box.width - 4), height: Math.max(0, box.height - 4), rx: node.shape === 'rounded' ? 19 : 8, ...paint,
      })
      lines = { title: detail ? 24 : 34, detail: 43, inset: 13 }
    }
    const text = clippedText({ x: 0, y: 0, width: box.width, height: box.height }, rtl, [
      { text: label, y: lines.title, size: 15.5, weight: 700, fill: ink, inset: lines.inset, centred: lines.centred },
      { text: detail ?? '', y: lines.detail, size: 12, weight: 550, fill: ink, inset: lines.inset, centred: lines.centred },
    ])
    content.push(tag('g', { transform: `translate(${num(box.x)} ${num(box.y)})` },
      tag('title', {}, escapeXml([label, detail].filter(Boolean).join(' ')))
      + tag('svg', { width: box.width, height: box.height, overflow: 'hidden' }, shape + text)))
  }
  parts.push(tag('g', { transform: `translate(${num(padding - left)} ${num(padding - top)})` }, content.join('')))
  return svgDocument(width, height, options, font, defs, parts.join(''))
}

/** `R` and `B` type the rows and bars that `columns`, `rowLabel` and `barLabel` receive. */
export interface TimelineSvgOptions<R extends TimelineRow = TimelineRow, B extends TimelineBar = TimelineBar> extends SvgExportOptions {
  /** Collapsed parent rows; their descendants and the descendants' bars are omitted. */
  collapsedIds?: Iterable<string>
  /** Export only this time window. Defaults to the whole scale, from `toTime(0)` to `toTime(width)`. */
  timeRange?: TimeRange
  /** Export only displayed rows `start` (inclusive) to `end` (exclusive), counted after collapsing. */
  rowRange?: { start: number; end: number }
  /** Default 66. At least 8 + laneCount × 14. */
  rowHeight?: number
  /** Default 1. */
  laneCount?: number
  /** Width of the row heading column in pixels. Default 154. */
  labelWidth?: number
  /** Extra columns after the row heading column. */
  columns?: readonly TimelineColumn<R>[]
  /** Draw rollup bars on parent rows without bars of their own. */
  showSummaries?: boolean
  /**
   * As GanttChart `summaryDependencies`: a dependency end may name a summary row instead of a bar. Such an end joins
   * the start or finish edge of the row's rollup bar, so it is drawn only with `showSummaries` and when the row has a
   * rollup (descendant bars and no bar of its own); otherwise the dependency is left out. Default false.
   */
  summaryDependencies?: boolean
  headerBands?: readonly (readonly TimelineBand[])[]
  markers?: readonly TimelineMarker[]
  /**
   * Highlighted half-open ranges, as GanttChart `markerRanges`: a band across the body (or across `rowIds` only) with
   * its label at the bottom of the header, drawn with its tone or the `range` theme colours at 70% opacity.
   */
  markerRanges?: readonly TimelineMarkerRange[]
  /** Time of a "now" line. */
  now?: number
  /** Tick interval. Defaults to the first of `tickSteps` that is at least 76 px wide. */
  tickStep?: number
  /** Candidate tick intervals. Default 30 minutes to 24 hours in milliseconds. */
  tickSteps?: readonly number[]
  /** Tick alignment. Defaults to the start of the scale. */
  tickAnchor?: number
  /** Tick and tooltip labels. Default UTC HH:mm. */
  formatTime?: (time: number) => string
  /** Text of the label drawn on a dependency with a non-zero `lag`. Default `formatDependencyLag` (signed hours of milliseconds). */
  formatLag?: (lag: number) => string
  /**
   * Baseline sets to draw, in slot order, as GanttChart `baselineIds`: at most `timelineBaselineLimit` unique IDs, with
   * `timelineBaselineId` for `TimelineBar.baseline`. Default: the first three of `timelineBaselineIds(bars)`.
   */
  baselineIds?: readonly string[]
  /** Label of a baseline set in titles. Default "Baseline" for `timelineBaselineId` and the set ID otherwise. */
  baselineLabel?: (id: string) => string
  /** Text of a baseline variance in titles. Default `formatDependencyLag` (signed hours of milliseconds). */
  formatVariance?: (delta: number) => string
  /** Words before the start, finish and duration variances in titles. Defaults "start", "finish" and "duration". */
  varianceLabels?: { start?: string; finish?: string; duration?: string }
  /** Heading of the row column. Default "Rows". */
  rowHeading?: string
  /** Label of the now line. Default "Now". */
  nowLabel?: string
  loadRows?: readonly TimelineLoadRow[]
  loadSegments?: readonly TimelineLoadSegment[]
  /** Default 44. At least 16. */
  loadRowHeight?: number
  highlightedDependencyIds?: Iterable<string>
  /** Shape of the dependency connectors, as GanttChart `dependencyStyle`. Default `orthogonal`. */
  dependencyStyle?: DependencyPathStyle
  /**
   * Bars drawn with the highlight outline and the `vw-is-highlighted` class, as GanttChart `highlightedBarIds`. The
   * outline uses the `dependencyHighlight` theme colour.
   */
  highlightedBarIds?: Iterable<string>
  /** Half-open intervals shaded as non-working time behind the grid, over the task and load rows. May overlap. */
  nonWorkingPeriods?: readonly TimeRange[]
  /** Time of a status-date line. */
  statusDate?: number
  /** Label of the status-date line. Default "Status date". */
  statusDateLabel?: string
  /** With `statusDate`, draw a progress line that kinks to the progress point of each bar that is behind or ahead. */
  showProgressLine?: boolean
  /**
   * Text of each constraint kind in the titles of constraint markers. Defaults "Start no earlier than", "Start no later
   * than", "Finish no earlier than", "Finish no later than" and "Must start on".
   */
  constraintLabels?: Partial<Record<TimelineConstraintKind, string>>
  /** Added to the title of a violated constraint marker. Default "violated". */
  constraintViolatedLabel?: string
  /** Bar label text. Defaults to `bar.label`. */
  barLabel?: (bar: B) => string
  /** Row heading text. Defaults to `row.label`. */
  rowLabel?: (row: R) => string
}

const defaultTickSteps = [1_800_000, 3_600_000, 7_200_000, 14_400_000, 86_400_000]
/** Default text of each constraint kind, as in the GanttChart labels. */
const defaultConstraintLabels: Readonly<Record<TimelineConstraintKind, string>> = Object.freeze({
  startNoEarlierThan: 'Start no earlier than', startNoLaterThan: 'Start no later than',
  finishNoEarlierThan: 'Finish no earlier than', finishNoLaterThan: 'Finish no later than', fixedStart: 'Must start on',
})
const defaultFormat = (time: number) => new Date(time).toISOString().slice(11, 16)
const bandHeight = 26

/**
 * Build a standalone SVG document of a timeline with the default rendering: row headings and columns, header bands
 * and ticks, bars with progress, milestones, baselines, summaries, dependencies, markers, marker ranges, the now line and
 * load rows.
 * Every displayed row is included (collapsed descendants are omitted) unless `rowRange` narrows it. Runs without a DOM.
 */
export function renderTimelineSvg<R extends TimelineRow, B extends TimelineBar>(
  rows: readonly R[], bars: readonly B[], dependencies: readonly TimelineDependency[], scale: TimeScale,
  options: TimelineSvgOptions<R, B> = {},
): string {
  const rowHeight = options.rowHeight ?? 66
  const laneCount = options.laneCount ?? 1
  validateTimelineData(rows, bars, dependencies, laneCount, { summaryDependencies: options.summaryDependencies })
  const { prefix, theme, rtl, font, background } = common(options)
  if (!Number.isFinite(rowHeight) || rowHeight < 8 + laneCount * 14) throw new RangeError('rowHeight is too small for laneCount')
  const labelWidth = options.labelWidth ?? 154
  if (!Number.isFinite(labelWidth) || labelWidth < 0) throw new RangeError('labelWidth must be finite and nonnegative')
  if (!scale || typeof scale.toX !== 'function' || typeof scale.toTime !== 'function') throw new Error('A time scale is required')
  if (!Number.isFinite(scale.width) || scale.width <= 0) throw new RangeError('Invalid time scale width')
  const full = { start: scale.toTime(0), end: scale.toTime(scale.width) }
  const window = options.timeRange ?? full
  if (!Number.isFinite(window.start) || !Number.isFinite(window.end) || window.end <= window.start) {
    throw new RangeError('timeRange must have finite endpoints with start < end')
  }
  const offset = scale.toX(window.start)
  const axisWidth = scale.toX(window.end) - offset
  if (!Number.isFinite(offset) || !Number.isFinite(axisWidth) || axisWidth <= 0) throw new RangeError('The exported time window has no width')

  const columns = options.columns ?? []
  const columnIds = new Set<string>()
  let columnsWidth = 0
  for (const column of columns) {
    if (!column.id || columnIds.has(column.id)) throw new Error('Invalid timeline column: ' + column.id)
    if (!Number.isFinite(column.width) || column.width <= 0) throw new RangeError('Invalid timeline column width: ' + column.id)
    columnIds.add(column.id)
    columnsWidth += column.width
  }

  const tree = createTimelineRowTree(rows)
  const collapsed = new Set(options.collapsedIds ?? [])
  const displayed: typeof tree = []
  for (let index = 0; index < tree.length;) {
    const item = tree[index]!
    displayed.push(item)
    index = collapsed.has(item.row.id) ? item.afterSubtree : index + 1
  }
  const rowRange = options.rowRange ?? { start: 0, end: displayed.length }
  if (!Number.isInteger(rowRange.start) || !Number.isInteger(rowRange.end) || rowRange.start < 0
    || rowRange.end < rowRange.start || rowRange.end > displayed.length) {
    throw new RangeError(`rowRange must be integers with 0 <= start <= end <= ${displayed.length} (the displayed row count)`)
  }
  const shown = displayed.slice(rowRange.start, rowRange.end)
  const rowIndex = new Map(shown.map((item, index) => [item.row.id, index]))
  const summaries = options.showSummaries || columns.length ? summarizeTimelineRows(tree, bars) : undefined

  const loadRowHeight = options.loadRowHeight ?? 44
  let histogram: ReturnType<typeof resourceLoadHistogram> | undefined
  const loadRows = options.loadRows ?? []
  if (loadRows.length) {
    const ids = new Set<string>()
    for (const row of loadRows) {
      if (!row.id || ids.has(row.id)) throw new Error('Invalid or duplicate load row ID: ' + row.id)
      ids.add(row.id)
    }
    if (!Number.isFinite(loadRowHeight) || loadRowHeight < 16) throw new RangeError('loadRowHeight must be at least 16')
    histogram = resourceLoadHistogram(options.loadSegments ?? [], ids)
  } else if (options.loadSegments?.length) {
    throw new Error('loadSegments require loadRows')
  }

  const bands = options.headerBands ?? []
  for (const level of bands) {
    let previousEnd = -Infinity
    for (const band of level) {
      if (!Number.isFinite(band.start) || !Number.isFinite(band.end) || band.end <= band.start || band.start < previousEnd) {
        throw new RangeError('Timeline bands must be finite, ordered and nonoverlapping')
      }
      previousEnd = band.end
    }
  }
  const markerIds = new Set<string>()
  for (const item of options.markers ?? []) {
    if (!item.id || markerIds.has(item.id) || !Number.isFinite(item.time)) throw new RangeError('Invalid timeline marker: ' + item.id)
    markerIds.add(item.id)
  }
  const markerRanges = options.markerRanges ?? []
  checkMarkerRanges(markerRanges, new Set(rows.map(row => row.id)))
  if (options.now !== undefined && !Number.isFinite(options.now)) throw new RangeError('now must be finite')
  if (options.statusDate !== undefined && !Number.isFinite(options.statusDate)) throw new RangeError('statusDate must be finite')
  checkNonWorkingPeriods(options.nonWorkingPeriods)

  const anchor = options.tickAnchor ?? full.start
  if (!Number.isFinite(anchor)) throw new RangeError('tickAnchor must be finite')
  let step = options.tickStep
  if (step !== undefined) {
    if (!Number.isFinite(step) || step <= 0) throw new RangeError('tickStep must be finite and positive')
  } else {
    const steps = options.tickSteps ?? defaultTickSteps
    if (!steps.length || steps.some((value, i) => !Number.isFinite(value) || value <= 0 || (i > 0 && value < steps[i - 1]!))) {
      throw new RangeError('tickSteps must be positive and ascending')
    }
    step = steps.find(value => scale.toX(anchor + value) - scale.toX(anchor) >= 76) ?? steps.at(-1)!
  }
  const ticks = timeTicks(window, step, anchor)
  const format = options.formatTime ?? defaultFormat
  const barLabel = options.barLabel ?? ((bar: B) => bar.label)
  const rowLabel = options.rowLabel ?? ((row: R) => row.label)
  const highlighted = new Set(options.highlightedDependencyIds ?? [])
  const highlightedBars = new Set(options.highlightedBarIds ?? [])
  const baselines = baselineSelection(bars, options.baselineIds)
  const stripLayout = baselineLayout(baselines.ids.length)
  const baselineText = {
    label: options.baselineLabel ?? ((id: string) => id === timelineBaselineId ? 'Baseline' : id),
    formatTime: format, formatVariance: options.formatVariance ?? formatDependencyLag,
    start: options.varianceLabels?.start ?? 'start', finish: options.varianceLabels?.finish ?? 'finish',
    duration: options.varianceLabels?.duration ?? 'duration',
  }
  const stripFills = [theme.baseline, theme.baseline2, theme.baseline3]
  const constraintLabels = options.constraintLabels ?? {}
  const constraintViolatedLabel = options.constraintViolatedLabel ?? 'violated'

  // Geometry. `local` measures from the window start; `view` mirrors it for right-to-left output.
  const local: TimeScale = { width: axisWidth, toX: time => scale.toX(time) - offset, toTime: x => scale.toTime(x + offset) }
  const view = rtl ? mirrorTimeScale(local) : local
  const labelArea = labelWidth + columnsWidth
  const axisLeft = rtl ? 0 : labelArea
  const labelLeft = rtl ? axisWidth : 0
  const X = (time: number) => axisLeft + view.toX(time)
  const span = (start: number, end: number) => {
    const a = X(start), b = X(end)
    return { x: Math.min(a, b), width: Math.abs(b - a) }
  }
  /** A box measured from the inline start of the label area. */
  const labelBox = (inset: number, width: number) => ({ x: rtl ? labelLeft + labelArea - inset - width : labelLeft + inset, width })
  const headerHeight = 40 + bandHeight * bands.length
  const bodyHeight = shown.length * rowHeight
  const loadTop = headerHeight + bodyHeight
  const totalHeight = loadTop + (histogram ? loadRows.length * loadRowHeight : 0)
  const width = labelArea + axisWidth
  const laneHeight = (rowHeight - 8) / laneCount
  // Two or three baseline sets take `reserve` pixels from the bar so their strips fit in the lane.
  const barHeight = Math.max(1, laneHeight - 6 - stripLayout.reserve)
  const laneTop = (bar: TimelineBar) => 7 + (bar.lane ?? 0) * laneHeight

  const clip = prefix + '-axis', arrow = prefix + '-arrow', arrowHighlight = prefix + '-arrow-highlight'
  const defs = tag('clipPath', { id: clip }, tag('rect', { x: axisLeft, y: 0, width: axisWidth, height: totalHeight }))
    + tag('marker', { id: arrow, markerWidth: 6, markerHeight: 6, refX: 5, refY: 3, orient: 'auto' },
      tag('path', { d: 'M 0 0 L 6 3 L 0 6 z', fill: theme.edge }))
    + tag('marker', { id: arrowHighlight, markerWidth: 6, markerHeight: 6, refX: 5, refY: 3, orient: 'auto' },
      tag('path', { d: 'M 0 0 L 6 3 L 0 6 z', fill: theme.dependencyHighlight }))

  const out: string[] = []
  if (background) out.push(tag('rect', { width, height: totalHeight, fill: theme.surface }))
  out.push(tag('rect', { x: 0, y: 0, width, height: headerHeight, fill: theme.surfaceMuted }))
  if (histogram) out.push(tag('rect', { x: 0, y: loadTop, width, height: totalHeight - loadTop, fill: theme.surfaceMuted }))

  // Time area: everything here is clipped to the exported window.
  const area: string[] = []
  for (const period of options.nonWorkingPeriods ?? []) {
    const start = Math.max(period.start, window.start), end = Math.min(period.end, window.end)
    if (end <= start) continue
    area.push(tag('rect', { ...span(start, end), y: headerHeight, height: totalHeight - headerHeight, fill: theme.nonWorking }))
  }
  // Marker ranges: the body band goes behind the grid and bars; its header label is drawn after the ticks below.
  const rangeLabels: string[] = []
  for (const item of markerRanges) {
    const start = Math.max(item.start, window.start), end = Math.min(item.end, window.end)
    if (end <= start) continue
    const box = span(start, end)
    const colors = item.tone === undefined ? { pale: theme.range, line: theme.rangeLine, ink: theme.rangeInk } : toneColors(theme, item.tone)
    const fills = item.rowIds
      ? [...new Set(item.rowIds)].flatMap(rowId => {
        const index = rowIndex.get(rowId)
        return index === undefined ? [] : [{ y: headerHeight + index * rowHeight, height: rowHeight }]
      })
      : [{ y: headerHeight, height: totalHeight - headerHeight }]
    const title = tag('title', {}, escapeXml(`${item.label} ${format(item.start)}–${format(item.end)}`))
    if (fills.length) {
      area.push(tag('g', { class: 'vw-gantt-range' }, title
        + fills.map(fill => tag('rect', { ...box, ...fill, fill: colors.pale, 'fill-opacity': 0.7 })).join('')))
    }
    const strip = { ...box, y: headerHeight - 13, height: 13 }
    rangeLabels.push(tag('g', { class: 'vw-gantt-range-label' }, title + tag('rect', { ...strip, fill: colors.pale })
      + tag('line', { x1: box.x, y1: strip.y + 1, x2: box.x + box.width, y2: strip.y + 1, stroke: colors.line, 'stroke-width': 2 })
      + clippedText(strip, rtl, [{ text: item.label, y: 10, size: 10, weight: 650, fill: colors.ink, inset: 4 }])))
  }
  bands.forEach((level, index) => {
    for (const band of level) {
      const start = Math.max(band.start, window.start), end = Math.min(band.end, window.end)
      if (end <= start) continue
      const box = { ...span(start, end), y: index * bandHeight, height: bandHeight }
      area.push(tag('rect', { ...box, fill: 'none', stroke: theme.grid }))
      area.push(clippedText(box, rtl, [{ text: band.label, y: 17, size: 11, weight: 700, fill: theme.text, inset: 7 }]))
    }
  })
  for (const tick of ticks) {
    const x = X(tick)
    area.push(tag('line', { x1: x, y1: headerHeight - 40, x2: x, y2: totalHeight, stroke: theme.grid, 'stroke-width': 1 }))
    const atEnd = tick === window.end
    // The label sits after the tick line in reading order, or before it for the closing tick.
    const after = atEnd ? rtl : !rtl
    area.push(tag('text', {
      x: after ? x + 7 : x - 7, y: headerHeight - 40 + 24, 'font-size': 11, 'font-weight': 700, fill: theme.text,
      'text-anchor': after ? 'start' : 'end',
    }, escapeXml(format(tick))))
  }
  area.push(...rangeLabels)
  const barsByRow = new Map<string, B[]>()
  for (const bar of bars) {
    if (!rowIndex.has(bar.rowId)) continue
    let list = barsByRow.get(bar.rowId)
    if (!list) barsByRow.set(bar.rowId, list = [])
    list.push(bar)
  }
  // Drawn rollup bars by row ID, the ends of `summaryDependencies` links.
  const rollups = new Map<string, TimeRange>()
  shown.forEach((item, index) => {
    const top = headerHeight + index * rowHeight
    const own = barsByRow.get(item.row.id) ?? []
    const summary = item.hasChildren && options.showSummaries && !own.length ? summaries?.get(item.row.id) : undefined
    if (summary && options.summaryDependencies) rollups.set(item.row.id, summary)
    if (summary && intersectsWindow(summary, window)) {
      const box = span(summary.start, summary.end)
      const w = Math.max(3, box.width)
      const y = top + rowHeight / 2 - 7
      let shape = tag('rect', { x: box.x, y, width: w, height: 14, rx: 3, fill: theme.grid })
      if (summary.progress !== undefined) {
        const filled = w * summary.progress
        shape += tag('rect', { x: rtl ? box.x + w - filled : box.x, y, width: filled, height: 14, fill: theme.accent, 'fill-opacity': 0.75 })
      }
      shape += tag('line', { x1: box.x, y1: y + 13, x2: box.x + w, y2: y + 13, stroke: theme.edge, 'stroke-width': 2 })
      area.push(tag('g', {}, tag('title', {}, escapeXml(`${rowLabel(item.row)} · ${summary.count} · ${format(summary.start)}–${format(summary.end)}`)) + shape))
    }
    for (const bar of own) {
      if (!baselines.described) {
        // Only `TimelineBar.baseline`: drawn exactly as before named baseline sets existed.
        if (!baselines.ids.length || !bar.baseline || !intersectsWindow(bar.baseline, window)) continue
        const box = span(bar.baseline.start, bar.baseline.end)
        area.push(tag('rect', {
          x: box.x - (box.width === 0 ? 1.5 : 0), y: top + laneTop(bar) + barHeight + 1, width: Math.max(3, box.width), height: 4, rx: 2,
          fill: theme.baseline,
        }))
        continue
      }
      const multiple = baselines.ids.length > 1
      for (const strip of baselineStrips(bar, bar, baselines, baselineText)) {
        if (!intersectsWindow(strip.range, window)) continue
        const box = span(strip.range.start, strip.range.end)
        const title = `${strip.label} · ${barLabel(bar)} ${strip.dates} · ${strip.variance}`
        area.push(tag('g', { class: multiple ? `vw-gantt-baseline vw-gantt-baseline-${strip.slot + 1}` : 'vw-gantt-baseline' },
          tag('title', {}, escapeXml(title)) + tag('rect', {
            x: box.x - (box.width === 0 ? 1.5 : 0), y: top + laneTop(bar) + barHeight + stripLayout.offset(strip.slot),
            width: Math.max(3, box.width), height: stripLayout.height, rx: stripLayout.height / 2, fill: stripFills[strip.slot],
          })))
      }
    }
    for (const bar of own) {
      if (bar.latestEnd === undefined || bar.latestEnd <= bar.end || !intersectsWindow({ start: bar.end, end: bar.latestEnd }, window)) continue
      const box = span(bar.end, bar.latestEnd)
      const y = top + laneTop(bar) + barHeight / 2
      const tickX = rtl ? box.x + 1 : box.x + box.width - 1
      area.push(tag('g', { class: 'vw-gantt-float' },
        tag('line', { x1: box.x, y1: y, x2: box.x + box.width, y2: y, stroke: theme.float, 'stroke-width': 2 })
        + tag('line', { x1: tickX, y1: y - 4, x2: tickX, y2: y + 4, stroke: theme.float, 'stroke-width': 2 })))
    }
    for (const bar of own) {
      if (!intersectsWindow(bar, window)) continue
      const colors = toneColors(theme, bar.tone)
      const solid = bar.appearance !== 'outline'
      const fill = solid ? colors.solid : colors.pale
      const stroke = bar.critical ? theme.critical : solid ? colors.solid : colors.line
      const strokeWidth = bar.critical ? 2 : undefined
      const ink = solid ? theme.onSolid : colors.ink
      const y = top + laneTop(bar)
      const label = barLabel(bar)
      const note = bar.description?.trim()
      const title = tag('title', {}, escapeXml(`${label} ${format(bar.start)}–${format(bar.end)}${note ? ' · ' + note : ''}`))
      const late = bar.deadline !== undefined && bar.end > bar.deadline
      const strong = highlightedBars.has(bar.id)
      const marks = {
        class: [bar.critical ? 'vw-critical' : '', late ? 'vw-late' : '', strong ? 'vw-is-highlighted' : ''].filter(Boolean).join(' ') || undefined,
      }
      // A highlighted bar gets an outline 3 px outside its box (or around the milestone diamond).
      const outline = (box: { x: number; width: number }) => strong
        ? tag('rect', {
          class: 'vw-highlight', x: box.x - 3, y: y - 3, width: box.width + 6, height: barHeight + 6, rx: 7, fill: 'none',
          stroke: theme.dependencyHighlight, 'stroke-width': 2,
        })
        : ''
      if (bar.start === bar.end) {
        const x = X(bar.start)
        area.push(tag('g', marks, title + outline({ x: x - 5, width: 10 }) + tag('polygon', {
          points: [[x, y + barHeight * 0.1], [x + 5, y + barHeight / 2], [x, y + barHeight * 0.9], [x - 5, y + barHeight / 2]]
            .map(([px, py]) => num(px!) + ',' + num(py!)).join(' '),
          fill, stroke, 'stroke-width': strokeWidth,
        })))
        continue
      }
      const box = { ...span(bar.start, bar.end), y, height: barHeight }
      let shape = outline(box)
      if (bar.segments) {
        // Work pieces with a connector across the gaps; progress fills the first part of the working time.
        const { pieces, gaps } = segmentPieces(bar, bar.segments, bar.progress)
        for (const gap of gaps) {
          const part = span(gap.start, gap.end)
          shape += tag('line', {
            class: 'vw-gantt-segment-gap', x1: part.x, y1: y + barHeight / 2, x2: part.x + part.width, y2: y + barHeight / 2,
            stroke: solid ? colors.solid : colors.line, 'stroke-width': 2,
          })
        }
        for (const piece of pieces) {
          const part = { ...span(piece.start, piece.end), y, height: barHeight }
          shape += tag('rect', { ...part, class: 'vw-gantt-segment', rx: 4, fill, stroke, 'stroke-width': strokeWidth })
          if (piece.filled > 0) {
            const filled = part.width * piece.filled
            shape += tag('rect', {
              x: rtl ? part.x + part.width - filled : part.x, y, width: filled, height: barHeight, rx: 4, fill: ink, 'fill-opacity': 0.18,
            })
          }
        }
      } else {
        shape += tag('rect', { ...box, rx: 5, fill, stroke, 'stroke-width': strokeWidth })
        if (bar.progress !== undefined && bar.progress > 0) {
          const filled = box.width * bar.progress
          shape += tag('rect', {
            x: rtl ? box.x + box.width - filled : box.x, y, width: filled, height: barHeight, rx: 5, fill: ink, 'fill-opacity': 0.18,
          })
        }
      }
      if (late) {
        shape += tag('rect', {
          x: box.x - 2, y: y - 2, width: box.width + 4, height: barHeight + 4, rx: 6, fill: 'none',
          stroke: theme.deadline, 'stroke-width': 2, 'stroke-dasharray': '4 3',
        })
      }
      // Segmented solid bars keep a halo so their text stays readable over the gaps.
      const halo = bar.segments && solid ? colors.solid : undefined
      shape += clippedText(box, rtl, [{ text: label, y: barHeight / 2 + 4, size: 11, weight: 650, fill: ink, inset: 7, halo }])
      area.push(tag('g', marks, title + shape))
    }
    for (const bar of own) {
      if (bar.deadline === undefined || bar.deadline < window.start || bar.deadline >= window.end) continue
      const x = X(bar.deadline)
      const y = top + laneTop(bar)
      const late = bar.end > bar.deadline
      area.push(tag('g', { class: late ? 'vw-gantt-deadline vw-late' : 'vw-gantt-deadline' },
        tag('title', {}, escapeXml(`${barLabel(bar)} ${format(bar.deadline)}`))
        + tag('line', { x1: x, y1: y - 3, x2: x, y2: y + barHeight + 3, stroke: theme.deadline, 'stroke-width': 2 })
        + tag('polygon', {
          points: [[x - 5, y - 3], [x + 5, y - 3], [x, y + 3]].map(([px, py]) => num(px!) + ',' + num(py!)).join(' '),
          fill: theme.deadline,
        })))
    }
    // Constraint markers: a stem across the lane with a flag at the top (start) or bottom (finish) that points towards
    // the allowed times, or an I-beam for a fixed start. GanttChart draws the same glyph with CSS.
    for (const bar of own) {
      if (!bar.constraints) continue
      const y = top + laneTop(bar)
      const upper = y - 5, lower = y + barHeight + 5
      for (const kind of timelineConstraintKinds) {
        const time = bar.constraints[kind]
        if (time === undefined || time < window.start || time >= window.end) continue
        const x = X(time)
        const violated = timelineConstraintViolated(bar, kind, time)
        const color = violated ? theme.constraintViolated : theme.constraint
        const start = kind.startsWith('start') || kind === 'fixedStart'
        const later = kind.endsWith('NoEarlierThan')
        const label = constraintLabels[kind] ?? defaultConstraintLabels[kind]
        let shape = tag('line', {
          x1: x, y1: upper, x2: x, y2: lower, stroke: color, 'stroke-width': 2, 'stroke-dasharray': violated ? '3 2' : undefined,
        })
        if (kind === 'fixedStart') {
          shape += tag('line', { x1: x - 8, y1: upper + 1.5, x2: x + 8, y2: upper + 1.5, stroke: color, 'stroke-width': 3 })
            + tag('line', { x1: x - 8, y1: lower - 1.5, x2: x + 8, y2: lower - 1.5, stroke: color, 'stroke-width': 3 })
        } else {
          // Towards later times is right in left-to-right output and left in right-to-left output.
          const side = later !== rtl ? 1 : -1
          const flag = start ? upper + 1 : lower - 1
          shape += tag('line', { x1: x, y1: flag, x2: x + side * 8, y2: flag, stroke: color, 'stroke-width': 2 })
            + tag('polygon', {
              points: [[x + side * 6, flag - 4.5], [x + side * 13, flag], [x + side * 6, flag + 4.5]]
                .map(([px, py]) => num(px!) + ',' + num(py!)).join(' '),
              fill: color,
            })
        }
        const classes = ['vw-gantt-constraint', start ? 'vw-is-start' : 'vw-is-finish',
          kind === 'fixedStart' ? 'vw-is-fixed' : later ? 'vw-is-lower' : 'vw-is-upper', violated ? 'vw-is-violated' : '']
        const title = `${label} · ${barLabel(bar)} ${format(time)}` + (violated ? ` · ${constraintViolatedLabel}` : '')
        area.push(tag('g', { class: classes.filter(Boolean).join(' ') }, tag('title', {}, escapeXml(title)) + shape))
      }
    }
  })
  // Dependency paths are computed from the window start and mirrored as a whole for right-to-left output.
  const paths: string[] = []
  const lagLabels: string[] = []
  const formatLag = options.formatLag ?? formatDependencyLag
  const barById = new Map(bars.map(bar => [bar.id, bar]))
  // A dependency end: a bar, or with `summaryDependencies` the rollup bar of a summary row, centred in its row.
  const linkEnd = (id: string) => {
    const bar = barById.get(id)
    if (bar) {
      const index = rowIndex.get(bar.rowId)
      return index === undefined ? undefined : { range: bar as TimeRange, index, offset: laneTop(bar) + barHeight / 2 }
    }
    const rollup = rollups.get(id)
    return rollup && { range: rollup, index: rowIndex.get(id)!, offset: rowHeight / 2 }
  }
  for (const dep of dependencies) {
    const source = linkEnd(dep.from), target = linkEnd(dep.to)
    if (!source || !target) continue
    const sourceIndex = source.index, targetIndex = target.index
    const ends = dependencyTimes(source.range, target.range, dep.type)
    const y1 = headerHeight + sourceIndex * rowHeight + source.offset
    const y2 = headerHeight + targetIndex * rowHeight + target.offset
    const strong = highlighted.has(dep.id)
    paths.push(tag('path', {
      d: dependencyPath(round(local.toX(ends.from)), round(y1), round(local.toX(ends.to)), round(y2), options.dependencyStyle), fill: 'none',
      stroke: strong ? theme.dependencyHighlight : theme.edge, 'stroke-width': strong ? 2 : 1.3,
      'marker-end': `url(#${strong ? arrowHighlight : arrow})`,
    }))
    if (dep.lag) {
      // Placed as in GanttChart and mirrored point by point, so the text itself is never mirrored.
      const point = lagLabelPoint(local.toX(ends.from), y1, local.toX(ends.to), y2, headerHeight + sourceIndex * rowHeight, rowHeight)
      lagLabels.push(tag('text', {
        class: 'vw-gantt-lag', x: rtl ? axisWidth - point.x : labelArea + point.x, y: point.y,
        'text-anchor': point.anchor === 'middle' ? 'middle' : rtl ? 'end' : 'start', 'dominant-baseline': 'central',
        'font-size': 10, 'font-weight': 650, fill: strong ? theme.dependencyHighlight : theme.text,
        stroke: theme.surface, 'stroke-width': 3, 'stroke-linejoin': 'round', 'paint-order': 'stroke',
      }, escapeXml(formatLag(dep.lag))))
    }
  }
  if (paths.length) {
    area.push(tag('g', { transform: rtl ? `matrix(-1 0 0 1 ${num(axisWidth)} 0)` : `translate(${num(labelArea)} 0)` }, paths.join('')))
  }
  const flag =(x: number, text: string, color: string, strokeWidth: number, dashed: boolean) => {
    const flagWidth = 10 + 6 * Array.from(text).length
    return tag('line', {
      x1: x, y1: headerHeight, x2: x, y2: totalHeight, stroke: color, 'stroke-width': strokeWidth,
      'stroke-dasharray': dashed ? '4 3' : undefined,
    }) + tag('rect', { x: rtl ? x - flagWidth : x, y: headerHeight, width: flagWidth, height: 16, fill: color })
      + tag('text', {
        x: rtl ? x - 5 : x + 5, y: headerHeight + 11.5, 'font-size': 10, fill: theme.markerInk,
        direction: rtl ? 'rtl' : undefined, 'unicode-bidi': rtl ? 'embed' : undefined,
      }, escapeXml(text))
  }
  for (const item of options.markers ?? []) {
    if (item.time < window.start || item.time >= window.end) continue
    area.push(tag('g', {}, tag('title', {}, escapeXml(`${item.label} ${format(item.time)}`)) + flag(X(item.time), item.label, theme.marker, 1, true)))
  }
  if (options.now !== undefined && options.now >= window.start && options.now <= window.end) {
    const label = options.nowLabel ?? 'Now'
    area.push(tag('g', {}, tag('title', {}, escapeXml(`${label} ${format(options.now)}`)) + flag(X(options.now), label, theme.now, 2, false)))
  }
  const status = options.statusDate
  if (status !== undefined && status >= window.start && status <= window.end) {
    const x = X(status)
    if (options.showProgressLine) {
      const kinks = shown.flatMap((item, index) => (barsByRow.get(item.row.id) ?? []).flatMap(bar => {
        const time = progressLineTime(bar, status)
        return time === undefined ? []
          : [{ x: X(time), y: headerHeight + index * rowHeight + laneTop(bar) + barHeight / 2, reach: barHeight / 2 }]
      }))
      area.push(tag('polyline', {
        class: 'vw-gantt-progress-line', fill: 'none', stroke: theme.status, 'stroke-width': 2, 'stroke-linejoin': 'round',
        points: progressLinePoints(x, headerHeight, headerHeight + bodyHeight, kinks).map(([px, py]) => num(px) + ',' + num(py)).join(' '),
      }))
    }
    const label = options.statusDateLabel ?? 'Status date'
    area.push(tag('g', { class: 'vw-gantt-status-date' },
      tag('title', {}, escapeXml(`${label} ${format(status)}`)) + flag(x, label, theme.status, 2, false)))
  }
  // Lag labels go above the marker, now and status-date lines so a line passing through a label does not cover its text.
  area.push(...lagLabels)
  if (histogram) {
    loadRows.forEach((row, index) => {
      const { segments, peak } = histogram.get(row.id)!
      const peakScale = Math.max(1e-9, peak)
      const top = loadTop + index * loadRowHeight + 4
      const height = loadRowHeight - 8
      for (const segment of segments) {
        if (!intersectsWindow(segment, window)) continue
        const box = span(segment.start, segment.end)
        const overload = segment.overload ?? Math.max(0, segment.load - segment.capacity)
        const fillHeight = Math.min(segment.load, segment.capacity) / peakScale * height
        const capacityHeight = segment.capacity / peakScale * height
        const overHeight = overload / peakScale * height
        let shape = tag('rect', { x: box.x, y: top + height - fillHeight, width: box.width, height: fillHeight, fill: theme.load })
        if (overload > 0) {
          shape += tag('rect', { x: box.x, y: top + height - capacityHeight - overHeight, width: box.width, height: overHeight, fill: theme.loadOverload })
        }
        shape += tag('line', {
          x1: box.x, y1: top + height - capacityHeight, x2: box.x + box.width, y2: top + height - capacityHeight,
          stroke: theme.loadCapacity, 'stroke-width': 2, 'stroke-dasharray': '4 3', 'stroke-opacity': segment.load === 0 ? 0.55 : undefined,
        })
        area.push(tag('g', {}, tag('title', {}, escapeXml(`${row.label} ${format(segment.start)}–${format(segment.end)}: ${segment.load} / ${segment.capacity}`)) + shape))
      }
    })
  }
  out.push(tag('g', { 'clip-path': `url(#${clip})` }, area.join('')))

  // Row separators span both areas.
  for (let index = 1; index <= shown.length; index++) {
    const y = headerHeight + index * rowHeight - 0.5
    out.push(tag('line', { x1: 0, y1: y, x2: width, y2: y, stroke: theme.border }))
  }
  if (histogram) {
    for (let index = 1; index <= loadRows.length; index++) {
      const y = loadTop + index * loadRowHeight - 0.5
      out.push(tag('line', { x1: 0, y1: y, x2: width, y2: y, stroke: theme.border }))
    }
  }
  out.push(tag('line', { x1: 0, y1: headerHeight - 0.5, x2: width, y2: headerHeight - 0.5, stroke: theme.border }))

  // Label area: the corner, row headings, column cells and load row headings.
  if (labelArea > 0) {
    out.push(tag('rect', { x: labelLeft, y: 0, width: labelArea, height: totalHeight, fill: theme.surfaceMuted }))
    const edgeX = rtl ? labelLeft + 0.5 : labelArea - 0.5
    out.push(tag('line', { x1: edgeX, y1: 0, x2: edgeX, y2: totalHeight, stroke: theme.border }))
    const name = labelBox(0, labelWidth)
    out.push(clippedText({ x: name.x, y: 0, width: name.width, height: headerHeight }, rtl, [
      { text: options.rowHeading ?? 'Rows', y: headerHeight / 2 + 4, size: 11, weight: 700, fill: theme.text, inset: 11 },
    ]))
    let inset = labelWidth
    const columnBoxes = columns.map(column => {
      const box = labelBox(inset, column.width)
      inset += column.width
      const lineX = rtl ? box.x + box.width - 0.5 : box.x + 0.5
      out.push(tag('line', { x1: lineX, y1: 0, x2: lineX, y2: headerHeight + bodyHeight, stroke: theme.border }))
      out.push(clippedText({ x: box.x, y: 0, width: box.width, height: headerHeight }, rtl, [
        { text: column.label, y: headerHeight / 2 + 4, size: 11, weight: 700, fill: theme.text, inset: 6 },
      ]))
      return { column, box }
    })
    shown.forEach((item, index) => {
      const top = headerHeight + index * rowHeight
      const nested = item.hasChildren || item.depth > 0
      let indent = nested ? 9 + Math.min(item.depth, 5) * 11 : 11
      const lines: Parameters<typeof clippedText>[2][number][] = []
      if (item.hasChildren) {
        lines.push({ text: collapsed.has(item.row.id) ? (rtl ? '◂' : '▸') : '▾', y: rowHeight / 2 + 4, size: 12, fill: theme.text, inset: indent })
        indent += 16
      }
      const detail = item.row.detail
      lines.push({ text: rowLabel(item.row), y: detail ? rowHeight / 2 - 2 : rowHeight / 2 + 4, size: 12, weight: 700, fill: theme.text, inset: indent })
      if (detail) lines.push({ text: detail, y: rowHeight / 2 + 11, size: 10, fill: theme.muted, inset: indent })
      out.push(clippedText({ x: name.x, y: top, width: name.width, height: rowHeight }, rtl, lines))
      for (const { column, box } of columnBoxes) {
        out.push(clippedText({ x: box.x, y: top, width: box.width, height: rowHeight }, rtl, [{
          text: String(column.value(item.row, summaries?.get(item.row.id))), y: rowHeight / 2 + 4, size: 12, fill: theme.text, inset: 6,
        }]))
      }
    })
    if (histogram) {
      loadRows.forEach((row, index) => {
        const top = loadTop + index * loadRowHeight
        out.push(clippedText({ x: labelLeft, y: top, width: labelArea, height: loadRowHeight }, rtl, [
          { text: row.label, y: row.detail ? loadRowHeight / 2 - 2 : loadRowHeight / 2 + 4, size: 12, weight: 700, fill: theme.text, inset: 11 },
          { text: row.detail ?? '', y: loadRowHeight / 2 + 11, size: 10, fill: theme.muted, inset: 11 },
        ]))
      })
    }
  }
  return svgDocument(width, totalHeight, options, font, defs, out.join(''))
}
