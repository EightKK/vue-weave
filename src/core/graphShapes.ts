// Internal geometry of NetworkGraph node shapes and edge markers, shared by the component, the edge routing and the SVG
// export so that they draw the same outlines. `index.ts` does not export this module.
import type { GraphEdge, GraphEdgeMarker, GraphPoint } from './graph.js'
import type { NetworkNodeEvent, NetworkNodeMarker } from './types.js'

/** The node shapes drawn inside the box instead of a rectangle. */
export type GraphOutlineShape = 'diamond' | 'ellipse' | 'hexagon' | GraphFlowchartShape

/**
 * The flowchart and BPMN shapes. Unlike the first three outline shapes, some of them do not touch the middle of every
 * box side (a circle in a wide box, the slanted sides of a parallelogram, the wavy bottom of a document), so orthogonal
 * route ends are moved onto their outline.
 */
export type GraphFlowchartShape = 'circle' | 'stadium' | 'parallelogram' | 'document' | 'cylinder' | 'data-object'

const flowchartShapes: ReadonlySet<unknown> = new Set(['circle', 'stadium', 'parallelogram', 'document', 'cylinder', 'data-object'])

type Rect = { x: number; y: number; width: number; height: number }

/** The outline shape of a node, or undefined for a rectangle (`box`, `rounded`, no shape or an unknown value). */
export function graphOutlineShape(node: unknown): GraphOutlineShape | undefined {
  const shape = (node as { shape?: unknown } | undefined)?.shape
  return shape === 'diamond' || shape === 'ellipse' || shape === 'hexagon' || flowchartShapes.has(shape) ? shape as GraphOutlineShape : undefined
}

/** Whether a shape is one of the flowchart and BPMN shapes, whose route ends are moved onto the outline. */
export function isGraphFlowchartShape(shape: GraphOutlineShape | undefined): shape is GraphFlowchartShape {
  return flowchartShapes.has(shape)
}

// How far the pointed ends of a hexagon reach in from the box sides: 60-degree corners, at most a quarter of the width.
function hexagonInset(width: number, height: number) {
  return Math.min(height / 2 / Math.sqrt(3), width / 4)
}

/** An SVG element that draws an outline shape: an ellipse, or a polygon through its corner points. */
export type GraphOutlineElement =
  | { tag: 'ellipse'; cx: number; cy: number; rx: number; ry: number }
  | { tag: 'polygon'; points: GraphPoint[] }
  | { tag: 'path'; d: string }

/**
 * The outline of a shape in a `width` by `height` box at the origin, `inset` units inside the box on every side, as the
 * default renderer draws it (the rectangle shapes are inset by 2 as well).
 */
export function graphOutlineElement(shape: GraphOutlineShape, width: number, height: number, inset = 2): GraphOutlineElement {
  const w = Math.max(0, width - 2 * inset), h = Math.max(0, height - 2 * inset)
  const left = inset, top = inset, cx = width / 2, cy = height / 2
  if (isGraphFlowchartShape(shape)) return flowchartElement(shape, { x: left, y: top, width: w, height: h })
  if (shape === 'ellipse') return { tag: 'ellipse', cx, cy, rx: w / 2, ry: h / 2 }
  if (shape === 'diamond') {
    return { tag: 'polygon', points: [{ x: cx, y: top }, { x: left + w, y: cy }, { x: cx, y: top + h }, { x: left, y: cy }] }
  }
  const q = hexagonInset(w, h)
  return {
    tag: 'polygon', points: [
      { x: left, y: cy }, { x: left + q, y: top }, { x: left + w - q, y: top },
      { x: left + w, y: cy }, { x: left + w - q, y: top + h }, { x: left + q, y: top + h },
    ],
  }
}

/** The `points` attribute of a polygon, with coordinates rounded to hundredths. */
export function graphPolygonPoints(points: readonly GraphPoint[]): string {
  const format = (value: number) => String(Math.round(value * 100) / 100 + 0)
  return points.map(point => format(point.x) + ',' + format(point.y)).join(' ')
}

