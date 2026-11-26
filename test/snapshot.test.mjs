import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import {
  parseWeaveSnapshot, projectResourceTimeline, restoreWeaveSnapshot, scheduleTasks, serializeWeaveSnapshot, WeaveSnapshotError,
} from '@eightkk/vue-weave/core'

const fixture = name => readFileSync(new URL('./fixtures/snapshots/v1/' + name + '.json', import.meta.url), 'utf8')
const dateCodec = {
  id: 'date',
  matches: value => value instanceof Date,
  encode: value => value.toISOString(),
  decode: value => new Date(value),
}
const registry = {
  codecs: [dateCodec],
  layouts: { layered: options => ({ options }) },
  columns: {
    owner: { label: 'Owner', width: 120, value: row => row.id },
    money: { label: 'Cost', value: () => 0 },
    extra: { label: 'Extra', value: () => 'x' },
  },
  editors: { number: { kind: 'number' } },
  comparators: { natural: (a, b) => String(a).localeCompare(String(b)) },
}
const parse = text => {
  const result = parseWeaveSnapshot(text)
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics))
  return result.snapshot
}
const restore = (snapshot, reg = registry) => {
  const result = restoreWeaveSnapshot(snapshot, reg)
  assert.equal(result.ok, true, JSON.stringify(result.diagnostics))
  return result.snapshot
}
const edit = (name, change) => {
  const doc = JSON.parse(fixture(name))
  change(doc)
  return JSON.stringify(doc)
}
const codes = result => result.diagnostics.map(item => item.code)
const timelineView = view => ({ ...view, collapsedRowIds: new Set(view.collapsedRowIds) })

test('graph snapshot round trips IDs, order, ports, positions, sizes and the camera', () => {
  const text = fixture('graph')
  const restored = restore(parse(text))
  assert.deepEqual(restored.nodes.map(node => node.id), ['n3', 'n1', 'n2'])
  assert.deepEqual(restored.edges.map(edge => edge.id), ['e2', 'e1', 'e3'])
  assert.deepEqual(restored.nodes[1].ports.map(port => port.id), ['in', 'out'])
  assert.equal(restored.edges[1].fromPort, 'out')
  assert.deepEqual(restored.edges[1].points, [{ x: 150, y: 20 }, { x: 150, y: 60 }])
  assert.ok(restored.positions instanceof Map)
  assert.deepEqual([...restored.positions], [['n3', { x: 300, y: 40 }], ['n1', { x: 0, y: 0 }]])
  assert.deepEqual([...restored.sizes], [['n2', { width: 180, height: 64 }]])
  assert.deepEqual(restored.groups.map(group => group.parentId), [undefined, 'g1'])
  assert.ok(restored.view.collapsedGroupIds instanceof Set && restored.view.collapsedGroupIds.has('g2'))
  assert.deepEqual(restored.view.camera, { center: { x: 120, y: 80 }, scale: 1.5 })
  assert.deepEqual(restored.view.layout.fn, { options: { direction: 'LR', spacing: 40 } })
  assert.ok(restored.nodes[0].data.due instanceof Date)
  assert.equal(restored.nodes[0].data.due.toISOString(), '2026-02-01T00:00:00.000Z')
  assert.deepEqual(restored.extensions, { 'acme.notes': { pinned: ['n1'] } })

  const again = serializeWeaveSnapshot({
    kind: 'graph',
    metadata: restored.metadata,
    extensions: restored.extensions,
    data: {
      nodes: restored.nodes, edges: restored.edges, groups: restored.groups, positions: restored.positions, sizes: restored.sizes,
    },
    view: {
      graph: {
        camera: restored.view.camera,
        collapsedGroupIds: restored.view.collapsedGroupIds,
        layout: { id: restored.view.layout.id, options: restored.view.layout.options },
      },
    },
  }, { codecs: [dateCodec], libraryVersion: '0.0.0-fixture' })
  assert.equal(again, JSON.stringify(JSON.parse(text)))
})

