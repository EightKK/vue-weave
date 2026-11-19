import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { GanttChart, NetworkGraph, editTimeRange } from 'vue-weave'

// The prop checks of the components follow the core's rules: RangeError for invalid numbers and geometry (and unknown
// values of a string option), Error for bad references, invalid or duplicate IDs and cycles. Component-owned ID checks
// use the shared texts `Invalid <kind> ID: <value>` and `Duplicate <kind> ID: <id>`, where an ID is a non-empty string.

const hour = 3_600_000
const ganttBase = { rows: [{ id: 'r', label: 'Row' }], bars: [{ id: 'b', rowId: 'r', label: 'Bar', start: 0, end: hour }], range: { start: 0, end: 8 * hour } }
const column = (id, width = 40) => ({ id, label: 'C', width, value: () => '' })
const preset = (id, pixelsPerUnit = 1 / hour) => ({ id, label: 'P', pixelsPerUnit })
const marker = (id, time = hour) => ({ id, label: 'M', time })
const band = (start, end) => ({ start, end, label: 'X' })
const loadRow = id => ({ id, label: 'L' })
const segment = { resourceId: 'x', start: 0, end: 1, load: 1, capacity: 1 }

// In check order. The last rows have several invalid props: the check that runs first wins.
const ganttCases = [
  ['duplicate bar (core)', { bars: [ganttBase.bars[0], ganttBase.bars[0]] }, Error, 'Duplicate bar ID: b'],
  ['numeric row ID (core)', { rows: [{ id: 1, label: 'Row' }], bars: [] }, Error, 'Invalid row ID: 1'],
  ['empty zoom preset ID', { zoomPresets: [preset('')] }, Error, 'Invalid zoom preset ID: ""'],
  ['numeric zoom preset ID', { zoomPresets: [preset(5)] }, Error, 'Invalid zoom preset ID: 5'],
  ['object zoom preset ID', { zoomPresets: [preset({})] }, Error, 'Invalid zoom preset ID: object'],
  ['duplicate zoom preset ID', { zoomPresets: [preset('p'), preset('p')] }, Error, 'Duplicate zoom preset ID: p'],
  ['zoom preset pixelsPerUnit', { zoomPresets: [preset('p', 0)] }, RangeError, 'Invalid zoom preset pixelsPerUnit: p'],
  ['unknown zoomPreset', { zoomPresets: [preset('p')], zoomPreset: 'q' }, Error, 'Unknown zoom preset: q'],
  ['inverted range (core)', { range: { start: 5, end: 1 } }, RangeError, 'A range must have finite ordered endpoints'],
  ['pixelsPerUnit (core)', { pixelsPerUnit: 0 }, RangeError, 'pixelsPerUnit must be finite and positive'],
  ['inverted editBounds (core)', { editBounds: { start: 5, end: 1 } }, RangeError, 'A range must have finite ordered endpoints'],
  ['rowHeight', { rowHeight: 10 }, RangeError, 'rowHeight is too small for laneCount'],
  ['snap', { snap: 0 }, RangeError, 'snap must be finite and positive'],
  ['minDuration', { minDuration: -1 }, RangeError, 'minDuration must be finite and positive'],
  ['non-finite snap', { snap: Infinity }, RangeError, 'snap must be finite and positive'],
  ['non-finite minDuration', { minDuration: Number.NaN }, RangeError, 'minDuration must be finite and positive'],
  ['zoom preset snap', { zoomPresets: [{ ...preset('p'), snap: 0 }], zoomPreset: 'p' }, RangeError, 'snap must be finite and positive'],
  ['tickSteps', { tickSteps: [2, 1] }, RangeError, 'tickSteps must be positive and ascending'],
  ['scale width', { scale: { width: 0, toX: t => t, toTime: x => x } }, RangeError, 'Invalid time scale width'],
  ['now', { now: Number.NaN }, RangeError, 'now must be finite'],
  ['nonWorkingPeriods (core)', { nonWorkingPeriods: [{ start: 2, end: 1 }] }, RangeError, 'nonWorkingPeriods must have finite endpoints with start < end'],
  ['progressStep', { progressStep: 2 }, RangeError, 'progressStep must be greater than 0 and at most 1'],
  ['tooltipDelay', { tooltipDelay: -1 }, RangeError, 'tooltipDelay must be finite and nonnegative'],
  ['dependencyStyle', { dependencyStyle: 'zigzag' }, RangeError, 'Unknown dependencyStyle: zigzag'],
  ['createDuration', { createDuration: 0 }, RangeError, 'createDuration must be finite and positive'],
  ['statusDate', { statusDate: Infinity }, RangeError, 'statusDate must be finite'],
  ['labelWidth', { labelWidth: 0 }, RangeError, 'labelWidth must be finite and positive'],
  ['minColumnWidth', { minColumnWidth: Number.NaN }, RangeError, 'minColumnWidth must be finite and positive'],
  ['maxColumnWidth', { minColumnWidth: 50, maxColumnWidth: 40 }, RangeError, 'maxColumnWidth must be finite and at least minColumnWidth'],
  ['reserved column ID', { columnsResizable: true, columns: [column('$label')] }, Error, 'The column ID is reserved for the row label column: $label'],
  ['empty column ID', { columns: [column('')] }, Error, 'Invalid column ID: ""'],
  ['numeric column ID', { columns: [column(7)] }, Error, 'Invalid column ID: 7'],
  ['duplicate column ID', { columns: [column('c'), column('c')] }, Error, 'Duplicate column ID: c'],
  ['column width', { columns: [column('c', 0)] }, RangeError, 'Invalid timeline column width: c'],
  ['overlapping header bands', { headerBands: [[band(0, 4 * hour), band(2 * hour, 6 * hour)]] }, RangeError, 'Timeline bands must be finite, ordered and nonoverlapping'],
  ['non-finite header band', { headerBands: [[band(Number.NaN, hour)]] }, RangeError, 'Timeline bands must be finite, ordered and nonoverlapping'],
  ['zoom preset header bands', { zoomPresets: [{ ...preset('p'), headerBands: [[band(hour, hour)]] }], zoomPreset: 'p' }, RangeError, 'Timeline bands must be finite, ordered and nonoverlapping'],
  ['empty marker ID', { markers: [marker('')] }, Error, 'Invalid marker ID: ""'],
  ['numeric marker ID', { markers: [marker(3)] }, Error, 'Invalid marker ID: 3'],
  ['boolean marker ID', { markers: [marker(true)] }, Error, 'Invalid marker ID: true'],
  ['duplicate marker ID', { markers: [marker('m'), marker('m')] }, Error, 'Duplicate marker ID: m'],
  ['marker time', { markers: [marker('n', Number.NaN)] }, RangeError, 'Invalid timeline marker: n'],
  ['numeric marker range ID (core)', { markerRanges: [{ id: 4, label: 'R', start: 0, end: 1 }] }, Error, 'Invalid marker range ID: 4'],
  ['duplicate marker range ID (core)', { markerRanges: [{ id: 'x', label: 'R', start: 0, end: 1 }, { id: 'x', label: 'R', start: 0, end: 1 }] }, Error, 'Duplicate marker range ID: x'],
  ['inverted marker range (core)', { markerRanges: [{ id: 'x', label: 'R', start: 2, end: 1 }] }, RangeError, 'A marker range must have finite endpoints with start < end: x'],
  ['marker range row (core)', { markerRanges: [{ id: 'x', label: 'R', start: 0, end: 1, rowIds: ['zz'] }] }, Error, 'Unknown row for marker range x: zz'],
  ['duplicate baselineIds (core)', { baselineIds: ['p', 'p'] }, Error, 'Duplicate baseline set ID: p (baselineIds)'],
  ['loadSegments without loadRows', { loadSegments: [segment] }, Error, 'loadSegments require loadRows'],
  ['empty load row ID', { loadRows: [loadRow('')] }, Error, 'Invalid load row ID: ""'],
  ['numeric load row ID', { loadRows: [loadRow(9)] }, Error, 'Invalid load row ID: 9'],
  ['duplicate load row ID', { loadRows: [loadRow('l'), loadRow('l')] }, Error, 'Duplicate load row ID: l'],
  ['loadRowHeight', { loadRows: [loadRow('l')], loadRowHeight: 10 }, RangeError, 'loadRowHeight must be at least 16'],
  ['zoom preset before marker', { zoomPresets: [preset('')], markers: [marker('')] }, Error, 'Invalid zoom preset ID: ""'],
  ['column before marker', { markers: [marker('')], columns: [column('')] }, Error, 'Invalid column ID: ""'],
  ['header bands before marker', { headerBands: [[band(2, 1)]], markers: [marker('')] }, RangeError, 'Timeline bands must be finite, ordered and nonoverlapping'],
  ['marker before load row', { loadRows: [loadRow('')], markers: [marker('m', Number.NaN)] }, RangeError, 'Invalid timeline marker: m'],
  ['rowHeight before snap', { rowHeight: 10, snap: 0 }, RangeError, 'rowHeight is too small for laneCount'],
  ['snap before minDuration', { snap: 0, minDuration: 0 }, RangeError, 'snap must be finite and positive'],
  ['minDuration before tickSteps', { minDuration: 0, tickSteps: [] }, RangeError, 'minDuration must be finite and positive'],
]