/**
 * Where the ray from the centre of a box towards a point leaves the outline of a shape inscribed in the box (touching
 * the middle of each box side, so the side midpoints, where ports and orthogonal routes attach, lie on the outline).
 * Returns undefined when the point is the centre.
 */
export function clipToGraphOutline(box: Rect, shape: GraphOutlineShape, toward: GraphPoint): GraphPoint | undefined {
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2
  const dx = toward.x - cx, dy = toward.y - cy
  if (!dx && !dy) return undefined
  if (isGraphFlowchartShape(shape)) return clipFlowchart(box, shape, dx, dy)
  const a = box.width / 2, b = box.height / 2, ux = Math.abs(dx), uy = Math.abs(dy)
  let t: number
  if (shape === 'ellipse') t = 1 / Math.sqrt((ux / a) ** 2 + (uy / b) ** 2)
  else if (shape === 'diamond') t = 1 / (ux / a + uy / b)
  else {
    // The top and bottom edges, and the slanted edges x + q·y/b = a of the pointed ends.
    const q = hexagonInset(box.width, box.height)
    t = a / (ux + q * uy / b)
    if (uy) t = Math.min(t, b / uy)
  }
  return { x: cx + dx * t, y: cy + dy * t }
}

/**
 * Where the line through a point of a box side, perpendicular to that side, meets the outline of a shape inscribed in
 * the box: the end of an orthogonal route that leaves the side at that point.
 */
export function graphOutlineAlong(box: Rect, shape: GraphOutlineShape, point: GraphPoint, side: 'left' | 'right' | 'top' | 'bottom'): GraphPoint {
  if (isGraphFlowchartShape(shape)) return flowchartAlong(box, shape, point, side)
  const a = box.width / 2, b = box.height / 2, cx = box.x + a, cy = box.y + b
  const across = side === 'left' || side === 'right'
  // The distance from the centre along the side, relative to the half side.
  const t = Math.min(1, across ? Math.abs(point.y - cy) / b : Math.abs(point.x - cx) / a)
  const half = across ? a : b
  let reach: number
  if (shape === 'ellipse') reach = half * Math.sqrt(1 - t * t)
  else if (shape === 'diamond') reach = half * (1 - t)
  else {
    // The pointed ends are on the left and right; the top and bottom sides are straight between them.
    const q = hexagonInset(box.width, box.height), dx = t * a
    reach = across ? a - q * t : dx <= a - q ? b : b * (a - dx) / q
  }
  if (across) return { x: side === 'right' ? cx + reach : cx - reach, y: point.y }
  return { x: point.x, y: side === 'bottom' ? cy + reach : cy - reach }
}

/**
 * The text anchors of a node label and detail centred in a shape of `height`. Plain rectangles use the same lines, so at
 * the default height of 58 they are 34 for a title alone, and 24 and 43 for a title with a detail line.
 */
export function graphOutlineText(width: number, height: number, detail: boolean, shape?: GraphOutlineShape) {
  // A cylinder moves its text below the rim of its top, by half the rim height.
  const shift = shape === 'cylinder' ? flowchartSizes(Math.max(0, width - 4), Math.max(0, height - 4)).rim / 2 : 0
  return { x: width / 2, title: height / 2 + (detail ? -5 : 5) + shift, detail: height / 2 + 14 + shift }
}

// Flowchart and BPMN shapes. Each is described by its drawing in a rectangle and by a polygon through its outline,
// with curves sampled finely enough (at most about 0.1 units off) for edge ends.

const format = (value: number) => String(Math.round(value * 100) / 100 + 0)

