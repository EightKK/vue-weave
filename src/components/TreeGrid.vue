<script setup lang="ts" generic="R extends TreeGridRow = TreeGridRow">
import {
  Fragment, computed, createCommentVNode, h, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useId, watch,
  type FunctionalComponent, type VNode,
} from 'vue'
import {
  buildTreeGridClear, buildTreeGridFill, buildTreeGridPaste, createTreeGridIndex, findTreeGridLine, flattenTreeGrid,
  isTreeGridCellEditable, resolveTreeGridCell, treeGridCellValue, treeGridColumnOffsets, treeGridColumnWindow, treeGridDefaultLabels,
  treeGridDropAt, treeGridFieldSpec, treeGridKeyAction, treeGridPositionAt, treeGridRangeBounds, treeGridRangeText, treeGridRowCreate,
  treeGridRowMoveForKey, treeGridRowWindow,
  type TreeGridActivation, type TreeGridCell, type TreeGridCellEdit, type TreeGridCellEditValidator, type TreeGridCellRef,
  type TreeGridCellView, type TreeGridColumn, type TreeGridCursor, type TreeGridDrop, type TreeGridEditCancel,
  type TreeGridEditCancelReason, type TreeGridIndex, type TreeGridLabels, type TreeGridLine, type TreeGridLines,
  type TreeGridMissingCell, type TreeGridPosition, type TreeGridRange, type TreeGridRow, type TreeGridRowCreate,
  type TreeGridRowCreateValidator, type TreeGridRowDelete, type TreeGridRowDeleteValidator, type TreeGridSheetBuild,
  type TreeGridSheetEdit, type TreeGridSheetEditValidator, type TreeGridSpan, type TreeGridValue,
} from '../core/treeGrid.js'
import { formatFieldValue, parseFieldValue, validateFieldValue, type FieldParseResult, type FieldValue, type TimelineFieldSpec } from '../core/fieldEditing.js'
import type { ChartDirection, RowMoveValidator, TimelineRowMove, TimelineRowPosition } from '../core/types.js'
import type { RevealResult } from '../core/viewBindings.js'
import { edgeScroller, pastThreshold } from './shared/pointer.js'
import { rejectionReason, useValidatedSource } from './shared/validation.js'
import { scrollToShow, slotKey, splitAround } from './treeGrid/lineSegments.js'

type IdList = readonly string[] | ReadonlySet<string>

const props = withDefaults(defineProps<{
  /** Rows: unique ID, optional `parentId`, label, optional detail, `entities`, `childStatus` and data. Array order is sibling order. Required. */
  rows: readonly R[]
  /** Columns after the tree column: unique ID, label, width, and `value(row)` for a field column (others read `cells`). Required. */
  columns: readonly TreeGridColumn<R>[]
  /** Sparse cells of the columns without `value`: `{ rowId, columnId, value?, status?, label?, tone?, entities?, editable? }`. */
  cells?: readonly TreeGridCell[]
  /** What a cell that the data does not list means: `empty` (blank), `none`, `unknown` or `not-applicable`. Default `empty`. */
  missingCell?: TreeGridMissingCell
  /** Controlled IDs of the expanded rows; supports `v-model:expanded-ids`. Compared by value. */
  expandedIds?: readonly string[]
  /** Controlled active cell (the one with the keyboard focus stop); supports `v-model:active-cell`. */
  activeCell?: TreeGridPosition
  /** IDs of the selected rows (`aria-selected`, `vw-is-selected`). Display only; the grid never changes it. */
  selectedRowIds?: IdList
  /** IDs of the rows to highlight, for linked views (`vw-is-highlighted`). */
  highlightedRowIds?: IdList
  /** Cells to highlight, for linked views. */
  highlightedCells?: readonly TreeGridCellRef[]
  /** Text of a cell value. Default: the editor's format, else the value as text (booleans as `labels.yes` and `labels.no`). */
  formatValue?: (value: TreeGridValue, context: { row: R; column: TreeGridColumn<R> }) => string
  /** Height of every line in pixels. Default 32. */
  rowHeight?: number
  /** Height of the header row in pixels. Default 36. */
  headerHeight?: number
  /** Width of the tree column in pixels. Default 240. */
  treeColumnWidth?: number
  /** Height of the scroll viewport, in pixels or a CSS length. Default 400. */
  height?: number | string
  /** Viewport width assumed before mounting (server rendering), so the first column window is bounded. Default 960. */
  initialWidth?: number
  /** Lines rendered beyond each edge of the viewport. Default 6. */
  overscan?: number
  /** Columns rendered beyond each edge of the viewport. Default 2. */
  columnOverscan?: number
  /** Overrides for the English UI strings and accessible names. */
  labels?: Partial<TreeGridLabels>
  /** Text direction: `ltr`, `rtl` or `auto`. Default `ltr`. */
  dir?: ChartDirection
  /** Enables cell editing in the columns that have an `editor`. Default false. */
  editable?: boolean
  /** Synchronous check of a `cell-edit` proposal: true or nothing accepts, false or a reason rejects. */
  validateCellEdit?: TreeGridCellEditValidator
  /** Enables range selection, copy, cut, paste, clear and fill down. Default false. */
  spreadsheet?: boolean
  /** Synchronous check of a `sheet-edit` batch. */
  validateSheetEdit?: TreeGridSheetEditValidator
  /** Largest number of cells one paste or fill may change. Default 10000. */
  maxSheetCells?: number
  /** Enables row proposals: create, delete and move, by keyboard, row action buttons and row header drags. Default false. */
  rowsEditable?: boolean
  validateRowCreate?: TreeGridRowCreateValidator
  validateRowDelete?: TreeGridRowDeleteValidator
  validateRowMove?: RowMoveValidator
}>(), {
  cells: undefined, missingCell: 'empty', expandedIds: undefined, activeCell: undefined, selectedRowIds: undefined,
  highlightedRowIds: undefined, highlightedCells: undefined, formatValue: undefined, rowHeight: 32, headerHeight: 36,
  treeColumnWidth: 240, height: 400, initialWidth: 960, overscan: 6, columnOverscan: 2, labels: undefined, dir: 'ltr',
  editable: false, validateCellEdit: undefined, spreadsheet: false, validateSheetEdit: undefined, maxSheetCells: 10_000,
  rowsEditable: false, validateRowCreate: undefined, validateRowDelete: undefined, validateRowMove: undefined,
})

const emit = defineEmits<{
  /** The expanded row IDs a toggle proposes; supports `v-model:expanded-ids`. */
  'update:expandedIds': [ids: string[]]
  /** A row whose `childStatus` is `unloaded` or `failed` was expanded (or its status line activated): load its children. */
  'expand-request': [rowId: string]
  /** The active cell moved; supports `v-model:active-cell`. */
  'update:activeCell': [position: TreeGridPosition]
  /** A row header was activated by click or Enter. */
  'row-activate': [activation: TreeGridActivation]
  /** A cell was activated by click or Enter (Enter on an editable cell starts editing instead). */
  'cell-activate': [activation: TreeGridActivation]
  /** Proposal to change one cell; apply it with `applyTreeGridEdits`. */
  'cell-edit': [change: TreeGridCellEdit]
  'cell-edit-rejected': [change: TreeGridCellEdit, reason: string]
  /** One batch of a paste, fill, clear or cut; apply its `edits` with `applyTreeGridEdits`. */
  'sheet-edit': [change: TreeGridSheetEdit]
  'sheet-edit-rejected': [change: TreeGridSheetEdit, reason: string]
  /** An open editor, a fill handle drag or a row drag ended without a proposal. */
  'edit-cancel': [event: TreeGridEditCancel]
  /** Proposal for a new row; the parent creates it with its own ID, for example with `insertTreeGridRow`. */
  'row-create': [change: TreeGridRowCreate]
  'row-create-rejected': [change: TreeGridRowCreate, reason: string]
  /** Proposal to delete rows; apply it with `deleteTreeGridRows`. */
  'row-delete': [change: TreeGridRowDelete]
  'row-delete-rejected': [change: TreeGridRowDelete, reason: string]
  /** Proposal to move a row; apply it with `moveTimelineRow(rows, change.id, change.after)`. */
  'row-move': [change: TimelineRowMove]
  'row-move-rejected': [change: TimelineRowMove, reason: string]
  /** Invalid rows, columns or cells; the grid then renders its empty state. */
  'validation-error': [error: Error]
}>()

