import assert from 'node:assert/strict'
import { test } from 'node:test'
import { graphPathBounds, graphSwimlaneAt, layoutSwimlaneGraph, renderGraphSvg, routeGraphEdges } from 'vue-weave/core'
import { NetworkGraph, layoutSwimlaneGraph as rootLayoutSwimlaneGraph } from 'vue-weave'
import { renderComponent } from './helpers/ssr.mjs'

const directions = ['LR', 'RL', 'TB', 'BT']
const lanes = [{ id: 'buy', label: 'Purchasing' }, { id: 'make', label: 'Machining' }, { id: 'check', label: 'Inspection' }, 'ship']
const nodes = [
  { id: 'order', label: 'Order', lane: 'buy' },
  { id: 'receive', label: 'Receive', lane: 'buy' },
  { id: 'cut', label: 'Cut', lane: 'make' },
  { id: 'mill', label: 'Mill', lane: 'make' },
  { id: 'drill', label: 'Drill', lane: 'make' },
  { id: 'measure', label: 'Measure', lane: 'check' },
]
const edges = [
  { id: 'e1', from: 'order', to: 'receive' },
  { id: 'e2', from: 'receive', to: 'cut' },
  { id: 'e3', from: 'receive', to: 'mill' },
  { id: 'e4', from: 'cut', to: 'drill' },
  { id: 'e5', from: 'mill', to: 'measure', label: 'hand-over' },
  { id: 'e6', from: 'drill', to: 'measure' },
]
const laneOf = node => node.lane
const inside = (box, rect) => box.x >= rect.x && box.y >= rect.y && box.x + box.width <= rect.x + rect.width && box.y + box.height <= rect.y + rect.height
const overlaps = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
// Lane positions across the flow: top edges for horizontal lanes, left edges for vertical ones.
const across = (layout, direction) => layout.lanes.map(lane => direction === 'TB' || direction === 'BT' ? lane.x : lane.y)
const ascending = values => values.every((value, i) => i === 0 || value > values[i - 1])

test('layoutSwimlaneGraph is exported from both entry points', () => {
  assert.equal(rootLayoutSwimlaneGraph, layoutSwimlaneGraph)
})

for (const direction of directions) {
  test(`${direction}: every node lies inside its own lane band, clear of the header, and lanes keep the caller's order`, () => {
    const layout = layoutSwimlaneGraph(nodes, edges, { lanes, laneOf, direction })
    assert.deepEqual(layout.lanes.map(lane => lane.id), ['buy', 'make', 'check', 'ship'])
    assert.deepEqual(layout.lanes.map(lane => lane.label), ['Purchasing', 'Machining', 'Inspection', 'ship'])
    assert.deepEqual(layout.lanes.map(lane => lane.index), [0, 1, 2, 3])
    assert.ok(ascending(across(layout, direction)), 'lanes stack in order')
    for (const node of nodes) {
      const box = layout.boxes.get(node.id)
      const lane = layout.lanes.find(item => item.id === node.lane)
      assert.ok(inside(box, lane), `${node.id} inside ${lane.id}`)
      assert.ok(!overlaps(box, lane.header), `${node.id} clear of the header`)
      assert.equal(graphSwimlaneAt(layout.lanes, box)?.id, node.lane)
      assert.ok(lane.nodeIds.includes(node.id))
      for (const other of layout.lanes) if (other !== lane) assert.ok(!overlaps(box, other), `${node.id} outside ${other.id}`)
    }
    for (const lane of layout.lanes) {
      assert.ok(inside(lane.header, lane), 'header inside its band')
      assert.ok(lane.x >= 0 && lane.y >= 0 && lane.x + lane.width <= layout.width && lane.y + lane.height <= layout.height)
    }
    // Ranks follow the dependencies along the flow.
    assert.equal(layout.boxes.get('order').rank, 0)
    assert.equal(layout.boxes.get('measure').rank, 4)
    for (const edge of edges) assert.ok(layout.paths.get(edge.id)?.startsWith('M '))
    // Every band spans the same flow length.
    const vertical = direction === 'TB' || direction === 'BT'
    assert.equal(new Set(layout.lanes.map(lane => vertical ? lane.height : lane.width)).size, 1)
    // The header sits at the flow start: left for LR, right for RL, top for TB, bottom for BT.
    const first = layout.lanes[0], header = first.header
    if (direction === 'LR') assert.equal(header.x, first.x)
    if (direction === 'RL') assert.equal(header.x + header.width, first.x + first.width)
    if (direction === 'TB') assert.equal(header.y, first.y)
    if (direction === 'BT') assert.equal(header.y + header.height, first.y + first.height)
  })

  test(`${direction}: adding a node or an edge keeps lane order and each lane's relative position`, () => {
    const before = layoutSwimlaneGraph(nodes, edges, { lanes, laneOf, direction })
    const added = layoutSwimlaneGraph([...nodes, { id: 'pack', label: 'Pack', lane: 'ship' }, { id: 'quote', label: 'Quote', lane: 'buy' }],
      [...edges, { id: 'e7', from: 'measure', to: 'pack' }, { id: 'e8', from: 'order', to: 'drill' }], { lanes, laneOf, direction })
    assert.deepEqual(added.lanes.map(lane => lane.id), before.lanes.map(lane => lane.id))
    assert.ok(ascending(across(added, direction)))
    for (const node of [...nodes, { id: 'pack', lane: 'ship' }, { id: 'quote', lane: 'buy' }]) {
      assert.equal(graphSwimlaneAt(added.lanes, added.boxes.get(node.id))?.id, node.lane)
    }
  })
}

