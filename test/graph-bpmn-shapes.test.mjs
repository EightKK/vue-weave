import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  collapseGraphGroups, graphPathEndpoints, layoutLayeredGraph, layoutSwimlaneGraph, renderGraphSvg, routeGraphEdges,
} from '@eightkk/vue-weave/core'
import { NetworkGraph } from '@eightkk/vue-weave'
import { byId, deepFreeze as freeze, onBorder } from './helpers/builders.mjs'
import { renderComponent } from './helpers/ssr.mjs'

const close = (actual, expected, message, tolerance = 0.02) => assert.ok(Math.abs(actual - expected) < tolerance, `${message ?? ''} ${actual} ≉ ${expected}`)
const flowchartShapes = ['circle', 'stadium', 'parallelogram', 'document', 'cylinder', 'data-object']

// A 160 by 60 source box at the origin and a small target box whose centre lies in the given direction.
function straightEnd(shape, dx, dy, style = 'straight') {
  const nodes = [{ id: 's', label: 'S', shape }, { id: 't', label: 'T' }]
  const edges = [{ id: 'st', from: 's', to: 't' }]
  const cx = 80, cy = 30
  const layout = {
    boxes: new Map([['s', { x: 0, y: 0, width: 160, height: 60, rank: 0 }], ['t', { x: cx + dx * 4 - 5, y: cy + dy * 4 - 5, width: 10, height: 10, rank: 1 }]]),
    paths: new Map([['st', 'M 0 0 L 1 1']]), edgeLabels: new Map(), width: 2000, height: 2000,
  }
  const routed = routeGraphEdges(layout, edges, byId(nodes), { style })
  return graphPathEndpoints(routed.paths.get('st')).start
}

// Distance from a point to the segment a-b.
function segmentDistance(point, a, b) {
  const ex = b.x - a.x, ey = b.y - a.y
  const t = Math.max(0, Math.min(1, ((point.x - a.x) * ex + (point.y - a.y) * ey) / (ex * ex + ey * ey)))
  return Math.hypot(point.x - a.x - t * ex, point.y - a.y - t * ey)
}
const onPolygon = (point, corners) => Math.min(...corners.map((corner, i) => segmentDistance(point, corner, corners[(i + 1) % corners.length])))

test('straight edges end on the outline of every flowchart shape', () => {
  const directions = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [-2, 1], [3, -1], [-1, -1]]
  for (const [dx, dy] of directions) {
    const where = `towards ${dx},${dy}`
    // A circle centred in the box with the radius of the shorter half side.
    const circle = straightEnd('circle', dx, dy)
    close(Math.hypot(circle.x - 80, circle.y - 30), 30, 'circle ' + where)
    // A stadium: a rounded rectangle with radius 30, on its signed distance 0 (arcs are sampled).
    const stadium = straightEnd('stadium', dx, dy)
    const qx = Math.max(Math.abs(stadium.x - 80) - 50, 0), qy = Math.max(Math.abs(stadium.y - 30), 0)
    close(Math.hypot(qx, qy) - 30, 0, 'stadium ' + where, 0.15)
    // The polygons: a parallelogram with a 21.6 slant and a data object with a 14-unit fold.
    const slant = 21.6
    close(onPolygon(straightEnd('parallelogram', dx, dy), [{ x: slant, y: 0 }, { x: 160, y: 0 }, { x: 160 - slant, y: 60 }, { x: 0, y: 60 }]), 0, 'parallelogram ' + where)
    close(onPolygon(straightEnd('data-object', dx, dy), [{ x: 0, y: 0 }, { x: 146, y: 0 }, { x: 160, y: 14 }, { x: 160, y: 60 }, { x: 0, y: 60 }]), 0, 'data object ' + where)
    // A cylinder: straight sides between two ellipses with a 10-unit half height.
    const cylinder = straightEnd('cylinder', dx, dy)
    const rim = 10, ellipse = cy => ((cylinder.x - 80) / 80) ** 2 + ((cylinder.y - cy) / rim) ** 2
    const onSide = (Math.abs(cylinder.x) < 0.02 || Math.abs(cylinder.x - 160) < 0.02) && cylinder.y >= rim - 0.02 && cylinder.y <= 60 - rim + 0.02
    assert.ok(onSide || Math.abs(ellipse(rim) - 1) < 0.02 || Math.abs(ellipse(60 - rim) - 1) < 0.02, 'cylinder ' + where)
  }
  // Exact points where the outline is straight or symmetric.
  assert.deepEqual(straightEnd('parallelogram', 1, 0), { x: 160 - 10.8, y: 30 })
  assert.deepEqual(straightEnd('cylinder', 0, -1), { x: 80, y: 0 })
  close(straightEnd('document', 0, 1).y, 54, 'document wave crosses its middle above the box bottom')
  close(straightEnd('document', 0, -1).y, 0, 'document top')
  close(straightEnd('stadium', 1, 0).x, 160, 'stadium tip', 0.01)
  // Unknown shapes stay rectangles.
  const unknown = straightEnd('star', 1, 1)
  assert.ok(onBorder({ x: 0, y: 0, width: 160, height: 60 }, unknown))
})

