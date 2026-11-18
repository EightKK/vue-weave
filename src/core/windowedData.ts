import type { TimeRange } from './timeline.js'

/**
 * Request state for partial (windowed) data loading. The time axis is cut into chunks of `chunkSize` time units
 * starting at `origin`, and each chunk of each row (or each chunk alone, without rows) is a cell with its own status.
 * The application describes what it shows (`WindowedView`), the state plans requests for the cells that are missing,
 * and the application fetches them and reports each result or failure back. Everything here is pure: no timers, no
 * DOM, no Vue. Transitions return a new state together with the requests to start and the request IDs to abort.
 */

/**
 * Status of one cell (a chunk of one row) or, aggregated, of a window:
 * - `unloaded`: never requested, or its request was aborted, or the data was invalidated.
 * - `loading`: a request for it is in flight.
 * - `loaded-empty`: its request succeeded and returned nothing for it.
 * - `loaded`: its request succeeded and returned at least one item for it.
 * - `failed`: its request failed; it stays failed until `retryWindowedData`.
 */
export type WindowedCellStatus = 'unloaded' | 'loading' | 'loaded-empty' | 'loaded' | 'failed'

/**
 * What a view shows: a half-open time window `[start, end)` and, optionally, the IDs of the rows it shows. GanttChart's
 * `visible-window-change` payload (`TimelineVisibleWindow`) is a `WindowedView`. Without `rowIds`, cells are whole
 * chunks (use one mode consistently: cells with and without rows are kept apart).
 */
export interface WindowedView {
  start: number
  end: number
  rowIds?: readonly string[]
}

/** The visible window of a GanttChart, reported by its `visible-window-change` event. */
export interface TimelineVisibleWindow extends WindowedView {
  /** Start of the rendered time window, in the chart's time units. Inside the chart's `range`. */
  start: number
  /** End (exclusive) of the rendered time window. Inside the chart's `range`; never smaller than `start`. */
  end: number
  /** IDs of the rendered rows, top to bottom: the displayed rows (after collapsing) in the scrolled row window plus overscan. */
  rowIds: string[]
  /** IDs of every displayed row that has child rows and is expanded, in display order. */
  expandedIds: string[]
}

export interface WindowedDataOptions<T, L = never> {
  /** Length of one chunk in time units; requests and cells are aligned to chunks. A positive finite number. Required. */
  chunkSize: number
  /** Time at which chunk 0 starts. Default 0. Chunk `k` is `[origin + k * chunkSize, origin + (k + 1) * chunkSize)`. */
  origin?: number
  /** Time units added before and after the view before it is aligned to chunks, so small scrolls do not refetch. Default 0. */
  padding?: number
  /** Most chunks one request may span. Default Infinity (adjacent chunks with the same missing rows share one request). */
  maxChunksPerRequest?: number
  /** Most cells one view may need; a larger view throws RangeError. Default 100000. */
  maxCells?: number
  /** ID of an item. Default `item.id`. */
  itemId?: (item: T) => string
  /** Row of an item, used to tell `loaded` from `loaded-empty` per row. Default `item.rowId`; undefined counts for every requested row. */
  itemRow?: (item: T) => string | undefined
  /** Half-open interval of an item, used to tell `loaded` from `loaded-empty` per chunk. Default `item.start` and `item.end`; undefined counts for every requested chunk. */
  itemRange?: (item: T) => TimeRange | undefined
  /** ID of a link (`WindowedDataPage.links`). Default `link.id`. */
  linkId?: (link: L) => string
}

/** One request the application must fetch. Compare responses by `requestId`; `key` names the data it asks for. */
export interface WindowedDataRequest {
  /** Unique within one state; a new request for the same data gets a new ID. */
  requestId: string
  /** Condition, time span and rows of the request, as text. Equal keys ask for the same data. */
  key: string
  /** The caller's condition or version token the request belongs to (`setWindowedView`). */
  condition: string
  /** Start of the requested span, aligned to a chunk. */
  start: number
  /** End (exclusive) of the requested span, aligned to a chunk. Return the items that overlap `[start, end)`. */
  end: number
  /** The rows to return items for, in view order. Omitted when the view has no `rowIds`. */
  rowIds?: string[]
}

