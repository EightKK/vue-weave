import assert from 'node:assert/strict'
import { test } from 'node:test'
import { h } from 'vue'
import {
  defaultSvgExportTheme, graphPathEndpoints, layoutLayeredGraph, renderGraphSvg, routeGraphEdges, routeGraphPorts,
} from '@eightkk/vue-weave/core'
import { NetworkGraph } from '@eightkk/vue-weave'
import { byId, centre, deepFreeze as freeze, onBorder, polyline } from './helpers/builders.mjs'
import { renderComponent } from './helpers/ssr.mjs'

// Signed distance of a point from the line through a and b, positive on the side of the normal (a.y - b.y, b.x - a.x).
const side = (a, b, point) => ((a.y - b.y) * (point.x - a.x) + (b.x - a.x) * (point.y - a.y)) / Math.hypot(b.x - a.x, b.y - a.y)
const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 0.02, `${message ?? ''} ${actual} ≉ ${expected}`)

// A and X in the first rank, B in the second between them (so A to B is a diagonal) and C in the third. The layout is
// made without the back edge, which would put A and B in one rank, and gets a straight path from B to A.
const nodes = [{ id: 'a', label: 'A' }, { id: 'x', label: 'X' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }]
const edges = [
  { id: 'ab1', from: 'a', to: 'b', label: 'one' }, { id: 'ab2', from: 'a', to: 'b', label: 'two' }, { id: 'ba', from: 'b', to: 'a', label: 'back' },
  { id: 'xb', from: 'x', to: 'b' }, { id: 'bc', from: 'b', to: 'c' },
]
const forward = layoutLayeredGraph(nodes, edges.filter(edge => edge.id !== 'ba'))
const layout = freeze({
  ...forward, paths: new Map(forward.paths).set('ba', 'M 214 90 L 164 49'), edgeLabels: new Map(forward.edgeLabels).set('ba', { x: 189, y: 63 }),
})
const nodeMap = byId(nodes)

test('an edge style of its own overrides the routing style for that edge', () => {
  const input = freeze(structuredClone(edges))
  const mixed = input.map(edge => edge.id === 'bc' ? { ...edge, edgeStyle: 'orthogonal' } : edge)
  const routed = routeGraphEdges(layout, mixed, nodeMap, { cornerRadius: 0 })
  const orthogonal = routeGraphEdges(layout, edges, nodeMap, { style: 'orthogonal' })
  assert.equal(routed.paths.get('bc'), orthogonal.paths.get('bc'))
  for (const id of ['ab1', 'ab2', 'ba', 'xb']) assert.equal(routed.paths.get(id), layout.paths.get(id))
  // A curve edge in an orthogonal routing keeps the layout's path; a straight one is clipped between the borders.
  const reversed = routeGraphEdges(layout, edges.map(edge => edge.id === 'xb' ? { ...edge, edgeStyle: 'curve' } : edge.id === 'bc' ? { ...edge, edgeStyle: 'straight' } : edge), nodeMap, { style: 'orthogonal' })
  assert.equal(reversed.paths.get('xb'), layout.paths.get('xb'))
  assert.equal(reversed.paths.get('ab1'), orthogonal.paths.get('ab1'))
  assert.equal(reversed.paths.get('bc'), routeGraphEdges(layout, edges, nodeMap, { style: 'straight' }).paths.get('bc'))
  // Without waypoints, own styles or parallel spacing, the curve style returns the layout itself.
  assert.equal(routeGraphEdges(layout, edges.map(edge => ({ ...edge, edgeStyle: 'curve' })), nodeMap), layout)
  assert.notEqual(routeGraphEdges(layout, mixed, nodeMap), layout)
  assert.throws(() => routeGraphEdges(layout, [{ id: 'bad', from: 'a', to: 'b', edgeStyle: 'wavy' }], nodeMap),
    { name: 'RangeError', message: 'Unknown edge style on graph edge bad: wavy' })
  assert.deepEqual(input, edges)
})

