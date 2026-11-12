import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import {
  applyGraphPositions, createTimelineRowTree, routeGraphPorts, summarizeTimelineRows, createTimeScale, dependencyTimes, editTimeRange, graphNeighborhood,
  indexGraph, layoutLayeredGraph, timeTicks, validateTimelineData, visibleRows,
} from 'vue-weave/core'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { NetworkGraph, GanttChart, useEditHistory } from 'vue-weave'

const nodes = (...ids) => ids.map(id => ({ id, label: id }))
const edges = (...pairs) => pairs.map(([from, to], i) => ({ id: String(i), from, to }))

test('branch, merge, disconnected nodes and a skip edge preserve ranks', () => {
  const result = layoutLayeredGraph(nodes('a', 'b', 'c', 'd', 'e', 'isolated'),
    edges(['a', 'b'], ['a', 'c'], ['b', 'd'], ['c', 'd'], ['d', 'e'], ['a', 'e']))
  assert.deepEqual(['a', 'b', 'c', 'd', 'e', 'isolated'].map(id => result.boxes.get(id).rank), [0, 1, 1, 2, 3, 0])
  assert.match(result.paths.get('5'), / V /)
  assert.ok(result.edgeLabels.has('5'))
})

test('cycles are condensed; top-to-bottom output swaps geometry and path coordinates', () => {
  const n = nodes('a', 'b', 'c')
  const e = edges(['a', 'b'], ['b', 'a'], ['b', 'b'], ['b', 'c'])
  const lr = layoutLayeredGraph(n, e)
  const tb = layoutLayeredGraph(n, e, { direction: 'TB', nodeWidth: 58, nodeHeight: 144 })
  assert.equal(lr.boxes.get('a').rank, lr.boxes.get('b').rank)
  assert.equal(tb.boxes.get('c').y, lr.boxes.get('c').x)
  assert.equal(tb.width, lr.height)
  assert.ok(!tb.paths.get('3').includes('NaN'))
  const start = tb.paths.get('3').match(/^M ([\d.]+) ([\d.]+)/)
  const source = tb.boxes.get('b')
  assert.equal(Number(start[1]), source.x + source.width / 2)
  assert.equal(Number(start[2]), source.y + source.height)
})

test('deep chains use iterative traversal', () => {
  const n = nodes(...Array.from({ length: 12000 }, (_, i) => String(i)))
  const e = edges(...n.slice(1).map((node, i) => [n[i].id, node.id]))
  assert.equal(layoutLayeredGraph(n, e).boxes.get('11999').rank, 11999)
})

test('neighborhood keeps siblings out and respects depth', () => {
  const graph = indexGraph(nodes('root', 'a', 'b', 'child'), edges(['root', 'a'], ['root', 'b'], ['a', 'child']))
  assert.deepEqual([...graphNeighborhood(graph, 'a', 1)].sort(), ['a', 'child', 'root'])
  assert.throws(() => graphNeighborhood(graph, 'a', -1), RangeError)
})

test('duplicate and dangling graph data fail explicitly', () => {
  assert.throws(() => indexGraph(nodes('a', 'a'), []), /Duplicate/)
  assert.throws(() => indexGraph(nodes('a'), edges(['a', 'b'])), /Unknown/)
  assert.throws(() => layoutLayeredGraph([], [], { nodeWidth: NaN }), RangeError)
})

test('scale round-trip and stable tick anchoring', () => {
  const scale = createTimeScale({ start: 100, end: 1000 }, 3)
  assert.equal(scale.toTime(scale.toX(543)), 543)
  assert.deepEqual(timeTicks({ start: 341, end: 761 }, 200, 100), [500, 700])
  assert.throws(() => timeTicks({ start: 0, end: 1e9 }, 1), /Too many/)
  assert.throws(() => createTimeScale({ start: 2, end: 1 }, 1), RangeError)
})

