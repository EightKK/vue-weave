import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createTimelineViewState, projectTimelineRows, projectTimelineView, timelineLabelColumnId, timelineWbsCodes,
} from '@eightkk/vue-weave/core'

const rows = [
  { id: 'p1', label: 'Phase 1' },
  { id: 'a', parentId: 'p1', label: 'Alpha', detail: 'north site' },
  { id: 'b', parentId: 'p1', label: 'Beta' },
  { id: 'p2', label: 'Phase 2' },
  { id: 'c', parentId: 'p2', label: 'Gamma' },
  { id: 'd', parentId: 'p2', label: 'Delta' },
  { id: 'd1', parentId: 'd', label: 'Delta one' },
  { id: 'd2', parentId: 'd', label: 'Delta two' },
]
const owners = { a: 'kim', b: 'lee', c: 'kim', d1: 'lee', d2: 'kim' }
const sizes = { a: 3, b: 1, c: 2, d1: 5, d2: 4 }
const columns = [
  { id: 'name', label: 'Name', width: 120, value: row => row.label },
  { id: 'size', label: 'Size', width: 60, value: row => sizes[row.id] ?? 0 },
  {
    id: 'owner', label: 'Owner', width: 80, value: row => owners[row.id] ?? '',
    field: { type: 'text', get: row => owners[row.id] ?? '' },
  },
  { id: 'span', label: 'Span', width: 60, value: (row, summary) => summary ? summary.end - summary.start : 0 },
]
const bars = [
  { id: 'ba', rowId: 'a', label: 'Pour concrete', start: 0, end: 10 },
  { id: 'bb', rowId: 'b', label: 'Inspect', start: 10, end: 20 },
  { id: 'bc', rowId: 'c', label: 'Frame', start: 20, end: 35 },
  { id: 'bd1', rowId: 'd1', label: 'Wire', start: 30, end: 40 },
  { id: 'bd2', rowId: 'd2', label: 'Plumb', start: 40, end: 45 },
]
const state = patch => createTimelineViewState(columns, patch)

test('search keeps matching rows with their ancestors and reports the matches', () => {
  const result = projectTimelineRows({ rows, columns }, state({ search: { text: 'two' } }))
  assert.deepEqual(result.rows.map(row => row.id), ['p2', 'd', 'd2'])
  assert.deepEqual(result.matchedRowIds, ['d2'])
  assert.deepEqual(result.diagnostics, [])
  // Row objects are the input's own.
  assert.equal(result.rows[2], rows[7])
  // The unrestricted search also reads row details.
  assert.deepEqual(projectTimelineRows({ rows }, state({ search: { text: 'NORTH' } })).matchedRowIds, ['a'])
})

test('bars are optional: with bars the search reads bar labels and columns receive summaries', () => {
  const withoutBars = projectTimelineRows({ rows, columns }, state({ search: { text: 'wire' } }))
  assert.deepEqual(withoutBars.rows, [])
  const withBars = projectTimelineRows({ rows, columns, bars }, state({ search: { text: 'wire' } }))
  assert.deepEqual(withBars.rows.map(row => row.id), ['p2', 'd', 'd1'])
  const span = projectTimelineRows({ rows, columns, bars }, state({ search: { text: '15', columnIds: ['span'] } }))
  assert.deepEqual(span.matchedRowIds, ['c', 'd'])
  assert.throws(() => projectTimelineRows({ rows, bars: [{ id: 'x', rowId: 'nope', label: 'X', start: 0, end: 1 }] }, state()),
    { message: 'Unknown row for bar: x' })
})

test('column filters combine with each other and with the search, and unknown columns are reported', () => {
  const owner = projectTimelineRows({ rows, columns }, state({ filters: [{ columnId: 'owner', values: ['lee'] }] }))
  assert.deepEqual(owner.rows.map(row => row.id), ['p1', 'b', 'p2', 'd', 'd1'])
  assert.deepEqual(owner.matchedRowIds, ['b', 'd1'])
  const both = projectTimelineRows({ rows, columns }, state({
    search: { text: 'delta' },
    filters: [{ columnId: 'owner', values: ['kim'] }, { columnId: timelineLabelColumnId, text: 'TWO' }, { columnId: 'gone', text: 'x' }],
  }))
  assert.deepEqual(both.rows.map(row => row.id), ['p2', 'd', 'd2'])
  assert.deepEqual(both.diagnostics.map(item => [item.code, item.id]), [['unknown-column', 'gone']])
  const empty = projectTimelineRows({ rows, columns }, state({ filters: [{ columnId: 'owner', values: [] }] }))
  assert.deepEqual(empty.rows, [])
})

