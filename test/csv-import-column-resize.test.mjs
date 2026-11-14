import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { parseCsv, timelineCsvTable, timelineFromCsvTable, timelineLabelColumnId, toCsv } from 'vue-weave/core'
import { GanttChart } from 'vue-weave'

const hour = 3_600_000
const parseTime = text => Date.parse(text)

test('parseCsv reads RFC 4180 quoting, line breaks and delimiters', () => {
  assert.deepEqual(parseCsv(''), [])
  assert.deepEqual(parseCsv('a,b\r\nc,d'), [['a', 'b'], ['c', 'd']])
  assert.deepEqual(parseCsv('a,b\r\nc,d\r\n'), [['a', 'b'], ['c', 'd']])
  assert.deepEqual(parseCsv('a,b\nc,d\n'), [['a', 'b'], ['c', 'd']])
  assert.deepEqual(parseCsv('a\rb'), [['a'], ['b']])
  assert.deepEqual(parseCsv('﻿Row,Bar\r\n'), [['Row', 'Bar']])
  assert.deepEqual(parseCsv('"a,b","say ""hi""","line\r\nbreak",""\r\n'), [['a,b', 'say "hi"', 'line\r\nbreak', '']])
  assert.deepEqual(parseCsv('a,,\r\n,\r\n\r\nx'), [['a', '', ''], ['', ''], [''], ['x']])
  assert.deepEqual(parseCsv('a,'), [['a', '']])
  // A quote inside an unquoted field is text.
  assert.deepEqual(parseCsv('5" pipe,b'), [['5" pipe', 'b']])
  assert.deepEqual(parseCsv('a;"b;c"\nd;e', { delimiter: ';' }), [['a', 'b;c'], ['d', 'e']])
  assert.deepEqual(parseCsv('a\tb', { delimiter: '\t' }), [['a', 'b']])
})

test('parseCsv reports unterminated quotes and invalid delimiters with their position', () => {
  assert.throws(() => parseCsv('a,b\r\nc,"open\r\nstill open'), { message: /Unterminated quoted CSV field starting at line 2, column 3/ })
  assert.throws(() => parseCsv('"a"x,b'), { message: /after a closing quote at line 1, column 4/ })
  assert.throws(() => parseCsv('"multi\nline"x'), { message: /line 2, column 6/ })
  for (const delimiter of ['', ';;', '"', '\n', '\r']) assert.throws(() => parseCsv('a', { delimiter }), /delimiter/)
})

test('parseCsv is the inverse of toCsv', () => {
  const table = [['Row', 'Bar, quoted', 'x"y'], ['line\nbreak', '', 'z'], ['é', '\r\n', ' padded ']]
  assert.deepEqual(parseCsv(toCsv(table)), table)
})

test('timelineFromCsvTable reverses timelineCsvTable through toCsv and parseCsv', () => {
  const rows = [
    { id: 'team', label: 'Team, core' },
    { id: 'web', label: 'Web "UI"', parentId: 'team' },
    { id: 'api', label: 'API', parentId: 'team' },
    { id: 'qa', label: 'Quality' },
  ]
  const bars = [
    { id: 'b1', rowId: 'team', label: 'Plan', start: 0, end: hour, progress: 0.25 },
    { id: 'b2', rowId: 'web', label: 'Checkout\nUI', start: hour, end: 3 * hour },
    { id: 'b3', rowId: 'web', label: 'Review', start: 3 * hour, end: 3 * hour, progress: 1 },
    { id: 'b4', rowId: 'api', label: 'Billing', start: 2 * hour, end: 4 * hour, progress: 0 },
    { id: 'b5', rowId: 'qa', label: 'Tests', start: 4 * hour, end: 5 * hour },
  ]
  const csv = toCsv(timelineCsvTable(rows, bars))
  const result = timelineFromCsvTable(parseCsv(csv), { parseTime })
  assert.deepEqual(result.rows, [
    { id: 'row-1', label: 'Team, core' },
    { id: 'row-1.1', label: 'Web "UI"', parentId: 'row-1' },
    { id: 'row-1.2', label: 'API', parentId: 'row-1' },
    { id: 'row-2', label: 'Quality' },
  ])
  assert.deepEqual(result.bars, [
    { id: 'bar-1', rowId: 'row-1', label: 'Plan', start: 0, end: hour, progress: 0.25 },
    { id: 'bar-2', rowId: 'row-1.1', label: 'Checkout\nUI', start: hour, end: 3 * hour },
    { id: 'bar-3', rowId: 'row-1.1', label: 'Review', start: 3 * hour, end: 3 * hour, progress: 1 },
    { id: 'bar-4', rowId: 'row-1.2', label: 'Billing', start: 2 * hour, end: 4 * hour, progress: 0 },
    { id: 'bar-5', rowId: 'row-2', label: 'Tests', start: 4 * hour, end: 5 * hour },
  ])
  // Exporting the import gives the same text.
  assert.equal(toCsv(timelineCsvTable(result.rows, result.bars)), csv)
})

