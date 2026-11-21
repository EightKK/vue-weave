import assert from 'node:assert/strict'
import { test } from 'node:test'
import { timelineCsvTable, toCsv, toICalendar, toMsProjectXml } from '@eightkk/vue-weave/core'

const hour = 3_600_000

/** A minimal XML well-formedness check: balanced elements and no raw ampersands. */
function assertWellFormed(xml) {
  const stack = []
  for (const [, closing, name, selfClosing] of xml.replace(/^<\?xml[^>]*\?>/, '').matchAll(/<(\/?)([\w:]+)[^>]*?(\/?)>/g)) {
    if (selfClosing) continue
    if (closing) assert.equal(stack.pop(), name)
    else stack.push(name)
  }
  assert.deepEqual(stack, [])
  assert.doesNotMatch(xml, /&(?!amp;|lt;|gt;|quot;|apos;)/)
}

test('toMsProjectXml writes an MSPDI project with outline, milestones, links and escaping', () => {
  const xml = toMsProjectXml({
    name: 'Plant & "line" <2>',
    tasks: [
      { id: 'phase', name: 'Phase 1', start: 0, end: 4 * hour, outlineLevel: 1 },
      { id: 'cut', name: 'Cut <A>', start: 0, end: 3 * hour, outlineLevel: 2, percentComplete: 50.4 },
      { id: 'ship', name: 'Ship', start: 4 * hour, end: 4 * hour, outlineLevel: 2 },
      { id: 'next', name: 'Next', start: 5 * hour, end: 6.5 * hour },
    ],
    dependencies: [
      { from: 'cut', to: 'ship' }, { from: 'cut', to: 'next', type: 'SS', lag: 2 * hour }, { from: 'ship', to: 'next', type: 'FF' },
      { from: 'phase', to: 'next', type: 'SF', lag: -90_000 },
    ],
  }, { utcOffsetMinutes: 540 })
  assertWellFormed(xml)
  assert.match(xml, /^<\?xml version="1.0" encoding="UTF-8" standalone="yes"\?>\n<Project xmlns="http:\/\/schemas.microsoft.com\/project">/)
  assert.match(xml, /<Name>Plant &amp; &quot;line&quot; &lt;2&gt;<\/Name>/)
  assert.match(xml, /<StartDate>1970-01-01T09:00:00<\/StartDate><FinishDate>1970-01-01T15:30:00<\/FinishDate>/)
  const tasks = xml.match(/<Task>.*?<\/Task>/g)
  assert.equal(tasks.length, 4)
  assert.match(tasks[0], /<UID>1<\/UID><ID>1<\/ID><Name>Phase 1<\/Name>.*<OutlineNumber>1<\/OutlineNumber><OutlineLevel>1<\/OutlineLevel>.*<Summary>1<\/Summary>/)
  assert.match(tasks[1], /<Name>Cut &lt;A&gt;<\/Name>.*<OutlineNumber>1.1<\/OutlineNumber>.*<Start>1970-01-01T09:00:00<\/Start><Finish>1970-01-01T12:00:00<\/Finish><Duration>PT3H0M0S<\/Duration>.*<Milestone>0<\/Milestone><Summary>0<\/Summary><PercentComplete>50<\/PercentComplete>/)
  assert.match(tasks[2], /<OutlineNumber>1.2<\/OutlineNumber>.*<Duration>PT0H0M0S<\/Duration>.*<Milestone>1<\/Milestone>/)
  assert.match(tasks[2], /<PredecessorLink><PredecessorUID>2<\/PredecessorUID><Type>1<\/Type><CrossProject>0<\/CrossProject><LinkLag>0<\/LinkLag><LagFormat>4<\/LagFormat><\/PredecessorLink>/)
  assert.match(tasks[3], /<OutlineNumber>2<\/OutlineNumber>.*<Duration>PT1H30M0S<\/Duration>/)
  // MSPDI link types: FF 0, FS 1, SF 2, SS 3; the lag is in tenths of a minute.
  const links = [...tasks[3].matchAll(/<PredecessorUID>(\d)<\/PredecessorUID><Type>(\d)<\/Type><CrossProject>0<\/CrossProject><LinkLag>(-?\d+)<\/LinkLag>/g)].map(m => m.slice(1))
  assert.deepEqual(links, [['2', '3', '1200'], ['3', '0', '0'], ['1', '2', '-15']])
})