test('orthogonal edges end on flowchart outlines while other shapes keep the side midpoints', () => {
  const nodes = [{ id: 'a', label: 'Start', shape: 'circle' }, { id: 'b', label: 'Check', shape: 'parallelogram' }, { id: 'c', label: 'Done', shape: 'diamond' }]
  const edges = [{ id: 'ab', from: 'a', to: 'b' }, { id: 'bc', from: 'b', to: 'c' }]
  const layout = layoutLayeredGraph(nodes, edges)
  const routed = routeGraphEdges(layout, edges, byId(nodes), { style: 'orthogonal' })
  const a = layout.boxes.get('a'), b = layout.boxes.get('b'), c = layout.boxes.get('c')
  const ab = graphPathEndpoints(routed.paths.get('ab')), bc = graphPathEndpoints(routed.paths.get('bc'))
  // The circle's rightmost point, then the middle of the parallelogram's slanted left side.
  assert.deepEqual(ab.start, { x: a.x + a.width / 2 + a.height / 2, y: a.y + a.height / 2 })
  close(ab.end.x, b.x + Math.min(b.height * 0.36, b.width / 4) / 2, 'parallelogram left side')
  close(bc.start.x, b.x + b.width - Math.min(b.height * 0.36, b.width / 4) / 2, 'parallelogram right side')
  // A diamond keeps the middle of its box side.
  assert.equal(bc.end.x, c.x)
  // Without flowchart shapes nothing changes.
  const plain = nodes.map(({ shape: _, ...node }) => node)
  const diamonds = nodes.map(node => ({ ...node, shape: 'diamond' }))
  assert.equal(routeGraphEdges(layout, edges, byId(diamonds), { style: 'orthogonal' }).paths.get('ab'),
    routeGraphEdges(layout, edges, byId(plain), { style: 'orthogonal' }).paths.get('ab'))
})

const lanes = [{ id: 'customer', label: 'Customer' }, { id: 'sales', label: 'Sales' }, { id: 'warehouse', label: 'Warehouse' }]
const poolNodes = [{ id: 'order', label: 'Order', lane: 'customer' }, { id: 'check', label: 'Check', lane: 'sales' }, { id: 'ship', label: 'Ship', lane: 'warehouse' }]
const poolEdges = [{ id: 'oc', from: 'order', to: 'check' }, { id: 'cs', from: 'check', to: 'ship' }]
const pools = [{ id: 'supplier', label: 'Supplier', lanes: ['warehouse', 'sales'] }, { id: 'buyer', label: 'Customer', lanes: ['customer'] }]
const laneOf = node => node.lane

