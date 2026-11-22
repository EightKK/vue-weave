// The camera arithmetic of NetworkGraph: content bounds, fitting, zooming around a point, pinch, minimap navigation and
// auto-pan steps. A camera `{ x, y, scale }` draws a chart point `p` at stage pixel `x + p.x * scale` (and likewise for
// y); the stage is `viewport` pixels large.
import type { GraphPoint } from '../../core/graph.js'
import type { GraphRect } from '../../core/graphView.js'
import type { GraphViewport } from '../../core/types.js'

export type StageSize = { width: number; height: number }
export type ContentBounds = { left: number; top: number; right: number; bottom: number; width: number; height: number }

/** The largest camera scale. */
export const maxScale = 3

/**
 * The layout box `[0, width] x [0, height]` grown to every rectangle in `frames` (group frames, swimlanes and pools,
 * which can reach past the layout's own origin and size).
 */
export function contentBounds(width: number, height: number, frames: Iterable<GraphRect>): ContentBounds {
  let left = 0, top = 0, right = width, bottom = height
  for (const frame of frames) {
    left = Math.min(left, frame.x)
    top = Math.min(top, frame.y)
    right = Math.max(right, frame.x + frame.width)
    bottom = Math.max(bottom, frame.y + frame.height)
  }
  return { left, top, right, bottom, width: right - left, height: bottom - top }
}

/** The scale at which the whole content fits the viewport, or 1 when there is none. */
export function wholeScale(viewport: StageSize, content: StageSize) {
  const scale = Math.min(viewport.width / content.width, viewport.height / content.height)
  return Number.isFinite(scale) && scale > 0 ? scale : 1
}

/** The scale at which content of `width` x `height` fits the viewport with `padding` pixels around it. */
export function paddedScale(viewport: StageSize, width: number, height: number, padding: number) {
  return Math.min(Math.max(1, viewport.width - 2 * padding) / width, Math.max(1, viewport.height - 2 * padding) / height)
}

export function clampScale(scale: number, minScale: number) {
  return Math.max(minScale, Math.min(maxScale, scale))
}

export function validScale(scale: number, minScale: number) {
  // A small tolerance keeps a fitted viewport restorable after floating-point round trips.
  return Number.isFinite(scale) && scale >= minScale * (1 - 1e-9) && scale <= maxScale
}

export function scaleError(minScale: number) {
  return new RangeError(`Viewport scale must be between ${minScale === 0.1 ? '0.1' : 'the fit scale ' + minScale} and 3`)
}

export interface FitCameraOptions {
  /** Fit to view (the whole graph at any scale) rather than the automatic initial view. */
  overview: boolean
  /** Screen margin of an overview fit. */
  padding: number
  minScale: number
  wholeScale: number
  /** The selected node's box: a narrow automatic view keeps it in view horizontally. */
  focus?: GraphRect
}

/** The camera of Fit to view (`overview`) or of the automatic view. */
export function fitCamera(viewport: StageSize, content: ContentBounds, options: FitCameraOptions): GraphViewport {
  const { width, height } = viewport
  const { overview, padding, minScale, focus } = options
  const whole = options.wholeScale
  const padded = overview && padding > 0 ? Math.max(minScale, paddedScale(viewport, content.width, content.height, padding)) : whole
  // Fit to view shows the whole graph at any scale. The automatic initial view keeps at least 0.1 to stay readable.
  const overviewScale = Math.min(1.15, overview ? padded : Math.max(0.1, whole))
  const scale = overview || width >= 650 ? overviewScale
    : Math.max(overviewScale, Math.min(0.72, height / content.height))
  const canvasWidth = content.width * scale
  const focusX = focus ? (focus.x + focus.width / 2) * scale : 0
  const originX = -content.left * scale
  return {
    x: canvasWidth <= width ? (width - canvasWidth) / 2 + originX
      : Math.max(width - canvasWidth + originX, Math.min(originX, width / 2 - focusX)),
    y: (height - content.height * scale) / 2 - content.top * scale,
    scale,
  }
}