test('toMsProjectXml validates tasks, outline levels and dependencies', () => {
  const task = { id: 't', name: 'T', start: 0, end: hour }
  assert.throws(() => toMsProjectXml({ name: 'P', tasks: [task, task] }), { name: 'Error', message: 'Duplicate task ID: t' })
  assert.throws(() => toMsProjectXml({ name: 'P', tasks: [{ ...task, end: -1 }] }), RangeError)
  assert.throws(() => toMsProjectXml({ name: 'P', tasks: [{ ...task, start: Number.NaN }] }), RangeError)
  assert.throws(() => toMsProjectXml({ name: 'P', tasks: [{ ...task, outlineLevel: 2 }] }), RangeError)
  assert.throws(() => toMsProjectXml({ name: 'P', tasks: [{ ...task, percentComplete: 101 }] }), RangeError)
  assert.throws(() => toMsProjectXml({ name: 'P', tasks: [task], dependencies: [{ from: 't', to: 'x' }] }), { name: 'Error', message: /Unknown dependency/ })
  const other = { id: 'u', name: 'U', start: hour, end: 2 * hour }
  assert.throws(() => toMsProjectXml({ name: 'P', tasks: [task, other], dependencies: [{ from: 't', to: 'u', type: 'XX' }] }), {
    name: 'Error', message: 'Invalid dependency type: XX',
  })
  assert.throws(() => toMsProjectXml({ name: 'P', tasks: [task, other], dependencies: [{ from: 't', to: 'u', lag: Infinity }] }), RangeError)
  assertWellFormed(toMsProjectXml({ name: 'Empty', tasks: [] }))
})

test('toMsProjectXml rejects a task that is its own predecessor', () => {
  const tasks = [{ id: 't', name: 'T', start: 0, end: hour }, { id: 'u', name: 'U', start: hour, end: 2 * hour }]
  for (const type of ['FS', 'SS', 'FF', 'SF']) {
    assert.throws(() => toMsProjectXml({ name: 'P', tasks, dependencies: [{ from: 't', to: 'u' }, { from: 'u', to: 'u', type }] }), {
      name: 'Error', message: 'Dependency u → u links task u to itself',
    })
  }
})

test('toMsProjectXml rejects inherited property names as dependency types', () => {
  const tasks = [{ id: 't', name: 'T', start: 0, end: hour }, { id: 'u', name: 'U', start: hour, end: 2 * hour }]
  for (const type of ['toString', 'constructor', '__proto__', 'valueOf']) {
    assert.throws(() => toMsProjectXml({ name: 'P', tasks, dependencies: [{ from: 't', to: 'u', type }] }), {
      name: 'Error', message: 'Invalid dependency type: ' + type,
    })
  }
})

