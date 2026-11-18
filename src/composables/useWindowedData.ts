import {
  computed, getCurrentInstance, getCurrentScope, onMounted, onScopeDispose, shallowReadonly, shallowRef, toValue, watch,
  type ComputedRef, type MaybeRefOrGetter, type ShallowRef,
} from 'vue'
import {
  cancelWindowedRequests, createWindowedDataState, invalidateWindowedData, rejectWindowedRequest, resolveWindowedRequest,
  retryWindowedData, setWindowedView, splitDanglingLinks, windowedCoverage,
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
   * is aborted and all loaded data is dropped, so results for another condition are never attached. Default `''`.
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
  /** The last failure of the current condition; cleared by `retry`, `invalidate` or a new condition. Per-cell failures are in `state`. */
  error: Readonly<ShallowRef<WindowedDataError | undefined>>
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
 * new `condition` drops data that belongs to another one. Requests start when the owning component mounts (immediately
 * outside a component), so nothing is requested during server rendering. All decisions are made by the pure core
 * functions (`setWindowedView`, `resolveWindowedRequest`, ...), which can also be used without Vue.
 */
export function useWindowedData<T, L = never>(options: UseWindowedDataOptions<T, L>): WindowedData<T, L> {
  const { load, linkEnds } = options
  const state = shallowRef(createWindowedDataState<T, L>(options, toValue(options.condition) ?? ''))
  const error = shallowRef<WindowedDataError>()
  const controllers = new Map<string, AbortController>()
  let started = false
  let disposed = false

  function apply(transition: WindowedDataTransition<T, L>) {
    if (state.value.condition !== transition.state.condition) error.value = undefined
    state.value = transition.state
    for (const id of transition.abort) {
      controllers.get(id)?.abort()
      controllers.delete(id)
    }
    for (const request of transition.start) run(request)
  }

  function run(request: WindowedDataRequest) {
    const controller = new AbortController()
    controllers.set(request.requestId, controller)
    const { signal } = controller
    new Promise<readonly T[] | WindowedDataPage<T, L>>(done => done(load(request, { signal }))).then((response) => {
      if (controllers.get(request.requestId) === controller) controllers.delete(request.requestId)
      if (signal.aborted || disposed) return
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
      if (signal.aborted || disposed) return
      fail(request, reason)
    })
  }

  function fail(request: WindowedDataRequest, reason: unknown) {
    const settled = rejectWindowedRequest(state.value, request.requestId, reason)
    if (!settled.applied) return
    state.value = settled.state
    error.value = { request, error: reason }
  }

  function update() {
    if (!started || disposed) return
    const view = toValue(options.view)
    const condition = toValue(options.condition) ?? ''
    let transition
    try {
      transition = setWindowedView(state.value, view, condition)
    } catch (reason) {
      error.value = { error: reason }
      return
    }
    apply(transition)
  }

  const scope = getCurrentScope()
  const stop = watch(() => [toValue(options.view), toValue(options.condition)] as const, update)

  function begin() {
    started = true
    update()
  }
  if (getCurrentInstance()) onMounted(begin)
  else begin()

  function retry(window?: WindowedView) {
    if (disposed) return
    error.value = undefined
    apply(retryWindowedData(state.value, window))
  }
  function invalidate() {
    if (disposed || !started) return
    error.value = undefined
    apply(invalidateWindowedData(state.value))
  }
  function cancel() {
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
  const split = computed(() => splitDanglingLinks(links.value, state.value.items, linkEnds as Required<SplitDanglingLinksOptions<L>>))
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
    error: shallowReadonly(error) as Readonly<ShallowRef<WindowedDataError | undefined>>,
    coverageOf: window => windowedCoverage(state.value, window),
    retry, invalidate, cancel, dispose,
  }
}