test('timeline snapshot round trips rows, bars, dependencies, constraints, segments and several baselines', () => {
  const text = fixture('timeline')
  const snapshot = parse(text)
  const restored = restore(snapshot)
  assert.deepEqual(restored.rows.map(row => row.id), ['r2', 'r1', 'r3'])
  assert.deepEqual(restored.bars.map(bar => bar.id), ['b2', 'b1', 'b3'])
  assert.deepEqual(restored.dependencies.map(dep => [dep.id, dep.type, dep.lag]), [['d2', 'SS', 5], ['d1', undefined, undefined]])
  const [build, kickoff, test] = restored.bars
  assert.deepEqual(build.baselines.map(baseline => baseline.id), ['plan', 'rev1'])
  assert.deepEqual(build.baseline, { start: 8, end: 30 })
  assert.deepEqual(build.constraints, { startNoEarlierThan: 10, finishNoLaterThan: 50 })
  assert.deepEqual(build.segments, [{ start: 10, end: 20 }, { start: 25, end: 40 }])
  assert.equal(kickoff.start, kickoff.end)
  assert.deepEqual([test.lane, test.deadline, test.latestEnd], [1, 70, 65])
  assert.deepEqual(restored.range, { start: 0, end: 100 })
  assert.deepEqual(restored.timeUnit, { id: 'day', origin: 1767225600000 })

  const again = serializeWeaveSnapshot({
    kind: 'timeline', metadata: restored.metadata,
    data: { rows: restored.rows, bars: restored.bars, dependencies: restored.dependencies, range: restored.range, timeUnit: restored.timeUnit },
    view: { timeline: timelineView(snapshot.view.timeline) },
  })
  assert.equal(again, JSON.stringify(JSON.parse(text)))
})

test('timeline view resolves registered columns, editors and comparators', () => {
  const view = restore(parse(fixture('timeline'))).view
  assert.deepEqual(view.columns.map(column => [column.id, column.visible, column.width]), [
    ['owner', false, 90], ['$label', true, 200], ['cost', true, 120], ['extra', true, 120],
  ])
  assert.equal(view.columns[0].column.value({ id: 'r9' }), 'r9')
  assert.equal(view.columns[1].column, undefined)
  assert.equal(view.columns[2].column.label, 'Cost')
  assert.deepEqual(view.columns[2].editor, { kind: 'number' })
  assert.equal(view.sort[0].comparator('a', 'b'), -1)
  assert.deepEqual(view.search, { query: 'build', columnIds: ['$label', 'owner'] })
  assert.deepEqual(view.window, { start: 0, end: 80 })
  assert.deepEqual(view.zoom, { zoom: 2, preset: 'week' })
  assert.deepEqual(view.collapsedRowIds, new Set(['r1']))
})

test('a planning snapshot restores an input whose schedule matches hand-written dates', () => {
  const text = fixture('planning')
  const restored = restore(parse(text))
  // a: 0-10. b: finish-to-start from a plus lag 5, so 15-35. c: after a, but not before 40, so 40-55.
  const expected = [['a', 0, 10], ['b', 15, 35], ['c', 40, 55]]
  const scheduled = scheduleTasks(restored.input)
  assert.equal(scheduled.ok, true)
  assert.deepEqual(scheduled.tasks.map(task => [task.id, task.start, task.end]).sort(), expected)
  assert.equal(scheduled.finish, 55)
  assert.deepEqual(restored.schedule, scheduled)
  assert.deepEqual(restored.input.tasks.map(task => task.id), ['c', 'a', 'b'])
  assert.deepEqual(restored.input.assignments, [
    { taskId: 'a', resourceId: 'r1' }, { taskId: 'b', resourceId: 'r1' }, { taskId: 'c', resourceId: 'r2', units: 2 },
  ])
  assert.deepEqual(restored.placements, [{ taskId: 'b', resourceId: 'r1' }])
  assert.ok(restored.display[0].data.at instanceof Date)

  const again = serializeWeaveSnapshot({
    kind: 'planning', metadata: restored.metadata,
    data: { ...restored.input, placements: restored.placements, display: restored.display },
    view: { timeline: { collapsedRowIds: restored.view.collapsedRowIds } },
  }, { codecs: [dateCodec] })
  assert.equal(again, JSON.stringify(JSON.parse(text)))
})

test('a cyclic plan is valid input with a diagnostic, and a graph may contain cycles', () => {
  const cyclic = edit('planning', doc => doc.data.dependencies.push({ id: 'b-a', from: 'b', to: 'a' }))
  const result = parseWeaveSnapshot(cyclic)
  assert.equal(result.ok, true)
  assert.deepEqual(codes(result), ['schedule-cycle'])
  const restored = restoreWeaveSnapshot(result.snapshot, registry)
  assert.equal(restored.ok, true)
  assert.equal(restored.snapshot.schedule.ok, false)
  assert.equal(parseWeaveSnapshot(fixture('graph')).ok, true) // e1, e2 and e3 form a cycle
})

