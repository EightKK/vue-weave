import assert from 'node:assert/strict'
import { test } from 'node:test'
import { graphFlowBands, layoutFlowGraph, renderGraphSvg } from '@eightkk/vue-weave/core'
import { NetworkGraph, layoutFlowGraph as rootLayoutFlowGraph } from '@eightkk/vue-weave'
import { chainEdges, nodeIds } from './helpers/builders.mjs'
import { renderWith } from './helpers/ssr.mjs'

const node = (id, label = id) => ({ id, label })
const flowEdge = (id, from, to, quantity, unit = 'pcs') => ({ id, from, to, data: { quantity, unit } })
const quantity = edge => edge.data.quantity
const unit = edge => edge.data.unit

// A lot of 100 splits 60/40, both lines merge at inspection, line B loses 4 and inspection sends 10 to rework and back.
const nodes = [node('lot', 'Lot'), node('a', 'Line A'), node('b', 'Line B'), node('inspect', 'Inspect'), node('rework', 'Rework'), node('pack', 'Pack')]
const edges = [
  flowEdge('lot-a', 'lot', 'a', 60), flowEdge('lot-b', 'lot', 'b', 40),
  flowEdge('a-inspect', 'a', 'inspect', 60), flowEdge('b-inspect', 'b', 'inspect', 36),
  flowEdge('inspect-pack', 'inspect', 'pack', 86), flowEdge('inspect-rework', 'inspect', 'rework', 10),
  flowEdge('rework-inspect', 'rework', 'inspect', 10),
]
const options = { quantity, unit: 'pcs', scale: { pixelsPerUnit: 2 } }
const byId = list => new Map(list.map(item => [item.id ?? item.edgeId, item]))
const cross = (box, direction = 'LR') => direction === 'TB' || direction === 'BT' ? box.width : box.height

test('layoutFlowGraph splits a lot of 100 into bands in exact 60:40 proportion on one scale across ranks', () => {
  assert.equal(rootLayoutFlowGraph, layoutFlowGraph)
  for (const scale of [{ pixelsPerUnit: 2 }, { fitExtent: 360 }, { fitExtent: 123.4 }]) {
    const flow = layoutFlowGraph(nodes, edges, { ...options, scale })
    const bands = byId(flow.bands)
    assert.ok(flow.scale > 0)
    for (const band of flow.bands) assert.equal(band.thickness, band.quantity * flow.scale, band.edgeId)
    assert.equal(bands.get('lot-a').thickness / bands.get('lot-b').thickness, 60 / 40)
    // The same 60 pieces have the same width in the next rank.
    assert.equal(bands.get('a-inspect').thickness, bands.get('lot-a').thickness)
    // The node of the split is as large as the lot and the two bands together.
    const lot = byId(flow.nodes).get('lot')
    assert.equal(cross(lot.box), 100 * flow.scale)
    assert.equal(bands.get('lot-a').thickness + bands.get('lot-b').thickness, cross(lot.box))
  }
  // fitExtent picks the largest scale at which the fullest rank fits, gaps included. Inspection also holds the 10
  // pieces of its rework loop, so its rank (106 units, no gap) sets the scale.
  const fitted = layoutFlowGraph(nodes, edges, { ...options, scale: { fitExtent: 360 } })
  assert.equal(fitted.scale, Math.min(360 / 100, (360 - 16) / 100, 360 / 106, (360 - 16) / 96))
  assert.equal(fitted.scale, 360 / 106)
  assert.equal(fitted.unit, 'pcs')
})

