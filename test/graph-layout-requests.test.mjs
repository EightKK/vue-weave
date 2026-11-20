import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSSRApp, defineComponent, h, nextTick, shallowRef } from 'vue'
import { renderToString } from 'vue/server-renderer'
import {
  buildGraphLayoutRequests, collapseGraphGroups, graphLayoutFromJson, graphLayoutInputKey, graphLayoutMessageFromJson, graphLayoutMessageToJson,
  graphLayoutToJson, layoutLayeredGraph, parseGraphLayoutMessage, validateGraphLayoutResponse,
} from 'vue-weave/core'
import { NetworkGraph, graphLayoutWorkerAdapter, useAsyncGraphLayout } from 'vue-weave'

const nodes = [
  { id: 'a', label: 'A', ports: [{ id: 'out', side: 'right' }] },
  { id: 'b', label: 'B' },
  { id: 'c', label: 'C' },
  { id: 'd', label: 'D' },
]
const edges = [
  { id: 'ab', from: 'a', to: 'b', fromPort: 'out' },
  { id: 'bc', from: 'b', to: 'c' },
  { id: 'cd', from: 'c', to: 'd' },
]
const groups = [{ id: 'g', label: 'Group', nodeIds: ['b', 'c'] }]
const key = input => graphLayoutInputKey({ scope: 'shown', nodes, edges, ...input })

// A promise the test resolves or rejects by hand, to control the order of responses.
function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
// An adapter that records each request and waits for the test to answer it.
function manualAdapter() {
  const calls = []
  const adapter = (request, signal) => {
    const call = { request, signal, ...deferred() }
    calls.push(call)
    return call.promise
  }
  return { calls, adapter }
}
const layeredLayout = (shownNodes, shownEdges) => layoutLayeredGraph(shownNodes, shownEdges)
const layoutFor = request => layoutLayeredGraph(request.nodes, request.edges, { direction: request.direction })
const settle = async () => {
  for (let i = 0; i < 5; i++) await nextTick()
}

test('graphLayoutInputKey changes with edges, ports, sizes and positions while node IDs stay the same (R02)', () => {
  const base = key()
  assert.equal(key(), base)
  const variants = {
    edges: key({ edges: [...edges, { id: 'ad', from: 'a', to: 'd' }] }),
    edgeEnds: key({ edges: edges.map(edge => edge.id === 'cd' ? { ...edge, from: 'b' } : edge) }),
    ports: key({ nodes: nodes.map(node => node.id === 'a' ? { ...node, ports: [{ id: 'out', side: 'bottom' }] } : node) }),
    portOffset: key({ nodes: nodes.map(node => node.id === 'a' ? { ...node, ports: [{ id: 'out', side: 'right', offset: 0.2 }] } : node) }),
    sizes: key({ sizes: new Map([['a', { width: 200, height: 80 }]]) }),
    positions: key({ positions: new Map([['b', { x: 10, y: 20 }]]) }),
    label: key({ nodes: nodes.map(node => node.id === 'b' ? { ...node, label: 'Longer label' } : node) }),
    order: key({ nodes: [nodes[1], nodes[0], nodes[2], nodes[3]] }),
    direction: key({ direction: 'TB' }),
    revision: key({ revision: '2' }),
    settings: key({ settings: { spacing: 3 } }),
    scope: graphLayoutInputKey({ scope: 'expanded', nodes, edges }),
  }
  for (const [name, value] of Object.entries(variants)) assert.notEqual(value, base, name)
  assert.equal(new Set(Object.values(variants)).size, Object.keys(variants).length)
  // Map order and node data do not matter.
  assert.equal(
    key({ positions: new Map([['a', { x: 1, y: 2 }], ['b', { x: 3, y: 4 }]]) }),
    key({ positions: new Map([['b', { x: 3, y: 4 }], ['a', { x: 1, y: 2 }]]) }),
  )
  assert.equal(key({ nodes: nodes.map(node => ({ ...node, data: { anything: true } })) }), base)
  assert.throws(() => key({ direction: 'XY' }), RangeError)
  assert.throws(() => graphLayoutInputKey({ scope: 'other', nodes, edges }), RangeError)
  assert.throws(() => key({ settings: { big: 1n } }), RangeError)
})

test('buildGraphLayoutRequests makes one shown request without collapsed groups', () => {
  const requests = buildGraphLayoutRequests({ nodes, edges, groups, collapsedGroupIds: ['missing'] }, '7')
  assert.equal(requests.expanded, undefined)
  assert.equal(requests.collapse, undefined)
  assert.equal(requests.shown.requestId, '7:shown')
  assert.equal(requests.shown.nodes, nodes)
  assert.equal(requests.shown.edges, edges)
  assert.equal(requests.shown.direction, 'LR')
  assert.equal(requests.shown.inputKey, graphLayoutInputKey({ scope: 'shown', nodes, edges, groups }))
  assert.throws(() => buildGraphLayoutRequests({ nodes, edges }, ''), { name: 'Error', message: 'Invalid graph layout request ID: ""' })
})