/** A response. The load function may also return the items array alone. */
export interface WindowedDataPage<T, L = never> {
  items: readonly T[]
  /** Links between items (dependencies or edges). Deduplicated by ID like items; see `splitDanglingLinks`. */
  links?: readonly L[]
}

export interface WindowedCell {
  status: WindowedCellStatus
  /** The request in flight for the cell while `loading`. */
  requestId?: string
  /** The failure while `failed`. */
  error?: unknown
}

/** Options of a state with their defaults applied. */
export interface WindowedDataNormalizedOptions<T, L = never> {
  chunkSize: number
  origin: number
  padding: number
  maxChunksPerRequest: number
  maxCells: number
  itemId: (item: T) => string
  itemRow: (item: T) => string | undefined
  itemRange: (item: T) => TimeRange | undefined
  linkId: (link: L) => string
}

/** A request in flight with the chunks and cells it covers. */
export interface WindowedInFlightRequest extends WindowedDataRequest {
  /** First and last chunk index of the request. */
  first: number
  last: number
  cells: readonly string[]
}

export interface WindowedDataState<T, L = never> {
  readonly options: Readonly<WindowedDataNormalizedOptions<T, L>>
  /** The condition or version token of the current data. */
  readonly condition: string
  /** The current view, normalized; undefined before the first `setWindowedView`. */
  readonly view?: Readonly<{ start: number; end: number; rowIds?: readonly string[] }>
  /** Cells that are not `unloaded`, by cell key. */
  readonly cells: ReadonlyMap<string, Readonly<WindowedCell>>
  /** Requests in flight, by request ID. */
  readonly requests: ReadonlyMap<string, Readonly<WindowedDataRequest>>
  /** Every loaded item of the current condition, deduplicated by ID (the latest response wins), in first-arrival order. */
  readonly items: ReadonlyMap<string, T>
  /** Every loaded link of the current condition, deduplicated by ID. */
  readonly links: ReadonlyMap<string, L>
  /** Requests issued so far; the next request ID is `String(sequence + 1)`. */
  readonly sequence: number
  /** @internal In-flight bookkeeping. */
  readonly inflight: ReadonlyMap<string, WindowedInFlightRequest>
}

export interface WindowedDataTransition<T, L = never> {
  state: WindowedDataState<T, L>
  /** Requests to start now, in time order. */
  start: WindowedDataRequest[]
  /** IDs of requests in flight that are no longer wanted: abort them; their results are ignored. */
  abort: string[]
}

export interface WindowedDataSettlement<T, L = never> {
  state: WindowedDataState<T, L>
  /** False when the request is unknown, aborted or superseded: the result was ignored and `state` is unchanged. */
  applied: boolean
}

/** Status counts of the cells of a window. */
export interface WindowedCoverage {
  /** Aggregate: `failed` if any cell failed, else `loading`, else `unloaded`, else `loaded` if any cell has items, else `loaded-empty`. */
  status: WindowedCellStatus
  /**
   * True only when every cell of the window has loaded (with or without items). Partial data can not answer questions
   * about the whole plan: check the coverage of the whole extent, or compute on the server.
   */
  complete: boolean
  total: number
  unloaded: number
  loading: number
  empty: number
  loaded: number
  failed: number
}

type Grid = { chunkSize: number; origin: number }

const defaultItemId = (item: unknown) => (item as { id: string }).id
const defaultItemRow = (item: unknown) => {
  const row = (item as { rowId?: unknown }).rowId
  return typeof row === 'string' ? row : undefined
}
const defaultItemRange = (item: unknown): TimeRange | undefined => {
  const { start, end } = item as { start?: unknown; end?: unknown }
  return typeof start === 'number' && typeof end === 'number' ? { start, end } : undefined
}

