import { indexGraph, type GraphEdge, type GraphEdgeMarker, type GraphLayout } from './graph.js'
import { graphEdgeMarker, graphMarkerDrawing, graphOutlineElement, graphOutlineShape, graphOutlineText } from './graphShapes.js'
import {
  graphBelowLabelText, graphEndEventStroke, graphIntermediateEventGap, graphNodeEvent, graphNodeLabelBelow, graphNodeMarker, graphNodeMarkerParts,
  graphOutlineDetail, isGraphTaskMarker, type GraphOutlineElement,
} from './graphShapes.js'
import { graphPathBounds } from './graphView.js'
import { assertGraphSwimlaneBands, assertGraphSwimlanePools, type GraphSwimlaneBand, type GraphSwimlanePoolBand } from './graphSwimlanes.js'
import { assertGraphEdgeBands, graphBandOrder, graphReferenceDash, type GraphEdgeBand } from './graphFlow.js'
import {
  createTimelineRowTree, dependencyPath, dependencyTimes, formatDependencyLag, intersectsWindow, mirrorTimeScale, resourceLoadHistogram,
  summarizeTimelineRows, timeTicks, timelineBaselineId, validateTimelineData, type DependencyPathStyle, type ResourceLoadHistogram,
  type TimeRange, type TimeScale,
} from './timeline.js'
import { timelineConstraintKinds, timelineConstraintViolated } from './timeline.js'
import { tickLabelsWithRoom } from './workingTimeScale.js'
import type {
  ChartTone, NetworkNode, TimelineBand, TimelineBar, TimelineColumn, TimelineDependency, TimelineLoadRow, TimelineLoadSegment,
  TimelineMarker, TimelineMarkerRange, TimelineRow, TimelineSummary,
} from './types.js'
import type { TimelineConstraintKind } from './types.js'
import { checkMarkerRanges, checkNonWorkingPeriods, lagLabelPoint, progressLinePoints, progressLineTime, segmentPieces } from './barSegments.js'
import {
  baselineLayout, baselineSelection, baselineStrips, checkBandsAndMarkers, checkLoadRows, checkTimelineColumns, type BaselineSelection,
  type BaselineTextOptions,
} from './barSegments.js'
import { checkId } from './ids.js'
import { escapeXml } from './interchangeXml.js'

export { escapeXml }

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
  /**
   * Colours; omitted values use `defaultSvgExportTheme`. Each is a CSS colour value (hex, a colour name or keyword, or
   * one of the colour functions such as `rgb()`, `color-mix()` or `var()`); anything else throws a RangeError.
   */
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

// Theme colours are CSS colour values: hex, named colours and keywords, and the colour functions below (with `var()`
// and `calc()` inside them). Other functions, such as `url()`, `image()` or `expression()`, would let a theme reference
// external resources from the exported SVG, so they are rejected.
const colourFunctions = new Set([
  'rgb', 'rgba', 'hsl', 'hsla', 'hwb', 'lab', 'lch', 'oklab', 'oklch', 'color', 'color-mix', 'light-dark', 'var', 'calc',
])
const colourCharacters = /^[A-Za-z0-9#%.,()+\-/_ \t\n\r]+$/

function checkColour(value: string, name: string) {
  let depth = 0, valid = colourCharacters.test(value)
  // Every `(` must open a known colour function: the identifier right before it is the function name.
  if (valid) {
    for (const [, fn] of value.matchAll(/([\w-]*)\(/g)) {
      if (!colourFunctions.has(fn!.toLowerCase())) valid = false
    }
  }
  for (let index = 0; valid && index < value.length; index++) {
    if (value[index] === '(') depth++
    else if (value[index] === ')' && --depth < 0) valid = false
  }
  if (!valid || depth !== 0) {
    throw new RangeError(`Invalid export theme colour: ${name} must be a CSS colour (hex, a colour name or a colour function such as rgb())`)
  }
}

function resolveTheme(input: SvgExportThemeInput = {}): Required<SvgExportTheme> {
  const { tones: toneInput, ...rest } = input
  const theme: Required<SvgExportTheme> = { ...defaultSvgExportTheme, tones: { ...defaultSvgExportTheme.tones } }
  for (const [key, value] of Object.entries(rest)) {
    if (value === undefined) continue
    if (typeof value !== 'string' || !Object.hasOwn(defaultSvgExportTheme, key)) throw new Error('Invalid export theme colour: ' + key)
    const colour = value.trim()
    if (!colour) continue
    checkColour(colour, key)
    Object.assign(theme, { [key]: colour })
  }
  for (const tone of tones) {
    const custom = toneInput?.[tone]
    if (!custom) continue
    const merged = { ...theme.tones[tone] }
    for (const part of ['ink', 'line', 'pale', 'solid'] as const) {
      const value = custom[part]
      if (value !== undefined && typeof value !== 'string') throw new Error('Invalid export theme colour: ' + tone + '.' + part)
      if (!value?.trim()) continue
      checkColour(value.trim(), tone + '.' + part)
      merged[part] = value.trim()
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
  }, (title ? titleTag(title) : '') + (defs ? '<defs>' + defs + '</defs>' : '') + body)
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
      'font-size': line.size, 'font-weight': line.weight, fill: line.fill, ...textDirection(rtl), ...textHalo(line.halo, 3),
    }, escapeXml(line.text))
  }).join('')
  if (!content) return ''
  return tag('svg', { x: box.x, y: box.y, width: box.width, height: box.height, overflow: 'hidden' }, content)
}

type Theme = Required<SvgExportTheme>
type Box = { x: number; y: number; width: number; height: number }

/** The `direction` and `unicode-bidi` attributes of right-to-left text; both unset for left-to-right text. */
function textDirection(rtl: boolean) {
  return { direction: rtl ? 'rtl' : undefined, 'unicode-bidi': rtl ? 'embed' : undefined }
}

/** The attributes of a text halo: a round-joined stroke of `color` painted under the fill; none without a colour. */
function textHalo(color: string | undefined, width: number) {
  return {
    stroke: color, 'stroke-width': color ? width : undefined, 'stroke-linejoin': color ? 'round' : undefined,
    'paint-order': color ? 'stroke' : undefined,
  }
}

/** A `points` attribute value. */
function pointList(points: readonly (readonly [number, number])[]) {
  return points.map(([x, y]) => num(x) + ',' + num(y)).join(' ')
}

/** A `<title>` element. */
function titleTag(text: string) {
  return tag('title', {}, escapeXml(text))
}

/** A filled arrowhead marker `size` units wide and high, as both exporters draw at the end of their links. */
function arrowMarker(id: string, size: number, fill: string) {
  return tag('marker', { id, markerWidth: size, markerHeight: size, refX: size - 1, refY: size / 2, orient: 'auto' },
    tag('path', { d: `M 0 0 L ${size} ${size / 2} L 0 ${size} z`, fill }))
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
  /**
   * Pools (BPMN participants) drawn behind the lanes, for example the `pools` of a `layoutSwimlaneGraph` result: a
   * `g class="vw-swimlane-pool"` with a `title`, a `surface` rectangle with a 1.5-unit `muted` border, a `surfaceMuted`
   * title band and the title centred in the band, rotated to read from bottom to top when the band is taller than it
   * is wide, clipped to the band. Throws like NetworkGraph `pools` for invalid pools.
   */
  pools?: readonly GraphSwimlanePoolBand[]
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
 * The extent of everything `renderGraphSvg` draws, in layout coordinates: the layout, node boxes and labels below
 * them, edge paths (with half the width of their bands) and labels, groups, lanes and pools. Checks each as it goes.
 */
function graphExtent<N extends NetworkNode, E extends GraphEdge>(
  layout: GraphLayout, nodes: readonly N[], edges: readonly E[], options: GraphSvgOptions<N, E>, edgeText: (edge: E) => string | undefined,
) {
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
    if (graphNodeLabelBelow(node)) {
      // A label below the box, roughly as wide as its longest line.
      const text = options.nodeLabel ? options.nodeLabel(node) : node.label, more = options.nodeDetail ? options.nodeDetail(node) : node.detail
      const width = Math.max(box.width, 9 * Math.max(String(text ?? '').length, String(more ?? '').length * 0.8))
      include(box.x + box.width / 2 - width / 2, box.y + box.height, width, more ? 38 : 24)
    }
  }
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
    checkId('export group', group.id, groupIds)
    if (![group.x, group.y, group.width, group.height].every(Number.isFinite) || group.width < 0 || group.height < 0) {
      throw new RangeError('Invalid export group geometry: ' + group.id)
    }
    include(group.x, group.y, group.width, group.height)
  }
  if (options.lanes !== undefined) {
    assertGraphSwimlaneBands(options.lanes, 'renderGraphSvg')
    for (const lane of options.lanes) include(lane.x, lane.y, lane.width, lane.height)
  }
  if (options.pools !== undefined) {
    assertGraphSwimlanePools(options.pools, 'renderGraphSvg')
    for (const pool of options.pools) include(pool.x, pool.y, pool.width, pool.height)
  }
  return { left, top, right, bottom }
}

