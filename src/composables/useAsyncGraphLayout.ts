import {
  computed, getCurrentInstance, getCurrentScope, onMounted, onScopeDispose, ref, shallowReactive, shallowReadonly, shallowRef, toValue, watch,
  type MaybeRefOrGetter, type Ref, type ShallowRef,
} from 'vue'
import type { GraphEdge, GraphLayout, GraphLayoutDirection, GraphNodeSize, GraphPoint } from '../core/graph.js'
import type { GraphShownEdge, GraphShownNode } from '../core/graphCollapse.js'
import {
  buildGraphLayoutRequests, completeGraphLayout, graphLayoutMessageFromJson, graphLayoutMessageToJson, parseGraphLayoutMessage,
  validateGraphLayoutResponse, type GraphLayoutRequest, type GraphLayoutRequestInput, type GraphLayoutRequests, type GraphLayoutScope,
  type GraphLayoutWorkerMessage,
} from '../core/graphLayoutRequests.js'
import type { GraphGesture, GraphGestureEnd, GraphLayoutFunction, NetworkGroup, NetworkNode } from '../core/types.js'

/**
 * Computes one layout request. It may return the layout or a promise of it. `signal` is aborted when the result is no
 * longer wanted; an engine that can stop early should, but the result is discarded either way.
 */
export type AsyncGraphLayoutAdapter<N extends NetworkNode = NetworkNode, E extends GraphEdge = GraphEdge, G extends NetworkGroup = NetworkGroup> = (
  request: GraphLayoutRequest<GraphShownNode<N, G>, GraphShownEdge<E, G>, NetworkGroup>, signal: AbortSignal,
) => GraphLayout | Promise<GraphLayout>

/** The input of one frame: the graph and every condition its layout depends on. */
export interface AsyncGraphFrame<N extends NetworkNode = NetworkNode, E extends GraphEdge = GraphEdge, G extends NetworkGroup = NetworkGroup> {
  revision: string
  nodes: readonly N[]
  edges: readonly E[]
  groups: readonly G[]
  /** The collapsed group IDs as given, for NetworkGraph `collapsedGroupIds`. */
  collapsedGroupIds: ReadonlySet<string>
  direction: GraphLayoutDirection
  positions?: ReadonlyMap<string, GraphPoint>
  sizes?: ReadonlyMap<string, GraphNodeSize>
  /** Pinned nodes for an incremental engine, as given in the input. */
  fixedIds?: ReadonlySet<string>
  /** New nodes for an incremental engine, as given in the input. */
  addedIds?: ReadonlySet<string>
  settings?: unknown
  /** Input keys of the frame's requests; `expanded` only while a group is collapsed. */
  inputKeys: { shown: string; expanded?: string }
}

/** A frame whose layouts are ready: everything NetworkGraph needs, consistent with one input. */
export interface AsyncGraphDisplayFrame<N extends NetworkNode = NetworkNode, E extends GraphEdge = GraphEdge, G extends NetworkGroup = NetworkGroup>
  extends AsyncGraphFrame<N, E, G> {
  layouts: { shown: GraphLayout; expanded?: GraphLayout }
  /**
   * 'initial' from `initialLayout`; 'layout' from the adapter; 'provisional' from the previous layouts with temporary
   * routes for new edges (`temporaryEdgeIds`), shown while the adapter computes the frame.
   */
  source: 'initial' | 'layout' | 'provisional'
  /** Edges drawn with a temporary built-in route (see `completeGraphLayout`). */
  temporaryEdgeIds: readonly string[]
}

/**
 * NetworkGraph listeners for its `gesture-start` and `gesture-end` events. Bind them with `v-bind` (or spread them into
 * `h(NetworkGraph, props)`); they can sit next to listeners of the application for the same events.
 */
export interface AsyncGraphGestureListeners {
  onGestureStart: (gesture: GraphGesture) => void
  onGestureEnd: (gesture: GraphGestureEnd) => void
}

/** A failed layout request of the desired frame. The display keeps the last consistent frame. */
export interface AsyncGraphLayoutError {
  revision: string
  requestId: string
  inputKey: string
  scope: GraphLayoutScope
  error: unknown
}