test('swimlane pools frame consecutive lanes with a title band and their own gap', () => {
  const input = freeze(structuredClone(pools))
  const plain = layoutSwimlaneGraph(poolNodes, poolEdges, { lanes, laneOf, laneGap: 4 })
  assert.equal('pools' in plain, false)
  const layout = layoutSwimlaneGraph(poolNodes, poolEdges, { lanes, laneOf, laneGap: 4, pools: input, poolHeaderSize: 30, poolGap: 20 })
  assert.deepEqual(input, pools)
  // Pools come in display order, numbered from 0.
  assert.deepEqual(layout.pools.map(pool => [pool.id, pool.index, pool.laneIds]), [['buyer', 0, ['customer']], ['supplier', 1, ['sales', 'warehouse']]])
  const [buyer, supplier] = layout.pools
  const [customer, sales, warehouse] = layout.lanes
  assert.deepEqual(buyer.header, { x: 20, y: buyer.y, width: 30, height: buyer.height })
  for (const lane of layout.lanes) assert.equal(lane.x, 50)
  // The single lane of a pool has no header; the others keep theirs.
  assert.equal(customer.header.width, 0)
  assert.equal(sales.header.width, 120)
  // Pools hold their lanes exactly; lanes of one pool are laneGap apart, pools poolGap apart.
  assert.equal(supplier.y, sales.y)
  assert.equal(supplier.y + supplier.height, warehouse.y + warehouse.height)
  assert.equal(sales.y - (customer.y + customer.height), 20)
  assert.equal(warehouse.y - (sales.y + sales.height), 4)
  assert.equal(supplier.x + supplier.width, sales.x + sales.width)
  // Nodes start after both title bands.
  assert.equal(layout.boxes.get('order').x, plain.boxes.get('order').x + 30)
  // Vertical lanes turn the pools with them.
  const vertical = layoutSwimlaneGraph(poolNodes, poolEdges, { lanes, laneOf, pools, direction: 'TB' })
  for (const pool of vertical.pools) {
    assert.equal(pool.header.height, 32)
    assert.equal(pool.header.y, pool.y)
    for (const id of pool.laneIds) {
      const lane = vertical.lanes.find(item => item.id === id)
      assert.ok(lane.x >= pool.x && lane.x + lane.width <= pool.x + pool.width + 1e-9 && lane.y >= pool.y + 32)
    }
  }
})

test('swimlane pools are validated', () => {
  const layout = extra => () => layoutSwimlaneGraph(poolNodes, poolEdges, { lanes, laneOf, ...extra })
  assert.throws(layout({ pools: [{ id: 'p', lanes: ['customer', 'sales', 'nowhere'] }] }), { message: 'Unknown swimlane in swimlane pool p: nowhere' })
  assert.throws(layout({ pools: [{ id: 'p', lanes: ['customer', 'sales'] }, { id: 'q', lanes: ['sales', 'warehouse'] }] }), { message: 'Swimlane sales is in more than one pool' })
  assert.throws(layout({ pools: [{ id: 'p', lanes: ['customer', 'warehouse'] }, { id: 'q', lanes: ['sales'] }] }), { message: 'The lanes of swimlane pool p must be consecutive' })
  assert.throws(layout({ pools: [{ id: 'p', lanes: ['customer', 'sales'] }] }), { message: 'Swimlane warehouse is in no pool' })
  assert.throws(layout({ pools: [{ id: 'p', lanes: [] }] }), { message: 'Swimlane pool needs at least one lane: p' })
  assert.throws(layout({ pools: [{ id: '', lanes: ['customer'] }] }), { message: 'Invalid swimlane pool ID: ""' })
  assert.throws(layout({ pools: [{ id: 'p', lanes: ['customer'] }, { id: 'p', lanes: ['sales', 'warehouse'] }] }), { message: 'Duplicate swimlane pool ID: p' })
  assert.throws(layout({ pools, poolGap: -1 }), RangeError)
  assert.throws(layout({ pools, poolHeaderSize: Number.NaN }), RangeError)
  assert.throws(layout({ pools: 'all' }), { message: 'layoutSwimlaneGraph pools must be an array' })
})