test('the preserve policy keeps valid layout paths whatever the style of the edge', () => {
  const styled = edges.map(edge => ({ ...edge, edgeStyle: 'orthogonal' }))
  const kept = routeGraphEdges(layout, styled, nodeMap, { policy: 'preserve', parallelSpacing: 12 })
  for (const edge of edges) assert.equal(kept.paths.get(edge.id), layout.paths.get(edge.id))
  // A routed layout counts as built-in, so preserve routes it again in the edge's own style.
  const routed = routeGraphEdges(layout, edges, nodeMap, { style: 'straight' })
  const again = routeGraphEdges(routed, styled, nodeMap, { policy: 'preserve' })
  assert.equal(again.paths.get('bc'), routeGraphEdges(layout, edges, nodeMap, { style: 'orthogonal' }).paths.get('bc'))
})

test('parallel spacing is validated and leaves single edges and the default routing unchanged', () => {
  for (const parallelSpacing of [0, -4, Number.NaN, Infinity]) {
    assert.throws(() => routeGraphEdges(layout, edges, nodeMap, { parallelSpacing }), { name: 'RangeError', message: /parallelSpacing/ })
  }
  const single = edges.filter(edge => edge.id === 'xb' || edge.id === 'bc')
  for (const style of ['curve', 'orthogonal', 'straight']) {
    const plain = routeGraphEdges(layout, edges, nodeMap, { style })
    const spread = routeGraphEdges(layout, edges, nodeMap, { style, parallelSpacing: 12 })
    for (const { id } of single) {
      assert.equal(spread.paths.get(id), plain.paths.get(id), style + ' ' + id)
      assert.deepEqual(spread.edgeLabels.get(id), plain.edgeLabels.get(id))
    }
  }
  // A graph without parallel edges routes exactly as without spacing, and the curve style returns the layout.
  assert.equal(routeGraphEdges(layout, single, nodeMap, { parallelSpacing: 12 }), layout)
})

test('parallel straight and curve edges are spread symmetrically in both directions and keep their labels with them', () => {
  const input = freeze(structuredClone(edges))
  const a = centre(layout.boxes.get('a')), b = centre(layout.boxes.get('b'))
  const middle = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }
  const straight = routeGraphEdges(layout, input, nodeMap, { style: 'straight', parallelSpacing: 12 })
  const bends = ['ab1', 'ab2', 'ba'].map(id => {
    const points = polyline(straight.paths.get(id))
    assert.equal(points.length, 3, id)
    return points[1]
  })
  // Three edges, 12 apart: -12, 0 and +12 from the line between the centres, whichever way they run.
  assert.deepEqual(bends.map(point => Math.round(side(a, b, point))), [-12, 0, 12])
  for (const point of bends) close(Math.hypot(point.x - middle.x, point.y - middle.y), Math.abs(side(a, b, point)), 'on the perpendicular')
  // Each end lies on its box border; the reverse edge starts at B.
  for (const id of ['ab1', 'ab2', 'ba']) {
    const { start, end } = graphPathEndpoints(straight.paths.get(id))
    const [from, to] = id === 'ba' ? ['b', 'a'] : ['a', 'b']
    assert.ok(onBorder(layout.boxes.get(from), start), id + ' start')
    assert.ok(onBorder(layout.boxes.get(to), end), id + ' end')
  }
  // Labels sit halfway along their own edges, just above their bend points.
  for (const [i, id] of ['ab1', 'ab2', 'ba'].entries()) {
    const label = straight.edgeLabels.get(id)
    assert.ok(Math.hypot(label.x - bends[i].x, label.y + 6 - bends[i].y) < 4, id)
  }
  const curve = routeGraphEdges(layout, input, nodeMap, { parallelSpacing: 12 })
  assert.match(curve.paths.get('ab1'), /^M [\d.]+ [\d.]+ C /)
  assert.deepEqual(new Set(['ab1', 'ab2', 'ba'].map(id => curve.paths.get(id))).size, 3)
  for (const [i, id] of ['ab1', 'ab2', 'ba'].entries()) {
    const label = curve.edgeLabels.get(id)
    assert.ok(Math.hypot(label.x - bends[i].x, label.y + 6 - bends[i].y) < 4, id)
  }
  // Waypoints and ports take an edge out of its group: the remaining edges are spread as a pair.
  const pinned = routeGraphEdges(layout, input.map(edge => edge.id === 'ab2' ? { ...edge, points: [{ x: 200, y: 10 }] } : edge), nodeMap, { style: 'straight', parallelSpacing: 12 })
  assert.deepEqual(['ab1', 'ba'].map(id => Math.round(side(a, b, polyline(pinned.paths.get(id))[1]))), [-6, 6])
  assert.deepEqual(polyline(pinned.paths.get('ab2'))[1], { x: 200, y: 10 })
  // The virtual bend points are not waypoints: the input edges are unchanged.
  assert.deepEqual(input, edges)
})

