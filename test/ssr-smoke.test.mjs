import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { NetworkGraph, GanttChart } from '@eightkk/vue-weave'
import { renderComponent } from './helpers/ssr.mjs'

const nodes = (...ids) => ids.map(id => ({ id, label: id }))

test('both components render on the server and accept empty collections', async () => {
  const app = createSSRApp({ render: () => h('div', [
    h(NetworkGraph, { nodes: [], edges: [] }),
    h(GanttChart, { rows: [], bars: [], range: { start: 0, end: 3600000 } }),
  ]) })
  const html = await renderToString(app)
  assert.match(html, /No nodes to display/)
  assert.match(html, /No rows to display/)
})

test('slots and labels survive SSR through the public package entry', async () => {
  const html = await renderComponent(NetworkGraph,
    { nodes: nodes('a'), edges: [], labels: { region: 'Dependency explorer' } },
    { node: ({ node }) => h('text', node.label + ' customized') },
  )
  assert.match(html, /Dependency explorer/)
  assert.match(html, /a customized/)
})
