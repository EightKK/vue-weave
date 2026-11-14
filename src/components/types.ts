import type { GraphPoint } from '../core/graph.js'

/**
 * Payload of the NetworkGraph `drop` event (`droppable`). It refers to the DOM `DataTransfer`, so it is exported from
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
