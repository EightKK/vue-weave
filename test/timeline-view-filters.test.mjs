import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  createTimelineViewState, filterTimelineRows, nextTimelineSort, parseTimelineViewState, projectTimelineView, timelineLabelColumnId,
  validateTimelineData,
} from '@eightkk/vue-weave/core'
import { useTimelineView } from '@eightkk/vue-weave'

const rows = [
  { id: 'p1', label: 'Phase 1' },
  { id: 'a', parentId: 'p1', label: 'Alpha' },
  { id: 'b', parentId: 'p1', label: 'Beta' },
  { id: 'p2', label: 'Phase 2' },
  { id: 'c', parentId: 'p2', label: 'Gamma' },
  { id: 'c1', parentId: 'c', label: 'Gamma prep' },
  { id: 'd', parentId: 'p2', label: 'Delta' },
]
const status = { a: 'done', b: 'open', c: 'open', c1: 'late', d: ['open', 'late'] }
const bars = [
  { id: 'ba', rowId: 'a', label: 'Alpha work', start: 0, end: 10 },
  { id: 'bb', rowId: 'b', label: 'Beta work', start: 10, end: 20 },
  { id: 'bc', rowId: 'c1', label: 'Gamma work', start: 20, end: 30 },
  { id: 'bd', rowId: 'd', label: 'Delta work', start: 30, end: 40 },
]
const dependencies = [{ id: 'x1', from: 'ba', to: 'bb' }, { id: 'x2', from: 'bb', to: 'bc' }]
const columns = [
  { id: 'owner', label: 'Owner', width: 90, value: row => ({ a: 'Ana', b: 'Ben', c1: 'Ana', d: 'Dee' })[row.id] ?? '' },
  {
    id: 'status', label: 'Status', width: 80, value: row => String(status[row.id] ?? ''),
    field: { id: 'status', kind: 'select', multiple: true, get: row => status[row.id] ?? null, choices: [{ value: 'open' }, { value: 'done' }, { value: 'late' }] },
  },
]
const input = { rows, bars, dependencies, columns }
const withFilters = (filters, patch = {}) => ({ ...createTimelineViewState(columns), filters, ...patch })
const ids = result => result.rows.map(row => row.id)

test('filterTimelineRows keeps matches with their ancestors, in the original order, without changing the input', () => {
  const copy = structuredClone(rows)
  assert.deepEqual(filterTimelineRows(rows, row => row.id === 'c1').map(row => row.id), ['p2', 'c', 'c1'])
  assert.deepEqual(filterTimelineRows(rows, row => row.id === 'p1' || row.id === 'd').map(row => row.id), ['p1', 'p2', 'd'])
  assert.deepEqual(filterTimelineRows(rows, () => false), [])
  assert.deepEqual(rows, copy)
  assert.throws(() => filterTimelineRows([{ id: 'x', label: 'X', parentId: 'y' }, { id: 'y', label: 'Y', parentId: 'x' }], () => true), /cycle/)
  assert.throws(() => filterTimelineRows([{ id: 'x', label: 'X', parentId: 'missing' }], () => true), /Unknown parent/)
  // Long parent chains are walked with a loop, not recursion.
  const chain = Array.from({ length: 12_000 }, (_, i) => ({ id: 'n' + i, label: 'N', ...(i ? { parentId: 'n' + (i - 1) } : {}) }))
  assert.equal(filterTimelineRows(chain, row => row.id === 'n11999').length, 12_000)
})

test('a text filter keeps matching rows with their summary rows as context', () => {
  const result = projectTimelineView(input, withFilters([{ columnId: 'owner', text: '  ana ' }]))
  assert.deepEqual(ids(result), ['p1', 'a', 'p2', 'c', 'c1'])
  assert.deepEqual(result.matchedRowIds, ['a', 'c1'])
  assert.deepEqual(result.bars.map(bar => bar.id), ['ba', 'bc'])
  assert.deepEqual(result.removedDependencyIds, ['x1', 'x2'])
  validateTimelineData(result.rows, result.bars, result.dependencies)
})

test('a value filter compares the raw field value; a multiple selection matches any entry', () => {
  assert.deepEqual(ids(projectTimelineView(input, withFilters([{ columnId: 'status', values: ['late'] }]))), ['p2', 'c', 'c1', 'd'])
  assert.deepEqual(ids(projectTimelineView(input, withFilters([{ columnId: 'status', values: ['done', 'open'] }]))), ['p1', 'a', 'b', 'p2', 'c', 'd'])
  // An empty list matches no row; filters combine with each other and with the search.
  assert.deepEqual(ids(projectTimelineView(input, withFilters([{ columnId: 'status', values: [] }]))), [])
  const both = withFilters([{ columnId: 'status', values: ['open'] }, { columnId: 'owner', text: 'dee' }])
  assert.deepEqual(ids(projectTimelineView(input, both)), ['p2', 'd'])
  const searched = withFilters([{ columnId: 'status', values: ['open', 'late'] }], { search: { text: 'gamma' } })
  assert.deepEqual(projectTimelineView(input, searched).matchedRowIds, ['c', 'c1'])
})