test('buildGraphLayoutRequests reproduces the expanded and shown layout calls of NetworkGraph', async () => {
  const labels = { collapsedNode: 'item', collapsedNodes: 'items' }
  const positions = new Map([['b', { x: 300, y: 40 }]])
  const collapsedGroupIds = new Set(['g', 'deleted-group'])
  const requests = buildGraphLayoutRequests({ nodes, edges, groups, collapsedGroupIds, labels, positions }, 'r1')
  assert.ok(requests.expanded)
  assert.equal(requests.expanded.requestId, 'r1:expanded')
  assert.equal(requests.expanded.nodes, nodes)
  assert.deepEqual(requests.collapse, collapseGraphGroups(nodes, edges, groups, ['g'], { detail: group => group.nodeIds.length + ' items' }))
  assert.equal(requests.shown.nodes.find(node => node.id === 'g').detail, '2 items')
  assert.notEqual(requests.shown.inputKey, requests.expanded.inputKey)
  // The same input with only known collapsed IDs gives the same keys.
  const known = buildGraphLayoutRequests({ nodes, edges, groups, collapsedGroupIds: ['g'], labels, positions }, 'r2')
  assert.equal(known.shown.inputKey, requests.shown.inputKey)
  assert.equal(known.expanded.inputKey, requests.expanded.inputKey)
  // NetworkGraph calls its layout function with the same nodes and edges.
  const calls = []
  const layout = (shownNodes, shownEdges) => {
    calls.push({ nodes: shownNodes, edges: shownEdges })
    return layoutLayeredGraph(shownNodes, shownEdges)
  }
  await renderToString(createSSRApp({
    render: () => h(NetworkGraph, { nodes, edges, groups, collapsedGroupIds, positions, labels, layout }),
  }))
  const shownCall = calls.find(call => call.nodes.some(node => node.id === 'g'))
  const expandedCall = calls.find(call => call.nodes === nodes)
  assert.ok(shownCall && expandedCall)
  assert.deepEqual(shownCall.nodes, requests.shown.nodes)
  assert.deepEqual(shownCall.edges, requests.shown.edges)
  assert.equal(graphLayoutInputKey({
    scope: 'shown', nodes: shownCall.nodes, edges: shownCall.edges, groups: requests.shown.groups, collapsedGroupIds: ['g'], positions,
  }), requests.shown.inputKey)
})

test('validateGraphLayoutResponse checks boxes for expanded and boxes, paths and sizes for shown', () => {
  const { shown, expanded } = buildGraphLayoutRequests({ nodes, edges, groups, collapsedGroupIds: ['g'] }, '1')
  const respond = (request, layout) => ({ requestId: request.requestId, inputKey: request.inputKey, scope: request.scope, layout })
  const full = layoutFor(expanded)
  // The expanded scope needs boxes only.
  const boxesOnly = { boxes: full.boxes, paths: new Map(), edgeLabels: new Map(), width: Number.NaN, height: 0 }
  assert.equal(validateGraphLayoutResponse(expanded, respond(expanded, boxesOnly)), boxesOnly)
  const shownLayout = layoutFor(shown)
  assert.equal(validateGraphLayoutResponse(shown, respond(shown, shownLayout)), shownLayout)
  assert.throws(() => validateGraphLayoutResponse(shown, { ...respond(shown, shownLayout), requestId: 'old:shown' }), /does not answer/)
  assert.throws(() => validateGraphLayoutResponse(shown, { ...respond(shown, shownLayout), inputKey: 'stale' }), /does not answer/)
  assert.throws(() => validateGraphLayoutResponse(shown, respond(expanded, shownLayout)), /does not answer/)
  const without = (map, id) => new Map([...map].filter(([key]) => key !== id))
  assert.throws(() => validateGraphLayoutResponse(shown, respond(shown, { ...shownLayout, paths: without(shownLayout.paths, 'ab') })), /Missing layout path: ab/)
  assert.throws(() => validateGraphLayoutResponse(shown, respond(shown, { ...shownLayout, boxes: without(shownLayout.boxes, 'g') })), /Missing layout box: g/)
  assert.throws(() => validateGraphLayoutResponse(shown, respond(shown, { ...shownLayout, width: Infinity })), RangeError)
  const badBox = new Map(shownLayout.boxes).set('a', { ...shownLayout.boxes.get('a'), width: 0 })
  assert.throws(() => validateGraphLayoutResponse(shown, respond(shown, { ...shownLayout, boxes: badBox })), RangeError)
  const routes = new Map([['ab', { start: { x: 0, y: 0 }, end: { x: 1, y: 1 }, fromPort: 'other' }]])
  assert.throws(() => validateGraphLayoutResponse(shown, respond(shown, { ...shownLayout, routes })), /Route ports/)
  const nanRoute = new Map([['ab', { start: { x: Number.NaN, y: 0 }, end: { x: 1, y: 1 }, fromPort: 'out' }]])
  assert.throws(() => validateGraphLayoutResponse(shown, respond(shown, { ...shownLayout, routes: nanRoute })), RangeError)
})

