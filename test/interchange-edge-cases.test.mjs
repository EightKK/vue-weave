import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  fromICalendar, fromMsProjectXml, timelineFromCsvTable, timelineFromICalendar, timelineFromMsProject, toICalendar, toMsProjectXml,
} from 'vue-weave/core'

test('MSPDI and iCalendar round start and end to whole seconds and derive the duration from them', () => {
  const xml = toMsProjectXml({ name: 'P', tasks: [{ id: 'a', name: 'A', start: 0, end: 1500 }, { id: 'b', name: 'B', start: 400, end: 1400 }] })
  assert.match(xml, /<Start>1970-01-01T00:00:00<\/Start><Finish>1970-01-01T00:00:02<\/Finish><Duration>PT0H0M2S<\/Duration>/)
  assert.match(xml, /<Start>1970-01-01T00:00:00<\/Start><Finish>1970-01-01T00:00:01<\/Finish><Duration>PT0H0M1S<\/Duration>/)
  assert.match(xml, /<StartDate>1970-01-01T00:00:00<\/StartDate><FinishDate>1970-01-01T00:00:02<\/FinishDate>/)
  const late = toMsProjectXml({ name: 'P', tasks: [{ id: 'a', name: 'A', start: 999, end: 61_000 }] })
  assert.match(late, /<Start>1970-01-01T00:00:01<\/Start><Finish>1970-01-01T00:01:01<\/Finish><Duration>PT0H1M0S<\/Duration>/)

  const ics = events => toICalendar(events, { timestamp: 0 })
  // 500–900 ms rounds to one instant, so no DTEND equal to DTSTART is written.
  const instant = ics([{ id: 'e', summary: 'E', start: 500, end: 900 }])
  assert.match(instant, /DTSTART:19700101T000001Z\r\n/)
  assert.doesNotMatch(instant, /DTEND/)
  const span = ics([{ id: 'e', summary: 'E', start: 400, end: 1600 }])
  assert.match(span, /DTSTART:19700101T000000Z\r\nDTEND:19700101T000002Z\r\n/)
})

test('timelineFromCsvTable resolves header collisions predictably', () => {
  const options = { parseTime: Number }
  // Two custom headers with the same text are rejected.
  assert.throws(
    () => timelineFromCsvTable([['Name', 'Start', 'End'], ['Cut', '0', '5']], { ...options, headers: { row: 'Name', bar: ' name ' } }),
    /columns row and bar have the same header text: name/,
  )
  // A custom header wins over another column's default header, whatever the column order.
  const coded = timelineFromCsvTable([['Row', 'Bar', 'Start', 'End'], ['1', 'Cut', '0', '5']], { ...options, headers: { wbs: 'Row' } })
  assert.deepEqual(coded.rows, [{ id: 'row-1', label: '1' }])
  assert.throws(
    () => timelineFromCsvTable([['Row', 'Bar', 'End'], ['A', 'Cut', '5']], { ...options, headers: { start: 'End' } }),
    /end/i,
  )
  // Distinct custom headers, including swapped ones, still work.
  const swapped = timelineFromCsvTable([['WBS', 'Bar', 'Start', 'End'], ['Line A', 'Cut', '0', '5']], { ...options, headers: { row: 'WBS', wbs: 'Code' } })
  assert.deepEqual(swapped.rows, [{ id: 'row-1', label: 'Line A' }])
})

test('timelineFromCsvTable reads progress only in plain decimal notation', () => {
  const read = progress => timelineFromCsvTable([['Row', 'Bar', 'Start', 'End', 'Progress'], ['A', 'Cut', '0', '5', progress]], { parseTime: Number }).bars[0].progress
  assert.equal(read('0.25'), 0.25)
  assert.equal(read(' 1 '), 1)
  assert.equal(read('.5'), 0.5)
  assert.equal(read('1.'), 1)
  assert.equal(read('+0.5'), 0.5)
  assert.equal(read('0'), 0)
  for (const text of ['0x1', '0b1', '0o1', '1e0', '5e-1', 'Infinity', '-0', '1.5', '0.5.1', '½']) {
    assert.throws(() => read(text), /Progress must be a number from 0 to 1 on CSV line 2/, text)
  }
})