test('parallel orthogonal edges are shifted copies of one route and stay on their box sides', () => {
  const spaced = routeGraphEdges(layout, edges, nodeMap, { style: 'orthogonal', parallelSpacing: 10, cornerRadius: 0 })
  const routes = ['ab1', 'ab2', 'ba'].map(id => polyline(spaced.paths.get(id)))
  const reverse = routes[2].slice().reverse()
  for (const route of [routes[0], routes[1], reverse]) {
    assert.equal(route.length, 4)
    for (let i = 1; i < route.length; i++) assert.ok(route[i].x === route[i - 1].x || route[i].y === route[i - 1].y, 'axis-aligned')
    assert.ok(onBorder(layout.boxes.get('a'), route[0]))
    assert.ok(onBorder(layout.boxes.get('b'), route[3]))
  }
  // The horizontal legs are 10 apart, in slot order, and the vertical legs too.
  const first = [routes[0], routes[1], reverse].map(route => route[0].y - routes[1][0].y)
  assert.equal(Math.abs(first[0]), 10)
  assert.deepEqual(first, [first[0], 0, -first[0]])
  assert.deepEqual([routes[0], routes[1], reverse].map(route => route[3].y - routes[1][3].y), first)
  const turn = [routes[0], routes[1], reverse].map(route => route[1].x - routes[1][1].x)
  assert.equal(Math.abs(turn[0]), 10)
  assert.deepEqual(turn, [turn[0], 0, -turn[0]])
  // The middle edge of three is the unspread route.
  assert.equal(spaced.paths.get('ab2'), routeGraphEdges(layout, edges, nodeMap, { style: 'orthogonal', cornerRadius: 0 }).paths.get('ab2'))
  // A spacing wider than the box sides allow is reduced so that every end stays on its side.
  const wide = routeGraphEdges(layout, edges, nodeMap, { style: 'orthogonal', parallelSpacing: 500 })
  for (const id of ['ab1', 'ab2', 'ba']) {
    const { start, end } = graphPathEndpoints(wide.paths.get(id))
    const [from, to] = id === 'ba' ? ['b', 'a'] : ['a', 'b']
    assert.ok(onBorder(layout.boxes.get(from), start) && onBorder(layout.boxes.get(to), end), id)
  }
  // Route metadata records the shifted route.
  const withRoutes = routeGraphEdges({ ...layout, routes: new Map() }, edges, nodeMap, { style: 'orthogonal', parallelSpacing: 10, cornerRadius: 0 })
  assert.deepEqual(withRoutes.routes.get('ab1').start, routes[0][0])
  assert.deepEqual(withRoutes.routes.get('ab1').points, routes[0].slice(1, -1))
})

test('two edges of a cycle in one rank separate in every style and direction', () => {
  const pairNodes = [{ id: 'p', label: 'P' }, { id: 'q', label: 'Q' }]
  const pair = [{ id: 'pq', from: 'p', to: 'q' }, { id: 'qp', from: 'q', to: 'p' }]
  for (const direction of ['LR', 'TB', 'RL', 'BT']) {
    const base = layoutLayeredGraph(pairNodes, pair, { direction })
    // The layout draws both edges on one side route, one reversed onto the other.
    for (const style of ['curve', 'orthogonal', 'straight']) {
      const spread = routeGraphEdges(base, pair, byId(pairNodes), { style, direction, parallelSpacing: 14 })
      assert.notEqual(spread.paths.get('pq'), spread.paths.get('qp'), direction + ' ' + style)
      const one = graphPathEndpoints(spread.paths.get('pq')), other = graphPathEndpoints(spread.paths.get('qp'))
      assert.ok(Math.hypot(one.start.x - other.end.x, one.start.y - other.end.y) > 5, direction + ' ' + style + ' ends apart')
      assert.ok(Math.hypot(spread.edgeLabels.get('pq').x - spread.edgeLabels.get('qp').x, spread.edgeLabels.get('pq').y - spread.edgeLabels.get('qp').y) > 5)
    }
  }
})

