// Pure model of the TreeGrid component: validation and indexing of rows, columns and sparse cells, the displayed lines
// for a set of expanded rows, row and column windows, the treegrid keyboard pattern, cell values and states, entity
// matches for linked highlights, and the editing helpers (cell, spreadsheet and row proposals and their apply
// functions). No Vue, no DOM: it runs in Node, workers and on servers. Every traversal is a loop.
import { formatFieldValue, parseFieldValue, validateFieldValue, type FieldValue, type TimelineFieldSpec } from './fieldEditing.js'
import { checkId, duplicateIdError, invalidIdError, isId, uniqueIds, unknownReferenceError, withContext } from './ids.js'
import { formatSheetText, parseSheetText } from './sheetEditing.js'
import { createTimelineRowTree, timelineLabelColumnId } from './timeline.js'
import { filterTimelineRows, type TimelineRowCompare, type TimelineViewDiagnostic, type TimelineViewFilter, type TimelineViewSort } from './timelineView.js'
import type { ChartTone, TimelineRow, TimelineRowMove, TimelineRowPosition } from './types.js'
import type { TimeBucketCell } from './timeBuckets.js'
import type { EntityRef } from './viewBindings.js'
import type { WindowedCellStatus } from './windowedData.js'

/** A value a TreeGrid cell can hold. */
export type TreeGridValue = string | number | boolean

/**
 * A TreeGrid row: a position in the tree (its `id`), not the thing it shows. `entities` names what it stands for; the
 * same entity may appear in several rows (one part used in two assemblies), and an entity highlight marks all of them.
 */
export interface TreeGridRow<D = unknown> extends TimelineRow<D> {
  /** The entities this row stands for, reported on activation and matched by `matchTreeGridEntities`. */
  entities?: readonly EntityRef[]
  /**
   * Load status of the row's children, for children loaded on demand. `unloaded`, `loading` and `failed` make the row
   * expandable even without child rows and show a status line under it while it is expanded; `loaded-empty` and
   * `loaded` without child rows make it a leaf.
   */
  childStatus?: WindowedCellStatus
}

/**
 * What a cell states instead of a value: `none` (known to have no value), `unknown` (not known), `not-applicable`, and
 * the load states `unloaded`, `loading` and `failed` (the value is not loaded).
 */
export type TreeGridCellStatus = 'none' | 'unknown' | 'not-applicable' | 'unloaded' | 'loading' | 'failed'
/** What a cell that the data does not list means: blank (`empty`, the default) or one of the stated statuses. */
export type TreeGridMissingCell = 'empty' | 'none' | 'unknown' | 'not-applicable'
/** The resolved state of a displayed cell. `value` covers every value, including `0`, `false` and `''`. */
export type TreeGridCellState = 'value' | 'empty' | TreeGridCellStatus

/** What a column accessor returns, or what a sparse cell carries besides its position. */
export interface TreeGridCellContent {
  value?: TreeGridValue
  /** A status instead of a value. A cell with a status shows the status, also when it has a value. */
  status?: TreeGridCellStatus
  /** Display text that replaces the formatted value. */
  label?: string
  tone?: ChartTone
  /** The entities this cell stands for, reported on activation and matched by `matchTreeGridEntities`. */
  entities?: readonly EntityRef[]
  /** False keeps an editable column's cell read-only. */
  editable?: boolean
}

/** A sparse cell: the value of one row in one column that has no `value` accessor. */
export interface TreeGridCell extends TreeGridCellContent {
  rowId: string
  columnId: string
}

/** A cell position by IDs, for highlights. */
export interface TreeGridCellRef {
  rowId: string
  columnId: string
}

/**
 * The typed editor of a column: a `TimelineFieldSpec` without `id` and `get` (the column supplies both). The kinds are
 * `text`, `number`, `select`, `checkbox` (booleans) and `time` (dates and times, with `utcOffsetMinutes`, `timeZone` or
 * a custom `parse` and `format`); `duration` works too. Multiple selection is not supported.
 */
export type TreeGridEditor = Omit<TimelineFieldSpec, 'id' | 'get'>

/** A TreeGrid column. `R` is the row type. */
export interface TreeGridColumn<R extends TreeGridRow = TreeGridRow> {
  id: string
  label: string
  /** Width in CSS pixels; finite and positive. */
  width: number
  /**
   * Reads the cell of a field column from its row. Return a value, a `TreeGridCellContent`, `null` for `none` or
   * `undefined` for a missing cell. Columns without it read the sparse `cells`.
   */
  value?: (row: R) => TreeGridValue | TreeGridCellContent | null | undefined
  /** Overrides the grid's `missingCell` for this column. */
  missingCell?: TreeGridMissingCell
  /** Text alignment of the cells. Default `end` for numbers in the default rendering, else `start`. */
  align?: 'start' | 'center' | 'end'
  /** The typed editor. A column without one cannot be edited. */
  editor?: TreeGridEditor
  /** Whether cells of this column can be edited (with an `editor` and the grid's `editable`). Default true. */
  editable?: boolean | ((row: R) => boolean)
  /**
   * Returns the row with a new value of this field column, for `applyTreeGridEdits`. `null` clears it. Sparse columns
   * do not need it.
   */
  update?: (row: R, value: FieldValue) => R
}

export interface TreeGridInput<R extends TreeGridRow = TreeGridRow> {
  rows: readonly R[]
  columns: readonly TreeGridColumn<R>[]
  cells?: readonly TreeGridCell[]
  /** What a missing cell means. Default `empty`. */
  missingCell?: TreeGridMissingCell
}

/** The validated input, built by `createTreeGridIndex`. Treat it as read-only. */
export interface TreeGridIndex<R extends TreeGridRow = TreeGridRow> {
  readonly rows: readonly R[]
  readonly columns: readonly TreeGridColumn<R>[]
  /** The rows in tree preorder, with their zero-based depth and the preorder index after their subtree. */
  readonly tree: readonly { row: R; depth: number; hasChildren: boolean; afterSubtree: number }[]
  readonly rowById: ReadonlyMap<string, R>
  readonly columnIndex: ReadonlyMap<string, number>
  /** Sparse cells by row ID, then column ID. */
  readonly cells: ReadonlyMap<string, ReadonlyMap<string, TreeGridCell>>
  /** Number of child rows of each row that has any. */
  readonly childCounts: ReadonlyMap<string, number>
  readonly rootCount: number
  readonly missingCell: TreeGridMissingCell
}

/** One displayed line: a row, or the status line of an expanded row whose children are not (all) loaded. */
export interface TreeGridLine<R extends TreeGridRow = TreeGridRow> {
  kind: 'row' | 'status'
  /** The row, or for a status line the row whose children it describes. */
  row: R
  /** One-based tree level (`aria-level`). */
  level: number
  expandable: boolean
  expanded: boolean
  /** One-based position among the displayed siblings, and their count (a status line counts as a sibling). */
  posinset: number
  setsize: number
  /** Line index of the parent row, or -1 at the top level. */
  parent: number
  /** The children status of a status line. */
  status?: WindowedCellStatus
}

/** The displayed lines and where each row and status line is. */
export interface TreeGridLines<R extends TreeGridRow = TreeGridRow> {
  lines: readonly TreeGridLine<R>[]
  /** Line index of each displayed row. */
  rowLine: ReadonlyMap<string, number>
  /** Line index of each displayed status line, by the ID of its row. */
  statusLine: ReadonlyMap<string, number>
}

/**
 * A cell of the grid by IDs: `columnId` undefined is the tree column (the row header); `status: true` is the status
 * line under row `rowId`.
 */
export interface TreeGridPosition {
  rowId: string
  columnId?: string
  status?: boolean
}

/** A cell by indexes: displayed line and column, where column 0 is the tree column and `n` is `columns[n - 1]`. */
export interface TreeGridCursor {
  line: number
  column: number
}

/** A rectangular range of cells between two corners (in any order). */
export interface TreeGridRange {
  anchor: TreeGridCursor
  focus: TreeGridCursor
}

/** `[start, end)` of a window over lines or columns. */
export interface TreeGridSpan {
  start: number
  end: number
}

/** A resolved cell. */
export interface TreeGridCellView {
  state: TreeGridCellState
  value?: TreeGridValue
  label?: string
  tone?: ChartTone
  /** The cell's own entities. */
  entities: readonly EntityRef[]
  /** `column` for a field column, `cell` for a listed sparse cell, `missing` for one the data does not list. */
  source: 'column' | 'cell' | 'missing'
  editable?: boolean
}

/** The keys of a key event that the grid reads. */
export interface TreeGridKeyInput {
  key: string
  ctrlKey?: boolean
  metaKey?: boolean
  shiftKey?: boolean
  altKey?: boolean
}

export interface TreeGridKeyContext {
  lines: readonly TreeGridLine<any>[]
  /** Number of columns including the tree column. */
  columnCount: number
  /** Whole lines in the viewport, for PageUp and PageDown. */
  pageSize: number
  /** Right-to-left: ArrowLeft and ArrowRight swap. */
  rtl?: boolean
}