test('GanttChart prop checks report one class and message each through validation-error', async () => {
  for (const [name, props, type, message] of ganttCases) {
    const reported = [], handled = []
    const app = createSSRApp({ render: () => h(GanttChart, { ...ganttBase, ...props, onValidationError: error => reported.push(error) }) })
    app.config.errorHandler = error => handled.push(error)
    const html = await renderToString(app)
    assert.equal(reported.length, 1, name)
    assert.equal(reported[0].constructor, type, name)
    assert.equal(reported[0].message, message, name)
    // The same error is rethrown to Vue's error handling, and nothing of the invalid data is rendered.
    assert.deepEqual(handled, reported, name)
    assert.match(html, /No rows to display/, name)
    // Without an error handler, server rendering rejects with that error.
    await assert.rejects(renderToString(createSSRApp({ render: () => h(GanttChart, { ...ganttBase, ...props }) })), { name: type.name, message }, name)
  }
})

test('GanttChart accepts non-empty string IDs for markers, columns, zoom presets and load rows', async () => {
  const html = await renderToString(createSSRApp({ render: () => h(GanttChart, {
    ...ganttBase, markers: [marker('0')], columns: [column(' ')], zoomPresets: [preset('5')], zoomPreset: '5',
    loadRows: [loadRow('l')], onValidationError: error => assert.fail(error.message),
  }) }))
  assert.match(html, /vw-gantt-bar/)
})

