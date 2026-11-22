// Placement of NetworkGraph's HTML overlays (the tooltip, the node and edge toolbars and the inline label editor) in
// stage pixels. They are placed in screen pixels, so their content keeps its size at every zoom level.
import type { GraphPoint } from '../../core/graph.js'
import type { GraphRect } from '../../core/graphView.js'
import type { GraphViewport } from '../../core/types.js'
import type { StageSize } from './camera.js'

/** The edges of an item on the stage, in stage pixels. */
export type StageEdges = { left: number; right: number; top: number; bottom: number }

/** The edges of a chart rectangle in stage pixels, under `camera`. */
export function stageEdges(rect: GraphRect, camera: GraphViewport): StageEdges {
  const { x, y, scale } = camera
  return { left: x + rect.x * scale, right: x + (rect.x + rect.width) * scale, top: y + rect.y * scale, bottom: y + (rect.y + rect.height) * scale }
}

/** A chart point in stage pixels, under `camera`. */
export function stagePoint(point: GraphPoint, camera: GraphViewport): GraphPoint {
  return { x: camera.x + point.x * camera.scale, y: camera.y + point.y * camera.scale }
}

/** Whether an item lies wholly outside the stage. */
function offStage(item: StageEdges, viewport: StageSize) {
  return item.right < 0 || item.left > viewport.width || item.bottom < 0 || item.top > viewport.height
}

/**
 * A toolbar centred above an item, or below it when there is too little room above; undefined while the item is
 * outside the stage.
 */
export function toolbarPlacement(item: StageEdges, viewport: StageSize) {
  if (offStage(item, viewport)) return undefined
  const below = item.top < 44
  return { below, style: { left: Math.min(viewport.width, Math.max(0, (item.left + item.right) / 2)) + 'px', top: (below ? item.bottom : item.top) + 'px' } }
}

/**
 * The tooltip of an item: after it (before it in right-to-left), or on the other side when that has more room;
 * undefined while the item is outside the stage.
 */
export function tooltipPlacement(item: StageEdges, viewport: StageSize, rtl: boolean) {
  if (offStage(item, viewport)) return undefined
  const { width, height } = viewport
  const gap = 8, room = 180
  const before = item.left - gap, after = width - item.right - gap
  const placeBefore = rtl ? before >= room || before >= after : after < room && before > after
  return {
    left: (placeBefore ? before : item.right + gap) + 'px',
    top: Math.max(4, Math.min(item.top, height - 28)) + 'px',
    transform: placeBefore ? 'translateX(-100%)' : undefined,
  }
}

/**
 * The inline label editor over a node: at least 120 pixels wide so the text stays editable when zoomed out, growing
 * from the text start, and vertically centred on the box.
 */
export function nodeLabelEditorStyle(box: GraphRect, camera: GraphViewport, rtl: boolean) {
  const { x, y, scale } = camera
  const width = Math.max(120, box.width * scale)
  const left = rtl ? x + (box.x + box.width) * scale - width : x + box.x * scale
  return { left: left + 'px', top: y + (box.y + box.height / 2) * scale + 'px', width: width + 'px' }
}

/** The inline label editor at an edge's label anchor. */
export function edgeLabelEditorStyle(anchor: GraphPoint, camera: GraphViewport) {
  const point = stagePoint(anchor, camera)
  return { left: point.x + 'px', top: point.y + 'px' }
}
