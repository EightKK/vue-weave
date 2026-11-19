import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createRenderer, createSSRApp, effectScope, h, nextTick, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import {
  cancelWindowedRequests, createGraphExpansion, createWindowedDataState, graphExpansionView, invalidateWindowedData, mergeGraphExpansionPage,
  beginGraphExpansion, cancelGraphExpansion, rejectWindowedRequest, resetWindowedData, resolveWindowedRequest, retryWindowedData,
  setWindowedView, splitDanglingLinks, windowedCellStatus, windowedCoverage,
} from 'vue-weave/core'
import { GanttChart, useWindowedData } from 'vue-weave'
import { seededRandom } from './helpers/seeded.mjs'
import { renderComponent } from './helpers/ssr.mjs'

const day = 86_400_000
const bar = (id, rowId, start, end) => ({ id, rowId, label: id, start, end })

/** A load function whose answers the test releases by hand. */
function controlledLoad() {
  const calls = []
  const load = (request, { signal }) => new Promise((resolve, reject) => {
    calls.push({ request, signal, resolve, reject })
  })
  return { calls, load }
}
const flush = async () => {
  for (let i = 0; i < 5; i++) await Promise.resolve()
  await nextTick()
}

test('setWindowedView aligns the half-open view to chunks and requests only missing cells', () => {
  const state = createWindowedDataState({ chunkSize: day })
  // [0, 1 day) is one chunk: a window that ends on a day boundary does not request the next day.
  const first = setWindowedView(state, { start: 0, end: day, rowIds: ['a', 'b'] })
  assert.equal(first.start.length, 1)
  assert.deepEqual({ ...first.start[0], requestId: undefined, key: undefined },
    { requestId: undefined, key: undefined, condition: '', start: 0, end: day, rowIds: ['a', 'b'] })
  // Moving the window by less than a chunk requests nothing new.
  const same = setWindowedView(first.state, { start: day / 4, end: day * 0.75, rowIds: ['b', 'a'] })
  assert.equal(same.start.length, 0)
  assert.equal(same.abort.length, 0)
  // A wider window requests only the next day.
  const wider = setWindowedView(same.state, { start: 0, end: 2 * day, rowIds: ['a', 'b'] })
  assert.deepEqual(wider.start.map(r => [r.start, r.end]), [[day, 2 * day]])
  // Padding widens the request before it is aligned.
  const padded = setWindowedView(createWindowedDataState({ chunkSize: day, padding: 1 }), { start: day, end: 2 * day })
  assert.deepEqual(padded.start.map(r => [r.start, r.end, r.rowIds]), [[0, 3 * day, undefined]])
})

test('windowed data validates its options and views', () => {
  assert.throws(() => createWindowedDataState({ chunkSize: 0 }), RangeError)
  assert.throws(() => createWindowedDataState({ chunkSize: 1, padding: -1 }), RangeError)
  assert.throws(() => createWindowedDataState({ chunkSize: 1, maxChunksPerRequest: 0.5 }), RangeError)
  const state = createWindowedDataState({ chunkSize: 1, maxCells: 10 })
  assert.throws(() => setWindowedView(state, { start: 2, end: 1 }), RangeError)
  assert.throws(() => setWindowedView(state, { start: 0, end: Infinity }), RangeError)
  assert.throws(() => setWindowedView(state, { start: 0, end: 20 }), /maxCells/)
  const { state: loading, start } = setWindowedView(state, { start: 0, end: 2 })
  assert.throws(() => resolveWindowedRequest(loading, start[0].requestId, [{ start: 0, end: 1 }]), { name: 'Error', message: 'Invalid windowed data item ID: undefined' })
  assert.throws(() => resolveWindowedRequest(loading, start[0].requestId, [bar('x', 'a', 0, 1), bar('x', 'a', 0, 1)]), { name: 'Error', message: 'Duplicate windowed data item ID: x (in one response)' })
  assert.throws(() => resolveWindowedRequest(loading, start[0].requestId, { nope: true }), TypeError)
})

test('fast A to B to A: superseded requests are aborted and only the latest result is applied', async () => {
  const { calls, load } = controlledLoad()
  const view = ref({ start: 0, end: day, rowIds: ['a'] })
  const scope = effectScope()
  const data = scope.run(() => useWindowedData({ view, load, chunkSize: day }))
  assert.equal(calls.length, 1)
  view.value = { start: 10 * day, end: 11 * day, rowIds: ['a'] }
  await nextTick()
  view.value = { start: 0, end: day, rowIds: ['a'] }
  await nextTick()
  assert.equal(calls.length, 3)
  // A's first request and B's request were aborted; A's second one is current.
  assert.deepEqual(calls.map(call => call.signal.aborted), [true, true, false])
  assert.equal(calls[0].request.key, calls[2].request.key)
  assert.notEqual(calls[0].request.requestId, calls[2].request.requestId)
  // The superseded answers arrive late, out of order; they are ignored.
  calls[1].resolve([bar('b1', 'a', 10 * day, 10.5 * day)])
  calls[0].resolve([bar('old', 'a', 0, day / 2)])
  await flush()
  assert.deepEqual(data.items.value, [])
  assert.equal(data.status.value, 'loading')
  calls[2].resolve([bar('new', 'a', 0, day / 2)])
  await flush()
  assert.deepEqual(data.items.value.map(item => item.id), ['new'])
  assert.equal(data.status.value, 'loaded')
  assert.equal(data.complete.value, true)
  scope.stop()
})

