import assert from 'node:assert/strict'
import { test } from 'node:test'
import { h } from 'vue'
import { PropertyInspector } from '@eightkk/vue-weave'
import { renderComponent } from './helpers/ssr.mjs'
import { assertIdsResolve, renderStable } from './helpers/ssr-checks.mjs'

const hour = 3_600_000
const item = {
  id: 'n1', label: 'Check', tone: 'teal', done: true, accent: '#AABBCC', width: 144, tags: ['a'],
  assignments: [{ resourceId: 'crane', units: 1 }], links: [{ predecessorId: 'design', type: 'FS', lag: hour }],
}
const fields = [
  { id: 'id', kind: 'text', label: 'ID', get: node => node.id, readonly: true },
  { id: 'label', kind: 'text', label: 'Label', get: node => node.label, required: true, description: 'Shown in the node' },
  { id: 'tone', kind: 'select', label: 'Colour', get: node => node.tone, choices: [{ value: 'teal', label: 'Teal' }, { value: 'blue' }] },
  { id: 'done', kind: 'checkbox', label: 'Done', get: node => node.done },
  { id: 'accent', kind: 'color', label: 'Accent', get: node => node.accent },
  { id: 'width', kind: 'number', label: 'Width', get: node => node.width, integer: true, min: 10, max: 400 },
]
const listFields = [
  { id: 'assignments', kind: 'assignments', label: 'Resources', get: node => node.assignments, options: [{ value: 'crane', label: 'Crane' }, { value: 'crew', label: 'Crew' }] },
  { id: 'links', kind: 'dependencies', label: 'Predecessors', get: node => node.links, options: [{ value: 'design', label: 'Design' }], lagUnitSize: hour, lagUnitLabel: 'h' },
]
const render = (props = {}, slots) => renderStable(() => renderComponent(PropertyInspector, { item, fields, ...props }, slots))

test('PropertyInspector renders on the server without browser globals, identically on every render', async () => {
  const html = await render()
  assert.match(html, /^<form class="vw-inspector" aria-label="Properties" novalidate>/)
  assertIdsResolve(html)
})

test('every field control is named by its label element and described by its description', async () => {
  const html = await render()
  const labels = [...html.matchAll(/<label class="vw-inspector-label" for="([^"]+)">([^<]+)<\/label>/g)]
  assert.deepEqual(labels.map(match => match[2]), ['ID', 'Label', 'Colour', 'Done', 'Accent', 'Width'])
  for (const [, id] of labels) assert.match(html, new RegExp(`<(input|select) id="${id}"`))
  assert.match(html, /value="n1" readonly>/)
  assert.match(html, /aria-describedby="([^"]+-description)" aria-required="true">/)
  assert.match(html, /<option value="0" selected>Teal<\/option>/)
  assert.match(html, /type="checkbox" checked>/)
  assert.match(html, /type="color" value="#aabbcc">/)
  assert.match(html, /inputmode="decimal" value="144"/)
  assert.doesNotMatch(html, /role="alert"|aria-invalid/)
})

test('list fields render a named group with per-row names and an add button', async () => {
  const html = await render({ fields: [...fields, ...listFields] })
  assert.match(html, /role="group"[^>]*aria-label="Resources"|aria-label="Resources"[^>]*role="group"|role="group"[^>]*aria-labelledby/)
  for (const name of ['Resource for Crane', 'Units for Crane', 'Remove Crane', 'Type for Design', 'Lag for Design']) {
    assert.match(html, new RegExp(`aria-label="${name}"`), name)
  }
  for (const name of ['Add assignment', 'Add dependency']) assert.match(html, new RegExp(`<button type="button" class="vw-inspector-add"[^>]*>${name}</button>`), name)
  assert.match(html, /class="vw-inspector-unit" aria-hidden="true">h</)
  assertIdsResolve(html)
  const none = await render({ item: { ...item, assignments: [], links: [] }, fields: listFields })
  assert.match(none, />None</)
  assert.doesNotMatch(none, /Remove /)
})

test('read-only fields and list fields disable their controls', async () => {
  const html = await render({ fields: [{ id: 'on', kind: 'checkbox', label: 'On', get: node => node.done, readonly: true }, { ...listFields[0], readonly: true }] })
  assert.match(html, /type="checkbox" checked disabled>/)
  assert.match(html, /<select class="vw-inspector-input" disabled aria-label="Resource for Crane"/)
  assert.match(html, /readonly value="1" aria-label="Units for Crane"/)
  // A read-only list offers no way to add or remove a row.
  assert.doesNotMatch(html, /vw-inspector-add|vw-inspector-remove/)
})

test('empty data shows the empty text or slot, and a form without fields renders', async () => {
  const empty = await render({ item: null, labels: { region: 'Node properties', empty: 'Pick a node.' } })
  assert.equal(empty, '<form class="vw-inspector" aria-label="Node properties" novalidate><p class="vw-inspector-empty"><!--[-->Pick a node.<!--]--></p></form>')
  const slot = await render({ item: undefined }, { empty: () => h('em', 'Nothing here') })
  assert.match(slot, /<em>Nothing here<\/em>/)
  const noFields = await render({ fields: [] })
  assert.match(noFields, /^<form class="vw-inspector"/)
  assert.doesNotMatch(noFields, /<input|<select/)
})

test('right-to-left writes dir="rtl" and vw-rtl on the form, auto writes nothing', async () => {
  const rtl = await render({ dir: 'rtl', fields: [...fields, ...listFields] })
  assert.match(rtl, /^<form class="vw-inspector vw-rtl" dir="rtl" aria-label="Properties" novalidate>/)
  assertIdsResolve(rtl)
  assert.doesNotMatch(await render({ dir: 'auto' }), /dir="|vw-rtl/)
  assert.doesNotMatch(await render({ dir: 'ltr' }), /vw-rtl/)
})

test('a field slot replaces the control and gets the input ID, text and read-only state', async () => {
  const html = await render({}, { 'field-label': slot => h('output', { id: slot.inputId, 'data-text': slot.text, 'data-readonly': String(slot.readonly) }, slot.field.label) })
  assert.match(html, /<output id="([^"]+)" data-text="Check" data-readonly="false">Label<\/output>/)
  const id = html.match(/<output id="([^"]+)"/)[1]
  assert.match(html, new RegExp(`<label class="vw-inspector-label" for="${id}">Label</label>`))
  assertIdsResolve(html)
})

test('two inspectors on one page get different IDs', async () => {
  const html = await renderStable(() => renderComponent({ render: () => h('div', [h(PropertyInspector, { item, fields }), h(PropertyInspector, { item, fields })]) }))
  assertIdsResolve(html)
})

test('invalid field definitions reject the render', async () => {
  const bad = list => renderComponent(PropertyInspector, { item, fields: list })
  await assert.rejects(bad([fields[1], fields[1]]), { message: /Duplicate/ })
  await assert.rejects(bad([{ id: 'x', kind: 'nope', label: 'X', get: () => 1 }]), { name: 'RangeError' })
  await assert.rejects(bad([{ id: 'x', kind: 'select', label: 'X', get: () => 1 }]), { name: 'Error' })
})