function finite(value: number, name: string) {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new RangeError(name + ' must be a finite number')
  return value
}

/** A fresh state without cells, requests or data. Throws RangeError for invalid options. */
export function createWindowedDataState<T, L = never>(options: WindowedDataOptions<T, L>, condition = ''): WindowedDataState<T, L> {
  const chunkSize = finite(options.chunkSize, 'chunkSize')
  if (chunkSize <= 0) throw new RangeError('chunkSize must be positive')
  const padding = finite(options.padding ?? 0, 'padding')
  if (padding < 0) throw new RangeError('padding must not be negative')
  const maxChunksPerRequest = options.maxChunksPerRequest ?? Infinity
  if (!(maxChunksPerRequest >= 1) || (maxChunksPerRequest !== Infinity && !Number.isInteger(maxChunksPerRequest))) {
    throw new RangeError('maxChunksPerRequest must be a positive integer or Infinity')
  }
  const maxCells = options.maxCells ?? 100_000
  if (!Number.isInteger(maxCells) || maxCells < 1) throw new RangeError('maxCells must be a positive integer')
  if (typeof condition !== 'string') throw new TypeError('condition must be a string')
  return {
    options: {
      chunkSize, origin: finite(options.origin ?? 0, 'origin'), padding, maxChunksPerRequest, maxCells,
      itemId: options.itemId ?? defaultItemId, itemRow: options.itemRow ?? defaultItemRow,
      itemRange: options.itemRange ?? defaultItemRange, linkId: options.linkId ?? (defaultItemId as (link: L) => string),
    },
    condition, cells: new Map(), requests: new Map(), inflight: new Map(), items: new Map(), links: new Map(), sequence: 0,
  }
}

const cellKey = (chunk: number, row: string | undefined) => row === undefined ? String(chunk) : chunk + '\u0000' + row

/** Chunk indices `[first, last]` covering the half-open window, extended by `padding`. A zero-width window covers its chunk. */
function chunkSpan(options: Grid, start: number, end: number, padding: number) {
  const { chunkSize, origin } = options
  const from = start - padding
  const to = end + padding
  const first = Math.floor((from - origin) / chunkSize)
  const last = to > from ? Math.ceil((to - origin) / chunkSize) - 1 : first
  return { first, last: Math.max(first, last) }
}

function normalizeView(view: WindowedView) {
  if (!view || typeof view !== 'object') throw new TypeError('A windowed view must be an object')
  const start = finite(view.start, 'View start')
  const end = finite(view.end, 'View end')
  if (end < start) throw new RangeError('View end must not be before its start')
  if (view.rowIds === undefined) return { start, end }
  const seen = new Set<string>()
  const rowIds: string[] = []
  for (const id of view.rowIds) {
    if (typeof id !== 'string') throw new TypeError('View row IDs must be strings')
    if (seen.has(id)) continue
    seen.add(id)
    rowIds.push(id)
  }
  return { start, end, rowIds }
}

/** The cell keys a window covers, in chunk then row order. */
function windowCells(options: Grid, view: { start: number; end: number; rowIds?: readonly string[] }, padding: number) {
  const { first, last } = chunkSpan(options, view.start, view.end, padding)
  const rows = view.rowIds
  const count = (last - first + 1) * (rows ? rows.length : 1)
  return { first, last, rows, count }
}

/**
 * Sets the view (and optionally the condition) and plans requests for its missing cells. Requests in flight whose cells
 * are all outside the new view are aborted, and their cells become `unloaded` again; a request that still covers some
 * needed cell keeps running. A different `condition` (a filter, a query, a data version) aborts everything and drops all
 * cells, items and links, so results for another condition are never attached. `view` undefined keeps the cells and data
 * but aborts every request. Throws RangeError for a non-finite view, `end < start` or more than `maxCells` cells.
 */