test('collapsing rows while their children load aborts only requests no longer needed', () => {
  let { state, start } = setWindowedView(createWindowedDataState({ chunkSize: day }), { start: 0, end: day, rowIds: ['p1', 'c1', 'p2'] })
  const first = start[0]
  // Expanding p2 shows its children c3 and c4: only they are requested.
  ;({ state, start } = setWindowedView(state, { start: 0, end: day, rowIds: ['p1', 'c1', 'p2', 'c3', 'c4'] }))
  assert.deepEqual(start.map(r => r.rowIds), [['c3', 'c4']])
  const children = start[0]
  assert.equal(windowedCellStatus(state, 0, 'c3'), 'loading')
  // Collapsing p2 while its children load aborts their request; the first request is still needed and keeps running.
  const collapsed = setWindowedView(state, { start: 0, end: day, rowIds: ['p1', 'c1', 'p2'] })
  assert.deepEqual(collapsed.abort, [children.requestId])
  assert.deepEqual(collapsed.start, [])
  assert.equal(collapsed.state.requests.has(first.requestId), true)
  assert.equal(windowedCellStatus(collapsed.state, 0, 'c3'), 'unloaded')
  assert.equal(windowedCellStatus(collapsed.state, 0, 'c1'), 'loading')
  // A late answer to the aborted request is ignored.
  const late = resolveWindowedRequest(collapsed.state, children.requestId, [bar('x', 'c3', 0, 1)])
  assert.equal(late.applied, false)
  assert.equal(late.state, collapsed.state)
  const done = resolveWindowedRequest(collapsed.state, first.requestId, [bar('y', 'c1', 0, 1)])
  assert.equal(done.applied, true)
  assert.equal(windowedCellStatus(done.state, 0, 'c1'), 'loaded')
  assert.equal(windowedCellStatus(done.state, 0, 'p2'), 'loaded-empty')
  assert.deepEqual([...done.state.items.keys()], ['y'])
  // Expanding again requests the children anew.
  assert.deepEqual(setWindowedView(done.state, { start: 0, end: day, rowIds: ['p1', 'c1', 'p2', 'c3', 'c4'] }).start.map(r => r.rowIds), [['c3', 'c4']])
})

test('a bar spanning two windows is kept once and fills both cells', () => {
  let { state, start } = setWindowedView(createWindowedDataState({ chunkSize: day }), { start: 0, end: day, rowIds: ['a'] })
  const spanning = bar('span', 'a', day / 2, 1.5 * day)
  ;({ state } = resolveWindowedRequest(state, start[0].requestId, [spanning, bar('only-first', 'a', 0, day / 4)]))
  ;({ state, start } = setWindowedView(state, { start: day, end: 2 * day, rowIds: ['a'] }))
  assert.deepEqual(start.map(r => [r.start, r.end]), [[day, 2 * day]])
  const updated = { ...spanning, label: 'updated' }
  ;({ state } = resolveWindowedRequest(state, start[0].requestId, [updated]))
  assert.deepEqual([...state.items.keys()], ['span', 'only-first'])
  assert.equal(state.items.get('span').label, 'updated')
  assert.equal(windowedCellStatus(state, day, 'a'), 'loaded')
  // A bar that ends on the day boundary does not fill the next day (half-open), a milestone on the boundary does.
  let next = setWindowedView(state, { start: 2 * day, end: 4 * day, rowIds: ['a'] })
  next = resolveWindowedRequest(next.state, next.start[0].requestId, [bar('ends', 'a', 2 * day, 3 * day), bar('m', 'a', 3 * day, 3 * day)])
  assert.equal(windowedCellStatus(next.state, 2 * day, 'a'), 'loaded')
  assert.equal(windowedCellStatus(next.state, 3 * day, 'a'), 'loaded')
  next = setWindowedView(next.state, { start: 4 * day, end: 5 * day, rowIds: ['a'] })
  next = resolveWindowedRequest(next.state, next.start[0].requestId, [bar('ends', 'a', 2 * day, 3 * day)])
  assert.equal(windowedCellStatus(next.state, 4 * day, 'a'), 'loaded-empty')
})

