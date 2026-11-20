import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { layoutLayeredGraph, routeGraphEdges } from 'vue-weave/core'
import { NetworkGraph } from 'vue-weave'
import { byId } from './helpers/builders.mjs'
import { renderComponent } from './helpers/ssr.mjs'

const nodes = [
  { id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }, { id: 'd', label: 'D' }, { id: 'e', label: 'E' },
]

const edges = [
  { id: 'ab', from: 'a', to: 'b', label: 'feeds' }, { id: 'bc', from: 'b', to: 'c' }, { id: 'ac', from: 'a', to: 'c', label: 'feeds' },
  { id: 'cd', from: 'c', to: 'd' }, { id: 'de', from: 'd', to: 'e' }, { id: 'be', from: 'b', to: 'e' }, { id: 'aa', from: 'a', to: 'a' },
]

const groups = [{ id: 'g', label: 'Group', nodeIds: ['b', 'c'] }]
const render = props => renderComponent(NetworkGraph, { nodes, edges, ...props })

test('NetworkGraph draws the marker and animated class kept on a merged edge of a collapsed group', async () => {
  const groups = [{ id: 'g', label: 'Group', nodeIds: ['b', 'c'] }]
  const look = { markerEnd: 'diamond', animated: true }
  const html = await renderToString(createSSRApp({
    render: () => h(NetworkGraph, {
      nodes, groups, collapsedGroupIds: new Set(['g']),
      edges: [{ id: 'ab', from: 'a', to: 'b', ...look }, { id: 'ac', from: 'a', to: 'c', ...look }],
    }),
  }))
  assert.match(html, /<path class="vw-network-edge vw-is-animated" d="[^"]+" marker-end="url\(#[^)]+-diamond\)">/)
})

test('NetworkGraph server markup is unchanged by default values of the new inputs', async () => {
  const plain = await render({ groups, draggable: true, edgesSelectable: true })
  assert.equal(await render({ groups, draggable: true, edgesSelectable: true, edgeStyle: 'curve', collapsedGroupIds: new Set(), sizes: new Map(), lodThreshold: 0.05 }), plain)
  for (const name of ['vw-network-overlay', 'vw-lod-low', 'vw-group-toggle', 'vw-waypoint', 'vw-resize-handle']) assert.equal(plain.includes(name), false)
})

test('NetworkGraph renders collapsed groups, edge styles, waypoints, sizes and the LOD class on the server', async () => {
  const collapsible = await render({ groups, collapsibleGroups: true })
  assert.match(collapsible, /class="vw-network-overlay"/)
  assert.match(collapsible, /aria-label="Collapse group Group" aria-expanded="true" data-vw-toggle="g"/)
  const collapsed = await render({ groups, collapsibleGroups: true, collapsedGroupIds: new Set(['g']), labels: { expandGroup: 'Open' } })
  assert.match(collapsed, /aria-label="Open Group" aria-expanded="false" data-vw-toggle="g"/)
  assert.match(collapsed, /data-vw-node="g"[^>]*aria-label="Group 2 nodes"/)
  assert.equal(collapsed.includes('data-vw-node="b"'), false)
  assert.equal(collapsed.includes('class="vw-network-group"'), false)
  // A controlled set applies without toggles; unknown IDs are ignored.
  const controlled = await render({ groups, collapsedGroupIds: new Set(['g', 'gone']) })
  assert.match(controlled, /data-vw-node="g"/)
  assert.equal(controlled.includes('vw-group-toggle'), false)

  const orthogonal = await render({ edgeStyle: 'orthogonal' })
  const layout = layoutLayeredGraph(nodes, edges)
  const expected = routeGraphEdges(layout, edges, byId(nodes), { style: 'orthogonal', cornerRadius: 6 })
  assert.ok(orthogonal.includes(`d="${expected.paths.get('de')}"`))
  const straight = await render({ edgeStyle: 'straight', edges: [{ ...edges[0], points: [{ x: 190, y: 200 }] }] })
  assert.match(straight, /d="M [\d.]+ [\d.]+ L 190 200 L [\d.]+ [\d.]+"/)

  const sized = await render({ sizes: new Map([['a', { width: 220, height: 90 }]]) })
  assert.match(sized, /<svg width="220" height="90" overflow="hidden">/)

  // The initial camera scale is below 3 and above 0.05.
  assert.match(await render({ lodThreshold: 3 }), /class="vw-network vw-lod-low"/)
  assert.equal((await render({ lodThreshold: 0.05 })).includes('vw-lod-low'), false)
  for (const lodThreshold of [0, -1, 3.5, NaN]) await assert.rejects(render({ lodThreshold }), RangeError)
  await assert.rejects(render({ edgeStyle: 'wavy' }), { name: 'RangeError', message: /Unknown edge style: wavy/ })
  await assert.rejects(render({ resizable: true, minNodeSize: { width: 0, height: 10 } }), RangeError)
  await assert.rejects(render({ sizes: new Map([['a', { width: -5, height: 10 }]]) }), RangeError)
})

test('NetworkGraph passes the camera scale to node and edge slots and renders resize and waypoint handles', async () => {
  const scales = []
  await renderToString(createSSRApp({
    render: () => h(NetworkGraph, { nodes, edges }, {
      node: ({ node, scale }) => (scales.push(scale), h('text', node.label)),
      edge: ({ path, scale }) => (scales.push(scale), h('path', { d: path })),
    }),
  }))
  assert.equal(scales.length, nodes.length + edges.length)
  assert.ok(scales.every(scale => scale === scales[0] && scale > 0 && scale <= 3))

  const resizable = await render({ resizable: true, selectedId: 'b' })
  for (const corner of ['top left', 'top right', 'bottom left', 'bottom right']) assert.match(resizable, new RegExp(`aria-label="Resize B · ${corner}"`))
  assert.equal((await render({ resizable: true, selectedId: 'b', nodes: nodes.map(node => node.id === 'b' ? { ...node, resizable: false } : node) })).includes('vw-resize-handle'), false)
  assert.equal((await render({ resizable: true, selectedIds: new Set(['a', 'b']) })).includes('vw-resize-handle'), false)
  // Without a selected edge there are no waypoint handles, but edges get their hit areas.
  const editable = await render({ editableEdges: true })
  assert.match(editable, /aria-label="Select edge feeds"/)
  assert.equal(editable.includes('vw-waypoint'), false)
})
