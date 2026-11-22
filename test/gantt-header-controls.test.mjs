import assert from 'node:assert/strict'
import { test } from 'node:test'
import { GanttChart } from '@eightkk/vue-weave'
import { renderComponent } from './helpers/ssr.mjs'

const hour = 3_600_000
const rows = [{ id: 'r1', label: 'Line A' }, { id: 'r2', label: 'Line B' }]
const bars = [{ id: 'b', rowId: 'r1', label: 'Cut', start: 0, end: hour }]
const columns = [
  { id: 'owner', label: 'Owner', width: 90, value: () => 'Ana' },
  {
    id: 'state', label: 'State', width: 80, value: () => 'Open',
    field: { id: 'state', kind: 'select', get: () => 'open', choices: [{ value: 'open', label: 'Open' }, { value: 'done', label: 'Done' }] },
  },
]
const render = (props, slots) => renderComponent(GanttChart, { rows, bars, columns, range: { start: 0, end: 4 * hour }, ...props }, slots)

test('GanttChart header markup is unchanged without sortableColumns and filterableColumns', async () => {
  const plain = await render({})
  assert.doesNotMatch(plain, /columnheader|aria-sort|vw-column-sort|vw-column-filter|data-vw-header/)
  assert.equal(await render({ sortableColumns: false, filterableColumns: false, sort: [], filters: [] }), plain)
  assert.equal(await render({ sortableColumns: [], filterableColumns: [] }), plain)
})

test('GanttChart sortableColumns renders sort buttons whose names carry the controlled sort', async () => {
  const html = await render({ sortableColumns: true, sort: [{ ruleId: 'owner', direction: 'desc' }, { ruleId: 'state', direction: 'asc' }] })
  // The header is not a table row: no columnheader role or aria-sort; the sort state is in the button names.
  assert.doesNotMatch(html, /role="columnheader"|aria-sort/)
  const headers = [...html.matchAll(/<div class="([^"]+)"[^>]*data-vw-header="([^"]+)"/g)]
  assert.deepEqual(headers.map(match => match[2]), ['$label', 'owner', 'state'])
  assert.match(headers[0][1], /vw-name-column vw-header-controls/)
  assert.match(html, /<button type="button" class="vw-column-sort" aria-label="Sort by Rows">/)
  assert.match(html, /<button type="button" class="vw-column-sort vw-is-sorted" aria-label="Sort by Owner \(descending\)"><span class="vw-column-title"><!--\[-->Owner<!--\]--><\/span><span class="vw-sort-indicator" aria-hidden="true">▼<\/span>/)
  // A secondary rule shows its direction too.
  assert.match(html, /<button type="button" class="vw-column-sort vw-is-sorted" aria-label="Sort by State \(ascending\)">[^]*?aria-hidden="true">▲<\/span>/)
  assert.equal(html.match(/aria-hidden="true">↕</g).length, 1)
  assert.doesNotMatch(html, /vw-column-filter/)
  // A list names the columns; labels rename the buttons; the row heading slot stays in the label column's button.
  const { h } = await import('vue')
  const some = await render({ sortableColumns: ['state'], labels: { sortBy: 'Order by' } }, { 'row-heading': () => h('em', 'Tasks') })
  assert.deepEqual([...some.matchAll(/aria-label="(Order by [^"]+)"/g)].map(match => match[1]), ['Order by State'])
  assert.match(some, /<div class="vw-name-column"><!--\[--><em>Tasks<\/em><!--\]--><\/div>/)
  assert.match(some, /<div class="vw-extra-column" style="width:90px;"><!--\[-->Owner<!--\]--><\/div>/)
  const label = await render({
    sortableColumns: ['$label'], sort: [{ ruleId: '$label', direction: 'asc' }], labels: { sortedAscending: 'A to Z' },
  }, { 'row-heading': () => h('em', 'Tasks') })
  assert.match(label, /data-vw-header="\$label"><!--\[--><button type="button" class="vw-column-sort vw-is-sorted" aria-label="Sort by Rows \(A to Z\)"><span class="vw-column-title"><!--\[--><em>Tasks<\/em><!--\]--><\/span>/)
})

test('GanttChart filterableColumns renders filter buttons without the dialog on the server', async () => {
  const html = await render({ filterableColumns: ['owner', 'state'], filters: [{ columnId: 'state', values: ['done'] }], dir: 'rtl' })
  assert.match(html, /data-vw-header="owner"><!--\[--><span class="vw-column-title"><!--\[-->Owner<!--\]--><\/span><!--\[--><button type="button" class="vw-column-filter" data-vw-column-filter aria-haspopup="dialog" aria-expanded="false" aria-label="Filter Owner">/)
  assert.match(html, /class="vw-column-filter vw-is-active"[^>]*aria-label="Filter State \(filtered\)"/)
  assert.doesNotMatch(html, /aria-sort|role="columnheader"|role="dialog"|vw-column-filter-popover/)
  assert.match(html, /<div class="vw-name-column"><!--\[-->Rows<!--\]--><\/div>/)
})

test('GanttChart reserves the label column ID for header controls', async () => {
  const errors = []
  const bad = [{ id: '$label', label: 'X', width: 40, value: () => '' }]
  await render({ columns: bad, sortableColumns: true, onValidationError: error => errors.push(error.message) }).catch(() => {})
  assert.deepEqual(errors, ['The column ID is reserved for the row label column: $label'])
  // Empty lists name no column, so the label column is not addressed and its ID is free.
  const html = await render({ columns: bad, sortableColumns: [], filterableColumns: [], onValidationError: error => errors.push(error.message) })
  assert.match(html, /vw-gantt-canvas/)
  assert.equal(errors.length, 1)
})

test('GanttChart reports unknown column IDs in sortableColumns and filterableColumns', async () => {
  for (const [props, message] of [
    [{ sortableColumns: ['owner', 'finish'] }, 'Unknown column in sortableColumns: finish'],
    [{ filterableColumns: ['$label', 'nope'] }, 'Unknown column in filterableColumns: nope'],
  ]) {
    const errors = []
    await render({ ...props, onValidationError: error => errors.push(error.message) }).catch(() => {})
    assert.deepEqual(errors, [message])
  }
  // Known IDs, including the row label column, are fine.
  const errors = []
  await render({ sortableColumns: ['$label', 'state'], filterableColumns: ['owner'], onValidationError: error => errors.push(error.message) })
  assert.deepEqual(errors, [])
})