test('an empty lane still gets a band of at least one node slot, and minLaneSize widens bands', () => {
  const layout = layoutSwimlaneGraph(nodes, edges, { lanes, laneOf })
  const ship = layout.lanes[3]
  assert.deepEqual(ship.nodeIds, [])
  assert.equal(ship.height, 58 + 2 * 12)
  assert.ok(ship.width > 0)
  // Adding a step to the empty lane leaves the other lanes where they were.
  const filled = layoutSwimlaneGraph([...nodes, { id: 'pack', lane: 'ship' }], edges, { lanes, laneOf })
  assert.deepEqual(filled.lanes.slice(0, 3).map(lane => [lane.y, lane.height]), layout.lanes.slice(0, 3).map(lane => [lane.y, lane.height]))
  const wide = layoutSwimlaneGraph(nodes, edges, { lanes, laneOf, minLaneSize: 140, laneGap: 6 })
  assert.equal(wide.lanes[3].height, 140)
  assert.equal(wide.lanes[1].y - (wide.lanes[0].y + wide.lanes[0].height), 6)
  // A lane list without nodes draws every band.
  const blank = layoutSwimlaneGraph([], [], { lanes: ['a', 'b'], laneOf: new Map() })
  assert.equal(blank.lanes.length, 2)
  assert.ok(blank.width >= 1 && blank.height >= 1)
  assert.deepEqual(layoutSwimlaneGraph([], [], { lanes: [], laneOf: new Map() }).lanes, [])
})