const bpmnNodes = [
  { id: 'start', label: 'Order received', shape: 'circle', event: 'start', marker: 'message', labelPosition: 'below' },
  { id: 'wait', label: 'Wait', shape: 'circle', event: 'intermediate', marker: 'timer' },
  { id: 'gate', label: 'In stock?', shape: 'diamond', marker: 'exclusive', labelPosition: 'below' },
  { id: 'task', label: 'Approve', detail: 'Sales', marker: 'user', shape: 'rounded' },
  { id: 'store', label: 'Stock', shape: 'cylinder' },
  { id: 'doc', label: 'Invoice', shape: 'data-object' },
  { id: 'end', label: 'Done', shape: 'circle', event: 'end' },
  { id: 'odd', label: 'Odd', shape: 'star', marker: 'sparkle', event: 'middle', labelPosition: 'left' },
]
const bpmnEdges = [
  { id: 'e1', from: 'start', to: 'wait' }, { id: 'e2', from: 'wait', to: 'gate' }, { id: 'e3', from: 'gate', to: 'task' },
  { id: 'e4', from: 'task', to: 'end', dashed: true, markerStart: 'circle', markerEnd: 'hollow-arrow' }, { id: 'e5', from: 'store', to: 'task', dashed: true, animated: true },
  { id: 'e6', from: 'doc', to: 'task' },
]

test('renderGraphSvg draws flowchart shapes, BPMN markers, event borders, labels below, dashed edges and pools', () => {
  const layout = layoutLayeredGraph(bpmnNodes, bpmnEdges)
  const svg = renderGraphSvg(layout, bpmnNodes, bpmnEdges, { idPrefix: 'x' })
  // A 144 by 58 box: the circle has radius 27; the end event a 3.5-unit border; the intermediate event two outlines.
  assert.match(svg, /<ellipse cx="72" cy="29" rx="27" ry="27" fill="#e6effa" stroke="#6b96c5" stroke-width="3\.5"\/>/)
  assert.equal((svg.match(/<ellipse cx="72" cy="29" rx="2[37]" ry="2[37]"/g) ?? []).length, 4)
  assert.match(svg, /<path d="M 2 11 A 70 9 0 0 1 142 11 V 47 A 70 9 0 0 1 2 47 Z"[^>]*stroke-linejoin="round"\/><path d="M 2 11 A 70 9 0 0 0 142 11" fill="none"/)
  assert.match(svg, /<polygon points="2,2 128,2 142,16 142,56 2,56"/)
  // A cylinder moves its text below the rim of its top.
  assert.match(svg, /<text x="72" y="38\.5" text-anchor="middle"[^>]*>Stock<\/text>/)
  // Markers: an envelope, a clock, a cross and a user icon in the corner, drawn in the tone's ink.
  assert.match(svg, /<g fill="none" stroke="#1d4d84" stroke-linecap="round" stroke-linejoin="round"><path d="M 59\.82 20\.88 H 84\.18/)
  assert.match(svg, /<path d="M 62\.72 19\.72 L 81\.28 38\.28 M 81\.28 19\.72 L 62\.72 38\.28" stroke-width="3\.4"\/>/)
  assert.match(svg, /<circle cx="16" cy="11\.5" r="3\.4" stroke-width="1\.4"\/>/)
  // The task text moves away from the icon.
  assert.match(svg, /<text x="30" y="24" font-size="15\.5" font-weight="700" fill="#1d4d84">Approve<\/text>/)
  // Labels below the box: outside the clipped content, centred, with a halo; not inside the shape.
  assert.match(svg, /<\/svg><text x="72" y="75" font-size="15\.5" font-weight="700" fill="#172c3b" text-anchor="middle" stroke="#f6f9fb"[^>]*>Order received<\/text><\/g>/)
  assert.equal((svg.match(/>Order received</g) ?? []).length, 2)
  // Dashed edges, unless animated; the hollow arrow is filled with the background.
  assert.match(svg, /stroke-dasharray="5 4" marker-start="url\(#x-start-circle\)" marker-end="url\(#x-hollow-arrow\)"/)
  assert.match(svg, /<marker id="x-hollow-arrow" [^>]*><path d="M 0\.8 0\.8 L 6\.2 3\.5 L 0\.8 6\.2 z" fill="#f6f9fb" stroke="#76929f"/)
  assert.equal((svg.match(/stroke-dasharray="6 4"/g) ?? []).length, 1)
  // Unknown values draw a plain rectangle with its text inside.
  assert.match(svg, /<rect x="2" y="2" width="140" height="54" rx="8" fill="#e6effa" stroke="#6b96c5" stroke-width="1\.25"\/><svg[^>]*><text x="13" y="34"[^>]*>Odd</)
  // Right to left: the task icon moves to the inline start on the right.
  const rtl = renderGraphSvg(layout, bpmnNodes, bpmnEdges, { direction: 'rtl' })
  assert.match(rtl, /<circle cx="128" cy="11\.5" r="3\.4"/)
  assert.match(rtl, /<text x="114" y="24"[^>]*direction="rtl"[^>]*>Approve/)
})

test('renderGraphSvg draws pools behind the lanes and validates them', () => {
  const layout = layoutSwimlaneGraph(poolNodes, poolEdges, { lanes, laneOf, pools })
  const svg = renderGraphSvg(layout, poolNodes, poolEdges, { lanes: layout.lanes, pools: layout.pools, theme: { muted: '#445566' } })
  const supplier = layout.pools[1], header = supplier.header
  assert.match(svg, new RegExp(`<g class="vw-swimlane-pool"><title>Supplier</title><rect x="${supplier.x}" y="${supplier.y}" width="${supplier.width}" height="${supplier.height}" fill="#ffffff" stroke="#445566" stroke-width="1\\.5"/>`))
  const cx = header.width / 2, cy = header.height / 2
  assert.match(svg, new RegExp(`<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="13" font-weight="700" fill="#172c3b" transform="rotate\\(-90 ${cx} ${cy}\\)">Supplier</text>`))
  // Pools are drawn before the lanes; a lane without a header draws none.
  assert.ok(svg.lastIndexOf('vw-swimlane-pool') < svg.indexOf('class="vw-swimlane"'))
  assert.equal((svg.match(/stroke-width="1\.5"\/><svg/g) ?? []).length, 2 + 2)
  // Horizontal title bands keep their text upright.
  const vertical = layoutSwimlaneGraph(poolNodes, poolEdges, { lanes, laneOf, pools, direction: 'TB' })
  assert.equal(renderGraphSvg(vertical, poolNodes, poolEdges, { pools: vertical.pools }).includes('rotate('), false)
  assert.throws(() => renderGraphSvg(layout, poolNodes, poolEdges, { pools: [{ ...supplier, width: -1 }] }), { name: 'RangeError', message: 'renderGraphSvg pool supplier needs finite geometry with nonnegative sizes' })
  assert.throws(() => renderGraphSvg(layout, poolNodes, poolEdges, { pools: [supplier, supplier] }), { message: 'Duplicate swimlane pool ID: supplier' })
  assert.throws(() => renderGraphSvg(layout, poolNodes, poolEdges, { pools: [{ ...supplier, laneIds: 'sales' }] }), { message: 'renderGraphSvg pool supplier needs an array of lane IDs' })
})

test('collapsed groups keep the dashed flag only when every merged edge agrees', () => {
  const nodes = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }]
  const groups = [{ id: 'g', label: 'G', nodeIds: ['a', 'b'] }]
  const agree = collapseGraphGroups(nodes, [{ id: 'ac', from: 'a', to: 'c', dashed: true }, { id: 'bc', from: 'b', to: 'c', dashed: true }], groups, ['g'])
  assert.equal(agree.edges[0].dashed, true)
  const differ = collapseGraphGroups(nodes, [{ id: 'ac', from: 'a', to: 'c', dashed: true }, { id: 'bc', from: 'b', to: 'c' }], groups, ['g'])
  assert.equal('dashed' in differ.edges[0], false)
})