test('edits preserve duration, snap symmetrically and enforce bounds', () => {
  const range = { start: 30, end: 60 }, bounds = { start: 0, end: 90 }
  assert.deepEqual(editTimeRange(range, 'move', 99, 15, bounds), { start: 60, end: 90 })
  assert.deepEqual(editTimeRange(range, 'move', -7.5, 15, bounds), { start: 15, end: 45 })
  assert.deepEqual(editTimeRange(range, 'start', 99, 15, bounds), { start: 45, end: 60 })
  assert.deepEqual(editTimeRange(range, 'end', -99, 15, bounds), { start: 30, end: 45 })
  assert.deepEqual(editTimeRange({ start: 30, end: 30 }, 'move', 15, 15, bounds), { start: 45, end: 45 })
  assert.throws(() => editTimeRange(range, 'move', 1, 0, bounds), RangeError)
  assert.throws(() => editTimeRange({ start: -1, end: 5 }, 'move', 1, 1, bounds), /editBounds/)
})

test('all four dependency types map endpoints explicitly', () => {
  const a = { start: 1, end: 4 }, b = { start: 8, end: 10 }
  assert.deepEqual(['FS', 'SS', 'FF', 'SF'].map(t => dependencyTimes(a, b, t)),
    [{ from: 4, to: 8 }, { from: 1, to: 8 }, { from: 4, to: 10 }, { from: 1, to: 10 }])
})

test('virtual row windows are clamped for empty, oversized and negative viewports', () => {
  assert.deepEqual(visibleRows(220, 130, 50, 20, 1), { first: 3, afterLast: 8 })
  assert.deepEqual(visibleRows(-10, 130, 50, 1), { first: 0, afterLast: 1 })
  assert.deepEqual(visibleRows(0, 100, 50, 0), { first: 0, afterLast: 0 })
})

test('timeline schema rejects ambiguous identifiers, lanes and dependencies', () => {
  const rows = [{ id: 'row', label: 'Row' }]
  const bars = [{ id: 'a', label: 'A', rowId: 'row', start: 1, end: 2 }]
  assert.doesNotThrow(() => validateTimelineData(rows, bars))
  assert.throws(() => validateTimelineData(rows, [...bars, ...bars]), /duplicate/)
  assert.throws(() => validateTimelineData(rows, [{ ...bars[0], lane: 2 }]), /lane/)
  assert.throws(() => validateTimelineData(rows, bars, [{ id: 'e', from: 'a', to: 'missing' }]), /endpoint/)
  assert.throws(() => validateTimelineData(rows, [{ ...bars[0], progress: 2 }]), /Progress/)
})

test('both components render on the server and accept empty collections', async () => {
  const app = createSSRApp({ render: () => h('div', [
    h(NetworkGraph, { nodes: [], edges: [] }),
    h(GanttChart, { rows: [], bars: [], range: { start: 0, end: 3600000 } }),
  ]) })
  const html = await renderToString(app)
  assert.match(html, /No nodes to display/)
  assert.match(html, /No rows to display/)
})

test('empty zero-padding graphs keep positive dimensions and render in both directions', async () => {
  for (const direction of ['LR', 'TB']) {
    const options = { direction, padding: 0 }
    const layout = layoutLayeredGraph([], [], options)
    assert.ok(Number.isFinite(layout.width) && layout.width > 0)
    assert.ok(Number.isFinite(layout.height) && layout.height > 0)
    assert.equal(layout.boxes.size, 0)
    assert.equal(layout.paths.size, 0)
    const html = await renderToString(createSSRApp({ render: () => h(NetworkGraph, {
      nodes: [], edges: [], options,
    }) }))
    assert.match(html, /No nodes to display/)
    assert.ok(!/NaN|Infinity/.test(html))
  }
})

test('slots and labels survive SSR through the public package entry', async () => {
  const html = await renderToString(createSSRApp({ render: () => h(NetworkGraph,
    { nodes: nodes('a'), edges: [], labels: { region: 'Dependency explorer' } },
    { node: ({ node }) => h('text', node.label + ' customized') },
  ) }))
  assert.match(html, /Dependency explorer/)
  assert.match(html, /a customized/)
})

