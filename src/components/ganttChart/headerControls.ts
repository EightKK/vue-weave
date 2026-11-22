// Header sorting and filtering of GanttChart (`sortableColumns`, `filterableColumns`): which columns get controls and
// how a filter edit turns into the next controlled `filters` list. The chart only proposes; the parent applies.
import { timelineLabelColumnId } from '../../core/timeline.js'
import type { TimelineViewFilter } from '../../core/timelineView.js'

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
