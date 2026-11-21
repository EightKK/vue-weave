import { test } from 'node:test'
import assert from 'node:assert/strict'
import { layoutCircularGraph, layoutGridGraph, layoutConcentricGraph } from '@eightkk/vue-weave/core'
import { centre } from './helpers/builders.mjs'

const make = n => Array.from({ length: n }, (_, i) => ({ id: 'n' + i }))
const chain = n => Array.from({ length: n - 1 }, (_, i) => ({ id: 'e' + i, from: 'n' + i, to: 'n' + (i + 1) }))

function assertNoOverlap(layout, tolerance = 1e-6) {
  const boxes = [...layout.boxes.values()].sort((a, b) => a.x - b.x)
  // Sweep over x; the active window is small for these layouts only when sorted, so compare against a bounded neighbourhood.
  for (let i = 0; i < boxes.length; i++) {
    const a = boxes[i]
    for (let j = i + 1; j < boxes.length && boxes[j].x < a.x + a.width - tolerance; j++) {
      const b = boxes[j]
      const apart = a.y + a.height <= b.y + tolerance || b.y + b.height <= a.y + tolerance
      assert.ok(apart, 'boxes overlap')
    }
  }
}

const layouts = {
  circular: (n, e, o) => layoutCircularGraph(n, e, o),
  grid: (n, e, o) => layoutGridGraph(n, e, o),
  concentric: (n, e, o) => layoutConcentricGraph(n, e, o),
}

for (const [name, layout] of Object.entries(layouts)) {
  test(`${name}: empty, single and disconnected graphs`, () => {
    const empty = layout([], [])
    assert.equal(empty.boxes.size, 0)
    assert.ok(empty.width >= 1 && empty.height >= 1)
    const single = layout([{ id: 'a' }], [], { padding: 10, nodeWidth: 100, nodeHeight: 40 })
    assert.deepEqual(single.boxes.get('a'), { x: 10, y: 10, width: 100, height: 40, rank: 0 })
    assert.equal(single.width, 120)
    assert.equal(single.height, 60)
    const disconnected = layout(make(7), [])
    assert.equal(disconnected.boxes.size, 7)
    assertNoOverlap(disconnected)
  })

  test(`${name}: self-loops and parallel edges get a path`, () => {
    const nodes = make(5)
    const edges = [
      { id: 's', from: 'n1', to: 'n1' },
      { id: 'p1', from: 'n0', to: 'n2' },
      { id: 'p2', from: 'n0', to: 'n2' },
      { id: 'back', from: 'n2', to: 'n0' },
    ]
    const result = layout(nodes, edges)
    for (const edge of edges) {
      assert.match(result.paths.get(edge.id), /^M /)
      assert.ok(result.edgeLabels.has(edge.id))
    }
    assert.ok(result.width >= 1)
    assertNoOverlap(result)
    for (const box of result.boxes.values()) assert.ok(box.x >= 0 && box.y >= 0 && box.x + box.width <= result.width && box.y + box.height <= result.height)
  })

  test(`${name}: does not mutate its input and is deterministic`, () => {
    const nodes = make(9), edges = chain(9)
    const before = JSON.stringify([nodes, edges])
    const a = layout(nodes, edges), b = layout(nodes, edges)
    assert.equal(JSON.stringify([nodes, edges]), before)
    assert.deepEqual([...a.boxes], [...b.boxes])
    assert.deepEqual([...a.paths], [...b.paths])
    assert.equal(a.width, b.width)
  })

  test(`${name}: rejects invalid numbers, duplicate IDs and unknown references`, () => {
    for (const bad of [0, -1, NaN, Infinity]) assert.throws(() => layout(make(2), [], { nodeWidth: bad }), RangeError)
    assert.throws(() => layout(make(2), [], { nodeHeight: 0 }), RangeError)
    assert.throws(() => layout(make(2), [], { padding: -1 }), RangeError)
    assert.throws(() => layout([{ id: 'a' }, { id: 'a' }], []), Error)
    assert.throws(() => layout(make(2), [{ id: 'e', from: 'n0', to: 'zzz' }]), Error)
  })

  test(`${name}: lays out a 12,000-node chain quickly without recursion`, () => {
    const started = Date.now()
    const result = layout(make(12000), chain(12000))
    assert.equal(result.boxes.size, 12000)
    assert.equal(result.paths.size, 11999)
    assert.ok(Date.now() - started < 5000)
  })
}