test('a failure keeps displayed data, stays failed until retry, and retry recovers', async () => {
  const { calls, load } = controlledLoad()
  const view = ref({ start: 0, end: day, rowIds: ['a'] })
  const scope = effectScope()
  const data = scope.run(() => useWindowedData({ view, load, chunkSize: day }))
  calls[0].resolve([bar('kept', 'a', 0, day / 2)])
  await flush()
  view.value = { start: day, end: 2 * day, rowIds: ['a'] }
  await nextTick()
  calls[1].reject(new Error('offline'))
  await flush()
  assert.equal(data.status.value, 'failed')
  assert.equal(data.error.value.error.message, 'offline')
  assert.deepEqual(data.items.value.map(item => item.id), ['kept'])
  // Scrolling back and forth does not refetch a failed cell by itself.
  view.value = { start: 0, end: 2 * day, rowIds: ['a'] }
  await nextTick()
  assert.equal(calls.length, 2)
  assert.equal(data.coverage.value.failed, 1)
  assert.equal(data.complete.value, false)
  data.retry()
  assert.equal(calls.length, 3)
  assert.deepEqual([calls[2].request.start, calls[2].request.end], [day, 2 * day])
  assert.equal(data.error.value, undefined)
  calls[2].resolve([bar('recovered', 'a', day, 1.5 * day)])
  await flush()
  assert.deepEqual(data.items.value.map(item => item.id), ['kept', 'recovered'])
  assert.equal(data.status.value, 'loaded')
  assert.equal(data.complete.value, true)
  scope.stop()
})

test('empty, unloaded, loading, loaded and failed windows are distinguishable', () => {
  let { state, start } = setWindowedView(createWindowedDataState({ chunkSize: day }), { start: 0, end: 3 * day, rowIds: ['a'] }, 'v1')
  assert.equal(start.length, 1)
  assert.equal(windowedCoverage(state, { start: 5 * day, end: 6 * day, rowIds: ['a'] }).status, 'unloaded')
  assert.equal(windowedCoverage(state).status, 'loading')
  ;({ state } = resolveWindowedRequest(state, start[0].requestId, [bar('x', 'a', day, 1.5 * day)]))
  assert.equal(windowedCoverage(state, { start: 0, end: day, rowIds: ['a'] }).status, 'loaded-empty')
  assert.equal(windowedCoverage(state, { start: 0, end: day, rowIds: ['a'] }).complete, true)
  assert.equal(windowedCoverage(state, { start: day, end: 2 * day, rowIds: ['a'] }).status, 'loaded')
  ;({ state, start } = setWindowedView(state, { start: 5 * day, end: 6 * day, rowIds: ['a'] }))
  ;({ state } = rejectWindowedRequest(state, start[0].requestId, new Error('down')))
  const failed = windowedCoverage(state, { start: 5 * day, end: 6 * day, rowIds: ['a'] })
  assert.deepEqual({ ...failed }, { status: 'failed', complete: false, total: 1, unloaded: 0, loading: 0, empty: 0, loaded: 0, failed: 1 })
  // A whole-extent coverage tells that the data is partial.
  const extent = windowedCoverage(state, { start: 0, end: 7 * day, rowIds: ['a', 'b'] })
  assert.equal(extent.complete, false)
  assert.equal(extent.total, 14)
  assert.equal(windowedCoverage(createWindowedDataState({ chunkSize: day })).status, 'unloaded')
  // retry with a window only resets failures inside it.
  assert.equal(retryWindowedData(state, { start: 0, end: day, rowIds: ['a'] }).start.length, 0)
  assert.equal(retryWindowedData(state, { start: 5 * day, end: 6 * day, rowIds: ['a'] }).start.length, 1)
})

test('a new condition aborts requests and never attaches results of the old condition', async () => {
  const { calls, load } = controlledLoad()
  const view = ref({ start: 0, end: day, rowIds: ['a'] })
  const condition = ref('filter=all')
  const scope = effectScope()
  const data = scope.run(() => useWindowedData({ view, condition, load, chunkSize: day }))
  calls[0].resolve([bar('all-1', 'a', 0, 1)])
  await flush()
  view.value = { start: day, end: 2 * day, rowIds: ['a'] }
  await nextTick()
  assert.equal(calls[1].request.condition, 'filter=all')
  condition.value = 'filter=critical'
  await nextTick()
  assert.equal(calls[1].signal.aborted, true)
  assert.equal(calls[2].request.condition, 'filter=critical')
  assert.deepEqual(data.items.value, [])
  calls[1].resolve([bar('all-2', 'a', day, day + 1)])
  await flush()
  assert.deepEqual(data.items.value, [])
  calls[2].resolve([bar('crit', 'a', day, day + 1)])
  await flush()
  assert.deepEqual(data.items.value.map(item => item.id), ['crit'])
  // The pure state does the same: a stale request ID of another condition is unknown.
  const a = setWindowedView(createWindowedDataState({ chunkSize: 1 }, 'v1'), { start: 0, end: 1 })
  const b = setWindowedView(a.state, { start: 0, end: 1 }, 'v2')
  assert.deepEqual(b.abort, [a.start[0].requestId])
  assert.equal(resolveWindowedRequest(b.state, a.start[0].requestId, [bar('x', undefined, 0, 1)]).applied, false)
  scope.stop()
})

