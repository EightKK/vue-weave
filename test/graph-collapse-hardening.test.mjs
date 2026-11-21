import assert from 'node:assert/strict'
import { test } from 'node:test'
import { collapseGraphGroups } from '@eightkk/vue-weave/core'

// A small deterministic PRNG so the randomised inputs are reproducible.
function random(seed) {
  let state = seed >>> 0
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0
    return state / 2 ** 32
  }
}

// Straightforward reference: walk every parent chain to find the outermost collapsed ancestor.
function expectedCollapse(nodes, groups, collapsed) {
  const byId = new Map(groups.map(group => [group.id, group]))
  const outermost = new Map()
  for (const group of groups) {
    let found
    for (let current = group; current; current = byId.get(current.parentId)) if (collapsed.has(current.id)) found = current.id
    outermost.set(group.id, found)
  }
  const memberOf = new Map()
  for (const group of groups) for (const id of group.nodeIds) memberOf.set(id, group.id)
  const owners = new Map()
  for (const node of nodes) {
    const proxy = memberOf.has(node.id) ? outermost.get(memberOf.get(node.id)) : undefined
    if (proxy !== undefined) owners.set(node.id, proxy)
  }
  const shown = groups.filter(group => outermost.get(group.id) === undefined).map(group => ({
    ...group,
    nodeIds: [
      ...group.nodeIds.filter(id => !owners.has(id)),
      ...groups.filter(child => child.parentId === group.id && outermost.get(child.id) === child.id).map(child => child.id),
    ],
  }))
  const proxies = groups.filter(group => outermost.get(group.id) === group.id).map(group => group.id)
  return { owners, shown, proxies }
}

test('collapseGraphGroups matches a reference on randomised nested groups', () => {
  for (let seed = 1; seed <= 40; seed++) {
    const next = random(seed)
    const nodes = Array.from({ length: 30 }, (_, i) => ({ id: 'n' + i, label: 'N' + i }))
    const groups = []
    for (let g = 0; g < 10; g++) {
      const group = { id: 'g' + g, label: 'G' + g, nodeIds: [] }
      // Parents refer to earlier groups, then the list is shuffled, so input order is not topological.
      if (g > 0 && next() < 0.7) group.parentId = 'g' + Math.floor(next() * g)
      groups.push(group)
    }
    for (const node of nodes) {
      if (next() < 0.8) groups[Math.floor(next() * groups.length)].nodeIds.push(node.id)
    }
    // Every group needs a member so that any collapsed group has nodes.
    groups.forEach((group, i) => { if (!group.nodeIds.length) group.nodeIds.push('extra' + i) })
    for (const group of groups) for (const id of group.nodeIds) if (id.startsWith('extra')) nodes.push({ id, label: id })
    for (let i = groups.length - 1; i > 0; i--) {
      const j = Math.floor(next() * (i + 1));
      [groups[i], groups[j]] = [groups[j], groups[i]]
    }
    const edges = Array.from({ length: 40 }, (_, i) => ({
      id: 'e' + i, from: nodes[Math.floor(next() * nodes.length)].id, to: nodes[Math.floor(next() * nodes.length)].id,
    }))
    const collapsed = new Set(groups.filter(() => next() < 0.35).map(group => group.id))
    const result = collapseGraphGroups(nodes, edges, groups, collapsed)
    const expected = expectedCollapse(nodes, groups, collapsed)
    assert.deepEqual([...result.owners], [...expected.owners], 'owners, seed ' + seed)
    assert.deepEqual(result.groups, expected.shown, 'groups, seed ' + seed)
    assert.deepEqual([...result.proxies.keys()], expected.proxies, 'proxies, seed ' + seed)
    for (const edge of edges) {
      const from = expected.owners.get(edge.from), to = expected.owners.get(edge.to)
      assert.equal(result.hiddenEdgeIds.includes(edge.id), from !== undefined && from === to, 'hidden edge, seed ' + seed)
    }
  }
})

test('collapseGraphGroups reports the same errors for cycles and unknown parents', () => {
  const nodes = [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }]
  const group = (id, member, parentId) => ({ id, label: id, nodeIds: [member], ...(parentId === undefined ? {} : { parentId }) })
  // The first group in input order whose parent chain reaches a cycle is named, whether or not it is on the cycle.
  assert.throws(() => collapseGraphGroups(nodes, [], [group('x', 'a', 'y'), group('y', 'b', 'z'), group('z', 'c', 'y')], []), {
    name: 'Error', message: 'Graph group hierarchy contains a cycle at group: x',
  })
  assert.throws(() => collapseGraphGroups(nodes, [], [group('y', 'b', 'y')], []), { message: 'Graph group hierarchy contains a cycle at group: y' })
  assert.throws(() => collapseGraphGroups(nodes, [], [group('r', 'd'), group('y', 'b', 'z'), group('z', 'c', 'y')], []), {
    message: 'Graph group hierarchy contains a cycle at group: y',
  })
  assert.throws(() => collapseGraphGroups(nodes, [], [group('x', 'a', 'y'), group('y', 'b', 'nope')], []), {
    name: 'Error', message: 'Unknown parent group in graph group y: nope',
  })
})

test('collapseGraphGroups stays near-linear for deep nesting and many flat groups', () => {
  const deepNodes = Array.from({ length: 20000 }, (_, i) => ({ id: 'n' + i }))
  const deepGroups = deepNodes.map((node, i) => ({ id: 'g' + i, label: 'G' + i, nodeIds: [node.id], ...(i ? { parentId: 'g' + (i - 1) } : {}) }))
  let started = performance.now()
  const deep = collapseGraphGroups(deepNodes, [], deepGroups, ['g19999'])
  const deepTime = performance.now() - started
  assert.equal(deep.groups.length, 19999)
  assert.deepEqual(deep.groups[19998].nodeIds, ['n19998', 'g19999'])
  started = performance.now()
  const flatGroups = deepNodes.map((node, i) => ({ id: 'g' + i, label: 'G' + i, nodeIds: [node.id] }))
  const flat = collapseGraphGroups(deepNodes, [], flatGroups, ['g0'])
  const flatTime = performance.now() - started
  assert.equal(flat.groups.length, 19999)
  // The quadratic version needed several seconds for these inputs; a near-linear one takes milliseconds.
  assert.ok(deepTime < 1500, 'deep nesting took ' + deepTime + ' ms')
  assert.ok(flatTime < 1500, 'flat groups took ' + flatTime + ' ms')
})