test('node size is the larger of inflow and outflow, and a difference is reported, never balanced', () => {
  const flow = layoutFlowGraph(nodes, edges, options)
  const result = byId(flow.nodes), bands = byId(flow.bands)
  const b = result.get('b')
  assert.deepEqual([b.inflow, b.outflow, b.difference, b.value], [40, 36, -4, 40])
  assert.equal(cross(b.box), 80)
  // The band out of line B keeps its 36 pieces; the out stack is shorter than the box.
  assert.equal(bands.get('b-inspect').thickness, 72)
  assert.equal(bands.get('lot-b').targetOffset, 0)
  assert.equal(bands.get('b-inspect').sourceOffset, 0)
  const lot = result.get('lot'), pack = result.get('pack')
  assert.deepEqual([lot.inflow, lot.outflow, lot.difference], [0, 100, 100])
  assert.deepEqual([pack.inflow, pack.outflow, pack.difference], [86, 0, -86])
  // A node with a gain: more leaves than arrives.
  const gain = layoutFlowGraph([node('x'), node('y'), node('z')], [flowEdge('x-y', 'x', 'y', 5), flowEdge('y-z', 'y', 'z', 8)], options)
  const y = byId(gain.nodes).get('y')
  assert.deepEqual([y.inflow, y.outflow, y.difference, y.value], [5, 8, 3, 8])
  assert.equal(cross(y.box), 16)
  // The inputs are not modified.
  assert.deepEqual(edges[0], flowEdge('lot-a', 'lot', 'a', 60))
})

test('quantities in different units are never added: other units are listed and left out', () => {
  const mixed = [
    ...edges,
    { id: 'overhead-a', from: 'overhead', to: 'a', data: { quantity: 300, unit: 'EUR' } },
    { id: 'overhead-b', from: 'overhead', to: 'b', data: { quantity: 200, unit: 'EUR' } },
  ]
  const all = [...nodes, node('overhead', 'Overhead')]
  const pieces = layoutFlowGraph(all, mixed, { quantity, unit, displayUnit: 'pcs', scale: { pixelsPerUnit: 2 } })
  assert.deepEqual(pieces.excluded, [
    { edgeId: 'overhead-a', from: 'overhead', to: 'a', unit: 'EUR', quantity: 300 },
    { edgeId: 'overhead-b', from: 'overhead', to: 'b', unit: 'EUR', quantity: 200 },
  ])
  assert.equal(pieces.paths.has('overhead-a'), false)
  assert.ok(pieces.bands.every(band => band.unit === 'pcs'))
  const a = byId(pieces.nodes).get('a')
  assert.deepEqual([a.inflow, a.outflow], [60, 60])
  assert.equal(byId(pieces.nodes).get('overhead').value, 0)
  assert.equal(cross(byId(pieces.nodes).get('overhead').box), 2, 'a node without flow keeps minNodeSize')
  const cost = layoutFlowGraph(all, mixed, { quantity, unit, displayUnit: 'EUR', scale: { pixelsPerUnit: 1 } })
  assert.deepEqual(cost.bands.map(band => band.edgeId), ['overhead-a', 'overhead-b'])
  assert.equal(cost.excluded.length, edges.length)
  assert.equal(byId(cost.nodes).get('a').inflow, 300)
  // A string unit that differs from displayUnit leaves everything out.
  assert.equal(layoutFlowGraph(nodes, edges, { quantity, unit: 'pcs', displayUnit: 'kg' }).bands.length, 0)
  // The unit is required, and an accessor needs the unit to display.
  assert.throws(() => layoutFlowGraph(nodes, edges, { quantity }), /needs a unit/)
  assert.throws(() => layoutFlowGraph(nodes, edges, { quantity, unit: '' }), /needs a unit/)
  assert.throws(() => layoutFlowGraph(nodes, edges, { quantity, unit }), /needs a displayUnit/)
  assert.throws(() => layoutFlowGraph(nodes, [{ ...edges[0], data: { quantity: 1, unit: '' } }], { quantity, unit, displayUnit: 'pcs' }), /Flow unit of edge lot-a/)
})

