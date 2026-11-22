import { createTimelineRowTree, summarizeTimelineRows, timelineLabelColumnId, validateTimelineData } from './timeline.js'
import { timelineWbsCodes } from './rowHierarchy.js'
import type { TimeRange } from './timeline.js'
import type { TimelineBar, TimelineColumn, TimelineDependency, TimelineRow } from './types.js'

export interface TimelineViewColumn {
  id: string
  visible: boolean
  /** Overrides `TimelineColumn.width` when set. */
  width?: number
}

export interface TimelineViewSearch {
  text: string
  /** Columns whose text is searched. Omit to search every column; with no columns, row labels and details. */
  columnIds?: string[]
}

export interface TimelineViewSort {
  /** ID of a registered compare rule, or a column ID to compare by that column's value. */
  ruleId: string
  direction: 'asc' | 'desc'
}

/**
 * A column filter of a view. A row matches when it meets every condition given; rows that match every filter (and the
 * search) stay with their ancestors.
 */
export interface TimelineViewFilter {
  /** A column ID, or `timelineLabelColumnId` for the row label. */
  columnId: string
  /** Text that the column's displayed value must contain, ignoring case. Empty or omitted: no text condition. */
  text?: string
  /**
   * Values to keep, compared with the column's raw `field.get` value (else its displayed value; the row label for
   * `timelineLabelColumnId`). A multiple selection matches when one of its entries does. Omitted: no value condition;
   * an empty list matches no row.
   */
  values?: (string | number)[]
}

/** Declarative, JSON-safe view state. It holds no functions, DOM state, hover state or edit drafts. */
export interface TimelineViewState {
  version: 1
  /** Column order and visibility. */
  columns: TimelineViewColumn[]
  search: TimelineViewSearch
  sort: TimelineViewSort[]
  /** Column filters, combined with the search and with each other. Optional, so states saved without filters still parse. */
  filters?: TimelineViewFilter[]
  /** Collapsed row IDs. The projection passes them through; the chart applies them. */
  collapsedIds: string[]
  /** Visible time window. */
  window?: TimeRange
  /** ID of an application-defined zoom preset. */
  zoom?: string
}

export type TimelineViewDiagnosticCode =
  | 'unknown-column' // a saved column ID no longer exists; it is dropped
  | 'new-column' // a column absent from the saved state; it is appended
  | 'duplicate-column'
  | 'invalid-width'
  | 'unknown-sort-rule' // a sort rule or column ID that cannot be resolved; it is ignored
  | 'unknown-row' // a collapsed ID that is not a row; it is dropped

export interface TimelineViewDiagnostic {
  code: TimelineViewDiagnosticCode
  id: string
  message: string
}

/** Compare two rows for one sort rule. Negative: `a` first. Ties keep the original order. */
export type TimelineRowCompare<R extends TimelineRow = TimelineRow> = (a: R, b: R) => number

export interface TimelineViewInput<R extends TimelineRow = TimelineRow, B extends TimelineBar = TimelineBar, D extends TimelineDependency = TimelineDependency> {
  rows: readonly R[]
  bars: readonly B[]
  dependencies?: readonly D[]
  /** Needed to resolve column IDs in the state. */
  columns?: readonly TimelineColumn<R>[]
  /** Registered compare rules by ID. */
  sortRules?: Readonly<Record<string, TimelineRowCompare<R>>>
  /** Same meaning as the `laneCount` prop. Default: the lanes the bars use. */
  laneCount?: number
}

export interface TimelineHiddenTarget {
  barId: string
  rowId: string
  /** Removed dependencies that connected this hidden bar to a visible one. */
  dependencyIds: string[]
  /** The visible bars on the other end of those dependencies. */
  visibleBarIds: string[]
}