// The sizes of the curved and slanted parts of a shape in a `width` by `height` rectangle.
function flowchartSizes(width: number, height: number) {
  return {
    radius: Math.min(width, height) / 2,
    slant: Math.min(height * 0.36, width / 4),
    wave: Math.min(height / 10, 8),
    rim: Math.min(height / 6, width / 4, 12),
    fold: Math.min(width / 3, height / 3, 14),
  }
}

function flowchartElement(shape: GraphFlowchartShape, rect: Rect): GraphOutlineElement {
  const { x: left, y: top, width: w, height: h } = rect
  const right = left + w, bottom = top + h, cx = left + w / 2, cy = top + h / 2
  const { radius, slant, wave, rim, fold } = flowchartSizes(w, h)
  const f = format
  if (shape === 'circle') return { tag: 'ellipse', cx, cy, rx: radius, ry: radius }
  if (shape === 'parallelogram') {
    return { tag: 'polygon', points: [{ x: left + slant, y: top }, { x: right, y: top }, { x: right - slant, y: bottom }, { x: left, y: bottom }] }
  }
  if (shape === 'data-object') {
    return {
      tag: 'polygon',
      points: [{ x: left, y: top }, { x: right - fold, y: top }, { x: right, y: top + fold }, { x: right, y: bottom }, { x: left, y: bottom }],
    }
  }
  if (shape === 'stadium') {
    const r = radius, arc = `A ${f(r)} ${f(r)} 0 0 1`
    return {
      tag: 'path',
      d: `M ${f(left + r)} ${f(top)} H ${f(right - r)} ${arc} ${f(right)} ${f(top + r)} V ${f(bottom - r)} ${arc} ${f(right - r)} ${f(bottom)}`
        + ` H ${f(left + r)} ${arc} ${f(left)} ${f(bottom - r)} V ${f(top + r)} ${arc} ${f(left + r)} ${f(top)} Z`,
    }
  }
  if (shape === 'cylinder') {
    const arc = `A ${f(w / 2)} ${f(rim)} 0 0 1`
    return { tag: 'path', d: `M ${f(left)} ${f(top + rim)} ${arc} ${f(right)} ${f(top + rim)} V ${f(bottom - rim)} ${arc} ${f(left)} ${f(bottom - rim)} Z` }
  }
  // A document: a wavy bottom that rises towards the right and dips towards the left, inside the rectangle.
  const base = bottom - wave, lift = wave * 4 / 3
  return {
    tag: 'path',
    d: `M ${f(left)} ${f(top)} H ${f(right)} V ${f(base)} C ${f(right - w / 6)} ${f(base - lift)} ${f(cx + w / 6)} ${f(base - lift)} ${f(cx)} ${f(base)}`
      + ` C ${f(cx - w / 6)} ${f(base + lift)} ${f(left + w / 6)} ${f(base + lift)} ${f(left)} ${f(base)} Z`,
  }
}

/**
 * The lines drawn over an outline without fill, or undefined: the front rim of a cylinder's top and the fold of a data
 * object, for a `width` by `height` box at the origin and `inset` units inside it like `graphOutlineElement`.
 */
export function graphOutlineDetail(shape: GraphOutlineShape, width: number, height: number, inset = 2): string | undefined {
  if (shape !== 'cylinder' && shape !== 'data-object') return undefined
  const w = Math.max(0, width - 2 * inset), h = Math.max(0, height - 2 * inset)
  const left = inset, top = inset, right = left + w
  const { rim, fold } = flowchartSizes(w, h)
  const f = format
  if (shape === 'cylinder') return `M ${f(left)} ${f(top + rim)} A ${f(w / 2)} ${f(rim)} 0 0 0 ${f(right)} ${f(top + rim)}`
  return `M ${f(right - fold)} ${f(top)} V ${f(top + fold)} H ${f(right)}`
}