test('self-loops of one node are nested', () => {
  const loopNodes = [{ id: 'n', label: 'N' }]
  const loops = [{ id: 'l1', from: 'n', to: 'n' }, { id: 'l2', from: 'n', to: 'n' }, { id: 'l3', from: 'n', to: 'n' }]
  const base = layoutLayeredGraph(loopNodes, loops)
  const box = base.boxes.get('n')
  const routed = routeGraphEdges(base, loops, byId(loopNodes), { style: 'orthogonal', parallelSpacing: 8, cornerRadius: 0 })
  const brackets = loops.map(loop => polyline(routed.paths.get(loop.id)))
  for (const [i, bracket] of brackets.entries()) {
    assert.equal(bracket.length, 4)
    assert.equal(bracket[0].x, box.x + box.width)
    assert.equal(bracket[3].x, box.x + box.width)
    assert.equal(bracket[1].x, box.x + box.width + 16 + 8 * i)
    if (i) {
      assert.ok(bracket[0].y < brackets[i - 1][0].y && bracket[3].y > brackets[i - 1][3].y, 'starts and ends further out')
      assert.ok(bracket[0].y >= box.y + 2 && bracket[3].y <= box.y + box.height - 2)
    }
  }
  // The first loop is the bracket a single self-loop gets.
  assert.equal(routed.paths.get('l1'), routeGraphEdges(base, [loops[0]], byId(loopNodes), { style: 'orthogonal', cornerRadius: 0 }).paths.get('l1'))
  assert.ok(routed.width >= box.x + box.width + 16 + 16 + 8)
  // In the curve style the loops are smooth curves through the same brackets.
  const curved = routeGraphEdges(base, loops, byId(loopNodes), { parallelSpacing: 8 })
  for (const loop of loops) assert.match(curved.paths.get(loop.id), / C /)
  assert.equal(new Set(loops.map(loop => curved.paths.get(loop.id))).size, 3)
})

test('straight edges end on diamond, ellipse and hexagon outlines; orthogonal edges at the middle of the box sides', () => {
  for (const shape of ['diamond', 'ellipse', 'hexagon']) {
    const shaped = [{ id: 's', label: 'S', shape }, { id: 't', label: 'T', shape }, { id: 'u', label: 'U' }]
    const links = [{ id: 'st', from: 's', to: 't' }, { id: 'su', from: 's', to: 'u' }, { id: 'tu', from: 't', to: 'u' }]
    const base = layoutLayeredGraph(shaped, links)
    const routed = routeGraphEdges(base, links, byId(shaped), { style: 'straight' })
    const plain = routeGraphEdges(base, links, byId(shaped.map(({ shape: _, ...node }) => node)), { style: 'straight' })
    for (const link of links) {
      const { start, end } = graphPathEndpoints(routed.paths.get(link.id))
      for (const [id, point] of [[link.from, start], [link.to, end]]) {
        const box = base.boxes.get(id), c = centre(box), a = box.width / 2, b = box.height / 2
        const dx = Math.abs(point.x - c.x) / a, dy = Math.abs(point.y - c.y) / b
        const node = shaped.find(item => item.id === id)
        if (!node.shape) {
          assert.ok(onBorder(box, point), shape + ' box border')
          continue
        }
        if (shape === 'diamond') close(dx + dy, 1, 'diamond')
        else if (shape === 'ellipse') close(dx * dx + dy * dy, 1, 'ellipse')
        else {
          const q = Math.min(b / Math.sqrt(3), a / 2) / a
          close(Math.max(dy, dx + q * dy), 1, 'hexagon')
        }
      }
    }
    // Shapes shorten straight edges, never lengthen them.
    const length = path => {
      const { start, end } = graphPathEndpoints(path)
      return Math.hypot(end.x - start.x, end.y - start.y)
    }
    assert.ok(length(routed.paths.get('st')) > length(plain.paths.get('st')) - 0.01)
    // Orthogonal routes keep the side midpoints, which lie on every outline.
    const orthogonal = routeGraphEdges(base, links, byId(shaped), { style: 'orthogonal' })
    assert.equal(orthogonal.paths.get('st'), routeGraphEdges(base, links, byId(shaped.map(({ shape: _, ...node }) => node)), { style: 'orthogonal' }).paths.get('st'))
    const through = routeGraphEdges(base, [{ ...links[0], points: [{ x: 100, y: 140 }] }], byId(shaped), { style: 'orthogonal' })
    const start = graphPathEndpoints(through.paths.get('st')).start, box = base.boxes.get('s')
    assert.ok((start.x === box.x + box.width / 2) || (start.y === box.y + box.height / 2), shape + ' orthogonal waypoint route leaves a side midpoint')
  }
})