const slots = defineSlots<{
  /** Content of a data cell. Keep it non-interactive: the cell takes the focus. */
  cell(props: { row: R; column: TreeGridColumn<R>; cell: TreeGridCellView; text: string; active: boolean; highlighted: boolean }): unknown
  /** Content of a row header, after the expand toggle. */
  'row-header'(props: { row: R; line: TreeGridLine<R>; active: boolean; highlighted: boolean; selected: boolean }): unknown
  /** Content of the status line of children that are not loaded. */
  status(props: { row: R; status: string; text: string }): unknown
  /** Content of a grid without rows or with invalid input. */
  empty(): unknown
}>()

const messages = computed<TreeGridLabels>(() => ({ ...treeGridDefaultLabels, ...props.labels }))
const uid = useId()
const root = ref<HTMLElement>()
const scroller = ref<HTMLElement>()
const notice = ref('')
let mounted = false

// Validation and the model.
const { value: model, error: validationError } = useValidatedSource(
  [() => props.rows, () => props.columns, () => props.cells, () => props.missingCell],
  () => {
    const index = createTreeGridIndex({ rows: props.rows, columns: props.columns, cells: props.cells, missingCell: props.missingCell })
    return { index, offsets: treeGridColumnOffsets(props.columns) }
  },
  { report: error => emit('validation-error', error), fallback: undefined as { index: TreeGridIndex<R>; offsets: number[] } | undefined },
)
const index = computed(() => model.value?.index)
const columns = computed(() => model.value?.index.columns ?? [])
const offsets = computed(() => model.value?.offsets ?? [0])
const idKey = (ids: readonly string[] | undefined) => JSON.stringify([...new Set(ids ?? [])].sort())
const expandedKey = computed(() => idKey(props.expandedIds))
const expandedSet = computed(() => new Set<string>(JSON.parse(expandedKey.value) as string[]))
const emptyLines: TreeGridLines<R> = { lines: [], rowLine: new Map(), statusLine: new Map() }
const flat = computed<TreeGridLines<R>>(() => index.value ? flattenTreeGrid(index.value, expandedSet.value) : emptyLines)
const lines = computed(() => flat.value.lines)
const columnCount = computed(() => columns.value.length + 1)
const axisWidth = computed(() => offsets.value[offsets.value.length - 1] ?? 0)
const toSet = (ids: IdList | undefined) => ids instanceof Set ? ids as ReadonlySet<string> : new Set<string>(ids as readonly string[] | undefined ?? [])
const selectedSet = computed(() => toSet(props.selectedRowIds))
const highlightedSet = computed(() => toSet(props.highlightedRowIds))
const cellKey = (rowId: string, columnId: string) => JSON.stringify([rowId, columnId])
const highlightedCellSet = computed(() => new Set((props.highlightedCells ?? []).map(cell => cellKey(cell.rowId, cell.columnId))))
const rtl = ref(props.dir === 'rtl')
watch(() => props.dir, () => readDirection())

// Viewport and windows.
const numericHeight = computed(() => typeof props.height === 'number' ? props.height : 400)
const viewport = shallowRef({ top: 0, start: 0, width: props.initialWidth, height: numericHeight.value })
const bodyView = computed(() => Math.max(0, viewport.value.height - props.headerHeight))
const axisView = computed(() => Math.max(0, viewport.value.width - props.treeColumnWidth))
const sameSpan = (a: TreeGridSpan | undefined, b: TreeGridSpan) => a !== undefined && a.start === b.start && a.end === b.end
const rowWindow = computed<TreeGridSpan>(previous => {
  const next = treeGridRowWindow({ scrollTop: viewport.value.top, viewport: bodyView.value, rowHeight: props.rowHeight, count: lines.value.length, overscan: props.overscan })
  return sameSpan(previous, next) ? previous! : next
})
const columnWindow = computed<TreeGridSpan>(previous => {
  const next = treeGridColumnWindow(offsets.value, { scrollStart: viewport.value.start, viewport: axisView.value, overscan: props.columnOverscan })
  return sameSpan(previous, next) ? previous! : next
})
function setViewport(next: Partial<typeof viewport.value>) {
  const value = { ...viewport.value, ...next }, now = viewport.value
  if (value.top !== now.top || value.start !== now.start || value.width !== now.width || value.height !== now.height) viewport.value = value
}
const scrollStartOf = (el: HTMLElement) => Math.abs(el.scrollLeft)
function onScroll() {
  const el = scroller.value
  if (el) setViewport({ top: el.scrollTop, start: scrollStartOf(el) })
  if (fill.value || rowDrag.value?.dragging) followPointer()
}

// The active cell. It is kept by IDs; its line and column follow the data.
const active = shallowRef<TreeGridPosition | undefined>(props.activeCell)
watch(() => props.activeCell, next => {
  if (next && (next.rowId !== active.value?.rowId || next.columnId !== active.value?.columnId || Boolean(next.status) !== Boolean(active.value?.status))) {
    active.value = next
    if (focusInside) void nextTick(focusActive)
  }
})
const cursor = computed<TreeGridCursor | undefined>(() => {
  const list = lines.value, model = index.value
  if (!list.length || !model) return undefined
  const found = active.value ? findTreeGridLine(model, flat.value, active.value) : undefined
  const line = found?.line ?? 0
  const column = found?.exact && active.value?.columnId !== undefined ? (model.columnIndex.get(active.value.columnId) ?? -1) + 1 : 0
  return { line, column }
})
// The column of the pinned cell in the active line: the active column, else the last one that was active.
const pinnedMemory = ref(1)
const pinnedColumn = computed(() => {
  const count = columns.value.length
  if (!count) return undefined
  const column = cursor.value?.column ?? 0
  return column > 0 ? column : Math.min(pinnedMemory.value, count)
})
watch(cursor, next => { if (next && next.column > 0) pinnedMemory.value = next.column })
// When the active position is hidden (collapsed, removed), the nearest displayed ancestor takes over.
watch(cursor, next => {
  const model = index.value
  if (!next || !model) return
  const position = treeGridPositionAt(model, flat.value, next)
  if (!position) return
  const now = active.value
  if (!now || now.rowId !== position.rowId || now.columnId !== position.columnId || Boolean(now.status) !== Boolean(position.status)) {
    active.value = position
    emit('update:activeCell', position)
  }
})

function setActive(next: TreeGridCursor, scroll = true) {
  const model = index.value
  if (!model) return
  const position = treeGridPositionAt(model, flat.value, next)
  if (!position) return
  const now = active.value
  if (!now || now.rowId !== position.rowId || now.columnId !== position.columnId || Boolean(now.status) !== Boolean(position.status)) {
    active.value = position
    emit('update:activeCell', position)
  }
  if (scroll) scrollIntoView(next)
}
function scrollIntoView(at: TreeGridCursor) {
  const el = scroller.value
  if (!el) return
  const top = scrollToShow(at.line * props.rowHeight, props.rowHeight, el.scrollTop, bodyView.value)
  const now = scrollStartOf(el)
  const start = at.column === 0 ? now : scrollToShow(offsets.value[at.column - 1]!, columns.value[at.column - 1]!.width, now, axisView.value)
  if (top !== el.scrollTop) el.scrollTop = top
  if (start !== now) el.scrollLeft = rtl.value ? -start : start
  setViewport({ top: el.scrollTop, start: scrollStartOf(el) })
}
let focusInside = false
function focusActive() {
  if (!mounted) return
  const target = scroller.value?.querySelector<HTMLElement>(`[data-vw-active] > [data-vw-col="${cursor.value?.column === 0 ? 0 : pinnedColumn.value}"]`)
  if (target && document.activeElement !== target) target.focus({ preventScroll: true })
}
function moveTo(next: TreeGridCursor) {
  setActive(next)
  void nextTick(focusActive)
}
function onFocusin() { focusInside = true }
function onFocusout(event: FocusEvent) {
  const next = event.relatedTarget as Node | null
  if (next && scroller.value?.contains(next)) return
  const target = event.target as HTMLElement
  void nextTick(() => {
    // A cell taken out of the DOM blurs without a related target; the active cell takes the focus back.
    if (!target.isConnected && (document.activeElement === document.body || document.activeElement === null)) focusActive()
    else if (!scroller.value?.contains(document.activeElement)) focusInside = false
  })
}
watch(lines, () => { if (focusInside && !editing.value) void nextTick(focusActive) }, { flush: 'post' })

