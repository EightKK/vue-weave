import {
  computed, getCurrentInstance, getCurrentScope, onMounted, onScopeDispose, shallowReadonly, shallowRef, toValue, watch,
  type ComputedRef, type MaybeRefOrGetter, type ShallowRef,
} from 'vue'
import {
  cancelWindowedRequests, createWindowedDataState, invalidateWindowedData, rejectWindowedRequest, resetWindowedData,
  resolveWindowedRequest, retryWindowedData, setWindowedView, splitDanglingLinks, windowedCoverage,
  type DanglingLink, type SplitDanglingLinksOptions, type WindowedCellStatus, type WindowedCoverage, type WindowedDataOptions,
  type WindowedDataPage, type WindowedDataRequest, type WindowedDataState, type WindowedDataTransition, type WindowedView,
} from '../core/windowedData.js'

/** Fetches one request. `signal` is aborted when the result is no longer wanted; the result is ignored either way. */
export type WindowedDataLoader<T, L = never> = (
  request: WindowedDataRequest, context: { signal: AbortSignal },
) => readonly T[] | WindowedDataPage<T, L> | Promise<readonly T[] | WindowedDataPage<T, L>>

/** The last failure: of a request of the current condition, or of the view itself (no `request`, e.g. too many cells). */
export interface WindowedDataError {
  request?: WindowedDataRequest
  error: unknown
}

export interface UseWindowedDataOptions<T, L = never> extends WindowedDataOptions<T, L> {
  /** What is shown, such as the payload of GanttChart `visible-window-change`. Undefined requests nothing. */
  view: MaybeRefOrGetter<WindowedView | undefined>
  /**
   * A token for everything else the data depends on: a filter, a query, a data version. When it changes, every request
   * is aborted and all loaded data is dropped, so results for another condition are never attached. Default `''`. A value
   * that is not a string, or a getter that throws, is reported through `error` (never thrown) and drops all data until a
   * valid condition is read again.
   */
  condition?: MaybeRefOrGetter<string>
  /** Fetches a request. Supplied by the application; may return the items, `{ items, links }` or a promise of either. */
  load: WindowedDataLoader<T, L>
  /** Ends of a link for `resolvedLinks` and `danglingLinks`. Default `link.from` and `link.to` (each accessor falls back on its own). */
  linkEnds?: SplitDanglingLinksOptions<L>
}

export interface WindowedData<T, L = never> {
  /** The core state (`WindowedDataState`); read cells, requests and data from it. */
  state: Readonly<ShallowRef<WindowedDataState<T, L>>>
  /** Every loaded item of the current condition, deduplicated by ID. It keeps its contents while requests load or fail. */
  items: ComputedRef<T[]>
  /** Every loaded link of the current condition, deduplicated by ID, including dangling ones. */
  links: ComputedRef<L[]>
  /** Links whose both ends are loaded items: safe for GanttChart `dependencies` or NetworkGraph `edges`. */
  resolvedLinks: ComputedRef<L[]>
  /** Links with an end that is not loaded; they move to `resolvedLinks` when it arrives. */
  danglingLinks: ComputedRef<DanglingLink<L>[]>
  /** Coverage of the current view. */
  coverage: ComputedRef<WindowedCoverage>
  /** Aggregate status of the current view (`coverage.status`). */
  status: ComputedRef<WindowedCellStatus>
  /** True only when every cell of the current view has loaded. The data is still only the loaded part of the whole. */
  complete: ComputedRef<boolean>
  /** True while a request is in flight. */
  pending: ComputedRef<boolean>
  /**
   * The current failure of the current condition, or undefined. Per-cell failures are in `state`. Precedence, from the
   * first that applies: (1) a failed request (`{ request, error }`), cleared by `retry`, `invalidate` or a new condition;
   * (2) an invalid view (such as one with more than `maxCells` cells, or chunk indices beyond the safe integer range) or
   * condition (not a string), or a `view` or `condition` getter that throws, reported without `request` and never thrown,
   * not even by the `useWindowedData` call when the first read of `condition` fails: the state then has no view and
   * nothing in flight (`complete` false) and keeps the data of the current condition (an invalid condition drops all
   * data). It clears when a valid condition and view are read again (on the next change, or when requests start), and
   * the view is then requested again; (3) a `linkEnds` accessor that
   * throws, reported as `{ error }` without `request`: `resolvedLinks` and `danglingLinks` are then both empty (never a
   * partial split), while `items`, `links`, `status` and `complete` are unaffected. (3) is derived from the loaded links
   * and clears by itself as soon as the split succeeds again (new links, or whatever the accessor reads changed); while (1)
   * or (2) is shown, (3) is not evaluated and appears afterwards if it still applies. Reading `error` evaluates the split
   * (cached, like `resolvedLinks`) unless (1) or (2) applies; nothing is evaluated for an application that reads none of them.
   */
  error: ComputedRef<WindowedDataError | undefined>
  /** Coverage of any window, for example one row (`{ start, end, rowIds: [id] }`) or the whole plan. */
  coverageOf: (window: WindowedView) => WindowedCoverage
  /** Requests failed cells again (all, or those in `window`) that the current view needs. Loaded data stays. */
  retry: (window?: WindowedView) => void
  /** Reloads the current view; loaded data stays on display until it is replaced by ID. */
  invalidate: () => void
  /** Aborts every request in flight. */
  cancel: () => void
  /** Cancels, stops watching and ignores every later result. Called automatically with the owning scope. */
  dispose: () => void
}