// Points of a cubic Bézier curve after its start, `steps` of them.
function sampleCubic(points: GraphPoint[], p0: GraphPoint, p1: GraphPoint, p2: GraphPoint, p3: GraphPoint, steps: number) {
  for (let i = 1; i <= steps; i++) {
    const t = i / steps, u = 1 - t
    points.push({
      x: u * u * u * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t * t * t * p3.x,
      y: u * u * u * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t * t * t * p3.y,
    })
  }
}

// Points of an elliptical arc from angle `from` to `to` (radians, y down), its start included.
function sampleArc(points: GraphPoint[], cx: number, cy: number, rx: number, ry: number, from: number, to: number, steps: number) {
  for (let i = 0; i <= steps; i++) {
    const angle = from + (to - from) * i / steps
    points.push({ x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) })
  }
}

// A closed polygon through the outline of a shape inscribed in a box (the circle is handled exactly elsewhere).
function flowchartPolygon(shape: Exclude<GraphFlowchartShape, 'circle'>, box: Rect): GraphPoint[] {
  const element = flowchartElement(shape, box)
  if (element.tag === 'polygon') return element.points
  const { x: left, y: top, width: w, height: h } = box
  const right = left + w, bottom = top + h, cx = left + w / 2
  const { radius: r, wave, rim } = flowchartSizes(w, h)
  const points: GraphPoint[] = []
  const quarter = Math.PI / 2
  if (shape === 'stadium') {
    sampleArc(points, right - r, top + r, r, r, -quarter, 0, 12)
    sampleArc(points, right - r, bottom - r, r, r, 0, quarter, 12)
    sampleArc(points, left + r, bottom - r, r, r, quarter, 2 * quarter, 12)
    sampleArc(points, left + r, top + r, r, r, 2 * quarter, 3 * quarter, 12)
  } else if (shape === 'cylinder') {
    sampleArc(points, cx, top + rim, w / 2, rim, Math.PI, 2 * Math.PI, 24)
    sampleArc(points, cx, bottom - rim, w / 2, rim, 0, Math.PI, 24)
  } else {
    const base = bottom - wave, lift = wave * 4 / 3
    points.push({ x: left, y: top }, { x: right, y: top }, { x: right, y: base })
    sampleCubic(points, { x: right, y: base }, { x: right - w / 6, y: base - lift }, { x: cx + w / 6, y: base - lift }, { x: cx, y: base }, 16)
    sampleCubic(points, { x: cx, y: base }, { x: cx - w / 6, y: base + lift }, { x: left + w / 6, y: base + lift }, { x: left, y: base }, 16)
  }
  return points
}

// Where the ray from the centre of the box along (dx, dy) leaves a flowchart outline.
function clipFlowchart(box: Rect, shape: GraphFlowchartShape, dx: number, dy: number): GraphPoint {
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2
  if (shape === 'circle') {
    const t = Math.min(box.width, box.height) / 2 / Math.hypot(dx, dy)
    return { x: cx + dx * t, y: cy + dy * t }
  }
  const points = flowchartPolygon(shape, box)
  let best = Infinity
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!, q = points[(i + 1) % points.length]!
    const ex = q.x - p.x, ey = q.y - p.y
    const denominator = dx * ey - dy * ex
    if (!denominator) continue
    // Solve centre + t·d = p + u·e.
    const t = ((p.x - cx) * ey - (p.y - cy) * ex) / denominator
    const u = ((p.x - cx) * dy - (p.y - cy) * dx) / denominator
    if (t > 0 && u >= -1e-9 && u <= 1 + 1e-9) best = Math.min(best, t)
  }
  // Every outline encloses its centre, so the ray always leaves it; the box border is the fallback.
  if (!Number.isFinite(best)) best = 1 / Math.max(Math.abs(dx) / (box.width / 2), Math.abs(dy) / (box.height / 2))
  return { x: cx + dx * best, y: cy + dy * best }
}