test('duplicate positions entries for one node fail instead of the last one winning', () => {
  const text = edit('graph', doc => doc.data.positions.push(['n3', { x: 1, y: 1 }]))
  const result = parseWeaveSnapshot(text)
  assert.equal(result.ok, false)
  assert.equal(result.snapshot, undefined)
  assert.deepEqual(codes(result), ['duplicate'])
  assert.equal(result.diagnostics[0].path, 'data.positions[2]')
  const sizes = parseWeaveSnapshot(edit('graph', doc => doc.data.sizes.push(['n2', { width: 1, height: 1 }])))
  assert.deepEqual(codes(sizes), ['duplicate'])
})

test('references and structure are validated', () => {
  const cases = [
    ['graph', doc => { doc.data.edges[0].to = 'nope' }, 'reference'],
    ['graph', doc => { doc.data.edges[1].toPort = 'missing' }, 'reference'],
    ['graph', doc => { doc.data.nodes.push({ id: 'n1', label: 'again' }) }, 'reference'],
    ['graph', doc => { doc.data.positions[0][0] = 'ghost' }, 'reference'],
    ['graph', doc => { doc.data.positions[0][1].x = -1 }, 'structure'],
    ['graph', doc => { doc.data.sizes[0][1].width = 0 }, 'structure'],
    ['graph', doc => { doc.data.groups[0].nodeIds.push('ghost') }, 'reference'],
    ['graph', doc => { doc.data.groups[0].parentId = 'g2' }, 'reference'],
    ['graph', doc => { doc.view.graph.collapsedGroupIds = ['ghost'] }, 'reference'],
    ['graph', doc => { doc.view.graph.camera.scale = 0 }, 'structure'],
    ['graph', doc => { doc.data.extra = 1 }, 'structure'],
    ['graph', doc => { doc.view = { timeline: {} } }, 'structure'],
    ['timeline', doc => { doc.data.bars[0].rowId = 'ghost' }, 'structure'],
    ['timeline', doc => { doc.data.bars[0].end = 1 }, 'structure'],
    ['timeline', doc => { doc.data.dependencies[0].to = 'ghost' }, 'structure'],
    ['timeline', doc => { doc.data.rows[1].parentId = 'r2' }, 'reference'],
    ['timeline', doc => { doc.view.timeline.collapsedRowIds = ['ghost'] }, 'reference'],
    ['timeline', doc => { doc.view.timeline.sort[0].columnId = 'ghost' }, 'reference'],
    ['timeline', doc => { doc.view.timeline.columns.push({ id: 'owner' }) }, 'duplicate'],
    ['timeline', doc => { doc.view.timeline.window = { start: 5, end: 5 } }, 'structure'],
    ['planning', doc => { doc.data.assignments[0].taskId = 'ghost' }, 'reference'],
    ['planning', doc => { doc.data.assignments.push({ taskId: 'a', resourceId: 'r1' }) }, 'duplicate'],
    ['planning', doc => { doc.data.assignments[2].units = 1.5 }, 'structure'],
    ['planning', doc => { doc.data.resources[0].capacity = -1 }, 'structure'],
    ['planning', doc => { doc.data.tasks[1].duration = 2.5 }, 'structure'],
    ['planning', doc => { doc.data.dependencies[0].to = 'ghost' }, 'structure'],
    ['planning', doc => { doc.data.placements.push({ taskId: 'c', resourceId: 'r1' }) }, 'reference'],
    ['planning', doc => { doc.data.placements.push({ taskId: 'b', resourceId: 'r1' }) }, 'duplicate'],
    ['planning', doc => { doc.data.display[0].taskId = 'ghost' }, 'reference'],
  ]
  for (const [name, change, code] of cases) {
    const result = parseWeaveSnapshot(edit(name, change))
    assert.equal(result.ok, false, change.toString())
    assert.ok(codes(result).includes(code), change.toString() + ' -> ' + JSON.stringify(result.diagnostics))
  }
  assert.equal(parseWeaveSnapshot(edit('planning', doc => doc.data.assignments.push({ taskId: 'a', resourceId: 'r2' }))).ok, true)
})

test('assignments are unique by the (taskId, resourceId) pair', () => {
  // The same task on two resources, and two tasks on one resource, are fine; the same pair twice is not.
  const text = edit('planning', doc => { doc.data.assignments.push({ taskId: 'c', resourceId: 'r1' }) })
  assert.equal(parseWeaveSnapshot(text).ok, true)
  assert.throws(() => serializeWeaveSnapshot({
    kind: 'planning',
    data: { ...JSON.parse(fixture('planning')).data, display: undefined, assignments: [{ taskId: 'a', resourceId: 'r1' }, { taskId: 'a', resourceId: 'r1', units: 2 }] },
  }), error => error instanceof WeaveSnapshotError && error.diagnostics[0].code === 'duplicate')
})