export function setWindowedView<T, L = never>(
  state: WindowedDataState<T, L>, view: WindowedView | undefined, condition: string = state.condition,
): WindowedDataTransition<T, L> {
  if (typeof condition !== 'string') throw new TypeError('condition must be a string')
  const normalized = view === undefined ? undefined : normalizeView(view)
  const options = state.options
  let needed: Set<string> | undefined
  let span: ReturnType<typeof windowCells> | undefined
  if (normalized) {
    span = windowCells(options, normalized, options.padding)
    if (span.count > options.maxCells) throw new RangeError(`The view needs ${span.count} cells, more than maxCells (${options.maxCells})`)
    needed = new Set()
    for (let chunk = span.first; chunk <= span.last; chunk++) {
      if (!span.rows) needed.add(cellKey(chunk, undefined))
      else for (const row of span.rows) needed.add(cellKey(chunk, row))
    }
  }
  const abort: string[] = []
  let cells = new Map(state.cells)
  const inflight = new Map(state.inflight)
  let items = state.items
  let links = state.links
  if (condition !== state.condition) {
    for (const id of inflight.keys()) abort.push(id)
    inflight.clear()
    cells = new Map()
    items = new Map()
    links = new Map()
  } else {
    for (const [id, request] of inflight) {
      let keep = false
      if (needed) for (const key of request.cells) if (needed.has(key)) { keep = true; break }
      if (keep) continue
      abort.push(id)
      inflight.delete(id)
      for (const key of request.cells) if (cells.get(key)?.requestId === id) cells.delete(key)
    }
  }
  let sequence = state.sequence
  const start: WindowedDataRequest[] = []
  if (normalized && span) {
    // Missing rows per chunk; adjacent chunks with the same missing rows share one request.
    let group: { first: number; last: number; rows: string[] | undefined; signature: string } | undefined
    const flush = () => {
      if (!group) return
      const requestId = String(++sequence)
      const requestStart = options.origin + group.first * options.chunkSize
      const requestEnd = options.origin + (group.last + 1) * options.chunkSize
      const keys: string[] = []
      for (let chunk = group.first; chunk <= group.last; chunk++) {
        if (!group.rows) keys.push(cellKey(chunk, undefined))
        else for (const row of group.rows) keys.push(cellKey(chunk, row))
      }
      const request: WindowedDataRequest = {
        requestId, condition, start: requestStart, end: requestEnd,
        key: JSON.stringify([condition, requestStart, requestEnd, group.rows ?? null]),
        ...group.rows && { rowIds: group.rows },
      }
      inflight.set(requestId, { ...request, first: group.first, last: group.last, cells: keys })
      for (const key of keys) cells.set(key, { status: 'loading', requestId })
      start.push(request)
      group = undefined
    }
    for (let chunk = span.first; chunk <= span.last; chunk++) {
      let rows: string[] | undefined
      let missing = false
      if (!span.rows) missing = !cells.has(cellKey(chunk, undefined))
      else {
        rows = []
        for (const row of span.rows) if (!cells.has(cellKey(chunk, row))) rows.push(row)
        missing = rows.length > 0
      }
      if (!missing) {
        flush()
        continue
      }
      const signature = rows ? rows.join('\u0000') : ''
      if (group && group.signature === signature && chunk - group.first < options.maxChunksPerRequest) {
        group.last = chunk
        continue
      }
      flush()
      group = { first: chunk, last: chunk, rows, signature }
    }
    flush()
  }
  return {
    state: {
      ...state, condition, view: normalized, cells, inflight, requests: publicRequests(inflight), items, links, sequence,
    },
    start, abort,
  }
}

function publicRequests(inflight: ReadonlyMap<string, WindowedInFlightRequest>) {
  const requests = new Map<string, WindowedDataRequest>()
  for (const [id, { requestId, key, condition, start, end, rowIds }] of inflight) {
    requests.set(id, { requestId, key, condition, start, end, ...rowIds && { rowIds } })
  }
  return requests
}