test('layouts and worker messages survive the JSON transport and are checked separately from structured clone', () => {
  const layout = {
    ...layoutLayeredGraph(nodes, edges),
    routes: new Map([['ab', { start: { x: 164, y: 49 }, end: { x: 214, y: 49 }, fromPort: 'out', fromSide: 'right', toSide: 'left', points: [] }]]),
  }
  const json = JSON.parse(JSON.stringify(graphLayoutToJson(layout)))
  assert.deepEqual(graphLayoutFromJson(json), layout)
  assert.equal('routes' in graphLayoutFromJson(graphLayoutToJson(layoutLayeredGraph(nodes, edges))), false)
  assert.throws(() => graphLayoutFromJson({ ...json, boxes: { a: {} } }), /boxes must be an array/)
  assert.throws(() => graphLayoutFromJson({ ...json, paths: [['ab', 3]] }), /path ab/)

  const { shown } = buildGraphLayoutRequests({ nodes, edges, positions: new Map([['a', { x: 1, y: 2 }]]), sizes: new Map([['b', { width: 90, height: 40 }]]) }, '3')
  const messages = [
    { type: 'request', request: shown },
    { type: 'cancel', requestId: shown.requestId, inputKey: shown.inputKey },
    { type: 'success', requestId: shown.requestId, inputKey: shown.inputKey, scope: 'shown', layout },
    { type: 'failure', requestId: shown.requestId, inputKey: shown.inputKey, scope: 'shown', message: 'engine failed' },
  ]
  for (const message of messages) {
    const text = JSON.stringify(graphLayoutMessageToJson(message))
    assert.deepEqual(graphLayoutMessageFromJson(JSON.parse(text)), message, message.type)
    assert.equal(parseGraphLayoutMessage(message), message)
  }
  // Without a Map conversion, JSON loses the Maps; both readers reject the wrong form.
  const lossy = JSON.parse(JSON.stringify(messages[2]))
  assert.throws(() => graphLayoutMessageFromJson(lossy), /Invalid graph layout message/)
  assert.throws(() => parseGraphLayoutMessage(graphLayoutMessageToJson(messages[2])), /Map/)
  assert.throws(() => parseGraphLayoutMessage({ ...messages[0], request: { ...shown, positions: [['a', { x: 1, y: 2 }]] } }), /positions must be a Map/)
  assert.throws(() => graphLayoutMessageFromJson({ type: 'cancel', requestId: '1' }), /inputKey/)
  assert.throws(() => graphLayoutMessageFromJson({ type: 'cancel', inputKey: 'k' }), /requestId/)
  assert.throws(() => parseGraphLayoutMessage({ type: 'progress', requestId: '1', inputKey: 'k' }), /unknown type/)
})

test('useAsyncGraphLayout keeps the latest request when responses arrive out of order (R01)', async () => {
  const { calls, adapter } = manualAdapter()
  const input = shallowRef({ nodes, edges })
  const graph = useAsyncGraphLayout({ input, adapter })
  const callback = graph.layout
  assert.equal(graph.display.value, undefined)
  assert.equal(graph.pending.value, true)
  assert.throws(() => graph.layout(nodes, edges), /No graph layout is ready/)
  const nextEdges = [...edges, { id: 'ad', from: 'a', to: 'd' }]
  input.value = { nodes, edges: nextEdges }
  await settle()
  assert.equal(calls.length, 2)
  const [a, b] = calls
  assert.equal(a.signal.aborted, true)
  assert.equal(graph.desired.value.edges, nextEdges)
  b.resolve(layoutFor(b.request))
  await settle()
  assert.equal(graph.display.value.edges, nextEdges)
  assert.equal(graph.display.value.source, 'layout')
  assert.equal(graph.pending.value, false)
  const shownB = graph.display.value.layouts.shown
  a.resolve(layoutFor(a.request))
  await settle()
  assert.equal(graph.display.value.layouts.shown, shownB)
  assert.equal(graph.display.value.edges, nextEdges)
  // The callback keeps its identity and returns the display frame's layout.
  assert.equal(graph.layout, callback)
  assert.equal(graph.layout(graph.display.value.nodes, graph.display.value.edges), shownB)
  graph.dispose()
})

