import assert from 'node:assert/strict'
import { test } from 'node:test'
import { h } from 'vue'
import { graphNodesInPolygon, graphPointInPolygon, layoutLayeredGraph } from 'vue-weave/core'
import { NetworkGraph, graphNodesInPolygon as rootNodesInPolygon, graphPointInPolygon as rootPointInPolygon } from 'vue-weave'
import { renderComponent } from './helpers/ssr.mjs'

const square = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]

test('graphPointInPolygon uses the even-odd rule and counts the outline as inside', () => {
  assert.equal(rootPointInPolygon, graphPointInPolygon)
  assert.equal(graphPointInPolygon({ x: 5, y: 5 }, square), true)
  assert.equal(graphPointInPolygon({ x: 11, y: 5 }, square), false)
  assert.equal(graphPointInPolygon({ x: -0.001, y: 5 }, square), false)
  // Vertices and edges are inside, in either winding order.
  assert.equal(graphPointInPolygon({ x: 0, y: 0 }, square), true)
  assert.equal(graphPointInPolygon({ x: 10, y: 4 }, [...square].reverse()), true)
  // A concave outline (a U shape) excludes its notch.
  const u = [{ x: 0, y: 0 }, { x: 3, y: 0 }, { x: 3, y: 7 }, { x: 7, y: 7 }, { x: 7, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }]
  assert.equal(graphPointInPolygon({ x: 5, y: 3 }, u), false)
  assert.equal(graphPointInPolygon({ x: 5, y: 9 }, u), true)
  assert.equal(graphPointInPolygon({ x: 1, y: 3 }, u), true)
  // A self-intersecting bow tie: both lobes are inside, outside the crossing they are not.
  const bowtie = [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }]
  assert.equal(graphPointInPolygon({ x: 2, y: 5 }, bowtie), true)
  assert.equal(graphPointInPolygon({ x: 5, y: 2 }, bowtie), false)
  // An outline that winds twice around a region leaves it outside (even-odd).
  const twice = [...square, { x: 0, y: 0 }, ...square]
  assert.equal(graphPointInPolygon({ x: 5, y: 5 }, twice), false)
})

test('graphPointInPolygon validates input and treats degenerate outlines as empty', () => {
  assert.equal(graphPointInPolygon({ x: 0, y: 0 }, []), false)
  assert.equal(graphPointInPolygon({ x: 0, y: 0 }, [{ x: 0, y: 0 }, { x: 1, y: 1 }]), false)
  assert.throws(() => graphPointInPolygon({ x: Number.NaN, y: 0 }, square), RangeError)
  assert.throws(() => graphPointInPolygon({ x: 0, y: 0 }, [...square, { x: Infinity, y: 0 }]), RangeError)
  assert.throws(() => graphPointInPolygon({ x: 0, y: 0 }, 'square'), RangeError)
  // Validation applies before the length check, so a bad point is reported for short outlines too.
  assert.throws(() => graphPointInPolygon({ x: 0, y: 0 }, [{ x: 0, y: Number.NaN }]), RangeError)
})

test('graphNodesInPolygon selects box centres in map order without mutating its inputs', () => {
  assert.equal(rootNodesInPolygon, graphNodesInPolygon)
  const boxes = new Map([
    ['c', { x: 20, y: 0, width: 10, height: 10, rank: 0 }],
    ['a', { x: 0, y: 0, width: 10, height: 10, rank: 0 }],
    // The polygon reaches into this box but not to its centre.
    ['b', { x: 8, y: 8, width: 20, height: 20, rank: 0 }],
  ])
  const triangle = [{ x: -5, y: -5 }, { x: 60, y: -5 }, { x: -5, y: 20 }]
  const before = JSON.stringify([...boxes])
  assert.deepEqual(graphNodesInPolygon(boxes, triangle), ['c', 'a'])
  assert.equal(JSON.stringify([...boxes]), before)
  assert.deepEqual(graphNodesInPolygon(boxes, triangle.slice(0, 2)), [])
  assert.deepEqual(graphNodesInPolygon(new Map(), triangle), [])
  assert.throws(() => graphNodesInPolygon(boxes, [...triangle, { x: 0, y: Number.NaN }]), RangeError)
  assert.throws(() => graphNodesInPolygon(new Map([['x', { x: Number.NaN, y: 0, width: 1, height: 1 }]]), triangle), RangeError)
  // Works on a laid-out graph, including a long chain, in loops.
  const ids = Array.from({ length: 2000 }, (_, i) => 'n' + i)
  const layout = layoutLayeredGraph(ids.map(id => ({ id, label: id })), ids.slice(1).map((id, i) => ({ id: 'e' + i, from: ids[i], to: id })))
  const all = [{ x: -1, y: -1 }, { x: layout.width + 1, y: -1 }, { x: layout.width + 1, y: layout.height + 1 }, { x: -1, y: layout.height + 1 }]
  assert.equal(graphNodesInPolygon(layout.boxes, all).length, ids.length)
})

const nodes = [
  { id: 'a', label: 'Alpha', detail: 'first' },
  { id: 'b', label: 'Beta' },
  { id: 'c', label: 'Gamma' },
]
const edges = [
  { id: 'ab', from: 'a', to: 'b', label: 'One' },
  { id: 'bc', from: 'b', to: 'c' },
]
const groups = [{ id: 'g', label: 'Pair', nodeIds: ['a', 'b'] }]
const render = (props, slots) => renderComponent(NetworkGraph, { nodes, edges, ...props }, slots)