/** The bounds of a nonempty list of rectangles. */
export function rectsBounds(rects: Iterable<GraphRect>) {
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
  for (const rect of rects) {
    left = Math.min(left, rect.x)
    top = Math.min(top, rect.y)
    right = Math.max(right, rect.x + rect.width)
    bottom = Math.max(bottom, rect.y + rect.height)
  }
  return { left, top, right, bottom }
}

/** The camera at `scale` that keeps the chart point under stage pixel (`x`, `y`) in place. */
export function zoomAround(camera: GraphViewport, scale: number, x: number, y: number): GraphViewport {
  const ratio = scale / camera.scale
  return { x: x - (x - camera.x) * ratio, y: y - (y - camera.y) * ratio, scale }
}

/**
 * The camera of a two-finger pinch: the chart point under the initial midpoint of the fingers (on the camera `start`)
 * follows the midpoint of `a` and `b` at `scale`. Points are client coordinates; `stage` is the stage's client origin.
 */
export function pinchCamera(start: GraphViewport, midpoint: GraphPoint, a: GraphPoint, b: GraphPoint, stage: { left: number; top: number }, scale: number): GraphViewport {
  const worldX = (midpoint.x - stage.left - start.x) / start.scale
  const worldY = (midpoint.y - stage.top - start.y) / start.scale
  return {
    x: (a.x + b.x) / 2 - stage.left - worldX * scale,
    y: (a.y + b.y) / 2 - stage.top - worldY * scale,
    scale,
  }
}

/** The camera at `scale` centred on a chart point, clamped into the content (the minimap's navigation). */
export function contentCameraAt(content: ContentBounds, point: GraphPoint, viewport: StageSize, scale: number): GraphViewport {
  return {
    scale,
    x: viewport.width / 2 - Math.min(content.right, Math.max(content.left, point.x)) * scale,
    y: viewport.height / 2 - Math.min(content.bottom, Math.max(content.top, point.y)) * scale,
  }
}

/** The chart point at the centre of the stage. */
export function cameraCenter(camera: GraphViewport, viewport: StageSize): GraphPoint {
  const { x, y, scale } = camera
  return { x: (viewport.width / 2 - x) / scale, y: (viewport.height / 2 - y) / scale }
}

/** Camera steps of the arrow keys on the stage and the minimap, in stage pixels. */
export const panKeySteps: Readonly<Record<string, readonly [number, number]>> = {
  ArrowLeft: [35, 0], ArrowRight: [-35, 0], ArrowUp: [0, 35], ArrowDown: [0, -35],
}

/** Depth of the band along the stage edges that auto-pans, in stage pixels. */
export const autoPanEdge = 40
/** Auto-pan step per frame with the pointer at or beyond an edge, in stage pixels. */
export const autoPanSpeed = 20

/**
 * The camera step of one auto-pan frame for a pointer at `point` (client coordinates) over a stage at `rect`: faster
 * the closer the pointer is to an edge. Towards the start, panning stops a margin beyond the chart origin or the
 * content, whichever is further out.
 */
export function autoPanStep(
  rect: { left: number; top: number; right: number; bottom: number }, point: GraphPoint, camera: GraphViewport, content: ContentBounds,
): GraphPoint {
  const speed = (distance: number) => distance < autoPanEdge
    ? Math.ceil(Math.min(1, (autoPanEdge - distance) / autoPanEdge) * autoPanSpeed) : 0
  const { x, y, scale } = camera
  const limitX = autoPanEdge - Math.min(0, content.left) * scale, limitY = autoPanEdge - Math.min(0, content.top) * scale
  let stepX = speed(point.x - rect.left) - speed(rect.right - point.x)
  let stepY = speed(point.y - rect.top) - speed(rect.bottom - point.y)
  if (stepX > 0) stepX = Math.max(0, Math.min(stepX, limitX - x))
  if (stepY > 0) stepY = Math.max(0, Math.min(stepY, limitY - y))
  return { x: stepX, y: stepY }
}