const render = props => renderComponent(NetworkGraph, { nodes: bpmnNodes, edges: bpmnEdges, ...props })

test('NetworkGraph renders flowchart shapes, decorative BPMN markers, labels below, dashed edges and pools on the server', async () => {
  const html = await render({ edgeStyle: 'orthogonal' })
  assert.match(html, /<ellipse class="vw-node-shape vw-node-event-start" cx="72" cy="29" rx="27" ry="27"><\/ellipse><g class="vw-node-marker" aria-hidden="true" data-vw-marker="message">/)
  assert.match(html, /<ellipse class="vw-node-shape vw-node-shape-inner" cx="72" cy="29" rx="23" ry="23"><\/ellipse>/)
  assert.match(html, /<ellipse class="vw-node-shape vw-node-event-end"/)
  assert.match(html, /<path class="vw-node-shape" d="M 2 11 A 70 9 0 0 1 142 11 V 47 A 70 9 0 0 1 2 47 Z"><\/path><path class="vw-node-shape-detail" d="M 2 11 A 70 9 0 0 0 142 11"><\/path>/)
  assert.match(html, /<polygon class="vw-node-shape" points="2,2 128,2 142,16 142,56 2,56"><\/polygon><path class="vw-node-shape-detail"/)
  // A label below is drawn after the clipped content; the accessible name is still the label.
  assert.match(html, /<\/svg><text x="72" y="75" text-anchor="middle" class="vw-node-title vw-node-label-below">Order received<\/text><!--\]--><\/g>/)
  assert.match(html, /aria-label="Order received"/)
  assert.match(html, /aria-label="Approve Sales"/)
  assert.match(html, /<text x="30" y="24" class="vw-node-title">Approve<\/text>/)
  assert.match(html, /<path class="vw-network-edge vw-is-dashed" d="[^"]+" marker-start="url\(#[^)]+-start-circle\)" marker-end="url\(#[^)]+-hollow-arrow\)">/)
  assert.match(html, /<path class="vw-network-edge vw-is-animated" d=/)
  // Unknown values are ignored.
  assert.equal(html.includes('sparkle'), false)
  assert.match(html, /<rect x="2" y="2" width="140" height="54" rx="8"><\/rect><text x="13" y="34" class="vw-node-title">Odd<\/text>/)

  // Pools group their lanes and are named by their labels.
  const layout = layoutSwimlaneGraph(poolNodes, poolEdges, { lanes, laneOf, pools })
  const pooled = await render({ nodes: poolNodes, edges: poolEdges, layout: () => layout, lanes: layout.lanes, pools: layout.pools })
  assert.match(pooled, /<g class="vw-swimlane-pool" role="group" aria-label="Supplier" data-vw-pool="supplier"><rect class="vw-swimlane-pool-band"[^>]*><\/rect><rect class="vw-swimlane-pool-header"[^>]*><\/rect><svg class="vw-swimlane-pool-title"[^>]*><text[^>]*transform="rotate\(-90 16 [\d.]+\)"[^>]*>Supplier<\/text><\/svg><g class="vw-swimlane vw-is-alternate" role="group" aria-label="Sales"/)
  assert.ok(pooled.indexOf('aria-label="Customer" data-vw-pool="buyer"') < pooled.indexOf('aria-label="Customer" data-vw-lane="customer"'))
  await assert.rejects(render({ pools: [{ id: 'p', label: 'P', laneIds: [], x: 0, y: 0, width: Number.NaN, height: 1, header: { x: 0, y: 0, width: 0, height: 0 } }] }),
    { name: 'RangeError', message: /NetworkGraph pool p needs finite geometry/ })
})