test('several nodes of one lane in one rank are stacked inside it and ordered to reduce crossings', () => {
  const layout = layoutSwimlaneGraph(nodes, edges, { lanes, laneOf })
  const cut = layout.boxes.get('cut'), mill = layout.boxes.get('mill')
  assert.equal(cut.rank, mill.rank)
  assert.ok(cut.y + cut.height <= mill.y || mill.y + mill.height <= cut.y, 'stacked without overlap')
  // A crossing case: x feeds the bottom target, y the top one; barycenter swaps the targets.
  const crossNodes = [{ id: 'x', lane: 'a' }, { id: 'y', lane: 'b' }, { id: 'p', lane: 'c' }, { id: 'q', lane: 'c' }]
  const crossEdges = [{ id: '1', from: 'x', to: 'q' }, { id: '2', from: 'y', to: 'p' }]
  const ordered = layoutSwimlaneGraph(crossNodes, crossEdges, { lanes: ['a', 'b', 'c'], laneOf })
  assert.ok(ordered.boxes.get('q').y < ordered.boxes.get('p').y)
  const kept = layoutSwimlaneGraph(crossNodes, crossEdges, { lanes: ['a', 'b', 'c'], laneOf, crossingReduction: 'none' })
  assert.ok(kept.boxes.get('p').y < kept.boxes.get('q').y)
  assert.deepEqual(ordered.lanes.map(lane => lane.id), ['a', 'b', 'c'])
})

test('a laneOf map works like a function, and the output is deterministic', () => {
  const map = new Map(nodes.map(node => [node.id, node.lane]))
  const a = layoutSwimlaneGraph(nodes, edges, { lanes, laneOf: map, direction: 'TB' })
  const b = layoutSwimlaneGraph(nodes, edges, { lanes, laneOf, direction: 'TB' })
  const plain = layout => JSON.stringify({ ...layout, boxes: [...layout.boxes], paths: [...layout.paths], edgeLabels: [...layout.edgeLabels] })
  assert.equal(plain(a), plain(b))
  assert.equal(plain(layoutSwimlaneGraph(nodes, edges, { lanes, laneOf: map, direction: 'TB' })), plain(a))
})

test('cycles and self-loops terminate and share a rank inside their lanes', () => {
  const cycleNodes = [{ id: 'a', lane: 'x' }, { id: 'b', lane: 'y' }, { id: 'c', lane: 'x' }, { id: 'd', lane: 'y' }]
  const cycleEdges = [
    { id: 'ab', from: 'a', to: 'b' }, { id: 'bc', from: 'b', to: 'c' }, { id: 'ca', from: 'c', to: 'a' },
    { id: 'self', from: 'b', to: 'b' }, { id: 'cd', from: 'c', to: 'd' },
  ]
  for (const direction of directions) {
    const layout = layoutSwimlaneGraph(cycleNodes, cycleEdges, { lanes: ['x', 'y'], laneOf, direction })
    assert.equal(layout.boxes.get('a').rank, layout.boxes.get('c').rank)
    assert.equal(layout.boxes.get('d').rank, layout.boxes.get('a').rank + 1)
    for (const node of cycleNodes) assert.equal(graphSwimlaneAt(layout.lanes, layout.boxes.get(node.id))?.id, node.lane)
    assert.equal(layout.paths.size, cycleEdges.length)
  }
})

test('the swimlane layout lays out a 12,000-node chain without recursion', () => {
  const count = 12000
  const chainNodes = Array.from({ length: count }, (_, i) => ({ id: 'n' + i, lane: i % 3 === 0 ? 'a' : i % 3 === 1 ? 'b' : 'c' }))
  const chainEdges = Array.from({ length: count - 1 }, (_, i) => ({ id: 'e' + i, from: 'n' + i, to: 'n' + (i + 1) }))
  const layout = layoutSwimlaneGraph(chainNodes, chainEdges, { lanes: ['a', 'b', 'c'], laneOf })
  assert.equal(layout.boxes.size, count)
  assert.equal(layout.boxes.get('n' + (count - 1)).rank, count - 1)
  assert.equal(layout.lanes[2].nodeIds.length, count / 3)
  assert.equal(graphSwimlaneAt(layout.lanes, layout.boxes.get('n11999'))?.id, 'c')
})