function readPage<T, L>(page: readonly T[] | WindowedDataPage<T, L>): { items: readonly T[]; links: readonly L[] } {
  if (Array.isArray(page)) return { items: page as readonly T[], links: [] }
  const value = page as WindowedDataPage<T, L>
  if (!value || typeof value !== 'object' || !Array.isArray(value.items)) {
    throw new TypeError('A windowed data response must be an array of items or { items, links? }')
  }
  if (value.links !== undefined && !Array.isArray(value.links)) throw new TypeError('Response links must be an array')
  return { items: value.items, links: value.links ?? [] }
}

/**
 * Applies the response of a request in flight: its items and links are merged into the data by ID (an item that an
 * earlier, overlapping request already returned is replaced, never duplicated), and each of its cells becomes `loaded`
 * or `loaded-empty`. A response of an unknown, aborted or superseded request is ignored (`applied: false`). Throws
 * Error for an item or link without a non-empty string ID or with an ID twice in the response, and TypeError for a
 * malformed response; the state is then unchanged (report it with `rejectWindowedRequest`).
 */
export function resolveWindowedRequest<T, L = never>(
  state: WindowedDataState<T, L>, requestId: string, response: readonly T[] | WindowedDataPage<T, L>,
): WindowedDataSettlement<T, L> {
  const request = state.inflight.get(requestId)
  if (!request) return { state, applied: false }
  const { items: received, links: receivedLinks } = readPage(response)
  const { itemId, itemRow, itemRange, linkId, chunkSize, origin } = state.options
  const pageIds = new Set<string>()
  for (const item of received) {
    const id = itemId(item)
    if (typeof id !== 'string' || id === '') throw new Error('Windowed data items need a non-empty string ID')
    if (pageIds.has(id)) throw new Error('Duplicate item ID in one response: ' + id)
    pageIds.add(id)
  }
  const linkIds = new Set<string>()
  for (const link of receivedLinks) {
    const id = linkId(link)
    if (typeof id !== 'string' || id === '') throw new Error('Windowed data links need a non-empty string ID')
    if (linkIds.has(id)) throw new Error('Duplicate link ID in one response: ' + id)
    linkIds.add(id)
  }
  // Cells of the request that received at least one item.
  const filled = new Set<string>()
  const requestRows = request.rowIds ? new Set(request.rowIds) : undefined
  for (const item of received) {
    const row = itemRow(item)
    const rows = !requestRows ? [undefined] : row === undefined ? request.rowIds! : requestRows.has(row) ? [row] : []
    if (rows.length === 0) continue
    const range = itemRange(item)
    let first = request.first
    let last = request.last
    if (range && Number.isFinite(range.start) && Number.isFinite(range.end)) {
      first = Math.max(first, Math.floor((range.start - origin) / chunkSize))
      last = Math.min(last, range.end > range.start ? Math.ceil((range.end - origin) / chunkSize) - 1 : first)
    }
    for (let chunk = first; chunk <= last; chunk++) for (const id of rows) filled.add(cellKey(chunk, id))
  }
  const items = new Map(state.items)
  for (const item of received) items.set(itemId(item), item)
  let links = state.links
  if (receivedLinks.length) {
    const next = new Map(links)
    for (const link of receivedLinks) next.set(linkId(link), link)
    links = next
  }
  const cells = new Map(state.cells)
  for (const key of request.cells) {
    if (cells.get(key)?.requestId !== requestId) continue
    cells.set(key, { status: filled.has(key) ? 'loaded' : 'loaded-empty' })
  }
  const inflight = new Map(state.inflight)
  inflight.delete(requestId)
  return { state: { ...state, cells, inflight, requests: publicRequests(inflight), items, links }, applied: true }
}

/**
 * Marks the cells of a failed request in flight `failed`. Loaded items and links stay, so what is displayed does not
 * disappear. A failure of an unknown, aborted or superseded request is ignored (`applied: false`).
 */
