// CSV (RFC 4180): `toCsv`, `parseCsv` and the GanttChart tables `timelineCsvTable` and `timelineFromCsvTable`.
// Re-exported by `interchange.ts`.
import { timelineWbsCodes } from './rowHierarchy.js'
import { createTimelineRowTree } from './timeline.js'
import type { TimelineBar, TimelineRow } from './types.js'

/** A CSV cell: text, a finite number or an empty cell. */
export type CsvCell = string | number | undefined

export interface CsvOptions {
  /**
   * Neutralize spreadsheet formulas: a text cell (a string, not a number) that starts with `=`, `+`, `-`, `@`, a tab or
   * a carriage return is written with a leading apostrophe (`'=1+1`), so a spreadsheet shows it as text instead of
   * evaluating it. Number cells, such as `-2`, are written unchanged. `parseCsv` does not remove the apostrophe.
   * Default false: text is written as given.
   */
  escapeFormulas?: boolean
}

const formulaStart = /^[=+\-@\t\r]/

/**
 * Build RFC 4180 CSV text: fields separated by commas, records ended by CRLF, and fields that contain a comma, a
 * double quote, CR or LF enclosed in double quotes with inner quotes doubled. `undefined` is an empty field. Throws a
 * RangeError for a non-finite number. Spreadsheet formulas are kept unless `options.escapeFormulas` is true; set it
 * when the file may be opened in a spreadsheet and the text is untrusted.
 */