test('saved graph positions reroute incident edges and keep untouched geometry', () => {
  const base = layoutLayeredGraph(nodes('a', 'b', 'c'), edges(['a', 'b'], ['b', 'c']))
  const moved = applyGraphPositions(base, edges(['a', 'b'], ['b', 'c']), new Map([['a', { x: 30, y: 260 }]]))
  assert.equal(moved.boxes.get('a').y, 260)
  assert.notEqual(base.boxes.get('a').y, 260)
  assert.notEqual(moved.paths.get('0'), base.paths.get('0'))
  assert.equal(moved.paths.get('1'), base.paths.get('1'))
  assert.ok(moved.height > base.height)
  assert.throws(() => applyGraphPositions(base, [], new Map([['a', { x: -1, y: 0 }]])), /nonnegative/)
})

test('row hierarchy validates references and provides stable subtree bounds', () => {
  const rows = [
    { id: 'b', parentId: 'a', label: 'B' }, { id: 'a', label: 'A' },
    { id: 'c', parentId: 'b', label: 'C' }, { id: 'd', label: 'D' },
  ]
  assert.deepEqual(createTimelineRowTree(rows).map(({ row, depth, afterSubtree }) => [row.id, depth, afterSubtree]),
    [['a', 0, 3], ['b', 1, 3], ['c', 2, 3], ['d', 0, 4]])
  assert.throws(() => createTimelineRowTree([{ id: 'a', parentId: 'b' }]), /Unknown parent/)
  assert.throws(() => createTimelineRowTree([{ id: 'a', parentId: 'b' }, { id: 'b', parentId: 'a' }]), /cycle/)
})

test('named ports validate direction and use moved endpoint coordinates', () => {
  const graphNodes = [
    { id: 'a', ports: [{ id: 'output', side: 'bottom', direction: 'source', offset: 0.25 }] },
    { id: 'b', ports: [{ id: 'input', side: 'left', direction: 'target' }] },
  ]
  const graphEdges = [{ id: 'line', from: 'a', to: 'b', fromPort: 'output', toPort: 'input' }]
  assert.throws(() => indexGraph(graphNodes, [{ ...graphEdges[0], from: 'b', fromPort: 'input' }]), /Invalid port/)
  assert.throws(() => indexGraph(graphNodes, [{ ...graphEdges[0], toPort: 'missing' }]), /Invalid port/)
  const layout = layoutLayeredGraph(graphNodes, graphEdges, { nodeWidth: 100, nodeHeight: 40 })
  const moved = applyGraphPositions(layout, graphEdges, new Map([['a', { x: 40, y: 120 }]]))
  const routed = routeGraphPorts(moved, new Map(graphNodes.map(node => [node.id, node])), graphEdges, 'LR')
  assert.match(routed.paths.get('line'), /^M 65 160 C /)
  const target = moved.boxes.get('b')
  assert.ok(routed.paths.get('line').endsWith(target.x + ' ' + (target.y + 20)))
})

test('summary aggregation follows descendants and avoids counting parent bars', () => {
  const tree = createTimelineRowTree([
    { id: 'root' }, { id: 'group', parentId: 'root' }, { id: 'a', parentId: 'group' }, { id: 'b', parentId: 'root' },
  ])
  const summary = summarizeTimelineRows(tree, [
    { rowId: 'a', start: 10, end: 30, progress: 0.5 },
    { rowId: 'b', start: 40, end: 50, progress: 1 },
    { rowId: 'b', start: 50, end: 90 },
    { rowId: 'group', start: 0, end: 999, progress: 1 },
  ])
  assert.deepEqual(summary.get('group'), { start: 10, end: 30, count: 1, progress: 0.5 })
  assert.deepEqual(summary.get('root'), { start: 10, end: 90, count: 3, progress: 2 / 3 })
})

test('history bounds old snapshots and drops the redo branch after a commit', () => {
  const history = useEditHistory(0, 2)
  for (const next of [1, 2, 3]) history.commit(next)
  history.undo()
  history.undo()
  history.undo()
  assert.equal(history.state.value, 1)
  assert.equal(history.canUndo.value, false)
  history.redo()
  assert.equal(history.state.value, 2)
  history.commit(4)
  assert.equal(history.canRedo.value, false)
  history.reset(10)
  assert.equal(history.state.value, 10)
  assert.equal(history.canUndo.value, false)
})