export function rejectWindowedRequest<T, L = never>(
  state: WindowedDataState<T, L>, requestId: string, error: unknown,
): WindowedDataSettlement<T, L> {
  const request = state.inflight.get(requestId)
  if (!request) return { state, applied: false }
  const cells = new Map(state.cells)
  for (const key of request.cells) {
    if (cells.get(key)?.requestId === requestId) cells.set(key, { status: 'failed', error })
  }
  const inflight = new Map(state.inflight)
  inflight.delete(requestId)
  return { state: { ...state, cells, inflight, requests: publicRequests(inflight) }, applied: true }
}

function cellInWindow(key: string, chunks: { first: number; last: number }, rows: ReadonlySet<string> | undefined) {
  const separator = key.indexOf('\u0000')
  const chunk = Number(separator < 0 ? key : key.slice(0, separator))
  if (chunk < chunks.first || chunk > chunks.last) return false
  if (!rows) return true
  return separator >= 0 && rows.has(key.slice(separator + 1))
}

/**
 * Makes failed cells `unloaded` again (all of them, or only those in `window`) and plans requests for those the
 * current view needs. Loaded data stays.
 */
export function retryWindowedData<T, L = never>(state: WindowedDataState<T, L>, window?: WindowedView): WindowedDataTransition<T, L> {
  const options = state.options
  const scope = window === undefined ? undefined : normalizeView(window)
  const chunks = scope ? chunkSpan(options, scope.start, scope.end, 0) : undefined
  const rows = scope?.rowIds ? new Set(scope.rowIds) : undefined
  const cells = new Map(state.cells)
  for (const [key, cell] of state.cells) {
    if (cell.status !== 'failed') continue
    if (chunks && !cellInWindow(key, chunks, rows)) continue
    cells.delete(key)
  }
  return setWindowedView({ ...state, cells }, state.view)
}

/**
 * Aborts every request and makes every cell `unloaded`, keeping the loaded items and links on display, then plans
 * requests for the current view. Use it to refresh after the server data changed; responses replace items by ID. Items
 * that the server deleted stay until the condition changes (`setWindowedView` with a new condition) or `resetWindowedData`.
 */
export function invalidateWindowedData<T, L = never>(state: WindowedDataState<T, L>): WindowedDataTransition<T, L> {
  const abort = [...state.inflight.keys()]
  const next = setWindowedView({ ...state, cells: new Map(), inflight: new Map(), requests: new Map() }, state.view)
  return { ...next, abort: [...abort, ...next.abort] }
}

/** Aborts every request (their cells become `unloaded`) and keeps loaded data and cells. Plans nothing. */
export function cancelWindowedRequests<T, L = never>(state: WindowedDataState<T, L>): WindowedDataTransition<T, L> {
  const abort = [...state.inflight.keys()]
  const cells = new Map(state.cells)
  for (const [key, cell] of state.cells) if (cell.status === 'loading') cells.delete(key)
  return { state: { ...state, cells, inflight: new Map(), requests: new Map() }, start: [], abort }
}

/** Aborts every request and drops all cells, items and links; keeps the options, condition and view. Plans nothing. */
export function resetWindowedData<T, L = never>(state: WindowedDataState<T, L>): WindowedDataTransition<T, L> {
  const abort = [...state.inflight.keys()]
  return {
    state: { ...state, cells: new Map(), inflight: new Map(), requests: new Map(), items: new Map(), links: new Map() },
    start: [], abort,
  }
}

/** The status of one cell: the chunk that contains `time`, of `rowId` (omit it for cells without rows). */
export function windowedCellStatus<T, L>(state: WindowedDataState<T, L>, time: number, rowId?: string): WindowedCellStatus {
  const { chunkSize, origin } = state.options
  return state.cells.get(cellKey(Math.floor((finite(time, 'time') - origin) / chunkSize), rowId))?.status ?? 'unloaded'
}

