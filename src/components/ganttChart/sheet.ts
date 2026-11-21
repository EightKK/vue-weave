import { computed, shallowRef } from 'vue'
import { fieldValuesEqual, formatFieldValue, parseFieldValue } from '../../core/fieldEditing.js'
import { parseCsv } from '../../core/interchangeCsv.js'
import type { TimelineColumn, TimelineRow, TimelineSheetEdit } from '../../core/types.js'

interface Address { row: string; column: string }
interface Index { row: number; column: number }

export function useSheet<R extends TimelineRow>(options: {
  rows: () => readonly { row: R }[]
  columns: () => readonly TimelineColumn<R>[]
  editable: (row: R, col: TimelineColumn<R>) => boolean
  value: (row: R, col: TimelineColumn<R>) => string | number
  validateField: (change: TimelineSheetEdit<R>['fieldEdits'][number]) => string | undefined
  validateCell: (change: TimelineSheetEdit<R>['cellEdits'][number]) => string | undefined
  propose: (change: TimelineSheetEdit<R>) => void
  reject: (reason: string) => void
  focus: (row: number, key: string) => void
}) {
  const anchor = shallowRef<Address>()
  const end = shallowRef<Address>()
  const editing = shallowRef<string>()
  let pointer: number | undefined
  const fillSource = shallowRef<{ row: number; left: number; right: number; values: string[] }>()
  function reset() {
    pointer = undefined
    anchor.value = end.value = undefined
    editing.value = undefined
    fillSource.value = undefined
  }
  const rowIndices = computed(() => new Map(options.rows().map(({ row }, i) => [row.id, i])))
  const colIndices = computed(() => new Map(options.columns().map((col, i) => [col.id, i])))
  function index(address?: Address): Index | undefined {
    if (!address) return
    const row = rowIndices.value.get(address.row)
    const column = colIndices.value.get(address.column)
    if (row !== undefined && column !== undefined) return { row, column }
  }
  function refresh() {
    pointer = undefined
    fillSource.value = undefined
    if (!index(anchor.value) || !index(end.value)) reset()
  }
  const bounds = computed(() => {
    const a = index(anchor.value), b = index(end.value)
    if (!a || !b) return
    return { top: Math.min(a.row, b.row), bottom: Math.max(a.row, b.row),
      left: Math.min(a.column, b.column), right: Math.max(a.column, b.column) }
  })
  function select(row: string, column: string, extend: boolean) {
    if (!extend || !index(anchor.value)) anchor.value = { row, column }
    end.value = { row, column }
  }
  function selected(row: number, column: number) {
    const b = bounds.value
    return b && row >= b.top && row <= b.bottom && column >= b.left && column <= b.right
  }
  function text(row: R, col: TimelineColumn<R>) {
    return col.field ? formatFieldValue(col.field, col.field.get(row)) : String(options.value(row, col))
  }
  function copy(event: ClipboardEvent) {
    const b = bounds.value
    if (!b || !event.clipboardData) return
    const records = options.rows().slice(b.top, b.bottom + 1).map(({ row }) =>
      options.columns().slice(b.left, b.right + 1).map(col => {
        const value = text(row, col)
        return /["\r\n\t]/.test(value) ? '"' + value.replace(/"/g, '""') + '"' : value
      }).join('\t'))
    event.clipboardData.setData('text/plain', records.join('\r\n'))
    event.preventDefault()
  }
  function propose(matrix: string[][], start: Index, action: 'paste' | 'fill') {
    const changes: TimelineSheetEdit<R> = { action, fieldEdits: [], cellEdits: [] }
    const width = matrix[0]?.length ?? 0
    if (!width) return
    if (matrix.some(line => line.length !== width) || start.row + matrix.length > options.rows().length ||
      start.column + width > options.columns().length) return options.reject('The clipboard must fit a rectangular range.')
    for (const [y, values] of matrix.entries()) {
      const row = options.rows()[start.row + y]!.row
      for (const [x, value] of values.entries()) {
        const col = options.columns()[start.column + x]!
        const reject = (reason: string) => options.reject(row.label + ' · ' + col.label + ': ' + reason)
        if (!options.editable(row, col)) return reject('Read-only cell.')
        if (col.field) {
          const parsed = parseFieldValue(col.field, value)
          if (!parsed.ok) return reject(parsed.error)
          const before = col.field.get(row)
          if (fieldValuesEqual(before, parsed.value)) continue
          const edit = { rowId: row.id, columnId: col.id, fieldId: col.field.id, before, after: parsed.value, source: 'keyboard' as const }
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
    if (changes.fieldEdits.length || changes.cellEdits.length) options.propose(changes)
  }
  function paste(event: ClipboardEvent) {
    const b = bounds.value
    if (!b || !event.clipboardData?.types.includes('text/plain')) return
    event.preventDefault()
    const clipboard = event.clipboardData.getData('text/plain')
    let records: string[][]
    try { records = clipboard === '' ? [['']] : parseCsv(clipboard, { delimiter: '\t' }) }
    catch (error) { return options.reject(String(error)) }
    if (records.length === 1 && records[0]?.length === 1) {
      const value = records[0][0]!
      records = Array.from({ length: b.bottom - b.top + 1 }, () => Array<string>(b.right - b.left + 1).fill(value))
    }
    propose(records, { row: b.top, column: b.left }, 'paste')
  }
  function startDrag(event: PointerEvent, row: string, col: string) {
    if (event.button !== 0) return
    pointer = event.pointerId
    select(row, col, event.shiftKey)
  }
  function extendDrag(event: PointerEvent, row: string, col: string) {
    if (pointer === event.pointerId && event.buttons === 1) select(row, col, true)
    else pointer = undefined
  }
  function startFill(event: DragEvent) {
    const b = bounds.value
    if (!b || !event.dataTransfer) return
    const row = options.rows()[b.top]!.row
    fillSource.value = { row: b.top, left: b.left, right: b.right,
      values: options.columns().slice(b.left, b.right + 1).map(col => text(row, col)) }
    event.dataTransfer.effectAllowed = 'copy'
    event.dataTransfer.setData('text/plain', '')
    pointer = undefined
  }
  function dropFill(event: DragEvent, last: number) {
    const source = fillSource.value
    if (!source) return
    event.preventDefault()
    event.stopPropagation()
    fillSource.value = undefined
    if (last <= source.row) return
    const values = Array.from({ length: last - source.row }, () => source.values)
    propose(values, { row: source.row + 1, column: source.left }, 'fill')
  }
  function finishPointer() { pointer = undefined }
  function endFill() { fillSource.value = undefined }
  function keys(event: KeyboardEvent, rowId: string, colId: string) {
    const b = bounds.value
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd' && b) {
      event.preventDefault()
      const first = options.rows()[b.top]!.row
      const values = options.columns().slice(b.left, b.right + 1).map(col => text(first, col))
      propose(Array.from({ length: b.bottom - b.top }, () => values), { row: b.top + 1, column: b.left }, 'fill')
      return
    }
    const steps: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }
    const step = steps[event.key]
    if (!step || event.ctrlKey || event.metaKey || event.altKey) return
    event.preventDefault()
    event.stopPropagation()
    const at = index({ row: rowId, column: colId })!
    const y = Math.max(0, Math.min(options.rows().length - 1, at.row + step[0]))
    const x = Math.max(0, Math.min(options.columns().length - 1, at.column + step[1]))
    const row = options.rows()[y]!.row.id, column = options.columns()[x]!.id
    select(row, column, event.shiftKey)
    options.focus(y, JSON.stringify([row, column]))
  }
  return { end, editing, bounds, fillSource, reset, refresh, select, selected, copy, paste, keys, startDrag, extendDrag, finishPointer, startFill, dropFill, endFill }
}
