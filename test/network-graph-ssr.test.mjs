import assert from 'node:assert/strict'
import { test } from 'node:test'
import { layoutLayeredGraph } from 'vue-weave/core'
import { NetworkGraph } from 'vue-weave'
import { renderComponent } from './helpers/ssr.mjs'

const nodes = (...ids) => ids.map(id => ({ id, label: id }))
const edges = (...pairs) => pairs.map(([from, to], i) => ({ id: String(i), from, to }))

test('empty zero-padding graphs keep positive dimensions and render in both directions', async () => {
  for (const direction of ['LR', 'TB']) {
    const options = { direction, padding: 0 }
    const layout = layoutLayeredGraph([], [], options)
    assert.ok(Number.isFinite(layout.width) && layout.width > 0)
    assert.ok(Number.isFinite(layout.height) && layout.height > 0)
    assert.equal(layout.boxes.size, 0)
    assert.equal(layout.paths.size, 0)
    const html = await renderComponent(NetworkGraph, {
      nodes: [], edges: [], options,
    })
    assert.match(html, /No nodes to display/)
    assert.ok(!/NaN|Infinity/.test(html))
  }
})

test('nested groups validate their hierarchy and render parents before children', async () => {
  const n = nodes('a', 'b', 'c')
  const render = groups => renderComponent(NetworkGraph, { nodes: n, edges: [], groups, draggable: true })
  const html = await render([
    { id: 'inner', label: 'Inner', nodeIds: ['a'], parentId: 'outer' },
    { id: 'outer', label: 'Outer', nodeIds: ['b'] },
  ])
  assert.ok(html.indexOf('>Outer<') < html.indexOf('>Inner<'))
  assert.match(html, /aria-label="Move group Inner within Outer"/)
  assert.match(html, /aria-label="Move group Outer"/)
  assert.doesNotMatch(html, /NaN|Infinity/)
  const onlyChildren = await render([{ id: 'outer', label: 'Outer', nodeIds: [] }, { id: 'inner', label: 'Inner', nodeIds: ['a'], parentId: 'outer' }])
  assert.doesNotMatch(onlyChildren, /NaN|Infinity/)
  await assert.rejects(render([{ id: 'g', label: 'G', nodeIds: ['a'], parentId: 'missing' }]), /Unknown parent group: missing/)
  await assert.rejects(render([
    { id: 'x', label: 'X', nodeIds: ['a'], parentId: 'y' }, { id: 'y', label: 'Y', nodeIds: ['b'], parentId: 'x' },
  ]), /cycle/)
  await assert.rejects(render([{ id: 'x', label: 'X', nodeIds: ['a'], parentId: 'x' }]), /cycle/)
  await assert.rejects(render([{ id: 'x', label: 'X', nodeIds: [] }]), /Invalid graph group: x/)
  await assert.rejects(render([{ id: 'x', label: 'X', nodeIds: ['a'] }, { id: 'y', label: 'Y', nodeIds: ['a'], parentId: 'x' }]), /repeated group member: a/)
})

test('matchIds and dimmedIds dim nodes and the edges that touch them', async () => {
  const n = nodes('a', 'b', 'c')
  const html = await renderComponent(NetworkGraph, {
    nodes: n, edges: edges(['a', 'b'], ['b', 'c']), matchIds: new Set(['a', 'b']),
  })
  // Node c and the edge b to c are dimmed; edge a to b and nodes a and b are not.
  assert.equal((html.match(/vw-dimmed/g) ?? []).length, 2)
  assert.match(html, /class="[^"]*vw-dimmed[^"]*"[^>]*aria-label="c"/)
  const plain = await renderComponent(NetworkGraph, { nodes: n, edges: [] })
  assert.doesNotMatch(plain, /vw-dimmed/)
  const explicit = await renderComponent(NetworkGraph, { nodes: n, edges: [], dimmedIds: new Set(['b']) })
  assert.equal((explicit.match(/vw-dimmed/g) ?? []).length, 1)
})

test('NetworkGraph renders RL and BT and keeps default output unchanged', async () => {
  const n = nodes('a', 'b', 'c')
  const e = edges(['a', 'b'], ['a', 'c'])
  const render = options => renderComponent(NetworkGraph, { nodes: n, edges: e, options })
  const base = await render(undefined)
  assert.equal(await render({ crossingReduction: 'none' }), base)
  assert.equal(await render({ direction: 'LR' }), base)
  for (const direction of ['RL', 'BT']) {
    const html = await render({ direction, crossingReduction: 'barycenter', crossingSweeps: 3 })
    assert.ok(html.includes('vw-network'))
    assert.ok(!/NaN|Infinity/.test(html))
    assert.notEqual(html, base)
  }
})