/**
 * Status counts of the cells that a window covers, without padding: by default the current view. `complete` is true
 * only when every one of them has loaded. To know whether data is complete for the whole plan, pass its whole extent
 * (its range and every row ID).
 */
export function windowedCoverage<T, L>(state: WindowedDataState<T, L>, window: WindowedView | undefined = state.view): WindowedCoverage {
  const coverage: WindowedCoverage = { status: 'unloaded', complete: false, total: 0, unloaded: 0, loading: 0, empty: 0, loaded: 0, failed: 0 }
  if (!window) return coverage
  const view = normalizeView(window)
  const { first, last, rows } = windowCells(state.options, view, 0)
  for (let chunk = first; chunk <= last; chunk++) {
    for (const row of rows ?? [undefined]) {
      const status = state.cells.get(cellKey(chunk, row))?.status ?? 'unloaded'
      coverage.total++
      if (status === 'unloaded') coverage.unloaded++
      else if (status === 'loading') coverage.loading++
      else if (status === 'loaded-empty') coverage.empty++
      else if (status === 'loaded') coverage.loaded++
      else coverage.failed++
    }
  }
  coverage.status = coverage.failed ? 'failed' : coverage.loading ? 'loading' : coverage.unloaded ? 'unloaded'
    : coverage.loaded ? 'loaded' : 'loaded-empty'
  coverage.complete = coverage.total > 0 && coverage.empty + coverage.loaded === coverage.total
  return coverage
}

/** A link with an end that is not loaded. */
export interface DanglingLink<L> {
  link: L
  /** The IDs of its ends that are not present, `from` first. */
  missingIds: string[]
}

export interface SplitDanglingLinksOptions<L> {
  /** Source end of a link. Default `link.from`. */
  from?: (link: L) => string
  /** Target end of a link. Default `link.to`. */
  to?: (link: L) => string
}

export interface SplitDanglingLinks<L> {
  /** Links whose both ends are present, in input order: safe to pass to GanttChart `dependencies` or NetworkGraph `edges`. */
  resolved: L[]
  /** Links with a missing end, in input order. Keep them; they resolve when the missing item arrives. */
  dangling: DanglingLink<L>[]
}

/**
 * Splits links between loaded items into those whose both ends are present and those that point to an item that is not
 * loaded (yet). The components throw for links to unknown items, so pass only `resolved` to them. Call it again with the
 * new set of present IDs after more data arrives: a dangling link whose missing end has arrived moves to `resolved`.
 * `present` is a set of item IDs (or anything with `has`, such as a Map by ID) or any iterable of them. The inputs are not modified.
 */
export function splitDanglingLinks<L extends { from: string; to: string }>(
  links: readonly L[], present: { has(id: string): boolean } | Iterable<string>, options?: SplitDanglingLinksOptions<L>,
): SplitDanglingLinks<L>
export function splitDanglingLinks<L>(
  links: readonly L[], present: { has(id: string): boolean } | Iterable<string>, options: Required<SplitDanglingLinksOptions<L>>,
): SplitDanglingLinks<L>
export function splitDanglingLinks<L>(
  links: readonly L[], present: { has(id: string): boolean } | Iterable<string>, options: SplitDanglingLinksOptions<L> = {},
): SplitDanglingLinks<L> {
  const from = options.from ?? ((link: L) => (link as { from: string }).from)
  const to = options.to ?? ((link: L) => (link as { to: string }).to)
  const has = typeof (present as { has?: unknown }).has === 'function' ? present as { has(id: string): boolean } : new Set(present as Iterable<string>)
  const resolved: L[] = []
  const dangling: DanglingLink<L>[] = []
  for (const link of links) {
    const ends = [from(link), to(link)]
    const missingIds: string[] = []
    for (const id of ends) if (!has.has(id) && !missingIds.includes(id)) missingIds.push(id)
    if (missingIds.length) dangling.push({ link, missingIds })
    else resolved.push(link)
  }
  return { resolved, dangling }
}
