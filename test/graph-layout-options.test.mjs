import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  layoutCircularGraph, layoutConcentricGraph, layoutFlowGraph, layoutForceGraph, layoutGraphIncrementally, layoutGridGraph,
  layoutLayeredGraph, layoutRadialGraph, layoutSwimlaneGraph, layoutTreeGraph,
} from '@eightkk/vue-weave/core'

const nodes = [{ id: 'a' }, { id: 'b' }]
const edges = [{ id: 'ab', from: 'a', to: 'b' }]
const lane = { lanes: ['x'], laneOf: () => 'x' }
const flow = { quantity: () => 1, unit: 'pcs' }

// Every layout reports an invalid numeric option as RangeError('<option> must be <rule> (got <value>)').
const formats = {
  layoutLayeredGraph: [
    [o => layoutLayeredGraph(nodes, edges, o), { nodeWidth: 0 }, 'nodeWidth must be a finite number > 0 (got 0)'],
    [o => layoutLayeredGraph(nodes, edges, o), { columnGap: -1 }, 'columnGap must be a finite number ≥ 0 (got -1)'],
    [o => layoutLayeredGraph(nodes, edges, o), { crossingSweeps: 1.5 }, 'crossingSweeps must be an integer ≥ 1 (got 1.5)'],
  ],
  layoutTreeGraph: [
    [o => layoutTreeGraph(nodes, edges, o), { nodeHeight: NaN }, 'nodeHeight must be a finite number > 0 (got NaN)'],
    [o => layoutTreeGraph(nodes, edges, o), { rowGap: Infinity }, 'rowGap must be a finite number ≥ 0 (got Infinity)'],
  ],
  layoutRadialGraph: [
    [o => layoutRadialGraph(nodes, edges, o), { ringGap: -3 }, 'ringGap must be a finite number ≥ 0 (got -3)'],
  ],
  layoutCircularGraph: [
    [o => layoutCircularGraph(nodes, edges, o), { nodeGap: '5' }, 'nodeGap must be a finite number ≥ 0 (got "5")'],
    [o => layoutCircularGraph(nodes, edges, o), { radius: 0 }, 'radius must be a finite number > 0 (got 0)'],
    [o => layoutCircularGraph(nodes, edges, o), { startAngle: -Infinity }, 'startAngle must be a finite number (got -Infinity)'],
  ],
  layoutGridGraph: [
    [o => layoutGridGraph(nodes, edges, o), { padding: null }, 'padding must be a finite number ≥ 0 (got null)'],
    [o => layoutGridGraph(nodes, edges, o), { columns: 0 }, 'columns must be an integer ≥ 1 (got 0)'],
  ],
  layoutConcentricGraph: [
    [o => layoutConcentricGraph(nodes, edges, o), { levelWidth: -1 }, 'levelWidth must be a finite number > 0 (got -1)'],
    [o => layoutConcentricGraph(nodes, edges, o), { startAngle: NaN }, 'startAngle must be a finite number (got NaN)'],
  ],
  layoutForceGraph: [
    [o => layoutForceGraph(nodes, edges, o), { linkDistance: -1 }, 'linkDistance must be a finite number ≥ 0 (got -1)'],
    [o => layoutForceGraph(nodes, edges, o), { iterations: 0 }, 'iterations must be an integer ≥ 1 (got 0)'],
    [o => layoutForceGraph(nodes, edges, o), { gravity: 2 }, 'gravity must be a finite number in [0, 1] (got 2)'],
    [o => layoutForceGraph(nodes, edges, o), { seed: 0.5 }, 'seed must be a safe integer (got 0.5)'],
  ],
  layoutSwimlaneGraph: [
    [o => layoutSwimlaneGraph(nodes, edges, { ...lane, ...o }), { nodeWidth: -1 }, 'nodeWidth must be a finite number > 0 (got -1)'],
    [o => layoutSwimlaneGraph(nodes, edges, { ...lane, ...o }), { headerSize: -1 }, 'headerSize must be a finite number ≥ 0 (got -1)'],
    [o => layoutSwimlaneGraph(nodes, edges, { ...lane, ...o }), { crossingSweeps: 0 }, 'crossingSweeps must be an integer ≥ 1 (got 0)'],
  ],
  layoutFlowGraph: [
    [o => layoutFlowGraph(nodes, edges, { ...flow, ...o }), { nodeThickness: 0 }, 'nodeThickness must be a finite number > 0 (got 0)'],
    [o => layoutFlowGraph(nodes, edges, { ...flow, ...o }), { rankGap: -1 }, 'rankGap must be a finite number ≥ 0 (got -1)'],
    [o => layoutFlowGraph(nodes, edges, { ...flow, ...o }), { scale: { fitExtent: 0 } }, 'fitExtent must be a finite number > 0 (got 0)'],
  ],
  layoutGraphIncrementally: [
    [o => layoutGraphIncrementally(nodes, edges, new Map(), o), { nodeHeight: 0 }, 'nodeHeight must be a finite number > 0 (got 0)'],
    [o => layoutGraphIncrementally(nodes, edges, new Map(), o), { maxDisplacement: -1 }, 'maxDisplacement must be a finite number ≥ 0 (got -1)'],
  ],
}