test('quantities must be finite numbers of at least 0; a zero keeps a hairline band; bad references and sizes throw', () => {
  for (const bad of [-1, Number.NaN, Infinity, '5', undefined]) {
    assert.throws(() => layoutFlowGraph(nodes, [flowEdge('e', 'lot', 'a', bad)], options), RangeError, String(bad))
  }
  // Every edge is validated, also one in another unit.
  assert.throws(() => layoutFlowGraph(nodes, [flowEdge('e', 'lot', 'a', -2, 'EUR')], { quantity, unit, displayUnit: 'pcs' }), RangeError)
  const zero = layoutFlowGraph(nodes, [flowEdge('lot-a', 'lot', 'a', 0), flowEdge('lot-b', 'lot', 'b', 4)], options)
  const band = byId(zero.bands).get('lot-a')
  assert.deepEqual([band.thickness, band.width], [0, 1])
  assert.ok(zero.paths.has('lot-a'))
  assert.equal(layoutFlowGraph(nodes, [flowEdge('lot-a', 'lot', 'a', 0)], { ...options, minBandWidth: 0 }).bands[0].width, 0)
  assert.throws(() => layoutFlowGraph(nodes, [flowEdge('e', 'lot', 'missing', 1)], options), { name: 'Error', message: 'Unknown node in graph edge e: missing' })
  assert.throws(() => layoutFlowGraph([...nodes, node('lot')], [], options), /Duplicate graph node ID/)
  assert.throws(() => layoutFlowGraph(nodes, edges, { unit: 'pcs' }), /quantity accessor/)
  for (const bad of [
    { nodeThickness: 0 }, { nodeThickness: Number.NaN }, { nodeGap: -1 }, { rankGap: Infinity }, { padding: -1 }, { minNodeSize: 0 },
    { minBandWidth: -1 }, { referenceGap: Number.NaN }, { scale: { pixelsPerUnit: 0 } }, { scale: { pixelsPerUnit: -1 } },
    { scale: { fitExtent: 0 } }, { scale: {} }, { direction: 'XY' }, { crossingSweeps: 0 }, { scale: { fitExtent: 10 }, nodeGap: 20 },
  ]) {
    assert.throws(() => layoutFlowGraph(nodes, edges, { ...options, ...bad }), RangeError, JSON.stringify(bad))
  }
})

test('cycles and self-loops terminate and become flagged reference bands, counted apart from the node totals', () => {
  const flow = layoutFlowGraph(nodes, [...edges, flowEdge('pack-pack', 'pack', 'pack', 3)], options)
  const bands = byId(flow.bands), result = byId(flow.nodes)
  assert.deepEqual(flow.bands.filter(band => band.reference).map(band => band.edgeId), ['rework-inspect', 'pack-pack'])
  assert.equal(bands.get('pack-pack').selfLoop, true)
  assert.equal(bands.get('rework-inspect').selfLoop, false)
  // Never dropped: each loop keeps its width and path.
  assert.equal(bands.get('rework-inspect').thickness, 20)
  assert.match(bands.get('rework-inspect').path, /^M [\d. ]+ L/)
  const inspect = result.get('inspect')
  assert.deepEqual([inspect.inflow, inspect.outflow, inspect.referenceInflow, inspect.referenceOutflow, inspect.value], [96, 96, 10, 0, 96])
  // The box also holds the reference stack, below the forward bands.
  assert.equal(cross(inspect.box), 106 * 2)
  assert.equal(bands.get('rework-inspect').targetOffset, 96 * 2)
  const rework = result.get('rework')
  assert.deepEqual([rework.inflow, rework.outflow, rework.referenceOutflow, rework.difference], [10, 0, 10, -10])
  // Loops run beside the ranks, below the nodes.
  const lowest = Math.max(...flow.nodes.map(item => item.box.y + item.box.height))
  assert.ok(flow.height >= lowest + 20 + 3 + 12)
  // A large cycle and a dense cyclic graph still terminate.
  const ring = Array.from({ length: 2000 }, (_, i) => node('r' + i))
  const ringEdges = ring.map((item, i) => flowEdge('e' + i, item.id, ring[(i + 1) % ring.length].id, 1))
  const looped = layoutFlowGraph(ring, ringEdges, options)
  assert.deepEqual(looped.bands.filter(band => band.reference).map(band => band.edgeId), ['e1999'])
  const dense = Array.from({ length: 30 }, (_, i) => node('d' + i))
  const denseEdges = dense.flatMap(a => dense.map(b => flowEdge(a.id + '>' + b.id, a.id, b.id, 1)))
  const complete = layoutFlowGraph(dense, denseEdges, options)
  assert.equal(complete.bands.length, 900)
  // Removing the reference bands leaves forward bands that strictly increase in rank.
  const rank = byId(complete.nodes)
  for (const band of complete.bands.filter(item => !item.reference)) assert.ok(rank.get(band.to).rank > rank.get(band.from).rank)
})

