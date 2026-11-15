import type { GraphPoint } from '../core/graph.js'

/**
 * Payload of the NetworkGraph `node-drop` event (`droppable`). It refers to the DOM `DataTransfer`, so it is exported from
 * the Vue entry only; the core entry stays free of browser types.
 */
export interface GraphDrop {
  /** The drop position in chart coordinates, rounded to `snapGrid` when it is set. */
  point: GraphPoint
  clientX: number
  clientY: number
  /** The data of the HTML drag, as the browser supplied it. */
  dataTransfer: DataTransfer | null
}

/**
 * Payload of the GanttChart `bar-drop` event (`droppable`). Like `GraphDrop`, it refers to the DOM `DataTransfer`, so it
 * is exported from the Vue entry only. The chart does not read the data; the application resolves what was dropped.
 */
export interface TimelineDrop {
  /** Time under the drop point, snapped to the active `snap` and clamped to the time axis. */
  time: number
  /** The displayed task row under the drop point. Absent over the header and the load rows. */
  rowId?: string
  clientX: number
  clientY: number
  /** The data of the HTML drag, as the browser supplied it. */
  dataTransfer: DataTransfer | null
}