// Where the line through a point of a box side, perpendicular to that side, first meets a flowchart outline coming
// from that side. A line that misses the outline keeps the point.
function flowchartAlong(box: Rect, shape: GraphFlowchartShape, point: GraphPoint, side: 'left' | 'right' | 'top' | 'bottom'): GraphPoint {
  const across = side === 'left' || side === 'right'
  const cx = box.x + box.width / 2, cy = box.y + box.height / 2
  if (shape === 'circle') {
    const r = Math.min(box.width, box.height) / 2, offset = across ? point.y - cy : point.x - cx
    if (Math.abs(offset) > r) return point
    const reach = Math.sqrt(r * r - offset * offset)
    if (across) return { x: side === 'right' ? cx + reach : cx - reach, y: point.y }
    return { x: point.x, y: side === 'bottom' ? cy + reach : cy - reach }
  }
  const points = flowchartPolygon(shape, box)
  const level = across ? point.y : point.x
  let found: number | undefined
  const better = side === 'left' || side === 'top' ? (a: number, b: number) => a < b : (a: number, b: number) => a > b
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!, q = points[(i + 1) % points.length]!
    const a = across ? p.y : p.x, b = across ? q.y : q.x
    if (level < Math.min(a, b) || level > Math.max(a, b)) continue
    const pa = across ? p.x : p.y, qa = across ? q.x : q.y
    const value = a === b ? (better(pa, qa) ? pa : qa) : pa + (qa - pa) * (level - a) / (b - a)
    if (found === undefined || better(value, found)) found = value
  }
  if (found === undefined) return point
  return across ? { x: found, y: point.y } : { x: point.x, y: found }
}

// BPMN node decorations.

const nodeMarkers: ReadonlySet<unknown> = new Set(['exclusive', 'parallel', 'inclusive', 'event-based', 'message', 'timer', 'user', 'service', 'manual'])
const taskMarkers: ReadonlySet<unknown> = new Set(['user', 'service', 'manual'])

/** The BPMN marker of a node, or undefined without one or for an unknown value. */
export function graphNodeMarker(node: unknown): NetworkNodeMarker | undefined {
  const marker = (node as { marker?: unknown } | undefined)?.marker
  return nodeMarkers.has(marker) ? marker as NetworkNodeMarker : undefined
}

/** Whether a marker is a task type icon, drawn in the top inline-start corner rather than in the centre. */
export function isGraphTaskMarker(marker: NetworkNodeMarker | undefined): boolean {
  return taskMarkers.has(marker)
}

/** The BPMN event border of a node, or undefined without one or for an unknown value. */
export function graphNodeEvent(node: unknown): NetworkNodeEvent | undefined {
  const event = (node as { event?: unknown } | undefined)?.event
  return event === 'start' || event === 'intermediate' || event === 'end' ? event : undefined
}

/** Whether the default renderer draws the label of a node below its box. */
export function graphNodeLabelBelow(node: unknown): boolean {
  return (node as { labelPosition?: unknown } | undefined)?.labelPosition === 'below'
}

/** Stroke width of the outline of an `end` event. */
export const graphEndEventStroke = 3.5
/** How far inside the outline an `intermediate` event draws its second outline. */
export const graphIntermediateEventGap = 4

/** The anchors of a label drawn below a box of `height`: title and detail baselines, centred at `x`. */
export function graphBelowLabelText(width: number, height: number) {
  return { x: width / 2, title: height + 17, detail: height + 32 }
}

/** One stroke of a node marker: an unfilled path or circle in the node ink, `strokeWidth` wide. */
export type GraphNodeMarkerPart =
  | { tag: 'path'; d: string; strokeWidth: number }
  | { tag: 'circle'; cx: number; cy: number; r: number; strokeWidth: number }

/**
 * The drawing of a node marker in a `width` by `height` box at the origin: gateway and event symbols centred and sized
 * to the shorter side, task icons 16 units wide in the top inline-start corner (mirrored right to left).
 */
