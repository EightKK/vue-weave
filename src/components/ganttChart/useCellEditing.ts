// Cell editing of the GanttChart extra columns: the built-in text inputs of editable cells and their drafts, typed field
// editing (`TimelineColumn.field`) with the `cell-editor` slot or the built-in field input, and the single-cell editor of
// spreadsheet mode (`spreadsheet`), which the chart's `useSheet` opens. Proposals are emitted; the parent applies them.
import { nextTick, shallowRef, watch, type Ref, type WatchSource } from 'vue'
import type {
  GanttLabels, TimelineCellEdit, TimelineColumn, TimelineEditCancel, TimelineEditCancelReason, TimelineRow, TimelineSummary,
} from '../../core/types.js'
import type { ViewTargetSource } from '../../core/viewBindings.js'
import { fieldValuesEqual, formatFieldValue, parseFieldValue, validateFieldValue } from '../../core/fieldEditing.js'
import type { FieldCheck, FieldValue, TimelineFieldEdit } from '../../core/fieldEditing.js'
import type { ValidatorResult } from '../shared/validation.js'
import type { useSheet } from './sheet.js'

/** The props that cell editing reads. */
export interface CellEditingProps<R extends TimelineRow> {
  readonly rows: readonly R[]
  readonly columns?: readonly TimelineColumn<R>[]
  readonly readonly?: boolean
  readonly spreadsheet?: boolean
  readonly collapsedIds?: ReadonlySet<string>
  readonly validateCellEdit?: (change: TimelineCellEdit) => boolean | string | void
  readonly validateFieldEdit?: (change: TimelineFieldEdit<R>) => boolean | string | void
}

/** The events that cell editing emits. */
export interface CellEditingEmit<R extends TimelineRow> {
  (event: 'cell-edit', change: TimelineCellEdit): void
  (event: 'cell-edit-rejected', change: TimelineCellEdit, reason: string): void
  (event: 'field-edit', change: TimelineFieldEdit<R>): void
  (event: 'field-edit-rejected', change: TimelineFieldEdit<R>, reason: string): void
  (event: 'edit-cancel', cancel: TimelineEditCancel): void
}

export interface CellEditingOptions<R extends TimelineRow> {
  props: CellEditingProps<R>
  emit: CellEditingEmit<R>
  labels: () => GanttLabels
  /** The live region text. */
  notice: Ref<string>
  /** Announce a validator result and return its rejection reason (undefined accepts). */
  settle: (result: ValidatorResult, fallback?: string) => string | undefined
  /** The column summaries that `TimelineColumn.value` receives. */
  summaries: Ref<ReadonlyMap<string, TimelineSummary> | undefined>
  /** The collapsed rows the chart keeps itself; together with `collapsedIds` they hide rows. */
  localCollapsed: WatchSource
  rowById: () => ReadonlyMap<string, TimelineRow>
  /** The displayed index of each row that is not hidden by a collapsed ancestor. */
  rowOrder: () => ReadonlyMap<string, number>
  dataElement: (attribute: 'vwCell' | 'vwCellEditor', value: string) => HTMLElement | undefined
  /** The scroll viewport, which takes focus when a closed editor's cell is gone. */
  scroller: Ref<HTMLElement | undefined>
  hideTooltip: () => void
  /** The spreadsheet state of the chart (`useSheet`); read only in event handlers. */
  sheet: () => ReturnType<typeof useSheet<R>>
}

