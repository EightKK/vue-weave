// Default drawings of NetworkGraph items: the content of a node without the `node` slot, and the edge markers. Pure
// render helpers; the item components themselves live in the component.
import { createCommentVNode, h, toDisplayString } from 'vue'
import type { GraphBox, GraphEdge, GraphEdgeMarker } from '../../core/graph.js'
import {
  graphBelowLabelText, graphEdgeMarker, graphIntermediateEventGap, graphMarkerDrawing, graphNodeEvent, graphNodeLabelBelow, graphNodeMarker,
  graphNodeMarkerParts, graphOutlineDetail, graphOutlineElement, graphOutlineShape, graphOutlineText, graphPolygonPoints, isGraphTaskMarker,
  type GraphOutlineShape,
} from '../../core/graphShapes.js'
import type { NetworkNode, NetworkNodeEvent, NetworkNodeMarker } from '../../core/types.js'

/**
 * The default content of a node: a rectangle with text from the inline start edge, or an outline shape (class
 * vw-node-shape) inside the box with centred text, plus the opt-in BPMN event border and marker. Labels drawn below
 * the box are left to `belowLabel`, outside the clipped content.
 */
export function defaultNode(node: NetworkNode, box: GraphBox, rtl: boolean) {
  const outline = graphOutlineShape(node)
  const event = graphNodeEvent(node), marker = graphNodeMarker(node), below = graphNodeLabelBelow(node)
  const eventClass = event && 'vw-node-event-' + event
  const decorations = [...eventOutline(node, box, outline, event), ...markerNodes(marker, box, rtl)]
  if (!outline) {
    // A task icon in the corner moves the text away from it.
    const inset = isGraphTaskMarker(marker) ? 30 : 13
    const lines = graphOutlineText(box.width, box.height, Boolean(node.detail))
    return [
      h('rect', { x: '2', y: '2', width: box.width - 4, height: box.height - 4, rx: node.shape === 'rounded' ? 19 : 8, ...eventClass && { class: eventClass } }),
      ...decorations,
      ...below ? [] : [
        h('text', { x: rtl ? box.width - inset : inset, y: lines.title, class: 'vw-node-title' }, toDisplayString(node.label)),
        node.detail
          ? h('text', { key: 0, x: rtl ? box.width - inset : inset, y: lines.detail, class: 'vw-node-detail' }, toDisplayString(node.detail))
          : createCommentVNode('', true),
      ],
    ]
  }
  const shape = graphOutlineElement(outline, box.width, box.height)
  const text = graphOutlineText(box.width, box.height, Boolean(node.detail), outline)
  const shapeClass = eventClass ? 'vw-node-shape ' + eventClass : 'vw-node-shape'
  const detail = graphOutlineDetail(outline, box.width, box.height)
  return [
    shape.tag === 'ellipse'
      ? h('ellipse', { class: shapeClass, cx: shape.cx, cy: shape.cy, rx: shape.rx, ry: shape.ry })
      : shape.tag === 'path'
        ? h('path', { class: shapeClass, d: shape.d })
        : h('polygon', { class: shapeClass, points: graphPolygonPoints(shape.points) }),
    ...detail ? [h('path', { class: 'vw-node-shape-detail', d: detail })] : [],
    ...decorations,
    ...below ? [] : [
      h('text', { x: text.x, y: text.title, 'text-anchor': 'middle', class: 'vw-node-title' }, toDisplayString(node.label)),
      node.detail
        ? h('text', { key: 0, x: text.x, y: text.detail, 'text-anchor': 'middle', class: 'vw-node-detail' }, toDisplayString(node.detail))
        : createCommentVNode('', true),
    ],
  ]
}

// The inner outline of an intermediate event, inside the drawn outline.
function eventOutline(node: NetworkNode, box: GraphBox, outline: GraphOutlineShape | undefined, event: NetworkNodeEvent | undefined) {
  if (event !== 'intermediate') return []
  const inset = 2 + graphIntermediateEventGap
  if (!outline) {
    return [h('rect', {
      class: 'vw-node-shape-inner', x: inset, y: inset, width: Math.max(0, box.width - 2 * inset), height: Math.max(0, box.height - 2 * inset),
      rx: Math.max(0, (node.shape === 'rounded' ? 19 : 8) - graphIntermediateEventGap),
    })]
  }
  const inner = graphOutlineElement(outline, box.width, box.height, inset)
  const attributes = { class: 'vw-node-shape vw-node-shape-inner' }
  return [inner.tag === 'ellipse'
    ? h('ellipse', { ...attributes, cx: inner.cx, cy: inner.cy, rx: inner.rx, ry: inner.ry })
    : inner.tag === 'path' ? h('path', { ...attributes, d: inner.d }) : h('polygon', { ...attributes, points: graphPolygonPoints(inner.points) })]
}