test('invalidate keeps displayed items, cancel and reset abort everything', () => {
  let { state, start } = setWindowedView(createWindowedDataState({ chunkSize: 1 }), { start: 0, end: 2 })
  ;({ state } = resolveWindowedRequest(state, start[0].requestId, [bar('x', undefined, 0, 1)]))
  const invalidated = invalidateWindowedData(state)
  assert.equal(invalidated.start.length, 1)
  assert.equal(invalidated.state.items.size, 1)
  assert.equal(windowedCoverage(invalidated.state).status, 'loading')
  const cancelled = cancelWindowedRequests(invalidated.state)
  assert.deepEqual(cancelled.abort, [invalidated.start[0].requestId])
  assert.equal(windowedCoverage(cancelled.state).status, 'unloaded')
  assert.equal(cancelled.state.items.size, 1)
  const reset = resetWindowedData(invalidated.state)
  assert.equal(reset.state.items.size, 0)
  assert.equal(reset.abort.length, 1)
  // Transitions never mutate their input.
  assert.equal(state.items.size, 1)
  assert.equal(windowedCoverage(state).status, 'loaded')
})

test('splitDanglingLinks keeps links to missing items aside and re-attaches them when the item arrives', () => {
  const links = [{ id: 'l1', from: 'a', to: 'b' }, { id: 'l2', from: 'b', to: 'c' }, { id: 'l3', from: 'x', to: 'x' }]
  const first = splitDanglingLinks(links, new Set(['a', 'b']))
  assert.deepEqual(first.resolved.map(link => link.id), ['l1'])
  assert.deepEqual(first.dangling.map(item => [item.link.id, item.missingIds]), [['l2', ['c']], ['l3', ['x']]])
  const later = splitDanglingLinks(links, ['a', 'b', 'c'])
  assert.deepEqual(later.resolved.map(link => link.id), ['l1', 'l2'])
  const custom = splitDanglingLinks([{ source: 'a', target: 'z' }], new Map([['a', 1]]), { from: link => link.source, to: link => link.target })
  assert.deepEqual(custom.dangling[0].missingIds, ['z'])
})

test('useWindowedData splits loaded links and re-attaches them as their ends load', async () => {
  const { calls, load } = controlledLoad()
  const view = ref({ start: 0, end: 1, rowIds: ['a'] })
  const scope = effectScope()
  const data = scope.run(() => useWindowedData({ view, load, chunkSize: 1 }))
  calls[0].resolve({ items: [bar('b1', 'a', 0, 1)], links: [{ id: 'd1', from: 'b1', to: 'b2' }] })
  await flush()
  assert.deepEqual(data.resolvedLinks.value, [])
  assert.deepEqual(data.danglingLinks.value.map(item => item.missingIds), [['b2']])
  view.value = { start: 1, end: 2, rowIds: ['a'] }
  await nextTick()
  calls[1].resolve({ items: [bar('b2', 'a', 1, 2)], links: [{ id: 'd1', from: 'b1', to: 'b2' }] })
  await flush()
  assert.deepEqual(data.resolvedLinks.value.map(link => link.id), ['d1'])
  assert.deepEqual(data.danglingLinks.value, [])
  assert.equal(data.links.value.length, 1)
  scope.stop()
})

