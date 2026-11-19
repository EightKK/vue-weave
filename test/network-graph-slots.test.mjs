import assert from 'node:assert/strict'
import { test } from 'node:test'
import { h } from 'vue'
import { NetworkGraph } from 'vue-weave'
import { renderComponent } from './helpers/ssr.mjs'

const nodes = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }]
const edges = [{ id: 'ab', from: 'a', to: 'b' }, { id: 'bc', from: 'b', to: 'c' }]

function renderGraph(props = {}, slots) {
  return renderComponent(NetworkGraph, { nodes, edges, ...props }, slots)
}

test('NetworkGraph edge slot props separate selection, related and highlighted edges', async () => {
  const edge = ({ edge, selected, related, highlighted }) => h('path', {
    'data-slot-edge': edge.id, 'data-selected': String(selected), 'data-related': String(related), 'data-highlighted': String(highlighted),
  })
  const html = await renderGraph({
    edgesSelectable: true, selectedEdgeIds: new Set(['bc']), relatedIds: new Set(['a', 'b']), highlightedEdgeIds: new Set(['bc']),
  }, { edge })
  assert.match(html, /data-slot-edge="ab" data-selected="false" data-related="true" data-highlighted="false"/)
  assert.match(html, /data-slot-edge="bc" data-selected="true" data-related="false" data-highlighted="true"/)
  // Without edgesSelectable no edge is selected, even with selectedEdgeIds.
  const unselectable = await renderGraph({ selectedEdgeIds: new Set(['bc']) }, { edge })
  assert.doesNotMatch(unselectable, /data-selected="true"/)
})

test('NetworkGraph node slot receives related and highlighted', async () => {
  const node = ({ node, related, highlighted }) => h('rect', { 'data-slot-node': node.id, 'data-related': String(related), 'data-highlighted': String(highlighted) })
  const html = await renderGraph({ relatedIds: new Set(['a']), highlightedNodeIds: new Set(['c']) }, { node })
  assert.match(html, /data-slot-node="a" data-related="true" data-highlighted="false"/)
  assert.match(html, /data-slot-node="b" data-related="false" data-highlighted="false"/)
  assert.match(html, /data-slot-node="c" data-related="false" data-highlighted="true"/)
})

test('unstyledNodeSlots marks slotted nodes only and leaves the default markup unchanged', async () => {
  const node = () => h('rect', { fill: '#123456' })
  const styled = await renderGraph({}, { node })
  assert.doesNotMatch(styled, /vw-is-unstyled/)
  const unstyled = await renderGraph({ unstyledNodeSlots: true }, { node })
  assert.equal((unstyled.match(/class="vw-network-node[^"]*vw-is-unstyled/g) ?? []).length, 3)
  assert.match(unstyled, /fill="#123456"/)
  // The default renderer keeps the stylesheet's paint, so the prop changes nothing without a node slot.
  assert.equal(await renderGraph({ unstyledNodeSlots: true }), await renderGraph())
})
