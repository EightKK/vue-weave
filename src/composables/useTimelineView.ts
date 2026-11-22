import { computed, shallowRef, toValue } from 'vue'
import type { MaybeRefOrGetter, ShallowRef } from 'vue'
import { createTimelineViewState, parseTimelineViewState, projectTimelineView, resolveTimelineColumns } from '../core/timelineView.js'
import type { TimelineViewFilter, TimelineViewInput, TimelineViewSort, TimelineViewState } from '../core/timelineView.js'
import type { TimeRange } from '../core/timeline.js'
import type { TimelineBar, TimelineDependency, TimelineRow } from '../core/types.js'

/**
 * Reactive search, sort, filter and column state for a Gantt chart. The source data is never changed: `projection`
 * is a display copy and `columns` the ordered visible columns. State updates are immutable and JSON-safe.
 */
export function useTimelineView<R extends TimelineRow = TimelineRow, B extends TimelineBar = TimelineBar, D extends TimelineDependency = TimelineDependency>(
  source: MaybeRefOrGetter<TimelineViewInput<R, B, D>>, initial?: TimelineViewState,
) {
  // Annotated with the one-argument ShallowRef so the declaration also type-checks with Vue 3.5.0.
  const state: ShallowRef<TimelineViewState> = shallowRef<TimelineViewState>(initial ?? createTimelineViewState(toValue(source).columns))
  const projection = computed(() => projectTimelineView(toValue(source), state.value))
  /** The visible columns in the saved order, with saved widths applied. Pass it to GanttChart's `columns`. */
  const columns = computed(() => resolveTimelineColumns(state.value, toValue(source).columns ?? []).columns)
  /** Saved-view problems (unknown or new columns, rows, sort rules); column problems included. */
  const diagnostics = computed(() => projection.value.diagnostics)
  const update = (patch: Partial<TimelineViewState>) => { state.value = { ...state.value, ...patch } }

  /** Column entries including columns added since the state was saved, so edits address real entries. */
  function currentColumns() {
    const known = new Set(state.value.columns.map(column => column.id))
    const added = (toValue(source).columns ?? []).filter(column => !known.has(column.id))
    return [...state.value.columns.map(column => ({ ...column })), ...added.map(column => ({ id: column.id, visible: true }))]
  }
  function setSearch(text: string, columnIds?: string[]) {
    update({ search: columnIds ? { text, columnIds: [...columnIds] } : { text } })
  }
  function setSort(sort: readonly TimelineViewSort[]) {
    update({ sort: sort.map(rule => ({ ...rule })) })
  }
  /** Replace the column filters; an empty list removes them. Pass GanttChart's `update:filters` here. */
  function setFilters(filters: readonly TimelineViewFilter[]) {
    const { filters: _filters, ...rest } = state.value
    state.value = filters.length
      ? { ...rest, filters: filters.map(filter => ({ ...filter, ...(filter.values ? { values: [...filter.values] } : {}) })) }
      : rest
  }
  function setColumnVisible(id: string, visible: boolean) {
    update({ columns: currentColumns().map(column => (column.id === id ? { ...column, visible } : column)) })
  }
  function setColumnWidth(id: string, width: number) {
    if (!Number.isFinite(width) || width <= 0) throw new RangeError('A column width must be finite and positive')
    update({ columns: currentColumns().map(column => (column.id === id ? { ...column, width } : column)) })
  }
  /** Move a column to `index` in the full column order (hidden columns included). */
  function moveColumn(id: string, index: number) {
    const list = currentColumns()
    const from = list.findIndex(column => column.id === id)
    if (from < 0) throw new Error('Unknown column: ' + id)
    if (!Number.isInteger(index) || index < 0 || index >= list.length) throw new RangeError('Invalid column index')
    const [column] = list.splice(from, 1)
    list.splice(index, 0, column!)
    update({ columns: list })
  }
  function toggleCollapsed(id: string, collapsed?: boolean) {
    const has = state.value.collapsedIds.includes(id)
    const next = collapsed ?? !has
    if (next === has) return
    update({ collapsedIds: next ? [...state.value.collapsedIds, id] : state.value.collapsedIds.filter(item => item !== id) })
  }
  function setWindow(window: TimeRange | undefined, zoom?: string) {
    const { window: _window, zoom: _zoom, ...rest } = state.value
    state.value = { ...rest, ...(window ? { window: { ...window } } : {}), ...(zoom !== undefined ? { zoom } : {}) }
  }
  /** Replace the state from stored JSON. Throws on a malformed value and keeps the current state. */
  function restore(json: unknown) {
    state.value = parseTimelineViewState(json)
  }
  function reset() {
    state.value = createTimelineViewState(toValue(source).columns)
  }
  /** A JSON-safe copy of the state. */
  function snapshot(): TimelineViewState {
    return parseTimelineViewState(JSON.parse(JSON.stringify(state.value)))
  }
  return {
    state, projection, columns, diagnostics,
    setSearch, setSort, setFilters, setColumnVisible, setColumnWidth, moveColumn, toggleCollapsed, setWindow, restore, reset, snapshot,
  }
}