test('circular: all nodes share one circle, in input order, clockwise from the top', () => {
  const layout = layoutCircularGraph(make(8), [])
  const points = make(8).map(({ id }) => centre(layout.boxes.get(id)))
  const mid = { x: layout.width / 2, y: layout.height / 2 }
  const radii = points.map(p => Math.hypot(p.x - mid.x, p.y - mid.y))
  for (const r of radii) assert.ok(Math.abs(r - radii[0]) < 1e-6)
  assert.ok(Math.abs(points[0].x - mid.x) < 1e-6 && points[0].y < mid.y)
  assert.ok(points[1].x > mid.x)
  const counter = layoutCircularGraph(make(8), [], { clockwise: false })
  assert.ok(centre(counter.boxes.get('n1')).x < counter.width / 2)
  assertNoOverlap(layout)
})

test('circular: startAngle and sort', () => {
  const right = layoutCircularGraph(make(4), [], { startAngle: 0 })
  const first = centre(right.boxes.get('n0'))
  assert.ok(first.x > right.width / 2 && Math.abs(first.y - right.height / 2) < 1e-6)
  const sorted = layoutCircularGraph(make(4), [], { sort: (a, b) => b.id.localeCompare(a.id) })
  assert.ok(Math.abs(centre(sorted.boxes.get('n3')).x - sorted.width / 2) < 1e-6)
  assert.ok(centre(sorted.boxes.get('n3')).y < sorted.height / 2)
})

test('circular: the radius grows with the node count and an explicit radius is checked', () => {
  const size = n => layoutCircularGraph(make(n), []).width
  assert.ok(size(4) < size(12) && size(12) < size(40) && size(40) < size(120))
  assertNoOverlap(layoutCircularGraph(make(60), []))
  const minimum = layoutCircularGraph(make(10), [], { nodeWidth: 100, nodeHeight: 100 }).width
  assert.throws(() => layoutCircularGraph(make(10), [], { radius: 50 }), RangeError)
  assert.throws(() => layoutCircularGraph(make(3), [], { radius: 0 }), RangeError)
  assert.throws(() => layoutCircularGraph(make(3), [], { radius: NaN }), RangeError)
  assert.throws(() => layoutCircularGraph(make(3), [], { startAngle: Infinity }), RangeError)
  const roomy = layoutCircularGraph(make(10), [], { radius: 1000 })
  assert.ok(roomy.width > minimum)
  assertNoOverlap(roomy)
  assert.equal(layoutCircularGraph(make(1), [], { radius: 5 }).boxes.size, 1)
})

test('grid: rows of the requested columns in input order', () => {
  const layout = layoutGridGraph(make(7), [], { columns: 3, nodeWidth: 100, nodeHeight: 40, columnGap: 10, rowGap: 20, padding: 5 })
  assert.deepEqual(layout.boxes.get('n0'), { x: 5, y: 5, width: 100, height: 40, rank: 0 })
  assert.deepEqual(layout.boxes.get('n2'), { x: 225, y: 5, width: 100, height: 40, rank: 0 })
  assert.deepEqual(layout.boxes.get('n3'), { x: 5, y: 65, width: 100, height: 40, rank: 1 })
  assert.deepEqual(layout.boxes.get('n6'), { x: 5, y: 125, width: 100, height: 40, rank: 2 })
  assert.equal(layout.width, 330)
  assert.equal(layout.height, 170)
  assertNoOverlap(layout)
})

test('grid: default column count is the ceiling of the square root', () => {
  const columnsOf = layout => new Set([...layout.boxes.values()].map(box => box.x)).size
  assert.equal(columnsOf(layoutGridGraph(make(10), [])), 4)
  assert.equal(columnsOf(layoutGridGraph(make(9), [])), 3)
  assert.equal(columnsOf(layoutGridGraph(make(2), [])), 2)
  assert.equal(columnsOf(layoutGridGraph(make(5), [], { columns: 1 })), 1)
  assert.equal(columnsOf(layoutGridGraph(make(3), [], { columns: 10 })), 3)
})