// Expansion.
function setExpanded(line: TreeGridLine<R>, open: boolean) {
  const id = line.row.id
  const current = props.expandedIds ?? []
  if (open === expandedSet.value.has(id)) return
  emit('update:expandedIds', open ? [...current.filter(item => item !== id), id] : current.filter(item => item !== id))
  if (open && (line.row.childStatus === 'unloaded' || line.row.childStatus === 'failed')) emit('expand-request', id)
}

// Activation.
function activate(at: TreeGridCursor, source: TreeGridActivation['source']) {
  const line = lines.value[at.line], model = index.value
  if (!line || !model) return
  if (line.kind === 'status') {
    if (line.status === 'unloaded' || line.status === 'failed') emit('expand-request', line.row.id)
    return
  }
  const column = at.column > 0 ? columns.value[at.column - 1] : undefined
  if (!column) return emit('row-activate', { rowId: line.row.id, entities: line.row.entities ?? [], source })
  const view = resolveTreeGridCell(model, line.row.id, column.id)
  emit('cell-activate', {
    rowId: line.row.id, columnId: column.id, entities: view.entities.length ? view.entities : line.row.entities ?? [], source,
  })
}

// Cell text.
function valueText(view: TreeGridCellView, row: R, column: TreeGridColumn<R>): string {
  if (view.label !== undefined) return view.label
  const value = view.value!
  if (props.formatValue) return props.formatValue(value, { row, column })
  if (typeof value === 'boolean' && !column.editor?.format) return value ? messages.value.yes : messages.value.no
  const spec = treeGridFieldSpec(column)
  return spec ? formatFieldValue(spec, value) : String(value)
}
const stateWord: Record<string, keyof TreeGridLabels> = {
  none: 'none', unknown: 'unknown', 'not-applicable': 'notApplicable', unloaded: 'unloaded', loading: 'loading', failed: 'failed',
}
const stateMark: Record<string, keyof TreeGridLabels> = {
  none: 'noneMark', unknown: 'unknownMark', 'not-applicable': 'notApplicableMark', unloaded: 'unloadedMark', loading: 'loadingMark', failed: 'failedMark',
}
const statusText = (status: string | undefined) => messages.value[stateWord[status ?? 'unloaded'] ?? 'unloaded']
const cellEditable = (rowId: string, columnId: string) => props.editable && Boolean(index.value) && isTreeGridCellEditable(index.value!, rowId, columnId)

// Cell editing. One editor at a time, always in the active (pinned) cell, so scrolling never removes it.
interface Editing { rowId: string; columnId: string; text: string; before: FieldValue; error?: string; composing: boolean; select: boolean }
const editing = shallowRef<Editing>()
const editorId = `${uid}-editor-error`
function editorName(rowId: string, columnId: string) {
  const column = index.value?.columns[index.value.columnIndex.get(columnId)!]
  return `${messages.value.edit} ${column?.label ?? columnId} ${messages.value.for} ${index.value?.rowById.get(rowId)?.label ?? rowId}`
}
function cancelCellEdit(reason: TreeGridEditCancelReason, refocus = true) {
  const now = editing.value
  if (!now) return false
  editing.value = undefined
  emit('edit-cancel', { kind: 'cell', reason, rowId: now.rowId, columnId: now.columnId })
  if (refocus) void nextTick(focusActive)
  return true
}
// A select editor names its options by index, so options whose values or labels look alike (1 and '1', a value equal
// to another option's label, '' and no value) stay apart; '' is no value.
function selectKey(spec: TimelineFieldSpec<any>, value: FieldValue): string {
  if (value === null) return ''
  const at = spec.choices?.findIndex(choice => Object.is(choice.value, value)) ?? -1
  return at < 0 ? '' : String(at)
}
/** The typed value of the chosen option. A column with its own `parse` reads the option's text, as a paste would. */
function selectedValue(spec: TimelineFieldSpec<any>, key: string): FieldParseResult {
  const choice = key === '' ? undefined : spec.choices?.[Number(key)]
  if (!choice) return spec.required ? parseFieldValue(spec, '') : { ok: true, value: null }
  if (spec.parse) return parseFieldValue(spec, formatFieldValue(spec, choice.value as FieldValue))
  const check = validateFieldValue(spec, choice.value as FieldValue)
  return check.ok ? { ok: true, value: choice.value as FieldValue } : check
}
function startEdit(at: TreeGridCursor, text?: string): boolean {
  const line = lines.value[at.line], column = columns.value[at.column - 1]
  if (!line || line.kind !== 'row' || !column || !cellEditable(line.row.id, column.id)) return false
  // An editor that is still open commits first, as leaving it does; an invalid or rejected value keeps it open.
  if (editing.value && !commitEdit('keyboard')) return false
  setActive(at)
  const before = treeGridCellValue(index.value!, line.row.id, column.id)
  const spec = treeGridFieldSpec(column)!
  if (spec.kind === 'checkbox') {
    // A checkbox toggles at once: there is nothing to type.
    proposeCell({ rowId: line.row.id, columnId: column.id, before, after: before !== true, source: 'keyboard' })
    return true
  }
  editing.value = {
    rowId: line.row.id, columnId: column.id, before, composing: false,
    text: text ?? (spec.kind === 'select' ? selectKey(spec, before) : before === null ? '' : formatFieldValue(spec, before)),
    select: text === undefined,
  }
  void nextTick(() => {
    const input = scroller.value?.querySelector<HTMLInputElement | HTMLSelectElement>('.vw-tree-grid-editor')
    input?.focus({ preventScroll: true })
    if (input instanceof HTMLInputElement && editing.value?.select) input.select()
  })
  return true
}
/** Emits a checked cell proposal; returns the rejection reason or undefined. */
function proposeCell(change: TreeGridCellEdit): string | undefined {
  const reason = rejectionReason(props.validateCellEdit?.(change), messages.value.editRejected)
  if (reason !== undefined) {
    emit('cell-edit-rejected', change, reason)
    notice.value = reason
    return reason
  }
  emit('cell-edit', change)
  return undefined
}
function commitEdit(source: TreeGridCellEdit['source'], move?: 'down' | 'up' | 'next' | 'previous', refocus = true): boolean {
  const now = editing.value, model = index.value
  if (!now || !model) return false
  const column = model.columns[model.columnIndex.get(now.columnId)!]!
  const spec = treeGridFieldSpec(column)!
  // An unchanged select keeps its value as it is, also one that no option lists.
  const unchanged = spec.kind === 'select' && now.text === selectKey(spec, now.before)
  const parsed: FieldParseResult = unchanged ? { ok: true, value: now.before }
    : spec.kind === 'select' ? selectedValue(spec, now.text) : parseFieldValue(spec, now.text)
  if (!parsed.ok) {
    editing.value = { ...now, error: parsed.error }
    notice.value = parsed.error
    return false
  }
  if (parsed.value !== now.before) {
    const reason = proposeCell({ rowId: now.rowId, columnId: now.columnId, before: now.before, after: parsed.value, source })
    if (reason !== undefined) {
      if (editing.value) editing.value = { ...editing.value, error: reason }
      return false
    }
  }
  editing.value = undefined
  const at = cursor.value
  if (at && move) {
    const delta = move === 'down' ? [1, 0] : move === 'up' ? [-1, 0] : move === 'next' ? [0, 1] : [0, -1]
    moveTo({ line: Math.max(0, Math.min(lines.value.length - 1, at.line + delta[0]!)), column: Math.max(0, Math.min(columnCount.value - 1, at.column + delta[1]!)) })
  } else if (refocus) void nextTick(focusActive)
  return true
}
function editorKeydown(event: KeyboardEvent) {
  event.stopPropagation()
  const now = editing.value
  if (!now) return
  // During IME composition Enter and Escape belong to the input method; the edit commits once composition has ended.
  if (event.isComposing || now.composing || event.keyCode === 229) return
  if (event.key === 'Escape') {
    event.preventDefault()
    cancelCellEdit('escape')
  } else if (event.key === 'Enter') {
    event.preventDefault()
    commitEdit('keyboard', event.shiftKey ? 'up' : 'down')
  } else if (event.key === 'Tab') {
    event.preventDefault()
    commitEdit('keyboard', event.shiftKey ? 'previous' : 'next')
  }
}
function editorInput(event: Event) {
  const now = editing.value
  if (!now) return
  const target = event.target as HTMLInputElement | HTMLSelectElement
  // A select reports the chosen option by position (see selectKey); its value attribute may repeat between options.
  const text = target instanceof HTMLSelectElement ? selectKeyAt(target) : target.value
  editing.value = { ...now, text, error: undefined, select: false }
}
function selectProps<T extends { value?: unknown }>(props: T): Omit<T, 'value'> {
  const { value: _value, ...rest } = props
  return rest
}
function selectKeyAt(select: HTMLSelectElement): string {
  const first = select.options[0]?.hasAttribute('data-vw-none') ? 1 : 0
  const at = select.selectedIndex - first
  return at < 0 ? '' : String(at)
}
function editorBlur() {
  const now = editing.value
  if (!now) return
  // Leaving the editor (for another element) commits; an invalid or rejected value is dropped.
  setTimeout(() => {
    const still = editing.value
    if (!still || still.rowId !== now.rowId || still.columnId !== now.columnId) return
    if (scroller.value?.querySelector('.vw-tree-grid-editor') === document.activeElement) return
    // The focus went elsewhere (inside or outside the grid): commit without taking it back.
    if (!commitEdit('pointer', undefined, false)) cancelCellEdit('blur', false)
  })
}
function renderEditor(column: TreeGridColumn<R>): VNode {
  const now = editing.value!
  const spec = treeGridFieldSpec(column)!
  const common = {
    class: 'vw-tree-grid-editor', 'aria-label': editorName(now.rowId, now.columnId), 'aria-invalid': now.error ? 'true' : undefined,
    'aria-describedby': now.error ? editorId : undefined, value: now.text,
    onKeydown: editorKeydown, onInput: editorInput, onBlur: editorBlur,
    onPointerdown: (event: Event) => event.stopPropagation(),
  }
  const control = spec.kind === 'select'
    // The options carry the selection (by position); the select's value would match options by value text.
    ? h('select', { ...selectProps(common), onChange: editorInput }, [
      ...spec.required ? [] : [h('option', { value: '', 'data-vw-none': '', selected: now.text === '' }, '')],
      ...spec.choices!.map((choice, i) => h('option', { value: String(choice.value), selected: String(i) === now.text }, choice.label ?? String(choice.value))),
    ])
    : h('input', {
      ...common, type: 'text', inputmode: spec.kind === 'number' || spec.kind === 'duration' ? 'decimal' : undefined, autocomplete: 'off',
      onCompositionstart: () => { if (editing.value) editing.value = { ...editing.value, composing: true } },
      onCompositionend: (event: CompositionEvent) => {
        if (editing.value) editing.value = { ...editing.value, composing: false, text: (event.target as HTMLInputElement).value }
      },
    })
  return h(Fragment, [control, now.error ? h('span', { id: editorId, class: 'vw-tree-grid-editor-error' }, now.error) : createCommentVNode('')])
}

