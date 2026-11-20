// Default drawings of NetworkGraph items: the content of a node without the `node` slot, and the edge markers. Pure
// render helpers; the item components themselves live in the component.
import { createCommentVNode, h, toDisplayString } from 'vue'
import type { GraphBox, GraphEdge, GraphEdgeMarker } from '../../core/graph.js'
import {
  graphEdgeMarker, graphMarkerDrawing, graphOutlineElement, graphOutlineShape, graphOutlineText, graphPolygonPoints,
} from '../../core/graphShapes.js'
import type { NetworkNode } from '../../core/types.js'

/**
 * The default content of a node: a rectangle with text from the inline start edge, or a diamond, ellipse or hexagon
 * (class vw-node-shape) inside the box with centred text.
 */
export function defaultNode(node: NetworkNode, box: GraphBox, rtl: boolean) {
  const outline = graphOutlineShape(node)
  if (!outline) {
    return [
      h('rect', { x: '2', y: '2', width: box.width - 4, height: box.height - 4, rx: node.shape === 'rounded' ? 19 : 8 }),
      h('text', { x: rtl ? box.width - 13 : 13, y: node.detail ? 24 : 34, class: 'vw-node-title' }, toDisplayString(node.label)),
      node.detail
        ? h('text', { key: 0, x: rtl ? box.width - 13 : 13, y: '43', class: 'vw-node-detail' }, toDisplayString(node.detail))
        : createCommentVNode('', true),
    ]
  }
  const shape = graphOutlineElement(outline, box.width, box.height)
  const text = graphOutlineText(box.width, box.height, Boolean(node.detail))
  return [
    shape.tag === 'ellipse'
      ? h('ellipse', { class: 'vw-node-shape', cx: shape.cx, cy: shape.cy, rx: shape.rx, ry: shape.ry })
      : h('polygon', { class: 'vw-node-shape', points: graphPolygonPoints(shape.points) }),
    h('text', { x: text.x, y: text.title, 'text-anchor': 'middle', class: 'vw-node-title' }, toDisplayString(node.label)),
    node.detail
      ? h('text', { key: 0, x: text.x, y: text.detail, 'text-anchor': 'middle', class: 'vw-node-detail' }, toDisplayString(node.detail))
      : createCommentVNode('', true),
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