type EdgeMarker = Exclude<GraphEdgeMarker, 'none'>
type EdgeEnd = 'start' | 'end'

/**
 * The marker ID of an edge end. Arrow ends share the `-arrow` marker (or `-arrow-highlight`); other kinds and start
 * markers get one marker per kind, end and highlight.
 */
function graphMarkerId(prefix: string, kind: EdgeMarker, end: EdgeEnd, strong: boolean) {
  return kind === 'arrow' && end === 'end'
    ? prefix + (strong ? '-arrow-highlight' : '-arrow')
    : prefix + (end === 'start' ? '-start-' : '-') + kind + (strong ? '-highlight' : '')
}

function graphMarkerTag(id: string, kind: EdgeMarker, end: EdgeEnd, color: string, theme: Theme) {
  const { refX, paint, strokeWidth, element } = graphMarkerDrawing(kind)
  const colors = paint === 'fill' ? { fill: color } : {
    fill: paint === 'hollow' ? theme.surfaceMuted : 'none', stroke: color, 'stroke-width': strokeWidth,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }
  return tag('marker', { id, markerWidth: 7, markerHeight: 7, refX, refY: 3.5, orient: end === 'start' ? 'auto-start-reverse' : 'auto' },
    element.tag === 'path' ? tag('path', { d: element.d, ...colors }) : tag('circle', { cx: element.cx, cy: element.cy, r: element.r, ...colors }))
}

/** The `<defs>` content of a graph: the arrow marker and the markers that the drawn edges use. */
function graphMarkerDefs(
  edges: readonly GraphEdge[], bands: ReadonlyMap<string, GraphEdgeBand> | undefined, highlightedEdges: ReadonlySet<string>,
  prefix: string, theme: Theme, highlight: string,
) {
  // The highlight marker is only written when a drawn edge uses it, so an export without highlights is unchanged.
  const anyHighlightedEdge = edges.some(edge => highlightedEdges.has(edge.id) && !bands?.has(edge.id))
  // Other markers, and start markers, are also only written when an edge uses them.
  const markers = new Map<string, { kind: EdgeMarker; end: EdgeEnd; strong: boolean }>()
  for (const edge of edges) {
    if (bands?.has(edge.id)) continue
    const strong = highlightedEdges.has(edge.id)
    for (const end of ['start', 'end'] as const) {
      const kind = graphEdgeMarker(edge, end)
      if (kind !== 'none' && (kind !== 'arrow' || end === 'start')) markers.set(graphMarkerId(prefix, kind, end, strong), { kind, end, strong })
    }
  }
  return arrowMarker(prefix + '-arrow', 7, theme.edge)
    + (anyHighlightedEdge ? arrowMarker(prefix + '-arrow-highlight', 7, highlight) : '')
    + [...markers].map(([id, { kind, end, strong }]) => graphMarkerTag(id, kind, end, strong ? highlight : theme.edge, theme)).join('')
}

/** Pools: a framed rectangle with a title band; a tall band turns its centred title to read upwards. */
function graphPools(pools: readonly GraphSwimlanePoolBand[], theme: Theme, rtl: boolean) {
  return pools.map(pool => {
    const { header } = pool
    let title = ''
    if (header.width > 0 && header.height > 0) {
      const vertical = header.height > header.width
      const cx = header.width / 2, cy = header.height / 2
      title = tag('rect', {
        x: header.x, y: header.y, width: header.width, height: header.height, fill: theme.surfaceMuted, stroke: theme.muted, 'stroke-width': 1.5,
      }) + tag('svg', { x: header.x, y: header.y, width: header.width, height: header.height, overflow: 'hidden' }, tag('text', {
        x: cx, y: cy, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 13, 'font-weight': 700, fill: theme.text,
        transform: vertical ? `rotate(-90 ${num(cx)} ${num(cy)})` : undefined, ...textDirection(rtl),
      }, escapeXml(pool.label)))
    }
    return tag('g', { class: 'vw-swimlane-pool' }, titleTag(pool.label) + tag('rect', {
      x: pool.x, y: pool.y, width: pool.width, height: pool.height, fill: theme.surface, stroke: theme.muted, 'stroke-width': 1.5,
    }) + title)
  }).join('')
}

/** Lanes: alternating band fills, a header with a solid border and the title clipped to the header. */
function graphLanes(lanes: readonly GraphSwimlaneBand[], theme: Theme, rtl: boolean) {
  return lanes.map((lane, index) => {
    const { header } = lane
    return tag('g', { class: 'vw-swimlane' }, titleTag(lane.label) + tag('rect', {
      x: lane.x, y: lane.y, width: lane.width, height: lane.height,
      fill: index % 2 ? theme.surfaceMuted : theme.surface, stroke: theme.border,
    }) + (header.width > 0 && header.height > 0 ? tag('rect', {
      x: header.x, y: header.y, width: header.width, height: header.height, fill: theme.surfaceMuted, stroke: theme.border, 'stroke-width': 1.5,
    }) : '') + clippedText(header, rtl, [{ text: lane.label, y: Math.min(header.height / 2, 14) + 4, size: 12, weight: 700, fill: theme.text, inset: 8 }]))
  }).join('')
}

/** Group rectangles with their labels. */
function graphGroups(groups: readonly GraphSvgGroup[], theme: Theme, rtl: boolean) {
  return groups.map(group => tag('g', {}, tag('rect', {
    x: group.x, y: group.y, width: group.width, height: group.height, rx: 10,
    fill: theme.surfaceMuted, 'fill-opacity': 0.7, stroke: theme.border, 'stroke-dasharray': '4 3',
  }) + tag('text', {
    x: rtl ? group.x + group.width - 8 : group.x + 8, y: group.y + 15, 'font-size': 10, fill: theme.text, ...textDirection(rtl),
  }, escapeXml(group.label)))).join('')
}