export interface TimelineViewProjection<R extends TimelineRow = TimelineRow, B extends TimelineBar = TimelineBar, D extends TimelineDependency = TimelineDependency> {
  rows: R[]
  bars: B[]
  dependencies: D[]
  /**
   * IDs of the rows that matched the search and the filters (without the ancestors that were kept for them). Empty
   * without a search or filter.
   */
  matchedRowIds: string[]
  /** Dependencies dropped because an endpoint bar is not shown. */
  removedDependencyIds: string[]
  removedDependencyCount: number
  /** Hidden bars a visible bar still depends on or feeds, for "show hidden" navigation. */
  hiddenTargets: TimelineHiddenTarget[]
  /** WBS codes computed from the original row array, never from the display order. */
  wbs: Map<string, string>
  collapsedIds: string[]
  window?: TimeRange
  zoom?: string
  diagnostics: TimelineViewDiagnostic[]
}

/** A view that shows every column in declared order with no search, sort or collapsed rows. */
export function createTimelineViewState(columns: readonly Pick<TimelineColumn, 'id'>[] = [], patch: Partial<Omit<TimelineViewState, 'version'>> = {}): TimelineViewState {
  return {
    version: 1,
    columns: columns.map(column => ({ id: column.id, visible: true })),
    search: { text: '' },
    sort: [],
    collapsedIds: [],
    ...patch,
  }
}

function checkWindow(window: TimeRange | undefined) {
  if (window && (!Number.isFinite(window.start) || !Number.isFinite(window.end) || window.end <= window.start)) {
    throw new RangeError('The view window must have finite, increasing endpoints')
  }
}

/** Validate untrusted JSON (for example a stored view) and return a plain, normalised state. Throws on a bad shape. */
export function parseTimelineViewState(value: unknown): TimelineViewState {
  const object = (input: unknown, what: string) => {
    if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new Error('Invalid timeline view: ' + what)
    return input as Record<string, unknown>
  }
  const list = (input: unknown, what: string) => {
    if (!Array.isArray(input)) throw new Error('Invalid timeline view: ' + what)
    return input as unknown[]
  }
  const text = (input: unknown, what: string) => {
    if (typeof input !== 'string') throw new Error('Invalid timeline view: ' + what)
    return input
  }
  const root = object(value, 'state')
  if (root.version !== 1) throw new Error('Unsupported timeline view version: ' + String(root.version))
  const columns = list(root.columns, 'columns').map((item): TimelineViewColumn => {
    const column = object(item, 'column')
    if (typeof column.visible !== 'boolean') throw new Error('Invalid timeline view: column visibility')
    const result: TimelineViewColumn = { id: text(column.id, 'column id'), visible: column.visible }
    if (column.width !== undefined) {
      if (typeof column.width !== 'number') throw new Error('Invalid timeline view: column width')
      result.width = column.width
    }
    return result
  })
  const search = object(root.search, 'search')
  const parsedSearch: TimelineViewSearch = { text: text(search.text, 'search text') }
  if (search.columnIds !== undefined) parsedSearch.columnIds = list(search.columnIds, 'search columns').map(id => text(id, 'search column'))
  const sort = list(root.sort, 'sort').map((item): TimelineViewSort => {
    const rule = object(item, 'sort rule')
    if (rule.direction !== 'asc' && rule.direction !== 'desc') throw new Error('Invalid timeline view: sort direction')
    return { ruleId: text(rule.ruleId, 'sort rule id'), direction: rule.direction }
  })
  const state: TimelineViewState = {
    version: 1, columns, search: parsedSearch, sort,
    collapsedIds: list(root.collapsedIds, 'collapsed IDs').map(id => text(id, 'collapsed ID')),
  }
  if (root.filters !== undefined) {
    state.filters = list(root.filters, 'filters').map((item): TimelineViewFilter => {
      const filter = object(item, 'filter')
      const result: TimelineViewFilter = { columnId: text(filter.columnId, 'filter column') }
      if (filter.text !== undefined) result.text = text(filter.text, 'filter text')
      if (filter.values !== undefined) {
        result.values = list(filter.values, 'filter values').map(entry => {
          if (typeof entry === 'string' || (typeof entry === 'number' && Number.isFinite(entry))) return entry
          throw new Error('Invalid timeline view: filter value')
        })
      }
      return result
    })
  }
  if (root.window !== undefined) {
    const window = object(root.window, 'window')
    if (typeof window.start !== 'number' || typeof window.end !== 'number') throw new Error('Invalid timeline view: window')
    state.window = { start: window.start, end: window.end }
    checkWindow(state.window)
  }
  if (root.zoom !== undefined) state.zoom = text(root.zoom, 'zoom')
  return state
}