export function graphNodeMarkerParts(marker: NetworkNodeMarker, width: number, height: number, rtl = false): GraphNodeMarkerPart[] {
  const f = format
  if (isGraphTaskMarker(marker)) {
    const x0 = rtl ? width - 24 : 8, y0 = 7
    // Icon coordinates in a 16-unit square; the hand of a manual task points to the inline end.
    const x = (value: number) => f(x0 + (rtl ? 16 - value : value)), y = (value: number) => f(y0 + value)
    if (marker === 'user') {
      return [
        { tag: 'circle', cx: x0 + 8, cy: y0 + 4.5, r: 3.4, strokeWidth: 1.4 },
        { tag: 'path', d: `M ${x(2)} ${y(16)} Q ${x(2)} ${y(9.5)} ${x(8)} ${y(9.5)} Q ${x(14)} ${y(9.5)} ${x(14)} ${y(16)} Z`, strokeWidth: 1.4 },
      ]
    }
    if (marker === 'service') {
      const teeth: string[] = []
      for (let i = 0; i < 8; i++) {
        const angle = i * Math.PI / 4, c = Math.cos(angle), s = Math.sin(angle)
        teeth.push(`M ${f(x0 + 8 + 4.8 * c)} ${f(y0 + 8 + 4.8 * s)} L ${f(x0 + 8 + 7.6 * c)} ${f(y0 + 8 + 7.6 * s)}`)
      }
      return [
        { tag: 'circle', cx: x0 + 8, cy: y0 + 8, r: 4.8, strokeWidth: 1.4 },
        { tag: 'circle', cx: x0 + 8, cy: y0 + 8, r: 1.8, strokeWidth: 1.2 },
        { tag: 'path', d: teeth.join(' '), strokeWidth: 2.2 },
      ]
    }
    return [{
      tag: 'path', strokeWidth: 1.3,
      d: `M ${x(1)} ${y(6)} V ${y(15)} H ${x(10)} M ${x(1)} ${y(6)} H ${x(15)} M ${x(6)} ${y(9.5)} H ${x(15)}`
        + ` M ${x(6)} ${y(13)} H ${x(13)} M ${x(5)} ${y(2)} L ${x(8.5)} ${y(6)}`,
    }]
  }
  const cx = width / 2, cy = height / 2, size = Math.min(width, height)
  if (marker === 'exclusive') {
    const k = size * 0.16
    return [{ tag: 'path', d: `M ${f(cx - k)} ${f(cy - k)} L ${f(cx + k)} ${f(cy + k)} M ${f(cx + k)} ${f(cy - k)} L ${f(cx - k)} ${f(cy + k)}`, strokeWidth: 3.4 }]
  }
  if (marker === 'parallel') {
    const k = size * 0.22
    return [{ tag: 'path', d: `M ${f(cx)} ${f(cy - k)} V ${f(cy + k)} M ${f(cx - k)} ${f(cy)} H ${f(cx + k)}`, strokeWidth: 3.4 }]
  }
  if (marker === 'inclusive') return [{ tag: 'circle', cx, cy, r: Number(f(size * 0.19)), strokeWidth: 2.8 }]
  if (marker === 'event-based') {
    const r = size * 0.12
    const corners = Array.from({ length: 5 }, (_, i) => {
      const angle = -Math.PI / 2 + i * 2 * Math.PI / 5
      return f(cx + r * Math.cos(angle)) + ' ' + f(cy + r * Math.sin(angle))
    })
    return [
      { tag: 'circle', cx, cy, r: Number(f(size * 0.24)), strokeWidth: 1.2 },
      { tag: 'circle', cx, cy, r: Number(f(size * 0.2)), strokeWidth: 1.2 },
      { tag: 'path', d: 'M ' + corners.join(' L ') + ' Z', strokeWidth: 1.4 },
    ]
  }
  if (marker === 'message') {
    const w = size * 0.42, h = size * 0.28, left = cx - w / 2, top = cy - h / 2
    return [{
      tag: 'path', strokeWidth: 1.4,
      d: `M ${f(left)} ${f(top)} H ${f(left + w)} V ${f(top + h)} H ${f(left)} Z M ${f(left)} ${f(top)} L ${f(cx)} ${f(top + h * 0.55)} L ${f(left + w)} ${f(top)}`,
    }]
  }
  // A timer: a clock face with tick marks at the quarters and hands at ten past twelve.
  const r = size * 0.26
  const ticks = [0, 1, 2, 3].map(i => {
    const angle = i * Math.PI / 2, c = Math.cos(angle), s = Math.sin(angle)
    return `M ${f(cx + 0.72 * r * c)} ${f(cy + 0.72 * r * s)} L ${f(cx + r * c)} ${f(cy + r * s)}`
  })
  return [
    { tag: 'circle', cx, cy, r: Number(f(r)), strokeWidth: 1.4 },
    { tag: 'path', d: ticks.join(' ') + ` M ${f(cx)} ${f(cy)} V ${f(cy - 0.62 * r)} M ${f(cx)} ${f(cy)} L ${f(cx + 0.45 * r)} ${f(cy - 0.2 * r)}`, strokeWidth: 1.4 },
  ]
}