/** What a navigation key does. Keys the pattern does not use give undefined. */
export type TreeGridKeyAction =
  | { type: 'move'; to: TreeGridCursor }
  | { type: 'expand'; line: number }
  | { type: 'collapse'; line: number }
  | { type: 'activate'; at: TreeGridCursor }

/** Payload of `row-activate` and `cell-activate`. */
export interface TreeGridActivation {
  rowId: string
  /** The column of a `cell-activate`; undefined for the tree column. */
  columnId?: string
  /** The cell's entities, else the row's. */
  entities: readonly EntityRef[]
  source: 'pointer' | 'keyboard'
}

/** One cell change. `before` and `after` are field values: `null` is empty (a cleared field, a removed sparse cell). */
export interface TreeGridCellEdit {
  rowId: string
  columnId: string
  before: FieldValue
  after: FieldValue
  source: 'pointer' | 'keyboard'
}

/** A spreadsheet batch: every change of one paste, fill, clear or cut, to accept or reject as a whole. */
export interface TreeGridSheetEdit {
  action: 'paste' | 'fill' | 'clear' | 'cut'
  edits: TreeGridCellEdit[]
  source: 'pointer' | 'keyboard'
}

/**
 * A new row proposal. The parent creates the row with its own ID, under `parentId` (a root without it) at sibling
 * position `index` (0 to the current number of siblings), for example with `insertTreeGridRow`.
 */
export interface TreeGridRowCreate {
  parentId?: string
  index: number
  /** The row the user acted on, and where the new row goes relative to it. */
  referenceId: string
  placement: 'before' | 'after' | 'child'
  source: 'pointer' | 'keyboard'
}

/** A row deletion proposal. `includeDescendants` false keeps the children, which move up into the deleted row's place. */
export interface TreeGridRowDelete {
  ids: string[]
  includeDescendants: boolean
  source: 'pointer' | 'keyboard'
}

/** Why an edit in flight ended without a proposal. */
export type TreeGridEditCancelReason = 'escape' | 'source-changed' | 'hidden' | 'blur' | 'pointer-cancel' | 'api'

/** Payload of `edit-cancel`: an open cell editor, a fill handle drag or a row drag ended without a proposal. */
export interface TreeGridEditCancel {
  kind: 'cell' | 'fill' | 'row-move'
  reason: TreeGridEditCancelReason
  rowId?: string
  columnId?: string
}

export type TreeGridValidatorResult = boolean | string | void | undefined
export type TreeGridCellEditValidator = (change: TreeGridCellEdit) => TreeGridValidatorResult
export type TreeGridSheetEditValidator = (change: TreeGridSheetEdit) => TreeGridValidatorResult
export type TreeGridRowCreateValidator = (change: TreeGridRowCreate) => TreeGridValidatorResult
export type TreeGridRowDeleteValidator = (change: TreeGridRowDelete) => TreeGridValidatorResult

/** A drop place for a dragged row: before or after a displayed row, or inside it as its last child. */
export interface TreeGridDrop {
  /** The line the indicator refers to. */
  line: number
  placement: 'before' | 'after' | 'inside'
  target: TimelineRowPosition
}

/** English defaults of the user-visible TreeGrid strings; pass a partial object as `labels` to translate them. */
export interface TreeGridLabels {
  /** Accessible name of the grid. */
  grid: string
  /** Header of the tree column. */
  treeColumn: string
  empty: string
  keyboardHint: string
  expand: string
  collapse: string
  none: string
  unknown: string
  notApplicable: string
  unloaded: string
  loading: string
  failed: string
  /** Short visible marks of the cell states; the full words above are read by screen readers. */
  noneMark: string
  unknownMark: string
  notApplicableMark: string
  unloadedMark: string
  loadingMark: string
  failedMark: string
  yes: string
  no: string
  /** "Edit <column> for <row>": the editor's accessible name, from `edit`, the column label, `for` and the row label. */
  edit: string
  for: string
  editRejected: string
  sheetRejected: string
  pasteTooLarge: string
  fillHandle: string
  addBelow: string
  addChild: string
  deleteRow: string
  moveRow: string
  rowActions: string
  moveBefore: string
  moveAfter: string
  moveInto: string
  rowCreateRejected: string
  rowDeleteRejected: string
  rowMoveRejected: string
  rowMoveHint: string
  /** Accessible name prefix of a column resize separator (`columnsResizable`), followed by the column label. Default "Resize column". */
  resizeColumn?: string
  /** Announced when `validateColumnResize` returns false. Default "This column resize was rejected." */
  columnResizeRejected?: string
  /** Accessible name prefix of a header sort button (`sortableColumns`), followed by the column label. Default "Sort by". */
  sortBy?: string
  /** Added in parentheses to the name of a sort button whose column is sorted ascending. Default "ascending". */
  sortedAscending?: string
  /** Added in parentheses to the name of a sort button whose column is sorted descending. Default "descending". */
  sortedDescending?: string
  /** Accessible name prefix of a header filter button and its dialog (`filterableColumns`), followed by the column label. Default "Filter". */
  filterBy?: string
  /** Added in parentheses to the name of a filter button whose column is filtered. Default "filtered". */
  filtered?: string
  /** Label of the text box of a filter dialog. Default "Contains". */
  filterContains?: string
  /** Legend of the value checkboxes of a filter dialog (columns with a `select` editor). Default "Show values". */
  filterValues?: string
  /** Text of the button that clears a column's filter. Default "Clear filter". */
  clearFilter?: string
}

export const treeGridDefaultLabels: Readonly<Required<TreeGridLabels>> = Object.freeze({
  grid: 'Tree grid', treeColumn: 'Name', empty: 'No rows to display',
  keyboardHint: 'Arrow keys move between cells. Right and Left expand and collapse rows. Enter activates.',
  expand: 'Expand', collapse: 'Collapse',
  none: 'None', unknown: 'Unknown', notApplicable: 'Not applicable', unloaded: 'Not loaded', loading: 'Loading…', failed: 'Failed to load',
  noneMark: '–', unknownMark: '?', notApplicableMark: 'n/a', unloadedMark: '·', loadingMark: '…', failedMark: '!',
  yes: 'Yes', no: 'No',
  edit: 'Edit', for: 'for', editRejected: 'This change was rejected.', sheetRejected: 'This change was rejected.',
  pasteTooLarge: 'The pasted cells do not fit in the grid.', fillHandle: 'Fill down',
  addBelow: 'Add row below', addChild: 'Add child row to', deleteRow: 'Delete', moveRow: 'Move', rowActions: 'Row actions',
  moveBefore: 'before', moveAfter: 'after', moveInto: 'into',
  rowCreateRejected: 'The new row was rejected.', rowDeleteRejected: 'The deletion was rejected.', rowMoveRejected: 'This row move was rejected.',
  rowMoveHint: 'Alt+Up and Alt+Down move the row, Alt+Shift with an arrow indents or outdents it. Ctrl+Enter adds a row below, Ctrl+Shift+Enter a child row, Delete deletes the row.',
  resizeColumn: 'Resize column', columnResizeRejected: 'This column resize was rejected.',
  sortBy: 'Sort by', sortedAscending: 'ascending', sortedDescending: 'descending',
  filterBy: 'Filter', filtered: 'filtered', filterContains: 'Contains', filterValues: 'Show values', clearFilter: 'Clear filter',
})

const CELL_STATUSES: ReadonlySet<string> = new Set(['none', 'unknown', 'not-applicable', 'unloaded', 'loading', 'failed'])
const MISSING: ReadonlySet<string> = new Set(['empty', 'none', 'unknown', 'not-applicable'])
const CHILD_STATUSES: ReadonlySet<string> = new Set(['unloaded', 'loading', 'loaded-empty', 'loaded', 'failed'])
const PENDING_CHILDREN: ReadonlySet<string> = new Set(['unloaded', 'loading', 'failed'])

function checkEntities(entities: unknown, owner: string) {
  if (entities === undefined) return
  if (!Array.isArray(entities)) throw new TypeError(`The entities of ${owner} must be an array`)
  for (const entity of entities as EntityRef[]) {
    if (!isId(entity?.kind)) throw invalidIdError('entity kind', entity?.kind)
    if (!isId(entity.id)) throw invalidIdError('entity', entity.id)
  }
}

function checkContent(content: TreeGridCellContent, owner: string) {
  const { value, status } = content
  if (value !== undefined) {
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) throw new RangeError(`The value of ${owner} must be finite: ${value}`)
    } else if (typeof value !== 'string' && typeof value !== 'boolean') {
      throw new TypeError(`The value of ${owner} must be a string, number or boolean: ${typeof value}`)
    }
  }
  if (status !== undefined && !CELL_STATUSES.has(status)) throw new RangeError(`Unknown status of ${owner}: ${String(status)}`)
  checkEntities(content.entities, owner)
}