test('timelineFromCsvTable orders WBS parts beyond 2^53 exactly', () => {
  const big = '9007199254740992', bigger = '9007199254740993'
  const table = [['WBS', 'Bar', 'Start', 'End'], ['1.' + bigger, 'b', '0', '1'], ['1.' + big, 'a', '0', '1'], ['1.10', 'c', '0', '1'], ['1.9', 'd', '0', '1']]
  const { rows } = timelineFromCsvTable(table, { parseTime: Number })
  assert.deepEqual(rows.map(row => row.id), ['row-1', 'row-1.9', 'row-1.10', 'row-1.' + big, 'row-1.' + bigger])
})

test('interchange exports reject a missing required name or summary', () => {
  assert.throws(() => toMsProjectXml({ name: 'P', tasks: [{ id: 'a', start: 0, end: 1 }] }), /^Error: The name of task a is missing$/)
  assert.throws(() => toMsProjectXml({ tasks: [] }), /The project name is missing/)
  assert.throws(() => toICalendar([{ id: 'e', start: 0, end: 1 }], { timestamp: 0 }), /The summary of event e is missing/)
  assert.throws(() => toICalendar([{ id: 'e', summary: null, start: 0, end: 1 }], { timestamp: 0 }), /summary of event e is missing/)
  assert.match(toMsProjectXml({ name: '', tasks: [{ id: 'a', name: '', start: 0, end: 1000 }] }), /<Name><\/Name>/)
  assert.match(toICalendar([{ id: 'e', summary: '', start: 0, end: 1000 }], { timestamp: 0 }), /SUMMARY:\r\n/)
})

test('fromICalendar reports a DURATION whose end is beyond the range of Date instead of returning an invalid time', () => {
  const ics = duration => 'BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:a\r\nDTSTART:20260101T000000Z\r\n'
    + `DURATION:${duration}\r\nSUMMARY:A\r\nEND:VEVENT\r\nEND:VCALENDAR\r\n`
  for (const duration of ['P99999999W', 'PT' + '9'.repeat(400) + 'S']) {
    const { events, warnings } = fromICalendar(ics(duration))
    assert.equal(events[0].end, events[0].start, duration)
    assert.deepEqual(warnings.map(warning => warning.code), ['invalid-value'])
    assert.doesNotThrow(() => timelineFromICalendar(events))
  }
})

test('fromMsProjectXml leaves out durations and lags that overflow, and rejects impossible zone offsets', () => {
  const big = '9'.repeat(400)
  const xml = '<Project><Name>P</Name><Tasks>'
    + `<Task><UID>1</UID><Name>A</Name><Start>2026-01-01T08:00:00</Start><Finish>2026-01-02T08:00:00</Finish><Duration>PT${big}H</Duration></Task>`
    + '<Task><UID>2</UID><Name>B</Name><Start>2026-01-01T08:00:00</Start><Finish>2026-01-02T08:00:00</Finish>'
    + `<PredecessorLink><PredecessorUID>1</PredecessorUID><Type>1</Type><LinkLag>${big}</LinkLag><LagFormat>4</LagFormat></PredecessorLink></Task>`
    + '<Task><UID>3</UID><Name>C</Name><Start>2026-01-01T08:00:00+99:99</Start><Finish>2026-01-02T08:00:00</Finish></Task>'
    + '</Tasks></Project>'
  const imported = fromMsProjectXml(xml)
  assert.equal(imported.tasks[0].duration, undefined)
  assert.deepEqual(imported.dependencies, [{ from: '1', to: '2', type: 'FS' }])
  assert.deepEqual(imported.tasks.map(task => task.id), ['1', '2'])
  assert.deepEqual(imported.warnings.map(warning => [warning.code, warning.taskId]), [
    ['invalid-value', '1'], ['skipped-task', '3'], ['invalid-value', '2'],
  ])
  assert.doesNotThrow(() => toMsProjectXml(imported))
  assert.doesNotThrow(() => timelineFromMsProject(imported))
})