test('timelineFromCsvTable supports custom headers, column lists, labels without WBS and missing parents', () => {
  const custom = timelineFromCsvTable(parseCsv('Task;Operation;Begin;Finish;Notes\nCut;Line A;0;5;x\nPack;Line B;5;9;\nShip;Line A;9;9;\n\n', { delimiter: ';' }), {
    parseTime: Number, headers: { bar: 'task', row: 'Operation', start: 'Begin', end: 'Finish' },
  })
  assert.deepEqual(custom.rows, [{ id: 'row-1', label: 'Line A' }, { id: 'row-2', label: 'Line B' }])
  assert.deepEqual(custom.bars.map(bar => [bar.rowId, bar.label, bar.start, bar.end]), [
    ['row-1', 'Cut', 0, 5], ['row-2', 'Pack', 5, 9], ['row-1', 'Ship', 9, 9],
  ])
  const listed = timelineFromCsvTable([['ignored', 'x', 'y', 'z', 'skipped'], ['2.1', undefined, 1, 2, 'note']], {
    parseTime: Number, columns: ['wbs', 'bar', 'start', 'end', undefined],
  })
  // The parent code 2 has no record, so it is labelled with its code; 1.x would be numbered first.
  assert.deepEqual(listed.rows, [{ id: 'row-2', label: '2' }, { id: 'row-2.1', label: '2.1', parentId: 'row-2' }])
  assert.deepEqual(listed.bars, [{ id: 'bar-1', rowId: 'row-2.1', label: '', start: 1, end: 2 }])
  const ordered = timelineFromCsvTable([['WBS', 'Row', 'Bar', 'Start', 'End'], ['10', 'Ten', 'a', 0, 1], ['2', 'Two', 'b', 0, 1]], { parseTime: Number })
  assert.deepEqual(ordered.rows.map(row => row.label), ['Two', 'Ten'])
})

test('timelineFromCsvTable names the line of invalid data', () => {
  const header = ['Row', 'WBS', 'Bar', 'Start', 'End', 'Progress']
  const read = (...records) => timelineFromCsvTable([header, ...records], { parseTime })
  const ok = ['A', '1', 'Plan', '2026-11-09T08:00:00Z', '2026-11-09T09:00:00Z', '']
  assert.throws(() => read(ok, ['A', '1', 'Plan', 'soon', '2026-11-09T09:00:00Z', '']), { name: 'RangeError', message: /start time on CSV line 3: soon/ })
  assert.throws(() => read(['A', '1', 'Plan', ok[3], 'later', '']), { name: 'RangeError', message: /end time on CSV line 2/ })
  assert.throws(() => read(ok, ok, ['A', '1', 'Plan', ok[4], ok[3], '']), { name: 'RangeError', message: /CSV line 4 ends before it starts/ })
  assert.throws(() => read(['A', '1', 'Plan', ok[3], ok[4], '1.5']), { name: 'RangeError', message: /Progress .* line 2: 1.5/ })
  assert.throws(() => read(['A', '1', 'Plan', ok[3], ok[4], 'half']), /Progress/)
  assert.throws(() => read(['A', '1.0', 'Plan', ok[3], ok[4], '']), /Invalid WBS code on CSV line 2: 1.0/)
  assert.throws(() => read(['A', '', 'Plan', ok[3], ok[4], '']), /Invalid WBS code on CSV line 2: \(empty\)/)
  assert.throws(() => timelineFromCsvTable([], { parseTime }), /no header/)
  assert.throws(() => timelineFromCsvTable([['Row', 'Bar', 'Start']], { parseTime }), /no End column/)
  assert.throws(() => timelineFromCsvTable([['Bar', 'Start', 'End']], { parseTime }), /Row or WBS/)
  assert.throws(() => timelineFromCsvTable([['Row', 'Row', 'Bar', 'Start', 'End']], { parseTime }), /Repeated CSV column: row/)
  assert.throws(() => timelineFromCsvTable([['a']], { parseTime, columns: ['nope'] }), /Unknown CSV column/)
  assert.throws(() => timelineFromCsvTable([['a']], {}), /parseTime/)
})