/**
 * Validate and index a TreeGrid input. Throws, like `createTimelineRowTree` (with ` (tree grid rows)` appended), for
 * invalid or duplicate row IDs, unknown parents and cycles; `Invalid column ID` and `Duplicate column ID`, a RangeError
 * for a column width that is not finite and positive, an unknown `missingCell` or `childStatus`, and a TypeError for a
 * `value`, `update` or `editable` of the wrong type; for sparse cells `Unknown row in tree grid cell: <id>`, `Unknown
 * column in tree grid cell: <id>`, `Duplicate tree grid cell: <row> / <column>`, an Error for a cell in a field column
 * or a cell with neither value nor status, a RangeError for a non-finite number or an unknown status and a TypeError for
 * a value of another type. Entities need non-empty string kinds and IDs.
 */
export function createTreeGridIndex<R extends TreeGridRow>(input: TreeGridInput<R>): TreeGridIndex<R> {
  const { rows, columns } = input
  if (!Array.isArray(rows)) throw new TypeError('Tree grid rows must be an array')
  if (!Array.isArray(columns)) throw new TypeError('Tree grid columns must be an array')
  const missingCell = input.missingCell ?? 'empty'
  if (!MISSING.has(missingCell)) throw new RangeError('Unknown missingCell: ' + String(missingCell))
  const tree = withContext('tree grid rows', () => createTimelineRowTree(rows))
  const rowById = new Map<string, R>()
  const childCounts = new Map<string, number>()
  let rootCount = 0
  for (const { row } of tree) {
    rowById.set(row.id, row)
    if (row.parentId === undefined) rootCount++
    else childCounts.set(row.parentId, (childCounts.get(row.parentId) ?? 0) + 1)
    if (row.childStatus !== undefined && !CHILD_STATUSES.has(row.childStatus)) {
      throw new RangeError(`Unknown childStatus of tree grid row ${row.id}: ${String(row.childStatus)}`)
    }
    checkEntities(row.entities, 'tree grid row ' + row.id)
  }
  uniqueIds(columns, 'column')
  const columnIndex = new Map<string, number>()
  columns.forEach((column, index) => {
    columnIndex.set(column.id, index)
    if (typeof column.width !== 'number' || !Number.isFinite(column.width) || column.width <= 0) {
      throw new RangeError(`Tree grid column width must be finite and positive: ${column.id}`)
    }
    if (column.value !== undefined && typeof column.value !== 'function') throw new TypeError(`The value of tree grid column ${column.id} must be a function`)
    if (column.update !== undefined && typeof column.update !== 'function') throw new TypeError(`The update of tree grid column ${column.id} must be a function`)
    if (column.editable !== undefined && typeof column.editable !== 'boolean' && typeof column.editable !== 'function') {
      throw new TypeError(`The editable of tree grid column ${column.id} must be a boolean or a function`)
    }
    if (column.missingCell !== undefined && !MISSING.has(column.missingCell)) {
      throw new RangeError(`Unknown missingCell of tree grid column ${column.id}: ${String(column.missingCell)}`)
    }
    if (column.editor?.multiple) throw new Error(`Tree grid column ${column.id}: multiple selection is not supported`)
  })
  const cells = new Map<string, Map<string, TreeGridCell>>()
  for (const cell of input.cells ?? []) {
    if (!rowById.has(cell?.rowId)) throw unknownReferenceError('row', 'tree grid cell', cell?.rowId)
    const at = columnIndex.get(cell.columnId)
    if (at === undefined) throw unknownReferenceError('column', 'tree grid cell', cell.columnId)
    const name = `tree grid cell ${cell.rowId} / ${cell.columnId}`
    if (columns[at]!.value) throw new Error(`The ${name} is in a field column`)
    if (cell.value === undefined && cell.status === undefined) throw new Error(`The ${name} needs a value or a status`)
    checkContent(cell, name)
    let byColumn = cells.get(cell.rowId)
    if (!byColumn) cells.set(cell.rowId, byColumn = new Map())
    if (byColumn.has(cell.columnId)) throw new Error(`Duplicate tree grid cell: ${cell.rowId} / ${cell.columnId}`)
    byColumn.set(cell.columnId, cell)
  }
  return { rows, columns, tree, rowById, columnIndex, cells, childCounts, rootCount, missingCell }
}

/** Whether a row can be expanded: it has child rows, or children still to load. */
export function treeGridRowExpandable(index: TreeGridIndex<any>, row: TreeGridRow): boolean {
  return index.childCounts.has(row.id) || (row.childStatus !== undefined && PENDING_CHILDREN.has(row.childStatus))
}

/**
 * The displayed lines: the rows in tree order without the descendants of collapsed rows, and after the children of an
 * expanded row whose `childStatus` is `unloaded`, `loading` or `failed`, a status line. IDs in `expandedIds` that name
 * no row, or a row that cannot expand, are ignored. Iterative, so a deep chain does not overflow the stack.
 */
export function flattenTreeGrid<R extends TreeGridRow>(index: TreeGridIndex<R>, expandedIds: Iterable<string>): TreeGridLines<R> {
  const expanded = expandedIds instanceof Set ? expandedIds as ReadonlySet<string> : new Set(expandedIds)
  const lines: TreeGridLine<R>[] = []
  const rowLine = new Map<string, number>()
  const statusLine = new Map<string, number>()
  const positions = new Map<string | undefined, number>()
  // Status lines wait until the subtree of their row ends: [preorder index after the subtree, line to emit].
  const pending: { end: number; line: TreeGridLine<R> }[] = []
  const setsize = (row: TreeGridRow | undefined) => row === undefined
    ? index.rootCount
    : (index.childCounts.get(row.id) ?? 0) + (row.childStatus !== undefined && PENDING_CHILDREN.has(row.childStatus) ? 1 : 0)
  const flush = (upTo: number) => {
    while (pending.length && pending[pending.length - 1]!.end <= upTo) {
      const { line } = pending.pop()!
      statusLine.set(line.row.id, lines.length)
      lines.push(line)
    }
  }
  const tree = index.tree
  let i = 0
  while (i < tree.length) {
    flush(i)
    const { row, depth, afterSubtree } = tree[i]!
    const parentId = row.parentId
    const posinset = (positions.get(parentId) ?? 0) + 1
    positions.set(parentId, posinset)
    const parent = parentId === undefined ? -1 : rowLine.get(parentId)!
    const expandable = treeGridRowExpandable(index, row)
    const isExpanded = expandable && expanded.has(row.id)
    const at = lines.length
    rowLine.set(row.id, at)
    lines.push({
      kind: 'row', row, level: depth + 1, expandable, expanded: isExpanded, posinset,
      setsize: setsize(parentId === undefined ? undefined : index.rowById.get(parentId)), parent,
    })
    if (isExpanded && row.childStatus !== undefined && PENDING_CHILDREN.has(row.childStatus)) {
      const size = setsize(row)
      pending.push({ end: afterSubtree, line: { kind: 'status', row, level: depth + 2, expandable: false, expanded: false, posinset: size, setsize: size, parent: at, status: row.childStatus } })
    }
    i = isExpanded ? i + 1 : afterSubtree
  }
  flush(Infinity)
  return { lines, rowLine, statusLine }
}

/**
 * The line of a position, or of its nearest displayed ancestor when it is hidden (a status line counts its row as the
 * parent). `exact` says whether the position itself is displayed. Undefined for an unknown row or an empty grid.
 */
export function findTreeGridLine(index: TreeGridIndex<any>, flat: TreeGridLines<any>, position: TreeGridPosition): { line: number; exact: boolean } | undefined {
  if (position.status) {
    const line = flat.statusLine.get(position.rowId)
    if (line !== undefined) return { line, exact: true }
  } else {
    const line = flat.rowLine.get(position.rowId)
    if (line !== undefined) return { line, exact: true }
  }
  if (!index.rowById.has(position.rowId)) return undefined
  let id: string | undefined = position.status ? position.rowId : index.rowById.get(position.rowId)!.parentId
  while (id !== undefined) {
    const line = flat.rowLine.get(id)
    if (line !== undefined) return { line, exact: false }
    id = index.rowById.get(id)?.parentId
  }
  return undefined
}

/** The position of a displayed line and column. */
export function treeGridPositionAt(index: TreeGridIndex<any>, flat: TreeGridLines<any>, cursor: TreeGridCursor): TreeGridPosition | undefined {
  const line = flat.lines[cursor.line]
  if (!line) return undefined
  const column = cursor.column > 0 ? index.columns[cursor.column - 1] : undefined
  return { rowId: line.row.id, ...column ? { columnId: column.id } : {}, ...line.kind === 'status' ? { status: true } : {} }
}

