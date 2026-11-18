import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createTimeScale, renderTimelineSvg } from 'vue-weave/core'
import { GanttChart } from 'vue-weave'
import { renderComponent } from './helpers/ssr.mjs'

const hour = 3_600_000
const rows = [{ id: 'r1', label: 'Row 1', data: { effort: 3 } }, { id: 'r2', label: 'Row 2', data: { effort: null } }]
const bars = [
  { id: 'a', rowId: 'r1', label: 'A', start: hour, end: 3 * hour, editable: true },
  { id: 'b', rowId: 'r2', label: 'B', start: 4 * hour, end: 6 * hour },
]
const dependencies = [{ id: 'ab', from: 'a', to: 'b' }]
const range = { start: 0, end: 10 * hour }
const plainColumn = { id: 'note', label: 'Note', width: 80, value: row => row.label, editable: true }
const effortField = { id: 'effort', kind: 'number', get: row => row.data.effort, min: 0 }
const fieldColumn = { id: 'effort', label: 'Effort', width: 80, value: row => String(row.data.effort ?? ''), editable: true, field: effortField }
const loadRows = [{ id: 'dev', label: 'Developers' }]
const loadSegments = [{ resourceId: 'dev', start: hour, end: 3 * hour, load: 2, capacity: 1 }]
const base = { rows, bars, dependencies, range, pixelsPerUnit: 10 / hour, columns: [plainColumn], loadRows, loadSegments, connectable: true }
const render = (props = {}, slots) => renderComponent(GanttChart, { ...base, ...props }, slots)

test('GanttChart server markup is identical when the new props are unset or at their defaults', async () => {
  const plain = await render()
  assert.equal(await render({ loadSelectable: false, droppable: true, validateFieldEdit: () => true, highlightedBarIds: new Set() }), plain)
  assert.equal(await render({ highlightedBarIds: undefined, loadSelectable: undefined }), plain)
  assert.equal(await render({ highlightedLoadTargets: [], selectedLoadTargets: [] }), plain)
  // A `cell-editor` slot changes nothing for a column without `field`.
  assert.equal(await render({}, { 'cell-editor': () => 'editor' }), plain)
  assert.doesNotMatch(plain, /vw-is-highlighted|vw-is-selectable|vw-field|data-vw-cell/)
  assert.match(plain, /class="vw-gantt-load-segment vw-is-overloaded" role="img" aria-label="Developers 01:00–03:00: load 2 \/ capacity 1, overloaded by 1"/)
})

test('highlightedBarIds marks bars only for display: no selection, no related dependency', async () => {
  const html = await render({ highlightedBarIds: new Set(['a', 'missing']) })
  const bar = html.match(/<button type="button" class="([^"]*)"[^>]*data-vw-bar="a"[^>]*>/)
  assert.ok(bar)
  assert.match(bar[1], /vw-is-highlighted/)
  assert.doesNotMatch(bar[1], /vw-is-selected/)
  assert.match(bar[0], /aria-pressed="false"/)
  assert.doesNotMatch(html, /data-vw-bar="b"[^>]*vw-is-highlighted|vw-is-highlighted[^>]*data-vw-bar="b"/)
  assert.doesNotMatch(html, /vw-is-related/)
})

test('loadSelectable turns load segments into focusable buttons with the same accessible name', async () => {
  const html = await render({ loadSelectable: true })
  assert.match(html, /class="vw-gantt-load-segment vw-is-overloaded vw-is-selectable" role="button" tabindex="0" aria-label="Developers 01:00–03:00: load 2 \/ capacity 1, overloaded by 1"/)
})