test('useAsyncGraphLayout rejects the old geometry after ports, sizes or edges change with the same node IDs (R02)', async () => {
  const { calls, adapter } = manualAdapter()
  const sizes = new Map([['a', { width: 100, height: 50 }]])
  const input = shallowRef({ nodes, edges, sizes })
  const graph = useAsyncGraphLayout({ input, adapter, provisional: false })
  calls[0].resolve(layoutFor(calls[0].request))
  await settle()
  const first = graph.display.value
  const changes = [
    { nodes: nodes.map(node => node.id === 'a' ? { ...node, ports: [{ id: 'out', side: 'bottom' }] } : node), edges, sizes },
    { nodes, edges, sizes: new Map([['a', { width: 120, height: 50 }]]) },
    { nodes, edges: edges.map(edge => edge.id === 'cd' ? { ...edge, to: 'a' } : edge), sizes },
  ]
  for (const change of changes) {
    // A request for the new input starts, then the answer for an older input arrives late.
    const before = calls.length
    input.value = { nodes, edges, sizes: new Map([['a', { width: 101, height: 50 }]]) }
    await settle()
    const old = calls[before]
    input.value = change
    await settle()
    const current = calls[before + 1]
    assert.notEqual(current.request.inputKey, old.request.inputKey)
    assert.equal(old.signal.aborted, true)
    old.resolve(layoutFor(old.request))
    await settle()
    assert.equal(graph.display.value, first, 'the old geometry is not shown')
    assert.equal(graph.desired.value.nodes, change.nodes)
    current.reject(new Error('skip'))
    await settle()
  }
  graph.dispose()
})

test('useAsyncGraphLayout shows a collapse change only when both scopes are ready (R03)', async () => {
  const { calls, adapter } = manualAdapter()
  const input = shallowRef({ nodes, edges, groups, collapsedGroupIds: new Set() })
  const graph = useAsyncGraphLayout({ input, adapter })
  calls[0].resolve(layoutFor(calls[0].request))
  await settle()
  const expandedFrame = graph.display.value
  input.value = { nodes, edges, groups, collapsedGroupIds: new Set(['g']) }
  await settle()
  const collapseCalls = calls.slice(1)
  assert.deepEqual(collapseCalls.map(call => call.request.scope).sort(), ['expanded', 'shown'])
  // The proxy has no box in the displayed layout, so no provisional frame is shown.
  assert.equal(graph.display.value, expandedFrame)
  collapseCalls.find(call => call.request.scope === 'shown').resolve(layoutFor(collapseCalls.find(call => call.request.scope === 'shown').request))
  await settle()
  assert.equal(graph.display.value, expandedFrame, 'one scope is not enough')
  // Expanding again before the second scope answers: the cached expanded layout answers at once.
  input.value = { nodes, edges, groups, collapsedGroupIds: new Set() }
  await settle()
  assert.equal(graph.display.value.collapsedGroupIds.size, 0)
  assert.equal(graph.pending.value, false)
  assert.equal(collapseCalls.find(call => call.request.scope === 'expanded').signal.aborted, true)
  // Collapse again: the shown layout is cached, the expanded one is requested again.
  input.value = { nodes, edges, groups, collapsedGroupIds: new Set(['g']) }
  await settle()
  const again = calls.at(-1)
  assert.equal(again.request.scope, 'expanded')
  again.resolve(layoutFor(again.request))
  await settle()
  const frame = graph.display.value
  assert.deepEqual([...frame.collapsedGroupIds], ['g'])
  for (const node of buildGraphLayoutRequests({ nodes, edges, groups, collapsedGroupIds: ['g'] }, 'x').shown.nodes) {
    assert.ok(frame.layouts.shown.boxes.has(node.id), node.id)
  }
  for (const node of nodes) assert.ok(frame.layouts.expanded.boxes.has(node.id))
  // The callback tells the two calls NetworkGraph makes apart.
  assert.equal(graph.layout(frame.nodes, frame.edges), frame.layouts.expanded)
  const view = collapseGraphGroups(nodes, edges, groups, ['g'])
  assert.equal(graph.layout(view.nodes, view.edges), frame.layouts.shown)
  assert.throws(() => graph.layout([...view.nodes, { id: 'z', label: 'Z' }], view.edges), /node: z/)
  graph.dispose()
})