/** Prefix sums of the column widths: `offsets[i]` is the start of column `i`, `offsets[n]` the total width. */
export function treeGridColumnOffsets(columns: readonly { id: string; width: number }[]): number[] {
  const offsets = [0]
  for (const column of columns) {
    if (!Number.isFinite(column.width) || column.width <= 0) throw new RangeError(`Tree grid column width must be finite and positive: ${column.id}`)
    offsets.push(offsets[offsets.length - 1]! + column.width)
  }
  return offsets
}

const checkWindowNumber = (name: string, value: number, positive = false) => {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || (positive && value === 0)) {
    throw new RangeError(`${name} must be finite and ${positive ? 'positive' : 'nonnegative'}: ${value}`)
  }
}

/** The lines to render for a vertical scroll position: the ones in `[scrollTop, scrollTop + viewport)` plus `overscan` on each side. */
export function treeGridRowWindow(options: { scrollTop: number; viewport: number; rowHeight: number; count: number; overscan?: number }): TreeGridSpan {
  const { scrollTop, viewport, rowHeight, count } = options
  const overscan = options.overscan ?? 0
  checkWindowNumber('scrollTop', scrollTop)
  checkWindowNumber('viewport', viewport)
  checkWindowNumber('rowHeight', rowHeight, true)
  checkWindowNumber('overscan', overscan)
  if (count <= 0) return { start: 0, end: 0 }
  const start = Math.min(count, Math.max(0, Math.floor(scrollTop / rowHeight) - overscan))
  const end = Math.min(count, Math.ceil((scrollTop + viewport) / rowHeight) + overscan)
  return { start, end: Math.max(start, end) }
}

/** The column (index into the offsets' columns) that holds `x`, by binary search; clamped to the columns. */
export function treeGridColumnAt(offsets: readonly number[], x: number): number {
  const count = offsets.length - 1
  if (count <= 0) return 0
  let low = 0, high = count - 1
  while (low < high) {
    const mid = (low + high + 1) >> 1
    if (offsets[mid]! <= x) low = mid
    else high = mid - 1
  }
  return low
}

/** The columns to render for a horizontal scroll position (measured from the inline start of the scrolled columns). */
export function treeGridColumnWindow(offsets: readonly number[], options: { scrollStart: number; viewport: number; overscan?: number }): TreeGridSpan {
  const overscan = options.overscan ?? 0
  checkWindowNumber('scrollStart', options.scrollStart)
  checkWindowNumber('viewport', options.viewport)
  checkWindowNumber('overscan', overscan)
  const count = offsets.length - 1
  if (count <= 0) return { start: 0, end: 0 }
  const start = Math.max(0, treeGridColumnAt(offsets, options.scrollStart) - overscan)
  const end = Math.min(count, treeGridColumnAt(offsets, options.scrollStart + Math.max(0, options.viewport - 1)) + 1 + overscan)
  return { start, end }
}

/**
 * The ARIA treegrid keys over cells. Arrows move one cell (the column order follows the visual direction with `rtl`);
 * in the tree column, the arrow towards the cells expands a collapsed row and otherwise moves into the row, and the
 * other arrow collapses an expanded row and otherwise moves to the parent row. Home and End go to the first and last
 * cell of the line, with Ctrl (or Meta) to the first and last cell of the grid; PageUp and PageDown move by `pageSize`
 * lines; Enter activates. Keys with Alt, and Shift with an arrow (a range extension), give undefined.
 */
export function treeGridKeyAction(input: TreeGridKeyInput, at: TreeGridCursor, context: TreeGridKeyContext): TreeGridKeyAction | undefined {
  const lastLine = context.lines.length - 1, lastColumn = context.columnCount - 1
  if (lastLine < 0 || lastColumn < 0 || input.altKey) return undefined
  const line = Math.max(0, Math.min(lastLine, at.line)), column = Math.max(0, Math.min(lastColumn, at.column))
  const ctrl = Boolean(input.ctrlKey || input.metaKey)
  const move = (l: number, c: number): TreeGridKeyAction => ({
    type: 'move', to: { line: Math.max(0, Math.min(lastLine, l)), column: Math.max(0, Math.min(lastColumn, c)) },
  })
  const item = context.lines[line]!
  let key = input.key
  if (context.rtl && key === 'ArrowLeft') key = 'ArrowRight'
  else if (context.rtl && key === 'ArrowRight') key = 'ArrowLeft'
  if (input.shiftKey && key.startsWith('Arrow')) return undefined
  switch (key) {
    case 'ArrowDown': return move(line + 1, column)
    case 'ArrowUp': return move(line - 1, column)
    case 'ArrowRight':
      if (column === 0 && item.kind === 'row' && item.expandable && !item.expanded) return { type: 'expand', line }
      return move(line, column + 1)
    case 'ArrowLeft':
      if (column > 0) return move(line, column - 1)
      if (item.kind === 'row' && item.expanded) return { type: 'collapse', line }
      return move(item.parent >= 0 ? item.parent : line, 0)
    case 'Home': return ctrl ? move(0, 0) : move(line, 0)
    case 'End': return ctrl ? move(lastLine, lastColumn) : move(line, lastColumn)
    case 'PageDown': return move(line + Math.max(1, Math.floor(context.pageSize)), column)
    case 'PageUp': return move(line - Math.max(1, Math.floor(context.pageSize)), column)
    case 'Enter': return ctrl ? undefined : { type: 'activate', at: { line, column } }
    default: return undefined
  }
}

const asContent = (value: TreeGridValue | TreeGridCellContent | null | undefined): TreeGridCellContent | null | undefined =>
  value === null || value === undefined ? value : typeof value === 'object' ? value : { value }

/**
 * The resolved cell of a row in a column: the column accessor's result, the sparse cell, or the missing-cell state.
 * Throws an Error for an unknown row or column, and like `createTreeGridIndex` for an accessor result it rejects.
 */
export function resolveTreeGridCell<R extends TreeGridRow>(index: TreeGridIndex<R>, rowId: string, columnId: string): TreeGridCellView {
  const row = index.rowById.get(rowId)
  if (!row) throw unknownReferenceError('row', 'tree grid', rowId)
  const at = index.columnIndex.get(columnId)
  if (at === undefined) throw unknownReferenceError('column', 'tree grid', columnId)
  const column = index.columns[at]!
  let content: TreeGridCellContent | null | undefined
  let source: TreeGridCellView['source']
  if (column.value) {
    content = asContent(column.value(row))
    source = 'column'
    if (content) checkContent(content, `tree grid column ${column.id} for row ${row.id}`)
  } else {
    content = index.cells.get(rowId)?.get(columnId)
    source = 'cell'
  }
  if (content === null) return { state: 'none', entities: [], source }
  if (content === undefined || (content.value === undefined && content.status === undefined)) {
    const missing = column.missingCell ?? index.missingCell
    return {
      state: missing, entities: content?.entities ?? [], source: content ? source : 'missing',
      ...content?.label !== undefined ? { label: content.label } : {}, ...content?.tone ? { tone: content.tone } : {},
      ...content?.editable === false ? { editable: false } : {},
    }
  }
  return {
    state: content.status ?? 'value', entities: content.entities ?? [], source,
    ...content.value !== undefined ? { value: content.value } : {},
    ...content.label !== undefined ? { label: content.label } : {},
    ...content.tone ? { tone: content.tone } : {},
    ...content.editable === false ? { editable: false } : {},
  }
}

/** The field value of a cell for editing: its value, or `null` when it has none. */
export function treeGridCellValue(index: TreeGridIndex<any>, rowId: string, columnId: string): FieldValue {
  const view = resolveTreeGridCell(index, rowId, columnId)
  return view.state === 'value' && view.value !== undefined ? view.value : null
}

/**
 * Whether a cell can be edited: its column has an `editor`, its `editable` (boolean or predicate) allows the row, and
 * the cell is not marked `editable: false`. The grid's own `editable` prop is the caller's to check.
 */
export function isTreeGridCellEditable(index: TreeGridIndex<any>, rowId: string, columnId: string): boolean {
  const at = index.columnIndex.get(columnId)
  const row = index.rowById.get(rowId)
  if (at === undefined || !row) return false
  const column = index.columns[at]!
  if (!column.editor) return false
  const allowed = typeof column.editable === 'function' ? column.editable(row) : column.editable !== false
  return allowed && resolveTreeGridCell(index, rowId, columnId).editable !== false
}

/** The field spec of a column's editor, for `parseFieldValue`, `validateFieldValue` and `formatFieldValue`. */
export function treeGridFieldSpec(column: TreeGridColumn<any>): TimelineFieldSpec<any> | undefined {
  return column.editor ? { ...column.editor, id: column.id, get: () => null } as TimelineFieldSpec<any> : undefined
}

/** Matches of `matchTreeGridEntities`. */
export interface TreeGridEntityMatches {
  /** Every row that lists one of the entities: all usage rows of an entity, in tree order. */
  rowIds: string[]
  /** Every cell (sparse, or from a field column accessor) that lists one of the entities. */
  cells: TreeGridCellRef[]
}