test('syntax, version and migrations', () => {
  assert.deepEqual(codes(parseWeaveSnapshot('{')), ['syntax'])
  assert.deepEqual(codes(parseWeaveSnapshot('[]')), ['structure'])
  assert.deepEqual(codes(parseWeaveSnapshot('{"schemaVersion":1,"kind":"graph","data":{"nodes":[],"edges":[]},"n":1e999}')), ['number'])
  assert.deepEqual(codes(parseWeaveSnapshot(edit('graph', doc => { doc.schemaVersion = 2 }))), ['version'])
  assert.deepEqual(codes(parseWeaveSnapshot(edit('graph', doc => { doc.schemaVersion = 1.5 }))), ['version'])
  assert.deepEqual(codes(parseWeaveSnapshot(edit('graph', doc => { delete doc.schemaVersion }))), ['version'])
  const legacy = JSON.stringify({ schemaVersion: 0, kind: 'graph', data: { nodes: [{ id: 'a', name: 'A' }], edges: [] } })
  assert.deepEqual(codes(parseWeaveSnapshot(legacy)), ['version'])
  const migrations = {
    0: doc => ({ ...doc, schemaVersion: 1, data: { ...doc.data, nodes: doc.data.nodes.map(({ name, ...rest }) => ({ ...rest, label: name })) } }),
  }
  const migrated = parseWeaveSnapshot(legacy, { migrations })
  assert.equal(migrated.ok, true)
  assert.deepEqual(migrated.snapshot.data.nodes, [{ id: 'a', label: 'A' }])
  // A migration that does not advance the version, or throws, fails instead of looping.
  assert.deepEqual(codes(parseWeaveSnapshot(legacy, { migrations: { 0: doc => doc } })), ['migration'])
  assert.deepEqual(codes(parseWeaveSnapshot(legacy, { migrations: { 0: () => { throw new Error('boom') } } })), ['migration'])
  // A migration cannot make a newer version readable.
  assert.deepEqual(codes(parseWeaveSnapshot(edit('graph', doc => { doc.schemaVersion = 2 }), { migrations: { 2: doc => ({ ...doc, schemaVersion: 1 }) } })), ['version'])
  assert.deepEqual(codes(parseWeaveSnapshot(edit('graph', doc => { doc.unknown = true }))), ['structure'])
})

test('restore fails without a partial result for unknown codecs and unresolved registrations', () => {
  const graph = parse(fixture('graph'))
  const noCodec = restoreWeaveSnapshot(graph, { layouts: registry.layouts })
  assert.equal(noCodec.ok, false)
  assert.equal(noCodec.snapshot, undefined)
  assert.deepEqual(codes(noCodec), ['codec'])
  const noLayout = restoreWeaveSnapshot(graph, { codecs: [dateCodec] })
  assert.equal(noLayout.ok, false)
  assert.equal(noLayout.snapshot, undefined)
  assert.deepEqual(codes(noLayout), ['registry'])
  const lenient = restoreWeaveSnapshot(graph, { codecs: [dateCodec], onMissing: 'fallback' })
  assert.equal(lenient.ok, true)
  assert.equal(lenient.snapshot.view.layout, undefined)
  assert.deepEqual(lenient.diagnostics.map(item => item.severity), ['warning'])
  // A codec that cannot decode, or an unknown codec nested in a deep value, is not skipped.
  assert.equal(restoreWeaveSnapshot(graph, { codecs: [{ id: 'date', decode: () => { throw new Error('bad') } }], layouts: registry.layouts }).ok, false)

  const timeline = parse(fixture('timeline'))
  const missingColumn = restoreWeaveSnapshot(timeline, { ...registry, columns: { owner: registry.columns.owner } })
  assert.equal(missingColumn.ok, false)
  assert.equal(missingColumn.diagnostics[0].path, 'view.timeline.columns[2]')
  const missingEditor = restoreWeaveSnapshot(timeline, { ...registry, editors: {} })
  assert.equal(missingEditor.ok, false)
  const fallbackView = restoreWeaveSnapshot(timeline, { ...registry, editors: {}, comparators: {}, onMissing: 'fallback' })
  assert.equal(fallbackView.ok, true)
  assert.equal(fallbackView.snapshot.view.columns[2].editor, undefined)
  assert.equal(fallbackView.snapshot.view.sort[0].comparator, undefined)
  assert.equal(fallbackView.diagnostics.length, 2)
  // With the fallback policy, unregistered columns are dropped with a warning; the label column stays.
  const bare = restoreWeaveSnapshot(timeline, { ...registry, columns: {}, onMissing: 'fallback' })
  assert.deepEqual(bare.snapshot.view.columns.map(column => column.id), ['$label'])
  assert.equal(bare.diagnostics.filter(item => item.severity === 'warning').length, 2)
})