test('sorting is stable per sibling group, by column, label or registered rule', () => {
  const bySize = projectTimelineRows({ rows, columns }, state({ sort: [{ ruleId: 'size', direction: 'desc' }] }))
  // Siblings only: children stay under their parents.
  assert.deepEqual(bySize.rows.map(row => row.id), ['p1', 'a', 'b', 'p2', 'c', 'd', 'd1', 'd2'])
  const byLabel = projectTimelineRows({ rows }, state({ sort: [{ ruleId: timelineLabelColumnId, direction: 'desc' }] }))
  assert.deepEqual(byLabel.rows.map(row => row.id), ['p2', 'c', 'd', 'd2', 'd1', 'p1', 'b', 'a'])
  // Ties keep the original order; a later rule breaks ties.
  const sortRules = { owner: (x, y) => (owners[x.id] ?? '').localeCompare(owners[y.id] ?? '') }
  const ruled = projectTimelineRows({ rows, columns, sortRules }, state({
    sort: [{ ruleId: 'owner', direction: 'asc' }, { ruleId: 'size', direction: 'asc' }],
  }))
  assert.deepEqual(ruled.rows.map(row => row.id), ['p1', 'a', 'b', 'p2', 'd', 'd2', 'd1', 'c'])
})

test('unknown sort rules are reported and ignored; unknown collapsed IDs are dropped and reported', () => {
  const result = projectTimelineRows({ rows, columns }, state({
    sort: [{ ruleId: 'missing', direction: 'asc' }],
    collapsedIds: ['d', 'ghost', 'p1'],
  }))
  assert.deepEqual(result.rows.map(row => row.id), rows.map(row => row.id))
  assert.deepEqual(result.collapsedIds, ['d', 'p1'])
  assert.deepEqual(result.diagnostics.map(item => [item.code, item.id]), [['unknown-row', 'ghost'], ['unknown-sort-rule', 'missing']])
  assert.deepEqual(result.wbs, timelineWbsCodes(rows))
})

test('the row projection validates the tree and never changes its inputs', () => {
  assert.throws(() => projectTimelineRows({ rows: [...rows, { id: 'a', label: 'again' }] }, state()), { message: 'Duplicate row ID: a' })
  assert.throws(() => projectTimelineRows({ rows: [{ id: 'x', parentId: 'y', label: 'X' }] }, state()), /Unknown parent/)
  assert.throws(() => projectTimelineRows({
    rows: [{ id: 'x', parentId: 'y', label: 'X' }, { id: 'y', parentId: 'x', label: 'Y' }],
  }, state()), /cycle/)
  const frozenRows = Object.freeze(rows.map(row => Object.freeze({ ...row })))
  const frozenState = Object.freeze(state({
    search: Object.freeze({ text: 'delta' }), sort: Object.freeze([Object.freeze({ ruleId: 'size', direction: 'desc' })]),
    collapsedIds: Object.freeze(['d']),
  }))
  const result = projectTimelineRows({ rows: frozenRows, columns }, frozenState)
  assert.deepEqual(result.rows.map(row => row.id), ['p2', 'd', 'd1', 'd2'])
})

