import assert from 'node:assert/strict'
import { test } from 'node:test'
import { scheduleTasks, scheduleToGraph } from '@eightkk/vue-weave/core'

const hour = 3_600_000

test('scheduleToGraph builds a PERT network with early dates, float and critical marking', () => {
  const dependencies = [
    { id: 'ab', from: 'a', to: 'b' }, { id: 'ac', from: 'a', to: 'c', type: 'SS' }, { id: 'bd', from: 'b', to: 'd' }, { id: 'cd', from: 'c', to: 'd' },
  ]
  const result = scheduleTasks({
    range: { start: 0, end: 20 * hour }, quantum: hour,
    tasks: [{ id: 'a', duration: 2 * hour }, { id: 'b', duration: 4 * hour }, { id: 'c', duration: hour }, { id: 'd', duration: hour }],
    dependencies,
  })
  const graph = scheduleToGraph(result, dependencies, { label: id => 'Task ' + id.toUpperCase() })
  assert.deepEqual(graph.nodes.map(node => [node.id, node.label, node.tone]), [
    ['a', 'Task A', 'amber'], ['b', 'Task B', 'amber'], ['c', 'Task C', 'blue'], ['d', 'Task D', 'amber'],
  ])
  assert.equal(graph.nodes[2].detail, 'ES 1970-01-01 00:00 · EF 1970-01-01 01:00 · Float 5 h')
  assert.equal(graph.nodes[2].data.earlyStart, 0)
  assert.deepEqual(graph.edges.map(edge => [edge.id, edge.from, edge.to, edge.label, edge.data.critical]), [
    ['ab', 'a', 'b', undefined, true], ['ac', 'a', 'c', 'SS', false], ['bd', 'b', 'd', undefined, true], ['cd', 'c', 'd', undefined, false],
  ])
  assert.deepEqual([...graph.criticalEdgeIds], ['ab', 'bd'])
  assert.deepEqual([...graph.criticalNodeIds], ['a', 'b', 'd'])
  const custom = scheduleToGraph(result, [], {
    formatTime: time => String(time / hour), formatDuration: value => value / hour + 'h', labels: { earlyStart: 'Start', float: 'Slack' }, tone: 'teal', criticalTone: 'violet',
  })
  assert.equal(custom.nodes[2].detail, 'Start 0 · EF 1 · Slack 5h')
  assert.deepEqual(custom.nodes.map(node => node.tone), ['violet', 'violet', 'teal', 'violet'])
  assert.throws(() => scheduleToGraph(result, [{ id: 'x', from: 'a', to: 'missing' }]), { name: 'Error', message: /Unknown dependency endpoint/ })
  assert.throws(() => scheduleToGraph({ ok: false, code: 'cycle', cycles: [] }, []), /successful/)
})

test('scheduleToGraph rejects a dependency from a task to itself', () => {
  const result = scheduleTasks({ range: { start: 0, end: 4 * hour }, quantum: hour, tasks: [{ id: 'a', duration: hour }, { id: 'b', duration: hour }] })
  assert.equal(result.ok, true)
  assert.throws(() => scheduleToGraph(result, [{ id: 'ab', from: 'a', to: 'b' }, { id: 'loop', from: 'b', to: 'b', type: 'SS' }]), {
    name: 'Error', message: 'Dependency loop links task b to itself',
  })
})

test('scheduleToGraph labels a non-zero dependency lag on its edge and keeps edges without lag unchanged', () => {
  const tasks = [{ id: 'a', duration: 2 * hour }, { id: 'b', duration: 4 * hour }, { id: 'c', duration: hour }, { id: 'd', duration: hour }]
  const plain = [
    { id: 'ab', from: 'a', to: 'b' }, { id: 'ac', from: 'a', to: 'c', type: 'SS' }, { id: 'bd', from: 'b', to: 'd' }, { id: 'cd', from: 'c', to: 'd', type: 'FF' },
  ]
  const lagged = [
    { ...plain[0], lag: 2 * hour }, { ...plain[1], lag: -hour / 2 }, { ...plain[2], lag: 0 }, plain[3],
  ]
  const result = scheduleTasks({ range: { start: 0, end: 20 * hour }, quantum: hour / 2, tasks, dependencies: lagged })
  assert.equal(result.ok, true)
  const graph = scheduleToGraph(result, lagged)
  assert.deepEqual(graph.edges.map(edge => [edge.id, edge.label, edge.data]), [
    ['ab', '+2 h', { type: 'FS', critical: true, lag: 2 * hour }],
    ['ac', 'SS −0.5 h', { type: 'SS', critical: false, lag: -hour / 2 }],
    ['bd', undefined, { type: 'FS', critical: true }],
    ['cd', 'FF', { type: 'FF', critical: false }],
  ])
  // A zero or missing lag gives the same edges as before lags existed.
  assert.deepEqual(scheduleToGraph(result, lagged.slice(2)).edges, scheduleToGraph(result, plain.slice(2)).edges)
  assert.equal(Object.hasOwn(graph.edges[2], 'label'), false)
  assert.equal(Object.hasOwn(graph.edges[2].data, 'lag'), false)

  const calls = []
  const custom = scheduleToGraph(result, lagged, { formatLag: lag => { calls.push(lag); return 'lag ' + lag / hour + 'h' } })
  assert.deepEqual(custom.edges.map(edge => edge.label), ['lag 2h', 'SS lag -0.5h', undefined, 'FF'])
  assert.deepEqual(calls, [2 * hour, -hour / 2])

  for (const lag of [Number.NaN, Infinity, '2']) {
    assert.throws(() => scheduleToGraph(result, [{ ...plain[0], lag }]), { name: 'RangeError', message: 'Dependency lag must be finite: ab' })
  }
})

test('scheduleToGraph rejects duplicate dependency IDs', () => {
  const hour = 3_600_000
  const dependencies = [{ id: 'd', from: 'a', to: 'b' }, { id: 'd', from: 'a', to: 'c' }]
  const result = scheduleTasks({
    range: { start: 0, end: 10 * hour }, quantum: hour,
    tasks: [{ id: 'a', duration: hour }, { id: 'b', duration: hour }, { id: 'c', duration: hour }],
    dependencies: dependencies.slice(0, 1),
  })
  assert.throws(() => scheduleToGraph(result, dependencies), { name: 'Error', message: 'Duplicate dependency ID: d' })
})