export interface UseAsyncGraphLayoutOptions<N extends NetworkNode = NetworkNode, E extends GraphEdge = GraphEdge, G extends NetworkGroup = NetworkGroup> {
  /** The layout input. Pass a getter (or a ref) that returns a new object whenever any part of the input changes. */
  input: MaybeRefOrGetter<GraphLayoutRequestInput<N, E, G>>
  /** Computes a request, for example by posting it to a Worker (see `graphLayoutWorkerAdapter`). */
  adapter: AsyncGraphLayoutAdapter<N, E, G>
  /**
   * A synchronous layout for the first frame, such as `layoutLayeredGraph`. It is used during server rendering and on
   * the first client render, so both render the same frame; without it `display` stays undefined until the first
   * result arrives (show a loading state in the meantime).
   */
  initialLayout?: (nodes: readonly GraphShownNode<N, G>[], edges: readonly GraphShownEdge<E, G>[]) => GraphLayout
  /**
   * While true, finished frames wait and are shown when it turns false, so an ongoing drag is not cancelled. Frames
   * also wait while a gesture reported through `gestureListeners` is in flight; this option is for gestures the
   * application tracks itself.
   */
  gesture?: MaybeRefOrGetter<boolean>
  /**
   * Default true. When every node of the new input already has a box in the displayed layouts (for example after an
   * edge is connected or removed), show the new input right away with the previous boxes and temporary routes for new
   * edges, until the adapter's result arrives.
   */
  provisional?: boolean
  /** Number of computed layouts kept for reuse, by scope and input key. Default 32. */
  cacheSize?: number
}

export interface AsyncGraphLayout<N extends NetworkNode = NetworkNode, E extends GraphEdge = GraphEdge, G extends NetworkGroup = NetworkGroup> {
  /** The latest input, whose layouts are requested. */
  desired: Readonly<ShallowRef<AsyncGraphFrame<N, E, G> | undefined>>
  /** The last frame whose layouts are ready. Bind all of its fields to NetworkGraph together. */
  display: Readonly<ShallowRef<AsyncGraphDisplayFrame<N, E, G> | undefined>>
  /**
   * The NetworkGraph `layout` function. Its identity never changes, so a new result does not re-fit the camera; it
   * returns the display frame's layouts and throws Error for nodes and edges that are not the display frame's.
   */
  layout: GraphLayoutFunction<GraphShownNode<N, G>, GraphShownEdge<E, G>>
  /** True while layouts of the desired frame are being computed. */
  pending: Readonly<Ref<boolean>>
  /** True while a finished frame waits for the gesture to end. */
  deferred: Readonly<Ref<boolean>>
  /**
   * Listeners to bind to NetworkGraph (`v-bind="graph.gestureListeners"`). While a gesture they reported is in flight,
   * finished frames wait as they do while `gesture` is true. Their identity never changes.
   */
  gestureListeners: Readonly<AsyncGraphGestureListeners>
  /** True while a gesture reported through `gestureListeners` is in flight or the `gesture` option is true. */
  gesturing: Readonly<Ref<boolean>>
  /** The last failure of the desired frame; cleared when the input changes. */
  error: Readonly<ShallowRef<AsyncGraphLayoutError | undefined>>
  /** Stops waiting for the requests in flight (aborting their signals) and discards their results. */
  cancel: () => void
  /** Cancels, stops watching the input and ignores every later result. Called automatically with the owning scope. */
  dispose: () => void
}

type Requests<N extends NetworkNode, E extends GraphEdge, G extends NetworkGroup> = GraphLayoutRequests<N, E, G>
type AnyRequest<N extends NetworkNode, E extends GraphEdge, G extends NetworkGroup> = GraphLayoutRequest<GraphShownNode<N, G>, GraphShownEdge<E, G>, NetworkGroup>

/**
 * Asynchronous layouts for NetworkGraph. The input is turned into layout requests as NetworkGraph would lay it out
 * (`buildGraphLayoutRequests`), the adapter computes them, and `display` changes only when every layout of one input is
 * ready (both scopes while a group is collapsed), so the nodes, edges, collapse state and layouts passed to the graph
 * always belong together. Results of older or cancelled requests are never shown; a failure keeps the last display.
 * Requests start when the owning component mounts (immediately outside a component), so nothing is started during
 * server rendering. Use the graph's `collapsedGroupIds` prop with the frame's value: an uncontrolled collapse would ask
 * for a layout that has not been computed.
 */
