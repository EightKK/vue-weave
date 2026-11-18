import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import {
  createTimeScale, dependencyPath, renderTimelineSvg, scheduleTasks, timelineFromMsProject, validateTimelineData,
} from 'vue-weave/core'
import { GanttChart } from 'vue-weave'

const hour = 3_600_000
const pixels = 20 / hour
const x = time => time * pixels
// Rows are 66 px high and bars of one lane are centred in their row, like the rollup bars.
const middle = index => index * 66 + 33
// S rolls up A and B ([1 h, 5 h)); T and its child summary U roll up C ([6 h, 7 h)); E has a child row without bars.
const rows = [
  { id: 'S', label: 'Summary' }, { id: 'a', label: 'Row A', parentId: 'S' }, { id: 'b', label: 'Row B', parentId: 'S' },
  { id: 'T', label: 'Top' }, { id: 'U', label: 'Inner', parentId: 'T' }, { id: 'c', label: 'Row C', parentId: 'U' },
  { id: 'd', label: 'Row D' }, { id: 'E', label: 'Empty' }, { id: 'e1', label: 'Row E1', parentId: 'E' },
]
const bars = [
  { id: 'a', rowId: 'a', label: 'A', start: hour, end: 3 * hour, editable: true },
  { id: 'b', rowId: 'b', label: 'B', start: 2 * hour, end: 5 * hour },
  { id: 'c', rowId: 'c', label: 'C', start: 6 * hour, end: 7 * hour },
  { id: 'd', rowId: 'd', label: 'D', start: 8 * hour, end: 9 * hour, editable: true },
]
const range = { start: 0, end: 12 * hour }
const base = { rows, bars, range, pixelsPerUnit: pixels, showSummaries: true }
const render = (props = {}) => renderToString(createSSRApp({ render: () => h(GanttChart, { ...base, ...props }) }))
const connectors = html => [...html.matchAll(/<path class="[^"]*" d="([^"]+)" marker-end="url\(#[^)]+\)">/g)].map(match => match[1])
const names = html => [...html.matchAll(/class="vw-dependency-hit[^"]*" d="[^"]+" role="button" tabindex="0" aria-label="([^"]+)"/g)].map(match => match[1])

test('validateTimelineData accepts summary row ends only with summaryDependencies', () => {
  const link = [{ id: 'Sd', from: 'S', to: 'd' }]
  assert.throws(() => validateTimelineData(rows, bars, link), { message: 'Unknown dependency endpoint: Sd' })
  assert.throws(() => validateTimelineData(rows, bars, link, 1, { summaryDependencies: false }), { message: 'Unknown dependency endpoint: Sd' })
  assert.doesNotThrow(() => validateTimelineData(rows, bars, link, 1, { summaryDependencies: true }))
  assert.doesNotThrow(() => validateTimelineData(rows, bars, [{ id: 'dU', from: 'd', to: 'U', type: 'FF' }, { id: 'ST', from: 'S', to: 'T' }], 1, { summaryDependencies: true }))
  // A row without child rows is no summary, an unknown ID stays unknown, and a summary cannot link to itself.
  for (const [from, to] of [['e1', 'd'], ['d', 'missing']]) {
    assert.throws(() => validateTimelineData(rows, bars, [{ id: 'x', from, to }], 1, { summaryDependencies: true }), { message: 'Unknown dependency endpoint: x' })
  }
  assert.throws(() => validateTimelineData(rows, bars, [{ id: 'SS', from: 'S', to: 'S' }], 1, { summaryDependencies: true }), /cannot link a bar to itself: SS/)
})

test('GanttChart rejects summary row ends without summaryDependencies', async () => {
  await assert.rejects(() => render({ dependencies: [{ id: 'Sd', from: 'S', to: 'd' }] }), { message: 'Unknown dependency endpoint: Sd' })
})

test('without summaryDependencies GanttChart and renderTimelineSvg render exactly as before', async () => {
  const dependencies = [{ id: 'ad', from: 'a', to: 'd' }, { id: 'bc', from: 'b', to: 'c', type: 'SS', lag: hour }]
  const configs = [
    {}, { showSummaries: false }, { collapsedIds: new Set(['S']) }, { dir: 'rtl' }, { connectable: true },
    { connectable: true, reconnectable: true, selectedDependencyId: 'ad', contextMenu: true },
    { dependencyStyle: 'curve', highlightedDependencyIds: new Set(['bc']) },
  ]
  for (const config of configs) {
    const plain = await render({ ...config, dependencies })
    assert.equal(await render({ ...config, dependencies, summaryDependencies: false }), plain)
    assert.doesNotMatch(plain, /data-vw-summary/)
    // Turned on for a chart whose links all join bars, and without link handles, nothing changes either.
    if (!config.connectable) assert.equal(await render({ ...config, dependencies, summaryDependencies: true }), plain)
  }
  const scale = createTimeScale(range, pixels)
  for (const options of [{}, { showSummaries: true }, { showSummaries: true, direction: 'rtl', collapsedIds: ['S'] }]) {
    const plain = renderTimelineSvg(rows, bars, dependencies, scale, options)
    assert.equal(renderTimelineSvg(rows, bars, dependencies, scale, { ...options, summaryDependencies: false }), plain)
    assert.equal(renderTimelineSvg(rows, bars, dependencies, scale, { ...options, summaryDependencies: true }), plain)
  }
})

test('GanttChart draws each link type from and into a summary at the edges of its rollup bar', async () => {
  // Row order: S 0, a 1, b 2, T 3, U 4, c 5, d 6, E 7, e1 8. S rolls up [1 h, 5 h) and D is [8 h, 9 h).
  const types = ['FS', 'SS', 'FF', 'SF']
  for (const type of types) {
    const html = await render({ summaryDependencies: true, dependencies: [{ id: 'out', from: 'S', to: 'd', type }, { id: 'in', from: 'd', to: 'S', type }] })
    const source = type[0] === 'S' ? 1 : 5, target = type[1] === 'S' ? 1 : 5
    const dSource = type[0] === 'S' ? 8 : 9, dTarget = type[1] === 'S' ? 8 : 9
    assert.deepEqual(connectors(html), [
      dependencyPath(x(source * hour), middle(0), x(dTarget * hour), middle(6)),
      dependencyPath(x(dSource * hour), middle(6), x(target * hour), middle(0)),
    ], type)
  }
  // The rollup bar is drawn as before.
  const html = await render({ summaryDependencies: true, dependencies: [{ id: 'out', from: 'S', to: 'd' }] })
  assert.match(html, /<div class="vw-gantt-summary" style="left:calc\(var\(--vw-label-area-width\) \+ 20px\);width:80px;" title="Summary · 2 · 01:00–05:00">/)
})

test('summary ends follow connector styles, lags, highlights and the row labels in names', async () => {
  const dependencies = [{ id: 'Sd', from: 'S', to: 'd', lag: hour }, { id: 'dU', from: 'd', to: 'U', type: 'SS' }]
  for (const style of ['orthogonal', 'rounded', 'curve']) {
    const html = await render({ summaryDependencies: true, dependencies, dependencyStyle: style })
    assert.deepEqual(connectors(html), [
      dependencyPath(x(5 * hour), middle(0), x(8 * hour), middle(6), style),
      dependencyPath(x(8 * hour), middle(6), x(6 * hour), middle(4), style),
    ], style)
  }
  const html = await render({
    summaryDependencies: true, dependencies, connectable: true, highlightedDependencyIds: new Set(['Sd']), selectedDependencyId: 'dU', reconnectable: true,
  })
  assert.deepEqual(names(html), ['Select dependency Summary → D FS', 'Select dependency D → Inner SS'])
  assert.match(html, /<path class="vw-is-highlighted" d="[^"]+" marker-end/)
  assert.match(html, /<text id="[^"]+" class="vw-gantt-lag vw-is-highlighted" [^>]*aria-label="Lag \+1 h">\+1 h<\/text>/)
  assert.match(html, /aria-label="Select dependency Summary → D FS" aria-describedby="[^"]+-lag-0"/)
  // Reconnect handles sit on the summary end like on a bar end.
  assert.match(html, new RegExp(`class="vw-gantt-reconnect-handle" style="left:calc\\(var\\(--vw-label-area-width\\) \\+ ${x(6 * hour) - 6}px\\);top:${40 + middle(4) - 6}px;" aria-label="Reconnect target of D → Inner SS"`))
})

test('nested summaries, summary-to-summary links and collapsed summaries', async () => {
  const dependencies = [{ id: 'ST', from: 'S', to: 'T' }, { id: 'UT', from: 'd', to: 'U' }, { id: 'ad', from: 'a', to: 'd' }]
  const expanded = await render({ summaryDependencies: true, dependencies })
  assert.deepEqual(connectors(expanded), [
    dependencyPath(x(5 * hour), middle(0), x(6 * hour), middle(3)),
    dependencyPath(x(9 * hour), middle(6), x(6 * hour), middle(4)),
    dependencyPath(x(3 * hour), middle(1), x(8 * hour), middle(6)),
  ])
  // A collapsed summary keeps its rollup bar and its links; links to the bars it hides are hidden as before.
  // Rows: S 0, T 1, U 2, c 3, d 4, E 5, e1 6.
  const collapsedS = await render({ summaryDependencies: true, dependencies, collapsedIds: new Set(['S']) })
  assert.match(collapsedS, /class="vw-gantt-summary"[^>]*title="Summary · 2 · 01:00–05:00"/)
  assert.deepEqual(connectors(collapsedS), [
    dependencyPath(x(5 * hour), middle(0), x(6 * hour), middle(1)),
    dependencyPath(x(9 * hour), middle(4), x(6 * hour), middle(2)),
  ])
  // Collapsing T hides the nested summary U, so its link is hidden like a link to a hidden bar. Rows: S 0, a 1, b 2, T 3, d 4.
  const collapsedT = await render({ summaryDependencies: true, dependencies, collapsedIds: new Set(['T']) })
  assert.deepEqual(connectors(collapsedT), [
    dependencyPath(x(5 * hour), middle(0), x(6 * hour), middle(3)),
    dependencyPath(x(3 * hour), middle(1), x(8 * hour), middle(4)),
  ])
})

test('a summary end without a drawn rollup bar stays hidden', async () => {
  const dependencies = [{ id: 'Ed', from: 'E', to: 'd' }, { id: 'Sd', from: 'S', to: 'd' }]
  // E has no descendant bars, so it has no rollup bar; without showSummaries no summary has one.
  assert.deepEqual(connectors(await render({ summaryDependencies: true, dependencies })), [dependencyPath(x(5 * hour), middle(0), x(8 * hour), middle(6))])
  const off = await render({ summaryDependencies: true, dependencies, showSummaries: false })
  assert.deepEqual(connectors(off), [])
  assert.doesNotMatch(off, /vw-gantt-links/)
  // A parent row with a bar of its own draws that bar instead of a rollup, so a link to the row ID stays hidden.
  const own = [...bars, { id: 'own', rowId: 'S', label: 'Own', start: 0, end: hour }]
  assert.deepEqual(connectors(await render({ summaryDependencies: true, bars: own, dependencies: [{ id: 'Sd', from: 'S', to: 'd' }] })), [])
  // A row ID that is also a bar ID names the bar.
  const shared = [...bars, { id: 'S', rowId: 'd', label: 'Shared', start: 10 * hour, end: 11 * hour }]
  assert.deepEqual(connectors(await render({ summaryDependencies: true, bars: shared, dependencies: [{ id: 'Sa', from: 'S', to: 'a' }] })),
    [dependencyPath(x(11 * hour), middle(6), x(hour), middle(1))])
})

test('summary ends respect row virtualisation and the time window', async () => {
  const many = [{ id: 'P', label: 'Plan' }, { id: 'p1', label: 'P1', parentId: 'P' }]
  const manyBars = [{ id: 'p1', rowId: 'p1', label: 'P1', start: hour, end: 2 * hour }]
  for (let index = 0; index < 40; index++) {
    many.push({ id: 'r' + index, label: 'R' + index })
    manyBars.push({ id: 'r' + index, rowId: 'r' + index, label: 'R' + index, start: 3 * hour, end: 4 * hour })
  }
  many.push({ id: 'Q', label: 'Late plan' }, { id: 'q1', label: 'Q1', parentId: 'Q' })
  manyBars.push({ id: 'q1', rowId: 'q1', label: 'Q1', start: 5 * hour, end: 6 * hour })
  const dependencies = [{ id: 'Pr', from: 'P', to: 'r0' }, { id: 'rQ', from: 'r39', to: 'Q' }]
  const html = await render({ rows: many, bars: manyBars, dependencies, summaryDependencies: true })
  assert.deepEqual(connectors(html), [dependencyPath(x(2 * hour), middle(0), x(3 * hour), middle(2))])
  // A link between a summary and a bar far outside the visible time window is skipped like one between two bars there;
  // a link that crosses the window is drawn. Rows: S 0, a 1, b 2, T 3, U 4, c 5, d 6, E 7, e1 8, F 9, f1 10.
  const wide = await render({
    range: { start: 0, end: 500 * hour }, summaryDependencies: true,
    rows: [...rows, { id: 'F', label: 'Far plan' }, { id: 'f1', label: 'F1', parentId: 'F' }],
    bars: [...bars, { id: 'f1', rowId: 'f1', label: 'F1', start: 490 * hour, end: 491 * hour }, { id: 'far', rowId: 'd', label: 'Far', start: 495 * hour, end: 496 * hour }],
    dependencies: [{ id: 'Ffar', from: 'F', to: 'far' }, { id: 'Sfar', from: 'S', to: 'F', type: 'SS' }],
  })
  assert.deepEqual(connectors(wide), [dependencyPath(x(hour), middle(0), x(490 * hour), middle(9))])
})

test('right-to-left charts mirror summary ends with the connector layer', async () => {
  const dependencies = [{ id: 'Sd', from: 'S', to: 'd', lag: hour }]
  const ltr = await render({ summaryDependencies: true, dependencies, connectable: true })
  const rtl = await render({ summaryDependencies: true, dependencies, connectable: true, dir: 'rtl' })
  // Connectors keep their coordinates; the layer is mirrored by the stylesheet, and handles use the inline-start side.
  assert.deepEqual(connectors(rtl), connectors(ltr))
  assert.match(rtl, /class="vw-gantt-link-handle vw-is-start" style="right:calc\(var\(--vw-label-area-width\) \+ 5px\);top:67px;" aria-label="Start dependency from start of Summary" aria-pressed="false" data-vw-link="\[&quot;S&quot;,&quot;start&quot;\]"/)
  assert.match(rtl, /class="vw-gantt-summary" style="right:calc\(var\(--vw-label-area-width\) \+ 20px\);width:80px;"[^>]* data-vw-summary="S"/)
})

test('connectable rollup bars get link handles and accept dropped links', async () => {
  const html = await render({ summaryDependencies: true, connectable: true, dependencies: [] })
  for (const [id, label, start, end] of [['S', 'Summary', 1, 5], ['T', 'Top', 6, 7], ['U', 'Inner', 6, 7]]) {
    const top = 40 + middle(rows.findIndex(row => row.id === id)) - 6
    assert.match(html, new RegExp(`style="left:calc\\(var\\(--vw-label-area-width\\) \\+ ${x(start * hour) - 15}px\\);top:${top}px;" aria-label="Start dependency from start of ${label}" aria-pressed="false" data-vw-link="\\[&quot;${id}&quot;,&quot;start&quot;\\]"`))
    assert.match(html, new RegExp(`style="left:calc\\(var\\(--vw-label-area-width\\) \\+ ${x(end * hour) + 3}px\\);top:${top}px;" aria-label="Start dependency from finish of ${label}"`))
    assert.match(html, new RegExp(`title="${label} · \\d · [^"]+" data-vw-summary="${id}"`))
  }
  assert.doesNotMatch(html, /from start of Empty/)
  // Readonly charts and charts without link handles offer no rollup handles.
  for (const props of [{ readonly: true, connectable: true }, {}]) {
    assert.doesNotMatch(await render({ summaryDependencies: true, dependencies: [], ...props }), /of Summary|data-vw-summary/)
  }
})

test('renderTimelineSvg draws summary links with summaryDependencies, also right to left', () => {
  const scale = createTimeScale(range, pixels)
  const dependencies = [{ id: 'Sd', from: 'S', to: 'd', lag: hour }, { id: 'dU', from: 'd', to: 'U', type: 'SS' }, { id: 'Ed', from: 'E', to: 'd' }]
  const svg = renderTimelineSvg(rows, bars, dependencies, scale, { showSummaries: true, summaryDependencies: true })
  const paths = [...svg.matchAll(/<path d="([^"]+)" fill="none" stroke="[^"]+" stroke-width="1.3" marker-end/g)].map(match => match[1])
  // The export has a 40 px header and the same 66 px rows.
  assert.deepEqual(paths, [
    dependencyPath(x(5 * hour), 40 + middle(0), x(8 * hour), 40 + middle(6)),
    dependencyPath(x(8 * hour), 40 + middle(6), x(6 * hour), 40 + middle(4)),
  ])
  assert.match(svg, /<text class="vw-gantt-lag"[^>]*>\+1 h<\/text>/)
  // Without showSummaries there is no rollup bar, so the links are left out.
  assert.doesNotMatch(renderTimelineSvg(rows, bars, dependencies, scale, { summaryDependencies: true }), /marker-end="url\(#[^)]+\)"\/>/)
  // Collapsed and right to left: the paths are mirrored as a group, and the highlight applies. Rows: S 0, T 1, U 2, c 3, d 4.
  const rtl = renderTimelineSvg(rows, bars, dependencies, scale, {
    showSummaries: true, summaryDependencies: true, direction: 'rtl', collapsedIds: ['S'], highlightedDependencyIds: ['Sd'],
  })
  assert.match(rtl, /<g transform="matrix\(-1 0 0 1 240 0\)"><path d="M 100 73 H 130 V 337 H 160" fill="none" stroke="#a74f08" stroke-width="2"/)
  assert.throws(() => renderTimelineSvg(rows, bars, dependencies, scale), /Unknown dependency endpoint: Sd/)
})