test('restore validates again and leaves the snapshot and registry untouched', () => {
  const snapshot = parse(fixture('graph'))
  const copy = JSON.stringify(snapshot)
  const frozen = JSON.parse(copy, (_key, value) => (value && typeof value === 'object' ? Object.freeze(value) : value))
  assert.equal(restoreWeaveSnapshot(frozen, registry).ok, true)
  assert.equal(JSON.stringify(frozen), copy)
  const broken = JSON.parse(copy)
  broken.data.edges[0].to = 'nope'
  const result = restoreWeaveSnapshot(broken, registry)
  assert.equal(result.ok, false)
  assert.equal(result.snapshot, undefined)
  const first = restore(snapshot)
  const second = restore(snapshot)
  first.nodes[0].label = 'changed'
  first.positions.set('n3', { x: 9, y: 9 })
  assert.equal(second.nodes[0].label, 'Ship')
  assert.equal(snapshot.data.nodes[0].label, 'Ship')
})

test('serialize rejects values it would otherwise lose', () => {
  const base = { kind: 'graph', data: { nodes: [{ id: 'a', label: 'A' }], edges: [] } }
  const withData = data => ({ ...base, data: { ...base.data, nodes: [{ id: 'a', label: 'A', data }] } })
  const failing = [
    [withData({ n: NaN }), 'number'],
    [withData({ n: Infinity }), 'number'],
    [withData({ n: -Infinity }), 'number'],
    [withData({ fn: () => 1 }), 'json'],
    [withData({ when: new Date(0) }), 'json'],
    [withData({ big: 1n }), 'json'],
    [withData({ map: new Map() }), 'json'],
    [withData({ sym: Symbol('x') }), 'json'],
    [withData([1, undefined]), 'json'],
    [withData({ $codec: 'fake', value: 1 }), 'json'],
    [{ ...base, data: { ...base.data, positions: [['a', { x: 0, y: 0 }]] } }, 'structure'],
    [{ ...base, data: { ...base.data, positions: new Map([['a', { x: NaN, y: 0 }]]) } }, 'number'],
    [{ ...base, data: { ...base.data, positions: new Map([['b', { x: 0, y: 0 }]]) } }, 'reference'],
    [{ ...base, view: { graph: { collapsedGroupIds: ['g'] } } }, 'structure'],
    [{ ...base, metadata: { savedAt: 'yesterday' } }, 'structure'],
    // Unknown keys named like inherited members are reported, not silently dropped.
    [{ ...base, data: { ...base.data, constructor: 1 } }, 'structure'],
    [{ ...base, metadata: { title: 'T', toString: 'x' } }, 'structure'],
    [{ ...base, view: { graph: { valueOf: 1 } } }, 'structure'],
  ]
  for (const [input, code] of failing) {
    assert.throws(() => serializeWeaveSnapshot(input), error => error instanceof WeaveSnapshotError && error.diagnostics.some(item => item.code === code),
      'should fail with ' + code + ': ' + Object.keys(input.data).join())
  }
  const cyclic = { kind: 'graph', data: { nodes: [{ id: 'a', label: 'A', data: {} }], edges: [] } }
  cyclic.data.nodes[0].data.self = cyclic.data.nodes[0].data
  assert.throws(() => serializeWeaveSnapshot(cyclic), WeaveSnapshotError)
  assert.throws(() => serializeWeaveSnapshot({ kind: 'chart', data: {} }), RangeError)
  // undefined properties are omitted; a registered codec stores the rest.
  const text = serializeWeaveSnapshot(withData({ keep: 1, gone: undefined, when: new Date(0) }), { codecs: [dateCodec] })
  assert.deepEqual(JSON.parse(text).data.nodes[0].data, { keep: 1, when: { $codec: 'date', version: 1, value: '1970-01-01T00:00:00.000Z' } })
  assert.throws(() => serializeWeaveSnapshot(base, { codecs: [dateCodec, dateCodec] }), /Duplicate snapshot codec/)
})