export function useAsyncGraphLayout<N extends NetworkNode, E extends GraphEdge, G extends NetworkGroup = NetworkGroup>(
  options: UseAsyncGraphLayoutOptions<N, E, G>,
): AsyncGraphLayout<N, E, G> {
  const { adapter, initialLayout, provisional = true, cacheSize = 32 } = options
  if (!Number.isInteger(cacheSize) || cacheSize < 0) throw new RangeError('cacheSize must be a nonnegative integer')
  const desired = shallowRef<AsyncGraphFrame<N, E, G>>()
  const display = shallowRef<AsyncGraphDisplayFrame<N, E, G>>()
  const pending = ref(false)
  const deferred = ref(false)
  const error = shallowRef<AsyncGraphLayoutError>()
  // Gestures reported by NetworkGraph that have started and not ended yet. Every start is followed by one end.
  const openGestures = ref(0)
  const gesturing = computed(() => !!toValue(options.gesture) || openGestures.value > 0)
  const gestureListeners: Readonly<AsyncGraphGestureListeners> = Object.freeze({
    onGestureStart: () => { openGestures.value++ },
    onGestureEnd: () => { openGestures.value = Math.max(0, openGestures.value - 1) },
  })
  // Computed layouts by scope and input key, in least recently used order.
  const cache = shallowReactive(new Map<string, GraphLayout>())
  const inflight = new Map<string, { controller: AbortController }>()
  let current: { frame: AsyncGraphFrame<N, E, G>; requests: Requests<N, E, G> } | undefined
  let waiting: AsyncGraphDisplayFrame<N, E, G> | undefined
  let sequence = 0, started = false, disposed = false

  const cacheKey = (request: { scope: GraphLayoutScope; inputKey: string }) => request.scope + '|' + request.inputKey
  const scopes = (requests: Requests<N, E, G>) =>
    (requests.expanded ? [requests.shown, requests.expanded] : [requests.shown]) as AnyRequest<N, E, G>[]

  function remember(key: string, layout: GraphLayout) {
    cache.delete(key)
    cache.set(key, layout)
    while (cache.size > cacheSize) cache.delete(cache.keys().next().value!)
  }
  function cached(key: string) {
    const layout = cache.get(key)
    if (layout) remember(key, layout)
    return layout
  }

  function show(frame: AsyncGraphDisplayFrame<N, E, G>) {
    if (gesturing.value) {
      waiting = frame
      deferred.value = true
      return
    }
    waiting = undefined
    deferred.value = false
    display.value = frame
  }

  function makeFrame(input: GraphLayoutRequestInput<N, E, G>, requests: Requests<N, E, G>): AsyncGraphFrame<N, E, G> {
    const { shown, expanded } = requests
    return {
      revision: shown.revision, nodes: input.nodes, edges: input.edges, groups: input.groups ?? [],
      collapsedGroupIds: new Set(input.collapsedGroupIds ?? []), direction: shown.direction,
      ...shown.positions && { positions: shown.positions }, ...shown.sizes && { sizes: shown.sizes },
      ...shown.fixedIds && { fixedIds: shown.fixedIds }, ...shown.addedIds && { addedIds: shown.addedIds },
      ...shown.settings !== undefined && { settings: shown.settings },
      inputKeys: { shown: shown.inputKey, ...expanded && { expanded: expanded.inputKey } },
    }
  }

  // Shows the current frame when all its layouts are cached; otherwise starts the missing requests and, when allowed,
  // shows a provisional frame made from the displayed layouts.
  function resolve() {
    if (!current || disposed || !started) return
    const { frame, requests } = current
    const layouts: Partial<Record<GraphLayoutScope, GraphLayout>> = {}
    let complete = true
    for (const request of scopes(requests)) {
      const key = cacheKey(request)
      const layout = cached(key)
      if (layout) {
        layouts[request.scope] = layout
        continue
      }
      complete = false
      if (!inflight.has(key)) start(request)
    }
    if (complete) {
      pending.value = false
      show({ ...frame, layouts: { shown: layouts.shown!, ...layouts.expanded && { expanded: layouts.expanded } }, source: 'layout', temporaryEdgeIds: [] })
      return
    }
    pending.value = true
    if (provisional) showProvisional(layouts)
  }

  function showProvisional(ready: Partial<Record<GraphLayoutScope, GraphLayout>>) {
    const previous = waiting ?? display.value
    if (!previous || !current) return
    const { frame, requests } = current
    const layouts: Partial<Record<GraphLayoutScope, GraphLayout>> = {}
    let temporaryEdgeIds: string[] = []
    for (const request of scopes(requests)) {
      const base = ready[request.scope] ?? previous.layouts[request.scope]
      if (!base || request.nodes.some(node => !base.boxes.has(node.id))) return
      if (request.scope === 'expanded') {
        layouts.expanded = base
        continue
      }
      const completion = completeGraphLayout(base, request.nodes, request.edges, { direction: request.direction })
      if (completion.unresolvedEdgeIds.length) return
      layouts.shown = completion.layout
      temporaryEdgeIds = completion.temporaryEdgeIds
    }
    show({ ...frame, layouts: { shown: layouts.shown!, ...layouts.expanded && { expanded: layouts.expanded } }, source: 'provisional', temporaryEdgeIds })
  }

  function start(request: AnyRequest<N, E, G>) {
    const key = cacheKey(request)
    const entry = { controller: new AbortController() }
    inflight.set(key, entry)
    const { signal } = entry.controller
    new Promise<GraphLayout>(done => done(adapter(request, signal))).then((layout) => {
      if (inflight.get(key) === entry) inflight.delete(key)
      if (signal.aborted || disposed) return
      let checked: GraphLayout
      try {
        checked = validateGraphLayoutResponse(request, { requestId: request.requestId, inputKey: request.inputKey, scope: request.scope, layout })
      } catch (reason) {
        fail(request, reason)
        return
      }
      remember(key, checked)
      resolve()
    }, (reason: unknown) => {
      if (inflight.get(key) === entry) inflight.delete(key)
      if (signal.aborted || disposed) return
      fail(request, reason)
    })
  }

  function fail(request: AnyRequest<N, E, G>, reason: unknown) {
    // Only a failure of the desired frame is reported; an older request's failure no longer matters.
    if (!current || !scopes(current.requests).some(item => cacheKey(item) === cacheKey(request))) return
    pending.value = false
    error.value = { revision: request.revision, requestId: request.requestId, inputKey: request.inputKey, scope: request.scope, error: reason }
  }

  function abortExcept(keep: ReadonlySet<string>) {
    for (const [key, entry] of inflight) {
      if (keep.has(key)) continue
      inflight.delete(key)
      entry.controller.abort()
    }
  }

  function update(input: GraphLayoutRequestInput<N, E, G>) {
    if (disposed) return
    error.value = undefined
    waiting = undefined
    deferred.value = false
    let requests: Requests<N, E, G>
    try {
      requests = buildGraphLayoutRequests(input, String(++sequence))
    } catch (reason) {
      current = undefined
      pending.value = false
      abortExcept(new Set())
      error.value = { revision: input.revision ?? '', requestId: String(sequence), inputKey: '', scope: 'shown', error: reason }
      return
    }
    const frame = makeFrame(input, requests)
    current = { frame, requests }
    desired.value = frame
    abortExcept(new Set(scopes(requests).map(cacheKey)))
    resolve()
  }

  function cancel() {
    abortExcept(new Set())
    pending.value = false
  }

  const scope = getCurrentScope()
  const stopInput = watch(() => toValue(options.input), update, { immediate: true })
  const stopGesture = watch(gesturing, (active) => {
    if (active || !waiting) return
    const frame = waiting
    waiting = undefined
    deferred.value = false
    display.value = frame
  })

  if (initialLayout && current) {
    const { frame, requests } = current
    const layouts: Partial<Record<GraphLayoutScope, GraphLayout>> = {}
    for (const request of scopes(requests)) {
      layouts[request.scope] = validateGraphLayoutResponse(request, {
        requestId: request.requestId, inputKey: request.inputKey, scope: request.scope, layout: initialLayout(request.nodes, request.edges),
      })
    }
    display.value = { ...frame, layouts: { shown: layouts.shown!, ...layouts.expanded && { expanded: layouts.expanded } }, source: 'initial', temporaryEdgeIds: [] }
  }

  function begin() {
    started = true
    resolve()
  }
  if (getCurrentInstance()) onMounted(begin)
  else begin()

  function dispose() {
    if (disposed) return
    cancel()
    disposed = true
    stopInput()
    stopGesture()
    current = undefined
    waiting = undefined
    deferred.value = false
  }
  if (scope) onScopeDispose(dispose)

  const layout = ((nodes: readonly GraphShownNode<N, G>[], edges: readonly GraphShownEdge<E, G>[]): GraphLayout => {
    const frame = display.value
    if (!frame) throw new Error('No graph layout is ready yet: render the graph once the display frame exists')
    const identical = nodes === frame.nodes && edges === frame.edges
    if (identical && frame.layouts.expanded) return frame.layouts.expanded
    const result = frame.layouts.shown
    if (identical) return result
    // A collapsed view, which NetworkGraph builds from the frame's input as buildGraphLayoutRequests does.
    for (const node of nodes) if (!result.boxes.has(node.id)) throw new Error('No async graph layout for node: ' + node.id)
    for (const edge of edges) if (!result.paths.has(edge.id)) throw new Error('No async graph layout for edge: ' + edge.id)
    return result
  }) as GraphLayoutFunction<GraphShownNode<N, G>, GraphShownEdge<E, G>>

  return {
    desired: shallowReadonly(desired), display: shallowReadonly(display), layout,
    pending: shallowReadonly(pending), deferred: shallowReadonly(deferred), error: shallowReadonly(error),
    gestureListeners, gesturing, cancel, dispose,
  }
}

