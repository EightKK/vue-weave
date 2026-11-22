// Header sorting and filtering of GanttChart (`sortableColumns`, `filterableColumns`): which columns get controls, how
// a filter edit turns into the next controlled `filters` list, and the header controls with their filter dialog
// (`useHeaderFilters`). The chart only proposes; the parent applies.
import { nextTick, onBeforeUnmount, ref, watch, type Ref } from 'vue'
import type { GanttLabels, TimelineColumn, TimelineRow } from '../../core/types.js'
import { timelineLabelColumnId } from '../../core/timeline.js'
import { nextTimelineSort, type TimelineViewFilter, type TimelineViewSort } from '../../core/timelineView.js'
import { elementWithData } from '../shared/focus.js'

/** The column IDs an opt-in header option names: `true` is the row label column and every extra column. */
export function headerColumnIds(option: boolean | readonly string[] | undefined, columns: readonly { id: string }[]): ReadonlySet<string> {
  if (!option) return new Set()
  return new Set(option === true ? [timelineLabelColumnId, ...columns.map(column => column.id)] : option)
}

/** `previous` when `next` is a list with the same IDs in the same order, otherwise `next`. */
export function sameOption(
  previous: boolean | readonly string[] | undefined, next: boolean | readonly string[] | undefined,
): boolean | readonly string[] | undefined {
  return Array.isArray(previous) && Array.isArray(next) && previous.length === next.length
    && previous.every((id, index) => id === next[index]) ? previous : next
}

/** Whether a filter has any condition: non-blank text or a value list. */
export function filterActive(filter: TimelineViewFilter | undefined): boolean {
  return Boolean(filter && (filter.text?.trim() || filter.values))
}

/**
 * The filters after changing one column's conditions. A filter left without conditions (blank or whitespace-only text
 * and no value list) is removed; a changed one keeps its place. Returns new objects and never changes `filters`.
 */
export function withColumnFilter(
  filters: readonly TimelineViewFilter[], columnId: string, patch: { text?: string; values?: (string | number)[] | null },
): TimelineViewFilter[] {
  const current = filters.find(filter => filter.columnId === columnId)
  const text = 'text' in patch ? patch.text : current?.text
  const values = 'values' in patch ? patch.values ?? undefined : current?.values
  const next: TimelineViewFilter = { columnId }
  if (text) next.text = text
  if (values) next.values = [...values]
  const keep = filterActive(next)
  const result: TimelineViewFilter[] = []
  let placed = false
  for (const filter of filters) {
    if (filter.columnId !== columnId) result.push({ ...filter, ...(filter.values ? { values: [...filter.values] } : {}) })
    else if (!placed) {
      placed = true
      if (keep) result.push(next)
    }
  }
  if (!placed && keep) result.push(next)
  return result
}

/** The sort and filter controls of one header cell; undefined for a column without either. */
export interface HeaderControls {
  id: string
  label: string
  sortable: boolean
  filterable: boolean
  direction?: TimelineViewSort['direction']
  filter?: TimelineViewFilter
  filtered: boolean
  attrs: Record<string, string>
  choices?: readonly { value: string | number; label?: string }[]
}

export interface HeaderFilterOptions {
  /** The chart root, which holds the header cells (`data-vw-header`). */
  root: Ref<HTMLElement | undefined>
  labels: () => GanttLabels
  sort: () => readonly TimelineViewSort[] | undefined
  filters: () => readonly TimelineViewFilter[] | undefined
  sortableIds: () => ReadonlySet<string>
  filterableIds: () => ReadonlySet<string>
  /** The validation error of the props; the dialog closes while the chart is invalid. */
  error: () => Error | undefined
  proposeSort: (sort: TimelineViewSort[]) => void
  proposeFilters: (filters: TimelineViewFilter[]) => void
}

/**
 * Header sorting and filtering (`sortableColumns`, `filterableColumns`). The header shows the controlled `sort` and
 * `filters` and proposes changes; the parent reorders or filters the rows (for example with `useTimelineView`), and the
 * new rows cancel an in-flight gesture like any other source change. The filter dialog of one column is open at a time;
 * it never renders on the server, and Escape or a press outside closes it.
 */