/**
 * Reconcile a (possibly old) state with the current columns. Unknown column IDs are dropped and reported;
 * columns the state has not seen are appended after the known ones, visible, in their declared order.
 * Bad widths are dropped and reported. Does not change `state`.
 */
export function reconcileTimelineViewColumns(
  state: TimelineViewState, columns: readonly Pick<TimelineColumn, 'id'>[],
): { columns: TimelineViewColumn[]; diagnostics: TimelineViewDiagnostic[] } {
  const known = new Set(columns.map(column => column.id))
  const seen = new Set<string>()
  const diagnostics: TimelineViewDiagnostic[] = []
  const result: TimelineViewColumn[] = []
  for (const entry of state.columns) {
    if (!known.has(entry.id)) {
      diagnostics.push({ code: 'unknown-column', id: entry.id, message: 'Unknown column in the saved view: ' + entry.id })
      continue
    }
    if (seen.has(entry.id)) {
      diagnostics.push({ code: 'duplicate-column', id: entry.id, message: 'Duplicate column in the saved view: ' + entry.id })
      continue
    }
    seen.add(entry.id)
    const next: TimelineViewColumn = { id: entry.id, visible: entry.visible }
    if (entry.width !== undefined) {
      if (Number.isFinite(entry.width) && entry.width > 0) next.width = entry.width
      else diagnostics.push({ code: 'invalid-width', id: entry.id, message: 'Invalid column width in the saved view: ' + entry.id })
    }
    result.push(next)
  }
  for (const column of columns) {
    if (seen.has(column.id)) continue
    seen.add(column.id)
    result.push({ id: column.id, visible: true })
    diagnostics.push({ code: 'new-column', id: column.id, message: 'Column added after the view was saved: ' + column.id })
  }
  return { columns: result, diagnostics }
}

/** The columns to render: ordered, hidden ones removed, saved widths applied. Returns new column objects. */
export function resolveTimelineColumns<C extends Pick<TimelineColumn, 'id' | 'width'>>(
  state: TimelineViewState, columns: readonly C[],
): { columns: C[]; diagnostics: TimelineViewDiagnostic[] } {
  const reconciled = reconcileTimelineViewColumns(state, columns)
  const byId = new Map(columns.map(column => [column.id, column]))
  const resolved = reconciled.columns.filter(entry => entry.visible)
    .map(entry => ({ ...byId.get(entry.id)!, width: entry.width ?? byId.get(entry.id)!.width }))
  return { columns: resolved, diagnostics: reconciled.diagnostics }
}

/**
 * The rows that match `predicate`, each with its ancestors so that summary rows stay as context, in their original
 * order. Throws like `createTimelineRowTree` for duplicate IDs, unknown parents and cycles. Does not change `rows`.
 */
export function filterTimelineRows<R extends TimelineRow>(rows: readonly R[], predicate: (row: R) => boolean): R[] {
  createTimelineRowTree(rows)
  const byId = new Map(rows.map(row => [row.id, row]))
  const keep = new Set<string>()
  for (const row of rows) {
    if (!predicate(row)) continue
    for (let id: string | undefined = row.id; id !== undefined && !keep.has(id); id = byId.get(id)!.parentId) keep.add(id)
  }
  return rows.filter(row => keep.has(row.id))
}

/**
 * The sort after activating a column's sort control. Only that column's rule changes; the other rules keep their
 * directions and order. A column without a rule becomes the primary (first) rule, ascending; an ascending rule turns
 * descending where it is; a descending rule is removed. Returns new objects and never changes `sort`.
 */
export function nextTimelineSort(sort: readonly TimelineViewSort[], columnId: string): TimelineViewSort[] {
  const next = sort.map(rule => ({ ...rule }))
  const index = next.findIndex(rule => rule.ruleId === columnId)
  if (index < 0) return [{ ruleId: columnId, direction: 'asc' }, ...next]
  if (next[index]!.direction === 'asc') next[index]!.direction = 'desc'
  else next.splice(index, 1)
  return next
}