test('toICalendar writes CRLF lines, UTC times, escaped text and folds at 75 octets', () => {
  const description = 'Line one; with, commas\\and a backslash\nLine two — ' + 'é'.repeat(60) + ' 🚀'.repeat(10)
  const text = toICalendar([
    { id: 'cut@example.com', summary: 'Cut, order A', start: Date.UTC(2026, 10, 9, 8), end: Date.UTC(2026, 10, 9, 11, 30), description },
    { id: 'ship@example.com', summary: 'Ship', start: Date.UTC(2026, 10, 10, 9), end: Date.UTC(2026, 10, 10, 9) },
  ], { productId: '-//Example//Plan//EN', calendarName: 'Plant; plan', timestamp: Date.UTC(2026, 10, 1) })
  assert.ok(text.endsWith('\r\n'))
  assert.doesNotMatch(text.replace(/\r\n/g, ''), /[\r\n]/)
  const lines = text.slice(0, -2).split('\r\n')
  for (const line of lines) assert.ok(new TextEncoder().encode(line).length <= 75, line)
  const unfolded = text.replace(/\r\n /g, '').slice(0, -2).split('\r\n')
  assert.deepEqual(unfolded.slice(0, 6), [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Example//Plan//EN', 'CALSCALE:GREGORIAN', 'NAME:Plant\\; plan', 'X-WR-CALNAME:Plant\\; plan',
  ])
  assert.deepEqual(unfolded.slice(6, 12), [
    'BEGIN:VEVENT', 'UID:cut@example.com', 'DTSTAMP:20261101T000000Z', 'DTSTART:20261109T080000Z', 'DTEND:20261109T113000Z', 'SUMMARY:Cut\\, order A',
  ])
  assert.equal(unfolded[12], 'DESCRIPTION:' + description.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n'))
  // A zero-length event has no DTEND.
  assert.deepEqual(unfolded.slice(14), [
    'BEGIN:VEVENT', 'UID:ship@example.com', 'DTSTAMP:20261101T000000Z', 'DTSTART:20261110T090000Z', 'SUMMARY:Ship', 'END:VEVENT', 'END:VCALENDAR',
  ])
  // Folding never splits a character.
  assert.doesNotMatch(text, /\uFFFD/)
  assert.equal(toICalendar([], { timestamp: 0 }), 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//vue-weave//Timeline export//EN\r\nCALSCALE:GREGORIAN\r\nEND:VCALENDAR\r\n')
  assert.throws(() => toICalendar([{ id: 'a', summary: 'A', start: 2, end: 1 }], { timestamp: 0 }), RangeError)
  assert.throws(() => toICalendar([{ id: 'a', summary: 'A', start: 0, end: 1 }, { id: 'a', summary: 'B', start: 0, end: 1 }], { timestamp: 0 }), { name: 'Error', message: 'Duplicate event ID: a' })
  assert.throws(() => toICalendar([], { timestamp: Number.NaN }), RangeError)
})

test('toCsv quotes fields per RFC 4180 and timelineCsvTable lists bars in row order', () => {
  assert.equal(toCsv([['a', 'b,c', 'say "hi"', 'line\nbreak', 3, undefined, 0.5], []]), 'a,"b,c","say ""hi""","line\nbreak",3,,0.5\r\n\r\n')
  assert.equal(toCsv([]), '')
  assert.throws(() => toCsv([[Number.NaN]]), RangeError)
  const rows = [{ id: 'web', label: 'Web', parentId: 'team' }, { id: 'team', label: 'Team, core' }]
  const bars = [
    { id: 'b2', rowId: 'web', label: 'UI', start: hour, end: 2 * hour },
    { id: 'b1', rowId: 'team', label: 'Plan', start: 0, end: hour, progress: 0.25 },
  ]
  const table = timelineCsvTable(rows, bars)
  assert.deepEqual(table, [
    ['Row', 'WBS', 'Bar', 'Start', 'End', 'Progress'],
    ['Team, core', '1', 'Plan', '1970-01-01T00:00:00.000Z', '1970-01-01T01:00:00.000Z', 0.25],
    ['Web', '1.1', 'UI', '1970-01-01T01:00:00.000Z', '1970-01-01T02:00:00.000Z', undefined],
  ])
  assert.equal(toCsv(timelineCsvTable(rows, bars, { columns: ['wbs', 'bar', 'progress'], headers: { bar: 'Task' }, formatTime: String })),
    'WBS,Task,Progress\r\n1,Plan,0.25\r\n1.1,UI,\r\n')
  assert.throws(() => timelineCsvTable(rows, [{ ...bars[0], rowId: 'missing' }]), /Unknown row/)
  assert.throws(() => timelineCsvTable(rows, bars, { columns: ['nope'] }), /Unknown CSV column/)
})
