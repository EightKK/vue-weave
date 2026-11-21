import assert from 'node:assert/strict'
import { test } from 'node:test'
import { graphPaletteMimeType } from '@eightkk/vue-weave/core'
import { GraphPalette, PropertyInspector, readPaletteDrop } from '@eightkk/vue-weave'
import { renderComponent } from './helpers/ssr.mjs'

const templates = [
  { id: 'start', label: 'Start', shape: 'ellipse', tone: 'teal', section: 'Flow' },
  { id: 'decision', label: 'Decision', detail: 'Branch', shape: 'diamond', section: 'Flow' },
  { id: 'store', label: 'Data store', shape: 'hexagon', section: 'Data', data: { kind: 'data' } },
  { id: 'note', label: 'Note', shape: 'rounded', disabled: true },
]

const transfer = entries => ({ getData: type => entries[type] ?? '' })

test('GraphPalette renders a listbox with sections, previews and one tab stop on the server', async () => {
  const html = await renderComponent(GraphPalette, { items: templates })
  assert.match(html, /role="listbox" aria-label="Shape palette" aria-orientation="vertical"/)
  assert.equal(html.match(/role="option"/g).length, 4)
  assert.equal(html.match(/tabindex="0"/g).length, 1)
  assert.equal(html.match(/tabindex="-1"/g).length, 3)
  // Sections appear in the order of their first item; an item without a section is listed without a heading.
  assert.ok(html.indexOf('>Flow<') < html.indexOf('>Data<'))
  assert.equal(html.match(/role="group"/g).length, 2)
  assert.match(html, /<div [^>]*class="vw-palette-heading" role="presentation">Flow<\/div>/)
  // The previews reuse the node outlines: an ellipse, a diamond, a hexagon and a rounded rectangle.
  assert.match(html, /<ellipse cx="24" cy="15" rx="22" ry="13"><\/ellipse>/)
  assert.match(html, /<polygon points="24,2 46,15 24,28 2,15"><\/polygon>/)
  assert.match(html, /<rect x="2" y="2" width="44" height="26" rx="10"><\/rect>/)
  assert.match(html, /class="vw-palette-preview vw-tone-teal"/)
  assert.match(html, /<span class="vw-palette-detail">Branch<\/span>/)
  assert.match(html, /aria-disabled="true" draggable="false"/)
  assert.equal(html.match(/draggable="true"/g).length, 3)
  assert.doesNotMatch(html, /vw-palette-search|NaN/)
})

test('GraphPalette filter box, labels, direction and the item slot are opt-in', async () => {
  const { h } = await import('vue')
  const html = await renderComponent(GraphPalette, {
    items: templates, searchable: true, dir: 'rtl', labels: { region: 'Shapes', search: 'Find a shape' },
  }, { item: ({ item, active }) => h('b', { class: 'custom' }, item.label + (active ? ' *' : '')) })
  assert.match(html, /<div class="vw-palette vw-rtl" dir="rtl">/)
  assert.match(html, /<input class="vw-palette-search" type="search"[^>]*aria-label="Find a shape"[^>]*aria-controls="([^"]+)"/)
  const controls = html.match(/aria-controls="([^"]+)"/)[1]
  assert.match(html, new RegExp(`id="${controls}" class="vw-palette-list" role="listbox" aria-label="Shapes"`))
  assert.match(html, /<b class="custom">Start \*<\/b>/)
  assert.match(html, /<b class="custom">Decision<\/b>/)
  assert.doesNotMatch(html, /vw-palette-preview/)
  const auto = await renderComponent(GraphPalette, { items: templates, dir: 'auto' })
  assert.match(auto, /<div class="vw-palette">/)
})

test('GraphPalette rejects invalid and duplicate item IDs', async () => {
  await assert.rejects(renderComponent(GraphPalette, { items: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }] }), {
    name: 'Error', message: 'Duplicate palette item ID: a',
  })
  await assert.rejects(renderComponent(GraphPalette, { items: [{ id: '', label: 'A' }] }), { message: 'Invalid palette item ID: ""' })
  assert.match(await renderComponent(GraphPalette, { items: [] }), /role="listbox"/)
})

test('readPaletteDrop reads the JSON payload of a palette drag and ignores anything else', () => {
  assert.equal(graphPaletteMimeType, 'application/x-vue-weave-palette+json')
  const payload = { [graphPaletteMimeType]: JSON.stringify({ id: 'store', data: { kind: 'data' } }) }
  const drop = { point: { x: 0, y: 0 }, clientX: 0, clientY: 0, dataTransfer: transfer(payload) }
  assert.deepEqual(readPaletteDrop(drop), { id: 'store', data: { kind: 'data' } })
  // A DataTransfer itself, or a GanttChart bar drop, works the same way.
  assert.deepEqual(readPaletteDrop(transfer(payload)), { id: 'store', data: { kind: 'data' } })
  assert.deepEqual(readPaletteDrop({ time: 5, clientX: 0, clientY: 0, dataTransfer: transfer({ [graphPaletteMimeType]: '{"id":"a"}' }) }), { id: 'a' })
  for (const text of ['', 'not json', '"a"', '[1]', 'null', '{"id":""}', '{"id":3}', '{"data":1}']) {
    assert.equal(readPaletteDrop(transfer({ [graphPaletteMimeType]: text })), undefined, text)
  }
  assert.equal(readPaletteDrop(transfer({ 'text/plain': '{"id":"a"}' })), undefined)
  assert.equal(readPaletteDrop({ dataTransfer: null }), undefined)
  assert.equal(readPaletteDrop(null), undefined)
  assert.equal(readPaletteDrop(undefined), undefined)
  assert.equal(readPaletteDrop({ getData: () => { throw new Error('protected') } }), undefined)
})

