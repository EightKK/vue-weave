import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createTimelineViewState, parseTimelineViewState, projectTimelineView, reconcileTimelineViewColumns, resolveTimelineColumns,
  timelineWbsCodes, validateTimelineData, createTimelineRowTree,
} from '@eightkk/vue-weave/core'
import { useTimelineView } from '@eightkk/vue-weave'

const rows = [
  { id: 'p1', label: 'Phase 1' },
  { id: 'a', parentId: 'p1', label: 'Alpha' },
  { id: 'b', parentId: 'p1', label: 'Beta' },
  { id: 'p2', label: 'Phase 2' },
  { id: 'c', parentId: 'p2', label: 'Gamma' },
  { id: 'd', parentId: 'p2', label: 'Delta' },
]
const bars = [
  { id: 'ba', rowId: 'a', label: 'Alpha work', start: 0, end: 10 },
  { id: 'bb', rowId: 'b', label: 'Beta work', start: 10, end: 20 },
  { id: 'bc', rowId: 'c', label: 'Gamma work', start: 20, end: 30 },
  { id: 'bd', rowId: 'd', label: 'Delta work', start: 30, end: 40 },
]
const dependencies = [
  { id: 'x1', from: 'ba', to: 'bb' },
  { id: 'x2', from: 'bb', to: 'bc' },
  { id: 'x3', from: 'bc', to: 'bd' },
]
const columns = [
  { id: 'name', label: 'Name', width: 120, value: row => row.label },
  { id: 'size', label: 'Size', width: 60, value: row => ({ a: 3, b: 3, c: 1, d: 2 })[row.id] ?? 0 },
]
const input = { rows, bars, dependencies, columns }
const search = text => ({ ...createTimelineViewState(columns), search: { text } })

test('search keeps matching rows with their ancestors and passes validation', () => {
  const result = projectTimelineView(input, search('gamma'))
  assert.deepEqual(result.rows.map(row => row.id), ['p2', 'c'])
  assert.deepEqual(result.matchedRowIds, ['c'])
  assert.deepEqual(result.bars.map(bar => bar.id), ['bc'])
  validateTimelineData(result.rows, result.bars, result.dependencies)
  createTimelineRowTree(result.rows)
})

test('search matches bar labels and is case-insensitive; empty search keeps everything', () => {
  assert.deepEqual(projectTimelineView(input, search('BETA WORK')).rows.map(row => row.id), ['p1', 'b'])
  const all = projectTimelineView(input, search('  '))
  assert.equal(all.rows.length, rows.length)
  assert.deepEqual(all.matchedRowIds, [])
})

test('search can be limited to columns and reports unknown columns', () => {
  const state = { ...createTimelineViewState(columns), search: { text: 'work', columnIds: ['name', 'nope'] } }
  const result = projectTimelineView(input, state)
  assert.deepEqual(result.rows, [])
  assert.ok(result.diagnostics.some(item => item.code === 'unknown-column' && item.id === 'nope'))
})

test('dependencies to hidden bars are removed, counted and reported as targets', () => {
  const result = projectTimelineView(input, search('gamma'))
  assert.deepEqual(result.dependencies, [])
  assert.equal(result.removedDependencyCount, 3)
  assert.deepEqual(result.removedDependencyIds, ['x1', 'x2', 'x3'])
  assert.deepEqual(result.hiddenTargets, [
    { barId: 'bb', rowId: 'b', dependencyIds: ['x2'], visibleBarIds: ['bc'] },
    { barId: 'bd', rowId: 'd', dependencyIds: ['x3'], visibleBarIds: ['bc'] },
  ])
  const both = projectTimelineView(input, search('work'))
  assert.equal(both.removedDependencyCount, 0)
  assert.deepEqual(both.dependencies.map(item => item.id), ['x1', 'x2', 'x3'])
})

test('sorting is stable within siblings and keeps parents before children', () => {
  const state = { ...createTimelineViewState(columns), sort: [{ ruleId: 'size', direction: 'asc' }] }
  const result = projectTimelineView(input, state)
  // p1 children a, b tie on size and keep their order; p2 children sort d(2) after c(1).
  assert.deepEqual(result.rows.map(row => row.id), ['p1', 'a', 'b', 'p2', 'c', 'd'])
  const desc = projectTimelineView(input, { ...state, sort: [{ ruleId: 'size', direction: 'desc' }] })
  assert.deepEqual(desc.rows.map(row => row.id), ['p1', 'a', 'b', 'p2', 'd', 'c'])
  const rules = { reverse: (a, b) => (a.id < b.id ? 1 : -1) }
  const custom = projectTimelineView({ ...input, sortRules: rules }, { ...state, sort: [{ ruleId: 'reverse', direction: 'asc' }] })
  assert.deepEqual(custom.rows.map(row => row.id), ['p2', 'd', 'c', 'p1', 'b', 'a'])
  validateTimelineData(custom.rows, custom.bars, custom.dependencies)
})

test('equal sort keys preserve the original order across the whole sibling set', () => {
  const flat = ['q', 'w', 'e', 'r'].map(id => ({ id, label: id }))
  const result = projectTimelineView({ rows: flat, bars: [], sortRules: { same: () => 0 } },
    { ...createTimelineViewState(), sort: [{ ruleId: 'same', direction: 'desc' }] })
  assert.deepEqual(result.rows.map(row => row.id), ['q', 'w', 'e', 'r'])
})