// Spreadsheet range: from an anchor (by IDs) to the active cell.
const anchor = shallowRef<TreeGridPosition>()
const anchorCursor = computed<TreeGridCursor | undefined>(() => {
  const model = index.value
  if (!anchor.value || !model) return undefined
  const found = findTreeGridLine(model, flat.value, anchor.value)
  if (!found?.exact) return undefined
  return { line: found.line, column: anchor.value.columnId === undefined ? 0 : (model.columnIndex.get(anchor.value.columnId) ?? -1) + 1 }
})
const range = computed<TreeGridRange | undefined>(() => cursor.value ? { anchor: anchorCursor.value ?? cursor.value, focus: cursor.value } : undefined)
const rangeBounds = computed(() => range.value && props.spreadsheet ? treeGridRangeBounds(range.value) : undefined)
const inRange = (line: number, column: number) => {
  const b = rangeBounds.value
  return Boolean(b && line >= b.top && line <= b.bottom && column >= b.left && column <= b.right && (b.top !== b.bottom || b.left !== b.right))
}
watch(() => [props.rows, props.columns, props.spreadsheet], () => { anchor.value = undefined })
function extendTo(next: TreeGridCursor) {
  if (!anchor.value && active.value) anchor.value = active.value
  moveTo(next)
}
const sheetChange = (action: TreeGridSheetEdit['action'], edits: TreeGridCellEdit[], source: TreeGridSheetEdit['source']): TreeGridSheetEdit => ({ action, edits, source })
function proposeSheet(action: TreeGridSheetEdit['action'], build: TreeGridSheetBuild, source: TreeGridSheetEdit['source']) {
  if (!build.ok) {
    const model = index.value
    const where = build.cell && model ? `${model.columns[model.columnIndex.get(build.cell.columnId)!]?.label} · ${model.rowById.get(build.cell.rowId)?.label}: ` : ''
    const reason = build.reason === 'too-large' ? (action === 'paste' ? messages.value.pasteTooLarge : build.error) : where + build.error
    emit('sheet-edit-rejected', sheetChange(action, [], source), reason)
    notice.value = reason
    return
  }
  if (!build.edits.length) return
  const change = sheetChange(action, build.edits, source)
  const reason = rejectionReason(props.validateSheetEdit?.(change), messages.value.sheetRejected)
  if (reason !== undefined) {
    emit('sheet-edit-rejected', change, reason)
    notice.value = reason
    return
  }
  emit('sheet-edit', change)
}
const canSheet = () => props.spreadsheet && Boolean(index.value) && Boolean(range.value) && !editing.value
function copySelection(): string {
  return canSheet() ? treeGridRangeText(index.value!, flat.value, range.value!) : ''
}
function pasteText(text: string, source: TreeGridSheetEdit['source'] = 'keyboard') {
  if (!canSheet() || !props.editable) return
  proposeSheet('paste', buildTreeGridPaste(index.value!, flat.value, range.value!, text, { maxCells: props.maxSheetCells, source }), source)
}
function onCopy(event: ClipboardEvent) {
  if (!canSheet() || (event.target as HTMLElement).closest?.('.vw-tree-grid-editor')) return
  event.clipboardData?.setData('text/plain', copySelection())
  event.preventDefault()
}
function onCut(event: ClipboardEvent) {
  if (!canSheet() || (event.target as HTMLElement).closest?.('.vw-tree-grid-editor')) return
  event.clipboardData?.setData('text/plain', copySelection())
  event.preventDefault()
  if (props.editable) proposeSheet('cut', buildTreeGridClear(index.value!, flat.value, range.value!), 'keyboard')
}
function onPaste(event: ClipboardEvent) {
  if (!canSheet() || (event.target as HTMLElement).closest?.('.vw-tree-grid-editor')) return
  event.preventDefault()
  pasteText(event.clipboardData?.getData('text/plain') ?? '')
}