const node = { id: 'n1', label: 'Check', detail: '', tone: 'teal', done: true, accent: '#AABBCC', width: 144 }
const fields = [
  { id: 'id', kind: 'text', label: 'ID', get: item => item.id, readonly: true },
  { id: 'label', kind: 'text', label: 'Label', get: item => item.label, required: true, description: 'Shown in the node' },
  { id: 'tone', kind: 'select', label: 'Colour', get: item => item.tone, choices: [{ value: 'teal', label: 'Teal' }, { value: 'blue' }] },
  { id: 'done', kind: 'checkbox', label: 'Done', get: item => item.done },
  { id: 'accent', kind: 'color', label: 'Accent', get: item => item.accent },
  { id: 'width', kind: 'number', label: 'Width', get: item => item.width, integer: true },
  { id: 'due', kind: 'time', label: 'Due', get: () => Date.UTC(2026, 0, 2, 9), utcOffsetMinutes: 0 },
]

test('PropertyInspector renders a labelled control for each typed field on the server', async () => {
  const html = await renderComponent(PropertyInspector, { item: node, fields })
  assert.match(html, /^<form class="vw-inspector" aria-label="Properties" novalidate>/)
  const ids = [...html.matchAll(/<label class="vw-inspector-label" for="([^"]+)">([^<]+)<\/label>/g)].map(match => [match[1], match[2]])
  assert.deepEqual(ids.map(([, label]) => label), ['ID', 'Label', 'Colour', 'Done', 'Accent', 'Width', 'Due'])
  for (const [id] of ids) assert.match(html, new RegExp(`<(input|select) id="${id}"`))
  assert.match(html, /<input id="[^"]+" class="vw-inspector-input" type="text" autocomplete="off" value="n1" readonly>/)
  assert.match(html, /value="Check" aria-describedby="([^"]+-description)" aria-required="true">/)
  const described = html.match(/aria-describedby="([^"]+-description)"/)[1]
  assert.match(html, new RegExp(`<p id="${described}" class="vw-inspector-description">Shown in the node</p>`))
  // The select lists the choices by label, with an empty choice for an optional field, and marks the current one.
  assert.match(html, /<option value>\(none\)<\/option><!--\[--><option value="0" selected>Teal<\/option><option value="1">blue<\/option>/)
  assert.match(html, /class="vw-inspector-check" type="checkbox" checked>/)
  // Colours are shown as lowercase #rrggbb; numbers keep a text input that reads decimal text.
  assert.match(html, /type="color" value="#aabbcc">/)
  assert.match(html, /inputmode="decimal" value="144"/)
  assert.match(html, /value="2026-01-02 09:00"/)
  assert.match(html, /class="vw-inspector-field vw-is-text vw-is-readonly"/)
  assert.doesNotMatch(html, /role="alert"|aria-invalid/)
})

test('PropertyInspector shows the empty state, labels, direction and field slots', async () => {
  const { h } = await import('vue')
  const empty = await renderComponent(PropertyInspector, { item: null, fields, labels: { region: 'Node properties', empty: 'Pick a node.' }, dir: 'rtl' })
  assert.equal(empty, '<form class="vw-inspector vw-rtl" dir="rtl" aria-label="Node properties" novalidate><p class="vw-inspector-empty"><!--[-->Pick a node.<!--]--></p></form>')
  const slotted = await renderComponent(PropertyInspector, { item: node, fields }, {
    'field-label': props => h('output', { id: props.inputId, 'data-text': props.text, 'data-readonly': String(props.readonly) }, props.field.label),
    empty: () => 'unused',
  })
  assert.match(slotted, /<output id="[^"]+" data-text="Check" data-readonly="false">Label<\/output>/)
  assert.doesNotMatch(slotted, /value="Check"/)
  const none = await renderComponent(PropertyInspector, { fields }, { empty: () => h('em', 'Nothing here') })
  assert.match(none, /<p class="vw-inspector-empty"><!--\[--><em>Nothing here<\/em><!--\]--><\/p>/)
})

test('PropertyInspector rejects invalid field definitions', async () => {
  const render = list => renderComponent(PropertyInspector, { item: node, fields: list })
  await assert.rejects(render([fields[1], fields[1]]), { name: 'Error', message: 'Duplicate inspector field ID: label' })
  await assert.rejects(render([{ ...fields[1], id: '' }]), { message: 'Invalid inspector field ID: ""' })
  await assert.rejects(render([{ ...fields[1], kind: 'slider' }]), { name: 'RangeError', message: 'Unknown inspector field kind: slider (field label)' })
  await assert.rejects(render([{ id: 's', kind: 'select', label: 'S', get: () => null }]), { name: 'Error', message: 'A select field needs choices: s' })
  await assert.rejects(render([{ ...fields[5], min: 10, max: 1 }]), { name: 'RangeError', message: 'Field min exceeds max: width' })
})