test('renderGraphSvg draws markers, start markers, highlighted variants and dashed animated edges only when used', () => {
  const svgNodes = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }]
  const plainEdges = [{ id: 'ab', from: 'a', to: 'b' }, { id: 'bc', from: 'b', to: 'c' }]
  const base = layoutLayeredGraph(svgNodes, plainEdges)
  const plain = renderGraphSvg(base, svgNodes, plainEdges)
  assert.equal(renderGraphSvg(base, svgNodes, plainEdges.map(edge => ({ ...edge, markerEnd: 'arrow', markerStart: 'none', animated: false }))), plain)
  for (const name of ['marker-start', 'stroke-dasharray', 'auto-start-reverse', '-circle']) assert.equal(plain.includes(name), false)

  const decorated = [
    { id: 'ab', from: 'a', to: 'b', markerStart: 'circle', markerEnd: 'open-arrow', animated: true },
    { id: 'bc', from: 'b', to: 'c', markerEnd: 'none', markerStart: 'diamond' },
  ]
  const theme = { edge: '#123456', surfaceMuted: '#fedcba' }
  const svg = renderGraphSvg(base, svgNodes, decorated, { idPrefix: 'x', theme, highlightedEdgeIds: ['bc'], highlightColor: '#ff0000' })
  assert.match(svg, /<marker id="x-start-circle" markerWidth="7" markerHeight="7" refX="6\.1" refY="3\.5" orient="auto-start-reverse"><circle cx="3\.5" cy="3\.5" r="2\.6" fill="#fedcba" stroke="#123456"/)
  assert.match(svg, /<marker id="x-open-arrow" [^>]*orient="auto"><path d="M 1 0\.8 L 6\.2 3\.5 L 1 6\.2" fill="none" stroke="#123456"/)
  assert.match(svg, /<marker id="x-start-diamond-highlight" [^>]*orient="auto-start-reverse"><path d="[^"]+" fill="#fedcba" stroke="#ff0000"/)
  assert.match(svg, /<path d="[^"]+" fill="none" stroke="#123456" stroke-width="1\.65" stroke-dasharray="6 4" marker-start="url\(#x-start-circle\)" marker-end="url\(#x-open-arrow\)"\/>/)
  assert.match(svg, /<path d="[^"]+" fill="none" stroke="#ff0000" stroke-width="2\.6" marker-start="url\(#x-start-diamond-highlight\)"\/>/)
  // The default arrow keeps its ID; unused markers are not written.
  assert.match(svg, /<marker id="x-arrow" /)
  for (const id of ['x-start-circle-highlight', 'x-bar', 'x-open-arrow-highlight']) assert.equal(svg.includes(`id="${id}"`), false)
  assert.throws(() => renderGraphSvg(base, svgNodes, [{ id: 'ab', from: 'a', to: 'b', markerEnd: 'star' }]),
    { name: 'RangeError', message: 'Unknown edge marker on graph edge ab: star' })
  assert.throws(() => renderGraphSvg(base, svgNodes, [{ id: 'ab', from: 'a', to: 'b', markerStart: 'constructor' }]), RangeError)
})