test('bands are stacked by the position of their other end, so a split does not cross itself', () => {
  const flow = layoutFlowGraph(nodes, edges, options)
  const bands = byId(flow.bands), result = byId(flow.nodes)
  const upper = result.get('a').box.y < result.get('b').box.y ? 'a' : 'b'
  const lower = upper === 'a' ? 'b' : 'a'
  assert.ok(bands.get('lot-' + upper).sourceOffset < bands.get('lot-' + lower).sourceOffset)
  assert.equal(bands.get('lot-' + lower).sourceOffset, bands.get('lot-' + upper).thickness)
  // Into inspection: the band from the upper line arrives above the one from the lower line.
  assert.ok(bands.get(upper + '-inspect').targetOffset < bands.get(lower + '-inspect').targetOffset)
  // Ranks follow the flow; nodes of one rank do not overlap.
  assert.deepEqual(['lot', 'a', 'b', 'inspect', 'rework', 'pack'].map(id => result.get(id).rank), [0, 1, 1, 2, 3, 3])
  for (const a of flow.nodes) {
    for (const b of flow.nodes) {
      if (a === b || a.rank !== b.rank) continue
      assert.ok(a.box.y + a.box.height <= b.box.y || b.box.y + b.box.height <= a.box.y, a.id + ' ' + b.id)
    }
  }
  // Crossing reduction orders a rank by its neighbours: here the input order would cross.
  const twisted = layoutFlowGraph(
    [node('s1'), node('s2'), node('t2'), node('t1')],
    [flowEdge('1', 's1', 't1', 5), flowEdge('2', 's2', 't2', 5)], options,
  )
  const order = byId(twisted.nodes)
  assert.equal(order.get('s1').order < order.get('s2').order, order.get('t1').order < order.get('t2').order)
})

test('all four directions place ranks along the flow and attach bands to the downstream and upstream sides', () => {
  const sides = { LR: ['right', 'left'], RL: ['left', 'right'], TB: ['bottom', 'top'], BT: ['top', 'bottom'] }
  const base = layoutFlowGraph(nodes, edges, options)
  for (const direction of ['LR', 'RL', 'TB', 'BT']) {
    const flow = layoutFlowGraph(nodes, edges, { ...options, direction })
    assert.equal(flow.direction, direction)
    const lot = byId(flow.nodes).get('lot').box, pack = byId(flow.nodes).get('pack').box
    const along = { LR: pack.x - lot.x, RL: lot.x - pack.x, TB: pack.y - lot.y, BT: lot.y - pack.y }[direction]
    assert.ok(along > 0, direction)
    assert.equal(cross(lot, direction), 200)
    for (const band of flow.bands) assert.deepEqual([band.sourceSide, band.targetSide], sides[direction])
    // The band start lies on the source side at its offset.
    const band = byId(flow.bands).get('lot-b'), start = band.path.match(/^M (\S+) (\S+)/).slice(1).map(Number)
    const expected = {
      LR: [lot.x + lot.width, lot.y + band.sourceOffset + band.thickness / 2],
      RL: [lot.x, lot.y + band.sourceOffset + band.thickness / 2],
      TB: [lot.x + band.sourceOffset + band.thickness / 2, lot.y + lot.height],
      BT: [lot.x + band.sourceOffset + band.thickness / 2, lot.y],
    }[direction]
    assert.deepEqual(start, expected, direction)
    // RL mirrors LR and TB transposes it.
    for (const item of flow.nodes) {
      const plain = byId(base.nodes).get(item.id).box
      if (direction === 'RL') assert.deepEqual([item.box.x, item.box.y], [base.width - plain.x - plain.width, plain.y])
      if (direction === 'TB') assert.deepEqual([item.box.x, item.box.y, item.box.width, item.box.height], [plain.y, plain.x, plain.height, plain.width])
    }
    if (direction === 'TB' || direction === 'BT') assert.deepEqual([flow.width, flow.height], [base.height, base.width])
    else assert.deepEqual([flow.width, flow.height], [base.width, base.height])
  }
})