test('unknown sort rules are diagnosed and ignored', () => {
  const state = { ...createTimelineViewState(columns), sort: [{ ruleId: 'ghost', direction: 'asc' }] }
  const result = projectTimelineView(input, state)
  assert.deepEqual(result.rows.map(row => row.id), rows.map(row => row.id))
  assert.ok(result.diagnostics.some(item => item.code === 'unknown-sort-rule' && item.id === 'ghost'))
})

test('inputs are not mutated and WBS codes come from the original rows', () => {
  const before = JSON.stringify(input)
  const frozen = { rows: Object.freeze(rows.map(Object.freeze)), bars: Object.freeze(bars.map(Object.freeze)), dependencies: Object.freeze(dependencies.map(Object.freeze)), columns }
  const state = { ...search('delta'), sort: [{ ruleId: 'size', direction: 'desc' }] }
  const result = projectTimelineView(frozen, state)
  assert.equal(JSON.stringify(input), before)
  assert.deepEqual(result.rows.map(row => row.id), ['p2', 'd'])
  assert.deepEqual([...result.wbs], [...timelineWbsCodes(rows)])
  assert.equal(result.wbs.get('d'), '2.2')
  assert.deepEqual([...timelineWbsCodes(rows)], [['p1', '1'], ['a', '1.1'], ['b', '1.2'], ['p2', '2'], ['c', '2.1'], ['d', '2.2']])
  assert.notEqual(result.rows, frozen.rows)
})

test('invalid source data is rejected before projection', () => {
  assert.throws(() => projectTimelineView({ rows: [{ id: 'a', parentId: 'zzz', label: 'a' }], bars: [] }, createTimelineViewState()), /Unknown parent/)
})

test('collapsed IDs, window and zoom pass through; unknown rows are diagnosed', () => {
  const state = { ...createTimelineViewState(columns), collapsedIds: ['p1', 'gone'], window: { start: 0, end: 50 }, zoom: 'week' }
  const result = projectTimelineView(input, state)
  assert.deepEqual(result.collapsedIds, ['p1'])
  assert.deepEqual(result.window, { start: 0, end: 50 })
  assert.equal(result.zoom, 'week')
  assert.ok(result.diagnostics.some(item => item.code === 'unknown-row' && item.id === 'gone'))
  assert.throws(() => projectTimelineView(input, { ...state, window: { start: 5, end: 5 } }), RangeError)
})

test('view state survives a JSON round trip and rejects malformed JSON', () => {
  const state = {
    ...createTimelineViewState(columns),
    search: { text: 'a', columnIds: ['name'] }, sort: [{ ruleId: 'size', direction: 'desc' }],
    collapsedIds: ['p1'], window: { start: 1, end: 9 }, zoom: 'day',
  }
  state.columns[1] = { id: 'size', visible: false, width: 80 }
  const restored = parseTimelineViewState(JSON.parse(JSON.stringify(state)))
  assert.deepEqual(restored, state)
  assert.throws(() => parseTimelineViewState({ ...state, version: 2 }), /version/)
  assert.throws(() => parseTimelineViewState({ ...state, sort: [{ ruleId: 'x', direction: 'up' }] }), /direction/)
  assert.throws(() => parseTimelineViewState(null), /state/)
})

test('unknown columns are dropped and new columns are appended visibly', () => {
  const saved = { ...createTimelineViewState(), columns: [
    { id: 'size', visible: true, width: 90 }, { id: 'old', visible: true }, { id: 'name', visible: false }, { id: 'size', visible: true },
  ] }
  const extra = [...columns, { id: 'extra', label: 'Extra', width: 40, value: () => '' }]
  const { columns: reconciled, diagnostics } = reconcileTimelineViewColumns(saved, extra)
  assert.deepEqual(reconciled.map(item => item.id), ['size', 'name', 'extra'])
  assert.equal(reconciled[2].visible, true)
  assert.deepEqual(diagnostics.map(item => item.code).sort(), ['duplicate-column', 'new-column', 'unknown-column'])
  const resolved = resolveTimelineColumns(saved, extra)
  assert.deepEqual(resolved.columns.map(item => [item.id, item.width]), [['size', 90], ['extra', 40]])
  const bad = reconcileTimelineViewColumns({ ...saved, columns: [{ id: 'name', visible: true, width: -1 }] }, columns)
  assert.ok(bad.diagnostics.some(item => item.code === 'invalid-width'))
})

test('useTimelineView projects reactively without touching the source', () => {
  const view = useTimelineView(input)
  assert.equal(view.projection.value.rows.length, 6)
  view.setSearch('alpha')
  assert.deepEqual(view.projection.value.rows.map(row => row.id), ['p1', 'a'])
  view.setSearch('')
  view.setSort([{ ruleId: 'size', direction: 'desc' }])
  assert.deepEqual(view.projection.value.rows.map(row => row.id), ['p1', 'a', 'b', 'p2', 'd', 'c'])
  view.moveColumn('size', 0)
  view.setColumnVisible('name', false)
  view.setColumnWidth('size', 75)
  assert.deepEqual(view.columns.value.map(item => [item.id, item.width]), [['size', 75]])
  view.toggleCollapsed('p1')
  view.setWindow({ start: 0, end: 10 }, 'day')
  assert.deepEqual(view.projection.value.collapsedIds, ['p1'])
  const saved = view.snapshot()
  view.reset()
  assert.deepEqual(view.state.value.sort, [])
  view.restore(saved)
  assert.deepEqual(view.state.value, saved)
  assert.throws(() => view.restore({}), /version/)
  assert.deepEqual(view.state.value, saved)
  view.setWindow(undefined)
  assert.equal('window' in view.state.value, false)
  assert.equal(rows.length, 6)
})