test('load targets mark the overlapping load segments without changing their accessible names', async () => {
  const segments = [
    { resourceId: 'dev', start: hour, end: 3 * hour, load: 2, capacity: 1 },
    { resourceId: 'dev', start: 3 * hour, end: 5 * hour, load: 1, capacity: 1 },
  ]
  const segmentTags = html => [...html.matchAll(/<div class="(vw-gantt-load-segment[^"]*)"[^>]*>/g)].map(match => match[0])
  // A target from an older load calculation still finds the current segment it overlaps; [3h, 4h) does not touch [1h, 3h).
  const marked = segmentTags(await render({
    loadSegments: segments,
    highlightedLoadTargets: [{ view: 'load', resourceId: 'dev', start: 2 * hour, end: 2.5 * hour }],
    selectedLoadTargets: [{ view: 'load', resourceId: 'dev', start: 3 * hour, end: 4 * hour }, { view: 'load', resourceId: 'other', start: 0, end: hour }],
  }))
  assert.equal(marked.length, 2)
  assert.match(marked[0], /class="vw-gantt-load-segment vw-is-overloaded vw-is-highlighted" role="img" aria-label="Developers 01:00–03:00: load 2 \/ capacity 1, overloaded by 1"/)
  assert.doesNotMatch(marked[0], /aria-pressed|vw-is-selected/)
  assert.match(marked[1], /class="vw-gantt-load-segment vw-is-selected" role="img" aria-label="Developers 03:00–05:00: load 1 \/ capacity 1"/)
  // With loadSelectable, the selected segment button reports its pressed state.
  const selectable = segmentTags(await render({
    loadSegments: segments, loadSelectable: true, selectedLoadTargets: [{ view: 'load', resourceId: 'dev', start: 3 * hour, end: 4 * hour }],
  }))
  assert.match(selectable[0], /role="button" tabindex="0" aria-pressed="false" aria-label="Developers 01:00–03:00/)
  assert.match(selectable[1], /vw-is-selected" role="button" tabindex="0" aria-pressed="true" aria-label="Developers 03:00–05:00/)
})

test('field columns use the cell slot first, then the cell-editor slot, then the built-in parsed input', async () => {
  const columns = [plainColumn, fieldColumn]
  const builtIn = await render({ columns })
  assert.match(builtIn, /<input class="vw-cell-input vw-field-input" type="text" data-vw-cell="\[&quot;r1&quot;,&quot;effort&quot;\]" aria-label="Row 1 · Effort" value="3">/)
  // `null` is the empty text, not "null".
  assert.match(builtIn, /aria-label="Row 2 · Effort" value>/)
  // The plain column keeps the legacy input.
  assert.match(builtIn, /<input class="vw-cell-input" type="text" aria-label="Row 1 · Note" value="Row 1">/)

  const slotted = await render({ columns }, { 'cell-editor': () => 'editor' })
  assert.match(slotted, /<button type="button" class="vw-field-cell" data-vw-cell="[^"]+" aria-label="Row 1 · Effort 3" title="3">3<\/button>/)
  assert.doesNotMatch(slotted, /editor/)

  const owned = await render({ columns }, { cell: ({ column, value }) => `cell ${column.id}=${value}`, 'cell-editor': () => 'editor' })
  assert.match(owned, /cell effort=3/)
  assert.doesNotMatch(owned, /vw-field-cell|vw-field-input/)

  // Read-only field cells render their text like legacy cells.
  const readonly = await render({ columns, readonly: true }, { 'cell-editor': () => 'editor' })
  assert.match(readonly, /<span title="3">3<\/span>/)
  assert.doesNotMatch(readonly, /vw-field/)
})

test('renderTimelineSvg outlines highlightedBarIds and is unchanged without them', () => {
  const scale = createTimeScale(range, 10 / hour)
  const plain = renderTimelineSvg(rows, bars, dependencies, scale)
  assert.equal(renderTimelineSvg(rows, bars, dependencies, scale, { highlightedBarIds: [] }), plain)
  const marked = renderTimelineSvg(rows, [...bars, { id: 'm', rowId: 'r2', label: 'M', start: 8 * hour, end: 8 * hour }], dependencies, scale, {
    highlightedBarIds: new Set(['a', 'm']),
  })
  assert.equal(marked.match(/<g class="vw-is-highlighted">/g)?.length, 2)
  assert.equal(marked.match(/class="vw-highlight"/g)?.length, 2)
  assert.match(marked, /stroke="#a74f08"/)
  assert.doesNotMatch(plain, /vw-highlight/)
})