test('grid: validates columns', () => {
  for (const bad of [0, -2, 1.5, NaN, Infinity]) assert.throws(() => layoutGridGraph(make(4), [], { columns: bad }), RangeError)
  assert.throws(() => layoutGridGraph(make(4), [], { columnGap: -1 }), RangeError)
  assert.equal(layoutGridGraph(make(4), [], { columnGap: 0, rowGap: 0 }).boxes.size, 4)
})

test('concentric: higher degree sits closer to the centre and rings never overlap', () => {
  // A hub with 6 spokes, two of which are chained further.
  const nodes = [{ id: 'hub' }, ...make(6), { id: 'leafA' }, { id: 'leafB' }]
  const edges = [
    ...make(6).map(({ id }) => ({ id: 'h-' + id, from: 'hub', to: id })),
    { id: 'x1', from: 'n0', to: 'leafA' },
    { id: 'x2', from: 'n1', to: 'leafB' },
    { id: 'x3', from: 'n0', to: 'n1' },
  ]
  const layout = layoutConcentricGraph(nodes, edges)
  assert.equal(layout.boxes.get('hub').rank, 0)
  assert.ok(layout.boxes.get('n0').rank < layout.boxes.get('n2').rank)
  const mid = centre(layout.boxes.get('hub'))
  const dist = id => Math.hypot(centre(layout.boxes.get(id)).x - mid.x, centre(layout.boxes.get(id)).y - mid.y)
  assert.ok(dist('hub') < dist('n0') && dist('n0') < dist('n2'))
  assert.equal(layout.boxes.get('n2').rank, layout.boxes.get('leafA').rank)
  assert.ok(Math.abs(dist('n2') - dist('n3')) < 1e-6)
  assertNoOverlap(layout)
})

test('concentric: custom level, levelWidth buckets and rings sized for their nodes', () => {
  const nodes = make(20).map((node, i) => ({ ...node, weight: i }))
  const byWeight = layoutConcentricGraph(nodes, [], { level: node => node.weight })
  assert.equal(byWeight.boxes.get('n19').rank, 0)
  assert.equal(byWeight.boxes.get('n0').rank, 19)
  const bucketed = layoutConcentricGraph(nodes, [], { level: node => node.weight, levelWidth: 10 })
  assert.equal(new Set([...bucketed.boxes.values()].map(box => box.rank)).size, 2)
  assert.equal(bucketed.boxes.get('n15').rank, 0)
  assert.equal(bucketed.boxes.get('n5').rank, 1)
  assertNoOverlap(bucketed)
  assertNoOverlap(byWeight)
  // A ring of many nodes pushes itself outwards.
  const crowd = layoutConcentricGraph(make(100), [], { level: node => (node.id === 'n0' ? 5 : 1) })
  assertNoOverlap(crowd)
  const small = layoutConcentricGraph(make(5), [], { level: node => (node.id === 'n0' ? 5 : 1) })
  assert.ok(crowd.width > small.width)
})

test('concentric: self-loops do not raise the degree and bad levels throw', () => {
  const nodes = make(3)
  const layout = layoutConcentricGraph(nodes, [{ id: 'l', from: 'n2', to: 'n2' }, { id: 'e', from: 'n0', to: 'n1' }])
  assert.equal(layout.boxes.get('n0').rank, layout.boxes.get('n1').rank)
  assert.ok(layout.boxes.get('n2').rank > layout.boxes.get('n0').rank)
  assert.throws(() => layoutConcentricGraph(nodes, [], { level: () => NaN }), RangeError)
  assert.throws(() => layoutConcentricGraph(nodes, [], { level: () => Infinity }), RangeError)
  assert.throws(() => layoutConcentricGraph(nodes, [], { levelWidth: 0 }), RangeError)
  assert.throws(() => layoutConcentricGraph(nodes, [], { levelWidth: -1 }), RangeError)
  assert.throws(() => layoutConcentricGraph(nodes, [], { ringGap: -1 }), RangeError)
})

test('straight edges run between box borders', () => {
  for (const layout of [layoutCircularGraph(make(2), [{ id: 'e', from: 'n0', to: 'n1' }]), layoutGridGraph(make(2), [{ id: 'e', from: 'n0', to: 'n1' }])]) {
    assert.match(layout.paths.get('e'), /^M [\d.e+-]+ [\d.e+-]+ L [\d.e+-]+ [\d.e+-]+$/)
  }
})