// The BPMN marker of a node, decorative and hidden from assistive technology.
function markerNodes(marker: NetworkNodeMarker | undefined, box: GraphBox, rtl: boolean) {
  if (!marker) return []
  return [h('g', { class: 'vw-node-marker', 'aria-hidden': 'true', 'data-vw-marker': marker }, graphNodeMarkerParts(marker, box.width, box.height, rtl).map(part =>
    part.tag === 'circle'
      ? h('circle', { cx: part.cx, cy: part.cy, r: part.r, 'stroke-width': part.strokeWidth })
      : h('path', { d: part.d, 'stroke-width': part.strokeWidth }),
  ))]
}

/** The label and detail of a node with `labelPosition: 'below'`, centred under the box and not clipped; else none. */
export function belowLabel(node: NetworkNode, box: GraphBox) {
  if (!graphNodeLabelBelow(node)) return []
  const text = graphBelowLabelText(box.width, box.height)
  return [
    h('text', { x: text.x, y: text.title, 'text-anchor': 'middle', class: 'vw-node-title vw-node-label-below' }, toDisplayString(node.label)),
    ...node.detail
      ? [h('text', { x: text.x, y: text.detail, 'text-anchor': 'middle', class: 'vw-node-detail vw-node-label-below' }, toDisplayString(node.detail))]
      : [],
  ]
}

// Edge markers. The default end arrow is the marker in the template's defs; every other marker gets an ID derived from
// it and is only rendered while an edge uses it, so the markup without other markers is unchanged.
export type MarkerKind = Exclude<GraphEdgeMarker, 'none'>
export function markerId(base: string, kind: MarkerKind, end: 'start' | 'end') {
  return kind === 'arrow' && end === 'end' ? base : base + (end === 'start' ? '-start-' : '-') + kind
}
/** The `marker-start` or `marker-end` value of an edge, or undefined without a marker. */
export function markerUrl(base: string, edge: GraphEdge, end: 'start' | 'end') {
  const kind = graphEdgeMarker(edge, end)
  return kind === 'none' ? undefined : `url(#${markerId(base, kind, end)})`
}
/** The markers the edges use besides the default end arrow, by ID in order of first use. Unknown markers throw RangeError. */
export function usedMarkers(edges: readonly GraphEdge[], base: string) {
  const used = new Map<string, { kind: MarkerKind; end: 'start' | 'end' }>()
  for (const edge of edges) {
    for (const end of ['start', 'end'] as const) {
      const kind = graphEdgeMarker(edge, end)
      if (kind !== 'none' && (kind !== 'arrow' || end === 'start')) used.set(markerId(base, kind, end), { kind, end })
    }
  }
  return [...used]
}
/**
 * A marker drawn in the colour of the edge that uses it (context-stroke). A hollow marker is filled with the stage
 * background through the vw-edge-marker-hollow class.
 */
export function markerNode(id: string, kind: MarkerKind, end: 'start' | 'end') {
  const { refX, paint, strokeWidth, element } = graphMarkerDrawing(kind)
  const colors = paint === 'fill' ? { fill: 'context-stroke' } : {
    ...paint === 'hollow' && { class: 'vw-edge-marker-hollow' }, fill: 'none', stroke: 'context-stroke', 'stroke-width': strokeWidth,
    'stroke-linecap': 'round', 'stroke-linejoin': 'round',
  }
  return h('marker', { key: id, id, markerWidth: '7', markerHeight: '7', refX, refY: '3.5', orient: end === 'start' ? 'auto-start-reverse' : 'auto' }, [
    element.tag === 'path' ? h('path', { d: element.d, ...colors }) : h('circle', { cx: element.cx, cy: element.cy, r: element.r, ...colors }),
  ])
}