test('renderGraphSvg draws diamond, ellipse and hexagon nodes with centred text in both directions', () => {
  const shaped = [
    { id: 'd', label: 'Decide', detail: 'yes or no', shape: 'diamond' }, { id: 'e', label: 'Event', shape: 'ellipse', tone: 'teal' },
    { id: 'h', label: 'Prepare', shape: 'hexagon' }, { id: 'r', label: 'Rounded', shape: 'rounded' }, { id: 'u', label: 'Unknown', shape: 'star' },
  ]
  const base = layoutLayeredGraph(shaped, [])
  const svg = renderGraphSvg(base, shaped, [], { selectedIds: ['e'], highlightedNodeIds: ['h'] })
  const { tones } = defaultSvgExportTheme
  assert.match(svg, /<polygon points="72,2 142,29 72,56 2,29" fill="#e6effa" stroke="#6b96c5" stroke-width="1\.25" stroke-linejoin="round"\/>/)
  assert.match(svg, new RegExp(`<ellipse cx="72" cy="29" rx="70" ry="27" fill="${tones.teal.solid}" stroke="${tones.teal.ink}" stroke-width="2\\.8"/>`))
  assert.match(svg, /<polygon points="2,29 17\.588,2 126\.412,2 142,29 126\.412,56 17\.588,56" fill="#e6effa" stroke="#a74f08" stroke-width="3"/)
  assert.match(svg, /<text x="72" y="24" text-anchor="middle" font-size="15\.5" font-weight="700" fill="#1d4d84">Decide<\/text><text x="72" y="43" text-anchor="middle" font-size="12"/)
  // Rectangles, also for unknown shapes, are unchanged.
  assert.equal((svg.match(/<rect x="2" y="2"/g) ?? []).length, 2)
  assert.match(svg, /rx="19"/)
  const rtl = renderGraphSvg(base, shaped, [], { direction: 'rtl' })
  assert.match(rtl, /<text x="72" y="24" text-anchor="middle" font-size="15\.5" font-weight="700" fill="#1d4d84" direction="rtl" unicode-bidi="embed">Decide/)
  assert.match(rtl, /<text x="131" y="34" font-size="15\.5"[^>]*direction="rtl"[^>]*>Rounded/)
  // A taller node centres its text vertically.
  const tall = renderGraphSvg({ ...base, boxes: new Map(base.boxes).set('h', { ...base.boxes.get('h'), height: 100 }) }, shaped, [])
  assert.match(tall, /<text x="72" y="55" text-anchor="middle"[^>]*>Prepare/)
})

const render = (props, slots) => renderComponent(NetworkGraph, { nodes, edges, ...props }, slots)

test('NetworkGraph server markup is unchanged by default values of the edge and shape fields', async () => {
  const plain = await render({ edgesSelectable: true })
  const defaults = await render({
    edgesSelectable: true, parallelEdgeSpacing: undefined,
    nodes: nodes.map(node => ({ ...node, shape: 'box' })),
    edges: edges.map(edge => ({ ...edge, markerEnd: 'arrow', markerStart: 'none', animated: false, edgeStyle: 'curve' })),
  })
  assert.equal(defaults, plain)
  // Parallel spacing without parallel edges changes nothing either.
  const singles = edges.filter(edge => edge.id === 'xb' || edge.id === 'bc')
  assert.equal(await render({ edges: singles, parallelEdgeSpacing: 12 }), await render({ edges: singles }))
  for (const name of ['vw-is-animated', 'vw-node-shape', 'marker-start', 'vw-edge-marker-hollow', '-open-arrow']) assert.equal(plain.includes(name), false)
  assert.equal((plain.match(/<marker /g) ?? []).length, 1)
})