test('timelineFromMsProject keeps summary links with summaryDependencies, matching scheduleTasks', async () => {
  const project = {
    tasks: [
      { id: '1', name: 'Design', start: 0, end: 2 * hour },
      { id: '2', name: 'Build', start: 2 * hour, end: 5 * hour },
      { id: '3', name: 'Frame', outlineLevel: 2, start: 2 * hour, end: 5 * hour },
      { id: '4', name: 'Wiring', outlineLevel: 2, start: 2 * hour, end: 3 * hour },
      { id: '5', name: 'Inspect', start: 5 * hour, end: 6 * hour },
    ],
    dependencies: [{ from: '1', to: '2' }, { from: '2', to: '5' }, { from: '3', to: '5', type: 'FF' }],
  }
  const hidden = timelineFromMsProject(project)
  assert.deepEqual(hidden.hiddenDependencyIds, ['link-1', 'link-2'])
  assert.deepEqual(timelineFromMsProject(project, { summaryDependencies: false }), hidden)
  const shown = timelineFromMsProject(project, { summaryDependencies: true })
  assert.deepEqual(shown.hiddenDependencyIds, [])
  assert.deepEqual(shown.dependencies, [
    { id: 'link-1', from: '1', to: '2' }, { id: 'link-2', from: '2', to: '5' }, { id: 'link-3', from: '3', to: '5', type: 'FF' },
  ])
  assert.deepEqual({ ...shown, dependencies: hidden.dependencies, hiddenDependencyIds: hidden.hiddenDependencyIds }, hidden)
  const html = await renderToString(createSSRApp({ render: () => h(GanttChart, {
    rows: shown.rows, bars: shown.bars, dependencies: shown.dependencies, range, pixelsPerUnit: pixels, showSummaries: true, summaryDependencies: true,
  }) }))
  // Rows: Design 0, Build 1, Frame 2, Wiring 3, Inspect 4.
  assert.deepEqual(connectors(html), [
    dependencyPath(x(2 * hour), middle(0), x(2 * hour), middle(1)),
    dependencyPath(x(5 * hour), middle(1), x(5 * hour), middle(4)),
    dependencyPath(x(5 * hour), middle(2), x(6 * hour), middle(4)),
  ])
  // The same links schedule the summary task: GanttChart draws what scheduleTasks plans.
  const plan = scheduleTasks({
    range: { start: 0, end: 100 },
    tasks: [{ id: '1', duration: 2 }, { id: '2', duration: 0 }, { id: '3', duration: 3, parentId: '2' }, { id: '4', duration: 1, parentId: '2' }, { id: '5', duration: 1 }],
    dependencies: shown.dependencies,
  })
  assert.deepEqual(plan.tasks.map(task => [task.id, task.start, task.end]), [['1', 0, 2], ['2', 2, 5], ['3', 2, 5], ['4', 2, 3], ['5', 5, 6]])
})
