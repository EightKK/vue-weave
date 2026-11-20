import assert from 'node:assert/strict'
import { test } from 'node:test'
import { h } from 'vue'
import { graphDeletion, removeGraphElements } from 'vue-weave/core'
import { NetworkGraph, graphDeletion as rootGraphDeletion } from 'vue-weave'
import { renderComponent } from './helpers/ssr.mjs'

const nodes = [
  { id: 'a', label: 'Alpha', detail: 'first' },
  { id: 'b', label: 'Beta' },
  { id: 'c', label: 'Gamma' },
  { id: 'd', label: 'Delta' },
]
const edges = [
  { id: 'ab', from: 'a', to: 'b', label: 'One' },
  { id: 'bc', from: 'b', to: 'c' },
  { id: 'cd', from: 'c', to: 'd' },
  { id: 'loop', from: 'b', to: 'b' },
  { id: 'da', from: 'd', to: 'a' },
]

test('graphDeletion adds incident edges, removes duplicates and keeps input order', () => {
  assert.equal(rootGraphDeletion, graphDeletion)
  // A self-loop and both directions of a cycle count as incident.
  assert.deepEqual(graphDeletion(nodes, edges, ['b']), { nodeIds: ['b'], edgeIds: ['ab', 'bc', 'loop'] })
  assert.deepEqual(
    graphDeletion(nodes, edges, ['d', 'b', 'd'], ['cd', 'da', 'cd']),
    { nodeIds: ['b', 'd'], edgeIds: ['ab', 'bc', 'cd', 'loop', 'da'] },
  )
  assert.deepEqual(graphDeletion(nodes, edges, [], ['da', 'ab']), { nodeIds: [], edgeIds: ['ab', 'da'] })
  assert.deepEqual(graphDeletion(nodes, edges, new Set(['c'])), { nodeIds: ['c'], edgeIds: ['bc', 'cd'] })
  assert.deepEqual(graphDeletion(nodes, edges, []), { nodeIds: [], edgeIds: [] })
})

test('graphDeletion rejects unknown IDs and invalid graphs', () => {
  assert.throws(() => graphDeletion(nodes, edges, ['missing']), { name: 'Error', message: 'Unknown node in graph deletion: missing' })
  assert.throws(() => graphDeletion(nodes, edges, [], ['missing']), { name: 'Error', message: 'Unknown edge in graph deletion: missing' })
  assert.throws(() => graphDeletion([...nodes, { id: 'a', label: 'Again' }], edges, ['a']), /Duplicate graph node ID: a/)
  assert.throws(() => graphDeletion(nodes, [{ id: 'x', from: 'a', to: 'nowhere' }], []), { name: 'Error', message: 'Unknown node in graph edge x: nowhere' })
})

test('removeGraphElements returns new arrays and leaves the input untouched', () => {
  const frozenNodes = Object.freeze(nodes.map(node => Object.freeze({ ...node })))
  const frozenEdges = Object.freeze(edges.map(edge => Object.freeze({ ...edge })))
  const before = JSON.stringify([frozenNodes, frozenEdges])
  const deletion = graphDeletion(frozenNodes, frozenEdges, ['c'], ['ab'])
  const result = removeGraphElements(frozenNodes, frozenEdges, deletion)
  assert.deepEqual(result.nodes.map(node => node.id), ['a', 'b', 'd'])
  assert.deepEqual(result.edges.map(edge => edge.id), ['loop', 'da'])
  assert.notEqual(result.nodes, frozenNodes)
  assert.notEqual(result.edges, frozenEdges)
  // Remaining elements keep their identity and the inputs are unchanged.
  assert.equal(result.nodes[0], frozenNodes[0])
  assert.equal(JSON.stringify([frozenNodes, frozenEdges]), before)
  assert.deepEqual(deletion, { nodeIds: ['c'], edgeIds: ['ab', 'bc', 'cd'] })
})