test('long edges reuse lanes so headroom follows overlap, not edge count', () => {
  const count = 300
  const chain = nodes(...Array.from({ length: count }, (_, i) => 'n' + i))
  const links = []
  for (let i = 0; i + 1 < count; i++) links.push({ id: 'e' + i, from: 'n' + i, to: 'n' + (i + 1) })
  for (let i = 0; i + 2 < count; i++) links.push({ id: 's' + i, from: 'n' + i, to: 'n' + (i + 2) })
  const layout = layoutLayeredGraph(chain, links)
  assert.ok(layout.boxes.get('n0').y <= 20 + 2 * 9, 'headroom ' + layout.boxes.get('n0').y)
  assert.ok(layout.height < 200)
  const laneOf = id => Number(layout.paths.get(id).match(/ V (-?[\d.]+) H /)[1])
  assert.notEqual(laneOf('s0'), laneOf('s1'))
  assert.equal(laneOf('s0'), laneOf('s2'))
  const tb = layoutLayeredGraph(chain, links, { direction: 'TB' })
  assert.ok(tb.boxes.get('n0').x <= 20 + 2 * 9)
  // Three skip edges that all span the same column keep distinct lanes.
  const overlap = layoutLayeredGraph(nodes('a', 'b', 'c'), edges(['a', 'b'], ['b', 'c'], ['a', 'c'], ['a', 'c']))
  assert.equal(new Set(['2', '3'].map(id => overlap.paths.get(id).match(/ V (-?[\d.]+) H /)[1])).size, 2)
  assert.equal(overlap.boxes.get('a').y, 20 + 2 * 9)
})

test('invalid Gantt data reports validation-error and renders the empty state', async () => {
  const row = { id: 'r', label: 'Row' }
  const bar = { id: 'b', rowId: 'r', label: 'Bar', start: 0, end: 3600000 }
  const errors = []
  const props = { rows: [row], bars: [bar, bar], range: { start: 0, end: 7200000 }, onValidationError: error => errors.push(error) }
  // Vue rethrows handled errors in development builds and logs them in production, so allow either.
  const html = await renderToString(createSSRApp({ render: () => h(GanttChart, props) })).catch(() => '')
  assert.equal(errors.length, 1)
  assert.match(errors[0].message, /duplicate/)
  assert.ok(!html.includes('vft-gantt-bar'))
  const valid = await renderToString(createSSRApp({ render: () => h(GanttChart, { ...props, bars: [bar], onValidationError: () => assert.fail('unexpected') }) }))
  assert.match(valid, /vft-gantt-bar/)
})

test('invalid Gantt row hierarchies report validation-error before rendering', async () => {
  for (const [rows, expected] of [
    [[{ id: 'a', label: 'A', parentId: 'missing' }], /Unknown parent/],
    [[{ id: 'a', label: 'A', parentId: 'b' }, { id: 'b', label: 'B', parentId: 'a' }], /cycle/],
  ]) {
    const reported = []
    const handled = []
    const app = createSSRApp({ render: () => h(GanttChart, {
      rows, bars: [], range: { start: 0, end: 3600000 },
      onValidationError: error => reported.push(error),
    }) })
    app.config.errorHandler = error => handled.push(error)
    const html = await renderToString(app)
    assert.equal(reported.length, 1)
    assert.match(reported[0].message, expected)
    assert.deepEqual(handled, reported)
    assert.match(html, /No rows to display/)
    assert.ok(!html.includes('vft-gantt-canvas'))
  }
})

test('production builds do not render invalid Gantt data', () => {
  const script = `
    import { createSSRApp, h } from 'vue'
    import { renderToString } from 'vue/server-renderer'
    import { GanttChart } from 'vue-weave'
    const bar = { id: 'b', rowId: 'r', label: 'Bar', start: 0, end: 3600000 }
    const errors = []
    const html = await renderToString(createSSRApp({ render: () => h(GanttChart, {
      rows: [{ id: 'r', label: 'Row' }], bars: [bar, bar], range: { start: 0, end: 7200000 },
      onValidationError: error => errors.push(error.message),
    }) }))
    console.log(JSON.stringify({ errors, rendered: html.includes('vft-gantt-bar') }))
  `
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, NODE_ENV: 'production' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  })
  const result = JSON.parse(output.trim().split('\n').at(-1))
  assert.equal(result.rendered, false)
  assert.equal(result.errors.length, 1)
})