const rows = [{ id: 'r1', label: 'Line A' }, { id: 'r2', label: 'Line B' }]
const bars = [{ id: 'b', rowId: 'r1', label: 'Cut', start: 0, end: hour }]
const columns = [{ id: 'owner', label: 'Owner', width: 90, value: () => 'Ana' }]
const render = props => renderToString(createSSRApp({ render: () => h(GanttChart, {
  rows, bars, range: { start: 0, end: 4 * hour }, ...props,
}) }))

test('GanttChart renders no column resize handles without columnsResizable', async () => {
  const plain = await render({ columns })
  assert.doesNotMatch(plain, /vft-column-resize|role="separator"/)
  assert.match(plain, /^<div class="vft-gantt"><div class="vft-gantt-toolbar">/)
  assert.equal(await render({ columns, columnsResizable: false }), plain)
  // labelWidth sets the label column width through the theme variable on the canvas.
  assert.match(await render({ labelWidth: 200 }), /class="vft-gantt-canvas" style="[^"]*--vft-grid-step:80px;--vft-row-label-width:200px;"/)
})

test('GanttChart renders a separator for the label column and each extra column with columnsResizable', async () => {
  const html = await render({ columns, columnsResizable: true, labelWidth: 180, minColumnWidth: 60, maxColumnWidth: 400 })
  const handles = [...html.matchAll(/<div class="vft-column-resize"[^>]*>/g)].map(match => match[0])
  assert.equal(handles.length, 2)
  assert.match(handles[0], /style="left:calc\(var\(--vft-row-label-width\) \+ -8px\);" role="separator" tabindex="0" aria-orientation="vertical" aria-label="Resize column Rows" aria-valuenow="180" aria-valuemin="60" aria-valuemax="400"/)
  assert.match(handles[1], /style="left:calc\(var\(--vft-row-label-width\) \+ 82px\);" role="separator"[^>]* aria-label="Resize column Owner" aria-valuenow="90"/)
  // The separators follow their header cells.
  assert.match(html, /aria-label="Resize column Rows"[^>]*><\/div><div class="vft-extra-column" style="width:90px;">Owner<\/div><div class="vft-column-resize"/)
  const rtl = await render({ columns, columnsResizable: true, dir: 'rtl', labels: { resizeColumn: 'Change width of' } })
  assert.match(rtl, /style="right:calc\(var\(--vft-row-label-width\) \+ 82px\);"[^>]* aria-label="Change width of Owner" aria-valuenow="90" aria-valuemin="48" aria-valuemax="800"/)
  assert.match(rtl, /aria-label="Change width of Rows" aria-valuenow="154"/)
  assert.equal(timelineLabelColumnId, '$label')
})

test('GanttChart validates the column resize props', async () => {
  const errors = []
  const fail = props => render({ ...props, 'onValidationError': error => errors.push(error) }).catch(error => error)
  assert.ok(await fail({ labelWidth: 0 }) instanceof RangeError)
  assert.ok(await fail({ minColumnWidth: Number.NaN }) instanceof RangeError)
  assert.ok(await fail({ minColumnWidth: 50, maxColumnWidth: 40 }) instanceof RangeError)
  const reserved = await fail({ columnsResizable: true, columns: [{ ...columns[0], id: timelineLabelColumnId }] })
  assert.match(reserved.message, /reserved/)
  assert.equal(errors.length, 4)
})