test('useAsyncGraphLayout keeps the last display on error, defers during gestures and ignores results after dispose', async () => {
  const { calls, adapter } = manualAdapter()
  const input = shallowRef({ nodes, edges, revision: '1' })
  const gesture = shallowRef(false)
  const graph = useAsyncGraphLayout({ input, adapter, gesture, provisional: false })
  calls[0].resolve(layoutFor(calls[0].request))
  await settle()
  const kept = graph.display.value
  input.value = { nodes, edges, revision: '2' }
  await settle()
  const failure = new Error('engine failed')
  calls[1].reject(failure)
  await settle()
  assert.equal(graph.display.value, kept)
  assert.equal(graph.error.value.error, failure)
  assert.equal(graph.error.value.revision, '2')
  assert.equal(graph.pending.value, false)
  // An invalid layout is reported like a failure.
  input.value = { nodes, edges, revision: '3' }
  await settle()
  assert.equal(graph.error.value, undefined)
  calls[2].resolve({ ...layoutFor(calls[2].request), paths: new Map() })
  await settle()
  assert.match(graph.error.value.error.message, /Missing layout path/)
  assert.equal(graph.display.value, kept)
  // A result that arrives during a gesture waits for its end.
  input.value = { nodes, edges, revision: '4' }
  await settle()
  gesture.value = true
  await settle()
  calls[3].resolve(layoutFor(calls[3].request))
  await settle()
  assert.equal(graph.display.value, kept)
  assert.equal(graph.deferred.value, true)
  gesture.value = false
  await settle()
  assert.equal(graph.display.value.revision, '4')
  assert.equal(graph.deferred.value, false)
  // Cancel discards the request in flight.
  input.value = { nodes, edges, revision: '5' }
  await settle()
  graph.cancel()
  assert.equal(calls[4].signal.aborted, true)
  calls[4].resolve(layoutFor(calls[4].request))
  await settle()
  assert.equal(graph.display.value.revision, '4')
  // After dispose nothing is requested or shown.
  input.value = { nodes, edges, revision: '6' }
  await settle()
  graph.dispose()
  assert.equal(calls[5].signal.aborted, true)
  calls[5].resolve(layoutFor(calls[5].request))
  input.value = { nodes, edges, revision: '7' }
  await settle()
  assert.equal(calls.length, 6)
  assert.equal(graph.display.value.revision, '4')
})

test('useAsyncGraphLayout gestureListeners defer frames until every reported gesture has ended', async () => {
  const { calls, adapter } = manualAdapter()
  const input = shallowRef({ nodes, edges, revision: '1' })
  const gesture = shallowRef(false)
  const graph = useAsyncGraphLayout({ input, adapter, gesture, provisional: false })
  const { onGestureStart, onGestureEnd } = graph.gestureListeners
  assert.equal(Object.isFrozen(graph.gestureListeners), true)
  assert.equal(graph.gesturing.value, false)
  calls[0].resolve(layoutFor(calls[0].request))
  await settle()
  const kept = graph.display.value
  // Two gestures in flight at once (an armed connection and a pan): the frame waits until both have ended.
  input.value = { nodes, edges, revision: '2' }
  await settle()
  onGestureStart({ kind: 'connect', source: 'keyboard' })
  onGestureStart({ kind: 'pan', source: 'pointer' })
  assert.equal(graph.gesturing.value, true)
  calls[1].resolve(layoutFor(calls[1].request))
  await settle()
  assert.equal(graph.display.value, kept)
  assert.equal(graph.deferred.value, true)
  onGestureEnd({ kind: 'pan', source: 'pointer', outcome: 'committed' })
  await settle()
  assert.equal(graph.display.value, kept)
  assert.equal(graph.deferred.value, true)
  onGestureEnd({ kind: 'connect', source: 'keyboard', outcome: 'cancelled' })
  await settle()
  assert.equal(graph.display.value.revision, '2')
  assert.equal(graph.deferred.value, false)
  assert.equal(graph.gesturing.value, false)
  // An unmatched end is ignored instead of hiding a later gesture.
  onGestureEnd({ kind: 'pan', source: 'pointer', outcome: 'cancelled' })
  onGestureStart({ kind: 'node-drag', source: 'pointer' })
  assert.equal(graph.gesturing.value, true)
  // The `gesture` option still holds frames on its own and together with the listeners.
  gesture.value = true
  onGestureEnd({ kind: 'node-drag', source: 'pointer', outcome: 'committed' })
  input.value = { nodes, edges, revision: '3' }
  await settle()
  calls[2].resolve(layoutFor(calls[2].request))
  await settle()
  assert.equal(graph.display.value.revision, '2')
  assert.equal(graph.deferred.value, true)
  gesture.value = false
  await settle()
  assert.equal(graph.display.value.revision, '3')
  // A gesture that ends in the same tick as a new input shows that input, not the stale waiting frame.
  input.value = { nodes, edges, revision: '4' }
  await settle()
  onGestureStart({ kind: 'node-drag', source: 'pointer' })
  calls[3].resolve(layoutFor(calls[3].request))
  await settle()
  assert.equal(graph.deferred.value, true)
  input.value = { nodes, edges, revision: '5' }
  onGestureEnd({ kind: 'node-drag', source: 'pointer', outcome: 'committed' })
  await settle()
  assert.equal(graph.display.value.revision, '3')
  assert.equal(graph.deferred.value, false)
  calls[4].resolve(layoutFor(calls[4].request))
  await settle()
  assert.equal(graph.display.value.revision, '5')
  graph.dispose()
})

