import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { removeTimelineBars, validateTimelineData } from 'vue-weave/core'
import { GanttChart } from 'vue-weave'

const hour = 3_600_000

const rows = [{ id: 'r1', label: 'Row 1' }, { id: 'r2', label: 'Row 2' }]
const bars = [
  { id: 'a', rowId: 'r1', label: 'A', start: hour, end: 3 * hour, editable: true },
  { id: 'b', rowId: 'r1', label: 'B', start: 4 * hour, end: 6 * hour },
  { id: 'c', rowId: 'r2', label: 'C', start: 2 * hour, end: 5 * hour },
]
const dependencies = [
  { id: 'ab', from: 'a', to: 'b' },
  { id: 'bc', from: 'b', to: 'c', type: 'SS' },
  { id: 'ca', from: 'c', to: 'a' },
]

test('removeTimelineBars removes the bars and every dependency touching them without mutating the input', () => {
  const frozenBars = Object.freeze(bars.map(bar => Object.freeze({ ...bar })))
  const frozenDependencies = Object.freeze(dependencies.map(dependency => Object.freeze({ ...dependency })))
  const result = removeTimelineBars(frozenBars, frozenDependencies, ['b'])
  assert.deepEqual(result.bars.map(bar => bar.id), ['a', 'c'])
  assert.deepEqual(result.dependencies.map(dependency => dependency.id), ['ca'])
  // Kept items are the same objects; the arrays are new.
  assert.equal(result.bars[0], frozenBars[0])
  assert.equal(result.dependencies[0], frozenDependencies[2])
  assert.equal(frozenBars.length, 3)
  assert.equal(frozenDependencies.length, 3)
  // The result is valid timeline data.
  validateTimelineData(rows, result.bars, result.dependencies)
})

test('removeTimelineBars accepts any iterable, ignores repeated IDs and returns copies for an empty set', () => {
  const result = removeTimelineBars(bars, dependencies, new Set(['a', 'c']))
  assert.deepEqual(result.bars.map(bar => bar.id), ['b'])
  assert.deepEqual(result.dependencies, [])
  assert.deepEqual(removeTimelineBars(bars, dependencies, ['a', 'a']).bars.map(bar => bar.id), ['b', 'c'])
  const none = removeTimelineBars(bars, dependencies, [])
  assert.deepEqual(none, { bars, dependencies })
  assert.notEqual(none.bars, bars)
  assert.notEqual(none.dependencies, dependencies)
})

test('removeTimelineBars rejects unknown bar IDs with an Error', () => {
  assert.throws(() => removeTimelineBars(bars, dependencies, ['a', 'missing']), { name: 'Error', message: /Unknown bar: missing/ })
  // A dependency ID is not a bar ID.
  assert.throws(() => removeTimelineBars(bars, dependencies, ['ab']), /Unknown bar: ab/)
  assert.throws(() => removeTimelineBars([], [], ['a']), /Unknown bar/)
})

const chartProps = { rows, bars, dependencies, range: { start: 0, end: 10 * hour }, pixelsPerUnit: 10 / hour }
function render(props = {}, slots) {
  return renderToString(createSSRApp({ render: () => h(GanttChart, { ...chartProps, ...props }, slots) }))
}

test('GanttChart markup is unchanged without the new interaction props', async () => {
  for (const extra of [{}, { connectable: true, reconnectable: true, selectedDependencyId: 'ab' }, { readonly: true, dir: 'rtl' }]) {
    const plain = await render(extra)
    const disabled = await render({
      ...extra, progressEditable: false, progressStep: 0.05, deletable: false, contextMenu: false, tooltipDelay: 400,
    }, { tooltip: () => 'never on the server' })
    assert.equal(disabled, plain)
    assert.doesNotMatch(plain, /role="slider"|vft-gantt-progress-handle|data-vft-progress|delete-hint|role="tooltip"|vft-gantt-tooltip|data-vft-dependency/)
  }
})

