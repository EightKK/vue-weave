// Spreadsheet mode of GanttChart (`spreadsheet`): rectangular selection over the built-in extra columns, clipboard,
// clear, fill down and the keys that move between cells. Every change is proposed as one `TimelineSheetEdit`; the
// component owns rendering, focus and the single-cell editors. Only event handlers touch the DOM.
import { computed, shallowRef } from 'vue'
import { fieldValuesEqual, formatFieldValue, parseFieldValue } from '../../core/fieldEditing.js'
import { formatSheetText, parseSheetText } from '../../core/sheetEditing.js'
import type { TimelineColumn, TimelineRow, TimelineSheetEdit } from '../../core/types.js'

interface Address { row: string; column: string }
interface Index { row: number; column: number }
type Action = TimelineSheetEdit['action']

export interface SheetMessages { readOnly: string; ragged: string; outside: string }

export interface SheetOptions<R extends TimelineRow> {
  /** Displayed rows, in order (collapsed descendants excluded). */
  rows: () => readonly { row: R }[]
  columns: () => readonly TimelineColumn<R>[]
  editable: (row: R, col: TimelineColumn<R>) => boolean
  value: (row: R, col: TimelineColumn<R>) => string | number
  messages: () => SheetMessages
  validateField: (change: TimelineSheetEdit<R>['fieldEdits'][number]) => string | undefined
  validateCell: (change: TimelineSheetEdit<R>['cellEdits'][number]) => string | undefined
  validateSheet: (change: TimelineSheetEdit<R>) => string | undefined
  propose: (change: TimelineSheetEdit<R>) => void
  reject: (reason: string, change?: TimelineSheetEdit<R>) => void
  /** Scroll the displayed row into view and focus the cell button of `key`. */
  focus: (row: number, key: string) => void
  /** Open the single-cell editor; `text` replaces the cell text (typing), otherwise the editor shows the value. */
  edit: (row: R, col: TimelineColumn<R>, text?: string) => void
  /** Displayed row index under a client Y coordinate, clamped to the rows. */
  rowAt: (clientY: number) => number | undefined
  /** Scroll the chart when the pointer is near its upper or lower edge during a fill. */
  autoScroll: (clientY: number) => void
  /** Right-to-left layout: Left and Right arrows follow the visual direction. */
  rtl: () => boolean
  /** Whether another pointer gesture or an armed connection is in flight; a fill handle drag does not start then. */
  busy: () => boolean
}

export function sheetKey(rowId: string, columnId: string) {
  return JSON.stringify([rowId, columnId])
}