test('NetworkGraph server markup is the same with gesture listeners bound', async () => {
  const graph = useAsyncGraphLayout({ input: { nodes, edges }, adapter: () => new Promise(() => {}), initialLayout: layeredLayout })
  const render = listeners => renderToString(createSSRApp({
    render: () => h(NetworkGraph, { nodes, edges, layout: graph.layout, draggable: true, connectable: true, ...listeners }),
  }))
  assert.equal(await render(graph.gestureListeners), await render({}))
  graph.dispose()
})

test('useAsyncGraphLayout shows a new edge at once with a temporary route until its layout arrives', async () => {
  const { calls, adapter } = manualAdapter()
  const input = shallowRef({ nodes, edges })
  const graph = useAsyncGraphLayout({ input, adapter })
  calls[0].resolve(layoutFor(calls[0].request))
  await settle()
  const connected = [...edges, { id: 'da', from: 'd', to: 'a' }]
  input.value = { nodes, edges: connected }
  await settle()
  const frame = graph.display.value
  assert.equal(frame.source, 'provisional')
  assert.equal(frame.edges, connected)
  assert.deepEqual(frame.temporaryEdgeIds, ['da'])
  assert.ok(frame.layouts.shown.paths.has('da'))
  assert.equal(graph.pending.value, true)
  calls[1].resolve(layoutFor(calls[1].request))
  await settle()
  assert.equal(graph.display.value.source, 'layout')
  assert.deepEqual(graph.display.value.temporaryEdgeIds, [])
  graph.dispose()
})

test('useAsyncGraphLayout starts no request during server rendering and renders the initial layout', async () => {
  let requested = 0
  const App = defineComponent({
    setup() {
      const graph = useAsyncGraphLayout({
        input: () => ({ nodes, edges }),
        adapter: () => {
          requested++
          return new Promise(() => {})
        },
        initialLayout: (shownNodes, shownEdges) => layoutLayeredGraph(shownNodes, shownEdges),
      })
      return () => graph.display.value && h(NetworkGraph, {
        nodes: graph.display.value.nodes, edges: graph.display.value.edges, layout: graph.layout,
      })
    },
  })
  const html = await renderToString(createSSRApp(App))
  assert.match(html, /<svg/)
  assert.equal(requested, 0)
})

test('graphLayoutWorkerAdapter matches responses by requestId and inputKey and cancels aborted requests', async () => {
  for (const transport of ['clone', 'json']) {
    const listeners = new Set(), posted = []
    const port = {
      postMessage: message => posted.push(transport === 'json' ? graphLayoutMessageFromJson(JSON.parse(message)) : message),
      addEventListener: (_type, listener) => listeners.add(listener),
      removeEventListener: (_type, listener) => listeners.delete(listener),
    }
    const reply = message => {
      const data = transport === 'json' ? JSON.stringify(graphLayoutMessageToJson(message)) : message
      for (const listener of [...listeners]) listener({ data })
    }
    const adapter = graphLayoutWorkerAdapter(port, { transport })
    const { shown } = buildGraphLayoutRequests({ nodes, edges }, '1')
    const result = adapter(shown, new AbortController().signal)
    assert.equal(posted[0].type, 'request')
    assert.equal(posted[0].request.inputKey, shown.inputKey)
    const layout = layoutLayeredGraph(nodes, edges)
    reply({ type: 'success', requestId: shown.requestId, inputKey: 'other', scope: 'shown', layout })
    reply({ type: 'success', requestId: shown.requestId, inputKey: shown.inputKey, scope: 'shown', layout })
    assert.deepEqual(await result, layout)
    assert.equal(listeners.size, 0)

    const failed = adapter(shown, new AbortController().signal)
    reply({ type: 'failure', requestId: shown.requestId, inputKey: shown.inputKey, scope: 'shown', message: 'no memory' })
    await assert.rejects(failed, /no memory/)

    const controller = new AbortController()
    const aborted = adapter(shown, controller.signal)
    controller.abort()
    await assert.rejects(aborted, /cancelled/)
    assert.deepEqual(posted.at(-1), { type: 'cancel', requestId: shown.requestId, inputKey: shown.inputKey })
    assert.equal(listeners.size, 0)
  }
  assert.throws(() => graphLayoutWorkerAdapter({}, { transport: 'xml' }), RangeError)
})