test('output is deterministic when the saved time is fixed and does not mutate the input', () => {
  const build = (order) => ({
    kind: 'graph',
    metadata: { title: 'T', savedAt: '2026-01-01T00:00:00.000Z' },
    data: { nodes: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], edges: [{ id: 'e', from: 'a', to: 'b' }], groups: [], positions: new Map([['b', { x: 1, y: 2 }], ['a', { x: 0, y: 0 }]]) },
    view: { graph: { collapsedGroupIds: new Set(order) } },
  })
  const input = build(['g2', 'g1'])
  input.data.groups = [{ id: 'g1', label: 'one', nodeIds: ['a'] }, { id: 'g2', label: 'two', nodeIds: ['b'] }]
  const other = build(['g1', 'g2'])
  other.data.groups = input.data.groups
  const before = JSON.stringify(input, (_k, v) => (v instanceof Map ? [...v] : v instanceof Set ? [...v] : v))
  const first = serializeWeaveSnapshot(input, { libraryVersion: '1.2.3' })
  assert.equal(serializeWeaveSnapshot(input, { libraryVersion: '1.2.3' }), first)
  assert.equal(serializeWeaveSnapshot(other, { libraryVersion: '1.2.3' }), first)
  assert.equal(JSON.stringify(input, (_k, v) => (v instanceof Map ? [...v] : v instanceof Set ? [...v] : v)), before)
  const doc = JSON.parse(first)
  assert.deepEqual(Object.keys(doc), ['schemaVersion', 'kind', 'libraryVersion', 'metadata', 'data', 'view'])
  assert.deepEqual(doc.view.graph.collapsedGroupIds, ['g1', 'g2'])
  assert.deepEqual(doc.data.positions.map(([id]) => id), ['b', 'a'])
  // Nothing reads the clock: without savedAt the text has none.
  assert.equal(JSON.parse(serializeWeaveSnapshot({ ...input, metadata: undefined })).metadata, undefined)
})

test('the graph camera is stored as a center and scale, independent of the container', () => {
  const text = serializeWeaveSnapshot({
    kind: 'graph',
    data: { nodes: [{ id: 'a', label: 'A' }], edges: [] },
    view: { graph: { camera: { center: { x: 10, y: -20 }, scale: 0.5 } } },
  })
  const restored = restore(parse(text))
  assert.deepEqual(restored.view.camera, { center: { x: 10, y: -20 }, scale: 0.5 })
  assert.deepEqual(Object.keys(JSON.parse(text).view.graph.camera).sort(), ['center', 'scale'])
})

test('a planning snapshot keeps business task IDs, never the bar IDs of a resource projection', () => {
  const input = JSON.parse(fixture('planning')).data
  const schedule = scheduleTasks(input)
  assert.equal(schedule.ok, true)
  // Task a is shown on both resources: two display bars with tuple IDs, one input task.
  const assignments = [...input.assignments, { taskId: 'a', resourceId: 'r2' }]
  const projection = projectResourceTimeline({
    resources: input.resources.map(resource => ({ id: resource.id, label: resource.id })),
    tasks: schedule.tasks.map(task => ({ id: task.id, label: task.id, start: task.start, end: task.end })),
    assignments,
  })
  const barIds = projection.bars.map(bar => bar.id)
  assert.equal(barIds.filter(id => projection.origins.get(id).taskId === 'a').length, 2)
  // Saved from the input model (origins map display bars back), the snapshot holds the task IDs only.
  const placements = [{ taskId: projection.origins.get(barIds[0]).taskId, resourceId: projection.origins.get(barIds[0]).resourceId }]
  const text = serializeWeaveSnapshot({ kind: 'planning', data: { ...input, assignments, placements, display: [] } })
  for (const id of barIds) assert.equal(text.includes(JSON.stringify(id).slice(1, -1)), false, id)
  const restored = restore(parse(text))
  assert.deepEqual(restored.input.tasks.map(task => task.id), ['c', 'a', 'b'])
  // A snapshot that names a projection bar instead of the task is rejected as an unknown reference, not restored.
  const projected = JSON.parse(text)
  projected.data.placements = [{ taskId: barIds[0], resourceId: 'r1' }]
  const rejected = parseWeaveSnapshot(JSON.stringify(projected))
  assert.equal(rejected.ok, false)
  assert.deepEqual(codes(rejected), ['reference'])
})