test('NetworkGraph markup is unchanged when the label, lasso and toolbar inputs are absent or off', async () => {
  const plain = await render({ groups, showMinimap: true, boxSelect: true, selectedId: 'a' })
  const off = await render({
    groups, showMinimap: true, boxSelect: true, selectedId: 'a', editableLabels: false, validateLabelEdit: () => false, selectionMode: 'box',
  })
  assert.equal(off, plain)
  // The lasso only changes the drag; nothing is drawn before one.
  assert.equal(await render({ groups, showMinimap: true, boxSelect: true, selectedId: 'a', selectionMode: 'lasso' }), plain)
  assert.doesNotMatch(plain, /vw-labels-editable|vw-label-editor|vw-node-toolbar|vw-edge-toolbar|vw-has-slot|vw-minimap-custom|vw-group-handle|vw-lasso/)
  await assert.rejects(render({ selectionMode: 'circle' }), { name: 'RangeError', message: 'Unknown selection mode: circle' })
})

test('editable labels render edge hit areas on the server but never the editor', async () => {
  const html = await render({ editableLabels: true })
  assert.match(html, /class="vw-network vw-labels-editable"/)
  assert.equal(html.match(/class="vw-edge-hit"/g)?.length, edges.length)
  assert.match(html, /aria-label="Select edge One"/)
  assert.doesNotMatch(html, /<input|vw-label-editor|Edit label of/)
})

test('toolbar slots render beside the selected node and edge on the server', async () => {
  const slots = {
    'node-toolbar': ({ node, box, scale }) => h('button', { type: 'button' }, 'Act on ' + node.label + ' ' + box.width + ' ' + (scale > 0)),
    'edge-toolbar': ({ edge, point }) => h('button', { type: 'button' }, 'Act on ' + edge.id + ' ' + Number.isFinite(point.x)),
  }
  const html = await render({ selectedId: 'a', edgesSelectable: true, selectedEdgeIds: new Set(['ab']) }, slots)
  assert.match(html, /<div class="vw-node-toolbar[^"]*" role="group" aria-label="Node actions Alpha" style="left:[\d.]+px;top:[\d.]+px;"><!--\[--><button type="button">Act on Alpha 144 true<\/button><!--\]--><\/div>/)
  assert.match(html, /<div class="vw-edge-toolbar[^"]*" role="group" aria-label="Edge actions One"[^>]*><!--\[--><button type="button">Act on ab true<\/button>/)
  // No single selection, no toolbar; several selected nodes or edges show none either.
  assert.doesNotMatch(await render({}, slots), /vw-node-toolbar|vw-edge-toolbar/)
  const several = await render({ selectedIds: new Set(['a', 'b']), edgesSelectable: true, selectedEdgeIds: new Set(['ab', 'bc']) }, slots)
  assert.doesNotMatch(several, /vw-node-toolbar|vw-edge-toolbar/)
  assert.match(await render({ selectedIds: new Set(['b']) }, slots), /aria-label="Node actions Beta"/)
  // Without a way to select edges, the edge toolbar has no edge.
  assert.doesNotMatch(await render({ selectedEdgeIds: new Set(['ab']) }, slots), /vw-edge-toolbar/)
  // The group names are localized through labels.
  const localized = await render({ selectedId: 'c', labels: { nodeToolbar: 'Aktionen für' } }, slots)
  assert.match(localized, /aria-label="Aktionen für Gamma"/)
  // The toolbar stays out of the exported SVG-only content: it is HTML after the stage.
  assert.ok(html.indexOf('vw-node-toolbar') > html.indexOf('</svg>'))
})

test('the group slot replaces the frame and keeps an accessible move handle', async () => {
  const group = ({ group: item, box, depth }) => h('rect', { class: 'custom-frame', 'data-label': item.label, 'data-depth': depth, width: box.width, height: box.height })
  const html = await render({ groups, draggable: true }, { group })
  assert.match(html, /<g class="vw-network-group vw-has-slot">/)
  assert.match(html, /<rect class="custom-frame" data-label="Pair" data-depth="0"/)
  assert.match(html, /<rect class="vw-group-handle"[^>]*role="button"[^>]*data-vw-group="g"[^>]*tabindex="0"[^>]*aria-label="Move group Pair"/)
  assert.doesNotMatch(html, /<text[^>]*data-vw-group/)
  // Without draggable the handle only marks the group for context menus.
  const still = await render({ groups }, { group })
  assert.match(still, /<rect class="vw-group-handle"[^>]*data-vw-group="g"/)
  assert.doesNotMatch(still, /role="button"[^>]*data-vw-group/)
  // Without the slot the default frame is unchanged.
  assert.equal(await render({ groups, draggable: true }, {}), await render({ groups, draggable: true }))
})

test('the minimap-node slot draws each node inside the minimap', async () => {
  const slot = ({ node, box, selected }) => h('circle', { cx: box.x, cy: box.y, r: 5, 'data-node': node.id, 'data-selected': String(selected) })
  const html = await render({ showMinimap: true, selectedId: 'b' }, { 'minimap-node': slot })
  assert.equal(html.match(/class="vw-minimap-custom/g)?.length, nodes.length)
  assert.match(html, /<g class="vw-minimap-custom vw-is-selected"><!--\[--><circle[^>]*data-node="b" data-selected="true"/)
  assert.match(html, /class="vw-minimap-window"/)
  // The slot has no effect without the minimap.
  assert.doesNotMatch(await render({ selectedId: 'b' }, { 'minimap-node': slot }), /vw-minimap/)
})