export function useCellEditing<R extends TimelineRow>(options: CellEditingOptions<R>) {
  const { props, emit, notice, settle, localCollapsed, dataElement, scroller, hideTooltip } = options
  const sheet = () => options.sheet()
  function canEditCell(row: R, column: TimelineColumn<R>) {
    if (props.readonly) return false
    return typeof column.editable === 'function' ? column.editable(row) : Boolean(column.editable)
  }
  function cellValue(row: R, column: TimelineColumn<R>) {
    return column.value(row, options.summaries.value?.get(row.id))
  }
  /**
   * Whether a key belongs to an input method composition (for example the Enter that confirms a Japanese conversion).
   * Such keys are left to the input method: they neither commit nor cancel an edit. keyCode 229 covers browsers that
   * end the composition before dispatching that key.
   */
  function composing(event: KeyboardEvent) {
    return event.isComposing || event.keyCode === 229
  }
  /**
   * Text being edited in the built-in cell inputs (plain and typed), by cell key, with the source text it edits. The
   * inputs show the draft instead of the source text, so a re-render during an edit (or an input method composition)
   * keeps what was typed. A commit or Escape ends the draft; new source text for the cell discards it, which cancels the
   * edit. Deliberately not reactive: the input already shows the text, and typing must not re-render the chart.
   */
  const cellDrafts = new Map<string, { text: string; source: string }>()
  /** The text a built-in cell input shows: its draft while one is in progress for this source text, else the source text. */
  function cellInputText(key: string, source: string) {
    const draft = cellDrafts.get(key)
    if (draft && draft.source === source) return draft.text
    cellDrafts.delete(key)
    return source
  }
  function recordCellDraft(event: Event, key: string, source: string) {
    cellDrafts.set(key, { text: (event.currentTarget as HTMLInputElement).value, source })
  }
  function plainCellText(row: R, column: TimelineColumn<R>) {
    return String(cellValue(row, column))
  }
  /** Enter in a plain cell input commits through `change` by leaving the input (in a spreadsheet, it commits and moves down). */
  function cellEnter(event: KeyboardEvent, row: R, column: TimelineColumn<R>) {
    if (composing(event)) return
    if (commitSheetInput(event, row, column)) return
    event.preventDefault()
    ;(event.currentTarget as HTMLInputElement).blur()
  }
  function cancelCell(event: KeyboardEvent, row: R, column: TimelineColumn<R>) {
    // Escape during a composition cancels the composition only; keep the text and focus. Do not let the region's Escape
    // handler see it either.
    event.stopPropagation()
    if (composing(event)) return
    event.preventDefault()
    const input = event.currentTarget as HTMLInputElement
    cellDrafts.delete(cellKey(row, column))
    input.value = plainCellText(row, column)
    endSheetEdit(row, column)
    input.blur()
  }
  function commitCell(event: Event, row: R, column: TimelineColumn<R>) {
    commitCellText(event.currentTarget as HTMLInputElement, row, column)
  }
  function commitCellText(input: HTMLInputElement, row: R, column: TimelineColumn<R>) {
    const before = cellValue(row, column)
    const after = input.value
    cellDrafts.delete(cellKey(row, column))
    input.value = String(before)
    if (!canEditCell(row, column) || String(before) === after) return
    const change: TimelineCellEdit = { rowId: row.id, columnId: column.id, before, after }
    const reason = settle(props.validateCellEdit?.(change))
    if (reason !== undefined) emit('cell-edit-rejected', change, reason)
    else emit('cell-edit', change)
  }

  // Typed field editing (`TimelineColumn.field`). Such a column emits `field-edit` only, never `cell-edit`. A `cell` slot
  // owns the cell; otherwise the `cell-editor` slot edits it, or the built-in text input parses the text with
  // the field. Columns without `field` render and behave as plain columns.
  type CellEditorState = {
    rowId: string; columnId: string; before: FieldValue; draft: FieldValue; validation: FieldCheck; source: ViewTargetSource
  }
  const cellEditor = shallowRef<CellEditorState>()
  /** The cell of the built-in field input whose text could not be read, with the reason. */
  const fieldInputError = shallowRef<{ key: string; error: string }>()
  function cellKey(row: TimelineRow, column: TimelineColumn<R>) {
    return JSON.stringify([row.id, column.id])
  }
  function editingCell(row: TimelineRow, column: TimelineColumn<R>) {
    const state = cellEditor.value
    return state !== undefined && state.rowId === row.id && state.columnId === column.id
  }
  function fieldText(row: R, column: TimelineColumn<R>) {
    return formatFieldValue(column.field!, column.field!.get(row))
  }

  /** Return focus to the cell of a closed editor, or to the chart region when the cell is gone. */
  async function focusCell(key: string) {
    await nextTick()
    const cell = dataElement('vwCell', key)
    if (cell) cell.focus({ preventScroll: true })
    else scroller.value?.focus({ preventScroll: true })
  }
  async function startCellEditor(row: R, column: TimelineColumn<R>, source: ViewTargetSource) {
    if (!column.field || !canEditCell(row, column)) return
    // Opening another cell's editor cancels the open one, as Escape would, without moving focus back to it.
    if (cellEditor.value) cancelCellEditor('escape', false)
    const before = column.field.get(row)
    cellEditor.value = { rowId: row.id, columnId: column.id, before, draft: before, validation: { ok: true }, source }
    hideTooltip()
    await nextTick()
    const editor = dataElement('vwCellEditor', cellKey(row, column))
    const first = editor?.querySelector<HTMLElement>('input, select, textarea, button, [tabindex]:not([tabindex="-1"]), [contenteditable]:not([contenteditable="false"])')
    ;(first ?? editor)?.focus({ preventScroll: true })
  }
  function closeCellEditor(returnFocus: boolean) {
    const state = cellEditor.value
    if (!state) return
    const key = JSON.stringify([state.rowId, state.columnId])
    const editor = dataElement('vwCellEditor', key)
    const focused = typeof document !== 'undefined' && editor?.contains(document.activeElement)
    cellEditor.value = undefined
    if (returnFocus || focused) void focusCell(key)
  }
  /** Close an open `cell-editor` without a proposal and report it through `edit-cancel`. */
  function cancelCellEditor(reason: TimelineEditCancelReason, returnFocus = reason === 'escape') {
    const state = cellEditor.value
    if (!state) return
    closeCellEditor(returnFocus)
    emit('edit-cancel', { reason, barIds: [], cell: { rowId: state.rowId, columnId: state.columnId } })
  }
  function editorTarget() {
    const state = cellEditor.value
    const row = state && options.rowById().get(state.rowId) as R | undefined
    const column = state && props.columns?.find(item => item.id === state.columnId)
    return state && row && column?.field && canEditCell(row, column) ? { state, row, column, field: column.field } : undefined
  }
  /** Propose `after` for a field cell. Shared by the `cell-editor` slot and the built-in field input. */
  function proposeField(row: R, column: TimelineColumn<R>, before: FieldValue, after: FieldValue, source: ViewTargetSource): FieldCheck {
    const field = column.field!
    const check = validateFieldValue(field, after)
    if (!check.ok) {
      notice.value = check.error
      return check
    }
    if (fieldValuesEqual(before, after)) return check
    const change: TimelineFieldEdit<R> = { rowId: row.id, columnId: column.id, fieldId: field.id, before, after, source }
    const reason = settle(props.validateFieldEdit?.(change))
    if (reason !== undefined) {
      emit('field-edit-rejected', change, reason)
      return { ok: false, code: 'custom', error: reason }
    }
    emit('field-edit', change)
    return check
  }
  function commitCellEditor(value: FieldValue, source?: ViewTargetSource): FieldCheck {
    const target = editorTarget()
    if (!target) {
      cancelCellEditor('source-changed')
      return { ok: false, code: 'invalid', error: options.labels().rejected }
    }
    const { state, row, column } = target
    // An unchanged value closes the editor without a proposal, even when the current value would not pass validation.
    if (fieldValuesEqual(state.before, value)) {
      closeCellEditor(true)
      return { ok: true }
    }
    const result = proposeField(row, column, state.before, value, source ?? state.source)
    if (result.ok) closeCellEditor(true)
    else cellEditor.value = { ...state, draft: value, validation: result }
    return result
  }
  function commitCellEditorText(text: string, source?: ViewTargetSource): FieldCheck {
    const target = editorTarget()
    if (!target) return commitCellEditor(null, source)
    // The formatted current value, committed unedited, keeps the current value as it is.
    if (text === formatFieldValue(target.field, target.state.before)) return commitCellEditor(target.state.before, source)
    const parsed = parseFieldValue(target.field, text)
    if (parsed.ok) return commitCellEditor(parsed.value, source)
    notice.value = parsed.error
    cellEditor.value = { ...target.state, validation: parsed }
    return parsed
  }
  function cellEditorProps(row: R, column: TimelineColumn<R>) {
    const state = cellEditor.value!
    return {
      row, column, field: column.field!, value: state.before, draft: state.draft, validation: state.validation,
      error: state.validation.ok ? undefined : state.validation.error, source: state.source,
      commit: commitCellEditor, commitText: commitCellEditorText, cancel: () => cancelCellEditor('escape'),
    }
  }
  function cellEditorKeys(event: KeyboardEvent) {
    // The slot committed or cancelled on this key and focus is about to return to the cell button. Prevent the default
    // action so that the same Enter or Space does not activate the button and open the editor again.
    if (!cellEditor.value) return event.preventDefault()
    if (event.key !== 'Escape' || event.defaultPrevented) return
    // Escape during an input method composition cancels the composition only; the editor stays open.
    event.stopPropagation()
    if (composing(event)) return
    event.preventDefault()
    cancelCellEditor('escape')
  }
  /**
   * The built-in field input: Enter or a change parses the text with the field and proposes the value. Text left as the
   * current value is shown ends the edit without a proposal.
   */
  function commitFieldInput(event: Event, row: R, column: TimelineColumn<R>) {
    commitFieldText(event.currentTarget as HTMLInputElement, row, column)
  }
  function commitFieldText(input: HTMLInputElement, row: R, column: TimelineColumn<R>) {
    const field = column.field!
    const before = field.get(row)
    const key = cellKey(row, column)
    const shown = formatFieldValue(field, before)
    if (!canEditCell(row, column) || input.value === shown) {
      if (fieldInputError.value?.key === key) fieldInputError.value = undefined
      cellDrafts.delete(key)
      input.value = shown
      return
    }
    const parsed = parseFieldValue(field, input.value)
    if (!parsed.ok) {
      // Keep the text so it can be corrected; the reason is announced and the input is marked invalid. The error belongs
      // to this draft and goes with it when the source text changes.
      cellDrafts.set(key, { text: input.value, source: shown })
      fieldInputError.value = { key, error: parsed.error }
      notice.value = parsed.error
      return
    }
    if (fieldInputError.value?.key === key) fieldInputError.value = undefined
    cellDrafts.delete(key)
    input.value = shown
    proposeField(row, column, before, parsed.value, 'keyboard')
  }
  function fieldInputEnter(event: KeyboardEvent, row: R, column: TimelineColumn<R>) {
    // The Enter that confirms an input method conversion keeps the text and focus; a later Enter commits.
    if (composing(event)) return
    if (commitSheetInput(event, row, column)) return
    event.preventDefault()
    commitFieldInput(event, row, column)
  }
  function cancelFieldInput(event: KeyboardEvent, row: R, column: TimelineColumn<R>) {
    event.stopPropagation()
    if (composing(event)) return
    event.preventDefault()
    const input = event.currentTarget as HTMLInputElement
    const key = cellKey(row, column)
    cellDrafts.delete(key)
    input.value = fieldText(row, column)
    if (fieldInputError.value?.key === key) fieldInputError.value = undefined
    endSheetEdit(row, column)
  }
  // New rows or columns, or a row hidden by collapsing, cancel an open cell editor.
  watch([() => props.rows, () => props.columns, () => props.readonly, () => props.collapsedIds, localCollapsed], () => {
    const state = cellEditor.value
    if (!state) return
    cancelCellEditor(options.rowById().has(state.rowId) && !options.rowOrder().has(state.rowId) ? 'hidden' : 'source-changed')
  })
  // New source text for a cell with a draft, or a row that is hidden or gone, discards the draft (and its parse error)
  // before the next render, so the input shows the source text again.
  watch([() => props.rows, () => props.columns, () => props.readonly, () => props.collapsedIds, localCollapsed, options.summaries], () => {
    for (const [key, draft] of cellDrafts) {
      const [rowId, columnId] = JSON.parse(key) as [string, string]
      const row = options.rowOrder().has(rowId) ? options.rowById().get(rowId) as R | undefined : undefined
      const column = props.columns?.find(item => item.id === columnId)
      const current = row && column && canEditCell(row, column)
        ? (column.field ? fieldText(row, column) : plainCellText(row, column)) : undefined
      if (current === draft.source) continue
      cellDrafts.delete(key)
      if (fieldInputError.value?.key === key) fieldInputError.value = undefined
    }
  })
  // The cell with a parse error is watched on its own: its source text can change without new props (a `field.get` that
  // reads other reactive state), and the error belongs to the draft of the old text.
  watch(() => {
    const error = fieldInputError.value
    if (!error) return true
    const draft = cellDrafts.get(error.key)
    const [rowId, columnId] = JSON.parse(error.key) as [string, string]
    const row = options.rowOrder().has(rowId) ? options.rowById().get(rowId) as R | undefined : undefined
    const column = props.columns?.find(item => item.id === columnId)
    return Boolean(draft && row && column?.field && canEditCell(row, column) && fieldText(row, column) === draft.source)
  }, current => {
    if (current) return
    const key = fieldInputError.value!.key
    cellDrafts.delete(key)
    fieldInputError.value = undefined
  })
  /** Open the built-in single-cell editor of a spreadsheet cell; `text` replaces the cell text (typing to edit). */
  async function editSheetCell(row: R, column: TimelineColumn<R>, text?: string) {
    if (!canEditCell(row, column)) return
    const key = cellKey(row, column)
    if (text !== undefined) cellDrafts.set(key, { text, source: column.field ? fieldText(row, column) : plainCellText(row, column) })
    sheet().select(row.id, column.id, false)
    sheet().editing.value = key
    await focusCell(key)
    const input = dataElement('vwCell', key)
    if (input instanceof HTMLInputElement) input.setSelectionRange(input.value.length, input.value.length)
  }
  /** Close the spreadsheet editor of a cell and return focus to its cell button. */
  function endSheetEdit(row: R, column: TimelineColumn<R>) {
    const key = cellKey(row, column)
    if (sheet().editing.value !== key) return false
    sheet().editing.value = undefined
    void focusCell(key)
    return true
  }
  /**
   * Enter (down, Shift+Enter up) or Tab (along the row) in a spreadsheet editor: commit, then select the next cell.
   * Text a field cannot read keeps the editor open. Returns false when the input is not a spreadsheet editor.
   */
  function commitSheetInput(event: KeyboardEvent, row: R, column: TimelineColumn<R>) {
    const key = cellKey(row, column)
    if (!props.spreadsheet || sheet().editing.value !== key) return false
    event.preventDefault()
    event.stopPropagation()
    const input = event.currentTarget as HTMLInputElement
    if (column.field) commitFieldText(input, row, column)
    else commitCellText(input, row, column)
    if (fieldInputError.value?.key === key) return true
    sheet().editing.value = undefined
    const forward = event.shiftKey ? -1 : 1
    if (event.key === 'Tab') sheet().moveFrom(row.id, column.id, 0, forward)
    else sheet().moveFrom(row.id, column.id, forward, 0)
    return true
  }
  function sheetInputTab(event: KeyboardEvent, row: R, column: TimelineColumn<R>) {
    if (!composing(event)) commitSheetInput(event, row, column)
  }
  function sheetButtonFocus(row: R, column: TimelineColumn<R>) {
    const end = sheet().end.value
    if (end?.row !== row.id || end.column !== column.id) sheet().select(row.id, column.id, false)
  }
  /** Focus leaving a spreadsheet editor (a click elsewhere) commits it through `change` and closes it. */
  function leaveSheetCell(event: FocusEvent, row: R, column: TimelineColumn<R>) {
    if (event.target instanceof HTMLInputElement && sheet().editing.value === cellKey(row, column)) sheet().editing.value = undefined
  }
  return {
    canEditCell, cellValue, cellKey, cellInputText, recordCellDraft, plainCellText, cellEnter, cancelCell, commitCell, editingCell,
    fieldText, fieldInputError, startCellEditor, cancelCellEditor, cellEditorProps, cellEditorKeys, commitFieldInput, fieldInputEnter,
    cancelFieldInput, focusCell, editSheetCell, sheetInputTab, sheetButtonFocus, leaveSheetCell,
  }
}