export function useHeaderFilters<R extends TimelineRow>(options: HeaderFilterOptions) {
  function headerControls(id: string, label: string, column?: TimelineColumn<R>): HeaderControls | undefined {
    const sortable = options.sortableIds().has(id), filterable = options.filterableIds().has(id)
    if (!sortable && !filterable) return undefined
    // Every rule of the sort shows its direction, not only the first one.
    const direction = options.sort()?.find(rule => rule.ruleId === id)?.direction
    const filter = options.filters()?.find(item => item.columnId === id)
    // The header is not a table row, so the sort state is part of the sort button's name instead of `aria-sort`.
    const attrs: Record<string, string> = { 'data-vw-header': id }
    const choices = column?.field?.kind === 'select' ? column.field.choices : undefined
    return { id, label, sortable, filterable, direction, filter, filtered: filterActive(filter), attrs, ...(choices ? { choices } : {}) }
  }
  function proposeFilter(id: string, patch: { text?: string; values?: (string | number)[] | null }) {
    options.proposeFilters(withColumnFilter(options.filters() ?? [], id, patch))
  }
  /**
   * Text typed into a filter box. Text being composed with an input method is proposed once, when the composition ends.
   * The box shows the applied filter: once the parent has handled the proposal, text it did not apply is replaced by
   * the applied text, as the value-list checkboxes are. Text that differs from it only in surrounding whitespace is
   * left as typed, since matching trims it anyway.
   */
  function filterText(controls: HeaderControls, event: Event) {
    if ((event as InputEvent).isComposing) return
    const input = event.target as HTMLInputElement
    const id = controls.id
    proposeFilter(id, { text: input.value })
    void nextTick(() => {
      const applied = options.filters()?.find(filter => filter.columnId === id)?.text ?? ''
      if (input.isConnected && input.value.trim() !== applied.trim()) input.value = applied
    })
  }
  function clearFilter(controls: HeaderControls) {
    proposeFilter(controls.id, { text: '', values: null })
    headerCellOf(controls.id)?.querySelector<HTMLInputElement>('.vw-column-filter-popover input[type="search"]')?.focus({ preventScroll: true })
  }
  const sortGlyph = (direction: TimelineViewSort['direction'] | undefined) => direction === 'asc' ? '▲' : direction === 'desc' ? '▼' : '↕'
  function toggleSort(id: string) {
    options.proposeSort(nextTimelineSort(options.sort() ?? [], id))
  }
  /** "Sort by Finish", with the applied direction in parentheses: "Sort by Finish (ascending)". */
  function sortButtonName(controls: HeaderControls) {
    const labels = options.labels()
    const name = `${labels.sortBy} ${controls.label}`
    const direction = controls.direction === 'asc' ? labels.sortedAscending : controls.direction === 'desc' ? labels.sortedDescending : undefined
    return direction ? `${name} (${direction})` : name
  }
  const filterName = (controls: HeaderControls) => `${options.labels().filterBy} ${controls.label}`
  const filterButtonName = (controls: HeaderControls) => filterName(controls) + (controls.filtered ? ` (${options.labels().filtered})` : '')
  /** Whether a value-list choice is shown: every choice is while the filter has no value list. */
  function choiceShown(controls: HeaderControls, value: string | number) {
    return !controls.filter?.values || controls.filter.values.includes(value)
  }
  function toggleChoice(controls: HeaderControls, value: string | number, event: Event) {
    const all = controls.choices!.map(choice => choice.value)
    const shown = all.filter(item => choiceShown(controls, item))
    const next = shown.includes(value) ? shown.filter(item => item !== value) : all.filter(item => item === value || shown.includes(item))
    proposeFilter(controls.id, { values: next.length === all.length ? null : next })
    // The box shows the applied filter: the parent's update checks it, and an ignored proposal leaves it as it was.
    ;(event.target as HTMLInputElement).checked = choiceShown(controls, value)
  }
  const openFilter = ref<string>()
  function headerCellOf(id: string) {
    return elementWithData(options.root.value, 'vwHeader', id)
  }
  function onOutsidePress(event: PointerEvent) {
    const id = openFilter.value
    if (id === undefined) return
    const cell = headerCellOf(id)
    if (!cell || !cell.contains(event.target as Node)) closeFilter(false)
  }
  function closeFilter(restoreFocus: boolean) {
    const id = openFilter.value
    if (id === undefined) return
    openFilter.value = undefined
    document.removeEventListener('pointerdown', onOutsidePress, true)
    if (restoreFocus) headerCellOf(id)?.querySelector<HTMLElement>('[data-vw-column-filter]')?.focus({ preventScroll: true })
  }
  function toggleFilter(id: string) {
    if (openFilter.value === id) return closeFilter(true)
    closeFilter(false)
    openFilter.value = id
    document.addEventListener('pointerdown', onOutsidePress, true)
    void nextTick(() => headerCellOf(id)?.querySelector<HTMLElement>('.vw-column-filter-popover input')?.focus({ preventScroll: true }))
  }
  function filterKeys(event: KeyboardEvent) {
    // Keys typed into the dialog are not chart shortcuts.
    event.stopPropagation()
    if (event.key === 'Escape' && !event.isComposing) {
      event.preventDefault()
      closeFilter(true)
    }
  }
  function filterFocusOut(event: FocusEvent, id: string) {
    const next = event.relatedTarget as Node | null
    if (next && openFilter.value === id && !headerCellOf(id)?.contains(next)) closeFilter(false)
  }
  /** The listeners of a header cell with controls: focus leaving the cell of an open filter dialog closes it. */
  function headerControlEvents(controls: HeaderControls): Record<string, (event: Event) => void> {
    return controls.filterable ? { focusout: event => filterFocusOut(event as FocusEvent, controls.id) } : {}
  }
  // A column that loses its filter control, or a chart that turns invalid, closes the dialog.
  watch([options.filterableIds, options.error], () => {
    if (openFilter.value !== undefined && (options.error() || !options.filterableIds().has(openFilter.value))) closeFilter(false)
  })
  onBeforeUnmount(() => document.removeEventListener('pointerdown', onOutsidePress, true))
  return {
    headerControls, headerControlEvents, openFilter, toggleFilter, closeFilter, filterKeys, filterText, clearFilter, choiceShown,
    toggleChoice, sortGlyph, toggleSort, sortButtonName, filterName, filterButtonName,
  }
}