test('NetworkGraph renders shapes, markers, animated edges and spread parallel edges only when used', async () => {
  const shaped = nodes.map((node, i) => ({ ...node, shape: ['diamond', 'ellipse', 'hexagon', 'rounded'][i], detail: i === 0 ? 'detail' : undefined }))
  const decorated = edges.map(edge => edge.id === 'ab1' ? { ...edge, markerStart: 'circle', markerEnd: 'open-arrow', animated: true }
    : edge.id === 'ba' ? { ...edge, markerEnd: 'diamond' } : edge.id === 'bc' ? { ...edge, markerEnd: 'none', markerStart: 'bar' } : edge)
  const html = await render({ nodes: shaped, edges: decorated, parallelEdgeSpacing: 12, dir: 'rtl' })
  // The default arrow stays in the template's defs; the others are derived from its ID in a second defs group.
  const id = /<marker id="([^"]+)" markerWidth="7"/.exec(html)[1]
  assert.match(html, new RegExp(`<defs><marker id="${id}-start-circle" markerWidth="7" markerHeight="7" refX="6.1" refY="3.5" orient="auto-start-reverse"><circle cx="3.5" cy="3.5" r="2.6" class="vw-edge-marker-hollow" fill="none" stroke="context-stroke"`))
  for (const marker of ['open-arrow', 'diamond', 'start-bar']) assert.match(html, new RegExp(`<marker id="${id}-${marker}" `))
  assert.equal(html.includes(`id="${id}-bar"`), false)
  assert.match(html, new RegExp(`<path class="vw-network-edge vw-is-animated" d="[^"]+" marker-start="url\\(#${id}-start-circle\\)" marker-end="url\\(#${id}-open-arrow\\)">`))
  assert.match(html, new RegExp(`<path class="vw-network-edge" d="[^"]+" marker-start="url\\(#${id}-start-bar\\)"></path>`))
  assert.match(html, new RegExp(`<path class="vw-network-edge" d="[^"]+" marker-end="url\\(#${id}\\)"></path>`))
  // Shapes inside the box with centred text; rounded nodes keep their rectangle and inline-start text.
  assert.match(html, /<polygon class="vw-node-shape" points="72,2 142,29 72,56 2,29"><\/polygon><text x="72" y="24" text-anchor="middle" class="vw-node-title">A<\/text><text x="72" y="43" text-anchor="middle" class="vw-node-detail">detail<\/text>/)
  assert.match(html, /<ellipse class="vw-node-shape" cx="72" cy="29" rx="70" ry="27"><\/ellipse><text x="72" y="34" text-anchor="middle" class="vw-node-title">X<\/text>/)
  assert.match(html, /<polygon class="vw-node-shape" points="2,29 17.59,2 126.41,2 142,29 126.41,56 17.59,56">/)
  assert.match(html, /<rect x="2" y="2" width="140" height="54" rx="19"><\/rect><text x="131" y="34" class="vw-node-title">C<\/text>/)
  // Parallel edges are drawn apart, with the routes the core computes for the shaped nodes.
  const expected = routeGraphEdges(layoutLayeredGraph(shaped, decorated), decorated, byId(shaped), { cornerRadius: 6, parallelSpacing: 12 })
  for (const edge of ['ab1', 'ab2', 'ba']) assert.ok(html.includes(`d="${expected.paths.get(edge)}"`), edge)
  // Accessible names do not change.
  assert.match(html, /aria-label="A detail"/)
  // The edge slot still receives the path; markers belong to the default renderer.
  const slotted = await render({ edges: decorated }, { edge: ({ path }) => h('path', { class: 'mine', d: path }) })
  assert.equal(slotted.includes('vw-is-animated'), false)
})

test('NetworkGraph validates edge styles, markers and the parallel spacing', async () => {
  await assert.rejects(render({ edges: [{ id: 'ab', from: 'a', to: 'b', edgeStyle: 'wavy' }] }), { name: 'RangeError', message: /Unknown edge style on graph edge ab: wavy/ })
  await assert.rejects(render({ edges: [{ id: 'ab', from: 'a', to: 'b', markerEnd: 'star' }] }), { name: 'RangeError', message: /Unknown edge marker on graph edge ab: star/ })
  for (const parallelEdgeSpacing of [0, -1, Number.NaN, Infinity]) {
    await assert.rejects(render({ parallelEdgeSpacing }), { name: 'RangeError', message: /parallelEdgeSpacing/ })
  }
  // A per-edge orthogonal style draws that edge with the component's rounded corners.
  const html = await render({ edges: edges.map(edge => edge.id === 'bc' ? { ...edge, edgeStyle: 'orthogonal' } : edge) })
  const drawn = layoutLayeredGraph(nodes, edges)
  const expected = routeGraphEdges(routeGraphPorts(drawn, nodeMap, edges, 'LR'), edges, nodeMap, { style: 'orthogonal', cornerRadius: 6 })
  assert.ok(html.includes(`d="${expected.paths.get('bc')}"`))
  assert.ok(html.includes(`d="${drawn.paths.get('xb')}"`))
})