test('projectTimelineView returns exactly the rows part of projectTimelineRows', () => {
  const sortRules = { owner: (x, y) => (owners[x.id] ?? '').localeCompare(owners[y.id] ?? '') }
  const views = [
    state(),
    state({ search: { text: 'delta' }, collapsedIds: ['d', 'nope'] }),
    state({ search: { text: 'i', columnIds: ['name', 'gone'] }, sort: [{ ruleId: 'owner', direction: 'desc' }, { ruleId: 'x', direction: 'asc' }] }),
    state({
      search: { text: 'w' }, filters: [{ columnId: 'owner', values: ['kim', 'lee'] }, { columnId: 'span', values: [5, 10, 20] }, { columnId: 'lost' }],
      sort: [{ ruleId: 'size', direction: 'asc' }, { ruleId: timelineLabelColumnId, direction: 'asc' }],
    }),
    { ...state({ sort: [{ ruleId: 'size', direction: 'asc' }] }), columns: [{ id: 'old', visible: true }] },
  ]
  for (const view of views) {
    const full = projectTimelineView({ rows, bars, columns, sortRules }, view)
    const part = projectTimelineRows({ rows, bars, columns, sortRules }, view)
    assert.deepEqual(full.rows, part.rows)
    assert.deepEqual(full.matchedRowIds, part.matchedRowIds)
    assert.deepEqual(full.collapsedIds, part.collapsedIds)
    assert.deepEqual(full.wbs, part.wbs)
    // The view adds its column diagnostics in front of the row diagnostics.
    assert.deepEqual(full.diagnostics.slice(full.diagnostics.length - part.diagnostics.length), part.diagnostics)
    assert.ok(full.diagnostics.slice(0, full.diagnostics.length - part.diagnostics.length)
      .every(item => ['unknown-column', 'new-column', 'duplicate-column', 'invalid-width'].includes(item.code)))
    assert.deepEqual(full.bars.map(bar => bar.rowId).filter(id => !part.rows.some(row => row.id === id)), [])
  }
  // A pinned result of the non-trivial view, so the extraction keeps the earlier output.
  const pinned = projectTimelineView({ rows, bars, columns, sortRules }, views[3])
  assert.deepEqual(pinned.rows.map(row => row.id), ['p2', 'd', 'd2', 'd1'])
  assert.deepEqual(pinned.matchedRowIds, ['d1', 'd2'])
  assert.deepEqual(pinned.bars.map(bar => bar.id), ['bd1', 'bd2'])
  assert.deepEqual(pinned.diagnostics.map(item => [item.code, item.id]), [['unknown-column', 'lost']])
})

test('projectTimelineRows looks up sort rules by own key only, so columns named like Object.prototype members sort', () => {
  const flat = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }, { id: 'c', label: 'C' }]
  const order = { a: 2, b: 3, c: 1 }
  const stateOf = id => ({ search: { text: '' }, sort: [{ ruleId: id, direction: 'asc' }], filters: [], collapsedIds: [] })
  for (const id of ['constructor', 'toString', '__proto__', 'hasOwnProperty', 'valueOf']) {
    const columns = [{ id, label: id, width: 60, value: row => order[row.id] }]
    for (const sortRules of [undefined, {}]) {
      const projected = projectTimelineRows({ rows: flat, columns, sortRules }, stateOf(id))
      assert.deepEqual(projected.rows.map(row => row.id), ['c', 'a', 'b'], `${id} with sortRules ${JSON.stringify(sortRules)}`)
      assert.deepEqual(projected.diagnostics, [])
    }
    // A registered rule of that name still wins over the column (a computed key is an own property, even __proto__).
    const registered = projectTimelineRows({ rows: flat, columns, sortRules: { [id]: (x, y) => y.label.localeCompare(x.label) } }, stateOf(id))
    assert.deepEqual(registered.rows.map(row => row.id), ['c', 'b', 'a'], id)
    // Without such a column the ID is reported, not taken from the prototype.
    const unknown = projectTimelineRows({ rows: flat, sortRules: {} }, stateOf(id))
    assert.deepEqual(unknown.rows.map(row => row.id), ['a', 'b', 'c'], id)
    assert.deepEqual(unknown.diagnostics.map(item => [item.code, item.id]), [['unknown-sort-rule', id]])
  }
})

test('a column sort reads the row summaries, as the search and the filters do', () => {
  const tree = [
    { id: 'p1', label: 'Phase 1' }, { id: 'a', parentId: 'p1', label: 'A' },
    { id: 'p2', label: 'Phase 2' }, { id: 'b', parentId: 'p2', label: 'B' },
  ]
  const spans = [{ id: 'A', rowId: 'a', label: 'A', start: 50, end: 60 }, { id: 'B', rowId: 'b', label: 'B', start: 10, end: 20 }]
  const start = [{ id: 'start', label: 'Start', width: 80, value: (row, summary) => summary?.start ?? -1 }]
  const ascending = createTimelineViewState(start, { sort: [{ ruleId: 'start', direction: 'asc' }] })
  assert.deepEqual(projectTimelineRows({ rows: tree, bars: spans, columns: start }, ascending).rows.map(row => row.id), ['p2', 'b', 'p1', 'a'])
  const descending = { ...ascending, sort: [{ ruleId: 'start', direction: 'desc' }] }
  assert.deepEqual(projectTimelineView({ rows: tree, bars: spans, columns: start }, descending).rows.map(row => row.id), ['p1', 'a', 'p2', 'b'])
  // Without bars the columns receive no summary, so every value is -1 and the original order stays.
  assert.deepEqual(projectTimelineRows({ rows: tree, columns: start }, ascending).rows.map(row => row.id), ['p1', 'a', 'p2', 'b'])
})