test('NetworkGraph server markup is unchanged by the default values of the new fields', async () => {
  const nodes = [{ id: 'a', label: 'A', detail: 'one' }, { id: 'b', label: 'B', shape: 'diamond' }]
  const edges = [{ id: 'ab', from: 'a', to: 'b' }]
  const plain = await renderComponent(NetworkGraph, { nodes, edges })
  const defaults = await renderComponent(NetworkGraph, {
    nodes: nodes.map(node => ({ ...node, labelPosition: 'inside' })), edges: edges.map(edge => ({ ...edge, dashed: false })), pools: [],
  })
  assert.equal(defaults, plain)
  for (const name of ['vw-node-marker', 'vw-is-dashed', 'vw-swimlane-pool', 'vw-node-label-below', 'vw-node-event']) assert.equal(plain.includes(name), false)
  const layout = layoutLayeredGraph(nodes, edges)
  assert.equal(renderGraphSvg(layout, nodes.map(node => ({ ...node, labelPosition: 'inside' })), edges.map(edge => ({ ...edge, dashed: false })), { pools: [] }),
    renderGraphSvg(layout, nodes, edges))
  for (const shape of flowchartShapes) {
    const shaped = [{ id: 'a', label: 'A', shape }]
    assert.match(await renderComponent(NetworkGraph, { nodes: shaped, edges: [] }), /class="vw-node-shape"/, shape)
  }
})