const markerKinds: readonly string[] = ['arrow', 'open-arrow', 'hollow-arrow', 'circle', 'diamond', 'bar', 'none']

/** The marker at one end of an edge, with the defaults filled in. Throws RangeError for an unknown marker. */
export function graphEdgeMarker(edge: GraphEdge, end: 'start' | 'end'): GraphEdgeMarker {
  const value = end === 'end' ? edge.markerEnd : edge.markerStart
  if (value === undefined) return end === 'end' ? 'arrow' : 'none'
  if (!markerKinds.includes(value)) throw new RangeError(`Unknown edge marker on graph edge ${edge.id}: ${String(value)}`)
  return value
}

/**
 * How a marker is drawn in its 7 by 7 marker box (`refY` 3.5): `fill` paints the shape in the edge colour, `stroke`
 * outlines it, and `hollow` outlines it and fills it with the graph background.
 */
export interface GraphMarkerDrawing {
  refX: number
  paint: 'fill' | 'stroke' | 'hollow'
  strokeWidth?: number
  element: { tag: 'path'; d: string } | { tag: 'circle'; cx: number; cy: number; r: number }
}

const markerDrawings: Record<Exclude<GraphEdgeMarker, 'none'>, GraphMarkerDrawing> = {
  'arrow': { refX: 6, paint: 'fill', element: { tag: 'path', d: 'M 0 0 L 7 3.5 L 0 7 z' } },
  'open-arrow': { refX: 6, paint: 'stroke', strokeWidth: 1.2, element: { tag: 'path', d: 'M 1 0.8 L 6.2 3.5 L 1 6.2' } },
  'hollow-arrow': { refX: 6.2, paint: 'hollow', strokeWidth: 1.1, element: { tag: 'path', d: 'M 0.8 0.8 L 6.2 3.5 L 0.8 6.2 z' } },
  'circle': { refX: 6.1, paint: 'hollow', strokeWidth: 1.1, element: { tag: 'circle', cx: 3.5, cy: 3.5, r: 2.6 } },
  'diamond': { refX: 6.4, paint: 'hollow', strokeWidth: 1.1, element: { tag: 'path', d: 'M 0.6 3.5 L 3.5 1.1 L 6.4 3.5 L 3.5 5.9 z' } },
  'bar': { refX: 6, paint: 'stroke', strokeWidth: 1.3, element: { tag: 'path', d: 'M 5.4 0.8 V 6.2' } },
}

export function graphMarkerDrawing(kind: Exclude<GraphEdgeMarker, 'none'>): GraphMarkerDrawing {
  return markerDrawings[kind]
}