const nodes = [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }]
const edges = [{ id: 'ab', from: 'a', to: 'b' }]
const custom = change => (n, e) => {
  const layout = {
    width: 300, height: 100, boxes: new Map(n.map((node, i) => [node.id, { x: i * 150, y: 0, width: 100, height: 40 }])),
    paths: new Map(e.map(edge => [edge.id, 'M 0 0 L 1 1'])),
  }
  change(layout)
  return layout
}
const group = (id, nodeIds, parentId) => ({ id, label: 'G', nodeIds, parentId })
const lane = id => ({ id, label: 'L', x: 0, y: 0, width: 10, height: 10, header: { x: 0, y: 0, width: 0, height: 0 } })

const graphCases = [
  ['custom layout size', { layout: custom(layout => { layout.width = 0 }) }, RangeError, 'A custom layout must return positive finite dimensions'],
  ['missing custom layout box', { layout: custom(layout => layout.boxes.delete('b')) }, Error, 'Missing layout box: b'],
  ['invalid custom layout box', { layout: custom(layout => layout.boxes.set('b', { x: 0, y: 0, width: -1, height: 4 })) }, RangeError, 'Invalid layout box: b'],
  ['non-finite custom layout box', { layout: custom(layout => layout.boxes.set('b', { x: Number.NaN, y: 0, width: 1, height: 4 })) }, RangeError, 'Invalid layout box: b'],
  ['missing custom layout path', { layout: custom(layout => layout.paths.delete('ab')) }, Error, 'Missing layout path: ab'],
  ['routingPolicy', { routingPolicy: 'keep' }, RangeError, 'Unknown routing policy: keep'],
  ['parallelEdgeSpacing', { parallelEdgeSpacing: 0 }, RangeError, 'parallelEdgeSpacing must be a positive finite number of chart units'],
  ['numeric node ID (core)', { nodes: [nodes[0], { id: 5, label: 'B' }], edges: [] }, Error, 'Invalid graph node ID: 5'],
  ['duplicate node ID (core)', { nodes: [nodes[0], nodes[0]], edges: [] }, Error, 'Duplicate graph node ID: a'],
  ['numeric edge ID (core)', { edges: [{ ...edges[0], id: 7 }] }, Error, 'Invalid graph edge ID: 7'],
  ['duplicate edge ID (core)', { edges: [edges[0], edges[0]] }, Error, 'Duplicate graph edge ID: ab'],
  ['unknown edge end (core)', { edges: [{ ...edges[0], to: 'zz' }] }, Error, 'Unknown node in graph edge ab: zz'],
  ['numeric port ID (core)', { nodes: [{ ...nodes[0], ports: [{ id: 3, side: 'right' }] }, nodes[1]] }, Error, 'Invalid port ID: 3 (graph node a)'],
  ['duplicate port ID (core)', { nodes: [{ ...nodes[0], ports: [{ id: 'p', side: 'right' }, { id: 'p', side: 'left' }] }, nodes[1]] }, Error, 'Duplicate port ID: p (graph node a)'],
  ['unknown edge port (core)', { edges: [{ ...edges[0], fromPort: 'q' }] }, Error, 'Unknown port in graph edge ab: q'],
  ['numeric node ID with a custom layout (core)', { nodes: [nodes[0], { id: 5, label: 'B' }], edges: [], layout: custom(() => {}) }, Error, 'Invalid graph node ID: 5'],
  ['empty group ID', { groups: [group('', ['a'])] }, Error, 'Invalid graph group ID: ""'],
  ['numeric group ID', { groups: [group(5, ['a'])] }, Error, 'Invalid graph group ID: 5'],
  ['duplicate group ID', { groups: [group('g', ['a']), group('g', ['b'])] }, Error, 'Duplicate graph group ID: g'],
  ['unknown group member', { groups: [group('g', ['zz'])] }, Error, 'Unknown node in graph group g: zz'],
  ['repeated group member', { groups: [group('g', ['a']), group('h', ['a'])] }, Error, 'Duplicate group member ID: a (graph group h)'],
  ['unknown parent group', { groups: [group('g', ['a'], 'zz')] }, Error, 'Unknown parent group in graph group g: zz'],
  ['group cycle', { groups: [group('x', ['a'], 'y'), group('y', ['b'], 'x')] }, Error, 'Graph group hierarchy contains a cycle at group: x'],
  ['empty group', { groups: [group('x', [])] }, Error, 'Invalid graph group: x'],
  ['numeric group ID when collapsed', { groups: [group('g', ['a']), group(5, ['b'])], collapsedGroupIds: ['g'] }, Error, 'Invalid graph group ID: 5'],
  ['repeated group member when collapsed', { groups: [group('g', ['a']), group('h', ['a'])], collapsedGroupIds: ['g'] }, Error, 'Duplicate group member ID: a (graph group h)'],
  ['unknown parent group when collapsed', { groups: [group('g', ['a'], 'zz')], collapsedGroupIds: ['g'] }, Error, 'Unknown parent group in graph group g: zz'],
  ['lane ID (core)', { lanes: [lane('')] }, Error, 'Invalid swimlane ID: ""'],
  ['numeric lane ID (core)', { lanes: [lane(2)] }, Error, 'Invalid swimlane ID: 2'],
  ['duplicate lane ID (core)', { lanes: [lane('l'), lane('l')] }, Error, 'Duplicate swimlane ID: l'],
  ['lane geometry (core)', { lanes: [{ ...lane('l'), width: -1 }] }, RangeError, 'NetworkGraph lane l needs finite geometry with nonnegative sizes'],
  ['edgeBands (core)', { edgeBands: new Map([['ab', { width: -1 }]]) }, RangeError, 'NetworkGraph edgeBands: the band width of edge ab must be finite and nonnegative'],
  ['selectionMode', { selectionMode: 'circle' }, RangeError, 'Unknown selection mode: circle'],
  ['snapGrid', { snapGrid: 0 }, RangeError, 'snapGrid must be a positive finite number of chart units'],
  ['backgroundGap', { background: 'dots', backgroundGap: -1 }, RangeError, 'backgroundGap must be a positive finite number of chart units'],
  ['guideThreshold', { guideThreshold: -1 }, RangeError, 'guideThreshold must be a nonnegative finite number of screen pixels'],
  ['background', { background: 'stars' }, RangeError, 'Unknown NetworkGraph background: stars'],
  ['edgeStyle', { edgeStyle: 'zigzag' }, RangeError, 'Unknown edge style: zigzag'],
  ['lodThreshold', { lodThreshold: 4 }, RangeError, 'lodThreshold must be a finite scale greater than 0 and at most 3'],
  ['minNodeSize', { resizable: true, minNodeSize: { width: 0, height: 3 } }, RangeError, 'minNodeSize must have a finite positive width and height'],
  ['tooltipDelay', { tooltipDelay: -1 }, RangeError, 'tooltipDelay must be a nonnegative finite number of milliseconds'],
  ['snapGrid before background', { snapGrid: 0, background: 'stars' }, RangeError, 'snapGrid must be a positive finite number of chart units'],
  ['custom layout before groups', { layout: custom(layout => { layout.height = Infinity }), groups: [group('', ['a'])] }, RangeError, 'A custom layout must return positive finite dimensions'],
]

