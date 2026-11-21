// Reading GraphPalette drags back. It refers to the DOM `DataTransfer`, so it is exported from the Vue entry only.
import { graphPaletteMimeType, parsePalettePayload, type GraphPaletteDrop } from '../core/diagramEditor.js'

/** Anything that carries the data of an HTML drag: a drop event of NetworkGraph or GanttChart, or the DataTransfer. */
export type PaletteDropSource = { readonly dataTransfer: Pick<DataTransfer, 'getData'> | null } | Pick<DataTransfer, 'getData'>

/**
 * The palette item that a drop carries: its ID and data, or undefined when the drag did not come from a GraphPalette
 * (no payload under `graphPaletteMimeType`, or one that is not `{ id, data }` JSON). Pass the `node-drop` event of
 * NetworkGraph, the `bar-drop` event of GanttChart or a `DataTransfer`. Look the ID up in your own item list rather than
 * trusting `data`: any page can start a drag with this MIME type.
 */
export function readPaletteDrop(source: PaletteDropSource | null | undefined): GraphPaletteDrop | undefined {
  if (!source) return undefined
  const transfer = 'getData' in source ? source : source.dataTransfer
  if (!transfer) return undefined
  let text: string
  try {
    text = transfer.getData(graphPaletteMimeType)
  } catch {
    return undefined
  }
  return parsePalettePayload(text)
}