export function toCsv(table: readonly (readonly CsvCell[])[], options: CsvOptions = {}): string {
  const escapeFormulas = options.escapeFormulas === true
  return table.map(record => record.map(cell => {
    if (cell === undefined) return ''
    if (typeof cell === 'number') {
      if (!Number.isFinite(cell)) throw new RangeError('CSV numbers must be finite')
      return String(cell)
    }
    let text = String(cell)
    if (escapeFormulas && formulaStart.test(text)) text = '\'' + text
    return /[",\r\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text
  }).join(',') + '\r\n').join('')
}

/** A column of `timelineCsvTable`. */
export type TimelineCsvColumn = 'row' | 'wbs' | 'bar' | 'start' | 'end' | 'progress'

export interface TimelineCsvOptions {
  /** Start and end text. Default ISO 8601 in UTC, such as 2026-11-09T08:00:00.000Z. */
  formatTime?: (time: number) => string
  /** Columns in order. Default all: row, wbs, bar, start, end, progress. */
  columns?: readonly TimelineCsvColumn[]
  /** Header texts. Defaults: Row, WBS, Bar, Start, End, Progress. */
  headers?: Partial<Record<TimelineCsvColumn, string>>
}

const csvHeaders: Record<TimelineCsvColumn, string> = { row: 'Row', wbs: 'WBS', bar: 'Bar', start: 'Start', end: 'End', progress: 'Progress' }

/**
 * A table for `toCsv`: a header record and one record per bar, ordered by row in tree preorder and then by bar input
 * order. Cells are the row label, the row's WBS code (`timelineWbsCodes`), the bar label, the formatted start and end
 * and the progress from 0 to 1 (empty without progress). Throws an Error for invalid rows, a bar of an unknown row and
 * an unknown column.
 */
export function timelineCsvTable(
  rows: readonly TimelineRow[], bars: readonly TimelineBar[], options: TimelineCsvOptions = {},
): CsvCell[][] {
  const tree = createTimelineRowTree(rows)
  const codes = timelineWbsCodes(rows)
  const columns = options.columns ?? (Object.keys(csvHeaders) as TimelineCsvColumn[])
  for (const column of columns) if (!Object.hasOwn(csvHeaders, column)) throw new Error('Unknown CSV column: ' + column)
  const format = options.formatTime ?? ((time: number) => new Date(time).toISOString())
  const byRow = new Map<string, TimelineBar[]>()
  for (const bar of bars) {
    if (!codes.has(bar.rowId)) throw new Error('Unknown row for bar: ' + bar.id)
    let list = byRow.get(bar.rowId)
    if (!list) byRow.set(bar.rowId, list = [])
    list.push(bar)
  }
  const table: CsvCell[][] = [columns.map(column => options.headers?.[column] ?? csvHeaders[column])]
  for (const { row } of tree) {
    for (const bar of byRow.get(row.id) ?? []) {
      const cells: Record<TimelineCsvColumn, CsvCell> = {
        row: row.label, wbs: codes.get(row.id), bar: bar.label, start: format(bar.start), end: format(bar.end), progress: bar.progress,
      }
      table.push(columns.map(column => cells[column]))
    }
  }
  return table
}

export interface CsvParseOptions {
  /** Field separator: one character other than a double quote, CR or LF. Default `,`. */
  delimiter?: string
}

/**
 * Parse RFC 4180 CSV text into records of fields, the inverse of `toCsv`. Records end with CRLF, LF or a lone CR, and a
 * final line break is optional. Fields enclosed in double quotes can contain the delimiter, line breaks and doubled
 * quotes (`""` is one quote). A quote inside an unquoted field is kept as text. A leading byte order mark is removed.
 * Every field is a string; an empty line is a record with one empty field, and empty text has no records.
 *
 * Throws an Error with the line and column for an unterminated quoted field or text after a closing quote, and an
 * Error for an invalid delimiter.
 */
export function parseCsv(text: string, options: CsvParseOptions = {}): string[][] {
  const delimiter = options.delimiter ?? ','
  if (typeof delimiter !== 'string' || delimiter.length !== 1 || delimiter === '"' || delimiter === '\r' || delimiter === '\n') {
    throw new Error('The CSV delimiter must be one character other than a double quote, CR or LF')
  }
  const source = String(text)
  const input = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source
  const records: string[][] = []
  if (!input) return records
  let record: string[] = []
  let field = ''
  let index = 0, line = 1, lineStart = 0
  const length = input.length
  while (index < length) {
    const fieldStart = index
    if (input[index] === '"') {
      // A quoted field runs to the next quote that is not doubled.
      const openLine = line, openColumn = index - lineStart + 1
      index++
      for (;;) {
        if (index >= length) throw new Error(`Unterminated quoted CSV field starting at line ${openLine}, column ${openColumn}`)
        const char = input[index]!
        if (char === '"') {
          if (input[index + 1] === '"') {
            field += '"'
            index += 2
            continue
          }
          index++
          break
        }
        if (char === '\r' || char === '\n') {
          if (char === '\r' && input[index + 1] === '\n') {
            field += '\r'
            index++
          }
          field += input[index]!
          index++
          line++
          lineStart = index
          continue
        }
        field += char
        index++
      }
      const next = input[index]
      if (next !== undefined && next !== delimiter && next !== '\r' && next !== '\n') {
        throw new Error(`Unexpected text after a closing quote at line ${line}, column ${index - lineStart + 1}`)
      }
    } else {
      while (index < length) {
        const char = input[index]!
        if (char === delimiter || char === '\r' || char === '\n') break
        index++
      }
      field = input.slice(fieldStart, index)
    }
    record.push(field)
    field = ''
    const char = input[index]
    if (char === delimiter) {
      index++
      // A delimiter at the end of a line or of the text leaves an empty last field.
      const after = input[index]
      if (after === undefined || after === '\r' || after === '\n') record.push('')
    }
    if (input[index] === '\r' || input[index] === '\n') {
      index += input[index] === '\r' && input[index + 1] === '\n' ? 2 : 1
      line++
      lineStart = index
      records.push(record)
      record = []
    }
  }
  if (record.length) records.push(record)
  return records
}

export interface TimelineCsvImportOptions {
  /** Read a start or end cell as a time; return NaN for text that is not a time. */
  parseTime: (text: string) => number
  /**
   * The column of each field, in order, as `timelineCsvTable` wrote them. The first record is a header and is
   * skipped. Default: the columns are found by matching the header record against `headers`, ignoring case and
   * surrounding white space, and fields under other headers are ignored.
   */
  columns?: readonly (TimelineCsvColumn | undefined)[]
  /** Header texts to look for without `columns`. Defaults: Row, WBS, Bar, Start, End, Progress. */
  headers?: Partial<Record<TimelineCsvColumn, string>>
}

export interface TimelineCsvImport {
  rows: TimelineRow[]
  bars: TimelineBar[]
}

const wbsPattern = /^[1-9]\d*(\.[1-9]\d*)*$/
/** The deepest WBS code `timelineFromCsvTable` reads, in levels, so a short file cannot make it build huge prefixes. */
const maxWbsDepth = 1000
const decimalPattern = /^\+?(\d+\.?\d*|\.\d+)$/

/**
 * Read a table written by `timelineCsvTable` (for example from `parseCsv`) back into rows and bars. The table needs a
 * `bar`, `start` and `end` column and a `row` or `wbs` column; `progress` is optional.
 *
 * With a WBS column, each distinct code is a row with the ID `row-<code>`, the label of the first of its `row` cells
 * that is not blank (or the code when there is none) and the row of the code without its last part as parent. A
 * parent code that has no record of its own becomes a row labelled with its code. Without a WBS column, each distinct row label is a top-level row with the
 * ID `row-1`, `row-2`, … in order of appearance. Rows are returned in tree preorder; sibling order follows the WBS
 * numbers, or the order of appearance without WBS codes. Bars get the IDs `bar-1`, `bar-2`, … in record order, the
 * label of their `bar` cell, the parsed start and end and, when the progress cell is not empty, the progress from 0
 * to 1. Records whose fields are all empty are skipped.
 *
 * A custom header takes precedence over another column's default header. Throws an Error for missing or repeated
 * columns, for two custom headers that are equal (ignoring case and surrounding white space) and an Error naming the line (the one-based record number, with the
 * header on line 1) for an invalid WBS code, a RangeError for a WBS code of more than 1,000 levels, a time that `parseTime` cannot read, an end before the start and a
 * progress that is not a plain decimal number from 0 to 1 (such as `0.5`; not `0x1` or `1e0`).
 */
export function timelineFromCsvTable(table: readonly (readonly CsvCell[])[], options: TimelineCsvImportOptions): TimelineCsvImport {
  if (typeof options?.parseTime !== 'function') throw new Error('timelineFromCsvTable needs a parseTime function')
  const [header, ...records] = table
  if (!header) throw new Error('The CSV table has no header record')
  const position = new Map<TimelineCsvColumn, number>()
  if (options.columns) {
    options.columns.forEach((column, index) => {
      if (column === undefined) return
      if (!Object.hasOwn(csvHeaders, column)) throw new Error('Unknown CSV column: ' + column)
      if (position.has(column)) throw new Error('Repeated CSV column: ' + column)
      position.set(column, index)
    })
  } else {
    // A custom header takes precedence over another column's default header; two custom headers must differ.
    const wanted = new Map<string, TimelineCsvColumn>()
    const custom = new Set<string>()
    const columns = Object.keys(csvHeaders) as TimelineCsvColumn[]
    for (const column of columns) {
      if (options.headers?.[column] === undefined) continue
      const key = String(options.headers[column]).trim().toLowerCase()
      const other = wanted.get(key)
      if (other !== undefined) {
        throw new Error(`The CSV columns ${other} and ${column} have the same header text: ${key}; give each a distinct header`)
      }
      wanted.set(key, column)
      custom.add(column)
    }
    for (const column of columns) {
      const key = csvHeaders[column].trim().toLowerCase()
      if (!custom.has(column) && !wanted.has(key)) wanted.set(key, column)
    }
    header.forEach((cell, index) => {
      const column = wanted.get(String(cell ?? '').trim().toLowerCase())
      if (column === undefined) return
      if (position.has(column)) throw new Error('Repeated CSV column: ' + column)
      position.set(column, index)
    })
  }
  for (const column of ['bar', 'start', 'end'] as const) {
    if (!position.has(column)) throw new Error('The CSV table has no ' + (options.headers?.[column] ?? csvHeaders[column]) + ' column')
  }
  if (!position.has('row') && !position.has('wbs')) throw new Error('The CSV table needs a Row or WBS column')
  const text = (record: readonly CsvCell[], column: TimelineCsvColumn) => {
    const index = position.get(column)
    const cell = index === undefined ? undefined : record[index]
    return cell === undefined ? '' : String(cell)
  }
  // Rows by WBS code (or by label without codes), in order of appearance.
  const found = new Map<string, { id: string; label?: string; code?: string }>()
  const bars: TimelineBar[] = []
  records.forEach((record, offset) => {
    const line = offset + 2
    if (record.every(cell => cell === undefined || String(cell) === '')) return
    const label = text(record, 'row')
    let key: string
    if (position.has('wbs')) {
      const code = text(record, 'wbs').trim()
      if (!wbsPattern.test(code)) throw new Error(`Invalid WBS code on CSV line ${line}: ${code || '(empty)'}`)
      // Ancestors first, so a parent without records of its own still exists. The prefixes end at each dot, and the
      // climb stops at the first one already found, since its own ancestors were added with it.
      const missing: string[] = []
      let levels = 1
      for (let dot = code.indexOf('.'); dot >= 0; dot = code.indexOf('.', dot + 1)) levels++
      if (levels > maxWbsDepth) {
        throw new RangeError(`The WBS code on CSV line ${line} has ${levels} levels; at most ${maxWbsDepth} are supported`)
      }
      for (let end = code.length; end > 0 && !found.has(code.slice(0, end)); end = code.lastIndexOf('.', end - 1)) {
        missing.push(code.slice(0, end))
      }
      for (let i = missing.length - 1; i >= 0; i--) found.set(missing[i]!, { id: 'row-' + missing[i]!, code: missing[i]! })
      key = code
      const row = found.get(code)!
      // A blank row cell is no label, so a later record of the same code can still name the row.
      if (position.has('row') && row.label === undefined && label.trim()) row.label = label
    } else {
      key = label
      if (!found.has(key)) found.set(key, { id: 'row-' + (found.size + 1), label })
    }
    const startText = text(record, 'start'), endText = text(record, 'end')
    const start = options.parseTime(startText), end = options.parseTime(endText)
    if (typeof start !== 'number' || !Number.isFinite(start)) throw new RangeError(`Invalid start time on CSV line ${line}: ${startText}`)
    if (typeof end !== 'number' || !Number.isFinite(end)) throw new RangeError(`Invalid end time on CSV line ${line}: ${endText}`)
    if (end < start) throw new RangeError(`The bar on CSV line ${line} ends before it starts`)
    const bar: TimelineBar = { id: 'bar-' + (bars.length + 1), rowId: found.get(key)!.id, label: text(record, 'bar'), start, end }
    const progressText = text(record, 'progress').trim()
    if (progressText) {
      // Plain decimal notation only: no hexadecimal, binary, octal or exponent forms.
      const progress = decimalPattern.test(progressText) ? Number(progressText) : NaN
      if (!Number.isFinite(progress) || progress < 0 || progress > 1) {
        throw new RangeError(`Progress must be a number from 0 to 1 on CSV line ${line}: ${progressText}`)
      }
      bar.progress = progress
    }
    bars.push(bar)
  })
  let entries = [...found.values()]
  if (position.has('wbs')) {
    // Tree preorder: the children of each code ordered by their last part as a number, then visited depth first with a
    // stack. Parts have no leading zeros, so comparing their digit strings by length and then lexically is exact at
    // any size. Every code's parent is in `found`, because the ancestors were added with it.
    const compareParts = (x: string, y: string) => x.length - y.length || (x < y ? -1 : x > y ? 1 : 0)
    const children = new Map<string, { entry: typeof entries[number]; last: string }[]>()
    for (const entry of entries) {
      const cut = entry.code!.lastIndexOf('.')
      const parent = cut < 0 ? '' : entry.code!.slice(0, cut)
      let list = children.get(parent)
      if (!list) children.set(parent, list = [])
      list.push({ entry, last: entry.code!.slice(cut + 1) })
    }
    for (const list of children.values()) list.sort((x, y) => compareParts(x.last, y.last))
    const ordered: typeof entries = []
    const stack = [...(children.get('') ?? [])].reverse()
    while (stack.length) {
      const { entry } = stack.pop()!
      ordered.push(entry)
      const list = children.get(entry.code!)
      if (list) for (let i = list.length - 1; i >= 0; i--) stack.push(list[i]!)
    }
    entries = ordered
  }
  const rows = entries.map(entry => {
    const row: TimelineRow = { id: entry.id, label: entry.label ?? entry.code ?? '' }
    const cut = entry.code?.lastIndexOf('.') ?? -1
    if (cut > 0) row.parentId = 'row-' + entry.code!.slice(0, cut)
    return row
  })
  return { rows, bars }
}