/**
 * The rows and cells that stand for any of `entities`, for the `highlightedRowIds` and `highlightedCells` props, for
 * example from `useLinkedSelection().selectedEntities`. Field column accessors are read for every row. Validates the
 * input like `createTreeGridIndex` (or takes an index).
 */
export function matchTreeGridEntities<R extends TreeGridRow>(
  input: TreeGridInput<R> | TreeGridIndex<R>, entities: Iterable<EntityRef>,
): TreeGridEntityMatches {
  const index = 'tree' in input ? input : createTreeGridIndex(input)
  const wanted = new Set<string>()
  for (const entity of entities) wanted.add(JSON.stringify([entity.kind, entity.id]))
  const result: TreeGridEntityMatches = { rowIds: [], cells: [] }
  if (!wanted.size) return result
  const hit = (list: readonly EntityRef[] | undefined) => Boolean(list?.some(entity => wanted.has(JSON.stringify([entity.kind, entity.id]))))
  const fieldColumns = index.columns.filter(column => column.value)
  for (const { row } of index.tree) {
    if (hit(row.entities)) result.rowIds.push(row.id)
    for (const column of fieldColumns) {
      const content = asContent(column.value!(row))
      if (content && hit(content.entities)) result.cells.push({ rowId: row.id, columnId: column.id })
    }
    for (const cell of index.cells.get(row.id)?.values() ?? []) {
      if (hit(cell.entities)) result.cells.push({ rowId: row.id, columnId: cell.columnId })
    }
  }
  return result
}

// Spreadsheet helpers. Ranges cover data columns only; the tree column (column 0) is never edited.

/** The bounds of a range, clamped to data columns: `[top, bottom]` lines and `[left, right]` column indexes (1-based). */
export function treeGridRangeBounds(range: TreeGridRange): { top: number; bottom: number; left: number; right: number } {
  return {
    top: Math.min(range.anchor.line, range.focus.line), bottom: Math.max(range.anchor.line, range.focus.line),
    left: Math.max(1, Math.min(range.anchor.column, range.focus.column)), right: Math.max(range.anchor.column, range.focus.column),
  }
}

function cellText(index: TreeGridIndex<any>, line: TreeGridLine<any>, column: TreeGridColumn<any>): string {
  if (line.kind !== 'row') return ''
  const view = resolveTreeGridCell(index, line.row.id, column.id)
  if (view.state !== 'value' || view.value === undefined) return ''
  const spec = treeGridFieldSpec(column)
  return spec ? formatFieldValue(spec, view.value) : view.label ?? String(view.value)
}

/**
 * The cells of a range as tab-separated text (CRLF between lines), the way spreadsheet applications read it. Status lines
 * are left out, as `buildTreeGridPaste` skips them. Values use
 * the column editor's format (so they paste back), else the label or value; states other than a value are empty.
 */
export function treeGridRangeText(index: TreeGridIndex<any>, flat: TreeGridLines<any>, range: TreeGridRange): string {
  const { top, bottom, left, right } = treeGridRangeBounds(range)
  const records: string[][] = []
  for (let l = top; l <= Math.min(bottom, flat.lines.length - 1); l++) {
    // Status lines are skipped, as a paste skips them, so copying a range and pasting it back changes nothing.
    if (flat.lines[l]!.kind !== 'row') continue
    const record: string[] = []
    for (let c = left; c <= Math.min(right, index.columns.length); c++) record.push(cellText(index, flat.lines[l]!, index.columns[c - 1]!))
    records.push(record)
  }
  const text = formatSheetText(records)
  // A paste drops one line break at the end, so a range whose last line is one empty cell ends with an extra one;
  // otherwise "5" over an empty cell would read as the single value 5 and fill the whole range.
  const last = records[records.length - 1]
  return records.length > 1 && last!.length === 1 && last![0] === '' ? text + '\r\n' : text
}

/** Result of the spreadsheet builders: the edits of one batch, or why there is none. */
export type TreeGridSheetBuild = { ok: true; edits: TreeGridCellEdit[] } | { ok: false; reason: 'too-large' | 'invalid'; error: string; cell?: TreeGridCellRef }

function changeOf(index: TreeGridIndex<any>, rowId: string, column: TreeGridColumn<any>, text: string | FieldValue, source: TreeGridCellEdit['source'], parse: boolean):
  { edit?: TreeGridCellEdit; error?: string } {
  const spec = treeGridFieldSpec(column)!
  let after: FieldValue
  if (parse) {
    const parsed = parseFieldValue(spec, text as string)
    if (!parsed.ok) return { error: parsed.error }
    after = parsed.value
  } else {
    after = text as FieldValue
    const check = validateFieldValue(spec, after)
    if (!check.ok) return { error: check.error }
  }
  const before = treeGridCellValue(index, rowId, column.id)
  return before === after ? {} : { edit: { rowId, columnId: column.id, before, after, source } }
}

/**
 * The edits of pasting tab-separated `text` with its first cell at the range's top-left cell. A single pasted value
 * fills the whole range. Status lines are skipped (the paste continues on the next row line) and cells that cannot be
 * edited (`isTreeGridCellEditable`) keep their value. Every value is parsed by its column's editor: an invalid one
 * fails the whole batch (`invalid`); a paste that reaches past the last line or column, or holds more than `maxCells`
 * cells (default 10,000), fails with `too-large`. Unchanged cells are left out.
 */
export function buildTreeGridPaste(
  index: TreeGridIndex<any>, flat: TreeGridLines<any>, range: TreeGridRange, text: string,
  options: { maxCells?: number; source?: TreeGridCellEdit['source'] } = {},
): TreeGridSheetBuild {
  const records = parseSheetText(text)
  // A loop, not `Math.max(...records)`: spreading a tall paste into one call exceeds the argument limit.
  let width = 0
  for (const record of records) if (record.length > width) width = record.length
  const maxCells = options.maxCells ?? 10_000
  const source = options.source ?? 'keyboard'
  const bounds = treeGridRangeBounds(range)
  const { top, bottom } = bounds
  // A range that starts on the row headers pastes from the first data column.
  const left = Math.max(1, bounds.left), right = Math.max(left, bounds.right)
  const single = records.length === 1 && width === 1
  const rowLines: number[] = []
  const wantLines = single ? bottom - top + 1 : records.length
  for (let l = top; l < flat.lines.length && rowLines.length < wantLines && (!single || l <= bottom); l++) {
    if (flat.lines[l]!.kind === 'row') rowLines.push(l)
  }
  const columnsWanted = single ? right - left + 1 : width
  if (rowLines.length < (single ? 1 : records.length) || left + columnsWanted - 1 > index.columns.length || left < 1) {
    return { ok: false, reason: 'too-large', error: 'The pasted cells do not fit in the grid' }
  }
  if (rowLines.length * columnsWanted > maxCells) return { ok: false, reason: 'too-large', error: `The paste holds more than ${maxCells} cells` }
  const edits: TreeGridCellEdit[] = []
  for (let r = 0; r < rowLines.length; r++) {
    const row = flat.lines[rowLines[r]!]!.row
    for (let c = 0; c < columnsWanted; c++) {
      const column = index.columns[left - 1 + c]!
      if (!isTreeGridCellEditable(index, row.id, column.id)) continue
      const value = single ? records[0]![0]! : records[r]![c] ?? ''
      const { edit, error } = changeOf(index, row.id, column, value, source, true)
      if (error) return { ok: false, reason: 'invalid', error, cell: { rowId: row.id, columnId: column.id } }
      if (edit) edits.push(edit)
    }
  }
  return { ok: true, edits }
}

/** The edits that clear the editable cells of a range (`after: null`). Unchanged (already empty) cells are left out. */
export function buildTreeGridClear(index: TreeGridIndex<any>, flat: TreeGridLines<any>, range: TreeGridRange, source: TreeGridCellEdit['source'] = 'keyboard'): TreeGridSheetBuild {
  const { top, bottom, left, right } = treeGridRangeBounds(range)
  const edits: TreeGridCellEdit[] = []
  for (let l = top; l <= Math.min(bottom, flat.lines.length - 1); l++) {
    const line = flat.lines[l]!
    if (line.kind !== 'row') continue
    for (let c = left; c <= Math.min(right, index.columns.length); c++) {
      const column = index.columns[c - 1]!
      if (!isTreeGridCellEditable(index, line.row.id, column.id)) continue
      const { edit, error } = changeOf(index, line.row.id, column, null, source, false)
      if (error) return { ok: false, reason: 'invalid', error, cell: { rowId: line.row.id, columnId: column.id } }
      if (edit) edits.push(edit)
    }
  }
  return { ok: true, edits }
}

/**
 * The edits of filling a range downwards: the lines of `source` (its rows, repeated in order) are copied into the
 * following row lines of `range` that `source` does not cover; status lines and cells that cannot be edited are
 * skipped. Without a separate `source`, the first row line of the range fills the others (Ctrl+D). A fill of more than
 * `maxCells` cells (default 10,000) fails with `too-large`.
 */
