import test from 'node:test'
import assert from 'node:assert/strict'
import { layoutForceGraph } from 'vue-weave/core'

const node = id => ({ id })
const edge = (id, from, to) => ({ id, from, to })

function randomGraph(count, extra, seed = 7) {
  let state = seed
  const random = () => (state = (state * 1103515245 + 12345) % 2147483648) / 2147483648
  const nodes = Array.from({ length: count }, (_, i) => node('n' + i))
  const edges = []
  for (let i = 1; i < count; i++) edges.push(edge('t' + i, 'n' + Math.floor(random() * i), 'n' + i))
  for (let k = 0; k < extra; k++) edges.push(edge('e' + k, 'n' + Math.floor(random() * count), 'n' + Math.floor(random() * count)))
  return { nodes, edges }
}

const serialize = layout => JSON.stringify({
  boxes: [...layout.boxes], paths: [...layout.paths], labels: [...layout.edgeLabels], width: layout.width, height: layout.height,
})

function overlapping(layout) {
  const boxes = [...layout.boxes]
  const pairs = []
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      const [ia, a] = boxes[i], [ib, b] = boxes[j]
      if (a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height) pairs.push([ia, ib])
    }
  }
  return pairs
}

function assertInside(layout, padding = 20) {
  for (const [id, box] of layout.boxes) {
    assert.ok(Number.isFinite(box.x) && Number.isFinite(box.y), id)
    assert.ok(box.x >= padding - 1e-6 && box.y >= padding - 1e-6, id)
    assert.ok(box.x + box.width <= layout.width - padding + 1e-6 && box.y + box.height <= layout.height - padding + 1e-6, id)
  }
}

const sample = {
  nodes: ['a', 'b', 'c', 'd', 'e', 'f'].map(node),
  edges: [edge('ab', 'a', 'b'), edge('bc', 'b', 'c'), edge('ca', 'c', 'a'), edge('cd', 'c', 'd'), edge('de', 'd', 'e'), edge('ef', 'e', 'f')],
}

test('force layout is deterministic for a seed and changes with the seed', () => {
  const first = layoutForceGraph(sample.nodes, sample.edges, { seed: 3 })
  assert.equal(serialize(layoutForceGraph(sample.nodes, sample.edges, { seed: 3 })), serialize(first))
  assert.notEqual(serialize(layoutForceGraph(sample.nodes, sample.edges, { seed: 4 })), serialize(first))
  assert.equal(serialize(layoutForceGraph(sample.nodes, sample.edges)), serialize(layoutForceGraph(sample.nodes, sample.edges, { seed: 1 })))
})

test('force layout returns a complete GraphLayout without overlapping boxes', () => {
  const big = randomGraph(300, 60)
  const star = { nodes: Array.from({ length: 40 }, (_, i) => node('s' + i)), edges: Array.from({ length: 39 }, (_, i) => edge('x' + i, 's0', 's' + (i + 1))) }
  for (const graph of [sample, big, star]) {
    const layout = layoutForceGraph(graph.nodes, graph.edges)
    assert.equal(layout.boxes.size, graph.nodes.length)
    assert.equal(layout.paths.size, graph.edges.length)
    assert.equal(layout.edgeLabels.size, graph.edges.length)
    assert.deepEqual(overlapping(layout), [])
    assertInside(layout)
    for (const box of layout.boxes.values()) assert.deepEqual([box.width, box.height], [144, 58])
  }
  const custom = layoutForceGraph(sample.nodes, sample.edges, { nodeWidth: 80, nodeHeight: 30, padding: 5, iterations: 20, linkDistance: 60, nodeGap: 0 })
  assert.deepEqual(overlapping(custom), [])
  assertInside(custom, 5)
  // Few iterations keep the crowded seeded start, which the overlap passes must still separate.
  assert.deepEqual(overlapping(layoutForceGraph(big.nodes, big.edges, { iterations: 1 })), [])
})

test('force layout box rank is the breadth-first depth from the first node of each component', () => {
  const layout = layoutForceGraph(
    ['a', 'b', 'c', 'd', 'x', 'y'].map(node),
    [edge('ab', 'a', 'b'), edge('cb', 'c', 'b'), edge('cd', 'c', 'd'), edge('yx', 'y', 'x')],
  )
  assert.deepEqual([...layout.boxes].map(([id, box]) => [id, box.rank]), [['a', 0], ['b', 1], ['c', 2], ['d', 3], ['x', 0], ['y', 1]])
})