// Fill handle drag: extends the range downwards and fills on release.
const fill = shallowRef<{ source: TreeGridRange; to: number; pointerId: number; clientX: number; clientY: number }>()
const fillBounds = computed(() => {
  const now = fill.value
  if (!now) return undefined
  const b = treeGridRangeBounds(now.source)
  return { ...b, bottom: Math.max(b.bottom, now.to) }
})
function cancelFill(reason: TreeGridEditCancelReason) {
  if (!fill.value) return false
  fill.value = undefined
  stopWindowPointer()
  emit('edit-cancel', { kind: 'fill', reason })
  return true
}

// Row proposals.
function rowLabel(id: string | undefined) { return id === undefined ? '' : index.value?.rowById.get(id)?.label ?? id }
function placeText(id: string, target: TimelineRowPosition) {
  const model = index.value!
  const siblings = model.tree.filter(item => item.row.parentId === target.parentId && item.row.id !== id).map(item => item.row.id)
  const m = messages.value
  if (target.index < siblings.length) return `${m.moveRow} ${rowLabel(id)} ${m.moveBefore} ${rowLabel(siblings[target.index])}`
  if (siblings.length) return `${m.moveRow} ${rowLabel(id)} ${m.moveAfter} ${rowLabel(siblings[siblings.length - 1])}`
  return `${m.moveRow} ${rowLabel(id)} ${m.moveInto} ${rowLabel(target.parentId)}`
}
function rowPositionOf(id: string): TimelineRowPosition {
  const row = index.value!.rowById.get(id)!
  const at = index.value!.tree.filter(item => item.row.parentId === row.parentId).findIndex(item => item.row.id === id)
  return row.parentId === undefined ? { index: at } : { parentId: row.parentId, index: at }
}
function proposeMove(id: string, after: TimelineRowPosition, source: TimelineRowMove['source']) {
  const change: TimelineRowMove = { id, before: rowPositionOf(id), after, source }
  const text = placeText(id, after)
  const reason = rejectionReason(props.validateRowMove?.(change), messages.value.rowMoveRejected)
  if (reason !== undefined) {
    emit('row-move-rejected', change, reason)
    notice.value = reason
    return
  }
  notice.value = text
  emit('row-move', change)
  void nextTick(focusActive)
}
function proposeCreate(referenceId: string, placement: TreeGridRowCreate['placement'], source: TreeGridRowCreate['source']) {
  const change = treeGridRowCreate(props.rows, referenceId, placement, source)
  const reason = rejectionReason(props.validateRowCreate?.(change), messages.value.rowCreateRejected)
  if (reason !== undefined) {
    emit('row-create-rejected', change, reason)
    notice.value = reason
    return
  }
  emit('row-create', change)
}
function proposeDelete(ids: string[], source: TreeGridRowDelete['source']) {
  const change: TreeGridRowDelete = { ids, includeDescendants: true, source }
  const reason = rejectionReason(props.validateRowDelete?.(change), messages.value.rowDeleteRejected)
  if (reason !== undefined) {
    emit('row-delete-rejected', change, reason)
    notice.value = reason
    return
  }
  emit('row-delete', change)
}
const rowDrag = shallowRef<{ id: string; pointerId: number; x: number; y: number; clientX: number; clientY: number; dragging: boolean; drop?: TreeGridDrop }>()
function cancelRowDrag(reason: TreeGridEditCancelReason) {
  const now = rowDrag.value
  if (!now) return false
  rowDrag.value = undefined
  stopWindowPointer()
  if (now.dragging) emit('edit-cancel', { kind: 'row-move', reason, rowId: now.id })
  return now.dragging
}
const dropText = computed(() => {
  const drop = rowDrag.value?.drop
  return drop && rowDrag.value ? placeText(rowDrag.value.id, drop.target) : ''
})

// Source changes end every edit in flight.
watch(() => [props.rows, props.columns, props.cells, props.editable, props.spreadsheet, props.rowsEditable], () => {
  cancelCellEdit('source-changed', false)
  cancelFill('source-changed')
  cancelRowDrag('source-changed')
})
watch(lines, () => {
  const now = editing.value
  if (now && !flat.value.rowLine.has(now.rowId)) cancelCellEdit('hidden', false)
  // Fill and row drags hold line numbers; once rows are shown or hidden they name other rows.
  cancelFill('source-changed')
  cancelRowDrag('source-changed')
})

/** Cancels the open editor, fill drag or row drag (reason `api`). Returns whether one was in flight. */
function cancelEdit() {
  return cancelCellEdit('api') || cancelFill('api') || cancelRowDrag('api')
}

// Keyboard.
function onKeydown(event: KeyboardEvent) {
  if (editing.value || !cursor.value || !index.value) return
  if ((event.target as HTMLElement).closest('button')) {
    if (event.key !== 'Escape') return
  }
  const at = cursor.value
  const line = lines.value[at.line]!
  const ctrl = event.ctrlKey || event.metaKey
  if (event.key === 'Escape') {
    if (cancelFill('escape') || cancelRowDrag('escape')) return event.preventDefault()
    if (anchor.value) anchor.value = undefined
    return
  }
  // Row structure keys on a row header.
  if (props.rowsEditable && at.column === 0 && line.kind === 'row') {
    if (event.altKey) {
      const target = treeGridRowMoveForKey(event, props.rows, line.row.id, rtl.value)
      if (target !== 'ignore') {
        event.preventDefault()
        if (target) proposeMove(line.row.id, target, 'keyboard')
        return
      }
    }
    if (event.key === 'Enter' && ctrl) {
      event.preventDefault()
      return proposeCreate(line.row.id, event.shiftKey ? 'child' : 'after', 'keyboard')
    }
    if (event.key === 'Delete') {
      event.preventDefault()
      return proposeDelete([line.row.id], 'keyboard')
    }
  }
  if (props.spreadsheet && event.shiftKey && !event.altKey && event.key.startsWith('Arrow')) {
    const step = treeGridKeyAction({ key: event.key, ctrlKey: event.ctrlKey, metaKey: event.metaKey }, at, context())
    if (step?.type === 'move') {
      event.preventDefault()
      return extendTo(step.to)
    }
  }
  if (props.spreadsheet && props.editable && (event.key === 'Delete' || event.key === 'Backspace') && at.column > 0) {
    event.preventDefault()
    return proposeSheet('clear', buildTreeGridClear(index.value, flat.value, range.value!), 'keyboard')
  }
  if (props.spreadsheet && props.editable && ctrl && !event.altKey && event.key.toLowerCase() === 'd') {
    event.preventDefault()
    return proposeSheet('fill', buildTreeGridFill(index.value, flat.value, range.value!, { maxCells: props.maxSheetCells }), 'keyboard')
  }
  if (props.editable && at.column > 0 && line.kind === 'row') {
    const column = columns.value[at.column - 1]!
    const startsEdit = event.key === 'F2' || (event.key === 'Enter' && !ctrl && !event.altKey)
      || (event.key === ' ' && treeGridFieldSpec(column)?.kind === 'checkbox')
    // Typing starts a text edit; it never toggles a checkbox (Space, Enter or F2 do).
    const typed = event.key.length === 1 && !ctrl && !event.altKey && event.key !== ' ' && treeGridFieldSpec(column)?.kind !== 'checkbox'
    if ((startsEdit || typed) && cellEditable(line.row.id, column.id)) {
      const kind = treeGridFieldSpec(column)!.kind
      event.preventDefault()
      startEdit(at, typed && kind !== 'select' && kind !== 'checkbox' ? event.key : undefined)
      return
    }
  }
  const action = treeGridKeyAction(event, at, context())
  if (!action) return
  event.preventDefault()
  if (action.type === 'move') {
    anchor.value = undefined
    moveTo(action.to)
  } else if (action.type === 'activate') activate(action.at, 'keyboard')
  else setExpanded(lines.value[action.line]!, action.type === 'expand')
}
function context() {
  return { lines: lines.value, columnCount: columnCount.value, pageSize: Math.max(1, Math.floor(bodyView.value / props.rowHeight) - 1), rtl: rtl.value }
}