test('graph expansion merges neighbour pages of a cyclic graph without duplicates', () => {
  // a → b → c → a, plus c → d.
  const node = id => ({ id, label: id })
  const edge = (from, to) => ({ id: from + to, from, to })
  let state = createGraphExpansion({ nodes: [node('a')] })
  assert.deepEqual(graphExpansionView(state).frontierIds, ['a'])
  state = beginGraphExpansion(state, ['a'])
  assert.deepEqual(graphExpansionView(state).frontierIds, [])
  state = mergeGraphExpansionPage(state, { nodes: [node('a'), node('b'), node('c')], edges: [edge('a', 'b'), edge('c', 'a'), edge('b', 'c'), edge('c', 'd')] }, ['a'])
  let view = graphExpansionView(state)
  assert.deepEqual(view.nodes.map(n => n.id), ['a', 'b', 'c'])
  assert.deepEqual(view.edges.map(e => e.id), ['ab', 'ca', 'bc'])
  assert.deepEqual(view.dangling.map(item => [item.link.id, item.missingIds]), [['cd', ['d']]])
  assert.deepEqual(view.frontierIds, ['b', 'c'])
  // Expanding c through the cycle returns a, b and c again.
  state = mergeGraphExpansionPage(state, { nodes: [node('c'), node('a'), node('b'), node('d')], edges: [edge('b', 'c'), edge('c', 'a'), edge('c', 'd')] }, ['c'])
  view = graphExpansionView(state)
  assert.deepEqual(view.nodes.map(n => n.id), ['a', 'b', 'c', 'd'])
  assert.deepEqual(view.edges.map(e => e.id), ['ab', 'ca', 'bc', 'cd'])
  assert.deepEqual(view.dangling, [])
  assert.deepEqual(view.frontierIds, ['b', 'd'])
  assert.deepEqual([...state.expandedIds], ['a', 'c'])
  const cancelled = cancelGraphExpansion(beginGraphExpansion(state, ['b']), ['b'])
  assert.deepEqual(graphExpansionView(cancelled).frontierIds, ['b', 'd'])
  assert.throws(() => mergeGraphExpansionPage(state, { nodes: [node('x'), node('x')] }), /Duplicate node ID/)
  assert.throws(() => mergeGraphExpansionPage(state, { edges: [{ id: '', from: 'a', to: 'b' }] }), /non-empty/)
})

test('GanttChart server markup is unchanged with a visible-window-change listener, and nothing is emitted or requested during SSR', async () => {
  const rows = [{ id: 'r1', label: 'Row 1' }, { id: 'r2', label: 'Row 2' }]
  const bars = [bar('b1', 'r1', 0, 3_600_000)]
  const range = { start: 0, end: 86_400_000 }
  const plain = await renderComponent(GanttChart, { rows, bars, range })
  const windows = []
  let loads = 0
  const listened = await renderToString(createSSRApp({
    setup() {
      const view = ref()
      useWindowedData({ view, chunkSize: day, load: () => { loads++; return [] } })
      return () => h(GanttChart, { rows, bars, range, visibleWindowDelay: 0, onVisibleWindowChange: value => { windows.push(value); view.value = value } })
    },
  }))
  assert.equal(listened, plain)
  await new Promise(resolve => setTimeout(resolve, 20))
  assert.deepEqual(windows, [])
  assert.equal(loads, 0)
})

/** Mounts `setup` in a minimal client app without a DOM, so `onMounted` and unmounting run as in a component. */
function mountHeadless(setup) {
  const node = () => ({})
  const { createApp } = createRenderer({
    insert() {}, remove() {}, createElement: node, createText: node, createComment: node, setText() {}, setElementText() {},
    parentNode: () => null, nextSibling: () => null, patchProp() {},
  })
  let result
  const app = createApp({ setup() { result = setup(); return () => null } })
  app.mount({})
  return { result, unmount: () => app.unmount() }
}

test('a new condition with an oversized view aborts the old requests first and never attaches their late answers', async () => {
  const { calls, load } = controlledLoad()
  const view = ref({ start: 0, end: day, rowIds: ['a'] })
  const condition = ref('plant=A')
  const scope = effectScope()
  const data = scope.run(() => useWindowedData({ view, condition, load, chunkSize: day, maxCells: 10 }))
  calls[0].resolve([bar('a-loaded', 'a', 0, 1)])
  await flush()
  view.value = { start: day, end: 2 * day, rowIds: ['a'] }
  await nextTick()
  assert.equal(calls.length, 2)
  // The condition and an oversized view change together, while A's second request is in flight.
  condition.value = 'plant=B'
  view.value = { start: 0, end: 100 * day, rowIds: ['a'] }
  await nextTick()
  assert.equal(calls[1].signal.aborted, true)
  assert.equal(calls.length, 2)
  assert.equal(data.state.value.condition, 'plant=B')
  assert.equal(data.state.value.view, undefined)
  assert.deepEqual(data.items.value, [])
  assert.equal(data.pending.value, false)
  assert.equal(data.status.value, 'unloaded')
  assert.equal(data.complete.value, false)
  assert.ok(data.error.value.error instanceof RangeError)
  assert.match(data.error.value.error.message, /maxCells/)
  assert.equal(data.error.value.request, undefined)
  // A's answer arrives anyway (the application ignored the abort): it is discarded.
  calls[1].resolve([bar('a-only', 'a', day, day + 1)])
  await flush()
  assert.deepEqual(data.items.value, [])
  assert.equal(data.complete.value, false)
  assert.equal(data.state.value.cells.size, 0)
  // A valid view clears the view error and loads B.
  view.value = { start: 0, end: day, rowIds: ['a'] }
  await nextTick()
  assert.equal(data.error.value, undefined)
  assert.equal(calls[2].request.condition, 'plant=B')
  calls[2].resolve([bar('b1', 'a', 0, 1)])
  await flush()
  assert.deepEqual(data.items.value.map(item => item.id), ['b1'])
  assert.equal(data.complete.value, true)
  scope.stop()
})

