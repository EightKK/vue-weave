// Spreadsheet text and batch helpers for GanttChart `spreadsheet` mode. Pure functions: no Vue, no DOM.
import { duplicateIdError, invalidIdError, isId, unknownReferenceError } from './ids.js'
import type { TimelineFieldEdit } from './fieldEditing.js'
import type { TimelineCellEdit, TimelineRow } from './types.js'

/**
 * Read tab-separated clipboard text into records of cells, the way spreadsheet applications write it.
 *
 * Records end at CRLF, LF or CR; one line break at the end of the text is ignored, so `a\tb\r\n` is one record.
 * A cell that starts with a double quote is read as quoted (doubled quotes inside it become one, and it may span
 * lines) only when its closing quote is followed by a tab, a line break or the end of the text. Otherwise the quote is
 * ordinary text, so `5" bolt` and `"A" grade` read as written. Empty text is one empty cell. Never throws for a string.
 */
export function parseSheetText(text: string): string[][] {
  let input = String(text)
  if (input.charCodeAt(0) === 0xfeff) input = input.slice(1)
  if (input.endsWith('\r\n')) input = input.slice(0, -2)
  else if (input.endsWith('\n') || input.endsWith('\r')) input = input.slice(0, -1)
  const records: string[][] = []
  let record: string[] = []
  let index = 0
  const length = input.length
  for (;;) {
    let cell: string | undefined
    if (input[index] === '"') {
      // Look for the closing quote; accept the quoted form only if a separator follows it.
      let value = '', at = index + 1
      for (;;) {
        if (at >= length) break
        const char = input[at]!
        if (char === '"') {
          if (input[at + 1] === '"') { value += '"'; at += 2; continue }
          const next = input[at + 1]
          if (next === undefined || next === '\t' || next === '\r' || next === '\n') { cell = value; index = at + 1 }
          break
        }
        value += char
        at++
      }
    }
    if (cell === undefined) {
      let end = index
      while (end < length && input[end] !== '\t' && input[end] !== '\r' && input[end] !== '\n') end++
      cell = input.slice(index, end)
      index = end
    }
    record.push(cell)
    const char = input[index]
    if (char === '\t') { index++; continue }
    records.push(record)
    record = []
    if (char === undefined) break
    index += char === '\r' && input[index + 1] === '\n' ? 2 : 1
  }
  return records
}

/**
 * Write records of cells as tab-separated text with CRLF line breaks, as spreadsheet applications read it. A cell that
 * contains a tab, a line break or a double quote is quoted, with inner quotes doubled, so {@link parseSheetText} reads
 * the same records back.
 */
export function formatSheetText(records: readonly (readonly string[])[]): string {
  return records.map(record => record.map(cell => {
    const value = String(cell)
    return /["\t\r\n]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value
  }).join('\t')).join('\r\n')
}

/** The edits of a GanttChart `sheet-edit` batch, a `field-edit` or a `cell-edit`, as {@link applyTimelineSheetEdit} reads them. */
export interface TimelineSheetChanges<R extends TimelineRow = TimelineRow> {
  fieldEdits?: readonly TimelineFieldEdit<R>[]
  cellEdits?: readonly TimelineCellEdit[]
}

/** How {@link applyTimelineSheetEdit} writes one edit into a row. Each callback returns a new row and must not mutate it. */
export interface TimelineSheetAppliers<R extends TimelineRow = TimelineRow> {
  /** Writes a typed value (`edit.after`) of `edit.fieldId`. Required when the change has field edits. */
  field?: (row: R, edit: TimelineFieldEdit<R>) => R
  /** Writes the text of a plain column (`edit.after`) of `edit.columnId`. Required when the change has cell edits. */
  cell?: (row: R, edit: TimelineCellEdit) => R
}

/**
 * Apply a spreadsheet batch (or single field and cell edits) to rows as one step. Returns a new array in the same
 * order; rows without edits keep their identity, and several edits of one row are applied in order (field edits
 * first). Throws an Error for an invalid or duplicate row ID, an edit of an unknown row, or a change that has edits of
 * a kind without its applier; nothing is applied then. A callback that changes the row ID also throws an Error.
 */
export function applyTimelineSheetEdit<R extends TimelineRow>(
  rows: readonly R[], change: TimelineSheetChanges<R>, appliers: TimelineSheetAppliers<R>,
): R[] {
  const positions = new Map<string, number>()
  for (let i = 0; i < rows.length; i++) {
    const id = rows[i]!.id
    if (!isId(id)) throw invalidIdError('row', id)
    if (positions.has(id)) throw duplicateIdError('row', id)
    positions.set(id, i)
  }
  const fieldEdits = change.fieldEdits ?? []
  const cellEdits = change.cellEdits ?? []
  if (fieldEdits.length && !appliers.field) throw new Error('applyTimelineSheetEdit needs a field applier for field edits')
  if (cellEdits.length && !appliers.cell) throw new Error('applyTimelineSheetEdit needs a cell applier for cell edits')
  for (const edit of fieldEdits) if (!positions.has(edit.rowId)) throw unknownReferenceError('row', 'sheet edit', edit.rowId)
  for (const edit of cellEdits) if (!positions.has(edit.rowId)) throw unknownReferenceError('row', 'sheet edit', edit.rowId)
  const result = rows.slice()
  const write = (rowId: string, update: (row: R) => R) => {
    const at = positions.get(rowId)!
    const next = update(result[at]!)
    if (next?.id !== rowId) throw new Error('A sheet edit applier must keep the row ID: ' + rowId)
    result[at] = next
  }
  for (const edit of fieldEdits) write(edit.rowId, row => appliers.field!(row, edit))
  for (const edit of cellEdits) write(edit.rowId, row => appliers.cell!(row, edit))
  return result
}