export function buildTreeGridFill(
  index: TreeGridIndex<any>, flat: TreeGridLines<any>, range: TreeGridRange,
  options: { source?: TreeGridRange; origin?: TreeGridCellEdit['source']; maxCells?: number } = {},
): TreeGridSheetBuild {
  const target = treeGridRangeBounds(range)
  const maxCells = options.maxCells ?? 10_000
  const from = options.source ? treeGridRangeBounds(options.source) : { ...target, bottom: target.top }
  const sourceLines: number[] = []
  for (let l = from.top; l <= from.bottom; l++) if (flat.lines[l]?.kind === 'row') sourceLines.push(l)
  if (!sourceLines.length) return { ok: true, edits: [] }
  let filledLines = 0
  for (let l = from.bottom + 1; l <= Math.min(target.bottom, flat.lines.length - 1); l++) if (flat.lines[l]!.kind === 'row') filledLines++
  const columnCount = Math.max(0, Math.min(target.right, index.columns.length) - Math.max(1, target.left) + 1)
  if (filledLines * columnCount > maxCells) return { ok: false, reason: 'too-large', error: `The fill holds more than ${maxCells} cells` }
  const edits: TreeGridCellEdit[] = []
  let k = 0
  for (let l = from.bottom + 1; l <= Math.min(target.bottom, flat.lines.length - 1); l++) {
    const line = flat.lines[l]!
    if (line.kind !== 'row') continue
    const copyFrom = flat.lines[sourceLines[k++ % sourceLines.length]!]!.row.id
    for (let c = target.left; c <= Math.min(target.right, index.columns.length); c++) {
      const column = index.columns[c - 1]!
      if (!isTreeGridCellEditable(index, line.row.id, column.id)) continue
      const { edit, error } = changeOf(index, line.row.id, column, treeGridCellValue(index, copyFrom, column.id), options.origin ?? 'keyboard', false)
      if (error) return { ok: false, reason: 'invalid', error, cell: { rowId: line.row.id, columnId: column.id } }
      if (edit) edits.push(edit)
    }
  }
  return { ok: true, edits }
}

/**
 * Apply cell edits (a `cell-edit`, or the `edits` of a `sheet-edit`) to the input and return new `rows` and `cells`.
 * A field column's edit calls its `update(row, after)`; a sparse column's edit replaces the cell's value (dropping its
 * `status` and `label`, keeping `tone`, `entities` and `editable`), adds a cell, or with `after: null` removes it.
 * Unchanged rows and cells keep their identity; the inputs are not modified. Throws an Error for an unknown row or
 * column, a field column without `update`, and a TypeError for an array value or a sparse value that is not a string,
 * number or boolean.
 */
export function applyTreeGridEdits<R extends TreeGridRow>(
  input: { rows: readonly R[]; columns: readonly TreeGridColumn<R>[]; cells?: readonly TreeGridCell[] },
  edits: Iterable<TreeGridCellEdit>,
): { rows: R[]; cells: TreeGridCell[] } {
  const columns = new Map(input.columns.map(column => [column.id, column]))
  const rowIndex = new Map(input.rows.map((row, i) => [row.id, i]))
  const rows = input.rows.slice()
  const cells = (input.cells ?? []).slice()
  const cellIndex = new Map(cells.map((cell, i) => [JSON.stringify([cell.rowId, cell.columnId]), i]))
  const removed = new Set<number>()
  for (const edit of edits) {
    const at = rowIndex.get(edit.rowId)
    if (at === undefined) throw unknownReferenceError('row', 'tree grid edit', edit.rowId)
    const column = columns.get(edit.columnId)
    if (!column) throw unknownReferenceError('column', 'tree grid edit', edit.columnId)
    if (Array.isArray(edit.after)) throw new TypeError('A tree grid edit cannot hold several values: ' + edit.columnId)
    if (column.value) {
      if (!column.update) throw new Error(`Tree grid column ${column.id} has no update function`)
      rows[at] = column.update(rows[at]!, edit.after)
      continue
    }
    const key = JSON.stringify([edit.rowId, edit.columnId])
    const existing = cellIndex.get(key)
    if (edit.after === null) {
      if (existing !== undefined) removed.add(existing)
      cellIndex.delete(key)
      continue
    }
    const value = edit.after as TreeGridValue
    if (typeof value !== 'string' && typeof value !== 'number' && typeof value !== 'boolean') throw new TypeError('Invalid tree grid value: ' + typeof value)
    if (existing !== undefined && !removed.has(existing)) {
      const { status: _status, label: _label, ...rest } = cells[existing]!
      cells[existing] = { ...rest, value }
    } else {
      cellIndex.set(key, cells.length)
      cells.push({ rowId: edit.rowId, columnId: edit.columnId, value })
    }
  }
  return { rows, cells: removed.size ? cells.filter((_, i) => !removed.has(i)) : cells }
}

// Row structure.

function childLists<R extends TreeGridRow>(rows: readonly R[]) {
  const tree = withContext('tree grid rows', () => createTimelineRowTree(rows))
  const children = new Map<string | undefined, R[]>()
  for (const { row } of tree) {
    let list = children.get(row.parentId)
    if (!list) children.set(row.parentId, list = [])
    list.push(row)
  }
  return children
}

function preorder<R extends TreeGridRow>(children: ReadonlyMap<string | undefined, readonly R[]>): R[] {
  const ordered: R[] = []
  const stack = (children.get(undefined) ?? []).slice().reverse()
  while (stack.length) {
    const next = stack.pop()!
    ordered.push(next)
    const group = children.get(next.id)
    if (group) for (let i = group.length - 1; i >= 0; i--) stack.push(group[i]!)
  }
  return ordered
}

/**
 * The `TreeGridRowCreate` for a new row next to `referenceId`: right before or after it among its siblings, or as its
 * last child. Throws an Error for an unknown row.
 */
export function treeGridRowCreate(
  rows: readonly TreeGridRow[], referenceId: string, placement: TreeGridRowCreate['placement'], source: TreeGridRowCreate['source'] = 'keyboard',
): TreeGridRowCreate {
  const children = childLists(rows)
  const row = rows.find(item => item.id === referenceId)
  if (!row) throw unknownReferenceError('row', 'tree grid row creation', referenceId)
  if (placement === 'child') return { parentId: row.id, index: children.get(row.id)?.length ?? 0, referenceId, placement, source }
  const index = children.get(row.parentId)!.indexOf(row) + (placement === 'after' ? 1 : 0)
  return { ...row.parentId === undefined ? {} : { parentId: row.parentId }, index, referenceId, placement, source }
}

/**
 * Insert `row` (whose ID the parent chose) where a `row-create` proposal says. Returns the rows in tree preorder with
 * the new row's `parentId` set from the proposal; other rows keep their identity. Throws an Error for an unknown parent
 * or a row ID already in use, and a RangeError for an index that is not an integer from 0 to the number of siblings.
 */
export function insertTreeGridRow<R extends TreeGridRow>(rows: readonly R[], change: Pick<TreeGridRowCreate, 'parentId' | 'index'>, row: R): R[] {
  const children = childLists(rows)
  const ids = new Set(rows.map(item => item.id))
  // The parent must be an existing row: checked before the new ID joins the set, so a row cannot be its own parent.
  if (change.parentId !== undefined && !ids.has(change.parentId)) throw unknownReferenceError('parent', 'tree grid row creation', change.parentId)
  checkId('row', row.id, ids)
  const siblings = (children.get(change.parentId) ?? []).slice()
  if (!Number.isInteger(change.index) || change.index < 0 || change.index > siblings.length) {
    throw new RangeError(`The row index must be an integer from 0 to ${siblings.length}: ${change.index}`)
  }
  const { parentId: _ignored, ...rest } = row
  const placed = (change.parentId === undefined ? rest : { ...rest, parentId: change.parentId }) as R
  siblings.splice(change.index, 0, placed)
  children.set(change.parentId, siblings)
  return preorder(children)
}

/**
 * Delete rows. With `includeDescendants`, every descendant goes too; without it, each deleted row's children take its
 * place among its siblings. Sparse cells of deleted rows are dropped. Returns new arrays in tree preorder (the moved
 * children are new objects with the new `parentId`). Throws an Error for an unknown or repeated row ID.
 */