// Pointer. One listener on the scroller reads the line and column from the cell's data attributes.
let press: { line: number; column: number; pointerId: number; x: number; y: number; range: boolean } | undefined
let windowListening = false
function startWindowPointer() {
  if (windowListening) return
  windowListening = true
  window.addEventListener('pointermove', onWindowMove)
  window.addEventListener('pointerup', onWindowUp)
  window.addEventListener('pointercancel', onWindowCancel)
}
function stopWindowPointer() {
  if (!windowListening || typeof window === 'undefined') return
  windowListening = false
  window.removeEventListener('pointermove', onWindowMove)
  window.removeEventListener('pointerup', onWindowUp)
  window.removeEventListener('pointercancel', onWindowCancel)
  edgeScroll.stop()
}
function cellAt(element: Element | null) {
  const cell = element?.closest<HTMLElement>('[data-vw-col]')
  const row = cell?.closest<HTMLElement>('[data-vw-line]')
  if (!cell || !row || !scroller.value?.contains(cell)) return undefined
  return { line: Number(row.dataset.vwLine), column: Number(cell.dataset.vwCol) }
}
/** The line under a client y, and the fraction of its height above the pointer. */
function lineAtY(clientY: number) {
  const el = scroller.value!
  const y = clientY - el.getBoundingClientRect().top + el.scrollTop - props.headerHeight
  const line = Math.max(0, Math.min(lines.value.length - 1, Math.floor(y / props.rowHeight)))
  return { line, fraction: Math.max(0, Math.min(1, y / props.rowHeight - line)) }
}
function onPointerdown(event: PointerEvent) {
  if (event.button !== 0 || !index.value) return
  const target = event.target as HTMLElement
  if (target.closest('.vw-tree-grid-editor')) return
  const action = target.closest<HTMLElement>('[data-vw-action]')
  if (action) return event.preventDefault()
  const fillHandle = target.closest('.vw-tree-grid-fill-handle')
  if (fillHandle && range.value && props.editable) {
    event.preventDefault()
    event.stopPropagation()
    fill.value = { source: range.value, to: treeGridRangeBounds(range.value).bottom, pointerId: event.pointerId, clientX: event.clientX, clientY: event.clientY }
    startWindowPointer()
    return
  }
  const at = cellAt(target)
  if (!at) return
  event.preventDefault()
  if (editing.value) commitEdit('pointer') || cancelCellEdit('blur', false)
  if (target.closest('.vw-tree-grid-toggle')) {
    setActive({ line: at.line, column: 0 }, false)
    void nextTick(focusActive)
    const line = lines.value[at.line]
    if (line?.expandable) setExpanded(line, !line.expanded)
    return
  }
  if (props.spreadsheet && event.shiftKey) extendTo(at)
  else {
    anchor.value = props.spreadsheet ? treeGridPositionAt(index.value, flat.value, at) : undefined
    setActive(at, false)
    void nextTick(focusActive)
  }
  press = { ...at, pointerId: event.pointerId, x: event.clientX, y: event.clientY, range: false }
  const line = lines.value[at.line]
  if (props.rowsEditable && at.column === 0 && line?.kind === 'row') {
    rowDrag.value = { id: line.row.id, pointerId: event.pointerId, x: event.clientX, y: event.clientY, clientX: event.clientX, clientY: event.clientY, dragging: false }
  }
  startWindowPointer()
}
const edgeScroll = edgeScroller(() => {
  const el = scroller.value, now = fill.value ?? (rowDrag.value?.dragging ? rowDrag.value : undefined)
  return el && now ? { scroller: el, clientX: now.clientX, clientY: now.clientY } : undefined
}, () => followPointer(), { axis: 'y', insets: { top: 36 } })
function followPointer() {
  if (fill.value) {
    const { line } = lineAtY(fill.value.clientY)
    if (line !== fill.value.to) fill.value = { ...fill.value, to: line }
  }
  const drag = rowDrag.value
  if (drag?.dragging && index.value) {
    const { line, fraction } = lineAtY(drag.clientY)
    const drop = treeGridDropAt(index.value, flat.value, drag.id, line, fraction)
    if (drop?.line !== drag.drop?.line || drop?.placement !== drag.drop?.placement || drop?.target.index !== drag.drop?.target.index) {
      rowDrag.value = { ...drag, drop }
    }
  }
}
function onWindowMove(event: PointerEvent) {
  if (fill.value && event.pointerId === fill.value.pointerId) {
    fill.value = { ...fill.value, clientX: event.clientX, clientY: event.clientY }
    followPointer()
    edgeScroll.start()
    return
  }
  const drag = rowDrag.value
  if (drag && event.pointerId === drag.pointerId) {
    if (!drag.dragging && !pastThreshold(drag, event)) return
    rowDrag.value = { ...drag, dragging: true, clientX: event.clientX, clientY: event.clientY }
    followPointer()
    edgeScroll.start()
    return
  }
  if (press && props.spreadsheet && event.pointerId === press.pointerId && (event.buttons & 1)) {
    const at = cellAt(document.elementFromPoint(event.clientX, event.clientY))
    if (at && at.column > 0 && (at.line !== cursor.value?.line || at.column !== cursor.value?.column)) {
      press.range = true
      setActive(at, false)
    }
  }
}
function onWindowUp(event: PointerEvent) {
  if (fill.value && event.pointerId === fill.value.pointerId) {
    const now = fill.value
    fill.value = undefined
    stopWindowPointer()
    const bounds = treeGridRangeBounds(now.source)
    if (now.to > bounds.bottom && index.value) {
      const target: TreeGridRange = { anchor: { line: bounds.top, column: bounds.left }, focus: { line: now.to, column: bounds.right } }
      proposeSheet('fill', buildTreeGridFill(index.value, flat.value, target, { source: now.source, origin: 'pointer', maxCells: props.maxSheetCells }), 'pointer')
    } else emit('edit-cancel', { kind: 'fill', reason: 'pointer-cancel' })
    return
  }
  const drag = rowDrag.value
  if (drag && event.pointerId === drag.pointerId) {
    rowDrag.value = undefined
    if (drag.dragging) {
      stopWindowPointer()
      press = undefined
      if (drag.drop) proposeMove(drag.id, drag.drop.target, 'pointer')
      else emit('edit-cancel', { kind: 'row-move', reason: 'pointer-cancel', rowId: drag.id })
      return
    }
  }
  const pressed = press
  press = undefined
  stopWindowPointer()
  if (!pressed || event.pointerId !== pressed.pointerId || pressed.range) return
  const at = cellAt(document.elementFromPoint(event.clientX, event.clientY))
  if (at && at.line === pressed.line && at.column === pressed.column) activate(at, 'pointer')
}
function onWindowCancel(event: PointerEvent) {
  if (fill.value?.pointerId === event.pointerId) cancelFill('pointer-cancel')
  if (rowDrag.value?.pointerId === event.pointerId) cancelRowDrag('pointer-cancel')
  press = undefined
  stopWindowPointer()
}
function onDblclick(event: MouseEvent) {
  const at = cellAt(event.target as Element)
  if (at && at.column > 0) startEdit(at)
}
function rowAction(event: MouseEvent) {
  const button = (event.target as HTMLElement).closest<HTMLElement>('[data-vw-action]')
  const line = lines.value[cursor.value?.line ?? -1]
  if (!button || !line || line.kind !== 'row') return
  const kind = button.dataset.vwAction
  if (kind === 'delete') proposeDelete([line.row.id], 'pointer')
  else proposeCreate(line.row.id, kind === 'child' ? 'child' : 'after', 'pointer')
}

// Methods.
function focusCell(position: TreeGridPosition): boolean {
  const model = index.value
  if (!model) return false
  const found = findTreeGridLine(model, flat.value, position)
  if (!found?.exact) return false
  const columnIndex = position.columnId === undefined ? -1 : model.columnIndex.get(position.columnId)
  if (columnIndex === undefined) return false
  const column = columnIndex + 1
  moveTo({ line: found.line, column })
  return true
}
/**
 * Scrolls to a row. `hidden-by-collapse` (with the nearest displayed ancestor as `proxyId`) when a collapsed ancestor
 * hides it, `unknown` when there is no such row. With `focus`, the row (or `columnId`) becomes the active cell.
 */