test('validation errors', () => {
  assert.throws(() => layoutSwimlaneGraph(nodes, edges, { lanes: ['buy', 'buy'], laneOf }), /Duplicate swimlane ID: buy/)
  assert.throws(() => layoutSwimlaneGraph(nodes, edges, { lanes: ['', 'buy'], laneOf }), { name: 'Error', message: 'Invalid swimlane ID: ""' })
  assert.throws(() => layoutSwimlaneGraph(nodes, edges, { lanes: ['buy', 'make'], laneOf }), { name: 'Error', message: 'Unknown swimlane in graph node measure: check' })
  assert.throws(() => layoutSwimlaneGraph([{ id: 'loose' }], [], { lanes: ['buy'], laneOf }), /Graph node has no swimlane: loose/)
  assert.throws(() => layoutSwimlaneGraph([{ id: 'loose' }], [], { lanes: ['buy'], laneOf: new Map() }), /no swimlane: loose/)
  assert.throws(() => layoutSwimlaneGraph(nodes, edges, { laneOf }), /lanes array/)
  assert.throws(() => layoutSwimlaneGraph(nodes, edges, { lanes, laneOf: 'lane' }), /laneOf must be/)
  for (const name of ['lanePadding', 'laneGap', 'minLaneSize', 'headerSize', 'columnGap', 'rowGap', 'padding']) {
    assert.throws(() => layoutSwimlaneGraph(nodes, edges, { lanes, laneOf, [name]: -1 }), RangeError, name)
    assert.throws(() => layoutSwimlaneGraph(nodes, edges, { lanes, laneOf, [name]: Number.NaN }), RangeError, name)
  }
  assert.throws(() => layoutSwimlaneGraph(nodes, edges, { lanes, laneOf, nodeWidth: 0 }), RangeError)
  assert.throws(() => layoutSwimlaneGraph(nodes, edges, { lanes, laneOf, nodeHeight: Infinity }), RangeError)
  assert.throws(() => layoutSwimlaneGraph(nodes, edges, { lanes, laneOf, direction: 'XY' }), RangeError)
  assert.throws(() => layoutSwimlaneGraph(nodes, edges, { lanes, laneOf, crossingReduction: 'median' }), RangeError)
  assert.throws(() => layoutSwimlaneGraph(nodes, edges, { lanes, laneOf, crossingSweeps: 0 }), RangeError)
  assert.throws(() => layoutSwimlaneGraph(nodes, [{ id: 'bad', from: 'order', to: 'nowhere' }], { lanes, laneOf }), { name: 'Error', message: 'Unknown node in graph edge bad: nowhere' })
  assert.throws(() => graphSwimlaneAt([], { x: Number.NaN, y: 0 }), RangeError)
})

test('graphSwimlaneAt finds the lane of a point or box centre, and nothing in a gap or outside', () => {
  const layout = layoutSwimlaneGraph(nodes, edges, { lanes, laneOf, laneGap: 10 })
  const [buy, make] = layout.lanes
  assert.equal(graphSwimlaneAt(layout.lanes, { x: buy.x + 1, y: buy.y + 1 }), buy)
  assert.equal(graphSwimlaneAt(layout.lanes, { x: make.x + 5, y: make.y }), make)
  assert.equal(graphSwimlaneAt(layout.lanes, { x: buy.x + 5, y: buy.y + buy.height + 5 }), undefined, 'gap')
  assert.equal(graphSwimlaneAt(layout.lanes, { x: -50, y: buy.y + 5 }), undefined, 'outside')
  // A node box dragged across a lane boundary belongs to the lane holding its centre.
  assert.equal(graphSwimlaneAt(layout.lanes, { x: make.x + 200, y: make.y - 20, width: 144, height: 58 })?.id, 'make')
})

const render = props => renderComponent(NetworkGraph, { nodes, edges, ...props })

