import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  calculateResourceLoad, createTimeScale, defaultSvgExportTheme, escapeXml, layoutLayeredGraph, renderGraphSvg, renderTimelineSvg,
} from '@eightkk/vue-weave/core'
import { hour } from './helpers/time.mjs'


/** A small well-formedness check: balanced tags, quoted attributes and only known entities in text. */
function assertWellFormed(xml) {
  assert.ok(xml.startsWith('<svg '), 'starts with the svg root')
  const stack = []
  const token = /<(\/?)([A-Za-z][\w:-]*)((?:\s+[\w:-]+="[^"<]*")*)\s*(\/?)>|([^<]+)|(<)/g
  let match
  let roots = 0
  while ((match = token.exec(xml))) {
    const [, close, name, , selfClose, text, stray] = match
    assert.equal(stray, undefined, 'unexpected < at ' + match.index)
    if (text !== undefined) {
      assert.ok(!/&(?!(?:amp|lt|gt|quot|apos);)/.test(text), 'unescaped & in text: ' + text)
      continue
    }
    if (close) assert.equal(stack.pop(), name, 'mismatched closing tag ' + name)
    else if (!selfClose) {
      if (!stack.length) roots++
      stack.push(name)
    } else if (!stack.length) roots++
  }
  assert.deepEqual(stack, [])
  assert.equal(roots, 1)
  for (const attributes of xml.matchAll(/="([^"]*)"/g)) {
    assert.ok(!/&(?!(?:amp|lt|gt|quot|apos);)/.test(attributes[1]), 'unescaped & in attribute')
  }
  assert.ok(!/<script|\son\w+="|javascript:/i.test(xml), 'no script content')
}

function count(xml, pattern) {
  return xml.match(pattern)?.length ?? 0
}

const graphNodes = [
  { id: 'a', label: 'Alpha <one> & "two"' },
  { id: 'b', label: 'Beta', detail: 'detail & more', tone: 'teal' },
  { id: 'c', label: 'Gamma', shape: 'rounded' },
]
const graphEdges = [
  { id: 'ab', from: 'a', to: 'b', label: 'a < b' },
  { id: 'bc', from: 'b', to: 'c' },
  { id: 'ca', from: 'c', to: 'a' },
]

test('renderGraphSvg draws every node, edge, label and group as escaped standalone XML', () => {
  const layout = layoutLayeredGraph(graphNodes, graphEdges)
  const svg = renderGraphSvg(layout, graphNodes, graphEdges, {
    title: 'Graph & "export"', groups: [{ id: 'g', label: 'Group <1>', x: 0, y: 0, width: 200, height: 120 }], selectedIds: ['b'],
  })
  assertWellFormed(svg)
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/)
  assert.match(svg, /<title>Graph &amp; &quot;export&quot;<\/title>/)
  assert.equal(count(svg, /<g transform="translate\(/g), graphNodes.length + 1)
  assert.equal(count(svg, /marker-end="url\(#vw-export-arrow\)"/g), graphEdges.length)
  assert.match(svg, />Alpha &lt;one&gt; &amp; &quot;two&quot;</)
  assert.match(svg, />detail &amp; more</)
  assert.match(svg, />a &lt; b</)
  assert.match(svg, />Group &lt;1&gt;</)
  assert.match(svg, new RegExp(`fill="${defaultSvgExportTheme.tones.teal.solid}"`), 'the selected node uses the solid tone')
  const width = Number(/^<svg[^>]* width="([\d.]+)"/.exec(svg)[1])
  assert.ok(width >= layout.width + 32, 'the whole layout plus padding is exported')
})

test('renderGraphSvg applies theme colours, label callbacks and right-to-left labels', () => {
  const layout = layoutLayeredGraph(graphNodes, graphEdges)
  const svg = renderGraphSvg(layout, graphNodes, graphEdges, {
    theme: { edge: '#123456', tones: { blue: { pale: 'rgb(1, 2, 3)' } } }, background: false, padding: 0, idPrefix: 'mine',
    nodeLabel: node => node.id.toUpperCase(), edgeLabel: () => undefined, direction: 'rtl',
  })
  assertWellFormed(svg)
  assert.match(svg, /stroke="#123456"/)
  assert.match(svg, /fill="rgb\(1, 2, 3\)"/)
  assert.match(svg, /url\(#mine-arrow\)/)
  assert.match(svg, />A<\/text>/)
  assert.doesNotMatch(svg, /a &lt; b/)
  assert.match(svg, /direction="rtl"/)
  assert.doesNotMatch(svg, /^<svg[^>]*><rect width/, 'no background rectangle')
})

test('renderGraphSvg validates options and geometry', () => {
  const layout = layoutLayeredGraph(graphNodes, graphEdges)
  assert.throws(() => renderGraphSvg(layout, graphNodes, graphEdges, { padding: -1 }), RangeError)
  assert.throws(() => renderGraphSvg(layout, graphNodes, graphEdges, { padding: Number.NaN }), RangeError)
  assert.throws(() => renderGraphSvg(layout, graphNodes, graphEdges, { idPrefix: '"><script>' }), /idPrefix/)
  assert.throws(() => renderGraphSvg(layout, [...graphNodes, { id: 'd', label: 'D' }], graphEdges), /layout box: d/)
  assert.throws(() => renderGraphSvg(layout, graphNodes, graphEdges, { groups: [{ id: 'g', label: 'G', x: 0, y: 0, width: -1, height: 1 }] }), RangeError)
  assert.throws(() => renderGraphSvg(layout, graphNodes, graphEdges, { theme: { edge: 5 } }), /colour/)
  assert.throws(() => renderGraphSvg(layout, graphNodes, graphEdges, { theme: { edge: 'red" onload="alert(1)' } }), { name: 'RangeError', message: /edge/ })
  const hostile = renderGraphSvg(layout, graphNodes, graphEdges, { fontFamily: 'x"><script>' })
  assertWellFormed(hostile)
})

const rows = [
  { id: 'plan', label: 'Plan & <build>' },
  { id: 'design', label: 'Design', parentId: 'plan', detail: 'Team "A"' },
  { id: 'build', label: 'Build', parentId: 'plan' },
  { id: 'ship', label: 'Ship' },
]
const bars = [
  { id: 'd1', rowId: 'design', label: 'Sketch <v1>', start: 0, end: 2 * hour, progress: 0.5, baseline: { start: 0, end: hour } },
  { id: 'b1', rowId: 'build', label: 'Code', start: 2 * hour, end: 5 * hour, tone: 'amber', appearance: 'outline' },
  { id: 's1', rowId: 'ship', label: 'Release', start: 6 * hour, end: 6 * hour },
]
const dependencies = [{ id: 'l1', from: 'd1', to: 'b1' }, { id: 'l2', from: 'b1', to: 's1', type: 'FF' }]
const scale = createTimeScale({ start: 0, end: 8 * hour }, 80 / hour)

test('renderTimelineSvg draws rows, columns, bands, ticks, bars, milestones, baselines, summaries, links, markers and load', () => {
  const resources = [{ id: 'crew', label: 'Crew', capacity: 1 }]
  const load = [...calculateResourceLoad({ start: 0, end: 8 * hour },
    bars.map(bar => ({ id: bar.id, work: bar.start === bar.end ? [] : [{ start: bar.start, end: bar.end }] })), resources,
    [{ resourceId: 'crew', taskId: 'd1' }, { resourceId: 'crew', taskId: 'b1' }]).filter(segment => segment.start >= 2 * hour),
  { resourceId: 'crew', start: 0, end: 2 * hour, load: 2, capacity: 1 }]
  const svg = renderTimelineSvg(rows, bars, dependencies, scale, {
    title: 'Plan', showSummaries: true, rowHeading: 'Work & rows',
    columns: [{ id: 'note', label: 'Note', width: 80, value: row => row.detail ?? '—' }],
    headerBands: [[{ start: 0, end: 4 * hour, label: 'Morning' }, { start: 4 * hour, end: 8 * hour, label: 'Afternoon' }]],
    markers: [{ id: 'm', time: 3 * hour, label: 'Review' }], now: 4 * hour, nowLabel: 'Now',
    loadRows: resources, loadSegments: load, highlightedDependencyIds: ['l2'], tickStep: hour,
  })
  assertWellFormed(svg)
  // 154 px heading column + 80 px column + 8 h at 80 px per hour; header 40 + one band, 4 rows, 1 load row.
  assert.match(svg, /^<svg[^>]* width="874" height="374"/)
  assert.match(svg, />Plan &amp; &lt;build&gt;</)
  assert.match(svg, />Team &quot;A&quot;</)
  assert.match(svg, />Sketch &lt;v1&gt;</)
  assert.match(svg, />Work &amp; rows</)
  assert.equal(count(svg, /<polygon /g), 1, 'one milestone')
  assert.equal(count(svg, /<path d="M [^"]*" fill="none"/g), 2, 'two dependency paths')
  assert.equal(count(svg, /url\(#vw-export-arrow-highlight\)/g), 1)
  assert.equal(count(svg, /font-size="11" font-weight="700" fill="#172c3b" text-anchor/g), 9, 'ticks 00:00 to 08:00')
  assert.match(svg, />Morning</)
  assert.match(svg, />Afternoon</)
  assert.match(svg, />Review</)
  assert.match(svg, />Now</)
  assert.match(svg, />Crew</)
  assert.match(svg, new RegExp(`fill="${defaultSvgExportTheme.loadOverload}"`))
  assert.match(svg, new RegExp(`fill="${defaultSvgExportTheme.baseline}"`))
  assert.match(svg, /<title>Plan &amp; &lt;build&gt; · 2 · 00:00–05:00<\/title>/, 'a summary for the parent row')
})

test('renderTimelineSvg respects collapsed rows and row and time ranges', () => {
  const collapsed = renderTimelineSvg(rows, bars, dependencies, scale, { collapsedIds: ['plan'] })
  assertWellFormed(collapsed)
  assert.match(collapsed, /^<svg[^>]* width="794" height="172"/)
  assert.doesNotMatch(collapsed, /Sketch/)
  assert.doesNotMatch(collapsed, /stroke-width="1.3"/, 'links to hidden rows are omitted')
  assert.match(collapsed, />▸</)

  const slice = renderTimelineSvg(rows, bars, dependencies, scale, { rowRange: { start: 1, end: 3 }, timeRange: { start: hour, end: 3 * hour } })
  assertWellFormed(slice)
  assert.match(slice, /^<svg[^>]* width="314" height="172"/)
  assert.doesNotMatch(slice, />Plan/)
  assert.doesNotMatch(slice, />Ship</)
  assert.match(slice, />Sketch &lt;v1&gt;</)
  assert.match(slice, />Code</)
  assert.equal(count(slice, /<polygon /g), 0, 'the milestone lies outside the window')
  assert.match(slice, /<clipPath id="vw-export-axis"><rect x="154" y="0" width="160" height="172"\/>/)

  const empty = renderTimelineSvg(rows, bars, dependencies, scale, { rowRange: { start: 2, end: 2 } })
  assertWellFormed(empty)
  assert.match(empty, /height="40"/)
})

test('renderTimelineSvg mirrors the axis for right-to-left output', () => {
  const svg = renderTimelineSvg(rows, bars, dependencies, scale, { direction: 'rtl', tickStep: hour })
  assertWellFormed(svg)
  // The time area starts at x = 0 and the heading column sits on the right.
  assert.match(svg, /<clipPath id="vw-export-axis"><rect x="0" y="0" width="640"/)
  assert.match(svg, /<g transform="matrix\(-1 0 0 1 640 0\)">/)
  // The milestone at 06:00 is 160 px from the left edge, which is 08:00.
  assert.match(svg, /<polygon points="160,/)
  assert.match(svg, /direction="rtl"/)
})

test('renderTimelineSvg validates options', () => {
  const run = options => renderTimelineSvg(rows, bars, dependencies, scale, options)
  assert.throws(() => run({ rowRange: { start: 0, end: 9 } }), RangeError)
  assert.throws(() => run({ rowRange: { start: 2, end: 1 } }), RangeError)
  assert.throws(() => run({ rowRange: { start: 0.5, end: 1 } }), RangeError)
  assert.throws(() => run({ timeRange: { start: 2 * hour, end: hour } }), RangeError)
  assert.throws(() => run({ timeRange: { start: 0, end: Number.POSITIVE_INFINITY } }), RangeError)
  assert.throws(() => run({ rowHeight: 10 }), RangeError)
  assert.throws(() => run({ labelWidth: -1 }), RangeError)
  assert.throws(() => run({ tickStep: 0 }), RangeError)
  assert.throws(() => run({ tickSteps: [hour, 1] }), RangeError)
  assert.throws(() => run({ now: Number.NaN }), RangeError)
  assert.throws(() => run({ loadRowHeight: 4, loadRows: [{ id: 'r', label: 'R' }] }), RangeError)
  assert.throws(() => run({ loadSegments: [{ resourceId: 'r', start: 0, end: 1, load: 1, capacity: 1 }] }), /require loadRows/)
  assert.throws(() => run({ columns: [{ id: 'c', label: 'C', width: 0, value: () => '' }] }), RangeError)
  assert.throws(() => run({ markers: [{ id: 'm', time: Number.NaN, label: 'M' }] }), RangeError)
  assert.throws(() => run({ headerBands: [[{ start: 2, end: 1, label: 'B' }]] }), RangeError)
  assert.throws(() => run({ direction: 'up' }), /direction/)
  assert.throws(() => renderTimelineSvg(rows, bars, [{ id: 'x', from: 'd1', to: 'missing' }], scale), /Unknown dependency endpoint/)
  assert.throws(() => renderTimelineSvg(rows, bars, [{ id: 'x', from: 'd1', to: 'd1' }], scale),
    { name: 'Error', message: 'A dependency cannot link a bar to itself: x on bar d1' })
  assert.throws(() => renderTimelineSvg(rows, bars, dependencies, { width: 0, toX: x => x, toTime: x => x }), RangeError)
})

test('renderTimelineSvg draws a milestone at the end of the exported time range', () => {
  // The Release milestone lies at 6 h, exactly on the window end; a bar starting there would be outside.
  const window = { start: hour, end: 6 * hour }
  const svg = renderTimelineSvg(rows, bars, dependencies, scale, { timeRange: window })
  assert.equal(count(svg, /<polygon /g), 1)
  assert.match(svg, /<title>Release /)
  const after = renderTimelineSvg(rows, [...bars, { id: 'late', rowId: 'ship', label: 'Late', start: 6 * hour, end: 7 * hour }], dependencies, scale, { timeRange: window })
  assert.doesNotMatch(after, /<title>Late /)
})

test('SVG exports fall back to blue for inherited tone names and reject inherited theme keys', () => {
  const layout = layoutLayeredGraph(graphNodes, graphEdges)
  const blueGraph = renderGraphSvg(layout, graphNodes.map(node => ({ ...node, tone: 'blue' })), graphEdges)
  const blueTimeline = renderTimelineSvg(rows, bars.map(bar => ({ ...bar, tone: 'blue' })), dependencies, scale)
  for (const tone of ['constructor', '__proto__', 'toString', 'unknown']) {
    assert.equal(renderGraphSvg(layout, graphNodes.map(node => ({ ...node, tone })), graphEdges), blueGraph, tone)
    assert.equal(renderTimelineSvg(rows, bars.map(bar => ({ ...bar, tone })), dependencies, scale), blueTimeline, tone)
  }
  for (const key of ['toString', 'constructor', 'hasOwnProperty']) {
    assert.throws(() => renderGraphSvg(layout, graphNodes, graphEdges, { theme: { [key]: '#123456' } }), { name: 'Error', message: 'Invalid export theme colour: ' + key })
  }
})

test('SVG export theme colours must be CSS colours without external references', () => {
  const layout = layoutLayeredGraph(graphNodes, graphEdges)
  const render = theme => renderGraphSvg(layout, graphNodes, graphEdges, { theme })
  // Forms that computed styles and hand-written themes use.
  for (const colour of [
    '#123', '#123456', '#12345678', 'red', 'Transparent', 'currentColor', 'rgb(1, 2, 3)', 'rgba(1,2,3,.5)', 'rgb(1 2 3 / 50%)',
    'hsl(210 50% 40%)', 'hsla(210, 50%, 40%, 0.5)', 'hwb(210 10% 20%)', 'lab(50% 20 -30)', 'lch(50% 30 200)',
    'oklab(0.5 0.1 -0.1)', 'oklch(0.6 0.1 250 / 0.8)', 'color(srgb 0.1 0.2 0.3)', 'color(display-p3 1 0 0)',
    'color-mix(in srgb, #245e96 20%, transparent)', 'light-dark(#fff, #000)', 'var(--brand, #123456)',
    'rgb(from red r g calc(b + 10))', 'RGB(1, 2, 3)',
  ]) {
    assert.match(render({ edge: colour }), new RegExp('stroke="' + colour.replace(/[()+.]/g, '\\$&') + '"'), colour)
    assert.doesNotThrow(() => render({ tones: { blue: { pale: colour } } }), colour)
  }
  for (const colour of [
    'url(https://evil.example/x.svg#p)', 'URL(#p)', 'red url(#p)', 'rgb(1,2,3) url(x)', 'image(x.png)', 'image-set(x.png 1x)',
    'expression(alert(1))', 'red;stroke:url(#p)', 'red" onload="x', '<b>', 'u\\72l(x)', 'red)', 'rgb(1, 2, 3', 'src(x)',
    'myrgb(1, 2, 3)', 'a-1color(x)', 'element(#p)', 'cross-fade(red, blue)', 'red /* x */',
  ]) {
    assert.throws(() => render({ edge: colour }), { name: 'RangeError', message: /^Invalid export theme colour: edge must be a CSS colour/ }, colour)
    assert.throws(() => render({ tones: { violet: { solid: colour } } }), { name: 'RangeError', message: /violet\.solid/ }, colour)
  }
  // Empty and blank values still fall back to the default.
  assert.equal(render({ edge: '  ', tones: { blue: { pale: '' } } }), render({}))
})

test('escapeXml escapes markup characters and drops characters XML forbids', () => {
  assert.equal(escapeXml('<a href="x">&\'</a>'), '&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;')
  assert.equal(escapeXml('a\u0000b\u0007c\uD800d'), 'abcd')
  assert.equal(escapeXml('tab\tnew\nline 😀'), 'tab\tnew\nline 😀')
})

test('renderTimelineSvg colours marker and now-flag text with the markerInk theme colour', () => {
  const run = theme => renderTimelineSvg(rows, bars, [], scale, { markers: [{ id: 'm', time: 3 * hour, label: 'Review' }], now: 4 * hour, theme })
  const flagFills = svg => [...svg.matchAll(/<text [^>]*fill="([^"]+)"[^>]*>(?:Review|Now)</g)].map(match => match[1])
  assert.equal(defaultSvgExportTheme.markerInk, '#ffffff')
  assert.deepEqual(flagFills(run({})), ['#ffffff', '#ffffff'])
  assert.deepEqual(flagFills(run({ markerInk: '#0d1a24' })), ['#0d1a24', '#0d1a24'])
})
