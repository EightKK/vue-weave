import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  graphComponents, graphDegreeCentrality, graphBetweennessCentrality, graphPageRank,
  detectGraphCommunities, graphCommunityGroups,
} from 'vue-weave/core'

const mk = ids => ids.map(id => ({ id }))
const edgesOf = pairs => pairs.map(([from, to, w], i) => ({ id: `e${i}`, from, to, ...(w === undefined ? {} : { w }) }))
const near = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`)
const sum = map => [...map.values()].reduce((a, b) => a + b, 0)

const KARATE = {
  2: [1], 3: [1, 2], 4: [1, 2, 3], 5: [1], 6: [1], 7: [1, 5, 6], 8: [1, 2, 3, 4], 9: [1, 3], 10: [3], 11: [1, 5, 6],
  12: [1], 13: [1, 4], 14: [1, 2, 3, 4], 17: [6, 7], 18: [1, 2], 20: [1, 2], 22: [1, 2], 26: [24, 25], 28: [3, 24, 25],
  29: [3], 30: [24, 27], 31: [2, 9], 32: [1, 25, 26, 29], 33: [3, 9, 15, 16, 19, 21, 23, 24, 30, 31, 32],
  34: [9, 10, 14, 15, 16, 19, 20, 21, 23, 24, 27, 28, 29, 30, 31, 32, 33],
}
const karateNodes = mk(Array.from({ length: 34 }, (_, i) => String(i + 1)))
const karateEdges = edgesOf(Object.entries(KARATE).flatMap(([to, froms]) => froms.map(from => [String(from), to])))

const path = edgesOf([['a', 'b'], ['b', 'c'], ['c', 'd']])
const star = edgesOf([['hub', 'a'], ['hub', 'b'], ['hub', 'c'], ['hub', 'd']])
const twoCliques = (() => {
  const left = ['a', 'b', 'c', 'd']
  const right = ['e', 'f', 'g', 'h']
  const pairs = []
  for (const group of [left, right]) for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) pairs.push([group[i], group[j]])
  pairs.push(['d', 'e'])
  return { nodes: mk([...left, ...right]), edges: edgesOf(pairs) }
})()

test('karate fixture has 78 edges', () => assert.equal(karateEdges.length, 78))

test('graphComponents orders components and members by input position', () => {
  const nodes = mk(['a', 'b', 'c', 'd', 'e', 'f'])
  const edges = edgesOf([['e', 'c'], ['a', 'b'], ['b', 'a']])
  assert.deepEqual(graphComponents(nodes, edges), [['a', 'b'], ['c', 'e'], ['d'], ['f']])
  assert.deepEqual(graphComponents([], []), [])
  assert.deepEqual(graphComponents(mk(['x']), edgesOf([['x', 'x']])), [['x']])
})

test('graphDegreeCentrality counts directions, self-loops and parallel edges', () => {
  const nodes = mk(['a', 'b', 'c'])
  const edges = edgesOf([['a', 'b'], ['a', 'b'], ['b', 'b'], ['c', 'a']])
  assert.deepEqual([...graphDegreeCentrality(nodes, edges)], [['a', 3], ['b', 4], ['c', 1]])
  assert.deepEqual([...graphDegreeCentrality(nodes, edges, { direction: 'in' })], [['a', 1], ['b', 3], ['c', 0]])
  assert.deepEqual([...graphDegreeCentrality(nodes, edges, { direction: 'out' })], [['a', 2], ['b', 1], ['c', 1]])
  assert.equal(graphDegreeCentrality(nodes, edges, { normalized: true }).get('b'), 2)
  assert.equal(graphDegreeCentrality(mk(['x']), [], { normalized: true }).get('x'), 0)
  assert.equal(graphDegreeCentrality([], []).size, 0)
  assert.throws(() => graphDegreeCentrality(nodes, edges, { direction: 'up' }), RangeError)
})

test('graphBetweennessCentrality on path, star and cycle', () => {
  const nodes = mk(['a', 'b', 'c', 'd'])
  const undirected = graphBetweennessCentrality(nodes, path, { directed: false, normalized: false })
  assert.deepEqual([...undirected.values()], [0, 2, 2, 0])
  near(graphBetweennessCentrality(nodes, path, { directed: false }).get('b'), 2 / 3)
  const directed = graphBetweennessCentrality(nodes, path, { normalized: false })
  assert.deepEqual([...directed.values()], [0, 2, 2, 0])
  near(graphBetweennessCentrality(nodes, path).get('b'), 2 / 6)

  const hub = graphBetweennessCentrality(mk(['hub', 'a', 'b', 'c', 'd']), star, { directed: false })
  near(hub.get('hub'), 1)
  near(hub.get('a'), 0)

  const cycle = edgesOf([['a', 'b'], ['b', 'c'], ['c', 'd'], ['d', 'a']])
  const ring = graphBetweennessCentrality(nodes, cycle, { directed: false, normalized: false })
  for (const value of ring.values()) near(value, 0.5)
})

test('graphBetweennessCentrality handles parallel edges, self-loops, weights and tiny graphs', () => {
  const nodes = mk(['a', 'b', 'c', 'd'])
  // Two routes a-b-d and a-c-d; the b route has a doubled first edge so it carries 2 of 3 shortest paths.
  const edges = edgesOf([['a', 'b'], ['a', 'b'], ['b', 'd'], ['a', 'c'], ['c', 'd'], ['d', 'd']])
  const result = graphBetweennessCentrality(nodes, edges, { normalized: false })
  near(result.get('b'), 2 / 3)
  near(result.get('c'), 1 / 3)

  // Weighted: the route a-c-d is cheaper than a-b-d.
  const weighted = edgesOf([['a', 'b', 5], ['b', 'd', 5], ['a', 'c', 1], ['c', 'd', 1]])
  const w = graphBetweennessCentrality(nodes, weighted, { normalized: false, weight: e => e.w })
  near(w.get('c'), 1)
  near(w.get('b'), 0)
  // Equal total lengths tie: both routes share the load.
  const tie = edgesOf([['a', 'b', 2], ['b', 'd', 2], ['a', 'c', 1], ['c', 'd', 3]])
  const t = graphBetweennessCentrality(nodes, tie, { normalized: false, weight: e => e.w })
  near(t.get('b'), 0.5)
  near(t.get('c'), 0.5)

  assert.equal(graphBetweennessCentrality(mk(['a', 'b']), edgesOf([['a', 'b']])).get('a'), 0)
  assert.equal(graphBetweennessCentrality([], []).size, 0)
  assert.throws(() => graphBetweennessCentrality(nodes, weighted, { weight: () => 0 }), RangeError)
  assert.throws(() => graphBetweennessCentrality(nodes, weighted, { weight: () => NaN }), RangeError)
  assert.throws(() => graphBetweennessCentrality(nodes, weighted, { weight: () => -1 }), RangeError)
})

test('graphBetweennessCentrality ranks karate club nodes 1 and 34 first', () => {
  const scores = graphBetweennessCentrality(karateNodes, karateEdges, { directed: false })
  const ranked = [...scores].sort((a, b) => b[1] - a[1]).map(([id]) => id)
  assert.deepEqual(ranked.slice(0, 2), ['1', '34'])
  near(scores.get('1'), 0.4376352813852813, 1e-9)
  near(scores.get('34'), 0.30407497594997596, 1e-9)
})

test('graphPageRank matches a known small example', () => {
  const nodes = mk(['a', 'b', 'c'])
  const edges = edgesOf([['a', 'b'], ['a', 'c'], ['b', 'c'], ['c', 'a']])
  const { scores, converged, iterations } = graphPageRank(nodes, edges, { tolerance: 1e-12, maxIterations: 1000 })
  assert.ok(converged)
  assert.ok(iterations > 1)
  // Fixed point of r = 0.15 / 3 + 0.85 * (link shares).
  const { a, b, c } = Object.fromEntries(scores)
  near(a, 0.05 + 0.85 * c, 1e-10)
  near(b, 0.05 + 0.85 * a / 2, 1e-10)
  near(c, 0.05 + 0.85 * (a / 2 + b), 1e-10)
  near(a, 0.38778971, 1e-7)
  near(sum(scores), 1)
})

test('graphPageRank handles dangling nodes, weights, empty graphs and option errors', () => {
  const nodes = mk(['a', 'b', 'c'])
  const dangling = graphPageRank(nodes, edgesOf([['a', 'b']]))
  near(sum(dangling.scores), 1)
  assert.ok(dangling.scores.get('b') > dangling.scores.get('a'))
  near(graphPageRank(mk(['x', 'y']), []).scores.get('x'), 0.5)
  const weighted = graphPageRank(nodes, edgesOf([['a', 'b', 9], ['a', 'c', 1]]), { weight: e => e.w })
  assert.ok(weighted.scores.get('b') > weighted.scores.get('c'))
  near(sum(weighted.scores), 1)
  const empty = graphPageRank([], [])
  assert.equal(empty.scores.size, 0)
  assert.equal(empty.converged, true)
  const ring = edgesOf([['a', 'b'], ['b', 'c'], ['c', 'a'], ['a', 'c']])
  const capped = graphPageRank(nodes, ring, { maxIterations: 1, tolerance: 1e-15 })
  assert.equal(capped.iterations, 1)
  assert.equal(capped.converged, false)
  for (const bad of [{ damping: 1 }, { damping: -0.1 }, { damping: NaN }, { tolerance: 0 }, { maxIterations: 0 }, { maxIterations: 1.5 }]) {
    assert.throws(() => graphPageRank(nodes, [], bad), RangeError)
  }
  assert.throws(() => graphPageRank(nodes, edgesOf([['a', 'b', -1]]), { weight: e => e.w }), RangeError)
})

test('detectGraphCommunities finds two cliques joined by a bridge', () => {
  const { communities, modularity } = detectGraphCommunities(twoCliques.nodes, twoCliques.edges)
  assert.deepEqual(communities, [['a', 'b', 'c', 'd'], ['e', 'f', 'g', 'h']])
  near(modularity, 2 * (6 / 13 - (13 / 26) ** 2), 1e-12)
})

test('detectGraphCommunities handles edgeless, disconnected, self-loop and weighted graphs', () => {
  assert.deepEqual(detectGraphCommunities([], []), { communities: [], modularity: 0 })
  assert.deepEqual(detectGraphCommunities(mk(['a', 'b']), []), { communities: [['a'], ['b']], modularity: 0 })
  const nodes = mk(['a', 'b', 'c', 'd', 'e'])
  const disconnected = detectGraphCommunities(nodes, edgesOf([['a', 'b'], ['c', 'd'], ['a', 'a']]))
  assert.deepEqual(disconnected.communities, [['a', 'b'], ['c', 'd'], ['e']])
  assert.ok(disconnected.modularity > 0.3)
  const four = mk(['a', 'b', 'c', 'd'])
  const light = detectGraphCommunities(four, edgesOf([['a', 'b', 10], ['c', 'd', 10], ['b', 'c', 1]]), { weight: e => e.w })
  assert.deepEqual(light.communities, [['a', 'b'], ['c', 'd']])
  const heavy = detectGraphCommunities(four, edgesOf([['a', 'b', 10], ['c', 'd', 10], ['b', 'c', 1000]]), { weight: e => e.w })
  assert.deepEqual(heavy.communities, [['a', 'b', 'c', 'd']])
  const coarse = detectGraphCommunities(twoCliques.nodes, twoCliques.edges, { resolution: 0.01 })
  assert.equal(coarse.communities.length, 1)
  assert.throws(() => detectGraphCommunities(nodes, [], { resolution: 0 }), RangeError)
  assert.throws(() => detectGraphCommunities(nodes, edgesOf([['a', 'b', 0]]), { weight: e => e.w }), RangeError)
})

test('detectGraphCommunities on the karate club gives a good partition', () => {
  const { communities, modularity } = detectGraphCommunities(karateNodes, karateEdges)
  assert.ok(modularity > 0.40 && modularity < 0.43, `modularity ${modularity}`)
  assert.ok(communities.length >= 3 && communities.length <= 5, `communities ${communities.length}`)
  assert.equal(new Set(communities.flat()).size, 34)
  const position = id => karateNodes.findIndex(n => n.id === id)
  const starts = communities.map(c => position(c[0]))
  assert.deepEqual(starts, [...starts].sort((a, b) => a - b))
  for (const c of communities) {
    const idx = c.map(position)
    assert.deepEqual(idx, [...idx].sort((a, b) => a - b))
  }
})

test('graphCommunityGroups builds groups and skips small communities', () => {
  const communities = [['a', 'b'], ['c'], ['d', 'e', 'f']]
  assert.deepEqual(graphCommunityGroups(communities), [
    { id: 'community-1', label: 'Community 1', nodeIds: ['a', 'b'] },
    { id: 'community-3', label: 'Community 3', nodeIds: ['d', 'e', 'f'] },
  ])
  const custom = graphCommunityGroups(communities, { idPrefix: 'g:', minSize: 1, label: (m, i) => `${i}:${m.length}` })
  assert.deepEqual(custom.map(g => [g.id, g.label]), [['g:1', '0:2'], ['g:2', '1:1'], ['g:3', '2:3']])
  assert.deepEqual(graphCommunityGroups([]), [])
  assert.throws(() => graphCommunityGroups(communities, { minSize: 0 }), RangeError)
  assert.throws(() => graphCommunityGroups([['a', 'b'], ['b', 'c']]), Error)
  const members = ['a', 'b']
  graphCommunityGroups([members])[0].nodeIds.push('z')
  assert.deepEqual(members, ['a', 'b'])
})

test('validation errors for unknown endpoints and duplicate IDs', () => {
  const nodes = mk(['a', 'b'])
  const bad = edgesOf([['a', 'zz']])
  for (const fn of [graphComponents, graphDegreeCentrality, graphBetweennessCentrality, graphPageRank, detectGraphCommunities]) {
    assert.throws(() => fn(nodes, bad), Error)
    assert.throws(() => fn(mk(['a', 'a']), []), /Duplicate/)
  }
})

test('inputs are not mutated and results are deterministic', () => {
  const nodes = karateNodes.map(n => ({ ...n }))
  const edges = karateEdges.map(e => ({ ...e }))
  const before = JSON.stringify([nodes, edges])
  const run = () => JSON.stringify([
    graphComponents(nodes, edges),
    [...graphDegreeCentrality(nodes, edges)],
    [...graphBetweennessCentrality(nodes, edges)],
    [...graphPageRank(nodes, edges).scores],
    detectGraphCommunities(nodes, edges),
  ])
  const first = run()
  assert.equal(run(), first)
  assert.equal(JSON.stringify([nodes, edges]), before)
})

test('long chains are analysed without stack overflow', () => {
  const n = 12000
  const nodes = mk(Array.from({ length: n }, (_, i) => `n${i}`))
  const edges = edgesOf(Array.from({ length: n - 1 }, (_, i) => [`n${i}`, `n${i + 1}`]))
  assert.equal(graphComponents(nodes, edges).length, 1)
  assert.equal(graphComponents(nodes, []).length, n)
  const pr = graphPageRank(nodes, edges, { maxIterations: 20 })
  near(sum(pr.scores), 1, 1e-9)
  const { communities, modularity } = detectGraphCommunities(nodes, edges)
  assert.equal(communities.flat().length, n)
  assert.ok(communities.length > 1 && modularity > 0.5)
  assert.equal(graphDegreeCentrality(nodes, edges).get('n5'), 2)
})