/** Edge paths: bands widest first, then the other edges with their markers. */
function graphEdgePaths(
  layout: GraphLayout, edges: readonly GraphEdge[], bands: ReadonlyMap<string, GraphEdgeBand> | undefined,
  highlightedEdges: ReadonlySet<string>, prefix: string, theme: Theme, highlight: string,
) {
  let out = ''
  for (const edge of bands ? graphBandOrder(edges, bands) : edges) {
    const strong = highlightedEdges.has(edge.id)
    const band = bands?.get(edge.id)
    const d = layout.paths.get(edge.id)!
    if (band) {
      out += tag('path', {
        class: band.reference ? 'vw-flow-band vw-is-reference' : 'vw-flow-band', d, fill: 'none',
        stroke: strong ? highlight : theme.edge, 'stroke-width': band.width,
        'stroke-opacity': band.reference ? 0.35 : strong ? 0.7 : 0.5, 'stroke-dasharray': band.reference ? graphReferenceDash(band.width, d) : undefined,
      }, band.label ? titleTag(band.label) : undefined)
      continue
    }
    const start = graphEdgeMarker(edge, 'start'), end = graphEdgeMarker(edge, 'end')
    out += tag('path', {
      d, fill: 'none', stroke: strong ? highlight : theme.edge, 'stroke-width': strong ? 2.6 : 1.65,
      'stroke-dasharray': edge.animated ? '6 4' : edge.dashed ? '5 4' : undefined,
      'marker-start': start === 'none' ? undefined : `url(#${graphMarkerId(prefix, start, 'start', strong)})`,
      'marker-end': end === 'none' ? undefined : `url(#${graphMarkerId(prefix, end, 'end', strong)})`,
    })
  }
  return out
}

/** Edge labels at their layout anchors, with a halo in the stage colour. */
function graphEdgeLabels<E extends GraphEdge>(layout: GraphLayout, edges: readonly E[], edgeText: (edge: E) => string | undefined, theme: Theme, rtl: boolean) {
  let out = ''
  for (const edge of edges) {
    const label = layout.edgeLabels.get(edge.id)
    const text = edgeText(edge)
    if (!label || !text) continue
    out += tag('text', {
      x: label.x, y: label.y, 'font-size': 11, 'text-anchor': 'middle', fill: theme.text, ...textHalo(theme.surfaceMuted, 4), ...textDirection(rtl),
    }, escapeXml(text))
  }
  return out
}

/** How `renderGraphSvg` draws nodes: the theme, the selection and highlights and the text callbacks. */
interface GraphNodeStyle<N extends NetworkNode> {
  theme: Theme
  rtl: boolean
  highlight: string
  selected: ReadonlySet<string>
  highlightedNodes: ReadonlySet<string>
  nodeLabel: (node: N) => string
  nodeDetail: (node: N) => string | undefined
}

/** Where the title and detail lines of a node go in its box. */
interface NodeTextLines {
  title: number
  detail: number
  inset: number
  centred?: boolean
}

function outlineTag(element: GraphOutlineElement, attributes: Record<string, string | number>) {
  return element.tag === 'ellipse'
    ? tag('ellipse', { cx: element.cx, cy: element.cy, rx: element.rx, ry: element.ry, ...attributes })
    : element.tag === 'path'
      ? tag('path', { d: element.d, ...attributes, 'stroke-linejoin': 'round' })
      : tag('polygon', { points: pointList(element.points.map(point => [point.x, point.y])), ...attributes, 'stroke-linejoin': 'round' })
}

/**
 * The shape of a node in its box and where its text goes: an outline shape (drawn inside the box, with centred text)
 * or a rounded rectangle, doubled for an intermediate event.
 */
function graphNodeShape(
  node: NetworkNode, box: Box, paint: { fill: string; stroke: string; 'stroke-width': number }, hasDetail: boolean,
): { shape: string; lines: NodeTextLines } {
  const outline = graphOutlineShape(node)
  const event = graphNodeEvent(node)
  const innerInset = 2 + graphIntermediateEventGap
  if (outline) {
    const element = graphOutlineElement(outline, box.width, box.height)
    const anchors = graphOutlineText(box.width, box.height, hasDetail, outline)
    let shape = outlineTag(element, paint)
    const detailLines = graphOutlineDetail(outline, box.width, box.height)
    if (detailLines) shape += tag('path', { d: detailLines, fill: 'none', stroke: paint.stroke, 'stroke-width': Math.min(paint['stroke-width'], 1.5) })
    if (event === 'intermediate') shape += outlineTag(graphOutlineElement(outline, box.width, box.height, innerInset), paint)
    return { shape, lines: { title: anchors.title, detail: anchors.detail, inset: 0, centred: true } }
  }
  const radius = node.shape === 'rounded' ? 19 : 8
  let shape = tag('rect', {
    x: 2, y: 2, width: Math.max(0, box.width - 4), height: Math.max(0, box.height - 4), rx: radius, ...paint,
  })
  if (event === 'intermediate') {
    shape += tag('rect', {
      x: innerInset, y: innerInset, width: Math.max(0, box.width - 2 * innerInset), height: Math.max(0, box.height - 2 * innerInset),
      rx: Math.max(0, radius - graphIntermediateEventGap), ...paint,
    })
  }
  const inset = isGraphTaskMarker(graphNodeMarker(node)) ? 30 : 13
  const rectLines = graphOutlineText(box.width, box.height, hasDetail)
  return { shape, lines: { title: rectLines.title, detail: rectLines.detail, inset } }
}