test('NetworkGraph draws lanes on the server behind the graph, and the markup without lanes is unchanged', async () => {
  const layout = layoutSwimlaneGraph(nodes, edges, { lanes, laneOf })
  const plain = await render({})
  assert.equal(await render({ lanes: undefined }), plain)
  assert.doesNotMatch(plain, /vw-swimlane/)
  const html = await render({ layout: () => layout, lanes: layout.lanes, showMinimap: true })
  for (const label of ['Purchasing', 'Machining', 'Inspection', 'ship']) assert.match(html, new RegExp(`<g class="vw-swimlane[^"]*" role="group" aria-label="${label}"`))
  assert.match(html, /vw-swimlane vw-is-alternate/)
  assert.match(html, /<rect class="vw-swimlane-header"/)
  assert.match(html, /<svg class="vw-swimlane-title"[^>]*overflow="hidden"><text x="8"[^>]*>Purchasing<\/text>/)
  // Lanes come before every edge and node.
  assert.ok(html.indexOf('vw-swimlane') < html.indexOf('vw-network-edge'))
  assert.ok(html.indexOf('vw-swimlane') < html.indexOf('vw-network-node'))
  assert.match(html, /vw-minimap-lanes/)
  // Right to left aligns the titles to the header's right edge.
  const rtl = await render({ layout: () => layout, lanes: layout.lanes, dir: 'rtl' })
  assert.match(rtl, new RegExp(`<text x="${layout.lanes[0].header.width - 8}"`))
  // Invalid lanes throw descriptive errors.
  await assert.rejects(render({ lanes: [layout.lanes[0], layout.lanes[0]] }), { name: 'Error', message: 'Duplicate swimlane ID: buy' })
  await assert.rejects(render({ lanes: [{ ...layout.lanes[0], width: -1 }] }), RangeError)
})

test('renderGraphSvg draws lane bands and titles, and nothing changes without lanes', () => {
  const layout = layoutSwimlaneGraph(nodes, edges, { lanes: [...lanes, { id: 'long', label: 'A very long department name that is clipped' }], laneOf })
  const svg = renderGraphSvg(layout, nodes, edges, { lanes: layout.lanes, direction: 'rtl' })
  assert.equal((svg.match(/<g class="vw-swimlane">/g) ?? []).length, 5)
  assert.match(svg, /<title>Purchasing<\/title>/)
  assert.match(svg, />A very long department name that is clipped<\/text>/)
  assert.match(svg, /overflow="hidden"/)
  assert.ok(svg.indexOf('vw-swimlane') < svg.indexOf('stroke-width="1.65"'))
  const without = renderGraphSvg(layout, nodes, edges)
  assert.doesNotMatch(without, /vw-swimlane/)
  assert.equal(renderGraphSvg(layout, nodes, edges, { lanes: undefined }), without)
  assert.throws(() => renderGraphSvg(layout, nodes, edges, { lanes: [{ ...layout.lanes[0], header: { x: 0, y: 0, width: Number.NaN, height: 1 } }] }), RangeError)
  assert.throws(() => renderGraphSvg(layout, nodes, edges, { lanes: [{ ...layout.lanes[0], id: '' }] }), { name: 'Error', message: 'Invalid swimlane ID: ""' })
})

test('orthogonal and obstacle-avoiding routes keep edges and labels out of the lane headers', () => {
  const byId = new Map(nodes.map(node => [node.id, node]))
  for (const direction of directions) {
    const layout = layoutSwimlaneGraph(nodes, edges, { lanes, laneOf, direction })
    for (const avoidNodes of [undefined, true]) {
      for (const style of ['curve', 'orthogonal']) {
        const routed = routeGraphEdges(layout, edges, byId, { style, direction, avoidNodes })
        for (const edge of edges) {
          const bounds = graphPathBounds(routed.paths.get(edge.id))
          const label = routed.edgeLabels.get(edge.id)
          for (const lane of layout.lanes) {
            assert.ok(!overlaps(bounds, lane.header), `${direction} ${style} ${edge.id} route clear of the ${lane.id} header`)
            assert.ok(!overlaps({ x: label.x - 1, y: label.y - 1, width: 2, height: 2 }, lane.header), `${direction} ${edge.id} label clear of the header`)
          }
        }
      }
    }
  }
})