for (const [name, cases] of Object.entries(formats)) {
  test(`${name} names the invalid option and its rule in one message format`, () => {
    for (const [run, options, message] of cases) assert.throws(() => run(options), { name: 'RangeError', message })
  })
}

test('layouts keep accepting zero gaps and padding and reject zero node sizes', () => {
  const zero = { columnGap: 0, rowGap: 0, padding: 0 }
  assert.equal(layoutLayeredGraph(nodes, edges, zero).boxes.size, 2)
  assert.equal(layoutTreeGraph(nodes, edges, zero).boxes.size, 2)
  assert.equal(layoutGridGraph(nodes, edges, zero).boxes.size, 2)
  assert.equal(layoutSwimlaneGraph(nodes, edges, { ...lane, ...zero, laneGap: 0, lanePadding: 0, headerSize: 0 }).boxes.size, 2)
  assert.equal(layoutGraphIncrementally(nodes, edges, new Map(), { ...zero, maxDisplacement: 0 }).boxes.size, 2)
  assert.equal(layoutRadialGraph(nodes, edges, { ringGap: 0, padding: 0 }).boxes.size, 2)
  assert.equal(layoutForceGraph(nodes, edges, { nodeGap: 0, linkDistance: 0, repulsion: 0, gravity: 0 }).boxes.size, 2)
  for (const run of [layoutLayeredGraph, layoutTreeGraph, layoutGridGraph, layoutCircularGraph, layoutForceGraph]) {
    assert.throws(() => run(nodes, edges, { nodeWidth: 0 }), { name: 'RangeError', message: 'nodeWidth must be a finite number > 0 (got 0)' })
  }
})

test('the grid, swimlane and rank-based layouts share the default gaps', () => {
  const three = [{ id: 'a' }, { id: 'b' }, { id: 'c' }]
  const gap = (layout, first, second, axis) => {
    const a = layout.boxes.get(first), b = layout.boxes.get(second)
    return axis === 'x' ? b.x - (a.x + a.width) : b.y - (a.y + a.height)
  }
  const grid = layoutGridGraph(three, [])
  assert.equal(gap(grid, 'a', 'b', 'x'), 50)
  assert.equal(gap(grid, 'a', 'c', 'y'), 24)
  assert.deepEqual([grid.boxes.get('a').x, grid.boxes.get('a').y], [20, 20])
  const swim = layoutSwimlaneGraph(three, [{ id: 'ab', from: 'a', to: 'b' }], lane)
  assert.equal(gap(swim, 'a', 'b', 'x'), 50)
  assert.equal(gap(swim, 'a', 'c', 'y'), 24)
  const swimTB = layoutSwimlaneGraph(three, [{ id: 'ab', from: 'a', to: 'b' }], { ...lane, direction: 'TB' })
  assert.equal(gap(swimTB, 'a', 'b', 'y'), 50)
  assert.equal(gap(swimTB, 'a', 'c', 'x'), 24)
  for (const layout of [layoutLayeredGraph(three, [{ id: 'ab', from: 'a', to: 'b' }]), layoutTreeGraph(three, [{ id: 'ab', from: 'a', to: 'b' }])]) {
    assert.equal(gap(layout, 'a', 'b', 'x'), 50)
    assert.equal(Math.abs(layout.boxes.get('c').y - layout.boxes.get('a').y), 58 + 24)
    assert.equal(layout.boxes.get('a').width, 144)
    assert.equal(layout.boxes.get('a').height, 58)
  }
})

// The first control point of a self-loop lies 6 units past its turn, which is min(24, max(6, columnGap / 2)) units
// past the box. A same-rank edge of a cycle turns at the same distance in the layered layout.
test('layered, tree and swimlane layouts turn self-loops and same-rank edges at the same distance', () => {
  const loop = [{ id: 'aa', from: 'a', to: 'a' }]
  const turnOf = (layout, id, from) => {
    const box = layout.boxes.get(from)
    const [, , controlX] = layout.paths.get(id).match(/^M (\S+) \S+ C (\S+)/).map(Number)
    return controlX - 6 - (box.x + box.width)
  }
  for (const [columnGap, expected] of [[4, 6], [12, 6], [60, 24]]) {
    assert.equal(turnOf(layoutLayeredGraph([{ id: 'a' }], loop, { columnGap }), 'aa', 'a'), expected, `layered ${columnGap}`)
    assert.equal(turnOf(layoutTreeGraph([{ id: 'a' }], loop, { columnGap }), 'aa', 'a'), expected, `tree ${columnGap}`)
    assert.equal(turnOf(layoutSwimlaneGraph([{ id: 'a' }], loop, { ...lane, columnGap }), 'aa', 'a'), expected, `swimlane ${columnGap}`)
    const cycle = layoutLayeredGraph(nodes, [...edges, { id: 'ba', from: 'b', to: 'a' }], { columnGap })
    assert.equal(turnOf(cycle, 'ab', 'a'), expected, `layered cycle ${columnGap}`)
    assert.equal(cycle.edgeLabels.get('ab').x - 9 - (cycle.boxes.get('a').x + 144), expected)
  }
  // Between 12 and 48 the distance is half the gap.
  assert.equal(turnOf(layoutLayeredGraph([{ id: 'a' }], loop, { columnGap: 30 }), 'aa', 'a'), 15)
})