/** The message port of a layout Worker: a `Worker`, a `MessagePort` or anything with the same three methods. */
export interface GraphLayoutWorkerPort {
  postMessage(message: unknown): void
  addEventListener(type: 'message', listener: (event: { data: unknown }) => void): void
  removeEventListener(type: 'message', listener: (event: { data: unknown }) => void): void
}

export interface GraphLayoutWorkerAdapterOptions {
  /**
   * 'clone' (default) posts messages with their Maps for structured clone; 'json' posts JSON text with Maps as entry
   * arrays and expects JSON text back.
   */
  transport?: 'clone' | 'json'
}

/**
 * An adapter for `useAsyncGraphLayout` that posts each request to a Worker as a 'request' message, resolves with the
 * matching 'success' message (same `requestId` and `inputKey`), rejects with the 'failure' message, and posts a 'cancel'
 * message when the request is aborted. Messages for other requests are ignored; a malformed message for this request
 * rejects it. The caller creates the Worker.
 */
export function graphLayoutWorkerAdapter(port: GraphLayoutWorkerPort, options: GraphLayoutWorkerAdapterOptions = {}): AsyncGraphLayoutAdapter<any, any, any> {
  const { transport = 'clone' } = options
  if (transport !== 'clone' && transport !== 'json') throw new RangeError('Unknown graph layout transport: ' + String(transport))
  const send = (message: GraphLayoutWorkerMessage) =>
    port.postMessage(transport === 'json' ? JSON.stringify(graphLayoutMessageToJson(message)) : message)
  return (request, signal) => new Promise<GraphLayout>((resolve, reject) => {
    const { requestId, inputKey } = request
    const finish = () => {
      port.removeEventListener('message', listener)
      signal.removeEventListener('abort', abort)
    }
    const listener = (event: { data: unknown }) => {
      let message: GraphLayoutWorkerMessage
      try {
        message = transport === 'json'
          ? graphLayoutMessageFromJson(typeof event.data === 'string' ? JSON.parse(event.data) : event.data)
          : parseGraphLayoutMessage(event.data)
      } catch (reason) {
        let raw = event.data as { requestId?: unknown } | null | string
        if (typeof raw === 'string') {
          try {
            raw = JSON.parse(raw) as { requestId?: unknown } | null
          } catch {
            raw = null
          }
        }
        if (raw && typeof raw === 'object' && raw.requestId === requestId) {
          finish()
          reject(reason)
        }
        return
      }
      if (message.type === 'request' || message.type === 'cancel' || message.requestId !== requestId || message.inputKey !== inputKey) return
      finish()
      if (message.type === 'success') resolve(message.layout)
      else reject(new Error(message.message))
    }
    const abort = () => {
      finish()
      send({ type: 'cancel', requestId, inputKey })
      reject(new Error('Graph layout request cancelled: ' + requestId))
    }
    if (signal.aborted) {
      reject(new Error('Graph layout request cancelled: ' + requestId))
      return
    }
    port.addEventListener('message', listener)
    signal.addEventListener('abort', abort)
    send({ type: 'request', request: request as GraphLayoutRequest })
  })
}