test('the core state machine throws for an invalid view without changing anything, and matches answers by request and condition', () => {
  const a = setWindowedView(createWindowedDataState({ chunkSize: 1, maxCells: 4 }, 'A'), { start: 0, end: 2 })
  assert.throws(() => setWindowedView(a.state, { start: 0, end: 50 }, 'B'), RangeError)
  assert.throws(() => setWindowedView(a.state, null, 'B'), TypeError)
  assert.equal(a.state.condition, 'A')
  assert.equal(a.state.requests.size, 1)
  // Switching the condition first, without a view, never throws for a string condition and drops everything.
  const b = setWindowedView(a.state, undefined, 'B')
  assert.deepEqual(b.abort, [a.start[0].requestId])
  assert.deepEqual(b.start, [])
  assert.equal(b.state.condition, 'B')
  assert.equal(b.state.requests.size, 0)
  assert.equal(b.state.cells.size, 0)
  assert.throws(() => setWindowedView(b.state, { start: 0, end: 50 }), RangeError)
  assert.equal(resolveWindowedRequest(b.state, a.start[0].requestId, [bar('x', undefined, 0, 1)]).applied, false)
  assert.equal(rejectWindowedRequest(b.state, a.start[0].requestId, new Error('late')).applied, false)
  // A request of another condition in a state assembled by hand is neither applied nor kept.
  const forged = { ...a.state, condition: 'B' }
  const ignored = resolveWindowedRequest(forged, a.start[0].requestId, [bar('x', undefined, 0, 1)])
  assert.equal(ignored.applied, false)
  assert.equal(ignored.state, forged)
  assert.equal(rejectWindowedRequest(forged, a.start[0].requestId, new Error('x')).applied, false)
  assert.deepEqual(setWindowedView(forged, { start: 0, end: 2 }).abort, [a.start[0].requestId])
})

test('a response whose merge throws half-way merges nothing and fails only its own cells', async () => {
  let { state, start } = setWindowedView(createWindowedDataState({
    chunkSize: 1, itemRow: item => { if (item.bad) throw new Error('bad row'); return item.rowId },
  }), { start: 0, end: 2, rowIds: ['a'] })
  ;({ state } = resolveWindowedRequest(state, start[0].requestId, [bar('kept', 'a', 0, 1)]))
  ;({ state, start } = setWindowedView(state, { start: 0, end: 3, rowIds: ['a'] }))
  for (const response of [[bar('n1', 'a', 2, 3), { ...bar('n2', 'a', 2, 3), bad: true }], [bar('n1', 'a', 2, 3), bar('n1', 'a', 2, 3)], { items: [bar('n1', 'a', 2, 3)], links: [{ id: '' }] }, 42]) {
    assert.throws(() => resolveWindowedRequest(state, start[0].requestId, response))
  }
  assert.deepEqual([...state.items.keys()], ['kept'])
  assert.equal(windowedCellStatus(state, 2, 'a'), 'loading')
  // Through the composable the throw becomes a failure of that request; nothing of the response is merged.
  const { calls, load } = controlledLoad()
  const view = ref({ start: 0, end: 1, rowIds: ['a'] })
  const scope = effectScope()
  const data = scope.run(() => useWindowedData({ view, load, chunkSize: 1 }))
  calls[0].resolve([bar('kept', 'a', 0, 1)])
  await flush()
  view.value = { start: 0, end: 2, rowIds: ['a'] }
  await nextTick()
  calls[1].resolve([bar('n1', 'a', 1, 2), bar('n1', 'a', 1, 2)])
  await flush()
  assert.deepEqual(data.items.value.map(item => item.id), ['kept'])
  assert.equal(windowedCellStatus(data.state.value, 1, 'a'), 'failed')
  assert.equal(windowedCellStatus(data.state.value, 0, 'a'), 'loaded')
  assert.match(data.error.value.error.message, /Duplicate windowed data item ID: n1/)
  assert.equal(data.error.value.request.requestId, calls[1].request.requestId)
  assert.equal(data.pending.value, false)
  scope.stop()
})