/**
 * Loads only what a view shows. The view (a time window and optionally row IDs) is aligned to chunks, missing cells are
 * requested through `load`, superseded requests are aborted, late, aborted and out-of-order responses are ignored, items
 * that overlapping requests return twice are kept once, failed cells keep the loaded data and wait for `retry`, and a
 * new `condition` drops data that belongs to another one. A new condition is processed before the new view is checked,
 * so an invalid view never keeps the old condition's requests or data; responses are matched by request ID and
 * condition. Requests start when the owning component mounts (immediately
 * outside a component), so nothing is requested during server rendering. All decisions are made by the pure core
 * functions (`setWindowedView`, `resolveWindowedRequest`, ...), which can also be used without Vue.
 */
export function useWindowedData<T, L = never>(options: UseWindowedDataOptions<T, L>): WindowedData<T, L> {
  const { load, linkEnds } = options
  // The last failure of a request, the view or the condition. `error` (below) derives from it and from the link split.
  const failure = shallowRef<WindowedDataError>()
  // An initial condition that can not be read is reported, not thrown: the state starts without data under `''`, and the
  // condition is read again (and the error cleared once it is valid) when requests start and whenever it changes.
  // Invalid options still throw: they are a programming error, not a value that can recover.
  let initialCondition = ''
  try {
    initialCondition = readCondition()
  } catch (reason) {
    failure.value = { error: reason }
  }
  const state = shallowRef(createWindowedDataState<T, L>(options, initialCondition))
  const controllers = new Map<string, AbortController>()
  let started = false
  let disposed = false

  /**
   * Commits a transition in one step: the state is assigned first, then every controller whose request is no longer in
   * flight is aborted (the transition's `abort` list and, as a safeguard, any other), and only then are new requests started.
   */
  function apply(transition: WindowedDataTransition<T, L>) {
    if (state.value.condition !== transition.state.condition) failure.value = undefined
    state.value = transition.state
    const live = transition.state.requests
    for (const id of transition.abort) {
      controllers.get(id)?.abort()
      controllers.delete(id)
    }
    for (const [id, controller] of controllers) {
      if (live.has(id)) continue
      controller.abort()
      controllers.delete(id)
    }
    for (const request of transition.start) run(request)
  }

  /** True while the request is still wanted: not aborted, in flight in the current state and of its condition. */
  function wanted(request: WindowedDataRequest, signal: AbortSignal) {
    if (signal.aborted || disposed) return false
    const current = state.value
    return request.condition === current.condition && current.requests.get(request.requestId)?.condition === current.condition
  }

  function run(request: WindowedDataRequest) {
    const controller = new AbortController()
    controllers.set(request.requestId, controller)
    const { signal } = controller
    // A load that throws synchronously becomes a rejection, reported like any other failure of the request.
    new Promise<readonly T[] | WindowedDataPage<T, L>>(done => done(load(request, { signal }))).then((response) => {
      if (controllers.get(request.requestId) === controller) controllers.delete(request.requestId)
      if (!wanted(request, signal)) return
      let settled
      try {
        settled = resolveWindowedRequest(state.value, request.requestId, response)
      } catch (reason) {
        fail(request, reason)
        return
      }
      if (!settled.applied) return
      state.value = settled.state
    }, (reason: unknown) => {
      if (controllers.get(request.requestId) === controller) controllers.delete(request.requestId)
      if (!wanted(request, signal)) return
      fail(request, reason)
    })
  }

  function fail(request: WindowedDataRequest, reason: unknown) {
    const settled = rejectWindowedRequest(state.value, request.requestId, reason)
    if (!settled.applied) return
    state.value = settled.state
    failure.value = { request, error: reason }
  }

  /** Reports a view that can not be loaded: nothing stays in flight and no view is current, so `complete` is false. */
  function rejectView(reason: unknown) {
    apply(setWindowedView(state.value, undefined))
    failure.value = { error: reason }
  }

  /**
   * Brings the state up to the current condition and view. A new condition is processed first and on its own: every
   * request of the old condition is aborted and its data dropped before the new view is even read. An invalid view (more
   * than `maxCells` cells, non-finite, `end < start`) or an invalid condition is reported through `error`, never thrown.
   * Returns false when the view or condition was rejected.
   */
  function readCondition() {
    const condition: unknown = toValue(options.condition) ?? ''
    if (typeof condition !== 'string') throw new TypeError('condition must be a string')
    return condition
  }

  function update() {
    if (!started || disposed) return true
    let condition: string
    try {
      condition = readCondition()
    } catch (reason) {
      // The condition is unknown, so no data of any condition can be shown.
      const reset = resetWindowedData(state.value)
      apply({ ...reset, state: { ...reset.state, view: undefined } })
      failure.value = { error: reason }
      return false
    }
    if (condition !== state.value.condition) apply(setWindowedView(state.value, undefined, condition))
    let transition
    try {
      transition = setWindowedView(state.value, toValue(options.view))
    } catch (reason) {
      rejectView(reason)
      return false
    }
    // A view error ends once the view is valid again; failures of requests stay until `retry` or `invalidate`.
    if (failure.value && !failure.value.request) failure.value = undefined
    apply(transition)
    return true
  }

  const scope = getCurrentScope()
  // The watch source only tracks the view and the condition; `update` reads and checks them. A getter that throws is
  // caught here (a fresh token each time, so the watcher still runs) and `update` reads it again and reports it through
  // `error`, instead of the watcher swallowing it and skipping the update.
  const track = (source: MaybeRefOrGetter<unknown>) => {
    try {
      return toValue(source)
    } catch {
      return {}
    }
  }
  const stop = watch(() => [track(options.view), track(options.condition)], update)

  function begin() {
    started = true
    update()
  }
  if (getCurrentInstance()) onMounted(begin)
  else begin()

  // `retry` and `invalidate` first catch up with a condition or view change that the watcher has not processed yet, so
  // they never request data for a condition that is no longer current. A rejected view keeps its error.
  function retry(window?: WindowedView) {
    if (disposed || !started) return
    const ok = update()
    const transition = retryWindowedData(state.value, window)
    if (ok) failure.value = undefined
    apply(transition)
  }
  function invalidate() {
    if (disposed || !started) return
    const ok = update()
    const transition = invalidateWindowedData(state.value)
    if (ok) failure.value = undefined
    apply(transition)
  }
  function cancel() {
    if (disposed) return
    apply(cancelWindowedRequests(state.value))
  }
  function dispose() {
    if (disposed) return
    cancel()
    disposed = true
    stop()
  }
  if (scope) onScopeDispose(dispose)

  const items = computed(() => [...state.value.items.values()])
  const links = computed(() => [...state.value.links.values()])
  // A `linkEnds` accessor that throws must not escape from `resolvedLinks` or `danglingLinks` (read while rendering). The
  // split is then empty, never partial, and the failure is part of the value, so `error` derives from it without any
  // state being written inside a computed. It is evaluated only when `resolvedLinks`, `danglingLinks` or `error` is read.
  const split = computed<{ resolved: L[]; dangling: DanglingLink<L>[]; failure?: WindowedDataError }>(() => {
    try {
      return splitDanglingLinks(links.value, state.value.items, linkEnds as Required<SplitDanglingLinksOptions<L>>)
    } catch (reason) {
      return { resolved: [], dangling: [], failure: { error: reason } }
    }
  })
  // A failure of a request, the view or the condition comes first; the link-ends failure is shown when there is none.
  const error = computed(() => failure.value ?? split.value.failure)
  const coverage = computed(() => windowedCoverage(state.value))
  return {
    state: shallowReadonly(state),
    items,
    links,
    resolvedLinks: computed(() => split.value.resolved),
    danglingLinks: computed(() => split.value.dangling),
    coverage,
    status: computed(() => coverage.value.status),
    complete: computed(() => coverage.value.complete),
    pending: computed(() => state.value.requests.size > 0),
    error,
    coverageOf: window => windowedCoverage(state.value, window),
    retry, invalidate, cancel, dispose,
  }
}