/** One node: its title, its shape, marker and text clipped to the box, and a label below the box for event shapes. */
function graphNode<N extends NetworkNode>(node: N, box: Box, style: GraphNodeStyle<N>) {
  const { theme, rtl, highlight } = style
  const colors = toneColors(theme, node.tone)
  const active = style.selected.has(node.id)
  const label = style.nodeLabel(node), detail = style.nodeDetail(node)
  const ink = active ? theme.onSolid : colors.ink
  const strong = style.highlightedNodes.has(node.id)
  const paint = {
    fill: active ? colors.solid : colors.pale, stroke: strong ? highlight : active ? colors.ink : colors.line,
    'stroke-width': strong ? 3 : active ? 2.8 : 1.25,
  }
  const marker = graphNodeMarker(node), below = graphNodeLabelBelow(node)
  if (graphNodeEvent(node) === 'end') paint['stroke-width'] = Math.max(paint['stroke-width'], graphEndEventStroke)
  const drawn = graphNodeShape(node, box, paint, Boolean(detail))
  const lines = drawn.lines
  let shape = drawn.shape
  if (marker) {
    shape += tag('g', { fill: 'none', stroke: ink, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, graphNodeMarkerParts(marker, box.width, box.height, rtl)
      .map(part => part.tag === 'circle'
        ? tag('circle', { cx: part.cx, cy: part.cy, r: part.r, 'stroke-width': part.strokeWidth })
        : tag('path', { d: part.d, 'stroke-width': part.strokeWidth })).join(''))
  }
  const text = below ? '' : clippedText({ x: 0, y: 0, width: box.width, height: box.height }, rtl, [
    { text: label, y: lines.title, size: 15.5, weight: 700, fill: ink, inset: lines.inset, centred: lines.centred },
    { text: detail ?? '', y: lines.detail, size: 12, weight: 550, fill: ink, inset: lines.inset, centred: lines.centred },
  ])
  // A label below the box is drawn in the text colour on the stage background, with a halo like edge labels.
  let outside = ''
  if (below) {
    const anchors = graphBelowLabelText(box.width, box.height)
    const halo = { 'text-anchor': 'middle', ...textHalo(theme.surfaceMuted, 4), ...textDirection(rtl) }
    outside = tag('text', { x: anchors.x, y: anchors.title, 'font-size': 15.5, 'font-weight': 700, fill: theme.text, ...halo }, escapeXml(label))
      + (detail ? tag('text', { x: anchors.x, y: anchors.detail, 'font-size': 12, 'font-weight': 550, fill: theme.text, ...halo }, escapeXml(detail)) : '')
  }
  return tag('g', { transform: `translate(${num(box.x)} ${num(box.y)})` },
    titleTag([label, detail].filter(Boolean).join(' '))
    + tag('svg', { width: box.width, height: box.height, overflow: 'hidden' }, shape + text) + outside)
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
  const edgeText = options.edgeLabel ?? ((edge: GraphEdge) => edge.label)
  const { left, top, right, bottom } = graphExtent(layout, nodes, edges, options, edgeText)
  const bands = options.edgeBands
  const width = right - left + 2 * padding, height = bottom - top + 2 * padding
  const selected = new Set(options.selectedIds ?? [])
  const highlightedNodes = new Set(options.highlightedNodeIds ?? [])
  const highlightedEdges = new Set(options.highlightedEdgeIds ?? [])
  if (options.highlightColor !== undefined && (typeof options.highlightColor !== 'string' || !options.highlightColor.trim())) {
    throw new Error('Invalid export highlight colour')
  }
  const highlight = options.highlightColor?.trim() || theme.dependencyHighlight
  const style: GraphNodeStyle<N> = {
    theme, rtl, highlight, selected, highlightedNodes,
    nodeLabel: options.nodeLabel ?? (node => node.label), nodeDetail: options.nodeDetail ?? (node => node.detail),
  }
  const defs = graphMarkerDefs(edges, bands, highlightedEdges, prefix, theme, highlight)
  // Back to front: pools, lanes, groups, edges, edge labels and nodes.
  const content = graphPools(options.pools ?? [], theme, rtl) + graphLanes(options.lanes ?? [], theme, rtl)
    + graphGroups(options.groups ?? [], theme, rtl) + graphEdgePaths(layout, edges, bands, highlightedEdges, prefix, theme, highlight)
    + graphEdgeLabels(layout, edges, edgeText, theme, rtl) + nodes.map(node => graphNode(node, layout.boxes.get(node.id)!, style)).join('')
  const body = (background ? tag('rect', { width, height, fill: theme.surfaceMuted }) : '')
    + tag('g', { transform: `translate(${num(padding - left)} ${num(padding - top)})` }, content)
  return svgDocument(width, height, options, font, defs, body)
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

type RowTreeItem<R extends TimelineRow> = ReturnType<typeof createTimelineRowTree<R>>[number]

/** The geometry and text callbacks of a timeline export that its layers share. */
interface TimelineFrame<R extends TimelineRow, B extends TimelineBar> {
  theme: Theme
  rtl: boolean
  /** The exported time window. */
  window: TimeRange
  /** The scale measured from the window start. */
  local: TimeScale
  /** The x of a time in the document. */
  X: (time: number) => number
  /** The box between two times in the document. */
  span: (start: number, end: number) => { x: number; width: number }
  axisWidth: number
  /** Width of the row heading and column area, and its left edge. */
  labelArea: number
  labelLeft: number
  width: number
  headerHeight: number
  bodyHeight: number
  /** The top of the load rows, below the task rows. */
  loadTop: number
  totalHeight: number
  rowHeight: number
  barHeight: number
  /** The top of a bar's lane in its row. */
  laneTop: (bar: TimelineBar) => number
  format: (time: number) => string
  // Methods, so that a frame of narrower row and bar types can be passed where any frame is expected.
  barLabel(bar: B): string
  rowLabel(row: R): string
}

/** The rows of a tree that are displayed: every row except the descendants of collapsed rows. */
function displayedRows<R extends TimelineRow>(tree: readonly RowTreeItem<R>[], collapsed: ReadonlySet<string>) {
  const displayed: RowTreeItem<R>[] = []
  for (let index = 0; index < tree.length;) {
    const item = tree[index]!
    displayed.push(item)
    index = collapsed.has(item.row.id) ? item.afterSubtree : index + 1
  }
  return displayed
}

/**
 * The whole range of a scale and the exported window of it (`timeRange`, default the whole range), with the x of the
 * window start and the width of the window. Throws for a missing scale and an empty or invalid window.
 */
function timelineWindow(scale: TimeScale, timeRange: TimeRange | undefined) {
  if (!scale || typeof scale.toX !== 'function' || typeof scale.toTime !== 'function') throw new Error('A time scale is required')
  if (!Number.isFinite(scale.width) || scale.width <= 0) throw new RangeError('Invalid time scale width')
  const full = { start: scale.toTime(0), end: scale.toTime(scale.width) }
  const window = timeRange ?? full
  if (!Number.isFinite(window.start) || !Number.isFinite(window.end) || window.end <= window.start) {
    throw new RangeError('timeRange must have finite endpoints with start < end')
  }
  const offset = scale.toX(window.start)
  const axisWidth = scale.toX(window.end) - offset
  if (!Number.isFinite(offset) || !Number.isFinite(axisWidth) || axisWidth <= 0) throw new RangeError('The exported time window has no width')
  return { full, window, offset, axisWidth }
}

/** `tickStep`, or the first of `tickSteps` whose ticks are at least 76 px apart (else the last). */
function timelineTickStep(options: Pick<TimelineSvgOptions, 'tickStep' | 'tickSteps'>, scale: TimeScale, anchor: number) {
  const step = options.tickStep
  if (step !== undefined) {
    if (!Number.isFinite(step) || step <= 0) throw new RangeError('tickStep must be finite and positive')
    return step
  }
  const steps = options.tickSteps ?? defaultTickSteps
  if (!steps.length || steps.some((value, i) => !Number.isFinite(value) || value <= 0 || (i > 0 && value < steps[i - 1]!))) {
    throw new RangeError('tickSteps must be positive and ascending')
  }
  return steps.find(value => scale.toX(anchor + value) - scale.toX(anchor) >= 76) ?? steps.at(-1)!
}

/** The part of a range inside the window, or undefined when they do not overlap. */
function clampToWindow(range: TimeRange, window: TimeRange) {
  const start = Math.max(range.start, window.start), end = Math.min(range.end, window.end)
  return end <= start ? undefined : { start, end }
}

/** Non-working time shading across the task and load rows. */
function timelineNonWorking(periods: readonly TimeRange[], frame: TimelineFrame<TimelineRow, TimelineBar>) {
  let out = ''
  for (const period of periods) {
    const range = clampToWindow(period, frame.window)
    if (!range) continue
    out += tag('rect', { ...frame.span(range.start, range.end), y: frame.headerHeight, height: frame.totalHeight - frame.headerHeight, fill: frame.theme.nonWorking })
  }
  return out
}

/**
 * Marker ranges: the `bands` across the body (or their rows) go behind the grid and bars; the `labels` at the bottom
 * of the header are drawn after the ticks.
 */
function timelineMarkerRanges(markerRanges: readonly TimelineMarkerRange[], rowIndex: ReadonlyMap<string, number>, frame: TimelineFrame<TimelineRow, TimelineBar>) {
  const { theme, rtl, headerHeight, rowHeight, totalHeight, format } = frame
  let bands = '', labels = ''
  for (const item of markerRanges) {
    const range = clampToWindow(item, frame.window)
    if (!range) continue
    const box = frame.span(range.start, range.end)
    const colors = item.tone === undefined ? { pale: theme.range, line: theme.rangeLine, ink: theme.rangeInk } : toneColors(theme, item.tone)
    const fills = item.rowIds
      ? [...new Set(item.rowIds)].flatMap(rowId => {
        const index = rowIndex.get(rowId)
        return index === undefined ? [] : [{ y: headerHeight + index * rowHeight, height: rowHeight }]
      })
      : [{ y: headerHeight, height: totalHeight - headerHeight }]
    const title = titleTag(`${item.label} ${format(item.start)}–${format(item.end)}`)
    if (fills.length) {
      bands += tag('g', { class: 'vw-gantt-range' }, title
        + fills.map(fill => tag('rect', { ...box, ...fill, fill: colors.pale, 'fill-opacity': 0.7 })).join(''))
    }
    const strip = { ...box, y: headerHeight - 13, height: 13 }
    labels += tag('g', { class: 'vw-gantt-range-label' }, title + tag('rect', { ...strip, fill: colors.pale })
      + tag('line', { x1: box.x, y1: strip.y + 1, x2: box.x + box.width, y2: strip.y + 1, stroke: colors.line, 'stroke-width': 2 })
      + clippedText(strip, rtl, [{ text: item.label, y: 10, size: 10, weight: 650, fill: colors.ink, inset: 4 }]))
  }
  return { bands, labels }
}

/** The header bands, one level per row of the header. */
function timelineHeaderBands(levels: readonly (readonly TimelineBand[])[], frame: TimelineFrame<TimelineRow, TimelineBar>) {
  let out = ''
  levels.forEach((level, index) => {
    for (const band of level) {
      const range = clampToWindow(band, frame.window)
      if (!range) continue
      const box = { ...frame.span(range.start, range.end), y: index * bandHeight, height: bandHeight }
      out += tag('rect', { ...box, fill: 'none', stroke: frame.theme.grid })
      out += clippedText(box, frame.rtl, [{ text: band.label, y: 17, size: 11, weight: 700, fill: frame.theme.text, inset: 7 }])
    }
  })
  return out
}

/** Tick lines across the chart with their labels in the header. */
function timelineTicks(ticks: readonly number[], step: number, frame: TimelineFrame<TimelineRow, TimelineBar>) {
  const { theme, rtl, headerHeight, window } = frame
  const labelled = tickLabelsWithRoom(ticks, frame.local.toX, step, window.end)
  let out = ''
  ticks.forEach((tick, index) => {
    const x = frame.X(tick)
    out += tag('line', { x1: x, y1: headerHeight - 40, x2: x, y2: frame.totalHeight, stroke: theme.grid, 'stroke-width': 1 })
    // Labels that a non-linear scale squeezes together are left out; the grid line stays.
    if (!labelled[index]) return
    const atEnd = tick === window.end
    // The label sits after the tick line in reading order, or before it for the closing tick.
    const after = atEnd ? rtl : !rtl
    out += tag('text', {
      x: after ? x + 7 : x - 7, y: headerHeight - 40 + 24, 'font-size': 11, 'font-weight': 700, fill: theme.text,
      'text-anchor': after ? 'start' : 'end',
    }, escapeXml(frame.format(tick)))
  })
  return out
}

/** The rollup bar of a summary row. */
function timelineSummaryBar<R extends TimelineRow>(row: R, summary: TimelineSummary, top: number, frame: TimelineFrame<R, TimelineBar>) {
  const { theme, rtl, format } = frame
  const box = frame.span(summary.start, summary.end)
  const w = Math.max(3, box.width)
  const y = top + frame.rowHeight / 2 - 7
  let shape = tag('rect', { x: box.x, y, width: w, height: 14, rx: 3, fill: theme.grid })
  if (summary.progress !== undefined) {
    const filled = w * summary.progress
    shape += tag('rect', { x: rtl ? box.x + w - filled : box.x, y, width: filled, height: 14, fill: theme.accent, 'fill-opacity': 0.75 })
  }
  shape += tag('line', { x1: box.x, y1: y + 13, x2: box.x + w, y2: y + 13, stroke: theme.edge, 'stroke-width': 2 })
  return tag('g', {}, titleTag(`${frame.rowLabel(row)} · ${summary.count} · ${format(summary.start)}–${format(summary.end)}`) + shape)
}

/** How the baselines are drawn: the selected sets, their strip layout, title texts and fills. */
interface BaselineStyle {
  selection: BaselineSelection
  layout: ReturnType<typeof baselineLayout>
  text: BaselineTextOptions
  fills: readonly string[]
}

/** The baseline strips below the bars of a row. */
function timelineBaselines<B extends TimelineBar>(own: readonly B[], top: number, baselines: BaselineStyle, frame: TimelineFrame<TimelineRow, B>) {
  const { window, barHeight } = frame
  let out = ''
  for (const bar of own) {
    if (!baselines.selection.described) {
      // Only `TimelineBar.baseline`: one strip below the bar, without variance in the title.
      if (!baselines.selection.ids.length || !bar.baseline || !intersectsWindow(bar.baseline, window)) continue
      const box = frame.span(bar.baseline.start, bar.baseline.end)
      out += tag('rect', {
        x: box.x - (box.width === 0 ? 1.5 : 0), y: top + frame.laneTop(bar) + barHeight + 1, width: Math.max(3, box.width), height: 4, rx: 2,
        fill: frame.theme.baseline,
      })
      continue
    }
    const multiple = baselines.selection.ids.length > 1
    const { layout } = baselines
    for (const strip of baselineStrips(bar, bar, baselines.selection, baselines.text)) {
      if (!intersectsWindow(strip.range, window)) continue
      const box = frame.span(strip.range.start, strip.range.end)
      const title = `${strip.label} · ${frame.barLabel(bar)} ${strip.dates} · ${strip.variance}`
      out += tag('g', { class: multiple ? `vw-gantt-baseline vw-gantt-baseline-${strip.slot + 1}` : 'vw-gantt-baseline' },
        titleTag(title) + tag('rect', {
          x: box.x - (box.width === 0 ? 1.5 : 0), y: top + frame.laneTop(bar) + barHeight + layout.offset(strip.slot),
          width: Math.max(3, box.width), height: layout.height, rx: layout.height / 2, fill: baselines.fills[strip.slot],
        }))
    }
  }
  return out
}

/** Float lines from the end of each bar to its latest end, with a tick at the latest end. */
function timelineFloats(own: readonly TimelineBar[], top: number, frame: TimelineFrame<TimelineRow, TimelineBar>) {
  const { theme, rtl } = frame
  let out = ''
  for (const bar of own) {
    if (bar.latestEnd === undefined || bar.latestEnd <= bar.end || !intersectsWindow({ start: bar.end, end: bar.latestEnd }, frame.window)) continue
    const box = frame.span(bar.end, bar.latestEnd)
    const y = top + frame.laneTop(bar) + frame.barHeight / 2
    const tickX = rtl ? box.x + 1 : box.x + box.width - 1
    out += tag('g', { class: 'vw-gantt-float' },
      tag('line', { x1: box.x, y1: y, x2: box.x + box.width, y2: y, stroke: theme.float, 'stroke-width': 2 })
      + tag('line', { x1: tickX, y1: y - 4, x2: tickX, y2: y + 4, stroke: theme.float, 'stroke-width': 2 }))
  }
  return out
}

/** One bar: a milestone diamond, or a box (or its work pieces) with progress, the late outline and the label. */
function timelineBar<B extends TimelineBar>(bar: B, top: number, strong: boolean, frame: TimelineFrame<TimelineRow, B>) {
  const { theme, rtl, barHeight } = frame
  const colors = toneColors(theme, bar.tone)
  const solid = bar.appearance !== 'outline'
  const fill = solid ? colors.solid : colors.pale
  const stroke = bar.critical ? theme.critical : solid ? colors.solid : colors.line
  const strokeWidth = bar.critical ? 2 : undefined
  const ink = solid ? theme.onSolid : colors.ink
  const y = top + frame.laneTop(bar)
  const label = frame.barLabel(bar)
  const note = bar.description?.trim()
  const title = titleTag(`${label} ${frame.format(bar.start)}–${frame.format(bar.end)}${note ? ' · ' + note : ''}`)
  const late = bar.deadline !== undefined && bar.end > bar.deadline
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
    const x = frame.X(bar.start)
    return tag('g', marks, title + outline({ x: x - 5, width: 10 }) + tag('polygon', {
      points: pointList([[x, y + barHeight * 0.1], [x + 5, y + barHeight / 2], [x, y + barHeight * 0.9], [x - 5, y + barHeight / 2]]),
      fill, stroke, 'stroke-width': strokeWidth,
    }))
  }
  const box = { ...frame.span(bar.start, bar.end), y, height: barHeight }
  let shape = outline(box)
  // The part of a box that progress fills, from the inline start.
  const progressFill = (part: { x: number; width: number }, filled: number, rx: number) => tag('rect', {
    x: rtl ? part.x + part.width - filled : part.x, y, width: filled, height: barHeight, rx, fill: ink, 'fill-opacity': 0.18,
  })
  if (bar.segments) {
    // Work pieces with a connector across the gaps; progress fills the first part of the working time.
    const { pieces, gaps } = segmentPieces(bar, bar.segments, bar.progress)
    for (const gap of gaps) {
      const part = frame.span(gap.start, gap.end)
      shape += tag('line', {
        class: 'vw-gantt-segment-gap', x1: part.x, y1: y + barHeight / 2, x2: part.x + part.width, y2: y + barHeight / 2,
        stroke: solid ? colors.solid : colors.line, 'stroke-width': 2,
      })
    }
    for (const piece of pieces) {
      const part = { ...frame.span(piece.start, piece.end), y, height: barHeight }
      shape += tag('rect', { ...part, class: 'vw-gantt-segment', rx: 4, fill, stroke, 'stroke-width': strokeWidth })
      if (piece.filled > 0) shape += progressFill(part, part.width * piece.filled, 4)
    }
  } else {
    shape += tag('rect', { ...box, rx: 5, fill, stroke, 'stroke-width': strokeWidth })
    if (bar.progress !== undefined && bar.progress > 0) shape += progressFill(box, box.width * bar.progress, 5)
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
  return tag('g', marks, title + shape)
}

/** Deadline indicators: a line across the lane with a triangle on top. */
function timelineDeadlines<B extends TimelineBar>(own: readonly B[], top: number, frame: TimelineFrame<TimelineRow, B>) {
  const { theme, window } = frame
  let out = ''
  for (const bar of own) {
    if (bar.deadline === undefined || bar.deadline < window.start || bar.deadline >= window.end) continue
    const x = frame.X(bar.deadline)
    const y = top + frame.laneTop(bar)
    const late = bar.end > bar.deadline
    out += tag('g', { class: late ? 'vw-gantt-deadline vw-late' : 'vw-gantt-deadline' },
      titleTag(`${frame.barLabel(bar)} ${frame.format(bar.deadline)}`)
      + tag('line', { x1: x, y1: y - 3, x2: x, y2: y + frame.barHeight + 3, stroke: theme.deadline, 'stroke-width': 2 })
      + tag('polygon', { points: pointList([[x - 5, y - 3], [x + 5, y - 3], [x, y + 3]]), fill: theme.deadline }))
  }
  return out
}

/** The labels of constraint markers: the text of each kind and the word added to violated ones. */
interface ConstraintText {
  labels: Partial<Record<TimelineConstraintKind, string>>
  violated: string
}

/**
 * Constraint markers: a stem across the lane with a flag at the top (start) or bottom (finish) that points towards
 * the allowed times, or an I-beam for a fixed start. GanttChart draws the same glyph with CSS.
 */
function timelineConstraints<B extends TimelineBar>(own: readonly B[], top: number, text: ConstraintText, frame: TimelineFrame<TimelineRow, B>) {
  const { theme, rtl, window } = frame
  let out = ''
  for (const bar of own) {
    if (!bar.constraints) continue
    const y = top + frame.laneTop(bar)
    const upper = y - 5, lower = y + frame.barHeight + 5
    for (const kind of timelineConstraintKinds) {
      const time = bar.constraints[kind]
      if (time === undefined || time < window.start || time >= window.end) continue
      const x = frame.X(time)
      const violated = timelineConstraintViolated(bar, kind, time)
      const color = violated ? theme.constraintViolated : theme.constraint
      const start = kind.startsWith('start') || kind === 'fixedStart'
      const later = kind.endsWith('NoEarlierThan')
      const label = text.labels[kind] ?? defaultConstraintLabels[kind]
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
          + tag('polygon', { points: pointList([[x + side * 6, flag - 4.5], [x + side * 13, flag], [x + side * 6, flag + 4.5]]), fill: color })
      }
      const classes = ['vw-gantt-constraint', start ? 'vw-is-start' : 'vw-is-finish',
        kind === 'fixedStart' ? 'vw-is-fixed' : later ? 'vw-is-lower' : 'vw-is-upper', violated ? 'vw-is-violated' : '']
      const title = `${label} · ${frame.barLabel(bar)} ${frame.format(time)}` + (violated ? ` · ${text.violated}` : '')
      out += tag('g', { class: classes.filter(Boolean).join(' ') }, titleTag(title) + shape)
    }
  }
  return out
}

/** A dependency end: the time range it attaches to, its displayed row and its height in that row. */
type LinkEnd = { range: TimeRange; index: number; offset: number }

/**
 * Dependency connectors and their lag labels. The paths are computed from the window start and mirrored as a whole
 * for right-to-left output; the labels are placed as in GanttChart and mirrored point by point, so the text itself is
 * never mirrored.
 */
function timelineDependencies(
  dependencies: readonly TimelineDependency[], linkEnd: (id: string) => LinkEnd | undefined, highlighted: ReadonlySet<string>,
  options: { arrow: string; arrowHighlight: string; style?: DependencyPathStyle; formatLag: (lag: number) => string },
  frame: TimelineFrame<TimelineRow, TimelineBar>,
) {
  const { theme, rtl, local, headerHeight, rowHeight, axisWidth, labelArea } = frame
  let paths = '', lagLabels = ''
  for (const dep of dependencies) {
    const source = linkEnd(dep.from), target = linkEnd(dep.to)
    if (!source || !target) continue
    const ends = dependencyTimes(source.range, target.range, dep.type)
    const y1 = headerHeight + source.index * rowHeight + source.offset
    const y2 = headerHeight + target.index * rowHeight + target.offset
    const strong = highlighted.has(dep.id)
    paths += tag('path', {
      d: dependencyPath(round(local.toX(ends.from)), round(y1), round(local.toX(ends.to)), round(y2), options.style), fill: 'none',
      stroke: strong ? theme.dependencyHighlight : theme.edge, 'stroke-width': strong ? 2 : 1.3,
      'marker-end': `url(#${strong ? options.arrowHighlight : options.arrow})`,
    })
    if (dep.lag) {
      const point = lagLabelPoint(local.toX(ends.from), y1, local.toX(ends.to), y2, headerHeight + source.index * rowHeight, rowHeight)
      lagLabels += tag('text', {
        class: 'vw-gantt-lag', x: rtl ? axisWidth - point.x : labelArea + point.x, y: point.y,
        'text-anchor': point.anchor === 'middle' ? 'middle' : rtl ? 'end' : 'start', 'dominant-baseline': 'central',
        'font-size': 10, 'font-weight': 650, fill: strong ? theme.dependencyHighlight : theme.text, ...textHalo(theme.surface, 3),
      }, escapeXml(options.formatLag(dep.lag)))
    }
  }
  if (paths) paths = tag('g', { transform: rtl ? `matrix(-1 0 0 1 ${num(axisWidth)} 0)` : `translate(${num(labelArea)} 0)` }, paths)
  return { paths, lagLabels }
}

/** A vertical line across the body with a flag label at the top, for markers, the now line and the status date. */
function timelineFlag(x: number, text: string, color: string, strokeWidth: number, dashed: boolean, frame: TimelineFrame<TimelineRow, TimelineBar>) {
  const { rtl, headerHeight } = frame
  const flagWidth = 10 + 6 * Array.from(text).length
  return tag('line', {
    x1: x, y1: headerHeight, x2: x, y2: frame.totalHeight, stroke: color, 'stroke-width': strokeWidth,
    'stroke-dasharray': dashed ? '4 3' : undefined,
  }) + tag('rect', { x: rtl ? x - flagWidth : x, y: headerHeight, width: flagWidth, height: 16, fill: color })
    + tag('text', {
      x: rtl ? x - 5 : x + 5, y: headerHeight + 11.5, 'font-size': 10, fill: frame.theme.markerInk, ...textDirection(rtl),
    }, escapeXml(text))
}

/**
 * The marker lines, the now line and the status-date line with its progress line, which kinks to the progress point of
 * each bar (in `rowBars`, by displayed row) that is behind or ahead.
 */
function timelineLines(
  options: Pick<TimelineSvgOptions, 'markers' | 'now' | 'nowLabel' | 'statusDate' | 'statusDateLabel' | 'showProgressLine'>,
  rowBars: readonly (readonly TimelineBar[])[], frame: TimelineFrame<TimelineRow, TimelineBar>,
) {
  const { theme, window, X, format, headerHeight } = frame
  let out = ''
  for (const item of options.markers ?? []) {
    if (item.time < window.start || item.time >= window.end) continue
    out += tag('g', {}, titleTag(`${item.label} ${format(item.time)}`) + timelineFlag(X(item.time), item.label, theme.marker, 1, true, frame))
  }
  if (options.now !== undefined && options.now >= window.start && options.now <= window.end) {
    const label = options.nowLabel ?? 'Now'
    out += tag('g', {}, titleTag(`${label} ${format(options.now)}`) + timelineFlag(X(options.now), label, theme.now, 2, false, frame))
  }
  const status = options.statusDate
  if (status !== undefined && status >= window.start && status <= window.end) {
    const x = X(status)
    if (options.showProgressLine) {
      const kinks = rowBars.flatMap((own, index) => own.flatMap(bar => {
        const time = progressLineTime(bar, status)
        return time === undefined ? []
          : [{ x: X(time), y: headerHeight + index * frame.rowHeight + frame.laneTop(bar) + frame.barHeight / 2, reach: frame.barHeight / 2 }]
      }))
      out += tag('polyline', {
        class: 'vw-gantt-progress-line', fill: 'none', stroke: theme.status, 'stroke-width': 2, 'stroke-linejoin': 'round',
        points: pointList(progressLinePoints(x, headerHeight, headerHeight + frame.bodyHeight, kinks)),
      })
    }
    const label = options.statusDateLabel ?? 'Status date'
    out += tag('g', { class: 'vw-gantt-status-date' }, titleTag(`${label} ${format(status)}`) + timelineFlag(x, label, theme.status, 2, false, frame))
  }
  return out
}

/** The load histogram of each load row: load up to capacity, overload above it and a dashed capacity line. */
function timelineLoad(loadRows: readonly TimelineLoadRow[], histogram: Map<string, ResourceLoadHistogram>, loadRowHeight: number, frame: TimelineFrame<TimelineRow, TimelineBar>) {
  const { theme } = frame
  let out = ''
  loadRows.forEach((row, index) => {
    const { segments, peak } = histogram.get(row.id)!
    const peakScale = Math.max(1e-9, peak)
    const top = frame.loadTop + index * loadRowHeight + 4
    const height = loadRowHeight - 8
    for (const segment of segments) {
      if (!intersectsWindow(segment, frame.window)) continue
      const box = frame.span(segment.start, segment.end)
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
      out += tag('g', {}, titleTag(`${row.label} ${frame.format(segment.start)}–${frame.format(segment.end)}: ${segment.load} / ${segment.capacity}`) + shape)
    }
  })
  return out
}

/** Horizontal separators below every task row and load row, across both areas, and below the header. */
function timelineSeparators(rowCount: number, loadRowCount: number, loadRowHeight: number, frame: TimelineFrame<TimelineRow, TimelineBar>) {
  const { theme, width, headerHeight } = frame
  const line = (y: number) => tag('line', { x1: 0, y1: y, x2: width, y2: y, stroke: theme.border })
  let out = ''
  for (let index = 1; index <= rowCount; index++) out += line(headerHeight + index * frame.rowHeight - 0.5)
  for (let index = 1; index <= loadRowCount; index++) out += line(frame.loadTop + index * loadRowHeight - 0.5)
  return out + line(headerHeight - 0.5)
}

/** The label area: the corner, the row headings, the column cells and the load row headings. */
function timelineLabelArea<R extends TimelineRow>(
  shown: readonly RowTreeItem<R>[], columns: readonly TimelineColumn<R>[], summaries: Map<string, TimelineSummary> | undefined,
  options: { labelWidth: number; rowHeading: string; collapsed: ReadonlySet<string>; loadRows: readonly TimelineLoadRow[]; loadRowHeight: number },
  frame: TimelineFrame<R, TimelineBar>,
) {
  const { theme, rtl, labelArea, labelLeft, headerHeight, rowHeight, totalHeight } = frame
  const { labelWidth, loadRowHeight } = options
  /** A box measured from the inline start of the label area. */
  const labelBox = (inset: number, width: number) => ({ x: rtl ? labelLeft + labelArea - inset - width : labelLeft + inset, width })
  let out = tag('rect', { x: labelLeft, y: 0, width: labelArea, height: totalHeight, fill: theme.surfaceMuted })
  const edgeX = rtl ? labelLeft + 0.5 : labelArea - 0.5
  out += tag('line', { x1: edgeX, y1: 0, x2: edgeX, y2: totalHeight, stroke: theme.border })
  const name = labelBox(0, labelWidth)
  out += clippedText({ x: name.x, y: 0, width: name.width, height: headerHeight }, rtl, [
    { text: options.rowHeading, y: headerHeight / 2 + 4, size: 11, weight: 700, fill: theme.text, inset: 11 },
  ])
  let inset = labelWidth
  const columnBoxes = columns.map(column => {
    const box = labelBox(inset, column.width)
    inset += column.width
    const lineX = rtl ? box.x + box.width - 0.5 : box.x + 0.5
    out += tag('line', { x1: lineX, y1: 0, x2: lineX, y2: headerHeight + frame.bodyHeight, stroke: theme.border })
    out += clippedText({ x: box.x, y: 0, width: box.width, height: headerHeight }, rtl, [
      { text: column.label, y: headerHeight / 2 + 4, size: 11, weight: 700, fill: theme.text, inset: 6 },
    ])
    return { column, box }
  })
  shown.forEach((item, index) => {
    const top = headerHeight + index * rowHeight
    const nested = item.hasChildren || item.depth > 0
    let indent = nested ? 9 + Math.min(item.depth, 5) * 11 : 11
    const lines: Parameters<typeof clippedText>[2][number][] = []
    if (item.hasChildren) {
      lines.push({ text: options.collapsed.has(item.row.id) ? (rtl ? '◂' : '▸') : '▾', y: rowHeight / 2 + 4, size: 12, fill: theme.text, inset: indent })
      indent += 16
    }
    const detail = item.row.detail
    lines.push({ text: frame.rowLabel(item.row), y: detail ? rowHeight / 2 - 2 : rowHeight / 2 + 4, size: 12, weight: 700, fill: theme.text, inset: indent })
    if (detail) lines.push({ text: detail, y: rowHeight / 2 + 11, size: 10, fill: theme.muted, inset: indent })
    out += clippedText({ x: name.x, y: top, width: name.width, height: rowHeight }, rtl, lines)
    for (const { column, box } of columnBoxes) {
      out += clippedText({ x: box.x, y: top, width: box.width, height: rowHeight }, rtl, [{
        text: String(column.value(item.row, summaries?.get(item.row.id))), y: rowHeight / 2 + 4, size: 12, fill: theme.text, inset: 6,
      }])
    }
  })
  options.loadRows.forEach((row, index) => {
    const top = frame.loadTop + index * loadRowHeight
    out += clippedText({ x: labelLeft, y: top, width: labelArea, height: loadRowHeight }, rtl, [
      { text: row.label, y: row.detail ? loadRowHeight / 2 - 2 : loadRowHeight / 2 + 4, size: 12, weight: 700, fill: theme.text, inset: 11 },
      { text: row.detail ?? '', y: loadRowHeight / 2 + 11, size: 10, fill: theme.muted, inset: 11 },
    ])
  })
  return out
}

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
  const { full, window, offset, axisWidth } = timelineWindow(scale, options.timeRange)

  const columns = options.columns ?? []
  const columnsWidth = checkTimelineColumns(columns)

  const tree = createTimelineRowTree(rows)
  const collapsed = new Set(options.collapsedIds ?? [])
  const displayed = displayedRows(tree, collapsed)
  const rowRange = options.rowRange ?? { start: 0, end: displayed.length }
  if (!Number.isInteger(rowRange.start) || !Number.isInteger(rowRange.end) || rowRange.start < 0
    || rowRange.end < rowRange.start || rowRange.end > displayed.length) {
    throw new RangeError(`rowRange must be integers with 0 <= start <= end <= ${displayed.length} (the displayed row count)`)
  }
  const shown = displayed.slice(rowRange.start, rowRange.end)
  const rowIndex = new Map(shown.map((item, index) => [item.row.id, index]))
  const summaries = options.showSummaries || columns.length ? summarizeTimelineRows(tree, bars) : undefined

  const loadRowHeight = options.loadRowHeight ?? 44
  const loadRows = options.loadRows ?? []
  const loadRowIds = checkLoadRows(loadRows, options.loadSegments, loadRowHeight)
  const histogram = loadRowIds && resourceLoadHistogram(options.loadSegments ?? [], loadRowIds)

  const bands = options.headerBands ?? []
  checkBandsAndMarkers(bands, options.markers)
  const markerRanges = options.markerRanges ?? []
  checkMarkerRanges(markerRanges, new Set(rows.map(row => row.id)))
  if (options.now !== undefined && !Number.isFinite(options.now)) throw new RangeError('now must be finite')
  if (options.statusDate !== undefined && !Number.isFinite(options.statusDate)) throw new RangeError('statusDate must be finite')
  checkNonWorkingPeriods(options.nonWorkingPeriods)

  const anchor = options.tickAnchor ?? full.start
  if (!Number.isFinite(anchor)) throw new RangeError('tickAnchor must be finite')
  const step = timelineTickStep(options, scale, anchor)
  const ticks = timeTicks(window, step, anchor)
  const format = options.formatTime ?? defaultFormat
  const highlighted = new Set(options.highlightedDependencyIds ?? [])
  const highlightedBars = new Set(options.highlightedBarIds ?? [])
  const selection = baselineSelection(bars, options.baselineIds)
  const baselines: BaselineStyle = {
    selection,
    layout: baselineLayout(selection.ids.length),
    text: {
      label: options.baselineLabel ?? ((id: string) => id === timelineBaselineId ? 'Baseline' : id),
      formatTime: format, formatVariance: options.formatVariance ?? formatDependencyLag,
      start: options.varianceLabels?.start ?? 'start', finish: options.varianceLabels?.finish ?? 'finish',
      duration: options.varianceLabels?.duration ?? 'duration',
    },
    fills: [theme.baseline, theme.baseline2, theme.baseline3],
  }
  const constraintText: ConstraintText = { labels: options.constraintLabels ?? {}, violated: options.constraintViolatedLabel ?? 'violated' }

  // Geometry. `local` measures from the window start; `view` mirrors it for right-to-left output.
  const local: TimeScale = { width: axisWidth, toX: time => scale.toX(time) - offset, toTime: x => scale.toTime(x + offset) }
  const view = rtl ? mirrorTimeScale(local) : local
  const labelArea = labelWidth + columnsWidth
  const axisLeft = rtl ? 0 : labelArea
  const X = (time: number) => axisLeft + view.toX(time)
  const headerHeight = 40 + bandHeight * bands.length
  const bodyHeight = shown.length * rowHeight
  const loadTop = headerHeight + bodyHeight
  const totalHeight = loadTop + (histogram ? loadRows.length * loadRowHeight : 0)
  const width = labelArea + axisWidth
  const laneHeight = (rowHeight - 8) / laneCount
  const frame: TimelineFrame<R, B> = {
    theme, rtl, window, local, X,
    span: (start, end) => {
      const a = X(start), b = X(end)
      return { x: Math.min(a, b), width: Math.abs(b - a) }
    },
    axisWidth, labelArea, labelLeft: rtl ? axisWidth : 0, width, headerHeight, bodyHeight, loadTop, totalHeight, rowHeight,
    // Two or three baseline sets take `reserve` pixels from the bar so their strips fit in the lane.
    barHeight: Math.max(1, laneHeight - 6 - baselines.layout.reserve),
    laneTop: bar => 7 + (bar.lane ?? 0) * laneHeight,
    format, barLabel: options.barLabel ?? (bar => bar.label), rowLabel: options.rowLabel ?? (row => row.label),
  }

  const clip = prefix + '-axis', arrow = prefix + '-arrow', arrowHighlight = prefix + '-arrow-highlight'
  const defs = tag('clipPath', { id: clip }, tag('rect', { x: axisLeft, y: 0, width: axisWidth, height: totalHeight }))
    + arrowMarker(arrow, 6, theme.edge) + arrowMarker(arrowHighlight, 6, theme.dependencyHighlight)

  // Time area, back to front; everything here is clipped to the exported window.
  const ranges = timelineMarkerRanges(markerRanges, rowIndex, frame)
  let area = timelineNonWorking(options.nonWorkingPeriods ?? [], frame) + ranges.bands + timelineHeaderBands(bands, frame)
    + timelineTicks(ticks, step, frame) + ranges.labels
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
    if (summary && intersectsWindow(summary, window)) area += timelineSummaryBar(item.row, summary, top, frame)
    area += timelineBaselines(own, top, baselines, frame) + timelineFloats(own, top, frame)
      + own.map(bar => intersectsWindow(bar, window) ? timelineBar(bar, top, highlightedBars.has(bar.id), frame) : '').join('')
      + timelineDeadlines(own, top, frame) + timelineConstraints(own, top, constraintText, frame)
  })
  const barById = new Map(bars.map(bar => [bar.id, bar]))
  // A dependency end: a bar, or with `summaryDependencies` the rollup bar of a summary row, centred in its row.
  const linkEnd = (id: string): LinkEnd | undefined => {
    const bar = barById.get(id)
    if (bar) {
      const index = rowIndex.get(bar.rowId)
      return index === undefined ? undefined : { range: bar, index, offset: frame.laneTop(bar) + frame.barHeight / 2 }
    }
    const rollup = rollups.get(id)
    return rollup && { range: rollup, index: rowIndex.get(id)!, offset: rowHeight / 2 }
  }
  const links = timelineDependencies(dependencies, linkEnd, highlighted, {
    arrow, arrowHighlight, style: options.dependencyStyle, formatLag: options.formatLag ?? formatDependencyLag,
  }, frame)
  area += links.paths + timelineLines(options, shown.map(item => barsByRow.get(item.row.id) ?? []), frame)
  // Lag labels go above the marker, now and status-date lines so a line passing through a label does not cover its text.
  area += links.lagLabels
  if (histogram) area += timelineLoad(loadRows, histogram, loadRowHeight, frame)

  let out = ''
  if (background) out += tag('rect', { width, height: totalHeight, fill: theme.surface })
  out += tag('rect', { x: 0, y: 0, width, height: headerHeight, fill: theme.surfaceMuted })
  if (histogram) out += tag('rect', { x: 0, y: loadTop, width, height: totalHeight - loadTop, fill: theme.surfaceMuted })
  out += tag('g', { 'clip-path': `url(#${clip})` }, area)
  // Row separators span both areas.
  out += timelineSeparators(shown.length, histogram ? loadRows.length : 0, loadRowHeight, frame)
  if (labelArea > 0) {
    out += timelineLabelArea(shown, columns, summaries, {
      labelWidth, rowHeading: options.rowHeading ?? 'Rows', collapsed, loadRows: histogram ? loadRows : [], loadRowHeight,
    }, frame)
  }
  return svgDocument(width, totalHeight, options, font, defs, out)
}