test('a load that throws synchronously during a condition change fails the new request and keeps nothing of the old condition', async () => {
  const calls = []
  const load = (request, { signal }) => {
    if (request.condition === 'B') throw new Error('sync failure')
    return new Promise((resolve, reject) => calls.push({ request, signal, resolve, reject }))
  }
  const view = ref({ start: 0, end: 1 })
  const condition = ref('A')
  const scope = effectScope()
  const data = scope.run(() => useWindowedData({ view, condition, load, chunkSize: 1 }))
  calls[0].resolve([bar('a0', undefined, 0, 1)])
  await flush()
  view.value = { start: 0, end: 2 }
  await nextTick()
  condition.value = 'B'
  await flush()
  assert.equal(calls[1].signal.aborted, true)
  assert.deepEqual(data.items.value, [])
  assert.equal(data.status.value, 'failed')
  assert.equal(data.complete.value, false)
  assert.equal(data.pending.value, false)
  assert.equal(data.error.value.error.message, 'sync failure')
  assert.equal(data.error.value.request.condition, 'B')
  calls[1].resolve([bar('a1', undefined, 1, 2)])
  await flush()
  assert.deepEqual(data.items.value, [])
  scope.stop()
})

test('an invalid view of the same condition aborts what is in flight, keeps loaded data and clears once the view is valid', async () => {
  const { calls, load } = controlledLoad()
  const view = ref({ start: 0, end: 1 })
  const scope = effectScope()
  const data = scope.run(() => useWindowedData({ view, load, chunkSize: 1, maxCells: 5 }))
  calls[0].resolve([bar('k', undefined, 0, 1)])
  await flush()
  view.value = { start: 0, end: 3 }
  await nextTick()
  view.value = { start: 0, end: 50 }
  await nextTick()
  assert.equal(calls[1].signal.aborted, true)
  assert.deepEqual(data.items.value.map(item => item.id), ['k'])
  assert.equal(data.complete.value, false)
  assert.equal(data.pending.value, false)
  assert.equal(windowedCellStatus(data.state.value, 1), 'unloaded')
  assert.ok(data.error.value.error instanceof RangeError)
  for (const invalid of [{ start: 2, end: 1 }, { start: 0, end: Infinity }, null]) {
    view.value = invalid
    await nextTick()
    assert.equal(data.error.value.request, undefined)
    assert.equal(data.state.value.view, undefined)
  }
  // retry and invalidate keep a view error while the view stays invalid and request nothing.
  data.retry()
  data.invalidate()
  assert.ok(data.error.value)
  assert.equal(calls.length, 2)
  calls[1].resolve([bar('late', undefined, 1, 2)])
  await flush()
  assert.deepEqual(data.items.value.map(item => item.id), ['k'])
  view.value = { start: 0, end: 3 }
  await nextTick()
  assert.equal(data.error.value, undefined)
  // invalidate made every cell unloaded (the items stayed), so the whole view is requested again.
  assert.deepEqual([calls[2].request.start, calls[2].request.end], [0, 3])
  assert.deepEqual(data.items.value.map(item => item.id), ['k'])
  scope.stop()
})

test('retry, invalidate, cancel and dispose racing with answers in flight never attach a superseded answer', async () => {
  const { calls, load } = controlledLoad()
  const view = ref({ start: 0, end: 1 })
  const condition = ref('A')
  const scope = effectScope()
  const data = scope.run(() => useWindowedData({ view, condition, load, chunkSize: 1 }))
  // invalidate aborts the request in flight and requests again; the first answer is ignored.
  data.invalidate()
  assert.deepEqual(calls.map(call => call.signal.aborted), [true, false])
  calls[0].resolve([bar('stale', undefined, 0, 1)])
  calls[1].resolve([bar('fresh', undefined, 0, 1)])
  await flush()
  assert.deepEqual(data.items.value.map(item => item.id), ['fresh'])
  // A rejection after an abort is not an error.
  view.value = { start: 1, end: 2 }
  await nextTick()
  data.cancel()
  assert.equal(calls[2].signal.aborted, true)
  calls[2].reject(new DOMException('aborted', 'AbortError'))
  await flush()
  assert.equal(data.error.value, undefined)
  assert.equal(data.status.value, 'unloaded')
  // retry right after a condition change, before the watcher ran, requests only the new condition.
  condition.value = 'B'
  data.retry()
  await nextTick()
  assert.deepEqual(calls.slice(3).map(call => call.request.condition), ['B'])
  // A failure, then retry: the late failure of the superseded request does not come back.
  calls[3].reject(new Error('down'))
  await flush()
  assert.equal(data.error.value.error.message, 'down')
  data.retry()
  assert.equal(data.error.value, undefined)
  // dispose aborts everything and ignores every later answer.
  data.dispose()
  assert.equal(calls[4].signal.aborted, true)
  calls[4].resolve([bar('after', undefined, 1, 2)])
  await flush()
  assert.deepEqual(data.items.value, [])
  data.retry()
  data.invalidate()
  view.value = { start: 5, end: 6 }
  await nextTick()
  assert.equal(calls.length, 5)
  scope.stop()
})

