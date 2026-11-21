import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync } from 'node:child_process'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { GanttChart } from '@eightkk/vue-weave'
import { renderComponent } from './helpers/ssr.mjs'

test('invalid Gantt data reports validation-error and renders the empty state', async () => {
  const row = { id: 'r', label: 'Row' }
  const bar = { id: 'b', rowId: 'r', label: 'Bar', start: 0, end: 3600000 }
  const errors = []
  const props = { rows: [row], bars: [bar, bar], range: { start: 0, end: 7200000 }, onValidationError: error => errors.push(error) }
  // Vue rethrows handled errors in development builds and logs them in production, so allow either.
  const html = await renderComponent(GanttChart, props).catch(() => '')
  assert.equal(errors.length, 1)
  assert.equal(errors[0].message, 'Duplicate bar ID: b')
  assert.ok(!html.includes('vw-gantt-bar'))
  const valid = await renderComponent(GanttChart, { ...props, bars: [bar], onValidationError: () => assert.fail('unexpected') })
  assert.match(valid, /vw-gantt-bar/)
})

test('invalid Gantt row hierarchies report validation-error before rendering', async () => {
  for (const [rows, expected] of [
    [[{ id: 'a', label: 'A', parentId: 'missing' }], /Unknown parent/],
    [[{ id: 'a', label: 'A', parentId: 'b' }, { id: 'b', label: 'B', parentId: 'a' }], /cycle/],
  ]) {
    const reported = []
    const handled = []
    const app = createSSRApp({ render: () => h(GanttChart, {
      rows, bars: [], range: { start: 0, end: 3600000 },
      onValidationError: error => reported.push(error),
    }) })
    app.config.errorHandler = error => handled.push(error)
    const html = await renderToString(app)
    assert.equal(reported.length, 1)
    assert.match(reported[0].message, expected)
    assert.deepEqual(handled, reported)
    assert.match(html, /No rows to display/)
    assert.ok(!html.includes('vw-gantt-canvas'))
  }
})

test('production builds do not render invalid Gantt data', () => {
  const script = `
    import { createSSRApp, h } from 'vue'
    import { renderToString } from 'vue/server-renderer'
    import { GanttChart } from '@eightkk/vue-weave'
    const bar = { id: 'b', rowId: 'r', label: 'Bar', start: 0, end: 3600000 }
    const errors = []
    const html = await renderToString(createSSRApp({ render: () => h(GanttChart, {
      rows: [{ id: 'r', label: 'Row' }], bars: [bar, bar], range: { start: 0, end: 7200000 },
      onValidationError: error => errors.push(error.message),
    }) }))
    console.log(JSON.stringify({ errors, rendered: html.includes('vw-gantt-bar') }))
  `
  const output = execFileSync(process.execPath, ['--input-type=module', '-e', script], {
    env: { ...process.env, NODE_ENV: 'production' }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'],
  })
  const result = JSON.parse(output.trim().split('\n').at(-1))
  assert.equal(result.rendered, false)
  assert.equal(result.errors.length, 1)
})