test('removeGraphElements drops edges of removed nodes even when the deletion omits them', () => {
  const result = removeGraphElements(nodes, edges, { nodeIds: ['a'], edgeIds: [] })
  assert.deepEqual(result.nodes.map(node => node.id), ['b', 'c', 'd'])
  assert.deepEqual(result.edges.map(edge => edge.id), ['bc', 'cd', 'loop'])
  const empty = removeGraphElements(nodes, edges, { nodeIds: [], edgeIds: [] })
  assert.deepEqual(empty, { nodes, edges })
  assert.notEqual(empty.nodes, nodes)
  assert.throws(() => removeGraphElements(nodes, edges, { nodeIds: ['zz'], edgeIds: [] }), /Unknown node in graph deletion: zz/)
  assert.throws(() => removeGraphElements(nodes, edges, { nodeIds: [], edgeIds: ['zz'] }), /Unknown edge in graph deletion: zz/)
})

const render = (props, slots) => renderComponent(NetworkGraph, { nodes, edges, ...props }, slots)

test('NetworkGraph markup is unchanged when the new props are absent or off', async () => {
  const plain = await render({})
  assert.doesNotMatch(plain, /vw-edge-hit|vw-edge-selected|role="tooltip"|aria-describedby|data-vw-edge/)
  assert.match(plain, /<title>Alpha first<\/title>/)
  const off = await render({ edgesSelectable: false, deletable: false, contextMenu: false, tooltipDelay: 400 })
  assert.equal(off, plain)
  // Deletion only adds keyboard handling.
  assert.equal(await render({ deletable: true, validateDelete: () => false }), plain)
  // The fit button calls fit() without the click event.
  assert.match(plain, /class="vw-fit-button">Fit to view<\/button>/)
})

test('NetworkGraph renders selectable edges with their controlled selection on the server', async () => {
  const html = await render({ edgesSelectable: true, selectedEdgeIds: new Set(['bc', 'unknown']) })
  const hits = [...html.matchAll(/<path class="vw-edge-hit[^"]*"[^>]*>/g)].map(match => match[0])
  assert.equal(hits.length, edges.length)
  assert.match(html, /aria-label="Select edge One"/)
  const selected = hits.filter(hit => hit.includes('aria-pressed="true"'))
  assert.equal(selected.length, 1)
  assert.match(selected[0], /class="vw-edge-hit vw-is-selected"/)
  assert.match(selected[0], /data-vw-edge="bc"/)
  assert.equal(html.match(/vw-edge-selected/g)?.length, 1)
  // Without edgesSelectable a reconnectable graph keeps its existing edge buttons and pressed state.
  const reconnect = await render({ reconnectable: true, selectedEdgeIds: new Set(['bc']) })
  assert.doesNotMatch(reconnect, /vw-edge-selected|aria-pressed="true"/)
  assert.equal(reconnect.match(/class="vw-edge-hit"/g)?.length, edges.length)
  // The context menu marks edge groups so a right-click on the drawn path finds its edge.
  const menu = await render({ contextMenu: true })
  assert.equal(menu.match(/data-vw-edge=/g)?.length, edges.length)
})

test('the tooltip slot never renders on the server and validates its delay', async () => {
  const tooltip = ({ target }) => h('span', target.kind === 'node' ? target.node.label : target.edge.id)
  const html = await render({ edgesSelectable: true }, { tooltip })
  assert.doesNotMatch(html, /role="tooltip"|vw-network-tooltip|aria-describedby/)
  // The native title would duplicate the tooltip, so it is left out while the slot is provided.
  assert.doesNotMatch(html, /<title>/)
  assert.equal(await render({ tooltipDelay: 0 }, { tooltip }), await render({}, { tooltip }))
  for (const tooltipDelay of [-1, Number.NaN, Infinity]) {
    await assert.rejects(render({ tooltipDelay }, { tooltip }), RangeError)
    await assert.rejects(render({ tooltipDelay }), RangeError)
  }
})