test('unmounting the owning component aborts requests in flight and ignores their answers', async () => {
  const { calls, load } = controlledLoad()
  const view = ref({ start: 0, end: 2 })
  const { result: data, unmount } = mountHeadless(() => useWindowedData({ view, load, chunkSize: 1, maxChunksPerRequest: 1 }))
  assert.equal(calls.length, 2)
  calls[0].resolve([bar('first', undefined, 0, 1)])
  await flush()
  unmount()
  assert.deepEqual(calls.map(call => call.signal.aborted), [false, true])
  calls[1].resolve([bar('late', undefined, 1, 2)])
  calls[1].reject(new Error('late'))
  await flush()
  assert.deepEqual(data.items.value.map(item => item.id), ['first'])
  assert.equal(data.error.value, undefined)
  view.value = { start: 3, end: 4 }
  await nextTick()
  assert.equal(calls.length, 2)
})

test('random interleavings keep the windowed data consistent with the current condition', async () => {
  const rowsPool = ['a', 'b', 'c', 'd']
  const conditions = ['A', 'B', 'C']
  const runs = 150
  const steps = 40
  for (let seed = 1; seed <= runs; seed++) {
    const { random, pick } = seededRandom(seed)
    const calls = []
    let throwNext = false
    const load = (request, { signal }) => {
      if (throwNext) {
        throwNext = false
        calls.push({ request, signal, settled: true })
        throw new Error('sync')
      }
      return new Promise((resolve, reject) => calls.push({ request, signal, resolve, reject, settled: false }))
    }
    const randomView = () => {
      if (random() < 0.1) return { start: 3, end: 1 }
      const start = pick(6)
      const rows = rowsPool.filter(() => random() < 0.6)
      return { start, end: start + pick(4), rowIds: rows.length ? rows : ['a'] }
    }
    const view = ref(randomView())
    const condition = ref(conditions[pick(3)])
    const scope = effectScope()
    const data = scope.run(() => useWindowedData({ view, condition, load, chunkSize: 1, maxCells: 12 }))
    const answer = (request) => {
      const items = []
      for (const row of request.rowIds ?? []) {
        if (random() < 0.5) continue
        const at = request.start + pick(request.end - request.start)
        items.push({ id: `${request.condition}-${row}-${at}`, rowId: row, start: at, end: at + 1, condition: request.condition })
      }
      if (items.length && random() < 0.1) items.push(items[0])
      return items
    }
    const open = () => calls.filter(call => !call.settled)
    for (let step = 0; step < steps; step++) {
      const action = pick(10)
      const context = `seed ${seed}, step ${step}, action ${action}`
      if (action === 0) view.value = randomView()
      else if (action === 1) condition.value = conditions[pick(3)]
      else if (action === 2) {
        // The reported case: a new condition and an oversized view at once.
        condition.value = conditions[pick(3)]
        view.value = { start: 0, end: 20, rowIds: rowsPool }
      } else if (action === 3 || action === 4) {
        const candidates = open()
        if (candidates.length) {
          const call = candidates[pick(candidates.length)]
          call.settled = true
          call.resolve(answer(call.request))
        }
      } else if (action === 5) {
        const candidates = open()
        if (candidates.length) {
          const call = candidates[pick(candidates.length)]
          call.settled = true
          call.reject(new Error('down'))
        }
      } else if (action === 6) {
        throwNext = random() < 0.3
        data.retry()
      } else if (action === 7) data.invalidate()
      else if (action === 8) data.cancel()
      else throwNext = true
      await flush()
      const state = data.state.value
      assert.equal(state.condition, condition.value, context)
      for (const item of data.items.value) assert.equal(item.condition, state.condition, context)
      for (const [id, request] of state.requests) {
        assert.equal(request.condition, state.condition, context)
        const call = calls.find(c => c.request.requestId === id)
        assert.ok(call && !call.signal.aborted, context)
      }
      for (const cell of state.cells.values()) {
        if (cell.status === 'loading') assert.ok(state.requests.has(cell.requestId), context)
      }
      for (const call of calls) {
        if (!call.settled && !state.requests.has(call.request.requestId)) assert.equal(call.signal.aborted, true, context)
      }
      if (data.error.value?.request) assert.equal(data.error.value.request.condition, state.condition, context)
      if (data.complete.value) {
        const current = state.view
        assert.ok(current, context)
        const first = Math.floor(current.start)
        const last = current.end > current.start ? Math.ceil(current.end) - 1 : first
        for (let chunk = first; chunk <= last; chunk++) {
          for (const row of current.rowIds) {
            assert.ok(['loaded', 'loaded-empty'].includes(windowedCellStatus(state, chunk, row)), context)
          }
        }
      }
      assert.equal(data.pending.value, state.requests.size > 0, context)
    }
    scope.stop()
    for (const call of calls) if (!call.settled) assert.equal(call.signal.aborted, true)
  }
})