function revealRow(rowId: string, options: { focus?: boolean; columnId?: string } = {}): RevealResult {
  const model = index.value
  const found = model ? findTreeGridLine(model, flat.value, { rowId }) : undefined
  if (!model || !found) return { status: 'unknown' }
  if (!found.exact) return { status: 'hidden-by-collapse', proxyId: lines.value[found.line]!.row.id }
  const column = options.columnId === undefined ? 0 : (model.columnIndex.get(options.columnId) ?? -1) + 1
  const at = { line: found.line, column: Math.max(0, column) }
  if (options.focus) moveTo(at)
  else scrollIntoView(at)
  return { status: 'revealed' }
}
// The row action buttons draw their symbols as SVG, so they stay centred whatever font an application gives buttons.
const actionPaths = { after: 'M6 2.5v7M2.5 6h7', child: 'M3 2v4.5h6.5M7.5 4.5l2 2-2 2', delete: 'M3 3l6 6M9 3 3 9' } as const
function actionIcon(action: keyof typeof actionPaths) {
  return h('svg', { class: 'vw-tree-grid-action-icon', viewBox: '0 0 12 12', 'aria-hidden': 'true', focusable: 'false' }, [h('path', { d: actionPaths[action] })])
}
function readDirection() {
  rtl.value = props.dir === 'rtl' || (props.dir === 'auto' && mounted && Boolean(root.value) && getComputedStyle(root.value!).direction === 'rtl')
}

let observer: ResizeObserver | undefined
onMounted(() => {
  mounted = true
  readDirection()
  const el = scroller.value!
  setViewport({ width: el.clientWidth, height: el.clientHeight, top: el.scrollTop, start: scrollStartOf(el) })
  observer = new ResizeObserver(() => setViewport({ width: el.clientWidth, height: el.clientHeight }))
  observer.observe(el)
})
onBeforeUnmount(() => {
  observer?.disconnect()
  stopWindowPointer()
})

defineExpose({
  /** Makes a displayed cell the active cell and focuses it. Returns false when it is not displayed. */
  focusCell,
  /** Scrolls a row into view; see `RevealResult`. */
  revealRow,
  /** Opens the editor of a cell (default: the active cell). Returns false when the cell cannot be edited. */
  startEdit: (position?: TreeGridPosition) => {
    const model = index.value
    const found = position && model ? findTreeGridLine(model, flat.value, position) : undefined
    if (position && !found?.exact) return false
    const columnIndex = position?.columnId === undefined ? undefined : model?.columnIndex.get(position.columnId)
    if (position?.columnId !== undefined && columnIndex === undefined) return false
    const at = position && model ? { line: found!.line, column: columnIndex === undefined ? 0 : columnIndex + 1 } : cursor.value
    return at ? startEdit(at) : false
  },
  /** Cancels the open editor, fill handle drag or row drag with reason `api`. */
  cancelEdit,
  /** The selected range (or the active cell) as tab-separated text; empty without `spreadsheet`. */
  copySelection,
  /** Proposes pasting tab-separated text at the selected range, as a paste from the clipboard does. */
  pasteText: (text: string) => pasteText(text),
})

// Rendering. The body is a functional component of render functions, so one line's markup serves the window lists
// and the active line (see treeGrid/lineSegments.ts).
const lineStyle = (i: number) => ({ transform: `translateY(${props.headerHeight + i * props.rowHeight}px)` })
const columnStyle = (c: number) => ({ insetInlineStart: props.treeColumnWidth + offsets.value[c]! + 'px', width: columns.value[c]!.width + 'px' })

