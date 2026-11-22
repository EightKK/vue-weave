import assert from 'node:assert/strict'
import { test } from 'node:test'
import { layoutLayeredGraph, renderGraphSvg } from '@eightkk/vue-weave/core'
import { NetworkGraph } from '@eightkk/vue-weave'
import { renderWith } from './helpers/ssr.mjs'

const nodes = [
  { id: 'a', label: 'A', ports: [{ id: 'out', side: 'right', offset: 0.25 }] },
  { id: 'b', label: 'B', ports: [{ id: 'in', side: 'left' }] },
  { id: 'c', label: 'C' },
  { id: 'd', label: 'D' },
]
const edges = [
  { id: 'ab', from: 'a', to: 'b', fromPort: 'out', toPort: 'in' },
  { id: 'bc', from: 'b', to: 'c' },
  { id: 'cd', from: 'c', to: 'd' },
  { id: 'bd', from: 'b', to: 'd' },
]
const box = (x, y) => ({ x, y, width: 100, height: 40, rank: 0 })
// A layout from an external engine: a polyline between the named ports and plain curves for the other edges.
const externalPath = 'M 120 30 L 170 30 L 170 40 L 220 40'
function external(list = edges) {
  const paths = new Map([
    ['ab', externalPath],
    ['bc', 'M 320 40 C 350 40, 350 140, 420 140'],
    ['cd', 'M 520 140 L 620 140'],
    ['bd', 'M 270 60 Q 400 220 620 150'],
  ])
  return {
    boxes: new Map([['a', box(20, 20)], ['b', box(220, 20)], ['c', box(420, 120)], ['d', box(620, 120)]]),
    paths: new Map(list.filter(edge => paths.has(edge.id)).map(edge => [edge.id, paths.get(edge.id)])),
    edgeLabels: new Map(),
    width: 760,
    height: 200,
  }
}
const render = renderWith(NetworkGraph, { nodes, edges })

test('NetworkGraph server markup is unchanged when the highlight and routing policy props are unset or empty', async () => {
  const plain = await render({ edgesSelectable: true })
  assert.equal(await render({ edgesSelectable: true, routingPolicy: 'builtin', highlightedNodeIds: new Set(), highlightedEdgeIds: new Set() }), plain)
  assert.equal(plain.includes('vw-is-highlighted'), false)
  const custom = { layout: () => external(), edgeStyle: 'orthogonal' }
  assert.equal(await render({ ...custom, routingPolicy: 'builtin' }), await render(custom))
  await assert.rejects(render({ routingPolicy: 'keep' }), { name: 'RangeError', message: /Unknown routing policy: keep/ })
})

test('NetworkGraph draws highlighted nodes and edges without selecting them, also through collapsed groups', async () => {
  const markup = await render({ highlightedNodeIds: new Set(['b', 'zz']), highlightedEdgeIds: new Set(['cd']) })
  assert.match(markup, /class="vw-network-node vw-tone-blue vw-is-highlighted"[^>]*data-vw-node="b"[^>]*aria-pressed="false"/)
  assert.match(markup, /class="vw-network-node vw-tone-blue"[^>]*data-vw-node="a"/)
  assert.equal(markup.match(/<g class="vw-is-highlighted"/g)?.length, 1)
  assert.match(markup, /<g class="vw-is-highlighted"><!--\[--><path class="vw-network-edge" d="M 552 58 /)

  // A hidden member highlights its proxy, a merged edge follows any of its original edges and an edge dropped inside
  // the collapsed group highlights the proxy.
  const groups = [{ id: 'g', label: 'Group', nodeIds: ['c', 'd'] }]
  const collapsed = await render({ groups, collapsedGroupIds: new Set(['g']), highlightedNodeIds: new Set(['d']), highlightedEdgeIds: new Set(['bd']) })
  assert.match(collapsed, /vw-is-highlighted"[^>]*data-vw-node="g"/)
  assert.equal(collapsed.match(/<g class="vw-is-highlighted"/g)?.length, 1)
  const dropped = await render({ groups, collapsedGroupIds: new Set(['g']), highlightedEdgeIds: new Set(['cd']) })
  assert.match(dropped, /vw-is-highlighted"[^>]*data-vw-node="g"/)
  assert.equal(dropped.includes('<g class="vw-is-highlighted"'), false)
})

test('the preserve routing policy keeps external port routes and completes missing paths', async () => {
  const pathOf = (markup, index) => [...markup.matchAll(/class="vw-network-edge" d="([^"]+)"/g)][index]?.[1]
  // Builtin redraws the port edge from its anchors; preserve keeps the engine's polyline, also in the orthogonal style.
  const builtin = await render({ layout: () => external() })
  assert.notEqual(pathOf(builtin, 0), externalPath)
  for (const edgeStyle of ['curve', 'orthogonal', 'straight']) {
    const preserved = await render({ layout: () => external(), routingPolicy: 'preserve', edgeStyle })
    assert.equal(pathOf(preserved, 0), externalPath, edgeStyle)
    assert.equal(pathOf(preserved, 3), 'M 270 60 Q 400 220 620 150', edgeStyle)
  }
  // A moved port node falls back to built-in routing for its edges only.
  const moved = await render({ layout: () => external(), routingPolicy: 'preserve', positions: new Map([['a', { x: 20, y: 100 }]]) })
  assert.notEqual(pathOf(moved, 0), externalPath)
  assert.equal(pathOf(moved, 2), 'M 520 140 L 620 140')

  // An edge the cached layout has no path for, such as a new connection, gets a temporary route only with preserve.
  const connected = [...edges, { id: 'ac', from: 'a', to: 'c' }]
  await assert.rejects(render({ edges: connected, layout: () => external() }), /Missing layout path: ac/)
  const completed = await render({ edges: connected, layout: () => external(), routingPolicy: 'preserve' })
  assert.match(pathOf(completed, 4), /^M /)
  assert.equal(pathOf(completed, 0), externalPath)
})

test('renderGraphSvg draws highlight options and is unchanged without them', () => {
  const layout = layoutLayeredGraph(nodes, edges)
  const plain = renderGraphSvg(layout, nodes, edges)
  assert.equal(renderGraphSvg(layout, nodes, edges, { highlightedNodeIds: [], highlightedEdgeIds: ['missing'] }), plain)
  assert.equal(plain.includes('-arrow-highlight'), false)
  const theme = { dependencyHighlight: '#123456' }
  const marked = renderGraphSvg(layout, nodes, edges, { theme, highlightedNodeIds: ['b'], highlightedEdgeIds: new Set(['cd']) })
  assert.equal(marked.match(/stroke="#123456" stroke-width="3"/g)?.length, 1)
  assert.equal(marked.match(/stroke="#123456" stroke-width="2.6" marker-end="url\(#vw-export-arrow-highlight\)"/g)?.length, 1)
  assert.match(marked, /<marker id="vw-export-arrow-highlight"[^>]*><path d="M 0 0 L 7 3.5 L 0 7 z" fill="#123456"\/>/)
  const coloured = renderGraphSvg(layout, nodes, edges, { highlightedNodeIds: ['b'], highlightColor: ' #abcdef ' })
  assert.match(coloured, /stroke="#abcdef" stroke-width="3"/)
  assert.throws(() => renderGraphSvg(layout, nodes, edges, { highlightColor: ' ' }), /Invalid export highlight colour/)
})