test('NetworkGraph prop checks throw one class and message each while rendering', async () => {
  for (const [name, props, type, message] of graphCases) {
    const app = createSSRApp({ render: () => h(NetworkGraph, { nodes, edges, ...props }) })
    app.config.warnHandler = () => {}
    await assert.rejects(renderToString(app), error => {
      assert.equal(error.constructor, type, name)
      assert.equal(error.message, message, name)
      return true
    }, name)
  }
})

test('GanttChart and editTimeRange report an invalid snap or minDuration with the same texts', async () => {
  const range = { start: 0, end: hour }, bounds = { start: 0, end: 8 * hour }
  for (const [props, args, message] of [
    [{ snap: 0 }, [0, bounds], 'snap must be finite and positive'],
    [{ snap: -1, minDuration: hour }, [-1, bounds, hour], 'snap must be finite and positive'],
    [{ minDuration: 0 }, [hour, bounds, 0], 'minDuration must be finite and positive'],
    [{ minDuration: Infinity }, [hour, bounds, Infinity], 'minDuration must be finite and positive'],
    // Both invalid: snap is checked first.
    [{ snap: Number.NaN, minDuration: -1 }, [Number.NaN, bounds, -1], 'snap must be finite and positive'],
  ]) {
    const reported = []
    const app = createSSRApp({ render: () => h(GanttChart, { ...ganttBase, ...props, onValidationError: error => reported.push(error) }) })
    app.config.errorHandler = () => {}
    await renderToString(app)
    assert.equal(reported[0]?.constructor, RangeError, message)
    assert.equal(reported[0]?.message, message)
    assert.throws(() => editTimeRange(range, 'end', hour, ...args), { name: 'RangeError', message })
  }
  // A non-finite displacement is reported before the snap; minDuration may be smaller than snap.
  assert.throws(() => editTimeRange(range, 'move', Number.NaN, 0, bounds), { name: 'RangeError', message: 'delta must be finite' })
  assert.deepEqual(editTimeRange(range, 'end', -hour, hour, bounds, 1000), { start: 0, end: 1000 })
})