test('the projection is deterministic and every item maps back to the original IDs', () => {
  const run = () => {
    const flow = layoutFlowGraph(nodes, edges, { ...options, scale: { fitExtent: 300 } })
    return JSON.stringify({ ...flow, boxes: [...flow.boxes], paths: [...flow.paths], edgeLabels: [...flow.edgeLabels] })
  }
  assert.equal(run(), run())
  const flow = layoutFlowGraph(nodes, edges, options)
  assert.deepEqual(flow.nodes.map(item => item.id), nodes.map(item => item.id))
  assert.deepEqual(flow.bands.map(band => band.edgeId), edges.map(edge => edge.id))
  for (const band of flow.bands) {
    const edge = edges.find(item => item.id === band.edgeId)
    assert.deepEqual([band.from, band.to, band.quantity], [edge.from, edge.to, edge.data.quantity])
    assert.equal(flow.paths.get(band.edgeId), band.path)
  }
  assert.deepEqual([...flow.boxes.keys()], nodes.map(item => item.id))
  assert.equal(byId(flow.bands).get('a-inspect').label, 'Line A → Inspect: 60 pcs')
  const custom = layoutFlowGraph(nodes, edges, { ...options, nodeLabel: item => item.id.toUpperCase(), formatQuantity: (value, name) => `${value.toFixed(1)} ${name}` })
  assert.equal(byId(custom.bands).get('a-inspect').label, 'A → INSPECT: 60.0 pcs')
  assert.deepEqual(graphFlowBands(flow).get('rework-inspect'), { width: 20, reference: true, label: 'Rework → Inspect: 10 pcs' })
})

test('the flow layout lays out a 12,000-node chain without recursion', () => {
  const chain = Array.from({ length: 12000 }, (_, i) => node('n' + i))
  const links = chain.slice(1).map((item, i) => flowEdge('e' + i, chain[i].id, item.id, 1))
  const flow = layoutFlowGraph(chain, links, { quantity, unit: 'pcs' })
  assert.equal(flow.nodes.at(-1).rank, 11999)
  assert.equal(flow.bands.length, 11999)
  assert.ok(flow.bands.every(band => !band.reference && band.thickness === flow.scale))
})

test('the flow layout lays out a 12,000-node single cycle without recursion', () => {
  const ids = nodeIds(12000)
  const links = chainEdges(ids, true).map(edge => ({ ...edge, data: { quantity: 1, unit: 'pcs' } }))
  const flow = layoutFlowGraph(ids.map(id => node(id)), links, { quantity, unit: 'pcs' })
  assert.equal(flow.boxes.size, 12000)
  assert.equal(flow.bands.length, 12000)
  // The edge that closes the cycle runs against the flow and becomes the one reference band.
  assert.equal(flow.bands.filter(band => band.reference).length, 1)
})