/**
 * Whether a row meets one column filter. `column` is undefined for `timelineLabelColumnId`, which reads the row label.
 * `summary` is passed to `column.value`.
 */
function matchesFilter<R extends TimelineRow>(
  filter: TimelineViewFilter, row: R, column: TimelineColumn<R> | undefined, summary: Parameters<TimelineColumn<R>['value']>[1],
) {
  const shown = column ? column.value(row, summary) : row.label
  const query = filter.text?.trim().toLowerCase()
  if (query && !String(shown).toLowerCase().includes(query)) return false
  if (!filter.values) return true
  const raw = column?.field ? column.field.get(row) : shown
  const entries = Array.isArray(raw) ? raw : [raw]
  return entries.some(entry => (typeof entry === 'string' || typeof entry === 'number') && filter.values!.includes(entry))
}

function compareValues(a: string | number, b: string | number) {
  if (typeof a === 'number' && typeof b === 'number') return a < b ? -1 : a > b ? 1 : 0
  const left = String(a)
  const right = String(b)
  return left < right ? -1 : left > right ? 1 : 0
}

/**
 * Project the data for display. Rows that match the search and every column filter stay with their ancestors (a
 * filter or sort on `timelineLabelColumnId` reads the row label), siblings are sorted
 * stably, and dependencies to hidden bars are removed and reported. The result passes
 * `validateTimelineData`. Inputs are not changed, and WBS codes come from the original rows.
 */
