import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { createTimeScale, mirrorTimeScale } from 'vue-weave/core'
import { GanttChart, NetworkGraph } from 'vue-weave'

const hour = 3_600_000

test('mirrorTimeScale maps the range start to the right edge and keeps exact round trips', () => {
  // A power-of-two pixel ratio keeps the underlying scale exact, so the mirror must be exact too.
  const base = createTimeScale({ start: 0, end: 10 * hour }, 2 ** -15)
  const mirrored = mirrorTimeScale(base)
  assert.equal(mirrored.width, base.width)
  assert.equal(mirrored.toX(0), base.width)
  assert.equal(mirrored.toX(10 * hour), 0)
  assert.equal(mirrored.toTime(base.width), 0)
  assert.equal(mirrored.toTime(0), 10 * hour)
  for (let time = 0; time <= 10 * hour; time += hour / 4) {
    assert.equal(mirrored.toTime(mirrored.toX(time)), time)
    assert.equal(mirrored.toX(time), base.width - base.toX(time))
  }
  for (let x = 0; x <= base.width; x += 0.5) assert.equal(mirrored.toX(mirrored.toTime(x)), x)
  // With an inexact ratio both directions stay inverse within rounding, also when extrapolating.
  const linear = mirrorTimeScale(createTimeScale({ start: 0, end: 10 * hour }, 115 / hour))
  for (const time of [-hour, 900_000, 1234567.89, 7.77 * hour, 11 * hour]) {
    assert.ok(Math.abs(linear.toTime(linear.toX(time)) - time) < 1e-6)
  }
  assert.ok(mirrored.toX(-hour) > base.width)
  // Mirroring twice restores the original mapping.
  const twice = mirrorTimeScale(mirrored)
  for (let time = 0; time <= 10 * hour; time += hour) assert.equal(twice.toX(time), base.toX(time))
})

test('mirrorTimeScale validates the width', () => {
  assert.throws(() => mirrorTimeScale({ width: 0, toX: x => x, toTime: x => x }), RangeError)
  assert.throws(() => mirrorTimeScale({ width: Number.NaN, toX: x => x, toTime: x => x }), RangeError)
})

const rows = [{ id: 'r', label: 'Row' }]
const bars = [{ id: 'b', rowId: 'r', label: 'Bar', start: hour, end: 3 * hour, editable: true, progress: 0.5 }]
const range = { start: 0, end: 6 * hour }

test('GanttChart renders right-to-left on the server with inline-start offsets', async () => {
  const ltr = await renderToString(createSSRApp({ render: () => h(GanttChart, { rows, bars, range }) }))
  assert.doesNotMatch(ltr, /dir="/)
  assert.doesNotMatch(ltr, /vw-rtl/)
  assert.match(ltr, /left:calc\(var\(--vw-label-area-width\) \+ 80px\)/)
  const rtl = await renderToString(createSSRApp({ render: () => h(GanttChart, { rows, bars, range, dir: 'rtl' }) }))
  assert.match(rtl, /<div dir="rtl" class="vw-gantt vw-rtl"|<div class="vw-gantt vw-rtl" dir="rtl"/)
  assert.match(rtl, /right:calc\(var\(--vw-label-area-width\) \+ 80px\)/)
  assert.doesNotMatch(rtl, /left:calc\(var\(--vw-label-area-width\)/)
  // `auto` cannot know the inherited direction on the server and renders left-to-right markup.
  const auto = await renderToString(createSSRApp({ render: () => h(GanttChart, { rows, bars, range, dir: 'auto' }) }))
  assert.doesNotMatch(auto, /vw-rtl|dir="/)
})

test('NetworkGraph right-to-left aligns labels to the right without moving nodes', async () => {
  const nodes = [{ id: 'a', label: 'Alpha', detail: 'first' }, { id: 'b', label: 'Beta' }]
  const edges = [{ id: 'e', from: 'a', to: 'b' }]
  const ltr = await renderToString(createSSRApp({ render: () => h(NetworkGraph, { nodes, edges }) }))
  const rtl = await renderToString(createSSRApp({ render: () => h(NetworkGraph, { nodes, edges, dir: 'rtl' }) }))
  assert.match(ltr, /<text x="13" y="24" class="vw-node-title">Alpha<\/text>/)
  assert.match(rtl, /<text x="131" y="24" class="vw-node-title">Alpha<\/text>/)
  assert.match(rtl, /class="vw-network vw-rtl"/)
  const transforms = html => [...html.matchAll(/translate\([^)]*\)/g)].map(match => match[0])
  assert.deepEqual(transforms(rtl), transforms(ltr))
})