test('the default scale grows for a rank too full for 360 units; an explicit fitExtent still throws', () => {
  const leaves = Array.from({ length: 30 }, (_, i) => node('leaf' + i))
  const fan = [node('root'), ...leaves]
  const links = leaves.map(leaf => flowEdge('root-' + leaf.id, 'root', leaf.id, 1))
  const flow = layoutFlowGraph(fan, links, { quantity, unit: 'pcs' })
  assert.ok(flow.scale > 0)
  assert.equal(flow.bands.length, 30)
  // The leaves keep their gaps and do not overlap.
  const boxes = leaves.map(leaf => flow.boxes.get(leaf.id)).sort((a, b) => a.y - b.y)
  for (let i = 1; i < boxes.length; i++) assert.ok(boxes[i].y >= boxes[i - 1].y + boxes[i - 1].height + 16 - 1e-9)
  assert.throws(() => layoutFlowGraph(fan, links, { quantity, unit: 'pcs', scale: { fitExtent: 360 } }), RangeError)
  // Small graphs keep the 360-unit default.
  for (const direction of ['LR', 'TB']) {
    assert.deepEqual(layoutFlowGraph(nodes, edges, { quantity, unit: 'pcs', direction }),
      layoutFlowGraph(nodes, edges, { quantity, unit: 'pcs', direction, scale: { fitExtent: 360 } }))
  }
})