export function projectTimelineView<R extends TimelineRow, B extends TimelineBar, D extends TimelineDependency = TimelineDependency>(
  input: TimelineViewInput<R, B, D>, state: TimelineViewState,
): TimelineViewProjection<R, B, D> {
  const { rows, bars } = input
  const dependencies: readonly D[] = input.dependencies ?? []
  const columns = input.columns ?? []
  checkWindow(state.window)
  // A loop, not `Math.max(...lanes)`: spreading every bar into one call exceeds the argument limit of large timelines.
  let laneCount = input.laneCount ?? 1
  if (input.laneCount === undefined) for (const bar of bars) laneCount = Math.max(laneCount, (bar.lane ?? 0) + 1)
  validateTimelineData(rows, bars, dependencies, laneCount)
  const tree = createTimelineRowTree(rows)
  const wbs = timelineWbsCodes(rows)
  const diagnostics: TimelineViewDiagnostic[] = reconcileTimelineViewColumns(state, columns).diagnostics
  const rowIds = new Set(rows.map(row => row.id))
  for (const id of state.collapsedIds) {
    if (!rowIds.has(id)) diagnostics.push({ code: 'unknown-row', id, message: 'Unknown collapsed row in the saved view: ' + id })
  }
  const collapsedIds = state.collapsedIds.filter(id => rowIds.has(id))

  // Search and filters: matching rows plus the ancestors they need.
  const query = state.search.text.trim().toLowerCase()
  const known = new Set(columns.map(column => column.id))
  const columnById = new Map(columns.map(column => [column.id, column]))
  const filters: { filter: TimelineViewFilter; column?: TimelineColumn<R> }[] = []
  for (const filter of state.filters ?? []) {
    if (filter.columnId === timelineLabelColumnId && !known.has(filter.columnId)) filters.push({ filter })
    else if (known.has(filter.columnId)) filters.push({ filter, column: columnById.get(filter.columnId)! })
    else diagnostics.push({ code: 'unknown-column', id: filter.columnId, message: 'Unknown filter column in the saved view: ' + filter.columnId })
  }
  let kept: ReadonlySet<string> = rowIds
  const matched: string[] = []
  if (query || filters.length) {
    const summaries = summarizeTimelineRows(tree, bars)
    for (const id of query ? state.search.columnIds ?? [] : []) {
      if (!known.has(id)) diagnostics.push({ code: 'unknown-column', id, message: 'Unknown search column in the saved view: ' + id })
    }
    const searched = state.search.columnIds ? columns.filter(column => state.search.columnIds!.includes(column.id)) : columns
    const barLabels = new Map<string, string[]>()
    for (const bar of bars) {
      const labels = barLabels.get(bar.rowId)
      if (labels) labels.push(bar.label)
      else barLabels.set(bar.rowId, [bar.label])
    }
    const matches = (row: R) => {
      const summary = summaries.get(row.id)
      if (query) {
        const texts = searched.map(column => String(column.value(row, summary)))
        if (!state.search.columnIds) texts.push(row.label, row.detail ?? '', ...(barLabels.get(row.id) ?? []))
        if (!texts.some(text => text.toLowerCase().includes(query))) return false
      }
      if (!filters.every(({ filter, column }) => matchesFilter(filter, row, column, summary))) return false
      matched.push(row.id)
      return true
    }
    kept = new Set(filterTimelineRows(rows, matches).map(row => row.id))
  }

  let shownRows = rows.filter(row => kept.has(row.id))

  // Sort siblings stably; ties keep the original order.
  const rules: { compare: TimelineRowCompare<R>; sign: number }[] = []
  for (const sort of state.sort) {
    const registered = input.sortRules?.[sort.ruleId]
    const column = columnById.get(sort.ruleId)
    const compare: TimelineRowCompare<R> | undefined = registered
      ?? (column ? (a, b) => compareValues(column.value(a), column.value(b)) : undefined)
      ?? (sort.ruleId === timelineLabelColumnId ? (a, b) => compareValues(a.label, b.label) : undefined)
    if (!compare) {
      diagnostics.push({ code: 'unknown-sort-rule', id: sort.ruleId, message: 'Unknown sort rule in the saved view: ' + sort.ruleId })
      continue
    }
    rules.push({ compare, sign: sort.direction === 'desc' ? -1 : 1 })
  }
  if (rules.length) {
    const index = new Map(rows.map((row, i) => [row.id, i]))
    const children = new Map<string | undefined, R[]>()
    for (const row of shownRows) {
      const group = children.get(row.parentId)
      if (group) group.push(row)
      else children.set(row.parentId, [row])
    }
    for (const group of children.values()) {
      group.sort((a, b) => {
        for (const { compare, sign } of rules) {
          const result = compare(a, b) * sign
          if (result) return result
        }
        return index.get(a.id)! - index.get(b.id)!
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
    shownRows = ordered
  }

  // Bars and dependencies.
  const shownBars = bars.filter(bar => kept.has(bar.rowId))
  const barRow = new Map(bars.map(bar => [bar.id, bar.rowId]))
  const shownBarIds = new Set(shownBars.map(bar => bar.id))
  const shownDependencies: D[] = []
  const removedDependencyIds: string[] = []
  const targets = new Map<string, TimelineHiddenTarget>()
  for (const dependency of dependencies) {
    const fromShown = shownBarIds.has(dependency.from)
    const toShown = shownBarIds.has(dependency.to)
    if (fromShown && toShown) {
      shownDependencies.push(dependency)
      continue
    }
    removedDependencyIds.push(dependency.id)
    if (fromShown === toShown) continue
    const hidden = fromShown ? dependency.to : dependency.from
    const visible = fromShown ? dependency.from : dependency.to
    let target = targets.get(hidden)
    if (!target) targets.set(hidden, target = { barId: hidden, rowId: barRow.get(hidden)!, dependencyIds: [], visibleBarIds: [] })
    target.dependencyIds.push(dependency.id)
    if (!target.visibleBarIds.includes(visible)) target.visibleBarIds.push(visible)
  }

  validateTimelineData(shownRows, shownBars, shownDependencies, laneCount)
  return {
    rows: shownRows, bars: shownBars, dependencies: shownDependencies,
    matchedRowIds: matched,
    removedDependencyIds, removedDependencyCount: removedDependencyIds.length,
    hiddenTargets: [...targets.values()],
    wbs, collapsedIds,
    ...(state.window ? { window: { ...state.window } } : {}),
    ...(state.zoom !== undefined ? { zoom: state.zoom } : {}),
    diagnostics,
  }
}