test('straight edges are clipped to the box borders with labels at their midpoints', () => {
  const layout = layoutForceGraph([node('a'), node('b')], [edge('ab', 'a', 'b')])
  const match = layout.paths.get('ab').match(/^M (\S+) (\S+) L (\S+) (\S+)$/)
  assert.ok(match)
  const [x1, y1, x2, y2] = match.slice(1).map(Number)
  const onBorder = (box, x, y) => {
    const inside = x >= box.x - 1e-6 && x <= box.x + box.width + 1e-6 && y >= box.y - 1e-6 && y <= box.y + box.height + 1e-6
    const edgeX = Math.abs(x - box.x) < 1e-6 || Math.abs(x - box.x - box.width) < 1e-6
    const edgeY = Math.abs(y - box.y) < 1e-6 || Math.abs(y - box.y - box.height) < 1e-6
    return inside && (edgeX || edgeY)
  }
  assert.ok(onBorder(layout.boxes.get('a'), x1, y1))
  assert.ok(onBorder(layout.boxes.get('b'), x2, y2))
  assert.deepEqual(layout.edgeLabels.get('ab'), { x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 6 })
})

test('self-loops and parallel edges each receive a distinct path and label', () => {
  const layout = layoutForceGraph([node('a'), node('b')], [
    edge('loop1', 'a', 'a'), edge('loop2', 'a', 'a'), edge('ab1', 'a', 'b'), edge('ab2', 'a', 'b'), edge('ba', 'b', 'a'),
  ])
  assert.equal(new Set(layout.paths.values()).size, 5)
  assert.equal(new Set([...layout.edgeLabels.values()].map(point => point.x + ',' + point.y)).size, 5)
  assert.match(layout.paths.get('loop1'), /^M \S+ \S+ C /)
  // Three edges between one pair: the outer two bend to opposite sides and the middle one stays straight.
  for (const id of ['ab1', 'ba']) assert.match(layout.paths.get(id), /^M \S+ \S+ Q /)
  assert.match(layout.paths.get('ab2'), /^M \S+ \S+ L /)
  const two = layoutForceGraph([node('a'), node('b')], [edge('ab', 'a', 'b'), edge('ba', 'b', 'a')])
  assert.notEqual(two.paths.get('ab'), two.paths.get('ba'))
  for (const path of two.paths.values()) assert.match(path, / Q /)
  // Loops and bends stay inside the reported size.
  for (const path of layout.paths.values()) {
    const numbers = path.match(/-?[\d.]+(?:e-?\d+)?/g).map(Number)
    for (let k = 0; k < numbers.length; k += 2) {
      assert.ok(numbers[k] >= 0 && numbers[k] <= layout.width && numbers[k + 1] >= 0 && numbers[k + 1] <= layout.height, path)
    }
  }
})

test('pinned nodes keep their initial position and initial positions shape the start', () => {
  const nodes = ['a', 'b', 'c', 'd'].map(node)
  const edges = [edge('ab', 'a', 'b'), edge('bc', 'b', 'c'), edge('cd', 'c', 'd')]
  const initialPositions = new Map([['a', { x: 400.25, y: 300.5 }], ['d', { x: 1400, y: 300.5 }]])
  const fixed = new Set(['a', 'd', 'unknown'])
  const layout = layoutForceGraph(nodes, edges, { initialPositions, fixed })
  assert.equal(layout.boxes.get('a').x, 400.25)
  assert.equal(layout.boxes.get('a').y, 300.5)
  assert.equal(layout.boxes.get('d').x, 1400)
  assert.equal(layout.boxes.get('d').y, 300.5)
  assert.deepEqual(overlapping(layout), [])
  // The free nodes settle between the pins.
  for (const id of ['b', 'c']) assert.ok(layout.boxes.get(id).x > 400.25 && layout.boxes.get(id).x < 1400, id)

  const pinnedOnly = layoutForceGraph(nodes, edges, { fixed: new Set(['b']) })
  const seededStart = layoutForceGraph(nodes, edges, { iterations: 1 })
  assert.ok(pinnedOnly.boxes.get('b'))
  assert.deepEqual(overlapping(seededStart), [])

  // A horizontal start keeps a horizontal chain in order when nothing is pinned.
  const line = new Map(nodes.map((n, i) => [n.id, { x: i * 200, y: 0 }]))
  const ordered = layoutForceGraph(nodes, edges, { initialPositions: line, iterations: 50 })
  const xs = nodes.map(n => ordered.boxes.get(n.id).x)
  assert.deepEqual([...xs].sort((p, q) => p - q), xs)
  for (const n of nodes) assert.ok(Math.abs(ordered.boxes.get(n.id).y - ordered.boxes.get('a').y) < 1, n.id)
  assert.notEqual(serialize(ordered), serialize(layoutForceGraph(nodes, edges, { iterations: 50 })))
})