export function deleteTreeGridRows<R extends TreeGridRow>(
  input: { rows: readonly R[]; cells?: readonly TreeGridCell[] }, change: Pick<TreeGridRowDelete, 'ids' | 'includeDescendants'>,
): { rows: R[]; cells: TreeGridCell[] } {
  const children = childLists(input.rows)
  const byId = new Map(input.rows.map(row => [row.id, row]))
  const doomed = new Set<string>()
  for (const id of change.ids) {
    if (!byId.has(id)) throw unknownReferenceError('row', 'tree grid deletion', id)
    if (doomed.has(id)) throw duplicateIdError('row', id)
    doomed.add(id)
  }
  if (change.includeDescendants) {
    const stack = [...doomed]
    while (stack.length) for (const child of children.get(stack.pop()!) ?? []) if (!doomed.has(child.id)) { doomed.add(child.id); stack.push(child.id) }
  }
  // Without descendants: the nearest surviving ancestor of each row becomes its parent, in the deleted row's place.
  const result = new Map<string | undefined, R[]>()
  const stack: { parentId: string | undefined; list: readonly R[] }[] = [{ parentId: undefined, list: children.get(undefined) ?? [] }]
  const out = (parentId: string | undefined) => {
    let list = result.get(parentId)
    if (!list) result.set(parentId, list = [])
    return list
  }
  // Expand deleted rows in place: walk each list and splice the children of a deleted row into it.
  while (stack.length) {
    const { parentId, list } = stack.pop()!
    const queue = list.slice()
    for (let i = 0; i < queue.length; i++) {
      const row = queue[i]!
      if (doomed.has(row.id)) {
        if (!change.includeDescendants) queue.splice(i + 1, 0, ...(children.get(row.id) ?? []))
        continue
      }
      let kept = row
      if (row.parentId !== parentId) {
        const { parentId: _old, ...rest } = row
        kept = (parentId === undefined ? rest : { ...rest, parentId }) as R
      }
      out(parentId).push(kept)
      stack.push({ parentId: row.id, list: children.get(row.id) ?? [] })
    }
  }
  return { rows: preorder(result), cells: (input.cells ?? []).filter(cell => !doomed.has(cell.rowId)) }
}

/**
 * Where a key on a row header moves the row, as GanttChart's row move keys: Alt+ArrowUp and Alt+ArrowDown one place
 * among its siblings, Alt+Shift with the arrow towards the cells (right, or left with `rtl`) indents it under its
 * previous sibling (as the last child) and the other arrow outdents it after its parent. `'ignore'` for other keys,
 * undefined when the row cannot move that way. Apply the proposal with `moveTimelineRow`.
 */
export function treeGridRowMoveForKey(
  input: TreeGridKeyInput, rows: readonly TreeGridRow[], id: string, rtl = false,
): TimelineRowMove['after'] | undefined | 'ignore' {
  if (!input.altKey || input.ctrlKey || input.metaKey) return 'ignore'
  const children = childLists(rows)
  const row = rows.find(item => item.id === id)
  if (!row) throw unknownReferenceError('row', 'tree grid row move', id)
  const siblings = children.get(row.parentId)!
  const index = siblings.indexOf(row)
  const place = (parentId: string | undefined, at: number): TimelineRowPosition => parentId === undefined ? { index: at } : { parentId, index: at }
  if (input.shiftKey && (input.key === 'ArrowLeft' || input.key === 'ArrowRight')) {
    if ((input.key === 'ArrowRight') !== rtl) {
      const previous = siblings[index - 1]
      return previous ? place(previous.id, children.get(previous.id)?.length ?? 0) : undefined
    }
    if (row.parentId === undefined) return undefined
    const parent = rows.find(item => item.id === row.parentId)!
    return place(parent.parentId, children.get(parent.parentId)!.indexOf(parent) + 1)
  }
  if (!input.shiftKey && (input.key === 'ArrowUp' || input.key === 'ArrowDown')) {
    const next = index + (input.key === 'ArrowUp' ? -1 : 1)
    return next >= 0 && next < siblings.length ? place(row.parentId, next) : undefined
  }
  return 'ignore'
}

/**
 * The drop place for dragging row `id` over displayed line `line`, at `fraction` (0 to 1) of its height: the upper
 * quarter puts the row before the line's row, the lower quarter after it (as the first child when its children are
 * shown), and the middle inside it as its last child. Status lines take the row as the parent's last child. Places in
 * the dragged row's own subtree, and a drop on the row itself, give undefined.
 */
export function treeGridDropAt(index: TreeGridIndex<any>, flat: TreeGridLines<any>, id: string, line: number, fraction: number): TreeGridDrop | undefined {
  const item = flat.lines[Math.max(0, Math.min(flat.lines.length - 1, line))]
  if (!item || !index.rowById.has(id)) return undefined
  const at = flat.lines.indexOf(item)
  const children = new Map<string | undefined, string[]>()
  for (const { row } of index.tree) {
    let list = children.get(row.parentId)
    if (!list) children.set(row.parentId, list = [])
    list.push(row.id)
  }
  const siblingsWithout = (parentId: string | undefined) => (children.get(parentId) ?? []).filter(other => other !== id)
  let placement: TreeGridDrop['placement']
  let parentId: string | undefined, position: number
  if (item.kind === 'status') {
    placement = 'inside'
    parentId = item.row.id
    position = siblingsWithout(parentId).length
  } else if (item.row.id === id) {
    return undefined
  } else if (fraction < 0.25) {
    placement = 'before'
    parentId = item.row.parentId
    position = siblingsWithout(parentId).indexOf(item.row.id)
  } else if (fraction > 0.75) {
    placement = 'after'
    if (item.expanded && index.childCounts.has(item.row.id)) {
      parentId = item.row.id
      position = 0
    } else {
      parentId = item.row.parentId
      position = siblingsWithout(parentId).indexOf(item.row.id) + 1
    }
  } else {
    placement = 'inside'
    parentId = item.row.id
    position = siblingsWithout(parentId).length
  }
  for (let ancestor = parentId; ancestor !== undefined; ancestor = index.rowById.get(ancestor)?.parentId) {
    if (ancestor === id) return undefined
  }
  const current = index.rowById.get(id)!
  const currentIndex = (children.get(current.parentId) ?? []).indexOf(id)
  if (parentId === current.parentId && position === currentIndex) return undefined
  return { line: at, placement, target: parentId === undefined ? { index: position } : { parentId, index: position } }
}

/**
 * The TreeGrid content of one `aggregateTimeBuckets` cell. A loaded bucket with a value shows the value (a `sum` of no
 * items is `0`), a loaded bucket without a value (for example `last` with no items) is `none`, and a bucket that is
 * not loaded keeps its `unloaded`, `loading` or `failed` status, so it never shows as 0. `extra` (label, tone,
 * entities, editable) is added to cells with a value. Throws TypeError for something that is not a bucket cell.
 */
export function treeGridCellContentFromTimeBucket(cell: TimeBucketCell, extra: Omit<TreeGridCellContent, 'value' | 'status'> = {}): TreeGridCellContent {
  if (!cell || typeof cell !== 'object') throw new TypeError('A time bucket cell must be an object')
  if (cell.status === 'loaded' || cell.status === 'loaded-empty') {
    return cell.value === null ? { status: 'none' } : { ...extra, value: cell.value }
  }
  if (cell.status === 'unloaded' || cell.status === 'loading' || cell.status === 'failed') return { status: cell.status }
  throw new TypeError('Unknown time bucket cell status: ' + String((cell as { status?: unknown }).status))
}

/** `treeGridCellContentFromTimeBucket` for a list of cells, keeping their positions: input for the TreeGrid `cells` prop. */
export function treeGridCellsFromTimeBuckets(cells: readonly TimeBucketCell[]): TreeGridCell[] {
  if (!Array.isArray(cells)) throw new TypeError('Time bucket cells must be an array')
  const result: TreeGridCell[] = []
  for (const cell of cells) result.push({ rowId: cell?.rowId, columnId: cell?.columnId, ...treeGridCellContentFromTimeBucket(cell) })
  return result
}

/** Options of `treeGridCellText`: the same `formatValue` and `labels` as the TreeGrid props. */
export interface TreeGridTextOptions<R extends TreeGridRow = TreeGridRow> {
  formatValue?: (value: TreeGridValue, context: { row: R; column: TreeGridColumn<R> }) => string
  /** The words of booleans in columns without an editor `format`. Default `treeGridDefaultLabels.yes` and `no`. */
  labels?: Partial<Pick<TreeGridLabels, 'yes' | 'no'>>
}

/**
 * The text that the default rendering of TreeGrid shows in a cell with a value: its `label`, else `formatValue`, else
 * `labels.yes` or `labels.no` for a boolean in a column without an editor `format`, else the editor's format, else the
 * value as text. Cells without a value (empty, none, unknown and the other statuses) give `''`. Throws like
 * `resolveTreeGridCell` for an unknown row or column.
 */
export function treeGridCellText<R extends TreeGridRow>(
  index: TreeGridIndex<R>, rowId: string, columnId: string, options: TreeGridTextOptions<R> = {},
): string {
  const view = resolveTreeGridCell(index, rowId, columnId)
  if (view.state !== 'value' || view.value === undefined) return ''
  if (view.label !== undefined) return view.label
  const column = index.columns[index.columnIndex.get(columnId)!]!
  const value = view.value
  if (options.formatValue) return options.formatValue(value, { row: index.rowById.get(rowId)!, column })
  if (typeof value === 'boolean' && !column.editor?.format) {
    return value ? options.labels?.yes ?? treeGridDefaultLabels.yes : options.labels?.no ?? treeGridDefaultLabels.no
  }
  const spec = treeGridFieldSpec(column)
  return spec ? formatFieldValue(spec, value) : String(value)
}