export function useSheet<R extends TimelineRow>(options: SheetOptions<R>) {
  const anchor = shallowRef<Address>()
  const end = shallowRef<Address>()
  /** Key of the cell whose single-cell editor is open. */
  const editing = shallowRef<string>()
  /** The fill handle drag: pointer, the rows it fills from and the last displayed row reached. */
  const fill = shallowRef<{ pointerId: number; top: number; bottom: number; left: number; right: number; last: number; values: string[] }>()
  let dragPointer: number | undefined
  /** The fill handle that captured the pointer of the fill drag. */
  let fillTarget: Element | undefined
  /**
   * End a fill handle drag without filling and release its pointer capture. Returns whether one was in flight; the
   * component reports it through `edit-cancel`.
   */
  function cancelFill() {
    const f = fill.value
    const target = fillTarget
    fill.value = undefined
    fillTarget = undefined
    if (f && target?.hasPointerCapture?.(f.pointerId)) target.releasePointerCapture(f.pointerId)
    return Boolean(f)
  }
  function reset() {
    dragPointer = undefined
    anchor.value = end.value = undefined
    editing.value = undefined
    cancelFill()
  }
  const rowIndices = computed(() => new Map(options.rows().map(({ row }, i) => [row.id, i])))
  const colIndices = computed(() => new Map(options.columns().map((col, i) => [col.id, i])))
  function index(address?: Address): Index | undefined {
    if (!address) return
    const row = rowIndices.value.get(address.row)
    const column = colIndices.value.get(address.column)
    if (row !== undefined && column !== undefined) return { row, column }
  }
  /**
   * New rows or columns: a selection drag in flight ends; the selection stays while its cells are still shown. The
   * component cancels a fill drag first, so that it can report it.
   */
  function refresh() {
    dragPointer = undefined
    cancelFill()
    if (!index(anchor.value) || !index(end.value)) reset()
  }
  const bounds = computed(() => {
    const a = index(anchor.value), b = index(end.value)
    if (!a || !b) return
    return { top: Math.min(a.row, b.row), bottom: Math.max(a.row, b.row),
      left: Math.min(a.column, b.column), right: Math.max(a.column, b.column) }
  })
  /** Displayed index of the active cell (the end of the selection). */
  const active = computed(() => index(end.value))
  function select(row: string, column: string, extend: boolean) {
    if (!extend || !index(anchor.value)) anchor.value = { row, column }
    end.value = { row, column }
  }
  function selectIndex(from: Index, to: Index) {
    const rows = options.rows(), columns = options.columns()
    anchor.value = { row: rows[from.row]!.row.id, column: columns[from.column]!.id }
    end.value = { row: rows[to.row]!.row.id, column: columns[to.column]!.id }
  }
  function selected(row: number, column: number) {
    const b = bounds.value
    return Boolean(b && row >= b.top && row <= b.bottom && column >= b.left && column <= b.right)
  }
  /** Whether a cell is in the rows a fill handle drag would fill (below the selection). */
  function filling(row: number, column: number) {
    const f = fill.value
    return Boolean(f && row > f.bottom && row <= f.last && column >= f.left && column <= f.right)
  }
  function text(row: R, col: TimelineColumn<R>) {
    return col.field ? formatFieldValue(col.field, col.field.get(row)) : String(options.value(row, col))
  }
  function selectionText() {
    const b = bounds.value
    if (!b) return
    return formatSheetText(options.rows().slice(b.top, b.bottom + 1).map(({ row }) =>
      options.columns().slice(b.left, b.right + 1).map(col => text(row, col))))
  }
  function copy(event: ClipboardEvent) {
    const value = selectionText()
    if (value === undefined || !event.clipboardData) return
    event.clipboardData.setData('text/plain', value)
    event.preventDefault()
  }
  function cut(event: ClipboardEvent) {
    copy(event)
    if (event.defaultPrevented) clear('keyboard')
  }
  /**
   * Check a rectangle of texts starting at `start` and propose it as one batch, or reject it as a whole with the
   * first reason: a ragged or oversized rectangle, a read-only cell, text a field cannot read, or a validator.
   */
  function propose(matrix: string[][], start: Index, action: Action, source: 'pointer' | 'keyboard') {
    const width = matrix[0]?.length ?? 0
    if (!width) return
    const messages = options.messages()
    if (matrix.some(line => line.length !== width)) return options.reject(messages.ragged)
    const rows = options.rows(), columns = options.columns()
    if (start.row + matrix.length > rows.length || start.column + width > columns.length) return options.reject(messages.outside)
    const changes: TimelineSheetEdit<R> = { action, fieldEdits: [], cellEdits: [] }
    for (let y = 0; y < matrix.length; y++) {
      const row = rows[start.row + y]!.row
      for (let x = 0; x < width; x++) {
        const value = matrix[y]![x]!
        const col = columns[start.column + x]!
        const reject = (reason: string) => options.reject(row.label + ' · ' + col.label + ': ' + reason)
        if (!options.editable(row, col)) return reject(messages.readOnly)
        if (col.field) {
          const parsed = parseFieldValue(col.field, value)
          if (!parsed.ok) return reject(parsed.error)
          const before = col.field.get(row)
          if (fieldValuesEqual(before, parsed.value)) continue
          const edit = { rowId: row.id, columnId: col.id, fieldId: col.field.id, before, after: parsed.value, source }
          const reason = options.validateField(edit)
          if (reason !== undefined) return reject(reason)
          changes.fieldEdits.push(edit)
        } else {
          const before = options.value(row, col)
          if (String(before) === value) continue
          const edit = { rowId: row.id, columnId: col.id, before, after: value }
          const reason = options.validateCell(edit)
          if (reason !== undefined) return reject(reason)
          changes.cellEdits.push(edit)
        }
      }
    }
    if (!changes.fieldEdits.length && !changes.cellEdits.length) return
    const reason = options.validateSheet(changes)
    if (reason !== undefined) return options.reject(reason, changes)
    options.propose(changes)
  }
  function paste(event: ClipboardEvent) {
    const b = bounds.value
    if (!b || !event.clipboardData?.types.includes('text/plain')) return
    event.preventDefault()
    let records = parseSheetText(event.clipboardData.getData('text/plain'))
    // One copied cell fills the whole selection.
    if (records.length === 1 && records[0]!.length === 1) {
      const value = records[0]![0]!
      records = Array.from({ length: b.bottom - b.top + 1 }, () => Array<string>(b.right - b.left + 1).fill(value))
    }
    propose(records, { row: b.top, column: b.left }, 'paste', 'keyboard')
  }
  function clear(source: 'pointer' | 'keyboard') {
    const b = bounds.value
    if (!b) return
    const blank = Array.from({ length: b.bottom - b.top + 1 }, () => Array<string>(b.right - b.left + 1).fill(''))
    propose(blank, { row: b.top, column: b.left }, 'clear', source)
  }
  /** Repeat the texts of the first selected row in the rows from `top + 1` through `last`. */
  function fillDown(top: number, last: number, left: number, right: number, source: 'pointer' | 'keyboard') {
    if (last <= top) return
    const first = options.rows()[top]!.row
    const values = options.columns().slice(left, right + 1).map(col => text(first, col))
    propose(Array.from({ length: last - top }, () => values), { row: top + 1, column: left }, 'fill', source)
  }
  function startDrag(event: PointerEvent, row: string, col: string) {
    if (event.button !== 0) return
    // Touch keeps scrolling the chart: a tap selects one cell (or extends with Shift) and the fill handle fills.
    dragPointer = event.pointerType === 'touch' ? undefined : event.pointerId
    select(row, col, event.shiftKey)
  }
  function extendDrag(event: PointerEvent, row: string, col: string) {
    if (dragPointer === event.pointerId && event.buttons === 1) select(row, col, true)
    else dragPointer = undefined
  }
  function finishPointer() { dragPointer = undefined }
  function startFill(event: PointerEvent) {
    const b = bounds.value
    if (!b || event.button !== 0 || !event.isPrimary || fill.value || options.busy()) return
    event.preventDefault()
    event.stopPropagation()
    fillTarget = event.currentTarget as Element
    fillTarget.setPointerCapture?.(event.pointerId)
    const first = options.rows()[b.top]!.row
    fill.value = { pointerId: event.pointerId, top: b.top, bottom: b.bottom, left: b.left, right: b.right, last: b.bottom,
      values: options.columns().slice(b.left, b.right + 1).map(col => text(first, col)) }
    dragPointer = undefined
  }
  function moveFill(event: PointerEvent) {
    const f = fill.value
    if (!f || f.pointerId !== event.pointerId) return
    event.stopPropagation()
    options.autoScroll(event.clientY)
    const row = options.rowAt(event.clientY)
    const last = row === undefined ? f.bottom : Math.max(f.bottom, row)
    if (last !== f.last) fill.value = { ...f, last }
  }
  function endFill(event: PointerEvent) {
    const f = fill.value
    if (!f || f.pointerId !== event.pointerId) return
    event.stopPropagation()
    fill.value = undefined
    fillTarget = undefined
    if (event.type !== 'pointerup' || f.last <= f.bottom) return
    selectIndex({ row: f.top, column: f.left }, { row: f.last, column: f.right })
    fillDown(f.top, f.last, f.left, f.right, 'pointer')
  }
  function move(at: Index, rowStep: number, columnStep: number, extend: boolean) {
    const rows = options.rows(), columns = options.columns()
    const y = Math.max(0, Math.min(rows.length - 1, at.row + rowStep))
    const x = Math.max(0, Math.min(columns.length - 1, at.column + columnStep))
    const row = rows[y]!.row.id, column = columns[x]!.id
    select(row, column, extend)
    options.focus(y, sheetKey(row, column))
  }
  /** Select the cell `rowStep` rows and `columnStep` columns from a cell and focus it (after an editor commit). */
  function moveFrom(rowId: string, columnId: string, rowStep: number, columnStep: number) {
    const at = index({ row: rowId, column: columnId })
    if (at) move(at, rowStep, columnStep, false)
  }
  function keys(event: KeyboardEvent, rowId: string, colId: string) {
    if (event.isComposing || event.keyCode === 229) return
    const at = index({ row: rowId, column: colId })
    if (!at) return
    const rows = options.rows(), columns = options.columns()
    const command = event.ctrlKey || event.metaKey
    const key = event.key
    // The chart's own Escape handler cancels a fill drag (`cancelFill`) and reports it through `edit-cancel`.
    if (fill.value && key === 'Escape') return
    if (command && !event.altKey && key.toLowerCase() === 'a') {
      event.preventDefault()
      selectIndex({ row: 0, column: 0 }, { row: rows.length - 1, column: columns.length - 1 })
      return
    }
    if (command && !event.altKey && key.toLowerCase() === 'x') {
      // Browsers do not cut from a cell that is not editable: copy through the copy event, then clear.
      event.preventDefault()
      if (document.execCommand('copy')) clear('keyboard')
      return
    }
    if (command && !event.altKey && key.toLowerCase() === 'd') {
      event.preventDefault()
      const b = bounds.value
      if (b) fillDown(b.top, b.bottom, b.left, b.right, 'keyboard')
      return
    }
    if (command && (key === 'Home' || key === 'End')) {
      event.preventDefault()
      move(key === 'Home' ? { row: 0, column: 0 } : { row: rows.length - 1, column: columns.length - 1 }, 0, 0, event.shiftKey)
      return
    }
    if (command || event.altKey) return
    const row = rows[at.row]!.row, col = columns[at.column]!
    switch (key) {
      case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight': {
        event.preventDefault()
        event.stopPropagation()
        const forward = options.rtl() ? -1 : 1
        const step = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -forward], ArrowRight: [0, forward] }[key] as [number, number]
        move(at, step[0], step[1], event.shiftKey)
        return
      }
      case 'Home': case 'End':
        event.preventDefault()
        move(at, 0, (key === 'Home' ? 0 : columns.length - 1) - at.column, event.shiftKey)
        return
      case 'Tab': {
        // Tab moves along the row and leaves the sheet past its first or last column.
        const step = event.shiftKey ? -1 : 1
        if (at.column + step < 0 || at.column + step >= columns.length) return
        event.preventDefault()
        move(at, 0, step, false)
        return
      }
      case 'Escape': {
        const b = bounds.value
        if (!b || (b.top === b.bottom && b.left === b.right)) return
        event.preventDefault()
        event.stopPropagation()
        select(rowId, colId, false)
        return
      }
      case 'Delete': case 'Backspace':
        event.preventDefault()
        clear('keyboard')
        return
      case 'Enter': case 'F2':
        event.preventDefault()
        event.stopPropagation()
        if (options.editable(row, col)) options.edit(row, col)
        else options.reject(row.label + ' · ' + col.label + ': ' + options.messages().readOnly)
        return
    }
    // A printable character starts editing with that character, as in a spreadsheet.
    if (key.length === 1 && key !== ' ') {
      event.preventDefault()
      if (options.editable(row, col)) options.edit(row, col, key)
      else options.reject(row.label + ' · ' + col.label + ': ' + options.messages().readOnly)
    }
  }
  return {
    end, editing, bounds, active, fill, reset, refresh, cancelFill, select, selected, filling, copy, cut, paste, keys, moveFrom,
    startDrag, extendDrag, finishPointer, startFill, moveFill, endFill,
  }
}