test('the row label column filters and sorts by label; unknown filter columns are diagnosed and ignored', () => {
  assert.equal(timelineLabelColumnId, '$label')
  assert.deepEqual(ids(projectTimelineView(input, withFilters([{ columnId: '$label', text: 'BETA' }]))), ['p1', 'b'])
  const sorted = projectTimelineView(input, withFilters([], { sort: [{ ruleId: '$label', direction: 'desc' }] }))
  assert.deepEqual(ids(sorted), ['p2', 'c', 'c1', 'd', 'p1', 'b', 'a'])
  const unknown = projectTimelineView(input, withFilters([{ columnId: 'gone', text: 'x' }]))
  assert.equal(unknown.rows.length, rows.length)
  assert.deepEqual(unknown.diagnostics.map(item => [item.code, item.id]), [['unknown-column', 'gone']])
  // A blank text with no value list is no condition.
  assert.equal(projectTimelineView(input, withFilters([{ columnId: 'owner', text: '   ' }])).rows.length, rows.length)
})

test('sorting stays within siblings, also after filtering', () => {
  const state = withFilters([{ columnId: 'status', values: ['open', 'late'] }], { sort: [{ ruleId: 'owner', direction: 'asc' }] })
  // Siblings sort by owner (empty first), children stay under their parents.
  assert.deepEqual(ids(projectTimelineView(input, state)), ['p1', 'b', 'p2', 'c', 'c1', 'd'])
})

test('nextTimelineSort cycles ascending, descending and none for one column', () => {
  assert.deepEqual(nextTimelineSort([], 'owner'), [{ ruleId: 'owner', direction: 'asc' }])
  assert.deepEqual(nextTimelineSort([{ ruleId: 'owner', direction: 'asc' }], 'owner'), [{ ruleId: 'owner', direction: 'desc' }])
  assert.deepEqual(nextTimelineSort([{ ruleId: 'owner', direction: 'desc' }], 'owner'), [])
})

test('nextTimelineSort keeps the other rules and rotates only the activated column', () => {
  const several = Object.freeze([Object.freeze({ ruleId: 'status', direction: 'asc' }), Object.freeze({ ruleId: 'owner', direction: 'desc' })])
  // The primary rule turns descending in place; the secondary rule stays.
  assert.deepEqual(nextTimelineSort(several, 'status'), [{ ruleId: 'status', direction: 'desc' }, { ruleId: 'owner', direction: 'desc' }])
  // A descending secondary rule is removed; the primary rule stays.
  assert.deepEqual(nextTimelineSort(several, 'owner'), [{ ruleId: 'status', direction: 'asc' }])
  // A column without a rule becomes the primary rule, ascending, before the existing rules.
  assert.deepEqual(nextTimelineSort(several, 'start'), [
    { ruleId: 'start', direction: 'asc' }, { ruleId: 'status', direction: 'asc' }, { ruleId: 'owner', direction: 'desc' },
  ])
  const result = nextTimelineSort(several, 'start')
  assert.notEqual(result[1], several[0])
  assert.deepEqual(several, [{ ruleId: 'status', direction: 'asc' }, { ruleId: 'owner', direction: 'desc' }])
})

test('parseTimelineViewState keeps states saved without filters and round-trips filters', () => {
  const old = JSON.parse(JSON.stringify(createTimelineViewState(columns)))
  assert.equal('filters' in old, false)
  const parsed = parseTimelineViewState(old)
  assert.deepEqual(parsed, old)
  assert.equal('filters' in parsed, false)
  const state = withFilters([{ columnId: 'owner', text: 'an' }, { columnId: 'status', values: ['open', 3] }, { columnId: '$label' }])
  assert.deepEqual(parseTimelineViewState(JSON.parse(JSON.stringify(state))), state)
  assert.throws(() => parseTimelineViewState({ ...state, filters: {} }), /filters/)
  assert.throws(() => parseTimelineViewState({ ...state, filters: [{ text: 'x' }] }), /filter column/)
  assert.throws(() => parseTimelineViewState({ ...state, filters: [{ columnId: 'a', text: 3 }] }), /filter text/)
  assert.throws(() => parseTimelineViewState({ ...state, filters: [{ columnId: 'a', values: [null] }] }), /filter value/)
  assert.throws(() => parseTimelineViewState({ ...state, filters: [{ columnId: 'a', values: 'open' }] }), /filter values/)
})

test('useTimelineView sets and clears filters immutably', () => {
  const view = useTimelineView(input)
  const filters = [{ columnId: 'owner', text: 'ana' }]
  view.setFilters(filters)
  assert.deepEqual(ids(view.projection.value), ['p1', 'a', 'p2', 'c', 'c1'])
  assert.notEqual(view.state.value.filters[0], filters[0])
  assert.deepEqual(view.snapshot().filters, filters)
  view.setFilters([])
  assert.equal('filters' in view.state.value, false)
  assert.equal(view.projection.value.rows.length, rows.length)
})