/**
 * The header state of a TreeGrid view (the `sort` and `filters` props, `v-model:sort` and `v-model:filters`): the same
 * `TimelineViewSort` and `TimelineViewFilter` lists that GanttChart's header proposes. A rule or filter names a column
 * ID, or `timelineLabelColumnId` (`'$label'`) for the tree column, which reads the row label.
 */
export interface TreeGridViewState {
  sort?: readonly TimelineViewSort[]
  filters?: readonly TimelineViewFilter[]
}

/** The input of `projectTreeGridRows`: a TreeGrid input with optional compare rules and the cell text options. */
export interface TreeGridViewInput<R extends TreeGridRow = TreeGridRow> extends TreeGridInput<R>, TreeGridTextOptions<R> {
  /** Registered compare rules by ID; a sort rule with such an ID uses it instead of a column. */
  sortRules?: Readonly<Record<string, TimelineRowCompare<R>>>
}

/** The result of `projectTreeGridRows`, ready for the TreeGrid `rows` and `cells` props. */
export interface TreeGridViewProjection<R extends TreeGridRow = TreeGridRow> {
  /** The kept rows (matches with their ancestors), siblings sorted stably within their parent. The input's row objects. */
  rows: R[]
  /** The sparse cells of the kept rows, in input order (empty without `cells`). */
  cells: TreeGridCell[]
  /** IDs of the rows that matched every filter, without the ancestors kept for them, in input order. Empty without filters. */
  matchedRowIds: string[]
  /** `unknown-column` for a filter and `unknown-sort-rule` for a sort rule that names no column or rule; both are ignored. */
  diagnostics: TimelineViewDiagnostic[]
}

function checkViewState(state: TreeGridViewState) {
  if (!state || typeof state !== 'object') throw new TypeError('A tree grid view state must be an object')
  if (state.sort !== undefined) {
    if (!Array.isArray(state.sort)) throw new TypeError('The sort of a tree grid view must be an array')
    for (const rule of state.sort) {
      if (typeof rule?.ruleId !== 'string') throw new TypeError('A tree grid sort rule needs a string ruleId')
      if (rule.direction !== 'asc' && rule.direction !== 'desc') throw new RangeError(`Unknown sort direction of ${rule.ruleId}: ${String(rule.direction)}`)
    }
  }
  if (state.filters !== undefined) {
    if (!Array.isArray(state.filters)) throw new TypeError('The filters of a tree grid view must be an array')
    for (const filter of state.filters) {
      if (typeof filter?.columnId !== 'string') throw new TypeError('A tree grid filter needs a string columnId')
      if (filter.text !== undefined && typeof filter.text !== 'string') throw new TypeError(`The text of the filter of ${filter.columnId} must be a string`)
      if (filter.values === undefined) continue
      if (!Array.isArray(filter.values)) throw new TypeError(`The values of the filter of ${filter.columnId} must be an array`)
      for (const value of filter.values) {
        if (typeof value === 'number' ? !Number.isFinite(value) : typeof value !== 'string') {
          throw new RangeError(`A value of the filter of ${filter.columnId} must be a string or a finite number: ${String(value)}`)
        }
      }
    }
  }
}

/** Two numbers compare as numbers, anything else as text, as `projectTimelineRows` compares column values. */
function compareKeys(a: string | number, b: string | number) {
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0
  const left = String(a), right = String(b)
  return left < right ? -1 : left > right ? 1 : 0
}

/**
 * Project TreeGrid rows for a header sort and column filters, keeping the hierarchy. A row matches when it meets every
 * filter: `text` must occur, ignoring case and surrounding whitespace, in the cell text the grid shows
 * (`treeGridCellText`; the row label for `timelineLabelColumnId`), and `values` must list the cell's raw string or
 * number value (the row label for the tree column); a cell without a value meets no condition. Matching rows stay with
 * all their ancestors. Siblings are then sorted within their parent by the rules in order: a column compares cell
 * values (numbers as numbers, booleans as 0 and 1, anything else as text), `timelineLabelColumnId` compares row labels
 * and a registered `sortRules` entry uses its function; cells without a value sort after the others in both directions,
 * and ties keep the input order. The proposals of TreeGrid's `update:sort` and `update:filters` apply directly. Unknown
 * filter columns and sort rules are reported as diagnostics and ignored. Validates the input like `createTreeGridIndex`
 * and throws a TypeError or RangeError for a malformed state. Never changes its arguments; iterative, so deep trees do
 * not overflow the stack.
 */
export function projectTreeGridRows<R extends TreeGridRow>(input: TreeGridViewInput<R>, state: TreeGridViewState): TreeGridViewProjection<R> {
  const index = createTreeGridIndex(input)
  checkViewState(state)
  const diagnostics: TimelineViewDiagnostic[] = []
  const isLabel = (id: string) => id === timelineLabelColumnId && !index.columnIndex.has(id)
  const text = (row: R, id: string) => isLabel(id) ? row.label : treeGridCellText(index, row.id, id, input)
  const raw = (row: R, id: string): TreeGridValue | undefined => {
    if (isLabel(id)) return row.label
    const view = resolveTreeGridCell(index, row.id, id)
    return view.state === 'value' ? view.value : undefined
  }

  const filters: TimelineViewFilter[] = []
  for (const filter of state.filters ?? []) {
    if (index.columnIndex.has(filter.columnId) || isLabel(filter.columnId)) {
      if (filter.text?.trim() || filter.values) filters.push(filter)
    } else diagnostics.push({ code: 'unknown-column', id: filter.columnId, message: 'Unknown tree grid filter column: ' + filter.columnId })
  }
  let rows: R[] = [...input.rows]
  const matchedRowIds: string[] = []
  if (filters.length) {
    rows = filterTimelineRows(rows, row => {
      for (const filter of filters) {
        const query = filter.text?.trim().toLowerCase()
        if (query && !text(row, filter.columnId).toLowerCase().includes(query)) return false
        if (filter.values) {
          const value = raw(row, filter.columnId)
          if ((typeof value !== 'string' && typeof value !== 'number') || !filter.values.includes(value)) return false
        }
      }
      matchedRowIds.push(row.id)
      return true
    })
  }

  const rules: { key?: (row: R) => string | number | undefined; compare?: TimelineRowCompare<R>; sign: number }[] = []
  for (const rule of state.sort ?? []) {
    const sign = rule.direction === 'desc' ? -1 : 1
    const registered = input.sortRules?.[rule.ruleId]
    if (registered) rules.push({ compare: registered, sign })
    else if (index.columnIndex.has(rule.ruleId)) {
      rules.push({ key: row => { const value = raw(row, rule.ruleId); return typeof value === 'boolean' ? Number(value) : value }, sign })
    } else if (rule.ruleId === timelineLabelColumnId) rules.push({ key: row => row.label, sign })
    else diagnostics.push({ code: 'unknown-sort-rule', id: rule.ruleId, message: 'Unknown tree grid sort rule: ' + rule.ruleId })
  }
  if (rules.length) {
    const order = new Map<string, number>()
    input.rows.forEach((row, i) => order.set(row.id, i))
    // Each key is read once per row, not once per comparison.
    const keys = rules.map(rule => rule.key ? new Map(rows.map(row => [row.id, rule.key!(row)])) : undefined)
    const children = new Map<string | undefined, R[]>()
    for (const row of rows) {
      const group = children.get(row.parentId)
      if (group) group.push(row)
      else children.set(row.parentId, [row])
    }
    for (const group of children.values()) {
      group.sort((a, b) => {
        for (let r = 0; r < rules.length; r++) {
          const rule = rules[r]!
          let result: number
          if (rule.compare) result = rule.compare(a, b) * rule.sign
          else {
            const left = keys[r]!.get(a.id), right = keys[r]!.get(b.id)
            // Cells without a value go last in both directions.
            if (left === undefined || right === undefined) result = left === right ? 0 : left === undefined ? 1 : -1
            else result = compareKeys(left, right) * rule.sign
          }
          if (result) return result
        }
        return order.get(a.id)! - order.get(b.id)!
      })
    }
    const ordered: R[] = []
    const stack = (children.get(undefined) ?? []).slice().reverse()
    while (stack.length) {
      const row = stack.pop()!
      ordered.push(row)
      const group = children.get(row.id)
      if (group) for (let i = group.length - 1; i >= 0; i--) stack.push(group[i]!)
    }
    rows = ordered
  }
  const kept = new Set(rows.map(row => row.id))
  const cells = (input.cells ?? []).filter(cell => kept.has(cell.rowId))
  return { rows, cells, matchedRowIds, diagnostics }
}
