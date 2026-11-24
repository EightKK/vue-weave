import assert from 'node:assert/strict'
import { test } from 'node:test'
import { h } from 'vue'
import { GraphPalette } from '@eightkk/vue-weave'
import { renderComponent } from './helpers/ssr.mjs'
import { assertIdsResolve, renderStable } from './helpers/ssr-checks.mjs'

const items = [
  { id: 'start', label: 'Start', shape: 'ellipse', tone: 'teal', section: 'Flow' },
  { id: 'decision', label: 'Decision', detail: 'Branch', shape: 'diamond', section: 'Flow', keywords: ['gateway'] },
  { id: 'store', label: 'Data store', shape: 'hexagon', section: 'Data' },
  { id: 'note', label: 'Note', disabled: true },
]
const render = (props = {}, slots) => renderStable(() => renderComponent(GraphPalette, { items, ...props }, slots))

test('GraphPalette renders on the server without browser globals, identically on every render', async () => {
  const html = await render()
  assert.match(html, /^<div class="vw-palette"/)
  assertIdsResolve(html)
})

test('the palette is a listbox of options with one tab stop and named groups', async () => {
  const html = await render()
  assert.match(html, /role="listbox" aria-label="Shape palette" aria-orientation="vertical"/)
  assert.equal(html.match(/role="option"/g).length, 4)
  assert.equal(html.match(/tabindex="0"/g).length, 1)
  assert.equal(html.match(/aria-selected="true"/g).length, 1)
  assert.equal(html.match(/role="group"/g).length, 2)
  // Each group is named by its heading, and every option has text content for its accessible name.
  for (const match of html.matchAll(/role="group"[^>]*aria-labelledby="([^"]+)"/g)) assert.match(html, new RegExp(`id="${match[1]}"[^>]*>(Flow|Data)<`))
  for (const label of ['Start', 'Decision', 'Data store', 'Note']) assert.match(html, new RegExp(`class="vw-palette-label">${label}<`))
  assert.match(html, /aria-disabled="true" draggable="false"/)
  assert.equal(html.match(/draggable="true"/g).length, 3)
  assert.doesNotMatch(html, /vw-palette-search/)
})

test('searchable adds a filter box that controls the list, and labels rename it', async () => {
  const html = await render({ searchable: true, labels: { region: 'Formen', search: 'Formen filtern', noMatches: 'Keine' } })
  assert.match(html, /<input class="vw-palette-search" type="search"[^>]*aria-label="Formen filtern"/)
  assert.match(html, /aria-label="Formen" aria-orientation/)
  const controls = html.match(/<input[^>]*aria-controls="([^"]+)"/)[1]
  assert.match(html, new RegExp(`<div id="${controls}"[^>]*role="listbox"`))
  assertIdsResolve(html)
})

test('right-to-left writes dir="rtl" and vw-rtl, auto writes nothing', async () => {
  const rtl = await render({ dir: 'rtl' })
  assert.match(rtl, /class="vw-palette vw-rtl" dir="rtl"|dir="rtl" class="vw-palette vw-rtl"/)
  assertIdsResolve(rtl)
  assert.doesNotMatch(await render(), /dir="|vw-rtl/)
  assert.doesNotMatch(await render({ dir: 'auto' }), /dir="|vw-rtl/)
})

test('the item slot replaces the preview and text but keeps the option', async () => {
  const html = await render({}, { item: ({ item, active }) => h('b', `${item.label} ${active}`) })
  assert.match(html, /role="option"[^>]*>(<!--\[-->)?<b>Start true<\/b>/)
  assert.match(html, /<b>Decision false<\/b>/)
  assert.doesNotMatch(html, /vw-palette-preview/)
  assert.equal(html.match(/role="option"/g).length, 4)
})

test('items without a section have no group, and every tone and shape renders', async () => {
  const flat = await render({ items: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B', tone: 'amber', shape: 'diamond' }] })
  assert.doesNotMatch(flat, /role="group"/)
  assert.match(flat, /vw-tone-amber/)
  assert.equal(flat.match(/tabindex="0"/g).length, 1)
})

test('empty items render an empty listbox, and an all-disabled palette keeps a tab stop off the options', async () => {
  const none = await render({ items: [], searchable: true })
  assert.match(none, /role="listbox"/)
  assert.doesNotMatch(none, /role="option"/)
  assertIdsResolve(none)
  const disabled = await render({ items: [{ id: 'a', label: 'A', disabled: true }] })
  assert.match(disabled, /aria-disabled="true"/)
  assert.doesNotMatch(disabled, /draggable="true"/)
})

test('invalid and duplicate item IDs reject the render', async () => {
  await assert.rejects(renderComponent(GraphPalette, { items: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }] }), { message: /Duplicate palette item ID/ })
  await assert.rejects(renderComponent(GraphPalette, { items: [{ id: '', label: 'A' }] }), { message: 'Invalid palette item ID: ""' })
})