type BodyProps = { cellSlot?: typeof slots.cell; headerSlot?: (typeof slots)['row-header']; statusSlot?: typeof slots.status }
const GridBody: FunctionalComponent<BodyProps> = ({ cellSlot, headerSlot, statusSlot }) => {
  const list = lines.value, model = index.value, at = cursor.value
  if (!model || !at) return null
  const rows = rowWindow.value, cols = columnWindow.value
  const rowSlots = rows.end - rows.start, colSlots = cols.end - cols.start
  const segments = splitAround(rows, at.line)
  const pinned = pinnedColumn.value
  const cellSegments = splitAround(cols, pinned === undefined ? undefined : pinned - 1)
  const allCols: number[] = []
  for (let c = cols.start; c < cols.end; c++) allCols.push(c)
  const fills = fillBounds.value
  const fillSourceBottom = fill.value ? treeGridRangeBounds(fill.value.source).bottom : 0
  const hint = props.rowsEditable ? `${uid}-hint ${uid}-row-hint` : `${uid}-hint`

  function cell(i: number, line: TreeGridLine<R>, c: number, isActive: boolean, key?: number): VNode {
    const column = columns.value[c]!
    const columnNumber = c + 1
    const current = isActive && at!.column === columnNumber
    const view: TreeGridCellView | undefined = line.kind === 'row' ? resolveTreeGridCell(model!, line.row.id, column.id) : undefined
    const text = view?.state === 'value' ? valueText(view, line.row, column) : ''
    const highlighted = Boolean(view && highlightedCellSet.value.has(cellKey(line.row.id, column.id)))
    const canEdit = Boolean(view && cellEditable(line.row.id, column.id))
    const isEditing = current && editing.value?.rowId === line.row.id && editing.value.columnId === column.id
    const ranged = inRange(i, columnNumber)
    const b = rangeBounds.value
    const corner = Boolean(b && props.editable && i === b.bottom && columnNumber === b.right && !editing.value && !fills)
    const filling = Boolean(fills && i > fillSourceBottom && i <= fills.bottom && columnNumber >= fills.left && columnNumber <= fills.right)
    let content: unknown
    if (isEditing) content = renderEditor(column)
    else if (!view) content = null
    else if (cellSlot) content = cellSlot({ row: line.row, column, cell: view, text, active: current, highlighted })
    else if (view.state === 'value') content = text
    else if (view.state !== 'empty') {
      content = [
        h('span', { class: 'vw-tree-grid-mark', 'aria-hidden': 'true' }, messages.value[stateMark[view.state]!]),
        h('span', { class: 'vw-sr-only' }, messages.value[stateWord[view.state]!]),
      ]
    }
    const align = column.align ?? (typeof view?.value === 'number' && view.state === 'value' ? 'end' : 'start')
    return h('div', {
      key, role: 'gridcell', class: ['vw-tree-grid-cell', `vw-align-${align}`, view?.tone && `vw-tone-${view.tone}`, view && view.state !== 'value' && `vw-is-${view.state}`, {
        'vw-is-active': current, 'vw-is-highlighted': highlighted, 'vw-is-editable': canEdit, 'vw-is-editing': isEditing,
        'vw-is-in-range': ranged, 'vw-is-fill-preview': filling,
      }],
      'data-vw-col': columnNumber, 'aria-colindex': c + 2, tabindex: current ? 0 : -1, style: columnStyle(c),
      'aria-selected': props.spreadsheet ? String(ranged || current) : undefined,
      'aria-readonly': props.editable && view && !canEdit ? 'true' : undefined,
      'aria-describedby': current ? hint : undefined,
    }, [content as VNode, corner ? h('span', { class: 'vw-tree-grid-fill-handle', 'aria-hidden': 'true', title: messages.value.fillHandle }) : null])
  }
  function header(i: number, line: TreeGridLine<R>, isActive: boolean): VNode {
    const current = isActive && at!.column === 0
    const row = line.row
    const highlighted = line.kind === 'row' && highlightedSet.value.has(row.id)
    const selected = line.kind === 'row' && selectedSet.value.has(row.id)
    const m = messages.value
    const text = line.kind === 'status' ? statusText(line.status) : row.label
    const toggle = line.expandable
      ? h('span', { class: 'vw-tree-grid-toggle', 'aria-hidden': 'true', title: `${line.expanded ? m.collapse : m.expand} ${row.label}` })
      : h('span', { class: 'vw-tree-grid-toggle vw-is-leaf', 'aria-hidden': 'true' })
    let content: unknown
    if (line.kind === 'status') {
      content = h('span', { role: 'status', class: 'vw-tree-grid-status' }, statusSlot ? statusSlot({ row, status: line.status!, text }) as VNode[] : text)
    } else if (headerSlot) content = headerSlot({ row, line, active: current, highlighted, selected })
    else content = [h('span', { class: 'vw-tree-grid-label' }, row.label), row.detail ? h('small', { class: 'vw-tree-grid-detail' }, row.detail) : null]
    const actions = isActive && props.rowsEditable && line.kind === 'row'
      ? h('span', { class: 'vw-tree-grid-row-actions', role: 'group', 'aria-label': `${m.rowActions} ${row.label}`, onClick: rowAction }, [
        h('button', { type: 'button', tabindex: -1, 'data-vw-action': 'after', 'aria-label': `${m.addBelow} ${row.label}`, title: `${m.addBelow} ${row.label}` }, actionIcon('after')),
        h('button', { type: 'button', tabindex: -1, 'data-vw-action': 'child', 'aria-label': `${m.addChild} ${row.label}`, title: `${m.addChild} ${row.label}` }, actionIcon('child')),
        h('button', { type: 'button', tabindex: -1, 'data-vw-action': 'delete', 'aria-label': `${m.deleteRow} ${row.label}`, title: `${m.deleteRow} ${row.label}` }, actionIcon('delete')),
      ])
      : null
    return h('div', {
      role: 'rowheader', class: ['vw-tree-grid-header-cell', { 'vw-is-active': current, 'vw-is-movable': props.rowsEditable && line.kind === 'row' }],
      'data-vw-col': 0, 'aria-colindex': 1, tabindex: current ? 0 : -1, 'aria-label': text,
      'aria-description': line.kind === 'row' && row.detail ? row.detail : undefined,
      'aria-describedby': current ? hint : undefined,
      style: { '--vw-tree-grid-level': String(line.level - 1) },
    }, [toggle, content as VNode, actions])
  }
  function lineNode(i: number, isActive: boolean, key?: number): VNode {
    const line = list[i]!
    const isRow = line.kind === 'row'
    const children: (VNode | null)[] = [header(i, line, isActive)]
    if (isActive) {
      children.push(
        h(Fragment, cellSegments.before.map(c => cell(i, line, c, true, slotKey(c, colSlots)))),
        pinned === undefined ? createCommentVNode('') : cell(i, line, pinned - 1, true),
        h(Fragment, cellSegments.after.map(c => cell(i, line, c, true, slotKey(c, colSlots)))),
      )
    } else children.push(h(Fragment, allCols.map(c => cell(i, line, c, false, slotKey(c, colSlots)))))
    const dragged = rowDrag.value?.dragging && rowDrag.value.id === line.row.id && isRow
    return h('div', {
      key, role: 'row', class: ['vw-tree-grid-row', {
        'vw-is-status': !isRow, 'vw-is-selected': isRow && selectedSet.value.has(line.row.id),
        'vw-is-highlighted': isRow && highlightedSet.value.has(line.row.id), 'vw-is-active-line': isActive, 'vw-is-dragging': dragged,
        'vw-is-drop-inside': rowDrag.value?.drop?.line === i && rowDrag.value.drop.placement === 'inside',
      }],
      'data-vw-line': i, 'data-vw-active': isActive ? '' : undefined,
      'aria-rowindex': i + 2, 'aria-level': line.level, 'aria-setsize': line.setsize, 'aria-posinset': line.posinset,
      'aria-expanded': line.expandable ? String(line.expanded) : undefined,
      'aria-selected': isRow && props.selectedRowIds !== undefined ? String(selectedSet.value.has(line.row.id)) : undefined,
      'aria-busy': isRow && line.expanded && line.row.childStatus === 'loading' ? 'true' : undefined,
      style: lineStyle(i),
    }, children)
  }
  const drop = rowDrag.value?.dragging ? rowDrag.value.drop : undefined
  const dropLine = drop && drop.placement !== 'inside' && list[drop.line]
    ? h('div', {
      class: 'vw-tree-grid-drop', 'aria-hidden': 'true',
      style: { transform: `translateY(${props.headerHeight + (drop.placement === 'after' ? drop.line + 1 : drop.line) * props.rowHeight - 1}px)`, '--vw-tree-grid-level': String(list[drop.line]!.level - 1 + (drop.placement === 'after' && drop.target.parentId === list[drop.line]!.row.id ? 1 : 0)) },
    })
    : createCommentVNode('')
  return [
    h(Fragment, segments.before.map(i => lineNode(i, false, slotKey(i, rowSlots)))),
    lineNode(at.line, true),
    h(Fragment, segments.after.map(i => lineNode(i, false, slotKey(i, rowSlots)))),
    dropLine,
  ]
}

GridBody.props = ['cellSlot', 'headerSlot', 'statusSlot']

const headerColumns = computed(() => {
  const list: number[] = []
  for (let c = columnWindow.value.start; c < columnWindow.value.end; c++) list.push(c)
  return list
})
const gridStyle = computed(() => ({
  height: typeof props.height === 'number' ? props.height + 'px' : props.height,
  '--vw-tree-grid-row-height': props.rowHeight + 'px', '--vw-tree-grid-header-height': props.headerHeight + 'px',
  '--vw-tree-grid-tree-width': props.treeColumnWidth + 'px',
}))
const showEmpty = computed(() => Boolean(validationError.value) || !lines.value.length)
</script>

<template>
  <div ref="root" class="vw-tree-grid" :class="{ 'vw-rtl': rtl, 'vw-is-editable': editable, 'vw-is-spreadsheet': spreadsheet }"
    :dir="dir === 'auto' ? undefined : dir">
    <div ref="scroller" class="vw-tree-grid-scroll" role="treegrid" :aria-label="messages.grid" :aria-rowcount="lines.length + 1"
      :aria-colcount="columnCount" :aria-readonly="editable ? undefined : 'true'"
      :aria-multiselectable="spreadsheet || selectedRowIds !== undefined ? 'true' : undefined" :tabindex="showEmpty ? 0 : undefined"
      :style="gridStyle" @scroll.passive="onScroll" @keydown="onKeydown" @focusin="onFocusin" @focusout="onFocusout"
      @pointerdown="onPointerdown" @dblclick="onDblclick" @copy="onCopy" @cut="onCut" @paste="onPaste">
      <div v-if="showEmpty" class="vw-tree-grid-empty" role="row" aria-rowindex="1">
        <div role="gridcell"><slot name="empty">{{ messages.empty }}</slot></div>
      </div>
      <div v-else class="vw-tree-grid-canvas" :style="{ width: treeColumnWidth + axisWidth + 'px', height: headerHeight + lines.length * rowHeight + 'px' }">
        <div class="vw-tree-grid-head" role="row" aria-rowindex="1">
          <div class="vw-tree-grid-corner" role="columnheader" aria-colindex="1">{{ messages.treeColumn }}</div>
          <div v-for="c in headerColumns" :key="c % Math.max(1, headerColumns.length)" class="vw-tree-grid-column-head" role="columnheader"
            :aria-colindex="c + 2" :style="columnStyle(c)">{{ columns[c]!.label }}</div>
        </div>
        <div class="vw-tree-grid-body" role="rowgroup">
          <GridBody :cell-slot="$slots.cell" :header-slot="$slots['row-header']" :status-slot="$slots.status" />
        </div>
      </div>
    </div>
    <span :id="`${uid}-hint`" class="vw-sr-only">{{ messages.keyboardHint }}</span>
    <span v-if="rowsEditable" :id="`${uid}-row-hint`" class="vw-sr-only">{{ messages.rowMoveHint }}</span>
    <span class="vw-sr-only" aria-live="polite">{{ dropText || notice }}</span>
  </div>
</template>
