import assert from 'node:assert/strict'
import { test } from 'node:test'
import { h } from 'vue'
import { GanttChart } from '@eightkk/vue-weave'
import { renderComponent } from './helpers/ssr.mjs'
import { assertIdsResolve, renderStable } from './helpers/ssr-checks.mjs'
import { hour } from './helpers/time.mjs'

const rows = [{ id: 'plan', label: 'Plan' }, { id: 'build', label: 'Build', parentId: 'plan' }, { id: 'ship', label: 'Ship' }]
const bars = [
  { id: 'a', rowId: 'plan', label: 'Draft', start: hour, end: 3 * hour, editable: true, progress: 0.4, tone: 'teal' },
  { id: 'b', rowId: 'build', label: 'Code', start: 3 * hour, end: 6 * hour, editable: true },
  { id: 'm', rowId: 'ship', label: 'Release', start: 7 * hour, end: 7 * hour },
]
const dependencies = [{ id: 'd', from: 'a', to: 'b' }]
const range = { start: 0, end: 8 * hour }
const base = { rows, bars, range }
const render = (props = {}, slots) => renderStable(() => renderComponent(GanttChart, { ...base, ...props }, slots))

test('GanttChart renders on the server without browser globals, identically on every render', async () => {
  const html = await render({ dependencies })
  assert.match(html, /^<div class="vw-gantt"/)
  assertIdsResolve(html)
})

test('GanttChart output has the region, bar names, row headings, zoom group and edit hint', async () => {
  const html = await render({ dependencies })
  assert.match(html, /role="region" aria-label="Gantt chart" tabindex="0"/)
  assert.match(html, /role="group" aria-label="Timeline zoom"/)
  assert.match(html, /aria-label="Zoom out"/)
  assert.match(html, /aria-label="Zoom in"/)
  assert.match(html, /aria-label="Draft 01:00–03:00" aria-pressed="false" aria-describedby="[^"]+-hint"/)
  assert.match(html, /aria-label="Code 03:00–06:00"/)
  assert.match(html, /aria-label="Release 07:00/)
  for (const label of ['Plan', 'Build', 'Ship']) assert.match(html, new RegExp(`<strong>${label}</strong>`))
  assert.match(html, /class="vw-sr-only">Arrow keys move\./)
  assert.match(html, /aria-live="polite"/)
  assert.ok(html.indexOf('>Plan<') < html.indexOf('>Build<') && html.indexOf('>Build<') < html.indexOf('>Ship<'))
})

test('GanttChart labels are opt-in text', async () => {
  const html = await render({ labels: { region: 'Zeitplan' } })
  assert.match(html, /aria-label="Zeitplan"/)
  assert.doesNotMatch(html, /aria-label="Gantt chart"/)
})

test('GanttChart renders right-to-left with dir="rtl" and the same accessible names', async () => {
  const ltr = await render({ dependencies })
  const rtl = await render({ dependencies, dir: 'rtl' })
  assert.match(rtl, /class="vw-gantt vw-rtl" dir="rtl"|dir="rtl" class="vw-gantt vw-rtl"/)
  assert.doesNotMatch(ltr, /dir="rtl"/)
  assert.match(rtl, /aria-label="Draft 01:00–03:00"/)
  assert.match(rtl, /right:calc\(var\(--vw-label-area-width\)/)
  assert.doesNotMatch(rtl, /left:calc\(var\(--vw-label-area-width\)/)
  assertIdsResolve(rtl)
  // `auto` cannot know the inherited direction on the server, so it writes nothing.
  assert.doesNotMatch(await render({ dir: 'auto' }), /dir="|vw-rtl/)
})

test('GanttChart main opt-in props reach the server output', async () => {
  const withProgress = await render({ progressEditable: true })
  assert.match(withProgress, /Progress of Draft/)
  const columns = await render({ columns: [{ id: 'owner', label: 'Owner', width: 90, value: row => row.id.toUpperCase() }] })
  assert.match(columns, />Owner</)
  assert.match(columns, />PLAN</)
  const slotted = await render({}, { bar: ({ bar }) => h('b', bar.label + ' slot') })
  assert.match(slotted, /<b>Draft slot<\/b>/)
})

test('GanttChart accepts empty rows and bars and renders its empty state', async () => {
  const none = await renderStable(() => renderComponent(GanttChart, { rows: [], bars: [], range }))
  assert.match(none, /No rows to display/)
  assertIdsResolve(none)
  const noBars = await renderStable(() => renderComponent(GanttChart, { rows, bars: [], range }))
  assert.match(noBars, /<strong>Plan<\/strong>/)
  assert.doesNotMatch(noBars, /data-vw-bar/)
})

test('GanttChart rejects bad data while rendering', async () => {
  await assert.rejects(renderComponent(GanttChart, { rows, bars: [...bars, { ...bars[0] }], range }), { name: 'Error', message: /Duplicate/ })
  await assert.rejects(renderComponent(GanttChart, { rows, bars: [{ ...bars[0], rowId: 'missing' }], range }), { name: 'Error', message: /Unknown row/ })
})
