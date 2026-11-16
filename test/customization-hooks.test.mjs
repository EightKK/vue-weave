import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createTimeScale, dependencyPath, renderTimelineSvg } from 'vue-weave/core'
import { GanttChart, NetworkGraph } from 'vue-weave'

const hour = 3_600_000

test('dependencyPath keeps the orthogonal default and draws rounded and curved connectors', () => {
  assert.equal(dependencyPath(10, 20, 110, 80), 'M 10 20 H 60 V 80 H 110')
  assert.equal(dependencyPath(10, 20, 110, 80, 'orthogonal'), dependencyPath(10, 20, 110, 80))
  assert.equal(dependencyPath(110, 20, 10, 80), 'M 110 20 h 10 V 50 H 0 V 80 H 10')

  const rounded = dependencyPath(10, 20, 110, 80, 'rounded')
  assert.equal(rounded, 'M 10 20 L 54 20 Q 60 20 60 26 L 60 74 Q 60 80 66 80 L 110 80')
  // Backward links loop around through the middle with four rounded corners, ending at the target.
  const back = dependencyPath(110, 20, 10, 80, 'rounded')
  assert.equal((back.match(/Q/g) ?? []).length, 4)
  assert.match(back, /^M 110 20 .* L 10 80$/)
  // A corner radius never exceeds half of a short segment.
  assert.equal(dependencyPath(0, 0, 40, 4, 'rounded'), 'M 0 0 L 18 0 Q 20 0 20 2 L 20 2 Q 20 4 22 4 L 40 4')
  // Same row: the forward path is a straight line, the backward one loops below the row.
  assert.equal(dependencyPath(0, 10, 40, 10, 'rounded'), 'M 0 10 L 20 10 L 20 10 L 40 10')
  assert.match(dependencyPath(40, 10, 0, 10, 'rounded'), /Q 50 24/)

  assert.equal(dependencyPath(10, 20, 110, 80, 'curve'), 'M 10 20 C 60 20 60 80 110 80')
  assert.equal(dependencyPath(110, 20, 10, 80, 'curve'), 'M 110 20 C 140 20 140 50 60 50 S -20 80 10 80')
  assert.throws(() => dependencyPath(0, 0, 10, 10, 'wavy'), RangeError)
})

test('renderTimelineSvg draws dependencies in the requested style', () => {
  const rows = [{ id: 'r1', label: 'Row 1' }, { id: 'r2', label: 'Row 2' }]
  const bars = [
    { id: 'a', rowId: 'r1', label: 'A', start: 0, end: 2 * hour },
    { id: 'b', rowId: 'r2', label: 'B', start: 3 * hour, end: 4 * hour },
  ]
  const dependencies = [{ id: 'ab', from: 'a', to: 'b' }]
  const scale = createTimeScale({ start: 0, end: 6 * hour }, 40 / hour)
  const plain = renderTimelineSvg(rows, bars, dependencies, scale)
  assert.equal(renderTimelineSvg(rows, bars, dependencies, scale, { dependencyStyle: 'orthogonal' }), plain)
  assert.match(renderTimelineSvg(rows, bars, dependencies, scale, { dependencyStyle: 'curve' }), /d="M [\d.]+ [\d.]+ C /)
  assert.match(renderTimelineSvg(rows, bars, dependencies, scale, { dependencyStyle: 'rounded' }), /d="M [^"]* Q /)
  assert.throws(() => renderTimelineSvg(rows, bars, dependencies, scale, { dependencyStyle: 'wavy' }), RangeError)
})

const nodes = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }]
const edges = [{ id: 'ab', from: 'a', to: 'b' }, { id: 'bc', from: 'b', to: 'c' }]
function renderGraph(props = {}, slots) {
  return renderToString(createSSRApp({ render: () => h(NetworkGraph, { nodes, edges, ...props }, slots) }))
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

const rows = [{ id: 'r1', label: 'Row 1' }, { id: 'r2', label: 'Row 2' }]
const bars = [
  { id: 'a', rowId: 'r1', label: 'A', start: hour, end: 3 * hour },
  { id: 'b', rowId: 'r2', label: 'B', start: 5 * hour, end: 6 * hour },
  { id: 'm', rowId: 'r2', label: 'Launch', start: 7 * hour, end: 7 * hour },
]
const chartProps = { rows, bars, dependencies: [{ id: 'ab', from: 'a', to: 'b' }], range: { start: 0, end: 10 * hour }, pixelsPerUnit: 10 / hour }
function renderChart(props = {}, slots) {
  const app = createSSRApp({ render: () => h(GanttChart, { ...chartProps, ...props }, slots) })
  app.config.errorHandler = () => {}
  return renderToString(app)
}
const linkPaths = html => [...html.matchAll(/<path class="[^"]*" d="(M [^"]+)" marker-end/g)].map(match => match[1])

test('GanttChart dependencyStyle shapes the connectors and validates its value', async () => {
  const plain = await renderChart()
  assert.equal(await renderChart({ dependencyStyle: 'orthogonal' }), plain)
  assert.deepEqual(linkPaths(plain), ['M 30 33 H 40 V 99 H 50'])
  assert.deepEqual(linkPaths(await renderChart({ dependencyStyle: 'curve' })), ['M 30 33 C 40 33 40 99 50 99'])
  assert.match(linkPaths(await renderChart({ dependencyStyle: 'rounded' }))[0], / Q /)
  const reported = []
  const html = await renderChart({ dependencyStyle: 'wavy', onValidationError: error => reported.push(error.message) })
  assert.deepEqual(reported, ['Unknown dependencyStyle: wavy'])
  assert.match(html, /No rows to display/)
})

test('GanttChart milestones with bar slot content are marked so the diamond does not clip the content', async () => {
  const bar = ({ bar }) => h('span', { class: 'custom' }, bar.label)
  const slotted = await renderChart({}, { bar })
  assert.match(slotted, /class="vw-gantt-bar vw-tone-blue vw-is-solid vw-is-milestone vw-has-slot"/)
  assert.equal((slotted.match(/vw-has-slot/g) ?? []).length, 1)
  assert.doesNotMatch(await renderChart(), /vw-has-slot/)
})

test('GanttChart bars drop their native title while the tooltip slot replaces it', async () => {
  const plain = await renderChart()
  assert.match(plain, /title="A 01:00–03:00"/)
  const withTooltip = await renderChart({}, { tooltip: ({ bar }) => bar.label })
  assert.doesNotMatch(withTooltip, /title="A 01:00–03:00"/)
  assert.match(withTooltip, /aria-label="A 01:00–03:00"/)
})

test('GanttChart stickyBandLabels leaves the server markup unchanged before scrolling', async () => {
  const headerBands = [[{ start: 0, end: 10 * hour, label: 'Shift' }]]
  assert.equal(await renderChart({ headerBands, stickyBandLabels: true }), await renderChart({ headerBands }))
})
