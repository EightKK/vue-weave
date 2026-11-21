import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  graphEdgeEndpoint, graphPathBounds, graphPathEndpoints, graphPolylinePath, graphPortAnchor, graphSmoothPath, indexGraph, routeGraphEdges,
  routeGraphPorts,
} from '@eightkk/vue-weave/core'

test('port sides must be one of the four sides', () => {
  const box = { x: 0, y: 0, width: 100, height: 40, rank: 0 }
  const layout = { boxes: new Map([['a', box], ['b', { ...box, x: 200 }]]), paths: new Map(), edgeLabels: new Map(), width: 300, height: 40 }
  for (const side of ['constructor', 'toString', 'middle', undefined]) {
    const nodes = new Map([['a', { id: 'a', ports: [{ id: 'out', side }] }], ['b', { id: 'b' }]])
    const edges = [{ id: 'ab', from: 'a', to: 'b', fromPort: 'out' }]
    const message = `Invalid graph port on node a: port out has side ${String(side)}, expected left, right, top or bottom`
    assert.throws(() => indexGraph([...nodes.values()], edges), { name: 'Error', message })
    assert.throws(() => graphEdgeEndpoint(layout, nodes, edges[0], 'from', 'LR'), { name: 'Error', message })
    assert.throws(() => routeGraphPorts(layout, nodes, edges, 'LR'), { name: 'Error', message })
    for (const style of ['orthogonal', 'straight']) assert.throws(() => routeGraphEdges(layout, edges, nodes, { style }), { name: 'Error', message })
    assert.throws(() => graphPortAnchor(box, { id: 'out', side }), { name: 'Error', message: `Invalid graph port out: side ${String(side)}, expected left, right, top or bottom` })
  }
})

test('polyline and smooth paths reject non-finite points', () => {
  for (const points of [[{ x: NaN, y: 0 }, { x: 1, y: 1 }], [{ x: 0, y: 0 }, { x: 1, y: Infinity }], [{ x: 0, y: 0 }, { x: 4, y: 0 }, { y: 2 }]]) {
    assert.throws(() => graphPolylinePath(points), RangeError)
    assert.throws(() => graphPolylinePath(points, 4), RangeError)
    assert.throws(() => graphSmoothPath(points), RangeError)
  }
})

test('orthogonal detours at negative coordinates keep the 16 unit stub', () => {
  const layout = (offset) => ({
    boxes: new Map([['a', { x: offset, y: offset, width: 100, height: 40, rank: 0 }], ['b', { x: offset + 50, y: offset + 100, width: 100, height: 40, rank: 1 }]]),
    paths: new Map(), edgeLabels: new Map(), width: 300, height: 300,
  })
  const edges = [{ id: 'ab', from: 'a', to: 'b' }]
  const nodes = new Map([['a', { id: 'a' }], ['b', { id: 'b' }]])
  // The boxes overlap along the x axis, so the LR route leaves and enters on the right and detours 16 units past both.
  const positive = routeGraphEdges(layout(100), edges, nodes, { style: 'orthogonal' }).paths.get('ab')
  assert.equal(positive, 'M 200 120 L 266 120 L 266 220 L 250 220')
  const negative = routeGraphEdges(layout(-1000), edges, nodes, { style: 'orthogonal' }).paths.get('ab')
  assert.equal(negative, 'M -900 -980 L -834 -980 L -834 -880 L -850 -880')
  // On the left side (RL) the detour runs 16 units left of the boxes instead of to x = 0.
  const left = routeGraphEdges(layout(-1000), edges, nodes, { style: 'orthogonal', direction: 'RL' }).paths.get('ab')
  assert.equal(left, 'M -1000 -980 L -1016 -980 L -1016 -880 L -950 -880')
  // In a nonnegative layout a detour near the origin is still kept inside the chart.
  assert.equal(routeGraphEdges(layout(4), edges, nodes, { style: 'orthogonal', direction: 'RL' }).paths.get('ab'), 'M 4 24 L 0 24 L 0 124 L 54 124')
  // Self-loop brackets at negative coordinates also keep their stub.
  const loop = routeGraphEdges(layout(-1000), [{ id: 'aa', from: 'a', to: 'a' }], nodes, { style: 'orthogonal', direction: 'BT' }).paths.get('aa')
  assert.equal(loop, 'M -965 -1000 L -965 -1016 L -935 -1016 L -935 -1000')
})

test('SVG path scanning requires the data to start with a moveto', () => {
  for (const path of ['L 10 10', 'l 1 1', 'Z', 'z M 0 0', 'C 0 0, 1 1, 2 2']) {
    assert.throws(() => graphPathBounds(path), { name: 'Error', message: 'Invalid SVG path data: ' + path })
    assert.throws(() => graphPathEndpoints(path), { name: 'Error', message: 'Invalid SVG path data: ' + path })
  }
  assert.deepEqual(graphPathBounds('  m 10 10 l 5 5'), { x: 10, y: 10, width: 5, height: 5 })
  assert.equal(graphPathBounds('   '), undefined)
})
