import assert from 'node:assert/strict'
import { test } from 'node:test'
import { layoutForceGraph } from '@eightkk/vue-weave/core'
import { seededRandom } from './helpers/seeded.mjs'

const node = id => ({ id })

const edge = (id, from, to) => ({ id, from, to })

function randomGraph(count, extra, seed = 7) {
  const { random } = seededRandom(seed)
  const nodes = Array.from({ length: count }, (_, i) => node('n' + i))
  const edges = []
  for (let i = 1; i < count; i++) edges.push(edge('t' + i, 'n' + Math.floor(random() * i), 'n' + i))
  for (let k = 0; k < extra; k++) edges.push(edge('e' + k, 'n' + Math.floor(random() * count), 'n' + Math.floor(random() * count)))
  return { nodes, edges }
}

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