test('disconnected components are packed without overlapping', () => {
  const nodes = [], edges = []
  for (let c = 0; c < 6; c++) {
    for (let i = 0; i < 5; i++) nodes.push(node(`c${c}n${i}`))
    for (let i = 1; i < 5; i++) edges.push(edge(`c${c}e${i}`, `c${c}n0`, `c${c}n${i}`))
  }
  for (let i = 0; i < 20; i++) nodes.push(node('lonely' + i))
  const layout = layoutForceGraph(nodes, edges)
  assert.deepEqual(overlapping(layout), [])
  assertInside(layout)
  const bounds = c => {
    const boxes = [...layout.boxes].filter(([id]) => id.startsWith(`c${c}n`)).map(([, box]) => box)
    return {
      left: Math.min(...boxes.map(b => b.x)), right: Math.max(...boxes.map(b => b.x + b.width)),
      top: Math.min(...boxes.map(b => b.y)), bottom: Math.max(...boxes.map(b => b.y + b.height)),
    }
  }
  for (let a = 0; a < 6; a++) {
    for (let b = a + 1; b < 6; b++) {
      const p = bounds(a), q = bounds(b)
      assert.ok(p.right <= q.left || q.right <= p.left || p.bottom <= q.top || q.bottom <= p.top, `components ${a} and ${b}`)
    }
  }
})

test('empty graphs have positive dimensions and inputs are not mutated', () => {
  assert.deepEqual(layoutForceGraph([], []), { boxes: new Map(), paths: new Map(), edgeLabels: new Map(), width: 40, height: 40 })
  assert.deepEqual(layoutForceGraph([], [], { padding: 0 }).width, 1)
  const nodes = Object.freeze(sample.nodes.map(n => Object.freeze({ ...n })))
  const edges = Object.freeze(sample.edges.map(e => Object.freeze({ ...e })))
  const initialPositions = new Map([['a', Object.freeze({ x: 10, y: 10 })]])
  layoutForceGraph(nodes, edges, { initialPositions, fixed: new Set(['a']) })
  assert.deepEqual(initialPositions.get('a'), { x: 10, y: 10 })
  const single = layoutForceGraph([node('only')], [])
  assert.deepEqual(single.boxes.get('only'), { x: 20, y: 20, width: 144, height: 58, rank: 0 })
  assert.deepEqual([single.width, single.height], [184, 98])
})

test('force layout validates references and options', () => {
  assert.throws(() => layoutForceGraph([node('a')], [edge('x', 'a', 'missing')]), { name: 'Error', message: /Unknown endpoint/ })
  assert.throws(() => layoutForceGraph([node('a'), node('a')], []), /Duplicate graph node ID/)
  for (const options of [
    { iterations: 0 }, { iterations: 1.5 }, { nodeWidth: 0 }, { nodeHeight: -1 }, { padding: NaN }, { linkDistance: Infinity },
    { repulsion: -1 }, { gravity: 2 }, { nodeGap: -1 }, { seed: 0.5 }, { initialPositions: new Map([['a', { x: NaN, y: 0 }]]) },
  ]) {
    assert.throws(() => layoutForceGraph([node('a')], [], options), RangeError, JSON.stringify(options))
  }
})

test('force layout handles 2,000 nodes quickly and a 12,000-node chain without recursion', () => {
  const big = randomGraph(2000, 400, 11)
  const started = performance.now()
  const layout = layoutForceGraph(big.nodes, big.edges)
  const elapsed = performance.now() - started
  assert.ok(elapsed < 5000, `2,000-node layout took ${elapsed.toFixed(0)} ms`)
  assert.equal(layout.boxes.size, 2000)
  assert.deepEqual(overlapping(layout).length, 0)

  const chain = Array.from({ length: 12000 }, (_, i) => node('c' + i))
  const links = chain.slice(1).map((n, i) => edge('l' + i, 'c' + i, n.id))
  const long = layoutForceGraph(chain, links, { iterations: 50 })
  assert.equal(long.boxes.size, 12000)
  assert.equal(long.boxes.get('c11999').rank, 11999)
  assert.ok(Number.isFinite(long.width) && Number.isFinite(long.height))
})
