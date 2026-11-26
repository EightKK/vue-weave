import assert from 'node:assert/strict'
import { test } from 'node:test'
import { applyTimelineSheetEdit, formatSheetText, parseSheetText } from '@eightkk/vue-weave/core'
import { GanttChart } from '@eightkk/vue-weave'
import { renderComponent } from './helpers/ssr.mjs'

test('parseSheetText reads spreadsheet clipboard text and ignores one trailing line break', () => {
  assert.deepEqual(parseSheetText('a\tb\r\nc\td\r\n'), [['a', 'b'], ['c', 'd']])
  assert.deepEqual(parseSheetText('a\nb\rc'), [['a'], ['b'], ['c']])
  assert.deepEqual(parseSheetText(''), [['']])
  assert.deepEqual(parseSheetText('\r\n'), [['']])
  assert.deepEqual(parseSheetText('﻿x\t'), [['x', '']])
  assert.deepEqual(parseSheetText('a\r\n\r\n'), [['a'], ['']])
})

test('parseSheetText reads quoted cells only when a separator follows the closing quote', () => {
  assert.deepEqual(parseSheetText('"line 1\nline 2"\t"say ""hi"""'), [['line 1\nline 2', 'say "hi"']])
  // Quotes that do not form a quoted cell are text, as spreadsheet applications paste them.
  assert.deepEqual(parseSheetText('5" bolt\t"A" grade'), [['5" bolt', '"A" grade']])
  assert.deepEqual(parseSheetText('"unterminated\tx'), [['"unterminated', 'x']])
  assert.deepEqual(parseSheetText('""'), [['']])
})

test('formatSheetText quotes cells with tabs, line breaks or quotes and round-trips through parseSheetText', () => {
  const records = [['plain', 'tab\there', 'quote "q"'], ['multi\r\nline', '', '"lead']]
  const text = formatSheetText(records)
  assert.equal(text, 'plain\t"tab\there"\t"quote ""q"""\r\n"multi\r\nline"\t\t"""lead"')
  assert.deepEqual(parseSheetText(text), records)
})

test('formatSheetText keeps an empty last record of one cell, which a single trailing line break would lose', () => {
  // Two lines of one column whose last cell is empty: without the extra line break, a paste read "5" as one value.
  assert.equal(formatSheetText([['5'], ['']]), '5\r\n\r\n')
  assert.deepEqual(parseSheetText(formatSheetText([['5'], ['']])), [['5'], ['']])
  assert.deepEqual(parseSheetText(formatSheetText([['5'], [''], ['']])), [['5'], [''], ['']])
  assert.equal(formatSheetText([['']]), '')
  assert.equal(formatSheetText([['5', '']]), '5\t')
  assert.equal(formatSheetText([['5'], ['', '']]), '5\r\n\t')
})

test('applyTimelineSheetEdit applies field then cell edits in one step without mutating the rows', () => {
  const rows = Object.freeze([
    Object.freeze({ id: 'a', label: 'A', hours: 1, owner: 'x' }),
    Object.freeze({ id: 'b', label: 'B', hours: 2, owner: 'y' }),
    Object.freeze({ id: 'c', label: 'C', hours: 3, owner: 'z' }),
  ])
  const result = applyTimelineSheetEdit(rows, {
    fieldEdits: [
      { rowId: 'b', columnId: 'h', fieldId: 'hours', before: 2, after: 5, source: 'keyboard' },
      { rowId: 'b', columnId: 'h', fieldId: 'hours', before: 5, after: 6, source: 'keyboard' },
    ],
    cellEdits: [{ rowId: 'a', columnId: 'owner', before: 'x', after: 'w' }],
  }, {
    field: (row, edit) => ({ ...row, [edit.fieldId]: edit.after }),
    cell: (row, edit) => ({ ...row, [edit.columnId]: edit.after }),
  })
  assert.deepEqual(result.map(row => [row.hours, row.owner]), [[1, 'w'], [6, 'y'], [3, 'z']])
  assert.equal(result[2], rows[2], 'unchanged rows keep their identity')
  assert.equal(rows[1].hours, 2)
})

test('applyTimelineSheetEdit validates references and appliers before applying anything', () => {
  const rows = [{ id: 'a', label: 'A' }]
  const field = (row) => row
  const edit = { rowId: 'x', columnId: 'c', fieldId: 'f', before: 1, after: 2, source: 'pointer' }
  assert.throws(() => applyTimelineSheetEdit(rows, { fieldEdits: [edit] }, { field }), { message: 'Unknown row in sheet edit: x' })
  assert.throws(() => applyTimelineSheetEdit(rows, { fieldEdits: [{ ...edit, rowId: 'a' }] }, {}), /needs a field applier/)
  assert.throws(() => applyTimelineSheetEdit(rows, { cellEdits: [{ rowId: 'a', columnId: 'c', before: '', after: 'v' }] }, {}), /needs a cell applier/)
  assert.throws(() => applyTimelineSheetEdit([...rows, { id: 'a', label: 'again' }], {}, {}), { message: 'Duplicate row ID: a' })
  assert.throws(() => applyTimelineSheetEdit([{ id: '', label: '' }], {}, {}), { message: 'Invalid row ID: ""' })
  assert.throws(() => applyTimelineSheetEdit(rows, { fieldEdits: [{ ...edit, rowId: 'a' }] }, { field: row => ({ ...row, id: 'b' }) }),
    /must keep the row ID: a/)
  assert.deepEqual(applyTimelineSheetEdit(rows, {}, {}), rows)
})

test('a spreadsheet GanttChart renders on the server with one tabbable cell and its key hint', async () => {
  const columns = [
    { id: 'owner', label: 'Owner', width: 80, editable: true, value: row => row.owner },
    { id: 'code', label: 'Code', width: 60, value: row => row.id.toUpperCase() },
  ]
  const html = await renderComponent(GanttChart, {
    spreadsheet: true, columns, range: { start: 0, end: 10 }, bars: [],
    rows: [{ id: 'a', label: 'Row A', owner: 'Ann' }, { id: 'b', label: 'Row B', owner: 'Ben' }],
  })
  assert.equal(html.match(/class="vw-sheet-cell[^"]*"/g)?.length, 4)
  assert.equal(html.match(/class="vw-sheet-cell[^>]*tabindex="0"/g)?.length, 1)
  assert.match(html, /aria-label="Row A · Owner Ann"/)
  assert.match(html, /Arrow keys move, Shift extends the selection/)
})