// A small graph whose group holds both nodes: collapsed, it needs a `shown` and an `expanded` layout.
const pairNodes = [{ id: 'x', label: 'X' }, { id: 'y', label: 'Y' }]
const pairEdges = [{ id: 'xy', from: 'x', to: 'y' }]
const pairGroups = [{ id: 'pair', label: 'Pair', nodeIds: ['x', 'y'] }]
const pairInput = collapsed => ({ nodes: pairNodes, edges: pairEdges, groups: pairGroups, collapsedGroupIds: new Set(collapsed ? ['pair'] : []) })

test('useAsyncGraphLayout completes a frame with any cacheSize and requests each layout once', async () => {
  for (const cacheSize of [0, 1, 2, undefined]) {
    for (const collapsed of [false, true]) {
      const requests = []
      const adapter = (request) => {
        requests.push(request.scope)
        return layoutFor(request)
      }
      const graph = useAsyncGraphLayout({ input: shallowRef(pairInput(collapsed)), adapter, ...cacheSize !== undefined && { cacheSize } })
      await settle()
      const label = `cacheSize ${cacheSize}, ${collapsed ? 'collapsed' : 'expanded'}`
      assert.deepEqual(requests.sort(), collapsed ? ['expanded', 'shown'] : ['shown'], label)
      assert.equal(graph.pending.value, false, label)
      assert.equal(graph.error.value, undefined, label)
      assert.equal(graph.display.value.source, 'layout', label)
      assert.equal(graph.display.value.collapsedGroupIds.size, collapsed ? 1 : 0, label)
      assert.equal(!!graph.display.value.layouts.expanded, collapsed, label)
      graph.dispose()
    }
  }
})

test('useAsyncGraphLayout holds the results and failures of a collapsed frame apart from the cache, in any arrival order', async () => {
  const outcomes = [['ok', 'ok'], ['ok', 'fail'], ['fail', 'ok'], ['fail', 'fail']]
  for (const cacheSize of [0, 1, undefined]) {
    for (const first of ['shown', 'expanded']) {
      for (const [firstOutcome, secondOutcome] of outcomes) {
        const label = `cacheSize ${cacheSize}, ${first} ${firstOutcome} then ${secondOutcome}`
        const { calls, adapter } = manualAdapter()
        const input = shallowRef(pairInput(true))
        const graph = useAsyncGraphLayout({ input, adapter, ...cacheSize !== undefined && { cacheSize } })
        await settle()
        assert.equal(calls.length, 2, label)
        const order = first === 'shown' ? calls : [...calls].reverse()
        const answer = (call, outcome) => outcome === 'ok' ? call.resolve(layoutFor(call.request)) : call.reject(new Error('failed ' + call.request.scope))
        answer(order[0], firstOutcome)
        await settle()
        assert.equal(graph.display.value, undefined, label + ': one scope is not enough')
        answer(order[1], secondOutcome)
        await settle()
        // Nothing is requested again for the same input, whatever the cache holds.
        assert.equal(calls.length, 2, label)
        assert.equal(graph.pending.value, false, label)
        if (firstOutcome === 'ok' && secondOutcome === 'ok') {
          assert.equal(graph.display.value.source, 'layout', label)
          assert.equal(graph.error.value, undefined, label)
          graph.dispose()
          continue
        }
        assert.equal(graph.display.value, undefined, label)
        const lastFailed = secondOutcome === 'fail' ? order[1] : order[0]
        assert.equal(graph.error.value.scope, lastFailed.request.scope, label)
        assert.equal(graph.error.value.requestId, lastFailed.request.requestId, label)
        // A new input clears the error and asks again for what the cache does not hold.
        input.value = pairInput(true)
        await settle()
        assert.equal(graph.error.value, undefined, label)
        assert.equal(graph.pending.value, true, label)
        const succeeded = [firstOutcome, secondOutcome].filter(outcome => outcome === 'ok').length
        const again = calls.slice(2)
        assert.equal(again.length, cacheSize === 0 ? 2 : 2 - succeeded, label)
        for (const call of again) call.resolve(layoutFor(call.request))
        await settle()
        assert.equal(calls.length, 2 + again.length, label)
        assert.equal(graph.pending.value, false, label)
        assert.equal(graph.error.value, undefined, label)
        assert.equal(graph.display.value.source, 'layout', label)
        assert.equal(graph.display.value.revision, graph.desired.value.revision, label)
        graph.dispose()
      }
    }
  }
})