test('NetworkGraph rejects every invalid node, edge, port, group and lane ID with the shared texts', async () => {
  const render = props => {
    const app = createSSRApp({ render: () => h(NetworkGraph, { nodes, edges, ...props }) })
    app.config.warnHandler = () => {}
    return renderToString(app)
  }
  const sites = [
    ['graph node', id => ({ nodes: [nodes[0], { id, label: 'B' }], edges: [] })],
    ['graph edge', id => ({ edges: [{ ...edges[0], id }] })],
    ['port', id => ({ nodes: [{ ...nodes[0], ports: [{ id, side: 'right' }] }, nodes[1]] }), ' (graph node a)'],
    ['graph group', id => ({ groups: [group(id, ['a'])] })],
    ['swimlane', id => ({ lanes: [lane(id)] })],
  ]
  for (const [kind, props, context = ''] of sites) {
    for (const [value, shown] of [[5, '5'], [0, '0'], ['', '""'], [undefined, 'undefined'], [null, 'null'], [{}, 'object']]) {
      await assert.rejects(render(props(value)), { name: 'Error', message: `Invalid ${kind} ID: ${shown}${context}` }, `${kind}: ${shown}`)
    }
  }
  // String IDs that look like numbers are valid.
  const html = await render({ nodes: [{ id: '0', label: 'Zero' }, { id: '5', label: 'Five' }], edges: [{ id: '1', from: '0', to: '5' }], groups: [group('2', ['0'])] })
  assert.match(html, /Zero/)
})