test('GanttChart renders a progress slider for editable bars on the server', async () => {
  const html = await render({
    progressEditable: true,
    bars: [
      { ...bars[0], progress: 0.4 },
      // Progress over working time: half of the two working hours ends with the first segment.
      { id: 's', rowId: 'r2', label: 'S', start: 2 * hour, end: 5 * hour, editable: true, progress: 0.5, segments: [{ start: 2 * hour, end: 3 * hour }, { start: 4 * hour, end: 5 * hour }] },
      { id: 'u', rowId: 'r2', label: 'U', start: 6 * hour, end: 8 * hour, editable: true },
      { id: 'm', rowId: 'r1', label: 'M', start: 7 * hour, end: 7 * hour, editable: true },
      { ...bars[1], progress: 0.2 },
    ],
    dependencies: [],
  })
  const sliders = html.match(/<button[^>]*role="slider"[^>]*>/g)
  // Milestones and bars that are not editable get no slider.
  assert.equal(sliders.length, 3)
  assert.equal(sliders[0], '<button type="button" class="vft-gantt-progress-handle" style="left:calc(var(--vft-label-area-width) + 12px);top:53px;" '
    + 'data-vft-progress="a" role="slider" aria-label="Progress of A" aria-valuemin="0" aria-valuemax="100" aria-valuenow="40" aria-valuetext="40%">')
  assert.match(sliders[1], /style="left:calc\(var\(--vft-label-area-width\) \+ 24px\);top:53px;" data-vft-progress="s"/)
  assert.match(sliders[1], /aria-valuenow="50" aria-valuetext="50%"/)
  // Undefined progress is drawn as 0.
  assert.match(sliders[2], /\+ 54px\);top:53px;" data-vft-progress="u"[^>]*aria-valuenow="0" aria-valuetext="0%"/)
  assert.doesNotMatch(html, /Progress of [BM]"/)
})

test('GanttChart mirrors and localizes the slider and hides it when readonly', async () => {
  const props = { progressEditable: true, bars: [{ ...bars[0], progress: 0.25 }], dependencies: [] }
  const rtl = await render({ ...props, dir: 'rtl', labels: { progressOf: 'Fortschritt von' } })
  assert.match(rtl, /style="right:calc\(var\(--vft-label-area-width\) \+ 9px\);top:53px;" data-vft-progress="a" role="slider" aria-label="Fortschritt von A"/)
  assert.doesNotMatch(await render({ ...props, readonly: true }), /role="slider"/)
})

test('GanttChart describes deletable bars after the existing hints', async () => {
  const html = await render({
    deletable: true, rowDraggable: true, labels: { deleteHint: 'Entf löscht den Balken.' },
    bars: [
      { ...bars[0] },
      { ...bars[1], editable: true, deletable: false },
      { ...bars[2], deletable: true },
    ],
  })
  const described = id => new RegExp(`data-vft-bar="${id}"[^>]*aria-describedby="([^"]+)"`).exec(html)?.[1]
  assert.equal(described('a'), 'v-0-hint v-0-row-hint v-0-delete-hint')
  assert.equal(described('b'), 'v-0-hint v-0-row-hint')
  assert.equal(described('c'), 'v-0-delete-hint')
  assert.match(html, /<span id="v-0-delete-hint" class="vft-sr-only">Entf löscht den Balken\.<\/span>/)
  const readonly = await render({ deletable: true, readonly: true })
  assert.doesNotMatch(readonly, /aria-describedby="[^"]*delete-hint/)
})

test('GanttChart renders no tooltip on the server and marks dependency targets only for contextMenu', async () => {
  let calls = 0
  const html = await render({ contextMenu: true, connectable: true, tooltipDelay: 0 }, { tooltip: () => { calls++; return 'Tip' } })
  assert.equal(calls, 0)
  assert.doesNotMatch(html, /role="tooltip"|Tip/)
  assert.match(html, /role="button" tabindex="0" data-vft-dependency="ab" aria-label="Select dependency A → B FS"/)
})

test('GanttChart reports invalid progressStep and tooltipDelay through validation-error', async () => {
  for (const [props, expected] of [
    [{ progressStep: 0 }, /progressStep/],
    [{ progressStep: 1.5 }, /progressStep/],
    [{ progressStep: Number.NaN }, /progressStep/],
    [{ tooltipDelay: -1 }, /tooltipDelay/],
    [{ tooltipDelay: Infinity }, /tooltipDelay/],
  ]) {
    const reported = []
    const app = createSSRApp({ render: () => h(GanttChart, { ...chartProps, ...props, onValidationError: error => reported.push(error) }) })
    app.config.errorHandler = () => {}
    const html = await renderToString(app)
    assert.equal(reported.length, 1)
    assert.ok(reported[0] instanceof RangeError)
    assert.match(reported[0].message, expected)
    assert.match(html, /No rows to display/)
  }
  // A step of exactly 1 and a zero delay are valid.
  assert.match(await render({ progressEditable: true, progressStep: 1, tooltipDelay: 0 }), /role="slider"/)
})