test('useAsyncGraphLayout with cacheSize 0 still delivers a result in flight to a newer input with the same key', async () => {
  const { calls, adapter } = manualAdapter()
  const input = shallowRef(pairInput(false))
  const graph = useAsyncGraphLayout({ input, adapter, cacheSize: 0 })
  await settle()
  input.value = pairInput(false)
  await settle()
  assert.equal(calls.length, 1)
  assert.equal(calls[0].signal.aborted, false)
  calls[0].resolve(layoutFor(calls[0].request))
  await settle()
  assert.equal(graph.display.value.source, 'layout')
  assert.equal(graph.display.value.groups, input.value.groups)
  assert.equal(graph.pending.value, false)
  // Without a cache, a later input with the same key is computed again.
  input.value = pairInput(false)
  await settle()
  assert.equal(calls.length, 2)
  assert.equal(graph.pending.value, true)
  graph.dispose()
})

test('graphLayoutWorkerAdapter checks the scope and removes its listeners on every path', async () => {
  const { shown, expanded } = buildGraphLayoutRequests(pairInput(true), '1')
  // A signal whose listeners can be counted.
  function countedSignal() {
    const controller = new AbortController()
    const listeners = new Set()
    const signal = {
      get aborted() { return controller.signal.aborted },
      addEventListener: (type, listener) => {
        listeners.add(listener)
        controller.signal.addEventListener(type, listener)
      },
      removeEventListener: (type, listener) => {
        listeners.delete(listener)
        controller.signal.removeEventListener(type, listener)
      },
    }
    return { controller, listeners, signal }
  }
  for (const transport of ['clone', 'json']) {
    const listeners = new Set(), posted = []
    let failPost
    const port = {
      postMessage: (message) => {
        if (failPost?.(message)) throw new Error('DataCloneError')
        posted.push(transport === 'json' ? graphLayoutMessageFromJson(JSON.parse(message)) : message)
      },
      addEventListener: (_type, listener) => listeners.add(listener),
      removeEventListener: (_type, listener) => listeners.delete(listener),
    }
    const reply = (message) => {
      const data = transport === 'json' ? JSON.stringify(graphLayoutMessageToJson(message)) : message
      for (const listener of [...listeners]) listener({ data })
    }
    const adapter = graphLayoutWorkerAdapter(port, { transport })
    const run = async (label, request, act, expectation) => {
      const counted = countedSignal()
      const result = adapter(request, counted.signal)
      await act(counted)
      if (expectation instanceof RegExp) await assert.rejects(result, expectation, label)
      else assert.deepEqual(await result, expectation, label)
      assert.equal(listeners.size, 0, `${transport} ${label}: port listeners`)
      assert.equal(counted.listeners.size, 0, `${transport} ${label}: signal listeners`)
    }
    const response = (request, scope, type = 'success') => type === 'success'
      ? { type, requestId: request.requestId, inputKey: request.inputKey, scope, layout: layoutFor(request) }
      : { type, requestId: request.requestId, inputKey: request.inputKey, scope, message: 'engine failed' }

    await run('success', shown, () => reply(response(shown, 'shown')), layoutFor(shown))
    await run('expanded success', expanded, () => reply(response(expanded, 'expanded')), layoutFor(expanded))
    await run('failure', shown, () => reply(response(shown, 'shown', 'failure')), /engine failed/)
    await run('success with another scope', shown, () => reply(response(shown, 'expanded')), /scope expanded, expected shown/)
    await run('failure with another scope', expanded, () => reply(response(expanded, 'shown', 'failure')), /scope shown, expected expanded/)
    await run('malformed', shown, () => {
      const data = { type: 'success', requestId: shown.requestId }
      for (const listener of [...listeners]) listener({ data: transport === 'json' ? JSON.stringify(data) : data })
    }, /Invalid graph layout message/)
    await run('abort', shown, ({ controller }) => controller.abort(), /cancelled/)
    assert.deepEqual(posted.at(-1), { type: 'cancel', requestId: shown.requestId, inputKey: shown.inputKey })
    // A port that cannot post the cancel message still ends the request cleanly.
    failPost = message => (typeof message === 'string' ? JSON.parse(message) : message).type === 'cancel'
    await run('abort with a failing cancel post', shown, ({ controller }) => controller.abort(), /cancelled/)
    // A request that cannot be posted rejects with the post error and leaves nothing attached.
    failPost = () => true
    await run('post exception', shown, () => {}, /DataCloneError/)
    failPost = undefined
    const aborted = countedSignal()
    aborted.controller.abort()
    await assert.rejects(adapter(shown, aborted.signal), /cancelled/)
    assert.equal(listeners.size, 0)
    assert.equal(aborted.listeners.size, 0)
    // Answers after the first one change nothing.
    await run('late answers', shown, () => {
      reply(response(shown, 'shown'))
      reply(response(shown, 'shown', 'failure'))
    }, layoutFor(shown))
  }
})