test('renderGraphSvg draws bands with their widths, reference bands dashed, and nothing changes without edgeBands', () => {
  const flow = layoutFlowGraph(nodes, edges, options)
  const bands = graphFlowBands(flow)
  const svg = renderGraphSvg(flow, nodes, edges, { edgeBands: bands })
  assert.equal((svg.match(/<path class="vw-flow-band/g) ?? []).length, edges.length)
  assert.match(svg, /<path class="vw-flow-band" d="[^"]+" fill="none" stroke="[^"]+" stroke-width="120" stroke-opacity="0.5"><title>Line A → Inspect: 60 pcs<\/title><\/path>/)
  assert.match(svg, /stroke-width="72"[^>]*><title>Line B → Inspect: 36 pcs/)
  const loop = svg.match(/<path class="vw-flow-band vw-is-reference"[^>]*stroke-width="20" stroke-opacity="0.35" stroke-dasharray="([\d.]+) ([\d.]+)"><title>Rework → Inspect: 10 pcs/)
  assert.ok(loop)
  // The dash grows with a wide band so it does not read as a comb of stripes, and the gaps are evened out so the loop
  // starts and ends with a dash at its nodes instead of ending in a gap beside the target.
  const [dash, gap] = loop.slice(1).map(Number)
  assert.equal(dash, 40)
  assert.ok(gap >= 15, `gap ${gap}`)
  const points = [...flow.paths.get('rework-inspect').matchAll(/(-?[\d.]+) (-?[\d.]+)/g)].map(match => [Number(match[1]), Number(match[2])])
  const length = points.slice(1).reduce((total, point, i) => total + Math.hypot(point[0] - points[i][0], point[1] - points[i][1]), 0)
  const count = Math.round((length + gap) / (dash + gap))
  assert.ok(Math.abs(count * dash + (count - 1) * gap - length) < 0.05 * count, 'whole dashes')
  // A thin band keeps the short dash; a band along a curve keeps the plain pattern.
  const thinReference = renderGraphSvg(flow, nodes, edges, { edgeBands: new Map([['lot-a', { width: 4, reference: true }]]) })
  assert.match(thinReference, /class="vw-flow-band vw-is-reference"[^>]*stroke-width="4" stroke-opacity="0.35" stroke-dasharray="10 6"/)
  const curved = renderGraphSvg(flow, nodes, edges, { edgeBands: new Map([['lot-a', { width: 20, reference: true }]]) })
  assert.match(curved, /class="vw-flow-band vw-is-reference"[^>]*stroke-width="20" stroke-opacity="0.35" stroke-dasharray="40 15"/)
  // Bands have no markers, and the widest band comes first.
  assert.doesNotMatch(svg, /vw-flow-band[^>]*marker-end/)
  const widths = [...svg.matchAll(/class="vw-flow-band[^"]*"[^>]*stroke-width="([\d.]+)"/g)].map(match => Number(match[1]))
  assert.deepEqual(widths, [...widths].sort((a, b) => b - a))
  // A highlighted band takes the highlight colour, and no arrow marker is written for it.
  const strong = renderGraphSvg(flow, nodes, edges, { edgeBands: bands, highlightedEdgeIds: ['lot-a'], highlightColor: '#ff0000' })
  assert.match(strong, /<path class="vw-flow-band" d="[^"]+" fill="none" stroke="#ff0000" stroke-width="120" stroke-opacity="0.7">/)
  assert.doesNotMatch(strong, /arrow-highlight/)
  // The exported bounds include the band width.
  const viewBox = svg.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/).slice(1).map(Number)
  assert.ok(viewBox[1] >= flow.height, 'height')
  // Without bands, the same layout exports plain edges.
  const plain = renderGraphSvg(flow, nodes, edges)
  assert.equal(renderGraphSvg(flow, nodes, edges, { edgeBands: undefined }), plain)
  assert.doesNotMatch(plain, /vw-flow-band/)
  assert.throws(() => renderGraphSvg(flow, nodes, edges, { edgeBands: new Map([['lot-a', { width: -1 }]]) }), RangeError)
})

const render = renderWith(NetworkGraph, { nodes, edges })

test('NetworkGraph draws bands with real width and named hit areas on the server; the markup without edgeBands is unchanged', async () => {
  const flow = layoutFlowGraph(nodes, edges, options)
  const plain = await render({ edgesSelectable: true })
  assert.equal(await render({ edgesSelectable: true, edgeBands: undefined }), plain)
  // An empty map draws every edge as before.
  assert.equal(await render({ edgesSelectable: true, edgeBands: new Map() }), plain)
  assert.doesNotMatch(plain, /vw-network-band|vw-is-band|style="stroke-width/)
  assert.match(plain, /<path class="vw-edge-hit" d=/)
  const html = await render({ layout: () => flow, edgeBands: graphFlowBands(flow), edgesSelectable: true })
  assert.equal((html.match(/class="vw-network-edge vw-network-band/g) ?? []).length, edges.length)
  assert.match(html, /<path class="vw-network-edge vw-network-band" d="[^"]+" style="stroke-width:120px;"/)
  assert.match(html, /<path class="vw-network-edge vw-network-band vw-is-reference" d="[^"]+" style="stroke-width:20px;--vw-band-dash:40 [\d.]+;"/)
  assert.match(html, /class="vw-edge-hit vw-is-band" style="stroke-width:120px;"[^>]*aria-label="Select edge Line A → Inspect: 60 pcs"/)
  assert.match(html, /aria-label="Select edge Rework → Inspect: 10 pcs"/)
  // Bands never get markers, and the widest is drawn first.
  assert.doesNotMatch(html, /vw-network-band[^>]*marker-end/)
  const widths = [...html.matchAll(/vw-network-band[^"]*" d="[^"]+" style="stroke-width:([\d.]+)px/g)].map(match => Number(match[1]))
  assert.deepEqual(widths, [...widths].sort((a, b) => b - a))
  // A thin band keeps the usual hit width; an edge without a band keeps its default drawing and name.
  const thin = await render({ edgesSelectable: true, edgeBands: new Map([['lot-a', { width: 3 }]]) })
  assert.match(thin, /class="vw-edge-hit vw-is-band" style="stroke-width:14px;"[^>]*aria-label="Select edge lot-a"/)
  assert.match(thin, /<path class="vw-network-edge" d="[^"]+" marker-end=/)
  await assert.rejects(render({ edgeBands: new Map([['lot-a', { width: Number.NaN }]]) }), RangeError)
})
